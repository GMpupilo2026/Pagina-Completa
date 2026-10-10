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
/* Coordenadas y Memoria ya no se le ofrecen a la cuenta ciega (ver «Lo que no
   se puede hacer sin ver, no se ofrece»), pero siguen en Modo Adaptado para
   quien lo enciende sin la marca (baja visión, quien navega con teclado):
   ahí se miden. */
async function abrirAdaptado(browser, ruta, esperarA) {
  const r = await doble.abrir(browser, ruta, {}, { oscarBlindMode_v1: "1" });
  await r.page.waitForSelector(esperarA || "#app:not(.hidden)", { timeout: 20000 });
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

/* ============ La tercera recorrida con la cuenta ciega ============ */
const texto = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, " ").trim() : ""; }, sel);
// Escribe en un recuadro dado (el suyo propio, no el .cc-input común) con Intro.
async function escribirEn(page, sel, t, ms) {
  await page.focus(sel);
  await page.fill(sel, t);
  await page.press(sel, "Enter");
  await esperar(ms || 350);
}

async function practicarYDesafios(browser) {
  console.log("\n=== Practicar y Desafíos: «solución» y «saltar» escribiendo ===");
  let { page, ctx, errores } = await abrir(browser, "/entreno/practicas.html");
  await page.waitForFunction("typeof SETS !== 'undefined' && document.querySelector('.set-card')", null, { timeout: 20000 });
  await page.evaluate(() => openSet(SETS.find((s) => s.id === "pasillo")));
  await page.waitForSelector(".cc-input", { state: "visible" });
  const acciones = await escribir(page, "acciones", 400);
  cierto("«acciones» ofrece «Solución» y «Saltar»", /Solución/.test(acciones) && /Saltar/.test(acciones), acciones);
  cierto("la ayuda del recuadro dice «solución» y «saltar»",
    /«solución»/.test(await texto(page, "#q-comandos .cc-ayuda")) && /«saltar»/.test(await texto(page, "#q-comandos .cc-ayuda")), await texto(page, "#q-comandos .cc-ayuda"));
  await escuchar(page);
  await escribir(page, "saltar", 400);
  igual("«saltar» antes de resolverla pasa a la posición 2", await page.evaluate(() => currentRoundIndex), 1);
  let oidos = (await oido(page)).join(" ‖ ");
  cierto("y dice que la saltó y cuál es la nueva, sin «Listo: Saltar»",
    /Saltaste la posición: no cuenta como resuelta\. Posición 2 de 5/.test(oidos) && !/Listo: Saltar/.test(oidos), oidos);
  igual("el foco sigue en el recuadro", await foco(page), ".cc-input");
  // «solución»: la jugada en palabras, no cuenta, y espera «siguiente».
  const r = await page.evaluate(() => { const x = currentSet.rounds[currentRoundIndex]; const g = new Chess(x.fen); return BlindNotation.sanSpoken(g.move({ from: x.from, to: x.to }).san); });
  await escuchar(page);
  await escribir(page, "solución", 1400);
  const st = await texto(page, "#round-status");
  cierto("«solución» dice la jugada en palabras («La solución era: " + r + ".») y que no cuenta",
    st.startsWith("La solución era: " + r + ".") && /No cuenta como resuelta\. Escribe «siguiente»/.test(st), st);
  igual("y no pasa sola (espera «siguiente»)", await page.evaluate(() => currentRoundIndex), 1);
  await escribir(page, "siguiente", 400);
  igual("«siguiente» pasa a la posición 3", await page.evaluate(() => currentRoundIndex), 2);
  igual("sin racha: la posición vista con la solución no suma", await page.evaluate(() => getStreak()), 0);
  sinErrores(errores, "Practicar");
  await ctx.close();

  ({ page, ctx, errores } = await abrir(browser, "/entreno/desafios.html"));
  await page.waitForFunction("typeof SETS !== 'undefined' && SETS.length > 0 && document.querySelector('.set-card')", null, { timeout: 20000 });
  await page.evaluate(() => openSet(SETS[0]));
  await page.waitForSelector(".cc-input", { state: "visible" });
  await escuchar(page);
  await escribir(page, "siguiente", 400);
  igual("Desafíos: «siguiente» antes de resolverlo pasa al 2", await page.evaluate(() => currentRoundIndex), 1);
  oidos = (await oido(page)).join(" ‖ ");
  cierto("y dice que lo saltó y cuál es el nuevo", /Saltaste el desafío: no cuenta como resuelto\. Desafío 2 de/.test(oidos) && !/Listo:/.test(oidos), oidos);
  await escribir(page, "solución", 600);
  const sd = await texto(page, "#round-status");
  cierto("«solución» dice la jugada y que no cuenta", /^Solución \(no cuenta como resuelto\):/.test(sd), sd);
  sinErrores(errores, "Desafíos");
  await ctx.close();
}

