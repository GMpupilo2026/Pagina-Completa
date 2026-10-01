#!/usr/bin/env node
/* Las herramientas del profe en grande, en una ventana por encima del tablero.
 *
 * En la columna de 320 px, con letra de 11-12 px, a veces cuesta encontrar lo
 * que se busca. «🔎 Herramientas en grande» vuelve esa misma columna una
 * ventana encima del tablero, con todo más grande. Lo que se rompe acá no da
 * ningún error: la ventana se abre detrás del encabezado, la letra no crece,
 * el panel que abre un botón queda tapado o el Tab se escapa al tablero de
 * atrás. Se comprueba, midiendo la pantalla y no las clases:
 *
 *   - que la ventana tape de verdad el tablero (el punto del centro del
 *     tablero es de la ventana) y que se vea encima del encabezado;
 *   - que los botones se vean más grandes que en la columna;
 *   - que lo de atrás quede inerte, y que Esc y «Volver al tablero» la cierren
 *     y devuelvan el foco al botón que la abrió;
 *   - que un botón de la barra («El tablero», «Tu material») la cierre, para
 *     ver lo que hizo;
 *   - que se pueda cambiar de pestaña adentro sin que se cierre;
 *   - que en el celular nada se salga a lo ancho;
 *   - que a la alumna no se le pinte el botón.
 *
 * Con el sitio en localhost:8777 y playwright:
 *     node herramientas/verificar-herramientas-grandes.js                    */
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir, igual, CHROME } = require("./verificar-clase-registrada.js");

const CLASE = { id: "s-1", title: null, created_by: "u-profe", ended_at: null,
                started_at: "2026-09-20T15:00:00Z", notes: null };

const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return !!el && el.checkVisibility();
}, sel);
const alto = (page, sel) => page.evaluate((s) => Math.round(document.querySelector(s).getBoundingClientRect().height), sel);
// ¿De quién es lo que se ve en el centro del tablero?
const centroDelTablero = (page) => page.evaluate(() => {
  const r = document.getElementById("chessboard").getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, Math.min(r.top + r.height / 2, innerHeight - 5));
  return el && el.closest("#herramientas-profe") ? "la ventana" : "otra cosa";
});

async function pruebaProfe(browser) {
  console.log("\n=== El profe abre sus herramientas en grande ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE);
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.waitForSelector("#grandes-abrir-btn", { state: "visible", timeout: 10000 });

  igual("el botón se ve", await seVe(page, "#grandes-abrir-btn"), true);
  igual("la barra de la ventana no se ve con la ventana cerrada", await seVe(page, "#grandes-barra"), false);
  igual("antes de abrir, el centro del tablero es el tablero", await centroDelTablero(page), "otra cosa");
  const antes = await alto(page, "#reset-board-btn");

  await page.click("#grandes-abrir-btn");
  igual("abierta: tapa el tablero", await centroDelTablero(page), "la ventana");
  igual("y también el encabezado", await page.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, 10);
    return el && el.closest("#herramientas-profe") ? "la ventana" : "otra cosa";
  }), "la ventana");
  igual("se ve «Volver al tablero»", await seVe(page, "#grandes-cerrar-btn"), true);
  igual("y adentro no se repite el botón que la abrió", await seVe(page, "#grandes-abrir-btn"), false);
  const despues = await alto(page, "#reset-board-btn");
  igual("los botones son más grandes (al menos 1,3 veces)", despues >= antes * 1.3 ? "sí" : antes + " → " + despues, "sí");
  igual("es un diálogo con su título", await page.evaluate(() => {
    const a = document.getElementById("herramientas-profe");
    return [a.getAttribute("role"), a.getAttribute("aria-modal"), a.getAttribute("aria-labelledby")];
  }), ["dialog", "true", "grandes-titulo"]);
  igual("el foco entra a la ventana", await page.evaluate(() => document.activeElement.id), "grandes-titulo");
  igual("lo de atrás queda inerte", await page.evaluate(() =>
    [document.getElementById("header").inert, document.querySelector(".proyector-columna").inert]), [true, true]);
  igual("el botón dice que está abierta", await page.getAttribute("#grandes-abrir-btn", "aria-expanded"), "true");

  // Cambiar de pestaña adentro no la cierra.
  await page.click("#teacher-tab-alumnos");
  igual("cambiar de pestaña no la cierra", await centroDelTablero(page), "la ventana");
  igual("y la pestaña se abrió", await seVe(page, "#students-panel"), true);

  await page.keyboard.press("Escape");
  igual("Esc la cierra", await centroDelTablero(page), "otra cosa");
  igual("y el foco vuelve al botón", await page.evaluate(() => document.activeElement.id), "grandes-abrir-btn");
  igual("lo de atrás deja de estar inerte", await page.evaluate(() =>
    [document.getElementById("header").inert, document.querySelector(".proyector-columna").inert]), [false, false]);
  igual("los botones vuelven a su tamaño", await alto(page, "#reset-board-btn"), antes);
  igual("la pestaña elegida adentro sigue abierta", await seVe(page, "#students-panel"), true);

  await page.click("#grandes-abrir-btn");
  await page.click("#grandes-cerrar-btn");
  igual("«Volver al tablero» la cierra", await centroDelTablero(page), "otra cosa");

  // Un botón de la barra hace su efecto fuera: se vuelve al tablero.
  await page.click("#grandes-abrir-btn");
  await page.click("#clear-marks-btn");
  igual("«🧹 Flechas» la cierra para ver el tablero", await centroDelTablero(page), "otra cosa");
  if (await page.evaluate(() => window.HerramientasGrandes.abierta())) await page.keyboard.press("Escape");
  await page.click("#grandes-abrir-btn");
  await page.click("#toggle-archivos-btn");
  igual("«📂 Archivos» la cierra", await centroDelTablero(page), "otra cosa");
  igual("y su panel se ve", await seVe(page, "#archivos-panel"), true);

  igual("sin errores en consola", errores.filter((e) => !/Failed to load resource/.test(e)).join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaCelular(browser) {
  console.log("\n=== En el celular ===");
  const { page, ctx } = await abrir(browser, "u-profe", CLASE);
  await page.setViewportSize({ width: 375, height: 740 });
  await page.waitForSelector("#grandes-abrir-btn", { state: "visible", timeout: 10000 });
  await page.click("#grandes-abrir-btn");
  for (const t of ["plan", "alumnos", "controles"]) {
    await page.click("#teacher-tab-" + t);
    igual("pestaña " + t + ": nada se sale a lo ancho", await page.evaluate(() => {
      const a = document.getElementById("herramientas-profe");
      return a.scrollWidth <= a.clientWidth + 1;
    }), true);
  }
  igual("se ve «Volver al tablero» sin bajar", await page.evaluate(() => {
    const r = document.getElementById("grandes-cerrar-btn").getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
  }), true);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== A la alumna, nada de esto ===");
  const { page, ctx } = await abrir(browser, "u-ana", CLASE, null, { modoSencillo: null });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 10000 });
  await page.waitForTimeout(500);
  igual("no se le pinta el botón", await seVe(page, "#grandes-abrir-btn"), false);
  igual("ni la barra de la ventana", await seVe(page, "#grandes-barra"), false);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfe(browser);
    await pruebaCelular(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  const fallos = require("./verificar-clase-registrada.js").fallos();
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: las herramientas se abren en grande y se cierran.");
  process.exit(fallos ? 1 : 0);
})();
