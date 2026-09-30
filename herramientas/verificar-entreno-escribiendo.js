/* Entrenamiento hecho todo escribiendo, como lo hace una alumna ciega (cuenta
   marcada «ciego»: `modo-ciego` y Modo Adaptado). Lo que dejó pendiente la
   segunda recorrida con esa cuenta, y que no da ningún error: la página se ve
   bien y a quien no ve le dice otra cosa.

   - Mates: los tres mensajes al contestar son distintos. «No entendí» si lo
     escrito no es una jugada («hola»), «no es una jugada legal» SOLO si no se
     puede hacer, y «Respuesta incorrecta: … no es la jugada que buscamos» si
     es legal pero no es la respuesta (antes las tres decían «no es legal»).
   - Mates: la categoría se cambia escribiendo («mate en 2», «categorías») y el
     aviso dice cuál se eligió.
   - La pista por etapas (js/ejercicio-tablero.js): la etapa «solución» DICE la
     jugada en palabras antes de jugarla («La solución era: …»); antes se
     jugaba sola y se oía «¡Jaque mate!» sin saber cuál había sido.
   - Temas: dice la jugada del rival en palabras, y la posición entera se dice
     al empezar el ejercicio y NO se relee en cada jugada (el recuadro va con
     `posicionViva: false`).
   - Temas: «volver» deja el foco en el buscador (caía al <body>), y buscar
     dice cuántos temas quedaron.
   - Desafíos: las explicaciones del banco traen SAN inglés («Be6»); en Modo
     Adaptado se dicen en palabras («alfil eva 6»).
   - Aprender: el «¿Jaque mate o ahogado?» se contesta escribiendo, y «rey f1»
     y «e7 e8 dama» (corona sin abrir el diálogo) se entienden.
   - Precisión posicional: «siguiente» sin haber contestado avisa.

   Uso:  npm install; node herramientas/verificar-todo.js entreno-escribiendo
         (levanta el sitio en el 8777 si no está)                              */
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
function cierto(nombre, v, detalle) {
  if (v) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      salió: " + detalle : "")); fallos += 1; }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* La cuenta ciega: la marca viene de la base (vision_personas; sin la fila,
   js/vision-cuenta.js quitaría el modo al sincronizar) y ya está guardada en
   el aparato, como en una visita cualquiera. */
const CIEGA = { vision_personas: [{ persona_id: "u-ana", vision: "ciego" }] };
const LOCAL = {
  ai_vision_v1: JSON.stringify({ persona: "u-ana", vision: "ciego" }),
  ai_vision_aplicada_v1: "u-ana:ciego",
  oscarBlindMode_v1: "1",
};
async function abrir(browser, ruta, esperarA) {
  const r = await doble.abrir(browser, ruta, Object.assign({}, CIEGA), LOCAL);
  await r.page.waitForSelector(esperarA || "#app:not(.hidden)", { timeout: 20000 });
  await r.page.waitForFunction(() => document.documentElement.classList.contains("modo-ciego"), null, { timeout: 8000 }).catch(() => {});
  return r;
}
/* Escribe en el recuadro visible (como la alumna: Intro) y devuelve lo que
   quedó en su aviso. */
