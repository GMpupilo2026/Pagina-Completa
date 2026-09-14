/* ===== Ajedrez de Cartas — motor de reglas =====
 *
 * Ajedrez de toda la vida (las reglas de movimiento y jaque las sigue
 * validando chess.js, sin tocarlas) más una mano de cartas de un solo uso.
 * En su turno, ANTES de mover, cada jugador puede jugar como máximo UNA
 * carta de su mano; después hace su jugada normal, obligatoria, como en
 * cualquier partida.
 *
 * Principio de seguridad que se aplica a TODA carta que toca el tablero
 * (Refuerzo, Ascenso): after aplicarla, si el propio rey queda en jaque,
 * la carta se rechaza entera y no se gasta — igual que una jugada ilegal.
 * Se comprueba con la misma técnica que ya usa este sitio para verificar
 * posiciones (cargar el FEN resultante SIN voltear el turno todavía y
 * preguntarle a chess.js si ese color está en jaque).
 *
 * Cartas (mazo de 16: dos copias de cada una de las 8):
 *   refuerzo — coloca un peón nuevo tuyo en una casilla vacía de tu mitad
 *              del tablero (filas 2-4 blancas, 5-7 negras).
 *   ascenso  — convierte un peón tuyo, donde esté, en dama/torre/alfil o
 *              caballo al instante (no hace falta llegar a la última fila).
 *   congelar — la próxima jugada del rival no puede salir de la casilla
 *              que elijas.
 *   escudo   — la próxima jugada del rival no puede capturar en la casilla
 *              que elijas.
 *   salto    — esta jugada, tu rey puede además moverse 2 casillas en
 *              línea recta o diagonal (casillas vacías, ninguna atacada).
 *   robo     — te llevas una carta al azar de la mano del rival.
 *   vision   — ves la mano del rival hasta tu próxima jugada.
 *   doble    — después de tu jugada de esta ronda, vuelves a jugar tú.
 *
 * `congelar` y `escudo` se aplican filtrando la lista de jugadas legales
 * del rival (no tocan el tablero): por eso jaque mate y ahogado se calculan
 * aquí con ESA lista filtrada, no con la de chess.js a secas — si el único
 * escape del rival pasaba por la pieza congelada o la captura protegida,
 * la carta puede terminar la partida, y es a propósito.
 */
