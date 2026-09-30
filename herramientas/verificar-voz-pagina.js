/* ===== Comprobación: «Activar voz» en todo el sitio =====
 *
 * El 🔇 del encabezado (js/voz-pagina.js, que carga js/adaptive-mode.js) hace
 * que el navegador diga en voz alta los avisos de cualquier página, para quien
 * ve poco y no usa lector de pantalla. Si se rompe no da ningún error: el botón
 * no aparece, o aparece y no habla, o habla de más. Se reemplaza speechSynthesis
 * por uno que anota lo que dice, y se mira:
 *
 *   - el botón está en la raíz y en las subcarpetas (entreno/, articulos/: la
 *     ruta de js/ se saca de dónde se cargó adaptive-mode.js), dice para quién
 *     es y arranca apagado;
 *   - NO está en las páginas con su propio botón de voz (Mates, las partidas de
 *     Juegos): serían dos para lo mismo;
 *   - en el celular el encabezado no se sale a lo ancho;
 *   - apagado no dice nada; encendido confirma y dice un aviso nuevo;
 *   - una caja nueva que ya es región viva (como «Partida asignada») se dice;
 *   - lo de un panel escondido no se dice;
 *   - lo que ya estaba al cargar no se dice;
 *   - una cuenta atrás no se dice cada segundo;
 *   - el mismo cartel repintado no se repite.
 *
 * Cómo se corre (con el sitio en localhost:8777):
 *     node herramientas/verificar-todo.js voz-pagina
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { clienteFalso } = require("./verificar-clase-registrada.js");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://localhost:8777";
const { CHROME } = require("./verificar-clase-registrada.js");
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* speechSynthesis de mentira: anota cada frase. */
function vozFalsa() {
  window.__dichos = [];
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  const falso = {
    speak(u) { window.__dichos.push(u.text); setTimeout(() => { if (u.onend) u.onend(); }, 5); },
    cancel() {}, getVoices() { return []; }, pending: false, speaking: false,
  };
  Object.defineProperty(window, "speechSynthesis", { value: falso, configurable: true });
}

async function abrir(browser, ruta, opciones) {
  opciones = opciones || {};
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones.contexto || {}));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  /* Con sesión (el doble de siempre): las páginas de la Academia no mandan al login. */
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso("u-ana", null, {}) }));
  await ctx.addInitScript(vozFalsa);
  await ctx.addInitScript((voz) => {
    try {
      localStorage.setItem("oscarBlindMode_v1", "0");
      if (voz !== undefined) localStorage.setItem("oscarSpeechMode_v1", voz);
      /* Una región que ya estaba escrita al cargar: no es un aviso. */
      document.addEventListener("DOMContentLoaded", () => {
        const p = document.createElement("p");
        p.id = "__ya-estaba";
        p.setAttribute("role", "status");
        p.textContent = "Esto ya estaba al cargar";
        document.body.appendChild(p);
      });
    } catch (e) {}
  }, opciones.voz);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + ruta, { waitUntil: "domcontentloaded" });
  return { page, ctx, errores };
}

const dichos = (page) => page.evaluate(() => window.__dichos.slice());
const olvidar = (page) => page.evaluate(() => { window.__dichos.length = 0; });

