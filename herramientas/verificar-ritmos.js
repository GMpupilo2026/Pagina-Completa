/* Comprueba los ritmos de juego: la lista compartida (js/ritmos.js) y las tres
   pantallas que la usan — crear un torneo, cambiarle el tiempo a uno que ya
   existe, y armar una partida o un reto.

   Lo que se rompe acá no da ningún error: una opción que dice «3 min + 2 seg»
   y manda 180 y 0 se ve perfecta, y la partida se juega sin incremento. Por eso
   se mira lo que se MANDA, no lo que se pinta.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-ritmos.js                                */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* ---------- 1. La lista, sin navegador ---------- */
console.log("=== js/ritmos.js ===");
global.window = global;
require(path.join(RAIZ, "js", "ritmos.js"));
const R = global.Ritmos;
const ids = R.LISTA.map((r) => r.id);
["1+1", "3+0", "3+2"].forEach((id) => igual("ofrece " + id, ids.indexOf(id) >= 0, true));
igual("ningún id se repite", new Set(ids).size, ids.length);
R.LISTA.forEach((r) => {
  if (r.id === "none") return;
  const [m, s] = r.id.split("+").map(Number);
  if (r.initial !== m * 60 || r.increment !== s) igual("el id " + r.id + " dice lo mismo que sus segundos", [r.initial, r.increment], [m * 60, s]);
});
igual("…y todos los ids dicen lo mismo que sus segundos", fallos, 0);
igual("3+2 se lee", R.etiqueta(180, 2), "3 min + 2 seg");
igual("1+1 se lee", R.etiqueta(60, 1), "1 min + 1 seg");
igual("3+0 se lee", R.etiqueta(180, 0), "3 minutos");
igual("1+0 va en singular", R.etiqueta(60, 0), "1 minuto");
igual("un personalizado con medio minuto", R.etiqueta(90, 1), "1 min 30 seg + 1 seg");
igual("sin límite", R.etiqueta(null, 0), "Sin límite");

/* Ninguna página vuelve a tener su propia lista: con dos copias, una partida
   amistosa podía ser 3+0 y un torneo no. */
["torneos.html", "torneo.html", "juegos.html"].forEach((p) => {
  const s = fs.readFileSync(path.join(RAIZ, p), "utf8");
  igual(p + " no tiene su propia lista de ritmos", /TIME_CONTROLS\s*=/.test(s), false);
  igual(p + " carga js/ritmos.js", s.includes('src="js/ritmos.js"'), true);
});

/* ---------- 2. Las pantallas, en un navegador ---------- */
const PROFE = { id: "u-profe", role: "profesor", is_admin: false, full_name: "Karina Rojas", email: "karina@x.cr" };
const ANA = { id: "u-ana", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr", teacher_id: "u-profe" };
const BRUNO = { id: "u-bruno", role: "alumno", is_admin: false, full_name: "Bruno Mena", email: "bruno@x.cr", teacher_id: "u-profe" };
const TORNEO = { id: "t-1", name: "Relámpago de octubre", format: "swiss", variant: "estandar", status: "registration",
  created_by: "u-profe", initial_seconds: 300, increment_seconds: 0, total_rounds: null, current_round: 0, created_at: "2026-09-10T00:00:00Z" };

/* El doble anota cada escritura y, para un update, devuelve la fila ya
   escrita —o la de antes, si la prueba pide que la base la revierta—: es lo
   que la pantalla vuelve a leer para saber si de verdad quedó. */
function clienteFalso(datos, usuarioId) {
  return `(() => {
  const DATOS = ${JSON.stringify(datos)};
  window.__escrituras = [];
  function constructor(tabla, filas) {
    let resultado = null, unica = false, filtros = [];
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; },
      neq() { return b; }, in(c, v) { filtros.push((f) => v.indexOf(f[c]) >= 0); return b; }, or() { return b; },
      gte() { return b; }, is() { return b; }, not() { return b; },
      eq(c, v) { filtros.push((f) => f[c] === v); return b; },
      maybeSingle() { unica = true; return b; }, single() { unica = true; return b; },
      insert(fila) { window.__escrituras.push({ tabla: tabla, insert: fila }); resultado = [Object.assign({ id: "nuevo-1" }, fila)]; return b; },
      update(fila) {
        window.__escrituras.push({ tabla: tabla, update: fila });
        const antes = (filas || [])[0] || {};
        resultado = [DATOS._revierte ? antes : Object.assign({}, antes, fila)];
        return b;
      },
      upsert(fila) { window.__escrituras.push({ tabla: tabla, upsert: fila }); resultado = []; return b; },
      delete() { resultado = []; return b; },
      then(res, rej) {
        let d = resultado !== null ? resultado : (filas || []).filter((f) => filtros.every((p) => p(f)));
        if (unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  const canal = { on() { return canal; }, subscribe(cb) { if (cb) Promise.resolve().then(() => cb("SUBSCRIBED")); return canal; },
    track() { return Promise.resolve(); }, presenceState() { return {}; }, unsubscribe() {} };
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
            signOut: () => Promise.resolve({}), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t) => constructor(t, DATOS.tablas[t] || []),
    rpc: (n) => constructor(n, (DATOS.rpc || {})[n] || []),
    channel: () => canal, removeChannel: () => {},
  };
})();`;
}

async function abrir(browser, ruta, datos, usuario) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, usuario) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

