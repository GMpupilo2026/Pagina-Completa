/* Comprueba la quiniela de resultados de la sala de cine (js/quiniela.js) y
   su interruptor en el editor de salas, con un doble de la Edge Function
   quiniela (lib/doble-salas-torneo.js) que aplica las mismas reglas y dice los
   mismos mensajes que la base. Las reglas de verdad —el cierre, el correo
   único, el freno, qué ve cada rol— se probaron en SQL impersonando roles:
   ver «La quiniela de resultados» en docs/decisiones/juegos-y-torneos.md.

   Lo que se rompe callado acá: anotarse sin la casilla de la privacidad (o sin
   mandar su versión), un pronóstico que se ve marcado y no se guardó, una
   partida cerrada que igual ofrece botones, o el correo de alguien a la vista.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-quiniela.js                          */
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const { dobleSalas, SALAS } = require("./lib/doble-salas-torneo");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

const CON_QUINIELA = { ...SALAS[0], id: "s-20", clave: "con-quiniela", nombre: "Copa con quiniela", quiniela: true };
const QUINIELA = () => ({
  rondas: [
    { id: "R2xxxxxx", nombre: "Ronda 2", cierra_en: "2026-09-27T16:00:00Z", partidas: [
      { id: "Partida3", mesa: 1, blancas: "Mora, Ana", negras: "Vega, Bea", resultado: null, cerrada: false },
      { id: "Partida4", mesa: 2, blancas: "Soto, Carla", negras: "Rojas, Dana", resultado: null, cerrada: false }] },
    { id: "R1xxxxxx", nombre: "Ronda 1", cierra_en: "2026-09-27T15:00:00Z", partidas: [
      { id: "Partida1", mesa: 1, blancas: "Mora, Ana", negras: "Soto, Carla", resultado: "1-0", cerrada: true },
      { id: "Partida2", mesa: 2, blancas: "Vega, Bea", negras: "Rojas, Dana", resultado: null, cerrada: true }] },
  ],
  participantes: [
    { nombre: "Luis Pérez", correo: "luis@x.cr", token: "t-luis", pronosticos: { Partida1: "1-0" } },
    { nombre: "Eva Solís", correo: "eva@x.cr", token: "t-eva", pronosticos: { Partida1: "0-1" } },
  ],
});

async function abrir(browser, ruta, opciones, antes) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: dobleSalas(opciones) }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  // Lichess: un torneo de una ronda todavía sin partidas (la quiniela no depende de esto).
  await ctx.route("https://lichess.org/**", (r) => {
    const u = r.request().url();
    const h = { "Access-Control-Allow-Origin": "*" };
    if (/\/api\/stream\//.test(u)) return r.fulfill({ status: 404, headers: h, body: "" });
    if (/\/api\/broadcast\/s7NfNv6H$/.test(u)) {
      return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify({ tour: { id: "s7NfNv6H", name: "Copa", slug: "copa" },
        rounds: [{ id: "R1xxxxxx", name: "Ronda 1", slug: "ronda-1", url: "https://lichess.org/broadcast/copa/ronda-1/R1xxxxxx" }], defaultRoundId: "R1xxxxxx" }) });
    }
    return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify({ games: [] }) });
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  if (antes) await page.addInitScript(antes);
  await page.goto(BASE + ruta);
  return { page, ctx, errores };
}

const llamadas = (page) => page.evaluate(() => window.__quiniela);
const tabla = (page) => page.$$eval("#quiniela-tabla tr", (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, " ").trim()));

