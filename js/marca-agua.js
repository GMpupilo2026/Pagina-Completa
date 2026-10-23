/**
 * Ajedrez Integral — la marca de agua de Ajedrez Integral (el caballo con
 * «AJEDREZ INTEGRAL» debajo, sin el nombre de Oscar), lista para un PDF. La
 * misma de los libros y materiales que arma herramientas/ (lib/marca-agua.js).
 * También arma el logo de una academia (prepararDesde), para el PDF del
 * diagnóstico de un visitante que llegó por su enlace, y el de quien organiza
 * un torneo en Pareo Integral (prepararDesdeDatos), para sus PDF.
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

  /* Contada desde este archivo y no desde la página: así sirve igual en una
     página de entreno/ o de la raíz. */
  const URL_MARCA = new URL("../img/marca-agua-ajedrez-integral.png", (document.currentScript && document.currentScript.src) || document.baseURI).href;
  let promesa = null;

  async function armar(url) {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error("no se pudo bajar el logo (" + respuesta.status + ")");
    return desdeBytes(new Uint8Array(await respuesta.arrayBuffer()));
  }
  async function desdeBytes(png) {
    /* La imagen se decodifica desde los bytes ya bajados (un blob:), no desde
       la dirección: el logo de una academia vive en Storage, otro origen, y
       leer sus píxeles desde ahí dejaría el lienzo «manchado» y sin alfa. */
    const img = new Image();
    const local = URL.createObjectURL(new Blob([png]));
    img.src = local;
    try { await img.decode(); } finally { setTimeout(() => URL.revokeObjectURL(local), 0); }
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

  /* Otro logo —el de una academia— listo igual para un PDF: cabecera y marca
     de agua. Se guarda por dirección, igual que la de Ajedrez Integral. */
  const porDireccion = new Map();
  function prepararDesde(url) {
    if (!porDireccion.has(url)) {
      porDireccion.set(url, armar(url).catch((e) => { porDireccion.delete(url); throw e; }));
    }
    return porDireccion.get(url);
  }

  /* Un logo que ya está en la página como imagen en base64 (data:image/…):
     el de quien organiza un torneo en Pareo Integral. Se lee sin fetch (la
     CSP no deja pedir data:) y se arma igual. */
  const porDatos = new Map();
  function prepararDesdeDatos(datos) {
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(String(datos || ""));
    if (!m) return Promise.reject(new Error("no es una imagen en base64"));
    if (!porDatos.has(datos)) {
      const binario = atob(m[2]);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
      porDatos.set(datos, desdeBytes(bytes).catch((e) => { porDatos.delete(datos); throw e; }));
    }
    return porDatos.get(datos);
  }

  return { preparar: preparar, prepararDesde: prepararDesde, prepararDesdeDatos: prepararDesdeDatos, URL: URL_MARCA };
})();
