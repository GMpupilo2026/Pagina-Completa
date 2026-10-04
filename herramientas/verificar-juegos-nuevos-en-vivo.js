/* Los juegos nuevos jugados de verdad: dos o tres pestañas por partida contra
   un servidor de mentira que hace de base y de Realtime para todas, con las
   reglas del trigger del reloj (public.proteger_reloj_de_partida()) y de las
   funciones del relevo.

   POR QUÉ EXISTE
   verificar-juegos-nuevos.js abre cada pantalla sola, sin reloj y con la
   base quieta. Lo que se rompe callado está en otro lado: el reloj que corre
   para quien no tiene el turno, una jugada que el trigger rechaza («Tiempo
   restante inválido») y la partida se queda trabada, una pantalla que no se
   entera de la jugada del rival, el volcán que en una pantalla quema y en la
   otra no, o un relevo donde mueve quien no le toca.

   QUÉ MIDE
   1. Volcanes con reloj (3 min + 2 s): los dos tocan «Estoy listo» y el
      reloj arranca recién ahí; mientras piensa el rival, en la pantalla
      propia baja SU reloj y no el propio (medido en el texto del reloj); se
      juegan 30 medias jugadas al azar —pasan por cuatro erupciones—; el
      trigger no rechaza ninguna escritura; las dos pantallas terminan igual
      que la base, y la planilla, rejugada con el motor y los volcanes, lleva
      a la posición guardada.
   2. La bandera: con 6 s y sin mover, a las blancas se les acaba el tiempo y
      la partida la ganan las negras (y el trigger lo acepta).
   3. Misiones secretas con reloj, de punta a punta: las blancas llevan el rey
      a su cuarta fila (su misión); las negras ven el aviso de que la misión
      rival está cumplida; al volver el turno de las blancas, la partida se
      cobra; al terminar, las dos pantallas lo dicen y destapan las dos
      misiones.
   4. Relevo en silencio con tres pestañas (Ana y Carla contra Bruno): se
      juegan 16 medias jugadas al azar, cada una la hace quien le toca en la
      rotación (Ana, Bruno, Carla, Bruno, Ana…), la base no rechaza ninguna
      por turno, y las tres pantallas terminan igual que la base.
   En todas, sin errores de JavaScript.

   Uso: con el sitio en localhost:8777 (npm run verificar lo levanta solo),
        node herramientas/verificar-juegos-nuevos-en-vivo.js */
"use strict";
const { chromium } = require("playwright");
const { Chess } = require("chess.js");
const path = require("path");

global.window = global.window || {};
global.Chess = Chess;
require(path.join(__dirname, "..", "js", "variantes-engines.js"));
const Variantes = global.window.Variantes;

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const NOMBRES = { "u-ana": "Ana Rojas", "u-bruno": "Bruno Mena", "u-carla": "Carla Solís" };

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✅ " + nombre); return; }
  fallos++;
  console.log("  ❌ " + nombre + (detalle !== undefined ? "  →  " + JSON.stringify(detalle) : ""));
}

