/* Un torneo jugado de verdad, partida por partida, en todas las modalidades.
   Ver «Un torneo de todas las modalidades, jugado de punta a punta» en
   docs/decisiones/juegos-y-torneos.md.

   Los otros verificadores de torneos escriben el resultado del cruce a mano.
   Así no se veía lo que más importa: que una partida que se JUEGA en su página
   termine, que su resultado llegue al torneo y que la ronda se cierre. Por eso
   se escapó que variante.html (Abrazos, Camaleón, Vampiro, A ciegas, Volcanes
   y Misiones) no le avisaba nunca al torneo: la partida terminaba y la ronda
   se quedaba abierta para siempre.

   Una base de mentira que comparten todas las pestañas (en Node, como en
   verificar-juegos-nuevos-en-vivo.js), con lo que hacen los triggers de la
   base: el reloj (proteger_reloj_de_partida, también el del duelo) y la
   modalidad de la ronda (modalidad_de_la_ronda). Realtime entrega los cambios
   a quien escucha, con sus filtros.

     1. Un torneo «Aleatorio» de 11 rondas, una por modalidad: el profe lo
        empieza y arma cada ronda en torneo.html; en cada ronda Ana y Bruno
        abren la partida desde el enlace del torneo, tocan «Estoy listo» y
        juegan de verdad (clics en el tablero; en A ciegas, escribiendo la
        jugada; en Duelo, eligiendo y confirmando) hasta que la partida
        termina en tablas por triple repetición. Se mira en cada una: que los
        dos relojes corrieron, que la pantalla lo dice, que el resultado llegó
        al cruce y que la ronda se cerró sola. Al final el torneo cierra.
     2. La regla de las 50 jugadas, modalidad por modalidad: una partida que
        viene con 49 jugadas sin captura ni peón termina en tablas a la
        jugada siguiente de cada lado, y la pantalla lo dice.
     4. Duelo, los dos a la vez: 30 partidas en que los dos confirman y
        revelan casi en el mismo instante. Antes, guardando el estado entero,
        una de cada ~10 se trababa en «revelando…» (la segunda escritura
        borraba la revelación de la primera); ahora va por duelo_guardar().
     3. La bandera, página por página: con 3 segundos y nadie que mueva, se
        le cae a las blancas y gana el otro. En Duelo, las blancas confirman y
        las negras no: el reloj de quien confirmó se detiene, y la bandera se
        le cae a las negras.

   Uso: con el sitio en localhost:8777 (npm run verificar lo levanta solo),
        node herramientas/verificar-torneo-jugado.js */
"use strict";
const { chromium } = require("playwright");
const { Chess } = require("chess.js");
const path = require("path");

global.window = global.window || {};
global.Chess = Chess;
require(path.join(__dirname, "..", "js", "variantes-engines.js"));
require(path.join(__dirname, "..", "js", "duelo-engine.js"));
const Variantes = global.window.Variantes, DueloSimultaneo = global.window.DueloSimultaneo;

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MODOS = ["estandar", "crazyhouse", "cartas", "duelo", "niebla", "abrazos", "camaleon", "vampiro", "ciegas", "volcanes", "misiones"];
const PAGINA = { estandar: "estandar.html", crazyhouse: "crazyhouse.html", cartas: "cartas.html", duelo: "duelo.html", niebla: "niebla.html" };
const paginaDe = (v) => PAGINA[v] || "variante.html";
const PERSONAS = {
  "u-profe": { id: "u-profe", full_name: "Profe Oscar", email: "profe@x.cr", role: "profesor", is_admin: false },
  "u-ana": { id: "u-ana", full_name: "Ana Rojas", email: "ana@x.cr", role: "alumno", is_admin: false },
  "u-bruno": { id: "u-bruno", full_name: "Bruno Mena", email: "bruno@x.cr", role: "alumno", is_admin: false },
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✅ " + nombre); return; }
  fallos++;
  console.log("  ❌ " + nombre + (detalle !== undefined ? "  →  " + JSON.stringify(detalle).slice(0, 600) : ""));
}
async function hasta(cond, ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (await cond()) return true; await esperar(100); }
  return false;
}

