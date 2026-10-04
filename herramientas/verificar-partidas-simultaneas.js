/* 50 partidas a la vez entre alumnos, en navegadores de verdad, con una red
   que se porta mal: ¿cada jugada le llega al rival al instante, y ninguna
   partida se queda trabada?

   POR QUÉ EXISTE
   En un torneo pasó que el reloj corría y al alumno no le aparecía la jugada
   del rival (o la suya no le llegaba al otro). No daba ningún error: la jugada
   estaba guardada en la base y la pantalla no se enteraba, porque la sala solo
   escuchaba Realtime, y Realtime no avisa lo que pasó mientras el canal estuvo
   caído (un celular que bloqueó la pantalla, una pestaña en segundo plano, un
   cambio de red, Realtime atrasado con la base cargada). Ver «Las jugadas
   llegan siempre» en docs/decisiones/juegos-y-torneos.md.

   CÓMO
   Un servidor de mentira, en este proceso, hace de base y de Realtime para
   todas las pestañas a la vez (una sola `game_rooms` compartida): aplica las
   reglas del trigger del reloj (la hora la pone el servidor, la bandera
   cantada antes de tiempo se rechaza) y reparte cada cambio a quien escucha
   esa sala. Se abren 100 pestañas de estandar.html —dos por partida— y en
   cada una un jugador automático mueve al azar cuando le toca, pensando entre
   0,2 y 1,2 segundos. Cada pestaña avisa al servidor en cuanto su tablero
   muestra una posición nueva, y así se mide cuánto tarda cada jugada en
   verse del otro lado.

   Tres rondas:
     1. Al instante (10 partidas, red sana): cada jugada se ve del otro lado
        en menos de 1 s, la mitad en menos de 300 ms.
     2. Muchas a la vez (50 partidas, red sana): ninguna se pierde ni se traba
        y ninguna tarda más de 6 s. Con 100 pestañas en UNA computadora, los
        milisegundos los pone sobre todo la computadora (cada alumno tiene su
        aparato): por eso se mide también cuánto atrasaba ella los relojes de
        cada pestaña, y se imprime al lado. Con 4 procesadores, la mediana
        anda por el medio segundo y el atraso propio de la computadora explica
        casi todo.
     3. Muchas a la vez con red mala: Realtime pierde el 15 % de los avisos,
        entrega otro 10 % tarde y desordenado, corta los canales a ratos
        (también los cierra del todo), y una de cada diez respuestas de la
        base tarda hasta 2,5 s. Aun así ninguna jugada tarda más de 15 s en
        verse (lo peor: un aviso perdido, 5 s de espera y dos respuestas
        lentas, más la computadora), ninguna partida se traba, y al final
        todas las pantallas muestran lo mismo que la base.
   En todas: la lista de jugadas guardada lleva siempre a la posición
   guardada (ninguna jugada se pisa ni se pierde), ninguna pestaña se va a
   otra sala, y no hay errores de JavaScript en las salas.

   Con la sala de antes (solo Realtime, sin volver a leer), la red mala deja
   partidas trabadas para siempre (una jugada tardó 5 minutos en verse y otras
   no llegaron nunca): probado.

   Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
         npm install
         node herramientas/verificar-partidas-simultaneas.js
         PARTIDAS=10 node herramientas/verificar-partidas-simultaneas.js   (las rondas 2 y 3 con 10)
*/
"use strict";

const { chromium } = require("playwright");
const { Chess } = require("chess.js");

const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const PARTIDAS = Math.max(1, parseInt(process.env.PARTIDAS || "50", 10));
// La ronda que mide «al instante»: pocas, para que la computadora que corre la
// prueba no sea el cuello de botella (ver la cabecera).
const PARTIDAS_RAPIDAS = Math.min(PARTIDAS, 10);
const JUGADAS = Math.max(4, parseInt(process.env.JUGADAS || "40", 10)); // medias jugadas por partida
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { console.log("  ✅ " + nombre); return; }
  fallos++;
  console.log("  ❌ " + nombre + (detalle !== undefined ? "  →  " + (typeof detalle === "string" ? detalle : JSON.stringify(detalle)) : ""));
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const entre = (a, b) => a + Math.random() * (b - a);

