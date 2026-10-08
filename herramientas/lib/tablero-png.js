#!/usr/bin/env node
/* Tableros en PNG para las presentaciones (.pptx), que no aceptan SVG.
 *
 * Dibuja con herramientas/lib/tablero-svg.js —las mismas piezas que el sitio—
 * y le saca la foto con Chromium (playwright), así no hay una segunda copia de
 * los dibujos. Recibe un JSON con [{ fen, archivo, titulo }] y escribe cada PNG.
 *
 *   node herramientas/lib/tablero-png.js lista.json
 */
const fs = require("fs");
const { chromium } = require("playwright");
const { tablero } = require("./tablero-svg");

// El Chromium que ya usan los generadores y verificadores (CHROME_PATH para otro).
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

(async () => {
  const lista = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const navegador = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const pagina = await navegador.newPage({ deviceScaleFactor: 1 });
  for (const t of lista) {
    const svg = tablero(t.fen, { coordenadas: true, titulo: t.titulo || "Diagrama de ajedrez" })
      .replace(/width="[\d.]+" height="[\d.]+"/, 'width="720" height="720"');
    await pagina.setContent('<body style="margin:0;background:#fff">' + svg + "</body>");
    await (await pagina.$("svg")).screenshot({ path: t.archivo, omitBackground: false });
  }
  await navegador.close();
})().catch((e) => { console.error(e); process.exit(1); });
