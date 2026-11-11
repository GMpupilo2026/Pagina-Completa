/* Genera el fondo para grabar con OBS las clases de Formación Ajedrez (el curso
 * de los asesores): una imagen de 1920×1080 con los colores y la marca de
 * Ajedrez Integral y un recuadro 16:9 donde va la pantalla de la clase, para
 * que el video no quede flotando sobre negro.
 *
 * Salen dos imágenes en img/obs/:
 *   - formacion-ajedrez-fondo.png  → la capa de ABAJO en OBS.
 *   - formacion-ajedrez-marco.png  → opcional, la capa de ARRIBA: la misma
 *     imagen con el recuadro transparente. Encima del video le redondea las
 *     esquinas y le pone el borde dorado, aunque el video no calce exacto.
 *
 * En OBS, la pantalla (o el video de YouTube) va en el recuadro:
 *   posición X = 200, Y = 136, tamaño 1520 × 855 (lienzo de 1920 × 1080).
 * Si se cambia RECUADRO acá, se vuelve a correr y se ajusta en OBS.
 *
 * Se dibuja acá y no a mano para que salga siempre igual y con los colores de
 * la paleta (los mismos de og-imagen.js); la marca es la copia única de
 * herramientas/lib/marca-agua.js.
 *
 *   node herramientas/obs-fondo.js        (necesita playwright)
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { MARCA_AGUA } = require("./lib/marca-agua");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "img", "obs");
const ANCHO = 1920, ALTO = 1080;
// 1520 × 855 es 16:9 exacto; deja 200 px a cada lado y lugar arriba y abajo
// para el encabezado y el pie.
const RECUADRO = { x: 200, y: 136, ancho: 1520, alto: 855, radio: 18 };

const C = {
    brand700: "#243b53", brand800: "#102a43", brand900: "#0a1f33", brand950: "#071527",
    brand100: "#d9e2ec", brand300: "#9fb3c8", accent400: "#f0b429", accent600: "#de911d",
};

const logo = "data:image/png;base64," +
    fs.readFileSync(path.join(RAIZ, MARCA_AGUA)).toString("base64");

// El contorno del recuadro como trazo SVG (rectángulo redondeado), para
// recortarlo del marco con clip-path evenodd.
function huecoRedondeado({ x, y, ancho: w, alto: h, radio: r }) {
    return `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} ` +
        `V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} ` +
        `A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

const html = (marco) => {
    const R = RECUADRO;
    const recorte = marco
        ? `clip-path: path(evenodd, 'M0 0 H${ANCHO} V${ALTO} H0 Z ${huecoRedondeado(R)}');`
        : "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${ANCHO}px; height: ${ALTO}px; overflow: hidden; background: transparent; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .lienzo { position: relative; width: ${ANCHO}px; height: ${ALTO}px; overflow: hidden; ${recorte}
            background: linear-gradient(135deg, ${C.brand800} 0%, ${C.brand700} 42%, ${C.brand900} 78%, ${C.brand950} 100%); }
  /* El tablero de fondo, apenas insinuado, como en la portada. */
  .tablero { position: absolute; inset: 0; opacity: 0.03;
             background-image:
               linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%),
               linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%);
             background-size: 120px 120px; background-position: 0 0, 60px 60px; }
  .brillo { position: absolute; border-radius: 50%; }
  .brillo.uno { width: 1100px; height: 1100px; right: -420px; top: -560px;
                background: radial-gradient(circle, rgba(240,180,41,0.12), transparent 66%); }
  .brillo.dos { width: 900px; height: 900px; left: -420px; bottom: -480px;
                background: radial-gradient(circle, rgba(159,179,200,0.16), transparent 66%); }
  /* Las columnas de casillas a los costados: el mismo motivo del logo. */
  .casillas { position: absolute; top: 150px; width: 120px; height: 820px; opacity: 0.08;
              background-image:
                linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%),
                linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%);
              background-size: 60px 60px; background-position: 0 0, 30px 30px;
              -webkit-mask-image: linear-gradient(180deg, transparent, #000 25%, #000 75%, transparent); }
  .casillas.izq { left: 40px; }
  .casillas.der { right: 40px; }

  .encabezado { position: absolute; left: ${R.x}px; right: ${ANCHO - R.x - R.ancho}px; top: 0;
                height: ${R.y}px; display: flex; align-items: center; justify-content: space-between; }
  .marca { display: flex; align-items: center; gap: 22px; }
  .marca img { height: 84px; filter: brightness(0) invert(1); opacity: 0.95; }
  .raya { width: 2px; height: 62px; background: linear-gradient(180deg, transparent, ${C.accent400}, transparent); }
  .titulo { font-family: Georgia, 'Times New Roman', serif; font-size: 44px; font-weight: 700;
            color: #fff; letter-spacing: -0.5px; line-height: 1.05; }
  .titulo em { font-style: normal; color: ${C.accent400}; }
  .subtitulo { margin-top: 6px; font-size: 21px; color: ${C.brand300}; letter-spacing: 0.3px; }
  .sello { display: flex; align-items: center; gap: 12px; padding: 12px 24px; border-radius: 999px;
           border: 2px solid rgba(240,180,41,0.55); background: rgba(10,31,51,0.55);
           color: ${C.brand100}; font-size: 22px; font-weight: 600; letter-spacing: 0.4px; }
  .sello .punto { width: 10px; height: 10px; border-radius: 50%; background: ${C.accent400};
                  box-shadow: 0 0 12px ${C.accent400}; }

  .recuadro { position: absolute; left: ${R.x}px; top: ${R.y}px; width: ${R.ancho}px; height: ${R.alto}px;
              border-radius: ${R.radio}px; background: ${C.brand950};
              box-shadow: 0 0 0 3px ${C.accent400}, 0 0 0 9px rgba(240,180,41,0.16),
                          0 30px 80px rgba(0,0,0,0.55), 0 0 120px rgba(240,180,41,0.12); }
  /* Las esquinas doradas, por fuera del borde. */
  .esquina { position: absolute; width: 46px; height: 46px; border: 0 solid ${C.accent400}; }
  .esquina.ai { left: ${R.x - 18}px; top: ${R.y - 18}px; border-top-width: 5px; border-left-width: 5px; border-top-left-radius: 14px; }
  .esquina.ad { left: ${R.x + R.ancho - 28}px; top: ${R.y - 18}px; border-top-width: 5px; border-right-width: 5px; border-top-right-radius: 14px; }
  .esquina.bi { left: ${R.x - 18}px; top: ${R.y + R.alto - 28}px; border-bottom-width: 5px; border-left-width: 5px; border-bottom-left-radius: 14px; }
  .esquina.bd { left: ${R.x + R.ancho - 28}px; top: ${R.y + R.alto - 28}px; border-bottom-width: 5px; border-right-width: 5px; border-bottom-right-radius: 14px; }

  .pie { position: absolute; left: ${R.x}px; right: ${ANCHO - R.x - R.ancho}px; top: ${R.y + R.alto}px;
         bottom: 12px; display: flex; align-items: center; justify-content: space-between;
         font-size: 22px; color: ${C.brand300}; }
  .pie .sitio { font-weight: 600; color: ${C.brand100}; letter-spacing: 0.3px; }
  .pie .temas { display: flex; align-items: center; gap: 16px; }
  .pie .sep { width: 6px; height: 6px; border-radius: 50%; background: ${C.accent400}; }
  .barra { position: absolute; left: 0; right: 0; bottom: 0; height: 12px;
           background: linear-gradient(90deg, ${C.accent400}, ${C.accent600} 55%, ${C.brand700}); }
</style></head><body>
  <div class="lienzo">
    <div class="tablero"></div>
    <div class="brillo uno"></div>
    <div class="brillo dos"></div>
    <div class="casillas izq"></div>
    <div class="casillas der"></div>

    <div class="encabezado">
      <div class="marca">
        <img src="${logo}" alt="">
        <span class="raya"></span>
        <div>
          <div class="titulo">Formación <em>Ajedrez</em></div>
          <div class="subtitulo">Curso para docentes, asesores regionales y árbitros</div>
        </div>
      </div>
      <div class="sello"><span class="punto"></span>Curso de asesores · JDE</div>
    </div>

    <div class="recuadro"></div>
    <div class="esquina ai"></div><div class="esquina ad"></div>
    <div class="esquina bi"></div><div class="esquina bd"></div>

    <div class="pie">
      <span class="sitio">ajedrez-integral.com</span>
      <span class="temas">Reglamento FIDE<span class="sep"></span>Juegos Deportivos Estudiantiles<span class="sep"></span>Arbitraje práctico</span>
    </div>
    <div class="barra"></div>
  </div>
</body></html>`;
};

(async () => {
    fs.mkdirSync(SALIDA, { recursive: true });
    const navegador = await chromium.launch({
        executablePath: process.env.CHROME_PATH || undefined,
    });
    const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } });
    for (const [archivo, marco] of [["formacion-ajedrez-fondo.png", false],
                                     ["formacion-ajedrez-marco.png", true]]) {
        const salida = path.join(SALIDA, archivo);
        await pagina.setContent(html(marco), { waitUntil: "load" });
        await pagina.waitForTimeout(300);
        await pagina.screenshot({ path: salida, type: "png", omitBackground: marco });
        const kb = Math.round(fs.statSync(salida).size / 1024);
        console.log(`img/obs/${archivo} listo — ${ANCHO}×${ALTO}, ${kb} KB`);
    }
    await navegador.close();
    const R = RECUADRO;
    console.log(`En OBS, el video va en X=${R.x}, Y=${R.y}, ${R.ancho}×${R.alto}.`);
})();

/*! rev bfb5bbb0d2d82f9f */
