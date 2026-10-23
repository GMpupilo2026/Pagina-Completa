#!/usr/bin/env node
/* La revisión de cada lunes de Ruta a la Beca (ruta-cumplimiento.html): una fila
   por estudiante con lo que la plataforma mide de la semana. En un navegador de
   verdad con un cliente de Supabase de mentira.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - la semana equivocada: la revisión del lunes es de la semana ANTERIOR, y un
 *    día de calendario leído en la hora del navegador cae un día antes;
 *  - el lunes mal calculado (un miércoles que se manda tal cual);
 *  - «cumple» dicho solo con un color: cada celda lo escribe;
 *  - el nombre de un estudiante pintado como HTML;
 *  - una fórmula en el Excel («=…» en un nombre);
 *  - un alumno que abre la página y ve la tabla (o la pide).
 *
 * Qué filas devuelve la base y qué cuenta cada columna se comprobó en SQL,
 * contra tiempo_por_seccion() y con la sesión de un profesor, de un alumno y de
 * administración: acá el cliente es de mentira.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-ruta-cumplimiento.js
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { instalarAvisos } = require("./lib/avisos-prueba.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE = { id: "p-1", role: "profesor", is_admin: false };
const ALUMNA = { id: "a-1", role: "alumno", is_admin: false };

const FILA = (o) => Object.assign({
  alumno_id: "a-1", nombre: "Ana Mora", semana: 3, fase: 1, minutos: "612.0", dias_activos: 5,
  tactica: 64, tactica_meta: 60, calculo: 31, calculo_meta: 30, finales: 95, partidas: 3,
  minutos_cursos: "40.0", clases: 1, justificada: false,
  cumple_horas: true, cumple_dias: true, cumple_metas: true, cumple_asistencia: true,
}, o);

function clienteFalso(filas, yo, error, yaTienen) {
  return `
window.__rpc = [];
(function () {
  const FILAS = ${JSON.stringify(filas)};
  const YO = ${JSON.stringify(yo)};
  const ERROR = ${JSON.stringify(error || null)};
  const YA = ${JSON.stringify(yaTienen || [])};
  const tabla = (nombre) => {
    const cond = [];
    const b = { select() { return b; }, eq(c, v) { cond.push([c, v]); return b; }, in(c, v) { cond.push([c, v]); return b; },
      maybeSingle() { return b; },
      then(res, rej) {
        window.__consultas = (window.__consultas || []).concat([{ tabla: nombre, cond }]);
        return Promise.resolve({ data: nombre === "tareas" ? YA : YO, error: null }).then(res, rej);
      } };
    return b;
  };
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: YO.id }, access_token: "t" } } }) },
    from: tabla,
    rpc(n, args) {
      window.__rpc.push({ n: n, args: args || null });
      if (n === "crear_tarea") return Promise.resolve({ data: args.p_alumnos.length, error: null });
      if (n === "ruta_cumplimiento") {
        return Promise.resolve(ERROR ? { data: null, error: { message: ERROR } } : { data: FILAS, error: null });
      }
      return Promise.resolve({ data: null, error: null });
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

async function abrir(browser, ruta, filas, yo, esperar, error, yaTienen) {
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await instalarAvisos(page);
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(filas, yo, error, yaTienen) }));
  await page.goto(BASE + "/ruta-cumplimiento.html" + ruta, { waitUntil: "networkidle" });
  await page.waitForSelector(esperar, { timeout: 15000 });
  return { page, errores, ctx };
}

const llamadas = (page) => page.evaluate(() => window.__rpc.filter((r) => r.n === "ruta_cumplimiento"));
const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? (el.checkVisibility() ? "sí" : "no") : "no existe";
}, sel);

/* El lunes de la semana pasada, en hora de Costa Rica, calculado aparte y a
   mano: si la página lo calcula distinto, uno de los dos está mal. */
function lunesPasadoCR() {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  const d = new Date(hoy + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);
  return d.toISOString().slice(0, 10);
}

