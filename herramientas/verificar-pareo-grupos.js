/* Pareo Integral: separar una inscripción en un torneo por grupo
 * (js/pareo/grupos.js y la sugerencia de js/pareo/pagina.js).
 *
 * El Excel de inscripción de los JDE trae a toda una regional junta: hombres
 * y mujeres, equipos e individual, categorías A a E, con dos filas de título
 * ANTES de la cabecera. Lo que se rompe acá no da ningún error: el título del
 * reporte entra como jugador, una fecha 7/17/2015 se lee al revés (o se
 * pierde), una mujer cae en el torneo de los hombres, o se crean los torneos
 * sin que el árbitro lo haya pedido. Dos partes:
 *
 *   1. Las funciones puras, sin navegador: el sexo, la modalidad, las fechas
 *      (mes/día o día/mes, decidido para toda la columna) y los grupos (solo
 *      por lo que de verdad cambia en la lista).
 *   2. La página, en un navegador real (con lo que pide la Normativa de los
 *      JDE 2026, art. 66: «Mujeres» y «Abierto», suizo de al menos 5 rondas
 *      con más de 8, el ritmo mínimo), con un .xlsx armado como el de los
 *      JDE (nombres inventados): la sugerencia sale y no agrega a nadie; el
 *      grupo de un solo jugador viene desmarcado; «Crear» arma un torneo por
 *      grupo marcado, con su sistema sugerido, sus jugadores y nada más; «No
 *      separar» los deja a todos en el torneo abierto; y los textos cambian
 *      con el idioma.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-grupos.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const G = require(path.join(RAIZ, "js/pareo/grupos.js"));
const TablaExcel = require(path.join(RAIZ, "js/tabla-excel.js"));

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};

/* ==================================================================
   1. Las funciones puras
   ================================================================== */
function pruebaFunciones() {
  console.log("\n=== Sexo, modalidad y fechas ===");
  igual("HOMBRE, Masculino, M y H son masculino", ["HOMBRE", "Masculino", "m", "H"].map(G.leerSexo), ["m", "m", "m", "m"]);
  igual("MUJER, Femenina, F y W son femenino", ["MUJER", "Femenina", "f", "W"].map(G.leerSexo), ["w", "w", "w", "w"]);
  igual("lo que no se reconoce queda vacío (no se adivina)", ["", "Mixto", "X"].map(G.leerSexo), ["", "", ""]);
  igual("Equipo, Equipos y Por equipos son equipo", ["Equipo", "EQUIPOS", "por equipos"].map(G.leerModalidad), ["equipo", "equipo", "equipo"]);
  igual("Individual e Ind. son individual", ["Individual", "ind."].map(G.leerModalidad), ["individual", "individual"]);
  igual("7/17/2015 con 11/19/2011: la columna es mes/día", G.ordenFechas(["7/17/2015", "11/19/2011", "1/4/2017"]), "md");
  igual("17/7/2015: la columna es día/mes", G.ordenFechas(["17/7/2015", "4/1/2017"]), "dm");
  igual("sin pistas, día/mes (como en Costa Rica)", G.ordenFechas(["4/1/2017", ""]), "dm");
  igual("7/17/2015 mes/día → 2015-07-17", G.leerFecha("7/17/2015", "md"), "2015-07-17");
  igual("4/1/2017 día/mes → 2017-01-04", G.leerFecha("4/1/2017", "dm"), "2017-01-04");
  igual("una fecha que no existe queda vacía", G.leerFecha("2/30/2015", "md"), "");
  igual("AAAA-MM-DD se deja igual", G.leerFecha("2014-03-09", "md"), "2014-03-09");

  console.log("\n=== Los grupos ===");
  const j = (sexo, categoria, modalidad) => ({ nombre: "x", sexo, categoria, modalidad });
  const r1 = G.agrupar([j("m", "B", "equipo"), j("w", "A", "individual"), j("m", "A", "individual"), j("w", "A", "individual")]);
  igual("separa por las tres cuando las tres cambian", r1.dimensiones, ["modalidad", "categoria", "sexo"]);
  igual("en orden: individual primero, la categoría y masculino antes que femenino",
    r1.grupos.map((g) => [g.modalidad, g.categoria, g.sexo, g.jugadores.length]),
    [["individual", "A", "m", 1], ["individual", "A", "w", 2], ["equipo", "B", "m", 1]]);
  const r2 = G.agrupar([j("m", "A", "individual"), j("w", "A", "individual")]);
  igual("lo que no cambia no parte (todos individual, todos A)", r2.dimensiones, ["sexo"]);
  igual("una lista sin nada que separar es un solo grupo", G.agrupar([j("", "", ""), j("", "", "")]).grupos.length, 1);
  igual("sistema: 1 → ninguno, 8 → todos contra todos, 9 → suizo",
    [G.sistemaSugerido(1), G.sistemaSugerido(8), G.sistemaSugerido(9)], [null, "todos", "suizo"]);
}

