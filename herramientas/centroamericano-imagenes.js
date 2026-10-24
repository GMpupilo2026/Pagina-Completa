/* Genera lo que se comparte del Centroamericano 2026, con la cara de su página
 * (los colores y la mascota de las bases):
 *
 *   img/centroamericano-2026/compartir.jpg
 *       La imagen de 1200 × 630 que muestran WhatsApp, Facebook y compañía al
 *       pegar el enlace (og:image de centroamericano-2026.html).
 *   documentos/centroamericano-2026/cartel-centroamericano-2026.pdf
 *       El cartel tamaño carta para pegar en los hoteles y en la sala, con el
 *       código QR que lleva a la página. Lleva la marca de agua de Ajedrez
 *       Integral (herramientas/lib/marca-agua.js), como todo documento que sale
 *       del sitio.
 *
 *   documentos/centroamericano-2026/calendario-centroamericano-2026.ics
 *       «Agregar a mi calendario»: cada actividad del calendario de la página
 *       (las filas con data-inicio de #calendario, en hora de Costa Rica), con
 *       un aviso 30 minutos antes de cada ronda. Sale de la tabla: una sola
 *       copia de las horas.
 *
 * No se editan a mano: se vuelven a generar con este script. Las fechas, la
 * sede y el ritmo salen de las bases, igual que en la página.
 *
 * Uso:  node herramientas/centroamericano-imagenes.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const URL_PAGINA = "https://ajedrez-integral.com/centroamericano-2026.html";
const URL_CORTA = "ajedrez-integral.com/centroamericano-2026";
const IMAGEN = path.join(RAIZ, "img/centroamericano-2026/compartir.jpg");
const CARTEL = path.join(RAIZ, "documentos/centroamericano-2026/cartel-centroamericano-2026.pdf");
const MARCA = require("./lib/marca-agua").MARCA_AGUA;
const ICS = path.join(RAIZ, "documentos/centroamericano-2026/calendario-centroamericano-2026.ics");
const PAGINA = path.join(RAIZ, "centroamericano-2026.html");

/* El calendario: una fila de la tabla, un evento. Las horas van en UTC (Costa
   Rica es siempre UTC−6, sin horario de verano), así cualquier calendario las
   muestra bien en la zona de quien lo abre. */
function calendarioIcs() {
  const html = fs.readFileSync(PAGINA, "utf8");
  const filas = [...html.matchAll(/<tr data-inicio="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})" data-minutos="(\d+)"[^>]*><th[^>]*>([^<]+)<\/th>/g)];
  if (filas.length < 10) throw new Error("el calendario de la página no trae sus horas");
  const utc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ingles = { "Llegada y acreditación (en los hoteles)": "Arrival and accreditation", "Congresillo": "Technical meeting",
    "Inauguración": "Opening ceremony", "Torneo Rapid": "Rapid tournament", "Torneo Blitz": "Blitz tournament",
    "Clausura": "Closing ceremony", "Salida": "Departure" };
  const linea = (s) => s.replace(/([,;\\])/g, "\\$1");
  const eventos = filas.map(([, inicio, minutos, nombre]) => {
    nombre = nombre.replace(/&amp;/g, "&").trim();
    const desde = new Date(inicio + ":00-06:00");
    const hasta = new Date(desde.getTime() + Number(minutos) * 60000);
    const en = /^Ronda (\d+)$/.test(nombre) ? nombre.replace("Ronda", "Round") : ingles[nombre];
    // La llegada y la salida son en los hoteles; el congresillo (la reunión
    // técnica) es virtual, con el enlace que manda la organización.
    const lugar = /hoteles|^Salida$/.test(nombre) ? "Hoteles oficiales, San José"
      : /^Congresillo$/.test(nombre) ? "Virtual (con el enlace que envía la organización)"
      : "Gimnasio Nacional, Parque Metropolitano La Sabana, San José, Costa Rica";
    const uid = "cac2026-" + nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "@ajedrez-integral.com";
    return [
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:20261024T000000Z",
      "DTSTART:" + utc(desde),
      "DTEND:" + utc(hasta),
      "SUMMARY:" + linea(nombre + (en ? " · " + en : "") + " — Centroamericano 2026"),
      "LOCATION:" + linea(lugar),
      "URL:" + URL_PAGINA,
      ...(/^Ronda/.test(nombre) ? ["BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:" + linea(nombre + " en 30 minutos"), "END:VALARM"] : []),
      "END:VEVENT",
    ].join("\r\n");
  });
  // Una línea de más de 75 bytes se parte, con un espacio al empezar la que sigue (RFC 5545).
  const plegar = (l) => {
    const partes = [];
    let actual = "";
    for (const c of l) {
      if (Buffer.byteLength(actual + c) > (partes.length ? 74 : 75)) { partes.push(actual); actual = ""; }
      actual += c;
    }
    partes.push(actual);
    return partes.join("\r\n ");
  };
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ajedrez Integral//Centroamericano 2026//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Centroamericano 2026", "X-WR-TIMEZONE:America/Costa_Rica", ...eventos, "END:VCALENDAR"]
    .join("\r\n").split("\r\n").map(plegar).join("\r\n") + "\r\n";
}

