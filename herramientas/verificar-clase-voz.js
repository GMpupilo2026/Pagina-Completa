/* ===== Comprobación: «Activar voz» en la clase en vivo =====
 *
 * Quien ve poco y no usa lector de pantalla enciende «Activar voz» en
 * sesion.html, y el navegador le dice en voz alta lo que pasa en la clase (ver
 * js/clase-voz.js). Si se rompe no da ningún error: la voz simplemente no
 * habla. Por eso se reemplaza speechSynthesis por uno que anota lo que dice y
 * se mira, como alumna y SIN Modo Adaptado (quien ve poco no suele usarlo):
 *
 *   - el botón está, dice para quién es y arranca apagado;
 *   - apagado no dice nada;
 *   - al encenderlo confirma, y queda guardado (aria-pressed);
 *   - la jugada del profesor se dice aunque el recuadro de comandos no se vea;
 *   - «te dio el control» se dice, y el eco de Realtime con el mismo cartel no
 *     lo repite;
 *   - lo de un panel escondido no se dice;
 *   - al recargar con la voz encendida no se leen de golpe todos los carteles;
 *   - apagarla corta lo que está diciendo y ya no dice nada.
 *
 * Cómo se corre (con el sitio en localhost:8777):
 *     node herramientas/verificar-todo.js clase-voz
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir, igual, CHROME, fallos } = require("./verificar-clase-registrada.js");

let mias = 0;
function si(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); mias += 1; }
}

const CLASE = { id: "s-1", title: "Hoy", created_by: "u-profe", ended_at: null,
                started_at: new Date().toISOString(), notes: null };
const LUCENA = "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1";
const fila = (extra) => Object.assign({
  id: 7, owner_id: "u-profe", moves: [], start_fen: LUCENA, arrows: [], circles: [],
  active_player_id: null, active_player_color: "both", pieces_hidden: false,
  shown_curso: null, shown_leccion: null,
}, extra || {});

/* speechSynthesis de mentira: anota cada frase y cada corte. */
function vozFalsa() {
  window.__dichos = [];
  window.__cortes = 0;
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  const falso = {
    speak(u) { window.__dichos.push(u.text); setTimeout(() => { if (u.onend) u.onend(); }, 5); },
    cancel() { window.__cortes += 1; },
    getVoices() { return []; },
    pending: false, speaking: false,
  };
  Object.defineProperty(window, "speechSynthesis", { value: falso, configurable: true });
}

const dichos = (page) => page.evaluate(() => window.__dichos.slice());
const olvidar = (page) => page.evaluate(() => { window.__dichos.length = 0; window.__cortes = 0; });
async function empujar(page, f) {
  await page.evaluate((x) => window.__cambioEnBase("game_state", x), f);
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== «Activar voz» en la clase en vivo ===");
    const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE);
    await page.addInitScript(vozFalsa);
    await page.addInitScript(() => {
      // Solo la primera vez: después la recarga tiene que encontrar lo que se eligió.
      try {
        if (sessionStorage.getItem("__vozLista")) return;
        sessionStorage.setItem("__vozLista", "1");
        localStorage.setItem("oscarBlindMode_v1", "0");
        localStorage.removeItem("oscarSpeechMode_v1");
      } catch (e) {}
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
    await page.waitForTimeout(800);
    await empujar(page, fila());

    const b = await page.evaluate(() => {
      const btn = document.getElementById("voz-clase-btn");
      return { ve: !!btn && btn.checkVisibility(), nombre: btn && btn.getAttribute("aria-label"),
               pulsado: btn && btn.getAttribute("aria-pressed"),
               adaptado: document.documentElement.classList.contains("adaptive-mode") };
    });
    igual("sin Modo Adaptado (como entra quien ve poco)", b.adaptado, false);
    igual("el botón se ve", b.ve, true);
    si("y dice para quién es", /solo si no usas lector de pantalla/.test(b.nombre || ""), b.nombre);
    igual("arranca apagado", b.pulsado, "false");

    await olvidar(page);
    await empujar(page, fila({ moves: ["Rd1+"] }));
    igual("apagado, la jugada del profe no se dice", (await dichos(page)).join(" | ") || "nada", "nada");

    await page.click("#voz-clase-btn");
    await page.waitForTimeout(200);
    igual("al encenderlo queda pulsado", await page.getAttribute("#voz-clase-btn", "aria-pressed"), "true");
    si("y confirma en voz", (await dichos(page)).some((t) => /Voz activada/.test(t)), (await dichos(page)).join(" | "));

    await olvidar(page);
    await empujar(page, fila({ moves: ["Rd1+", "Kc7"] }));
    let d = await dichos(page);
    si("la jugada del profe se dice aunque el recuadro no se vea", d.some((t) => /Se jugó rey cesar 7/.test(t)), d.join(" | "));
    igual("una sola vez", d.filter((t) => /Se jugó/.test(t)).length, 1);

    await olvidar(page);
    await empujar(page, fila({ moves: ["Rd1+", "Kc7"], active_player_id: "u-ana", active_player_color: "w" }));
    d = await dichos(page);
    si("«te dio el control» se dice", d.some((t) => /control/i.test(t)), d.join(" | "));
    const cartel = await page.evaluate(() => document.getElementById("status-banner").textContent);

    await olvidar(page);
    await empujar(page, fila({ moves: ["Rd1+", "Kc7"], active_player_id: "u-ana", active_player_color: "w", arrows: ["e2e4"] }));
    d = await dichos(page);
    const sigue = await page.evaluate(() => document.getElementById("status-banner").textContent);
    igual("el cartel sigue igual tras el eco", sigue === cartel, true);
    si("y el eco no lo repite", !d.some((t) => t.includes(cartel.trim().slice(0, 20))), d.join(" | "));

    await olvidar(page);
    const escondido = await page.evaluate(() => {
      const r = [...document.querySelectorAll('#app [aria-live="polite"]')].find((x) => !x.checkVisibility() && !x.classList.contains("sr-only") && !x.closest(".cc-caja"));
      if (!r) return null;
      r.textContent = "Esto es de un panel que no se ve";
      return r.id;
    });
    await page.waitForTimeout(400);
    si("lo de un panel escondido no se dice", escondido && !(await dichos(page)).some((t) => /panel que no se ve/.test(t)), "región: " + escondido);

    await page.evaluate(() => { const v = document.getElementById("clase-voz"); v.textContent = "Tu profe hizo una pregunta."; });
    await page.waitForTimeout(400);
    si("lo que la clase anuncia en #clase-voz se dice", (await dichos(page)).some((t) => /hizo una pregunta/.test(t)), (await dichos(page)).join(" | "));

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
    await page.waitForTimeout(1500);
    igual("al recargar sigue encendida", await page.getAttribute("#voz-clase-btn", "aria-pressed"), "true");
    // «Tablero de la clase. Juegan…» sí puede oírse: es la posición que llega
    // (lo primero que anuncia el recuadro), no un cartel que ya estaba.
    igual("y no lee de golpe los carteles que ya estaban",
      (await dichos(page)).filter((t) => !/^Tablero de la clase\./.test(t)).join(" | ") || "nada", "nada");

    await page.click("#voz-clase-btn");
    await olvidar(page);
    await empujar(page, fila({ moves: ["Rd1+"] }));
    igual("apagada otra vez, no dice nada", (await dichos(page)).join(" | ") || "nada", "nada");

    igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();
  } finally {
    await browser.close();
  }
  const total = fallos() + mias;
  console.log(total ? "\n" + total + " fallo(s)." : "\nTodo bien: la clase se oye con «Activar voz».");
  process.exit(total ? 1 : 0);
})();
