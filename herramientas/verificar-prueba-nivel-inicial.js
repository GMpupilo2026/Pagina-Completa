#!/usr/bin/env node
/* Comprueba la pregunta «¿Sabe jugar ajedrez?» de los formularios
 * (js/prueba-nivel-inicial.js), la que decide si un curso arranca desde cero.
 *
 * Dos partes:
 *   1. Sin navegador, las posiciones. Ninguna se puso a ojo: para cada pregunta
 *      se comprueba con chess.js que la opción marcada como buena es buena y que
 *      TODAS las demás son malas. Una prueba de reglas con una respuesta mal
 *      puesta no da ningún error: manda a lo básico a quien sí sabía. Y la
 *      calificación: qué se recomienda con cada cantidad de aciertos.
 *   2. En un navegador de verdad, formulario.html con un formulario que trae la
 *      pregunta: quien dice que no sabe no ve la prueba; quien dice que sabe la
 *      ve con sus siete tableros pintados; una pregunta sin contestar no deja
 *      mandar; y lo que llega a responder_formulario es la línea de texto con
 *      la recomendación.
 *
 * Uso:  node herramientas/verificar-prueba-nivel-inicial.js   [--sin-navegador]
 *       (el corredor levanta el sitio en el 8777; a mano:
 *        python3 -m http.server 8777 desde la raíz)
 */
"use strict";
const path = require("path");
const { Chess } = require("chess.js");
const P = require(path.join(__dirname, "..", "js", "prueba-nivel-inicial.js"));

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* Para cada opción, ¿es correcta según chess.js? Devuelve un arreglo de
   booleanos, uno por opción. */
