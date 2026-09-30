/* La verificación en dos pasos, en el navegador.

   Con un doble de Supabase (js/vendor/supabase.js se cambia por uno que
   arma `sb` con `auth.mfa`; acá no se sale a la red). Lo que comprueba:

   - login.html: una cuenta CON la verificación, después de la contraseña, ve
     el paso del código y no entra hasta ponerlo; un código malo lo dice y no
     entra; el bueno la lleva a donde iba. Una cuenta SIN ella entra directo.
   - La sesión a medias: una página de la Academia manda al login a poner el
     código, y el login pide el código en vez de devolverla (sin rueda).
   - configuracion.html: quien da clase ve la tarjeta, la activa con el QR y el
     primer código, y la quita con dos toques. Un alumno no la ve.

   Quien EXIGE el segundo paso es la base (public.antes_de_cada_pedido); eso se
   comprobó impersonando roles en SQL (ver «La verificación en dos pasos» en
   docs/decisiones/permisos-y-roles.md). Esto comprueba las pantallas.

       node herramientas/verificar-dos-pasos.js                              */
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

/* El doble. Su estado vive en localStorage («__doble») para sobrevivir a las
   navegaciones: { sesion, aal, rol, factores: [{id, status}] }. El código
   bueno es siempre 123456. */
const DOBLE = `
(function () {
  function leer() { try { return JSON.parse(localStorage.getItem("__doble")) || {}; } catch (e) { return {}; } }
  function guardar(e) { localStorage.setItem("__doble", JSON.stringify(e)); }
  function sesion(e) {
    if (!e.sesion) return null;
    return { access_token: "t", refresh_token: "r", expires_at: 4102444800,
             user: { id: "u1", email: "profe@ejemplo.com", factors: (e.factores || []).map(function (f) { return { id: f.id, status: f.status, factor_type: "totp" }; }) } };
  }
  function consulta(tabla) {
    var unico = false;
    var q = new Proxy({}, {
      get: function (_, k) {
        if (k === "then") {
          var e = leer();
          var perfil = { id: "u1", full_name: "Profe Prueba", email: "profe@ejemplo.com", role: e.rol || "profesor", is_admin: false, es_supervisor: false };
          var data = tabla === "profiles" ? (unico ? perfil : [perfil]) : (unico ? null : []);
          var r = { data: data, error: null, count: 0 };
          return function (ok) { return Promise.resolve(r).then(ok); };
        }
        if (k === "single" || k === "maybeSingle") return function () { unico = true; return q; };
        return function () { return q; };
      },
    });
    return q;
  }
  var mfa = {
    getAuthenticatorAssuranceLevel: async function () {
      var e = leer();
      if (!e.sesion) return { data: { currentLevel: null, nextLevel: null }, error: null };
      var activa = (e.factores || []).some(function (f) { return f.status === "verified"; });
      return { data: { currentLevel: e.aal || "aal1", nextLevel: activa ? "aal2" : "aal1" }, error: null };
    },
    listFactors: async function () {
      var todos = (leer().factores || []).map(function (f) { return { id: f.id, status: f.status, factor_type: "totp" }; });
      return { data: { all: todos, totp: todos.filter(function (f) { return f.status === "verified"; }) }, error: null };
    },
    challengeAndVerify: async function (p) {
      var e = leer();
      if (p.code !== "123456") return { data: null, error: { message: "Invalid TOTP code entered" } };
      (e.factores || []).forEach(function (f) { if (f.id === p.factorId) f.status = "verified"; });
      e.aal = "aal2"; guardar(e);
      return { data: {}, error: null };
    },
    enroll: async function () {
      var e = leer(); e.factores = e.factores || [];
      e.factores.push({ id: "f-nuevo", status: "unverified" }); guardar(e);
      return { data: { id: "f-nuevo", totp: { qr_code: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>", secret: "CLAVESECRETA" } }, error: null };
    },
    unenroll: async function (p) {
      var e = leer();
      var f = (e.factores || []).find(function (x) { return x.id === p.factorId; });
      if (f && f.status === "verified" && e.aal !== "aal2") return { data: null, error: { message: "AAL2 required" } };
      e.factores = (e.factores || []).filter(function (x) { return x.id !== p.factorId; }); guardar(e);
      return { data: {}, error: null };
    },
  };
  window.supabase = { createClient: function () {
    return {
      auth: {
        mfa: mfa,
        getSession: async function () { return { data: { session: sesion(leer()) }, error: null }; },
        getUser: async function () { var s = sesion(leer()); return { data: { user: s && s.user }, error: null }; },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
        signInWithPassword: async function (p) {
          var e = leer();
          if (p.password !== "clave-buena") return { data: null, error: { message: "Invalid login credentials" } };
          e.sesion = true; e.aal = "aal1"; guardar(e);
          return { data: { session: sesion(e) }, error: null };
        },
        signOut: async function () { var e = leer(); e.sesion = false; guardar(e); return { error: null }; },
        refreshSession: async function () { return { data: { session: sesion(leer()) }, error: null }; },
      },
      from: consulta,
      rpc: function () { return consulta("rpc"); },
      channel: function () { var c = { on: function () { return c; }, subscribe: function () { return c; }, send: function () {} }; return c; },
      removeChannel: function () {},
      functions: { invoke: async function () { return { data: null, error: null }; } },
      storage: { from: function () { return { getPublicUrl: function () { return { data: { publicUrl: "" } }; } }; } },
    };
  } };
})();
`;

