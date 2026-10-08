/* Comprueba, en un navegador, los arreglos de las páginas de Entrenamiento que
   no daban ningún error: la página se veía bien y hacía otra cosa.

   - Mates: acepta cualquier jugada que dé mate (el banco guarda UNA solución y
     a veces hay dos) y mira el tablero desde el bando que juega.
   - Practicar: también acepta otro mate; «Ver solución» ya no sube la racha; y
     las jugadas equivocadas bajan las estrellas, no solo las pistas.
   - Desafíos: con «Ver solución» no se festeja «¡Correcto!» ni sube la racha.
   - Aprender: en el quiz de dos botones, fallar ya no se arregla apretando el
     otro; la lección solo se completa sin errores.
   - Visualización: «Rd2» es SIEMPRE el rey y «Td2» la torre; y un
     ejercicio sacado con pista o con error no cuenta como resuelto.
   - Visualización va de fácil a difícil; Racha táctica sin sesión manda al
     login con ?next=; Precisión posicional enlaza fichas en «a reforzar» y
     no repite la misma idea espejada en la ronda corta siguiente.
   - Temas y Mates: al fallar dicen qué contesta el rival (si chess.js lo
     puede afirmar); al terminar esperan a «Siguiente» y dejan ver la línea.
   - Coordenadas: cada casilla lleva sus aciertos y fallos, y el sorteo
     insiste en las que cuestan.
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

  // Ronda 1, 7k/Q7/6K1/8/8/8/8/8 w: la serie guarda Dh7#, y Db8# también es mate.
  await clic(page, "a7"); await clic(page, "b8");
  igual("otro mate (Db8#) se acepta", /¡Correcto!/.test(await estado(page)), "true");
  igual("con tres estrellas y la racha sube", await page.evaluate(() => [setStarsEarned[0], getStreak()]), [3, 6]);
  await page.waitForFunction(() => currentRoundIndex === 1 && !roundLocked, { timeout: 5000 });

  // Ronda 2: una jugada equivocada y después la buena → dos estrellas, no tres.
  await clic(page, "h7"); await clic(page, "h1");
  await page.waitForTimeout(1000);
  await clic(page, "h7"); await clic(page, "a7");
  igual("con un error antes de acertar, dos estrellas", await page.evaluate(() => setStarsEarned[1]), "2");
  await page.waitForFunction(() => currentRoundIndex === 2 && !roundLocked, { timeout: 5000 });

  // Ronda 3: «Ver solución» (tercera pista) no suma a la racha.
  await page.evaluate(() => { setStreak(4); giveHint(); giveHint(); giveHint(); });
  igual("con «Ver solución», la racha queda en 0 (antes quedaba en 1)", await page.evaluate(() => getStreak()), "0");
  igual("una estrella", await page.evaluate(() => setStarsEarned[2]), "1");
  // Dice cuál era (js/ejercicio-tablero.js, en castellano fuera del Modo Adaptado), sin festejar.
  igual("y no se festeja como «¡Correcto!»: dice cuál era", /^La solución era: \S/.test(await estado(page)) && !/Correcto/.test(await estado(page)), "true");
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
  igual("y el aviso dice «Solución» (y que no cuenta), no «¡Correcto!»", /^Solución( \(no cuenta como resuelto\))?:/.test(await estado(page)), "true");
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

  // Rey en e1 y torre en a2: los dos pueden ir a d2. En el sitio R es SIEMPRE
  // el rey y la torre es T, aunque la línea pida la torre.
  const leida = await page.evaluate(() => {
    const fen = "7k/8/8/8/8/8/R7/4K3 w - - 0 1";
    game = new Chess(fen); const rey = jugadaDeLaLinea("Rd2", "Kd2");
    game = new Chess(fen); const torre = jugadaDeLaLinea("Td2", "Rd2");
    game = new Chess(fen); const ninguna = jugadaDeLaLinea("Rd2", "Kf2");
    return [rey && rey.san, torre && torre.san, ninguna && ninguna.san];
  });
  igual("«Rd2» es el rey (pida lo que pida la línea) y «Td2» la torre", leida, ["Kd2", "Rd2", "Kd2"]);
  const rdConTorre = await page.evaluate(() => { game = new Chess("7k/8/8/8/8/8/R7/4K3 w - - 0 1"); const m = jugadaDeLaLinea("Rd2", "Rd2"); return m && m.san; });
  igual("«Rd2» nunca mueve la torre, aunque la línea la pida", rdConTorre, "Kd2");

  await page.evaluate(() => { openLevel(NIVELES[0].id); });
  await page.waitForFunction(() => game !== null && currentId() !== undefined, { timeout: 15000 });
  const id = await page.evaluate(() => { usedHintThisPuzzle = true; const i = currentId(); finishPuzzle(); return i; });
  igual("con pista, el ejercicio no queda resuelto", await page.evaluate((i) => isSolved(i), id), "false");
  igual("ni se registra en training_progress",
    await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "training_progress").length), "0");
  sinErrores(errores, "visualización");
  await ctx.close();
}

/* Los cinco arreglos rápidos: el orden de Visualización, adónde manda Racha
   táctica sin sesión, y en Precisión posicional las fichas de «a reforzar» y
   que la ronda corta siguiente no repita la misma idea dada vuelta. */
