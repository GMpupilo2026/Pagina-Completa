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
 *
 * En grande: repasar la partida jugada a jugada (con las flechas también),
 * cuánto pensó cada jugada y quién está pensando ahora, y, si se pide, la
 * evaluación de Stockfish (js/preparacion-motor.js, que se carga solo
 * entonces). Con un torneo, «Proyectar en la sala»: todas las mesas en
 * pantalla completa, de a 6, rotando. Si quien transmite eligió un retraso,
 * se dice arriba.
 * Ver «La partida en vivo desde la cámara» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
    "use strict";
    const P = window.PartidaEnVivo;
    const $ = (id) => document.getElementById(id);
    const ESPERA_MS = 8000;

    let canal = null, girado = false, ultimaDicha = "";
    let reloj = null, relojTorneo = null;
    const pedidas = new Map(); // mesa → cuándo se pidió entera (ver alLlegar)
    const partidas = new Map(); // «m3» o «solo» → { juego, blancas, negras, t, mesa, ronda }
    let torneoId = null, torneoDatos = null;
    let elegida = null;         // la que se ve en grande; null = la cuadrícula
    let paso = null;            // la jugada que se repasa; null = en vivo
    let proyectando = false, pagina = 0;
    const POR_PAGINA = 6, ROTAR_MS = 15000;
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

    // El tiempo de la jugada i (desde 0), si se sabe: «(pensó 1:23)».
    const penso = (x, i) => (i >= 0 && Number.isFinite(x.tiempos[i]) ? " (pensó " + P.reloj(x.tiempos[i]) + ")" : "");

    function pintarGrande() {
        const x = partidas.get(elegida);
        $("partida").hidden = !x;
        $("volver").hidden = !enTorneo();
        $("mesa-titulo").textContent = x && x.mesa ? "Mesa " + x.mesa + (x.ronda ? " · ronda " + x.ronda : "") : "";
        $("mesa-titulo").hidden = !$("mesa-titulo").textContent;
        if (!x) return;
        const hist = x.juego.history(), total = hist.length;
        if (paso !== null && paso >= total) paso = null; // ya es la última: en vivo
        const k = paso === null ? total : paso;
        const visto = k === total ? x.juego : P.hasta(x.juego, k);
        P.pintar($("tablero"), visto, { girado });
        jugadores(x);
        $("jugadas").textContent = P.jugadasTexto(x.juego) || "Todavía no se ha jugado nada.";
        $("ir-inicio").disabled = $("ir-atras").disabled = k === 0;
        $("ir-adelante").disabled = $("ir-final").disabled = k >= total;
        $("ir-vivo").hidden = paso === null;
        $("paso").textContent = paso === null ? (total ? "En vivo: la última jugada." : "")
            : (k === 0 ? "Repasando: la posición del principio." : "Repasando: jugada " + k + " de " + total + ", " + P.jugadasTexto(P.hasta(x.juego, k)).split(" ").slice(-1)[0] + penso(x, k - 1) + ".");
        evaluar(visto);
        const texto = comoVa(x) + (total && Number.isFinite(x.tiempos[total - 1]) ? " La pensó " + P.reloj(x.tiempos[total - 1]) + "." : "");
        $("ultima").textContent = texto;
        relojTurno();
        // Al lector de pantalla, solo cuando cambia de verdad.
        if (texto !== ultimaDicha) { $("anuncio").textContent = texto; ultimaDicha = texto; }
    }

    function pintarCuadricula() {
        const caja = $("mesas-lista");
        caja.textContent = "";
        $("torneo-titulo").textContent = torneoDatos && torneoDatos.nombre ? torneoDatos.nombre : "Las mesas en vivo";
        let lista = mesasTorneo();
        // Proyectando: de a 6 mesas, y la página cambia sola.
        const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
        if (pagina >= paginas) pagina = 0;
        $("proyector-pagina").hidden = !proyectando || paginas < 2;
        $("proyector-pagina").textContent = "Mesas " + (pagina * POR_PAGINA + 1) + " a " + Math.min(lista.length, (pagina + 1) * POR_PAGINA) + " de " + lista.length;
        if (proyectando) lista = lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
        for (const m of lista) caja.append(tarjetaMesa(m));
        caja.dataset.mesas = lista.map((m) => m.clave).join(",");
    }
    function tarjetaMesa(m) {
        const x = partidas.get(m.clave);
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.mesa = String(m.mesa);
        b.dataset.clave = m.clave;
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
        if (x) b.addEventListener("click", () => { if (proyectando) return; elegida = m.clave; paso = null; pintar(); $("volver").focus(); });
        else b.disabled = true;
        return b;
    }
    /* Una jugada en una mesa repinta solo esa tarjeta, no las 40 de la sala.
     * Si cambió qué mesas se ven (una cámara nueva), se arma entera. */
    function pintarMesa(clave) {
        const caja = $("mesas-lista");
        let lista = mesasTorneo();
        if (proyectando) lista = lista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
        const vieja = caja.querySelector('[data-clave="' + clave + '"]');
        if (caja.dataset.mesas !== lista.map((m) => m.clave).join(",")) { pintarCuadricula(); return; }
        if (!vieja) return; // en otra página del proyector
        const nueva = tarjetaMesa(lista.find((m) => m.clave === clave));
        const conFoco = document.activeElement === vieja;
        vieja.replaceWith(nueva);
        if (conFoco) nueva.focus();
    }

    function pintar() {
        const cuadricula = enTorneo() && !elegida;
        $("mesas").hidden = !cuadricula;
        if (cuadricula) { $("partida").hidden = true; $("volver").hidden = true; $("mesa-titulo").hidden = true; pintarCuadricula(); }
        else pintarGrande();
    }

    function alLlegar(payload) {
        if (!payload) return;
        if (torneoId && payload.torneo && payload.torneo !== torneoId) return; // de otro torneo
        const clave0 = payload.mesa ? "m" + payload.mesa : "solo";
        const antes = partidas.get(clave0);
        if (antes && Number(payload.t) < antes.t) return; // lo viejo no pisa lo nuevo
        const d = P.leer(payload, antes);
        if (!d) return;
        // Llegó solo lo nuevo y no calza (se perdió un mensaje): se pide esa mesa entera.
        if (d.falta) {
            // Una vez cada 3 s por mesa: lo nuevo que siga llegando mientras tanto tampoco calza.
            if (canal && !(Date.now() - (pedidas.get(clave0) || 0) < 3000)) { pedidas.set(clave0, Date.now()); canal.send({ type: "broadcast", event: "pedir", payload: d.mesa ? { mesa: d.mesa } : {} }); }
            return;
        }
        d.recibido = Date.now();
        if (torneoId && d.torneo && d.torneo !== torneoId) return;
        const clave = d.mesa ? "m" + d.mesa : "solo";
        const nueva = !antes;
        partidas.set(clave, d);
        if (!d.mesa) elegida = "solo";
        $("esperando").hidden = true;
        estadoConexion("● En vivo", "vivo");
        $("retraso-aviso").textContent = d.retraso ? "Con " + d.retraso + " minutos de retraso" : "";
        $("retraso-aviso").hidden = !d.retraso;
        // Solo lo que cambió: en la cuadrícula, esa tarjeta; en grande, si es la que se mira.
        const cuadricula = enTorneo() && !elegida;
        if (nueva || cuadricula !== !$("mesas").hidden) pintar();
        else if (cuadricula) pintarMesa(clave);
        else if (elegida === clave) pintarGrande();
    }

    /* Quién está pensando y desde hace cuánto (con el reloj de quien
     * transmite: lo que llevaba al mandarlo, más lo que pasó desde que llegó). */
    function relojTurno() {
        const x = partidas.get(elegida);
        const e = $("reloj-turno");
        if (!x || $("partida").hidden || x.resultado || x.juego.game_over() || x.espera === null) { e.textContent = ""; return; }
        e.textContent = "Piensan " + (x.juego.turn() === "w" ? "las blancas" : "las negras") + ": " + P.reloj(x.espera + Date.now() - x.recibido);
    }
    setInterval(relojTurno, 1000);

    /* La evaluación de Stockfish, si se pide: de la posición que se ve. */
    const evals = new Map();
    let cargaMotor = null;
    function cargar(src) {
        return new Promise((ok, mal) => { const sc = document.createElement("script"); sc.src = src; sc.onload = ok; sc.onerror = () => mal(new Error(src)); document.head.append(sc); });
    }
    function textoEval(v) {
        if (Math.abs(v) >= 90) return "Mate en " + Math.max(1, Math.round(100 - Math.abs(v))) + " para " + (v > 0 ? "las blancas" : "las negras");
        if (Math.abs(v) < 0.3) return "Igualado (" + (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2).replace(".", ",") + ")";
        return (v > 0 ? "+" : "−") + Math.abs(v).toFixed(2).replace(".", ",") + ": mejor " + (v > 0 ? "las blancas" : "las negras");
    }
    function evaluar(juego) {
        const caja = $("evaluacion");
        caja.hidden = !$("ver-motor").checked;
        if (caja.hidden) return;
        const fen = juego.fen();
        const pintarEval = (e) => {
            if (fen !== evaluar.fen) return;
            if (!e || e.eval == null) { $("evaluacion-texto").textContent = "Stockfish no pudo evaluar esta posición."; return; }
            const v = Math.max(-100, Math.min(100, e.eval));
            const pct = Math.abs(v) >= 90 ? (v > 0 ? 100 : 0) : 50 + 50 * Math.tanh(v / 4);
            $("evaluacion-blancas").style.width = pct.toFixed(1) + "%";
            $("evaluacion-texto").textContent = "Stockfish: " + textoEval(v) + ".";
        };
        evaluar.fen = fen;
        if (!cargaMotor) cargaMotor = cargar("js/shared-engine.js").then(() => cargar("js/preparacion-motor.js"));
        if (!evals.has(fen)) {
            $("evaluacion-texto").textContent = "Stockfish está evaluando…";
            evals.set(fen, cargaMotor.then(() => window.PreparacionMotor.evaluar(fen, 14)));
        }
        evals.get(fen).then(pintarEval, () => pintarEval(null));
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

    $("volver").addEventListener("click", () => { elegida = null; paso = null; pintar(); });

    // Repasar jugada a jugada (también con las flechas del teclado).
    function irA(k) {
        const x = partidas.get(elegida);
        if (!x) return;
        const total = x.juego.history().length;
        paso = k === null || k >= total ? null : Math.max(0, k);
        pintarGrande();
    }
    const actual = () => { const x = partidas.get(elegida); return paso === null ? (x ? x.juego.history().length : 0) : paso; };
    $("ir-inicio").addEventListener("click", () => irA(0));
    $("ir-atras").addEventListener("click", () => irA(actual() - 1));
    $("ir-adelante").addEventListener("click", () => irA(actual() + 1));
    $("ir-final").addEventListener("click", () => irA(null));
    $("ir-vivo").addEventListener("click", () => irA(null));
    document.addEventListener("keydown", (e) => {
        if ($("partida").hidden || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
        const mov = { ArrowLeft: () => irA(actual() - 1), ArrowRight: () => irA(actual() + 1), Home: () => irA(0), End: () => irA(null) }[e.key];
        if (mov) { e.preventDefault(); mov(); }
    });
    $("ver-motor").addEventListener("change", () => pintarGrande());

    // Proyectar en la sala: todas las mesas, en pantalla completa, rotando de a 6.
    let relojPagina = null;
    function proyectar(si) {
        proyectando = si;
        pagina = 0;
        $("mesas").classList.toggle("proyector", si);
        $("btn-proyectar").setAttribute("aria-pressed", String(si));
        $("btn-proyectar-texto").textContent = si ? "Dejar de proyectar" : "Proyectar en la sala";
        clearInterval(relojPagina);
        if (si) relojPagina = setInterval(() => { pagina++; pintarCuadricula(); }, ROTAR_MS);
        pintarCuadricula();
    }
    $("btn-proyectar").addEventListener("click", () => {
        if (proyectando) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); proyectar(false); return; }
        proyectar(true);
        const m = $("mesas");
        if (m.requestFullscreen) m.requestFullscreen().catch(() => { /* sin pantalla completa: igual se ve grande */ });
    });
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && proyectando) proyectar(false); });
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
