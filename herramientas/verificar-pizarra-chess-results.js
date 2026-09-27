/* Comprueba el lector de chess-results de la Edge Function pizarra-torneo
   (supabase/functions/pizarra-torneo/index.ts), sin red y sin Deno: saca del
   archivo leerClasificacion() y direcciones(), les quita los tipos de
   TypeScript con el propio Node y los corre contra HTML de prueba.

   El HTML de prueba copia la FORMA de las páginas reales del UTN-CONARE 2026
   (tnr1498221 y tnr1498218, leídas desde la base con pg_net el 27/9/2026):
   <table class="CRs1">, encabezado «CRng1b», filas «CRng2 CRC», la columna
   del título sin nombre antes de «Nombre», los puntos como «Des 1» y la
   «Anotación» que dice qué es cada desempate. Los nombres son inventados.
   Y una variante con la forma vieja: clases sin «n» y una columna «Pts.».

   Lo que se rompe callado acá: una columna que se corre y la pizarra muestra
   el Elo como si fueran puntos, o una dirección que no es de chess-results y
   la función la pide igual.

   Ver «Las posiciones oficiales vienen de chess-results» en
   docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-pizarra-chess-results.js           */
const fs = require("fs");
const path = require("path");
const { stripTypeScriptTypes } = require("module");

const fuente = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "pizarra-torneo", "index.ts"), "utf8");
const desde = fuente.indexOf("function texto(");
const hasta = fuente.indexOf("// ------------------------------------------------------------- la función");
const MAX = (fuente.match(/const MAX_FILAS = (\d+);/) || [])[1];
const js = stripTypeScriptTypes("const MAX_FILAS = " + MAX + ";\n" + fuente.slice(desde, hasta).replace("export function", "function"));
const { leerClasificacion, direcciones } = new Function(js + "\nreturn { leerClasificacion, direcciones };")();

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

// ---- La forma de hoy (UTN-CONARE 2026) ----
const fila = (clase, rk, tit, nom, club, des, extra) =>
  `<tr class="${clase} CRC"><td class="CRc">${rk}</td><td class="CRc">${rk}</td><td class="CR"><div class="tn_CRC"></div></td><td class="CR">${tit}</td>` +
  `<td class="CR"><a Class="CRdb" href="https://chess-results.com/tnr1.aspx?lan=2&amp;art=9&amp;snr=${rk}">${nom}</a></td><td class="CR">CRC</td><td class="CRr">${1900 - rk * 50}</td>` +
  `<td class="CR">${club}</td>${des.map((d) => `<td class="CRc">${d}</td>`).join("")}${extra || ""}</tr>\r`;
const HOY = `<h2>Torneo Universitario de Prueba - FEMENINO </h2><table><tr><td class="CR">Organizador</td><td class="CR">Alguien</td></tr></table>` +
  `<div><h2>Clasificación después de la ronda 3</h2>\r<table class="CRs1" border="0" cellpadding="1" cellspacing="1">\r` +
  `<tr class="CRng1b"><th class="CRc">Rk.</th><th class="CRc">No.Ini.</th><th class="CRc">&nbsp;</th><th class="CR"></th><th class="CR">Nombre</th><th class="CR">FED</th><th class="CRr">EloN</th><th class="CR">Club/Ciudad</th>` +
  `<th class="CRc">&nbsp;Des 1&nbsp;</th><th class="CRc">&nbsp;Des 2&nbsp;</th><th class="CRc">&nbsp;Des 3&nbsp;</th><th class="CRr">n</th><th class="CRc">w</th><th class="CRc">we</th></tr>\r` +
  fila("CRng2", 1, "WIM", "Mora Solís, Ana", "UCR Rodrigo Facio", ["3", "0", "4,5"], `<td class="CRr">0</td><td class="CRc">0</td><td class="CRc">0,00</td>`) +
  fila("CRng1", 2, "", "Rojas, Bea", "TEC &amp; UNA", ["2,5", "1", "4"], `<td class="CRr">0</td><td class="CRc">0</td><td class="CRc">0,00</td>`) +
  fila("CRng2", 3, "", "Pérez, Carla", "UNA", ["0,5", "0", "2"], `<td class="CRr">0</td><td class="CRc">0</td><td class="CRc">0,00</td>`) +
  `</table><p class="CR"><b>Anotación:</b><br/>Desempate 1: points (game-points)<br/>Desempate 2: Direct Encounter (DE)<br/>Desempate 3: Buchholz Tie-Break Variable (2026) (Gamepoints)<br/></p></div>`;

