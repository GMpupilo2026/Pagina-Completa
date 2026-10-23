/* Pareo Integral: lo que agiliza la ronda en la sala y el evento de punta a
 * punta (js/pareo/pagina.js, js/pareo/equipos.js, js/pareo/evento.js,
 * js/pareo/ver.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - «Solo lo de los JDE» esconde lo que no se usa en los JDE, y se recuerda;
 *   - buscar una mesa por el nombre y los atajos del teclado (1, 0, =);
 *   - «Imprimir todo»: la plantilla, las hojas para firmar y las planillas
 *     de anotación de la ronda, en una sola impresión;
 *   - el desempate «Por tableros» (TB) en los torneos por equipos;
 *   - un encuentro que se pierde por no presentarse queda con su resultado
 *     al emparejar (no deja «Faltan resultados» para siempre);
 *   - los capitanes confirman la alineación desde el celular (con un doble
 *     de Supabase Realtime), y lo que no vale no entra;
 *   - el .zip con el TRF de cada torneo para chess-results;
 *   - comparado con el año anterior (data/ajedrez-estudiantil.json).
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-ronda.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const E = require(path.join(RAIZ, "js/pareo/equipos.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const TablaExcel = require(path.join(RAIZ, "js/tabla-excel.js"));
const { contestarEtapa } = require("./lib/pareo-etapa");
const P = require("./lib/pareo-pruebas");
const { XLSX, leerTodos, vis } = P;

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const xlsx = (filas) => Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas }]));

/* ==================================================================
   1. Sin navegador
   ================================================================== */
let contador = 0;
const nuevoId = () => "x" + (++contador);
const equipo = (centro) => E.armarEquipos([1, 2, 3, 4].map((k) => ({ id: nuevoId(), nombre: centro + " " + k, institucion: centro, categoria: "C" })), nuevoId)[0];

function pruebaSinNavegador() {
  console.log("\n=== El desempate «Por tableros» ===");
  igual("los tableros se codifican en un número que se compara de mayor a menor", E.codificarTableros([2, 1.5, 1, 0]), 4030200);
  igual("y se vuelven a escribir tablero por tablero", E.textoTableros(4030200, 4), "2 · 1½ · 1 · 0");
  ok(E.codificarTableros([1, 0, 0, 0]) > E.codificarTableros([0, 4, 4, 4]), "el tablero 1 manda sobre todos los demás");
  const t = T.nuevo({ tipo: "equipos", tableros: 4, sistema: "todos", puntos: Object.assign({}, E.PUNTOS_EQUIPOS), desempates: ["TB"], jugadores: [equipo("Uno"), equipo("Dos")] });
  const [U, D] = t.jugadores;
  // Al revés en la lista, para que gane el desempate y no el orden.
  const m = E.prepararMesa(t, { b: D.id, n: U.id, r: null });
  // Los resultados van desde las blancas; en los tableros 2 y 4 las blancas son de Uno.
  ["0-1", "1-0", "1-0", "0-1"].forEach((r, k) => { m.partidas[k].r = r; });
  m.r = E.resultadoEncuentro(t, m);
  t.rondas.push({ mesas: [m] });
  igual("2 – 2: empate", m.r, "=");
  igual("los puntos de cada uno, tablero por tablero", [E.puntosPorTablero(t, U.id), E.puntosPorTablero(t, D.id)], [[1, 1, 0, 0], [0, 0, 1, 1]]);
  igual("a igual puntaje, gana quien hizo más en el tablero 1", E.clasificacion(t, ["TB"]).map((f) => f.id), [U.id, D.id]);
  ok(E.catalogo(t).some((d) => d.codigo === "TB"), "está en la lista de desempates de un torneo por equipos");
  ok(!E.catalogo(T.nuevo({ sistema: "todos", jugadores: [] })).some((d) => d.codigo === "TB"), "y no en la de uno individual");
  m.alineacion.n = [U.integrantes[0].id];
  igual("en un encuentro perdido por no presentarse, el que vino suma 1 en cada tablero", E.puntosPorTablero(t, D.id), [1, 1, 1, 1]);

  console.log("\n=== Comparado con el año anterior ===");
  const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, "data/ajedrez-estudiantil.json"), "utf8"));
  const c = V.compararAnioAnterior({ jde: { anio: 2025, etapa: "regional", lugar: "Alajuela" } }, [], datos);
  igual("busca el año anterior", c.anio, 2024);
  ok(c.torneosAntes > 0 && c.filas.length > 0 && c.filas.every((f) => f.ahora == null), "y encuentra los torneos de la regional de Alajuela de ese año", JSON.stringify(c).slice(0, 300));
  igual("sin datos de ese año, nada", V.compararAnioAnterior({ jde: { anio: 1990, etapa: "regional", lugar: "Alajuela" } }, [], datos).torneosAntes, 0);
}

