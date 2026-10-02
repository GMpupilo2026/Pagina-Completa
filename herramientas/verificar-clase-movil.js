#!/usr/bin/env node
/* La clase en vivo en el celular del alumno (375 × 740, táctil).

   Muchos alumnos entran desde el celular, y ahí lo que se rompe no da ningún
   error: la página funciona, pero el tablero queda abajo de todo, la cuenta
   regresiva no se ve mientras se mira el tablero o el botón no se acierta con
   el dedo. Se comprueba, con el tiempo para pensar, el mapa, el
   calentamiento, los equipos y el podio puestos a la vez:

   - que nada se salga a lo ancho (sin barra horizontal);
   - que el tablero de la clase se vea ENTERO sin bajar, y que lo de arriba
     (título, franja de estado) no se coma la pantalla;
   - que el turno y el tiempo para pensar vayan justo debajo del tablero, antes
     que lo demás (en el celular, lo que queda abajo no se ve);
   - que los botones de la barra del tablero y la ✕ de la pregunta midan al
     menos 44 px de alto para el dedo, y que en la computadora sigan como eran;
   - que la tarjeta de la pregunta muestre su tablero entero.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-movil.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const fila = (x) => Object.assign({ id: 7, owner_id: "u-profe", fen: INICIO, moves: ["e4", "e5", "Nf3"], start_fen: INICIO, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, encuesta: null, calentamiento: null, podio: null, equipos: null }, x || {});
const TODO = fila({
  encuesta: { question_id: "q1", lineas: [{ jugada: "Nf3", cuantos: 3, color: "verde" }] },
  arrows: [{ from: "g1", to: "f3", color: "verde" }],
  calentamiento: { at: "c1", fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", solucion: ["a1a8"], titulo: "mate en 1" },
  podio: { at: "p1", con_nombres: true, lineas: [{ id: "u-beto", nombre: "Beto Mora Solís", puntos: 9, puesto: 1 }, { id: "u-ana", nombre: "Ana Rojas", puntos: 3, puesto: 2 }] },
  equipos: { at: "e1", lista: [{ nombre: "Azul", color: "azul", miembros: [{ id: "u-ana", nombre: "Ana Rojas" }] }, { nombre: "Verde", color: "verde", miembros: [{ id: "u-beto", nombre: "Beto Mora Solís" }] }] },
  pensar: { at: new Date().toISOString(), segundos: 120, texto: "¿Qué plan tienen las negras?" },
});
const PREGUNTA = { id: "q1", fen: INICIO, prompt: "La clase contra el motor: ¿qué jugamos con las blancas?", created_by: "u-profe",
  created_at: new Date().toISOString(), closed_at: null, expected_plies: 1, tipo: "jugada", tiempo_limite: 60, class_session_id: "c-viva" };

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function abrirEn(browser, semilla, tam, movil, quien) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: tam, isMobile: movil, hasTouch: movil });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: R.clienteFalso(quien || "u-ana", CLASE, semilla) }));
  // Quien ya contestó la oferta del Modo Adaptado: la franja de la primera vez no está.
  await ctx.addInitScript(() => { try { localStorage.setItem("oscarBlindMode_v1", "0"); localStorage.setItem("sesion_modo_sencillo_v1", "0"); } catch (e) {} });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(R.BASE + "/sesion.html", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
  await page.waitForFunction(() => document.getElementById("chessboard").children.length > 0, null, { timeout: 10000 });
  return { page, ctx, errores };
}

const caja = (page, id) => page.evaluate((i) => {
  const e = document.getElementById(i);
  if (!e || !e.checkVisibility()) return null;
  const r = e.getBoundingClientRect();
  return { top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), alto: Math.round(r.height) };
}, id);

async function pruebaCelular(browser) {
  console.log("\n=== En el celular, con todo puesto ===");
  const { page, ctx, errores } = await abrirEn(browser, { game_state: [TODO] }, { width: 375, height: 740 }, true);
  await page.waitForFunction(() => document.getElementById("podio-caja").checkVisibility(), null, { timeout: 10000 });
  igual("nada se sale a lo ancho", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const tablero = await caja(page, "chessboard");
  igual("el tablero de la clase se ve entero sin bajar", tablero.bottom <= 740, true);
  // El encabezado, las migas, el título y la franja de estado: en el celular van juntos (antes, ~300 px).
  igual("arriba del tablero no hay más de 240 px", tablero.top <= 240, true);
  const turno = await caja(page, "turn-indicator"), pensar = await caja(page, "pensar-aviso-caja");
  const lodemas = await Promise.all(["encuesta-caja", "calentamiento-caja", "equipos-caja", "podio-caja"].map((i) => caja(page, i)));
  igual("el turno y el tiempo para pensar van justo debajo del tablero, antes que lo demás",
    turno.top > tablero.bottom && pensar.top > turno.top && lodemas.every((x) => x.top > pensar.bottom), true);
  igual("y la cuenta regresiva se alcanza a ver con el tablero (arranca antes de 740 + 200)", pensar.top < 940, true);
  const altos = await page.evaluate(() => ["flip-board-btn", "show-coords-btn", "raise-hand-btn"]
    .map((i) => Math.round(document.getElementById(i).getBoundingClientRect().height)));
  igual("los botones de la barra del tablero miden al menos 44 px de alto", altos.every((h) => h >= 44), true);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaPreguntaEnCelular(browser) {
  console.log("\n=== La pregunta en el celular ===");
  const { page, ctx, errores } = await abrirEn(browser, { game_state: [fila()], questions: [PREGUNTA] }, { width: 375, height: 740 }, true);
  await page.waitForFunction(() => document.getElementById("question-card").checkVisibility(), null, { timeout: 10000 });
  const t = await page.evaluate(() => { const r = document.getElementById("question-board").getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(r.width)]; });
  igual("su tablero se ve entero, sin bajar", t[0] >= 0 && t[1] <= 740 && t[2] >= 260, true);
  const x = await page.evaluate(() => { const r = document.getElementById("question-close-btn").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  igual("la ✕ para salir mide al menos 44 × 44", x[0] >= 44 && x[1] >= 44, true);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaComputadora(browser) {
  console.log("\n=== En la computadora, como antes ===");
  const { page, ctx, errores } = await abrirEn(browser, { game_state: [fila()], questions: [PREGUNTA] }, { width: 1280, height: 800 }, false);
  await page.waitForFunction(() => document.getElementById("question-card").checkVisibility(), null, { timeout: 10000 });
  igual("la barra del tablero y la ✕ vuelven a su tamaño", await page.evaluate(() => [
    Math.round(document.getElementById("flip-board-btn").getBoundingClientRect().height) < 40,
    Math.round(document.getElementById("question-close-btn").getBoundingClientRect().height)]), [true, 24]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

/* El profe que da la clase presencial caminando por el aula, con el celular:
   sus herramientas antes que el chat, los botones para el dedo y la ayuda de
   las flechas que habla del dedo, no del clic derecho. */
