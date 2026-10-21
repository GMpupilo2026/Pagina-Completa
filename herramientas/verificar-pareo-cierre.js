/* Pareo Integral: que nada se pierda y el cierre del evento
 * (js/pareo/historial.js, js/pareo/evento.js, js/pareo/pagina.js,
 * js/pareo/ver.js, js/tabla-excel.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - el historial de cambios y «Deshacer el último cambio»;
 *   - el aviso de dos pestañas con el mismo torneo;
 *   - el respaldo automático del evento (con un doble de la API de archivos);
 *   - los adjuntos en equipos, tablero por tablero;
 *   - la sanción que cambia el resultado de su mesa;
 *   - las planillas de anotación;
 *   - el cierre del evento y el paquete final en un .zip;
 *   - el ID FIDE que llega con el Elo Nacional (con un doble de la búsqueda);
 *   - en el enlace del evento: la ficha del jugador, el idioma y lo último
 *     que llegó cuando no hay conexión.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-cierre.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const H = require(path.join(RAIZ, "js/pareo/historial.js"));
const TablaExcel = require(path.join(RAIZ, "js/tabla-excel.js"));
const { contestarEtapa } = require("./lib/pareo-etapa");
const P = require("./lib/pareo-pruebas");
const { XLSX, leerTodos, vis, anotar, jugarRondas } = P;

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const xlsx = (filas) => Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas }]));
const dialogo = 'dialog[data-avisos="formulario"][open]';
const confirmar = 'dialog[data-avisos="confirmar"][open]';

/* ==================================================================
   1. Sin navegador
   ================================================================== */
function pruebaSinNavegador() {
  console.log("\n=== El historial de cambios ===");
  const jugadores = ["Ana", "Bea", "Cira", "Dina"].map((n, i) => ({ id: "j" + i, nombre: n }));
  const a = T.nuevo({ sistema: "todos", jugadores });
  T.fijarNumeracion(a);
  const b = JSON.parse(JSON.stringify(a));
  b.rondas.push(T.rondaTodos(b, 0));
  igual("emparejar una ronda", H.describir(a, b).map((x) => x.clave), ["histEmparejada"]);
  const c = JSON.parse(JSON.stringify(b));
  c.rondas[0].mesas[1].r = "=";
  igual("un resultado, con su ronda, su mesa y de qué a qué", H.describir(b, c), [{ clave: "histResultado", vars: { r: 1, m: 2, a: "—", d: "=" } }]);
  const d = JSON.parse(JSON.stringify(c));
  d.jugadores = d.jugadores.slice(1).concat({ id: "j9", nombre: "Eva" });
  igual("quién entra y quién sale", H.describir(c, d).map((x) => [x.clave, x.vars.n]), [["histEntra", "Eva"], ["histSale", "Ana"]]);
  igual("otro dato del torneo", H.describir(c, Object.assign({}, c, { ciudad: "Alajuela" })).map((x) => x.clave), ["histDatos"]);
  igual("sin cambios, nada", H.describir(c, JSON.parse(JSON.stringify(c))), []);

  console.log("\n=== Lo que falta para cerrar el evento ===");
  const ev = { nombre: "E", jde: { etapa: "regional", lugar: "Nicoya" } };
  const t = T.nuevo({ sistema: "todos", jugadores, grupo: "G" });
  T.fijarNumeracion(t);
  t.rondas.push(T.rondaTodos(t, 0));
  t.rondas[0].mesas.forEach((m) => { m.r = "1-0"; });
  igual("con rondas sin jugar", V.revisarCierre(ev, [t])[0].problemas.map((x) => x.clave), ["cierreRondas"]);
  for (let r = 1; r < 3; r++) { const R = T.rondaTodos(t, r); R.mesas.forEach((m) => { m.r = "="; }); t.rondas.push(R); }
  t.rondas[0].mesas.forEach((m) => { m.r = "="; });
  igual("todo tablas: empate en el corte sin desempate", V.revisarCierre(ev, [t])[0].problemas.map((x) => x.clave), ["cierreEmpate"]);
  t.desempateCorte = { formato: "Blitz", orden: ["j0", "j1", "j2", "j3"] };
  t.rondas[1].incidencias = [{ tipo: "apelacion", texto: "x", presenta: "y", resolucion: "" }];
  igual("una apelación sin resolver", V.revisarCierre(ev, [t])[0].problemas.map((x) => [x.clave, x.vars.n]), [["cierreApelaciones", 1]]);
  t.rondas[1].incidencias[0].resolucion = "Se rechaza.";
  igual("todo en orden: nada que falte", V.revisarCierre(ev, [t])[0].problemas, []);

  console.log("\n=== El .zip con PDF y texto ===");
  const z = Buffer.from(TablaExcel.zip([{ nombre: "a.pdf", bytes: Uint8Array.from([37, 80, 68, 70]) }, { nombre: "b.json", texto: "{}" }]));
  ok(z.slice(0, 2).toString() === "PK" && z.includes(Buffer.from("a.pdf")) && z.includes(Buffer.from("%PDF")) && z.includes(Buffer.from("b.json")), "mete bytes y texto en el mismo .zip");
}

