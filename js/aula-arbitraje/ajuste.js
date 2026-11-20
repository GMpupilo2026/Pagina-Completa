/* Aula de Arbitraje — los cálculos, sin pantalla.

   Lo usan aula-arbitraje.html (la práctica, los casos y la calculadora) y
   herramientas/verificar-aula-arbitraje.js en Node, que comprueba con esto
   las soluciones escritas a mano en js/aula-arbitraje/contenido.js.

   - calcularAjuste(): el método proporcional para dejar el reloj después de
     restablecer una posición (Leyes del Ajedrez 2023, art. 7.1), con la
     sanción del art. 7.5.5 y la variante de horario. Trabaja en minutos.
   - koya(): el KS del art. 9.2 del reglamento de desempates (C.07, 2026) para
     un todos contra todos sin rondas sin jugar, que es lo que se practica.
     Con incomparecencias o byes, el cálculo de verdad es el de
     js/pareo/desempates.js (ver «Aula de Arbitraje» en
     docs/decisiones/juegos-y-torneos.md).
   - leerTiempo()/tiempo(): «h:mm:ss» de ida y vuelta, en milisegundos. */
(function (raiz) {
    "use strict";

    function tiempo(ms, decimas) {
        const neg = ms < 0;
        ms = Math.abs(ms);
        const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
        if (decimas && ms < 20000) return (neg ? "-" : "") + r + "." + Math.floor((ms % 1000) / 100);
        return (neg ? "-" : "") + h + ":" + String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
    }
    function minutos(min) { return tiempo(Math.round(min * 60) * 1000); }
    function leerTiempo(txt) {
        const t = String(txt == null ? "" : txt).trim().replace(/[.,]/g, ":");
        if (!t) return null;
        const p = t.split(":").map((x) => parseInt(x, 10));
        if (p.some((x) => isNaN(x) || x < 0)) return null;
        let s;
        if (p.length === 3) s = p[0] * 3600 + p[1] * 60 + p[2];
        else if (p.length === 2) s = p[0] * 60 + p[1];
        else if (p.length === 1) s = p[0] * 60;
        else return null;
        return s * 1000;
    }

    /* Tras completar n jugadas, ¿cuánto tiempo de los periodos ya se sumó?
       p1 + p2 si se alcanzó el control de pj jugadas. */
    function base(o, n) { return o.p1 + (o.pj && o.p2 && n >= o.pj ? o.p2 : 0); }

    /* o = { p1, pj, p2 (min), inc (s), w, b (ms en el reloj ahora), nw, nb
       (jugadas completadas), lw, lb (las que quedan tras restablecer),
       sancion: { lado: "w"|"b", min } } */
    function calcularAjuste(o) {
        const inc = (o.inc || 0) / 60;
        const r = {};
        ["w", "b"].forEach((l) => {
            const n = l === "w" ? o.nw : o.nb, k = l === "w" ? o.lw : o.lb;
            const reloj = (l === "w" ? o.w : o.b) / 60000;
            const cons = base(o, n) + n * inc - reloj;
            const ideal = n ? cons * k / n : 0;
            r[l] = { n, k, reloj, cons, ideal, baseN: base(o, n), baseK: base(o, k), prop: base(o, k) + k * inc - ideal };
        });
        r.dif = (r.w.cons + r.b.cons - r.w.ideal - r.b.ideal) / 2;
        ["w", "b"].forEach((l) => {
            const s = o.sancion && o.sancion.lado === l ? o.sancion.min : 0;
            r[l].sancion = s;
            r[l].final = r[l].prop + s;
            r[l].horario = r[l].prop - r.dif + s;
        });
        return r;
    }

    /* Quién cometió la irregularidad y en qué jugada → cuántas jugadas quedan.
       Si fueron las negras, las blancas conservan una más. */
    function jugadasQueQuedan(quien, k) {
        return quien === "w" ? { lw: k - 1, lb: k - 1 } : { lw: k, lb: k - 1 };
    }

    /* m[i][j] = puntos de i contra j (1, 0.5, 0); diagonal nula. */
    function puntos(m) { return m.map((fila) => fila.reduce((s, v) => s + (v || 0), 0)); }
    function koya(m, i, limite) {
        const pts = puntos(m);
        const lim = limite == null ? (m.length - 1) / 2 : limite;
        let s = 0;
        for (let j = 0; j < m.length; j++) if (j !== i && pts[j] >= lim) s += m[i][j];
        return s;
    }

    function medio(x) {
        const e = Math.floor(x + 1e-9), mitad = Math.abs(x - e - 0.5) < 1e-9;
        return e === 0 && mitad ? "½" : e + (mitad ? "½" : "");
    }

    const api = { tiempo, minutos, leerTiempo, calcularAjuste, jugadasQueQuedan, puntos, koya, medio };
    raiz.AulaAjuste = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

/*! rev bfb5bbb0d2d82f9f */
