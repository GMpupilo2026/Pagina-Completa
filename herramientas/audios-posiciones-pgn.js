/* Las posiciones que el profe ARMÓ en las clases (finales, medio juego; no las
   partidas completas), juntas en un PGN para practicarlas contra el motor: se
   sube en partidas.html (o se carga en archivos_pgn) y en la clase en vivo
   cada una trae «Practicar» en Archivos.

   Las posiciones salen de lo que se dictó, y Whisper confunde la notación: una
   pieza mal oída da otra posición, legal y todo. Por eso una entra solo si:

   - chess.js acepta el FEN, con los dos reyes y sin jaque al que no juega,
   - y Stockfish (profundidad 18) confirma lo que dijo el profe de ella, desde
     el lado que juega: «ganar» = al menos +1,5; «tablas» = entre −1 y +1;
     «perder» (el que juega se defiende de una posición perdida) = −1,5 o
     menos; «jugar» (medio juego, sin promesa) = solo que sea legal y la
     partida no haya terminado.

   Entrada: uno o más .json  {"fecha": "2026-07-16", "posiciones": [{"seg": 196,
     "titulo": "Dos peones contra uno", "fen": "…", "objetivo": "ganar",
     "nota": "Lo que enseñó el profe con ella."}]}
   Uso:  node herramientas/audios-posiciones-pgn.js <a.json> [b.json …] > posiciones.pgn
   Hace falta Stockfish (/usr/games/stockfish o STOCKFISH=…).
   Ver «Las posiciones de las clases, para practicarlas contra el motor» en
   docs/decisiones/accesibilidad.md. */
const fs = require("fs");
const path = require("path");
const { Chess } = require(path.join(__dirname, "..", "node_modules", "chess.js"));
const { Motor } = require("./lib/motor-uci");

const PROFUNDIDAD = 18;
const OBJETIVOS = {
  ganar: { dice: "y ganan", vale: (s) => s >= 150 },
  tablas: { dice: "y hacen tablas", vale: (s) => s >= -100 && s <= 100 },
  perder: { dice: "y se defienden", vale: (s) => s <= -150 },
  jugar: { dice: "", vale: () => true },
};

function limpio(t) { return String(t || "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim(); }

(async () => {
  const archivos = process.argv.slice(2);
  if (!archivos.length) { console.error("Uso: node herramientas/audios-posiciones-pgn.js <a.json> [b.json …] > posiciones.pgn"); process.exit(2); }
  const motor = new Motor();
  const salida = [];
  let total = 0, buenas = 0;
  for (const archivo of archivos) {
    const obj = JSON.parse(fs.readFileSync(archivo, "utf8"));
    const fecha = String(obj.fecha || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { console.error("✗ " + archivo + ": sin fecha"); continue; }
    const [aa, mm, dd] = fecha.split("-");
    for (const [i, p] of (obj.posiciones || []).entries()) {
      total += 1;
      const nombre = fecha + " #" + (i + 1) + " «" + limpio(p.titulo) + "»";
      const g = new Chess();
      const fen = String(p.fen || "").trim();
      const tablero = fen.split(" ")[0] || "";
      if (!g.validate_fen(fen).valid || !g.load(fen)) { console.error("✗ " + nombre + ": el FEN no vale"); continue; }
      if ((tablero.match(/K/g) || []).length !== 1 || (tablero.match(/k/g) || []).length !== 1) { console.error("✗ " + nombre + ": tiene que haber un rey de cada color"); continue; }
      const otro = new Chess(fen.replace(/ [wb] /, (m) => (m === " w " ? " b " : " w ")).replace(/ [a-h][36] /, " - "));
      if (otro.in_check()) { console.error("✗ " + nombre + ": el que no juega está en jaque"); continue; }
      if (g.game_over()) { console.error("✗ " + nombre + ": la partida ya terminó ahí"); continue; }
      const obj_ = OBJETIVOS[p.objetivo];
      if (!obj_) { console.error("✗ " + nombre + ": objetivo «" + p.objetivo + "» (va ganar, tablas, perder o jugar)"); continue; }
      if (!limpio(p.titulo)) { console.error("✗ " + nombre + ": sin título"); continue; }
      if (/horquilla/i.test(p.titulo + " " + (p.nota || ""))) { console.error("✗ " + nombre + ": dice «horquilla»"); continue; }
      let s = null;
      if (p.objetivo !== "jugar") {
        const [a] = await motor.analizar(fen, 1, PROFUNDIDAD);
        s = a ? a.score : null;
        if (s == null || !obj_.vale(s)) { console.error("✗ " + nombre + ": el profe dijo «" + p.objetivo + "» y Stockfish da " + s + ". ¿Se dictó mal alguna pieza?"); continue; }
      }
      buenas += 1;
      const juegan = g.turn() === "w" ? "Juegan blancas" : "Juegan negras";
      const titulo = dd + "/" + mm + " · " + limpio(p.titulo);
      const comentario = [juegan + (obj_.dice ? " " + obj_.dice : "") + ".", limpio(p.nota)].filter(Boolean).join(" ");
      console.error("✓ " + nombre + (s == null ? "" : " (" + s + ")"));
      salida.push([
        '[Event "' + titulo.replace(/"/g, "'") + '"]',
        '[Site "Ajedrez Integral · ADAES"]',
        '[Date "' + aa + "." + mm + "." + dd + '"]',
        '[Round "-"]', '[White "?"]', '[Black "?"]', '[Result "*"]',
        '[SetUp "1"]', '[FEN "' + new Chess(fen).fen() + '"]',
        '[Annotator "Ajedrez Integral"]',
        "", "{" + comentario + (p.seg != null ? " Se ve en la clase, minuto " + Math.floor(+p.seg / 60) + " (aproximado)." : "") + "} *", "",
      ].join("\n"));
    }
  }
  motor.cerrar();
  process.stdout.write(salida.join("\n"));
  console.error(buenas + " de " + total + " posiciones pasan.");
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
