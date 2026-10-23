/* ===== Pareo Integral — leer la partida de una mesa (PGN) =====
 *
 * Quien organiza pega la partida de una mesa (de un tablero electrónico, de
 * Lichess o escrita a mano) y se publica con el torneo; torneos-pareo.html la
 * muestra en un tablero que se recorre jugada a jugada (js/visor-linea.js).
 *
 * Lee el PGN jugada por jugada con chess.js, para decir DÓNDE se rompe si
 * algo no cuadra (en vez de un «no se pudo» sin más), y acepta las letras
 * de las piezas en español (R rey, D dama, T torre, A alfil, C caballo), que
 * es como se anota en las planillas de acá. Ninguna posición se inventa: lo
 * que no es una jugada legal desde la posición anterior no se acepta.
 *
 *   PareoPartida.leer(texto, Chess) → { ok, jugadas: [san…], encabezados,
 *                                       resultado, fallaEn (número de jugada) }
 *
 * Lógica pura (recibe la clase Chess): la prueba herramientas/verificar-pareo-publicar.js.
 */
(function (raiz) {
  "use strict";

  const ES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
  const RESULTADOS = ["1-0", "0-1", "1/2-1/2", "½-½", "*"];

  function limpiar(texto) {
    let s = String(texto || "").replace(/\r/g, "");
    const encabezados = {};
    s = s.replace(/^\s*\[(\w+)\s+"([^"]*)"\]\s*$/gm, (_, k, v) => { encabezados[k] = v; return ""; });
    // Comentarios, variantes (anidadas) y anotaciones: no son jugadas.
    s = s.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
    let antes;
    do { antes = s; s = s.replace(/\([^()]*\)/g, " "); } while (s !== antes);
    s = s.replace(/\$\d+/g, " ");
    return { cuerpo: s, encabezados };
  }

  // «R» es el rey en español y la torre en inglés: si la partida trae letras
  // que solo existen en español (D, T, A, C), se prueba primero en español.
  function intentar(g, tok, espanol) {
    const limpio = tok.replace(/[!?]+$/g, "").replace(/[+#]+$/g, "").replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O");
    if (!limpio) return null;
    const traducido = /^[RDTAC]/.test(limpio) ? ES[limpio[0]] + limpio.slice(1) : null;
    let m = espanol && traducido ? g.move(traducido, { sloppy: true }) : null;
    if (m) return m;
    m = g.move(limpio, { sloppy: true });
    if (m) return m;
    if (traducido && !espanol) {
      m = g.move(traducido, { sloppy: true });
      if (m) return m;
    }
    // Coronación en español: e8=D.
    const cor = limpio.replace(/=([DTAC])$/, (_, p) => "=" + ES[p]);
    if (cor !== limpio) return g.move(cor, { sloppy: true });
    return null;
  }

  function leer(texto, Chess) {
    const { cuerpo, encabezados } = limpiar(texto);
    const g = new Chess();
    const jugadas = [];
    let resultado = encabezados.Result || "";
    const tokens = cuerpo.split(/\s+/).map((x) => x.replace(/^\d+\.(\.\.)?/, "")).filter(Boolean);
    const espanol = tokens.some((x) => /^[DTAC][a-h1-8x]/.test(x));
    for (const tok of tokens) {
      if (/^\d+\.+$/.test(tok)) continue;
      if (RESULTADOS.includes(tok)) { resultado = tok === "½-½" ? "1/2-1/2" : tok; continue; }
      const m = intentar(g, tok, espanol);
      if (!m) return { ok: false, jugadas, encabezados, resultado, fallaEn: Math.floor(jugadas.length / 2) + 1 };
      jugadas.push(m.san);
    }
    return { ok: jugadas.length > 0, jugadas, encabezados, resultado, fallaEn: jugadas.length ? null : 1 };
  }

  const api = { leer };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoPartida = api;
})(typeof self !== "undefined" ? self : this);
