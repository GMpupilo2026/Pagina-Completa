/* Comprueba con Stockfish todo lo que AFIRMA la sesión intensiva de finales
 * (herramientas/sesion-finales-intensiva.js) y deja el veredicto en
 * herramientas/sesion-finales-motor.json.
 *
 * Una nota que dice «4.Rc5! ÚNICA» o «1.c7? tablas» y no lo es enseña mal, y
 * en la clase se lee igual de bien. chess.js comprueba que las jugadas existan
 * (verificar-sesion-finales.js, en cada CI); que ganen, empaten o pierdan lo
 * tiene que decir un motor.
 *
 * NO se llama verificar-*.js a propósito: el CI no tiene Stockfish. Se corre a
 * mano al cambiar un ejercicio, y el verificador exige que cada afirmación
 * tenga aquí su veredicto (para la MISMA posición y la misma jugada):
 *
 *     apt install stockfish            (o STOCKFISH=/ruta/al/binario)
 *     node herramientas/sesion-finales-motor.js
 *
 * Qué se pide, siempre desde el bando que gana (el que mueve en el ejercicio):
 *   inicio    la posición del ejercicio gana: al menos +3 o mate;
 *   final     la posición al final de la línea sigue ganando;
 *   unica     esa jugada gana y NINGUNA otra jugada legal llega a +1;
 *   tambien   esa otra jugada también gana;
 *   trampa    tras la jugada tentadora y su refutación, «tablas» queda entre
 *             −1 y +1, y «pierde» en −3 o menos.
 * Sin tablas de finales, Stockfish da ~+5 en un final de torre ganado y
 * ~+35 en uno de peones; las tablas, 0,00. El margen entre +1 y +3 queda vacío
 * a propósito: una jugada que caiga ahí no se da por buena ni por mala.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Motor } = require("./lib/motor-uci.js");
const { Chess } = require("chess.js");
const { armarPlan } = require("./sesion-finales-intensiva.js");

const PROF = +process.env.PROF || 26;
const GANA = 300, TABLAS = 100;
const HILOS = +process.env.HILOS || 4;
const SALIDA = path.join(__dirname, "sesion-finales-motor.json");
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

const { ejercicios } = armarPlan();
const tareas = [];
for (const ej of ejercicios) {
  const gana = ej.fen.split(" ")[1];
  tareas.push({ ej: ej.n, tipo: "inicio", fen: ej.fen, gana });
  tareas.push({ ej: ej.n, tipo: "final", fen: ej.final, gana });
  ej.unicas.forEach((i) => tareas.push({ ej: ej.n, tipo: "unica", fen: ej.antes[i], san: ej.linea[i], gana }));
  ej.tambien.forEach((t) => tareas.push({ ej: ej.n, tipo: "tambien", fen: ej.antes[t.jugada], san: t.san, gana }));
  ej.trampas.forEach((t) => tareas.push({ ej: ej.n, tipo: "trampa", fen: ej.antes[t.jugada], san: t.san,
                                          refuta: t.refuta, resultado: t.resultado, gana }));
}

async function resolver(m, t) {
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
    const ok = t.resultado === "pierde" ? v <= -GANA : Math.abs(v) <= TABLAS;
    return { ok, resultado: t.resultado, refuta: t.refuta, detalle: "eval " + texto(v) };
  }
  // unica: todas las jugadas legales, cada una con su evaluación.
  const c = jugar(t.fen, []);
  const n = c.moves().length;
  const r = await m.analizar(t.fen, n, PROF);
  const evals = r.map((x) => ({ san: uciASan(t.fen, x.uci), v: c.turn() === t.gana ? x.score : -x.score }));
  const esta = evals.find((e) => e.san === t.san);
  const otras = evals.filter((e) => e.san !== t.san);
  const ok = r.length === n && !!esta && esta.v >= GANA && otras.every((e) => e.v <= TABLAS);
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
      veredictos[clave(t.fen, t.tipo, t.san)] = Object.assign({ ejercicio: t.ej, tipo: t.tipo }, t.san ? { san: t.san } : {}, v);
      if (!v.ok) malos += 1;
      console.log((v.ok ? "  ✓ " : "  ✗ ") + "Ejercicio " + t.ej + " · " + t.tipo + (t.san ? " " + t.san : "") + " · " + v.detalle);
    }
  }));
  motores.forEach((m) => m.cerrar());
  const orden = Object.keys(veredictos).sort((a, b) => veredictos[a].ejercicio - veredictos[b].ejercicio || a.localeCompare(b));
  const salida = { motor: "Stockfish 16", profundidad: PROF, gana: GANA, tablas: TABLAS, veredictos: {} };
  orden.forEach((k) => { salida.veredictos[k] = veredictos[k]; });
  fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 2) + "\n");
  console.log("\n" + tareas.length + " afirmaciones · " + malos + " que el motor no confirma");
  console.log("Escrito: " + path.relative(path.join(__dirname, ".."), SALIDA));
  process.exit(malos ? 1 : 0);
})();
