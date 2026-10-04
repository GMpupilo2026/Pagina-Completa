/* Los cuatro juegos nuevos, en un navegador de verdad: Volcanes y Misiones
   secretas (variante.html), Relevo en silencio (relevo.html) y La partida
   perdida (partida-perdida.html).

   Mide lo que se ve y lo que se escribe en la base (un doble de Supabase que
   filtra de verdad y anota cada escritura y cada llamada):
     · Volcanes: el próximo volcán se anuncia escrito, la casilla lo dice en
       su rótulo y se ve marcada; la jugada que llega a la erupción guarda la
       posición sin la pieza quemada.
     · Misiones: se ve la misión propia (la reparte la base); la del rival no
       se pide nunca mientras se juega; con la misión cumplida al llegar el
       turno, la partida se cobra (terminada, con el motivo); con la del
       rival cumplida, se avisa.
     · Relevo: solo puede mover a quien le toca (y lo dice); la jugada va por
       relevo_jugar() desde la posición guardada; las señales, por
       relevo_senal().
     · La partida perdida: resolver un reto escribiendo las jugadas, lo que
       pasa cuando el camino no llega, y que lo resuelto se guarde.
   Ver «Volcanes», «Misiones secretas», «Relevo en silencio» y «La partida
   perdida» en docs/decisiones/juegos-y-torneos.md.

   Uso: con el sitio en localhost:8777 (npm run verificar lo levanta solo),
        node herramientas/verificar-juegos-nuevos.js */
const { chromium } = require("playwright");
const { Chess } = require("chess.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const ANA = { id: "u-ana", full_name: "Ana Rojas", email: "ana@x.cr", role: "alumno", is_admin: false };
const BRUNO = { id: "u-bruno", full_name: "Bruno Mena", email: "bruno@x.cr", role: "alumno", is_admin: false };
const CARLA = { id: "u-carla", full_name: "Carla Solís", email: "carla@x.cr", role: "alumno", is_admin: false };
const PERFILES = [ANA, BRUNO, CARLA];

function fenTras(jugadas) {
  const g = new Chess();
  jugadas.forEach((j) => { if (!g.move(j)) throw new Error("jugada ilegal en la prueba: " + j); });
  return g.fen();
}
function sala(variant, fen, extra) {
  return Object.assign({
    id: "r1", variant, white_id: "u-ana", black_id: "u-bruno", status: "playing", result: null,
    moves: [], fen, initial_seconds: null, increment_seconds: 0,
    white_time_left: null, black_time_left: null, clock_updated_at: null,
    white_ready: true, black_ready: true, created_by: "u-profe", variant_state: null,
  }, extra || {});
}

/* El doble: filtra en el resolver (then), aplica de verdad los update sobre
   sus filas, y anota cada escritura y cada rpc. */
function doble(datos, usuarioId) {
  return `
window.__escrituras = []; window.__rpc = []; window.__lecturas = [];
(function () {
  const DATOS = ${JSON.stringify(datos)};
  const cmp = (a, b) => String(a) === String(b);
  function constructor(tabla) {
    const filtros = []; let unica = false, cambio = null, limite = null, insertado = null;
    const b = {
      select() { return b; },
      eq(c, v) { filtros.push((r) => cmp(r[c], v)); return b; },
      neq(c, v) { filtros.push((r) => !cmp(r[c], v)); return b; },
      in(c, vs) { filtros.push((r) => (vs || []).some((v) => cmp(r[c], v))); return b; },
      is() { return b; }, not() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; },
      order() { return b; }, range() { return b; }, limit(n) { limite = n; return b; },
      insert(f) { insertado = f; return b; }, upsert(f) { insertado = f; return b; },
      update(f) { cambio = f; return b; }, delete() { return b; },
      maybeSingle() { unica = true; return b; }, single() { unica = true; return b; },
      then(res, rej) {
        const todas = DATOS.tablas[tabla] || (DATOS.tablas[tabla] = []);
        let filas = todas.filter((r) => filtros.every((f) => f(r)));
        if (cambio !== null) {
          filas.forEach((r) => Object.assign(r, JSON.parse(JSON.stringify(cambio))));
          window.__escrituras.push({ tabla, cambio, filas: filas.length });
        } else if (insertado === null) {
          window.__lecturas.push(tabla);
        }
        if (limite !== null) filas = filas.slice(0, limite);
        let d = insertado !== null ? insertado : JSON.parse(JSON.stringify(filas));
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  const RPC = DATOS.rpc || {};
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (t) => constructor(t),
    rpc: (n, args) => {
      window.__rpc.push({ n, args });
      if (n === "nombres_de_jugadores") {
        const ids = (args && args.p_ids) || [];
        return Promise.resolve({ data: (DATOS.tablas.profiles || []).filter((p) => ids.indexOf(p.id) >= 0).map((p) => ({ id: p.id, nombre: p.full_name })), error: null });
      }
      if (n === "relevo_jugar") {
        const r = DATOS.tablas.relevos[0];
        Object.assign(r, { fen: args.p_fen, moves: r.moves.concat([args.p_san]) });
        return Promise.resolve({ data: JSON.parse(JSON.stringify(r)), error: null });
      }
      if (n in RPC) return Promise.resolve({ data: RPC[n], error: null });
      return Promise.resolve({ data: null, error: null });
    },
    channel: () => { const c = { on() { return c; }, subscribe(cb) { if (cb) cb("SUBSCRIBED"); return c; }, track() { return Promise.resolve(); }, presenceState() { return {}; } }; return c; },
    removeChannel: () => {},
  };
})();
`;
}

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✅ " + nombre); return; }
  fallos++;
  console.log("  ❌ " + nombre + (detalle !== undefined ? "  →  " + JSON.stringify(detalle) : ""));
}

