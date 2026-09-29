/* Comprueba, en un navegador, que Ejercicios por tema y la Racha táctica
   ponen al alumno a la altura de su nivel, y que cada ejercicio de Temas y de
   Mates guarda si salió limpio.

   - Temas arranca cada tema en el primer ejercicio SIN resolver cuyo rating
     llegue a «desde». Ese «desde» sale del enlace (?desde=), de lo que eligió
     el alumno, o de su nivel (Elo del diagnóstico o del perfil) menos 300.
     Los temas sin rating (táctica de la casa) no muestran el selector.
   - «Saltar» y el paso al siguiente van al próximo SIN resolver, no al de al
     lado.
   - El detalle que va a training_progress lleva limpio / con_error / con_pista.
   - La Racha táctica sube la dificultad con la racha y no repite ejercicios.

   Nada de esto da un error si se rompe: la página sigue funcionando, solo que
   el alumno de 1800 vuelve a empezar en los de 1000.

   Uso:  npm install; node herramientas/verificar-todo.js entreno-nivel        */
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

const { abrir } = require("./lib/doble-entreno");

function sinErrores(errores, pagina) {
  igual(`${pagina}: sin errores en la página`, errores.length ? errores.join(" | ") : "ninguno", "ninguno");
}
const enTema = (page) => page.waitForFunction(() => typeof currentTheme !== "undefined" && currentTheme && game !== null, { timeout: 20000 });
const ratingActual = (page) => page.evaluate(() => currentPuzzle().rating);
const PERFIL = (elo) => ({ profiles: [{ id: "u-ana", elo, full_name: "Ana", role: "student" }] });

async function temas(browser) {
  console.log("\n=== Temas: desde qué dificultad arranca ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/temas.html?tema=fork&desde=1400", PERFIL(null));
    await enTema(page);
    igual("con ?desde=1400, el primer ejercicio llega a 1400", (await ratingActual(page)) >= 1400, "true");
    igual("y es el primero que llega (el anterior no)", await page.evaluate(() => {
      const ids = idsOf("fork"); return currentIndex > 0 && DATA.puzzles[ids[currentIndex - 1]].rating < 1400;
    }), "true");
    igual("el selector dice 1400", await page.evaluate(() => document.getElementById("nivel-desde").value), "1400");
    igual("y se ve", await page.evaluate(() => document.getElementById("nivel-desde-caja").checkVisibility()), "true");

    // «Saltar» va al próximo SIN resolver: se marca resuelto el que sigue y se salta.
    const [siguiente, saltoA] = await page.evaluate(() => {
      const ids = idsOf("fork");
      const sig = siguienteIndice("fork", currentIndex + 1);
      markSolved(ids[sig]);
      document.getElementById("skip-btn").click();
      return [sig, currentIndex];
    });
    igual("«Saltar» no cae en uno ya resuelto", saltoA !== siguiente && saltoA > siguiente, "true");

    // Resolver con un error: el detalle lo dice.
    await page.evaluate(() => { missedThisPuzzle = true; usedHintThisPuzzle = false; finishPuzzle(); });
    const detalle = await page.evaluate(() => {
      const f = window.__inserts.find((i) => i.tabla === "training_progress");
      return f && f.rows[0].detail;
    });
    igual("el detalle guarda cómo salió", detalle && [detalle.limpio, detalle.con_error, detalle.con_pista], [false, true, false]);

    // Cambiar el selector reubica el tema y queda guardado.
    await page.click("#fin-ejercicio .primary");   // «Siguiente ejercicio →»: ya no salta solo
    await page.waitForFunction(() => !locked, { timeout: 5000 });
    await page.selectOption("#nivel-desde", "1800");
    igual("al elegir 1800, el ejercicio llega a 1800", (await ratingActual(page)) >= 1800, "true");
    igual("y la elección se guarda", await page.evaluate(() => localStorage.getItem("entreno_temas_desde")), "1800");
    sinErrores(errores, "temas con ?desde");
    await ctx.close();
  }
  {
    // Sin enlace ni elección: el Elo del perfil (1800) menos 300 → 1400.
    const { page, ctx, errores } = await abrir(browser, "/entreno/temas.html?tema=fork", PERFIL(1800));
    await enTema(page);
    igual("con Elo 1800 en el perfil, arranca desde 1400", await page.evaluate(() => nivelDesde), "1400");
    igual("y el primer ejercicio llega a 1400", (await ratingActual(page)) >= 1400, "true");
    igual("la pista nombra su nivel", await page.evaluate(() => /≈1800/.test(document.getElementById("nivel-desde-pista").textContent)), "true");
    sinErrores(errores, "temas con Elo del perfil");
    await ctx.close();
  }
  {
    // El Elo del último diagnóstico manda sobre el del perfil; lo elegido, sobre los dos.
    const { page, ctx } = await abrir(browser, "/entreno/temas.html?tema=fork", PERFIL(1800),
      { diagnostico_resultado_v1: JSON.stringify({ fecha: "2026-09-01T00:00:00Z", elo: 1300 }) });
    await enTema(page);
    igual("con el diagnóstico en 1300, arranca desde 1000", await page.evaluate(() => nivelDesde), "1000");
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(browser, "/entreno/temas.html?tema=fork", PERFIL(1800), { entreno_temas_desde: "0" });
    await enTema(page);
    igual("si el alumno eligió «desde el más fácil», se respeta", await page.evaluate(() => [nivelDesde, currentIndex]), [0, 0]);
    await ctx.close();
  }
  {
    // Un tema de táctica de la casa no trae rating: nada que elegir.
    const { page, ctx, errores } = await abrir(browser, "/entreno/temas.html?tema=ultima-linea&desde=1800", PERFIL(null));
    await enTema(page);
    igual("un tema sin rating no muestra el selector",
      await page.evaluate(() => document.getElementById("nivel-desde-caja").checkVisibility()), "false");
    igual("y arranca en el primero", await page.evaluate(() => currentIndex), "0");
    sinErrores(errores, "temas de táctica");
    await ctx.close();
  }
}

