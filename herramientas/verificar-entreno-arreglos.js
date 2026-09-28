/* Comprueba, en un navegador, los arreglos de las páginas de Entrenamiento que
   no daban ningún error: la página se veía bien y hacía otra cosa.

   - Mates: acepta cualquier jugada que dé mate (el banco guarda UNA solución y
     a veces hay dos) y mira el tablero desde el bando que juega.
   - Practicar: también acepta otro mate; «Ver solución» ya no sube la racha; y
     las jugadas equivocadas bajan las estrellas, no solo las pistas.
   - Desafíos: con «Ver solución» no se festeja «¡Correcto!» ni sube la racha.
   - Aprender: en el quiz de dos botones, fallar ya no se arregla apretando el
     otro; la lección solo se completa sin errores.
   - Visualización: «Rd2» se lee como el rey cuando la línea pide el rey; y un
     ejercicio sacado con pista o con error no cuenta como resuelto.
   - Diagnóstico: el plan sale entero (las cuatro semanas, con su meta), y si el
     profesor compartió el suyo se ve ese, con su texto escapado.

   Uso:  npm install; node herramientas/verificar-todo.js entreno-arreglos
         (levanta el sitio en el 8777 si no está)                              */
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* El doble de Supabase es el de herramientas/lib/doble-entreno.js. Acá
   training_plans devuelve la fila que se le pase (la política real solo la da
   si shared), y se espera a que la página abra la aplicación. */
const doble = require("./lib/doble-entreno");
async function abrir(browser, ruta, planes, extra) {
  const r = await doble.abrir(browser, ruta, Object.assign(planes ? { training_plans: planes } : {}, extra || {}));
  await r.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return r;
}
const clic = (page, sq) => page.click(`#board [data-square="${sq}"]`);
const estado = (page) => page.evaluate(() => (document.getElementById("round-status") || document.getElementById("lesson-status")).textContent);
function sinErrores(errores, pagina) {
  igual(`${pagina}: sin errores en la página`, errores.length ? errores.join(" | ") : "ninguno", "ninguno");
}

async function mates(browser) {
  console.log("\n=== Mates ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/mates.html");
  await page.waitForFunction(() => PUZZLES.mate1.length > 0, { timeout: 20000 });

  // mate1-0071: la solución guardada es Ch6#, y Ce5# también es mate.
  await page.evaluate(() => {
    currentCategory = "mate1";
    currentIndex = PUZZLES.mate1.findIndex((p) => p.id === "mate1-0071");
    loadPuzzle();
  });
  await clic(page, "f7"); await clic(page, "e5");
  igual("un mate que no es el guardado (Ce5#) se acepta", await estado(page), "✅ ¡Jaque mate!");
  igual("y cuenta como resuelto", await page.evaluate(() => isSolved("mate1-0071")), "true");

  // mate2-1255: juegan las negras, así que la fila 1 va arriba y la h a la izquierda.
  await page.evaluate(() => {
    currentCategory = "mate2";
    currentIndex = PUZZLES.mate2.findIndex((p) => p.id === "mate2-1255");
    loadPuzzle();
  });
  igual("con negras al turno, la primera casilla dibujada es h1",
    await page.evaluate(() => document.querySelector("#board [data-square]").dataset.square), "h1");
  igual("y la de abajo a la derecha es a8",
    await page.evaluate(() => { const c = document.querySelectorAll("#board [data-square]"); return c[c.length - 1].dataset.square; }), "a8");
  // Se mide en la pantalla, no en el orden del DOM: h1 tiene que quedar ARRIBA de a8.
  igual("en la pantalla h1 queda arriba y a la izquierda de a8", await page.evaluate(() => {
    const r = (sq) => document.querySelector(`#board [data-square="${sq}"]`).getBoundingClientRect();
    return r("h1").top < r("a8").top && r("h1").left < r("a8").left;
  }), "true");
  sinErrores(errores, "mates");
  await ctx.close();
}