async function visualizacion(browser) {
  console.log("\n=== Visualización: «siguiente» dice que saltó y cuál es el nuevo; «solución» ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/visualizacion.html");
  await page.waitForFunction("typeof DATA !== 'undefined' && DATA && Object.keys(POOLS).length", null, { timeout: 20000 });
  await page.evaluate(() => openLevel(Object.keys(POOLS).find((k) => POOLS[k].length > 2)));
  await page.waitForSelector("#answer-input", { state: "visible" });
  await esperar(300);
  const antes = await page.evaluate(() => currentIndex);
  await escuchar(page);
  await escribirEn(page, "#answer-input", "siguiente", 500);
  const oidos = (await oido(page)).join(" ‖ ");
  igual("«siguiente» pasa al ejercicio siguiente", await page.evaluate(() => currentIndex), antes + 1);
  cierto("y dice «Saltaste el ejercicio. Ejercicio N de M…», no «Listo: Saltar»",
    new RegExp("Saltaste el ejercicio\\. Ejercicio " + (antes + 2) + " de \\d+\\. Juegan").test(oidos) && !/Listo: Saltar/.test(oidos), oidos);
  const linea = await page.evaluate(() => currentPuzzle().solution.map((s) => BlindNotation.sanSpoken(s)));
  await escribirEn(page, "#answer-input", "solución", 500);
  const st = await texto(page, "#round-status");
  cierto("«solución» dice la línea en palabras y que no cuenta («La solución era: " + linea[0] + "…»)",
    st.startsWith("La solución era: " + linea[0]) && /No cuenta como resuelto/.test(st), st);
  igual("y el foco sigue en el recuadro", await foco(page), "#answer-input");
  sinErrores(errores, "Visualización");
  await ctx.close();
}

async function aprenderBloqueadas(browser) {
  console.log("\n=== Aprender: lecciones cerradas en el Tab, «pista» y «solución» en las de casillas ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/aprender.html");
  await page.waitForFunction("typeof LESSONS !== 'undefined' && document.querySelectorAll('#lesson-list .lesson-item').length > 1", null, { timeout: 20000 });
  const cerradas = await page.evaluate(() => Array.from(document.querySelectorAll("#lesson-list .lesson-item[aria-disabled=true]")).map((b) => ({ disabled: b.disabled, tab: b.tabIndex })));
  cierto("las lecciones cerradas van con aria-disabled y siguen en el Tab (no `disabled`)",
    cerradas.length > 0 && cerradas.every((c) => !c.disabled && c.tab >= 0), JSON.stringify(cerradas));
  await page.evaluate(() => document.querySelector("#lesson-list .lesson-item[aria-disabled=true]").click());
  await esperar(250);
  const aviso = await texto(page, "#list-status");
  cierto("activar una cerrada dice por qué («… está bloqueada: se abre cuando termines «…»»)", /está bloqueada: se abre cuando termines «/.test(aviso), aviso);
  igual("y no la abre", await page.evaluate(() => document.getElementById("lesson-view").style.display), "none");
  await page.evaluate(() => openLesson(LESSONS.find((l) => l.type === "squares")));
  await page.waitForSelector(".cc-input", { state: "visible" });
  await escribir(page, "pista", 300);
  const pista = await texto(page, "#lesson-status");
  cierto("en una lección de casillas, «pista» da una pista (no «Esa no es una casilla»)", /^Pista: te falta/.test(pista), pista);
  await escribir(page, "solución", 300);
  const sol = await texto(page, "#lesson-status");
  const cas = await page.evaluate(() => currentLesson.targets.map((s) => BlindNotation.squareSpoken(s)));
  cierto("y «solución» dice las casillas que faltan", /^La solución: /.test(sol) && cas.every((c) => sol.includes(c)), sol);
  await page.evaluate(() => openLesson(LESSONS.find((l) => l.type === "move" && l.solution)));
  await escribir(page, "solución", 300);
  cierto("en una de jugada, «solución» dice la jugada", /^La solución es: /.test(await texto(page, "#lesson-status")), await texto(page, "#lesson-status"));
  sinErrores(errores, "Aprender");
  await ctx.close();
}

