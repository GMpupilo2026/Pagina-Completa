/* Comprueba entreno/memoria.html en un navegador de verdad, jugada de punta a
 * punta. El banco lo comprueba herramientas/verificar-memoria.js sin navegador.
 *
 *   - sin sesión manda a iniciar sesión;
 *   - el hub de Entrenamiento tiene la tarjeta «Memoria» y lleva acá;
 *   - los ajustes ofrecen de 3 a 32 piezas, y ?piezas=…&segundos=… arranca
 *     directo con eso;
 *   - se ve LA posición del banco, con la cantidad de piezas pedida (se
 *     comparan las piezas visibles casilla por casilla contra la FEN);
 *   - al reconstruir no se ve ni una pieza, ni escrita debajo en Modo
 *     Adaptado (sería soplar la respuesta), y la cuenta atrás las esconde sola;
 *   - escrita entera («Rg1 Tf1 a2…», como la contesta quien no ve el
 *     tablero) sale perfecta, guarda el récord en la cuenta
 *     (memoria_mejor_v1) y ofrece «Una pieza más», que sube a 9;
 *   - con errores, cada casilla mala lleva su signo escrito y el récord no
 *     cambia.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-memoria-pagina.js
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("../js/tipos-reglas.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const DATOS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "entreno/data/memoria.json"), "utf8"));

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

/* El doble de Supabase: la sesión de un alumno y training_state, que es donde
   js/progreso-usuario.js guarda el avance. */
function clienteFalso(conSesion) {
  return `
(function () {
  function tabla(nombre) {
    const api = {
      select() { return api; }, eq() { return api; }, in() { return api; }, order() { return api; }, limit() { return api; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single() { return Promise.resolve({ data: null, error: null }); },
      upsert() { return Promise.resolve({ error: null }); },
      insert(filas) { (window.__inserts = window.__inserts || []).push({ tabla: nombre, fila: [].concat(filas)[0] }); return Promise.resolve({ error: null }); },
      update() { return api; },
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
    };
    return api;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: ${conSesion ? '{ user: { id: "u-1" }, access_token: "t" }' : "null"} } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (n) => tabla(n),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); } }),
    removeChannel: () => {},
  };
})();
`;
}

async function abrir(browser, conSesion, ruta, preparar) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 900 } });
  if (preparar) await preparar(ctx);
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(conSesion) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("console: " + m.text()); });
  await page.goto(BASE + "/entreno/" + ruta, { waitUntil: "domcontentloaded" });
  return { page, ctx, errores };
}

/* Lo que se VE en el tablero: las casillas con una pieza pintada y visible. */
async function ocupadasVistas(page) {
  return page.$$eval("#tablero [data-square]", (celdas) => celdas
    .filter((c) => { const sp = c.querySelector("span"); return sp && sp.checkVisibility({ visibilityProperty: true, opacityProperty: true }); })
    .map((c) => c.dataset.square).sort().join(","));
}
function ocupadasDe(fen) {
  const s = [];
  R.tablero(fen).forEach((p, i) => { if (p) s.push(R.sq(i)); });
  return s.sort().join(",");
}
async function estado(page, re) {
  await page.waitForFunction((src) => new RegExp(src).test(document.getElementById("estado").textContent), re.source, { timeout: 10000 }).catch(() => {});
  return (await page.textContent("#estado")) || "";
}
const itemActual = (page) => page.evaluate(() => window.MemoriaEntreno.item());
const record = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("memoria_mejor_v1") || "{}"); } catch (e) { return {}; } });

