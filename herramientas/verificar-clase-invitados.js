#!/usr/bin/env node
/* La clase vista por invitados sin cuenta (ver-clase.html y la sección
   «Que vean la clase sin cuenta» de sesion.html).

   Lo que se rompe callado acá: un invitado que puede mover o dibujar en el
   tablero, un enlace en la pantalla de la clase (tocarlo es salirse), entrar
   sin la casilla de la privacidad, una salida que no se anota (o que se anota
   dos veces por el blur y el visibilitychange de la misma salida), la
   advertencia que no sale, un bloqueado que sigue viendo el tablero al
   recargar, y al profe que no le llega el aviso.

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
  const D = window.__doble = { llamadas: [], salidas: 0, bloqueado: false, ultima: 0, abierta: O.abierta !== false,
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
      if (!D.abierta) return r({ estado: "esperando", salidas: D.salidas });
      return r({ estado: "ok", salidas: D.salidas, tablero: D.tablero });
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
  await page.waitForFunction(() => document.querySelector('#vc-tablero [aria-label*="e5"]'), null, { timeout: 5000 });
  igual("el tablero muestra la posición de la clase (caballo en f3)",
    await page.evaluate(() => /caballo blanco/i.test((document.querySelector('#vc-tablero [aria-label^="f3"]') || {}).getAttribute?.("aria-label") || "")), true);
  igual("con la flecha del profe", await page.evaluate(() => document.querySelectorAll("#vc-tablero svg line, #vc-tablero svg path, #vc-tablero svg polyline").length > 0), true);
  igual("dice de quién es el turno", await page.textContent("#vc-estado"), "Juegan las negras");
  igual("en la pantalla de la clase no hay NINGÚN enlace (ni el pie)",
    await page.evaluate(() => [...document.querySelectorAll("a[href]")].filter((a) => a.checkVisibility()).length), 0);

  // No se puede mover: tocar el peón de d7 y después d6 (jugada legal) no cambia nada.
  const casillas = () => page.evaluate(() => ["d7", "d6"].map((c) => document.querySelector('#vc-tablero [aria-label^="' + c + '"]').getAttribute("aria-label")));
  const antes = await casillas();
  await page.click('#vc-tablero [aria-label^="d7"]').catch(() => {});
  await page.click('#vc-tablero [aria-label^="d6"]').catch(() => {});
  igual("tocar el tablero no mueve nada (d7 → d6 es legal)", await casillas(), antes);

  // El profe muestra una jugada anterior: se sigue su vista.
  await page.evaluate(() => { window.__doble.tablero = Object.assign({}, window.__doble.tablero, { vista: { path: ["e4"], parent: null, root: 1 }, arrows: [] }); });
  await page.waitForFunction(() => /otra posición/.test(document.getElementById("vc-estado").textContent), null, { timeout: 5000 });
  igual("sigue lo que mira el profe (e5 vacía, sin caballo en f3)", await page.evaluate(() =>
    !/caballo/i.test(document.querySelector('#vc-tablero [aria-label^="f3"]').getAttribute("aria-label"))), true);

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
  igual("entra un invitado: aparece en la lista", await page.textContent("#invitados-lista"), "Luis Mora — mirandoSacar");
  igual("y se le avisa al profe", await page.evaluate(() => /Luis Mora entró a mirar la clase/.test(document.body.textContent)), true);

  // visto_at cambia solo: eso no es un aviso.
  await page.evaluate((f) => window.__cambioEnBase("clase_espectadores", Object.assign({}, f, { visto_at: new Date().toISOString() }), "UPDATE"), inv);
  igual("«sigue mirando» no avisa nada", await page.evaluate(() => /se salió/.test(document.body.textContent)), false);

  await page.evaluate((f) => window.__cambioEnBase("clase_espectadores", Object.assign({}, f, { salidas: 1 }), "UPDATE"), inv);
  igual("primera salida: se le avisa al profe", await page.evaluate(() =>
    /Luis Mora \(invitado\) se salió de la pantalla\. Se le advirtió/.test(document.body.textContent)), true);
  igual("y la lista lo dice escrito", await page.textContent("#invitados-lista"), "Luis Mora — mirando · ⚠️ se salió 1 vezSacar");

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
    await pruebaProfe(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: la clase para invitados.");
  process.exit(fallos ? 1 : 0);
})();
