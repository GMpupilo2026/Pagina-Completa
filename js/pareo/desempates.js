/* ===== Pareo Integral — los desempates (FIDE C.07, versión 2026) =====
 *
 * Traducido de `chesspairing` (Gert Nutterts, Apache 2.0,
 * github.com/gnutterts/chesspairing, paquete tiebreaker), que sigue el C.07:2026
 * artículo por artículo y trae como pruebas los ejercicios de desempate
 * publicados por FIDE. herramientas/verificar-pareo-desempates.js compara este
 * archivo con esos ejercicios, y está comparado además contra chesspairing en
 * miles de torneos al azar (ver «Pareo Integral» en
 * docs/decisiones/juegos-y-torneos.md).
 *
 * Lo delicado son las rondas NO jugadas (artículos 15 y 16): cada jugador tiene
 * un registro por ronda con su categoría —bye del pareo o de punto entero,
 * incomparecencia ganada o perdida, bye pedido seguido de partidas, bye pedido
 * al final— y las que no jugó cuentan como contra un rival «ficticio» con su
 * mismo puntaje, con el tope del artículo 16.4.
 *
 * Los puntos de partida (1, ½, 0) son los del ajedrez; el puntaje del torneo
 * sale de los puntos que eligió quien organiza (js/pareo/torneo.js).
 */
