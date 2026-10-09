/* Comprueba el lector de chess-results de la Edge Function
   desempates-chess-results (supabase/functions/desempates-chess-results/index.ts),
   sin red y sin Deno: saca del archivo sus lectores, les quita los tipos de
   TypeScript con el propio Node y los corre contra HTML de prueba.

   El HTML copia la FORMA de las páginas reales que ya usa
   seleccion-chess-results (ver su verificador y su cabecera): la ficha de un
   jugador con la tabla de rondas, cuya celda «Res.» trae otra tabla adentro
   con el color (el div «FarbewT»/«FarbesT») y el resultado («1», «½», «0»,
   o con una «K» para la incomparecencia); un bye trae el rival «bye» literal.

   Lo que se rompe callado acá: leer el color de la celda ya pasada por
   texto() (ahí no queda ningún div), confundir un bye con una incomparecencia
   (los dos pueden traer «- 1»), o tomar el «No.Ini.» de la columna
   equivocada y mezclar los rivales.

   Ver «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md.

   Uso:  node herramientas/verificar-desempates-chess-results.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { stripTypeScriptTypes } = require("module");

const fuente = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "desempates-chess-results", "index.ts"), "utf8");
const desde = fuente.indexOf("function texto(");
const hasta = fuente.indexOf("// ------------------------------------------------------------- la función");
const js = stripTypeScriptTypes(fuente.slice(desde, hasta).replace(/^export interface \w+ \{[^\n]*\}$/gm, "").replace(/export function/g, "function"));
const L = new Function(js + "\nreturn { leerTitulos, leerClasificacionCompleta, leerFichaCompleta, direccion };")();

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}

// La misma forma de celda «Res.» que usa chess-results: un div de color
// adentro de una tabla anidada, y después el texto del resultado.
const res = (color, r) => `<td class="CR"><table><tr><td><div class="Farbe${color}T"></div></td><td class="CR">${r}</td></tr></table></td>`;
const ronda = (rd, rival, r, color, snr) => `<tr class="CRg${rd % 2 ? 1 : 2}"><td class="CRc">${rd}</td><td class="CRc">2</td><td class="CRc">${snr}</td><td class="CR"></td>` +
  `<td class="CR">${rival}</td><td class="CRr">1420</td><td class="CRc">2,5</td>${res(color, r)}</tr>\r\n`;

console.log("\n=== La ficha de un jugador (art=9): bye, incomparecencia y color ===");
const FICHA = `<div class="defaultDialog"><h2>Torneo de Prueba </h2></div><div class="defaultDialog"><h2>Información de jugadores</h2>` +
  `<table Class="CRs1"><tr><td class="CR">Nombre</td><td class="CR">Quesada Arias, Tomás</td></tr>` +
  `<tr><td class="CR">Elo internacional</td><td class="CR">1719</td></tr></table>` +
  `<p Class="CRlz">&nbsp;</p><table class="CRs1">\r\n` +
  `<tr class="CRg1b"><th class="CRc">Rd.</th><th class="CRc">M.</th><th class="CRc">No.Ini.</th><th class="CR"></th><th class="CR">Nombre</th><th class="CRr">FIDE</th><th class="CRc">Pts.</th><th class="CRc">Res.</th></tr>\r\n` +
  ronda(1, "Mora Lima, Pablo", "1", "w", 15) +
  ronda(2, "Solís Ruiz, Ana", "&frac12;", "s", 7) +
  ronda(3, "Brenes Paz, Leo", "- 1K", "w", 9) +
  ronda(4, "bye", "- 1", "w", 0) +
  ronda(5, "Jara Sol, Iván", "0", "s", 3) +
  ronda(6, "Rojas Mora, Dani", "- 0K", "s", 11) +
  `</table></div>`;
const f = L.leerFichaCompleta(FICHA);
igual("nombre y Elo de la tabla de pares", [f.nombre, f.elo], ["Quesada Arias, Tomás", 1719]);
igual("seis rondas: ganada de blancas, tablas de negras, incomparecencia a favor, bye, perdida, incomparecencia en contra",
  f.partidas.map((p) => [p.ronda, p.rivalSnr, p.rivalNombre, p.bye, p.incomparecencia, p.color, p.puntos]),
  [
    [1, 15, "Mora Lima, Pablo", false, null, "w", 1],
    [2, 7, "Solís Ruiz, Ana", false, null, "b", 0.5],
    [3, 9, "Brenes Paz, Leo", false, "gana", "w", 1],
    [4, 0, "bye", true, null, "w", 1],
    [5, 3, "Jara Sol, Iván", false, null, "b", 0],
    [6, 11, "Rojas Mora, Dani", false, "pierde", "b", 0],
  ]);

console.log("\n=== La clasificación (art=1): No.Ini., Elo y el puntaje final ===");
const tabla = (enc, filas) => `<table class="CRs1"><tr class="CRng1b">${enc.map((e) => `<th class="CR">${e}</th>`).join("")}</tr>` +
  filas.map((fl, i) => `<tr class="CRng${i % 2 ? 1 : 2} CRC">${fl.map((c) => `<td class="CR">${c}</td>`).join("")}</tr>`).join("") + `</table>`;
const clasifHtml = `<h2>Torneo de Prueba </h2><h2>Clasificación Final después de 5 rondas</h2>` +
  tabla(["Rk.", "No.Ini.", "", "", "Nombre", "FIDE", "EloN", "Club/Ciudad", "Pts."], [
    ["1", "2", "", "", "Dos, Beto", "1600", "1400", "B", "4,5"],
    ["2", "1", "", "", "Uno, Ana", "1500", "1600", "A", "4"],
  ]);
igual("puesto, No.Ini. (snr), nombre, Elo (prefiere FIDE sobre el nacional) y puntos (coma decimal)", L.leerClasificacionCompleta(clasifHtml),
  [{ puesto: 1, snr: 2, nombre: "Dos, Beto", elo: 1600, puntos: 4.5 }, { puesto: 2, snr: 1, nombre: "Uno, Ana", elo: 1500, puntos: 4 }]);
igual("y su título/ronda", L.leerTitulos(clasifHtml), { titulo: "Torneo de Prueba", ronda: "Clasificación Final después de 5 rondas", rondasJugadas: 5, final: true });

console.log("\n=== Sin la columna «Pts.»: el puntaje sale del «Des N» que dice «points» ===");
const sinPts = `<h2>T</h2><h2>Clasificación después de la ronda 3</h2>` +
  tabla(["Rk.", "No.Ini.", "Nombre", "Des 1"], [["1", "5", "Tres, Cata", "3"]]) +
  `<p>Anotación: Desempate 1: points (game-points)</p>`;
igual("toma «Des 1» como puntaje porque su anotación dice «points»", L.leerClasificacionCompleta(sinPts),
  [{ puesto: 1, snr: 5, nombre: "Tres, Cata", elo: 0, puntos: 3 }]);

console.log("\n=== La dirección ===");
igual("cualquier página de un torneo de chess-results", L.direccion("https://s3.chess-results.com/tnr1423856.aspx?lan=2&art=1"),
  { tnr: "1423856", servidor: "s3.chess-results.com", ver: "https://s3.chess-results.com/tnr1423856.aspx?lan=2" });
["https://chess-results.com.otro-sitio.com/tnr5.aspx", "https://otro.com/tnr5.aspx", "javascript:alert(1)"].forEach((u) => {
  let error = "";
  try { L.direccion(u); } catch (e) { error = e.message; }
  igual("rechaza " + u, error !== "", true);
});

console.log("\n=== El candado y la caché ===");
igual("antes de leer pregunta tengo_herramienta con el token de quien llama (clave anónima, no la de servicio)",
  /createClient\(SUPABASE_URL, ANON_KEY,[\s\S]*?Authorization: autorizacion[\s\S]*?rpc\("tengo_herramienta"/.test(fuente), true);
igual("sin licencia contesta 403 antes de tocar chess-results",
  fuente.indexOf("puede !== true") < fuente.indexOf("leerTorneo(dir.servidor"), true);
igual("la herramienta es «desempates», la que ya anuncia js/herramientas-arbitraje.js",
  /const HERRAMIENTA = "desempates"/.test(fuente), true);
igual("la caché es su propia tabla (desempates_cache), no la de seleccion-chess-results",
  /from\("desempates_cache"\)/.test(fuente) && !/from\("seleccion_cache"\)/.test(fuente), true);

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
