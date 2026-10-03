/* Comprueba bienvenida.html en un navegador de verdad, con un Supabase de
   mentira. Existe porque esta página vive DETRÁS DE UN CORREO: no se llega a
   ella desde ningún enlace del sitio, así que verificar-css.js no la abre
   nunca y nadie se entera si se rompe. Y lo que se rompe acá se rompe para
   alguien que acaba de recibir su invitación y no tiene a quién preguntarle.

   Las dos mitades del encargo, que son las dos que se comprueban:
     · que PIDA la contraseña — y que lo que manda a guardar sea la contraseña
       que se escribió, no otra cosa;
     · que EXPLIQUE cómo se entra — y que esa explicación se vea de verdad,
       desde el primer momento y no solo al final.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-bienvenida.js                */
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const CORREO = "alumna@ejemplo.cr";
let fallos = 0;

function ok(que, cierto, detalle) {
  console.log((cierto ? "  ✓ " : "  ✗ ") + que + (cierto || detalle === undefined ? "" : "  → " + detalle));
  if (!cierto) fallos += 1;
}

function igual(que, recibido, esperado) {
  ok(que, JSON.stringify(recibido) === JSON.stringify(esperado),
     "esperaba " + JSON.stringify(esperado) + ", llegó " + JSON.stringify(recibido));
}

/* El doble. `haySesion` es lo único que cambia entre escenarios: es
   exactamente lo que decide el enlace del correo. */
function clienteFalso(haySesion) {
  return `
window.SUPABASE_URL = "https://ejemplo.supabase.co";
window.SUPABASE_ANON_KEY = "anon-de-mentira";
window.__claves = [];     // lo que se mandó a updateUser
window.__enlaces = [];    // lo que se mandó a resetPasswordForEmail (no debe usarse)
window.__pedidos = [];    // lo que se le pidió a recuperar-acceso
window.__canjes = [];     // lo que se mandó a verifyOtp
window.__sesion = ${haySesion
  ? `{ user: { id: "u-1", email: ${JSON.stringify(CORREO)} } }` : "null"};
(function () {
  const original = window.fetch;
  window.fetch = function (url, opciones) {
    if (String(url).indexOf("/functions/v1/") !== -1) {
      window.__pedidos.push({ url: String(url), cuerpo: JSON.parse((opciones && opciones.body) || "{}") });
      return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return original.apply(this, arguments);
  };
})();
window.sb = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: window.__sesion } }),
    // El token "bueno" abre la sesión; cualquier otro es uno anulado.
    verifyOtp: (datos) => {
      window.__canjes.push(datos);
      if (datos.token_hash === "token-bueno") {
        window.__sesion = { user: { id: "u-1", email: ${JSON.stringify(CORREO)} } };
        return Promise.resolve({ data: { session: window.__sesion }, error: null });
      }
      return Promise.resolve({ data: { session: null }, error: { message: "Email link is invalid or has expired" } });
    },
    updateUser: (cambios) => {
      window.__claves.push(cambios);
      return Promise.resolve({ data: {}, error: window.__falloClave || null });
    },
    resetPasswordForEmail: (correo, opciones) => {
      window.__enlaces.push({ correo: correo, opciones: opciones });
      return Promise.resolve({ data: {}, error: null });
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};
`;
}

async function abrir(browser, { haySesion, ruta = "/bienvenida.html", oscuro = false }) {
  const contexto = await browser.newContext({
    // Al recargar es el service worker quien sirve los archivos, y lo que él
    // pide no pasa por las rutas del contexto: volvería el cliente de verdad.
    serviceWorkers: "block",
    colorScheme: oscuro ? "dark" : "light",
  });
  await contexto.route("**/cdn.jsdelivr.net/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await contexto.route("**/fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await contexto.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await contexto.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(haySesion) }));

  const p = await contexto.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e).split("\n")[0]));
  await p.goto(BASE + ruta, { waitUntil: "networkidle" });
  await p.waitForTimeout(350);
  return { p, contexto, errores };
}

/* "Se ve" se mide con checkVisibility(), no con la clase ni con el rectángulo:
   la lección que ya dejó escrita verificar-pwa.js — el atributo decía una cosa
   y la pantalla otra. */
const seVe = (p, sel) => p.$eval(sel, (el) => el.checkVisibility());

