/* El panel de taller: en una academia con panel de taller (el taller del MEP),
 * el alumno ve el calendario de clases en lugar de «Hoy te toca» y de la
 * invitación al diagnóstico.
 *
 * Lo que se rompe acá se rompe callado:
 *
 *  - «Hoy te toca» vuelve a salir (o el calendario no sale) y el asesor ve
 *    metas de ejercicios que no son para él, sin ningún error.
 *  - El calendario sale en el panel de todos los alumnos, o «Hoy te toca»
 *    desaparece para quien no es de un taller.
 *  - Una sesión que ya pasó sigue en la lista, la hora se lee mal («12:00 p. m.»
 *    en lugar de «12:00 m. d.», «a. m..») o se parte a la mitad en el celular.
 *  - Lo que pide el profe (una tarea) deja de salir junto con el diagnóstico.
 *  - «Entrar a la sesión» del renglón de hoy lleva al tablero sin clase
 *    abierta (una pantalla vacía), o no se destapa cuando el profe la abre;
 *    o sale en las sesiones de otro día.
 *  - Cualquiera enciende el panel de taller desde la consola: solo la función
 *    lo cambia, y solo para quien administra o supervisa esa academia.
 *  - La grabación de una sesión no sale, sale para quien no es de esa clase
 *    (el id del video no listado es la llave), carga YouTube aunque nadie la
 *    pida, o sigue sonando escondida después de cerrarla.
 *
 * Lo de la base se mira leyendo supabase/ (sin red ni base); se comprobó además
 * impersonando roles en SQL (ver «El panel de taller» y «Las grabaciones de
 * las sesiones» en docs/decisiones/paneles.md). En el navegador se abre clases.html con el doble.
 * La casilla de academias.html la prueba verificar-academias.js.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-panel-taller.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

/* ==================================================================
   1. Sin navegador: la base y las páginas
   ================================================================== */
