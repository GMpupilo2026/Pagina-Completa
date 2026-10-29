/* ===== Pareo para DGT — un tablero electrónico DGT de mentira, para probar =====
 *
 * Para ensayar el día del torneo sin tableros físicos: la página se conecta a
 * un puerto COM virtual (un par de com0com: LiveChess abre una punta y la
 * página la otra, con Web Serial) y le contesta a DGT LiveChess como lo haría
 * un tablero DGT por USB. Las jugadas son las de una partida de maestros, y
 * cada una llega como en un tablero de verdad: se levanta la pieza (la
 * casilla queda vacía) y se apoya en la otra (la casilla tiene la pieza).
 *
 * El protocolo serial de DGT (comprobado contra el código de Picochess, que
 * habla con tableros reales: dgt/util.py y dgt/board.py):
 *   - LiveChess manda un byte por pedido: 0x40 reset, 0x42 el tablero entero,
 *     0x43 / 0x44 / 0x4b avisar de cada cambio, 0x45 el número de serie, 0x55
 *     el número largo, 0x47 la marca, 0x4d la versión, 0x46 la dirección de
 *     bus… El 0x2b (mensaje para el reloj) trae detrás un byte con cuántos
 *     siguen, y esos se saltan.
 *   - El tablero contesta con 3 bytes de cabecera —el código del mensaje con
 *     el bit 0x80 y el largo TOTAL en dos bytes de 7 bits— y los datos.
 *   - El tablero entero (0x86) son 64 bytes de a8 a h1, fila por fila; un
 *     cambio (0x8e) son 2: la casilla, con el mismo orden, y la pieza.
 *   - Piezas: 0 vacía, 1 P, 2 R, 3 N, 4 B, 5 K, 6 Q, 7 p, 8 r, 9 n, 10 b,
 *     11 k, 12 q.
 * No contesta el reloj (0x41): un tablero sin reloj no lo hace. Eso, y que
 * LiveChess lo acepte, se comprueba con un LiveChess de verdad.
 *
 *   DgtTablero.crear({ serie: "90001" }) → { recibir(bytes) → [respuestas], jugar(move) → [mensajes],
 *                                             ponerFen(fen) → [mensajes], fen(), modo }
 *   DgtTablero.volcado(fen) / campo(casilla) / cambiosDeJugada(move) / cambiosEntre(fenA, fenB)
 *
 * Lógica pura (recibe la clase Chess), para el navegador y Node.
 */
