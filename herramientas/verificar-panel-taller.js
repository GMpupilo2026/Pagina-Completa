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
 *  - Cualquiera enciende el panel de taller desde la consola: solo la función
 *    lo cambia, y solo para quien administra o supervisa esa academia.
 *
 * Lo de la base se mira leyendo supabase/ (sin red ni base); se comprobó además
 * impersonando roles en SQL (ver «El panel de taller» en
 * docs/decisiones/paneles.md). En el navegador se abre clases.html con el doble.
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
function cfg({ taller = true, tareas = [], fallan = [] } = {}) {
  return {
    yo: YO,
    tablas: { profiles: [{ id: YO, full_name: "Asesora de prueba · Cartago", role: "alumno", is_admin: false, grupo: "MEP" }] },
    rpc: {
      mi_acceso: { vigente: true, motivo: "temporal", exigido: false, vence: "2030-12-20T06:00:00+00:00", detalle: "Taller", dias: 70 },
      mi_panel_taller: taller,
      mis_clases_proximas: sesiones(),
      mis_clases: [{ profesor_id: "u-profe", profesor: "Campeones", es_principal: true, clase_abierta: false, titulo_clase: null, videollamada: null }],
      tareas_con_avance: tareas,
      examenes_con_nota: [],
    },
    fallan,
  };
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
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await cerrar();

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

async function pruebaSinTaller(browser) {
  console.log("\n=== Un alumno de una academia sin panel de taller ===");
  const { page, errores, cerrar } = await abrir(browser, cfg({ taller: false }));
  igual("ve «Hoy te toca»", await vis(page, "#progreso-alumno"), true);
  igual("no ve el calendario", await vis(page, "#calendario-taller"), false);
  igual("ni se le piden las sesiones de 90 días", (await llamadas(page, "mis_clases_proximas")).filter((a) => a && a.p_dias === 90).length, 0);
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
    const vacia = CalendarioTaller.pintar(caja, [], { ahora });
    return { hoy, etiquetas, titulo, sinBoton, manana, etiquetaManana, vacia, textoVacio: caja.innerText.trim(), filasVacia: caja.querySelectorAll("li").length };
  });
  igual("la sesión de hoy dice «Hoy» y la siguiente no lleva etiqueta", r.etiquetas, ["Hoy", ""]);
  igual("el título que escribió el profe va como texto, no como HTML", r.titulo, "<b>Sesión I</b>");
  igual("sin «alBajar» no hay botón", r.sinBoton, true);
  igual("la primera de otro día dice «Próxima»", r.etiquetaManana, "Próxima");
  igual("sin sesiones lo dice y no pinta renglones", [r.vacia, r.filasVacia, /No te quedan sesiones/.test(r.textoVacio)], [0, 0, true]);
  await cerrar();
}

(async () => {
  pruebaBase();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaTaller(browser);
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
