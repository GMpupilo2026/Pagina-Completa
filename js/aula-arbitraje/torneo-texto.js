/* Aula de Arbitraje — un torneo escrito en texto, para los desempates.

   Los casos de desempate, los ejercicios que se generan al azar y la
   calculadora escriben el torneo como una tabla de chess-results, una línea
   por jugador (el número de emparejamiento es el orden de las líneas):

     Herrera | 2150 | 4n1 2b½ 3n0 BYE
     Kovács  | 2080 | 3b½ 1n½ H   4n1

   Cada ronda, una de estas:
     4n1   contra el n.º 4, con negras, ganó (1, ½ o =, 0)
     4b+   contra el n.º 4, con blancas, ganó por incomparecencia (+) o
           perdió por incomparecencia (-)
     BYE   bye del emparejamiento (punto entero, art. 16.2.1)
     F     bye de punto entero pedido
     H     bye de medio punto pedido
     Z     bye de cero puntos o ausencia (también «-»)
   Opcionalmente, después del Elo, el título y la federación:
     Herrera | 2150 | FM | CRC | 4n1 2b½ …

   leer(texto, opciones) → { t, nombres, errores }. `t` es el torneo que
   entiende js/pareo/desempates.js (el motor de Pareo Integral, con los
   desempates del C.07:2026 comprobados contra los ejercicios de FIDE): así el
   Aula calcula con el MISMO código, no con una segunda copia. `errores` dice,
   en español, qué línea no cuadra (un rival que no dice lo mismo, un número
   que no existe…); con errores no hay torneo.

   escribir(t, nombres) hace lo contrario (lo usan los ejercicios al azar).
   Ver «Aula de Arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function (raiz) {
    "use strict";
    const T = typeof module !== "undefined" && module.exports ? require("../pareo/torneo.js") : raiz.PareoTorneo;

    const PARTIDA = /^(\d+)([bn])(1|½|=|0|\+|-)$/i;
    const idDe = (n) => "j" + n;

    function leer(texto, opciones) {
        const op = opciones || {};
        const errores = [];
        const lineas = String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
        const filas = lineas.map((l, i) => {
            const partes = l.split("|").map((x) => x.trim());
            if (partes.length < 3) { errores.push("Línea " + (i + 1) + ": separa nombre, Elo y rondas con «|»."); return null; }
            const nombre = partes[0] || "Jugador " + (i + 1);
            const elo = Number(partes[1]) || 0;
            const titulo = partes.length >= 5 ? partes[2].toUpperCase() : "";
            const fed = partes.length >= 5 ? partes[3].toUpperCase() : "";
            const rondas = partes[partes.length - 1].split(/\s+/).filter(Boolean);
            return { n: i + 1, nombre, elo, titulo, fed, rondas };
        });
        if (errores.length) return { t: null, nombres: {}, errores };
        const n = filas.length;
        if (n < 2) return { t: null, nombres: {}, errores: ["Hacen falta por lo menos dos jugadores."] };
        const R = Math.max(...filas.map((f) => f.rondas.length));
        filas.forEach((f) => { if (f.rondas.length !== R) errores.push(f.nombre + ": tiene " + f.rondas.length + " rondas y otros " + R + "."); });
        if (errores.length) return { t: null, nombres: {}, errores };

        const rondas = [];
        for (let r = 0; r < R; r++) {
            const mesas = [], ausencias = {}, hecho = new Set();
            for (const f of filas) {
                if (hecho.has(f.n)) continue;
                const tok = f.rondas[r].replace("½", "½");
                const sup = tok.toUpperCase();
                if (sup === "BYE") { mesas.push({ b: idDe(f.n), n: null, r: null }); hecho.add(f.n); continue; }
                if (sup === "F" || sup === "H" || sup === "Z" || sup === "-") { ausencias[idDe(f.n)] = sup === "-" ? "Z" : sup; hecho.add(f.n); continue; }
                const m = PARTIDA.exec(tok);
                if (!m) { errores.push(f.nombre + ", ronda " + (r + 1) + ": no se entiende «" + tok + "»."); continue; }
                const rival = Number(m[1]), conBlancas = m[2].toLowerCase() === "b", res = m[3] === "=" ? "½" : m[3];
                const g = filas[rival - 1];
                if (!g || rival === f.n) { errores.push(f.nombre + ", ronda " + (r + 1) + ": el rival n.º " + rival + " no existe."); continue; }
                const espejo = { "1": "0", "0": "1", "½": "½", "+": "-", "-": "+" }[res];
                const m2 = PARTIDA.exec(g.rondas[r]);
                const res2 = m2 ? (m2[3] === "=" ? "½" : m2[3]) : null;
                if (!m2 || Number(m2[1]) !== f.n || (m2[2].toLowerCase() === "b") === conBlancas || !(res2 === espejo || (res === "-" && res2 === "-"))) {
                    errores.push("Ronda " + (r + 1) + ": " + f.nombre + " y " + g.nombre + " no dicen lo mismo (colores o resultado).");
                    continue;
                }
                const b = conBlancas ? f : g, ng = conBlancas ? g : f;
                const resB = conBlancas ? res : res2;
                const codigo = res === "-" && res2 === "-" ? "--" : resB === "1" ? "1-0" : resB === "0" ? "0-1" : resB === "½" ? "=" : resB === "+" ? "+-" : "-+";
                mesas.push({ b: idDe(b.n), n: idDe(ng.n), r: codigo });
                hecho.add(f.n); hecho.add(g.n);
            }
            rondas.push({ mesas, ausencias });
        }
        if (errores.length) return { t: null, nombres: {}, errores };
        const t = T.nuevo({
            sistema: op.sistema === "todos" ? "todos" : "suizo",
            rondasTotales: R,
            puntos: Object.assign({ victoria: 1, tablas: 0.5, derrota: 0, bye: 1 }, op.puntos || {}),
            desempates: op.desempates || [],
            jugadores: filas.map((f) => ({ id: idDe(f.n), nombre: f.nombre, elo: f.elo, titulo: f.titulo, fed: f.fed, sexo: "", retiradoDespuesDe: null })),
            numeracion: filas.map((f) => idDe(f.n)),
            rondas,
        });
        const nombres = {};
        filas.forEach((f) => { nombres[idDe(f.n)] = f.nombre; });
        return { t, nombres, errores: [] };
    }

    /* El torneo de vuelta a texto, una línea por jugador en el orden de la
       numeración. */
    function escribir(t, nombres) {
        const num = new Map(t.numeracion.map((id, i) => [id, i + 1]));
        return t.numeracion.map((id) => {
            const j = t.jugadores.find((x) => x.id === id);
            const celdas = t.rondas.map((R) => {
                for (const m of R.mesas) {
                    if (m.n === null && m.b === id) return "BYE";
                    if (m.b !== id && m.n !== id) continue;
                    const blancas = m.b === id, rival = num.get(blancas ? m.n : m.b), c = blancas ? "b" : "n";
                    const res = { "1-0": blancas ? "1" : "0", "0-1": blancas ? "0" : "1", "=": "½", "+-": blancas ? "+" : "-", "-+": blancas ? "-" : "+", "--": "-" }[m.r];
                    return rival + c + res;
                }
                return (R.ausencias || {})[id] || "Z";
            });
            return (nombres && nombres[id] || j.nombre) + " | " + (j.elo || 0) + " | " + celdas.join(" ");
        }).join("\n");
    }

    const api = { leer, escribir, idDe };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else raiz.AulaTorneoTexto = api;
})(typeof self !== "undefined" ? self : this);

/*! rev bfb5bbb0d2d82f9f */
