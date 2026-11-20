/* El reparto de los árbitros en la sala, sacado del plano (js/centroamericano-plano.js).
 *
 * Desde «Plano de la sala» de centroamericano-mesas.html la organización pide una
 * sugerencia de dónde poner a cada árbitro y, si la aprueba, las mesas de cada uno
 * se le cambian solas en su tablet (centroamericano_reparto_aplicar()). Acá está
 * solo la cuenta, sin pantalla ni base, para que la pruebe el verificador:
 *
 *   1. La carga de cada mesa física: sus tableros en juego en la ronda, cada uno
 *      pesado por la tasa de incidencias de su torneo (suavizada hacia la del
 *      evento: un torneo con pocas partidas no parece un incendio por dos).
 *   2. El recorrido de la sala en serpentina (la fila 1 de derecha a izquierda
 *      y cada fila siguiente desde el extremo más cercano a donde terminó la
 *      anterior, porque las filas no miden lo mismo): lo seguido en la lista es
 *      lo seguido en la sala.
 *   3. Las zonas: el recorrido partido en tantas zonas seguidas como árbitros,
 *      con la carga más pareja posible (la más cargada, lo más liviana que se
 *      pueda) y, dentro de un margen, cortadas en los pasillos y con pocos
 *      torneos por árbitro.
 *   4. Quién va a cada zona: la asignación óptima (algoritmo húngaro) que junta
 *      la experiencia con las zonas de más incidencias y, a igualdad, deja a cada
 *      uno donde ya estaba.
 *   5. Los tramos que salen (torneo, mesa desde, mesa hasta) y lo que cambia
 *      contra lo que ya tienen: qué se actualiza, qué se crea y qué se apaga.
 *
 * Ver «El reparto de los árbitros desde el plano» en docs/decisiones/juegos-y-torneos.md.
 */