/* ==================================================================
   2. En la página
   ================================================================== */
async function pruebaPagina(browser) {
  let { ctx, page, errores } = await P.abrirPagina(browser, BASE);

  console.log("\n=== El ID FIDE que llega con el Elo Nacional ===");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", ["PRUEBA UNO", "PRUEBA DOS", "PRUEBA TRES", "PRUEBA CUATRO"].join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.evaluate(() => {
    window.PareoEloNacional.buscar = async (nombres) => ({ ok: true, resultados: nombres.map((n, i) => ({ nombre: n, estado: "encontrado", nacional: 1500 + i, fideId: String(64000 + i) })) });
  });
  await page.click("#pi-elo-nacional");
  let todos = await P.esperarGuardado(page, (l) => l[0].jugadores.every((j) => Number(j.elo) > 0));
  ok(todos[0].jugadores.every((j) => /^640\d\d$/.test(j.fideId)), "a quien no tenía ID FIDE se le pone el que trae la lista nacional", JSON.stringify(todos[0].jugadores.map((j) => j.fideId)));

  console.log("\n=== El historial de cambios y deshacer ===");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForFunction(() => document.querySelector("#pi-ronda table select"));
  await page.selectOption("#pi-ronda table select", "1-0");
  await page.click('[data-ficha="archivos"]');
  const hist = await page.textContent("#pi-historial-lista");
  ok(/ronda 1, mesa 1: de — a 1-0/.test(hist) && /se emparejó la ronda 1/.test(hist), "el historial dice qué cambió", hist);
  await page.click("#pi-deshacer");
  await page.waitForSelector(confirmar);
  await page.click(confirmar + " [data-avisos-aceptar]");
  todos = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[0].r == null);
  ok(true, "deshacer vuelve el resultado a como estaba");
  ok(!/de — a 1-0/.test(await page.textContent("#pi-historial")), "y sale del historial");

  console.log("\n=== Dos pestañas con el mismo torneo ===");
  const otra = await ctx.newPage();
  await otra.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await otra.goto(BASE + "/pareo.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.getElementById("pi-otra-pestana").hidden);
  ok(/abierto también en otra pestaña/.test(await page.textContent("#pi-otra-pestana")), "la primera se entera de que hay otra con el mismo torneo");
  ok(await otra.$eval("#pi-otra-pestana", (x) => !x.hidden), "y la segunda también");
  await otra.click('[data-ficha="rondas"]');
  await otra.selectOption("#pi-ronda table select", "0-1");
  await page.waitForFunction(() => /acaba de guardar/.test(document.getElementById("pi-otra-pestana").textContent));
  ok(true, "cuando la otra guarda, avisa que lo de acá puede pisarlo");
  await page.click("#pi-otra-cargar");
  await page.click('[data-ficha="rondas"]');
  igual("«Cargar lo último guardado» trae lo de la otra", await page.$eval("#pi-ronda table select", (s) => s.value), "0-1");
  await otra.close();

  console.log("\n=== Una sanción que cambia el resultado ===");
  await page.selectOption("#pi-inc-tipo", "sancion");
  await page.selectOption("#pi-inc-mesa", "2");
  await page.fill("#pi-inc-texto", "Le sonó el celular.");
  await page.click("#pi-inc-anotar");
  await page.click("#pi-inc-lista [data-sancion]");
  await page.waitForSelector(dialogo);
  await page.selectOption(dialogo + ' select[name="r"]', "+-");
  await page.click(dialogo + " [data-avisos-aceptar]");
  todos = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[1].r === "+-");
  ok(todos[0].rondas[0].incidencias.some((x) => x.tipo === "correccion" && /por una sanción/.test(x.texto)), "el resultado cambia y queda la corrección", JSON.stringify(todos[0].rondas[0].incidencias));

  console.log("\n=== Las planillas de anotación ===");
  await page.click("#pi-planillas-anotacion");
  const planillas = await page.$$eval("#pi-firmas .pi-planilla", (l) => l.map((x) => [x.textContent, x.querySelectorAll("tbody tr").length]));
  igual("una planilla por mesa, con 30 filas (60 jugadas)", planillas.map((x) => x[1]), [30, 30]);
  ok(/Ronda 1 · Mesa 1/.test(planillas[0][0]) && /Blancas: PRUEBA/.test(planillas[0][0]) && /Negras: PRUEBA/.test(planillas[0][0]), "con la ronda, la mesa y los nombres", planillas[0][0].slice(0, 200));
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== El evento: respaldo automático, adjunto en equipos y cierre ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "", (p) => p.addInitScript(() => {
    window.__escrito = [];
    window.showSaveFilePicker = async () => ({ createWritable: async () => ({ write: async (t) => { window.__escrito.push(t); }, close: async () => {} }) });
  })));
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "FDN"]];
  for (let i = 1; i <= 3; i++) filas.push(["PRUEBA IND " + i, "MUJER", "LICEO " + i, "Alajuela", "C", "Individual", "Mujeres", "2013-01-0" + i]);
  for (const c of ["NORTE", "SUR"]) for (let i = 1; i <= 4; i++) filas.push(["PRUEBA " + c + " " + i, "HOMBRE", "LICEO " + c, "Alajuela", "C", "Equipo", "Abierto", "2013-02-0" + i]);
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", { name: "r.xlsx", mimeType: XLSX, buffer: xlsx(filas) });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "regional", "Alajuela");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  todos = await leerTodos(page);
  const equipos = todos.find((x) => x.tipo === "equipos");
  await page.click('[data-ficha="archivos"]');
  ok(/van 0 de/.test(await page.textContent("#pi-cierre-faltan")), "el cierre dice lo que falta", await page.textContent("#pi-evento"));
  await page.click("#pi-respaldo-auto");
  await page.waitForFunction(() => window.__escrito.length >= 1);
  ok(JSON.parse(await page.evaluate(() => window.__escrito[0])).torneos.length === 2, "el respaldo automático escribe el evento entero en el archivo elegido");
  ok(/Último respaldo/.test(await page.textContent("#pi-respaldo-estado")), "y dice a qué hora");

  // El adjunto en el torneo por equipos.
  await page.selectOption("#pi-lista", equipos.idLista);
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForFunction(() => document.querySelector("#pi-ronda section select"));
  await page.click("#pi-adjunto");
  await page.waitForSelector(dialogo);
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForSelector(".pi-adjunto-url");
  const codigo = (await page.textContent(".pi-adjunto-url")).split("#adjunto=")[1].split("&")[0];
  const canal = "pareo-adjunto-" + codigo;
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "estado"), canal);
  const estadoEq = await page.evaluate((c) => window.__enviados.filter((x) => x.canal === c && x.evento === "estado").pop().payload, canal);
  igual("al adjunto le llegan los 4 tableros del encuentro", estadoEq.mesas[0].tableros.map((x) => x.t), [1, 2, 3, 4]);
  await page.evaluate((c) => window.__llega(c, "resultado", { ronda: 1, mesa: 1, tablero: 2, r: "=" }), canal);
  todos = await P.esperarGuardado(page, (l, id) => (l.find((x) => x.idLista === id).rondas[0].mesas[0].partidas || [])[1] && l.find((x) => x.idLista === id).rondas[0].mesas[0].partidas[1].r === "=", equipos.idLista);
  ok(true, "el resultado de un tablero entra a su tablero");
  await page.evaluate((c) => window.__llega(c, "resultado", { ronda: 1, mesa: 1, tablero: 2, r: "1-0" }), canal);
  todos = await leerTodos(page);
  igual("y no se pisa", todos.find((x) => x.idLista === equipos.idLista).rondas[0].mesas[0].partidas[1].r, "=");
  await page.waitForFunction(() => window.__escrito.length >= 2, null, { timeout: 15000 });
  ok(true, "cada cambio vuelve a escribir el respaldo");

  // Jugar todo y cerrar.
  await anotar(page, "1-0");
  await jugarRondas(page, "1-0");
  const ind = todos.find((x) => x.tipo !== "equipos");
  await page.selectOption("#pi-lista", ind.idLista);
  await page.click('[data-ficha="rondas"]');
  await jugarRondas(page, "1-0");
  await page.click('[data-ficha="archivos"]');
  ok(await vis(page, "#pi-cierre-listo"), "con todo jugado, el cierre dice que está completo", await page.textContent("#pi-evento"));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#pi-evento-cierre")]);
  const paquete = fs.readFileSync(await dl.path());
  ok(/paquete-final\.zip$/.test(dl.suggestedFilename()) && paquete.slice(0, 2).toString() === "PK", "el paquete final es un .zip", dl.suggestedFilename());
  const dentro = ["acta-congresillo.pdf", "informe-oficial.pdf", "premiacion.pdf", "clasificados.xlsx", "estadisticas.xlsx", "respaldo.json"];
  igual("con los seis archivos", dentro.filter((n) => paquete.includes(Buffer.from(n))), dentro);
  ok(paquete.includes(Buffer.from("%PDF-")), "y los PDF de verdad adentro");
  todos = await leerTodos(page);
  const vista = V.vistaEvento(todos[0].evento, todos.filter((x) => x.evento).sort((a, b) => a.ordenEnEvento - b.ordenEnEvento));
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== El enlace del evento: ficha, idioma y sin conexión ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#evento=prueba456"));
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  await page.evaluate((v) => window.__llega("pareo-evento-prueba456", "estado", v), vista);
  await page.waitForSelector("#pi-ver-torneos details");
  await page.click("#pi-ver-torneos details summary");
  const nombre = await page.$eval("#pi-ver-torneos details [data-jugador]", (b) => b.dataset.jugador);
  await page.click(`#pi-ver-torneos details [data-jugador="${nombre}"]`);
  const fichaTxt = await page.textContent("#pi-ver-ficha");
  ok(fichaTxt.includes(nombre) && /Ronda 1: /.test(fichaTxt) && /va de \d\.º con/.test(fichaTxt), "tocar un nombre abre su ficha, con todas sus rondas y cómo va", fichaTxt);
  ok(await page.$eval("#pi-ver-ficha h2", (h) => document.activeElement === h), "y el foco va a la ficha");
  await page.click('#pi-ver-ficha button:has-text("Cerrar")');
  igual("se cierra", await page.textContent("#pi-ver-ficha"), "");
  // Sin conexión: lo que llegó quedó guardado.
  await ctx.setOffline(true);
  await page.waitForFunction(() => /Sin conexión: lo que ves es de las/.test(document.getElementById("pi-ver-conexion").textContent));
  ok(await vis(page, "#pi-ver-conexion"), "sin conexión, lo dice con la hora de lo último que llegó");
  await ctx.setOffline(false);
  // El idioma: vuelve a abrir la misma dirección, en inglés, con lo último guardado.
  await Promise.all([page.waitForNavigation(), page.click("#pi-ver-idioma")]);
  await page.waitForSelector("#pi-ver-buscar");
  igual("en inglés, el botón ofrece volver al español", await page.textContent("#pi-ver-idioma"), "Español");
  ok(/My player/.test(await page.textContent("#pi-ver")), "y la página está en inglés");
  ok(/Last data received at/.test(await page.textContent("#pi-ver-conexion")), "al volver a abrir, muestra lo último que llegó mientras se conecta");
  await page.click("#pi-ver-idioma");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { pruebaSinNavegador(); } catch (e) { mal("la parte sin navegador se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaPagina(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
