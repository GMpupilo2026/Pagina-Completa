/* Un servidor del sitio, solo para los scripts que sacan capturas de las páginas
 * (capturas-mesa-arbitro.js, capturas-centroamericano.js): sirve la carpeta del
 * repositorio en un puerto libre de 127.0.0.1, sin depender de que alguien haya
 * levantado el del 8777. Devuelve { base, cerrar }.
 */
"use strict";
const path = require("path");
const fs = require("fs");
const http = require("http");

const RAIZ = path.join(__dirname, "..", "..");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css",
    ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2",
    ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".mp3": "audio/mpeg" };

function servirSitio() {
    const srv = http.createServer((req, res) => {
        let ruta = decodeURIComponent(req.url.split(/[?#]/)[0]);
        if (ruta.endsWith("/")) ruta += "index.html";
        const archivo = path.join(RAIZ, path.normalize(ruta));
        if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": TIPOS[path.extname(archivo)] || "application/octet-stream" });
        fs.createReadStream(archivo).pipe(res);
    });
    return new Promise((ok) => srv.listen(0, "127.0.0.1", () =>
        ok({ base: "http://127.0.0.1:" + srv.address().port, cerrar: () => srv.close() })));
}

module.exports = { servirSitio };

/*! rev bfb5bbb0d2d82f9f */
