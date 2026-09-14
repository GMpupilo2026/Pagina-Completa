/**
 * Motor de reglas de Ajedrez para 4 jugadores (FFA y Equipos) — juegos.html /
 * cuatro-jugadores.html. Motor propio, sin chess.js: un tablero en cruz de
 * 160 casillas con hasta 4 reyes vivos a la vez no se puede representar con
 * una librería de ajedrez estándar de 8x8.
 *
 * ---------------------------------------------------------------------
 * TABLERO: grilla de 14x14 (columnas y filas 0-13). Una casilla (c,r) está
 * fuera del tablero si cae en alguna de las 4 esquinas de 3x3 — quedan
 * 196-36=160 casillas jugables, en forma de cruz:
 *
 *   Rojo:      brazo inferior (filas 0-2,  columnas 3-10). Avanza: +fila.
 *   Azul:      brazo izquierdo (columnas 0-2, filas 3-10). Avanza: +columna.
 *   Amarillo:  brazo superior (filas 11-13, columnas 3-10). Avanza: -fila.
 *   Verde:     brazo derecho (columnas 11-13, filas 3-10). Avanza: -columna.
 *
 * Turno: rojo → azul → amarillo → verde (sentido horario), saltando a
 * cualquier asiento eliminado. En Equipos, rojo+amarillo son un equipo y
 * azul+verde el otro (los que están "frente a frente").
 *
 * Cada pieza usa las casillas relativas de siempre (torre/alfil/dama/
 * caballo/rey no dependen de la forma del tablero, solo de una función
 * isOnBoard() que corta en las esquinas). Los peones usan la dirección
 * "adelante" de su asiento; coronan al alcanzar una fila/columna que está a
 * 8 (FFA) o 10 (Equipos) pasos de SU PROPIA fila trasera (ver localRank()) —
 * así la regla es igual para los 4 asientos sin importar su orientación.
 *
 * Notas de alcance (documentadas también en el plan de esta funcionalidad):
 *  - No se implementa "captura al paso" (en passant) en esta primera
 *    versión — es la única regla estándar que se deja pendiente.
 *  - El ahogado (sin jugadas legales, sin estar en jaque) se trata igual
 *    que el jaque mate: elimina a ese jugador. El reglamento original solo
 *    menciona el ahogado como fin de la obligación de mover un rey zombi,
 *    pero generalizar la regla a cualquier jugador es la lectura más
 *    consistente (un jugador sin jugadas legales no puede seguir jugando).
 *  - Fin de partida en FFA: en vez de exigir que 3 reyes hayan sido mate
 *    uno por uno (lo que podría no terminar nunca si quedan reyes zombis
 *    sin que nadie los cace), la partida termina en cuanto queda un solo
 *    asiento "activo de verdad" (ni eliminado ni zombi); ese jugador recibe
 *    20 puntos por cada rey rival que seguía vivo (zombi, no mateado) en
 *    ese momento — es la lectura más fiel del "20 puntos por cada rey vivo"
 *    del reglamento sin depender de que alguien cace zombis manualmente.
 */