function pruebaBase() {
  console.log("=== La base (supabase/migraciones) ===");
  const dir = path.join(RAIZ, "supabase", "migraciones");
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  cierto("academias.panel_taller arranca apagado",
    /alter\s+table\s+public\.academias\s+add\s+column\s+panel_taller\s+boolean\s+not\s+null\s+default\s+false/i.test(sql));
  cierto("mi_panel_taller() contesta solo sobre quien pregunta, con auth.uid() envuelto",
    /function\s+public\.mi_panel_taller\(\)[\s\S]{0,400}security\s+definer[\s\S]{0,400}am\.persona_id\s*=\s*\(select\s+auth\.uid\(\)\)/i.test(sql));
  cierto("y se le quita el execute a public y anon",
    /revoke\s+execute\s+on\s+function\s+public\.mi_panel_taller\(\)\s+from\s+public,\s*anon/i.test(sql));
  cierto("academia_panel_taller() exige administrar o supervisar esa academia, con coalesce",
    /academia_panel_taller[\s\S]{0,600}if\s+not\s+coalesce\(\s*public\.soy_admin\(\)\s+or\s+public\.supervisa_academia\(p_id\)\s*,\s*false\s*\)/i.test(sql));
  cierto("y se le quita el execute a public y anon",
    /revoke\s+execute\s+on\s+function\s+public\.academia_panel_taller\(uuid,\s*boolean\)\s+from\s+public,\s*anon/i.test(sql));

  console.log("\n=== Las grabaciones (supabase/migraciones) ===");
  cierto("grabaciones_clase es de una ocurrencia (horario + fecha), con el id del video validado",
    /create\s+table\s+public\.grabaciones_clase[\s\S]{0,400}youtube_id\s+text\s+not\s+null\s+check\s+\(youtube_id\s+~\s+'\^\[A-Za-z0-9_-\]\{11\}\$'\)[\s\S]{0,300}primary\s+key\s+\(horario_id,\s*fecha\)/i.test(sql));
  cierto("la tabla no tiene política de escritura: la escribe la función",
    !/create\s+policy\s+\w+\s+on\s+public\.grabaciones_clase\s+for\s+(insert|update|delete|all)/i.test(sql));
  cierto("mis_grabaciones() le da al alumno solo las de sus clases, con auth.uid() envuelto",
    /function\s+public\.mis_grabaciones\(\)[\s\S]{0,900}interno\.horarios_del_alumno\(\(select\s+auth\.uid\(\)\)\)/i.test(sql));
  cierto("la regla de «a quién le toca esta clase» está una sola vez: mis_clases_proximas() y mi_proxima_clase() también la usan",
    ["mis_clases_proximas", "mi_proxima_clase"].every((f) => {
      const ultima = sql.lastIndexOf("function public." + f + "(");
      return ultima > 0 && /interno\.horarios_del_alumno\(/.test(sql.slice(ultima, ultima + 1500));
    }));
  cierto("grabacion_clase_poner() exige ser el profe de esa clase o administrar, con coalesce",
    /grabacion_clase_poner[\s\S]{0,700}if\s+not\s+coalesce\(\s*public\.soy_admin\(\)\s+or\s+\(v_profesor\s+is\s+not\s+null\s+and\s+v_profesor\s+=\s+\(select\s+auth\.uid\(\)\)\)\s*,\s*false\s*\)/i.test(sql));
  cierto("a las dos se les quita el execute a public y anon",
    /revoke\s+execute\s+on\s+function\s+public\.mis_grabaciones\(\)\s+from\s+public,\s*anon/i.test(sql)
    && /revoke\s+execute\s+on\s+function\s+public\.grabacion_clase_poner\(uuid,\s*date,\s*text,\s*text,\s*integer\)\s+from\s+public,\s*anon/i.test(sql));
  cierto("la grabación lleva su tema y su duración, y mis_grabaciones() los devuelve",
    /add\s+column\s+tema\s+text[\s\S]{0,200}add\s+column\s+duracion_seg\s+integer/i.test(sql)
    && /function\s+public\.mis_grabaciones\(\)\s+returns\s+table\([^)]*tema\s+text,\s*duracion_seg\s+integer\)/i.test(sql));
  cierto("las dos funciones viejas quedaron apartadas y sin permiso para nadie",
    /revoke\s+execute\s+on\s+function\s+public\.mis_grabaciones_apartada\(\)\s+from\s+public,\s*anon,\s*authenticated/i.test(sql)
    && /revoke\s+execute\s+on\s+function\s+public\.grabacion_clase_poner_apartada\(uuid,\s*date,\s*text\)\s+from\s+public,\s*anon,\s*authenticated/i.test(sql));
  cierto("y interno.horarios_del_alumno() no se le abre a nadie",
    /revoke\s+execute\s+on\s+function\s+interno\.horarios_del_alumno\(uuid\)\s+from\s+public,\s*anon,\s*authenticated/i.test(sql));

  console.log("\n=== Las páginas ===");
  const html = fs.readFileSync(path.join(RAIZ, "clases.html"), "utf8");
  const cal = html.search(/<section id="calendario-taller" hidden/);
  const hoy = html.search(/<div id="progreso-alumno"/);
  cierto("clases.html tiene la tarjeta del calendario, escondida hasta saber si es un taller", cal > 0);
  cierto("y va en el lugar de «Hoy te toca»", cal > 0 && hoy > 0 && cal < hoy);
  const sCal = html.indexOf('<script src="js/calendario-taller.js"'), sClases = html.indexOf('<script src="js/clases.js"');
  cierto("carga js/calendario-taller.js antes de js/clases.js", sCal > 0 && sClases > 0 && sCal < sClases);
  const acad = fs.readFileSync(path.join(RAIZ, "academias.html"), "utf8");
  cierto("academias.html tiene la casilla del panel de taller", /<input id="panel-taller" type="checkbox"/.test(acad));
}

/* ==================================================================
   2. En un navegador
   ================================================================== */
function clienteFalso(cfg) {
  return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
window.__rpc = [];
(function () {
  const CFG = ${JSON.stringify(cfg)};
  const TABLAS = CFG.tablas || {};
  function b(filas, error) {
    let datos = Array.isArray(filas) ? filas.slice() : filas, unica = false;
    const q = {
      select() { return q; },
      eq(c, v) { if (Array.isArray(datos)) datos = datos.filter((f) => String(f[c]) === String(v)); return q; },
      in(c, vs) { if (Array.isArray(datos)) datos = datos.filter((f) => vs.map(String).includes(String(f[c]))); return q; },
      order() { return q; }, limit() { return q; }, gte() { return q; }, lte() { return q; }, or() { return q; }, neq() { return q; },
      is() { return q; }, not() { return q; }, ilike() { return q; }, gt() { return q; }, lt() { return q; },
      range(a, z) { if (Array.isArray(datos)) datos = datos.slice(a, z + 1); return q; },
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
    from: (t) => b(TABLAS[t] || []),
    rpc: (n, args) => {
      window.__rpc.push({ n: n, args: args || null });
      if ((CFG.fallan || []).includes(n)) return b(null, "falló " + n);
      const r = (CFG.rpc || {})[n];
      return b(r === undefined ? null : r);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

async function abrir(browser, cfg, ancho) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho || 1200, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg) }));
  await page.goto(BASE + "/clases.html", { waitUntil: "networkidle" });
  // El panel se destapa cuando llegan sus partes; la tarjeta, cuando contesta la base.
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "mi_panel_taller"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  return { page, errores, cerrar: () => ctx.close() };
}
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);
const llamadas = (page, n) => page.evaluate((x) => window.__rpc.filter((r) => r.n === x).map((r) => r.args), n);

