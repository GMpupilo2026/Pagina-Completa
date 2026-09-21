/* La videollamada de la clase: el enlace de Meet, Zoom o Teams del profesor.
 *
 * Lo usan dos páginas —`configuracion.html`, donde el profesor lo escribe, y
 * `clases.html`, donde el alumno lo abre— así que la regla de qué enlace vale
 * vive acá y no en cada una: escrita dos veces, se separarían a la primera
 * corrección y una pantalla aceptaría lo que la otra rechaza.
 *
 * ESE ENLACE ES TEXTO AJENO QUE SE VA A ABRIR, igual que el nombre de un
 * alumno es texto ajeno que se va a pintar. Un `javascript:` puesto en un href
 * se ejecuta con la sesión de quien lo toca, así que el esquema se comprueba
 * acá antes de armar el enlace — y otra vez en la base, en el CHECK de
 * `profesor_videollamada`. Las dos mitades son a propósito: la del navegador
 * explica, la de la base es la que de verdad no se puede saltar.
 *
 * Quién PUEDE ver el enlace no se decide acá: lo hace cumplir la RLS de esa
 * tabla, que solo se la entrega al alumno mientras su profesor tenga una clase
 * abierta. Este módulo solo sabe elegir, entre las clases que la base ya
 * devolvió, a cuál videollamada lleva el botón.
 */
(function () {
    const LIMITE = 500;

    // Los nombres que la gente reconoce. Un servicio que no esté en la lista no
    // es un error: el botón dice "videollamada" a secas y funciona igual.
    const SERVICIOS = [
        { nombre: "Meet",   dominios: ["meet.google.com"] },
        { nombre: "Zoom",   dominios: ["zoom.us", "zoom.com"] },
        { nombre: "Teams",  dominios: ["teams.microsoft.com", "teams.live.com"] },
        { nombre: "Jitsi",  dominios: ["meet.jit.si", "jitsi.org"] },
        { nombre: "Whereby", dominios: ["whereby.com"] },
        { nombre: "Discord", dominios: ["discord.gg", "discord.com"] },
    ];

    function normalizar(texto) {
        return String(texto == null ? "" : texto).trim();
    }

    // Solo https, y nada de espacios. Se pregunta con `new URL()` y no con una
    // expresión regular sobre el principio del texto: "https:/x" o un espacio
    // delante pasan un `startsWith` y no son enlaces.
    function esSeguro(enlace) {
        const t = normalizar(enlace);
        if (!t || t.length > LIMITE || /\s/.test(t)) return false;
        try {
            const u = new URL(t);
            return u.protocol === "https:" && !!u.hostname && u.hostname.includes(".");
        } catch (e) {
            return false;
        }
    }

    function host(enlace) {
        try { return new URL(normalizar(enlace)).hostname; } catch (e) { return ""; }
    }

    // "Meet", "Zoom"… o null. Se compara contra el HOST ya interpretado, nunca
    // buscando el nombre dentro del texto: "https://noesmeet.example.com/meet.google.com"
    // lleva esas letras y no es Meet.
    function servicio(enlace) {
        const h = host(enlace).toLowerCase();
        if (!h) return null;
        const s = SERVICIOS.find((x) => x.dominios.some((d) => h === d || h.endsWith("." + d)));
        return s ? s.nombre : null;
    }

    function etiqueta(enlace) {
        const s = servicio(enlace);
        return s ? "Entrar a " + s : "Entrar a la videollamada";
    }

    /* A cuál de sus clases lleva el botón, con las filas que devolvió
       `mis_clases()`.

       Manda la clase que el alumno está MIRANDO (la del selector): si su
       profesor está dando clase, es a esa a la que tiene que entrar, tenga
       enlace o no — mandarlo a la llamada de otro profesor porque esa sí traía
       enlace sería meterlo en la clase que no era, y se vería perfecto. Solo
       cuando el elegido no tiene clase abierta se ofrece la de otro, y se
       prefiere una que de verdad tenga a dónde entrar. */
    function claseConLlamada(clases, elegidaId) {
        const lista = Array.isArray(clases) ? clases : [];
        const abiertas = lista.filter((c) => c && c.clase_abierta);
        if (!abiertas.length) return null;
        return abiertas.find((c) => c.profesor_id === elegidaId)
            || abiertas.find((c) => esSeguro(c.videollamada))
            || abiertas[0];
    }

    window.Videollamada = { LIMITE, normalizar, esSeguro, host, servicio, etiqueta, claseConLlamada };
})();
