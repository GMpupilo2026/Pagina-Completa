/* ===== Comprobación: la Academia se recorre sin ver la pantalla =====
 *
 * Lo que se arregló para quien usa lector de pantalla se rompe callado: la
 * página se ve perfecta y funciona con el ratón, y lo único que pasa es que
 * alguien que no ve deja de poder entrenar. Por eso se mira desde afuera, en un
 * navegador de verdad y con el Modo Adaptado encendido, lo que oiría esa
 * persona:
 *
 *   1. La clase en vivo (sesion.html), como alumna:
 *      - el tablero tiene UNA parada de tabulador aunque no tenga el control, y
 *        las flechas mueven el foco (antes: cero paradas, no se podía mirar);
 *      - cada casilla se dice con la columna hablada y el color concordado;
 *      - el recuadro se VE y contesta "posición";
 *      - sin el control, escribir una jugada explica por qué no y NO manda nada;
 *      - cuando el profesor mueve, se anuncia la jugada (y no las 32 piezas);
 *      - con el control, la jugada escrita llega a la base como la del clic;
 *      - con las piezas OCULTAS ni las casillas ni el recuadro las cuentan;
 *      - la pregunta del profesor es un diálogo que se lleva el foco y se
 *        contesta escribiendo; la de opciones también, con la LETRA («B»), y
 *        cada botón lleva escrito «Opción A.», «Opción B.»…;
 *      - las flechas y los círculos que dibuja el profe se dicen (solo los
 *        nuevos), y «última jugada» y «jugadas» dicen lo que se jugó;
 *      - el tablero es un «tablero de ajedrez» (aria-roledescription, que es lo
 *        que busca Alt + Mayúscula + B) con rol de aplicación y los atajos
 *        z / o, que con las piezas ocultas no cuentan nada;
 *      - la Fotografía dicta la posición y los segundos antes de ocultarla;
 *      - el calentamiento se lleva el foco a su recuadro y confirma en palabras.
 *   2. Ejercicios por tema: un solo "Saltar al contenido", cada botón dice qué
 *      tema abre, y al abrir uno se anuncia quién juega y qué buscar —nunca
 *      "haz clic"— con el foco en el recuadro.
 *   3. Aprender: abrir una lección deja el foco en su título, no en el <body>.
 *   4. En un celular sin la preferencia elegida se PREGUNTA por el modo, una
 *      sola vez; en la computadora no.
 *   5. Ningún título de la Academia le hace leer un emoji al lector.
 *
 * Cómo se corre (con el sitio en localhost:8777):
 *     npm install playwright chess.js@0.10.3
 *     node herramientas/verificar-clase-adaptada.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir, igual, CHROME, BASE, fallos } = require("./verificar-clase-registrada.js");
const guia = require("./guia-capturas.js");

const RAIZ = path.join(__dirname, "..");
let mias = 0;
function si(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); mias += 1; }
}

const CLASE = { id: "s-1", title: "Hoy", created_by: "u-profe", ended_at: null,
                started_at: new Date().toISOString(), notes: null };
const LUCENA = "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1";
const fila = (extra) => Object.assign({
  id: 7, owner_id: "u-profe", moves: [], start_fen: LUCENA, arrows: [], circles: [],
  active_player_id: null, active_player_color: "both", pieces_hidden: false,
  shown_curso: null, shown_leccion: null,
}, extra || {});

async function enAdaptado(page) {
  await page.evaluate(() => localStorage.setItem("oscarBlindMode_v1", "1"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
  await page.waitForTimeout(1200);
}
const aviso = (page, sel) => page.evaluate((s) => (document.querySelector(s + " .cc-msg") || {}).textContent || "", sel);
async function escribir(page, sel, texto) {
  const inp = page.locator(sel + " .cc-input");
  await inp.fill(texto);
  await inp.press("Enter");
  await page.waitForTimeout(250);
}

async function pruebaClase(browser) {
  console.log("\n=== La clase en vivo, sin ver la pantalla ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE);
  await enAdaptado(page);
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila());
  await page.waitForTimeout(300);

  const t = await page.evaluate(() => {
    const c = [...document.querySelectorAll("#chessboard [data-square]")];
    return { paradas: c.filter((x) => x.tabIndex === 0).length,
             b8: document.querySelector('#chessboard [data-square="b8"]').getAttribute("aria-label"),
             a2: document.querySelector('#chessboard [data-square="a2"]').getAttribute("aria-label"),
             caja: document.querySelector("#clase-cmd .cc-caja").checkVisibility(),
             posViva: document.querySelector("#clase-cmd .cc-pos").getAttribute("aria-live") };
  });
  igual("el tablero tiene UNA parada de tabulador sin tener el control", t.paradas, 1);
  igual("la casilla dice la columna hablada y el color concordado", t.b8, "bella 8, rey blanco");
  igual("y la torre negra es negra, no «negro»", t.a2, "anna 2, torre negra");
  igual("el recuadro se ve en Modo Adaptado", t.caja, true);
  igual("la posición del recuadro NO es región viva (se anuncia la jugada)", t.posViva, null);

  await page.focus("#chessboard [tabindex='0']");
  const antes = await page.evaluate(() => document.activeElement.dataset.square);
  await page.keyboard.press("ArrowRight");
  const despues = await page.evaluate(() => document.activeElement.dataset.square);
  si("las flechas mueven el foco aunque no tenga el control", antes && despues && antes !== despues, antes + " → " + despues);

  await escribir(page, "#clase-cmd", "posición");
  si("«posición» contesta con las piezas", /Blancas: rey en bella 8/.test(await aviso(page, "#clase-cmd")), await aviso(page, "#clase-cmd"));

  await page.evaluate(() => { window.__updates.length = 0; });
  await escribir(page, "#clase-cmd", "Td1");
  si("sin el control, escribir una jugada explica por qué", /mueve tu profe/i.test(await aviso(page, "#clase-cmd")), await aviso(page, "#clase-cmd"));
  igual("y no manda nada a la base", await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").length), 0);
  /* Lo que no es una jugada no se entendió, con o sin el control: decirle
     «Ahora mueve tu profe» a un «hola» le hace creer que jugó a destiempo. */
  await escribir(page, "#clase-cmd", "hola");
  const hola = await aviso(page, "#clase-cmd");
  si("sin el control, «hola» dice «No entendí «hola»» (no «mueve tu profe»)", /^No entendí «hola»/.test(hola) && !/mueve tu profe/i.test(hola), hola);

  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ moves: ["Rd1+"] }));
  await page.waitForTimeout(300);
  const jugada = await aviso(page, "#clase-cmd");
  si("la jugada del profesor se anuncia", /Se jugó torre david 1 jaque\. Juegan negras\./.test(jugada), jugada);
  si("sin dictar la posición entera", !/Blancas:/.test(jugada), jugada);

  // El alumno no tiene la lista de jugadas a la vista: la pide escribiendo.
  await escribir(page, "#clase-cmd", "última jugada");
  const ultima = await aviso(page, "#clase-cmd");
  si("«última jugada» la dice en palabras", /La última jugada fue de las blancas: torre david 1 jaque/.test(ultima), ultima);
  await escribir(page, "#clase-cmd", "jugadas");
  const todas = await aviso(page, "#clase-cmd");
  si("«jugadas» a secas dice la partida, numerada y en palabras", /^1 jugada\. 1: torre david 1 jaque/.test(todas), todas);

  // El tablero de la clase es un tablero de ajedrez para el lector, y se le
  // pregunta con una tecla (js/tablero-accesible.js montado sobre ClasesBoard).
  const tb = await page.evaluate(() => {
    const b = document.getElementById("chessboard");
    return { desc: b.getAttribute("aria-roledescription"), rol: b.getAttribute("role"),
             loHalla: document.querySelector('[aria-roledescription="tablero de ajedrez"]') === b };
  });
  igual("el tablero de la clase se anuncia como tablero de ajedrez", tb.desc, "tablero de ajedrez");
  igual("con rol de aplicación en Modo Adaptado (si no, el lector se queda con las teclas)", tb.rol, "application");
  igual("y Alt + Mayúscula + B lo encuentra (es el primero con ese roledescription)", tb.loHalla, true);
  const dice = () => page.evaluate(() => (document.getElementById("chessboard").parentNode.querySelector(".ta-dice") || {}).textContent || "");
  await page.focus("#chessboard [tabindex='0']");
  await page.keyboard.press("z");
  await page.waitForTimeout(200);
  si("la z sobre el tablero dice la posición", /Blancas: rey en bella 8/.test(await dice()), await dice());
  await escribir(page, "#clase-cmd", "ir a e4");
  const f0 = await page.evaluate(() => document.activeElement.dataset.square);
  await page.keyboard.press("ArrowDown");
  const f1 = await page.evaluate(() => document.activeElement.dataset.square);
  igual("«ir a e4» y una flecha abajo: UNA casilla (no dos: el tablero le cede las suyas)", f0 + " → " + f1, "e4 → e3");

  // Las flechas y los círculos del profe se DICEN, solo los nuevos.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f),
    fila({ moves: ["Rd1+"], arrows: [{ from: "c1", to: "c8", color: "verde" }], circles: [{ square: "b7", color: "rojo" }] }));
  await page.waitForTimeout(300);
  const marcas = await aviso(page, "#clase-cmd");
  si("la flecha y el círculo del profe se anuncian", /Tu profe marcó una flecha de cesar 1 a cesar 8, la casilla bella 7\./.test(marcas), marcas);
  await page.evaluate(() => { document.querySelector("#clase-cmd .cc-msg").textContent = ""; });
  await page.evaluate((f) => window.__cambioEnBase("game_state", f),
    fila({ moves: ["Rd1+"], arrows: [{ from: "c1", to: "c8", color: "verde" }, { from: "a2", to: "a8", color: "rojo" }], circles: [{ square: "b7", color: "rojo" }] }));
  await page.waitForTimeout(300);
  const otra = await aviso(page, "#clase-cmd");
  si("al sumar una, se dice solo la nueva", /^Tu profe marcó una flecha de anna 2 a anna 8\.$/.test(otra), otra);

  // Fotografía: la posición entera y los segundos, ANTES de que se oculte.
  await page.evaluate((fen) => window.__difundir("fotografia", { fen, segundos: 8 }), LUCENA);
  await page.waitForTimeout(300);
  const foto = await aviso(page, "#clase-cmd");
  si("la Fotografía dicta la posición y cuántos segundos hay",
    /Fotografía: tu profe te muestra esta posición 8 segundos/.test(foto) && /Blancas: rey en bella 8/.test(foto), foto);

  // Le da el control con negras: la jugada escrita tiene que llegar a la base.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f),
    fila({ moves: ["Rd1+"], active_player_id: "u-ana", active_player_color: "b" }));
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__updates.length = 0; });
  await escribir(page, "#clase-cmd", "Re7");
  const env = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").map((u) => u.campos.moves));
  si("con el control, la jugada escrita se manda como la del clic", env.length && JSON.stringify(env[env.length - 1]) === JSON.stringify(["Rd1+", "Ke7"]), JSON.stringify(env));
  si("y se confirma en palabras", /Jugaste rey eva 7/.test(await aviso(page, "#clase-cmd")), await aviso(page, "#clase-cmd"));

  // Piezas ocultas: no se puede escapar ni una.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ pieces_hidden: true }));
  await page.waitForTimeout(300);
  const oc = await page.evaluate(() => ({
    b8: document.querySelector('#chessboard [data-square="b8"]').getAttribute("aria-label"),
    pos: document.querySelector("#clase-cmd .cc-pos").textContent,
  }));
  igual("con las piezas ocultas la casilla no dice qué hay", oc.b8, "bella 8");
  si("ni el recuadro las cuenta", /ocultas/.test(oc.pos) && !/rey/.test(oc.pos), oc.pos);
  await escribir(page, "#clase-cmd", "caballos");
  si("ni contesta preguntas sobre ellas", /ocultas/.test(await aviso(page, "#clase-cmd")), await aviso(page, "#clase-cmd"));
  await page.focus("#chessboard [tabindex='0']");
  await page.keyboard.press("z");
  await page.waitForTimeout(200);
  si("ni la z sobre el tablero", /ocultas/.test(await dice()) && !/rey/.test(await dice()), await dice());
  // Las jugadas sí: se anuncian igual con las piezas ocultas.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ pieces_hidden: true, moves: ["Rd1+"] }));
  await page.waitForTimeout(300);
  await escribir(page, "#clase-cmd", "última jugada");
  si("con las piezas ocultas, «última jugada» contesta igual", /torre david 1 jaque/.test(await aviso(page, "#clase-cmd")), await aviso(page, "#clase-cmd"));

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaPregunta(browser) {
  console.log("\n=== La pregunta del profesor se contesta escribiendo ===");
  const pregunta = { id: "q-1", fen: LUCENA, created_by: "u-profe", expected_plies: 1, prompt: "¿Cómo se gana?",
                     closed_at: null, created_at: new Date().toISOString() };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { questions: [pregunta] });
  await enAdaptado(page);
  await page.waitForSelector("#question-card:not(.hidden)", { timeout: 8000 }).catch(() => {});
  const d = await page.evaluate(() => ({
    rol: document.getElementById("question-card").getAttribute("role"),
    foco: document.activeElement && document.activeElement.id,
    caja: !!document.querySelector("#question-cmd .cc-caja") && document.querySelector("#question-cmd .cc-caja").checkVisibility(),
  }));
  igual("la pregunta es un diálogo", d.rol, "dialog");
  igual("y se lleva el foco al abrirse", d.foco, "question-titulo");
  igual("con su recuadro a la vista", d.caja, true);
  const colorHint = await page.evaluate(() => { const c = document.getElementById("question-color-hint").cloneNode(true); c.querySelectorAll("[aria-hidden=true]").forEach((x) => x.remove()); return c.textContent; });
  igual("el círculo del color va fuera del lector («leer» no dice «círculo blanco»)", colorHint, "Te toca jugar con Blancas");
  await page.evaluate(() => { window.__inserts.length = 0; });
  await escribir(page, "#question-cmd", "Td1");
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "question_answers").map((i) => i.fila.moves));
  si("la jugada escrita se envía como respuesta", r.length && JSON.stringify(r[0]) === JSON.stringify(["Rd1+"]), JSON.stringify(r));
  /* Después de contestar, «siguiente» decía «usa el botón "Cambiar
     respuesta"»: se dice qué escribir, y escribirlo funciona. */
  await escribir(page, "#question-cmd", "siguiente");
  const sig = await aviso(page, "#question-cmd");
  si("«siguiente» con la respuesta enviada dice qué escribir para cambiarla", /Ya enviaste tu respuesta/.test(sig) && /escribe «cambiar respuesta»/.test(sig) && !/bot[oó]n/.test(sig), sig);
  await escribir(page, "#question-cmd", "Td8");
  const ya = await aviso(page, "#question-cmd");
  si("una jugada con la respuesta enviada tampoco dice «usa el botón»", /escribe «cambiar respuesta»/.test(ya) && !/bot[oó]n/.test(ya), ya);
  await escribir(page, "#question-cmd", "cambiar respuesta");
  const cambia = await aviso(page, "#question-cmd");
  igual("«cambiar respuesta» deja volver a contestar", await page.evaluate(() => [questionBoard.interactive, document.getElementById("question-retry-btn").classList.contains("hidden")].join(",")), "true,true");
  si("y lo dice", /^Puedes volver a contestar/.test(cambia), cambia);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaOpciones(browser) {
  console.log("\n=== La pregunta de opciones se contesta escribiendo la letra ===");
  const QUIEN = ["Mejor las blancas", "Están iguales", "Mejor las negras"];
  const pregunta = { id: "q-2", fen: LUCENA, created_by: "u-profe", expected_plies: 1, prompt: "¿Quién está mejor?",
                     tipo: "opciones", opciones: QUIEN, tiempo_limite: null, resultados_visibles: false,
                     closed_at: null, created_at: new Date().toISOString() };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { questions: [pregunta] });
  await enAdaptado(page);
  await page.waitForFunction(() => document.querySelectorAll("#question-opciones button").length === 3, null, { timeout: 10000 });
  const d = await page.evaluate(() => ({
    botones: [...document.querySelectorAll("#question-opciones button")].map((b) => b.textContent),
    caja: !!document.querySelector("#question-cmd .cc-caja") && document.querySelector("#question-cmd .cc-caja").checkVisibility(),
    etiqueta: document.querySelector("#question-cmd .cc-etiqueta").textContent,
  }));
  igual("cada botón lleva escrita su letra", JSON.stringify(d.botones), JSON.stringify(QUIEN.map((t, i) => "Opción " + "ABC"[i] + ". " + t)));
  igual("el recuadro se queda en las de opciones", d.caja, true);
  si("y pide la letra", /letra de tu opción \(A, B, C\)/.test(d.etiqueta), d.etiqueta);
  await escribir(page, "#question-cmd", "posición");
  si("se le puede preguntar la posición de la que se habla", /Blancas: rey en bella 8/.test(await aviso(page, "#question-cmd")), await aviso(page, "#question-cmd"));
  await escribir(page, "#question-cmd", "la de arriba");
  si("lo que no se entiende se dice, no se marca cualquier cosa", /No entendí/.test(await aviso(page, "#question-cmd")), await aviso(page, "#question-cmd"));
  igual("…y no manda nada", await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "question_answers").length), 0);
  await escribir(page, "#question-cmd", "D");
  const d4 = await aviso(page, "#question-cmd");
  igual("una letra que no es de ninguna opción dice cuáles hay", d4, "No hay opción D: las opciones son A, B y C.");
  await escribir(page, "#question-cmd", "B");
  await page.waitForTimeout(400);
  const env = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "question_answers").map((i) => i.fila.opcion));
  igual("escribir «B» manda la opción B, como el botón", JSON.stringify(env), "[1]");
  si("y lo confirma", /Enviaste la opción B: Están iguales/.test(await aviso(page, "#question-cmd")), await aviso(page, "#question-cmd"));
  igual("el botón B queda marcado", await page.evaluate(() =>
    [...document.querySelectorAll("#question-opciones button")].map((b) => b.getAttribute("aria-pressed")).join(",")), "false,true,false");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Con la cuenta marcada como ciega (modo-ciego): todo desde el recuadro.
   - la pregunta del profe se lleva el foco a SU recuadro (no al título: desde
     ahí eran dos Tab, cinco en las de opciones) y se dice entera, con las
     opciones y sus letras;
   - «tiempo» dice cuánto queda; lo que no se entiende queda seleccionado (si
     no, lo siguiente se pegaba detrás: «tiempob»);
   - al cerrarse la pregunta se dice que se cerró;
   - la franja de estado no se reescribe igual con cada jugada del profe;
   - la Fotografía se dicta también a quien entra durante sus segundos. */