(function (raiz) {
  "use strict";

  const PIEZA = { P: 1, R: 2, N: 3, B: 4, K: 5, Q: 6, p: 7, r: 8, n: 9, b: 10, k: 11, q: 12 };
  const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  // «e2» → la casilla en el orden de DGT (0 = a8, 63 = h1).
  function campo(casilla) {
    const col = casilla.charCodeAt(0) - 97;
    const fila = Number(casilla[1]);
    return (8 - fila) * 8 + col;
  }

  function mensaje(id, datos) {
    const largo = 3 + datos.length;
    return [0x80 | id, (largo >> 7) & 0x7f, largo & 0x7f].concat(datos);
  }

  // Las 64 casillas de la parte de piezas de un FEN, de a8 a h1.
  function casillas(fen) {
    const out = [];
    for (const ch of String(fen).split(" ")[0]) {
      if (ch === "/") continue;
      if (/\d/.test(ch)) { for (let i = 0; i < Number(ch); i++) out.push(0); }
      else out.push(PIEZA[ch] || 0);
    }
    return out;
  }

  function volcado(fen) {
    return mensaje(0x06, casillas(fen));
  }

  function cambio(casilla, pieza) {
    return mensaje(0x0e, [campo(casilla), pieza]);
  }

  function codigo(color, tipo) {
    return PIEZA[color === "w" ? tipo.toUpperCase() : tipo];
  }

  // Lo que pasa en el tablero con una jugada (un move de chess.js), en el orden
  // en que lo hace una mano: primero se levanta, después se apoya.
  function cambiosDeJugada(move) {
    const out = [];
    const f = move.flags || "";
    const propia = codigo(move.color, move.promotion || move.piece);
    if (f.includes("e")) {
      out.push(cambio(move.from, 0), cambio(move.to, propia), cambio(move.to[0] + move.from[1], 0));
      return out;
    }
    if (f.includes("c")) out.push(cambio(move.to, 0));
    out.push(cambio(move.from, 0), cambio(move.to, propia));
    if (f.includes("k") || f.includes("q")) {
      const fila = move.color === "w" ? "1" : "8";
      const [desde, hasta] = f.includes("k") ? ["h" + fila, "f" + fila] : ["a" + fila, "d" + fila];
      out.push(cambio(desde, 0), cambio(hasta, codigo(move.color, "r")));
    }
    return out;
  }

  // Pasar de una posición a otra casilla por casilla (para volver a armar el
  // tablero al principio): primero se levanta lo que sobra, después se apoya.
  function cambiosEntre(fenAntes, fenDespues) {
    const a = casillas(fenAntes), b = casillas(fenDespues);
    const nombre = (i) => String.fromCharCode(97 + (i % 8)) + (8 - Math.floor(i / 8));
    const out = [];
    for (let i = 0; i < 64; i++) if (a[i] !== b[i] && a[i] !== 0) out.push(cambio(nombre(i), 0));
    for (let i = 0; i < 64; i++) if (a[i] !== b[i] && b[i] !== 0) out.push(cambio(nombre(i), b[i]));
    return out;
  }

  function ascii(texto) {
    return Array.from(String(texto), (c) => c.charCodeAt(0) & 0x7f);
  }

  function crear(opciones) {
    const o = opciones || {};
    const serie = String(o.serie || "90001").replace(/\D/g, "").padStart(5, "0").slice(-5);
    let fenActual = o.fen || INICIAL;
    let saltar = 0;           // bytes de un mensaje para el reloj que todavía hay que saltar
    let esperaLargo = false;  // después de 0x2b viene cuántos bytes siguen
    const t = { modo: "quieto", pedidos: [] };

    function responder(c) {
      t.pedidos.push(c);
      switch (c) {
        case 0x40: t.modo = "quieto"; return [];
        case 0x42: return [volcado(fenActual)];
        case 0x43: case 0x44: case 0x4b: t.modo = "avisa"; return [];
        case 0x45: return [mensaje(0x11, ascii(serie))];
        case 0x55: return [mensaje(0x22, ascii(("00000" + serie).slice(-10)))];
        case 0x46: return [mensaje(0x10, [Number(serie) >> 7 & 0x7f, Number(serie) & 0x7f])];
        case 0x47: return [mensaje(0x12, ascii("Digital Game Technology\r\nTablero virtual de Ajedrez Integral, serie " + serie + "\r\n"))];
        case 0x4d: return [mensaje(0x13, [1, 0])];
        default: return [];
      }
    }

    t.serie = serie;
    t.fen = () => fenActual;

    // Lo que llega de LiveChess, byte a byte → lo que el tablero contesta.
    t.recibir = function (bytes) {
      const out = [];
      for (const b of bytes) {
        if (esperaLargo) { esperaLargo = false; saltar = b; continue; }
        if (saltar > 0) { saltar -= 1; continue; }
        if (b === 0x2b) { esperaLargo = true; continue; }
        out.push(...responder(b));
      }
      return out;
    };

    // Una jugada hecha en el tablero: los cambios, si LiveChess pidió que se
    // le avise; si no, nada (igual que un tablero de verdad).
    t.jugar = function (move, fenDespues) {
      fenActual = fenDespues;
      return t.modo === "avisa" ? cambiosDeJugada(move) : [];
    };

    t.ponerFen = function (fen) {
      const antes = fenActual;
      fenActual = fen;
      return t.modo === "avisa" ? cambiosEntre(antes, fen) : [];
    };
    return t;
  }

  const api = { INICIAL, campo, mensaje, volcado, cambiosDeJugada, cambiosEntre, crear };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.DgtTablero = api;
})(typeof self !== "undefined" ? self : this);
