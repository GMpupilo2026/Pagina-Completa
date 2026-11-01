/* Las cuentas de invitado del Centroamericano 2026: 5 días de la Academia que
 * cada persona se abre sola desde centroamericano-2026.html, del 1 al 9 de
 * noviembre. Ver «Las cuentas de invitado del Centroamericano» en
 * docs/decisiones/cobros-acceso-y-tienda.md.
 *
 * Lo que se rompe acá no da error: una cuenta sin su fila de vencimiento es
 * Academia gratis para siempre; unas fechas que la página y la base no
 * comparten abren un formulario que la base rechaza (o al revés); y un panel
 * que dice «3 días» a una cuenta de 5 confunde a quien la abrió.
 *
 *   1. LA BASE (la migración): fechas en un solo lugar, 5 días y su origen,
 *      solo la service role.
 *   2. LA FUNCIÓN `cuenta-invitado`: freno → crear bloqueada → activar →
 *      desbloquear, y borrar si algo falla.
 *   3. LA PÁGINA, con la función de mentira: la sección, la ventana fuera de
 *      fechas y dentro, los errores, la cuenta creada, el francés y la
 *      invitación desde los juegos de invitado.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-cuenta-invitado.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { fallos++; console.log("  ✗ " + nombre + (detalle ? " — " + String(detalle).slice(0, 600) : "")); }
}

/* ---------------- 1. la base ---------------- */
console.log("1. La base");
const migs = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /cuentas_invitado/.test(f)).sort();
ok("la migración está guardada", migs.length >= 1, migs.join(", "));
const sql = migs.map((f) => leer("supabase/migraciones/" + f)).join("\n");
const fn = (nombre) => (sql.match(new RegExp("function (public|interno)\\." + nombre + "\\([\\s\\S]*?\\$function\\$;")) || [""])[0];
const abiertas = fn("cuentas_invitado_abiertas"), frenar = fn("cuenta_invitado_frenar"), activar = fn("cuenta_invitado_activar");
const fechasBase = (abiertas.match(/between date '(\d{4}-\d{2}-\d{2})' and date '(\d{4}-\d{2}-\d{2})'/) || []).slice(1);
ok("las fechas están en un solo lugar de la base: del 1 al 9 de noviembre", JSON.stringify(fechasBase) === '["2026-11-01","2026-11-09"]', fechasBase);
ok("el freno mira las fechas antes que nada", /if not interno\.cuentas_invitado_abiertas\(\(now\(\) at time zone 'America\/Costa_Rica'\)::date\)/.test(frenar) && /frenar_envio_publico\('cuenta_evento'/.test(frenar));
ok("la activación vuelve a mirar las fechas, la aceptación legal y que la cuenta sea nueva",
   /cuentas_invitado_abiertas/.test(activar) && /version_legal_valida/.test(activar) && /created_at > now\(\) - interval '10 minutes'/.test(activar) && /role = 'alumno'/.test(activar));
ok("dura 5 días y queda marcada con su origen", /now\(\) \+ interval '5 days'/.test(activar) && /'centroamericano-2026'\)/.test(activar));
for (const f of ["cuenta_invitado_frenar(text)", "cuenta_invitado_activar(uuid, text, text, text, text)"]) {
  const esc = f.replace(/[()]/g, "\\$&");
  ok("«" + f.split("(")[0] + "» solo la llama la service role",
     new RegExp("revoke execute on function public\\." + esc + " from public, anon, authenticated;").test(sql) &&
     new RegExp("grant execute on function public\\." + esc + " to service_role;").test(sql));
}
ok("el tipo de freno nuevo existe", /when 'cuenta_evento' then tope_ip := \d+;/.test(sql));
ok("mi_acceso() dice de dónde salió la prueba y cuántos días eran", /'origen', v_origen/.test(sql) && /'dias_total'/.test(sql));

/* ---------------- 2. la función ---------------- */
console.log("2. La función");
const ts = leer("supabase/functions/cuenta-invitado/index.ts");
const pos = (t) => ts.indexOf(t);
ok("frena antes de crear, crea bloqueada, activa y solo entonces desbloquea",
   pos('rpc("cuenta_invitado_frenar"') > 0 && pos('rpc("cuenta_invitado_frenar"') < pos("createUser(") &&
   /ban_duration: "876000h"/.test(ts) && pos("createUser(") < pos('rpc("cuenta_invitado_activar"') &&
   pos('rpc("cuenta_invitado_activar"') < pos('ban_duration: "none"'));
