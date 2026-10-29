#!/usr/bin/env node
/* La cámara en la clase en vivo: el profe juega en su tablero de verdad, con
   la cámara del celular (camara-tablero.html) transmitiendo, y cada jugada
   que anota entra sola al tablero de la clase (js/clase-camara.js).

   Se comprueba, en sesion.html de verdad con el doble de Supabase:
   - que el profe tiene «🎥 Cámara» y la alumna no;
   - que el panel se abre (y lo dice aria-expanded), pide un código válido y,
     al conectarse, le pide a la cámara su partida;
   - que las jugadas de la cámara entran a la partida de la clase
     (game_state.moves, por la misma puerta que el clic), también lo que llega
     solo con lo nuevo;
   - que una partida distinta no toca nada y lo dice;
   - que mientras el profe repasa una jugada vieja, esperan, y entran al
     volver al vivo;
   - y que «Desconectar» deja de escuchar.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-camara.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const fila = () => ({ id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, sticker: null });

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
// Las jugadas que la clase guardó por última vez en game_state.
const jugadasDeLaClase = (page) => page.evaluate(() => {
  const u = window.__updates.filter((x) => x.tabla === "game_state" && Array.isArray(x.campos.moves)).pop();
  return u ? u.campos.moves : [];
});
const msg = (page) => page.textContent("#camara-clase-msg");
const CODIGO = "kamarxyz";
const llega = (page, payload) => page.evaluate((p) => window.__difundir("estado", Object.assign({ t: Date.now() }, p)), payload);

async function pruebaProfe(browser) {
  console.log("\n=== El profe juega en su tablero de verdad ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.waitForSelector("#toggle-camara-btn", { state: "visible", timeout: 10000 });
  igual("el profe tiene «🎥 Cámara»", (await page.textContent("#toggle-camara-btn")).trim(), "🎥 Cámara");
  await page.click("#toggle-camara-btn");
  igual("abre su panel, y el botón lo dice", [await seVe(page, "#camara-clase-panel"), await page.getAttribute("#toggle-camara-btn", "aria-expanded")], [true, "true"]);
  igual("el panel dice cómo usarlo, con el enlace a la cámara", await page.getAttribute("#camara-clase-panel a", "href"), "camara-tablero.html");
  await page.fill("#camara-clase-codigo", "no-sirve");
  await page.click("#camara-clase-conectar button[type=submit]");
  await page.waitForFunction(() => document.getElementById("camara-clase-msg").textContent, null, { timeout: 5000 }).catch(() => {});
  igual("un código que no es de la cámara se dice", (await msg(page)).startsWith("Ese código no es de la cámara"), true);
  await page.fill("#camara-clase-codigo", CODIGO);
  await page.click("#camara-clase-conectar button[type=submit]");
  await page.waitForFunction(() => /Conectada/.test(document.getElementById("camara-clase-msg").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("al conectarse le pide su partida a la cámara", await page.evaluate(() => (window.__difusiones || []).some((d) => d.event === "pedir")), true);
  igual("y el botón queda marcado", await page.getAttribute("#toggle-camara-btn", "aria-pressed"), "true");

  await llega(page, { v: 1, pgn: "1. e4 e5", id: "cam-0", blancas: "", negras: "" });
  await page.waitForFunction(() => /Entr/.test(document.getElementById("camara-clase-msg").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("las jugadas de la cámara entran a la partida de la clase", await jugadasDeLaClase(page), ["e4", "e5"]);
  igual("y lo dice", await msg(page), "Entraron 2 jugadas de la cámara.");
  await llega(page, { v: 2, id: "cam-0", desde: 2, san: ["Nf3"] });
  await page.waitForFunction(() => /Cf3/.test(document.getElementById("camara-clase-msg").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("lo que llega solo con lo nuevo, también (en algebraica española)", [await jugadasDeLaClase(page), await msg(page)], [["e4", "e5", "Nf3"], "Entró la jugada Cf3 de la cámara."]);
  await llega(page, { v: 1, pgn: "1. d4", id: "cam-1", blancas: "", negras: "" });
  await page.waitForTimeout(300);
  igual("una partida distinta no toca la de la clase, y lo dice", [await jugadasDeLaClase(page), (await msg(page)).startsWith("La cámara tiene otra partida")], [["e4", "e5", "Nf3"], true]);

  // El profe repasa una jugada vieja: lo de la cámara espera.
  await llega(page, { v: 1, pgn: "1. e4 e5 2. Nf3", id: "cam-0", blancas: "", negras: "" });
  await page.waitForTimeout(200);
  const atras = await page.$("#move-nav-prev");
  if (atras) {
    await atras.click();
    await llega(page, { v: 1, pgn: "1. e4 e5 2. Nf3 Nc6", id: "cam-0", blancas: "", negras: "" });
    await page.waitForTimeout(300);
    igual("repasando una jugada vieja, lo de la cámara espera (no se vuelve una variante)", [await jugadasDeLaClase(page), (await msg(page)).includes("cuando vuelvas a la partida en vivo")], [["e4", "e5", "Nf3"], true]);
    await page.click("#move-nav-last");
    await page.waitForFunction(() => /Cc6/.test(document.getElementById("camara-clase-msg").textContent), null, { timeout: 5000 }).catch(() => {});
    igual("y al volver al vivo, entra", await jugadasDeLaClase(page), ["e4", "e5", "Nf3", "Nc6"]);
  } else {
    console.log("  ✗ no encontré el botón para repasar una jugada anterior"); fallos += 1;
  }

  await page.click("#camara-clase-dejar");
  igual("«Desconectar» lo dice y deja el botón sin marcar", [(await msg(page)).startsWith("Desconectada"), await page.getAttribute("#toggle-camara-btn", "aria-pressed")], [true, "false"]);
  await page.click("#camara-clase-cerrar");
  igual("✕ cierra el panel", [await seVe(page, "#camara-clase-panel"), await page.getAttribute("#toggle-camara-btn", "aria-expanded")], [false, "false"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna no tiene la cámara ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila()] });
  await page.waitForTimeout(500);
  igual("ni el botón ni el panel", [await seVe(page, "#toggle-camara-btn"), await page.evaluate(() => !!document.getElementById("camara-clase-panel"))], [false, false]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfe(browser);
    await pruebaAlumna(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: las jugadas del tablero de verdad entran a la clase.");
  process.exit(fallos ? 1 : 0);
})();