/* ============================================================ el servidor
   Una base y un Realtime de mentira, compartidos por todas las pestañas. */
function crearServidor(red) {
  const salas = new Map();          // id → fila
  const canales = new Map();        // clave → { page, id, salaId, vivo }
  const confirmadas = new Map();    // salaId → [{ fen, t }] cada posición guardada y cuándo
  const vistas = [];                // { salaId, color, demora }
  const rechazos = [];
  const atrasos = [];               // cuánto se atrasaba el reloj de la pestaña (la computadora, no la sala)
  let cerrado = false;

  const ahoraIso = () => new Date().toISOString();

  function sala(id, blancas, negras) {
    return {
      id, variant: "estandar", white_id: blancas, black_id: negras, status: "playing", result: null,
      moves: [], fen: INICIAL, initial_seconds: 300, increment_seconds: 2,
      white_time_left: 300, black_time_left: 300, clock_updated_at: null,
      white_ready: false, black_ready: false, created_by: "u-profe", updated_at: ahoraIso(),
    };
  }

  // Lo mismo que hace public.proteger_reloj_de_partida() (lo que importa acá).
  function trigger(viejo, nuevo) {
    const ahora = Date.now();
    if (nuevo.clock_updated_at !== viejo.clock_updated_at && nuevo.clock_updated_at) nuevo.clock_updated_at = ahoraIso();
    if (!viejo.clock_updated_at && !nuevo.clock_updated_at && nuevo.initial_seconds != null && nuevo.white_ready && nuevo.black_ready) {
      nuevo.clock_updated_at = ahoraIso();
    }
    const pasado = viejo.clock_updated_at ? Math.max(0, (ahora - Date.parse(viejo.clock_updated_at)) / 1000) : 0;
    const mueve = String(viejo.fen).split(" ")[1];
    const tol = 2;
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
      if (op === "neq") return String(fila[col]) !== String(val);
      if (op === "in") return (val || []).map(String).includes(String(fila[col]));
      // "white_id.eq.X,black_id.eq.X" (el aviso de pareo): se entiende ese caso.
      if (op === "or") return String(col).split(",").some((p) => { const [c, o, v] = p.split("."); return o === "eq" && String(fila[c]) === v; });
      return true;
    });
  }

  async function entregar(c, tipo, dato) {
    if (cerrado || c.page.isClosed()) return;
    try { await c.page.evaluate(([id, t, d]) => window.__entregar && window.__entregar(id, t, d), [c.id, tipo, dato]); } catch (e) { /* pestaña cerrada */ }
  }

  function repartir(fila) {
    for (const c of canales.values()) {
      if (c.salaId !== fila.id) continue;
      if (!c.vivo) continue;                        // canal caído: el aviso se pierde
      if (Math.random() < red.perdidos) continue;   // Realtime atrasado: se pierde igual
      const tarde = Math.random() < red.tarde;
      const demora = tarde ? entre(1000, 3000) : entre(20, 120);
      const copia = JSON.parse(JSON.stringify(fila));
      setTimeout(() => { if (c.vivo) entregar(c, "cambio", copia); }, demora);
    }
  }

  // Cortes de canal: a cada rato, alguno se cae unos segundos y vuelve solo
  // (como hace la librería), o se cierra del todo y la página tiene que abrir otro.
  let cortes = null;
  if (red.cortes) {
    cortes = setInterval(() => {
      for (const c of canales.values()) {
        if (!c.vivo || Math.random() > red.cortes) continue;
        c.vivo = false;
        if (Math.random() < 0.3) { entregar(c, "estado", "CLOSED"); continue; }
        entregar(c, "estado", Math.random() < 0.5 ? "CHANNEL_ERROR" : "TIMED_OUT");
        setTimeout(() => { if (canales.has(c.clave)) { c.vivo = true; entregar(c, "estado", "SUBSCRIBED"); } }, entre(1500, 6000));
      }
    }, 1000);
  }

  async function atender(page, pedido) {
    // La respuesta de la base tarda: casi siempre poco, a veces mucho.
    await esperar(Math.random() < red.lentas ? entre(800, 2500) : entre(20, 120));
    const { op } = pedido;

    if (op === "rpc") {
      if (pedido.nombre === "hora_servidor_ms") return { data: Date.now(), error: null };
      if (pedido.nombre === "nombres_de_jugadores") {
        return { data: (pedido.args.p_ids || []).map((id) => ({ id, nombre: "Alumno " + id.slice(2) })), error: null };
      }
      return { data: null, error: null };
    }
    if (op === "suscribir") {
      const clave = pedido.pagina + "/" + pedido.id;
      const filtro = (pedido.filtros || []).find((f) => f.table === "game_rooms" && f.filter && f.filter.startsWith("id=eq."));
      const c = { clave, page, id: pedido.id, salaId: filtro ? filtro.filter.slice(6) : null, vivo: true };
      canales.set(clave, c);
      setTimeout(() => entregar(c, "estado", "SUBSCRIBED"), entre(50, 300));
      return { data: null, error: null };
    }
    if (op === "quitar") { canales.delete(pedido.pagina + "/" + pedido.id); return { data: null, error: null }; }
    if (op === "vi") {
      atrasos.push(pedido.atraso || 0);
      // La pestaña ya muestra esta posición: ¿cuánto tardó desde que se guardó?
      const lista = confirmadas.get(pedido.salaId) || [];
      const guardada = lista.find((x) => x.fen === pedido.fen && x.autor !== pedido.color && !x.vistaPor);
      if (guardada) {
        guardada.vistaPor = pedido.color;
        vistas.push({ salaId: pedido.salaId, color: pedido.color, demora: pedido.t - guardada.t });
      }
      return { data: null, error: null };
    }

    const { tabla, filtros } = pedido;
    // El aviso de pareo y demás módulos de la página preguntan por «mis
    // partidas»: sin el usuario en el filtro, se les contesta solo lo suyo.
    const mias = (f) => f.white_id === pedido.usuario || f.black_id === pedido.usuario;
    if (tabla === "profiles") {
      const yo = pedido.usuario;
      const fila = { id: yo, full_name: "Alumno " + yo.slice(2), email: yo + "@x.cr", role: "alumno", is_admin: false };
      return { data: pedido.unica ? fila : [fila], error: null };
    }
    if (tabla !== "game_rooms") return { data: pedido.unica ? null : [], error: null };

    if (op === "select") {
      const porId = filtros.some(([op, col]) => op === "eq" && col === "id");
      const filas = [...salas.values()].filter((f) => cumple(f, filtros) && (porId || mias(f))).map((f) => JSON.parse(JSON.stringify(f)));
      return { data: pedido.unica ? (filas[0] || null) : filas, error: null };
    }
    if (op === "update") {
      const tocadas = [];
      for (const vieja of salas.values()) {
        if (!cumple(vieja, filtros)) continue;
        const nueva = Object.assign({}, vieja, pedido.cambio);
        const error = trigger(vieja, nueva);
        if (error) { rechazos.push(error); return { data: null, error: { message: error } }; }
        salas.set(nueva.id, nueva);
        tocadas.push(nueva);
        if (nueva.fen !== vieja.fen) {
          const autor = String(vieja.fen).split(" ")[1];
          if (!confirmadas.has(nueva.id)) confirmadas.set(nueva.id, []);
          confirmadas.get(nueva.id).push({ fen: nueva.fen, t: Date.now(), autor });
        }
        repartir(nueva);
      }
      const data = pedido.select ? tocadas.map((f) => JSON.parse(JSON.stringify(f))) : null;
      return { data, error: null };
    }
    return { data: null, error: null };
  }

  return {
    salas, confirmadas, vistas, rechazos, atrasos, sala, atender,
    cerrar() { cerrado = true; if (cortes) clearInterval(cortes); },
  };
}

