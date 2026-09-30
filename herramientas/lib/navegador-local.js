/* Que los verificadores encuentren un Chromium aunque el de esta versión de
 * Playwright no esté instalado.
 *
 * Playwright busca el navegador de SU versión (chromium-1243 para la 1.63). El
 * CI lo instala (`npx playwright install chromium`), pero las sesiones de
 * Claude Code traen uno fijo en /opt/pw-browsers, de otra versión, y ahí no se
 * puede instalar otro. Al subir Playwright, los verificadores que lanzan el
 * navegador sin decir dónde (`chromium.launch()`, o `CHROME_PATH || undefined`)
 * fallaban todos con «Executable doesn't exist», sin que hubiera nada roto en
 * la página.
 *
 * verificar-todo.js lo carga en cada verificador (NODE_OPTIONS=--require). Si
 * el Chromium de Playwright está, no toca nada: el CI corre igual que siempre.
 * Si no está, les pone a launch() y launchPersistentContext() el de CHROME_PATH
 * o el de /opt/pw-browsers, salvo que el verificador ya haya elegido uno.
 */
"use strict";

const fs = require("fs");
const path = require("path");

try {
  const pw = require(require.resolve("playwright", { paths: [path.join(__dirname, "..", "..")] }));
  const chromium = pw.chromium;
  const propio = (() => { try { return chromium.executablePath(); } catch (e) { return ""; } })();
  if (!propio || !fs.existsSync(propio)) {
    const alternativo = [process.env.CHROME_PATH, "/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]
      .find((r) => r && fs.existsSync(r) && fs.statSync(r).isFile());
    if (alternativo) {
      const conRuta = (opciones) => Object.assign({}, opciones, { executablePath: (opciones && opciones.executablePath) || alternativo });
      const launch = chromium.launch.bind(chromium);
      const persistente = chromium.launchPersistentContext.bind(chromium);
      chromium.launch = (opciones) => launch(conRuta(opciones));
      chromium.launchPersistentContext = (dir, opciones) => persistente(dir, conRuta(opciones));
    }
  }
} catch (e) {
  // Sin playwright instalado no hay nada que arreglar: el verificador dirá lo suyo.
}
