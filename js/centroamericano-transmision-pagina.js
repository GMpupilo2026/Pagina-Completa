/* centroamericano-transmision.html: la pantalla del encargado de transmisión del Centroamericano 2026.
 *
 * Sin cuenta: entra con el QR que le da el árbitro principal; el token va después del «#» (así no viaja en las
 * visitas ni queda en los registros del servidor) y lo valida la Edge Function centroamericano-transmision. Sin
 * token, o con uno que la función no acepta, no se arma nada y se dice por qué. Todo lo demás lo arma
 * js/centroamericano-transmision.js, la misma pantalla de la pestaña «Transmisión» del árbitro principal.
 * Ver «El encargado de transmisión (Centroamericano)» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const token = (location.hash || "").replace(/^#(t=)?/, "").trim();
    // El token no se guarda en el navegador: sale del enlace cada vez.

    function sinEnlace(texto) {
        $("sin-enlace").textContent = texto;
        $("sin-enlace").hidden = false;
        $("tx-app").hidden = true;
    }

    async function iniciar() {
        if (!/^[0-9a-f]{64}$/.test(token)) {
            sinEnlace("Esta pantalla se abre con el QR de transmisión que te da el árbitro principal. Escanéalo otra vez o pídele uno nuevo.");
            return;
        }
        window.CentroamericanoTransmision.iniciar({ raiz: $("tx-app"), token, visible: () => !document.hidden, alFallar: sinEnlace });
    }

    iniciar();
})();
