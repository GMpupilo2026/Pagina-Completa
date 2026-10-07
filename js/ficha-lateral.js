/* La ficha al costado de los paneles con pestañas (admin.html y
   supervisor.html): lo de UNA persona, en un panel encima de la lista.

   Es un diálogo: al abrir, el foco va al título; Tab no se escapa detrás;
   Escape o un clic afuera la cierran y el foco vuelve a donde estaba (o a lo
   que diga la página, si eso ya no existe porque la lista se repintó). Con un
   aviso de js/avisos.js encima (un <dialog> modal), las teclas son del aviso.

   La página pone en su HTML #ficha-velo y #ficha-persona con #ficha-titulo,
   #ficha-sub, #ficha-cerrar y #ficha-cuerpo, y la llena con:

     FichaLateral.abrir({ titulo, sub, pintar(cuerpo), clave, foco() })
       // `clave` dice de quién es: abrirla de nuevo con la misma clave la
       // rehace sin mover el foco (después de guardar algo).
       // `foco()` devuelve a dónde volver al cerrar si lo de antes ya no está.
     FichaLateral.cerrar()
     FichaLateral.abierta()   // la clave de la que está abierta, o null

   Ver «La ficha de cada persona» en docs/decisiones/paneles.md. */
(function () {
    "use strict";
    if (window.FichaLateral) return;

    const $ = (id) => document.getElementById(id);
    let actual = null;          // { clave, foco }
    let focoAntes = null;

    function abierta() { return actual ? actual.clave : null; }

    function abrir(op) {
        const yaEstaba = actual && op.clave != null && actual.clave === op.clave;
        if (!actual) focoAntes = document.activeElement;
        actual = { clave: op.clave != null ? op.clave : true, foco: op.foco };
        $("ficha-titulo").textContent = op.titulo || "";
        $("ficha-sub").textContent = op.sub || "";
        const cuerpo = $("ficha-cuerpo");
        cuerpo.replaceChildren();
        op.pintar(cuerpo);
        $("ficha-persona").hidden = false;
        $("ficha-velo").hidden = false;
        document.body.classList.add("overflow-hidden");
        if (!yaEstaba) $("ficha-titulo").focus();
    }

    function cerrar() {
        if (!actual) return;
        const foco = actual.foco;
        actual = null;
        $("ficha-persona").hidden = true;
        $("ficha-velo").hidden = true;
        $("ficha-cuerpo").replaceChildren();
        document.body.classList.remove("overflow-hidden");
        const otro = foco ? foco() : null;
        if (focoAntes && document.contains(focoAntes)) focoAntes.focus();
        else if (otro) otro.focus();
        focoAntes = null;
    }

    function montar() {
        if (!$("ficha-persona")) return;
        $("ficha-cerrar").addEventListener("click", cerrar);
        $("ficha-velo").addEventListener("click", cerrar);
        document.addEventListener("keydown", (e) => {
            if (!actual) return;
            if (document.querySelector("dialog[open]")) return;
            if (e.key === "Escape") { e.preventDefault(); cerrar(); return; }
            if (e.key !== "Tab") return;
            const ficha = $("ficha-persona");
            const enfocables = [...ficha.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']")]
                .filter((x) => x.checkVisibility ? x.checkVisibility() : x.offsetParent !== null);
            if (!enfocables.length) return;
            const primero = enfocables[0], ultimo = enfocables[enfocables.length - 1];
            if (!ficha.contains(document.activeElement)) { e.preventDefault(); primero.focus(); }
            else if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
    else montar();

    window.FichaLateral = { abrir, cerrar, abierta };
})();
