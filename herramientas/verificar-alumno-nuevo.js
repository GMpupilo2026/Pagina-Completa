/* Comprueba alumno-nuevo.html —la página de la ficha «Crear cuenta de alumno»
   del panel— en un navegador de verdad, con un Supabase de mentira:

     · Con invitaciones: dice cuántas le quedan, abre la caja compartida
       (js/alta-alumno.js), manda a create-student lo que se escribió y, al
       volver, cuenta de nuevo con lo que dice la base (no restando en
       pantalla).
     · Con la última gastada: la página se bloquea sola y dice que hace falta
       un plan mayor, con el enlace a los paquetes.
     · Si la base contesta `sin_cupo` (otra pestaña gastó la última), la caja
       se cierra, avisa con el botón a los planes y la página queda bloqueada.
     · Quien no da clase no entra.

   Quien de verdad pone el tope es la base (consumir_invitacion(), desde la
   Edge Function); esto comprueba que la pantalla lo diga como es.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-alumno-nuevo.js                     */
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

/* El perfil vive en la página y la Edge Function de mentira lo gasta como
   consumir_invitacion(): suma una usada si queda alguna y si no contesta
   sin_cupo. `window.__gastarAparte()` es la otra pestaña que gasta la última
   a escondidas. */
function clienteFalso(perfil) {
  return `
window.__edge = [];
window.SUPABASE_URL = "https://ejemplo.supabase.co";
window.SUPABASE_ANON_KEY = "anon-de-mentira";
(function () {
  const PERFIL = ${JSON.stringify(perfil)};
  window.__perfil = PERFIL;
  window.__gastarAparte = () => { PERFIL.invitaciones_usadas = PERFIL.invitaciones_max; };
  const original = window.fetch;
  window.fetch = function (url, opciones) {
    const u = String(url);
    if (u.indexOf("/functions/v1/") !== -1) {
      const cuerpo = JSON.parse((opciones && opciones.body) || "{}");
      window.__edge.push({ url: u, cuerpo: cuerpo });
      let r, status = 200;
      if (PERFIL.is_admin || PERFIL.invitaciones_usadas < PERFIL.invitaciones_max) {
        PERFIL.invitaciones_usadas += 1;
        r = { ok: true, alumno_id: "u-nuevo", email: cuerpo.email, restantes: PERFIL.invitaciones_max - PERFIL.invitaciones_usadas };
      } else {
        status = 403;
        r = { error: "Ya usaste tus invitaciones", sin_cupo: true, max: PERFIL.invitaciones_max, usadas: PERFIL.invitaciones_usadas };
      }
      return Promise.resolve(new Response(JSON.stringify(r), { status: status, headers: { "Content-Type": "application/json" } }));
    }
    return original.apply(this, arguments);
  };
  function constructor(filas) {
    let unica = false;
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; },
      eq(col, val) { filas = filas.filter((f) => String(f[col]) === String(val)); return b; },
      maybeSingle() { unica = true; return b; }, single() { unica = true; return b; },
      then(res, rej) {
        // Copias: la página no puede ver el perfil cambiar si no lo vuelve a pedir.
        let d = filas.map((f) => Object.assign({}, f));
        if (unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: PERFIL.id }, access_token: "t" } } }) },
    from: (t) => constructor(t === "profiles" ? [PERFIL] : []),
    rpc: (n) => {
      if (n === "mis_funciones_coordinacion") return Promise.resolve({ data: [], error: null });
      return constructor([]);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  };
})();
`;
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(nombre, v) { if (v) console.log("  ✓ " + nombre); else { console.log("  ✗ " + nombre); fallos += 1; } }

async function abrir(browser, perfil) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.addInitScript(contestarAvisos);
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfil) }));
  await page.goto(BASE + "/alumno-nuevo.html", { waitUntil: "networkidle" });
  return { ctx, page, errores };
}

const VISTO = () => ({
  cupo: document.getElementById("cupo").checkVisibility(),
  bloqueo: document.getElementById("sin-cupo").checkVisibility(),
  boton: document.getElementById("crear-btn").checkVisibility(),
  texto: document.getElementById("cupo-texto").textContent,
  aviso: document.getElementById("sin-cupo-texto").textContent,
  planes: (document.querySelector("#sin-cupo a") || {}).getAttribute
    ? document.querySelector("#sin-cupo a").getAttribute("href") : null,
});

const PROFE = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false, es_supervisor: false,
                full_name: "Sebastián Mora", email: "seba@x.cr", invitaciones_max: 2, invitaciones_usadas: 0 };