async function contexto(browser, estado) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((e) => {
    try { if (!sessionStorage.getItem("__sembrado")) { localStorage.setItem("__doble", JSON.stringify(e)); sessionStorage.setItem("__sembrado", "1"); } } catch (x) { }
  }, estado);
  await ctx.route("**/*", (ruta) => {
    const url = ruta.request().url();
    if (url.startsWith(BASE + "/js/vendor/supabase.js")) return ruta.fulfill({ status: 200, contentType: "application/javascript", body: DOBLE });
    if (url.startsWith(BASE)) return ruta.continue();
    return ruta.fulfill({ status: 200, body: "", contentType: "text/plain" });
  });
  return ctx;
}

const visible = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.checkVisibility(); }, sel);
const texto = (page, sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || "", sel);
const ruta = (page) => new URL(page.url()).pathname;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  console.log("\nEntrar con la verificación activada");
  {
    const ctx = await contexto(browser, { sesion: false, factores: [{ id: "f1", status: "verified" }] });
    const page = await ctx.newPage();
    await page.goto(BASE + "/login.html?next=tareas.html", { waitUntil: "load" });
    await page.fill("#email", "profe@ejemplo.com");
    await page.fill("#password", "clave-buena");
    await page.click("#submit-btn");
    await page.waitForTimeout(400);
    cierto("después de la contraseña se ve el paso del código", await visible(page, "#codigo-form"));
    cierto("y ya no el de la contraseña", !(await visible(page, "#login-form")));
    cierto("no entró: sigue en el login", ruta(page) === "/login.html", page.url());
    await page.fill("#codigo", "000000");
    await page.click("#codigo-btn");
    await page.waitForTimeout(300);
    cierto("un código malo lo dice", /no es/.test(await texto(page, "#codigo-msg")) && ruta(page) === "/login.html", await texto(page, "#codigo-msg"));
    await page.fill("#codigo", "12345");
    await page.click("#codigo-btn");
    await page.waitForTimeout(200);
    cierto("un código de 5 números también", /6 números/.test(await texto(page, "#codigo-msg")));
    await page.fill("#codigo", "123456");
    await Promise.all([page.waitForURL("**/tareas.html", { timeout: 5000 }).catch(() => {}), page.click("#codigo-btn")]);
    cierto("el código bueno la lleva a donde iba", ruta(page) === "/tareas.html", page.url());
    await ctx.close();
  }

  console.log("\nEntrar sin la verificación");
  {
    const ctx = await contexto(browser, { sesion: false, factores: [] });
    const page = await ctx.newPage();
    await page.goto(BASE + "/login.html?next=tareas.html", { waitUntil: "load" });
    await page.fill("#email", "profe@ejemplo.com");
    await page.fill("#password", "clave-buena");
    await Promise.all([page.waitForURL("**/tareas.html", { timeout: 5000 }).catch(() => {}), page.click("#submit-btn")]);
    cierto("entra directo, sin pedir código", ruta(page) === "/tareas.html", page.url());
    await ctx.close();
  }

  console.log("\nLa sesión a medias");
  {
    const ctx = await contexto(browser, { sesion: true, aal: "aal1", factores: [{ id: "f1", status: "verified" }] });
    const page = await ctx.newPage();
    await page.goto(BASE + "/configuracion.html", { waitUntil: "load" });
    await page.waitForURL("**/login.html**", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    cierto("una página de la Academia manda al login", ruta(page) === "/login.html", page.url());
    cierto("con la página de vuelta en next", new URL(page.url()).searchParams.get("next") === "configuracion.html", page.url());
    cierto("y el login pide el código en vez de devolverla (sin rueda)", await visible(page, "#codigo-form") && ruta(page) === "/login.html");
    await page.click("#codigo-salir");
    await page.waitForTimeout(200);
    cierto("«Salir y entrar con otra cuenta» vuelve a la contraseña", await visible(page, "#login-form") && !(await visible(page, "#codigo-form")));
    await ctx.close();

    const ctx2 = await contexto(browser, { sesion: true, aal: "aal2", factores: [{ id: "f1", status: "verified" }] });
    const p2 = await ctx2.newPage();
    await p2.goto(BASE + "/configuracion.html", { waitUntil: "load" });
    await p2.waitForTimeout(800);
    cierto("con el código ya puesto, la página se queda", ruta(p2) === "/configuracion.html", p2.url());
    await ctx2.close();

    const ctx3 = await contexto(browser, { sesion: true, aal: "aal1", factores: [{ id: "f1", status: "verified" }] });
    const p3 = await ctx3.newPage();
    await p3.goto(BASE + "/index.html", { waitUntil: "load" });
    await p3.waitForTimeout(800);
    cierto("una página pública no manda al login", ruta(p3) === "/index.html", p3.url());
    await ctx3.close();
  }

  console.log("\nActivarla y quitarla en Configuración");
  {
    const ctx = await contexto(browser, { sesion: true, aal: "aal1", factores: [], rol: "profesor" });
    const page = await ctx.newPage();
    await page.goto(BASE + "/configuracion.html", { waitUntil: "load" });
    await page.waitForTimeout(800);
    cierto("quien da clase ve la tarjeta", await visible(page, "#dos-pasos"));
    cierto("dice que no está activada", /No está activada/.test(await texto(page, "#dos-pasos-estado")), await texto(page, "#dos-pasos-estado"));
    await page.click("#dos-pasos-activar");
    await page.waitForTimeout(300);
    cierto("al activar se ve el QR", await visible(page, "#dos-pasos-qr") && (await page.getAttribute("#dos-pasos-qr", "src")).startsWith("data:image/svg"));
    cierto("y la clave para escribirla a mano", (await texto(page, "#dos-pasos-secreto")) === "CLAVESECRETA");
    await page.fill("#dos-pasos-codigo", "999999");
    await page.click("#dos-pasos-confirmar");
    await page.waitForTimeout(300);
    cierto("un código malo no la activa", /no es/.test(await texto(page, "#dos-pasos-msg")) && /No está activada/.test(await texto(page, "#dos-pasos-estado")));
    await page.fill("#dos-pasos-codigo", "123456");
    await page.click("#dos-pasos-confirmar");
    await page.waitForTimeout(400);
    cierto("con el bueno queda activada", /Activada/.test(await texto(page, "#dos-pasos-estado")), await texto(page, "#dos-pasos-estado"));
    cierto("y se ofrece quitarla, ya no activarla", await visible(page, "#dos-pasos-quitar") && !(await visible(page, "#dos-pasos-activar")));
    await page.click("#dos-pasos-quitar");
    await page.waitForTimeout(200);
    cierto("el primer toque no la quita", /Activada/.test(await texto(page, "#dos-pasos-estado")) && /otra vez/.test(await texto(page, "#dos-pasos-quitar")));
    await page.click("#dos-pasos-quitar");
    await page.waitForTimeout(400);
    cierto("el segundo sí", /No está activada/.test(await texto(page, "#dos-pasos-estado")), await texto(page, "#dos-pasos-estado"));
    await ctx.close();

    const ctxA = await contexto(browser, { sesion: true, aal: "aal1", factores: [], rol: "alumno" });
    const pa = await ctxA.newPage();
    await pa.goto(BASE + "/configuracion.html", { waitUntil: "load" });
    await pa.waitForTimeout(800);
    cierto("un alumno no ve la tarjeta", !(await visible(pa, "#dos-pasos")) && (await visible(pa, "#app")));
    await ctxA.close();
  }

  await browser.close();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nLa verificación en dos pasos se pide, se activa y se quita.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  // Si falta lo que se prueba (un botón escondido), Playwright espera y corta:
  // eso también es un fallo, y se dice.
  console.log("  ✗ la prueba se cortó: " + e.message.split("\n")[0]);
  process.exit(1);
});
