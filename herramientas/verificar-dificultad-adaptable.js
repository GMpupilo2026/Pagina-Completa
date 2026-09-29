/* Comprueba la dificultad que se ajusta sola (js/dificultad-adaptable.js) en
   Ejercicios por tema (entreno/temas.html), en un navegador con el doble de
   Supabase de Entrenamiento.

   - La regla, sola: 5 limpios seguidos suben; 3 con error o pista entre los
     últimos 4 bajan; tras un cambio la cuenta vuelve a cero; en los extremos
     no hay adónde ir.
   - En la página: con 5 limpios seguidos el escalón sube (de 1000 a 1200),
     queda guardado como si lo hubiera elegido, el selector lo muestra, se
     dice en pantalla y el siguiente ejercicio ya es de ese escalón.
   - Trabándose, baja (a 1000) y el siguiente vuelve a ser de ese escalón —
     buscando desde el principio del tema, que va de menor a mayor.
   - Una dificultad fijada por la tarea (?desde=) no se toca.

   Nada de esto da un error si se rompe: el alumno simplemente se queda en un
   escalón que ya no le sirve, que es lo que pasaba antes.

   Uso:  npm install; node herramientas/verificar-todo.js dificultad-adaptable  */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir } = require("./lib/doble-entreno");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

console.log("\n=== La regla ===");
{
  const g = { window: {} };
  new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "dificultad-adaptable.js"), "utf8"))(g.window);
  const D = g.window.DificultadAdaptable;
  let a = D.crear();
  igual("cuatro limpios no alcanzan", [1, 1, 1, 1].map((x) => a.registrar(!!x)), [null, null, null, null]);
  igual("el quinto sube", a.registrar(true), "subir");
  igual("y la cuenta vuelve a cero", a.registrar(true), "null");
  a = D.crear();
  igual("tres con error entre los últimos cuatro bajan", [0, 1, 0, 0].map((x) => a.registrar(!!x)), [null, null, null, "bajar"]);
  a = D.crear();
  igual("dos de cuatro, no", [0, 1, 0, 1].map((x) => a.registrar(!!x)), [null, null, null, null]);
  a = D.crear();
  igual("un error corta la seguidilla de limpios", [1, 1, 1, 0, 1, 1, 1, 1].map((x) => a.registrar(!!x)), [null, null, null, null, null, null, null, null]);
  const OP = [0, 600, 800, 1000];
  igual("el escalón de arriba", D.escalon(OP, 800, "subir"), "1000");
  igual("en el techo, el mismo", D.escalon(OP, 1000, "subir"), "1000");
  igual("en el piso, el mismo", D.escalon(OP, 0, "bajar"), "0");
}

async function jugar(page, limpio) {
  return page.evaluate((ok) => {
    missedThisPuzzle = !ok; usedHintThisPuzzle = false;
    finishPuzzle();
    pasarAlSiguiente();
    const p = currentPuzzle();
    return { nivel: nivelDesde, rating: p && p.rating };
  }, limpio);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== Ejercicios por tema: sube ===");
    let { page, ctx, errores } = await abrir(browser, "/entreno/temas.html?tema=fork", {}, { entreno_temas_desde: "1000" });
    await page.waitForFunction(() => typeof currentTheme !== "undefined" && currentTheme && game !== null, null, { timeout: 20000 });
    igual("arranca en el escalón elegido", await page.evaluate(() => nivelDesde), "1000");
    let r;
    for (let i = 0; i < 4; i++) r = await jugar(page, true);
    igual("cuatro limpios: sigue igual", r.nivel, "1000");
    igual("sin aviso", await page.evaluate(() => document.getElementById("nivel-ajuste").hidden), "true");
    r = await jugar(page, true);
    igual("el quinto limpio sube un escalón", r.nivel, "1200");
    igual("y el siguiente ejercicio ya es de ese escalón", r.rating >= 1200, "true");
    igual("queda guardado como si lo hubiera elegido", await page.evaluate(() => localStorage.getItem("entreno_temas_desde")), "1200");
    igual("el selector lo muestra", await page.evaluate(() => document.getElementById("nivel-desde").value), "1200");
    igual("y se dice en pantalla", await page.evaluate(() => document.getElementById("nivel-ajuste").textContent),
      "⬆️ Te está saliendo fácil: 5 limpios seguidos. Los próximos arrancan desde 1200.");

    console.log("\n=== Ejercicios por tema: baja ===");
    await jugar(page, false); await jugar(page, true); await jugar(page, false);
    r = await jugar(page, false);
    igual("tres con error entre los últimos cuatro bajan un escalón", r.nivel, "1000");
    // El tema va de menor a mayor: el que toca es el sin resolver MÁS FÁCIL
    // desde 1000, no el que seguía (que ya era de 1200 para arriba).
    const esperado = await page.evaluate(() => {
      const s = getSolved();
      const r = idsOf(currentTheme).map((id) => DATA.puzzles[id]).filter((p, i) => !s[idsOf(currentTheme)[i]] && p.rating >= 1000).map((p) => p.rating);
      return Math.min(...r);
    });
    igual("y el siguiente es el más fácil sin resolver de ese escalón (se busca desde el principio)", r.rating, String(esperado));
    igual("se dice en pantalla", await page.evaluate(() => document.getElementById("nivel-ajuste").textContent),
      "⬇️ Bajamos un escalón: los próximos arrancan desde 1000. Primero afianzar, después se vuelve a subir.");
    igual("elegir a mano borra el aviso", await page.evaluate(() => {
      const s = document.getElementById("nivel-desde"); s.value = "1400"; s.dispatchEvent(new Event("change"));
      return document.getElementById("nivel-ajuste").hidden;
    }), "true");
    igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();

    /* Donde se nota buscar desde el principio: arrancó alto (1400) y se
       traba. Siguiendo hacia adelante le seguirían tocando de 1400 para
       arriba aunque el escalón ya diga 1200. */
    console.log("\n=== Arrancó alto y se traba: vuelve a lo de su escalón ===");
    ({ page, ctx } = await abrir(browser, "/entreno/temas.html?tema=fork", {}, { entreno_temas_desde: "1400" }));
    await page.waitForFunction(() => typeof currentTheme !== "undefined" && currentTheme && game !== null, null, { timeout: 20000 });
    for (let i = 0; i < 3; i++) r = await jugar(page, false);
    igual("con tres de tres fallados, todavía no (la ventana es de cuatro)", r.nivel, "1400");
    r = await jugar(page, false);
    igual("al cuarto baja a 1200", r.nivel, "1200");
    igual("y el siguiente es de 1200, no de los de 1400 que seguían", r.rating >= 1200 && r.rating < 1400, "true");
    await ctx.close();

    console.log("\n=== Una dificultad fijada por la tarea no se toca ===");
    ({ page, ctx } = await abrir(browser, "/entreno/temas.html?tema=fork&desde=1400", {}, {}));
    await page.waitForFunction(() => typeof currentTheme !== "undefined" && currentTheme && game !== null, null, { timeout: 20000 });
    for (let i = 0; i < 5; i++) r = await jugar(page, true);
    igual("cinco limpios con ?desde=1400: sigue en 1400", r.nivel, "1400");
    await ctx.close();
  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
