/* El código de sesion.html.

   Las herramientas en grande: «🔎 Herramientas en grande» vuelve la columna de
   herramientas del profe (la barra, el motor y las pestañas) una ventana por
   encima del tablero, con todo más grande. En la columna de 320 px, con letra
   de 11-12 px, a veces cuesta encontrar lo que se busca. Ver «Las
   herramientas en grande» en docs/decisiones/clase-en-vivo.md.

   No se mueve ningún nodo: la columna es la misma, con otra clase, así que
   cada botón sigue con sus eventos y lo que se cambia adentro sigue cambiado
   al volver. Como las demás partes de la clase (ver «sesion.js en partes»),
   un script clásico cargado ANTES que sesion.js; no usa nada de sesion.js. */

window.HerramientasGrandes = (function () {
    const aside = document.getElementById("herramientas-profe");
    const abrirBtn = document.getElementById("grandes-abrir-btn");
    const cerrarBtn = document.getElementById("grandes-cerrar-btn");
    const columnaTablero = document.querySelector(".proyector-columna");
    if (!aside || !abrirBtn || !cerrarBtn) return { abierta: () => false };

    /* Lo que se abre en la columna del tablero mientras la ventana está
       abierta (el panel de un curso, el PDF, mirar la práctica de un alumno…)
       quedaría debajo de ella: se cierra sola para que se vea. */
    const QUE_SE_ABRE = ".fixed, [role='dialog'], [role='alertdialog'], #class-lesson-panel";

    let abierta = false;
    let inertes = [];
    let yaVisibles = new Set();
    let observador = null;
    let pendiente = false;

    const visible = (el) => (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null);

    /* Todo lo que no es la ventana queda inerte (ni Tab ni clic ni lector de
       pantalla llegan ahí): de la columna para arriba, cada hermano del camino.
       Lo que ya estaba inerte se deja como estaba. */
    function inertarElResto() {
        inertes = [];
        for (let el = aside; el && el !== document.body; el = el.parentElement) {
            for (const h of el.parentElement.children) {
                if (h === el || h.inert || h.tagName === "SCRIPT") continue;
                h.inert = true;
                inertes.push(h);
            }
        }
    }

    function revisarLoQueSeAbrio() {
        pendiente = false;
        if (!abierta || !columnaTablero) return;
        for (const el of columnaTablero.querySelectorAll(QUE_SE_ABRE)) {
            if (!yaVisibles.has(el) && visible(el)) { cerrar({ foco: false }); return; }
        }
    }

    function abrir() {
        if (abierta) return;
        abierta = true;
        aside.classList.add("herramientas-en-grande");
        aside.setAttribute("role", "dialog");
        aside.setAttribute("aria-modal", "true");
        aside.setAttribute("aria-labelledby", "grandes-titulo");
        document.documentElement.classList.add("con-herramientas-en-grande");
        abrirBtn.setAttribute("aria-expanded", "true");
        inertarElResto();
        if (columnaTablero) {
            yaVisibles = new Set([...columnaTablero.querySelectorAll(QUE_SE_ABRE)].filter(visible));
            observador = new MutationObserver(() => {
                if (pendiente) return;
                pendiente = true;
                requestAnimationFrame(revisarLoQueSeAbrio);
            });
            observador.observe(columnaTablero, { subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style"] });
        }
        aside.scrollTop = 0;
        document.getElementById("grandes-titulo").focus();
    }

    function cerrar(opciones) {
        if (!abierta) return;
        abierta = false;
        if (observador) { observador.disconnect(); observador = null; }
        inertes.forEach((h) => { h.inert = false; });
        inertes = [];
        aside.classList.remove("herramientas-en-grande");
        aside.removeAttribute("role");
        aside.removeAttribute("aria-modal");
        aside.removeAttribute("aria-labelledby");
        document.documentElement.classList.remove("con-herramientas-en-grande");
        abrirBtn.setAttribute("aria-expanded", "false");
        if (!opciones || opciones.foco !== false) abrirBtn.focus();
    }

    abrirBtn.addEventListener("click", abrir);
    cerrarBtn.addEventListener("click", () => cerrar());
    document.addEventListener("keydown", (e) => {
        // Un aviso (<dialog>) abierto encima se cierra primero, con su propio Esc.
        if (e.key !== "Escape" || !abierta || e.defaultPrevented || document.querySelector("dialog[open]")) return;
        e.preventDefault();
        cerrar();
    });
    /* Los botones de «Tu material» hacen su efecto FUERA de la ventana: abren
       su panel al lado del tablero. Después del clic se vuelve al tablero, para
       ver lo que pasó. El clic llega acá después del del botón. («El tablero»
       ya no vive en esta columna: va debajo del tablero.) */
    const barra = document.getElementById("teacher-toolbar");
    if (barra) barra.addEventListener("click", (e) => {
        if (abierta && e.target.closest("button")) cerrar({ foco: false });
    });

    return { abierta: () => abierta, abrir, cerrar };
})();
