/* «Terminé mi ronda completa» en la tablet del árbitro (centroamericano-arbitro.html): el cuadro que pide la confirmación.

   Terminar cierra los resultados de ESA ronda (la base los reabre sola cuando empieza la siguiente; ver «La tablet del árbitro: el clásico siempre
   confirma el resultado…» en docs/decisiones/juegos-y-torneos.md), así que no se confirma con un solo toque: el árbitro dice POR QUÉ termina y marca
   lo que comprobó. Mientras no elija un motivo y no marque TODAS sus casillas, el botón de confirmar queda apagado.

     - «Terminé todas mis partidas de la ronda»: revisó las planillas, todas sus partidas ya terminaron y no tiene nada pendiente;
     - «Me enviaron a almorzar o a descansar», «Me reasignaron a otras mesas o a otra tarea», «Otro motivo»: no deja partidas en juego ni nada pendiente.

   Cada motivo trae sus casillas (`MOTIVOS`). Lo de que «todas las partidas ya terminaron» lo dice el árbitro: la tablet además avisa, en rojo, si ve mesas
   sin resultado o la ronda sin finalizar (no lo impide: la última palabra es del árbitro). El motivo se muestra en la pantalla de «terminaste»; no se manda
   al servidor (la función `centroamericano-mesa` solo cierra el enlace).

   La parte que decide (`puedeConfirmar`) no usa nada de navegador, para que herramientas/verificar-centroamericano-terminar.js la pruebe con node.
   Escrito en JavaScript sencillo: la tablet puede ser vieja (js/modo-liviano.js). Todo texto entra por textContent. */
