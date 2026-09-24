/* Comprueba, en un navegador de verdad y con un Supabase de mentira, que las
   partidas de un torneo SE PUEDAN VER — las dos mitades del problema:

   1. torneo.html no enseñaba ninguna partida. El único acceso a un cruce en
      juego era un "Ver →" que además saca de la página, así que seguir tres
      tableros era entrar y volver tres veces, y a quien le tocó bye no le
      quedaba nada que mirar esa ronda. Ahora la ronda en curso trae sus
      tableros en vivo debajo de la lista.
   2. Y ese "Ver →" era una promesa que el destino rompía: las seis páginas de
      partida cortaban con "No formas parte de esta partida" a cualquiera que
      no fuera jugador ni profesor, aunque la RLS sí le hubiera entregado la
      fila. Comprobado contra la base de verdad, impersonando: a la alumna a la
      que le tocó bye, `game_rooms_select` le devuelve las DOS salas de su
      ronda (es compañera de los cuatro) — o sea que quien decía que no era la
      pantalla, no el candado.

   Todo lo que se rompe acá se rompe callado: un tablero que lee la columna
   equivocada dibuja la posición inicial y se ve perfecto, y un espectador al
   que se le escapa la mano de las cartas ve una pantalla impecable con la
   información por la que se gana la partida.

   Lo que hace cumplir la BASE (que la fila llegue o no) no se prueba acá: eso
   se comprobó impersonando roles en SQL. Esto es lo otro — qué hace la página
   con la fila que le dieron.

   Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
         npm install playwright chess.js@0.10.3
         node herramientas/verificar-torneo-en-vivo.js                        */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

/* Lo que cuenta como «escribir en la partida». platform_activity_log es el
   latido del tiempo (js/tiempo-plataforma.js, en toda página de la Academia):
   mirar una partida también es tiempo en la plataforma, y está bien que cuente. */
const ESCRITURAS_DE_JUEGO = () => window.__escrituras.filter((e) => e.tabla !== "platform_activity_log").length;

const ANA   = { id: "u-ana",   full_name: "Ana Rojas",  email: "ana@x.cr",   role: "alumno", is_admin: false };
const BRUNO = { id: "u-bruno", full_name: "Bruno Mena", email: "bruno@x.cr", role: "alumno", is_admin: false };
const CARLA = { id: "u-carla", full_name: "Carla Soto", email: "carla@x.cr", role: "alumno", is_admin: false };
const DIEGO = { id: "u-diego", full_name: "Diego Paz",  email: "diego@x.cr", role: "alumno", is_admin: false };
const PERFILES = [ANA, BRUNO, CARLA, DIEGO];

/* Posiciones distintas de la inicial a propósito: un tablero que se equivoque
   de columna cae en la inicial y hay que poder distinguirlo. */
const FEN_TABLERO_2 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const FEN_TABLERO_3 = "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 2";
const FEN_TRAS_LA_JUGADA = "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";

