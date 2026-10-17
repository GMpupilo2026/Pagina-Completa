/* Comprueba con Stockfish todo lo que AFIRMA una sesión intensiva
 * (herramientas/sesion-<nombre>-intensiva.js) y deja el veredicto en
 * herramientas/sesion-<nombre>-motor.json.
 *
 * Una nota que dice «4.Rc5! ÚNICA» o «1.c7? tablas» y no lo es enseña mal, y
 * en la clase se lee igual de bien. chess.js comprueba que las jugadas existan
 * (verificar-sesiones-intensivas.js, en cada CI); que ganen, empaten o pierdan
 * lo tiene que decir un motor.
 *
 * NO se llama verificar-*.js a propósito: el CI no tiene Stockfish. Se corre a
 * mano al cambiar un ejercicio, y el verificador exige que cada afirmación
 * tenga aquí su veredicto (para la MISMA posición y la misma jugada):
 *
 *     apt install stockfish            (o STOCKFISH=/ruta/al/binario)
 *     node herramientas/sesion-intensiva-motor.js finales
 *     node herramientas/sesion-intensiva-motor.js estrategia
 *
 * Qué se pide, siempre desde el bando que tiene la ventaja (el que mueve en el
 * ejercicio), con los umbrales de la sesión (`umbral.gana` y `umbral.noGana`,
 * en centipeones) o los propios del ejercicio, si los trae:
 *   inicio    la posición del ejercicio vale al menos `gana`;
 *   final     la posición al final de la línea también;
 *   unica     esa jugada vale al menos `gana` y NINGUNA otra jugada legal pasa
 *             de `noGana`;
 *   tambien   esa otra jugada también vale al menos `gana`;
 *   trampa    tras la jugada tentadora y su refutación:
 *               «tablas»  entre −noGana y +noGana;
 *               «escapa»  noGana o menos (la ventaja ya no está);
 *               «rival»   −noGana o menos (el rival queda mejor);
 *               «pierde»  −gana o menos (la ventaja pasó al rival);
 *               «castiga» `gana` o más: la trampa es un error del RIVAL y la
 *                         refutación lo castiga.
 * Entre `noGana` y `gana` queda un hueco a propósito: una jugada que caiga ahí
 * no se da por buena ni por mala.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Motor } = require("./lib/motor-uci.js");
const { Chess } = require("chess.js");

const NOMBRE = process.argv[2];
const ARCHIVO = path.join(__dirname, "sesion-" + NOMBRE + "-intensiva.js");
if (!NOMBRE || !fs.existsSync(ARCHIVO)) {
  const hay = fs.readdirSync(__dirname).filter((f) => /^sesion-.+-intensiva\.js$/.test(f))
    .map((f) => f.replace(/^sesion-|-intensiva\.js$/g, ""));
  console.error("Uso: node herramientas/sesion-intensiva-motor.js <" + hay.join("|") + ">");
  process.exit(2);
}
const sesion = require(ARCHIVO);

const PROF = +process.env.PROF || 26;
const HILOS = +process.env.HILOS || 4;
const SALIDA = path.join(__dirname, "sesion-" + NOMBRE + "-motor.json");
const ruta = process.env.STOCKFISH || "/usr/games/stockfish";
if (!fs.existsSync(ruta)) {
  console.error("Falta Stockfish en " + ruta + " (apt install stockfish, o STOCKFISH=/ruta).");
  process.exit(2);
}

const clave = (fen, tipo, san) => fen + "|" + tipo + "|" + (san || "");
const texto = (s) => (s > 50000 ? "#" + (100000 - s) : s < -50000 ? "-#" + (100000 + s) : (s / 100).toFixed(2));

function jugar(fen, sans) {
  const c = new Chess();
  c.load(fen);
  for (const san of sans) if (!c.move(san)) throw new Error("No se puede jugar " + san + " en " + fen);
  return c;
}
const uciASan = (fen, uci) => {
  const c = new Chess(); c.load(fen);
  const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  return m && m.san;
};

/* La evaluación de una posición desde el bando `gana` ("w" o "b"). */
async function evalDesde(m, c, gana) {
  if (c.in_checkmate()) return c.turn() === gana ? -100000 : 100000;
  if (c.game_over()) return 0;
  const r = await m.analizar(c.fen(), 1, PROF);
  return c.turn() === gana ? r[0].score : -r[0].score;
}

