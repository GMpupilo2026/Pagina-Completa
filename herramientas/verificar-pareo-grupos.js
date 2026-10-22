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
const { contestarEtapa } = require("./lib/pareo-etapa");

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
function pruebaCategorias() {
  console.log("\n=== Categoría por año de nacimiento (art. 17 y 18) ===");
  const j = (categoria, nacimiento, modalidad, institucion, sexo) => ({ nombre: "x", categoria, nacimiento, modalidad, institucion: institucion || "E", sexo: sexo || "m" });
  const r = G.revisarCategorias([
    j("B", "2014-05-01", "individual"),          // B: en su categoría
    j("C", "2013-05-01", "individual"),          // C: 2013 es B o C (primaria o secundaria)
    j("E", "2001-05-01", "individual"),          // E: sin límite de abajo
    j("B", "2018-05-01", "equipo"),              // A sube a B por equipos: permitido
    j("D", "2012-05-01", "equipo"),              // C sube a D: permitido
    j("D", "2013-05-01", "equipo"),              // 2013 en D: el de C (secundaria) sube, permitido
    j("C", "2017-05-01", "equipo"),              // A a C: no es un ascenso permitido
    j("B", "2018-05-01", "individual"),          // en individual no se sube
    j("A", "2015-05-01", "equipo"),              // B en A: no se baja
    j("A", "", "individual"),                    // sin fecha
    j("Sub-10", "2018-05-01", "individual"),     // no es una categoría de los JDE
  ], 2026);
  igual("revisa las que tienen categoría A–E y fecha", r.revisados, 9);
  igual("tres ascensos permitidos, cada uno desde su categoría", r.permitidos.map((c) => c.propia + ">" + c.categoria + c.nace), ["A>B2018", "C>D2012", "C>D2013"]);
  igual("los no permitidos, con su motivo", r.noPermitidos.map((c) => c.motivo), ["salto", "individual", "mayor"]);
  igual("uno sin fecha", r.sinFecha.length, 1);
  const tope = G.revisarCategorias([1, 2, 3, 4].map(() => j("B", "2018-01-01", "equipo", "Escuela X")).concat([j("B", "2018-01-01", "equipo", "Escuela Y")]), 2026);
  igual("cuatro que suben en el mismo equipo: el tope es 3, ninguno queda permitido", [tope.noPermitidos.map((c) => c.motivo).join(","), tope.permitidos.length], ["tope,tope,tope,tope", 1]);
  const mujeresYAbierto = G.revisarCategorias([1, 2, 3].map(() => j("B", "2018-01-01", "equipo", "Escuela X", "m")).concat([j("B", "2018-01-01", "equipo", "Escuela X", "w")]), 2026);
  igual("el equipo de mujeres y el abierto cuentan aparte", mujeresYAbierto.permitidos.length, 4);
  igual("otro año: los rangos se corren (2027, A es 2018–2021)", G.rangoCategoria("A", 2027), [2018, 2021]);
}

function pruebaPase() {
  console.log("\n=== Mujeres de equipos al abierto (art. 66.1.g) ===");
  const j = (sexo, institucion, categoria, modalidad) => ({ nombre: sexo + institucion, sexo, institucion, categoria, modalidad: modalidad || "equipo" });
  const lista = [
    j("w", "X", "A"), j("m", "X", "A"), j("m", "X", "A"),        // 1 mujer + abierto: pasa
    j("w", "Y", "A"), j("w", "Y", "A"), j("m", "Y", "A"),        // 2 mujeres + abierto: pasan
    j("w", "Z", "A"), j("w", "Z", "A"), j("w", "Z", "A"), j("m", "Z", "A"), // 3: tienen equipo, no pasan
    j("w", "W", "A"),                                            // sin abierto: aviso
    j("w", "X", "B"),                                            // otra categoría: sin abierto en B
    j("w", "X", "A", "individual"),                              // individual: no se toca
  ];
  const r = G.pasarMujeresAlAbierto(lista, true);
  igual("pasan las de X y las de Y", r.pasadas.map((c) => c.institucion + c.mujeres.length), ["X1", "Y2"]);
  igual("sin abierto al cual pasar: W en A y X en B", r.sinAbierto.map((c) => c.institucion + c.categoria), ["WA", "XB"]);
  igual("las tres de Z y la de individual no se mueven", lista.filter((x) => x.alAbierto).length, 3);
  const g = G.agrupar(lista).grupos.find((x) => x.modalidad === "equipo" && x.categoria === "A" && x.sexo === "m");
  igual("el abierto de equipos A las cuenta (4 hombres + 3 que pasan)", g.jugadores.length, 7);
  G.pasarMujeresAlAbierto(lista, false);
  igual("sin aplicar, nadie queda marcado", lista.filter((x) => x.alAbierto).length, 0);
}