function doble(datos, usuarioId) {
  return `
window.__consultas = [];
window.__escrituras = [];
window.__emitir = null;
(function () {
  const DATOS = ${JSON.stringify(datos)};

  /* Un constructor que FILTRA de verdad. Sin esto la prueba no vale: torneo.html
     pide profiles y game_rooms con .in(), y un doble que devolviera siempre la
     tabla entera daría por buena una página que dibuja la partida de otro cruce. */
  function constructor(tabla, filas) {
    let filas2 = (filas || []).slice(), unica = false, resultado = null;
    const cmp = (a, b) => String(a) === String(b);
    const b = {
      select() { window.__consultas.push(tabla); return b; },
      eq(col, val) { filas2 = filas2.filter((r) => cmp(r[col], val)); return b; },
      neq(col, val) { filas2 = filas2.filter((r) => !cmp(r[col], val)); return b; },
      in(col, vals) { filas2 = filas2.filter((r) => (vals || []).some((v) => cmp(r[col], v))); return b; },
      is() { return b; }, not() { return b; }, or() { return b; },
      order(col, opts) {
        const asc = !opts || opts.ascending !== false;
        filas2.sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : 1) * (asc ? 1 : -1));
        return b;
      },
      limit(n) { filas2 = filas2.slice(0, n); return b; },
      range() { return b; },
      insert(fila) { window.__escrituras.push({ tabla: tabla, fila: fila }); resultado = fila; return b; },
      update(fila) { window.__escrituras.push({ tabla: tabla, update: fila }); resultado = fila; return b; },
      delete() { window.__escrituras.push({ tabla: tabla, borra: true }); resultado = null; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = resultado !== null ? resultado : filas2;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t, DATOS.tablas[t] !== undefined ? DATOS.tablas[t] : []),
    /* nombres_de_jugadores() se resuelve DESDE los perfiles, como la función de
       verdad: devuelve el nombre y nunca el correo entero. */
    rpc: (n, args) => {
      if (n === "nombres_de_jugadores") {
        const pedidos = (args && args.p_ids) || [];
        return constructor(n, (DATOS.tablas.profiles || [])
          .filter((p) => pedidos.indexOf(p.id) >= 0)
          .map((p) => ({ id: p.id, nombre: p.full_name || String(p.email || "").split("@")[0] })));
      }
      return constructor(n, []);
    },
    /* El canal guarda sus callbacks para que la prueba pueda DISPARAR una jugada
       como la dispararía la base. Sin esto no hay forma de comprobar que el
       tablero se mueva solo, que es la mitad de lo que promete el panel. */
    /* Los oyentes son de TODOS los canales, no del último que se abrió: cada
       página de la Academia abre además los suyos (la burbuja de conectados, el
       aviso de partidas asignadas), y con un __emitir reescrito en cada
       channel() la jugada iba a parar al canal de la burbuja — el tablero no se
       movía y la prueba culpaba a la página. */
    channel: () => {
      const oyentes = window.__oyentes || (window.__oyentes = []);
      const c = {
        on(tipo, opts, cb) { oyentes.push({ tabla: opts && opts.table, cb: cb }); return c; },
        subscribe(cb) { if (cb) cb("SUBSCRIBED"); return c; },
        track() { return Promise.resolve(); },
        presenceState() { return {}; },
      };
      window.__emitir = (tabla, fila) => {
        oyentes.filter((o) => o.tabla === tabla).forEach((o) => o.cb({ new: fila, eventType: "UPDATE" }));
      };
      return c;
    },
    removeChannel: () => {},
  };
})();
`;
}

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { console.log("  ✅ " + nombre); return; }
  fallos++;
  console.log("  ❌ " + nombre + (detalle !== undefined ? "  →  " + JSON.stringify(detalle) : ""));
}
/* Dos tableros iguales pueden llegar con las casillas en otro orden —el DOM las
   recorre de a8 a h1 y chess.js de a1 a h8—, así que se comparan ordenadas: si
   no, la prueba falla por el orden de las claves y no por la posición. */
function ordenado(obj) {
  return Object.keys(obj || {}).sort().reduce((acc, k) => { acc[k] = obj[k]; return acc; }, {});
}
function igualTablero(nombre, hallado, esperado) {
  return igual(nombre, ordenado(hallado), ordenado(esperado));
}
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  ok(nombre + " (" + b + ")", a === b, a);
}

async function abrir(browser, url, datos, usuarioId) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(doble(datos, usuarioId));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + url);
  await page.waitForTimeout(1800);
  return { ctx, page, errores };
}

/* Lo que de verdad se dibujó en el tablero, casilla por casilla, leyendo el DOM
   —no lo que diga la página. Se identifica la pieza por el <use> del SVG
   (#wP, #bK…), que es lo que ClasesBoard compacto pinta a este tamaño. */
