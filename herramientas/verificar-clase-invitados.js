#!/usr/bin/env node
/* La clase vista por invitados sin cuenta (ver-clase.html y la sección
   «Que vean la clase sin cuenta» de sesion.html).

   Lo que se rompe callado acá: un invitado que puede mover o dibujar en el
   tablero, un enlace en la pantalla de la clase (tocarlo es salirse), entrar
   sin la casilla de la privacidad, una salida que no se anota (o que se anota
   dos veces por el blur y el visibilitychange de la misma salida), la
   advertencia que no sale, un bloqueado que sigue viendo el tablero al
   recargar, y al profe que no le llega el aviso. Y para quien no ve la
   pantalla: un aviso que no llega a la región viva ni a la voz, un recuadro
   que no aparece o que deja «mover», o la tecla Esc sacándolo de la clase.

   Las reglas de verdad —quién ve qué, el bloqueo, el freno, la IP— las pone la
   base y se probaron impersonando roles en SQL: ver «La clase vista por
   invitados sin cuenta» en docs/decisiones/clase-en-vivo.md. Acá el doble de
   ver-clase.html imita esas tres funciones.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-invitados.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME, BASE } = R;
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility({ visibilityProperty: true })); }, sel);

/* El doble de ver-clase.html: las cuatro funciones del invitado, con las
   mismas reglas que la base (dos salidas bloquean; dos avisos de la misma
   salida cuentan una vez; sin privacidad no se entra). */
function dobleInvitado(opciones) {
  return `
(function () {
  const O = ${JSON.stringify(opciones)};
  const D = window.__doble = { llamadas: [], salidas: 0, bloqueado: false, ultima: 0, abierta: O.abierta !== false, adaptado: !!O.adaptado,
    tablero: O.tablero || { start_fen: null, moves: ["e4", "e5", "Nf3"], vista: null, arrows: [{ from: "f3", to: "e5", color: "naranja" }], circles: [], pieces_hidden: false } };
  const r = (d) => Promise.resolve({ data: d, error: null });
  window.sb = { rpc(n, a) {
    D.llamadas.push({ n, a });
    if (n === "clase_invitado_info") return r(a.p_token === "tok-bueno" ? { valido: true, profesor: "Karina Rojas", abierta: D.abierta } : { valido: false });
    if (n === "clase_invitado_entrar") {
      if (!a.p_privacidad) return r({ error: "Para entrar tienes que aceptar la Política de privacidad." });
      return r({ secreto: "s-1", nombre: a.p_nombre, profesor: "Karina Rojas" });
    }
    if (n === "clase_invitado_ver") {
      if (a.p_secreto !== "s-1") return r({ estado: "fuera" });
      if (D.bloqueado) return r({ estado: "bloqueado", salidas: D.salidas });
      if (!D.abierta) return r({ estado: "esperando", salidas: D.salidas, adaptado: D.adaptado });
      return r({ estado: "ok", salidas: D.salidas, adaptado: D.adaptado, tablero: D.tablero });
    }
    // Como la base: la persona cambia su modo y la lista del profe lo ve.
    // «modoTarda»: la base guarda tarde, como cuando una consulta ya iba en camino.
    if (n === "clase_invitado_modo") {
      const poner = () => { if (a.p_secreto === "s-1" && !D.bloqueado) D.adaptado = !!a.p_adaptado; };
      if (D.modoTarda) setTimeout(poner, D.modoTarda); else poner();
      return r(null);
    }
    if (n === "clase_invitado_salio") {
      if (!D.bloqueado && Date.now() - D.ultima > 3000) { D.salidas += 1; D.ultima = Date.now(); D.bloqueado = D.salidas >= 2; }
      return r({ salidas: D.salidas, bloqueado: D.bloqueado });
    }
    return r(null);
  } };
})();`;
}

async function abrirInvitado(browser, hash, opciones, ctx0) {
  const ctx = ctx0 || await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } });
  if (!ctx0) {
    await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
    await ctx.route("**/js/supabase-client.js", (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: dobleInvitado(opciones || {}) }));
  }
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/ver-clase.html" + hash, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.getElementById("vc-cargando").checkVisibility(), null, { timeout: 15000 });
  return { page, ctx, errores };
}

