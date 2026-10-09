/* La franja de la región en el panel del alumno (taller del MEP): el dibujo de
 * su Dirección Regional, con el nombre y lo que muestra.
 *
 * Lo que se rompe acá se rompe callado:
 *
 *  - Un dibujo deja de armarse (una pieza que falta, una cuenta que da NaN) y
 *    el panel de ese asesor muestra un rectángulo vacío o una franja rota,
 *    sin ningún error en la consola de nadie más.
 *  - La franja aparece en cuentas que no la tienen, o se pinta con una clave
 *    que el archivo no conoce.
 *  - El mapa nacional se queda sin su «¿Qué regional es cada punto?», o los
 *    números dejan de coincidir con los del PDF de revisión.
 *  - Cualquiera se cambia el fondo desde la consola: la tabla no puede tener
 *    política de escritura.
 *
 * Lo de la base se mira leyendo supabase/ (sin red ni base); se comprobó además
 * impersonando roles en SQL (ver «La franja de la región» en
 * docs/decisiones/paneles.md). En el navegador se abre clases.html con el doble.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-fondo-region.js
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
   1. Sin navegador: la base y la página
   ================================================================== */
function pruebaBase() {
  console.log("=== La base (supabase/migraciones) ===");
  const dir = path.join(RAIZ, "supabase", "migraciones");
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  cierto("la tabla tiene RLS", /alter\s+table\s+public\.fondos_region\s+enable\s+row\s+level\s+security/i.test(sql));
  cierto("authenticated solo la lee (se revoca todo y se da select)",
    /revoke\s+all\s+on\s+public\.fondos_region\s+from\s+public,\s*anon,\s*authenticated/i.test(sql) &&
      /grant\s+select\s+on\s+public\.fondos_region\s+to\s+authenticated/i.test(sql));
  const politicas = [...sql.matchAll(/create\s+policy\s+\w+\s+on\s+public\.fondos_region\s+for\s+(\w+)/gi)].map((m) => m[1].toLowerCase());
  igual("sus políticas: una sola, de lectura", politicas, ["select"]);
  cierto("la lee la persona dueña o quien administra, con auth.uid() envuelto",
    /fondos_region_ver[\s\S]{0,160}persona_id\s*=\s*\(select\s+auth\.uid\(\)\)\s+or\s+\(select\s+public\.soy_admin\(\)\)/i.test(sql));
  cierto("fondos_region_fijar() exige administrar, con coalesce",
    /fondos_region_fijar[\s\S]{0,600}if\s+not\s+coalesce\(\s*public\.soy_admin\(\)\s*,\s*false\s*\)/i.test(sql));
  cierto("y se le quita el execute a public y anon",
    /revoke\s+execute\s+on\s+function\s+public\.fondos_region_fijar\(uuid\[\],\s*text\)\s+from\s+public,\s*anon/i.test(sql));

  console.log("\n=== clases.html ===");
  const html = fs.readFileSync(path.join(RAIZ, "clases.html"), "utf8");
  const seccion = html.search(/<section id="fondo-region" hidden/);
  const buscador = html.search(/<form id="buscar-panel"/);
  cierto("tiene la sección de la franja, escondida hasta saber si la cuenta tiene fondo", seccion > 0);
  cierto("y va después del buscador, que va pegado al saludo (verificar-panel.js lo exige)", seccion > 0 && buscador > 0 && seccion > buscador);
  cierto("carga js/fondo-region.js", /<script src="js\/fondo-region\.js"/.test(html));
}