async function abrir(browser, url, datos, usuario) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(doble(datos, usuario));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + url);
  await page.waitForTimeout(1500);
  return { ctx, page, errores };
}
const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!(e && e.checkVisibility()); }, sel);
const texto = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : ""; }, sel);
async function escribir(page, jugada) {
  await page.fill("#jugada-input", jugada);
  await page.press("#jugada-input", "Enter");
  await page.waitForTimeout(400);
}

async function volcanes(browser) {
  console.log("\n▶ Volcanes");
  const ANTES = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"];
  {
    const datos = { tablas: { profiles: PERFILES, game_rooms: [sala("volcanes", fenTras(ANTES), { variant_state: { volcanes: ["e4", "d5"] }, moves: ANTES })] } };
    const { ctx, page, errores } = await abrir(browser, "/variante.html?room=r1", datos, "u-ana");
    ok("carga sin errores", errores.length === 0, errores);
    ok("el título es el de Volcanes", /Volcanes/.test(await texto(page, "#titulo")));
    const info = await texto(page, "#volcan-info");
    ok("el próximo volcán se anuncia escrito, con su casilla y cuánto falta", await visible(page, "#volcan-info") && /e4/.test(info) && /dentro de 4 jugadas/.test(info), info);
    const rotulo = await page.getAttribute('#board [data-square="e4"]', "aria-label");
    ok("la casilla del volcán lo dice en su rótulo", /volcán/.test(rotulo || ""), rotulo);
    const marca = await page.evaluate(() => { const s = document.querySelector('#board [data-square="e4"] span.bg-red-700'); return s ? { ve: s.checkVisibility(), t: s.textContent } : null; });
    ok("y se ve marcada con 🌋 y el número", marca && marca.ve && /🌋 4/.test(marca.t), marca);
    ok("se puede escribir la jugada", await visible(page, "#jugada-input"));
    await ctx.close();
  }
  {
    const nueve = ANTES.concat(["d3", "Bc5", "Nc3"]);
    const datos = { tablas: { profiles: PERFILES, game_rooms: [sala("volcanes", fenTras(nueve), { variant_state: { volcanes: ["e4", "d5"] }, moves: nueve })] } };
    const { ctx, page, errores } = await abrir(browser, "/variante.html?room=r1", datos, "u-bruno");
    await escribir(page, "d6");
    const w = await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "game_rooms" && e.cambio.fen));
    const g = w.length ? new Chess(w[0].cambio.fen) : null;
    ok("la jugada que llega a la erupción se guarda", w.length === 1, w);
    ok("sin la pieza que estaba en el volcán", g && !g.get("e4"), w[0] && w[0].cambio.fen);
    ok("y anotada en la planilla", w[0] && /^d6 🌋e4×P$/.test(w[0].cambio.moves[w[0].cambio.moves.length - 1]), w[0] && w[0].cambio.moves);
    ok("arriba se dice qué pasó", /Hizo erupción el volcán de e4 y se llevó un peón/.test(await texto(page, "#volcan-info")), await texto(page, "#volcan-info"));
    ok("sin errores", errores.length === 0, errores);
    await ctx.close();
  }
}