const llamadas = (page, n) => page.evaluate((x) => window.__doble.llamadas.filter((l) => l.n === x), n);
// Salirse, como lo ve la página: se va el foco y la pestaña queda oculta.
async function salirse(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    window.dispatchEvent(new Event("blur"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}

async function pruebaEnlaceMalo(browser) {
  console.log("\n=== Un enlace apagado o inventado ===");
  const { page, ctx, errores } = await abrirInvitado(browser, "#t=inventado");
  igual("dice que el enlace ya no sirve", [await seVe(page, "#vc-fin"), await page.textContent("#vc-fin-titulo")], [true, "Este enlace ya no sirve"]);
  igual("y ofrece crear la cuenta", await seVe(page, '#vc-fin a[href="prueba-gratis.html"]'), true);
  igual("no pide el nombre", await seVe(page, "#vc-entrada"), false);
  igual("sin errores de la página", errores, []);
  await ctx.close();
}

async function pruebaInvitado(browser) {
  console.log("\n=== El invitado entra, mira y se sale ===");
  const { page, ctx, errores } = await abrirInvitado(browser, "#t=tok-bueno");
  igual("pide el nombre y dice de quién es la clase", [await seVe(page, "#vc-entrada"), await page.textContent("#vc-profe")], [true, "Karina Rojas"]);
  igual("la casilla de privacidad enlaza la política", await seVe(page, '#vc-entrada a[href="privacidad.html"]'), true);

  await page.fill("#vc-nombre", "Luis Mora");
  await page.click("#vc-entrar");
  await page.waitForTimeout(200);
  igual("sin marcar la privacidad no entra (ni llama a la base)", [await seVe(page, "#vc-clase"), (await llamadas(page, "clase_invitado_entrar")).length,
    await page.textContent("#vc-error")], [false, 0, "Para entrar tienes que aceptar la Política de privacidad."]);

  await page.check("#vc-acepto");
  await page.click("#vc-entrar");
  await page.waitForFunction(() => document.getElementById("vc-clase").checkVisibility(), null, { timeout: 5000 });
  const entrar = (await llamadas(page, "clase_invitado_entrar"))[0];
  igual("entra con su nombre y la versión de la política", [entrar.a.p_nombre, /^\d{4}-\d{2}-\d{2}$/.test(entrar.a.p_privacidad)], ["Luis Mora", true]);
  await page.waitForFunction(() => document.querySelector('#vc-tablero [data-square="e5"]'), null, { timeout: 5000 });
  igual("el tablero muestra la posición de la clase (caballo en f3)",
    await page.evaluate(() => /caballo blanco/i.test((document.querySelector('#vc-tablero [data-square="f3"]') || {}).getAttribute?.("aria-label") || "")), true);
  igual("con la flecha del profe", await page.evaluate(() => document.querySelectorAll("#vc-tablero svg line, #vc-tablero svg path, #vc-tablero svg polyline").length > 0), true);
  // El tablero es un «tablero de ajedrez» para el lector (js/tablero-accesible.js,
  // montado por ClaseAdaptada): es lo que busca Alt + Mayúscula + B.
  igual("el tablero se anuncia como tablero de ajedrez", await page.evaluate(() =>
    document.querySelector('[aria-roledescription="tablero de ajedrez"]') === document.getElementById("vc-tablero")), true);
  igual("dice de quién es el turno", await page.textContent("#vc-estado"), "Juegan las negras");
  igual("en la pantalla de la clase no hay NINGÚN enlace (ni el pie)",
    await page.evaluate(() => [...document.querySelectorAll("a[href]")].filter((a) => a.checkVisibility()).length), 0);

  // No se puede mover: tocar el peón de d7 y después d6 (jugada legal) no cambia nada.
  const casillas = () => page.evaluate(() => ["d7", "d6"].map((c) => document.querySelector('#vc-tablero [data-square="' + c + '"]').getAttribute("aria-label")));
  const antes = await casillas();
  await page.click('#vc-tablero [data-square="d7"]').catch(() => {});
  await page.click('#vc-tablero [data-square="d6"]').catch(() => {});
  igual("tocar el tablero no mueve nada (d7 → d6 es legal)", await casillas(), antes);

  // El profe muestra una jugada anterior: se sigue su vista.
  await page.evaluate(() => { window.__doble.tablero = Object.assign({}, window.__doble.tablero, { vista: { path: ["e4"], parent: null, root: 1 }, arrows: [] }); });
  await page.waitForFunction(() => /otra posición/.test(document.getElementById("vc-estado").textContent), null, { timeout: 5000 });
  igual("sigue lo que mira el profe (e5 vacía, sin caballo en f3)", await page.evaluate(() =>
    !/caballo/i.test(document.querySelector('#vc-tablero [data-square="f3"]').getAttribute("aria-label"))), true);

  console.log("  — primera salida —");
  await salirse(page);
  await page.waitForSelector('dialog[open]', { timeout: 5000 });
  igual("se anota UNA salida (blur y visibilitychange son la misma)", (await llamadas(page, "clase_invitado_salio")).length, 1);
  const dialogo = await page.evaluate(() => (document.querySelector('dialog[open]') || {}).textContent || "");
  igual("se le advierte que la próxima ya no ve el tablero", [/Saliste de la pantalla/.test(dialogo), /ya no vas a poder ver más el tablero/.test(dialogo)], [true, true]);
  igual("mientras lee la advertencia no ve el tablero", await seVe(page, "#vc-tablero"), false);
  await page.getByRole("button", { name: "Volver a la clase" }).click();
  await page.waitForTimeout(1700); // la gracia de entrar a pantalla completa
  igual("al volver, sigue viendo, con el aviso escrito", [await seVe(page, "#vc-tablero"), await page.textContent("#vc-avisos")],
    [true, "⚠️ Saliste 1 vez: si vuelves a salir, se cierra"]);

  console.log("  — segunda salida —");
  await page.evaluate(() => { window.__doble.ultima = 0; });
  await salirse(page);
  await page.waitForFunction(() => document.getElementById("vc-fin").checkVisibility(), null, { timeout: 5000 });
  igual("la segunda salida lo saca", [await page.textContent("#vc-fin-titulo"), await seVe(page, "#vc-tablero")], ["Ya no puedes ver el tablero", false]);
  const n = (await llamadas(page, "clase_invitado_ver")).length;
  await page.waitForTimeout(2500);
  igual("y deja de pedir el tablero", (await llamadas(page, "clase_invitado_ver")).length, n);
  igual("sin errores de la página", errores, []);

  console.log("  — recarga —");
  const otra = await abrirInvitado(browser, "#t=tok-bueno", null, ctx);
  igual("al recargar sigue fuera, sin pedir el nombre", [await seVe(otra.page, "#vc-fin"), await seVe(otra.page, "#vc-entrada")], [true, false]);
  await ctx.close();
}

async function pruebaEsperando(browser) {
  console.log("\n=== La clase todavía no está abierta ===");
  const { page, ctx, errores } = await abrirInvitado(browser, "#t=tok-bueno", { abierta: false });
  await page.fill("#vc-nombre", "Eva");
  await page.check("#vc-acepto");
  await page.click("#vc-entrar");
  await page.waitForFunction(() => /todavía no abre la clase/.test(document.getElementById("vc-estado").textContent), null, { timeout: 5000 });
  igual("dice que espera a que el profe abra, sin tablero", [await page.textContent("#vc-estado"), await seVe(page, "#vc-tablero")],
    ["Karina Rojas todavía no abre la clase. Esta pantalla se actualiza sola.", false]);
  await page.evaluate(() => { window.__doble.abierta = true; });
  await page.waitForFunction(() => document.getElementById("vc-tablero").checkVisibility({ visibilityProperty: true }), null, { timeout: 5000 });
  igual("al abrirse la clase, el tablero aparece solo", await seVe(page, "#vc-tablero"), true);
  igual("sin errores de la página", errores, []);
  await ctx.close();
}

/* Para quien no ve la pantalla: el Modo Adaptado (el recuadro de la clase y
   cada aviso en la región viva #vc-voz) y la voz del navegador, que se
   intercepta para ver QUÉ diría. */
const VOZ_FALSA = () => {
  window.__dicho = [];
  const falsa = { speak: (u) => window.__dicho.push(u.text), cancel() {}, getVoices: () => [] };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => falsa });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};
