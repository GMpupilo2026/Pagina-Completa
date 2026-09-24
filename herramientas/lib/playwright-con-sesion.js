/* Playwright, con una sesión guardada en cada navegador de prueba.
 *
 * Las páginas de la Academia llevan una guardia al principio del <head> (ver
 * «Sin sesión, al login antes de bajar nada» en
 * docs/decisiones/sitio-e-infraestructura.md): si en localStorage no hay
 * NINGUNA sesión de supabase-js guardada, manda al login antes de bajar nada.
 * Un navegador de prueba arranca vacío, así que los verificadores cuyo doble
 * de Supabase entra interceptando js/supabase-client.js —y no como un
 * window.sb puesto antes de cargar— terminaban en el login sin haber visto la
 * página.
 *
 * Esto no cambia la página: hace que el navegador de prueba se parezca al de
 * alguien que ya inició sesión alguna vez. La guardia ve una sesión guardada y
 * se aparta, y quién es quien mira (o si no hay nadie) lo sigue decidiendo el
 * doble, igual que antes. Si el verificador ya puso su propia sesión, no se
 * toca.
 *
 * Uso: require("./lib/playwright-con-sesion") en vez de require("playwright").
 * Devuelve lo mismo que playwright; chromium.launch() y
 * launchPersistentContext() dan navegadores cuyos contextos y páginas nuevas ya
 * traen la sesión.
 */
const fs = require("fs");
const path = require("path");
const pw = require("playwright");

const proyecto = (fs.readFileSync(path.join(__dirname, "..", "..", "js", "supabase-client.js"), "utf8")
  .match(/SUPABASE_URL = "https:\/\/([a-z0-9]+)\.supabase\.co"/) || [])[1];
const CLAVE = "sb-" + proyecto + "-auth-token";

function sembrar(ctx) {
  return ctx.addInitScript((clave) => {
    try {
      if (!localStorage.getItem(clave)) {
        localStorage.setItem(clave, JSON.stringify({
          access_token: "sesion-de-prueba", refresh_token: "sesion-de-prueba", token_type: "bearer",
          expires_at: 4102444800, user: { id: "sesion-de-prueba" },
        }));
      }
    } catch (e) { }
  }, CLAVE);
}

function conSesion(browser) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const ctx = await newContext(...args);
    await sembrar(ctx);
    return ctx;
  };
  // browser.newPage() arma su propio contexto por dentro, sin pasar por
  // newContext: se siembra en ese contexto antes de devolver la página.
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const page = await newPage(...args);
    await sembrar(page.context());
    return page;
  };
  return browser;
}

const chromium = Object.create(pw.chromium);
chromium.launch = async (...args) => conSesion(await pw.chromium.launch(...args));
chromium.launchPersistentContext = async (...args) => {
  const ctx = await pw.chromium.launchPersistentContext(...args);
  await sembrar(ctx);
  return ctx;
};

module.exports = { ...pw, chromium };
