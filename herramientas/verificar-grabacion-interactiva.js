/* La grabación con capítulos y su lámina: en el modo cine del panel de taller,
 * al lado del video de una sesión de Formación Ajedrez van la lámina que se
 * está explicando en ese momento y los capítulos para saltar a cada tema (ver
 * «La grabación con capítulos y su lámina» en docs/decisiones/paneles.md).
 *
 * Lo que se rompe acá se rompe callado:
 *
 *  - Los archivos publicados no son los que da la fuente (alguien los editó a
 *    mano, o cambió la fuente y no se volvió a generar): los capítulos llevan
 *    a otro minuto y se ve perfecto.
 *  - Un capítulo cae fuera del video o fuera de orden, o una lámina de la
 *    línea no existe en la presentación (se rehízo con menos láminas).
 *  - El archivo publicado trae el id del video no listado (es la llave).
 *  - Se sube otra grabación (otra duración) y los capítulos de la vieja se
 *    siguen pintando sobre la nueva.
 *  - La lámina no sigue al video, el capítulo marcado no es el que corre, o
 *    tocar un capítulo no mueve el video.
 *  - Sin el archivo o sin acceso al curso (el worker contesta 403), el video
 *    deja de verse.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-grabacion-interactiva.js
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("./lib/playwright-con-sesion");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const PRES = path.join(RAIZ, "cursos/recursos/formacion-ajedrez/presentaciones");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const ok = JSON.stringify(hallado) === JSON.stringify(esperado);
  console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok ? "" : `\n      esperado: ${JSON.stringify(esperado)}\n      hallado:  ${JSON.stringify(hallado)}`));
  if (!ok) fallos++;
}
function cierto(nombre, cond, detalle) {
  console.log((cond ? "  ✓ " : "  ✗ ") + nombre + (cond || !detalle ? "" : `\n      ${detalle}`));
  if (!cond) fallos++;
}

function pruebaArchivos() {
  console.log("\n=== Los archivos de las grabaciones ===");
  let salida = "", ok = true;
  try {
    salida = execFileSync("node", [path.join(__dirname, "formacion-grabaciones.js"), "--comprobar"], { encoding: "utf8", stdio: "pipe" });
  } catch (e) { ok = false; salida = String(e.stderr || e.stdout || e); }
  cierto("los grabacion.json publicados son los que da la fuente", ok, salida.trim());

  const { armar } = require("./formacion-grabaciones.js");
  const fuente = JSON.parse(fs.readFileSync(path.join(__dirname, "datos/formacion-grabaciones.json"), "utf8"));
  igual("las tres sesiones grabadas tienen capítulos", fuente.sesiones.map((s) => s.presentacion), ["clase-01", "clase-02", "clase-03"]);
  for (const s of fuente.sesiones) {
    const publicado = fs.readFileSync(path.join(PRES, s.presentacion, "grabacion.json"), "utf8");
    cierto(`${s.presentacion}: el archivo publicado no trae ningún id de YouTube`, !/youtube|youtu\.be|"[A-Za-z0-9_-]{11}"/.test(publicado.replace(/"(_comentario|duracion|capitulos|laminas|titulo|lamina)"/g, "")));
    const g = JSON.parse(publicado);
    igual(`${s.presentacion}: lleva solo duración, capítulos y láminas`, Object.keys(g), ["_comentario", "duracion", "capitulos", "laminas"]);
    cierto(`${s.presentacion}: entre 6 y 20 capítulos (${g.capitulos.length}) y una lámina cada tanto (${g.laminas.length})`, g.capitulos.length >= 6 && g.capitulos.length <= 20 && g.laminas.length >= 10);
  }

  // El armador se planta ante lo que no cuadra (se corre en un hijo: sale con
  // exit). El `node -e` solo recibe la sesión de prueba armada aquí mismo, como
  // literal JSON: no entra nada de afuera.
  const base = JSON.parse(JSON.stringify(fuente.sesiones[0]));
  const rompe = (nombre, cambiar) => {
    const s = JSON.parse(JSON.stringify(base));
    cambiar(s);
    let fallo = false;
    try {
      execFileSync("node", ["-e", `require(${JSON.stringify(path.join(__dirname, "formacion-grabaciones.js"))}).armar(${JSON.stringify(s)})`], { stdio: "pipe" });
    } catch (e) { fallo = true; }
    cierto("el generador se niega: " + nombre, fallo);
  };
  rompe("un capítulo fuera del video", (s) => { s.capitulos[s.capitulos.length - 1].t = s.duracion + 5; });
  rompe("capítulos fuera de orden", (s) => { s.capitulos[2].t = s.capitulos[1].t; });
  rompe("una lámina que no existe", (s) => { s.laminas[3].lamina = 999; });
  rompe("el primer capítulo que no empieza en 0", (s) => { s.capitulos[0].t = 30; });
}

/* El doble de Supabase: lo justo para que el panel pinte las grabaciones. */
function clienteFalso(cfg) {
  return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
window.__rpc = [];
(function () {
  const CFG = ${JSON.stringify(cfg)};
  function b(filas) {
    let datos = Array.isArray(filas) ? filas.slice() : filas, unica = false;
    const q = {
      select() { return q; }, eq(c, v) { if (Array.isArray(datos)) datos = datos.filter((f) => String(f[c]) === String(v)); return q; },
      in() { return q; }, order() { return q; }, limit() { return q; }, gte() { return q; }, lte() { return q; }, or() { return q; }, neq() { return q; },
      is() { return q; }, not() { return q; }, ilike() { return q; }, gt() { return q; }, lt() { return q; }, range() { return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) {
        let d = datos;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null, count: Array.isArray(d) ? d.length : 0 }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: CFG.yo }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: CFG.yo } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => b((CFG.tablas || {})[t] || []),
    rpc: (n, args) => { window.__rpc.push({ n, args: args || null }); const r = (CFG.rpc || {})[n]; return b(r === undefined ? null : r); },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

const HORA = 3600000, DIA = 24 * HORA;
const diaCR = (ms) => new Date(Date.now() - 6 * HORA + ms).toISOString().slice(0, 10);
const enCR = (dia, hhmm) => new Date(dia + "T" + hhmm + ":00-06:00").toISOString();
const YO = "u-asesor";
function cfg(grabaciones) {
  return {
    yo: YO,
    tablas: { profiles: [{ id: YO, full_name: "Asesora de prueba", role: "alumno", is_admin: false, grupo: "MEP" }] },
    rpc: {
      mi_acceso: { vigente: true, motivo: "temporal", exigido: false, vence: "2030-12-20T06:00:00+00:00", detalle: "Taller", dias: 70 },
      mi_panel_taller: true,
      mis_clases_proximas: [],
      mis_clases: [{ profesor_id: "u-profe", profesor: "Campeones", es_principal: true, clase_abierta: false, titulo_clase: null, videollamada: null }],
      tareas_con_avance: [], examenes_con_nota: [],
      mis_grabaciones: grabaciones,
      grabacion_vista_anotar: 0,
    },
  };
}
function grabacion(id, dias, titulo, tema, duracion) {
  const dia = diaCR(dias * DIA);
  return { horario_id: id, fecha: dia, titulo, modalidad: "en_linea", youtube_id: "AbCdEfGhIj" + id.slice(-1),
    inicio: enCR(dia, "08:00"), fin: enCR(dia, "12:00"), tema, duracion_seg: duracion };
}

/* El reproductor falso: contesta como el de YouTube (enablejsapi=1). Cuando la
   página dice que escucha, manda el segundo en que va; con «seekTo» salta a
   ese segundo y lo dice. Anota las órdenes que recibe. */
const REPRODUCTOR = `<body>video<script>
window.__ordenes = [];
var t = 0, ya = false, origen = null;
function decir() { parent.postMessage(JSON.stringify({ event: "infoDelivery", id: 1, channel: "widget", info: { playerState: 1, currentTime: t, playbackRate: 1 } }), "*"); }
addEventListener("message", function (e) {
  var d; try { d = JSON.parse(e.data); } catch (x) { return; }
  if (!d) return;
  if (d.event === "command") {
    window.__ordenes.push(d.func + ":" + (d.args || []).join(","));
    if (d.func === "seekTo") { t = d.args[0]; decir(); }
    return;
  }
  if (d.event !== "listening" || ya) return;
  ya = true;
  parent.postMessage(JSON.stringify({ event: "initialDelivery", id: 1, channel: "widget", info: { playerState: -1, currentTime: 0, playbackRate: 1 } }), "*");
});
window.ponerEn = function (x) { t = x; decir(); };
</script></body>`;

async function abrir(browser, grabaciones, { ancho = 1300, rutas } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: 950 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route(/youtube/, (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: REPRODUCTOR }));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg(grabaciones)) }));
  if (rutas) await rutas(page);
  await page.goto(BASE + "/clases.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "mis_grabaciones"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  return { page, errores, cerrar: () => ctx.close() };
}
const reproductor = (page) => page.frames().find((f) => /youtube-nocookie/.test(f.url()));
async function abrirCine(page, sesion) {
  await page.click(`[data-grabacion]:has-text("${sesion}")`);
  await page.waitForFunction(() => { const g = document.getElementById("grabacion-cine-guia"); return g && !g.hidden; }, null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function ponerEn(page, t) {
  await reproductor(page).evaluate((x) => window.ponerEn(x), t);
  await page.waitForTimeout(150);
}
const estado = (page) => page.evaluate(() => {
  const img = document.getElementById("grabacion-cine-lamina");
  const actual = document.querySelector('#grabacion-cine-capitulos button[aria-current="true"]');
  return {
    lamina: img && img.getAttribute("src"),
    cual: (document.getElementById("grabacion-cine-lamina-cual") || {}).textContent,
    capitulo: actual ? actual.dataset.capitulo : null,
    viendo: actual ? actual.lastElementChild.checkVisibility() : false,
    otrosViendo: [...document.querySelectorAll("#grabacion-cine-capitulos button:not([aria-current]) > span:last-child")].filter((s) => s.checkVisibility()).length,
  };
});

function contrasteEnPagina(sel) {
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const rgba = (s) => { const m = s.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1]; };
  const e = document.querySelector(sel);
  if (!e) return 0;
  let fg = rgba(getComputedStyle(e).color);
  // Se mezclan los fondos semitransparentes de abajo hacia arriba.
  const capas = [];
  for (let n = e; n; n = n.parentElement) {
    const c = rgba(getComputedStyle(n).backgroundColor);
    if (c[3] > 0) capas.push(c);
    if (c[3] >= 1) break;
  }
  let fondo = [255, 255, 255];
  for (let i = capas.length - 1; i >= 0; i--) {
    const [r, g, b, a] = capas[i];
    fondo = [r * a + fondo[0] * (1 - a), g * a + fondo[1] * (1 - a), b * a + fondo[2] * (1 - a)];
  }
  fg = [fg[0] * fg[3] + fondo[0] * (1 - fg[3]), fg[1] * fg[3] + fondo[1] * (1 - fg[3]), fg[2] * fg[3] + fondo[2] * (1 - fg[3])];
  const [a, b] = [lum(fg), lum(fondo)].sort((x, y) => y - x);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}

async function pruebaCine(browser) {
  console.log("\n=== Capítulos y lámina en el modo cine ===");
  const g1 = JSON.parse(fs.readFileSync(path.join(PRES, "clase-01/grabacion.json"), "utf8"));
  const g2 = JSON.parse(fs.readFileSync(path.join(PRES, "clase-02/grabacion.json"), "utf8"));
  const g3 = JSON.parse(fs.readFileSync(path.join(PRES, "clase-03/grabacion.json"), "utf8"));
  const d1 = JSON.parse(fs.readFileSync(path.join(PRES, "clase-01/diapositivas.json"), "utf8")).diapositivas;
  const lista = [
    grabacion("p1", -29, "Sesión I", "Encuadre del curso y reglas básicas", g1.duracion),
    grabacion("p2", -21, "Sesión II", "Reglas de competición", g2.duracion),
    grabacion("p3", -12, "Sesión III", "Apéndices de las Leyes de Ajedrez, normativa JDE y sistemas de emparejamiento", g3.duracion + 60),   // se subió otro video
    grabacion("p4", -5, "Sesión IV", "Otra cosa", 9000),                               // sin presentación
  ];
  const { page, errores, cerrar } = await abrir(browser, lista);
  await abrirCine(page, "Sesión I");
  const visible = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);
  igual("al lado del video salen la lámina y los capítulos", [await visible("#grabacion-cine-lamina"), await visible("#grabacion-cine-capitulos")], [true, true]);
  igual("un capítulo por cada uno del archivo, con su hora y su título",
    await page.$$eval("#grabacion-cine-capitulos button", (bs) => bs.map((b) => [Number(b.dataset.capitulo), b.children[2].textContent])),
    g1.capitulos.map((c) => [c.t, c.titulo]));
  igual("el lector de pantalla oye adónde lleva cada capítulo",
    await page.getByRole("button", { name: "Ir al minuto " + Math.floor(g1.capitulos[1].t / 60) + ": " + g1.capitulos[1].titulo, exact: true }).count(), 1);

  // En el segundo de la tercera entrada de la línea, más un poco.
  const x = g1.laminas[2], cap = g1.capitulos.filter((c) => c.t <= x.t + 30).pop();
  await ponerEn(page, x.t + 30);
  let e = await estado(page);
  const carpeta = "cursos/recursos/formacion-ajedrez/presentaciones/clase-01/";
  igual("la lámina sigue al video", e.lamina, carpeta + d1[x.lamina - 1].imagen);
  igual("y dice cuál es, escrito", e.cual, "Lámina " + x.lamina + " de " + d1.length + ": " + d1[x.lamina - 1].titulo);
  igual("el capítulo que corre va marcado (aria-current y «Viendo» escrito), y ningún otro", [e.capitulo, e.viendo, e.otrosViendo], [String(cap.t), true, 0]);
  igual("la lámina lleva su texto para el lector de pantalla", await page.$eval("#grabacion-cine-lamina", (i) => i.alt), d1[x.lamina - 1].texto || d1[x.lamina - 1].titulo);
  await page.waitForFunction(() => { const i = document.getElementById("grabacion-cine-lamina"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
  cierto("y la imagen carga de verdad", await page.$eval("#grabacion-cine-lamina", (i) => i.naturalWidth > 0));

  // Tocar un capítulo mueve el video.
  const c5 = g1.capitulos[5];
  await page.click(`#grabacion-cine-capitulos button[data-capitulo="${c5.t}"]`);
  await page.waitForTimeout(250);
  const ordenes = await reproductor(page).evaluate(() => window.__ordenes.slice());
  igual("tocar un capítulo lleva el video a ese segundo y lo pone a correr", ordenes.slice(-2), ["seekTo:" + c5.t + ",true", "playVideo:"]);
  e = await estado(page);
  igual("y queda marcado ese capítulo", e.capitulo, String(c5.t));
  igual("con su lámina", e.lamina, carpeta + d1[g1.laminas.filter((l) => l.t <= c5.t).pop().lamina - 1].imagen);

  // «Lámina siguiente» y «anterior».
  const i = g1.laminas.filter((l) => l.t <= c5.t).length - 1;
  await page.click("#grabacion-cine-lamina-despues");
  await page.waitForTimeout(250);
  igual("«Lámina siguiente» lleva el video a donde se explicó la siguiente", (await reproductor(page).evaluate(() => window.__ordenes.slice())).slice(-2)[0], "seekTo:" + g1.laminas[i + 1].t + ",true");
  await page.click("#grabacion-cine-lamina-antes");
  await page.waitForTimeout(250);
  igual("y «anterior», a la de antes", (await reproductor(page).evaluate(() => window.__ordenes.slice())).slice(-2)[0], "seekTo:" + g1.laminas[i].t + ",true");
  await ponerEn(page, 0);
  igual("al principio, «Lámina anterior» va apagada", await page.$eval("#grabacion-cine-lamina-antes", (b) => b.disabled), true);

  // Contraste, medido contra el fondo real (el modo cine es oscuro siempre).
  const medidas = {};
  for (const sel of ["#grabacion-cine-lamina-cual", "#grabacion-cine-capitulos-titulo", '#grabacion-cine-capitulos button[aria-current="true"] > span:first-child',
    '#grabacion-cine-capitulos button[aria-current="true"] > span:last-child', "#grabacion-cine-capitulos li:last-child button > span:nth-child(3)", "#grabacion-cine-lamina-despues"]) {
    medidas[sel] = await page.evaluate(contrasteEnPagina, sel);
  }
  cierto("contraste ≥ 4,5 de todo el texto nuevo: " + Object.values(medidas).join(", "), Object.values(medidas).every((v) => v >= 4.5), JSON.stringify(medidas));

  await ponerEn(page, g1.capitulos[g1.capitulos.length - 2].t + 10);
  igual("el capítulo que corre se ve en la lista aunque esté abajo", await page.evaluate(() => {
    const b = document.querySelector('#grabacion-cine-capitulos button[aria-current="true"]'), caja = b.closest("nav").getBoundingClientRect(), r = b.getBoundingClientRect();
    return r.top >= caja.top - 1 && r.bottom <= caja.bottom + 1;
  }), true);
  igual("en la computadora la guía va al lado del video", await page.evaluate(() => {
    const v = document.getElementById("grabacion-cine-video").getBoundingClientRect(), g = document.getElementById("grabacion-cine-guia").getBoundingClientRect();
    return g.left >= v.right - 1;
  }), true);
  await page.setViewportSize({ width: 390, height: 850 });
  await page.waitForTimeout(250);
  igual("en el celular va debajo y no se desborda", await page.evaluate(() => {
    const v = document.getElementById("grabacion-cine-video").getBoundingClientRect(), g = document.getElementById("grabacion-cine-guia").getBoundingClientRect();
    const d = document.getElementById("grabacion-cine");
    return [g.top >= v.bottom - 1, d.scrollWidth <= d.clientWidth + 1, document.documentElement.scrollWidth <= window.innerWidth];
  }), [true, true, true]);
  await page.setViewportSize({ width: 1300, height: 950 });

  // Al cerrar se va todo; otra grabación sin archivo sale sin guía.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  igual("al cerrar, la guía se quita con el video", await page.evaluate(() => [document.getElementById("grabacion-cine-guia").hidden, document.querySelectorAll("#grabacion-cine-guia *").length]), [true, 0]);
  // La Sesión II empezó con lo pendiente de la I: esas láminas son de la otra presentación.
  await abrirCine(page, "Sesión II");
  const otra = g2.laminas.find((l) => l.clase), propia = g2.laminas.find((l) => !l.clase);
  cierto("la Sesión II trae láminas de la Sesión I al principio", !!otra && !!propia && otra.t < propia.t);
  const d1b = JSON.parse(fs.readFileSync(path.join(PRES, otra.clase, "diapositivas.json"), "utf8")).diapositivas;
  const d2 = JSON.parse(fs.readFileSync(path.join(PRES, "clase-02/diapositivas.json"), "utf8")).diapositivas;
  await ponerEn(page, otra.t + 5);
  e = await estado(page);
  igual("una lámina de otra sesión sale de SU presentación y lo dice", [e.lamina, e.cual],
    ["cursos/recursos/formacion-ajedrez/presentaciones/" + otra.clase + "/" + d1b[otra.lamina - 1].imagen,
      "Lámina " + otra.lamina + " de " + d1b.length + " de la Sesión " + Number(otra.clase.slice(-2)) + ": " + d1b[otra.lamina - 1].titulo]);
  await ponerEn(page, propia.t + 5);
  e = await estado(page);
  igual("y las de la sesión, de la suya, sin decir de cuál", [e.lamina, e.cual],
    ["cursos/recursos/formacion-ajedrez/presentaciones/clase-02/" + d2[propia.lamina - 1].imagen, "Lámina " + propia.lamina + " de " + d2.length + ": " + d2[propia.lamina - 1].titulo]);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await abrirCine(page, "Sesión III");
  igual("si la grabación no dura lo que dice el archivo (se subió otra), no se pinta nada y el video se ve igual",
    [await page.$eval("#grabacion-cine-guia", (g) => g.hidden), await page.$$eval("#grabacion-cine-video iframe", (f) => f.length)], [true, 1]);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await abrirCine(page, "Sesión IV");
  igual("una grabación sin presentación tampoco lleva guía", await page.$eval("#grabacion-cine-guia", (g) => g.hidden), true);
  igual("y el modo cine vuelve a su ancho de siempre", await page.$eval("#grabacion-cine", (d) => d.classList.contains("max-w-5xl")), true);
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await cerrar();

  console.log("\n=== Sin acceso al curso (el worker contesta 403) ===");
  const sin = await abrir(browser, lista.slice(0, 1), { rutas: (pg) => pg.route("**/presentaciones/clase-01/grabacion.json", (r) => r.fulfill({ status: 403, contentType: "text/plain", body: "sin acceso" })) });
  await abrirCine(sin.page, "Sesión I");
  igual("el video se ve igual, sin guía", [await sin.page.$eval("#grabacion-cine-guia", (g) => g.hidden), await sin.page.$$eval("#grabacion-cine-video iframe", (f) => f.length)], [true, 1]);
  cierto("sin errores en la página", sin.errores.length === 0, sin.errores.join(" | "));
  await sin.cerrar();
}

(async () => {
  pruebaArchivos();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaCine(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e.stack || e));
    fallos += 1;
  }
  await browser.close();
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo en orden.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
