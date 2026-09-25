/* La prueba gratis de 3 días: que se pueda entrar sin correo y que se cierre
 * sola.
 *
 * Lo que se rompe acá se rompe callado, y siempre hacia el mismo lado —acceso
 * gratis para siempre—, así que nadie se queja:
 *
 *  - Una migración futura vuelve a crear `acceso_vigente()` copiando la versión
 *    de antes: la pregunta por la prueba desaparece y, con el interruptor del
 *    acceso apagado, la cuenta de prueba entra sin límite.
 *  - La pregunta por la prueba queda DESPUÉS de la del interruptor: con el
 *    interruptor apagado nunca se llega a ella. Mismo resultado.
 *  - La Edge Function crea la cuenta abierta y la activación falla: una cuenta
 *    sin fila de prueba es una cuenta normal. Por eso nace bloqueada.
 *  - Crear la cuenta antes del freno: un script llena la base de cuentas.
 *
 * Esas cuatro se miran leyendo supabase/ (sin red ni base). Lo que decide la
 * base se comprobó además impersonando roles en SQL (ver «La prueba gratis de
 * 3 días» en docs/decisiones/cobros-acceso-y-tienda.md). En el navegador se
 * mira lo que manda y pinta la pantalla: prueba-gratis.html con la función
 * de mentira, y el aviso de js/acceso-vigente.js durante y después.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-prueba-gratis.js
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
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

/* ==================================================================
   1. Sin navegador: la base y la Edge Function
   ================================================================== */