async function rapidos(browser) {
  console.log("\n=== Visualización: de fácil a difícil ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/visualizacion.html");
    await page.waitForFunction(() => DATA && Object.keys(POOLS).length && NIVELES.every((n) => POOLS[n.id]), { timeout: 15000 });
    igual("cada nivel va ordenado por rating, de menor a mayor", await page.evaluate(() => NIVELES.every((n) => {
      const r = POOLS[n.id].map((id) => (typeof DATA.puzzles[id].rating === "number" ? DATA.puzzles[id].rating : Infinity));
      return r.length > 1 && r.every((x, i) => i === 0 || r[i - 1] <= x);
    })), "true");
    sinErrores(errores, "visualización");
    await ctx.close();
  }

  console.log("\n=== Racha táctica con la sesión vencida ===");
  {
    const { page, ctx } = await doble.abrir(browser, "/racha-tactica.html", { sesion: null });
    await page.waitForURL(/login\.html/, { timeout: 8000 }).catch(() => {});
    igual("manda a iniciar sesión y vuelve a Racha táctica", decodeURIComponent(new URL(page.url()).search), "?next=racha-tactica.html");
    await ctx.close();
  }

  console.log("\n=== Precisión posicional ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/precision-posicional.html");
    await page.click("#start-btn");
    await page.waitForFunction(() => Array.isArray(tanda) && tanda.length === 8, { timeout: 8000 });
    const primera = await page.evaluate(() => tanda.map((i) => i.id));
    // Sin contestar nada: las ocho áreas quedan «a reforzar» (se muestran tres).
    await page.evaluate(() => terminar());
    await page.waitForFunction(() => document.querySelectorAll("#r-plan a").length > 0, { timeout: 8000 }).catch(() => {});
    const enlaces = await page.evaluate(() => [...document.querySelectorAll("#r-plan a")].map((a) => ({
      href: a.getAttribute("href"), texto: a.textContent, visible: a.checkVisibility() })));
    igual("«a reforzar» enlaza fichas de Estudio, visibles", enlaces.length >= 3 && enlaces.every((e) => /^estudio\.html\?ficha=[a-z-]+$/.test(e.href) && /^Ficha: /.test(e.texto) && e.visible), "true");
    await page.click("#repeat-btn");
    await page.click("#start-btn");
    await page.waitForFunction((a) => tanda.length === 8 && tanda.map((i) => i.id).join() !== a.join(), primera, { timeout: 8000 });
    const idea = (id) => id.replace(/_(h|v|hv)$/, "");
    const segunda = await page.evaluate(() => tanda.map((i) => i.id));
    const repetidas = segunda.filter((id) => primera.map(idea).includes(idea(id)));
    igual("la ronda corta siguiente no repite ninguna idea, ni espejada", repetidas.join(", ") || "ninguna", "ninguna");
    sinErrores(errores, "precisión posicional");
    await ctx.close();
  }
}

