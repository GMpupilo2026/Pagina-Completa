/* El código de camara-tablero.html: la prueba de la cámara que lee un tablero
 * de verdad y anota las jugadas.
 *
 * Es una PRUEBA: sirve para medir qué tan bien se ven nuestros tableros con la
 * luz real de un salón antes de entrenar ningún modelo. Por eso no guarda nada
 * ni manda la imagen a ningún lado: todo pasa en el celular. Ver «La cámara que
 * lee el tablero» en docs/decisiones/juegos-y-torneos.md.
 *
 * Lo de calcular (homografía, lectura, jugadas) está en js/lector-tablero.js,
 * window.LectorTablero.
 */
(function () {
    "use strict";
    const { homografia, aplicar, ESQUINAS_TABLERO, INICIAL, muestras, calibrar, leer, leerDetalle, esperada, decidir, mezclarCal, cambiarCoronacion, deducirCoronacion, diferentes, casilla } = window.LectorTablero;
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
            confirmadas: new Set(), // las coronaciones ya elegidas (por su índice en la historia)
            fotos: [], // las del tablero con cada resultado y cada aviso (ver tomarFoto)
        };
    }
    let tableros = [nuevoTablero(0)];
    let activo = 0;
    const T = () => tableros[activo];

    let fuente = null;          // el <video> o la imagen de la foto
    let elegida = 0;            // la esquina que mueven las flechas
    let arrastre = -1;
    let ultimaMirada = 0;
    let fuenteVer = 0;          // cambia con cada imagen nueva: una lectura de la anterior no vale
    let pintarYa = true;        // hay algo nuevo que dibujar (ver dibujar)
    let ultimoCambio = 0;       // la última vez que cambió lo que se lee (ver leerTableros)
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
        $("btn-ahorro").disabled = !fuente;
    }

    function tamano(ancho, alto) {
        const w = ANCHO[tableros.length - 1];
        lienzo.width = limpio.width = w;
        lienzo.height = limpio.height = Math.round(w * alto / ancho);
    }

    function nuevaFuente(f, ancho, alto) {
        fuente = f; fuenteVer++;
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
        /* Lo justo: la imagen se trabaja a 640 (o 960 con dos tableros) y se
         * lee 5 veces por segundo, así que pedir 1920 a 30 imágenes por
         * segundo era hacerle decodificar al celular seis veces más de lo
         * que se usa. Todo «ideal»: si la cámara no lo da, da lo que tenga. */
        const justo = { width: { ideal: 1280 }, frameRate: { ideal: 10 } };
        const pedir = (conId) => navigator.mediaDevices.getUserMedia({ audio: false, video: conId
            ? Object.assign({ deviceId: { exact: conId } }, justo)
            : Object.assign({ facingMode: { ideal: "environment" } }, justo) });
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

    /* «Ahorrar batería»: la pantalla tiene que quedar encendida (si se apaga,
     * se corta la cámara), pero no tiene por qué mostrar nada: queda en negro,
     * con la mesa y cómo va en letra grande, y deja de dibujar la imagen. La
     * cámara sigue leyendo y transmitiendo. En modo mesa se enciende sola a
     * los 2 minutos sin tocar nada, ya calibrada y transmitiendo. Si la
     * cámara necesita a alguien (una jugada dudosa, un error), se apaga sola. */
    let ahorro = false, quietoDesde = performance.now();
    const SOLO_MS = 120000;
    function ahorrar(si) {
        if (ahorro === si) return;
        ahorro = si;
        const a = $("ahorro");
        a.classList.toggle("hidden", !si);
        a.classList.toggle("flex", si);
        if (si) { pintarAhorro(); a.focus(); }
        else { pintarYa = true; quietoDesde = performance.now(); $("btn-ahorro").focus(); }
    }
    function pintarAhorro() {
        const t = T(), n = t.juego.history().length;
        $("ahorro-titulo").textContent = (t.mesa ? lugarDe(t) : "Cámara") + " · " + (!t.vivo ? "sin transmitir" : sinRed() ? "sin conexión, guardando" : "transmitiendo");
        $("ahorro-estado").textContent = (n === 1 ? "1 jugada anotada" : n + " jugadas anotadas") + (n ? ". " + V.comoVa(t.juego) : ".");
    }
    $("btn-ahorro").addEventListener("click", () => ahorrar(true));
    $("ahorro").addEventListener("click", () => ahorrar(false));
    for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, () => { quietoDesde = performance.now(); }, true);
    setInterval(() => {
        const necesita = !$("dudas").hidden || ultimoAviso.tipo === "error";
        if (ahorro) { if (necesita) ahorrar(false); else pintarAhorro(); return; }
        const t = T();
        if (document.documentElement.classList.contains("camara-mesa") && fuente && t.cal && t.vivo && !necesita
            && performance.now() - quietoDesde > SOLO_MS) ahorrar(true);
    }, 1000);

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
                fuente = img; fuenteVer++;
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
        pintarYa = true; ultimoCambio = performance.now();
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
        t.resultadoMano = null; t.confirmadas = new Set();
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
        const termino = r && !t.horaResultado;
        if (termino) t.horaResultado = Date.now();
        if (!r) t.horaResultado = null;
        if (t === T()) pintarPartida();
        enviarVivo(t);
        if (termino) tomarFoto(t, "resultado");
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
        guardarMuestra(t);
        const tablas = V.reglaDeTablas(t.juego);
        const alArbitro = tablas && alertarArbitro(t, tablas);
        if (tablas) tomarFoto(t, tablas);
        avisar(cual(t) + (jugadas.length === 2 ? "Se escapó una jugada: se anotaron " + jugadas.map(es).join(" y ") : "Se anotó " + es(jugadas[0])) + "." + (corona ? " Coronó: se anotó dama. Si fue otra pieza, elígela abajo; si se mueve como caballo, se corrige sola." : "")
            + (tablas ? " " + TABLAS[tablas] + (alArbitro ? " Se le avisó al árbitro." : "") : ""), "bien");
    }
    /* La repetición y las 50 jugadas no se marcan solas: se dicen, y en un
     * torneo le llegan al árbitro de Pareo Integral (ver reglaDeTablas). */
    const TABLAS = {
        repeticion3: "La misma posición se repitió tres veces: quien juega puede reclamar tablas al árbitro.",
        jugadas50: "Van 50 jugadas de cada uno sin capturas ni movimientos de peón: se pueden reclamar tablas al árbitro.",
        repeticion5: "La misma posición se repitió cinco veces: por las Leyes son tablas, aunque nadie las reclame (lo confirma el árbitro).",
        jugadas75: "Van 75 jugadas de cada uno sin capturas ni movimientos de peón: por las Leyes son tablas (lo confirma el árbitro).",
    };

    /* La coronación que falta confirmar: la última de la partida, mientras la
     * pieza siga en el tablero, con la casilla donde está ahora. La cámara
     * solo ve «pieza blanca», así que se anota dama y se pregunta; si
     * después se mueve como no puede una dama, se corrige sola (ver
     * revisar). */
    function coronacionDe(t) {
        let c = null;
        t.juego.history({ verbose: true }).forEach((m, i) => {
            if (m.promotion) c = { ply: i, donde: m.to, pieza: m.promotion };
            else if (c && m.from === c.donde) c.donde = m.to;
            else if (c && m.to === c.donde) c = null; // la capturaron
        });
        return c && !t.confirmadas.has(c.ply) ? c : null;
    }
    const NOMBRE_PIEZA = { q: "dama", r: "torre", b: "alfil", n: "caballo" };
    function elegirCoronacion(t, pieza) {
        const c = coronacionDe(t);
        if (!c) return;
        if (!cambiarCoronacion(t.juego, c.ply, pieza)) {
            avisar(cual(t) + "Con " + NOMBRE_PIEZA[pieza] + " lo que se jugó después no es legal. Revisa la partida.", "error");
            return;
        }
        t.confirmadas.add(c.ply);
        t.quieta = null;
        partidaCambio(t);
        avisar(cual(t) + "Coronó " + NOMBRE_PIEZA[pieza] + ": se anotó " + es(t.juego.history()[c.ply]) + ".", "bien");
    }
    function pintarCoronacion() {
        const c = coronacionDe(T());
        $("coronacion").hidden = !c;
        if (c) $("coronacion-texto").textContent = "Coronó en " + c.donde + " (se anotó dama). ¿Qué pieza puso?";
    }

    /* Una lectura quieta que no es la esperada: se busca la jugada. */
    function revisar(t, lectura, seguridad) {
        const antes = esperada(t.juego);
        if (lectura === antes) return;
        const r = decidir(t.juego, lectura, seguridad);
        if (r && r.jugadas) { anotar(t, r.jugadas); return; }
        // La pieza coronada se movió como no puede una dama: era otra.
        const c = !r && coronacionDe(t);
        const otra = c && deducirCoronacion(t.juego, c.ply, c.donde, lectura, seguridad);
        if (otra && cambiarCoronacion(t.juego, c.ply, otra.pieza)) {
            t.confirmadas.add(c.ply);
            anotar(t, otra.jugadas);
            avisar(cual(t) + "La pieza coronada se movió como " + NOMBRE_PIEZA[otra.pieza] + ": era " + NOMBRE_PIEZA[otra.pieza] + ", se corrigió la coronación (" + es(t.juego.history()[c.ply]) + ") y se anotó " + otra.jugadas.map(es).join(" y ") + ".", "bien");
            return;
        }
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
        // Ninguna jugada lo explica: ¿fue la luz? Con la de ahora, ¿se lee la partida entera?
        if (luzNueva(t)) { avisar(cual(t) + "Cambió la luz: la cámara se volvió a calibrar sola y la partida sigue.", "bien"); return; }
        if (cambiaron.length >= 10) {
            if (recuperar(t)) { avisar(cual(t) + "La cámara se movió: el tablero se volvió a ubicar y la partida sigue.", "bien"); return; }
            avisar(cual(t) + "Parece que la cámara se movió. Toca «Buscar el tablero» (o marca las esquinas) y después «Seguir con esta partida»: no se pierde nada de lo anotado.", "error");
            return;
        }
        // Una o dos piezas en otro lugar sin que salga ninguna jugada legal:
        // puede ser una jugada ilegal. En un torneo se le avisa al árbitro de
        // Pareo Integral (sin decir qué casillas: eso sería pasar la jugada).
        const alArbitro = alertarArbitro(t);
        tomarFoto(t, "ilegal");
        avisar(cual(t) + "No reconozco lo que cambió en " + cambiaron.join(", ") + ": puede ser una jugada ilegal o una pieza fuera de lugar. Si fue una jugada, escríbela abajo; si es la luz o una pieza movida sin querer, déjala como estaba." + (alArbitro ? " Se le avisó al árbitro." : ""), "error");
    }

    /* ── La foto del tablero ─────────────────────────────────────────────
     * Con cada resultado y cada aviso (jugada ilegal, repetición, 50
     * jugadas) se guarda una foto del tablero visto desde arriba: se endereza
     * con la homografía y queda SOLO el tablero, sin nadie alrededor. Si hay
     * un reclamo, es la prueba de cómo estaba. Queda en esta página mientras
     * esté abierta (las últimas 6 de cada tablero) y, en un torneo, le llega
     * al árbitro de Pareo Integral, que la puede pasar a las incidencias. */
    const LADO_FOTO = 256;
    const MOTIVO_FOTO = {
        resultado: "Al terminar la partida", ilegal: "Posible jugada ilegal", repeticion3: "Triple repetición",
        jugadas50: "50 jugadas", repeticion5: "Quíntuple repetición", jugadas75: "75 jugadas",
    };
    function fotoEnderezada(t) {
        if (!fuente || !t.h) return null;
        const W = anchoFuente(), H = altoFuente();
        if (!W || !H) return null;
        const ex = W / limpio.width, ey = H / limpio.height;
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(fuente, 0, 0, W, H);
        const src = g.getImageData(0, 0, W, H).data;
        const out = document.createElement("canvas"); out.width = out.height = LADO_FOTO;
        const og = out.getContext("2d"), img = og.createImageData(LADO_FOTO, LADO_FOTO), d = img.data;
        for (let y = 0; y < LADO_FOTO; y++) {
            for (let x = 0; x < LADO_FOTO; x++) {
                // Arriba la fila 8 y a la izquierda la columna a: como un diagrama.
                const [px, py] = aplicar(t.h, (x + 0.5) / LADO_FOTO * 8, 8 - (y + 0.5) / LADO_FOTO * 8);
                const sx = Math.min(W - 1, Math.max(0, Math.round(px * ex))), sy = Math.min(H - 1, Math.max(0, Math.round(py * ey)));
                const i = (y * LADO_FOTO + x) * 4, j = (sy * W + sx) * 4;
                d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2]; d[i + 3] = 255;
            }
        }
        og.putImageData(img, 0, 0);
        return out.toDataURL("image/jpeg", 0.7);
    }
    function tomarFoto(t, motivo) {
        let img = null;
        try { img = fotoEnderezada(t); } catch (e) { img = null; }
        if (!img) return;
        const f = { h: Date.now(), motivo, img, jugada: t.juego.history().length };
        t.fotos = t.fotos.concat(f).slice(-6);
        if (t === T()) pintarFotos();
        const canal = t.vivo && canales.get(t.vivo.codigo), donde = dondeDe(t);
        if (canal && donde && donde.torneo) canal.send({ type: "broadcast", event: "foto", payload: { v: 1, torneo: donde.torneo, ronda: donde.ronda, mesa: donde.mesa, tablero: donde.tablero || undefined, motivo, img, t: f.h } });
    }
    function pintarFotos() {
        const t = T(), caja = $("fotos-lista");
        $("fotos").hidden = !t.fotos.length;
        caja.textContent = "";
        t.fotos.slice().reverse().forEach((f) => {
            const hora = HoraCR.hora(new Date(f.h));
            const a = document.createElement("a");
            a.href = f.img;
            a.download = "tablero-" + (t.mesa ? "mesa-" + lugarTexto(t) + "-" : "") + f.jugada + ".jpg";
            a.className = "block w-24 text-center text-xs text-brand-600 dark:text-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
            const im = document.createElement("img");
            im.src = f.img; im.width = 96; im.height = 96; im.className = "w-24 h-24 rounded";
            im.alt = "El tablero, " + MOTIVO_FOTO[f.motivo].toLowerCase() + ", a las " + hora;
            const pie = document.createElement("span");
            pie.className = "block mt-1";
            pie.textContent = MOTIVO_FOTO[f.motivo] + " · " + hora;
            a.append(im, pie);
            caja.append(a);
        });
    }

    /* ── Enseñarle a la cámara ───────────────────────────────────────────
     * Si se enciende (y solo entonces: viene apagado), con cada jugada
     * anotada se guarda la foto del tablero enderezado con su posición: 64
     * letras como las de la lectura y el FEN. Es lo que hace falta para
     * entrenar un modelo con nuestros tableros. Quedan en este aparato
     * (IndexedDB), hasta 500, y se bajan en un .zip con su lista en CSV. */
    const MUESTRAS_SI = "camara_muestras_si_v1", MAX_MUESTRAS = 500;
    let base = null;
    function abrirBase() {
        if (!base) base = new Promise((ok, mal) => {
            const r = indexedDB.open("camara_muestras", 1);
            r.onupgradeneeded = () => r.result.createObjectStore("muestras", { keyPath: "id", autoIncrement: true });
            r.onsuccess = () => ok(r.result);
            r.onerror = () => mal(r.error);
        });
        base.catch(() => { base = null; });
        return base;
    }
    const almacen = async (modo) => (await abrirBase()).transaction("muestras", modo).objectStore("muestras");
    const pedido = (r) => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
    async function guardarMuestra(t) {
        if (!$("muestras-si").checked) return;
        let img = null;
        try { img = fotoEnderezada(t); } catch (e) { img = null; }
        if (!img) return;
        try {
            const st = await almacen("readwrite");
            await pedido(st.add({ h: Date.now(), img, etiqueta: esperada(t.juego), fen: t.juego.fen() }));
            const n = await pedido(st.count());
            if (n > MAX_MUESTRAS) { const viejas = await pedido(st.getAllKeys(null, n - MAX_MUESTRAS)); for (const k of viejas) st.delete(k); }
        } catch (e) { /* sin IndexedDB: no se juntan */ }
        pintarMuestras();
    }
    async function pintarMuestras() {
        let n = 0;
        try { n = await pedido((await almacen("readonly")).count()); } catch (e) { n = 0; }
        $("muestras-cuenta").textContent = n ? (n === 1 ? "Una foto guardada." : n + " fotos guardadas.") : "Ninguna foto guardada.";
        $("btn-muestras-bajar").disabled = $("btn-muestras-borrar").disabled = !n;
    }
    async function bajarMuestras() {
        let lista = [];
        try { lista = await pedido((await almacen("readonly")).getAll()); } catch (e) { lista = []; }
        if (!lista.length) return;
        if (!window.TablaExcel) await new Promise((ok, mal) => { const sc = document.createElement("script"); sc.src = "js/tabla-excel.js"; sc.onload = ok; sc.onerror = mal; document.head.append(sc); });
        const nombre = (m) => "tablero-" + String(m.id).padStart(5, "0") + ".jpg";
        const bytes = (url) => Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
        const csv = "archivo,etiqueta,fen,hora\n" + lista.map((m) => [nombre(m), m.etiqueta, m.fen, HoraCR.dia(new Date(m.h)) + " " + HoraCR.hora(new Date(m.h))].join(",")).join("\n") + "\n";
        const partes = [{ nombre: "etiquetas.csv", texto: csv }].concat(lista.map((m) => ({ nombre: nombre(m), bytes: bytes(m.img) })));
        const blob = new Blob([window.TablaExcel.zip(partes)], { type: "application/zip" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "camara-muestras-" + HoraCR.hoy() + ".zip";
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        avisar("Se bajaron " + lista.length + " fotos con su posición (y etiquetas.csv).", "bien");
    }
    let borrarSeguro = 0;
    async function borrarMuestras() {
        const b = $("btn-muestras-borrar");
        if (Date.now() - borrarSeguro > 5000) { borrarSeguro = Date.now(); b.textContent = "Toca otra vez para borrarlas"; setTimeout(() => { b.textContent = "Borrar las fotos"; }, 5000); return; }
        borrarSeguro = 0; b.textContent = "Borrar las fotos";
        try { await pedido((await almacen("readwrite")).clear()); } catch (e) { /* nada que borrar */ }
        pintarMuestras();
        avisar("Se borraron las fotos guardadas en este aparato.", "bien");
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
        pintarCoronacion();
        pintarFotos();
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
    /* Lo que se manda: la partida entera la primera vez, cuando la piden
     * (alguien que recién llega o que se perdió algo) o cuando cambia algo que
     * no es una jugada más (otra partida, otros nombres, «Deshacer»); si no,
     * solo lo nuevo (V.loNuevo: unos 150 bytes en vez de la partida entera).
     * Cada 20 mensajes va la entera igual, por si alguien se perdió uno sin
     * darse cuenta. */
    /* Sin señal: la cámara sigue leyendo y anotando (la partida se guarda en
     * el celular), y se dice. Al volver, se manda entera: quien mira no se
     * pierde nada. Realtime se vuelve a conectar solo; «online» lo apura. */
    let estadoCanal = null;
    const sinRed = () => tableros.some((t) => t.vivo) && (navigator.onLine === false || (estadoCanal && estadoCanal !== "SUBSCRIBED"));
    function pintarRed() {
        const e = $("sin-red");
        const no = sinRed();
        if (e.hidden !== !no) e.hidden = !no;
    }
    window.addEventListener("online", () => { for (const t of tableros) if (t.vivo) enviarVivo(t, true); pintarRed(); });
    window.addEventListener("offline", pintarRed);
    setInterval(pintarRed, 2000);
    const idPartida = (t) => Math.round(t.inicio || 0).toString(36) + "-" + t.i;
    let bytesMandados = 0;
    function enviarVivo(t, entera) {
        if (!t.vivo) return;
        const canal = canales.get(t.vivo.codigo);
        if (!canal) return;
        const v = vistaVivo(t);
        t.enviadas = v.n;
        const id = idPartida(t), nombres = nombresDe(t), donde = dondeDe(t);
        const clave = JSON.stringify([id, nombres, donde, retraso]);
        const hist = v.juego.history(), e = t.enviado;
        const extra = { tiempos: tiemposDe(t).slice(0, v.n), espera: v.espera, retraso, id };
        const sigue = !entera && e && e.clave === clave && e.cuenta < 20 && v.n >= e.n && hist.slice(0, e.n).join(" ") === e.jugadas;
        const payload = sigue ? V.loNuevo(id, v.juego, e.n, donde, v.resultado, extra) : V.estado(v.juego, nombres, donde, v.resultado, extra);
        t.enviado = { clave, n: v.n, resultado: v.resultado, jugadas: hist.join(" "), cuenta: sigue ? e.cuenta + 1 : 0 };
        bytesMandados += JSON.stringify(payload).length;
        canal.send({ type: "broadcast", event: "estado", payload });
    }
    // Con retraso, las jugadas van saliendo solas a medida que cumplen su tiempo.
    setInterval(() => { if (retraso) for (const t of tableros) if (t.vivo && vistaVivo(t).n !== t.enviadas) enviarVivo(t); }, 5000);
    function alertarArbitro(t, tipo) {
        const canal = t.vivo && canales.get(t.vivo.codigo), donde = dondeDe(t);
        if (!canal || !donde || !donde.torneo) return false; // el árbitro es el de un torneo
        canal.send({ type: "broadcast", event: "alerta", payload: { v: 1, torneo: donde.torneo, ronda: donde.ronda, mesa: donde.mesa, tablero: donde.tablero || undefined, tipo: tipo || "ilegal", t: Date.now() } });
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
            // Quien pide puede decir qué mesa le falta: contesta solo esa.
            canal.on("broadcast", { event: "pedir" }, (msg) => {
                const mesa = msg && msg.payload && Number(msg.payload.mesa), tb = msg && msg.payload && Number(msg.payload.tablero);
                tableros.filter((o) => o.vivo && o.vivo.codigo === codigo && (!mesa || ((o.mesa || o.simul) === mesa && (!tb || o.tablero === tb)))).forEach((o) => enviarVivo(o, true));
            });
            canal.subscribe((st) => {
                estadoCanal = st;
                if (st === "SUBSCRIBED") tableros.filter((o) => o.vivo && o.vivo.codigo === codigo).forEach((o) => enviarVivo(o, true));
            });
            canales.set(codigo, canal);
        } else enviarVivo(t, true);
        if (!torneo) guardarCodigo(t, codigo);
        pintarVivo();
    }
    function pararVivo(t) {
        const codigo = t.vivo && t.vivo.codigo;
        t.vivo = null; t.enviado = null;
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
        $("vivo-codigo").textContent = t.vivo.codigo + (torneo && t.mesa ? " · mesa " + t.mesa + (t.tablero ? " · tablero " + t.tablero : "") : "")
            + (!torneo && t.simul ? " · tablero " + t.simul + " de la simultánea" : "") + (retraso ? " · con " + retraso + " minutos de retraso" : "");
        // En una simultánea, el enlace de cada alumno abre su tablero en grande.
        $("vivo-alumno").hidden = !(!torneo && t.simul);
        if (!torneo && t.simul) { const al = $("vivo-enlace-alumno"); al.href = al.textContent = url + "&m=" + t.simul; }
        $("vivo-whatsapp").href = "https://wa.me/?text=" + encodeURIComponent((torneo ? "Mira el torneo en vivo: " : "Mira la partida en vivo: ") + url);
        const qr = $("vivo-qr");
        if (qr.dataset.url === url) return;
        qr.dataset.url = url;
        qr.textContent = "";
        // En modo mesa no se muestra: ni se carga la librería del QR.
        if (document.documentElement.classList.contains("camara-mesa")) return;
        cargarQr().then(() => {
            if (qr.dataset.url !== url) return;
            const svg = window.QrSvg.dibujar(url, torneo ? "Código QR para ver el torneo en vivo" : "Código QR para ver la partida en vivo");
            if (svg) qr.replaceChildren(svg);
        }, () => { /* sin el QR: queda el enlace */ });
    }
    /* La librería del QR (57 KB) se carga recién cuando hace falta: el
     * celular que va encima de una mesa nunca la usa. */
    let cargaQr = null;
    function cargarQr() {
        const una = (src) => new Promise((ok, mal) => { const sc = document.createElement("script"); sc.src = src; sc.onload = ok; sc.onerror = () => mal(new Error(src)); document.head.append(sc); });
        if (!cargaQr) cargaQr = (window.qrcode ? Promise.resolve() : una("js/vendor/qrcode.js")).then(() => (window.QrSvg ? null : una("js/qr-svg.js")));
        cargaQr.catch(() => { cargaQr = null; });
        return cargaQr;
    }

    /* ── Un torneo de Pareo Integral ────────────────────────────────────
     * La cámara queda fija en una MESA (física): en cada ronda se sientan
     * otros. Los nombres salen del torneo publicado, de la ronda en que se
     * calibró la partida; cuando Pareo empareja la ronda siguiente, se avisa
     * para empezar la partida nueva. Se vuelve a leer el torneo cada minuto. */
    const TORNEO = "camara_torneo_v1", MESA = delPuesto("camara_mesa_v1") + "_";
    let torneo = null; // { id, nombre, datos, codigo }
    let relojTorneo = null;

    /* El lugar de la cámara: su mesa y, en un torneo por equipos, su tablero
     * (cada tablero de un encuentro es una partida). Se guarda como «5» o
     * «5.2». */
    const lugarTexto = (t) => (t.mesa ? t.mesa + (t.tablero ? "." + t.tablero : "") : "");
    function ponerLugar(t, texto) {
        const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(texto || ""));
        t.mesa = m ? Number(m[1]) : null;
        t.tablero = m && m[2] ? Number(m[2]) : null;
    }
    const esSuya = (x, t) => x.mesa === t.mesa && (x.tablero || null) === (t.tablero || null);
    const lugarDe = (t) => V.lugar({ mesa: t.mesa, tablero: t.tablero });

    function nombresDe(t) {
        if (torneo && t.mesa) {
            const r = V.mesasDe(torneo.datos, t.ronda);
            const m = r && r.mesas.find((x) => esSuya(x, t));
            if (m) return { blancas: m.blancas, negras: m.negras };
        }
        return t.nombres;
    }
    const dondeDe = (t) => (torneo && t.mesa ? { torneo: torneo.id, ronda: t.ronda || ultimaRonda(), mesa: t.mesa, tablero: t.tablero || null }
        : !torneo && t.simul ? { simul: true, mesa: t.simul } : null); // una simultánea: su tablero, sin torneo
    const ultimaRonda = () => { const r = torneo && V.mesasDe(torneo.datos); return r ? r.ronda : null; };

    async function leerTorneo(id) {
        const { data, error } = await window.sb.from("pareo_publicados").select("id,nombre,datos").eq("id", id).maybeSingle();
        if (error) throw error;
        return data;
    }

    /* El último torneo leído se guarda en el celular: si se recarga la
     * página sin señal, la mesa sigue con sus nombres (hasta 400 KB). */
    const TORNEO_DATOS = "camara_torneo_datos_v1";
    async function usarTorneo(id, codigo) {
        let fila;
        try {
            fila = await leerTorneo(id);
            try { const x = JSON.stringify(fila); if (fila && x.length < 400000) localStorage.setItem(TORNEO_DATOS, x); } catch (e) { /* sin almacenamiento */ }
        } catch (e) {
            try { fila = JSON.parse(localStorage.getItem(TORNEO_DATOS) || "null"); } catch (x) { fila = null; }
            if (!fila || fila.id !== id) { avisar("No se pudo leer el torneo. Revisa la conexión y vuelve a intentar.", "error"); return "red"; }
        }
        if (!fila) { avisar("No encuentro ese torneo en Torneos en Pareo Integral. Revisa el enlace.", "error"); return; }
        if (!V.mesasDe(fila.datos)) { avisar("Ese torneo todavía no tiene ninguna ronda emparejada.", "error"); return; }
        torneo = { id: fila.id, nombre: fila.nombre || (fila.datos && fila.datos.nombre) || "Torneo", datos: fila.datos, codigo: V.codigoValido(codigo) ? codigo : V.nuevoCodigo() };
        // El retraso es del torneo (todas sus cámaras igual): el que ya tenía, si es el mismo.
        let antes = null;
        try { antes = JSON.parse(localStorage.getItem(TORNEO) || "null"); } catch (e) { /* nada */ }
        torneo.retraso = antes && antes.id === torneo.id && antes.retraso ? antes.retraso : retraso;
        try { localStorage.setItem(TORNEO, JSON.stringify({ id: torneo.id, codigo: torneo.codigo, retraso: torneo.retraso })); } catch (e) { /* sin almacenamiento */ }
        retraso = torneo.retraso; $("vivo-retraso").value = String(retraso);
        for (const t of tableros) {
            let m = null;
            try { m = localStorage.getItem(MESA + t.i); } catch (e) { /* sin almacenamiento */ }
            ponerLugar(t, m); t.ronda = t.ronda || ultimaRonda();
        }
        pintarTorneo();
        clearInterval(relojTorneo);
        relojTorneo = setInterval(refrescarTorneo, 60000);
        // Lo que ya se transmitía pasa al canal del torneo.
        for (const t of tableros) if (t.vivo) empezarVivo(t, torneo.codigo);
        avisar("Torneo elegido: " + torneo.nombre + ". Elige en qué " + (torneo.datos.tipo === "equipos" ? "mesa y tablero" : "mesa") + " está esta cámara.", "bien");
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
            const t = T(), m = t.mesa && V.mesasDe(torneo.datos).mesas.find((x) => esSuya(x, t));
            avisar("Empezó la ronda " + ahora + (m ? ": en la " + lugarDe(t).toLowerCase() + " juegan " + m.blancas + " y " + m.negras : "") + ". Pon las piezas en la posición inicial y toca «Calibrar con la posición inicial».", "bien");
        }
    }

    function dejarTorneo() {
        torneo = null;
        clearInterval(relojTorneo);
        try { localStorage.removeItem(TORNEO); } catch (e) { /* sin almacenamiento */ }
        for (const t of tableros) { if (t.vivo) pararVivo(t); t.mesa = null; t.tablero = null; }
        pintarTorneo();
    }

    function elegirMesa(texto) {
        const t = T();
        ponerLugar(t, texto);
        try { if (t.mesa) localStorage.setItem(MESA + t.i, lugarTexto(t)); else localStorage.removeItem(MESA + t.i); } catch (e) { /* sin almacenamiento */ }
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
        vacia.value = ""; vacia.textContent = torneo.datos.tipo === "equipos" ? "Elige la mesa y el tablero…" : "Elige la mesa…";
        sel.append(vacia);
        r.mesas.forEach((m) => {
            const o = document.createElement("option");
            o.value = lugarTexto(m);
            o.textContent = V.lugar(m) + ": " + m.blancas + " – " + m.negras + (m.equipoBlancas ? " (" + m.equipoBlancas + " – " + m.equipoNegras + ")" : "");
            sel.append(o);
        });
        sel.value = lugarTexto(T());
        if (T().mesa) { const nm = nombresDe(T()); $("vivo-blancas").value = nm.blancas || ""; $("vivo-negras").value = nm.negras || ""; }
    }

    /* Un QR por mesa, para pegarlo en la mesa: se escanea con el celular que
     * va encima y la cámara se abre con el torneo, el código y la mesa puestos
     * (y empieza a transmitir). Va después del # (no llega al servidor):
     * «camara-tablero.html#t=<id del torneo>&c=<código>&m=<mesa>&r=<retraso>»,
     * y en un torneo por equipos también «&b=<tablero>».
     * Con el QR la cámara anda SIN CUENTA, en «modo mesa» (ver init). La hoja
     * sale solo al imprimir, con la marca de agua de Ajedrez Integral. */
    const enlaceMesa = (m) => new URL("camara-tablero.html#t=" + torneo.id + "&c=" + torneo.codigo + "&m=" + m.mesa + (m.tablero ? "&b=" + m.tablero : "") + "&r=" + retraso, location.href).href;
    function deLaDireccion() {
        const x = new URLSearchParams(location.hash.replace(/^#/, ""));
        const id = V.torneoDe(x.get("t")), c = (x.get("c") || "").toLowerCase(), m = Number(x.get("m")), r = Number(x.get("r")) || 0;
        const b = x.has("b") ? Number(x.get("b")) : null;
        if (b !== null && !(Number.isInteger(b) && b >= 1 && b <= 12)) return null;
        return id && V.codigoValido(c) && Number.isInteger(m) && m >= 1 && m <= 999 ? { id, codigo: c, mesa: m, tablero: b, retraso: r } : null;
    }
    async function imprimirQr() {
        if (!torneo) return;
        try { await cargarQr(); } catch (e) { avisar("No se pudo cargar lo que dibuja los QR. Revisa la conexión y vuelve a intentar.", "error"); return; }
        const r = V.mesasDe(torneo.datos);
        const hoja = $("hoja-qr");
        hoja.textContent = "";
        const el = (tag, clase, texto) => { const e = document.createElement(tag); e.className = clase; if (texto) e.textContent = texto; return e; };
        for (const m of r.mesas) {
            const tarjeta = el("div", "hoja-qr-mesa");
            tarjeta.dataset.enlace = enlaceMesa(m);
            const qr = el("div", "hoja-qr-codigo");
            const svg = window.QrSvg.dibujar(enlaceMesa(m), "Código QR de la cámara de la " + V.lugar(m).toLowerCase());
            if (svg) qr.append(svg);
            tarjeta.append(el("p", "hoja-qr-numero", V.lugar(m)), el("p", "hoja-qr-torneo", torneo.nombre), qr,
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

    /* ── Leer gastando poco ──────────────────────────────────────────────
     * Ver «La cámara gasta poco» en docs/decisiones/juegos-y-torneos.md.
     *  · Solo el pedazo de la imagen donde están los tableros (con un margen),
     *    no la imagen entera: de un celular encima del tablero, el tablero
     *    ocupa a veces la mitad.
     *  · Con el tablero quieto un rato (alguien piensa), se lee 2 veces por
     *    segundo en vez de 5; apenas algo cambia, vuelve a 5.
     *  · En su propio hilo (js/lector-tablero-worker.js): la página no se
     *    traba, y en camaras.html cada cámara lee en el suyo. Si el navegador
     *    no puede (sin OffscreenCanvas o createImageBitmap), se lee acá. */
    const LENTO_MS = 500, QUIETO_MS = 10000;
    const gasto = { lecturas: 0, pixeles: 0, dibujos: 0, enHilo: 0, afinadas: 0 };
    function recorte() {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const t of tableros) {
            if (!t.h || !t.cal) continue;
            for (const [x, y] of t.esquinas) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        }
        if (x0 === Infinity) return null;
        const m = 0.04 * Math.max(x1 - x0, y1 - y0) + 2;
        const x = Math.max(0, Math.floor(x0 - m)), y = Math.max(0, Math.floor(y0 - m));
        const w = Math.min(limpio.width, Math.ceil(x1 + m)) - x, h = Math.min(limpio.height, Math.ceil(y1 + m)) - y;
        return w > 0 && h > 0 ? { x, y, w, h } : null;
    }
    // Apurado: algún tablero todavía no se fió de lo que ve, o algo cambió hace poco.
    const apurado = (ahora) => ahora - ultimoCambio < QUIETO_MS
        || tableros.some((t) => t.h && t.cal && (t.recientes.length < QUIETA || t.recientes.some((x) => x !== t.quieta)));

    /* ── La luz que cambia ──────────────────────────────────────────────
     * Mientras lo que se lee es la partida (nada raro), cada 15 segundos se
     * vuelve a calibrar con la posición que se sabe y se mezcla con la de
     * antes: así la cámara sigue al sol que se corre o a la nube que pasa,
     * antes de que empiece a leer mal. Y si de golpe se leen mal varias
     * casillas (alguien prendió la luz), antes de avisar una jugada ilegal
     * se prueba con la luz de ahora: si con ella se lee la partida entera,
     * 64 de 64, era la luz (ver luzNueva). */
    const AFINAR_MS = 15000;
    function muestrasDe(t) {
        cctx.drawImage(fuente, 0, 0, limpio.width, limpio.height);
        return muestras(cctx.getImageData(0, 0, limpio.width, limpio.height).data, limpio.width, limpio.height, t.h);
    }
    function afinarLuz(t, ahora) {
        if (!fuente || !t.h || !t.cal || ahora - (t.afinada || 0) < AFINAR_MS) return;
        t.afinada = ahora;
        const sabida = esperada(t.juego), todas = muestrasDe(t), nueva = calibrar(todas, sabida);
        if (diferentes(leer(todas, nueva), sabida).length) return; // con la nueva no se lee perfecta: no se toca
        t.cal = mezclarCal(t.cal, nueva, 0.3);
        gasto.afinadas++;
    }
    function luzNueva(t) {
        if (!fuente || !t.h) return false;
        const sabida = esperada(t.juego), todas = muestrasDe(t), nueva = calibrar(todas, sabida);
        if (diferentes(leer(todas, nueva), sabida).length) return false;
        t.cal = nueva; t.afinada = performance.now();
        t.recientes = []; t.quieta = null;
        return true;
    }
    function procesar(t, det, ahora) {
        if (det.lectura !== t.lectura) { ultimoCambio = ahora; pintarYa = true; }
        t.lectura = det.lectura; t.seguridad = det.seguridad;
        if (t.cal && det.lectura === esperada(t.juego)) afinarLuz(t, ahora);
        t.recientes.push(t.lectura);
        if (t.recientes.length > QUIETA) t.recientes.shift();
        if (t.recientes.length === QUIETA && t.recientes.every((x) => x === t.lectura) && t.lectura !== t.quieta) {
            t.quieta = t.lectura;
            revisar(t, t.lectura, t.seguridad);
        }
    }
    function despuesDeLeer() {
        const t = T();
        if (t.lectura) $("acierto").textContent = (64 - diferentes(t.lectura, esperada(t.juego)).length) + " de 64";
    }

    let hilo = null, enCamino = null, pedidos = 0;
    function abrirHilo() {
        if (hilo !== null) return hilo;
        hilo = false;
        if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") return hilo;
        try {
            hilo = new Worker("js/lector-tablero-worker.js");
            hilo.onmessage = (e) => recibirDelHilo(e.data);
            hilo.onerror = () => { hilo = false; enCamino = null; }; // se sigue leyendo acá
        } catch (e) { hilo = false; }
        return hilo;
    }
    function recibirDelHilo(r) {
        const pedido = enCamino;
        if (!pedido || r.id !== pedido.id) return;
        enCamino = null;
        if (r.error) { hilo.terminate(); hilo = false; return; }
        if (pedido.fuenteVer !== fuenteVer) return; // otra imagen: no vale
        const ahora = performance.now();
        for (const x of r.lecturas) {
            const t = tableros[x.i], antes = pedido.tableros.find((y) => y.i === x.i);
            // Si se recalibró o se movieron las esquinas mientras tanto, no vale.
            if (!t || !antes || t.h !== antes.h || t.cal !== antes.cal) continue;
            procesar(t, x, ahora);
        }
        despuesDeLeer();
    }

    function leerTableros(ahora) {
        const cada = apurado(ahora) ? CADA_MS : LENTO_MS;
        if (ahora - ultimaMirada < cada * 0.9 || !tableros.some((t) => t.h && t.cal) || enCamino) return;
        const r = recorte();
        if (!r) return;
        ultimaMirada = ahora;
        gasto.lecturas++; gasto.pixeles += r.w * r.h;
        const listos = tableros.filter((t) => t.h && t.cal);
        if (abrirHilo()) {
            const ex = anchoFuente() / limpio.width, ey = altoFuente() / limpio.height;
            const pedido = { id: ++pedidos, fuenteVer, tableros: listos.map((t) => ({ i: t.i, h: t.h, cal: t.cal })) };
            enCamino = pedido;
            gasto.enHilo++;
            createImageBitmap(fuente, Math.round(r.x * ex), Math.round(r.y * ey), Math.max(1, Math.round(r.w * ex)), Math.max(1, Math.round(r.h * ey)), { resizeWidth: r.w, resizeHeight: r.h, resizeQuality: "low" })
                .then((imagen) => {
                    if (enCamino !== pedido) { imagen.close(); return; }
                    hilo.postMessage({ id: pedido.id, imagen, ox: r.x, oy: r.y, tableros: pedido.tableros }, [imagen]);
                })
                .catch((e) => {
                    if (enCamino === pedido) enCamino = null;
                    // La imagen todavía no está (la cámara recién abre o se trabó): se vuelve a intentar.
                    if (e && e.name === "InvalidStateError") return;
                    if (hilo) hilo.terminate();
                    hilo = false;
                });
            // Si el hilo no contesta en 2 s, se suelta y se vuelve a pedir.
            setTimeout(() => { if (enCamino === pedido) enCamino = null; }, 2000);
            return;
        }
        // Acá mismo: solo el recorte.
        cctx.drawImage(fuente, r.x * anchoFuente() / limpio.width, r.y * altoFuente() / limpio.height, r.w * anchoFuente() / limpio.width, r.h * altoFuente() / limpio.height, r.x, r.y, r.w, r.h);
        const pix = cctx.getImageData(r.x, r.y, r.w, r.h).data;
        for (const t of listos) procesar(t, leerDetalle(muestras(pix, r.w, r.h, t.h, r.x, r.y), t.cal), ahora);
        despuesDeLeer();
    }
    // Para el verificador y para «Cómo van las cámaras»: cuánto trabaja.
    window.gastoCamara = () => Object.assign({ hilo: !!hilo, lento: !apurado(performance.now()) }, gasto);

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
    setInterval(() => { if (fuente) leerTableros(performance.now()); }, CADA_MS);

    /* Dibujar la imagen con su cuadrícula cuesta (60 veces por segundo, la
     * imagen entera): mientras se ubica el tablero va a todo lo que dé; ya
     * calibrado, 2 veces por segundo, o apenas cambia algo (pintarYa). Con
     * «Ahorrar batería», nada. */
    const DIBUJO_LENTO_MS = 500;
    let ultimoDibujo = 0;
    function dibujar(ahora) {
        requestAnimationFrame(dibujar);
        if (!fuente || ahorro) return;
        ahora = ahora || performance.now();
        const ubicando = arrastre >= 0 || buscando || tableros.some((t) => !t.cal);
        if (!ubicando && !pintarYa && ahora - ultimoDibujo < DIBUJO_LENTO_MS) return;
        pintarYa = false; ultimoDibujo = ahora; gasto.dibujos++;
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
    try { $("muestras-si").checked = localStorage.getItem(MUESTRAS_SI) === "1"; } catch (e) { /* sin almacenamiento: apagado */ }
    $("muestras-si").addEventListener("change", () => { try { localStorage.setItem(MUESTRAS_SI, $("muestras-si").checked ? "1" : "0"); } catch (e) { /* solo por esta visita */ } });
    $("btn-muestras-bajar").addEventListener("click", bajarMuestras);
    $("btn-muestras-borrar").addEventListener("click", borrarMuestras);
    if (window.indexedDB) pintarMuestras();
    document.querySelectorAll("[data-corona]").forEach((b) => b.addEventListener("click", () => elegirCoronacion(T(), b.dataset.corona)));
    $("form-anotar").addEventListener("submit", (e) => {
        e.preventDefault();
        const t = T(), texto = $("jugada-mano").value;
        const m = window.ComandosTablero && window.ComandosTablero.jugadaEscrita(t.juego, texto);
        if (!m) { avisar(cual(t) + "«" + texto.trim() + "» no es una jugada legal en esta partida. " + V.comoVa(t.juego), "error"); return; }
        $("jugada-mano").value = "";
        anotar(t, [m.san]);
        if (m.promotion) { t.confirmadas.add(t.juego.history().length - 1); pintarCoronacion(); } // la escribió: ya dijo cuál
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
        t.resultadoMano = null; t.confirmadas = new Set(j.history({ verbose: true }).map((m, i) => (m.promotion ? i : -1)));
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
    $("btn-vivo").addEventListener("click", () => {
        const t = T();
        if (torneo) { empezarVivo(t, torneo.codigo); return; }
        // Una simultánea: el número de tablero y, si otra cámara ya la empezó, su código.
        const n = Number($("simul-tablero").value), c = $("simul-codigo").value.trim().toLowerCase();
        t.simul = Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
        if (c && !V.codigoValido(c)) { avisar("Ese código de simultánea no es válido: son 8 letras y números, como los muestra la primera cámara.", "error"); return; }
        if (t.simul) { empezarVivo(t, c || V.nuevoCodigo()); return; }
        empezarVivo(t, codigoGuardado(t) || V.nuevoCodigo());
    });
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
    $("torneo-mesa").addEventListener("change", (e) => elegirMesa(e.target.value));
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
            calibrada: !!t.cal, mesa: t.mesa || null, tablero: t.tablero || null, transmitiendo: !!t.vivo,
            dudas: !$("dudas").hidden, error: ultimoAviso.tipo === "error" ? ultimoAviso.texto : "",
            jugadas: t.juego.history().length, resultado: resultadoDe(t), sinRed: sinRed(),
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
        // Quien administra y quien da clase (la cámara en la clase en vivo:
        // js/clase-camara.js). Un alumno, no: en un torneo entra por el QR.
        const { data: perfil } = await sb.from("profiles").select("is_admin, role").eq("id", session.user.id).maybeSingle();
        $("loading").classList.add("hidden");
        if (!perfil || !(perfil.is_admin || perfil.role === "profesor")) { $("denegado").classList.remove("hidden"); return; }
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
        $("mesa-titulo-qr").textContent = V.lugar(qr);
        try { localStorage.setItem(MESA + 0, lugarTexto(qr)); } catch (e) { /* sin almacenamiento */ }
        // Sin señal y sin el torneo guardado: la cámara abre igual y anota;
        // el torneo se vuelve a pedir cada 10 segundos y al volver la señal.
        if (await usarTorneo(qr.id, qr.codigo) === "red") {
            await abrirCamara();
            const otraVez = async () => {
                if (torneo || await usarTorneo(qr.id, qr.codigo) === "red") return;
                clearInterval(reintento); window.removeEventListener("online", otraVez);
                if (torneo) mesaLista(qr);
            };
            const reintento = setInterval(otraVez, 10000);
            window.addEventListener("online", otraVez);
            return;
        }
        if (!torneo) return;
        mesaLista(qr);
        await abrirCamara();
        if (fuente) avisar(V.lugar(qr) + " de " + torneo.nombre + ", transmitiendo. Toca «Buscar el tablero» y, con las piezas en la posición inicial, «Calibrar con la posición inicial».", "bien");
    }
    function mesaLista(qr) {
        elegirRetraso(qr.retraso, true);
        $("mesa-titulo-qr").textContent = V.lugar(qr) + " · " + torneo.nombre;
        pintarTorneo();
        empezarVivo(T(), torneo.codigo);
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
            // Lo guardado ya pasó: sus coronaciones no se vuelven a preguntar.
            tableros[0].confirmadas = new Set(j.history({ verbose: true }).map((m, i) => (m.promotion ? i : -1)));
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
