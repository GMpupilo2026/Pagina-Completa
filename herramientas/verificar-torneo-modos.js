/* Comprueba que un torneo se pueda jugar en TODAS las modalidades de a dos y
   en «Aleatorio», que cambia de modalidad ronda a ronda. Ver «Los torneos, en
   todas las modalidades y en aleatorio» en docs/decisiones/juegos-y-torneos.md.

   Lo que pone la BASE (tournaments_variant_check, tournament_rounds.variant y
   su trigger: en un torneo fijo la ronda lleva la del torneo, en uno aleatorio
   tiene que venir, y después no cambia) se comprobó en SQL. Esto es:
     1. Sin navegador: la lista de modalidades de torneo (MODOS_TORNEO, de
        js/juegos-comun.js) son las once de a dos, las mismas que acepta la
        migración; y el sorteo, en mil torneos simulados, no repite ninguna
        hasta que salgan todas ni pone la misma dos rondas seguidas.
     2. torneos.html: el formulario ofrece las once y «Aleatorio», dice de qué
        se trata cada una y manda la elegida.
     3. torneo.html, torneo aleatorio: ronda a ronda, cada una sale con una
        modalidad distinta de la anterior, sus salas son de ESA modalidad y
        arrancan con su estado (las cartas, el volcán sorteado…), la ronda lo
        dice escrito y el «Jugar →» lleva a la página de esa modalidad.
     4. torneo.html, torneo fijo en Camaleón: las salas arrancan con la
        posición de Camaleón y van a variante.html.
     5. Las partidas en vivo: A ciegas, Niebla y Abrazos no se dibujan (y lo
        dicen); Vampiro sí.
     6. variante.html: un compañero que no juega puede MIRAR una partida de
        Volcanes (antes: «No formas parte de esta partida»), pero no una A
        ciegas en curso.
     7. Las modalidades del sorteo (tournaments.modos_aleatorio, ver «Las
        modalidades que entran al sorteo»): el sorteo con una lista no se
        sale de ella; al crear, las casillas salen todas marcadas, menos de
        dos no crea nada y lo dice, y lo marcado se manda (todas = nulo); en
        un torneo con lista, las rondas salen solo de ella y se dice cuáles
        entran; quien organiza las cambia y vale desde la ronda siguiente, y
        a una inscrita no se le pinta la tarjeta.
     8. Aleatorio en eliminación directa: con 8, 6 y 5 inscritos (con byes)
        llega al campeón, cada ronda con su modalidad distinta de la anterior
        y dicha, y unas tablas se resuelven con «Avanza …» como siempre.

   Uso: con el sitio en localhost:8777 (npm run verificar lo levanta solo),
        node herramientas/verificar-torneo-modos.js */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

const DE_A_DOS = ["estandar", "crazyhouse", "cartas", "duelo", "niebla", "abrazos", "camaleon", "vampiro", "ciegas", "volcanes", "misiones"];
const PAGINA = { estandar: "estandar.html", crazyhouse: "crazyhouse.html", cartas: "cartas.html", duelo: "duelo.html", niebla: "niebla.html" };
const paginaDe = (v) => PAGINA[v] || "variante.html";

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { console.log("  ✅ " + nombre); return; }
  fallos++;
  console.log("  ❌ " + nombre + (detalle !== undefined ? "  →  " + JSON.stringify(detalle) : ""));
}

/* ---------------------------------------------------------- 1. sin navegador */
function cargarComun() {
  const ctx = { window: {}, document: { createElement: () => ({}) }, Math: Math };
  vm.createContext(ctx);
  const codigo = fs.readFileSync(path.join(RAIZ, "js", "juegos-comun.js"), "utf8") +
    "\n;this.__x = { MODOS_TORNEO, ALEATORIO, sortearModoDeRonda, modosDelSorteo, etiquetaModoTorneo, pageFor2pVariant };";
  vm.runInContext(codigo, ctx);
  return ctx.__x;
}

