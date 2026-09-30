/* Comprueba «Repasar mis clases» (repasar-clases.html) en un navegador, con el
   doble de Supabase de Entrenamiento, y que la clase en vivo guarde lo que
   este visor necesita.

   - La lista trae solo lo ligado a una clase (.not class_session_id is null),
     con el nombre y la fecha de la clase.
   - El visor recorre la partida con el MISMO árbol del PGN (PgnClase.arbol):
     la línea principal, cada variante donde nace (entre paréntesis) y su
     continuación, en notación española.
   - El comentario del profe sale al mirar esa jugada, con el signo dicho en
     palabras, y por textContent: un comentario con HTML no crea ningún nodo.
   - Una partida de antes (sin `datos`) muestra la línea del PGN y lo dice.
   - (Sin sesión manda a iniciar sesión: lo cubre verificar-guardia-sesion.js,
     que recorre todas las páginas de la Academia.)
   - js/sesion.js guarda `datos` en los TRES inserts de saved_games (el botón,
     la línea archivada y el guardado al cerrar), y guarda sola la partida al
     cerrar la clase ANTES de marcarla cerrada (si no, el trigger no la liga).

   Uso:  npm install; node herramientas/verificar-todo.js repasar-clases        */
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

const MALICIOSO = '<img src=x onerror="window.__xss=1">';
const PARTIDAS = [
  { id: "p1", title: "Clase del 28 de septiembre", created_at: "2026-09-28T23:00:00Z", move_count: 4,
    class_session_id: "c1", class_sessions: { title: "La defensa de los dos caballos", started_at: "2026-09-28T22:00:00Z" },
    pgn: "", datos: {
      inicio: null, jugadas: ["e4", "e5", "Nf3", "Nc6"],
      variantes: [{ id: "v1", parent_id: null, root_ply: 2, san: "Bc4" }, { id: "v2", parent_id: "v1", root_ply: 2, san: "Nf6" }],
      comentarios: { "e4 e5 Nf3": { nag: 1, texto: MALICIOSO }, "e4 e5 Bc4": { nag: null, texto: "El alfil apunta a f7." } },
    } },
  { id: "p2", title: "Una partida de antes", created_at: "2026-09-01T23:00:00Z", move_count: 2,
    class_session_id: "c0", class_sessions: { title: null, started_at: "2026-09-01T22:00:00Z" },
    pgn: '[Event "?"]\n\n1. d4 d5 *\n', datos: null },
  // La compartió el profe con los que faltaron (class_sessions.para_ausentes), y Ana no fue.
  { id: "p4", title: "Clase del 25", created_at: "2026-09-25T23:00:00Z", move_count: 3, created_by: "u-profe",
    class_session_id: "c4", class_sessions: { title: "Finales de torre", started_at: "2026-09-25T22:00:00Z", para_ausentes: true },
    pgn: "", datos: { inicio: null, jugadas: ["e4", "e5", "Nf3"], variantes: [], comentarios: {} } },
  // Guardada fuera de clase: la lista no la pide.
  { id: "p3", title: "Preparación", created_at: "2026-09-02T23:00:00Z", move_count: 1, class_session_id: null, pgn: "1. c4 *", datos: null },
];
/* Las preguntas de la clase c4: una en la partida (después de 1… e5) y otra en
   una posición aparte. La del motor llega porque la pregunta ya se cerró; la de
   Ana es la que contestó en clase. */
const TRAS_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
const PREGUNTAS = {
  questions: [
    { id: "q1", class_session_id: "c4", fen: TRAS_E5, prompt: "¿Qué jugarías?", tipo: "jugada", opciones: null, closed_at: "2026-09-25T22:30:00Z", created_at: "1" },
    { id: "q2", class_session_id: "c4", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", prompt: "Mate en uno", tipo: "jugada", opciones: null, closed_at: "2026-09-25T22:40:00Z", created_at: "2" },
    { id: "q9", class_session_id: "c9", fen: TRAS_E5, prompt: "De otra clase", tipo: "jugada", closed_at: "x", created_at: "3" },
  ],
  question_engine_answers: [{ question_id: "q1", answer: { moves: ["Nf3", "Nc6"] } }],
  question_answers: [{ question_id: "q1", student_id: "u-ana", moves: ["d4"], opcion: null, is_correct: false }],
  class_attendance: [{ session_id: "c1", student_id: "u-ana" }],
};

const texto = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : null; }, sel);

