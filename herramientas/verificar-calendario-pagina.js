#!/usr/bin/env node
/* Comprueba «Mi calendario» (calendario.html y js/calendario-pagina.js) en un
 * navegador de verdad, con un Supabase de mentira y el reloj fijo en el
 * miércoles 14 de octubre de 2026 a las 3:00 p. m. de Costa Rica.
 *
 * La cuenta (qué día, qué plan) la prueba verificar-calendario-inteligente.js;
 * acá se mira la pantalla: que el alumno y el profe pidan SUS datos, que el mes
 * se recorra con el teclado, que los filtros escondan de verdad
 * (checkVisibility), que lo que escribe una persona no se lea como HTML, que el
 * celular no se desborde, que el estado vaya escrito y con contraste, y que el
 * .ics baje con lo que se ve. Ver «Mi calendario: clases, tareas y exámenes,
 * con un plan» en docs/decisiones/paneles.md.
 *
 *   python3 -m http.server 8777    (desde la raíz del sitio)
 *   node herramientas/verificar-calendario-pagina.js
 */
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const AHORA = new Date("2026-10-14T15:00:00-06:00");

let fallos = 0;
const espacios = (t) => t.replace(/[  ]/g, " ");
function igual(n, hallado, esperado) {
  const a = espacios(JSON.stringify(hallado)), b = JSON.stringify(esperado);
  if (a !== b) { console.log(`  ✗ ${n}\n      esperaba: ${b}\n      salió:    ${a}`); fallos++; }
  else console.log(`  ✓ ${n}`);
}

const DATOS = {
  perfiles: [
    { id: "u-ana", full_name: "Ana Rojas", role: "alumno", is_admin: false },
    { id: "u-profe", full_name: "Karina Rojas", role: "profesor", is_admin: false },
  ],
  mis_clases_proximas: [
    { horario_id: "h1", inicio: "2026-10-15T16:00:00-06:00", fin: "2026-10-15T17:00:00-06:00", titulo: "7B", modalidad: "en_linea", profesor: "Karina Rojas" },
    { horario_id: "h1", inicio: "2026-10-22T16:00:00-06:00", fin: "2026-10-22T17:00:00-06:00", titulo: "7B", modalidad: "en_linea", profesor: "Karina Rojas" },
  ],
  tareas: [
    { id: "t1", alumno_id: "u-ana", alumno_nombre: "Ana Rojas", profesor_id: "u-profe", titulo: "Mates", vence_at: "2026-10-17T23:00:00-06:00", renglones: 5, cumplidos: 1, situacion: "pendiente" },
    { id: "t2", alumno_id: "u-ana", alumno_nombre: "Ana Rojas", profesor_id: "u-profe", titulo: "<img src=x onerror=window.__pwned=1>", vence_at: "2026-10-17T20:00:00-06:00", renglones: 1, cumplidos: 0, situacion: "pendiente" },
    { id: "t3", alumno_id: "u-ana", alumno_nombre: "Ana Rojas", profesor_id: "u-profe", titulo: "Vieja", vence_at: "2026-10-01T20:00:00-06:00", renglones: 1, cumplidos: 0, situacion: "vencida" },
    { id: "t4", alumno_id: "u-ana", alumno_nombre: "Ana Rojas", profesor_id: "u-profe", titulo: "Hoy", vence_at: "2026-10-14T21:00:00-06:00", renglones: 2, cumplidos: 1, situacion: "pendiente" },
    { id: "t5", alumno_id: "u-beto", alumno_nombre: "Beto Mora", profesor_id: "u-profe", titulo: "Hoy", vence_at: "2026-10-14T21:00:00-06:00", renglones: 2, cumplidos: 0, situacion: "pendiente" },
  ],
  examenes: [
    { id: "e1", alumno_id: "u-ana", alumno_nombre: "Ana Rojas", profesor_id: "u-profe", titulo: "Final", vence_at: "2026-10-20T20:00:00-06:00", estado: "asignado", minutos: 30 },
  ],
  horario: [
    { id: "h1", profesor_id: "u-profe", dia_semana: 4, hora: "16:00:00", duracion_min: 60, grupo: "7B", subgrupo_id: null, titulo: null, modalidad: "presencial", desde: null, hasta: null },
    { id: "h9", profesor_id: "u-otra", dia_semana: 2, hora: "10:00:00", duracion_min: 60, grupo: "X", titulo: "De otra profe", modalidad: "presencial" },
  ],
};

