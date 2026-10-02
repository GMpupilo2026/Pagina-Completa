/* Las fechas y las horas del sitio, en hora de Costa Rica.

   Ver «Las fechas y las horas, siempre en hora de Costa Rica» en
   docs/decisiones/sitio-e-infraestructura.md. Lo cuida
   herramientas/verificar-hora-cr.js.

   Dos cosas que se rompen calladas y que esto resuelve en un solo lugar:
   - Un momento (una hora de la base, «2026-09-30T21:15:00Z») se muestra en la
     zona de quien mira si no se dice otra: en la computadora de alguien que
     viaja sale corrido. Acá siempre va con la zona de Costa Rica.
   - Un día de calendario («2026-09-30», una columna `date`) no tiene hora, y
     `new Date("2026-09-30")` lo lee como la medianoche UTC: en Costa Rica eso
     es el 29 a las 6 de la tarde, y la fecha salía UN DÍA ANTES (una fecha de
     nacimiento, un «vence el…»). Acá un día de calendario se lee como el
     mediodía de ese día en Costa Rica, que es el mismo día en cualquier zona.

   Costa Rica no tiene horario de verano: siempre es UTC−6. */
window.HoraCR = (function () {
    const ZONA = "America/Costa_Rica";
    const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

    // El momento que representa `x`: una fecha, un número, una hora con zona o un día de calendario.
    function momento(x) {
        if (x instanceof Date) return x;
        if (typeof x === "string" && SOLO_DIA.test(x)) return new Date(x + "T12:00:00-06:00");
        return new Date(x);
    }

    // «30 de septiembre de 2026»: las opciones de toLocaleDateString, con la zona puesta.
    function fecha(x, opciones) {
        const d = momento(x);
        return isNaN(d) ? "" : d.toLocaleDateString("es-CR", Object.assign({}, opciones || { day: "numeric", month: "long", year: "numeric" }, { timeZone: ZONA }));
    }
    // «3:15 p. m.»
    function hora(x, opciones) {
        const d = momento(x);
        return isNaN(d) ? "" : d.toLocaleTimeString("es-CR", Object.assign({}, opciones || { hour: "numeric", minute: "2-digit" }, { timeZone: ZONA }));
    }
    // «30 sept 2026, 3:15 p. m.»
    function fechaHora(x, opciones) {
        const d = momento(x);
        return isNaN(d) ? "" : d.toLocaleString("es-CR", Object.assign({}, opciones, { timeZone: ZONA }));
    }

    // El día en Costa Rica, «2026-09-30» (por omisión, el de hoy).
    function dia(x) {
        const d = x == null ? new Date() : momento(x);
        return isNaN(d) ? "" : d.toLocaleDateString("en-CA", { timeZone: ZONA });
    }
    const hoy = () => dia();
    // El mes en Costa Rica, «2026-09».
    const mes = (x) => dia(x).slice(0, 7);

    // Días de calendario: «2026-09-30» + n. Pura cuenta de calendario (en UTC, sin horas que corran).
    function sumarDias(diaISO, n) {
        const [y, m, d] = String(diaISO).split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);   // calendario en UTC
    }

    /* Lo que escribe el profe en un campo de fecha y hora («2026-09-30T15:20», un
       <input type="datetime-local">) es hora de Costa Rica, sea cual sea la zona
       de su computadora: new Date(valor) lo leía en la de la computadora, y una
       mal configurada (o de viaje) corría el vencimiento sin dar ningún error. */
    function desdeCampo(valor) {
        const v = String(valor || "");
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return new Date(NaN);
        return new Date(v.slice(0, 16) + ":00-06:00");
    }
    // Y al revés: un momento, escrito como lo espera ese campo, en hora de Costa Rica.
    function paraCampo(x) {
        const d = x == null ? new Date() : momento(x);
        return isNaN(d) ? "" : d.toLocaleString("sv-SE", { timeZone: ZONA }).slice(0, 16).replace(" ", "T");
    }

    return { ZONA, momento, fecha, hora, fechaHora, dia, hoy, mes, sumarDias, desdeCampo, paraCampo };
})();