async function pruebaSinVer(browser) {
  console.log("\n=== Con la cuenta ciega: la pregunta, el tiempo, el cierre y la foto ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { vision_personas: [{ persona_id: "u-ana", vision: "ciego" }], questions: [] });
  await page.evaluate(() => {
    localStorage.setItem("ai_vision_v1", JSON.stringify({ persona: "u-ana", vision: "ciego" }));
    localStorage.setItem("ai_vision_aplicada_v1", "u-ana:ciego");
  });
  await enAdaptado(page);
  igual("la página está en modo ciego", await page.evaluate(() => document.documentElement.classList.contains("modo-ciego")), true);
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila());
  await page.waitForTimeout(300);

  await page.evaluate(() => { window.__franja = 0; new MutationObserver(() => window.__franja++).observe(document.getElementById("status-banner"), { subtree: true, childList: true, characterData: true }); });
  for (const m of [["Rd1+"], ["Rd1+", "Ke7"], ["Rd1+", "Ke7", "Re1+"]]) {
    await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ moves: m }));
    await page.waitForTimeout(150);
  }
  igual("la franja de estado no se reescribe igual en cada jugada del profe", await page.evaluate(() => window.__franja), 0);

  /* Se envía y se mira EN EL MISMO instante: js/vision-cuenta.js también
     selecciona lo que quedó, pero 60 ms después. Lo que se prueba acá es que el
     recuadro de la clase lo haga solo. */
  const enviarYVer = (sel, texto) => page.evaluate(([s, t]) => {
    const i = document.querySelector(s + " .cc-input");
    i.focus();
    i.value = t;
    i.form.requestSubmit();
    return i.value.length > 0 && i.selectionStart === 0 && i.selectionEnd === i.value.length ? i.value : "(no: «" + i.value + "» " + i.selectionStart + "-" + i.selectionEnd + ")";
  }, [sel, texto]);
  igual("sin el control, la jugada queda escrita y SELECCIONADA", await enviarYVer("#clase-cmd", "Td8"), "Td8");

  const QUIEN = ["Mejor las blancas", "Están iguales", "Mejor las negras"];
  const q = { id: "q-9", fen: LUCENA, created_by: "u-profe", expected_plies: 1, prompt: "¿Quién está mejor?",
              tipo: "opciones", opciones: QUIEN, tiempo_limite: 60, resultados_visibles: false,
              closed_at: null, created_at: new Date().toISOString() };
  await page.evaluate((x) => { window.__tablas.questions.push(x); window.__cambioEnBase("questions", x, "INSERT"); }, q);
  await page.waitForFunction(() => document.querySelectorAll("#question-opciones button").length === 3, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  const foco = await page.evaluate(() => ({ enRecuadro: !!document.activeElement.closest("#question-cmd") && document.activeElement.matches(".cc-input"), id: document.activeElement.id }));
  si("la pregunta se lleva el foco a SU recuadro", foco.enRecuadro, JSON.stringify(foco));
  /* Lo que había a medias en el recuadro de la clase («Td8», que quedó
     seleccionado) se vacía: al volver, lo siguiente se pegaba detrás. */
  igual("lo que había a medias en el recuadro de la clase se vacía", await page.inputValue("#clase-cmd .cc-input"), "");
  const dicha = await aviso(page, "#question-cmd");
  si("y se dice entera, con las opciones y sus letras",
    /Pregunta de tu profe: ¿Quién está mejor\?/.test(dicha) && /A, Mejor las blancas; B, Están iguales; C, Mejor las negras/.test(dicha), dicha);
  await escribir(page, "#question-cmd", "tiempo");
  const tiempo = await aviso(page, "#question-cmd");
  si("«tiempo» dice cuánto queda", /Te quedan (\d+ segundos|1 minuto)/.test(tiempo), tiempo);
  const reloj = await page.evaluate(() => { const c = document.getElementById("question-tiempo-alumno").cloneNode(true); c.querySelectorAll("[aria-hidden=true]").forEach((x) => x.remove()); return c.textContent; });
  si("el ⏱️ del tiempo de la pregunta va fuera del lector", /^Quedan /.test(reloj) && !/⏱/.test(reloj), reloj);
  igual("y no queda escrito", await page.inputValue("#question-cmd .cc-input"), "");
  igual("lo que no se entiende queda SELECCIONADO", await enviarYVer("#question-cmd", "la de arriba"), "la de arriba");
  await page.waitForTimeout(250);
  await page.keyboard.type("B");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  igual("y la letra que sigue lo reemplaza y se envía", await page.evaluate(() => JSON.stringify(window.__inserts.filter((i) => i.tabla === "question_answers").map((i) => i.fila.opcion))), "[1]");

  /* «leer» (js/vision-cuenta.js) dice también las opciones con su letra: van
     en una lista, y «leer» lee los renglones de lista de la sección. */
  await escribir(page, "#question-cmd", "leer");
  const leido = await aviso(page, "#question-cmd");
  si("«leer» dice la pregunta y las opciones con su letra",
    /¿Quién está mejor/.test(leido) && /Opción A\. Mejor las blancas\. Opción B\. Están iguales\. Opción C\. Mejor las negras/.test(leido), leido);
  for (const pide of ["opciones", "repetir"]) {
    await escribir(page, "#question-cmd", pide);
    const ops = await aviso(page, "#question-cmd");
    si("«" + pide + "» dice las opciones con su letra", /^Opciones: A, Mejor las blancas; B, Están iguales; C, Mejor las negras\./.test(ops), ops);
  }
  // El TEXTO de una opción la elige, si nombra una sola.
  await escribir(page, "#question-cmd", "Mejor las negras");
  await page.waitForTimeout(400);
  igual("escribir el texto de una opción la elige", await page.evaluate(() => JSON.stringify(window.__inserts.filter((i) => i.tabla === "question_answers").map((i) => i.fila.opcion))), "[1,2]");
  await escribir(page, "#question-cmd", "mejor");
  await page.waitForTimeout(300);
  const ambigua = await aviso(page, "#question-cmd");
  si("un texto que está en dos opciones no elige ninguna", /^No entendí «mejor»/.test(ambigua) && (await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "question_answers").length)) === 2, ambigua);

  await page.evaluate(() => {
    const cerrada = Object.assign({}, window.__tablas.questions[window.__tablas.questions.length - 1], { closed_at: new Date().toISOString() });
    window.__tablas.questions[window.__tablas.questions.length - 1] = cerrada;
    window.__cambioEnBase("questions", cerrada, "UPDATE");
  });
  await page.waitForTimeout(500);
  const cierre = await aviso(page, "#clase-cmd");
  si("al cerrarse la pregunta se dice", /La pregunta se cerró\. Tu respuesta quedó enviada/.test(cierre), cierre);
  si("y el foco vuelve al recuadro de la clase", await page.evaluate(() => !!document.activeElement.closest("#clase-cmd")), await page.evaluate(() => document.activeElement.outerHTML.slice(0, 80)));

  // Entra (o recarga) durante los segundos de la Fotografía: el aviso suelto
  // ya pasó, pero el profe la lleva en su presencia.
  await page.evaluate((fen) => window.__presencia("u-profe", { full_name: "Profe", role: "profesor", online_at: new Date().toISOString(),
    fotografia: { fen, segundos: 8, hasta: new Date(Date.now() + 6000).toISOString() } }), LUCENA);
  await page.waitForTimeout(300);
  const foto = await aviso(page, "#clase-cmd");
  si("la Fotografía en curso se dicta al que entra, con los segundos que quedan",
    /Fotografía: tu profe te muestra esta posición [56] segundos/.test(foto) && /Blancas: rey en bella 8/.test(foto), foto);
  await page.evaluate(() => { document.querySelector("#clase-cmd .cc-msg").textContent = ""; });
  await page.evaluate(() => window.__avisoDePresencia());
  await page.waitForTimeout(300);
  igual("y la misma foto no se dicta dos veces", await aviso(page, "#clase-cmd"), "");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaCalentamiento(browser) {
  console.log("\n=== El calentamiento, sin ver la pantalla ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE);
  await enAdaptado(page);
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila());
  await page.waitForTimeout(300);
  await page.evaluate((f) => window.__cambioEnBase("game_state", f),
    fila({ calentamiento: { at: new Date().toISOString(), fen: LUCENA, solucion: ["c1d1"], titulo: null } }));
  await page.waitForTimeout(800);
  igual("el foco va al recuadro del calentamiento", await page.evaluate(() =>
    !!document.activeElement && !!document.activeElement.closest("#calentamiento-cmd")), true);
  /* Después de fallar, todo contestaba «Toca "Intentarlo otra vez"». Ahora
     «otra vez» vuelve a la posición, y una jugada nueva se intenta directo. */
  await escribir(page, "#calentamiento-cmd", "Tc2");
  await page.waitForTimeout(300);
  si("fallar dice «Respuesta incorrecta»", /^Respuesta incorrecta: torre cesar 2/.test(await page.textContent("#calentamiento-msg")), await page.textContent("#calentamiento-msg"));
  await escribir(page, "#calentamiento-cmd", "hola");
  const hola = await aviso(page, "#calentamiento-cmd");
  si("después de fallar, «hola» no se entendió (sin «toca»)", /^No entendí «hola»/.test(hola) && !/toca/i.test(hola), hola);
  await escribir(page, "#calentamiento-cmd", "otra vez");
  const otra = await aviso(page, "#calentamiento-cmd");
  si("«otra vez» vuelve a la posición y lo dice", /^Volviste a la posición del calentamiento/.test(otra) && await page.evaluate(() => calentamientoBoard.interactive && !calentamientoBoard.moves().length), otra);
  await escribir(page, "#calentamiento-cmd", "Tc3");
  await page.waitForTimeout(300);
  const turno = await page.evaluate(() => { const el = document.getElementById("calentamiento-turno"); const c = el.cloneNode(true); c.querySelectorAll("[aria-hidden=true]").forEach((x) => x.remove()); return c.textContent; });
  si("el círculo del color del turno va fuera del lector", /^Juegan Blancas: /.test(turno) && !/[⚪⚫]/.test(turno), turno);
  // Una jugada nueva después de fallar se intenta directo, sin pasar por «otra vez».
  await escribir(page, "#calentamiento-cmd", "Td1");
  await page.waitForTimeout(300);
  const msg = await page.textContent("#calentamiento-msg");
  si("y la confirmación dice la jugada en palabras, no «Rd1+»", /torre david 1/.test(msg) && !/Rd1/.test(msg), msg);
  si("la jugada nueva después de fallar se intentó directo", /^✅ ¡Bien!/.test(msg), msg);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function contextoAlumna(browser, opciones, adaptado) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones || {}));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript",
    body: guia.clienteFalso({ yo: guia.ALUMNOS[0] }) }));
  if (adaptado) await ctx.addInitScript(() => { try { localStorage.setItem("oscarBlindMode_v1", "1"); } catch (e) {} });
  return ctx;
}