// ---------------------------------------------------------------- 1. Con enlace bueno
async function conEnlaceBueno(browser) {
  console.log("\nCon un enlace válido — lo primero es la contraseña");
  const { p, contexto, errores } = await abrir(browser, { haySesion: true });

  ok("pide crear la contraseña", await seVe(p, "#paso-crear"));
  ok("no muestra el aviso de enlace vencido", !(await seVe(p, "#paso-sin-enlace")));
  igual("enseña el correo con el que va a entrar", await p.inputValue("#correo"), CORREO);
  ok("el campo del correo es de solo lectura",
     await p.$eval("#correo", (el) => el.readOnly));

  // La explicación va DESDE EL PRIMER MOMENTO: quien pone su contraseña y se va
  // tiene que haber leído ya por dónde vuelve.
  ok("la explicación de cómo entrar se ve ya, sin haber guardado nada",
     await seVe(p, "#como-entrar"));
  const pasos = await p.$$eval("#como-entrar ol li", (ls) => ls.map((l) => l.textContent.trim()));
  ok("son los cuatro pasos del ingreso", pasos.length === 4, "hay " + pasos.length);
  ok("dice la dirección del sitio", pasos.join(" ").includes("ajedrez-integral.com"));
  ok("dice por dónde se entra", pasos.join(" ").includes("Academia"));
  ok("dice que se entra con el correo y la contraseña",
     /correo/i.test(pasos[2]) && /contrase/i.test(pasos[2]), pasos[2]);
  ok("explica qué hacer si se le olvida",
     (await p.textContent("#como-entrar")).includes("¿Olvidaste tu contraseña?"));

  // --- no se manda nada que no deba mandarse ---
  await p.fill("#clave", "corta");
  await p.fill("#clave2", "corta");
  await p.click("#guardar-clave");
  await p.waitForTimeout(150);
  igual("una contraseña corta no se manda", await p.evaluate(() => window.__claves.length), 0);
  ok("y lo dice", await seVe(p, "#clave-msg"));

  await p.fill("#clave", "caballoblanco7");
  await p.fill("#clave2", "caballonegro7");
  await p.click("#guardar-clave");
  await p.waitForTimeout(150);
  igual("dos contraseñas distintas no se mandan", await p.evaluate(() => window.__claves.length), 0);
  ok("y dice que no son iguales",
     (await p.textContent("#clave-msg")).includes("no son iguales"));

  // --- el camino bueno ---
  await p.fill("#clave", "caballoblanco7");
  await p.fill("#clave2", "caballoblanco7");
  await p.click("#guardar-clave");
  await p.waitForTimeout(250);
  igual("manda a guardar EXACTAMENTE la contraseña que se escribió",
        await p.evaluate(() => window.__claves), [{ password: "caballoblanco7" }]);
  ok("después dice que quedó guardada", await seVe(p, "#paso-listo"));
  ok("y ofrece entrar a la Academia",
     (await p.getAttribute("#paso-listo a", "href")) === "clases.html");
  ok("la explicación de cómo entrar sigue a la vista", await seVe(p, "#como-entrar"));
  ok("ya no pide la contraseña otra vez", !(await seVe(p, "#paso-crear")));

  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await contexto.close();
}

// ---------------------------------------------------------------- 2. Ver la contraseña
async function verLaContrasena(browser) {
  console.log("\nVer la contraseña — lo que evita el error de escribirla mal dos veces");
  const { p, contexto } = await abrir(browser, { haySesion: true });

  igual("arranca escondida", await p.getAttribute("#clave", "type"), "password");
  await p.click("#ver-clave");
  igual("al tocarla se ve la primera", await p.getAttribute("#clave", "type"), "text");
  igual("y también la de repetir", await p.getAttribute("#clave2", "type"), "text");
  igual("el botón dice si está apretado", await p.getAttribute("#ver-clave", "aria-pressed"), "true");
  await p.click("#ver-clave");
  igual("y se vuelve a esconder", await p.getAttribute("#clave", "type"), "password");

  await contexto.close();
}

