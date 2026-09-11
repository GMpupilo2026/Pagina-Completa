/**
 * Motor de reglas de Crazyhouse (js/juegos.html, js/crazyhouse.html).
 *
 * Crazyhouse = ajedrez normal + "reserva": cuando capturas una pieza, no
 * desaparece — pasa a TU reserva (de tu color) y más adelante puedes
 * "soltarla" (drop) en cualquier casilla vacía en vez de mover una pieza ya
 * en el tablero. Reglas que este motor implementa, además del ajedrez normal
 * (que delega en chess.js para el tablero):
 *
 *   - Al capturar una pieza, se agrega a la reserva de quien captura, con SU
 *     propio color (no el de quien la tenía).
 *   - Una pieza que llegó a su casilla por PROMOCIÓN, si se captura, vuelve a
 *     la reserva como PEÓN, no como dama/torre/etc. — la "promoción" no
 *     sobrevive a la captura. Por eso el motor lleva su propio registro de
 *     qué casillas tienen una pieza promovida (promotedSquares).
 *   - Un peón no se puede soltar en la 1ª ni la 8ª fila.
 *   - Un drop nunca puede dejar al propio rey en jaque (igual que una jugada
 *     normal ilegal).
 *   - Jaque mate y ahogado deben considerar que un drop puede bloquear un
 *     jaque (tapar la línea de una torre/alfil/dama) aunque chess.js, que no
 *     sabe nada de reservas, ya haya dicho "no hay jugadas" — por eso
 *     in_checkmate()/in_stalemate() de este motor no delegan sin más en
 *     chess.js: primero prueban si algún drop resuelve la posición.
 *
 * Notación FEN: igual que la de lichess para crazyhouse — el tablero normal
 * más "[xyz...]" con una letra por cada pieza en reserva (mayúscula blanca,
 * minúscula negra), antes del turno: "rnbqkbnr/.../RNBQKBNR[Pn] w KQkq - 0 1".
 *
 * Notación de jugadas: normales igual que SAN ("Nf3", "exd5", "O-O"); un
 * drop se anota "N@f3" (pieza en mayúscula + arroba + casilla), como en
 * lichess.
 *
 * Requiere que chess.js ya esté cargado antes que este archivo.
 */
