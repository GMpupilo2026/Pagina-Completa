/* El código de camara-tablero.html: la prueba de la cámara que lee un tablero
 * de verdad y anota las jugadas.
 *
 * Es una PRUEBA: sirve para medir qué tan bien se ven nuestros tableros con la
 * luz real de un salón antes de entrenar ningún modelo. Por eso no guarda nada
 * ni manda la imagen a ningún lado: todo pasa en el celular. Ver «La cámara que
 * lee el tablero» en docs/decisiones/juegos-y-torneos.md.
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
 *
 * Lo de calcular (homografía, lectura, jugadas) está en window.LectorTablero,
 * sin tocar la página, para que verificar-camara-tablero.js lo pruebe solo.
 */
(function () {
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

    function muestras(pix, ancho, alto, h) {
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
                        const px = Math.min(ancho - 1, Math.max(0, Math.round(x)));
                        const py = Math.min(alto - 1, Math.max(0, Math.round(y)));
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

    function diferentes(a, b) {
        const d = [];
        for (let k = 0; k < 64; k++) if (a[k] !== b[k]) d.push(casilla(k));
        return d;
    }

    window.LectorTablero = { homografia, aplicar, ESQUINAS_TABLERO, INICIAL, muestras, calibrar, leer, leerDetalle, esperada, candidatas, decidir, buscarJugadas, diferentes, casilla };

    /* ── La página ───────────────────────────────────────────────────────── */
    if (!document.getElementById("lienzo")) return;

    const D = window.DetectarTablero, V = window.PartidaEnVivo;
    /* El ancho al que se trabaja la imagen: con un tablero, 640; con dos, 960,
     * porque cada uno ocupa la mitad y sus casillas se ven más chicas. */
    const ANCHO = [640, 960];
    const CADA_MS = 200;        // cada cuánto se lee el tablero
    const QUIETA = 6;           // lecturas iguales seguidas para fiarse (~1,2 s)
    const NOMBRE = ["a1", "h1", "h8", "a8"];
    /* Varias cámaras en una computadora (camaras.html): cada una es esta
     * misma página en un cuadrito, con «?puesto=N&compacto=1». Lo que es de
     * cada cámara (su dispositivo, su mesa, su partida, su código) se guarda
     * aparte por puesto; el torneo y su código, en cambio, se comparten. */
    const parametros = new URLSearchParams(location.search);
    const PUESTO = (parametros.get("puesto") || "").replace(/[^0-9]/g, "").slice(0, 2);
    const delPuesto = (clave) => (PUESTO ? clave + "_p" + PUESTO : clave);
    if (parametros.get("compacto") === "1") document.documentElement.classList.add("camara-compacta");
    const GUARDADO = ["camara_vivo_codigo_v1", "camara_vivo_codigo_v1_2"].map(delPuesto);
    const PARTIDA = delPuesto("camara_partida_v1") + "_"; // + el número del tablero
    const COLOR = ["rgba(250, 204, 21, 0.9)", "rgba(34, 211, 238, 0.9)"]; // amarillo y celeste; además se escribe el número

    const $ = (id) => document.getElementById(id);
    const lienzo = $("lienzo"), ctx = lienzo.getContext("2d");
    /* La imagen tal cual llega, sin nada dibujado encima: de acá se lee. El
     * lienzo que se ve lleva la cuadrícula, las letras y las esquinas, y leer
     * de él confundiría la cuadrícula amarilla con las líneas del tablero. */
    const limpio = document.createElement("canvas"), cctx = limpio.getContext("2d", { willReadFrequently: true });
    const video = $("video");

    /* Lo de cada tablero va junto. El segundo es opcional: con uno solo se
     * lee mejor, y la página arranca así. */
    function nuevoTablero(i) {
        return {
            i, esquinas: [], h: null, cal: null, juego: new window.Chess(),
            recientes: [], quieta: null, lectura: null, ajustada: false,
            vivo: null, nombres: { blancas: "", negras: "" },
            resultadoMano: null, // el que se marcó con los botones (abandono, tiempo, tablas)
            // La hora de cada jugada (null si no se sabe: una partida cargada a
            // mano) y la de arranque: el tiempo de cada jugada y el retraso de
            // la transmisión salen de acá.
            inicio: Date.now(), horas: [], horaResultado: null,
        };
    }
    let tableros = [nuevoTablero(0)];
    let activo = 0;
    const T = () => tableros[activo];

    let fuente = null;          // el <video> o la imagen de la foto
    let elegida = 0;            // la esquina que mueven las flechas
    let arrastre = -1;
    let ultimaMirada = 0;
    let buscando = false;

    const es = (san) => (window.ComandosTablero ? window.ComandosTablero.jugadaParaMostrar(san) : san);
    const dos = () => tableros.length === 2;
    /* El resultado: el que dice el tablero (mate, ahogado) o, si no, el que se
     * marcó a mano. Una jugada nueva, «Deshacer» o una partida nueva lo borran. */
    const resultadoDe = (t) => V.resultadoSolo(t.juego) || t.resultadoMano;
    // Cuánto tardó cada jugada, en ms (null si no se sabe).
    const tiemposDe = (t) => t.horas.map((h, i) => { const antes = i ? t.horas[i - 1] : t.inicio; return h && antes ? h - antes : null; });
    const cual = (t) => (dos() ? "Tablero " + (t.i + 1) + ": " : "");

    let ultimoAviso = { texto: "", tipo: "" };
    function avisar(texto, tipo) {
        ultimoAviso = { texto, tipo: tipo || "" };
        const a = $("aviso");
        a.textContent = texto;
        a.className = "mb-4 rounded-xl px-4 py-3 text-sm " + (tipo === "error"
            ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
            : tipo === "bien" ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200"
            : "bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100");
    }

    function pedirEsquina() {
        const t = T();
        avisar(cual(t) + (t.esquinas.length < 4
            ? (t.esquinas.length ? "Van " + t.esquinas.length + " de 4 esquinas. " : "Toca «Buscar el tablero» o marca tú las cuatro esquinas, en cualquier orden. ") + "Puedes dejar el dedo apretado y moverlo: la lupa muestra dónde cae."
            : t.cal ? "Leyendo el tablero. Haz las jugadas y espera a que se anoten."
            : "Listo. Ahora pon las piezas en la posición inicial y toca «Calibrar con la posición inicial». Las esquinas se pueden arrastrar."));
    }

    function botones() {
        const t = T();
        $("btn-esquinas").disabled = !fuente;
        $("btn-buscar").disabled = !fuente || buscando;
        $("btn-ajustar").disabled = !t.h;
        $("btn-calibrar").disabled = !t.h;
        $("btn-seguir").disabled = !t.h;
    }

    function tamano(ancho, alto) {
        const w = ANCHO[tableros.length - 1];
        lienzo.width = limpio.width = w;
        lienzo.height = limpio.height = Math.round(w * alto / ancho);
    }

    function nuevaFuente(f, ancho, alto) {
        fuente = f;
        tamano(ancho, alto);
        for (const t of tableros) { t.esquinas = []; t.h = null; t.cal = null; t.recientes = []; t.quieta = null; t.lectura = null; t.ajustada = false; }
        botones();
        pedirEsquina();
    }
    const anchoFuente = () => (fuente instanceof HTMLImageElement ? fuente.naturalWidth : video.videoWidth || 640);
    const altoFuente = () => (fuente instanceof HTMLImageElement ? fuente.naturalHeight : video.videoHeight || 480);

    /* La cámara: la de atrás del celular por omisión, o la que se elija (una
     * computadora puede tener varias cámaras USB). Los nombres de las
     * cámaras el navegador solo los da después del primer permiso, así que
     * la lista se arma después de abrir una. La elegida se recuerda. */
    const CAMARA = delPuesto("camara_dispositivo_v1");
    async function abrirCamara(id) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            avisar("Este navegador no deja usar la cámara desde la página. Prueba con Chrome o Safari al día.", "error");
            return;
        }
        if (typeof id !== "string") { try { id = localStorage.getItem(CAMARA) || ""; } catch (e) { id = ""; } }
        if (video.srcObject) { video.srcObject.getTracks().forEach((x) => x.stop()); video.srcObject = null; }
        const pedir = (conId) => navigator.mediaDevices.getUserMedia({ audio: false, video: conId
            ? { deviceId: { exact: conId }, width: { ideal: 1920 } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 1920 } } });
        try {
            let flujo;
            try { flujo = await pedir(id); } catch (e) {
                if (!id || e.name === "NotAllowedError") throw e;
                flujo = await pedir(""); // la que se recordaba ya no está conectada
            }
            video.srcObject = flujo;
            await video.play();
            mantenerEncendida();
            const pista = flujo.getVideoTracks()[0];
            const usada = pista && pista.getSettings ? pista.getSettings().deviceId || "" : "";
            try { if (usada) localStorage.setItem(CAMARA, usada); } catch (e) { /* sin almacenamiento */ }
            const misma = fuente === video && lienzo.width && video.videoWidth && Math.abs(lienzo.height / lienzo.width - video.videoHeight / video.videoWidth) < 0.01;
            if (!misma) nuevaFuente(video, video.videoWidth || 640, video.videoHeight || 480);
            else fuente = video;
            listarCamaras(usada);
        } catch (e) {
            avisar(e && e.name === "NotAllowedError"
                ? "No se dio permiso para usar la cámara. Actívalo en los permisos del sitio y vuelve a tocar «Abrir la cámara»."
                : "No se pudo abrir la cámara (" + (e && e.name || "error") + "). Si otra aplicación la está usando, ciérrala y vuelve a intentar.", "error");
        }
    }
    /* Que el celular no apague la pantalla a mitad de la partida: si se
     * apaga, la cámara se corta y la mesa deja de transmitir sin avisar.
     * El navegador suelta el pedido cuando la pestaña se esconde; al volver
     * se pide de nuevo. Si no lo deja (batería baja, navegador viejo), sigue
     * igual: el celular decide. */
    let pantalla = null;
    async function mantenerEncendida() {
        if (pantalla || !("wakeLock" in navigator) || !video.srcObject || document.visibilityState !== "visible") return;
        try {
            pantalla = await navigator.wakeLock.request("screen");
            $("pantalla-encendida").hidden = false;
            pantalla.addEventListener("release", () => { pantalla = null; });
        } catch (e) { /* sin permiso: sigue igual */ }
    }
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") mantenerEncendida(); });

    async function listarCamaras(usada) {
        let todas = [];
        try { todas = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput"); } catch (e) { /* sin lista */ }
        const sel = $("camara-elegir");
        sel.textContent = "";
        todas.forEach((d, i) => {
            const o = document.createElement("option");
            o.value = d.deviceId;
            o.textContent = d.label || "Cámara " + (i + 1);
            sel.append(o);
        });
        sel.value = usada || "";
        $("camara-elegir-caja").hidden = todas.length < 2;
    }

    function usarFoto(archivo) {
        if (!archivo) return;
        const img = new Image();
        img.onload = () => {
            if (video.srcObject) { video.srcObject.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
            if (pantalla) { pantalla.release().catch(() => {}); pantalla = null; $("pantalla-encendida").hidden = true; }
            /* Otra foto del mismo tamaño, tomada desde el mismo lugar: se
             * conservan las esquinas, la calibración y la partida. Así se
             * prueba una partida foto a foto, sin cámara en vivo. */
            if (fuente instanceof HTMLImageElement && fuente.naturalWidth === img.naturalWidth && fuente.naturalHeight === img.naturalHeight) {
                fuente = img;
                for (const t of tableros) t.recientes = [];
                return;
            }
            nuevaFuente(img, img.naturalWidth, img.naturalHeight);
        };
        img.onerror = () => avisar("No se pudo abrir esa foto. Prueba con otra en JPG o PNG.", "error");
        img.src = URL.createObjectURL(archivo);
    }

    function rehacerHomografia(t) {
        t = t || T();
        t.h = t.esquinas.length === 4 ? homografia(ESQUINAS_TABLERO, t.esquinas) : null;
        t.recientes = []; t.quieta = null;
        botones();
    }

    /* ── El segundo tablero (opcional) ──────────────────────────────────
     * Al encenderlo, la imagen se trabaja más grande y las esquinas del
     * primero se agrandan con ella: su calibración sigue valiendo (lo que
     * se mide es la luz de cada casilla, no su tamaño). */
    function cambiarCantidad(n) {
        const f = ANCHO[n - 1] / lienzo.width;
        if (n === 2 && !dos()) tableros.push(nuevoTablero(1));
        if (n === 1 && dos()) { pararVivo(tableros[1]); tableros.length = 1; }
        if (fuente) {
            tamano(anchoFuente(), altoFuente());
            for (const t of tableros) {
                t.esquinas = t.esquinas.map(([x, y]) => [x * f, y * f]);
                const cal = t.cal;
                rehacerHomografia(t);
                t.cal = cal;
            }
        }
        elegirTablero(n === 2 ? 1 : 0);
        $("pestanas").hidden = n === 1;
        if (n === 2) avisar("Segundo tablero encendido. Con dos, cada casilla se ve más chica: lo más confiable sigue siendo un celular por tablero, desde arriba. " + (fuente ? "Ahora busca o marca el tablero 2." : ""));
    }

    function elegirTablero(i) {
        activo = i;
        $("dudas").hidden = true;
        elegida = 0;
        document.querySelectorAll("[data-tablero]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.tablero) === i)));
        $("t-tablero-cual").textContent = dos() ? " (tablero " + (i + 1) + ")" : "";
        $("vivo-blancas").value = T().nombres.blancas;
        $("vivo-negras").value = T().nombres.negras;
        pintarPartida();
        pintarVivo();
        pintarTorneo();
        botones();
        $("acierto").textContent = T().lectura ? (64 - diferentes(T().lectura, esperada(T().juego)).length) + " de 64" : "—";
    }

    function imagenGris() {
        cctx.drawImage(fuente, 0, 0, limpio.width, limpio.height);
        return D.gris(cctx.getImageData(0, 0, limpio.width, limpio.height).data, limpio.width, limpio.height);
    }

    /* Las esquinas puestas a ojo se corren solas hasta donde calzan las líneas
     * del tablero. Si no mejora, se quedan donde estaban. */
    function ajustarEsquinas(silencioso) {
        const t = T();
        if (t.esquinas.length !== 4 || !fuente) return;
        const img = imagenGris();
        const antes = D.ordenar(t.esquinas);
        const r = D.ajustar(img, antes);
        if (r.puntaje >= D.puntaje(img, antes, D.FINO)) {
            t.esquinas = r.esquinas;
            t.cal = null;
            rehacerHomografia(t);
        }
        const bien = D.hayTablero(r);
        if (!silencioso) avisar(cual(t) + (bien
            ? "Esquinas ajustadas a las líneas del tablero. Revisa que la cuadrícula calce y, con las piezas en la posición inicial, toca «Calibrar»."
            : "Las esquinas se corrieron lo que se pudo, pero las líneas del tablero se ven poco. Revisa la cuadrícula; si no calza, arrastra las esquinas."), bien ? "bien" : "error");
    }

    async function buscarTablero() {
        if (!fuente || buscando) return;
        const t = T();
        buscando = true;
        botones();
        avisar(cual(t) + "Buscando el tablero… 0 %");
        try {
            // El otro tablero, si ya está, se tapa: si no, lo volvería a encontrar.
            const excluir = tableros.filter((o) => o !== t && o.h).map((o) => o.esquinas);
            const r = await D.buscar(imagenGris(), (f) => avisar(cual(t) + "Buscando el tablero… " + Math.round(f * 100) + " %"), { excluir });
            if (!r) {
                avisar(cual(t) + "No encontré el tablero. Pon el celular más encima del tablero, con buena luz y el tablero entero en la imagen, o marca tú las cuatro esquinas.", "error");
                return;
            }
            t.esquinas = r.esquinas;
            t.ajustada = true;
            t.cal = null;
            rehacerHomografia(t);
            avisar(cual(t) + "Encontré el tablero. Revisa que la cuadrícula calce con las casillas (si no, arrastra las esquinas) y, con las piezas en la posición inicial, toca «Calibrar».", "bien");
        } finally {
            buscando = false;
            botones();
        }
    }

    function punto(e) {
        const r = lienzo.getBoundingClientRect();
        return [(e.clientX - r.left) * lienzo.width / r.width, (e.clientY - r.top) * lienzo.height / r.height];
    }

    /* Tocar pone una esquina nueva del tablero elegido (o agarra la más
     * cercana) y, con el dedo apretado, se mueve con la lupa. Al soltar la
     * cuarta, se ajustan solas. */
    lienzo.addEventListener("pointerdown", (e) => {
        if (!fuente) return;
        const t = T(), p = punto(e);
        let mejor = -1, dist = 40 * lienzo.width / lienzo.getBoundingClientRect().width;
        t.esquinas.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < dist) { dist = d; mejor = i; } });
        if (mejor < 0 && t.esquinas.length < 4) { t.esquinas.push(p); mejor = t.esquinas.length - 1; rehacerHomografia(t); }
        if (mejor < 0) return;
        arrastre = mejor; elegida = mejor;
        try { lienzo.setPointerCapture(e.pointerId); } catch (x) { /* el puntero ya se soltó */ }
    });
    lienzo.addEventListener("pointermove", (e) => {
        if (arrastre < 0) return;
        const t = T();
        t.esquinas[arrastre] = punto(e);
        t.cal = null;
        rehacerHomografia(t);
    });
    lienzo.addEventListener("pointerup", () => {
        if (arrastre < 0) return;
        arrastre = -1;
        const t = T();
        if (t.esquinas.length === 4 && !t.h) return;
        if (t.esquinas.length === 4 && !t.cal && !t.ajustada) {
            t.ajustada = true; // solo la primera vez: después manda quien arrastra
            ajustarEsquinas(true);
        }
        pedirEsquina();
    });
    lienzo.addEventListener("keydown", (e) => {
        const t = T();
        if (/^[1-4]$/.test(e.key) && t.esquinas.length > Number(e.key) - 1) { elegida = Number(e.key) - 1; e.preventDefault(); return; }
        const paso = e.shiftKey ? 10 : 2;
        const mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
        if (!mov || !t.esquinas[elegida]) return;
        e.preventDefault();
        t.esquinas[elegida] = [t.esquinas[elegida][0] + mov[0], t.esquinas[elegida][1] + mov[1]];
        t.cal = null;
        rehacerHomografia(t);
    });

    /* Calibrar también decide cuál esquina es a1: prueba las cuatro maneras
     * de girar el tablero y se queda con la que mejor ve la posición que se
     * sabe que hay. Las piezas blancas tienen que ser las CLARAS: si no, el
     * tablero está dado vuelta (con media vuelta, la posición inicial también
     * se lee perfecta). Si ya había un a1, a igualdad gana el giro que lo deja
     * más cerca: la cámara se movió, no se dio vuelta el tablero.
     *
     * `sabida` es la posición en 64 letras: la inicial para empezar una
     * partida, la de la partida para seguirla después de mover la cámara.
     * Devuelve cuántas casillas lee bien, o null si no alcanza. */
    function calibrarCon(t, sabida) {
        if (t.esquinas.length !== 4) return null;
        cctx.drawImage(fuente, 0, 0, limpio.width, limpio.height);
        const pix = cctx.getImageData(0, 0, limpio.width, limpio.height).data;
        const base = D.ordenar(t.esquinas);
        const hayDos = sabida.includes("B") && sabida.includes("N");
        let mejor = null;
        for (let k = 0; k < 4; k++) {
            const q = D.girar(base, k), hk = homografia(ESQUINAS_TABLERO, q);
            if (!hk) continue;
            const todas = muestras(pix, limpio.width, limpio.height, hk);
            const c = calibrar(todas, sabida);
            const bien = 64 - diferentes(leer(todas, c), sabida).length;
            const claras = !hayDos || (c.blanca[true] + c.blanca[false]) - (c.negra[true] + c.negra[false]) > 0;
            const cerca = t.a1 ? Math.hypot(q[0][0] - t.a1[0], q[0][1] - t.a1[1]) / 1e4 : 0;
            const valor = bien + (claras ? 0.5 : 0) - cerca;
            if (!mejor || valor > mejor.valor) mejor = { valor, bien, q, hk, c, claras };
        }
        if (!mejor || mejor.bien < 48 || !mejor.claras) return mejor ? -mejor.bien - 1 : null;
        t.esquinas = mejor.q; t.h = mejor.hk; t.cal = mejor.c; t.a1 = mejor.q[0].slice();
        t.recientes = []; t.quieta = null;
        return mejor.bien;
    }

    function hacerCalibrar() {
        const t = T();
        const bien = calibrarCon(t, INICIAL);
        if (bien === null || bien < 0) {
            avisar(cual(t) + "Con estas esquinas no se ve una posición inicial (" + (bien === null ? 0 : -bien - 1) + " de 64 casillas). Revisa que la cuadrícula calce y que estén todas las piezas en su lugar.", "error");
            return;
        }
        t.juego = new window.Chess();
        t.resultadoMano = null;
        t.inicio = Date.now(); t.horas = []; t.horaResultado = null;
        if (torneo) { t.ronda = ultimaRonda(); pintarTorneo(); } // la partida nueva es de la ronda de ahora
        partidaCambio(t);
        avisar(cual(t) + "Calibrado: lee bien " + bien + " de 64 casillas en la posición inicial. Ya puedes jugar.", "bien");
    }

    /* Seguir la partida que ya está anotada (o la posición que se cargó),
     * después de mover la cámara o de volver a abrir la página: las piezas
     * tienen que estar como en el tablero digital. No se pierde nada. */
    function seguirPartida() {
        const t = T();
        const bien = calibrarCon(t, esperada(t.juego));
        if (bien === null || bien < 0) {
            avisar(cual(t) + "Con estas esquinas no se ve la posición del tablero digital (" + (bien === null ? 0 : -bien - 1) + " de 64 casillas). Revisa que la cuadrícula calce y que las piezas estén como a la derecha.", "error");
            return;
        }
        pintarPartida();
        avisar(cual(t) + "Listo, sigo con la partida: lee bien " + bien + " de 64 casillas. " + V.comoVa(t.juego), "bien");
    }

    /* Si la cámara se movió un poco (un golpe al trípode), casi todo deja de
     * calzar de golpe. Se intenta solo: correr las esquinas a las líneas y
     * volver a calibrar con la partida. Si no alcanza, se dice qué hacer. */
    function recuperar(t) {
        if (!fuente || t.esquinas.length !== 4) return false;
        const img = imagenGris();
        const r = D.ajustar(img, D.ordenar(t.esquinas));
        if (!D.hayTablero(r)) return false;
        const antes = { esquinas: t.esquinas, h: t.h, cal: t.cal };
        t.esquinas = r.esquinas;
        const bien = calibrarCon(t, esperada(t.juego));
        if (bien === null || bien < 56) { Object.assign(t, antes); return false; }
        return true;
    }

    /* Lo que cambia la partida: se pinta, se transmite y se guarda en el
     * celular (si la página se recarga, se ofrece seguirla). */
    function partidaCambio(t) {
        const r = resultadoDe(t);
        if (r && !t.horaResultado) t.horaResultado = Date.now();
        if (!r) t.horaResultado = null;
        if (t === T()) pintarPartida();
        enviarVivo(t);
        try {
            localStorage.setItem(PARTIDA + t.i, V.pgn(t.juego, r));
            localStorage.setItem(PARTIDA + t.i + "_horas", JSON.stringify({ inicio: t.inicio, horas: t.horas }));
        } catch (e) { /* sin almacenamiento */ }
    }

    function anotar(t, jugadas) {
        t.resultadoMano = null; // si se siguió jugando, no había terminado
        jugadas.forEach((x) => { t.juego.move(x); t.horas.push(Date.now()); });
        t.recientes = [];
        $("dudas").hidden = true;
        partidaCambio(t);
        const corona = jugadas.some((x) => /=Q/.test(x));
        avisar(cual(t) + (jugadas.length === 2 ? "Se escapó una jugada: se anotaron " + jugadas.map(es).join(" y ") : "Se anotó " + es(jugadas[0])) + "." + (corona ? " Coronó: se anotó dama; si fue otra pieza, deshazla y anótala a mano." : ""), "bien");
    }

    /* Una lectura quieta que no es la esperada: se busca la jugada. */
    function revisar(t, lectura, seguridad) {
        const antes = esperada(t.juego);
        if (lectura === antes) return;
        const r = decidir(t.juego, lectura, seguridad);
        if (r && r.jugadas) { anotar(t, r.jugadas); return; }
        if (r && r.dudas) {
            // Dos o tres parecidas: que la persona elija, con un toque.
            const caja = $("dudas-botones");
            caja.textContent = "";
            r.dudas.forEach((js) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                b.textContent = js.map(es).join(" y ");
                b.addEventListener("click", () => anotar(t, js));
                caja.append(b);
            });
            $("dudas").hidden = false;
            avisar(cual(t) + "No estoy seguro de cuál fue: elige la jugada abajo, o escríbela.", "error");
            return;
        }
        const cambiaron = diferentes(lectura, antes);
        if (cambiaron.length >= 10) {
            if (recuperar(t)) { avisar(cual(t) + "La cámara se movió: el tablero se volvió a ubicar y la partida sigue.", "bien"); return; }
            avisar(cual(t) + "Parece que la cámara se movió. Toca «Buscar el tablero» (o marca las esquinas) y después «Seguir con esta partida»: no se pierde nada de lo anotado.", "error");
            return;
        }
        // Una o dos piezas en otro lugar sin que salga ninguna jugada legal:
        // puede ser una jugada ilegal. En un torneo se le avisa al árbitro de
        // Pareo Integral (sin decir qué casillas: eso sería pasar la jugada).
        const alArbitro = alertarArbitro(t);
        avisar(cual(t) + "No reconozco lo que cambió en " + cambiaron.join(", ") + ": puede ser una jugada ilegal o una pieza fuera de lugar. Si fue una jugada, escríbela abajo; si es la luz o una pieza movida sin querer, déjala como estaba." + (alArbitro ? " Se le avisó al árbitro." : ""), "error");
    }

    function pintarPartida() {
        const juego = T().juego;
        V.pintar($("tablero"), juego);
        $("fen").textContent = juego.fen();
        $("como-va").textContent = V.comoVa(juego);
        const hist = juego.history();
        $("jugadas").textContent = V.jugadasTexto(juego) || "Todavía ninguna.";
        $("btn-deshacer").disabled = !hist.length;
        $("btn-copiar").disabled = !hist.length;
        pintarResultado();
    }
    function pintarResultado() {
        const t = T(), r = resultadoDe(t);
        $("resultado-texto").textContent = r ? V.textoResultado(r) + (V.resultadoSolo(t.juego) ? " Lo dice el tablero." : "") : "Sigue en juego.";
        document.querySelectorAll("[data-resultado]").forEach((b) => { if (b.dataset.resultado) b.setAttribute("aria-pressed", String(b.dataset.resultado === r)); });
    }

    /* ── Transmitir en vivo ─────────────────────────────────────────────
     * Cada tablero con su código y su enlace; en un torneo, todos con el
     * código del torneo y su mesa. Solo manda: la partida entera cada vez que
     * cambia, y a quien recién llega y la pide («pedir»). Nunca toma nada de
     * lo que llega por el canal: lo que pasa en el tablero lo decide la
     * cámara. Un canal por código (con dos tableros del mismo torneo, uno
     * solo que contesta por los dos). */
    const canales = new Map(); // código → canal
    function codigoGuardado(t) {
        try { const c = localStorage.getItem(GUARDADO[t.i]); return V.codigoValido(c) ? c : null; } catch (e) { return null; }
    }
    function guardarCodigo(t, c) { try { localStorage.setItem(GUARDADO[t.i], c); } catch (e) { /* sin almacenamiento: un código por visita */ } }

    /* El retraso de la transmisión (lo elige quien transmite: nada, 5, 10,
     * 15 o 30 minutos), contra la ayuda desde afuera: se manda la partida
     * con las jugadas que tienen ya ese tiempo. Sale de la hora de cada
     * jugada, así que vale también después de recargar la página. Cuando la
     * partida termina, se manda entera: ya no hay a quién ayudar. */
    let retraso = 0;
    function vistaVivo(t) {
        const r = resultadoDe(t), total = t.juego.history().length, ahora = Date.now();
        let k = total, corte = ahora;
        if (retraso && !r) {
            corte = ahora - retraso * 60000;
            k = 0;
            while (k < total && !(t.horas[k] > corte)) k++; // sin hora: ya pasó hace rato
        }
        const base = k ? t.horas[k - 1] : t.inicio;
        return { juego: k === total ? t.juego : V.hasta(t.juego, k), resultado: k === total ? r : null, n: k, espera: base ? corte - base : null };
    }
    function enviarVivo(t) {
        if (!t.vivo) return;
        const canal = canales.get(t.vivo.codigo);
        if (!canal) return;
        const v = vistaVivo(t);
        t.enviadas = v.n;
        canal.send({ type: "broadcast", event: "estado", payload: V.estado(v.juego, nombresDe(t), dondeDe(t), v.resultado,
            { tiempos: tiemposDe(t).slice(0, v.n), espera: v.espera, retraso }) });
    }
    // Con retraso, las jugadas van saliendo solas a medida que cumplen su tiempo.
    setInterval(() => { if (retraso) for (const t of tableros) if (t.vivo && vistaVivo(t).n !== t.enviadas) enviarVivo(t); }, 5000);
    function alertarArbitro(t) {
        const canal = t.vivo && canales.get(t.vivo.codigo), donde = dondeDe(t);
        if (!canal || !donde) return false;
        canal.send({ type: "broadcast", event: "alerta", payload: { v: 1, torneo: donde.torneo, ronda: donde.ronda, mesa: donde.mesa, t: Date.now() } });
        return true;
    }
    const RETRASO = delPuesto("camara_retraso_v1");
    function elegirRetraso(min, guardar) {
        retraso = [0, 5, 10, 15, 30].includes(min) ? min : 0;
        $("vivo-retraso").value = String(retraso);
        if (guardar) {
            try {
                if (torneo) { torneo.retraso = retraso; localStorage.setItem(TORNEO, JSON.stringify({ id: torneo.id, codigo: torneo.codigo, retraso })); }
                else localStorage.setItem(RETRASO, String(retraso));
            } catch (e) { /* sin almacenamiento */ }
        }
        for (const t of tableros) enviarVivo(t);
        pintarVivo();
    }

    function empezarVivo(t, codigo) {
        pararVivo(t);
        t.vivo = { codigo };
        if (!canales.has(codigo)) {
            const canal = window.sb.channel(V.canal(codigo));
            canal.on("broadcast", { event: "pedir" }, () => tableros.filter((o) => o.vivo && o.vivo.codigo === codigo).forEach(enviarVivo));
            canal.subscribe((st) => { if (st === "SUBSCRIBED") tableros.filter((o) => o.vivo && o.vivo.codigo === codigo).forEach(enviarVivo); });
            canales.set(codigo, canal);
        } else enviarVivo(t);
        if (!torneo) guardarCodigo(t, codigo);
        pintarVivo();
    }
    function pararVivo(t) {
        const codigo = t.vivo && t.vivo.codigo;
        t.vivo = null;
        if (codigo && !tableros.some((o) => o.vivo && o.vivo.codigo === codigo)) {
            try { window.sb.removeChannel(canales.get(codigo)); } catch (e) { /* ya cerrado */ }
            canales.delete(codigo);
        }
        pintarVivo();
    }
    function pintarVivo() {
        const t = T();
        $("vivo-apagado").hidden = !!t.vivo;
        $("vivo-encendido").hidden = !t.vivo;
        $("btn-vivo-nuevo").hidden = !!torneo; // en un torneo, el código es el del torneo
        if (!t.vivo) return;
        const url = V.enlace(t.vivo.codigo, torneo && torneo.id);
        const a = $("vivo-enlace");
        a.href = url; a.textContent = url;
        $("vivo-codigo").textContent = t.vivo.codigo + (torneo && t.mesa ? " · mesa " + t.mesa : "") + (retraso ? " · con " + retraso + " minutos de retraso" : "");
        $("vivo-whatsapp").href = "https://wa.me/?text=" + encodeURIComponent((torneo ? "Mira el torneo en vivo: " : "Mira la partida en vivo: ") + url);
        const qr = $("vivo-qr");
        qr.textContent = "";
        const svg = window.QrSvg && window.QrSvg.dibujar(url, torneo ? "Código QR para ver el torneo en vivo" : "Código QR para ver la partida en vivo");
        if (svg) qr.append(svg);
    }

    /* ── Un torneo de Pareo Integral ────────────────────────────────────
     * La cámara queda fija en una MESA (física): en cada ronda se sientan
     * otros. Los nombres salen del torneo publicado, de la ronda en que se
     * calibró la partida; cuando Pareo empareja la ronda siguiente, se avisa
     * para empezar la partida nueva. Se vuelve a leer el torneo cada minuto. */
    const TORNEO = "camara_torneo_v1", MESA = delPuesto("camara_mesa_v1") + "_";
    let torneo = null; // { id, nombre, datos, codigo }
    let relojTorneo = null;

    function nombresDe(t) {
        if (torneo && t.mesa) {
            const r = V.mesasDe(torneo.datos, t.ronda);
            const m = r && r.mesas.find((x) => x.mesa === t.mesa);
            if (m) return { blancas: m.blancas, negras: m.negras };
        }
        return t.nombres;
    }
    const dondeDe = (t) => (torneo && t.mesa ? { torneo: torneo.id, ronda: t.ronda || ultimaRonda(), mesa: t.mesa } : null);
    const ultimaRonda = () => { const r = torneo && V.mesasDe(torneo.datos); return r ? r.ronda : null; };

    async function leerTorneo(id) {
        const { data, error } = await window.sb.from("pareo_publicados").select("id,nombre,datos").eq("id", id).maybeSingle();
        if (error) throw error;
        return data;
    }

    async function usarTorneo(id, codigo) {
        let fila;
        try { fila = await leerTorneo(id); } catch (e) { avisar("No se pudo leer el torneo. Revisa la conexión y vuelve a intentar.", "error"); return; }
        if (!fila) { avisar("No encuentro ese torneo en Torneos en Pareo Integral. Revisa el enlace.", "error"); return; }
        if (!V.mesasDe(fila.datos)) {
            avisar(fila.datos && fila.datos.tipo === "equipos" ? "Los torneos por equipos todavía no se pueden transmitir desde la cámara." : "Ese torneo todavía no tiene ninguna ronda emparejada.", "error");
            return;
        }
        torneo = { id: fila.id, nombre: fila.nombre || (fila.datos && fila.datos.nombre) || "Torneo", datos: fila.datos, codigo: V.codigoValido(codigo) ? codigo : V.nuevoCodigo() };
        // El retraso es del torneo (todas sus cámaras igual): el que ya tenía, si es el mismo.
        let antes = null;
        try { antes = JSON.parse(localStorage.getItem(TORNEO) || "null"); } catch (e) { /* nada */ }
        torneo.retraso = antes && antes.id === torneo.id && antes.retraso ? antes.retraso : retraso;
        try { localStorage.setItem(TORNEO, JSON.stringify({ id: torneo.id, codigo: torneo.codigo, retraso: torneo.retraso })); } catch (e) { /* sin almacenamiento */ }
        retraso = torneo.retraso; $("vivo-retraso").value = String(retraso);
        for (const t of tableros) {
            let m = null;
            try { m = Number(localStorage.getItem(MESA + t.i)) || null; } catch (e) { /* sin almacenamiento */ }
            t.mesa = m; t.ronda = t.ronda || ultimaRonda();
        }
        pintarTorneo();
        clearInterval(relojTorneo);
        relojTorneo = setInterval(refrescarTorneo, 60000);
        // Lo que ya se transmitía pasa al canal del torneo.
        for (const t of tableros) if (t.vivo) empezarVivo(t, torneo.codigo);
        avisar("Torneo elegido: " + torneo.nombre + ". Elige en qué mesa está esta cámara.", "bien");
    }

    async function refrescarTorneo() {
        if (!torneo) return;
        let fila;
        try { fila = await leerTorneo(torneo.id); } catch (e) { return; /* se vuelve a intentar al minuto */ }
        if (!fila || !V.mesasDe(fila.datos)) return;
        const antes = ultimaRonda();
        torneo.datos = fila.datos;
        const ahora = ultimaRonda();
        pintarTorneo();
        if (ahora > antes) {
            const t = T(), m = t.mesa && V.mesasDe(torneo.datos).mesas.find((x) => x.mesa === t.mesa);
            avisar("Empezó la ronda " + ahora + (m ? ": en la mesa " + t.mesa + " juegan " + m.blancas + " y " + m.negras : "") + ". Pon las piezas en la posición inicial y toca «Calibrar con la posición inicial».", "bien");
        }
    }

    function dejarTorneo() {
        torneo = null;
        clearInterval(relojTorneo);
        try { localStorage.removeItem(TORNEO); } catch (e) { /* sin almacenamiento */ }
        for (const t of tableros) { if (t.vivo) pararVivo(t); t.mesa = null; }
        pintarTorneo();
    }

    function elegirMesa(n) {
        const t = T();
        t.mesa = n || null;
        try { if (t.mesa) localStorage.setItem(MESA + t.i, String(t.mesa)); else localStorage.removeItem(MESA + t.i); } catch (e) { /* sin almacenamiento */ }
        pintarTorneo(); // los nombres de esta mesa, en la ronda de la partida que se anota
        enviarVivo(t);
        pintarVivo();
    }

    function pintarTorneo() {
        $("torneo-elegir").hidden = !!torneo;
        $("torneo-elegido").hidden = !torneo;
        const conTorneo = !!(torneo && T().mesa);
        $("vivo-blancas").readOnly = conTorneo;
        $("vivo-negras").readOnly = conTorneo;
        if (!torneo) return;
        $("torneo-nombre").textContent = torneo.nombre;
        const r = V.mesasDe(torneo.datos);
        $("torneo-ronda").textContent = String(r.ronda);
        $("torneo-codigo").value = torneo.codigo;
        const sel = $("torneo-mesa");
        sel.textContent = "";
        const vacia = document.createElement("option");
        vacia.value = ""; vacia.textContent = "Elige la mesa…";
        sel.append(vacia);
        r.mesas.forEach((m) => {
            const o = document.createElement("option");
            o.value = String(m.mesa);
            o.textContent = "Mesa " + m.mesa + ": " + m.blancas + " – " + m.negras;
            sel.append(o);
        });
        sel.value = T().mesa ? String(T().mesa) : "";
        if (T().mesa) { const nm = nombresDe(T()); $("vivo-blancas").value = nm.blancas || ""; $("vivo-negras").value = nm.negras || ""; }
    }

    /* Un QR por mesa, para pegarlo en la mesa: se escanea con el celular que
     * va encima y la cámara se abre con el torneo, el código y la mesa puestos
     * (y empieza a transmitir). Va después del # (no llega al servidor):
     * «camara-tablero.html#t=<id del torneo>&c=<código>&m=<mesa>&r=<retraso>».
     * Con el QR la cámara anda SIN CUENTA, en «modo mesa» (ver init). La hoja
     * sale solo al imprimir, con la marca de agua de Ajedrez Integral. */
    const enlaceMesa = (n) => new URL("camara-tablero.html#t=" + torneo.id + "&c=" + torneo.codigo + "&m=" + n + "&r=" + retraso, location.href).href;
    function deLaDireccion() {
        const x = new URLSearchParams(location.hash.replace(/^#/, ""));
        const id = V.torneoDe(x.get("t")), c = (x.get("c") || "").toLowerCase(), m = Number(x.get("m")), r = Number(x.get("r")) || 0;
        return id && V.codigoValido(c) && Number.isInteger(m) && m >= 1 && m <= 999 ? { id, codigo: c, mesa: m, retraso: r } : null;
    }
    function imprimirQr() {
        if (!torneo) return;
        const r = V.mesasDe(torneo.datos);
        const hoja = $("hoja-qr");
        hoja.textContent = "";
        const el = (tag, clase, texto) => { const e = document.createElement(tag); e.className = clase; if (texto) e.textContent = texto; return e; };
        for (const m of r.mesas) {
            const tarjeta = el("div", "hoja-qr-mesa");
            tarjeta.dataset.enlace = enlaceMesa(m.mesa);
            const qr = el("div", "hoja-qr-codigo");
            const svg = window.QrSvg && window.QrSvg.dibujar(enlaceMesa(m.mesa), "Código QR de la cámara de la mesa " + m.mesa);
            if (svg) qr.append(svg);
            tarjeta.append(el("p", "hoja-qr-numero", "Mesa " + m.mesa), el("p", "hoja-qr-torneo", torneo.nombre), qr,
                el("p", "hoja-qr-ayuda", "Escanéalo con el celular que va encima de esta mesa, sin cuenta: la cámara se abre en esta mesa y transmite."));
            hoja.append(tarjeta);
        }
        document.body.classList.add("imprimir-qr");
        window.print();
    }
    window.addEventListener("afterprint", () => document.body.classList.remove("imprimir-qr"));

    /* Los torneos que se juegan estos días, para no tener que pegar el
     * enlace: los publicados con fecha de hace tres días a mañana, en hora
     * de Costa Rica. */
    async function torneosDeEstosDias() {
        const H = window.HoraCR, hoy = H.hoy();
        const { data, error } = await window.sb.from("pareo_publicados").select("id,nombre,fecha,rondas")
            .gte("fecha", H.sumarDias(hoy, -3)).lte("fecha", H.sumarDias(hoy, 1)).eq("oculto", false)
            .order("fecha", { ascending: false }).range(0, 49);
        if (error) return [];
        return (data || []).filter((x) => x.rondas > 0);
    }
    async function pintarListaTorneos() {
        const caja = $("torneo-lista");
        caja.textContent = "";
        const lista = await torneosDeEstosDias();
        if (!lista.length) { caja.textContent = "No hay torneos con rondas emparejadas estos días: pega el enlace del torneo."; return; }
        for (const x of lista) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "text-left bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            b.textContent = x.nombre + " · ronda " + x.rondas;
            b.addEventListener("click", () => usarTorneo(x.id, $("torneo-codigo-unirse").value.trim().toLowerCase()));
            caja.append(b);
        }
    }

    /* ── Dibujar ──────────────────────────────────────────────────────── */
    function lupa(p) {
        const R = 70, Z = 3;
        const lx = p[0] > lienzo.width / 2 ? R + 8 : lienzo.width - R - 8, ly = R + 8;
        ctx.save();
        ctx.beginPath(); ctx.arc(lx, ly, R, 0, 2 * Math.PI); ctx.clip();
        ctx.drawImage(limpio, p[0] - R / Z, p[1] - R / Z, 2 * R / Z, 2 * R / Z, lx - R, ly - R, 2 * R, 2 * R);
        ctx.strokeStyle = "#facc15"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(lx - R, ly); ctx.lineTo(lx + R, ly); ctx.moveTo(lx, ly - R); ctx.lineTo(lx, ly + R); ctx.stroke();
        ctx.restore();
        ctx.beginPath(); ctx.arc(lx, ly, R, 0, 2 * Math.PI); ctx.lineWidth = 3; ctx.strokeStyle = "#ffffff"; ctx.stroke();
    }

    function leerTableros(ahora) {
        if (ahora - ultimaMirada < CADA_MS * 0.9 || !tableros.some((t) => t.h && t.cal)) return;
        ultimaMirada = ahora;
        const pix = cctx.getImageData(0, 0, limpio.width, limpio.height).data;
        for (const t of tableros) {
            if (!t.h || !t.cal) continue;
            const det = leerDetalle(muestras(pix, limpio.width, limpio.height, t.h), t.cal);
            t.lectura = det.lectura; t.seguridad = det.seguridad;
            t.recientes.push(t.lectura);
            if (t.recientes.length > QUIETA) t.recientes.shift();
            if (t.recientes.length === QUIETA && t.recientes.every((x) => x === t.lectura) && t.lectura !== t.quieta) {
                t.quieta = t.lectura;
                revisar(t, t.lectura, t.seguridad);
            }
        }
        const t = T();
        if (t.lectura) $("acierto").textContent = (64 - diferentes(t.lectura, esperada(t.juego)).length) + " de 64";
    }

    function dibujarTablero(t) {
        const propio = t === T();
        if (t.h) {
            ctx.strokeStyle = COLOR[t.i];
            ctx.lineWidth = propio ? 1.5 : 1;
            for (let i = 0; i <= 8; i++) {
                ctx.beginPath(); ctx.moveTo(...aplicar(t.h, i, 0)); ctx.lineTo(...aplicar(t.h, i, 8)); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(...aplicar(t.h, 0, i)); ctx.lineTo(...aplicar(t.h, 8, i)); ctx.stroke();
            }
            if (t.cal && t.lectura) {
                const esp = esperada(t.juego);
                ctx.font = "bold 13px sans-serif";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                for (let k = 0; k < 64; k++) {
                    const [x, y] = aplicar(t.h, (k & 7) + 0.5, (k >> 3) + 0.5);
                    const mal = t.lectura[k] !== esp[k];
                    const txt = (t.lectura[k] === "." ? "·" : t.lectura[k]) + (mal ? "!" : "");
                    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
                    ctx.fillRect(x - 11, y - 9, 22, 18);
                    if (mal) { ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2; ctx.strokeRect(x - 11, y - 9, 22, 18); }
                    ctx.fillStyle = "#ffffff";
                    ctx.fillText(txt, x, y + 1);
                }
            }
            // Con dos tableros, cada cuadrícula dice cuál es (no solo por el color).
            if (dos()) {
                const [x, y] = aplicar(t.h, 4, 4);
                ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
                ctx.fillRect(x - 14, y - 14, 28, 28);
                ctx.strokeStyle = COLOR[t.i]; ctx.lineWidth = 3; ctx.strokeRect(x - 14, y - 14, 28, 28);
                ctx.fillStyle = "#ffffff"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(String(t.i + 1), x, y + 1);
            }
        }
        // Las esquinas: con su nombre cuando ya se sabe cuál es cuál (después de calibrar).
        t.esquinas.forEach((p, i) => {
            const ella = propio && i === elegida;
            ctx.beginPath(); ctx.arc(p[0], p[1], 12, 0, 2 * Math.PI);
            ctx.fillStyle = ella ? "#facc15" : "rgba(0, 0, 0, 0.8)"; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = propio ? "#ffffff" : COLOR[t.i]; ctx.stroke();
            ctx.fillStyle = ella ? "#000000" : "#ffffff";
            ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(t.cal ? NOMBRE[i] : String(i + 1), p[0], p[1] + 1);
        });
    }

    /* Antes de abrir la cámara, el recuadro no queda negro: dice qué va ahí,
     * con un tablero dibujado de muestra. */
    function sinImagen() {
        lienzo.width = 640; lienzo.height = 400;
        ctx.fillStyle = "#102a43";
        ctx.fillRect(0, 0, 640, 400);
        const lado = 200, x0 = 220, y0 = 40, c = lado / 8;
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
            ctx.fillStyle = (r + f) % 2 ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.05)";
            ctx.fillRect(x0 + f * c, y0 + r * c, c, c);
        }
        ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
        ctx.strokeRect(x0 - 6, y0 - 6, lado + 12, lado + 12);
        ctx.setLineDash([]);
        ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText("Aquí aparece la imagen de la cámara", 320, 292);
        ctx.font = "21px sans-serif";
        ctx.fillText("Toca «Abrir la cámara» o «Probar con una foto»,", 320, 332);
        ctx.fillText("con el celular encima del tablero.", 320, 362);
    }

    /* Leer va con su propio reloj, no con el dibujo: el navegador deja de
     * dibujar lo que no se ve (un cuadrito de camaras.html fuera de la
     * pantalla), pero la partida se tiene que seguir anotando. */
    setInterval(() => {
        if (!fuente) return;
        cctx.drawImage(fuente, 0, 0, limpio.width, limpio.height);
        leerTableros(performance.now());
    }, CADA_MS);

    function dibujar() {
        requestAnimationFrame(dibujar);
        if (!fuente) return;
        cctx.drawImage(fuente, 0, 0, limpio.width, limpio.height);
        ctx.drawImage(limpio, 0, 0);
        // El elegido, encima del otro.
        tableros.filter((t) => t !== T()).forEach(dibujarTablero);
        dibujarTablero(T());
        if (arrastre >= 0 && T().esquinas[arrastre]) lupa(T().esquinas[arrastre]);
    }

    $("btn-camara").addEventListener("click", () => abrirCamara());
    /* El torneo lo elige una cámara y le llega a las demás de la misma
     * computadora (otros cuadritos u otras pestañas): mismo torneo, mismo
     * código; la mesa la elige cada una. */
    window.addEventListener("storage", (e) => {
        if (e.key !== TORNEO) return;
        let nuevo = null;
        try { nuevo = JSON.parse(e.newValue || "null"); } catch (x) { /* nada */ }
        if (!nuevo) { if (torneo) dejarTorneo(); return; }
        if (!torneo || torneo.id !== nuevo.id || torneo.codigo !== nuevo.codigo) usarTorneo(nuevo.id, nuevo.codigo);
        else if ((nuevo.retraso || 0) !== retraso) { torneo.retraso = nuevo.retraso || 0; elegirRetraso(torneo.retraso, false); }
    });
    $("camara-elegir").addEventListener("change", (e) => abrirCamara(e.target.value));
    $("foto").addEventListener("change", (e) => usarFoto(e.target.files[0]));
    $("btn-buscar").addEventListener("click", buscarTablero);
    $("btn-ajustar").addEventListener("click", () => ajustarEsquinas(false));
    $("btn-esquinas").addEventListener("click", () => { const t = T(); t.esquinas = []; t.ajustada = false; t.cal = null; rehacerHomografia(t); pedirEsquina(); });
    $("btn-calibrar").addEventListener("click", hacerCalibrar);
    $("btn-seguir").addEventListener("click", seguirPartida);
    $("btn-deshacer").addEventListener("click", () => {
        const t = T();
        if (t.juego.undo()) t.horas.pop();
        t.resultadoMano = null;
        t.quieta = null; t.recientes = [];
        $("dudas").hidden = true;
        partidaCambio(t);
        avisar(cual(t) + "Se deshizo la última jugada. Deja las piezas como en el tablero de la derecha.");
    });
    /* Anotar a mano lo que la cámara no reconoce: «Cf3», «e4», «O-O»…, en
     * español o en inglés (lo entiende js/comandos-tablero.js). Tiene que ser
     * legal en la partida: nunca se anota una posición inventada. */
    $("form-anotar").addEventListener("submit", (e) => {
        e.preventDefault();
        const t = T(), texto = $("jugada-mano").value;
        const m = window.ComandosTablero && window.ComandosTablero.jugadaEscrita(t.juego, texto);
        if (!m) { avisar(cual(t) + "«" + texto.trim() + "» no es una jugada legal en esta partida. " + V.comoVa(t.juego), "error"); return; }
        $("jugada-mano").value = "";
        anotar(t, [m.san]);
        // Lo que la cámara ve ahora ya es esta jugada: no se vuelve a buscar.
        t.quieta = t.lectura;
    });
    /* Seguir desde otra posición (si la partida no estaba anotada): un FEN o
     * un PGN, que chess.js tiene que aceptar. Después, «Seguir con esta
     * partida» calibra con ella. */
    $("form-posicion").addEventListener("submit", (e) => {
        e.preventDefault();
        const t = T(), texto = $("posicion").value.trim();
        const j = new window.Chess();
        const bien = texto && (/^[1-8pnbrqkPNBRQK/]+ [wb] /.test(texto) ? j.load(texto) : j.load_pgn(texto));
        if (!bien) { avisar(cual(t) + "No entiendo esa posición: pega un FEN (como lo da Lichess) o las jugadas en PGN.", "error"); return; }
        t.juego = j;
        t.resultadoMano = null;
        t.inicio = Date.now(); t.horas = j.history().map(() => null); t.horaResultado = null;
        $("dudas").hidden = true;
        partidaCambio(t);
        avisar(cual(t) + "Posición cargada. Pon las piezas así en el tablero y toca «Seguir con esta partida».", "bien");
    });
    document.querySelectorAll("[data-resultado]").forEach((b) => b.addEventListener("click", () => {
        const t = T(), r = b.dataset.resultado || null, solo = V.resultadoSolo(t.juego);
        if (solo && r !== solo) { avisar(cual(t) + "El tablero ya dice cómo terminó. " + V.textoResultado(solo) + " Si no es así, deshaz la última jugada.", "error"); return; }
        t.resultadoMano = solo ? null : r;
        partidaCambio(t);
        avisar(cual(t) + (r ? "Resultado marcado. " + V.textoResultado(r) : "La partida sigue en juego."), "bien");
    }));
    $("btn-copiar").addEventListener("click", async () => {
        const pgn = V.pgn(T().juego, resultadoDe(T()));
        try {
            await navigator.clipboard.writeText(pgn);
            avisar("PGN copiado.", "bien");
        } catch (e) {
            avisar("No se pudo copiar. Este es el PGN: " + pgn, "error");
        }
    });
    $("dos-tableros").addEventListener("change", (e) => cambiarCantidad(e.target.checked ? 2 : 1));
    document.querySelectorAll("[data-tablero]").forEach((b) => b.addEventListener("click", () => {
        elegirTablero(Number(b.dataset.tablero));
        pedirEsquina();
    }));
    $("btn-vivo").addEventListener("click", () => empezarVivo(T(), torneo ? torneo.codigo : codigoGuardado(T()) || V.nuevoCodigo()));
    $("btn-torneo").addEventListener("click", () => {
        const id = V.torneoDe($("torneo-enlace").value);
        if (!id) { avisar("Pega el enlace del torneo tal como sale en Torneos en Pareo Integral.", "error"); return; }
        usarTorneo(id, $("torneo-codigo-unirse").value.trim().toLowerCase());
    });
    $("btn-torneo-lista").addEventListener("click", pintarListaTorneos);
    $("btn-torneo-qr").addEventListener("click", imprimirQr);
    // Sin esperar al minuto: apenas Pareo empareja la ronda siguiente.
    $("btn-torneo-ronda").addEventListener("click", async () => {
        const antes = ultimaRonda();
        await refrescarTorneo();
        if (ultimaRonda() === antes) avisar("Sigue la ronda " + antes + ": la siguiente todavía no está emparejada.");
    });
    $("btn-torneo-quitar").addEventListener("click", () => { dejarTorneo(); avisar("Esta cámara ya no transmite el torneo."); });
    $("torneo-mesa").addEventListener("change", (e) => elegirMesa(Number(e.target.value) || null));
    // Otra cámara del mismo torneo ya tiene un código: se usa ese.
    $("torneo-codigo").addEventListener("change", (e) => {
        const c = e.target.value.trim().toLowerCase();
        if (!torneo) return;
        if (!V.codigoValido(c)) { e.target.value = torneo.codigo; avisar("El código del torneo son 8 letras y números, como sale en la otra cámara.", "error"); return; }
        torneo.codigo = c;
        try { localStorage.setItem(TORNEO, JSON.stringify({ id: torneo.id, codigo: c, retraso })); } catch (x) { /* sin almacenamiento */ }
        for (const t of tableros) if (t.vivo) empezarVivo(t, c);
        avisar("Código del torneo cambiado: todas las cámaras del torneo tienen que tener el mismo.", "bien");
    });
    $("vivo-retraso").addEventListener("change", (e) => {
        elegirRetraso(Number(e.target.value), true);
        avisar(retraso ? "Quien mira ve cada jugada " + retraso + " minutos después; al terminar la partida, la ve entera." : "Sin retraso: quien mira ve cada jugada al momento.", "bien");
    });
    $("btn-vivo-nuevo").addEventListener("click", () => empezarVivo(T(), V.nuevoCodigo()));
    $("btn-vivo-parar").addEventListener("click", () => pararVivo(T()));
    $("btn-vivo-copiar").addEventListener("click", async () => {
        const t = T();
        if (!t.vivo) return;
        try { await navigator.clipboard.writeText(V.enlace(t.vivo.codigo)); avisar("Enlace copiado: pégalo donde quieras compartirlo.", "bien"); }
        catch (e) { avisar("No se pudo copiar. El enlace es: " + V.enlace(t.vivo.codigo), "error"); }
    });
    let pausa = null;
    [["vivo-blancas", "blancas"], ["vivo-negras", "negras"]].forEach(([id, color]) => $(id).addEventListener("input", (e) => {
        const t = T();
        t.nombres[color] = e.target.value;
        clearTimeout(pausa);
        pausa = setTimeout(() => enviarVivo(t), 600);
    }));

    /* Cómo va esta cámara, para el tablero de control de camaras.html (que la
     * tiene en un cuadrito de la misma página web y la consulta cada segundo). */
    window.estadoCamara = () => {
        const t = tableros[0];
        const pista = video.srcObject && video.srcObject.getVideoTracks()[0];
        return {
            camara: fuente === video ? !!(pista && pista.readyState === "live") : !!fuente,
            calibrada: !!t.cal, mesa: t.mesa || null, transmitiendo: !!t.vivo,
            dudas: !$("dudas").hidden, error: ultimoAviso.tipo === "error" ? ultimoAviso.texto : "",
            jugadas: t.juego.history().length, resultado: resultadoDe(t),
        };
    };

    /* Dos entradas. Con el QR de una mesa («modo mesa»), SIN CUENTA: la
     * cámara transmite esa mesa de ese torneo y nada más; no elige torneo,
     * mesa, código ni retraso (los trae el QR), y no lee ni escribe nada de
     * la Academia: solo el torneo publicado, que es de lectura pública, y el
     * canal de Broadcast, que también lo es. Sin QR, la herramienta entera
     * es de quien administra (un control de producto: no hay datos detrás). */
    async function init() {
        const qr = deLaDireccion();
        if (qr) return modoMesa(qr);
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session) { location.href = "login.html?next=camara-tablero.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
        $("loading").classList.add("hidden");
        if (!perfil || !perfil.is_admin) { $("denegado").classList.remove("hidden"); return; }
        try { elegirRetraso(Number(localStorage.getItem(RETRASO)) || 0, false); } catch (e) { /* sin almacenamiento */ }
        arrancar();
        let guardado = null;
        try { guardado = JSON.parse(localStorage.getItem(TORNEO) || "null"); } catch (e) { /* sin almacenamiento */ }
        // El torneo que se estaba transmitiendo, con su código.
        if (guardado && V.torneoDe(guardado.id)) usarTorneo(guardado.id, guardado.codigo);
    }

    // Llegó por el QR de una mesa: ese torneo, ese código y esa mesa, la
    // cámara abierta y transmitiendo. El # se queda: al recargar, sigue en
    // modo mesa.
    async function modoMesa(qr) {
        document.documentElement.classList.add("camara-compacta", "camara-mesa");
        $("loading").classList.add("hidden");
        arrancar();
        $("mesa-qr").hidden = false;
        $("mesa-titulo-qr").textContent = "Mesa " + qr.mesa;
        try { localStorage.setItem(MESA + 0, String(qr.mesa)); } catch (e) { /* sin almacenamiento */ }
        await usarTorneo(qr.id, qr.codigo);
        if (!torneo) return;
        elegirRetraso(qr.retraso, true);
        $("mesa-titulo-qr").textContent = "Mesa " + qr.mesa + " · " + torneo.nombre;
        pintarTorneo();
        empezarVivo(T(), torneo.codigo);
        await abrirCamara();
        if (fuente) avisar("Mesa " + qr.mesa + " de " + torneo.nombre + ", transmitiendo. Toca «Buscar el tablero» y, con las piezas en la posición inicial, «Calibrar con la posición inicial».", "bien");
    }

    // Lo que es igual en las dos entradas: la app, la partida guardada y el dibujo.
    function arrancar() {
        $("app").classList.remove("hidden");
        $("dos-tableros").checked = false;
        try { elegirRetraso(Number(localStorage.getItem(RETRASO)) || 0, false); } catch (e) { /* sin almacenamiento */ }
        // La partida que se estaba anotando, si la página se cerró o se recargó.
        let guardada = null;
        try { guardada = localStorage.getItem(PARTIDA + 0); } catch (e) { /* sin almacenamiento */ }
        const j = new window.Chess();
        if (guardada && j.load_pgn(guardada) && j.history().length) {
            tableros[0].juego = j;
            const r = { "1-0": "1-0", "1/2-1/2": "=", "0-1": "0-1" }[(j.header() || {}).Result];
            if (r && !V.resultadoSolo(j)) tableros[0].resultadoMano = r;
            let h = null;
            try { h = JSON.parse(localStorage.getItem(PARTIDA + 0 + "_horas") || "null"); } catch (e) { /* nada */ }
            const n = j.history().length;
            tableros[0].horas = h && Array.isArray(h.horas) && h.horas.length === n ? h.horas : new Array(n).fill(null);
            tableros[0].inicio = h && h.inicio || null;
            avisar("Se recuperó la partida que estabas anotando (" + j.history().length + " jugadas). Ubica el tablero y toca «Seguir con esta partida»; para empezar otra, «Calibrar con la posición inicial».", "bien");
        }
        elegirTablero(0);
        sinImagen();
        requestAnimationFrame(dibujar);
    }
    init();
})();