/* ============================================================ el servidor */
function crearServidor() {
  const tablas = { game_rooms: [], relevos: [], relevo_jugadores: [], relevo_senales: [], misiones_secretas: [] };
  const canales = new Map();
  const rechazos = [];
  const escrituras = [];
  const ahoraIso = () => new Date().toISOString();
  const copia = (x) => JSON.parse(JSON.stringify(x));

  // Lo que hace public.proteger_reloj_de_partida() en game_rooms.
  function trigger(viejo, nuevo) {
    const ahora = Date.now();
    if (nuevo.clock_updated_at !== viejo.clock_updated_at && nuevo.clock_updated_at) nuevo.clock_updated_at = ahoraIso();
    if (!viejo.clock_updated_at && !nuevo.clock_updated_at && nuevo.initial_seconds != null && nuevo.white_ready && nuevo.black_ready) nuevo.clock_updated_at = ahoraIso();
    const pasado = viejo.clock_updated_at ? Math.max(0, (ahora - Date.parse(viejo.clock_updated_at)) / 1000) : 0;
    const mueve = String(viejo.fen).split(" ")[1];
    const tol = 2;
    if (viejo.status === "playing" && viejo.clock_updated_at && nuevo.fen !== viejo.fen) {
      const quedaba = mueve === "w" ? viejo.white_time_left : viejo.black_time_left;
      if (quedaba != null && quedaba - pasado < -tol) return "Se te acabó el tiempo antes de esta jugada";
    }
    for (const [c, clave] of [["w", "white_time_left"], ["b", "black_time_left"]]) {
      if (nuevo[clave] === viejo[clave] || viejo[clave] == null) continue;
      const corre = viejo.status === "playing" && viejo.clock_updated_at && mueve === c ? pasado : 0;
      if ((nuevo[clave] || 0) < viejo[clave] - corre - tol) return "Todavía le queda tiempo a las " + (c === "w" ? "blancas" : "negras");
      if (nuevo[clave] > Math.max(viejo[clave] - pasado, 0) + (viejo.increment_seconds || 0) + tol) return "Tiempo restante inválido";
    }
    return null;
  }

  function cumple(fila, filtros) {
    return filtros.every(([op, col, val]) => {
      if (op === "eq") return String(fila[col]) === String(val);
      if (op === "in") return (val || []).map(String).includes(String(fila[col]));
      return true;
    });
  }

  function repartir(tabla, evento, fila) {
    for (const c of canales.values()) {
      for (const f of c.filtros) {
        if (f.table !== tabla || (f.event !== evento && f.event !== "*")) continue;
        const m = /^(\w+)=eq\.(.+)$/.exec(f.filter || "");
        if (m && String(fila[m[1]]) !== m[2]) continue;
        const dato = copia(fila);
        setTimeout(() => {
          if (!c.page.isClosed()) c.page.evaluate(([id, ev, d]) => window.__entregar && window.__entregar(id, ev, d), [c.id, evento, dato]).catch(() => {});
        }, 30 + Math.random() * 80);
      }
    }
  }

  // Quién le toca en el relevo: lo mismo que interno.relevo_a_quien_le_toca().
  function aQuienLeToca(r) {
    const color = String(r.fen).split(" ")[1] === "b" ? "b" : "w";
    const eq = tablas.relevo_jugadores.filter((j) => j.relevo_id === r.id && j.color === color).sort((a, b) => a.orden - b.orden);
    return eq.length ? eq[Math.floor(r.moves.length / 2) % eq.length].jugador_id : null;
  }

  async function atender(page, p) {
    await esperar(20 + Math.random() * 60);
    if (p.op === "rpc") {
      const a = p.args || {};
      if (p.nombre === "hora_servidor_ms") return { data: Date.now(), error: null };
      if (p.nombre === "nombres_de_jugadores") return { data: (a.p_ids || []).map((id) => ({ id, nombre: NOMBRES[id] || id })), error: null };
      if (p.nombre === "repartir_misiones") {
        const sala = tablas.game_rooms.find((s) => s.id === a.p_sala);
        const color = sala.white_id === p.usuario ? "w" : sala.black_id === p.usuario ? "b" : null;
        const m = tablas.misiones_secretas.find((x) => x.sala_id === a.p_sala && x.color === color);
        return { data: m ? m.mision : null, error: null };
      }
      if (p.nombre === "relevo_jugar") {
        const r = tablas.relevos.find((x) => x.id === a.p_relevo);
        let error = null;
        if (r.status !== "playing") error = "La partida ya terminó.";
        else if (r.fen !== a.p_fen_antes) error = "La partida ya iba más adelante.";
        else if (aQuienLeToca(r) !== p.usuario) error = "Todavía no es tu turno en el relevo.";
        if (error) { rechazos.push(error); return { data: null, error: { message: error } }; }
        escrituras.push({ tabla: "relevos", autor: p.usuario, san: a.p_san });
        Object.assign(r, { fen: a.p_fen, moves: r.moves.concat([a.p_san]), status: a.p_resultado ? "finished" : "playing", result: a.p_resultado || null, updated_at: ahoraIso() });
        repartir("relevos", "UPDATE", r);
        return { data: copia(r), error: null };
      }
      if (p.nombre === "relevo_senal" || p.nombre === "relevo_terminar") return { data: null, error: null };
      return { data: null, error: null };
    }
    if (p.op === "suscribir") {
      canales.set(p.pagina + "/" + p.id, { page, id: p.id, filtros: p.filtros });
      setTimeout(() => page.evaluate((id) => window.__entregar && window.__entregar(id, "estado", "SUBSCRIBED"), p.id).catch(() => {}), 60);
      return { data: null, error: null };
    }
    if (p.op === "quitar") { canales.delete(p.pagina + "/" + p.id); return { data: null, error: null }; }

    if (p.tabla === "profiles") {
      const fila = { id: p.usuario, full_name: NOMBRES[p.usuario], email: p.usuario + "@x.cr", role: "alumno", is_admin: false };
      return { data: p.unica ? fila : [fila], error: null };
    }
    const filas = tablas[p.tabla];
    if (!filas) return { data: p.unica ? null : [], error: null };
    if (p.op === "select") {
      let r = filas.filter((f) => cumple(f, p.filtros));
      // La RLS de misiones_secretas: la propia mientras se juega; las dos al terminar.
      if (p.tabla === "misiones_secretas") r = r.filter((m) => m.jugador_id === p.usuario || (tablas.game_rooms.find((s) => s.id === m.sala_id) || {}).status === "finished");
      r = copia(r);
      return { data: p.unica ? (r[0] || null) : r, error: null };
    }
    if (p.op === "update") {
      const tocadas = [];
      for (let i = 0; i < filas.length; i++) {
        const vieja = filas[i];
        if (!cumple(vieja, p.filtros)) continue;
        const nueva = Object.assign({}, vieja, copia(p.cambio));
        const error = p.tabla === "game_rooms" ? trigger(vieja, nueva) : null;
        if (error) { rechazos.push(error); return { data: null, error: { message: error } }; }
        filas[i] = nueva;
        tocadas.push(nueva);
        escrituras.push({ tabla: p.tabla, autor: p.usuario, antes: copia(vieja), despues: copia(nueva), t: Date.now() });
        repartir(p.tabla, "UPDATE", nueva);
      }
      return { data: p.select ? copia(tocadas) : null, error: null };
    }
    return { data: null, error: null };
  }
  return { tablas, rechazos, escrituras, atender, aQuienLeToca };
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
    c.oyentes.forEach((o) => { if (o.event === ev || o.event === "*") o.fn({ new: dato }); });
  };
  function constructor(tabla) {
    const p = { op: "select", tabla, filtros: [], unica: false, select: false, usuario: USUARIO };
    const b = {
      select() { if (p.op === "update") p.select = true; return b; },
      eq(c, v) { p.filtros.push(["eq", c, v]); return b; },
      in(c, v) { p.filtros.push(["in", c, v]); return b; },
      neq() { return b; }, is() { return b; }, not() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; },
      gt() { return b; }, lt() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; },
      update(cambio) { p.op = "update"; p.cambio = cambio; return b; },
      insert() { p.op = "insert"; return b; }, upsert() { p.op = "insert"; return b; }, delete() { p.op = "delete"; return b; },
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
    },
    from: (t) => constructor(t),
    rpc: (nombre, args) => {
      const pr = window.__srv({ op: "rpc", nombre, args: args || {}, usuario: USUARIO });
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

/* El jugador automático de variante.html (room, board, engine, myColor son
   globales de js/variante.js). Toca «Estoy listo» una vez, y cuando le toca
   juega una jugada al azar, o la que sigue del guion si hay. Se para con
   window.__pausa. */
const JUGADOR_VARIANTE = (tope, guion) => `
(function () {
  const TOPE = ${tope}, GUION = ${JSON.stringify(guion || null)};
  let listo = false, pensandoHasta = 0;
  setInterval(() => {
    let r, b, e, c;
    try { r = room; b = board; e = engine; c = myColor; } catch (x) { return; }
    if (!r || !b || !e || !c || window.__pausa) return;
    if (r.status !== "playing") return;
    if (!(r.white_ready && r.black_ready)) {
      const mio = c === "w" ? r.white_ready : r.black_ready;
      if (!mio && !listo) { listo = true; setTimeout(() => document.getElementById("ready-btn").click(), 100 + Math.random() * 400); }
      return;
    }
    if (!b._canActNow() || (r.moves || []).length >= TOPE) { pensandoHasta = 0; return; }
    if (!pensandoHasta) { pensandoHasta = Date.now() + (GUION ? 900 : 150 + Math.random() * 500); return; }
    if (Date.now() < pensandoHasta) return;
    pensandoHasta = 0;
    let m;
    if (GUION) {
      const j = GUION[(r.moves || []).length];
      if (!j) return;
      m = { from: j.slice(0, 2), to: j.slice(2, 4) };
    } else {
      const todas = [];
      for (const f of "abcdefgh") for (let k = 1; k <= 8; k++) { const p = e.get(f + k); if (p && p.color === c) todas.push(...e.movesFrom(f + k)); }
      if (!todas.length) return;
      m = todas[Math.floor(Math.random() * todas.length)];
    }
    b._apply(m.from, m.to, m.promotion ? "q" : undefined);
  }, 40);
})();
`;

// El de relevo.html (relevo, board, engine, meToca son globales de js/relevo.js).
const JUGADOR_RELEVO = (tope) => `
(function () {
  const TOPE = ${tope};
  let pensandoHasta = 0;
  setInterval(() => {
    let r, b, e;
    try { r = relevo; b = board; e = engine; } catch (x) { return; }
    if (!r || !b || !e || r.status !== "playing" || !meToca() || r.moves.length >= TOPE) { pensandoHasta = 0; return; }
    if (!pensandoHasta) { pensandoHasta = Date.now() + 150 + Math.random() * 400; return; }
    if (Date.now() < pensandoHasta) return;
    pensandoHasta = 0;
    const turno = e.turn(), todas = [];
    for (const f of "abcdefgh") for (let k = 1; k <= 8; k++) { const p = e.get(f + k); if (p && p.color === turno) todas.push(...e.movesFrom(f + k)); }
    if (!todas.length) return;
    const m = todas[Math.floor(Math.random() * todas.length)];
    b._apply(m.from, m.to, m.promotion ? "q" : undefined);
  }, 40);
})();
`;

function sala(id, variant, extra) {
  return Object.assign({
    id, variant, white_id: "u-ana", black_id: "u-bruno", status: "playing", result: null,
    moves: [], fen: INICIAL, initial_seconds: 180, increment_seconds: 2,
    white_time_left: 180, black_time_left: 180, clock_updated_at: null,
    white_ready: false, black_ready: false, created_by: "u-profe", variant_state: null, updated_at: new Date().toISOString(),
  }, extra || {});
}

async function abrirPestañas(browser, srv, lista) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1000, height: 1100 } });
  await ctx.exposeBinding("__srv", (fuente, pedido) => srv.atender(fuente.page, pedido));
  const pestañas = [];
  for (const x of lista) {
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.addInitScript(doble(x.usuario, x.nombre));
    if (x.jugador) await page.addInitScript(x.jugador);
    pestañas.push(Object.assign({ page, errores }, x));
  }
  await Promise.all(pestañas.map((p) => p.page.goto(BASE + p.url, { waitUntil: "load" })));
  return { ctx, pestañas };
}
async function hasta(cond, ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (await cond()) return true; await esperar(100); }
  return false;
}
const segundos = (t) => { const m = /(\d+):(\d\d)/.exec(t || ""); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null; };