function correctas(p) {
  const c = p.comprobar;
  const g = new Chess(p.fen);
  if (g.fen() !== p.fen) throw new Error(p.id + ": chess.js no acepta la posición tal cual");
  const legales = g.moves({ verbose: true });
  const sanDe = (san) => {
    const m = legales.find((x) => x.san.replace(/[+#]$/, "") === san);
    if (!m) throw new Error(p.id + ": " + san + " no es una jugada legal");
    return m.san;
  };
  if (c.tipo === "pieza_en") {
    return c.casillas.map((sq) => { const x = g.get(sq); return !!x && x.color + x.type === c.pieza; });
  }
  if (c.tipo === "destino") {
    const destinos = legales.filter((m) => m.from === c.desde).map((m) => m.to);
    return c.casillas.map((sq) => destinos.includes(sq));
  }
  if (c.tipo === "destinos") {
    const destinos = legales.filter((m) => m.from === c.desde).map((m) => m.to).sort().join(",");
    return c.conjuntos.map((cj) => cj.slice().sort().join(",") === destinos);
  }
  if (c.tipo === "quien_captura") {
    const tipos = [...new Set(legales.filter((m) => m.to === c.casilla && m.captured).map((m) => m.piece))];
    return c.piezas.map((t) => (t === null ? tipos.length === 0 : tipos.length === 1 && tipos[0] === t));
  }
  if (c.tipo === "jaque") return c.jugadas.map((s) => /\+$/.test(sanDe(s)));
  if (c.tipo === "mate") return c.jugadas.map((s) => /#$/.test(sanDe(s)));
  if (c.tipo === "enroque_atacado") {
    // Opciones: sí / en jaque / pasa por casilla atacada / pieza en medio.
    const puede = legales.some((m) => m.san === "O-O");
    const enJaque = g.in_check();
    const enMedio = !!g.get("f1") || !!g.get("g1");
    const sinAtacante = new Chess(p.fen);
    if (!sinAtacante.remove(c.atacante)) throw new Error(p.id + ": no hay pieza en " + c.atacante);
    const atacada = !puede && !enJaque && !enMedio && sinAtacante.moves().includes("O-O");
    return [puede, enJaque, atacada, enMedio];
  }
  throw new Error(p.id + ": comprobación desconocida " + c.tipo);
}

function pruebaPosiciones() {
  console.log("\n=== Las posiciones, contra chess.js ===");
  igual("son siete preguntas", P.PREGUNTAS.length, 7);
  const ids = new Set();
  P.PREGUNTAS.forEach((p) => {
    if (ids.has(p.id)) { console.log("  ✗ id repetido: " + p.id); fallos += 1; }
    ids.add(p.id);
    let marcas;
    try { marcas = correctas(p); } catch (e) { console.log("  ✗ " + e.message); fallos += 1; return; }
    igual(p.id + ": la única buena es «" + p.opciones[p.buena] + "»",
      marcas, p.opciones.map((_, j) => j === p.buena));
    igual(p.id + ": tantas opciones como comprobaciones", marcas.length, p.opciones.length);
  });
  // La buena no siempre en el mismo lugar: si no, se adivina sin saber.
  igual("la opción buena no está siempre en el mismo lugar",
    new Set(P.PREGUNTAS.map((p) => p.buena)).size > 1, true);
}

function pruebaCalificar() {
  console.log("\n=== La calificación ===");
  const todas = {};
  P.PREGUNTAS.forEach((p) => { todas[p.id] = p.buena; });
  const fallando = (n) => {
    const r = Object.assign({}, todas);
    P.PREGUNTAS.slice(0, n).forEach((p) => { r[p.id] = (p.buena + 1) % p.opciones.length; });
    return r;
  };
  igual("quien nunca jugó va a lo básico, sin prueba",
    P.calificar("nunca", {}).texto, "Empezar desde lo básico · Dice: No, nunca he jugado");
  igual("quien conoce las piezas pero no las mueve, también",
    P.calificar("piezas", todas).nivel, "basico");
  igual("7 de 7: puede empezar con base",
    P.calificar("mover", todas).texto, "Puede empezar con base · Dice: Sé mover las piezas · Prueba: 7 de 7");
  igual("6 de 7: también, y dice qué falló",
    P.calificar("juego", fallando(1)).texto,
    "Puede empezar con base · Dice: Sé mover y juego partidas completas · Prueba: 6 de 7 (falló: la posición inicial)");
  igual("5 de 7: sabe mover, pero a repasar", P.calificar("mover", fallando(2)).nivel, "repaso");
  igual("4 de 7: todavía repaso", P.calificar("mover", fallando(3)).nivel, "repaso");
  igual("3 de 7: lo que dijo no se sostiene, a lo básico", P.calificar("mover", fallando(4)).nivel, "basico");
  igual("una pregunta sin contestar cuenta como fallada",
    P.calificar("mover", Object.assign({}, todas, { mate: undefined })).aciertos, 6);
  igual("un dicho inventado no califica", P.calificar("experto", todas), null);
  igual("la línea cabe en una respuesta de formulario (≤ 2000)",
    P.calificar("mover", {}).texto.length < 2000, true);
}

/* --------------------------------------------------------------- navegador */
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const CAMPOS = [
  { id: "nombre", etiqueta: "Nombre completo", tipo: "texto", requerido: true, ayuda: "", opciones: [] },
  { id: "sabes_jugar_ajedrez", etiqueta: "¿Sabes jugar ajedrez?", tipo: "nivel_ajedrez", requerido: true, ayuda: "", opciones: [] },
];

function clienteFalso(campos) {
  return `
window.__rpc = [];
window.sb = {
  auth: { getSession: () => Promise.resolve({ data: { session: null } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  from: () => ({ select() { return this; }, eq() { return this; }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
  rpc: (n, args) => {
    window.__rpc.push({ nombre: n, args: args || null });
    const data = n === "formulario_publico"
      ? [{ id: "f-1", titulo: "Curso de ajedrez para principiantes", descripcion: "", grupo: "", campos: ${JSON.stringify(campos)}, cierra_el: null }]
      : n === "responder_formulario" ? { ok: true } : null;
    return Promise.resolve({ data, error: null });
  },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  storage: { from: () => ({}) },
};`;
}

async function abrir(browser, ruta, script) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: script }));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { ctx, page, errores };
}