const oido = (page) => page.evaluate(() => document.getElementById("vc-voz").textContent);
const esperarOido = (page, re) => page.waitForFunction((r) => new RegExp(r).test(document.getElementById("vc-voz").textContent), re.source, { timeout: 6000 });

async function pruebaSinVer(browser) {
  console.log("\n=== Sin ver la pantalla: modo adaptado, recuadro y voz ===");
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: dobleInvitado({ abierta: false }) }));
  await ctx.addInitScript(VOZ_FALSA);
  await ctx.addInitScript(() => { try { localStorage.setItem("oscarBlindMode_v1", "0"); } catch (e) {} });
  const { page, errores } = await abrirInvitado(browser, "#t=tok-bueno", null, ctx);

  igual("en la entrada están los dos botones, apagados", [await seVe(page, "#vc-adaptado-btn"), await page.getAttribute("#vc-adaptado-btn", "aria-pressed"),
    await seVe(page, "#vc-voz-btn"), await page.getAttribute("#vc-voz-btn", "aria-pressed")], [true, "false", true, "false"]);
  igual("la voz dice para quién es (nombre fijo)", await page.getAttribute("#vc-voz-btn", "aria-label"), "Voz del navegador, solo si no usas lector de pantalla");

  await page.click("#vc-adaptado-btn");
  await esperarOido(page, /Modo adaptado activado/);
  igual("encender el modo lo dice y lo marca", [await page.getAttribute("#vc-adaptado-btn", "aria-pressed"),
    await page.evaluate(() => document.documentElement.classList.contains("adaptive-mode"))], ["true", true]);
  await page.click("#vc-voz-btn");
  igual("la voz se enciende y lo dice", [await page.getAttribute("#vc-voz-btn", "aria-pressed"),
    await page.evaluate(() => window.__dicho.some((t) => /Voz activada/.test(t)))], ["true", true]);

  await page.fill("#vc-nombre", "Ana Solís");
  await page.click("#vc-entrar");
  await page.waitForTimeout(150);
  igual("un error de la entrada también se dice en voz", await page.evaluate(() => window.__dicho.some((t) => /aceptar la Política de privacidad/.test(t))), true);
  await page.check("#vc-acepto");
  await page.click("#vc-entrar");
  await page.waitForFunction(() => document.getElementById("vc-clase").checkVisibility(), null, { timeout: 5000 });
  await esperarOido(page, /todavía no abre la clase/);
  igual("al entrar: bienvenida y que la clase no abrió, en UN aviso", await oido(page),
    "Estás mirando la clase de Karina Rojas. Solo para mirar: no se puede mover. Escribe «posición» para oír el tablero, o «ayuda» para ver todo lo que se puede preguntar. Karina Rojas todavía no abre la clase. Te avisamos cuando empiece.");
  igual("el foco va al recuadro, que se ve", [await seVe(page, "#vc-cmd .cc-caja"),
    await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("cc-input"))], [true, true]);
  igual("los botones siguen a mano en la clase, marcados", [await page.getAttribute("#vc-adaptado-btn2", "aria-pressed"), await page.getAttribute("#vc-voz-btn2", "aria-pressed")], ["true", "true"]);

  await page.evaluate(() => { window.__doble.abierta = true; });
  await esperarOido(page, /abrió la clase/);
  igual("al abrir la clase se dice, con el tablero", await oido(page), "Karina Rojas abrió la clase. Tablero de la clase. Juegan negras.");

  // Preguntarle a la posición y tratar de mover.
  await page.fill("#vc-cmd .cc-input", "qué hay en f3");
  await page.press("#vc-cmd .cc-input", "Enter");
  igual("se le pregunta a la posición", /caballo blanco/i.test(await page.textContent("#vc-cmd .cc-msg")), true);
  await page.fill("#vc-cmd .cc-input", "Cc6");
  await page.press("#vc-cmd .cc-input", "Enter");
  igual("escribir una jugada dice que solo se mira", await page.textContent("#vc-cmd .cc-msg"),
    "Estás mirando como invitado: no se puede mover. Para jugar con tu profe hace falta tu cuenta.");
  igual("y la voz lo dice también", await page.evaluate(() => window.__dicho.some((t) => /Estás mirando como invitado/.test(t))), true);
  igual("y el tablero no cambió (c6 sigue vacía)", /vacía/.test(await page.getAttribute('#vc-tablero [data-square="c6"]', "aria-label")), true);

  // Lo que hace el profe, dicho.
  const tab = (extra) => page.evaluate((x) => { window.__doble.tablero = Object.assign({}, window.__doble.tablero, x); }, extra);
  await tab({ moves: ["e4", "e5", "Nf3", "Nc6"] });
  await esperarOido(page, /Se jugó/);
  igual("la jugada del profe", await oido(page), "Se jugó caballo cesar 6. Juegan blancas.");
  await tab({ vista: { path: ["e4"], parent: null, root: 1 } });
  await esperarOido(page, /volvió a una jugada anterior/);
  igual("lo que muestra el profe", await oido(page), "Tu profe volvió a una jugada anterior: 1. e4.");
  await tab({ vista: null, arrows: [{ from: "f3", to: "e5", color: "naranja" }, { from: "b1", to: "c3", color: "azul" }], circles: [{ square: "e5", color: "rojo" }] });
  await esperarOido(page, /marcó/);
  igual("vuelve a la partida y dice las marcas NUEVAS (la de f3 ya estaba)", await oido(page),
    "Tu profe volvió a la posición de la partida. Tu profe marcó una flecha de bella 1 a cesar 3, la casilla eva 5.");
  await tab({ pieces_hidden: true });
  await esperarOido(page, /ocultó las piezas/);
  igual("ocultar las piezas", await oido(page), "Tu profe ocultó las piezas: ahora hay que ver el tablero de memoria.");
  igual("la voz dijo lo mismo que el lector", await page.evaluate(() => window.__dicho[window.__dicho.length - 1]), "Tu profe ocultó las piezas: ahora hay que ver el tablero de memoria.");

  // En Modo Adaptado, salir de pantalla completa (la tecla Esc) no cuenta.
  await page.waitForTimeout(1600);
  // Salir de verdad si el navegador la puso; si no, el aviso que manda al salir.
  const habiaPantallaCompleta = await page.evaluate(async () => {
    if (document.fullscreenElement) { await document.exitFullscreen(); return true; }
    document.dispatchEvent(new Event("fullscreenchange"));
    return false;
  });
  console.log("    (pantalla completa puesta por el navegador: " + habiaPantallaCompleta + ")");
  await page.waitForTimeout(300);
  igual("salir de pantalla completa no cuenta como salida", (await llamadas(page, "clase_invitado_salio")).length, 0);
  await salirse(page);
  await page.waitForSelector("dialog[open]", { timeout: 5000 });
  igual("irse a otra pestaña sí cuenta, y la advertencia se dice en voz", [(await llamadas(page, "clase_invitado_salio")).length,
    await page.evaluate(() => window.__dicho.some((t) => t === "Saliste de la pantalla. Tu profe ya sabe que te saliste de la pantalla de la clase. Si vuelves a salir, ya no vas a poder ver más el tablero."))], [1, true]);
  await page.click("dialog[open] [data-avisos-aceptar]");
  await page.waitForTimeout(1700);
  await page.evaluate(() => { window.__doble.ultima = 0; });
  await salirse(page);
  await page.waitForFunction(() => document.getElementById("vc-fin").checkVisibility(), null, { timeout: 5000 });
  await esperarOido(page, /cuenta/);
  igual("al quedar fuera, el foco va al título", await page.evaluate(() => document.activeElement && document.activeElement.id), "vc-fin-titulo");
  igual("y la voz dice el título y qué hacer", await page.evaluate(() => /^Ya no puedes ver el tablero\. .*probar gratis/.test(window.__dicho[window.__dicho.length - 1])), true);
  igual("la voz no lee los emojis", await page.evaluate(() => { ClaseAdaptada.hablar("⚠️ Saliste 📺 1 vez"); return window.__dicho[window.__dicho.length - 1]; }), "Saliste 1 vez");
  igual("sin errores de la página", errores, []);
  await ctx.close();
}