function pruebaLista() {
  console.log("\n▶ Las modalidades de torneo y el sorteo, sin navegador");
  const C = cargarComun();
  ok("MODOS_TORNEO son las once de a dos", JSON.stringify([...C.MODOS_TORNEO].sort()) === JSON.stringify([...DE_A_DOS].sort()), C.MODOS_TORNEO);
  ok("ni relevo ni las de 4 jugadores", !C.MODOS_TORNEO.some((v) => ["relevo", "4ffa", "4teams"].includes(v)));
  ok("cada una va a la página que la juega", C.MODOS_TORNEO.every((v) => C.pageFor2pVariant(v) === paginaDe(v)),
    C.MODOS_TORNEO.map((v) => v + "→" + C.pageFor2pVariant(v)));

  // La base acepta las mismas: se lee de la migración que las abrió.
  const migraciones = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).sort();
  // Todas, en orden: vale la última vez que se escribió cada restricción.
  const sql = migraciones.map((m) => fs.readFileSync(path.join(RAIZ, "supabase", "migraciones", m), "utf8")).join("\n");
  const lista = (nombre) => {
    const i = sql.lastIndexOf("add constraint " + nombre);
    if (i < 0) return null;
    const trozo = sql.slice(i, sql.indexOf(";", i));
    return [...trozo.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
  };
  const torneos = lista("tournaments_variant_check");
  ok("tournaments acepta las once y «aleatorio»", JSON.stringify(torneos) === JSON.stringify([...DE_A_DOS, "aleatorio"].sort()), torneos);
  const rondas = lista("tournament_rounds_variant_check");
  ok("una ronda acepta las once (y no «aleatorio»)", JSON.stringify(rondas) === JSON.stringify([...DE_A_DOS].sort()), rondas);
  const salas = lista("game_rooms_variant_check");
  ok("game_rooms acepta todas las de torneo", !!salas && C.MODOS_TORNEO.every((v) => salas.includes(v)), salas);

  let repiteAntes = 0, seguidas = 0, faltan = 0;
  for (let t = 0; t < 1000; t++) {
    const jugadas = [];
    for (let r = 0; r < 25; r++) jugadas.push(C.sortearModoDeRonda(jugadas.slice(), jugadas[jugadas.length - 1]));
    const primeras = jugadas.slice(0, C.MODOS_TORNEO.length);
    if (new Set(primeras).size !== primeras.length) repiteAntes++;
    if (C.MODOS_TORNEO.some((v) => !primeras.includes(v))) faltan++;
    for (let r = 1; r < jugadas.length; r++) if (jugadas[r] === jugadas[r - 1]) seguidas++;
  }
  ok("en 1000 torneos, ninguna se repite antes de que salgan todas", repiteAntes === 0, repiteAntes);
  ok("en las once primeras rondas salen las once", faltan === 0, faltan);
  ok("nunca la misma dos rondas seguidas (25 rondas)", seguidas === 0, seguidas);

  // Con una lista elegida: nunca se sale de ella, y la recorre igual que a las once.
  const LISTA = ["cartas", "volcanes", "camaleon"];
  let fuera = 0, seguidasLista = 0, faltanLista = 0;
  for (let t = 0; t < 1000; t++) {
    const jugadas = [];
    for (let r = 0; r < 9; r++) jugadas.push(C.sortearModoDeRonda(jugadas.slice(), jugadas[jugadas.length - 1], LISTA));
    fuera += jugadas.filter((v) => !LISTA.includes(v)).length;
    if (LISTA.some((v) => !jugadas.slice(0, 3).includes(v))) faltanLista++;
    for (let r = 1; r < jugadas.length; r++) if (jugadas[r] === jugadas[r - 1]) seguidasLista++;
  }
  ok("con una lista de 3, ninguna ronda se sale de ella (1000 torneos)", fuera === 0, fuera);
  ok("con una lista de 3, en las 3 primeras rondas salen las 3", faltanLista === 0, faltanLista);
  ok("con una lista de 3, nunca la misma dos rondas seguidas", seguidasLista === 0, seguidasLista);
  // Si la lista cambia a mitad de torneo, lo jugado fuera de ella no cuenta.
  const tras = C.sortearModoDeRonda(["estandar", "niebla"], "niebla", ["duelo", "abrazos"]);
  ok("lo jugado fuera de la lista nueva no la estorba", ["duelo", "abrazos"].includes(tras), tras);
  ok("sin lista, el sorteo es entre las once", C.modosDelSorteo(null).length === 11 && C.modosDelSorteo([]).length === 11);
  ok("una lista con algo que no es de a dos se queda sin eso", JSON.stringify(C.modosDelSorteo(["relevo", "cartas", "4ffa", "duelo"])) === JSON.stringify(["cartas", "duelo"]));
  ok("«Aleatorio» se nombra como tal", /Aleatorio/.test(C.etiquetaModoTorneo("aleatorio")), C.etiquetaModoTorneo("aleatorio"));
}

/* ---------------------------------------------------------- el doble */
const PROFE = { id: "u-profe", full_name: "Profe Oscar", email: "profe@x.cr", role: "profesor", is_admin: false };
const JUGADORES = Array.from({ length: 6 }, (_, i) => ({ id: "u-j" + (i + 1), full_name: "Jugador " + (i + 1), email: "j" + (i + 1) + "@x.cr", role: "alumno", is_admin: false }));

/* Guarda lo escrito en sessionStorage (torneos.html se va a torneo.html al
   crear) y hace lo que hace la base con la modalidad de la ronda
   (interno.modalidad_de_la_ronda): en un torneo fijo, la del torneo. Los
   filtros se aplican en el resolver. */
