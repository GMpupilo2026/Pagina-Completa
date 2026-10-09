/* Comprueba el lector de chess-results de la Edge Function
   seleccion-chess-results (supabase/functions/seleccion-chess-results/index.ts),
   sin red y sin Deno: saca del archivo sus lectores, les quita los tipos de
   TypeScript con el propio Node y los corre contra HTML de prueba.

   El HTML copia la FORMA de las páginas reales de la Etapa Nacional JDE 2026,
   categoría D (tnr1426183 y compañía, leídas el 8/10/2026): la ficha de un
   jugador con su tabla de pares (`Class="CRs1"`, con mayúscula, y «Fecha de
   nacimiento » con un espacio al final) y la de rondas, cuya celda «Res.»
   trae OTRA tabla adentro (un regex «hasta el próximo </td>» se corta ahí);
   la clasificación de equipos en art=0; el ranking inicial de equipos en
   art=16; un todos contra todos que dice «Cuadro cruzado». Los nombres son
   inventados.

   Lo que se rompe callado acá: un resultado que se lee de la tabla anidada
   equivocada, una lista que trae solo a quien jugó, un año de nacimiento que
   no se encuentra, o una dirección que no es de chess-results y se pide igual.

   Ver «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-seleccion-chess-results.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { stripTypeScriptTypes } = require("module");

const fuente = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "seleccion-chess-results", "index.ts"), "utf8");
const desde = fuente.indexOf("function texto(");
const hasta = fuente.indexOf("// ------------------------------------------------------------- la función");
const js = stripTypeScriptTypes(fuente.slice(desde, hasta).replace(/export function/g, "function"));
const L = new Function(js + "\nreturn { leerTitulos, leerPortada, leerClasificacion, leerJugadoresDeEquipos, leerFicha, direccion };")();

let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
    else console.log("  ✓ " + nombre);
}

const res = (color, r) => `<td class="CR"><table><tr><td><div class="Farbe${color}T"></div></td><td class="CR">${r}</td></tr></table></td>`;
const ronda = (clase, rd, rival, r, color) => `<tr class="${clase}"><td class="CRc">${rd}</td><td class="CRc">2</td><td class="CRc">15</td><td class="CR"></td>` +
    `<td class="CR">${rival}</td><td class="CRr">1420</td><td class="CRc">2,5</td>${res(color, r)}</tr>\r\n`;
const FICHA = `<div class="defaultDialog"><h2>Torneo de Prueba D Equipos Absoluto Blitz </h2></div><div class="defaultDialog"><h2>Información de jugadores</h2>` +
    `<table Class="CRs1" border="0" cellpadding="1" cellspacing="1" bgcolor=""><tr><td class="CR">Nombre</td><td class="CR">Quesada Arias, Tomás</td></tr>` +
    `<tr><td class="CR">Ranking inicial</td><td class="CR">1</td></tr><tr><td class="CR">Elo nacional</td><td class="CR">1677</td></tr>` +
    `<tr><td class="CR">Elo internacional</td><td class="CR">1719</td></tr><tr><td class="CR">Código nacional</td><td class="CR">11608</td></tr>` +
    `<tr><td class="CR">Código FIDE</td><td class="CR">6500001</td></tr><tr><td class="CR">Fecha de nacimiento </td><td class="CR">2010</td></tr></table>` +
    `<p Class="CRlz">&nbsp;</p><table class="CRs1" border="0" cellpadding="1" cellspacing="1">\r\n` +
    `<tr class="CRg1b"><th class="CRc">Rd.</th><th class="CRc">M.</th><th class="CRc">No.Ini.</th><th class="CR"></th><th class="CR">Nombre</th><th class="CRr">FIDE</th><th class="CRc">Pts.</th><th class="CRc">Res.</th></tr>\r\n` +
    ronda("CRg2", 1, "Mora Lima, Pablo", "1", "w") + ronda("CRg1", 2, "Solís Ruiz, Ana", "&frac12;", "s") +
    ronda("CRg2", 3, "Brenes Paz, Leo", "- 1K", "w") + ronda("CRg1", 4, "bye", "- 1", "w") + ronda("CRg2", 5, "Jara Sol, Iván", "0", "s") + `</table></div>`;

console.log("\n=== La ficha de un jugador (art=9) ===");
const f = L.leerFicha(FICHA);
igual("los datos de la tabla de pares (con «Class» en mayúscula y el espacio al final)",
    [f.nombre, f.fideId, f.codigoNacional, f.eloNacional, f.eloFide, f.nacimiento], ["Quesada Arias, Tomás", "6500001", "11608", 1677, 1719, 2010]);
igual("las cinco rondas, con el resultado de la tabla anidada", f.partidas.map((p) => [p.ronda, p.rival, p.res]),
    [[1, "Mora Lima, Pablo", "1"], [2, "Solís Ruiz, Ana", "½"], [3, "Brenes Paz, Leo", "- 1K"], [4, "bye", "- 1"], [5, "Jara Sol, Iván", "0"]]);
const sinNac = L.leerFicha(FICHA.replace("2010", "").replace("6500001", "0"));
igual("sin año y con código FIDE «0»: nacimiento null y sin código", [sinNac.nacimiento, sinNac.fideId], [null, ""]);
igual("con fecha completa toma el año", L.leerFicha(FICHA.replace(">2010<", ">14.03.2011<")).nacimiento, 2011);

console.log("\n=== La portada (art=0) ===");
const tabla = (enc, filas) => `<table class="CRs1"><tr class="CRng1b">${enc.map((e) => `<th class="CR">${e}</th>`).join("")}</tr>` +
    filas.map((fl, i) => `<tr class="CRng${i % 2 ? 1 : 2} CRC">${fl.map((c) => `<td class="CR">${c}</td>`).join("")}</tr>`).join("") + `</table>`;
const equiposHtml = `<h2>Torneo de Prueba D Equipos Femenino </h2><h2>Clasificación Final después de 5 rondas</h2>` +
    tabla(["Rk.", "No.Ini.", "Equipo", "Partidas", "+", "=", "-", "Des 1"], [["1", "2", "Liceo del Valle", "5", "4", "0", "1", "8"], ["2", "1", "Colegio del Río", "5", "3", "2", "0", "8"]]);
igual("una clasificación de equipos", L.leerPortada(equiposHtml), { equipos: true, clasificacion: [{ puesto: 1, nombre: "Liceo del Valle" }, { puesto: 2, nombre: "Colegio del Río" }], cantidad: 0 });
igual("y su ronda", L.leerTitulos(equiposHtml), { titulo: "Torneo de Prueba D Equipos Femenino", ronda: "Clasificación Final después de 5 rondas", rondasJugadas: 5, final: true });
const inicial = `<h2>Torneo de Prueba D Individual Absoluto </h2>` + tabla(["No.", "", "Nombre", "FIDE-ID", "FIDE", "EloN", "Club/Ciudad"],
    [["1", "", "Uno, Ana", "1", "1500", "1600", "A"], ["2", "", "Dos, Beto", "2", "0", "1400", "B"], ["3", "", "Tres, Cata", "3", "0", "0", "C"]]);
igual("una lista inicial: individual, con su cantidad", L.leerPortada(inicial), { equipos: false, clasificacion: [], cantidad: 3 });
igual("en vivo: «después de la ronda 3»", L.leerTitulos("<h2>T</h2><h2>Clasificación después de la ronda 3</h2>").rondasJugadas, 3);
igual("un todos contra todos («Cuadro cruzado») no inventa rondas", L.leerTitulos("<h2>T</h2><h2>Cuadro cruzado por clasificación (Pts.)</h2>").rondasJugadas, 0);

console.log("\n=== La clasificación (art=1) y los jugadores de equipos (art=16) ===");
igual("puesto y nombre", L.leerClasificacion(tabla(["Rk.", "No.Ini.", "", "", "Nombre", "FIDE", "EloN", "Club/Ciudad", "Des 1"],
    [["1", "2", "", "", "Dos, Beto", "0", "1400", "B", "5"], ["2", "1", "", "", "Uno, Ana", "1500", "1600", "A", "4"]])),
    [{ puesto: 1, nombre: "Dos, Beto" }, { puesto: 2, nombre: "Uno, Ana" }]);
igual("cada jugador con su equipo, también quien no jugó", L.leerJugadoresDeEquipos(tabla(["No.", "", "", "Nombre", "FIDE-ID", "FIDE", "EloN", "Equipo", "M."],
    [["1", "", "", "Uno, Ana", "1", "1500", "1600", "Liceo del Valle", "1"], ["2", "", "", "Suplente, Eva", "0", "0", "0", "Liceo del Valle", "5"]])),
    [{ nombre: "Uno, Ana", equipo: "Liceo del Valle" }, { nombre: "Suplente, Eva", equipo: "Liceo del Valle" }]);
igual("el lector pide art=16 (no art=4, que trae solo a quien jugó)", /&art=16"/.test(fuente) && !/&art=4"/.test(fuente), true);

console.log("\n=== La dirección ===");
igual("cualquier página de un torneo de chess-results", L.direccion("https://s3.chess-results.com/tnr1423856.aspx?lan=2&art=1"),
    { tnr: "1423856", servidor: "s3.chess-results.com", ver: "https://s3.chess-results.com/tnr1423856.aspx?lan=2" });
["https://chess-results.com.otro-sitio.com/tnr5.aspx", "https://otro.com/tnr5.aspx", "https://s3.chess-results.com/SpielerSuche.aspx", "javascript:alert(1)"].forEach((u) => {
    let error = "";
    try { L.direccion(u); } catch (e) { error = e.message; }
    igual("rechaza " + u, error !== "", true);
});

console.log("\n=== El candado ===");
igual("antes de leer pregunta tengo_herramienta con el token de quien llama (clave anónima, no la de servicio)",
    /createClient\(SUPABASE_URL, ANON_KEY,[\s\S]*?Authorization: autorizacion[\s\S]*?rpc\("tengo_herramienta"/.test(fuente), true);
igual("y sin licencia contesta 403 antes de tocar chess-results",
    fuente.indexOf('puede !== true') < fuente.indexOf("leerTorneo(dir.servidor"), true);

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
