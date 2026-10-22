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

async function abrir(browser, local, ruta) {
  const r = await doble.abrir(browser, ruta || "/entreno/4x4.html", {}, Object.assign({ oscarBlindMode_v1: "1" }, local || {}));
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
  igual("el mapa marca resueltos, el de ahora y los cerrados, con su estado escrito", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#mapa-4x4 button")).slice(0, 5).map((b) => b.getAttribute("aria-label"))),
    ["Ejercicio 1, resuelto", "Ejercicio 2, resuelto, el que tienes en pantalla, favorito", "Ejercicio 3, resuelto", "Ejercicio 4, el que te toca", "Ejercicio 5, todavía cerrado"]);
  // Se mide lo que se VE: el mapa está a la vista, sin abrir nada, y el resuelto no depende solo del color.
  cierto("el mapa está a la vista y trae los 200 del nivel", await page.evaluate(() => document.getElementById("mapa-4x4").checkVisibility() && document.querySelectorAll("#mapa-4x4 button").length === 200));
  igual("el resuelto lleva ✓ escrito y el de ahora ▶", await page.evaluate(() => Array.from(document.querySelectorAll("#mapa-4x4 .marca")).slice(0, 4).map((m) => m.textContent)), ["✓", "▶★", "✓", ""]);
  igual("una sola parada con Tab en el mapa", await page.evaluate(() => document.querySelectorAll("#mapa-4x4 button[tabindex='0']").length), 1);
  await page.click("#mapa-4x4 button[data-numero='1']");
  await page.waitForTimeout(300);
  igual("tocar un resuelto del mapa lo abre", await texto(page, "#solo-progress-text"), "Fácil — Ejercicio 1 de 200");
  await page.click("#mapa-4x4 button[data-numero='9']", { force: true }); // aria-disabled: Playwright lo cree apagado, un clic de verdad llega
  // Se espera el aviso, no un tiempo fijo: con 100 ms, en el CI a veces todavía no estaba.
  await page.waitForFunction(() => /El que te toca/.test((document.getElementById("mis-4x4-aviso") || {}).textContent || ""), null, { timeout: 5000 }).catch(() => {});
  cierto("tocar uno cerrado no lo abre y dice cuál toca", (await texto(page, "#solo-progress-text")) === "Fácil — Ejercicio 1 de 200" && /todavía no se abre.*El que te toca es el 4/.test(await texto(page, "#mis-4x4-aviso")));
  await page.focus("#mapa-4x4 button[tabindex='0']");
  await page.keyboard.press("ArrowRight");
  igual("las flechas mueven el foco dentro del mapa", await page.evaluate(() => document.activeElement.dataset.numero), "2");
  await decir(page, "ir al 2");
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
  igual("con el nivel completo el mapa marca los 200 resueltos", await page.evaluate(() => document.querySelectorAll("#mapa-4x4 button[data-estado='resuelto']").length), 200);
  await page.fill("#ir-numero", "150");
  await page.click("#ir-form button[type=submit]");
  await page.waitForTimeout(300);
  igual("y abre el 150", await texto(page, "#solo-progress-text"), "Fácil — Ejercicio 150 de 200");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  /* El mapa sale en CADA nivel (no solo en Fácil): con dos resueltos, el mapa
     trae todos los del nivel, marca los dos, señala el que toca y deja volver. */
  console.log("\n=== El mapa, en los seis niveles ===");
  for (const [clave, nivel, total] of [["facil", "FACIL", 200], ["intermedio", "INTERMEDIO", 200], ["avanzado", "AVANZADO", 200], ["especialista", "ESPECIALISTA", 200], ["maestro", "MAESTRO", 100], ["granmaestro", "GRANMAESTRO", 100]]) {
    const idsN = await (async () => {
      const r = await abrir(browser);
      const v = await r.page.evaluate((k) => PUZZLES[k].slice().sort((a, b) => a.number - b.number).map((p) => p.id), clave);
      await r.ctx.close();
      return v;
    })();
    const dos = {}; idsN.slice(0, 2).forEach((i) => { dos[i] = true; });
    ({ page, ctx, errores } = await abrir(browser, { entreno_solved: JSON.stringify(dos) }, "/entreno/4x4.html?nivel=" + nivel));
    const m = await page.evaluate(() => ({
      visible: document.getElementById("mapa-4x4").checkVisibility(),
      botones: document.querySelectorAll("#mapa-4x4 button").length,
      resueltos: document.querySelectorAll("#mapa-4x4 button[data-estado='resuelto']").length,
      ahora: Array.from(document.querySelectorAll("#mapa-4x4 button[data-estado='ahora']")).map((b) => b.dataset.numero),
      cerrados: document.querySelectorAll("#mapa-4x4 button[aria-disabled='true']").length,
      marcas: Array.from(document.querySelectorAll("#mapa-4x4 .marca")).slice(0, 3).map((x) => x.textContent),
    }));
    igual(nivel + ": el mapa está a la vista con los " + total, [m.visible, m.botones], [true, total]);
    igual(nivel + ": dos resueltos con ✓, el 3 es el de ahora y el resto está cerrado", [m.resueltos, m.ahora, m.cerrados, m.marcas], [2, ["3"], total - 3, ["✓", "✓", "▶"]]);
    await page.click("#mapa-4x4 button[data-numero='1']");
    await page.waitForTimeout(250);
    cierto(nivel + ": tocar el 1 lo abre", /Ejercicio 1 de/.test(await texto(page, "#solo-progress-text")), await texto(page, "#solo-progress-text"));
    igual(nivel + ": sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();
  }

  /* «?nivel=INTERMEDIO» (la clase en vivo y las tareas de un nivel): abre ese
     nivel, en el que le toca; antes abría siempre Fácil. */
  console.log("\n=== ?nivel= abre ese nivel ===");
  const dosInter = {}; ids.intermedio.slice(0, 2).forEach((i) => { dosInter[i] = true; });
  ({ page, ctx, errores } = await abrir(browser, { entreno_solved: JSON.stringify(dosInter) }, "/entreno/4x4.html?nivel=INTERMEDIO"));
  igual("?nivel=INTERMEDIO abre Intermedio en el que toca", await texto(page, "#solo-progress-text"), "Intermedio — Ejercicio 3 de 200");
  await ctx.close();
  ({ page, ctx, errores } = await abrir(browser, {}, "/entreno/4x4.html?nivel=NOEXISTE"));
  igual("un nivel que no existe abre Fácil", await texto(page, "#solo-progress-text"), "Fácil — Ejercicio 1 de 200");
  await ctx.close();

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
