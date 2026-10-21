/* ===== Una partida modelo para cada apertura que recomienda la prueba de estilo =====
 *
 * Al lado de cada apertura recomendada (js/estilo-aperturas.js), la página de
 * la prueba de estilo ofrece «Ver una partida modelo»: una partida de maestros
 * con esa apertura, ganada por el bando que la juega, para recorrerla en el
 * tablero (js/visor-linea.js). Este script la elige y escribe
 * js/estilo-modelos.js, que NO se edita a mano.
 *
 *   - Ninguna partida se inventa: salen de las partidas de maestros que ya
 *     están en el repositorio (herramientas/lib/partidas-maestros.js: «Una
 *     clase al día», «Cambiar o no cambiar» y «Ganar con poco»), y para las
 *     aperturas que ahí no aparecen, de KingBase 2017 (los archivos se pasan
 *     al correr el script; las partidas elegidas se guardan con sus etiquetas
 *     en herramientas/datos/estilo-modelos-kingbase.pgn, para que el
 *     verificador las compare sin bajar nada).
 *   - Una partida es de una apertura si llega a la posición PROPIA de esa
 *     apertura (la misma que usa la medición, estilo-aperturas-medir.js), pero
 *     nunca antes de la media jugada 6 (aperturasModelo), en las primeras 30
 *     medias jugadas y también por transposición.
 *   - La elegida la GANA el bando de la apertura (las blancas en una
 *     apertura, las negras en una defensa): es la que muestra la idea
 *     funcionando. Si no hay ninguna ganada, una de tablas; si tampoco, la
 *     apertura se queda sin partida modelo (no se pone una perdida).
 *   - Entre las que quedan: primero las del repositorio, después las de
 *     largo cómodo de recorrer (más cerca de 70 medias jugadas), y a igualdad
 *     la de la huella menor (con los mismos datos, siempre la misma).
 *   - Solo las jugadas, los nombres, el evento y el resultado: ningún
 *     comentario de los cursos sale de acá.
 *
 * Cómo se corre (los archivos de KingBase, como en
 * herramientas/estilo-aperturas-kingbase.js; sin ellos, se conservan las de
 * KingBase ya guardadas):
 *
 *   node herramientas/estilo-modelos.js [chessdata/Kingbase/*.pgn]
 *   node herramientas/verificar-todo.js estilo-modelos
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Chess } = require("chess.js");
const Medir = require("./estilo-aperturas-medir.js");
const PartidasMaestros = require("./lib/partidas-maestros");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "js/estilo-modelos.js");
const KINGBASE = path.join(__dirname, "datos/estilo-modelos-kingbase.pgn");
const BUSCAR_HASTA = 30;      // medias jugadas en que se busca la posición de la apertura
const HONDO = 6;              // la posición de la apertura, al menos a esta media jugada
const LARGO_IDEAL = 70;       // medias jugadas
const MIN_PLIES = 30;         // una miniatura de 12 jugadas no muestra el plan
const CANDIDATAS = 40;        // de KingBase, cuántas por apertura alcanzan para elegir
const INICIAL = new Chess().fen();
const huella = (s) => crypto.createHash("md5").update(s).digest("hex");

/* Las posiciones (clave) de las primeras BUSCAR_HASTA medias jugadas. */
function posiciones(sans) {
  const c = new Chess();
  const out = new Set();
  for (let i = 0; i < Math.min(BUSCAR_HASTA, sans.length); i++) {
    if (!c.move(sans[i], { sloppy: true })) break;
    out.add(Medir.clavePos(c.fen()));
  }
  return out;
}

/* Una partida de un PGN de KingBase: etiquetas y jugadas en SAN (vueltas a
 * escribir con chess.js, así quedan como las del repositorio). `hasta`: leer
 * solo esas medias jugadas (chess.js 0.10.3 es lento; para saber si llega a
 * una apertura alcanzan las primeras 30). */