/* El profe maneja el modo adaptado del invitado: el enlace lo trae puesto, y
   desde su lista se lo enciende o apaga en plena clase. */
async function pruebaModoDelProfe(browser) {
  console.log("\n=== El profe le enciende el modo adaptado ===");
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: dobleInvitado({}) }));
  await ctx.addInitScript(VOZ_FALSA);
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem("__listo")) { sessionStorage.setItem("__listo", "1"); localStorage.setItem("oscarBlindMode_v1", "0"); } } catch (e) {} });
  const { page, errores } = await abrirInvitado(browser, "#t=tok-bueno&adaptado=1", null, ctx);
  const modo = () => page.evaluate(() => document.documentElement.classList.contains("adaptive-mode"));
  const modos = () => page.evaluate(() => window.__doble.llamadas.filter((l) => l.n === "clase_invitado_modo").map((l) => l.a.p_adaptado));

  await esperarOido(page, /mandó este enlace con el modo adaptado/);
  igual("el enlace con «adaptado=1» abre ya en el modo, y lo dice", [await modo(), await page.getAttribute("#vc-adaptado-btn", "aria-pressed")], [true, "true"]);

  await page.click("#vc-voz-btn");
  await page.fill("#vc-nombre", "Ana Solís");
  await page.check("#vc-acepto");
  await page.click("#vc-entrar");
  await page.waitForFunction(() => document.getElementById("vc-clase").checkVisibility(), null, { timeout: 5000 });
  await page.waitForFunction(() => window.__doble.adaptado === true, null, { timeout: 5000 });
  igual("al entrar, la base se entera de que lo tiene puesto (para la lista del profe)", await modos(), [true]);
  await page.waitForTimeout(2500);   // una vuelta: la página ve que la base lo confirmó

  await page.evaluate(() => { window.__doble.adaptado = false; });
  await esperarOido(page, /Tu profe apagó el modo adaptado/);
  igual("el profe se lo apaga: se apaga y se dice", [await modo(), await seVe(page, "#vc-cmd .cc-caja")], [false, false]);
  igual("sin volver a avisarle a la base lo que ella misma mandó", await modos(), [true]);

  await page.evaluate(() => { window.__doble.adaptado = true; });
  await esperarOido(page, /Tu profe te activó el modo adaptado/);
  igual("el profe se lo enciende: aparece el recuadro con el cursor adentro", [await modo(), await seVe(page, "#vc-cmd .cc-caja"),
    await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("cc-input"))], [true, true, true]);
  igual("y la voz lo dice", await page.evaluate(() => window.__dicho.some((t) => /Tu profe te activó el modo adaptado/.test(t))), true);

  // La base guarda su cambio tarde: las consultas de mientras traen el valor viejo.
  await page.evaluate(() => { window.__doble.modoTarda = 3000; });
  await page.click("#vc-adaptado-btn2");
  await page.waitForTimeout(4500);
  igual("si ella lo apaga, queda apagado (la vuelta siguiente no se lo vuelve a poner)", [await modo(), await modos()], [false, [true, false]]);
  igual("sin errores de la página", errores, []);
  await ctx.close();
}

