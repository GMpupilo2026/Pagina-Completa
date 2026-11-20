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
 *  - Una aclaración del profe (lo que el video dice mal) no sale en su minuto,
 *    sale sin su fuente o con un dibujo del avatar que no existe, se queda
 *    pegada, o no se dice en voz.
 *  - Una pregunta del video publica cuál es la correcta, o la base corrige con
 *    otras correctas que las del generador; el video no se detiene en la
 *    pregunta, se detiene aunque ya la contestó o aunque adelantó por encima,
 *    o no dice cuál era la correcta.
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
    cierto(`${s.presentacion}: el archivo publicado no trae ningún id de YouTube`, !/youtube|youtu\.be/i.test(publicado) && fuente.sesiones.every((x) => !publicado.includes(x.youtube_id)));
    const g = JSON.parse(publicado);
    igual(`${s.presentacion}: lleva solo duración, capítulos, láminas, aclaraciones y preguntas`, Object.keys(g), ["_comentario", "duracion", "capitulos", "laminas", "aclaraciones", "preguntas"]);
    igual(`${s.presentacion}: de cada pregunta, solo el segundo, el número, el texto, las opciones, la posición y la fuente: la correcta no`,
      [...new Set(g.preguntas.flatMap((q) => Object.keys(q)))].sort(), ["fen", "fuente", "n", "opciones", "t", "texto"].filter((k) => k !== "fen" || g.preguntas.some((q) => q.fen)).sort());
    const banco = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos/formacion-ajedrez-kahoot.json"), "utf8"));
    cierto(`${s.presentacion}: ${g.preguntas.length} preguntas, cada una igual a la del banco revisado (texto, sus cuatro opciones y su posición)`, g.preguntas.length === s.preguntas.length && g.preguntas.every((q, i) => {
      const r = s.preguntas[i], p = banco[r.banco][r.k].preguntas[r.i];
      return q.texto === p.texto && q.n === i + 1 && q.t === r.t && JSON.stringify([...q.opciones].sort()) === JSON.stringify([p.correcta, ...p.distractores].sort()) && (q.fen || null) === (p.fen || null);
    }));
    cierto(`${s.presentacion}: cada aclaración del profe trae su fuente y un dibujo que existe`, g.aclaraciones.length > 0 && g.aclaraciones.every((a) => a.fuente && fs.existsSync(path.join(RAIZ, "img/avatar-profe-oscar", a.avatar + ".webp"))));
    cierto(`${s.presentacion}: entre 6 y 20 capítulos (${g.capitulos.length}) y una lámina cada tanto (${g.laminas.length})`, g.capitulos.length >= 6 && g.capitulos.length <= 20 && g.laminas.length >= 10);
  }

  // Lo que sabe la base: la última migración que carga las correctas dice lo mismo que el generador.
  const { claves } = require("./formacion-grabaciones.js");
  const MIG = path.join(RAIZ, "supabase/migraciones");
  const conClaves = fs.readdirSync(MIG).filter((f) => fs.readFileSync(path.join(MIG, f), "utf8").includes("insert into public.grabacion_preguntas (youtube_id, n, correcta)")).sort();
  const ultima = conClaves.length ? fs.readFileSync(path.join(MIG, conClaves[conClaves.length - 1]), "utf8") : "";
  const filas = claves(fuente);
  const enMig = [...ultima.matchAll(/\('([A-Za-z0-9_-]{11})', (\d+), ([0-3])\)/g)].map((m) => m[1] + "/" + m[2] + "/" + m[3]).sort();
  igual("las correctas de la base (la última migración que las carga) son las del generador: si no, la base corrige con otra",
    enMig, filas.map((f) => f.youtube_id + "/" + f.n + "/" + f.correcta).sort());
  const lugares = [0, 1, 2, 3].map((c) => filas.filter((f) => f.correcta === c).length);
  cierto("la correcta está repartida entre A, B, C y D (" + lugares.join(", ") + "): no siempre en el mismo lugar", Math.max(...lugares) - Math.min(...lugares) <= 3);

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
  rompe("una aclaración con un avatar que no existe", (s) => { s.aclaraciones[0].avatar = "no-existe"; });
  rompe("una aclaración sin fuente", (s) => { s.aclaraciones[0].fuente = ""; });
  rompe("una pregunta que no está en el banco", (s) => { s.preguntas[0].i = 999; });
  rompe("una pregunta repetida", (s) => { s.preguntas[1] = Object.assign({}, s.preguntas[0], { t: s.preguntas[1].t }); });
}

