/* ===== Pareo Integral — torneos por equipos =====
 *
 * Un torneo por equipos es un torneo de Pareo Integral donde cada
 * «jugador» es un equipo: el motor (bbpPairings, o las tablas de Berger)
 * empareja equipos igual que empareja jugadores, con los puntos de encuentro
 * como puntaje (2 por ganar, 1 por empatar, 0 por perder: `puntos` del
 * torneo). Lo que este archivo agrega son los tableros de cada encuentro y
 * los puntos de tablero. Funciones puras, sin DOM: las usa js/pareo/pagina.js
 * y las prueba herramientas/verificar-pareo-equipos.js.
 *
 * Lo que se guarda, además de lo de un torneo individual (js/pareo/torneo.js):
 *
 *   tipo: "equipos", tableros: 4
 *   jugadores: [{ id, nombre, institucion, categoria, elo,
 *                 integrantes: [{ id, nombre, sexo, elo, nacimiento, … }] }]
 *     el orden de `integrantes` es el orden de tableros (art. 66.2.h de la
 *     normativa de los JDE: se da en el congresillo y se mantiene en toda la
 *     etapa); el quinto es el suplente.
 *   en cada mesa (un encuentro):
 *     alineacion: { b: [id de integrante…], n: [ … ] }   quiénes juegan, en
 *       el orden de tableros (sistema olímpico: si falta un titular, los de
 *       abajo suben y el suplente entra al final)
 *     partidas: [{ r }]   un resultado por tablero, escrito desde las blancas
 *       como en una partida individual ("1-0", "=", "0-1", "+-", "-+", "--")
 *     r: el resultado del ENCUENTRO, que sale de los tableros (no se escribe
 *       a mano): "1-0" si el equipo de la izquierda sumó más puntos de
 *       tablero, "=" si empataron, "0-1" si el de la derecha; "+-"/"-+"/"--"
 *       si un equipo no completó el mínimo de dos (art. 66.2.f).
 *
 * Los colores: el equipo de la izquierda (el que el pareo pone con
 * «blancas») juega con blancas en los tableros 1 y 3 y con negras en el 2 y
 * el 4, como en las olimpiadas de FIDE.
 */
