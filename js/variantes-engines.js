/**
 * Motores de reglas de las variantes de Juegos que no son ajedrez normal
 * (variante.html, juegos.html):
 *
 *   Variantes.Abrazos  — "Ajedrez de abrazos": nadie captura. Cuando una pieza
 *                        llega a la casilla de una enemiga, las dos se abrazan y
 *                        forman una unidad que pertenece a quien la abrazó y que
 *                        mueve con las reglas de CUALQUIERA de sus piezas. Gana
 *                        quien abraza a la unidad que lleva al rey rival.
 *   Variantes.Camaleon — "Camaleón": cada pieza mueve como la pieza que empieza la
 *                        partida en la columna donde está: a y h como torre, b y g
 *                        como caballo, c y f como alfil, d como dama, e como rey.
 *                        Los peones mueven siempre como peones. Jaque y mate de
 *                        siempre, con esos movimientos.
 *   Variantes.Ciegas   — ajedrez normal (delega en chess.js): la gracia está en la
 *                        pantalla (variante.html), que no muestra las piezas.
 *   Variantes.Vampiro  — "Ajedrez Vampiro": mueve igual que el ajedrez normal
 *                        (delega en chess.js), pero al capturar, la pieza que
 *                        captura se transforma en el tipo de la pieza capturada,
 *                        conservando SU PROPIO color. El rey nunca se transforma
 *                        (si no, dejaría de haber rey y rompería jaque/mate). Si
 *                        un peón corona capturando, gana la transformación de
 *                        Vampiro sobre la corona. No detecta tablas por triple
 *                        repetición (in_threefold_repetition de chess.js
 *                        reconstruye el tablero reproduciendo el historial de
 *                        jugadas, y esa reproducción no sabe nada de estas
 *                        transformaciones — pisaría el tablero real); sí
 *                        detecta jaque mate, ahogado, material insuficiente y
 *                        la regla de 50 jugadas.
 *
 * Todos comparten la misma interfaz, que es la que usa js/variantes-board.js:
 *   load(texto) / serialize()      posición completa como texto (va en game_rooms.fen)
 *   turn()                          "w" | "b"
 *   get(casilla)                    { color, types: ["n","r"], label } o null
 *   movesFrom(casilla)              [{ from, to, promotion? }]
 *   move({from, to, promotion})     { san, gameOver, result } o null si es ilegal
 *   inCheck()                       true si el bando que mueve está en jaque (donde exista)
 *   pieceNames                      nombres en español para lector de pantalla
 *
 * Las jugadas se anotan con letras en español (R rey, D dama, T torre, A alfil,
 * C caballo; el peón sin letra).
 */
