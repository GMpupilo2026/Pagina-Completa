/* El código de torneos-en-vivo.html: pinta una ficha por sala de torneo
 * (tabla salas_torneo, que edita quien administra en admin.html#torneos). La
 * ficha la arma js/salas-torneo.js, la misma que ve el editor de vista previa. */
(function () {
    "use strict";
    const cargando = document.getElementById("loading");
    const lista = document.getElementById("salas-lista");
    const vacio = document.getElementById("salas-vacio");

    SalasTorneo.listar().then((salas) => {
        const visibles = salas.filter((s) => s.visible);
        cargando.classList.add("hidden");
        if (!visibles.length) { vacio.classList.remove("hidden"); return; }
        visibles.forEach((s) => lista.appendChild(SalasTorneo.ficha(s)));
        lista.classList.remove("hidden");
    }).catch((e) => {
        console.error(e);
        cargando.textContent = "No pudimos cargar los torneos ahora mismo. Vuelve a intentarlo en un rato.";
    });
})();
