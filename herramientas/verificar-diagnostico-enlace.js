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
// Una academia con un color que NO da 4,5 contra el blanco (la base no lo
// dejaría guardar, pero la página no se fía), y un supervisor sin academia.
const CODIGO_CLARO = "c1c2c3c4c5";
const CODIGO_SIN_ACADEMIA = "d1d2d3d4d5";
const MARCAS = {
  [CODIGO]: { nombre: "ADAPZ", color: "#1c3870", logo_path: "ac1/logo-x.webp", whatsapp: "8455-4870" },
  [CODIGO_CLARO]: { nombre: "Academia Clara", color: "#ffee00", logo_path: null, whatsapp: null },
};
const DESTINOS = { [CODIGO]: "ADAPZ", [CODIGO_CLARO]: "Academia Clara", [CODIGO_SIN_ACADEMIA]: "Karina Rojas" };
// Un PNG de 1×1 para el logo: el de verdad vive en Storage.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
let fallos = 0;

function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + "\n      esperado: " + b + "\n      hallado:  " + a); fallos += 1; }
}

/* El doble, SIN sesión: es un visitante. La función de la base contesta el
   nombre solo para el código que existe; los insert quedan anotados. */
const STUB = `
window.SUPABASE_URL = "https://ejemplo.supabase.co";
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
    const cod = args && args.p_codigo;
    if (n === "enlace_diagnostico_publico") return Promise.resolve({ data: ${JSON.stringify(DESTINOS)}[cod] || null, error: null });
    if (n === "enlace_diagnostico_marca") { const m = ${JSON.stringify(MARCAS)}[cod]; return Promise.resolve({ data: m ? [m] : [], error: null }); }
    return Promise.resolve({ data: null, error: null });
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
    await ctx.route("**/storage/v1/object/public/academia-marca/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
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

/* El tema de la academia: con el enlace de un supervisor de UNA academia, la
   página se viste con su marca. Se mide lo que se VE (getComputedStyle y
   checkVisibility), no las clases. */
const estilo = (page, sel, prop) => page.evaluate(([s, p]) => {
  const e = document.querySelector(s);
  return e ? getComputedStyle(e)[p] : null;
}, [sel, prop]);
const seVe = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);
const AZUL = "rgb(28, 56, 112)", BLANCO = "rgb(255, 255, 255)";

async function pruebaTemaAcademia(browser) {
  console.log("\n=== El tema de la academia ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html?s=" + CODIGO);
  igual("pide la marca de ESE enlace",
    await page.evaluate(() => window.__rpc.filter(([n]) => n === "enlace_diagnostico_marca").map(([, a]) => a)),
    [{ p_codigo: CODIGO }]);
  igual("arriba, la franja con el nombre de la academia", await seVe(page, "#marca-diagnostico"), true);
  igual("y va antes que el título", await page.evaluate(() =>
    !!(document.getElementById("marca-diagnostico").compareDocumentPosition(document.querySelector("#intro-view h1")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
  igual("sin «← Cursos», que lleva a Ajedrez Integral", await seVe(page, "#intro-view > a"), false);
  igual("dice de quién es el diagnóstico", (await page.textContent("#marca-diagnostico-nombre")).trim(), "ADAPZ");
  igual("con su logo, que se ve de verdad",
    await page.evaluate(() => { const i = document.getElementById("marca-diagnostico-logo"); return i.checkVisibility() && i.naturalWidth > 0; }), true);
  igual("la franja va en su color, con el texto en blanco",
    [await estilo(page, "#marca-diagnostico", "backgroundColor"), await estilo(page, "#marca-diagnostico-nombre", "color")], [AZUL, BLANCO]);
  igual("el encabezado también va en su color", await estilo(page, "#header", "backgroundColor"), AZUL);
  igual("y lleva su nombre, no el de Ajedrez Integral", (await page.textContent("#header nav a")).trim(), "ADAPZ");
  igual("el menú de Ajedrez Integral no se ve", await seVe(page, "#header nav ul"), false);
  igual("la tarjeta para dejar los datos va en su color", await estilo(page, "#visitante-box", "backgroundColor"), AZUL);
  igual("con el texto en blanco, sin transparencia",
    await page.evaluate(() => [...document.querySelectorAll("#visitante-box p, #visitante-box label, #visitante-box h2")]
      .every((e) => getComputedStyle(e).color === "rgb(255, 255, 255)" && getComputedStyle(e).opacity === "1")), true);
  igual("el botón de empezar va en su color, con letra blanca",
    [await estilo(page, "#start-btn", "backgroundColor"), await estilo(page, "#start-btn", "color")], [AZUL, BLANCO]);
  igual("el título de la pestaña lleva su nombre", await page.title(), "Diagnóstico de nivel — ADAPZ");
  igual("y el color del navegador en el celular", await page.getAttribute('meta[name="theme-color"]', "content"), "#1c3870");
  // Con GUARDAR_CAPTURAS=<carpeta> deja cómo se ve, para mirarlo.
  const capturas = process.env.GUARDAR_CAPTURAS;
  if (capturas) await page.screenshot({ path: require("path").join(capturas, "diagnostico-academia-portada.png"), fullPage: true });

  await page.fill("#visitante-nombre", "Lucía Visitante");
  await page.fill("#visitante-email", "lucia@ejemplo.cr");
  await page.click("#start-btn");
  igual("la barra de avance va en su color", await estilo(page, "#q-bar", "backgroundColor"), AZUL);
  igual("la prueba termina", await terminar(page), true);
  await page.waitForFunction(() => /enviado/.test(document.getElementById("result-saved").textContent), null, { timeout: 10000 });
  igual("el nivel va en una tarjeta de su color, con letra blanca",
    [await estilo(page, "#result-level", "color"),
     await page.evaluate(() => getComputedStyle(document.getElementById("result-level").parentElement).backgroundColor)], [BLANCO, AZUL]);
  igual("al final invita a entrenar con la academia", (await page.textContent("#cta-titulo")).trim(), "¿Quieres entrenar con ADAPZ?");
  igual("el WhatsApp es el de la academia, con el código de país",
    (await page.getAttribute("#cta-whatsapp", "href")).startsWith("https://wa.me/50684554870?text="), true);
  igual("y el botón lo dice", (await page.textContent("#cta-whatsapp")).trim(), "💬 Escribirle a ADAPZ");
  igual("el botón va al revés: fondo blanco y letra en su color",
    [await estilo(page, "#cta-whatsapp", "backgroundColor"), await estilo(page, "#cta-whatsapp", "color")], [BLANCO, AZUL]);
  igual("sin el enlace a los cursos de Ajedrez Integral", await seVe(page, "#cta-cursos"), false);
  igual("a un visitante no se le ofrece «Ver mis Informes»", await seVe(page, "#result-informes"), false);
  if (capturas) await page.screenshot({ path: require("path").join(capturas, "diagnostico-academia-resultado.png"), fullPage: true });
  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await ctx.close();
}

async function pruebaColorQueNoSeLee(browser) {
  console.log("\n=== Un color que no da 4,5 contra el blanco ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html?s=" + CODIGO_CLARO);
  igual("no se usa: la página no se viste", await page.evaluate(() => document.documentElement.hasAttribute("data-marca-academia")), false);
  igual("el encabezado queda con su color de siempre", (await estilo(page, "#header", "backgroundColor")) !== "rgb(255, 238, 0)", true);
  igual("pero el nombre de la academia sí sale", (await page.textContent("#marca-diagnostico-nombre")).trim(), "Academia Clara");
  igual("sin logo, no se pinta un recuadro vacío", await seVe(page, "#marca-diagnostico-logo"), false);
  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await ctx.close();
}

async function pruebaSupervisorSinAcademia(browser) {
  console.log("\n=== Un supervisor sin academia ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html?s=" + CODIGO_SIN_ACADEMIA);
  igual("dice a quién le llega", await aviso(page), "Tu resultado le llega a Karina Rojas, que te compartió este enlace.");
  igual("pero sin franja ni tema", [await seVe(page, "#marca-diagnostico"),
    await page.evaluate(() => document.documentElement.hasAttribute("data-marca-academia"))], [false, false]);
  igual("el encabezado sigue siendo el de Ajedrez Integral", (await page.textContent("#header nav a")).replace(/\s+/g, " ").trim(), "Ajedrez Integral");
  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaConEnlace(browser);
    await pruebaEnlaceMalo(browser);
    await pruebaSinEnlace(browser);
    await pruebaTemaAcademia(browser);
    await pruebaColorQueNoSeLee(browser);
    await pruebaSupervisorSinAcademia(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