async function pruebaProfeCelular(browser) {
  console.log("\n=== El profe, en el celular ===");
  const { page, ctx, errores } = await abrirEn(browser, { game_state: [fila()] }, { width: 375, height: 740 }, true, "u-profe");
  await page.waitForFunction(() => document.getElementById("teacher-tabs-wrap").checkVisibility(), null, { timeout: 10000 });
  igual("nada se sale a lo ancho", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  igual("el tablero se ve entero sin bajar", (await caja(page, "chessboard")).bottom <= 740, true);
  const [barra, pestanas, chat, alumnos, motor] = await Promise.all(
    ["teacher-toolbar", "teacher-tabs-wrap", "chat-caja", "students-panel", "engine-panel"].map((i) => caja(page, i)));
  igual("sus herramientas y las pestañas van antes que el chat", barra.top < chat.top && pestanas.top < chat.top, true);
  /* Entre el tablero y sus botones solo va la barra de girar y recorrer la
     partida (que en el celular ocupa dos o tres renglones): nada más. */
  igual("lo que toca el tablero va justo debajo de él", await page.evaluate(() => {
    let e = document.getElementById("toolbar-tablero").previousElementSibling;
    while (e && !e.checkVisibility()) e = e.previousElementSibling;
    return e && e.contains(document.getElementById("flip-board-btn")) ? "debajo de la barra del tablero" : (e ? e.id || e.className : "nada");
  }), "debajo de la barra del tablero");
  igual("el motor y los alumnos van antes que las pestañas", motor.top < pestanas.top && alumnos.top < pestanas.top, true);
  igual("◀ ▶ para recorrer la partida miden 44 px", await page.evaluate(() => ["move-nav-first", "move-nav-prev", "move-nav-next", "move-nav-last"]
    .every((i) => document.getElementById(i).getBoundingClientRect().height >= 44)), true);
  // Pestaña por pestaña: lo de adentro también se toca con el dedo.
  const chicos = [];
  for (const t of ["plan", "tactica", "preguntar", "practicar"]) {
    await page.click("#teacher-tab-" + t);
    (await page.evaluate(() => [...document.querySelectorAll(".proyector-contenido > aside button, .proyector-contenido > aside select, .proyector-contenido > aside summary, #toolbar-tablero button, #toolbar-tablero select")]
      .filter((e) => e.checkVisibility()).filter((e) => e.getBoundingClientRect().height < 44).map((e) => (e.textContent || e.id).trim().slice(0, 25))))
      .forEach((x) => { if (!chicos.includes(x)) chicos.push(x); });
  }
  igual("todo lo que se toca en sus herramientas, en cada pestaña, mide al menos 44 px de alto", chicos, []);
  igual("la ayuda de las flechas habla del dedo, no del clic derecho", await page.evaluate(() => {
    const h = document.getElementById("arrows-hint");
    return [h.querySelector(".solo-tactil").checkVisibility(), h.querySelector(".solo-raton").checkVisibility()];
  }), [true, false]);
  // Si la ventana se agranda (una tablet que se gira), el chat vuelve a su columna.
  await page.setViewportSize({ width: 1280, height: 800 });
  // El aviso de matchMedia llega en el cuadro siguiente, no en el acto: se espera.
  await page.waitForFunction(() => document.getElementById("chat-caja").parentElement.classList.contains("proyector-columna"), null, { timeout: 5000 }).catch(() => {});
  igual("en pantalla ancha, el chat vuelve a su columna", await page.evaluate(() => document.getElementById("chat-caja").parentElement.classList.contains("proyector-columna")), true);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaProfeComputadora(browser) {
  console.log("\n=== El profe, en la computadora, como antes ===");
  const { page, ctx, errores } = await abrirEn(browser, { game_state: [fila()] }, { width: 1280, height: 800 }, false, "u-profe");
  await page.waitForFunction(() => document.getElementById("teacher-tabs-wrap").checkVisibility(), null, { timeout: 10000 });
  igual("el chat sigue en la columna del tablero", await page.evaluate(() => document.getElementById("chat-caja").parentElement.classList.contains("proyector-columna")), true);
  // ◀ ▶ miden 36 px como los demás iconos de la barra del tablero (.boton-icono): con el
  // ratón no hace falta el tamaño del dedo, pero sí que la fila sea pareja.
  igual("◀ ▶ y las pestañas, de su tamaño de computadora", await page.evaluate(() => [
    Math.round(document.getElementById("move-nav-prev").getBoundingClientRect().height),
    [...document.querySelectorAll("#teacher-tabs-wrap button")].filter((e) => e.checkVisibility()).every((e) => e.getBoundingClientRect().height < 44)]), [36, true]);
  igual("y la ayuda de las flechas habla del clic derecho", await page.evaluate(() => {
    const h = document.getElementById("arrows-hint");
    return [h.querySelector(".solo-raton").checkVisibility(), h.querySelector(".solo-tactil").checkVisibility()];
  }), [true, false]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: R.CHROME });
  try {
    await pruebaCelular(browser);
    await pruebaProfeCelular(browser);
    await pruebaProfeComputadora(browser);
    await pruebaPreguntaEnCelular(browser);
    await pruebaComputadora(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: la clase se usa bien en el celular.");
  process.exit(fallos ? 1 : 0);
})();
