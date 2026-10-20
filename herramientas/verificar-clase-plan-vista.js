#!/usr/bin/env node
/* «👁 Vista previa» en cada posición del plan de clase.

   El profe da la clase con su plan al lado (pestaña «Mi plan» de sesion.html) y
   cada posición solo ofrecía mandarla a la clase («Al tablero», «Jugar
   votando», «Calentamiento», «Preguntar»): para saber CUÁL era había que
   ponerla en el tablero de todos. La vista previa la dibuja en su panel, igual
   que en Táctica y Archivos (el lote `crearVistaPreviaLote`), sin tocar la clase.

   Se comprueba en un navegador, con el doble de verificar-clase-registrada.js:

   - que cada posición traiga su botón, cerrado (`aria-expanded="false"`) y con
     su tablero escondido, y que una lección no lo traiga;
   - que abrirla pinte el tablero de ESA posición (64 casillas, sus piezas), diga
     de quién es la jugada y se vea de verdad (`checkVisibility`);
   - que mirarla NO escriba nada en la clase (ni `game_state` ni preguntas) y
     que el botón diga «Ocultar» al abrirse y vuelva a esconderla;
   - que «Ver todas las posiciones» las abra todas, se acuerde, y que un plan sin
     posiciones no lo muestre.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-plan-vista.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const HOY = new Date().toISOString();

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);

const LUCENA = "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1";
const PHILIDOR = "4k3/8/8/8/8/8/4K3/8 b - - 0 1";
const fila = (id) => '#plan-items li[data-plan-item="' + id + '"]';

async function abrirPlan(browser, items) {
  const r = await abrir(browser, "u-profe", CLASE, {
    planes_clase: [{ id: "pl1", profesor_id: "u-profe", titulo: "Finales", notas: null, created_at: HOY }],
    plan_items: items,
  });
  await r.page.waitForFunction(() => document.querySelectorAll("#plan-select option").length > 1, null, { timeout: 10000 });
  await r.page.evaluate(() => activateTeacherTab("plan"));
  await r.page.selectOption("#plan-select", "pl1");
  await r.page.waitForFunction(() => document.querySelectorAll("#plan-items li[data-plan-item]").length > 0, null, { timeout: 5000 });
  return r;
}

async function pruebaVistaPrevia(browser) {
  console.log("\n=== Vista previa de cada posición del plan ===");
  const { page, ctx, errores } = await abrirPlan(browser, [
    { id: "it1", plan_id: "pl1", tipo: "posicion", titulo: "Lucena", fen: LUCENA, orden: 0 },
    { id: "it2", plan_id: "pl1", tipo: "posicion", titulo: "Philidor", fen: PHILIDOR, orden: 1 },
    { id: "it3", plan_id: "pl1", tipo: "leccion", titulo: "Lección", curso: "los-100-finales", leccion: 0, orden: 2 },
  ]);
  const btn = (id) => fila(id) + " button:has-text('Vista previa')";
  const wrap = (id) => fila(id) + " .example-board";

  igual("cada posición trae su botón, cerrado", await page.evaluate(() =>
    [...document.querySelectorAll("#plan-items li")].map((li) => {
      const b = [...li.querySelectorAll("button")].find((x) => x.textContent.includes("Vista previa"));
      return b ? b.getAttribute("aria-expanded") : null;
    })), ["false", "false", null]);
  igual("y sin dibujar nada todavía", await page.evaluate(() => document.querySelectorAll("#plan-items .example-board").length), 0);

  await page.click(btn("it1"));
  await page.waitForSelector(wrap("it1"), { timeout: 5000 });
  igual("abrirla dibuja su tablero y se ve", await seVe(page, wrap("it1")), true);
  igual("de 64 casillas", await page.evaluate((s) => document.querySelector(s).querySelectorAll(".example-sq").length, wrap("it1")), 64);
  // La casilla se dice con el alfabeto del sitio («bella 8»), no con la letra suelta.
  igual("con las piezas de ESA posición (rey blanco en b8)", await page.evaluate((s) =>
    document.querySelector(s).querySelector('[data-square="b8"]').getAttribute("aria-label"), wrap("it1")), "bella 8, rey blanco");
  igual("dice de quién es la jugada", await page.evaluate((s) =>
    document.querySelector(s).parentElement.textContent.includes("Juegan blancas"), wrap("it1")), true);
  igual("el botón pasa a «Ocultar» y avisa que está abierto", await page.evaluate((s) => {
    const b = document.querySelector(s); return [b.textContent, b.getAttribute("aria-expanded")];
  }, "#plan-items li[data-plan-item='it1'] button[aria-expanded]"), ["🙈 Ocultar", "true"]);
  igual("la otra posición sigue cerrada", await page.evaluate(() => document.querySelectorAll("#plan-items li[data-plan-item='it2'] .example-board").length), 0);

  igual("mirarla no escribe nada en la clase", await page.evaluate(() =>
    window.__inserts.concat(window.__updates).filter((x) => x.tabla === "game_state" || x.tabla === "questions").length), 0);

  await page.click(fila("it1") + " button[aria-expanded]");
  igual("«Ocultar» la esconde", await seVe(page, wrap("it1")), false);

  await page.click(btn("it2"));
  await page.waitForSelector(wrap("it2"), { timeout: 5000 });
  igual("la de las negras lo dice", await page.evaluate((s) =>
    document.querySelector(s).parentElement.textContent.includes("Juegan negras"), wrap("it2")), true);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaVerTodas(browser) {
  console.log("\n=== «Ver todas las posiciones» ===");
  let r = await abrirPlan(browser, [
    { id: "it1", plan_id: "pl1", tipo: "posicion", titulo: "Lucena", fen: LUCENA, orden: 0 },
    { id: "it2", plan_id: "pl1", tipo: "posicion", titulo: "Philidor", fen: PHILIDOR, orden: 1 },
  ]);
  igual("el interruptor está", await seVe(r.page, "#plan-barra button"), true);
  igual("y dice lo que va a hacer", await r.page.textContent("#plan-barra button"), "👁 Ver todas las posiciones");
  await r.page.click("#plan-barra button");
  await r.page.waitForFunction(() => document.querySelectorAll("#plan-items .example-board").length === 2, null, { timeout: 5000 });
  igual("las abre todas", await r.page.evaluate(() =>
    [...document.querySelectorAll("#plan-items .example-board")].map((b) => b.checkVisibility())), [true, true]);
  igual("y cambia su rótulo", await r.page.textContent("#plan-barra button"), "🙈 Ocultar las posiciones");
  await r.page.click("#plan-barra button");
  igual("al apretarlo otra vez las esconde", await r.page.evaluate(() =>
    [...document.querySelectorAll("#plan-items .example-board")].map((b) => b.checkVisibility())), [false, false]);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();

  r = await abrirPlan(browser, [
    { id: "it3", plan_id: "pl1", tipo: "leccion", titulo: "Lección", curso: "los-100-finales", leccion: 0, orden: 0 },
  ]);
  igual("un plan sin posiciones no ofrece verlas", await r.page.evaluate(() => document.querySelectorAll("#plan-barra button").length), 0);
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaVistaPrevia(browser);
    await pruebaVerTodas(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
