/* Stockfish por UCI, para los scripts de herramientas/ que analizan posiciones
 * en Node (herramientas/diagnostico-lichess.js, herramientas/tipos-generar.js).
 * Hace falta el binario instalado: STOCKFISH=/ruta/al/stockfish, o el de
 * /usr/games/stockfish (apt install stockfish).
 */
"use strict";
const { spawn } = require("child_process");

class Motor {
  constructor(ruta) {
    this.p = spawn(ruta || process.env.STOCKFISH || "/usr/games/stockfish");
    this.buf = "";
    this.esperando = null;
    this.lineas = [];
    this.p.stdout.on("data", (d) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf("\n")) >= 0) {
        const l = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this.lineas.push(l);
        if (this.esperando && this.esperando.fin(l)) {
          const r = this.esperando;
          this.esperando = null;
          r.ok(this.lineas.splice(0));
        }
      }
    });
    this.enviar("uci");
    this.enviar("setoption name Hash value 128");
    this.enviar("setoption name Threads value 1");
  }
  enviar(c) { this.p.stdin.write(c + "\n"); }
  pedir(cmds, fin) {
    return new Promise((ok) => {
      this.lineas = [];
      this.esperando = { fin, ok };
      cmds.forEach((c) => this.enviar(c));
    });
  }
  /* MultiPV: devuelve [{uci, score (cp, mate = ±100000-n), pv}] ordenado. */
  async analizar(fen, multipv, profundidad, searchmoves) {
    this.enviar(`setoption name MultiPV value ${multipv}`);
    const lineas = await this.pedir([
      "ucinewgame", `position fen ${fen}`,
      `go depth ${profundidad}${searchmoves ? " searchmoves " + searchmoves.join(" ") : ""}`,
    ], (l) => l.startsWith("bestmove"));
    const porPv = {};
    lineas.forEach((l) => {
      if (!l.startsWith("info") || !/ depth (\d+)/.test(l) || !/ pv /.test(l)) return;
      const prof = +/ depth (\d+)/.exec(l)[1];
      if (prof !== profundidad) return;
      const n = +((/ multipv (\d+)/.exec(l) || [0, 1])[1]);
      const m = / score (cp|mate) (-?\d+)/.exec(l);
      if (!m) return;
      const v = m[1] === "cp" ? +m[2] : (+m[2] > 0 ? 100000 - +m[2] : -100000 - +m[2]);
      const pv = l.split(" pv ")[1].split(" ");
      porPv[n] = { uci: pv[0], score: v, pv, mate: m[1] === "mate" ? +m[2] : null };
    });
    return Object.keys(porPv).sort((a, b) => a - b).map((k) => porPv[k]);
  }
  cerrar() { this.enviar("quit"); }
}

module.exports = { Motor };
