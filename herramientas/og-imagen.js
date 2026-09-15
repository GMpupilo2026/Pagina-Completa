/* Genera img/og-ajedrez-integral.png (1200×630), la imagen que se ve cuando
 * alguien pega un enlace del sitio en WhatsApp, Facebook o Telegram.
 *
 * Se dibuja acá y no a mano para que salga siempre igual y con los colores de
 * la paleta: si cambian, se vuelve a correr.
 *
 *   node herramientas/og-imagen.js        (necesita playwright)
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
// JPEG y no PNG: es un degradado, y en PNG el mismo dibujo pesa 490 KB contra
// unos 70 en JPEG. WhatsApp y Telegram descartan las previsualizaciones pesadas.
const SALIDA = path.join(RAIZ, "img", "og-ajedrez-integral.jpg");

// Los mismos tokens que usa el sitio.
const C = {
    brand700: "#243b53", brand800: "#102a43", brand900: "#0a1f33", brand950: "#071527",
    brand100: "#d9e2ec", brand300: "#9fb3c8", accent400: "#f0b429",
};

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden;
         font-family: Georgia, 'Times New Roman', serif; }
  .lienzo { position: relative; width: 1200px; height: 630px;
            background: linear-gradient(135deg, ${C.brand800} 0%, ${C.brand700} 45%, ${C.brand900} 100%); }
  /* El tablero de fondo, apenas insinuado — el mismo guiño que la portada. */
  .tablero { position: absolute; inset: 0; opacity: 0.07;
             background-image:
               linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%),
               linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%);
             background-size: 90px 90px; background-position: 0 0, 45px 45px; }
  .brillo { position: absolute; width: 760px; height: 760px; right: -220px; top: -260px;
            border-radius: 50%; background: radial-gradient(circle, rgba(240,180,41,0.20), transparent 68%); }
  .contenido { position: relative; height: 100%; display: flex; flex-direction: column;
               justify-content: center; padding: 0 84px; }
  .marca { display: flex; align-items: center; gap: 18px; margin-bottom: 34px; }
  .peon { font-size: 62px; line-height: 1; font-family: 'Noto Color Emoji', sans-serif; }
  .nombre { font-size: 46px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
  .nombre em { font-style: normal; color: ${C.accent400}; }
  h1 { font-size: 74px; line-height: 1.08; color: #fff; font-weight: 700;
       letter-spacing: -1.5px; max-width: 900px; }
  h1 em { font-style: normal; color: ${C.accent400}; }
  p { margin-top: 26px; font-size: 30px; line-height: 1.4; color: ${C.brand300};
      max-width: 820px; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .pie { position: absolute; left: 84px; bottom: 54px; display: flex; align-items: center; gap: 22px;
         font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .pie .sitio { font-size: 26px; font-weight: 600; color: ${C.brand100}; }
  .pie .punto { width: 7px; height: 7px; border-radius: 50%; background: ${C.accent400}; }
  .pie .nota { font-size: 24px; color: ${C.brand300}; }
  .barra { position: absolute; left: 0; right: 0; bottom: 0; height: 12px;
           background: linear-gradient(90deg, ${C.accent400}, #de911d 55%, ${C.brand700}); }
</style></head><body>
  <div class="lienzo">
    <div class="tablero"></div>
    <div class="brillo"></div>
    <div class="contenido">
      <div class="marca"><span class="peon">&#9823;&#65039;</span>
        <span class="nombre">Ajedrez <em>Integral</em></span></div>
      <h1>Clases de ajedrez <em>en vivo</em>,<br>no solo videos</h1>
      <p>Un profesor real que corrige cada jugada. Cursos, entrenamiento
         interactivo y seguimiento del progreso.</p>
    </div>
    <div class="pie">
      <span class="sitio">ajedrez-integral.com</span>
      <span class="punto"></span>
      <span class="nota">Escuelas, colegios y familias &middot; Costa Rica</span>
    </div>
    <div class="barra"></div>
  </div>
</body></html>`;

(async () => {
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_PATH || undefined,
    });
    const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 } });
    await pagina.setContent(HTML, { waitUntil: "load" });
    await pagina.waitForTimeout(400);
    await pagina.screenshot({ path: SALIDA, type: "jpeg", quality: 88 });
    await navegador.close();
    const kb = Math.round(fs.statSync(SALIDA).size / 1024);
    console.log(`img/og-ajedrez-integral.jpg listo — 1200×630, ${kb} KB`);
})();