async function pruebaPagina(browser) {
  console.log("\n=== formulario.html con la pregunta ===");
  const { ctx, page, errores } = await abrir(browser, "/formulario.html?f=curso", clienteFalso(CAMPOS));
  await page.waitForSelector("#formulario:not(.hidden)", { timeout: 20000 });
  const N = P.PREGUNTAS.length;
  const visible = () => page.evaluate(() => document.getElementById("campo-1-prueba").checkVisibility());

  igual("las cuatro respuestas de qué sabe, en un grupo con su leyenda",
    await page.evaluate(() => [document.querySelectorAll('input[name="campo-1-dicho"]').length,
      document.querySelector("#campo-1 legend").textContent.trim()]), [4, "¿Sabes jugar ajedrez? *"]);
  igual("de entrada no se ve la prueba", await visible(), false);

  await page.fill("#campo-0", "Ana Rojas");
  await page.check("#acepto-datos");
  await page.click("#enviar");
  igual("sin decir qué sabe, no deja mandar",
    await page.evaluate(() => [document.getElementById("msg").textContent,
      window.__rpc.filter((r) => r.nombre === "responder_formulario").length]),
    ["Falta contestar: ¿Sabes jugar ajedrez?", 0]);

  await page.check('input[name="campo-1-dicho"][value="mover"]');
  igual("si dice que sabe mover, aparece la prueba", await visible(), true);
  igual("con sus siete tableros pintados, cada uno con su posición",
    await page.evaluate(() => [...document.querySelectorAll('[id^="campo-1-tablero-"]')].map((t) =>
      t.querySelectorAll("button[data-square]").length === 64 && t.getBoundingClientRect().height > 100)),
    P.PREGUNTAS.map(() => true));
  igual("el tablero de la dama tiene la dama blanca en d1",
    await page.evaluate(() => !!document.querySelector('#campo-1-tablero-0 [data-square="d1"] span')), true);

  // Contesta todas bien menos la última, que deja en blanco.
  for (const p of P.PREGUNTAS.slice(0, -1)) await page.check(`input[name="campo-1-p-${p.id}"][value="${p.buena}"]`);
  await page.click("#enviar");
  igual("con una pregunta de la prueba en blanco, no deja mandar y lleva el foco ahí",
    await page.evaluate(() => [document.getElementById("msg").textContent, document.activeElement.name,
      window.__rpc.filter((r) => r.nombre === "responder_formulario").length]),
    ["Falta contestar la pregunta " + N + " de la prueba de ajedrez.", "campo-1-p-mate", 0]);

  const ultima = P.PREGUNTAS[N - 1];
  await page.check(`input[name="campo-1-p-${ultima.id}"][value="${(ultima.buena + 1) % 4}"]`);
  await page.click("#enviar");
  await page.waitForSelector("#listo:not(.hidden)");
  const envio = await page.evaluate(() => window.__rpc.find((r) => r.nombre === "responder_formulario").args.p_respuestas);
  igual("manda la línea con la recomendación, lo que dijo y lo que falló", envio, {
    nombre: "Ana Rojas",
    sabes_jugar_ajedrez: "Puede empezar con base · Dice: Sé mover las piezas · Prueba: 6 de 7 (falló: el jaque mate)",
  });
  igual("y a quien contestó le dice cómo le fue, sin las respuestas",
    await page.evaluate(() => [document.getElementById("listo-nivel").checkVisibility(), document.getElementById("listo-nivel").textContent]),
    [true, "Según tu prueba, ya sabes las reglas del ajedrez: puedes empezar con base."]);
  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await ctx.close();

  // Quien dice que nunca jugó manda sin prueba.
  const b = await abrir(browser, "/formulario.html?f=curso", clienteFalso(CAMPOS));
  await b.page.waitForSelector("#formulario:not(.hidden)", { timeout: 20000 });
  await b.page.fill("#campo-0", "Bruno Mena");
  await b.page.check('input[name="campo-1-dicho"][value="nunca"]');
  igual("quien nunca jugó no ve la prueba",
    await b.page.evaluate(() => document.getElementById("campo-1-prueba").checkVisibility()), false);
  await b.page.check("#acepto-datos");
  await b.page.click("#enviar");
  await b.page.waitForSelector("#listo:not(.hidden)");
  igual("y lo que llega dice que empieza desde lo básico",
    await b.page.evaluate(() => window.__rpc.find((r) => r.nombre === "responder_formulario").args.p_respuestas.sabes_jugar_ajedrez),
    "Empezar desde lo básico · Dice: No, nunca he jugado");
  b.errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await b.ctx.close();
}

(async () => {
  pruebaPosiciones();
  pruebaCalificar();
  if (!process.argv.includes("--sin-navegador")) {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ executablePath: CHROME });
    try { await pruebaPagina(browser); } finally { await browser.close(); }
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: cada pregunta tiene una sola respuesta buena y la página manda lo correcto.");
  process.exit(fallos ? 1 : 0);
})();
