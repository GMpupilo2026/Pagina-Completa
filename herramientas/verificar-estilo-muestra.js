/* Comprueba estilo-muestra.html (la muestra de la prueba de estilo, sin
 * cuenta) en un navegador de verdad.
 *
 *   1. LAS POSICIONES: doce, las tres más simples de cada eje entre las de la
 *      versión corta (EstiloMedidas.complejidad, a igualdad por id), una de
 *      cada eje por turno. Elegidas a ojo, la muestra mediría otra cosa que
 *      la prueba.
 *   2. SE CONTESTA: con el ratón y escribiendo (A o B en el cuadro de
 *      comandos del Modo Adaptado), con la jugada escrita en cada botón.
 *   3. EL RESULTADO dice lo que eligió («en 3 de 3») y hacia dónde se
 *      inclina, en cada eje, y tres aperturas (una por grupo) de nivel 1:
 *      quien empieza no recibe teoría de más. Al revés, otras aperturas.
 *   4. NO MANDA NADA: ningún pedido a la base ni a otro servidor (la página
 *      dice «no se guarda nada»), y la página no carga el cliente de la base.
 *   5. LAS PUERTAS: a la inscripción y a la prueba completa; y la portada
 *      enlaza la muestra.
 *
 * Uso:  node herramientas/verificar-todo.js estilo-muestra
 */
"use strict";
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

