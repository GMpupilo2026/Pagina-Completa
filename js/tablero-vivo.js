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
    let abrirMesa = null;       // «m3»: la que pide el enlace (&m=3, el de un alumno en una simultánea)
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
        if (r) r.mesas.forEach((m) => lista.push({ clave: P.clave(m), mesa: m.mesa, tablero: m.tablero, blancas: m.blancas, negras: m.negras, ronda: r.ronda,
            equipos: m.equipoBlancas ? m.equipoBlancas + " – " + m.equipoNegras : "" }));
        for (const [clave, x] of partidas) {
            if (x.mesa && !lista.some((m) => m.clave === clave)) lista.push({ clave, mesa: x.mesa, tablero: x.tablero, simul: x.simul, blancas: x.blancas, negras: x.negras, ronda: x.ronda });
        }
        return lista.sort((a, b) => a.mesa - b.mesa || (a.tablero || 0) - (b.tablero || 0));
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
        $("mesa-titulo").textContent = x && x.mesa ? P.lugar(x) + (x.ronda ? " · ronda " + x.ronda : "") : "";
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
        pintarGuardar(x);
        pintarMomentos(x);
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
        if (m.tablero) b.dataset.tablero = String(m.tablero);
        b.dataset.clave = m.clave;
        b.className = "text-left bg-white dark:bg-brand-900 rounded-2xl shadow-md p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 hover:ring-2 hover:ring-accent-400";
        const titulo = document.createElement("p");
        titulo.className = "font-semibold text-brand-800 dark:text-white";
        titulo.textContent = P.lugar(m);
        const quien = document.createElement("p");
        quien.className = "text-xs text-brand-600 dark:text-brand-300 mb-2";
        quien.textContent = ((x && x.blancas) || m.blancas || "Blancas") + " – " + ((x && x.negras) || m.negras || "Negras") + (m.equipos ? " (" + m.equipos + ")" : "");
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
        const clave0 = payload.mesa ? P.clave(payload) : "solo";
        const antes = partidas.get(clave0);
        if (antes && Number(payload.t) < antes.t) return; // lo viejo no pisa lo nuevo
        const d = P.leer(payload, antes);
        if (!d) return;
        // Llegó solo lo nuevo y no calza (se perdió un mensaje): se pide esa mesa entera.
        if (d.falta) {
            // Una vez cada 3 s por mesa: lo nuevo que siga llegando mientras tanto tampoco calza.
            if (canal && !(Date.now() - (pedidas.get(clave0) || 0) < 3000)) { pedidas.set(clave0, Date.now()); canal.send({ type: "broadcast", event: "pedir", payload: d.mesa ? { mesa: d.mesa, tablero: d.tablero || undefined } : {} }); }
            return;
        }
        d.recibido = Date.now();
        if (torneoId && d.torneo && d.torneo !== torneoId) return;
        const clave = d.mesa ? P.clave(d) : "solo";
        const nueva = !antes;
        partidas.set(clave, d);
        if (!d.mesa) elegida = "solo";
        if (abrirMesa && clave === abrirMesa && !elegida) { elegida = clave; abrirMesa = null; pintar(); }
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

    /* Los momentos clave, cuando la partida terminó: Stockfish revisa cada
     * posición en este aparato (profundidad 10) y las jugadas que perdieron
     * 2 peones o más se eligen con la misma regla de «Tus propios errores»
     * (ErroresPropios.detectar, de los dos lados): hasta tres. Se pide con
     * un botón (es trabajo para el celular) y se arma una vez por partida. */
    let momentos = null; // { id, lista, fens, mejores }
    const idMomentos = (x) => elegida + ":" + x.juego.history().join(" ");
    function pintarMomentos(x) {
        const termino = !!x && (!!x.resultado || x.juego.game_over()) && x.juego.history().length >= 6;
        $("momentos").hidden = !termino;
        if (!termino) return;
        if (momentos && momentos.id !== idMomentos(x)) momentos = null;
        $("btn-momentos").hidden = !!momentos;
        if (!momentos) { $("momentos-msg").textContent = ""; $("momentos-lista").textContent = ""; }
    }
    async function buscarMomentos() {
        const x = partidas.get(elegida);
        if (!x) return;
        const id = idMomentos(x);
        momentos = { id, lista: null };
        $("btn-momentos").hidden = true;
        const msg = $("momentos-msg");
        msg.textContent = "Cargando Stockfish…";
        try {
            if (!cargaMotor) cargaMotor = cargar("js/shared-engine.js").then(() => cargar("js/preparacion-motor.js"));
            await Promise.all([cargaMotor, window.ErroresPropios ? null : cargar("js/errores-propios.js")]);
            const j = P.hasta(x.juego, 0), hist = x.juego.history();
            const fens = [j.fen()];
            hist.forEach((s) => { j.move(s); fens.push(j.fen()); });
            const evalsCp = [], mejores = [];
            for (let i = 0; i < fens.length; i++) {
                if (!momentos || momentos.id !== id) return; // eligió otra partida
                msg.textContent = "Stockfish revisa la posición " + (i + 1) + " de " + fens.length + "…";
                const r = await window.PreparacionMotor.evaluar(fens[i], 10);
                evalsCp.push(r && r.eval != null ? r.eval * 100 : null);
                mejores.push(r ? r.mejor : null);
            }
            const E = window.ErroresPropios, turno0 = fens[0].split(" ")[1];
            const lista = E.detectar(evalsCp, "w", turno0).concat(E.detectar(evalsCp, "b", turno0))
                .sort((a, b) => b.perdida - a.perdida).slice(0, 3).sort((a, b) => a.ply - b.ply);
            if (!momentos || momentos.id !== id) return;
            momentos.lista = lista;
            pintarListaMomentos(x, lista, fens, mejores);
        } catch (e) {
            msg.textContent = "Stockfish no se pudo cargar en este aparato. Prueba de nuevo más tarde.";
            momentos = null;
            $("btn-momentos").hidden = false;
        }
    }
    function pintarListaMomentos(x, lista, fens, mejores) {
        const msg = $("momentos-msg"), caja = $("momentos-lista");
        caja.textContent = "";
        const es = (s) => (window.ComandosTablero ? window.ComandosTablero.jugadaParaMostrar(s) : s);
        const peones = (cp) => (Math.abs(cp) >= 1000 ? (cp > 0 ? "ganada" : "perdida") : (cp >= 0 ? "+" : "−") + (Math.abs(cp) / 100).toFixed(1).replace(".", ","));
        msg.textContent = lista.length ? "Stockfish encontró " + (lista.length === 1 ? "un momento clave" : lista.length + " momentos clave") + "."
            : "Ninguna jugada perdió 2 peones o más: para Stockfish fue una partida sin errores grandes.";
        const hist = x.juego.history();
        for (const m of lista) {
            const f = fens[m.ply].split(" "), blancas = f[1] === "w";
            const quien = blancas ? "las blancas" : "las negras";
            const mejor = mejores[m.ply] && mejores[m.ply] !== hist[m.ply].replace(/[+#]$/, "") ? " Mejor era " + es(mejores[m.ply]) + "." : "";
            const li = document.createElement("li");
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.ply = String(m.ply);
            b.className = "text-left w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 hover:ring-2 hover:ring-accent-400";
            b.textContent = f[5] + (blancas ? ". " : "... ") + es(hist[m.ply]) + ": " + quien + " estaban en " + peones(m.antes) + " y quedaron en " + peones(m.despues) + " (contado desde " + quien + ")." + mejor;
            b.addEventListener("click", () => { paso = m.ply + 1; pintarGrande(); $("tablero").scrollIntoView({ block: "nearest" }); });
            li.append(b);
            caja.append(li);
        }
    }
    $("btn-momentos").addEventListener("click", buscarMomentos);

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
        const m = partes.map((x) => /^m=([1-9][0-9]?)$/.exec(x)).find(Boolean);
        if (P.codigoValido(c)) { conectar(c, t); abrirMesa = m ? "m" + m[1] : null; return; }
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

    /* «Guardar en mi cuenta»: quien jugó esta partida (con la sesión abierta
     * en este aparato) la guarda en su libreta de torneos (partidas_torneo,
     * la misma de «Tus propios errores»: su profe la ve y el motor la revisa).
     * La base deja guardar solo en la propia cuenta, y desde 10 medias
     * jugadas. Ver «Guardar la partida en la cuenta del alumno» en
     * docs/decisiones/juegos-y-torneos.md. */
    const GUARDADAS = "vivo_guardadas_v1";
    const RESULTADO_BASE = { "1-0": "1-0", "=": "1/2-1/2", "0-1": "0-1" };
    const claveGuardada = (x) => (x.id || "") + "|" + x.juego.history().length;
    function guardadas() { try { return JSON.parse(localStorage.getItem(GUARDADAS) || "[]"); } catch (e) { return []; } }
    let guardando = null; // la partida (clave de `partidas`) del formulario abierto
    function pintarGuardar(x) {
        const caja = $("guardar-caja");
        const n = x ? x.juego.history().length : 0;
        caja.hidden = !x || n < 10;
        if (caja.hidden) return;
        const ya = guardadas().includes(claveGuardada(x));
        $("btn-guardar").disabled = ya;
        $("btn-guardar").textContent = ya ? "Ya está en tu cuenta" : "Guardar en mi cuenta";
        $("guardar-blancas").textContent = "Con blancas" + (x.blancas ? " (" + x.blancas + ")" : "");
        $("guardar-negras").textContent = "Con negras" + (x.negras ? " (" + x.negras + ")" : "");
        if (guardando !== elegida) { $("form-guardar").hidden = true; $("btn-guardar").setAttribute("aria-expanded", "false"); }
    }
    $("btn-guardar").addEventListener("click", async () => {
        const msg = $("guardar-msg");
        msg.textContent = "";
        let sesion = null;
        try { sesion = (await window.sb.auth.getSession()).data.session; } catch (e) { /* sin sesión */ }
        if (!sesion) {
            msg.textContent = "Para guardarla, entra a tu cuenta en este aparato (arriba, «Academia») y vuelve a abrir este enlace.";
            return;
        }
        const x = partidas.get(elegida);
        if (!x) return;
        guardando = elegida;
        $("form-guardar").hidden = false;
        $("btn-guardar").setAttribute("aria-expanded", "true");
        $("guardar-evento").value = $("guardar-evento").value || (torneoDatos && torneoDatos.nombre) || "";
        $("guardar-ronda").value = x.ronda || "";
        const elegido = document.querySelector('#form-guardar input[name="color"]:checked');
        (elegido || document.querySelector('#form-guardar input[name="color"]')).focus();
    });
    $("form-guardar").addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = $("guardar-msg"), x = partidas.get(guardando);
        const color = (document.querySelector('#form-guardar input[name="color"]:checked') || {}).value;
        if (!x) return;
        if (!color) { msg.textContent = "Elige con qué color jugaste."; document.querySelector('#form-guardar input[name="color"]').focus(); return; }
        const ronda = $("guardar-ronda").value.trim() === "" ? null : Number($("guardar-ronda").value);
        if (ronda !== null && !(Number.isInteger(ronda) && ronda >= 1 && ronda <= 30)) { msg.textContent = "La ronda es un número del 1 al 30 (o déjala vacía)."; $("guardar-ronda").focus(); return; }
        const jugadas = x.juego.history();
        const fila = { fecha: window.HoraCR.hoy(), color, jugadas, ronda,
            resultado: RESULTADO_BASE[x.resultado] || "*", evento: $("guardar-evento").value.trim().slice(0, 120) || null };
        msg.textContent = "Guardando…";
        try {
            const { error } = await window.sb.from("partidas_torneo").insert(fila);
            if (error) throw error;
        } catch (err) {
            msg.textContent = "No se pudo guardar. Revisa la conexión y vuelve a intentar; si tu cuenta tiene verificación en dos pasos, entra de nuevo a la Academia.";
            return;
        }
        try { localStorage.setItem(GUARDADAS, JSON.stringify(guardadas().concat(claveGuardada(x)).slice(-200))); } catch (er) { /* sin almacenamiento */ }
        $("form-guardar").hidden = true;
        $("btn-guardar").setAttribute("aria-expanded", "false");
        msg.textContent = "Listo: está en tu libreta de torneos (" + jugadas.length + " medias jugadas). En «Tus propios errores» el motor te dice dónde se pudo mejorar.";
        pintarGuardar(x);
        $("btn-guardar").focus();
    });

    desdeLaDireccion();
})();
