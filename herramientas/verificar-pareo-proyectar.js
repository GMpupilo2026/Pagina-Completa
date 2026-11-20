/* Pareo Integral: la ronda y los resultados en el proyector
 * (js/pareo/proyectar.js y modeloProyector en js/pareo/pagina.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - «Proyectar» está a la vista en Rondas (no en un menú) y abre la
 *     pantalla completa con el foco adentro;
 *   - cada mesa dice su número de la sala (no su posición), los dos nombres,
 *     los puntos de ANTES de la ronda y el resultado corto; las que faltan
 *     dicen «en juego» (escrito: el color nunca va solo);
 *   - cuántos resultados van, y que se pone al día sola al anotar uno en la
 *     computadora (sin volver a abrirla);
 *   - si no caben, hay páginas, y las flechas las pasan;
 *   - C cambia a la clasificación (tras la última ronda completa);
 *   - un nombre con «<b>» se ve tal cual (textContent, no HTML);
 *   - Escape la cierra y el foco vuelve al botón que la abrió;
 *   - «Proyectar la clasificación» antes de la primera ronda completa
 *     dice que todavía no hay.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-proyectar.js
 */
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};

// 40 jugadores, las mesas de la sala desde la 11. La ronda 1 completa (ganan
// las blancas); la 2 con dos mesas sin resultado.
function torneo() {
  const jugadores = Array.from({ length: 40 }, (_, i) => ({ id: "j" + i, nombre: i === 0 ? "PRUEBA <b>CERO</b>" : "PRUEBA JUGADOR " + i, elo: 2000 - i * 10, institucion: "LICEO " + (i % 4) }));
  const t = T.nuevo({ nombre: "PRUEBA PROYECTOR", rondasTotales: 5, mesaInicial: 11, jugadores });
  const r1 = [], r2 = [];
  for (let i = 0; i < 20; i++) r1.push({ b: "j" + i, n: "j" + (i + 20), r: "1-0" });
  // Ronda 2: los ganadores entre sí y los perdedores entre sí.
  for (let i = 0; i < 10; i++) r2.push({ b: "j" + i, n: "j" + (i + 10), r: i < 2 ? null : "=" });
  for (let i = 20; i < 30; i++) r2.push({ b: "j" + i, n: "j" + (i + 10), r: "0-1" });
  t.rondas = [{ mesas: r1, ausencias: {} }, { mesas: r2, ausencias: {} }];
  return t;
}
// Al salir de la pantalla completa el foco vuelve un instante después (el
// navegador sale primero): se espera a que llegue, con un tope.
const focoEn = (page, id) => page.waitForFunction((x) => document.activeElement && document.activeElement.id === x, id, { timeout: 3000 })
  .then(() => id, () => page.evaluate(() => document.activeElement.id));
const sembrar = (t) => (page) => page.addInitScript((x) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1 }]));
  localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
  localStorage.setItem("pareo_abierto_v1", "tp");
  localStorage.setItem("pareo_ficha_v1", "rondas");
}, t);

