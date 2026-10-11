/* Dibuja un código QR a partir de un texto cualquiera, con la librería
 * vendorizada js/vendor/qrcode.js (se pide recién al mostrarlo, nunca de
 * entrada). Es una copia chica y a propósito de la misma idea de
 * js/clase-qr.js (sesion.html): ese archivo es crítico para la clase en vivo
 * y tiene su propio comprobador que lee el código con una cámara simulada;
 * no se toca acá para compartir quince líneas estables. Ver «El enlace y el
 * QR de solo lectura» en docs/decisiones/juegos-y-torneos.md.
 */
window.PareoQr = (function () {
  "use strict";

  let carga = null;
  function cargar() {
    if (window.qrcode) return Promise.resolve();
    if (!carga) {
      carga = new Promise((listo, fallo) => {
        const s = document.createElement("script");
        s.src = "js/vendor/qrcode.js";
        s.addEventListener("load", listo);
        s.addEventListener("error", () => { carga = null; fallo(new Error("No cargó la librería del código QR")); });
        document.head.appendChild(s);
      });
    }
    return carga;
  }

  // El dibujo, armado con el DOM (nada de innerHTML), con su margen blanco de
  // 4 módulos: sin él la cámara de un celular no lo encuentra.
  function svg(texto, etiqueta) {
    const qr = window.qrcode(0, "M");
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    const borde = 4, lado = n + borde * 2;
    const NS = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 " + lado + " " + lado);
    s.setAttribute("width", "100%");
    s.setAttribute("height", "100%");
    s.setAttribute("shape-rendering", "crispEdges");
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", etiqueta);
    const fondo = document.createElementNS(NS, "rect");
    fondo.setAttribute("width", String(lado));
    fondo.setAttribute("height", String(lado));
    fondo.setAttribute("fill", "#ffffff");
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += "M" + (x + borde) + " " + (y + borde) + "h1v1h-1z";
    const puntos = document.createElementNS(NS, "path");
    puntos.setAttribute("d", d);
    puntos.setAttribute("fill", "#000000");
    s.append(fondo, puntos);
    return s;
  }

  return { cargar, svg };
})();
