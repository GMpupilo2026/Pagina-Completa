/* Pareo Integral: la sala de un evento con muchas categorías
 * (js/pareo/evento.js: mesaFisica, numerarSala, marcarTiempos, duraciones;
 * js/pareo/pagina.js; js/pareo/ver.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - cada torneo con su rango de mesas físicas: «Numerar seguido», y el
 *     número de la sala en la ronda, la plantilla de la pared y el celular
 *     (por dentro, la mesa sigue siendo su posición: lo que manda un adjunto
 *     cae en la mesa correcta);
 *   - el plano de la sala para imprimir;
 *   - los gafetes: ocho por hoja carta, con su QR y el código del evento
 *     guardado desde ya;
 *   - cuánto duró cada ronda (emparejada, terminó, minutos);
 *   - el proyector: el llamado de una ronda nueva y la pantalla de
 *     premiación de un torneo terminado;
 *   - la inscripción desde el celular: pide el consentimiento, llega a la
 *     lista del árbitro y entra solo si la acepta (con rondas jugadas, como
 *     inscripción tardía).
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-sala-evento.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const CM = 96 / 2.54;
const confirmar = 'dialog[data-avisos="confirmar"][open]';

const EVENTO = { id: "ev-sala", nombre: "PRUEBA JDE 2026 · Etapa Regional · DRE Alajuela", jde: { anio: 2026, etapa: "regional", lugar: "Alajuela" }, creado: "2026-10-21", decisiones: {} };
function torneo(nombre, n) {
  const ids = Array.from({ length: n }, (_, k) => nombre.slice(-2) + k);
  const t = T.nuevo({ nombre, rondasTotales: 3, jugadores: ids.map((id, k) => ({ id, nombre: "PRUEBA " + nombre.slice(-6) + " " + (k + 1), elo: 0, institucion: "LICEO PRUEBA" })) });
  t.evento = Object.assign({}, EVENTO);
  const mesas = [];
  for (let k = 0; k < ids.length; k += 2) mesas.push({ b: ids[k], n: ids[k + 1] == null ? null : ids[k + 1], r: ids[k + 1] == null ? "bye" : null });
  t.rondas = [{ mesas, emparejada: Date.parse("2026-10-21T08:00:00-06:00") }];
  return t;
}
const A = torneo("PRUEBA SUB-10", 8);  // 4 mesas
const B = torneo("PRUEBA SUB-12", 6);  // 3 mesas
const sembrar = (page) => page.addInitScript((ts) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify(ts.map(([id, t], i) => ({ id, nombre: t.nombre, actualizado: 10 - i }))));
  for (const [id, t] of ts) localStorage.setItem("pareo_torneo_v1_" + id, JSON.stringify(t));
  localStorage.setItem("pareo_abierto_v1", "tb");
}, [["ta", A], ["tb", B]]);

function pruebaSinNavegador() {
  console.log("\n=== Las mesas de la sala y los tiempos ===");
  igual("numerar seguido: cada uno empieza donde terminó el anterior", V.numerarSala([A, B]).map((x) => [x.desde, x.hasta]), [[1, 4], [5, 7]]);
  igual("la mesa física: la primera del rango más la posición", [V.mesaFisica({ mesaInicial: 5 }, 0), V.mesaFisica({ mesaInicial: 5 }, 2), V.mesaFisica({}, 2)], [5, 7, 3]);
  const t = JSON.parse(JSON.stringify(B));
  t.rondas[0].emparejada = 1000;
  t.rondas[0].mesas.forEach((m) => { m.r = "1-0"; });
  V.marcarTiempos(t, 1000 + 47 * 60000);
  igual("al completarse, la ronda anota cuándo terminó", V.duraciones([t]).map((x) => x.minutos), [47]);
  t.rondas[0].mesas[0].r = null;
  V.marcarTiempos(t, 5000000);
  ok(!t.rondas[0].fin, "y si se borra un resultado, ya no está terminada");
}

async function pruebaSala(browser) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar);
  console.log("\n=== Numerar la sala ===");
  await page.click('[data-ficha="archivos"]');
  igual("la tabla de la sala, uno por torneo", await page.$$eval("#pi-sala-tabla tbody tr", (l) => l.length), 2);
  await page.click("#pi-sala-seguido");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("pareo_torneo_v1_tb")).mesaInicial === 5);
  igual("«Numerar seguido»: el SUB-12 empieza en la mesa 5", await page.$$eval("#pi-sala-tabla tbody tr", (l) => l.map((f) => f.lastElementChild.textContent)), ["4", "7"]);
  await page.click('[data-ficha="rondas"]');
  igual("la ronda dice la mesa de la sala", await page.$$eval("#pi-ronda table tbody tr[data-nombres] td:first-child", (l) => l.map((x) => x.textContent)), ["5", "6", "7"]);
  await page.click('#pi-ronda button:has-text("Plantilla para la pared")');
  igual("la plantilla de la pared, también", await page.$$eval("#pi-plantilla .pi-plantilla-num", (l) => l.map((x) => x.textContent)), ["5", "6", "7"]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  console.log("\n=== El plano y los gafetes ===");
  await page.click('[data-ficha="archivos"]');
  await page.click("#pi-sala-plano");
  igual("el plano: cada categoría con sus mesas", await page.$$eval("#pi-plantilla .pi-plano-mesas", (l) => l.map((x) => x.textContent)), ["de la 1 a la 4", "de la 5 a la 7"]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.click("#pi-gafetes");
  await page.waitForSelector("#pi-firmas .pi-gafete", { state: "attached" });
  igual("un gafete por jugador", await page.$$eval("#pi-firmas .pi-gafete", (l) => l.length), 14);
  ok((await page.$$eval("#pi-firmas .pi-gafete-qr svg", (l) => l.length)) === 14, "cada uno con su QR");
  ok(await page.evaluate(() => /^[a-z0-9]{8}$/.test(localStorage.getItem("pareo_evento_vivo_v1_ev-sala") || "")), "y el código del evento queda guardado (el QR impreso sirve cuando se ponga en vivo)");
  await page.emulateMedia({ media: "print" });
  await page.setViewportSize({ width: Math.round(19.6 * CM), height: 1000 });
  const alto = await page.$eval("#pi-firmas .pi-gafete", (x) => x.getBoundingClientRect().height);
  ok(4 * alto < 25.2 * CM, "caben ocho por hoja carta (cuatro filas miden " + (4 * alto / CM).toFixed(1) + " cm)");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 1280, height: 1000 });

  console.log("\n=== Cuánto duró cada ronda ===");
  await page.click('[data-ficha="rondas"]');
  for (const id of ["#pi-mesa-0", "#pi-mesa-1", "#pi-mesa-2"]) await page.selectOption(id, "1-0");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("pareo_torneo_v1_tb")).rondas[0].fin > 0);
  await page.click('[data-ficha="archivos"]');
  const dur = await page.$$eval("#pi-duraciones tbody tr", (l) => l.map((f) => [...f.children].map((c) => c.textContent)));
  ok(dur.length === 2 && dur[1][0] === "PRUEBA SUB-12" && dur[1][4] !== "—" && /^\d+$/.test(dur[1][5]), "la tabla dice cuándo terminó y cuántos minutos duró", JSON.stringify(dur));
  ok(dur[0][4] === "—", "y la que sigue en juego, todavía sin fin");
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#pi-duraciones-excel")]);
  ok(/duracion-de-las-rondas\.xlsx$/.test(descarga.suggestedFilename()), "y se baja en Excel");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaInscripcion(browser) {
  console.log("\n=== La inscripción desde el celular ===");
  const org = await P.abrirPagina(browser, BASE, "", sembrar);
  await org.page.click('[data-ficha="archivos"]');
  await org.page.click("#pi-inscribir");
  await org.page.waitForSelector("#pi-inscribir-url");
  const codigo = (await org.page.textContent("#pi-inscribir-url")).split("#inscribir=")[1];
  const canal = "pareo-inscribir-" + codigo;
  await org.page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "estado"), canal);
  const estado = await org.page.evaluate((c) => window.__enviados.filter((x) => x.canal === c && x.evento === "estado").pop().payload, canal);
  igual("manda las categorías del evento", estado.torneos.slice().sort(), ["PRUEBA SUB-10", "PRUEBA SUB-12"]);

  const cel = await P.abrirPagina(browser, BASE, "#inscribir=" + codigo);
  const p = cel.page;
  await p.setViewportSize({ width: 390, height: 840 });
  await p.evaluate(([c, d]) => window.__llega(c, "estado", d), [canal, estado]);
  await p.waitForSelector("#pi-ins-nombre");
  ok(await p.$eval('label[for="pi-ins-acepto"] a[href="privacidad.html"]', () => true).catch(() => false), "la casilla de consentimiento enlaza a la política de privacidad");
  await p.selectOption("#pi-ins-torneo", "PRUEBA SUB-12");
  await p.fill("#pi-ins-nombre", "PRUEBA TARDIA UNO");
  await p.fill("#pi-ins-centro", "LICEO PRUEBA");
  await p.click("#pi-ins-mandar");
  ok(/Política de privacidad/.test(await p.textContent("#pi-ins-estado")) && !(await p.evaluate(() => window.__enviados.some((x) => x.evento === "inscripcion"))), "sin marcar la casilla, no se manda");
  await p.check("#pi-ins-acepto");
  await p.click("#pi-ins-mandar");
  const mandada = await p.evaluate(() => window.__enviados.filter((x) => x.evento === "inscripcion").pop().payload);
  igual("manda la categoría, el nombre y el centro", [mandada.torneo, mandada.nombre, mandada.institucion], ["PRUEBA SUB-12", "PRUEBA TARDIA UNO", "LICEO PRUEBA"]);
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "cabe en el celular");
  ok(!cel.errores.length, "sin errores en el celular", cel.errores.join(" | "));
  await cel.ctx.close();

  await org.page.evaluate(([c, d]) => window.__llega(c, "inscripcion", d), [canal, mandada]);
  await org.page.evaluate(([c, d]) => window.__llega(c, "inscripcion", d), [canal, Object.assign({}, mandada, { torneo: "UN TORNEO QUE NO EXISTE", nombre: "PRUEBA OTRA" })]);
  await org.page.waitForSelector("#pi-inscripciones li");
  igual("llega a la lista del árbitro (y la de un torneo que no existe, no)", await org.page.$$eval("#pi-inscripciones li", (l) => l.length), 1);
  ok(await org.page.evaluate((c) => window.__enviados.some((x) => x.canal === c && x.evento === "recibida"), canal), "y al celular le avisa que llegó");
  ok(!(await org.page.evaluate(() => JSON.parse(localStorage.getItem("pareo_torneo_v1_tb")).jugadores.some((j) => j.nombre === "PRUEBA TARDIA UNO"))), "todavía no entra al torneo");
  await org.page.click("#pi-inscripciones [data-aceptar-inscripcion]");
  await org.page.waitForFunction(() => JSON.parse(localStorage.getItem("pareo_torneo_v1_tb")).jugadores.some((j) => j.nombre === "PRUEBA TARDIA UNO"));
  const tor = await org.page.evaluate(() => JSON.parse(localStorage.getItem("pareo_torneo_v1_tb")));
  ok((tor.tardios || []).some((x) => x.nombre === "PRUEBA TARDIA UNO" && x.ronda === 2), "al aceptarla entra, y queda en el acta como inscripción tardía (ronda 2)", JSON.stringify(tor.tardios));
  ok(!org.errores.length, "sin errores en la página", org.errores.join(" | "));
  await org.ctx.close();
}

async function pruebaProyector(browser) {
  console.log("\n=== El proyector: el llamado y la premiación ===");
  const lista = [JSON.parse(JSON.stringify(A)), JSON.parse(JSON.stringify(B))];
  lista[1].mesaInicial = 5;
  const vista1 = V.vistaEvento(EVENTO, lista, null);
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "#evento=proy1234&proyectar", (p) => p.addInitScript(() => {
    window.__dicho = [];
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak: (u) => window.__dicho.push(u.text), cancel() {} } });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  }));
  await page.evaluate((d) => window.__llega("pareo-evento-proy1234", "estado", d), vista1);
  await page.waitForSelector(".pi-proyector");
  ok(!(await page.$("[data-llamado]")), "al entrar, sin llamado (no es una ronda nueva)");
  await page.click("#pi-proyector-voz");
  // El SUB-12 empareja la ronda 2 (la 1 ya terminada).
  const t2 = JSON.parse(JSON.stringify(lista[1]));
  t2.rondas[0].mesas.forEach((m) => { if (m.n) m.r = "1-0"; });
  t2.rondas.push({ mesas: t2.rondas[0].mesas.map((m) => ({ b: m.n || m.b, n: m.n ? m.b : null, r: m.n ? null : "bye" })) });
  const vista2 = V.vistaEvento(EVENTO, [lista[0], t2], null);
  await page.evaluate((d) => window.__llega("pareo-evento-proy1234", "estado", d), vista2);
  await page.waitForSelector("[data-llamado]");
  ok(/PRUEBA SUB-12: ronda 2 emparejada/.test(await page.textContent("[data-llamado] h1")), "con una ronda nueva, el llamado en grande");
  igual("con las mesas de la sala", await page.$$eval("[data-llamado] table tbody tr td:first-child", (l) => l.map((x) => x.textContent)), ["5", "6", "7"]);
  ok((await page.evaluate(() => window.__dicho)).some((x) => /ronda 2 está emparejada/.test(x)), "y con «Leer en voz alta», lo dice");

  // Un torneo terminado: la premiación.
  const fin = JSON.parse(JSON.stringify(lista[0]));
  fin.rondasTotales = 1;
  fin.rondas[0].mesas.forEach((m) => { if (m.n) m.r = "1-0"; });
  const vista3 = V.vistaEvento(EVENTO, [fin], null);
  ok(vista3.torneos[0].terminado && vista3.torneos[0].podio.length >= 3, "un torneo terminado manda su podio");
  const p2 = await P.abrirPagina(browser, BASE, "#evento=proy5678&proyectar");
  await p2.page.evaluate((d) => window.__llega("pareo-evento-proy5678", "estado", d), vista3);
  await p2.page.waitForSelector("[data-podio]");
  ok(/Premiación: PRUEBA SUB-10/.test(await p2.page.textContent("[data-podio] h1")) && (await p2.page.$$eval("[data-podio] .pi-podio-lugar", (l) => l.length)) >= 3, "y el proyector muestra la premiación");
  ok(!errores.length && !p2.errores.length, "sin errores", errores.concat(p2.errores).join(" | "));
  await p2.ctx.close();
  await ctx.close();
}

(async () => {
  try { pruebaSinNavegador(); } catch (e) { mal("la parte sin navegador se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  for (const [nombre, f] of [["la sala", pruebaSala], ["la inscripción", pruebaInscripcion], ["el proyector", pruebaProyector]]) {
    try { await f(browser); } catch (e) { mal("la prueba de " + nombre + " se cayó", e.stack); }
  }
  await browser.close();
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