/* Las sesiones van RELATIVAS a hoy (Costa Rica es siempre UTC−6): el
   verificador corre también el año que viene. */
const HORA = 3600000, DIA = 24 * HORA;
const diaCR = (msDesdeHoy) => new Date(Date.now() - 6 * HORA + msDesdeHoy).toISOString().slice(0, 10);
const enCR = (dia, hhmm) => new Date(dia + "T" + hhmm + ":00-06:00").toISOString();
function sesiones() {
  const ahora = Date.now();
  const d3 = diaCR(3 * DIA), d10 = diaCR(10 * DIA), d20 = diaCR(20 * DIA);
  return [
    { horario_id: "h0", titulo: "Sesión que ya pasó", modalidad: "en_linea", profesor: "Campeones",
      inicio: new Date(ahora - 4 * HORA).toISOString(), fin: new Date(ahora - HORA).toISOString() },
    { horario_id: "h1", titulo: "Sesión I", modalidad: "en_linea", profesor: "Campeones",
      inicio: new Date(ahora - 30 * 60000).toISOString(), fin: new Date(ahora + 90 * 60000).toISOString() },
    { horario_id: "h2", titulo: "Sesión II", modalidad: "en_linea", profesor: "Campeones", inicio: enCR(d3, "08:00"), fin: enCR(d3, "12:00") },
    { horario_id: "h3", titulo: "Sesión III", modalidad: "en_linea", profesor: "Campeones", inicio: enCR(d10, "08:00"), fin: enCR(d10, "11:00") },
    { horario_id: "h4", titulo: "Sesión presencial de cierre", modalidad: "presencial", profesor: "Campeones", inicio: enCR(d20, "07:00"), fin: enCR(d20, "15:00") },
  ];
}

const YO = "u-asesor";
function cfg({ taller = true, tareas = [], fallan = [], abierta = false, videollamada = null, grabaciones } = {}) {
  const c = {
    yo: YO,
    tablas: { profiles: [{ id: YO, full_name: "Asesora de prueba · Cartago", role: "alumno", is_admin: false, grupo: "MEP" }] },
    rpc: {
      mi_acceso: { vigente: true, motivo: "temporal", exigido: false, vence: "2030-12-20T06:00:00+00:00", detalle: "Taller", dias: 70 },
      mi_panel_taller: taller,
      mis_clases_proximas: sesiones(),
      mis_clases: [{ profesor_id: "u-profe", profesor: "Campeones", es_principal: true, clase_abierta: abierta, titulo_clase: null, videollamada }],
      tareas_con_avance: tareas,
      examenes_con_nota: [],
    },
    fallan,
  };
  if (grabaciones) c.rpc.mis_grabaciones = grabaciones;
  return c;
}

/* El contraste WCAG del texto contra el primer fondo opaco hacia arriba. Se
   corre dentro de la página. */
function contrasteEnPagina(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  let fondo = null;
  for (let n = el; n; n = n.parentElement) {
    const c = rgb(getComputedStyle(n).backgroundColor);
    if (c.length >= 3 && (c.length === 3 || c[3] === 1)) { fondo = c; break; }
  }
  if (!fondo) fondo = [255, 255, 255];
  const [a, b] = [lum(rgb(getComputedStyle(el).color)), lum(fondo)].sort((x, y) => y - x);
  return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
}

/* La grabación de la sesión que ya pasó (una fila de mis_grabaciones()) y una
   con un id que no es de YouTube, que no se pinta. */
const VIDEO = "3FzX3ksWwro";
function grabaciones() {
  const ayer = diaCR(-DIA);
  return [
    { horario_id: "h0", fecha: ayer, titulo: "<i>Sesión</i> II", modalidad: "en_linea", youtube_id: VIDEO, inicio: enCR(ayer, "08:00"), fin: enCR(ayer, "12:00"),
      tema: "Encuadre y reglas básicas", duracion_seg: 11520 },
    { horario_id: "hx", fecha: ayer, titulo: "Con un id roto", modalidad: "en_linea", youtube_id: "javascript:x", inicio: enCR(ayer, "08:00"), fin: enCR(ayer, "12:00") },
  ];
}