/* Al fallar, qué contesta el rival (si chess.js lo puede afirmar); al terminar,
   el ejercicio espera a «Siguiente» y deja recorrer la línea jugada. */
async function verLaLinea(browser) {
  console.log("\n=== La refutación del error ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/temas.html?tema=fork&desde=0", null, { entreno_temas_desde: "0" });
    await page.waitForFunction(() => typeof currentTheme !== "undefined" && currentTheme && game !== null, { timeout: 20000 });
    const r = await page.evaluate(() => [
      "r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1",      // Ta1#
      "6k1/5ppp/1b6/8/3Q4/8/5PPP/6K1 b - - 0 1",    // la dama de d4 queda sin defensa
      "6k1/5ppp/1b6/1N6/3Q4/8/5PPP/6K1 b - - 0 1",  // la misma, pero el caballo recupera
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    ].map((f) => { const g = new Chess(f); const t = EjercicioTablero.refutacion(g); return [t, g.fen() === f]; }));
    igual("un mate en una se dice, en castellano", r[0], ["Así el rival da mate con Ta1#.", true]);
    igual("una pieza que se pierde se dice", r[1], ["Así el rival se come la dama de d4 con Axd4, y ninguna pieza tuya puede volver a comer en d4.", true]);
    igual("si se puede volver a comer, no se dice nada", r[2], [null, true]);
    igual("y sin nada que afirmar, tampoco", r[3], [null, true]);

    // En la página: una jugada equivocada que deja algo así lo dice en el aviso.
    const caso = await page.evaluate(() => {
      const ids = idsOf("fork");
      for (let i = 0; i < Math.min(ids.length, 200); i++) {
        const p = DATA.puzzles[ids[i]]; const g = new Chess(p.fen);
        for (const m of g.moves({ verbose: true })) {
          if (m.san === p.solution[0]) continue;
          g.move(m); const t = g.in_checkmate() ? null : EjercicioTablero.refutacion(g); g.undo();
          if (t) return { i, from: m.from, to: m.to, san: m.san, t };
        }
      }
      return null;
    });
    if (!caso) igual("hay un ejercicio de tenedor con un error refutable", "ninguno", "alguno");
    else {
      await page.evaluate((c) => { currentIndex = c.i; loadPuzzle(); playMove(c.from, c.to, "q"); }, caso);
      igual("el aviso del error dice la jugada en castellano y lo que contesta el rival",
        await page.evaluate(() => document.getElementById("round-status").textContent),
        await page.evaluate((c) => ComandosTablero.incorrecta(EjercicioTablero.jugadaEs(c.san), c.t), caso));
    }
    sinErrores(errores, "refutación");
    await ctx.close();
  }

  console.log("\n=== Mates: «Siguiente» y «Ver la línea» ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/mates.html");
    await page.waitForFunction(() => PUZZLES.mate2.length > 0 && game !== null, { timeout: 20000 });
    // Un mate en dos con negras al turno, jugado entero desde la página.
    const id = await page.evaluate(() => {
      currentCategory = "mate2";
      currentIndex = PUZZLES.mate2.findIndex((p) => p.fen.split(" ")[1] === "b");
      loadPuzzle();
      const j = jugadaEsperada(); playMove(j.from, j.to, j.promotion);
      return currentPuzzle().id;
    });
    await page.waitForFunction(() => !locked, { timeout: 5000 });
    await page.evaluate(() => { const j = jugadaEsperada(); playMove(j.from, j.to, j.promotion); });
    await page.waitForFunction(() => document.getElementById("fin-ejercicio").checkVisibility(), { timeout: 5000 });
    await page.waitForTimeout(1500);
    igual("resuelto, ya no salta solo al siguiente", await page.evaluate(() => currentPuzzle().id), id);
    igual("el foco queda en «Siguiente ejercicio →»", await page.evaluate(() => document.activeElement.textContent), "Siguiente ejercicio →");
    const ver = '#fin-ejercicio button[aria-controls]';
    igual("«Ver la línea» dice que está cerrado", await page.getAttribute(ver, "aria-expanded"), "false");
    await page.click(ver);
    igual("y al abrirlo, que está abierto", await page.getAttribute(ver, "aria-expanded"), "true");
    const visor = await page.evaluate(() => {
      const v = document.querySelector("#fin-ejercicio .fin-visor");
      const casillas = v.querySelectorAll(".visor-sq");
      return { visible: v.checkVisibility(), n: casillas.length, primera: casillas[0].dataset.square,
               jugadas: v.querySelectorAll(".visor-jugada").length, numero: v.querySelector(".visor-par b").textContent,
               historia: game.history().length };
    });
    igual("se ve un tablero de 64 casillas, mirado desde las negras (h1 arriba a la izquierda)",
      [visor.visible, visor.n, visor.primera], [true, 64, "h1"]);
    igual("con las jugadas del ejercicio", visor.jugadas, visor.historia);
    igual("numeradas desde la posición, empezando por las negras", /^\d+…$/.test(visor.numero), "true");
    await page.click('#fin-ejercicio .visor-control[aria-label="Ir a la última jugada"]');
    await page.waitForTimeout(120);
    igual("al final de la línea, el mate", await page.evaluate(() => /jaque mate/.test(document.querySelector("#fin-ejercicio .visor-escrita").textContent)), "true");
    await page.click("#fin-ejercicio .primary");
    igual("«Siguiente» pasa al que sigue", await page.evaluate((i) => currentPuzzle().id !== i, id), "true");
    igual("y el panel del terminado se va", await page.evaluate(() => document.getElementById("fin-ejercicio").checkVisibility()), "false");
    // Escribiendo, «siguiente» hace lo mismo que el botón.
    const antes = await page.evaluate(() => { finishPuzzle(); return currentPuzzle().id; });
    await page.evaluate(() => jugarEscribiendo("siguiente", { limpiar() { return this; }, decir() { return this; } }));
    igual("escribir «siguiente» también pasa", await page.evaluate((i) => currentPuzzle().id !== i, antes), "true");
    sinErrores(errores, "mates, ver la línea");
    await ctx.close();
  }
}