async function practicar(browser) {
  console.log("\n=== Practicar ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/practicas.html");
  await page.evaluate(() => { setStreak(5); openSet(SETS.find((s) => s.id === "beso")); });

  // Ronda 1, 7k/8/6K1/8/8/8/8/7Q w: la serie guarda Dh7#, y Da8# también es mate.
  await clic(page, "h1"); await clic(page, "a8");
  igual("otro mate (Da8#) se acepta", /¡Correcto!/.test(await estado(page)), "true");
  igual("con tres estrellas y la racha sube", await page.evaluate(() => [setStarsEarned[0], getStreak()]), [3, 6]);
  await page.waitForFunction(() => currentRoundIndex === 1 && !roundLocked, { timeout: 5000 });

  // Ronda 2: una jugada equivocada y después la buena → dos estrellas, no tres.
  await clic(page, "a1"); await clic(page, "b1");
  await page.waitForTimeout(1000);
  await clic(page, "a1"); await clic(page, "a7");
  igual("con un error antes de acertar, dos estrellas", await page.evaluate(() => setStarsEarned[1]), "2");
  await page.waitForFunction(() => currentRoundIndex === 2 && !roundLocked, { timeout: 5000 });

  // Ronda 3: «Ver solución» (tercera pista) no suma a la racha.
  await page.evaluate(() => { setStreak(4); giveHint(); giveHint(); giveHint(); });
  igual("con «Ver solución», la racha queda en 0 (antes quedaba en 1)", await page.evaluate(() => getStreak()), "0");
  igual("una estrella", await page.evaluate(() => setStarsEarned[2]), "1");
  igual("y no se festeja como «¡Correcto!»", /^Solución:/.test(await estado(page)), "true");
  sinErrores(errores, "practicar");
  await ctx.close();
}

async function desafios(browser) {
  console.log("\n=== Desafíos ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/desafios.html");
  await page.waitForFunction(() => SETS.length > 0, { timeout: 20000 });
  igual("las estrellas cuentan pistas y errores",
    await page.evaluate(() => [[0, 0], [1, 0], [0, 1], [0, 3], [3, 0]].map(([p, e]) => EntrenoProgress.estrellasDeLaRonda(p, e))),
    [3, 2, 2, 1, 1]);
  await page.evaluate(() => { openSet(SETS[0]); setStreak(4); giveHint(); giveHint(); giveHint(); });
  igual("con «Ver solución» la racha no sube", await page.evaluate(() => getStreak()), "0");
  igual("y el aviso dice «Solución», no «¡Correcto!»", /^Solución:/.test(await estado(page)), "true");
  sinErrores(errores, "desafíos");
  await ctx.close();
}

async function aprender(browser) {
  console.log("\n=== Aprender: ¿jaque mate o ahogado? ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/aprender.html");
  await page.evaluate(() => openLesson(LESSONS.find((l) => l.id === "reg_quiz")));
  const respuestas = await page.evaluate(() => currentLesson.rounds.map((r) => r.answer));

  // La primera mal: ya no se puede corregir apretando el otro botón.
  await page.click(respuestas[0] === "mate" ? "#quiz-ahogado-btn" : "#quiz-mate-btn");
  igual("una respuesta mal explica por qué", /^❌ No: el rey/.test(await estado(page)), "true");
  await page.click(respuestas[0] === "mate" ? "#quiz-mate-btn" : "#quiz-ahogado-btn");
  igual("y apretar enseguida el otro botón no cuenta", await page.evaluate(() => quizRoundIndex), "1");
  for (let i = 1; i < respuestas.length; i++) {
    await page.waitForFunction((n) => quizRoundIndex === n && !lessonLocked, i, { timeout: 5000 });
    await page.click(respuestas[i] === "mate" ? "#quiz-mate-btn" : "#quiz-ahogado-btn");
  }
  await page.waitForFunction(() => /Acertaste/.test(document.getElementById("lesson-status").textContent), { timeout: 5000 });
  igual("con un fallo, la lección NO queda completada", await page.evaluate(() => isSolved("reg_quiz")), "false");

  await page.click("#retry-btn");
  for (let i = 0; i < respuestas.length; i++) {
    await page.waitForFunction((n) => quizRoundIndex === n && !lessonLocked, i, { timeout: 5000 });
    await page.click(respuestas[i] === "mate" ? "#quiz-mate-btn" : "#quiz-ahogado-btn");
  }
  igual("sin fallos, sí", await page.evaluate(() => isSolved("reg_quiz")), "true");
  sinErrores(errores, "aprender");
  await ctx.close();
}