async function mates(browser) {
  console.log("\n=== Mates: el detalle dice cómo salió ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/mates.html", PERFIL(null));
  await page.waitForFunction(() => PUZZLES.mate1.length > 0 && game !== null, { timeout: 20000 });
  await page.evaluate(() => { missedThisPuzzle = false; usedHintThisPuzzle = true; finishPuzzle(); });
  const detalle = await page.evaluate(() => {
    const f = window.__inserts.find((i) => i.tabla === "training_progress");
    return f && f.rows[0].detail;
  });
  igual("con pista: limpio no", detalle && [detalle.limpio, detalle.con_error, detalle.con_pista], [false, false, true]);
  sinErrores(errores, "mates");
  await ctx.close();
}

async function racha(browser) {
  console.log("\n=== Racha táctica: la dificultad sube con la racha ===");
  const { page, ctx, errores } = await abrir(browser, "/racha-tactica.html",
    Object.assign(PERFIL(null), { puzzle_rush_scores: [] }));
  await page.waitForFunction(() => window.PUZZLE_RUSH_DATA && window.PUZZLE_RUSH_DATA.length > 0, { timeout: 20000 });
  const r = await page.evaluate(() => {
    const promedio = (n) => {
      streak = n; vistosEnLaRacha = new Set();
      let t = 0; for (let i = 0; i < 20; i++) t += pickRandomPuzzle()[3];
      return Math.round(t / 20);
    };
    const al0 = promedio(0), al10 = promedio(10), al20 = promedio(20);
    // Una racha entera no repite ejercicio.
    streak = 5; vistosEnLaRacha = new Set();
    const vistos = new Set(); let repetidos = 0;
    for (let i = 0; i < 200; i++) { const p = pickRandomPuzzle(); if (vistos.has(p[0])) repetidos++; vistos.add(p[0]); }
    streak = 0;
    return { al0, al10, al20, repetidos };
  });
  igual("al empezar, los ejercicios rondan los 500", Math.abs(r.al0 - ratingEsperado(0)) <= 120, "true");
  igual("con racha 10, rondan los 1100", Math.abs(r.al10 - ratingEsperado(10)) <= 120, "true");
  igual("con racha 20, rondan los 1700", Math.abs(r.al20 - ratingEsperado(20)) <= 150, "true");
  igual("y dentro de una racha no se repite ninguno", r.repetidos, "0");
  sinErrores(errores, "racha táctica");
  await ctx.close();
}
function ratingEsperado(n) { return 500 + 60 * n; }

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await temas(browser);
    await mates(browser);
    await racha(browser);
  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
