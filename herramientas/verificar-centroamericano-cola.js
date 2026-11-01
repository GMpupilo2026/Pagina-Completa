/* La tablet del árbitro del Centroamericano no pierde nada cuando falla la señal (js/centroamericano-cola.js y
   js/centroamericano-arbitro.js). Ver «La tablet del árbitro no pierde nada cuando falla la señal» en
   docs/decisiones/juegos-y-torneos.md.

   Parte 1, sin navegador: qué errores son de la red (se reintentan) y cuáles son un «no» de la función (no).

   Parte 2, con navegador y el doble de Supabase del árbitro con FALLAS DE RED simuladas:
   - un error de arranque del servidor (503) NO se toma por una respuesta buena: se reintenta y la pantalla
     queda intacta;
   - una falla corta se reintenta sola, sin que el árbitro lo note;
   - una anotación cuya RESPUESTA se perdió (la función sí la procesó) se reenvía con el mismo id y la base
     NO la cuenta dos veces;
   - sin señal, un resultado, una ilegal y la foto quedan en la tablet (IndexedDB, sin el token), se ven en el
     aviso fijo, sobreviven a recargar la página y se mandan solos, en orden, al volver la señal;
   - sin señal al abrir, se muestran las últimas mesas que leyó la tablet;
   - un «no» de verdad (enlace vencido) no se reintenta ni se guarda en la cola.

       node herramientas/verificar-todo.js centroamericano-cola */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const { TOKEN, dobleArbitro } = require("./lib/doble-centroamericano-arbitro");
const Cola = require("../js/centroamericano-cola.js");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