function pruebaHombresEnMujeres() {
  console.log("\n=== Hombres en el torneo de mujeres (art. 66.1) ===");
  igual("la columna del torneo: Mujeres y Rama femenina son mujeres; Abierto y Masculino, el abierto",
    ["Mujeres", "Rama femenina", "Femenino", "Abierto", "Masculino", "Mixto", "", "otra"].map(G.leerTorneo), ["w", "w", "w", "m", "m", "m", "", ""]);
  const j = (sexo, torneo, modalidad) => ({ nombre: sexo + torneo + modalidad, sexo, torneo, modalidad, institucion: "X", categoria: "B" });
  const lista = [j("m", "w", "equipo"), j("m", "w", "individual"), j("w", "m", "equipo"), j("m", "", "equipo"), j("w", "", "equipo")];
  igual("avisa a los hombres anotados en el de mujeres, en equipos y en individual", G.hombresEnMujeres(lista).map((x) => x.modalidad), ["equipo", "individual"]);
  igual("sin columna de torneo, el torneo es el del sexo: nadie que avisar", G.hombresEnMujeres([j("m", "", "equipo"), j("w", "", "equipo")]).length, 0);
  const pase = G.pasarMujeresAlAbierto([j("w", "m", "equipo"), j("m", "", "equipo"), j("m", "", "equipo")], true);
  igual("la mujer que el archivo pone en el abierto no cuenta como «mujeres sin equipo»", pase.pasadas.length + pase.sinAbierto.length, 0);
}

function pruebaTopesYConfig() {
  console.log("\n=== Dos por centro en individual y la configuración de los JDE ===");
  const j = (sexo, institucion, modalidad) => ({ nombre: sexo + institucion, sexo, institucion, categoria: "C", modalidad });
  const r = G.individualesDeMas([j("w", "X", "individual"), j("w", "X", "individual"), j("w", "X", "individual"), j("m", "X", "individual"), j("m", "X", "individual"), j("w", "X", "equipo"), j("w", "X", "equipo"), j("w", "X", "equipo")]);
  igual("solo las tres mujeres de X en individual pasan el tope (los hombres son 2, los equipos no cuentan)", r.map((e) => e.torneo + e.integrantes.length), ["w3"]);
  const c8 = G.configuracionJde(8, { rondasTotales: 3, ritmo: "" });
  const c9 = G.configuracionJde(9, { rondasTotales: 7, ritmo: "15 min + 5 s" });
  igual("8: todos contra todos con sus desempates; el ritmo mínimo si no tenía", [c8.sistema, c8.desempates.join(","), c8.ritmo], ["todos", "DE,SB,WIN,KS", "10 min + 2 s por jugada"]);
  igual("9: suizo, se respetan 7 rondas y el ritmo que ya tenía", [c9.sistema, c9.rondasTotales, c9.ritmo, c9.desempates[0]], ["suizo", 7, "15 min + 5 s", "BH-C1"]);
  igual("con menos de 5 rondas, sube a 5", c8.rondasTotales, 5);
}

function pruebaEtapa() {
  console.log("\n=== La etapa y el lugar: el nombre del evento ===");
  igual("las 27 Direcciones Regionales del art. 56", G.JDE_DIRECCIONES.length, 27);
  igual("una Dirección Regional se reconoce como venga escrita", ["Alajuela", "DRE ALAJUELA", "Dirección Regional de Educación de Alajuela", "sula", "San José Norte", "Prueba"].map(G.direccionDe),
    ["Alajuela", "Alajuela", "Alajuela", "Sulá", "San José Norte", ""]);
  igual("Regional", G.nombreEventoJde({ anio: 2026, etapa: "regional", lugar: "Alajuela" }), "JDE 2026 · Etapa Regional · DRE Alajuela");
  igual("Interregional, con sus regiones", G.nombreEventoJde({ anio: 2026, etapa: "interregional", lugar: "X" }), "JDE 2026 · Etapa Interregional · Interregional X (Coto-Grande de Térraba-Pérez Zeledón)");
  igual("Institucional, con el centro", G.nombreEventoJde({ anio: 2026, etapa: "institucional", lugar: "Liceo de Prueba" }), "JDE 2026 · Etapa Institucional · Liceo de Prueba");
  igual("Institucional, sin el centro", G.nombreEventoJde({ anio: 2026, etapa: "institucional", lugar: "" }), "JDE 2026 · Etapa Institucional");
  igual("la Interregional es todos contra todos aunque sean 10 (art. 66.2.c)", [G.configuracionJde(10, {}, "interregional").sistema, G.configuracionJde(10, {}, "regional").sistema], ["todos", "suizo"]);
}

function pruebaCortos() {
  console.log("\n=== Equipos con menos de 3 (art. 66.1.g) ===");
  const j = (sexo, institucion, categoria, modalidad, alAbierto) => ({ nombre: sexo + institucion, sexo, institucion, categoria, modalidad: modalidad || "equipo", alAbierto });
  const r = G.equiposCortos([
    j("m", "X", "A"), j("m", "X", "A"), j("m", "X", "A"),   // 3: está bien
    j("w", "X", "A"), j("w", "X", "A"),                     // mujeres de X: 2, corto
    j("m", "Y", "B"), j("w", "Y", "B", "equipo", true),     // la que pasó cuenta en el abierto: 2, corto
    j("m", "Z", "B", "individual"),                         // individual: no es equipo
  ]);
  igual("los cortos: mujeres de X en A y el abierto de Y en B", r.map((e) => e.institucion + e.categoria + e.torneo + e.integrantes.length), ["XAw2", "YBm2"]);
}

