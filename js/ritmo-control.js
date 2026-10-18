/* El ritmo de un torneo leído del texto de su control de tiempo.
 *
 * chess-results trae el control como lo escribió quien armó el torneo
 * («30 min + 30 seg», «90min+30sec/mov», «3+2», «2 horas para toda la
 * partida», «cuatro minutos por jugador»…) y, aparte, a veces dice el ritmo
 * («Standard», «Rapid», «Blitz»). Cuando no lo dice, esto lo deduce con la
 * cuenta de FIDE: los minutos de cada jugador más 60 veces el incremento
 * (una partida de 60 jugadas). 60 minutos o más es clásico, más de 10 y menos
 * de 60 es rápido, 10 o menos es blitz. Así «30 + 30» (30 + 30 = 60) es
 * clásico y «15 + 10» (15 + 10 = 25) es rápido.
 *
 * Si el control no trae un tiempo que se pueda leer, mira el nombre del
 * torneo («Blitz», «Relámpago», «Rápido»/«Rapid»). Si tampoco, no sabe:
 * devuelve null y quien lo usa decide.
 *
 * Ver «Los torneos con Elo nacional» en docs/decisiones/juegos-y-torneos.md.
 *
 *   RitmoControl.minutos(texto)          → minutos para 60 jugadas | null
 *   RitmoControl.deducir(control, nombre) → "clasico" | "rapido" | "blitz" | null
 */
(function () {
    "use strict";

    const PALABRAS = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, diez: 10,
        quince: 15, veinte: 20, treinta: 30, cuarenta: 40, sesenta: 60, noventa: 90 };

    const limpio = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/\b(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|diez|quince|veinte|treinta|cuarenta|sesenta|noventa)\b/g, (p) => String(PALABRAS[p]))
        // «desde la jugada 1», «movimiento 1», «U18, U16»: números que no son tiempo
        .replace(/\b(jugada|movimiento|move|ronda)s?\s*\d+/g, " ")
        .replace(/\bu\s?\d+/g, " ");

    // Los minutos de cada jugador más el incremento contado para 60 jugadas.
    // Si el texto trae dos controles («U18: 60 min + 30 seg; U10: 30 min + 30
    // seg», «90 min… / 30 min…»), vale el primero.
    function minutos(texto) {
        // Lo que va entre paréntesis es una aclaración («(reloj mecánico 1h + 10 min)»).
        const t = limpio(texto).replace(/\([^)]*\)/g, " ").split(/[;/]/)[0];
        let base = null, inc = 0, m;
        // «90+30 min», «10 mas 2»: el primer número sin unidad es la base.
        if ((m = t.match(/^\D*?(\d+)\s*(?:\+|mas)\s*(\d+)/))) return parseInt(m[1], 10) + parseInt(m[2], 10) || null;
        if ((m = t.match(/\b(\d):([0-5]\d)\b/))) base = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);   // «1:30»
        else {
            if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:h\b|hr|hora)/))) base = parseFloat(m[1].replace(",", ".")) * 60;
            if ((m = t.match(/(\d+)\s*(?:'|m\b|min|mim|minuto|minute)/))) base = (base || 0) + parseInt(m[1], 10);
        }
        // El incremento: «30 seg», «30 s», «30''», «2 segundos», o «2 minutos
        // desde la jugada» (escrito con minutos por error: se lee como segundos,
        // que es lo único que tiene sentido en un incremento).
        const despues = base == null ? t : t.slice((m ? m.index + m[0].length : 0));
        if ((m = despues.match(/(\d+)\s*(?:''|"|s\b|seg|sec|segu|egundo)/))) inc = parseInt(m[1], 10);
        else if ((m = despues.match(/(?:\+|mas|con|and|y)\s*(?:un\s+)?(?:incremento\s+de\s+)?(\d+)\s*(?:min|minuto)/))) inc = parseInt(m[1], 10);
        else if ((m = despues.match(/(?:\+|mas)\s*(\d+)(?!\s*min)/))) inc = parseInt(m[1], 10);
        if (base == null) {
            // Un número solo: «10 FINISH», «40 finish», «30».
            if ((m = t.match(/^\s*(\d+)\s*(?:finish|$|\.|por jugador)/))) base = parseInt(m[1], 10);
        }
        return base == null || base <= 0 ? null : base + inc;
    }

    function deducir(control, nombre) {
        const total = minutos(control);
        if (total != null) return total >= 60 ? "clasico" : total > 10 ? "rapido" : "blitz";
        const n = limpio(nombre);
        if (/\b(blitz|relampago|bala|bullet)\b/.test(n)) return "blitz";
        if (/\b(rapid|rapido|rapidas|activo)\b/.test(n)) return "rapido";
        return null;
    }

    const api = { minutos, deducir };
    if (typeof window !== "undefined") window.RitmoControl = api;
    if (typeof module !== "undefined") module.exports = api;
})();