/* ==================================================================
   2. En la página
   ================================================================== */
async function pruebaIndividual(browser) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);

  console.log("\n=== «Solo lo de los JDE» ===");
  await page.click('[data-ficha="archivos"]');
  ok(await vis(page, ".pi-no-jde"), "de entrada se ve el comprobador");
  await page.check("#pi-modo-jde");
  const escondidas = await page.$$eval(".pi-no-jde", (l) => l.map((x) => x.checkVisibility()));
  ok(escondidas.length >= 3 && escondidas.every((x) => !x), "al marcarlo, se esconden el comprobador, el generador y los créditos", JSON.stringify(escondidas));
  await page.reload({ waitUntil: "networkidle" });
  await page.click('[data-ficha="archivos"]');
  ok(await page.isChecked("#pi-modo-jde") && !(await vis(page, ".pi-no-jde")), "y se recuerda al volver a abrir");
  await page.uncheck("#pi-modo-jde");
  ok(await vis(page, ".pi-no-jde"), "al desmarcarlo, vuelven");

  console.log("\n=== Buscar una mesa y los atajos ===");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", ["Ana Mora", "Beatriz Solís", "Carla Ureña", "Diana Vargas", "Elena Zúñiga", "Fabiola Arias"].join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  const visibles = () => page.$$eval("#pi-ronda tr[data-nombres]", (l) => l.filter((x) => x.checkVisibility()).length);
  igual("las 3 mesas", await visibles(), 3);
  await page.fill("#pi-buscar-mesa", "zuniga");
  igual("al buscar «zuniga» (sin tilde ni mayúscula) queda solo su mesa", await visibles(), 1);
  const suya = await page.$eval("#pi-ronda tr[data-nombres]:not([hidden])", (x) => x.textContent);
  ok(/Zúñiga/.test(suya), "y es la de Elena Zúñiga", suya);
  await page.fill("#pi-buscar-mesa", "");
  igual("al borrarlo, vuelven todas", await visibles(), 3);
  await page.focus("#pi-mesa-0");
  await page.keyboard.press("1");
  await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[0].r === "1-0");
  ok(true, "la tecla 1 pone 1-0");
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "pi-mesa-1");
  ok(true, "y salta sola a la mesa siguiente");
  await page.keyboard.press("=");
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "pi-mesa-2");
  await page.keyboard.press("0");
  const todos = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[2].r === "0-1");
  igual("= pone tablas y 0 gana negras", todos[0].rondas[0].mesas.map((x) => x.r), ["1-0", "=", "0-1"]);

  console.log("\n=== Imprimir todo ===");
  await page.click("#pi-imprimir-todo");
  const clases = await page.evaluate(() => [...document.body.classList].filter((c) => c.startsWith("pi-imprimiendo")).sort());
  igual("prepara la plantilla y las hojas a la vez", clases, ["pi-imprimiendo-firmas", "pi-imprimiendo-plantilla"]);
  const hojas = await page.evaluate(() => ({
    plantilla: document.querySelectorAll("#pi-plantilla .pi-plantilla-mesa").length,
    firmas: document.querySelectorAll("#pi-firmas .pi-firma-mesa:not(.pi-planilla)").length,
    anotacion: document.querySelectorAll("#pi-firmas .pi-planilla").length,
  }));
  igual("la plantilla de la pared, una hoja para firmar y una planilla por mesa", hojas, { plantilla: 3, firmas: 3, anotacion: 3 });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  igual("después de imprimir, se limpia", await page.evaluate(() => [...document.body.classList].filter((c) => c.startsWith("pi-imprimiendo"))), []);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaEvento(browser) {
  console.log("\n=== Un evento con equipos: el que no se presenta ===");
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "FDN"]];
  for (let i = 1; i <= 3; i++) filas.push(["PRUEBA IND " + i, "MUJER", "LICEO " + i, "Alajuela", "C", "Individual", "Mujeres", "2013-01-0" + i]);
  for (const c of ["NORTE", "SUR", "ESTE"]) for (let i = 1; i <= 4; i++) filas.push(["PRUEBA " + c + " " + i, "HOMBRE", "LICEO " + c, "Alajuela", "C", "Equipo", "Abierto", "2013-02-0" + i]);
  filas.push(["PRUEBA SOLO 1", "HOMBRE", "LICEO SOLO", "Alajuela", "C", "Equipo", "Abierto", "2013-03-01"]);
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", { name: "r.xlsx", mimeType: XLSX, buffer: xlsx(filas) });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "regional", "Alajuela");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  let todos = await leerTodos(page);
  const eq = todos.find((x) => x.tipo === "equipos");
  await page.selectOption("#pi-lista", eq.idLista);
  await page.click('[data-ficha="rondas"]');
  // El equipo de uno solo es un punto por revisar antes de la ronda 1.
  for (const c of await page.$$('#pi-revisar input[type="checkbox"]')) await c.check();
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-ronda section select");
  todos = await leerTodos(page);
  const t = todos.find((x) => x.idLista === eq.idLista);
  const solo = t.jugadores.find((e) => e.integrantes.length === 1);
  const suyo = t.rondas[0].mesas.find((m) => m.b === solo.id || m.n === solo.id);
  ok(suyo && suyo.r && suyo.r !== "=", "el encuentro del equipo de uno solo ya tiene su resultado al emparejar", JSON.stringify(suyo));
  ok(/Faltan 2 resultados/.test(await page.textContent("#pi-ronda")) || /Faltan/.test(await page.textContent("#pi-ronda")), "y solo faltan los del otro encuentro");
  ok(await page.$$eval("#pi-ronda section[data-nombres]", (l) => l.length) === 2, "la búsqueda también tiene los encuentros");

  console.log("\n=== Los capitanes confirman la alineación ===");
  await page.click("#pi-capitanes");
  await page.waitForSelector(".pi-capitan-url");
  igual("el botón dice que está abierto", await page.getAttribute("#pi-capitanes", "aria-expanded"), "true");
  const otro = t.rondas[0].mesas.find((m) => m !== suyo && m.n != null);
  const idE = otro.b;
  const eqOtro = t.jugadores.find((e) => e.id === idE);
  const url = await page.textContent(`[data-capitan-equipo="${idE}"] .pi-capitan-url`);
  const codigo = url.split("#capitan=")[1];
  // Mandárselo al capitán: WhatsApp y correo llevan el mensaje con su enlace.
  const wa = decodeURIComponent((await page.getAttribute(`[data-capitan-whatsapp="${idE}"]`, "href")).split("text=")[1]);
  const correo = await page.getAttribute(`[data-capitan-correo="${idE}"]`, "href");
  ok(wa.includes(url) && wa.includes(eqOtro.nombre) && /^mailto:\?subject=/.test(correo) && decodeURIComponent(correo).includes(url), "el enlace del capitán se manda por WhatsApp o por correo, con su mensaje", wa + " | " + correo);
  const canal = "pareo-capitan-" + codigo;
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "estado"), canal);
  const estado = await page.evaluate((c) => window.__enviados.filter((x) => x.canal === c && x.evento === "estado").pop().payload, canal);
  ok(estado.equipo === eqOtro.nombre && estado.ronda === 1 && estado.integrantes.length === 4 && !estado.bloqueada, "al capitán le llega su equipo, la ronda y sus integrantes", JSON.stringify(estado));
  const ids = eqOtro.integrantes.map((j) => j.id);
  // Uno de otro equipo: no entra.
  const ajeno = t.jugadores.find((e) => e.id !== idE).integrantes[0].id;
  await page.evaluate(([c, a]) => window.__llega(c, "alineacion", { ronda: 1, alineacion: a }), [canal, [ids[0], ajeno]]);
  await page.waitForTimeout(300);
  todos = await leerTodos(page);
  ok(!todos.find((x) => x.idLista === eq.idLista).rondas[0].mesas.find((m) => m.b === idE).alineacionCapitan, "con alguien de otro equipo, no entra");
  await page.evaluate(([c, a]) => window.__llega(c, "alineacion", { ronda: 7, alineacion: a }), [canal, [ids[2], ids[3]]]);
  await page.waitForTimeout(300);
  todos = await leerTodos(page);
  ok(!todos.find((x) => x.idLista === eq.idLista).rondas[0].mesas.find((m) => m.b === idE).alineacionCapitan, "de otra ronda, tampoco");
  await page.evaluate(([c, a]) => window.__llega(c, "alineacion", { ronda: 1, alineacion: a }), [canal, [ids[3], ids[1], ids[2]]]);
  todos = await P.esperarGuardado(page, (l, x) => { const m = l.find((y) => y.idLista === x[0]).rondas[0].mesas.find((y) => y.b === x[1]); return m && m.alineacionCapitan; }, [eq.idLista, idE]);
  const mOtro = todos.find((x) => x.idLista === eq.idLista).rondas[0].mesas.find((m) => m.b === idE);
  igual("la del capitán entra, en el orden de tableros", mOtro.alineacion.b, [ids[1], ids[2], ids[3]]);
  ok(/Confirmada por el capitán a las/.test(await page.textContent("#pi-ronda")), "y el encuentro dice que la confirmó el capitán", await page.textContent("#pi-ronda"));
  await P.anotar(page, "1-0");
  await page.evaluate(([c, a]) => window.__llega(c, "alineacion", { ronda: 1, alineacion: a }), [canal, ids]);
  await page.waitForTimeout(300);
  todos = await leerTodos(page);
  igual("con un tablero ya anotado, no se cambia", todos.find((x) => x.idLista === eq.idLista).rondas[0].mesas.find((m) => m.b === idE).alineacion.b, [ids[1], ids[2], ids[3]]);

  console.log("\n=== El .zip para chess-results ===");
  await page.click('[data-ficha="archivos"]');
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#pi-evento-chess")]);
  const zip = fs.readFileSync(await dl.path());
  ok(/chess-results\.zip$/.test(dl.suggestedFilename()) && zip.slice(0, 2).toString() === "PK", "es un .zip", dl.suggestedFilename());
  const nombres = (zip.toString("latin1").match(/[\w.-]+\.trf/g) || []).filter((x, i, a) => a.indexOf(x) === i);
  ok(nombres.length === 3 && nombres.filter((x) => /-equipos\.trf$/.test(x)).length === 1, "un TRF por torneo y el de equipos aparte", JSON.stringify(nombres));
  ok(zip.includes(Buffer.from("012 ")) && zip.includes(Buffer.from("001 ")), "con la cabecera y los jugadores del TRF");

  console.log("\n=== Comparado con el año anterior ===");
  todos = await leerTodos(page);
  const anio = todos[0].evento.jde.anio - 1;
  const col = ["clave", "anio", "etapa", "categoria", "nombre", "inicio", "lugar", "region", "jugadores", "rondas", "modalidad", "ritmo", "rama"];
  const fila = (o) => col.map((k) => o[k]);
  const falso = { columnas: col, torneos: [
    fila({ clave: 1, anio, etapa: "Regional", categoria: "C", region: "Alajuela", jugadores: 5, modalidad: "Individual", ritmo: "Clásico", rama: "Femenina" }),
    fila({ clave: 2, anio, etapa: "Regional", categoria: "C", region: "Alajuela", jugadores: 6, modalidad: "Equipos", ritmo: "Clásico", rama: "Abierta" }),
    fila({ clave: 3, anio, etapa: "Regional", categoria: "C", region: "Alajuela", jugadores: 40, modalidad: "Individual", ritmo: "Rápido", rama: "Abierta" }),
    fila({ clave: 4, anio, etapa: "Regional", categoria: "C", region: "Heredia", jugadores: 40, modalidad: "Individual", ritmo: "Clásico", rama: "Abierta" }),
  ] };
  await page.route("**/data/ajedrez-estudiantil.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(falso) }));
  await page.click("#pi-evento-anio");
  await page.waitForSelector("#pi-anio-tabla");
  const tabla = await page.$$eval("#pi-anio-tabla tbody tr", (l) => l.map((tr) => [...tr.children].map((x) => x.textContent)));
  igual("por categoría, modalidad y rama: lo de antes y lo de ahora (sin el rápido ni otra región)", tabla, [["C · Equipos · Abierto", "6", "4"], ["C · Individual · Mujeres", "5", "3"]]);
  ok(/2 torneos/.test(await page.textContent("#pi-anio-anterior")), "y el resumen dice cuántos torneos había", await page.textContent("#pi-anio-anterior"));
  ok(!errores.length, "sin errores en la página", errores.join(" | "));

  console.log("\n=== La página del capitán ===");
  const cap = await P.abrirPagina(browser, BASE, "#capitan=" + codigo);
  await cap.page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  await cap.page.evaluate(([c, e]) => window.__llega(c, "estado", e), [canal, Object.assign({}, estado, { alineacion: [ids[0], ids[1]] })]);
  await cap.page.waitForSelector("#pi-cap-confirmar");
  igual("una casilla por integrante, con los de la alineación marcados", await cap.page.$$eval('#pi-ver input[type="checkbox"]', (l) => l.map((c) => c.checked)), [true, true, false, false]);
  await cap.page.uncheck("#pi-cap-1");
  ok(await cap.page.isDisabled("#pi-cap-confirmar"), "con menos de 2, no deja confirmar");
  await cap.page.check("#pi-cap-2");
  await cap.page.check("#pi-cap-3");
  await cap.page.click("#pi-cap-confirmar");
  const enviada = await cap.page.evaluate(() => window.__enviados.filter((x) => x.evento === "alineacion").pop());
  igual("manda la alineación de la ronda", enviada && enviada.payload, { ronda: 1, alineacion: [ids[0], ids[2], ids[3]] });
  await cap.page.evaluate(([c, e]) => window.__llega(c, "estado", e), [canal, Object.assign({}, estado, { confirmada: Date.now(), bloqueada: true })]);
  ok(/confirmada/i.test(await cap.page.textContent("#pi-cap-confirmada")), "y dice cuando quedó confirmada", await cap.page.textContent("#pi-ver"));
  ok(!cap.errores.length, "sin errores en la página del capitán", cap.errores.join(" | "));
  await cap.ctx.close();
  await ctx.close();
}

(async () => {
  try { pruebaSinNavegador(); } catch (e) { mal("la parte sin navegador se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaIndividual(browser); await pruebaEvento(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