// ---------------------------------------------------------------- 3. Enlace vencido
async function enlaceVencido(browser) {
  console.log("\nEnlace vencido — el caso que de verdad le pasa a la gente");
  const { p, contexto } = await abrir(browser, {
    haySesion: false,
    ruta: "/bienvenida.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
  });

  ok("no pide una contraseña que no podría guardar", !(await seVe(p, "#paso-crear")));
  ok("ofrece pedir otro enlace", await seVe(p, "#paso-sin-enlace"));
  const motivo = await p.textContent("#sin-enlace-motivo");
  ok("dice que el enlace ya no sirve", motivo.includes("ya no sirve"), motivo);
  /* Lo que de verdad pasaba: la persona abría un correo viejo, ya anulado por
     uno más nuevo, y pedía otro, y otro. Tiene que leer eso ANTES de pedir. */
  ok("dice que pedir uno nuevo anula los anteriores y que abra el más reciente",
     /los anteriores dejan de funcionar/.test(motivo) && /más reciente/.test(motivo), motivo);
  ok("deja ir a iniciar sesión si ya tiene contraseña",
     (await p.textContent("#paso-sin-enlace")).includes("Inicia sesión"));
  ok("y sigue explicando cómo se entra", await seVe(p, "#como-entrar"));

  await p.fill("#correo-otro", CORREO);
  await p.click("#pedir-otro");
  await p.waitForTimeout(200);
  const pedidos = await p.evaluate(() => window.__pedidos);
  igual("pide el enlace nuevo a recuperar-acceso, para ese correo",
        pedidos.map((x) => [x.url.replace("https://ejemplo.supabase.co", ""), x.cuerpo.usuario]),
        [["/functions/v1/recuperar-acceso", CORREO]]);
  igual("NO va por resetPasswordForEmail (la plantilla de Supabase, en inglés y siempre igual)",
        await p.evaluate(() => window.__enlaces.length), 0);
  const dice = await p.textContent("#otro-msg");
  ok("no le cuenta a nadie si esa cuenta existe", /si esa cuenta existe/i.test(dice), dice);
  ok("dice a qué hora salió, para que abra ESE correo",
     /pedido a las \d{1,2}:\d{2}/.test(dice) && /los de antes ya no sirven/.test(dice), dice);

  await contexto.close();
}

// ---------------------------------------------------------------- 3b. Enlace con token_hash
/* El enlace de recuperar-acceso / reenviar-acceso apunta al sitio y trae el
   token en la dirección: lo canjea la página, no el clic. Así un filtro de
   correo que visita el enlace antes que la persona no lo gasta. */
async function enlaceConToken(browser) {
  console.log("\nEnlace con token_hash — se canjea en la página");
  {
    const { p, contexto, errores } = await abrir(browser, {
      haySesion: false, ruta: "/bienvenida.html?token_hash=token-bueno&type=recovery",
    });
    igual("lo canjea con verifyOtp, como recuperación",
          await p.evaluate(() => window.__canjes), [{ token_hash: "token-bueno", type: "recovery" }]);
    ok("con el token bueno pide la contraseña nueva", await seVe(p, "#paso-crear"));
    ok("y lo dice como recuperación", (await p.textContent("#titulo")).includes("nueva"),
       await p.textContent("#titulo"));
    ok("el token ya no queda en la barra", !p.url().includes("token_hash"), p.url());
    errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
    await contexto.close();
  }
  {
    const { p, contexto } = await abrir(browser, {
      haySesion: false, ruta: "/bienvenida.html?token_hash=token-anulado&type=recovery",
    });
    ok("con un token anulado no pide una contraseña que no podría guardar", !(await seVe(p, "#paso-crear")));
    ok("ofrece pedir otro", await seVe(p, "#paso-sin-enlace"));
    const motivo = await p.textContent("#sin-enlace-motivo");
    ok("y antes explica que abra el correo más reciente", /más reciente/.test(motivo), motivo);
    await contexto.close();
  }
  {
    // Recargar con el token ya gastado: la sesión ya está, no es un error.
    const { p, contexto } = await abrir(browser, {
      haySesion: true, ruta: "/bienvenida.html?token_hash=token-anulado&type=recovery",
    });
    ok("si la sesión ya estaba (recargó la página), sigue pidiendo la contraseña", await seVe(p, "#paso-crear"));
    await contexto.close();
  }
}

// ---------------------------------------------------------------- 4. Sin sesión, sin error
async function sinSesion(browser) {
  console.log("\nSin sesión y sin error — enlace abierto en otro navegador");
  const { p, contexto } = await abrir(browser, { haySesion: false });
  ok("no muestra un formulario que no serviría", !(await seVe(p, "#paso-crear")));
  ok("ofrece pedir un enlace", await seVe(p, "#paso-sin-enlace"));
  await contexto.close();
}

// ---------------------------------------------------------------- 5. "Olvidé mi contraseña"
async function olvidoLaClave(browser) {
  console.log("\n?recuperar=1 — a donde manda login.html");
  const { p, contexto } = await abrir(browser, { haySesion: false, ruta: "/bienvenida.html?recuperar=1" });

  ok("abre directo el formulario para pedir el enlace", await seVe(p, "#paso-sin-enlace"));
  ok("y lo dice con las palabras de este caso, no con las del enlace vencido",
     (await p.textContent("#titulo")).includes("Olvidaste"),
     await p.textContent("#titulo"));
  ok("el encabezado no dice que un enlace se venció",
     !(await p.textContent("#sin-enlace-titulo")).includes("ya no sirve"),
     await p.textContent("#sin-enlace-titulo"));

  await contexto.close();
}

