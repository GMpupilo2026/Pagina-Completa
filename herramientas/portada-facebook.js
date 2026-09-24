/* Genera img/redes/portada-facebook.png (1640×624), la foto de portada de la
 * página de Facebook de Ajedrez Integral.
 *
 * Mismo criterio que og-imagen.js: se dibuja acá y no a mano para que salga
 * siempre igual y con los colores de la paleta; si cambian, se vuelve a correr.
 *
 *   node herramientas/portada-facebook.js        (necesita playwright)
 *
 * Las medidas: Facebook muestra la portada a 820×312 en la computadora (esto es
 * el doble, para pantallas de alta densidad) y en el celular la recorta a
 * 16:9 por el centro, así que de los costados se pierden unos 270 px de cada
 * lado. Todo lo que tiene que leerse va dentro de esa franja central
 * (`--seguro`); afuera solo hay fondo.
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
// PNG y no JPEG: Facebook vuelve a comprimir lo que se le sube, y un JPEG
// recomprimido ensucia los bordes de las letras. La recomendación de Facebook
// para portadas con texto o logo es PNG.
const SALIDA = path.join(RAIZ, "img", "redes", "portada-facebook.png");
const ANCHO = 1640, ALTO = 624;
// Lo que ve el celular: 16:9 a la altura completa, centrado.
const SEGURO = Math.round(ALTO * 16 / 9);   // 1109 px

const logo = fs.readFileSync(path.join(RAIZ, "img", "logo-oscar-angulo.png")).toString("base64");

// Los mismos tokens que usa el sitio.
const C = {
    brand700: "#243b53", brand800: "#102a43", brand900: "#0a1f33",
    brand100: "#d9e2ec", brand300: "#9fb3c8", accent400: "#f0b429",
};

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: ${ANCHO}px; height: ${ALTO}px; overflow: hidden;
         font-family: Georgia, 'Times New Roman', serif; }
  .lienzo { position: relative; width: ${ANCHO}px; height: ${ALTO}px;
            background: linear-gradient(135deg, ${C.brand800} 0%, ${C.brand700} 45%, ${C.brand900} 100%); }
  /* El tablero de fondo, apenas insinuado — el mismo guiño que la portada del sitio. */
  .tablero { position: absolute; inset: 0; opacity: 0.07;
             background-image:
               linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%),
               linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%);
             background-size: 104px 104px; background-position: 0 0, 52px 52px; }
  .brillo { position: absolute; width: 900px; height: 900px; left: 50%; top: 50%;
            transform: translate(-50%, -50%); border-radius: 50%;
            background: radial-gradient(circle, rgba(240,180,41,0.16), transparent 65%); }
  .contenido { position: absolute; top: 0; bottom: 0; left: 50%; width: ${SEGURO}px;
               transform: translateX(-50%); display: flex; align-items: center;
               gap: 56px; padding: 0 40px 12px; }
  .logo { width: 330px; flex: none; filter: drop-shadow(0 6px 18px rgba(0,0,0,0.35)); }
  .texto { flex: 1; }
  .nombre { font-size: 88px; line-height: 1; font-weight: 700; color: #fff; letter-spacing: -1.5px; }
  .nombre em { font-style: normal; color: ${C.accent400}; }
  .lema { margin-top: 22px; font-size: 40px; line-height: 1.2; color: ${C.brand100}; }
  .lema em { font-style: normal; color: ${C.accent400}; }
  .sitio { margin-top: 30px; display: inline-flex; align-items: center; gap: 16px;
           padding: 12px 26px; border-radius: 999px; background: ${C.accent400};
           color: ${C.brand900}; font-size: 34px; font-weight: 700; letter-spacing: 0.2px;
           font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .nota { margin-top: 20px; font-size: 25px; color: ${C.brand300};
          font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .barra { position: absolute; left: 0; right: 0; bottom: 0; height: 14px;
           background: linear-gradient(90deg, ${C.brand700}, ${C.accent400} 30%, #de911d 70%, ${C.brand700}); }
</style></head><body>
  <div class="lienzo">
    <div class="tablero"></div>
    <div class="brillo"></div>
    <div class="contenido">
      <img class="logo" src="data:image/png;base64,${logo}" alt="">
      <div class="texto">
        <div class="nombre">Ajedrez <em>Integral</em></div>
        <div class="lema">Clases de ajedrez <em>en vivo</em>,<br>no solo videos</div>
        <div class="sitio">ajedrez-integral.com</div>
        <div class="nota">Escuelas, colegios y familias &middot; Costa Rica</div>
      </div>
    </div>
    <div class="barra"></div>
  </div>
</body></html>`;

(async () => {
    fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_PATH || undefined,
    });
    const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } });
    await pagina.setContent(HTML, { waitUntil: "load" });
    await pagina.waitForTimeout(400);
    // Nada que se lea puede quedar fuera de la franja que ve el celular.
    const fuera = await pagina.evaluate((seguro) => {
        const izq = (innerWidth - seguro) / 2, der = izq + seguro;
        return [...document.querySelectorAll(".contenido *")]
            .map((el) => [el.className || el.tagName, el.getBoundingClientRect()])
            .filter(([, r]) => r.left < izq || r.right > der)
            .map(([n]) => n);
    }, SEGURO);
    if (fuera.length) {
        await navegador.close();
        console.error("Se sale de la franja que ve el celular:", fuera.join(", "));
        process.exit(1);
    }
    await pagina.screenshot({ path: SALIDA, type: "png" });
    await navegador.close();
    const kb = Math.round(fs.statSync(SALIDA).size / 1024);
    console.log(`img/redes/portada-facebook.png lista — ${ANCHO}×${ALTO}, ${kb} KB`);
})();
