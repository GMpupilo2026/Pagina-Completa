/* Comprueba, en un navegador, la cola de «Repasar fallados» de Ejercicios por
   tema y de Mates (js/repaso-fallados.js) y el bloque «Hoy te toca» del hub de
   Entrenamiento (js/entreno-index.js).

   - Un ejercicio resuelto con error entra a la cola y vuelve HOY; uno limpio a
     la primera no entra.
   - La cola se ofrece en la lista de temas, se abre, trae el que costó, y al
     repasarlo limpio se reprograma para más adelante. Repasar no vuelve a
     registrar el ejercicio en training_progress (ya contó la primera vez).
   - Tres repasos limpios seguidos lo sacan de la cola, con una marca y no un
     borrado (la cola se funde entre aparatos sumando fichas).
   - El hub dice qué toca hoy: repasos de Temas, líneas de Aperturas vencidas
     (no las nuevas) y el diagnóstico si falta o tiene más de cuatro semanas.
     Sin nada pendiente, el bloque no sale.

   Nada de esto da un error si se rompe: el ejercicio fallado simplemente no
   vuelve nunca, que es lo que pasaba antes.

   Uso:  npm install; node herramientas/verificar-todo.js entreno-repaso       */
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir } = require("./lib/doble-entreno");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const CLAVE = "entreno_temas_repaso_v1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function sinErrores(errores, pagina) {
  igual(`${pagina}: sin errores en la página`, errores.length ? errores.join(" | ") : "ninguno", "ninguno");
}
const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const inserts = (page) => page.evaluate(() => window.__inserts.filter((i) => i.tabla === "training_progress").length);