console.log("\n=== La forma de hoy: los puntos como «Des 1» ===");
const hoy = leerClasificacion(HOY);
igual("el torneo y la ronda", [hoy.torneo, hoy.ronda], ["Torneo Universitario de Prueba - FEMENINO", "Clasificación después de la ronda 3"]);
igual("los desempates, sin el de los puntos y sin el paréntesis", hoy.desempates, ["Direct Encounter", "Buchholz Tie-Break Variable"]);
igual("cada fila, con los puntos en ½", hoy.filas.map((f) => [f.puesto, f.titulo, f.nombre, f.club, f.elo, f.puntos, f.desempates]), [
  ["1", "WIM", "Mora Solís, Ana", "UCR Rodrigo Facio", "1850", "3", ["0", "4,5"]],
  ["2", "", "Rojas, Bea", "TEC & UNA", "1800", "2½", ["1", "4"]],
  ["3", "", "Pérez, Carla", "UNA", "1750", "½", ["0", "2"]]]);

// ---- La forma vieja: clases sin «n» y una columna «Pts.» ----
const VIEJA = `<h2>Abierto de Prueba</h2><h2>Clasificación final después de 5 rondas</h2><table class="CRs1">` +
  `<tr class="CRg1b"><th class="CRc">Rk.</th><th class="CRc">SNo</th><th class="CR"></th><th class="CR">Nombre</th><th class="CRr">Elo</th><th class="CR">FED</th><th class="CRc">Pts.</th><th class="CRc">&nbsp;Des 1&nbsp;</th></tr>` +
  `<tr class="CRg1"><td class="CRc">1</td><td class="CRc">4</td><td class="CR">FM</td><td class="CR"><a href="x">Vega, Dan</a></td><td class="CRr">2100</td><td class="CR">CRC</td><td class="CRc">4,5</td><td class="CRc">12,5</td></tr>` +
  `<tr class="CRg2"><td class="CRc">2</td><td class="CRc">1</td><td class="CR"></td><td class="CR">Soto, Eva</td><td class="CRr">0</td><td class="CR">CRC</td><td class="CRc">4</td><td class="CRc">11</td></tr>` +
  `</table><p>Desempate 1: Buchholz Tie-Breaks (variabel with parameter)</p>`;

console.log("\n=== La forma vieja: una columna «Pts.» ===");
const vieja = leerClasificacion(VIEJA);
igual("los puntos salen de «Pts.», no de un desempate", vieja.filas.map((f) => [f.titulo, f.nombre, f.elo, f.puntos, f.desempates]),
  [["FM", "Vega, Dan", "2100", "4½", ["12,5"]], ["", "Soto, Eva", "0", "4", ["11"]]]);
igual("y el desempate que queda", vieja.desempates, ["Buchholz Tie-Breaks"]);

console.log("\n=== Sin tabla todavía ===");
igual("no inventa filas", leerClasificacion("<h2>Torneo X</h2><p>Todavía no hay datos.</p>"), { torneo: "Torneo X", ronda: "", desempates: [], filas: [] });

console.log("\n=== Solo se piden direcciones de chess-results ===");
igual("la que cargó administración se normaliza a la clasificación completa",
  direcciones("https://s3.chess-results.com/tnr1498218.aspx?lan=2&art=0&turdet=YES&flag=30&SNode=S0"),
  { leer: "https://s3.chess-results.com/tnr1498218.aspx?lan=2&art=1&turdet=YES&zeilen=99999", ver: "https://s3.chess-results.com/tnr1498218.aspx?lan=2&art=1&turdet=YES" });
for (const mala of ["https://chess-results.com.otro-sitio.com/tnr1.aspx", "https://otro-sitio.com/tnr1.aspx", "https://chess-results.com/SpielerSuche.aspx"]) {
  let rechazada = false;
  try { direcciones(mala); } catch (e) { rechazada = true; }
  igual("rechaza " + mala, rechazada, true);
}

console.log(fallos ? "\n" + fallos + " falla(s)." : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
