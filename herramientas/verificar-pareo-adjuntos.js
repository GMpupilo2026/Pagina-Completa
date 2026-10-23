/* Pareo Integral, los árbitros adjuntos (js/pareo/pagina.js, js/pareo/ver.js):
 *
 *   - el enlace del adjunto lleva su nombre (sin nombre no se crea), y cada
 *     resultado dice quién lo anotó;
 *   - cambiar un resultado ya anotado pide confirmarlo y deja la constancia
 *     en las incidencias: en la computadora del principal y, desde su
 *     celular, el adjunto en lo que él mismo anotó (lo de otro nunca se pisa);
 *   - el chat entre el principal y los adjuntos, a todos o a uno;
 *   - «Necesito al principal en esta mesa»: le llega al principal arriba de
 *     la ronda, con «Voy», y el adjunto ve que va en camino.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-adjuntos.js
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
const dialogo = "dialog[data-avisos][open]";

function torneo() {
  const t = T.nuevo({ nombre: "PRUEBA ADJUNTOS", arbitro: "PRUEBA PRINCIPAL", rondasTotales: 3,
    jugadores: ["a", "b", "c", "d", "e", "f"].map((id, k) => ({ id, nombre: "PRUEBA " + id.toUpperCase(), elo: 1800 - 50 * k, retiradoDespuesDe: null })) });
  T.fijarNumeracion(t);
  t.rondas = [{ mesas: [{ b: "a", n: "d", r: null }, { b: "e", n: "b", r: null }, { b: "c", n: "f", r: null }], ausencias: {} }];
  return t;
}
const sembrar = (t) => (page) => page.addInitScript((x) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1 }]));
  localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
  localStorage.setItem("pareo_abierto_v1", "tp");
}, t);
const ultimoEstado = (page, canal) => page.evaluate((c) => (window.__enviados.filter((x) => x.canal === c && x.evento === "estado").pop() || {}).payload, canal);

async function pruebaPrincipal(browser) {
  console.log("\n=== El enlace del adjunto lleva su nombre ===");
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(torneo()));
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-adjunto");
  await page.waitForSelector(dialogo);
  await page.click(dialogo + " [data-avisos-aceptar]");
  ok(/Escribe el nombre del árbitro adjunto/.test(await page.textContent("body")) && !(await page.$(".pi-adjunto-url")), "sin nombre no se crea");
  await page.click("#pi-adjunto");
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="arbitro"]', "PRUEBA ADJUNTA");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForSelector(".pi-adjunto-url");
  ok(/PRUEBA ADJUNTA · /.test(await page.textContent("[data-adjunto]")), "su tarjeta dice su nombre");
  const codigo = (await page.textContent(".pi-adjunto-url")).split("#adjunto=")[1].split("&")[0];
  const canal = "pareo-adjunto-" + codigo;
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "estado"), canal);
  igual("a su celular le llega su nombre y el del principal", [(await ultimoEstado(page, canal)).arbitro, (await ultimoEstado(page, canal)).principal], ["PRUEBA ADJUNTA", "PRUEBA PRINCIPAL"]);

  console.log("\n=== Quién anotó, y corregir con constancia ===");
  const llega = (evento, p) => page.evaluate(([c, e, x]) => window.__llega(c, e, x), [canal, evento, p]);
  await llega("resultado", { ronda: 1, mesa: 1, r: "1-0" });
  await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[0].r === "1-0");
  ok(/lo anotó PRUEBA ADJUNTA/.test(await page.textContent("#pi-ronda")), "la mesa dice quién la anotó");
  ok((await ultimoEstado(page, canal)).mesas[0].mia, "y a su celular le dice que es suya (la puede corregir)");
  await llega("resultado", { ronda: 1, mesa: 1, r: "0-1", corrige: true });
  let [g] = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[0].r === "0-1");
  ok((g.rondas[0].incidencias || []).some((x) => x.tipo === "correccion" && /Corregido por el adjunto PRUEBA ADJUNTA/.test(x.texto) && /1-0/.test(x.texto)), "el adjunto corrige la suya, y queda la constancia", JSON.stringify(g.rondas[0].incidencias));
  // Una que anotó el principal: el adjunto no la pisa.
  await page.selectOption("#pi-mesa-1", "=");
  await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[1].r === "=");
  await llega("resultado", { ronda: 1, mesa: 2, r: "1-0", corrige: true });
  await page.waitForTimeout(300);
  [g] = await P.leerTodos(page);
  ok(g.rondas[0].mesas[1].r === "=" && (g.rondas[0].discrepancias || []).length === 1, "lo que anotó el principal no se pisa: queda para confirmar");

  console.log("\n=== El principal cambia uno ya anotado ===");
  await page.selectOption("#pi-mesa-2", "1-0");
  await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[2].r === "1-0");
  await page.selectOption("#pi-mesa-2", "0-1");
  await page.waitForSelector(dialogo);
  ok(/¿Cambiar el resultado de la mesa 3 de 1-0 a 0-1\?/.test(await page.textContent(dialogo)), "pide confirmarlo, diciendo de qué a qué", await page.textContent(dialogo));
  await page.click(dialogo + " [data-avisos-cancelar]");
  await page.waitForTimeout(200);
  igual("«Dejarlo como estaba» no lo cambia", [(await P.leerTodos(page))[0].rondas[0].mesas[2].r, await page.$eval("#pi-mesa-2", (s) => s.value)], ["1-0", "1-0"]);
  await page.selectOption("#pi-mesa-2", "0-1");
  await page.waitForSelector(dialogo);
  await page.click(dialogo + " [data-avisos-aceptar]");
  [g] = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[2].r === "0-1");
  ok(g.rondas[0].incidencias.some((x) => x.mesa === 3 && /Corregido por el árbitro principal/.test(x.texto)), "con «Sí, cambiarlo» se cambia y queda la constancia");

  console.log("\n=== El chat y las llamadas ===");
  await llega("chat", { texto: "PRUEBA hola principal" });
  await page.waitForFunction(() => /PRUEBA hola principal/.test((document.getElementById("pi-chat-lista") || {}).textContent || ""));
  bien("el mensaje del adjunto llega al chat del principal, con su nombre");
  await page.fill("#pi-chat-texto", "PRUEBA voy en un rato");
  await page.click("#pi-chat-mandar");
  await page.waitForFunction((c) => { const x = window.__enviados.filter((y) => y.canal === c && y.evento === "estado").pop(); return x && x.payload.chat.some((m) => m.texto === "PRUEBA voy en un rato" && m.de === "principal"); }, canal);
  bien("y lo que escribe el principal le llega al adjunto");
  await llega("llamada", { mesa: 2 });
  await page.waitForSelector("#pi-llamadas [data-voy]");
  ok(/PRUEBA ADJUNTA te llama a la mesa 2/.test(await page.textContent("#pi-llamadas")) && await P.vis(page, "#pi-llamadas"), "la llamada sale arriba de la ronda");
  await llega("llamada", { mesa: 9 });
  await page.waitForTimeout(200);
  igual("de una mesa que no es suya, no", await page.$$eval("#pi-llamadas [data-voy]", (l) => l.length), 1);
  await page.click("#pi-llamadas [data-voy]");
  await page.waitForFunction((c) => { const x = window.__enviados.filter((y) => y.canal === c && y.evento === "estado").pop(); return x && x.payload.llamadas.some((l) => l.atendida) && x.payload.chat.some((m) => /Voy para la mesa 2/.test(m.texto)); }, canal);
  ok(!(await P.vis(page, "#pi-llamadas")), "«Voy»: se va de la lista y se lo dice al adjunto");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaCelular(browser) {
  console.log("\n=== Lo que ve el adjunto en su celular ===");
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "#adjunto=prueba12&m=1-3");
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  const canal = "pareo-adjunto-prueba12";
  const estado = (extra) => page.evaluate(([c, p]) => window.__llega(c, "estado", p), [canal, Object.assign({
    nombre: "PRUEBA ADJUNTOS", ronda: 1, arbitro: "PRUEBA ADJUNTA", principal: "PRUEBA PRINCIPAL", chat: [], llamadas: [],
    mesas: [{ m: 1, f: 1, b: "PRUEBA A", n: "PRUEBA D", r: "1-0", mia: true }, { m: 2, f: 2, b: "PRUEBA E", n: "PRUEBA B", r: "=", mia: false }, { m: 3, f: 3, b: "PRUEBA C", n: "PRUEBA F", r: null }],
  }, extra)]);
  await estado({});
  await page.waitForSelector("#pi-adj-quien");
  ok(/Árbitro adjunto: PRUEBA ADJUNTA · Principal: PRUEBA PRINCIPAL/.test(await page.textContent("#pi-adj-quien")), "dice quién es él y quién es el principal");
  ok(await page.$('[data-corregir="1"] button') && !(await page.$('[data-corregir="2"]')), "«Corregir» solo en lo que anotó él");
  await page.click('[data-corregir="1"] button');
  await page.selectOption('[data-corregir="1"] select', "0-1");
  ok(/¿Cambiar el resultado de la mesa 1 de 1-0 a 0-1\?/.test(await page.textContent('[data-corregir="1"]')), "pide confirmarlo antes de mandarlo");
  await page.click('[data-corregir="1"] button:has-text("Sí, cambiarlo")');
  const corr = await page.evaluate((c) => window.__enviados.filter((x) => x.canal === c && x.evento === "resultado").pop(), canal);
  igual("y lo manda como corrección", corr && [corr.payload.mesa, corr.payload.r, corr.payload.corrige], [1, "0-1", true]);
  await page.selectOption("#pi-adj-llamar-mesa", "2");
  await page.click("#pi-adj-llamar");
  const ll = await page.evaluate((c) => window.__enviados.filter((x) => x.canal === c && x.evento === "llamada").pop(), canal);
  igual("«Necesito al principal en esta mesa» avisa con la mesa", ll && ll.payload.mesa, 2);
  await page.fill("#pi-adj-chat-texto", "PRUEBA mensaje");
  await page.click("#pi-adj-chat-mandar");
  const ch = await page.evaluate((c) => window.__enviados.filter((x) => x.canal === c && x.evento === "chat").pop(), canal);
  igual("el chat le manda su mensaje al principal", ch && ch.payload.texto, "PRUEBA mensaje");
  await estado({ chat: [{ hora: Date.now(), de: "principal", nombre: "PRUEBA PRINCIPAL", texto: "PRUEBA ya voy" }], llamadas: [{ hora: Date.now(), mesa: 2, atendida: Date.now() }] });
  await page.waitForFunction(() => /PRUEBA ya voy/.test(document.getElementById("pi-adj-chat-lista").textContent));
  ok(/El principal va para la mesa 2/.test(await page.textContent("#pi-adj-llamar-estado")), "ve la respuesta del principal y que va en camino");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPrincipal(browser);
    await pruebaCelular(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