async function cuatroPorCuatro(browser) {
  console.log("\n=== 4×4: «cómo está la posición», sin capturas y «volver» ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/4x4.html", "#solo-panel:not([hidden])");
  await page.waitForSelector("#cmd-input", { state: "visible" });
  await page.evaluate(() => { window.__pos = 0; const o = window.announcePosition; window.announcePosition = function () { window.__pos++; return o.apply(this, arguments); }; });
  await escribirEn(page, "#cmd-input", "cómo está la posición", 300);
  igual("«cómo está la posición» dice la posición, como «posición»", await page.evaluate(() => window.__pos), 1);
  // Dos piezas que no se pueden capturar: un caballo en a1 y un alfil en d1.
  await page.evaluate(() => { boardState = { "3,0": "N", "3,3": "B" }; checkWin(); });
  await esperar(200);
  const sin = await texto(page, "#board-announcer");
  cierto("sin capturas dice «Respuesta incorrecta: … no quedan capturas. Escribe «otra vez»…»",
    /^Respuesta incorrecta: .*no quedan capturas\. Escribe «otra vez» para empezar de nuevo\.$/.test(sin), sin);
  cierto("sin verbos de mirar la pantalla (pulsa, toca, haz clic)", !/pulsa|toca|haz clic/i.test(sin + " " + await texto(page, "#board-status")), sin);
  await page.fill("#cmd-input", "volver");
  await page.press("#cmd-input", "Enter");
  await esperar(150);
  const volver = await texto(page, "#cmd-status");
  cierto("«volver» dice adónde va («Volviendo a …»)", /^Volviendo a (Entrenar, en tu panel|Entrenamiento|tu panel|la página anterior)…$/.test(volver), volver);
  sinErrores(errores, "4×4");
  await ctx.close();
}

async function precisionSinListo(browser) {
  console.log("\n=== Precisión posicional: «siguiente» sin contestar no se oye como «Listo: Siguiente»; «volver» ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/precision-posicional.html", "#start-btn");
  await page.click("#start-btn");
  await page.waitForSelector(".cc-input", { state: "visible" });
  await escribir(page, "a", 500);
  const n2 = await texto(page, "#q-counter");
  await escuchar(page);
  await escribir(page, "siguiente", 500);
  const oidos = (await oido(page)).join(" ‖ ");
  cierto("«siguiente» sin contestar: solo «Todavía no contestaste…», sin «Listo: Siguiente»",
    /Todavía no contestaste esta/.test(oidos) && !/Listo/.test(oidos), oidos);
  igual("y no pasa", await texto(page, "#q-counter"), n2);
  await escribir(page, "volver", 400);
  igual("«volver» lleva a la anterior", await texto(page, "#q-counter"), "Posición 1 de " + n2.split(" de ")[1]);
  cierto("y lo dice", /^Volviste a la anterior\. Posición 1/.test(await texto(page, "#q-comandos .cc-msg")), await texto(page, "#q-comandos .cc-msg"));
  sinErrores(errores, "Precisión posicional");
  await ctx.close();
}