function doble(datos, usuarioId) {
  return `
(function () {
  let guardado = null;
  try { guardado = JSON.parse(sessionStorage.getItem("__doble")); } catch (e) {}
  const T = guardado ? guardado.T : ${JSON.stringify(datos)};
  window.__T = T;
  let siguiente = guardado ? guardado.siguiente : 1;
  window.__guardar = () => sessionStorage.setItem("__doble", JSON.stringify({ T: T, siguiente: siguiente }));
  const cmp = (a, b) => String(a) === String(b);
  function constructor(tabla) {
    const filtros = [];
    let op = "select", carga = null, unica = false, devolver = false, orden = null;
    const b = {
      select() { devolver = true; return b; },
      eq(c, v) { filtros.push((r) => cmp(r[c], v)); return b; },
      neq(c, v) { filtros.push((r) => !cmp(r[c], v)); return b; },
      in(c, vs) { filtros.push((r) => (vs || []).some((v) => cmp(r[c], v))); return b; },
      is(c, v) { filtros.push((r) => (r[c] === undefined ? null : r[c]) === v); return b; },
      not() { return b; }, or() { return b; }, range() { return b; }, limit() { return b; }, gte() { return b; }, lte() { return b; },
      order(c, o) { orden = { c: c, asc: !o || o.ascending !== false }; return b; },
      insert(f) { op = "insert"; carga = f; return b; },
      update(f) { op = "update"; carga = f; return b; },
      upsert(f) { op = "insert"; carga = f; return b; },
      delete() { op = "delete"; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) { return resolver().then(res, rej); },
    };
    async function resolver() {
      const r = await resolver2();
      if (op !== "select") window.__guardar();
      return r;
    }
    async function resolver2() {
      const filas = T[tabla] || (T[tabla] = []);
      const pasa = (r) => filtros.every((f) => f(r));
      if (op === "insert") {
        const nuevas = (Array.isArray(carga) ? carga : [carga]).map((f) => Object.assign({ id: tabla + "-" + (siguiente++) }, JSON.parse(JSON.stringify(f))));
        // Los CHECK de la base: una ronda o una sala solo de una modalidad de a dos.
        const DE_A_DOS = ${JSON.stringify(DE_A_DOS)};
        if ((tabla === "game_rooms" || tabla === "tournament_rounds") && nuevas.some((n) => n.variant && !DE_A_DOS.includes(n.variant)))
          return { data: null, error: { message: 'new row for relation "' + tabla + '" violates check constraint "' + tabla + '_variant_check"' } };
        if (tabla === "tournament_rounds") {
          for (const n of nuevas) {
            if (n.status === undefined) n.status = "in_progress";
            const t = T.tournaments.find((x) => x.id === n.tournament_id);
            if (t.variant !== "aleatorio") n.variant = t.variant;
            else if (!n.variant) return { data: null, error: { message: "En un torneo aleatorio cada ronda lleva su modalidad" } };
            else if (t.modos_aleatorio && !t.modos_aleatorio.includes(n.variant)) return { data: null, error: { message: "Esa modalidad no está entre las que eligió quien organiza el torneo" } };
          }
        }
        // Las columnas que la base deja en null (o en su default) si no vienen:
        // un cruce sin result tiene que leerse null, no undefined, o
        // maybeFinishRound lo da por resuelto.
        if (tabla === "tournament_pairings") nuevas.forEach((n) => { if (n.result === undefined) n.result = null; if (n.needs_manual_advance === undefined) n.needs_manual_advance = false; });
        if (tabla === "game_rooms") nuevas.forEach((n) => { if (n.status === undefined) n.status = "playing"; if (!n.moves) n.moves = []; });
        nuevas.forEach((n) => filas.push(n));
        return { data: unica ? nuevas[0] : nuevas, error: null };
      }
      if (op === "update") {
        const tocadas = filas.filter(pasa);
        // Lo de interno.modalidad_de_la_ronda() y proteger_torneo(): la modalidad
        // de una ronda no cambia, y las del sorteo solo las cambia quien organiza.
        tocadas.forEach((r) => {
          const c = JSON.parse(JSON.stringify(carga));
          if (tabla === "tournament_rounds") delete c.variant;
          if (tabla === "tournaments" && r.created_by !== ${JSON.stringify(usuarioId)}) delete c.modos_aleatorio;
          Object.assign(r, c);
        });
        return { data: devolver ? tocadas.map((r) => Object.assign({}, r)) : null, error: null };
      }
      if (op === "delete") { T[tabla] = filas.filter((r) => !pasa(r)); return { data: null, error: null }; }
      let d = filas.filter(pasa).map((r) => JSON.parse(JSON.stringify(r)));
      if (orden) d.sort((x, y) => (x[orden.c] < y[orden.c] ? -1 : x[orden.c] > y[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1));
      if (unica) d = d.length ? d[0] : null;
      return { data: d, error: null };
    }
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: ${JSON.stringify(usuarioId)} } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t),
    rpc: (n, a) => {
      let data = [];
      if (n === "hora_servidor_ms") data = Date.now();
      if (n === "nombres_de_jugadores") data = ((a && a.p_ids) || []).map((id) => ({ id: id, nombre: (T.profiles.find((p) => p.id === id) || {}).full_name || id }));
      if (n === "repartir_misiones") data = null;
      const pr = Promise.resolve({ data: data, error: null });
      return { then: (x, y) => pr.then(x, y), maybeSingle: () => pr, single: () => pr };
    },
    channel: () => {
      const c = { on() { return c; }, subscribe(cb) { if (cb) setTimeout(() => cb("SUBSCRIBED"), 0); return c; }, unsubscribe() { return Promise.resolve(); },
                  track() { return Promise.resolve(); }, presenceState() { return {}; }, send() { return Promise.resolve(); } };
      return c;
    },
    removeChannel: () => Promise.resolve(),
    getChannels: () => [],
  };
  try { localStorage.setItem("oscarMoveHelpShown_v1", "1"); } catch (e) {}
})();
`;
}

