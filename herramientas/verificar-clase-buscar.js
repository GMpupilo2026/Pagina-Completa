#!/usr/bin/env node
/* «¿Qué quieres hacer?»: el buscador de herramientas del profe en la clase en
 * vivo (js/clase-buscar.js).
 *
 * Lo que se rompe acá no da ningún error: el buscador ofrece una herramienta
 * que lleva a un botón escondido, se queda en otra pestaña, aprieta por su
 * cuenta algo que le llega a toda la clase, o se le pinta a la alumna. Se
 * comprueba, mirando la pantalla:
 *
 *   - que al profe se le vea y a la alumna no;
 *   - que buscar «ronda» deje la ronda rápida y que Enter abra la pestaña
 *     Preguntar, despliegue su caja y deje el foco en ella, SIN mandar nada;
 *   - que con flechas se elija otra, y que Escape borre;
 *   - que en modo sencillo una herramienta de otra pestaña abra todas;
 *   - que Ctrl + K traiga el buscador desde cualquier parte de la clase;
 *   - que no ofrezca lo que no está (Abrir la clase, con la clase abierta);
 *   - que cada herramienta del catálogo apunte a un elemento que existe.
 *
 * Con el sitio en localhost:8777 y playwright:
 *     node herramientas/verificar-clase-buscar.js                            */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir, igual, CHROME } = require("./verificar-clase-registrada.js");

const CLASE = { id: "s-1", title: null, created_by: "u-profe", ended_at: null,
                started_at: "2026-09-20T15:00:00Z", notes: null };

const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return !!el && el.checkVisibility();
}, sel);
const opciones = (page) => page.evaluate(() =>
  [...document.querySelectorAll("#buscar-herramienta-lista [role=option]")].map((li) => li.firstChild.textContent));

function pruebaCatalogo() {
  console.log("\n=== El catálogo ===");
  const html = fs.readFileSync(path.join(__dirname, "..", "sesion.html"), "utf8");
  global.window = {};
  require("../js/clase-buscar.js");
  const faltan = window.ClaseBuscar.HERRAMIENTAS.filter((h) => !html.includes('id="' + h.destino + '"')).map((h) => h.destino);
  igual("cada herramienta lleva a un elemento que existe en sesion.html", faltan, []);
  const repetidas = window.ClaseBuscar.HERRAMIENTAS.map((h) => h.destino).filter((d, i, a) => a.indexOf(d) !== i);
  igual("y ninguna está dos veces", repetidas, []);
  delete global.window;
}

