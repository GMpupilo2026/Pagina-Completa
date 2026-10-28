/* El código de tablero-vivo.html: mirar en vivo la partida que transmite la
 * cámara encima de un tablero de verdad (camara-tablero.html). Sin cuenta: el
 * código va en la dirección, después del #, y nunca llega al servidor.
 *
 * Solo escucha: pide la partida al conectarse («pedir») y pinta cada
 * «estado» que llega, después de volver a jugarlo con chess.js
 * (PartidaEnVivo.leer). Si en 8 segundos no llega nada, dice que está
 * esperando y sigue escuchando: quien transmite puede no haber empezado.
 *
 * En un torneo («#código&t=<id del torneo>»), todas las cámaras transmiten
 * por el mismo canal y cada mensaje trae su mesa: se ven todas las mesas de
 * la ronda en una cuadrícula (los nombres, del torneo publicado en Pareo
 * Integral, también las que no tienen cámara) y al tocar una, en grande.
 * Ver «La partida en vivo desde la cámara» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
    "use strict";
    const P = window.PartidaEnVivo;
    const $ = (id) => document.getElementById(id);
    const ESPERA_MS = 8000;

    let canal = null, girado = false, ultimaDicha = "";
    let reloj = null, relojTorneo = null;
    const partidas = new Map(); // «m3» o «solo» → { juego, blancas, negras, t, mesa, ronda }
    let torneoId = null, torneoDatos = null;
    let elegida = null;         // la que se ve en grande; null = la cuadrícula
    const enTorneo = () => !!torneoId || [...partidas.values()].some((x) => x.mesa);

    function estadoConexion(texto, tipo) {
        const e = $("conexion");
        e.textContent = texto;
        e.className = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold " + (tipo === "vivo"
            ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100"
            : tipo === "error" ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
            : "bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100");
    }

    // Las mesas del torneo: las de la última ronda emparejada, más las que
    // transmiten aunque no estén ahí (una ronda anterior que sigue).
    function mesasTorneo() {
        const lista = [];
        const r = torneoDatos && P.mesasDe(torneoDatos);
        if (r) r.mesas.forEach((m) => lista.push({ clave: "m" + m.mesa, mesa: m.mesa, blancas: m.blancas, negras: m.negras, ronda: r.ronda }));
        for (const [clave, x] of partidas) {
            if (x.mesa && !lista.some((m) => m.clave === clave)) lista.push({ clave, mesa: x.mesa, blancas: x.blancas, negras: x.negras, ronda: x.ronda });
        }
        return lista.sort((a, b) => a.mesa - b.mesa);
    }

    // Cómo va, con el resultado si ya terminó (el mate y el ahogado ya los dice comoVa).
    const comoVa = (x) => P.comoVa(x.juego) + (x.resultado && !x.juego.in_checkmate() && !x.juego.in_stalemate() ? " " + P.textoResultado(x.resultado) : "");

    // Quien juega con cada color, del lado del tablero donde están sus piezas.
    function jugadores(nombres) {
        const linea = (color) => (color === "w" ? "Blancas: " : "Negras: ") + ((color === "w" ? nombres.blancas : nombres.negras) || "sin nombre");
        $("jugador-arriba").textContent = linea(girado ? "w" : "b");
        $("jugador-abajo").textContent = linea(girado ? "b" : "w");
    }

    function pintarGrande() {
        const x = partidas.get(elegida);
        $("partida").hidden = !x;
        $("volver").hidden = !enTorneo();
        $("mesa-titulo").textContent = x && x.mesa ? "Mesa " + x.mesa + (x.ronda ? " · ronda " + x.ronda : "") : "";
        $("mesa-titulo").hidden = !$("mesa-titulo").textContent;
        if (!x) return;
        P.pintar($("tablero"), x.juego, { girado });
        jugadores(x);
        $("jugadas").textContent = P.jugadasTexto(x.juego) || "Todavía no se ha jugado nada.";
        const texto = comoVa(x);
        $("ultima").textContent = texto;
        // Al lector de pantalla, solo cuando cambia de verdad.
        if (texto !== ultimaDicha) { $("anuncio").textContent = texto; ultimaDicha = texto; }
    }

    function pintarCuadricula() {
        const caja = $("mesas-lista");
        caja.textContent = "";
        $("torneo-titulo").textContent = torneoDatos && torneoDatos.nombre ? torneoDatos.nombre : "Las mesas en vivo";
        for (const m of mesasTorneo()) {
            const x = partidas.get(m.clave);
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.mesa = String(m.mesa);
            b.className = "text-left bg-white dark:bg-brand-900 rounded-2xl shadow-md p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 hover:ring-2 hover:ring-accent-400";
            const titulo = document.createElement("p");
            titulo.className = "font-semibold text-brand-800 dark:text-white";
            titulo.textContent = "Mesa " + m.mesa;
            const quien = document.createElement("p");
            quien.className = "text-xs text-brand-600 dark:text-brand-300 mb-2";
            quien.textContent = ((x && x.blancas) || m.blancas || "Blancas") + " – " + ((x && x.negras) || m.negras || "Negras");
            const tab = document.createElement("div");
            tab.className = "grid grid-cols-8 grid-rows-8 aspect-square w-full rounded overflow-hidden select-none";
            tab.setAttribute("aria-hidden", "true");
            const como = document.createElement("p");
            como.className = "text-xs text-brand-700 dark:text-brand-200 mt-2";
            if (x) {
                P.pintar(tab, x.juego, { coordenadas: false });
                como.textContent = comoVa(x);
            } else {
                P.pintar(tab, new window.Chess(), { coordenadas: false });
                tab.classList.add("opacity-40");
                como.textContent = "Sin cámara en esta mesa.";
            }
            b.setAttribute("aria-label", titulo.textContent + ": " + quien.textContent + ". " + como.textContent);
            b.append(titulo, quien, tab, como);
            if (x) b.addEventListener("click", () => { elegida = m.clave; pintar(); $("volver").focus(); });
            else b.disabled = true;
            caja.append(b);
        }
    }

    function pintar() {
        const cuadricula = enTorneo() && !elegida;
        $("mesas").hidden = !cuadricula;
        if (cuadricula) { $("partida").hidden = true; $("volver").hidden = true; $("mesa-titulo").hidden = true; pintarCuadricula(); }
        else pintarGrande();
    }

    function alLlegar(payload) {
        const d = P.leer(payload);
        if (!d) return;
        if (torneoId && d.torneo && d.torneo !== torneoId) return; // de otro torneo
        const clave = d.mesa ? "m" + d.mesa : "solo";
        const antes = partidas.get(clave);
        if (antes && d.t < antes.t) return; // lo viejo no pisa lo nuevo
        partidas.set(clave, d);
        if (!d.mesa) elegida = "solo";
        $("esperando").hidden = true;
        estadoConexion("● En vivo", "vivo");
        pintar();
    }

    async function leerTorneo() {
        if (!torneoId) return;
        try {
            const { data } = await window.sb.from("pareo_publicados").select("nombre,datos").eq("id", torneoId).maybeSingle();
            if (data && data.datos) { torneoDatos = Object.assign({}, data.datos, { nombre: data.nombre || data.datos.nombre }); pintar(); }
        } catch (e) { /* se vuelve a intentar al minuto */ }
    }

    async function conectar(codigo, torneo) {
        if (canal) { window.sb.removeChannel(canal); canal = null; }
        clearTimeout(reloj); clearInterval(relojTorneo);
        partidas.clear(); elegida = null;
        torneoId = torneo; torneoDatos = null;
        $("pedir-codigo").hidden = true;
        $("visor").hidden = false;
        $("partida").hidden = true;
        $("mesas").hidden = true;
        $("esperando").hidden = true;
        $("codigo-visto").textContent = codigo;
        estadoConexion("Conectando…");
        if (torneoId) { leerTorneo(); relojTorneo = setInterval(leerTorneo, 60000); }
        canal = window.sb.channel(P.canal(codigo));
        canal.on("broadcast", { event: "estado" }, (msg) => alLlegar(msg.payload));
        canal.subscribe((st) => {
            if (st === "SUBSCRIBED") canal.send({ type: "broadcast", event: "pedir", payload: {} });
        });
        reloj = setTimeout(() => {
            if (partidas.size) return;
            estadoConexion("Esperando la transmisión");
            $("esperando").hidden = false;
        }, ESPERA_MS);
    }

    function pedirOtraVez() {
        if (canal) canal.send({ type: "broadcast", event: "pedir", payload: {} });
    }

    function desdeLaDireccion() {
        const partes = decodeURIComponent(location.hash.replace(/^#/, "")).trim().toLowerCase().split("&");
        const c = partes[0];
        const t = partes.map((x) => /^t=/.test(x) ? P.torneoDe(x) : null).find(Boolean) || null;
        if (P.codigoValido(c)) { conectar(c, t); return; }
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

    $("volver").addEventListener("click", () => { elegida = null; pintar(); });
    $("girar").addEventListener("click", () => {
        girado = !girado;
        $("girar").setAttribute("aria-pressed", String(girado));
        pintar();
    });
    $("copiar").addEventListener("click", async () => {
        const x = partidas.get(elegida);
        if (!x) return;
        try { await navigator.clipboard.writeText(x.juego.pgn()); $("copiar-msg").textContent = "PGN copiado."; }
        catch (e) { $("copiar-msg").textContent = "No se pudo copiar."; }
    });

    desdeLaDireccion();
})();
