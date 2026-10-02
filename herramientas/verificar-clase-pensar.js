#!/usr/bin/env node
/* Tiempo para pensar: una cuenta regresiva que ve toda la clase.

   El profe elige cuánto (y, si quiere, qué pensar) en «El tablero — lo ve
   toda la clase» y aprieta «⏳ Tiempo para pensar». Queda en
   game_state.pensar ({at, segundos, texto}); la hora de arranque la cambia la
   base por la suya y solo el profe lo pone (protect_game_state_teacher_
   columns, comprobado impersonando: sumar tiempo conserva el arranque, una
   forma rara la rechaza el CHECK y el alumno con el control no lo toca).

   Se comprueba:
   - la cuenta (js/pregunta-clase.js), sin navegador;
   - que el profe mande {at, segundos, texto}, que vea el reloj, que «+30
     segundos» mande el mismo «at» con más tiempo, que «Terminar ya» lo deje
     en null y que, ya terminado, «Elegir a alguien» lo quite y sortee;
   - que el alumno vea el reloj y qué pensar (de verdad, no el atributo), sin
     los botones del profe, que se le diga en voz al empezar y al terminar, que
     el aviso diga que se acabó y después se vaya solo, y que nunca escriba
     pensar.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-pensar.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (pensar) => ({ id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar });
const hace = (seg) => new Date(Date.now() - seg * 1000).toISOString();
const pensares = (page) => page.evaluate(() =>
  window.__updates.filter((u) => u.tabla === "game_state" && "pensar" in u.campos).map((u) => u.campos.pensar));

function pruebaCuenta() {
  console.log("\n=== La cuenta ===");
  const w = {};
  new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "pregunta-clase.js"), "utf8"))(w);
  const P = w.PreguntaClase;
  const p = { at: new Date(0).toISOString(), segundos: 60 };
  igual("al empezar quedan todos", P.estadoPensar(p, 0), { quedan: 60, termino: false });
  igual("medio segundo antes del final, queda 1", P.estadoPensar(p, 59500), { quedan: 1, termino: false });
  igual("al pasar, se acabó", P.estadoPensar(p, 61000), { quedan: 0, termino: true });
  igual("y después se va solo", P.estadoPensar(p, 69000), null);
  igual("sin tiempo, nada", P.estadoPensar(null, 0), null);
  igual("el tiempo dicho", [P.textoDeTiempo(120), P.textoDeTiempo(90), P.textoDeTiempo(45)],
    ["2 minutos", "1 minuto y 30 segundos", "45 segundos"]);
}

async function pruebaProfe(browser) {
  console.log("\n=== El profe da tiempo para pensar ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila(null)] });
  await page.waitForSelector("#pensar-abrir-btn", { state: "visible", timeout: 10000 });
  /* «⏳ Tiempo para pensar» es un botón que abre dónde elegir el tiempo: cerrado no
     ocupa lugar debajo del tablero, y dice si está abierto. */
  igual("cerrado, solo se ve el botón", [await seVe(page, "#pensar-abrir-btn"), await seVe(page, "#pensar-btn"),
    await page.getAttribute("#pensar-abrir-btn", "aria-expanded")], [true, false, "false"]);
  await page.click("#pensar-abrir-btn");
  igual("al tocarlo se abre, con el foco en el tiempo", [await seVe(page, "#pensar-btn"),
    await page.getAttribute("#pensar-abrir-btn", "aria-expanded"), await page.evaluate(() => document.activeElement.id)],
    [true, "true", "pensar-segundos"]);
  await page.selectOption("#pensar-segundos", "120");
  await page.fill("#pensar-texto", "¿Cuál es el plan de las blancas?");
  await page.click("#pensar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.pensar), null, { timeout: 5000 });
  const p1 = (await pensares(page))[0];
  igual("manda segundos y qué pensar", [p1.segundos, p1.texto, typeof p1.at], [120, "¿Cuál es el plan de las blancas?", "string"]);
  igual("y al empezar la cuenta se vuelve a cerrar", [await seVe(page, "#pensar-btn"),
    await page.getAttribute("#pensar-abrir-btn", "aria-expanded")], [false, "false"]);
  igual("el aviso se ve", await seVe(page, "#pensar-aviso-caja"), true);
  igual("con el reloj", /^[12]:[0-5]\d$/.test(await page.textContent("#pensar-reloj")), true);
  igual("y qué pensar", await page.textContent("#pensar-que"), "¿Cuál es el plan de las blancas?");
  igual("con sus botones", [await seVe(page, "#pensar-mas-btn"), await seVe(page, "#pensar-terminar-btn"), await seVe(page, "#pensar-elegir-btn")], [true, true, false]);

  await page.click("#pensar-mas-btn");
  await page.waitForFunction(() => window.__updates.filter((u) => u.tabla === "game_state" && "pensar" in u.campos).length === 2, null, { timeout: 5000 });
  const p2 = (await pensares(page))[1];
  igual("«+30 segundos» alarga con el mismo arranque", [p2.segundos, p2.at === p1.at], [150, true]);

  await page.click("#pensar-terminar-btn");
  await page.waitForFunction(() => window.__updates.filter((u) => u.tabla === "game_state" && "pensar" in u.campos).length === 3, null, { timeout: 5000 });
  igual("«Terminar ya» lo deja en null", (await pensares(page))[2], null);
  igual("y el aviso se va", await seVe(page, "#pensar-aviso-caja"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaProfeAlTerminar(browser) {
  console.log("\n=== Se acabó: el profe elige a alguien ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila({ at: hace(61), segundos: 60, texto: null })] });
  await page.waitForFunction(() => !document.getElementById("pensar-aviso-caja").hidden, null, { timeout: 10000 });
  igual("dice que se acabó", await seVe(page, "#pensar-fin"), true);
  igual("sin reloj", await seVe(page, "#pensar-reloj"), false);
  igual("y ofrece elegir a alguien", await seVe(page, "#pensar-elegir-btn"), true);
  igual("sin sumar ni terminar", [await seVe(page, "#pensar-mas-btn"), await seVe(page, "#pensar-terminar-btn")], [false, false]);
  await page.evaluate(() => { window.__entraAlumno(); });
  await page.click("#pensar-elegir-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.elegido), null, { timeout: 5000 });
  igual("quita el aviso", (await pensares(page)).pop(), null);
  igual("y sortea entre los conectados", await page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "game_state" && u.campos.elegido).pop().campos.elegido.id), "u-ana");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna ve la cuenta regresiva ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ at: hace(1), segundos: 30, texto: "Busca el mate" })] });
  await page.waitForFunction(() => !document.getElementById("pensar-aviso-caja").hidden, null, { timeout: 10000 });
  igual("el aviso se ve de verdad", await seVe(page, "#pensar-aviso-caja"), true);
  igual("con el reloj", /^0:(29|30|28)$/.test(await page.textContent("#pensar-reloj")), true);
  igual("y qué pensar", await page.textContent("#pensar-que"), "Busca el mate");
  igual("sin los botones del profe", await seVe(page, "#pensar-profe-acciones"), false);
  igual("se le dice en voz", await page.textContent("#pensar-voz"), "Tiempo para pensar: 30 segundos. Busca el mate");
  igual("el reloj no es región viva", await page.evaluate(() => document.getElementById("pensar-reloj").closest("[aria-live]")), null);

  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ at: hace(31), segundos: 30, texto: "Busca el mate" }));
  await page.waitForTimeout(150);
  igual("al terminar, dice que se acabó", await seVe(page, "#pensar-fin"), true);
  igual("y en voz", await page.textContent("#pensar-voz"), "Se acabó el tiempo para pensar.");
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ at: hace(45), segundos: 30, texto: null }));
  await page.waitForTimeout(1200);
  igual("después se va solo", await seVe(page, "#pensar-aviso-caja"), false);
  igual("la alumna nunca escribió pensar", (await pensares(page)).length, 0);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  try { pruebaCuenta(); } catch (e) { console.log("  ✗ se cayó: " + (e && e.stack || e)); fallos += 1; }
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfe(browser);
    await pruebaProfeAlTerminar(browser);
    await pruebaAlumna(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: toda la clase ve el tiempo para pensar y solo el profe lo pone.");
  process.exit(fallos ? 1 : 0);
})();
