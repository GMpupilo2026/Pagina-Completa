/* ===== Niebla de Guerra — cálculo de visibilidad =====
 *
 * Las piezas se mueven como siempre (motor: chess.js), pero sin jaques:
 * gana quien se come el rey (ver «Las reglas» más abajo, NieblaGuerra.reglas).
 * Lo demás es VISUAL: cada jugador solo ve las casillas que sus propias piezas
 * alcanzan a atacar o defender en la posición actual. El resto del tablero
 * queda cubierto por niebla — puede estar vacío o tener una pieza rival, no
 * hay forma de saberlo hasta que una pieza propia le "ponga los ojos
 * encima" (o hasta que se mueva ahí y descubra qué había).
 *
 * A propósito NO es Kriegspiel puro: en Kriegspiel clásico no ves ni tu
 * propio alcance, solo un árbitro te va dando pistas ("hay una captura
 * posible", "jaque desde tal dirección"). Acá, en cambio, cada jugador ve
 * exactamente lo mismo que verían las piezas de su propio color — más
 * jugable, menos frustrante, y de todos modos genuinamente distinto a
 * cualquier variante clásica: hay que deducir dónde puede estar el rival
 * combinando lo que se ve con lo que YA NO se ve (una casilla vigilada que
 * de repente deja de estarlo, un peón que "desaparece" del último lugar
 * donde se lo vio, etc.).
 *
 * Aviso de diseño (a propósito, documentado): el ocultamiento es solo
 * visual, del lado del cliente — la posición completa (fen) sigue
 * viajando entera por Supabase como en el resto del sitio (no hay validación
 * de reglas del lado del servidor en ninguna variante de Juegos), así que
 * un alumno que abra las herramientas de desarrollador podría leer el
 * tablero completo. Es el mismo modelo de confianza que ya tiene el resto
 * del sitio; para esta variante en particular (a diferencia de Duelo
 * Simultáneo, donde SÍ hace falta ocultar una jugada de un compromiso
 * criptográfico) no se justifica construir una función de servidor aparte
 * solo para filtrar el fen por jugador.
 */
