#!/usr/bin/env node
/* «Actualizaciones de la plataforma» (novedades.html), comprobada en un
 * navegador de verdad con un cliente de Supabase de mentira.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - una lista que se queda a medias (un cambio que no llega a la pantalla)
 *    se ve igual de completa;
 *  - un buscador que no ignora las tildes no encuentra «acción» con «accion»
 *    y parece que ese cambio nunca se hizo;
 *  - un título pintado con innerHTML ejecutaría lo que traiga;
 *  - y la página se le pintaría a quien no administra.
 *
 * De paso mira el archivo: que cada cambio traiga fecha y título, que no haya
 * dos con el mismo hash y que ninguno quede como «Merge pull request».
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-novedades.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

// ── El archivo ──
console.log("\nEl archivo data/novedades.json");
const real = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "novedades.json"), "utf8")).cambios;
igual("trae cambios", real.length > 0, true);
igual("todos con hash, fecha y título", real.every((c) => c.hash && !isNaN(Date.parse(c.fecha)) && c.titulo), true);
igual("ningún hash repetido", new Set(real.map((c) => c.hash)).size, real.length);
igual("ninguno queda como «Merge pull request»", real.filter((c) => /^Merge pull request/.test(c.titulo)).length, 0);
igual("del más nuevo al más viejo", real.every((c, i) => i === 0 || Date.parse(real[i - 1].fecha) >= Date.parse(c.fecha)), true);

// ── La página, con datos de mentira ──
const XSS = '<img src=x onerror="window.__xss=1">Una acción rara';
const DATOS = { cambios: [
  { hash: "c3", fecha: "2026-09-23T20:00:00-06:00", titulo: XSS, pr: 3 },
  { hash: "c2", fecha: "2026-09-23T10:00:00-06:00", titulo: "Cobros por moneda", pr: 2 },
  { hash: "c1", fecha: "2026-09-06T09:00:00-06:00", titulo: "Primer commit", pr: null },
] };

function cliente(yo) {
  return `window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u" }, access_token: "t" } } }) },
    from() { const b = { select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: ${JSON.stringify(yo)}, error: null }) }; return b; },
  };`;
}

async function abrir(browser, yo) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente(yo) }));
  await page.route("**/data/novedades.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DATOS) }));
  await page.goto(BASE + "/novedades.html", { waitUntil: "networkidle" });
  return { ctx, page, errores };
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\nQuien administra");
  const a = await abrir(browser, { is_admin: true });
  const p = a.page;
  await p.waitForSelector("#lista details");
  igual("un grupo por día", await p.locator("#lista details").count(), 2);
  igual("los tres cambios pintados", await p.locator("#lista li").count(), 3);
  igual("el día más nuevo, abierto; el viejo, cerrado", await p.$$eval("#lista details", (d) => d.map((x) => x.open)), [true, false]);
  igual("el título ajeno se ve literal y no se ejecuta",
    await p.evaluate(() => [!!window.__xss, document.querySelectorAll("#lista img").length, document.querySelector("#lista li").textContent.includes("<img")]),
    [false, 0, true]);
  igual("el número del cambio enlaza a su PR", await p.getAttribute("#lista li a", "href"), "https://github.com/GMpupilo2026/Pagina-Completa/pull/3");
  await p.fill("#buscar", "accion");
  igual("buscar sin tildes encuentra «acción»", await p.locator("#lista li").count(), 1);
  await p.fill("#buscar", "#2");
  igual("buscar por número de cambio trae el de cobros", (await p.locator("#lista li").allInnerTexts()).join("|").includes("Cobros por moneda"), true);
  await p.fill("#buscar", "nada-que-ver");
  igual("sin coincidencias lo dice", await p.textContent("#conteo"), "Ningún cambio coincide con esa búsqueda.");
  igual("sin errores en la consola", a.errores, []);
  await a.ctx.close();

  console.log("\nQuien no administra");
  const b = await abrir(browser, { is_admin: false });
  await b.page.waitForSelector("#denegado:not(.hidden)");
  igual("ve el aviso y no la lista", await b.page.evaluate(() => [document.getElementById("app").classList.contains("hidden"), document.querySelectorAll("#lista li").length]), [true, 0]);
  await b.ctx.close();

  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron.` : "\nLa página de actualizaciones está como se pidió.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
