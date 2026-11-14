/* Pareo Integral, los árbitros adjuntos (js/pareo/pagina.js, js/pareo/ver.js):
 *
 *   - el enlace del adjunto lleva su nombre (sin nombre no se crea), y cada
 *     resultado dice quién lo anotó;
 *   - cambiar un resultado ya anotado pide confirmarlo y deja la constancia
 *     en las incidencias: en la computadora del principal y, desde su
 *     celular, el adjunto en lo que él mismo anotó (lo de otro nunca se pisa);
 *   - el chat entre el principal y los adjuntos, a todos o a uno;
 *   - «Necesito al principal en esta mesa»: le llega al principal arriba de
 *     la ronda, con «Voy», y el adjunto ve que va en camino;
 *   - lo que los adjuntos dejaron en la base (pareo_cola, con un doble de la
 *     función pareo-publicar): el principal lo lee al abrir el torneo en
 *     cualquier ficha y con el toque «cola», lo pasa por las mismas reglas,
 *     lo borra de la base, y la lista de enlaces sube apenas cambia; el
 *     celular manda a la base y, sin ella, por el canal;
 *   - las cámaras de Notara en el celular del adjunto: con el código que manda
 *     el principal, cada mesa suya con su tablero en vivo (lo de otro torneo u
 *     otra ronda no entra), «La cámara dice» con «Confirmar» (manda ese
 *     resultado, como tocarlo a mano) y «No es así» (lo esconde). La partida
 *     de prueba es el mate del pastor, comprobado con chess.js;
 *   - entrar con el código, sin enlace ni cuenta (#codigo): un código mal
 *     escrito o que no existe se dice; el bueno, escrito como venga, lleva a
 *     sus mesas con el rango que dice la base; #codigo=… entra solo.
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
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    await p.addInitScript(() => { window.__sinAutoConfirmar = true; });
    await sembrar(torneo())(p);
  });
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-adjunto");
  await page.waitForSelector(dialogo);
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction(() => /Escribe el nombre del árbitro adjunto/.test(document.body.textContent)).catch(() => {});
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
  // Sin la base (la función no contesta en las pruebas), por el canal como antes.
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "resultado"), canal, { timeout: 5000 }).catch(() => {});
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

async function pruebaBase(browser) {
  console.log("\n=== Lo que los adjuntos dejaron en la base ===");
  const CODIGO = "prueba23";
  const pedidos = [];
  let cola = [{ id: 7, codigo: CODIGO, evento: "resultado", ronda: 1, datos: { mesa: 1, r: "1-0" } },
    { id: 8, codigo: CODIGO, evento: "nota", ronda: 1, datos: { texto: "PRUEBA nota que quedó en la base", autor: "PRUEBA ADJUNTA", mesa: 2, tipo: "reclamo" } },
    // De una mesa que no es suya: las reglas de siempre no la dejan entrar.
    { id: 9, codigo: CODIGO, evento: "resultado", ronda: 1, datos: { mesa: 3, r: "0-1" } }];
  const t = torneo();
  t.publicado = { id: "11111111-2222-3333-4444-555555555555", clave: "PRUEBA-CLAVE", hora: 1 };
  t.adjuntos = [{ codigo: CODIGO, rango: "1-2", activo: true, nombre: "PRUEBA ADJUNTA" }];
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    await sembrar(t)(p);
    await p.route("**/functions/v1/pareo-publicar", (r) => {
      const b = JSON.parse(r.request().postData() || "{}");
      pedidos.push(b);
      const responder = (x) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(x) });
      if (b.clave !== "PRUEBA-CLAVE") return responder({ ok: false, error: "La clave no es la de este torneo." });
      if (b.accion === "cola") return responder({ ok: true, cola, vistos: [{ codigo: CODIGO, visto: "2026-11-22T15:00:00Z" }] });
      if (b.accion === "cola_borrar") { cola = cola.filter((x) => x.id > b.hasta); return responder({ ok: true }); }
      return responder({ ok: true });
    });
  });
  // Abre en la ficha de jugadores (no en la de rondas): igual la lee.
  let [g] = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[0].r === "1-0");
  ok(g.rondas[0].mesas[0].porAdjunto === "PRUEBA ADJUNTA", "al abrir el torneo, el resultado guardado en la base entra a la mesa, como del adjunto");
  ok((g.rondas[0].incidencias || []).some((x) => x.tipo === "reclamo" && x.texto === "PRUEBA nota que quedó en la base" && x.mesa === 2 && x.porAdjunto), "y la incidencia también", JSON.stringify(g.rondas[0].incidencias));
  ok(g.rondas[0].mesas[2].r === null, "lo de una mesa que no es suya no entra");
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  igual("y se borra de la base hasta lo último que se leyó", pedidos.filter((x) => x.accion === "cola_borrar").map((x) => [x.id, x.hasta]), [["11111111-2222-3333-4444-555555555555", 9]]);
  cola = [{ id: 10, codigo: CODIGO, evento: "resultado", ronda: 1, datos: { mesa: 2, r: "=" } }];
  await page.evaluate((c) => window.__llega(c, "cola", {}), "pareo-adjunto-" + CODIGO);
  [g] = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[1].r === "=");
  bien("con el toque «cola» del canal, lo lee ya");
  await page.click('[data-ficha="rondas"]');
  await page.waitForSelector(".pi-adjunto-codigo");
  igual("la tarjeta del adjunto muestra su código para escribirlo a mano", await page.textContent(".pi-adjunto-codigo strong"), "PRUE-BA23");
  await page.click("#pi-adjunto");
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="arbitro"]', "PRUEBA SEGUNDA");
  await page.fill(dialogo + ' [name="desde"]', "3");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction(() => document.querySelectorAll("[data-adjunto]").length === 2);
  await page.waitForTimeout(300);
  const subida = pedidos.filter((x) => x.accion === "adjuntos").pop();
  igual("un enlace nuevo sube a la base apenas se crea, con la lista entera", subida && subida.adjuntos.map((a) => [a.nombre, a.rango, a.activo]), [["PRUEBA ADJUNTA", "1-2", true], ["PRUEBA SEGUNDA", "3-3", true]]);
  // Al final: completa la ronda (y entonces ya no se muestran las tarjetas de
  // los adjuntos). La Mesa del árbitro: su fila no trae código sino asignacion_id, y su toque
  // llega por el canal del torneo publicado (lo manda centroamericano-mesa).
  cola = [{ id: 11, codigo: null, asignacion_id: "PRUEBA-ASIG", nombre: "PRUEBA MESA", desde: 1, hasta: 3, evento: "resultado", ronda: 1, datos: { mesa: 3, r: "0-1" } }];
  await page.waitForFunction(() => window.__canales && window.__canales.has("pareo-cola-11111111-2222-3333-4444-555555555555"), null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => window.__canales.has("pareo-cola-11111111-2222-3333-4444-555555555555")), "escucha el toque de la Mesa del árbitro en el canal del torneo publicado");
  const lecturasAntes = pedidos.filter((x) => x.accion === "cola").length;
  await page.evaluate((c) => window.__llega(c, "cola", {}), "pareo-cola-11111111-2222-3333-4444-555555555555");
  await page.waitForTimeout(500);
  ok(pedidos.filter((x) => x.accion === "cola").length > lecturasAntes, "y con el toque lee la cola en el momento, sin esperar su vuelta");
  [g] = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[2].r === "0-1");
  ok(g.rondas[0].mesas[2].porAdjunto === "PRUEBA MESA", "con el toque de la Mesa del árbitro (canal del torneo publicado), su resultado entra ya, a nombre del árbitro de la Mesa");
  ok(pedidos.filter((x) => x.accion === "cola" || x.accion === "cola_borrar").every((x) => x.mesa === true),
    "y cada lectura y borrado de la cola dice que entiende las filas de la Mesa (sin eso, la función no se las da ni las deja borrar)");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== El celular del adjunto, con la base ===");
  const anotados = [];
  const { ctx: c2, page: cel, errores: err2 } = await P.abrirPagina(browser, BASE, "#adjunto=" + CODIGO + "&m=1-3", async (p) => {
    await p.route("**/functions/v1/pareo-publicar", (r) => {
      const b = JSON.parse(r.request().postData() || "{}");
      anotados.push(b);
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b.datos && b.datos.mesa === 2 ? { ok: false, motivo: "ronda", error: "Esa ronda ya no está en juego." } : { ok: true, id: 1 }) });
    });
  });
  await cel.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  await cel.evaluate((c) => window.__llega(c, "estado", { nombre: "PRUEBA", ronda: 4, arbitro: "PRUEBA ADJUNTA", principal: "", chat: [], llamadas: [],
    mesas: [{ m: 1, f: 1, b: "PRUEBA A", n: "PRUEBA D", r: null }, { m: 2, f: 2, b: "PRUEBA E", n: "PRUEBA B", r: null }] }), "pareo-adjunto-" + CODIGO);
  await cel.waitForSelector("#pi-adj-1");
  await cel.selectOption("#pi-adj-1", "1-0");
  await cel.waitForFunction(() => /Guardado\./.test(document.querySelector('[data-mesa="1"]').textContent), null, { timeout: 5000 }).catch(() => {});
  igual("el resultado va a la base con su código y la ronda", anotados.map((b) => [b.accion, b.codigo, b.evento, b.ronda, b.datos]), [["adjunto_anotar", CODIGO, "resultado", 4, { mesa: 1, r: "1-0" }]]);
  igual("y por el canal va solo el toque «cola»", await cel.evaluate(() => window.__enviados.filter((x) => x.evento !== "pedir").map((x) => x.evento)), ["cola"]);
  await cel.selectOption("#pi-adj-2", "=");
  await cel.waitForFunction(() => /Esa ronda ya no está en juego/.test(document.querySelector('[data-mesa="2"]').textContent), null, { timeout: 5000 }).catch(() => {});
  ok(await cel.$eval("#pi-adj-2", (s) => !s.disabled && s.value === ""), "lo que la base rechaza se dice, y se puede volver a elegir");
  ok(!err2.length, "sin errores en la página", err2.join(" | "));
  await c2.close();
}