const LEER_TABLERO = (selector) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const piezas = {};
  el.querySelectorAll("[data-square]").forEach((c) => {
    const uso = c.querySelector("svg.chess-piece-svg use");
    const glifo = (c.textContent || "").trim();
    if (uso) piezas[c.dataset.square] = (uso.getAttribute("xlink:href") || uso.getAttribute("href") || "").replace("#", "");
    else if (glifo) piezas[c.dataset.square] = "glifo:" + glifo;
  });
  return piezas;
};

/* La misma lectura, pero a partir de una FEN, con chess.js. Comparar el tablero
   contra la FEN que sirvió el doble es lo único que caza que se haya leído la
   columna equivocada: la posición inicial también es una posición válida. */
function piezasDeFen(fen) {
  const Chess = require("chess.js").Chess;
  const g = new Chess(fen);
  const piezas = {};
  "abcdefgh".split("").forEach((f) => {
    for (let r = 1; r <= 8; r++) {
      const p = g.get(f + r);
      if (p) piezas[f + r] = p.color + p.type.toUpperCase();
    }
  });
  return piezas;
}

// ---------------------------------------------------------------- datos base
function datosTorneo({ variant = "cartas", estadoRonda = "in_progress", salas, pairings } = {}) {
  return {
    tablas: {
      tournaments: [{
        id: "t1", name: "Cenfotec", format: "swiss", variant: variant, status: "in_progress",
        created_by: "u-profe", initial_seconds: 600, increment_seconds: 0,
        total_rounds: 3, current_round: 1, winner_ids: null,
      }],
      tournament_registrations: [ANA, BRUNO, CARLA, DIEGO].map((p) => ({ tournament_id: "t1", player_id: p.id })),
      tournament_rounds: [{ id: "rd1", tournament_id: "t1", round_number: 1, status: estadoRonda }],
      tournament_pairings: pairings,
      game_rooms: salas,
      profiles: PERFILES,
    },
  };
}

const PAIRINGS_NORMALES = [
  // A Ana le tocó bye: esa ronda no tiene NADA que hacer, y es justo quien más
  // quiere mirar los otros tableros.
  { id: "p1", tournament_id: "t1", round_id: "rd1", board_number: 1, is_bye: true,
    white_id: "u-ana", black_id: null, result: "white", needs_manual_advance: false, game_room_id: null },
  { id: "p2", tournament_id: "t1", round_id: "rd1", board_number: 2, is_bye: false,
    white_id: "u-bruno", black_id: "u-carla", result: null, needs_manual_advance: false, game_room_id: "r2" },
  { id: "p3", tournament_id: "t1", round_id: "rd1", board_number: 3, is_bye: false,
    white_id: "u-diego", black_id: "u-ana", result: null, needs_manual_advance: false, game_room_id: "r3" },
];

function salaCartas(id, white, black, fen) {
  return {
    id: id, variant: "cartas", white_id: white, black_id: black, status: "playing", result: null,
    moves: [], initial_seconds: 600, increment_seconds: 0, white_time_left: 600, black_time_left: 600,
    white_ready: true, black_ready: true, clock_updated_at: null, created_by: "u-profe",
    // La posición de Cartas vive acá dentro, NO en la columna `fen` — que a
    // propósito se deja en una posición distinta: una página que lea la columna
    // equivocada dibujaría esto y se vería perfecta.
    fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
    cartas_state: { fen: fen, turn: fen.split(" ")[1], hands: { w: ["ascenso"], b: ["vision", "salto"] }, visionUntil: null },
    duelo_state: null,
  };
}

