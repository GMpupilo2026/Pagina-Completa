/* Encontrar el tablero en la imagen, para camara-tablero.html.
 *
 * La idea: un tablero es la única cosa de la imagen donde, a cada lado de
 * cada línea entre casillas, la luz cambia de clara a oscura con el patrón
 * de ajedrez. Para unas esquinas dadas se mide eso («puntaje»): de cada
 * tramo de línea entre dos casillas se mira un punto de cada lado y se suma
 * cuánto más clara es la que debería ser clara. Las piezas tapan algunos
 * puntos, pero son muchos (cientos): el patrón se impone.
 *
 * Con eso hay dos herramientas:
 *  - ajustar(img, esquinas): las esquinas tocadas a ojo se corren solas hasta
 *    donde el patrón calza mejor. También prueba correr todo el tablero una
 *    casilla para cada lado, por si quedó montado sobre el borde.
 *  - buscar(img): sin tocar nada, prueba tableros de muchos tamaños, giros y
 *    posiciones (de a poco, para no congelar el celular) y ajusta los mejores.
 *
 * Las esquinas salen en cualquier orden de giro: cuál es a1 lo decide la
 * calibración, que ve dónde están las piezas blancas. Ver «La cámara que lee
 * el tablero» en docs/decisiones/juegos-y-torneos.md.
 *
 * Necesita window.LectorTablero (js/lector-tablero.js) para la homografía.
 */
