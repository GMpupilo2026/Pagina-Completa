/**
 * Ajedrez Integral — la marca de agua de Oscar Angulo Cubero, lista para un PDF.
 *
 * El generador de PDF (`js/reporte-pdf.js`) necesita el logo partido en dos:
 * el dibujo en JPEG y su canal alfa aparte. Sin el alfa, la imagen taparía el
 * texto con un rectángulo blanco. Word, en cambio, usa el PNG tal cual y lo
 * lava él, así que también se devuelve.
 *
 * Vivía dentro de `reportes.html`. Lo usan ahora dos pantallas —los reportes
 * de actividades y el diagnóstico de un visitante— y escrito dos veces se
 * separaría a la primera corrección: un PDF saldría con la marca y el otro no.
 */
window.MarcaAgua = (function () {
  "use strict";

  const URL_MARCA = "img/logo-oscar-angulo-marca.png";
  let promesa = null;

  async function armar(url) {
    const png = new Uint8Array(await (await fetch(url)).arrayBuffer());
    const img = new Image();
    img.src = url;
    await img.decode();
    const lienzo = document.createElement("canvas");
    lienzo.width = img.naturalWidth;
    lienzo.height = img.naturalHeight;
    const ctx = lienzo.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const pixeles = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
    const alfa = new Uint8Array(lienzo.width * lienzo.height);
    for (let i = 0; i < alfa.length; i++) alfa[i] = pixeles[i * 4 + 3];

    const sobreBlanco = document.createElement("canvas");
    sobreBlanco.width = lienzo.width;
    sobreBlanco.height = lienzo.height;
    const ctx2 = sobreBlanco.getContext("2d");
    ctx2.fillStyle = "#fff";
    ctx2.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx2.drawImage(img, 0, 0);
    const jpeg = await new Promise((r) => sobreBlanco.toBlob(r, "image/jpeg", 0.92));

    return {
      ancho: lienzo.width, alto: lienzo.height,
      jpeg: new Uint8Array(await jpeg.arrayBuffer()),
      alfa: alfa, png: png,
    };
  }

  /* Se arma una sola vez por carga: bajar el logo y recorrerlo píxel por píxel
     en cada descarga es trabajo tirado. Si falla, se olvida la promesa para
     que el próximo intento vuelva a probar en vez de fallar para siempre. */
  function preparar() {
    if (!promesa) promesa = armar(URL_MARCA).catch((e) => { promesa = null; throw e; });
    return promesa;
  }

  return { preparar: preparar, URL: URL_MARCA };
})();
