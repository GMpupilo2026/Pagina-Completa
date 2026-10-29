/* El lector de la cámara que lee el tablero: lo que se calcula, sin tocar
 * la página (la homografía, lo que se mira de cada casilla, la lectura y las
 * jugadas que la explican). Lo usan camara-tablero.js en la página y
 * lector-tablero-worker.js en su propio hilo (sin window ni document), y lo
 * prueba verificar-camara-tablero.js. Ver «La cámara que lee el tablero» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 * La idea que la vuelve posible: NO reconoce piezas, reconoce JUGADAS.
 *  1. Con las cuatro esquinas que marca la persona se arma una homografía (la
 *     cuenta que lleva una casilla del tablero a su lugar en la imagen,
 *     inclinada como esté). No hace falta OpenCV: son ocho incógnitas.
 *  2. De cada casilla solo se pregunta si está vacía, con pieza blanca o con
 *     pieza negra. Lo aprende de la posición inicial («Calibrar»): las filas 3
 *     a 6 enseñan cómo se ve una casilla vacía de cada color, las 1 y 2 una
 *     pieza blanca y las 7 y 8 una negra.
 *  3. Cuando la lectura se queda quieta un rato (la mano ya salió) y no es la
 *     posición que se espera, chess.js busca qué jugada legal la explica. Si
 *     ninguna, o ninguna pareja de jugadas, la explica, NO se anota nada: se
 *     dice qué casillas cambiaron. Ninguna posición se inventa.
 */
