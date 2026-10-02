/* Comprueba entreno/finales.html en un navegador, con el doble de Supabase de
   Entrenamiento y un MOTOR DE MENTIRA (js/practice-engine.js reemplazado): el
   de verdad tarda segundos por jugada y juega distinto según la máquina, y lo
   que se prueba acá es la página, no Stockfish (el banco lo comprobó el motor
   al generarlo: verificar-finales.js).

   - Carga todos los finales del banco, con la meta y el bando escritos.
   - GANAR: el mate del alumno cuenta, queda marcado (✓) y se registra UNA vez
     en training_progress como 'finales'. Volver a ganarlo no se registra otra.
   - SALVAR: aguantar las jugadas pedidas con la posición en tablas cuenta; si
     el motor dice que ya está perdida, NO cuenta ni se registra.
   - Si la posición es del otro bando, empieza la máquina.
   - Si el motor no contesta al comprobar, no se da por logrado.

   Uso:  npm install; node herramientas/verificar-todo.js finales-pagina       */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { clienteFalso, BASE } = require("./lib/doble-entreno");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* El motor de mentira: juega la primera jugada legal (en el orden de
   chess.js), y evalúa lo que la prueba le ponga en window.__eval (null = el
   motor no contesta). */
const MOTOR_FALSO = `
window.PracticeEngine = {
  LEVELS: { max: {} },
  preload() {},
  jugadaDeRespaldo() { return null; },
  async getMove(fen) {
    const m = new Chess(fen).moves({ verbose: true })[0];
    return m ? m.from + m.to + (m.promotion || "") : null;
  },
  async evaluate() { return window.__eval === undefined ? { type: "cp", value: 0 } : window.__eval; },
  async responder(fen, nivel) { return { uci: await this.getMove(fen, nivel), respaldo: false }; },
};`;

/* Un banco chico para las pruebas, con posiciones que se resuelven en una o
   dos jugadas. El de verdad se prueba aparte (que cargue entero). */