async function visualizacion(browser) {
  console.log("\n=== Visualización ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/visualizacion.html");
  await page.waitForFunction(() => typeof NIVELES !== "undefined" && typeof openLevel === "function", { timeout: 15000 });
  await page.evaluate(() => openLevel(NIVELES[0].id));
  await page.waitForFunction(() => typeof currentId === "function" && currentId() !== undefined && game !== null, { timeout: 15000 });

  // Rey en e1 y torre en a2: los dos pueden ir a d2. «Rd2» es el rey en
  // castellano y la torre en inglés; gana la que pide la línea.
  const leida = await page.evaluate(() => {
    const fen = "7k/8/8/8/8/8/R7/4K3 w - - 0 1";
    game = new Chess(fen); const rey = jugadaDeLaLinea("Rd2", "Kd2");
    game = new Chess(fen); const torre = jugadaDeLaLinea("Rd2", "Rd2");
    game = new Chess(fen); const ninguna = jugadaDeLaLinea("Rd2", "Kf2");
    return [rey && rey.san, torre && torre.san, ninguna && ninguna.san];
  });
  igual("«Rd2» es el rey si la línea pide el rey, la torre si pide la torre, y si no, la de siempre", leida, ["Kd2", "Rd2", "Rd2"]);

  await page.evaluate(() => { openLevel(NIVELES[0].id); });
  await page.waitForFunction(() => game !== null && currentId() !== undefined, { timeout: 15000 });
  const id = await page.evaluate(() => { usedHintThisPuzzle = true; const i = currentId(); finishPuzzle(); return i; });
  igual("con pista, el ejercicio no queda resuelto", await page.evaluate((i) => isSolved(i), id), "false");
  igual("ni se registra en training_progress",
    await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "training_progress").length), "0");
  sinErrores(errores, "visualización");
  await ctx.close();
}

async function moduloComun(browser) {
  console.log("\n=== El módulo común de ejercicios (js/ejercicio-tablero.js) ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/mates.html");
    await page.waitForFunction(() => PUZZLES.mate1.length > 0, { timeout: 20000 });
    igual("el orden del tablero: desde blancas empieza en a8, desde negras en h1",
      await page.evaluate(() => [EjercicioTablero.casillas("w")[0], EjercicioTablero.casillas("b")[0], EjercicioTablero.casillas("b").length]),
      ["a8", "h1", 64]);
    // mate1-0019: el mate es fxg8=C#, una subpromoción. Se elige en el mismo
    // diálogo de todo el sitio (js/coronacion.js), que dice el nombre de cada pieza.
    await page.evaluate(() => {
      currentCategory = "mate1";
      currentIndex = PUZZLES.mate1.findIndex((p) => p.id === "mate1-0019");
      loadPuzzle();
    });
    await clic(page, "f7"); await clic(page, "g8");
    const d = page.locator("dialog.coronacion-dialogo");
    igual("coronar abre el diálogo común", await d.isVisible(), "true");
    await d.getByRole("button", { name: /Caballo/ }).click();
    igual("y el caballo da el mate", await estado(page), "✅ ¡Jaque mate!");
    sinErrores(errores, "mates, coronación");
    await ctx.close();
  }
  {
    // Desafíos tiene su propia racha: antes escribía en la de Practicar.
    const { page, ctx, errores } = await abrir(browser, "/entreno/desafios.html");
    await page.waitForFunction(() => SETS.length > 0, { timeout: 20000 });
    const r = await page.evaluate(() => {
      localStorage.setItem("entreno_practicas_streak", "9");
      setStreak(2);
      return [localStorage.getItem("entreno_desafios_streak"), localStorage.getItem("entreno_practicas_streak"), getStreak()];
    });
    igual("la racha de Desafíos no toca la de Practicar", r, ["2", "9", 2]);
    sinErrores(errores, "desafíos, racha propia");
    await ctx.close();
  }
}

const SEMANAS = [1, 2, 3, 4].map((n) => ({
  titulo: `Semana ${n}`, porque: "porque sí", objetivo: `Meta ${n}`, tareas: ["una tarea"],
  recursos: [{ texto: "Temas", href: "entreno/temas.html?tema=fork" }, { texto: "malo", href: "javascript:alert(1)" }],
}));
const PLAN = { rutina: "media hora al día", prioridad: ["Táctica"], semanas: SEMANAS, medicion: "Repetir el diagnóstico." };