async function pruebaTemas(browser) {
  console.log("\n=== Ejercicios por tema ===");
  const ctx = await contextoAlumna(browser, null, true);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/entreno/temas.html", { waitUntil: "networkidle" });
  await page.waitForSelector(".tbtn", { timeout: 20000 });
  const l = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".tbtn")].map((x) => x.textContent.trim());
    return { saltos: [...document.querySelectorAll("a")].filter((a) => /Saltar al contenido/.test(a.textContent)).length,
             total: b.length, distintos: new Set(b).size };
  });
  igual("un solo «Saltar al contenido»", l.saltos, 1);
  si("cada botón dice qué tema abre (ninguno repetido)", l.total > 10 && l.total === l.distintos, l.distintos + " distintos de " + l.total);
  await page.locator(".tbtn").first().click();
  await page.waitForTimeout(800);
  const s = await page.evaluate(() => ({
    estado: document.getElementById("round-status").textContent,
    foco: document.activeElement && document.activeElement.className,
  }));
  si("se anuncia quién juega y qué buscar", /^Juegan (blancas|negras): encuentra/.test(s.estado), s.estado);
  si("sin mandar a hacer clic", !/clic/i.test(s.estado), s.estado);
  si("y el foco queda en el recuadro", /cc-input/.test(s.foco || ""), s.foco);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaFocoAlAbrir(browser, url, boton, titulo) {
  const ctx = await contextoAlumna(browser, null, true);
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator(boton).first().click();
  await page.waitForTimeout(600);
  igual("en " + url + " el foco va al título al abrir", await page.evaluate(() => document.activeElement.id), titulo);
  await ctx.close();
}