(async () => {
  console.log("\n=== js/sesion.js guarda lo que el visor necesita ===");
  {
    const src = fs.readFileSync(path.join(__dirname, "..", "js", "sesion.js"), "utf8");
    const inserts = src.split('sb.from("saved_games").insert(').slice(1).map((t) => t.slice(0, 400));
    igual("los tres inserts de saved_games llevan `datos`", inserts.map((t) => /datos: datosDeLaClase\(/.test(t)), [true, true, true]);
    const cerrar = src.slice(src.indexOf("async function cerrarClaseDesdeAqui"));
    igual("al cerrar, la partida se guarda ANTES de marcar la clase cerrada",
      cerrar.indexOf("guardarLaClaseAlCerrar(") > 0 && cerrar.indexOf("guardarLaClaseAlCerrar(") < cerrar.indexOf("ended_at: new Date()"), "true");
  }

  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== La lista ===");
    const { page, ctx, errores } = await abrir(browser, "/repasar-clases.html", Object.assign({ saved_games: PARTIDAS }, PREGUNTAS));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("#lista-clases button").length > 0, null, { timeout: 10000 });
    const lista = await page.evaluate(() => Array.from(document.querySelectorAll("#lista-clases button")).map((b) => b.dataset.id));
    igual("solo lo ligado a una clase", lista, ["p1", "p2", "p4"]);
    await page.waitForFunction(() => /Te la perdiste/.test(document.getElementById("lista-clases").textContent), null, { timeout: 5000 });
    igual("la que compartió con los que faltaron dice que se la perdió", /Te la perdiste/.test(await texto(page, '#lista-clases [data-id="p4"]')), "true");
    igual("la otra no", /Te la perdiste/.test(await texto(page, '#lista-clases [data-id="p1"]')), "false");
    igual("con el nombre de la clase", await texto(page, '#lista-clases [data-id="p1"] span'), "La defensa de los dos caballos");

    console.log("\n=== El visor ===");
    await page.click('#lista-clases [data-id="p1"]');
    const jugadas = await page.evaluate(() => document.getElementById("visor-jugadas").textContent.replace(/\s+/g, " ").trim());
    igual("la línea principal y la variante donde nace, en notación española",
      jugadas, "1. e41… e52. Cf3! 💬(2. Ac4 💬2… Cf6)2… Cc6");
    igual("arranca en la posición inicial", await texto(page, "#visor-estado"), "Posición de arranque");
    for (let i = 0; i < 3; i++) await page.click("#btn-siguiente");
    igual("tres adelante: 2. Cf3", await texto(page, "#visor-estado"), "Jugada 2. Cf3");
    const comentario = await texto(page, "#visor-comentario");
    igual("sale el comentario, con el signo dicho en palabras",
      comentario, `📝 Tu profe comentó 2. Cf3! (buena jugada): ${MALICIOSO}`);
    igual("y el HTML del comentario no crea ningún nodo", await page.evaluate(() => [document.querySelectorAll("#visor-comentario img").length, window.__xss || 0]), [0, 0]);
    await page.click('#visor-jugadas [data-camino="e4 e5 Bc4 Nf6"]');
    igual("una jugada dentro de la variante dice que es variante", await texto(page, "#visor-estado"), "Jugada 2… Cf6 (variante)");
    igual("y el tablero la muestra", await page.evaluate(() => !!document.querySelector('#board [data-square="c4"] span') && !!document.querySelector('#board [data-square="f6"] span')), "true");
    await page.click("#btn-anterior");
    igual("atrás vuelve a la jugada de la variante", await texto(page, "#visor-estado"), "Jugada 2. Ac4 (variante)");
    igual("con su comentario", await texto(page, "#visor-comentario"), "📝 Tu profe comentó 2. Ac4: El alfil apunta a f7.");
    await page.keyboard.press("End");
    igual("Fin (tecla) va al final de la línea que se mira", await texto(page, "#visor-estado"), "Jugada 2… Cf6 (variante)");
    await page.click("#btn-inicio"); await page.click("#btn-final");
    igual("⏭ desde el arranque va al final de la principal", await texto(page, "#visor-estado"), "Jugada 2… Cc6");
    await page.keyboard.press("ArrowLeft");
    igual("← retrocede", await texto(page, "#visor-estado"), "Jugada 2. Cf3");

    console.log("\n=== El visor, con lector de pantalla ===");
    /* Era role="img" con 64 <div> sin nombre: la partida no existía para el
       lector. Ahora es como el tablero de Estudio: una parada de Tab, cada
       casilla dice qué hay, y un recuadro recorre la partida escribiendo. */
    igual("el tablero ya no es una imagen (sus casillas llegan al lector)", await page.evaluate(() => document.getElementById("board").getAttribute("role") !== "img"), "true");
    igual("una sola parada de Tab en todo el tablero", await page.evaluate(() =>
      [...document.querySelectorAll("#board [data-square]")].filter((c) => c.tabIndex === 0).length), 1);
    igual("cada casilla dice qué hay", await page.evaluate(() =>
      [...document.querySelectorAll("#board [data-square]")].filter((c) => /^[a-z]+ [1-8], /.test(c.getAttribute("aria-label") || "")).length), 64);
    await page.evaluate(() => { document.documentElement.classList.add("adaptive-mode"); document.dispatchEvent(new CustomEvent("adaptivemode:change", { detail: { activo: true } })); });
    await page.click("#btn-inicio");
    igual("en Modo Adaptado se ve el recuadro", await page.evaluate(() => { const i = document.querySelector("#visor-cmd .cc-input"); return !!i && i.checkVisibility(); }), "true");
    await page.fill("#visor-cmd .cc-input", "siguiente"); await page.press("#visor-cmd .cc-input", "Enter");
    // En Modo Adaptado la jugada va en el formato de ciegos («eva 4»), no en letras sueltas.
    igual("«siguiente» avanza", await texto(page, "#visor-estado"), "Jugada 1. eva 4");
    await page.waitForTimeout(150);
    igual("y la jugada se dice en palabras, no «e4» deletreado", await texto(page, "#visor-anuncio"), "Jugada 1: el peón blanco va de eva 2 a eva 4.");
    /* La partida se anuncia con su número («Jugada 1 de las negras»), así que
       «jugada 2» es la jugada 2 de las BLANCAS, no la segunda media jugada
       (que es 1… e5): contando medias jugadas, llevaba a otra que la pedida. */
    await page.fill("#visor-cmd .cc-input", "jugada 1 negras"); await page.press("#visor-cmd .cc-input", "Enter");
    igual("«jugada 1 negras» va a la de las negras", await texto(page, "#visor-estado"), "Jugada 1… eva 5");
    await page.fill("#visor-cmd .cc-input", "jugada 2 de las negras"); await page.press("#visor-cmd .cc-input", "Enter");
    igual("«jugada 2 de las negras» también", await texto(page, "#visor-estado"), "Jugada 2… caballo cesar 6");
    await page.fill("#visor-cmd .cc-input", "jugada 2"); await page.press("#visor-cmd .cc-input", "Enter");
    igual("«jugada 2» es la jugada 2 de las blancas", await texto(page, "#visor-estado"), "Jugada 2. caballo felix 3");
    await page.fill("#visor-cmd .cc-input", "caballos"); await page.press("#visor-cmd .cc-input", "Enter");
    igual("«caballos» se contesta sobre la posición que se ve", /caballos blancos en bella 1 y felix 3/.test(await texto(page, "#visor-cmd .cc-msg")), "true");
    await page.focus('#board [data-square="e4"]');
    await page.keyboard.press("ArrowRight");
    igual("con el foco en el tablero, → mueve de casilla y no cambia de jugada",
      [await texto(page, "#visor-estado"), await page.evaluate(() => document.activeElement.dataset.square)], ["Jugada 2. caballo felix 3", "f4"]);
    // Con la cuenta ciega, abrir una clase deja el foco en el recuadro (del
    // título había veinte paradas de Tab hasta él) y dice qué clase se abrió.
    await page.evaluate(() => document.documentElement.classList.add("modo-ciego"));
    await page.click('#lista-clases [data-id="p1"]');
    igual("con la cuenta ciega, al abrir una clase el foco va al recuadro",
      await page.evaluate(() => !!document.activeElement && document.activeElement.matches("#visor-cmd .cc-input")), "true");
    igual("y el recuadro dice qué clase se abrió",
      /^La defensa de los dos caballos/.test(await texto(page, "#visor-cmd .cc-msg")), "true");
    await page.evaluate(() => document.documentElement.classList.remove("modo-ciego"));
    await page.click('#lista-clases [data-id="p1"]');
    igual("sin la cuenta ciega, sigue yendo al título", await page.evaluate(() => document.activeElement && document.activeElement.id), "visor-titulo");
    await page.evaluate(() => { document.documentElement.classList.remove("adaptive-mode"); document.dispatchEvent(new CustomEvent("adaptivemode:change", { detail: { activo: false } })); });

    igual("una clase sin preguntas no muestra la sección", await page.evaluate(() => document.getElementById("visor-preguntas").checkVisibility()), "false");

    console.log("\n=== Las preguntas de la clase ===");
    await page.click('#lista-clases [data-id="p4"]');
    await page.waitForFunction(() => document.querySelectorAll("#visor-preguntas-lista li").length === 2, null, { timeout: 5000 });
    igual("se ven, las de ESA clase", await page.evaluate(() => [document.getElementById("visor-preguntas").checkVisibility(),
      [...document.querySelectorAll("#visor-preguntas-lista li")].map((li) => li.dataset.pregunta)]), [true, ["q1", "q2"]]);
    igual("la primera dice dónde está en la partida", await texto(page, '#visor-preguntas-lista [data-pregunta="q1"] button'), "Ir a la posición (después de 1… e5)");
    igual("y lo que contestó en clase", /Tu respuesta en clase: d4 · ❌ a revisar/.test(await texto(page, '#visor-preguntas-lista [data-pregunta="q1"]')), "true");
    igual("la respuesta del motor, escondida", await page.evaluate(() =>
      [...document.querySelectorAll('#visor-preguntas-lista [data-pregunta="q1"] p')].some((p) => /El motor/.test(p.textContent) && p.checkVisibility())), "false");
    await page.getByRole("button", { name: "Ver la respuesta del motor" }).click();
    igual("se ve cuando la pide", await page.evaluate(() =>
      [...document.querySelectorAll('#visor-preguntas-lista [data-pregunta="q1"] p')].filter((p) => p.checkVisibility()).map((p) => p.textContent).pop()), "El motor juega: Nf3 Nc6");
    igual("la segunda no tiene respuesta del motor guardada", await page.evaluate(() =>
      document.querySelectorAll('#visor-preguntas-lista [data-pregunta="q2"] button').length), 1);
    igual("en el arranque no hay aviso", await page.evaluate(() => document.getElementById("visor-pregunta").checkVisibility()), "false");
    await page.click("#btn-siguiente"); await page.click("#btn-siguiente");
    igual("al llegar a esa posición, avisa antes de seguir", await texto(page, "#visor-pregunta"),
      "❓ Acá tu profe preguntó: «¿Qué jugarías?». Piénsalo antes de seguir; la respuesta está abajo, en «Las preguntas de la clase».");
    await page.click("#btn-siguiente");
    igual("y al pasar, se va", await page.evaluate(() => document.getElementById("visor-pregunta").checkVisibility()), "false");
    await page.click('#visor-preguntas-lista [data-pregunta="q2"] button');
    igual("una posición aparte se muestra en el tablero", await texto(page, "#visor-estado"), "Posición de la pregunta 2");
    igual("con su aviso", /Mate en uno/.test(await texto(page, "#visor-pregunta")), "true");
    igual("y el tablero es el de esa posición", await page.evaluate(() => !!document.querySelector('#board [data-square="d1"] span') && !document.querySelector('#board [data-square="e1"] span')), "true");

    console.log("\n=== Una partida de antes, sin `datos` ===");
    await page.click('#lista-clases [data-id="p2"]');
    igual("dice que solo trae las jugadas", await page.evaluate(() => document.getElementById("visor-sin-datos").checkVisibility()), "true");
    igual("y las lee del PGN", await page.evaluate(() => document.getElementById("visor-jugadas").textContent.replace(/\s+/g, " ").trim()), "1. d41… d5");
    igual("sin nombre de clase, el de la partida", await texto(page, "#visor-titulo"), "Una partida de antes");
    igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();

    console.log("\n=== Con la cuenta ciega, el foco al abrir ===");
    {
      /* Al abrir con la cuenta ciega el foco quedaba en el <body>: el lector
         no decía nada. Va al título principal (tabindex=-1). */
      const r = await abrir(browser, "/repasar-clases.html", Object.assign({ saved_games: PARTIDAS, vision_personas: [{ persona_id: "u-ana", vision: "ciego" }] }, PREGUNTAS));
      await r.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      await r.page.waitForFunction(() => document.activeElement && document.activeElement.tagName === "H1", null, { timeout: 5000 }).catch(() => {});
      igual("con la cuenta ciega, el foco va al título «Repasar mis clases» (tabindex=-1)", await r.page.evaluate(() => {
        const a = document.activeElement;
        return [document.documentElement.classList.contains("modo-ciego"), a.tagName, a.textContent.replace(/\s+/g, " ").trim(), a.getAttribute("tabindex")];
      }), [true, "H1", "Repasar mis clases 🎞️", "-1"]);
      await r.ctx.close();
    }

    console.log("\n=== Sin clases ===");
    {
      const r = await abrir(browser, "/repasar-clases.html", { saved_games: [] });
      await r.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      await r.page.waitForFunction(() => !document.getElementById("lista-vacia").hidden, null, { timeout: 10000 });
      igual("dice que todavía no hay y cuándo aparecen", (await texto(r.page, "#lista-vacia")).startsWith("Todavía no hay clases para repasar"), "true");
      await r.ctx.close();
    }

  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
