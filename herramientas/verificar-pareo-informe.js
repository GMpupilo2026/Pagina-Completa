/* Pareo Integral: el informe oficial completo, la premiación en tablas, la
 * configuración de los JDE fija, las ausencias con su justificación, la
 * acreditación y que cerrar la página no borre nada (js/pareo/evento.js,
 * js/pareo/pagina.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - el informe oficial trae, por torneo, la clasificación entera con sus
 *     desempates y el cuadro cruzado; y juntos, los clasificados y las
 *     ausencias e incomparecencias con si justificó;
 *   - la premiación va en tablas (medalla, lugar, nombre, centro, puntos),
 *     del tercer lugar al primero;
 *   - con la configuración de los JDE puesta, el ritmo, el sistema, los
 *     puntos y los desempates no se cambian sin un motivo, que va al acta;
 *   - antes de emparejar, quien quedó fuera por incomparecencia se ve y se
 *     devuelve con un clic;
 *   - la acreditación en Jugadores: quien no está presente no se empareja en
 *     ninguna ronda hasta que el árbitro lo marque;
 *   - al recargar la página: lo marcado antes de emparejar, lo escrito en un
 *     campo sin salir de él y el jugador a medio escribir siguen ahí.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-informe.js
 */
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
const formulario = 'dialog[data-avisos="formulario"][open]';

// Seis jugadores, dos rondas: en la ronda 1 la mesa 3 es una incomparecencia
// (F no vino), y en la ronda 2 E pidió bye de medio punto.
function torneo() {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const t = T.nuevo({ nombre: "PRUEBA", grupo: "Individual · Categoría A · Abierto", rondasTotales: 2, fechaInicio: "2026-10-22",
    jugadores: ids.map((id, k) => ({ id, nombre: "PRUEBA " + id.toUpperCase(), institucion: "LICEO " + id.toUpperCase(), elo: 1800 - 50 * k, retiradoDespuesDe: null })) });
  T.fijarNumeracion(t);
  t.rondas = [
    { mesas: [{ b: "a", n: "d", r: "1-0" }, { b: "e", n: "b", r: "=" }, { b: "c", n: "f", r: "+-" }], ausencias: {} },
    { mesas: [{ b: "b", n: "a", r: "0-1" }, { b: "d", n: "c", r: "1-0" }], ausencias: { e: "H", f: "Z" }, sinAcreditar: [] },
  ];
  t.evento = { id: "ev1", nombre: "PRUEBA EVENTO", jde: { anio: 2026, etapa: "regional", lugar: "Alajuela" } };
  return t;
}
const bloquesTras = (doc, texto) => doc.bloques.slice(doc.bloques.findIndex((b) => b.texto && b.texto.startsWith(texto)) + 1);

