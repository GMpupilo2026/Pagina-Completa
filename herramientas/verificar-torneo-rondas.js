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

   El doble hace cumplir el índice único de (tournament_id, round_number) como
   la base, y tarda en contestar las escrituras: sin esa demora el segundo clic
   nunca alcanza a llegar mientras el primero trabaja.

   Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
         node herramientas/verificar-torneo-rondas.js                          */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE = { id: "u-profe", full_name: "Profe Oscar", email: "profe@x.cr", role: "profesor", is_admin: false };
const JUGADORES = ["u-ana", "u-bruno", "u-carla", "u-diego"].map((id, i) => ({
  id: id, full_name: ["Ana Rojas", "Bruno Mena", "Carla Soto", "Diego Paz"][i], email: id + "@x.cr", role: "alumno", is_admin: false,
}));

function doble(datos, usuarioId) {
  return `
(function () {
  const T = ${JSON.stringify(datos)};
  window.__T = T;
  window.__escrituras = [];
  let siguiente = 1;
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

function datosBase(torneo, rondas) {
  return {
    tournaments: [Object.assign({
      id: "t1", name: "Copa de sábado", format: "swiss", variant: "estandar",
      created_by: PROFE.id, initial_seconds: 600, increment_seconds: 0, winner_ids: null,
    }, torneo)],
    tournament_registrations: JUGADORES.map((p, i) => ({ tournament_id: "t1", player_id: p.id, registered_at: "2026-09-26T10:0" + i })),
    tournament_rounds: rondas || [],
    tournament_pairings: [],
    game_rooms: [],
    profiles: [PROFE].concat(JUGADORES),
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

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaEmpezar(browser);
    await pruebaTrabado(browser);
    await pruebaGenerarDosVeces(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n❌ " + fallos + " comprobación(es) fallaron" : "\n✅ Todo en orden");
  process.exit(fallos ? 1 : 0);
})();