function datosBase(torneo, extra) {
  return Object.assign({
    tournaments: [Object.assign({
      id: "t1", name: "Copa de todas", format: "swiss", variant: "aleatorio", status: "registration",
      created_by: PROFE.id, initial_seconds: 600, increment_seconds: 0, winner_ids: null, current_round: 0, total_rounds: null,
    }, torneo)],
    tournament_registrations: JUGADORES.map((p, i) => ({ tournament_id: "t1", player_id: p.id, registered_at: "2026-10-17T10:" + String(i).padStart(2, "0") })),
    tournament_rounds: [], tournament_pairings: [], game_rooms: [],
    profiles: [PROFE].concat(JUGADORES), public_tournament_champions: [],
  }, extra || {});
}

async function abrir(browser, ruta, datos, usuario) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(doble(datos, usuario || PROFE.id));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + ruta);
  await page.waitForTimeout(1200);
  return { ctx, page, errores };
}

/* ---------------------------------------------------------- 2. torneos.html */
async function pruebaFormulario(browser) {
  console.log("\n▶ torneos.html: crear un torneo en cualquier modalidad");
  for (const elegida of ["volcanes", "aleatorio"]) {
    const { ctx, page, errores } = await abrir(browser, "/torneos.html", datosBase({}, { tournaments: [] }));
    const opciones = await page.$$eval("#variant-select option", (os) => os.map((o) => o.value));
    if (elegida === "volcanes") {
      ok("ofrece las once modalidades y «Aleatorio» al final", opciones.length === 12 && opciones[11] === "aleatorio" && DE_A_DOS.every((v) => opciones.includes(v)), opciones);
    }
    await page.selectOption("#variant-select", elegida);
    const desc = await page.textContent("#variant-desc");
    ok("dice de qué se trata «" + elegida + "»", elegida === "aleatorio" ? /distinta/.test(desc) : /volcán/.test(desc), desc);
    const campo = await page.locator("#modos-campo").evaluate((e) => e.checkVisibility());
    ok(elegida === "aleatorio" ? "las casillas del sorteo se ven" : "las casillas del sorteo no se ven", campo === (elegida === "aleatorio"));
    await page.fill("#name-input", "Copa " + elegida);
    await page.click("#create-form button[type=submit]");
    await page.waitForURL(/torneo\.html\?id=/, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    const t = await page.evaluate(() => window.__T.tournaments[0]);
    ok("se crea con variant = «" + elegida + "»", t && t.variant === elegida, t && t.variant);
    const meta = await page.textContent("#t-meta").catch(() => "");
    ok("la cabecera del torneo nombra la modalidad", elegida === "aleatorio" ? /Aleatorio/.test(meta) : /Volcanes/.test(meta), meta);
    ok("sin errores de JavaScript", errores.length === 0, errores);
    await ctx.close();
  }
}

/* ---------------------------------------------------------- 7. el sorteo, elegido */
async function pruebaElegirAlCrear(browser) {
  console.log("\n▶ torneos.html: elegir qué modalidades entran al sorteo");
  const { ctx, page, errores } = await abrir(browser, "/torneos.html", datosBase({}, { tournaments: [] }));
  await page.selectOption("#variant-select", "aleatorio");
  const marcadas = await page.$$eval("#modos-casillas input", (cs) => cs.filter((c) => c.checked).map((c) => c.value));
  ok("salen las once, todas marcadas", marcadas.length === 11 && DE_A_DOS.every((v) => marcadas.includes(v)), marcadas);
  ok("y la cuenta lo dice", /las 11/.test(await page.textContent("#modos-cuenta")), await page.textContent("#modos-cuenta"));
  // Se deja una sola: no se crea nada, y lo dice.
  for (const v of DE_A_DOS) if (v !== "cartas") await page.uncheck("#modos-casillas input[value=" + v + "]");
  ok("con una sola, la cuenta pide al menos 2", /al menos 2/.test(await page.textContent("#modos-cuenta")), await page.textContent("#modos-cuenta"));
  await page.fill("#name-input", "Copa elegida");
  await page.click("#create-form button[type=submit]");
  await page.waitForTimeout(500);
  const msg = await page.textContent("#create-msg");
  const creados = await page.evaluate(() => window.__T.tournaments.length);
  ok("con una sola no se crea el torneo y se dice por qué", creados === 0 && /al menos 2/.test(msg), { creados, msg });
  await page.check("#modos-casillas input[value=volcanes]");
  await page.check("#modos-casillas input[value=duelo]");
  ok("con tres, la cuenta dice «3 de 11»", /3 de 11/.test(await page.textContent("#modos-cuenta")), await page.textContent("#modos-cuenta"));
  await page.click("#create-form button[type=submit]");
  await page.waitForURL(/torneo\.html\?id=/, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => window.__T.tournaments[0]);
  ok("se manda la lista marcada", t && JSON.stringify((t.modos_aleatorio || []).slice().sort()) === JSON.stringify(["cartas", "duelo", "volcanes"]), t && t.modos_aleatorio);
  const linea = await page.locator("#t-modos").evaluate((e) => e.checkVisibility() ? e.textContent : null);
  ok("el torneo dice cuáles entran", !!linea && /3 de 11/.test(linea) && /Volcanes/.test(linea) && !/Niebla/.test(linea), linea);
  ok("sin errores de JavaScript", errores.length === 0, errores);
  await ctx.close();

  // Con las once marcadas se guarda nulo: «todas», también las que se sumen.
  const b = await abrir(browser, "/torneos.html", datosBase({}, { tournaments: [] }));
  await b.page.selectOption("#variant-select", "aleatorio");
  await b.page.fill("#name-input", "Copa todas");
  await b.page.click("#create-form button[type=submit]");
  await b.page.waitForURL(/torneo\.html\?id=/, { timeout: 5000 }).catch(() => {});
  await b.page.waitForTimeout(800);
  const t2 = await b.page.evaluate(() => window.__T.tournaments[0]);
  ok("con todas marcadas se guarda nulo (= las once)", t2 && t2.modos_aleatorio === null, t2 && t2.modos_aleatorio);
  await b.ctx.close();
}

async function pruebaRondasDeLaLista(browser) {
  const LISTA = ["volcanes", "cartas", "abrazos"];
  console.log("\n▶ torneo.html: un aleatorio con " + LISTA.join(", ") + ", y cambiar la lista a mitad");
  const { ctx, page, errores } = await abrir(browser, "/torneo.html?id=t1", datosBase({ modos_aleatorio: LISTA }));
  const linea = await page.locator("#t-modos").evaluate((e) => e.checkVisibility() ? e.textContent : null);
  ok("se dice cuáles entran al sorteo", !!linea && /3 de 11/.test(linea), linea);
  const tarjeta = await page.locator("#modos-seccion").evaluate((e) => e.checkVisibility());
  ok("quien organiza ve la tarjeta para cambiarlas", tarjeta);
  const puestas = await page.$$eval("#modos-casillas input", (cs) => cs.filter((c) => c.checked).map((c) => c.value).sort());
  ok("con las del torneo marcadas", JSON.stringify(puestas) === JSON.stringify(LISTA.slice().sort()), puestas);
  await page.fill("#rounds-input", "6");
  await page.click("#start-btn");
  await page.waitForTimeout(1200);
  for (let n = 1; n < 3; n++) {
    await cerrarRonda(page, n);
    await page.click("#generate-round-btn");
    await page.waitForFunction((k) => document.querySelectorAll("#rounds-container h3").length === k, n + 1, { timeout: 8000 }).catch(() => {});
  }
  let modos = await page.evaluate(() => window.__T.tournament_rounds.slice().sort((a, b) => a.round_number - b.round_number).map((r) => r.variant));
  ok("las tres primeras rondas son las tres de la lista", modos.length === 3 && JSON.stringify(modos.slice().sort()) === JSON.stringify(LISTA.slice().sort()), modos);

  // A mitad de torneo: pasa a niebla y duelo, y vale desde la ronda siguiente.
  for (const v of LISTA) await page.uncheck("#modos-casillas input[value=" + v + "]");
  await page.check("#modos-casillas input[value=niebla]");
  await page.check("#modos-casillas input[value=duelo]");
  await page.click("#modos-guardar");
  await page.waitForTimeout(500);
  const guardado = await page.evaluate(() => window.__T.tournaments[0].modos_aleatorio);
  ok("se guarda la lista nueva", JSON.stringify((guardado || []).slice().sort()) === JSON.stringify(["duelo", "niebla"]), guardado);
  ok("y lo dice", /Guardado/.test(await page.textContent("#modos-msg")), await page.textContent("#modos-msg"));
  const ronda3 = modos[2];
  for (let n = 3; n < 6; n++) {
    await cerrarRonda(page, n);
    await page.click("#generate-round-btn");
    await page.waitForFunction((k) => document.querySelectorAll("#rounds-container h3").length === k, n + 1, { timeout: 8000 }).catch(() => {});
  }
  modos = await page.evaluate(() => window.__T.tournament_rounds.slice().sort((a, b) => a.round_number - b.round_number).map((r) => r.variant));
  ok("la ronda en juego se quedó con la suya", modos[2] === ronda3, modos);
  ok("de la 4 a la 6, solo niebla y duelo, alternadas", modos.length === 6 && modos.slice(3).every((v) => v === "niebla" || v === "duelo") && modos.slice(3).every((m, i, a) => i === 0 || m !== a[i - 1]), modos);

  // Menos de dos no se guarda.
  await page.uncheck("#modos-casillas input[value=duelo]");
  await page.click("#modos-guardar");
  await page.waitForTimeout(400);
  const sigue = await page.evaluate(() => window.__T.tournaments[0].modos_aleatorio);
  ok("con una sola no se guarda, y lo dice", JSON.stringify((sigue || []).slice().sort()) === JSON.stringify(["duelo", "niebla"]) && /al menos 2/.test(await page.textContent("#modos-msg")), sigue);
  ok("sin errores de JavaScript", errores.length === 0, errores);
  await ctx.close();

  // Una inscrita: ve la lista, no la tarjeta, y si lo intenta la base lo revierte.
  const b = await abrir(browser, "/torneo.html?id=t1", datosBase({ modos_aleatorio: LISTA }), "u-j1");
  const r = await b.page.evaluate(() => ({
    linea: document.getElementById("t-modos").checkVisibility(),
    tarjeta: document.getElementById("modos-seccion").checkVisibility(),
  }));
  ok("la inscrita ve qué modalidades entran", r.linea);
  ok("pero no la tarjeta para cambiarlas", !r.tarjeta);
  ok("sin errores de JavaScript (inscrita)", b.errores.length === 0, b.errores);
  await b.ctx.close();
}

/* ---------------------------------------------------------- 8. eliminación */
async function pruebaEliminacion(browser, n, conTablas) {
  console.log("\n▶ torneo.html: aleatorio en eliminación directa con " + n + " inscritos" + (conTablas ? " y unas tablas" : ""));
  const jugadores = Array.from({ length: n }, (_, i) => ({ id: "u-e" + (i + 1), full_name: "Elim " + (i + 1), email: "e" + (i + 1) + "@x.cr", role: "alumno", is_admin: false }));
  const datos = datosBase({ format: "elimination", modos_aleatorio: null });
  datos.tournament_registrations = jugadores.map((p, i) => ({ tournament_id: "t1", player_id: p.id, registered_at: "2026-10-17T10:" + String(i).padStart(2, "0") }));
  datos.profiles = [PROFE].concat(jugadores);
  const { ctx, page, errores } = await abrir(browser, "/torneo.html?id=t1", datos);
  await page.click("#start-btn");
  await page.waitForFunction(() => document.querySelectorAll("#rounds-container h3").length === 1, null, { timeout: 8000 }).catch(() => {});
  const total = await page.evaluate(() => window.__T.tournaments[0].total_rounds);
  ok("las rondas son las de una llave (" + Math.ceil(Math.log2(n)) + ")", total === Math.ceil(Math.log2(n)), total);
  const pasos = [];
  for (let r = 1; r <= total; r++) {
    await page.evaluate(async ([r, conTablas]) => {
      const ronda = window.__T.tournament_rounds.find((x) => x.round_number === r);
      window.__T.tournament_pairings.filter((p) => p.round_id === ronda.id && !p.is_bye).forEach((p, i) => {
        if (conTablas && r === 1 && i === 0) { p.result = "draw"; p.needs_manual_advance = true; } else p.result = "white";
        p.finished_at = new Date().toISOString();
      });
      window.__guardar();
      await TorneoSync.maybeFinishRound(window.sb, ronda.id);
    }, [r, conTablas]);
    await page.reload();
    await page.waitForTimeout(900);
    if (conTablas && r === 1) {
      const avanza = page.locator("#rounds-container button", { hasText: "Avanza" }).first();
      if (!(await avanza.isVisible().catch(() => false))) { pasos.push("no se ofrece «Avanza …» tras las tablas"); break; }
      await avanza.click();
      await page.waitForTimeout(900);
    }
    if (r === total) break;
    const boton = page.locator("#generate-round-btn");
    if (!/Generar ronda/.test(await boton.textContent()) || await boton.isDisabled()) { pasos.push("trabado tras la ronda " + r); break; }
    await boton.click();
    await page.waitForFunction((k) => document.querySelectorAll("#rounds-container h3").length === k, r + 1, { timeout: 8000 }).catch(() => {});
  }
  ok("cada ronda se cierra y ofrece la siguiente", pasos.length === 0, pasos);
  const res = await page.evaluate(() => {
    const rondas = window.__T.tournament_rounds.slice().sort((a, b) => a.round_number - b.round_number);
    return {
      modos: rondas.map((x) => x.variant),
      salasDeSuModo: rondas.every((ro) => window.__T.tournament_pairings.filter((p) => p.round_id === ro.id && !p.is_bye)
        .every((p) => (window.__T.game_rooms.find((s) => s.id === p.game_room_id) || {}).variant === ro.variant)),
      dichas: [...document.querySelectorAll("[data-modo-ronda]")].filter((e) => e.checkVisibility()).length,
      t: window.__T.tournaments[0],
      cartel: document.getElementById("finished-banner").checkVisibility(),
    };
  });
  ok("cada ronda con una modalidad distinta de las de antes", res.modos.length === total && new Set(res.modos).size === total, res.modos);
  ok("sus salas son de su modalidad", res.salasDeSuModo);
  ok("cada ronda dice en qué se juega", res.dichas === total, res.dichas);
  ok("el torneo cierra con un campeón", res.t.status === "finished" && (res.t.winner_ids || []).length === 1 && res.cartel, { status: res.t.status, winner_ids: res.t.winner_ids });
  ok("sin errores de JavaScript", errores.length === 0, errores);
  await ctx.close();
}

/* ---------------------------------------------------------- 3. aleatorio */
async function cerrarRonda(page, numero) {
  await page.evaluate(async (numero) => {
    const ronda = window.__T.tournament_rounds.find((r) => r.round_number === numero);
    window.__T.tournament_pairings.filter((p) => p.round_id === ronda.id && !p.is_bye).forEach((p) => { p.result = "draw"; p.finished_at = new Date().toISOString(); });
    window.__guardar();
    await TorneoSync.maybeFinishRound(window.sb, ronda.id);
  }, numero);
  await page.reload();
  await page.waitForTimeout(900);
}

async function pruebaAleatorio(browser) {
  const N = 13;
  console.log("\n▶ torneo.html: un torneo aleatorio de " + N + " rondas");
  const { ctx, page, errores } = await abrir(browser, "/torneo.html?id=t1", datosBase());
  await page.fill("#rounds-input", String(N));
  await page.click("#start-btn");
  await page.waitForTimeout(1200);
  const problemas = [];
  for (let n = 1; n <= N; n++) {
    const r = await page.evaluate((n) => {
      const ronda = window.__T.tournament_rounds.find((x) => x.round_number === n);
      if (!ronda) return null;
      const cruces = window.__T.tournament_pairings.filter((p) => p.round_id === ronda.id && !p.is_bye);
      const salas = cruces.map((p) => window.__T.game_rooms.find((s) => s.id === p.game_room_id));
      const caja = [...document.querySelectorAll("#rounds-container h3")].find((h) => h.textContent.startsWith("Ronda " + n + " "));
      const linea = caja && caja.parentElement.querySelector("[data-modo-ronda]");
      // El «Jugar →» de cada cruce y su tablerito en vivo: los dos a la misma página.
      const enlaces = caja ? [...new Set([...caja.parentElement.querySelectorAll("a[href*='?room=']")].map((a) => a.getAttribute("href")))] : [];
      return {
        modo: ronda.variant, salas: salas.map((s) => s && s.variant),
        estado: salas.map((s) => s && { cartas: !!s.cartas_state, duelo: !!s.duelo_state, volcanes: !!(s.variant_state && s.variant_state.volcanes), ciegas: !!(s.variant_state && s.variant_state.w_unlocks === 5), fen: s.fen }),
        linea: linea && linea.checkVisibility() ? linea.textContent : null, enlaces: enlaces,
      };
    }, n);
    if (!r) { problemas.push("no se armó la ronda " + n); break; }
    const p = [];
    if (!DE_A_DOS.includes(r.modo)) p.push("modalidad " + r.modo);
    if (!r.salas.length || r.salas.some((v) => v !== r.modo)) p.push("salas " + r.salas.join(","));
    if (r.modo === "cartas" && !r.estado.every((e) => e.cartas)) p.push("sin cartas");
    if (r.modo === "duelo" && !r.estado.every((e) => e.duelo)) p.push("sin duelo_state");
    if (r.modo === "volcanes" && !r.estado.every((e) => e.volcanes)) p.push("sin volcán sorteado");
    if (r.modo === "ciegas" && !r.estado.every((e) => e.ciegas)) p.push("sin las 5 miradas");
    if (["estandar", "niebla", "vampiro", "volcanes", "misiones"].includes(r.modo) && !r.estado.every((e) => /^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w KQkq - 0 1$/.test(e.fen))) p.push("FEN de salida");
    if (!r.linea || !/^Se juega: /.test(r.linea)) p.push("no dice la modalidad: " + r.linea);
    if (r.enlaces.length !== r.salas.length || r.enlaces.some((h) => !h.startsWith(paginaDe(r.modo) + "?room="))) p.push("enlaces " + r.enlaces.join(","));
    if (p.length) problemas.push({ ronda: n, modo: r.modo, p: p });
    if (n < N) {
      await cerrarRonda(page, n);
      await page.click("#generate-round-btn");
      await page.waitForFunction((k) => document.querySelectorAll("#rounds-container h3").length === k, n + 1, { timeout: 8000 }).catch(() => {});
    }
  }
  const modos = await page.evaluate(() => window.__T.tournament_rounds.slice().sort((a, b) => a.round_number - b.round_number).map((r) => r.variant));
  ok("cada ronda: salas de su modalidad, con su estado, escrita y con su enlace", problemas.length === 0, problemas);
  ok("se armaron las " + N + " rondas", modos.length === N, modos);
  ok("las once primeras son las once modalidades, sin repetir", new Set(modos.slice(0, 11)).size === 11, modos);
  ok("ninguna se repite dos rondas seguidas", modos.every((m, i) => i === 0 || m !== modos[i - 1]), modos);
  ok("sin errores de JavaScript", errores.length === 0, errores);
  await ctx.close();
}

/* ---------------------------------------------------------- 4. fijo */
async function pruebaFijo(browser) {
  console.log("\n▶ torneo.html: un torneo fijo en Camaleón");
  const { ctx, page, errores } = await abrir(browser, "/torneo.html?id=t1", datosBase({ variant: "camaleon" }));
  await page.click("#start-btn");
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({
    ronda: window.__T.tournament_rounds[0] && window.__T.tournament_rounds[0].variant,
    salas: window.__T.game_rooms.map((s) => s.variant + "|" + s.fen),
    linea: !!document.querySelector("[data-modo-ronda]"),
    enlaces: [...new Set([...document.querySelectorAll("#rounds-container a[href*='?room=']")].map((a) => a.getAttribute("href")))],
  }));
  ok("la ronda queda en Camaleón", r.ronda === "camaleon", r.ronda);
  ok("las salas son de Camaleón y arrancan con su posición", r.salas.length === 3 && r.salas.every((s) => s === "camaleon|rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"), r.salas);
  ok("en un torneo fijo no hace falta decirlo en cada ronda", !r.linea);
  ok("«Jugar →» lleva a variante.html", r.enlaces.length === 3 && r.enlaces.every((h) => h.startsWith("variante.html?room=")), r.enlaces);
  ok("sin errores de JavaScript", errores.length === 0, errores);
  await ctx.close();
}

