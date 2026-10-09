/* Las cuentas temporales: una cuenta de alumno que se cierra sola en una fecha
 * (el taller del MEP, por ejemplo), con su propio aviso.
 *
 * Lo que se rompe acá se rompe callado, hacia uno de dos lados:
 *
 *  - Acceso para siempre: una migración futura vuelve a crear
 *    `acceso_vigente()` copiando una versión vieja y la pregunta por la cuenta
 *    temporal desaparece, o queda DESPUÉS del interruptor (con el interruptor
 *    apagado nunca se llega a ella). La cuenta sigue abierta en enero y nadie
 *    se queja.
 *  - El aviso equivocado: la cuenta se cierra, pero dice «Tu prueba gratis de
 *    3 días terminó» con la salida a los precios, o «Tu cuenta todavía no
 *    tiene un acceso activo», a 27 personas a las que se la dieron.
 *
 * Y la tabla reparte acceso: si alguien puede escribirla desde el navegador,
 * se alarga su propia fecha.
 *
 * Lo de la base se mira leyendo supabase/ (sin red ni base); se comprobó
 * además impersonando roles en SQL (ver «Las cuentas temporales» en
 * docs/decisiones/cobros-acceso-y-tienda.md). En el navegador se mira el aviso
 * de js/acceso-vigente.js.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-cuentas-temporales.js
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
   1. Sin navegador: la base
   ================================================================== */

const MIGRACIONES = path.join(RAIZ, "supabase", "migraciones");
const archivos = fs.readdirSync(MIGRACIONES).filter((x) => x.endsWith(".sql")).sort();

/** El cuerpo de la ÚLTIMA migración que define esa función (la que vale). */
function ultimaDefinicion(nombre) {
  const inicio = new RegExp("create\\s+(?:or\\s+replace\\s+)?function\\s+" + nombre.replace(".", "\\.") + "\\s*\\(", "i");
  let hallada = null;
  for (const f of archivos) {
    const sql = fs.readFileSync(path.join(MIGRACIONES, f), "utf8");
    const m = sql.match(inicio);
    if (!m) continue;
    const resto = sql.slice(m.index);
    const d = resto.match(/as\s+(\$[a-z_]*\$)/i);
    if (!d) continue;
    const desde = resto.indexOf(d[1]) + d[1].length;
    hallada = { archivo: f, cuerpo: resto.slice(desde, resto.indexOf(d[1], desde)), sql };
  }
  return hallada;
}

/** Todo lo que las migraciones dicen de la tabla, en orden. */
const todoElSql = archivos.map((f) => fs.readFileSync(path.join(MIGRACIONES, f), "utf8")).join("\n");