async function pruebaTaller(browser) {
  console.log("\n=== Una asesora de una academia con panel de taller ===");
  const { page, errores, cerrar } = await abrir(browser, cfg());
  igual("«Hoy te toca» no se ve", await vis(page, "#progreso-alumno"), false);
  igual("el calendario de clases sí", await vis(page, "#calendario-taller"), true);
  igual("las sesiones se piden para 90 días", (await llamadas(page, "mis_clases_proximas"))[0], { p_dias: 90 });
  // Sin el ícono del principio (💻, 🏫) y con los espacios del navegador («p. m.» lleva uno que no corta) parejos.
  const filas = await page.$$eval("#calendario-taller li", (ls) => ls.map((l) => l.innerText.replace(/\s+/g, " ").replace(/^[^\p{L}]+/u, "").trim()));
  igual("la que ya pasó no está: quedan 4", filas.length, 4);
  cierto("la que pasa ahora dice «Ahora»", /^Sesión I Ahora /.test(filas[0] || ""), filas[0]);
  cierto("el día va sin coma y con mayúscula, y el mediodía es «12:00 m. d.»",
    /^Sesión II [A-ZÁÉÍÓÚ][a-záéíóú]+ \d{1,2} de [a-z]+ · 8:00 a\. m\. a 12:00 m\. d\. En línea$/.test(filas[1] || ""), filas[1]);
  cierto("la presencial lo dice", /^Sesión presencial de cierre .* 7:00 a\. m\. a 3:00 p\. m\. Presencial$/.test(filas[3] || ""), filas[3]);
  igual("el subtítulo dice la sesión de ahora, con un solo punto al final",
    await page.$eval("#panel-subtitulo", (p) => p.textContent.trim()).then((t) => /^Tu sesión es ahora, hasta las \d{1,2}:\d{2}\s[ap]\.\sm\.$/.test(t) ? "bien" : t), "bien");
  igual("y no invita a hacer el diagnóstico", await page.evaluate(() => {
    const f = document.getElementById("pendientes-aviso");
    return f.checkVisibility() ? f.innerText.replace(/\s+/g, " ").slice(0, 80) : "no se ve";
  }), "no se ve");

  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#calendario-taller-bajar")]);
  const ics = fs.readFileSync(await descarga.path(), "utf8");
  cierto("«Agregar a mi calendario» baja las sesiones en un .ics", /BEGIN:VCALENDAR/.test(ics) && /SUMMARY:.*Sesión presencial de cierre/.test(ics));
  igual("y las pide para 90 días", (await llamadas(page, "mis_clases_proximas")).slice(-1)[0], { p_dias: 90 });
  const entrada = await page.$$eval("#calendario-taller li", (ls) => ls.map((l) => [...l.querySelectorAll("[data-entrar]")].map((e) => e.dataset.entrar + (e.getAttribute("href") ? ":" + e.getAttribute("href") : ""))));
  igual("sin clase abierta, la sesión de ahora dice el candado (sin enlace) y las otras no llevan nada", entrada, [["apagado"], [], [], []]);
  igual("y el candado se alcanza con Tab y se anuncia apagado",
    await page.$eval("[data-entrar=apagado]", (e) => [e.tabIndex, e.getAttribute("aria-disabled"), /se abre cuando tu profe empiece la clase/.test(e.textContent)]), [0, "true", true]);
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await cerrar();

  console.log("\n=== Con la clase abierta ===");
  let abierta = await abrir(browser, cfg({ abierta: true, videollamada: "https://meet.google.com/abc-defg-hij" }));
  const enlaces = await abierta.page.$$eval("#calendario-taller li:first-child [data-entrar]", (es) => es.map((e) => [e.dataset.entrar, e.getAttribute("href"), e.target || "", e.checkVisibility()]));
  igual("la sesión de ahora lleva «Entrar a la sesión» y la videollamada, a la vista",
    enlaces, [["sesion", "sesion.html", "", true], ["videollamada", "https://meet.google.com/abc-defg-hij", "_blank", true]]);
  igual("el botón dice lo que hace", await abierta.page.$eval("[data-entrar=sesion]", (e) => e.textContent), "Entrar a la sesión →");
  igual("la videollamada dice el servicio, reconocido por el dominio del enlace",
    await abierta.page.$eval("[data-entrar=videollamada]", (e) => e.textContent.replace(/^\S+\s/, "")), "Entrar a Meet");
  cierto("sin errores en la página", abierta.errores.length === 0, abierta.errores.join(" | "));
  await abierta.cerrar();
  for (const [enlace, nombre] of [["https://us02web.zoom.us/j/123", "Entrar a Zoom"], ["https://teams.microsoft.com/l/meetup-join/x", "Entrar a Teams"],
      ["https://meet.jit.si/clase", "Entrar a Jitsi"], ["https://otra.example.com/sala", "Entrar a la videollamada"],
      ["http://meet.google.com/sin-https", "sin botón"]]) {
    const otra = await abrir(browser, cfg({ abierta: true, videollamada: enlace }));
    igual("con " + enlace.split("/").slice(0, 3).join("/") + (nombre === "sin botón" ? " (sin https) no sale" : " dice «" + nombre + "»"),
      await otra.page.$eval("[data-entrar=videollamada]", (e) => e.textContent.replace(/^\S+\s/, "")).catch(() => "sin botón"), nombre);
    await otra.cerrar();
  }
  abierta = await abrir(browser, cfg({ abierta: true, videollamada: "https://meet.google.com/abc-defg-hij" }));
  igual("las otras sesiones no llevan botón", await abierta.page.$$eval("#calendario-taller li:not(:first-child) [data-entrar]", (es) => es.length), 0);
  igual("en el celular no se desborda", await abierta.page.setViewportSize({ width: 390, height: 900 }).then(() => abierta.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), false);
  cierto("sin errores en la página", abierta.errores.length === 0, abierta.errores.join(" | "));
  await abierta.cerrar();

  console.log("\n=== En el celular ===");
  const cel = await abrir(browser, cfg(), 390);
  igual("no hay desborde a lo ancho", await cel.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  igual("la hora de cada sesión va junta, en un solo renglón (renglones con la hora junta, partidas)",
    await cel.page.$$eval("#calendario-taller li", (ls) => {
      const horas = ls.map((l) => [...l.querySelectorAll("span")].find((e) => /a\.\sm\.|p\.\sm\.|m\.\sd\./.test(e.textContent) && getComputedStyle(e).whiteSpace === "nowrap"));
      return [horas.filter(Boolean).length, horas.filter((e) => e && e.getClientRects().length !== 1).length];
    }), [4, 0]);
  await cel.cerrar();

  console.log("\n=== Lo que le pide su profe sigue saliendo ===");
  const tarea = { id: "t1", alumno_id: YO, situacion: "pendiente", titulo: "Leer el reglamento de la FIDE",
    vence_at: new Date(Date.now() + 2 * DIA).toISOString(), renglones: 1, cumplidos: 0 };
  const conTarea = await abrir(browser, cfg({ tareas: [tarea] }));
  igual("la franja de pendientes nombra su tarea", await conTarea.page.evaluate(() => {
    const f = document.getElementById("pendientes-aviso");
    return f.checkVisibility() && /Leer el reglamento de la FIDE/.test(f.innerText);
  }), true);
  await conTarea.cerrar();
}

async function pruebaGrabaciones(browser) {
  console.log("\n=== Las grabaciones de las sesiones ===");
  const { page, errores, cerrar } = await abrirConYoutube(browser, cfg({ grabaciones: grabaciones() }));
  igual("se piden una vez", (await llamadas(page, "mis_grabaciones")).length, 1);
  igual("la sección se ve, con su título", await page.evaluate(() => {
    const s = document.querySelector('#calendario-taller section[aria-labelledby="grabaciones-taller-titulo"]');
    return s && s.checkVisibility() ? document.getElementById("grabaciones-taller-titulo").textContent.replace(/^\S+\s/, "") : "no se ve";
  }), "Grabaciones de las sesiones");
  igual("sale la buena y no la del id roto", await page.$$eval("[data-grabacion]", (bs) => bs.map((b) => b.dataset.grabacion)), [VIDEO]);
  const tarjeta = await page.$eval("[data-grabacion]", (b) => ({
    titulo: b.querySelector(".font-semibold").textContent, comoHtml: !!b.querySelector("i"),
    texto: b.innerText.replace(/\s+/g, " ").trim(), nombre: b.textContent.replace(/\s+/g, " ").trim(),
    numero: (b.querySelector('[aria-hidden="true"].font-serif') || {}).textContent, reloj: [...b.querySelectorAll('[aria-hidden="true"]')].map((e) => e.textContent).find((t) => /^\d+:\d\d/.test(t)),
    abre: b.getAttribute("aria-haspopup") }));
  igual("el título que escribió el profe va como texto", [tarjeta.titulo, tarjeta.comoHtml], ["<i>Sesión</i> II", false]);
  cierto("la tarjeta dice el tema, el día y la duración escrita", /Encuadre y reglas básicas .*\d{1,2} de [a-z]+ · 3 h 12 min$/.test(tarjeta.texto), tarjeta.texto);
  igual("y el lector de pantalla oye qué hace (sin el número ni el reloj de la miniatura)",
    await page.getByRole("button", { name: /^Ver la grabación: <i>Sesión<\/i> II Encuadre y reglas básicas .* · 3 h 12 min$/ }).count(), 1);
  igual("la miniatura lleva el número de la sesión y la duración como en YouTube", [tarjeta.numero, tarjeta.reloj], ["II", "3:12:00"]);
  igual("y avisa que abre una ventana", tarjeta.abre, "dialog");
  const proxima = await page.$eval("[data-grabacion-proxima]", (t) => [t.tabIndex, t.getAttribute("aria-disabled"), !t.getAttribute("href"), /Su grabación sale después de la clase/.test(t.innerText)]).catch(() => "no está");
  igual("la próxima sesión va en gris: apagada, sin enlace, alcanzable con Tab y lo dice", proxima, [0, "true", true, true]);
  igual("las sesiones que vienen siguen arriba, completas", await page.$$eval('#calendario-taller ol[aria-label="Sesiones que vienen"] > li', (ls) => ls.length), 4);
  igual("cerrada: no hay reproductor ni ventana abierta", await page.evaluate(() => [document.querySelectorAll("iframe").length, !!document.querySelector("#grabacion-cine[open]")]), [0, false]);
  igual("y YouTube no se carga hasta que alguien la pide", page.__youtube.length, 0);

  await page.click("[data-grabacion]");
  await page.waitForTimeout(300);
  const cine = await page.evaluate(() => {
    const d = document.getElementById("grabacion-cine"), v = d && d.querySelector("iframe"), a = d && d.querySelector("#grabacion-cine-youtube");
    return { abierta: !!d && d.open && d.checkVisibility(), modal: !!d && d.matches(":modal"), titulo: d && document.getElementById("grabacion-cine-titulo").textContent,
      nombrada: d && d.getAttribute("aria-labelledby"), src: v && v.src, vtitulo: v && v.title, completa: v && v.allowFullscreen,
      seVe: !!v && v.checkVisibility() && v.getBoundingClientRect().height > 250, afuera: a && [a.href, a.target, a.rel],
      foco: document.activeElement && document.activeElement.id };
  });
  igual("al tocarla se abre en grande, como ventana sobre la página", [cine.abierta, cine.modal, cine.nombrada], [true, true, "grabacion-cine-titulo"]);
  igual("con la sesión y su tema de título", cine.titulo, "<i>Sesión</i> II · Encuadre y reglas básicas");
  igual("el reproductor es el de youtube-nocookie (el que deja la CSP) y arranca solo", cine.src, "https://www.youtube-nocookie.com/embed/" + VIDEO + "?rel=0&autoplay=1");
  igual("con título para el lector de pantalla y pantalla completa", [cine.vtitulo, cine.completa], ["Grabación de la <i>Sesión</i> II", true]);
  igual("y se ve de verdad, grande", cine.seVe, true);
  igual("«Abrir en YouTube» va aparte, en otra pestaña", cine.afuera, ["https://youtu.be/" + VIDEO, "_blank", "noopener noreferrer"]);
  igual("el foco queda en «Cerrar»", cine.foco, "grabacion-cine-cerrar");
  igual("ahora sí se pidió el video", page.__youtube.length, 1);
  await page.click("#grabacion-cine-cerrar");
  await page.waitForTimeout(200);
  igual("«Cerrar» la cierra, quita el reproductor y devuelve el foco a la tarjeta", await page.evaluate(() =>
    [document.getElementById("grabacion-cine").open, document.querySelectorAll("iframe").length, !!document.activeElement && document.activeElement.hasAttribute("data-grabacion")]), [false, 0, true]);
  await page.click("[data-grabacion]");
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  igual("con Esc también, y no sigue sonando escondida", await page.evaluate(() => [document.getElementById("grabacion-cine").open, document.querySelectorAll("iframe").length]), [false, 0]);

  const medir = async () => [await page.evaluate(contrasteEnPagina, "[data-grabacion] .font-semibold"),
    await page.evaluate(contrasteEnPagina, "[data-grabacion] .text-sm"),
    await page.evaluate(contrasteEnPagina, "[data-grabacion] span.mt-1"),
    await page.evaluate(contrasteEnPagina, "[data-grabacion-proxima] .text-sm")];
  const claro = await medir();
  cierto(`contraste del texto de las tarjetas ≥ 4,5 (${claro.join(", ")})`, claro.every((c) => c >= 4.5));
  // La tarjeta anima el color al cambiar de tema: se mide cuando terminó.
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(600);
  const oscuro = await medir();
  cierto(`en modo oscuro también (${oscuro.join(", ")})`, oscuro.every((c) => c >= 4.5));
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.click("[data-grabacion]");
  await page.waitForTimeout(200);
  const cineC = [await page.evaluate(contrasteEnPagina, "#grabacion-cine-titulo"), await page.evaluate(contrasteEnPagina, "#grabacion-cine-youtube")];
  cierto(`contraste del modo cine ≥ 4,5 (${cineC.join(", ")})`, cineC.every((c) => c >= 4.5));
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(200);
  igual("en el celular las tarjetas van una debajo de otra y la página no se desborda", await page.evaluate(() => {
    const ts = [...document.querySelectorAll("[data-grabacion], [data-grabacion-proxima]")].map((t) => t.getBoundingClientRect());
    return [ts.length === 2 && ts[1].top >= ts[0].bottom, document.documentElement.scrollWidth > window.innerWidth];
  }), [true, false]);
  await page.click("[data-grabacion]");
  await page.waitForTimeout(300);
  igual("y el modo cine cabe en la pantalla", await page.evaluate(() => {
    const v = document.querySelector("#grabacion-cine iframe").getBoundingClientRect();
    return [v.left >= 0 && v.right <= window.innerWidth, document.documentElement.scrollWidth > window.innerWidth];
  }), [true, false]);
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await cerrar();

  console.log("\n=== Si la base no da las grabaciones ===");
  const sinGrab = await abrir(browser, cfg({ grabaciones: grabaciones(), fallan: ["mis_grabaciones"] }));
  igual("el calendario sale igual, sin la sección", [await vis(sinGrab.page, "#calendario-taller"),
    await sinGrab.page.$$eval('#calendario-taller ol[aria-label="Sesiones que vienen"] > li', (ls) => ls.length),
    await sinGrab.page.$$eval("[data-grabacion]", (bs) => bs.length)], [true, 4, 0]);
  cierto("sin errores en la página", sinGrab.errores.length === 0, sinGrab.errores.join(" | "));
  await sinGrab.cerrar();
}

/* Igual que abrir(), pero contesta lo de YouTube (el CI no sale a internet) y
   anota cada pedido, para saber si se cargó sin que nadie lo pidiera. */
async function abrirConYoutube(browser, c) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  page.__youtube = [];
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route(/youtube/, (r) => { page.__youtube.push(r.request().url()); return r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<body>video</body>" }); });
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(c) }));
  await page.goto(BASE + "/clases.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "mi_panel_taller"), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  return { page, errores, cerrar: () => ctx.close() };
}

