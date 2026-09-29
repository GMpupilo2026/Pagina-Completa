/* Comprueba, en un navegador de verdad y con un Supabase de mentira que GUARDA
   lo que se le escribe, que empezar un torneo y generar una ronda pase UNA vez
   y con el número de ronda correcto.

   El error que lo motivó: «Generar ronda» fallaba en cada clic con
   `duplicate key … tournament_rounds_tournament_id_round_number_key`. Un
   segundo clic en «Empezar torneo», mientras se armaba la ronda 1, volvía a
   empezarlo y dejaba current_round en 0 con la ronda 1 ya creada: desde ahí la
   página pedía siempre la ronda 1. Ver «Empezar y generar una ronda, una sola
   vez» en docs/decisiones/juegos-y-torneos.md.

   Lo que pone la BASE (proteger_torneo(): current_round no baja, un torneo
   empezado no vuelve a inscripción) se comprobó impersonando roles en SQL.
   Esto es la página:
     1. Doble clic en «Empezar torneo» → un solo arranque y una sola ronda 1.
     2. Un torneo trabado (current_round 0 con la ronda 1 terminada) genera la
        ronda 2, no otra ronda 1.
     3. Doble clic en «Generar ronda» → una sola ronda nueva.
     4. El campo de rondas del Suizo: lo que no es un entero de 1 a 20 no
        empieza el torneo, y pedir más rondas de las que alcanzan sin repetir
        rival se avisa.
     5. Un torneo de 7 rondas se juega entero: el suizo (10 jugadores, 7
        rondas escritas a mano) y el todos contra todos de 8 (7 rondas solas)
        llegan a la ronda 7, no ofrecen una 8.ª y cierran el torneo con su
        campeón una sola vez. Antes, el motor, sin la página, con 7 rondas y
        de 2 a 128 jugadores: el suizo no repite rival mientras haya con quién
        y reparte los colores; la eliminación de 65 a 128 pide 7 rondas y
        termina en un campeón. Ver «Siete rondas» en
        docs/decisiones/juegos-y-torneos.md.
     6. Y uno de 20, el máximo del campo: un Suizo de 24 de punta a punta, y
        el motor con 20 rondas de 2 a 200 jugadores. Ver «Veinte rondas».

   El doble hace cumplir el índice único de (tournament_id, round_number) como
   la base, y tarda en contestar las escrituras: sin esa demora el segundo clic
   nunca alcanza a llegar mientras el primero trabaja.

   Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
         node herramientas/verificar-torneo-rondas.js                          */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE = { id: "u-profe", full_name: "Profe Oscar", email: "profe@x.cr", role: "profesor", is_admin: false };
const NOMBRES = ["Ana Rojas", "Bruno Mena", "Carla Soto", "Diego Paz", "Elena Vargas",
  "Fabián Mora", "Gabriela Solís", "Héctor Brenes", "Irene Castro", "Julián Araya"];
const alumno = (nombre) => {
  const id = "u-" + nombre.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return { id: id, full_name: nombre, email: id + "@x.cr", role: "alumno", is_admin: false };
};
const JUGADORES = NOMBRES.slice(0, 4).map(alumno);

