/* El 4×4: volver a los ejercicios ya hechos y los favoritos. Ver «En el 4×4,
   volver a los que ya hiciste» en docs/decisiones/entrenamiento.md.

   Antes el 4×4 abría siempre el primero sin resolver y, con el nivel
   completo, no dejaba volver a ninguno: quien quería repasar uno, o repetir
   el que le gustó, no tenía cómo. Lo que se rompe acá no da ningún error: la
   página sigue funcionando y la sección no lleva a ningún lado. Se mide en un
   navegador de verdad, con el ratón y escribiendo (Modo Adaptado):

     1. «Tus ejercicios» dice cuántos llevas y deja abrir uno resuelto (con el
        formulario y con «ir al 2»), pero no uno que todavía no se abrió.
     2. «favorito» marca el de ahora (aria-pressed), queda guardado con la
        cuenta (progreso-usuario.js) y «favorito 1» lo abre desde otro nivel.
     3. Con el nivel completo, la sección sigue y deja volver a uno.
     4. Los niveles dicen cuál está elegido (aria-pressed, no aria-selected).

   Uso: con el sitio en localhost:8777,  node herramientas/verificar-4x4-repaso.js */
"use strict";

const { chromium } = require("./lib/playwright-con-sesion");
const doble = require("./lib/doble-entreno");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(n, v, detalle) {
  if (v) console.log("  ✓ " + n);
  else { console.log("  ✗ " + n + (detalle ? "\n      salió: " + detalle : "")); fallos += 1; }
}