async function volverYMemoria(browser) {
  console.log("\n=== Coordenadas, Memoria y Mates: «volver»; Memoria dice qué faltó ===");
  let { page, ctx, errores } = await abrirAdaptado(browser, "/entreno/coordenadas.html");
  await page.click("#start-btn");
  await page.waitForSelector("#blind-input", { state: "visible" });
  await escribirEn(page, "#blind-input", "volver", 200);
  const c = await texto(page, "#blind-announcer");
  cierto("Coordenadas: «volver» dice adónde va (no «No entendí»)", /^Volviendo a /.test(c), c);
  await ctx.close();

  ({ page, ctx, errores } = await abrir(browser, "/entreno/mates.html"));
  await page.waitForFunction(() => PUZZLES.mate1.length > 0 && document.querySelector(".cc-input"), null, { timeout: 20000 });
  const m = await escribir(page, "volver", 150);
  cierto("Mates: «volver» dice adónde va", /^Volviendo a /.test(m), m);
  await ctx.close();

  ({ page, ctx, errores } = await abrirAdaptado(browser, "/entreno/memoria.html?piezas=4&segundos=3", "#vista-juego:not(.hidden)"));
  await page.waitForSelector(".cc-input", { state: "visible" });
  await escribir(page, "ya la tengo", 300);
  // Se pone una sola pieza, bien, más una que sobra: faltan las otras.
  const plan = await page.evaluate(() => {
    const it = MemoriaEntreno.item();
    const tab = TiposReglas.tablero(it.fen);
    const puestas = [];
    for (let i = 0; i < 64; i++) if (tab[i]) puestas.push({ s: TiposReglas.sq(i), c: tab[i].c, t: tab[i].t });
    const vacia = ["a1", "h1", "a8", "h8", "d4", "e5"].find((s) => !puestas.some((p) => p.s === s));
    return { primera: puestas[0], faltan: puestas.slice(1).map((p) => TableroAccesible.piezaDicha({ color: p.c, type: p.t }) + " en " + TableroAccesible.casillaHablada(p.s)), vacia,
      letra: { k: "R", q: "D", r: "T", b: "A", n: "C", p: "P" }[puestas[0].t] };
  });
  await escribir(page, (plan.primera.c === "w" ? "blancas: " : "negras: ") + plan.letra + plan.primera.s, 300);
  await escribir(page, (plan.primera.c === "w" ? "negras: " : "blancas: ") + "C" + plan.vacia, 300);
  await escribir(page, "comprobar", 500);
  const est = await texto(page, "#estado");
  cierto("Memoria: al comprobar dice cuáles faltaron, con la pieza y la casilla («Te faltaron: " + plan.faltan[0] + "…»)",
    /Te falt(ó|aron): /.test(est) && plan.faltan.every((f) => est.includes(f)), est);
  cierto("y cuál sobró", /Sobró: caballo (blanco|negro) en /.test(est), est);
  await escribir(page, "volver", 400);
  cierto("Memoria: «volver» lleva a los ajustes y lo dice",
    (await page.evaluate(() => !document.getElementById("vista-ajustes").classList.contains("hidden"))) && /^Volviste al inicio de Memoria/.test(await texto(page, "#aviso-ajustes")),
    await texto(page, "#aviso-ajustes"));
  sinErrores(errores, "Memoria");
  await ctx.close();
}

