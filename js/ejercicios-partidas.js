/* Ejercicios sacados de partidas reales: dónde hay uno, si de verdad tiene
 * UNA sola jugada buena y qué gana. Sin nada de la pantalla ni del motor: el
 * motor se recibe como una función, así que lo mismo corre en el navegador
 * y en node con el Stockfish de la máquina. Lo usa el generador de «Ejercicios
 * de la ronda» de la página del Centroamericano
 * (herramientas/centroamericano-ejercicios.js, que corre solo en GitHub);
 * ver «Los ejercicios de la ronda» en docs/decisiones/juegos-y-torneos.md.
 *
 * Ninguna posición se inventa: todas salen de una partida jugada, y ninguna
 * entra si Stockfish no confirma que la jugada que se pide es la única que
 * gana (la regla de todo el sitio, también la del diagnóstico).
 *
 *   EjerciciosPartidas.candidatas(juegos, op)
 *       De las partidas de js/lichess-transmision.js (leerPgn), las posiciones
 *       que valen la pena mirar: el rival acaba de equivocarse (la evaluación
 *       de Lichess saltó a favor de quien mueve). Las ordena por el salto.
 *       Cada juego lleva además `categoria` (la pone quien llama).
 *   EjerciciosPartidas.verificar(c, analizar, op) → Promise<ejercicio|null>
 *       analizar(fen, multipv) → Promise<[{ cp, mate, pv: [uci…] }]>, desde
 *       quien mueve, la mejor primero (lo que contesta Stockfish con MultiPV).
 *       Devuelve el ejercicio con su línea (`solucion`: jugadas UCI, la de
 *       quien resuelve y la respuesta del rival, alternadas), cuántas pide
 *       (`pide`), la continuación que se muestra después y el tema.
 *   EjerciciosPartidas.unica(lineas) → "mate" | "gana" | null
 *   EjerciciosPartidas.tema(fen, uci[]) → { tipo: "mate", n } | { tipo, … }
 *   EjerciciosPartidas.elegir(lista, n) → los n mejores, repartidos entre categorías
 *   EjerciciosPartidas.apellido(nombre) → solo el apellido («logro»: quien
 *       encontró la jugada en la partida; de quien se equivocó, nada)
 *   EjerciciosPartidas.normalizarUci / jugarUci: ayudas con chess.js
 */