/* ============================================================ la base */
function crearServidor(tablas) {
  const canales = new Map();
  const rechazos = [];
  let siguiente = 1;
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const ahora = () => new Date().toISOString();

  // Una columna, o un camino dentro de un JSON como PostgREST: "duelo_state->>round".
  function leer(fila, col) {
    const partes = String(col).split(/->>?/);
    let v = fila[partes[0]];
    for (const k of partes.slice(1)) v = v == null ? null : v[k];
    return v === undefined ? null : v;
  }
  function cumple(fila, filtros) {
    return filtros.every(([op, col, val]) => {
      const v = leer(fila, col);
      if (op === "eq") return String(v) === String(val);
      if (op === "neq") return String(v) !== String(val);
      if (op === "in") return (val || []).map(String).includes(String(v));
      if (op === "is") return v === val;
      return true;
    });
  }

  // Lo que hace public.proteger_reloj_de_partida() en game_rooms (con el duelo).
  function relojDePartida(viejo, nuevo) {
    const tol = 2;
    if (nuevo.clock_updated_at !== viejo.clock_updated_at && nuevo.clock_updated_at) nuevo.clock_updated_at = ahora();
    const pasado = viejo.clock_updated_at ? Math.max(0, (Date.now() - Date.parse(viejo.clock_updated_at)) / 1000) : 0;
    if (!viejo.clock_updated_at && !nuevo.clock_updated_at && nuevo.initial_seconds != null && nuevo.white_ready && nuevo.black_ready) nuevo.clock_updated_at = ahora();
    const duelo = viejo.variant === "duelo";
    const cv = (viejo.duelo_state && viejo.duelo_state.commit) || {}, cn = (nuevo.duelo_state && nuevo.duelo_state.commit) || {};
    if (viejo.status === "playing" && viejo.clock_updated_at) {
      if (nuevo.fen !== viejo.fen) {
        const m = String(viejo.fen).split(" ")[1];
        const q = m === "w" ? viejo.white_time_left : m === "b" ? viejo.black_time_left : null;
        if (q != null && q - pasado < -tol) return "Se te acabó el tiempo antes de esta jugada";
      }
      if (duelo) for (const c of ["w", "b"]) {
        if (!cv[c] && cn[c]) {
          const q = c === "w" ? viejo.white_time_left : viejo.black_time_left;
          if (q != null && q - pasado < -tol) return "Se te acabó el tiempo antes de esta jugada";
        }
      }
    }
    let correW = 0, correB = 0;
    if (viejo.status === "playing" && viejo.clock_updated_at) {
      if (duelo) { correW = cv.w ? 0 : pasado; correB = cv.b ? 0 : pasado; }
      else {
        const m = String((viejo.cartas_state && viejo.cartas_state.fen) || viejo.fen || "").split(" ")[1];
        correW = m === "b" ? 0 : pasado; correB = m === "w" ? 0 : pasado;
      }
    }
    for (const [k, corre, quien] of [["white_time_left", correW, "blancas"], ["black_time_left", correB, "negras"]]) {
      if (nuevo[k] === viejo[k] || viejo[k] == null) continue;
      if ((nuevo[k] || 0) < viejo[k] - corre - tol) return "Todavía le queda tiempo a las " + quien;
      if (nuevo[k] > Math.max(viejo[k] - pasado, 0) + (viejo.increment_seconds || 0) + tol) return "Tiempo restante inválido (" + quien + ")";
    }
    return null;
  }

  // Lo que hace interno.modalidad_de_la_ronda() en tournament_rounds.
  function modalidadDeLaRonda(fila, viejo) {
    if (viejo) { fila.variant = viejo.variant; return null; }
    const t = tablas.tournaments.find((x) => x.id === fila.tournament_id);
    if (!t) return null;
    if (t.variant !== "aleatorio") fila.variant = t.variant;
    else if (!fila.variant) return "En un torneo aleatorio cada ronda lleva su modalidad";
    else if (MODOS.indexOf(fila.variant) === -1) return "tournament_rounds_variant_check";
    return null;
  }

  function filtroDeCanal(f) {
    const m = /^(\w+)=(eq|in)\.(.+)$/.exec(f || "");
    if (!m) return () => true;
    if (m[2] === "eq") return (fila) => String(fila[m[1]]) === m[3];
    const lista = m[3].replace(/^\(|\)$/g, "").split(",");
    return (fila) => lista.includes(String(fila[m[1]]));
  }
  function repartir(tabla, evento, fila) {
    for (const c of canales.values()) {
      for (const f of c.filtros) {
        if (f.table !== tabla || (f.event !== evento && f.event !== "*")) continue;
        if (!filtroDeCanal(f.filter)(fila)) continue;
        const dato = copia(fila);
        setTimeout(() => {
          if (!c.page.isClosed()) c.page.evaluate(([id, ev, d]) => window.__entregar && window.__entregar(id, ev, d), [c.id, evento, dato]).catch(() => {});
        }, 20 + Math.random() * 60);
      }
    }
  }

  const DEFECTOS = {
    game_rooms: () => ({ status: "playing", result: null, moves: [], fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1", white_ready: false, black_ready: false, clock_updated_at: null, variant_state: null, created_at: ahora(), updated_at: ahora() }),
    tournament_rounds: () => ({ status: "in_progress", created_at: ahora() }),
    tournament_pairings: () => ({ result: null, needs_manual_advance: false, advance_id: null, game_room_id: null, finished_at: null }),
  };

  async function atender(page, usuario, p) {
    await esperar(5 + Math.random() * 25);
    if (p.op === "rpc") {
      const a = p.args || {};
      if (p.nombre === "hora_servidor_ms") return { data: Date.now(), error: null };
      if (p.nombre === "nombres_de_jugadores") return { data: (a.p_ids || []).map((id) => ({ id, nombre: (PERSONAS[id] || {}).full_name || id })), error: null };
      if (p.nombre === "mis_funciones_coordinacion") return { data: [], error: null };
      // Lo que hace public.duelo_guardar(): solo la parte propia, sobre la fila
      // como está ahora (las dos escrituras a la vez se suman), y en su ronda.
      if (p.nombre === "duelo_guardar") {
        const i = tablas.game_rooms.findIndex((g) => g.id === a.p_sala && g.variant === "duelo");
        const vieja = tablas.game_rooms[i];
        const color = vieja && (vieja.white_id === usuario ? "w" : vieja.black_id === usuario ? "b" : null);
        if (!color) return { data: null, error: { message: "No juegas esta partida" } };
        if (vieja.status !== "playing" || (vieja.duelo_state || {}).round !== a.p_ronda) return { data: [], error: null };
        const nueva = copia(vieja);
        nueva.duelo_state[a.p_parte] = Object.assign({}, nueva.duelo_state[a.p_parte] || {}, { [color]: copia(a.p_valor) });
        if (a.p_tiempo != null) nueva[color === "w" ? "white_time_left" : "black_time_left"] = a.p_tiempo;
        nueva.updated_at = ahora();
        const error = relojDePartida(vieja, nueva);
        if (error) { rechazos.push(error); return { data: null, error: { message: error } }; }
        tablas.game_rooms[i] = nueva;
        repartir("game_rooms", "UPDATE", nueva);
        return { data: [copia(nueva)], error: null };
      }
      return { data: null, error: null };
    }
    if (p.op === "suscribir") {
      canales.set(usuario + "/" + p.pagina + "/" + p.id, { page, id: p.id, filtros: p.filtros });
      setTimeout(() => page.evaluate((id) => window.__entregar && window.__entregar(id, "estado", "SUBSCRIBED"), p.id).catch(() => {}), 40);
      return { data: null, error: null };
    }
    if (p.op === "quitar") { canales.delete(usuario + "/" + p.pagina + "/" + p.id); return { data: null, error: null }; }

    const filas = tablas[p.tabla] || (tablas[p.tabla] = []);
    if (p.op === "select") {
      let r = filas.filter((f) => cumple(f, p.filtros));
      if (p.orden) r = r.slice().sort((x, y) => (x[p.orden.c] < y[p.orden.c] ? -1 : x[p.orden.c] > y[p.orden.c] ? 1 : 0) * (p.orden.asc ? 1 : -1));
      if (p.limite) r = r.slice(0, p.limite);
      r = copia(r);
      return { data: p.unica ? (r[0] || null) : r, error: null };
    }
    if (p.op === "insert") {
      const nuevas = (Array.isArray(p.carga) ? p.carga : [p.carga]).map((f) => Object.assign({ id: p.tabla + "-" + (siguiente++) }, DEFECTOS[p.tabla] ? DEFECTOS[p.tabla]() : {}, copia(f)));
      for (const n of nuevas) {
        if (p.tabla === "tournament_rounds") {
          const error = modalidadDeLaRonda(n, null);
          if (error) { rechazos.push(error); return { data: null, error: { message: error } }; }
          if (filas.some((x) => x.tournament_id === n.tournament_id && x.round_number === n.round_number)) return { data: null, error: { message: "duplicate key" } };
        }
        if (p.tabla === "game_rooms") {
          if (MODOS.indexOf(n.variant) === -1) return { data: null, error: { message: "game_rooms_variant_check" } };
          if (n.clock_updated_at) n.clock_updated_at = ahora();
          // Volcanes: un volcán fijo y lejos de los caballos, para que la
          // partida de prueba se juegue igual cada vez.
          if (n.variant === "volcanes") n.variant_state = Object.assign({}, n.variant_state || {}, { volcanes: ["a4"] });
        }
      }
      nuevas.forEach((n) => { filas.push(n); repartir(p.tabla, "INSERT", n); });
      return { data: p.select ? (p.unica ? copia(nuevas[0]) : copia(nuevas)) : null, error: null };
    }
    if (p.op === "update") {
      const tocadas = [];
      for (let i = 0; i < filas.length; i++) {
        const vieja = filas[i];
        if (!cumple(vieja, p.filtros)) continue;
        const nueva = Object.assign({}, vieja, copia(p.cambio));
        let error = null;
        if (p.tabla === "game_rooms") error = relojDePartida(vieja, nueva);
        if (p.tabla === "tournament_rounds") modalidadDeLaRonda(nueva, vieja);
        if (error) { rechazos.push(error); return { data: null, error: { message: error } }; }
        filas[i] = nueva;
        tocadas.push(nueva);
        repartir(p.tabla, "UPDATE", nueva);
      }
      return { data: p.select ? (p.unica ? (copia(tocadas[0]) || null) : copia(tocadas)) : null, error: null };
    }
    if (p.op === "delete") {
      tablas[p.tabla] = filas.filter((f) => !cumple(f, p.filtros));
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }
  return { tablas, rechazos, atender };
}

/* ============================================================ la pestaña */
function doble(usuario, pagina) {
  return `
(function () {
  const USUARIO = ${JSON.stringify(usuario)}, PAGINA = ${JSON.stringify(pagina)};
  const canales = {};
  let siguiente = 0;
  window.__entregar = (id, ev, dato) => {
    const c = canales[id];
    if (!c) return;
    if (ev === "estado") { if (c.cb) c.cb(dato); return; }
    c.oyentes.forEach((o) => { if (o.event === ev || o.event === "*") o.fn({ new: dato, eventType: ev }); });
  };
  function constructor(tabla) {
    const p = { op: "select", tabla, filtros: [], unica: false, select: false };
    const b = {
      select() { if (p.op !== "select") p.select = true; return b; },
      eq(c, v) { p.filtros.push(["eq", c, v]); return b; },
      neq(c, v) { p.filtros.push(["neq", c, v]); return b; },
      in(c, v) { p.filtros.push(["in", c, v]); return b; },
      is(c, v) { p.filtros.push(["is", c, v]); return b; },
      not() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; }, gt() { return b; }, lt() { return b; },
      order(c, o) { p.orden = { c, asc: !o || o.ascending !== false }; return b; },
      limit(n) { p.limite = n; return b; }, range() { return b; },
      insert(f) { p.op = "insert"; p.carga = f; return b; }, upsert(f) { p.op = "insert"; p.carga = f; return b; },
      update(cambio) { p.op = "update"; p.cambio = cambio; return b; },
      delete() { p.op = "delete"; return b; },
      maybeSingle() { p.unica = true; return b; }, single() { p.unica = true; return b; },
      then(res, rej) { return window.__srv(p).then(res, rej); },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: USUARIO }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: USUARIO } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
      mfa: { getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" } }) },
    },
    from: (t) => constructor(t),
    rpc: (nombre, args) => {
      const pr = window.__srv({ op: "rpc", nombre, args: args || {} });
      return { then: (a, b) => pr.then(a, b), maybeSingle: () => pr, single: () => pr };
    },
    channel: () => {
      const id = "c" + (++siguiente);
      const c = { id, oyentes: [], filtros: [], cb: null };
      const api = {
        on(tipo, cfg, fn) { if (tipo === "postgres_changes") { c.oyentes.push({ event: cfg.event, fn }); c.filtros.push({ table: cfg.table, event: cfg.event, filter: cfg.filter || null }); } return api; },
        subscribe(cb) { c.cb = cb || null; canales[id] = c; window.__srv({ op: "suscribir", id, filtros: c.filtros, pagina: PAGINA }); return api; },
        unsubscribe() { delete canales[id]; window.__srv({ op: "quitar", id, pagina: PAGINA }); return Promise.resolve(); },
        track() { return Promise.resolve(); }, presenceState() { return {}; }, send() { return Promise.resolve(); },
      };
      return api;
    },
    removeChannel: (api) => { if (api && api.unsubscribe) api.unsubscribe(); return Promise.resolve(); },
    getChannels: () => [],
  };
  try { localStorage.setItem("oscarMoveHelpShown_v1", "1"); } catch (e) {}
})();
`;
}

/* ============================================================ el jugador */
/* Juega de verdad, como una persona: toca «Estoy listo» y, cuando le toca,
   hace clic en la pieza y en la casilla (en A ciegas escribe la jugada; en
   Duelo elige y confirma). Sigue un guion que repite la posición: los
   caballos van y vuelven. `quieto`: solo toca «Estoy listo». `soloDuelo`:
   en Duelo confirma una jugada y no hace nada más. */
const GUIONES = {
  comun: { w: { inicio: [], ciclo: ["g1f3", "f3g1"] }, b: { inicio: [], ciclo: ["g8f6", "f6g8"] } },
  // En Camaleón un caballo en la columna f mueve como alfil: en la h, como torre.
  camaleon: { w: { inicio: ["g1h3"], ciclo: ["h3h4", "h4h3"] }, b: { inicio: ["g8h6"], ciclo: ["h6h5", "h5h6"] } },
};
const JUGADOR = (modo, opciones) => `
(function () {
  const MODO = ${JSON.stringify(modo)}, OP = ${JSON.stringify(opciones || {})};
  const G = ${JSON.stringify(GUIONES)}[MODO === "camaleon" ? "camaleon" : "comun"];
  const jugada = (c, k) => { const g = G[c]; return k < g.inicio.length ? g.inicio[k] : g.ciclo[(k - g.inicio.length) % g.ciclo.length]; };
  let listo = false, pensandoHasta = 0, enVuelo = -1, comprometida = 0;
  setInterval(() => {
    let r, b, c;
    try { r = room; b = board; c = myColor; } catch (x) { return; }
    if (!r || !b || !c || r.status !== "playing") return;
    const boton = document.getElementById("ready-btn");
    if (!listo && boton && boton.checkVisibility()) { listo = true; setTimeout(() => boton.click(), 50 + Math.random() * 200); return; }
    if (OP.quieto) return;
    if (MODO === "duelo") {
      const g = b.game;
      if (!g || g.gameOver || g.commit[c] || b.locked || !b._canActNow()) { pensandoHasta = 0; return; }
      if (OP.soloDuelo && comprometida) return;
      if (!pensandoHasta) { pensandoHasta = Date.now() + 150 + Math.random() * 250; return; }
      if (Date.now() < pensandoHasta) return;
      pensandoHasta = 0;
      const m = jugada(c, (g.round || 1) - 1);
      b._onSquareClick(m.slice(0, 2)); b._onSquareClick(m.slice(2, 4));
      if (b.staged) { comprometida++; document.getElementById("confirm-btn").click(); }
      return;
    }
    const n = (r.moves || []).length;
    if (n === enVuelo) return;  // la jugada propia todavía viaja
    const miTurno = MODO === "ciegas" ? (r.white_ready && r.black_ready && engine.turn() === c) : b._canActNow();
    if (!miTurno) { pensandoHasta = 0; return; }
    if (!pensandoHasta) { pensandoHasta = Date.now() + 150 + Math.random() * 250; return; }
    if (Date.now() < pensandoHasta) return;
    pensandoHasta = 0;
    const m = jugada(c, Math.floor(n / 2));
    enVuelo = n;
    if (MODO === "ciegas") {
      document.getElementById("ciegas-input").value = m;
      document.getElementById("ciegas-form").requestSubmit();
    } else {
      b._onSquareClick(m.slice(0, 2)); b._onSquareClick(m.slice(2, 4));
    }
  }, 60);
})();
`;

async function abrirJugadores(browser, srv, url, modo, opciones) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1000, height: 1100 } });
  const pestañas = [];
  for (const usuario of ["u-ana", "u-bruno"]) {
    const page = await ctx.newPage();
    await page.exposeBinding("__srv", (fuente, pedido) => srv.atender(fuente.page, usuario, pedido));
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.addInitScript(doble(usuario, usuario));
    await page.addInitScript(JUGADOR(modo, typeof opciones === "function" ? opciones(usuario) : opciones));
    pestañas.push({ page, errores, usuario });
  }
  await Promise.all(pestañas.map((p) => p.page.goto(BASE + "/" + url, { waitUntil: "load" })));
  return { ctx, pestañas };
}

