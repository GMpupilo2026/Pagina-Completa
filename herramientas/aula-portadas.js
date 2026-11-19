/* Las portadas de la revista «Arbitraje de Ajedrez» para el Aula de Arbitraje.

   Cada número tiene, al principio de su colección en aula-arbitraje.html, una
   tarjeta con su portada y el PDF (que se baja al completar todo lo de ese
   número). La portada no se dibuja a mano: sale de la primera página del PDF
   que se publica, descargas/aula-arbitraje/revista-NN.pdf, con pdf.js
   (js/pdf.min.js) en Chromium, y se guarda en img/aula-arbitraje/portada-NN.jpg
   a 360 px de ancho. Así la portada y el PDF no pueden separarse: si cambia
   el PDF, se vuelve a correr esto.

   Uso:  node herramientas/aula-portadas.js
   Ver «Aula de Arbitraje» en docs/decisiones/juegos-y-torneos.md. */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { servirSitio } = require("./lib/servidor-estatico");

const RAIZ = path.join(__dirname, "..");
const ANCHO = 360;

(async () => {
    const pdfs = fs.readdirSync(path.join(RAIZ, "descargas", "aula-arbitraje")).filter((f) => /^revista-\d\d\.pdf$/.test(f)).sort();
    fs.mkdirSync(path.join(RAIZ, "img", "aula-arbitraje"), { recursive: true });
    const srv = await servirSitio();
    const nav = await chromium.launch();
    const pagina = await nav.newPage();
    // Una página del mismo origen que el servidor (aunque sea un 404), para que
    // pdf.js pueda pedir los PDF y su worker sin problemas de origen.
    await pagina.goto(srv.base + "/404.html").catch(() => {});
    await pagina.setContent("<!doctype html><title>portadas</title>");
    await pagina.addScriptTag({ url: srv.base + "/js/pdf.min.js" });
    for (const f of pdfs) {
        const nn = f.match(/\d\d/)[0];
        const datos = await pagina.evaluate(async ({ url, worker, ancho }) => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
            const doc = await window.pdfjsLib.getDocument(url).promise;
            const hoja = await doc.getPage(1);
            const v0 = hoja.getViewport({ scale: 1 });
            const v = hoja.getViewport({ scale: ancho / v0.width });
            const lienzo = document.createElement("canvas");
            lienzo.width = Math.round(v.width); lienzo.height = Math.round(v.height);
            await hoja.render({ canvasContext: lienzo.getContext("2d"), viewport: v }).promise;
            return { jpg: lienzo.toDataURL("image/jpeg", 0.82), alto: lienzo.height };
        }, { url: srv.base + "/descargas/aula-arbitraje/" + f, worker: srv.base + "/js/pdf.worker.min.js", ancho: ANCHO });
        const destino = path.join(RAIZ, "img", "aula-arbitraje", "portada-" + nn + ".jpg");
        fs.writeFileSync(destino, Buffer.from(datos.jpg.split(",")[1], "base64"));
        console.log("  " + path.relative(RAIZ, destino) + " (" + ANCHO + "×" + datos.alto + ")");
    }
    await nav.close();
    srv.cerrar();
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