async function botonEn(browser, ruta) {
  const { page, ctx } = await abrir(browser, ruta);
  await page.waitForSelector("#voz-toggle", { timeout: 8000 }).catch(() => {});
  const b = await page.evaluate(() => {
    const btn = document.getElementById("voz-toggle");
    if (!/\.html$/.test(location.pathname) || /login\.html/.test(location.pathname)) return "se fue a " + location.pathname;
    return btn ? { ve: btn.checkVisibility(), nombre: btn.getAttribute("aria-label"), pulsado: btn.getAttribute("aria-pressed") } : null;
  });
  await ctx.close();
  return b;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== El botón, en todas las páginas con encabezado ===");
    for (const ruta of ["/index.html", "/entreno/tactica.html", "/articulos/la-oposicion.html"]) {
      const b = await botonEn(browser, ruta);
      igual(ruta + ": el botón se ve", b && b.ve, true);
      igual(ruta + ": dice para quién es", !!(b && /solo si no usas lector de pantalla/.test(b.nombre || "")), true);
      igual(ruta + ": arranca apagado", b && b.pulsado, "false");
    }
    for (const ruta of ["/tablero.html", "/entreno/mates.html", "/estandar.html"]) {
      const b = await botonEn(browser, ruta);
      igual(ruta + ": trae su propio botón de voz, el del encabezado no sale", b, null);
    }

    console.log("\n=== En el celular, el encabezado no se sale ===");
    for (const ancho of [360, 375]) {
      const { page, ctx } = await abrir(browser, "/index.html",
        { contexto: { viewport: { width: ancho, height: 740 }, isMobile: true, hasTouch: true } });
      await page.waitForSelector("#voz-toggle", { timeout: 8000 });
      igual(ancho + " px: nada se sale a lo ancho", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await ctx.close();
    }

    console.log("\n=== Lo que dice y lo que no ===");
    const { page, ctx, errores } = await abrir(browser, "/index.html");
    await page.waitForSelector("#voz-toggle", { timeout: 8000 });
    await page.waitForTimeout(2000);
    const escribir = (texto, atributos) => page.evaluate(([t, a]) => {
      let r = document.getElementById("__aviso");
      if (!r) { r = document.createElement("p"); r.id = "__aviso"; r.setAttribute("aria-live", "polite"); document.body.appendChild(r); }
      Object.keys(a || {}).forEach((k) => r.setAttribute(k, a[k]));
      r.textContent = t;
    }, [texto, atributos]);

    await escribir("Aviso con la voz apagada");
    await page.waitForTimeout(400);
    igual("apagada no dice nada", (await dichos(page)).join(" | ") || "nada", "nada");

    await page.click("#voz-toggle");
    await page.waitForTimeout(200);
    igual("al encenderla queda pulsada", await page.getAttribute("#voz-toggle", "aria-pressed"), "true");
    igual("y confirma en voz", (await dichos(page)).some((t) => /Voz activada/.test(t)), true);

    await olvidar(page);
    await escribir("Guardaste los cambios");
    await page.waitForTimeout(400);
    igual("un aviso nuevo se dice", (await dichos(page)).includes("Guardaste los cambios"), true);

    await olvidar(page);
    await escribir("Guardaste los cambios");
    await page.waitForTimeout(400);
    igual("el mismo cartel repintado no se repite", (await dichos(page)).length, 0);

    await olvidar(page);
    await page.evaluate(() => {
      const box = document.createElement("div");
      box.setAttribute("role", "alert");
      box.innerHTML = "<p>Partida asignada</p><p>Tu profesor te asignó una partida de Estándar.</p>";
      document.body.appendChild(box);
    });
    await page.waitForTimeout(400);
    igual("una caja nueva que ya es región viva se dice", (await dichos(page)).some((t) => /te asignó una partida/.test(t)), true);

    await olvidar(page);
    await page.evaluate(() => {
      const panel = document.createElement("div");
      panel.hidden = true;
      panel.innerHTML = '<p id="__escondida" role="status"></p>';
      document.body.appendChild(panel);
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById("__escondida").textContent = "Esto es de un panel que no se ve"; });
    await page.waitForTimeout(400);
    igual("lo de un panel escondido no se dice", (await dichos(page)).some((t) => /panel que no se ve/.test(t)), false);

    await olvidar(page);
    for (let s = 30; s > 25; s--) {
      await escribir("Quedan " + s + " segundos");
      await page.waitForTimeout(450);
    }
    igual("una cuenta atrás se dice una vez, no cada segundo", (await dichos(page)).filter((t) => /Quedan/.test(t)).length, 1);

    await page.click("#voz-toggle");
    await olvidar(page);
    await escribir("Otro aviso, ya apagada");
    await page.waitForTimeout(400);
    igual("apagada otra vez, no dice nada", (await dichos(page)).join(" | ") || "nada", "nada");
    igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();

    console.log("\n=== Al cargar con la voz encendida ===");
    const c = await abrir(browser, "/index.html", { voz: "1" });
    await c.page.waitForSelector("#voz-toggle", { timeout: 8000 });
    await c.page.waitForTimeout(2200);
    igual("sale encendida", await c.page.getAttribute("#voz-toggle", "aria-pressed"), "true");
    igual("y no lee lo que ya estaba", (await dichos(c.page)).some((t) => /ya estaba al cargar/.test(t)), false);
    await c.ctx.close();

    console.log("\n=== Juegos ===");
    const html = fs.readFileSync(path.join(RAIZ, "juegos.html"), "utf8");
    igual("«¡Partida creada!» y sus errores son región viva", /id="create-room-msg" role="status"/.test(html), true);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: la voz se enciende en todo el sitio y no habla de más.");
  process.exit(fallos ? 1 : 0);
})();
