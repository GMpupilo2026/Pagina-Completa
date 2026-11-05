/* Que los verificadores abran las herramientas con licencia como alguien que
 * la tiene.
 *
 * Pareo Integral, Notara, los reclamos de tablas y las demás herramientas que
 * trabajan en el navegador llevan js/candado-herramienta.js: sin sesión ni
 * licencia tapan la página. Un navegador de prueba no tiene ninguna de las
 * dos, y los más de cuarenta verificadores que prueban esas páginas por dentro
 * se quedarían mirando el candado.
 *
 * verificar-todo.js lo carga en cada verificador (NODE_OPTIONS=--require),
 * como lib/navegador-local.js. A cada contexto nuevo le pone, antes de que
 * cargue nada, un window.CandadoHerramienta ya abierto: el de verdad empieza
 * con `if (window.CandadoHerramienta) return;` y no tapa nada. No cambia la
 * página ni le abre ninguna puerta en producción.
 *
 * El verificador del candado (verificar-candado-herramienta.js) quiere el de
 * verdad: pone CANDADO_DE_VERDAD=1 antes de abrir el navegador.
 */
"use strict";

const path = require("path");

const ABIERTO = () => {
  if (window.CandadoHerramienta) return;
  window.CandadoHerramienta = { herramienta: "", liberar() { }, listo: Promise.resolve(true), estado: "abierta" };
};

try {
  const pw = require(require.resolve("playwright", { paths: [path.join(__dirname, "..", "..")] }));
  const chromium = pw.chromium;
  const conDoble = (ctx) => (process.env.CANDADO_DE_VERDAD === "1" ? Promise.resolve() : ctx.addInitScript(ABIERTO));
  const envolver = (browser) => {
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
      const ctx = await newContext(...args);
      await conDoble(ctx);
      return ctx;
    };
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (...args) => {
      const page = await newPage(...args);
      await conDoble(page.context());
      return page;
    };
    return browser;
  };
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (opciones) => envolver(await launch(opciones));
  const persistente = chromium.launchPersistentContext.bind(chromium);
  chromium.launchPersistentContext = async (dir, opciones) => {
    const ctx = await persistente(dir, opciones);
    await conDoble(ctx);
    return ctx;
  };
} catch (e) {
  // Sin playwright instalado no hay nada que preparar.
}
