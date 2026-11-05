/* La banderita al final del nombre de cada jugador (Centroamericano 2026): un poquito de identificación, el país de donde viene.

   La federación de cada jugador (CRC, GUA, ESA…) la manda la función centroamericano-mesa junto a las mesas (`fed_b`, `fed_n`), sacada
   de la lista de inscritos de chess-results. El dibujo es el de js/gafetes-banderas.js (la tabla de FIDE a ISO y los SVG de img/banderas/).
   Sin federación, o con una que no tiene dibujo, no se pone nada. El color nunca va solo: el código de FIDE va en el `title` y escrito
   (solo para el lector de pantalla) al lado del dibujo, que es decorativo.

     CentroamericanoBanderas.de(fed) → <span class="cam-bandera"> o null
     CentroamericanoBanderas.deMesa(m, "blancas" | "negras") → lo mismo, con la federación de ese lado de la mesa

   Ver «Banderas y mesas sin rival» en docs/decisiones/juegos-y-torneos.md. */
(function (global) {
    "use strict";

    function de(fed) {
        const G = global.GafetesBanderas;
        const codigo = String(fed || "").trim().toUpperCase();
        const iso = G && codigo ? G.iso(codigo) : null;
        if (!iso) return null;
        const s = document.createElement("span");
        s.className = "cam-bandera";
        s.dataset.fed = codigo;
        s.title = codigo;
        const i = document.createElement("img");
        i.src = G.ruta(iso);
        i.alt = "";
        i.width = 16;
        i.height = 12;
        i.decoding = "async";
        i.addEventListener("error", () => { s.hidden = true; });
        const t = document.createElement("span");
        t.className = "sr-only";
        t.textContent = " (" + codigo + ")";
        s.append(i, t);
        return s;
    }

    const deMesa = (m, color) => de(m && (color === "blancas" || color === "Blancas" ? m.fed_b : m.fed_n));

    global.CentroamericanoBanderas = { de, deMesa };
})(window);

/*! rev bfb5bbb0d2d82f9f */
