/* Revisa los ejercicios de una clase (las posiciones que dictó el profe) antes
   de cargarlos, y escribe el SQL que los guarda en audios_clase_ejercicios.

   Las posiciones salen de lo que se dictó en la clase, y Whisper confunde la
   notación dicha: una pieza mal oída da otra posición, legal y todo. Por eso
   un ejercicio entra solo si:

   - chess.js acepta el FEN (los dos reyes, el que no juega no está en jaque),
   - la jugada buena (la que el profe explicó) es legal ahí, y
   - Stockfish la confirma como LA jugada: es su primera opción y la segunda
     queda al menos 1,5 peones por debajo (o la buena da mate y la segunda no,
     o la buena gana y la segunda no pasa de tablas). Si la posición quedó mal
     dictada, casi nunca la jugada del profe sale única: se rechaza sola.

   Aun así llegan sin publicar: el profe los mira y los publica.

   Entrada: un .json  {"ejercicios": [{"seg": 812, "enunciado": "Juegan blancas y ganan…",
     "fen": "8/8/…", "buena": "Kf5", "explicacion": "…"}]}
   Uso:  node herramientas/audios-ejercicios-revisar.js <ejercicios.json> <id del audio> <duración>  > ejercicios.sql
   Hace falta Stockfish (/usr/games/stockfish o STOCKFISH=…).
   Ver «Los ejercicios de las posiciones de la clase» en docs/decisiones/accesibilidad.md. */
const fs = require("fs");
const path = require("path");
const { Chess } = require(path.join(__dirname, "..", "node_modules", "chess.js"));
const { Motor } = require("./lib/motor-uci");

const PROFUNDIDAD = 22;
const DIFERENCIA = 150;

const [archivo, audioId, durTexto] = process.argv.slice(2);
if (!archivo || !/^[0-9a-f-]{36}$/.test(audioId || "") || !(+durTexto > 0)) {
  console.error("Uso: node herramientas/audios-ejercicios-revisar.js <ejercicios.json> <id del audio> <duración en segundos>");
  process.exit(2);
}

function gana(s) { return s >= 300; }
function tablasOMenos(s) { return s <= 80; }

(async () => {
  const obj = JSON.parse(fs.readFileSync(archivo, "utf8"));
  const lista = Array.isArray(obj.ejercicios) ? obj.ejercicios : [];
  const motor = new Motor();
  const buenos = [];
  for (const [i, e] of lista.entries()) {
    const nombre = "ejercicio " + (i + 1) + (e.seg != null ? " (segundo " + e.seg + ")" : "");
    const g = new Chess();
    const val = g.validate_fen(String(e.fen || ""));
    if (!val.valid || !g.load(e.fen)) { console.error("✗ " + nombre + ": el FEN no vale (" + val.error + ")"); continue; }
    if (!/K/.test(e.fen.split(" ")[0]) || !/k/.test(e.fen.split(" ")[0])) { console.error("✗ " + nombre + ": falta un rey"); continue; }
    const mv = g.move(String(e.buena || ""), { sloppy: true });
    if (!mv) { console.error("✗ " + nombre + ": «" + e.buena + "» no es legal en esa posición"); continue; }
    if (!String(e.enunciado || "").trim()) { console.error("✗ " + nombre + ": sin enunciado"); continue; }
    if (e.seg != null && !(+e.seg >= 0 && +e.seg < +durTexto)) { console.error("✗ " + nombre + ": el minuto cae fuera de la clase"); continue; }
    if (/horquilla/i.test(e.enunciado + " " + (e.explicacion || ""))) { console.error("✗ " + nombre + ": dice «horquilla»"); continue; }
    const uci = mv.from + mv.to + (mv.promotion || "");
    const lineas = await motor.analizar(e.fen, 2, PROFUNDIDAD);
    if (!lineas.length) { console.error("✗ " + nombre + ": Stockfish no contestó (¿la partida ya terminó?)"); continue; }
    const [a, b] = lineas;
    if (a.uci !== uci) {
      console.error("✗ " + nombre + ": Stockfish prefiere " + a.uci + " (" + a.score + "), no " + uci + ". ¿Se dictó mal la posición?");
      continue;
    }
    const s1 = a.score, s2 = b ? b.score : -Infinity;
    const unica = !b || s1 - s2 >= DIFERENCIA || (a.mate > 0 && !(b.mate > 0)) || (gana(s1) && tablasOMenos(s2));
    if (!unica) { console.error("✗ " + nombre + ": " + mv.san + " no es la única buena (" + s1 + " contra " + b.uci + " " + s2 + ")"); continue; }
    console.error("✓ " + nombre + ": " + mv.san + " (" + s1 + "; la segunda, " + (b ? b.uci + " " + s2 : "no hay") + ")");
    buenos.push({ seg: e.seg != null ? Math.floor(+e.seg) : null, enunciado: String(e.enunciado).trim().slice(0, 300),
      fen: new Chess(e.fen).fen(), buena: mv.san, explicacion: e.explicacion ? String(e.explicacion).trim().slice(0, 800) : null });
  }
  motor.cerrar();
  const lit = (v) => { if (String(v).includes("$ej$")) throw new Error("trae $ej$"); return "$ej$" + v + "$ej$"; };
  const sql = buenos.map((e, k) => "insert into public.audios_clase_ejercicios (audio_id, n, seg, enunciado, fen, buena, explicacion) values ('"
    + audioId + "', " + (k + 1) + ", " + (e.seg == null ? "null" : e.seg) + ", " + lit(e.enunciado) + ", " + lit(e.fen) + ", " + lit(e.buena) + ", "
    + (e.explicacion ? lit(e.explicacion) : "null")
    + ") on conflict (audio_id, n) do update set seg = excluded.seg, enunciado = excluded.enunciado, fen = excluded.fen, buena = excluded.buena, explicacion = excluded.explicacion, revisado = false;");
  process.stdout.write(sql.join("\n") + (sql.length ? "\n" : ""));
  console.error(buenos.length + " de " + lista.length + " ejercicios pasan.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