/* El doble de Supabase: lo justo para que el panel pinte las grabaciones. */
function clienteFalso(cfg) {
  return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
window.__rpc = [];
(function () {
  const CFG = ${JSON.stringify(cfg)};
  function b(filas, error) {
    let datos = Array.isArray(filas) ? filas.slice() : filas, unica = false;
    const q = {
      select() { return q; }, eq(c, v) { if (Array.isArray(datos)) datos = datos.filter((f) => String(f[c]) === String(v)); return q; },
      in() { return q; }, order() { return q; }, limit() { return q; }, gte() { return q; }, lte() { return q; }, or() { return q; }, neq() { return q; },
      is() { return q; }, not() { return q; }, ilike() { return q; }, gt() { return q; }, lt() { return q; }, range() { return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) {
        if (error) return Promise.resolve({ data: null, error: { message: error } }).then(res, rej);
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
    from: (t) => ((CFG.fallan || []).includes(t) ? b(null, "falló " + t) : b((CFG.tablas || {})[t] || [])),
    rpc: (n, args) => {
      window.__rpc.push({ n, args: args || null });
      if ((CFG.fallan || []).includes(n)) return b(null, "falló " + n);
      // Corrige como la base: la primera respuesta es la que vale.
      if (n === "grabacion_pregunta_responder" && CFG.correctas) {
        const c = CFG.correctas[args.p_n];
        window.__primera = window.__primera || {};
        const k = args.p_horario + "|" + args.p_n;
        if (!(k in window.__primera)) window.__primera[k] = args.p_opcion;
        const elegida = CFG.anotada === false ? args.p_opcion : window.__primera[k];
        return b({ correcta: c, elegida, acerto: elegida === c, anotada: CFG.anotada !== false });
      }
      const r = (CFG.rpc || {})[n];
      return b(r === undefined ? null : r);
    },
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
function cfg(grabaciones, extra) {
  return Object.assign({
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
  }, extra || {});
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

async function abrir(browser, grabaciones, { ancho = 1300, rutas, extra } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: 950 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route(/youtube/, (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: REPRODUCTOR }));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg(grabaciones, extra)) }));
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

  // Las aclaraciones del profe: la tarjeta con el avatar en el minuto justo.
  const a = g1.aclaraciones[0];
  const tarjeta = () => page.evaluate(() => {
    const t = document.getElementById("grabacion-cine-aclaracion"), i = document.getElementById("grabacion-cine-aclaracion-avatar");
    return { ve: !!t && t.checkVisibility(), avatar: i && i.getAttribute("src"), alt: i && i.alt, texto: t ? t.innerText : "",
      voz: (document.getElementById("grabacion-cine-aclaracion-voz") || {}).textContent, vivo: (document.getElementById("grabacion-cine-aclaracion-voz") || { getAttribute() {} }).getAttribute("aria-live") };
  });
  await ponerEn(page, a.t - 20);
  igual("antes del minuto, la aclaración no sale", (await tarjeta()).ve, false);
  await ponerEn(page, a.t + 5);
  let ta = await tarjeta();
  const av = await page.evaluate((id) => AvatarProfeOscar.porId(id), a.avatar);
  igual("en el minuto en que el video lo dice, sale con el avatar del profe", [ta.ve, ta.avatar, ta.alt], [true, "img/avatar-profe-oscar/" + a.avatar + ".webp", av.alt]);
  cierto("con la regla buena y su fuente, escritas", ta.texto.includes(a.titulo) && ta.texto.includes(a.texto) && ta.texto.includes("Fuente: " + a.fuente), ta.texto);
  igual("y se dice en voz (región viva)", [ta.vivo, ta.voz], ["polite", "Aclaración del profe: " + a.titulo + ". " + a.texto]);
  await page.waitForFunction(() => { const i = document.getElementById("grabacion-cine-aclaracion-avatar"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
  cierto("el dibujo carga de verdad", await page.$eval("#grabacion-cine-aclaracion-avatar", (i) => i.naturalWidth > 0));
  const cA = [await page.evaluate(contrasteEnPagina, "#grabacion-cine-aclaracion-titulo"), await page.evaluate(contrasteEnPagina, "#grabacion-cine-aclaracion p"),
    await page.evaluate(contrasteEnPagina, "#grabacion-cine-aclaracion p:last-child")];
  cierto("contraste de la tarjeta ≥ 4,5: " + cA.join(", "), cA.every((v) => v >= 4.5));
  await ponerEn(page, a.t + 125);
  igual("dos minutos después se va", (await tarjeta()).ve, false);
  igual("abajo, la lista de todas las aclaraciones de la sesión", await page.$$eval("#grabacion-cine-aclaraciones button", (bs) => bs.map((b) => Number(b.dataset.aclaracion))), g1.aclaraciones.map((x) => x.t));
  const a2 = g1.aclaraciones[1];
  await page.click(`#grabacion-cine-aclaraciones button[data-aclaracion="${a2.t}"]`);
  await page.waitForTimeout(250);
  igual("tocar una lleva el video 10 segundos antes, para oír lo que se aclara", (await reproductor(page).evaluate(() => window.__ordenes.slice())).slice(-2)[0], "seekTo:" + (a2.t - 10) + ",true");
  await ponerEn(page, a2.t + 1);
  igual("y ahí sale su tarjeta", (await tarjeta()).texto.includes(a2.titulo), true);
  await ponerEn(page, 0);

  // Contraste, medido contra el fondo real (el modo cine es oscuro siempre).
  const medidas = {};
  for (const sel of ["#grabacion-cine-lamina-cual", "#grabacion-cine-capitulos-titulo", '#grabacion-cine-capitulos button[aria-current="true"] > span:first-child',
    '#grabacion-cine-capitulos button[aria-current="true"] > span:last-child', "#grabacion-cine-capitulos li:last-child button > span:nth-child(3)", "#grabacion-cine-lamina-despues",
    "#grabacion-cine-aclaraciones-titulo", "#grabacion-cine-aclaraciones li button > span:nth-child(3)"]) {
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

/* Las preguntas dentro del video, con el doble que corrige como la base (las
   correctas que da el generador para el video de la Sesión I). */
async function pruebaPreguntas(browser) {
  console.log("\n=== Las preguntas dentro del video ===");
  const g1 = JSON.parse(fs.readFileSync(path.join(PRES, "clase-01/grabacion.json"), "utf8"));
  const { claves } = require("./formacion-grabaciones.js");
  const fuente = JSON.parse(fs.readFileSync(path.join(__dirname, "datos/formacion-grabaciones.json"), "utf8"));
  const id1 = fuente.sesiones[0].youtube_id;
  const correctas = {};
  claves(fuente).filter((f) => f.youtube_id === id1).forEach((f) => { correctas[f.n] = f.correcta; });
  const lista = [grabacion("p1", -29, "Sesión I", "Encuadre del curso y reglas básicas", g1.duracion)];
  const q1 = g1.preguntas[0], q2 = g1.preguntas[1], qFen = g1.preguntas.find((q) => q.fen);
  // La 2 ya la contestó (bien) otra vez: no lo vuelve a detener.
  // Cada fila es de una parte de la grabación (la base la pone en 1 si la
  // sesión quedó en un solo video); la de otra parte no cuenta para esta.
  const ya = [{ horario_id: "p1", fecha: lista[0].fecha, parte: 1, persona_id: YO, n: 2, elegida: correctas[2], acerto: true },
    { horario_id: "p1", fecha: lista[0].fecha, parte: 2, persona_id: YO, n: 1, elegida: correctas[1], acerto: true }];
  const { page, errores, cerrar } = await abrir(browser, lista, { extra: { correctas, tablas: {
    profiles: [{ id: YO, full_name: "Asesora de prueba", role: "alumno", is_admin: false, grupo: "MEP" }], grabacion_respuestas: ya } } });
  await abrirCine(page, "Sesión I");
  const panel = () => page.evaluate(() => {
    const c = document.getElementById("grabacion-cine-pregunta");
    return { ve: !!c && c.checkVisibility(), titulo: (document.getElementById("grabacion-cine-pregunta-titulo") || {}).textContent,
      texto: c ? c.innerText : "", foco: document.activeElement && (document.activeElement.id || document.activeElement.dataset.opcion),
      opciones: [...document.querySelectorAll("#grabacion-cine-opciones button")].map((b) => b.textContent.replace(/\s+/g, " ").trim()),
      estado: (document.getElementById("grabacion-cine-pregunta-estado") || {}).textContent };
  });
  const ordenes = () => reproductor(page).evaluate(() => window.__ordenes.slice());
  igual("se pidió a la base lo que ya contestó de esta grabación", await page.evaluate(() => window.__rpc.filter((r) => r.n === "grabacion_pregunta_responder").length), 0);
  igual("la lista de preguntas: una por cada una, con cómo le fue (la 2 ya estaba bien)",
    await page.$$eval("#grabacion-cine-preguntas button", (bs) => bs.slice(0, 3).map((b) => b.lastElementChild.textContent)), ["Sin contestar", "✓ Bien", "Sin contestar"]);
  igual("y arriba lo que lleva", await page.textContent("#grabacion-cine-preguntas-resumen"), "Contestaste 1 de " + g1.preguntas.length + " y acertaste 1. Cuenta la primera vez.");

  // Adelantar por encima de una pregunta no la hace saltar.
  await ponerEn(page, q1.t - 200);
  await ponerEn(page, q1.t + 200);
  igual("si adelanta por encima de una pregunta, no se le atraviesa", (await panel()).ve, false);
  // Verla correr por el segundo de la pregunta sí la detiene.
  await ponerEn(page, q1.t - 2);
  await ponerEn(page, q1.t + 1);
  let p = await panel();
  igual("al pasar el video por su segundo, se detiene (pauseVideo) y sale la pregunta, con el foco en ella",
    [(await ordenes()).slice(-1)[0], p.ve, p.titulo, p.foco], ["pauseVideo:", true, "Pregunta 1 de " + g1.preguntas.length, "grabacion-cine-pregunta-titulo"]);
  cierto("con su texto y sus cuatro opciones, A a D", p.texto.includes(q1.texto) && p.opciones.length === 4 && p.opciones.every((o, i) => o.startsWith("ABCD"[i] + ". " + q1.opciones[i])), JSON.stringify(p.opciones));
  igual("la pregunta va debajo del video", await page.evaluate(() =>
    document.getElementById("grabacion-cine-pregunta").getBoundingClientRect().top >= document.getElementById("grabacion-cine-video").getBoundingClientRect().bottom - 1), true);
  const cP = [await page.evaluate(contrasteEnPagina, "#grabacion-cine-pregunta-titulo"), await page.evaluate(contrasteEnPagina, "#grabacion-cine-pregunta p:nth-of-type(2)"),
    await page.evaluate(contrasteEnPagina, '#grabacion-cine-opciones button[data-opcion="0"]')];
  // Contesta mal: la que no es.
  const mala = (correctas[1] + 1) % 4;
  await page.click(`#grabacion-cine-opciones button[data-opcion="${mala}"]`);
  await page.waitForTimeout(250);
  p = await panel();
  igual("contestar llama a la base con la pregunta y la opción", await page.evaluate(() => window.__rpc.filter((r) => r.n === "grabacion_pregunta_responder").map((r) => [r.args.p_horario, r.args.p_n, r.args.p_opcion])),
    [["p1", 1, mala]]);
  cierto("dice que no era esa y cuál era, con la fuente: " + p.estado, p.estado.startsWith("✗ No era esa. La correcta es la " + "ABCD"[correctas[1]] + ": " + q1.opciones[correctas[1]] + ".") && p.estado.includes("Fuente: " + q1.fuente));
  igual("marca la correcta y la suya, escrito (no solo de color)", [p.opciones[correctas[1]].endsWith("✓ Correcta"), p.opciones[mala].endsWith("✗ Tu respuesta")], [true, true]);
  igual("y el foco va a «Seguir viendo»", p.foco, "grabacion-cine-pregunta-seguir");
  cP.push(await page.evaluate(contrasteEnPagina, "#grabacion-cine-pregunta-estado"), await page.evaluate(contrasteEnPagina, `#grabacion-cine-opciones button[data-opcion="${correctas[1]}"] > span:last-child`));
  cierto("contraste de la pregunta ≥ 4,5: " + cP.join(", "), cP.every((v) => v >= 4.5));
  igual("la lista lo dice", await page.$eval('#grabacion-cine-preguntas button[data-pregunta="1"]', (b) => b.lastElementChild.textContent), "✗ No");
  await page.click("#grabacion-cine-pregunta-seguir");
  await page.waitForTimeout(200);
  igual("«Seguir viendo» lo pone a correr y quita la pregunta", [(await ordenes()).slice(-1)[0], (await panel()).ve], ["playVideo:", false]);
  // La 2 ya estaba contestada: pasar por ella no lo detiene.
  await ponerEn(page, q2.t - 2);
  await ponerEn(page, q2.t + 1);
  igual("una pregunta que ya contestó no lo vuelve a detener", (await panel()).ve, false);

  // Desde la lista: la vuelve a abrir y le muestra cómo le fue; contestar otra cosa no cambia la nota.
  await page.click('#grabacion-cine-preguntas button[data-pregunta="1"]');
  await page.waitForTimeout(300);
  p = await panel();
  cierto("desde la lista se abre con lo que contestó la primera vez", p.ve && p.estado.startsWith("✗ No era esa"), p.estado);
  igual("y lleva el video a su segundo, detenido", (await ordenes()).slice(-3), ["seekTo:" + q1.t + ",true", "playVideo:", "pauseVideo:"]);

  // La pregunta con posición: el diagrama y la posición escrita.
  if (qFen) {
    await page.click(`#grabacion-cine-preguntas button[data-pregunta="${qFen.n}"]`);
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => ({ casillas: document.querySelectorAll("#grabacion-cine-pregunta .cine-sq").length,
      piezas: document.querySelectorAll("#grabacion-cine-pregunta .cine-sq > span").length,
      escrita: [...document.querySelectorAll("#grabacion-cine-pregunta .sr-only")].map((e) => e.textContent).join(" ") }));
    const piezas = qFen.fen.split(" ")[0].replace(/[^a-zA-Z]/g, "").length;
    igual("una pregunta con posición la dibuja (64 casillas, sus piezas) y la dice escrita para quien no la ve",
      [t.casillas, t.piezas, t.escrita.startsWith("La posición: Blancas: ")], [64, piezas, true]);
  }

  // Sin red al contestar: lo dice y deja volver a intentar.
  await page.evaluate(() => { window.sb.rpc = () => ({ then: (res) => Promise.resolve({ data: null, error: { message: "sin red" } }).then(res) }); });
  await page.click('#grabacion-cine-preguntas button[data-pregunta="3"]');
  await page.waitForTimeout(250);
  await page.click('#grabacion-cine-opciones button[data-opcion="0"]');
  await page.waitForTimeout(250);
  p = await panel();
  igual("sin red: lo dice y las opciones se pueden volver a tocar", [p.estado, await page.$$eval("#grabacion-cine-opciones button", (bs) => bs.every((b) => !b.disabled))],
    ["No se pudo revisar tu respuesta. Revisa tu conexión e inténtalo otra vez.", true]);
  await page.setViewportSize({ width: 390, height: 850 });
  await page.waitForTimeout(250);
  igual("en el celular la pregunta cabe y no se desborda", await page.evaluate(() => {
    const d = document.getElementById("grabacion-cine"), c = document.getElementById("grabacion-cine-pregunta").getBoundingClientRect();
    return [c.width > 0, c.right <= window.innerWidth + 1, d.scrollWidth <= d.clientWidth + 1];
  }), [true, true, true]);
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await cerrar();

  console.log("\n=== Quien administra o el profe prueba la pregunta ===");
  const adm = await abrir(browser, lista, { extra: { correctas, anotada: false } });
  await abrirCine(adm.page, "Sesión I");
  await adm.page.click('#grabacion-cine-preguntas button[data-pregunta="1"]');
  await adm.page.waitForTimeout(250);
  await adm.page.click(`#grabacion-cine-opciones button[data-opcion="${correctas[1]}"]`);
  await adm.page.waitForTimeout(250);
  const e2 = await adm.page.textContent("#grabacion-cine-pregunta-estado");
  cierto("le dice que estuvo bien y que no se guarda: " + e2, e2.startsWith("✓ ¡Bien!") && e2.includes("Como no eres del taller, tu respuesta no se guarda."));
  igual("y la lista no la cuenta como contestada", await adm.page.$eval('#grabacion-cine-preguntas button[data-pregunta="1"]', (b) => b.lastElementChild.textContent), "Sin contestar");
  await adm.cerrar();

  console.log("\n=== Si no se puede leer lo que ya contestó ===");
  const sin = await abrir(browser, lista, { extra: { correctas, fallan: ["grabacion_respuestas"] } });
  await abrirCine(sin.page, "Sesión I");
  igual("no salen preguntas (no se le preguntaría otra vez lo ya contestado), y lo demás sí",
    [await sin.page.$$eval("#grabacion-cine-preguntas", (x) => x.length), await sin.page.$$eval("#grabacion-cine-capitulos button", (x) => x.length > 0)], [0, true]);
  await ponerEn(sin.page, q1.t - 2);
  await ponerEn(sin.page, q1.t + 1);
  igual("y el video no se detiene", await sin.page.$eval("#grabacion-cine-pregunta", (c) => c.hidden), true);
  cierto("sin errores en la página", sin.errores.length === 0, sin.errores.join(" | "));
  await sin.cerrar();
}

(async () => {
  pruebaArchivos();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaCine(browser);
    await pruebaPreguntas(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e.stack || e));
    fallos += 1;
  }
  await browser.close();
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo en orden.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