/* ---------------------------------------------------------- 5. en vivo */
async function pruebaEnVivo(browser) {
  console.log("\n▶ torneo.html: las partidas en vivo según su modalidad");
  const VAMPIRO_FEN = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
  for (const [modo, dibuja] of [["ciegas", false], ["niebla", false], ["abrazos", false], ["vampiro", true]]) {
    const salas = [
      { id: "s1", variant: modo, white_id: "u-j1", black_id: "u-j2", status: "playing", result: null, fen: modo === "abrazos" ? '{"b":{}}' : VAMPIRO_FEN, moves: ["e4", "e5"] },
      { id: "s2", variant: modo, white_id: "u-j3", black_id: "u-j4", status: "playing", result: null, fen: modo === "abrazos" ? '{"b":{}}' : VAMPIRO_FEN, moves: ["e4", "e5"] },
    ];
    const datos = datosBase({ status: "in_progress", current_round: 1, total_rounds: 3 }, {
      tournament_rounds: [{ id: "rd1", tournament_id: "t1", round_number: 1, status: "in_progress", variant: modo }],
      tournament_pairings: [
        { id: "p1", round_id: "rd1", tournament_id: "t1", board_number: 1, white_id: "u-j1", black_id: "u-j2", is_bye: false, result: null, game_room_id: "s1" },
        { id: "p2", round_id: "rd1", tournament_id: "t1", board_number: 2, white_id: "u-j3", black_id: "u-j4", is_bye: false, result: null, game_room_id: "s2" },
      ],
      game_rooms: salas,
    });
    const { ctx, page, errores } = await abrir(browser, "/torneo.html?id=t1", datos, "u-j5");
    const r = await page.evaluate(() => ({
      tableros: document.querySelectorAll("[data-tablero-sala]").length,
      tarjetas: [...document.querySelectorAll("a[href*='?room=s']")].filter((a) => a.querySelector("p")).map((a) => a.textContent),
      piezaE4: (() => { const t = document.querySelector("[data-tablero-sala]"); return t ? t.textContent.length > 0 || t.querySelectorAll("svg").length : null; })(),
    }));
    if (dibuja) ok(modo + ": se dibujan los dos tableros", r.tableros === 2, r);
    else ok(modo + ": no se dibuja ninguno, y cada tarjeta dice por qué", r.tableros === 0 && r.tarjetas.length === 2 && r.tarjetas.every((t) => /termine|terminar|entrando/.test(t)), r);
    ok(modo + ": sin errores de JavaScript", errores.length === 0, errores);
    await ctx.close();
  }
}