async function pruebaSinTaller(browser) {
  console.log("\n=== Un alumno de una academia sin panel de taller ===");
  const { page, errores, cerrar } = await abrir(browser, cfg({ taller: false }));
  igual("ve «Hoy te toca»", await vis(page, "#progreso-alumno"), true);
  igual("no ve el calendario", await vis(page, "#calendario-taller"), false);
  igual("ni se le piden las sesiones de 90 días", (await llamadas(page, "mis_clases_proximas")).filter((a) => a && a.p_dias === 90).length, 0);
  igual("ni las grabaciones", (await llamadas(page, "mis_grabaciones")).length, 0);
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await cerrar();

  console.log("\n=== Si la base no contesta si es un taller ===");
  const caida = await abrir(browser, cfg({ fallan: ["mi_panel_taller"] }));
  igual("queda el panel de siempre", [await vis(caida.page, "#progreso-alumno"), await vis(caida.page, "#calendario-taller")], [true, false]);
  await caida.cerrar();
}

async function pruebaTarjeta(browser) {
  console.log("\n=== La tarjeta sola (CalendarioTaller.pintar) ===");
  const { page, cerrar } = await abrir(browser, cfg({ taller: false }));
  const r = await page.evaluate(() => {
    const caja = document.createElement("section");
    document.body.appendChild(caja);
    const s = (titulo, inicio, fin, modalidad) => ({ titulo, inicio, fin, modalidad: modalidad || "en_linea" });
    const ahora = new Date("2026-10-12T13:00:00Z");   // 7:00 a. m. del lunes 12 en Costa Rica
    const hoy = CalendarioTaller.pintar(caja, [
      s("<b>Sesión I</b>", "2026-10-12T14:00:00Z", "2026-10-12T18:00:00Z"),
      s("Sesión II", "2026-10-20T14:00:00Z", "2026-10-20T18:00:00Z"),
    ], { ahora });
    const etiquetas = [...caja.querySelectorAll("li")].map((l) => (l.querySelector(".rounded-full") || {}).textContent || "");
    const titulo = caja.querySelector("li .font-semibold").textContent;
    const sinBoton = !caja.querySelector("#calendario-taller-bajar");
    const manana = CalendarioTaller.pintar(caja, [s("Sesión II", "2026-10-20T14:00:00Z", "2026-10-20T18:00:00Z")], { ahora });
    const etiquetaManana = caja.querySelector("li .rounded-full").textContent;
    const abierta = { abierta: true, videollamada: { href: "https://meet.google.com/x", etiqueta: "Entrar a Meet" } };
    CalendarioTaller.pintar(caja, [s("Sesión de cierre", "2026-10-12T14:00:00Z", "2026-10-12T21:00:00Z", "presencial")], { ahora, entrada: abierta });
    const presencial = [...caja.querySelectorAll("[data-entrar]")].map((e) => e.dataset.entrar);
    CalendarioTaller.pintar(caja, [s("Sesión II", "2026-10-20T14:00:00Z", "2026-10-20T18:00:00Z")], { ahora, entrada: abierta });
    const otroDia = caja.querySelectorAll("[data-entrar]").length;
    CalendarioTaller.pintar(caja, [s("Sesión I", "2026-10-12T14:00:00Z", "2026-10-12T18:00:00Z")], { ahora, entrada: null });
    const mientras = caja.querySelector("[data-entrar]").textContent;
    caja.insertAdjacentHTML("beforeend", '<p id="dicho">Listo</p>');
    CalendarioTaller.ponerEntrada(caja, abierta);
    const despues = [[...caja.querySelectorAll("[data-entrar]")].map((e) => e.dataset.entrar), !!caja.querySelector("#dicho")];
    const sinGrab = !caja.querySelector("[data-grabacion]");
    const g = (titulo, youtube_id) => ({ titulo, youtube_id, inicio: "2026-10-05T14:00:00Z", fin: "2026-10-05T18:00:00Z" });
    CalendarioTaller.pintar(caja, [], { ahora, grabaciones: [g("Sesión 0", "3FzX3ksWwro"), g("Rota", "https://evil.example/x"), g("Sin id", null)] });
    const soloGrab = [[...caja.querySelectorAll("[data-grabacion]")].map((b) => b.dataset.grabacion), /No te quedan sesiones/.test(caja.innerText)];
    const vacia = CalendarioTaller.pintar(caja, [], { ahora });
    return { sinGrab, soloGrab, hoy, etiquetas, titulo, sinBoton, manana, etiquetaManana, presencial, otroDia, mientras, despues, vacia, textoVacio: caja.innerText.trim(), filasVacia: caja.querySelectorAll("li").length };
  });
  igual("la sesión de hoy dice «Hoy» y la siguiente no lleva etiqueta", r.etiquetas, ["Hoy", ""]);
  igual("el título que escribió el profe va como texto, no como HTML", r.titulo, "<b>Sesión I</b>");
  igual("sin «alBajar» no hay botón", r.sinBoton, true);
  igual("la primera de otro día dice «Próxima»", r.etiquetaManana, "Próxima");
  igual("en la presencial de hoy, con clase abierta, «Entrar a la sesión» sí y la videollamada no", r.presencial, ["sesion"]);
  igual("una sesión de otro día no lleva botón aunque haya clase abierta", r.otroDia, 0);
  cierto("mientras no se sabe si hay clase, lo dice", /Viendo si hay clase/.test(r.mientras), r.mientras);
  igual("cuando la clase se abre se destapan los botones sin repintar la tarjeta", r.despues, [["sesion", "videollamada"], true]);
  igual("sin sesiones lo dice y no pinta renglones", [r.vacia, r.filasVacia, /No te quedan sesiones/.test(r.textoVacio)], [0, 0, true]);
  igual("sin grabaciones no hay sección de grabaciones", r.sinGrab, true);
  igual("sin sesiones por delante, las grabaciones salen igual (y solo las de un id de YouTube)", r.soloGrab, [["3FzX3ksWwro"], true]);
  await cerrar();
}

(async () => {
  pruebaBase();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaTaller(browser);
    await pruebaGrabaciones(browser);
    await pruebaSinTaller(browser);
    await pruebaTarjeta(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e.stack || e));
    fallos += 1;
  }
  await browser.close();
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo en orden.");
  process.exit(fallos ? 1 : 0);
})();