function pruebaRepetidos() {
  console.log("\n=== Inscripciones repetidas (art. 66.1.h) ===");
  const j = (nombre, documento, modalidad, categoria, nacimiento) => ({ nombre, documento, modalidad, categoria, nacimiento: nacimiento || "2014-01-01" });
  const r = G.quitarRepetidos([
    j("ANA", "1-0234-0567", "equipo", "B"), j("ANA", "102340567", "equipo", "B"), j("ANA", "102340567", "equipo", "B"), // la misma, tres veces
    j("LUIS", "2", "individual", "C"), j("LUIS", "2", "equipo", "C"),                                                // dos modalidades
    j("SARA", "", "individual", "A", "2018-02-02"), j("Sara", "", "individual", "A", "2018-02-02"),                 // sin documento: nombre y fecha
    j("SARA", "", "individual", "A", "2019-03-03"),                                                                  // otra Sara (otra fecha)
  ]);
  igual("quedan una Ana, dos Luis y dos Saras", r.lista.map((x) => x.nombre + x.modalidad[0]), ["ANAe", "LUISi", "LUISe", "SARAi", "SARAi"]);
  igual("las repetidas, con cuántas veces", r.repetidos.map((x) => x.jugador.nombre + x.veces), ["ANA3", "SARA2"]);
  igual("Luis, en dos modalidades", r.dosModalidades.map((x) => x.jugador.nombre + ":" + x.inscripciones.map((i) => i.modalidad).join("+")), ["LUIS:individual+equipo"]);
  ok(r.lista.every((x) => !("veces" in x)), "la cuenta no queda pegada al jugador");
}

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
  // Una fecha por jugador (o la misma para todos). Los casos de categoría
  // (art. 17 y 18, normativa 2026): la de A nacida en 2015 es de B (no
  // permitido: no se baja); uno de B individual nacido en 2018 es de A (no
  // permitido: en individual no se sube); tres de B por equipos nacidos en
  // 2017 y dos mujeres igual (permitidos: de A a B, hasta 3 por equipo).
  const poner = (cuantos, sexo, cat, mod, fdn, institucion) => {
    for (let i = 0; i < cuantos; i++) {
      const f = Array.isArray(fdn) ? fdn[i] : fdn;
      filas.push([String(n), "CÉDULA:", "100000" + n, `PRUEBA ${sexo === "MUJER" ? "ANA" : "LUIS"} ${cat}${mod[0]}${i}`, f, "COSTARRICENSE", sexo, "10", typeof institucion === "function" ? institucion(i) : institucion || "ESCUELA DE PRUEBA " + (i % 2), "01", "Prueba", cat, "Colegio", mod, "01 Mar"]);
      n++;
    }
  };
  poner(3, "HOMBRE", "A", "Individual", "1/4/2017");
  poner(1, "MUJER", "A", "Individual", "7/17/2015");
  // De a dos por escuela: el tope de dos por centro en individual (art.
  // 66.1.f) se prueba aparte, en pruebaTopeIndividual.
  poner(10, "HOMBRE", "B", "Individual", ["3/2/2018", ...Array(9).fill("11/19/2014")], (i) => "ESCUELA DE PRUEBA " + Math.floor(i / 2));
  poner(4, "HOMBRE", "B", "Equipo", ["1/4/2017", "2/4/2017", "3/4/2017", "1/4/2014"], "ESCUELA DEL EQUIPO");
  poner(2, "MUJER", "B", "Equipo", "1/4/2017", "ESCUELA DE MUJERES");
  // Una sola mujer de equipos en un centro que presenta equipo abierto: no
  // alcanza para un equipo de mujeres (mínimo 3, art. 66.1.g) y pasa al abierto.
  poner(1, "MUJER", "B", "Equipo", "5/5/2014", "ESCUELA DEL EQUIPO");
  // Y dos más del mismo equipo abierto: quedan 7 y el máximo es 5 (art.
  // 66.1.g). Por omisión juegan los 5 primeros; estos dos, descartados.
  filas.push(["90", "CÉDULA:", "1000090", "PRUEBA SEXTO DEL EQUIPO", "6/6/2014", "COSTARRICENSE", "HOMBRE", "12", "ESCUELA DEL EQUIPO", "01", "Prueba", "B", "Colegio", "Equipo", "01 Mar"]);
  filas.push(["91", "CÉDULA:", "1000091", "PRUEBA SEPTIMO DEL EQUIPO", "7/7/2014", "COSTARRICENSE", "HOMBRE", "12", "ESCUELA DEL EQUIPO", "01", "Prueba", "B", "Colegio", "Equipo", "01 Mar"]);
  // El reporte trae filas repetidas: el séptimo otra vez, con otra fecha de
  // inscripción (se queda una sola), y el sexto también inscrito en
  // individual (dos modalidades: se avisa, art. 66.1.h).
  filas.push(["92", "CÉDULA:", "1000091", "PRUEBA SEPTIMO DEL EQUIPO", "7/7/2014", "COSTARRICENSE", "HOMBRE", "12", "ESCUELA DEL EQUIPO", "01", "Prueba", "B", "Colegio", "Equipo", "05 Aug"]);
  // El sexto, también en individual B (la misma cédula): dos modalidades.
  // El árbitro elige dónde queda (art. 66.1.h).
  filas.push(["93", "CÉDULA:", "1000090", "PRUEBA SEXTO DEL EQUIPO", "6/6/2014", "COSTARRICENSE", "HOMBRE", "12", "ESCUELA DEL EQUIPO", "01", "Prueba", "B", "Colegio", "Individual", "05 Aug"]);
  // Un centro rival en equipos B, abierto y mujeres (3 y 3): un torneo por
  // equipos necesita al menos dos equipos.
  poner(3, "HOMBRE", "B", "Equipo", "2/2/2014", "ESCUELA RIVAL");
  poner(3, "MUJER", "B", "Equipo", "2/2/2014", "ESCUELA RIVAL");
  return Buffer.from(TablaExcel.armar([{ nombre: "Sheet1", filas }]));
}