function pruebaDocumentos() {
  console.log("\n=== El informe oficial ===");
  const t = torneo();
  t.justificaciones = { "0|f": false };
  const inf = V.informe(t.evento, [t]);
  const clas = bloquesTras(inf, "Clasificación tras la ronda 2")[0];
  igual("la clasificación entera, no solo los que clasifican, con sus desempates", [clas.filas.length, clas.encabezados.slice(4, 4 + t.desempates.length)], [6, t.desempates]);
  ok(clas.filas[0][1] === "PRUEBA A" && clas.encabezados.includes("Clasifica"), "con el primero arriba y la columna «Clasifica»", JSON.stringify(clas.filas[0]));
  const cruz = bloquesTras(inf, "Cuadro cruzado de enfrentamientos")[0];
  igual("el cuadro cruzado: una columna por ronda", cruz.encabezados, ["Puesto", "N.º", "Nombre", "R1", "R2", "Puntos"]);
  const num = T.numeros(t);
  const filaA = cruz.filas.find((f) => f[2] === "PRUEBA A");
  igual("cada ronda con el número del rival, el color y el resultado", filaA.slice(3, 5), [num.get("d") + "b 1", num.get("b") + "n 1"]);
  const filaE = cruz.filas.find((f) => f[2] === "PRUEBA E");
  ok(filaE[4] === "Libre ½", "el bye pedido, con sus puntos", filaE[4]);
  const clasif = bloquesTras(inf, "Clasificados a la Etapa").find((x) => x.tipo === "tabla");
  ok(clasif && clasif.tipo === "tabla" && clasif.encabezados.join() === "Puesto,Nombre,Centro educativo" && clasif.filas.length >= 1, "los clasificados de todos los torneos, en una tabla", JSON.stringify(clasif));
  const aus = bloquesTras(inf, "Ausencias e incomparecencias").find((x) => x.tipo === "tabla");
  const filaF1 = aus.filas.find((f) => f[1] === "PRUEBA F" && f[0] === "1");
  const filaE2 = aus.filas.find((f) => f[1] === "PRUEBA E");
  const filaF2 = aus.filas.find((f) => f[1] === "PRUEBA F" && f[0] === "2");
  igual("las ausencias, con qué pasó y si justificó", [filaF1.slice(3, 5), filaE2.slice(3, 5), filaF2.slice(3, 5)],
    [["Perdió por incomparecencia", "No"], ["Pidió bye (avisó)", "Sí"], ["No se presentó", "Sin decidir"]]);

  console.log("\n=== La premiación, en tablas ===");
  const pre = V.premiacion(t.evento, [t]);
  const podio = pre.bloques.find((b) => b.tipo === "tabla" && b.encabezados[0] === "Medalla");
  igual("medalla, lugar, nombre, centro y puntos", podio.encabezados, ["Medalla", "Lugar", "Nombre", "Centro educativo", "Puntos"]);
  igual("del tercer lugar al primero", podio.filas.map((f) => f[0]), podio.filas.map((f) => f[0]).slice().sort((x, y) => ["Bronce", "Plata", "Oro"].indexOf(x) - ["Bronce", "Plata", "Oro"].indexOf(y)));
  ok(podio.filas[podio.filas.length - 1][2] === "PRUEBA A", "y el campeón al final");

  console.log("\n=== El cambio de configuración, en el acta ===");
  t.cambiosConfig = [{ hora: Date.parse("2026-10-22T15:00:00Z"), motivo: "Acuerdo del congresillo", antes: Object.assign(V.configuracionDe(t), { ritmo: "10 min + 2 s por jugada" }) }];
  t.ritmo = "15 min + 5 s por jugada";
  const acta = V.acta(t.evento, [t]);
  const lista = bloquesTras(acta, "") && acta.bloques[acta.bloques.findIndex((b) => /Cambios a la configuración de los JDE/.test(b.texto || "")) + 1];
  ok(lista && /«Acuerdo del congresillo»\. Antes: ritmo 10 min \+ 2 s por jugada.*Después: ritmo 15 min \+ 5 s por jugada/.test(lista.items[0]), "con el motivo, lo de antes y lo de después", lista && lista.items[0]);
}

const sembrar = (t) => (page) => page.addInitScript((x) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1, evento: x.evento ? { id: x.evento.id, nombre: x.evento.nombre } : null }]));
  localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
  localStorage.setItem("pareo_abierto_v1", "tp");
}, t);

