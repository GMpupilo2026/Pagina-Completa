/* ===== Duelo Simultáneo — motor de reglas =====
 *
 * Ajedrez donde los dos jugadores ELIGEN su jugada A LA VEZ, sin ver la del
 * rival, a partir de la MISMA posición. Cada uno solo puede elegir entre las
 * jugadas legales de su propio color en esa posición (las mismas que le
 * daría chess.js si fuera su turno) — lo que no puede saber es qué elige el
 * rival al mismo tiempo. Compromiso y revelado (commit/reveal) con hash +
 * sal aleatoria: nadie puede ver la jugada ajena antes de que las dos ya
 * estén decididas, ni cambiar la propia después de comprometerla.
 *
 * SIMPLIFICACIÓN DE REGLAS (documentada a propósito, no un olvido): esta
 * variante no admite enroque ni captura al paso. Las dos dependen de que
 * las piezas involucradas no se hayan movido o de la jugada inmediatamente
 * anterior — cosas que dejan de tener un significado limpio cuando las dos
 * jugadas de la ronda se resuelven a la vez. El resto de las reglas
 * (jaque, jaque mate, ahogado, coronación, valor de las piezas) son las de
 * siempre.
 *
 * ---------- Cómo se resuelve una ronda ----------
 * Las dos jugadas se validan por separado contra la MISMA posición de
 * partida (cada una, legal para su propio color, ignorando al rival).
 * Para aplicarlas a la vez sin que el orden en que se procesen cambie el
 * resultado:
 *   1. Se quita del tablero la pieza de cada jugador de SU casilla de
 *      origen (las dos salidas ocurren primero, siempre).
 *   2. Si las dos jugadas apuntan a la MISMA casilla de destino: chocan —
 *      ninguna de las dos piezas sobrevive, la casilla queda vacía. Es la
 *      única situación que se resuelve distinto a como se resolvería jugada
 *      por jugada, y es a propósito: nadie "llegó primero".
 *   3. Si no chocan: cada pieza llega a su destino con las reglas de
 *      captura normales (se quita lo que haya ahí, si hay algo, y se
 *      coloca la pieza que llega). Como las dos salidas ya ocurrieron en
 *      el paso 1, una pieza que este turno escapaba de donde el rival
 *      apuntaba YA NO ESTÁ ahí cuando el rival "llega": el escape funciona,
 *      aunque ninguno de los dos supiera lo que iba a hacer el otro.
 *
 * Jaque, jaque mate y ahogado se calculan por separado para cada color con
 * la posición ya resuelta (puede pasar que las dos jugadas, cada una
 * inocente por su cuenta, dejen a los dos reyes en jaque a la vez — es un
 * resultado legítimo del duelo, no un error). Si un color queda en jaque,
 * su lista de jugadas legales de la ronda siguiente ya lo obliga a
 * resolverlo (chess.js nunca ofrece una jugada que deje el propio rey en
 * jaque), así que no hace falta ninguna regla aparte para "toca defenderse".
 */