(function () {
  "use strict";

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const LETRA = { k: "R", q: "D", r: "T", b: "A", n: "C", p: "" };
  const NOMBRE = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
  const ORDEN = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };
  const START_BOARD = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

  function sq(f, r) { return f >= 0 && f < 8 && r >= 1 && r <= 8 ? FILES[f] + r : null; }
  function fileOf(s) { return FILES.indexOf(s[0]); }
  function rankOf(s) { return parseInt(s[1], 10); }
  function otro(c) { return c === "w" ? "b" : "w"; }

  // Tablero FEN (solo la parte de las piezas) → mapa casilla → {type, color}
  function parseBoard(fenBoard) {
    const out = {};
    fenBoard.split("/").forEach((row, i) => {
      const rank = 8 - i;
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) { f += parseInt(ch, 10); continue; }
        out[FILES[f] + rank] = { type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? "w" : "b" };
        f++;
      }
    });
    return out;
  }
  function boardToFen(board) {
    const rows = [];
    for (let rank = 8; rank >= 1; rank--) {
      let row = "", empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = board[FILES[f] + rank];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p.color === "w" ? p.type.toUpperCase() : p.type;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return rows.join("/");
  }

  // Casillas alcanzables desde `from` moviendo como `tipo` (sin peones), con
  // `ocupada(sq)` → null | "propia" | "enemiga". Las de deslizamiento se frenan
  // en la primera pieza (y la incluyen si es enemiga).
  function destinos(from, tipo, ocupada) {
    const f = fileOf(from), r = rankOf(from), out = [];
    const desliza = (dirs) => dirs.forEach(([df, dr]) => {
      let x = f + df, y = r + dr;
      while (true) {
        const s = sq(x, y); if (!s) break;
        const o = ocupada(s);
        if (o === "propia") break;
        out.push(s);
        if (o === "enemiga") break;
        x += df; y += dr;
      }
    });
    const saltos = (deltas) => deltas.forEach(([df, dr]) => { const s = sq(f + df, r + dr); if (s && ocupada(s) !== "propia") out.push(s); });
    const ORT = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    if (tipo === "r") desliza(ORT);
    else if (tipo === "b") desliza(DIAG);
    else if (tipo === "q") desliza(ORT.concat(DIAG));
    else if (tipo === "n") saltos([[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]);
    else if (tipo === "k") saltos(ORT.concat(DIAG));
    return out;
  }
  // Peón: avances (solo a vacías) y "capturas" diagonales (solo a enemigas).
  function destinosPeon(from, color, ocupada) {
    const f = fileOf(from), r = rankOf(from), dir = color === "w" ? 1 : -1, inicio = color === "w" ? 2 : 7, out = [];
    const uno = sq(f, r + dir);
    if (uno && !ocupada(uno)) {
      out.push(uno);
      const dos = sq(f, r + 2 * dir);
      if (r === inicio && dos && !ocupada(dos)) out.push(dos);
    }
    [[1, dir], [-1, dir]].forEach(([df, dr]) => { const s = sq(f + df, r + dr); if (s && ocupada(s) === "enemiga") out.push(s); });
    return out;
  }
  function ultimaFila(color, s) { return rankOf(s) === (color === "w" ? 8 : 1); }

  /* ======================= CAMALEÓN ======================= */
  const COLUMNA_TIPO = { a: "r", h: "r", b: "n", g: "n", c: "b", f: "b", d: "q", e: "k" };

  class Camaleon {
    constructor() { this.load(Camaleon.START); }
    static get START() { return START_BOARD + " w - - 0 1"; }
    get pieceNames() { return NOMBRE; }
    load(texto) {
      const partes = (texto || Camaleon.START).trim().split(/\s+/);
      this.board = parseBoard(partes[0]);
      this.turno = partes[1] === "b" ? "b" : "w";
      this.numero = parseInt(partes[5], 10) || 1;
      this.ultimo = null;
    }
    serialize() { return boardToFen(this.board) + " " + this.turno + " - - 0 " + this.numero; }
    turn() { return this.turno; }
    get(s) {
      const p = this.board[s]; if (!p) return null;
      const como = p.type === "p" ? "p" : COLUMNA_TIPO[s[0]];
      return { color: p.color, types: [p.type], mueveComo: como,
        label: (p.color === "w" ? "Blanco " : "Negro ") + NOMBRE[p.type] + (como !== p.type ? ", mueve como " + NOMBRE[como] : "") };
    }
    _ocupada(board, color) {
      return (s) => { const p = board[s]; return p ? (p.color === color ? "propia" : "enemiga") : null; };
    }
    _pseudo(board, from) {
      const p = board[from];
      const oc = this._ocupada(board, p.color);
      if (p.type === "p") return destinosPeon(from, p.color, oc);
      return destinos(from, COLUMNA_TIPO[from[0]], oc);
    }
    _atacada(board, s, porColor) {
      for (const from in board) {
        const p = board[from]; if (p.color !== porColor) continue;
        if (p.type === "p") {
          const dir = p.color === "w" ? 1 : -1;
          if (rankOf(s) === rankOf(from) + dir && Math.abs(fileOf(s) - fileOf(from)) === 1) return true;
          continue;
        }
        if (destinos(from, COLUMNA_TIPO[from[0]], this._ocupada(board, p.color)).indexOf(s) !== -1) return true;
      }
      return false;
    }
    _rey(board, color) { for (const s in board) if (board[s].type === "k" && board[s].color === color) return s; return null; }
    _aplicar(board, from, to) {
      const nb = Object.assign({}, board);
      const p = Object.assign({}, nb[from]);
      delete nb[from];
      if (p.type === "p" && ultimaFila(p.color, to)) p.type = "q";
      nb[to] = p;
      return nb;
    }
    _enJaque(board, color) { const k = this._rey(board, color); return !!k && this._atacada(board, k, otro(color)); }
    inCheck() { return this._enJaque(this.board, this.turno); }
    movesFrom(from) {
      const p = this.board[from];
      if (!p || p.color !== this.turno) return [];
      return this._pseudo(this.board, from)
        .filter((to) => !this._enJaque(this._aplicar(this.board, from, to), p.color))
        .map((to) => ({ from, to }));
    }
    allMoves() { const out = []; for (const s in this.board) if (this.board[s].color === this.turno) out.push.apply(out, this.movesFrom(s)); return out; }
    move(m) {
      const legal = this.movesFrom(m.from).find((x) => x.to === m.to);
      if (!legal) return null;
      const p = this.board[m.from], captura = !!this.board[m.to];
      // desambiguación: otra pieza del mismo tipo que también llega
      const otras = Object.keys(this.board).filter((s) => s !== m.from && this.board[s].color === p.color && this.board[s].type === p.type && this.movesFrom(s).some((x) => x.to === m.to));
      let san;
      if (p.type === "p") san = (captura ? m.from[0] + "x" : "") + m.to + (ultimaFila(p.color, m.to) ? "=D" : "");
      else {
        let des = "";
        if (otras.length) des = otras.every((s) => s[0] !== m.from[0]) ? m.from[0] : otras.every((s) => s[1] !== m.from[1]) ? m.from[1] : m.from;
        san = LETRA[p.type] + des + (captura ? "x" : "") + m.to;
      }
      this.board = this._aplicar(this.board, m.from, m.to);
      if (this.turno === "b") this.numero++;
      this.turno = otro(this.turno);
      const jaque = this.inCheck(), sinJugadas = this.allMoves().length === 0;
      let gameOver = false, result = null;
      if (sinJugadas) { gameOver = true; result = jaque ? (this.turno === "w" ? "black" : "white") : "draw"; san += jaque ? "#" : ""; }
      else if (jaque) san += "+";
      this.ultimo = { from: m.from, to: m.to };
      return { san, gameOver, result, captura };
    }
  }

  /* ======================= ABRAZOS ======================= */
  class Abrazos {
    constructor() { this.load(Abrazos.START); }
    static get START() {
      const b = parseBoard(START_BOARD), u = {};
      for (const s in b) u[s] = { color: b[s].color, types: [b[s].type] };
      return JSON.stringify({ v: 1, t: "w", n: 1, b: Abrazos._compact(u) });
    }
    // "veces" cuenta cuántas piezas originales terminaron fusionadas acá (empieza
    // en 1). Se guarda aparte de "types" porque dos piezas del MISMO tipo se
    // abrazan sin agregar ningún tipo nuevo (p. ej. peón+peón sigue siendo solo
    // "p") — sin este contador, ese abrazo se vería IDÉNTICO a una captura
    // común, tanto en el tablero como para quien lee el estado guardado.
    static _compact(u) {
      const o = {};
      for (const s in u) o[s] = u[s].color + ":" + u[s].types.join("") + ((u[s].veces || 1) > 1 ? ":" + u[s].veces : "");
      return o;
    }
    get pieceNames() { return NOMBRE; }
    load(texto) {
      let d;
      try { d = JSON.parse(texto); } catch (e) { d = null; }
      if (!d || !d.b) d = JSON.parse(Abrazos.START);
      this.board = {};
      for (const s in d.b) {
        const [c, t, v] = d.b[s].split(":");
        this.board[s] = { color: c, types: t.split(""), veces: v ? parseInt(v, 10) : 1 };
      }
      this.turno = d.t === "b" ? "b" : "w";
      this.numero = d.n || 1;
      this.terminado = d.fin || null; // "white" | "black" cuando ya hubo abrazo al rey
      this.ultimo = null;
    }
    serialize() { return JSON.stringify({ v: 1, t: this.turno, n: this.numero, b: Abrazos._compact(this.board), fin: this.terminado || undefined }); }
    turn() { return this.turno; }
    static tiposOrdenados(types) { return types.slice().sort((a, b) => ORDEN[a] - ORDEN[b]); }
    get(s) {
      const u = this.board[s]; if (!u) return null;
      const t = Abrazos.tiposOrdenados(u.types);
      const nombres = t.map((x) => NOMBRE[x]);
      const veces = u.veces || 1;
      let base = t.length === 1 ? nombres[0] : "unión de " + nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
      // Cuando el abrazo fue entre piezas del mismo tipo, se avisa igual —
      // si no, se ve y se lee exactamente como una captura común.
      if (t.length === 1 && veces > 1) base += " (unión de " + veces + " piezas)";
      const label = (u.color === "w" ? "Blancas: " : "Negras: ") + base;
      return { color: u.color, types: t, veces, label };
    }
    _ocupada(color) { return (s) => { const u = this.board[s]; return u ? (u.color === color ? "propia" : "enemiga") : null; }; }
    inCheck() { return false; }
    movesFrom(from) {
      const u = this.board[from];
      if (!u || u.color !== this.turno || this.terminado) return [];
      const oc = this._ocupada(u.color), set = new Set();
      u.types.forEach((t) => { (t === "p" ? destinosPeon(from, u.color, oc) : destinos(from, t, oc)).forEach((s) => set.add(s)); });
      return Array.from(set).map((to) => ({ from, to }));
    }
    allMoves() { const out = []; for (const s in this.board) if (this.board[s].color === this.turno) out.push.apply(out, this.movesFrom(s)); return out; }
    move(m) {
      if (!this.movesFrom(m.from).some((x) => x.to === m.to)) return null;
      const u = this.board[m.from], destino = this.board[m.to];
      const letras = Abrazos.tiposOrdenados(u.types).map((t) => LETRA[t] || "P").join("");
      let types = u.types.slice(), veces = u.veces || 1, abrazo = false, ganaRey = false;
      if (destino) {
        abrazo = true;
        if (destino.types.indexOf("k") !== -1) ganaRey = true;
        destino.types.forEach((t) => { if (types.indexOf(t) === -1) types.push(t); });
        veces += destino.veces || 1;
      }
      if (types.indexOf("p") !== -1 && ultimaFila(u.color, m.to)) { types = types.filter((t) => t !== "p"); if (types.indexOf("q") === -1) types.push("q"); }
      delete this.board[m.from];
      this.board[m.to] = { color: u.color, types, veces };
      const san = letras + m.from + (abrazo ? "♥" : "-") + m.to + (ganaRey ? "#" : "");
      let gameOver = false, result = null;
      if (ganaRey) { gameOver = true; result = u.color === "w" ? "white" : "black"; this.terminado = result; }
      if (this.turno === "b") this.numero++;
      this.turno = otro(this.turno);
      if (!gameOver && this.allMoves().length === 0) { gameOver = true; result = "draw"; }
      this.ultimo = { from: m.from, to: m.to };
      return { san, gameOver, result, abrazo };
    }
  }

  /* ======================= CIEGAS (chess.js) ======================= */
  const EN_A_ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
  const ES_A_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
  class Ciegas {
    constructor() { this.game = new Chess(); }
    static get START() { return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"; }
    get pieceNames() { return NOMBRE; }
    load(fen) { this.game.load(fen || Ciegas.START); }
    serialize() { return this.game.fen(); }
    turn() { return this.game.turn(); }
    get(s) { const p = this.game.get(s); return p ? { color: p.color, types: [p.type], label: (p.color === "w" ? "Blanco " : "Negro ") + NOMBRE[p.type] } : null; }
    inCheck() { return this.game.in_check(); }
    movesFrom(from) { return this.game.moves({ square: from, verbose: true }).map((m) => ({ from: m.from, to: m.to, promotion: m.promotion })); }
    static sanEs(san) { return san.replace(/^[KQRBN]/, (c) => EN_A_ES[c]).replace(/=([QRBN])/, (_, c) => "=" + EN_A_ES[c]); }
    _terminar(mv) {
      let gameOver = false, result = null;
      if (this.game.in_checkmate()) { gameOver = true; result = this.game.turn() === "w" ? "black" : "white"; }
      else if (this.game.in_draw()) { gameOver = true; result = "draw"; }
      return { san: Ciegas.sanEs(mv.san), sanEn: mv.san, gameOver, result, captura: !!mv.captured };
    }
    move(m) {
      const mv = this.game.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
      return mv ? this._terminar(mv) : null;
    }
    // Jugada escrita: notación inglesa (Nf3), española (Cf3), o casillas (g1f3 / g1-f3).
    moveText(texto) {
      const t = (texto || "").trim().replace(/\s+/g, "").replace(/0-0-0/i, "O-O-O").replace(/0-0/i, "O-O");
      if (!t) return null;
      const coord = t.match(/^([a-h][1-8])-?([a-h][1-8])(?:=?([qrbnQRBNdtacDTAC]))?$/);
      if (coord) {
        let prom = coord[3] ? coord[3].toUpperCase() : null;
        if (prom && ES_A_EN[prom]) prom = ES_A_EN[prom];
        const mv = this.game.move({ from: coord[1], to: coord[2], promotion: prom ? prom.toLowerCase() : "q" });
        return mv ? this._terminar(mv) : null;
      }
      const intentos = [t];
      const es = t.replace(/^([RDTAC])(?=[a-h1-8x])/, (_, c) => ES_A_EN[c]).replace(/=([DTAC])$/, (_, c) => "=" + ES_A_EN[c]).replace(/=([DTAC])([+#])$/, (_, c, x) => "=" + ES_A_EN[c] + x);
      if (es !== t) intentos.push(es);
      for (const s of intentos) {
        const mv = this.game.move(s, { sloppy: true });
        if (mv) return this._terminar(mv);
      }
      return null;
    }
  }

  /* ======================= VAMPIRO (chess.js) ======================= */
  class Vampiro {
    constructor() { this.game = new Chess(); }
    static get START() { return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"; }
    get pieceNames() { return NOMBRE; }
    load(fen) { this.game.load(fen || Vampiro.START); }
    serialize() { return this.game.fen(); }
    turn() { return this.game.turn(); }
    get(s) { const p = this.game.get(s); return p ? { color: p.color, types: [p.type], label: (p.color === "w" ? "Blanco " : "Negro ") + NOMBRE[p.type] } : null; }
    inCheck() { return this.game.in_check(); }
    // Las 4 variantes de corona que chess.js genera para una captura no aplican
    // acá (la transformación de Vampiro las reemplaza a todas por igual): se
    // muestran como una sola jugada, sin elegir corona.
    movesFrom(from) {
      const vistos = new Set(), out = [];
      this.game.moves({ square: from, verbose: true }).forEach((m) => {
        const forzada = !!m.captured;
        const clave = m.to + (forzada ? "" : m.promotion || "");
        if (vistos.has(clave)) return;
        vistos.add(clave);
        out.push({ from: m.from, to: m.to, promotion: forzada ? undefined : m.promotion });
      });
      return out;
    }
    move(m) {
      const mv = this.game.move({ from: m.from, to: m.to, promotion: m.promotion || "q" });
      if (!mv) return null;
      let transformo = false, tipoFinal = mv.piece;
      if (mv.captured && mv.piece !== "k" && mv.captured !== mv.piece) {
        if (this.game.remove(mv.to) && this.game.put({ type: mv.captured, color: mv.color }, mv.to)) {
          transformo = true;
          tipoFinal = mv.captured;
        }
      }
      // El san de chess.js puede traer una corona ("=Q") y un jaque ("+"/"#")
      // que ya no valen tras la transformación: se recalculan desde cero.
      let san = mv.san.replace(/=[QRBN]/, "").replace(/[+#]$/, "");
      if (transformo && LETRA[tipoFinal]) san += "=" + LETRA[tipoFinal];
      const jaqueMate = this.game.in_checkmate();
      const jaque = !jaqueMate && this.game.in_check();
      // No se usa in_draw()/in_threefold_repetition(): esas reconstruyen la
      // posición reproduciendo this.history() desde el arranque, y esa
      // reproducción no sabe nada de la transformación que se acaba de hacer
      // con remove()/put() — "revive" la pieza original y pisa el tablero
      // real (bug real, encontrado y confirmado con una prueba antes de subir
      // esto). Por eso se arma la misma condición a mano con los únicos
      // sub-chequeos que sí leen el tablero actual sin reproducir nada.
      const semiJugadas = parseInt(this.game.fen().split(" ")[4], 10) || 0;
      const tablas = !jaqueMate && (this.game.in_stalemate() || this.game.insufficient_material() || semiJugadas >= 100);
      if (jaqueMate) san += "#";
      else if (jaque) san += "+";
      let gameOver = false, result = null;
      if (jaqueMate) { gameOver = true; result = mv.color === "w" ? "white" : "black"; }
      else if (tablas) { gameOver = true; result = "draw"; }
      return { san, gameOver, result, captura: !!mv.captured, transformo, tipoFinal };
    }
  }

  window.Variantes = { Abrazos, Camaleon, Ciegas, Vampiro, LETRA, NOMBRE, COLUMNA_TIPO,
    crear(id) { return id === "abrazos" ? new Abrazos() : id === "camaleon" ? new Camaleon() : id === "vampiro" ? new Vampiro() : new Ciegas(); },
    inicio(id) { return id === "abrazos" ? Abrazos.START : id === "camaleon" ? Camaleon.START : id === "vampiro" ? Vampiro.START : Ciegas.START; } };
})();