/* ------------------------------------------------------------ 1. Volcanes */
async function volcanes(browser) {
  console.log("\n▶ Volcanes, con reloj, dos pantallas");
  const srv = crearServidor();
  const VOLCANES = ["e4", "d5", "c6", "f3", "e5", "d4"];
  srv.tablas.game_rooms.push(sala("v1", "volcanes", { variant_state: { volcanes: VOLCANES } }));
  const TOPE = 30;
  const { ctx, pestañas } = await abrirPestañas(browser, srv, [
    { usuario: "u-ana", nombre: "ana", url: "/variante.html?room=v1", jugador: JUGADOR_VARIANTE(TOPE) },
    { usuario: "u-bruno", nombre: "bruno", url: "/variante.html?room=v1", jugador: JUGADOR_VARIANTE(TOPE) },
  ]);
  const fila = () => srv.tablas.game_rooms[0];
  const [ana, bruno] = pestañas;

  ok("el reloj no corre antes de que los dos estén listos", await hasta(async () => fila().white_ready || fila().black_ready, 5000) && (!(fila().white_ready && fila().black_ready) ? !fila().clock_updated_at : true));
  ok("con los dos listos, el reloj arranca (lo pone la base)", await hasta(async () => !!fila().clock_updated_at, 8000), fila());

  // El reloj que baja es el de quien tiene el turno, también en la pantalla del otro.
  await hasta(async () => fila().moves.length >= 3 && String(fila().fen).split(" ")[1] === "b", 15000);
  await ana.page.evaluate(() => { window.__pausa = true; });
  await bruno.page.evaluate(() => { window.__pausa = true; });
  await esperar(600);
  const enTurno = String(fila().fen).split(" ")[1];
  const leer = () => ana.page.evaluate(() => ({ arriba: document.getElementById("top-clock").textContent, abajo: document.getElementById("bottom-clock").textContent }));
  const r1 = await leer();
  await esperar(3200);
  const r2 = await leer();
  const bajaRival = segundos(r1.arriba) - segundos(r2.arriba), bajaPropio = segundos(r1.abajo) - segundos(r2.abajo);
  ok("con el turno de las negras, en la pantalla de Ana baja el reloj de Bruno (~3 s)", enTurno === "b" && bajaRival >= 2 && bajaRival <= 4, { enTurno, r1, r2 });
  ok("y el de Ana se queda quieto", bajaPropio === 0, { r1, r2 });
  const rb1 = await bruno.page.evaluate(() => document.getElementById("bottom-clock").textContent);
  ok("en la pantalla de Bruno, su reloj (abajo) dice lo mismo que en la de Ana (±1 s)", Math.abs(segundos(rb1) - segundos(r2.arriba)) <= 1, { bruno: rb1, ana: r2.arriba });
  await ana.page.evaluate(() => { window.__pausa = false; });
  await bruno.page.evaluate(() => { window.__pausa = false; });

  const fin = await hasta(async () => fila().moves.length >= TOPE || fila().status !== "playing", 90000);
  await esperar(1500);
  const f = fila();
  ok("la partida avanzó hasta el final sin trabarse (" + f.moves.length + " medias jugadas, " + f.status + ")", fin, { jugadas: f.moves.length });
  ok("el trigger del reloj no rechazó ninguna escritura", srv.rechazos.length === 0, srv.rechazos);
  const erupciones = f.moves.filter((s) => /🌋/.test(s));
  const esperadas = [10, 16, 22, 28].filter((n) => n <= f.moves.length).length;
  ok("hubo " + esperadas + " erupciones, una cada 6 medias jugadas desde la 10", erupciones.length === esperadas, f.moves);

  // La planilla, rejugada con el motor y los volcanes, lleva a la posición guardada.
  const e = Variantes.crear("volcanes");
  e.configurar({ volcanes: VOLCANES });
  let rejugada = true;
  const ES_A_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
  for (const san of f.moves) {
    const limpia = san.split(" ")[0].replace(/^[RDTAC]/, (c) => ES_A_EN[c]).replace(/=([DTAC])/, (_, c) => "=" + ES_A_EN[c]).replace(/^O-O/, "O-O");
    const mv = new Chess(e.game.fen()).move(limpia, { sloppy: true });
    if (!mv || !e.move({ from: mv.from, to: mv.to, promotion: mv.promotion })) { rejugada = false; break; }
  }
  ok("la planilla, rejugada con los volcanes, lleva a la posición guardada", rejugada && e.game.fen().split(" ").slice(0, 4).join(" ") === f.fen.split(" ").slice(0, 4).join(" "), { rejugada, motor: e.game.fen(), base: f.fen });

  // Cada jugada guardada bajó el reloj de quien movió, sin subirlo más que el incremento.
  const malas = srv.escrituras.filter((w) => w.tabla === "game_rooms" && w.antes.fen !== w.despues.fen && w.antes.clock_updated_at).filter((w) => {
    const c = String(w.antes.fen).split(" ")[1], k = c === "w" ? "white_time_left" : "black_time_left";
    return w.despues[k] > w.antes[k] + (w.antes.increment_seconds || 0) + 0.01;
  });
  ok("ninguna jugada le subió el reloj a nadie más que el incremento", malas.length === 0, malas.slice(0, 2));

  for (const p of pestañas) {
    const visto = await p.page.evaluate(() => ({ fen: room.fen, jugadas: room.moves.length, estado: room.status, tablero: engine.serialize() }));
    ok("la pantalla de " + p.nombre + " termina igual que la base", visto.fen === f.fen && visto.jugadas === f.moves.length && visto.estado === f.status && visto.tablero === f.fen, { visto, base: { fen: f.fen, n: f.moves.length } });
    ok("sin errores de JavaScript en la de " + p.nombre, p.errores.length === 0, p.errores);
  }
  await ctx.close();
}