function tablasIniciales(torneo) {
  return {
    tournaments: torneo ? [torneo] : [],
    tournament_registrations: torneo ? ["u-ana", "u-bruno"].map((id, i) => ({ id: "reg-" + i, tournament_id: torneo.id, player_id: id, registered_at: "2026-10-17T10:0" + i })) : [],
    tournament_rounds: [], tournament_pairings: [], game_rooms: [], misiones_secretas: [], public_tournament_champions: [],
    profiles: Object.values(PERSONAS),
  };
}

/* ============================================================ 1. el torneo */
async function torneo(browser) {
  const RONDAS = MODOS.length;
  console.log("\n▶ Un torneo «Aleatorio» de " + RONDAS + " rondas, jugado partida por partida");
  const srv = crearServidor(tablasIniciales({
    id: "t1", name: "Copa de todas las modalidades", format: "swiss", variant: "aleatorio", modos_aleatorio: null,
    status: "registration", created_by: "u-profe", initial_seconds: 120, increment_seconds: 0, current_round: 0, total_rounds: null, winner_ids: null,
  }));
  const T = srv.tablas;
  const ctxProfe = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1100, height: 1300 } });
  const profe = await ctxProfe.newPage();
  await profe.exposeBinding("__srv", (fuente, pedido) => srv.atender(fuente.page, "u-profe", pedido));
  const erroresProfe = [];
  profe.on("pageerror", (e) => erroresProfe.push(String(e)));
  await profe.addInitScript(doble("u-profe", "torneo"));
  await profe.goto(BASE + "/torneo.html?id=t1", { waitUntil: "load" });
  await hasta(async () => profe.locator("#start-btn").isVisible(), 8000);
  await profe.fill("#rounds-input", String(RONDAS));
  await profe.click("#start-btn");

  const problemas = [];
  const jugadas = [];
  for (let n = 1; n <= RONDAS; n++) {
    const hay = await hasta(async () => {
      const ronda = T.tournament_rounds.find((r) => r.round_number === n);
      return !!ronda && T.tournament_pairings.some((p) => p.round_id === ronda.id && p.game_room_id);
    }, 15000);
    if (!hay) { problemas.push("no se armó la ronda " + n); break; }
    const ronda = T.tournament_rounds.find((r) => r.round_number === n);
    const cruce = T.tournament_pairings.find((p) => p.round_id === ronda.id);
    const sala = () => T.game_rooms.find((s) => s.id === cruce.game_room_id);
    const modo = ronda.variant;
    // El enlace que ofrece el torneo es el que se abre.
    await hasta(async () => (await profe.locator("#rounds-container a[href*='?room=" + cruce.game_room_id + "']").count()) > 0, 8000);
    const href = await profe.locator("#rounds-container a[href*='?room=" + cruce.game_room_id + "']").first().getAttribute("href").catch(() => null);
    const p = { ronda: n, modo, enlace: href };
    if (!href || !href.startsWith(paginaDe(modo) + "?room=")) problemas.push({ ronda: n, modo, enlace: href });

    const { ctx, pestañas } = await abrirJugadores(browser, srv, href || paginaDe(modo) + "?room=" + cruce.game_room_id, modo);
    const arranco = await hasta(async () => !!sala().clock_updated_at, 10000);
    const termino = await hasta(async () => sala().status === "finished", 90000);
    const s = sala();
    p.jugadas = (s.moves || []).length + (s.duelo_state ? (s.duelo_state.round || 1) - 1 : 0);
    p.resultado = s.result;
    p.relojes = [s.white_time_left, s.black_time_left];
    // Lo que dicen las dos pantallas.
    await esperar(600);
    p.pantallas = [];
    for (const x of pestañas) p.pantallas.push(await x.page.evaluate(() => document.getElementById("status-banner").textContent).catch(() => ""));
    // El resultado llega al cruce y la ronda se cierra sola.
    const alCruce = await hasta(async () => T.tournament_pairings.find((q) => q.id === cruce.id).result === "draw", 10000);
    const cerrada = await hasta(async () => T.tournament_rounds.find((r) => r.id === ronda.id).status === "finished", 10000);
    const errores = pestañas.reduce((a, x) => a.concat(x.errores), []);
    const fallo = [];
    if (!arranco) fallo.push("el reloj no arrancó");
    if (!termino) fallo.push("no terminó");
    if (s.result !== "draw") fallo.push("resultado " + s.result);
    if (!(s.white_time_left < 120 && s.black_time_left < 120)) fallo.push("los relojes no corrieron " + JSON.stringify(p.relojes));
    if (!p.pantallas.every((t) => /triple repetici/i.test(t))) fallo.push("la pantalla no dice la repetición " + JSON.stringify(p.pantallas));
    if (!alCruce) fallo.push("el resultado no llegó al cruce");
    if (!cerrada) fallo.push("la ronda no se cerró");
    if (errores.length) fallo.push("errores de JS: " + errores.join(" | ").slice(0, 300));
    if (fallo.length) problemas.push({ ronda: n, modo, fallo });
    jugadas.push(p);
    console.log("     ronda " + n + ": " + modo + " — " + (fallo.length ? "❌ " + fallo.join("; ") : "tablas por repetición en " + p.jugadas + " jugadas, relojes " + p.relojes.map((x) => Math.round(x * 10) / 10).join(" / ")));
    await ctx.close();
    if (n === RONDAS) break;
    // El profe arma la ronda siguiente, sin recargar: le llega por Realtime.
    const lista = await hasta(async () => {
      const b = profe.locator("#generate-round-btn");
      return (await b.isVisible()) && !(await b.isDisabled()) && (await b.textContent()).includes("Generar ronda " + (n + 1));
    }, 15000);
    if (!lista) { problemas.push("el profe no ve «Generar ronda " + (n + 1) + "»"); break; }
    await profe.click("#generate-round-btn");
  }

  const modos = T.tournament_rounds.slice().sort((a, b) => a.round_number - b.round_number).map((r) => r.variant);
  ok("cada partida se jugó en su página hasta tablas por repetición, con los dos relojes corriendo, y su resultado cerró la ronda", problemas.length === 0, problemas);
  ok("se jugaron las " + RONDAS + " rondas", jugadas.length === RONDAS, modos);
  ok("una modalidad distinta en cada ronda: las " + MODOS.length, new Set(modos).size === MODOS.length, modos);
  await hasta(async () => T.tournaments[0].status === "finished", 10000);
  const t = T.tournaments[0];
  ok("el torneo terminó, con los dos de campeones (todo tablas)", t.status === "finished" && (t.winner_ids || []).length === 2, { status: t.status, winner_ids: t.winner_ids });
  const banner = await profe.locator("#finished-banner").evaluate((e) => e.checkVisibility()).catch(() => false);
  ok("el profe ve el cartel de torneo terminado sin recargar", banner);
  ok("la base no rechazó ninguna escritura", srv.rechazos.length === 0, srv.rechazos);
  ok("sin errores de JavaScript en torneo.html", erroresProfe.length === 0, erroresProfe);
  await ctxProfe.close();
}

