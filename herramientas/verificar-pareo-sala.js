/* Pareo Integral: lo que salió del ensayo con la inscripción real y lo que
 * pide la sala (js/pareo/pagina.js, js/pareo/evento.js, js/pareo/ver.js,
 * js/pareo/textos.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - el singular («Falta 1 resultado») y la propuesta de torneos compacta;
 *   - los resultados para confirmar: la sorpresa de Elo y lo que un adjunto
 *     anotó distinto (nunca se pisa solo);
 *   - el enlace del adjunto con letra grande y los resultados a un toque;
 *   - la cuenta regresiva de la próxima ronda (el horario viaja en el enlace);
 *   - varios eventos guardados: el filtro y los grupos de la lista;
 *   - pasar el evento a otra computadora (con un doble de Supabase Realtime);
 *   - el informe para la prensa;
 *   - «Avisarme» que se recuerda al volver a abrir el enlace;
 *   - el historial de los JDE anteriores en la ficha del jugador (con un
 *     doble de los datos de «Ajedrez estudiantil en Costa Rica»).
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-sala.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const X = require(path.join(RAIZ, "js/pareo/textos.js"));
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
const dialogo = 'dialog[data-avisos="formulario"][open]';
const confirmar = 'dialog[data-avisos="confirmar"][open]';

/* ==================================================================
   1. Sin navegador
   ================================================================== */
function pruebaSinNavegador() {
  console.log("\n=== El singular ===");
  igual("con 1, la versión en singular", X.t("es", "faltanResultados", { n: 1 }), "Falta 1 resultado.");
  igual("con 2, la de siempre", X.t("es", "faltanResultados", { n: 2 }), "Faltan 2 resultados.");
  igual("también en inglés", X.t("en", "faltanResultados", { n: 1 }), "1 result is missing.");
  // Una clave «…Uno» reemplaza a la de su nombre cuando {n} es 1: su
  // plural tiene que llevar {n}, si no es otra cosa que choca de nombre.
  const chocan = Object.keys(X.TEXTOS).filter((k) => k.endsWith("Uno") && X.TEXTOS[k.slice(0, -3)] && !X.TEXTOS[k.slice(0, -3)][0].includes("{n}"));
  ok(!chocan.length, "cada singular es de un texto con {n}", chocan.join(", "));

  console.log("\n=== La sorpresa de Elo ===");
  const jugadores = [["Ana", 2000], ["Bea", 1550], ["Cira", 1900], ["Dina", 1800]].map(([nombre, elo], i) => ({ id: "j" + i, nombre, elo }));
  const t = T.nuevo({ sistema: "suizo", rondasTotales: 3, jugadores });
  t.rondas.push({ mesas: [{ b: "j0", n: "j1", r: "0-1" }, { b: "j2", n: "j3", r: "0-1" }, { b: "j1", n: "j0", r: "=" }] });
  igual("solo cuando gana el de 400 o más por debajo (no el de 100, ni unas tablas)", V.sorpresas(t, 0).map((x) => [x.mesa, x.gana, x.dif]), [[0, "Bea", 450]]);
  t.jugadores[1].elo = 0;
  igual("sin Elo de los dos, nada que decir", V.sorpresas(t, 0), []);

  console.log("\n=== La próxima ronda ===");
  igual("la primera que no pasó", V.proximaRonda(["08:00", "10:10", "12:20"], 9 * 60), { n: 2, hora: "10:10", faltan: 70 });
  igual("la que empieza ahora", V.proximaRonda(["08:00"], 8 * 60).faltan, 0);
  igual("después de la última, ninguna", V.proximaRonda(["08:00"], 9 * 60), null);
  const ev = { id: "e", nombre: "JDE" };
  const conHoras = V.vistaEvento(ev, [Object.assign({}, t, { ritmo: "10 min + 5 s" })], V.horario([Object.assign({}, t, { ritmo: "10 min + 5 s" })], "08:00", "10"));
  igual("las horas viajan en el enlace del evento", conHoras.torneos[0].horas, ["08:00", "08:40", "09:20"]);
  ok(!("horas" in V.vistaEvento(ev, [t]).torneos[0]), "y sin horario, no");

  console.log("\n=== El historial: quién es quién ===");
  const n = (s) => s.toLowerCase();
  const lista = [{ clave: "mora solis ana" }, { clave: "mora ana" }, { clave: "vargas rojas luis andres" }, { clave: "perez ulate jose" }, { clave: "perez ulate jose maria" }];
  igual("el mismo nombre", V.buscarEnHistorial("MORA ANA", lista, n), lista[1]);
  igual("o uno con todos sus nombres dentro, si es el único", V.buscarEnHistorial("VARGAS ROJAS LUIS", lista, n), lista[2]);
  igual("con dos que podrían ser, ninguno", V.buscarEnHistorial("PEREZ ULATE JOSE MARIA FERNANDO", lista, n), null);
  igual("con menos de tres nombres, solo el exacto", V.buscarEnHistorial("MORA SOLIS", lista, n), null);
}