async function temas(browser) {
  console.log("\n=== Ejercicios por tema: la cola de «Repasar fallados» ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/temas.html?tema=fork&desde=0", {}, { entreno_temas_desde: "0" });
  await page.waitForFunction(() => typeof currentTheme !== "undefined" && currentTheme && game !== null, { timeout: 20000 });

  // El primero, con un error; el segundo, limpio.
  const fallado = await page.evaluate(() => { const id = currentId(); missedThisPuzzle = true; finishPuzzle(); return id; });
  await page.waitForFunction((id) => currentId() !== id && !locked, fallado, { timeout: 5000 });
  const limpio = await page.evaluate(() => { const id = currentId(); missedThisPuzzle = false; usedHintThisPuzzle = false; finishPuzzle(); return id; });
  const cola = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), CLAVE);
  igual("el resuelto con error entra a la cola, con su tema", cola[fallado] && cola[fallado].tema, "fork");
  igual("y vuelve hoy mismo", cola[fallado] && cola[fallado].vence, hoy());
  igual("el resuelto limpio a la primera no entra", limpio in cola, "false");

  // La lista de temas ofrece el repaso.
  await page.evaluate(() => showThemes());
  igual("la lista de temas ofrece el repaso",
    await page.evaluate(() => document.getElementById("repaso-caja").checkVisibility()), "true");
  igual("y dice cuántos", await page.evaluate(() => document.getElementById("repaso-texto").textContent),
    "Hoy toca repasar 1 ejercicio que te costó (lo resolviste con un error o con una pista).");

  // Se abre y trae el que costó, sin selector de dificultad.
  await page.click("#repaso-btn");
  igual("el repaso trae el que costó", await page.evaluate(() => currentId()), fallado);
  igual("con su título", await page.evaluate(() => document.getElementById("play-title").textContent), "Repasar fallados");
  igual("y sin selector de dificultad",
    await page.evaluate(() => document.getElementById("nivel-desde-caja").checkVisibility()), "false");

  // Repasarlo limpio: se reprograma para más adelante y no se vuelve a registrar.
  const antes = await inserts(page);
  await page.evaluate(() => { missedThisPuzzle = false; usedHintThisPuzzle = false; finishPuzzle(); });
  const ficha = await page.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k))[id], [CLAVE, fallado]);
  igual("repasado limpio, vuelve más adelante", ficha.vence > hoy(), "true");
  igual("y no se registra otra vez en training_progress", (await inserts(page)) - antes, "0");
  await page.waitForFunction(() => document.getElementById("celebration").checkVisibility(), { timeout: 5000 });
  igual("al terminar, «¡Repaso terminado!»",
    await page.evaluate(() => document.getElementById("celebration-title").textContent), "¡Repaso terminado!");
  await page.click("#celebration-back-btn");
  igual("y la lista ya no ofrece repaso (no queda nada para hoy)",
    await page.evaluate(() => document.getElementById("repaso-caja").checkVisibility()), "false");

  // Tres limpios seguidos lo sacan de la cola, con una marca.
  const salida = await page.evaluate(([k, id]) => {
    RepasoFallados.anotar(k, id, false, false);
    const r = RepasoFallados.anotar(k, id, false, false);
    return { devuelve: r, ficha: JSON.parse(localStorage.getItem(k))[id], enLaCola: RepasoFallados.enLaCola(k) };
  }, [CLAVE, fallado]);
  igual("con tres repasos limpios seguidos sale de la cola", [salida.devuelve, salida.enLaCola], [null, 0]);
  igual("marcado como fuera, no borrado", salida.ficha && salida.ficha.fuera, "true");
  const vuelve = await page.evaluate(([k, id]) => RepasoFallados.anotar(k, id, false, true) !== null, [CLAVE, fallado]);
  igual("y si se vuelve a sacar con pista, entra de nuevo", vuelve, "true");
  sinErrores(errores, "temas");
  await ctx.close();

  // ?repaso=1 (el enlace del hub) abre la cola directo.
  const cola1 = { [fallado]: { facilidad: 2.5, intervalo: 0, repasos: 0, fallos: 1, vence: hoy(), ultimo: new Date().toISOString(), tema: "fork" } };
  const d = await abrir(browser, "/entreno/temas.html?repaso=1", {}, { [CLAVE]: JSON.stringify(cola1) });
  await d.page.waitForFunction(() => typeof currentTheme !== "undefined" && currentTheme && game !== null, { timeout: 20000 });
  igual("?repaso=1 abre la cola directo", await d.page.evaluate(() => [enRepaso(), currentId()]), [true, fallado]);
  sinErrores(d.errores, "temas con ?repaso=1");
  await d.ctx.close();
}

async function mates(browser) {
  console.log("\n=== Mates: la misma cola, en su pestaña ===");
  const CLAVE_M = "entreno_mates_repaso_v1";
  const { page, ctx, errores } = await abrir(browser, "/entreno/mates.html");
  await page.waitForFunction(() => PUZZLES.mate1.length > 0 && game !== null, { timeout: 20000 });
  igual("sin nada que repasar, no hay pestaña de repaso",
    await page.evaluate(() => [...document.querySelectorAll("#tabs .tab")].some((b) => b.textContent.includes("Repasar"))), "false");

  // Con error vuelve hoy mismo (con solo pista, mañana: hoy no habría pestaña).
  const fallado = await page.evaluate(() => { const id = currentPuzzle().id; missedThisPuzzle = true; finishPuzzle(); return id; });
  const cola = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), CLAVE_M);
  igual("el resuelto con error entra a la cola de Mates, para hoy", cola[fallado] && cola[fallado].vence, hoy());
  igual("y aparece la pestaña, con cuántos", await page.evaluate(() =>
    [...document.querySelectorAll("#tabs .tab")].map((b) => b.textContent.trim()).find((t) => t.includes("Repasar"))), "🔁 Repasar fallados 1 para hoy");

  await page.waitForFunction(() => !locked, { timeout: 5000 });
  await page.evaluate(() => [...document.querySelectorAll("#tabs .tab")].find((b) => b.textContent.includes("Repasar")).click());
  igual("la pestaña trae el que costó", await page.evaluate(() => [currentCategory, currentPuzzle().id]), ["__repaso", fallado]);
  const antes = await inserts(page);
  await page.evaluate(() => { missedThisPuzzle = false; usedHintThisPuzzle = false; finishPuzzle(); });
  igual("repasado limpio, vuelve más adelante",
    await page.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k))[id].vence, [CLAVE_M, fallado]) > hoy(), "true");
  igual("y no se registra otra vez", (await inserts(page)) - antes, "0");
  await page.waitForFunction(() => document.getElementById("celebration").checkVisibility(), { timeout: 5000 });
  igual("al terminar, «¡Repaso terminado!» y sin «volver a empezar»", await page.evaluate(() =>
    [document.getElementById("celebration-title").textContent, document.getElementById("celebration-replay-btn").checkVisibility()]),
    ["¡Repaso terminado!", false]);
  sinErrores(errores, "mates");
  await ctx.close();
}