// Por omisión, el sexto (inscrito en equipos y en individual) queda en
// equipos, como estaba antes de agregarle la fila de individual.
async function abrir(browser, sinDecidir, excel) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.goto(BASE + "/pareo.html", { waitUntil: "networkidle" });
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", {
    name: "Ajedrez_Todos_Regional.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: excel || excelJde(),
  });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  if (!sinDecidir && !excel) await page.click("#pi-dm-0-0");
  return { ctx, page, errores };
}

const torneos = (page) => page.evaluate(() => {
  const lista = JSON.parse(localStorage.getItem("pareo_lista_v1") || "[]");
  return lista.map((x) => JSON.parse(localStorage.getItem("pareo_torneo_v1_" + x.id)));
});

// Una inscripción que dice el torneo aparte del sexo (columna «Torneo»):
// una mujer que juega el abierto y un hombre anotado en el de mujeres.
function excelConTorneo() {
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Categoría", "Equipo/Ind", "Torneo"]];
  for (let i = 0; i < 3; i++) filas.push(["PRUEBA MUJER " + i, "MUJER", "ESCUELA T", "B", "Equipo", "Mujeres"]);
  filas.push(["PRUEBA HOMBRE EN MUJERES", "HOMBRE", "ESCUELA T", "B", "Equipo", "Mujeres"]);
  for (let i = 0; i < 3; i++) filas.push(["PRUEBA HOMBRE " + i, "HOMBRE", "ESCUELA T", "B", "Equipo", "Abierto"]);
  filas.push(["PRUEBA MUJER EN ABIERTO", "MUJER", "ESCUELA T", "B", "Equipo", "Abierto"]);
  return Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas }]));
}

// Tres mujeres del mismo centro en individual B (el tope es 2, art.
// 66.1.f) y otra de otro centro; dos en el abierto.
function excelConTope() {
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Categoría", "Equipo/Ind"]];
  for (let i = 0; i < 3; i++) filas.push(["PRUEBA TOPE " + i, "MUJER", "ESCUELA T", "B", "Individual"]);
  filas.push(["PRUEBA OTRA", "MUJER", "ESCUELA U", "B", "Individual"]);
  filas.push(["PRUEBA ABIERTO 0", "HOMBRE", "ESCUELA T", "B", "Individual"]);
  filas.push(["PRUEBA ABIERTO 1", "HOMBRE", "ESCUELA U", "B", "Individual"]);
  return Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas }]));
}