async function misiones(browser) {
  console.log("\n▶ Misiones secretas");
  {
    const datos = { tablas: { profiles: PERFILES, game_rooms: [sala("misiones", "4k3/8/R7/8/8/8/8/4K3 w - - 0 1", { variant_state: { amenaza: { b: true } } })] }, rpc: { repartir_misiones: "torre_septima" } };
    const { ctx, page, errores } = await abrir(browser, "/variante.html?room=r1", datos, "u-ana");
    ok("carga sin errores", errores.length === 0, errores);
    ok("la misión la reparte la base (repartir_misiones)", await page.evaluate(() => window.__rpc.some((r) => r.n === "repartir_misiones")));
    const panel = await texto(page, "#mision-panel");
    ok("se ve la misión propia", await visible(page, "#mision-panel") && /Torre en séptima/.test(panel), panel);
    ok("con la del rival cumplida, se avisa que es la última oportunidad", /Tu rival tiene su misión cumplida/.test(panel), panel);
    ok("la tabla de misiones no se lee mientras se juega (la del rival no pasa por acá)", !(await page.evaluate(() => window.__lecturas.includes("misiones_secretas"))));
    ok("no se cobra nada que no esté cumplido", !(await page.evaluate(() => window.__escrituras.some((e) => e.cambio.status === "finished"))));
    // Juega Ta7: la misión queda cumplida y el rival se entera, sin saber cuál.
    await page.fill("#jugada-input", "Ta7");
    await page.press("#jugada-input", "Enter");
    await page.waitForTimeout(500);
    const w = await page.evaluate(() => window.__escrituras.filter((e) => e.cambio.fen));
    ok("la jugada que cumple la misión avisa al rival (amenaza), sin decir cuál", w.length === 1 && w[0].cambio.variant_state && w[0].cambio.variant_state.amenaza && w[0].cambio.variant_state.amenaza.w === true && !JSON.stringify(w[0].cambio).includes("torre_septima"), w);
    ok("y a quien la cumplió se le dice que espere su turno", /Tu misión está cumplida/.test(await texto(page, "#mision-estado")), await texto(page, "#mision-estado"));
    await ctx.close();
  }
  {
    const datos = { tablas: { profiles: PERFILES, game_rooms: [sala("misiones", "4k3/R7/8/8/8/8/8/4K3 w - - 0 1", { moves: ["x"] })], misiones_secretas: [{ sala_id: "r1", color: "w", mision: "torre_septima" }, { sala_id: "r1", color: "b", mision: "centro" }] }, rpc: { repartir_misiones: "torre_septima" } };
    const { ctx, page, errores } = await abrir(browser, "/variante.html?room=r1", datos, "u-ana");
    await page.waitForTimeout(500);
    const fin = await page.evaluate(() => window.__escrituras.find((e) => e.cambio.status === "finished"));
    ok("con la misión cumplida al llegar el turno, la partida se cobra", fin && fin.cambio.result === "white" && fin.cambio.variant_state.fin.motivo === "mision", fin);
    ok("solo sobre la posición guardada (el filtro de fen, en el resolver)", fin && fin.filas === 1, fin);
    const estado = await texto(page, "#status-banner");
    ok("y se dice cómo se ganó", /cumpliendo su misión secreta/.test(estado), estado);
    const panel = await texto(page, "#mision-panel");
    ok("al terminar se destapan las dos misiones", /Torre en séptima/.test(panel) && /Dueño del centro/.test(panel), panel);
    ok("sin errores", errores.length === 0, errores);
    await ctx.close();
  }
}