/* ==================================================================
   2. La página
   ================================================================== */
// Como el Excel del MEP: dos filas de título, la cabecera y una fila por
// inscrito. Los nombres son inventados.
function excelJde() {
  const filas = [
    ["Report Generation – Juegos Deportivos Estudiantiles"],
    ["Exported On: 20/10/2026 18:49:30"],
    ["No", "Tipo", "Documento de identidad", "Nombre", "FDN", "Nacionalidad", "Sexo", "Edad", "Nombre de Centro Educativo", "Circuito", "Dirección Regional", "Categoría", "Tipo de Dirección", "Equipo/Ind", "Fecha"],
  ];
  let n = 0;
  const poner = (cuantos, sexo, cat, mod, fdn) => {
    for (let i = 0; i < cuantos; i++) {
      filas.push([String(n), "CÉDULA:", "100000" + n, `PRUEBA ${sexo === "MUJER" ? "ANA" : "LUIS"} ${cat}${mod[0]}${i}`, fdn, "COSTARRICENSE", sexo, "10", "ESCUELA DE PRUEBA " + (i % 2), "01", "Prueba", cat, "Colegio", mod, "01 Mar"]);
      n++;
    }
  };
  poner(3, "HOMBRE", "A", "Individual", "1/4/2017");
  poner(1, "MUJER", "A", "Individual", "7/17/2015");
  poner(10, "HOMBRE", "B", "Individual", "11/19/2011");
  poner(4, "HOMBRE", "B", "Equipo", "1/4/2017");
  poner(2, "MUJER", "B", "Equipo", "1/4/2017");
  return Buffer.from(TablaExcel.armar([{ nombre: "Sheet1", filas }]));
}

async function abrir(browser) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.goto(BASE + "/pareo.html", { waitUntil: "networkidle" });
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", {
    name: "Ajedrez_Todos_Regional.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: excelJde(),
  });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  return { ctx, page, errores };
}

const torneos = (page) => page.evaluate(() => {
  const lista = JSON.parse(localStorage.getItem("pareo_lista_v1") || "[]");
  return lista.map((x) => JSON.parse(localStorage.getItem("pareo_torneo_v1_" + x.id)));
});