/* ============================================================ la pestaña
   El Supabase de mentira: todo lo manda al servidor de arriba. */
function doble(usuario, pagina) {
  return `
(function () {
  const USUARIO = ${JSON.stringify(usuario)}, PAGINA = ${JSON.stringify(pagina)};
  const canales = {};
  let siguiente = 0;
  window.__entregar = (id, tipo, dato) => {
    const c = canales[id];
    if (!c) return;
    if (tipo === "estado") { if (c.cb) c.cb(dato); return; }
    c.oyentes.forEach((o) => { if (o.event === "UPDATE" || o.event === "*") o.fn({ new: dato }); });
  };
  function constructor(tabla) {
    const pedido = { op: "select", tabla, filtros: [], unica: false, select: false, usuario: USUARIO };
    const b = {
      select() { if (pedido.op === "update") pedido.select = true; return b; },
      eq(c, v) { pedido.filtros.push(["eq", c, v]); return b; },
      neq(c, v) { pedido.filtros.push(["neq", c, v]); return b; },
      in(c, v) { pedido.filtros.push(["in", c, v]); return b; },
      is() { return b; }, not() { return b; }, or(x) { pedido.filtros.push(["or", x]); return b; }, gte() { return b; }, lte() { return b; },
      gt() { return b; }, lt() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; },
      update(cambio) { pedido.op = "update"; pedido.cambio = cambio; return b; },
      insert() { pedido.op = "insert"; return b; }, upsert() { pedido.op = "insert"; return b; },
      delete() { pedido.op = "delete"; return b; },
      maybeSingle() { pedido.unica = true; return b; }, single() { pedido.unica = true; return b; },
      then(res, rej) { return window.__srv(pedido).then(res, rej); },
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
      const p = window.__srv({ op: "rpc", nombre, args: args || {}, usuario: USUARIO });
      return { then: (a, b) => p.then(a, b), maybeSingle: () => p, single: () => p };
    },
    channel: () => {
      const id = "c" + (++siguiente);
      const c = { id, oyentes: [], filtros: [], cb: null };
      const api = {
        on(tipo, cfg, fn) { if (tipo === "postgres_changes") { c.oyentes.push({ event: cfg.event, fn }); c.filtros.push({ table: cfg.table, filter: cfg.filter || null }); } return api; },
        subscribe(cb) { c.cb = cb || null; canales[id] = c; window.__srv({ op: "suscribir", id, filtros: c.filtros, pagina: PAGINA }); return api; },
        unsubscribe() { delete canales[id]; window.__srv({ op: "quitar", id, pagina: PAGINA }); return Promise.resolve(); },
        track() { return Promise.resolve(); }, presenceState() { return {}; }, send() { return Promise.resolve(); },
        __id: id,
      };
      return api;
    },
    removeChannel: (api) => { if (api && api.unsubscribe) api.unsubscribe(); return Promise.resolve(); },
    getChannels: () => [],
  };
})();
`;
}

