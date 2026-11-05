/* Lo que devolvería Google Vision de la foto de las planillas de una mesa
 * (palabras con su caja), armado a mano: dos planillas de la FCA una al lado de
 * la otra, cada una con sus números impresos 1–60 en tres bloques (1-20, 21-40 y
 * 41-60), Blancas y Negras al lado de cada número, el encabezado con números que
 * estorban («Ronda 4», «Mesa 11») y, si se pide, la foto girada, números que el
 * lector no vio y jugadas partidas en dos palabras. Lo usan
 * verificar-planilla-reconstruir.js y verificar-leer-partida.js. */
"use strict";

/* hojas: una lista de medias jugadas por planilla (lo que escribió cada uno).
 * opciones: { giro (grados), sinNumeros: [n…] (números impresos que no se leen),
 *            partir: true (las jugadas largas llegan en dos palabras) } */
function palabrasDePlanillas(hojas, opciones) {
    const o = Object.assign({ giro: 0, sinNumeros: [], partir: false }, opciones || {});
    const palabras = [];
    const ANCHO_HOJA = 900, BLOQUE = 290, RENGLON = 34, Y0 = 420;
    const caja = (texto, cx, cy, ancho, alto, centro) => {
        const ang = (o.giro * Math.PI) / 180;
        const dx = cx - centro.x, dy = cy - centro.y;
        const x = centro.x + dx * Math.cos(ang) - dy * Math.sin(ang);
        const y = centro.y + dx * Math.sin(ang) + dy * Math.cos(ang);
        palabras.push({ text: texto, bbox: { x0: Math.round(x - ancho / 2), y0: Math.round(y - alto / 2), x1: Math.round(x + ancho / 2), y1: Math.round(y + alto / 2) } });
    };
    hojas.forEach((plies, k) => {
        const sx = 60 + k * (ANCHO_HOJA + 120);
        const centro = { x: sx + ANCHO_HOJA / 2, y: Y0 + 10 * RENGLON };
        // el encabezado: texto y números que no son de jugada
        [["Federación", 200, 120], ["Costarricense", 330, 120], ["de", 420, 120], ["Ajedrez", 490, 120],
         ["Ronda", 150, 300], ["4", 200, 300], ["Mesa", 600, 300], ["11", 650, 300], ["2026", 780, 260]]
            .forEach(([t, x, y]) => caja(t, sx + x, y, t.length * 14, 26, centro));
        for (let b = 0; b < 3; b++) {
            const bx = sx + 20 + b * BLOQUE;
            caja("BLANCAS", bx + 0.35 * BLOQUE, Y0 - RENGLON, 70, 20, centro);
            caja("NEGRAS", bx + 0.78 * BLOQUE, Y0 - RENGLON, 60, 20, centro);
            for (let f = 0; f < 20; f++) {
                const n = b * 20 + f + 1;
                const cy = Y0 + f * RENGLON;
                if (!o.sinNumeros.includes(n)) caja(String(n), bx + 20, cy, n < 10 ? 10 : 20, 18, centro);
                [0, 1].forEach((lado) => {
                    const t = plies[(n - 1) * 2 + lado];
                    if (!t) return;
                    const cx = bx + (lado ? 0.78 : 0.35) * BLOQUE;
                    if (o.partir && t.length >= 4) {
                        const m = Math.ceil(t.length / 2);
                        caja(t.slice(0, m), cx - 18, cy + 2, m * 13, 26, centro);
                        caja(t.slice(m), cx + 18, cy - 1, (t.length - m) * 13, 26, centro);
                    } else caja(t, cx + ((n * 7) % 9) - 4, cy + ((n * 5) % 7) - 3, t.length * 14, 26, centro);
                });
            }
        }
        // las casillas del resultado, debajo de la grilla
        caja("GANAN", sx + 120, Y0 + 21 * RENGLON, 60, 20, centro);
        caja("TABLAS", sx + 420, Y0 + 21 * RENGLON, 60, 20, centro);
    });
    // Vision no las devuelve en orden
    return palabras.sort((a, b) => ((a.bbox.x0 * 31 + a.bbox.y0 * 17) % 101) - ((b.bbox.x0 * 31 + b.bbox.y0 * 17) % 101));
}

module.exports = { palabrasDePlanillas };

/*! rev bfb5bbb0d2d82f9f */