async function contestar(page, lado, escribiendo) {
  // lado 0: siempre el primer polo (atacar, abrir, cambiar, material); 1: el segundo.
  for (let k = 0; k < 12; k++) {
    await page.waitForFunction((n) => document.getElementById("q-counter").textContent.startsWith("Posición " + n + " "), k + 1);
    const e = await page.evaluate((l) => {
      const B = window.EstiloItems, M = window.EstiloMedidas;
      const it = window.EstiloMuestra.posiciones()[Number(document.getElementById("q-counter").textContent.match(/\d+/)[0]) - 1];
      return it.a.polo === M.POLOS[it.eje][l] ? "a" : "b";
    }, lado);
    if (escribiendo) {
      await page.fill("#q-comandos input", e.toUpperCase());
      await page.press("#q-comandos input", "Enter");
    } else {
      await page.click('#q-options [data-eleccion="' + e + '"]');
    }
  }
  await page.waitForFunction(() => !document.getElementById("resultado-view").classList.contains("hidden"));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  const afuera = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (!u.href.startsWith(BASE)) afuera.push(u.href); });
  await page.goto(BASE + "/estilo-muestra.html");
  await page.waitForFunction(() => window.EstiloMuestra && window.EstiloItems);

  console.log("\n=== 1. Las posiciones ===");
  const pos = await page.evaluate(() => {
    const B = window.EstiloItems, M = window.EstiloMedidas;
    const corta = new Set(B.FORMAS[3].posiciones);
    const esperadas = {};
    for (const e of B.FORMAS[3].ejes) {
      esperadas[e] = B.ITEMS.filter((i) => i.eje === e && corta.has(i.id))
        .map((i) => [M.complejidad(Chess, i.fen), i.id]).sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1)).slice(0, 3).map((x) => x[1]);
    }
    const lista = window.EstiloMuestra.posiciones();
    return { ids: lista.map((i) => i.id), ejes: lista.map((i) => i.eje), esperadas, orden: B.FORMAS[3].ejes };
  });
  ok("doce posiciones", pos.ids.length === 12, pos.ids.join(","));
  ok("las tres más simples de cada eje de la versión corta",
    pos.orden.every((e) => JSON.stringify(pos.ids.filter((_, i) => pos.ejes[i] === e)) === JSON.stringify(pos.esperadas[e])), JSON.stringify(pos.esperadas));
  ok("una de cada eje por turno", pos.ejes.every((e, i) => e === pos.orden[i % 4]), pos.ejes.join(","));

  console.log("\n=== 2 y 3. Contestar y el resultado ===");
  await page.click("#start-btn");
  await page.waitForSelector("#q-options [data-eleccion]");
  const boton = await page.textContent('#q-options [data-eleccion="a"]');
  ok("cada botón dice la jugada, en español y en palabras", /^Jugada A: \S+ \((el|la) .+ de [a-h][1-8] a [a-h][1-8]|^Jugada A: \S+ \(el enroque\)/.test(boton), boton);
  ok("el tablero se ve", await page.evaluate(() => document.querySelector("#q-board").checkVisibility() && document.querySelectorAll("#q-board [data-square]").length === 64));
  await contestar(page, 0, false);
  const r0 = await page.evaluate(() => ({
    ejes: [...document.querySelectorAll("#r-ejes [data-eje]")].map((li) => li.textContent),
    grupos: [...document.querySelectorAll("#r-aperturas [data-grupo]")].map((d) => d.dataset.grupo),
    aperturas: [...document.querySelectorAll("#r-aperturas [data-grupo] p:nth-child(2)")].map((p) => p.textContent),
    niveles: [...document.querySelectorAll("#r-aperturas [data-grupo] p:nth-child(2)")].map((p) => (window.AperturasLineas.LINEAS.find((l) => l.nombre === p.textContent) || {}).nivel),
    visible: document.getElementById("resultado-view").checkVisibility(),
  }));
  ok("el resultado se ve", r0.visible);
  ok("cada eje dice hacia dónde se inclina y lo que eligió («3 de 3»)",
    r0.ejes.length === 4 && r0.ejes.every((t) => /Te inclinas a: /.test(t) && /en 3 de 3\)/.test(t)), r0.ejes.join(" | "));
  ok("atacar, abrir, cambiar y quedarse con el material", /atacar al rey/.test(r0.ejes[0]) && /abrir el juego/.test(r0.ejes[1]) && /cambiar piezas/.test(r0.ejes[2]) && /quedarse con el material/.test(r0.ejes[3]), r0.ejes.join(" | "));
  ok("tres aperturas, una por grupo", JSON.stringify(r0.grupos) === JSON.stringify(["blancas", "e4", "d4"]), r0.grupos.join(","));
  ok("todas de nivel 1 (quien empieza, poca teoría)", r0.niveles.every((n) => n === 1), JSON.stringify(r0.niveles) + " " + r0.aperturas.join(", "));

  // Al revés, y escribiendo: en Modo Adaptado se contesta con A o B.
  await page.evaluate(() => { try { localStorage.setItem("oscarBlindMode_v1", "1"); } catch (e) {} });
  await page.reload();
  await page.waitForFunction(() => window.EstiloMuestra && window.EstiloItems);
  await page.click("#start-btn");
  await page.waitForSelector("#q-comandos input", { state: "visible", timeout: 10000 });
  ok("en Modo Adaptado, el cuadro de comandos para contestar escribiendo", await page.isVisible("#q-comandos input"));
  await contestar(page, 1, true);
  const r1 = await page.evaluate(() => ({
    ejes: [...document.querySelectorAll("#r-ejes [data-eje]")].map((li) => li.textContent),
    aperturas: [...document.querySelectorAll("#r-aperturas [data-grupo] p:nth-child(2)")].map((p) => p.textContent),
  }));
  ok("al revés: maniobrar, cerrar, mantener y la iniciativa («0 de 3»)",
    /maniobrar/.test(r1.ejes[0]) && /mantenerlo cerrado/.test(r1.ejes[1]) && /mantener las piezas/.test(r1.ejes[2]) && /iniciativa/.test(r1.ejes[3]) && r1.ejes.every((t) => /en 0 de 3\)/.test(t)), r1.ejes.join(" | "));
  ok("y otras aperturas", r1.aperturas.join() !== r0.aperturas.join(), r0.aperturas.join(", ") + " / " + r1.aperturas.join(", "));

  console.log("\n=== 4. No manda nada ===");
  ok("ningún pedido fuera del sitio", afuera.length === 0, afuera.slice(0, 5).join(", "));
  ok("no carga el cliente de la base", await page.evaluate(() => !document.querySelector('script[src*="supabase"]')));

  console.log("\n=== 5. Las puertas ===");
  const puertas = await page.evaluate(() => [...document.querySelectorAll("#resultado-view a")].map((a) => a.getAttribute("href")));
  ok("a la inscripción y a la prueba completa", puertas.includes("precios.html") && puertas.includes("entreno/estilo.html"), puertas.join(", "));
  await page.goto(BASE + "/index.html");
  ok("la portada enlaza la muestra", await page.evaluate(() => !!document.querySelector('a[href="estilo-muestra.html"]')));

  errores.forEach((e) => ok("sin errores en la página", false, e));
  await browser.close();
  if (fallos) { console.log("\n" + fallos + " comprobación(es) fallaron"); process.exit(1); }
  console.log("\nTodo bien: la muestra de la prueba de estilo.");
})().catch((e) => { console.error(e); process.exit(1); });
