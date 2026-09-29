#!/usr/bin/env node
/* «Lo que más le costó a tu clase», en el panel del profe (clases.html).

   Las preguntas de jugada de los últimos 30 días que más falló su clase las
   cuenta la base (preguntas_que_costaron, SECURITY INVOKER y solo las de
   quien pregunta: comprobado impersonando, un alumno no ve ninguna). Se
   comprueba:
   - que la tarjeta muestre cada una con su posición (64 casillas, de verdad
     en pantalla), cuántos la fallaron y de qué clase era, y el enunciado por
     textContent;
   - que «Armar un plan de repaso» cree UN plan con un renglón de posición por
     pregunta, en el mismo orden, y lleve a planes.html?plan=<id>;
   - que planes.html?plan= abra ese plan;
   - que sin preguntas falladas la tarjeta no aparezca, y que al alumno no se
     le pida.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-lo-que-costo.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const P = require("./verificar-panel.js");

const TRAS_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
const PASILLO = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const COSTARON = [
  { question_id: "q1", fen: PASILLO, prompt: "Mate en uno <b>ya</b>", created_at: "2026-09-12T22:00:00Z", clase_titulo: "Finales", respondieron: 15, fallaron: 14 },
  { question_id: "q2", fen: TRAS_E5, prompt: null, created_at: "2026-09-20T22:00:00Z", clase_titulo: null, respondieron: 13, fallaron: 9 },
];
const PANEL = { alumnos: 29, activos_7d: 11, tareas_pendientes: 0, tareas_vencidas: 0, clases_30d: 8 };

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

(async () => {
  const browser = await chromium.launch({ executablePath: P.CHROME });
  try {
    console.log("\n=== La tarjeta del profe ===");
    const { page, ctx, errores } = await P.panel(browser, [P.PROFE], "u-profe", null, { rpc: { panel_profesor: [PANEL], preguntas_que_costaron: COSTARON } });
    await page.waitForFunction(() => { const c = document.getElementById("lo-que-costo"); return c && c.checkVisibility(); }, null, { timeout: 10000 });
    const items = await page.evaluate(() => [...document.querySelectorAll("#lo-que-costo ol li")].map((li) => [...li.querySelectorAll("p")].map((p) => p.textContent)));
    igual("cada una: cuántos la fallaron, el enunciado y de qué clase", items, [
      ["14 de 15 la fallaron (93 %)", "Mate en uno <b>ya</b>", "«Finales», 12 de septiembre"],
      ["9 de 13 la fallaron (69 %)", "¿Qué jugarías?", "Clase del 20 de septiembre"]]);
    igual("el enunciado con HTML no crea nodos", await page.evaluate(() => document.querySelectorAll("#lo-que-costo b").length), 0);
    igual("con su posición, de verdad en pantalla", await page.evaluate(() => [...document.querySelectorAll("#lo-que-costo .nota-posicion")]
      .map((d) => [d.children.length, d.checkVisibility(), d.querySelectorAll(".piece-white, .piece-black").length])), [[64, true, 9], [64, true, 32]]);
    igual("la pide para 30 días", await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "preguntas_que_costaron").map((c) => c.args)), [{ p_dias: 30 }]);

    await page.getByRole("button", { name: "Armar un plan de repaso con estas 2" }).click();
    await page.waitForSelector("#lo-que-costo a[href^='planes.html?plan=']", { timeout: 5000 });
    const ins = await page.evaluate(() => window.__inserts.map((i) => [i.tabla, i.fila]));
    igual("un plan del profe", [ins[0][0], ins[0][1].profesor_id, /^Repaso: lo que más costó/.test(ins[0][1].titulo)], ["planes_clase", "u-profe", true]);
    igual("con un renglón de posición por pregunta, en orden", ins.slice(1).map(([t, f]) => [t, f.plan_id, f.orden, f.tipo, f.fen, f.pregunta]),
      [["plan_items", "planes_clase-1", 0, "posicion", PASILLO, "Mate en uno <b>ya</b>"], ["plan_items", "planes_clase-1", 1, "posicion", TRAS_E5, null]]);
    igual("y lleva al plan", await page.getAttribute("#lo-que-costo a[href^='planes.html?plan=']", "href"), "planes.html?plan=planes_clase-1");
    igual("sin errores en la página", errores, []);
    await ctx.close();

    console.log("\n=== Sin preguntas falladas, o para el alumno ===");
    let r = await P.panel(browser, [P.PROFE], "u-profe", null, { rpc: { panel_profesor: [PANEL], preguntas_que_costaron: [] } });
    await r.page.waitForTimeout(800);
    igual("sin nada que repetir, la tarjeta no aparece", await r.page.evaluate(() => document.getElementById("lo-que-costo").checkVisibility()), false);
    await r.ctx.close();
    r = await P.panel(browser, [P.ALUMNA, P.PROFE], "u-ana", null, P.datosAlumna ? P.datosAlumna() : {});
    await r.page.waitForTimeout(800);
    igual("al alumno no se le pide", await r.page.evaluate(() => window.__consultas.some((c) => c.tabla === "preguntas_que_costaron")), false);
    await r.ctx.close();
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  const fs = require("fs"), path = require("path");
  console.log("\n=== planes.html?plan= abre ese plan ===");
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "planes.js"), "utf8");
  igual("planes.js lee ?plan= y lo abre si es uno de sus planes",
    /get\("plan"\)/.test(src) && /planes\.some\(\(p\) => p\.id === pedido\)\) await abrirPlan\(pedido\)/.test(src), true);
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el profe ve lo que más le costó a su clase y lo manda al plan.");
  process.exit(fallos ? 1 : 0);
})();