(function (raiz) {
    "use strict";

    const COMUN = "No tengo partidas en juego ni nada pendiente por anotar.";
    const MOTIVOS = [
        { id: "termine", texto: "Terminé todas mis partidas de la ronda", casillas: [
            "Ya revisé las planillas de todas mis mesas.",
            "Todas las partidas que tenía en juego ya terminaron y tienen su resultado.",
            "No tengo nada pendiente.",
        ] },
        { id: "almuerzo", texto: "Me enviaron a almorzar o a descansar", casillas: [COMUN] },
        { id: "reasignado", texto: "Me reasignaron a otras mesas o a otra tarea", casillas: [COMUN] },
        { id: "otro", texto: "Otro motivo", casillas: [COMUN] },
    ];

    const motivoPorId = (id) => { for (let i = 0; i < MOTIVOS.length; i++) if (MOTIVOS[i].id === id) return MOTIVOS[i]; return null; };

    // ¿Se puede confirmar? Hay un motivo y TODAS las casillas de ese motivo están marcadas (`marcadas`: una lista de true/false, en el orden de `casillas`).
    function puedeConfirmar(motivoId, marcadas) {
        const m = motivoPorId(motivoId);
        if (!m || !marcadas || marcadas.length !== m.casillas.length) return false;
        for (let i = 0; i < m.casillas.length; i++) if (marcadas[i] !== true) return false;
        return true;
    }

    function el(tag, atributos) {
        const n = document.createElement(tag);
        const a = atributos || {};
        for (const k of Object.keys(a)) {
            const v = a[k];
            if (v == null || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "texto") n.textContent = v;
            else n.setAttribute(k, v === true ? "" : v);
        }
        for (let i = 2; i < arguments.length; i++) if (arguments[i] != null) n.append(arguments[i].nodeType ? arguments[i] : document.createTextNode(String(arguments[i])));
        return n;
    }

    /* datos: { ronda, sinResultado (cuántas mesas sin resultado), sinFinalizar (la ronda no está finalizada) }
       → { motivo, texto } si confirmó, o null si cerró (Cancelar, Escape). */
    function preguntar(datos) {
        const d0 = datos || {};
        return new Promise((resolver) => {
            const antes = document.activeElement;
            const dlg = el("dialog", { id: "terminar-ronda", class: "cam-terminar", "aria-labelledby": "terminar-titulo", "aria-describedby": "terminar-ayuda" });
            const forma = el("div", { class: "cam-terminar-forma" });
            forma.append(el("h2", { id: "terminar-titulo", class: "cam-terminar-titulo" }, el("span", { "aria-hidden": "true", texto: "🏁 " }), "Terminé mi ronda completa"));
            forma.append(el("p", { class: "cam-terminar-texto", texto: "Vas a decir que concluiste todas tus labores" + (d0.ronda ? " de la ronda " + d0.ronda : "") + ". Se te cierran los resultados hasta que empiece la ronda siguiente (se habilitan solos)." }));
            const avisos = [];
            if (d0.sinResultado) avisos.push("Todavía hay " + d0.sinResultado + (d0.sinResultado === 1 ? " mesa" : " mesas") + " sin resultado" + (d0.ronda ? " en la ronda " + d0.ronda : "") + ".");
            if (d0.sinFinalizar) avisos.push("No has finalizado la ronda" + (d0.ronda ? " " + d0.ronda : "") + ".");
            if (avisos.length) forma.append(el("p", { class: "cam-terminar-aviso", role: "alert", texto: "⚠ " + avisos.join(" ") }));

            let motivo = null;
            let marcadas = [];
            const casillas = el("fieldset", { class: "cam-terminar-grupo", hidden: true });
            const ayuda = el("p", { id: "terminar-ayuda", class: "cam-terminar-ayuda", role: "status" });
            const confirmar = el("button", { type: "button", class: "cam-btn " + (avisos.length ? "cam-btn-rojo" : "cam-btn-fin"), "data-accion": "confirmar-terminar", disabled: true }, "Sí, concluir todas mis labores");
            const cancelar = el("button", { type: "button", class: "cam-btn cam-btn-claro", "data-accion": "cancelar-terminar" }, "Cancelar");

            function refrescar() {
                const puede = puedeConfirmar(motivo && motivo.id, marcadas);
                confirmar.disabled = !puede;
                ayuda.textContent = puede ? "Todo marcado: ya puedes confirmar." : (motivo ? "Marca todas las casillas para poder confirmar." : "Elige por qué terminas y marca lo que comprobaste.");
            }
            function mostrarCasillas() {
                marcadas = motivo.casillas.map(() => false);
                casillas.replaceChildren(el("legend", { class: "cam-terminar-legend", texto: "Confirma que:" }),
                    ...motivo.casillas.map((t, i) => {
                        const c = el("input", { type: "checkbox", class: "cam-terminar-casilla", "data-casilla": String(i) });
                        c.addEventListener("change", () => { marcadas[i] = c.checked; refrescar(); });
                        return el("label", { class: "cam-terminar-opcion" }, c, el("span", { texto: t }));
                    }));
                casillas.hidden = false;
            }

            const grupo = el("fieldset", { class: "cam-terminar-grupo" }, el("legend", { class: "cam-terminar-legend", texto: "¿Por qué terminas?" }));
            MOTIVOS.forEach((m) => {
                const r = el("input", { type: "radio", name: "motivo-terminar", value: m.id, class: "cam-terminar-radio" });
                r.addEventListener("change", () => { motivo = m; mostrarCasillas(); refrescar(); });
                grupo.append(el("label", { class: "cam-terminar-opcion" }, r, el("span", { texto: m.texto })));
            });
            forma.append(grupo, casillas, ayuda);
            forma.append(el("div", { class: "cam-terminar-botones" }, cancelar, confirmar));
            dlg.append(forma);

            let resultado = null;
            confirmar.addEventListener("click", () => { if (!puedeConfirmar(motivo && motivo.id, marcadas)) return; resultado = { motivo: motivo.id, texto: motivo.texto }; dlg.close("confirmar"); });
            cancelar.addEventListener("click", () => dlg.close("cancelar"));
            dlg.addEventListener("close", () => {
                dlg.remove();
                if (antes && typeof antes.focus === "function" && document.contains(antes)) antes.focus();
                resolver(resultado);
            });
            document.body.append(dlg);
            refrescar();
            try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); }
            const primero = dlg.querySelector(".cam-terminar-radio");
            if (primero) primero.focus();
        });
    }

    const api = { MOTIVOS, puedeConfirmar, preguntar };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    raiz.CentroamericanoTerminar = api;
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
