/* «Agregar a mi calendario»: las clases, las tareas y los exámenes del alumno
 * en un archivo .ics, el formato que abren el calendario del celular, Google
 * Calendar y Outlook.
 *
 * Ver «Agregar a mi calendario» en docs/decisiones/paneles.md.
 *
 * - Las horas van con la zona de Costa Rica (TZID=America/Costa_Rica y su
 *   VTIMEZONE, siempre UTC−6, sin horario de verano): la clase de las 4 p. m.
 *   es la de las 4 p. m. de Costa Rica, en cualquier aparato.
 * - Cada evento lleva un UID que no cambia (la clase de ESE horario en ESE
 *   día, la tarea por su id): bajar el archivo otra vez actualiza los eventos
 *   en vez de duplicarlos en los calendarios que respetan el UID.
 * - Lo que escribe una persona (el título de una tarea, el nombre del profe)
 *   se escapa como pide el formato (\\ ; , y saltos de línea): un «;» suelto
 *   cortaría el campo.
 *
 *   CalendarioIcs.armar({ clases, tareas, examenes, ahora }) → el texto
 *   CalendarioIcs.armarDias({ nombre, eventos })              → días enteros (un torneo)
 *   CalendarioIcs.armarHoras({ nombre, eventos })             → eventos con hora (las rondas)
 *   CalendarioIcs.bajar(texto, nombre)                       → lo descarga
 */