const archivo = (rel) => "file://" + path.join(RAIZ, rel);
const FUENTES = `
  @font-face { font-family: Inter; font-weight: 100 900; src: url('${archivo("fonts/inter-variable-latin.woff2")}') format('woff2'); }
  @font-face { font-family: Inter; font-weight: 100 900; src: url('${archivo("fonts/inter-variable-latin-ext.woff2")}') format('woff2');
    unicode-range: U+0100-02BA, U+1E00-1EFF; }`;
// La bandera de Costa Rica (1-1-2-1-1) y la fila de casillas, como en las fichas de la página.
const BANDERA = "linear-gradient(to bottom, #002b7f 0 16.67%, #fff 16.67% 33.33%, #ce1126 33.33% 66.67%, #fff 66.67% 83.33%, #002b7f 83.33% 100%)";
const COMUN = `${FUENTES}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, sans-serif; }
  .pildora { display: inline-block; background: #ce1328; color: #fff; font-weight: 800; text-transform: uppercase;
    letter-spacing: .04em; border-radius: .6em; padding: .25em .8em; box-shadow: 0 .2em 0 rgba(0,0,0,.18); }
  .titulo { font-weight: 800; text-transform: uppercase; line-height: 1.05; text-shadow: 0 .08em 0 rgba(30,36,83,.45); }
  .bandera { position: absolute; left: 0; right: 0; top: 0; background: ${BANDERA}; }
  .casillas { position: absolute; left: 0; right: 0; opacity: .3;
    background: repeating-linear-gradient(90deg, #fff 0 var(--c), transparent var(--c) calc(var(--c) * 2)); }
  .hojas { position: absolute; opacity: .5; }`;

