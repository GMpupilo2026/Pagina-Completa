#!/usr/bin/env node
/* La encuesta de satisfacción: el alumno contesta (encuesta-profesor.html) y
   quien administra o supervisa lee (satisfaccion.html), comprobado en un
   navegador de verdad con un cliente de Supabase de mentira.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - una respuesta mandada con el profesor equivocado le baja el promedio a
 *    otro, y las dos pantallas se ven perfectas;
 *  - una pregunta sin contestar que viaja como 0 (o sin viajar) hunde el
 *    promedio sin que nadie lo note: la pantalla tiene que pararla ANTES;
 *  - quien ya contestó y vuelve tiene que ver lo que mandó, o cree que no quedó;
 *  - un nombre o un comentario escrito por una persona tiene que ir como texto;
 *  - «A revisar» tiene que ir escrito, no solo en un color.
 *
 * Lo que hace cumplir la BASE (que solo califique a SUS profesores, las notas
 * del 1 al 5, una por mes, que el profesor calificado no vea nada) se comprobó
 * impersonando roles en SQL: acá el cliente es de mentira.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-encuesta-profesor.js
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { mensajesVisibles } = require("./lib/avisos-prueba.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const ALUMNA = { id: "a-1", role: "alumno", is_admin: false, es_supervisor: false };
const PROFE = { id: "p-1", role: "profesor", is_admin: false, es_supervisor: false };
const ADMIN = { id: "ad-1", role: "profesor", is_admin: true, es_supervisor: false };
const SUP = { id: "s-1", role: "profesor", is_admin: false, es_supervisor: true };

const XSS = '<img src=x onerror="window.__xss=1">Ana';

function clienteFalso(datos, yo) {
  return `
window.__rpc = [];
(function () {
  const D = ${JSON.stringify(datos)};
  const YO = ${JSON.stringify(yo)};
  // El resolver de una llamada: .range() también se apunta, porque es lo que
  // dice que la lista se pide de mil en mil.
  function resolver(data, anotar) {
    const r = {
      range(a, b) { if (anotar) anotar.rango = [a, b]; return r; },
      then(res, rej) { return Promise.resolve({ data: data, error: null }).then(res, rej); },
    };
    return r;
  }
  function tabla(nombre) {
    let cond = [], unica = false;
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, in() { return b; },
      eq(c, v) { cond.push([c, v]); return b; },
      is() { return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = nombre === "profiles" ? [YO] : (D.tablas[nombre] || []);
        // Los filtros se aplican de verdad, en el resolver.
        cond.forEach(([c, v]) => { d = d.filter((f) => f[c] === v); });
        if (unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: YO.id }, access_token: "t" } } }) },
    from: tabla,
    rpc(n, args) {
      const anotada = { n: n, args: args || null };
      window.__rpc.push(anotada);
      if (n === "mis_funciones_coordinacion") return resolver(null);
      if (n === "respuestas_satisfaccion") {
        let d = D.respuestas || [];
        if (args.p_profesor) d = d.filter((x) => x.profesor_id === args.p_profesor);
        if (args.p_solo_se_van) d = d.filter((x) => x.seguir === "no");
        return resolver(d, anotada);
      }
      return resolver(D.rpc[n] !== undefined ? D.rpc[n] : [], anotada);
    },
  };
})();`;
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(nombre, valor, detalle) {
  if (!valor) { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
  else console.log("  ✓ " + nombre);
}

async function abrir(browser, pagina, datos, yo, esperar) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, yo) }));
  await page.goto(BASE + pagina, { waitUntil: "networkidle" });
  await page.waitForSelector(esperar || "#app:not(.hidden)", { timeout: 15000 });
  return { page, errores, ctx };
}

const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? (el.checkVisibility() ? "sí" : "no") : "no existe";
}, sel);
const llamadas = (page, n) => page.evaluate((x) => window.__rpc.filter((r) => r.n === x), n);
const marcadas = (page) => page.evaluate(() => {
  const o = {};
  document.querySelectorAll("#form input[type=radio]:checked").forEach((i) => { o[i.name] = i.value; });
  return o;
});

async function pruebaAlumna(browser) {
  console.log("\nLa alumna contesta sobre su profesor");
  const mes = await (async () => {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    return d.find((p) => p.type === "year").value + "-" + d.find((p) => p.type === "month").value + "-01";
  })();
  const datos = {
    tablas: { encuestas_profesor: [
      // Ya contestó sobre Bruno este mes; sobre Carla, de un mes viejo (no cuenta).
      { alumno_id: "a-1", profesor_id: "p-2", periodo: mes, explica: 2, aprende: 3, claridad: 1, creatividad: 4, resuelve: 5, contento: 2, seguir: "no_se", comentario: "Va muy rápido" },
      { alumno_id: "a-1", profesor_id: "p-1", periodo: "2020-01-01", explica: 5, aprende: 5, claridad: 5, creatividad: 5, resuelve: 5, contento: 5, seguir: "si", comentario: "" },
    ] },
    rpc: { encuesta_mis_profesores: [
      { id: "p-2", nombre: "Bruno Mena", respondida: true },
      { id: "p-1", nombre: XSS, respondida: false },
    ] },
  };
  const { page, errores, ctx } = await abrir(browser, "/encuesta-profesor.html", datos, ALUMNA, "#form:not([hidden])");

  igual("con dos profesores se ve para elegir", await seVe(page, "#elegir-profesor-caja"), "sí");
  igual("arranca por el que le falta este mes", await page.evaluate(() => document.querySelector('input[name=profesor]:checked').value), "p-1");
  igual("el nombre escrito por una persona va como texto", await page.evaluate(() => document.querySelector("#form-titulo").textContent), "Tus clases con " + XSS);
  igual("un respuesta de otro mes no sale marcada", await marcadas(page), {});
  igual("seis preguntas de cinco opciones y tres para «seguir»",
    await page.evaluate(() => [...document.querySelectorAll("#preguntas fieldset")].map((f) => f.querySelectorAll("input").length).concat(document.querySelectorAll("#seguir input").length)),
    [5, 5, 5, 5, 5, 5, 3]);
  igual("cada opción lleva su número escrito",
    await page.evaluate(() => [...document.querySelectorAll('#preguntas input[name="claridad"]')].map((i) => i.parentElement.textContent)),
    ["1 · Muy confusas", "2 · Algo confusas", "3 · Ni claras ni confusas", "4 · Claras", "5 · Muy claras"]);

  // Incompleta: no viaja nada y se dice cuáles faltan.
  await page.check('input[name="explica"][value="4"]');
  await page.click("#enviar");
  await page.waitForTimeout(200);
  igual("incompleta no llama a la base", (await llamadas(page, "responder_encuesta_profesor")).length, 0);
  cierto("dice cuáles preguntas faltan", /Te faltan las preguntas 2, 3, 4, 5, 6, 7/.test(await mensajesVisibles(page)), await mensajesVisibles(page));

  // Completa, con el teclado para una de ellas.
  for (const [n, v] of [["aprende", "5"], ["claridad", "2"], ["creatividad", "3"], ["resuelve", "4"], ["contento", "5"], ["seguir", "no"]]) {
    await page.check(`input[name="${n}"][value="${v}"]`);
  }
  await page.focus('input[name="explica"][value="4"]');
  await page.keyboard.press("ArrowRight");
  await page.fill("#comentario", "  Me cambio de horario  ");
  await page.click("#enviar");
  await page.waitForTimeout(300);
  const env = await llamadas(page, "responder_encuesta_profesor");
  igual("manda exactamente lo marcado, al profesor elegido", env.map((e) => e.args), [{
    p_profesor: "p-1", p_seguir: "no", p_comentario: "Me cambio de horario",
    p_explica: 5, p_aprende: 5, p_claridad: 2, p_creatividad: 3, p_resuelve: 4, p_contento: 5,
  }]);
  igual("queda marcado como contestado", await page.evaluate(() => [...document.querySelectorAll("#profesores label")].map((l) => l.textContent.includes("Ya contestaste"))), [true, true]);

  // El que ya contestó este mes: se le enseña lo que mandó.
  await page.check('input[name="profesor"][value="p-2"]');
  await page.waitForTimeout(300);
  igual("lo que ya mandó sale marcado", await marcadas(page),
    { explica: "2", aprende: "3", claridad: "1", creatividad: "4", resuelve: "5", contento: "2", seguir: "no_se" });
  igual("con su comentario", await page.inputValue("#comentario"), "Va muy rápido");
  igual("el botón dice que corrige", await page.textContent("#enviar"), "Guardar los cambios");
  igual("sin inyección", await page.evaluate(() => window.__xss || 0), 0);
  igual("sin errores en la página", errores, []);
  await ctx.close();

  console.log("\nSin profesor asignado, y un profesor que entra");
  const sin = await abrir(browser, "/encuesta-profesor.html", { tablas: {}, rpc: { encuesta_mis_profesores: [] } }, ALUMNA, "#sin-profesor:not([hidden])");
  igual("sin profesor lo dice", await seVe(sin.page, "#sin-profesor"), "sí");
  igual("y no enseña preguntas", await seVe(sin.page, "#form"), "no");
  await sin.ctx.close();
  const pr = await abrir(browser, "/encuesta-profesor.html", { tablas: {}, rpc: {} }, PROFE, "#denegado:not(.hidden)");
  igual("un profesor no la contesta", await seVe(pr.page, "#denegado"), "sí");
  await pr.ctx.close();
}

async function pruebaResultados(browser) {
  console.log("\nQuien administra lee los resultados");
  const RESUMEN = [
    { profesor_id: "p-1", nombre: XSS, respuestas: 3, explica: 2.3, aprende: 3, claridad: 2, creatividad: 3.3, resuelve: 3, contento: 2.7, promedio: 2.7, seguir_si: 1, seguir_no_se: 1, seguir_no: 1, comentarios: 1 },
    { profesor_id: "p-2", nombre: "Bruno Mena", respuestas: 2, explica: 4.5, aprende: 5, claridad: 4.5, creatividad: 4, resuelve: 5, contento: 5, promedio: 4.7, seguir_si: 2, seguir_no_se: 0, seguir_no: 0, comentarios: 0 },
  ];
  const RESP = [
    { id: "r1", periodo: "2026-09-01", profesor_id: "p-1", profesor: XSS, alumno_id: "a-1", alumno: "Dani <b>Ruiz</b>", explica: 1, aprende: 2, claridad: 1, creatividad: 3, resuelve: 2, contento: 1, seguir: "no", comentario: '<script>window.__xss=2</script>No le entiendo', updated_at: "2026-09-20T15:00:00Z" },
    { id: "r2", periodo: "2026-09-01", profesor_id: "p-2", profesor: "Bruno Mena", alumno_id: "a-2", alumno: "Eva", explica: 5, aprende: 5, claridad: 5, creatividad: 4, resuelve: 5, contento: 5, seguir: "si", comentario: "", updated_at: "2026-09-21T15:00:00Z" },
  ];
  const { page, errores, ctx } = await abrir(browser, "/satisfaccion.html", { tablas: {}, rpc: { resumen_satisfaccion: RESUMEN }, respuestas: RESP }, ADMIN, "#filas tr");

  igual("una fila por profesor, en el orden de la base", await page.evaluate(() => [...document.querySelectorAll("#filas > tr > th")].map((t) => t.textContent)), [XSS, "Bruno Mena"]);
  igual("las notas con coma y el estado escrito", await page.evaluate(() => [...document.querySelectorAll("#filas > tr")].map((tr) => [...tr.children].slice(2, 11).map((c) => c.textContent))), [
    ["2,3", "3,0", "2,0", "3,3", "3,0", "2,7", "2,7", "1 · 1 · 1", "⚠️ A revisar"],
    ["4,5", "5,0", "4,5", "4,0", "5,0", "5,0", "4,7", "2 · 0 · 0", "👍 Excelente"],
  ]);
  igual("las cifras de arriba", await page.evaluate(() => [...document.querySelectorAll("#cifras > div")].map((d) => d.children[1].textContent)),
    ["5", "3,5 de 5", "3", "1", "1"]);
  const resumen = await llamadas(page, "resumen_satisfaccion");
  cierto("pide un periodo de meses enteros", resumen.length === 1 && /-01$/.test(resumen[0].args.p_desde) && /-01$/.test(resumen[0].args.p_hasta), JSON.stringify(resumen));
  igual("el enlace de la encuesta", await page.evaluate(() => document.querySelector("#enlace").textContent), BASE + "/encuesta-profesor.html");
  igual("quienes se van, con su comentario como texto", await page.evaluate(() => [...document.querySelectorAll("#sevan li")].map((l) => l.textContent)),
    ["Dani <b>Ruiz</b> sobre " + XSS + " · septiembre de 2026 · No, pienso dejarlasExplica: 1 (Casi nunca le entiendo) · Aprende: 2 (Poco) · Claridad: 1 (Muy confusas) · Creatividad: 3 (Más o menos) · Resuelve: 2 (Pocas veces) · Le gustan: 1 (No me gustan)«<script>window.__xss=2</script>No le entiendo»"]);
  const sevan = (await llamadas(page, "respuestas_satisfaccion"))[0];
  igual("la lista se pide de mil en mil", sevan.rango, [0, 999]);

  // El detalle de un profesor se abre y dice que está abierto.
  const boton = page.locator("#filas > tr").nth(1).locator("button");
  igual("cerrado de entrada", await boton.getAttribute("aria-expanded"), "false");
  await boton.click();
  await page.waitForSelector('#filas tr[data-detalle-de="p-2"] li');
  igual("abierto lo dice", await boton.getAttribute("aria-expanded"), "true");
  const det = (await llamadas(page, "respuestas_satisfaccion")).pop();
  igual("pide las de ESE profesor", det.args.p_profesor, "p-2");
  igual("y enseña solo las suyas", await page.evaluate(() => [...document.querySelectorAll('#filas tr[data-detalle-de="p-2"] li')].length), 1);
  await boton.click();
  igual("se vuelve a cerrar", await page.evaluate(() => !!document.querySelector('#filas tr[data-detalle-de="p-2"]')), false);

  igual("sin inyección", await page.evaluate(() => window.__xss || 0), 0);
  igual("sin errores en la página", errores, []);
  await ctx.close();

  console.log("\nQuién entra a los resultados");
  const s = await abrir(browser, "/satisfaccion.html", { tablas: {}, rpc: { resumen_satisfaccion: [] }, respuestas: [] }, SUP, "#app:not(.hidden)");
  igual("quien supervisa entra", await seVe(s.page, "#app"), "sí");
  igual("sin respuestas lo dice", await seVe(s.page, "#vacio"), "sí");
  await s.ctx.close();
  for (const [quien, yo] of [["un profesor", PROFE], ["una alumna", ALUMNA]]) {
    const x = await abrir(browser, "/satisfaccion.html", { tablas: {}, rpc: {} }, yo, "#denegado:not(.hidden)");
    igual(quien + " no entra", await seVe(x.page, "#app"), "no");
    igual(quien + " no pide el resumen", (await llamadas(x.page, "resumen_satisfaccion")).length, 0);
    await x.ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaResultados(browser);
  } catch (e) {
    console.log("  ✗ " + (e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