(function (raiz) {
  "use strict";

  // Cuánto tiene que valer la mejor jugada y cuánto puede valer la segunda,
  // en centésimas de peón, desde quien mueve. Con +2,5 contra +1 o menos, la
  // segunda ya no gana: «¿Cómo ganas?» tiene una respuesta. Probado con
  // rondas reales de Lichess (ver la documentación).
  const MEJOR_MIN = 250;
  const SEGUNDA_MAX = 100;
  const SALTO_MIN = 1.5;      // en peones: cuánto empeoró la última jugada del rival
  const PLY_MIN = 10;         // nada de la apertura de memoria
  const PIDE_MAX = 3;         // jugadas que se piden, como mucho

  const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  // La evaluación de Lichess está en peones desde las blancas, con el mate
  // como ±(100 − jugadas) (js/lichess-transmision.js). Desde quien mueve:
  const desde = (ev, color) => (ev == null ? null : color === "w" ? ev : -ev);

  function candidatas(juegos, op) {
    op = op || {};
    const plyMin = op.plyMin == null ? PLY_MIN : op.plyMin;
    const out = [];
    (juegos || []).forEach((g, gi) => {
      const js = g.jugadas || [];
      // La posición ANTES de la jugada i: la deja la jugada i−1 (la del rival).
      for (let i = Math.max(2, plyMin); i < js.length; i++) {
        const antes = js[i - 1], antes2 = js[i - 2];
        if (!antes || !antes2 || antes.eval == null || antes2.eval == null) continue;
        const color = js[i].color;                         // quien mueve ahora
        const ahora = desde(antes.eval, color);            // cómo queda tras el error
        const previo = desde(antes2.eval, color);          // cómo estaba antes del error
        if (ahora < 2 || previo > 1) continue;
        const salto = Math.min(ahora, 10) - Math.max(previo, -10);
        if (salto < SALTO_MIN) continue;
        const jugo = js[i];
        const quien = color === "w" ? (g.blancas && g.blancas.nombre) : (g.negras && g.negras.nombre);
        out.push({ juego: (g.id || "") + ":" + gi, categoria: g.categoria || "", i, fen: antes.fen, salto, ultima: { de: antes.de, a: antes.a, san: antes.san },
          jugada: jugo.de + jugo.a, quien: quien || "" });
      }
    });
    // Una por partida (la del salto mayor): dos de la misma partida se parecen.
    const porJuego = new Map();
    out.forEach((c) => { const ya = porJuego.get(c.juego); if (!ya || c.salto > ya.salto) porJuego.set(c.juego, c); });
    const resto = out.filter((c) => porJuego.get(c.juego) !== c).sort((a, b) => b.salto - a.salto);
    const primeras = [...porJuego.values()].sort((a, b) => b.salto - a.salto);
    // Las segundas de cada partida quedan de reserva, detrás.
    return primeras.concat(resto);
  }

  // ¿La mejor gana y la segunda no? "mate", "gana" o null.
  function unica(lineas) {
    const a = lineas && lineas[0], b = lineas && lineas[1];
    if (!a || !b) return null;                     // una sola jugada legal: no es un ejercicio
    const valor = (l) => (l.mate != null ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : l.cp);
    if (a.mate != null && a.mate > 0) return b.mate != null && b.mate > 0 ? null : valor(b) <= 300 ? "mate" : null;
    if (valor(a) < MEJOR_MIN) return null;
    return valor(b) <= SEGUNDA_MAX ? "gana" : null;
  }

  function jugarUci(g, uci) {
    return g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  }
  function normalizarUci(fen, uci, Chess) {
    const g = new Chess(fen);
    const m = jugarUci(g, uci);
    return m ? m.from + m.to + (m.promotion || "") : null;
  }

  const material = (g, color) => {
    let s = 0;
    g.board().forEach((fila) => fila.forEach((c) => { if (c) s += (c.color === color ? 1 : -1) * VALOR[c.type]; }));
    return s;
  };

  // Qué gana la línea: el mate, o el material que queda de diferencia cuando
  // al rival le toca mover después de la última jugada que se cuenta.
  function tema(fen, pv, Chess, mate) {
    if (mate) return { tipo: "mate", n: mate };
    const g = new Chess(fen);
    const yo = g.turn();
    const inicio = material(g, yo);
    let mejor = 0, corona = false;
    for (let k = 0; k < Math.min(pv.length, 10); k++) {
      const m = jugarUci(g, pv[k]);
      if (!m) break;
      if (m.promotion && m.color === yo) corona = true;
      // Se cuenta con el rival ya contestado (k impar: después de su jugada).
      if (k % 2 === 1 || k === pv.length - 1) mejor = Math.max(mejor, material(g, yo) - inicio);
    }
    if (mejor >= 8) return { tipo: "dama" };
    if (corona && mejor >= 4) return { tipo: "corona" };
    if (mejor >= 4.5) return { tipo: "torre" };
    if (mejor >= 2.5) return { tipo: "pieza" };
    if (mejor >= 1.5) return { tipo: "calidad" };
    return { tipo: "ataque" };
  }

  // ¿La jugada recaptura lo que el rival acaba de tomar en la misma casilla?
  // Eso no es un ejercicio: cualquiera la ve.
  function esRecaptura(c, uci, Chess) {
    if (!c.ultima || !/x/.test(c.ultima.san || "")) return false;
    const g = new Chess(c.fen);
    const m = jugarUci(g, uci);
    return !!(m && m.captured && m.to === c.ultima.a);
  }

  // Solo el apellido de quien encontró la jugada: la regla de js/lichess-transmision.js.
  const L = raiz.LichessTransmision || (typeof require === "function" ? require("./lichess-transmision.js") : null);
  const apellido = (n) => (L && L.apellido ? L.apellido(n) : "");

  async function verificar(c, analizar, op) {
    op = op || {};
    const Chess = op.Chess || raiz.Chess;
    const pideMax = op.pideMax || PIDE_MAX;
    const g0 = new Chess(c.fen);
    if (g0.game_over() || g0.moves().length < 2) return null;
    const lineas = await analizar(c.fen, 2);
    const clase = unica(lineas);
    if (!clase) return null;
    const mejor = lineas[0];
    if (!mejor.pv || !mejor.pv.length) return null;
    if (clase !== "mate" && esRecaptura(c, mejor.pv[0], Chess)) return null;
    if (clase === "mate" && mejor.mate === 1 && op.sinMateEnUno) return null;

    // La línea: la primera jugada es única; las siguientes se piden solo si
    // también lo son. En un mate, la última jugada vale cualquier mate.
    const solucion = [normalizarUci(c.fen, mejor.pv[0], Chess)];
    if (!solucion[0]) return null;
    let continuacion = mejor.pv.slice(1);
    const g = new Chess(c.fen);
    jugarUci(g, solucion[0]);
    let pide = 1;
    while (pide < pideMax && continuacion.length >= 2 && !g.game_over()) {
      const resp = normalizarUci(g.fen(), continuacion[0], Chess);
      if (!resp) break;
      const g2 = new Chess(g.fen());
      jugarUci(g2, resp);
      if (g2.game_over()) break;
      const l2 = await analizar(g2.fen(), 2);
      const c2 = unica(l2);
      // En un mate se sigue mientras queda mate; en lo demás, mientras la
      // jugada siga siendo única.
      const sigue = clase === "mate" ? c2 === "mate" || (l2[0] && l2[0].mate === 1) : c2 === "gana";
      if (!sigue || !l2[0].pv || !l2[0].pv.length) break;
      const prox = normalizarUci(g2.fen(), l2[0].pv[0], Chess);
      if (!prox) break;
      solucion.push(resp, prox);
      jugarUci(g, resp); jugarUci(g, prox);
      continuacion = l2[0].pv.slice(1);
      pide++;
    }
    // Lo que se muestra después de resolverlo: el resto de la línea del motor
    // (hasta cuatro jugadas), solo si son legales.
    const despues = [];
    const g3 = new Chess(g.fen());
    for (const u of continuacion.slice(0, 4)) { const m = jugarUci(g3, u); if (!m) break; despues.push(m.from + m.to + (m.promotion || "")); }

    const pvTema = solucion.concat(despues);
    const t = tema(c.fen, pvTema, Chess, clase === "mate" ? mejor.mate : 0);
    const valor = mejor.mate != null ? null : mejor.cp;
    // Quien lo encontró en la partida: solo si jugó la jugada buena, y solo
    // su apellido. De quien se equivocó no se dice nada.
    const logro = c.jugada && c.jugada === solucion[0].slice(0, 4) ? apellido(c.quien) : "";
    return {
      fen: c.fen, categoria: c.categoria, juego: c.juego, solucion, pide, despues, tema: t, logro,
      evaluacion: valor, salto: c.salto,
      // Primero los mates cortos, después lo que gana material y al final lo
      // que «solo» deja ganando: es lo que se entiende al ver la solución.
      puntaje: (clase === "mate" ? 60 - 5 * Math.min(mejor.mate, 6) : (t.tipo === "ataque" ? 10 : 30) + Math.min(c.salto, 8) * 2) + (pide - 1) * 6,
    };
  }

  // Las n mejores, repartidas: se toma la mejor de cada categoría, después la
  // segunda de cada una, y así; nunca dos veces la misma posición ni dos de
  // la misma partida.
  function elegir(lista, n) {
    const vistas = new Set(), partidas = new Set();
    const porCat = new Map();
    (lista || []).slice().sort((a, b) => b.puntaje - a.puntaje).forEach((e) => {
      const clave = String(e.fen).split(" ").slice(0, 2).join(" ");
      if (vistas.has(clave) || (e.juego != null && partidas.has(e.juego))) return;
      vistas.add(clave);
      if (e.juego != null) partidas.add(e.juego);
      if (!porCat.has(e.categoria)) porCat.set(e.categoria, []);
      porCat.get(e.categoria).push(e);
    });
    const colas = [...porCat.values()].sort((a, b) => b[0].puntaje - a[0].puntaje);
    const out = [];
    for (let vuelta = 0; out.length < n && colas.some((q) => q.length > vuelta); vuelta++) {
      colas.forEach((q) => { if (out.length < n && q[vuelta]) out.push(q[vuelta]); });
    }
    return out;
  }

  const api = { candidatas, verificar, unica, tema, elegir, apellido, jugarUci, normalizarUci, MEJOR_MIN, SEGUNDA_MAX };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  raiz.EjerciciosPartidas = api;
})(typeof window !== "undefined" ? window : globalThis);