async function pruebaConfigFija(browser) {
  console.log("\n=== La configuración de los JDE, fija ===");
  const t = T.nuevo({ nombre: "PRUEBA JDE", ritmo: "10 min + 2 s por jugada", jugadores: ["a", "b", "c", "d"].map((id) => ({ id, nombre: "PRUEBA " + id, retiradoDespuesDe: null })) });
  t.jde = { anio: 2026, etapa: "regional", lugar: "Alajuela" };
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.click('[data-ficha="torneo"]');
  const estado = () => page.evaluate(() => {
    const f = document.getElementById("pi-form-torneo");
    return [f.elements.ritmo.readOnly, f.elements.p_victoria.disabled, document.getElementById("pi-desempate-agregar").disabled, document.querySelector("#pi-desempates .pi-baja").disabled];
  });
  igual("ritmo, puntos y desempates no se tocan", await estado(), [true, true, true, true]);
  ok(await P.vis(page, "#pi-config-fija"), "y lo dice");
  await page.$eval('#pi-form-torneo [name="p_victoria"]', (i) => { i.disabled = false; i.value = "3"; i.dispatchEvent(new Event("change", { bubbles: true })); });
  ok((await P.leerTodos(page))[0].puntos.victoria === 1, "ni forzándolo desde la consola");
  await page.click("#pi-config-cambiar");
  await page.waitForSelector(formulario);
  await page.click(formulario + " [data-avisos-aceptar]");
  ok(!(await P.leerTodos(page))[0].configLibre, "sin motivo, no se abre");
  await page.click("#pi-config-cambiar");
  await page.waitForSelector(formulario);
  await page.fill(formulario + ' [name="motivo"]', "Acuerdo del congresillo");
  await page.click(formulario + " [data-avisos-aceptar]");
  const [g] = await P.esperarGuardado(page, (l) => !!l[0].configLibre);
  igual("con el motivo, se abre y queda anotado con lo de antes", [g.cambiosConfig.length, g.cambiosConfig[0].motivo, g.cambiosConfig[0].antes.ritmo], [1, "Acuerdo del congresillo", "10 min + 2 s por jugada"]);
  ok(!(await estado())[0], "ya se puede cambiar el ritmo");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaRondas(browser) {
  console.log("\n=== Antes de emparejar: los que quedaron fuera, y lo marcado se guarda ===");
  const t = T.nuevo({ nombre: "PRUEBA FUERA", rondasTotales: 3, jugadores: ["a", "b", "c", "d", "e", "f"].map((id, k) => ({ id, nombre: "PRUEBA " + id.toUpperCase(), elo: 1800 - 50 * k, retiradoDespuesDe: null })) });
  T.fijarNumeracion(t);
  t.rondas = [{ mesas: [{ b: "a", n: "d", r: "1-0" }, { b: "e", n: "b", r: "=" }, { b: "c", n: "f", r: "+-" }], ausencias: {} }];
  T.retirosPorIncomparecencia(t);
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.click('[data-ficha="rondas"]');
  await (await page.$$("#pi-rondas-nav button")).pop().click();
  await page.waitForSelector("#pi-fuera-incomparecencia");
  ok(/PRUEBA F/.test(await page.textContent("#pi-fuera-incomparecencia")), "dice quién no juega por la incomparecencia");
  await page.selectOption('select[aria-label^="PRUEBA B"]', "H");
  await P.esperarGuardado(page, (l) => l[0].pedidas && l[0].pedidas.ausencias.b === "H");
  await page.reload({ waitUntil: "networkidle" });
  await page.click('[data-ficha="rondas"]');
  await (await page.$$("#pi-rondas-nav button")).pop().click();
  await page.waitForSelector('select[aria-label^="PRUEBA B"]');
  igual("el bye pedido sigue marcado al volver a abrir la página", await page.$eval('select[aria-label^="PRUEBA B"]', (s) => s.value), "H");
  await page.click('#pi-fuera-incomparecencia [data-devolver="f"]');
  const [g] = await P.esperarGuardado(page, (l) => l[0].jugadores.find((j) => j.id === "f").retiradoDespuesDe === null);
  igual("«Vuelve a jugar» lo devuelve desde ahí", g.jugadores.find((j) => j.id === "f").vuelveTras, 0);
  ok(!(await page.$("#pi-fuera-incomparecencia")), "y el aviso se va");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaAcreditacion(browser) {
  console.log("\n=== La acreditación, en Jugadores ===");
  const t = T.nuevo({ nombre: "PRUEBA ACREDITAR", rondasTotales: 3, jugadores: ["a", "b", "c", "d", "e", "f"].map((id, k) => ({ id, nombre: "PRUEBA " + id.toUpperCase(), elo: 1800 - 50 * k, retiradoDespuesDe: null })) });
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-j-asistencia summary");
  await page.check("#pi-j-asistencia-activar");
  // Pasar por Rondas con todos sin acreditar: marcarlos presentes después
  // tiene que sacarlos de «no viene» (antes quedaba guardado y no se
  // emparejaba a nadie).
  await page.click('[data-ficha="rondas"]');
  await page.waitForSelector("#pi-emparejar");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-j-asistencia-todos");
  await page.uncheck("#pi-j-llego-f");
  await P.esperarGuardado(page, (l) => l[0].pasarLista && !l[0].asistencia.f && l[0].asistencia.a);
  bien("se pasa la lista desde Jugadores");
  const juegaF = (l, r) => l[0].rondas[r].mesas.some((m) => m.b === "f" || m.n === "f");
  for (const r of [0, 1]) {
    await page.click('[data-ficha="rondas"]');
    await (await page.$$("#pi-rondas-nav button")).pop().click();
    await page.click("#pi-emparejar");
    await page.waitForFunction(() => !document.getElementById("pi-emparejar"));
    const l = await P.leerTodos(page);
    ok(!juegaF(l, r) && l[0].rondas[r].ausencias.f === "Z" && (l[0].rondas[r].sinAcreditar || []).includes("f"), "sin acreditar, no se empareja en la ronda " + (r + 1));
    await P.anotar(page, "1-0");
  }
  await page.click('[data-ficha="jugadores"]');
  await page.check("#pi-j-llego-f");
  await page.click('[data-ficha="rondas"]');
  await (await page.$$("#pi-rondas-nav button")).pop().click();
  await page.click("#pi-emparejar");
  await page.waitForFunction(() => !document.getElementById("pi-emparejar"));
  ok(juegaF(await P.leerTodos(page), 2), "marcado presente, se empareja en la ronda 3");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaAusencias(browser) {
  console.log("\n=== Si justificó, en la ficha Archivos ===");
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(torneo()));
  await page.click('[data-ficha="archivos"]');
  await page.waitForSelector("#pi-ausencias");
  const sel = '#pi-ausencias select[data-ausencia="0|f"]';
  igual("la incomparecencia empieza sin decidir; el bye pedido, justificado", [await page.$eval(sel, (s) => s.value), await page.$eval('#pi-ausencias select[data-ausencia="1|e"]', (s) => s.value)], ["", "si"]);
  await page.selectOption(sel, "no");
  const [g] = await P.esperarGuardado(page, (l) => l[0].justificaciones && l[0].justificaciones["0|f"] === false);
  ok(g.justificaciones["0|f"] === false, "lo que anota el árbitro queda en el torneo (y va al informe)");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaVivo(browser) {
  console.log("\n=== El enlace en vivo, en la ficha Torneo ===");
  for (const conEvento of [false, true]) {
    const t = T.nuevo({ nombre: "PRUEBA VIVO", jugadores: ["a", "b"].map((id) => ({ id, nombre: "PRUEBA " + id, retiradoDespuesDe: null })) });
    if (conEvento) t.evento = { id: "ev-vivo", nombre: "PRUEBA EVENTO" };
    const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
    await page.click('[data-ficha="torneo"]');
    ok(await P.vis(page, "#pi-tv-boton"), (conEvento ? "en un evento" : "en un torneo suelto") + ", el botón está en la ficha Torneo");
    await page.click("#pi-tv-boton");
    await page.waitForSelector("#pi-tv-url");
    const url = await page.textContent("#pi-tv-url");
    ok(conEvento ? /pareo\.html#evento=[a-z0-9]+$/.test(url) : /pareo\.html#vivo=[a-z0-9]+$/.test(url), "y da el enlace " + (conEvento ? "de todo el evento" : "de este torneo") + ", con su QR", url);
    ok(await P.vis(page, "#pi-tv-qr svg"), "se ve el código QR");
    igual("el botón dice que está prendido", await page.getAttribute("#pi-tv-boton", "aria-pressed"), "true");
    if (!conEvento) ok(await page.isChecked("#pi-ver-en-vivo"), "y es el mismo de «Ver desde el celular», en Rondas");
    ok(!errores.length, "sin errores en la página", errores.join(" | "));
    await ctx.close();
  }
}

async function pruebaCerrar(browser) {
  console.log("\n=== Cerrar la página sin querer ===");
  const t = T.nuevo({ nombre: "PRUEBA CERRAR", jugadores: [] });
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar(t));
  await page.click('[data-ficha="torneo"]');
  await page.click('#pi-form-torneo [name="ciudad"]');
  await page.keyboard.type("Alajuela");
  await P.esperarGuardado(page, (l) => l[0].ciudad === "Alajuela");
  bien("lo escrito en un campo se guarda sin salir de él");
  await page.click('[data-ficha="jugadores"]');
  await page.fill('#pi-form-jugador [name="nombre"]', "PRUEBA A MEDIAS");
  await page.reload({ waitUntil: "networkidle" });
  await page.click('[data-ficha="jugadores"]');
  igual("el jugador a medio escribir vuelve al abrir la página", await page.$eval('#pi-form-jugador [name="nombre"]', (i) => i.value), "PRUEBA A MEDIAS");
  ok(/Recuperé lo que estabas escribiendo/.test(await page.textContent("body")), "y lo dice");
  await page.click('#pi-form-jugador button[type="submit"]');
  await P.esperarGuardado(page, (l) => l[0].jugadores.length === 1);
  igual("al agregarlo, el borrador se borra", await page.evaluate(() => localStorage.getItem("pareo_borrador_v1")), "");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaDocumentos();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaConfigFija(browser);
    await pruebaRondas(browser);
    await pruebaAcreditacion(browser);
    await pruebaAusencias(browser);
    await pruebaCerrar(browser);
    await pruebaVivo(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