async function escribir(page, texto, ms) {
  const sel = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll(".cc-input, #answer-input, #cmd-input")).find((x) => x.checkVisibility() && !x.disabled);
    if (!c) return null;
    c.focus();
    return c.id ? "#" + c.id : ".cc-input";
  });
  if (!sel) return "(no hay recuadro visible)";
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.type(texto);
  await page.keyboard.press("Enter");
  await esperar(ms || 350);
  return page.evaluate(() => {
    const m = Array.from(document.querySelectorAll(".cc-msg")).find((x) => x.checkVisibility());
    return m ? m.textContent : "";
  });
}
/* Todo lo que pasa por una región viva desde ahora (lo que un lector leería). */
async function escuchar(page) {
  await page.evaluate(() => {
    window.__oido = [];
    if (window.__oyendo) return;
    window.__oyendo = true;
    new MutationObserver((ms) => ms.forEach((m) => {
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      const region = el && el.closest && el.closest("[role=status],[role=alert],[aria-live]:not([aria-live=off])");
      if (region && region.textContent.trim()) window.__oido.push(region.textContent.replace(/\s+/g, " ").trim());
    })).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
const oido = (page) => page.evaluate(() => window.__oido.slice());
const foco = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return "body";
  if (a.classList.contains("cc-input")) return ".cc-input";
  return a.id ? "#" + a.id : "." + String(a.className).split(" ")[0];
});
function sinErrores(errores, pagina) {
  igual(`${pagina}: sin errores en la página`, errores.length ? errores.join(" | ") : "ninguno", "ninguno");
}

async function mates(browser) {
  console.log("\n=== Mates: los tres mensajes, la categoría escribiendo y la solución dicha ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/mates.html");
  await page.waitForFunction(() => PUZZLES.mate1.length > 0 && document.querySelector(".cc-input"), null, { timeout: 20000 });
  // mate1-0001: 3q1rk1/5pbp/5Qp1/8/8/2B5/5PPP/6K1 w — la solución es Qxg7#.
  await page.evaluate(() => { currentCategory = "mate1"; currentIndex = PUZZLES.mate1.findIndex((p) => p.id === "mate1-0001"); loadPuzzle(); });

  const noEntendi = await escribir(page, "hola");
  cierto("lo que no es una jugada («hola») dice que no se entendió, no que es ilegal",
    /^No entendí «hola»/.test(noEntendi) && !/no es una jugada legal/.test(noEntendi), noEntendi);
  const ilegal = await escribir(page, "Ta8");
  igual("una jugada que no se puede hacer («Ta8») sí dice «no es una jugada legal»",
    ilegal, "«Ta8» no es una jugada legal en esta posición.");
  // Legal, no es la de la solución y no da mate: Qf6-f7+ (Df7+).
  const mal = await escribir(page, "Df7+");
  const esperado = await page.evaluate(() => "Respuesta incorrecta: " + BlindNotation.sanSpoken("Qxf7+") + " no es la jugada que buscamos.");
  cierto("una jugada legal que no es la respuesta empieza con «Respuesta incorrecta: <la jugada en palabras> no es la jugada que buscamos.»",
    mal.startsWith(esperado) && !/no es una jugada legal/.test(mal), mal);
  cierto("y conserva la explicación (no lleva al mate en la cantidad pedida)", /No lleva al mate/.test(mal), mal);
  igual("después de «Respuesta incorrecta» la posición sigue como estaba",
    await page.evaluate(() => game.fen()), "3q1rk1/5pbp/5Qp1/8/8/2B5/5PPP/6K1 w - - 0 1");

  // La categoría, escribiendo.
  const lista = await escribir(page, "categorías");
  cierto("«categorías» dice las tres, con lo resuelto de cada una",
    /Mate en 1: \d+ de \d+/.test(lista) && /Mate en 2: \d+ de \d+/.test(lista) && /Mate en 3: \d+ de \d+/.test(lista), lista);
  await escuchar(page);
  await escribir(page, "mate en 2", 500);
  igual("«mate en 2» cambia de categoría", await page.evaluate(() => currentCategory), "mate2");
  const dicho = (await oido(page)).join(" ‖ ");
  cierto("y el aviso dice la categoría elegida", /Categoría elegida: Mate en 2\./.test(dicho), dicho);
  cierto("con el ejercicio nuevo detrás (mate en 2 jugadas)", /mate en 2 jugadas/.test(dicho), dicho);
  igual("y el foco sigue en el recuadro", await foco(page), ".cc-input");
  await escribir(page, "mate en tres", 400);
  igual("«mate en tres» también", await page.evaluate(() => currentCategory), "mate3");

  // La solución por etapas se dice: pista (la pieza) y después «Ver solución».
  await page.evaluate(() => { currentCategory = "mate1"; currentIndex = PUZZLES.mate1.findIndex((p) => p.id === "mate1-0001"); loadPuzzle(); });
  const p1 = await escribir(page, "pista");
  cierto("la primera pista (la pieza) se aprieta escribiendo «pista»", /Listo: Pista/.test(p1) || /Pista:/.test(await page.evaluate(() => document.getElementById("round-status").textContent)), p1);
  await escribir(page, "solución", 500);
  const tras = await page.evaluate(() => document.getElementById("round-status").textContent);
  const dama = await page.evaluate(() => BlindNotation.sanSpoken("Qxg7#"));
  cierto("la etapa «solución» dice la jugada en palabras antes de jugarla («La solución era: " + dama + ".»)",
    tras.startsWith("La solución era: " + dama + ".") && /¡Jaque mate!/.test(tras), tras);
  sinErrores(errores, "Mates");
  await ctx.close();
}

async function temas(browser) {
  console.log("\n=== Temas: la jugada del rival dicha, la posición una sola vez, volver y buscar ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/temas.html");
  await page.waitForFunction("typeof DATA !== 'undefined' && DATA && DATA.puzzles && document.querySelector('button[data-theme]')", null, { timeout: 20000 });
  await esperar(400);
  igual("con la cuenta ciega, el foco empieza en el buscador de temas", await foco(page), "#search");
  // Buscar dice cuántos quedaron.
  await page.fill("#search", "");
  await page.type("#search", "clavada");
  await page.waitForFunction(() => /coincid/.test(document.getElementById("search-anuncio").textContent), null, { timeout: 3000 }).catch(() => {});
  const anuncio = await page.evaluate(() => document.getElementById("search-anuncio").textContent);
  const cuantos = await page.evaluate(() => new Set(Array.from(document.querySelectorAll("#groups .tbtn")).map((b) => b.dataset.theme)).size);
  cierto(`buscar «clavada» dice cuántos temas quedaron (${cuantos})`, cuantos > 0 && anuncio.startsWith(cuantos + " "), anuncio);

  // opening, ejercicio 0 (3U3Ox): Qh5+ g6 Nxg6 — una jugada, la respuesta del rival, otra.
  await page.evaluate(() => { openTheme("opening"); currentIndex = idsOf("opening").indexOf("3U3Ox"); loadPuzzle(); });
  await page.waitForSelector(".cc-input", { state: "visible" });
  igual("el recuadro va con la posición muda (no es región viva)",
    await page.evaluate(() => document.querySelector("#q-comandos .cc-pos").hasAttribute("aria-live")), false);
  cierto("al empezar, el aviso del ejercicio dice la posición entera",
    await page.evaluate(() => /Blancas:.*Negras:/.test(document.getElementById("round-status").textContent)));
  await escuchar(page);
  await escribir(page, "Dh5+", 1100);
  const oidos = await oido(page);
  const g6 = await page.evaluate(() => BlindNotation.sanSpoken("g6"));
  cierto("dice la jugada del rival en palabras («El rival juega " + g6 + ".»)",
    oidos.some((t) => t.includes("El rival juega " + g6 + ".")), oidos.join(" ‖ "));
  cierto("y no relee la posición entera después de la jugada",
    !oidos.some((t) => /Blancas:.*Negras:/.test(t)), oidos.join(" ‖ "));
  await escuchar(page);
  await escribir(page, "pista", 500);
  cierto("tampoco después de una pista", !(await oido(page)).some((t) => /Blancas:.*Negras:/.test(t)), (await oido(page)).join(" ‖ "));

  // «volver» escrito: vuelve a la lista con el foco en el buscador.
  await escribir(page, "volver", 700);
  igual("«volver» deja el foco en el buscador, no en el <body>", [await page.evaluate(() => document.getElementById("themes-view").checkVisibility()), await foco(page)], [true, "#search"]);
  sinErrores(errores, "Temas");
  await ctx.close();
}

async function desafios(browser) {
  console.log("\n=== Desafíos: la explicación en palabras ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/desafios.html");
  await page.waitForFunction("typeof SETS !== 'undefined' && SETS.length > 0 && document.querySelector('.set-card')", null, { timeout: 20000 });
  await esperar(300);
  igual("con la cuenta ciega, el foco empieza en el título de la lista", await foco(page), "#lista-titulo");
  // El primer desafío: «Primero Be6 y en la siguiente jugada el alfil va a c8…»
  const r = await page.evaluate(() => {
    const set = SETS.find((s) => s.rounds.some((x) => /\bBe6\b/.test(x.explain || "")));
    const i = set.rounds.findIndex((x) => /\bBe6\b/.test(x.explain || ""));
    openSet(set); currentRoundIndex = i; loadRound();
    return { m: set.rounds[i].moves[0], explain: set.rounds[i].explain };
  });
  await escribir(page, r.m.slice(0, 2) + " " + r.m.slice(2, 4), 400);
  const st = await page.evaluate(() => document.getElementById("round-status").textContent);
  cierto("la explicación sale sin SAN inglés («Be6» → «alfil eva 6»)", /alfil eva 6/.test(st) && !/\bBe6\b/.test(st), st);
  // Y una equivocada, con el mensaje nuevo.
  sinErrores(errores, "Desafíos");
  await ctx.close();
}

async function aprender(browser) {
  console.log("\n=== Aprender: el quiz, «rey f1» y «e7 e8 dama» escribiendo ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/aprender.html");
  await page.waitForFunction("typeof LESSONS !== 'undefined' && LESSONS.length > 0", null, { timeout: 20000 });
  await page.evaluate(() => openLesson(LESSONS.find((l) => l.type === "quiz")));
  await page.waitForSelector(".cc-input", { state: "visible" });
  const respuestas = await page.evaluate(() => currentLesson.rounds.map((r) => r.answer));
  const dichas = ["jaque mate", "ahogado", "tablas", "A", "B", "mate", "2", "1"];
  const escritas = [];
  for (let i = 0; i < respuestas.length; i++) {
    // Se escribe la buena con una forma distinta cada vez.
    const formas = respuestas[i] === "mate" ? ["jaque mate", "A", "mate", "1"] : ["ahogado", "tablas", "B", "2"];
    const f = formas[i % formas.length];
    escritas.push(f);
    await escribir(page, f, 50);
    await page.waitForFunction(() => !lessonLocked || document.getElementById("next-btn").style.display !== "none", null, { timeout: 4000 }).catch(() => {});
  }
  igual(`el «¿Jaque mate o ahogado?» se contesta escribiendo (${escritas.join(", ")})`,
    await page.evaluate(() => isSolved(currentLesson.id)), true);
  void dichas;

  // «rey f1»: sal del jaque con el rey.
  await page.evaluate(() => openLesson(LESSONS.find((l) => l.id === "reg_jaque") || LESSONS.find((l) => /jaque/i.test(l.title) && l.type === "move")));
  const fen = await page.evaluate(() => game.fen());
  await escribir(page, "rey f1", 300);
  cierto("«rey f1» se entiende como la jugada del rey (" + fen + ")",
    await page.evaluate(() => game.history().includes("Kf1")));

  // «e7 e8 dama»: corona sin abrir el diálogo.
  await page.evaluate(() => {
    currentLesson = { id: "prueba-corona", cat: "reglas", type: "move", title: "Corona", text: "", fen: "8/4P3/8/8/8/8/k7/4K3 w - - 0 1", solution: { from: "e7", to: "e8" } };
    resetLesson();
  });
  await escribir(page, "e7 e8 dama", 300);
  igual("«e7 e8 dama» corona en dama sin abrir el diálogo",
    await page.evaluate(() => [game.get("e8") && game.get("e8").type, !!document.querySelector(".coronacion-dialogo[open], dialog[open]")]), ["q", false]);
  sinErrores(errores, "Aprender");
  await ctx.close();
}

async function precision(browser) {
  console.log("\n=== Precisión posicional: «siguiente» sin contestar avisa ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/precision-posicional.html", "#start-btn");
  await page.click("#start-btn");
  await page.waitForSelector(".cc-input", { state: "visible" });
  const antes = await page.evaluate(() => document.getElementById("q-counter").textContent);
  const aviso = await escribir(page, "siguiente", 500);
  cierto("«siguiente» sin contestar avisa y no pasa", /Todavía no contestaste esta/.test(aviso) &&
    (await page.evaluate(() => document.getElementById("q-counter").textContent)) === antes, aviso);
  await escribir(page, "saltar", 300);
  cierto("«saltar» sí pasa a la siguiente", (await page.evaluate(() => document.getElementById("q-counter").textContent)) !== antes);
  sinErrores(errores, "Precisión posicional");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await mates(browser);
    await temas(browser);
    await desafios(browser);
    await aprender(browser);
    await precision(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