const escritura = (page, tabla, tipo) => page.evaluate(([t, k]) => {
  const e = window.__escrituras.filter((x) => x.tabla === t && x[k]).pop();
  return e ? e[k] : null;
}, [tabla, tipo]);

async function pruebaPartida(browser) {
  console.log("\n=== juegos.html · la partida amistosa que arma el profesor ===");
  const datos = { rpc: { mis_clases: [] }, tablas: { profiles: [PROFE, ANA, BRUNO], game_rooms: [], fourplayer_games: [], desafios: [] } };
  const { page, ctx, errores } = await abrir(browser, "/juegos.html", datos, "u-profe");
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  const grupos = await page.evaluate(() => Array.from(document.querySelectorAll("#time-control-select optgroup")).map((g) => g.label));
  igual("el selector va agrupado por ritmo", grupos, ["Bala", "Relámpago", "Rápidas", "Clásica"]);

  await page.selectOption("#time-control-select", "3+2");
  await page.click("#create-room-form button[type=submit]");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "game_rooms"), { timeout: 10000 });
  const f = await escritura(page, "game_rooms", "insert");
  igual("3+2 manda 180 segundos y 2 de incremento", [f.initial_seconds, f.increment_seconds, f.white_time_left], [180, 2, 180]);

  // Personalizado: 1,5 minutos + 1 segundo. La caja de minutos nace escondida.
  const escondida = await page.evaluate(() => !document.getElementById("time-control-select-min").checkVisibility());
  igual("los campos del personalizado nacen escondidos", escondida, true);
  await page.selectOption("#time-control-select", "otro");
  igual("y se ven al elegir «Personalizado»", await page.evaluate(() => document.getElementById("time-control-select-min").checkVisibility()), true);
  await page.fill("#time-control-select-min", "1.5");
  await page.fill("#time-control-select-inc", "1");
  await page.evaluate(() => { window.__escrituras = []; });
  await page.click("#create-room-form button[type=submit]");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "game_rooms"), { timeout: 10000 });
  const g = await escritura(page, "game_rooms", "insert");
  igual("el personalizado manda 90 y 1", [g.initial_seconds, g.increment_seconds], [90, 1]);

  // Uno imposible no se manda, y se dice por qué.
  await page.fill("#time-control-select-min", "500");
  await page.evaluate(() => { window.__escrituras = []; });
  await page.click("#create-room-form button[type=submit]");
  await page.waitForTimeout(400);
  igual("500 minutos no se mandan", await page.evaluate(() => window.__escrituras.length), 0);
  igual("y se dice", /180 minutos/.test(await page.textContent("#create-room-msg")), true);

  igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaCrearTorneo(browser) {
  console.log("\n=== torneos.html · crear un torneo 1+1 ===");
  const datos = { tablas: { profiles: [PROFE], tournaments: [], tournament_registrations: [] } };
  const { page, ctx, errores } = await abrir(browser, "/torneos.html", datos, "u-profe");
  await page.waitForSelector("#time-select option", { state: "attached", timeout: 20000 });
  await page.route("**/torneo.html*", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
  await page.fill("#name-input", "Bala de prueba");
  await page.selectOption("#time-select", "1+1");
  // Al crear, la página se va a torneo.html: lo escrito se guarda antes de irse.
  await page.evaluate(() => addEventListener("pagehide", () => sessionStorage.setItem("esc", JSON.stringify(window.__escrituras))));
  await Promise.all([page.waitForURL(/torneo\.html/, { timeout: 10000 }), page.click("#create-form button[type=submit]")]);
  const f = await page.evaluate(() => (JSON.parse(sessionStorage.getItem("esc") || "[]").filter((e) => e.tabla === "tournaments" && e.insert).pop() || {}).insert || {});
  igual("manda 60 segundos y 1 de incremento", [f.initial_seconds, f.increment_seconds], [60, 1]);
  igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaCambiarTorneo(browser, revierte) {
  console.log("\n=== torneo.html · cambiarle el tiempo a un torneo" + (revierte ? " (la base lo revierte)" : "") + " ===");
  const datos = { _revierte: revierte, tablas: {
    profiles: [PROFE, ANA], tournaments: [TORNEO],
    tournament_registrations: [{ tournament_id: "t-1", player_id: "u-ana", registered_at: "2026-09-11T00:00:00Z" }],
    tournament_rounds: [], tournament_pairings: [], game_rooms: [],
  } };
  const { page, ctx, errores } = await abrir(browser, "/torneo.html?id=t-1", datos, "u-profe");
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  igual("el tiempo sale en la cabecera", /5 minutos/.test(await page.textContent("#t-meta")), true);
  igual("quien organiza ve dónde cambiarlo", await page.evaluate(() => document.getElementById("ritmo-seccion").checkVisibility()), true);
  igual("y arranca en el ritmo que tiene", await page.inputValue("#ritmo-torneo"), "5+0");
  await page.selectOption("#ritmo-torneo", "3+2");
  await page.click("#ritmo-guardar");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "tournaments"), { timeout: 10000 });
  const f = await escritura(page, "tournaments", "update");
  igual("manda 180 y 2", [f.initial_seconds, f.increment_seconds], [180, 2]);
  await page.waitForFunction(() => document.getElementById("ritmo-msg").textContent !== "", { timeout: 5000 });
  const msg = await page.textContent("#ritmo-msg");
  if (revierte) {
    igual("si la base no lo dejó, la pantalla lo dice", /No se pudo/.test(msg), true);
    igual("y la cabecera no miente", /5 minutos/.test(await page.textContent("#t-meta")), true);
  } else {
    igual("dice que quedó y cuál", /Guardado: 3 min \+ 2 seg/.test(msg), true);
    igual("y la cabecera ya lo dice", /3 min \+ 2 seg/.test(await page.textContent("#t-meta")), true);
  }
  igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaInscrito(browser) {
  console.log("\n=== torneo.html · a quien solo juega no se le ofrece ===");
  const datos = { tablas: {
    profiles: [PROFE, ANA], tournaments: [TORNEO],
    tournament_registrations: [{ tournament_id: "t-1", player_id: "u-ana", registered_at: "2026-09-11T00:00:00Z" }],
    tournament_rounds: [], tournament_pairings: [], game_rooms: [],
  } };
  const { page, ctx } = await abrir(browser, "/torneo.html?id=t-1", datos, "u-ana");
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  igual("la alumna inscrita no ve el control", await page.evaluate(() => document.getElementById("ritmo-seccion").checkVisibility()), false);
  igual("pero sí ve el tiempo del torneo", /5 minutos/.test(await page.textContent("#t-meta")), true);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPartida(browser);
    await pruebaCrearTorneo(browser);
    await pruebaCambiarTorneo(browser, false);
    await pruebaCambiarTorneo(browser, true);
    await pruebaInscrito(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobaciones fallaron" : "\n✓ Todo en orden");
  process.exit(fallos ? 1 : 0);
})();