/* El enlace trae la voz encendida («&voz=1»). La voz de mentira imita al
   navegador: no dice nada hasta que la página recibió un toque o una tecla. */
/* El navegador de prueba ya arranca con navigator.userActivation dado, así
   que el permiso se lleva acá: hasta el primer toque o tecla que llega a la
   ventana (antes que a la página), no se habla. */
const VOZ_CON_PERMISO = () => {
  window.__dicho = [];
  let permiso = false;
  const dar = () => { permiso = true; };
  window.addEventListener("pointerup", dar, true);
  window.addEventListener("keydown", dar, true);
  const falsa = {
    speak: (u) => { if (permiso) window.__dicho.push(u.text); },
    cancel() {}, getVoices: () => [],
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => falsa });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};

async function pruebaVozDelEnlace(browser) {
  console.log("\n=== El enlace trae la voz encendida ===");
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: dobleInvitado({}) }));
  await ctx.addInitScript(VOZ_CON_PERMISO);
  await ctx.addInitScript(() => { try { localStorage.setItem("oscarBlindMode_v1", "0"); localStorage.removeItem("oscarSpeechMode_v1"); } catch (e) {} });
  const { page, errores } = await abrirInvitado(browser, "#t=tok-bueno&adaptado=1&voz=1", null, ctx);
  await esperarOido(page, /voz encendida/);
  igual("la voz queda encendida y el botón lo dice", [await page.getAttribute("#vc-voz-btn", "aria-pressed"),
    await page.evaluate(() => localStorage.getItem("oscarSpeechMode_v1"))], ["true", "1"]);
  igual("el aviso queda escrito, junto con el del modo adaptado", [/modo adaptado/.test(await oido(page)), /voz encendida/.test(await oido(page))], [true, true]);
  igual("antes de tocar nada, el navegador no deja hablar", await page.evaluate(() => window.__dicho.length), 0);
  await page.click("#vc-nombre");
  await page.waitForTimeout(200);
  igual("con el primer toque, la voz dice el aviso", await page.evaluate(() => window.__dicho.some((t) => /mandó este enlace con la voz encendida/.test(t))), true);
  igual("sin errores de la página", errores, []);
  await ctx.close();
}