async function pruebaConInvitaciones(browser) {
  console.log("\n=== Con invitaciones: crea la cuenta y vuelve a contar ===");
  const { ctx, page, errores } = await abrir(browser, PROFE);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  let v = await page.evaluate(VISTO);
  igual("se ve el cupo y el botón, no el bloqueo", [v.cupo, v.boton, v.bloqueo], [true, true, false]);
  igual("dice cuántas le quedan", v.texto, "Te quedan 2 invitaciones de 2.");

  await page.click("#crear-btn");
  await page.waitForSelector("#alta-fondo:not(.hidden)");
  igual("abre la caja de siempre, en blanco y sin selector de profesor",
    await page.evaluate(() => [document.getElementById("alta-titulo").textContent,
      document.getElementById("alta-alumno-nombre").value, document.getElementById("alta-profesor").checkVisibility()]),
    ["Crear una cuenta de alumno", "", false]);
  igual("y dice que queda en su clase", await page.evaluate(() => document.getElementById("alta-asignado").textContent),
    "queda asignado a tu clase");
  await page.fill("#alta-alumno-nombre", "Ana Rojas");
  await page.fill("#alta-alumno-correo", "ana@x.cr");
  await page.click("#alta-enviar");
  await page.waitForFunction(() => document.getElementById("alta-fondo").classList.contains("hidden"), null, { timeout: 10000 });
  const llamada = await page.evaluate(() => window.__edge[0]);
  igual("manda a create-student", /\/functions\/v1\/create-student$/.test(llamada.url), true);
  igual("con lo que se escribió", [llamada.cuerpo.full_name, llamada.cuerpo.email], ["Ana Rojas", "ana@x.cr"]);
  await page.waitForFunction(() => /queda 1 /.test(document.getElementById("cupo-texto").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("al volver, lo que dice la base", await page.evaluate(() => document.getElementById("cupo-texto").textContent),
    "Te queda 1 invitación de 2.");
  igual("el foco vuelve al botón", await page.evaluate(() => document.activeElement.id), "crear-btn");

  // La última: la página se bloquea sola.
  await page.click("#crear-btn");
  await page.waitForSelector("#alta-fondo:not(.hidden)");
  await page.fill("#alta-alumno-nombre", "Bruno Mena");
  await page.fill("#alta-alumno-correo", "bruno@x.cr");
  await page.click("#alta-enviar");
  await page.waitForFunction(() => document.getElementById("sin-cupo").checkVisibility(), null, { timeout: 5000 }).catch(() => {});
  v = await page.evaluate(VISTO);
  igual("gastada la última, se bloquea: sin botón y con el aviso", [v.cupo, v.boton, v.bloqueo], [false, false, true]);
  cierto("el aviso dice que hace falta un plan mayor: " + v.aviso, /Ya usaste tus 2 invitaciones/.test(v.aviso) && /plan mayor/.test(v.aviso));
  igual("con el enlace a los paquetes", v.planes, "precios.html#t-paquetes");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaSinInvitaciones(browser) {
  console.log("\n=== Sin invitaciones: bloqueada desde que abre ===");
  for (const [que, max, esperado] of [["las usó todas", 5, /Ya usaste tus 5 invitaciones/], ["nunca tuvo", 0, /no trae invitaciones/]]) {
    const { ctx, page, errores } = await abrir(browser, Object.assign({}, PROFE, { invitaciones_max: max, invitaciones_usadas: max }));
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    const v = await page.evaluate(VISTO);
    igual(que + ": ni cupo ni botón, solo el bloqueo", [v.cupo, v.boton, v.bloqueo], [false, false, true]);
    cierto(que + ": dice qué pasó y que adquiera un plan mayor: " + v.aviso, esperado.test(v.aviso) && /plan mayor/.test(v.aviso));
    igual(que + ": la caja ni existe en pantalla", await page.evaluate(() =>
      !!document.getElementById("alta-fondo") && document.getElementById("alta-fondo").checkVisibility()), false);
    igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();
  }
}

async function pruebaOtraPestana(browser) {
  console.log("\n=== Otra pestaña gastó la última: lo dice la base ===");
  const { ctx, page, errores } = await abrir(browser, Object.assign({}, PROFE, { invitaciones_max: 3, invitaciones_usadas: 2 }));
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.evaluate(() => { window.__cancelarAvisos = true; });
  await page.click("#crear-btn");
  await page.waitForSelector("#alta-fondo:not(.hidden)");
  await page.evaluate(() => window.__gastarAparte());
  await page.fill("#alta-alumno-nombre", "Carla Soto");
  await page.fill("#alta-alumno-correo", "carla@x.cr");
  await page.click("#alta-enviar");
  await page.waitForFunction(() => (window.__avisos || []).length > 0, null, { timeout: 10000 }).catch(() => {});
  const aviso = await page.evaluate(() => window.__avisos.join(" | "));
  cierto("avisa que no quedan, con un plan mayor y el botón a los planes: " + aviso,
    /No te quedan invitaciones/.test(aviso) && /plan mayor/.test(aviso) && /Ver los planes/.test(aviso));
  await page.waitForFunction(() => document.getElementById("sin-cupo").checkVisibility(), null, { timeout: 5000 }).catch(() => {});
  igual("la caja se cerró y la página quedó bloqueada", await page.evaluate(() =>
    [document.getElementById("alta-fondo").checkVisibility(), document.getElementById("sin-cupo").checkVisibility()]), [false, true]);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaAdmin(browser) {
  console.log("\n=== Quien administra: sin tope ===");
  const { ctx, page, errores } = await abrir(browser, Object.assign({}, PROFE, { id: "u-admin", role: "admin", is_admin: true, invitaciones_max: 0, invitaciones_usadas: 0 }));
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  const v = await page.evaluate(VISTO);
  igual("con el botón, sin bloqueo", [v.boton, v.bloqueo], [true, false]);
  cierto("y dice que no tiene tope: " + v.texto, /no tienes tope/.test(v.texto));
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== Quien no da clase no entra ===");
  const { ctx, page } = await abrir(browser, Object.assign({}, PROFE, { id: "u-ana", role: "alumno" }));
  await page.waitForSelector("#denegado:not(.hidden)", { timeout: 20000 });
  igual("ve el aviso y no la página", await page.evaluate(() =>
    [document.getElementById("denegado").checkVisibility(), document.getElementById("app").checkVisibility()]), [true, false]);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaConInvitaciones(browser);
    await pruebaSinInvitaciones(browser);
    await pruebaOtraPestana(browser);
    await pruebaAdmin(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nalumno-nuevo.html dice el cupo como es y se bloquea sin invitaciones.");
  process.exit(fallos ? 1 : 0);
})();