async function pruebaProfesor(browser) {
  console.log("\nEl profesor revisa la semana");
  const XSS = '<img src=x onerror="window.__xss=1">Ana';
  const filas = [
    FILA({}),
    FILA({ alumno_id: "a-2", nombre: XSS, minutos: "176.0", dias_activos: 2, tactica: 86, calculo: 0, finales: 0, partidas: 0,
      clases: 0, justificada: true, cumple_horas: false, cumple_dias: false, cumple_metas: false, cumple_asistencia: true }),
    FILA({ alumno_id: "a-3", nombre: "=HIPERVINCULO(\"x\")", clases: 0, cumple_asistencia: false }),
  ];
  const { page, errores, ctx } = await abrir(browser, "", filas, PROFE, "#app:not(.hidden) #tabla-caja:not(.hidden)");

  igual("la tabla se ve", await seVe(page, "#tabla-caja"), "sí");
  igual("no es la pantalla de «no es para ti»", await seVe(page, "#no-acceso"), "no");
  const pedido = await llamadas(page);
  igual("pide la semana ANTERIOR, un lunes, con el grupo del programa",
    [pedido[0].args.p_lunes, pedido[0].args.p_grupo], [lunesPasadoCR(), "Ruta a la Beca"]);
  igual("no manda un inicio inventado", "p_inicio" in pedido[0].args, false);
  igual("el campo de la semana trae ese lunes", await page.inputValue("#semana"), lunesPasadoCR());
  igual("una fila por estudiante", await page.evaluate(() => document.querySelectorAll("#filas tr").length), 3);
  cierto("dice la semana y la fase", /^Semana 3 · Fase 1 · del lunes \d+ de \w+ al domingo \d+ de \w+ de \d{4}$/.test(await page.textContent("#estado")),
    await page.textContent("#estado"));
  igual("cuenta cuántos cumplen", await page.textContent("#resumen"), "3 estudiantes: 1 cumple lo que mide la plataforma y 2 no.");
  igual("el nombre es texto, no HTML", await page.evaluate(() => [document.querySelectorAll("#filas th")[1].textContent, !!document.querySelector("#filas img"), window.__xss === 1]),
    [XSS, false, false]);
  igual("cumplir se dice con palabras, celda por celda", await page.evaluate(() => {
    const t = document.querySelectorAll("#filas tr")[0];
    return [...t.querySelectorAll("td")].slice(0, 7).map((c) => c.querySelector("span.text-xs").textContent.split(" · ")[0]);
  }), ["✔ Cumple", "✔ Cumple", "✔ Cumple", "✔ Cumple", "✔ Cumple", "✔ Cumple", "✔ Cumple"]);
  igual("y el veredicto también", await page.evaluate(() => {
    const t = document.querySelectorAll("#filas tr")[0];
    return t.querySelectorAll("td")[7].firstChild.textContent;
  }), "✔ Cumple lo que se mide");
  igual("lo que falta se dice", await page.evaluate(() => {
    const t = document.querySelectorAll("#filas tr")[1];
    const ult = t.querySelectorAll("td")[t.querySelectorAll("td").length - 1];
    return [ult.firstChild.textContent, ult.lastChild.textContent];
  }), ["✘ No cumple", "Falta: horas, días, metas de ejercicios o partidas"]);
  igual("una ausencia justificada cuenta como Meet, y lo dice", await page.evaluate(() => {
    const t = document.querySelectorAll("#filas tr")[1];
    return t.querySelectorAll("td")[6].textContent;
  }), "0 clases✔ Cumple · ausencia justificada");
  igual("Finales se dice en minutos", await page.evaluate(() => {
    const t = document.querySelectorAll("#filas tr")[0];
    return t.querySelectorAll("td")[4].firstChild.textContent;
  }), "95 min de 90");
  igual("las horas, en horas y minutos", await page.evaluate(() => document.querySelectorAll("#filas tr")[0].querySelector("td").firstChild.textContent), "10 h 12 min");
  cierto("las notas de lo que se revisa a mano se ven", (await seVe(page, "#notas")) === "sí");

  // Anterior / siguiente.
  await page.click("#ant");
  await page.waitForFunction(() => window.__rpc.length >= 2);
  const lunes0 = new Date(lunesPasadoCR() + "T00:00:00Z"); lunes0.setUTCDate(lunes0.getUTCDate() - 7);
  igual("«Anterior» pide el lunes de siete días antes", (await llamadas(page))[1].args.p_lunes, lunes0.toISOString().slice(0, 10));
  await page.click("#sig");
  await page.waitForFunction(() => window.__rpc.length >= 3);
  igual("«Siguiente» vuelve", (await llamadas(page))[2].args.p_lunes, lunesPasadoCR());

  // Un miércoles se manda como el lunes de esa semana.
  await page.fill("#semana", "2027-03-17");
  await page.click("button[type=submit]");
  await page.waitForFunction(() => window.__rpc.length >= 4);
  igual("un miércoles se manda como su lunes", (await llamadas(page))[3].args.p_lunes, "2027-03-15");
  igual("y el campo se corrige", await page.inputValue("#semana"), "2027-03-15");

  // Excel: punto y coma, BOM y la fórmula con apóstrofo.
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#excel")]);
  const fs = require("fs");
  const csv = fs.readFileSync(await descarga.path(), "utf8");
  igual("el archivo lleva la semana en el nombre", descarga.suggestedFilename(), "ruta-a-la-beca-semana-2027-03-15.csv");
  cierto("lleva BOM y punto y coma", csv.charCodeAt(0) === 0xFEFF && csv.split("\r\n")[0].includes('"Estudiante";"Semana"'));
  cierto("la fórmula del nombre va como texto", csv.includes("\"'=HIPERVINCULO"), csv);
  igual("tres estudiantes más la cabecera", csv.split("\r\n").length, 4);
  igual("sin errores en la página", errores, []);
  await ctx.close();


  console.log("\nLa tarea de la semana");
  const filasT = [FILA({ alumno_id: "a-1" }), FILA({ alumno_id: "a-2", nombre: "Beto Díaz" }), FILA({ alumno_id: "a-3", nombre: "Carla Solís" })];
  const tt = await abrir(browser, "?inicio=" + lunesPasadoCR(), filasT, PROFE, "#tabla-caja:not(.hidden)", null, [{ alumno_id: "a-2" }]);
  await tt.page.click("#tarea");
  await tt.page.waitForFunction(() => /Tarea mandada/.test(document.getElementById("tarea-estado").textContent));
  const mandos = await tt.page.evaluate(() => window.__rpc.filter((r) => r.n === "crear_tarea"));
  igual("se manda una sola vez", mandos.length, 1);
  const m = mandos[0].args;
  igual("solo a quienes no la tenían", m.p_alumnos, ["a-1", "a-3"]);
  igual("el título lleva la semana", m.p_titulo, "Ruta a la Beca · Semana 3");
  cierto("vence el domingo a las 11:59 p. m. de Costa Rica", /^\d{4}-\d{2}-\d{2}T23:59:59-06:00$/.test(m.p_vence), m.p_vence);
  igual("cuatro renglones, todos de minutos", m.p_items.map((i) => [i.material_slug, i.meta_tipo, i.meta_cantidad]),
    [["temas", "minutos", 180], ["visualizacion", "minutos", 90], ["finales", "minutos", 90], ["aperturas", "minutos", 30]]);
  cierto("las instrucciones dicen las seis cosas y lo que revisa el profesor", ["Táctica", "Partidas", "Cálculo", "Finales", "Lección de la fase", "Repaso", "lo revisa tu profesor"].every((x) => m.p_instrucciones.includes(x)));
  igual("la confirmación dice a cuántos", await tt.page.evaluate(() => /Se la manda a 2 estudiantes/.test(window.__avisos[0]) && /Los otros 1 ya la tenían/.test(window.__avisos[0])), true);
  igual("sin errores en la página", tt.errores, []);
  await tt.ctx.close();

  const cc = await abrir(browser, "", filasT, PROFE, "#tabla-caja:not(.hidden)");
  await cc.page.evaluate(() => { window.__cancelarAvisos = true; });
  await cc.page.click("#tarea");
  await cc.page.waitForTimeout(600);
  igual("si cancela, no manda nada", await cc.page.evaluate(() => window.__rpc.filter((r) => r.n === "crear_tarea").length), 0);
  await cc.ctx.close();

  const ya = await abrir(browser, "", filasT, PROFE, "#tabla-caja:not(.hidden)", null, [{ alumno_id: "a-1" }, { alumno_id: "a-2" }, { alumno_id: "a-3" }]);
  await ya.page.click("#tarea");
  await ya.page.waitForFunction(() => /ya la tienen/.test(document.getElementById("tarea-estado").textContent));
  igual("si todos la tienen, no vuelve a mandarla", await ya.page.evaluate(() => window.__rpc.filter((r) => r.n === "crear_tarea").length), 0);
  await ya.ctx.close();

  console.log("\nCon el inicio de prueba y una semana pedida");
  const b = await abrir(browser, "?semana=2026-10-14&inicio=2026-09-14", [FILA({})], PROFE, "#tabla-caja:not(.hidden)");
  const p = (await llamadas(b.page))[0];
  igual("el lunes de la semana pedida y el inicio de prueba", [p.args.p_lunes, p.args.p_inicio], ["2026-10-12", "2026-09-14"]);
  await b.ctx.close();
  const mal = await abrir(browser, "?inicio=mañana", [FILA({})], PROFE, "#tabla-caja:not(.hidden)");
  igual("un inicio que no es una fecha se ignora", "p_inicio" in (await llamadas(mal.page))[0].args, false);
  await mal.ctx.close();

  console.log("\nSin filas (pausa, fuera de las 36 semanas o grupo vacío)");
  const v = await abrir(browser, "", [], PROFE, "#app:not(.hidden)");
  await v.page.waitForFunction(() => /No hay nada que mostrar/.test(document.getElementById("estado").textContent));
  igual("la tabla no se ve", await seVe(v.page, "#tabla-caja"), "no");
  cierto("dice por qué puede ser", /Semana Santa/.test(await v.page.textContent("#resumen")));
  igual("el Excel no se puede bajar", await v.page.evaluate(() => document.getElementById("excel").disabled), true);
  await v.ctx.close();

  console.log("\nSi la base responde con un error");
  const e = await abrir(browser, "", [], PROFE, "#app:not(.hidden)", "permission denied");
  await e.page.waitForFunction(() => /No se pudo calcular/.test(document.getElementById("estado").textContent));
  igual("lo dice", await e.page.textContent("#estado"), "No se pudo calcular: permission denied");
  await e.ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\nUna alumna abre la página");
  const { page, errores, ctx } = await abrir(browser, "", [FILA({})], ALUMNA, "#no-acceso:not(.hidden)");
  igual("ve que no es para ella", await seVe(page, "#no-acceso"), "sí");
  igual("no ve la tabla ni los controles", [await seVe(page, "#app"), await seVe(page, "#tabla-caja")], ["no", "no"]);
  igual("y no pidió nada a la base", (await llamadas(page)).length, 0);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumna(browser);
  } catch (e) {
    console.log("  ✗ " + (e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