// ================================================================ 1. torneo.html
async function pruebaPanelEnVivo(browser) {
  console.log("\n▶ torneo.html — los tableros de la ronda, en vivo");
  const datos = datosTorneo({
    pairings: PAIRINGS_NORMALES,
    salas: [salaCartas("r2", "u-bruno", "u-carla", FEN_TABLERO_2),
            salaCartas("r3", "u-diego", "u-ana", FEN_TABLERO_3)],
  });
  // Mira Ana, la del bye: es quien no tenía forma de ver nada.
  const { ctx, page, errores } = await abrir(browser, "/torneo.html?id=t1", datos, "u-ana");

  igual("la página carga sin errores de JavaScript", errores.length, 0);

  const tarjetas = await page.$$eval("#rounds-container [data-tablero-sala]", (els) => els.map((e) => e.dataset.tableroSala));
  igual("un tablero por partida en juego, y ninguno por el bye", tarjetas.slice().sort(), ["r2", "r3"]);

  // Que se VEA, y cuadrado: un tablero de alto cero se pinta igual y no se ve.
  const caja = await page.evaluate(() => {
    const el = document.querySelector('[data-tablero-sala="r2"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { visible: el.checkVisibility(), ancho: Math.round(r.width), alto: Math.round(r.height) };
  });
  ok("el tablero se ve de verdad", !!(caja && caja.visible), caja);
  ok("y es cuadrado", !!(caja && Math.abs(caja.ancho - caja.alto) <= 2), caja);

  // Cada tablero, su posición: contra la FEN que sirvió el doble.
  const pintado2 = await page.evaluate(LEER_TABLERO, '[data-tablero-sala="r2"]');
  const pintado3 = await page.evaluate(LEER_TABLERO, '[data-tablero-sala="r3"]');
  igualTablero("el tablero 2 dibuja SU posición (la de cartas_state, no la de la columna fen)",
    pintado2, piezasDeFen(FEN_TABLERO_2));
  igualTablero("el tablero 3 dibuja la suya, que es otra", pintado3, piezasDeFen(FEN_TABLERO_3));

  // A este tamaño el glifo de las blancas es un contorno hueco que se lee negro
  // (ver «Las miniaturas de la práctica» en CLAUDE.md): tiene que salir dibujado.
  /* Ojo con la forma de esta comprobación: contar solo los glifos daría verde
     sobre un tablero VACÍO, que es justo lo que pasa cuando el panel no se pinta.
     Se pide las dos cosas — que haya piezas dibujadas y que no quede ni un glifo.
     Y se lee con `|| {}`: una prueba que revienta deja sin correr todo lo que
     venía después, que es la mitad de lo que hay que mirar. */
  const valores = Object.values(pintado2 || {});
  const conGlifo = valores.filter((v) => String(v).startsWith("glifo:")).length;
  const dibujadas = valores.length - conGlifo;
  igual("las piezas se dibujan con el set de SVG, no con el glifo de texto",
    { dibujadas: dibujadas > 0, glifos: conGlifo }, { dibujadas: true, glifos: 0 });

  // Una jugada que llega por Realtime mueve ESE tablero y no recarga el torneo.
  const consultasAntes = await page.evaluate(() => window.__consultas.filter((t) => t === "tournaments").length);
  await page.evaluate((fen) => {
    window.__emitir("game_rooms", {
      id: "r2", variant: "cartas", cartas_state: { fen: fen }, fen: "8/8/8/8/8/8/8/K6k w - - 0 1", duelo_state: null,
    });
  }, FEN_TRAS_LA_JUGADA);
  await page.waitForTimeout(300);
  igualTablero("una jugada que llega sola repinta ese tablero",
    await page.evaluate(LEER_TABLERO, '[data-tablero-sala="r2"]'), piezasDeFen(FEN_TRAS_LA_JUGADA));
  igual("y no vuelve a pedir el torneo entero por una jugada",
    await page.evaluate(() => window.__consultas.filter((t) => t === "tournaments").length), consultasAntes);
  igualTablero("el tablero de al lado no se movió",
    await page.evaluate(LEER_TABLERO, '[data-tablero-sala="r3"]'), piezasDeFen(FEN_TABLERO_3));

  igual("mirar no escribe nada en la base", await page.evaluate(ESCRITURAS_DE_JUEGO), 0);
  await ctx.close();
}

// ============================================ 2. lo que NO se dibuja en vivo
async function pruebaLoQueNoSeDibuja(browser) {
  console.log("\n▶ torneo.html — lo que el panel NO enseña");

  // Niebla de Guerra en curso: la posición real no se le enseña a nadie de fuera.
  const niebla = datosTorneo({
    variant: "niebla",
    pairings: [PAIRINGS_NORMALES[0], PAIRINGS_NORMALES[1]],
    salas: [Object.assign(salaCartas("r2", "u-bruno", "u-carla", FEN_TABLERO_2),
      { variant: "niebla", cartas_state: null, fen: FEN_TABLERO_2 })],
  });
  const a = await abrir(browser, "/torneo.html?id=t1", niebla, "u-ana");
  igual("en Niebla de Guerra no se dibuja ninguna posición mientras se juega",
    await a.page.$$eval("#rounds-container [data-tablero-sala]", (e) => e.length), 0);
  ok("y se dice por qué",
    /niebla/i.test(await a.page.$eval("#rounds-container", (e) => e.innerText)));
  await a.ctx.close();

  // Una ronda ya terminada no pinta tableros: no hay nada en vivo que seguir.
  const terminada = datosTorneo({
    estadoRonda: "finished",
    pairings: [Object.assign({}, PAIRINGS_NORMALES[1], { result: "white" })],
    salas: [salaCartas("r2", "u-bruno", "u-carla", FEN_TABLERO_2)],
  });
  const b = await abrir(browser, "/torneo.html?id=t1", terminada, "u-ana");
  igual("una ronda terminada no pinta tableros en vivo",
    await b.page.$$eval("#rounds-container [data-tablero-sala]", (e) => e.length), 0);
  await b.ctx.close();
}

// ==================================== 3. las páginas de partida: mirar se puede
async function pruebaEspectadorEnCartas(browser) {
  console.log("\n▶ cartas.html — una compañera que no juega puede MIRAR");

  const sala = salaCartas("r2", "u-bruno", "u-carla", FEN_TABLERO_2);
  // La carta de visión ya jugada y apuntando a las blancas: si la página tratara
  // al espectador como jugador de blancas, le destaparía la mano de las negras.
  sala.cartas_state.visionUntil = "w";
  const datos = { tablas: { game_rooms: [sala], profiles: PERFILES } };

  const { ctx, page, errores } = await abrir(browser, "/cartas.html?room=r2", datos, "u-ana");
  igual("la página carga sin errores de JavaScript", errores.length, 0);

  const r = await page.evaluate(() => {
    const err = document.getElementById("error-state");
    return {
      errorVisible: err ? !err.classList.contains("hidden") : null,
      errorTexto: (document.getElementById("error-text") || {}).textContent,
      casillas: document.querySelectorAll("#board [data-square]").length,
      rendirseVisible: (() => { const b = document.getElementById("resign-btn"); return !!(b && b.checkVisibility()); })(),
      listoVisible: (() => { const b = document.getElementById("ready-btn"); return !!(b && b.checkVisibility()); })(),
      manoPropia: (document.getElementById("my-hand") || {}).innerText || "",
      manoRival: (document.getElementById("rival-hand") || {}).innerText || "",
      estado: (document.getElementById("status-banner") || {}).textContent || "",
      cabecera: (document.getElementById("top-player") || {}).textContent + " / " + (document.getElementById("bottom-player") || {}).textContent,
    };
  });

  ok("NO sale «No formas parte de esta partida»", r.errorVisible === false, r);
  igual("se dibuja el tablero entero", r.casillas, 64);
  ok("se dice que está mirando", /mirando/i.test(r.estado), r.estado);
  ok("con los nombres de quienes juegan, no «Jugador»",
    r.cabecera.indexOf("Bruno Mena") >= 0 && r.cabecera.indexOf("Carla Soto") >= 0, r.cabecera);

  // Mirar no es jugar, por los dos lados: acá no se ofrece nada que la base
  // fuera a rechazar (game_rooms_update no nombra a es_companero()).
  ok("no se le ofrece rendirse", r.rendirseVisible === false, r);
  ok("ni «estoy listo»", r.listoVisible === false, r);
  /* Y que no sea interactivo se mide INTENTÁNDOLO, no preguntándole a una
     variable: se toca una pieza blanca y su casilla de destino, que es lo que
     haría quien mira sin darse cuenta de que no juega. */
  const antesDeTocar = await page.evaluate(LEER_TABLERO, "#board");
  await page.click('#board [data-square="e2"]').catch(() => {});
  await page.click('#board [data-square="e4"]').catch(() => {});
  await page.waitForTimeout(300);
  igualTablero("tocar el tablero no mueve nada", await page.evaluate(LEER_TABLERO, "#board"), antesDeTocar);

  // Y lo que de verdad no puede escaparse: ninguna mano.
  ok("no se le enseña ninguna carta de la mano de las blancas",
    r.manoPropia.indexOf("Ascenso") === -1 && /🂠|Sin cartas/.test(r.manoPropia), r.manoPropia);
  ok("ni la de las negras, ni siquiera con la carta de visión jugada",
    r.manoRival.indexOf("Visión") === -1 && r.manoRival.indexOf("Salto") === -1, r.manoRival);

  igual("mirar no escribe nada en la base", await page.evaluate(ESCRITURAS_DE_JUEGO), 0);
  await ctx.close();
}

// ====================================== 4. las dos excepciones que se quedan
async function pruebaLasDosPuertasQueSiguenCerradas(browser) {
  console.log("\n▶ las dos puertas que siguen cerradas");

  // (a) Niebla en curso: quien no juega no ve la posición.
  const enCurso = {
    tablas: {
      game_rooms: [{ id: "r2", variant: "niebla", white_id: "u-bruno", black_id: "u-carla",
        status: "playing", result: null, moves: [], fen: FEN_TABLERO_2, initial_seconds: 600,
        increment_seconds: 0, white_time_left: 600, black_time_left: 600, clock_updated_at: null, created_by: "u-profe" }],
      profiles: PERFILES,
    },
  };
  const a = await abrir(browser, "/niebla.html?room=r2", enCurso, "u-ana");
  const ra = await a.page.evaluate(() => ({
    visible: !document.getElementById("error-state").classList.contains("hidden"),
    texto: document.getElementById("error-text").textContent,
    casillas: document.querySelectorAll("#board [data-square]").length,
  }));
  ok("Niebla en curso: a quien no juega se le dice que no", ra.visible === true, ra);
  ok("y se le explica por qué, no un «no formas parte»", /niebla/i.test(ra.texto), ra.texto);
  igual("y no se pinta ni una casilla", ra.casillas, 0);
  await a.ctx.close();

  // (b) Niebla terminada: ya no hay nada que tapar.
  const terminada = JSON.parse(JSON.stringify(enCurso));
  terminada.tablas.game_rooms[0].status = "finished";
  terminada.tablas.game_rooms[0].result = "white";
  const b = await abrir(browser, "/niebla.html?room=r2", terminada, "u-ana");
  igual("Niebla terminada: sí se puede repasar",
    await b.page.evaluate(() => !document.getElementById("error-state").classList.contains("hidden")), false);
  await b.ctx.close();

  // (c) El candado de verdad es la RLS: sin fila, no hay partida que mirar.
  const sinFila = { tablas: { game_rooms: [], profiles: PERFILES } };
  const c = await abrir(browser, "/cartas.html?room=r2", sinFila, "u-ana");
  const rc = await c.page.evaluate(() => ({
    visible: !document.getElementById("error-state").classList.contains("hidden"),
    texto: document.getElementById("error-text").textContent,
  }));
  ok("si la base no devuelve la sala, no se entra", rc.visible === true, rc);
  ok("y se dice que no se encontró", /no se encontró/i.test(rc.texto), rc.texto);
  await c.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPanelEnVivo(browser);
    await pruebaLoQueNoSeDibuja(browser);
    await pruebaEspectadorEnCartas(browser);
    await pruebaLasDosPuertasQueSiguenCerradas(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n❌ " + fallos + " comprobación(es) fallaron." : "\n✅ Todo en orden.");
  process.exit(fallos ? 1 : 0);
})();