/* ------------------------------------------------------------ 2. La bandera */
async function bandera(browser) {
  console.log("\n▶ La bandera, con 6 segundos");
  const srv = crearServidor();
  srv.tablas.game_rooms.push(sala("v2", "volcanes", { initial_seconds: 6, increment_seconds: 0, white_time_left: 6, black_time_left: 6, variant_state: { volcanes: ["e4"] } }));
  const quieto = `(function(){ let l=false; setInterval(()=>{ try { if (room && board && myColor && !l && room.status==="playing") { const mio = myColor==="w"?room.white_ready:room.black_ready; if(!mio){ l=true; document.getElementById("ready-btn").click(); } } } catch(e){} }, 100); })();`;
  const { ctx, pestañas } = await abrirPestañas(browser, srv, [
    { usuario: "u-ana", nombre: "ana", url: "/variante.html?room=v2", jugador: quieto },
    { usuario: "u-bruno", nombre: "bruno", url: "/variante.html?room=v2", jugador: quieto },
  ]);
  const f = () => srv.tablas.game_rooms[0];
  await hasta(async () => !!f().clock_updated_at, 6000);
  const termino = await hasta(async () => f().status === "finished", 14000);
  ok("a las blancas se les acaba el tiempo y la partida termina", termino, f());
  ok("la ganan las negras", f().result === "black", f().result);
  ok("y la base lo acepta (no la canta antes de tiempo)", srv.rechazos.length === 0, srv.rechazos);
  await esperar(800);
  const texto = await pestañas[1].page.evaluate(() => document.getElementById("status-banner").textContent);
  ok("la pantalla de Bruno lo dice", /ganó con negras/.test(texto), texto);
  ok("sin errores de JavaScript", pestañas.every((p) => !p.errores.length), pestañas.map((p) => p.errores));
  await ctx.close();
}