async function hubYDiagnostico(browser) {
  console.log("\n=== El hub con la cuenta ciega, y el diagnóstico con comillas latinas ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/index.html");
  await esperar(400);
  igual("en el hub, el foco empieza en el título (no en el <body>)", await foco(page), "#hub-titulo");
  cierto("Estudio está en el hub", await page.evaluate(() => !!document.querySelector('#app h3 a[href="estudio.html"]')));
  sinErrores(errores, "Hub");
  await ctx.close();
  const fs = require("fs");
  const diag = fs.readFileSync(require("path").join(__dirname, "..", "js", "entreno-diagnostico.js"), "utf8");
  cierto("el diagnóstico dice «No entendí «…»» con comillas latinas, no rectas", !/No entendí "/.test(diag) && /No entendí «/.test(diag));
}

async function habilidades(browser) {
  console.log("\n=== Habilidades: «pista» y «solución» en las de elegir, y el recuadro no cambia al terminar ===");
  const fs = require("fs");
  const DATOS = JSON.parse(fs.readFileSync(require("path").join(__dirname, "..", "entreno", "data", "tipos.json"), "utf8"));
  const casos = [["detective", 1], ["apertura", 1], ["intercambios", 1], ["peones", 1]];
  for (const [tipo, nivel] of casos) {
    const item = DATOS[tipo].find((x) => x.nivel === nivel);
    const { page, ctx, errores } = await abrir(browser, "/entreno/tipos.html#" + tipo + "/" + nivel + "/" + item.id, "#jugada-input");
    await page.waitForSelector("#jugada-input", { state: "visible" });
    await esperar(400);
    await escribirEn(page, "#jugada-input", "pista", 300);
    const p = await texto(page, "#estado");
    cierto(`${tipo}: «pista» da la pista o dice que no hay (no «No entendí»)`, /^(Pista: |En este ejercicio no hay pista; escribe «opciones»)/.test(p), p);
    await escribirEn(page, "#jugada-input", "solución", 300);
    const sl = await texto(page, "#estado");
    cierto(`${tipo}: «solución» dice la respuesta y que cuenta como no resuelto`, /^La solución: .*Cuenta como no resuelto/.test(sl), sl);
    igual(`${tipo}: y la opción buena queda marcada`, await page.evaluate(() => !!Array.from(document.querySelectorAll("#controles button, #controles input")).find((b) => b.disabled) &&
      (!!Array.from(document.querySelectorAll("#controles button")).find((b) => /^✓/.test(b.textContent)) || !!document.querySelector("#controles input[type=radio]:checked"))), true);
    igual(`${tipo}: el foco sigue en el recuadro del ejercicio`, await foco(page), "#jugada-input");
    sinErrores(errores, "Habilidades · " + tipo);
    await ctx.close();
  }
  // Rey y peón 3 (una sola jugada gana): al acertar, el recuadro no pasa a ser «Pregunta sobre la posición».
  const item = DATOS.peones.find((x) => x.nivel === 3);
  const { page, ctx, errores } = await abrir(browser, "/entreno/tipos.html#peones/3/" + item.id, "#jugada-input");
  await page.waitForSelector("#jugada-input", { state: "visible" });
  await esperar(400);
  const antes = await texto(page, "#jugada-label");
  await escribirEn(page, "#jugada-input", item.jugada, 500);
  cierto("Rey y peón: acertó", /^✓/.test(await texto(page, "#estado")), await texto(page, "#estado"));
  igual("y el recuadro sigue siendo el del ejercicio (no «Pregunta sobre la posición»)", await texto(page, "#jugada-label"), antes);
  igual("con el foco ahí", await foco(page), "#jugada-input");
  await escribirEn(page, "#jugada-input", "Rh1", 300);
  cierto("y lo que se escriba después dice que terminó y cómo seguir", /^Este ejercicio ya terminó\. Escribe «siguiente»/.test(await texto(page, "#estado")), await texto(page, "#estado"));
  sinErrores(errores, "Habilidades · peones 3");
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
    await practicarYDesafios(browser);
    await visualizacion(browser);
    await aprenderBloqueadas(browser);
    await cuatroPorCuatro(browser);
    await precisionSinListo(browser);
    await volverYMemoria(browser);
    await hubYDiagnostico(browser);
    await habilidades(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