async function pruebaCelular(browser) {
  console.log("\n=== En el celular se pregunta por el modo, una vez ===");
  const tactil = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  let ctx = await contextoAlumna(browser, tactil, false);
  let page = await ctx.newPage();
  await page.goto(BASE + "/clases.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const o = await page.evaluate(() => {
    const c = document.getElementById("am-oferta");
    const salto = document.querySelector('a[href="#main-content"]');
    return { hay: !!c && c.checkVisibility(), justoDespues: !!c && salto && salto.nextElementSibling === c };
  });
  igual("en un celular sin la preferencia se pregunta", o.hay, true);
  igual("y es lo primero después de «Saltar al contenido»", o.justoDespues, true);
  await page.getByRole("button", { name: "Sí, activar el modo adaptado" }).tap();
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ clave: localStorage.getItem("oscarBlindMode_v1"),
    clase: document.documentElement.classList.contains("adaptive-mode"), sigue: !!document.getElementById("am-oferta") }));
  igual("decir que sí enciende el modo y lo guarda", r.clave + " " + r.clase, "1 true");
  igual("y la pregunta se va", r.sigue, false);
  await page.reload({ waitUntil: "networkidle" });
  igual("no vuelve a preguntar", await page.evaluate(() => !!document.getElementById("am-oferta")), false);
  await ctx.close();

  ctx = await contextoAlumna(browser, null, false);
  page = await ctx.newPage();
  await page.goto(BASE + "/clases.html", { waitUntil: "networkidle" });
  igual("en la computadora no se pregunta (ahí está el primer Tab)", await page.evaluate(() => !!document.getElementById("am-oferta")), false);
  await ctx.close();
}

