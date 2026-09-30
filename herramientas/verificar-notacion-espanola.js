#!/usr/bin/env node
/* Que las jugadas escritas en el contenido estén en la notación del sitio.
 *
 * No necesita navegador, ni red, ni el sitio servido.
 *
 * Regla del dueño (ver lib/notacion.js):
 *   · en artículos, cursos y materiales, algebraica ESPAÑOLA: R rey, D dama,
 *     T torre, A alfil, C caballo («Cf3», «Axc6», «Txe8+», «e8=D», «O-O»);
 *   · en lo hecho para quien no ve (todo archivo «-accesible»), el formato de
 *     ajedrez para ciegos, con las columnas dichas: «caballo felix 3», «alfil
 *     captura cesar 6 jaque», «Enroque corto». «Cf3» el lector de pantalla lo
 *     deletrea y no se entiende.
 *
 * Recorre articulos/, cursos/ y material/ (y los «-accesible» de la raíz) y
 * mira SOLO el texto visible: los atributos (data-fen, data-pgn…), los
 * <script>, los <style> y los <svg> no cuentan, porque ahí va el SAN inglés que
 * lee chess.js. Tampoco cuentan las posiciones en FEN ni lo que enseña a
 * anotar: un párrafo que habla de la notación («en inglés se escribe Nf3») o un
 * elemento marcado data-notacion="escrita".
 *
 * Lo que no puede ver: una línea inglesa con solo jugadas de torre y de peón
 * («1.Rd1 e5»), porque «Rd1» es también una jugada de rey en español. Por eso
 * los generadores no adivinan la notación: se la dicen (lineaOrigen, tituloOrigen).
 *
 * Además comprueba que herramientas/lib/notacion.js convierta como debe.
 */
const fs = require("fs");
const path = require("path");
const N = require("./lib/notacion.js");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

// ---------------------------------------------------------------- el convertidor
console.log("\nEl convertidor (lib/notacion.js)");
const casos = [
  [N.textoEspanol("1.e4 e5 2.Nf3 Nc6 3.Bb5", "ingles"), "1.e4 e5 2.Cf3 Cc6 3.Ab5"],
  [N.textoEspanol("Rxe8+ y e8=Q#, luego O-O", "ingles"), "Txe8+ y e8=D#, luego O-O"],
  [N.textoEspanol("tras 37.Ke4 y 31.Qd3!", "auto"), "tras 37.Re4 y 31.Dd3!"],
  [N.textoEspanol("Rg2 y Cf3", "auto"), "Rg2 y Cf3"],
  [N.textoHablado("Nf3", "ingles"), "Caballo felix 3"],
  [N.textoHablado("Axc6+", "espanol"), "Alfil captura cesar 6 jaque"],
  [N.textoHablado("e8=D", "espanol"), "Eva 8 corona dama"],
  [N.textoHablado("O-O", "espanol"), "Enroque corto"],
  [N.textoHablado("Tras 15.Axd5+ Rg7 16.Cxc6.", "espanol"), "Tras 15. alfil captura david 5 jaque, rey gustav 7, 16. caballo captura cesar 6."],
  [N.textoHablado("tras Rd1", "ingles"), "tras torre david 1"],
  [N.textoHablado("el peón de e4", "espanol"), "el peón de e4"],
  [N.textoEspanol("la maniobra ...Bg5-d2-b4", "auto"), "la maniobra ...Ag5-d2-b4"],
  [N.textoHablado("la maniobra Ce4-d2-b1", "espanol"), "la maniobra caballo eva 4, david 2, bella 1"],
];
let convierteBien = true;
casos.forEach(([dio, esperado]) => {
  if (dio !== esperado) { convierteBien = false; mal(`dio «${dio}», se esperaba «${esperado}»`); }
});
let avisaLaR = false;
try { N.textoEspanol("Rd1, Nf3 y Cc3", "auto"); } catch (e) { avisaLaR = !!e.mezcla; }
if (!avisaLaR) mal("un texto con las dos notaciones y una R tendría que avisar, no adivinar");
if (convierteBien && avisaLaR) bien(`${casos.length} conversiones de prueba, y la R dudosa se avisa`);

// ---------------------------------------------------------------- los archivos
function archivos(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}
const lista = ["articulos", "cursos", "material"].flatMap((d) => archivos(path.join(RAIZ, d)))
  .concat(fs.readdirSync(RAIZ).filter((f) => /-accesible\.html$/.test(f)).map((f) => path.join(RAIZ, f)));

