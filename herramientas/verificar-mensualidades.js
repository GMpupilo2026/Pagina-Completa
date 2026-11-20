/* Comprueba los cobros nuevos (versión 2): mensualidades.html y el aviso del
 * alumno apagado en js/acceso-vigente.js.
 *
 * Lo que se rompe acá se rompe callado, y lo descubre una familia:
 *
 *  - Que la página recalcule el estado de una cuenta en vez de pintar el que da
 *    la base: la lista diría «al día» y el alumno estaría fuera (o al revés).
 *  - Que «Registrar pago» mande otro periodo del que se ve: se cobra un mes y
 *    la cuenta queda activa hasta otro día. El «desde» arranca el día después
 *    de «activa hasta» (lo decidió el dueño: se cuenta desde que venció).
 *  - Que «Apagar» o el apagado automático salgan de un solo toque.
 *  - Que una profesora vea los cobros de las familias.
 *  - Que el alumno apagado no vea cuánto pagar ni a dónde, o que su
 *    comprobante no llegue.
 *  - Y que el aviso tape la página cuando la consulta FALLA.
 *
 * Lo que decide la base (quién ve qué cuenta, el estado, que un pago repetido
 * se rechace, que anular un recibo devuelva la fecha, que el apagado
 * automático deje fuera al alumno) se comprobó impersonando roles en SQL; acá
 * se mira lo que manda y pinta la pantalla.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-mensualidades.js
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
   1. Sin navegador: las piezas que no pueden faltar
   ================================================================== */
