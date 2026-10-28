/* La lectura del tablero en su propio hilo (un Web Worker), para que la
 * página no se trabe: con varias cámaras en una computadora (camaras.html)
 * todos los cuadritos comparten el hilo de la página, y copiar la imagen y
 * mirar las 64 casillas cinco veces por segundo en cada uno se sumaba.
 *
 * Recibe el recorte de la imagen donde están los tableros (un ImageBitmap,
 * ya achicado a la escala de trabajo) y devuelve la lectura de cada tablero.
 * Lo que se calcula es lo mismo de la página: js/lector-tablero.js. Ver «La
 * cámara gasta poco» en docs/decisiones/juegos-y-torneos.md. */
/* global importScripts, OffscreenCanvas */
importScripts("lector-tablero.js");

let lienzo = null, ctx = null;
self.onmessage = (e) => {
    const { id, imagen, ox, oy, tableros } = e.data;
    try {
        const w = imagen.width, h = imagen.height;
        if (!lienzo) { lienzo = new OffscreenCanvas(w, h); ctx = lienzo.getContext("2d", { willReadFrequently: true }); }
        if (lienzo.width !== w || lienzo.height !== h) { lienzo.width = w; lienzo.height = h; }
        ctx.drawImage(imagen, 0, 0);
        imagen.close();
        const pix = ctx.getImageData(0, 0, w, h).data;
        const L = self.LectorTablero;
        const lecturas = tableros.map((t) => {
            const det = L.leerDetalle(L.muestras(pix, w, h, t.h, ox, oy), t.cal);
            return { i: t.i, lectura: det.lectura, seguridad: det.seguridad };
        });
        self.postMessage({ id, lecturas });
    } catch (err) {
        self.postMessage({ id, error: String(err && err.message || err) });
    }
};
