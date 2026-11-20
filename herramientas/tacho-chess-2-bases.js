#!/usr/bin/env node
/* Genera las bases del Torneo Intereducativo Tacho Chess 2 en PDF:
 *
 *   documentos/tacho-chess-2/bases-tacho-chess-2.pdf
 *
 * Con la misma copia de todo lo que ya hay: los datos salen de `bases` en
 * herramientas/torneos-universitarios/tacho-chess-2.js (los mismos del
 * calendario de la página), el texto de js/bases-torneo.js (el del «Generador
 * de bases del torneo», que dice lo que piden las Leyes del Ajedrez) y el PDF
 * de js/reporte-pdf.js, que le pone la marca de agua de Ajedrez Integral
 * (js/marca-agua.js). Corre en Chromium, con el sitio servido por un servidor
 * propio y efímero: ReportePDF pide la marca por http.
 *
 * Antes de escribir, BasesTorneo.revisar() no puede dar ningún error.
 *
 *   node herramientas/tacho-chess-2-bases.js
 *
 * Ver «La del Tacho Chess 2» en docs/decisiones/juegos-y-torneos.md.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");
const B = require("../js/bases-torneo.js");
const { bases } = require("./torneos-universitarios/tacho-chess-2.js");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "documentos/tacho-chess-2/bases-tacho-chess-2.pdf");
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".css": "text/css", ".svg": "image/svg+xml" };

const errores = B.revisar(bases).filter((x) => x.tipo === "error");
if (errores.length) {
  console.error("✗ Las bases no están completas:\n  " + errores.map((x) => x.texto).join("\n  "));
  process.exit(1);
}

const servidor = http.createServer((pedido, respuesta) => {
  const url = decodeURIComponent(pedido.url.split("?")[0]);
  if (url === "/") {
    respuesta.writeHead(200, { "Content-Type": "text/html" });
    respuesta.end('<!DOCTYPE html><meta charset="utf-8"><script src="/js/pareo/desempates.js"></script><script src="/js/marca-agua.js"></script><script src="/js/reporte-pdf.js"></script><script src="/js/bases-torneo.js"></script>');
    return;
  }
  const ruta = path.join(RAIZ, path.normalize(url));
  if (!ruta.startsWith(RAIZ) || !fs.existsSync(ruta) || !fs.statSync(ruta).isFile()) { respuesta.writeHead(404); respuesta.end(); return; }
  respuesta.writeHead(200, { "Content-Type": TIPOS[path.extname(ruta)] || "application/octet-stream" });
  fs.createReadStream(ruta).pipe(respuesta);
});

(async () => {
  await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
  const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  try {
    const pagina = await navegador.newPage();
    await pagina.goto("http://127.0.0.1:" + servidor.address().port + "/", { waitUntil: "load" });
    const datos = await pagina.evaluate(async (d) => {
      const doc = window.BasesTorneo.documento(d);
      const marca = await window.MarcaAgua.preparar();
      if (!marca || !marca.jpeg) throw new Error("sin la marca de agua");
      const blob = await window.ReportePDF.generar(Object.assign({}, doc, { marca }));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, bases);
    fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
    const nuevo = Buffer.from(datos);
    fs.writeFileSync(SALIDA, nuevo);
    console.log("✓ " + path.relative(RAIZ, SALIDA) + " (" + Math.round(nuevo.length / 1024) + " KB)");
  } finally {
    await navegador.close();
    servidor.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
