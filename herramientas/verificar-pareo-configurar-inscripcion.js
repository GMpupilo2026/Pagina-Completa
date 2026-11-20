/* Pareo Integral: la pantalla para configurar el formulario de inscripción
 * de un torneo (pareo.html, ficha Archivos, «Inscripción antes del torneo»
 * → «Configurar el formulario»; js/pareo/inscripcion-config.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - lo que se configura se guarda en `t.inscripcionEvento` y se publica
 *     dentro de `torneo.inscripcion` (cierre con hora, categorías por año,
 *     campos obligatorios, valor por defecto), sin tocar abierta/hasta;
 *   - sin nada distinto de lo de siempre no se publica configuración (el
 *     torneo queda { abierta, hasta } como antes);
 *   - con categorías, la fecha de nacimiento queda obligatoria y la
 *     categoría deja de pedirse, y la pantalla lo dice;
 *   - cada cambio vuelve a publicar y redibuja la ficha: la caja sigue
 *     abierta y el foco no se pierde;
 *   - la vista previa monta el formulario de verdad y NUNCA manda una
 *     inscripción;
 *   - «Volver al formulario de siempre» borra la configuración.
 *
 * Con CAPTURA=<archivo.png> guarda una captura de la caja configurada.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-configurar-inscripcion.js
 */
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const IC = require(path.join(RAIZ, "js/pareo/inscripcion-config.js"));
const IE = require(path.join(RAIZ, "js/inscripcion-evento.js"));
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const PUBLICADO = "00000000-0000-4000-8000-000000000001";

function pruebaSinNavegador() {
  console.log("\n=== Armar y leer la configuración ===");
  igual("lo de siempre no guarda nada", IC.armar(IC.leer(null)), null);
  const d = IC.leer(null);
  d.cierre = "2026-11-20T22:00";
  d.categorias = [{ nombre: "U12", desde: "2015", hasta: "2020", juegaEn: "" }, { nombre: "U16", desde: "2011", hasta: "2014", juegaEn: "U20" }, { nombre: "", desde: "2000", hasta: "2001" }, { nombre: "MAL", desde: "2010", hasta: "2005" }];
  d.campos.sexo = "obligatorio";
  d.campos.elo = "no";
  d.institucionDefecto = " ADAPZ ";
  const c = IC.armar(d);
  igual("guarda el cierre, las categorías con forma y solo lo distinto", c, {
    cierre: "2026-11-20T22:00",
    categorias: [{ nombre: "U12", desde: 2015, hasta: 2020 }, { nombre: "U16", desde: 2011, hasta: 2014, juegaEn: "U20" }],
    campos: { sexo: { pedir: true, obligatorio: true }, institucion: { defecto: "ADAPZ" }, elo: { pedir: false, obligatorio: false } },
  });
  const vuelta = IC.leer(c);
  igual("y al leerla, los controles dicen lo mismo", [vuelta.cierre, vuelta.categorias.length, vuelta.campos.sexo, vuelta.campos.elo, vuelta.campos.nota, vuelta.institucionDefecto], ["2026-11-20T22:00", 2, "obligatorio", "no", "si", "ADAPZ"]);
  // El módulo del formulario entiende lo que se guarda.
  const n = IE.normalizar(c);
  igual("el formulario la entiende: rama obligatoria, sin Elo, ADAPZ, nacimiento obligatorio y sin categoría a mano",
    [n.campos.sexo.obligatorio, n.campos.elo.pedir, n.campos.institucion.defecto, n.campos.nacimiento.obligatorio, n.campos.categoria.pedir], [true, false, "ADAPZ", true, false]);
}

async function dobleFuncion(page) {
  const pedidos = [];
  await page.route("**/functions/v1/pareo-publicar", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "ok" });
    const body = JSON.parse(route.request().postData() || "{}");
    pedidos.push(body);
    let r = { ok: true, id: body.id };
    if (body.accion === "inscripciones") r = { ok: true, inscripciones: [] };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(r) });
  });
  return pedidos;
}
const sembrar = (t) => (page) => page.addInitScript((x) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify([{ id: "tp", nombre: x.nombre, actualizado: 1, evento: null }]));
  localStorage.setItem("pareo_torneo_v1_tp", JSON.stringify(x));
  localStorage.setItem("pareo_abierto_v1", "tp");
}, t);