async function main() {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\n=== Sin sesión ===");
  {
    const { page, ctx } = await abrir(browser, false, "memoria.html");
    await page.waitForURL(/login\.html/, { timeout: 8000 }).catch(() => {});
    ok("manda a login.html", /login\.html/.test(page.url()), page.url());
    await ctx.close();
  }

  console.log("\n=== El hub ===");
  {
    const { page, ctx } = await abrir(browser, true, "index.html");
    const enlace = page.locator("section[aria-labelledby='g-entreno'] h3 a", { hasText: "Memoria" });
    await enlace.waitFor({ timeout: 8000 }).catch(() => {});
    ok("la tarjeta «Memoria» está en Entreno, con su encabezado", (await enlace.count()) === 1);
    if (await enlace.count()) {
      await enlace.click();
      await page.waitForURL(/memoria\.html/, { timeout: 8000 }).catch(() => {});
      ok("y lleva a memoria.html", /memoria\.html/.test(page.url()), page.url());
    }
    await ctx.close();
  }

  console.log("\n=== Los ajustes ===");
  {
    const { page, ctx, errores } = await abrir(browser, true, "memoria.html");
    await page.waitForSelector("#vista-ajustes:not(.hidden) #sel-piezas option", { state: "attached", timeout: 10000 });
    const opciones = await page.$$eval("#sel-piezas option", (o) => o.map((x) => +x.value));
    ok("ofrece de 3 a 32 piezas", opciones[0] === 3 && opciones[opciones.length - 1] === 32 && opciones.length === 30, opciones.join(","));
    ok("empieza en 8 piezas y 10 segundos", (await page.inputValue("#sel-piezas")) === "8" && (await page.inputValue("#sel-segundos")) === "10");
    await page.selectOption("#sel-piezas", "5");
    await page.selectOption("#sel-segundos", "3");
    await page.getByRole("button", { name: "Empezar" }).click();
    await page.waitForSelector("#vista-juego:not(.hidden)");
    const it = await itemActual(page);
    ok("la posición tiene las 5 piezas pedidas", ocupadasDe(it.fen).split(",").length === 5, it.fen);
    ok("y se ve tal cual está en el banco", (await ocupadasVistas(page)) === ocupadasDe(it.fen));
    ok("es una del banco de 5", DATOS.porPiezas[5].some((x) => x.id === it.id));
    ok("el enlace queda con los ajustes", /piezas=5/.test(page.url()) && /segundos=3/.test(page.url()), page.url());
    // la cuenta atrás las esconde sola
    await page.waitForSelector("#btn-comprobar", { timeout: 6000 }).catch(() => {});
    ok("a los 3 segundos se esconden solas", (await ocupadasVistas(page)) === "");
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Reconstruirla escribiendo, en Modo Adaptado ===");
  {
    const { page, ctx, errores } = await abrir(browser, true, "memoria.html?piezas=8&segundos=60", (c) => c.addInitScript(() => {
      try { localStorage.setItem("oscarBlindMode_v1", "1"); } catch (e) {}
    }));
    await page.waitForSelector("#vista-juego:not(.hidden) #cuenta", { timeout: 10000 });
    const it = await itemActual(page);
    ok("con ?piezas=8 arranca directo, con 8 piezas", ocupadasDe(it.fen).split(",").length === 8 && (await ocupadasVistas(page)) === ocupadasDe(it.fen));
    const leida = await page.$eval("#lectura", (p) => (p.checkVisibility() ? p.textContent : ""));
    ok("en Modo Adaptado la posición va también escrita mientras se mira", leida.length > 20, leida);
    await page.getByRole("button", { name: "Ya la tengo" }).click();
    await page.waitForSelector("#mem-w");
    ok("al reconstruir no se ve ni una pieza", (await ocupadasVistas(page)) === "");
    const lectura = await page.$eval("#lectura", (p) => (p.checkVisibility() ? p.textContent : ""));
    ok("ni escrita debajo", !lectura, lectura);
    const L = { k: "R", q: "D", r: "T", b: "A", n: "C", p: "" };
    const por = { w: [], b: [] };
    R.tablero(it.fen).forEach((p, i) => { if (p) por[p.c].push(L[p.t] + R.sq(i)); });
    await page.fill("#mem-w", por.w.join(" "));
    await page.fill("#mem-b", por.b.join(" "));
    await page.getByRole("button", { name: "Colocar lo escrito" }).click();
    ok("lo escrito se coloca en el tablero", (await ocupadasVistas(page)) === ocupadasDe(it.fen));
    await page.getByRole("button", { name: "Comprobar" }).click();
    const t = await estado(page, /Perfecta|Acertaste/);
    ok("entera, perfecta y con récord nuevo", /Perfecta/.test(t) && /Nuevo récord/.test(t), t);
    ok("el récord queda guardado: 60 s → 8 piezas", (await record(page))["60"] === 8, JSON.stringify(await record(page)));
    // Y la ronda queda en training_progress: meta del día, racha, logros, tareas.
    const filas = await page.evaluate(() => (window.__inserts || []).filter((i) => i.tabla === "training_progress").map((i) => [i.fila.activity, i.fila.detail.piezas, i.fila.detail.segundos, i.fila.detail.limpio, i.fila.detail.estrellas]));
    ok("se registra una vez como «memoria», con piezas, segundos y limpio", JSON.stringify(filas) === JSON.stringify([["memoria", 8, 60, true, 3]]), JSON.stringify(filas));
    const mas = page.getByRole("button", { name: /Una pieza más/ });
    ok("ofrece «Una pieza más»", (await mas.count()) === 1);
    await mas.click();
    await page.waitForSelector("#cuenta");
    const it2 = await itemActual(page);
    ok("que sube a 9 piezas", ocupadasDe(it2.fen).split(",").length === 9 && /piezas=9/.test(page.url()), it2.fen + " " + page.url());
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Con errores ===");
  {
    const { page, ctx, errores } = await abrir(browser, true, "memoria.html?piezas=6&segundos=10", (c) => c.addInitScript(() => {
      try { localStorage.setItem("memoria_mejor_v1", JSON.stringify({ 10: 5 })); } catch (e) {}
    }));
    await page.waitForSelector("#vista-juego:not(.hidden) #cuenta", { timeout: 10000 });
    const it = await itemActual(page);
    await page.getByRole("button", { name: "Ya la tengo" }).click();
    await page.waitForSelector("#mem-w");
    // se pone una sola pieza, tocando: el resto falta
    const real = R.tablero(it.fen);
    const i = real.findIndex(Boolean);
    const pieza = real[i].c + real[i].t;
    await page.click('.mem-paleta button[data-pieza="' + pieza + '"]');
    await page.click('#tablero [data-square="' + R.sq(i) + '"]');
    ok("tocar con la paleta coloca la pieza", (await ocupadasVistas(page)) === R.sq(i));
    await page.getByRole("button", { name: "Comprobar" }).click();
    const t = await estado(page, /Acertaste/);
    ok("dice cuántas acertó", /Acertaste 1 de 6/.test(t), t);
    const signos = await page.$$eval("#tablero [data-marca]", (c) => c.map((x) => x.dataset.marca + x.dataset.square));
    ok("la buena lleva ✓ y cada una que faltó lleva − escrito", signos.filter((s) => s[0] === "−").length === 5 && signos.includes("✓" + R.sq(i)), signos.join(" "));
    ok("el récord no cambia", (await record(page))["10"] === 5);
    const fila = await page.evaluate(() => ((window.__inserts || []).filter((i) => i.tabla === "training_progress").pop() || {}).fila);
    ok("con errores también se registra, pero no limpio", !!fila && fila.activity === "memoria" && fila.detail.limpio === false && fila.detail.aciertos === 1 && fila.detail.total === 6, JSON.stringify(fila));
    ok("sin «Una pieza más» si no salió perfecta", (await page.getByRole("button", { name: /Una pieza más/ }).count()) === 0);
    await page.getByRole("button", { name: "Cambiar piezas o segundos" }).click();
    await page.waitForSelector("#vista-ajustes:not(.hidden)");
    const recs = await page.textContent("#records");
    ok("los ajustes muestran el récord", /10 segundos: 5 piezas/.test(recs), recs);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Comprobar sin «Colocar», y todo desde el recuadro ===");
  {
    const { page, ctx, errores } = await abrir(browser, true, "memoria.html?piezas=6&segundos=60", (c) => c.addInitScript(() => {
      try { localStorage.setItem("oscarBlindMode_v1", "1"); } catch (e) {}
    }));
    await page.waitForSelector("#vista-juego:not(.hidden) #cuenta", { timeout: 10000 });
    const it = await itemActual(page);
    await page.getByRole("button", { name: "Ya la tengo" }).click();
    await page.waitForSelector("#mem-w");
    const orden = await page.evaluate(() => {
      const c = document.getElementById("mem-w"), p = document.querySelector(".mem-paleta");
      return !!(c.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    ok("en Modo Adaptado los campos van antes que la paleta", orden);
    const L = { k: "R", q: "D", r: "T", b: "A", n: "C", p: "" };
    const por = { w: [], b: [] };
    R.tablero(it.fen).forEach((p, i) => { if (p) por[p.c].push(L[p.t] + R.sq(i)); });
    // Las blancas, por el recuadro de comandos; las negras, en su campo SIN apretar «Colocar lo escrito».
    const cc = page.locator("#comandos .cc-input");
    await cc.fill("blancas: " + por.w.join(", "));
    await cc.press("Enter");
    await page.waitForFunction(() => /Colocadas/.test(document.querySelector("#comandos .cc-msg").textContent), null, { timeout: 5000 }).catch(() => {});
    ok("«blancas: …» en el recuadro coloca esas piezas", (await ocupadasVistas(page)).split(",").filter(Boolean).length === por.w.length,
      await page.textContent("#comandos .cc-msg"));
    await page.fill("#mem-b", por.b.join(" "));
    await page.getByRole("button", { name: "Comprobar" }).click();
    const t = await estado(page, /Perfecta|Acertaste/);
    ok("«Comprobar» toma también lo escrito en el campo sin «Colocar»: perfecta", /Perfecta/.test(t), t);
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(browser, true, "memoria.html", (c) => c.addInitScript(() => {
      try { localStorage.setItem("oscarBlindMode_v1", "1"); } catch (e) {}
    }));
    await page.waitForFunction(() => document.querySelectorAll("#sel-segundos option").length > 0 && !document.getElementById("vista-ajustes").classList.contains("hidden"), null, { timeout: 10000 });
    ok("en Modo Adaptado el tiempo por defecto es el triple (30 s)", (await page.inputValue("#sel-segundos")) === "30", await page.inputValue("#sel-segundos"));
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