const BANCO_PRUEBA = {
  aguantar: 2,
  finales: [
    { id: "mate-en-uno", titulo: "Mate en uno", meta: "ganar", alumno: "w",
      fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", idea: "La fila de atrás.", pista: "Torre a la octava." },
    { id: "aguanta", titulo: "Aguanta", meta: "tablas", alumno: "b",
      fen: "7k/8/8/8/8/8/8/K6R b - - 0 1", idea: "Aguanta.", pista: "Mueve el rey." },
    { id: "empieza-maquina", titulo: "Empieza la máquina", meta: "tablas", alumno: "b",
      fen: "7k/8/8/8/8/8/8/K6R w - - 0 1", idea: "Aguanta.", pista: "Mueve el rey." },
  ],
};

async function abrir(browser, banco, local) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  if (local) await ctx.addInitScript((l) => { for (const k in l) localStorage.setItem(k, l[k]); }, local);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso({}) }));
  await ctx.route("**/js/shared-engine.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/practice-engine.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: MOTOR_FALSO }));
  if (banco) await ctx.route("**/entreno/data/finales.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(banco) }));
  await page.goto(BASE + "/entreno/finales.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll("#tabs .tab").length > 0, { timeout: 10000 });
  return { page, ctx, errores };
}
const clic = (page, sq) => page.click(`#board [data-square="${sq}"]`);
/* Dónde está el rey negro, leído de la partida de la página (el `game` de
   js/entreno-finales.js) y no del DOM: las casillas del borde llevan también
   la etiqueta de la coordenada, y «la casilla con algo adentro» mentía. */
const reyNegro = (page) => page.evaluate(() => {
  for (const f of "abcdefgh") for (let r = 1; r <= 8; r++) {
    const p = game.get(f + r);
    if (p && p.type === "k" && p.color === "b") return f + r;
  }
  return null;
});
const estado = (page) => page.evaluate(() => document.getElementById("round-status").textContent);
const resultado = (page) => page.evaluate(() => ({
  visible: document.getElementById("celebration").checkVisibility(),
  titulo: document.getElementById("celebration-title").textContent,
}));
const inserts = (page) => page.evaluate(() => window.__inserts.filter((i) => i.tabla === "training_progress").map((i) => i.rows[0]));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== El banco de verdad carga entero ===");
    {
      const { page, ctx, errores } = await abrir(browser, null);
      const tabs = await page.evaluate(() => Array.from(document.querySelectorAll("#tabs .tab")).map((b) => b.textContent));
      igual("todos los finales del banco en las pestañas", tabs.length, String(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "entreno/data/finales.json"), "utf8")).finales.length));
      igual("cada pestaña dice su meta escrita (en la etiqueta accesible)",
        await page.evaluate(() => Array.from(document.querySelectorAll("#tabs .tab")).every((b) => /: (ganar|salvar)/.test(b.getAttribute("aria-label")))), "true");
      igual("empieza por el primero sin lograr", await page.evaluate(() => document.getElementById("final-titulo").textContent), "El peón pasado lejano");
      igual("el aviso dice con qué bando y qué meta",
        await page.evaluate(() => document.getElementById("turn-banner").textContent), "Juegas con blancas. Meta: ganar — dar mate.");
      igual("el tablero se ve desde el bando del alumno (a1 abajo a la izquierda)",
        await page.evaluate(() => document.querySelectorAll("#board .sq")[56].dataset.square), "a1");
      igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
      await ctx.close();
    }

    console.log("\n=== Ganar: el mate cuenta, UNA vez ===");
    {
      const { page, ctx, errores } = await abrir(browser, BANCO_PRUEBA);
      await clic(page, "a1"); await clic(page, "a8");
      await page.waitForFunction(() => document.getElementById("celebration").checkVisibility(), null, { timeout: 5000 });
      igual("dice que ganó", (await resultado(page)).titulo, "¡Jaque mate! Ganaste el final.");
      let filas = await inserts(page);
      igual("se registra como 'finales', con el final y cómo salió",
        filas.map((f) => [f.activity, f.detail.final_id, f.detail.meta, f.detail.limpio]), [["finales", "mate-en-uno", "ganar", true]]);
      igual("queda marcado en la pestaña", await page.evaluate(() => document.querySelector("#tabs .tab").textContent.includes("✓")), "true");
      igual("y en lo que viaja con la cuenta",
        await page.evaluate(() => JSON.parse(localStorage.getItem("entreno_finales_solved"))["mate-en-uno"]), "true");
      // Otra vez: no se registra de nuevo.
      await page.click("#celebration-retry-btn");
      await clic(page, "a1"); await clic(page, "a8");
      await page.waitForFunction(() => document.getElementById("celebration").checkVisibility(), null, { timeout: 5000 });
      filas = await inserts(page);
      igual("ganarlo de nuevo no se registra otra vez", filas.length, "1");
      igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
      await ctx.close();
    }

    console.log("\n=== Salvar: aguantar con la posición en tablas ===");
    {
      const { page, ctx, errores } = await abrir(browser, BANCO_PRUEBA, { entreno_finales_solved: JSON.stringify({ "mate-en-uno": true }) });
      igual("abre el primero sin lograr", await page.evaluate(() => document.getElementById("final-titulo").textContent), "Aguanta");
      await clic(page, "h8"); await clic(page, "g8");
      await page.waitForFunction(() => /La máquina jugó/.test(document.getElementById("round-status").textContent), null, { timeout: 5000 });
      igual("la máquina contesta y dice cuánto lleva", (await estado(page)).includes("Llevas 1 de 2 jugadas"), "true");
      const desde = await reyNegro(page);
      await clic(page, desde); await clic(page, desde === "g8" ? "f8" : "g8");
      await page.waitForFunction(() => document.getElementById("celebration").checkVisibility(), null, { timeout: 5000 });
      igual("aguantó y el motor dice tablas: lo salvó", (await resultado(page)).titulo, "¡Aguantaste 2 jugadas y la posición sigue en tablas! Salvaste el final.");
      igual("y se registra", (await inserts(page)).map((f) => f.detail.final_id), ["aguanta"]);
      igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
      await ctx.close();
    }
    {
      const { page, ctx } = await abrir(browser, BANCO_PRUEBA, { entreno_finales_solved: JSON.stringify({ "mate-en-uno": true }) });
      await page.evaluate(() => { window.__eval = { type: "mate", value: 3 }; });
      for (let i = 0; i < 2; i++) {
        const rey = await reyNegro(page);
        const destino = rey === "h8" ? "g8" : "f8";
        await clic(page, rey); await clic(page, destino);
        if (i === 0) await page.waitForFunction(() => /La máquina jugó/.test(document.getElementById("round-status").textContent), null, { timeout: 5000 });
      }
      await page.waitForFunction(() => document.getElementById("celebration").checkVisibility(), null, { timeout: 5000 });
      igual("si el motor dice que ya está perdida, no cuenta", (await resultado(page)).titulo.startsWith("Llegaste a 2 jugadas, pero la posición ya está perdida"), "true");
      igual("ni se registra", (await inserts(page)).length, "0");
      await ctx.close();
    }
    {
      const { page, ctx } = await abrir(browser, BANCO_PRUEBA, { entreno_finales_solved: JSON.stringify({ "mate-en-uno": true }) });
      await page.evaluate(() => { window.__eval = null; });
      for (let i = 0; i < 2; i++) {
        const rey = await reyNegro(page);
        await clic(page, rey); await clic(page, rey === "h8" ? "g8" : "f8");
        await page.waitForFunction(() => /La máquina jugó|No se pudo comprobar/.test(document.getElementById("round-status").textContent), null, { timeout: 5000 });
      }
      igual("si el motor no contesta, no se da por logrado", (await resultado(page)).visible, "false");
      igual("ni se registra", (await inserts(page)).length, "0");
      await ctx.close();
    }

    console.log("\n=== Si la posición es del otro bando, empieza la máquina ===");
    {
      const { page, ctx, errores } = await abrir(browser, BANCO_PRUEBA,
        { entreno_finales_solved: JSON.stringify({ "mate-en-uno": true, aguanta: true }) });
      igual("abre el que queda", await page.evaluate(() => document.getElementById("final-titulo").textContent), "Empieza la máquina");
      await page.waitForFunction(() => /La máquina jugó/.test(document.getElementById("round-status").textContent), null, { timeout: 5000 });
      igual("la máquina jugó primero y ahora le toca al alumno", (await estado(page)).includes("Te toca"), "true");
      igual("el tablero se ve desde las negras (h8 abajo a la izquierda)",
        await page.evaluate(() => document.querySelectorAll("#board .sq")[56].dataset.square), "h8");
      igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
      await ctx.close();
    }
  } catch (e) {
    console.log("  ✗ " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