/** El cuerpo de la ÚLTIMA migración que define esa función (la que vale). */
function ultimaDefinicion(nombre) {
  const dir = path.join(RAIZ, "supabase", "migraciones");
  const inicio = new RegExp("create\\s+(?:or\\s+replace\\s+)?function\\s+" + nombre.replace(".", "\\.") + "\\s*\\(", "i");
  let hallada = null;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
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

function pruebaBase() {
  console.log("=== La base (supabase/migraciones) ===");
  const av = ultimaDefinicion("public.acceso_vigente");
  if (!av) { cierto("hay una migración que define acceso_vigente()", false); return; }
  const prueba = av.cuerpo.search(/pruebas_gratis/);
  const interruptor = av.cuerpo.search(/acceso_config/);
  cierto(`acceso_vigente() pregunta por la prueba (${av.archivo})`, prueba >= 0);
  cierto("y lo hace ANTES que el interruptor (si no, con el interruptor apagado no llega)",
    prueba >= 0 && interruptor >= 0 && prueba < interruptor);
  cierto("la prueba vale mientras `vence > now()`", /vence\s*>\s*now\(\)/.test(av.cuerpo));

  const mi = ultimaDefinicion("public.mi_acceso");
  cierto("mi_acceso() sale de acceso_vigente() (no pueden contradecirse)", !!mi && /public\.acceso_vigente\(\)/.test(mi.cuerpo));
  cierto("y dice «prueba» y «prueba_vencida»", !!mi && /'prueba'/.test(mi.cuerpo) && /'prueba_vencida'/.test(mi.cuerpo));

  for (const [fn, firma] of [["public.prueba_gratis_activar", "uuid, text, text, text, text"], ["public.prueba_gratis_frenar", "text"]]) {
    const d = ultimaDefinicion(fn);
    const revoca = d && new RegExp("revoke\\s+execute\\s+on\\s+function\\s+" + fn.replace(".", "\\.") +
      "\\(" + firma.replace(/, /g, ",\\s*") + "\\)\\s+from\\s+public,\\s*anon,\\s*authenticated", "i").test(d.sql);
    cierto(`${fn}() solo la llama la service role (revoke de public, anon y authenticated)`, !!revoca);
  }
  const act = ultimaDefinicion("public.prueba_gratis_activar");
  cierto("prueba_gratis_activar() exige la versión legal aceptada", !!act && /version_legal_valida/.test(act.cuerpo));
  cierto("y solo marca una cuenta recién creada (no le pone corte a un alumno viejo)", !!act && /created_at\s*>\s*now\(\)/.test(act.cuerpo));
  const fr = ultimaDefinicion("interno.frenar_envio_publico");
  cierto("el freno conoce el tipo «prueba»", !!fr && /when\s+'prueba'/.test(fr.cuerpo));
}

function pruebaFuncion() {
  console.log("\n=== La Edge Function (supabase/functions/prueba-gratis) ===");
  const ts = leer("supabase/functions/prueba-gratis/index.ts");
  const pos = (re) => ts.search(re);
  const freno = pos(/rpc\("prueba_gratis_frenar"/);
  const crear = pos(/auth\.admin\.createUser\(/);
  const activar = pos(/rpc\("prueba_gratis_activar"/);
  const abrir = pos(/updateUserById\([^)]*ban_duration:\s*"none"/);
  cierto("pasa por el freno ANTES de crear la cuenta", freno >= 0 && crear > freno);
  cierto("la cuenta nace bloqueada (ban_duration al crearla)", /createUser\(\{[\s\S]*?ban_duration:\s*"\d+h"[\s\S]*?\}\)/.test(ts));
  cierto("y se desbloquea solo DESPUÉS de guardar el vencimiento", activar > crear && abrir > activar);
  cierto("si la activación falla, la cuenta se borra", /activarError[\s\S]{0,120}deleteUser\(id\)/.test(ts));
  cierto("usa el usuario sin buzón compartido (usuario-alumno.ts)", /from "\.\/usuario-alumno\.ts"/.test(ts));
  cierto("funciones-armar.js la arma con usuario-alumno.ts",
    /"prueba-gratis":\s*\["usuario-alumno\.ts"\]/.test(leer("herramientas/funciones-armar.js")));
}

/* ==================================================================
   2. En un navegador
   ================================================================== */
function clienteFalso(cfg) {
  return `
window.__rpc = []; window.__login = [];
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
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
      is() { return q; }, not() { return q; }, ilike() { return q; },
      range(a, z) { if (Array.isArray(datos)) datos = datos.slice(a, z + 1); return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) {
        let d = datos;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: error ? null : d, error: error || null, count: Array.isArray(d) ? d.length : 0 }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: CFG.yo ? { user: { id: CFG.yo }, access_token: "t" } : null } }),
      getUser: () => Promise.resolve({ data: { user: CFG.yo ? { id: CFG.yo } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: (c) => { window.__login.push(c); return Promise.resolve({ data: {}, error: CFG.loginFalla ? { message: "x" } : null }); },
      signOut: () => Promise.resolve({}),
    },
    from: (t) => b(TABLAS[t] || []),
    rpc: (n, args) => {
      window.__rpc.push({ n, args: args || null });
      const r = (CFG.rpc || {})[n];
      return b(r === undefined ? null : r);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

async function abrir(browser, pagina, cfg, funcion) {
  const page = await browser.newPage();
  const errores = [];
  const pedidos = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg) }));
  await page.route("https://falso.supabase.co/functions/v1/prueba-gratis", (r) => {
    pedidos.push(JSON.parse(r.request().postData() || "{}"));
    const [status, body] = funcion || [200, {}];
    r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(BASE + "/" + pagina, { waitUntil: "networkidle" });
  return { page, errores, pedidos };
}
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

async function pruebaPagina(browser) {
  console.log("\n=== prueba-gratis.html ===");
  const VENCE = "2026-09-28T02:23:54.354561+00:00";
  {
    const { page, errores, pedidos } = await abrir(browser, "prueba-gratis.html", {},
      [200, { ok: true, usuario: "sofia.munoz2", correo: "sofia.munoz2@alumno.ajedrez-integral.com", vence: VENCE }]);
    igual("no pide correo: no hay ningún campo de correo", await page.evaluate(() => document.querySelectorAll('#prueba-form input[type="email"], #prueba-form input[autocomplete="email"]').length), 0);

    await page.click("#prueba-enviar");
    cierto("sin nombre no se manda nada y se dice por qué", pedidos.length === 0 && await vis(page, "#prueba-error"));
    await page.fill("#prueba-nombre", "Sofía Muñoz Pérez");
    await page.fill("#prueba-clave", "corta");
    await page.click("#prueba-enviar");
    cierto("con la contraseña corta tampoco", pedidos.length === 0 && /8 caracteres/.test(await page.textContent("#prueba-error")));
    await page.fill("#prueba-clave", "clave-segura-1");
    await page.click("#prueba-enviar");
    cierto("ni sin aceptar los Términos y la Política", pedidos.length === 0 && /aceptas/.test(await page.textContent("#prueba-error")));

    await page.check("#prueba-acepto");
    await page.click("#prueba-ver-clave");
    igual("«Mostrar» enseña la contraseña y dice que está apretado",
      await page.evaluate(() => [document.getElementById("prueba-clave").type, document.getElementById("prueba-ver-clave").getAttribute("aria-pressed")]),
      ["text", "true"]);
    await page.click("#prueba-enviar");
    await page.waitForSelector("#prueba-lista:not(.hidden)");
    const legal = await page.evaluate(() => window.LegalVersion);
    igual("manda nombre, contraseña y las versiones legales aceptadas", pedidos[0],
      { nombre: "Sofía Muñoz Pérez", contrasena: "clave-segura-1", privacidad_version: legal.PRIVACIDAD, terminos_version: legal.TERMINOS });
    igual("inicia la sesión con el usuario que devolvió el SERVIDOR", await page.evaluate(() => window.__login),
      [{ email: "sofia.munoz2@alumno.ajedrez-integral.com", password: "clave-segura-1" }]);
    igual("y lo enseña sin el dominio", (await page.textContent("#prueba-usuario")).trim(), "sofia.munoz2");
    cierto("dice hasta cuándo dura, en hora de Costa Rica", /27 de septiembre/.test(await page.textContent("#prueba-vence")), await page.textContent("#prueba-vence"));
    igual("el formulario se va y se ve la tarjeta de listo", [await vis(page, "#prueba-form-card"), await vis(page, "#prueba-lista")], [false, true]);
    igual("el botón lleva a la Academia", await page.getAttribute("#prueba-entrar", "href"), "clases.html");
    igual("el foco va al título", await page.evaluate(() => document.activeElement && document.activeElement.id), "prueba-lista-titulo");
    cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
    await page.close();
  }
  {
    const { page, pedidos } = await abrir(browser, "prueba-gratis.html", {},
      [429, { error: "Llegaron demasiados envíos seguidos desde tu conexión. Espera un rato e intenta de nuevo." }]);
    await page.fill("#prueba-nombre", "Ana Rojas");
    await page.fill("#prueba-clave", "clave-segura-1");
    await page.check("#prueba-acepto");
    await page.click("#prueba-enviar");
    await page.waitForFunction(() => !document.getElementById("prueba-enviar").disabled);
    cierto("el freno del servidor se enseña tal cual", pedidos.length === 1 && /demasiados envíos/.test(await page.textContent("#prueba-error")));
    igual("y no se intenta iniciar sesión", await page.evaluate(() => window.__login.length), 0);
    await page.close();
  }
  {
    const { page } = await abrir(browser, "precios.html", {});
    const enlaces = await page.evaluate(() => ["hero-prueba", "prueba-academia", "cierre-prueba"].map((id) => {
      const a = document.getElementById(id);
      return a && a.checkVisibility() ? a.getAttribute("href") : null;
    }));
    igual("precios.html la ofrece arriba, en «Pruébalo gratis» y en el cierre", enlaces, ["prueba-gratis.html", "prueba-gratis.html", "prueba-gratis.html"]);
    await page.close();
  }
}

async function pruebaAviso(browser) {
  console.log("\n=== El aviso de la Academia durante y después de la prueba ===");
  const ALUMNA = { id: "u-ana", full_name: "Ana Rojas", role: "alumno", is_admin: false };
  const base = (mi) => ({
    yo: ALUMNA.id,
    tablas: { profiles: [ALUMNA], ajustes_academia: [{ clave: "whatsapp_consultas", valor: "8309-2291" }] },
    rpc: { mi_acceso: mi },
  });
  {
    const { page } = await abrir(browser, "logros.html", base({ vigente: false, motivo: "prueba_vencida", exigido: false, vence: "2026-09-20T15:00:00+00:00", horas: 0 }));
    await page.waitForTimeout(400);
    igual("con la prueba vencida se tapa la página (aunque el interruptor esté apagado)", [await vis(page, "#main-content"), await vis(page, "#acceso-aviso")], [false, true]);
    igual("el título lo dice", (await page.textContent("#acceso-aviso h1")).trim(), "Tu prueba gratis terminó");
    cierto("con la fecha en que terminó", /terminó el 20 de septiembre/.test(await page.textContent("#acceso-aviso")));
    const hrefs = await page.evaluate(() => [...document.querySelectorAll("#acceso-aviso a")].map((a) => a.getAttribute("href")));
    cierto("y las dos salidas: los precios y el WhatsApp", hrefs.includes("precios.html") && hrefs.some((h) => /^https:\/\/wa\.me\/50683092291\?text=/.test(h)), hrefs.join(" "));
    await page.close();
  }
  {
    const { page } = await abrir(browser, "logros.html", base({ vigente: true, motivo: "prueba", exigido: false, vence: "2099-01-01T00:00:00+00:00", horas: 50 }));
    await page.waitForTimeout(400);
    igual("durante la prueba, fuera del panel no se tapa ni se avisa nada", [await vis(page, "#acceso-aviso"), await vis(page, "#acceso-franja")], [false, false]);
    await page.close();
  }
  {
    const { page } = await abrir(browser, "clases.html", base({ vigente: true, motivo: "prueba", exigido: false, vence: "2099-01-01T00:00:00+00:00", horas: 50 }));
    await page.waitForSelector("#acceso-franja", { timeout: 5000 }).catch(() => {});
    const t = (await vis(page, "#acceso-franja")) ? await page.textContent("#acceso-franja") : "";
    cierto("en el panel se avisa cuánto le queda", /te quedan 2 días/.test(t), t);
    cierto("con la salida a los precios", /elige tu plan/.test(t));
    await page.close();
  }
}

(async () => {
  pruebaBase();
  pruebaFuncion();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaPagina(browser);
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
