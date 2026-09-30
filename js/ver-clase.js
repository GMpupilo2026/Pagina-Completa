/* El código de ver-clase.html: la clase vista por un invitado sin cuenta.

   El profe comparte ver-clase.html#t=<token> (js/clase-invitados.js). Quien
   lo abre escribe su nombre, acepta la privacidad y ve el tablero de la clase
   en pantalla completa, siguiendo lo que mira el profe, sin poder tocar nada.

   - Lo que ve lo decide la BASE: clase_invitado_ver() devuelve el tablero solo
     si el enlace sigue vigente, la clase está abierta y el invitado no está
     bloqueado. Esta página no puede leer game_state (no tiene sesión), así que
     pregunta cada POLL_MS en vez de escuchar Realtime.
   - Salirse de la pantalla (otra pestaña, otra aplicación, salir de pantalla
     completa) se avisa a la base en el momento (clase_invitado_salio): así
     al profe le llega aunque el invitado no vuelva. La primera vez, al volver,
     se le advierte; la segunda, la base lo bloquea y ya no ve el tablero.
   - Un invitado mira: el tablero no es interactivo ni dibuja flechas, y no
     hay ningún enlace en la pantalla de la clase (tocarlo sería salirse).
   - Se puede seguir sin ver la pantalla: el Modo Adaptado pone debajo del
     tablero el recuadro de la clase (js/clase-adaptada.js: «posición»,
     «caballos», «qué hay en e4»), y TODO lo que pasa se anuncia por una sola
     región viva, #vc-voz, que además se dice con la voz del navegador si la
     persona la encendió (anunciar()). En Modo Adaptado, salir de la pantalla
     completa NO cuenta como salirse: con lector de pantalla la tecla Esc es de
     todos los días y dejaría fuera a quien no hizo nada. Irse a otra pestaña u
     otra aplicación cuenta igual.

   Ver «La clase vista por invitados sin cuenta» en docs/decisiones/clase-en-vivo.md. */