/* Coordenadas insiste en las casillas que cuestan (js/coordenadas-casillas.js):
   cada pedido cuenta una vez, el sorteo las pesa y al final se nombran. */
async function coordenadas(browser) {
  console.log("\n=== Coordenadas: las casillas que cuestan ===");
  const { page, ctx, errores } = await doble.abrir(browser, "/entreno/coordenadas.html", {},
    { entreno_coord_casillas_v1: JSON.stringify({ "b6:f": 9, "b6:a": 1 }) });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  // El sorteo: b6, fallada 9 de 10 veces, sale bastante más que el promedio.
  const frec = await page.evaluate(() => {
    const e = CoordenadasCasillas.leer(); let b6 = 0; const N = 64000;
    for (let i = 0; i < N; i++) if (CoordenadasCasillas.elegir(e, null, i / N) === "b6") b6++;
    return [b6 / N, CoordenadasCasillas.peso(e, "b6"), CoordenadasCasillas.peso(e, "e4"), CoordenadasCasillas.elegir(e, "b6", 0.5) !== "b6"];
  });
  igual("b6 pesa más (1 + 3·9/11) y e4, que nunca salió, 1", [frec[1].toFixed(2), frec[2]], ["3.45", 1]);
  igual("y sale unas 3,45 veces más que una casilla cualquiera", Math.abs(frec[0] - 3.45 / (63 + 3.45)) < 0.002, "true");
  igual("la que se acaba de pedir no se repite", frec[3], "true");

  await page.click("#start-btn");
  // Tres clics malos y después el bueno: UN fallo, ningún acierto.
  const r = await page.evaluate(() => {
    currentTarget = "c3"; falladaEsta = false;
    ["d4", "e5", "f6"].forEach((sq) => handleGuess(sq));
    handleGuess("c3");
    /* La siguiente la sortea la página, y b6 (sembrada con 9 de 10) sale una
       de cada veinte veces: entonces su acierto sería el segundo y el total,
       11. Se fija una sin historia, para que la prueba no dependa del sorteo. */
    currentTarget = "e4"; falladaEsta = false;
    const tras = currentTarget;
    handleGuess(tras);            // a la primera: un acierto
    const e = CoordenadasCasillas.leer();
    return [e["c3:f"], e["c3:a"] || 0, e[tras + ":a"], misses];
  });
  igual("tres clics malos en la misma cuentan UN fallo, y encontrarla después no es acierto", r.slice(0, 2), [1, 0]);
  igual("la que sale a la primera es un acierto", r[2], 1);
  igual("los errores de la ronda siguen contando los tres clics", r[3], 3);
  await page.evaluate(() => endRound());
  igual("al terminar, nombra las que más cuestan", await page.evaluate(() => {
    const d = document.getElementById("dificiles"); return d.checkVisibility() ? d.textContent : "";
  }), "Las que más te cuestan: b6 (fallada 9 de 10 veces). Te van a salir más seguido.");
  igual("y viaja con la cuenta (maxPorClave)", await page.evaluate(() =>
    (ProgresoUsuario.claves().find((c) => c.clave === "entreno_coord_casillas_v1") || {}).fusion), "maxPorClave");
  sinErrores(errores, "coordenadas");
  await ctx.close();
}

