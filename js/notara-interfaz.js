/* Notara como programa (camara-tablero.html): la barra de arriba con el
 * estado, los pasos para arrancar, las pestañas del panel y la barra de abajo.
 *
 * No lee ni anota nada: todo lo que muestra sale de window.estadoCamara()
 * (js/camara-tablero.js, el mismo que consulta camaras.html) y de lo que ya
 * está escrito en la página. Los dos botones del árbitro de la barra
 * («Marcar momento», «Revisar jugada») tocan los de la sección del VAR: una
 * sola copia de lo que hacen.
 *
 * Ver «Notara como programa» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const PESTANA = "notara_pestana_v1";
    const lista = $("nt-pestanas");
    if (!lista) return;
    const pestanas = [...lista.querySelectorAll("[role=tab]")];
    const panel = (b) => $(b.getAttribute("aria-controls"));
    const enMesa = () => document.documentElement.classList.contains("camara-mesa");

    /* Una pestaña se ve si su panel tiene algo para mostrar: en modo mesa
     * no salen las que son solo de quien administra. */
    function tieneAlgo(b) {
        return [...panel(b).children].some((x) => !x.hidden && !(enMesa() && x.hasAttribute("data-no-mesa")));
    }
    function elegir(nombre, foco) {
        let b = pestanas.find((x) => x.dataset.pestana === nombre && !x.hidden) || pestanas.find((x) => !x.hidden);
        if (!b) return;
        for (const x of pestanas) {
            const si = x === b;
            x.setAttribute("aria-selected", si ? "true" : "false");
            x.tabIndex = si ? 0 : -1;
            panel(x).hidden = !si;
        }
        if (foco) b.focus();
        try { localStorage.setItem(PESTANA, b.dataset.pestana); } catch (e) { /* sin almacenamiento */ }
    }
    function visibles() {
        let cambio = false;
        for (const b of pestanas) { const no = !tieneAlgo(b); if (b.hidden !== no) { b.hidden = no; cambio = true; } }
        const actual = pestanas.find((x) => x.getAttribute("aria-selected") === "true");
        if (cambio && (!actual || actual.hidden)) elegir(actual && actual.dataset.pestana);
    }
    for (const b of pestanas) b.addEventListener("click", () => elegir(b.dataset.pestana));
    lista.addEventListener("keydown", (e) => {
        const vis = pestanas.filter((x) => !x.hidden);
        const i = vis.indexOf(document.activeElement);
        if (i < 0) return;
        const k = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: vis.length - 1 }[e.key];
        if (k === undefined) return;
        e.preventDefault();
        elegir(vis[(k + vis.length) % vis.length].dataset.pestana, true);
    });
    // Llevar a una pestaña desde afuera (otro módulo, o un enlace a una sección).
    window.NotaraInterfaz = { elegir, pestanaDe: (el) => { const p = el && el.closest("[role=tabpanel]"); return p ? p.id.replace(/^nt-panel-/, "") : null; } };
    let guardada = null;
    try { guardada = localStorage.getItem(PESTANA); } catch (e) { /* sin almacenamiento */ }
    visibles();
    elegir(guardada || "partida");

    $("nt-ayuda").addEventListener("click", () => {
        elegir("mas");
        const h = $("t-guia");
        h.closest("section").scrollIntoView({ block: "start" });
        h.tabIndex = -1; h.focus();
    });
    $("nt-marcar").addEventListener("click", () => $("btn-var-marcar").click());
    $("nt-revisar").addEventListener("click", () => $("btn-var").click());

    /* Los pasos para arrancar y el botón que toca ahora (resaltado). */
    const PASOS = [
        ["camara", (e) => e.camara, "btn-camara"],
        ["tablero", (e) => e.esquinas, "btn-buscar"],
        ["calibrar", (e) => e.calibrada, "btn-calibrar"],
        ["partida", (e) => e.calibrada && e.jugadas > 0, null],
    ];
    const ESTADO_PASO = { hecho: "hecho", ahora: "ahora", falta: "falta" };
    function pintarPasos(e) {
        let ahora = null;
        for (const [nombre, listo, boton] of PASOS) {
            const li = $("nt-paso-" + nombre);
            const estado = listo(e) ? "hecho" : ahora ? "falta" : "ahora";
            if (estado === "ahora") ahora = boton;
            if (li.dataset.estado !== estado) {
                li.dataset.estado = estado;
                li.querySelector(".nt-paso-estado").textContent = " (" + ESTADO_PASO[estado] + ")";
                if (estado === "ahora") li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
            }
        }
        for (const [, , boton] of PASOS) if (boton) $(boton).classList.toggle("nt-siguiente", boton === ahora);
    }

    function chip(id, si, texto) {
        const c = $(id);
        if (c.hidden !== !si) c.hidden = !si;
        if (si && texto != null && c.textContent !== texto) c.textContent = texto;
    }
    function lugar() {
        if (!$("mesa-qr").hidden && $("mesa-titulo-qr").textContent) return $("mesa-titulo-qr").textContent;
        if (!$("torneo-elegido").hidden) return $("torneo-nombre").textContent + " · ronda " + $("torneo-ronda").textContent;
        return "";
    }
    function refrescar() {
        const e = window.estadoCamara && window.estadoCamara();
        if (!e) return;
        visibles();
        pintarPasos(e);
        const donde = lugar();
        chip("nt-lugar", !!donde, donde);
        chip("nt-vivo", e.transmitiendo, "● Transmitiendo");
        chip("nt-var", e.var.grabando, "● VAR");
        chip("nt-red", e.sinRed, "Sin señal");
        chip("nt-bateria", !!e.bateria, e.bateria ? "🔋 " + e.bateria.nivel + " %" + (e.bateria.cargando ? " ⚡" : "") : "");
        $("nt-marcar").hidden = !e.var.grabando;
        $("nt-revisar").disabled = $("btn-var").disabled;
        const msg = e.error ? "⚠️ " + e.error : e.dudas ? "⚠️ Hay una jugada en duda: elige cuál fue." : e.sinRed ? "Sin señal: la partida se sigue anotando." : "Todo bien";
        const est = $("nt-estado-msg");
        if (est.textContent !== msg) est.textContent = msg;
        est.dataset.tipo = e.error || e.dudas ? "atencion" : "bien";
        const cod = $("vivo-codigo").textContent;
        chip("nt-estado-codigo", e.transmitiendo && !!cod, "Código " + cod);
        chip("nt-estado-jugadas", true, e.jugadas === 1 ? "1 jugada" : e.jugadas + " jugadas");
        const ac = $("acierto").textContent.trim();
        chip("nt-estado-lectura", ac && ac !== "—", "Lectura " + ac);
    }
    refrescar();
    setInterval(refrescar, 1000);
})();