async function pruebaCamaras(browser) {
  console.log("\n=== Las cámaras en el celular del adjunto ===");
  const PUB = "11111111-2222-3333-4444-555555555555";
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "#adjunto=prueba23&m=1-3");
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  await page.evaluate((pub) => window.__llega("pareo-adjunto-prueba23", "estado", { nombre: "PRUEBA", ronda: 2, arbitro: "PRUEBA ADJUNTA", principal: "", chat: [], llamadas: [],
    camaras: "camprue2", torneo: pub,
    mesas: [{ m: 1, f: 1, b: "PRUEBA A", n: "PRUEBA D", r: null }, { m: 2, f: 2, b: "PRUEBA E", n: "PRUEBA B", r: null }] }), PUB);
  await page.waitForFunction(() => window.__enviados.some((x) => x.canal === "tablero-vivo-camprue2" && x.evento === "pedir"), null, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => window.__enviados.some((x) => x.canal === "tablero-vivo-camprue2" && x.evento === "pedir")), "con el código del principal, escucha las cámaras y les pide lo que tienen");
  ok(/Sin noticias de la cámara/.test(await page.textContent('[data-cam="1"]')), "antes de que llegue algo, lo dice escrito");
  const camara = (mesa, pgn, resultado, extra) => page.evaluate(([x]) => window.__llega("tablero-vivo-camprue2", "estado", x),
    [Object.assign({ v: 1, pgn, torneo: PUB, ronda: 2, mesa, t: Date.now(), resultado }, extra || {})]);
  // Lo de otro torneo y lo de otra ronda no entran.
  await camara(1, "1. d4", null, { torneo: "99999999-2222-3333-4444-555555555555" });
  await camara(1, "1. c4", null, { ronda: 1 });
  await page.waitForTimeout(200);
  ok(/Sin noticias de la cámara/.test(await page.textContent('[data-cam="1"]')), "lo de otro torneo o de otra ronda no entra");
  await camara(1, "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#", "1-0");
  await page.waitForSelector('[data-cam="1"] [data-camara-dice]', { timeout: 8000 }).catch(() => {});
  igual("el tablero de su mesa, con las jugadas y cómo va, escritas", await page.$eval('[data-cam="1"]', (n) => [n.querySelectorAll('[aria-hidden="true"] > div').length, /En vivo · 7 jugadas/.test(n.textContent), /Jaque mate/.test(n.textContent)]), [64, true, true]);
  ok(/La cámara dice: 1-0/.test(await page.textContent('[data-cam="1"]')), "y la propuesta de la cámara, escrita");
  await page.click('[data-cam="1"] [data-camara-confirmar]');
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "resultado"), null, { timeout: 5000 }).catch(() => {});
  igual("«Confirmar» manda ese resultado, como tocarlo a mano", await page.evaluate(() => (window.__enviados.filter((x) => x.evento === "resultado").pop() || {}).payload), { ronda: 2, mesa: 1, r: "1-0" });
  ok(!(await page.$('[data-cam="1"] [data-camara-confirmar]')), "y deja de proponerlo");
  await camara(2, "1. e4 e5 2. Nf3 Nc6", "=");
  await page.waitForSelector('[data-cam="2"] [data-camara-descartar]', { timeout: 8000 }).catch(() => {});
  await page.click('[data-cam="2"] [data-camara-descartar]');
  ok(!(await page.$('[data-cam="2"] [data-camara-dice]')) && /En vivo · 4 jugadas/.test(await page.textContent('[data-cam="2"]')), "«No es así» esconde la propuesta, y el tablero sigue");
  igual("y no manda nada de esa mesa", await page.evaluate(() => window.__enviados.filter((x) => x.evento === "resultado" && x.payload.mesa === 2).length), 0);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin correrse de lado");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaCodigo(browser) {
  console.log("\n=== Entrar con el código, sin enlace ni cuenta ===");
  const pedidos = [];
  const doble = (p) => p.route("**/functions/v1/pareo-publicar", (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    pedidos.push(b);
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b.codigo === "prueba23"
      ? { ok: true, id: "11111111-2222-3333-4444-555555555555", nombre: "PRUEBA", arbitro: "PRUEBA ADJUNTA", desde: 1, hasta: 2 }
      : { ok: false, motivo: "no", error: "Ese código no es de ningún árbitro de un torneo publicado." }) });
  });
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "#codigo", doble);
  await page.waitForSelector("#pi-adj-codigo");
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === "pi-adj-codigo") && await P.vis(page, "#pi-adj-codigo"), "se ve la casilla, con el foco puesto, sin pedir cuenta");
  await page.fill("#pi-adj-codigo", "abc");
  await page.click("#pi-adj-codigo-entrar");
  ok(/Son 8 letras y números/.test(await page.textContent("#pi-adj-codigo-estado")) && !pedidos.length, "un código con forma equivocada se dice, sin preguntarle a la base");
  await page.fill("#pi-adj-codigo", "ZZZZ-9999");
  await page.click("#pi-adj-codigo-entrar");
  await page.waitForFunction(() => /no es de ningún árbitro/.test(document.getElementById("pi-adj-codigo-estado").textContent), null, { timeout: 5000 }).catch(() => {});
  ok(/no es de ningún árbitro/.test(await page.textContent("#pi-adj-codigo-estado")), "uno que no existe, con lo que dice la base");
  await page.fill("#pi-adj-codigo", " prue-ba23 ");
  await page.click("#pi-adj-codigo-entrar");
  await page.waitForFunction(() => window.__enviados.some((x) => x.canal === "pareo-adjunto-prueba23" && x.evento === "pedir"), null, { timeout: 5000 }).catch(() => {});
  igual("el bueno, escrito como venga, entra a sus mesas con el rango de la base", [await page.evaluate(() => location.hash), pedidos.pop()], ["#adjunto=prueba23&m=1-2", { accion: "adjunto_entrar", codigo: "prueba23" }]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
  const { ctx: c2, page: p2, errores: e2 } = await P.abrirPagina(browser, BASE, "#codigo=PRUE-BA23", doble);
  await p2.waitForFunction(() => location.hash.startsWith("#adjunto="), null, { timeout: 5000 }).catch(() => {});
  igual("con #codigo=… entra solo", await p2.evaluate(() => location.hash), "#adjunto=prueba23&m=1-2");
  ok(!e2.length, "sin errores en la página", e2.join(" | "));
  await c2.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPrincipal(browser);
    await pruebaCelular(browser);
    await pruebaBase(browser);
    await pruebaCamaras(browser);
    await pruebaCodigo(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
