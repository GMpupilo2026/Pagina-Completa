#!/usr/bin/env node
/* El enlace propio de cada supervisor en el diagnóstico de visitante.
 *
 * entreno/diagnostico.html?s=<código> es el enlace que un supervisor le manda
 * a gente sin cuenta: lo que se haga por él le llega a ese supervisor. La
 * página solo manda el código (a quién le llega lo decide el trigger de la
 * base); acá se comprueba lo que le toca a la página, en un navegador de
 * verdad y sin sesión:
 *
 *   - con un código válido le dice al visitante a quién le llega;
 *   - el código viaja en el envío (`enlace`), también si recargó sin el ?s=;
 *   - con un código que la base no reconoce lo dice, y no manda ninguno;
 *   - sin ?s= no pregunta nada ni pinta el aviso.
 *
 * Ver «El enlace del diagnóstico de cada supervisor» en docs/decisiones/informes.md.
 * Necesita el sitio en localhost:8777 (o BASE_URL) y playwright.
 */
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CODIGO = "a1b2c3d4e5";
let fallos = 0;

function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + "\n      esperado: " + b + "\n      hallado:  " + a); fallos += 1; }
}

/* El doble, SIN sesión: es un visitante. La función de la base contesta el
   nombre solo para el código que existe; los insert quedan anotados. */
const STUB = `
window.__inserts = [];
window.__rpc = [];
window.sb = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: null } }),
    getUser: () => Promise.resolve({ data: { user: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from: (tabla) => {
    const b = {
      select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b, range: () => b,
      upsert: () => b, update: () => b,
      insert: (filas) => { window.__inserts.push({ tabla, filas }); return b; },
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (r) => Promise.resolve({ data: [], error: null }).then(r),
    };
    return b;
  },
  rpc: (n, args) => {
    window.__rpc.push([n, args || null]);
    const data = n === "enlace_diagnostico_publico" && args && args.p_codigo === ${JSON.stringify(CODIGO)} ? "ADAPZ" : null;
    return Promise.resolve({ data, error: null });
  },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel() {},
};`;

async function abrir(browser, ruta, ctxPrevio) {
  const ctx = ctxPrevio || await browser.newContext({ serviceWorkers: "block" });
  if (!ctxPrevio) {
    await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  }
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, ctx, errores };
}

const aviso = (page) => page.evaluate(() => {
  const e = document.getElementById("visitante-destino");
  return e && e.checkVisibility() ? e.textContent.trim() : null;
});

// Contesta «no lo sé» hasta el final: lo que importa acá es el envío.
async function terminar(page) {
  for (let i = 0; i < 80; i++) {
    if (await page.locator("#result-view:not(.hidden)").count()) return true;
    await page.waitForSelector("#no-se-btn", { timeout: 10000 });
    await page.click("#no-se-btn");
    await page.click("#next-btn");
  }
  return !!(await page.locator("#result-view:not(.hidden)").count());
}

async function pruebaConEnlace(browser) {
  console.log("\n=== Con el enlace de un supervisor ===");
  let { page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html?s=" + CODIGO);
  igual("pregunta a la base por ESE código",
    await page.evaluate(() => window.__rpc.filter(([n]) => n === "enlace_diagnostico_publico").map(([, a]) => a)),
    [{ p_codigo: CODIGO }]);
  igual("y le dice al visitante a quién le llega", await aviso(page), "Tu resultado le llega a ADAPZ, que te compartió este enlace.");

  await page.fill("#visitante-nombre", "Lucía Visitante");
  await page.fill("#visitante-email", "lucia@ejemplo.cr");
  await page.click("#start-btn");
  await page.waitForSelector("#no-se-btn", { timeout: 15000 });
  await page.click("#no-se-btn");
  await page.close();

  // Vuelve otro rato, SIN el ?s=: el código quedó guardado con sus datos.
  ({ page, errores } = await abrir(browser, "/entreno/diagnostico.html", ctx));
  igual("al volver sin ?s= sigue diciendo a quién le llega", await aviso(page), "Tu resultado le llega a ADAPZ, que te compartió este enlace.");
  await page.click("#start-btn");
  igual("la prueba termina", await terminar(page), true);
  await page.waitForFunction(() => /enviado/.test(document.getElementById("result-saved").textContent), null, { timeout: 10000 });
  const envio = await page.evaluate(() => window.__inserts.filter((x) => x.tabla === "diagnosticos_publicos").map((x) => x.filas[0]));
  igual("se envía UN diagnóstico", envio.length, 1);
  igual("con el código del enlace", envio[0] && envio[0].enlace, CODIGO);
  igual("y sin elegir el supervisor desde la página (lo pone la base)", envio[0] && "supervisor_id" in envio[0], false);
  igual("el resultado dice a quién se envió",
    (await page.textContent("#result-saved")).startsWith("Resultado enviado a ADAPZ a nombre de Lucía Visitante."), true);
  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await ctx.close();
}

async function pruebaEnlaceMalo(browser) {
  console.log("\n=== Con un enlace que ya no vale ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html?s=ffffffffff");
  igual("lo dice antes de empezar",
    (await aviso(page) || "").startsWith("Este enlace ya no está activo: tu resultado le llega a Ajedrez Integral."), true);
  await page.fill("#visitante-nombre", "Pedro");
  await page.fill("#visitante-email", "pedro@ejemplo.cr");
  await page.click("#start-btn");
  await page.waitForSelector("#no-se-btn", { timeout: 15000 });
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem("diagnostico_estado_v1")).estado.visitante);
  igual("y no guarda ningún enlace para el envío", guardado.enlace, null);
  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await ctx.close();
}

async function pruebaSinEnlace(browser) {
  console.log("\n=== Sin enlace (la portada, Cursos) ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html");
  igual("no pregunta a la base por ningún enlace",
    await page.evaluate(() => window.__rpc.filter(([n]) => n === "enlace_diagnostico_publico").length), 0);
  igual("ni pinta el aviso", await aviso(page), null);
  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaConEnlace(browser);
    await pruebaEnlaceMalo(browser);
    await pruebaSinEnlace(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