function clienteFalso(yo) {
  return `
(function () {
  window.__consultas = [];
  const D = ${JSON.stringify(DATOS)};
  function respuesta(nombre, args, filtros) {
    // Filtra de verdad, como la base: cada quien recibe lo suyo.
    if (nombre === "profiles") return D.perfiles.filter((p) => filtros.every(([c, v]) => String(p[c]) === String(v)));
    if (nombre === "horario_clases") return D.horario.filter((h) => filtros.every(([c, v]) => String(h[c]) === String(v)));
    if (nombre === "mis_clases_proximas") return ${JSON.stringify(yo)} === "u-ana" ? D.mis_clases_proximas : [];
    if (nombre === "tareas_con_avance") return D.tareas.filter((t) => (!args.p_alumno || t.alumno_id === args.p_alumno) && (!args.p_profesor || t.profesor_id === args.p_profesor));
    if (nombre === "examenes_con_nota") return D.examenes.filter((t) => (!args.p_alumno || t.alumno_id === args.p_alumno) && (!args.p_profesor || t.profesor_id === args.p_profesor));
    if (nombre === "mis_subgrupos") return [];
    return [];
  }
  function consulta(nombre, args) {
    const filtros = []; let unica = false;
    const q = {
      select() { return q; }, eq(c, v) { filtros.push([c, v]); return q; },
      order() { return q; }, limit() { return q; }, range() { return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) {
        window.__consultas.push({ nombre, args: args || null, filtros: filtros.slice() });
        const f = respuesta(nombre, args || {}, filtros);
        return Promise.resolve({ data: unica ? (f[0] || null) : f, error: null }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(yo)} }, access_token: "t" } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t) => consulta(t),
    rpc: (n, a) => consulta(n, a),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, yo, opciones = {}) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block", acceptDownloads: true }, opciones.contexto || {}));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(yo) }));
  if (opciones.oscuro) await ctx.addInitScript(() => { try { localStorage.setItem("theme", "dark"); } catch (e) {} });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(AHORA);
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await page.goto(BASE + "/calendario.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#cal-contenido:not([hidden])", { timeout: 15000 }).catch(() => {});
  return { page, ctx, errores };
}

// Como se ve: innerText respeta los renglones y lo escondido.
const textos = (page, sel) => page.$$eval(sel, (ns) => ns.map((n) => n.innerText.replace(/\s+/g, " ").trim()));
const seVe = (page, sel) => page.$eval(sel, (n) => n.checkVisibility());

// Contraste WCAG del texto de un elemento contra su propio fondo.
const CONTRASTE = (n) => {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const s = getComputedStyle(n);
  const a = lum(rgb(s.color)), b = lum(rgb(s.backgroundColor));
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10;
};

async function pruebaAlumna(browser) {
  console.log("\n=== El calendario de la alumna ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana");
  const pedidas = await page.evaluate(() => window.__consultas.filter((c) => c.args).map((c) => [c.nombre, c.args]));
  igual("pide sus clases (90 días), sus tareas pendientes y sus exámenes, con SU id", pedidas, [
    ["mis_clases_proximas", { p_dias: 90 }],
    ["tareas_con_avance", { p_alumno: "u-ana", p_pendientes: true, p_limite: 200 }],
    ["examenes_con_nota", { p_alumno: "u-ana", p_limite: 100 }],
  ]);
  igual("lo que conviene saber, con lo urgente escrito", await textos(page, "#cal-avisos > li"), [
    "Urgente: Hoy vence la tarea «Hoy», a las 9:00 p. m.",
    "Ojo: El sábado 17 de octubre vencen 2 entregas juntas: el plan reparte el trabajo en los días de antes.",
    "Ojo: Tienes 1 tarea vencida sin terminar: todavía puedes hacerla en «Mis tareas».",
    "Tu próxima clase es mañana a las 4:00 p. m.",
  ]);
  igual("el plan, por día", await textos(page, "#cal-plan > li > h3"), ["Hoy", "Mañana", "Viernes 16 de octubre", "Domingo 18 de octubre"]);
  igual("el título que escribió el profe se lee como texto, no como HTML",
    [await page.evaluate(() => window.__pwned || null), (await textos(page, "#cal-plan a")).some((t) => t.includes("«<img src=x onerror=window.__pwned=1>»"))], [null, true]);

  igual("el mes, con su nombre", await page.textContent("#cal-mes-titulo"), "Octubre de 2026");
  const hoy = await page.$eval('button[aria-current="date"]', (b) => [b.dataset.dia, b.getAttribute("aria-label"), b.tabIndex]);
  igual("hoy está marcado, dice lo que tiene y es la parada de tabulador", hoy, ["2026-10-14", "Miércoles 14 de octubre (hoy): 1 tarea, 1 sugerencia", 0]);
  igual("un solo día del mes se alcanza con Tab", await page.$$eval("#cal-vista-mes button[data-dia]", (bs) => bs.filter((b) => b.tabIndex === 0).length), 1);
  igual("el día elegido dice lo suyo", [await page.textContent("#cal-dia-titulo"), (await textos(page, "#cal-dia-lista > li")).length], ["Miércoles 14 de octubre (hoy)", 2]);

  // El teclado: tres a la derecha es el sábado 17, con las dos entregas.
  await page.focus('button[data-dia="2026-10-14"]');
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  igual("las flechas mueven el día y el foco", await page.evaluate(() => document.activeElement.dataset.dia), "2026-10-17");
  igual("y el día elegido cambia", await textos(page, "#cal-dia-lista > li a"), ["Tarea: <img src=x onerror=window.__pwned=1>", "Tarea: Mates"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  igual("dos semanas abajo", await page.evaluate(() => document.activeElement.dataset.dia), "2026-10-31");
  await page.keyboard.press("ArrowDown");
  igual("pasar el fin de mes cambia de mes", [await page.evaluate(() => document.activeElement.dataset.dia), await page.textContent("#cal-mes-titulo")], ["2026-11-07", "Noviembre de 2026"]);
  await page.click("#cal-hoy");
  igual("«Hoy» vuelve a hoy", await page.evaluate(() => document.activeElement.dataset.dia), "2026-10-14");

  // Los filtros esconden de verdad.
  await page.click('button[data-dia="2026-10-17"]');
  await page.uncheck("#cal-filtro-tarea");
  igual("sin tareas, el sábado no tiene nada", await textos(page, "#cal-dia-lista > li"), ["Día libre: no hay clase ni entregas."]);
  await page.check("#cal-filtro-tarea");

  // Los límites del mes: uno atrás, hasta donde llegan las clases adelante.
  await page.click("#cal-anterior");
  igual("se puede ver el mes anterior", [await page.textContent("#cal-mes-titulo"), await page.isDisabled("#cal-anterior")], ["Septiembre de 2026", true]);
  for (let i = 0; i < 5; i++) if (!(await page.isDisabled("#cal-siguiente"))) await page.click("#cal-siguiente");
  igual("y adelante, hasta el mes en que terminan los 90 días", [await page.textContent("#cal-mes-titulo"), await page.isDisabled("#cal-siguiente")], ["Enero de 2027", true]);
  igual("dice hasta cuándo se ven las clases", await page.textContent("#cal-horizonte"), "Las clases se ven hasta el lunes 11 de enero; las tareas y los exámenes, con su fecha.");

  // La agenda.
  await page.click("#cal-ver-agenda");
  igual("la agenda se ve y el mes no", [await seVe(page, "#cal-vista-agenda"), await seVe(page, "#cal-vista-mes"), await seVe(page, "#cal-dia")], [true, false, false]);
  igual("y cuál está puesta lo dice el botón", [await page.getAttribute("#cal-ver-agenda", "aria-pressed"), await page.getAttribute("#cal-ver-mes", "aria-pressed")], ["true", "false"]);
  igual("la agenda va de hoy en adelante, solo los días con algo", await textos(page, "#cal-vista-agenda h3"), [
    "Miércoles 14 de octubre (hoy)", "Jueves 15 de octubre (mañana)", "Viernes 16 de octubre", "Sábado 17 de octubre", "Domingo 18 de octubre", "Martes 20 de octubre", "Jueves 22 de octubre",
  ]);
  await page.uncheck("#cal-filtro-plan");
  igual("sin el plan, el domingo sale (solo tenía la sugerencia)", (await textos(page, "#cal-vista-agenda h3")).includes("Domingo 18 de octubre"), false);
  await page.check("#cal-filtro-plan");
  await page.click("#cal-ver-mes");
  await page.click("#cal-hoy");

  // El estado va escrito y se lee: contraste contra su propio fondo.
  await page.click('button[data-dia="2026-10-14"]');
  const vence = await page.$eval("#cal-dia-lista span.rounded-full", CONTRASTE);
  igual("«Vence hoy» se lee (4,5:1 o más)", vence >= 4.5, true);

  // El .ics: lo mismo que se ve, en un archivo.
  const [bajada] = await Promise.all([page.waitForEvent("download"), page.click("#cal-bajar")]);
  const fs = require("fs");
  const texto = fs.readFileSync(await bajada.path(), "utf8");
  igual("baja «ajedrez-integral.ics» con las 2 clases, las 3 tareas por delante y el examen",
    [bajada.suggestedFilename(), (texto.match(/BEGIN:VEVENT/g) || []).length], ["ajedrez-integral.ics", 6]);
  igual("y lo dice", /^Listo: se bajó «ajedrez-integral.ics» con 6 fechas/.test(await page.textContent("#cal-bajar-estado")), true);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaCelular(browser) {
  console.log("\n=== En el celular, y en modo oscuro ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", { oscuro: true, contexto: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } });
  igual("no se desborda a lo ancho", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  igual("en cada día, los dibujitos y no los renglones", await page.$eval('button[data-dia="2026-10-17"]', (b) => [b.querySelector("span.md\\:hidden").checkVisibility(), b.querySelector("span.hidden").checkVisibility(), b.querySelector("span.md\\:hidden").textContent]), [true, false, "📋2"]);
  await page.click('button[data-dia="2026-10-14"]');
  const vence = await page.$eval("#cal-dia-lista span.rounded-full", CONTRASTE);
  igual("«Vence hoy» se lee también en oscuro", vence >= 4.5, true);
  const aviso = await page.$eval('#cal-avisos > li[data-nivel="alto"]', CONTRASTE);
  igual("y el aviso urgente", aviso >= 4.5, true);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaProfe(browser) {
  console.log("\n=== El calendario de quien da clase ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe");
  const pedidas = await page.evaluate(() => window.__consultas.map((c) => [c.nombre, c.args, c.filtros]));
  igual("lee SU horario y pide las entregas de SUS alumnos", pedidas.filter(([n]) => ["horario_clases", "tareas_con_avance", "examenes_con_nota", "mis_clases_proximas"].includes(n)), [
    ["horario_clases", null, [["profesor_id", "u-profe"]]],
    ["tareas_con_avance", { p_profesor: "u-profe", p_pendientes: true, p_limite: 1000 }, []],
    ["examenes_con_nota", { p_profesor: "u-profe", p_limite: 300 }, []],
  ]);
  igual("dice para qué es", (await page.textContent("#cal-intro")).startsWith("Tus clases del horario y las entregas de tus alumnos"), true);
  igual("el plan es «Para tus clases»", await page.textContent("#cal-plan-titulo"), "🧭 Para tus clases");
  await page.click('button[data-dia="2026-10-14"]');
  igual("la tarea mandada a dos alumnos es una sola cosa", await textos(page, "#cal-dia-lista > li"), ["📋 Tarea: Hoy Vence hoy Vence a las 9:00 p. m. · 2 alumnos sin terminar"]);
  igual("lo urgente del día, con cuántos faltan", (await textos(page, "#cal-avisos > li"))[0], "Urgente: Hoy vence «Hoy»: 2 alumnos todavía no terminan.");
  await page.click('button[data-dia="2026-10-15"]');
  igual("la clase del horario: qué revisar en ella y qué recordar antes de que venza", await textos(page, "#cal-dia-lista > li"), [
    "🧭 Sugerido · Revisa la tarea «Hoy» en tu clase de las 4:00 p. m. Es la primera clase después de que vence; lo que costó se repasa fresco.",
    "🧭 Sugerido · Recuérdales la tarea «<img src=x onerror=window.__pwned=1>» en tu clase de las 4:00 p. m. 1 alumno no la ha terminado y vence el sábado 17 de octubre.",
    "🧭 Sugerido · Recuérdales la tarea «Mates» en tu clase de las 4:00 p. m. 1 alumno no la ha terminado y vence el sábado 17 de octubre.",
    "🧭 Sugerido · Recuérdales el examen «Final» en tu clase de las 4:00 p. m. 1 alumno no lo ha terminado y vence el martes 20 de octubre.",
    "🎓 Clase: Grupo 7B 4:00 p. m. a 5:00 p. m. · Presencial",
  ]);
  igual("la clase de otra profe no aparece", (await page.textContent("#cal-vista-mes")).includes("De otra profe"), false);
  const [bajada] = await Promise.all([page.waitForEvent("download"), page.click("#cal-bajar")]);
  const texto = require("fs").readFileSync(await bajada.path(), "utf8");
  igual("su .ics lleva solo las clases que vienen (no las entregas de cada alumno)", [(texto.match(/BEGIN:VEVENT/g) || []).length, /tarea/i.test(texto)], [13, false]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: require("fs").existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaAlumna(browser);
    await pruebaCelular(browser);
    await pruebaProfe(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