/* El jugador automático y el ojo que avisa cuándo se ve cada posición. Usa las
   variables de estandar.js (room, board, myColor), que son globales del script. */
const JUGADOR = `
(function () {
  const TOPE = ${JUGADAS};
  let ultimaVista = null, pensandoHasta = 0, listoPedido = false, ultimoTic = Date.now();
  setInterval(() => {
    const atraso = Math.max(0, Date.now() - ultimoTic - 30);
    ultimoTic = Date.now();
    let r, b, c;
    try { r = room; b = board; c = myColor; } catch (e) { return; }
    if (!r || !b || !c) return;
    const fen = b.game.fen();
    if (fen !== ultimaVista) {
      ultimaVista = fen;
      window.__srv({ op: "vi", salaId: r.id, fen, color: c, t: Date.now(), atraso });
    }
    if (r.status !== "playing") return;
    if (!(r.white_ready && r.black_ready)) {
      const mio = c === "w" ? r.white_ready : r.black_ready;
      if (!mio && !listoPedido) { listoPedido = true; setTimeout(() => document.getElementById("ready-btn").click(), 100 + Math.random() * 600); }
      return;
    }
    if (!b._canActNow() || (r.moves || []).length >= TOPE) { pensandoHasta = 0; return; }
    if (!pensandoHasta) { pensandoHasta = Date.now() + 200 + Math.random() * 1000; return; }
    if (Date.now() < pensandoHasta) return;
    pensandoHasta = 0;
    const jugadas = b.game.moves({ verbose: true });
    if (!jugadas.length) return;
    const m = jugadas[Math.floor(Math.random() * jugadas.length)];
    b._applyMove(m.from, m.to, m.promotion);
  }, 30);
})();
`;