/* ------------------------------------------------------------ 3. Misiones */
async function misiones(browser) {
  console.log("\n▶ Misiones secretas, con reloj, de punta a punta");
  const srv = crearServidor();
  srv.tablas.game_rooms.push(sala("m1", "misiones"));
  srv.tablas.misiones_secretas.push(
    { sala_id: "m1", color: "w", jugador_id: "u-ana", mision: "rey_valiente" },
    { sala_id: "m1", color: "b", jugador_id: "u-bruno", mision: "torres_dobladas" });
  // 1.e4 a6 2.Re2 a5 3.Re3 h6 4.Rf4 (misión cumplida) h5 → turno de Ana: se cobra.
  const GUION = ["e2e4", "a7a6", "e1e2", "a6a5", "e2e3", "h7h6", "e3f4", "h6h5"];
  const { ctx, pestañas } = await abrirPestañas(browser, srv, [
    { usuario: "u-ana", nombre: "ana", url: "/variante.html?room=m1", jugador: JUGADOR_VARIANTE(20, GUION) },
    { usuario: "u-bruno", nombre: "bruno", url: "/variante.html?room=m1", jugador: JUGADOR_VARIANTE(20, GUION) },
  ]);
  const f = () => srv.tablas.game_rooms[0];
  const [ana, bruno] = pestañas;
  ok("cada uno ve su misión, y no la del otro", await hasta(async () => {
    const a = await ana.page.evaluate(() => document.getElementById("mision-panel").textContent);
    const b = await bruno.page.evaluate(() => document.getElementById("mision-panel").textContent);
    return /Rey valiente/.test(a) && !/Torres dobladas/.test(a) && /Torres dobladas/.test(b) && !/Rey valiente/.test(b);
  }, 8000));
  ok("Bruno ve el aviso cuando la misión de Ana queda cumplida (sin saber cuál)", await hasta(async () => {
    if (f().moves.length !== 7) return false;
    const t = await bruno.page.evaluate(() => document.getElementById("mision-estado").textContent);
    return /Tu rival tiene su misión cumplida/.test(t);
  }, 30000), f().moves);
  const t = await ana.page.evaluate(() => document.getElementById("mision-estado").textContent);
  ok("y a Ana se le dice que espere su turno", /Tu misión está cumplida/.test(t) || f().moves.length > 7, t);
  ok("al volver el turno de Ana, la partida se cobra", await hasta(async () => f().status === "finished", 15000), f());
  ok("la ganan las blancas, por la misión", f().result === "white" && f().variant_state && f().variant_state.fin && f().variant_state.fin.motivo === "mision", f());
  ok("el trigger del reloj no rechazó nada", srv.rechazos.length === 0, srv.rechazos);
  await esperar(1500);
  for (const p of pestañas) {
    const v = await p.page.evaluate(() => ({ estado: document.getElementById("status-banner").textContent, panel: document.getElementById("mision-panel").textContent }));
    ok("la pantalla de " + p.nombre + " dice cómo se ganó", /cumpliendo su misión secreta/.test(v.estado), v.estado);
    ok("y destapa las dos misiones", /Rey valiente/.test(v.panel) && /Torres dobladas/.test(v.panel), v.panel);
    ok("sin errores de JavaScript en la de " + p.nombre, p.errores.length === 0, p.errores);
  }
  await ctx.close();
}