/* ============================================================ 2. las 50 jugadas */
function salaSuelta(variant, extra) {
  return Object.assign({
    id: "s-" + variant, variant, white_id: "u-ana", black_id: "u-bruno", status: "playing", result: null, moves: [],
    fen: INICIAL, initial_seconds: 120, increment_seconds: 0, white_time_left: 120, black_time_left: 120,
    clock_updated_at: null, white_ready: false, black_ready: false, created_by: "u-profe", variant_state: null,
  }, extra || {});
}
// Cada modalidad con 49 jugadas (98 medias) sin captura ni peón.
function con98(variant) {
  const f98 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 98 60";
  if (variant === "crazyhouse") return { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 98 60" };
  if (variant === "cartas") return { cartas_state: { fen: f98, hands: { w: [], b: [] }, discard: [], deck: [], frozenSquare: null, shieldedSquare: null, kingLeapAvailable: false, doubleTurnPending: false, visionUntil: null, cardPlayedThisTurn: false } };
  if (variant === "duelo") { const g = new DueloSimultaneo.Game().toJSON(); g.sinAvance = 49; return { duelo_state: g }; }
  if (variant === "camaleon") return { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 98 60" };
  if (variant === "abrazos") { const d = JSON.parse(Variantes.inicio("abrazos")); d.s = 98; d.n = 60; return { fen: JSON.stringify(d) }; }
  if (variant === "volcanes") return { fen: f98, variant_state: { volcanes: ["a4"] } };
  return { fen: f98 };
}
async function cincuenta(browser) {
  console.log("\n▶ La regla de las 50 jugadas, en cada modalidad");
  const malos = [];
  await Promise.all(MODOS.map(async (modo) => {
    const srv = crearServidor(tablasIniciales(null));
    srv.tablas.game_rooms.push(salaSuelta(modo, con98(modo)));
    const s = () => srv.tablas.game_rooms[0];
    const { ctx, pestañas } = await abrirJugadores(browser, srv, paginaDe(modo) + "?room=" + s().id, modo);
    const termino = await hasta(async () => s().status === "finished", 30000);
    await esperar(800);
    const textos = [];
    for (const x of pestañas) textos.push(await x.page.evaluate(() => document.getElementById("status-banner").textContent).catch(() => ""));
    const errores = pestañas.reduce((a, x) => a.concat(x.errores), []);
    const jugadas = (s().moves || []).length || ((s().duelo_state || {}).round || 1) - 1;
    if (!termino || s().result !== "draw" || !textos.every((t) => /50 jugadas/.test(t)) || errores.length || srv.rechazos.length)
      malos.push({ modo, estado: s().status, resultado: s().result, jugadas, textos, errores, rechazos: srv.rechazos });
    await ctx.close();
  }));
  ok("en las " + MODOS.length + " modalidades, la jugada 50 sin captura ni peón termina en tablas y la pantalla lo dice", malos.length === 0, malos);
}

/* ============================================================ 3. la bandera */
async function bandera(browser) {
  console.log("\n▶ La bandera, en cada página (3 segundos y nadie mueve)");
  const malos = [];
  const casos = ["estandar", "crazyhouse", "cartas", "niebla", "abrazos", "camaleon", "vampiro", "ciegas", "volcanes", "misiones", "duelo"];
  await Promise.all(casos.map(async (modo) => {
    const srv = crearServidor(tablasIniciales(null));
    const extra = { initial_seconds: 3, white_time_left: 3, black_time_left: 3 };
    if (modo === "cartas") extra.cartas_state = { fen: INICIAL, hands: { w: [], b: [] }, discard: [], deck: [], frozenSquare: null, shieldedSquare: null, kingLeapAvailable: false, doubleTurnPending: false, visionUntil: null, cardPlayedThisTurn: false };
    if (modo === "duelo") extra.duelo_state = new DueloSimultaneo.Game().toJSON();
    if (modo === "crazyhouse") extra.fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1";
    if (modo === "camaleon" || modo === "abrazos") extra.fen = Variantes.inicio(modo);
    if (modo === "volcanes") extra.variant_state = { volcanes: ["a4"] };
    srv.tablas.game_rooms.push(salaSuelta(modo, extra));
    const s = () => srv.tablas.game_rooms[0];
    // En Duelo las blancas confirman su jugada (su reloj se detiene) y las negras no.
    const { ctx, pestañas } = await abrirJugadores(browser, srv, paginaDe(modo) + "?room=" + s().id, modo,
      (u) => modo === "duelo" ? (u === "u-ana" ? { soloDuelo: true } : { quieto: true }) : { quieto: true });
    // Confirmada la jugada, «Comprometer» y «Cambiar» se van de la pantalla.
    let botonesQuedan = false;
    if (modo === "duelo") {
      const ana = pestañas.find((x) => x.usuario === "u-ana").page;
      await hasta(async () => !!(s().duelo_state.commit || {}).w, 10000);
      await esperar(300);
      botonesQuedan = await ana.evaluate(() => ["stage-controls", "confirm-btn", "change-btn"].some((id) => document.getElementById(id).checkVisibility()));
    }
    const termino = await hasta(async () => s().status === "finished", 20000);
    await esperar(600);
    const esperado = modo === "duelo" ? "white" : "black";
    const caido = modo === "duelo" ? s().black_time_left : s().white_time_left;
    const otro = modo === "duelo" ? s().white_time_left : s().black_time_left;
    const errores = pestañas.reduce((a, x) => a.concat(x.errores), []);
    if (!termino || s().result !== esperado || caido !== 0 || !(otro > 0) || errores.length || botonesQuedan)
      malos.push({ modo, botonesQuedan, estado: s().status, resultado: s().result, relojes: [s().white_time_left, s().black_time_left], errores, rechazos: srv.rechazos });
    await ctx.close();
  }));
  ok("en las 11 modalidades el reloj corre y la bandera termina la partida (en Duelo, el reloj de quien confirmó se detiene y sus botones de comprometer se van)", malos.length === 0, malos);
}

/* ============================================================ 4. el duelo a la vez */
async function dueloALaVez(browser) {
  const N = 30;
  console.log("\n▶ Duelo: " + N + " partidas en que los dos confirman y revelan a la vez");
  const trabadas = [];
  for (let tanda = 0; tanda < N; tanda += 10) {
    await Promise.all(Array.from({ length: Math.min(10, N - tanda) }, async (_, k) => {
      const srv = crearServidor(tablasIniciales(null));
      srv.tablas.game_rooms.push(salaSuelta("duelo", con98("duelo")));
      const s = () => srv.tablas.game_rooms[0];
      const { ctx, pestañas } = await abrirJugadores(browser, srv, "duelo.html?room=s-duelo", "duelo");
      const termino = await hasta(async () => s().status === "finished", 20000);
      const errores = pestañas.reduce((a, x) => a.concat(x.errores), []);
      if (!termino || errores.length) {
        const d = s().duelo_state || {};
        trabadas.push({ partida: tanda + k + 1, commit: Object.keys(d.commit || {}).filter((c) => d.commit[c]), reveal: Object.keys(d.reveal || {}).filter((c) => d.reveal[c]), errores });
      }
      await ctx.close();
    }));
  }
  ok("las " + N + " terminan: ningún compromiso ni revelación se pierde", trabadas.length === 0, trabadas);
}

async function correr(prueba, ...args) {
  try { await prueba(...args); }
  catch (e) { fallos++; console.log("  ❌ " + prueba.name + " se cayó: " + String(e && e.message || e).split("\n")[0]); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const solo = process.argv[2];
    if (!solo || solo === "torneo") await correr(torneo, browser);
    if (!solo || solo === "cincuenta") await correr(cincuenta, browser);
    if (!solo || solo === "bandera") await correr(bandera, browser);
    if (!solo || solo === "duelo") await correr(dueloALaVez, browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n❌ " + fallos + " comprobación(es) fallaron" : "\n✅ Todo en orden");
  process.exit(fallos ? 1 : 0);
})();
