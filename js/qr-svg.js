/* El código QR dibujado en SVG con el DOM (nada de innerHTML), para las
   páginas que lo muestran: el certificado de un curso (js/certificado.js) y la
   ficha pública de un árbitro (js/arbitros-publico.js) y el pareo para
   proyectar del Centroamericano (js/centroamericano-tablas.js). Necesita la librería
   js/vendor/qrcode.js cargada antes.

   Lleva su margen blanco de 4 módulos, que es parte del código (sin él la
   cámara no lo encuentra), y corrección de errores M.

       window.QrSvg.dibujar(texto, etiqueta)  → <svg role="img"> o null */
(function () {
    "use strict";
    const NS = "http://www.w3.org/2000/svg";
    function dibujar(texto, etiqueta) {
        if (!window.qrcode) return null;
        const q = window.qrcode(0, "M");
        q.addData(texto);
        q.make();
        const n = q.getModuleCount(), borde = 4, lado = n + borde * 2;
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
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += "M" + (x + borde) + " " + (y + borde) + "h1v1h-1z";
        const puntos = document.createElementNS(NS, "path");
        puntos.setAttribute("d", d);
        puntos.setAttribute("fill", "#000000");
        s.append(fondo, puntos);
        return s;
    }
    window.QrSvg = { dibujar };
})();
