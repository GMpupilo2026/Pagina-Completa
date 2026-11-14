#!/usr/bin/env node
/* En la práctica de la clase contra el motor, quien no ve (lector de
   pantalla, Modo Adaptado) y quien ve poco (la voz del navegador, sin Modo
   Adaptado) se enteran de la jugada que hizo el motor.

   Lo que caza (nada de esto da error: el motor mueve en silencio):
   1. Lo ÚLTIMO que se escribe en una región viva después de la jugada del
      motor la nombra. Antes la jugada se decía en el recuadro y, cuando
      terminaba de guardarse en la base (con red de verdad, medio segundo
      después), «Es tu turno.» se escribía en otra región y el lector de
      pantalla cortaba la jugada para decir solo eso. Con un doble que guarda
      al instante el orden salía al revés y no se notaba: acá el guardado
      tarda.
   2. La jugada del motor se dice UNA vez, no dos (en el recuadro y en el
      aviso de turno).
   3. La voz del navegador la dice entera, en los dos modos.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-voz-motor.js
*/
"use strict";

const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const sesion = { id: "p1", fen: INICIAL, level: "1500", created_by: "u-profe", reloj_segundos: null, incremento_segundos: 0,
  created_at: new Date().toISOString(), ended_at: null };
const partida = () => ({ id: "pg1", session_id: "p1", student_id: "u-ana", fen: INICIAL, moves: [], status: "playing", student_color: "w", attempts: 1 });

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function caso(browser, titulo, adaptado) {
  console.log("\n=== " + titulo + " ===");
  const r = await abrir(browser, "u-ana", CLASE, { practice_sessions: [sesion], practice_games: [partida()] });
  await r.page.addInitScript((adaptado) => {
    try {
      localStorage.setItem("oscarSpeechMode_v1", "1");
      localStorage.setItem("oscarBlindMode_v1", adaptado ? "1" : "0");
      if (adaptado) localStorage.setItem("ai_vision_v1", JSON.stringify({ vision: "ciego" }));
      else localStorage.removeItem("ai_vision_v1");
    } catch (e) {}
    /* La voz de mentira, con los tiempos de una de verdad: cada frase tarda
       según su largo, se dicen en fila y cancel() corta la que suena y vacía
       la fila. `__oido` es lo que llegó a decirse ENTERO. */
    window.__oido = [];
    let fila = [], sonando = null, reloj = null;
    function siguiente() {
      sonando = fila.shift() || null;
      if (!sonando) return;
      reloj = setTimeout(() => {
        window.__oido.push(sonando.text);
        const u = sonando; sonando = null;
        if (u.onend) u.onend();
        siguiente();
      }, 50 * sonando.text.length);
    }
    const falso = {
      speak(u) { fila.push(u); if (!sonando) siguiente(); },
      cancel() {
        clearTimeout(reloj);
        const cortadas = [sonando].concat(fila).filter(Boolean);
        fila = []; sonando = null;
        cortadas.forEach((u) => u.onerror && u.onerror());
      },
      getVoices() { return []; }, addEventListener() {},
      get speaking() { return !!sonando; }, get pending() { return fila.length > 0; },
    };
    Object.defineProperty(window, "speechSynthesis", { value: falso, configurable: true });
  }, adaptado);
  await r.page.reload({ waitUntil: "domcontentloaded" });
  await r.page.waitForFunction(() => typeof practiceBoard !== "undefined" && practiceBoard && practiceBoard.interactive, null, { timeout: 15000 });
  await r.page.evaluate(() => {
    window.PracticeEngine = Object.assign({}, window.PracticeEngine, {
      preload() {},
      evaluate: async () => null,
      responder: () => new Promise((ok) => setTimeout(() => ok({ uci: "e7e5", respaldo: false }), 800)),
    });
    /* Guardar en la base tarda, como con red de verdad. */
    const desde = sb.from.bind(sb);
    sb.from = (tabla) => {
      const q = desde(tabla);
      if (tabla !== "practice_games") return q;
      const update = q.update.bind(q);
      q.update = (patch) => {
        const u = update(patch);
        const eq = u.eq.bind(u);
        u.eq = (...a) => new Promise((ok) => setTimeout(() => ok(eq(...a)), 700));
        return u;
      };
      return q;
    };
    /* Lo que se escribe en las regiones vivas que se ven, en orden: es lo que
       un lector de pantalla tiene para decir. */
    window.__avisos = [];
    const REGION = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]';
    new MutationObserver((ms) => {
      ms.forEach((m) => {
        const el = (m.target.nodeType === 1 ? m.target : m.target.parentElement);
        const region = el && el.closest(REGION);
        if (!region) return;
        const caja = region.classList.contains("cc-msg") ? region.closest(".cc-caja") : null;
        const seVe = (caja ? caja.parentElement : region).checkVisibility();
        const texto = region.textContent.replace(/\s+/g, " ").trim();
        if (seVe && texto && window.__avisos[window.__avisos.length - 1] !== texto) window.__avisos.push(texto);
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await r.page.waitForTimeout(1800);   // la calma de la carga de js/voz-pagina.js
  await r.page.evaluate(() => { window.__oido = []; window.__avisos = []; });
  if (adaptado) {
    // Como lo hace el alumno que no ve: escribe la jugada en el recuadro.
    await r.page.fill("#practice-cmd input", "e4");
    await r.page.press("#practice-cmd input", "Enter");
  } else {
    await r.page.evaluate(() => practiceBoard.jugar({ from: "e2", to: "e4" }));
  }
  await r.page.waitForFunction(() => practiceBoard.game.history().length === 2 && practiceBoard.interactive, null, { timeout: 10000 });
  await r.page.waitForTimeout(6000);
  const { oido, avisos } = await r.page.evaluate(() => ({ oido: window.__oido, avisos: window.__avisos }));
  console.log("    regiones vivas: " + JSON.stringify(avisos));
  console.log("    voz, entero:    " + JSON.stringify(oido));
  const nombraLaDelMotor = (t) => /motor jug/i.test(t) && /\be5\b|eva 5/i.test(t);
  igual("lo último que se anuncia es la jugada del motor", nombraLaDelMotor(avisos[avisos.length - 1] || ""), true);
  igual("y se anuncia una sola vez", avisos.filter(nombraLaDelMotor).length, 1);
  igual("la voz la dice entera", oido.filter(nombraLaDelMotor).length, 1);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await caso(browser, "Ciego: Modo Adaptado, escribe la jugada", true);
    await caso(browser, "Baja visión: voz sin Modo Adaptado, mueve en el tablero", false);
  } catch (e) {
    console.log("ERROR: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
