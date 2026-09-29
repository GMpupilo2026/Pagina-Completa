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

    function guardar(v) { try { if (v) localStorage.setItem(CLAVE, JSON.stringify(v)); else localStorage.removeItem(CLAVE); } catch (e) {} }
    function leer() { try { return JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch (e) { return null; } }

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
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) salio(); });

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
        await Avisos.alerta(
            "Tu profe ya sabe que te saliste de la pantalla de la clase.\n\nSi vuelves a salir, ya no vas a poder ver más el tablero.",
            { titulo: "⚠️ Saliste de la pantalla", aceptar: "Volver a la clase" });
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
    }

    function turno(fen) {
        const lado = String(fen || "").split(" ")[1];
        return lado === "b" ? "Juegan las negras" : "Juegan las blancas";
    }

    function pintarTablero(t) {
        const clave = JSON.stringify(t);
        if (clave === ultimoTablero) return;
        ultimoTablero = clave;
        board.loadMoves(Array.isArray(t.moves) ? t.moves : [], t.start_fen || null);
        board.showView(t.vista || null);
        board.setMarks(t.arrows || [], t.circles || []);
        board.setPiecesHidden(!!t.pieces_hidden);
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
        pintarSalidas(data.salidas || 0);
        if (data.estado === "esperando") {
            $("vc-tablero").classList.add("invisible");
            $("vc-estado").textContent = profesor + " todavía no abre la clase. Esta pantalla se actualiza sola.";
            ultimoTablero = "";
            return;
        }
        if (!fuera) $("vc-tablero").classList.remove("invisible");
        if (data.tablero) pintarTablero(data.tablero);
    }

    function entrarALaClase() {
        $("vc-clase-profe").textContent = profesor;
        mostrar("vc-clase");
        montarTablero();
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
        if (nombre.length < 2) { err.textContent = "Escribe tu nombre: tu profe lo va a ver."; $("vc-nombre").focus(); return; }
        if (!$("vc-acepto").checked) { err.textContent = "Para entrar tienes que aceptar la Política de privacidad."; $("vc-acepto").focus(); return; }
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
        if (error || !data) { $("vc-cargando").firstElementChild.textContent = "No se pudo cargar la clase. Revisa la conexión y recarga la página."; return; }
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

    arrancar();

    window.VerClase = { turno };
})();