async function pruebaProfe(browser) {
  console.log("\n=== El profe busca una herramienta ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE);
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.waitForSelector("#buscar-herramienta-campo", { state: "visible", timeout: 10000 });
  igual("se le ve el buscador", await seVe(page, "#buscar-herramienta-campo"), true);
  igual("tiene su etiqueta escrita", await page.evaluate(() =>
    document.querySelector("label[for=buscar-herramienta-campo]").textContent.trim()), "🔍 ¿Qué quieres hacer?");

  // Arranca en otra pestaña para ver que la cambia.
  await page.click("#teacher-tab-plan");
  igual("la caja de la ronda arranca cerrada", await page.evaluate(() => document.getElementById("ronda-caja").open), false);
  await page.fill("#buscar-herramienta-campo", "ronda");
  igual("«ronda» deja la ronda rápida", await opciones(page), ["Ronda rápida"]);
  igual("la lista dice que está abierta", await page.getAttribute("#buscar-herramienta-campo", "aria-expanded"), "true");
  igual("y la primera queda marcada", await page.getAttribute("#buscar-herramienta-campo", "aria-activedescendant"), "buscar-herramienta-op-0");
  await page.keyboard.press("Enter");
  igual("Enter abre la pestaña Preguntar", await seVe(page, "#question-panel"), true);
  igual("y su pestaña queda elegida", await page.getAttribute("#teacher-tab-preguntar", "aria-selected"), "true");
  igual("despliega la caja de la ronda", await page.evaluate(() => document.getElementById("ronda-caja").open), true);
  igual("y deja el foco en ella", await page.evaluate(() => document.activeElement.closest("#ronda-caja") ? "en la ronda" : document.activeElement.id), "en la ronda");
  igual("la lista se cerró y el campo quedó vacío", await page.evaluate(() =>
    [document.getElementById("buscar-herramienta-lista").hidden, document.getElementById("buscar-herramienta-campo").value]), [true, ""]);

  // No aprieta nada: «Preguntar: ¿qué jugarías?» no manda la pregunta.
  const antes = await page.evaluate(() => (window.__inserts.length + window.__updates.length + (window.__difundir || []).length));
  await page.fill("#buscar-herramienta-campo", "que jugarias");
  await page.keyboard.press("Enter");
  igual("lleva a «¿qué jugarías?» con el foco", await page.evaluate(() => document.activeElement.id), "ask-question-btn");
  igual("y no la manda: la pregunta no se abrió", await seVe(page, "#close-question-btn"), false);
  igual("ni se escribió nada", await page.evaluate(() => (window.__inserts.length + window.__updates.length + (window.__difundir || []).length)), antes);

  // Flechas y Escape.
  await page.fill("#buscar-herramienta-campo", "pregunta");
  const varias = await opciones(page);
  igual("«pregunta» deja varias", varias.length > 2, true);
  await page.keyboard.press("ArrowDown");
  igual("la flecha marca la segunda", await page.getAttribute("#buscar-herramienta-campo", "aria-activedescendant"), "buscar-herramienta-op-1");
  await page.keyboard.press("Escape");
  igual("Escape borra y cierra", await page.evaluate(() =>
    [document.getElementById("buscar-herramienta-campo").value, document.getElementById("buscar-herramienta-lista").hidden]), ["", true]);

  // Lo que no está no se ofrece.
  await page.fill("#buscar-herramienta-campo", "abrir clase");
  igual("con la clase abierta no ofrece «Abrir la clase»", (await opciones(page)).includes("Abrir la clase"), false);
  await page.fill("#buscar-herramienta-campo", "zzzz");
  await page.waitForTimeout(450);
  igual("sin resultados lo dice", await page.textContent("#buscar-herramienta-estado"),
    "Ninguna herramienta con «zzzz». Prueba con otra palabra: ronda, pregunta, puntos, proyector…");
  await page.keyboard.press("Escape");

  // Ctrl + K desde cualquier parte.
  await page.focus("#flip-board-btn");
  await page.keyboard.press("Control+k");
  igual("Ctrl + K trae el buscador", await page.evaluate(() => document.activeElement.id), "buscar-herramienta-campo");
  igual("y sigue en la clase", await page.evaluate(() => location.pathname), "/sesion.html");

  // Una herramienta del tablero (fuera de las pestañas).
  await page.fill("#buscar-herramienta-campo", "proyector");
  await page.keyboard.press("Enter");
  igual("«proyector» lleva a su botón, sin abrir ninguna ventana", [await page.evaluate(() => document.activeElement.id), ctx.pages().length],
    ["proyector-btn", 1]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaSencillo(browser) {
  console.log("\n=== En modo sencillo ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, null, { modoSencillo: "1" });
  await page.waitForSelector("#buscar-herramienta-campo", { state: "visible", timeout: 10000 });
  igual("la pestaña Preguntar está escondida", await seVe(page, "#teacher-tab-preguntar"), false);
  await page.fill("#buscar-herramienta-campo", "kahoot");
  igual("igual encuentra el cuestionario", await opciones(page), ["Cuestionario al estilo Kahoot"]);
  await page.keyboard.press("Enter");
  igual("y abre todas las herramientas para llegar", [await seVe(page, "#teacher-tab-preguntar"), await seVe(page, "#question-panel")], [true, true]);
  igual("con el foco en el cuestionario", await page.evaluate(() => !!document.activeElement.closest("#cuestionario-caja")), true);
  await page.fill("#buscar-herramienta-campo", "pdf");
  await page.keyboard.press("Enter");
  igual("«Tu material» también se alcanza", await page.evaluate(() => document.activeElement.id), "toggle-pdf-btn");
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== A la alumna, nada ===");
  const { page, ctx } = await abrir(browser, "u-ana", CLASE, null, { modoSencillo: null });
  await page.waitForTimeout(800);
  igual("no se le pinta el buscador", await seVe(page, "#buscar-herramienta"), false);
  await ctx.close();
}

(async () => {
  pruebaCatalogo();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfe(browser);
    await pruebaSencillo(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  const fallos = require("./verificar-clase-registrada.js").fallos();
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: el buscador lleva a cada herramienta sin apretarla.");
  process.exit(fallos ? 1 : 0);
})();