async function sala(browser) {
  console.log("\n=== La quiniela en la sala ===");
  const { page, ctx, errores } = await abrir(browser, "/transmision.html?torneo=con-quiniela", { salas: SALAS.concat([CON_QUINIELA]), quiniela: QUINIELA() });
  await page.waitForSelector("#quiniela-unirse:not(.hidden)");
  igual("la sección se ve", await page.$eval("#quiniela", (e) => e.checkVisibility()), true);
  igual("la tabla de aciertos, sin medalla para quien tiene 0", await tabla(page), ["🥇 1 Luis Pérez 1 1", "2 Eva Solís 0 1"]);
  igual("ningún correo a la vista", (await page.textContent("#quiniela")).includes("@x.cr"), false);

  console.log("\n— Anotarse —");
  await page.fill("#quiniela-nombre", "Carla Mora");
  await page.fill("#quiniela-correo", "carla@x.cr");
  await page.click("#quiniela-entrar");
  igual("sin la casilla de la privacidad no se anota", [await page.textContent("#quiniela-unirse-msg"), (await llamadas(page)).filter((l) => l.accion === "unirse").length],
    ["Para participar tienes que aceptar la Política de privacidad.", 0]);
  igual("y el foco va a la casilla", await page.evaluate(() => document.activeElement.id), "quiniela-acepto");
  await page.check("#quiniela-acepto");
  await page.fill("#quiniela-correo", "carla-sin-arroba");
  await page.click("#quiniela-entrar");
  igual("un correo mal escrito se dice antes", await page.textContent("#quiniela-unirse-msg"), "Revisa el correo: tiene que ser como nombre@ejemplo.com.");
  await page.fill("#quiniela-correo", "LUIS@x.cr");
  await page.click("#quiniela-entrar");
  await page.waitForFunction(() => document.getElementById("quiniela-unirse-msg").textContent.startsWith("Ese correo"));
  igual("un correo ya anotado lo dice la base", await page.textContent("#quiniela-unirse-msg"), "Ese correo ya está anotado en esta quiniela. Tus pronósticos se cambian desde el navegador donde te anotaste.");
  await page.fill("#quiniela-correo", "carla@x.cr");
  await page.click("#quiniela-entrar");
  await page.waitForSelector("#quiniela-mia:not(.hidden)");
  const unirse = (await llamadas(page)).filter((l) => l.accion === "unirse").pop();
  igual("manda la versión de la política que aceptó", unirse.privacidad, await page.evaluate(() => LegalVersion.PRIVACIDAD));
  igual("queda anotada, y el formulario se va", [await page.textContent("#quiniela-quien"), await page.$eval("#quiniela-unirse", (e) => e.checkVisibility())],
    ["Participas como Carla Mora. Puedes cambiar tus pronósticos hasta que empiece cada ronda.", false]);
  igual("el código queda en este navegador", await page.evaluate(() => localStorage.getItem("quiniela_v1:con-quiniela")), "token-de-prueba-1");

  console.log("\n— Pronosticar —");
  igual("primero la ronda que se puede pronosticar", await page.$$eval("#quiniela-rondas h3", (h) => h.map((x) => x.textContent)), ["Ronda 2", "Ronda 1"]);
  igual("tres botones por partida abierta, ninguno elegido", await page.$$eval('#quiniela-rondas button[data-partida="Partida3"]', (b) => b.map((x) => x.textContent + ":" + x.getAttribute("aria-pressed"))),
    ["Ganan blancas:false", "Tablas:false", "Ganan negras:false"]);
  igual("el grupo dice de qué partida es", await page.$eval('#quiniela-rondas button[data-partida="Partida3"]', (b) => b.parentElement.getAttribute("aria-label")), "Tu pronóstico para la mesa 1 de la ronda 2");
  await page.click('#quiniela-rondas button[data-partida="Partida3"][data-pronostico="½-½"]');
  await page.waitForFunction(() => document.getElementById("quiniela-msg").textContent.startsWith("Guardado"));
  igual("se manda a la función", (await llamadas(page)).filter((l) => l.accion === "pronosticar").pop(), { clave: "con-quiniela", accion: "pronosticar", token: "token-de-prueba-1", partida: "Partida3", pronostico: "½-½" });
  igual("y queda marcado, porque la base lo guardó", await page.$eval('#quiniela-rondas button[data-partida="Partida3"][data-pronostico="½-½"]', (b) => b.getAttribute("aria-pressed")), "true");
  igual("lo dice en palabras", await page.textContent("#quiniela-msg"), "Guardado: mesa 1, tablas.");
  igual("el foco sigue en el botón", await page.evaluate(() => document.activeElement.dataset.pronostico), "½-½");
  igual("una partida cerrada no ofrece botones", await page.$$eval('#quiniela-rondas button[data-partida="Partida1"]', (b) => b.length), 0);
  igual("y dice su resultado", (await page.$$eval("#quiniela-rondas li", (l) => l.map((x) => x.innerText)))[2].includes("No pronosticaste esta partida. Resultado: 1-0 (ganan blancas)."), true);

  console.log("\n— Contraste (AA, contra el fondo real) —");
  const medidas = await page.evaluate(() => {
    const rgb = (t) => (t.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
    const lum = (c) => { const v = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    // El fondo real: el primer ancestro opaco; la sala es un degradado, que cuenta como su color de abajo.
    const fondo = (e) => { while (e) { const cs = getComputedStyle(e); const c = rgb(cs.backgroundColor); if (c.length === 3 || c[3] > 0.5) return c; if (cs.backgroundImage.includes("gradient")) return [7, 13, 23]; e = e.parentElement; } return [7, 13, 23]; };
    const r = (e) => { const [x, y] = [lum(rgb(getComputedStyle(e).color)), lum(fondo(e))].sort((m, n) => n - m); return Math.round((x + 0.05) / (y + 0.05) * 10) / 10; };
    return {
      "botón elegido": r(document.querySelector('#quiniela-rondas button[aria-pressed="true"]')),
      "botón sin elegir": r(document.querySelector('#quiniela-rondas button[aria-pressed="false"]')),
      "quién participa": r(document.getElementById("quiniela-quien")),
      "cierre de la ronda": r(document.querySelector("#quiniela-rondas p.text-xs")),
      "partida cerrada": r(document.querySelectorAll("#quiniela-rondas li p")[5]),
    };
  });
  for (const [k, v] of Object.entries(medidas)) igual("«" + k + "» llega a 4,5:1 (" + v + ")", v >= 4.5, true);
  igual("sin errores de JavaScript", errores, []);
  await ctx.close();

  console.log("\n=== Volver a entrar ===");
  let otra = await abrir(browser, "/transmision.html?torneo=con-quiniela", { salas: SALAS.concat([CON_QUINIELA]), quiniela: QUINIELA() },
    () => localStorage.setItem("quiniela_v1:con-quiniela", "t-luis"));
  await otra.page.waitForSelector("#quiniela-mia:not(.hidden)");
  igual("con el código guardado, entra directo", await otra.page.textContent("#quiniela-quien"), "Participas como Luis Pérez. Puedes cambiar tus pronósticos hasta que empiece cada ronda.");
  igual("y ve cómo le fue", (await otra.page.$$eval("#quiniela-rondas li", (l) => l.map((x) => x.innerText)))[2].includes("Tu pronóstico: Ganan blancas. Resultado: 1-0 (ganan blancas). ✓ Acertaste."), true);
  await otra.ctx.close();

  otra = await abrir(browser, "/transmision.html?torneo=con-quiniela", { salas: SALAS.concat([CON_QUINIELA]), quiniela: QUINIELA() },
    () => localStorage.setItem("quiniela_v1:con-quiniela", "codigo-que-ya-no-vale"));
  await otra.page.waitForSelector("#quiniela-unirse:not(.hidden)");
  igual("un código que ya no vale se olvida, y pide anotarse", await otra.page.evaluate(() => localStorage.getItem("quiniela_v1:con-quiniela")), null);
  await otra.ctx.close();

  otra = await abrir(browser, "/transmision.html?torneo=cenfotec", { salas: SALAS });
  await otra.page.waitForFunction(() => !document.getElementById("cine-contenido").classList.contains("hidden") || !document.getElementById("cine-error").classList.contains("hidden"));
  await otra.page.waitForTimeout(300);
  igual("sin quiniela en la sala, no hay sección ni pedidos", [await otra.page.$eval("#quiniela", (e) => e.checkVisibility()), (await llamadas(otra.page)).length], [false, 0]);
  await otra.ctx.close();
}

async function editor(browser) {
  console.log("\n=== El interruptor en el editor de salas ===");
  const { page, ctx } = await abrir(browser, "/admin.html#torneos", { salas: SALAS.concat([CON_QUINIELA]), admin: true, quiniela: QUINIELA() });
  await page.waitForSelector("#salas-admin > li");
  await page.click('#salas-admin li[data-sala="con-quiniela"] button[aria-label^="Editar"]');
  await page.waitForSelector("#sala-quiniela-gente:not(.hidden)");
  igual("la trae encendida", await page.isChecked("#sala-quiniela"), true);
  igual("quien administra ve quién juega, con su correo", await page.$$eval("#sala-quiniela-filas tr", (t) => t.map((x) => x.innerText.replace(/\s+/g, " ").trim())),
    ["1 Luis Pérez luis@x.cr 1 de 1", "2 Eva Solís eva@x.cr 0 de 1"]);
  await page.uncheck("#sala-quiniela");
  await page.click("#sala-guardar");
  await page.waitForFunction(() => document.getElementById("sala-editor").classList.contains("hidden"));
  igual("apagarla se guarda", (await page.evaluate(() => window.__escrituras)).pop().datos.quiniela, false);
  await page.click('#salas-admin li[data-sala="utn"] button[aria-label^="Editar"]');
  igual("una sala de enlaces no la ofrece", await page.$eval("#sala-quiniela-caja", (e) => e.checkVisibility()), false);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await sala(browser);
    await editor(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " falla(s)." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