(function (raiz) {
  "use strict";

  const T = typeof module !== "undefined" && module.exports ? require("./torneo.js") : raiz.PareoTorneo;

  // Categorías del artículo 16.2.
  const NINGUNA = 0, BYE_ENTERO = 1, GANA_INCOMP = 2, BYE_PEDIDO_Y_JUEGA = 3, PIERDE_INCOMP = 4, BYE_FINAL = 5;

  function registros(t) {
    const rondas = t.rondas.length;
    const todos = t.sistema === "todos";
    const elo = new Map(t.jugadores.map((j) => [j.id, Number(j.elo) || 0]));
    const reg = new Map(t.jugadores.map((j) => [j.id, []]));

    for (let r = 0; r < rondas; r++) {
      const ronda = new Map();
      for (const j of t.jugadores) ronda.set(j.id, { ronda: r, jugada: false, rival: null, puntos: 0, cat: BYE_FINAL, vur: true, color: null });
      for (const m of t.rondas[r].mesas) {
        if (m.n === null) {
          ronda.set(m.b, { ronda: r, jugada: false, rival: null, puntos: 1, cat: BYE_ENTERO, vur: false });
          continue;
        }
        const b = { ronda: r, jugada: false, rival: m.n, eloRival: elo.get(m.n), puntos: 0, cat: NINGUNA, vur: false, color: "w" };
        const n = { ronda: r, jugada: false, rival: m.b, eloRival: elo.get(m.b), puntos: 0, cat: NINGUNA, vur: false, color: "b" };
        switch (m.r) {
          case "1-0": b.jugada = n.jugada = true; b.puntos = 1; break;
          case "0-1": b.jugada = n.jugada = true; n.puntos = 1; break;
          case "=": b.jugada = n.jugada = true; b.puntos = n.puntos = 0.5; break;
          case "+-": b.puntos = 1; b.cat = GANA_INCOMP; n.cat = PIERDE_INCOMP; n.vur = true; break;
          case "-+": n.puntos = 1; n.cat = GANA_INCOMP; b.cat = PIERDE_INCOMP; b.vur = true; break;
          case "--": b.cat = n.cat = PIERDE_INCOMP; b.vur = n.vur = true; break;
          default: break; // sin resultado todavía: ni jugada ni ronda no jugada
        }
        ronda.set(m.b, b);
        ronda.set(m.n, n);
      }
      for (const [id, a] of Object.entries(t.rondas[r].ausencias || {})) {
        const ya = ronda.get(id);
        if (!ya || ya.cat !== BYE_FINAL) continue;
        if (a === "F") ronda.set(id, { ronda: r, jugada: false, rival: null, puntos: 1, cat: BYE_ENTERO, vur: false });
        else if (a === "H") ya.puntos = 0.5;
      }
      for (const j of t.jugadores) reg.get(j.id).push(ronda.get(j.id));
    }

    // Un bye pedido que después tiene partidas no es «final» (16.2.3 / 16.2.5).
    const noVur = (x) => x.jugada || x.cat === BYE_ENTERO || x.cat === GANA_INCOMP;
    for (const lista of reg.values()) {
      lista.forEach((x, i) => {
        if (x.cat === BYE_FINAL && lista.slice(i + 1).some(noVur)) x.cat = BYE_PEDIDO_Y_JUEGA;
      });
    }

    const puntaje = new Map(t.jugadores.map((j) => [j.id, T.puntos(t, j.id)]));
    // 16.3: el puntaje «ajustado» de un rival cuenta como tablas sus byes finales.
    const ajustado = new Map();
    for (const [id, lista] of reg) {
      let s = puntaje.get(id);
      for (const x of lista) if (x.cat === BYE_FINAL) s += 0.5 - x.puntos;
      ajustado.set(id, s);
    }
    return { reg, puntaje, ajustado, rondas, todos };
  }

  // El rival ficticio (16.4): tiene el puntaje del jugador, con tope.
  function ficticio(id, x, tb) {
    const propio = tb.puntaje.get(id);
    const tope = x.cat === GANA_INCOMP || x.cat === PIERDE_INCOMP ? tb.ajustado.get(x.rival) : 0.5 * tb.rondas;
    return Math.min(propio, tope);
  }

  // Cada aporte lleva además su ronda, rival y resultado (jugada/puntos/cat):
  // son los datos de esa misma ronda en `tb.reg.get(id)`, de más para el
  // cálculo pero lo que necesita «explicar()» para mostrarlos sin tener que
  // volver a cruzar los dos arreglos por índice.
  function aportesBuchholz(id, tb) {
    const out = [];
    for (const x of tb.reg.get(id)) {
      const base = { ronda: x.ronda, rival: x.rival, color: x.color, jugada: x.jugada, puntos: x.puntos, cat: x.cat };
      if (x.jugada) out.push(Object.assign({ v: tb.ajustado.get(x.rival), vur: false }, base));
      else if (x.cat === GANA_INCOMP || x.cat === PIERDE_INCOMP) {
        // 15.2: en un todos contra todos, la incomparecencia cuenta con el rival programado.
        if (tb.todos) out.push(Object.assign({ v: tb.ajustado.get(x.rival), vur: false }, base));
        else out.push(Object.assign({ v: ficticio(id, x, tb), vur: x.vur }, base));
      } else if (x.cat !== NINGUNA) out.push(Object.assign({ v: ficticio(id, x, tb), vur: x.vur }, base));
    }
    return out;
  }

  // 16.5: al cortar el más bajo, si hay una ronda no jugada voluntaria se corta
  // esa (la más baja de ellas) aunque haya un aporte menor.
  function cortarMenor(a) {
    if (!a.length) return a;
    let i = -1;
    a.forEach((x, k) => { if (x.vur && (i < 0 || x.v < a[i].v)) i = k; });
    if (i < 0) { i = 0; a.forEach((x, k) => { if (x.v < a[i].v) i = k; }); }
    return a.filter((_, k) => k !== i);
  }
  function cortarMayor(a) {
    if (!a.length) return a;
    let i = 0;
    a.forEach((x, k) => { if (x.v > a[i].v) i = k; });
    return a.filter((_, k) => k !== i);
  }
  function cortarMenorSB(a) {
    if (!a.length) return a;
    let menor = 0, vur = -1;
    a.forEach((x, k) => {
      if (x.sig < a[menor].sig || (x.sig === a[menor].sig && x.res < a[menor].res)) menor = k;
      if (x.vur && (vur < 0 || x.v < a[vur].v)) vur = k;
    });
    if (vur >= 0 && a[vur].v >= a[menor].v) menor = vur;
    return a.filter((_, k) => k !== menor);
  }
  const suma = (a) => a.reduce((s, x) => s + x.v, 0);

  function buchholz(corte, medio) {
    return (id, tb) => {
      let a = aportesBuchholz(id, tb);
      for (let i = 0; i < corte; i++) a = cortarMenor(a);
      for (let i = 0; i < medio; i++) a = cortarMayor(a);
      return suma(a);
    };
  }

  // Igual que aportesBuchholz: cada aporte lleva su ronda, rival y resultado,
  // para que «explicar()» los pueda mostrar sin recalcular nada.
  function aportesSonneborn(id, tb) {
    const a = [];
    for (const x of tb.reg.get(id)) {
      const base = { ronda: x.ronda, rival: x.rival, color: x.color, jugada: x.jugada, puntos: x.puntos, cat: x.cat };
      let s;
      if (x.jugada) s = tb.ajustado.get(x.rival);
      else if (x.cat === GANA_INCOMP || x.cat === PIERDE_INCOMP) {
        if (tb.todos) { s = tb.ajustado.get(x.rival); a.push(Object.assign({ v: s * x.puntos, sig: s, res: x.puntos, vur: false }, base)); continue; }
        s = ficticio(id, x, tb);
      } else if (x.cat !== NINGUNA) s = ficticio(id, x, tb);
      else continue;
      a.push(Object.assign({ v: s * x.puntos, sig: s, res: x.puntos, vur: x.vur }, base));
    }
    return a;
  }
  function sonneborn(corte) {
    return (id, tb) => {
      let a = aportesSonneborn(id, tb);
      if (corte) a = cortarMenorSB(a);
      return suma(a);
    };
  }

  const jugadas = (id, tb) => tb.reg.get(id).filter((x) => x.jugada);
  const redondeo = (x) => Math.floor(x + 0.5);
  const dosDecimales = (x) => Math.round(x * 100) / 100;

  // FIDE B.02, tabla 8.1b: de la fracción de puntos a la diferencia de Elo
  // (de 0,50 a 1,00; la mitad de abajo es la misma con signo contrario).
  const DP = [0, 7, 14, 21, 29, 36, 43, 50, 57, 65, 72, 80, 87, 95, 102, 110, 117, 125, 133, 141, 149, 158, 166,
    175, 184, 193, 202, 211, 220, 230, 240, 251, 262, 273, 284, 296, 309, 322, 336, 351, 366, 383, 401, 422, 444,
    470, 501, 538, 589, 677, 800];
  const TABLA = [];
  for (let i = 0; i <= 100; i++) TABLA.push([i / 100, i >= 50 ? DP[i - 50] : -DP[50 - i]]);

  function dpDeP(p) {
    if (p <= 0) return -800;
    if (p >= 1) return 800;
    let i = TABLA.findIndex((e) => e[0] >= p - 1e-12);
    if (Math.abs(TABLA[i][0] - p) < 1e-12) return TABLA[i][1];
    const lo = TABLA[i - 1], hi = TABLA[i];
    return lo[1] + ((p - lo[0]) / (hi[0] - lo[0])) * (hi[1] - lo[1]);
  }
  function esperado(dp) {
    if (dp <= -800) return 0;
    if (dp >= 800) return 1;
    const i = TABLA.findIndex((e) => e[1] >= dp);
    if (i < 0) return 1;
    if (TABLA[i][1] === dp) return TABLA[i][0];
    if (i === 0) return 0;
    const lo = TABLA[i - 1], hi = TABLA[i];
    return dp - lo[1] <= hi[1] - dp ? lo[0] : hi[0];
  }

  function aro(corte) {
    return (id, tb) => {
      const g = jugadas(id, tb);
      if (!g.length || (corte && g.length === 1)) return 0;
      let total = g.reduce((s, x) => s + x.eloRival, 0);
      let div = g.length;
      if (corte) { total -= Math.min(...g.map((x) => x.eloRival)); div--; }
      return redondeo(total / div);
    };
  }

  function tpr(id, tb) {
    const g = jugadas(id, tb);
    if (!g.length) return 0;
    const media = redondeo(g.reduce((s, x) => s + x.eloRival, 0) / g.length);
    const pts = g.reduce((s, x) => s + x.puntos, 0);
    const p = Math.min(1, Math.max(0, Math.floor((pts * 100) / g.length + 0.5) / 100));
    return redondeo(media + dpDeP(p));
  }

  function ptp(id, tb) {
    const g = jugadas(id, tb);
    if (!g.length) return 0;
    const pts = tb.puntaje.get(id);
    const elos = g.map((x) => x.eloRival);
    const min = Math.min(...elos);
    if (pts <= 0) return Math.round(min - 800);
    if (pts >= g.length) return Math.round(Math.max(...elos) + 800);
    let lo = min - 800, hi = min + 800;
    for (const e of elos) if (e + 800 > hi) hi = e + 800;
    const total = (r) => elos.reduce((s, e) => s + esperado(r - e), 0);
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      if (total(mid) >= pts) hi = mid; else lo = mid;
    }
    return Math.round(hi);
  }

  // Promedios de lo que hicieron los rivales (AOB, APRO, APPO, AFB).
  function promedioDeRivales(calc, alFinal) {
    return (id, tb, t) => {
      const g = jugadas(id, tb);
      if (!g.length) return 0;
      const v = g.reduce((s, x) => s + calc(x.rival, tb, t), 0) / g.length;
      return alFinal(v);
    };
  }

  // Fore Buchholz: como si la última ronda hubiera terminado toda en tablas.
  function foreBuchholz(id, tb, t) {
    const ultima = t.rondas.length - 1;
    if (ultima < 0) return 0;
    const fb = conTablasAlFinal(tb, ultima);
    return suma(aportesBuchholz(id, fb));
  }
  function conTablasAlFinal(tb, ultima) {
    const reg = new Map();
    const puntaje = new Map(tb.puntaje);
    for (const [id, lista] of tb.reg) {
      reg.set(id, lista.map((x) => {
        if (x.ronda !== ultima || x.rival == null) return x;
        if (x.jugada) puntaje.set(id, puntaje.get(id) + 0.5 - x.puntos);
        else if (x.cat === NINGUNA) puntaje.set(id, puntaje.get(id) + 0.5);
        else return x;
        return Object.assign({}, x, { jugada: true, puntos: 0.5, cat: NINGUNA, vur: false });
      }));
    }
    const ajustado = new Map();
    for (const [id, lista] of reg) {
      let s = puntaje.get(id);
      for (const x of lista) if (x.cat === BYE_FINAL) s += 0.5 - x.puntos;
      ajustado.set(id, s);
    }
    return Object.assign({}, tb, { reg, puntaje, ajustado });
  }

  function encuentroDirecto(id, tb, t, contexto) {
    const empatados = contexto.empatados.get(id);
    if (!empatados || empatados.size <= 1) return 0;
    let s = 0;
    for (const x of tb.reg.get(id)) {
      if (!empatados.has(x.rival)) continue;
      const comoPartida = tb.todos && (x.cat === GANA_INCOMP || x.cat === PIERDE_INCOMP);
      if (!x.jugada && !comoPartida) continue;
      s += x.puntos;
    }
    return s;
  }

  function koya(id, tb) {
    const umbral = tb.rondas / 2;
    let s = 0;
    for (const x of tb.reg.get(id)) {
      const normal = x.jugada || (tb.todos && (x.cat === GANA_INCOMP || x.cat === PIERDE_INCOMP));
      if (!normal || !(tb.puntaje.get(x.rival) >= umbral)) continue;
      s += x.puntos;
    }
    return s;
  }

  // Lo que suma cada ronda con los puntos del ajedrez (para PS y STD).
  function puntosDeRonda(x) {
    if (x.jugada || x.cat === GANA_INCOMP || x.cat === PIERDE_INCOMP) return x.puntos;
    return x.puntos;
  }

  function progresivo(corte) {
    return (id, tb) => {
      let acum = 0, s = 0;
      tb.reg.get(id).forEach((x, i) => {
        acum += puntosDeRonda(x);
        if (corte && i === 0) return;
        s += acum;
      });
      return s;
    };
  }

  function estandar(id, tb) {
    let s = 0;
    for (const x of tb.reg.get(id)) {
      if (x.rival != null && (x.jugada || x.cat === GANA_INCOMP || x.cat === PIERDE_INCOMP)) {
        const otro = x.cat === GANA_INCOMP ? 0 : x.cat === PIERDE_INCOMP ? (tb.reg.get(x.rival)[x.ronda].puntos) : 1 - x.puntos;
        s += x.puntos > otro ? 1 : x.puntos === otro ? 0.5 : 0;
      } else if (x.rival == null) {
        s += x.puntos > 0.5 ? 1 : x.puntos === 0.5 ? 0.5 : 0;
      }
    }
    return s;
  }

  // El catálogo: abreviatura de FIDE → cálculo, nombre y si es de «más es mejor».
  const C = {
    "BH":     { f: buchholz(0, 0), es: "Buchholz", en: "Buchholz" },
    "BH-C1":  { f: buchholz(1, 0), es: "Buchholz sin el peor", en: "Buchholz Cut-1" },
    "BH-C2":  { f: buchholz(2, 0), es: "Buchholz sin los dos peores", en: "Buchholz Cut-2" },
    "BH-M1":  { f: buchholz(1, 1), es: "Buchholz mediano", en: "Median Buchholz" },
    "BH-M2":  { f: buchholz(2, 2), es: "Buchholz mediano 2", en: "Median Buchholz 2" },
    "SB":     { f: sonneborn(false), es: "Sonneborn-Berger", en: "Sonneborn-Berger" },
    "SB-C1":  { f: sonneborn(true), es: "Sonneborn-Berger sin el peor", en: "Sonneborn-Berger Cut-1" },
    "DE":     { f: encuentroDirecto, es: "Encuentro directo", en: "Direct encounter" },
    "WIN":    { f: (id, tb) => tb.reg.get(id).filter((x) => (x.jugada && x.puntos === 1) || x.cat === GANA_INCOMP || x.cat === BYE_ENTERO).length,
                es: "Rondas ganadas", en: "Number of wins" },
    "WON":    { f: (id, tb) => tb.reg.get(id).filter((x) => (x.jugada || (tb.todos && x.cat === GANA_INCOMP)) && x.puntos === 1).length,
                es: "Partidas ganadas en el tablero", en: "Games won" },
    "BPG":    { f: (id, tb) => tb.reg.get(id).filter((x) => x.color === "b" && (x.jugada || (tb.todos && x.cat === GANA_INCOMP))).length,
                es: "Partidas con negras", en: "Games played with black" },
    "BWG":    { f: (id, tb) => tb.reg.get(id).filter((x) => x.color === "b" && x.puntos === 1 && (x.jugada || (tb.todos && x.cat === GANA_INCOMP))).length,
                es: "Partidas ganadas con negras", en: "Games won with black" },
    "GE":     { f: (id, tb) => tb.rondas - tb.reg.get(id).filter((x) => x.vur).length,
                es: "Partidas que eligió jugar", en: "Games elected to play" },
    "PS":     { f: progresivo(false), es: "Progresivo", en: "Progressive scores" },
    "PS-C1":  { f: progresivo(true), es: "Progresivo sin la 1.ª ronda", en: "Progressive scores Cut-1" },
    "KS":     { f: koya, es: "Koya", en: "Koya system" },
    "STD":    { f: estandar, es: "Puntos estándar", en: "Standard points" },
    "ARO":    { f: aro(false), es: "Elo medio de los rivales", en: "Average rating of opponents" },
    "ARO-C1": { f: aro(true), es: "Elo medio de los rivales sin el menor", en: "Average rating of opponents Cut-1" },
    "TPR":    { f: tpr, es: "Rendimiento (performance)", en: "Tournament performance rating" },
    "PTP":    { f: ptp, es: "Rendimiento perfecto", en: "Perfect tournament performance" },
    "FB":     { f: foreBuchholz, es: "Fore Buchholz", en: "Fore Buchholz" },
    "AOB":    { f: promedioDeRivales((r, tb) => suma(aportesBuchholz(r, tb)), dosDecimales),
                es: "Buchholz medio de los rivales", en: "Average of opponents' Buchholz" },
    "APRO":   { f: promedioDeRivales((r, tb) => tpr(r, tb), redondeo),
                es: "Rendimiento medio de los rivales", en: "Average performance rating of opponents" },
    "APPO":   { f: promedioDeRivales((r, tb) => ptp(r, tb), redondeo),
                es: "Rendimiento perfecto medio de los rivales", en: "Average perfect performance of opponents" },
    "AFB":    { f: promedioDeRivales((r, tb, t) => foreBuchholz(r, tb, t), dosDecimales),
                es: "Fore Buchholz medio de los rivales", en: "Average of opponents' Fore Buchholz" },
  };

  // Los grupos de empatados en puntos (lo que usa el encuentro directo, DE):
  // una sola vez, la usan clasificacion(), calcular() y explicar().
  function contextoDe(t, tb) {
    const grupos = new Map();
    for (const j of t.jugadores) {
      const p = tb.puntaje.get(j.id);
      if (!grupos.has(p)) grupos.set(p, new Set());
      grupos.get(p).add(j.id);
    }
    return { empatados: new Map(t.jugadores.map((j) => [j.id, grupos.get(tb.puntaje.get(j.id))])) };
  }

  // Calcula todos los desempates pedidos y devuelve la clasificación:
  // [{ id, puntos, valores: {BH: …}, puesto }], con los empatados en todo
  // compartiendo puesto (lo resuelve quien arbitra: un sorteo o un desempate rápido).
  function clasificacion(t, codigos) {
    const lista = (codigos || t.desempates || []).filter((c) => C[c]);
    const tb = registros(t);
    const contexto = contextoDe(t, tb);
    const filas = t.jugadores.map((j) => {
      const valores = {};
      for (const c of lista) valores[c] = C[c].f(j.id, tb, t, contexto);
      return { id: j.id, puntos: tb.puntaje.get(j.id), valores };
    });
    const num = T.numeros(t);
    const cmp = (a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      for (const c of lista) if (b.valores[c] !== a.valores[c]) return b.valores[c] - a.valores[c];
      return 0;
    };
    filas.sort((a, b) => cmp(a, b) || num.get(a.id) - num.get(b.id));
    filas.forEach((f, i) => { f.puesto = i > 0 && cmp(filas[i - 1], f) === 0 ? filas[i - 1].puesto : i + 1; });
    return filas;
  }

  function calcular(t, codigo) {
    const tb = registros(t);
    const contexto = contextoDe(t, tb);
    const out = {};
    for (const j of t.jugadores) out[j.id] = C[codigo].f(j.id, tb, t, contexto);
    return out;
  }

  /* ===== explicar(): el desglose jugador por jugador de un desempate =====
   *
   * Para «Desempates explicados» (herramientas-arbitraje.html): no alcanza
   * con el número que ya da calcular()/clasificacion(), porque lo que
   * responde un reclamo es DE DÓNDE sale ese número. explicar(t, id, codigo)
   * devuelve:
   *   - { tipo: "rondas", filas: [{ ronda, rivalId, color, resultado,
   *       valor, incluido }], total, nota? } para los 22 desempates que son
   *     una suma (o un conteo, o un promedio) ronda por ronda: Buchholz y sus
   *     variantes, Sonneborn-Berger, Fore Buchholz, encuentro directo, Koya,
   *     progresivo, puntos estándar, los conteos (WIN, WON, BPG, BWG, GE), el
   *     Elo medio de los rivales y los cuatro promedios de lo que hicieron
   *     los rivales (AOB, APRO, APPO, AFB: ahí `valor` es el aporte de CADA
   *     rival en su propio Buchholz/rendimiento, no de esa ronda). `incluido:
   *     false` es una ronda que SÍ se jugó pero el propio desempate la deja
   *     afuera (el peor aporte de un Buchholz Cut-1, un rival con el que no
   *     terminaste empatado en el encuentro directo…): se muestra igual, con
   *     el motivo, porque es la mitad de lo que hay que entender.
   *   - { tipo: "formula", filas, partes: [{ etiqueta, valor }], total } para
   *     TPR y PTP, que no son una suma de aportes sino una sola fórmula (la
   *     tabla de probabilidad de FIDE, o una búsqueda binaria): se listan los
   *     rivales igual, y aparte los pasos de la fórmula.
   *   - null si `codigo` no existe.
   */
  function etiquetaRonda(x) {
    if (x.jugada) return x.puntos === 1 ? "1" : x.puntos === 0 ? "0" : "½";
    switch (x.cat) {
      case BYE_ENTERO: return "bye (punto entero)";
      case GANA_INCOMP: return "ganó por incomparecencia del rival";
      case PIERDE_INCOMP: return "perdió por incomparecencia";
      case BYE_PEDIDO_Y_JUEGA: return "bye pedido (siguió jugando después)";
      case BYE_FINAL: return "bye pedido, al final del torneo";
      default: return "sin resultado todavía";
    }
  }

  // Marca «cortado» en vez de quitar del arreglo (al revés que cortarMenor/
  // cortarMayor): para explicar() hace falta mostrar TAMBIÉN la ronda que el
  // desempate descarta, no solo sumar las que quedan. Mismas reglas de
  // desempate del artículo 16.5 que cortarMenor/cortarMayor/cortarMenorSB.
  function marcarCortes(lista, pasos) {
    const activos = lista.map((x) => Object.assign({ cortado: false }, x));
    for (const paso of pasos) {
      const vivos = activos.filter((x) => !x.cortado);
      if (!vivos.length) break;
      let elegido;
      if (paso === "menor") {
        let i = -1;
        vivos.forEach((x, k) => { if (x.vur && (i < 0 || x.v < vivos[i].v)) i = k; });
        if (i < 0) { i = 0; vivos.forEach((x, k) => { if (x.v < vivos[i].v) i = k; }); }
        elegido = vivos[i];
      } else {
        let i = 0;
        vivos.forEach((x, k) => { if (x.v > vivos[i].v) i = k; });
        elegido = vivos[i];
      }
      elegido.cortado = true;
    }
    return activos;
  }
  function marcarCorteSB(lista) {
    const activos = lista.map((x) => Object.assign({ cortado: false }, x));
    if (!activos.length) return activos;
    let menor = 0, vur = -1;
    activos.forEach((x, k) => {
      if (x.sig < activos[menor].sig || (x.sig === activos[menor].sig && x.res < activos[menor].res)) menor = k;
      if (x.vur && (vur < 0 || x.v < activos[vur].v)) vur = k;
    });
    if (vur >= 0 && activos[vur].v >= activos[menor].v) menor = vur;
    activos[menor].cortado = true;
    return activos;
  }
  function filasDeAportes(marcado) {
    return marcado.map((x) => ({ ronda: x.ronda + 1, rivalId: x.rival, color: x.color, resultado: etiquetaRonda(x), valor: x.v, incluido: !x.cortado }));
  }

  function gridBuchholz(id, tb, corte, medio) {
    const marcado = marcarCortes(aportesBuchholz(id, tb), Array(corte).fill("menor").concat(Array(medio).fill("mayor")));
    return { tipo: "rondas", filas: filasDeAportes(marcado), total: marcado.filter((x) => !x.cortado).reduce((s, x) => s + x.v, 0) };
  }
  function gridSonneborn(id, tb, corte) {
    const base = aportesSonneborn(id, tb);
    const marcado = corte ? marcarCorteSB(base) : base.map((x) => Object.assign({ cortado: false }, x));
    return { tipo: "rondas", filas: filasDeAportes(marcado), total: marcado.filter((x) => !x.cortado).reduce((s, x) => s + x.v, 0) };
  }
  function gridForeBuchholz(id, tb, t) {
    const ultima = t.rondas.length - 1;
    if (ultima < 0) return { tipo: "rondas", filas: [], total: 0, nota: "El torneo no tiene rondas." };
    const fb = conTablasAlFinal(tb, ultima);
    const base = aportesBuchholz(id, fb).map((x) => Object.assign({ cortado: false }, x));
    return { tipo: "rondas", filas: filasDeAportes(base), total: suma(base), nota: "Como si la última ronda hubiera terminado en tablas para todos los que la jugaron." };
  }
  function gridEncuentroDirecto(id, tb, t) {
    const contexto = contextoDe(t, tb);
    const empatados = contexto.empatados.get(id);
    const grupoGrande = !!empatados && empatados.size > 1;
    const filas = [];
    let total = 0;
    for (const x of tb.reg.get(id)) {
      if (x.rival == null) continue;
      const comoPartida = tb.todos && (x.cat === GANA_INCOMP || x.cat === PIERDE_INCOMP);
      const enElGrupo = grupoGrande && empatados.has(x.rival);
      const cuenta = enElGrupo && (x.jugada || comoPartida);
      filas.push({ ronda: x.ronda + 1, rivalId: x.rival, color: x.color, resultado: etiquetaRonda(x), valor: x.puntos, incluido: !!cuenta,
        motivo: enElGrupo ? null : "ese rival no terminó con tu mismo puntaje final" });
      if (cuenta) total += x.puntos;
    }
    return { tipo: "rondas", filas, total,
      nota: grupoGrande ? "Solo cuenta lo jugado contra quienes terminaron con tu mismo puntaje final." : "No hay nadie más con tu mismo puntaje final: el encuentro directo no decide nada aquí." };
  }
  function gridKoya(id, tb) {
    const umbral = tb.rondas / 2;
    const filas = [];
    let total = 0;
    for (const x of tb.reg.get(id)) {
      if (x.rival == null) { filas.push({ ronda: x.ronda + 1, rivalId: null, resultado: etiquetaRonda(x), valor: 0, incluido: false, motivo: "no fue contra un rival" }); continue; }
      const normal = x.jugada || (tb.todos && (x.cat === GANA_INCOMP || x.cat === PIERDE_INCOMP));
      const cumpleRival = tb.puntaje.get(x.rival) >= umbral;
      const cuenta = normal && cumpleRival;
      filas.push({ ronda: x.ronda + 1, rivalId: x.rival, color: x.color, resultado: etiquetaRonda(x), valor: x.puntos, incluido: cuenta,
        motivo: cuenta || !normal ? null : `ese rival no llegó a ${umbral} puntos (la mitad de las rondas)` });
      if (cuenta) total += x.puntos;
    }
    return { tipo: "rondas", filas, total, nota: `Cuenta solo lo jugado contra quienes sacaron al menos ${umbral} puntos (la mitad de las rondas).` };
  }
  function gridEstandar(id, tb) {
    const filas = [];
    let total = 0;
    for (const x of tb.reg.get(id)) {
      let valor;
      if (x.rival != null && (x.jugada || x.cat === GANA_INCOMP || x.cat === PIERDE_INCOMP)) {
        const otro = x.cat === GANA_INCOMP ? 0 : x.cat === PIERDE_INCOMP ? tb.reg.get(x.rival)[x.ronda].puntos : 1 - x.puntos;
        valor = x.puntos > otro ? 1 : x.puntos === otro ? 0.5 : 0;
      } else if (x.rival == null) {
        valor = x.puntos > 0.5 ? 1 : x.puntos === 0.5 ? 0.5 : 0;
      } else continue;
      filas.push({ ronda: x.ronda + 1, rivalId: x.rival, color: x.color, resultado: etiquetaRonda(x), valor, incluido: true });
      total += valor;
    }
    return { tipo: "rondas", filas, total, nota: "Un punto si ganaste la ronda (por el resultado del ajedrez, no por los puntos del torneo), medio si la empataste." };
  }
  function gridProgresivo(id, tb, corte) {
    let acum = 0, total = 0;
    const filas = [];
    tb.reg.get(id).forEach((x, i) => {
      acum += puntosDeRonda(x);
      const incluido = !(corte && i === 0);
      filas.push({ ronda: x.ronda + 1, rivalId: x.rival, color: x.color, resultado: etiquetaRonda(x), valor: acum, incluido });
      if (incluido) total += acum;
    });
    return { tipo: "rondas", filas, total, nota: "El valor de cada ronda es el puntaje ACUMULADO hasta ahí (no solo lo de esa ronda); lo que se suma son esos acumulados." };
  }
  function gridConteo(id, tb, pred) {
    const filas = [];
    let total = 0;
    for (const x of tb.reg.get(id)) {
      const cuenta = !!pred(x);
      filas.push({ ronda: x.ronda + 1, rivalId: x.rival, color: x.color, resultado: etiquetaRonda(x), valor: cuenta ? 1 : 0, incluido: cuenta });
      if (cuenta) total++;
    }
    return { tipo: "rondas", filas, total };
  }
  function gridElo(id, tb, corte) {
    const filas = jugadas(id, tb).map((x) => ({ ronda: x.ronda + 1, rivalId: x.rival, color: x.color, resultado: etiquetaRonda(x), valor: x.eloRival, incluido: true }));
    if (corte && filas.length === 1) {
      // 16.2 al revés: con una sola partida no hay «el menor de los demás»,
      // así que el artículo manda 0 en vez de dejar el Elo de esa única.
      filas[0].incluido = false;
      filas[0].motivo = "con una sola partida no se puede descartar «la más baja»: este desempate da 0";
    } else if (corte && filas.length > 1) {
      let i = 0;
      filas.forEach((f, k) => { if (f.valor < filas[i].valor) i = k; });
      filas[i].incluido = false;
      filas[i].motivo = "el Elo más bajo de tus rivales: este desempate lo descarta";
    }
    const incluidas = filas.filter((f) => f.incluido);
    const total = corte && filas.length === 1 ? 0 : incluidas.length ? redondeo(incluidas.reduce((s, f) => s + f.valor, 0) / incluidas.length) : 0;
    return { tipo: "rondas", filas, total, promedio: true, nota: "Se promedia el Elo de los rivales con los que jugaste (no cuentan byes ni incomparecencias)." };
  }
  function gridPromedioRivales(id, tb, t, calc, alFinal) {
    const g = jugadas(id, tb);
    const filas = g.map((x) => ({ ronda: x.ronda + 1, rivalId: x.rival, color: x.color, resultado: etiquetaRonda(x), valor: calc(x.rival, tb, t), incluido: true }));
    const total = filas.length ? alFinal(filas.reduce((s, f) => s + f.valor, 0) / filas.length) : 0;
    return { tipo: "rondas", filas, total, promedio: true, nota: "«Valor» es lo que ESE rival sacó en su propio desempate, no el resultado de la ronda; se promedia entre todos los rivales con los que jugaste." };
  }
  function formulaTPR(id, tb) {
    const g = jugadas(id, tb);
    const filas = g.map((x) => ({ ronda: x.ronda + 1, rivalId: x.rival, color: x.color, resultado: etiquetaRonda(x), valor: x.eloRival, incluido: true }));
    if (!g.length) return { tipo: "formula", filas, partes: [], total: 0, nota: "No jugaste ninguna partida con rival: el rendimiento es 0." };
    const media = redondeo(g.reduce((s, x) => s + x.eloRival, 0) / g.length);
    const pts = g.reduce((s, x) => s + x.puntos, 0);
    const p = Math.min(1, Math.max(0, Math.floor((pts * 100) / g.length + 0.5) / 100));
    const dp = dpDeP(p);
    const total = redondeo(media + dp);
    return { tipo: "formula", filas, total, partes: [
      { etiqueta: "Partidas con resultado", valor: g.length },
      { etiqueta: "Puntos obtenidos", valor: pts },
      { etiqueta: "Elo medio de los rivales", valor: media },
      { etiqueta: "Porcentaje de puntos sobre esas partidas", valor: Math.round(p * 100) + "%" },
      { etiqueta: "Diferencia de Elo de ese porcentaje (tabla FIDE B.02)", valor: dp },
      { etiqueta: "Rendimiento (Elo medio + esa diferencia)", valor: `${media} + (${dp}) = ${total}` },
    ] };
  }
  function formulaPTP(id, tb) {
    const g = jugadas(id, tb);
    const filas = g.map((x) => ({ ronda: x.ronda + 1, rivalId: x.rival, color: x.color, resultado: etiquetaRonda(x), valor: x.eloRival, incluido: true }));
    if (!g.length) return { tipo: "formula", filas, partes: [], total: 0, nota: "No jugaste ninguna partida con rival: el rendimiento perfecto es 0." };
    const elos = g.map((x) => x.eloRival);
    return { tipo: "formula", filas, total: ptp(id, tb), partes: [
      { etiqueta: "Partidas con resultado", valor: g.length },
      { etiqueta: "Puntos obtenidos", valor: tb.puntaje.get(id) },
      { etiqueta: "Elo más bajo entre los rivales", valor: Math.min(...elos) },
      { etiqueta: "Elo más alto entre los rivales", valor: Math.max(...elos) },
      { etiqueta: "Rendimiento perfecto (el Elo que, contra estos rivales exactos, esperaría sacar justo tus puntos, según la tabla de probabilidad de FIDE)", valor: ptp(id, tb) },
    ] };
  }

  function explicar(t, id, codigo) {
    if (!C[codigo]) return null;
    const tb = registros(t);
    switch (codigo) {
      case "BH": return gridBuchholz(id, tb, 0, 0);
      case "BH-C1": return gridBuchholz(id, tb, 1, 0);
      case "BH-C2": return gridBuchholz(id, tb, 2, 0);
      case "BH-M1": return gridBuchholz(id, tb, 1, 1);
      case "BH-M2": return gridBuchholz(id, tb, 2, 2);
      case "SB": return gridSonneborn(id, tb, false);
      case "SB-C1": return gridSonneborn(id, tb, true);
      case "FB": return gridForeBuchholz(id, tb, t);
      case "DE": return gridEncuentroDirecto(id, tb, t);
      case "WIN": return gridConteo(id, tb, (x) => (x.jugada && x.puntos === 1) || x.cat === GANA_INCOMP || x.cat === BYE_ENTERO);
      case "WON": return gridConteo(id, tb, (x) => (x.jugada || (tb.todos && x.cat === GANA_INCOMP)) && x.puntos === 1);
      case "BPG": return gridConteo(id, tb, (x) => x.color === "b" && (x.jugada || (tb.todos && x.cat === GANA_INCOMP)));
      case "BWG": return gridConteo(id, tb, (x) => x.color === "b" && x.puntos === 1 && (x.jugada || (tb.todos && x.cat === GANA_INCOMP)));
      case "GE": return gridConteo(id, tb, (x) => !x.vur);
      case "PS": return gridProgresivo(id, tb, false);
      case "PS-C1": return gridProgresivo(id, tb, true);
      case "KS": return gridKoya(id, tb);
      case "STD": return gridEstandar(id, tb);
      case "ARO": return gridElo(id, tb, false);
      case "ARO-C1": return gridElo(id, tb, true);
      case "TPR": return formulaTPR(id, tb);
      case "PTP": return formulaPTP(id, tb);
      case "AOB": return gridPromedioRivales(id, tb, t, (r, tbx) => suma(aportesBuchholz(r, tbx)), dosDecimales);
      case "APRO": return gridPromedioRivales(id, tb, t, (r, tbx) => tpr(r, tbx), redondeo);
      case "APPO": return gridPromedioRivales(id, tb, t, (r, tbx) => ptp(r, tbx), redondeo);
      case "AFB": return gridPromedioRivales(id, tb, t, (r, tbx, tt) => foreBuchholz(r, tbx, tt), dosDecimales);
      default: return null;
    }
  }

  const CATALOGO = Object.keys(C).map((c) => ({ codigo: c, es: C[c].es, en: C[c].en }));
  const api = { CATALOGO, clasificacion, calcular, dpDeP, explicar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoDesempates = api;
})(typeof self !== "undefined" ? self : this);
