/* La logística de la sala, sacada de sus medidas y del plano (js/centroamericano-plano.js).
 *
 * En «Plano de la sala» de centroamericano-mesas.html la organización pone las
 * medidas del salón y de la mesa, y con eso:
 *
 *   1. capacidad(): cuántas mesas caben por fila (en tramos, con un pasillo
 *      entre tramo y tramo) y cuántas filas caben del frente al fondo.
 *   2. borrador(): el primer plano con esas medidas. Cada torneo arranca en
 *      una fila nueva (o en un tramo nuevo), las filas se parten donde se
 *      acaba el ancho y las mesas de los jugadores con discapacidad visual van
 *      al final de su torneo, una partida por mesa.
 *   3. medir(): si el plano (el del borrador o el ya corregido a mano) cabe en
 *      el salón: la fila más ancha contra el ancho útil y el fondo de todas las
 *      filas contra el largo útil.
 *   4. inventario(): lo que hay que llevar, contado del plano: mesas, sillas,
 *      tableros, relojes, planillas, el material adaptado y cuántos árbitros
 *      hacen falta.
 *
 * Solo la cuenta, sin pantalla ni base, para que la pruebe el verificador.
 * La mesa de la casa es la plegable de 180 × 74 cm: dos tableros (90 cm por
 * partida) y cuatro sillas, dos de cada lado. El plano guarda siempre dos
 * tableros por mesa (t: [derecha, izquierda]).
 * Ver «La logística de la sala: medidas, borrador y material» en
 * docs/decisiones/juegos-y-torneos.md.
 */
