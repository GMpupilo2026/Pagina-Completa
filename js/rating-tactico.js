/* El rating táctico del alumno (Ejercicios por tema).

   Un número que sube al resolver limpio y baja al necesitar ayuda, como el
   «Coliseo de táctica» de Chessgora. La cuenta la hace la base
   (public.rating_tactico, desde training_progress): acá solo se pide y se
   dice. Ver «El rating táctico» en docs/decisiones/entrenamiento.md.

   - `frase(r)` es pura (se prueba en Node): lo que se lee en pantalla.
   - `refrescar()` lo vuelve a pedir y lo escribe en los elementos con
     [data-rating-tactico]. Se llama al cargar la página y después de cada
     ejercicio que quedó anotado.
   - No es el Elo: lo dice la pantalla, para que nadie lo confunda con el del
     diagnóstico ni con el de la federación. */
(function (raiz, fabrica) {
    "use strict";
    const api = fabrica();
    if (typeof module === "object" && module.exports) module.exports = api;
    else raiz.RatingTactico = api;
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const PROVISIONAL = 20;   // los primeros 20 ejercicios mueven mucho (K = 40)

    // El signo de verdad (−, no -) y sin «+0».
    function conSigno(n) {
        if (!n) return "";
        return (n > 0 ? "+" : "−") + Math.abs(n);
    }

    /* Lo que se dice, en dos partes: el número (corto, para la barra del
       ejercicio) y el detalle (para la portada de los temas). */
    function frase(r) {
        if (!r || !r.ejercicios) {
            return { corto: "", largo: "Tu rating táctico aparece cuando resuelvas tu primer ejercicio con dificultad." };
        }
        const hoy = conSigno(r.cambio_hoy);
        const corto = "Rating táctico: " + r.rating + (hoy ? " (" + hoy + " hoy)" : "");
        const partes = ["Tu rating táctico: " + r.rating];
        if (hoy) partes.push(hoy + " hoy");
        if (r.mejor > r.rating) partes.push("tu mejor: " + r.mejor);
        let largo = partes.join(" · ") + ".";
        if (r.ejercicios < PROVISIONAL) {
            const faltan = PROVISIONAL - r.ejercicios;
            largo += " Todavía se está acomodando: " + faltan + (faltan === 1 ? " ejercicio más" : " ejercicios más") + " y se asienta.";
        }
        largo += " Sube al resolver sin errores ni pistas y baja cuando cuesta. No es tu Elo.";
        return { corto, largo };
    }

    async function leer(sb, alumno) {
        try {
            const { data, error } = await sb.rpc("rating_tactico", alumno ? { p_alumno: alumno } : {});
            if (error) return null;
            return (Array.isArray(data) ? data[0] : data) || null;
        } catch (e) { return null; }
    }

    let pidiendo = null;
    async function refrescar(opciones) {
        const o = opciones || {};
        const sb = o.sb || (typeof window !== "undefined" ? window.sb : null);
        const doc = o.document || (typeof document !== "undefined" ? document : null);
        if (!sb || !doc) return null;
        const mio = pidiendo = leer(sb);
        const r = await mio;
        if (mio !== pidiendo) return r;   // llegó uno más nuevo
        const f = frase(r);
        doc.querySelectorAll("[data-rating-tactico]").forEach((el) => {
            const texto = el.dataset.ratingTactico === "corto" ? f.corto : f.largo;
            el.textContent = texto;
            el.hidden = !texto || !r;
        });
        return r;
    }

    /* En una página con [data-rating-tactico]: se pide al cargar y otra vez
       cada vez que EntrenoProgress anota un ejercicio de temas (el evento
       «entreno:anotado», que sale solo si la base lo aceptó). Así la página
       que lo muestra no tiene que acordarse de llamar a nada. */
    if (typeof document !== "undefined" && typeof window !== "undefined") {
        const arrancar = () => {
            if (!document.querySelector("[data-rating-tactico]")) return;
            refrescar();
            document.addEventListener("entreno:anotado", (ev) => {
                if (ev.detail && ev.detail.activity === "temas") refrescar();
            });
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar, { once: true });
        else arrancar();
    }

    return { frase, leer, refrescar, conSigno, PROVISIONAL };
});

/*! rev bfb5bbb0d2d82f9f */
