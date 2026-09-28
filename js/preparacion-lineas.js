/* Preparación de rivales: una «línea» y todo lo que se hace con ella.
 *
 * Una línea es una secuencia de jugadas en SAN (inglés, como las trae el PGN)
 * desde la posición inicial: ["d4", "c5", "Nc3"]. Es lo único que pasa de un
 * lado a otro: el análisis la arma, la página la escribe en notación española,
 * el motor saca su posición, y el plan se exporta en PGN para llevarlo al
 * tablero, a una tarea o a la clase en vivo. Una sola copia de cada una de esas
 * cosas, acá.
 *
 *   sanEs(san), lineaEs(sec, desde)   notación española (C, A, T, D, R)
 *   pct(x), textoEval(v)              «61,3 %», «+0,45», «−M3»
 *   fenDe(sec)                        la posición (con chess.js), o null
 *   planAPgn(resultado, lado)         el plan de «qué jugarle» en PGN, con sus
 *                                     ramas y comentarios
 *   lineaDelPlan(resultado, camino)   una jugada del plan para el tablero
 *                                     (js/visor-linea.js): la línea, sus notas y
 *                                     en qué jugada se abre
 *   notaJugada(x, errores)            la nota de una jugada: la misma en el PGN
 *                                     y en el tablero
 */