/* En las tácticas, cualquier jugada que cumpla el motivo es buena
   (js/motivos-tacticos.js): en un descubierto, todo salto del caballo descubre
   el jaque, y antes solo se aceptaba el guardado. */
async function motivos(browser) {
  console.log("\n=== Practicar y Aprender: cualquier jugada que cumpla el motivo ===");
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/practicas.html");
    // descubierto #1: 7k/8/8/8/8/2N5/8/B3K3 w, guardada Cb5+; Ce4+ también descubre el jaque del alfil.
    await page.evaluate(() => openSet(SETS.find((s) => s.id === "descubierto")));
    await clic(page, "c3"); await clic(page, "e4");
    igual("un descubierto que no es el guardado (Ce4+) se acepta", /¡Correcto!/.test(await estado(page)), "true");
    await page.waitForFunction(() => currentRoundIndex === 1 && !roundLocked, { timeout: 5000 });
    // Una jugada que no descubre nada sigue siendo un error.
    await clic(page, "e1"); await clic(page, "f1");
    igual("una jugada que no cumple el motivo sigue sin valer", /no es la jugada que buscamos/.test(await estado(page)), "true");
    sinErrores(errores, "practicar, motivos");
    await ctx.close();
  }
  {
    const { page, ctx, errores } = await abrir(browser, "/entreno/aprender.html");
    await page.evaluate(() => openLesson(LESSONS.find((l) => l.id === "tac_descubierta")));
    // 4k3/8/2N5/8/B7/8/8/6K1 w: la guardada es Cd4+; Cb4+ también descubre el alfil.
    await page.evaluate(() => { const m = game.move({ from: "c6", to: "b4" }); resolverJugada(m); });
    igual("en Aprender, otro salto que descubre el jaque también completa la lección", await page.evaluate(() => isSolved("tac_descubierta")), "true");
    sinErrores(errores, "aprender, motivos");
    await ctx.close();
  }
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