function pruebaArchivos() {
  console.log("\n=== Las piezas ===");
  const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /_cobros_cuentas_activo_hasta\.sql$/.test(f));
  cierto("la migración de las cuentas está guardada", mig.length === 1, mig.join(", "));
  const sql = mig.length ? fs.readFileSync(path.join(RAIZ, "supabase/migraciones", mig[0]), "utf8") : "";
  cierto("los dos automáticos arrancan apagados",
    /avisos_auto boolean not null default false/.test(sql) && /apagado_auto boolean not null default false/.test(sql));
  cierto("el candado (acceso_vigente) pregunta el estado de la cuenta, con la misma función que la lista",
    /function public\.acceso_vigente\(\)[\s\S]*interno\.cuenta_cobro_estado\(ca\.cuenta_id\)/.test(sql)
    && /cuentas_cobro_vista[\s\S]*interno\.cuenta_cobro_estado\(c\.id\)/.test(sql));
  const js = fs.readFileSync(path.join(RAIZ, "js/mensualidades.js"), "utf8");
  cierto("la página no calcula el estado: lo lee de cuentas_cobro_vista",
    /from\("cuentas_cobro_vista"\)/.test(js) && !/estado\s*=\s*["'](al_dia|vencido|apagado)["']/.test(js));
  cierto("ninguna alerta del navegador", !/\b(alert|confirm|prompt)\s*\(/.test(js.replace(/Avisos\.(confirmar|pedir|alerta)\(/g, "")));
  const av = fs.readFileSync(path.join(RAIZ, "js/acceso-vigente.js"), "utf8");
  cierto("el control de acceso conoce «cobro»", /a\.motivo === "cobro"/.test(av));
  // Pedido del dueño el 18/11/2026: a los alumnos no les sale la franja de
  // «vence pronto / venció» mientras la base no diga avisar_en_panel.
  cierto("la franja de cobro del panel solo sale con avisar_en_panel",
    /enPanel\(\) && a\.avisar_en_panel === true\) avisoCobroVigente/.test(av));
  const html = fs.readFileSync(path.join(RAIZ, "mensualidades.html"), "utf8");
  cierto("la página no lleva código escrito adentro", !/<script>(?![^<]*localStorage)/.test(html.replace(/<!-- (oscuro|tema): inicio -->[\s\S]*?<!-- \1: fin -->/g, "")));
  for (const f of ["js/paginas-admin.js", "js/paginas-supervisor.js"]) {
    cierto("la tarjeta «Cobros» de " + f + " lleva a la página nueva", /label: "Cobros"[^}]*href: "mensualidades\.html"/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")));
  }
}

/* ==================================================================
   2. En un navegador
   ================================================================== */
function hoyCR() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }); }
function sumar(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function hastaDe(desde, meses) {
  const [y, m, d] = sumar(desde, -1).split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

function clienteFalso(cfg) {
  return `
window.__rpc = [];
window.__subidas = [];
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const CFG = ${JSON.stringify(cfg)};
  const TABLAS = CFG.tablas || {};
  // Los filtros se apuntan y se aplican al RESOLVER, como pide CLAUDE.md.
  function b(filas, error) {
    const filtros = [];
    let unica = false, rango = null;
    const q = {
      select() { return q; },
      eq(c, v) { filtros.push((f) => String(f[c]) === String(v)); return q; },
      in(c, vs) { filtros.push((f) => vs.map(String).includes(String(f[c]))); return q; },
      is(c, v) { filtros.push((f) => (f[c] == null) === (v == null)); return q; },
      order() { return q; }, limit() { return q; }, gte() { return q; }, or() { return q; },
      range(a, z) { rango = [a, z]; return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) {
        let d = filas;
        if (Array.isArray(d)) {
          d = d.filter((f) => filtros.every((fn) => fn(f)));
          if (rango) d = d.slice(rango[0], rango[1] + 1);
          if (unica) d = d.length ? d[0] : null;
        }
        return Promise.resolve({ data: error ? null : d, error: error || null }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: CFG.yo ? { user: { id: CFG.yo }, access_token: "t" } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => b(TABLAS[t] || []),
    rpc: (n, args) => {
      window.__rpc.push({ n, args: args || null });
      const r = (CFG.rpc || {})[n];
      if (r && r.__error) return b(null, { message: r.__error });
      return b(r === undefined ? null : r);
    },
    storage: { from: () => ({
      upload: (ruta) => { window.__subidas.push(ruta); return Promise.resolve({ data: { path: ruta }, error: null }); },
      createSignedUrl: () => Promise.resolve({ data: { signedUrl: "about:blank" }, error: null }),
    }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

async function abrir(browser, pagina, cfg) {
  const page = await browser.newPage({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg) }));
  await page.goto(BASE + "/" + pagina, { waitUntil: "networkidle" });
  return { page, errores };
}
const rpcs = (page, n) => page.evaluate((n) => window.__rpc.filter((c) => c.n === n), n);
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);
async function apretarEnDialogo(page, texto) {
  const b = page.locator("dialog[open] button", { hasText: texto });
  await b.first().click();
  await page.waitForTimeout(200);
}

const HOY = hoyCR();
const ADMIN = { id: "admin-1", is_admin: true, es_coordinador: false, es_supervisor: false, role: "profesor", full_name: "Admin" };
const COORD = { id: "coord-1", is_admin: false, es_coordinador: true, es_supervisor: false, role: "profesor", full_name: "Coordinadora" };
const PROFE = { id: "profe-1", is_admin: false, es_coordinador: false, es_supervisor: false, role: "profesor", full_name: "Profe" };
const ALUMNOS = [
  { id: "a-val", full_name: "Valeria Rojas", email: "v@x.com", role: "alumno" },
  { id: "a-sol1", full_name: "Mateo Solano", email: "m@x.com", role: "alumno" },
  { id: "a-sol2", full_name: "Sara Solano", email: "s@x.com", role: "alumno" },
  { id: "a-ana", full_name: "Ana Castro", email: "a@x.com", role: "alumno" },
  { id: "a-nuevo", full_name: "Nuevo Alumno", email: "n@x.com", role: "alumno" },
];
// El estado viene puesto A PROPÓSITO distinto de lo que darían las fechas
// (Ana tiene «al_dia» con una fecha vieja): si la página recalculara, se ve.
const CUENTAS = [
  { id: "c-ana", nombre: "Ana Castro", monto: 24000, moneda: "CRC", apagada: false, nota: null, activo_hasta_base: sumar(HOY, -40),
    activo_hasta: sumar(HOY, -40), pagado_hasta: null, ultimo_pago: null, estado: "al_dia", dias: -40, apaga_el: null, alumnos: ["a-ana"], reportes_pendientes: 0 },
  { id: "c-val", nombre: "Valeria Rojas", monto: 24000, moneda: "CRC", apagada: false, nota: null, activo_hasta_base: sumar(HOY, -12),
    activo_hasta: sumar(HOY, -12), pagado_hasta: sumar(HOY, -12), ultimo_pago: null, estado: "vencido", dias: -12, apaga_el: null, alumnos: ["a-val"], reportes_pendientes: 1 },
  { id: "c-sol", nombre: "Familia Solano", monto: 40000, moneda: "CRC", apagada: false, nota: null, activo_hasta_base: sumar(HOY, 3),
    activo_hasta: sumar(HOY, 3), pagado_hasta: null, ultimo_pago: null, estado: "vence_pronto", dias: 3, apaga_el: null, alumnos: ["a-sol1", "a-sol2"], reportes_pendientes: 0 },
];
const AJUSTES = { id: true, avisos_auto: false, apagado_auto: false, dias_gracia: 5, dias_aviso_antes: 3, sinpe_numero: "88887777", sinpe_nombre: "Ajedrez Integral" };
const REPORTE = { id: "r-1", cuenta_id: "c-val", alumno_id: "a-val", monto: 24000, fecha: sumar(HOY, -1), referencia: "SINPE 555", comprobante: "a-val/1.jpg", nota: null, created_at: new Date().toISOString(), estado: "pendiente" };

function cfgDe(yo, extra) {
  return Object.assign({
    yo: yo.id,
    tablas: {
      profiles: [yo, ...ALUMNOS], cuentas_cobro_vista: CUENTAS, cobros_ajustes: [AJUSTES],
      pagos_reportados: [REPORTE], cobros: [],
    },
    rpc: {
      cuentas_cobro_resumen: [{ moneda: "CRC", entro_mes: 412000, cuentas: 3, vencidas: 1, apagadas: 0, monto_vencidas: 24000 }],
      cuenta_cobro_pagar: { id: "rec-1", numero: "R-AI-2026-0001", activo_hasta: hastaDe(sumar(HOY, -11), 2) },
      cuenta_cobro_apagar: null, cuenta_cobro_guardar: "c-nueva", cobros_ajustes_guardar: null, recibo_por_whatsapp: null,
    },
  }, extra || {});
}

async function pruebaLista(browser) {
  console.log("\n=== mensualidades.html: la lista (quien administra, en un celular) ===");
  const { page, errores } = await abrir(browser, "mensualidades.html", cfgDe(ADMIN));
  await page.waitForSelector("#cuentas li");
  const filas = await page.evaluate(() => [...document.querySelectorAll("#cuentas li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()));
  igual("una fila por cuenta", filas.length, 3);
  cierto("la vencida va primero y dice cuántos días lleva, con palabras", /^Valeria Rojas.*Vencida hace 12 días/.test(filas[0]), filas[0]);
  cierto("una familia dice cuántos alumnos tiene", filas.some((f) => /Familia Solano.*2 alumnos.*Vence en 3 días/.test(f)), filas.join(" | "));
  cierto("el estado es el de la base (Ana, «al día» aunque su fecha sea vieja)", filas.some((f) => /Ana Castro.*Al día/.test(f)), filas.join(" | "));
  cierto("arriba dice cuánto entró en el mes", (await page.textContent("#resumen")).includes("₡412.000"), await page.textContent("#resumen"));
  igual("el aviso de comprobantes por confirmar se ve", await vis(page, "#aviso-reportes"), true);
  cierto("y dice cuántos", (await page.textContent("#aviso-reportes")).includes("1 pago por confirmar"));
  igual("quien administra ve «Automático»", await vis(page, "#ir-ajustes"), true);

  await page.click("#filtros button:has-text('Vencidas')");
  igual("el filtro «Vencidas» deja solo las vencidas", await page.evaluate(() => document.querySelectorAll("#cuentas li").length), 1);
  igual("y el botón dice que está apretado", await page.getAttribute("#filtros button[aria-pressed='true']", "aria-pressed"), "true");
  await page.click("#filtros button:has-text('Todas')");
  await page.fill("#buscar", "sara");
  const busc = await page.evaluate(() => [...document.querySelectorAll("#cuentas li")].map((li) => li.textContent));
  cierto("buscar por el nombre de un alumno encuentra su familia", busc.length === 1 && busc[0].includes("Familia Solano"), busc.join(" | "));
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  cierto("en el celular no hay desplazamiento de lado", ancho);
  cierto("sin errores de la página", errores.length === 0, errores.join(" | "));
  await page.close();
}

async function pruebaPago(browser) {
  console.log("\n=== Registrar un pago ===");
  const { page, errores } = await abrir(browser, "mensualidades.html#cuenta=c-val", cfgDe(ADMIN));
  await page.waitForSelector("#v-cuenta form");
  const desde = await page.inputValue("#v-cuenta input[type=date] >> nth=0");
  igual("«Cuenta desde» arranca el día después de «activa hasta» (desde que venció)", desde, sumar(HOY, -11));
  igual("con 1 mes, «hasta» es la víspera del mismo día del mes siguiente", await page.inputValue("#v-cuenta input[type=date] >> nth=1"), hastaDe(sumar(HOY, -11), 1));
  // Hay un comprobante pendiente de esta cuenta: el monto y la referencia vienen de ahí.
  cierto("el comprobante que mandó el alumno se ve en la cuenta", (await page.textContent("#v-cuenta")).includes("Reportó un pago de ₡24.000"));
  await page.click("#v-cuenta button:has-text('2')");
  igual("2 meses corren «hasta»", await page.inputValue("#v-cuenta input[type=date] >> nth=1"), hastaDe(sumar(HOY, -11), 2));
  const monto = await page.inputValue("#v-cuenta input[inputmode=numeric]");
  igual("y el monto pasa a dos mensualidades", monto, "48000");
  await page.click("#v-cuenta button:has-text('Efectivo')");
  await page.click("#v-cuenta button[type=submit]");
  await page.waitForSelector("#t-cuenta:has-text('Pago registrado')");
  const r = await rpcs(page, "cuenta_cobro_pagar");
  igual("se manda un solo pago", r.length, 1);
  const a = r[0] ? r[0].args : {};
  igual("con el periodo que se ve", [a.p_desde, a.p_hasta], [sumar(HOY, -11), hastaDe(sumar(HOY, -11), 2)]);
  igual("el monto, el método y el comprobante que confirma", [a.p_monto, a.p_metodo, a.p_reporte], [48000, "efectivo", "r-1"]);
  cierto("dice el número de recibo", (await page.textContent("#v-cuenta")).includes("R-AI-2026-0001"));
  const wa = await page.getAttribute("#v-cuenta a[href*='wa.me']", "href");
  cierto("y lo deja mandar por WhatsApp con el monto escrito", !!wa && decodeURIComponent(wa).includes("₡48.000"), wa);
  cierto("sin errores de la página", errores.length === 0, errores.join(" | "));
  await page.close();
}

async function pruebaApagar(browser) {
  console.log("\n=== Apagar, recordar y agregar ===");
  const { page } = await abrir(browser, "mensualidades.html#cuenta=c-sol", cfgDe(ADMIN));
  await page.waitForSelector("#v-cuenta form");
  const wa = decodeURIComponent(await page.getAttribute("#v-cuenta a[href*='wa.me']", "href") || "");
  cierto("«Recordar por WhatsApp» lleva el monto, la fecha y el SINPE", wa.includes("₡40.000") && wa.includes("8888-7777") && wa.includes("vence el"), wa);
  await page.click("#v-cuenta button:has-text('Apagar ahora')");
  igual("apagar pide confirmación (no sale de un toque)", (await rpcs(page, "cuenta_cobro_apagar")).length, 0);
  await apretarEnDialogo(page, "Apagar");
  const ap = await rpcs(page, "cuenta_cobro_apagar");
  igual("y al confirmar apaga ESA cuenta", ap.map((x) => [x.args.p_id, x.args.p_apagar]), [["c-sol", true]]);
  await page.close();

  const p2 = (await abrir(browser, "mensualidades.html#nueva", cfgDe(ADMIN))).page;
  await p2.waitForSelector("#e-buscar");
  await p2.fill("#e-buscar", "nuevo");
  await p2.click("#e-sugeridos button:has-text('Nuevo Alumno')");
  igual("al elegir el alumno, el nombre de la cuenta se llena solo", await p2.inputValue("#e-nombre"), "Nuevo Alumno");
  await p2.fill("#e-monto", "₡30.000");
  await p2.click("#e-guardar");
  await p2.waitForTimeout(300);
  const g = await rpcs(p2, "cuenta_cobro_guardar");
  const ga = g[0] ? g[0].args : {};
  igual("crea la cuenta con el alumno, el monto leído y la fecha", [ga.p_id, ga.p_alumnos, ga.p_monto, ga.p_activo_hasta], [null, ["a-nuevo"], 30000, HOY]);
  await p2.close();
}

async function pruebaAjustes(browser) {
  console.log("\n=== Automático (solo administración) ===");
  const { page } = await abrir(browser, "mensualidades.html#ajustes", cfgDe(ADMIN));
  await page.waitForSelector("#v-ajustes:not([hidden])");
  igual("los dos interruptores empiezan como dice la base (apagados)",
    [await page.getAttribute("#a-avisos", "aria-checked"), await page.getAttribute("#a-apagado", "aria-checked")], ["false", "false"]);
  await page.click("#a-apagado");
  igual("el interruptor cambia su aria-checked", await page.getAttribute("#a-apagado", "aria-checked"), "true");
  const despues = await page.evaluate(() => getComputedStyle(document.getElementById("a-apagado"), "::after").content);
  cierto("y dice con palabras que está encendido", /Encendido/.test(despues), despues);
  await page.click("#f-ajustes button[type=submit]");
  await page.waitForTimeout(200);
  const texto = await page.evaluate(() => (document.querySelector("dialog[open]") || {}).textContent || "");
  cierto("encender el apagado automático pide confirmar y dice cuántas cuentas quedan apagadas ya", /2 cuentas quedan apagadas/.test(texto), texto);
  igual("todavía no guardó nada", (await rpcs(page, "cobros_ajustes_guardar")).length, 0);
  await apretarEnDialogo(page, "Encender");
  const g = await rpcs(page, "cobros_ajustes_guardar");
  igual("al confirmar guarda el apagado encendido y lo demás igual",
    g.map((x) => [x.args.p_apagado_auto, x.args.p_avisos_auto, x.args.p_dias_gracia, x.args.p_sinpe_numero]), [[true, false, 5, "88887777"]]);
  await page.close();

  const c = (await abrir(browser, "mensualidades.html", cfgDe(COORD))).page;
  await c.waitForSelector("#cuentas li");
  igual("quien coordina no ve «Automático»", await vis(c, "#ir-ajustes"), false);
  await c.close();

  const p = (await abrir(browser, "mensualidades.html", cfgDe(PROFE))).page;
  await p.waitForTimeout(400);
  igual("una profesora ve que los cobros no son suyos", await vis(p, "#no-es-tuyo"), true);
  igual("y ni la lista", await vis(p, "#app"), false);
  igual("sin pedir nada de cobros", (await p.evaluate(() => window.__rpc.filter((c) => /cuenta|cobro/.test(c.n)).map((c) => c.n))), []);
  await p.close();
}

async function pruebaAviso(browser) {
  console.log("\n=== El alumno apagado (logros.html) ===");
  const ALUMNA = { id: "a-val", role: "alumno", full_name: "Valeria Rojas" };
  const base = (mi, extra) => ({
    yo: ALUMNA.id,
    tablas: { profiles: [ALUMNA], ajustes_academia: [{ clave: "whatsapp_consultas", valor: "8309-2291" }] },
    rpc: Object.assign({ mi_acceso: mi, mi_reporte_de_pago: null, pago_reportar: "r-9" }, extra || {}),
  });
  const APAGADA = { vigente: false, motivo: "cobro", exigido: true, estado: "apagado", hasta: sumar(HOY, -20), dias: -20,
    monto: 24000, moneda: "CRC", sinpe_numero: "88887777", sinpe_nombre: "Ajedrez Integral", reporte_pendiente: false };
  {
    const { page } = await abrir(browser, "logros.html", base(APAGADA));
    await page.waitForTimeout(400);
    igual("apagada: se tapa la página", await vis(page, "#main-content"), false);
    const t = await page.textContent("#acceso-aviso");
    cierto("y el aviso dice que el usuario está inactivo y cuánto pagar, a qué SINPE",
      t.includes("Tu usuario está inactivo") && t.includes("₡24.000") && t.includes("8888-7777") && t.includes("Ajedrez Integral"), t);
    igual("el foco va al título del aviso", await page.evaluate(() => document.activeElement && document.activeElement.tagName), "H1");
    await page.click("#acceso-aviso button:has-text('Ya pagué')");
    await page.click("#acceso-aviso button[type=submit]");
    cierto("sin foto ni número no manda nada y dice qué falta",
      (await rpcs(page, "pago_reportar")).length === 0 && /Sube la foto/.test(await page.textContent("#acceso-aviso [role=alert]")));
    await page.setInputFiles("#acceso-aviso input[type=file]", { name: "sinpe.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]) });
    await page.click("#acceso-aviso button[type=submit]");
    await page.waitForTimeout(300);
    const subidas = await page.evaluate(() => window.__subidas);
    cierto("la foto se sube a la carpeta del alumno", subidas.length === 1 && subidas[0].startsWith("a-val/"), JSON.stringify(subidas));
    const r = await rpcs(page, "pago_reportar");
    igual("y el reporte lleva esa foto y el monto de su mensualidad", r.map((x) => [x.args.p_comprobante === subidas[0], x.args.p_monto]), [[true, 24000]]);
    cierto("al mandarlo, dice que se activa sola al confirmarse", (await page.textContent("#acceso-aviso")).includes("tu usuario se activa solo"));
    await page.close();
  }
  {
    const { page } = await abrir(browser, "logros.html", base(Object.assign({}, APAGADA, { reporte_pendiente: true })));
    await page.waitForTimeout(400);
    cierto("con un comprobante por revisar no se ofrece mandar otro",
      (await page.textContent("#acceso-aviso")).includes("Recibimos tu comprobante") && !(await vis(page, "#acceso-aviso button")));
    await page.close();
  }
  {
    const { page } = await abrir(browser, "logros.html", base({ vigente: true, motivo: "cobro", estado: "vencido", hasta: sumar(HOY, -2), dias: -2, monto: 24000, moneda: "CRC" }));
    await page.waitForTimeout(400);
    igual("vencida pero sin apagar: fuera del panel no se tapa nada", await vis(page, "#acceso-aviso"), false);
    await page.close();
  }
  {
    const { page } = await abrir(browser, "logros.html", base({ __error: "function mi_acceso() does not exist" }));
    await page.waitForTimeout(400);
    igual("si la consulta falla, NO se tapa", await vis(page, "#acceso-aviso"), false);
    await page.close();
  }
}

(async () => {
  pruebaArchivos();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaLista(browser);
    await pruebaPago(browser);
    await pruebaApagar(browser);
    await pruebaAjustes(browser);
    await pruebaAviso(browser);
  } finally {
    await browser.close();
  }
  terminar();
})().catch((e) => { console.error(e); process.exit(1); });

function terminar() {
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron` : "\n✓ Todo en orden");
  process.exit(fallos ? 1 : 0);
}

/*! rev bfb5bbb0d2d82f9f */