(async () => {
  console.log("=== Qué se reintenta ===");
  igual("sin respuesta, 502, 503, 504, 500 y 429 son de la red; el 404, el 410, el 403, el 409 y el 400 son un «no» de verdad",
    [undefined, 0, 502, 503, 504, 500, 429, 404, 410, 403, 409, 400].map((h) => Cola.esDeRed(h === undefined ? { message: "x" } : { http: h })), [true, true, true, true, true, true, true, false, false, false, false, false]);
  let veces = 0;
  const r = await Cola.conReintentos(async () => { if (++veces < 3) throw Object.assign(new Error("red"), { red: true }); return "ok"; }, { esperas: [0, 1, 1] });
  igual("una falla de la red se reintenta hasta 3 veces y sale bien a la tercera", [r, veces], ["ok", 3]);
  veces = 0;
  let mensaje = "";
  try { await Cola.conReintentos(async () => { veces++; throw Object.assign(new Error("Este enlace venció."), { http: 410 }); }, { esperas: [0, 1, 1] }); } catch (e) { mensaje = e.message; }
  igual("un «no» de verdad no se reintenta", [veces, mensaje], [1, "Este enlace venció."]);
  igual("las esperas son: ahora, a 1,5 s y a 4 s", Cola.ESPERAS_MS, [0, 1500, 4000]);
  const id1 = Cola.uuid(), id2 = Cola.uuid();
  igual("los id son uuid y no se repiten", [/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id1), id1 !== id2], [true, true]);

  console.log("\n=== En la página ===");
  const browser = await chromium.launch();
  async function abrir({ red = null, sinEsperas = true, hash = TOKEN, contexto = null } = {}) {
    const ctx = contexto || await browser.newContext({ serviceWorkers: "block", viewport: { width: 1180, height: 900 } });
    if (!contexto) {
      await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: dobleArbitro() }));
      await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
      await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    }
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (x) => errores.push(x.message));
    if (red) await p.addInitScript((x) => { sessionStorage.setItem("__red", JSON.stringify(x)); }, red);
    // Las esperas entre intentos se acortan para que la prueba no tarde (en el torneo son 0, 1,5 s y 4 s).
    if (sinEsperas) await p.addInitScript(() => { window.addEventListener("DOMContentLoaded", () => { if (window.CentroamericanoCola) window.CentroamericanoCola.ESPERAS_MS.splice(0, 3, 0, 30, 60); }); });
    await p.goto(BASE + "/centroamericano-arbitro.html#" + hash, { waitUntil: "load" });
    return { ctx, p, errores };
  }
  const estaListo = (p) => p.waitForSelector("#app:not([hidden]) .cam-mesa");
  const llamadas = (p, accion) => p.evaluate((a) => window.__llamadas.filter((l) => l.body.action === a).map((l) => l.body), accion);
  const banner = (p) => p.evaluate(() => { const c = document.getElementById("conexion"); return { visible: c.checkVisibility(), nivel: c.dataset.nivel, texto: c.textContent }; });
  const enBD = (p) => p.evaluate(() => new Promise((ok) => {
    const q = indexedDB.open("centroamericano-cola");
    q.onsuccess = () => { try { const r = q.result.transaction("pendientes").objectStore("pendientes").getAll(); r.onsuccess = () => ok(r.result); } catch (e) { ok([]); } };
    q.onerror = () => ok(null);
  }));
  const dejarListaAprobada = async (p) => { await p.evaluate(() => { window.__lista = ["relojes", "tableros"]; }); await p.click("#actualizar"); await p.waitForFunction(() => document.querySelector('.cam-mesa[data-mesa="1"] [data-accion="guardar"]') !== null); };
  const sinSenal = (p) => p.evaluate(() => { window.__red = { siempre: true }; sessionStorage.setItem("__red", JSON.stringify({ siempre: true })); });
  const conSenal = (p) => p.evaluate(() => { window.__red = null; sessionStorage.removeItem("__red"); });

  // --- 1. el error de arranque del servidor
  console.log("\n--- El servidor tarda en arrancar (503) ---");
  let { ctx, p, errores } = await abrir({ red: { fallar: 2, tipo: "boot" } });
  await estaListo(p);
  igual("el 503 no se toma por una lectura buena: se reintenta y las tres mesas salen completas", [(await llamadas(p, "leer")).length, await p.$$eval(".cam-mesa", (l) => l.length), await p.evaluate(() => document.getElementById("problema").hidden)], [3, 3, true]);
  igual("sin errores de JavaScript", errores, []);
  await ctx.close();

  // --- 2. una falla corta
  console.log("\n--- Una falla corta de la señal ---");
  ({ ctx, p, errores } = await abrir());
  await estaListo(p);
  await p.evaluate(() => { window.__red = { fallar: 2, accion: "presencia" }; });
  await p.click('.cam-mesa[data-mesa="2"] .cam-jugador[data-color="blancas"] [data-accion="presente"]');
  await p.waitForTimeout(600);
  const pres = await llamadas(p, "presencia");
  igual("la presencia se reintentó sola y llegó a la tercera, sin dejar nada en la cola", [pres.length, (await banner(p)).visible, (await enBD(p)).length], [3, false, 0]);
  await ctx.close();

  // --- 3. una respuesta perdida no duplica
  console.log("\n--- La respuesta se pierde, pero la función sí lo procesó ---");
  ({ ctx, p, errores } = await abrir());
  await estaListo(p);
  await p.evaluate(() => { window.__red = { fallar: 1, accion: "anotar", perderRespuesta: true }; });
  const acc = (m, color, a) => '.cam-mesa[data-mesa="' + m + '"] .cam-jugador[data-color="' + color + '"] [data-accion="' + a + '"]';
  await p.click(acc(2, "blancas", "ilegal"));
  await p.waitForSelector("dialog[open] select");
  await p.selectOption("dialog[open] select", "enroque");
  await p.click("dialog[open] [data-avisos-aceptar]");
  await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
  await p.click("dialog[open] [data-avisos-aceptar]");
  const anot = await llamadas(p, "anotar");
  igual("se mandó dos veces con el MISMO id (uuid) y la base solo cuenta UNA ilegal", [anot.length, anot[0].id === anot[1].id, /^[0-9a-f-]{36}$/.test(anot[0].id), await p.evaluate(() => window.__filas.filter((f) => f.tipo === "ilegal").length)], [2, true, true, 1]);
  igual("en pantalla, una sola ilegal de las blancas de la mesa 2", await p.$eval('.cam-mesa[data-mesa="2"] .cam-marca[data-tipo="ilegal"]', (e) => e.textContent), "iIlegal");
  await ctx.close();

  // --- 4. sin señal: queda en la tablet, sobrevive a recargar y sale solo
  console.log("\n--- Sin señal: queda en la tablet y se manda solo ---");
  ({ ctx, p, errores } = await abrir());
  await estaListo(p);
  await dejarListaAprobada(p);
  await sinSenal(p);
  await p.selectOption("#res-1", "1");
  await p.click('.cam-mesa[data-mesa="1"] [data-accion="guardar"]');
  await p.waitForFunction(() => document.getElementById("conexion").checkVisibility() && document.getElementById("conexion").textContent.includes("Pendiente de enviar (1)"));
  igual("el resultado queda guardado en la tablet y lo dice (con palabras: no solo con color)", await p.evaluate(() => [document.querySelector('.cam-mesa[data-mesa="1"] .cam-guardado').textContent.includes("Sin señal"), document.getElementById("conexion").dataset.nivel, document.getElementById("conexion").textContent.includes("Resultado de la mesa 1"), document.getElementById("conexion").getAttribute("aria-live")]), [true, "mal", true, "polite"]);
  // una ilegal también, sin señal
  await p.click(acc(2, "negras", "ilegal"));
  await p.waitForSelector("dialog[open] select");
  await p.selectOption("dialog[open] select", "enroque");
  await p.click("dialog[open] [data-avisos-aceptar]");
  await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
  igual("la ilegal sin señal avisa igual (la primera: 2 minutos al rival) y dice que quedó en la tablet", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Sin señal"), t.includes("2 minutos")]; }), [true, true]);
  await p.click("dialog[open] [data-avisos-aceptar]");
  igual("la ilegal ya cuenta en la tablet", await p.$eval('.cam-mesa[data-mesa="2"] .cam-marca[data-tipo="ilegal"]', (e) => e.textContent), "iIlegal");
  const guardados = (await enBD(p)).sort((x, y) => x.creado - y.creado);
  igual("en la tablet hay 2 pendientes, en orden, y NINGUNO lleva el token", [guardados.map((x) => x.accion), JSON.stringify(guardados).includes(TOKEN), await p.evaluate((t) => JSON.stringify(localStorage).includes(t), TOKEN)], [["guardar", "anotar"], false, false]);
  igual("la ilegal pendiente lleva su id (así reenviarla no la duplica)", /^[0-9a-f-]{36}$/.test(guardados[1].cuerpo.id) && guardados[1].id === guardados[1].cuerpo.id, true);
  const idIlegal = guardados[1].id;

  // recarga la página SIN señal: sigue todo (las mesas de la última lectura y los pendientes)
  await p.reload({ waitUntil: "load" });
  await estaListo(p);
  igual("al recargar sin señal se ven las últimas mesas que leyó la tablet y los 2 pendientes siguen ahí", await p.evaluate(() => [document.querySelectorAll(".cam-mesa").length, document.getElementById("actualizado").textContent.startsWith("Sin conexión"), document.getElementById("conexion").textContent.includes("Pendiente de enviar (2)")]), [3, true, true]);
  igual("sin errores de JavaScript", errores, []);

  // vuelve la señal: se mandan solos, en orden, una sola vez
  await p.evaluate(() => { window.__lista = ["relojes", "tableros"]; });
  await conSenal(p);
  await p.click('#conexion [data-accion="reintentar-cola"]');
  await p.waitForFunction(() => document.getElementById("conexion").hidden, null, { timeout: 15000 });
  igual("al volver la señal en la base quedó el resultado (una vez) y la ilegal con SU MISMO id (una vez)", await p.evaluate((id) => [window.__filas.filter((f) => f.tipo === "resultado").map((f) => [f.mesa, f.resultado]), window.__filas.filter((f) => f.tipo === "ilegal").map((f) => [f.mesa, f.color, f.id === id])], idIlegal), [[[1, "1-0"]], [[2, "negras", true]]]);
  igual("la cola quedó vacía (en la tablet y en pantalla) y el aviso fijo se fue", [(await enBD(p)).length, (await banner(p)).visible], [0, false]);
  await ctx.close();

  // --- 5. una foto sin señal
  console.log("\n--- La foto sin señal ---");
  ({ ctx, p, errores } = await abrir());
  await estaListo(p);
  await sinSenal(p);
  // Un JPG de verdad (canvas), entregado por el mismo camino que la cámara del aparato.
  const jpg = Buffer.from(await p.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 640; c.height = 480;
    const x = c.getContext("2d"); x.fillStyle = "#ddd"; x.fillRect(0, 0, 640, 480); x.fillStyle = "#222";
    for (let i = 0; i < 60; i++) x.fillRect(10 + i * 10, 20 + (i % 9) * 40, 5, 120);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  }), "base64");
  const camarita = '.cam-mesa[data-mesa="2"] [data-accion="planilla"]';
  const [selector] = await Promise.all([p.waitForEvent("filechooser"), p.click(camarita)]);
  await selector.setFiles({ name: "planillas.jpg", mimeType: "image/jpeg", buffer: jpg });
  await p.waitForFunction(() => document.getElementById("conexion").textContent.includes("Foto de las planillas de la mesa 2"));
  const fotos = await enBD(p);
  igual("sin señal, la foto queda en la tablet (y se dice), sin el token", [fotos.map((x) => [x.accion, x.cuerpo.mesa, x.cuerpo.imagen.startsWith("data:image/jpeg;base64,")]), JSON.stringify(fotos).includes(TOKEN), (await banner(p)).texto.includes("Pendiente de enviar (1)")], [[["planilla", 2, true]], false, true]);
  await conSenal(p);
  await p.click('#conexion [data-accion="reintentar-cola"]');
  await p.waitForFunction(() => document.getElementById("conexion").hidden, null, { timeout: 15000 });
  igual("al volver la señal la foto llega una sola vez, la camarita de esa mesa queda marcada y la cola vacía", [await p.evaluate(() => window.__planillas.length), await p.$eval(camarita, (b) => b.dataset.hecho), (await enBD(p)).length], [1, "si", 0]);
  igual("sin errores de JavaScript", errores, []);
  await ctx.close();

  // --- 6. un «no» de verdad
  console.log("\n--- Un «no» de verdad no se reintenta ni se guarda ---");
  ({ ctx, p, errores } = await abrir());
  await estaListo(p);
  await dejarListaAprobada(p);
  await p.evaluate(() => { window.__red = { fallar: 1, accion: "guardar", tipo: "h404" }; });
  await p.selectOption("#res-1", "1");
  await p.click('.cam-mesa[data-mesa="1"] [data-accion="guardar"]');
  await p.waitForSelector('.cam-mesa[data-mesa="1"] .cam-fallo');
  igual("el enlace inválido sale como error, UN solo intento y nada queda en la cola", [(await llamadas(p, "guardar")).length, (await enBD(p)).length, (await banner(p)).visible, await p.$eval('.cam-mesa[data-mesa="1"] .cam-fallo', (e) => e.textContent.includes("no es válido"))], [1, 0, false, true]);
  await ctx.close();

  // --- 7. sin señal al abrir y sin nada guardado
  console.log("\n--- Sin señal al abrir, en una tablet que nunca leyó ---");
  ({ ctx, p, errores } = await abrir({ red: { siempre: true } }));
  await p.waitForSelector("#problema:not([hidden])", { timeout: 15000 });
  igual("sin lectura guardada, dice que no se pudo abrir y ofrece reintentar", await p.evaluate(() => [document.getElementById("problema-titulo").textContent, document.getElementById("problema-reintentar").hidden]), ["No se pudo abrir tus mesas", false]);
  await ctx.close();

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