async function pruebaTopeIndividual(browser) {
  console.log("\n=== Individual: dos por centro (art. 66.1.f) y la configuración de los JDE ===");
  let { ctx, page, errores } = await abrir(browser, true, excelConTope());
  igual("el resumen del centro de más", (await page.textContent("#pi-individuales-de-mas summary")).trim(), "ESCUELA T, categoría B, Mujeres: 3 inscritos, 2 de 2 elegidos");
  ok(/\(ahora: 1\)/.test(await page.textContent("#pi-individuales-de-mas")), "dice cuántas quedan descartadas");
  await page.click("#pi-individuales-de-mas summary");
  const cs = await page.$$eval("#pi-individuales-de-mas li", (l) => l.map((x) => [x.querySelector("input").checked, x.querySelector("input").disabled]));
  igual("vienen marcadas las 2 primeras; con 2, la tercera no se puede marcar", cs, [[true, false], [true, false], [false, true]]);
  // Cambiar: sale la primera, entra la tercera.
  await page.click("#pi-ind-0-0");
  await page.click("#pi-ind-0-2");
  ok(await page.$eval("#pi-config-jde", (c) => c.checked), "la configuración de los JDE viene marcada");
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "regional", "Alajuela");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  let ts = await torneos(page);
  const muj = ts.find((x) => /Mujeres$/.test(x.nombre));
  igual("en el de mujeres quedan las elegidas y la de otro centro", muj.jugadores.map((j) => j.nombre).sort(), ["PRUEBA OTRA", "PRUEBA TOPE 1", "PRUEBA TOPE 2"]);
  igual("con la configuración: todos contra todos, sus desempates, 1 · ½ · 0 y el bye en 1",
    [muj.sistema, muj.desempates.join(","), JSON.stringify(muj.puntos), muj.ritmo], ["todos", "DE,SB,WIN,KS", JSON.stringify({ victoria: 1, tablas: 0.5, derrota: 0, bye: 1 }), "10 min + 2 s por jugada"]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== Sin la configuración, y el botón de la ficha Torneo ===");
  ({ ctx, page, errores } = await abrir(browser, true, excelConTope()));
  await page.click("#pi-config-jde");
  await page.click("#pi-sugerencia-crear");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  ts = await torneos(page);
  const abierto = ts.find((x) => /Abierto$/.test(x.nombre));
  igual("sin marcar, copia los desempates y el ritmo del torneo abierto", [abierto.desempates.join(","), abierto.ritmo], ["BH-C1,BH,SB,DE,WIN", ""]);
  await page.click('[data-ficha="torneo"]');
  ok(!(await page.$eval("#pi-config-jde-aplicar", (b) => b.disabled)), "antes de la ronda 1, el botón se puede tocar");
  await page.click("#pi-config-jde-aplicar");
  await contestarEtapa(page, "regional", "Alajuela");
  // Guardar viene después de que se cierra el diálogo (es asíncrono): se
  // espera lo guardado, no el diálogo. En el CI, más lento, se leía antes.
  const guardadoCon = (re) => page.waitForFunction((fuente) => {
    const x = JSON.parse(localStorage.getItem("pareo_torneo_v1_" + localStorage.getItem("pareo_abierto_v1")) || "null");
    return x && new RegExp(fuente).test(x.nombre);
  }, re);
  await guardadoCon("^JDE 2026 · Etapa Regional");
  const abiertoAhora = await page.evaluate(() => JSON.parse(localStorage.getItem("pareo_torneo_v1_" + localStorage.getItem("pareo_abierto_v1"))));
  igual("el botón deja la configuración de los JDE en el torneo abierto", [abiertoAhora.sistema, abiertoAhora.desempates.join(","), abiertoAhora.ritmo],
    [abiertoAhora.jugadores.length <= 8 ? "todos" : "suizo", abiertoAhora.jugadores.length <= 8 ? "DE,SB,WIN,KS" : "BH-C1,BH,SB,DE,WIN", "10 min + 2 s por jugada"]);
  igual("y el formulario lo muestra", await page.$eval('#pi-form-torneo [name="ritmo"]', (i) => i.value), "10 min + 2 s por jugada");
  igual("le pone el nombre del evento, con su grupo", abiertoAhora.nombre, "JDE 2026 · Etapa Regional · DRE Alajuela — Abierto");

  console.log("\n=== La etapa, otra vez: cancelar, sin elegir, Interregional ===");
  const leerAbierto = () => page.evaluate(() => JSON.parse(localStorage.getItem("pareo_torneo_v1_" + localStorage.getItem("pareo_abierto_v1"))));
  await page.click("#pi-config-jde-aplicar");
  await page.waitForSelector('dialog[data-avisos="formulario"][open]');
  await page.click('dialog[data-avisos="formulario"][open] [data-avisos-cancelar]');
  igual("cancelar no cambia nada", (await leerAbierto()).nombre, "JDE 2026 · Etapa Regional · DRE Alajuela — Abierto");
  await page.click("#pi-config-jde-aplicar");
  await page.waitForSelector('dialog[data-avisos="formulario"][open]');
  igual("la segunda vez viene en la etapa que ya tenía", await page.$eval('dialog[data-avisos="formulario"][open] select[name="etapa"]', (x) => x.value), "regional");
  await page.selectOption('dialog[data-avisos="formulario"][open] select[name="etapa"]', "interregional");
  await page.click('dialog[data-avisos="formulario"][open] [data-avisos-aceptar]');
  await page.waitForFunction(() => document.querySelector('dialog[data-avisos="formulario"][open] [name="lugar"]'));
  igual("la Interregional viene en la de su Dirección Regional (Alajuela → III)", await page.$eval('dialog[data-avisos="formulario"][open] [name="lugar"]', (x) => x.value), "III");
  await page.selectOption('dialog[data-avisos="formulario"][open] [name="lugar"]', "");
  await page.click('dialog[data-avisos="formulario"][open] [data-avisos-aceptar]');
  await page.waitForFunction(() => document.querySelector('dialog[data-avisos="formulario"][open] [name="lugar"]'));
  ok(/Elige a cuál corresponde/.test(await page.textContent("body")), "sin elegir la interregional, lo pide y vuelve a preguntar");
  await page.selectOption('dialog[data-avisos="formulario"][open] [name="lugar"]', "III");
  await page.click('dialog[data-avisos="formulario"][open] [data-avisos-aceptar]');
  await guardadoCon("Etapa Interregional");
  const inter = await leerAbierto();
  igual("Interregional: el nombre y todos contra todos", [inter.nombre, inter.sistema, inter.jde.etapa], ["JDE 2026 · Etapa Interregional · Interregional III (Alajuela-Occidente) — Abierto", "todos", "interregional"]);
  ok((await page.$$eval("#pi-lista option", (o) => o.map((x) => x.textContent))).includes(inter.nombre), "«Mis torneos» trae el nombre nuevo");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaTorneoEnArchivo(browser) {
  console.log("\n=== El torneo dicho en el archivo: un hombre en el de mujeres ===");
  const { ctx, page, errores } = await abrir(browser, true, excelConTorneo());
  const tam = async () => Object.fromEntries(await page.$$eval("#pi-sugerencia fieldset li", (l) => l.map((x) => [x.querySelector("label").textContent.split(" — ")[0], Number((/— (\d+) jugador/.exec(x.textContent) || [])[1])])));
  igual("cada uno va al torneo que dice el archivo (4 y 4)", await tam(), { "Abierto": 4, "Mujeres": 4 });
  const avisos = await page.$$eval("#pi-hombres-lista li", (l) => l.map((x) => x.textContent)).catch(() => []);
  igual("avisa del hombre en el de mujeres, con su centro y su torneo", avisos, ["Aviso: PRUEBA HOMBRE EN MUJERES (ESCUELA T) está anotado como hombre en Equipos · Categoría B · Mujeres."]);
  ok(!/MUJER EN ABIERTO/.test(await page.textContent("#pi-sugerencia")), "la mujer que juega el abierto no se avisa (en el abierto juegan también mujeres)");
  ok(!(await page.$("#pi-pase-abierto")), "con 4 en el de mujeres, nadie pasa al abierto");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaDosModalidades(browser) {
  console.log("\n=== Dos modalidades: el árbitro elige dónde queda (art. 66.1.h) ===");
  const { ctx, page, errores } = await abrir(browser, true);
  const enIndividualB = async () => Number((/— (\d+) jugador/.exec(await page.$eval("#pi-sugerencia fieldset li:has-text('Individual · Categoría B · Abierto')", (x) => x.textContent)) || [])[1]);
  ok(/PRUEBA SEXTO DEL EQUIPO \(ESCUELA DEL EQUIPO\): Equipos B y Individual B/.test(await page.textContent("#pi-dos-modalidades legend")), "dice quién y en qué dos modalidades");
  ok(await page.$eval("#pi-dm-0-x", (r) => r.checked), "viene en «Todavía no decido»");
  ok(/Falta 1 por decidir/.test(await page.textContent("#pi-dm-faltan")), "cuenta los que faltan por decidir");
  igual("sin decidir, cuenta en individual B (10 + él)", await enIndividualB(), 11);
  await page.click("#pi-dm-0-1");
  igual("queda en individual: sigue ahí", await enIndividualB(), 11);
  ok(!/SEXTO DEL EQUIPO/.test(await page.textContent("#pi-equipos-de-mas")), "y ya no está en el equipo");
  await page.click("#pi-dm-0-0");
  igual("queda en equipos: sale de individual B", await enIndividualB(), 10);
  ok(/SEXTO DEL EQUIPO/.test(await page.textContent("#pi-equipos-de-mas")), "y vuelve al equipo");
  ok(/Todos decididos/.test(await page.textContent("#pi-dm-faltan")), "ya no falta nadie por decidir");
  ok(await page.$eval("#pi-dm-0-0", (r) => document.activeElement === r), "el foco se queda en la opción elegida");
  await page.click("#pi-dm-0-x");
  igual("«Todavía no decido»: vuelve a las dos", await enIndividualB(), 11);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaPagina(browser) {
  console.log("\n=== La sugerencia sale y no agrega a nadie ===");
  let { ctx, page, errores } = await abrir(browser);
  ok(await page.$eval("#pi-sugerencia", (n) => n.checkVisibility()), "el panel de la sugerencia se ve");
  igual("todavía nadie inscrito", await page.textContent("#pi-cuenta"), "0");
  igual("el título dice cuántos torneos", await page.textContent("#pi-sugerencia-titulo"), "Sugerencia: separar en 5 torneos");
  ok(/27 jugadores/.test(await page.textContent("#pi-sugerencia")), "cuenta a los 27 (las dos filas de título no son jugadores)");
  const filas = await page.$$eval("#pi-sugerencia fieldset li", (lis) => lis.map((li) => [li.querySelector("label").textContent, li.querySelector("input").checked]));
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
  console.log("\n=== Categoría por año de nacimiento ===");
  ok(/Se revisaron 27 inscritos: 20 están en la categoría de su año de nacimiento, 5 suben de categoría como lo permite la normativa y 2 no están permitidos/.test(await page.textContent("#pi-revision-categorias")), "el resumen cuenta bien", await page.textContent("#pi-revision-categorias"));
  const no = await page.$$eval("#pi-cat-no li", (l) => l.map((x) => x.textContent));
  const si = await page.$$eval("#pi-cat-si li", (l) => l.map((x) => x.textContent));
  igual("dos no permitidos y cinco permitidos", [no.length, si.length], [2, 5]);
  ok(no.every((x) => x.startsWith("No permitido:")) && si.every((x) => x.startsWith("Permitido:")), "cada uno dice escrito si está permitido");
  ok(no.some((x) => /nació en 2015 y la categoría A es para quienes nacieron desde 2017/.test(x)), "la de A nacida en 2015: no se baja de categoría");
  ok(no.some((x) => /nació en 2018, es de la categoría A y está en la B individual/.test(x)), "el de B individual nacido en 2018: en individual no se sube");
  ok(si.every((x) => /ESCUELA DE(L EQUIPO| MUJERES)/.test(x) && /sube a la B por equipos/.test(x)), "los de equipos nacidos en 2017: ascenso permitido de A a B");

  console.log("\n=== Mujeres de equipos que pasan al abierto ===");
  ok(await page.$eval("#pi-pase-abierto-si", (c) => c.checked), "la casilla viene marcada");
  const pase = await page.$$eval("#pi-pase-lista li", (l) => l.map((x) => x.textContent));
  ok(pase.length === 1 && /ESCUELA DEL EQUIPO, categoría B: PRUEBA ANA BE0 pasa al equipo abierto, que queda con 7 \(tenía 6\)/.test(pase[0]), "la sola mujer de un centro con equipo abierto pasa al abierto", pase.join(" | "));
  const sin = await page.$$eval("#pi-pase-sin li", (l) => l.map((x) => x.textContent));
  ok(sin.length === 1 && /ESCUELA DE MUJERES, categoría B/.test(sin[0]), "las dos de un centro sin equipo abierto se avisan aparte", sin.join(" | "));
  const tam = async () => Object.fromEntries(await page.$$eval("#pi-sugerencia fieldset li", (l) => l.map((x) => [x.querySelector("label").textContent.split(" — ")[0], Number((/— (\d+) jugador/.exec(x.textContent) || [])[1])])));
  igual("con la casilla: el abierto de equipos B tiene 5 + 3 del rival y el de mujeres 2 + 3", [(await tam())["Equipos · Categoría B · Abierto"], (await tam())["Equipos · Categoría B · Mujeres"]], [8, 5]);
  await page.click("#pi-pase-abierto-si");
  igual("sin la casilla: vuelve al de mujeres (el abierto, con 6 inscritos, sigue en 5; mujeres 3, más los del rival)", [(await tam())["Equipos · Categoría B · Abierto"], (await tam())["Equipos · Categoría B · Mujeres"]], [8, 6]);
  await page.click("#pi-pase-abierto-si");

  console.log("\n=== Inscripciones repetidas ===");
  ok(/1 estudiantes venían inscritos más de una vez en la misma modalidad y categoría \(1 filas de más\)/.test(await page.textContent("#pi-repetidos")), "la fila repetida se quita y se avisa", await page.textContent("#pi-repetidos"));
  ok(/PRUEBA SEPTIMO DEL EQUIPO \(ESCUELA DEL EQUIPO\): 2 veces/.test(await page.textContent("#pi-repetidos-lista")), "dice quién y cuántas veces");

  console.log("\n=== Equipos con más de 5: se eligen los 5 ===");
  ok(/Equipos con más de 5 inscritos/.test(await page.textContent("#pi-equipos-de-mas")), "el panel avisa del equipo de más de 5");
  igual("el resumen del equipo", (await page.textContent("#pi-equipos-de-mas summary")).trim(), "ESCUELA DEL EQUIPO, categoría B, Abierto: 7 inscritos, 5 de 5 elegidos");
  ok(/\(ahora: 2\)/.test(await page.textContent("#pi-equipos-de-mas")), "dice cuántos quedan descartados");
  await page.click("#pi-equipos-de-mas summary");
  const casillas = () => page.$$eval("#pi-equipos-de-mas li", (l) => l.map((x) => [x.querySelector("label").textContent, x.querySelector("input").checked, x.querySelector("input").disabled]));
  let cs = await casillas();
  igual("vienen marcados los 5 primeros de la inscripción", cs.map((c) => c[1]), [true, true, true, true, true, false, false]);
  ok(cs[5][2] && cs[6][2], "con 5 marcados, los otros no se pueden marcar");
  ok(/SEXTO DEL EQUIPO — descartado/.test(cs[5][0]), "el que no juega dice «descartado»");
  ok(/27 jugadores/.test(await page.textContent("#pi-sugerencia-titulo + p")), "los descartados no cuentan en el total");
  // Cambiar: sale el primero, entra el séptimo.
  await page.click("#pi-eq-0-0");
  cs = await casillas();
  ok(!cs[5][2] && !cs[6][2], "con 4 marcados, se puede marcar otro");
  ok(await page.$eval("#pi-equipos-de-mas details", (d) => d.open), "el equipo sigue abierto después de cambiar");
  await page.click("#pi-eq-0-6");
  cs = await casillas();
  igual("queda el séptimo en lugar del primero", cs.map((c) => c[1]), [false, true, true, true, true, false, true]);

  console.log("\n=== Equipos con menos de 3 ===");
  const cortos = async () => page.$$eval("#pi-cortos-lista li", (l) => l.map((x) => x.textContent)).catch(() => []);
  let cl = await cortos();
  ok(cl.length === 1 && /^Aviso: ESCUELA DE MUJERES, categoría B, Mujeres: solo 2 \(PRUEBA ANA BE0, PRUEBA ANA BE1\)\.$/.test(cl[0]), "el equipo de 2 mujeres se avisa, con quiénes son", cl.join(" | "));
  // Dejar el abierto del equipo en 2: salta el aviso; volver a 5: se va.
  for (const i of [1, 2, 3]) await page.click("#pi-eq-0-" + i);
  cl = await cortos();
  ok(cl.some((x) => /ESCUELA DEL EQUIPO, categoría B, Abierto: solo 2/.test(x)), "al dejar el equipo abierto en 2 con las casillas, también avisa", cl.join(" | "));
  for (const i of [1, 2, 3]) await page.click("#pi-eq-0-" + i);
  cl = await cortos();
  ok(!cl.some((x) => /ESCUELA DEL EQUIPO/.test(x)), "al volver a 5, ese aviso se va");

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
  await contestarEtapa(page, "regional", "Alajuela");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  const ts = await torneos(page);
  igual("cuatro torneos (el vacío que estaba abierto se usó para el primero)", ts.length, 4);
  const porNombre = Object.fromEntries(ts.map((x) => [x.nombre, x]));
  igual("cada uno con su nombre de regional y grupo", Object.keys(porNombre).sort(), [
    "JDE 2026 · Etapa Regional · DRE Alajuela — Equipos · Categoría B · Abierto",
    "JDE 2026 · Etapa Regional · DRE Alajuela — Equipos · Categoría B · Mujeres",
    "JDE 2026 · Etapa Regional · DRE Alajuela — Individual · Categoría A · Abierto",
    "JDE 2026 · Etapa Regional · DRE Alajuela — Individual · Categoría B · Abierto",
  ]);
  const a = porNombre["JDE 2026 · Etapa Regional · DRE Alajuela — Individual · Categoría A · Abierto"];
  const b = porNombre["JDE 2026 · Etapa Regional · DRE Alajuela — Individual · Categoría B · Abierto"];
  // En un torneo por equipos, cada «jugador» es un equipo y las personas
  // están en sus integrantes.
  const personas = (x) => (x.tipo === "equipos" ? x.jugadores.flatMap((e) => e.integrantes) : x.jugadores);
  igual("cuántos en cada uno (los de equipos, en equipos: 2 y 2)", ts.map((x) => x.jugadores.length).sort((x, y) => x - y), [2, 2, 3, 10]);
  const abiertoB = porNombre["JDE 2026 · Etapa Regional · DRE Alajuela — Equipos · Categoría B · Abierto"];
  igual("cada torneo guarda su etapa, su lugar y su grupo", [abiertoB.jde, abiertoB.grupo], [{ anio: 2026, etapa: "regional", lugar: "Alajuela" }, "Equipos · Categoría B · Abierto"]);
  igual("los de equipos son torneos por equipos, con puntos de encuentro", [abiertoB.tipo, JSON.stringify(abiertoB.puntos)], ["equipos", JSON.stringify({ victoria: 2, tablas: 1, derrota: 0, bye: 1 })]);
  igual("un equipo por centro, con sus integrantes", abiertoB.jugadores.map((e) => e.nombre + ":" + e.integrantes.length).sort(), ["ESCUELA DEL EQUIPO:5", "ESCUELA RIVAL:3"]);
  ok(personas(abiertoB).some((j) => j.sexo === "w" && /ANA/.test(j.nombre)), "la que pasó al abierto está ahí, y sigue anotada como mujer");
  ok(ts.every((x) => personas(x).every((j) => !("alAbierto" in j) && !("documento" in j))), "ni la marca del pase ni el documento se guardan en el jugador");
  const nombresB = abiertoB.jugadores.find((e) => e.nombre === "ESCUELA DEL EQUIPO").integrantes.map((j) => j.nombre);
  ok(nombresB.includes("PRUEBA SEPTIMO DEL EQUIPO") && !nombresB.includes("PRUEBA SEXTO DEL EQUIPO") && !nombresB.includes("PRUEBA LUIS BE0"), "el abierto B lleva a los 5 elegidos, no a los descartados", nombresB.join(", "));
  ok(!ts.some((x) => personas(x).some((j) => j.nombre === "PRUEBA SEXTO DEL EQUIPO")), "el descartado no está en ningún torneo");
  igual("el de 3 es todos contra todos y el de 10, suizo", [a.sistema, b.sistema], ["todos", "suizo"]);
  ok(b.rondasTotales >= 5, "el suizo tiene al menos 5 rondas (art. 66)", b.rondasTotales);
  ok(ts.every((x) => x.ritmo === "10 min + 2 s por jugada"), "sin ritmo en el abierto, cada uno lleva el mínimo de la normativa");
  ok(ts.every((x) => personas(x).every((j) => j.sexo === "m" || j.sexo === "w")), "todos llevan su sexo");
  ok(personas(porNombre["JDE 2026 · Etapa Regional · DRE Alajuela — Equipos · Categoría B · Mujeres"]).every((j) => j.sexo === "w" && /ESCUELA (DE MUJERES|RIVAL)/.test(j.institucion)), "en el de mujeres quedaron las del centro sin equipo abierto (y las del rival)");
  ok(b.jugadores.some((j) => j.nacimiento === "2014-11-19"), "la fecha 11/19/2014 se leyó como mes/día");
  igual("el centro educativo es la institución", a.jugadores[0].institucion.startsWith("ESCUELA DE PRUEBA"), true);
  ok(ts.every((x) => personas(x).every((j) => !("modalidad" in j) && j.region === "Prueba")), "la modalidad no se guarda en el jugador; la Dirección Regional sí (la usa la lista de clasificados)");
  ok(ts.every((x) => personas(x).every((j) => !/Report|Exported/.test(j.nombre))), "las filas de título no entraron como jugadores");
  ok(ts.every((x) => x.ciudad === "Ciudad de Prueba"), "todos copiaron la ciudad del torneo abierto");
  ok(new Set(ts.flatMap((x) => personas(x).map((j) => j.id))).size === 26, "cada jugador con su id propio");
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
  await page.waitForFunction(() => document.getElementById("pi-cuenta").textContent === "27");
  igual("un solo torneo, con los 27", (await torneos(page)).map((x) => x.jugadores.length), [27]);
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
  pruebaCategorias();
  pruebaPase();
  pruebaRepetidos();
  pruebaCortos();
  pruebaHombresEnMujeres();
  pruebaTopesYConfig();
  pruebaEtapa();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaPagina(browser); await pruebaDosModalidades(browser); await pruebaTorneoEnArchivo(browser); await pruebaTopeIndividual(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