function pruebaBase() {
  console.log("=== La base (supabase/migraciones) ===");
  const av = ultimaDefinicion("public.acceso_vigente");
  if (!av) { cierto("hay una migración que define acceso_vigente()", false); return; }
  const temporal = av.cuerpo.search(/cuentas_temporales/);
  const interruptor = av.cuerpo.search(/acceso_config/);
  cierto(`acceso_vigente() pregunta por la cuenta temporal (${av.archivo})`, temporal >= 0);
  cierto("y lo hace ANTES que el interruptor (si no, con el interruptor apagado no llega)",
    temporal >= 0 && interruptor >= 0 && temporal < interruptor);
  cierto("la cuenta temporal vale mientras `vence > now()`", /t\.vence\s*>\s*now\(\)/.test(av.cuerpo));

  const mi = ultimaDefinicion("public.mi_acceso");
  cierto("mi_acceso() sale de acceso_vigente() (no pueden contradecirse)", !!mi && /public\.acceso_vigente\(\)/.test(mi.cuerpo));
  cierto("y dice «temporal» y «temporal_vencida», con el detalle y los días",
    !!mi && /'temporal'/.test(mi.cuerpo) && /'temporal_vencida'/.test(mi.cuerpo) && /'detalle'/.test(mi.cuerpo) && /'dias'/.test(mi.cuerpo));
  cierto("los días se cuentan en hora de Costa Rica", !!mi && /v_temporal\s+at\s+time\s+zone\s+'America\/Costa_Rica'/.test(mi.cuerpo));

  const fijar = ultimaDefinicion("public.cuentas_temporales_fijar");
  cierto("cuentas_temporales_fijar() exige administrar, con coalesce (sin sesión no deja pasar)",
    !!fijar && /if\s+not\s+coalesce\(\s*public\.soy_admin\(\)\s*,\s*false\s*\)/.test(fijar.cuerpo));
  cierto("y solo acepta cuentas de alumno (el corte no alcanza a quien da clase)",
    !!fijar && /role\s+is\s+distinct\s+from\s+'alumno'/.test(fijar.cuerpo));
  cierto("se le quita el execute a public y anon (revocar solo de anon no sirve)",
    /revoke\s+execute\s+on\s+function\s+public\.cuentas_temporales_fijar\(uuid\[\],\s*timestamptz,\s*text\)\s+from\s+public,\s*anon/i.test(todoElSql));

  cierto("la tabla tiene RLS", /alter\s+table\s+public\.cuentas_temporales\s+enable\s+row\s+level\s+security/i.test(todoElSql));
  cierto("authenticated solo la lee (se revoca todo y se da select)",
    /revoke\s+all\s+on\s+public\.cuentas_temporales\s+from\s+public,\s*anon,\s*authenticated/i.test(todoElSql) &&
      /grant\s+select\s+on\s+public\.cuentas_temporales\s+to\s+authenticated/i.test(todoElSql));
  const politicas = [...todoElSql.matchAll(/create\s+policy\s+\w+\s+on\s+public\.cuentas_temporales\s+for\s+(\w+)/gi)].map((m) => m[1].toLowerCase());
  igual("sus políticas: una sola, de lectura (nadie la escribe desde el navegador)", politicas, ["select"]);
  cierto("lleva su trigger de auditoría (reparte acceso)",
    /create\s+trigger\s+auditar\s+after\s+insert\s+or\s+update\s+or\s+delete\s+on\s+public\.cuentas_temporales/i.test(todoElSql));
  cierto("borrar la cuenta borra su fila (on delete cascade) y quien la fijó queda en null",
    /persona_id\s+uuid\s+primary\s+key\s+references\s+public\.profiles\(id\)\s+on\s+delete\s+cascade/i.test(todoElSql) &&
      /fijada_por\s+uuid\s+references\s+public\.profiles\(id\)\s+on\s+delete\s+set\s+null/i.test(todoElSql));
}

/* ==================================================================
   2. En un navegador: el aviso
   ================================================================== */
