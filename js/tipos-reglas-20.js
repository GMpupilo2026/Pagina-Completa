/* Las reglas de los Tipos de entrenamiento 20 a 25, sin DOM: el Mapa de
 * casillas, ¿Alcanza el rey?, ¿Cambio y paso al final de peones?, La
 * intermedia, El defensor sobrecargado y La peor pieza.
 *
 * Mismo contrato que js/tipos-reglas.js y js/tipos-reglas-mas.js: lo cargan
 * la página y los verificadores en Node, todo lo que pide chess.js lo recibe
 * como parámetro, y las definiciones de acá SON las del ejercicio: el
 * generador (herramientas/tipos-generar.js) arma los bancos con estas mismas
 * funciones y el verificador las vuelve a correr.
 */
(function (raiz) {
  "use strict";
  const enNode = typeof module !== "undefined" && module.exports;
  const R = enNode ? require("./tipos-reglas.js") : raiz.TiposReglas;
  const M = enNode ? require("./tipos-reglas-mas.js") : raiz.TiposReglasMas;
  const otro = R.otro;
  const ordenar = (lista) => lista.slice().sort((a, b) => R.idx(a) - R.idx(b));
  const vecinas = (i) => {
    const out = [];
    for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      const f = (i & 7) + df, r = (i >> 3) + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8) out.push(r * 8 + f);
    }
    return out;
  };

  /* =====================================================================
   * 20. El Mapa de casillas: marcar las casillas que se piden.
   *
   * «Atacar» es lo de siempre: una casilla está atacada si una pieza podría
   * capturar ahí, haya algo o no (las casillas de las piezas propias cuentan:
   * están defendidas). El peón ataca en diagonal, no hacia adelante. Una
   * pieza clavada sigue atacando: la casilla está controlada igual.
   *   - pieza / rival: todo lo que ataca UNA pieza (propia o del rival).
   *   - rey: las casillas vecinas del rey rival que ataca el bando que mueve,
   *     contadas como si el rey no estuviera (si se corre por la misma línea,
   *     sigue atacado).
   *   - seguras: las casillas a las que una pieza propia puede ir (jugada
   *     legal) sin que el rival ataque esa casilla, contado sin la pieza en
   *     su casilla de salida (ella no tapa nada).
   * ===================================================================== */
  function ataquesDe(tab, i) {
    const p = tab[i];
    if (!p) return new Set();
    // la pieza sola, y todo lo demás como obstáculo neutro
    const solo = tab.map((x, k) => (k === i ? x : (x ? { t: "p", c: "z" } : null)));
    return M.atacadas(solo, p.c);
  }
  function mapaCasillas(Chess, fen, pide) {
    const tab = R.tablero(fen);
    const yo = fen.split(" ")[1];
    if (pide.tipo === "pieza" || pide.tipo === "rival") return ordenar([...ataquesDe(tab, R.idx(pide.casilla))].map(R.sq));
    if (pide.tipo === "rey") {
      const k = tab.findIndex((p) => p && p.t === "k" && p.c === otro(yo));
      const at = M.atacadas(tab, yo, k);
      return ordenar(vecinas(k).filter((j) => at.has(j)).map(R.sq));
    }
    if (pide.tipo === "seguras") {
      const i = R.idx(pide.casilla);
      const at = M.atacadas(tab, otro(yo), i);
      const g = new Chess(fen);
      const destinos = [...new Set(g.moves({ square: pide.casilla, verbose: true }).map((m) => m.to))];
      return ordenar(destinos.filter((s) => !at.has(R.idx(s))));
    }
    return [];
  }
  /* Lo que el alumno anotó contra lo que había: la misma regla del Barrido
     (todas y ninguna de más, tres estrellas; se olvidó una, dos…). */
  function corregirCasillas(esperadas, dadas) { return M.corregirBarrido(esperadas, dadas); }

  /* =====================================================================
   * 21. ¿Alcanza el rey?: finales de peones, solo reyes y peones, y decidir
   * rápido quién gana. El resultado lo dio el motor al generar (profundidad
   * alta, en dos profundidades que dicen lo mismo). Acá, lo que se cuenta del
   * tablero: los peones pasados (ninguno rival delante ni en las columnas de
   * al lado), que deciden el nivel.
   * ===================================================================== */
  function soloReyesYPeones(fen) { return R.tablero(fen).every((p) => !p || p.t === "k" || p.t === "p"); }
  function pasados(fen) {
    const tab = R.tablero(fen);
    const out = { w: [], b: [] };
    tab.forEach((p, i) => {
      if (!p || p.t !== "p") return;
      const f = i & 7, r = i >> 3, d = p.c === "w" ? 1 : -1;
      let libre = true;
      for (let rr = r + d; rr >= 0 && rr < 8 && libre; rr += d) {
        for (let ff = f - 1; ff <= f + 1; ff++) {
          if (ff < 0 || ff > 7) continue;
          const q = tab[rr * 8 + ff];
          if (q && q.t === "p" && q.c !== p.c) { libre = false; break; }
        }
      }
      if (libre) out[p.c].push(R.sq(i));
    });
    return out;
  }
  function nivelAlcanza(fen) {
    const p = pasados(fen);
    const n = p.w.length + p.b.length;
    if (p.w.length && p.b.length) return 2;            // carrera: los dos tienen uno
    if (n >= 1) return 1;                               // un bando tiene peón pasado
    return 3;                                           // sin pasados: lo decide la ruptura o la oposición
  }
  const RESULTADO = { w: "Ganan las blancas", d: "Tablas", b: "Ganan las negras" };
  /* Bien y con tiempo de sobra (la mitad o menos), tres estrellas; bien,
     dos; mal o sin tiempo, ninguna. Una sola oportunidad: con tres opciones,
     dos intentos serían adivinar. */
  function estrellasAlcanza(acierto, usados, total) {
    if (!acierto || usados === null || usados === undefined || usados > total) return 0;
    return usados * 2 <= total ? 3 : 2;
  }

  /* =====================================================================
   * 22. ¿Cambio y paso al final de peones?: la posición tiene una cadena de
   * cambios que deja solo reyes y peones. Se pregunta cómo es ESE final para
   * quien mueve: se gana, son tablas o se pierde. `cadena` (SAN) se juega
   * entera y tiene que ser captura tras captura y terminar en reyes y peones.
   * ===================================================================== */
  function finalDeLaCadena(Chess, fen, cadena) {
    const g = new Chess(fen);
    for (const s of cadena) {
      const m = g.move(s);
      if (!m || !m.captured) return null;
    }
    return soloReyesYPeones(g.fen()) ? g.fen() : null;
  }
  const VEREDICTO = { gana: "Sí: el final de peones se gana", tablas: "No: el final de peones es tablas", pierde: "No: el final de peones se pierde" };

  /* =====================================================================
   * 23. La intermedia: lo natural es recuperar el material (`natural`, una
   * captura), pero hay una jugada mejor antes. Cuenta SOLO la que el motor
   * dio como la mejor, con la segunda lejos (1,5 peones o más).
   * ===================================================================== */
  function intermediaAcertada(Chess, item, mov) {
    const g = new Chess(item.fen);
    const m = g.move(mov);
    if (!m) return { legal: false, ok: false };
    return { legal: true, ok: m.san === item.jugada, natural: m.san === item.natural, san: m.san, refuta: (item.refuta || {})[m.san] || null };
  }

  /* =====================================================================
   * 24. El defensor sobrecargado: una pieza rival cuida DOS casillas. La
   * primera jugada (s1) va a una; el defensor la captura (r1) y deja sin
   * cuidar la otra, donde entra s2 (una captura o mate). Se comprueba con la
   * línea, sin opinión:
   *   - r1 la juega el defensor y captura en la casilla de s1;
   *   - antes de s1, el defensor atacaba la casilla de s2 (la cuidaba);
   *   - después de r1, ya no la ataca;
   *   - s2 es captura o da mate.
   * Devuelve { defensor, cuida: [casilla de s1, casilla de s2] } o null.
   * ===================================================================== */
  function sobrecargado(Chess, fen, linea) {
    if (!linea || linea.length < 3) return null;
    const g = new Chess(fen);
    const tab0 = R.tablero(fen);
    const s1 = g.move(linea[0]);
    if (!s1) return null;
    const r1 = g.move(linea[1]);
    if (!r1 || r1.to !== s1.to || !r1.captured || r1.piece === "k") return null;
    const tab1 = R.tablero(g.fen());
    const s2 = g.move(linea[2]);
    if (!s2 || s2.to === s1.to) return null;
    if (!(s2.captured || g.in_checkmate())) return null;
    const d0 = R.idx(r1.from);
    if (!ataquesDe(tab0, d0).has(R.idx(s2.to))) return null;
    if (ataquesDe(tab1, R.idx(r1.to)).has(R.idx(s2.to))) return null;
    return { defensor: r1.from, cuida: [s1.to, s2.to], pieza: r1.color + r1.piece, mate: g.in_checkmate() };
  }

  /* =====================================================================
   * 25. La peor pieza: en una posición tranquila, ¿qué pieza conviene
   * mejorar? La que tiene la mejor jugada: el motor analizó, pieza por pieza,
   * la mejor jugada de cada una (`porPieza`, casilla → { san, eval }), y la
   * buena le saca medio peón o más a todas las demás. Después hay que moverla:
   * vale cualquiera de sus jugadas a 0,3 o menos de la mejor (`buenas`).
   * ===================================================================== */
  const PEOR = { margen: 50, buena: 30 };
  function estrellasPeorPieza(erroresPieza, erroresJugada) {
    const e = erroresPieza + erroresJugada;
    return e === 0 ? 3 : e === 1 ? 2 : 1;
  }

  const TiposReglas20 = {
    ataquesDe, mapaCasillas, corregirCasillas,
    soloReyesYPeones, pasados, nivelAlcanza, RESULTADO, estrellasAlcanza,
    finalDeLaCadena, VEREDICTO,
    intermediaAcertada,
    sobrecargado,
    PEOR, estrellasPeorPieza,
  };
  if (enNode) module.exports = TiposReglas20;
  else raiz.TiposReglas20 = TiposReglas20;
})(typeof window !== "undefined" ? window : globalThis);