async function pruebaPantalla(browser) {
  console.log("\n=== La pantalla en Pareo Integral ===");
  const t = T.nuevo({ nombre: "PRUEBA ELIMINATORIA U12", fechaInicio: "2026-11-22", ciudad: "Pérez Zeledón", ritmo: "15 min + 5 s" });
  t.publicado = { id: PUBLICADO, clave: "clave-1", hora: 1 };
  t.inscripcion = { abierta: true, hasta: "2026-11-20" };
  let pedidos;
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    pedidos = await dobleFuncion(p);
    await sembrar(t)(p);
  });
  const ultimo = () => pedidos.filter((x) => x.accion === "actualizar").pop();
  const esperarPedido = (cuantos) => page.waitForFunction(() => true).then(async () => {
    for (let i = 0; i < 40 && pedidos.filter((x) => x.accion === "actualizar").length < cuantos; i++) await page.waitForTimeout(100);
  });

  await page.click('[data-ficha="archivos"]');
  ok(await P.vis(page, "#pi-ic-caja"), "la caja «Configurar el formulario» está dentro de la inscripción");
  ok(/el de siempre/.test(await page.textContent("#pi-ic-resumen")), "sin configurar, dice que es el formulario de siempre");
  ok(!(await P.vis(page, "#pi-ic-cierre")), "empieza cerrada");
  await page.click("#pi-ic-caja > summary");
  ok(await P.vis(page, "#pi-ic-cierre"), "al abrirla se ven los controles");

  let n = pedidos.filter((x) => x.accion === "actualizar").length;
  await page.fill("#pi-ic-cierre", "2026-11-20T22:00");
  await page.dispatchEvent("#pi-ic-cierre", "change");
  await esperarPedido(++n);
  igual("el cierre con hora se publica sin tocar abierta ni hasta", [ultimo().torneo.inscripcion.abierta, ultimo().torneo.inscripcion.hasta, ultimo().torneo.inscripcion.cierre], [true, "2026-11-20", "2026-11-20T22:00"]);
  await page.waitForSelector("#pi-ic-caja");
  ok(await page.evaluate(() => document.getElementById("pi-ic-caja").open), "después de publicar y redibujar, la caja sigue abierta");

  // Dos categorías.
  for (const [nombre, desde, hasta] of [["U12", "2015", "2020"], ["U16", "2011", "2014"]]) {
    await page.click("#pi-ic-agregar-categoria");
    const i = await page.evaluate(() => document.querySelectorAll("#pi-ic-categorias [data-categoria]").length - 1);
    igual("agregar una categoría pone el foco en su nombre", await page.evaluate(() => document.activeElement.id), "pi-ic-cat-nombre-" + i);
    await page.fill("#pi-ic-cat-nombre-" + i, nombre); await page.dispatchEvent("#pi-ic-cat-nombre-" + i, "change");
    await page.fill("#pi-ic-cat-desde-" + i, desde); await page.dispatchEvent("#pi-ic-cat-desde-" + i, "change");
    await page.fill("#pi-ic-cat-hasta-" + i, hasta); await page.dispatchEvent("#pi-ic-cat-hasta-" + i, "change");
  }
  await page.fill("#pi-ic-cat-juegaEn-1", "U20"); await page.dispatchEvent("#pi-ic-cat-juegaEn-1", "change");
  await page.waitForTimeout(300);
  igual("las categorías por año se publican", (ultimo().torneo.inscripcion.categorias || []).map((k) => [k.nombre, k.desde, k.hasta, k.juegaEn || ""]), [["U12", 2015, 2020, ""], ["U16", 2011, 2014, "U20"]]);
  ok(/la fecha de nacimiento decide/.test(await page.textContent("#pi-ic-nota-categorias")), "la pantalla dice que la fecha de nacimiento decide la categoría");
  igual("y la fecha de nacimiento queda obligatoria y la categoría sin pedir, sin poder cambiarlas",
    await page.evaluate(() => [document.getElementById("pi-ic-campo-nacimiento").value, document.getElementById("pi-ic-campo-nacimiento").disabled, document.getElementById("pi-ic-campo-categoria").value, document.getElementById("pi-ic-campo-categoria").disabled]),
    ["obligatorio", true, "no", true]);

  await page.focus("#pi-ic-campo-sexo");
  await page.selectOption("#pi-ic-campo-sexo", "obligatorio");
  await page.waitForTimeout(200);
  igual("el foco sigue en el control que se cambió aunque la ficha se redibuje", await page.evaluate(() => document.activeElement && document.activeElement.id), "pi-ic-campo-sexo");
  await page.fill("#pi-ic-institucion-defecto", "ADAPZ"); await page.dispatchEvent("#pi-ic-institucion-defecto", "change");
  await page.waitForTimeout(300);
  const c = ultimo().torneo.inscripcion;
  igual("la rama obligatoria y la escuela ya escrita se publican", [c.campos && c.campos.sexo && c.campos.sexo.obligatorio, c.campos && c.campos.institucion && c.campos.institucion.defecto], [true, "ADAPZ"]);
  const guardado = (await P.leerTodos(page))[0];
  igual("y quedan en el torneo, en inscripcionEvento (aparte de inscripcion)", [!!guardado.inscripcionEvento, guardado.inscripcionEvento.categorias.length, guardado.inscripcion.abierta], [true, 2, true]);
  ok(/2 categorías por año/.test(await page.textContent("#pi-ic-resumen")) && /cierra 20\/11 22:00/.test(await page.textContent("#pi-ic-resumen")), "el resumen dice qué tiene distinto", await page.textContent("#pi-ic-resumen"));

  console.log("\n=== La vista previa ===");
  await page.click("#pi-ic-ver-previa");
  await page.waitForSelector("#pi-ic-previa form");
  igual("la vista previa dice que está abierta", await page.getAttribute("#pi-ic-ver-previa", "aria-expanded"), "true");
  ok(await page.evaluate(() => !!document.querySelector('#pi-ic-previa input[type="date"]')), "pide la fecha de nacimiento");
  ok(await page.evaluate(() => [...document.querySelectorAll("#pi-ic-previa input")].some((x) => x.value === "ADAPZ")), "trae la escuela ya escrita");
  if (process.env.CAPTURA) {
    await page.evaluate(() => document.getElementById("pi-ic-caja").scrollIntoView());
    await page.locator("#pi-ic-caja").screenshot({ path: process.env.CAPTURA });
    console.log("  · captura en " + process.env.CAPTURA);
  }
  const antes = pedidos.length;
  await page.evaluate(() => document.querySelector("#pi-ic-previa form").requestSubmit());
  await page.waitForTimeout(400);
  igual("mandar desde la vista previa no manda nada", pedidos.slice(antes).filter((x) => x.accion === "inscribir").length, 0);
  ok(/no se mandó nada/.test(await page.textContent("#pi-ic-previa")), "y lo dice");

  console.log("\n=== Volver al formulario de siempre ===");
  n = pedidos.filter((x) => x.accion === "actualizar").length;
  await page.click("#pi-ic-de-siempre");
  await page.click('dialog[open] [data-avisos-aceptar]');
  await esperarPedido(++n);
  const fin = ultimo().torneo.inscripcion;
  igual("se publica otra vez { abierta, hasta } y nada más", Object.keys(fin).sort(), ["abierta", "hasta"]);
  ok(!(await P.leerTodos(page))[0].inscripcionEvento, "y el torneo ya no guarda configuración");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaSinNavegador();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPantalla(browser);
  } catch (e) {
    mal("la prueba se cayó", e && e.stack);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