/* ---------------------------------------------------------- 6. variante.html */
async function pruebaMirar(browser) {
  console.log("\n▶ variante.html: un compañero que no juega");
  for (const [modo, puede] of [["volcanes", true], ["camaleon", true], ["ciegas", false]]) {
    const sala = {
      id: "v1", variant: modo, white_id: "u-j1", black_id: "u-j2", status: "playing", result: null,
      fen: modo === "camaleon" ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1" : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      moves: [], white_ready: true, black_ready: true, initial_seconds: 600, increment_seconds: 0, white_time_left: 600, black_time_left: 600,
      variant_state: modo === "volcanes" ? { volcanes: [{ casilla: "d4", jugada: 6 }] } : modo === "ciegas" ? { w_unlocks: 5, b_unlocks: 5 } : null,
    };
    const { ctx, page, errores } = await abrir(browser, "/variante.html?room=v1", datosBase({}, { game_rooms: [sala] }), "u-j5");
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const e = document.getElementById("error-state");
      return { error: e && e.checkVisibility() ? document.getElementById("error-text").textContent : null,
               tablero: !!document.querySelector("#board") && document.querySelector("#board").checkVisibility() };
    });
    if (puede) ok(modo + ": la puede mirar", !r.error && r.tablero, r);
    else ok(modo + " en curso: no se mira desde fuera, y lo dice", !!r.error && /ciegas/.test(r.error), r);
    ok(modo + ": sin errores de JavaScript", errores.length === 0, errores);
    await ctx.close();
  }
}

async function correr(prueba, ...args) {
  try { await prueba(...args); }
  catch (e) { fallos++; console.log("  ❌ " + prueba.name + " se cayó: " + String(e && e.message || e).split("\n")[0]); }
}

(async () => {
  await correr(pruebaLista);
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await correr(pruebaFormulario, browser);
    await correr(pruebaAleatorio, browser);
    await correr(pruebaFijo, browser);
    await correr(pruebaEnVivo, browser);
    await correr(pruebaMirar, browser);
    await correr(pruebaElegirAlCrear, browser);
    await correr(pruebaRondasDeLaLista, browser);
    await correr(pruebaEliminacion, browser, 8, false);
    await correr(pruebaEliminacion, browser, 6, false);
    await correr(pruebaEliminacion, browser, 5, true);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n❌ " + fallos + " comprobación(es) fallaron" : "\n✅ Todo en orden");
  process.exit(fallos ? 1 : 0);
})();
