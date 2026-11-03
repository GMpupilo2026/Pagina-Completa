/* centroamericano-fair-play.html: la pantalla del encargado de Fair Play del Centroamericano 2026.
 *
 * Sin cuenta: entra con el QR que le da el árbitro principal; el token va después del «#» (así no viaja en las
 * visitas ni queda en los registros del servidor) y lo valida la Edge Function centroamericano-fair-play. Sin
 * token, o con uno que la función no acepta, no se arma nada y se dice por qué. Todo lo demás lo arma
 * js/centroamericano-fair-play.js, la misma pantalla de la pestaña «Fair Play» del árbitro principal.
 * Ver «El sorteo de Fair Play» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const token = (location.hash || "").replace(/^#(t=)?/, "").trim();
    // El token no se guarda en el navegador: sale del enlace cada vez.

    function sinEnlace(texto) {
        $("sin-enlace").textContent = texto;
        $("sin-enlace").hidden = false;
        $("fp-app").hidden = true;
    }

    async function iniciar() {
        if (!/^[0-9a-f]{64}$/.test(token)) {
            sinEnlace("Esta pantalla se abre con el QR de Fair Play que te da el árbitro principal. Escanéalo otra vez o pídele uno nuevo.");
            return;
        }
        // Se prueba el enlace antes de armar la pantalla: uno apagado o vencido no muestra nada.
        let { data, error } = await window.sb.functions.invoke("centroamericano-fair-play", { body: { action: "leer", token } });
        if (error && error.context && typeof error.context.json === "function") {
            try { const j = await error.context.json(); if (j && j.error) error = new Error(j.error); } catch (e) { /* sin cuerpo */ }
        }
        if (error || !data || data.error) { sinEnlace((error && error.message) || (data && data.error) || "No se pudo abrir la pantalla de Fair Play."); return; }
        document.title = "Fair Play de " + data.nombre + " — Centroamericano 2026 | Ajedrez Integral";
        window.CentroamericanoFairPlay.iniciar({ raiz: $("fp-app"), token, visible: () => !document.hidden });
    }

    iniciar();
})();