(function () {
    "use strict";
    if (window.DetectarTablero) return;

    /* La imagen en grises, como Float32Array, ancho w y alto h. */
    function gris(pix, w, h) {
        const g = new Float32Array(w * h);
        for (let i = 0, o = 0; i < g.length; i++, o += 4) g[i] = 0.299 * pix[o] + 0.587 * pix[o + 1] + 0.114 * pix[o + 2];
        return { w, h, g, desvio: desvio(g) };
    }
    function desvio(g) {
        let s = 0, s2 = 0;
        for (let i = 0; i < g.length; i++) { s += g[i]; s2 += g[i] * g[i]; }
        const m = s / g.length;
        return Math.max(1, Math.sqrt(Math.max(0, s2 / g.length - m * m)));
    }
    /* Achicar promediando bloques: para buscar alcanza con ~200 px de ancho. */
    function reducir(img, ancho) {
        const f = img.w / ancho;
        if (f <= 1) return img;
        const w = Math.round(img.w / f), h = Math.round(img.h / f);
        const g = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
            const y0 = Math.floor(y * f), y1 = Math.min(img.h, Math.floor((y + 1) * f));
            for (let x = 0; x < w; x++) {
                const x0 = Math.floor(x * f), x1 = Math.min(img.w, Math.floor((x + 1) * f));
                let s = 0, n = 0;
                for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += img.g[yy * img.w + xx]; n++; }
                g[y * w + x] = n ? s / n : 0;
            }
        }
        return { w, h, g, desvio: desvio(g), escala: f };
    }
    function valor(img, x, y) {
        if (!(x >= 0 && y >= 0 && x <= img.w - 1 && y <= img.h - 1)) return NaN;
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
        const i = y0 * img.w + x0, dx = x0 + 1 < img.w ? 1 : 0, dy = y0 + 1 < img.h ? img.w : 0, g = img.g;
        return g[i] * (1 - fx) * (1 - fy) + g[i + dx] * fx * (1 - fy) + g[i + dy] * (1 - fx) * fy + g[i + dx + dy] * fx * fy;
    }

    /* Los puntos que se miran, en coordenadas del tablero (u columna, v fila,
     * de 0 a 8). Cada uno es un par a cada lado de una línea, con el signo que
     * dice cuál de los dos debería ser el claro (a1 es oscura). */
    function puntos(deltas, lineas, tramos, alturas) {
        const lista = [];
        for (const delta of [].concat(deltas)) for (const i of lineas) for (const j of tramos) for (const t of alturas) {
            // Línea vertical u = i, a la altura v = j + t: casillas (i-1, j) y (i, j).
            lista.push([i - delta, j + t, i + delta, j + t, (i - 1 + j) % 2 === 0 ? 1 : -1]);
            // Línea horizontal v = i: casillas (j, i-1) y (j, i).
            lista.push([j + t, i - delta, j + t, i + delta, (j + i - 1) % 2 === 0 ? 1 : -1]);
        }
        return lista;
    }
    const TODAS = [1, 2, 3, 4, 5, 6, 7], TRAMOS = [0, 1, 2, 3, 4, 5, 6, 7];
    /* Cerca de la línea (fino) para afinar, y más lejos (grueso) para ver el
     * patrón aunque las esquinas estén corridas. Los puntos finos quedan
     * entre la línea y la base de la pieza: las piezas casi no los tapan. */
    const FINO = puntos([0.05, 0.1, 0.15], TODAS, TRAMOS, [0.25, 0.5, 0.75]);
    const GRUESO = puntos([0.12, 0.25, 0.38], TODAS, TRAMOS, [0.3, 0.5, 0.7]);

    /* El puntaje de unas esquinas: cuánto calza el patrón, en desvíos de la
     * imagen. Un punto fuera de la imagen cuenta como cero: salirse no paga.
     * Va en valor absoluto porque el tablero girado un cuarto de vuelta tiene
     * el patrón al revés, y las esquinas todavía no saben cuál es a1. */
    function puntaje(img, esquinas, lista) {
        const L = window.LectorTablero;
        const h = L.homografia(L.ESQUINAS_TABLERO, esquinas);
        if (!h) return -1;
        let s = 0;
        for (const [u1, v1, u2, v2, signo] of lista) {
            const [x1, y1] = L.aplicar(h, u1, v1), [x2, y2] = L.aplicar(h, u2, v2);
            const a = valor(img, x1, y1), b = valor(img, x2, y2);
            if (a === a && b === b) s += signo * (b - a);
        }
        return Math.abs(s) / lista.length / img.desvio;
    }
    /* Qué tan parejo es el patrón, de 0 a 1, sin importar el contraste: en
     * un tablero casi todos los pares tienen la clara donde debe; en un piso
     * o una pared, la mitad para cada lado. Sirve para decir «no hay
     * tablero». */
    function parejo(img, esquinas, lista) {
        const L = window.LectorTablero;
        const h = L.homografia(L.ESQUINAS_TABLERO, esquinas);
        if (!h) return 0;
        let s = 0, t = 0;
        for (const [u1, v1, u2, v2, signo] of lista) {
            const [x1, y1] = L.aplicar(h, u1, v1), [x2, y2] = L.aplicar(h, u2, v2);
            const a = valor(img, x1, y1), b = valor(img, x2, y2);
            if (a === a && b === b) { s += signo * (b - a); t += Math.abs(b - a); }
        }
        return t ? Math.abs(s) / t : 0;
    }

    const lado = (q) => (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])
        + Math.hypot(q[3][0] - q[2][0], q[3][1] - q[2][1]) + Math.hypot(q[0][0] - q[3][0], q[0][1] - q[3][1])) / 32;

    /* Mover las esquinas mientras mejore, con pasos cada vez más chicos:
     * cada coordenada sola, y también el tablero entero (correrlo, agrandarlo
     * y girarlo), que una esquina sola no puede hacer sin deformarlo. */
    function movidas(q, paso) {
        const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
        const r = Math.max(1, Math.hypot(q[0][0] - cx, q[0][1] - cy));
        const otras = [];
        for (let k = 0; k < 8; k++) for (const sg of [1, -1]) {
            const n = q.map((p) => p.slice()); n[k >> 1][k & 1] += sg * paso; otras.push(n);
        }
        for (const [dx, dy] of [[paso, 0], [-paso, 0], [0, paso], [0, -paso]]) otras.push(q.map(([x, y]) => [x + dx, y + dy]));
        for (const sg of [1, -1]) {
            const f = 1 + sg * paso / r;
            otras.push(q.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f]));
            const a = sg * paso / r, c = Math.cos(a), sn = Math.sin(a);
            otras.push(q.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * c]));
        }
        return otras;
    }
    function descender(img, q, lista, paso) {
        let mejor = puntaje(img, q, lista);
        let vueltas = 0;
        while (paso >= 0.25 && vueltas < 300) {
            let mejoro = false;
            for (const r of movidas(q, paso)) {
                const v = puntaje(img, r, lista);
                if (v > mejor) { mejor = v; q = r; mejoro = true; }
            }
            vueltas++;
            if (!mejoro) paso /= 2;
        }
        return { esquinas: q, puntaje: mejor };
    }

    /* El tablero entero corrido una casilla (o achicado/agrandado una fila):
     * por si las esquinas quedaron sobre el borde impreso del tablero. */
    function vecinos(q) {
        const L = window.LectorTablero;
        const h = L.homografia(L.ESQUINAS_TABLERO, q);
        if (!h) return [];
        const otros = [];
        for (const du of [-1, 0, 1]) for (const dv of [-1, 0, 1]) {
            if (du || dv) otros.push([[0 + du, 0 + dv], [8 + du, 0 + dv], [8 + du, 8 + dv], [0 + du, 8 + dv]].map(([u, v]) => L.aplicar(h, u, v)));
        }
        return otros;
    }

    /* Primero con los puntos gruesos (el patrón se ve aunque esté corrido),
     * después con los finos. Correr el tablero entero una casilla se decide
     * con los finos: los gruesos caen sobre las piezas y a veces prefieren el
     * tablero montado sobre el borde. */
    function ajustar(img, esquinas) {
        let r = descender(img, esquinas.map((p) => p.slice()), GRUESO, lado(esquinas) / 3);
        r = descender(img, r.esquinas, FINO, lado(r.esquinas) / 8);
        for (let i = 0; i < 4; i++) {
            let mejor = null;
            for (const q of vecinos(r.esquinas)) {
                const v = puntaje(img, q, FINO);
                if (v > r.puntaje * 1.03 && (!mejor || v > mejor.v)) mejor = { q, v };
            }
            if (!mejor) break;
            r = descender(img, mejor.q, FINO, lado(mejor.q) / 8);
        }
        r.parejo = parejo(img, r.esquinas, FINO);
        return r;
    }

    /* Buscar sin que nadie toque nada. En la imagen chica, prueba cuadrados
     * girados de 0 a 84° (de a 6), achatados por la inclinación de la cámara
     * (de 1 a 0,5) y de muchos tamaños y posiciones. Primero con 24 puntos y,
     * a los que prometen, con todos. Los mejores se ajustan en la imagen
     * grande. Devuelve una promesa: entre giro y giro le cede el turno al
     * navegador y avisa por alAvanzar(0..1). */
    const RAPIDO = puntos(0.4, [2, 4, 6], [1, 3, 5, 7], [0.5]);
    const MEDIO = puntos(0.4, TODAS, TRAMOS, [0.5]);
    /* Cuándo hay tablero. Con tableros de prueba (inclinados, girados, chicos,
     * con baldosas alrededor) sale parejo 1,00 y puntaje 2,5 o más; un piso
     * de baldosas solo, parejo 0,81 y puntaje 0,6. Una foto de verdad tiene
     * menos contraste: por eso el puntaje pide poco y el parejo, mucho. */
    const MINIMO = { parejo: 0.92, puntaje: 0.9 };
    const hayTablero = (r) => !!r && r.parejo >= MINIMO.parejo && r.puntaje >= MINIMO.puntaje;

    /* [achatado, trapecio]: sin trapecio, todo lo achatado; con trapecio,
     * solo achatado (una cámara de lado achata y abre a la vez). */
    const FORMAS = [[1, 0], [0.87, 0], [0.75, 0], [0.65, 0], [0.56, 0], [0.48, 0],
        [0.87, 0.3], [0.75, 0.3], [0.65, 0.3], [0.56, 0.3], [0.48, 0.3],
        [0.75, 0.55], [0.65, 0.55], [0.56, 0.55], [0.48, 0.55]];

    /* Tapar con gris parejo lo que ya se encontró (un poco agrandado), para
     * que buscar un segundo tablero no vuelva a dar con el primero. */
    function tapar(img, cuadros) {
        if (!cuadros || !cuadros.length) return img;
        const g = new Float32Array(img.g);
        let media = 0;
        for (let i = 0; i < g.length; i++) media += g[i];
        media /= g.length;
        for (const c of cuadros) {
            const cx = c.reduce((s, p) => s + p[0], 0) / 4, cy = c.reduce((s, p) => s + p[1], 0) / 4;
            const q = ordenar(c.map(([x, y]) => [cx + (x - cx) * 1.15, cy + (y - cy) * 1.15]));
            const x0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])))), x1 = Math.min(img.w - 1, Math.ceil(Math.max(...q.map((p) => p[0]))));
            const y0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[1])))), y1 = Math.min(img.h - 1, Math.ceil(Math.max(...q.map((p) => p[1]))));
            let area = 0;
            for (let i = 0; i < 4; i++) area += q[i][0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * q[i][1];
            const sentido = Math.sign(area);
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                // Adentro si queda del mismo lado de los cuatro bordes que el área.
                let dentro = true;
                for (let i = 0; i < 4 && dentro; i++) {
                    const a = q[i], b = q[(i + 1) % 4];
                    if (sentido * ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) < 0) dentro = false;
                }
                if (dentro) g[y * img.w + x] = media;
            }
        }
        return { w: img.w, h: img.h, g, desvio: img.desvio };
    }

    async function buscar(img, alAvanzar, opciones) {
        img = tapar(img, opciones && opciones.excluir);
        const chica = reducir(img, 200), w = chica.w, h = chica.h, g = chica.g, sd = chica.desvio;
        const menor = Math.min(w, h), mayor = Math.max(w, h);
        const mejores = []; // { q, v } de la imagen chica
        let umbral = 0;
        /* Un punto del tablero (u, v) en la imagen chica: girado, achatado por
         * la inclinación y, con la cámara de lado, más ancho abajo (lo que
         * está cerca) que arriba: un trapecio. */
        const enImagen = (u, v, cx, cy, k, c, s, r, tr, lad) => {
            const Y = r * k * (s * (u - 4) + c * (v - 4));
            const X = k * (c * (u - 4) - s * (v - 4)) * (1 + tr * Y / (lad * r));
            return [cx + X, cy + Y];
        };
        const rapido = (cx, cy, k, c, s, r, tr, lad, lista) => {
            let suma = 0;
            for (let n = 0; n < lista.length; n++) {
                const m = lista[n];
                const Ya = r * k * (s * (m[0] - 4) + c * (m[1] - 4)), Yb = r * k * (s * (m[2] - 4) + c * (m[3] - 4));
                const x1 = (cx + k * (c * (m[0] - 4) - s * (m[1] - 4)) * (1 + tr * Ya / (lad * r))) | 0, y1 = (cy + Ya) | 0;
                const x2 = (cx + k * (c * (m[2] - 4) - s * (m[3] - 4)) * (1 + tr * Yb / (lad * r))) | 0, y2 = (cy + Yb) | 0;
                if (x1 < 0 || y1 < 0 || x2 < 0 || y2 < 0 || x1 >= w || x2 >= w || y1 >= h || y2 >= h) continue;
                suma += m[4] * (g[y2 * w + x2] - g[y1 * w + x1]);
            }
            return Math.abs(suma) / lista.length / sd;
        };
        const GIROS = [];
        for (let a = 0; a < 90; a += 6) GIROS.push(a);
        for (let gi = 0; gi < GIROS.length; gi++) {
            const ang = GIROS[gi] * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang);
            for (const [r, tr] of FORMAS) {
                for (let lad = menor * 0.3; lad <= mayor * 1.02; lad *= 1.1) {
                    const k = lad / 8, paso = Math.max(1, lad / 12);
                    for (let cy = 0; cy < h; cy += paso) {
                        for (let cx = 0; cx < w; cx += paso) {
                            const v1 = rapido(cx, cy, k, c, s, r, tr, lad, RAPIDO);
                            if (v1 < umbral * 0.8) continue;
                            const v = rapido(cx, cy, k, c, s, r, tr, lad, MEDIO);
                            if (v < umbral) continue;
                            // Uno solo por zona: el mejor de los que se parecen.
                            const q = [[0, 0], [8, 0], [8, 8], [0, 8]].map(([u, vv]) => enImagen(u, vv, cx, cy, k, c, s, r, tr, lad));
                            const cerca = mejores.findIndex((o) => Math.hypot(o.cx - cx, o.cy - cy) < lad / 6 && Math.abs(o.lad - lad) < lad / 5);
                            if (cerca >= 0) { if (mejores[cerca].v < v) mejores[cerca] = { q, v, cx, cy, lad }; }
                            else mejores.push({ q, v, cx, cy, lad });
                            mejores.sort((a, b) => b.v - a.v);
                            if (mejores.length > 8) mejores.length = 8;
                            umbral = mejores.length >= 8 ? mejores[7].v : 0;
                        }
                    }
                }
            }
            if (alAvanzar) alAvanzar((gi + 1) / (GIROS.length + 1));
            await new Promise((listo) => setTimeout(listo, 0));
        }
        // Los candidatos, a la imagen grande y ajustados.
        let mejor = null;
        for (const m of mejores) {
            const q = m.q.map(([x, y]) => [x * (chica.escala || 1), y * (chica.escala || 1)]);
            const r = ajustar(img, q);
            if (!mejor || r.puntaje > mejor.puntaje) mejor = r;
        }
        if (alAvanzar) alAvanzar(1);
        return hayTablero(mejor) ? mejor : null;
    }

    /* Las cuatro esquinas en orden de giro, el mismo que a1, h1, h8, a8 visto
     * desde arriba (en la imagen, con la y hacia abajo, el área con signo es
     * negativa). Cuál de las cuatro es a1 lo decide la calibración. */
    function ordenar(esquinas) {
        const cx = esquinas.reduce((s, p) => s + p[0], 0) / 4, cy = esquinas.reduce((s, p) => s + p[1], 0) / 4;
        const q = esquinas.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
        let area = 0;
        for (let i = 0; i < 4; i++) area += q[i][0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * q[i][1];
        return area > 0 ? q.reverse() : q;
    }
    const girar = (q, k) => q.slice(k).concat(q.slice(0, k));

    window.DetectarTablero = { gris, reducir, puntaje, parejo, ajustar, buscar, tapar, ordenar, girar, hayTablero, FINO, GRUESO, MINIMO };
})();