(function (raiz) {
  "use strict";
  const enNode = typeof module !== "undefined" && module.exports;

  // Lo que se usa si la organización no dice otra cosa. Metros, salvo lo marcado.
  const DEFECTO = {
    largo: 0,            // del frente al fondo
    ancho: 0,            // de lado a lado (las filas van de lado a lado)
    mesaLargo: 1.8,      // la mesa plegable de la casa: 180 × 74 cm
    mesaFondo: 0.74,
    silla: 0.6,          // lo que ocupa un jugador sentado, de cada lado de la mesa
    pasilloFila: 1,      // entre el respaldo de una fila y el de la siguiente
    mesasPorTramo: 5,    // mesas pegadas antes de un pasillo
    pasilloTramo: 1.5,   // el pasillo entre tramos de una misma fila
    margen: 1.5,         // libre contra las paredes
    frente: 4,           // la zona de la mesa principal, adelante
    separar: true,       // cada torneo empieza en una fila nueva
    usar: false,         // «Armar el borrador con estas medidas»
    rondas: 7,
    porArbitro: 25,      // partidas por árbitro de sector
    reserva: 10,         // % de material de más
    sillasExtra: 10,
    dv: {},              // torneo → jugadores con discapacidad visual
  };
  const TABLEROS_POR_MESA = 2;
  const SILLAS_POR_PARTIDA = 2;

  const num = (v, min, max, def) => {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : def;
  };
  const entero = (v, min, max, def) => {
    const n = num(v, min, max, null);
    return n == null ? def : Math.round(n);
  };

  // Deja las medidas con la forma de arriba, sin nada de más: lo que llega del
  // plano guardado o de los campos se lee siempre por acá.
  function limpiarSalon(s) {
    const o = s && typeof s === "object" ? s : {};
    const dv = {};
    if (o.dv && typeof o.dv === "object") {
      Object.keys(o.dv).slice(0, 40).forEach((k) => {
        const n = entero(o.dv[k], 0, 500, 0);
        const clave = String(k).trim().slice(0, 60);
        if (n > 0 && clave) dv[clave] = n;
      });
    }
    return {
      largo: num(o.largo, 0, 500, DEFECTO.largo),
      ancho: num(o.ancho, 0, 500, DEFECTO.ancho),
      mesaLargo: num(o.mesaLargo, 0.5, 5, DEFECTO.mesaLargo),
      mesaFondo: num(o.mesaFondo, 0.3, 3, DEFECTO.mesaFondo),
      silla: num(o.silla, 0.2, 2, DEFECTO.silla),
      pasilloFila: num(o.pasilloFila, 0.3, 10, DEFECTO.pasilloFila),
      mesasPorTramo: entero(o.mesasPorTramo, 1, 60, DEFECTO.mesasPorTramo),
      pasilloTramo: num(o.pasilloTramo, 0.3, 10, DEFECTO.pasilloTramo),
      margen: num(o.margen, 0, 20, DEFECTO.margen),
      frente: num(o.frente, 0, 50, DEFECTO.frente),
      separar: o.separar === undefined ? DEFECTO.separar : !!o.separar,
      usar: !!o.usar,
      rondas: entero(o.rondas, 1, 30, DEFECTO.rondas),
      porArbitro: entero(o.porArbitro, 1, 200, DEFECTO.porArbitro),
      reserva: entero(o.reserva, 0, 100, DEFECTO.reserva),
      sillasExtra: entero(o.sillasExtra, 0, 500, DEFECTO.sillasExtra),
      dv,
    };
  }

  // Lo que ocupa una fila del frente al fondo: la mesa y una silla de cada lado.
  const fondoFila = (s) => s.mesaFondo + 2 * s.silla;

  // Cuántas mesas caben por fila y cuántas filas. Sin medidas del salón, null.
  function capacidad(salon) {
    const s = limpiarSalon(salon);
    if (!s.ancho || !s.largo) return null;
    const anchoUtil = s.ancho - 2 * s.margen;
    const fondoUtil = s.largo - 2 * s.margen - s.frente;
    // Los tramos de una fila, de derecha a izquierda: llenos mientras quepan,
    // y el último con lo que alcance.
    const tramos = [];
    let x = 0;
    for (;;) {
      const libre = anchoUtil - x - (tramos.length ? s.pasilloTramo : 0);
      const caben = Math.min(s.mesasPorTramo, Math.floor(libre / s.mesaLargo + 1e-9));
      if (caben < 1) break;
      x += (tramos.length ? s.pasilloTramo : 0) + caben * s.mesaLargo;
      tramos.push(caben);
      if (caben < s.mesasPorTramo || tramos.length > 60) break;
    }
    const f = fondoFila(s);
    const filas = fondoUtil >= f ? Math.floor((fondoUtil + s.pasilloFila) / (f + s.pasilloFila) + 1e-9) : 0;
    const mesasPorFila = tramos.reduce((a, b) => a + b, 0);
    return { anchoUtil, fondoUtil, tramos, mesasPorFila, filas, mesas: mesasPorFila * filas };
  }

  // Las mesas de un torneo, en orden: primero las normales (dos tableros) y
  // al final las de los jugadores con discapacidad visual, una partida por
  // mesa (los dos tableros, el normal y el adaptado, van en la misma mesa).
  function mesasDeTorneo(tableros, dv) {
    const partidas = Math.max(0, Math.floor(tableros || 0));
    const conDv = Math.min(Math.max(0, Math.floor(dv || 0)), partidas);
    const normales = partidas - conDv;
    const mesas = [];
    let n = 1;
    while (n <= normales) {
      mesas.push({ t: [n, n + 1 <= normales ? n + 1 : null], duda: true });
      n += 2;
    }
    // No llevan marca: el plano es público y, con el pareo, la marca diría
    // quién es. Se sabe cuántas son por salon.dv.
    for (let k = 0; k < conDv; k++) { mesas.push({ t: [n, null], duda: true }); n += 1; }
    return mesas;
  }

  // El primer plano con las medidas del salón. torneos: [{ torneo, tableros, dv }].
  // Devuelve { plano, sobran } (sobran: las mesas que quedaron en filas que ya
  // no caben en el salón; se dibujan igual, para que se vea cuánto falta), o
  // null si en el ancho del salón no cabe ni una mesa.
  function borrador(torneos, salon) {
    const s = limpiarSalon(salon);
    const c = capacidad(s);
    if (!c || !c.mesasPorFila) return null;
    const filas = [];
    let fila = null, tramo = 0, lugar = 0; // el tramo de la fila y la mesa dentro del tramo
    const filaNueva = () => { fila = { grupos: [] }; filas.push(fila); tramo = 0; lugar = 0; };
    const tramoNuevo = () => {
      if (!fila || lugar > 0) { if (fila) tramo += 1; lugar = 0; }
      if (!fila || tramo >= c.tramos.length) filaNueva();
    };
    let sobran = 0;
    (torneos || []).forEach((x) => {
      const mesas = mesasDeTorneo(x.tableros, x.dv);
      if (!mesas.length) return;
      if (s.separar || !fila) filaNueva(); else tramoNuevo();
      let grupo = null;
      mesas.forEach((m) => {
        if (lugar >= c.tramos[tramo]) { tramo += 1; lugar = 0; grupo = null; if (tramo >= c.tramos.length) filaNueva(); }
        if (!grupo) { grupo = { torneo: x.torneo, mesas: [] }; fila.grupos.push(grupo); }
        grupo.mesas.push(m);
        if (filas.length > c.filas) sobran += 1;
        lugar += 1;
      });
    });
    return { plano: { v: 1, filas: filas.slice(0, 60), salon: s }, sobran, capacidad: c };
  }

  // Si el plano cabe en el salón, con sus medidas de verdad.
  function medir(plano, salon) {
    const s = limpiarSalon(salon);
    const c = capacidad(s);
    if (!c || !plano || !Array.isArray(plano.filas)) return null;
    const anchos = plano.filas.map((f) => {
      const grupos = (f.grupos || []).filter((g) => g.mesas && g.mesas.length);
      const mesas = grupos.reduce((a, g) => a + g.mesas.length, 0);
      return mesas * s.mesaLargo + Math.max(0, grupos.length - 1) * s.pasilloTramo;
    });
    const n = plano.filas.length;
    const fondo = n ? n * fondoFila(s) + (n - 1) * s.pasilloFila : 0;
    const anchoMax = anchos.length ? Math.max(...anchos) : 0;
    const anchas = anchos.map((a, i) => (a > c.anchoUtil + 1e-6 ? i + 1 : 0)).filter(Boolean);
    const mesas = plano.filas.reduce((a, f) => a + (f.grupos || []).reduce((b, g) => b + (g.mesas || []).length, 0), 0);
    return {
      anchoMax: Math.round(anchoMax * 100) / 100,
      fondo: Math.round(fondo * 100) / 100,
      anchoUtil: Math.round(c.anchoUtil * 100) / 100,
      fondoUtil: Math.round(c.fondoUtil * 100) / 100,
      filas: n,
      filasQueCaben: c.filas,
      filasAnchas: anchas,               // las filas que se salen por los lados
      cabe: !anchas.length && fondo <= c.fondoUtil + 1e-6,
      mesas,
      capacidad: c.mesas,
      ocupacion: c.mesas ? Math.round((mesas / c.mesas) * 100) : 0,
    };
  }

  const conReserva = (n, s) => (n > 0 ? Math.ceil(n * (1 + s.reserva / 100) - 1e-9) : 0);

  // Lo que hay que llevar, contado del plano (el que se ve, con lo corregido).
  function inventario(plano, salon) {
    const s = limpiarSalon(salon);
    const por = new Map();
    ((plano && plano.filas) || []).forEach((f) => (f.grupos || []).forEach((g) => (g.mesas || []).forEach((m) => {
      const clave = g.torneo || "";
      const r = por.get(clave) || { torneo: clave, mesas: 0, partidas: 0 };
      r.mesas += 1;
      r.partidas += (m.t || []).filter(Boolean).length;
      por.set(clave, r);
    })));
    const torneos = [...por.values()].map((r) => {
      // Cada jugador con discapacidad visual juega en una mesa propia (en el
      // peor caso, ninguno juega contra otro): tantas partidas como jugadores.
      const dv = Math.min(s.dv[r.torneo] || 0, r.partidas);
      r.mesasDv = dv;
      // Una partida con un jugador con discapacidad visual pesa como dos: el
      // árbitro anota las jugadas que se cantan y cuida los dos tableros.
      const carga = r.partidas + r.mesasDv;
      return { ...r, dv, arbitros: r.partidas ? Math.max(1, Math.ceil(carga / s.porArbitro - 1e-9)) : 0 };
    });
    const suma = (k) => torneos.reduce((a, r) => a + r[k], 0);
    const partidas = suma("partidas"), mesasDv = suma("mesasDv"), dv = suma("dv");
    const sector = suma("arbitros");
    const adjunto = sector >= 3 ? 1 : 0;
    const arbitros = sector ? sector + 1 + adjunto : 0;
    return {
      torneos,
      partidas,
      jugadores: SILLAS_POR_PARTIDA * partidas,
      mesas: suma("mesas"),
      mesasDv,
      tableros: conReserva(partidas, s),      // uno normal por partida
      piezas: conReserva(partidas, s),
      adaptados: conReserva(dv, s),
      relojes: conReserva(partidas - mesasDv, s),
      parlantes: conReserva(mesasDv, s),
      planillas: conReserva(partidas * s.rondas, s),
      sillas: SILLAS_POR_PARTIDA * partidas + arbitros + s.sillasExtra,
      mesasApoyo: partidas ? 2 + Math.ceil(arbitros / 4) : 0,
      arbitros: { total: arbitros, sector, adjunto, principal: sector ? 1 : 0 },
    };
  }

  const api = { DEFECTO, TABLEROS_POR_MESA, limpiarSalon, capacidad, mesasDeTorneo, borrador, medir, inventario };
  if (enNode) module.exports = api;
  else raiz.PlanoLogistica = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