const { ejercicios } = sesion.armarPlan();
const tareas = [];
for (const ej of ejercicios) {
  const base = { ej: ej.n, gana: ej.fen.split(" ")[1], umbral: ej.umbral };
  tareas.push(Object.assign({ tipo: "inicio", fen: ej.fen }, base));
  tareas.push(Object.assign({ tipo: "final", fen: ej.final }, base));
  ej.unicas.forEach((i) => tareas.push(Object.assign({ tipo: "unica", fen: ej.antes[i], san: ej.linea[i] }, base)));
  ej.tambien.forEach((t) => tareas.push(Object.assign({ tipo: "tambien", fen: ej.antes[t.jugada], san: t.san }, base)));
  ej.trampas.forEach((t) => tareas.push(Object.assign({ tipo: "trampa", fen: ej.antes[t.jugada], san: t.san,
                                                        refuta: t.refuta, resultado: t.resultado }, base)));
}

async function resolver(m, t) {
  const { gana: GANA, noGana: NO_GANA } = t.umbral;
  if (t.tipo === "inicio" || t.tipo === "final") {
    const v = await evalDesde(m, jugar(t.fen, []), t.gana);
    return { ok: v >= GANA, detalle: "eval " + texto(v) };
  }
  if (t.tipo === "tambien") {
    const v = await evalDesde(m, jugar(t.fen, [t.san]), t.gana);
    return { ok: v >= GANA, detalle: "eval " + texto(v) };
  }
  if (t.tipo === "trampa") {
    const v = await evalDesde(m, jugar(t.fen, [t.san].concat(t.refuta)), t.gana);
    const ok = t.resultado === "pierde" ? v <= -GANA
             : t.resultado === "tablas" ? Math.abs(v) <= NO_GANA
             : t.resultado === "escapa" ? v <= NO_GANA
             : t.resultado === "rival" ? v <= -NO_GANA
             : t.resultado === "castiga" ? v >= GANA : false;
    return { ok, resultado: t.resultado, refuta: t.refuta, detalle: "eval " + texto(v) };
  }
  // unica: todas las jugadas legales, cada una con su evaluación.
  const c = jugar(t.fen, []);
  const n = c.moves().length;
  const r = await m.analizar(t.fen, n, PROF);
  const evals = r.map((x) => ({ san: uciASan(t.fen, x.uci), v: c.turn() === t.gana ? x.score : -x.score }));
  const esta = evals.find((e) => e.san === t.san);
  const otras = evals.filter((e) => e.san !== t.san);
  const ok = r.length === n && !!esta && esta.v >= GANA && otras.every((e) => e.v <= NO_GANA);
  return { ok, detalle: evals.map((e) => e.san + " " + texto(e.v)).join(", ") };
}

(async () => {
  const motores = Array.from({ length: HILOS }, () => new Motor(ruta));
  const veredictos = {};
  let sig = 0, malos = 0;
  await Promise.all(motores.map(async (m) => {
    while (sig < tareas.length) {
      const t = tareas[sig++];
      const v = await resolver(m, t);
      veredictos[clave(t.fen, t.tipo, t.san)] = Object.assign({ ejercicio: t.ej, tipo: t.tipo }, t.san ? { san: t.san } : {},
                                                              { umbral: t.umbral }, v);
      if (!v.ok) malos += 1;
      console.log((v.ok ? "  ✓ " : "  ✗ ") + "Ejercicio " + t.ej + " · " + t.tipo + (t.san ? " " + t.san : "") + " · " +
                  String(v.detalle).slice(0, 300));
    }
  }));
  motores.forEach((m) => m.cerrar());
  const orden = Object.keys(veredictos).sort((a, b) => veredictos[a].ejercicio - veredictos[b].ejercicio || a.localeCompare(b));
  const salida = { motor: "Stockfish 16", profundidad: PROF, veredictos: {} };
  orden.forEach((k) => { salida.veredictos[k] = veredictos[k]; });
  fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 2) + "\n");
  console.log("\n" + tareas.length + " afirmaciones · " + malos + " que el motor no confirma");
  console.log("Escrito: " + path.relative(path.join(__dirname, ".."), SALIDA));
  process.exit(malos ? 1 : 0);
})();
