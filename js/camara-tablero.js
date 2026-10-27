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
     * Una rejilla de N × N puntos en el centro de la casilla (del 22 % al
     * 78 %: los bordes se los comen la perspectiva y la pieza de al lado). De
     * cada punto, la luminancia. */
    const N = 8;
    const DESDE = 0.22, HASTA = 0.78;

    function muestras(pix, ancho, alto, h) {
        const todas = [];
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const L = new Float32Array(N * N);
                for (let j = 0; j < N; j++) {
                    for (let i = 0; i < N; i++) {
                        const t = (k) => DESDE + (HASTA - DESDE) * (k + 0.5) / N;
                        const [x, y] = aplicar(h, f + t(i), r + t(j));
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

    /* Calibrar: la imagen DEBE ser la posición inicial. Devuelve lo aprendido
     * o null si lo que se ve no se parece a una posición inicial. */
    function calibrar(todas) {
        const fondos = {};
        for (const os of [true, false]) {
            const vacias = [];
            for (let k = 16; k < 48; k++) if (oscura(k) === os) vacias.push(todas[k]);
            const medias = vacias.map(media);
            const dentro = media(vacias.map(desvio));
            fondos[os] = { media: media(medias), desvio: Math.max(2, Math.sqrt(dentro * dentro + Math.pow(desvio(medias), 2))) };
        }
        const r = todas.map((L, k) => rasgos(L, fondos[oscura(k)]));
        const centro = (lista) => ({ fuera: media(lista.map((x) => x.fuera)), borde: media(lista.map((x) => x.borde)), tono: media(lista.map((x) => x.tono)) });
        const de = (filtro) => r.filter((x, k) => filtro(k));
        const cal = { fondos, vacia: {}, ocupada: {}, blanca: {}, negra: {} };
        for (const os of [true, false]) {
            const mismo = (k) => oscura(k) === os;
            cal.vacia[os] = centro(de((k) => k >= 16 && k < 48 && mismo(k)));
            cal.ocupada[os] = centro(de((k) => (k < 16 || k >= 48) && mismo(k)));
            cal.blanca[os] = centro(de((k) => k < 16 && mismo(k))).tono;
            cal.negra[os] = centro(de((k) => k >= 48 && mismo(k))).tono;
        }
        // La escala de cada rasgo: lo que separa vacía de ocupada, con piso.
        cal.escala = {
            fuera: Math.max(0.05, Math.abs(media([true, false].map((o) => cal.ocupada[o].fuera - cal.vacia[o].fuera)))),
            borde: Math.max(1, Math.abs(media([true, false].map((o) => cal.ocupada[o].borde - cal.vacia[o].borde)))),
        };
        return cal;
    }

    /* La lectura: 64 letras, «.» vacía, «B» blanca, «N» negra, de a1 a h8. */
    function leer(todas, cal) {
        let s = "";
        for (let k = 0; k < 64; k++) {
            const os = oscura(k);
            const x = rasgos(todas[k], cal.fondos[os]);
            const d = (c) => Math.hypot((x.fuera - c.fuera) / cal.escala.fuera, (x.borde - c.borde) / cal.escala.borde);
            if (d(cal.vacia[os]) <= d(cal.ocupada[os])) { s += "."; continue; }
            s += Math.abs(x.tono - cal.blanca[os]) <= Math.abs(x.tono - cal.negra[os]) ? "B" : "N";
        }
        return s;
    }

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

    /* Qué jugada (o qué pareja de jugadas, si se escapó una) lleva de la
     * posición de `juego` a la lectura. Devuelve la lista de jugadas SAN o
     * null. Al coronar, la cámara solo ve «pieza blanca»: se anota dama. */
    function buscarJugadas(juego, lectura) {
        const candidatas = () => juego.moves({ verbose: true }).filter((m) => !m.promotion || m.promotion === "q");
        const halladas = [];
        for (const m of candidatas()) {
            juego.move(m);
            if (esperada(juego) === lectura) halladas.push([m.san]);
            juego.undo();
        }
        if (halladas.length === 1) return halladas[0];
        if (halladas.length > 1) return null;
        for (const m of candidatas()) {
            juego.move(m);
            for (const m2 of candidatas()) {
                juego.move(m2);
                if (esperada(juego) === lectura) halladas.push([m.san, m2.san]);
                juego.undo();
            }
            juego.undo();
        }
        return halladas.length === 1 ? halladas[0] : null;
    }

    function diferentes(a, b) {
        const d = [];
        for (let k = 0; k < 64; k++) if (a[k] !== b[k]) d.push(casilla(k));
        return d;
    }

    window.LectorTablero = { homografia, aplicar, ESQUINAS_TABLERO, muestras, calibrar, leer, esperada, buscarJugadas, diferentes, casilla };

    /* ── La página ───────────────────────────────────────────────────────── */
    if (!document.getElementById("lienzo")) return;

    const ANCHO = 640;          // el ancho al que se trabaja la imagen
    const CADA_MS = 200;        // cada cuánto se lee el tablero
    const QUIETA = 6;           // lecturas iguales seguidas para fiarse (~1,2 s)
    const NOMBRE_ESQUINA = ["a1 (la de las blancas, a su izquierda)", "h1 (la de las blancas, a su derecha)", "h8", "a8"];
    const PIEZAS = { w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" }, b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" } };

    const $ = (id) => document.getElementById(id);
    const lienzo = $("lienzo"), ctx = lienzo.getContext("2d", { willReadFrequently: true });
    const video = $("video");

    let fuente = null;          // el <video> o la imagen de la foto
    let esquinas = [];          // en coordenadas del lienzo
    let elegida = 0;            // la esquina que mueven las flechas
    let arrastre = -1;
    let h = null, cal = null;
    let juego = new window.Chess();
    let recientes = [], quieta = null, ultimaMirada = 0;
    let lecturaActual = null;

    function avisar(texto, tipo) {
        const a = $("aviso");
        a.textContent = texto;
        a.className = "mb-4 rounded-xl px-4 py-3 text-sm " + (tipo === "error"
            ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
            : tipo === "bien" ? "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200"
            : "bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100");
    }

    function pedirEsquina() {
        avisar(esquinas.length < 4
            ? "Toca la esquina " + (esquinas.length + 1) + " de 4: la de " + NOMBRE_ESQUINA[esquinas.length] + "."
            : cal ? "Leyendo el tablero. Haz las jugadas y espera a que se anoten."
            : "Listo. Ahora pon las piezas en la posición inicial y toca «Calibrar con la posición inicial». Las esquinas se pueden arrastrar.");
    }

    function nuevaFuente(f, ancho, alto) {
        fuente = f;
        lienzo.width = ANCHO;
        lienzo.height = Math.round(ANCHO * alto / ancho);
        esquinas = []; h = null; cal = null; recientes = []; quieta = null;
        $("btn-esquinas").disabled = false;
        $("btn-calibrar").disabled = true;
        pedirEsquina();
    }

    async function abrirCamara() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            avisar("Este navegador no deja usar la cámara desde la página. Prueba con Chrome o Safari al día.", "error");
            return;
        }
        try {
            const flujo = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } });
            video.srcObject = flujo;
            await video.play();
            nuevaFuente(video, video.videoWidth || 640, video.videoHeight || 480);
        } catch (e) {
            avisar(e && e.name === "NotAllowedError"
                ? "No se dio permiso para usar la cámara. Actívalo en los permisos del sitio y vuelve a tocar «Abrir la cámara»."
                : "No se pudo abrir la cámara (" + (e && e.name || "error") + "). Si otra aplicación la está usando, ciérrala y vuelve a intentar.", "error");
        }
    }

    function usarFoto(archivo) {
        if (!archivo) return;
        const img = new Image();
        img.onload = () => {
            if (video.srcObject) { video.srcObject.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
            /* Otra foto del mismo tamaño, tomada desde el mismo lugar: se
             * conservan las esquinas, la calibración y la partida. Así se
             * prueba una partida foto a foto, sin cámara en vivo. */
            if (fuente instanceof HTMLImageElement && fuente.naturalWidth === img.naturalWidth && fuente.naturalHeight === img.naturalHeight) {
                fuente = img;
                recientes = [];
                return;
            }
            nuevaFuente(img, img.naturalWidth, img.naturalHeight);
        };
        img.onerror = () => avisar("No se pudo abrir esa foto. Prueba con otra en JPG o PNG.", "error");
        img.src = URL.createObjectURL(archivo);
    }

    function rehacerHomografia() {
        h = esquinas.length === 4 ? homografia(ESQUINAS_TABLERO, esquinas) : null;
        $("btn-calibrar").disabled = !h;
        recientes = []; quieta = null;
    }

    function punto(e) {
        const r = lienzo.getBoundingClientRect();
        return [(e.clientX - r.left) * lienzo.width / r.width, (e.clientY - r.top) * lienzo.height / r.height];
    }

    lienzo.addEventListener("pointerdown", (e) => {
        if (!fuente) return;
        const p = punto(e);
        if (esquinas.length < 4) {
            esquinas.push(p);
            elegida = esquinas.length - 1;
            rehacerHomografia();
            pedirEsquina();
            return;
        }
        let mejor = -1, dist = 40 * lienzo.width / lienzo.getBoundingClientRect().width;
        esquinas.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < dist) { dist = d; mejor = i; } });
        if (mejor >= 0) { arrastre = mejor; elegida = mejor; lienzo.setPointerCapture(e.pointerId); }
    });
    lienzo.addEventListener("pointermove", (e) => {
        if (arrastre < 0) return;
        esquinas[arrastre] = punto(e);
        rehacerHomografia();
    });
    lienzo.addEventListener("pointerup", () => { arrastre = -1; });
    lienzo.addEventListener("keydown", (e) => {
        if (/^[1-4]$/.test(e.key) && esquinas.length > Number(e.key) - 1) { elegida = Number(e.key) - 1; e.preventDefault(); return; }
        const paso = e.shiftKey ? 10 : 2;
        const mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
        if (!mov || !esquinas[elegida]) return;
        e.preventDefault();
        esquinas[elegida] = [esquinas[elegida][0] + mov[0], esquinas[elegida][1] + mov[1]];
        rehacerHomografia();
    });

    function mirar() {
        const pix = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
        return muestras(pix, lienzo.width, lienzo.height, h);
    }

    function hacerCalibrar() {
        if (!h) return;
        const nueva = calibrar(mirar());
        const prueba = leer(mirar(), nueva);
        const bien = 64 - diferentes(prueba, esperada(new window.Chess())).length;
        if (bien < 48) {
            avisar("Con estas esquinas no se ve una posición inicial (" + bien + " de 64 casillas). Revisa que la esquina 1 sea a1 y que estén todas las piezas en su lugar.", "error");
            return;
        }
        cal = nueva;
        juego = new window.Chess();
        recientes = []; quieta = null;
        pintarPartida();
        avisar("Calibrado: lee bien " + bien + " de 64 casillas en la posición inicial. Ya puedes jugar.", "bien");
    }

    /* Una lectura quieta que no es la esperada: se busca la jugada. */
    function revisar(lectura) {
        const antes = esperada(juego);
        if (lectura === antes) return;
        const jugadas = buscarJugadas(juego, lectura);
        if (jugadas) {
            jugadas.forEach((s) => juego.move(s));
            pintarPartida();
            const corona = jugadas.some((s) => /=Q/.test(s));
            avisar((jugadas.length === 2 ? "Se escapó una jugada: se anotaron " + jugadas.join(" y ") : "Se anotó " + jugadas[0]) + "." + (corona ? " Coronó: se anotó dama; si fue otra pieza, deshazla." : ""), "bien");
            return;
        }
        avisar("No reconozco lo que cambió en " + diferentes(lectura, antes).join(", ") + ". Si es la luz o una pieza movida sin querer, déjala como estaba; si se ve mal la casilla, ajusta las esquinas.", "error");
    }

    function pintarPartida() {
        const t = $("tablero");
        t.textContent = "";
        for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) {
            const k = r * 8 + f, p = juego.get(casilla(k));
            const c = document.createElement("div");
            c.className = "flex items-center justify-center text-black text-2xl leading-none " + (oscura(k) ? "bg-brand-300" : "bg-brand-100");
            c.textContent = p ? PIEZAS[p.color][p.type] : "";
            t.append(c);
        }
        $("fen").textContent = juego.fen();
        const hist = juego.history();
        let txt = "";
        hist.forEach((s, i) => { txt += (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + s + " "; });
        $("jugadas").textContent = txt.trim() || "Todavía ninguna.";
        $("btn-deshacer").disabled = !hist.length;
        $("btn-copiar").disabled = !hist.length;
    }

    function dibujar(ahora) {
        requestAnimationFrame(dibujar);
        if (!fuente) return;
        ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);

        if (h && cal && ahora - ultimaMirada >= CADA_MS) {
            ultimaMirada = ahora;
            lecturaActual = leer(mirar(), cal);
            recientes.push(lecturaActual);
            if (recientes.length > QUIETA) recientes.shift();
            if (recientes.length === QUIETA && recientes.every((x) => x === lecturaActual) && lecturaActual !== quieta) {
                quieta = lecturaActual;
                revisar(lecturaActual);
            }
            const bien = 64 - diferentes(lecturaActual, esperada(juego)).length;
            $("acierto").textContent = bien + " de 64";
        }

        // La cuadrícula y lo leído en cada casilla.
        if (h) {
            ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
            ctx.lineWidth = 1.5;
            for (let i = 0; i <= 8; i++) {
                ctx.beginPath(); ctx.moveTo(...aplicar(h, i, 0)); ctx.lineTo(...aplicar(h, i, 8)); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(...aplicar(h, 0, i)); ctx.lineTo(...aplicar(h, 8, i)); ctx.stroke();
            }
            if (cal && lecturaActual) {
                const esp = esperada(juego);
                ctx.font = "bold 13px sans-serif";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                for (let k = 0; k < 64; k++) {
                    const [x, y] = aplicar(h, (k & 7) + 0.5, (k >> 3) + 0.5);
                    const mal = lecturaActual[k] !== esp[k];
                    const txt = (lecturaActual[k] === "." ? "·" : lecturaActual[k]) + (mal ? "!" : "");
                    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
                    ctx.fillRect(x - 11, y - 9, 22, 18);
                    if (mal) { ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2; ctx.strokeRect(x - 11, y - 9, 22, 18); }
                    ctx.fillStyle = "#ffffff";
                    ctx.fillText(txt, x, y + 1);
                }
            }
        }
        esquinas.forEach((p, i) => {
            ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, 2 * Math.PI);
            ctx.fillStyle = i === elegida ? "#facc15" : "rgba(0, 0, 0, 0.8)"; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = "#ffffff"; ctx.stroke();
            ctx.fillStyle = i === elegida ? "#000000" : "#ffffff";
            ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(String(i + 1), p[0], p[1] + 1);
        });
    }

    $("btn-camara").addEventListener("click", abrirCamara);
    $("foto").addEventListener("change", (e) => usarFoto(e.target.files[0]));
    $("btn-esquinas").addEventListener("click", () => { esquinas = []; rehacerHomografia(); cal = null; pedirEsquina(); });
    $("btn-calibrar").addEventListener("click", hacerCalibrar);
    $("btn-deshacer").addEventListener("click", () => {
        juego.undo();
        quieta = null; recientes = [];
        pintarPartida();
        avisar("Se deshizo la última jugada. Deja las piezas como en el tablero de la derecha.");
    });
    $("btn-copiar").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(juego.pgn());
            avisar("PGN copiado.", "bien");
        } catch (e) {
            avisar("No se pudo copiar. Este es el PGN: " + juego.pgn(), "error");
        }
    });

    async function init() {
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session) { location.href = "login.html?next=camara-tablero.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
        $("loading").classList.add("hidden");
        if (!perfil || !perfil.is_admin) { $("denegado").classList.remove("hidden"); return; }
        $("app").classList.remove("hidden");
        pintarPartida();
        requestAnimationFrame(dibujar);
    }
    init();
})();