async function diagnostico(browser) {
  console.log("\n=== Diagnóstico: el plan ===");
  const RESUMEN = { fortalezas: [] };
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html");
    await page.evaluate(([plan, resumen]) => pintarPlan(plan, resumen), [PLAN, RESUMEN]);
    const cajas = await page.evaluate(() => Array.from(document.querySelectorAll("#result-plan .shadow-md")).map((c) => c.textContent));
    igual("se pintan las cuatro semanas (antes, solo tres)", cajas.length, "4");
    igual("cada una con su meta", cajas.every((t, i) => t.includes(`Meta: Meta ${i + 1}`)), "true");
    igual("un enlace con esquema (javascript:) no se pinta",
      await page.evaluate(() => document.querySelectorAll('#result-plan a[href^="javascript"]').length), "0");
    igual("y el del sitio va con ../ delante",
      await page.evaluate(() => document.querySelector("#result-plan a").getAttribute("href")), "../entreno/temas.html?tema=fork");
    sinErrores(errores, "diagnóstico");
    await ctx.close();
  }
  {
    // Lo hecho desde el diagnóstico, al lado de cada enlace (avance_del_plan()).
    const RECURSOS = [{ texto: "Temas", href: "entreno/temas.html?tema=fork" },
      { texto: "Mates", href: "entreno/mates.html?cat=mate2" }, { texto: "Tablero", href: "tablero.html" }];
    const CON_RECURSOS = Object.assign({}, PLAN, { semanas: [Object.assign({}, SEMANAS[0], { recursos: RECURSOS })] });
    const { page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html", null,
      { "rpc:avance_del_plan": [{ clave: "tema:fork", hechos: 12 }, { clave: "actividad:4x4", hechos: 3 }] });
    await page.waitForFunction(() => sesionActual !== null, { timeout: 10000 });
    await page.evaluate(async ([plan, resumen]) => { pintarPlan(plan, resumen); await pintarAvance("2026-09-01T00:00:00Z"); }, [CON_RECURSOS, RESUMEN]);
    const marcas = await page.evaluate(() => [...document.querySelectorAll("#result-plan a")].map((a) =>
      a.textContent + (a.nextElementSibling && a.nextElementSibling.classList.contains("plan-avance") ? a.nextElementSibling.textContent : "")));
    igual("cada enlace dice lo hecho desde el diagnóstico; el que no deja rastro, nada",
      marcas, ["Temas (✓ 12 hechos)", "Mates (todavía nada)", "Tablero"]);
    sinErrores(errores, "diagnóstico con avance");
    await ctx.close();
  }
  {
    const ESCRITO = Object.assign({}, PLAN, { semanas: [Object.assign({}, SEMANAS[0], { titulo: '<img src=x id="inyectado">Semana del profe' })] });
    const fila = { student_id: "u-ana", shared: true, nota: "<b id=\"negrita\">Dale</b>",
      plan: { generado: ESCRITO, diagnostico_fecha: "2026-09-20T10:00:00.000Z" } };
    const { page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html", [fila]);
    const compartido = await page.evaluate(() => planDelProfesor({ fecha: "2026-09-20T09:59:30.000Z" }));
    igual("para ese diagnóstico, se usa el plan que compartió el profesor", compartido && compartido.plan.semanas[0].titulo, ESCRITO.semanas[0].titulo);
    igual("para uno hecho DESPUÉS, no (quedó viejo)",
      await page.evaluate(() => planDelProfesor({ fecha: "2026-09-25T10:00:00.000Z" })), null);
    await page.evaluate(([c, resumen]) => pintarPlan(c.plan, resumen, c.nota), [compartido, RESUMEN]);
    igual("dice que es el del profesor, con su nota",
      await page.evaluate(() => /te compartió tu profesor[\s\S]*Dale/.test(document.getElementById("result-plan").textContent)), "true");
    igual("lo que escribió el profesor va como texto, no como HTML",
      await page.evaluate(() => [!!document.getElementById("inyectado"), !!document.getElementById("negrita")]), [false, false]);
    sinErrores(errores, "diagnóstico con plan del profesor");
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await mates(browser);
    await practicar(browser);
    await desafios(browser);
    await aprender(browser);
    await visualizacion(browser);
    await diagnostico(browser);
    await moduloComun(browser);
  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
