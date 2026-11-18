/* Comprueba que en TODA versión accesible la posición vaya de a una pieza por
   renglón, y no en un párrafo corrido.

   La queja de los alumnos ciegos era que la posición «se lee muy rápido» para
   ponerla en el tablero: iba en un párrafo («Piezas blancas: rey en g1; torres
   en a1, f1; peones en…») y un párrafo el lector de pantalla lo dice de un
   tirón. Ahora cada pieza es un renglón de lista (herramientas/lib/
   posicion-accesible.js) y se avanza de a una con las flechas.

   Nada de esto da un error en pantalla: un generador nuevo que vuelva a
   escribir la posición corrida se ve perfecto. Por eso se mira archivo por
   archivo, todos los «-accesible» del sitio:

   1. Ninguno trae la posición corrida («Piezas blancas: rey en…»).
   2. En cada bloque de posición con su FEN, hay un renglón por cada pieza de
      la FEN, ni una más ni una menos, y las casillas van dichas («gustav 1»).

   3. Lo mismo con las líneas de jugadas: una «Solución» o «La línea» de dos
      jugadas o más no va en un párrafo, va con cada jugada en su renglón
      («32. Negras: torre eva 1.»). Y las partidas comentadas de los tomos,
      igual: ningún párrafo que empiece por una jugada numerada.

   Uso:  node herramientas/verificar-posicion-accesible.js                    */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const SALTAR = new Set(["node_modules", ".git", "herramientas", "docs", "supabase"]);

function accesibles(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SALTAR.has(e.name)) accesibles(path.join(dir, e.name), out); continue; }
    if (/accesible[^/]*\.html$/.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

const RENGLON = /<li>(?:Rey|Dama|Torre|Alfil|Caballo|Peón) en (?:anna|bella|cesar|david|eva|felix|gustav|hector) [1-8]\.<\/li>/g;
let fallos = 0, archivos = 0, posiciones = 0, lineas = 0;
function mal(donde, que) { fallos += 1; if (fallos <= 25) console.log("  ✗ " + donde + ": " + que); }

for (const archivo of accesibles(RAIZ, [])) {
  const html = fs.readFileSync(archivo, "utf8");
  const donde = path.relative(RAIZ, archivo);
  archivos += 1;
  if (/Piezas (?:blancas|negras): (?:rey|reyes|dama|damas|torre|torres|alfil|alfiles|caballo|caballos|peón|peones) en /.test(html)) {
    mal(donde, "trae una posición en un párrafo corrido («Piezas blancas: rey en…»): va una pieza por renglón (lib/posicion-accesible.js)");
    continue;
  }
  const corrida = html.match(/<p><strong>(?:Solución|La línea|La solución|Las jugadas[^<]*)\.<\/strong> \d+\s?(?:\.|…) [^<]*?, \d+\. [^<]{0,60}/);
  if (corrida) { mal(donde, "una línea de varias jugadas sigue en un párrafo: " + corrida[0].replace(/<[^>]+>/g, "").slice(0, 90) + "…"); continue; }
  if (/<p><strong>\d+(?:\.|, negras:) [a-záéíóúñ]/.test(html)) { mal(donde, "una partida comentada sigue en párrafos: cada jugada va en su renglón"); continue; }
  lineas += (html.match(/: \d+ jugadas<\/(?:strong|h4)>/g) || []).length + (html.match(/<ul class="jugadas">/g) || []).length;
  const bloques = html.split('<div class="posicion">').slice(1);
  for (const resto of bloques) {
    const bloque = resto.split("</div>")[0];
    const fen = (bloque.match(/(?:FEN|notación FEN[^:]*): ([1-8pnbrqkPNBRQK/]+) [wb] /) || [])[1];
    if (!fen) continue;   // un bloque sin FEN a la vista (los cuentos, las fichas): lo cubre el punto 1
    posiciones += 1;
    const piezas = fen.replace(/[^a-zA-Z]/g, "").length;
    // Las de la posición, no las jugadas de la línea que pueda venir después.
    const antesDeLaLinea = bloque.split(/La línea: \d+ jugadas/)[0];
    const renglones = (antesDeLaLinea.match(RENGLON) || []).length;
    if (renglones !== piezas) { mal(donde, `una posición tiene ${piezas} piezas y lista ${renglones} (${fen})`); break; }
  }
}

if (archivos < 400) { console.log(`  ✗ solo se encontraron ${archivos} versiones accesibles: ¿cambió dónde viven?`); fallos += 1; }
console.log(`${archivos} versiones accesibles · ${posiciones} posiciones con su FEN, cada una con un renglón por pieza · ${lineas} líneas y partidas con cada jugada en su renglón`);
if (lineas < 3000) { console.log("  ✗ muy pocas líneas partidas en renglones (" + lineas + "): ¿dejó de partirlas algún generador?"); fallos += 1; }
console.log(fallos ? `\n${fallos} fallo(s)` : "\nEn lo accesible, la posición va de a una pieza por renglón.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
