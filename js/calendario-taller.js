/* El calendario de clases del panel de taller.

   Un taller —como «Formación Ajedrez» de los asesores del MEP— no es una clase
   de todas las semanas: son unas pocas sesiones con fecha, hora y duración
   distintas. En el panel del alumno de una academia con «panel de taller»
   (academias.panel_taller), esta tarjeta va en el lugar de «Hoy te toca» y
   dice las sesiones que vienen, una por renglón, con la próxima marcada.

   Las sesiones son las del horario de su profe (horario_clases, una fila por
   sesión con `desde` = `hasta`), y las da mis_clases_proximas(): la misma
   regla de «Tu próxima clase» y del .ics, así que las tres cosas dicen lo
   mismo. Las que ya terminaron no se piden.

   Va aparte de js/clases.js para que se pueda probar sin la base: pintar()
   recibe las filas tal cual las devuelve mis_clases_proximas().
   Ver «El panel de taller» en docs/decisiones/paneles.md. */
window.CalendarioTaller = (function () {
    "use strict";

    // Las doce del mediodía se dicen «12 m. d.», como en el calendario del taller.
    function hora(x) {
        const t = HoraCR.hora(x);
        return /^12:00\s*p/.test(t) ? "12:00 m. d." : t;
    }

    // «Lunes 12 de octubre», con mayúscula al empezar el renglón y sin la coma
    // que pone el navegador después del día («lunes, 12 de octubre»).
    function dia(x) {
        const t = HoraCR.fecha(x, { weekday: "long", day: "numeric", month: "long" }).replace(/^(\S+),\s*/, "$1 ");
        return t.charAt(0).toUpperCase() + t.slice(1);
    }

    // Termina una frase con punto, sin doblarlo después de «a. m.».
    function conPunto(t) {
        return /\.$/.test(t) ? t : t + ".";
    }

    /* En qué está cada sesión: la que pasa ahora, la de hoy, la próxima o una
       más. El estado va ESCRITO en la etiqueta, no solo en el color. */
    function estadoDe(s, ahora, esPrimera) {
        const inicio = new Date(s.inicio), fin = new Date(s.fin);
        if (inicio <= ahora && ahora < fin) return { texto: "Ahora", clase: "bg-emerald-700 text-white" };
        if (HoraCR.dia(inicio) === HoraCR.dia(ahora)) return { texto: "Hoy", clase: "bg-accent-500 text-brand-900" };
        if (esPrimera) return { texto: "Próxima", clase: "bg-accent-500 text-brand-900" };
        return null;
    }

    function renglon(s, ahora, esPrimera) {
        const li = document.createElement("li");
        const estado = estadoDe(s, ahora, esPrimera);
        li.className = "flex items-start gap-3 rounded-xl px-3 py-3 "
            + (estado ? "bg-accent-50 dark:bg-brand-800 ring-1 ring-accent-300 dark:ring-accent-700" : "bg-brand-50 dark:bg-brand-950");

        const icono = document.createElement("span");
        icono.className = "text-2xl leading-none mt-0.5";
        icono.setAttribute("aria-hidden", "true");
        icono.textContent = s.modalidad === "presencial" ? "🏫" : "💻";

        const cuerpo = document.createElement("div");
        cuerpo.className = "flex-1 min-w-0";
        const arriba = document.createElement("p");
        arriba.className = "flex items-center gap-2 flex-wrap";
        const titulo = document.createElement("span");
        titulo.className = "font-semibold text-brand-800 dark:text-white";
        titulo.textContent = s.titulo || "Clase";   // lo escribió el profe: textContent
        arriba.appendChild(titulo);
        if (estado) {
            const etiqueta = document.createElement("span");
            etiqueta.className = "text-xs font-bold rounded-full px-2 py-0.5 " + estado.clase;
            etiqueta.textContent = estado.texto;
            arriba.appendChild(etiqueta);
        }
        const cuando = document.createElement("p");
        cuando.className = "text-sm text-brand-700 dark:text-brand-200";
        // La hora va junta: en el celular baja entera al renglón de abajo, no partida en «a. m. a / 12:00».
        const horas = document.createElement("span");
        horas.className = "whitespace-nowrap";
        horas.textContent = hora(s.inicio) + " a " + hora(s.fin);
        cuando.append(dia(s.inicio) + " · ", horas);
        const donde = document.createElement("p");
        donde.className = "text-xs text-brand-500 dark:text-brand-300";
        donde.textContent = s.modalidad === "presencial" ? "Presencial" : "En línea";
        cuerpo.append(arriba, cuando, donde);

        li.append(icono, cuerpo);
        return li;
    }

    /* Pinta la tarjeta en `caja`. `sesiones` son las filas de
       mis_clases_proximas() (ya ordenadas y sin las que terminaron);
       `alBajar` es lo que hace «Agregar a mi calendario». */
    function pintar(caja, sesiones, { ahora = new Date(), alBajar = null } = {}) {
        caja.replaceChildren();
        const lista = (sesiones || []).filter((s) => s && s.inicio && s.fin && new Date(s.fin) > ahora);

        const titulo = document.createElement("h2");
        titulo.id = "calendario-taller-titulo";
        titulo.className = "font-serif text-lg font-bold text-brand-800 dark:text-white";
        const emoji = document.createElement("span");
        emoji.setAttribute("aria-hidden", "true");
        emoji.textContent = "📅 ";
        titulo.append(emoji, "Calendario de clases");
        const sub = document.createElement("p");
        sub.className = "text-sm text-brand-500 dark:text-brand-300 mt-1 mb-4";
        sub.textContent = lista.length
            ? (lista.length === 1 ? "Te queda una sesión." : "Te quedan " + lista.length + " sesiones.") + " Horas de Costa Rica."
            : "No te quedan sesiones en el calendario.";
        caja.append(titulo, sub);

        if (lista.length) {
            const ol = document.createElement("ol");
            ol.className = "space-y-2";
            ol.setAttribute("aria-label", "Sesiones que vienen");
            lista.forEach((s, i) => ol.appendChild(renglon(s, ahora, i === 0)));
            caja.appendChild(ol);
        }

        if (lista.length && alBajar) {
            const boton = document.createElement("button");
            boton.type = "button";
            boton.id = "calendario-taller-bajar";
            boton.className = "mt-4 rounded-xl px-4 py-2 text-sm font-semibold bg-accent-500 text-brand-900 hover:bg-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2";
            boton.textContent = "Agregar a mi calendario";
            const estado = document.createElement("p");
            estado.id = "calendario-taller-estado";
            estado.setAttribute("role", "status");
            estado.className = "mt-2 text-xs text-brand-500 dark:text-brand-300";
            boton.addEventListener("click", () => alBajar(boton, estado));
            caja.append(boton, estado);
        }
        caja.hidden = false;
        return lista.length;
    }

    return { pintar, hora, dia, conPunto };
})();