// Quita un elemento entero (con lo que tenga adentro) cuando su etiqueta de
// apertura cumple la condición: así sale lo marcado data-notacion="escrita".
function sinElementos(html, cumple) {
  let salida = "", i = 0;
  const re = /<([a-z0-9]+)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!cumple(m[0])) continue;
    const tag = m[1].toLowerCase();
    const abre = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "gi");
    abre.lastIndex = re.lastIndex;
    let nivel = 1, fin = html.length, x;
    while ((x = abre.exec(html)) !== null) {
      nivel += x[0][1] === "/" ? -1 : 1;
      if (nivel === 0) { fin = abre.lastIndex; break; }
    }
    salida += html.slice(i, m.index) + " ";
    i = fin;
    re.lastIndex = fin;
  }
  return salida + html.slice(i);
}

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—" };
const BLOQUE = /<\/?(?:p|li|div|td|th|h[1-6]|summary|details|section|article|blockquote|figcaption|dd|dt|ul|ol|pre|noscript|header|footer|main|nav|br|title)\b[^>]*>/gi;

function bloquesVisibles(html) {
  let h = html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<svg\b[\s\S]*?<\/svg>|<!--[\s\S]*?-->|<textarea\b[\s\S]*?<\/textarea>/gi, " ");
  h = sinElementos(h, (etiqueta) => /\bdata-notacion="escrita"/.test(etiqueta));
  return h.split(BLOQUE).map((b) => b.replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (t, e) => ENTIDADES[e] != null ? ENTIDADES[e] : t)
    // Una FEN no es una jugada: «Kb6/…» es una fila del tablero.
    .replace(/\S*\/\S*\/\S*/g, " ")
    .replace(/\s+/g, " ").trim()).filter(Boolean);
}

const ANTES = "(?<![\\w/\\-–])", DESPUES = "(?![\\w/\\-–=])";
// Después de la jugada: nada pegado, o el camino de una maniobra («Bg5-d2»).
const FIN = "[+#]?(?:" + DESPUES + "|(?=-[a-h][1-8]))";
// Inglesa sin duda: N, B, Q o K de pieza, o una coronación a Q, R, B o N.
const INGLESA = new RegExp(ANTES + "(?:[NBQK][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8]=[QRBN])" + FIN, "g");
// Escrita (cualquier notación): lo que en un archivo accesible tendría que ir dicho.
const ESCRITA = new RegExp(ANTES + "(?:[KQRBNCADT][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBNDTAC])?|[a-h]x[a-h][1-8](?:=[QRBNDTAC])?|[a-h][1-8]=[QRBNDTAC]|O-O(?:-O)?)" + FIN, "g");

let revisados = 0, accesibles = 0;
const porArchivo = [];
for (const f of lista) {
  const rel = path.relative(RAIZ, f);
  const esAccesible = /-accesible\.html$/.test(f);
  const html = fs.readFileSync(f, "utf8");
  const problemas = [];
  for (const b of bloquesVisibles(html)) {
    if (N.ensenaNotacion(b)) continue;
    if (esAccesible) {
      // «el corto (O-O)» dice cómo se anota: se deja.
      const sinSigno = b.replace(/(?:corto|largo)\s*\(\s*O-O(?:-O)?/gi, " ");
      const escritas = sinSigno.match(ESCRITA);
      if (escritas) problemas.push(`jugada escrita («${escritas.slice(0, 3).join("», «")}») donde va dicha: «${b.slice(0, 140)}»`);
    } else {
      const inglesas = b.match(INGLESA);
      if (inglesas) problemas.push(`jugada en inglés («${inglesas.slice(0, 3).join("», «")}»): «${b.slice(0, 140)}»`);
    }
  }
  revisados += 1;
  if (esAccesible) accesibles += 1;
  if (problemas.length) porArchivo.push([rel, problemas]);
}

console.log("\nEl texto visible del contenido");
if (!porArchivo.length) {
  bien(`${revisados - accesibles} páginas en algebraica española, sin jugadas en inglés`);
  bien(`${accesibles} archivos accesibles con las jugadas dichas («caballo felix 3»), ninguna escrita`);
} else {
  porArchivo.forEach(([rel, problemas]) => {
    mal(`${rel}: ${problemas.length} ${problemas.length === 1 ? "texto" : "textos"}`);
    problemas.slice(0, 3).forEach((p) => console.log("      " + p));
  });
  console.log("\n  Un archivo generado se arregla en su generador (curso-material.js,");
  console.log("  diagnostico-libro.js…) y se vuelve a generar; uno escrito a mano, en el");
  console.log("  texto. Los data-* y los bancos quedan en SAN inglés: los lee chess.js.");
}

console.log(fallos ? `\n${fallos} ${fallos === 1 ? "fallo" : "fallos"}` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);