/* ------------------------------------------------------------ 4. Relevo */
async function relevo(browser) {
  console.log("\n▶ Relevo en silencio, tres pantallas");
  const srv = crearServidor();
  srv.tablas.relevos.push({ id: "rv1", created_by: "u-profe", fen: INICIAL, moves: [], status: "playing", result: null, motivo: null, updated_at: new Date().toISOString() });
  srv.tablas.relevo_jugadores.push(
    { relevo_id: "rv1", jugador_id: "u-ana", color: "w", orden: 0 },
    { relevo_id: "rv1", jugador_id: "u-carla", color: "w", orden: 1 },
    { relevo_id: "rv1", jugador_id: "u-bruno", color: "b", orden: 0 });
  const TOPE = 16;
  const { ctx, pestañas } = await abrirPestañas(browser, srv, ["u-ana", "u-carla", "u-bruno"].map((u) => ({
    usuario: u, nombre: u.slice(2), url: "/relevo.html?relevo=rv1", jugador: JUGADOR_RELEVO(TOPE),
  })));
  const r = () => srv.tablas.relevos[0];
  const fin = await hasta(async () => r().moves.length >= TOPE || r().status !== "playing", 60000);
  await esperar(1500);
  ok("el relevo avanzó sin trabarse (" + r().moves.length + " medias jugadas)", fin, r().moves);
  ok("la base no rechazó ninguna jugada (nadie intentó mover fuera de turno)", srv.rechazos.length === 0, srv.rechazos);
  const autores = srv.escrituras.filter((w) => w.tabla === "relevos").map((w) => w.autor.slice(2));
  const esperado = autores.map((_, i) => (i % 2 === 1 ? "bruno" : (i / 2) % 2 === 0 ? "ana" : "carla"));
  ok("movió cada uno en su turno: Ana, Bruno, Carla, Bruno, Ana…", JSON.stringify(autores) === JSON.stringify(esperado), autores);
  const ch = new Chess();
  const ES_A_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
  const todas = r().moves.every((s) => ch.move(s.replace(/^[RDTAC]/, (c) => ES_A_EN[c]).replace(/=([DTAC])/, (_, c) => "=" + ES_A_EN[c]), { sloppy: true }));
  ok("la planilla lleva a la posición guardada", todas && ch.fen() === r().fen, { motor: ch.fen(), base: r().fen });
  for (const p of pestañas) {
    const v = await p.page.evaluate(() => ({ fen: relevo.fen, n: relevo.moves.length, tablero: engine.serialize() }));
    ok("la pantalla de " + p.nombre + " termina igual que la base", v.fen === r().fen && v.n === r().moves.length && v.tablero === r().fen, v);
    ok("sin errores de JavaScript en la de " + p.nombre, p.errores.length === 0, p.errores);
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await volcanes(browser);
    await bandera(browser);
    await misiones(browser);
    await relevo(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