ok("si la activación o el desbloqueo fallan, la cuenta se borra", (ts.match(/deleteUser\(id\)/g) || []).length >= 2);
ok("la IP sale de la petición y va al freno y a la fila", /cf-connecting-ip/.test(ts) && /p_ip: ip/.test(ts));
ok("solo responde al sitio (CORS)", /"Access-Control-Allow-Origin": SITE_URL/.test(ts));
ok("la misma regla de contraseña de las demás puertas", /problemaDeContrasena\(contrasena\)/.test(ts));
ok("se arma con usuario-alumno.ts", /"cuenta-invitado": \["usuario-alumno\.ts"\]/.test(leer("herramientas/funciones-armar.js")));
ok("el README dice que va con verify_jwt en false", /## `cuenta-invitado` va con `verify_jwt` en \*\*false\*\*/.test(leer("supabase/functions/README.md")));

/* ---------------- 3. la página ---------------- */
const js = leer("js/centroamericano-academia.js");
const fechasPagina = [(js.match(/DESDE = "([\d-]+)"/) || [])[1], (js.match(/HASTA = "([\d-]+)"/) || [])[1]];
ok("la página y la base dicen las mismas fechas", JSON.stringify(fechasPagina) === JSON.stringify(fechasBase), fechasPagina);
const inv = leer("js/invitado-centroamericano.js");
ok("y el modo invitado de los juegos, también", /DESDE = "2026-11-01", HASTA = "2026-11-09"/.test(inv));
const av = leer("js/acceso-vigente.js");
ok("el panel dice los días y el nombre de la cuenta, no siempre «prueba gratis de 3 días»", /a\.dias_total \|\| 3/.test(av) && /centroamericano-2026/.test(av) && !/prueba gratis de 3 días terminó/.test(av));
ok("la lista de administración lee solo las del Centroamericano, de mil en mil",
   /\.eq\("origen", "centroamericano-2026"\)/.test(leer("js/prueba-gratis.js")) && /\.range\(desde, desde \+ 999\)/.test(leer("js/prueba-gratis.js")));

(async () => {
  console.log("3. La página");
  const { chromium } = require("playwright");
  const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    const abrir = async (fecha, respuesta, extra) => {
      const ctx = await nav.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: "block" });
      const p = await ctx.newPage();
      p.errores = [];
      p.pedidos = [];
      p.on("pageerror", (e) => p.errores.push(e.message));
      await p.clock.setFixedTime(new Date(fecha));
      await p.route(/lichess\.org|chess-results|functions\/v1\/sala-jugadores/, (r) => r.abort());
      await p.route(/functions\/v1\/cuenta-invitado/, async (r) => {
        p.pedidos.push(JSON.parse(r.request().postData() || "{}"));
        const [status, body] = respuesta || [200, { ok: true, usuario: "sofia.munoz", correo: "sofia.munoz@alumno.ajedrez-integral.com", vence: "2026-11-07T16:00:00Z" }];
        await r.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
      });
      await p.route(/auth\/v1\/token/, (r) => r.fulfill({ status: 400, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "invalid_grant" }) }));
      await p.goto(BASE + "/centroamericano-2026.html" + (extra || ""), { waitUntil: "load" });
      await p.waitForTimeout(500);
      return p;
    };
    const ventana = (p) => p.evaluate(() => {
      const d = document.getElementById("cuenta-gratis");
      return { abierta: d.open, form: !!d.querySelector("form") && d.querySelector("form").checkVisibility(), cerrada: d.querySelector("[data-cerrada]") ? d.querySelector("[data-cerrada]").textContent : "",
        wa: [...d.querySelectorAll("a[href^='https://wa.me/']")].length, titulo: document.getElementById("cuenta-gratis-titulo").textContent };
    });

    // Antes del festival: la sección se ve, la ventana no tiene formulario.
    const p0 = await abrir("2026-10-31T19:00:00-06:00");
    const sec = await p0.evaluate(() => { const s = document.getElementById("conoce");
      return { ve: s.checkVisibility(), titulo: s.querySelector("h2").textContent, cosas: s.querySelectorAll(".cac-conoce-cosa").length,
        crear: !!s.querySelector('a[href="#cuenta-gratis"]'), precios: !!s.querySelector('a[href="precios.html"]'), wa: !!s.querySelector("a[href^='https://wa.me/']"),
        banda: !!document.querySelector('.cac-academia a[href="#conoce"]') }; });
    ok("«Conoce la Academia» se ve: qué hace la Academia, la cuenta gratis, los precios y el WhatsApp",
       sec.ve && sec.titulo === "Esta página la hace una academia de ajedrez" && sec.cosas === 4 && sec.crear && sec.precios && sec.wa && sec.banda, JSON.stringify(sec));
    await p0.click("[data-crear-cuenta]");
    await p0.waitForTimeout(200);
    const v0 = await ventana(p0);
    ok("antes del 1 de noviembre la ventana no trae formulario: dice cuándo abre y da el WhatsApp",
       v0.abierta && !v0.form && /del 1 al 9 de noviembre de 2026\./.test(v0.cerrada) && !/ya se cerraron/.test(v0.cerrada) && v0.wa === 1, JSON.stringify(v0));
    await p0.context().close();

    // Durante: el formulario, sus errores y la cuenta creada.
    const p = await abrir("2026-11-02T10:00:00-06:00");
    await p.click("[data-crear-cuenta]");
    await p.waitForTimeout(200);
    ok("durante el festival, el formulario", (await ventana(p)).form);
    const error = () => p.$eval("#cuenta-gratis .cac-cuenta-error", (e) => e.checkVisibility() ? e.textContent : "");
    await p.click("#cuenta-gratis button[type=submit]");
    ok("sin nombre, lo dice y no manda nada", (await error()) === "Escribe tu nombre y apellido." && p.pedidos.length === 0);
    await p.fill("#cuenta-nombre", "Sofía Muñoz Pérez");
    await p.fill("#cuenta-clave", "corta");
    await p.click("#cuenta-gratis button[type=submit]");
    ok("con una contraseña corta, lo dice", /al menos 8 caracteres/.test(await error()) && p.pedidos.length === 0);
    await p.fill("#cuenta-clave", "torre-alfil-77");
    await p.click("#cuenta-gratis button[type=submit]");
    ok("sin aceptar la política y los términos, no se crea", /Política de privacidad/.test(await error()) && p.pedidos.length === 0);
    const enlaces = await p.$$eval("#cuenta-gratis .cac-cuenta-acepto a", (l) => l.map((a) => a.getAttribute("href")));
    ok("la casilla enlaza la política y la parte de los términos de esta cuenta", JSON.stringify(enlaces) === '["privacidad.html","terminos.html#cuenta-centroamericano"]', enlaces);
    await p.check("#cuenta-acepto");
    await p.click("#cuenta-gratis button[type=submit]");
    await p.waitForSelector("#cuenta-gratis [data-creada]", { timeout: 4000 }).catch(() => {});
    const legal = await p.evaluate(() => window.LegalVersion);
    ok("manda el nombre, la contraseña y las versiones legales vigentes",
       p.pedidos.length === 1 && p.pedidos[0].nombre === "Sofía Muñoz Pérez" && p.pedidos[0].contrasena === "torre-alfil-77" &&
       p.pedidos[0].privacidad_version === legal.PRIVACIDAD && p.pedidos[0].terminos_version === legal.TERMINOS, JSON.stringify(p.pedidos));
    const lista = await p.evaluate(() => { const c = document.querySelector("#cuenta-gratis [data-creada]");
      const d = (k) => (c.querySelector('[data-dato="' + k + '"]') || {}).textContent;
      return c ? { t: c.querySelector(".cac-cuenta-lista-titulo").textContent, u: d("usuario"), c: d("clave"), h: d("hasta"), foco: document.activeElement.className } : null; });
    ok("creada: el usuario que dio el servidor, la contraseña para anotar y hasta cuándo, en hora de Costa Rica",
       lista && lista.t === "¡Listo, Sofía! Tu cuenta está abierta" && lista.u === "sofia.munoz" && lista.c === "torre-alfil-77" && /^7 de noviembre, 10:00/.test(lista.h) && /lista-titulo/.test(lista.foco), JSON.stringify(lista));
    await p.click("[data-entrar]");
    await p.waitForTimeout(400);
    const aviso = await p.$eval("#cuenta-gratis [data-creada] .cac-cuenta-error", (e) => e.checkVisibility() ? e.textContent + "|" + (e.querySelector("a") || {}).getAttribute("href") : "");
    ok("si no puede entrar sola, lo dice y lleva a iniciar sesión", /no pudimos entrar solos/.test(aviso) && /\|login\.html$/.test(aviso), aviso);
    ok("sin errores en la página", !p.errores.length, p.errores.join(" | "));
    await p.context().close();

    // Lo que dice la base (el freno, las fechas) se muestra tal cual.
    const pf = await abrir("2026-11-02T10:00:00-06:00", [429, { error: "Llegaron demasiados envíos seguidos desde tu conexión. Espera un rato e intenta de nuevo." }], "#cuenta-gratis");
    await pf.waitForTimeout(200);
    ok("entrar con #cuenta-gratis abre la ventana con el formulario", (await ventana(pf)).form);
    await pf.fill("#cuenta-nombre", "Ana Rojas"); await pf.fill("#cuenta-clave", "jaque-mate-12"); await pf.check("#cuenta-acepto");
    await pf.click("#cuenta-gratis button[type=submit]");
    await pf.waitForTimeout(400);
    ok("el freno de la base se le dice a la persona", /^Llegaron demasiados envíos/.test(await pf.$eval("#cuenta-gratis .cac-cuenta-error", (e) => e.textContent)));
    await pf.context().close();

    // Después del festival y en francés.
    const pd = await abrir("2026-11-10T10:00:00-06:00", null, "?lang=fr");
    const fr = await pd.evaluate(() => document.querySelector("#conoce h2").textContent);
    await pd.click("[data-crear-cuenta]");
    await pd.waitForTimeout(200);
    const vd = await ventana(pd);
    ok("en francés, y después del festival la ventana dice que ya se cerró",
       fr === "Cette page est faite par une académie d'échecs" && vd.titulo === "Votre compte gratuit de 5 jours" && !vd.form && /maintenant fermés/.test(vd.cerrada), JSON.stringify({ fr, vd }));
    await pd.context().close();

    // Los juegos de invitado invitan a seguir con la cuenta.
    const ctx = await nav.newContext({ viewport: { width: 420, height: 800 }, serviceWorkers: "block" });
    const pj = await ctx.newPage();
    await pj.clock.setFixedTime(new Date("2026-11-02T10:00:00-06:00"));
    await pj.goto(BASE + "/entreno/aprende-a-jugar.html?invitado=centroamericano", { waitUntil: "load" });
    await pj.waitForTimeout(800);
    const cta = await pj.evaluate(() => { const a = document.querySelector("#franja-invitado [data-cuenta-gratis]");
      return a ? { href: a.getAttribute("href"), target: a.target, ve: a.checkVisibility() } : null; });
    ok("«Aprende a jugar» como invitado lleva a la cuenta gratis (sale de la ventana con target _top)",
       cta && cta.ve && cta.href === "../centroamericano-2026.html#cuenta-gratis" && cta.target === "_top", JSON.stringify(cta));
    await ctx.close();

    // La lista de administración (prueba-gratis.html), con una base de mentira
    // que filtra de verdad por el origen y avisa si se pide sin rango.
    const ctxa = await nav.newContext({ viewport: { width: 520, height: 900 }, serviceWorkers: "block" });
    await ctxa.addInitScript(() => {
      const ahora = Date.parse("2026-11-04T12:00:00-06:00");
      const filas = [
        { alumno_id: "a", empieza: "2026-11-03T15:00:00Z", vence: "2026-11-08T15:00:00Z", origen: "centroamericano-2026", profiles: { full_name: "Sofía Muñoz", email: "sofia.munoz@alumno.ajedrez-integral.com" } },
        { alumno_id: "b", empieza: "2026-10-28T15:00:00Z", vence: "2026-11-02T15:00:00Z", origen: "centroamericano-2026", profiles: { full_name: "<b>Ana</b>", email: "ana.rojas@alumno.ajedrez-integral.com" } },
        { alumno_id: "c", empieza: "2026-11-01T15:00:00Z", vence: "2026-11-04T15:00:00Z", origen: null, profiles: { full_name: "Prueba de 3 días", email: "x@alumno.ajedrez-integral.com" } },
      ];
      window.__sinRango = false;
      Date.now = () => ahora;
      const consulta = () => { const f = {}; let rango = null; const q = {
        select() { return q; }, order() { return q; },
        eq(k, v) { f[k] = v; return q; },
        range(a, b) { rango = [a, b]; return q; },
        then(res) { if (!rango) window.__sinRango = true; res({ data: filas.filter((r) => Object.keys(f).every((k) => r[k] === f[k])), error: null }); },
      }; return q; };
      window.sb = { auth: { getSession: async () => ({ data: { session: { user: { id: "admin" } } } }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } },
        rpc: async (n) => ({ data: n === "soy_admin" ? true : null, error: null }), from: () => consulta(), functions: { invoke: async () => ({ data: null, error: null }) } };
    });
    const pa = await ctxa.newPage();
    await pa.goto(BASE + "/prueba-gratis.html", { waitUntil: "load" });
    await pa.waitForTimeout(600);
    const adm = await pa.evaluate(() => { const c = document.getElementById("invitados");
      return { ve: c.checkVisibility(), resumen: document.getElementById("invitados-resumen").textContent,
        filas: [...c.querySelectorAll("#invitados-lista li")].map((li) => li.innerText.replace(/\s+/g, " ").trim()), html: c.innerHTML.includes("<b>Ana</b>"), sinRango: window.__sinRango }; });
    ok("administración ve solo las cuentas del Centroamericano, cuántas, abiertas y cerradas, con el estado escrito",
       adm.ve && adm.resumen === "2 cuentas · 1 abierta · 1 cerrada" && adm.filas.length === 2 && /^Sofía Muñoz sofia\.munoz Abierta/.test(adm.filas[0]) && /Cerrada/.test(adm.filas[1]) && !adm.sinRango, JSON.stringify(adm));
    ok("el nombre que escribió la persona va como texto, no como HTML", !adm.html && /<b>Ana<\/b>/.test(adm.filas[1] || ""));
    await ctxa.close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