async function abrir(browser, local) {
  const r = await doble.abrir(browser, "/entreno/4x4.html", {}, Object.assign({ oscarBlindMode_v1: "1" }, local || {}));
  await r.page.waitForSelector("#solo-panel:not([hidden]), #solo-complete:not([hidden])", { timeout: 20000 });
  await r.page.waitForTimeout(300);
  return r;
}
const texto = (page, sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || "", sel);
async function decir(page, t) {
  await page.fill("#cmd-input", t);
  await page.press("#cmd-input", "Enter");
  await page.waitForTimeout(250);
  return texto(page, "#cmd-status");
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  /* Los ids de verdad de los primeros ejercicios de Fácil e Intermedio. */
  let { page, ctx, errores } = await abrir(browser);
  const ids = await page.evaluate(() => ({
    facil: PUZZLES.facil.slice().sort((a, b) => a.number - b.number).map((p) => p.id),
    intermedio: PUZZLES.intermedio.slice().sort((a, b) => a.number - b.number).map((p) => p.id),
  }));
  await ctx.close();

  console.log("\n=== Con 3 resueltos en Fácil: volver a uno, y no a uno cerrado ===");
  const tres = {}; ids.facil.slice(0, 3).forEach((i) => { tres[i] = true; });
  ({ page, ctx, errores } = await abrir(browser, { entreno_solved: JSON.stringify(tres) }));
  igual("abre el que toca", await texto(page, "#solo-progress-text"), "Fácil — Ejercicio 4 de 200");
  cierto("«Tus ejercicios» se ve y dice cuántos llevas",
    await page.evaluate(() => document.getElementById("mis-4x4").checkVisibility()) && /Llevas 3 de 200 resueltos en Fácil/.test(await texto(page, "#mis-4x4-resumen")));
  igual("los niveles dicen cuál está elegido", await page.evaluate(() => Array.from(document.querySelectorAll(".tab")).slice(0, 2).map((b) => [b.getAttribute("aria-pressed"), b.hasAttribute("aria-selected")])),
    [["true", false], ["false", false]]);
  igual("«resueltos» dice cuáles", await decir(page, "resueltos"), "En Fácil resolviste 3: del 1 al 3. Escribe «ir al» y el número para volver a uno.");
  await decir(page, "ir al 2");
  igual("«ir al 2» vuelve al 2", await texto(page, "#solo-progress-text"), "Fácil — Ejercicio 2 de 200");
  // En Modo Adaptado el foco va a «Piezas», como con «siguiente» (ver loadPuzzleAt).
  igual("y el foco va a «Piezas», como al pasar de ejercicio", await page.evaluate(() => document.activeElement.id), "piezas-heading");
  cierto("«ir al 9» no abre uno que todavía no se abrió, y dice cuál toca",
    /todavía no se abre.*El que te toca es el 4/.test(await decir(page, "ir al 9")) && (await texto(page, "#solo-progress-text")) === "Fácil — Ejercicio 2 de 200");
  await page.fill("#ir-numero", "1");
  await page.click("#ir-form button[type=submit]");
  await page.waitForTimeout(300);
  igual("el formulario «Ir al ejercicio número» abre el 1", await texto(page, "#solo-progress-text"), "Fácil — Ejercicio 1 de 200");
  await page.click("#ir-al-que-toca");
  await page.waitForTimeout(300);
  igual("«Ir al que te toca» vuelve al 4", await texto(page, "#solo-progress-text"), "Fácil — Ejercicio 4 de 200");

  console.log("\n=== Los favoritos ===");
  await decir(page, "ir al 2");
  igual("«favorito» guarda el de ahora", await decir(page, "favorito"), "Ejercicio 2 de Fácil guardado en tus favoritos.");
  igual("y el botón queda apretado", await page.getAttribute("#fav-actual", "aria-pressed"), "true");
  igual("queda guardado (y viaja con la cuenta: progreso-usuario.js)", await page.evaluate((id) => JSON.parse(localStorage.getItem("entreno_4x4_favoritos_v1"))[id], ids.facil[1]), true);
  cierto("progreso-usuario.js lo sincroniza", await page.evaluate(() => /entreno_4x4_favoritos_v1/.test(document.querySelector('script[src*="progreso-usuario"]') ? "entreno_4x4_favoritos_v1" : "")) &&
    require("fs").readFileSync(require("path").join(__dirname, "..", "js", "progreso-usuario.js"), "utf8").includes('"entreno_4x4_favoritos_v1"'));
  await decir(page, "intermedio 1");
  igual("«intermedio 1» cambia de nivel", await texto(page, "#solo-progress-text"), "Intermedio — Ejercicio 1 de 200");
  igual("«favoritos» los dice", await decir(page, "favoritos"), "Tus favoritos: 1, Fácil 2. Escribe «favorito» y el número de la lista para abrirlo, por ejemplo «favorito 1».");
  await decir(page, "favorito 1");
  igual("«favorito 1» lo abre desde otro nivel", await texto(page, "#solo-progress-text"), "Fácil — Ejercicio 2 de 200");
  await page.click("#mis-favoritos summary");
  await page.waitForTimeout(150);
  igual("la lista de favoritos, con el ratón", await page.evaluate(() => Array.from(document.querySelectorAll("#ul-favoritos button")).map((b) => b.textContent)), ["Fácil — ejercicio 2"]);
  await page.click("#mis-resueltos summary");
  await page.waitForTimeout(150);
  igual("la de resueltos marca el favorito", await page.evaluate(() => Array.from(document.querySelectorAll("#ul-resueltos button")).map((b) => b.getAttribute("aria-label") || b.textContent)),
    ["Ejercicio 1", "Ejercicio 2, favorito", "Ejercicio 3"]);
  igual("«favorito» otra vez lo quita", await decir(page, "favorito"), "Ejercicio 2 de Fácil quitado de tus favoritos.");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  console.log("\n=== Con la cuenta ciega, el foco no sale del recuadro ===");
  {
    const r = await doble.abrir(browser, "/entreno/4x4.html",
      { vision_personas: [{ persona_id: "u-ana", vision: "ciego" }] },
      { oscarBlindMode_v1: "1", ai_vision_v1: JSON.stringify({ persona: "u-ana", vision: "ciego" }), entreno_solved: JSON.stringify(tres) });
    await r.page.waitForSelector("#solo-panel:not([hidden])", { timeout: 20000 });
    await r.page.waitForFunction(() => document.documentElement.classList.contains("modo-ciego"), null, { timeout: 8000 }).catch(() => {});
    await decir(r.page, "ir al 2");
    igual("«ir al 2» abre el 2", await texto(r.page, "#solo-progress-text"), "Fácil — Ejercicio 2 de 200");
    igual("y el foco sigue en el recuadro", await r.page.evaluate(() => document.activeElement.id), "cmd-input");
    await r.ctx.close();
  }

  console.log("\n=== Con el nivel completo, se puede volver ===");
  const todos = {}; ids.facil.forEach((i) => { todos[i] = true; });
  ({ page, ctx, errores } = await abrir(browser, { entreno_solved: JSON.stringify(todos) }));
  cierto("dice que lo completó y que puede volver", /puedes volver a cualquiera/.test(await texto(page, "#solo-complete-text")));
  cierto("«Tus ejercicios» sigue a la vista", await page.evaluate(() => document.getElementById("mis-4x4").checkVisibility()));
  await page.fill("#ir-numero", "150");
  await page.click("#ir-form button[type=submit]");
  await page.waitForTimeout(300);
  igual("y abre el 150", await texto(page, "#solo-progress-text"), "Fácil — Ejercicio 150 de 200");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