window.CartasChess = (function () {
  "use strict";

  const CARD_IDS = ["refuerzo", "ascenso", "congelar", "escudo", "salto", "robo", "vision", "doble"];

  const CARTAS = {
    refuerzo: { nombre: "Refuerzo", emoji: "➕", objetivo: "casilla_vacia_propia", texto: "Coloca un peón nuevo tuyo en una casilla vacía de tu mitad del tablero." },
    ascenso: { nombre: "Ascenso", emoji: "👑", objetivo: "peon_propio", texto: "Convierte un peón tuyo en dama, torre, alfil o caballo al instante." },
    congelar: { nombre: "Congelar", emoji: "🧊", objetivo: "pieza_rival", texto: "La próxima jugada del rival no puede salir de la pieza que elijas." },
    escudo: { nombre: "Escudo", emoji: "🛡️", objetivo: "pieza_propia", texto: "La próxima jugada del rival no puede capturar la pieza que elijas." },
    salto: { nombre: "Salto real", emoji: "🐴", objetivo: "ninguno", texto: "Esta jugada, tu rey también puede saltar 2 casillas en línea recta o diagonal." },
    robo: { nombre: "Robo", emoji: "🃏", objetivo: "ninguno", texto: "Te llevas una carta al azar de la mano del rival." },
    vision: { nombre: "Visión", emoji: "👁️", objetivo: "ninguno", texto: "Ves la mano del rival hasta tu próxima jugada." },
    doble: { nombre: "Doble turno", emoji: "⏩", objetivo: "ninguno", texto: "Después de tu jugada de esta ronda, vuelves a jugar tú." },
  };

  function otherColor(c) { return c === "w" ? "b" : "w"; }

  function baraja(lista, rng) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor((rng ? rng() : Math.random()) * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  function mazoNuevo(rng) {
    const mazo = [];
    CARD_IDS.forEach((id) => { mazo.push(id, id); });
    return baraja(mazo, rng);
  }

  // ¿El color `color` queda en jaque en la posición actual de `game`? Sirve
  // tanto si es su turno ahí mismo (in_check normal) como si acabamos de
  // tocar el tablero con una carta y el turno todavía no volteó: en ese
  // caso forzamos el color activo del FEN a `color` antes de preguntar.
  function dejaEnJaque(game, color) {
    if (game.turn() === color) return game.in_check();
    const partes = game.fen().split(" ");
    partes[1] = color;
    const prueba = new Chess();
    if (!prueba.load(partes.join(" "))) return true; // posición rota: más vale rechazar
    return prueba.in_check();
  }

  class Game {
    constructor() {
      this.chess = new Chess();
      this.hands = { w: [], b: [] };
      this.discard = [];
      this.deck = [];
      this.frozenSquare = null; // {square, appliesTo} — `appliesTo` no puede mover ESA pieza en su próxima jugada
      this.shieldedSquare = null; // {square, appliesTo} — `appliesTo` no puede capturar ESA pieza en su próxima jugada
      this.kingLeapAvailable = false; // el que tiene el turno puede saltar con el rey esta jugada
      this.doubleTurnPending = false; // set al jugar "doble"; se consume tras la primera jugada
      this.visionUntil = null; // color al que se le vence "vision" en su próxima jugada
      this.cardPlayedThisTurn = false;
      this.lastCardEvent = null; // texto para mostrar en pantalla tras jugar una carta
    }

    static iniciar(rng) {
      const g = new Game();
      g.deck = mazoNuevo(rng);
      g.hands.w = g.deck.splice(0, 3);
      g.hands.b = g.deck.splice(0, 3);
      return g;
    }

    fen() { return this.chess.fen(); }
    turn() { return this.chess.turn(); }
    get(square) { return this.chess.get(square); }
    inCheck() { return this.chess.in_check(); }

    // Jugadas legales del color en turno, ya filtradas por congelar/escudo.
    legalMoves(opts) {
      let moves = this.chess.moves(Object.assign({ verbose: true }, opts || {}));
      if (this.frozenSquare && this.frozenSquare.appliesTo === this.turn()) {
        moves = moves.filter((m) => m.from !== this.frozenSquare.square);
      }
      if (this.shieldedSquare && this.shieldedSquare.appliesTo === this.turn()) {
        moves = moves.filter((m) => m.to !== this.shieldedSquare.square);
      }
      if (this.kingLeapAvailable && (!opts || !opts.square || opts.square === this._kingSquare(this.turn()))) {
        moves = moves.concat(this._kingLeapMoves(this.turn()));
      }
      return moves;
    }

    _kingSquare(color) {
      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      for (const f of files) for (let r = 1; r <= 8; r++) {
        const sq = f + r;
        const p = this.chess.get(sq);
        if (p && p.type === "k" && p.color === color) return sq;
      }
      return null;
    }

    // Las 8 casillas a "distancia de salto" (2 en línea recta o diagonal) desde
    // el rey, siempre que estén vacías las dos casillas del camino y ninguna
    // esté atacada por el rival — como un enroque sin torre, en cualquier dirección.
    _kingLeapMoves(color) {
      const king = this._kingSquare(color);
      if (!king) return [];
      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const kf = files.indexOf(king[0]), kr = parseInt(king[1], 10);
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      const salidas = [];
      dirs.forEach(([df, dr]) => {
        const midF = kf + df, midR = kr + dr;
        const dstF = kf + 2 * df, dstR = kr + 2 * dr;
        if (midF < 0 || midF > 7 || dstF < 0 || dstF > 7 || dstR < 1 || dstR > 8) return;
        const midSq = files[midF] + midR;
        const dstSq = files[dstF] + dstR;
        if (this.chess.get(midSq) || this.chess.get(dstSq)) return; // camino y destino deben estar vacíos
        if (this._squareAttackedBy(midSq, otherColor(color)) || this._squareAttackedBy(dstSq, otherColor(color))) return;
        salidas.push({ from: king, to: dstSq, piece: "k", flags: "leap", san: "Rey salta a " + dstSq });
      });
      return salidas;
    }

    // ¿Alguna pieza de `byColor` ataca `square` en la posición actual? Se
    // comprueba con el mismo truco de siempre: forzar el color activo del
    // FEN al atacante y preguntarle a chess.js sus jugadas pseudo-legales
    // desde cada una de sus piezas.
    _squareAttackedBy(square, byColor) {
      const partes = this.chess.fen().split(" ");
      partes[1] = byColor;
      const prueba = new Chess();
      if (!prueba.load(partes.join(" "))) return true;
      const board = prueba.board();
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (!p || p.color !== byColor) continue;
        const files = "abcdefgh";
        const from = files[f] + (8 - r);
        const moves = prueba.moves({ square: from, verbose: true });
        if (moves.some((m) => m.to === square)) return true;
      }
      return false;
    }

    inCheckmate() { return this.inCheck() && this.legalMoves().length === 0; }
    inStalemate() { return !this.inCheck() && this.legalMoves().length === 0; }
    inDraw() { return this.inStalemate() || this.chess.in_draw(); }
    isGameOver() { return this.inCheckmate() || this.inDraw(); }

    // ---------- Jugar una carta ----------
    // `params` según la carta: { square } para refuerzo/congelar/escudo,
    // { square, promotion } para ascenso. Devuelve {ok:true, texto} o
    // {ok:false, error}.
    playCard(color, cardId, params) {
      if (this.turn() !== color) return { ok: false, error: "No es tu turno." };
      if (this.cardPlayedThisTurn) return { ok: false, error: "Ya jugaste una carta esta jugada." };
      const idx = this.hands[color].indexOf(cardId);
      if (idx === -1) return { ok: false, error: "No tienes esa carta." };
      params = params || {};

      const metodo = this["_carta_" + cardId];
      if (!metodo) return { ok: false, error: "Carta desconocida." };
      const resultado = metodo.call(this, color, params);
      if (!resultado.ok) return resultado;

      this.hands[color].splice(idx, 1);
      this.discard.push(cardId);
      this.cardPlayedThisTurn = true;
      this.lastCardEvent = resultado.texto;
      return resultado;
    }

    _tocaTablero(color, mutar) {
      const antes = this.chess.fen();
      const ok = mutar();
      if (!ok) { this.chess.load(antes); return false; }
      if (dejaEnJaque(this.chess, color)) { this.chess.load(antes); return false; }
      return true;
    }

    _carta_refuerzo(color, params) {
      const square = params.square;
      if (!square || this.chess.get(square)) return { ok: false, error: "Elige una casilla vacía." };
      const rank = parseInt(square[1], 10);
      const rangoValido = color === "w" ? (rank >= 2 && rank <= 4) : (rank >= 5 && rank <= 7);
      if (!rangoValido) return { ok: false, error: "Solo en tu mitad del tablero (sin contar tu primera fila)." };
      const aplicado = this._tocaTablero(color, () => this.chess.put({ type: "p", color: color }, square));
      if (!aplicado) return { ok: false, error: "Esa jugada te dejaría en jaque." };
      return { ok: true, texto: "Refuerzo: nuevo peón en " + square + "." };
    }

    _carta_ascenso(color, params) {
      const square = params.square;
      const promotion = params.promotion;
      const piece = this.chess.get(square || "");
      if (!piece || piece.type !== "p" || piece.color !== color) return { ok: false, error: "Elige un peón tuyo." };
      if (["q", "r", "b", "n"].indexOf(promotion) === -1) return { ok: false, error: "Elige a qué pieza corona." };
      const aplicado = this._tocaTablero(color, () => {
        this.chess.remove(square);
        return this.chess.put({ type: promotion, color: color }, square);
      });
      if (!aplicado) return { ok: false, error: "Esa jugada te dejaría en jaque." };
      const nombres = { q: "dama", r: "torre", b: "alfil", n: "caballo" };
      return { ok: true, texto: "Ascenso: el peón de " + square + " es ahora " + nombres[promotion] + "." };
    }

    _carta_congelar(color, params) {
      const square = params.square;
      const piece = this.chess.get(square || "");
      if (!piece || piece.color === color) return { ok: false, error: "Elige una pieza del rival." };
      if (piece.type === "k") return { ok: false, error: "El rey no se puede congelar." };
      this.frozenSquare = { square: square, appliesTo: otherColor(color) };
      return { ok: true, texto: "Congelado: la pieza de " + square + " no podrá moverse en la próxima jugada rival." };
    }

    _carta_escudo(color, params) {
      const square = params.square;
      const piece = this.chess.get(square || "");
      if (!piece || piece.color !== color) return { ok: false, error: "Elige una pieza tuya." };
      this.shieldedSquare = { square: square, appliesTo: otherColor(color) };
      return { ok: true, texto: "Escudo: la pieza de " + square + " no podrá ser capturada en la próxima jugada rival." };
    }

    _carta_salto(color) {
      this.kingLeapAvailable = true;
      return { ok: true, texto: "Salto real: esta jugada tu rey también puede saltar 2 casillas." };
    }

    _carta_robo(color, params, rng) {
      const rivalColor = otherColor(color);
      const mano = this.hands[rivalColor];
      if (!mano.length) return { ok: false, error: "El rival no tiene cartas que robar." };
      const i = Math.floor((rng || Math.random)() * mano.length);
      const carta = mano.splice(i, 1)[0];
      this.hands[color].push(carta);
      return { ok: true, texto: "Robo: te llevaste " + CARTAS[carta].nombre + " de la mano rival." };
    }

    _carta_vision(color) {
      this.visionUntil = color;
      return { ok: true, texto: "Visión: ves la mano rival hasta tu próxima jugada." };
    }

    _carta_doble(color) {
      this.doubleTurnPending = true;
      return { ok: true, texto: "Doble turno: vuelves a jugar después de esta jugada." };
    }

    // ---------- Jugar una jugada normal de ajedrez ----------
    // `move` es {from, to, promotion?} — igual que en todo el resto del sitio.
    // Devuelve {ok:true, san, gameOver, result} o {ok:false, error}.
    move(move) {
      const color = this.turn();
      const legales = this.legalMoves();
      const match = legales.find((m) => m.from === move.from && m.to === move.to && (!m.promotion || m.promotion === (move.promotion || "q")));
      if (!match) return { ok: false, error: "Jugada ilegal." };

      let san;
      if (match.flags === "leap") {
        this.chess.remove(match.from);
        this.chess.put({ type: "k", color: color }, match.to);
        san = "Rey salta a " + match.to;
        // Saltar con el rey rompe el enroque de ese color, igual que cualquier
        // otro movimiento de rey — chess.js ya deja de ofrecer enroque para
        // ese color en cuanto el rey no está en su casilla original al releer
        // el FEN, así que no hace falta tocar los flags de enroque a mano.
        const partes = this.chess.fen().split(" ");
        partes[1] = otherColor(color);
        this.chess.load(partes.join(" "));
      } else {
        const applied = this.chess.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });
        if (!applied) return { ok: false, error: "Jugada ilegal." };
        san = applied.san;
      }

      // "congelar"/"escudo" solo se limpian cuando mueve el color al que
      // restringían (la única jugada rival a la que aplicaban ya pasó,
      // la haya usado o no) — no cuando mueve quien las puso.
      if (this.frozenSquare && this.frozenSquare.appliesTo === color) this.frozenSquare = null;
      if (this.shieldedSquare && this.shieldedSquare.appliesTo === color) this.shieldedSquare = null;
      this.kingLeapAvailable = false;
      if (this.visionUntil === otherColor(color)) this.visionUntil = null;
      this.cardPlayedThisTurn = false;

      // El estado de la partida se decide en la posición natural de después
      // de esta jugada (turno del rival) — ANTES de que "doble" pueda
      // devolverle el turno a quien movió, para no preguntarle a chess.js
      // por el jaque mate del bando equivocado.
      let gameOver = false, result = null;
      if (this.inCheckmate()) { gameOver = true; result = color; } // quien está mate es el rival; gana quien acaba de mover
      else if (this.inDraw()) { gameOver = true; result = "draw"; }

      if (this.doubleTurnPending) {
        this.doubleTurnPending = false;
        if (!gameOver) {
          // Revertir el turno a quien acaba de jugar: vuelve a jugar ya mismo.
          const partes = this.chess.fen().split(" ");
          partes[1] = color;
          this.chess.load(partes.join(" "));
        }
      }

      // Repartir carta al que acaba de mover, si queda mazo (jugar una carta
      // NO reparte; solo mover sí, para que el ritmo de cartas nuevas vaya
      // con las jugadas reales de la partida).
      if (this.deck.length) this.hands[color].push(this.deck.shift());

      return { ok: true, san: san, gameOver: gameOver, result: result };
    }

    toJSON() {
      return {
        fen: this.chess.fen(),
        hands: this.hands,
        discard: this.discard,
        deck: this.deck,
        frozenSquare: this.frozenSquare,
        shieldedSquare: this.shieldedSquare,
        kingLeapAvailable: this.kingLeapAvailable,
        doubleTurnPending: this.doubleTurnPending,
        visionUntil: this.visionUntil,
        cardPlayedThisTurn: this.cardPlayedThisTurn,
      };
    }

    static fromJSON(data) {
      const g = new Game();
      g.chess.load(data.fen);
      g.hands = data.hands || { w: [], b: [] };
      g.discard = data.discard || [];
      g.deck = data.deck || [];
      g.frozenSquare = data.frozenSquare || null;
      g.shieldedSquare = data.shieldedSquare || null;
      g.kingLeapAvailable = !!data.kingLeapAvailable;
      g.doubleTurnPending = !!data.doubleTurnPending;
      g.visionUntil = data.visionUntil || null;
      g.cardPlayedThisTurn = !!data.cardPlayedThisTurn;
      return g;
    }
  }

  return { Game: Game, CARTAS: CARTAS, CARD_IDS: CARD_IDS, mazoNuevo: mazoNuevo };
})();