function clienteFalso(cfg) {
  return `
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const CFG = ${JSON.stringify(cfg)};
  const TABLAS = CFG.tablas || {};
  function b(filas) {
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
    rpc: (n) => { const r = (CFG.rpc || {})[n]; return b(r === undefined ? null : r); },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

async function abrir(browser, pagina, cfg) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg) }));
  await page.goto(BASE + "/" + pagina, { waitUntil: "networkidle" });
  return { page, errores, cerrar: () => ctx.close() };
}
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

const ALUMNO = { id: "u-asesor", full_name: "Jenny Ramírez Moreno", role: "alumno", is_admin: false };
const VENCE = "2026-12-20T06:00:00+00:00"; // el 20 de diciembre a las 00:00 en Costa Rica
const base = (mi) => ({
  yo: ALUMNO.id,
  tablas: { profiles: [ALUMNO], ajustes_academia: [{ clave: "whatsapp_consultas", valor: "8309-2291" }] },
  rpc: { mi_acceso: mi },
});

async function pruebaAviso(browser) {
  console.log("\n=== El aviso de la Academia (js/acceso-vigente.js) ===");
  {
    const { page, errores, cerrar } = await abrir(browser, "logros.html",
      base({ vigente: false, motivo: "temporal_vencida", exigido: false, vence: VENCE, detalle: "MEP · Asesores nacionales", dias: 0 }));
    await page.waitForSelector("#acceso-aviso", { timeout: 5000 }).catch(() => {});
    igual("con la cuenta temporal cerrada se tapa la página", [await vis(page, "#main-content"), await vis(page, "#acceso-aviso")], [false, true]);
    igual("el título lo dice con su nombre (no «prueba gratis»)", (await page.textContent("#acceso-aviso h1")).trim(), "Tu cuenta temporal se cerró");
    const texto = await page.textContent("#acceso-aviso");
    cierto("con el taller y el día en que se cerró, en hora de Costa Rica",
      texto.includes("(MEP · Asesores nacionales)") && /se cerró el 20 de diciembre de 2026/.test(texto), texto);
    cierto("y sin hablar de la prueba gratis", !/prueba gratis/i.test(texto), texto);
    const hrefs = await page.evaluate(() => [...document.querySelectorAll("#acceso-aviso a")].map((a) => a.getAttribute("href")));
    cierto("sin la salida a los precios (nadie la compró)", !hrefs.some((h) => /precios\.html/.test(h)), hrefs.join(" "));
    const wa = hrefs.find((h) => /^https:\/\/wa\.me\/50683092291\?text=/.test(h)) || "";
    cierto("con el WhatsApp para pedir que la alarguen", /cuenta temporal/.test(decodeURIComponent(wa.split("?text=")[1] || "")), wa);
    cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
    await cerrar();
  }
  {
    const { page, cerrar } = await abrir(browser, "clases.html",
      base({ vigente: false, motivo: "temporal_vencida", exigido: false, vence: VENCE, detalle: "MEP · Asesores nacionales", dias: 0 }));
    await page.waitForSelector("#acceso-franja", { timeout: 5000 }).catch(() => {});
    const t = (await vis(page, "#acceso-franja")) ? await page.textContent("#acceso-franja") : "";
    cierto("en el panel, la franja dice que se cerró y que el panel se puede ver",
      /Tu cuenta temporal \(MEP · Asesores nacionales\) se cerró el 20 de diciembre de 2026/.test(t) && /Puedes ver tu panel/.test(t), t);
    cierto("también sin los precios", !/elige tu plan/.test(t), t);
    await cerrar();
  }
  {
    const { page, cerrar } = await abrir(browser, "clases.html",
      base({ vigente: true, motivo: "temporal", exigido: false, vence: VENCE, detalle: "MEP · Asesores nacionales", dias: 3 }));
    await page.waitForSelector("#acceso-franja", { timeout: 5000 }).catch(() => {});
    const t = (await vis(page, "#acceso-franja")) ? await page.textContent("#acceso-franja") : "";
    cierto("la última semana, el panel avisa cuándo se cierra", /Tu cuenta temporal se cierra en 3 días \(el 20 de diciembre de 2026\)/.test(t), t);
    await cerrar();
  }
  {
    const { page, cerrar } = await abrir(browser, "clases.html",
      base({ vigente: true, motivo: "temporal", exigido: false, vence: VENCE, detalle: "MEP · Asesores nacionales", dias: 73 }));
    await page.waitForTimeout(800);
    igual("antes de esa semana no se avisa nada (73 días de franja serían ruido)", await vis(page, "#acceso-franja"), false);
    await cerrar();
  }
  {
    const { page, cerrar } = await abrir(browser, "logros.html",
      base({ vigente: true, motivo: "temporal", exigido: false, vence: VENCE, detalle: "MEP · Asesores nacionales", dias: 3 }));
    await page.waitForTimeout(800);
    igual("mientras vale, fuera del panel no se tapa ni se avisa nada", [await vis(page, "#acceso-aviso"), await vis(page, "#acceso-franja")], [false, false]);
    await cerrar();
  }
}

(async () => {
  pruebaBase();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
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