(function () {
    "use strict";

    const ZONA = "America/Costa_Rica";
    const SITIO = "https://ajedrez-integral.com";
    const DOMINIO = "ajedrez-integral.com";

    // «20261006T160000»: el momento, escrito en hora de Costa Rica.
    const PARTES = new Intl.DateTimeFormat("en-US", {
        timeZone: ZONA, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    function horaLocal(x) {
        const d = x instanceof Date ? x : new Date(x);
        if (isNaN(d)) return "";
        const p = {};
        for (const { type, value } of PARTES.formatToParts(d)) p[type] = value;
        return p.year + p.month + p.day + "T" + p.hour + p.minute + p.second;
    }
    // DTSTAMP va en UTC, como pide el formato.
    function sello(d) {
        return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    }

    function escapar(t) {
        return String(t == null ? "" : t)
            .replace(/\\/g, "\\\\")
            .replace(/;/g, "\\;")
            .replace(/,/g, "\\,")
            .replace(/\r?\n/g, "\\n");
    }

    /* Una línea no pasa de 75 bytes: lo que sigue va en la siguiente,
       empezando con un espacio. Se corta por caracteres enteros para no
       partir una tilde por la mitad. */
    function doblar(linea) {
        const bytes = (s) => new TextEncoder().encode(s).length;
        if (bytes(linea) <= 75) return linea;
        const trozos = [];
        let actual = "", limite = 75;
        for (const ch of linea) {
            if (bytes(actual + ch) > limite) {
                trozos.push(actual);
                actual = "";
                limite = 74;   // la que sigue lleva el espacio delante
            }
            actual += ch;
        }
        trozos.push(actual);
        return trozos.join("\r\n ");
    }

    function evento(l, { uid, inicio, fin, resumen, lugar, descripcion, url, aviso }, stamp) {
        l.push("BEGIN:VEVENT");
        l.push("UID:" + uid);
        l.push("DTSTAMP:" + stamp);
        l.push("DTSTART;TZID=" + ZONA + ":" + horaLocal(inicio));
        l.push("DTEND;TZID=" + ZONA + ":" + horaLocal(fin));
        l.push("SUMMARY:" + escapar(resumen));
        if (lugar) l.push("LOCATION:" + escapar(lugar));
        if (descripcion) l.push("DESCRIPTION:" + escapar(descripcion));
        if (url) l.push("URL:" + url);
        if (aviso) {
            l.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + escapar(resumen), "TRIGGER:" + aviso, "END:VALARM");
        }
        l.push("END:VEVENT");
    }

    const QUINCE_MIN = 15 * 60 * 1000;

    function cabecera(nombre) {
        return [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Ajedrez Integral//Mi calendario//ES",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:" + escapar(nombre || "Ajedrez Integral"),
            "X-WR-TIMEZONE:" + ZONA,
            "BEGIN:VTIMEZONE",
            "TZID:" + ZONA,
            "BEGIN:STANDARD",
            "DTSTART:19700101T000000",
            "TZOFFSETFROM:-0600",
            "TZOFFSETTO:-0600",
            "TZNAME:CST",
            "END:STANDARD",
            "END:VTIMEZONE",
        ];
    }

    function armar({ clases, tareas, examenes, ahora } = {}) {
        ahora = ahora || new Date();
        const stamp = sello(ahora);
        const l = cabecera();
        let n = 0;
        for (const c of clases || []) {
            if (!c || !c.inicio || !c.fin) continue;
            const enLinea = c.modalidad === "en_linea";
            evento(l, {
                uid: "clase-" + c.horario_id + "-" + horaLocal(c.inicio).slice(0, 8) + "@" + DOMINIO,
                inicio: c.inicio, fin: c.fin,
                resumen: c.titulo ? "Clase de ajedrez: " + c.titulo : "Clase de ajedrez",
                lugar: enLinea ? "En línea" : "Presencial",
                descripcion: (c.profesor ? "Con " + c.profesor + ". " : "")
                    + (enLinea ? "Entra a la clase desde tu panel: " : "Tu panel: ") + SITIO + "/clases.html",
                url: SITIO + "/clases.html",
                aviso: "-PT30M",
            }, stamp);
            n++;
        }
        for (const t of tareas || []) {
            if (!t || !t.vence_at || new Date(t.vence_at) <= ahora) continue;
            const fin = new Date(t.vence_at);
            evento(l, {
                uid: "tarea-" + t.id + "@" + DOMINIO,
                inicio: new Date(fin.getTime() - QUINCE_MIN), fin,
                resumen: "Vence la tarea «" + t.titulo + "»",
                descripcion: "Tu tarea de ajedrez: " + SITIO + "/tareas.html",
                url: SITIO + "/tareas.html",
                aviso: "-P1D",
            }, stamp);
            n++;
        }
        for (const e of examenes || []) {
            if (!e || !e.vence_at || e.estado === "entregado" || e.estado === "congelado") continue;
            if (new Date(e.vence_at) <= ahora) continue;
            const fin = new Date(e.vence_at);
            const url = SITIO + "/examen.html?id=" + encodeURIComponent(e.id);
            evento(l, {
                uid: "examen-" + e.id + "@" + DOMINIO,
                inicio: new Date(fin.getTime() - QUINCE_MIN), fin,
                resumen: "Vence el examen «" + e.titulo + "»",
                descripcion: "Tu examen de ajedrez: " + url,
                url,
                aviso: "-P1D",
            }, stamp);
            n++;
        }
        l.push("END:VCALENDAR");
        return { texto: l.map(doblar).join("\r\n") + "\r\n", eventos: n };
    }

    /* Eventos de días enteros, de un día de calendario («2026-10-22») a otro,
       los dos incluidos: un torneo de tres días ocupa los tres en el
       calendario, sin hora (la hora va en la descripción). El formato pide el
       día SIGUIENTE al último como fin. Los días se suman en el calendario,
       sin pasar por la zona de la computadora.

         armarDias({ nombre, eventos: [{ uid, desde, hasta, resumen, lugar,
                     descripcion, url, aviso }], ahora }) → { texto, eventos } */
    const DIA = /^\d{4}-\d{2}-\d{2}$/;
    function diaSiguiente(dia) {
        const [y, m, d] = dia.split("-").map(Number);
        const x = new Date(Date.UTC(y, m - 1, d + 1));
        const dos = (n) => String(n).padStart(2, "0");
        return x.getUTCFullYear() + "-" + dos(x.getUTCMonth() + 1) + "-" + dos(x.getUTCDate());
    }
    function armarDias({ nombre, eventos, ahora } = {}) {
        const stamp = sello(ahora || new Date());
        const l = cabecera(nombre);
        let n = 0;
        for (const e of eventos || []) {
            if (!e || !DIA.test(e.desde || "")) continue;
            const hasta = DIA.test(e.hasta || "") && e.hasta >= e.desde ? e.hasta : e.desde;
            l.push("BEGIN:VEVENT", "UID:" + e.uid, "DTSTAMP:" + stamp,
                "DTSTART;VALUE=DATE:" + e.desde.replace(/-/g, ""),
                "DTEND;VALUE=DATE:" + diaSiguiente(hasta).replace(/-/g, ""),
                "SUMMARY:" + escapar(e.resumen));
            if (e.lugar) l.push("LOCATION:" + escapar(e.lugar));
            if (e.descripcion) l.push("DESCRIPTION:" + escapar(e.descripcion));
            if (e.url) l.push("URL:" + e.url);
            if (e.aviso) l.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + escapar(e.resumen), "TRIGGER:" + e.aviso, "END:VALARM");
            l.push("END:VEVENT");
            n++;
        }
        l.push("END:VCALENDAR");
        return { texto: l.map(doblar).join("\r\n") + "\r\n", eventos: n };
    }

    /* Eventos con hora, cualquiera: las rondas de un jugador en un torneo
       (centroamericano-2026.html). Cada uno con su UID fijo, así bajar el
       archivo otra vez los pone al día en vez de duplicarlos.

         armarHoras({ nombre, eventos: [{ uid, inicio, fin, resumen, lugar,
                      descripcion, url, aviso }], ahora }) → { texto, eventos } */
    function armarHoras({ nombre, eventos, ahora } = {}) {
        const stamp = sello(ahora || new Date());
        const l = cabecera(nombre);
        let n = 0;
        for (const e of eventos || []) {
            if (!e || !e.uid || !e.inicio || !e.fin || isNaN(new Date(e.inicio)) || isNaN(new Date(e.fin))) continue;
            evento(l, e, stamp);
            n++;
        }
        l.push("END:VCALENDAR");
        return { texto: l.map(doblar).join("\r\n") + "\r\n", eventos: n };
    }

    function bajar(texto, nombre) {
        const url = URL.createObjectURL(new Blob([texto], { type: "text/calendar;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre || "ajedrez-integral.ics";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const api = { armar, armarDias, armarHoras, bajar, horaLocal, escapar, doblar };
    if (typeof window !== "undefined") window.CalendarioIcs = api;
    if (typeof module !== "undefined") module.exports = api;
})();
