/* Arma img/marca-agua-ajedrez-integral.png: la marca de agua de las hojas de
 * Pareo Integral. Es el dibujo de img/logo-oscar-angulo-marca.png (el
 * caballo, el peón y las casillas, sin la cinta con el nombre) y, debajo,
 * «AJEDREZ INTEGRAL» en Cinzel (la letra del sitio, fonts/), en el mismo
 * gris del dibujo y con fondo transparente. La pidió así el dueño del sitio.
 *
 * Saca también la de los Word de los Programas de Estudio
 * (herramientas/programas-estudio/marca.png): la mitad de grande y ya lavada
 * (la imagen al 12,5 %), porque Word no le baja la opacidad a una imagen.
 *
 * Uso:  node herramientas/marca-agua-ajedrez-integral.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const ORIGEN = path.join(RAIZ, "img/logo-oscar-angulo-marca.png");
const SALIDA = path.join(RAIZ, "img/marca-agua-ajedrez-integral.png");
const SALIDA_WORD = path.join(RAIZ, "herramientas/programas-estudio/marca.png");
const LETRA = path.join(RAIZ, "fonts/cinzel-700-latin.woff2");
// Hasta dónde llega el dibujo (de ahí para abajo está la cinta del nombre).
const CORTE = 470;
const ANCHO = 760;

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const page = await browser.newPage({ viewport: { width: ANCHO, height: 700 }, deviceScaleFactor: 1 });
  const logo = "data:image/png;base64," + fs.readFileSync(ORIGEN).toString("base64");
  const letra = "data:font/woff2;base64," + fs.readFileSync(LETRA).toString("base64");
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Cinzel; font-weight: 700; src: url(${letra}) format("woff2"); }
    html, body { margin: 0; background: transparent; }
    #marca { width: ${ANCHO}px; display: flex; flex-direction: column; align-items: center; }
    #dibujo { width: ${ANCHO}px; height: ${CORTE}px; background: url(${logo}) no-repeat 0 0 / ${ANCHO}px auto; }
    #nombre { font-family: Cinzel; font-weight: 700; font-size: 64px; letter-spacing: 4px; color: rgb(110, 110, 110);
      margin-top: 18px; padding-bottom: 12px; line-height: 1; white-space: nowrap; }
  </style></head><body><div id="marca"><div id="dibujo"></div><div id="nombre">AJEDREZ INTEGRAL</div></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const ancho = await page.$eval("#nombre", (n) => n.getBoundingClientRect().width);
  if (ancho > ANCHO) throw new Error("el nombre no cabe: mide " + Math.round(ancho) + " px");
  await (await page.$("#marca")).screenshot({ path: SALIDA, omitBackground: true });
  // La de Word: la misma, a la mitad y al 12,5 %.
  const lavada = await browser.newPage({ viewport: { width: ANCHO, height: 700 }, deviceScaleFactor: 0.5 });
  await lavada.setContent(await page.content());
  await lavada.addStyleTag({ content: "#marca { opacity: 0.125; }" });
  await lavada.evaluate(() => document.fonts.ready);
  await (await lavada.$("#marca")).screenshot({ path: SALIDA_WORD, omitBackground: true });
  await browser.close();
  for (const f of [SALIDA, SALIDA_WORD]) console.log("Listo: " + path.relative(RAIZ, f) + " (" + Math.round(fs.statSync(f).size / 1024) + " KB)");
})();