(function (raiz) {
  "use strict";

  const enNode = typeof module !== "undefined" && module.exports;
  const D = enNode ? require("./desempates.js") : raiz.PareoDesempates;
  const T = enNode ? require("./torneo.js") : raiz.PareoTorneo;

  const TABLEROS = 4;
  const MAX_INTEGRANTES = 5;
  const MIN_PRESENTES = 2;          // art. 66.2.f
  // El bye de un equipo: como un empate (1 punto de encuentro y la mitad de
  // los tableros). La normativa de los JDE no lo dice; es lo que se usa en
  // las olimpiadas. Se puede cambiar en «Torneo» (Bye del pareo).
  const PUNTOS_EQUIPOS = { victoria: 2, tablas: 1, derrota: 0, bye: 1 };
  const DESEMPATES_SUIZO = ["PT", "DE", "BH-C1", "BH"];
  const DESEMPATES_TODOS = ["PT", "DE", "SB"];

  const esDeEquipos = (t) => !!t && t.tipo === "equipos";
  const nTableros = (t) => Number(t.tableros) || TABLEROS;
  const sinTildes = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

  // De una lista de jugadores (cada uno con su institución) a los equipos:
  // uno por centro educativo, con sus integrantes en el orden en que llegan
  // (el de la inscripción). El Elo del equipo es el promedio de los que
  // tienen Elo entre los cuatro primeros: ordena la lista inicial.
  function armarEquipos(jugadores, nuevoId) {
    const porCentro = new Map();
    for (const j of jugadores) {
      const k = sinTildes(j.institucion) || "—";
      if (!porCentro.has(k)) porCentro.set(k, { nombre: String(j.institucion || "").trim() || "—", categoria: j.categoria || "", integrantes: [] });
      porCentro.get(k).integrantes.push(j);
    }
    return [...porCentro.values()].map((e) => ({
      // El nombre completo: el TRF lo recorta solo a 33 (js/pareo/torneo.js:aTrf).
      id: nuevoId(), nombre: e.nombre.slice(0, 80), institucion: e.nombre, categoria: e.categoria,
      elo: eloDeEquipo(e.integrantes), retiradoDespuesDe: null, integrantes: e.integrantes,
    }));
  }

  function eloDeEquipo(integrantes) {
    const con = integrantes.slice(0, TABLEROS).map((j) => Number(j.elo) || 0).filter((x) => x > 0);
    return con.length ? Math.round(con.reduce((a, b) => a + b, 0) / con.length) : 0;
  }

  const equipo = (t, id) => t.jugadores.find((e) => e.id === id);

  // Quiénes juegan por omisión: los cuatro primeros del orden de tableros.
  function alineacionPorOmision(t, idEquipo) {
    const e = equipo(t, idEquipo);
    return e ? e.integrantes.slice(0, nTableros(t)).map((j) => j.id) : [];
  }

  // Lo que necesita una mesa recién emparejada para anotar sus tableros.
  function prepararMesa(t, m) {
    if (m.n === null) return m;
    if (!m.alineacion) m.alineacion = { b: alineacionPorOmision(t, m.b), n: alineacionPorOmision(t, m.n) };
    if (!Array.isArray(m.partidas)) m.partidas = [];
    while (m.partidas.length < nTableros(t)) m.partidas.push({ r: null });
    return m;
  }

  // Los tableros de un encuentro, como los ve el árbitro: quién juega con
  // cada color y el resultado. Un lado sin jugador en ese tablero pierde la
  // partida por incomparecencia (el resultado se pone solo y no se edita).
  function tablerosDe(t, m) {
    const al = m.alineacion || { b: [], n: [] };
    const out = [];
    for (let k = 0; k < nTableros(t); k++) {
      const deB = al.b[k] || null, deN = al.n[k] || null;
      const bBlancas = k % 2 === 0;
      const blancas = bBlancas ? deB : deN, negras = bBlancas ? deN : deB;
      let r = (m.partidas && m.partidas[k] && m.partidas[k].r) || null, fijo = false;
      if (!blancas || !negras) { fijo = true; r = !blancas && !negras ? "--" : !blancas ? "-+" : "+-"; }
      out.push({ k, bBlancas, blancas, negras, r, fijo });
    }
    return out;
  }

  const puntosBlancas = (r) => (r === "1-0" || r === "+-" ? 1 : r === "=" ? 0.5 : 0);
  const puntosNegras = (r) => (r === "0-1" || r === "-+" ? 1 : r === "=" ? 0.5 : 0);

  // Los puntos de tablero de cada equipo en un encuentro, y si están todos
  // los resultados. Con menos de dos presentes (art. 66.2.f) el encuentro se
  // pierde entero: el rival se lleva todos los tableros.
  function puntosDelEncuentro(t, m) {
    const al = m.alineacion || { b: [], n: [] };
    const presentesB = al.b.filter(Boolean).length, presentesN = al.n.filter(Boolean).length;
    const faltaB = presentesB < MIN_PRESENTES, faltaN = presentesN < MIN_PRESENTES;
    const n = nTableros(t);
    if (faltaB || faltaN) return { b: faltaB ? 0 : n, n: faltaN ? 0 : n, completo: true, incomparecencia: true, faltaB, faltaN };
    let b = 0, nn = 0, completo = true;
    for (const x of tablerosDe(t, m)) {
      if (!x.r) { completo = false; continue; }
      const pb = puntosBlancas(x.r), pn = puntosNegras(x.r);
      if (x.bBlancas) { b += pb; nn += pn; } else { b += pn; nn += pb; }
    }
    return { b, n: nn, completo, incomparecencia: false };
  }

  // El resultado del encuentro que sale de los tableros (o null si falta
  // alguno). Es lo que se guarda en m.r: así el resto de Pareo Integral (el
  // puntaje, el TRF para el motor, los desempates de FIDE) lo trata como una
  // «partida» entre dos equipos.
  function resultadoEncuentro(t, m) {
    const p = puntosDelEncuentro(t, m);
    if (p.incomparecencia) return p.faltaB && p.faltaN ? "--" : p.faltaB ? "-+" : "+-";
    if (!p.completo) return null;
    return p.b > p.n ? "1-0" : p.b < p.n ? "0-1" : "=";
  }

  // Los puntos de tablero de un equipo en las rondas [0, hasta).
  function puntosTablero(t, idEquipo, hasta) {
    const h = hasta == null ? t.rondas.length : hasta;
    let s = 0;
    for (let r = 0; r < Math.min(h, t.rondas.length); r++) {
      for (const m of t.rondas[r].mesas) {
        if (m.n === null) { if (m.b === idEquipo) s += nTableros(t) / 2; continue; }
        if (m.b !== idEquipo && m.n !== idEquipo) continue;
        const p = puntosDelEncuentro(t, m);
        s += m.b === idEquipo ? p.b : p.n;
      }
      const a = (t.rondas[r].ausencias || {})[idEquipo];
      if (a === "F") s += nTableros(t);
      else if (a === "H") s += nTableros(t) / 2;
    }
    return s;
  }

  // El catálogo de desempates: en un torneo por equipos, primero los puntos
  // de tablero (lo que se usa en las olimpiadas y lo que pide la propuesta
  // de cambios a la normativa), y después los de FIDE.
  const PT = { codigo: "PT", es: "Puntos de tablero", en: "Game points (board points)" };
  const catalogo = (t) => (esDeEquipos(t) ? [PT].concat(D.CATALOGO) : D.CATALOGO);

  // La clasificación: en un torneo individual, la de siempre; en uno por
  // equipos, la misma (puntos de encuentro y los desempates de FIDE sobre
  // los encuentros) con los puntos de tablero calculados acá.
  function clasificacion(t, codigos) {
    const lista = codigos || t.desempates || [];
    if (!esDeEquipos(t) || !lista.includes("PT")) return D.clasificacion(t, lista);
    const deFide = lista.filter((c) => c !== "PT");
    const base = D.clasificacion(t, deFide);
    for (const f of base) f.valores.PT = puntosTablero(t, f.id);
    const cmp = (a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      for (const c of lista) if (b.valores[c] !== a.valores[c]) return (b.valores[c] || 0) - (a.valores[c] || 0);
      return 0;
    };
    const orden = new Map(base.map((f, i) => [f.id, i]));
    base.sort((a, b) => cmp(a, b) || orden.get(a.id) - orden.get(b.id));
    base.forEach((f, i) => { f.puesto = i > 0 && cmp(base[i - 1], f) === 0 ? base[i - 1].puesto : i + 1; });
    return base;
  }

  const desempatesPara = (sistema) => (sistema === "todos" ? DESEMPATES_TODOS : DESEMPATES_SUIZO).slice();

  // Mover un integrante en el orden de tableros (solo antes de la ronda 1:
  // después el orden queda fijo para la etapa, art. 66.2.h).
  function moverIntegrante(t, idEquipo, i, d) {
    const e = equipo(t, idEquipo);
    if (!e || t.rondas.length) return false;
    const k = i + d;
    if (k < 0 || k >= e.integrantes.length) return false;
    const [x] = e.integrantes.splice(i, 1);
    e.integrantes.splice(k, 0, x);
    e.elo = eloDeEquipo(e.integrantes);
    return true;
  }

  // El orden de tableros con que arrancó el torneo: se anota al emparejar la
  // ronda 1 y desde ahí se compara (art. 66.2.h: se mantiene en toda la
  // etapa). En la página no se puede cambiar después de la ronda 1, pero un
  // torneo abierto desde un archivo sí puede traerlo cambiado.
  function fijarOrden(t) {
    if (!esDeEquipos(t) || t.ordenTableros) return;
    t.ordenTableros = Object.fromEntries(t.jugadores.map((e) => [e.id, e.integrantes.map((j) => j.id)]));
  }

  // Lo que el árbitro debería mirar en la alineación de cada encuentro de
  // una ronda, equipo por equipo:
  //   menos2       menos de dos presentes: pierde el encuentro (art. 66.2.f)
  //   incompleto   dos o tres: pierde por incomparecencia los tableros de abajo
  //   fueraDeOrden alguien juega más arriba que un compañero que en el orden
  //                de tableros está antes (sistema olímpico: el suplente
  //                nunca juega arriba de un titular)
  //   ajeno        en la alineación hay alguien que no es del equipo
  //   ordenCambiado el orden de tableros ya no es el de la ronda 1
  function avisosAlineacion(t, r) {
    const R = t.rondas[r];
    if (!esDeEquipos(t) || !R) return [];
    const out = [];
    R.mesas.forEach((m, mesa) => {
      if (m.n === null || !m.alineacion) return;
      for (const lado of ["b", "n"]) {
        const e = equipo(t, m[lado]);
        if (!e) continue;
        const ids = e.integrantes.map((j) => j.id);
        const al = (m.alineacion[lado] || []).filter(Boolean);
        const base = { mesa, equipo: e.id, nombre: e.nombre };
        if (al.length < MIN_PRESENTES) out.push(Object.assign({ tipo: "menos2", presentes: al.length }, base));
        else if (al.length < nTableros(t)) out.push(Object.assign({ tipo: "incompleto", presentes: al.length, pierde: nTableros(t) - al.length }, base));
        const ajenos = al.filter((x) => !ids.includes(x));
        if (ajenos.length) out.push(Object.assign({ tipo: "ajeno", cuantos: ajenos.length }, base));
        const pos = al.filter((x) => ids.includes(x)).map((x) => ids.indexOf(x));
        if (pos.some((p, i) => i > 0 && p < pos[i - 1])) out.push(Object.assign({ tipo: "fueraDeOrden" }, base));
      }
    });
    if (t.ordenTableros) {
      for (const e of t.jugadores) {
        const antes = t.ordenTableros[e.id];
        if (antes && antes.join("|") !== e.integrantes.map((j) => j.id).join("|")) out.push({ tipo: "ordenCambiado", mesa: null, equipo: e.id, nombre: e.nombre });
      }
    }
    return out;
  }

  // El mejor de cada tablero, como el premio por tablero de las
  // olimpiadas: de cada tablero, quiénes jugaron ahí al menos la mitad de
  // las rondas, por porcentaje y, a igual porcentaje, por puntos. Las
  // partidas que no se jugaron (un tablero vacío, un encuentro perdido por
  // no presentarse) no cuentan: no dicen nada de cómo jugó.
  function mejoresTableros(t, hasta) {
    const h = Math.min(hasta == null ? t.rondas.length : hasta, t.rondas.length);
    const minimo = Math.max(1, Math.ceil(h / 2));
    const n = nTableros(t);
    const porTablero = Array.from({ length: n }, () => new Map());
    for (let r = 0; r < h; r++) {
      for (const m of t.rondas[r].mesas) {
        if (m.n === null || !m.alineacion || puntosDelEncuentro(t, m).incomparecencia) continue;
        for (const x of tablerosDe(t, m)) {
          if (x.fijo || !x.r || x.r === "+-" || x.r === "-+" || x.r === "--") continue;
          const anotar = (idJ, idE, p) => {
            const mapa = porTablero[x.k];
            if (!mapa.has(idJ)) mapa.set(idJ, { id: idJ, equipo: idE, puntos: 0, jugadas: 0 });
            const f = mapa.get(idJ);
            f.puntos += p; f.jugadas++;
          };
          const eB = x.bBlancas ? m.b : m.n, eN = x.bBlancas ? m.n : m.b;
          anotar(x.blancas, eB, puntosBlancas(x.r));
          anotar(x.negras, eN, puntosNegras(x.r));
        }
      }
    }
    return porTablero.map((mapa, k) => {
      const filas = [...mapa.values()].filter((f) => f.jugadas >= minimo).map((f) => {
        const e = equipo(t, f.equipo);
        const j = e && e.integrantes.find((x) => x.id === f.id);
        return Object.assign(f, { nombre: j ? j.nombre : "?", institucion: e ? e.nombre : "", porcentaje: f.puntos / f.jugadas });
      });
      const cmp = (a, b) => b.porcentaje - a.porcentaje || b.puntos - a.puntos;
      filas.sort((a, b) => cmp(a, b) || a.nombre.localeCompare(b.nombre, "es"));
      filas.forEach((f, i) => { f.puesto = i > 0 && cmp(filas[i - 1], f) === 0 ? filas[i - 1].puesto : i + 1; });
      return { tablero: k + 1, minimo, filas };
    });
  }

  // El TRF de un torneo por equipos, el que pide FIDE (TRF-16): una línea
  // 001 por integrante con sus partidas tablero por tablero (el rival es el
  // integrante del otro equipo) y una línea 013 por equipo con los números de
  // sus integrantes. El TRF que usa el motor para emparejar es otro: el de
  // los equipos como si fueran jugadores (T.aTrf). Las partidas no jugadas:
  // un tablero sin rival es «+» con «0000» (la gana quien estaba), un
  // integrante que no jugó esa ronda va en blanco.
  function aTrfEquipos(t, hasta) {
    const h = hasta == null ? t.rondas.length : hasta;
    const { izq, der, decimal, fechaTrf } = T.formatoTrf;
    const orden = T.ordenInicial(t);
    const personas = [];
    for (const id of orden) for (const j of equipo(t, id).integrantes) personas.push({ j, equipo: id });
    const num = new Map(personas.map((x, i) => [x.j.id, i + 1]));
    // Las partidas de cada integrante, por ronda.
    const juegos = new Map(personas.map((x) => [x.j.id, []]));
    const puntos = new Map(personas.map((x) => [x.j.id, 0]));
    for (let r = 0; r < h; r++) {
      for (const m of t.rondas[r].mesas) {
        if (m.n === null || !m.alineacion) continue;
        const inc = puntosDelEncuentro(t, m).incomparecencia;
        for (const x of tablerosDe(t, m)) {
          if (!x.r) continue;
          const anotar = (id, rival, color, codigo, p) => { if (!id) return; juegos.get(id)[r] = (rival ? der(num.get(rival), 4) : "0000") + " " + color + " " + codigo; puntos.set(id, puntos.get(id) + p); };
          const r1 = inc ? (puntosDelEncuentro(t, m).faltaB === x.bBlancas ? "-+" : "+-") : x.r;
          const codigo = { "1-0": ["1", "0"], "0-1": ["0", "1"], "=": ["=", "="], "+-": ["+", "-"], "-+": ["-", "+"], "--": ["-", "-"] }[r1] || ["", ""];
          const sinRival = !x.blancas || !x.negras || inc;
          anotar(x.blancas, sinRival ? null : x.negras, sinRival ? "-" : "w", codigo[0], puntosBlancas(r1));
          anotar(x.negras, sinRival ? null : x.blancas, sinRival ? "-" : "b", codigo[1], puntosNegras(r1));
        }
      }
    }
    const L = [];
    const cab = (c, v) => { if (v !== "" && v != null) L.push(c + " " + v); };
    cab("012", t.nombre);
    cab("022", t.ciudad);
    cab("032", t.federacion);
    cab("042", fechaTrf(t.fechaInicio));
    cab("052", fechaTrf(t.fechaFin));
    cab("062", personas.length);
    cab("072", personas.filter((x) => Number(x.j.elo) > 0).length);
    cab("082", t.jugadores.length);
    cab("092", t.sistema === "todos" ? "Team: Round-Robin" : "Team: Swiss-System");
    cab("102", t.arbitro);
    cab("112", t.arbitroAdjunto);
    cab("122", t.ritmo);
    cab("142", t.sistema === "todos" ? T.rondasTodos(t) : t.rondasTotales);
    const lugar = new Map([...puntos.entries()].sort((a, b) => b[1] - a[1] || num.get(a[0]) - num.get(b[0])).map(([id], i) => [id, i + 1]));
    for (const { j } of personas) {
      let s = "001 " + der(num.get(j.id), 4) + " " + izq(j.sexo || "", 1) + der(j.titulo || "", 3) + " " +
        izq(j.nombre, 33) + " " + der(Number(j.elo) > 0 ? j.elo : "", 4) + " " + izq(j.fed || "", 3) + " " +
        der(j.fideId || "", 11) + " " + izq(fechaTrf(j.nacimiento), 10) + " " + der(decimal(puntos.get(j.id)), 4) + " " + der(lugar.get(j.id), 4);
      for (let r = 0; r < h; r++) s += "  " + (juegos.get(j.id)[r] || "          ");
      L.push(s.replace(/\s+$/, ""));
    }
    for (const id of orden) {
      const e = equipo(t, id);
      L.push(("013 " + izq(e.nombre, 32) + e.integrantes.map((j) => " " + der(num.get(j.id), 4)).join("")).replace(/\s+$/, ""));
    }
    return L.join("\r\n") + "\r\n";
  }

  const api = {
    aTrfEquipos,
    TABLEROS, MAX_INTEGRANTES, MIN_PRESENTES, PUNTOS_EQUIPOS, PT,
    esDeEquipos, armarEquipos, eloDeEquipo, alineacionPorOmision, prepararMesa, tablerosDe,
    puntosDelEncuentro, resultadoEncuentro, puntosTablero, catalogo, clasificacion, desempatesPara, moverIntegrante,
    fijarOrden, avisosAlineacion, mejoresTableros,
  };
  if (enNode) module.exports = api;
  else raiz.PareoEquipos = api;
})(typeof self !== "undefined" ? self : this);