async function pruebaRonda(browser) {
  console.log("\n=== La ronda en el proyector ===");
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(torneo()));
  await page.waitForSelector("#pi-proyectar-ronda");
  ok(await P.vis(page, "#pi-proyectar-ronda"), "«Proyectar» está a la vista en Rondas, sin abrir ningún menú");
  ok(!(await P.vis(page, "#pi-proyectar")), "la proyección no se ve hasta pedirla");
  await page.click("#pi-proyectar-ronda");
  await page.waitForSelector("#pi-proyectar .pi-py-mesa");
  ok(await P.vis(page, "#pi-proyectar"), "al tocarlo se abre");
  igual("con el foco adentro (en «Salir»)", await page.evaluate(() => document.activeElement.id), "pi-py-salir");
  igual("el título es la ronda", await page.textContent("#pi-py-titulo"), "Ronda 2");
  igual("dice cuántos resultados van", await page.textContent(".pi-py-avance-texto"), "18 de 20 resultados");
  const primera = await page.$$eval("#pi-proyectar .pi-py-mesa:first-child span", (l) => l.map((x) => x.textContent));
  const tarjeta = await page.$eval("#pi-proyectar .pi-py-mesa:first-child", (x) => ({
    mesa: x.querySelector(".pi-py-num").textContent, nombres: [...x.querySelectorAll(".pi-py-nombre")].map((n) => n.textContent),
    pts: [...x.querySelectorAll(".pi-py-pts")].map((n) => n.textContent), res: x.querySelector(".pi-py-res").textContent }));
  igual("la primera mesa: el número de la sala, los nombres, los puntos de antes y «en juego»", tarjeta,
    { mesa: "11", nombres: ["PRUEBA <b>CERO</b>", "PRUEBA JUGADOR 10"], pts: ["1", "1"], res: "en juego" });
  ok(!(await page.$("#pi-proyectar .pi-py-nombre b")), "un nombre con «<b>» se ve tal cual, sin volverse HTML", JSON.stringify(primera));
  igual("las dos que faltan dicen «en juego»", await page.$$eval("#pi-proyectar .pi-py-res-juego", (l) => l.map((x) => x.textContent)), ["en juego", "en juego"]);
  const tercera = await page.$eval("#pi-proyectar .pi-py-mesa:nth-child(3) .pi-py-res", (x) => x.textContent);
  igual("una con resultado, el resultado corto", tercera, "½-½");

  console.log("\n=== Las páginas ===");
  const porPagina = await page.$$eval("#pi-proyectar .pi-py-mesa", (l) => l.length);
  ok(porPagina > 0 && porPagina < 20, "no caben las 20: se parten en páginas", String(porPagina));
  igual("dice en qué página va", (await page.textContent(".pi-py-pagina")).split(" · ")[0], "Página 1 de 2");
  await page.keyboard.press("ArrowRight");
  igual("la flecha pasa a la siguiente", (await page.textContent(".pi-py-pagina")).split(" · ")[0], "Página 2 de 2");
  igual("con las mesas que faltaban", await page.$$eval("#pi-proyectar .pi-py-mesa", (l) => l.length), 20 - porPagina);
  await page.keyboard.press("ArrowLeft");

  console.log("\n=== Se pone al día sola ===");
  // Lo que anota la computadora debajo (el proyector está en otra pantalla).
  await page.evaluate(() => { const s = document.getElementById("pi-mesa-0"); s.value = "1-0"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.waitForFunction(() => /19 de 20/.test(document.querySelector(".pi-py-avance-texto").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("al anotar un resultado, el proyector lo cuenta sin volver a abrirlo", await page.textContent(".pi-py-avance-texto"), "19 de 20 resultados");
  igual("y la mesa muestra el resultado", await page.textContent("#pi-proyectar .pi-py-mesa:first-child .pi-py-res"), "1-0");
  ok(await page.$eval("#pi-proyectar .pi-py-mesa:first-child .pi-py-b", (x) => x.classList.contains("pi-py-gana")), "y marca a quien ganó");

  console.log("\n=== La clasificación ===");
  await page.keyboard.press("c");
  igual("C cambia a la clasificación, tras la última ronda completa", await page.textContent("#pi-py-titulo"), "Clasificación tras la ronda 1");
  const fila = await page.$eval("#pi-proyectar .pi-py-clas", (x) => [x.querySelector(".pi-py-num").textContent, x.querySelector(".pi-py-res").textContent]);
  igual("el primero, con sus puntos", fila, ["1", "1"]);
  await page.keyboard.press("c");
  igual("y otra vez C vuelve a la ronda", await page.textContent("#pi-py-titulo"), "Ronda 2");

  console.log("\n=== Salir ===");
  await page.keyboard.press("Escape");
  ok(!(await P.vis(page, "#pi-proyectar")), "Escape la cierra");
  igual("y el foco vuelve a «Proyectar»", await focoEn(page, "pi-proyectar-ronda"), "pi-proyectar-ronda");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

// Lo que le pasó al dueño (20/11): con la ronda 1 completa, Rondas abre sola
// «Ronda 2 · por emparejar», y «Proyectar» iba adentro de una ronda ya
// emparejada: no aparecía. Ahora está al lado de las rondas y en la Portada.
async function pruebaPorEmparejar(browser) {
  console.log("\n=== Con la siguiente ronda por emparejar ===");
  const t = torneo();
  t.rondas = t.rondas.slice(0, 1);
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.waitForSelector("#pi-rondas-nav button");
  ok(/por emparejar/.test(await page.textContent('#pi-rondas-nav button[aria-pressed="true"]')), "Rondas abre la ronda por emparejar");
  ok(await P.vis(page, "#pi-proyectar-ronda"), "y «Proyectar» igual está a la vista");
  await page.click("#pi-proyectar-ronda");
  await page.waitForSelector("#pi-proyectar .pi-py-mesa");
  igual("proyecta la última emparejada", await page.textContent("#pi-py-titulo"), "Ronda 1");
  await page.keyboard.press("Escape");
  await page.click('[data-ficha="inicio"]');
  ok(await P.vis(page, "#pi-inicio-proyectar"), "en la Portada también está «Proyectar»");
  await page.click("#pi-inicio-proyectar");
  await page.waitForSelector("#pi-proyectar .pi-py-mesa");
  igual("y proyecta la misma ronda", await page.textContent("#pi-py-titulo"), "Ronda 1");
  await page.keyboard.press("Escape");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaSinRondas(browser) {
  console.log("\n=== La clasificación antes de la primera ronda ===");
  const t = torneo();
  t.rondas = [];
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.click('[data-ficha="clasificacion"]');
  ok(await P.vis(page, "#pi-clas-proyectar"), "«Proyectar la clasificación» está en Clasificación");
  await page.click("#pi-clas-proyectar");
  await page.waitForSelector("#pi-proyectar .pi-py-vacio");
  ok(/sale cuando se complete la primera ronda/.test(await page.textContent("#pi-proyectar .pi-py-vacio")), "sin rondas completas, dice que todavía no hay clasificación");
  await page.click("#pi-py-salir");
  igual("«Salir» devuelve el foco a su botón", await focoEn(page, "pi-clas-proyectar"), "pi-clas-proyectar");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaRonda(browser);
    await pruebaPorEmparejar(browser);
    await pruebaSinRondas(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