function tokens(txt) {
  return txt.replace(/\[[^\]]*\]\s*/g, "").replace(/\{[^}]*\}/g, " ").replace(/\([^()]*\)/g, " ")
    .replace(/\$\d+/g, " ").replace(/\d+\.(\.\.)?/g, " ").replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, " ")
    .split(/\s+/).filter(Boolean);
}
function leerPgn(txt, hasta) {
  const tag = (t) => ((new RegExp("\\[" + t + ' "([^"]*)"').exec(txt) || [])[1] || "");
  if (tag("FEN") || tag("SetUp")) return null;
  const c = new Chess();
  const sans = [];
  for (const s of tokens(txt).slice(0, hasta || Infinity)) {
    const m = c.move(s.replace(/[+#!?]+$/, ""), { sloppy: true });
    if (!m) return null;
    sans.push(m.san);
  }
  return {
    blancas: tag("White"), negras: tag("Black"), evento: [tag("Event"), tag("Date").slice(0, 4)].filter((x) => x && !/\?/.test(x)).join(", "),
    resultado: PartidasMaestros.resultadoDe(tag("Result")), sans, texto: txt.trim(),
  };
}

function gana(color, resultado) {
  return (color === "w" && resultado === "1-0") || (color === "b" && resultado === "0-1");
}

/* La mejor partida de una apertura entre las candidatas (ver arriba). */
function elegir(ap, candidatas) {
  const puntaje = (p) => [
    gana(ap.linea.color, p.resultado) ? 0 : p.resultado === "1/2-1/2" ? 1 : 9,
    p.fuente === "kingbase" ? 1 : 0,
    Math.abs(p.sans.length - LARGO_IDEAL),
    huella(p.sans.join(" ")),
  ];
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
  const ok = candidatas.filter((p) => p.sans.length >= MIN_PLIES && (gana(ap.linea.color, p.resultado) || p.resultado === "1/2-1/2"));
  return ok.map((p) => ({ p, k: puntaje(p) })).sort((x, y) => cmp(x.k, y.k)).map((x) => x.p)[0] || null;
}

/* La posición que tiene que alcanzar una partida modelo: la propia de la
 * medición, pero NUNCA antes de la media jugada HONDO (o la línea entera si es
 * más corta). La propia del gambito danés es 1.e4 e5 2.d4 (ninguna otra línea
 * del banco la tiene), y con eso entraba una apertura del centro (3.Dxd4): una
 * partida modelo tiene que mostrar ESA apertura, no una vecina. */
function aperturasModelo() {
  return Medir.propias().map((ap) => {
    const k = Math.min(ap.linea.jugadas.length, Math.max(ap.propia + 1, HONDO));
    return Object.assign({}, ap, { propia: k - 1, pos: Medir.posTras(ap.linea.jugadas, k) });
  });
}

function main() {
  const aperturas = aperturasModelo();
  const repo = PartidasMaestros.leer(Chess).filter((p) => p.inicial === INICIAL && p.completa && p.resultado)
    .map((p) => ({ fuente: p.fuente, id: p.id, blancas: p.blancas, negras: p.negras, evento: p.evento, resultado: p.resultado, sans: p.sans, pos: posiciones(p.sans) }));
  const modelos = {};
  const faltan = [];
  for (const ap of aperturas) {
    const m = elegir(ap, repo.filter((p) => p.pos.has(ap.pos)));
    if (m) modelos[ap.linea.id] = m; else faltan.push(ap);
  }
  console.log("Del repositorio: " + Object.keys(modelos).length + " de " + aperturas.length + ". Faltan: " + faltan.map((a) => a.linea.id).join(", "));

  // KingBase: lo que ya estaba guardado, y lo nuevo de los archivos que se pasen.
  const guardadas = fs.existsSync(KINGBASE) ? fs.readFileSync(KINGBASE, "utf8").split(/\n\n(?=\[Event )/).map(leerPgn).filter(Boolean) : [];
  const kb = guardadas.map((p, i) => ({ ...p, fuente: "kingbase", id: "kb-" + huella(p.sans.join(" ")).slice(0, 8), pos: posiciones(p.sans) }));
  const archivos = process.argv.slice(2);
  for (const archivo of archivos) {
    const sigue = faltan.filter((ap) => !kb.some((p) => p.pos.has(ap.pos) && gana(ap.linea.color, p.resultado)));
    if (!sigue.length) break;
    // Como herramientas/estilo-aperturas-kingbase.js: la posición propia
    // tiene k medias jugadas hechas y se llega a ella en la media jugada k
    // (con las mismas jugadas en otro orden). Antes de chess.js (lento), que
    // gane el bando de la apertura y que sus primeras k jugadas sean las de
    // la apertura, de cada color; después, chess.js solo hasta la k.
    const objetivos = sigue.map((ap) => {
      const define = ap.linea.jugadas.slice(0, ap.propia + 1).map((x) => x.replace(/[+#]$/, ""));
      return { ap, k: define.length, blancas: define.filter((_, i) => i % 2 === 0).sort().join(" "), negras: define.filter((_, i) => i % 2 === 1).sort().join(" ") };
    });
    const cuantas = Object.fromEntries(sigue.map((ap) => [ap.linea.id, 0]));
    let n = 0;
    for (const txt of fs.readFileSync(archivo, "utf8").split(/\n\n(?=\[Event )/)) {
      if (sigue.every((ap) => cuantas[ap.linea.id] >= CANDIDATAS)) break;
      const res = (/\[Result "(1-0|0-1)"\]/.exec(txt) || [])[1];
      if (!res) continue;
      const crudas = tokens(txt).map((x) => x.replace(/[+#!?]+$/, ""));
      if (crudas.length < MIN_PLIES) continue;
      const posibles = objetivos.filter((o) => cuantas[o.ap.linea.id] < CANDIDATAS && gana(o.ap.linea.color, res)
        && crudas.slice(0, o.k).filter((_, i) => i % 2 === 0).sort().join(" ") === o.blancas
        && crudas.slice(0, o.k).filter((_, i) => i % 2 === 1).sort().join(" ") === o.negras);
      if (!posibles.length) continue;
      const corta = leerPgn(txt, Math.max(...posibles.map((o) => o.k)));
      if (!corta) continue;
      const g = new Chess();
      const enPly = corta.sans.map((san) => { g.move(san); return Medir.clavePos(g.fen()); });
      const de = posibles.filter((o) => enPly[o.k - 1] === o.ap.pos).map((o) => o.ap);
      if (!de.length) continue;
      const p = leerPgn(txt);
      if (!p || p.sans.length < MIN_PLIES) continue;
      kb.push({ ...p, fuente: "kingbase", id: "kb-" + huella(p.sans.join(" ")).slice(0, 8), pos: posiciones(p.sans) });
      de.forEach((ap) => cuantas[ap.linea.id]++);
      n++;
    }
    console.log(path.basename(archivo) + ": " + n + " candidatas");
  }
  const usadasKb = [];
  for (const ap of faltan) {
    const m = elegir(ap, kb.filter((p) => p.pos.has(ap.pos)));
    if (m) { modelos[ap.linea.id] = m; if (!usadasKb.includes(m)) usadasKb.push(m); }
  }
  const sin = aperturas.filter((ap) => !modelos[ap.linea.id]).map((ap) => ap.linea.id);
  if (sin.length) console.log("Sin partida modelo: " + sin.join(", "));
  fs.writeFileSync(KINGBASE, usadasKb.map((p) => p.texto).join("\n\n") + (usadasKb.length ? "\n" : ""));

  const datos = {};
  for (const ap of aperturas) {
    const m = modelos[ap.linea.id];
    if (!m) continue;
    datos[ap.linea.id] = { blancas: m.blancas, negras: m.negras, evento: m.evento, resultado: m.resultado, fuente: m.fuente, id: m.id, jugadas: m.sans };
  }
  const texto = `/* ===== Ajedrez Integral — una partida modelo por apertura =====
 *
 * Lo genera herramientas/estilo-modelos.js y NO se edita a mano: una partida
 * de maestros con cada apertura de «Aperturas y celadas», ganada por el bando
 * que la juega, para «Ver una partida modelo» en la prueba de estilo. Solo
 * las jugadas (SAN), los nombres, el evento y el resultado. Lo comprueba
 * herramientas/verificar-estilo-modelos.js.
 */
(function (raiz) {
  "use strict";
  const MODELOS = ${JSON.stringify(datos)};
  raiz.EstiloModelos = MODELOS;
  if (typeof module !== "undefined" && module.exports) module.exports = MODELOS;
})(typeof window !== "undefined" ? window : globalThis);
`;
  fs.writeFileSync(SALIDA, texto);
  console.log("Listo: " + Object.keys(datos).length + " partidas modelo en js/estilo-modelos.js (" + Math.round(texto.length / 1024) + " KB)");
}

if (require.main === module) main();
module.exports = { posiciones, leerPgn, gana, aperturasModelo, BUSCAR_HASTA, MIN_PLIES, HONDO };