async function pruebaProfe(browser) {
  console.log("\n=== El profe: el enlace y los avisos ===");
  const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE);
  await page.click("#teacher-tab-controles");
  igual("la sección se ve en «Invitar»", await seVe(page, "#invitados"), true);
  igual("sin enlace, lo ofrece crear", [await seVe(page, "#invitados-crear"), await seVe(page, "#invitados-enlace")], [true, false]);
  await page.click("#invitados-crear");
  await page.waitForFunction(() => document.getElementById("invitados-url").value, null, { timeout: 5000 });
  igual("el enlace lleva el token en el # (no viaja al servidor)", await page.inputValue("#invitados-url"), BASE + "/ver-clase.html#t=tok1");
  igual("las escuchas van filtradas por el profe", await page.evaluate(() => (window.__escuchas || [])
    .filter((e) => e.tabla === "clase_espectadores").map((e) => e.evento + " " + e.filtro)), ["INSERT owner_id=eq.u-profe", "UPDATE owner_id=eq.u-profe"]);

  const inv = { id: "esp-1", nombre: "Luis Mora", entro_at: new Date().toISOString(), visto_at: new Date().toISOString(), salidas: 0, bloqueado_at: null };
  await page.evaluate((f) => { window.__tablas.clase_espectadores.push(Object.assign({}, f)); window.__cambioEnBase("clase_espectadores", f, "INSERT"); }, inv);
  igual("entra un invitado: aparece en la lista", await page.textContent("#invitados-lista"), "Luis Mora — mirando🦯 AdaptadoSacar");
  igual("y se le avisa al profe", await page.evaluate(() => /Luis Mora entró a mirar la clase/.test(document.body.textContent)), true);

  // El modo adaptado del invitado, desde la lista.
  const botonAdaptado = '#invitados-lista button[aria-label="Modo adaptado para Luis Mora"]';
  igual("cada invitado lleva su botón de modo adaptado, apagado", await page.getAttribute(botonAdaptado, "aria-pressed"), "false");
  await page.click(botonAdaptado);
  await page.waitForFunction((s) => document.querySelector(s).getAttribute("aria-pressed") === "true", botonAdaptado, { timeout: 5000 });
  igual("al tocarlo se le enciende en la base", await page.evaluate(() => window.__rpcs.filter((x) => x.n === "clase_enlace_adaptado").map((x) => [x.args.p_espectador, x.args.p_adaptado])), [["esp-1", true]]);
  igual("la lista lo dice escrito y el foco se queda en el botón", [/🦯 modo adaptado/.test(await page.textContent("#invitados-lista")),
    await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label"))], [true, "Modo adaptado para Luis Mora"]);
  await page.evaluate((f) => window.__cambioEnBase("clase_espectadores", Object.assign({}, f, { adaptado: false }), "UPDATE"), inv);
  igual("si el invitado lo apaga él, la lista también", [await page.getAttribute(botonAdaptado, "aria-pressed"), /modo adaptado/.test(await page.textContent("#invitados-lista"))], ["false", false]);

  await page.check("#invitados-adaptado");
  igual("la casilla hace que el enlace abra con el modo adaptado", await page.inputValue("#invitados-url"), BASE + "/ver-clase.html#t=tok1&adaptado=1");
  await page.check("#invitados-voz");
  igual("y la de la voz le suma «voz=1»", await page.inputValue("#invitados-url"), BASE + "/ver-clase.html#t=tok1&adaptado=1&voz=1");
  await page.uncheck("#invitados-adaptado");
  await page.uncheck("#invitados-voz");
  igual("y sin ellas, como siempre", await page.inputValue("#invitados-url"), BASE + "/ver-clase.html#t=tok1");

  // visto_at cambia solo: eso no es un aviso.
  await page.evaluate((f) => window.__cambioEnBase("clase_espectadores", Object.assign({}, f, { visto_at: new Date().toISOString() }), "UPDATE"), inv);
  igual("«sigue mirando» no avisa nada", await page.evaluate(() => /se salió/.test(document.body.textContent)), false);

  await page.evaluate((f) => window.__cambioEnBase("clase_espectadores", Object.assign({}, f, { salidas: 1 }), "UPDATE"), inv);
  igual("primera salida: se le avisa al profe", await page.evaluate(() =>
    /Luis Mora \(invitado\) se salió de la pantalla\. Se le advirtió/.test(document.body.textContent)), true);
  igual("y la lista lo dice escrito", await page.textContent("#invitados-lista"), "Luis Mora — mirando · ⚠️ se salió 1 vez🦯 AdaptadoSacar");

  await page.evaluate((f) => window.__cambioEnBase("clase_espectadores", Object.assign({}, f, { salidas: 2, bloqueado_at: new Date().toISOString() }), "UPDATE"), inv);
  igual("segunda salida: el profe sabe que ya no ve", await page.evaluate(() =>
    /Luis Mora \(invitado\) se salió de la pantalla por segunda vez: ya no puede ver el tablero/.test(document.body.textContent)), true);
  igual("la lista lo dice, sin botón para sacarlo", await page.textContent("#invitados-lista"), "Luis Mora — 🚫 se salió dos veces: ya no ve el tablero");

  await page.click("#invitados-cambiar");
  await page.click("dialog[open] [data-avisos-aceptar]");
  await page.waitForFunction(() => /tok2/.test(document.getElementById("invitados-url").value), null, { timeout: 5000 });
  igual("cambiar el enlace da otro y vacía la lista", [await page.inputValue("#invitados-url"), await page.textContent("#invitados-lista")],
    [BASE + "/ver-clase.html#t=tok2", "Todavía no entró nadie con el enlace."]);
  igual("sin errores de la página", errores, []);
  await ctx.close();

  console.log("\n=== A la alumna no se le pinta nada de esto ===");
  const al = await abrir(browser, "u-ana", CLASE);
  igual("la sección no está", await seVe(al.page, "#invitados"), false);
  igual("y no escucha a los invitados", await al.page.evaluate(() => (window.__escuchas || []).filter((e) => e.tabla === "clase_espectadores").length), 0);
  await al.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaEnlaceMalo(browser);
    await pruebaInvitado(browser);
    await pruebaEsperando(browser);
    await pruebaSinVer(browser);
    await pruebaModoDelProfe(browser);
    await pruebaVozDelEnlace(browser);
    await pruebaProfe(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: la clase para invitados.");
  process.exit(fallos ? 1 : 0);
})();