/* ==================================================================
   2. En un navegador
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

async function abrir(browser, cfg, ancho) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho || 1200, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg) }));
  await page.goto(BASE + "/clases.html", { waitUntil: "networkidle" });
  return { page, errores, cerrar: () => ctx.close() };
}
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

const YO = "u-asesor";
const conFondo = (fondo) => ({
  yo: YO,
  tablas: {
    profiles: [{ id: YO, full_name: "Asesor de prueba · Cartago", role: "alumno", is_admin: false }],
    fondos_region: fondo ? [{ persona_id: YO, fondo }, { persona_id: "otra-cuenta", fondo: "limon" }] : [{ persona_id: "otra-cuenta", fondo: "limon" }],
  },
  rpc: { mi_acceso: { vigente: true, motivo: "temporal", exigido: false, vence: "2026-12-20T06:00:00+00:00", detalle: "Taller", dias: 73 } },
});

async function prueba(browser) {
  console.log("\n=== Los 29 dibujos (js/fondo-region.js) ===");
  {
    const { page, errores, cerrar } = await abrir(browser, conFondo(null));
    const r = await page.evaluate(() => {
      const F = window.FondoRegion;
      if (!F) return null;
      return F.claves.map((c) => {
        const s = F.svg(c);
        const doc = new DOMParser().parseFromString(s, "image/svg+xml");
        return { c, malo: /NaN|undefined/.test(s) || !!doc.querySelector("parsererror"), formas: doc.querySelectorAll("path,rect,circle,ellipse").length };
      });
    });
    igual("hay 29: las 27 regionales, la nacional y la Escuela Laboratorio", r ? r.length : 0, 29);
    const malos = (r || []).filter((x) => x.malo || x.formas < 5).map((x) => x.c);
    igual("cada uno se arma sin NaN, sin «undefined» y con sus formas", malos, []);
    igual("sin fondo propio no se pinta nada (aunque otra cuenta tenga uno)", await vis(page, "#fondo-region"), false);
    cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
    await cerrar();
  }

  console.log("\n=== La franja en el panel ===");
  {
    const { page, cerrar } = await abrir(browser, conFondo("cartago"));
    await page.waitForSelector("#fondo-region:not([hidden])", { timeout: 5000 }).catch(() => {});
    igual("con su fondo, la franja se ve", await vis(page, "#fondo-region"), true);
    igual("el nombre de la región", (await page.textContent("#fondo-region-titulo")).trim(), "Dirección Regional de Cartago");
    igual("y debajo, en pequeño, lo que muestra", (await page.textContent("#fondo-region-leyenda")).trim(), "La Basílica de los Ángeles frente al Irazú");
    igual("el dibujo se anuncia con lo que muestra", await page.getAttribute("#fondo-region svg", "aria-label"), "La Basílica de los Ángeles frente al Irazú");
    igual("sin mapa grande (eso es solo de la nacional)", await page.$("#fondo-region-mapa") === null, true);
    await page.fill("#buscar-panel-campo", "mates");
    await page.waitForTimeout(300);
    igual("mientras se busca se hace a un lado, como todo lo que no es la grilla", await vis(page, "#fondo-region"), false);
    await page.fill("#buscar-panel-campo", "");
    await page.waitForTimeout(300);
    igual("y vuelve al borrar la búsqueda", await vis(page, "#fondo-region"), true);
    await cerrar();
  }
  {
    const { page, cerrar } = await abrir(browser, conFondo("cartago"), 390);
    await page.waitForSelector("#fondo-region:not([hidden])", { timeout: 5000 }).catch(() => {});
    const anchos = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    cierto("en el celular la página no se desborda a lo ancho", anchos[0] <= anchos[1], anchos.join(" > "));
    await cerrar();
  }
  {
    const { page, cerrar } = await abrir(browser, conFondo("nacional"));
    await page.waitForSelector("#fondo-region:not([hidden])", { timeout: 5000 }).catch(() => {});
    igual("la nacional: Asesoría Nacional del MEP", (await page.textContent("#fondo-region-titulo")).trim(), "Asesoría Nacional del MEP");
    igual("trae «¿Qué regional es cada punto?»", (await page.textContent("#fondo-region-mapa summary")).trim(), "¿Qué regional es cada punto?");
    igual("cerrado al entrar", await vis(page, "#fondo-region-lista"), false);
    await page.click("#fondo-region-mapa summary");
    igual("al abrirlo se ve el mapa con la lista", await vis(page, "#fondo-region-lista"), true);
    const lista = await page.$$eval("#fondo-region-lista li", (lis) => lis.map((li) => li.textContent.trim()));
    igual("las 27 regionales", lista.length, 27);
    igual("con los números del PDF (1 Alajuela, en el recuadro … 27 Turrialba)", [lista[0], lista[26]], ["1Alajuela · recuadro", "27Turrialba"]);
    const puntos = await page.$$eval("#fondo-region-mapa svg g title", (ts) => ts.length);
    igual("y 27 puntos numerados en el mapa", puntos, 27);
    await cerrar();
  }
  {
    const { page, cerrar } = await abrir(browser, conFondo("una-que-no-existe"));
    await page.waitForTimeout(800);
    igual("una clave que el archivo no conoce no se pinta", await vis(page, "#fondo-region"), false);
    await cerrar();
  }
}

(async () => {
  pruebaBase();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await prueba(browser);
  } finally {
    await browser.close();
  }
  terminar();
})().catch((e) => { console.error(e); process.exit(1); });

function terminar() {
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron` : "\n✓ Todo en orden");
  process.exit(fallos ? 1 : 0);
}