/* La imagen para compartir: 1200 × 630. */
const HTML_IMAGEN = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${COMUN}
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  .lienzo { position: relative; width: 1200px; height: 630px; overflow: hidden; color: #fff;
    background: linear-gradient(165deg, #40478f 0%, #5a5fa3 100%); }
  .bandera { height: 26px; }
  .casillas { top: 26px; height: 12px; --c: 12px; }
  .texto { position: absolute; left: 70px; top: 92px; width: 720px; }
  .pildora { font-size: 26px; }
  .titulo { font-size: 58px; margin-top: 26px; }
  .anio { display: block; font-size: 40px; margin-top: 12px; }
  .datos { margin-top: 30px; font-size: 27px; font-weight: 700; line-height: 1.4; }
  .web { position: absolute; left: 70px; bottom: 40px; font-size: 22px; font-weight: 700; color: #fff; opacity: .92; }
  /* El pizote de la portada (600 × 848): el del trofeo de las bases mide 124 px y saldría borroso. */
  .mascota { position: absolute; right: 64px; top: 118px; width: 340px; height: 340px; border-radius: 50%; object-fit: cover;
    object-position: 50% 8%; border: 10px solid #fff; box-shadow: 0 16px 30px rgba(30,36,83,.45); }
  .hojas { width: 300px; }
  .marca { position: absolute; right: 26px; bottom: 18px; width: 120px; opacity: .22; }
</style></head><body><div class="lienzo">
  <img class="hojas" src="${archivo("img/centroamericano-2026/hojas.png")}" style="left:-30px; bottom:-40px; transform: scaleY(-1)">
  <img class="hojas" src="${archivo("img/centroamericano-2026/hojas.png")}" style="right:-40px; top:20px; transform: scaleX(-1)">
  <div class="bandera"></div><div class="casillas"></div>
  <div class="texto">
    <span class="pildora">XXI Festival</span>
    <h1 class="titulo">Centroamericano y del Caribe de la Juventud<span class="anio">Costa Rica 2026</span></h1>
    <p class="datos">Del 1 al 8 de noviembre · Gimnasio Nacional, La Sabana</p>
  </div>
  <p class="web">${URL_CORTA} — bases, hoteles, calendario y resultados</p>
  <img class="mascota" src="${archivo("img/centroamericano-2026/mascota.jpg")}">
  <img class="marca" src="${archivo(MARCA)}">
</div></body></html>`;

/* El cartel: tamaño carta, para imprimir. */
const htmlCartel = (qrSvg) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${COMUN}
  @page { size: Letter; margin: 0; }
  html, body { width: 215.9mm; height: 279.4mm; }
  .hoja { position: relative; width: 215.9mm; height: 279.4mm; overflow: hidden; background: #f4f4fb; color: #1e2453; }
  .portada { position: relative; height: 128mm; overflow: hidden; color: #fff; text-align: center;
    background: linear-gradient(165deg, #40478f 0%, #5a5fa3 100%); }
  .bandera { height: 9mm; }
  .casillas { top: 9mm; height: 4mm; --c: 4mm; }
  .hojas { width: 62mm; }
  .portada .contenido { position: relative; padding-top: 20mm; }
  .pildora { font-size: 13pt; }
  .titulo { font-size: 30pt; margin: 6mm 14mm 0; }
  .anio { display: block; font-size: 22pt; margin-top: 3mm; }
  .datos { margin-top: 6mm; font-size: 14pt; font-weight: 700; line-height: 1.45; }
  .cuerpo { position: relative; display: flex; align-items: center; gap: 12mm; padding: 14mm 18mm 0; }
  .qr { flex: none; width: 82mm; height: 82mm; background: #fff; border-radius: 6mm; padding: 4mm;
    box-shadow: 0 2mm 6mm rgba(64,71,143,.25); border: 1.2mm solid #40478f; }
  .qr svg { display: block; width: 100%; height: 100%; }
  .lado h2 { font-size: 22pt; font-weight: 800; line-height: 1.15; color: #40478f; }
  .lado ul { list-style: none; margin-top: 5mm; font-size: 13pt; line-height: 1.6; font-weight: 600; }
  .lado li::before { content: "♟ "; color: #ce1328; }
  .lado .en { margin-top: 5mm; font-size: 11.5pt; color: #40478f; font-weight: 600; }
  .web { margin-top: 4mm; font-size: 10.5pt; font-weight: 800; color: #1e2453; text-align: center; white-space: nowrap; }
  .mascota { position: absolute; right: 14mm; bottom: 10mm; width: 38mm; }
  .organiza { position: absolute; left: 18mm; bottom: 12mm; display: flex; align-items: center; gap: 7mm; }
  .organiza strong { font-size: 9pt; text-transform: uppercase; letter-spacing: .08em; }
  .organiza img { height: 17mm; width: auto; }
  .sello { position: absolute; left: 50%; top: 58%; width: 120mm; transform: translate(-50%, -50%) rotate(-15deg); opacity: .08; }
  .pie { position: absolute; left: 0; right: 0; bottom: 4mm; text-align: center; font-size: 8pt; color: #40478f; }
</style></head><body><div class="hoja">
  <div class="portada">
    <img class="hojas" src="${archivo("img/centroamericano-2026/hojas.png")}" style="left:-6mm; top:-4mm">
    <img class="hojas" src="${archivo("img/centroamericano-2026/hojas.png")}" style="right:-6mm; bottom:-6mm; transform: scale(-1,-1)">
    <div class="bandera"></div><div class="casillas"></div>
    <div class="contenido">
      <span class="pildora">XXI Festival</span>
      <h1 class="titulo">Centroamericano y del Caribe de la Juventud<span class="anio">Costa Rica 2026</span></h1>
      <p class="datos">Del 1 al 8 de noviembre de 2026<br>Gimnasio Nacional, Parque Metropolitano La Sabana</p>
    </div>
  </div>
  <img class="sello" src="${archivo(MARCA)}">
  <div class="cuerpo">
    <div><div class="qr">${qrSvg}</div><p class="web">${URL_CORTA}</p></div>
    <div class="lado">
      <h2>Todo el torneo en tu celular</h2>
      <ul>
        <li>Calendario de rondas</li>
        <li>Resultados en vivo</li>
        <li>Pedir un bye</li>
        <li>Hoteles y cómo llegar</li>
        <li>Contactos de la organización</li>
      </ul>
      <p class="en" lang="en">Scan the code: schedule, live results, byes, hotels and contacts. Tap “English” at the top of the page.</p>
    </div>
  </div>
  <div class="organiza"><strong>Organiza</strong>
    <img src="${archivo("img/centroamericano-2026/cca-logo.png")}"><img src="${archivo("img/fca-logo.png")}"></div>
  <img class="mascota" src="${archivo("img/centroamericano-2026/mascota.jpg")}" style="border-radius: 50%; border: 1.5mm solid #fff; aspect-ratio: 1; object-fit: cover; object-position: 50% 8%; box-shadow: 0 2mm 5mm rgba(64,71,143,.35)">
  <p class="pie">Página y cartel hechos por Ajedrez Integral · ajedrez-integral.com</p>
</div></body></html>`;

// El QR, con la misma librería del sitio (js/vendor/qrcode.js) y su margen blanco de 4 módulos.
function qrSvg(texto) {
  const q = require(path.join(RAIZ, "js/vendor/qrcode.js"))(0, "M");
  q.addData(texto);
  q.make();
  const n = q.getModuleCount(), borde = 4, lado = n + borde * 2;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += "M" + (x + borde) + " " + (y + borde) + "h1v1h-1z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img" aria-label="Código QR a la página del Centroamericano 2026"><rect width="${lado}" height="${lado}" fill="#fff"/><path d="${d}" fill="#1e2453"/></svg>`;
}

(async () => {
  fs.writeFileSync(ICS, calendarioIcs());
  console.log("✓", path.relative(RAIZ, ICS));
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cac-"));
  try {
    const pImg = await navegador.newPage({ viewport: { width: 1200, height: 630 } });
    fs.writeFileSync(path.join(tmp, "imagen.html"), HTML_IMAGEN);
    await pImg.goto("file://" + path.join(tmp, "imagen.html"), { waitUntil: "load" });
    await pImg.evaluate(() => document.fonts.ready);
    await pImg.screenshot({ path: IMAGEN, type: "jpeg", quality: 86 });
    console.log("✓", path.relative(RAIZ, IMAGEN));

    const pCartel = await navegador.newPage();
    fs.writeFileSync(path.join(tmp, "cartel.html"), htmlCartel(qrSvg(URL_PAGINA)));
    await pCartel.goto("file://" + path.join(tmp, "cartel.html"), { waitUntil: "load" });
    await pCartel.evaluate(() => document.fonts.ready);
    await pCartel.pdf({ path: CARTEL, format: "Letter", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    console.log("✓", path.relative(RAIZ, CARTEL));
  } finally {
    await navegador.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