async function tableroYPistas(browser) {
  console.log("\n=== El tablero y las pistas, los mismos en todas las páginas ===");
  const celda = (page, sq) => page.evaluate((x) => {
    const c = document.querySelector(`#board [data-square="${x}"]`);
    return c ? { clases: [...c.classList].filter((k) => /hint|last/.test(k)).join(" "), label: c.getAttribute("aria-label") || "" } : null;
  }, sq);
  {
    // Temas, en un grupo mezclado: la primera pista dice el motivo; la segunda
    // marca la pieza, y la marca SOBREVIVE a un repintado (antes se perdía).
    const { page, ctx, errores } = await abrir(browser, "/entreno/temas.html?tema=mix", null, { entreno_temas_desde: "0" });
    await page.waitForFunction(() => typeof currentTheme !== "undefined" && currentTheme === "mix" && game !== null, { timeout: 20000 });
    await page.evaluate(() => {
      // El primero del grupo cuyo motivo se conozca.
      const ids = idsOf("mix");
      for (let i = 0; i < ids.length; i++) { currentIndex = i; if (motivoDelEjercicio()) break; }
      loadPuzzle();
    });
    await page.evaluate(() => giveHint());
    igual("en un grupo mezclado, la primera pista dice el motivo", /^Pista: el motivo es «/.test(await estado(page)), "true");
    igual("y el botón pasa a «Otra pista»", await page.textContent("#hint-btn"), "💡 Otra pista");
    const desde = await page.evaluate(() => { giveHint(); return jugadaEsperada().from; });
    igual("la segunda marca la pieza", (await celda(page, desde)).clases, "hint-from");
    await page.evaluate(() => drawBoard());
    igual("la marca sigue después de repintar", (await celda(page, desde)).clases, "hint-from");
    igual("y el lector de pantalla la oye", /pista: la pieza que se mueve/.test((await celda(page, desde)).label), "true");
    igual("el botón ya dice «Ver solución»", await page.textContent("#hint-btn"), "💡 Ver solución");
    sinErrores(errores, "temas, pistas");
    await ctx.close();
  }
  {
    // Mates: la respuesta del rival queda marcada como la última jugada.
    const { page, ctx, errores } = await abrir(browser, "/entreno/mates.html");
    await page.waitForFunction(() => PUZZLES.mate2.length > 0, { timeout: 20000 });
    await page.evaluate(() => { currentCategory = "mate2"; currentIndex = 0; loadPuzzle(); const j = jugadaEsperada(); playMove(j.from, j.to, j.promotion); });
    await page.waitForFunction(() => !locked, { timeout: 5000 });
    igual("la respuesta del rival queda marcada en el tablero", await page.evaluate(() =>
      document.querySelectorAll("#board .sq.last").length), "2");
    sinErrores(errores, "mates, última jugada");
    await ctx.close();
  }
  {
    // Practicar: una serie con negras se mira desde las negras.
    const { page, ctx, errores } = await abrir(browser, "/entreno/practicas.html");
    await page.evaluate(() => { openSet(SETS.find((x) => x.id === "coz")); currentRoundIndex = 4; loadRound(); });
    igual("con negras al turno, la primera casilla es h1", await page.evaluate(() =>
      document.querySelector("#board [data-square]").dataset.square), "h1");
    await page.evaluate(() => { giveHint(); giveHint(); });
    igual("pieza y destino marcados", [(await celda(page, "e4")).clases, (await celda(page, "f2")).clases], ["hint-from", "hint-to"]);
    sinErrores(errores, "practicar, tablero");
    await ctx.close();
  }
  {
    // Desafíos sin pista escrita: antes las dos primeras marcaban la misma
    // pieza; ahora la segunda marca la casilla de destino.
    const { page, ctx, errores } = await abrir(browser, "/entreno/desafios.html");
    await page.waitForFunction(() => SETS.length > 0, { timeout: 20000 });
    const j = await page.evaluate(() => {
      for (const set of SETS) for (let i = 0; i < set.rounds.length; i++) {
        if (!set.rounds[i].hint) { openSet(set); currentRoundIndex = i; loadRound(); return jugadaDelDesafio(); }
      }
      return null;
    });
    await page.evaluate(() => { giveHint(); giveHint(); });
    igual("sin pista escrita: pieza y después destino", [(await celda(page, j.from)).clases, (await celda(page, j.to)).clases], ["hint-from", "hint-to"]);
    sinErrores(errores, "desafíos, pistas");
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
    await tableroYPistas(browser);
    await rapidos(browser);
    await verLaLinea(browser);
    await coordenadas(browser);
    await motivos(browser);
  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