/* ==================================================================
   2. En la página
   ================================================================== */
async function pruebaPagina(browser) {
  let { ctx, page, errores } = await P.abrirPagina(browser, BASE);

  console.log("\n=== La propuesta de torneos ===");
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "FDN"]];
  for (let i = 1; i <= 4; i++) filas.push(["PRUEBA MUJER " + i, "MUJER", "LICEO " + i, "Alajuela", "C", "Individual", "Mujeres", "2013-01-0" + i]);
  for (let i = 1; i <= 4; i++) filas.push(["PRUEBA HOMBRE " + i, "HOMBRE", "LICEO " + i, "Alajuela", "C", "Individual", "Abierto", "2013-02-0" + i]);
  filas.push(["PRUEBA HOMBRE 1", "HOMBRE", "LICEO 1", "Alajuela", "C", "Individual", "Abierto", "2013-02-01"]);
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", { name: "r.xlsx", mimeType: XLSX, buffer: xlsx(filas) });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  ok(await page.$eval("#pi-sugerencia-como", (d) => d.tagName === "DETAILS" && !d.open), "cómo se arman los torneos va plegado");
  ok(!/null/.test(await page.textContent("#pi-sugerencia")), "y no se cuela ningún «null»");
  const ir = await page.$$eval("#pi-sugerencia-indice [data-ir]", (l) => l.map((b) => b.dataset.ir));
  ok(ir.includes("pi-repetidos"), "el índice de arriba lleva a lo que hay que revisar", JSON.stringify(ir));
  await page.click('#pi-sugerencia-indice [data-ir="pi-repetidos"]');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === "pi-repetidos"), "y el foco va a esa parte");
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "regional", "Alajuela");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  let todos = await leerTodos(page);
  const mujeres = todos.find((x) => /Mujeres/.test(x.nombre));
  // Los Elo, para que haya sorpresas.
  await page.evaluate(([id, elos]) => {
    const k = "pareo_torneo_v1_" + id;
    const x = JSON.parse(localStorage.getItem(k));
    x.jugadores.forEach((j, i) => { j.elo = elos[i]; });
    localStorage.setItem(k, JSON.stringify(x));
    localStorage.setItem("pareo_abierto_v1", id);
  }, [mujeres.idLista, [2000, 1950, 1500, 1400]]);
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => { window.print = () => {}; });

  console.log("\n=== Los resultados para confirmar ===");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  todos = await leerTodos(page);
  let t = todos.find((x) => x.idLista === mujeres.idLista);
  const elo = (id) => t.jugadores.find((j) => j.id === id).elo;
  // El de abajo gana en las dos mesas.
  const alReves = t.rondas[0].mesas.map((m) => (elo(m.b) < elo(m.n) ? "1-0" : "0-1"));
  await page.selectOption("#pi-mesa-0", alReves[0]);
  ok(/Falta 1 resultado\./.test(await page.textContent("#pi-ronda")), "con una mesa sin anotar: «Falta 1 resultado»");
  await page.selectOption("#pi-mesa-1", alReves[1]);
  await page.waitForSelector("#pi-confirmar");
  igual("las dos sorpresas, para confirmar", await page.$$eval("#pi-confirmar li", (l) => l.length), 2);
  ok(/le ganó a .*puntos más de Elo/.test(await page.textContent("#pi-confirmar")), "dice quién le ganó a quién y por cuánto", await page.textContent("#pi-confirmar"));
  await page.click('#pi-confirmar [data-confirmar="0"]');
  todos = await P.esperarGuardado(page, (l, id) => (l.find((x) => x.idLista === id).rondas[0].confirmadas || []).length === 1, mujeres.idLista);
  igual("«Está bien así» la saca de la lista", await page.$$eval("#pi-confirmar li", (l) => l.length), 1);

  // Un adjunto manda otro resultado para la mesa 2.
  await page.click("#pi-adjunto");
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="arbitro"]', "PRUEBA ADJUNTA");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForSelector(".pi-adjunto-url");
  const codigoAdj = (await page.textContent(".pi-adjunto-url")).split("#adjunto=")[1].split("&")[0];
  const otro = alReves[1] === "1-0" ? "0-1" : "1-0";
  await page.evaluate(([c, r]) => window.__llega(c, "resultado", { ronda: 1, mesa: 2, r }), ["pareo-adjunto-" + codigoAdj, otro]);
  todos = await P.esperarGuardado(page, (l, id) => (l.find((x) => x.idLista === id).rondas[0].discrepancias || []).length === 1, mujeres.idLista);
  t = todos.find((x) => x.idLista === mujeres.idLista);
  igual("lo que anotó distinto no pisa el resultado", t.rondas[0].mesas[1].r, alReves[1]);
  await page.waitForSelector('#pi-confirmar [data-poner="0"]');
  ok(/un adjunto anotó/.test(await page.textContent("#pi-confirmar")), "queda para confirmar");
  await page.click('#pi-confirmar [data-poner="0"]');
  todos = await P.esperarGuardado(page, (l, x) => l.find((y) => y.idLista === x[0]).rondas[0].mesas[1].r === x[1], [mujeres.idLista, otro]);
  ok(true, "«Poner» deja el del adjunto");
  await page.waitForFunction(() => !document.getElementById("pi-confirmar"));
  ok(true, "y, sin sorpresas ni diferencias pendientes, la lista se va");

  // El resto del torneo, para la prensa.
  await P.jugarRondas(page, "1-0");

  console.log("\n=== El informe para la prensa ===");
  await page.click('[data-ficha="archivos"]');
  await page.click("#pi-evento-prensa");
  const prensa = await page.inputValue("#pi-prensa-texto");
  ok(/^JDE 2\d{3} · Etapa Regional/.test(prensa) && /8 estudiantes de 4 centros educativos jugaron 2 torneos\./.test(prensa), "arriba el evento y cuántos jugaron", prensa.slice(0, 200));
  ok(/Campeona: PRUEBA MUJER \d \(LICEO \d\), \d+ puntos\./.test(prensa) && /Subcampeona: /.test(prensa), "en el de mujeres, «Campeona» y «Subcampeona»", prensa);
  ok(/La edad más joven en un podio: PRUEBA MUJER \d, con 1\d años/.test(prensa), "y la edad más joven en un podio", prensa);
  ok(await page.evaluate(() => document.activeElement.id === "pi-prensa-texto"), "el foco va al texto");

  console.log("\n=== El horario viaja en el enlace del evento ===");
  await page.fill("#pi-horario-inicio", "09:30");
  await page.dispatchEvent("#pi-horario-inicio", "change");
  await page.click("#pi-evento-vivo");
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "estado" && /^pareo-evento-/.test(x.canal)));
  const vista = await page.evaluate(() => window.__enviados.filter((x) => x.evento === "estado" && /^pareo-evento-/.test(x.canal)).pop().payload);
  igual("cada torneo con las horas de sus rondas", vista.torneos.map((x) => (x.horas || [])[0]), ["09:30", "09:30"]);

  console.log("\n=== Pasar el evento a otra computadora ===");
  await page.click("#pi-evento-pasar");
  await page.waitForSelector("#pi-pasar-url");
  igual("el botón dice que está esperando", await page.getAttribute("#pi-evento-pasar", "aria-pressed"), "true");
  const codigoPasar = (await page.textContent("#pi-pasar-url")).split("#recibir=")[1];
  const canalPasar = "pareo-pasar-" + codigoPasar;
  await page.evaluate((c) => window.__llega(c, "pedir", {}), canalPasar);
  await page.waitForSelector(confirmar);
  ok(/pide el evento .*datos de sus estudiantes/.test(await page.textContent(confirmar)), "pregunta antes de mandar");
  await page.click(confirmar + " [data-avisos-aceptar]");
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "parte"), canalPasar);
  const partes = await page.evaluate((c) => window.__enviados.filter((x) => x.canal === c && x.evento === "parte").map((x) => x.payload), canalPasar);
  ok(partes.length >= 1 && partes.every((p) => p.n === partes.length), "lo manda comprimido, en partes numeradas", JSON.stringify(partes.map((p) => [p.i, p.n, p.d.length])));
  // Que diga que no: no manda nada.
  const antes = partes.length;
  await page.evaluate((c) => window.__llega(c, "pedir", {}), canalPasar);
  await page.waitForSelector(confirmar);
  await page.click(confirmar + " [data-avisos-cancelar]");
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "negado"), canalPasar);
  igual("si se le dice que no, no manda nada", await page.evaluate((c) => window.__enviados.filter((x) => x.canal === c && x.evento === "parte").length, canalPasar), antes);

  console.log("\n=== Varios eventos guardados ===");
  ok(!(await vis(page, "#pi-evento-filtro")), "con un solo evento, no hay filtro");
  todos = await leerTodos(page);
  const copia = Object.assign({}, todos.find((x) => x.idLista === mujeres.idLista), { evento: { id: "evOtro", nombre: "JDE de prueba · Heredia" }, nombre: "Torneo de Heredia" });
  delete copia.idLista;
  await page.evaluate((x) => {
    localStorage.setItem("pareo_torneo_v1_tOtro", JSON.stringify(x));
    const l = JSON.parse(localStorage.getItem("pareo_lista_v1"));
    l.push({ id: "tOtro", nombre: x.nombre, actualizado: 1 });
    localStorage.setItem("pareo_lista_v1", JSON.stringify(l));
  }, copia);
  await page.reload({ waitUntil: "networkidle" });
  ok(await vis(page, "#pi-evento-filtro"), "con dos, aparece el filtro de evento");
  const grupos = await page.$$eval("#pi-lista optgroup", (l) => l.map((g) => g.label));
  ok(grupos.length === 2 && grupos.includes("JDE de prueba · Heredia"), "y la lista de torneos va agrupada por evento", JSON.stringify(grupos));
  await page.selectOption("#pi-evento-filtro", "evOtro");
  await page.waitForFunction(() => document.getElementById("pi-lista").value === "tOtro");
  igual("al elegir un evento, se abre uno de sus torneos y solo se ven los suyos", await page.$$eval("#pi-lista option", (l) => l.map((o) => o.value)), ["tOtro"]);
  await page.reload({ waitUntil: "networkidle" });
  igual("y se recuerda", await page.inputValue("#pi-evento-filtro"), "evOtro");
  await page.selectOption("#pi-evento-filtro", "");
  ok(await page.$$eval("#pi-lista option", (l) => l.length) === 3, "«Todos los torneos» los vuelve a mostrar");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== La otra computadora recibe el evento ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#recibir=" + codigoPasar));
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "pedir"), canalPasar);
  igual("la dirección se limpia (el código no queda a la vista)", await page.evaluate(() => location.hash), "");
  for (const p of partes) await page.evaluate(([c, x]) => window.__llega(c, "parte", x), [canalPasar, p]);
  todos = await P.esperarGuardado(page, (l) => l.filter((x) => x.evento).length === 2);
  ok(todos.some((x) => /Mujeres/.test(x.nombre) && x.rondas.length === 3), "llegan los torneos del evento, con sus rondas", JSON.stringify(todos.map((x) => [x.nombre, x.rondas.length])));
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== La cuenta regresiva, «Avisarme» y el historial ===");
  const datosJde = {
    torneos: { columnas: ["clave", "anio", "etapa", "categoria", "nombre", "inicio", "lugar", "region", "jugadores", "rondas", "modalidad", "ritmo", "rama"],
      torneos: [[1, 2025, "Regional", "C", "Regional Alajuela C", "2025-05-10", "", "Alajuela", 12, 5, "Individual", "Clásico", "Femenina"]] },
    jugadores: { actualizado: "2026-10-01", jugadores: [["Prueba Mujer 1", "prueba mujer 1"]], instituciones: [], columnas_participaciones: [], participaciones: [[1, 0, null, 2, 3.5, null, null]], columnas_equipos: [], equipos: [] },
  };
  const antesDeAbrir = async (p) => {
    // 09:00 en Costa Rica.
    await p.clock.install({ time: new Date("2026-10-22T15:00:00Z") });
    await p.route("**/data/ajedrez-estudiantil.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(datosJde.torneos) }));
    await p.route("**/data/ajedrez-estudiantil-jugadores.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(datosJde.jugadores) }));
    await p.route("**/data/ajedrez-estudiantil-partidas.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ columnas: [], partidas: [] }) }));
  };
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#evento=prueba789", antesDeAbrir));
  const llegaVista = async () => {
    await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
    await page.evaluate((v) => window.__llega("pareo-evento-prueba789", "estado", v), vista);
    await page.waitForSelector("#pi-ver-torneos details");
  };
  await llegaVista();
  const proxima = await page.$$eval("#pi-ver-torneos [data-proxima]", (l) => l.map((x) => x.textContent));
  // El de mujeres ya va por la ronda 3: atrasado no se le cuenta nada.
  ok(proxima.length === 1 && /Ronda 1 a las 09:30 · faltan 30 min/.test(proxima[0]), "el torneo que no empezó dice cuánto falta para su ronda (el que va adelantado, nada)", JSON.stringify(proxima));
  await page.clock.fastForward("20:00");
  ok(/faltan 10 min/.test(await page.textContent("#pi-ver-torneos [data-proxima]")), "y la cuenta corre sola");
  await page.fill("#pi-ver-buscar", "PRUEBA MUJER 1");
  await page.click("#pi-ver-avisar");
  ok(/Dejar de avisarme de PRUEBA MUJER 1/.test(await page.textContent("#pi-ver-avisar")), "«Avisarme» cambia a «Dejar de avisarme»");
  await page.reload({ waitUntil: "networkidle" });
  await llegaVista();
  ok(/Dejar de avisarme de PRUEBA MUJER 1/.test(await page.textContent("#pi-ver-avisar")), "y al volver a abrir el enlace se sigue avisando");
  await page.click("#pi-ver-avisar");
  ok(/^Avisarme/.test(await page.textContent("#pi-ver-avisar")) && await page.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith("pareo_ver_seguir_v1_"))), "«Dejar de avisarme» lo olvida");
  const det = await page.$('#pi-ver-torneos details:has-text("Mujeres")');
  await det.$eval("summary", (s) => s.click());
  await page.click('#pi-ver-torneos [data-jugador="PRUEBA MUJER 1"]');
  await page.click("#pi-ver-ficha [data-ver-historial]");
  await page.waitForFunction(() => /Categoría C/.test(document.querySelector("#pi-ver-ficha [data-historial]").textContent));
  const hist = await page.textContent("#pi-ver-ficha [data-historial]");
  ok(/2025 · Regional · Categoría C · Individual: 2\.º de \d+/.test(hist), "la ficha trae sus JDE anteriores, con su puesto", hist);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== El adjunto en una tableta ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#adjunto=prueba321&m=1-5"));
  const estadoAdj = { nombre: "Torneo", ronda: 1, mesas: [{ m: 1, b: "PRUEBA UNO", n: "PRUEBA DOS", r: null }, { m: 2, b: "PRUEBA TRES", n: "PRUEBA CUATRO", r: null }] };
  const llegaAdj = async () => {
    await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
    await page.evaluate((e) => window.__llega("pareo-adjunto-prueba321", "estado", e), estadoAdj);
    await page.waitForSelector("#pi-adj-grande");
  };
  await llegaAdj();
  const antesTam = await page.$eval("#pi-adj-1", (s) => parseFloat(getComputedStyle(s).fontSize));
  await page.click("#pi-adj-grande");
  const despues = await page.$eval("#pi-adj-1", (s) => parseFloat(getComputedStyle(s).fontSize));
  ok(despues >= 22 && despues > antesTam, "«Letra grande» agranda la letra de verdad", antesTam + " → " + despues);
  igual("y dice que está puesta", await page.getAttribute("#pi-adj-grande", "aria-pressed"), "true");
  await page.click('[data-mesa="2"] [data-r="="]');
  const mandado = await page.evaluate(() => window.__enviados.filter((x) => x.evento === "resultado").pop());
  igual("un toque en ½-½ manda las tablas de su mesa", mandado && mandado.payload, { ronda: 1, mesa: 2, r: "=" });
  ok(await page.$eval('[data-mesa="2"] [data-r="1-0"]', (b) => b.disabled), "y apaga los botones hasta que conteste el principal");
  await page.reload({ waitUntil: "networkidle" });
  await llegaAdj();
  ok(await page.$eval("#pi-ver", (c) => c.classList.contains("pi-grande")), "la letra grande se recuerda");
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