(function () {
    "use strict";
    const sb = window.sb;
    const POLL_MS = 2000;
    // Entrar a pantalla completa mueve el foco y el tamaño de la ventana: lo
    // que pase en ese primer momento no es salirse.
    const GRACIA_MS = 1500;
    const $ = (id) => document.getElementById(id);

    const token = (new URLSearchParams(location.hash.slice(1)).get("t") || "").trim();
    const CLAVE = "ver_clase_v1:" + token;

    let secreto = null;
    let profesor = "";
    let board = null;
    let ultimoTablero = "";
    let vigilando = false;
    let vigilaDesde = 0;
    let fuera = false;
    let terminado = false;
    let tick = null;
    let claseAcc = null;
    let primerEstadoVisto = false;
    let bienvenida = null;
    function decirBienvenida() { if (bienvenida) { anunciar(bienvenida); bienvenida = null; } }
    let estadoAntes = null;
    let vistaAntes = "null";
    let ocultasAntes = false;
    let marcasAntes = null;

    function guardar(v) { try { if (v) localStorage.setItem(CLAVE, JSON.stringify(v)); else localStorage.removeItem(CLAVE); } catch (e) {} }
    function leer() { try { return JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch (e) { return null; } }

    /* ---------------- Lo que se oye ---------------- */
    /* Una sola región viva para todos los avisos, y la voz del navegador (si
       está encendida) dice lo mismo. Lo que llega junto se dice junto: dos
       cambios seguidos de la misma región se pisan y el lector dice solo el
       último. `paraLaVoz` es por si la voz tiene que decir algo más que el
       lector (el título al que ya se llevó el foco, por ejemplo). */
    let porDecir = [], porDecirVoz = [], decirTimer = null;
    function anunciar(texto, paraLaVoz) {
        if (!texto) return;
        porDecir.push(texto);
        porDecirVoz.push(paraLaVoz || texto);
        clearTimeout(decirTimer);
        decirTimer = setTimeout(() => {
            const t = porDecir.join(" "), v = porDecirVoz.join(" ");
            porDecir = []; porDecirVoz = [];
            const el = $("vc-voz");
            el.textContent = "";
            setTimeout(() => { el.textContent = t; }, 50);
            hablar(v);
        }, 80);
    }
    function hablar(texto) { if (window.ClaseAdaptada) ClaseAdaptada.hablar(texto); }
    const adaptado = () => document.documentElement.classList.contains("adaptive-mode");
    const casillaDicha = (c) => (window.BlindNotation ? BlindNotation.squareSpoken(c) : c);

    function montarAccesibilidad() {
        const botones = () => document.querySelectorAll(".vc-adaptado-btn");
        const pintar = () => botones().forEach((b) => b.setAttribute("aria-pressed", adaptado() ? "true" : "false"));
        botones().forEach((b) => b.addEventListener("click", () => {
            if (window.AdaptiveMode) AdaptiveMode.set(!adaptado());
        }));
        document.addEventListener("adaptivemode:change", (e) => {
            pintar();
            const on = !!(e.detail && e.detail.activo);
            // En la clase, el recuadro dice solo qué apareció (cuadro-comandos.js):
            // acá se dice lo demás, sin repetirlo.
            if (on && claseAcc) { hablar("Modo adaptado. Debajo del tablero tienes un recuadro para preguntarle a la posición."); return; }
            anunciar(on
                ? "Modo adaptado activado: vas a oír cada jugada y cada aviso de la clase, y debajo del tablero tienes un recuadro para preguntarle a la posición."
                : "Modo adaptado apagado.");
        });
        pintar();
        // La voz: el mismo botón de todo el sitio (js/blind-notation.js), dos
        // veces (en la entrada y en la clase); al tocar uno se repintan los dos.
        const ids = ["vc-voz-btn", "vc-voz-btn2"];
        const pintores = window.BlindNotation ? ids.map((id) => BlindNotation.setupSpeechToggle(id, () => true)) : [];
        ids.forEach((id, i) => {
            const b = $(id);
            if (!pintores[i]) { b.style.display = "none"; return; }  // navegador sin voz
            b.addEventListener("click", () => {
                pintores.forEach((f) => f && f());
                if (BlindNotation.isSpeechEnabled()) BlindNotation.speak("Voz activada: vas a oír cada jugada y cada aviso de la clase.");
            });
        });
    }

    function mostrar(id) {
        for (const s of document.querySelectorAll(".vc-pantalla")) s.classList.toggle("hidden", s.id !== id);
        // En la clase no hay pie: no hay nada que tocar, ni un enlace.
        $("vc-pie").classList.toggle("hidden", id === "vc-clase");
    }

    function fin(titulo, texto) {
        terminado = true;
        vigilando = false;
        clearInterval(tick);
        salirDePantallaCompleta();
        $("vc-fin-titulo").textContent = titulo;
        $("vc-fin-texto").textContent = texto;
        mostrar("vc-fin");
        // El foco no puede quedarse en un tablero que ya no está: va al título,
        // que el lector lee solo. La voz dice también el título.
        try { $("vc-fin-titulo").focus(); } catch (e) {}
        const cuenta = "Con tu propia cuenta ves la clase entera y juegas con tu profe: abajo están los botones para probar gratis y ver los planes.";
        anunciar(texto + " " + cuenta, titulo + ". " + texto + " " + cuenta);
    }

    function bloqueado() {
        guardar({ secreto, profesor, bloqueado: true });
        fin("Ya no puedes ver el tablero",
            "Te saliste de la pantalla de la clase dos veces, y tu profe ya lo sabe. Como te advertimos, la clase se cerró para ti.");
    }

    /* ---------------- Pantalla completa ---------------- */
    function pedirPantallaCompleta() {
        const el = document.documentElement;
        if (document.fullscreenElement || !el.requestFullscreen) return;
        // En el iPhone no existe: la clase se ve igual, ocupando la ventana.
        el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    }
    function salirDePantallaCompleta() {
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }

    /* ---------------- Salirse de la pantalla ---------------- */
    function vigilar() {
        vigilando = true;
        vigilaDesde = Date.now();
    }

    document.addEventListener("visibilitychange", () => { if (document.hidden) salio(); else volvio(); });
    window.addEventListener("blur", salio);
    window.addEventListener("focus", volvio);
    // En Modo Adaptado, salir de pantalla completa no cuenta (ver arriba).
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && !adaptado()) salio(); });

    async function salio() {
        if (!vigilando || fuera || terminado || Date.now() - vigilaDesde < GRACIA_MS) return;
        fuera = true;
        vigilando = false;
        // Se anota ya, no al volver: el profe se entera aunque no vuelva nunca.
        const { data } = await sb.rpc("clase_invitado_salio", { p_token: token, p_secreto: secreto });
        if (data && data.bloqueado) bloqueado();
        else if (data && data.estado === "fuera") fin("Este enlace ya no sirve", "Tu profe cambió o apagó el enlace de la clase.");
        else if (data) pintarSalidas(data.salidas);
        // Si ya volvió mientras se anotaba, la advertencia sale ahora.
        if (!document.hidden && document.hasFocus()) volvio();
    }

    let advirtiendo = false;
    async function volvio() {
        if (!fuera || terminado || advirtiendo || document.hidden) return;
        advirtiendo = true;
        // Mientras lee la advertencia no ve el tablero: tiene que decidir volver.
        $("vc-tablero").classList.add("invisible");
        const aviso = "Tu profe ya sabe que te saliste de la pantalla de la clase.\n\nSi vuelves a salir, ya no vas a poder ver más el tablero.";
        // El diálogo lo lee el lector de pantalla; la voz lo dice también.
        hablar("Saliste de la pantalla. " + aviso.replace(/\n+/g, " "));
        await Avisos.alerta(aviso, { titulo: "⚠️ Saliste de la pantalla", aceptar: "Volver a la clase" });
        advirtiendo = false;
        if (terminado) return;
        $("vc-tablero").classList.remove("invisible");
        pedirPantallaCompleta();
        fuera = false;
        vigilar();
    }

    function pintarSalidas(n) {
        const el = $("vc-avisos");
        el.textContent = n >= 1 ? "⚠️ Saliste 1 vez: si vuelves a salir, se cierra" : "";
        el.className = "font-semibold " + (n >= 1 ? "text-red-300" : "");
    }

    /* ---------------- El tablero ---------------- */
    function montarTablero() {
        if (board) return;
        board = new ClasesBoard($("vc-tablero"), { interactive: false, allowArrows: false });
        $("vc-tablero").setAttribute("aria-label", "Tablero de la clase (solo para mirar)");
        // El recuadro de la clase: se pregunta por la posición; mover no se puede.
        if (window.ClaseAdaptada) {
            claseAcc = ClaseAdaptada.montar($("vc-cmd"), () => board, {
                etiqueta: "Pregúntale a la posición: «posición», «caballos», «qué hay en e4»",
                porQueNoPuedes: () => "Estás mirando como invitado: no se puede mover. Para jugar con tu profe hace falta tu cuenta.",
                anunciar,
            });
        }
    }

    /* Las flechas y los círculos del profe, dichos: para quien no ve el
       tablero son la mitad de la explicación. Solo los que se agregaron. */
    function marcasNuevas(t) {
        const flechas = (t.arrows || []).map((a) => "f:" + a.from + a.to);
        const circulos = (t.circles || []).map((c) => "c:" + c.square);
        const ahora = flechas.concat(circulos);
        const antes = marcasAntes;
        marcasAntes = ahora;
        if (!antes) return null;
        const textos = [];
        for (const a of t.arrows || []) {
            if (!antes.includes("f:" + a.from + a.to)) textos.push("una flecha de " + casillaDicha(a.from) + " a " + casillaDicha(a.to));
        }
        for (const c of t.circles || []) {
            if (!antes.includes("c:" + c.square)) textos.push("la casilla " + casillaDicha(c.square));
        }
        return textos.length ? "Tu profe marcó " + textos.join(", ") + "." : null;
    }

    function turno(fen) {
        const lado = String(fen || "").split(" ")[1];
        return lado === "b" ? "Juegan las negras" : "Juegan las blancas";
    }

    function pintarTablero(t) {
        const clave = JSON.stringify(t);
        if (clave === ultimoTablero) return;
        const primera = !ultimoTablero;
        ultimoTablero = clave;
        const antes = primera ? null : { inicio: board.startFen || "", jugadas: board.moves() };
        const jugadas = Array.isArray(t.moves) ? t.moves : [];
        board.loadMoves(jugadas, t.start_fen || null);
        board.showView(t.vista || null);
        board.setMarks(t.arrows || [], t.circles || []);
        board.setPiecesHidden(!!t.pieces_hidden);
        if (primera) marcasAntes = null;
        /* Lo que cambió, en orden: la jugada (o la posición nueva), lo que
           muestra el profe, las piezas ocultas y sus marcas. anunciar() junta
           todo en un solo aviso. */
        if (claseAcc) claseAcc.anunciarCambio(antes, { inicio: t.start_fen || "", jugadas });
        const vista = JSON.stringify(t.vista || null);
        if (!primera && vista !== vistaAntes) {
            anunciar(ClaseAdaptada.describirVista(t.vista, jugadas, t.start_fen) || "Tu profe volvió a la posición de la partida.");
        }
        vistaAntes = vista;
        if (!primera && ocultasAntes !== !!t.pieces_hidden) {
            anunciar(t.pieces_hidden
                ? "Tu profe ocultó las piezas: ahora hay que ver el tablero de memoria."
                : "Tu profe volvió a mostrar las piezas. Escribe «posición» para oírla.");
        }
        ocultasAntes = !!t.pieces_hidden;
        anunciar(marcasNuevas(t));
        const g = board.viewGame || board.game;
        const partes = [];
        if (t.vista && Array.isArray(t.vista.path)) partes.push("Tu profe está mostrando otra posición");
        if (t.pieces_hidden) partes.push("tu profe ocultó las piezas");
        partes.push(turno(g.fen()));
        $("vc-estado").textContent = partes.join(" · ");
    }

    async function consultar() {
        if (terminado) return;
        const { data, error } = await sb.rpc("clase_invitado_ver", { p_token: token, p_secreto: secreto });
        if (error || !data || terminado) return; // sin red: se reintenta en la próxima vuelta
        if (data.estado === "bloqueado") { bloqueado(); return; }
        if (data.estado === "fuera") {
            guardar(null);
            fin("Este enlace ya no sirve", "Tu profe cambió o apagó el enlace de la clase. Si quieres seguir mirando, pídele el nuevo.");
            return;
        }
        decirBienvenida();
        pintarSalidas(data.salidas || 0);
        const estado = data.estado;
        const cambio = estado !== estadoAntes;
        const yaHabiaEstado = primerEstadoVisto;
        estadoAntes = estado;
        primerEstadoVisto = true;
        if (estado === "esperando") {
            $("vc-tablero").classList.add("invisible");
            $("vc-estado").textContent = profesor + " todavía no abre la clase. Esta pantalla se actualiza sola.";
            if (cambio) anunciar(profesor + " todavía no abre la clase. Te avisamos cuando empiece.");
            ultimoTablero = "";
            return;
        }
        if (cambio && estado === "ok" && yaHabiaEstado) anunciar(profesor + " abrió la clase.");
        if (!fuera) $("vc-tablero").classList.remove("invisible");
        if (data.tablero) pintarTablero(data.tablero);
    }

    function entrarALaClase() {
        $("vc-clase-profe").textContent = profesor;
        mostrar("vc-clase");
        montarTablero();
        // Con el modo adaptado, el foco va al recuadro; si no, al título de la clase.
        try { if (adaptado() && claseAcc) claseAcc.enfocar(); else $("vc-clase-titulo").focus(); } catch (e) {}
        /* La bienvenida sale en el MISMO aviso que el primer estado del tablero
           (consultar()): dicha aparte, el aviso del tablero la pisaba y la voz
           la cortaba a la mitad. Si la base tarda, sale sola. */
        bienvenida = "Estás mirando la clase de " + profesor + ". Solo para mirar: no se puede mover."
            + (adaptado() ? " Escribe «posición» para oír el tablero, o «ayuda» para ver todo lo que se puede preguntar." : "");
        setTimeout(decirBienvenida, 2500);
        consultar();
        clearInterval(tick);
        tick = setInterval(consultar, POLL_MS);
        vigilar();
    }

    /* ---------------- Entrar ---------------- */
    $("vc-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        // Quien recargó la página ya entró: vuelve sin pedirle el nombre otra vez.
        if (secreto) { pedirPantallaCompleta(); entrarALaClase(); return; }
        const nombre = $("vc-nombre").value.trim().replace(/\s+/g, " ");
        const err = $("vc-error");
        err.textContent = "";
        // #vc-error es role="alert": el lector lo dice solo; la voz, también.
        const avisarError = (t, campo) => { err.textContent = t; hablar(t); $(campo).focus(); };
        if (nombre.length < 2) { avisarError("Escribe tu nombre: tu profe lo va a ver.", "vc-nombre"); return; }
        if (!$("vc-acepto").checked) { avisarError("Para entrar tienes que aceptar la Política de privacidad.", "vc-acepto"); return; }
        // Pantalla completa YA, dentro del clic: después de esperar a la base
        // el navegador ya no lo deja.
        pedirPantallaCompleta();
        const btn = $("vc-entrar");
        btn.disabled = true;
        btn.textContent = "Entrando…";
        const { data, error } = await sb.rpc("clase_invitado_entrar", {
            p_token: token, p_nombre: nombre, p_privacidad: window.LegalVersion.PRIVACIDAD,
        });
        btn.disabled = false;
        btn.textContent = "Entrar a ver la clase";
        if (error || !data || data.error) {
            salirDePantallaCompleta();
            err.textContent = (data && data.error) || "No se pudo entrar. Revisa la conexión e intenta de nuevo.";
            hablar(err.textContent);
            return;
        }
        secreto = data.secreto;
        profesor = data.profesor || profesor;
        guardar({ secreto, profesor });
        entrarALaClase();
    });

    /* ---------------- Al cargar ---------------- */
    async function arrancar() {
        if (!token) { fin("Este enlace está incompleto", "Pídele a tu profe que te mande el enlace de la clase otra vez."); return; }
        const guardado = leer();
        if (guardado && guardado.bloqueado) {
            profesor = guardado.profesor || "";
            fin("Ya no puedes ver el tablero", "Te saliste de la pantalla de la clase dos veces. Como te advertimos, la clase se cerró para ti.");
            return;
        }
        const { data, error } = await sb.rpc("clase_invitado_info", { p_token: token });
        if (error || !data) {
            const t = "No se pudo cargar la clase. Revisa la conexión y recarga la página.";
            $("vc-cargando").firstElementChild.textContent = t;   // la sección es región viva
            hablar(t);
            return;
        }
        if (!data.valido) {
            guardar(null);
            fin("Este enlace ya no sirve", "Tu profe cambió o apagó el enlace de la clase. Si quieres mirarla, pídele el nuevo.");
            return;
        }
        profesor = data.profesor || "Tu profe";
        $("vc-profe").textContent = profesor;
        /* Quien recarga la página sigue siendo el mismo invitado (con sus
           salidas contadas), pero vuelve a entrar con un clic: la pantalla
           completa solo se pide desde un clic. */
        if (guardado && guardado.secreto) {
            secreto = guardado.secreto;
            $("vc-nombre").closest("div").classList.add("hidden");
            $("vc-acepto").closest("div").classList.add("hidden");
            $("vc-entrar").textContent = "Volver a la clase";
        }
        mostrar("vc-entrada");
    }

    montarAccesibilidad();
    arrancar();

    window.VerClase = { turno };
})();