// ---------------------------------------------------------------- 6. Que se VEA
async function queSeVea(browser) {
  console.log("\nQue la página se vea — se clonó una cabecera, y eso ya salió mal antes");
  const { p, contexto } = await abrir(browser, { haySesion: true, oscuro: true });

  const cuerpo = await p.textContent("body");
  ok("no hay CSS impreso como texto",
     !/\{[^}]*(color|margin|padding)\s*:/.test(cuerpo.slice(0, 3000)));
  igual("no quedó ningún <style> suelto", await p.$$eval("style", (e) => e.length), 0);

  const fondo = await p.$eval("body", (el) => getComputedStyle(el).backgroundColor);
  const claro = fondo.match(/\d+/g).slice(0, 3).reduce((a, b) => a + Number(b), 0) / 3;
  ok("con el tema en oscuro el fondo sale oscuro", claro < 90, fondo);

  // Las clases propias tienen que pintar algo: si falta compilar el CSS, la
  // página "funciona" y se ve rota.
  const alto = await p.$eval("#paso-crear", (el) => el.getBoundingClientRect().height);
  ok("la tarjeta de la contraseña tiene cuerpo", alto > 200, alto + "px");

  const h1 = await p.$$eval("h1", (e) => e.length);
  igual("un solo h1", h1, 1);
  const niveles = await p.$$eval("h1,h2,h3,h4", (es) =>
    es.filter((e) => e.checkVisibility()).map((e) => Number(e.tagName[1])));
  let salto = null;
  niveles.forEach((n, i) => { if (i && n > niveles[i - 1] + 1) salto = niveles[i - 1] + "→" + n; });
  ok("no se salta ningún nivel de encabezado", salto === null, salto);

  await contexto.close();
}

// ---------------------------------------------------------------- 7. login.html
async function desdeLogin(browser) {
  console.log("\nlogin.html — la explicación solo es cierta si ese enlace existe");
  const contexto = await browser.newContext({ serviceWorkers: "block" });
  await contexto.route("**/cdn.jsdelivr.net/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await contexto.route("**/fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await contexto.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(false) }));
  const p = await contexto.newPage();
  await p.goto(BASE + "/login.html", { waitUntil: "networkidle" });
  await p.waitForTimeout(250);

  const enlace = await p.$("a[href='bienvenida.html?recuperar=1']");
  ok("tiene el enlace de «¿Olvidaste tu contraseña?»", !!enlace);
  if (enlace) {
    ok("y se ve", await enlace.evaluate((el) => el.checkVisibility()));
    ok("dice lo que hace",
       (await enlace.textContent()).includes("Olvidaste"), await enlace.textContent());
  }

  await contexto.close();
}

// ---------------------------------------------------------------- 8. La red de seguridad
async function redDeSeguridad(browser) {
  console.log("\nclases.html — la red por si Supabase no acepta el destino nuevo");
  const contexto = await browser.newContext({ serviceWorkers: "block" });
  await contexto.route("**/cdn.jsdelivr.net/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await contexto.route("**/fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await contexto.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(true) }));
  const p = await contexto.newPage();

  // A dónde puede mandar el enlace lo decide una lista que vive fuera del
  // repositorio. Si esa dirección no está permitida, el alumno cae aquí con
  // sesión y sin contraseña — y de eso no se entera nadie.
  await p.goto(BASE + "/clases.html#access_token=abc&type=invite", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  ok("un alumno que cae en el panel con marca de invitación termina en bienvenida.html",
     p.url().includes("/bienvenida.html"), p.url());

  await p.goto(BASE + "/clases.html#access_token=abc&type=recovery", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  ok("lo mismo con una recuperación", p.url().includes("/bienvenida.html"), p.url());

  // Y no puede llevarse por delante una visita normal al panel.
  await p.goto(BASE + "/clases.html", { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  ok("una visita normal al panel se queda en el panel",
     p.url().endsWith("/clases.html"), p.url());

  await contexto.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await conEnlaceBueno(browser);
    await verLaContrasena(browser);
    await enlaceVencido(browser);
    await enlaceConToken(browser);
    await sinSesion(browser);
    await olvidoLaClave(browser);
    await queSeVea(browser);
    await desdeLogin(browser);
    await redDeSeguridad(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos
    ? "\n" + fallos + " comprobación(es) fallaron"
    : "\nTodo bien: la invitación pide la contraseña y explica cómo se entra.");
  process.exit(fallos ? 1 : 0);
})();