async function relevo(browser) {
  console.log("\n▶ Relevo en silencio");
  const INICIAL = new Chess().fen();
  const base = () => ({
    tablas: {
      profiles: PERFILES,
      relevos: [{ id: "rv1", created_by: "u-profe", fen: INICIAL, moves: [], status: "playing", result: null, motivo: null }],
      relevo_jugadores: [
        { relevo_id: "rv1", jugador_id: "u-ana", color: "w", orden: 0 },
        { relevo_id: "rv1", jugador_id: "u-carla", color: "w", orden: 1 },
        { relevo_id: "rv1", jugador_id: "u-bruno", color: "b", orden: 0 },
      ],
      relevo_senales: [],
    },
  });
  {
    const { ctx, page, errores } = await abrir(browser, "/relevo.html?relevo=rv1", base(), "u-carla");
    ok("carga sin errores", errores.length === 0, errores);
    const estado = await texto(page, "#status-banner");
    ok("a quien no le toca se le dice a quién le toca, de su equipo", /Le toca a Ana Rojas, de tu equipo/.test(estado), estado);
    ok("y no puede escribir jugada", await page.isDisabled("#jugada-input"));
    ok("el equipo lista el orden y quién sigue", /Ana Rojas — ▶ le toca/.test(await texto(page, "#equipo-w")) && /Carla Solís \(tú\)/.test(await texto(page, "#equipo-w")), await texto(page, "#equipo-w"));
    ok("los botones de señal se ven", await visible(page, '[data-senal="ataca"]'));
    await page.click('[data-senal="ataca"]');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => window.__rpc.find((r) => r.n === "relevo_senal"));
    ok("la señal va por relevo_senal()", s && s.args.p_senal === "ataca" && s.args.p_relevo === "rv1", s);
    await ctx.close();
  }
  {
    const { ctx, page, errores } = await abrir(browser, "/relevo.html?relevo=rv1", base(), "u-ana");
    ok("a quien le toca se le dice", /¡Te toca!/.test(await texto(page, "#status-banner")));
    await escribir(page, "e4");
    const j = await page.evaluate(() => window.__rpc.find((r) => r.n === "relevo_jugar"));
    ok("la jugada va por relevo_jugar(), desde la posición guardada", j && j.args.p_fen_antes === new Chess().fen() && j.args.p_san === "e4" && j.args.p_resultado === null, j);
    const estado = await texto(page, "#status-banner");
    ok("después le toca al equipo rival", /Le toca a Bruno Mena, del equipo rival/.test(estado), estado);
    ok("y Carla queda como la que sigue en blancas", /Carla Solís — sigue/.test(await texto(page, "#equipo-w")), await texto(page, "#equipo-w"));
    ok("sin errores", errores.length === 0, errores);
    await ctx.close();
  }
}

async function partidaPerdida(browser) {
  console.log("\n▶ La partida perdida");
  const { ctx, page, errores } = await abrir(browser, "/partida-perdida.html", { tablas: { profiles: PERFILES } }, "u-ana");
  ok("carga sin errores", errores.length === 0, errores);
  ok("la meta se lee escrita", /Blancas: rey e1/.test(await texto(page, "#meta-escrita")));
  ok("dice cuántas jugadas", /2 jugadas exactas/.test(await texto(page, "#meta-cuantas")), await texto(page, "#meta-cuantas"));
  await escribir(page, "Cc3");
  ok("después de la primera, juegan las negras", /juegan las negras/.test(await texto(page, "#contador")), await texto(page, "#contador"));
  await escribir(page, "d5");
  ok("resolverlo lo dice", /Lo lograste/.test(await texto(page, "#resultado")), await texto(page, "#resultado"));
  ok("lo resuelto se guarda", await page.evaluate(() => JSON.parse(localStorage.getItem("partida_perdida_resueltos") || "{}")[1] === true));
  ok("aparece «Siguiente reto»", await visible(page, "#siguiente-btn"));
  await page.selectOption("#reto-select", "3");
  await page.waitForTimeout(200);
  await escribir(page, "Cf3"); await escribir(page, "e5"); await escribir(page, "Cc3");
  const r = await texto(page, "#resultado");
  ok("un camino que no llega dice qué casillas no coinciden", /No es la misma posición/.test(r) && /f3/.test(r), r);
  ok("y ya no deja seguir jugando", await page.isDisabled("#jugada-input"));
  await page.click("#deshacer-btn");
  await page.waitForTimeout(200);
  ok("Deshacer devuelve una jugada", /Jugada 3 de 3/.test(await texto(page, "#contador")), await texto(page, "#contador"));
  await escribir(page, "Cg1");
  ok("y el camino bueno (ida y vuelta) se acepta", /Lo lograste/.test(await texto(page, "#resultado")), await texto(page, "#resultado"));
  await page.click("#pista-btn");
  ok("la pista se abre y lo dice", (await page.getAttribute("#pista-btn", "aria-expanded")) === "true" && await visible(page, "#pista"));
  ok("sin errores", errores.length === 0, errores);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await volcanes(browser);
    await misiones(browser);
    await relevo(browser);
    await partidaPerdida(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