async function hub(browser) {
  console.log("\n=== El hub: «Hoy te toca» ===");
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const manana = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const ficha = (vence, ultimo) => ({ facilidad: 2.5, intervalo: 1, repasos: 1, fallos: 0, vence, ultimo });
  const local = {
    [CLAVE]: JSON.stringify({ a: Object.assign(ficha(ayer, "2026-01-01T00:00:00Z"), { tema: "fork" }), b: Object.assign(ficha(hoy(), "2026-01-01T00:00:00Z"), { tema: "pin" }), c: Object.assign(ficha(manana, "2026-01-01T00:00:00Z"), { tema: "pin" }) }),
    // Dos vencidas ya empezadas, una al día y una nueva (sin `ultimo`): cuentan dos.
    entreno_mates_repaso_v1: JSON.stringify({ "mate1-0001": Object.assign(ficha(hoy(), "2026-01-01T00:00:00Z"), { category: "mate1" }) }),
    aperturas_srs_v1: JSON.stringify({ l1: ficha(ayer, "2026-01-01T00:00:00Z"), l2: ficha(hoy(), "2026-01-01T00:00:00Z"), l3: ficha(manana, "2026-01-01T00:00:00Z"), l4: { vence: hoy() } }),
  };
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/index.html", {}, local);
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    const items = await page.evaluate(() => Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")]));
    igual("se ve", await page.evaluate(() => document.getElementById("hoy").checkVisibility()), "true");
    igual("los repasos de Temas que vencieron (2 de 3)", items[0], ["🔁Repasar 2 ejercicios que te costaron", "temas.html?repaso=1"]);
    igual("los mates que costaron", items[1], ["♚Repasar 1 mate que te costó", "mates.html?repaso=1"]);
    igual("las líneas de Aperturas vencidas, sin contar la nueva", items[2], ["📖2 líneas de aperturas para repasar", "aperturas.html"]);
    igual("y nunca más de tres: el diagnóstico queda para cuando haya lugar", items.length, "3");
    igual("el título es un encabezado del nivel correcto (h2, bajo el h1)",
      await page.evaluate(() => document.getElementById("hoy-titulo").tagName), "H2");
    sinErrores(errores, "hub");
    await ctx.close();
  }
  {
    const viejo = new Date(Date.now() - 40 * 86400000).toISOString();
    const { page, ctx } = await abrir(browser, "/entreno/index.html", {}, { diagnostico_resultado_v1: JSON.stringify({ fecha: viejo }) });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, { timeout: 10000 });
    igual("con un diagnóstico de hace 40 días, pide repetirlo",
      await page.evaluate(() => document.querySelector("#hoy-lista a").textContent.includes("Repetir el diagnóstico")), "true");
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(browser, "/entreno/index.html", {}, { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString() }) });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForTimeout(500);
    igual("sin nada pendiente, el bloque no sale",
      await page.evaluate(() => document.getElementById("hoy").checkVisibility()), "false");
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await temas(browser);
    await mates(browser);
    await hub(browser);
  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