window.NieblaGuerra = (function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  function rcToSquare(r, c) { return FILES[c] + (8 - r); }
  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

  const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING_DELTAS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // Todas las casillas que ve UNA pieza propia parada en (r,c): su propia
  // casilla, más lo que alcanza a atacar o defender según su tipo. A
  // propósito NO es lo mismo que "jugadas legales de chess.js":
  //  - un peón vigila sus dos casillas diagonales aunque estén vacías (no
  //    solo cuando hay algo que capturar ahí);
  //  - una torre/alfil/dama SÍ "ve" (y por lo tanto revela) una casilla
  //    ocupada por una pieza propia que está defendiendo, algo que chess.js
  //    nunca ofrece como jugada legal (no se puede capturar la propia
  //    pieza) pero que un jugador real sabe que está ahí.
  //  - un caballo ve sus 8 casillas en L sin que lo bloquee nada de por medio
  //    (salta, como siempre en ajedrez).
  function squaresSeenByPiece(board, r, c, piece) {
    const seen = [rcToSquare(r, c)];
    const type = piece.type, color = piece.color;

    function ray(dirs) {
      dirs.forEach(([dr, dc]) => {
        let rr = r + dr, cc = c + dc;
        while (inBounds(rr, cc)) {
          seen.push(rcToSquare(rr, cc));
          if (board[rr][cc]) break; // una pieza (propia o rival) tapa lo que sigue del rayo
          rr += dr; cc += dc;
        }
      });
    }

    if (type === "n") {
      KNIGHT_DELTAS.forEach(([dr, dc]) => { if (inBounds(r + dr, c + dc)) seen.push(rcToSquare(r + dr, c + dc)); });
    } else if (type === "k") {
      KING_DELTAS.forEach(([dr, dc]) => { if (inBounds(r + dr, c + dc)) seen.push(rcToSquare(r + dr, c + dc)); });
    } else if (type === "b") {
      ray(BISHOP_DIRS);
    } else if (type === "r") {
      ray(ROOK_DIRS);
    } else if (type === "q") {
      ray(BISHOP_DIRS.concat(ROOK_DIRS));
    } else if (type === "p") {
      // board() usa la fila 0 = octava fila (rango 8); blancas avanzan
      // hacia la fila 0 (dr = -1), negras hacia la fila 7 (dr = +1).
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      // Diagonales: siempre visibles, haya o no una pieza para capturar.
      [[dir, -1], [dir, 1]].forEach(([dr, dc]) => {
        if (inBounds(r + dr, c + dc)) seen.push(rcToSquare(r + dr, c + dc));
      });
      // Adelante: la casilla justo enfrente siempre se ve (vacía o no); la
      // de dos casillas solo se ve si el peón sigue en su fila inicial Y
      // las dos casillas de por medio están libres (si no, no llegaría ahí).
      if (inBounds(r + dir, c)) {
        seen.push(rcToSquare(r + dir, c));
        if (!board[r + dir][c] && r === startRow && inBounds(r + 2 * dir, c) && !board[r + 2 * dir][c]) {
          seen.push(rcToSquare(r + 2 * dir, c));
        }
      }
    }
    return seen;
  }

  // Todas las casillas visibles para `color` en la posición actual de
  // `chess` (una instancia de Chess de chess.js) — unión de lo que ve cada
  // pieza propia. Devuelve un Set de nombres de casilla ("e4", etc.).
  function visibleSquaresFor(chess, color) {
    const board = chess.board();
    const visible = new Set();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.color === color) {
          squaresSeenByPiece(board, r, c, piece).forEach((sq) => visible.add(sq));
        }
      }
    }
    return visible;
  }

  /* ===== Las reglas: sin jaques, gana quien se come el rey =====
   *
   * Como en la Niebla de Guerra de siempre (la de chess.com): no hay jaque ni
   * jaque mate. Con niebla no se sabe si el rey está atacado, así que no se
   * le puede pedir a nadie que lo saque del jaque — y las reglas de chess.js
   * delataban lo que la niebla tapa: una pieza clavada no se dejaba mover, o
   * el rey no podía ir a una casilla, y eso decía dónde estaba la pieza rival.
   * Ahora:
   *  - vale toda jugada que la pieza pueda hacer, aunque deje al rey atacado
   *    (las «pseudolegales» de chess.js, `legal: false`);
   *  - se enroca aunque el rey esté atacado o pase por una casilla atacada:
   *    alcanza con tener el derecho y las casillas de por medio vacías;
   *  - **gana quien se come el rey**. El ahogado no existe (siempre hay alguna
   *    jugada); quedan las tablas por material insuficiente, por las 50
   *    jugadas, y la triple repetición, que lleva cada página.
   *
   * chess.js no aplica una jugada que deja al rey en jaque: esas se aplican
   * acá a mano (fenTras) y se vuelve a cargar la posición. Las jugadas se
   * anotan sin «+» ni «#»: con niebla, el signo del jaque delataría al rey. */
  const LIMPIAR_SIGNOS = /[+#]/g;

  function sinSignos(san) { return String(san || "").replace(LIMPIAR_SIGNOS, ""); }

  // Enroques con el derecho y las casillas vacías, sin mirar ataques.
  function enroquesSinJaques(chess) {
    const turno = chess.turn();
    const derechos = chess.fen().split(" ")[2] || "-";
    const fila = turno === "w" ? "1" : "8";
    const rey = chess.get("e" + fila);
    if (!rey || rey.type !== "k" || rey.color !== turno) return [];
    const libre = (sq) => !chess.get(sq);
    const torre = (sq) => { const p = chess.get(sq); return !!(p && p.type === "r" && p.color === turno); };
    const lista = [];
    if (derechos.indexOf(turno === "w" ? "K" : "k") !== -1 && libre("f" + fila) && libre("g" + fila) && torre("h" + fila)) {
      lista.push({ color: turno, from: "e" + fila, to: "g" + fila, piece: "k", flags: "k", san: "O-O" });
    }
    if (derechos.indexOf(turno === "w" ? "Q" : "q") !== -1 && libre("d" + fila) && libre("c" + fila) && libre("b" + fila) && torre("a" + fila)) {
      lista.push({ color: turno, from: "e" + fila, to: "c" + fila, piece: "k", flags: "q", san: "O-O-O" });
    }
    return lista;
  }

  // Las jugadas de quien mueve (verbose), o las de una casilla ({ square }).
  function jugadas(chess, opciones) {
    const square = opciones && opciones.square;
    const base = chess.moves(Object.assign({ verbose: true, legal: false }, square ? { square: square } : {}));
    const enroques = enroquesSinJaques(chess).filter((e) => !square || e.from === square);
    enroques.forEach((e) => {
      if (!base.some((m) => m.from === e.from && m.to === e.to)) base.push(e);
    });
    return base.map((m) => Object.assign({}, m, { san: sinSignos(m.san) }));
  }

  // La posición que deja una jugada, armada a mano (para las que chess.js no aplica).
  function fenTras(fen, m) {
    const partes = fen.split(" ");
    const c = new Chess(fen);
    const fila = m.from[1];
    c.remove(m.from);
    if (m.flags.indexOf("e") !== -1) c.remove(m.to[0] + m.from[1]);
    c.remove(m.to);
    c.put({ type: m.promotion || m.piece, color: m.color }, m.to);
    if (m.flags.indexOf("k") !== -1) { c.remove("h" + fila); c.put({ type: "r", color: m.color }, "f" + fila); }
    if (m.flags.indexOf("q") !== -1) { c.remove("a" + fila); c.put({ type: "r", color: m.color }, "d" + fila); }
    let derechos = partes[2] === "-" ? "" : partes[2];
    const quitar = (letras) => { derechos = derechos.split("").filter((l) => letras.indexOf(l) === -1).join(""); };
    if (m.piece === "k") quitar(m.color === "w" ? "KQ" : "kq");
    [m.from, m.to].forEach((sq) => {
      if (sq === "h1") quitar("K");
      if (sq === "a1") quitar("Q");
      if (sq === "h8") quitar("k");
      if (sq === "a8") quitar("q");
    });
    const alPaso = m.piece === "p" && Math.abs(parseInt(m.to[1], 10) - parseInt(m.from[1], 10)) === 2
      ? m.from[0] + (m.color === "w" ? "3" : "6") : "-";
    const medio = m.piece === "p" || m.captured ? 0 : (parseInt(partes[4], 10) || 0) + 1;
    const total = (parseInt(partes[5], 10) || 1) + (m.color === "b" ? 1 : 0);
    return [c.fen().split(" ")[0], m.color === "w" ? "b" : "w", derechos || "-", alPaso, medio, total].join(" ");
  }

  // Aplica la jugada {from, to, promotion} sobre `chess`. Devuelve la jugada
  // hecha (con su `san`, sin signos) o null si esa pieza no puede ir ahí.
  function jugar(chess, mov) {
    const quiere = (mov.promotion || "q").toLowerCase();
    const m = jugadas(chess, { square: mov.from }).find((x) => x.to === mov.to && (!x.promotion || x.promotion === quiere));
    if (!m) return null;
    // Si chess.js la acepta (no deja al rey atacado), la aplica él, con su
    // historial; si no, se aplica a mano.
    const normal = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    if (normal) return Object.assign({}, normal, { san: sinSignos(normal.san) });
    chess.load(fenTras(chess.fen(), m));
    return m;
  }

  /* Una jugada ESCRITA («Cxe5», «e2e4», «O-O»), para el cuadro de texto del
     Modo Adaptado. Se le pasa a ChessMoveParser como si fuera el juego: él
     prueba sus candidatos con move(candidato) y se queda con el primero que
     anda. */
  function moverTexto(chess, candidato) {
    const texto = sinSignos(String(candidato || "").trim()).replace(/[!?]/g, "").replace(/0/g, "O");
    const lista = jugadas(chess);
    const coord = texto.match(/^([a-h][1-8])\s*[-x]?\s*([a-h][1-8])=?([qrbnQRBN])?$/);
    let m = null;
    if (coord) m = lista.find((x) => x.from === coord[1] && x.to === coord[2] && (!x.promotion || x.promotion === (coord[3] || "q").toLowerCase()));
    if (!m) m = lista.find((x) => x.san === texto);
    return m ? jugar(chess, { from: m.from, to: m.to, promotion: m.promotion }) : null;
  }

  // El color cuyo rey ya no está en el tablero (se lo comieron), o null.
  function reyComido(chess) {
    let w = false, b = false;
    chess.board().forEach((fila) => fila.forEach((p) => {
      if (p && p.type === "k") { if (p.color === "w") w = true; else b = true; }
    }));
    return !w ? "w" : !b ? "b" : null;
  }

  // Cómo terminó: { fin, ganador: "w"|"b"|null, texto }.
  function desenlace(chess) {
    const sinRey = reyComido(chess);
    if (sinRey) return { fin: true, ganador: sinRey === "w" ? "b" : "w", texto: "Se comieron el rey " + (sinRey === "w" ? "blanco" : "negro") };
    if (chess.insufficient_material()) return { fin: true, ganador: null, texto: "Material insuficiente: tablas" };
    if ((parseInt(chess.fen().split(" ")[4], 10) || 0) >= 100) return { fin: true, ganador: null, texto: "50 jugadas sin capturas ni peones: tablas" };
    if (!jugadas(chess).length) return { fin: true, ganador: null, texto: "Sin jugadas: tablas" };
    return { fin: false, ganador: null, texto: "" };
  }

  return {
    visibleSquaresFor: visibleSquaresFor,
    reglas: { jugadas: jugadas, jugar: jugar, moverTexto: moverTexto, reyComido: reyComido, desenlace: desenlace, fenTras: fenTras },
  };
})();