(function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const POCKET_TYPES = ["q", "r", "b", "n", "p"]; // nunca "k": el rey no se captura, se hace mate antes
  const PIECE_LETTER = { q: "Q", r: "R", b: "B", n: "N", p: "" }; // "" para que un drop de peón sea solo "@f3", como en lichess

  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1";

  function emptyPocket() {
    return { q: 0, r: 0, b: 0, n: 0, p: 0 };
  }

  // Separa "<tablero>[<reserva>] <turno> <enroques> <al paso> <medio> <completo>"
  // en sus partes. La reserva mezcla piezas de ambos colores en un solo
  // corchete (mayúscula = blancas, minúscula = negras), igual que lichess.
  function parseFen(fen) {
    const bracketMatch = fen.match(/^([^\[]+)\[([^\]]*)\](.*)$/);
    let boardAndRest, pocketLetters;
    if (bracketMatch) {
      boardAndRest = bracketMatch[1] + bracketMatch[3];
      pocketLetters = bracketMatch[2];
    } else {
      boardAndRest = fen; // por si llega un FEN normal sin reserva (posición inicial "de siempre")
      pocketLetters = "";
    }
    const pockets = { w: emptyPocket(), b: emptyPocket() };
    for (const ch of pocketLetters) {
      const type = ch.toLowerCase();
      if (POCKET_TYPES.indexOf(type) === -1) continue;
      const color = ch === type ? "b" : "w";
      pockets[color][type]++;
    }
    return { boardFen: boardAndRest.trim(), pockets };
  }

  function pocketToLetters(pockets) {
    let out = "";
    for (const type of POCKET_TYPES) {
      for (let i = 0; i < pockets.w[type]; i++) out += type.toUpperCase();
      for (let i = 0; i < pockets.b[type]; i++) out += type;
    }
    return out;
  }

  function buildFen(boardFen, pockets) {
    const parts = boardFen.split(" ");
    const board = parts[0];
    const rest = parts.slice(1).join(" ");
    return board + "[" + pocketToLetters(pockets) + "] " + rest;
  }

  function allSquares() {
    const squares = [];
    for (const f of FILES) for (let r = 1; r <= 8; r++) squares.push(f + r);
    return squares;
  }
  const ALL_SQUARES = allSquares();

  class CrazyhouseGame {
    constructor(fen) {
      this.load(fen || START_FEN);
    }

    load(fen) {
      const { boardFen, pockets } = parseFen(fen);
      this.chess = new Chess(boardFen);
      this.pockets = pockets;
      // Casillas que tienen ahora mismo una pieza que llegó ahí por promoción
      // (para que, si la capturan, vuelva a la reserva como peón). No hay
      // forma de reconstruir esto solo a partir del FEN (un FEN no distingue
      // "dama de siempre" de "peón coronado"), así que en la práctica esto
      // solo es exacto para partidas que arrancaron desde cero y se jugaron
      // jugada a jugada con este mismo motor (el caso real de uso: una
      // partida en vivo entre dos alumnos). Cargar un FEN a mitad de partida
      // sin ese historial trata a todas las piezas como "de siempre".
      this.promotedSquares = new Set();
    }

    fen() {
      return buildFen(this.chess.fen(), this.pockets);
    }

    turn() {
      return this.chess.turn();
    }

    get(square) {
      return this.chess.get(square);
    }

    pocket(color) {
      return this.pockets[color];
    }

    // Jugadas normales (mover una pieza ya en el tablero) para una casilla dada.
    moves(opts) {
      return this.chess.moves(opts);
    }

    // Casillas donde AHORA MISMO sería legal soltar una pieza `type` del color
    // que le toca mover (o el color que se pase explícito).
    dropSquares(type, color) {
      color = color || this.chess.turn();
      if (!this.pockets[color][type]) return [];
      return ALL_SQUARES.filter((sq) => {
        if (this.chess.get(sq)) return false; // casilla ocupada
        if (type === "p" && (sq[1] === "1" || sq[1] === "8")) return false; // peón nunca en la 1ª/8ª
        return this._dropIsSafe(type, color, sq);
      });
    }

    // Prueba el drop sobre una copia desechable del tablero: ¿deja al propio
    // rey en jaque? (la única forma de "ilegalidad" que le falta a un put()
    // crudo de chess.js, que no valida nada de esto por sí solo).
    _dropIsSafe(type, color, square) {
      const fenBefore = this.chess.fen();
      const turnBefore = fenBefore.split(" ")[1];
      // in_check() de chess.js siempre juzga a quien tiene el turno en el FEN
      // cargado — si no es su turno todavía, se lo prestamos un momento nada
      // más para esta prueba y luego se restaura el FEN real sin tocar nada.
      const parts = fenBefore.split(" ");
      if (parts[1] !== color) parts[1] = color;
      this.chess.load(parts.join(" "));
      this.chess.put({ type, color }, square);
      const stillInCheck = this.chess.in_check();
      this.chess.load(fenBefore);
      return !stillInCheck;
    }

    // Aplica una jugada normal (misma forma que chess.move() de chess.js:
    // string SAN o {from,to,promotion}). Devuelve el objeto de jugada de
    // chess.js (con .captured) o null si era ilegal — y de paso actualiza la
    // reserva y el registro de piezas promovidas.
    move(moveSpec) {
      const result = this.chess.move(moveSpec);
      if (!result) return null;
      this._afterOnBoardMove(result);
      return result;
    }

    _afterOnBoardMove(result) {
      // ¿Hubo captura? La casilla de la pieza capturada es `to`, salvo al
      // paso, donde el peón comido está en la misma columna que `to` pero en
      // la fila de `from` (la casilla que pisó el peón que avanzó dos, no la
      // casilla donde terminó el peón que capturó al paso).
      if (result.captured) {
        const capturedSquare = result.flags.indexOf("e") !== -1
          ? result.to[0] + result.from[1]
          : result.to;
        const wasPromoted = this.promotedSquares.has(capturedSquare);
        const pocketType = wasPromoted ? "p" : result.captured;
        const capturingColor = result.color; // quien capturó se queda la pieza
        this.pockets[capturingColor][pocketType]++;
        this.promotedSquares.delete(capturedSquare);
      }
      // La pieza que se movió: si venía de una casilla marcada como
      // promovida, la marca viaja con ella a la casilla nueva.
      if (this.promotedSquares.has(result.from)) {
        this.promotedSquares.delete(result.from);
        this.promotedSquares.add(result.to);
      }
      // Si esta jugada fue justo la promoción, la casilla de llegada queda
      // marcada desde ahora (una torre nunca "hereda" esto al enrocar: la
      // pieza que se enroca es siempre la torre original, nunca una
      // promovida, así que no hace falta tocar nada más aquí).
      if (result.promotion) this.promotedSquares.add(result.to);
    }

    // Suelta una pieza de la reserva en una casilla vacía. Devuelve un
    // objeto de jugada (con la misma forma aproximada que las de chess.js,
    // para que el código que llama no tenga que distinguir casos) o null si
    // era ilegal.
    drop(type, square) {
      const color = this.chess.turn();
      if (!this.pockets[color][type]) return null;
      if (this.chess.get(square)) return null;
      if (type === "p" && (square[1] === "1" || square[1] === "8")) return null;
      if (!this._dropIsSafe(type, color, square)) return null;

      this.chess.put({ type, color }, square);
      this.pockets[color][type]--;
      // Una pieza soltada de la reserva NUNCA cuenta como "promovida" — ya
      // era un peón normal en la reserva antes de soltarla.
      this.promotedSquares.delete(square);
      this._flipTurn();
      const san = (type === "p" ? "" : PIECE_LETTER[type]) + "@" + square;
      return { drop: true, piece: type, color, to: square, san };
    }

    // chess.js no expone una forma directa de "pasar el turno sin mover"
    // (no aplica a ajedrez normal), así que se hace reescribiendo el campo
    // de turno del FEN y recargándolo — el mismo truco que se usa en el
    // editor de tablero de Sesión en vivo (ver sesion.html) para posiciones
    // armadas a mano.
    _flipTurn() {
      const parts = this.chess.fen().split(" ");
      parts[1] = parts[1] === "w" ? "b" : "w";
      parts[3] = "-"; // un drop nunca deja al paso disponible
      this.chess.load(parts.join(" "));
    }

    in_check() {
      return this.chess.in_check();
    }

    // A diferencia de chess.js puro, antes de dar por mate una posición sin
    // jugadas normales, prueba si algún drop de la reserva bloquea el jaque
    // (tapar la línea de un alfil/torre/dama que da jaque a distancia — un
    // jaque de caballo o de peón nunca se puede tapar, pero probar los drops
    // igual y que ninguno funcione da la misma respuesta correcta).
    in_checkmate() {
      if (!this.chess.in_check()) return false;
      if (this.chess.moves().length > 0) return false;
      return !this._hasEscapingDrop();
    }

    in_stalemate() {
      if (this.chess.in_check()) return false;
      if (this.chess.moves().length > 0) return false;
      return !this._hasEscapingDrop();
    }

    in_draw() {
      // Además del ahogado (arriba), se heredan las demás reglas de tablas
      // de chess.js (material insuficiente, 50 jugadas, triple repetición) —
      // ninguna de ellas depende de la reserva.
      return this.in_stalemate() || this.chess.insufficient_material() || this.chess.in_threefold_repetition() || this.chess.in_draw();
    }

    // ¿Existe algún drop legal para quien tiene el turno ahora? Sirve tanto
    // para "¿esto es mate de verdad?" (con jaque) como para "¿esto es
    // ahogado de verdad?" (sin jaque, un drop legal ya cuenta como jugada
    // disponible).
    _hasEscapingDrop() {
      const color = this.chess.turn();
      const pocket = this.pockets[color];
      for (const type of POCKET_TYPES) {
        if (!pocket[type]) continue;
        for (const sq of ALL_SQUARES) {
          if (this.chess.get(sq)) continue;
          if (type === "p" && (sq[1] === "1" || sq[1] === "8")) continue;
          if (this._dropIsSafe(type, color, sq)) return true;
        }
      }
      return false;
    }
  }

  window.Crazyhouse = { Game: CrazyhouseGame, START_FEN, POCKET_TYPES, parseFen, buildFen };
})();
