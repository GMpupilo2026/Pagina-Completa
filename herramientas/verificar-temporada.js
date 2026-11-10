#!/usr/bin/env node
/* Comprueba el plan de temporada: js/temporada.js (la cuenta, sin navegador) y
 * temporada.html con js/temporada-pagina.js (la pantalla, con un Supabase de
 * mentira y el reloj fijo en el martes 10 de noviembre de 2026).
 *
 * Lo que se rompe callado acá: una etapa propuesta que se sale de la
 * competencia o deja días sin cubrir, unos porcentajes que no suman 100 y se
 * guardan igual, «en línea» dicho de un alumno que no hizo nada (tres
 * ejercicios no son un reparto), el tiempo pedido con el día cortado a las 6
 * de la tarde (sin la hora de Costa Rica), o el nombre de un alumno leído como
 * HTML. Ver «El plan de temporada» en docs/decisiones/seguimiento-del-alumno.md.
 *
 *   python3 -m http.server 8777    (desde la raíz del sitio)
 *   node herramientas/verificar-temporada.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { chromium } = require("./lib/playwright-con-sesion");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
const AHORA = new Date("2026-11-10T15:00:00-06:00");

let fallos = 0;
function igual(n, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log(`  ✗ ${n}\n      esperaba: ${b}\n      salió:    ${a}`); fallos++; }
  else console.log(`  ✓ ${n}`);
}

// ---------------- La cuenta, sin navegador ----------------
const ctx = { window: {}, document: {} };
vm.createContext(ctx);
["js/direcciones-entrenamiento.js", "js/temporada.js"].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), "utf8"), ctx, { filename: f }));
const T = ctx.window.Temporada, D = ctx.window.DireccionesEntrenamiento;
const plano = (x) => JSON.parse(JSON.stringify(x));
const CLAVES = D.DIRECCIONES.map((d) => d.clave);
const NOMBRES = {}; D.DIRECCIONES.forEach((d) => { NOMBRES[d.clave] = d.nombre; });

console.log("-- Proponer etapas");
const p = plano(T.proponer("2026-11-10", "2027-01-10"));
igual("cuatro etapas, de lo general a la competencia", p.map((e) => [e.nombre, e.desde, e.hasta]), [
  ["Preparación general", "2026-11-10", "2026-12-04"],
  ["Preparación específica", "2026-12-05", "2026-12-23"],
  ["Precompetitiva", "2026-12-24", "2027-01-03"],
  ["Competitiva", "2027-01-04", "2027-01-10"],
]);
igual("la propuesta pasa su propia revisión (fechas seguidas, cada etapa suma 100)", plano(T.problemas(p, "2027-01-10", CLAVES)), []);
// Al azar: ninguna propuesta deja un hueco, se encima o se sale de la competencia.
let malas = 0;
for (let i = 0; i < 300; i++) {
  const ini = T.diaDeNumero(T.numeroDeDia("2026-01-01") + Math.floor(Math.random() * 400));
  const fin = T.diaDeNumero(T.numeroDeDia(ini) + 13 + Math.floor(Math.random() * 300));
  const e = T.proponer(ini, fin);
  const seguidas = e.every((x, j) => j === 0 ? x.desde === ini : T.numeroDeDia(x.desde) === T.numeroDeDia(e[j - 1].hasta) + 1);
  if (!e.length || !seguidas || e[e.length - 1].hasta !== fin || T.problemas(e, fin, CLAVES).length
      || e.some((x) => T.numeroDeDia(x.hasta) < T.numeroDeDia(x.desde))) malas++;
}
igual("300 temporadas al azar (14 a 313 días): cubren todo, sin huecos ni días encimados", malas, 0);
igual("con menos de cuatro semanas: específica y competitiva", plano(T.proponer("2026-11-10", "2026-11-30")).map((e) => e.nombre),
  ["Preparación específica", "Competitiva"]);
igual("con menos de 14 días no propone nada", plano(T.proponer("2026-11-10", "2026-11-20")), []);
igual("un día que no existe no es un día", isNaN(T.numeroDeDia("2026-02-31")), true);

console.log("-- Revisar antes de guardar");
const etapa = (o) => Object.assign({ nombre: "Uno", desde: "2026-11-10", hasta: "2026-11-20", enfasis: { "ejercicios": 100 } }, o);
igual("porcentajes que no suman 100", plano(T.problemas([etapa({ enfasis: { "ejercicios": 60, "finales": 35 } })], "2026-12-01", CLAVES)),
  ["La etapa 1 («Uno»): los porcentajes suman 95 y tienen que sumar 100."]);
igual("una etapa que se encima con la anterior",
  plano(T.problemas([etapa(), etapa({ nombre: "Dos", desde: "2026-11-20", hasta: "2026-11-25" })], "2026-12-01", CLAVES)),
  ["La etapa 2 («Dos») empieza antes de que termine la anterior."]);
igual("una dirección que no existe", plano(T.problemas([etapa({ enfasis: { "magia": 100 } })], "2026-12-01", CLAVES)),
  ["La etapa 1 («Uno») tiene una dirección que no existe: magia."]);
igual("la última etapa después de la competencia", plano(T.problemas([etapa()], "2026-11-15", CLAVES)),
  ["La última etapa termina después de la competencia."]);

console.log("-- En qué etapa va, y cómo va");
const s = plano(T.situacion(p, "2027-01-10", "2026-12-10"));
igual("el 10 de diciembre va en la específica, con 13 días por delante y 31 para la competencia",
  [s.estado, s.etapa.nombre, s.quedanEnEtapa, s.faltanCompetencia], ["en-curso", "Preparación específica", 13, 31]);
igual("antes de empezar", plano(T.situacion(p, "2027-01-10", "2026-11-01")).estado, "por-empezar");
igual("después de la competencia", plano(T.situacion(p, "2027-01-10", "2027-01-12")).estado, "terminada");
const rep = D.reparto([{ seccion: "temas", minutos: 60 }, { seccion: "aperturas", minutos: 30 }, { seccion: "finales", minutos: 10 }]);
const c = plano(T.comparar(p[1].enfasis, rep, NOMBRES));
igual("planeado contra hecho, con el veredicto en palabras", c.filas.map((f) => [f.clave, f.objetivo, f.hecho, f.veredicto]), [
  ["aperturas", 25, 30, "en línea"], ["medio-juego", 15, 0, "por debajo"], ["finales", 15, 10, "en línea"],
  ["ejercicios", 25, 60, "por encima"], ["analisis", 10, 0, "en línea"], ["partidas", 10, 0, "en línea"],
]);
const poco = plano(T.comparar(p[1].enfasis, D.reparto([{ seccion: "temas", minutos: 20 }]), NOMBRES));
igual("con menos de una hora no se juzga (ni «en línea» ni «por debajo»)", [poco.juzgar, poco.filas.every((f) => f.veredicto === "")], [false, true]);
const fuera = plano(T.comparar({ "aperturas": 100 }, D.reparto([{ seccion: "aperturas", minutos: 40 }, { seccion: "coordenadas", minutos: 40 }]), NOMBRES));
igual("lo que hizo sin estar en el plan también sale", fuera.filas.map((f) => [f.clave, f.objetivo, f.hecho, f.veredicto]),
  [["aperturas", 100, 50, "por debajo"], ["vision", 0, 50, "por encima"]]);

// ---------------- La pantalla ----------------
const ETAPAS = [
  { nombre: "Preparación general", desde: "2026-10-01", hasta: "2026-11-05", enfasis: { "ejercicios": 40, "finales": 30, "medio-juego": 30 } },
  { nombre: "Preparación específica", desde: "2026-11-06", hasta: "2026-12-13", enfasis: { "aperturas": 25, "ejercicios": 25, "finales": 15, "medio-juego": 15, "analisis": 10, "partidas": 10 }, nota: "El repertorio que se va a jugar." },
  { nombre: "Competitiva", desde: "2026-12-14", hasta: "2026-12-20", enfasis: { "aperturas": 50, "partidas": 50 } },
];
const DATOS = {
  perfiles: [
    { id: "u-profe", full_name: "Karina Rojas", role: "profesor", is_admin: false },
    { id: "u-ana", full_name: "Ana Rojas", role: "alumno", is_admin: false },
    { id: "u-beto", full_name: "<img src=x onerror=window.__pwned=1>", role: "alumno", is_admin: false },
    { id: "u-ceci", full_name: "Ceci Mora", role: "alumno", is_admin: false },
  ],
  temporadas: [
    { id: "t1", lote: "L1", profesor_id: "u-profe", alumno_id: "u-ana", titulo: "Camino al Nacional", competencia: "Nacional Juvenil", inicio: "2026-10-01", fecha_competencia: "2026-12-20", etapas: ETAPAS, nota: null },
    { id: "t2", lote: "L1", profesor_id: "u-profe", alumno_id: "u-beto", titulo: "Camino al Nacional", competencia: "Nacional Juvenil", inicio: "2026-10-01", fecha_competencia: "2026-12-20", etapas: ETAPAS, nota: null },
  ],
  tiempo: {
    "u-ana": [{ seccion: "temas", minutos: 60, ejercicios: 30 }, { seccion: "aperturas", minutos: 30, ejercicios: 4 }, { seccion: "finales", minutos: 10, ejercicios: 2 }, { seccion: "clase", minutos: 90, ejercicios: 0 }],
    "u-beto": [{ seccion: "temas", minutos: 20, ejercicios: 8 }],
  },
};

function clienteFalso(yo) {
  return `
(function () {
  window.__consultas = []; window.__escrituras = [];
  const D = ${JSON.stringify(DATOS)};
  const cumple = (fila, filtros) => filtros.every(([c, v, op]) => op === "in" ? v.map(String).includes(String(fila[c])) : String(fila[c]) === String(v));
  // La RLS de temporadas, en chico: el profe ve las suyas, el alumno la suya.
  const visibles = () => D.temporadas.filter((t) => t.profesor_id === ${JSON.stringify(yo)} || t.alumno_id === ${JSON.stringify(yo)});
  function respuesta(nombre, args, filtros) {
    if (nombre === "profiles") {
      // Un profe solo ve a sus alumnos; un alumno, a sí mismo.
      const vis = ${JSON.stringify(yo)} === "u-profe" ? D.perfiles : D.perfiles.filter((p) => p.id === ${JSON.stringify(yo)});
      return vis.filter((p) => cumple(p, filtros));
    }
    if (nombre === "temporadas") return visibles().filter((t) => cumple(t, filtros));
    if (nombre === "tiempo_por_seccion") return D.tiempo[args.p_alumno] || [];
    if (nombre === "profesores_que_estudian_conmigo") return [];
    return [];
  }
  function consulta(nombre, args) {
    const filtros = []; let unica = false; let accion = "select", cuerpo = null;
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; },
      eq(c, v) { filtros.push([c, v]); return q; }, in(c, v) { filtros.push([c, v, "in"]); return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      insert(f) { accion = "insert"; cuerpo = f; return q; }, update(f) { accion = "update"; cuerpo = f; return q; },
      delete() { accion = "delete"; return q; },
      then(res, rej) {
        window.__consultas.push({ nombre, args: args || null, filtros: filtros.slice(), accion });
        if (accion !== "select") {
          window.__escrituras.push({ nombre, accion, cuerpo: JSON.parse(JSON.stringify(cuerpo)), filtros: filtros.slice() });
          // Se aplica de verdad (en el resolver, con los filtros puestos).
          if (accion === "insert") (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).forEach((f, i) => D.temporadas.push(Object.assign({ id: "n" + D.temporadas.length + i }, f)));
          if (accion === "update") visibles().filter((t) => cumple(t, filtros)).forEach((t) => Object.assign(t, cuerpo));
          if (accion === "delete") D.temporadas = D.temporadas.filter((t) => !(visibles().includes(t) && cumple(t, filtros)));
          return Promise.resolve({ data: null, error: null }).then(res, rej);
        }
        const f = respuesta(nombre, args || {}, filtros);
        return Promise.resolve({ data: unica ? (f[0] || null) : f, error: null }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(yo)} }, access_token: "t" } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t) => consulta(t), rpc: (n, a) => consulta(n, a),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, yo, opciones = {}) {
  const c = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones.contexto || {}));
  await c.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await c.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(yo) }));
  const page = await c.newPage();
  await page.clock.setFixedTime(AHORA);
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await page.goto(BASE + "/temporada.html", { waitUntil: "networkidle" });
  return { page, ctx: c, errores };
}
const textos = (page, sel) => page.$$eval(sel, (ns) => ns.map((n) => n.innerText.replace(/\s+/g, " ").trim()));
const seVe = (page, sel) => page.$eval(sel, (n) => n.checkVisibility()).catch(() => false);

async function pruebaProfe(browser) {
  console.log("\n=== Quien da clase ===");
  const { page, ctx: c, errores } = await abrir(browser, "u-profe");
  await page.waitForSelector("#tp-lista li");
  igual("pide SUS temporadas (profesor_id)", await page.evaluate(() =>
    window.__consultas.filter((q) => q.nombre === "temporadas").map((q) => q.filtros)), [[["profesor_id", "u-profe"]]]);
  igual("una temporada para dos alumnos es UNA en la lista, con dónde va", await textos(page, "#tp-lista li"), [
    "Camino al Nacional Abrir Nacional Juvenil · 20 de diciembre de 2026 · 2 alumnos: Ana Rojas, <img src=x onerror=window.__pwned=1> "
    + "Faltan 40 días para «Nacional Juvenil». Etapa en curso: Preparación específica (le quedan 34 días)."]);
  igual("el nombre que escribió un alumno se lee como texto", await page.evaluate(() => window.__pwned || null), null);

  console.log("-- Cómo va cada alumno");
  await page.click("#tp-lista li button");
  await page.waitForSelector(".tp-alumno-como-va table");
  igual("pide el tiempo de la etapa, de su primer día a hoy, en hora de Costa Rica", await page.evaluate(() =>
    window.__consultas.filter((q) => q.nombre === "tiempo_por_seccion").map((q) => q.args)), [
    { p_alumno: "u-ana", p_desde: "2026-11-06T00:00:00-06:00", p_hasta: "2026-11-11T00:00:00-06:00" },
    { p_alumno: "u-beto", p_desde: "2026-11-06T00:00:00-06:00", p_hasta: "2026-11-11T00:00:00-06:00" },
  ]);
  igual("Ana: planeado, hecho y el veredicto escrito", await textos(page, '[data-alumno="u-ana"] tbody tr'), [
    "Aperturas 25 % 30 % en línea", "Medio juego y estrategia 15 % 0 % por debajo", "Finales 15 % 10 % en línea",
    "Solución de ejercicios 25 % 60 % por encima", "Análisis de partidas 10 % 0 % en línea", "Práctica de partidas 10 % 0 % en línea"]);
  igual("la clase en vivo no entra en el reparto, y se dice", (await textos(page, '[data-alumno="u-ana"] p')).pop(),
    "La clase en vivo, los cursos y el tiempo en Estudio no entran en el reparto: mezclan varias direcciones.");
  igual("Beto, con 20 minutos, no se juzga: lo dice", (await textos(page, '[data-alumno="u-beto"] p'))[0],
    "En esta etapa lleva 20 min de entrenamiento que se puede repartir. El reparto se compara desde los 60 minutos: con menos, no dice nada.");
  igual("ni un veredicto para Beto", await textos(page, '[data-alumno="u-beto"] .tp-veredicto'), ["", "", "", "", "", ""]);

  console.log("-- Armar una nueva");
  await page.click("#tp-nueva");
  igual("el armador se ve y lleva el foco a su título", [await seVe(page, "#tp-editor"),
    await page.evaluate(() => document.activeElement.id)], [true, "tp-editor-titulo"]);
  await page.fill("#tp-titulo", "Rumbo al Abierto");
  await page.fill("#tp-inicio", "2026-11-10");
  await page.fill("#tp-fecha", "2027-01-10");
  await page.click("#tp-proponer");
  igual("propone las cuatro etapas", await textos(page, "#tp-etapas legend"),
    ["Etapa 1: Preparación general", "Etapa 2: Preparación específica", "Etapa 3: Precompetitiva", "Etapa 4: Competitiva"]);
  igual("cada una dice su suma, en palabras", await textos(page, ".tp-e-suma"),
    ["Suma: 100 % (bien)", "Suma: 100 % (bien)", "Suma: 100 % (bien)", "Suma: 100 % (bien)"]);
  // Sin alumnos y con una etapa que no suma 100: no se guarda, y dice por qué.
  await page.fill("#tp-e-pct-ejercicios-" + (await page.$eval(".tp-etapa .tp-e-pct", (i) => i.id.split("-").pop())), "25");
  igual("al tocar un porcentaje, la suma avisa", (await textos(page, ".tp-e-suma"))[0], "Suma: 95 % (tiene que dar 100)");
  const antes = await page.evaluate(() => window.__escrituras.length);
  await page.click("#tp-guardar");
  igual("no guarda y dice qué falta", [await page.evaluate(() => window.__escrituras.length) - antes, await textos(page, "#tp-problemas li")], [0, [
    "Marca al menos un alumno.", "La etapa 1 («Preparación general»): los porcentajes suman 95 y tienen que sumar 100."]]);
  await page.fill("#tp-e-pct-ejercicios-" + (await page.$eval(".tp-etapa .tp-e-pct", (i) => i.id.split("-").pop())), "30");
  await page.check('.tp-alumno[value="u-ceci"]');
  await page.click("#tp-guardar");
  await page.waitForFunction(() => window.__escrituras.length > 0);
  const esc = await page.evaluate(() => window.__escrituras[0]);
  igual("guarda una fila por alumno, a su nombre, con las cuatro etapas", [esc.accion, esc.cuerpo.length, esc.cuerpo[0].alumno_id,
    esc.cuerpo[0].profesor_id, esc.cuerpo[0].titulo, esc.cuerpo[0].etapas.length, typeof esc.cuerpo[0].lote],
    ["insert", 1, "u-ceci", "u-profe", "Rumbo al Abierto", 4, "string"]);
  await page.waitForFunction(() => document.querySelectorAll("#tp-lista li").length === 2);
  igual("y vuelve a leer: queda en la lista", (await textos(page, "#tp-lista li h3")).sort(), ["Camino al Nacional", "Rumbo al Abierto"]);

  console.log("-- En el celular");
  await page.setViewportSize({ width: 375, height: 800 });
  igual("no se desborda a lo ancho", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  igual("sin errores en la consola", errores, []);
  await c.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna ===");
  const { page, ctx: c, errores } = await abrir(browser, "u-ana");
  await page.waitForSelector("#tp-mias section table");
  igual("pide SU temporada (alumno_id)", await page.evaluate(() =>
    window.__consultas.filter((q) => q.nombre === "temporadas").map((q) => q.filtros)), [[["alumno_id", "u-ana"]]]);
  igual("ve dónde va", (await textos(page, "#tp-mias section > p"))[0],
    "Faltan 40 días para «Nacional Juvenil». Etapa en curso: Preparación específica (le quedan 34 días).");
  igual("la etapa en curso lo dice en palabras y para el lector de pantalla", await page.$$eval('#tp-mias li[aria-current="step"]', (ns) =>
    ns.map((n) => n.innerText.replace(/\s+/g, " ").trim())), [
    "2. Preparación específica 6 nov al 13 dic En curso Aperturas 25 % · Solución de ejercicios 25 % · Finales 15 % · Medio juego y estrategia 15 % · Análisis de partidas 10 % · Práctica de partidas 10 % El repertorio que se va a jugar."]);
  igual("ve cómo va ella", (await textos(page, "#tp-mias tbody tr"))[0], "Aperturas 25 % 30 % en línea");
  igual("no ve el armador", await seVe(page, "#tp-editor"), false);
  igual("sin errores en la consola", errores, []);
  await c.close();

  console.log("\n=== Un alumno sin temporada ===");
  const r = await abrir(browser, "u-ceci-sin");
  await r.page.waitForFunction(() => !/Cargando/.test(document.getElementById("tp-estado").textContent));
  igual("se lo dice, en vez de una página vacía", await r.page.textContent("#tp-estado"),
    "Tu profe todavía no te armó un plan de temporada. Cuando lo haga, aquí vas a ver en qué etapa vas y en qué poner el énfasis.");
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await pruebaProfe(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  if (fallos) { console.log(`\n${fallos} comprobación(es) fallaron.`); process.exit(1); }
  console.log("\nTodo en orden.");
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
