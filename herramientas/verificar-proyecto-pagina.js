#!/usr/bin/env node
/* proyecto.html: el plan completo de un grupo de un proyecto, en el navegador.
 *
 * Con un Supabase de mentira (el que filtra de verdad) se comprueba:
 *  - el profesor con un solo grupo va directo a él; ve la próxima clase, cada
 *    clase con su momento divertido, «Ver el plan» y «Dar esta clase» con el
 *    plan de ESA sesión;
 *  - las tareas semanales dicen qué hacer con la misma frase que Tareas, y
 *    «Mandar a mis alumnos» llama a crear_tarea() con los renglones tal cual,
 *    a los alumnos marcados y con el vencimiento en hora de Costa Rica; los
 *    alumnos se piden de mil en mil;
 *  - quien administra ve todos los grupos y el plan, pero no «Dar esta clase»
 *    ni «Mandar» (no da clase); el alumno no ve nada;
 *  - lo que escribió una persona (la guía) va como texto, y lo que se ve se
 *    mide en pantalla.
 *
 * Con el sitio en localhost:8777 y playwright:
 *     node herramientas/verificar-proyecto-pagina.js
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE = { id: "u-profe", role: "profesor", is_admin: false, full_name: "Karina Rojas", email: "k@x.cr" };
const ADMIN = { id: "u-admin", role: "admin", is_admin: true, full_name: "Oscar", email: "o@x.cr" };
const ALUMNA = { id: "u-ana", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "a@x.cr" };
const ALUMNOS = [ALUMNA, { id: "u-beto", role: "alumno", is_admin: false, full_name: "Beto Mora", email: "b@x.cr" }];

const PROYECTO = { nombre: "Campeones Colegiales 2026", periodo: "Octubre a diciembre de 2026", descripcion: "Formar instructores." };
const GUIA = {
  intro: "Este plan cierra el curso <img src=x onerror=\"window.__xss=1\">.",
  objetivos: ["Dominar los finales esenciales.", "Dar una minilección evaluada."],
  evaluacion: [["Evaluación 4: finales esenciales", "6 de noviembre", "30 %"]],
  rubrica: [["Objetivo", "Claro", "Amplio", "Confuso", "No se entiende"]],
  portafolio: [["Plan de taller", "Con la plantilla del anexo A.", "25"]],
  partida: [["Lo que ya domina el grupo", "Dominación."]],
  unidades: [["Unidad A · Finales esenciales", "16 oct – 3 nov", "6 clases"]],
  estructura: [["0–10'", "Calentamiento", "Dos posiciones."]],
  reglas: ["Roles rotativos."],
  anexos: { A: ["Plantilla del plan de taller", [["Colegio o lugar", ""]]] },
};
const GRUPOS = [
  { id: "g-1", nombre: "Finales", nivel: "avanzado", horario: "Martes y viernes, por Zoom", orden: 0, guia: GUIA, profesor_id: "u-profe", proyectos: PROYECTO },
  { id: "g-2", nombre: "Aperturas", nivel: "inicial", horario: "Miércoles", orden: 1, guia: {}, profesor_id: null, proyectos: PROYECTO },
];
const SESIONES = [
  { id: "s-1", grupo_id: "g-1", numero: 1, fecha: "2020-01-07", titulo: "Arranque", tipo: "especial", plan_id: "plan-1",
    detalle: { objetivo: "Conocer el plan.", bloques: [["0–15'", "Presentar."]], divertido: "Reto relámpago con podio.", sitio: "La clase en vivo." } },
  { id: "s-2", grupo_id: "g-1", numero: 2, fecha: "2099-01-09", titulo: "Rey y peón", tipo: "clase", plan_id: "plan-2",
    detalle: { objetivo: "La oposición.", bloques: [["Contenido (35')", "Regla del cuadrado."]], divertido: "«🗳️ La clase juega» contra el motor.", taller: "Ficha 1.", sitio: "Finales prácticos." } },
  { id: "s-3", grupo_id: "g-1", numero: 3, fecha: "2099-01-13", titulo: "Evaluación 4", tipo: "evaluacion", plan_id: "plan-3",
    detalle: { objetivo: "Comprobar.", bloques: [], divertido: "Niebla de Guerra.", sitio: "Exámenes." } },
];
const ITEMS = [
  { material_tipo: "curso", material_slug: "finales-practicos", material_label: "Finales Prácticos", material_href: "cursos/academia/finales-practicos.html", filtro_clave: "", filtro_label: "", leccion: "1", actividades: [], meta_tipo: "completar", meta_cantidad: null },
  { material_tipo: "herramienta", material_slug: "batalla-naval", material_label: "Batalla naval", material_href: "batalla-naval.html", filtro_clave: "", filtro_label: "", leccion: "", actividades: ["batalla-naval"], meta_tipo: "cantidad", meta_cantidad: 2 },
];
const TAREAS = [
  { id: "t-1", grupo_id: "g-1", semana: 1, desde: "2020-01-06", vence: "2020-01-13", titulo: "Semana 1 · Rey y peón", instrucciones: "Repasa el cuadrado.", items: ITEMS },
  { id: "t-2", grupo_id: "g-1", semana: 2, desde: "2099-01-12", vence: "2099-01-19", titulo: "Semana 2 · Lucena", instrucciones: "", items: [ITEMS[1]] },
];

function clienteFalso(yo) {
  return `
window.__consultas = [];
(function () {
  const YO = ${JSON.stringify(yo)};
  // La RLS, de mentira pero de verdad: el profesor ve solo su grupo; quien administra, todos; el alumno, nada.
  const visibles = (g) => YO.is_admin || g.profesor_id === YO.id;
  const GRUPOS = ${JSON.stringify(GRUPOS)}.filter(visibles);
  const ids = GRUPOS.map((g) => g.id);
  const TABLAS = {
    profiles: ${JSON.stringify([PROFE, ADMIN].concat(ALUMNOS))},
    proyecto_grupos: GRUPOS,
    proyecto_sesiones: ${JSON.stringify(SESIONES)}.filter((s) => ids.includes(s.grupo_id)),
    proyecto_tareas: ${JSON.stringify(TAREAS)}.filter((t) => ids.includes(t.grupo_id)),
  };
  function constructor(tabla, filas) {
    const anotado = { tabla: tabla, eq: {}, range: null };
    window.__consultas.push(anotado);
    let f = (filas || []).slice(), unica = false;
    const b = {
      select() { return b; },
      eq(c, v) { anotado.eq[c] = v; f = f.filter((r) => String(r[c]) === String(v)); return b; },
      order(c) { f.sort((x, y) => (String(x[c]) < String(y[c]) ? -1 : 1)); return b; },
      range(a, z) { anotado.range = [a, z]; f = f.slice(a, z + 1); return b; },
      single() { unica = true; return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) { return Promise.resolve({ data: unica ? (f[0] || null) : f, error: null }).then(res, rej); },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: YO.id }, access_token: "t" } } }), signOut: () => Promise.resolve({}) },
    // profiles filtra de verdad por eq(): el perfil propio por id, los alumnos por role.
    from: (t) => constructor(t, TABLAS[t] || []),
    rpc: (n, args) => {
      if (n === "crear_tarea") { window.__tareas = (window.__tareas || []).concat([args]); return Promise.resolve({ data: args.p_alumnos.length, error: null }); }
      if (n === "mis_funciones_coordinacion") return Promise.resolve({ data: [], error: null });
      return constructor(n, []);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  };
})();
`;
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function abrir(browser, yo, ruta) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript(contestarAvisos);
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(yo) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  try { await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 }); }
  catch (e) {
    const estado = await page.evaluate(() => [location.href, document.getElementById("app") && document.getElementById("app").className,
      document.getElementById("loading") && document.getElementById("loading").textContent.trim(), JSON.stringify(window.__consultas || null)]).catch((x) => String(x));
    throw new Error("la página no terminó de cargar: " + errores.join(" | ") + " · " + JSON.stringify(estado));
  }
  return { page, ctx, errores };
}

const visible = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== El profesor del grupo ===");
    {
      const { page, ctx, errores } = await abrir(browser, PROFE, "/proyecto.html");
      await page.waitForFunction(() => document.getElementById("vista-grupo").checkVisibility(), null, { timeout: 10000 });
      igual("con un solo grupo va directo a él", await page.evaluate(() => location.search), "?grupo=g-1");
      igual("el título y el horario", [await page.textContent("#g-titulo"), await page.textContent("#g-horario"), await page.textContent("#g-proyecto")],
        ["Grupo «Finales»", "Nivel avanzado · Martes y viernes, por Zoom", "Campeones Colegiales 2026 · Octubre a diciembre de 2026"]);
      igual("la guía va como texto (el HTML no corre ni crea nodos)", [await page.textContent("#g-intro"), await page.evaluate(() => [!!window.__xss, document.querySelectorAll("#g-intro img").length])],
        [GUIA.intro, [false, 0]]);
      igual("la próxima clase es la primera que no ha pasado, en pantalla", [await visible(page, "#proxima"), await page.textContent("#proxima-titulo")], [true, "Clase 2 · Rey y peón"]);
      igual("con su momento divertido", await page.evaluate(() => document.getElementById("proxima").textContent.includes("Momento divertido: «🗳️ La clase juega» contra el motor.")), true);
      const clases = await page.evaluate(() => Array.from(document.querySelectorAll("#g-sesiones details")).map((d) => ({
        resumen: d.querySelector("summary").textContent, abierta: d.open,
        divertido: Array.from(d.querySelectorAll("p")).some((p) => /^🎉 Momento divertido: /.test(p.textContent)),
        enlaces: Array.from(d.querySelectorAll("a")).map((a) => [a.textContent.trim(), a.getAttribute("href")]) })));
      igual("las tres clases, con el tipo escrito y la próxima abierta", clases.map((c) => [c.resumen.includes("Evaluación") && /evaluacion|Evaluación 4/.test(c.resumen), c.abierta]),
        [[false, false], [false, true], [true, false]]);
      igual("cada una con su momento divertido", clases.map((c) => c.divertido), [true, true, true]);
      igual("y su plan: verlo y darlo en la clase en vivo", clases[1].enlaces, [["📋 Ver el plan", "planes.html?plan=plan-2"], ["▶️ Dar esta clase", "sesion.html?plan=plan-2"]]);
      igual("los emojis de los botones no se leen", await page.evaluate(() =>
        Array.from(document.querySelectorAll("#g-sesiones a > span:first-child")).every((s) => s.getAttribute("aria-hidden") === "true")), true);

      const tareas = await page.evaluate(() => Array.from(document.querySelectorAll("#g-tareas article")).map((a) => ({
        titulo: a.querySelector("h3").textContent, renglones: Array.from(a.querySelectorAll("li")).map((li) => li.textContent) })));
      igual("las tareas semanales, con lo que hay que hacer en palabras", tareas.map((t) => t.titulo), ["Semana 1 · Rey y peón", "Semana 2 · Lucena"]);
      igual("con la misma frase que Tareas (MaterialPlataforma.frase)", tareas[0].renglones,
        await page.evaluate((items) => items.map((r) => MaterialPlataforma.frase(r)), ITEMS));

      // Mandar la de la semana 2 (todavía no empieza: se programa).
      const boton = page.locator("#g-tareas article").nth(1).getByRole("button", { name: "Mandar a mis alumnos" });
      igual("el botón dice que abre algo y que está cerrado", await boton.getAttribute("aria-expanded"), "false");
      await boton.click();
      await page.waitForSelector("#m-alumnos input", { timeout: 5000 });
      igual("el formulario aparece debajo de esa tarea, en pantalla", [await visible(page, "#form-mandar"), await boton.getAttribute("aria-expanded"),
        await page.evaluate(() => document.querySelectorAll("#g-tareas article")[1].nextElementSibling.id)], [true, "true", "form-mandar"]);
      igual("con lo propuesto: el título, el lunes en la mañana y el lunes siguiente en la noche",
        [await page.inputValue("#m-titulo"), await page.inputValue("#m-desde"), await page.inputValue("#m-vence")],
        ["Semana 2 · Lucena", "2099-01-12T07:00", "2099-01-19T20:00"]);
      igual("los alumnos se piden de mil en mil", await page.evaluate(() =>
        window.__consultas.filter((c) => c.tabla === "profiles" && c.range).map((c) => [c.eq.role, c.range])), [["alumno", [0, 999]]]);
      igual("y salen sus alumnos", await page.evaluate(() => Array.from(document.querySelectorAll("#m-alumnos label")).map((l) => l.textContent)), ["Ana Rojas", "Beto Mora"]);
      await page.click("#m-enviar");
      igual("sin alumnos marcados no manda nada", [await page.textContent("#m-estado"), await page.evaluate(() => (window.__tareas || []).length)], ["Marca al menos un alumno.", 0]);
      await page.click("#m-todos");
      await page.click("#m-enviar");
      await page.waitForFunction(() => (window.__tareas || []).length === 1, null, { timeout: 5000 });
      const t = await page.evaluate(() => window.__tareas[0]);
      igual("crear_tarea con los alumnos marcados y los renglones tal cual", [t.p_alumnos, t.p_titulo, t.p_items], [["u-ana", "u-beto"], "Semana 2 · Lucena", [ITEMS[1]]]);
      igual("y las fechas en hora de Costa Rica (−6)", [t.p_disponible_desde, t.p_vence], ["2099-01-12T13:00:00.000Z", "2099-01-20T02:00:00.000Z"]);
      await page.waitForFunction(() => document.getElementById("form-mandar").hidden, null, { timeout: 5000 });
      igual("avisa a cuántos se mandó y cierra el formulario", await page.evaluate(() => (window.__avisos || []).some((a) => /quedó mandada a 2 alumnos/.test(a))), true);

      // La semana 1 ya empezó: se manda de una vez, sin «disponible desde».
      await page.locator("#g-tareas article").nth(0).getByRole("button", { name: "Mandar a mis alumnos" }).click();
      igual("una semana que ya empezó no se programa", await page.inputValue("#m-desde"), "");
      igual("la evaluación, la rúbrica y la guía, en tablas", await page.evaluate(() => [
        Array.from(document.querySelectorAll("#g-evaluacion h3")).map((h) => h.textContent),
        Array.from(document.querySelectorAll("#g-guia h3")).map((h) => h.textContent)]), [
        ["Qué se evalúa", "Las clases de evaluación", "Anexo B · Rúbrica de la minilección y la microenseñanza", "Portafolio del instructor"],
        ["Punto de partida del grupo", "Las unidades", "Cómo va cada clase de 90 minutos", "Acuerdos del grupo", "Anexo A · Plantilla del plan de taller"]]);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\n=== Quien administra ===");
    {
      const { page, ctx, errores } = await abrir(browser, ADMIN, "/proyecto.html");
      await page.waitForSelector("#lista-grupos a", { timeout: 10000 });
      igual("ve todos los grupos", await page.evaluate(() => Array.from(document.querySelectorAll("#lista-grupos a")).map((a) => [a.querySelector("h2").textContent, a.getAttribute("href")])),
        [["Finales", "proyecto.html?grupo=g-1"], ["Aperturas", "proyecto.html?grupo=g-2"]]);
      await page.goto(BASE + "/proyecto.html?grupo=g-1", { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.getElementById("vista-grupo").checkVisibility(), null, { timeout: 10000 });
      igual("ve el plan, pero no «Dar esta clase» ni «Mandar» (no da clase)", await page.evaluate(() => [
        document.querySelectorAll("a[href^='planes.html?plan=']").length > 0,
        document.querySelectorAll("a[href^='sesion.html']").length,
        Array.from(document.querySelectorAll("#g-tareas button")).length]), [true, 0, 0]);
      igual("y la ayuda le dice quién las manda", /Las manda el profesor del grupo/.test(await page.textContent("#tareas-ayuda")), true);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }

    console.log("\n=== El alumno ===");
    {
      const { page, ctx, errores } = await abrir(browser, ALUMNA, "/proyecto.html?grupo=g-1");
      igual("no ve nada del proyecto", [await visible(page, "#sin-permiso"), await visible(page, "#vista-grupo"),
        await page.evaluate(() => window.__consultas.some((c) => /^proyecto/.test(c.tabla)))], [true, false, false]);
      igual("sin errores en la página", errores, []);
      await ctx.close();
    }
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el profesor tiene su plan, sus clases y sus tareas listas para mandar.");
  process.exit(fallos ? 1 : 0);
})();