(function (raiz) {
  "use strict";
  const enNode = typeof module !== "undefined" && module.exports;

  // Cuánto pesa una incidencia esperada, en partidas: una mesa de un torneo con
  // 0,3 incidencias por partida carga como 1 + 3 × 0,3 = 1,9 partidas tranquilas.
  const PESO_INCIDENCIA = 3;
  // Con cuántas partidas «de la media del evento» se suaviza la tasa de un torneo.
  const SUAVIZADO = 20;
  // Cuánto más que la mejor carga máxima se acepta para cortar mejor las zonas.
  const HOLGURA = 0.08;
  // Cuánto vale quedarse donde ya estaba: solo desempata zonas de dificultad parecida. Con 0,15 una
  // persona en formación se quedaba en una zona con más del doble de incidencias que la más tranquila.
  const SEGUIR = 0.08;
  // Los niveles de experiencia (centroamericano_asignaciones.experiencia).
  const NIVELES = [
    { v: 3, texto: "Internacional (AI)" },
    { v: 2, texto: "FIDE (AF)" },
    { v: 1, texto: "Nacional" },
    { v: 0, texto: "En formación" },
  ];
  const SIN_DATO = 1; // sin dato cuenta como nacional
  const textoNivel = (v) => { const n = NIVELES.find((x) => x.v === v); return n ? n.texto : "Sin dato"; };

  /* ---------------- 1. tasas y cargas ---------------- */

  // filas: [{ tnr, partidas, incidencias }] (centroamericano_reparto_tasas()).
  // Devuelve { global, por: Map(tnr → { tasa, partidas, incidencias }) }.
  function tasas(filas, suavizado = SUAVIZADO) {
    const lista = (filas || []).filter((f) => f && f.tnr);
    const P = lista.reduce((s, f) => s + (Number(f.partidas) || 0), 0);
    const I = lista.reduce((s, f) => s + (Number(f.incidencias) || 0), 0);
    const global = P > 0 ? I / P : 0;
    const por = new Map();
    lista.forEach((f) => {
      const p = Number(f.partidas) || 0, i = Number(f.incidencias) || 0;
      por.set(String(f.tnr), { tasa: (i + suavizado * global) / (p + suavizado), partidas: p, incidencias: i });
    });
    return { global, por };
  }

  // El texto de cada torneo del plano → su tnr, desde los enlaces de la sala.
  function tnrPorTexto(enlaces) {
    const m = new Map();
    (enlaces || []).forEach((e) => {
      const x = e && /chess-results\.com\/tnr(\d+)/i.exec(String(e.url || ""));
      if (x && e.texto) m.set(String(e.texto), x[1]);
    });
    return m;
  }

  /* ---------------- 2. el recorrido ---------------- */

  // Las mesas en el orden en que se caminan, cada una con su carga.
  //   ctx: { tnrDe: Map(texto→tnr), enJuego: Map(tnr→tableros en la ronda) | null,
  //          tasas: resultado de tasas(), peso: PESO_INCIDENCIA }
  function recorrido(plano, ctx) {
    const filas = (plano && plano.filas) || [];
    const lista = [];
    const tasaDe = (tnr) => { const t = ctx.tasas && ctx.tasas.por.get(tnr); return t ? t.tasa : (ctx.tasas ? ctx.tasas.global : 0); };
    const peso = ctx.peso == null ? PESO_INCIDENCIA : ctx.peso;
    // Dónde queda cada mesa a lo ancho, medido desde la derecha en anchos de mesa (las mismas
    // proporciones del dibujo: mesas pegadas, pasillo de casi media mesa). Las filas van alineadas
    // a la derecha y no miden lo mismo: la fila 1 es la más corta.
    const JUNTA = 3 / 46, PASILLO = 20 / 46;
    let fin = 0; // dónde terminó la fila anterior
    filas.forEach((f, fi) => {
      const mesas = [];
      let x0 = 0;
      f.grupos.forEach((g, gi) => g.mesas.forEach((m, mi) => {
        if (mesas.length) x0 += 1 + (mi === 0 ? PASILLO : JUNTA);
        mesas.push({ g, gi, m, mi, x: x0 });
      }));
      if (!mesas.length) return;
      // Se entra a la fila por el extremo más cercano a donde se salió de la anterior: con filas de
      // largo distinto, «ir y volver» a ciegas mandaba al árbitro a la otra punta de la sala.
      if (fi > 0 && Math.abs(mesas[mesas.length - 1].x - fin) < Math.abs(mesas[0].x - fin)) mesas.reverse();
      fin = mesas[mesas.length - 1].x;
      mesas.forEach((x, k) => {
        const tnr = (ctx.tnrDe && ctx.tnrDe.get(x.g.torneo)) || null;
        const tope = tnr && ctx.enJuego && ctx.enJuego.has(tnr) ? ctx.enJuego.get(tnr) : Infinity;
        const tableros = x.m.t.filter((n) => n);
        const jugando = tnr ? tableros.filter((n) => n <= tope) : [];
        const tasa = tnr ? tasaDe(tnr) : 0;
        const anterior = mesas[k - 1];
        lista.push({
          fi, gi: x.gi, mi: x.mi, x: x.x, torneo: x.g.torneo, tnr, tableros, jugando: jugando.length,
          tasa, carga: jugando.length * (1 + peso * tasa), esperadas: jugando.length * tasa,
          // Cortar acá (entre la anterior y esta) es cómodo si hay pasillo o cambia de fila.
          cortePasillo: k === 0 || (anterior && anterior.gi !== x.gi),
        });
      });
    });
    return lista;
  }

  /* ---------------- 3. las zonas ---------------- */

  // Parte `items` (con .carga) en `k` tramos seguidos. Devuelve los cortes: [[i0, j0), [i1, j1)…].
  function partir(items, k) {
    const n = items.length;
    if (!n || k < 1) return [];
    const activos = items.filter((x) => x.carga > 0).length;
    k = Math.max(1, Math.min(k, activos || 1));
    const pre = [0];
    items.forEach((x, i) => pre.push(pre[i] + x.carga));
    const carga = (i, j) => pre[j] - pre[i];
    // Torneos distintos en [i, j): tabla de n × n, para n de unas pocas centenas.
    const distintos = [];
    for (let i = 0; i < n; i++) {
      const fila = new Int16Array(n + 1);
      const vistos = new Set();
      for (let j = i; j < n; j++) { if (items[j].tnr && items[j].jugando) vistos.add(items[j].tnr); fila[j + 1] = vistos.size; }
      distintos.push(fila);
    }
    // Un tramo vacío (sin nada en juego) no se acepta salvo que no haya cómo.
    const vacio = (i, j) => carga(i, j) <= 0;
    // Primera pasada: la carga máxima más baja posible (minimax).
    const INF = Infinity;
    const best = Array.from({ length: k + 1 }, () => new Float64Array(n + 1).fill(INF));
    best[0][0] = 0;
    for (let z = 1; z <= k; z++) {
      for (let j = 1; j <= n; j++) {
        let b = INF;
        for (let i = z - 1; i < j; i++) {
          if (best[z - 1][i] === INF || vacio(i, j)) continue;
          const v = Math.max(best[z - 1][i], carga(i, j));
          if (v < b) b = v;
        }
        best[z][j] = b;
      }
    }
    let tope = best[k][n];
    if (tope === INF) return [[0, n]];
    tope = tope * (1 + HOLGURA) + 1e-9;
    // Segunda pasada: dentro del tope, lo más parejo, cortado en pasillos y con pocos torneos.
    const media = pre[n] / k;
    const costo = (i, j) => {
      const c = carga(i, j);
      const desv = media > 0 ? (c - media) / media : 0;
      const malCorte = i > 0 && !items[i].cortePasillo ? 1 : 0;
      return 2 * desv * desv + 0.6 * malCorte + 0.35 * Math.max(0, distintos[i][j] - 1);
    };
    const dp = Array.from({ length: k + 1 }, () => new Float64Array(n + 1).fill(INF));
    const de = Array.from({ length: k + 1 }, () => new Int32Array(n + 1).fill(-1));
    dp[0][0] = 0;
    for (let z = 1; z <= k; z++) {
      for (let j = 1; j <= n; j++) {
        for (let i = z - 1; i < j; i++) {
          if (dp[z - 1][i] === INF || vacio(i, j) || carga(i, j) > tope) continue;
          const v = dp[z - 1][i] + costo(i, j);
          if (v < dp[z][j]) { dp[z][j] = v; de[z][j] = i; }
        }
      }
    }
    const cortes = [];
    let j = n;
    for (let z = k; z >= 1; z--) { const i = de[z][j]; if (i < 0) return [[0, n]]; cortes.unshift([i, j]); j = i; }
    return cortes;
  }

  // Los tableros de una lista de mesas, juntos en tramos seguidos por torneo.
  function tramos(mesas) {
    const por = new Map();
    mesas.forEach((x) => { if (!x.tnr) return; const s = por.get(x.tnr) || { tnr: x.tnr, torneo: x.torneo, n: [] }; x.tableros.forEach((t) => s.n.push(t)); por.set(x.tnr, s); });
    const out = [];
    por.forEach((s) => {
      const n = [...new Set(s.n)].sort((a, b) => a - b);
      let desde = null, ant = null;
      n.forEach((v) => {
        if (desde == null) { desde = ant = v; return; }
        if (v === ant + 1) { ant = v; return; }
        out.push({ tnr: s.tnr, torneo: s.torneo, desde, hasta: ant });
        desde = ant = v;
      });
      if (desde != null) out.push({ tnr: s.tnr, torneo: s.torneo, desde, hasta: ant });
    });
    return out;
  }

  function zonas(plano, ctx, k) {
    const items = recorrido(plano, ctx);
    return partir(items, k).map(([i, j], z) => {
      const mesas = items.slice(i, j);
      const partidas = mesas.reduce((s, x) => s + x.jugando, 0);
      const esperadas = mesas.reduce((s, x) => s + x.esperadas, 0);
      return {
        n: z + 1, mesas, partidas, esperadas,
        carga: mesas.reduce((s, x) => s + x.carga, 0),
        tasa: partidas ? esperadas / partidas : 0,
        filas: [...new Set(mesas.map((x) => x.fi + 1))],
        tramos: tramos(mesas),
      };
    });
  }

  /* ---------------- 4. quién va a cada zona ---------------- */

  // Asignación de costo mínimo en una matriz cuadrada (Kuhn–Munkres, O(n³)).
  function hungaro(costo) {
    const n = costo.length;
    const u = new Float64Array(n + 1), v = new Float64Array(n + 1);
    const p = new Int32Array(n + 1), camino = new Int32Array(n + 1);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(n + 1).fill(Infinity);
      const usado = new Uint8Array(n + 1);
      do {
        usado[j0] = 1;
        const i0 = p[j0];
        let delta = Infinity, j1 = 0;
        for (let j = 1; j <= n; j++) {
          if (usado[j]) continue;
          const cur = costo[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; camino[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) {
          if (usado[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = camino[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const asignado = new Array(n);
    for (let j = 1; j <= n; j++) if (p[j]) asignado[p[j] - 1] = j - 1;
    return asignado; // asignado[fila] = columna
  }

  // Cuánto de la zona ya lo tiene el árbitro (0 a 1): tableros en juego que ya cubre.
  function yaLoTiene(zona, arbitro) {
    let total = 0, suyas = 0;
    zona.mesas.forEach((x) => x.tableros.forEach((t) => {
      total++;
      if ((arbitro.tramos || []).some((r) => r.tnr === x.tnr && t >= r.desde && t <= r.hasta)) suyas++;
    }));
    return total ? suyas / total : 0;
  }

  // arbitros: [{ clave, nombre, experiencia, tramos: [{ id, tnr, desde, hasta }] }]
  // Devuelve las zonas con su árbitro y por qué.
  function asignar(lista, arbitros, opciones) {
    const op = opciones || {};
    const pesoSeguir = op.seguir == null ? SEGUIR : op.seguir;
    const n = Math.min(lista.length, arbitros.length);
    if (!n) return [];
    const zs = lista.slice(0, n);
    // La dificultad de cada zona de 0 (la más tranquila) a 1 (la de más incidencias).
    const minT = Math.min(...zs.map((z) => z.tasa)), maxT = Math.max(...zs.map((z) => z.tasa));
    const dificil = (z) => (maxT - minT > 1e-9 ? (z.tasa - minT) / (maxT - minT) : 0);
    const exp0 = (a) => (a.experiencia == null ? SIN_DATO : a.experiencia) / 3;
    // La experiencia centrada en la media del grupo: quien tiene menos que la media
    // RESTA en una zona difícil (si no, «en formación» × difícil daría 0 y no la evitaría).
    const media = arbitros.reduce((s, a) => s + exp0(a), 0) / arbitros.length;
    const exp = (a) => exp0(a) - media;
    // Beneficio: experiencia × dificultad de la zona, más quedarse donde ya estaba.
    const beneficio = arbitros.slice(0, Math.max(n, arbitros.length)).map((a) => zs.map((z) => 2 * exp(a) * dificil(z) + pesoSeguir * yaLoTiene(z, a)));
    // Matriz cuadrada de costos (si sobran árbitros, quedan sin zona).
    const m = Math.max(arbitros.length, zs.length);
    const costo = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i < arbitros.length && j < zs.length ? -beneficio[i][j] : 0)));
    const a2z = hungaro(costo);
    const porZona = new Array(zs.length).fill(null);
    a2z.forEach((j, i) => { if (i < arbitros.length && j < zs.length) porZona[j] = arbitros[i]; });
    // El orden de dificultad, para explicar.
    const orden = zs.map((z, i) => i).sort((a, b) => zs[b].tasa - zs[a].tasa);
    return zs.map((z, j) => {
      const a = porZona[j];
      const puesto = orden.indexOf(j) + 1;
      const sigue = a ? yaLoTiene(z, a) : 0;
      return Object.assign({}, z, { arbitro: a, dificultad: puesto, sigue, porque: porQue(z, a, puesto, zs.length, sigue) });
    });
  }

  function porQue(z, a, puesto, total, sigue) {
    const partes = [];
    const tasa = (z.tasa * 100).toFixed(0).replace(".", ",");
    partes.push(puesto === 1 ? "La zona con más incidencias esperadas (" + tasa + " por cada 100 partidas)"
      : puesto === total ? "La zona más tranquila (" + tasa + " incidencias por cada 100 partidas)"
        : "La " + puesto + ".ª de " + total + " en incidencias (" + tasa + " por cada 100 partidas)");
    if (a) partes.push(a.nombre + ": " + textoNivel(a.experiencia == null ? null : a.experiencia) + (a.experiencia == null ? " (cuenta como nacional)" : ""));
    if (sigue >= 0.5) partes.push("ya tenía " + Math.round(sigue * 100) + " % de estas mesas");
    return partes.join(" · ") + ".";
  }

  /* ---------------- 5. lo que cambia ---------------- */

  // Lo que hay que hacer en la base para dejar a cada árbitro con los tramos de su zona.
  //   propuesta: lo que devuelve asignar(); vigentes: las asignaciones activas (filas de la tabla);
  //   torneosDelPlano: Set de tnr que gobierna el plano (lo demás no se toca).
  // Devuelve { acciones: [...], resumen: [...] } con acciones de tres tipos:
  //   { tipo: "actualizar", id, desde, hasta, persona }  { tipo: "crear", tnr, desde, hasta, persona, arbitro, nombrado, vence }
  //   { tipo: "apagar", id }
  function cambios(propuesta, vigentes, torneosDelPlano, nuevoId) {
    const uuid = nuevoId || (() => (raiz.crypto && raiz.crypto.randomUUID ? raiz.crypto.randomUUID() : "p-" + Math.random().toString(16).slice(2)));
    const acciones = [];
    const resumen = [];
    const usadas = new Set();
    const enPlano = (tnr) => torneosDelPlano.has(tnr);
    propuesta.forEach((z) => {
      const a = z.arbitro;
      if (!a) return;
      const suyas = vigentes.filter((v) => (v.persona || v.id) === a.clave);
      const libres = suyas.filter((v) => enPlano(v.tnr));
      // Primera pasada: qué tramo vigente se reusa para cada tramo de la zona, qué se crea y qué se apaga.
      const plan = z.tramos.map((q) => {
        let mejor = null, solape = -1;
        libres.forEach((v) => {
          if (v.tnr !== q.tnr || usadas.has(v.id)) return;
          const s = Math.max(0, Math.min(v.mesa_hasta, q.hasta) - Math.max(v.mesa_desde, q.desde) + 1);
          if (s > solape) { solape = s; mejor = v; }
        });
        if (mejor) usadas.add(mejor.id);
        return { q, v: mejor };
      });
      const apagan = libres.filter((v) => !usadas.has(v.id));
      apagan.forEach((v) => usadas.add(v.id));
      const quedan = suyas.length - apagan.length + plan.filter((x) => !x.v).length;
      // Persona: la que ya tiene; o una nueva si va a quedar con varios tramos, o si se le apaga uno y se le
      // crea otro (sin persona, su tablet no sabría a cuál pasarse: centroamericano_seguir()).
      const yaTiene = suyas.find((v) => v.persona);
      const hace = quedan > 1 || (apagan.length > 0 && plan.some((x) => !x.v));
      const persona = yaTiene ? yaTiene.persona : hace ? uuid() : null;
      // Segunda pasada: las acciones y lo que se le explica.
      const lineas = [];
      plan.forEach(({ q, v }) => {
        if (v) {
          const igual = v.mesa_desde === q.desde && v.mesa_hasta === q.hasta && (v.persona || null) === persona;
          if (!igual) acciones.push({ tipo: "actualizar", id: v.id, desde: q.desde, hasta: q.hasta, persona });
          lineas.push(q.torneo + " " + q.desde + " a " + q.hasta + (igual ? " (igual)" : v.mesa_desde === q.desde && v.mesa_hasta === q.hasta ? " (las mismas)" : " (antes " + v.mesa_desde + " a " + v.mesa_hasta + ")"));
        } else {
          const vence = suyas.reduce((m, x) => (x.vence > m ? x.vence : m), "");
          acciones.push({ tipo: "crear", tnr: q.tnr, desde: q.desde, hasta: q.hasta, persona, arbitro: a.nombre, nombrado: a.nombrado !== false, vence: vence || null, experiencia: a.experiencia });
          lineas.push(q.torneo + " " + q.desde + " a " + q.hasta + " (nuevo)");
        }
      });
      apagan.forEach((v) => {
        // Antes de apagarlo, la misma persona: así su tablet, si lo tenía abierto, sabe a cuál pasarse.
        if (persona && v.persona !== persona) acciones.push({ tipo: "actualizar", id: v.id, desde: v.mesa_desde, hasta: v.mesa_hasta, persona });
        acciones.push({ tipo: "apagar", id: v.id }); lineas.push("se apaga " + (v.torneo || v.tnr) + " " + v.mesa_desde + " a " + v.mesa_hasta);
      });
      // Sus tramos de torneos fuera del plano no cambian de mesas, pero van con la misma persona.
      if (persona) suyas.filter((v) => !enPlano(v.tnr) && v.persona !== persona).forEach((v) => acciones.push({ tipo: "actualizar", id: v.id, desde: v.mesa_desde, hasta: v.mesa_hasta, persona }));
      // Un tramo suyo que sigue vivo después, para avisarle en su tablet (o, si todos son nuevos, su persona).
      const queda = plan.find((x) => x.v) || null;
      const fuera = suyas.find((v) => !enPlano(v.tnr));
      resumen.push({ zona: z.n, arbitro: a.nombre, clave: a.clave, queda: queda ? queda.v.id : fuera ? fuera.id : null, persona, lineas });
    });
    // Los árbitros que quedaron fuera del reparto: sus tramos del plano se apagan (no dos en la misma mesa).
    const fuera = [];
    vigentes.forEach((v) => {
      if (usadas.has(v.id) || !enPlano(v.tnr)) return;
      if (propuesta.some((z) => z.arbitro && z.arbitro.clave === (v.persona || v.id))) return;
      acciones.push({ tipo: "apagar", id: v.id });
      fuera.push(v.arbitro + ": se apaga " + (v.torneo || v.tnr) + " " + v.mesa_desde + " a " + v.mesa_hasta);
    });
    return { acciones, resumen, fuera };
  }

  // Los árbitros (uno por persona, o por enlace suelto) de las asignaciones vigentes.
  function arbitrosDe(vigentes) {
    const por = new Map();
    vigentes.forEach((v) => {
      const clave = v.persona || v.id;
      const a = por.get(clave) || { clave, nombre: v.arbitro, nombrado: v.nombrado !== false, experiencia: null, tramos: [] };
      if (v.experiencia != null && (a.experiencia == null || v.experiencia > a.experiencia)) a.experiencia = v.experiencia;
      a.tramos.push({ id: v.id, tnr: v.tnr, desde: v.mesa_desde, hasta: v.mesa_hasta });
      por.set(clave, a);
    });
    return [...por.values()];
  }

  const api = { PESO_INCIDENCIA, SUAVIZADO, HOLGURA, SEGUIR, NIVELES, textoNivel, tasas, tnrPorTexto, recorrido, partir, tramos, zonas, hungaro, yaLoTiene, asignar, cambios, arbitrosDe };
  if (enNode) module.exports = api;
  else raiz.CentroamericanoReparto = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
