/* Dibuja los iconos de la app (PWA y, más adelante, Google Play).
 *
 * El favicon del sitio es un emoji, y un emoji no sirve de icono de app: cada
 * sistema lo dibuja distinto y las tiendas piden un PNG de verdad. Así que se
 * dibuja uno: el caballo del juego de piezas que el sitio YA usa —el mismo de
 * los tableros, leído de js/finales-100.js a través de lib/tablero-svg.js—
 * recoloreado al ámbar de la paleta sobre el azul del encabezado.
 *
 * Se generan cuatro tamaños:
 *   icon-192.png            el que pide el manifest para la pantalla de inicio
 *   icon-512.png            el grande, para la pantalla de bienvenida
 *   icon-512-maskable.png   el mismo con MÁS margen: Android recorta el icono
 *                           en círculo, y sin ese margen le come las orejas al
 *                           caballo. Por eso van dos archivos y no uno.
 *   apple-touch-icon.png    180×180, que es lo que mira iPhone
 *
 *     npm install playwright && node herramientas/pwa-iconos.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { tablero } = require("./lib/tablero-svg.js");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "img", "app");

// De la paleta de herramientas/css-construir.js.
const FONDO = "#102a43";      // brand-800, el azul del encabezado
const PIEZA = "#f0b429";      // accent-400, el ámbar del sitio
const BORDE = "#071527";      // brand-950

/* El dibujo del caballo sale del juego de piezas del sitio. Viene con los
   colores metidos en cada trazo (es el juego Cburnett de toda la vida), así
   que se le cambian: el blanco por el ámbar y el negro por el azul oscuro. */
function caballo() {
  const svg = tablero("8/8/8/3N4/8/8/8/8 w - - 0 1", { titulo: "" });
  const i = svg.indexOf('<g id="wN"');
  if (i < 0) throw new Error("No se encontró el caballo en el juego de piezas");
  let nivel = 0, j = i;
  for (; j < svg.length; j++) {
    if (svg.startsWith("<g", j)) nivel += 1;
    else if (svg.startsWith("</g>", j)) { nivel -= 1; if (nivel === 0) { j += 4; break; } }
  }
  return svg.slice(i, j)
    .replace(/#ffffff/gi, PIEZA)
    .replace(/#000000/gi, BORDE)
    .replace(/stroke="#000"/gi, `stroke="${BORDE}"`)
    .replace(/fill:#ececec/gi, `fill:${PIEZA}`)
    .replace(/fill:#a[0-9a-f]{5}/gi, `fill:${BORDE}`);
}

/* margen es cuánto del lado se deja libre alrededor de la pieza, de 0 a 1.
   El icono normal lleva poco; el "maskable", bastante, porque Android lo
   recorta en círculo y solo garantiza el 80% central. */
function iconoSvg(lado, margen, redondeado) {
  const util = lado * (1 - 2 * margen);
  const escala = util / 45;          // las piezas están dibujadas en 45×45
  const off = lado * margen;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
  <rect width="${lado}" height="${lado}" ${redondeado ? `rx="${lado * 0.22}"` : ""} fill="${FONDO}"/>
  <g transform="translate(${off},${off}) scale(${escala})">${caballo()}</g>
</svg>`;
}

const ICONOS = [
  { archivo: "icon-192.png", lado: 192, margen: 0.10, redondeado: false },
  { archivo: "icon-512.png", lado: 512, margen: 0.10, redondeado: false },
  // Con 22% de margen la pieza entra entera en el círculo que recorta Android.
  { archivo: "icon-512-maskable.png", lado: 512, margen: 0.22, redondeado: false },
  { archivo: "apple-touch-icon.png", lado: 180, margen: 0.10, redondeado: true },
];

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  for (const ic of ICONOS) {
    const pagina = await navegador.newPage({ viewport: { width: ic.lado, height: ic.lado } });
    await pagina.setContent(`<body style="margin:0">${iconoSvg(ic.lado, ic.margen, ic.redondeado)}</body>`);
    const destino = path.join(SALIDA, ic.archivo);
    await pagina.locator("svg").screenshot({ path: destino, omitBackground: false });
    await pagina.close();
    console.log(`  ok    ${ic.archivo.padEnd(24)} ${ic.lado}×${ic.lado} · ${(fs.statSync(destino).size / 1024).toFixed(1)} KB`);
  }
  await navegador.close();
  console.log(`\n${ICONOS.length} iconos en img/app/`);
})();