(function (global) {
    "use strict";

    const COLUMNAS = "abcdefgh";

    /* ── La homografía ───────────────────────────────────────────────────
     * Lleva (u, v) del tablero —u la columna de 0 a 8 desde la a, v la fila de
     * 0 a 8 desde la 1— a (x, y) de la imagen. Con cuatro puntos se resuelve
     * exacta: x = (h0 u + h1 v + h2) / (h6 u + h7 v + 1), igual con y. */
    function homografia(desde, hacia) {
        if (!convexo(hacia)) return null; // esquinas cruzadas o en línea: no hay tablero
        const A = [], b = [];
        for (let i = 0; i < 4; i++) {
            const [u, v] = desde[i], [x, y] = hacia[i];
            A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
            A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
        }
        // Eliminación de Gauss con pivote parcial.
        for (let c = 0; c < 8; c++) {
            let p = c;
            for (let f = c + 1; f < 8; f++) if (Math.abs(A[f][c]) > Math.abs(A[p][c])) p = f;
            if (Math.abs(A[p][c]) < 1e-12) return null;
            [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
            for (let f = c + 1; f < 8; f++) {
                const k = A[f][c] / A[c][c];
                for (let j = c; j < 8; j++) A[f][j] -= k * A[c][j];
                b[f] -= k * b[c];
            }
        }
        const h = new Array(8);
        for (let f = 7; f >= 0; f--) {
            let s = b[f];
            for (let j = f + 1; j < 8; j++) s -= A[f][j] * h[j];
            h[f] = s / A[f][f];
        }
        return h;
    }
    /* Las cuatro esquinas tienen que formar un cuadrilátero de verdad: todas
     * las vueltas hacia el mismo lado y con algo de área. */
    function convexo(p) {
        let signo = 0, area = 0;
        for (let i = 0; i < 4; i++) {
            const [a, b, c] = [p[i], p[(i + 1) % 4], p[(i + 2) % 4]];
            const giro = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
            if (Math.abs(giro) < 1e-9) return false;
            if (signo && Math.sign(giro) !== signo) return false;
            signo = Math.sign(giro);
            area += a[0] * b[1] - b[0] * a[1];
        }
        return Math.abs(area) / 2 >= 100;
    }
    function aplicar(h, u, v) {
        const w = h[6] * u + h[7] * v + 1;
        return [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w];
    }
    // Las esquinas se marcan en este orden: a1, h1, h8, a8.
    const ESQUINAS_TABLERO = [[0, 0], [8, 0], [8, 8], [0, 8]];

    /* ── Lo que se mira de cada casilla ──────────────────────────────────
     * Una rejilla de N × N puntos dentro de la casilla (el 56 % del medio: los
     * bordes se los comen la perspectiva y la pieza de al lado). De cada punto,
     * la luminancia.
     *
     * Con la cámara de lado, una pieza alta tapa la parte de ATRÁS de la
     * casilla siguiente (la que en la imagen queda arriba): un caballo en f3
     * se veía también en f4. La base de cada pieza, en cambio, queda del lado
     * de la cámara. Por eso la rejilla se corre hacia donde la casilla mira a
     * la cámara (abajo en la imagen), lo que dé sin salirse. Desde arriba, la
     * corrida casi no cambia nada. */
    const N = 8;
    const DESDE = 0.22, HASTA = 0.78, CORRIDA = 0.14;

    /* `pix` puede ser solo un pedazo de la imagen (el recorte donde está el
     * tablero): (ox, oy) es dónde empieza ese pedazo en la imagen entera. */
    function muestras(pix, ancho, alto, h, ox, oy) {
        ox = ox || 0; oy = oy || 0;
        const todas = [];
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                // Hacia dónde queda «abajo en la imagen», en casillas.
                const [cx, cy] = aplicar(h, f + 0.5, r + 0.5);
                const [ux, uy] = aplicar(h, f + 0.6, r + 0.5), [vx, vy] = aplicar(h, f + 0.5, r + 0.6);
                const a = (ux - cx) / 0.1, b = (vx - cx) / 0.1, c = (uy - cy) / 0.1, d = (vy - cy) / 0.1;
                const det = a * d - b * c;
                let du = 0, dv = 0;
                if (Math.abs(det) > 1e-9) {
                    du = -b / det; dv = a / det; // la casilla que corresponde a (0, +1) en la imagen
                    const n = Math.hypot(du, dv) || 1;
                    du = du / n * CORRIDA; dv = dv / n * CORRIDA;
                }
                const L = new Float32Array(N * N);
                for (let j = 0; j < N; j++) {
                    for (let i = 0; i < N; i++) {
                        const t = (k) => DESDE + (HASTA - DESDE) * (k + 0.5) / N;
                        const [x, y] = aplicar(h, f + t(i) + du, r + t(j) + dv);
                        const px = Math.min(ancho - 1, Math.max(0, Math.round(x) - ox));
                        const py = Math.min(alto - 1, Math.max(0, Math.round(y) - oy));
                        const o = (py * ancho + px) * 4;
                        L[j * N + i] = 0.299 * pix[o] + 0.587 * pix[o + 1] + 0.114 * pix[o + 2];
                    }
                }
                todas.push(L);
            }
        }
        return todas; // índice r * 8 + f: 0 es a1, 63 es h8
    }

    const oscura = (k) => ((k >> 3) + (k & 7)) % 2 === 0; // a1 es oscura
    const media = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    const desvio = (a) => { const m = media(a); return Math.sqrt(media(a.map((x) => (x - m) * (x - m)))); };

    /* El borde: cuánto cambia la luz de un punto al vecino. Una casilla vacía
     * es lisa; una pieza, aunque sea del mismo color que la casilla, tiene su
     * contorno y su sombra. */
    function borde(L) {
        let s = 0, n = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            if (i + 1 < N) { s += Math.abs(L[j * N + i] - L[j * N + i + 1]); n++; }
            if (j + 1 < N) { s += Math.abs(L[j * N + i] - L[(j + 1) * N + i]); n++; }
        }
        return s / n;
    }

    /* Los rasgos de una casilla, contra el fondo vacío de su color:
     *   fuera: qué parte de los puntos se aparta del fondo;
     *   borde: lo de arriba;
     *   tono:  la luz media de los puntos que se apartan (blanca o negra). */
    function rasgos(L, fondo) {
        const umbral = Math.max(2.5 * fondo.desvio, 12);
        let fuera = 0, suma = 0;
        for (let k = 0; k < L.length; k++) {
            if (Math.abs(L[k] - fondo.media) > umbral) { fuera++; suma += L[k]; }
        }
        return { fuera: fuera / L.length, borde: borde(L), tono: fuera ? suma / fuera : media(L) };
    }

    const INICIAL = "B".repeat(16) + ".".repeat(32) + "N".repeat(16);

    /* Calibrar: aprender cómo se ve en esta imagen una casilla vacía de cada
     * color, una pieza blanca y una negra, con la posición que se sabe que
     * hay (64 letras como las de la lectura). Por omisión, la inicial; para
     * seguir una partida después de mover la cámara, la de la partida. */
    function calibrar(todas, sabida) {
        sabida = sabida || INICIAL;
        const fondos = {};
        for (const os of [true, false]) {
            let vacias = [];
            for (let k = 0; k < 64; k++) if (sabida[k] === "." && oscura(k) === os) vacias.push(todas[k]);
            if (!vacias.length) for (let k = 0; k < 64; k++) if (sabida[k] === ".") vacias.push(todas[k]);
            const medias = vacias.map(media);
            const dentro = media(vacias.map(desvio));
            fondos[os] = { media: media(medias), desvio: Math.max(2, Math.sqrt(dentro * dentro + Math.pow(desvio(medias), 2))) };
        }
        const r = todas.map((L, k) => rasgos(L, fondos[oscura(k)]));
        const centro = (lista) => (lista.length ? { fuera: media(lista.map((x) => x.fuera)), borde: media(lista.map((x) => x.borde)), tono: media(lista.map((x) => x.tono)) } : null);
        const de = (filtro) => r.filter((x, k) => filtro(k));
        const cal = { fondos, vacia: {}, ocupada: {}, blanca: {}, negra: {} };
        for (const os of [true, false]) {
            const mismo = (k) => oscura(k) === os;
            // Si en un color de casilla no hay de algo (pasa en una partida
            // avanzada), se usa lo del otro color.
            const o = (filtro) => centro(de((k) => filtro(k) && mismo(k))) || centro(de(filtro));
            cal.vacia[os] = o((k) => sabida[k] === ".");
            cal.ocupada[os] = o((k) => sabida[k] !== ".");
            cal.blanca[os] = (o((k) => sabida[k] === "B") || cal.ocupada[os]).tono;
            cal.negra[os] = (o((k) => sabida[k] === "N") || cal.ocupada[os]).tono;
        }
        // La escala de cada rasgo: lo que separa vacía de ocupada, con piso.
        cal.escala = {
            fuera: Math.max(0.05, Math.abs(media([true, false].map((o) => cal.ocupada[o].fuera - cal.vacia[o].fuera)))),
            borde: Math.max(1, Math.abs(media([true, false].map((o) => cal.ocupada[o].borde - cal.vacia[o].borde)))),
        };
        return cal;
    }

    /* La luz cambia (el sol que entra, una nube, una lámpara): una
     * calibración nueva, hecha con la posición que se sabe, se mezcla con la
     * de antes. `peso` es cuánto pesa la nueva (de 0 a 1). */
    function mezclarCal(vieja, nueva, peso) {
        const m = (a, b) => (typeof a === "number" && typeof b === "number" ? a + (b - a) * peso : b);
        const obj = (a, b) => { const o = {}; for (const k of Object.keys(b)) o[k] = typeof b[k] === "object" && b[k] ? obj(a && a[k], b[k]) : m(a && a[k], b[k]); return o; };
        return obj(vieja, nueva);
    }

    /* La lectura: 64 letras, «.» vacía, «B» blanca, «N» negra, de a1 a h8, y
     * la seguridad de cada una, de 0 (podría ser lo otro) a 1 (sin duda). */
    function leerDetalle(todas, cal) {
        let s = "";
        const seguridad = new Float32Array(64);
        for (let k = 0; k < 64; k++) {
            const os = oscura(k);
            const x = rasgos(todas[k], cal.fondos[os]);
            const d = (c) => Math.hypot((x.fuera - c.fuera) / cal.escala.fuera, (x.borde - c.borde) / cal.escala.borde);
            const dv = d(cal.vacia[os]), doc = d(cal.ocupada[os]);
            const ocupa = Math.min(1, Math.abs(dv - doc) / (dv + doc + 1e-6) * 2);
            if (dv <= doc) { s += "."; seguridad[k] = ocupa; continue; }
            const db = Math.abs(x.tono - cal.blanca[os]), dn = Math.abs(x.tono - cal.negra[os]);
            s += db <= dn ? "B" : "N";
            seguridad[k] = Math.min(ocupa, Math.min(1, Math.abs(db - dn) / (db + dn + 1e-6) * 2));
        }
        return { lectura: s, seguridad };
    }
    const leer = (todas, cal) => leerDetalle(todas, cal).lectura;

    const casilla = (k) => COLUMNAS[k & 7] + ((k >> 3) + 1);

    /* Lo que se espera ver de una partida de chess.js, con las mismas letras. */
    function esperada(juego) {
        let s = "";
        for (let k = 0; k < 64; k++) {
            const p = juego.get(casilla(k));
            s += !p ? "." : p.color === "w" ? "B" : "N";
        }
        return s;
    }

    /* Qué jugadas explican la lectura, de la más a la menos probable.
     *
     * Sin la seguridad de cada casilla, solo vale la que calza exacta. Con
     * ella, cada casilla que no calza cuesta más cuanto más segura estaba la
     * lectura: una casilla dudosa (el caballo que en f3 se ve también un poco
     * en e3) casi no pesa, una clara sí. Se mide también «no pasó nada», para
     * no inventar una jugada con una sombra. Si se escapó una jugada, se
     * prueban las parejas, solo cuando ninguna sola explica la lectura.
     * Al coronar, la cámara solo ve «pieza blanca»: se anota dama. */
    function costo(pred, lectura, seguridad) {
        let c = 0;
        for (let k = 0; k < 64; k++) if (pred[k] !== lectura[k]) c += seguridad ? 0.4 + seguridad[k] : 1;
        return c;
    }
    function candidatas(juego, lectura, seguridad) {
        const legales = () => juego.moves({ verbose: true }).filter((m) => !m.promotion || m.promotion === "q");
        const lista = [];
        for (const m of legales()) {
            juego.move(m);
            lista.push({ jugadas: [m.san], costo: costo(esperada(juego), lectura, seguridad) });
            juego.undo();
        }
        lista.sort((a, b) => a.costo - b.costo);
        if (!lista.length || lista[0].costo > (seguridad ? 1.6 : 0)) {
            for (const m of legales()) {
                juego.move(m);
                for (const m2 of legales()) {
                    juego.move(m2);
                    const c = costo(esperada(juego), lectura, seguridad);
                    if (c <= (seguridad ? 1.2 : 0)) lista.push({ jugadas: [m.san, m2.san], costo: c });
                    juego.undo();
                }
                juego.undo();
            }
            lista.sort((a, b) => a.costo - b.costo);
        }
        return { lista, quieto: costo(esperada(juego), lectura, seguridad) };
    }
    /* Lo que se anota solo: la mejor, si explica bien la lectura, explica
     * claramente más que «no pasó nada» y le gana claro a la segunda.
     * Devuelve { jugadas } para anotar, { dudas } si hay dos o tres parecidas
     * (se le pregunta a la persona), o null. */
    const MAXIMO = 1.6, VENTAJA = 0.8;
    function decidir(juego, lectura, seguridad) {
        const { lista, quieto } = candidatas(juego, lectura, seguridad);
        const [a, b] = lista;
        if (!a) return null;
        if (!seguridad) return a.costo === 0 && (!b || b.costo > 0) ? { jugadas: a.jugadas } : null;
        if (a.costo > 2 * MAXIMO || quieto - a.costo < 1) return null;
        if (a.costo <= MAXIMO && (!b || b.costo - a.costo >= VENTAJA)) return { jugadas: a.jugadas };
        const dudas = lista.filter((x) => x.costo <= a.costo + VENTAJA && x.costo <= 2 * MAXIMO).slice(0, 3);
        return dudas.length > 1 ? { dudas: dudas.map((x) => x.jugadas) } : (a.costo <= MAXIMO ? { jugadas: a.jugadas } : null);
    }
    function buscarJugadas(juego, lectura, seguridad) {
        const r = decidir(juego, lectura, seguridad);
        return r && r.jugadas ? r.jugadas : null;
    }

    /* La coronación. La cámara solo ve «pieza blanca» en la casilla: se anota
     * dama, y después se corrige. `ply` es el índice de la jugada que coronó
     * en la historia. Cambia la pieza y vuelve a jugar lo que siguió; si algo
     * deja de ser legal, deja la partida como estaba y devuelve false. */
    function cambiarCoronacion(juego, ply, pieza) {
        const hist = juego.history({ verbose: true });
        const m = hist[ply];
        if (!m || !m.promotion || !"qrbn".includes(pieza)) return false;
        if (m.promotion === pieza) return true;
        const despues = hist.slice(ply);
        despues.forEach(() => juego.undo());
        const rehacer = (lista) => lista.every((x) => juego.move({ from: x.from, to: x.to, promotion: x.promotion }));
        const nuevas = despues.map((x, i) => (i === 0 ? Object.assign({}, x, { promotion: pieza }) : x));
        if (rehacer(nuevas)) return true;
        while (juego.history().length > ply) juego.undo();
        rehacer(despues);
        return false;
    }
    /* Si la pieza coronada se mueve como caballo (o como algo que una dama no
     * puede), ninguna jugada explica la lectura. Se prueba con las otras
     * piezas: la primera que la explique con una jugada de esa pieza es la
     * que se coronó. `donde` es la casilla donde está ahora esa pieza.
     * Devuelve { pieza, jugadas } o null; no cambia `juego`. */
    function deducirCoronacion(juego, ply, donde, lectura, seguridad) {
        const m = juego.history({ verbose: true })[ply];
        if (!m || !m.promotion) return null;
        for (const pieza of ["n", "r", "b"]) {
            if (!cambiarCoronacion(juego, ply, pieza)) continue;
            const r = decidir(juego, lectura, seguridad);
            const ok = r && r.jugadas && (() => {
                const hechas = r.jugadas.map((san) => juego.move(san));
                hechas.forEach((x) => x && juego.undo());
                return hechas.some((x) => x && x.from === donde);
            })();
            cambiarCoronacion(juego, ply, m.promotion);
            if (ok) return { pieza, jugadas: r.jugadas };
        }
        return null;
    }

    function diferentes(a, b) {
        const d = [];
        for (let k = 0; k < 64; k++) if (a[k] !== b[k]) d.push(casilla(k));
        return d;
    }

    global.LectorTablero = { homografia, aplicar, ESQUINAS_TABLERO, INICIAL, muestras, calibrar, leer, leerDetalle, esperada, candidatas, decidir, buscarJugadas, mezclarCal, cambiarCoronacion, deducirCoronacion, diferentes, casilla };
})(typeof self !== "undefined" ? self : this);