(function (raiz, fabrica) {
  "use strict";
  let ChessLib = null;
  if (typeof raiz !== "undefined" && raiz && raiz.Chess) ChessLib = raiz.Chess;
  else if (typeof require === "function") {
    try { ChessLib = require("chess.js").Chess; } catch (e) { ChessLib = null; }
  }
  const api = fabrica(ChessLib);
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.PreparacionLineas = api;
})(typeof self !== "undefined" ? self : this, function (Chess) {
  "use strict";

  const PIEZA = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
  function sanEs(san) {
    return String(san).replace(/^[KQRBN]/, (p) => PIEZA[p]).replace(/=([QRBN])/, (m, p) => "=" + PIEZA[p]);
  }

  // [e4, e5, Nf3] desde la jugada 1 → «1.e4 e5 2.Cf3». `desde` es la media
  // jugada en que empieza (para escribir «2…Cc6» cuando arranca con negras).
  function lineaEs(sec, desde) {
    const d = desde || 0;
    const partes = [];
    sec.forEach((san, i) => {
      const k = d + i;
      const num = Math.floor(k / 2) + 1;
      if (k % 2 === 0) partes.push(num + "." + sanEs(san));
      else if (i === 0) partes.push(num + "…" + sanEs(san));
      else partes.push(sanEs(san));
    });
    return partes.join(" ");
  }

  function pct(x) {
    if (x == null || !Number.isFinite(x)) return "—";
    return (Math.round(x * 1000) / 10).toFixed(1).replace(".", ",") + " %";
  }

  // Evaluaciones en peones desde las blancas; el mate va como ±(100 - jugadas).
  function textoEval(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 50) return (v > 0 ? "+" : "−") + "M" + Math.round(100 - Math.abs(v));
    const s = (Math.round(v * 100) / 100).toFixed(2).replace(".", ",");
    return v > 0 ? "+" + s : v < 0 ? "−" + s.slice(1) : s;
  }

  // La posición (FEN) después de una secuencia, o null si no es legal.
  function fenDe(sec) {
    if (!Chess) return null;
    const g = new Chess();
    for (const san of sec) if (!g.move(san, { sloppy: true })) return null;
    return g.fen();
  }

  // ------------------------------------------------------------ el plan en PGN

  function hoyPgn() {
    const d = new Date();
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  function sinLlaves(t) { return String(t).replace(/[{}]/g, ""); }

  // Lo que dice Stockfish de cada jugada que marcó, por la línea que lleva a ella.
  function erroresDelMotor(r) {
    const errores = new Map();
    if (r && r.motor) {
      for (const x of r.motor.errores.concat(r.motor.cuidado)) errores.set(x.sec.concat(x.jugada).join(" "), x);
    }
    return errores;
  }

  // La nota de una jugada del plan: cuánto saca él ahí y, si Stockfish la
  // marcó, qué dice. La misma para el PGN y para el tablero.
  function notaJugada(x, errores) {
    const partes = [];
    if (x.quien === "rival" && x.reparto != null) partes.push("Él la juega el " + Math.round(100 * x.reparto) + " % de las veces");
    partes.push("él saca " + pct(x.puntos) + " en " + x.n + (x.n === 1 ? " partida" : " partidas"));
    const e = errores && errores.get(x.clave);
    if (e) partes.push("Stockfish: " + (x.quien === "rival" ? "es un error" : "ojo, es un error") +
      " (" + textoEval(e.antes) + " → " + textoEval(e.despues) + ")" + (e.mejor ? ", lo mejor era " + sanEs(e.mejor) : ""));
    return partes.join("; ");
  }

  function comentario(x, errores) { return "{" + sinLlaves(notaJugada(x, errores)) + "}"; }

  /* Una línea del plan para el tablero: el camino hasta una jugada (los nodos
     desde la primera) y, después, la continuación principal hasta el final.
     Devuelve { sec, notas, en }: `en` es cuántas jugadas lleva el camino, que
     es donde se abre el tablero. */
  function lineaDelPlan(r, camino) {
    const errores = erroresDelMotor(r);
    const nodos = camino.slice();
    let x = nodos[nodos.length - 1];
    while (x && x.hijos && x.hijos.length) { x = x.hijos[0]; nodos.push(x); }
    const sec = [];
    const notas = nodos.map((n) => {
      sec.push(n.san);
      return notaJugada(Object.assign({}, n, { clave: sec.join(" ") }), errores);
    });
    return { sec, notas: notas.map((t) => t.charAt(0).toUpperCase() + t.slice(1) + "."), en: camino.length };
  }

  function numero(ply, forzar) {
    const n = Math.floor(ply / 2) + 1;
    if (ply % 2 === 0) return n + ". ";
    return forzar ? n + "... " : "";
  }

  // Un nivel del árbol: la primera rama es la principal; las demás van entre
  // paréntesis, como variantes, justo después de la jugada que reemplazan.
  function movimientos(nodos, ply, sec, errores, forzar) {
    if (!nodos || !nodos.length) return "";
    const [principal, ...otras] = nodos;
    const claveDe = (x) => sec.concat(x.san).join(" ");
    principal.clave = claveDe(principal);
    let s = numero(ply, forzar) + principal.san + " " + comentario(principal, errores);
    for (const v of otras) {
      v.clave = claveDe(v);
      s += " (" + numero(ply, true) + v.san + " " + comentario(v, errores);
      const resto = movimientos(v.hijos, ply + 1, sec.concat(v.san), errores, true);
      s += (resto ? " " + resto : "") + ")";
    }
    const resto = movimientos(principal.hijos, ply + 1, sec.concat(principal.san), errores, true);
    return s + (resto ? " " + resto : "");
  }

  // `lado` es "conBlancas" (tú llevas blancas) o "conNegras".
  function planAPgn(r, lado) {
    const plan = r[lado] && r[lado].plan;
    if (!plan || !plan.length) return "";
    const errores = erroresDelMotor(r);
    const tuBlancas = lado === "conBlancas";
    const rival = sinLlaves(String(r.rival || "Rival")).replace(/"/g, "'");
    const encabezado = [
      ["Event", "Preparación contra " + rival],
      ["Site", "Ajedrez Integral"],
      ["Date", hoyPgn()],
      ["White", tuBlancas ? "Tú" : rival],
      ["Black", tuBlancas ? rival : "Tú"],
      ["Result", "*"],
      ["Annotator", "Preparación de rivales"],
    ].map(([k, v]) => "[" + k + ' "' + v + '"]').join("\n");
    // El árbol se copia: movimientos() le anota la clave a cada nodo.
    const copia = JSON.parse(JSON.stringify(plan));
    return encabezado + "\n\n" + movimientos(copia, 0, [], errores, true) + " *\n";
  }

  return { sanEs, lineaEs, pct, textoEval, fenDe, planAPgn, lineaDelPlan, notaJugada, erroresDelMotor };
});