function pruebaEmojis() {
  console.log("\n=== Los títulos no le hacen leer emojis al lector ===");
  const pat = /<(h[1-3])(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2654}-\u{265F}]/u;
  const malos = [];
  const recorrer = (dir) => {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (/node_modules|cursos[\\/]recursos|\.git/.test(p)) continue;
      if (fs.statSync(p).isDirectory()) { recorrer(p); continue; }
      if (!p.endsWith(".html")) continue;
      const s = fs.readFileSync(p, "utf8").replace(/<script\b[\s\S]*?<\/script>/g, "");
      let m;
      while ((m = pat.exec(s))) {
        if (/\$\{|' \+/.test(m[3])) continue;
        const limpio = m[3].replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "");
        if (emo.test(limpio)) malos.push(path.relative(RAIZ, p) + ": " + limpio.trim().slice(0, 50));
      }
    }
  };
  recorrer(RAIZ);
  si("ningún h1-h3 con un emoji a la vista del lector", !malos.length, malos.slice(0, 5).join("\n      "));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaClase(browser);
    await pruebaPregunta(browser);
    await pruebaOpciones(browser);
    await pruebaSinVer(browser);
    await pruebaCalentamiento(browser);
    await pruebaTemas(browser);
    console.log("\n=== Abrir una lección no pierde el foco ===");
    await pruebaFocoAlAbrir(browser, "/entreno/aprender.html", "#lesson-list button", "lesson-title");
    await pruebaFocoAlAbrir(browser, "/entreno/practicas.html", "#set-list button, #list-view button.set", "set-title");
    await pruebaCelular(browser);
    pruebaEmojis();
  } finally {
    await browser.close();
  }
  const total = fallos() + mias;
  console.log(total ? "\n" + total + " fallo(s)." : "\nTodo bien: la Academia se recorre sin ver la pantalla.");
  process.exit(total ? 1 : 0);
})();