(function () {
  "use strict";

  const SEATS = ["red", "blue", "yellow", "green"];
  const TURN_ORDER = ["red", "blue", "yellow", "green"];
  const TEAMMATE = { red: "yellow", yellow: "red", blue: "green", green: "blue" };

  // dc/dr = hacia dónde avanza un peón de este asiento (delta de columna/fila).
  // backAxis/backValue = qué coordenada (columna o fila) identifica la fila
  // trasera propia, y su valor — para poder medir "a cuántos pasos de mi
  // propia fila trasera está esta casilla" (localRank), independiente de la
  // orientación de cada asiento.
  const SEAT_INFO = {
    red: { dc: 0, dr: 1, backAxis: "row", backValue: 0, arm: { cMin: 3, cMax: 10, rMin: 0, rMax: 2 } },
    yellow: { dc: 0, dr: -1, backAxis: "row", backValue: 13, arm: { cMin: 3, cMax: 10, rMin: 11, rMax: 13 } },
    blue: { dc: 1, dr: 0, backAxis: "col", backValue: 0, arm: { cMin: 0, cMax: 2, rMin: 3, rMax: 10 } },
    green: { dc: -1, dr: 0, backAxis: "col", backValue: 13, arm: { cMin: 11, cMax: 13, rMin: 3, rMax: 10 } },
  };

  const PIECE_VALUE = { p: 1, n: 3, b: 5, r: 5, q: 9, k: 20 };

  function isOnBoard(c, r) {
    if (c < 0 || c > 13 || r < 0 || r > 13) return false;
    const cornerCol = c < 3 || c > 10;
    const cornerRow = r < 3 || r > 10;
    return !(cornerCol && cornerRow);
  }

  function sq(c, r) {
    return c + "," + r;
  }
  function parseSq(s) {
    const parts = s.split(",");
    return { c: parseInt(parts[0], 10), r: parseInt(parts[1], 10) };
  }

  function localRank(seat, c, r) {
    const info = SEAT_INFO[seat];
    if (info.backAxis === "row") return info.dr === 1 ? r - info.backValue : info.backValue - r;
    return info.dc === 1 ? c - info.backValue : info.backValue - c;
  }

  // Casilla inicial de los peones de este asiento: 1 paso delante de la
  // fila trasera (localRank === 1).
  function pawnStartLocalRank() {
    return 1;
  }

  function cloneBoard(board) {
    const out = {};
    for (const key in board) out[key] = { type: board[key].type, seat: board[key].seat, dead: board[key].dead };
    return out;
  }

  // ---------------------------------------------------------------------
  // Generación de jugadas por tipo de pieza (pseudo-legales: no comprueban
  // si el propio rey queda en jaque — eso lo filtra Game.legalMoves()).
  // ---------------------------------------------------------------------
  const KNIGHT_OFFSETS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KING_OFFSETS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  function isFriendly(mode, seat, otherSeat) {
    if (otherSeat === seat) return true;
    if (mode === "teams" && TEAMMATE[seat] === otherSeat) return true;
    return false;
  }

  // Genera casillas ATACADAS por una pieza (para jaque) — para el peón son
  // solo las diagonales de captura, nunca la casilla de avance recto.
  function rawAttacks(board, from, piece) {
    const { c, r } = parseSq(from);
    const out = [];
    if (piece.type === "n") {
      KNIGHT_OFFSETS.forEach(([dc, dr]) => { if (isOnBoard(c + dc, r + dr)) out.push(sq(c + dc, r + dr)); });
    } else if (piece.type === "k") {
      KING_OFFSETS.forEach(([dc, dr]) => { if (isOnBoard(c + dc, r + dr)) out.push(sq(c + dc, r + dr)); });
    } else if (piece.type === "r" || piece.type === "b" || piece.type === "q") {
      const dirs = piece.type === "r" ? ROOK_DIRS : piece.type === "b" ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
      dirs.forEach(([dc, dr]) => {
        let nc = c + dc, nr = r + dr;
        while (isOnBoard(nc, nr)) {
          out.push(sq(nc, nr));
          if (board[sq(nc, nr)]) break;
          nc += dc; nr += dr;
        }
      });
    } else if (piece.type === "p") {
      const info = SEAT_INFO[piece.seat];
      // Diagonales perpendiculares a la dirección de avance.
      const perp = info.dc === 0 ? [[1, info.dr], [-1, info.dr]] : [[info.dc, 1], [info.dc, -1]];
      perp.forEach(([dc, dr]) => { if (isOnBoard(c + dc, r + dr)) out.push(sq(c + dc, r + dr)); });
    }
    return out;
  }

  // Genera jugadas pseudo-legales (con destino) de una pieza, respetando
  // amistad (no se puede capturar ni bloquearse a uno mismo, ni al
  // compañero en Equipos) y las reglas propias del peón.
  function rawMoves(board, from, piece, mode, state) {
    const { c, r } = parseSq(from);
    const moves = [];
    if (piece.type === "n" || piece.type === "k") {
      const offsets = piece.type === "n" ? KNIGHT_OFFSETS : KING_OFFSETS;
      offsets.forEach(([dc, dr]) => {
        const nc = c + dc, nr = r + dr;
        if (!isOnBoard(nc, nr)) return;
        const occ = board[sq(nc, nr)];
        if (occ && isFriendly(mode, piece.seat, occ.seat)) return;
        moves.push({ to: sq(nc, nr), capture: !!occ });
      });
      if (piece.type === "k") moves.push(...castlingMoves(board, from, piece, state));
    } else if (piece.type === "r" || piece.type === "b" || piece.type === "q") {
      const dirs = piece.type === "r" ? ROOK_DIRS : piece.type === "b" ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
      dirs.forEach(([dc, dr]) => {
        let nc = c + dc, nr = r + dr;
        while (isOnBoard(nc, nr)) {
          const occ = board[sq(nc, nr)];
          if (occ) {
            if (!isFriendly(mode, piece.seat, occ.seat)) moves.push({ to: sq(nc, nr), capture: true });
            break;
          }
          moves.push({ to: sq(nc, nr), capture: false });
          nc += dc; nr += dr;
        }
      });
    } else if (piece.type === "p") {
      const info = SEAT_INFO[piece.seat];
      const oneC = c + info.dc, oneR = r + info.dr;
      const promoteRank = state.promoteAt;
      if (isOnBoard(oneC, oneR) && !board[sq(oneC, oneR)]) {
        moves.push({ to: sq(oneC, oneR), capture: false, promotion: localRank(piece.seat, oneC, oneR) >= promoteRank });
        const startLocal = localRank(piece.seat, c, r) === pawnStartLocalRank();
        const twoC = c + info.dc * 2, twoR = r + info.dr * 2;
        if (startLocal && isOnBoard(twoC, twoR) && !board[sq(twoC, twoR)]) {
          moves.push({ to: sq(twoC, twoR), capture: false, twoStep: true });
        }
      }
      const perp = info.dc === 0 ? [[1, info.dr], [-1, info.dr]] : [[info.dc, 1], [info.dc, -1]];
      perp.forEach(([dc, dr]) => {
        const nc = c + dc, nr = r + dr;
        if (!isOnBoard(nc, nr)) return;
        const occ = board[sq(nc, nr)];
        if (occ && !isFriendly(mode, piece.seat, occ.seat)) {
          moves.push({ to: sq(nc, nr), capture: true, promotion: localRank(piece.seat, nc, nr) >= promoteRank });
        }
      });
    }
    return moves;
  }

  // Enroque: el rey no se movió, la torre elegida no se movió, casillas
  // entre ambos vacías, el rey no está en jaque ni pasa ni termina en una
  // casilla atacada. Se identifica cada torre por su casilla ORIGINAL (la
  // esquina de su brazo), guardada en state.rookHome[seat] = [sqA, sqB].
  function castlingMoves(board, kingSq, piece, state) {
    const out = [];
    if (state.moved[kingSq]) return out;
    const homes = state.rookHome[piece.seat] || [];
    homes.forEach((rookSq) => {
      const rook = board[rookSq];
      if (!rook || rook.type !== "r" || rook.seat !== piece.seat || state.moved[rookSq]) return;
      const { c: kc, r: kr } = parseSq(kingSq);
      const { c: rc, r: rr } = parseSq(rookSq);
      const info = SEAT_INFO[piece.seat];
      const axis = info.backAxis === "row" ? "c" : "r";
      const kingPos = axis === "c" ? kc : kr;
      const rookPos = axis === "c" ? rc : rr;
      const dir = rookPos > kingPos ? 1 : -1;
      // Casillas entre rey y torre deben estar vacías.
      let pos = kingPos + dir;
      let clearPath = true;
      while (pos !== rookPos) {
        const testSq = axis === "c" ? sq(pos, kr) : sq(kc, pos);
        if (board[testSq]) { clearPath = false; break; }
        pos += dir;
      }
      if (!clearPath) return;
      const kingTo = kingPos + dir * 2;
      const kingToSq = axis === "c" ? sq(kingTo, kr) : sq(kc, kingTo);
      if (!isOnBoard(axis === "c" ? kingTo : kc, axis === "c" ? kr : kingTo)) return;
      out.push({ to: kingToSq, castle: { rookFrom: rookSq, rookTo: axis === "c" ? sq(kingPos + dir, kr) : sq(kc, kingPos + dir) }, castlePath: [kingSq, axis === "c" ? sq(kingPos + dir, kr) : sq(kc, kingPos + dir), kingToSq] });
    });
    return out;
  }

  function enemySeats(mode, seat, active) {
    return active.filter((s) => s !== seat && !isFriendly(mode, seat, s));
  }

  class Game {
    /**
     * @param {"ffa"|"teams"} mode
     * @param {string[]} seatsInUse - subconjunto de SEATS realmente jugado (siempre los 4 en la práctica)
     */
    constructor(mode, seatsInUse) {
      this.mode = mode === "teams" ? "teams" : "ffa";
      this.promoteAt = this.mode === "teams" ? 10 : 8;
      this.seatsInUse = seatsInUse && seatsInUse.length ? seatsInUse.slice() : SEATS.slice();
      this.board = {};
      this.status = {}; // seat -> "active" | "zombie" | "eliminated"
      this.seatsInUse.forEach((s) => { this.status[s] = "active"; });
      this.turn = TURN_ORDER.find((s) => this.seatsInUse.indexOf(s) !== -1) || "red";
      this.moved = {}; // square -> true, para enroque (rey o torre ya se movieron desde esa casilla)
      this.rookHome = {};
      this.moves = []; // historial en notación simple {seat, from, to, piece, capture, promotion, castle}
      this.gameOver = false;
      this.result = null; // {winners:[...], reason, points:{...}}
      this._setupPosition();
    }

    _setupPosition() {
      const ORDER = ["r", "n", "b", "q", "k", "b", "n", "r"];
      this.seatsInUse.forEach((seat) => {
        const info = SEAT_INFO[seat];
        const arm = info.arm;
        const cells = [];
        for (let c = arm.cMin; c <= arm.cMax; c++) for (let r = arm.rMin; r <= arm.rMax; r++) cells.push([c, r]);
        // Fila trasera (localRank 0) y fila de peones (localRank 1).
        const backRank = cells.filter(([c, r]) => localRank(seat, c, r) === 0);
        backRank.sort((a, b) => (info.backAxis === "row" ? a[0] - b[0] : a[1] - b[1]));
        // Amarillo/Verde están "del otro lado": se ordenan al revés para que
        // dama y rey queden alineados con los de su compañero de equipo.
        const mirrored = seat === "yellow" || seat === "green";
        const order = mirrored ? ORDER.slice().reverse() : ORDER;
        backRank.forEach(([c, r], i) => {
          this.board[sq(c, r)] = { type: order[i], seat: seat };
        });
        this.rookHome[seat] = [sq(backRank[0][0], backRank[0][1]), sq(backRank[7][0], backRank[7][1])];
        const pawnRank = cells.filter(([c, r]) => localRank(seat, c, r) === 1);
        pawnRank.forEach(([c, r]) => { this.board[sq(c, r)] = { type: "p", seat: seat }; });
      });
    }

    activeSeats() {
      return this.seatsInUse.filter((s) => this.status[s] !== "eliminated");
    }

    kingSquare(seat) {
      for (const s in this.board) if (this.board[s].seat === seat && this.board[s].type === "k") return s;
      return null;
    }

    isSquareAttacked(square, byAnySeatsExcept, mode) {
      const active = this.activeSeats();
      for (const s in this.board) {
        const p = this.board[s];
        if (byAnySeatsExcept.indexOf(p.seat) === -1) continue;
        if (rawAttacks(this.board, s, p).indexOf(square) !== -1) return true;
      }
      return false;
    }

    isInCheck(seat) {
      const kingSq = this.kingSquare(seat);
      if (!kingSq) return false;
      const enemies = enemySeats(this.mode, seat, this.activeSeats());
      return this.isSquareAttacked(kingSq, enemies);
    }

    // Jugadas legales de UNA pieza (casilla de origen), ya filtradas para
    // que no dejen al propio rey en jaque.
    legalMovesFrom(from) {
      const piece = this.board[from];
      if (!piece) return [];
      const state = { moved: this.moved, rookHome: this.rookHome, promoteAt: this.promoteAt };
      const pseudo = rawMoves(this.board, from, piece, this.mode, state);
      const legal = [];
      pseudo.forEach((m) => {
        if (m.castle) {
          // Ninguna casilla del recorrido del rey puede estar atacada.
          const enemies = enemySeats(this.mode, piece.seat, this.activeSeats());
          const passesThroughCheck = m.castlePath.some((p) => this.isSquareAttacked(p, enemies));
          if (passesThroughCheck || this.isInCheck(piece.seat)) return;
          legal.push(m);
          return;
        }
        const test = cloneBoard(this.board);
        delete test[from];
        test[m.to] = { type: piece.type, seat: piece.seat };
        if (this._kingInCheckOnBoard(test, piece.seat)) return;
        legal.push(m);
      });
      return legal.map((m) => Object.assign({ from: from }, m));
    }

    _kingInCheckOnBoard(board, seat) {
      let kingSq = null;
      for (const s in board) if (board[s].seat === seat && board[s].type === "k") { kingSq = s; break; }
      if (!kingSq) return false;
      const enemies = enemySeats(this.mode, seat, this.activeSeats());
      for (const s in board) {
        const p = board[s];
        if (enemies.indexOf(p.seat) === -1) continue;
        if (rawAttacks(board, s, p).indexOf(kingSq) !== -1) return true;
      }
      return false;
    }

    allLegalMoves(seat) {
      const out = [];
      for (const s in this.board) {
        if (this.board[s].seat !== seat) continue;
        out.push(...this.legalMovesFrom(s));
      }
      return out;
    }

    hasAnyLegalMove(seat) {
      for (const s in this.board) {
        if (this.board[s].seat !== seat) continue;
        if (this.legalMovesFrom(s).length) return true;
      }
      return false;
    }

    // Aplica una jugada humana (no-zombi) de `seat`, valida turno y
    // legalidad, actualiza jaques/eliminaciones/puntos/fin de partida.
    // Devuelve {ok:false, error} o {ok:true, ...detalles...}.
    applyMove(seat, from, to, promotionType) {
      if (this.gameOver) return { ok: false, error: "La partida ya terminó." };
      if (this.turn !== seat) return { ok: false, error: "No es tu turno." };
      if (this.status[seat] === "eliminated") return { ok: false, error: "Ya fuiste eliminado." };
      const legal = this.legalMovesFrom(from).find((m) => m.to === to);
      if (!legal) return { ok: false, error: "Jugada ilegal." };
      return this._commitMove(seat, from, to, legal, promotionType);
    }

    _commitMove(seat, from, to, legal, promotionType) {
      const piece = this.board[from];
      const capturedPiece = this.board[to] ? Object.assign({}, this.board[to]) : null;
      delete this.board[from];
      let finalType = piece.type;
      if (legal.promotion) finalType = (promotionType && "qrbn".indexOf(promotionType) !== -1) ? promotionType : "q";
      this.board[to] = { type: finalType, seat: piece.seat };
      this.moved[from] = true;
      this.moved[to] = true;
      if (legal.castle) {
        const rook = this.board[legal.castle.rookFrom];
        delete this.board[legal.castle.rookFrom];
        this.board[legal.castle.rookTo] = rook;
        this.moved[legal.castle.rookFrom] = true;
        this.moved[legal.castle.rookTo] = true;
      }

      // ---- Puntos por captura (solo FFA; en Equipos no se llevan puntos) ----
      const pointsAwarded = {};
      const addPoints = (who, n) => { if (n) pointsAwarded[who] = (pointsAwarded[who] || 0) + n; };
      let eliminatedByCapture = null;
      if (capturedPiece && this.mode === "ffa") {
        const wasDead = this.status[capturedPiece.seat] === "eliminated" || capturedPiece.dead;
        if (!wasDead) {
          const wasZombieKing = capturedPiece.type === "k" && this.status[capturedPiece.seat] === "zombie";
          addPoints(seat, PIECE_VALUE[capturedPiece.type]);
          if (capturedPiece.type === "k") eliminatedByCapture = capturedPiece.seat; // no debería pasar (se mata por mate, no por captura), pero por robustez
        }
      }

      // ---- Jaques que produce esta jugada (para el bonus de jaque simultáneo, solo FFA) ----
      const checkedSeats = this.activeSeats().filter((s) => s !== seat && this.isInCheck(s));
      if (this.mode === "ffa" && checkedSeats.length >= 2) {
        const isQueen = finalType === "q";
        if (checkedSeats.length === 2) addPoints(seat, isQueen ? 1 : 5);
        else if (checkedSeats.length >= 3) addPoints(seat, isQueen ? 5 : 20);
      }

      this.moves.push({ seat, from, to, piece: finalType, capture: !!capturedPiece, promotion: !!legal.promotion, castle: !!legal.castle });

      // ---- Mate/ahogado del/de los rival(es) recién puestos en jaque, y de cualquier otro activo ----
      this.activeSeats().forEach((s) => {
        if (this.status[s] === "eliminated") return;
        if (!this.hasAnyLegalMove(s)) {
          const wasZombieKingMate = this.status[s] === "zombie";
          this.status[s] = "eliminated";
          this._markPiecesDead(s);
          if (this.mode === "ffa") {
            // Jaque mate real da 20; si estaba ahogado sin estar en jaque también
            // se elimina, pero no corresponde el bonus de "dar jaque mate".
            if (this.isInCheck(s) || wasZombieKingMate) addPoints(seat, PIECE_VALUE.k);
          }
        }
      });

      Object.keys(pointsAwarded).forEach((who) => { /* el llamador (juegos.html/cuatro-jugadores.html) suma esto a seats[who].score */ });

      this._advanceTurn();
      const endInfo = this._checkGameEnd();
      return {
        ok: true,
        captured: capturedPiece,
        pointsAwarded,
        eliminated: this.seatsInUse.filter((s) => this.status[s] === "eliminated"),
        gameOver: this.gameOver,
        result: this.result,
        endInfo,
      };
    }

    _markPiecesDead(seat) {
      for (const s in this.board) if (this.board[s].seat === seat) this.board[s].dead = true;
    }

    _advanceTurn() {
      if (this.gameOver) return;
      const order = TURN_ORDER;
      let idx = order.indexOf(this.turn);
      for (let i = 1; i <= order.length; i++) {
        const candidate = order[(idx + i) % order.length];
        if (this.seatsInUse.indexOf(candidate) === -1) continue;
        if (this.status[candidate] === "eliminated") continue;
        this.turn = candidate;
        return;
      }
    }

    // Movimiento automático de un rey "zombi" (jugador que se rindió o se
    // desconectó): mueve SOLO el rey, una jugada legal al azar; si el rey no
    // tiene ninguna jugada legal pero el bando sí tiene alguna con otra
    // pieza, el rey zombi simplemente no actúa esta vez (se pasa el turno)
    // — solo se elimina al jugador si de verdad no queda ninguna jugada
    // legal para ese bando (jaque mate o ahogado real).
    playZombieTurn() {
      const seat = this.turn;
      if (this.status[seat] !== "zombie" || this.gameOver) return { ok: false };
      const kingSq = this.kingSquare(seat);
      const kingMoves = kingSq ? this.legalMovesFrom(kingSq) : [];
      if (kingMoves.length) {
        const pick = kingMoves[Math.floor(Math.random() * kingMoves.length)];
        return Object.assign({ ok: true, zombie: true }, this._commitMove(seat, kingSq, pick.to, pick, "q"));
      }
      // El rey no tiene adónde ir: si el bando no tiene NINGUNA jugada legal,
      // está mate/ahogado de verdad y se elimina; si sí tiene (otra pieza
      // podría salvarlo, pero el zombi no la usa), se pasa el turno sin más.
      if (!this.hasAnyLegalMove(seat)) {
        this.status[seat] = "eliminated";
        this._markPiecesDead(seat);
        this._advanceTurn();
        const endInfo = this._checkGameEnd();
        return { ok: true, zombie: true, passed: false, eliminatedNow: true, gameOver: this.gameOver, result: this.result, endInfo };
      }
      this._advanceTurn();
      return { ok: true, zombie: true, passed: true, gameOver: this.gameOver, result: this.result };
    }

    resign(seat) {
      if (this.status[seat] === "active") this.status[seat] = "zombie";
      return this._checkGameEnd();
    }

    _checkGameEnd() {
      if (this.gameOver) return this.result;
      if (this.mode === "teams") {
        const eliminated = this.seatsInUse.filter((s) => this.status[s] === "eliminated");
        if (eliminated.length) {
          // El primer rey en caer decide: gana el EQUIPO CONTRARIO al del
          // primer eliminado (mate a cualquiera de los rivales = victoria).
          const loserSeat = eliminated[0];
          const winningTeamSeat = TURN_ORDER.find((s) => this.seatsInUse.indexOf(s) !== -1 && !isFriendly("teams", loserSeat, s));
          const winners = [winningTeamSeat, TEAMMATE[winningTeamSeat]].filter((s) => this.seatsInUse.indexOf(s) !== -1);
          this.gameOver = true;
          this.result = { winners, reason: "checkmate" };
        }
        return this.result;
      }
      // FFA: termina en cuanto solo queda 1 asiento realmente activo
      // (ni eliminado ni zombi) — ver nota de alcance al inicio del archivo.
      const trulyActive = this.seatsInUse.filter((s) => this.status[s] === "active");
      if (trulyActive.length <= 1) {
        const zombiesStillAlive = this.seatsInUse.filter((s) => this.status[s] === "zombie");
        const bonus = {};
        if (trulyActive.length === 1) bonus[trulyActive[0]] = zombiesStillAlive.length * PIECE_VALUE.k;
        this.gameOver = true;
        this.result = { winners: trulyActive.length === 1 ? trulyActive : [], reason: "last-standing", bonusPoints: bonus };
      }
      return this.result;
    }

    // El profesor termina la partida manualmente (equivalente a "Terminar"
    // en Crazyhouse). En FFA con 2+ jugadores vivos reparte 10 puntos c/u.
    forceEnd() {
      if (this.gameOver) return this.result;
      this.gameOver = true;
      if (this.mode === "ffa") {
        const alive = this.seatsInUse.filter((s) => this.status[s] !== "eliminated");
        const bonus = {};
        alive.forEach((s) => { bonus[s] = 10; });
        this.result = { winners: alive, reason: "draw", bonusPoints: bonus };
      } else {
        this.result = { winners: [], reason: "draw" };
      }
      return this.result;
    }

    toJSON() {
      return {
        mode: this.mode,
        seatsInUse: this.seatsInUse,
        board: this.board,
        status: this.status,
        turn: this.turn,
        moved: this.moved,
        rookHome: this.rookHome,
        moves: this.moves,
        gameOver: this.gameOver,
        result: this.result,
      };
    }

    static fromJSON(json) {
      const g = Object.create(Game.prototype);
      g.mode = json.mode;
      g.promoteAt = json.mode === "teams" ? 10 : 8;
      g.seatsInUse = json.seatsInUse.slice();
      g.board = {};
      for (const s in json.board) g.board[s] = Object.assign({}, json.board[s]);
      g.status = Object.assign({}, json.status);
      g.turn = json.turn;
      g.moved = Object.assign({}, json.moved);
      g.rookHome = json.rookHome;
      g.moves = (json.moves || []).slice();
      g.gameOver = !!json.gameOver;
      g.result = json.result || null;
      return g;
    }
  }

  window.FourPlayerChess = { Game, SEATS, TURN_ORDER, TEAMMATE, isOnBoard, sq, parseSq, localRank, SEAT_INFO, PIECE_VALUE };
})();