function doble(datos, usuarioId) {
  return `
(function () {
  /* Lo escrito se guarda en sessionStorage: así la página se puede recargar
     (el torneo de 7 rondas recarga entre ronda y ronda) y sigue viendo lo
     que ya escribió, como con la base de verdad. */
  let guardado = null;
  try { guardado = JSON.parse(sessionStorage.getItem("__doble")); } catch (e) {}
  const T = guardado ? guardado.T : ${JSON.stringify(datos)};
  window.__T = T;
  window.__escrituras = guardado ? guardado.escrituras : [];
  let siguiente = guardado ? guardado.siguiente : 1;
  window.__guardar = () => sessionStorage.setItem("__doble", JSON.stringify({ T: T, escrituras: window.__escrituras, siguiente: siguiente }));
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const cmp = (a, b) => String(a) === String(b);

  /* Los filtros se apuntan y se aplican en el RESOLVER (then), también para
     update y delete: así un update condicional (.eq("status", …)) toca solo lo
     que de verdad cumple, como en la base. */
  function constructor(tabla) {
    const filtros = [];
    let op = "select", carga = null, unica = false, devolver = false, orden = null;
    const b = {
      select() { devolver = true; return b; },
      eq(c, v) { filtros.push((r) => cmp(r[c], v)); return b; },
      neq(c, v) { filtros.push((r) => !cmp(r[c], v)); return b; },
      in(c, vs) { filtros.push((r) => (vs || []).some((v) => cmp(r[c], v))); return b; },
      is(c, v) { filtros.push((r) => (r[c] === undefined ? null : r[c]) === v); return b; },
      not() { return b; }, or() { return b; }, range() { return b; }, limit() { return b; },
      order(c, o) { orden = { c: c, asc: !o || o.ascending !== false }; return b; },
      insert(f) { op = "insert"; carga = f; return b; },
      update(f) { op = "update"; carga = f; return b; },
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
        await espera(120);
        const nuevas = (Array.isArray(carga) ? carga : [carga]).map((f) => Object.assign({ id: tabla + "-" + (siguiente++) }, f));
        if (tabla === "tournament_rounds") {
          for (const n of nuevas) {
            if (n.status === undefined) n.status = "in_progress";
            if (filas.some((r) => r.tournament_id === n.tournament_id && r.round_number === n.round_number)) {
              window.__escrituras.push({ tabla: tabla, op: "insert", rechazada: true, fila: n });
              return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "tournament_rounds_tournament_id_round_number_key"' } };
            }
          }
        }
        nuevas.forEach((n) => { filas.push(n); window.__escrituras.push({ tabla: tabla, op: "insert", fila: n }); });
        return { data: unica ? nuevas[0] : nuevas, error: null };
      }
      if (op === "update") {
        await espera(120);
        const tocadas = filas.filter(pasa);
        tocadas.forEach((r) => Object.assign(r, carga));
        window.__escrituras.push({ tabla: tabla, op: "update", carga: carga, filas: tocadas.length });
        return { data: devolver ? tocadas.map((r) => Object.assign({}, r)) : null, error: null };
      }
      if (op === "delete") {
        const quedan = filas.filter((r) => !pasa(r));
        window.__escrituras.push({ tabla: tabla, op: "delete", filas: filas.length - quedan.length });
        T[tabla] = quedan;
        return { data: null, error: null };
      }
      let d = filas.filter(pasa).map((r) => Object.assign({}, r));
      if (orden) d.sort((x, y) => (x[orden.c] < y[orden.c] ? -1 : x[orden.c] > y[orden.c] ? 1 : 0) * (orden.asc ? 1 : -1));
      if (unica) d = d.length ? d[0] : null;
      return { data: d, error: null };
    }
    return b;
  }

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t),
    rpc: (n) => {
      if (n === "mis_funciones_coordinacion") return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: [], error: null });
    },
    channel: () => {
      const c = { on() { return c; }, subscribe(cb) { if (cb) cb("SUBSCRIBED"); return c; },
                  track() { return Promise.resolve(); }, presenceState() { return {}; } };
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

function datosBase(torneo, rondas, jugadores) {
  jugadores = jugadores || JUGADORES;
  return {
    tournaments: [Object.assign({
      id: "t1", name: "Copa de sábado", format: "swiss", variant: "estandar",
      created_by: PROFE.id, initial_seconds: 600, increment_seconds: 0, winner_ids: null,
    }, torneo)],
    tournament_registrations: jugadores.map((p, i) => ({ tournament_id: "t1", player_id: p.id, registered_at: "2026-09-26T10:" + String(i).padStart(2, "0") })),
    tournament_rounds: rondas || [],
    tournament_pairings: [],
    game_rooms: [],
    profiles: [PROFE].concat(jugadores),
    public_tournament_champions: [],
  };
}

async function abrir(browser, datos) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(doble(datos, PROFE.id));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/torneo.html?id=t1");
  await page.waitForTimeout(1500);
  return { ctx, page, errores };
}

const RESUMEN = () => ({
  rondas: window.__T.tournament_rounds.map((r) => r.round_number).sort(),
  rechazadas: window.__escrituras.filter((e) => e.rechazada).length,
  arranques: window.__escrituras.filter((e) => e.tabla === "tournaments" && e.op === "update" && e.carga.status === "in_progress" && e.filas > 0).length,
  current_round: window.__T.tournaments[0].current_round,
  salas: window.__T.game_rooms.length,
  errores: [...document.querySelectorAll("[data-tipo='error']")].map((e) => e.textContent),
});

async function dobleClic(page, selector) {
  // Dos clics de verdad, el segundo mientras el primero espera a la base.
  await page.click(selector);
  await page.waitForTimeout(60);
  await page.click(selector, { force: true }).catch(() => {});
  await page.waitForTimeout(2500);
}

async function pruebaEmpezar(browser) {
  console.log("\n▶ Doble clic en «Empezar torneo»");
  const { ctx, page, errores } = await abrir(browser, datosBase({ status: "registration", current_round: 0, total_rounds: null }));
  await dobleClic(page, "#start-btn");
  const r = await page.evaluate(RESUMEN);
  ok("la página no tira errores de JavaScript", errores.length === 0, errores);
  ok("el torneo se empieza UNA vez", r.arranques === 1, r);
  ok("hay una sola ronda, la 1", JSON.stringify(r.rondas) === "[1]", r.rondas);
  ok("ninguna ronda rechazada por repetida", r.rechazadas === 0, r);
  ok("current_round queda en 1", r.current_round === 1, r.current_round);
  ok("una sala por cruce (4 jugadores → 2), sin salas de más", r.salas === 2, r.salas);
  ok("ningún aviso de error", r.errores.length === 0, r.errores);
  await ctx.close();
}

async function pruebaTrabado(browser) {
  console.log("\n▶ Torneo trabado: current_round en 0 con la ronda 1 terminada");
  const { ctx, page, errores } = await abrir(browser, datosBase(
    { status: "in_progress", current_round: 0, total_rounds: 3 },
    [{ id: "rd1", tournament_id: "t1", round_number: 1, status: "finished" }]));
  const texto = await page.textContent("#generate-round-btn");
  ok("el botón ofrece la ronda 2", /ronda 2/.test(texto), texto);
  await page.click("#generate-round-btn");
  await page.waitForTimeout(2500);
  const r = await page.evaluate(RESUMEN);
  ok("la página no tira errores de JavaScript", errores.length === 0, errores);
  ok("se crea la ronda 2", JSON.stringify(r.rondas) === "[1,2]", r.rondas);
  ok("ninguna ronda rechazada por repetida", r.rechazadas === 0, r);
  ok("ningún aviso de error", r.errores.length === 0, r.errores);
  await ctx.close();
}

async function pruebaGenerarDosVeces(browser) {
  console.log("\n▶ Doble clic en «Generar ronda»");
  const { ctx, page, errores } = await abrir(browser, datosBase(
    { status: "in_progress", current_round: 1, total_rounds: 3 },
    [{ id: "rd1", tournament_id: "t1", round_number: 1, status: "finished" }]));
  await dobleClic(page, "#generate-round-btn");
  const r = await page.evaluate(RESUMEN);
  ok("la página no tira errores de JavaScript", errores.length === 0, errores);
  ok("una sola ronda nueva, la 2", JSON.stringify(r.rondas) === "[1,2]", r.rondas);
  ok("ninguna ronda rechazada por repetida", r.rechazadas === 0, r);
  ok("una sala por cruce, sin salas de más", r.salas === 2, r.salas);
  ok("ningún aviso de error", r.errores.length === 0, r.errores);
  await ctx.close();
}


/* ---------- El motor, sin la página ---------- */

function cargarMotor() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "js", "torneo-engine.js"), "utf8"), ctx);
  return ctx.window.TorneoEngine;
}

// Resultados de mentira pero repetibles: la misma semilla, el mismo torneo.
function azar(semilla) {
  let s = semilla;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

// Juega un suizo de `rondas` con `n` jugadores y cuenta lo que importa.
function suizoSimulado(E, n, rondas, semilla) {
  const ids = Array.from({ length: n }, (_, i) => "p" + i);
  const r = azar(semilla);
  const todos = [], vistos = new Set(), colores = {};
  ids.forEach((id) => { colores[id] = []; });
  let repetidos = 0, faltantes = 0;
  for (let k = 1; k <= rondas; k++) {
    const cruces = E.swissRound(ids, todos, ids);
    const enRonda = new Set();
    cruces.forEach((c) => {
      enRonda.add(c.white);
      if (c.isBye) return;
      enRonda.add(c.black);
      const clave = [c.white, c.black].sort().join("|");
      if (vistos.has(clave)) repetidos++;
      vistos.add(clave);
      colores[c.white].push(1); colores[c.black].push(-1);
      const q = r();
      c.result = q < 0.4 ? "white" : q < 0.8 ? "black" : "draw";
    });
    if (enRonda.size !== n) faltantes++;
    todos.push(...cruces);
  }
  let peorDiferencia = 0, peorRacha = 0;
  ids.forEach((id) => {
    const c = colores[id];
    peorDiferencia = Math.max(peorDiferencia, Math.abs(c.reduce((a, x) => a + x, 0)));
    let racha = 1;
    for (let i = 1; i < c.length; i++) { racha = c[i] === c[i - 1] ? racha + 1 : 1; peorRacha = Math.max(peorRacha, racha); }
  });
  const byes = E.standingsFromPairings(ids, todos).byes;
  return { repetidos, faltantes, peorDiferencia, peorRacha, byesDobles: ids.filter((id) => byes[id] > 1).length };
}

function pruebaMotor() {
  console.log("\n▶ El motor con 7 rondas");
  const E = cargarMotor();

  const cortos = [];
  for (let n = 2; n <= 128; n++) {
    for (let semilla = 1; semilla <= (n <= 16 ? 40 : 3); semilla++) {
      const r = suizoSimulado(E, n, 7, semilla * 131 + n);
      if (r.faltantes) cortos.push({ n, semilla, r });
    }
  }
  ok("suizo: de 2 a 128 jugadores, las 7 rondas traen a todos (con bye si son impares)", cortos.length === 0, cortos.slice(0, 3));

  const conRepetidos = [], desparejos = [], rachas3 = [], rachasLargas = [];
  let torneos = 0;
  for (let n = 9; n <= 40; n++) {
    for (let semilla = 1; semilla <= 40; semilla++) {
      const r = suizoSimulado(E, n, 7, semilla * 977 + n);
      torneos++;
      if (r.repetidos || r.byesDobles) conRepetidos.push({ n, semilla, r });
      if (r.peorDiferencia > 2) desparejos.push({ n, semilla, r });
      if (r.peorRacha === 3) rachas3.push({ n, semilla });
      if (r.peorRacha > 3) rachasLargas.push({ n, semilla, r });
    }
  }
  ok("suizo: de 9 a 40 jugadores, nadie repite rival ni recibe dos byes en 7 rondas", conRepetidos.length === 0, conRepetidos.slice(0, 3));
  ok("suizo: nadie termina con más de 2 blancas de diferencia con sus negras (ni al revés)", desparejos.length === 0, desparejos.slice(0, 3));
  // Tres seguidas con el mismo color pasa solo cuando evitarlas obligaba a
  // repetir rival, y no repetir va primero (como en el reglamento FIDE).
  ok("suizo: tres seguidas del mismo color en menos del 1 % de los torneos, cuatro nunca",
     rachas3.length / torneos < 0.01 && rachasLargas.length === 0, { rachas3: rachas3.length, de: torneos, rachasLargas: rachasLargas.slice(0, 3) });

  // Con 8 jugadores no siempre se puede (7 rondas es el todos contra todos
  // entero, y un suizo no lo planea desde el principio), pero casi siempre.
  let repetidos8 = 0;
  for (let semilla = 1; semilla <= 200; semilla++) repetidos8 += suizoSimulado(E, 8, 7, semilla * 7).repetidos;
  ok("suizo de 8: menos de un cruce repetido cada 2 torneos", repetidos8 / 200 < 0.5, repetidos8 / 200);

  let lento = 0;
  const t0 = Date.now();
  suizoSimulado(E, 200, 7, 5);
  lento = Date.now() - t0;
  ok("suizo de 200 jugadores: las 7 rondas se arman en menos de 2 s", lento < 2000, lento + " ms");

  [7, 8].forEach((n) => {
    const ids = Array.from({ length: n }, (_, i) => "p" + i);
    const total = E.suggestedTotalRounds("round_robin", n);
    const vistos = {};
    for (let k = 1; k <= total; k++) {
      E.roundRobinRound(ids, k).forEach((c) => { if (!c.isBye) { const cl = [c.white, c.black].sort().join("|"); vistos[cl] = (vistos[cl] || 0) + 1; } });
    }
    const todosUnaVez = Object.keys(vistos).length === n * (n - 1) / 2 && Object.values(vistos).every((v) => v === 1);
    ok("todos contra todos de " + n + ": 7 rondas y cada pareja se enfrenta una sola vez", total === 7 && todosUnaVez, { total, cruces: Object.keys(vistos).length });
  });
  // Colores, con cualquier cantidad: las tablas de Berger los reparten con
  // una de diferencia como mucho y nunca tres seguidas iguales.
  const rrMal = [];
  for (let n = 3; n <= 22; n++) {
    const ids = Array.from({ length: n }, (_, i) => "p" + i);
    const colores = {};
    ids.forEach((id) => { colores[id] = []; });
    for (let k = 1; k <= E.suggestedTotalRounds("round_robin", n); k++) {
      E.roundRobinRound(ids, k).forEach((c) => { if (!c.isBye) { colores[c.white].push(1); colores[c.black].push(-1); } });
    }
    ids.forEach((id) => {
      const c = colores[id];
      const tres = c.some((x, i) => i >= 2 && x === c[i - 1] && x === c[i - 2]);
      if (Math.abs(c.reduce((a, x) => a + x, 0)) > 1 || tres) rrMal.push({ n, id, colores: c.join(" ") });
    });
  }
  ok("todos contra todos de 3 a 22: nadie pasa de 1 blanca de diferencia ni juega 3 seguidas del mismo color", rrMal.length === 0, rrMal.slice(0, 3));

  // ---- 20 rondas, el máximo del campo ----
  const cortos20 = [], evitables20 = [], lejosDelMinimo = [], colores20 = [];
  for (const n of [2, 3, 4, 5, 8, 10, 15, 20, 21, 22, 25, 30, 40, 64, 100]) {
    for (let semilla = 1; semilla <= (n <= 40 ? 10 : 3); semilla++) {
      const r = suizoSimulado(E, n, 20, semilla * 313 + n);
      if (r.faltantes) cortos20.push({ n, semilla });
      if (n >= 25 && (r.repetidos || r.byesDobles)) evitables20.push({ n, semilla, r });
      if (n >= 25 && r.peorDiferencia > 2) colores20.push({ n, semilla, r });
      // Con 20 o menos no se puede no repetir: hay más partidas que parejas
      // posibles. Lo que se pide es que repita casi lo mínimo que se puede.
      const minimo = Math.max(0, 20 * Math.floor(n / 2) - n * (n - 1) / 2);
      if (n <= 20 && r.repetidos > minimo + 2) lejosDelMinimo.push({ n, semilla, repetidos: r.repetidos, minimo });
    }
  }
  ok("suizo de 20 rondas: de 2 a 100 jugadores, cada ronda trae a todos", cortos20.length === 0, cortos20.slice(0, 3));
  ok("suizo de 20 rondas: de 25 a 100 jugadores, nadie repite rival ni recibe dos byes", evitables20.length === 0, evitables20.slice(0, 3));
  ok("suizo de 20 rondas: de 25 a 100 jugadores, nadie pasa de 2 blancas de diferencia", colores20.length === 0, colores20.slice(0, 3));
  ok("suizo de 20 rondas con 20 o menos: repite a lo sumo 2 cruces más que el mínimo posible", lejosDelMinimo.length === 0, lejosDelMinimo.slice(0, 3));
  const t20 = Date.now();
  suizoSimulado(E, 200, 20, 9);
  const lento20 = Date.now() - t20;
  ok("suizo de 200 jugadores: las 20 rondas se arman en menos de 5 s", lento20 < 5000, lento20 + " ms");

  const elim = [];
  [65, 100, 128].forEach((n) => {
    const ids = Array.from({ length: n }, (_, i) => "p" + i);
    const total = E.suggestedTotalRounds("elimination", n);
    let cruces = E.eliminationFirstRound(ids, azar(n));
    let rondas = 1;
    while (true) {
      cruces.forEach((c, i) => { if (!c.isBye) c.result = i % 2 ? "black" : "white"; });
      if (cruces.length === 1) break;
      cruces = E.eliminationNextRound(cruces);
      rondas++;
    }
    if (total !== 7 || rondas !== 7 || cruces.length !== 1 || cruces[0].isBye) elim.push({ n, total, rondas });
  });
  ok("eliminación directa de 65, 100 y 128: pide 7 rondas y la 7.ª es la final", elim.length === 0, elim);
  ok("eliminación directa de 64: son 6 rondas, no 7", E.suggestedTotalRounds("elimination", 64) === 6);
}

/* ---------- La página, de la ronda 1 a la 7 ---------- */

// Cierra la ronda en curso como si se hubieran jugado sus partidas: pone un
// resultado a cada cruce y deja que TorneoSync la cierre (y, en la última,
// el torneo), igual que cuando termina la última partida de la ronda.
async function jugarRonda(page, numero) {
  return page.evaluate(async (numero) => {
    const ronda = window.__T.tournament_rounds.find((r) => r.round_number === numero);
    if (!ronda) return "no hay ronda " + numero;
    window.__T.tournament_pairings.filter((p) => p.round_id === ronda.id && !p.is_bye).forEach((p) => {
      p.result = ["white", "black", "draw"][(p.board_number + numero) % 3];
      p.finished_at = new Date().toISOString();
    });
    window.__guardar();
    await TorneoSync.maybeFinishRound(window.sb, ronda.id);
    return window.__T.tournament_rounds.find((r) => r.id === ronda.id).status;
  }, numero);
}

// Recarga y espera a que la página termine de pintar el torneo.
async function recargar(page) {
  await page.reload();
  await page.waitForFunction(() => {
    const b = document.getElementById("generate-round-btn");
    return document.getElementById("finished-banner").checkVisibility() || /Generar ronda \d+/.test(b.textContent);
  }, null, { timeout: 15000 }).catch(() => {});
}

/* Espera a que la página termine de armar la ronda k: lo último que hace
   generateRound() es repintar, así que la ronda pintada quiere decir que ya
   no queda nada suyo en vuelo. Esperar solo a que la ronda exista en el
   doble no alcanza: la página todavía estaba cerrando cosas, y la recarga
   siguiente se lo cortaba a la mitad (el torneo no se cerraba nunca). */
async function esperarRondaPintada(page, k) {
  await page.waitForFunction((k) => document.querySelectorAll("#rounds-container h3").length === k,
    k, { timeout: 15000 }).catch(() => {});
}

/* Un torneo entero, de la ronda 1 a la última, por la página: empezarlo
   (escribiendo las rondas en el campo si es Suizo), y ronda por ronda jugar
   sus partidas, recargar y generar la siguiente, hasta que el torneo cierre. */
async function pruebaTorneoEntero(browser, formato, jugadores, rondas) {
  const titulo = formato === "swiss"
    ? "Suizo de " + jugadores.length + ", " + rondas + " rondas escritas a mano"
    : "Todos contra todos de " + jugadores.length;
  console.log("\n▶ " + titulo + ": el torneo entero, de la ronda 1 a la " + rondas);
  const { ctx, page, errores } = await abrir(browser, datosBase(
    { status: "registration", current_round: 0, total_rounds: null, format: formato }, [], jugadores));

  if (formato === "swiss") {
    const campo = page.locator("#rounds-input");
    ok("el campo de rondas se ve", await campo.evaluate((e) => e.checkVisibility()));
    await campo.fill(String(rondas));
    ok("el campo acepta " + rondas + " rondas", await campo.evaluate((e) => e.checkValidity()));
  }
  await page.click("#start-btn");
  await esperarRondaPintada(page, 1);
  let t = await page.evaluate(() => window.__T.tournaments[0]);
  ok("el torneo queda con " + rondas + " rondas", t.total_rounds === rondas, t.total_rounds);

  const pasos = [];
  for (let n = 1; n <= rondas; n++) {
    const estado = await jugarRonda(page, n);
    if (estado !== "finished") { pasos.push("la ronda " + n + " no se cerró: " + estado); break; }
    await recargar(page);
    if (n === rondas) break;
    const boton = page.locator("#generate-round-btn");
    const texto = (await boton.textContent()).trim();
    const habilitado = (await boton.evaluate((e) => e.checkVisibility())) && !(await boton.isDisabled());
    if (texto !== "Generar ronda " + (n + 1) || !habilitado) { pasos.push({ ronda: n + 1, texto, habilitado }); break; }
    await boton.click();
    await esperarRondaPintada(page, n + 1);
  }
  ok("cada ronda se cierra y ofrece la siguiente, hasta la " + rondas, pasos.length === 0, pasos);

  const r = await page.evaluate(RESUMEN);
  t = await page.evaluate(() => window.__T.tournaments[0]);
  const cruces = await page.evaluate(() => window.__T.tournament_pairings);
  const porRonda = {};
  cruces.forEach((c) => { (porRonda[c.round_id] = porRonda[c.round_id] || []).push(c); });
  const rondasIncompletas = Object.values(porRonda).filter((cs) => {
    const ids = new Set();
    cs.forEach((c) => { ids.add(c.white_id); if (c.black_id) ids.add(c.black_id); });
    return ids.size !== jugadores.length;
  }).length;
  const parejas = {};
  cruces.filter((c) => !c.is_bye).forEach((c) => { const k = [c.white_id, c.black_id].sort().join("|"); parejas[k] = (parejas[k] || 0) + 1; });
  const repetidas = Object.entries(parejas).filter(([, v]) => v > 1);
  const blancas = {};
  cruces.filter((c) => !c.is_bye).forEach((c) => { blancas[c.white_id] = (blancas[c.white_id] || 0) + 1; });
  const partidas = {};
  cruces.filter((c) => !c.is_bye).forEach((c) => { partidas[c.white_id] = (partidas[c.white_id] || 0) + 1; partidas[c.black_id] = (partidas[c.black_id] || 0) + 1; });
  const colorDesparejo = jugadores.filter((j) => Math.abs(2 * (blancas[j.id] || 0) - (partidas[j.id] || 0)) > 2).map((j) => j.full_name);
  const todas = JSON.stringify(Array.from({ length: rondas }, (_, i) => i + 1));

  ok("la página no tira errores de JavaScript", errores.length === 0, errores);
  ok("hay exactamente " + rondas + " rondas, de la 1 a la " + rondas, JSON.stringify(r.rondas.slice().sort((x, y) => x - y)) === todas, r.rondas);
  ok("ninguna ronda rechazada por repetida", r.rechazadas === 0, r);
  ok("cada ronda trae a todos los jugadores", rondasIncompletas === 0, rondasIncompletas);
  ok("nadie repite rival en las " + rondas + " rondas", repetidas.length === 0, repetidas);
  ok("nadie juega más de 2 blancas de diferencia con sus negras", colorDesparejo.length === 0, colorDesparejo);
  ok("current_round queda en " + rondas, t.current_round === rondas, t.current_round);
  ok("al cerrar la última el torneo termina, con campeón", t.status === "finished" && (t.winner_ids || []).length > 0, { status: t.status, winner_ids: t.winner_ids });
  const campeones = await page.evaluate(() => window.__T.public_tournament_champions.length);
  ok("el campeón entra al salón de la fama una sola vez", campeones === (t.winner_ids || []).length, campeones);

  const boton = await page.locator("#generate-round-btn").evaluate((e) => e.checkVisibility());
  ok("ya no se ofrece una ronda " + (rondas + 1), !boton);
  const cartel = await page.locator("#finished-banner").evaluate((e) => e.checkVisibility());
  ok("se ve el cartel de torneo terminado", cartel);
  ok("ningún aviso de error", r.errores.length === 0, r.errores);
  await ctx.close();
}

/* El campo de rondas del Suizo: lo que no es un entero de 1 a 20 no empieza
   el torneo (antes «-3» lo empezaba con -3 rondas y se quedaba sin ninguna,
   y «25» pasaba), y pedir más rondas de las que alcanzan sin repetir rival
   lo avisa ahí mismo. */
async function pruebaCampoDeRondas(browser) {
  console.log("\n▶ El campo de rondas del Suizo");
  const jugadores = NOMBRES.map(alumno);
  const { ctx, page, errores } = await abrir(browser, datosBase(
    { status: "registration", current_round: 0, total_rounds: null, format: "swiss" }, [], jugadores));
  const campo = page.locator("#rounds-input");
  const aviso = page.locator("#rounds-aviso");

  for (const malo of ["-3", "0", "21", "25", "2.5"]) {
    await campo.fill(malo);
    await page.click("#start-btn");
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({
      estado: window.__T.tournaments[0].status,
      total: window.__T.tournaments[0].total_rounds,
      rondas: window.__T.tournament_rounds.length,
      error: [...document.querySelectorAll("[data-tipo='error']")].map((e) => e.textContent).pop() || "",
    }));
    ok("con «" + malo + "» el torneo no empieza y lo dice", r.estado === "registration" && r.total === null && r.rondas === 0 && /de 1 a 20/.test(r.error), r);
    if (r.estado !== "registration") { await ctx.close(); return; }   // ya empezó: el campo no está más
  }

  await campo.fill("9");
  ok("con 10 inscritos y 9 rondas no hay aviso", ((await aviso.textContent()) || "").trim() === "");
  await campo.fill("20");
  const texto = ((await aviso.textContent()) || "").trim();
  ok("con 10 inscritos y 20 rondas avisa que alcanzan 9 sin repetir",
     (await aviso.evaluate((e) => e.checkVisibility())) && /Con 10 inscritos alcanzan 9 rondas sin repetir rival; con 20/.test(texto), texto);
  ok("el aviso lo lee el lector de pantalla (aria-describedby del campo)",
     (await campo.getAttribute("aria-describedby")) === "rounds-aviso" && (await aviso.getAttribute("aria-live")) === "polite");

  await page.click("#start-btn");
  await esperarRondaPintada(page, 1);
  const t = await page.evaluate(() => window.__T.tournaments[0]);
  ok("con 20 el torneo empieza igual: repetir rival se puede, solo se avisa", t.status === "in_progress" && t.total_rounds === 20, t);
  ok("la página no tira errores de JavaScript", errores.length === 0, errores);
  await ctx.close();
}

// Una prueba que revienta cuenta como fallo y deja correr a las demás: si no,
// lo que venía después se quedaba sin mirar.
async function correr(prueba, ...args) {
  try { await prueba(...args); }
  catch (e) { fallos++; console.log("  ❌ " + prueba.name + " se cayó: " + String(e && e.message || e).split("\n")[0]); }
}

(async () => {
  pruebaMotor();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await correr(pruebaEmpezar, browser);
    await correr(pruebaTrabado, browser);
    await correr(pruebaGenerarDosVeces, browser);
    await correr(pruebaCampoDeRondas, browser);
    await correr(pruebaTorneoEntero, browser, "swiss", NOMBRES.map(alumno), 7);
    await correr(pruebaTorneoEntero, browser, "round_robin", NOMBRES.slice(0, 8).map(alumno), 7);
    // 20, el máximo del campo, con 24 inscritos: alcanzan para no repetir.
    await correr(pruebaTorneoEntero, browser, "swiss", Array.from({ length: 24 }, (_, i) => ({
      id: "u-p" + (i + 1), full_name: "Participante " + (i + 1), email: "p" + (i + 1) + "@x.cr", role: "alumno", is_admin: false,
    })), 20);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n❌ " + fallos + " comprobación(es) fallaron" : "\n✅ Todo en orden");
  process.exit(fallos ? 1 : 0);
})();