window.DueloSimultaneo = (function () {
  "use strict";

  // Jugadas legales de `color` en la posición actual, IGNORANDO de quién es
  // el turno en el FEN (se fuerza el color activo y se le pregunta a
  // chess.js) y sin enroque ni captura al paso (ver nota de arriba).
  function legalMovesForColor(chess, color) {
    const partes = chess.fen().split(" ");
    partes[1] = color;
    const prueba = new Chess();
    if (!prueba.load(partes.join(" "))) return [];
    return prueba.moves({ verbose: true }).filter((m) => m.flags.indexOf("k") === -1 && m.flags.indexOf("q") === -1 && m.flags.indexOf("e") === -1);
  }

  function inCheckForColor(chess, color) {
    const partes = chess.fen().split(" ");
    partes[1] = color;
    const prueba = new Chess();
    if (!prueba.load(partes.join(" "))) return true;
    return prueba.in_check();
  }

  // sha256(salt + JSON de la jugada), en hexadecimal — usa Web Crypto
  // (disponible en cualquier navegador moderno, sin librerías). Sirve para
  // comprometerse a una jugada sin revelarla todavía: cambia por completo
  // con cualquier cambio en la jugada o la sal, y no se puede deshacer para
  // adivinar la jugada original sin probar sal y jugada a la vez.
  async function hashMove(move, salt) {
    const texto = salt + "|" + JSON.stringify({ from: move.from, to: move.to, promotion: move.promotion || null });
    const datos = new TextEncoder().encode(texto);
    const buffer = await crypto.subtle.digest("SHA-256", datos);
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function randomSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  class Game {
    constructor() {
      this.chess = new Chess();
      this.commit = { w: null, b: null }; // hash comprometido de esta ronda
      this.reveal = { w: null, b: null }; // {move:{from,to,promotion?}, salt} una vez revelada
      this.round = 1;
      this.lastRound = null; // resumen textual de la última ronda resuelta, para mostrar en pantalla
      this.historial = []; // todas las rondas resueltas hasta ahora, en orden (para el listado de la página)
      this.gameOver = false;
      this.result = null; // "white" | "black" | "draw" | null
    }

    fen() { return this.chess.fen(); }
    get(square) { return this.chess.get(square); }
    legalMovesFor(color) { return legalMovesForColor(this.chess, color); }
    inCheckFor(color) { return inCheckForColor(this.chess, color); }
    isCheckmateFor(color) { return this.inCheckFor(color) && this.legalMovesFor(color).length === 0; }
    isStalemateFor(color) { return !this.inCheckFor(color) && this.legalMovesFor(color).length === 0; }

    isLegalMoveFor(color, move) {
      return this.legalMovesFor(color).some((m) => m.from === move.from && m.to === move.to && (!m.promotion || m.promotion === (move.promotion || "q")));
    }

    async commitMove(color, move) {
      if (this.gameOver) return { ok: false, error: "La partida ya terminó." };
      if (this.commit[color]) return { ok: false, error: "Ya comprometiste tu jugada de esta ronda." };
      if (!this.isLegalMoveFor(color, move)) return { ok: false, error: "Esa jugada no es legal." };
      const salt = randomSalt();
      const hash = await hashMove(move, salt);
      this.commit[color] = hash;
      // La sal y la jugada en claro quedan SOLO en el navegador de quien la
      // comprometió hasta que decide revelar (ver revealMyMove en la página);
      // el motor no las guarda todavía en el estado compartido.
      return { ok: true, salt: salt, move: move };
    }

    bothCommitted() { return !!(this.commit.w && this.commit.b); }

    async revealMove(color, move, salt) {
      if (!this.commit[color]) return { ok: false, error: "Todavía no comprometiste una jugada." };
      const hash = await hashMove(move, salt);
      if (hash !== this.commit[color]) return { ok: false, error: "La jugada revelada no coincide con el compromiso — no se puede cambiar después de comprometerla." };
      this.reveal[color] = { move: move, salt: salt };
      return { ok: true };
    }

    bothRevealed() { return !!(this.reveal.w && this.reveal.b); }

    // Aplica las dos jugadas reveladas a la vez (ver algoritmo en el
    // comentario de cabecera) y avanza la ronda. Debe llamarse solo cuando
    // bothRevealed() es true.
    resolveRound() {
      const moveW = this.reveal.w.move;
      const moveB = this.reveal.b.move;
      const pieceW = this.chess.get(moveW.from);
      const pieceB = this.chess.get(moveB.from);
      this.chess.remove(moveW.from);
      this.chess.remove(moveB.from);

      let choque = moveW.to === moveB.to;
      if (choque) {
        this.chess.remove(moveW.to); // por si quedaba algo más ahí; el destino termina vacío sí o sí
      } else {
        this.chess.remove(moveW.to);
        this.chess.put({ type: moveW.promotion || pieceW.type, color: "w" }, moveW.to);
        this.chess.remove(moveB.to);
        this.chess.put({ type: moveB.promotion || pieceB.type, color: "b" }, moveB.to);
      }

      // Reconstruir el FEN a mano: el color activo no significa nada en este
      // duelo (las dos jugadas ya se aplicaron), así que se deja siempre en
      // "w" solo para que el FEN sea válido; el resto de los flags de
      // enroque/al paso no aplican en esta variante (ver nota de cabecera).
      const board = this.chess.board();
      const filas = [];
      for (let r = 0; r < 8; r++) {
        let fila = "";
        let vacias = 0;
        for (let f = 0; f < 8; f++) {
          const p = board[r][f];
          if (!p) { vacias++; continue; }
          if (vacias) { fila += vacias; vacias = 0; }
          fila += p.color === "w" ? p.type.toUpperCase() : p.type;
        }
        if (vacias) fila += vacias;
        filas.push(fila);
      }
      this.chess.load(filas.join("/") + " w - - 0 " + this.round);

      const sanaW = choque ? (moveW.from + "x" + moveW.to + " (choque)") : (moveW.from + "-" + moveW.to);
      const sanaB = choque ? (moveB.from + "x" + moveB.to + " (choque)") : (moveB.from + "-" + moveB.to);
      this.lastRound = {
        round: this.round,
        w: sanaW, b: sanaB,
        choque: choque,
      };
      this.historial.push(this.lastRound);
      this.round += 1;
      this.commit = { w: null, b: null };
      this.reveal = { w: null, b: null };

      const mateW = this.isCheckmateFor("w"), mateB = this.isCheckmateFor("b");
      const ahogadoW = this.isStalemateFor("w"), ahogadoB = this.isStalemateFor("b");
      if (mateW && mateB) { this.gameOver = true; this.result = "draw"; }
      else if (mateW) { this.gameOver = true; this.result = "black"; }
      else if (mateB) { this.gameOver = true; this.result = "white"; }
      else if (ahogadoW || ahogadoB) { this.gameOver = true; this.result = "draw"; }
      else if (this.chess.in_draw()) { this.gameOver = true; this.result = "draw"; }

      return { ok: true, lastRound: this.lastRound, gameOver: this.gameOver, result: this.result };
    }

    toJSON() {
      return {
        fen: this.chess.fen(), commit: this.commit, reveal: this.reveal,
        round: this.round, lastRound: this.lastRound, historial: this.historial,
        gameOver: this.gameOver, result: this.result,
      };
    }

    static fromJSON(data) {
      const g = new Game();
      g.chess.load(data.fen);
      g.commit = data.commit || { w: null, b: null };
      g.reveal = data.reveal || { w: null, b: null };
      g.round = data.round || 1;
      g.lastRound = data.lastRound || null;
      g.historial = data.historial || [];
      g.gameOver = !!data.gameOver;
      g.result = data.result || null;
      return g;
    }
  }

  return { Game: Game, hashMove: hashMove, randomSalt: randomSalt };
})();
