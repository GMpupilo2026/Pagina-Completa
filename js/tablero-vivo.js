/* El código de tablero-vivo.html: mirar en vivo la partida que transmite la
 * cámara encima de un tablero de verdad (camara-tablero.html). Sin cuenta: el
 * código va en la dirección, después del #, y nunca llega al servidor.
 *
 * Solo escucha: pide la partida al conectarse («pedir») y pinta cada
 * «estado» que llega, después de volver a jugarlo con chess.js
 * (PartidaEnVivo.leer). Si en 8 segundos no llega nada, dice que está
 * esperando y sigue escuchando: quien transmite puede no haber empezado.
 * Ver «La partida en vivo desde la cámara» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
    "use strict";
    const P = window.PartidaEnVivo;
    const $ = (id) => document.getElementById(id);
    const ESPERA_MS = 8000;

    let canal = null, juego = null, girado = false, ultimoT = 0, ultimaDicha = "";
    let nombres = { blancas: "", negras: "" };
    let reloj = null;

    function estadoConexion(texto, tipo) {
        const e = $("conexion");
        e.textContent = texto;
        e.className = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold " + (tipo === "vivo"
            ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100"
            : tipo === "error" ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
            : "bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100");
    }

    // Quien juega con cada color, del lado del tablero donde están sus piezas.
    function jugadores() {
        const linea = (color) => (color === "w" ? "Blancas: " : "Negras: ") + ((color === "w" ? nombres.blancas : nombres.negras) || "sin nombre");
        $("jugador-arriba").textContent = linea(girado ? "w" : "b");
        $("jugador-abajo").textContent = linea(girado ? "b" : "w");
    }

    function pintar() {
        if (!juego) return;
        P.pintar($("tablero"), juego, { girado });
        jugadores();
        $("jugadas").textContent = P.jugadasTexto(juego) || "Todavía no se ha jugado nada.";
        const texto = P.comoVa(juego);
        $("ultima").textContent = texto;
        // Al lector de pantalla, solo cuando cambia de verdad.
        if (texto !== ultimaDicha) { $("anuncio").textContent = texto; ultimaDicha = texto; }
    }
    function alLlegar(payload) {
        const d = P.leer(payload);
        if (!d || d.t < ultimoT) return; // lo viejo no pisa lo nuevo
        ultimoT = d.t;
        juego = d.juego;
        nombres = { blancas: d.blancas, negras: d.negras };
        $("partida").hidden = false;
        $("esperando").hidden = true;
        estadoConexion("● En vivo", "vivo");
        pintar();
    }

    async function conectar(codigo) {
        if (canal) { window.sb.removeChannel(canal); canal = null; }
        clearTimeout(reloj);
        juego = null; ultimoT = 0;
        $("pedir-codigo").hidden = true;
        $("visor").hidden = false;
        $("partida").hidden = true;
        $("esperando").hidden = true;
        $("codigo-visto").textContent = codigo;
        estadoConexion("Conectando…");
        canal = window.sb.channel(P.canal(codigo));
        canal.on("broadcast", { event: "estado" }, (msg) => alLlegar(msg.payload));
        canal.subscribe((st) => {
            if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} });
        });
        reloj = setTimeout(() => {
            if (juego) return;
            estadoConexion("Esperando la transmisión");
            $("esperando").hidden = false;
        }, ESPERA_MS);
    }

    function pedirOtraVez() {
        if (canal) canal.send({ type: "broadcast", event: "pedir", payload: {} });
    }

    function desdeLaDireccion() {
        const c = decodeURIComponent(location.hash.replace(/^#/, "")).trim().toLowerCase();
        if (P.codigoValido(c)) { conectar(c); return; }
        $("visor").hidden = true;
        $("pedir-codigo").hidden = false;
        if (c) $("codigo-error").textContent = "Ese código no es válido: son 8 letras y números, como aparecen en el celular que transmite.";
    }

    $("form-codigo").addEventListener("submit", (e) => {
        e.preventDefault();
        const c = $("codigo").value.replace(/\s+/g, "").toLowerCase();
        if (!P.codigoValido(c)) { $("codigo-error").textContent = "Ese código no es válido: son 8 letras y números, como aparecen en el celular que transmite."; $("codigo").focus(); return; }
        $("codigo-error").textContent = "";
        location.hash = c; // hashchange conecta
    });
    window.addEventListener("hashchange", desdeLaDireccion);
    window.addEventListener("online", pedirOtraVez);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pedirOtraVez(); });

    $("girar").addEventListener("click", () => {
        girado = !girado;
        $("girar").setAttribute("aria-pressed", String(girado));
        pintar();
    });
    $("copiar").addEventListener("click", async () => {
        if (!juego) return;
        try { await navigator.clipboard.writeText(juego.pgn()); $("copiar-msg").textContent = "PGN copiado."; }
        catch (e) { $("copiar-msg").textContent = "No se pudo copiar."; }
    });

    desdeLaDireccion();
})();
