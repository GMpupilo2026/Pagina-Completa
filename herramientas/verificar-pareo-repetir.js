/* Pareo Integral: repetir un evento, el QR de cada mesa y el repaso antes de
 * emparejar (js/pareo/pagina.js, js/pareo/ver.js).
 *
 *   - «Repetir este evento» arma uno nuevo con los mismos torneos y su
 *     configuración (ritmo, sistema, puntos, desempates, mesas de la sala,
 *     plazo de los capitanes, si da Elo) y el horario del día, con el año
 *     nuevo en el nombre, pero sin jugadores, rondas, fechas, publicación ni
 *     adjuntos; el evento viejo no se toca;
 *   - «Rótulos de mesa con QR»: un rótulo por mesa de la sala, con su número
 *     y un QR a #mesa=<n>; ese QR, en el celular de un adjunto, abre su
 *     enlace en esa mesa (la marca y le pone el foco), y «Ir a la mesa» hace
 *     lo mismo a mano; sin enlace de adjunto, dice qué hacer;
 *   - antes de emparejar, si quedó una sorpresa de Elo sin mirar o un nombre
 *     repetido en la lista, lo dice y deja elegir: revisar o emparejar igual.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-repetir.js
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
const confirmar = 'dialog[data-avisos="confirmar"][open]';

const EV = { id: "ev1", nombre: "JDE 2026 · Etapa Regional · DRE Alajuela", jde: { anio: 2026, etapa: "regional", lugar: "Alajuela" }, creado: "2026-05-01", decisiones: { descartados: [{ nombre: "X" }] } };
const persona = (n, elo) => ({ id: "j" + n, nombre: "PRUEBA " + n, institucion: "LICEO " + (n % 3), elo: elo || 0, retiradoDespuesDe: null });
function evento() {
  const a = T.nuevo({ nombre: "JDE 2026 · Etapa Regional · DRE Alajuela — Individual · Categoría A · Abierto", grupo: "Individual · Categoría A · Abierto",
    ritmo: "30 min + 30 s", sistema: "suizo", rondasTotales: 5, validoElo: "nacional", plazoAlineacion: 15, fechaInicio: "2026-05-10", fechaFin: "2026-05-10",
    jugadores: [1, 2, 3, 4, 5, 6].map((n) => persona(n)), publicado: { id: "11111111-1111-4111-8111-111111111111", clave: "k" },
    adjuntos: [{ codigo: "abc123", rango: "1-3", activo: true, nombre: "PRUEBA ADJ" }], jde: EV.jde });
  T.fijarNumeracion(a);
  a.rondas = [{ mesas: [{ b: "j1", n: "j2", r: "1-0" }, { b: "j3", n: "j4", r: "=" }, { b: "j5", n: "j6", r: "0-1" }], ausencias: {} }];
  const b = T.nuevo({ nombre: "JDE 2026 · Etapa Regional · DRE Alajuela — Individual · Categoría B · Mujeres", grupo: "Individual · Categoría B · Mujeres",
    ritmo: "30 min + 30 s", sistema: "todos", desempates: ["SB", "DE"], mesaInicial: 4, jde: EV.jde,
    jugadores: [7, 8, 9, 10].map((n) => persona(n)) });
  [a, b].forEach((t, i) => Object.assign(t, { evento: EV, ordenEnEvento: i }));
  return { a, b };
}
const sembrar = (lista, abierto, extra) => (page) => page.addInitScript(([l, a, x]) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify(l.map(([id, t], i) => ({ id, nombre: t.nombre, actualizado: 10 - i, evento: t.evento ? { id: t.evento.id, nombre: t.evento.nombre } : null }))));
  for (const [id, t] of l) localStorage.setItem("pareo_torneo_v1_" + id, JSON.stringify(t));
  localStorage.setItem("pareo_abierto_v1", a);
  for (const [k, v] of Object.entries(x || {})) localStorage.setItem(k, v);
}, [lista, abierto, extra]);

async function pruebaRepetir(browser) {
  console.log("\n=== Repetir este evento ===");
  const { a, b } = evento();
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    await p.clock.setFixedTime(new Date("2027-03-01T15:00:00Z"));
    await sembrar([["ta", a], ["tb", b]], "ta", { pareo_horario_v1_ev1: "07:30", pareo_horario_v1_ev1_descanso: "15" })(p);
  });
  await page.click('[data-ficha="archivos"]');
  await page.waitForSelector("#pi-evento-repetir");
  await page.click("#pi-evento-repetir");
  await page.waitForSelector(confirmar);
  ok(/mismos 2 torneos/.test(await page.textContent(confirmar)), "pregunta antes, y dice cuántos torneos copia");
  await page.click(confirmar + " [data-avisos-aceptar]");
  const todos = await P.esperarGuardado(page, (l) => l.length === 4);
  const nuevos = todos.filter((x) => x.evento && x.evento.id !== "ev1");
  const viejos = todos.filter((x) => x.evento && x.evento.id === "ev1");
  igual("quedan los dos eventos: el viejo y el nuevo, con dos torneos cada uno", [viejos.length, nuevos.length], [2, 2]);
  const [na, nb] = nuevos.sort((x, y) => x.ordenEnEvento - y.ordenEnEvento);
  igual("el evento nuevo, con el año de hoy en el nombre (en los JDE, el nombre oficial)", [na.evento.nombre, na.evento.jde.anio], ["JDE 2027 · Etapa Regional · DRE Alajuela", 2027]);
  igual("y cada torneo con el suyo", na.nombre, "JDE 2027 · Etapa Regional · DRE Alajuela — Individual · Categoría A · Abierto");
  igual("la configuración de cada torneo viaja", [na.ritmo, na.sistema, na.rondasTotales, na.validoElo, na.plazoAlineacion, nb.sistema, nb.desempates, nb.mesaInicial],
    ["30 min + 30 s", "suizo", 5, "nacional", 15, "todos", ["SB", "DE"], 4]);
  igual("y nada de lo que pasó ese día: ni jugadores, ni rondas, ni fechas, ni la publicación, ni los adjuntos, ni las decisiones",
    [na.jugadores.length, na.rondas.length, na.fechaInicio, na.publicado || null, na.adjuntos || null, na.numeracion, Object.keys(na.evento.decisiones).length], [0, 0, "", null, null, null, 0]);
  const v = viejos.find((x) => x.grupo === a.grupo);
  igual("el evento viejo queda como estaba", [v.jugadores.length, v.rondas.length, v.evento.nombre, !!v.publicado], [6, 1, EV.nombre, true]);
  const horario = await page.evaluate((id) => [localStorage.getItem("pareo_horario_v1_" + id), localStorage.getItem("pareo_horario_v1_" + id + "_descanso")], na.evento.id);
  igual("el horario del día pasa al evento nuevo", horario, ["07:30", "15"]);
  ok(/Pon las fechas y sube la lista/.test(await page.evaluate(() => document.body.innerText)), "y dice lo que falta");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaRotulos(browser) {
  console.log("\n=== Los rótulos de mesa con QR ===");
  const { a, b } = evento();
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar([["ta", a], ["tb", b]], "ta"));
  await page.click('[data-ficha="archivos"]');
  await page.waitForSelector("#pi-sala-rotulos");
  await page.click("#pi-sala-rotulos");
  await page.waitForSelector(".pi-rotulo .pi-rotulo-qr svg", { state: "attached" }); // (en la pantalla no se ve: es para imprimir)
  // A: 6 jugadores → mesas 1, 2 y 3; B: 4 jugadoras desde la mesa 4 → 4 y 5.
  igual("un rótulo por mesa de la sala, con el número de la sala", await page.$$eval(".pi-rotulo", (l) => l.map((x) => x.dataset.rotulo)), ["1", "2", "3", "4", "5"]);
  ok(/Categoría B/.test(await page.textContent('[data-rotulo="4"]')), "con la categoría de esa mesa");
  ok(await page.$$eval(".pi-rotulo-qr svg", (l) => l.length) === 5, "y su QR");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== El QR de la mesa en el celular del adjunto ===");
  {
    const sin = await P.abrirPagina(browser, BASE, "#mesa=3");
    await sin.page.waitForSelector("#pi-ver h1");
    ok(/Mesa 3/.test(await sin.page.textContent("#pi-ver h1")) && /enlace de adjunto/.test(await sin.page.textContent("#pi-ver")), "sin enlace de adjunto en el celular, dice qué hacer");
    await sin.ctx.close();
  }
  const cel = await P.abrirPagina(browser, BASE, "#mesa=3", (p) => p.addInitScript(() => {
    localStorage.setItem("pareo_adjunto_ultimo_v1", JSON.stringify({ cadena: "abc123&m=1-3", hora: Date.now() - 3600 * 1000 }));
  }));
  await cel.page.waitForFunction(() => location.hash === "#adjunto=abc123&m=1-3&ir=3");
  ok(true, "con un enlace de adjunto reciente, lo abre en esa mesa");
  const estado = { ronda: 1, nombre: "PRUEBA", arbitro: "PRUEBA ADJ", mesas: [1, 2, 3].map((m) => ({ m, f: m, b: "PRUEBA B" + m, n: "PRUEBA N" + m, r: null })) };
  await cel.page.waitForFunction(() => window.__enviados && window.__enviados.length > 0);
  await cel.page.evaluate((d) => window.__llega("pareo-adjunto-abc123", "estado", d), estado);
  await cel.page.waitForSelector('li[data-fisica="3"].pi-adj-ir-mesa');
  ok(await cel.page.evaluate(() => document.querySelector('li[data-fisica="3"]').contains(document.activeElement)), "la marca y le pone el foco");
  igual("y lo dice", await cel.page.textContent("#pi-adj-ir-estado"), "Mesa 3.");
  await cel.page.fill("#pi-adj-ir-n", "9");
  await cel.page.click('#pi-adj-ir button[type="submit"]');
  igual("«Ir a la mesa» con una que no es suya: lo dice", await cel.page.textContent("#pi-adj-ir-estado"), "La mesa 9 no está entre tus mesas de esta ronda.");
  await cel.page.fill("#pi-adj-ir-n", "1");
  await cel.page.click('#pi-adj-ir button[type="submit"]');
  igual("y con una suya, lleva a ella", await cel.page.$$eval(".pi-adj-ir-mesa", (l) => l.map((x) => x.dataset.fisica)), ["1"]);
  ok(!cel.errores.length, "sin errores en la página", cel.errores.join(" | "));
  await cel.ctx.close();
}

async function pruebaRepaso(browser) {
  console.log("\n=== El repaso antes de emparejar ===");
  // PRUEBA 6 (1000) le ganó a PRUEBA 5 (2100): una sorpresa de Elo; y PRUEBA 7
  // está dos veces (con otra escritura).
  const t = T.nuevo({ nombre: "PRUEBA REPASO", rondasTotales: 3,
    jugadores: [persona(1, 1800), persona(2, 1700), persona(3, 1600), persona(4, 1500), persona(5, 2100), persona(6, 1000), persona(7, 1200),
      Object.assign(persona(8, 1100), { nombre: "Prueba  7" })] });
  T.fijarNumeracion(t);
  t.rondas = [{ mesas: [{ b: "j5", n: "j6", r: "0-1" }, { b: "j1", n: "j2", r: "1-0" }, { b: "j3", n: "j4", r: "=" }, { b: "j7", n: "j8", r: "1-0" }], ausencias: {} }];
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    await p.addInitScript(() => { window.__sinAutoConfirmar = true; });
    await sembrar([["tr", t]], "tr")(p);
  });
  await page.click('[data-ficha="rondas"]');
  await page.click('#pi-rondas-nav button:has-text("Ronda 2")');
  await page.waitForSelector("#pi-emparejar");
  await page.click("#pi-emparejar");
  await page.waitForSelector(confirmar);
  const texto = await page.textContent(confirmar);
  ok(/Antes de emparejar la ronda 2/.test(texto) && /PRUEBA 6 le ganó a PRUEBA 5/.test(texto), "dice la sorpresa de Elo que nadie miró", texto);
  ok(/«PRUEBA 7» está 2 veces/.test(texto), "y el nombre repetido (sin importar mayúsculas ni espacios)", texto);
  await page.click(confirmar + " [data-avisos-cancelar]");
  await page.waitForTimeout(300);
  igual("«Revisar primero» no empareja", (await P.leerTodos(page))[0].rondas.length, 1);
  await page.click("#pi-emparejar");
  await page.waitForSelector(confirmar);
  await page.click(confirmar + " [data-avisos-aceptar]");
  const todos = await P.esperarGuardado(page, (l) => l[0].rondas.length === 2);
  igual("«Emparejar igual» empareja", todos[0].rondas.length, 2);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  // Sin nada que revisar, empareja sin preguntar.
  const limpio = T.nuevo({ nombre: "PRUEBA LIMPIO", rondasTotales: 3, jugadores: [1, 2, 3, 4].map((n) => persona(n, 1500)) });
  T.fijarNumeracion(limpio);
  limpio.rondas = [{ mesas: [{ b: "j1", n: "j2", r: "1-0" }, { b: "j3", n: "j4", r: "=" }], ausencias: {} }];
  const l2 = await P.abrirPagina(browser, BASE, "", async (p) => {
    await p.addInitScript(() => { window.__sinAutoConfirmar = true; });
    await sembrar([["tl", limpio]], "tl")(p);
  });
  await l2.page.click('[data-ficha="rondas"]');
  await l2.page.click('#pi-rondas-nav button:has-text("Ronda 2")');
  await l2.page.click("#pi-emparejar");
  const t2 = await P.esperarGuardado(l2.page, (l) => l[0].rondas.length === 2);
  igual("sin nada que revisar, empareja sin preguntar", [t2[0].rondas.length, await l2.page.$(confirmar)], [2, null]);
  await l2.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaRepetir(browser);
    await pruebaRotulos(browser);
    await pruebaRepaso(browser);
  } catch (e) {
    mal("la prueba se cayó", e && e.stack);
  }
  await browser.close();
  if (fallos) { console.log("\n✗ " + fallos + " comprobación(es) fallaron"); process.exit(1); }
  console.log("\n✓ Todo bien");
})();