async function ronda(browser, nombre, PARTIDAS, red, limites) {
  console.log("\n▶ " + nombre + " — " + PARTIDAS + " partidas a la vez (" + PARTIDAS * 2 + " pestañas)");
  const srv = crearServidor(red);
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 900, height: 900 } });
  await ctx.exposeBinding("__srv", (fuente, pedido) => srv.atender(fuente.page, pedido));
  await ctx.addInitScript(() => {
    try { localStorage.setItem("oscarMoveHelpShown_v1", "1"); } catch (e) {}
  });

  const pestañas = [];
  const errores = [];
  for (let g = 0; g < PARTIDAS; g++) {
    const id = "sala-" + g;
    srv.salas.set(id, srv.sala(id, "u-b" + g, "u-n" + g));
    for (const [usuario, color] of [["u-b" + g, "w"], ["u-n" + g, "b"]]) {
      const page = await ctx.newPage();
      const pagina = id + "-" + color;
      await page.addInitScript(doble(usuario, pagina));
      await page.addInitScript(JUGADOR);
      page.on("pageerror", (e) => errores.push(pagina + ": " + String(e)));
      pestañas.push({ page, salaId: id, color, pagina });
    }
  }
  // Se abren de a diez: cien a la vez ahogan el servidor de archivos de prueba,
  // no la sala.
  for (let i = 0; i < pestañas.length; i += 10) {
    await Promise.all(pestañas.slice(i, i + 10).map((p) => p.page.goto(BASE + "/estandar.html?room=" + p.salaId, { waitUntil: "load" })));
  }

  if (process.env.DEPURAR) console.log("    pestañas abiertas");
  // Se juega hasta que todas lleguen al tope (o terminen), con un tope de tiempo.
  const inicio = Date.now();
  const TOPE_MS = limites.topeMs;
  const terminada = (f) => f.status !== "playing" || f.moves.length >= JUGADAS;
  while (Date.now() - inicio < TOPE_MS) {
    if ([...srv.salas.values()].every(terminada)) break;
    if (process.env.DEPURAR) console.log("    " + [...srv.salas.values()].map((f) => f.moves.length + (f.white_ready ? "B" : "") + (f.black_ready ? "N" : "")).join(" "));
    await esperar(1000);
  }
  const trabadas = [...srv.salas.values()].filter((f) => !terminada(f));
  // Un rato de calma para que lo último que esté viajando llegue.
  await esperar(limites.calmaMs);

  // ---------------- lo que se ve en cada pestaña contra lo que hay en la base
  const desfasadas = [];
  for (const p of pestañas) {
    const enBase = srv.salas.get(p.salaId);
    let visto = null;
    try {
      if (!p.page.url().includes("room=" + p.salaId)) throw new Error("la pestaña se fue a " + p.page.url());
      visto = await p.page.evaluate(() => ({ fen: board.game.fen(), sala: room.fen, jugadas: (room.moves || []).length, estado: room.status, lista: document.querySelectorAll("#moves-list li").length }));
    } catch (e) { visto = { error: String(e) }; }
    if (!visto || visto.fen !== enBase.fen || visto.sala !== enBase.fen || visto.jugadas !== enBase.moves.length || visto.estado !== enBase.status ||
        visto.lista !== Math.ceil(enBase.moves.length / 2)) {
      desfasadas.push({ pestaña: p.pagina, visto, base: { fen: enBase.fen, jugadas: enBase.moves.length, estado: enBase.status } });
    }
  }

  // ---------------- la lista de jugadas lleva a la posición guardada
  const rotas = [];
  for (const f of srv.salas.values()) {
    const ch = new Chess();
    const todas = f.moves.every((san) => ch.move(san));
    const pos = (x) => String(x).split(" ").slice(0, 4).join(" ");
    if (!todas || pos(ch.fen()) !== pos(f.fen)) rotas.push(f.id);
  }

  const demoras = srv.vistas.map((v) => v.demora).sort((a, b) => a - b);
  const pct = (q) => demoras.length ? demoras[Math.min(demoras.length - 1, Math.floor(q * demoras.length))] : 0;
  const totalJugadas = [...srv.salas.values()].reduce((a, f) => a + f.moves.length, 0);
  const sinVer = [...srv.confirmadas.values()].reduce((a, l) => a + l.filter((x) => !x.vistaPor).length, 0);
  console.log("    " + totalJugadas + " jugadas en " + Math.round((Date.now() - inicio) / 1000) + " s · vistas del otro lado: mediana " +
    pct(0.5) + " ms, 99 % " + pct(0.99) + " ms, la más lenta " + (demoras[demoras.length - 1] || 0) + " ms");
  const atr = srv.atrasos.slice().sort((a, b) => a - b);
  console.log("    (la computadora de la prueba atrasaba los relojes de cada pestaña: mediana " + (atr[Math.floor(atr.length / 2)] || 0) +
    " ms, la peor " + (atr[atr.length - 1] || 0) + " ms)");

  ok("ninguna partida se trabó (todas llegaron a " + JUGADAS + " medias jugadas o terminaron)", !trabadas.length,
    trabadas.slice(0, 5).map((f) => f.id + " en " + f.moves.length));
  ok("cada jugada guardada la vio el rival", sinVer === 0, sinVer + " sin ver");
  ok("la jugada del rival se ve en menos de " + limites.maxMs + " ms (todas)", (demoras[demoras.length - 1] || 0) < limites.maxMs, demoras.slice(-5));
  if (limites.medianaMs) ok("la mediana es de menos de " + limites.medianaMs + " ms", pct(0.5) < limites.medianaMs, pct(0.5));
  ok("al final cada pestaña muestra lo mismo que la base (tablero, sala, lista de jugadas, estado)", !desfasadas.length, desfasadas.slice(0, 3));
  ok("la lista de jugadas guardada lleva a la posición guardada en todas las partidas", !rotas.length, rotas.slice(0, 5));
  ok("sin errores de JavaScript en las salas", !errores.length, errores.slice(0, 3));

  srv.cerrar();
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
  try {
    await ronda(browser, "1. Al instante: red sana", PARTIDAS_RAPIDAS, { perdidos: 0, tarde: 0, lentas: 0, cortes: 0 },
      { topeMs: 4 * 60 * 1000, calmaMs: 3000, maxMs: 1000, medianaMs: 300 });
    // Con 100 pestañas en una sola computadora, lo que se mide en milisegundos
    // es sobre todo la computadora (cada alumno tiene su propio aparato): acá
    // lo que se exige es que nada se pierda ni se trabe, con un tope holgado.
    await ronda(browser, "2. Muchas a la vez: red sana", PARTIDAS, { perdidos: 0, tarde: 0, lentas: 0, cortes: 0 },
      { topeMs: 6 * 60 * 1000, calmaMs: 3000, maxMs: 6000 });
    await ronda(browser, "3. Muchas a la vez: red mala (avisos perdidos, desordenados, canales que se caen, respuestas lentas)", PARTIDAS,
      { perdidos: 0.15, tarde: 0.10, lentas: 0.10, cortes: 0.01 },
      { topeMs: 8 * 60 * 1000, calmaMs: 10000, maxMs: 15000 });
  } finally {
    await browser.close();
  }
  if (fallos) { console.log("\n" + fallos + " comprobación(es) fallaron."); process.exit(1); }
  console.log("\nTodo bien: " + PARTIDAS + " partidas a la vez, sin jugadas perdidas.");
})().catch((e) => { console.error(e); process.exit(1); });