async function pruebaPagina(browser) {
  console.log("\n=== La sugerencia sale y no agrega a nadie ===");
  let { ctx, page, errores } = await abrir(browser);
  ok(await page.$eval("#pi-sugerencia", (n) => n.checkVisibility()), "el panel de la sugerencia se ve");
  igual("todavía nadie inscrito", await page.textContent("#pi-cuenta"), "0");
  igual("el título dice cuántos torneos", await page.textContent("#pi-sugerencia-titulo"), "Sugerencia: separar en 5 torneos");
  ok(/20 jugadores/.test(await page.textContent("#pi-sugerencia")), "cuenta a los 20 (las dos filas de título no son jugadores)");
  const filas = await page.$$eval("#pi-sugerencia li", (lis) => lis.map((li) => [li.querySelector("label").textContent, li.querySelector("input").checked]));
  igual("los cinco grupos, en orden y con el de un jugador desmarcado", filas.map(([t, c]) => [t.split(" — ")[0], c]), [
    ["Individual · Categoría A · Abierto", true],
    ["Individual · Categoría A · Mujeres", false],
    ["Individual · Categoría B · Abierto", true],
    ["Equipos · Categoría B · Abierto", true],
    ["Equipos · Categoría B · Mujeres", true],
  ]);
  ok(/todos contra todos/.test(filas[0][0]) && /suizo/.test(filas[2][0]), "sugiere todos contra todos con 3 y suizo con 10");
  ok(/no alcanza/.test(filas[1][0]), "al de un solo jugador le dice que no alcanza");
  ok(/no equipos/.test(await page.textContent("#pi-sugerencia")), "avisa que Pareo Integral empareja jugadores, no equipos");
  ok(/en el abierto pueden jugar también mujeres/.test(await page.textContent("#pi-sugerencia")), "dice que en el abierto juegan también mujeres (art. 66)");
  ok(/art\. 66/.test(await page.textContent("#pi-sugerencia")), "dice de dónde sale el sistema sugerido");
  igual("el botón cuenta los marcados", await page.textContent("#pi-sugerencia-crear"), "Crear los 4 torneos marcados");

  console.log("\n=== En inglés ===");
  await page.click("#pi-idioma");
  igual("el título cambia de idioma", await page.textContent("#pi-sugerencia-titulo"), "Suggestion: split into 5 tournaments");
  ok(/Individual · Category A · Open/.test(await page.textContent("#pi-sugerencia")), "los grupos también");
  await page.click("#pi-idioma");

  console.log("\n=== Desmarcar y volver a marcar ===");
  for (const id of ["#pi-sugerencia-g0", "#pi-sugerencia-g2", "#pi-sugerencia-g3", "#pi-sugerencia-g4"]) await page.click(id);
  ok(await page.$eval("#pi-sugerencia-crear", (b) => b.disabled), "sin ninguno marcado, «Crear» no se puede tocar");
  for (const id of ["#pi-sugerencia-g0", "#pi-sugerencia-g2", "#pi-sugerencia-g3", "#pi-sugerencia-g4"]) await page.click(id);

  console.log("\n=== Crear los torneos ===");
  // La ciudad del torneo abierto (la ficha Torneo está oculta: se escribe directo).
  await page.evaluate(() => {
    const c = document.getElementById("pi-form-torneo").elements.ciudad;
    c.value = "Ciudad de Prueba";
    c.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.click("#pi-sugerencia-crear");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  const ts = await torneos(page);
  igual("cuatro torneos (el vacío que estaba abierto se usó para el primero)", ts.length, 4);
  const porNombre = Object.fromEntries(ts.map((x) => [x.nombre, x]));
  igual("cada uno con su nombre de regional y grupo", Object.keys(porNombre).sort(), [
    "Regional Prueba — Equipos · Categoría B · Abierto",
    "Regional Prueba — Equipos · Categoría B · Mujeres",
    "Regional Prueba — Individual · Categoría A · Abierto",
    "Regional Prueba — Individual · Categoría B · Abierto",
  ]);
  const a = porNombre["Regional Prueba — Individual · Categoría A · Abierto"];
  const b = porNombre["Regional Prueba — Individual · Categoría B · Abierto"];
  igual("cuántos en cada uno", ts.map((x) => x.jugadores.length).sort((x, y) => x - y), [2, 3, 4, 10]);
  igual("el de 3 es todos contra todos y el de 10, suizo", [a.sistema, b.sistema], ["todos", "suizo"]);
  ok(b.rondasTotales >= 5, "el suizo tiene al menos 5 rondas (art. 66)", b.rondasTotales);
  ok(ts.every((x) => x.ritmo === "10 min + 2 s por jugada"), "sin ritmo en el abierto, cada uno lleva el mínimo de la normativa");
  ok(ts.every((x) => x.jugadores.every((j) => j.sexo === "m" || j.sexo === "w")), "todos llevan su sexo");
  ok(porNombre["Regional Prueba — Equipos · Categoría B · Mujeres"].jugadores.every((j) => j.sexo === "w"), "las mujeres quedaron en el de mujeres");
  igual("la fecha 11/19/2011 se leyó como mes/día", b.jugadores[0].nacimiento, "2011-11-19");
  igual("el centro educativo es la institución", a.jugadores[0].institucion.startsWith("ESCUELA DE PRUEBA"), true);
  ok(ts.every((x) => x.jugadores.every((j) => !("modalidad" in j) && !("region" in j))), "ni la modalidad ni la regional se guardan en el jugador");
  ok(ts.every((x) => x.jugadores.every((j) => !/Report|Exported/.test(j.nombre))), "las filas de título no entraron como jugadores");
  ok(ts.every((x) => x.ciudad === "Ciudad de Prueba"), "todos copiaron la ciudad del torneo abierto");
  ok(new Set(ts.flatMap((x) => x.jugadores.map((j) => j.id))).size === 19, "cada jugador con su id propio");
  igual("queda abierto el primero, en Jugadores", await page.textContent("#pi-cuenta"), "3");
  igual("«Mis torneos» los lista en el orden de la sugerencia", await page.$$eval("#pi-lista option", (o) => o.map((x) => x.textContent.split(" — ")[1])), [
    "Individual · Categoría A · Abierto", "Individual · Categoría B · Abierto",
    "Equipos · Categoría B · Abierto", "Equipos · Categoría B · Mujeres",
  ]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== No separar: todos al torneo abierto ===");
  ({ ctx, page, errores } = await abrir(browser));
  await page.click("#pi-sugerencia-todos");
  await page.waitForFunction(() => document.getElementById("pi-cuenta").textContent === "20");
  igual("un solo torneo, con los 20", (await torneos(page)).map((x) => x.jugadores.length), [20]);
  ok(!(await page.$eval("#pi-sugerencia", (n) => n.checkVisibility())), "la sugerencia se cierra");
  await ctx.close();

  console.log("\n=== Descartar ===");
  ({ ctx, page, errores } = await abrir(browser));
  await page.click("#pi-sugerencia-descartar");
  igual("nadie inscrito", await page.textContent("#pi-cuenta"), "0");
  ok(!(await page.$eval("#pi-sugerencia", (n) => n.checkVisibility())), "la sugerencia se cierra");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaFunciones();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaPagina(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
