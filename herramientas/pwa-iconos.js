/* Dibuja los iconos de la app (PWA y, más adelante, Google Play) y el de la
 * pestaña del navegador.
 *
 * Salen del logo de la marca (img/logo-oscar-angulo.png, el de color crema):
 * el caballo, el peón y los cuadros, SIN la cinta de abajo con «Oscar Angulo
 * Cubero · Profesional de Ajedrez», que a tamaño de icono no se lee. Es el
 * mismo recorte que usa el encabezado (herramientas/logo-encabezado.py), pero
 * hecho acá desde el original grande: el del encabezado mide 96 px de alto y
 * a 512 se vería borroso. Va en crema sobre el azul del encabezado.
 *
 * Antes era el caballo del juego de piezas de los tableros, en ámbar: un icono
 * genérico, que no era el de la marca.
 *
 * Se generan:
 *   icon-192.png            el que pide el manifest para la pantalla de inicio
 *   icon-512.png            el grande, para la pantalla de bienvenida
 *   icon-512-maskable.png   el mismo con MÁS margen: Android recorta el icono
 *                           en círculo y solo garantiza el 80 % central; sin
 *                           ese margen le come los cuadros de los lados. Por
 *                           eso van dos archivos y no uno.
 *   apple-touch-icon.png    180×180, que es lo que mira iPhone
 *   img/favicon.svg         el de la pestaña: un SVG con el PNG adentro, para
 *                           que las páginas lo sigan pidiendo por el mismo
 *                           nombre (antes era un emoji ♟️, que cada sistema
 *                           dibuja distinto).
 *
 *     npm install playwright && node herramientas/pwa-iconos.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "img", "app");
const LOGO = path.join(RAIZ, "img", "logo-oscar-angulo.png");

// De la paleta de herramientas/css-construir.js.
const FONDO = "#102a43";      // brand-800, el azul del encabezado y del theme-color

// La cinta empieza a los 740 px de los 902 del original: todo lo de arriba es
// el dibujo. Es el mismo corte de herramientas/logo-encabezado.py.
const FIN_DEL_DIBUJO = 740 / 902;

/* margen es cuánto del lado se deja libre alrededor del logo, de 0 a 1.
   El logo es más ancho que alto, así que el ancho es el que manda. */
const ICONOS = [
  { archivo: "icon-192.png", lado: 192, margen: 0.12, redondeado: false },
  { archivo: "icon-512.png", lado: 512, margen: 0.12, redondeado: false },
  // Con 20 % de margen el logo entero cae dentro del círculo que recorta Android.
  { archivo: "icon-512-maskable.png", lado: 512, margen: 0.20, redondeado: false },
  { archivo: "apple-touch-icon.png", lado: 180, margen: 0.12, redondeado: true },
];
/* La pestaña se ve a 16 y 32 px: ahí los cuadros de los lados vuelven el
   logo diminuto y ruidoso. Lleva solo el caballo con el peón (la franja del
   medio del original, del 27,5 % al 70,5 % del ancho), que es lo que se
   reconoce a ese tamaño. */
const FAVICON = { lado: 64, margen: 0.08, redondeado: true, recorteX: [0.275, 0.705] };

/* Corre dentro del navegador: recorta el logo (sin la cinta y sin el borde
   transparente) y lo dibuja centrado sobre el fondo. Devuelve el PNG en base64. */
async function dibujar({ logo, fondo, finDelDibujo, lado, margen, redondeado, recorteX }) {
  const img = new Image();
  img.src = logo;
  await img.decode();

  // 1. El dibujo, sin la cinta.
  const alto = Math.round(img.naturalHeight * finDelDibujo);
  const a = document.createElement("canvas");
  a.width = img.naturalWidth; a.height = alto;
  const ca = a.getContext("2d");
  ca.drawImage(img, 0, 0);
  // 2. La caja de lo que no es transparente.
  //    Con recorteX, solo dentro de esa franja del ancho.
  const px = ca.getImageData(0, 0, a.width, a.height).data;
  const desde = recorteX ? Math.round(a.width * recorteX[0]) : 0;
  const hasta = recorteX ? Math.round(a.width * recorteX[1]) : a.width;
  let x0 = a.width, y0 = a.height, x1 = -1, y1 = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = desde; x < hasta; x++) {
      if (px[(y * a.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;

  // 3. El icono: fondo y logo centrado.
  const c = document.createElement("canvas");
  c.width = lado; c.height = lado;
  const cc = c.getContext("2d");
  cc.fillStyle = fondo;
  if (redondeado) {
    cc.beginPath();
    cc.roundRect(0, 0, lado, lado, lado * 0.22);
    cc.fill();
  } else {
    cc.fillRect(0, 0, lado, lado);
  }
  const util = lado * (1 - 2 * margen);
  const escala = Math.min(util / w, util / h);
  const dw = w * escala, dh = h * escala;
  cc.imageSmoothingQuality = "high";
  cc.drawImage(a, x0, y0, w, h, (lado - dw) / 2, (lado - dh) / 2, dw, dh);
  return c.toDataURL("image/png").split(",")[1];
}

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const logo = "data:image/png;base64," + fs.readFileSync(LOGO).toString("base64");
  const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const pagina = await navegador.newPage();
  await pagina.setContent("<body></body>");

  for (const ic of ICONOS) {
    const png = await pagina.evaluate(dibujar, { logo, fondo: FONDO, finDelDibujo: FIN_DEL_DIBUJO, ...ic });
    const destino = path.join(SALIDA, ic.archivo);
    fs.writeFileSync(destino, Buffer.from(png, "base64"));
    console.log(`  ok    ${ic.archivo.padEnd(24)} ${ic.lado}×${ic.lado} · ${(fs.statSync(destino).size / 1024).toFixed(1)} KB`);
  }

  const png = await pagina.evaluate(dibujar, { logo, fondo: FONDO, finDelDibujo: FIN_DEL_DIBUJO, ...FAVICON });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FAVICON.lado} ${FAVICON.lado}"><image width="${FAVICON.lado}" height="${FAVICON.lado}" href="data:image/png;base64,${png}"/></svg>\n`;
  fs.writeFileSync(path.join(RAIZ, "img", "favicon.svg"), svg);
  console.log(`  ok    ${"../favicon.svg".padEnd(24)} ${FAVICON.lado}×${FAVICON.lado} · ${(svg.length / 1024).toFixed(1)} KB`);

  await navegador.close();
  console.log(`\n${ICONOS.length} iconos en img/app/ y el favicon`);
})();
