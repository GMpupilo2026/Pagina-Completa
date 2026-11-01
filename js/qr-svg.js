/* El código QR dibujado en SVG con el DOM (nada de innerHTML), para las
   páginas que lo muestran: el certificado de un curso (js/certificado.js) y la
   ficha pública de un árbitro (js/arbitros-publico.js) y el pareo para
   proyectar del Centroamericano (js/centroamericano-tablas.js). Necesita la librería
   js/vendor/qrcode.js cargada antes.

   Lleva su margen blanco de 4 módulos, que es parte del código (sin él la
   cámara no lo encuentra), y corrección de errores M.

   Con `{ marca: true }` lleva el caballo de Ajedrez Integral en el centro (los QR del
   Centroamericano siempre la llevan): para que se pueda leer igual, el código sube a
   corrección de errores H (la que tolera perder el 30 %) y la marca tapa menos del 6 %.

       window.QrSvg.dibujar(texto, etiqueta, { marca })  → <svg role="img"> o null */
(function () {
    "use strict";
    const NS = "http://www.w3.org/2000/svg";
    const MARCA = new URL("../img/app/icon-192.png", (document.currentScript && document.currentScript.src) || document.baseURI).href;
    function dibujar(texto, etiqueta, opciones) {
        if (!window.qrcode) return null;
        const marca = !!(opciones && opciones.marca);
        const q = window.qrcode(0, marca ? "H" : "M");
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
        if (marca) {
            // Un cuadro blanco con el caballo, al centro: 22 % del lado del código (la zona
            // central no lleva los tres cuadros de las esquinas ni la alineación del borde).
            const lado22 = Math.round(n * 0.22), x0 = borde + Math.floor((n - lado22) / 2);
            const blanco = document.createElementNS(NS, "rect");
            blanco.setAttribute("x", String(x0 - 0.6));
            blanco.setAttribute("y", String(x0 - 0.6));
            blanco.setAttribute("width", String(lado22 + 1.2));
            blanco.setAttribute("height", String(lado22 + 1.2));
            blanco.setAttribute("rx", "1.2");
            blanco.setAttribute("fill", "#ffffff");
            const logo = document.createElementNS(NS, "image");
            logo.setAttribute("href", MARCA);
            logo.setAttribute("x", String(x0));
            logo.setAttribute("y", String(x0));
            logo.setAttribute("width", String(lado22));
            logo.setAttribute("height", String(lado22));
            logo.setAttribute("data-marca", "ajedrez-integral");
            s.append(blanco, logo);
        }
        return s;
    }
    window.QrSvg = { dibujar };
})();
