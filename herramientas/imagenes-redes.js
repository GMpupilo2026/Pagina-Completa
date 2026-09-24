/* Genera las imágenes de las redes sociales de Ajedrez Integral:
 *
 *   img/redes/portada-facebook.png   1640×624   foto de portada de Facebook
 *   img/redes/instagram.png          1080×1350  publicación de Instagram (4:5)
 *
 * Mismo criterio que og-imagen.js: se dibujan acá y no a mano para que salgan
 * siempre igual y con los colores de la paleta; si cambian, se vuelve a correr.
 *
 *   node herramientas/imagenes-redes.js        (necesita playwright)
 *
 * Cada red recorta lo que se le sube, y cada imagen dice qué franja queda
 * siempre a la vista (`seguro`). El script falla si algo del contenido se sale
 * de esa franja: fuera de ella solo hay fondo.
 *  - Facebook muestra la portada a 820×312 en la computadora (esto es el doble,
 *    para pantallas de alta densidad) y en el celular la recorta a 16:9 por el
 *    centro: se pierden unos 270 px de cada costado.
 *  - Instagram muestra la publicación 4:5 entera en el inicio, pero en la
 *    cuadrícula del perfil la recorta a 3:4 por el centro: unos 34 px de cada
 *    costado.
 *
 * PNG y no JPEG: las dos redes recomprimen lo que se les sube, y un JPEG
 * recomprimido ensucia los bordes de las letras.
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CARPETA = path.join(RAIZ, "img", "redes");
const logo = fs.readFileSync(path.join(RAIZ, "img", "logo-oscar-angulo.png")).toString("base64");

// Los mismos tokens que usa el sitio.
const C = {
    brand700: "#243b53", brand800: "#102a43", brand900: "#0a1f33",
    brand100: "#d9e2ec", brand300: "#9fb3c8", accent400: "#f0b429",
};

// Lo que comparten todas: fondo, tablero insinuado, brillo, textos y barra.
const BASE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { overflow: hidden; font-family: Georgia, 'Times New Roman', serif; }
  .lienzo { position: relative; width: 100vw; height: 100vh;
            background: linear-gradient(135deg, ${C.brand800} 0%, ${C.brand700} 45%, ${C.brand900} 100%); }
  /* El tablero de fondo, apenas insinuado — el mismo guiño que la portada del sitio. */
  .tablero { position: absolute; inset: 0; opacity: 0.07;
             background-image:
               linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%),
               linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%);
             background-size: var(--casilla2) var(--casilla2);
             background-position: 0 0, var(--casilla) var(--casilla); }
  .brillo { position: absolute; width: 900px; height: 900px; left: 50%; top: 50%;
            transform: translate(-50%, -50%); border-radius: 50%;
            background: radial-gradient(circle, rgba(240,180,41,0.16), transparent 65%); }
  .contenido { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
  .logo { flex: none; filter: drop-shadow(0 6px 18px rgba(0,0,0,0.35)); }
  .nombre { line-height: 1; font-weight: 700; color: #fff; letter-spacing: -1.5px; }
  em { font-style: normal; color: ${C.accent400}; }
  .lema { line-height: 1.2; color: ${C.brand100}; }
  .sitio { display: inline-block; border-radius: 999px; background: ${C.accent400};
           color: ${C.brand900}; font-weight: 700; letter-spacing: 0.2px;
           font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .nota { color: ${C.brand300}; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .barra { position: absolute; left: 0; right: 0; bottom: 0; height: 14px;
           background: linear-gradient(90deg, ${C.brand700}, ${C.accent400} 30%, #de911d 70%, ${C.brand700}); }
`;

const LOGO = `<img class="logo" src="data:image/png;base64,${logo}" alt="">`;
const NOMBRE = `<div class="nombre">Ajedrez <em>Integral</em></div>`;
const LEMA = `<div class="lema">Clases de ajedrez <em>en vivo</em>,<br>no solo videos</div>`;
const SITIO = `<div class="sitio">ajedrez-integral.com</div>`;
const NOTA = `<div class="nota">Escuelas, colegios y familias &middot; Costa Rica</div>`;

const IMAGENES = [
    {
        archivo: "portada-facebook.png", ancho: 1640, alto: 624,
        seguro: { ancho: Math.round(624 * 16 / 9), alto: 624 },   // 1109×624
        css: `
          .lienzo { --casilla: 52px; --casilla2: 104px; }
          .contenido { width: 1109px; display: flex; align-items: center; gap: 56px;
                       padding: 0 40px; margin-top: -6px; }
          .logo { width: 330px; }
          .nombre { font-size: 88px; }
          .lema { margin-top: 22px; font-size: 40px; }
          .sitio { margin-top: 30px; padding: 12px 26px; font-size: 34px; }
          .nota { margin-top: 20px; font-size: 25px; }`,
        cuerpo: `${LOGO}<div>${NOMBRE}${LEMA}${SITIO}${NOTA}</div>`,
    },
    {
        archivo: "instagram.png", ancho: 1080, alto: 1350,
        seguro: { ancho: Math.round(1350 * 3 / 4), alto: 1350 },  // 1013×1350
        css: `
          .lienzo { --casilla: 67.5px; --casilla2: 135px; }
          .contenido { width: 1013px; padding: 0 60px; text-align: center; margin-top: -10px; }
          .logo { width: 560px; }
          .nombre { margin-top: 56px; font-size: 104px; }
          .lema { margin-top: 30px; font-size: 52px; }
          .sitio { margin-top: 52px; padding: 18px 40px; font-size: 48px; }
          .nota { margin-top: 30px; font-size: 32px; }
          .barra { height: 18px; }`,
        cuerpo: `${LOGO}${NOMBRE}${LEMA}${SITIO}${NOTA}`,
    },
];

(async () => {
    fs.mkdirSync(CARPETA, { recursive: true });
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_PATH || undefined,
    });
    let error = false;
    for (const img of IMAGENES) {
        const pagina = await navegador.newPage({ viewport: { width: img.ancho, height: img.alto } });
        await pagina.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE}${img.css}</style></head>
          <body><div class="lienzo"><div class="tablero"></div><div class="brillo"></div>
          <div class="contenido">${img.cuerpo}</div><div class="barra"></div></div></body></html>`,
            { waitUntil: "load" });
        await pagina.waitForTimeout(400);
        // Nada que se lea puede quedar fuera de la franja que siempre se ve.
        const fuera = await pagina.evaluate((s) => {
            const izq = (innerWidth - s.ancho) / 2, arr = (innerHeight - s.alto) / 2;
            return [...document.querySelectorAll(".contenido *")]
                .map((el) => [el.className || el.tagName, el.getBoundingClientRect()])
                .filter(([, r]) => r.left < izq || r.right > izq + s.ancho
                                || r.top < arr || r.bottom > arr + s.alto)
                .map(([n]) => n);
        }, img.seguro);
        if (fuera.length) {
            console.error(`${img.archivo}: se sale de la franja que siempre se ve:`, fuera.join(", "));
            error = true;
        } else {
            const salida = path.join(CARPETA, img.archivo);
            await pagina.screenshot({ path: salida, type: "png" });
            const kb = Math.round(fs.statSync(salida).size / 1024);
            console.log(`img/redes/${img.archivo} lista — ${img.ancho}×${img.alto}, ${kb} KB`);
        }
        await pagina.close();
    }
    await navegador.close();
    if (error) process.exit(1);
})();
