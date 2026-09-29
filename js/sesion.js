/* La clase en vivo (sesion.html): todo su código.

   Vivía escrito dentro de la página, en un solo <script> de 237 KB. Se mudó
   acá tal cual, sin tocar una línea, por dos razones:
     · el navegador lo guarda en caché aparte: quien vuelve a la clase ya no lo
       baja entero cada vez junto con el HTML;
     · es el primer paso para sacar 'unsafe-inline' de la CSP (_headers), que
       hoy deja correr cualquier <script> escrito en una página.

   Es un script clásico (no un módulo), cargado en el mismo lugar donde estaba
   el bloque: corre en el mismo orden y sus `let`/`const` de arriba siguen
   siendo globales, como antes. Ver «El código de las páginas sale del HTML»
   en docs/decisiones/sitio-e-infraestructura.md. */

        const EDGE_FUNCTION_URL = `${window.SUPABASE_URL}/functions/v1/create-student`;
        // Cada profesor tiene su propio tablero, su propia clase, sus propias
        // preguntas y su propia práctica — completamente independientes de los de
        // cualquier otro profesor, para que dos puedan dar clase al mismo tiempo sin
        // pisarse. boardOwnerId es el id de ESE profesor: el propio (isTeacher) o,
        // cuando quien mira es un alumno, el de la clase que eligió — puede tener
        // varios profesores, y lo resuelve js/clase-elegida.js.
        // myGameStateId es el id numérico de la fila de game_state de ese profesor
        // (ya no existe una fila única global con id=1).
        let boardOwnerId = null;
        let myGameStateId = null;
        function presenceChannelName() { return "clases-presence:" + boardOwnerId; }
        let profile = null;
        let session = null;
        let board = null;
        /* Llevar el foco a algo que puede no verse todavía. Al cargar la página, la
           pregunta abierta se pinta ANTES de destapar #app, y el navegador no le da
           el foco a lo que está escondido: no falla nada, el foco simplemente se
           queda donde estaba y quien usa lector de pantalla no se entera de la
           pregunta. Se espera a que se vea, un par de segundos como mucho. */
        function enfocarCuandoSeVea(el, intentos) {
            if (!el) return;
            intentos = intentos === undefined ? 40 : intentos;
            if (el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null) { el.focus(); return; }
            if (intentos > 0) setTimeout(() => enfocarCuandoSeVea(el, intentos - 1), 50);
        }

        // El recuadro del Modo Adaptado de cada tablero (js/clase-adaptada.js).
        let claseAcc = null, preguntaAcc = null, practicaAcc = null;
        let primerEstadoCargado = false;
        let isTeacher = false;
        /* Quien supervisa (o administra) mirando la clase de un profesor:
           sesion.html?observar=<id>. Solo mira: ni mueve, ni contesta, ni marca
           asistencia, ni cuenta como alumno. Lo que puede leer lo decide la RLS
           (game_state_select_supervisor y compañía: solo con la clase abierta y
           solo de un profesor que supervisa). */
        let esObservador = false;
        let nombreObservado = "";
        /* Quien observa puede venir de administración, supervisión o
           coordinación: mira lo mismo (la base le da a cada uno su alcance),
           pero se nombra distinto y vuelve a su propia pantalla. Con más de un
           papel, gana el más amplio. Quien administra entra por Supervisión,
           que le lista a todos los profesores. */
        const OBSERVA_DESDE = {
            administracion: { etiqueta: "administración", insignia: "👁 Administración", volver: "supervision.html", pantalla: "Supervisión" },
            supervision: { etiqueta: "supervisión", insignia: "👁 Supervisión", volver: "supervision.html", pantalla: "Supervisión" },
            coordinacion: { etiqueta: "coordinación", insignia: "👁 Coordinación", volver: "coordinacion.html", pantalla: "Coordinación" },
        };
        let observaDesde = OBSERVA_DESDE.supervision;
        let activePlayerId = null;
        // Con qué color puede mover activePlayerId: "w", "b" o "both" (los dos). Solo
        // importa mientras activePlayerId no sea null — el profesor siempre puede mover
        // cualquier color. Permite, por ejemplo, que un alumno juegue con blancas contra
        // el profesor en vivo delante de toda la clase, sin poder tocar las piezas negras.
        let activePlayerColor = "both";
        let presenceChannel = null;
        // Profesor: de qué alumno está mirando la partida de práctica en grande (ver
        // «La partida de UN alumno, en grande»). Viaja en su presencia, así que al
        // cerrar la pestaña se va solo: el alumno nunca se queda con un «te está
        // mirando» de alguien que ya no está.
        let mirandoA = null;
        let engineEnabled = false;
        let engineRequestId = 0;

        function setStatus(text) {
            document.getElementById("status-banner").textContent = text;
        }

        function updateTurnIndicator() {
            // El turno de la posición que se VE: si el profe está mostrando una
            // jugada anterior o una variante, es el de esa, no el de la partida.
            const g = board.viewGame || board.game;
            const turn = g.turn() === "w" ? "Blancas" : "Negras";
            let text = `Turno: ${turn}`;
            if (g.in_checkmate && g.in_checkmate()) text = `Jaque mate — ganan ${turn === "Blancas" ? "Negras" : "Blancas"}`;
            else if (g.in_check && g.in_check()) text += " · ¡Jaque!";
            else if (g.in_draw && g.in_draw()) text = "Tablas";
            document.getElementById("turn-indicator").textContent = text;
        }

        function canMoveNow() {
            if (isTeacher) return true;
            if (activePlayerId !== profile.id) return false;
            return activePlayerColor === "both" || activePlayerColor === board.game.turn();
        }

        function updateUndoButton() {
            const btn = document.getElementById("undo-move-btn");
            btn.classList.toggle("hidden", !canMoveNow() || board.isViewingHistory());
        }

        // ---------- Pestañas del profesor (Controles/Preguntar/Practicar/Alumnos/Motor) ----------
        // Un solo panel visible a la vez, para no obligar a hacer scroll por una barra
        // lateral con los 5 a la vez. Se recuerda la última pestaña abierta en este navegador.
        const TEACHER_TAB_KEY = "sesion_teacher_tab_v1";
        /* El orden manda dos cosas: el de los botones de arriba y, sobre todo, CUÁL SE
           ABRE la primera vez (TEACHER_TABS[0]). Para quien entra por primera vez eso
           es "Mi plan": lo que va a dar. Después se recuerda la última que usó. */
        const TEACHER_TABS = ["plan", "tactica", "tipos", "preguntar", "practicar", "alumnos", "controles"];
        const TEACHER_TAB_ACTIVE = "teacher-tab-btn text-xs font-semibold px-3 py-2 rounded-lg transition-colors bg-accent-500 text-brand-900";
        const TEACHER_TAB_INACTIVE = "teacher-tab-btn text-xs font-semibold px-3 py-2 rounded-lg transition-colors bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200";

        function activateTeacherTab(tab) {
            if (!TEACHER_TABS.includes(tab)) tab = TEACHER_TABS[0];
            document.querySelectorAll(".teacher-tab-btn").forEach((btn) => {
                const active = btn.dataset.tab === tab;
                btn.className = active ? TEACHER_TAB_ACTIVE : TEACHER_TAB_INACTIVE;
                btn.setAttribute("aria-selected", active ? "true" : "false");
            });
            document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
                panel.classList.toggle("hidden", panel.dataset.tabPanel !== tab);
            });
            try { localStorage.setItem(TEACHER_TAB_KEY, tab); } catch (e) {}
            if (tab === "tipos") ensureTiposLoaded();
        }

        document.querySelectorAll(".teacher-tab-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                activateTeacherTab(btn.dataset.tab);
                if (btn.dataset.tab === "tactica") ensureTacticsLoaded();
            });
        });

        /* ---------- El modo sencillo ----------
           Catorce controles delante, con la clase mirando, es demasiado para la
           primera clase. En modo sencillo se ve lo que hace falta para darla: el
           tablero (el grupo «El tablero — lo ve toda la clase»), el motor, «Mi
           plan», «Alumnos» e «Invitar». Táctica, Preguntar, Practicar y el grupo
           «Tu material» quedan detrás de «Ver todas las herramientas».

           Arranca en modo sencillo SOLO quien lleva menos de tres clases dadas: a
           quien ya da clases no se le mueve nada de lugar. Tres y no una porque
           la clase se registra al empezar (ver abrirClaseSiHaceFalta): con «ninguna»,
           recargar la página a mitad de la primera clase le cambiaría la pantalla
           en plena clase. Lo que uno elija con el botón se recuerda en el aparato
           (localStorage), como la pestaña abierta, y desde ahí manda sobre la
           cuenta de clases. */
        const MODO_SENCILLO_KEY = "sesion_modo_sencillo_v1";
        const CLASES_PARA_TODAS_LAS_HERRAMIENTAS = 3;
        const TABS_AVANZADAS = ["tactica", "tipos", "preguntar", "practicar"];
        let modoSencillo = false;

        function aplicarModoSencillo(activo) {
            modoSencillo = activo;
            document.getElementById("toolbar-material").hidden = activo;
            // La línea que separa los dos grupos no separa nada si el de arriba no está.
            ["border-t", "pt-3"].forEach((c) => document.getElementById("toolbar-tablero").classList.toggle(c, !activo));
            TABS_AVANZADAS.forEach((t) => { document.getElementById("teacher-tab-" + t).hidden = activo; });
            // Si la pestaña que estaba abierta se escondió, se vuelve a «Mi plan».
            const abierta = document.querySelector('.teacher-tab-btn[aria-selected="true"]');
            if (activo && abierta && TABS_AVANZADAS.includes(abierta.dataset.tab)) activateTeacherTab(TEACHER_TABS[0]);
            document.getElementById("modo-sencillo-btn").textContent = activo
                ? "🧰 Ver todas las herramientas" : "🪶 Volver al modo sencillo";
            document.getElementById("modo-sencillo-nota").textContent = activo
                ? "Modo sencillo: el tablero, tu plan y tus alumnos. Táctica, Entrenamientos, Preguntar, Practicar y tu material están a un clic."
                : "";
        }

        async function arrancarModoSencillo() {
            let guardado = null;
            try { guardado = localStorage.getItem(MODO_SENCILLO_KEY); } catch (e) {}
            if (guardado === "1" || guardado === "0") { aplicarModoSencillo(guardado === "1"); return; }
            // Sin preferencia: ¿cuántas clases lleva? Se cuenta en la base, sin
            // bajarse ninguna fila. Si no se puede saber, todas las herramientas.
            const { count, error } = await sb.from("class_sessions")
                .select("id", { count: "exact", head: true }).eq("created_by", session.user.id);
            aplicarModoSencillo(!error && typeof count === "number" && count < CLASES_PARA_TODAS_LAS_HERRAMIENTAS);
        }

        document.getElementById("modo-sencillo-btn").addEventListener("click", () => {
            aplicarModoSencillo(!modoSencillo);
            try { localStorage.setItem(MODO_SENCILLO_KEY, modoSencillo ? "1" : "0"); } catch (e) {}
        });

        // ---------- Historial, variantes y sub-variantes ----------
        // navegar hacia atrás, explorar líneas alternativas y encadenarlas en sub-variantes,
        // todo sin tocar la partida hasta que se pulsa "Jugar desde aquí". Los alumnos ven
        // en su tablero lo que el profesor mira (ver transmitirVista).
        let variantNodes = [];
        // Lo que el profe dijo de cada jugada: {"e4 e5": {nag, texto}}, con el
        // camino desde start_fen como clave (ver js/pgn-clase.js).
        let comentariosClase = {};

        async function loadVariantTree() {
            const { data, error } = await sb.from("variant_nodes").select("*").eq("teacher_id", boardOwnerId).order("created_at");
            if (error) { console.error(error); return; }
            variantNodes = data || [];
            renderMoveList();
        }

        function subscribeVariants() {
            sb.channel("variant-nodes-changes:" + boardOwnerId)
                .on("postgres_changes", { event: "*", schema: "public", table: "variant_nodes", filter: "teacher_id=eq." + boardOwnerId }, () => loadVariantTree())
                .subscribe();
        }

        async function clearVariantTree() {
            await sb.from("variant_nodes").delete().eq("teacher_id", boardOwnerId);
        }

        function topVariantsAtPly(ply) {
            return variantNodes.filter((v) => v.parent_id === null && v.root_ply === ply);
        }

        function variantChildrenOf(nodeId) {
            return variantNodes.filter((v) => v.parent_id === nodeId);
        }

        function renderVariantNode(node, pathSoFar) {
            const fullPath = pathSoFar.concat([node.san]);
            const li = document.createElement("li");
            li.className = "ml-3 border-l-2 border-accent-400/40 pl-2 mt-0.5";
            const btn = document.createElement("button");
            btn.type = "button";
            const ctx = board.getVariantContext();
            const isCurrent = board.isViewingHistory() && ctx && ctx.parentNodeId === node.id;
            btn.className = "px-1 rounded hover:bg-brand-100 dark:hover:bg-brand-800 transition-colors italic text-accent-600 dark:text-accent-400" +
                (isCurrent ? " bg-accent-500/30 font-bold not-italic" : "");
            ponerTextoDeJugada(btn, node.san, fullPath);
            btn.addEventListener("click", () => { board.viewVariantNode(node, fullPath); renderMoveList(); transmitirVista(); });
            li.appendChild(btn);
            const children = variantChildrenOf(node.id);
            if (children.length) {
                const ul = document.createElement("ul");
                ul.className = "space-y-0.5";
                children.forEach((child) => ul.appendChild(renderVariantNode(child, fullPath)));
                li.appendChild(ul);
            }
            return li;
        }

        function appendVariantsAtPly(listEl, ply, mainlineMoves) {
            const roots = topVariantsAtPly(ply);
            if (!roots.length) return;
            const treeLi = document.createElement("li");
            treeLi.className = "w-full basis-full";
            const ul = document.createElement("ul");
            ul.className = "space-y-0.5 mt-0.5";
            const basePath = mainlineMoves.slice(0, ply);
            roots.forEach((node) => ul.appendChild(renderVariantNode(node, basePath)));
            treeLi.appendChild(ul);
            listEl.appendChild(treeLi);
        }

        function makeMoveButton(san, ply) {
            const btn = document.createElement("button");
            btn.type = "button";
            const ctx = board.getVariantContext();
            const isCurrent = board.isViewingHistory() && ctx && ctx.parentNodeId === null && board.viewPath.length === ply;
            btn.className = "px-1 rounded hover:bg-brand-100 dark:hover:bg-brand-800 transition-colors" +
                (isCurrent ? " bg-accent-500/30 font-bold text-brand-800 dark:text-white" : "");
            ponerTextoDeJugada(btn, san, board.moves().slice(0, ply));
            btn.addEventListener("click", () => { board.viewMainAt(ply); renderMoveList(); transmitirVista(); });
            return btn;
        }

        // La jugada con su signo (!, ?…) y un 💬 si tiene comentario, que también
        // se dice al lector de pantalla (el 💬 solo no le dice nada).
        function ponerTextoDeJugada(btn, san, camino) {
            const c = PgnClase.comentarioDe(comentariosClase, camino);
            btn.textContent = san + (c && c.nag ? PgnClase.signoDe(c.nag) : "") + (c && c.texto ? " 💬" : "");
            if (c) {
                const dicho = [c.nag ? PgnClase.nombreDelSigno(c.nag) : "", c.texto].filter(Boolean).join(": ");
                btn.title = dicho;
                btn.setAttribute("aria-label", san + ", comentada: " + dicho);
            }
        }

        function renderMoveList() {
            const moves = board.moves();
            const listEl = document.getElementById("move-list");
            const emptyEl = document.getElementById("move-list-empty");
            if (!moves.length) {
                listEl.classList.add("hidden");
                listEl.classList.remove("flex");
                emptyEl.classList.remove("hidden");
                listEl.innerHTML = "";
            } else {
                emptyEl.classList.add("hidden");
                listEl.classList.remove("hidden");
                listEl.classList.add("flex");
                listEl.innerHTML = "";
                appendVariantsAtPly(listEl, 0, moves);
                for (let i = 0; i < moves.length; i += 2) {
                    const group = document.createElement("li");
                    group.className = "flex items-center gap-1";
                    const numSpan = document.createElement("span");
                    numSpan.className = "text-brand-450 dark:text-brand-350";
                    numSpan.textContent = (i / 2 + 1) + ".";
                    group.appendChild(numSpan);
                    group.appendChild(makeMoveButton(moves[i], i + 1));
                    if (moves[i + 1]) group.appendChild(makeMoveButton(moves[i + 1], i + 2));
                    listEl.appendChild(group);
                    appendVariantsAtPly(listEl, i + 1, moves);
                    if (moves[i + 1]) appendVariantsAtPly(listEl, i + 2, moves);
                }
            }
            updateHistoryControls();
            pintarComentarioDeLaJugada();
        }

        /* ---------- Comentar las jugadas ----------
           El profe le pone un signo y unas palabras a la jugada que está mirando
           (la de la vista o, si no, la última de la partida). La clase lo ve
           debajo de su tablero cuando mira esa jugada, y viaja en el PGN. */
        function caminoQueSeVe() {
            const v = board.currentView();
            return v ? v.path : board.moves();
        }

        let signoElegido = null;
        let comentarioEditandoDe = null;   // la clave cuyo texto está en el cuadro

        function pintarSignos() {
            const caja = document.getElementById("comentar-signos");
            if (!caja) return;
            if (!caja.childElementCount) {
                PgnClase.SIGNOS.forEach((s) => {
                    const b = document.createElement("button");
                    b.type = "button";
                    b.dataset.nag = String(s.nag);
                    b.className = "min-w-[2.25rem] px-2 py-1 rounded-lg border text-sm font-mono font-bold transition-colors";
                    b.textContent = s.signo;
                    b.title = s.nombre;
                    b.setAttribute("aria-label", s.nombre + " (" + s.signo + ")");
                    b.addEventListener("click", () => { signoElegido = signoElegido === s.nag ? null : s.nag; pintarSignos(); });
                    caja.appendChild(b);
                });
            }
            caja.querySelectorAll("button").forEach((b) => {
                const on = Number(b.dataset.nag) === signoElegido;
                b.setAttribute("aria-pressed", on ? "true" : "false");
                b.classList.toggle("bg-accent-500", on);
                b.classList.toggle("text-brand-900", on);
                b.classList.toggle("border-accent-600", on);
                b.classList.toggle("border-brand-200", !on);
                b.classList.toggle("dark:border-brand-700", !on);
                b.classList.toggle("text-brand-700", !on);
                b.classList.toggle("dark:text-brand-200", !on);
            });
        }

        function pintarComentarioDeLaJugada() {
            const camino = caminoQueSeVe();
            const c = camino.length ? PgnClase.comentarioDe(comentariosClase, camino) : null;
            if (isTeacher) {
                const caja = document.getElementById("comentar-jugada");
                if (!caja) return;
                caja.hidden = !camino.length || board.freeMode;
                if (caja.hidden) return;
                document.getElementById("comentar-jugada-cual").textContent = numerarJugadas(camino, camino.length - 1);
                const k = PgnClase.clave(camino);
                // Solo se rellena al cambiar de jugada: un eco de Realtime no le
                // borra al profe lo que está escribiendo.
                if (k !== comentarioEditandoDe) {
                    comentarioEditandoDe = k;
                    signoElegido = c ? c.nag : null;
                    document.getElementById("comentar-texto").value = c ? c.texto : "";
                }
                document.getElementById("comentar-quitar-btn").hidden = !c;
                pintarSignos();
                return;
            }
            const el = document.getElementById("comentario-profe");
            if (!el) return;
            const texto = c ? "📝 Tu profe comentó " + numerarJugadas(camino, camino.length - 1)
                + (c.nag ? PgnClase.signoDe(c.nag) + " (" + PgnClase.nombreDelSigno(c.nag).toLowerCase() + ")" : "")
                + (c.texto ? ": " + c.texto : ".") : "";
            if (claseAcc && texto && el.textContent !== texto) claseAcc.decir(texto.replace("📝 ", ""));
            el.textContent = texto;   // textContent: el comentario lo escribió una persona
            el.hidden = !texto;
        }

        async function guardarComentario(quitar) {
            const camino = caminoQueSeVe();
            if (!camino.length) return;
            const k = PgnClase.clave(camino);
            const texto = quitar ? "" : document.getElementById("comentar-texto").value.trim().slice(0, 300);
            const nag = quitar ? null : signoElegido;
            // Solo se guardan los de jugadas que siguen en el árbol: los de una
            // línea que ya se borró no tienen dónde ir.
            const vivos = PgnClase.caminos(board.moves(), variantNodes);
            vivos.add(k);
            const nuevos = {};
            Object.keys(comentariosClase).forEach((x) => { if (vivos.has(x) && x !== k) nuevos[x] = comentariosClase[x]; });
            if (nag || texto) nuevos[k] = { nag, texto };
            const { error } = await sb.from("game_state").update({ comentarios: nuevos }).eq("id", myGameStateId);
            if (error) { console.error(error); setStatus("No se pudo guardar el comentario: " + error.message); return; }
            comentariosClase = nuevos;
            comentarioEditandoDe = null;
            renderMoveList();
            setStatus(nag || texto ? "📝 Comentario guardado: la clase lo ve debajo de su tablero." : "Comentario quitado.");
        }

        if (document.getElementById("comentar-guardar-btn")) {
            document.getElementById("comentar-guardar-btn").addEventListener("click", () => guardarComentario(false));
            document.getElementById("comentar-quitar-btn").addEventListener("click", () => guardarComentario(true));
        }

        function updateHistoryControls() {
            const viewing = board.isViewingHistory();
            const controls = document.getElementById("history-controls");
            controls.classList.toggle("hidden", !viewing);
            controls.classList.toggle("flex", viewing);
            document.getElementById("history-fork-btn").classList.toggle("hidden", !(viewing && canMoveNow()));
            updateUndoButton();
        }

        document.getElementById("history-live-btn").addEventListener("click", () => {
            board.viewLive();
            renderMoveList();
            transmitirVista();
        });

        /* ---------- Los alumnos ven lo que mira el profesor ----------
           Cuando el profesor se devuelve a una jugada anterior o recorre una
           variante, eso no cambia la partida (sigue en game_state.moves), pero la
           clase tiene que verlo: si no, el profe explica una posición y los alumnos
           miran otra. Lo que mira se guarda en game_state.vista ({path, parent,
           root}, o null = la posición en vivo) y cada tablero que sigue la clase lo
           muestra. Va en la base y no en un mensaje suelto de Realtime para que
           quien entra tarde, recarga o supervisa vea lo mismo. Solo el profesor la
           cambia (el trigger protect_game_state_teacher_columns se la revierte a
           cualquier otro). Ver «Los alumnos siguen lo que mira el profesor» en
           docs/decisiones/clase-en-vivo.md. */
        let ultimaVistaEnviada = null;
        async function transmitirVista() {
            if (!isTeacher || !myGameStateId) return;
            const vista = board.currentView();
            const clave = JSON.stringify(vista);
            if (clave === ultimaVistaEnviada) return;
            ultimaVistaEnviada = clave;
            const { error } = await sb.from("game_state").update({ vista }).eq("id", myGameStateId);
            if (error) { console.error(error); ultimaVistaEnviada = null; }
        }

        // "12. Nf3 Nc6 13. e4", o "12… Nc6 13. e4" si arranca con negras.
        function numerarJugadas(path, desde) {
            let numero = 1, turno = "w";
            try {
                const partes = (board.startFen || "").split(" ");
                if (partes[1] === "b") turno = "b";
                if (parseInt(partes[5], 10) > 0) numero = parseInt(partes[5], 10);
            } catch (e) {}
            const textos = [];
            path.forEach((san, i) => {
                if (i >= desde) {
                    if (turno === "w") textos.push(numero + ". " + san);
                    else textos.push(i === desde ? numero + "… " + san : san);
                }
                if (turno === "b") numero++;
                turno = turno === "w" ? "b" : "w";
            });
            return textos.join(" ");
        }

        /* La vista que llegó de la base trae lo que el tablero no guarda (de
           quién es la respuesta que se muestra): se le suma a la que se ve, si
           es la misma. */
        let vistaRecibida = null;
        function vistaQueSeVe() {
            const v = board.currentView();
            if (v && vistaRecibida && vistaRecibida.respuesta && JSON.stringify(v.path) === JSON.stringify(vistaRecibida.path)) {
                return Object.assign({}, v, { respuesta: vistaRecibida.respuesta });
            }
            return v;
        }

        // Qué está mostrando el profe, dicho para el alumno (null = la posición en vivo).
        function describirVista(vista) {
            if (!vista || !Array.isArray(vista.path)) return null;
            // Una respuesta que el profe le muestra a la clase.
            if (vista.respuesta && typeof vista.respuesta === "object") {
                const quien = vista.respuesta.nombre ? String(vista.respuesta.nombre) : "un compañero";
                return "📺 Así lo resolvió " + quien + ": " + numerarJugadas(vista.path, Math.max(0, Math.min(vista.root || 0, vista.path.length))) + ".";
            }
            const principal = board.moves();
            const root = Math.max(0, Math.min(vista.root || 0, vista.path.length));
            const esVariante = vista.path.length > root || vista.path.some((san, i) => principal[i] !== san);
            if (!esVariante) {
                return vista.path.length
                    ? "Tu profe volvió a una jugada anterior: " + numerarJugadas(vista.path, vista.path.length - 1) + "."
                    : "Tu profe volvió a la posición de salida.";
            }
            return "Tu profe está mostrando una variante: " + numerarJugadas(vista.path, root) + ".";
        }

        /* A ciegas: con las piezas ocultas el alumno no tenía nada que seguir.
           Ahora ve la partida escrita hasta la jugada que se está mirando. */
        function pintarJugadasACiegas() {
            const el = document.getElementById("jugadas-a-ciegas");
            if (!el || isTeacher) return;
            const camino = board.piecesHidden ? caminoQueSeVe() : [];
            el.hidden = !board.piecesHidden;
            el.textContent = !board.piecesHidden ? ""
                : "🙈 Piezas ocultas: síguela de memoria. " + (camino.length ? "Jugadas: " + numerarJugadas(camino, 0) + "." : "Todavía no hay jugadas: imagina la posición de salida.");
        }

        function pintarVistaDelProfe() {
            const el = document.getElementById("vista-profe");
            if (!el) return;
            const texto = isTeacher ? null : describirVista(vistaQueSeVe());
            el.textContent = texto ? texto + " La partida sigue guardada: cuando vuelva al final, la verás de nuevo." : "";
            el.hidden = !texto;
        }

        document.getElementById("history-fork-btn").addEventListener("click", async () => {
            if (!canMoveNow() || !board.isViewingHistory()) return;
            const discardedMain = board.forkToView();
            if (discardedMain && discardedMain.length) {
                // Archiva la línea en vivo ANTERIOR completa en "Partidas guardadas" para no
                // perderla: "devolver la jugada sin borrarla, para crear variantes".
                const tempGame = board.startFen ? new Chess(board.startFen) : new Chess();
                discardedMain.forEach((m) => tempGame.move(m));
                await sb.from("saved_games").insert({
                    pgn: pgnDeLaClase(discardedMain, true),
                    fen_final: tempGame.fen(),
                    move_count: discardedMain.length,
                    title: "Línea anterior (reemplazada por una variante)",
                    created_by: session.user.id,
                    datos: datosDeLaClase(discardedMain, true),
                });
            }
            board.setMarks([], []);
            await pushBoardState();
            await clearVariantTree(); // las variantes quedaban ancladas a la línea anterior
            updateTurnIndicator();
            renderMoveList();
            if (isTeacher) updateEngineEval();
            setStatus(discardedMain && discardedMain.length
                ? "Se guardó la línea anterior en \"Partidas guardadas\" — ahora estás jugando esta variante en vivo."
                : "Ya puedes jugar desde aquí.");
        });

        // ---------- Estado compartido del tablero (posición, flechas, control cedido) ----------
        function applyGameStateRow(row) {
            // Lo que había ANTES, leído del propio tablero: así la jugada que acaba de
            // hacer este mismo navegador vuelve como eco idéntico y no se anuncia dos veces.
            // En modo libre el tablero del profesor es la posición que está armando,
            // no la de la clase: compararla con lo que llega anunciaría cambios falsos.
            const editando = isTeacher && board.freeMode;
            const antes = primerEstadoCargado && !editando ? { inicio: board.startFen || "", jugadas: board.moves() } : null;
            primerEstadoCargado = true;
            // Mientras el profesor arma una posición a mano, el eco de Realtime (una
            // flecha, un cambio de control) no puede borrarle lo que lleva armado:
            // "Aplicar" la transmite y "Cancelar" vuelve a leer el estado de la base.
            const primeraVez = !antes && !editando;
            const vistaAntes = JSON.stringify(board.currentView());
            if (!editando) board.loadMoves(row.moves || [], row.start_fen);
            /* Quien sigue la clase ve lo que mira el profe. El profe, en cambio, ya
               tiene su vista en el tablero: solo la retoma al cargar la página (la
               suya propia de antes de recargar), no con cada eco. */
            vistaRecibida = row.vista || null;
            if (!isTeacher && !editando) board.showView(row.vista || null);
            else if (isTeacher && primeraVez && row.vista) {
                board.showView(row.vista);
                ultimaVistaEnviada = JSON.stringify(board.currentView());
            }
            const vistaCambio = JSON.stringify(board.currentView()) !== vistaAntes;
            board.setMarks(row.arrows || [], row.circles || []);
            // Ocultar piezas es una herramienta del profesor sobre el tablero de LOS ALUMNOS:
            // en su propio tablero el profesor siempre las ve, aunque la columna esté en true.
            const ocultabaAntes = board.piecesHidden;
            board.setPiecesHidden(!isTeacher && !!row.pieces_hidden);
            lastPiecesHidden = !!row.pieces_hidden;
            if (claseAcc) {
                if (!editando) claseAcc.anunciarCambio(antes, { inicio: row.start_fen || "", jugadas: row.moves || [] });
                if (!isTeacher && antes && vistaCambio) {
                    claseAcc.decir((describirVista(vistaQueSeVe()) || "Tu profe volvió a la posición de la partida.")
                        + " Escribe \"posición\" para oírla.");
                }
                if (!isTeacher && ocultabaAntes !== board.piecesHidden) {
                    claseAcc.decir(board.piecesHidden
                        ? "Tu profe ocultó las piezas: ahora hay que ver el tablero de memoria."
                        : "Tu profe volvió a mostrar las piezas. Escribe \"posición\" para oírla.");
                }
            }
            activePlayerId = row.active_player_id || null;
            activePlayerColor = row.active_player_color || "both";
            comentariosClase = row.comentarios && typeof row.comentarios === "object" ? row.comentarios : {};
            if (!esObservador) pintarElegido(row.elegido || null);
            pintarPensar(row.pensar || null);
            updateTurnIndicator();
            updateAccessForRole();
            renderMoveList();
            pintarVistaDelProfe();
            pintarJugadasACiegas();
            renderStudentsList();
            updateHideBoardBtn();
            if (isTeacher) updateEngineEval();
            // La lección del curso ya NO viaja por game_state: es del profesor y solo él la
            // ve (ver abrirLeccionLocal). Lo único que queda por hacer con esas dos columnas
            // es dejarlas en null la primera vez, para que a nadie que siga con la página
            // anterior cargada le quede una lección abierta de cuando sí se compartían.
            if (isTeacher && (row.shown_curso || row.shown_leccion)) limpiarLeccionCompartida();
        }

        // Se llama como mucho una vez por carga: el update dispara su propio eco de Realtime,
        // y sin la marca ese eco volvería a entrar aquí con la fila vieja en el camino.
        let limpiandoLeccionCompartida = false;
        async function limpiarLeccionCompartida() {
            if (limpiandoLeccionCompartida) return;
            limpiandoLeccionCompartida = true;
            await sb.from("game_state").update({ shown_curso: null, shown_leccion: null }).eq("id", myGameStateId);
        }

        function updateAccessForRole() {
            // Quien supervisa no tiene control que calcular, y el mensaje de alumno le
            // pisaba el suyo («Estás mirando la clase de…») con cada jugada.
            if (isTeacher || esObservador) return;
            const hasControl = activePlayerId === profile.id;
            const colorLabel = activePlayerColor === "w" ? "blancas" : activePlayerColor === "b" ? "negras" : null;
            const myColorTurn = !hasControl || activePlayerColor === "both" || activePlayerColor === board.game.turn();
            // Mientras el profe muestra otra posición, una jugada del alumno sería
            // sobre la que ve y no sobre la partida: se espera a que vuelva.
            const profeMuestraOtra = board.isViewingHistory();
            board.setInteractive(hasControl && myColorTurn && !profeMuestraOtra);
            let text = "Bienvenido a la clase. Verás el tablero moverse en vivo mientras el profesor juega.";
            if (hasControl) {
                text = colorLabel
                    ? ("¡El profesor te dio el control con " + colorLabel + "! " + (myColorTurn ? "Ya puedes mover." : "Espera a que le toque a tu color."))
                    : "¡El profesor te dio el control del tablero! Ya puedes mover piezas.";
                if (profeMuestraOtra) text = "Tienes el control, pero tu profe está mostrando otra posición: cuando vuelva a la partida, vas a poder mover.";
            }
            setStatus(text);
        }

        // ---------- Tener un curso a mano mientras se da la clase (solo el profesor) ----------
        // La lección se abre SOLO en la pantalla del profesor — es material suyo para dar la
        // clase, como el PDF, no algo que la clase reciba: el temario entero delante lo
        // adelanta al alumno y le regala las respuestas de los ejercicios de la lección. Lo
        // que la clase sí recibe es cada posición que el profesor decide mandarle al tablero
        // con el botón de su diagrama (ver vigilarPosicionesDeLaLeccion).
        //
        // Antes esto se sincronizaba por game_state.shown_curso/shown_leccion y lo veían
        // todos; esas dos columnas quedaron sin uso (no se borran de la tabla: una columna
        // de más no molesta a nadie y quitarla obligaría a una migración para nada).
        //
        // El contenido no viaja por Supabase: se pide directo a cursos/protegido/<curso>.html,
        // igual que hace js/curso-academia.js con el panel de Academia. ----------
        const CLASS_LESSON_CATALOG = [
            { slug: "fundamentos-del-ajedrez", titulo: "Fundamentos del Ajedrez" },
            { slug: "aperturas-y-defensas", titulo: "Aperturas y Defensas" },
            { slug: "calculo-y-visualizacion", titulo: "Cálculo y Visualización" },
            { slug: "estrategia-y-tactica", titulo: "Estrategia y Táctica" },
            { slug: "desequilibrios-de-material", titulo: "Desequilibrios de material" },
            { slug: "finales-practicos", titulo: "Finales Prácticos" },
            { slug: "el-mapa-de-los-finales", titulo: "El mapa de los finales" },
            { slug: "estrategia-en-el-final", titulo: "Estrategia en el final" },
            { slug: "partidas-modelo", titulo: "Partidas modelo del ajedrez moderno" },
            { slug: "preparacion-para-torneos", titulo: "Preparación para Torneos" },
        ];
        const leccionesPorCurso = {}; // slug -> [{titulo}, ...] en caché, una vez pedidas

        // Un <details> de nivel superior (con su propio <summary>) es una lección; se
        // ignoran los que están anidados dentro de otro <details> (por ejemplo, alguna
        // aclaración interna de un cuestionario) — mismo filtro que usa curso-academia.js.
        function detallesDeLeccion(root) {
            return Array.from(root.querySelectorAll("details")).filter((d) =>
                !(d.parentElement && d.parentElement.closest("details")) && d.querySelector(":scope > summary")
            );
        }

        async function fetchLeccionesDeCurso(slug) {
            if (leccionesPorCurso[slug]) return leccionesPorCurso[slug];
            if (window.SesionCursos) SesionCursos.guardar(session); // la cookie que mira worker.js
            const r = await fetch("cursos/protegido/" + slug + ".html", { credentials: "same-origin" });
            if (!r.ok) throw new Error("no_content");
            const html = await r.text();
            const temp = document.createElement("div");
            temp.innerHTML = html;
            const detalles = detallesDeLeccion(temp);
            const lecciones = detalles.map((d) => (d.querySelector(":scope > summary").textContent || "").replace(/\s+/g, " ").trim());
            leccionesPorCurso[slug] = lecciones;
            return lecciones;
        }

        // Se llama desde init() una vez que isTeacher ya quedó resuelto (ver más abajo). Vivía
        // como "if (isTeacher) {...}" a nivel superior del script, y por eso nunca se ejecutaba:
        // ese código corre al analizar el <script>, antes de que init() — que es quien recién
        // consulta la sesión y el perfil — llegue a fijar isTeacher. Con isTeacher siempre en su
        // valor inicial (false), el botón "📚 Curso" no tenía ningún oyente de clic: no pasaba
        // nada al presionarlo, para cualquier profesor, siempre.
        function setupTeacherLessonTools() {
            const cursoSelect = document.getElementById("lesson-curso-select");
            const leccionSelect = document.getElementById("lesson-leccion-select");
            const panelMsg = document.getElementById("lesson-picker-msg");
            CLASS_LESSON_CATALOG.forEach((c) => {
                const opt = document.createElement("option"); opt.value = c.slug; opt.textContent = c.titulo;
                cursoSelect.appendChild(opt);
            });

            async function refreshLeccionOptions() {
                leccionSelect.innerHTML = '<option value="">Cargando…</option>';
                panelMsg.textContent = "";
                try {
                    const lecciones = await fetchLeccionesDeCurso(cursoSelect.value);
                    leccionSelect.innerHTML = "";
                    lecciones.forEach((titulo, i) => {
                        const opt = document.createElement("option"); opt.value = String(i + 1); opt.textContent = titulo;
                        leccionSelect.appendChild(opt);
                    });
                } catch (e) {
                    leccionSelect.innerHTML = "";
                    panelMsg.textContent = "No se pudo cargar el temario de este curso.";
                }
            }

            cursoSelect.addEventListener("change", refreshLeccionOptions);

            document.getElementById("toggle-lesson-btn").addEventListener("click", () => {
                const panel = document.getElementById("lesson-picker-panel");
                const active = panel.classList.contains("hidden");
                panel.classList.toggle("hidden", !active);
                document.getElementById("board-edit-panel").classList.add("hidden"); // no los dos a la vez
                document.getElementById("pdf-panel").classList.add("hidden");
                document.getElementById("archivos-panel").classList.add("hidden");
                if (active && leccionSelect.options.length === 0) refreshLeccionOptions();
            });
            document.getElementById("lesson-picker-close-btn").addEventListener("click", () => {
                document.getElementById("lesson-picker-panel").classList.add("hidden");
            });

            document.getElementById("lesson-show-btn").addEventListener("click", () => {
                const slug = cursoSelect.value, n = parseInt(leccionSelect.value, 10);
                if (!slug || !n) { panelMsg.textContent = "Elige un curso y un tema."; return; }
                panelMsg.textContent = "";
                abrirLeccionLocal(slug, n);
            });
            document.getElementById("lesson-hide-btn").addEventListener("click", cerrarLeccionLocal);
            document.getElementById("class-lesson-hide-btn").addEventListener("click", cerrarLeccionLocal);

            // ---------- Leer un PDF en clase + reconocer sus diagramas (ver js/pdf-diagramas.js) ----------
            // El módulo hace todo el trabajo de PDF/reconocimiento; acá solo se le indica qué
            // hacer con el FEN que arma: mandarlo al editor de tablero YA EXISTENTE (mismo
            // flujo de "✏️ Editar" con su paleta y su botón "Aplicar posición"), en vez de
            // reimplementar una segunda forma de aplicar una posición.
            if (window.PdfDiagramas) {
                window.PdfDiagramas.init({
                    onFenReady: (fen) => {
                        if (!board.freeMode) document.getElementById("toggle-free-mode-btn").click();
                        const ok = board.loadFreeModeFen(fen);
                        if (ok) {
                            syncEditPanelFromPosition();
                            setStatus("Diagrama cargado en el editor: revisa la posición, el turno y los enroques antes de aplicar.");
                        } else {
                            setStatus("No se pudo cargar el diagrama reconocido.");
                        }
                    },
                });
            }
        }

        // ---------- Jalar al tablero un PGN subido en Archivos (solo el profesor) ----------
        // Misma tabla "archivos_pgn" de partidas.html: se listan solo las del propio
        // profesor (la RLS ya aísla por profesor_id, pero acá además no tiene sentido
        // ofrecer el archivo de otro). Las tres acciones —Cargar, Preguntar, Practicar—
        // mandan la posición de SALIDA del PGN, nunca la final: "Cargar" pasaba antes por
        // board.loadMoves() con la línea entera, y eso dejaba a la clase viendo de una
        // el desenlace del ejercicio (jaque mate incluido) apenas se elegía el archivo, sin
        // haber jugado ni una jugada delante de nadie. Ahora las tres pasan por
        // aplicarPosicionEnClase(), como cualquier otra puerta que pone una posición en el
        // tablero: la clase arranca de la posición inicial, sin variantes de una línea
        // anterior colgando, y la línea se juega en vivo desde ahí, jugada por jugada, con
        // el mismo mecanismo de cualquier partida (onMove → pushBoardState()).
        let archivosPanelCargados = false;

        /* ---------- "Ver todas las posiciones": Archivos y Táctica ----------
           Las dos listas de material del profesor —los PGN que subió en Archivos y los
           ejercicios de Táctica— traen la posición de cada fila escondida detrás de su
           propio "👁 Vista previa", y el rótulo de la fila no dice NADA de ella:
           "Position 4, 1 Move" o "3. ELO 1397" no distinguen un mate en dos de un final
           de torre. Así que para encontrar cuál dar había que abrir y cerrar de a una,
           con la clase delante — que es justo lo que se pidió poder dejar de hacer.

           El interruptor las destapa todas, y con él encendido cada fila NACE destapada:
           al cambiar de tema, de dificultad o de carpeta no hay que volver a apretarlo,
           que es lo que hace que sirva para buscar. Se recuerda en el APARATO
           (localStorage), como el tema o la clase elegida: es de cómo se está mirando la
           lista, no de quién mira. Y abrirlas una por una se sigue pudiendo, porque el
           interruptor decide con qué estado nace cada fila y no le impone el suyo
           después: con todas destapadas se puede cerrar la que estorba, y al revés.

           Cada lista recuerda lo suyo, con su propia clave: son de tamaños muy distintos
           —cientos de archivos contra treinta y pico de ejercicios— y encender en una no
           tiene por qué encender en la otra.

           EL TABLERO SE DIBUJA CUANDO LA FILA ENTRA EN PANTALLA, no al destaparla ni
           todas de golpe, y esas son las dos fallas que este observador evita:

           - Dibujar las 34 de una tanda de táctica —o los cientos de PGN de un profesor—
             en el mismo cuadro son miles de casillas de una vez: el panel se queda
             congelado unos segundos en medio de la clase, sin dar ningún error.
           - Y el tamaño de la pieza se mide sobre la casilla YA renderizada (ver
             renderTacticsPreviewBoard y sizePieces de js/article-example-board.js), así
             que dentro de una carpeta cerrada —un <details>— esa medida es CERO y el
             tablero saldría con las piezas del tamaño que no era. Con el observador, lo
             que está guardado en una carpeta se dibuja al abrirla, ya medible. */
        function crearVistaPreviaLote(clave) {
            const dibujos = new WeakMap(); // recuadro → la función que pinta su tablero
            let filas = [];                // las de la lista que se está mirando
            let controles = [];            // repintar el rótulo del interruptor
            let observador = null;

            function encendido() {
                try { return localStorage.getItem(clave) === "1"; } catch (e) { return false; }
            }
            function guardar(v) {
                // En modo privado esto puede fallar: la lista funciona igual, solo que no
                // se acuerda de cómo quedó.
                try { if (v) localStorage.setItem(clave, "1"); else localStorage.removeItem(clave); } catch (e) {}
            }
            function dibujar(wrap) {
                if (wrap.dataset.rendered) return;
                const pintar = dibujos.get(wrap);
                if (!pintar) return;
                wrap.dataset.rendered = "1";
                pintar(wrap);
            }
            function mirar(wrap) {
                if (wrap.dataset.rendered) return;
                // Sin IntersectionObserver se dibuja y ya: tarda más, pero no deja a nadie
                // con un recuadro destapado y vacío.
                if (typeof IntersectionObserver !== "function") { dibujar(wrap); return; }
                if (!observador) {
                    observador = new IntersectionObserver((entradas) => {
                        entradas.forEach((e) => {
                            if (!e.isIntersecting) return;
                            observador.unobserve(e.target);
                            dibujar(e.target);
                        });
                    }, { rootMargin: "300px" }); // un poco antes de que asome, para que no se vea aparecer
                }
                observador.observe(wrap);
            }
            function abrir(fila, abierta) {
                fila.wrap.classList.toggle("hidden", !abierta);
                fila.btn.textContent = abierta ? "🙈 Ocultar" : "👁 Vista previa";
                fila.btn.setAttribute("aria-expanded", String(abierta));
                if (abierta) mirar(fila.wrap);
            }

            return {
                /* Al repintar la lista —otro tema, otra dificultad, recargar los archivos—
                   las filas de antes cuelgan de nodos que ya no están en la página:
                   dejarlas registradas haría que el interruptor destapara tableros que no
                   se ven y que el observador siguiera mirando lo que se fue. */
                reiniciar() {
                    if (observador) { observador.disconnect(); observador = null; }
                    filas = [];
                    controles = [];
                },
                registrar(wrap, btn, pintar) {
                    dibujos.set(wrap, pintar);
                    const fila = { wrap: wrap, btn: btn };
                    filas.push(fila);
                    btn.setAttribute("aria-expanded", "false");
                    btn.addEventListener("click", () => abrir(fila, wrap.classList.contains("hidden")));
                    if (encendido()) abrir(fila, true);
                },
                /* El interruptor de la lista. Dice lo que va a pasar al apretarlo —no el
                   estado en que está— igual que el "🙈 Ocultar" de cada fila. */
                control() {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    const pintarse = () => {
                        const v = encendido();
                        btn.textContent = v ? "🙈 Ocultar las posiciones" : "👁 Ver todas las posiciones";
                        btn.title = v
                            ? "Volver a esconder las posiciones y abrirlas una por una"
                            : "Destapar la posición de todas las filas de esta lista, para buscar a ojo la que vas a dar";
                        btn.className = "shrink-0 text-xs font-semibold px-2 py-1 rounded-lg transition-colors " + (v
                            ? "bg-accent-500 hover:bg-accent-600 text-brand-900"
                            : "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200");
                    };
                    btn.addEventListener("click", () => {
                        const v = !encendido();
                        guardar(v);
                        controles.forEach((f) => f());
                        filas.forEach((fila) => abrir(fila, v));
                    });
                    controles.push(pintarse);
                    pintarse();
                    return btn;
                },
            };
        }

        const vistaPreviaArchivos = crearVistaPreviaLote("sesion_vista_previa_archivos_v1");
        const vistaPreviaTactica = crearVistaPreviaLote("sesion_vista_previa_tactica_v1");


        // La posición de SALIDA del PGN (antes de sus jugadas), no la final: es la que
        // identifica al ejercicio ("de qué posición se trata") y la que usan las tres
        // acciones —Cargar, Preguntar, Practicar— para mandar la clase a la misma línea de
        // salida. No se guarda en la fila (solo fen_final vive en la base, ver
        // partidas.html): sale del propio PGN, que ya se tiene en memoria.
        function archivoStartFen(a) {
            const game = new Chess();
            if (!game.load_pgn(a.pgn, { sloppy: true })) return null;
            const headers = typeof game.header === "function" ? game.header() : {};
            return headers.FEN || new Chess().fen();
        }

        function renderArchivoPanelItem(a) {
            const li = document.createElement("li");
            li.className = "bg-brand-50 dark:bg-brand-950 rounded-lg px-3 py-2";
            const info = document.createElement("div");
            info.className = "min-w-0";
            const title = document.createElement("p");
            title.className = "text-sm font-semibold text-brand-800 dark:text-white truncate";
            title.textContent = a.titulo;
            const meta = document.createElement("p");
            meta.className = "text-xs text-brand-450 dark:text-brand-350";
            meta.textContent = a.move_count + " jugadas · " + a.nombre_archivo;
            info.append(title, meta);
            li.appendChild(info);

            // Mismo patrón que la lista de Táctica: vista previa opcional (el tablero se
            // dibuja recién al destaparla, porque su tamaño se mide sobre la casilla ya
            // renderizada) y tres acciones — cargar la línea completa, preguntarla o
            // mandarla a practicar contra el motor.
            const actions = document.createElement("div");
            actions.className = "flex items-center flex-wrap gap-1.5 mt-2";
            const previewBtn = document.createElement("button");
            previewBtn.type = "button";
            previewBtn.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors";
            previewBtn.textContent = "👁 Vista previa";
            const loadBtn = document.createElement("button");
            loadBtn.type = "button";
            loadBtn.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors";
            loadBtn.textContent = "📥 Cargar";
            loadBtn.title = "Cargar la posición inicial de esta línea en el tablero, para jugarla en vivo con la clase";
            const askBtn = document.createElement("button");
            askBtn.type = "button";
            askBtn.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors";
            askBtn.textContent = "❓ Preguntar";
            askBtn.title = "Enviar la posición de salida a la clase como pregunta";
            const practiceBtn = document.createElement("button");
            practiceBtn.type = "button";
            practiceBtn.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors";
            practiceBtn.textContent = "🎯 Practicar";
            practiceBtn.title = "Que los alumnos practiquen esta posición contra el motor";
            actions.append(previewBtn, loadBtn, askBtn, practiceBtn);
            li.appendChild(actions);

            const previewWrap = document.createElement("div");
            previewWrap.className = "hidden mt-2";
            li.appendChild(previewWrap);

            // Destaparla y dibujarla lo lleva el lote: así esta fila hace lo mismo
            // apretando su propio botón que cuando se destapan todas de una, y el
            // tablero se dibuja recién cuando la fila entra en pantalla —dentro de una
            // carpeta cerrada la casilla mide cero y la pieza saldría de otro tamaño—.
            vistaPreviaArchivos.registrar(previewWrap, previewBtn, () => {
                const fen = archivoStartFen(a);
                if (fen) renderTacticsPreviewBoard(previewWrap, fen);
                else previewWrap.textContent = "Ese PGN no se pudo interpretar.";
            });
            loadBtn.addEventListener("click", () => cargarArchivoEnClase(a));
            askBtn.addEventListener("click", () => askArchivoExercise(a));
            practiceBtn.addEventListener("click", () => practicarArchivoExercise(a));
            return li;
        }

        function renderArchivoPanelGrupo(nombre, lista) {
            const det = document.createElement("details");
            det.className = "border border-brand-200 dark:border-brand-700 rounded-lg overflow-hidden";
            det.open = !nombre; // "Sin carpeta" arranca abierta; las que tienen nombre, cerradas
            const summary = document.createElement("summary");
            summary.className = "cursor-pointer text-xs font-semibold text-brand-700 dark:text-brand-200 px-3 py-2 marker:text-accent-600";
            summary.textContent = (nombre ? "📁 " + nombre : "🗂️ Sin carpeta") + " (" + lista.length + ")";
            det.appendChild(summary);
            const ul = document.createElement("ul");
            ul.className = "space-y-2 px-2 pb-2";
            lista.forEach((a) => ul.appendChild(renderArchivoPanelItem(a)));
            det.appendChild(ul);
            return det;
        }

        // Las carpetas se ordenan en partidas.html; acá solo se agrupa lo que ya
        // quedó puesto, para que la lista se pueda recorrer aunque sean muchos PGN.
        async function refreshArchivosPanel() {
            const wrap = document.getElementById("archivos-panel-list");
            const emptyEl = document.getElementById("archivos-panel-empty");
            const msgEl = document.getElementById("archivos-panel-msg");
            const toolsEl = document.getElementById("archivos-panel-tools");
            msgEl.textContent = "";
            wrap.innerHTML = "";
            toolsEl.innerHTML = "";
            toolsEl.className = "";   // vacío no deja margen: la lista arranca pegada al aviso
            vistaPreviaArchivos.reiniciar();
            const { data, error } = await sb.from("archivos_pgn").select("*")
                .eq("profesor_id", session.user.id).order("created_at", { ascending: false });
            if (error) { msgEl.textContent = "No se pudo cargar tu lista de archivos."; return; }
            const archivos = data || [];
            emptyEl.classList.toggle("hidden", archivos.length > 0);
            // Sin archivos no se ofrece el interruptor: un control que no cambia nada.
            if (archivos.length) {
                const cuenta = document.createElement("p");
                cuenta.className = "text-xs text-brand-450 dark:text-brand-350 min-w-0 truncate";
                cuenta.textContent = archivos.length + (archivos.length === 1 ? " archivo" : " archivos");
                toolsEl.className = "flex items-center justify-between gap-2 mb-2";
                toolsEl.append(cuenta, vistaPreviaArchivos.control());
            }

            const porCarpeta = new Map(); // "" = sin carpeta
            archivos.forEach((a) => {
                const clave = a.carpeta || "";
                if (!porCarpeta.has(clave)) porCarpeta.set(clave, []);
                porCarpeta.get(clave).push(a);
            });
            const nombresCarpetas = [...porCarpeta.keys()].filter((c) => c !== "").sort((a, b) => a.localeCompare(b, "es"));
            nombresCarpetas.forEach((nombre) => wrap.appendChild(renderArchivoPanelGrupo(nombre, porCarpeta.get(nombre))));
            if (porCarpeta.has("")) wrap.appendChild(renderArchivoPanelGrupo(null, porCarpeta.get("")));

            archivosPanelCargados = true;
        }

        async function cargarArchivoEnClase(a) {
            const msgEl = document.getElementById("archivos-panel-msg");
            const fen = archivoStartFen(a);
            if (!fen) { msgEl.textContent = "Ese PGN no se pudo interpretar."; return; }
            const aviso = "Se cargó \"" + a.titulo + "\" en el tablero, desde su posición inicial — juega la línea en vivo con la clase.";
            if (!(await aplicarPosicionEnClase(fen, aviso))) return;
            document.getElementById("archivos-panel").classList.add("hidden");
        }

        // Envía la posición de SALIDA del PGN como pregunta — mismo mecanismo que
        // askTacticsExercise() más abajo (misma tabla game_state, misma tabla questions),
        // solo que la posición viene de un archivo subido en Archivos y no del banco de
        // Táctica. expectedPlies sale del propio move_count del archivo, con el mismo
        // tope de 6 que usa Táctica: sin tope, un PGN de 40 jugadas dejaría el campo de
        // "jugadas esperadas" con un número que nadie va a escribir de memoria.
        async function askArchivoExercise(a) {
            const msgEl = document.getElementById("archivos-panel-msg");
            const fen = archivoStartFen(a);
            if (!fen) { msgEl.textContent = "Ese PGN no se pudo interpretar."; return; }
            const expectedPlies = Math.max(1, Math.min(6, Math.ceil((a.move_count || 1) / 2)));
            if (!(await aplicarPosicionEnClase(fen))) return;
            document.getElementById("question-plies-input").value = expectedPlies;
            const { data, error } = await crearPregunta(fen, expectedPlies);
            if (error) { console.error(error); setStatus("No se pudo crear la pregunta: " + error.message); return; }
            document.getElementById("archivos-panel").classList.add("hidden");
            activateTeacherTab("preguntar");
            setStatus("Se envió \"" + a.titulo + "\" a la clase como pregunta.");
            computeEngineAnswer(data.id, fen, expectedPlies); // en segundo plano, no bloquea la pregunta
        }

        // Manda la posición de salida a practicar contra el motor — mismo insert que
        // start-practice-btn (misma tabla practice_sessions), pero con el fen del archivo
        // en vez de board.fen(): por eso pasa antes por aplicarPosicionEnClase(), que deja
        // el tablero de la clase mostrando la MISMA posición que los alumnos van a jugar.
        async function practicarArchivoExercise(a) {
            const msgEl = document.getElementById("archivos-panel-msg");
            const fen = archivoStartFen(a);
            if (!fen) { msgEl.textContent = "Ese PGN no se pudo interpretar."; return; }
            if (!(await aplicarPosicionEnClase(fen))) return;
            if (typeof PracticeEngine !== "undefined") PracticeEngine.preload();
            const { error } = await crearPractica(fen, selectedPracticeLevel);
            if (error) { console.error(error); setStatus("No se pudo iniciar la práctica: " + error.message); return; }
            document.getElementById("archivos-panel").classList.add("hidden");
            activateTeacherTab("practicar");
            setStatus("Práctica iniciada desde \"" + a.titulo + "\": los alumnos ya pueden jugar contra el motor.");
        }

        function setupArchivosTools() {
            document.getElementById("toggle-archivos-btn").addEventListener("click", () => {
                const panel = document.getElementById("archivos-panel");
                const active = panel.classList.contains("hidden");
                panel.classList.toggle("hidden", !active);
                document.getElementById("board-edit-panel").classList.add("hidden");
                document.getElementById("lesson-picker-panel").classList.add("hidden");
                document.getElementById("pdf-panel").classList.add("hidden");
                if (active && !archivosPanelCargados) refreshArchivosPanel();
            });
            document.getElementById("archivos-panel-close-btn").addEventListener("click", () => {
                document.getElementById("archivos-panel").classList.add("hidden");
            });
        }

        // Abre la lección en la pantalla del profesor y en ninguna otra: no toca Supabase,
        // así que no hay nada que un alumno pueda recibir. Solo el profesor tiene el botón
        // que llega hasta aquí, y el panel vive dentro de su columna del tablero.
        function cerrarLeccionLocal() {
            if (observadorDeLeccion) { observadorDeLeccion.disconnect(); observadorDeLeccion = null; }
            const bodyEl = document.getElementById("class-lesson-body");
            bodyEl.innerHTML = "";
            delete bodyEl.dataset.course;
            document.getElementById("class-lesson-msg").textContent = "";
            document.getElementById("class-lesson-panel").classList.add("hidden");
        }

        let observadorDeLeccion = null;
        async function abrirLeccionLocal(slug, n) {
            if (!isTeacher) return;
            cerrarLeccionLocal();
            const panel = document.getElementById("class-lesson-panel");
            const titleEl = document.getElementById("class-lesson-title");
            const msgEl = document.getElementById("class-lesson-msg");
            const bodyEl = document.getElementById("class-lesson-body");
            const catalogEntry = CLASS_LESSON_CATALOG.find((c) => c.slug === slug);
            panel.classList.remove("hidden");
            document.getElementById("class-lesson-hide-btn").classList.remove("hidden");
            titleEl.textContent = "📚 " + (catalogEntry ? catalogEntry.titulo : slug);
            msgEl.textContent = "Cargando…";
            try {
                if (window.SesionCursos) SesionCursos.guardar(session); // la cookie que mira worker.js
                const r = await fetch("cursos/protegido/" + slug + ".html", { credentials: "same-origin" });
                if (!r.ok) throw new Error("no_content");
                const html = await r.text();
                const temp = document.createElement("div");
                temp.innerHTML = html;
                const detalles = detallesDeLeccion(temp);
                const leccion = detalles[n - 1];
                if (!leccion) throw new Error("sin_leccion");
                leccion.open = true;
                bodyEl.dataset.course = slug;
                bodyEl.appendChild(leccion);
                if (window.Finales100) window.Finales100.init(bodyEl);
                if (window.CursoPartidas) window.CursoPartidas.init(bodyEl);
                document.dispatchEvent(new CustomEvent("curso:contenido", { detail: { body: bodyEl, curso: slug } }));
                vigilarPosicionesDeLaLeccion(bodyEl);
                msgEl.textContent = "";
            } catch (e) {
                msgEl.textContent = "No se pudo cargar esta lección.";
            }
        }

        // ---------- El botón que lleva una posición del curso al tablero de la clase ----------
        // Los visores del curso se construyen cuando se ven (los <details> cerrados esperan a
        // abrirse: el curso tiene más de 300 diagramas y construirlos todos de golpe frenaría
        // el celular), así que no alcanza con recorrer la lección una vez al inyectarla — el
        // botón se pone sobre lo que vaya apareciendo. Es el mismo patrón que ya usan
        // js/coordenadas-tablero.js y js/board-drag.js.
        //
        // El FEN NO se vuelve a sacar del archivo de datos: se lee del data-fen-actual que el
        // propio visor publica (ver publicarFen en js/finales-100.js y js/curso-partidas.js),
        // que es la posición que el profesor tiene delante — recorriendo la línea casi nunca
        // está en la primera, y mandar la inicial cuando él está explicando la jugada 12 es
        // exactamente el fallo que no avisa: se transmite una posición, solo que la que no era.
        //
        // Los diagramas FIJOS (.cp-static: un dibujo con su pie, sin línea que recorrer) no
        // tienen visor que publique nada, así que traen su FEN escrita en el propio HTML, en
        // el mismo data-fen-actual. Sin ella eran lo único de la lección que el profesor no
        // podía enseñarle a la clase, y eso no daba ningún error: simplemente no había botón.
        const VISORES_CON_POSICION = ".f100-viewer, .cp-viewer, .cp-static[data-fen-actual]";
        function lugarDelBoton(visor) {
            const head = visor.querySelector(".f100-head, .cp-head");
            if (head) return head;
            if (!visor.classList.contains("cp-static")) return null;
            // El diagrama fijo es una rejilla de dos columnas (dibujo | pie): el botón va
            // DEBAJO del pie, en la misma columna, y no como tercer hijo, que caería en una
            // fila nueva debajo del dibujo.
            let texto = visor.querySelector(".cp-static-texto");
            if (!texto) {
                const pie = visor.querySelector(":scope > p");
                if (!pie) return null;
                texto = document.createElement("div");
                texto.className = "cp-static-texto space-y-2";
                pie.replaceWith(texto);
                texto.appendChild(pie);
            }
            return texto;
        }
        function ponerBotonDePosicion(visor) {
            if (visor.querySelector(".lesson-send-btn")) return;
            const head = lugarDelBoton(visor);
            if (!head) return;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "lesson-send-btn text-xs font-semibold px-2 py-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors";
            btn.textContent = "📥 Al tablero de la clase";
            btn.title = "Transmitir a todos los alumnos la posición que estás viendo en este diagrama";
            btn.addEventListener("click", async () => {
                // El aviso va en el propio panel de la lección y no solo en la franja de
                // estado de arriba: para llegar a este botón hay que estar con la lección
                // delante, o sea con la franja fuera de la pantalla. Hay posiciones de curso
                // que son ilustraciones y no partidas —una tiene un peón y un solo rey— y no
                // se pueden poner en un tablero en vivo: decir por qué es lo único que evita
                // que parezca que el botón no hace nada.
                const leccionMsg = document.getElementById("class-lesson-msg");
                const fen = visor.dataset.fenActual;
                leccionMsg.textContent = "";
                if (!fen) { leccionMsg.textContent = "Este diagrama todavía no tiene una posición que mandar."; return; }
                const motivo = motivoPosicionInvalida(fen);
                if (motivo) { leccionMsg.textContent = "No se puede llevar al tablero: " + motivo; return; }
                const ok = await aplicarPosicionEnClase(fen, "Posición del curso enviada: ya la ven todos los alumnos.");
                if (ok) { btn.textContent = "✅ Enviada"; setTimeout(() => { btn.textContent = "📥 Al tablero de la clase"; }, 2000); }
            });
            head.appendChild(btn);
        }
        function vigilarPosicionesDeLaLeccion(bodyEl) {
            const repasar = () => bodyEl.querySelectorAll(VISORES_CON_POSICION).forEach(ponerBotonDePosicion);
            repasar();
            // Recorrer la línea de un diagrama reescribe su tablero entero en cada jugada, o
            // sea decenas de mutaciones por clic: el repaso se agrupa en un solo cuadro de
            // animación en vez de correr una vez por mutación.
            let pendiente = false;
            observadorDeLeccion = new MutationObserver(() => {
                if (pendiente) return;
                pendiente = true;
                requestAnimationFrame(() => { pendiente = false; repasar(); });
            });
            observadorDeLeccion.observe(bodyEl, { childList: true, subtree: true });
        }

        // ---------- Poner una posición en el tablero de la clase ----------
        // Tres puertas distintas llegan aquí: "✅ Aplicar posición" del editor, el botón
        // de cada diagrama del curso que el profesor tiene abierto y el de la vista previa
        // de Táctica. Las tres tienen que escribir EXACTAMENTE lo mismo — si cada una
        // armara su propio update, la que se olvidara de limpiar las variantes o de
        // quitarle el control al alumno dejaría la clase con un resto de la posición
        // anterior, y eso no da ningún error: simplemente el tablero no se comporta igual
        // según por dónde entró la posición.

        // chess.js carga sin quejarse posiciones que no pueden existir en una partida real,
        // y algunas de ellas rompen a Stockfish para el resto de la sesión (ver la nota en
        // js/shared-engine.js). Devuelve el motivo por el que no se puede transmitir, o
        // null si la posición está bien.
        /* La validación vive en js/posicion-valida.js: la comparte el armador de
           planes, que hace la misma pregunta ANTES de guardar. Acá queda el
           nombre de siempre, que usan las cuatro puertas de esta página.

           Va como `function` y no como `const`: la primera de esas puertas está
           escrita más ARRIBA en el archivo, y un `const` no existe hasta que se
           evalúa su línea — es el mismo "Cannot access before initialization"
           que dejó a 4x4.html colgada en "Comprobando tu sesión…". */
        function motivoPosicionInvalida(fen) { return PosicionValida.motivo(fen); }

        async function aplicarPosicionEnClase(fen, aviso) {
            const motivo = motivoPosicionInvalida(fen);
            if (motivo) { setStatus(motivo); return false; }
            board.loadMoves([], fen);
            board.viewLive();
            ultimaVistaEnviada = "null";
            const { error } = await sb.from("game_state").update({
                fen, moves: [], start_fen: fen, last_move: null, vista: null, comentarios: {},
                arrows: [], circles: [], active_player_id: null, active_player_color: "both",
                updated_by: session.user.id, updated_at: new Date().toISOString(),
            }).eq("id", myGameStateId);
            if (error) { console.error(error); setStatus("No se pudo transmitir la posición: " + error.message); return false; }
            /* Segundo disparador de "esto ya es una clase": el profesor mandó una
               posición al tablero de todos. Va DESPUÉS de que la posición se haya
               transmitido de verdad — abrir la clase por un intento que falló
               dejaría una clase registrada que nadie dio. Las tres puertas del
               sitio pasan por esta función, así que alcanza con engancharlo acá. */
            abrirClaseSiHaceFalta();
            await clearVariantTree();
            // No hay que esperar a que llegue el eco de Realtime del propio cambio para
            // refrescar el motor de análisis: eso dependía de un viaje de ida y vuelta a
            // Supabase (con las ~8 suscripciones de Realtime abiertas en esta página, en una
            // red de aula puede tardar o perderse) y mientras tanto el panel se quedaba
            // mostrando la evaluación de la posición anterior. El tablero del profesor ya
            // tiene la posición nueva aplicada localmente, así que se le pide aquí.
            if (isTeacher) updateEngineEval();
            if (aviso) setStatus(aviso);
            return true;
        }

        async function pushBoardState(extraFields) {
            const moves = board.moves();
            const { error } = await sb.from("game_state").update(Object.assign({
                fen: board.fen(),
                moves,
                start_fen: board.startFen,
                last_move: moves.length ? moves[moves.length - 1] : null,
                arrows: [],
                circles: [],
                // Jugar en la partida (o «Jugar desde aquí») es mirar la posición
                // en vivo. A un alumno con el control el trigger se la deja como estaba.
                vista: null,
                updated_by: session.user.id,
                updated_at: new Date().toISOString(),
            }, extraFields || {})).eq("id", myGameStateId);
            if (isTeacher) ultimaVistaEnviada = "null";
            if (error) {
                console.error(error);
                setStatus("No se pudo guardar el cambio: " + error.message);
            }
        }

        async function pushMarksToServer(marks) {
            const { error } = await sb.from("game_state").update({ arrows: marks.arrows, circles: marks.circles }).eq("id", myGameStateId);
            if (error) console.error(error);
        }

        // Cada profesor tiene su propia fila en game_state (owner_id). La primera vez
        // que un profesor entra a dar clase todavía no existe — se crea aquí, con la
        // posición inicial por defecto. Un alumno nunca la crea: si su profesor
        // asignado aún no dio ninguna clase, simplemente no hay tablero que mostrar.
        async function loadGameState() {
            const { data, error } = await sb.from("game_state").select("*").eq("owner_id", boardOwnerId).maybeSingle();
            if (error) { setStatus("No se pudo cargar el tablero: " + error.message); return; }
            if (data) { myGameStateId = data.id; applyGameStateRow(data); return; }
            if (!isTeacher) { setStatus("Tu profesor todavía no ha abierto su tablero de clase."); return; }
            const { data: created, error: createError } = await sb.from("game_state").insert({ owner_id: boardOwnerId }).select().single();
            if (createError) { setStatus("No se pudo crear tu tablero: " + createError.message); return; }
            myGameStateId = created.id;
            applyGameStateRow(created);
        }

        function subscribeRealtime() {
            sb.channel("game_state-changes:" + boardOwnerId)
                .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_state", filter: "owner_id=eq." + boardOwnerId }, (payload) => {
                    applyGameStateRow(payload.new);
                })
                .subscribe();
        }

        // ---------- Registro de clases: asistencia, tiempo real conectado y cierre en vivo ----------
        let currentOpenSessionId = null;

        async function markAttendance(sessionId) {
            if (isTeacher || esObservador) return;
            const { error } = await sb.from("class_attendance").upsert(
                { session_id: sessionId, student_id: profile.id },
                { onConflict: "session_id,student_id", ignoreDuplicates: true }
            );
            if (error) console.error(error);
        }

        // Tiempo en clase EXACTO: no se estima desde que entró hasta que cerró la clase, sino
        // que se abre una fila al conectarse y se va "tocando" (left_at) cada pocos segundos
        // mientras la pestaña sigue abierta — así left_at siempre refleja, con unos segundos de
        // margen, el último momento realmente conectado, sin depender de que el navegador
        // avise al cerrarse.
        let presenceLogId = null;
        let presenceHeartbeatTimer = null;

        async function startPresenceLog(sessionId) {
            if (isTeacher || esObservador || !sessionId || presenceLogId) return;
            const { data, error } = await sb.from("class_presence_log")
                .insert({ session_id: sessionId, student_id: profile.id })
                .select().single();
            if (error) { console.error(error); return; }
            presenceLogId = data.id;
            if (presenceHeartbeatTimer) clearInterval(presenceHeartbeatTimer);
            presenceHeartbeatTimer = setInterval(touchPresenceLog, 20000);
        }

        async function touchPresenceLog() {
            if (!presenceLogId) return;
            await sb.from("class_presence_log").update({ left_at: new Date().toISOString() }).eq("id", presenceLogId);
        }

        async function stopPresenceLog() {
            if (presenceHeartbeatTimer) { clearInterval(presenceHeartbeatTimer); presenceHeartbeatTimer = null; }
            if (presenceLogId) {
                await touchPresenceLog();
                presenceLogId = null;
            }
        }

        /* ---- Que la clase quede registrada sin acordarse de nada -----------
         *
         * La asistencia, los minutos en clase, el informe a la casa y el reporte
         * de actividades cuelgan TODOS de que exista una fila abierta en
         * `class_sessions`. Y esa fila la abría un botón que vive en el panel
         * (`clases.html`), mientras que la clase se da acá: el profesor entra
         * directo desde el grid, da su clase entera con la pizarra y las
         * preguntas, y sin esa fila no se registró nada. No da ningún error —
         * simplemente esa clase no existió, y eso no se puede reconstruir
         * después.
         *
         * Así que se abre SOLA, y no al entrar sino al primer acto de clase de
         * verdad: que se conecte un alumno, o que el profesor transmita una
         * posición. Abrirla con solo entrar dejaría una clase fantasma cada vez
         * que se asoma a preparar algo; con estos dos disparadores no hay que
         * acordarse de nada y tampoco se inventan clases que no pasaron.
         *
         * Que no se abran dos lo impide un índice único parcial de la base
         * (`class_sessions_una_abierta_por_profesor`), no la bandera de acá: dos
         * pestañas, o los dos disparadores a la vez, se saltan cualquier
         * comprobación previa. La bandera solo evita el pedido de más.
         */
        let abriendoClase = false;

        /* Cerrar la clase tiene que SIGNIFICAR cerrarla, y eso lo garantiza que
         * NADIE más que el profesor la pueda abrir.
         *
         * Antes el aviso de presencia la reabría: los alumnos no cierran su
         * pestaña en el mismo segundo en que el profesor confirma el cierre, así
         * que el aviso siguiente los encontraba conectados y abría una clase
         * NUEVA un minuto después de la que se acababa de cerrar. La franja
         * volvía sola a verde y el profesor —que ya terminó y se va— dejaba esa
         * fila abierta para siempre.
         *
         * Lo caro venía al día siguiente, y es lo que se ve como "la clase no
         * queda registrada": el índice `class_sessions_una_abierta_por_profesor`
         * impide una segunda fila abierta, así que la clase de mañana no abre
         * ninguna — se cuelga de la fantasma que quedó, con su fecha y su hora de
         * hace un día. Ningún error en ninguna parte.
         *
         * Ya no hay con qué reabrirla sin querer: las dos puertas que quedan son
         * deliberadas del profesor —mandar una posición, o el botón «Abrir la
         * clase»— y por eso tampoco hace falta acordarse de quién estaba
         * conectado al cerrar. */

        async function abrirClaseSiHaceFalta() {
            if (!isTeacher || currentOpenSessionId || abriendoClase) return;
            abriendoClase = true;
            const { data, error } = await sb.from("class_sessions")
                .insert({ created_by: profile.id }).select().maybeSingle();
            abriendoClase = false;
            if (error) {
                // 23505 es el índice único: alguien más (la otra pestaña, el otro
                // disparador) ya la abrió. No es un fallo — es justo lo que el
                // índice tiene que hacer. Se busca la que quedó.
                if (error.code === "23505") { await checkOpenClassSession(); return; }
                setStatus("No se pudo abrir la clase: " + error.message
                    + " — la asistencia de tus alumnos no se está registrando.");
                return;
            }
            if (data) currentOpenSessionId = data.id;
            pintarEstadoDeClase();
        }

        async function cerrarClaseDesdeAqui() {
            if (!isTeacher || !currentOpenSessionId) return;
            const btn = document.getElementById("clase-cerrar-btn");
            const campos = document.getElementById("clase-cerrar-campos");
            // El primer toque destapa el título y la nota; el segundo cierra. Así
            // no se cierra de un clic accidental en medio de la clase y, de paso,
            // se le pide lo único que hace falta para que el registro sirva.
            if (campos.classList.contains("hidden")) {
                campos.classList.remove("hidden");
                btn.textContent = "Confirmar y cerrar";
                document.getElementById("clase-titulo").focus();
                pintarResumenDeLaClase(currentOpenSessionId);
                refrescarSalida();
                // Lo que se marcó del plan ya dice qué se trabajó: se propone, no se pisa.
                const notasEl = document.getElementById("clase-notas");
                const dados = itemsDelPlan.filter((it) => planHecho.has(it.id)).map((it) => it.titulo);
                if (!notasEl.value.trim() && dados.length) notasEl.value = ("Del plan: " + dados.join("; ") + ".").slice(0, 500);
                return;
            }
            const titulo = document.getElementById("clase-titulo").value.trim();
            const notas = document.getElementById("clase-notas").value.trim();
            btn.disabled = true;
            const guardada = await guardarLaClaseAlCerrar(titulo);
            // Se pide de vuelta la fila para saber si el cierre PASÓ de verdad. Sin el
            // select, un update que no toca ninguna fila —el id quedó viejo porque la
            // cerraron desde el panel o desde otra pestaña— devuelve `error: null` y la
            // pantalla decía "cerrada" con el título y la nota tirados a la basura. Es la
            // falla callada de siempre, y acá se lleva justo lo que el registro necesita
            // para servir después.
            const { data, error } = await sb.from("class_sessions").update({
                ended_at: new Date().toISOString(),
                title: titulo || null,
                notes: notas || null,
                para_ausentes: document.getElementById("clase-para-ausentes").checked,
            }).eq("id", currentOpenSessionId).select();
            btn.disabled = false;
            if (error) { setStatus("No se pudo cerrar la clase: " + error.message); return; }
            if (!data || !data.length) {
                setStatus("Esta clase ya estaba cerrada, así que el nombre y la nota no se guardaron."
                    + " Puedes escribirlos en el registro de clases del panel.");
                currentOpenSessionId = null;
                pintarEstadoDeClase();
                return;
            }
            const cerrada = currentOpenSessionId;
            currentOpenSessionId = null;
            const paraAusentes = document.getElementById("clase-para-ausentes").checked;
            document.getElementById("clase-titulo").value = "";
            document.getElementById("clase-notas").value = "";
            document.getElementById("clase-para-ausentes").checked = false;
            pintarEstadoDeClase();
            setStatus("✅ Clase cerrada y guardada en el registro"
                + (titulo ? ' como "' + titulo + '"' : "") + "."
                + (guardada ? " La partida de la clase quedó para que tus alumnos la repasen"
                    + (paraAusentes ? ", también los que faltaron." : ".") : ""));
            // El paso siguiente de una clase es el repaso: la tarea ya viene con
            // los que asistieron marcados (tareas.html?clase=, solo el id).
            const despues = document.getElementById("clase-despues");
            const enlace = document.getElementById("clase-tarea-enlace");
            enlace.href = "tareas.html?clase=" + encodeURIComponent(cerrada);
            despues.hidden = false;
            planHecho = new Set();
            document.querySelectorAll("#plan-items button[aria-pressed]").forEach((b) => pintarBotonHecho(b, false));
            document.getElementById("salida-resultado").hidden = true;
            mostrarSalidaPasada();
        }

        /* Al cerrar, la partida de la clase se guarda sola —si tiene jugadas y
           no se guardó ya igual con «💾 Guardar PGN»—, ANTES de marcar la clase
           como cerrada: el trigger ligar_a_la_clase_abierta la cuelga de la
           clase que sigue abierta. Sin esto, repasar la clase dependía de que
           el profe se acordara del botón, y lo que no se guarda no se puede
           reconstruir después. Si falla, la clase se cierra igual: el registro
           y la asistencia importan más, y se dice. */
        async function guardarLaClaseAlCerrar(titulo) {
            const moves = board.moves();
            if (!moves.length || firmaDeLaClase() === firmaGuardada) return false;
            const hoy = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "long" }).format(new Date());
            const { error } = await sb.from("saved_games").insert({
                pgn: pgnDeLaClase(moves, false), fen_final: board.fen(), move_count: moves.length,
                title: titulo || "Clase del " + hoy, created_by: session.user.id,
                datos: datosDeLaClase(moves, false),
            });
            if (error) { console.error("No se pudo guardar la partida de la clase:", error); return false; }
            firmaGuardada = firmaDeLaClase();
            return true;
        }

        // Lo que contestó cada alumno en esta clase, antes de cerrarla.
        async function pintarResumenDeLaClase(claseId) {
            const caja = document.getElementById("clase-resumen");
            if (!caja || !claseId) return;
            caja.textContent = "Contando lo que hizo cada alumno en esta clase…";
            const { filas, error } = await ResumenClase.cargar(sb, claseId);
            if (error) { console.error(error); caja.textContent = "No se pudo contar lo que hizo cada alumno: " + error.message; return; }
            ResumenClase.pintar(caja, filas);
        }

        /* Lo que se ve tiene que decir la VERDAD sobre si se está registrando,
           con todas las letras y no solo con un color: un punto gris no le dice
           a un entrenador nuevo que la asistencia de sus alumnos se está
           perdiendo. */
        function pintarEstadoDeClase() {
            if (!isTeacher) return;
            const caja = document.getElementById("clase-estado");
            const texto = document.getElementById("clase-estado-texto");
            const abrir = document.getElementById("clase-abrir-btn");
            const cerrar = document.getElementById("clase-cerrar-btn");
            const campos = document.getElementById("clase-cerrar-campos");
            caja.classList.remove("hidden");

            if (currentOpenSessionId) {
                caja.className = "mb-6 rounded-xl px-5 py-3 flex items-center justify-between gap-3 flex-wrap bg-green-50 dark:bg-green-950/30";
                texto.className = "text-sm font-semibold text-green-700 dark:text-green-400";
                texto.textContent = "🔴 Clase en curso: se está registrando la asistencia y el tiempo de tus alumnos.";
                abrir.classList.add("hidden");
                cerrar.classList.remove("hidden");
                // Una clase nueva: el enlace a la tarea era de la anterior.
                document.getElementById("clase-despues").hidden = true;
            } else {
                caja.className = "mb-6 rounded-xl px-5 py-3 flex items-center justify-between gap-3 flex-wrap bg-brand-100 dark:bg-brand-900";
                texto.className = "text-sm font-semibold text-brand-600 dark:text-brand-300";
                /* Dice la CONSECUENCIA, no el mecanismo: mientras la clase no
                   esté abierta, sus alumnos no pueden entrar —lo hace cumplir la
                   RLS, no esta pantalla— y no se registra ni la asistencia ni el
                   tiempo. Un "todavía no hay clase abierta" a secas no le dice a
                   un entrenador nuevo que la clase que está por dar no la va a
                   ver nadie. */
                texto.textContent = "⚪ La clase todavía no está abierta: tus alumnos no pueden entrar"
                    + " y no se está registrando nada. Se abre con este botón o en cuanto mandes"
                    + " una posición al tablero.";
                abrir.classList.remove("hidden");
                cerrar.classList.add("hidden");
                campos.classList.add("hidden");
                cerrar.textContent = "Cerrar la clase";
            }
        }

        async function checkOpenClassSession() {
            const { data } = await sb.from("class_sessions").select("*").eq("created_by", boardOwnerId).is("ended_at", null).order("started_at", { ascending: false }).limit(1);
            const openSession = (data && data[0]) || null;
            currentOpenSessionId = openSession ? openSession.id : null;
            refrescarPlanHecho();
            cargarTurnos();
            mostrarSalidaPasada();
            if (openSession) {
                await markAttendance(openSession.id);
                await startPresenceLog(openSession.id);
            }
            pintarEstadoDeClase();
        }

        function conectarControlesDeClase() {
            if (!isTeacher) return;
            document.getElementById("clase-abrir-btn").addEventListener("click", abrirClaseSiHaceFalta);
            document.getElementById("clase-cerrar-btn").addEventListener("click", cerrarClaseDesdeAqui);
        }

        function subscribeClassSessions() {
            sb.channel("class_sessions-sesion:" + boardOwnerId)
                .on("postgres_changes", { event: "*", schema: "public", table: "class_sessions", filter: "created_by=eq." + boardOwnerId }, (payload) => {
                    if (payload.eventType === "INSERT" && !payload.new.ended_at) {
                        currentOpenSessionId = payload.new.id;
                        markAttendance(payload.new.id);
                        startPresenceLog(payload.new.id);
                        pintarEstadoDeClase();
                    } else if (payload.eventType === "UPDATE" && payload.new.ended_at && payload.new.id === currentOpenSessionId) {
                        // El profesor cerró la clase: registramos el último instante conectado
                        // y devolvemos al alumno al panel.
                        if (esObservador) {
                            window.location.href = observaDesde.volver;
                        } else if (!isTeacher) {
                            stopPresenceLog().finally(() => { window.location.href = "clases.html"; });
                        } else {
                            // La pudo cerrar desde el panel, o desde otra pestaña:
                            // la franja de acá tiene que decir la verdad igual.
                            currentOpenSessionId = null;
                            pintarEstadoDeClase();
                        }
                    }
                })
                .subscribe();
        }

        function initBoardForRole() {
            const container = document.getElementById("chessboard");
            board = new ClasesBoard(container, {
                interactive: isTeacher,
                allowArrows: isTeacher,
                externalCoords: true,
                onFreeModeChange: () => updateLiveFenDisplay(),
                onMove: () => {
                    pushBoardState();
                    // Con el control y un solo color, después de su jugada ya no le toca:
                    // sin esto podía mover también por el otro lado antes de que volviera el eco.
                    if (!isTeacher) updateAccessForRole();
                    if (claseAcc) claseAcc.actualizar();
                    updateTurnIndicator();
                    renderMoveList();
                    if (isTeacher) updateEngineEval();
                },
                onMarksChange: (marks) => pushMarksToServer(marks),
                onVariantMove: async (san, fullPath, context) => {
                    const fen = board.viewGame.fen();
                    // La clase ve la jugada de la variante ya, sin esperar a la base.
                    transmitirVista();
                    const { data, error } = await sb.from("variant_nodes").insert({
                        parent_id: context.parentNodeId, root_ply: context.rootPly, san, fen,
                        created_by: session.user.id, teacher_id: boardOwnerId,
                    }).select().single();
                    if (error) { console.error(error); setStatus("No se pudo guardar la variante: " + error.message); return; }
                    board.setVariantParent(data.id);
                    transmitirVista();
                    await loadVariantTree();
                },
            });
            claseAcc = window.ClaseAdaptada ? ClaseAdaptada.montar(document.getElementById("clase-cmd"), () => board, {
                etiqueta: isTeacher
                    ? "Escribe tu jugada o una pregunta sobre la posición"
                    : "Pregúntale a la posición, o escribe tu jugada cuando tu profe te dé el control",
                porQueNoPuedes: () => {
                    if (activePlayerId !== profile.id) return "Ahora mueve tu profe. Cuando te dé el control vas a oírlo, y ahí mismo escribes tu jugada acá. Mientras tanto puedes preguntar: \"posición\", \"caballos\" o \"qué hay en e4\".";
                    return "Todavía no le toca a tu color. Espera la jugada del otro lado.";
                },
            }) : null;
            if (isTeacher) {
                document.getElementById("arrows-hint").classList.remove("hidden");
                initMarksColorPicker();
            }
            const moveNav = document.getElementById("move-nav");
            moveNav.classList.toggle("hidden", !isTeacher);
            moveNav.classList.toggle("flex", isTeacher);
            document.getElementById("moves-panel").classList.toggle("hidden", !isTeacher);
            applyBoardViewPrefs();
        }

        // ---------- Preferencias de vista del tablero: girar y coordenadas ----------
        // Son personales del navegador (no se sincronizan): cada quien elige cómo mirar SU pantalla.
        const FLIP_KEY = "clasesBoardFlipped_v1";
        const COORDS_KEY = "clasesBoardCoords_v1";

        function applyBoardViewPrefs() {
            let flipped = false, coords = false;
            try { flipped = localStorage.getItem(FLIP_KEY) === "1"; } catch (e) {}
            try { coords = localStorage.getItem(COORDS_KEY) === "1"; } catch (e) {}
            board.setFlipped(flipped);
            board.setShowCoords(coords);
            document.getElementById("show-coords-btn").setAttribute("aria-pressed", coords ? "true" : "false");
            document.getElementById("show-coords-btn").classList.toggle("bg-accent-500", coords);
            document.getElementById("show-coords-btn").classList.toggle("text-brand-900", coords);
        }

        document.getElementById("flip-board-btn").addEventListener("click", () => {
            const flipped = !board.flipped;
            try { localStorage.setItem(FLIP_KEY, flipped ? "1" : "0"); } catch (e) {}
            board.setFlipped(flipped);
        });

        document.getElementById("show-coords-btn").addEventListener("click", () => {
            const coords = !board.showCoords;
            try { localStorage.setItem(COORDS_KEY, coords ? "1" : "0"); } catch (e) {}
            board.setShowCoords(coords);
            document.getElementById("show-coords-btn").setAttribute("aria-pressed", coords ? "true" : "false");
            document.getElementById("show-coords-btn").classList.toggle("bg-accent-500", coords);
            document.getElementById("show-coords-btn").classList.toggle("text-brand-900", coords);
        });

        // ---------- Color de las flechas y círculos de pizarra ----------
        // También personal del navegador, como girar y coordenadas: no es de la clase, es de
        // con qué color prefiere dibujar ESTE profesor. Los botones se arman leyendo
        // ClasesBoard.MARK_COLORS (js/clases-board.js), no una lista copiada acá: los cinco
        // hex viven en un solo lugar.
        const MARK_COLOR_KEY = "clasesBoardMarkColor_v1";
        const MARK_COLOR_LABELS = { naranja: "Naranja", azul: "Azul", verde: "Verde", rojo: "Rojo", negro: "Negro" };

        function initMarksColorPicker() {
            const wrap = document.getElementById("marks-color-picker");
            let current = ClasesBoard.DEFAULT_MARK_COLOR;
            try {
                const saved = localStorage.getItem(MARK_COLOR_KEY);
                if (saved && ClasesBoard.MARK_COLORS[saved]) current = saved;
            } catch (e) {}
            board.setMarkColor(current);

            function pintarSeleccion(key) {
                wrap.querySelectorAll("button").forEach((b) => {
                    const elegido = b.dataset.colorKey === key;
                    b.setAttribute("aria-pressed", elegido ? "true" : "false");
                    b.classList.toggle("border-brand-800", elegido);
                    b.classList.toggle("dark:border-white", elegido);
                    b.classList.toggle("scale-110", elegido);
                    b.classList.toggle("border-transparent", !elegido);
                });
            }

            Object.keys(ClasesBoard.MARK_COLORS).forEach((key) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.dataset.colorKey = key;
                btn.title = "Dibujar en " + MARK_COLOR_LABELS[key];
                btn.setAttribute("aria-label", MARK_COLOR_LABELS[key]);
                btn.className = "w-6 h-6 rounded-full border-2 transition-transform";
                btn.style.backgroundColor = ClasesBoard.MARK_COLORS[key];
                btn.addEventListener("click", () => {
                    board.setMarkColor(key);
                    try { localStorage.setItem(MARK_COLOR_KEY, key); } catch (e) {}
                    pintarSeleccion(key);
                });
                wrap.appendChild(btn);
            });
            pintarSeleccion(current);
            wrap.classList.remove("hidden");
            wrap.classList.add("flex");
        }

        // ---------- Navegar entre jugadas (solo profesor) ----------
        function currentViewedPly() {
            return board.isViewingHistory() ? board.viewPath.length : board.moves().length;
        }

        function stepToPly(ply) {
            const total = board.moves().length;
            board.viewMainAt(Math.max(0, Math.min(ply, total)));
            renderMoveList();
            transmitirVista();
        }

        /* ◀ y ▶ dentro de una variante se quedan en ELLA: ◀ vuelve a la jugada
           anterior de la variante (y de la primera, a la línea principal de donde
           nace) y ▶ sigue por su continuación. Antes ◀ saltaba siempre a la línea
           principal, y para retomar la variante había que buscarla en la lista. */
        function nodoQueSeVe() {
            const ctx = board.isViewingHistory() ? board.getVariantContext() : null;
            if (!ctx || ctx.parentNodeId === null) return null;
            return variantNodes.find((v) => v.id === ctx.parentNodeId) || null;
        }

        function stepBack() {
            const nodo = nodoQueSeVe();
            if (!nodo) { stepToPly(currentViewedPly() - 1); return; }
            const path = board.viewPath.slice(0, -1);
            const padre = nodo.parent_id !== null ? variantNodes.find((v) => v.id === nodo.parent_id) : null;
            if (padre) board.viewVariantNode(padre, path);
            else board.viewMainAt(nodo.root_ply);
            renderMoveList();
            transmitirVista();
        }

        function stepForward() {
            if (!board.isViewingHistory()) return;
            const ctx = board.getVariantContext();
            if (!ctx || ctx.parentNodeId === null) { stepToPly(currentViewedPly() + 1); return; }
            const hijo = variantChildrenOf(ctx.parentNodeId)[0];
            if (!hijo) return;
            board.viewVariantNode(hijo, board.viewPath.concat([hijo.san]));
            renderMoveList();
            transmitirVista();
        }

        document.getElementById("move-nav-first").addEventListener("click", () => stepToPly(0));
        document.getElementById("move-nav-prev").addEventListener("click", stepBack);
        document.getElementById("move-nav-next").addEventListener("click", stepForward);
        document.getElementById("move-nav-last").addEventListener("click", () => stepToPly(board.moves().length));

        // ---------- Ocultar piezas a los alumnos (solo profesor) ----------
        function updateHideBoardBtn() {
            if (!isTeacher) return;
            const btn = document.getElementById("toggle-hide-btn");
            const hidden = !!lastPiecesHidden;
            btn.textContent = hidden ? "👁️ Mostrar" : "🙈 Ocultar";
            btn.title = hidden ? "Mostrar piezas a los alumnos" : "Ocultar piezas a los alumnos";
        }
        let lastPiecesHidden = false;

        document.getElementById("toggle-hide-btn").addEventListener("click", async () => {
            lastPiecesHidden = !lastPiecesHidden;
            updateHideBoardBtn();
            const { error } = await sb.from("game_state").update({ pieces_hidden: lastPiecesHidden }).eq("id", myGameStateId);
            if (error) { console.error(error); setStatus("No se pudo cambiar la visibilidad de las piezas: " + error.message); }
        });

        // ---------- Editor visual del tablero: paleta de piezas, vaciar/posición inicial,
        // turno y enroques, o FEN/PGN (solo profesor) ----------
        // Sin color acá a propósito: lo pone renderEditToolButtons() según data-color de
        // cada botón (piece-white/piece-black, ver el comentario del HTML de la paleta) —
        // con un color fijo para las dos filas, la de negras se llenaba en modo oscuro con
        // el mismo claro que blancas y un rey negro macizo terminaba viéndose más blanco
        // que el hueco de al lado.
        const EDIT_PIECE_INACTIVE = "edit-piece-btn w-9 h-9 flex items-center justify-center text-2xl rounded-lg border transition-colors bg-white dark:bg-brand-800 border-brand-200 dark:border-brand-700 hover:border-accent-500";
        const EDIT_PIECE_ACTIVE = "edit-piece-btn w-9 h-9 flex items-center justify-center text-2xl rounded-lg border-2 border-accent-500 bg-accent-500/20 transition-colors";
        const EDIT_TRASH_INACTIVE = "w-9 h-9 flex items-center justify-center text-lg rounded-lg border transition-colors bg-white dark:bg-brand-800 border-brand-200 dark:border-brand-700 hover:border-red-400";
        const EDIT_TRASH_ACTIVE = "w-9 h-9 flex items-center justify-center text-lg rounded-lg border-2 border-red-500 bg-red-500/20 transition-colors";
        const EDIT_TURN_ACTIVE = "edit-turn-btn text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-accent-500 text-brand-900";
        const EDIT_TURN_INACTIVE = "edit-turn-btn text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200";

        let editTool = null; // null, {color,type} o "trash" — refleja board._freeModeTool
        let editTurn = "w";

        function renderEditToolButtons() {
            document.querySelectorAll(".edit-piece-btn").forEach((btn) => {
                const isActive = editTool && editTool !== "trash" && editTool.color === btn.dataset.color && editTool.type === btn.dataset.type;
                const base = isActive ? EDIT_PIECE_ACTIVE : EDIT_PIECE_INACTIVE;
                btn.className = base + (btn.dataset.color === "w" ? " piece-white" : " piece-black");
            });
            const trashBtn = document.getElementById("edit-trash-btn");
            trashBtn.className = editTool === "trash" ? EDIT_TRASH_ACTIVE : EDIT_TRASH_INACTIVE;
        }

        function setEditTool(tool) {
            const isSame = tool === "trash" ? editTool === "trash" : (editTool && editTool !== "trash" && tool && editTool.color === tool.color && editTool.type === tool.type);
            editTool = isSame ? null : tool;
            board.setFreeModeTool(editTool);
            renderEditToolButtons();
        }

        document.querySelectorAll(".edit-piece-btn").forEach((btn) => {
            btn.addEventListener("click", () => setEditTool({ color: btn.dataset.color, type: btn.dataset.type }));
        });
        document.getElementById("edit-trash-btn").addEventListener("click", () => setEditTool("trash"));

        function setEditTurn(turn) {
            editTurn = turn;
            document.getElementById("edit-turn-w").className = turn === "w" ? EDIT_TURN_ACTIVE : EDIT_TURN_INACTIVE;
            document.getElementById("edit-turn-b").className = turn === "b" ? EDIT_TURN_ACTIVE : EDIT_TURN_INACTIVE;
            updateLiveFenDisplay();
        }
        document.getElementById("edit-turn-w").addEventListener("click", () => setEditTurn("w"));
        document.getElementById("edit-turn-b").addEventListener("click", () => setEditTurn("b"));
        ["edit-castle-wk", "edit-castle-wq", "edit-castle-bk", "edit-castle-bq"].forEach((id) => {
            document.getElementById(id).addEventListener("change", updateLiveFenDisplay);
        });

        document.getElementById("edit-clear-btn").addEventListener("click", () => {
            board.clearBoard();
            setEditTool(null);
        });
        document.getElementById("edit-initial-btn").addEventListener("click", () => {
            board.setInitialPosition();
            setEditTool(null);
            syncEditPanelFromPosition();
        });

        // Lee la posición actual del tablero (mientras se edita) y ajusta el selector de
        // turno y las casillas de enroque para que reflejen lo que ya hay, en vez de
        // arrancar siempre en "blancas, todos los enroques".
        function syncEditPanelFromPosition() {
            const parts = board.fen().split(" ");
            setEditTurn(parts[1] === "b" ? "b" : "w");
            const castling = parts[2] || "-";
            document.getElementById("edit-castle-wk").checked = castling.includes("K");
            document.getElementById("edit-castle-wq").checked = castling.includes("Q");
            document.getElementById("edit-castle-bk").checked = castling.includes("k");
            document.getElementById("edit-castle-bq").checked = castling.includes("q");
            updateLiveFenDisplay();
        }

        // Arma el FEN candidato (posición actual del tablero + turno/enroques ya elegidos
        // en el panel, igual que hace free-mode-apply-btn) y lo muestra en el campo de solo
        // lectura — así el profesor ve hacia dónde va la posición mientras la arma, sin
        // esperar a aplicarla. No valida nada (esa validación solo corre al aplicar).
        function updateLiveFenDisplay() {
            const field = document.getElementById("edit-current-fen");
            if (!field) return;
            const parts = board.fen().split(" ");
            parts[1] = editTurn;
            let castling = "";
            if (document.getElementById("edit-castle-wk").checked) castling += "K";
            if (document.getElementById("edit-castle-wq").checked) castling += "Q";
            if (document.getElementById("edit-castle-bk").checked) castling += "k";
            if (document.getElementById("edit-castle-bq").checked) castling += "q";
            parts[2] = castling || "-";
            parts[3] = "-";
            field.value = parts[0] + " " + parts[1] + " " + parts[2] + " " + parts[3] + " 0 1";
        }

        document.getElementById("edit-current-fen-copy-btn").addEventListener("click", async () => {
            const field = document.getElementById("edit-current-fen");
            const btn = document.getElementById("edit-current-fen-copy-btn");
            try {
                await navigator.clipboard.writeText(field.value);
            } catch (e) {
                field.select();
                document.execCommand("copy");
            }
            const original = btn.textContent;
            btn.textContent = "✅ Copiado";
            setTimeout(() => { btn.textContent = original; }, 1500);
        });

        // ---------- Panel flotante del editor de tablero: arrastrable desde el título ----------
        // Es una herramienta temporal (se abre, se usa un momento, se cierra), así que flota por
        // encima de la página en vez de empujar el tablero hacia abajo, y se puede arrastrar a un
        // lado si tapa algo que el profesor necesita ver.
        function resetBoardEditPanelPosition() {
            const panel = document.getElementById("board-edit-panel");
            panel.style.top = "88px";
            panel.style.right = "16px";
            panel.style.left = "auto";
        }
        (function setupBoardEditDrag() {
            const panel = document.getElementById("board-edit-panel");
            const handle = document.getElementById("board-edit-header");
            let dragging = false, offsetX = 0, offsetY = 0;
            function clamp(x, y) {
                const maxX = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
                const maxY = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
                return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) };
            }
            function start(e) {
                dragging = true;
                const rect = panel.getBoundingClientRect();
                const p = e.touches ? e.touches[0] : e;
                offsetX = p.clientX - rect.left;
                offsetY = p.clientY - rect.top;
                e.preventDefault();
            }
            function move(e) {
                if (!dragging) return;
                const p = e.touches ? e.touches[0] : e;
                const { x, y } = clamp(p.clientX - offsetX, p.clientY - offsetY);
                panel.style.left = x + "px";
                panel.style.top = y + "px";
                panel.style.right = "auto";
                e.preventDefault();
            }
            function stop() { dragging = false; }
            handle.addEventListener("mousedown", start);
            handle.addEventListener("touchstart", start, { passive: false });
            window.addEventListener("mousemove", move);
            window.addEventListener("touchmove", move, { passive: false });
            window.addEventListener("mouseup", stop);
            window.addEventListener("touchend", stop);
        })();

        document.getElementById("toggle-free-mode-btn").addEventListener("click", () => {
            const active = !board.freeMode;
            // Salir con este mismo botón es descartar la edición, igual que
            // «Cancelar»: mientras se editaba, los cambios que llegaban de la
            // base se ignoraban, así que sin volver a leerla el tablero se
            // quedaría con la posición armada a mano — y la próxima jugada la
            // transmitiría sin pasar por la validación de «Aplicar».
            if (!active) { document.getElementById("free-mode-cancel-btn").click(); return; }
            board.setFreeMode(active);
            setEditTool(null);
            if (active) resetBoardEditPanelPosition();
            document.getElementById("board-edit-panel").classList.toggle("hidden", !active);
            if (active) {
                document.getElementById("lesson-picker-panel").classList.add("hidden"); // no los dos a la vez
                document.getElementById("pdf-panel").classList.add("hidden");
                document.getElementById("archivos-panel").classList.add("hidden");
            }
            document.getElementById("free-mode-load-msg").textContent = "";
            const freeModeBtn = document.getElementById("toggle-free-mode-btn");
            freeModeBtn.textContent = active ? "🔒 Editando…" : "✏️ Editar";
            freeModeBtn.title = active ? "Editando posición…" : "Editar el tablero (mover piezas libremente o cargar FEN/PGN)";
            if (active) syncEditPanelFromPosition();
            setStatus(active
                ? "Editando el tablero: toca una pieza de la paleta y luego el tablero para colocarla, o carga una posición por FEN o PGN. Los alumnos siguen viendo la posición anterior hasta que apliques los cambios."
                : "");
        });

        document.getElementById("board-edit-close-btn").addEventListener("click", () => {
            document.getElementById("free-mode-cancel-btn").click();
        });

        document.getElementById("free-mode-fen-load-btn").addEventListener("click", () => {
            const input = document.getElementById("free-mode-fen-input");
            const msg = document.getElementById("free-mode-load-msg");
            const ok = board.loadFreeModeFen(input.value);
            msg.textContent = ok ? "" : "Ese FEN no es válido — revísalo e intenta de nuevo.";
            if (ok) { input.value = ""; syncEditPanelFromPosition(); }
        });

        document.getElementById("free-mode-pgn-load-btn").addEventListener("click", () => {
            const input = document.getElementById("free-mode-pgn-input");
            const msg = document.getElementById("free-mode-load-msg");
            const ok = board.loadFreeModePgn(input.value);
            msg.textContent = ok ? "" : "Ese PGN no se pudo interpretar — revísalo e intenta de nuevo.";
            if (ok) { input.value = ""; syncEditPanelFromPosition(); }
        });

        document.getElementById("free-mode-apply-btn").addEventListener("click", async () => {
            // El turno y los enroques se eligen aparte (paleta/checkboxes), así que se
            // reescriben esos dos campos del FEN antes de validar y aplicar la posición.
            const parts = board.fen().split(" ");
            parts[1] = editTurn;
            let castling = "";
            if (document.getElementById("edit-castle-wk").checked) castling += "K";
            if (document.getElementById("edit-castle-wq").checked) castling += "Q";
            if (document.getElementById("edit-castle-bk").checked) castling += "k";
            if (document.getElementById("edit-castle-bq").checked) castling += "q";
            parts[2] = castling || "-";
            parts[3] = "-"; // sin al paso: no tiene sentido conservarlo en una posición armada a mano
            const candidateFen = parts[0] + " " + parts[1] + " " + parts[2] + " " + parts[3] + " 0 1";
            const msg = document.getElementById("free-mode-load-msg");
            // Las tres posiciones imposibles que chess.js carga igual, sin avisar, y que aquí
            // son fáciles de armar sin querer con la paleta — sin rey, con peones coronados
            // en la última fila, o con el rey que no le toca mover en jaque: se responden en
            // el propio panel del editor, que es donde está mirando quien las armó.
            const motivo = motivoPosicionInvalida(candidateFen);
            if (motivo) { msg.textContent = motivo; return; }
            if (!board.loadFreeModeFen(candidateFen)) {
                msg.textContent = "Esa posición no es válida (revisa que haya un solo rey de cada color, por ejemplo).";
                return;
            }
            msg.textContent = "";
            const finalFen = board.fen();
            board.setFreeMode(false);
            setEditTool(null);
            document.getElementById("board-edit-panel").classList.add("hidden");
            document.getElementById("toggle-free-mode-btn").textContent = "✏️ Editar";
            document.getElementById("toggle-free-mode-btn").title = "Editar el tablero (mover piezas libremente o cargar FEN/PGN)";
            await aplicarPosicionEnClase(finalFen, "Posición aplicada: ya se transmitió a todos los alumnos.");
        });

        document.getElementById("free-mode-cancel-btn").addEventListener("click", async () => {
            board.setFreeMode(false);
            setEditTool(null);
            document.getElementById("board-edit-panel").classList.add("hidden");
            document.getElementById("free-mode-load-msg").textContent = "";
            document.getElementById("toggle-free-mode-btn").textContent = "✏️ Editar";
            document.getElementById("toggle-free-mode-btn").title = "Editar el tablero (mover piezas libremente o cargar FEN/PGN)";
            await loadGameState();
            setStatus("Edición descartada: se restauró la posición real de la clase.");
        });

        document.getElementById("undo-move-btn").addEventListener("click", async () => {
            if (!canMoveNow() || board.isViewingHistory()) return;
            const undone = board.undo();
            if (!undone) return;
            await pushBoardState();
            updateTurnIndicator();
            renderMoveList();
            if (isTeacher) updateEngineEval();
        });

        // ---------- Presencia: quién está conectado ahora mismo, y quién pide la palabra ----------
        const onlineStudents = new Map(); // id -> {email, full_name, hand_raised}

        function renderStudentsList() {
            if (!isTeacher) return;
            // Quien se conecta con una pregunta abierta también tiene su tablero.
            pintarTablerosDePregunta();
            const listEl = document.getElementById("students-list");
            const badge = document.getElementById("hand-raised-badge");
            const entries = Array.from(onlineStudents.entries());
            if (badge) badge.classList.toggle("hidden", !entries.some(([, info]) => info.hand_raised));
            if (entries.length === 0) {
                listEl.innerHTML = '<li class="text-brand-450 dark:text-brand-350">Nadie conectado todavía…</li>';
                return;
            }
            /* Quienes piden la palabra aparecen primero y EN EL ORDEN en que la
               pidieron (hand_at): así el profe se la da al que esperó más, no al
               primero que vio. Los demás, después. */
            const llegada = (info) => (info.hand_at ? new Date(info.hand_at).getTime() : Infinity);
            entries.sort((a, b) => (b[1].hand_raised ? 1 : 0) - (a[1].hand_raised ? 1 : 0) || llegada(a[1]) - llegada(b[1]));
            let turnoEnCola = 0;
            listEl.innerHTML = "";
            for (const [studentId, info] of entries) {
                const hasControl = activePlayerId === studentId;
                const li = document.createElement("li");
                li.className = "flex items-center justify-between gap-2 flex-wrap" + (info.hand_raised ? " bg-accent-500/10 rounded-lg px-2 py-1 -mx-2" : "");
                const label = document.createElement("span");
                label.className = "flex items-center gap-2 text-brand-700 dark:text-brand-200 truncate";
                const dot = document.createElement("span");
                dot.className = "w-2 h-2 rounded-full bg-green-500 shrink-0";
                dot.title = "En vivo";
                label.appendChild(dot);
                if (info.hand_raised) {
                    turnoEnCola += 1;
                    const handIcon = document.createElement("span");
                    handIcon.className = "shrink-0 font-semibold text-brand-800 dark:text-white";
                    // El puesto en la cola va escrito, no solo el orden de la lista.
                    handIcon.textContent = "🖐️ " + turnoEnCola + ".º";
                    handIcon.title = "Pidiendo la palabra: " + turnoEnCola + ".º en la cola";
                    label.appendChild(handIcon);
                }
                const name = document.createElement("span");
                name.className = "truncate";
                // Nunca innerHTML aquí: full_name/email vienen de datos que el propio usuario
                // controla (presence.track), textContent los trata siempre como texto plano.
                name.textContent = info.full_name || info.email;
                label.appendChild(name);
                const actions = document.createElement("span");
                actions.className = "flex flex-wrap items-center gap-1";
                if (info.hand_raised) {
                    const palabraBtn = document.createElement("button");
                    palabraBtn.type = "button";
                    palabraBtn.className = "text-xs font-semibold px-2 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                    palabraBtn.textContent = "🗣️ Darle la palabra";
                    palabraBtn.setAttribute("aria-label", "Darle la palabra a " + (info.full_name || info.email));
                    palabraBtn.addEventListener("click", () => darLaPalabra(studentId));
                    actions.appendChild(palabraBtn);
                    const lowerBtn = document.createElement("button");
                    lowerBtn.type = "button";
                    lowerBtn.className = "text-xs font-semibold px-2 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors";
                    lowerBtn.textContent = "✋ Bajar";
                    lowerBtn.title = "Bajarle la mano a este alumno";
                    lowerBtn.addEventListener("click", () => lowerStudentHand(studentId));
                    actions.appendChild(lowerBtn);
                }
                // La bitácora de ESTE alumno, sin salir de la clase.
                const notasBtn = document.createElement("button");
                notasBtn.type = "button";
                notasBtn.className = "shrink-0 text-xs font-semibold px-2 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                notasBtn.textContent = "📝";
                notasBtn.title = "Anotar algo de este alumno (solo lo ves tú)";
                notasBtn.setAttribute("aria-label", "Bitácora de " + (info.full_name || info.email));
                notasBtn.addEventListener("click", () => abrirNotasEnClase(studentId, info.full_name || info.email));
                actions.appendChild(notasBtn);
                // Sus trofeos: sumar por un buen trabajo o quitar uno contado de más.
                const trofeosBtn = document.createElement("button");
                trofeosBtn.type = "button";
                trofeosBtn.className = notasBtn.className;
                trofeosBtn.textContent = "🏆";
                trofeosBtn.title = "Trofeos e insignias: sumar, quitar o darle una insignia";
                trofeosBtn.setAttribute("aria-label", "Trofeos e insignias de " + (info.full_name || info.email));
                trofeosBtn.addEventListener("click", () => abrirTrofeosEnClase(studentId, info.full_name || info.email));
                actions.appendChild(trofeosBtn);

                // Con qué color puede mover: se elige ANTES de dar el control (para dárselo
                // ya con el color correcto) y también se puede cambiar mientras ya lo tiene
                // (por ejemplo, para pasar de "solo blancas" a "ambos colores" a mitad de la
                // demostración), sin tener que quitarle y volver a darle el control.
                const colorSelect = document.createElement("select");
                colorSelect.className = "shrink-0 text-xs bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-1 py-1.5 text-brand-700 dark:text-brand-200 focus:outline-none focus:ring-2 focus:ring-accent-500";
                colorSelect.title = "Con qué color puede mover este alumno";
                colorSelect.innerHTML =
                    '<option value="both">♟️ Ambos colores</option>' +
                    '<option value="w">⚪ Solo blancas</option>' +
                    '<option value="b">⚫ Solo negras</option>';
                colorSelect.value = hasControl ? activePlayerColor : "both";
                colorSelect.addEventListener("change", () => {
                    if (hasControl) setActivePlayer(studentId, colorSelect.value);
                });
                actions.appendChild(colorSelect);

                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = hasControl
                    ? "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors"
                    : "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors";
                btn.textContent = hasControl ? "Quitar control" : "Dar control";
                btn.addEventListener("click", () => setActivePlayer(hasControl ? null : studentId, colorSelect.value));
                actions.appendChild(btn);
                li.appendChild(label);
                li.appendChild(actions);
                listEl.appendChild(li);
            }
        }

        /* ---------- El plan de clase ----------

           Lo que el profesor preparó en planes.html, aquí al lado del tablero.
           Ningún renglón hace nada nuevo: cada uno entra por la puerta que esta
           página ya tenía —`aplicarPosicionEnClase()` para las posiciones y
           `abrirLeccionLocal()` para las lecciones—, que es lo que garantiza que
           una posición del plan y una del editor dejen la clase exactamente
           igual. Si cada botón armara su propio `update`, el que se olvidara de
           limpiar las variantes dejaría un resto de la posición anterior, y eso
           no da ningún error.

           Las NOTAS del plan no se transmiten: son su chuleta, como el PDF. */
        let planesDelProfesor = [];
        let itemsDelPlan = [];

        async function cargarPlanesEnClase() {
            if (!isTeacher) return;
            const select = document.getElementById("plan-select");
            /* Los propios y los que le comparten sus colegas. Van en la MISMA
               lista porque a la hora de dar la clase los dos se dan igual —
               lo que cambia es quién los puede editar, y eso es en el armador.
               Se piden por separado: un plan compartido no sale del `select`
               por profesor_id, y su autor no se puede leer de `profiles`. */
            let compartidos = [];
            try {
                planesDelProfesor = await PlanClase.listarPlanes(sb, session.user.id);
            } catch (e) {
                document.getElementById("plan-msg").textContent = "No se pudieron cargar tus planes: " + e.message;
                return;
            }
            try {
                compartidos = await PlanClase.planesCompartidosConmigo(sb);
            } catch (e) {
                // Que no lleguen los compartidos no puede dejar sin plan a quien
                // sí tiene los suyos, en medio de la clase.
                compartidos = [];
                document.getElementById("plan-msg").textContent = "No se pudieron cargar los planes compartidos: " + e.message;
            }
            planesDelProfesor = planesDelProfesor.concat(compartidos);

            select.innerHTML = "";
            const vacio = document.createElement("option");
            vacio.value = "";
            vacio.textContent = planesDelProfesor.length ? "— Elige un plan —" : "Todavía no has armado ninguno";
            select.appendChild(vacio);
            const grupo = (nombre, lista) => {
                if (!lista.length) return;
                const g = document.createElement("optgroup");
                g.label = nombre;
                lista.forEach((pl) => {
                    const o = document.createElement("option");
                    o.value = pl.id;
                    o.textContent = PlanClase.tituloVisible(pl.titulo) + (pl.autor ? " · " + pl.autor : "");
                    g.appendChild(o);
                });
                select.appendChild(g);
            };
            grupo("Tus planes", planesDelProfesor.filter((pl) => pl.profesor_id === session.user.id));
            grupo("Compartidos contigo", compartidos);
            /* Cuál estaba dando se recuerda en ESTE aparato, como el tema o la
               clase elegida: si se recarga la página en medio de la clase —que
               pasa— no hay que volver a buscarlo en la lista. */
            const recordado = localStorage.getItem("plan_en_clase");
            if (recordado && planesDelProfesor.some((pl) => pl.id === recordado)) {
                select.value = recordado;
                await abrirPlanEnClase(recordado);
            }
        }

        async function abrirPlanEnClase(planId) {
            const lista = document.getElementById("plan-items");
            const notasEl = document.getElementById("plan-notas");
            const msg = document.getElementById("plan-msg");
            lista.innerHTML = "";
            notasEl.classList.add("hidden");
            msg.textContent = "";
            itemsDelPlan = [];
            if (!planId) { localStorage.removeItem("plan_en_clase"); return; }
            localStorage.setItem("plan_en_clase", planId);

            const plan = planesDelProfesor.find((pl) => pl.id === planId);
            if (plan && plan.notas) {
                notasEl.textContent = plan.notas;
                notasEl.classList.remove("hidden");
            }
            try {
                itemsDelPlan = await PlanClase.itemsDe(sb, planId);
            } catch (e) {
                msg.textContent = "No se pudieron cargar los renglones: " + e.message;
                return;
            }
            if (!itemsDelPlan.length) {
                msg.textContent = "Este plan todavía está vacío.";
                return;
            }
            await cargarPlanHecho();
            // Lo que hay que repasar de la clase pasada va primero (sort estable: el resto en su orden).
            itemsDelPlan.slice().sort((a, b) => repaso.ids.has(b.id) - repaso.ids.has(a.id))
                .forEach((it) => lista.appendChild(pintarRenglonDelPlan(it)));
        }

        /* Lo que ya se dio del plan en ESTA clase (clase_plan_hecho). Es de la
           clase y no del plan: el mismo plan se da en varias clases. */
        let planHecho = new Set();
        async function cargarPlanHecho() {
            planHecho = new Set();
            if (!currentOpenSessionId) return;
            const { data, error } = await sb.from("clase_plan_hecho").select("plan_item_id").eq("class_session_id", currentOpenSessionId);
            if (error) { console.error(error); return; }
            (data || []).forEach((f) => planHecho.add(f.plan_item_id));
        }

        async function marcarPlanHecho(item, btn) {
            if (!currentOpenSessionId) { setStatus("Abre la clase primero: lo que se da del plan queda en su registro."); return; }
            const hecho = planHecho.has(item.id);
            btn.disabled = true;
            const q = hecho
                ? sb.from("clase_plan_hecho").delete().eq("class_session_id", currentOpenSessionId).eq("plan_item_id", item.id)
                : sb.from("clase_plan_hecho").insert({ class_session_id: currentOpenSessionId, plan_item_id: item.id });
            const { error } = await q;
            btn.disabled = false;
            if (error) { console.error(error); setStatus("No se pudo marcar: " + error.message); return; }
            if (hecho) planHecho.delete(item.id); else planHecho.add(item.id);
            pintarBotonHecho(btn, !hecho);
        }

        function pintarBotonHecho(btn, hecho) {
            btn.setAttribute("aria-pressed", hecho ? "true" : "false");
            btn.textContent = hecho ? "✅ Dado en esta clase" : "☐ Ya lo di";
            btn.classList.toggle("bg-green-100", hecho);
            btn.classList.toggle("dark:bg-green-900", hecho);
            btn.classList.toggle("text-green-800", hecho);
            btn.classList.toggle("dark:text-green-200", hecho);
        }

        /* La clase se puede abrir (o saberse abierta, al recargar) DESPUÉS de
           pintar el plan: entonces se vuelve a leer lo marcado y se repintan
           los botones, o quedarían todos en «Ya lo di» sin serlo. */
        async function refrescarPlanHecho() {
            if (!isTeacher || !itemsDelPlan.length) return;
            await cargarPlanHecho();
            document.querySelectorAll("#plan-items li[data-plan-item]").forEach((li) => {
                const b = li.querySelector("button[aria-pressed]");
                if (b) pintarBotonHecho(b, planHecho.has(li.dataset.planItem));
            });
        }

        function pintarRenglonDelPlan(item) {
            const li = document.createElement("li");
            li.dataset.planItem = item.id;
            li.className = "bg-brand-50 dark:bg-brand-950 rounded-lg px-3 py-2";

            const titulo = document.createElement("p");
            titulo.className = "font-semibold text-brand-700 dark:text-brand-200 break-words";
            titulo.textContent = PlanClase.resumen(item);
            li.appendChild(titulo);

            if (repaso.ids.has(item.id)) {
                const r = document.createElement("p");
                r.className = "plan-repasar text-xs font-semibold text-accent-700 dark:text-accent-400 mt-0.5";
                r.textContent = "🔁 Para repasar: la pregunta de salida de la clase pasada dijo que no quedó.";
                li.appendChild(r);
            }

            const detalle = item.pregunta || item.nota;
            if (detalle) {
                const d = document.createElement("p");
                d.className = "text-xs text-brand-500 dark:text-brand-300 mt-0.5 break-words whitespace-pre-wrap";
                d.textContent = detalle;
                li.appendChild(d);
            }

            const acciones = document.createElement("div");
            acciones.className = "flex items-center gap-1.5 flex-wrap mt-1.5";
            const clases = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

            if (item.tipo === "posicion") {
                const alTablero = document.createElement("button");
                alTablero.type = "button";
                alTablero.className = clases;
                alTablero.textContent = "📥 Al tablero";
                alTablero.title = "Transmitir esta posición a toda la clase";
                alTablero.addEventListener("click", async () => {
                    await aplicarPosicionEnClase(item.fen, "Posición del plan enviada: ya la ven todos los alumnos.");
                });
                acciones.appendChild(alTablero);

                if (item.pregunta) {
                    const preguntar = document.createElement("button");
                    preguntar.type = "button";
                    preguntar.className = clases;
                    preguntar.textContent = "❓ Preguntar";
                    preguntar.title = "Abrir la pregunta con esta posición (el enunciado se lo dices tú)";
                    preguntar.addEventListener("click", () => preguntarDelPlan(item));
                    acciones.appendChild(preguntar);
                }
            } else if (item.tipo === "leccion") {
                const abrir = document.createElement("button");
                abrir.type = "button";
                abrir.className = clases;
                abrir.textContent = "📖 Abrir la lección";
                abrir.title = "Abrirla solo en tu pantalla, como el PDF";
                abrir.addEventListener("click", () => abrirLeccionLocal(item.curso, item.leccion));
                acciones.appendChild(abrir);
            }

            const hechoBtn = document.createElement("button");
            hechoBtn.type = "button";
            hechoBtn.className = clases + " ml-auto";
            hechoBtn.title = "Queda en el registro de esta clase, y en la nota del cierre";
            hechoBtn.addEventListener("click", () => marcarPlanHecho(item, hechoBtn));
            acciones.appendChild(hechoBtn);
            li.appendChild(acciones);
            pintarBotonHecho(hechoBtn, planHecho.has(item.id));
            return li;
        }

        /* Mismo mecanismo que Táctica y que los archivos PGN: se aplica la
           posición y se abre una pregunta sobre ella.

           `expected_plies` va en 1 y no sale del plan a propósito: el caso de
           todos los días es "¿cuál es la jugada?", y un campo más que llenar al
           armar el plan se queda sin llenar. Si hace falta otra cantidad, el
           panel de Preguntar la cambia como siempre. */
        async function preguntarDelPlan(item) {
            if (!(await aplicarPosicionEnClase(item.fen))) return;
            document.getElementById("question-plies-input").value = 1;
            const { data, error } = await crearPregunta(item.fen, 1);
            if (error) { console.error(error); setStatus("No se pudo crear la pregunta: " + error.message); return; }
            activateTeacherTab("preguntar");
            setStatus("Pregunta abierta desde el plan: " + item.titulo);
            computeEngineAnswer(data.id, item.fen, 1); // en segundo plano
        }

        document.getElementById("plan-select").addEventListener("change", (e) => {
            abrirPlanEnClase(e.target.value);
        });

        /* La bitácora, abierta desde el renglón del alumno. El panel se monta
           entero cada vez: son pocas notas (las últimas cinco) y así no hay que
           acordarse de limpiar lo del alumno anterior — que es justo el descuido
           que dejaría al profesor escribiendo sobre quien no era. */
        /* `posicion` ({fen, texto}) cuando se abre desde el tablero de ESE
           alumno (su respuesta, su práctica): esa posición va marcada. Si no,
           se ofrece la del tablero de la clase, sin marcar. La nota queda en la
           clase abierta (notas_alumno.class_session_id). */
        function abrirNotasEnClase(studentId, nombre, posicion) {
            if (!isTeacher) return;
            const caja = document.getElementById("notas-en-clase");
            document.getElementById("notas-en-clase-titulo").textContent = "📝 Bitácora de " + nombre;
            caja.classList.remove("hidden");
            NotasAlumno.montarPanel(document.getElementById("notas-en-clase-body"), {
                sb,
                alumnoId: studentId,
                profesorId: profile.id,
                compacto: true,
                enClase: {
                    claseId: () => currentOpenSessionId,
                    fen: () => (posicion ? posicion.fen : board.fen()),
                    conPosicion: !!posicion,
                    textoPosicion: posicion ? posicion.texto : "Con la posición del tablero de la clase",
                },
            });
        }

        // Anotar desde donde se está mirando: se abre su bitácora con esa posición.
        function anotarDesde(studentId, nombre, posicion) {
            activateTeacherTab("alumnos");
            abrirNotasEnClase(studentId, nombre, posicion);
            const caja = document.getElementById("notas-en-clase");
            caja.scrollIntoView({ block: "nearest" });
            const t = caja.querySelector("textarea");
            if (t) t.focus();
        }

        document.getElementById("notas-en-clase-cerrar").addEventListener("click", () => {
            document.getElementById("notas-en-clase").classList.add("hidden");
        });

        /* Los trofeos del alumno, desde su renglón. Mismo criterio que la
           bitácora: el panel se arma entero cada vez, para no ajustarle a uno
           mirando el total del anterior. Quién puede ajustar lo decide
           ajustar_trofeos() en la base, no este botón. */
        function abrirTrofeosEnClase(studentId, nombre) {
            if (!isTeacher) return;
            const caja = document.getElementById("trofeos-en-clase");
            document.getElementById("trofeos-en-clase-titulo").textContent = "🏆 Trofeos e insignias de " + nombre;
            caja.classList.remove("hidden");
            Trofeos.montarPanel(document.getElementById("trofeos-en-clase-body"), { sb, alumnoId: studentId });
        }

        document.getElementById("trofeos-en-clase-cerrar").addEventListener("click", () => {
            document.getElementById("trofeos-en-clase").classList.add("hidden");
        });

        // ---------- Los trofeos del alumno (se acumulan de clase en clase) ----------
        // Uno por cada respuesta marcada ✅ más los ajustes del profesor; la
        // cuenta la hace trofeos_de() en la base. Se vuelve a pedir cada vez que
        // el profesor califica o ajusta: así un ✅ cambiado a ❌ también resta.
        async function cargarMisTrofeos() {
            if (isTeacher || esObservador || !window.Trofeos) return;
            const [t, p] = await Promise.all([Trofeos.cargar(sb), Trofeos.premios(sb, profile.id)]);
            const insEl = document.getElementById("mis-insignias");
            insEl.innerHTML = "";
            if (p && p.insignias_total) insEl.appendChild(Trofeos.chipsInsignias(p.insignias, "total"));
            const totalEl = document.getElementById("mis-trofeos-total");
            const detalleEl = document.getElementById("mis-trofeos-detalle");
            if (!t) {
                totalEl.textContent = "🏆 —";
                detalleEl.textContent = "No se pudieron cargar tus trofeos.";
                return;
            }
            totalEl.textContent = "🏆 " + Trofeos.texto(t.total);
            detalleEl.textContent = t.total
                ? "Se suman de clase en clase: uno por cada respuesta correcta" + (t.ajustes ? ", más los que ajustó tu profesor." : ".")
                : "Cada respuesta que tu profesor marque correcta te da un trofeo.";
        }

        async function setActivePlayer(studentId, color) {
            const { error } = await sb.from("game_state").update({
                active_player_id: studentId,
                active_player_color: studentId ? (color || "both") : "both",
            }).eq("id", myGameStateId);
            if (error) {
                console.error(error);
                setStatus("No se pudo actualizar el control del tablero: " + error.message);
            }
        }

        // ---------- Levantar la mano (solo alumnos) ----------
        // Vive en la misma presencia (sin tabla nueva): cada quien solo puede anunciar su
        // propia mano. Para que el profesor pueda "bajarla" de vuelta (tras atender al
        // alumno) se usa un mensaje broadcast en el mismo canal, que el alumno escucha y
        // aplica sobre su propia presencia.
        let handRaised = false;

        function updateRaiseHandBtn() {
            const btn = document.getElementById("raise-hand-btn");
            if (!btn) return;
            btn.textContent = handRaised ? "✋ Bajar la mano" : "🖐️ Levantar la mano";
            btn.setAttribute("aria-pressed", handRaised ? "true" : "false");
            btn.classList.toggle("bg-accent-500", handRaised);
            btn.classList.toggle("hover:bg-accent-600", handRaised);
            btn.classList.toggle("text-brand-900", handRaised);
            btn.classList.toggle("bg-brand-100", !handRaised);
            btn.classList.toggle("hover:bg-brand-200", !handRaised);
            btn.classList.toggle("dark:bg-brand-800", !handRaised);
            btn.classList.toggle("dark:hover:bg-brand-700", !handRaised);
            btn.classList.toggle("text-brand-700", !handRaised);
            btn.classList.toggle("dark:text-brand-200", !handRaised);
        }

        // Cuándo levantó la mano: el profe ve la cola en ese orden.
        let handAt = null;
        async function setHandRaised(value) {
            handRaised = !!value;
            handAt = handRaised ? (handAt || new Date().toISOString()) : null;
            updateRaiseHandBtn();
            if (!presenceChannel) return;
            await presenceChannel.track({
                email: profile.email,
                full_name: profile.full_name || "",
                role: profile.role,
                online_at: new Date().toISOString(),
                hand_raised: handRaised,
                hand_at: handAt,
            });
        }

        function lowerStudentHand(studentId) {
            if (!presenceChannel) return;
            presenceChannel.send({ type: "broadcast", event: "lower_hand", payload: { studentId } });
        }

        const raiseHandBtn = document.getElementById("raise-hand-btn");
        if (raiseHandBtn) raiseHandBtn.addEventListener("click", () => setHandRaised(!handRaised));

        function subscribePresence() {
            presenceChannel = sb.channel(presenceChannelName(), { config: { presence: { key: profile.id } } });
            presenceChannel.on("presence", { event: "sync" }, () => {
                const state = presenceChannel.presenceState();
                onlineStudents.clear();
                const mirando = [];
                const meMiran = [];
                for (const key of Object.keys(state)) {
                    const meta = state[key][0];
                    // Con dos pestañas abiertas hay dos metas: basta con que una lo mire.
                    const loMira = (state[key] || []).some((m) => m && m.mirando_a === profile.id);
                    if (loMira && key !== profile.id) {
                        meMiran.push(meta && meta.role === "supervision"
                            ? (meta.full_name || "Alguien") + " (" + (meta.como || "supervisión") + ")"
                            : (meta && meta.full_name) || "Tu profe");
                    }
                    if (meta && meta.role === "alumno") {
                        onlineStudents.set(key, { email: meta.email, full_name: meta.full_name, hand_raised: !!meta.hand_raised, hand_at: meta.hand_at || null });
                    } else if (meta && meta.role === "supervision") {
                        // Si además está mirando la partida de un alumno, el profe lo sabe.
                        const suya = meta.mirando_a && practiceStudentBoards[meta.mirando_a];
                        mirando.push({ nombre: meta.full_name || "Alguien", como: meta.como || "supervisión", partida: suya ? suya.nombre : null });
                    }
                }
                renderStudentsList();
                pintarObservadores(mirando);
                if (!isTeacher && !esObservador) pintarTeMiran(meMiran);
                // El nombre del elegido sale de la presencia: al recargar llega después.
                if (isTeacher && elegidoActual) pintarElegido(elegidoActual);
                // Quien se acaba de conectar aparece en la cuenta, con cero.
                if (isTeacher) pintarTurnos();
                // La lista de "con quién chatear" solo muestra alumnos conectados ahora
                // mismo a la clase (ver renderChatStudentOptions) — cada vez que cambia
                // quién está conectado, se refresca también esa lista.
                if (isTeacher) renderChatStudentOptions();
                /* Acá vivía el primer disparador de "esto ya es una clase": que
                   se conectara un alumno. Se fue cuando la clase pasó a abrirla
                   SOLO el profesor —ver «La sesión en vivo se abre cuando el
                   profesor la abre»—, y no por limpieza: sin clase abierta la
                   RLS no le entrega el tablero al alumno, así que no puede
                   conectarse, y el único que llegaba a dispararlo era el rastro
                   de la clase recién cerrada. Reabrir por ahí dejaba una clase
                   fantasma que crecía sola hasta el día siguiente. */
            });
            presenceChannel.on("broadcast", { event: "lower_hand" }, (msg) => {
                if (!isTeacher && handRaised && msg.payload && msg.payload.studentId === profile.id) {
                    setHandRaised(false);
                }
            });
            presenceChannel.subscribe(async (status) => {
                if (status === "SUBSCRIBED") {
                    await presenceChannel.track({
                        email: profile.email,
                        full_name: profile.full_name || "",
                        // Quien observa entra como "supervision": no es alumno,
                        // así que no aparece en la lista de alumnos ni en el
                        // chat, y el profesor ve que está mirando.
                        role: esObservador ? "supervision" : profile.role,
                        como: esObservador ? observaDesde.etiqueta : undefined,
                        online_at: new Date().toISOString(),
                        mirando_a: mirandoA,
                    });
                }
            });
        }

        // El profesor dice en su presencia a quién está mirando (o a nadie, con null).
        async function anunciarMirada(studentId) {
            mirandoA = studentId || null;
            if (!presenceChannel || !veLaPractica()) return;
            try {
                await presenceChannel.track({
                    email: profile.email,
                    full_name: profile.full_name || "",
                    role: esObservador ? "supervision" : profile.role,
                    como: esObservador ? observaDesde.etiqueta : undefined,
                    online_at: new Date().toISOString(),
                    mirando_a: mirandoA,
                });
            } catch (e) { console.error(e); }
        }

        /* Al alumno: quién está mirando su partida. Solo mientras tiene una
           práctica: fuera de ella no hay «su partida» que mirar. */
        function pintarTeMiran(nombres) {
            const el = document.getElementById("practica-te-miran");
            if (!el) return;
            el.hidden = !nombres.length;
            el.textContent = nombres.length
                ? "👁 " + nombres.join(", ") + (nombres.length === 1 ? " está mirando tu partida." : " están mirando tu partida.")
                : "";
        }

        /* Al profesor: quién de supervisión o coordinación está mirando. A quien observa:
           cuántos alumnos hay conectados y quiénes. */
        function pintarObservadores(mirando) {
            if (isTeacher) {
                const el = document.getElementById("observadores");
                if (!el) return;
                el.hidden = !mirando.length;
                // Si además mira la partida de un alumno, se dice cuál: ayudar a tu alumno
                // sin que lo sepas no es supervisar.
                // Cada quien con de dónde viene: supervisión o coordinación.
                el.textContent = mirando.length
                    ? "👁 " + mirando.map((m) => m.nombre + " (" + m.como + ")").join(", ")
                        + (mirando.length === 1 ? " está mirando la clase." : " están mirando la clase.")
                        + mirando.filter((m) => m.partida).map((m) => " " + m.nombre + " está en la partida de " + m.partida + ".").join("")
                    : "";
            } else if (esObservador) {
                const nombres = Array.from(onlineStudents.values()).map((i) => i.full_name || i.email || "Alumno");
                document.getElementById("observador-conectados").textContent = nombres.length
                    ? "Conectados ahora (" + nombres.length + "): " + nombres.join(", ") + "."
                    : "Todavía no hay alumnos conectados.";
            }
        }

        // ---------- Motor de análisis (solo profesor) ----------
        function scoreToWhiteCp(score, turnAtEval) {
            if (!score) return null;
            const value = score.type === "mate"
                ? (score.value > 0 ? 100000 - score.value : -100000 - score.value)
                : score.value;
            return turnAtEval === "w" ? value : -value;
        }

        function evalToBarPercent(whiteCp) {
            const k = 0.0035;
            const pct = 50 + 50 * (2 / (1 + Math.exp(-k * whiteCp)) - 1);
            return Math.max(2, Math.min(98, pct));
        }

        function formatScore(score, turnAtEval) {
            if (score.type === "mate") {
                const mateIn = Math.abs(score.value);
                const favorsMover = score.value > 0;
                return "Mate en " + mateIn + (favorsMover ? "" : " (en contra)");
            }
            const whiteCp = scoreToWhiteCp(score, turnAtEval);
            return (whiteCp >= 0 ? "+" : "") + (whiteCp / 100).toFixed(1);
        }

        async function updateEngineEval() {
            if (!engineEnabled || typeof ClasesEngine === "undefined") return;
            const myRequestId = ++engineRequestId;
            const fen = board.fen();
            const turnAtEval = board.game.turn();
            const multiPv = parseInt(document.getElementById("engine-multipv").value, 10) || 1;
            const linesEl = document.getElementById("engine-lines");
            const retryBtn = document.getElementById("engine-retry-btn");
            retryBtn.classList.add("hidden");
            linesEl.innerHTML = '<li class="text-brand-300">Calculando…</li>';

            // Una posición armada a mano puede hacer que Stockfish falle una vez (ver la nota
            // en js/shared-engine.js): el mismo Worker recién levantado por ese fallo suele
            // responder bien de inmediato a la siguiente consulta, así que — igual que ya
            // hacían requestEngineReply() (Practicar) y computeEngineAnswer() (Preguntar) —
            // se reintenta un par de veces antes de mostrarle un error al profesor. Antes,
            // Analizar era el único de los tres que se rendía a la primera.
            let results = [];
            for (let attempt = 0; attempt < 3; attempt++) {
                results = await ClasesEngine.analyze(fen, multiPv, 700 + multiPv * 150);
                if (myRequestId !== engineRequestId) return; // la posición ya cambió mientras calculaba
                if (results.length) break;
                if (attempt < 2) linesEl.innerHTML = '<li class="text-brand-300">Calculando… (reintentando)</li>';
            }

            if (!results.length) {
                // getLastError() distingue "no llegó a cargar" (worker/wasm falló o tardó
                // demasiado) de "cargó pero no encontró nada" — antes ambos casos se veían
                // igual ("No disponible") y no había forma de saber si valía la pena reintentar.
                const reason = ClasesEngine.getLastError && ClasesEngine.getLastError();
                linesEl.innerHTML = '<li class="text-red-500 dark:text-red-400">' + (reason || "No disponible") + "</li>";
                document.getElementById("engine-eval-bar").style.width = "50%";
                retryBtn.classList.remove("hidden");
                return;
            }

            const best = results[0];
            const whiteCp = scoreToWhiteCp(best, turnAtEval);
            if (whiteCp !== null) document.getElementById("engine-eval-bar").style.width = evalToBarPercent(whiteCp) + "%";

            linesEl.innerHTML = "";
            for (const line of results) {
                const sans = ClasesEngine.pvToSan(fen, line.pvUci, 6);
                const li = document.createElement("li");
                li.innerHTML = '<span class="font-semibold text-brand-800 dark:text-white">' + line.multipv + ') ' +
                    formatScore(line, turnAtEval) + '</span> — ' + (sans.join(" ") || "—");
                linesEl.appendChild(li);
            }
        }

        document.getElementById("engine-toggle-btn").addEventListener("click", async (e) => {
            engineEnabled = !engineEnabled;
            const btn = e.currentTarget;
            const output = document.getElementById("engine-output");
            const status = document.getElementById("engine-status");
            if (engineEnabled) {
                btn.textContent = "Desactivar";
                output.classList.remove("hidden");
                status.textContent = "Cargando el motor (puede tardar unos segundos la primera vez)…";
                await updateEngineEval();
                status.textContent = "Solo lo ves tú — los alumnos nunca ven la evaluación.";
            } else {
                btn.textContent = "Activar";
                output.classList.add("hidden");
                status.textContent = "Solo lo ves tú — los alumnos nunca ven la evaluación.";
            }
        });

        document.getElementById("engine-multipv").addEventListener("change", () => { if (engineEnabled) updateEngineEval(); });
        document.getElementById("engine-retry-btn").addEventListener("click", () => { if (engineEnabled) updateEngineEval(); });

        // ---------- Partidas guardadas (PGN) ----------
        /* El PGN de la clase: desde SU posición de arranque, con las variantes y
           los comentarios (ver js/pgn-clase.js). `soloLinea` es para archivar una
           línea que se reemplaza: esa va sola, sin las variantes de la actual. */
        /* La clase en crudo, con la misma forma que recibe PgnClase.armar():
           se guarda al lado del PGN (saved_games.datos) para que «Repasar mis
           clases» la recorra jugada por jugada, con los comentarios y las
           variantes, sin volver a parsear el PGN. */
        function datosDeLaClase(moves, soloLinea) {
            return {
                inicio: board.startFen || null,
                jugadas: moves.slice(),
                variantes: soloLinea ? [] : variantNodes.map((n) => ({ id: n.id, parent_id: n.parent_id, root_ply: n.root_ply, san: n.san })),
                comentarios: soloLinea ? {} : Object.assign({}, comentariosClase),
            };
        }
        /* Lo que hay en el tablero, para no guardar dos veces la misma clase:
           si el profe ya la guardó con el botón y no cambió nada, al cerrar no
           se vuelve a guardar. */
        let firmaGuardada = null;
        function firmaDeLaClase() {
            return JSON.stringify([board.startFen || null, board.moves(), variantNodes.length, comentariosClase]);
        }

        function pgnDeLaClase(moves, soloLinea) {
            return PgnClase.armar({
                inicio: board.startFen,
                jugadas: moves,
                variantes: soloLinea ? [] : variantNodes,
                comentarios: comentariosClase,
                encabezados: { Annotator: profile.full_name || "?" },
            });
        }

        function downloadText(filename, text) {
            const blob = new Blob([text], { type: "application/x-chess-pgn" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        // La lista completa de partidas guardadas (con descargar/eliminar) vive en
        // partidas.html — aquí ya no hace falta duplicarla: "💾 Guardar PGN" en la barra
        // del profesor guarda la fila (para que siga apareciendo ahí) y descarga el PGN
        // al toque, en un solo clic.

        // ---------- Chat privado con el profesor ----------
        // Cada fila pertenece a la conversación de un alumno (student_id), la haya escrito
        // el alumno o el profesor respondiéndole. Un alumno solo ve su propia conversación;
        // el profesor elige con cuál alumno está hablando en cada momento (chatStudentId).
        // Nadie ve la conversación de otro — ni siquiera otro alumno.
        let chatStudentId = null; // solo lo usa el profesor
        const chatStudents = []; // [{id, full_name, email}], para el selector del profesor
        const chatUnseen = new Set(); // ids de alumnos con mensajes nuevos en un chat que el profesor no tiene abierto

        function currentChatThreadId() {
            return isTeacher ? chatStudentId : profile.id;
        }

        function renderChatMessages(messages) {
            const listEl = document.getElementById("chat-messages");
            if (!messages.length) {
                listEl.innerHTML = '<li class="text-brand-450 dark:text-brand-350 text-center py-2">Todavía no hay mensajes…</li>';
                return;
            }
            // Solo hace auto-scroll si ya se estaba viendo el final: así no se interrumpe a
            // quien subió a leer mensajes anteriores cuando llega uno nuevo.
            const wasNearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 40;
            listEl.innerHTML = "";
            for (const m of messages) {
                const isFromTeacher = !!m.profiles && (m.profiles.role === "profesor" || m.profiles.is_admin === true);
                const isOwn = m.sender_id === profile.id;
                // Recuadro de chat estilo mensajería: los mensajes propios a la derecha, los
                // del otro lado de la conversación a la izquierda — sin importar el rol de
                // quien está mirando (para el alumno "propio" es él mismo; para el profesor,
                // sus propias respuestas).
                const row = document.createElement("li");
                row.className = "flex " + (isOwn ? "justify-end" : "justify-start");
                const bubble = document.createElement("div");
                bubble.className = "max-w-[85%] rounded-2xl px-3 py-2 " +
                    (isOwn
                        ? "bg-accent-500 text-brand-900 rounded-br-sm"
                        : (isFromTeacher
                            ? "bg-accent-500/15 border border-accent-500/30 text-brand-700 dark:text-brand-200 rounded-bl-sm"
                            : "bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200 rounded-bl-sm"));
                const header = document.createElement("div");
                header.className = "flex items-center gap-1.5 mb-0.5";
                const name = document.createElement("span");
                name.className = "font-semibold text-xs truncate " + (isOwn ? "text-brand-900" : (isFromTeacher ? "text-accent-600 dark:text-accent-400" : "text-brand-700 dark:text-brand-200"));
                // Nunca innerHTML: full_name/email/body vienen de otros usuarios.
                name.textContent = isOwn ? "Tú" : ((m.profiles && (m.profiles.full_name || m.profiles.email)) || "Alguien");
                header.appendChild(name);
                if (isFromTeacher && !isOwn) {
                    const roleBadge = document.createElement("span");
                    roleBadge.className = "text-[10px] font-bold uppercase tracking-wide text-accent-600 dark:text-accent-400 shrink-0";
                    roleBadge.textContent = "Profesor";
                    header.appendChild(roleBadge);
                }
                const time = document.createElement("span");
                time.className = "text-[10px] ml-auto shrink-0 " + (isOwn ? "text-brand-900/60" : "text-brand-450 dark:text-brand-350");
                time.textContent = new Date(m.created_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
                header.appendChild(time);
                const body = document.createElement("p");
                body.className = "text-sm break-words " + (isOwn ? "text-brand-900" : "");
                body.textContent = m.body;
                bubble.appendChild(header);
                bubble.appendChild(body);
                row.appendChild(bubble);
                listEl.appendChild(row);
            }
            if (wasNearBottom) listEl.scrollTop = listEl.scrollHeight;
        }

        async function loadChatMessages() {
            const threadId = currentChatThreadId();
            if (!threadId) { renderChatMessages([]); return; }
            // "profiles!class_chat_messages_sender_id_fkey": la tabla tiene DOS relaciones
            // con profiles (sender_id y student_id), así que hay que decirle a PostgREST
            // cuál usar — sin esto la consulta fallaba (ambigua) y el chat nunca cargaba.
            const { data, error } = await sb.from("class_chat_messages")
                .select("*, profiles!class_chat_messages_sender_id_fkey(full_name, email, role, is_admin)")
                .eq("student_id", threadId)
                .order("created_at", { ascending: false })
                .limit(150);
            if (error) { console.error(error); return; }
            renderChatMessages((data || []).slice().reverse());
        }

        // ---------- Selector de alumno (solo profesor) ----------
        function renderChatStudentOptions() {
            const select = document.getElementById("chat-student-select");
            const prevValue = select.value;
            select.innerHTML = "";
            // Solo alumnos conectados ahora mismo a la clase (ver onlineStudents, la misma
            // lista de presencia de "Alumnos conectados") — con muchos alumnos registrados
            // en la Academia, no tiene sentido buscar entre todos para hablar con quien SÍ
            // está en esta clase ahora. Excepción: si ya se estaba viendo la conversación
            // con alguien que justo se desconectó, se lo deja igual (marcado aparte) para
            // no perder de golpe esa conversación abierta.
            const visible = chatStudents.filter((s) => onlineStudents.has(s.id) || s.id === chatStudentId);
            for (const s of visible) {
                const opt = document.createElement("option");
                opt.value = s.id;
                const online = onlineStudents.has(s.id);
                opt.textContent = (chatUnseen.has(s.id) ? "🔴 " : "") + (s.full_name || s.email) + (online ? "" : " (desconectado)");
                select.appendChild(opt);
            }
            if (prevValue && visible.some((s) => s.id === prevValue)) select.value = prevValue;
            const anyToShow = visible.length > 0;
            document.getElementById("chat-no-students").classList.toggle("hidden", anyToShow);
            document.getElementById("chat-no-students").textContent = chatStudents.length
                ? "Ningún alumno está conectado a la clase ahora mismo."
                : "Todavía no hay alumnos registrados.";
            document.getElementById("chat-form").classList.toggle("hidden", !anyToShow);
        }

        async function loadChatStudents() {
            // Los alumnos de ESTE profesor. Ya no basta con mirar una columna:
            // la relación vive en profile_teachers (un alumno puede tener varios).
            const { data, error } = await sb.rpc("alumnos_del_profesor", { p_profesor: boardOwnerId });
            if (error) { console.error(error); return; }
            chatStudents.length = 0;
            chatStudents.push(...(data || []));
            if (!chatStudentId || !chatStudents.some((s) => s.id === chatStudentId)) {
                // Por defecto, empezar la conversación con el primer alumno CONECTADO — no
                // tiene sentido abrir de entrada el chat de alguien que ni siquiera está en
                // la clase ahora mismo.
                const firstOnline = chatStudents.find((s) => onlineStudents.has(s.id));
                chatStudentId = firstOnline ? firstOnline.id : null;
            }
            renderChatStudentOptions();
            document.getElementById("chat-student-select").value = chatStudentId || "";
            await loadChatMessages();
        }

        document.getElementById("chat-student-select").addEventListener("change", async (e) => {
            chatStudentId = e.target.value || null;
            chatUnseen.delete(chatStudentId);
            renderChatStudentOptions();
            await loadChatMessages();
        });

        // Solo los hilos que esta pantalla muestra: el del propio alumno, o los de
        // los alumnos de este profesor. Sin filtro, cada mensaje de cualquier clase
        // de la plataforma le llegaba a todas las clases abiertas y Realtime revisaba
        // la RLS una vez por cada una (ver «Realtime escucha solo lo que la pantalla
        // muestra»). El filtro `in` acepta hasta 100 valores: de a 100.
        // El DELETE va aparte y sin filtro porque Realtime no filtra borrados; es
        // raro (solo «Vaciar esta conversación») y el callback descarta los ajenos.
        function filtrosDelChat() {
            if (!isTeacher) return ["student_id=eq." + profile.id];
            const ids = chatStudents.map((s) => s.id);
            const filtros = [];
            for (let i = 0; i < ids.length; i += 100) filtros.push("student_id=in.(" + ids.slice(i, i + 100).join(",") + ")");
            return filtros;
        }

        function subscribeChat() {
            const canal = sb.channel("class-chat-messages-changes");
            for (const filter of filtrosDelChat()) {
                canal.on("postgres_changes", { event: "INSERT", schema: "public", table: "class_chat_messages", filter }, alCambiarElChat);
                canal.on("postgres_changes", { event: "UPDATE", schema: "public", table: "class_chat_messages", filter }, alCambiarElChat);
            }
            canal.on("postgres_changes", { event: "DELETE", schema: "public", table: "class_chat_messages" }, alCambiarElChat);
            canal.subscribe();

            function alCambiarElChat(payload) {
                const affectedStudentId = (payload.new && payload.new.student_id) || (payload.old && payload.old.student_id);
                if (affectedStudentId === currentChatThreadId()) {
                    loadChatMessages();
                } else if (isTeacher && affectedStudentId && payload.eventType === "INSERT") {
                    // Mensaje nuevo en la conversación de otro alumno: se marca en el
                    // selector en vez de interrumpir la conversación que se está viendo.
                    chatUnseen.add(affectedStudentId);
                    renderChatStudentOptions();
                    const student = chatStudents.find((s) => s.id === affectedStudentId);
                    setStatus("💬 Nuevo mensaje de " + (student ? (student.full_name || student.email) : "un alumno") + " en su chat privado.");
                }
            }
        }

        document.getElementById("chat-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const threadId = currentChatThreadId();
            if (!threadId) return;
            const input = document.getElementById("chat-input");
            const body = input.value.trim();
            if (!body) return;
            input.value = "";
            const { error } = await sb.from("class_chat_messages").insert({ sender_id: profile.id, student_id: threadId, body });
            if (error) { console.error(error); setStatus("No se pudo enviar el mensaje: " + error.message); }
        });

        // Vaciar borra el hilo ENTERO de ese alumno, sus mensajes incluidos: eso es lo que
        // la RLS le permite al profesor (class_chat_messages_delete) y es lo que hace falta
        // — un "vaciar" que dejara los mensajes del alumno no vaciaría nada.
        //
        // La lista se vuelve a cargar acá mismo y no se espera al aviso de Realtime. Durante
        // un tiempo eso fue justamente lo que falló: el DELETE llegaba sin `student_id` (la
        // replica identity por omisión solo manda la clave primaria), así que no coincidía
        // con ningún hilo y la pantalla se quedaba igual — el profesor confirmaba y los
        // mensajes seguían ahí, como si no se le permitiera. Ya se arregló en la base
        // (replica identity full, que es lo que vacía también la pantalla del ALUMNO), pero
        // la pantalla de quien acaba de apretar el botón no tiene por qué depender de que
        // un aviso dé la vuelta: se recarga y se dice con todas las letras que se vació.
        document.getElementById("clear-chat-btn").addEventListener("click", async () => {
            const threadId = currentChatThreadId();
            if (!threadId) return;
            if (!(await Avisos.confirmar("Se borran también los mensajes del alumno y no se puede deshacer.", { titulo: "¿Vaciar esta conversación?", aceptar: "Vaciar", peligro: true }))) return;
            const btn = document.getElementById("clear-chat-btn");
            btn.disabled = true;
            const { error } = await sb.from("class_chat_messages").delete().eq("student_id", threadId);
            btn.disabled = false;
            if (error) { console.error(error); setStatus("No se pudo vaciar la conversación: " + error.message); return; }
            await loadChatMessages();
            setStatus("💬 Conversación vaciada.");
        });

        // Un solo botón hace las dos cosas: guarda la partida (queda también en la página
        // Partidas guardadas, por si se necesita después) y descarga el PGN de una vez —
        // antes había que guardarla aquí y después ir a buscarla en otra lista aparte
        // solo para descargarla.
        document.getElementById("save-game-btn").addEventListener("click", async () => {
            const moves = board.moves();
            if (!moves.length) { setStatus("No hay jugadas todavía para guardar."); return; }
            const pgn = pgnDeLaClase(moves, false);
            const { error } = await sb.from("saved_games").insert({
                pgn, fen_final: board.fen(), move_count: moves.length, created_by: session.user.id,
                datos: datosDeLaClase(moves, false),
            });
            if (error) { console.error(error); setStatus("No se pudo guardar la partida: " + error.message); return; }
            firmaGuardada = firmaDeLaClase();
            const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
            downloadText("clase-" + hoy + ".pgn", pgn);
            const n = PgnClase.contar({ jugadas: moves, variantes: variantNodes, comentarios: comentariosClase });
            setStatus("Partida guardada y PGN descargado: " + n.jugadas + (n.jugadas === 1 ? " jugada" : " jugadas")
                + (n.variantes ? ", " + n.variantes + (n.variantes === 1 ? " jugada de variante" : " jugadas de variantes") : "")
                + (n.comentarios ? ", " + n.comentarios + (n.comentarios === 1 ? " comentario" : " comentarios") : "") + "."
                // Con la clase abierta, la base la liga a ella (trigger
                // ligar_a_la_clase_abierta) y la ven quienes asistieron.
                + (currentOpenSessionId ? " Tus alumnos que estuvieron en la clase la pueden repasar en «Repasar mis clases»." : ""));
        });

        // ---------- Preguntar a la clase: "¿qué jugarías?" ----------
        let questionBoard = null;
        let currentQuestion = null;
        let myAnswer = null;
        // id de la pregunta que el alumno cerró con la ✖ (ver question-close-btn): sigue
        // abierta del lado del profesor, así que no se descarta como currentQuestion — solo
        // se deja de imponer el overlay hasta que el alumno la vuelva a abrir.
        let questionCardDismissedFor = null;
        // id de la pregunta para la que hay un cálculo de computeEngineAnswer() en curso
        // ahora mismo (o null si ninguno) — evita que "Reintentar" dispare una segunda
        // consulta al motor mientras la primera todavía está pensando.
        let computingAnswerFor = null;
        // El motor responde entre jugada y jugada del alumno (ver expected_plies arriba):
        // questionMovesDone cuenta cuántas veces YA movió el alumno en este intento;
        // questionStudentColor es el bando con el que juega (el que le toca mover en el
        // FEN de la pregunta); questionEngineBusy evita pedirle dos jugadas a la vez.
        let questionMovesDone = 0;
        let questionStudentColor = "w";
        let questionEngineBusy = false;
        let questionEngineLastFailed = false;

        /* ---------- Preguntas: tiempo, opciones y lo que contestó la clase ----------
           Una sola puerta crea las preguntas de «¿qué jugarías?» (la usan el botón,
           Táctica, el plan, los archivos y los Tipos): así el tiempo para contestar
           vale para todas sin que ninguna se olvide de mandarlo. Las de opciones
           van por hacer_pregunta_de_opciones(), que guarda la correcta aparte, donde
           los alumnos no la leen. Ver js/pregunta-clase.js. */
        function tiempoElegido() {
            const v = document.getElementById("question-tiempo");
            const n = v ? parseInt(v.value, 10) : NaN;
            return isFinite(n) && n > 0 ? n : null;
        }

        // paraAlumno: la pregunta dirigida, solo para quien tiene el turno. Los
        // demás la ven pero no la contestan (lo rechaza la base).
        // deSalida: la pregunta de salida, la última de la clase (ver hacerPreguntaDeSalida).
        async function crearPregunta(fen, expectedPlies, paraAlumno, deSalida) {
            await sb.from("questions").update({ closed_at: new Date().toISOString() })
                .eq("created_by", boardOwnerId).is("closed_at", null);
            return sb.from("questions")
                .insert({ fen, created_by: session.user.id, expected_plies: expectedPlies, tiempo_limite: tiempoElegido(), para_alumno: paraAlumno || null, de_salida: !!deSalida })
                .select().single();
        }

        async function crearPreguntaDeOpciones(prompt, opciones, correcta) {
            const fen = board.fen();
            const motivo = motivoPosicionInvalida(fen);
            if (motivo) { setStatus(motivo); return false; }
            const { data, error } = await sb.rpc("hacer_pregunta_de_opciones", {
                p_fen: fen, p_prompt: prompt, p_opciones: opciones,
                p_correcta: correcta, p_tiempo_limite: tiempoElegido(),
            });
            if (error) { console.error(error); setStatus("No se pudo crear la pregunta: " + error.message); return false; }
            setStatus("Pregunta enviada a la clase: " + prompt);
            // La fila de la pregunta (la de salida la marca después).
            return (Array.isArray(data) ? data[0] : data) || true;
        }

        /* ---------- La pregunta de salida ----------
           La última de la clase, sobre lo visto: el termómetro o «¿qué
           jugarías?» en el tablero, marcada questions.de_salida. Lo que dice
           (ResumenClase.veredictoSalida) se ve al cerrar, queda en el registro y
           se le recuerda al profe al abrir la clase siguiente. */
        async function hacerPreguntaDeSalida(tipo) {
            if (!currentOpenSessionId) { setStatus("La pregunta de salida es de una clase abierta."); return; }
            if (tipo === "termometro") {
                const q = await crearPreguntaDeOpciones(PreguntaClase.TERMOMETRO.prompt, PreguntaClase.TERMOMETRO.opciones, null);
                if (!q) return;
                const { error } = await sb.from("questions").update({ de_salida: true }).eq("id", q.id);
                if (error) { console.error(error); setStatus("La pregunta salió, pero no quedó marcada como de salida: " + error.message); return; }
            } else {
                const fen = board.fen();
                const motivo = motivoPosicionInvalida(fen);
                if (motivo) { setStatus(motivo); return; }
                const { data, error } = await crearPregunta(fen, 1, null, true);
                if (error) { console.error(error); setStatus("No se pudo crear la pregunta: " + error.message); return; }
                computeEngineAnswer(data.id, fen, 1);
            }
            setStatus("🚪 Pregunta de salida enviada: lo que contesten dice si el tema quedó.");
            refrescarSalida();
        }

        async function refrescarSalida() {
            const caja = document.getElementById("salida-resultado");
            if (!caja || !currentOpenSessionId) return;
            const { fila, error } = await ResumenClase.cargarSalida(sb, currentOpenSessionId);
            if (error) { console.error(error); return; }
            ResumenClase.pintarSalida(caja, fila);
        }

        // Al empezar: lo que dijo la pregunta de salida de la última clase cerrada.
        async function mostrarSalidaPasada() {
            const caja = document.getElementById("salida-pasada");
            if (!caja || !isTeacher) return;
            const { data, error } = await sb.from("class_sessions").select("id, title, ended_at")
                .eq("created_by", boardOwnerId).not("ended_at", "is", null)
                .order("ended_at", { ascending: false }).limit(1);
            if (error) { console.error(error); return; }
            const pasada = data && data[0];
            if (!pasada) { caja.hidden = true; return; }
            const { fila, error: err2 } = await ResumenClase.cargarSalida(sb, pasada.id);
            if (err2) { console.error(err2); return; }
            ResumenClase.pintarSalida(caja, fila, "📌 La clase pasada" + (pasada.title ? " («" + pasada.title + "»)" : "")
                + ", la pregunta de salida dijo: ");
            const v = ResumenClase.veredictoSalida(fila);
            await proponerRepaso(pasada.id, v && (v.tono === "repetir" || v.tono === "medias"), caja);
        }

        /* Si no quedó, lo que se vio del plan en esa clase (clase_plan_hecho)
           se propone para repasar: sube al principio de «Mi plan» con su marca.
           No se guarda nada: sale de la pregunta de salida y de lo marcado. */
        let repaso = { ids: new Set(), planId: null };
        async function proponerRepaso(claseId, hayQueRepasar, caja) {
            repaso = { ids: new Set(), planId: null };
            if (hayQueRepasar) {
                const { data: hechos, error } = await sb.from("clase_plan_hecho").select("plan_item_id").eq("class_session_id", claseId);
                if (error) { console.error(error); return; }
                const ids = (hechos || []).map((h) => h.plan_item_id);
                const { data: items, error: err2 } = ids.length
                    ? await sb.from("plan_items").select("id, plan_id, titulo, tipo, leccion").in("id", ids)
                    : { data: [], error: null };
                if (err2) { console.error(err2); return; }
                if ((items || []).length) {
                    repaso = { ids: new Set(items.map((it) => it.id)), planId: items[0].plan_id };
                    caja.appendChild(document.createTextNode(" Se vio: " + items.map((it) => "«" + PlanClase.resumen(it) + "»").join(", ") + ". "));
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.id = "repasar-plan-btn";
                    btn.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                    btn.textContent = "🔁 Repasarlo en Mi plan";
                    btn.addEventListener("click", async () => {
                        const select = document.getElementById("plan-select");
                        if (repaso.planId && [...select.options].some((o) => o.value === repaso.planId)) {
                            select.value = repaso.planId;
                            await abrirPlanEnClase(repaso.planId);
                        }
                        activateTeacherTab("plan");
                        document.getElementById("plan-items").scrollIntoView({ block: "nearest" });
                    });
                    caja.appendChild(btn);
                }
            }
            // Si ya había un plan abierto, se vuelve a pintar con lo de repasar arriba.
            const select = document.getElementById("plan-select");
            if (select && select.value) await abrirPlanEnClase(select.value);
        }

        if (document.getElementById("salida-termometro-btn")) {
            document.getElementById("salida-termometro-btn").addEventListener("click", () => hacerPreguntaDeSalida("termometro"));
            document.getElementById("salida-jugada-btn").addEventListener("click", () => hacerPreguntaDeSalida("jugada"));
        }

        function montarControlesDePreguntas() {
            const sel = document.getElementById("question-tiempo");
            if (!sel || sel.childElementCount) return;
            PreguntaClase.TIEMPOS.forEach((t) => {
                const o = document.createElement("option");
                o.value = t.segundos === null ? "" : String(t.segundos);
                o.textContent = t.texto;
                sel.appendChild(o);
            });
            // Las filas de «una pregunta con tus opciones»: cuatro, con su radio de
            // «esta es la correcta» y uno de «ninguna» que arranca marcado.
            const filas = document.getElementById("opciones-filas");
            const ninguna = document.createElement("label");
            ninguna.className = "flex items-center gap-2 text-xs text-brand-600 dark:text-brand-300";
            ninguna.innerHTML = '<input type="radio" name="opcion-correcta" value="" checked> Ninguna es «la correcta»';
            for (let i = 0; i < 4; i++) {
                const fila = document.createElement("div");
                fila.className = "flex items-center gap-2";
                const radio = document.createElement("input");
                radio.type = "radio";
                radio.name = "opcion-correcta";
                radio.value = String(i);
                radio.setAttribute("aria-label", "La opción " + (i + 1) + " es la correcta");
                const txt = document.createElement("input");
                txt.type = "text";
                txt.maxLength = 120;
                txt.id = "opcion-texto-" + i;
                txt.placeholder = "Opción " + (i + 1);
                txt.setAttribute("aria-label", "Opción " + (i + 1));
                txt.className = "flex-1 text-xs bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 text-brand-700 dark:text-brand-200 focus:outline-none focus:ring-2 focus:ring-accent-500";
                fila.append(radio, txt);
                filas.appendChild(fila);
            }
            filas.appendChild(ninguna);

            document.getElementById("ask-quien-mejor-btn").addEventListener("click", () => {
                const v = document.getElementById("quien-mejor-correcta").value;
                crearPreguntaDeOpciones(PreguntaClase.QUIEN_ESTA_MEJOR.prompt, PreguntaClase.QUIEN_ESTA_MEJOR.opciones, v === "" ? null : Number(v));
            });
            document.getElementById("ask-termometro-btn").addEventListener("click", () => {
                crearPreguntaDeOpciones(PreguntaClase.TERMOMETRO.prompt, PreguntaClase.TERMOMETRO.opciones, null);
            });
            document.getElementById("ask-opciones-btn").addEventListener("click", async () => {
                const prompt = document.getElementById("opciones-prompt").value.trim();
                // Se juntan las escritas, y la correcta se renumera: si se dejó la
                // opción 2 vacía, la 3 pasa a ser la segunda.
                const marcada = (document.querySelector('input[name="opcion-correcta"]:checked') || {}).value;
                const opciones = [];
                let correcta = null;
                for (let i = 0; i < 4; i++) {
                    const t = document.getElementById("opcion-texto-" + i).value.trim();
                    if (!t) continue;
                    if (marcada === String(i)) correcta = opciones.length;
                    opciones.push(t);
                }
                if (!prompt) { setStatus("Escribe la pregunta antes de mandarla."); document.getElementById("opciones-prompt").focus(); return; }
                if (opciones.length < 2) { setStatus("Escribe al menos dos opciones."); document.getElementById("opcion-texto-0").focus(); return; }
                if (marcada && correcta === null) { setStatus("La opción que marcaste como correcta está vacía."); return; }
                await crearPreguntaDeOpciones(prompt, opciones, correcta);
            });
            document.getElementById("mostrar-resultados-btn").addEventListener("click", async () => {
                if (!currentQuestion) return;
                const valor = !currentQuestion.resultados_visibles;
                const { error } = await sb.from("questions").update({ resultados_visibles: valor }).eq("id", currentQuestion.id);
                if (error) { console.error(error); setStatus("No se pudo cambiar: " + error.message); return; }
                currentQuestion.resultados_visibles = valor;
                pintarResultadosProfe();
                setStatus(valor ? "📊 La clase ya ve lo que contestó el grupo (sin nombres)." : "La clase ya no ve las respuestas del grupo.");
            });
        }

        // Lo que contestó el grupo, sin nombres (el profe lo ve siempre).
        let resultadosPreguntaPedidos = 0;
        async function cargarResultados(pregunta) {
            const { data, error } = await sb.rpc("resultados_de_la_pregunta", { p_pregunta: pregunta.id });
            if (error) { console.error(error); return null; }
            return data || [];
        }

        function pintarListaDeResultados(caja, pregunta, filas) {
            caja.innerHTML = "";
            const tit = document.createElement("p");
            tit.className = "font-semibold mb-1";
            tit.textContent = PreguntaClase.titularDeResultados(filas);
            caja.appendChild(tit);
            const lineas = PreguntaClase.lineasDeResultados(pregunta, filas);
            if (!lineas.some((l) => l.cuantos)) return;
            const ul = document.createElement("ul");
            ul.className = "space-y-1";
            lineas.forEach((l) => {
                const li = document.createElement("li");
                // La barra acompaña; el dato va escrito al lado (nunca el color solo).
                const barra = document.createElement("span");
                barra.setAttribute("aria-hidden", "true");
                barra.className = "inline-block align-middle h-2 rounded mr-2 " + (l.correcta ? "bg-green-600" : "bg-accent-500");
                barra.style.width = l.cuantos ? Math.max(3, Math.round(l.porcentaje * 0.6)) + "px" : "0";
                const t = document.createElement("span");
                t.textContent = (l.correcta ? "✓ " : "") + l.dicho;   // textContent: las opciones las escribió una persona
                li.append(barra, t);
                ul.appendChild(li);
            });
            caja.appendChild(ul);
        }

        async function pintarResultadosProfe() {
            const caja = document.getElementById("question-resultados-profe");
            const btn = document.getElementById("mostrar-resultados-btn");
            if (!caja || !currentQuestion) return;
            const visibles = !!currentQuestion.resultados_visibles;
            btn.setAttribute("aria-pressed", visibles ? "true" : "false");
            btn.textContent = visibles ? "🙈 Dejar de mostrar las respuestas a la clase" : "📊 Mostrar las respuestas a la clase";
            const pedido = ++resultadosPreguntaPedidos;
            const filas = await cargarResultados(currentQuestion);
            if (pedido !== resultadosPreguntaPedidos || !filas) return;
            pintarListaDeResultados(caja, currentQuestion, filas);
        }

        /* Mientras la clase ve los resultados, cada respuesta nueva se los tiene que
           actualizar: el profe «toca» la pregunta y el cambio les llega por Realtime.
           Una vez por segundo como mucho, aunque contesten diez juntos. */
        let avisoResultadosPendiente = null;
        function avisarResultadosALaClase() {
            if (!currentQuestion || !currentQuestion.resultados_visibles || avisoResultadosPendiente) return;
            const id = currentQuestion.id;
            avisoResultadosPendiente = setTimeout(async () => {
                avisoResultadosPendiente = null;
                await sb.from("questions").update({ resultados_visibles: true }).eq("id", id);
            }, 1000);
        }

        async function pintarResultadosAlumno() {
            const caja = document.getElementById("question-resultados-alumno");
            if (!caja) return;
            if (!currentQuestion || !currentQuestion.resultados_visibles) {
                caja.hidden = true;
                if (questionBoard && !PreguntaClase.esDeOpciones(currentQuestion)) questionBoard.setMarks([], []);
                return;
            }
            const filas = await cargarResultados(currentQuestion);
            if (!filas) return;
            caja.hidden = false;
            pintarListaDeResultados(caja, currentQuestion, filas);
            if (questionBoard && !PreguntaClase.esDeOpciones(currentQuestion)) {
                questionBoard.setMarks(PreguntaClase.flechasDeResultados(currentQuestion.fen, filas, ["verde", "azul"]), []);
            }
        }

        // La cuenta regresiva, de las dos pantallas. Al alumno se le dice en voz a
        // los 10 segundos y al terminar; el texto que cambia cada segundo no es vivo.
        let tiempoDichoPara = null;
        function pintarTiempoDeLaPregunta() {
            const q = currentQuestion && !currentQuestion.closed_at ? currentQuestion : null;
            const quedan = PreguntaClase.segundosRestantes(q);
            if (isTeacher) {
                const el = document.getElementById("question-tiempo-profe");
                if (el) el.textContent = quedan === null ? "" : "· " + PreguntaClase.textoRestante(quedan);
                return;
            }
            const el = document.getElementById("question-tiempo-alumno");
            if (!el) return;
            el.hidden = quedan === null;
            el.textContent = PreguntaClase.textoRestante(quedan);
            if (quedan === null) return;
            const aviso = document.getElementById("question-tiempo-aviso");
            const clave = q.id + ":" + (quedan <= 0 ? "fin" : quedan <= 10 ? "10" : "");
            if (quedan <= 10 && tiempoDichoPara !== clave) {
                tiempoDichoPara = clave;
                aviso.textContent = quedan <= 0 ? "Se acabó el tiempo." : "Quedan 10 segundos.";
            }
            if (quedan <= 0 && !myAnswer && questionBoard) {
                questionBoard.setInteractive(false);
                document.querySelectorAll("#question-opciones button").forEach((b) => { b.disabled = true; });
                document.getElementById("question-status-text").textContent = "Se acabó el tiempo: esta vez no alcanzaste a contestar.";
            }
        }
        setInterval(pintarTiempoDeLaPregunta, 1000);

        // Las opciones del alumno: un botón por opción, con aria-pressed en la suya.
        function pintarOpcionesAlumno() {
            const caja = document.getElementById("question-opciones");
            const esOp = PreguntaClase.esDeOpciones(currentQuestion);
            caja.hidden = !esOp;
            if (!esOp) { caja.innerHTML = ""; return; }
            const vencida = PreguntaClase.segundosRestantes(currentQuestion) === 0;
            caja.innerHTML = "";
            currentQuestion.opciones.forEach((texto, i) => {
                const b = document.createElement("button");
                b.type = "button";
                const mia = myAnswer && myAnswer.opcion === i;
                b.className = "w-full text-left px-4 py-3 rounded-lg border-2 text-sm font-semibold transition-colors "
                    + (mia ? "border-accent-600 bg-accent-500 text-brand-900" : "border-brand-200 dark:border-brand-700 text-brand-800 dark:text-brand-100 hover:bg-brand-100 dark:hover:bg-brand-800");
                b.setAttribute("aria-pressed", mia ? "true" : "false");
                b.textContent = String(texto);   // la escribió una persona
                b.disabled = vencida;
                b.addEventListener("click", () => enviarOpcion(i));
                caja.appendChild(b);
            });
        }

        async function enviarOpcion(i) {
            if (!currentQuestion || currentQuestion.closed_at) return;
            const { data, error } = await sb.from("question_answers").upsert({
                question_id: currentQuestion.id, student_id: profile.id, moves: [], resulting_fen: currentQuestion.fen, opcion: i,
            }, { onConflict: "question_id,student_id" }).select().single();
            if (error) {
                console.error(error);
                document.getElementById("question-status-text").textContent = /tiempo/i.test(error.message)
                    ? "Se acabó el tiempo: tu respuesta no alcanzó a llegar." : "No se pudo enviar tu respuesta: " + error.message;
                return;
            }
            myAnswer = data || { opcion: i, is_correct: null };
            pintarOpcionesAlumno();
            updateAnswerFeedbackUI();
        }

        /* ---------- El alumno elegido al azar para responder ----------
           Queda en game_state.elegido ({id, at}) y no en un mensaje suelto de
           Realtime: quien recarga justo en ese momento se entera igual. Solo el
           profe lo cambia (protect_game_state_teacher_columns). Al elegido le sale
           en grande; los demás no ven nada. */
        // Cuántas veces le tocó a cada uno en ESTA clase (clase_elegidos).
        let turnosEnLaClase = new Map();
        let turnosDeLaClase = null;      // de qué clase son esas cuentas
        let elegidoActual = null;        // {id, at} tal como está en la base
        // El aviso se cierra una vez por elección (se recuerda en la pestaña:
        // recargar no se lo vuelve a poner encima si ya lo cerró).
        const ELEGIDO_VISTO = "sesion_elegido_visto_v1";
        // Un aviso de hace más de 15 minutos es de otra pregunta: no se pinta.
        const ELEGIDO_VIGENTE_MS = 15 * 60000;

        function nombreDeConectado(id) {
            const info = onlineStudents.get(id) || {};
            return info.full_name || info.email || "Alumno";
        }

        /* La historia de la clase: una fila por turno (clase_elegidos), al
           azar o por mano levantada, con cómo respondió. Son pocas por clase,
           así que se cuentan acá sin miedo al tope de mil. */
        let turnoActualId = null;        // la fila del turno en curso, para anotarle el resultado
        async function cargarTurnos() {
            if (!isTeacher || !currentOpenSessionId) { turnosEnLaClase = new Map(); turnosDeLaClase = null; pintarTurnos(); return; }
            const { data, error } = await sb.from("clase_elegidos").select("id, student_id, resultado, created_at")
                .eq("class_session_id", currentOpenSessionId).order("created_at");
            if (error) { console.error(error); return; }
            turnosEnLaClase = new Map();
            (data || []).forEach((f) => sumarTurno(f.student_id, f.resultado));
            turnosDeLaClase = currentOpenSessionId;
            // Al recargar con alguien en turno: su fila es la última suya sin anotar.
            if (elegidoActual && !turnoActualId) {
                const suya = (data || []).filter((f) => f.student_id === elegidoActual.id && !f.resultado).pop();
                turnoActualId = suya ? suya.id : null;
            }
            pintarTurnos();
        }

        function sumarTurno(id, resultado) {
            const t = turnosEnLaClase.get(id) || { veces: 0, bien: 0, casi: 0 };
            t.veces += 1;
            if (resultado === "bien") t.bien += 1;
            if (resultado === "casi") t.casi += 1;
            turnosEnLaClase.set(id, t);
        }

        function textoTurnos(t) {
            if (!t || !t.veces) return "todavía no";
            const partes = [];
            if (t.bien) partes.push(t.bien + " bien");
            if (t.casi) partes.push(t.casi + " casi");
            return (t.veces === 1 ? "1 vez" : t.veces + " veces") + (partes.length ? ": " + partes.join(", ") : "");
        }

        // Escrito, uno por renglón: los conectados (aunque tengan cero) y
        // quien ya pasó aunque se haya ido. Primero los que menos llevan.
        function pintarTurnos() {
            const lista = document.getElementById("elegidos-cuenta");
            if (!lista) return;
            const ids = new Set([...onlineStudents.keys(), ...turnosEnLaClase.keys()]);
            lista.innerHTML = "";
            const filas = [...ids].map((id) => ({ id, t: turnosEnLaClase.get(id), nombre: nombreDeConectado(id) }))
                .sort((a, b) => ((a.t && a.t.veces) || 0) - ((b.t && b.t.veces) || 0) || a.nombre.localeCompare(b.nombre));
            document.getElementById("elegidos-cuenta-caja").hidden = !filas.length;
            filas.forEach((f) => {
                const li = document.createElement("li");
                li.className = "flex items-center justify-between gap-2";
                const n = document.createElement("span");
                n.className = "text-brand-700 dark:text-brand-200 break-words";
                n.textContent = f.nombre;   // lo escribió una persona
                const v = document.createElement("span");
                v.className = "shrink-0 font-semibold text-brand-800 dark:text-white";
                v.textContent = textoTurnos(f.t);
                li.append(n, v);
                lista.appendChild(li);
            });
        }

        /* Darle el turno a alguien: la misma puerta para el sorteo y para la
           mano levantada. Queda en game_state.elegido (lo ve la clase) y en
           clase_elegidos (lo cuenta). */
        async function darTurno(id, origen) {
            const nombre = nombreDeConectado(id);
            // El nombre viaja con la elección: los demás alumnos lo ven (y al
            // recargar no dependen de que la presencia ya haya llegado).
            const elegido = { id, at: new Date().toISOString(), nombre, motivo: origen };
            const { error } = await sb.from("game_state").update({ elegido }).eq("id", myGameStateId);
            if (error) { console.error(error); setStatus("No se pudo avisarle: " + error.message); return false; }
            elegidoActual = elegido;
            document.getElementById("elegido-caja").hidden = false;
            document.getElementById("elegido-nombre").textContent = nombre;   // textContent: lo escribió una persona
            document.getElementById("elegido-titulo").textContent = origen === "mano" ? "Tiene la palabra:" : "Le toca responder a:";
            const { data, error: errTurno } = await sb.from("clase_elegidos")
                .insert({ class_session_id: currentOpenSessionId, student_id: id, origen }).select("id").single();
            if (errTurno) { console.error(errTurno); turnoActualId = null; }
            else { turnoActualId = data && data.id; sumarTurno(id, null); }
            pintarTurnos();
            return true;
        }

        async function elegirAlAzar() {
            const btn = document.getElementById("elegir-azar-btn");
            const conectados = [...onlineStudents.keys()];
            if (!conectados.length) { setStatus("No hay alumnos conectados para elegir."); return; }
            if (!currentOpenSessionId) { setStatus("Abre la clase primero: cada turno queda en su registro."); return; }
            if (turnosDeLaClase !== currentOpenSessionId) await cargarTurnos();
            const veces = new Map([...turnosEnLaClase].map(([k, t]) => [k, t.veces]));
            const id = PartidasClase.elegirConMenos(conectados, veces);
            const caja = document.getElementById("elegido-caja");
            const nombreEl = document.getElementById("elegido-nombre");
            caja.hidden = false;
            btn.disabled = true;
            /* Una ruleta corta con los nombres, salvo con «reducir movimiento».
               Mientras gira, el nombre no es región viva: se anuncia solo el final. */
            const reducir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (!reducir && conectados.length > 1) {
                nombreEl.setAttribute("aria-live", "off");
                for (let i = 0; i < 12; i++) {
                    nombreEl.textContent = nombreDeConectado(conectados[i % conectados.length]);
                    await new Promise((r) => setTimeout(r, 70 + i * 12));
                }
                nombreEl.setAttribute("aria-live", "polite");
            }
            const ok = await darTurno(id, "azar");
            btn.disabled = false;
            if (ok) setStatus("🎯 Le toca responder a " + nombreDeConectado(id) + ": ya le salió el aviso en su pantalla.");
        }

        /* La mano levantada, en el orden en que llegó: el profe le da la
           palabra y eso es un turno más (origen 'mano'), con su aviso. */
        async function darLaPalabra(id) {
            if (!currentOpenSessionId) { setStatus("Abre la clase primero: cada turno queda en su registro."); return; }
            if (turnosDeLaClase !== currentOpenSessionId) await cargarTurnos();
            lowerStudentHand(id);
            if (await darTurno(id, "mano")) setStatus("🗣️ " + nombreDeConectado(id) + " tiene la palabra.");
        }

        /* Terminar el turno, anotando cómo respondió ('bien', 'casi') o sin
           anotar (null). La nota va a la fila del turno; el aviso se quita. */
        async function terminarElegido(resultado) {
            if (resultado && elegidoActual) {
                if (!turnoActualId) await cargarTurnos();
                if (turnoActualId) {
                    const { error: errNota } = await sb.from("clase_elegidos").update({ resultado }).eq("id", turnoActualId);
                    if (errNota) { console.error(errNota); setStatus("No se pudo anotar: " + errNota.message); return; }
                    const t = turnosEnLaClase.get(elegidoActual.id);
                    if (t) t[resultado] += 1;
                }
            }
            const { error } = await sb.from("game_state").update({ elegido: null }).eq("id", myGameStateId);
            if (error) { console.error(error); setStatus("No se pudo quitar el aviso: " + error.message); return; }
            const quien = elegidoActual ? nombreDeConectado(elegidoActual.id) : "";
            elegidoActual = null;
            turnoActualId = null;
            document.getElementById("elegido-caja").hidden = true;
            pintarTurnos();
            if (resultado) setStatus("Anotado: " + quien + " respondió " + (resultado === "bien" ? "bien" : "casi") + ".");
        }

        if (document.getElementById("elegir-azar-btn")) {
            document.getElementById("elegir-azar-btn").addEventListener("click", elegirAlAzar);
            document.getElementById("elegido-otro-btn").addEventListener("click", elegirAlAzar);
            document.getElementById("elegido-bien-btn").addEventListener("click", () => terminarElegido("bien"));
            document.getElementById("elegido-casi-btn").addEventListener("click", () => terminarElegido("casi"));
            document.getElementById("elegido-listo-btn").addEventListener("click", () => terminarElegido(null));
            document.getElementById("elegido-preguntar-btn").addEventListener("click", preguntarleAlElegido);
            document.getElementById("elegido-anotar-btn").addEventListener("click", () => {
                if (elegidoActual) anotarDesde(elegidoActual.id, nombreDeConectado(elegidoActual.id));
            });
            document.getElementById("elegido-insignia-btn").addEventListener("click", () => {
                if (!elegidoActual) return;
                abrirTrofeosEnClase(elegidoActual.id, nombreDeConectado(elegidoActual.id));
                document.getElementById("trofeos-en-clase").scrollIntoView({ block: "nearest" });
            });
        }

        /* La pregunta dirigida: la posición del tablero, solo para quien tiene
           el turno. El profe mira cómo la resuelve en «Respuestas en el tablero». */
        async function preguntarleAlElegido() {
            if (!elegidoActual) return;
            const fen = board.fen();
            const motivo = motivoPosicionInvalida(fen);
            if (motivo) { setStatus(motivo); return; }
            const expectedPlies = Math.max(1, Math.min(6, parseInt(document.getElementById("question-plies-input").value, 10) || 1));
            const { data, error } = await crearPregunta(fen, expectedPlies, elegidoActual.id);
            if (error) { console.error(error); setStatus("No se pudo crear la pregunta: " + error.message); return; }
            setStatus("❓ Le preguntaste a " + nombreDeConectado(elegidoActual.id) + ": mira su tablero debajo del tuyo.");
            computeEngineAnswer(data.id, fen, expectedPlies);
        }

        /* ---------- Tiempo para pensar (game_state.pensar) ----------
           Una cuenta regresiva que ve toda la clase, sin abrir una pregunta. La
           pone el profe; la hora de arranque la pone la base, y lo que falta se
           calcula (PreguntaClase.estadoPensar). Se termina sola. */
        let pensarActual = null;
        let pensarDicho = "";

        function pintarPensar(pensar) {
            if (pensar !== undefined) pensarActual = pensar || null;
            const caja = document.getElementById("pensar-aviso-caja");
            if (!caja) return;
            const estado = PreguntaClase.estadoPensar(pensarActual);
            caja.hidden = !estado;
            const voz = document.getElementById("pensar-voz");
            if (!estado) { pensarDicho = ""; return; }
            const texto = (pensarActual.texto || "").trim();
            const que = document.getElementById("pensar-que");
            que.hidden = !texto;
            que.textContent = texto;   // lo escribió el profe: textContent
            document.getElementById("pensar-reloj").hidden = estado.termino;
            document.getElementById("pensar-reloj").textContent = PreguntaClase.reloj(estado.quedan);
            document.getElementById("pensar-fin").hidden = !estado.termino;
            document.getElementById("pensar-profe-acciones").classList.toggle("hidden", !isTeacher);
            document.getElementById("pensar-mas-btn").hidden = estado.termino;
            document.getElementById("pensar-terminar-btn").hidden = estado.termino;
            // Elegir a alguien tiene sentido cuando ya pensaron (y lo hay en la caja del sorteo).
            document.getElementById("pensar-elegir-btn").hidden = !estado.termino || !document.getElementById("elegir-azar-btn");
            // Lo que se dice en voz: al empezar, a los 10 segundos y al terminar.
            const clave = pensarActual.at + ":" + (estado.termino ? "fin" : estado.quedan <= 10 ? "10" : "inicio");
            if (clave !== pensarDicho) {
                const antes = pensarDicho;
                pensarDicho = clave;
                if (estado.termino) voz.textContent = "Se acabó el tiempo para pensar.";
                else if (estado.quedan <= 10 && antes) voz.textContent = "Quedan 10 segundos para pensar.";
                else if (!antes || !antes.startsWith(pensarActual.at)) {
                    voz.textContent = "Tiempo para pensar: " + PreguntaClase.textoDeTiempo(pensarActual.segundos) + "." + (texto ? " " + texto : "");
                }
            }
        }
        setInterval(() => { if (pensarActual) pintarPensar(); }, 1000);

        async function guardarPensar(pensar) {
            const { data, error } = await sb.from("game_state").update({ pensar }).eq("id", myGameStateId).select("pensar").single();
            if (error) { console.error(error); setStatus("No se pudo: " + error.message); return false; }
            // La base cambia la hora de arranque por la suya: se usa la que devuelve.
            pintarPensar(data && "pensar" in data ? data.pensar : pensar);
            return true;
        }

        if (document.getElementById("pensar-btn")) {
            const sel = document.getElementById("pensar-segundos");
            PreguntaClase.TIEMPOS_PENSAR.forEach((t) => {
                const o = document.createElement("option");
                o.value = String(t.segundos);
                o.textContent = t.texto;
                if (t.segundos === 60) o.selected = true;
                sel.appendChild(o);
            });
            document.getElementById("pensar-btn").addEventListener("click", async () => {
                const segundos = parseInt(sel.value, 10) || 60;
                const texto = document.getElementById("pensar-texto").value.trim().slice(0, 140);
                // Un «at» nuevo: la base lo cambia por su hora (ver la migración).
                if (await guardarPensar({ at: new Date().toISOString(), segundos, texto: texto || null })) {
                    setStatus("⏳ " + PreguntaClase.textoDeTiempo(segundos) + " para pensar: toda la clase ve la cuenta regresiva.");
                }
            });
            document.getElementById("pensar-mas-btn").addEventListener("click", () => {
                if (!pensarActual) return;
                // El mismo «at»: la base lo conserva y solo se alarga.
                guardarPensar(Object.assign({}, pensarActual, { segundos: Math.min(3600, pensarActual.segundos + PreguntaClase.PENSAR_SUMA) }));
            });
            document.getElementById("pensar-terminar-btn").addEventListener("click", () => guardarPensar(null));
            document.getElementById("pensar-elegir-btn").addEventListener("click", async () => {
                await guardarPensar(null);
                activateTeacherTab("alumnos");
                elegirAlAzar();
            });
        }

        /* Los demás ven para quién es la pregunta dirigida (el nombre viaja con
           el turno, en game_state.elegido). */
        function pintarPreguntaParaOtro() {
            const linea = document.getElementById("pregunta-para-otro");
            if (!linea || isTeacher) return;
            const q = currentQuestion;
            const para = q && !q.closed_at && q.para_alumno && q.para_alumno !== profile.id ? q.para_alumno : null;
            const antes = linea.hidden;
            linea.hidden = !para;
            if (!para) return;
            const nombre = elegidoActual && elegidoActual.id === para && elegidoActual.nombre ? elegidoActual.nombre : "un compañero";
            document.getElementById("pregunta-para-otro-nombre").textContent = nombre;   // lo escribió una persona
            if (antes && claseAcc) claseAcc.decir("Tu profe le hizo una pregunta a " + nombre + ".");
        }

        function pintarElegido(elegido) {
            elegidoActual = elegido || null;
            if (isTeacher) {
                // Al recargar, el profe vuelve a ver a quién había elegido.
                const caja = document.getElementById("elegido-caja");
                if (!caja) return;
                caja.hidden = !elegidoActual;
                if (elegidoActual) {
                    document.getElementById("elegido-nombre").textContent = nombreDeConectado(elegidoActual.id);
                    document.getElementById("elegido-titulo").textContent = elegidoActual.motivo === "mano" ? "Tiene la palabra:" : "Le toca responder a:";
                }
                return;
            }
            const overlay = document.getElementById("elegido-overlay");
            const chip = document.getElementById("elegido-chip");
            if (!overlay) return;
            pintarPreguntaParaOtro();
            const vigente = !!(elegidoActual && Date.now() - new Date(elegidoActual.at).getTime() < ELEGIDO_VIGENTE_MS);
            const soyYo = vigente && elegidoActual.id === profile.id;
            /* Los demás ven a quién eligieron, escrito y sin taparles nada: el
               aviso grande es solo para quien tiene que responder. */
            const otro = document.getElementById("elegido-otro");
            if (otro) {
                const nombre = vigente && !soyYo ? (elegidoActual.nombre || nombreDeConectado(elegidoActual.id)) : "";
                const antes = otro.dataset.at || "";
                const porMano = !!(elegidoActual && elegidoActual.motivo === "mano");
                document.getElementById("elegido-otro-antes").textContent = porMano ? "Tu profe le dio la palabra a " : "Tu profe eligió a ";
                document.getElementById("elegido-otro-despues").textContent = porMano ? "." : " para responder.";
                document.getElementById("elegido-otro-nombre").textContent = nombre;   // lo escribió una persona
                otro.hidden = !nombre;
                otro.dataset.at = nombre ? elegidoActual.at : "";
                if (nombre && antes !== elegidoActual.at && claseAcc) {
                    claseAcc.decir(porMano ? "Tu profe le dio la palabra a " + nombre + "." : "Tu profe eligió a " + nombre + " para responder.");
                }
            }
            let visto = null;
            try { visto = sessionStorage.getItem(ELEGIDO_VISTO); } catch (e) {}
            const mostrarGrande = soyYo && visto !== elegidoActual.at;
            const estabaAbierto = !overlay.classList.contains("hidden");
            overlay.classList.toggle("hidden", !mostrarGrande);
            chip.hidden = !soyYo || mostrarGrande;
            // Por la mano levantada no lo «eligieron»: le dieron la palabra que pidió.
            const porManoYo = soyYo && elegidoActual.motivo === "mano";
            document.getElementById("elegido-overlay-titulo").textContent = porManoYo ? "¡Tienes la palabra!" : "¡Te eligieron para responder!";
            document.getElementById("elegido-overlay-texto").textContent = porManoYo
                ? "Tu profe vio tu mano levantada. ¡Adelante!" : "Tu profe te va a hacer una pregunta. ¡Tú puedes!";
            chip.textContent = porManoYo ? "🗣️ Tienes la palabra." : "🎯 Te toca responder: tu profe te eligió.";
            if (mostrarGrande && !estabaAbierto) {
                enfocarCuandoSeVea(document.getElementById("elegido-overlay-ok"));
                if (claseAcc) claseAcc.decir(porManoYo ? "¡Tienes la palabra! Tu profe vio tu mano levantada."
                    : "¡Te eligieron para responder! Tu profe te va a hacer una pregunta.");
            }
        }

        if (document.getElementById("elegido-overlay-ok")) {
            document.getElementById("elegido-overlay-ok").addEventListener("click", () => {
                if (elegidoActual) { try { sessionStorage.setItem(ELEGIDO_VISTO, elegidoActual.at); } catch (e) {} }
                pintarElegido(elegidoActual);
            });
        }

        function subscribeQuestions() {
            sb.channel("questions-changes:" + boardOwnerId)
                .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: "created_by=eq." + boardOwnerId }, () => loadCurrentQuestion())
                .subscribe();
            if (isTeacher) {
                sb.channel("question-answers-changes")
                    .on("postgres_changes", { event: "*", schema: "public", table: "question_answers" }, () => {
                        if (currentQuestion) loadAnswersFor(currentQuestion.id);
                        avisarResultadosALaClase();
                        // Cerrando la clase: la pregunta de salida cambia con cada respuesta.
                        if (!document.getElementById("clase-cerrar-campos").classList.contains("hidden")) refrescarSalida();
                    })
                    .subscribe();
            } else {
                // Feedback privado: solo llegan eventos de la PROPIA fila del alumno (RLS ya
                // lo garantiza), así que marcar ✅/❌ nunca lo ven los demás alumnos.
                // El profesor le dio una insignia: se celebra con el mismo aviso
                // flotante de las respuestas, en dorado, y con el motivo.
                sb.channel("mis-insignias")
                    .on("postgres_changes", { event: "INSERT", schema: "public", table: "insignias", filter: "alumno_id=eq." + profile.id }, async (payload) => {
                        cargarMisTrofeos();
                        const fila = payload.new || {};
                        const tipos = await Trofeos.tiposInsignias(sb);
                        const tipo = tipos.find((x) => x.tipo === fila.tipo);
                        if (!tipo) return;
                        mostrarInsigniaGanada(tipo, fila.motivo);
                    })
                    .subscribe();
                // El profesor sumó o quitó trofeos a mano.
                sb.channel("mis-trofeos")
                    .on("postgres_changes", { event: "INSERT", schema: "public", table: "trofeos_ajustes", filter: "alumno_id=eq." + profile.id }, (payload) => {
                        cargarMisTrofeos();
                        const n = payload.new && payload.new.cantidad;
                        if (n) setStatus((n > 0 ? "🏆 Tu profesor te sumó " : "Tu profesor te quitó ") + Trofeos.texto(Math.abs(n))
                            + (payload.new.motivo ? ": " + payload.new.motivo : "."));
                    })
                    .subscribe();
                sb.channel("my-answer-feedback")
                    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "question_answers", filter: "student_id=eq." + profile.id }, (payload) => {
                        // Cualquier calificación, también de una pregunta vieja, mueve los trofeos.
                        cargarMisTrofeos();
                        if (currentQuestion && payload.new.question_id === currentQuestion.id) {
                            myAnswer = payload.new;
                            updateAnswerFeedbackUI();
                            maybeShowGradingToast(payload.new);
                        }
                    })
                    .subscribe();
            }
        }

        async function loadCurrentQuestion() {
            const { data, error } = await sb.from("questions").select("*").eq("created_by", boardOwnerId).order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (error) { console.error(error); return; }
            const antes = currentQuestion;
            currentQuestion = data || null;
            pintarTiempoDeLaPregunta();
            if (isTeacher) { renderTeacherQuestionPanel(); return; }
            /* La MISMA pregunta, sin cerrarse: solo cambió si la clase ve los
               resultados (o llegó una respuesta nueva y el profe los refrescó).
               Volver a armar la tarjeta le borraría al alumno las jugadas que lleva. */
            if (antes && currentQuestion && antes.id === currentQuestion.id && !antes.closed_at === !currentQuestion.closed_at
                && !document.getElementById("question-card").classList.contains("hidden")) {
                await pintarResultadosAlumno();
                return;
            }
            await renderStudentQuestionCard();
        }

        function renderTeacherQuestionPanel() {
            seguirRespuestasEnCurso();
            const activeEl = document.getElementById("active-question");
            if (!currentQuestion || currentQuestion.closed_at) {
                activeEl.classList.add("hidden");
                return;
            }
            activeEl.classList.remove("hidden");
            // El motor solo tiene algo que decir de una jugada, no de una opinión.
            const esOp = PreguntaClase.esDeOpciones(currentQuestion);
            document.getElementById("engine-reference-answer").hidden = esOp;
            if (!esOp) {
                renderEngineReferenceAnswer(null);
                loadEngineAnswerFor(currentQuestion.id);
            }
            loadAnswersFor(currentQuestion.id);
            pintarTiempoDeLaPregunta();
        }

        async function loadAnswersFor(questionId) {
            const { data, error } = await sb.from("question_answers")
                .select("*, profiles(full_name, email)")
                .eq("question_id", questionId)
                .order("created_at");
            if (error) { console.error(error); return; }
            renderAnswersList(data || []);
            pintarResultadosProfe();
            if (currentQuestion && currentQuestion.id === questionId) {
                respuestasFinales = new Map((data || []).map((a) => [a.student_id, a]));
                pintarTablerosDePregunta();
            }
        }

        /* ---------- Respuestas en el tablero (solo profesor) ----------
           Como los tableros de Practicar: uno por alumno, con lo que va jugando
           en la pregunta mientras lo piensa (respuestas_en_curso) y, cuando la
           manda, su respuesta (question_answers), con ✅/❌ ahí mismo. Una
           pregunta dirigida muestra solo el tablero de esa persona. Las de
           opciones no se contestan moviendo: no tienen tableros. */
        const tablerosPregunta = {};          // student_id → la tarjeta con su tablero
        let tablerosDePregunta = null;        // de qué pregunta son las tarjetas
        const enCursoPorAlumno = new Map();   // student_id → fila de respuestas_en_curso
        let respuestasFinales = new Map();    // student_id → fila de question_answers
        let canalEnCurso = null;
        let preguntaSeguida = null;

        function preguntaConTableros() {
            return isTeacher && currentQuestion && !currentQuestion.closed_at && !PreguntaClase.esDeOpciones(currentQuestion)
                ? currentQuestion : null;
        }

        async function seguirRespuestasEnCurso() {
            const q = preguntaConTableros();
            const id = q ? q.id : null;
            if (id === preguntaSeguida) { pintarTablerosDePregunta(); return; }
            preguntaSeguida = id;
            if (canalEnCurso) { sb.removeChannel(canalEnCurso); canalEnCurso = null; }
            enCursoPorAlumno.clear();
            respuestasFinales = new Map();
            pintarTablerosDePregunta();
            if (!id) return;
            // Filtrado por la pregunta: solo llegan las jugadas de ESTA (ver
            // «Realtime escucha solo lo que la pantalla muestra»).
            canalEnCurso = sb.channel("respuestas-en-curso:" + id)
                .on("postgres_changes", { event: "*", schema: "public", table: "respuestas_en_curso", filter: "question_id=eq." + id }, (payload) => {
                    const fila = payload.new;
                    if (!fila || fila.question_id !== preguntaSeguida) return;
                    enCursoPorAlumno.set(fila.student_id, fila);
                    pintarTablerosDePregunta();
                })
                .subscribe();
            const { data, error } = await sb.from("respuestas_en_curso").select("*").eq("question_id", id);
            if (error) { console.error(error); return; }
            if (preguntaSeguida !== id) return;   // cambió la pregunta mientras llegaba
            (data || []).forEach((f) => { if (!enCursoPorAlumno.has(f.student_id)) enCursoPorAlumno.set(f.student_id, f); });
            pintarTablerosDePregunta();
        }

        function nombreEnPregunta(id) {
            const fin = respuestasFinales.get(id);
            if (fin && fin.profiles && (fin.profiles.full_name || fin.profiles.email)) return fin.profiles.full_name || fin.profiles.email;
            if (onlineStudents.has(id)) return nombreDeConectado(id);
            if (elegidoActual && elegidoActual.id === id && elegidoActual.nombre) return elegidoActual.nombre;
            return "Alumno";
        }

        function pintarTablerosDePregunta() {
            const seccion = document.getElementById("question-boards-section");
            if (!seccion) return;
            const grid = document.getElementById("question-boards-grid");
            const q = preguntaConTableros();
            if (!q || tablerosDePregunta !== q.id) {
                grid.innerHTML = "";
                Object.keys(tablerosPregunta).forEach((k) => delete tablerosPregunta[k]);
                tablerosDePregunta = q ? q.id : null;
            }
            seccion.hidden = !q;
            if (!q) return;
            grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(min(190px, 100%), 190px))";
            grid.style.justifyContent = "center";
            const ids = q.para_alumno ? [q.para_alumno]
                : [...new Set([...onlineStudents.keys(), ...enCursoPorAlumno.keys(), ...respuestasFinales.keys()])];
            Object.keys(tablerosPregunta).forEach((k) => {
                if (!ids.includes(k)) { tablerosPregunta[k].el.remove(); delete tablerosPregunta[k]; }
            });
            ids.forEach((id) => pintarTableroDeRespuesta(q, id));
            const hint = document.getElementById("question-boards-hint");
            if (q.para_alumno) hint.textContent = "Pregunta solo para " + nombreEnPregunta(q.para_alumno) + ".";
            else if (!ids.length) hint.textContent = "Todavía no hay alumnos conectados.";
            else hint.textContent = "Respondieron " + ids.filter((id) => respuestasFinales.has(id)).length + " de " + ids.length + ".";
        }

        function pintarTableroDeRespuesta(q, id) {
            let t = tablerosPregunta[id];
            if (!t) {
                const wrap = document.createElement("div");
                wrap.className = "bg-white dark:bg-brand-900 rounded-xl shadow-md p-3";
                wrap.dataset.alumno = id;
                wrap.innerHTML =
                    '<p class="respuesta-mini-nombre text-xs font-semibold text-brand-700 dark:text-brand-200 truncate mb-1"></p>' +
                    '<div class="respuesta-mini-tablero grid grid-cols-8 grid-rows-[repeat(8,minmax(0,1fr))] w-full aspect-square rounded-lg overflow-hidden shadow border-2 border-brand-700 select-none mb-2"></div>' +
                    '<p class="respuesta-mini-estado text-[11px] text-brand-450 dark:text-brand-350 break-words" aria-live="polite"></p>' +
                    '<div class="respuesta-mini-calificar hidden flex gap-1 mt-1.5">' +
                        '<button type="button" data-nota="bien" class="flex-1 text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors"><span aria-hidden="true">✅ </span>Correcta</button>' +
                        '<button type="button" data-nota="mal" class="flex-1 text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors"><span aria-hidden="true">❌ </span>A revisar</button>' +
                    "</div>" +
                    // Pasarla al tablero de todos, como una variante: la partida no se toca.
                    '<button type="button" class="respuesta-mini-mostrar hidden mt-1.5 w-full text-xs font-semibold px-2 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors"><span aria-hidden="true">📺 </span>Mostrar a la clase</button>' +
                    '<button type="button" class="respuesta-mini-anotar mt-1.5 w-full text-xs font-semibold px-2 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors"><span aria-hidden="true">📝 </span>Anotar en su bitácora</button>';
                document.getElementById("question-boards-grid").appendChild(wrap);
                t = {
                    el: wrap,
                    nombreEl: wrap.querySelector(".respuesta-mini-nombre"),
                    estadoEl: wrap.querySelector(".respuesta-mini-estado"),
                    calificarEl: wrap.querySelector(".respuesta-mini-calificar"),
                    mostrarEl: wrap.querySelector(".respuesta-mini-mostrar"),
                    board: new ClasesBoard(wrap.querySelector(".respuesta-mini-tablero"), { interactive: false, allowArrows: false, compact: true }),
                    clave: null,
                };
                wrap.querySelectorAll("[data-nota]").forEach((btn) => btn.addEventListener("click", async () => {
                    const fin = respuestasFinales.get(id);
                    if (!fin) return;
                    const valor = btn.dataset.nota === "bien";
                    await setAnswerCorrect(fin.id, valor);
                    fin.is_correct = valor;
                    pintarTablerosDePregunta();
                }));
                wrap.querySelector(".respuesta-mini-mostrar").addEventListener("click", () => mostrarRespuestaALaClase(id));
                wrap.querySelector(".respuesta-mini-anotar").addEventListener("click", () =>
                    anotarDesde(id, nombreEnPregunta(id), { fen: t.board.fen(), texto: "Con la posición de su respuesta" }));
                tablerosPregunta[id] = t;
            }
            const nombre = nombreEnPregunta(id);
            t.mostrarEl.setAttribute("aria-label", "Mostrar a la clase la respuesta de " + nombre);
            t.el.querySelector(".respuesta-mini-anotar").setAttribute("aria-label", "Anotar en la bitácora de " + nombre);
            t.nombreEl.textContent = nombre;   // textContent: lo escribió una persona
            t.nombreEl.title = nombre;
            t.calificarEl.querySelectorAll("[data-nota]").forEach((btn) =>
                btn.setAttribute("aria-label", (btn.dataset.nota === "bien" ? "Marcar correcta la respuesta de " : "Marcar a revisar la respuesta de ") + nombre));
            const fin = respuestasFinales.get(id);
            const curso = enCursoPorAlumno.get(id);
            const moves = (fin ? fin.moves : curso ? curso.moves : null) || [];
            const clave = q.id + "|" + JSON.stringify(moves);
            if (t.clave !== clave) {
                t.board.setFlipped(q.fen.split(" ")[1] === "b");
                t.board.loadMoves(moves, q.fen);
                t.clave = clave;
            }
            // El alumno mueve primero y el motor contesta entre jugada y jugada.
            const suyas = Math.ceil(moves.length / 2);
            const total = q.expected_plies || 1;
            if (fin) {
                t.estadoEl.textContent = "Respondió: " + (moves.join(" ") || "—")
                    + (fin.is_correct === true ? " · ✅ correcta" : fin.is_correct === false ? " · ❌ a revisar" : " · sin calificar");
            } else if (moves.length) {
                t.estadoEl.textContent = "Pensando… lleva " + suyas + " de " + total + (total === 1 ? " jugada" : " jugadas") + ": " + moves.join(" ");
            } else {
                t.estadoEl.textContent = "Todavía no mueve.";
            }
            t.calificarEl.classList.toggle("hidden", !fin);
            t.mostrarEl.classList.toggle("hidden", !(fin && moves.length));
            t.calificarEl.querySelectorAll("[data-nota]").forEach((btn) => {
                const marcado = !!fin && fin.is_correct === (btn.dataset.nota === "bien");
                btn.setAttribute("aria-pressed", marcado ? "true" : "false");
                btn.classList.toggle("ring-2", marcado);
                btn.classList.toggle("ring-accent-500", marcado);
            });
        }

        /* ---------- Mostrar la respuesta de un alumno a toda la clase ----------
           Va como una VARIANTE que mira el profe (game_state.vista): la partida
           de la clase no se toca, y al volver al final todos la ven de nuevo.
           La vista lleva además de quién es la respuesta ({nombre} o null, si el
           profe no quiere decirlo), y eso es lo que lee la clase. */
        function jugadaDeLaPosicion(fen) {
            // Cuántas jugadas de la partida hay hasta la posición de la pregunta
            // (-1 si ya no está en ella). Se comparan pieza, turno, enroques y al paso.
            const clave = (f) => String(f || "").split(" ").slice(0, 4).join(" ");
            const buscada = clave(fen);
            const g = board.startFen ? new Chess(board.startFen) : new Chess();
            const principal = board.moves();
            if (clave(g.fen()) === buscada) return 0;
            for (let i = 0; i < principal.length; i++) {
                if (!g.move(principal[i])) return -1;
                if (clave(g.fen()) === buscada) return i + 1;
            }
            return -1;
        }

        async function mostrarRespuestaALaClase(id) {
            const q = preguntaConTableros();
            const fin = respuestasFinales.get(id);
            if (!q || !fin || !(fin.moves || []).length) return;
            let k = jugadaDeLaPosicion(q.fen);
            if (k === -1) {
                // Se cambió la posición después de preguntar: hay que mandarla de nuevo.
                const seguir = await Avisos.confirmar("El tablero de la clase ya no tiene la posición de la pregunta. Para mostrar la respuesta hay que volver a mandarla, y la partida que está ahora se reemplaza.",
                    { titulo: "¿Volver a la posición de la pregunta?", aceptar: "Mandar la posición y mostrarla" });
                if (!seguir || !(await aplicarPosicionEnClase(q.fen))) return;
                k = 0;
            }
            const vista = { path: board.moves().slice(0, k).concat(fin.moves), parent: null, root: k };
            board.showView(vista);
            renderMoveList();
            const conNombre = document.getElementById("mostrar-con-nombre").checked;
            const nombre = nombreEnPregunta(id);
            // La vista local no lleva el autor: así transmitirVista() no la vuelve a mandar sin él.
            ultimaVistaEnviada = JSON.stringify(board.currentView());
            const { error } = await sb.from("game_state").update({ vista: Object.assign({}, vista, { respuesta: { nombre: conNombre ? nombre : null } }) })
                .eq("id", myGameStateId);
            if (error) { console.error(error); ultimaVistaEnviada = null; setStatus("No se pudo mostrar: " + error.message); return; }
            setStatus("📺 La clase ve la respuesta de " + nombre + (conNombre ? ", con su nombre." : ", sin su nombre.")
                + " Vuelve al final de la partida para seguir.");
        }

        function renderAnswersList(answers) {
            const listEl = document.getElementById("answers-list");
            if (!answers.length) {
                listEl.innerHTML = '<li class="text-brand-450 dark:text-brand-350">Todavía nadie respondió…</li>';
                return;
            }
            listEl.innerHTML = "";
            for (const a of answers) {
                // Nombre en su propia línea (a todo el ancho, sin truncar) y la jugada con los
                // botones de calificar en la línea de abajo: antes iba todo en una sola línea
                // con "truncate", y un nombre largo ("Daniel Campos Morales") se comía la
                // jugada entera o quedaba cortado a la mitad — ver captura del profesor.
                const li = document.createElement("li");
                li.className = "border-b border-brand-50 dark:border-brand-800/60 last:border-0 pb-2";
                const nameEl = document.createElement("p");
                nameEl.className = "text-brand-700 dark:text-brand-200 font-medium break-words";
                const displayName = (a.profiles && (a.profiles.full_name || a.profiles.email)) || "Alumno";
                nameEl.textContent = displayName; // textContent: nunca innerHTML con datos de otros usuarios
                const row = document.createElement("div");
                row.className = "flex items-center justify-between gap-2 mt-0.5";
                const movesEl = document.createElement("span");
                movesEl.className = "text-brand-500 dark:text-brand-300 font-mono text-xs break-words";
                movesEl.textContent = PreguntaClase.esDeOpciones(currentQuestion)
                    ? (a.opcion != null ? PreguntaClase.textoDeOpcion(currentQuestion, a.opcion) : "—")
                    : (a.moves || []).join(" ") || "—";
                const actions = document.createElement("span");
                actions.className = "flex items-center gap-1 shrink-0";
                const correctBtn = document.createElement("button");
                correctBtn.type = "button";
                correctBtn.textContent = "✅";
                correctBtn.title = "Marcar correcta (el alumno lo ve solo él, en privado)";
                correctBtn.className = "px-1.5 py-0.5 rounded transition-colors " + (a.is_correct === true ? "bg-green-500/30" : "hover:bg-brand-100 dark:hover:bg-brand-800");
                correctBtn.addEventListener("click", () => setAnswerCorrect(a.id, true));
                const wrongBtn = document.createElement("button");
                wrongBtn.type = "button";
                wrongBtn.textContent = "❌";
                wrongBtn.title = "Marcar a revisar (el alumno lo ve solo él, en privado)";
                wrongBtn.className = "px-1.5 py-0.5 rounded transition-colors " + (a.is_correct === false ? "bg-red-500/30" : "hover:bg-brand-100 dark:hover:bg-brand-800");
                wrongBtn.addEventListener("click", () => setAnswerCorrect(a.id, false));
                actions.appendChild(correctBtn);
                actions.appendChild(wrongBtn);
                row.appendChild(movesEl);
                row.appendChild(actions);
                li.appendChild(nameEl);
                li.appendChild(row);
                listEl.appendChild(li);
            }
        }

        async function setAnswerCorrect(answerId, value) {
            const { error } = await sb.from("question_answers").update({ is_correct: value }).eq("id", answerId);
            if (error) console.error(error);
            // Si está cerrando la clase, el resumen de arriba tiene que contar esta nota.
            if (!document.getElementById("clase-cerrar-campos").classList.contains("hidden")) {
                pintarResumenDeLaClase(currentOpenSessionId);
                refrescarSalida();
            }
        }

        // ---------- Respuesta de referencia del motor (privada, solo el profesor) ----------
        // opts.computing = true cuando se acaba de lanzar un cálculo (le da unos segundos de
        // margen antes de ofrecer "Reintentar", para no mostrar ese botón como si ya hubiera
        // fallado cuando en realidad Stockfish sigue pensando). Sin ese flag (por ejemplo al
        // abrir el panel de una pregunta que ya estaba activa, o cuando el cálculo realmente
        // falló) el botón aparece de una — antes esto se quedaba mostrando "Calculando…" para
        // siempre sin ninguna forma de reintentar, que es justo el "el bot no contesta" que
        // reportó el profesor al asignar una posición editada.
        function renderEngineReferenceAnswer(answer, opts) {
            const el = document.getElementById("engine-reference-answer");
            const retryBtn = document.getElementById("engine-reference-retry-btn");
            if (!el) return;
            if (!answer) {
                // "Calculando…" y "no se pudo calcular" mostraban el MISMO texto — la única
                // diferencia era un botón chico que aparecía debajo, fácil de no notar en medio
                // de una clase. Para el profesor eso se veía exactamente igual de trabado antes
                // y después de que el cálculo fallara, aunque el botón de reintentar sí
                // funcionara por detrás. Ahora el texto también cambia, para que quede claro
                // que ya falló y que el botón de abajo es la salida, no un adorno.
                const computing = !!(opts && opts.computing);
                el.textContent = computing
                    ? "Calculando la mejor respuesta del motor…"
                    : "El motor no pudo calcular la respuesta — toca \"Reintentar\" para volver a intentarlo.";
                if (retryBtn) retryBtn.classList.toggle("hidden", computing);
                return;
            }
            const scoreText = answer.score.type === "mate"
                ? "mate en " + Math.abs(answer.score.value)
                : (answer.score.value >= 0 ? "+" : "") + (answer.score.value / 100).toFixed(1);
            el.textContent = "Mejor respuesta del motor: " + answer.moves.join(" ") + " (" + scoreText + ")";
            if (retryBtn) retryBtn.classList.add("hidden");
        }

        async function loadEngineAnswerFor(questionId) {
            const { data } = await sb.from("question_engine_answers").select("answer").eq("question_id", questionId).maybeSingle();
            renderEngineReferenceAnswer(data ? data.answer : null);
        }

        async function computeEngineAnswer(questionId, fen, expectedPlies) {
            if (typeof ClasesEngine === "undefined") return;
            computingAnswerFor = questionId;
            if (currentQuestion && currentQuestion.id === questionId) renderEngineReferenceAnswer(null, { computing: true });
            try {
                // "Su mejor nivel": una sola línea, con más tiempo de cálculo que el panel de
                // análisis normal, ya que aquí se hace una sola vez por pregunta.
                // expectedPlies es cuántas veces mueve EL ALUMNO (el motor responde entre cada
                // una, menos después de la última): la línea de referencia tiene entonces
                // 2*expectedPlies-1 medias-jugadas en total (alumno, motor, alumno, motor…,
                // alumno), no expectedPlies — así la comparación es contra la MISMA cantidad de
                // jugadas que el alumno en verdad hace.
                const totalPlies = expectedPlies * 2 - 1;
                const results = await ClasesEngine.analyze(fen, 1, 4000);
                if (computingAnswerFor === questionId) computingAnswerFor = null;
                if (!results.length) {
                    // El motor no encontró nada (posición editada rara, o el Worker se cayó y
                    // se está recuperando — ver js/shared-engine.js): antes esto se quedaba en
                    // "Calculando…" sin salida; ahora se muestra el botón de reintentar.
                    if (currentQuestion && currentQuestion.id === questionId) renderEngineReferenceAnswer(null);
                    return;
                }
                const sans = ClasesEngine.pvToSan(fen, results[0].pvUci, totalPlies);
                const answer = { moves: sans, score: { type: results[0].type, value: results[0].value } };
                // Sigue siendo insert (no upsert): la política RLS de esta tabla solo permite
                // INSERT al profesor, no UPDATE (ver auditoría de RLS), y el botón de
                // reintentar ya evita pedir un segundo cálculo mientras el primero sigue en
                // curso — así que en el uso normal nunca hay una fila previa con la que chocar.
                const { error: saveError } = await sb.from("question_engine_answers").insert({ question_id: questionId, answer });
                if (saveError) { console.error(saveError); if (currentQuestion && currentQuestion.id === questionId) renderEngineReferenceAnswer(null); return; }
                if (currentQuestion && currentQuestion.id === questionId) renderEngineReferenceAnswer(answer);
            } catch (e) {
                console.error(e);
                if (computingAnswerFor === questionId) computingAnswerFor = null;
                if (currentQuestion && currentQuestion.id === questionId) renderEngineReferenceAnswer(null);
            }
        }

        document.getElementById("engine-reference-retry-btn").addEventListener("click", () => {
            if (!currentQuestion || currentQuestion.closed_at) return;
            if (computingAnswerFor === currentQuestion.id) return; // ya hay un cálculo en curso para esta pregunta
            computeEngineAnswer(currentQuestion.id, currentQuestion.fen, currentQuestion.expected_plies);
        });

        document.getElementById("ask-question-btn").addEventListener("click", async () => {
            const expectedPlies = Math.max(1, Math.min(6, parseInt(document.getElementById("question-plies-input").value, 10) || 1));
            const fen = board.fen();
            // A diferencia de "Aplicar posición", este botón no pasa por
            // aplicarPosicionEnClase() (no toca game_state: la pregunta es sobre la
            // posición YA visible, no una nueva) — así que si el tablero se quedó a
            // mitad de una edición (✏️ Armar posición sin aplicar ni cancelar), board.fen()
            // puede ser justo una de las posiciones que rompen al motor para el resto de
            // la sesión (ver js/shared-engine.js). Se valida acá con la misma regla.
            const motivo = motivoPosicionInvalida(fen);
            if (motivo) { setStatus(motivo); return; }
            const { data, error } = await crearPregunta(fen, expectedPlies);
            if (error) { console.error(error); setStatus("No se pudo crear la pregunta: " + error.message); return; }
            setStatus("Pregunta enviada a la clase.");
            computeEngineAnswer(data.id, fen, expectedPlies); // en segundo plano, no bloquea la pregunta
        });

        document.getElementById("close-question-btn").addEventListener("click", async () => {
            if (!currentQuestion) return;
            await sb.from("questions").update({ closed_at: new Date().toISOString() }).eq("id", currentQuestion.id);
        });

        // ---------- Táctica por tema (cascada grupo → tema → dificultad → ejercicio) ----------
        // Reutiliza la misma base de datos de Entrenamiento (entreno/data/temas.json: 74 temas
        // de lichess.org/training/themes, ~3600 ejercicios verificados con python-chess) para
        // que el profesor pueda elegir un ejercicio concreto y preguntárselo a la clase con un
        // clic, sin salir de la sesión en vivo — "Preguntar" hace exactamente lo mismo que el
        // botón de la pestaña Preguntar (transmite la posición y crea la pregunta), solo que
        // la posición viene de esta base en vez del tablero armado a mano.
        let tacticsData = null; // { groups, themes: {key: [puzzleId,...]}, puzzles: {id: {fen,solution,rating,mate,...}} }
        let tacticsLoadPromise = null;
        let tacticsView = { level: "groups" }; // groups | themes | difficulty | exercises

        function ensureTacticsLoaded() {
            if (tacticsData || tacticsLoadPromise) return tacticsLoadPromise;
            tacticsLoadPromise = fetch("entreno/data/temas.json")
                .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then((data) => { tacticsData = data; renderTacticsView(); })
                .catch((e) => {
                    console.error(e);
                    tacticsLoadPromise = null;
                    document.getElementById("tactics-body").innerHTML =
                        '<p class="text-sm text-red-500 dark:text-red-400">No se pudo cargar la base de ejercicios. Recarga la página e inténtalo de nuevo.</p>';
                });
            return tacticsLoadPromise;
        }

        const TACTICS_DIFF_LABELS = ["🟢 Fácil", "🟡 Media", "🔴 Difícil"];

        // Cada tema ya viene ordenado de fácil a difícil por rating (ver
        // entreno/data/construir_temas.py) — repartirlo en tercios da tres tandas de
        // dificultad creciente sin tener que volver a ordenar nada aquí.
        function tacticsThemeBuckets(themeKey) {
            const ids = tacticsData.themes[themeKey] || [];
            const third = Math.ceil(ids.length / 3) || 1;
            return [ids.slice(0, third), ids.slice(third, third * 2), ids.slice(third * 2)].filter((b) => b.length);
        }

        function tacticsBackBtn(label, onClick) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline";
            btn.textContent = label;
            btn.addEventListener("click", onClick);
            return btn;
        }

        function renderTacticsView() {
            const body = document.getElementById("tactics-body");
            if (!tacticsData) { body.innerHTML = '<p class="text-sm text-brand-450 dark:text-brand-350">Cargando temas…</p>'; return; }
            body.innerHTML = "";
            // La cascada repinta el cuerpo entero en cada paso: las filas de la vista
            // anterior ya no están en la página.
            vistaPreviaTactica.reiniciar();

            if (tacticsView.level === "themes" || tacticsView.level === "difficulty" || tacticsView.level === "exercises") {
                const group = tacticsData.groups.find((g) => g.id === tacticsView.groupId);
                if (tacticsView.level === "themes") {
                    body.appendChild(tacticsBackBtn("‹ Grupos", () => { tacticsView = { level: "groups" }; renderTacticsView(); }));
                } else if (tacticsView.level === "difficulty") {
                    body.appendChild(tacticsBackBtn("‹ " + (group ? group.title : "Temas"), () => { tacticsView = { level: "themes", groupId: tacticsView.groupId }; renderTacticsView(); }));
                } else {
                    body.appendChild(tacticsBackBtn("‹ " + tacticsView.themeName, () => { tacticsView = Object.assign({}, tacticsView, { level: "difficulty" }); renderTacticsView(); }));
                }
            }

            if (tacticsView.level === "groups") {
                const list = document.createElement("div");
                list.className = "space-y-1.5";
                tacticsData.groups.forEach((group) => {
                    const n = group.themes.filter((t) => (tacticsData.themes[t.key] || []).length).length;
                    if (!n) return; // grupo sin ningún tema con ejercicios en la base local
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "w-full text-left text-sm font-semibold px-3 py-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-white flex items-center justify-between gap-2 transition-colors";
                    btn.innerHTML = "<span>" + group.title + "</span><span class=\"text-brand-450 dark:text-brand-350 font-normal shrink-0\">" + n + (n === 1 ? " tema ›" : " temas ›") + "</span>";
                    btn.addEventListener("click", () => { tacticsView = { level: "themes", groupId: group.id }; renderTacticsView(); });
                    list.appendChild(btn);
                });
                body.appendChild(list);
                return;
            }

            if (tacticsView.level === "themes") {
                const group = tacticsData.groups.find((g) => g.id === tacticsView.groupId);
                const title = document.createElement("p");
                title.className = "font-semibold text-brand-800 dark:text-white text-sm mt-2 mb-2";
                title.textContent = group ? group.title : "";
                body.appendChild(title);
                const list = document.createElement("div");
                list.className = "space-y-1.5";
                (group ? group.themes : []).forEach((theme) => {
                    const available = (tacticsData.themes[theme.key] || []).length;
                    if (!available) return;
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "w-full text-left text-sm px-3 py-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 dark:bg-brand-800 dark:hover:bg-brand-700 transition-colors";
                    btn.innerHTML = '<span class="font-semibold text-brand-800 dark:text-white">' + theme.name + "</span>" +
                        '<span class="block text-xs text-brand-450 dark:text-brand-350 mt-0.5">' + theme.desc + "</span>" +
                        '<span class="block text-xs text-accent-700 dark:text-accent-400 mt-1">' + available + " ejercicios ›</span>";
                    btn.addEventListener("click", () => { tacticsView = { level: "difficulty", groupId: group.id, themeKey: theme.key, themeName: theme.name }; renderTacticsView(); });
                    list.appendChild(btn);
                });
                body.appendChild(list);
                return;
            }

            if (tacticsView.level === "difficulty") {
                const title = document.createElement("p");
                title.className = "font-semibold text-brand-800 dark:text-white text-sm mt-2 mb-2";
                title.textContent = tacticsView.themeName;
                body.appendChild(title);
                const list = document.createElement("div");
                list.className = "space-y-1.5";
                tacticsThemeBuckets(tacticsView.themeKey).forEach((ids, i) => {
                    const ratings = ids.map((id) => tacticsData.puzzles[id].rating);
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "w-full text-left text-sm font-semibold px-3 py-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-white flex items-center justify-between gap-2 transition-colors";
                    btn.innerHTML = "<span>" + TACTICS_DIFF_LABELS[i] + "</span><span class=\"text-brand-450 dark:text-brand-350 font-normal shrink-0\">ELO " + Math.min.apply(null, ratings) + "–" + Math.max.apply(null, ratings) + " · " + ids.length + " ›</span>";
                    btn.addEventListener("click", () => { tacticsView = Object.assign({}, tacticsView, { level: "exercises", diffIndex: i }); renderTacticsView(); });
                    list.appendChild(btn);
                });
                body.appendChild(list);
                return;
            }

            if (tacticsView.level === "exercises") {
                const ids = tacticsThemeBuckets(tacticsView.themeKey)[tacticsView.diffIndex] || [];
                // Cuántos son y el interruptor para verlos todos de una: el rótulo de
                // cada fila ("3. ELO 1397") no dice nada de la posición, así que elegir
                // cuál dar es mirarlas.
                const barra = document.createElement("div");
                barra.className = "flex items-center justify-between gap-2 mt-2";
                const cuenta = document.createElement("p");
                cuenta.className = "text-xs text-brand-450 dark:text-brand-350 min-w-0 truncate";
                cuenta.textContent = ids.length + (ids.length === 1 ? " ejercicio" : " ejercicios");
                barra.append(cuenta, vistaPreviaTactica.control());
                body.appendChild(barra);
                const list = document.createElement("ul");
                list.className = "space-y-2 mt-2 max-h-96 overflow-y-auto pr-1";
                ids.forEach((id, i) => {
                    const ex = tacticsData.puzzles[id];
                    const li = document.createElement("li");
                    li.className = "bg-brand-50 dark:bg-brand-800 rounded-lg p-2.5";
                    // El rótulo ARRIBA y los botones DEBAJO, como en el panel de Archivos y
                    // en el del plan de clase. Estaban en una misma fila (justify-between,
                    // con el grupo de botones en shrink-0), y en esta columna de 320px los
                    // tres botones no caben: con shrink-0 el grupo crece hasta su
                    // ancho de contenido en vez de envolverse —el flex-wrap no llega a
                    // aplicarse nunca—, así que el último quedaba cortado contra el borde del
                    // panel y "ELO 1397" se partía en tres renglones para hacerle sitio. No
                    // daba ningún error: la lista se pinta entera y no se puede apretar el
                    // botón que se salió.
                    const label = document.createElement("p");
                    label.className = "text-sm font-semibold text-brand-700 dark:text-brand-200";
                    label.textContent = (i + 1) + ". " + (ex.mate ? "Mate en " + Math.ceil(ex.solution.length / 2) : "ELO " + ex.rating);
                    li.appendChild(label);
                    const actions = document.createElement("div");
                    actions.className = "flex items-center flex-wrap gap-1.5 mt-2";
                    const previewBtn = document.createElement("button");
                    previewBtn.type = "button";
                    previewBtn.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-700 dark:hover:bg-brand-600 text-brand-700 dark:text-brand-200 transition-colors";
                    previewBtn.textContent = "👁 Vista previa";
                    // "Al tablero" transmite SOLO la posición, sin abrir ninguna pregunta: es para
                    // explicar el ejercicio en el tablero de todos, que no es lo mismo que
                    // ponérselo a resolver. Con un solo botón había que preguntar para poder
                    // enseñarlo, y entonces el alumno ya está contestando mientras se explica.
                    const sendBtn = document.createElement("button");
                    sendBtn.type = "button";
                    sendBtn.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-700 dark:hover:bg-brand-600 text-brand-700 dark:text-brand-200 transition-colors";
                    sendBtn.textContent = "📥 Al tablero";
                    sendBtn.title = "Poner esta posición en el tablero de la clase, sin preguntar nada";
                    const askBtn = document.createElement("button");
                    askBtn.type = "button";
                    askBtn.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors";
                    askBtn.textContent = "❓ Preguntar";
                    actions.append(previewBtn, sendBtn, askBtn);
                    li.appendChild(actions);
                    const previewWrap = document.createElement("div");
                    previewWrap.className = "hidden mt-2";
                    li.appendChild(previewWrap);
                    // Igual que en Archivos: destaparla y dibujarla lo lleva el lote, así
                    // esta fila hace lo mismo con su botón que cuando se destapan todas.
                    vistaPreviaTactica.registrar(previewWrap, previewBtn, () => {
                        renderTacticsPreviewBoard(previewWrap, ex.fen);
                    });
                    sendBtn.addEventListener("click", async () => {
                        const ok = await aplicarPosicionEnClase(ex.fen, "Posición del ejercicio enviada: ya la ven todos los alumnos.");
                        if (ok) { sendBtn.textContent = "✅ Enviada"; setTimeout(() => { sendBtn.textContent = "📥 Al tablero"; }, 2000); }
                    });
                    askBtn.addEventListener("click", () => askTacticsExercise(ex));
                    list.appendChild(li);
                });
                body.appendChild(list);
                return;
            }
        }

        // Mini-tablero de solo lectura para la vista previa. Lo dibuja el MISMO diagrama de
        // ejemplo que usan los artículos (js/article-example-board.js): acá estaba copiado, y
        // la copia ya se había separado del original por donde se separan siempre — dibujaba
        // las piezas con el font-size fijo de 24px del CSS, pensado para un tablero grande,
        // dentro de casillas de 22px, así que la pieza se salía de su casilla y el tablero
        // "no se veía bien"; y no entendía el juego de piezas ilustrado, así que a quien lo
        // tuviera elegido le salían aquí las de texto. El original mide la casilla ya
        // renderizada y ajusta la pieza a ella, de modo que se ve igual a cualquier ancho.
        function renderTacticsPreviewBoard(container, fen) {
            container.innerHTML = "";
            let previewGame;
            try { previewGame = new Chess(fen); } catch (e) { previewGame = null; }
            if (!previewGame || !window.ExampleBoard) { container.textContent = "No se pudo mostrar la posición."; return; }
            const boardEl = document.createElement("div");
            boardEl.className = "example-board max-w-[260px]";
            container.appendChild(boardEl);
            window.ExampleBoard.render(boardEl, previewGame);
            // De quién es la jugada: sin esto hay que deducirlo de la posición, y el ejercicio
            // no se entiende hasta que ya se mandó a la clase.
            const turno = document.createElement("p");
            turno.className = "text-xs text-brand-450 dark:text-brand-350 mt-2 max-w-[260px] text-center";
            turno.textContent = previewGame.turn() === "w" ? "Juegan blancas" : "Juegan negras";
            container.appendChild(turno);
        }

        // Transmite la posición del ejercicio elegido a toda la clase y la pregunta de
        // inmediato — mismo mecanismo que ask-question-btn de más arriba (misma tabla
        // game_state, misma tabla questions), solo que la posición viene de la base de
        // Táctica en vez del tablero armado a mano. El número de jugadas esperadas del
        // alumno se calcula de la propia solución del ejercicio (cuenta solo las jugadas
        // que le tocan a quien mueve, no las respuestas intercaladas del rival).
        async function askTacticsExercise(ex) {
            const fen = ex.fen;
            const expectedPlies = Math.max(1, Math.min(6, Math.ceil((ex.solution || [""]).length / 2)));
            if (!(await aplicarPosicionEnClase(fen))) return;
            document.getElementById("question-plies-input").value = expectedPlies;
            const { data, error } = await crearPregunta(fen, expectedPlies);
            if (error) { console.error(error); setStatus("No se pudo crear la pregunta: " + error.message); return; }
            activateTeacherTab("preguntar");
            setStatus("Ejercicio de táctica enviado a la clase como pregunta.");
            computeEngineAnswer(data.id, fen, expectedPlies); // en segundo plano, no bloquea la pregunta
        }

        // ---------- Tipos de entrenamiento (cascada tipo → nivel → ejercicio) ----------
        // Los mismos catorce de entreno/tipos.html, con las mismas posiciones
        // (entreno/data/tipos.json) y el mismo catálogo (js/tipos-catalogo.js): el
        // profesor los jala a la clase sin salir de la sesión. Toda posición entra por
        // aplicarPosicionEnClase(), como Táctica y Archivos. Lo que es la RESPUESTA
        // (la opción buena del Detective, la amenaza, qué candidatas pierden, el número
        // del motor) va en «🔎 Respuesta», que se abre solo en esta pantalla: la clase
        // no ve nada de este panel. Ver «Los Tipos de entrenamiento, en la clase» en
        // docs/decisiones/clase-en-vivo.md.
        let tiposData = null;
        let tiposLoadPromise = null;
        let tiposView = { tipo: null, nivel: null };
        const vistaPreviaTipos = crearVistaPreviaLote("sesion_vista_previa_tipos_v1");
        let fotoTimer = null;
        let tiposMaestroCargado = false;
        // La posición de un ejercicio: la suya, o la primera de su tramo (maestro).
        const tiposFen = (item) => item.fen || (item.posiciones && item.posiciones[0].fen);

        function ensureTiposLoaded() {
            if (tiposData || tiposLoadPromise) return tiposLoadPromise;
            tiposLoadPromise = fetch("entreno/data/tipos.json")
                .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then((data) => { tiposData = data; renderTiposView(); })
                .catch((e) => {
                    console.error(e);
                    tiposLoadPromise = null;
                    document.getElementById("tipos-body").innerHTML =
                        '<p class="text-sm text-red-500 dark:text-red-400">No se pudieron cargar los entrenamientos. Recarga la página e inténtalo de nuevo.</p>';
                });
            return tiposLoadPromise;
        }

        const TIPOS_BTN = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-700 dark:hover:bg-brand-600 text-brand-700 dark:text-brand-200 transition-colors";
        const TIPOS_BTN_ACCION = "text-xs font-semibold px-2 py-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors";
        function tiposBoton(texto, cls, fn, titulo) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = cls || TIPOS_BTN;
            b.textContent = texto;
            if (titulo) b.title = titulo;
            b.addEventListener("click", fn);
            return b;
        }
        function tiposLista(items) {
            const ul = document.createElement("ul");
            ul.className = "list-disc pl-5 space-y-1";
            items.forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
            return ul;
        }

        /* El rótulo de cada fila: algo que distinga una de otra sin destaparla. */
        function tiposRotulo(tipo, item, i) {
            const R = window.TiposReglas;
            const n = (i + 1) + ". ";
            if (tipo === "detective") return n + "Juegan " + (item.fen.split(" ")[1] === "w" ? "blancas" : "negras") + ", en jaque";
            if (tipo === "amenaza") return n + (item.mate ? "Amenaza mate en " + item.mate : "ELO " + item.rating);
            if (tipo === "diferencias") return n + "Golpe " + item.golpeEs + " · ELO " + item.rating;
            if (tipo === "descarte") return n + item.candidatas.length + " candidatas: " + item.candidatas.map((c) => c.sanEs).join(", ");
            if (tipo === "balanza") return n + "Material " + (item.material === 0 ? "igual" : (item.material > 0 ? "+" : "−") + Math.abs(item.material));
            if (tipo === "fotografia") return n + item.piezas + " piezas";
            if (tipo === "con-lo-justo") return n + "Mate en " + item.minimo + " (mínimo exacto)";
            // los tipos 8 a 14 traen su rótulo escrito (sin delatar la respuesta)
            return n + (item.resumen || "");
        }

        /* La respuesta, solo para el profesor. */
        function tiposRespuesta(tipo, item) {
            const R = window.TiposReglas;
            const caja = document.createElement("div");
            caja.className = "text-xs text-brand-700 dark:text-brand-200 bg-white dark:bg-brand-900 rounded-lg p-2 mt-2 space-y-1";
            const p = (t) => { const x = document.createElement("p"); x.textContent = t; caja.appendChild(x); };
            if (tipo === "detective") {
                const turno = item.fen.split(" ")[1];
                p("¿Cuál fue la última jugada de las " + (turno === "w" ? "negras" : "blancas") + "? Opciones:");
                caja.appendChild(tiposLista(item.opciones.map((op) => (R.claveRetro(op) === item.correcta ? "✓ " : "✗ ") + R.etiquetaRetro(op)
                    + (R.claveRetro(op) === item.correcta ? " — la de la partida (" + item.jugada + ")" : " — " + R.explicacionRetro(op.motivo, turno)))));
            } else if (tipo === "amenaza") {
                p("La amenaza: " + item.amenazaEs + (item.mate ? " (mate en " + item.mate + ")" : "") + ". " + (item.motivo || ""));
                if (item.linea) p("La línea: " + item.linea + ".");
                p("Con «Preguntar», el tablero queda con el turno del rival: cada alumno mueve por él.");
            } else if (tipo === "descarte") {
                const yo = item.fen.split(" ")[1];
                caja.appendChild(tiposLista(item.candidatas.map((c) => c.sanEs + ": " + (c.pierde
                    ? "PIERDE" + (c.mateEn ? " (recibe mate en " + c.mateEn + ")" : " (" + R.numeroBalanza(c.eval / 100 * (yo === "w" ? 1 : -1)) + ")") + (c.refuta ? " — " + c.refuta : "")
                    : "aguanta (" + R.numeroBalanza(c.eval / 100 * (yo === "w" ? 1 : -1)) + ")"))));
            } else if (tipo === "diferencias") {
                const q = (v, m) => m ? (m > 0 ? "mate en " + m : "recibe mate en " + (-m)) : R.numeroBalanza(v / 100);
                p("La diferencia: " + item.texto + " (casillas " + item.cambio.casillas.join(" y ") + ").");
                const bando = item.fen.split(" ")[1] === "w" ? "blancas" : "negras";
                p("En A, " + item.golpeEs + " queda " + q(item.evalA, item.mateA) + " para las " + bando + "; en B, " + item.golpeEs.replace(/[+#]$/, "") + " queda " + q(item.evalB, item.mateB) + ": " + item.lineaB + ".");
                if (item.salvan) p("La refutación en B: " + item.salvan.map(R.sanEs).join(" o ") + ".");
            } else if (tipo === "balanza") {
                p("El motor: " + (item.mate ? "mate en " + Math.abs(item.mate) + " para las " + (item.mate > 0 ? "blancas" : "negras") : R.numeroBalanza(item.eval) + " — " + R.veredictoBalanza(item.eval)) + ".");
                p("Material: " + (item.material === 0 ? "igual" : (item.material > 0 ? "+" + item.material + " blancas" : "+" + (-item.material) + " negras")) + ".");
                if (item.linea) p("Lo que ve el motor: " + item.linea + ".");
            } else if (tipo === "fotografia") {
                if (item.preguntas) caja.appendChild(tiposLista(item.preguntas.map((q) => q.texto + " → " + q.correcta)));
                else p("Pídeles que la reconstruyan en papel o que la dicten pieza por pieza.");
            } else if (tipo === "con-lo-justo") {
                p("Se gana en " + item.minimo + " jugadas contra la mejor defensa (cálculo exacto). Con «Practicar», el motor defiende el rey en el navegador de cada alumno.");
            } else if (Array.isArray(item.respuesta)) {
                // los tipos 8 a 14 traen su respuesta escrita por el generador
                item.respuesta.forEach(p);
            }
            return caja;
        }

        /* Fotografía en la clase: se ve unos segundos y las piezas desaparecen de
           todos los tableros (la misma columna pieces_hidden del botón 🙈 Ocultar). */
        async function tiposFotografia(item, segundos, btn) {
            if (fotoTimer) { clearTimeout(fotoTimer); fotoTimer = null; }
            if (!(await aplicarPosicionEnClase(item.fen))) return;
            lastPiecesHidden = false;
            updateHideBoardBtn();
            await sb.from("game_state").update({ pieces_hidden: false }).eq("id", myGameStateId);
            setStatus("📸 La clase ve la posición: " + segundos + " segundos.");
            btn.textContent = "⏳ " + segundos + " s…";
            fotoTimer = setTimeout(async () => {
                fotoTimer = null;
                lastPiecesHidden = true;
                updateHideBoardBtn();
                const { error } = await sb.from("game_state").update({ pieces_hidden: true }).eq("id", myGameStateId);
                if (error) { console.error(error); setStatus("No se pudieron ocultar las piezas: " + error.message); return; }
                btn.textContent = "📸 Mostrar " + segundos + " s y ocultar";
                setStatus("📸 Piezas ocultas: que la reconstruyan. «👁️ Mostrar» las vuelve a poner.");
            }, segundos * 1000);
        }

        async function tiposPreguntar(fen, aviso) {
            if (!(await aplicarPosicionEnClase(fen))) return;
            document.getElementById("question-plies-input").value = 1;
            const { data, error } = await crearPregunta(fen, 1);
            if (error) { console.error(error); setStatus("No se pudo crear la pregunta: " + error.message); return; }
            activateTeacherTab("preguntar");
            setStatus(aviso);
            computeEngineAnswer(data.id, fen, 1);
        }

        async function tiposPracticar(fen) {
            if (!(await aplicarPosicionEnClase(fen))) return;
            if (typeof PracticeEngine !== "undefined") PracticeEngine.preload();
            // Nivel máximo: el rey solo tiene que defenderse lo mejor posible.
            const { error } = await crearPractica(fen, "max");
            if (error) { console.error(error); setStatus("No se pudo iniciar la práctica: " + error.message); return; }
            activateTeacherTab("practicar");
            setStatus("Con lo justo: cada alumno juega el final contra el motor. Que den mate.");
        }

        function renderTiposView() {
            const body = document.getElementById("tipos-body");
            const C = window.TiposCatalogo;
            if (!tiposData || !C) { body.innerHTML = '<p class="text-sm text-brand-450 dark:text-brand-350">Cargando…</p>'; return; }
            body.innerHTML = "";
            vistaPreviaTipos.reiniciar();
            const lista = document.createElement("div");
            lista.className = "space-y-1.5";

            if (!tiposView.tipo) {
                C.TIPOS.forEach((t) => {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "w-full text-left text-sm px-3 py-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 dark:bg-brand-800 dark:hover:bg-brand-700 transition-colors";
                    const t1 = document.createElement("span"); t1.className = "font-semibold text-brand-800 dark:text-white";
                    const ico = document.createElement("span"); ico.setAttribute("aria-hidden", "true"); ico.textContent = t.emoji + " ";
                    t1.append(ico, t.nombre);
                    const t2 = document.createElement("span"); t2.className = "block text-xs text-brand-450 dark:text-brand-350 mt-0.5"; t2.textContent = t.pregunta;
                    btn.append(t1, t2);
                    btn.addEventListener("click", () => { tiposView = { tipo: t.id, nivel: null }; renderTiposView(); });
                    lista.appendChild(btn);
                });
                body.appendChild(lista);
                return;
            }
            const t = C.tipo(tiposView.tipo);
            if (!tiposView.nivel) {
                body.appendChild(tacticsBackBtn("‹ Tipos", () => { tiposView = { tipo: null, nivel: null }; renderTiposView(); }));
                const tit = document.createElement("p");
                tit.className = "font-semibold text-brand-800 dark:text-white text-sm mt-2";
                tit.textContent = t.nombre;
                const clase = document.createElement("p");
                clase.className = "text-xs text-brand-450 dark:text-brand-350 mb-2";
                clase.textContent = t.clase;
                body.append(tit, clase);
                t.niveles.forEach((n) => {
                    const cuantos = (tiposData[t.id] || []).filter((x) => x.nivel === n.n).length;
                    if (!cuantos) return;
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "w-full text-left text-sm px-3 py-2.5 rounded-lg bg-brand-50 hover:bg-brand-100 dark:bg-brand-800 dark:hover:bg-brand-700 transition-colors";
                    const a = document.createElement("span"); a.className = "font-semibold text-brand-800 dark:text-white"; a.textContent = "Nivel " + n.n + " — " + n.titulo;
                    const b = document.createElement("span"); b.className = "block text-xs text-brand-450 dark:text-brand-350 mt-0.5"; b.textContent = n.desc + " · " + cuantos + " ›";
                    btn.append(a, b);
                    btn.addEventListener("click", () => { tiposView = { tipo: t.id, nivel: n.n }; renderTiposView(); });
                    lista.appendChild(btn);
                });
                body.appendChild(lista);
                return;
            }
            const nivel = C.nivel(t.id, tiposView.nivel);
            body.appendChild(tacticsBackBtn("‹ " + t.nombre, () => { tiposView = { tipo: t.id, nivel: null }; renderTiposView(); }));
            /* Las partidas del maestro están detrás del candado de los cursos:
               el banco público solo trae el índice, y el resto se le pide al
               servidor con la sesión del profesor. */
            if (t.id === "maestro" && !tiposMaestroCargado) {
                const aviso = document.createElement("p");
                aviso.className = "text-sm text-brand-450 dark:text-brand-350 mt-2";
                aviso.textContent = "Cargando las partidas…";
                body.appendChild(aviso);
                fetch("cursos/protegido/data/tipos-maestro.json", { credentials: "same-origin" })
                    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                    .then((d) => { tiposData.maestro = d.maestro; tiposMaestroCargado = true; renderTiposView(); })
                    .catch((e) => { console.error(e); aviso.textContent = "No se pudieron cargar las partidas del curso «Partidas modelo» (hace falta el acceso vigente)."; });
                return;
            }
            const items = (tiposData[t.id] || []).filter((x) => x.nivel === nivel.n);
            const barra = document.createElement("div");
            barra.className = "flex items-center justify-between gap-2 mt-2";
            const cuenta = document.createElement("p");
            cuenta.className = "text-xs text-brand-450 dark:text-brand-350 min-w-0 truncate";
            cuenta.textContent = items.length + " ejercicios";
            barra.append(cuenta, vistaPreviaTipos.control());
            body.appendChild(barra);
            const ul = document.createElement("ul");
            ul.className = "space-y-2 mt-2 max-h-96 overflow-y-auto pr-1";
            items.forEach((item, i) => {
                const li = document.createElement("li");
                li.className = "bg-brand-50 dark:bg-brand-800 rounded-lg p-2.5";
                li.dataset.tipoItem = item.id;
                const label = document.createElement("p");
                label.className = "text-sm font-semibold text-brand-700 dark:text-brand-200";
                label.textContent = tiposRotulo(t.id, item, i);
                li.appendChild(label);
                const acciones = document.createElement("div");
                acciones.className = "flex items-center flex-wrap gap-1.5 mt-2";
                const previewBtn = tiposBoton("👁 Vista previa", TIPOS_BTN, () => {});
                acciones.appendChild(previewBtn);
                if (t.id === "fotografia") {
                    const seg = nivel.segundos || 8;
                    const fb = tiposBoton("📸 Mostrar " + seg + " s y ocultar", TIPOS_BTN_ACCION, () => tiposFotografia(item, seg, fb), "La clase ve la posición y después las piezas desaparecen de todos los tableros");
                    acciones.appendChild(fb);
                } else {
                    // Siete diferencias tiene dos posiciones: A (el golpe gana) y
                    // B (casi igual, y ya no). Cada una con su botón.
                    if (t.id === "diferencias") {
                        const envioA = tiposBoton("📥 A al tablero", TIPOS_BTN, async () => {
                            const ok = await aplicarPosicionEnClase(item.fenA, "Posición A: aquí " + item.golpeEs + " gana.");
                            if (ok) { envioA.textContent = "✅ Enviada"; setTimeout(() => { envioA.textContent = "📥 A al tablero"; }, 2000); }
                        }, "La posición donde el golpe gana");
                        acciones.appendChild(envioA);
                    }
                    const rotuloEnvio = t.id === "diferencias" ? "📥 B al tablero" : "📥 Al tablero";
                    // Amenaza: al tablero va la posición del alumno (le toca a él).
                    const envio = tiposBoton(rotuloEnvio, TIPOS_BTN, async () => {
                        const ok = await aplicarPosicionEnClase(tiposFen(item), "«" + t.nombre + "»: ya la ven todos los alumnos.");
                        if (ok) { envio.textContent = "✅ Enviada"; setTimeout(() => { envio.textContent = rotuloEnvio; }, 2000); }
                    }, "Poner esta posición en el tablero de la clase, sin preguntar nada");
                    acciones.appendChild(envio);
                }
                if (t.id === "amenaza") acciones.appendChild(tiposBoton("❓ Preguntar", TIPOS_BTN_ACCION, () => tiposPreguntar(item.fenRival, "Pregunta abierta: cada alumno hace la jugada que amenaza el rival."), "Abre la pregunta con el turno del rival: la respuesta correcta es su amenaza"));
                if (t.id === "diferencias" && item.salvan) acciones.appendChild(tiposBoton("❓ Preguntar la refutación", TIPOS_BTN_ACCION, () => {
                    const g = new Chess(item.fen);
                    g.move(item.golpe);
                    tiposPreguntar(g.fen(), "Pregunta abierta: en B, tras " + item.golpeEs.replace(/[+#]$/, "") + ", ¿cómo se defiende el rival?");
                }, "Abre la pregunta con B después del golpe: cada alumno busca la defensa"));
                if (t.id === "descarte") acciones.appendChild(tiposBoton("❓ Preguntar", TIPOS_BTN_ACCION, () => tiposPreguntar(item.fen, "Pregunta abierta: ¿qué jugarías? Después comenten cuáles de las candidatas pierden."), "Abre la pregunta «¿qué jugarías?» con esta posición"));
                if (t.id === "peones" && item.nivel === 3) acciones.appendChild(tiposBoton("❓ Preguntar", TIPOS_BTN_ACCION, () => tiposPreguntar(item.fen, "Pregunta abierta: ¿cuál es la única jugada que gana?"), "Cada alumno busca la única jugada que gana"));
                if (t.id === "peones" && item.nivel === 4) acciones.appendChild(tiposBoton("🎯 Practicar", TIPOS_BTN_ACCION, () => tiposPracticar(item.fen), "Cada alumno lo juega contra el motor hasta coronar"));
                if (t.id === "maestro") acciones.appendChild(tiposBoton("❓ Preguntar", TIPOS_BTN_ACCION, () => tiposPreguntar(tiposFen(item), "Pregunta abierta: ¿qué jugarías aquí? Después miren la jugada del maestro."), "Abre la pregunta con la primera posición del tramo"));
                if (t.id === "con-lo-justo") acciones.appendChild(tiposBoton("🎯 Practicar", TIPOS_BTN_ACCION, () => tiposPracticar(item.fen), "Cada alumno juega el final contra el motor"));
                const respBtn = tiposBoton("🔎 Respuesta", TIPOS_BTN, () => {
                    const abierta = !respWrap.classList.contains("hidden");
                    if (!abierta && !respWrap.firstChild) respWrap.appendChild(tiposRespuesta(t.id, item));
                    respWrap.classList.toggle("hidden", abierta);
                    respBtn.setAttribute("aria-expanded", abierta ? "false" : "true");
                    respBtn.textContent = abierta ? "🔎 Respuesta" : "🙈 Ocultar respuesta";
                }, "Solo la ves tú");
                respBtn.setAttribute("aria-expanded", "false");
                acciones.appendChild(respBtn);
                li.appendChild(acciones);
                const previewWrap = document.createElement("div");
                previewWrap.className = "hidden mt-2";
                const respWrap = document.createElement("div");
                respWrap.className = "hidden";
                // La respuesta ARRIBA de la vista previa: la lista tiene su propio
                // scroll, y debajo de un tablero quedaba fuera de la vista.
                li.append(respWrap, previewWrap);
                vistaPreviaTipos.registrar(previewWrap, previewBtn, () => renderTacticsPreviewBoard(previewWrap, tiposFen(item)));
                ul.appendChild(li);
            });
            body.appendChild(ul);
            const abrir = document.createElement("a");
            abrir.href = "entreno/tipos.html#" + t.id;
            abrir.target = "_blank";
            abrir.rel = "noopener";
            abrir.className = "inline-block mt-3 text-xs font-semibold text-accent-700 dark:text-accent-400 underline";
            abrir.textContent = "Abrir la ficha de «" + t.nombre + "» (otra pestaña)";
            body.appendChild(abrir);
        }

        // ---------- Aviso de calificación (sobrevive a que la pregunta ya esté cerrada) ----------
        // El profesor casi siempre califica DESPUÉS de cerrar la pregunta (revisa la lista con
        // calma, con la clase ya siguiendo adelante) — si el aviso solo viviera dentro de
        // question-card, quedaría calificado en silencio: ese overlay ya está oculto para
        // entonces. lastToastKey evita repetir el mismo aviso si llega el mismo evento dos veces.
        let lastToastKey = null;
        function maybeShowGradingToast(answer) {
            if (!answer || answer.is_correct === null || answer.is_correct === undefined) return;
            const key = answer.id + ":" + answer.is_correct;
            if (key === lastToastKey) return;
            lastToastKey = key;
            showAnswerFeedbackToast(answer);
        }

        function showAnswerFeedbackToast(answer) {
            const toast = document.getElementById("answer-feedback-toast");
            const text = document.getElementById("answer-feedback-text");
            const retryBtn = document.getElementById("answer-feedback-retry-btn");
            const stillOpen = !!(currentQuestion && currentQuestion.id === answer.question_id && !currentQuestion.closed_at);
            if (answer.is_correct === true) {
                toast.className = "fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,420px)] rounded-xl shadow-2xl p-4 text-center bg-green-500 text-white";
                text.textContent = "✅ ¡Muy bien! Tu respuesta fue correcta. 🏆 +1 trofeo.";
                retryBtn.classList.add("hidden");
            } else {
                toast.className = "fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,420px)] rounded-xl shadow-2xl p-4 text-center bg-red-500 text-white";
                text.textContent = stillOpen ? "❌ Esa no era la jugada correcta — vuelve a intentarlo." : "❌ Esa no era la jugada correcta.";
                retryBtn.classList.toggle("hidden", !stillOpen);
            }
            toast.classList.remove("hidden");
        }

        function mostrarInsigniaGanada(tipo, motivo) {
            const toast = document.getElementById("answer-feedback-toast");
            toast.className = "fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,420px)] rounded-xl shadow-2xl p-4 text-center bg-accent-500 text-brand-900";
            document.getElementById("answer-feedback-text").textContent = tipo.emoji + " ¡Tu profe te dio la insignia «" + tipo.nombre + "»!"
                + (motivo ? " " + motivo : "");
            document.getElementById("answer-feedback-retry-btn").classList.add("hidden");
            toast.classList.remove("hidden");
        }

        document.getElementById("answer-feedback-dismiss-btn").addEventListener("click", () => {
            document.getElementById("answer-feedback-toast").classList.add("hidden");
        });

        document.getElementById("answer-feedback-retry-btn").addEventListener("click", () => {
            document.getElementById("answer-feedback-toast").classList.add("hidden");
            document.getElementById("question-retry-btn").click(); // mismo flujo que "Cambiar respuesta"
        });

        // ---------- Tarjeta de pregunta del alumno (overlay sobre el tablero) ----------
        function updateAnswerFeedbackUI() {
            if (!myAnswer) return;
            const movesText = PreguntaClase.esDeOpciones(currentQuestion)
                ? "«" + PreguntaClase.textoDeOpcion(currentQuestion, myAnswer.opcion) + "»"
                : (myAnswer.moves || []).join(" ");
            let text = "Tu respuesta: " + movesText + " ✓ enviada";
            if (myAnswer.is_correct === true) text = "Tu respuesta: " + movesText + " — ✅ ¡Correcto!";
            else if (myAnswer.is_correct === false) text = "Tu respuesta: " + movesText + " — ❌ Revisa de nuevo";
            document.getElementById("question-status-text").textContent = text;
        }

        // Refleja en pantalla de quién es el turno: mientras responde una pregunta ya
        // enviada (myAnswer truthy) esta función no toca nada, el feedback final manda.
        function updateQuestionCardStatus() {
            if (!currentQuestion || myAnswer) return;
            const remaining = currentQuestion.expected_plies - questionMovesDone;
            const myTurn = questionBoard.game.turn() === questionStudentColor;
            questionBoard.setInteractive(myTurn && !questionEngineBusy);
            document.getElementById("question-undo-btn").classList.toggle("hidden", !(myTurn && questionMovesDone > 0 && !questionEngineBusy));
            const stuck = questionEngineLastFailed && !myTurn && !questionEngineBusy;
            document.getElementById("question-retry-engine-btn").classList.toggle("hidden", !stuck);
            if (questionEngineBusy) {
                document.getElementById("question-status-text").textContent = "El motor está pensando…";
            } else if (stuck) {
                document.getElementById("question-status-text").textContent = "El motor no respondió — toca \"Pedir jugada del motor\" para intentarlo de nuevo.";
            } else if (myTurn) {
                document.getElementById("question-status-text").textContent = remaining > 1
                    ? ("Tu turno — te quedan " + remaining + " jugadas.")
                    : "Tu turno — esta es tu última jugada.";
            }
        }

        // Le pide al motor su respuesta a la jugada del alumno y la aplica (con reintentos,
        // igual que requestEngineReply() en Practicar contra el motor — un solo hiccup
        // transitorio no debería dejar al alumno esperando para siempre). Usa PracticeEngine
        // a máxima fuerza (corre en el navegador de CADA alumno, no en el del profesor) en
        // vez de ClasesEngine, que es solo para el panel de análisis del profesor.
        async function requestQuestionEngineReply() {
            if (questionEngineBusy) return;
            if (!currentQuestion || currentQuestion.closed_at || myAnswer) return;
            if (questionBoard.game.turn() === questionStudentColor) return; // ya le toca al alumno

            questionEngineBusy = true;
            questionEngineLastFailed = false;
            updateQuestionCardStatus();
            /* Mientras el motor piensa el profe puede plantear OTRA pregunta: la
               jugada que vuelva es de la posición vieja, y si resultara legal en
               la nueva movería una pieza que no corresponde. Se ata a la pregunta
               y a la posición con que se pidió. */
            const preguntaPedida = currentQuestion.id;
            let fenPedida = null;
            let uci = null;
            for (let attempt = 0; attempt < 3 && !uci; attempt++) {
                fenPedida = questionBoard.fen();
                uci = typeof PracticeEngine !== "undefined" ? await PracticeEngine.getMove(fenPedida, "max") : null;
                if (!currentQuestion || currentQuestion.closed_at || myAnswer) { questionEngineBusy = false; return; }
                if (currentQuestion.id !== preguntaPedida || questionBoard.fen() !== fenPedida) {
                    questionEngineBusy = false;
                    updateQuestionCardStatus();
                    requestQuestionEngineReply();
                    return;
                }
            }
            questionEngineBusy = false;

            if (uci) {
                const move = questionBoard.game.move({
                    from: uci.slice(0, 2), to: uci.slice(2, 4),
                    promotion: uci.length > 4 ? uci.slice(4, 5) : "q",
                });
                if (move) {
                    questionBoard.render();
                    mandarEnCurso();
                    if (preguntaAcc) {
                        preguntaAcc.actualizar();
                        preguntaAcc.decir("El motor jugó " + ClaseAdaptada.hablarJugada(move.san) + ". Te toca.");
                    }
                }
            } else {
                questionEngineLastFailed = true;
            }
            updateQuestionCardStatus();
        }

        /* Lo que el alumno lleva jugado en la pregunta, antes de mandarla: el
           profe lo ve en vivo en su tablero. En fila, para que una jugada vieja
           no llegue después de una nueva. No es una respuesta: va a
           respuestas_en_curso, no a question_answers (ver la migración
           pregunta_dirigida_y_respuestas_en_curso). */
        let colaEnCurso = Promise.resolve();
        function mandarEnCurso() {
            const q = currentQuestion;
            if (!q || q.closed_at || !questionBoard || PreguntaClase.esDeOpciones(q)) return;
            if (q.para_alumno && q.para_alumno !== profile.id) return;
            const fila = { question_id: q.id, student_id: profile.id, moves: questionBoard.moves(), fen: questionBoard.fen(), updated_at: new Date().toISOString() };
            colaEnCurso = colaEnCurso.then(async () => {
                const { error } = await sb.from("respuestas_en_curso").upsert(fila, { onConflict: "question_id,student_id" });
                // No frena al alumno: si no llega, igual contesta.
                if (error) console.warn("No se pudo mostrarle al profe tu jugada:", error.message);
            });
        }

        async function submitQuestionAnswer() {
            const moves = questionBoard.moves();
            const { error } = await sb.from("question_answers").upsert({
                question_id: currentQuestion.id, student_id: profile.id, moves, resulting_fen: questionBoard.fen(),
            }, { onConflict: "question_id,student_id" });
            if (error) { console.error(error); setStatus("No se pudo enviar tu respuesta: " + error.message); return; }
            myAnswer = { moves, resulting_fen: questionBoard.fen(), is_correct: null };
            questionBoard.setInteractive(false);
            document.getElementById("question-undo-btn").classList.add("hidden");
            document.getElementById("question-retry-engine-btn").classList.add("hidden");
            document.getElementById("question-retry-btn").classList.remove("hidden");
            updateAnswerFeedbackUI();
        }

        // Se llama cada vez que el alumno mueve en el tablero de la pregunta. Si esa era su
        // última jugada permitida, se envía la respuesta de una vez (ya no hace falta un
        // botón "Enviar respuesta" aparte); si no, le toca responder al motor.
        async function onQuestionStudentMove() {
            if (preguntaAcc) preguntaAcc.actualizar();
            questionMovesDone++;
            mandarEnCurso();
            if (questionMovesDone >= currentQuestion.expected_plies) {
                await submitQuestionAnswer();
                return;
            }
            updateQuestionCardStatus();
            await requestQuestionEngineReply();
        }

        async function renderStudentQuestionCard() {
            const card = document.getElementById("question-card");
            const reopenBtn = document.getElementById("question-reopen-btn");
            // Al cerrar la pregunta, el cuadro desaparece por completo (no se queda mostrando
            // "pregunta cerrada").
            pintarPreguntaParaOtro();
            if (!currentQuestion || currentQuestion.closed_at) {
                card.classList.add("hidden");
                reopenBtn.classList.add("hidden");
                questionCardDismissedFor = null;
                return;
            }
            // Una pregunta para otro compañero: no se le abre encima a nadie más.
            if (currentQuestion.para_alumno && currentQuestion.para_alumno !== profile.id) {
                card.classList.add("hidden");
                reopenBtn.classList.add("hidden");
                return;
            }
            document.getElementById("question-para-ti").hidden = !currentQuestion.para_alumno;
            // El alumno cerró este mismo overlay con la ✖: sigue siendo la pregunta vigente
            // (no se cierra del lado del profesor), así que no se le vuelve a imponer encima
            // — solo se le deja el botón flotante para volver cuando quiera.
            if (questionCardDismissedFor === currentQuestion.id) {
                card.classList.add("hidden");
                reopenBtn.classList.remove("hidden");
                return;
            }
            reopenBtn.classList.add("hidden");
            const recienAbierta = card.classList.contains("hidden");
            card.classList.remove("hidden");
            document.getElementById("answer-feedback-toast").classList.add("hidden"); // aviso de una pregunta anterior, si quedó abierto
            document.getElementById("question-prompt-text").textContent = currentQuestion.prompt;
            document.getElementById("question-plies-hint").textContent = currentQuestion.expected_plies > 1
                ? ("Mueve " + currentQuestion.expected_plies + " veces — el motor responde entre cada una de tus jugadas.")
                : "Indica tu mejor jugada.";

            const { data: existing } = await sb.from("question_answers").select("*")
                .eq("question_id", currentQuestion.id).eq("student_id", profile.id).maybeSingle();
            myAnswer = existing || null;

            if (!questionBoard) {
                questionBoard = new ClasesBoard(document.getElementById("question-board"), {
                    interactive: false,
                    allowArrows: false,
                    // Las coordenadas de afuera, igual que en el tablero principal: acá el
                    // alumno está buscando la jugada solo, sin nadie señalándole la casilla.
                    externalCoords: true,
                    onMove: () => onQuestionStudentMove(),
                });
                preguntaAcc = window.ClaseAdaptada ? ClaseAdaptada.montar(document.getElementById("question-cmd"), () => questionBoard, {
                    etiqueta: "Escribe tu jugada, o una pregunta sobre la posición",
                    porQueNoPuedes: () => myAnswer
                        ? "Ya enviaste tu respuesta. Si quieres cambiarla, usa el botón «Cambiar respuesta»."
                        : (questionEngineBusy ? "El motor está pensando su respuesta: espera un momento." : "Ahora no te toca mover."),
                }) : null;
            }
            // El bando del alumno es el que le toca mover en la posición de la pregunta —
            // el motor siempre juega el otro bando, respondiendo entre jugada y jugada. El
            // tablero se orienta con las piezas del alumno abajo (como en cualquier tablero
            // real) y se avisa con qué color juega, en vez de dejarlo adivinar mirando el FEN.
            questionStudentColor = currentQuestion.fen.split(" ")[1] === "b" ? "b" : "w";
            questionMovesDone = 0;
            questionEngineLastFailed = false;
            questionBoard.setFlipped(questionStudentColor === "b");
            document.getElementById("question-color-hint").textContent = questionStudentColor === "b"
                ? "Te toca jugar con ⚫ Negras"
                : "Te toca jugar con ⚪ Blancas";
            questionBoard.loadFen(currentQuestion.fen);
            if (preguntaAcc) preguntaAcc.actualizar();
            // El foco va a la pregunta en cuanto aparece: sin eso, quien usa lector de
            // pantalla se queda donde estaba —debajo de un overlay que no ve— y no se
            // entera de que el profesor le preguntó algo.
            if (recienAbierta) enfocarCuandoSeVea(document.getElementById("question-titulo"));

            const retryBtn = document.getElementById("question-retry-btn");
            /* Una de opciones no se contesta moviendo: el tablero es la posición de
               la que se habla (y el termómetro ni eso: no se muestra). Se contesta
               con los botones, y cambiar de opción es tocar otra. */
            const esOp = PreguntaClase.esDeOpciones(currentQuestion);
            const esTermometro = esOp && JSON.stringify(currentQuestion.opciones) === JSON.stringify(PreguntaClase.TERMOMETRO.opciones);
            document.getElementById("question-board-caja").hidden = esTermometro;
            document.getElementById("question-cmd").hidden = esOp;
            if (esOp) {
                document.getElementById("question-color-hint").textContent = "";
                document.getElementById("question-plies-hint").textContent = esTermometro
                    ? "Contesta con sinceridad: tu profe no le enseña a la clase quién eligió qué."
                    : "Elige una opción. Puedes cambiarla mientras la pregunta siga abierta.";
                questionBoard.setInteractive(false);
                retryBtn.classList.add("hidden");
                document.getElementById("question-undo-btn").classList.add("hidden");
                document.getElementById("question-retry-engine-btn").classList.add("hidden");
                pintarOpcionesAlumno();
                if (myAnswer) updateAnswerFeedbackUI();
                else document.getElementById("question-status-text").textContent = "Todavía no contestaste.";
                pintarTiempoDeLaPregunta();
                await pintarResultadosAlumno();
                return;
            }
            document.getElementById("question-opciones").hidden = true;
            if (myAnswer) {
                questionBoard.setInteractive(false);
                retryBtn.classList.remove("hidden");
                document.getElementById("question-undo-btn").classList.add("hidden");
                document.getElementById("question-retry-engine-btn").classList.add("hidden");
                updateAnswerFeedbackUI();
            } else {
                retryBtn.classList.add("hidden");
                questionBoard.setInteractive(true);
                updateQuestionCardStatus();
            }
            pintarTiempoDeLaPregunta();
            await pintarResultadosAlumno();
        }

        // Deshace la última jugada del alumno: como el motor ya respondió entre medio, hay
        // que deshacer también esa respuesta del motor para volver al turno del alumno.
        document.getElementById("question-undo-btn").addEventListener("click", () => {
            if (!questionBoard || questionEngineBusy) return;
            questionBoard.undo(); // la respuesta del motor
            const undoneStudentMove = questionBoard.undo(); // la jugada propia anterior
            if (undoneStudentMove) questionMovesDone = Math.max(0, questionMovesDone - 1);
            questionEngineLastFailed = false;
            mandarEnCurso();
            updateQuestionCardStatus();
        });

        document.getElementById("question-retry-engine-btn").addEventListener("click", () => {
            requestQuestionEngineReply();
        });

        document.getElementById("question-retry-btn").addEventListener("click", () => {
            if (!currentQuestion || currentQuestion.closed_at) return;
            questionBoard.loadFen(currentQuestion.fen);
            if (preguntaAcc) preguntaAcc.actualizar();
            questionMovesDone = 0;
            questionEngineLastFailed = false;
            myAnswer = null;
            questionBoard.setInteractive(true);
            document.getElementById("question-retry-btn").classList.add("hidden");
            mandarEnCurso();
            updateQuestionCardStatus();
        });

        document.getElementById("question-close-btn").addEventListener("click", () => {
            if (!currentQuestion) return;
            questionCardDismissedFor = currentQuestion.id;
            renderStudentQuestionCard();
        });
        document.getElementById("question-reopen-btn").addEventListener("click", () => {
            questionCardDismissedFor = null;
            renderStudentQuestionCard();
        });

        // ---------- Practicar contra el motor ----------
        // El profesor lanza una ronda desde la posición ACTUAL del tablero (una foto fija,
        // no sigue los cambios posteriores del tablero en vivo). Cada alumno juega su propia
        // partida real contra Stockfish (js/practice-engine.js, corriendo en SU navegador,
        // no en el del profesor), con el color que le toque mover en esa posición. El
        // profesor ve todas las partidas de los alumnos abajo, con una barra de evaluación
        // por cada una (calculada también por el navegador de cada alumno, para no tener que
        // correr un motor por alumno del lado del profesor).
        let selectedPracticeLevel = "1500";
        let latestPracticeSession = null; // última fila de practice_sessions (activa o ya cerrada)
        let myPracticeGame = null; // fila propia en practice_games (solo alumno)
        let practiceBoard = null; // tablero del alumno (overlay)
        let practiceEngineBusy = false; // el motor está calculando su respuesta
        // id de la ronda que el alumno cerró con la ✖ (ver practice-close-btn): la ronda
        // sigue activa del lado del profesor, así que no se toca ninguna fila — solo se deja
        // de imponer el overlay hasta que el alumno la vuelva a abrir.
        let practiceCardDismissedFor = null;
        const practiceStudentBoards = {}; // profesor: student_id -> {el, nameEl, barEl, statusEl, board}

        const PRACTICE_LEVEL_ACTIVE = "practice-level-btn text-xs font-semibold px-2 py-2 rounded-lg transition-colors bg-accent-500 text-brand-900";
        const PRACTICE_LEVEL_INACTIVE = "practice-level-btn text-xs font-semibold px-2 py-2 rounded-lg transition-colors bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200";

        document.querySelectorAll(".practice-level-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                selectedPracticeLevel = btn.dataset.level;
                document.querySelectorAll(".practice-level-btn").forEach((b) => {
                    const active = b === btn;
                    b.className = active ? PRACTICE_LEVEL_ACTIVE : PRACTICE_LEVEL_INACTIVE;
                    b.setAttribute("aria-pressed", active ? "true" : "false");
                });
            });
        });

        function practiceLevelLabel(level) {
            return (typeof PracticeEngine !== "undefined" && PracticeEngine.LEVELS[level] && PracticeEngine.LEVELS[level].label) || level;
        }

        function practiceStatusLabel(status) {
            if (status === "checkmate_win") return "🏆 Ganó por jaque mate";
            if (status === "checkmate_loss") return "💀 Perdió por jaque mate";
            if (status === "draw") return "🤝 Tablas";
            if (status === "resigned") return "🏳️ Se rindió";
            if (status === "timeout") return "⏱️ Se quedó sin tiempo";
            return "Jugando…";
        }

        // "Jugando…" / "Ganó por jaque mate" + cuántos intentos lleva en esta ronda (solo le
        // interesa al profesor, que es quien puede estar viendo muchos tableros a la vez).
        function practiceStatusLabelWithAttempts(row) {
            const attempts = row.attempts || 1;
            return practiceStatusLabel(row.status) + " · intento " + attempts;
        }

        // Resultado desde el punto de vista del alumno, justo después de aplicar una jugada
        // (suya o del motor) sobre `g`. Se llama con el turno YA pasado al otro lado.
        function practiceResultForStudent(g, studentColor) {
            if (g.in_checkmate && g.in_checkmate()) {
                const matedColor = g.turn(); // a quien le toca mover es quien está mate
                return matedColor === studentColor ? "checkmate_loss" : "checkmate_win";
            }
            if (g.in_draw && g.in_draw()) return "draw"; // in_draw() ya cubre ahogado, material insuficiente, etc.
            return "playing";
        }

        /* ---------- Práctica con reloj y partidas entre alumnos ----------
           Una sola puerta abre la práctica contra el motor (el botón, los archivos
           y «Con lo justo»): así el reloj elegido viaja en todas. Solo puede haber
           una ronda activa a la vez: cierra cualquier anterior sin cerrar. */
        async function crearPractica(fen, level) {
            await sb.from("practice_sessions").update({ ended_at: new Date().toISOString() }).eq("created_by", boardOwnerId).is("ended_at", null);
            const reloj = parseInt((document.getElementById("practice-reloj") || {}).value, 10);
            const inc = parseInt((document.getElementById("practice-incremento") || {}).value, 10);
            return sb.from("practice_sessions").insert({
                fen, level, created_by: session.user.id,
                reloj_segundos: isFinite(reloj) && reloj > 0 ? reloj : null,
                incremento_segundos: isFinite(reloj) && reloj > 0 && isFinite(inc) ? inc : 0,
            });
        }

        function montarControlesDePractica() {
            const reloj = document.getElementById("practice-reloj");
            if (!reloj || reloj.childElementCount) return;
            PartidasClase.RELOJES_PRACTICA.forEach((t) => {
                const o = document.createElement("option");
                o.value = t.segundos === null ? "" : String(t.segundos);
                o.textContent = t.texto;
                reloj.appendChild(o);
            });
            const ritmo = document.getElementById("partidas-ritmo");
            PartidasClase.RITMOS.forEach((r, i) => {
                const o = document.createElement("option");
                o.value = String(i);
                o.textContent = r.texto;
                ritmo.appendChild(o);
            });
            ritmo.value = "1";
            document.getElementById("emparejar-btn").addEventListener("click", emparejarAlumnos);
            cargarPartidasDeLaClase();
            sb.channel("partidas-clase:" + boardOwnerId)
                .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms", filter: "created_by=eq." + boardOwnerId }, () => cargarPartidasDeLaClase())
                .subscribe();
        }

        /* Empareja a los conectados (onlineStudents: solo alumnos, sin quien
           supervisa) y arma una partida por pareja. Se crean con el insert de
           siempre: la política de game_rooms (puedo_armar_partida_con) decide
           con quién puede armar partidas este profesor. */
        async function emparejarAlumnos() {
            const msg = document.getElementById("partidas-msg");
            if (!currentOpenSessionId) { msg.textContent = "Abre la clase primero: las partidas quedan en su registro."; return; }
            const ids = [...onlineStudents.keys()];
            if (ids.length < 2) { msg.textContent = "Hacen falta al menos dos alumnos conectados."; return; }
            const ritmo = PartidasClase.RITMOS[parseInt(document.getElementById("partidas-ritmo").value, 10)] || PartidasClase.RITMOS[1];
            let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
            if (document.getElementById("partidas-desde-tablero").checked) {
                fen = board.fen();
                const motivo = motivoPosicionInvalida(fen);
                if (motivo) { msg.textContent = motivo; return; }
                if (new Chess(fen).game_over()) { msg.textContent = "En la posición del tablero la partida ya terminó: no hay nada que jugar."; return; }
            }
            const { parejas, sobra } = PartidasClase.emparejar(ids);
            const btn = document.getElementById("emparejar-btn");
            btn.disabled = true;
            const filas = parejas.map((p) => ({
                variant: "estandar", white_id: p.blancas, black_id: p.negras, created_by: session.user.id, fen,
                initial_seconds: ritmo.inicial, increment_seconds: ritmo.incremento,
                white_time_left: ritmo.inicial, black_time_left: ritmo.inicial,
            }));
            const { error } = await sb.from("game_rooms").insert(filas);
            btn.disabled = false;
            if (error) { console.error(error); msg.textContent = "No se pudieron armar las partidas: " + error.message; return; }
            const nombre = (id) => (onlineStudents.get(id) || {}).full_name || (onlineStudents.get(id) || {}).email || "Alumno";
            msg.textContent = (parejas.length === 1 ? "Se armó 1 partida" : "Se armaron " + parejas.length + " partidas")
                + " (" + ritmo.texto + "). A cada uno le llega el aviso para entrar."
                + (sobra ? " " + nombre(sobra) + " quedó sin pareja: puede jugar contra el motor o contigo." : "");
            cargarPartidasDeLaClase();
        }

        async function cargarPartidasDeLaClase() {
            const lista = document.getElementById("partidas-lista");
            if (!lista) return;
            if (!currentOpenSessionId) { lista.innerHTML = ""; return; }
            const { data, error } = await sb.from("game_rooms")
                .select("id, white_id, black_id, status, result, moves")
                .eq("class_session_id", currentOpenSessionId).order("created_at");
            if (error) { console.error(error); return; }
            const { data: nombres } = await sb.rpc("nombres_de_jugadores", {
                p_ids: [...new Set((data || []).flatMap((r) => [r.white_id, r.black_id]))],
            });
            const mapa = new Map((nombres || []).map((n) => [n.id, n.nombre || n.full_name]));
            const nombre = (id) => mapa.get(id) || (onlineStudents.get(id) || {}).full_name || "Alumno";
            lista.innerHTML = "";
            (data || []).forEach((r) => {
                const li = document.createElement("li");
                li.className = "flex items-center justify-between gap-2 border-b border-brand-50 dark:border-brand-800/60 pb-1.5";
                const t = document.createElement("span");
                t.className = "text-brand-700 dark:text-brand-200";
                t.textContent = nombre(r.white_id) + " (blancas) – " + nombre(r.black_id) + " (negras) · " + PartidasClase.estado(r, nombre);
                const a = document.createElement("a");
                a.href = "estandar.html?room=" + encodeURIComponent(r.id);
                a.target = "_blank";
                a.rel = "noopener";
                a.className = "shrink-0 font-semibold text-accent-700 dark:text-accent-400 hover:underline";
                a.textContent = "Mirar";
                a.setAttribute("aria-label", "Mirar la partida de " + nombre(r.white_id) + " y " + nombre(r.black_id) + " (se abre en otra pestaña)");
                li.append(t, a);
                lista.appendChild(li);
            });
        }

        /* El reloj del alumno en la práctica. Corre solo en su turno; al mover se
           le descuenta lo que pensó y se le suma el incremento, y lo que le queda
           se guarda en practice_games.reloj_ms. Al caer, la partida termina. */
        let relojTurnoDesde = null;
        let relojDichoPara = null;
        let relojDePartida = null;
        function relojBaseMs() {
            if (!latestPracticeSession || !latestPracticeSession.reloj_segundos || !myPracticeGame) return null;
            return myPracticeGame.reloj_ms != null ? myPracticeGame.reloj_ms : latestPracticeSession.reloj_segundos * 1000;
        }
        function relojRestanteMs() {
            const base = relojBaseMs();
            if (base === null) return null;
            return relojTurnoDesde === null ? base : base - (Date.now() - relojTurnoDesde);
        }
        function tickRelojPractica() {
            if (isTeacher) return;
            const el = document.getElementById("practice-reloj-alumno");
            if (!el) return;
            const base = relojBaseMs();
            const jugando = myPracticeGame && myPracticeGame.status === "playing" && practiceBoard;
            el.hidden = base === null;
            if (base === null) return;
            // Una partida nueva (u otro intento) arranca su turno de cero.
            const partida = myPracticeGame.id + ":" + (myPracticeGame.attempts || 1);
            if (partida !== relojDePartida) { relojDePartida = partida; relojTurnoDesde = null; }
            const miTurno = jugando && practiceBoard.game.turn() === myPracticeGame.student_color && !practiceEngineBusy;
            if (miTurno && relojTurnoDesde === null) relojTurnoDesde = Date.now();
            if (!miTurno) relojTurnoDesde = null;
            const quedan = relojRestanteMs();
            el.textContent = "⏱️ Tu reloj: " + PartidasClase.reloj(quedan);
            const aviso = document.getElementById("practice-reloj-aviso");
            const clave = myPracticeGame.id + ":" + (myPracticeGame.attempts || 1) + ":" + (quedan <= 0 ? "fin" : quedan <= 10000 ? "10" : "");
            if (quedan <= 10000 && miTurno && relojDichoPara !== clave) {
                relojDichoPara = clave;
                aviso.textContent = quedan <= 0 ? "Se te acabó el tiempo." : "Te quedan 10 segundos.";
            }
            if (miTurno && quedan <= 0) {
                relojTurnoDesde = null;
                practiceBoard.setInteractive(false);
                savePracticeGameRow({ status: "timeout", reloj_ms: 0 }).then(updatePracticeCardInteractivity);
            }
        }
        setInterval(tickRelojPractica, 250);

        // Lo que le queda después de su jugada (null si la práctica no tiene reloj).
        function relojDespuesDeMover() {
            const quedan = relojRestanteMs();
            if (quedan === null) return null;
            relojTurnoDesde = null;
            return Math.max(0, Math.round(quedan + (latestPracticeSession.incremento_segundos || 0) * 1000));
        }

        // El profe y quien supervisa ven la partida de cada alumno (y pueden ayudar);
        // el alumno ve la suya. La base dice qué filas le llegan a cada uno.
        function veLaPractica() { return isTeacher || esObservador; }

        function subscribePractice() {
            sb.channel("practice-sessions-changes:" + boardOwnerId)
                .on("postgres_changes", { event: "*", schema: "public", table: "practice_sessions", filter: "created_by=eq." + boardOwnerId }, (payload) => {
                    applyPracticeSessionUpdate(payload.new || payload.old);
                })
                .subscribe();
            if (veLaPractica()) {
                sb.channel("practice-games-changes:" + boardOwnerId)
                    .on("postgres_changes", { event: "*", schema: "public", table: "practice_games" }, (payload) => {
                        const row = (payload.new && payload.new.session_id) ? payload.new : payload.old;
                        if (!latestPracticeSession || !row || row.session_id !== latestPracticeSession.id) return;
                        loadPracticeGamesForSession(latestPracticeSession.id);
                    })
                    .subscribe();
            } else if (!esObservador) {
                // El alumno escucha SU partida solo por la ayuda que le manda el profe:
                // las jugadas las lleva este navegador, y un eco atrasado de la base las
                // pisaría (ver «La ayuda del profe, en la tarjeta del alumno»).
                sb.channel("practice-games-mia:" + profile.id)
                    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "practice_games", filter: "student_id=eq." + profile.id }, (payload) => {
                        const row = payload.new;
                        if (!row || !("ayuda" in row) || !myPracticeGame || row.id !== myPracticeGame.id) return;
                        // Y su pedido de ayuda, que se apaga solo cuando alguien lo atiende.
                        const pide = "pide_ayuda_at" in row ? row.pide_ayuda_at || null : myPracticeGame.pide_ayuda_at || null;
                        if (JSON.stringify(row.ayuda || null) === JSON.stringify(myPracticeGame.ayuda || null)
                            && pide === (myPracticeGame.pide_ayuda_at || null)) return;
                        myPracticeGame = Object.assign({}, myPracticeGame, { ayuda: row.ayuda || null, pide_ayuda_at: pide });
                        pintarAyudaAlumno();
                        pintarPedidoAlumno();
                    })
                    .subscribe();
            }
        }

        // Carga inicial al entrar a la página: sí hace falta preguntarle a la base de datos
        // cuál es la ronda más reciente (no hay ningún evento de Realtime del que partir).
        // Para los cambios en vivo mientras la página ya está abierta, ver
        // applyPracticeSessionUpdate() más abajo: usa la fila que trae el propio evento en
        // vez de volver a consultar "la más reciente", que si dos consultas se cruzan en la
        // red puede resolver desordenado.
        async function loadCurrentPractice() {
            const { data, error } = await sb.from("practice_sessions").select("*").eq("created_by", boardOwnerId).order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (error) { console.error(error); return; }
            latestPracticeSession = data || null;
            if (veLaPractica()) renderTeacherPracticePanel();
            else await renderStudentPracticeCard();
        }

        // Al arrancar una ronda nueva, el profesor primero cierra la anterior (UPDATE en
        // practice_sessions, ended_at) y luego crea la siguiente (INSERT): dos cambios
        // separados, que Realtime siempre entrega en ese mismo orden (el orden real en que
        // ocurrieron los cambios en la base). Por eso esta función toma la fila directo del
        // evento en vez de volver a preguntar "cuál es la más reciente" — esa segunda
        // consulta, al viajar por la red por separado de la otra, sí podía resolver
        // desordenada (la del cierre llegando después que la del inicio) y dejar a un alumno
        // viendo la posición de la ronda ya terminada en vez de la nueva. Tomando la fila del
        // evento no hay ninguna consulta aparte que pueda cruzarse por la red: cada alumno
        // procesa primero el cierre (oculta su tablero) y después, ya sí, el inicio de la
        // ronda nueva — siempre en ese orden.
        function applyPracticeSessionUpdate(row) {
            if (!row) return;
            latestPracticeSession = row;
            if (veLaPractica()) renderTeacherPracticePanel();
            else renderStudentPracticeCard();
        }

        // ---------- Panel del profesor ----------
        function renderTeacherPracticePanel() {
            const active = !!(latestPracticeSession && !latestPracticeSession.ended_at);
            document.getElementById("practice-start-controls").classList.toggle("hidden", active);
            document.getElementById("practice-active-controls").classList.toggle("hidden", !active);
            document.getElementById("practice-boards-section").classList.toggle("hidden", !active);
            if (active) {
                document.getElementById("practice-active-level").textContent = practiceLevelLabel(latestPracticeSession.level);
                loadPracticeGamesForSession(latestPracticeSession.id);
            } else {
                cerrarMirada();
                document.getElementById("practice-boards-grid").innerHTML = "";
                Object.keys(practiceStudentBoards).forEach((k) => delete practiceStudentBoards[k]);
            }
        }

        function upsertPracticeStudentBoard(row) {
            const grid = document.getElementById("practice-boards-grid");
            let entry = practiceStudentBoards[row.student_id];
            if (!entry) {
                const wrap = document.createElement("div");
                wrap.className = "bg-white dark:bg-brand-900 rounded-xl shadow-md p-3";
                wrap.innerHTML =
                    // De qué color juega va FUERA del nombre y sin encogerse: el tablero se
                    // gira según su color, así que es lo que dice cómo leerlo — y iba pegado
                    // al final de un nombre que se trunca, o sea que con un nombre largo
                    // (que es el caso de todos los días) se perdía siempre.
                    '<div class="flex items-baseline gap-1 mb-1">' +
                        '<p class="practice-mini-name text-xs font-semibold text-brand-700 dark:text-brand-200 truncate min-w-0"></p>' +
                        '<span class="practice-mini-color text-[11px] text-brand-450 dark:text-brand-350 shrink-0"></span>' +
                    "</div>" +
                    '<div class="practice-mini-board grid grid-cols-8 grid-rows-[repeat(8,minmax(0,1fr))] w-full aspect-square rounded-lg overflow-hidden shadow border-2 border-brand-700 select-none mb-2"></div>' +
                    // Quién va ganando, como en cualquier tablero: lo blanco es de las
                    // blancas y lo oscuro de las negras. El relleno blanco iba SIN borde
                    // sobre una tarjeta blanca, así que la mitad de las blancas era
                    // invisible y la barra se leía al revés — se veía "lo que falta".
                    '<div class="practice-mini-eval h-2 w-full rounded-full overflow-hidden bg-brand-800 border border-brand-300 dark:border-brand-700 flex mb-1.5" role="img">' +
                        '<div class="practice-mini-bar bg-white h-full transition-all duration-500 ease-out" style="width:50%"></div>' +
                    "</div>" +
                    '<p class="practice-mini-status text-[11px] text-brand-450 dark:text-brand-350"></p>' +
                    // Pidió ayuda: va escrito, no solo con el borde.
                    '<p class="practice-mini-pide hidden text-xs font-bold text-brand-800 dark:text-white mt-1">🙋 Pide ayuda</p>' +
                    // Abre SU partida en grande: mirarla sin tocarla y mandarle una ayuda.
                    '<button type="button" class="practice-mini-mirar mt-2 w-full text-xs font-semibold px-2 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors" aria-haspopup="dialog">👁 Mirar y ayudar</button>' +
                    '<button type="button" class="practice-mini-anotar mt-1.5 w-full text-xs font-semibold px-2 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors"><span aria-hidden="true">📝 </span>Anotar en su bitácora</button>';
                grid.appendChild(wrap);
                const studentId = row.student_id;
                wrap.querySelector(".practice-mini-mirar").addEventListener("click", (e) => abrirMirada(studentId, e.currentTarget));
                wrap.querySelector(".practice-mini-anotar").addEventListener("click", () => {
                    const e2 = practiceStudentBoards[studentId];
                    anotarDesde(studentId, (e2 && e2.nombre) || "Alumno", { fen: e2.board.fen(), texto: "Con la posición de su partida" });
                });
                entry = {
                    el: wrap,
                    nameEl: wrap.querySelector(".practice-mini-name"),
                    colorEl: wrap.querySelector(".practice-mini-color"),
                    evalEl: wrap.querySelector(".practice-mini-eval"),
                    barEl: wrap.querySelector(".practice-mini-bar"),
                    statusEl: wrap.querySelector(".practice-mini-status"),
                    board: new ClasesBoard(wrap.querySelector(".practice-mini-board"), { interactive: false, allowArrows: false, compact: true }),
                };
                practiceStudentBoards[row.student_id] = entry;
            }
            const displayName = (row.profiles && (row.profiles.full_name || row.profiles.email)) || "Alumno";
            entry.nameEl.textContent = displayName;
            entry.nameEl.title = displayName;
            entry.row = row;
            entry.nombre = displayName;
            entry.el.querySelector(".practice-mini-mirar").setAttribute("aria-label", "Mirar y ayudar a " + displayName);
            entry.el.querySelector(".practice-mini-anotar").setAttribute("aria-label", "Anotar en la bitácora de " + displayName);
            entry.colorEl.textContent = row.student_color === "w" ? "· blancas" : "· negras";
            entry.board.setFlipped(row.student_color === "b");
            entry.board.loadMoves(row.moves || [], latestPracticeSession.fen);
            // eval_cp queda en null justo al reintentar (partida recién reiniciada): la barra
            // vuelve al centro en vez de quedarse con el valor de la partida anterior.
            const hayEval = row.eval_cp !== null && row.eval_cp !== undefined;
            entry.barEl.style.width = (hayEval ? evalToBarPercent(row.eval_cp) : 50) + "%";
            // Una barra es una imagen: sin nombre, quien usa lector de pantalla oye "imagen"
            // y nada más. Va en palabras porque el color nunca dice nada solo.
            entry.evalEl.setAttribute("aria-label", !hayEval ? "Todavía sin evaluar"
                : Math.abs(row.eval_cp) < 50 ? "La partida va pareja"
                : "Va mejor " + (row.eval_cp > 0 ? "el blanco" : "el negro"));
            const conAyuda = PracticaAyuda.limpiar(row.ayuda);
            entry.statusEl.textContent = practiceStatusLabelWithAttempts(row)
                + (!conAyuda ? ""
                    : conAyuda.de === profile.id ? " · 💡 con tu ayuda"
                    : conAyuda.nombre ? " · 💡 con ayuda de " + conAyuda.nombre
                    : " · 💡 con ayuda");
            pintarPedidoEnMiniatura(entry, row);
            if (mirar.studentId === row.student_id) refrescarMirada(row);
        }

        // Quien pide ayuda se marca (con texto y con borde) y sube al principio de la
        // grilla; y se dice en voz la primera vez que aparece cada pedido.
        const pedidosAnunciados = new Set();
        function pintarPedidoEnMiniatura(entry, row) {
            const pide = !!row.pide_ayuda_at;
            entry.el.style.order = pide ? "-1" : "";
            entry.el.classList.toggle("ring-4", pide);
            entry.el.classList.toggle("ring-accent-500", pide);
            entry.el.querySelector(".practice-mini-pide").classList.toggle("hidden", !pide);
            entry.el.querySelector(".practice-mini-mirar").setAttribute("aria-label",
                "Mirar y ayudar a " + entry.nombre + (pide ? " (pide ayuda)" : ""));
            if (pide && !pedidosAnunciados.has(row.id + ":" + row.pide_ayuda_at)) {
                pedidosAnunciados.add(row.id + ":" + row.pide_ayuda_at);
                document.getElementById("practica-pedidos-aviso").textContent = entry.nombre + " pide ayuda en su partida.";
            }
        }

        // ---------- La partida de UN alumno, en grande (solo profesor) ----------
        // La mira en vivo sin poder mover sus piezas (el tablero no es interactivo, y la
        // base igual le devuelve la fila tal cual si lo intentara: ver la migración
        // practica_el_profe_mira_y_ayuda) y le manda una ayuda que al alumno le aparece en
        // su tablero. El alumno ve que lo están mirando: viaja en la presencia.
        const mirar = { studentId: null, row: null, board: null, jugadas: null, volverA: null };

        function mirarEl(id) { return document.getElementById("practica-mirar-" + id); }

        function abrirMirada(studentId, boton) {
            const entry = practiceStudentBoards[studentId];
            if (!entry || !entry.row) return;
            if (!mirar.board) {
                mirar.board = new ClasesBoard(mirarEl("tablero"), {
                    interactive: false,
                    allowArrows: true,
                    externalCoords: true,
                    // Lo que se dibuja se escribe en el campo: una sola lista de marcas,
                    // la misma para quien dibuja y para quien escribe.
                    onMarksChange: (m) => { mirarEl("marcas").value = PracticaAyuda.escribirMarcas(m.arrows, m.circles); },
                });
                mirarEl("tablero").setAttribute("aria-label", "Tablero del alumno, solo para mirar");
            }
            mirar.studentId = studentId;
            mirar.volverA = boton || null;
            mirar.jugadas = null;
            mirarEl("nombre").textContent = entry.nombre;
            mirarEl("nombre-pista").textContent = entry.nombre;
            mirarEl("aviso").textContent = "";
            // Lo que ya le había mandado, para seguir desde ahí en vez de empezar de cero.
            const previa = PracticaAyuda.limpiar(entry.row.ayuda);
            mirarEl("pista").value = previa ? previa.texto : "";
            refrescarMirada(entry.row);
            const vigente = PracticaAyuda.vale(previa, (entry.row.moves || []).length);
            ponerMarcasMirada(vigente ? previa.flechas : [], vigente ? previa.circulos : []);
            document.getElementById("practica-mirar").classList.remove("hidden");
            enfocarCuandoSeVea(mirarEl("titulo"));
            anunciarMirada(studentId);
        }

        function ponerMarcasMirada(flechas, circulos) {
            mirar.board.setMarks(flechas, circulos);
            mirarEl("marcas").value = PracticaAyuda.escribirMarcas(flechas, circulos);
        }

        function refrescarMirada(row) {
            if (!mirar.board || !latestPracticeSession) return;
            mirar.row = row;
            const moves = row.moves || [];
            mirar.board.setFlipped(row.student_color === "b");
            mirar.board.loadMoves(moves, latestPracticeSession.fen);
            // Movió (él o el motor): las flechas que el profe tenía dibujadas eran de la
            // posición anterior y ahora señalarían otra cosa.
            const movio = mirar.jugadas !== null && mirar.jugadas !== moves.length;
            if (movio) ponerMarcasMirada([], []);
            mirar.jugadas = moves.length;
            mirarEl("info").textContent = "Juega con " + (row.student_color === "w" ? "blancas" : "negras")
                + " · nivel " + practiceLevelLabel(latestPracticeSession.level)
                + " · " + (moves.length === 1 ? "1 jugada" : moves.length + " jugadas");
            let estado = (row.pide_ayuda_at ? "🙋 Pidió ayuda. " : "") + practiceStatusLabelWithAttempts(row);
            mirarEl("atendido").hidden = !row.pide_ayuda_at;
            if (row.status === "playing") {
                estado += mirar.board.game.turn() === row.student_color ? ". Le toca mover." : ". Piensa el motor.";
            }
            const enviada = PracticaAyuda.limpiar(row.ayuda);
            if (enviada && !PracticaAyuda.vale(enviada, moves.length) && (enviada.flechas.length || enviada.circulos.length)) {
                estado += " Ya jugó después de tu ayuda: las flechas eran para la posición anterior y no se le ven" + (enviada.texto ? "; la pista sí." : ".");
            }
            if (movio) estado += " Se borraron las flechas que tenías dibujadas.";
            mirarEl("estado").textContent = estado;
        }

        function cerrarMirada() {
            if (!mirar.studentId) return;
            mirar.studentId = null;
            mirar.row = null;
            document.getElementById("practica-mirar").classList.add("hidden");
            anunciarMirada(null);
            const volver = mirar.volverA;
            mirar.volverA = null;
            if (volver && volver.isConnected) volver.focus();
        }

        // Lo escrito manda: si no se entiende, se dice qué y no se manda nada.
        function marcasEscritas() {
            const leidas = PracticaAyuda.leerMarcas(mirarEl("marcas").value);
            if (leidas.malas.length) return { error: "No entendí «" + leidas.malas.join(" ") + "»: escribe las flechas como g1-f3 y los círculos como e4." };
            // Si coincide con lo dibujado, se queda con el dibujo (que trae los colores).
            const dibujado = PracticaAyuda.escribirMarcas(mirar.board.arrows, mirar.board.circles);
            if (dibujado !== PracticaAyuda.escribirMarcas(leidas.flechas, leidas.circulos)) {
                mirar.board.setMarks(leidas.flechas, leidas.circulos);
            }
            return { flechas: mirar.board.arrows, circulos: mirar.board.circles };
        }

        async function guardarAyuda(ayuda) {
            const { data, error } = await sb.from("practice_games").update({ ayuda })
                .eq("id", mirar.row.id).select("ayuda, pide_ayuda_at").maybeSingle();
            if (error) return { error: error.message };
            // Se mira lo que QUEDÓ, no lo que se mandó: con la ronda terminada la base la
            // devuelve como estaba sin dar ningún error.
            const quedo = data ? PracticaAyuda.limpiar(data.ayuda) : undefined;
            if (data) {
                // La miniatura no espera el eco de Realtime para decir que ya tiene ayuda.
                const entry = practiceStudentBoards[mirar.studentId];
                if (entry && entry.row) upsertPracticeStudentBoard(Object.assign({}, entry.row,
                    { ayuda: data.ayuda, pide_ayuda_at: data.pide_ayuda_at || null }));
            }
            return { quedo, fila: !!data };
        }

        async function mandarAyuda() {
            if (!mirar.row) return;
            const aviso = mirarEl("aviso");
            const marcas = marcasEscritas();
            if (marcas.error) { aviso.textContent = marcas.error; return; }
            const ayuda = PracticaAyuda.limpiar({
                jugadas: (mirar.row.moves || []).length,
                flechas: marcas.flechas,
                circulos: marcas.circulos,
                texto: mirarEl("pista").value,
            });
            if (!ayuda) { aviso.textContent = "Escribe una pista o marca al menos una flecha o un círculo."; return; }
            const boton = mirarEl("mandar");
            boton.disabled = true;
            const nombre = mirarEl("nombre").textContent;
            const r = await guardarAyuda(ayuda);
            boton.disabled = false;
            if (r.error) { aviso.textContent = "No se pudo mandar la ayuda: " + r.error; return; }
            if (!r.fila || !PracticaAyuda.mismoContenido(r.quedo, ayuda)) {
                aviso.textContent = "No le llegó: la ronda de práctica ya terminó.";
                return;
            }
            const partes = [PracticaAyuda.enPalabras(ayuda), ayuda.texto ? "la pista" : ""].filter(Boolean);
            aviso.textContent = "Le llegó a " + nombre + ": " + partes.join(" y ") + ".";
        }

        async function quitarAyuda() {
            if (!mirar.row) return;
            const aviso = mirarEl("aviso");
            const nombre = mirarEl("nombre").textContent;
            const r = await guardarAyuda(null);
            if (r.error) { aviso.textContent = "No se pudo quitar la ayuda: " + r.error; return; }
            if (!r.fila || r.quedo) { aviso.textContent = "No se pudo quitar: la ronda de práctica ya terminó."; return; }
            ponerMarcasMirada([], []);
            mirarEl("pista").value = "";
            aviso.textContent = "Le quitaste la ayuda a " + nombre + ".";
        }

        // Lo atendió de palabra (por la llamada), sin mandarle nada: se apaga el pedido.
        async function marcarAtendido() {
            if (!mirar.row) return;
            const aviso = mirarEl("aviso");
            const nombre = mirarEl("nombre").textContent;
            const { data, error } = await sb.from("practice_games").update({ pide_ayuda_at: null })
                .eq("id", mirar.row.id).select("ayuda, pide_ayuda_at").maybeSingle();
            if (error) { aviso.textContent = "No se pudo marcar: " + error.message; return; }
            // Se mira lo que QUEDÓ: si la base no lo apagó, no se dice que sí.
            if (!data || data.pide_ayuda_at) { aviso.textContent = "No se pudo marcar como atendido."; return; }
            const entry = practiceStudentBoards[mirar.studentId];
            if (entry && entry.row) upsertPracticeStudentBoard(Object.assign({}, entry.row, { pide_ayuda_at: null }));
            aviso.textContent = "Marcaste como atendido el pedido de " + nombre + ".";
        }

        if (document.getElementById("practica-mirar")) {
            mirarEl("cerrar").addEventListener("click", cerrarMirada);
            mirarEl("atendido").addEventListener("click", marcarAtendido);
            mirarEl("mandar").addEventListener("click", mandarAyuda);
            mirarEl("quitar").addEventListener("click", quitarAyuda);
            // Escribir marcas las dibuja en cuanto se entienden (a medio escribir, «g1-», no).
            mirarEl("marcas").addEventListener("input", () => {
                const leidas = PracticaAyuda.leerMarcas(mirarEl("marcas").value);
                if (!leidas.malas.length && mirar.board) mirar.board.setMarks(leidas.flechas, leidas.circulos);
            });
            // En todo el documento y no solo en el diálogo: mientras se guarda, el botón
            // de mandar se desactiva y el foco se cae al body, y Escape dejaba de cerrar.
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && mirar.studentId) { e.preventDefault(); cerrarMirada(); }
            });
        }

        // Tableros siempre del MISMO tamaño, sin importar cuántos alumnos estén jugando:
        // antes cada uno ocupaba 1/N del ancho de la fila, así que con 1-2 alumnos se veían
        // enormes — y, peor, todos cambiaban de tamaño en el momento en que un alumno más se
        // conectaba, justo mientras el profesor los está mirando.
        //
        // Pero el tope estaba en 160px, o sea casillas de 16px y piezas de 10: ahí no se
        // distingue ni la figura ni de qué color es. 190 es lo más chico donde la pieza
        // dibujada se reconoce de un vistazo (medido en pantalla, no a ojo) y siguen
        // entrando tres por fila en la columna del profesor. El `min(…, 100%)` es para que
        // en una pantalla más angosta que una tarjeta se encoja en vez de desbordarse.
        function updatePracticeBoardsGridColumns() {
            const grid = document.getElementById("practice-boards-grid");
            grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(min(190px, 100%), 190px))";
            grid.style.justifyContent = "center";
        }

        async function loadPracticeGamesForSession(sessionId) {
            const { data, error } = await sb.from("practice_games").select("*, profiles(full_name, email)").eq("session_id", sessionId).order("created_at");
            if (error) { console.error(error); return; }
            // La ronda pudo cerrarse (o cambiar) mientras esta consulta estaba en vuelo.
            if (!latestPracticeSession || latestPracticeSession.id !== sessionId) return;
            const rows = data || [];
            const seen = new Set();
            for (const row of rows) {
                seen.add(row.student_id);
                upsertPracticeStudentBoard(row);
            }
            // Por si alguna fila se borró manualmente: quita su tarjeta de la grilla.
            Object.keys(practiceStudentBoards).forEach((studentId) => {
                if (!seen.has(studentId)) {
                    if (mirar.studentId === studentId) cerrarMirada();
                    practiceStudentBoards[studentId].el.remove();
                    delete practiceStudentBoards[studentId];
                }
            });
            updatePracticeBoardsGridColumns(rows.length);
            const piden = rows.filter((r) => r.pide_ayuda_at).length;
            document.getElementById("practice-boards-hint").textContent = rows.length
                ? rows.length + (rows.length === 1 ? " alumno jugando" : " alumnos jugando")
                    + (piden ? " · 🙋 " + piden + (piden === 1 ? " pide ayuda" : " piden ayuda") : "")
                : "Esperando a que los alumnos empiecen a jugar…";
        }

        document.getElementById("start-practice-btn").addEventListener("click", async () => {
            // Mismo motivo que en "Preguntar": este botón tampoco pasa por
            // aplicarPosicionEnClase() (la práctica arranca de la posición YA visible, no
            // manda una nueva), así que board.fen() no está garantizado si el editor se
            // quedó abierto a mitad de una edición — y esa es justo la puerta por la que
            // "el bot" (Stockfish, en el navegador de cada alumno) se rompe para el resto
            // de la sesión (ver js/shared-engine.js).
            const motivoPractica = motivoPosicionInvalida(board.fen());
            if (motivoPractica) { setStatus(motivoPractica); return; }
            if (typeof PracticeEngine !== "undefined") PracticeEngine.preload();
            const { error } = await crearPractica(board.fen(), selectedPracticeLevel);
            if (error) { console.error(error); setStatus("No se pudo iniciar la práctica: " + error.message); return; }
            setStatus("Práctica iniciada: los alumnos ya pueden jugar contra el motor.");
        });

        document.getElementById("end-practice-btn").addEventListener("click", async () => {
            if (!latestPracticeSession || latestPracticeSession.ended_at) return;
            const { error } = await sb.from("practice_sessions").update({ ended_at: new Date().toISOString() }).eq("id", latestPracticeSession.id);
            if (error) { console.error(error); return; }
            setStatus("Práctica terminada.");
        });

        // ---------- Tarjeta del alumno: partida real contra el motor (overlay sobre el tablero) ----------
        // Al arrancar una ronda, el profesor primero cierra la anterior (UPDATE) y luego crea
        // la nueva (INSERT): son dos cambios en practice_sessions, así que a veces le llegan al
        // alumno casi juntos y renderStudentPracticeCard() se dispara dos veces casi a la vez.
        // Esta cola evita que ambas corran en paralelo (la segunda espera a que la primera
        // termine, y para entonces ya encuentra la fila creada por la primera).
        let practiceCardRenderBusy = Promise.resolve();
        function renderStudentPracticeCard() {
            const run = practiceCardRenderBusy.then(renderStudentPracticeCardNow, renderStudentPracticeCardNow);
            practiceCardRenderBusy = run.catch(() => {});
            return run;
        }

        // De qué ronda ya se abrió el overlay: el foco se lleva a la práctica solo la
        // primera vez que aparece, no en cada repintado (le robaría el foco al recuadro).
        let practiceCardAbiertaPara = null;
        async function renderStudentPracticeCardNow() {
            const card = document.getElementById("practice-card");
            const reopenBtn = document.getElementById("practice-reopen-btn");
            if (!latestPracticeSession || latestPracticeSession.ended_at) {
                card.classList.add("hidden");
                reopenBtn.classList.add("hidden");
                practiceCardDismissedFor = null;
                myPracticeGame = null;
                pintarAyudaAlumno();
                pintarPedidoAlumno();
                return;
            }
            // El alumno cerró este mismo overlay con la ✖: la ronda sigue activa (la partida
            // contra el motor continúa por debajo, ver más abajo), solo se deja de imponer el
            // overlay encima de lo que esté mirando — el botón flotante lo deja volver cuando
            // quiera.
            const dismissed = practiceCardDismissedFor === latestPracticeSession.id;
            card.classList.toggle("hidden", dismissed);
            reopenBtn.classList.toggle("hidden", !dismissed);
            document.getElementById("practice-card-level").textContent = practiceLevelLabel(latestPracticeSession.level);
            if (typeof PracticeEngine !== "undefined") PracticeEngine.preload();

            // ¿Ya tengo una partida en esta ronda? (por ejemplo, si recargué la página a mitad,
            // o si ya la creó una llamada anterior a esta misma función).
            const { data: existing, error } = await sb.from("practice_games").select("*")
                .eq("session_id", latestPracticeSession.id).eq("student_id", profile.id).maybeSingle();
            if (error) { console.error(error); return; }

            if (existing) {
                myPracticeGame = existing;
            } else {
                const studentColor = latestPracticeSession.fen.split(" ")[1] === "b" ? "b" : "w";
                const { data: created, error: insertError } = await sb.from("practice_games").insert({
                    session_id: latestPracticeSession.id, student_id: profile.id, student_color: studentColor,
                    fen: latestPracticeSession.fen, moves: [],
                }).select().single();
                if (insertError) {
                    // La cola de arriba ya cubre el caso normal, pero por si acaso llegó otro
                    // evento fuera de esa cola (o de otra pestaña): en vez de fallar, se
                    // vuelve a pedir la fila — si el error fue justamente "ya existe", ahí está.
                    const { data: retryExisting } = await sb.from("practice_games").select("*")
                        .eq("session_id", latestPracticeSession.id).eq("student_id", profile.id).maybeSingle();
                    if (!retryExisting) { console.error(insertError); return; }
                    myPracticeGame = retryExisting;
                } else {
                    myPracticeGame = created;
                }
            }

            document.getElementById("practice-card-color").textContent = myPracticeGame.student_color === "w" ? "blancas" : "negras";

            if (!practiceBoard) {
                practiceBoard = new ClasesBoard(document.getElementById("practice-board"), {
                    interactive: false,
                    allowArrows: false,
                    externalCoords: true,
                    onMove: (fen, san, moves) => onPracticeStudentMove(fen, moves),
                });
                practicaAcc = window.ClaseAdaptada ? ClaseAdaptada.montar(document.getElementById("practice-cmd"), () => practiceBoard, {
                    etiqueta: "Escribe tu jugada, o una pregunta sobre la posición",
                    porQueNoPuedes: () => !myPracticeGame || myPracticeGame.status !== "playing"
                        ? "Esta partida ya terminó. Usa «Reintentar» para empezarla de nuevo."
                        : "El motor está pensando su jugada: espera un momento.",
                }) : null;
            }
            const practicaRecienAbierta = practiceCardAbiertaPara !== latestPracticeSession.id && !dismissed;
            if (!dismissed) practiceCardAbiertaPara = latestPracticeSession.id;
            practiceBoard.setFlipped(myPracticeGame.student_color === "b");
            practiceBoard.loadMoves(myPracticeGame.moves || [], latestPracticeSession.fen);
            pintarAyudaAlumno();
            pintarPedidoAlumno();
            if (practicaAcc) practicaAcc.actualizar();
            if (practicaRecienAbierta) enfocarCuandoSeVea(document.getElementById("practice-titulo"));
            updatePracticeCardInteractivity();
            // Recuperación automática: si al entrar (o recargar la página a mitad de una
            // partida) resulta que le toca mover al motor y no al alumno, es que se había
            // quedado esperando una respuesta que nunca llegó — se la vuelve a pedir sin
            // que el alumno tenga que hacer nada.
            requestEngineReply(myPracticeGame.id, myPracticeGame.attempts || 1);
        }

        function updatePracticeCardInteractivity() {
            const statusEl = document.getElementById("practice-card-status");
            const resignBtn = document.getElementById("practice-resign-btn");
            const retryBtn = document.getElementById("practice-retry-btn");
            const retryEngineBtn = document.getElementById("practice-retry-engine-btn");
            if (!myPracticeGame || myPracticeGame.status !== "playing") {
                if (practiceBoard) practiceBoard.setInteractive(false);
                statusEl.textContent = myPracticeGame ? practiceStatusLabel(myPracticeGame.status) : "";
                resignBtn.classList.add("hidden");
                retryEngineBtn.classList.add("hidden");
                retryBtn.classList.toggle("hidden", !myPracticeGame);
                return;
            }
            resignBtn.classList.remove("hidden");
            retryBtn.classList.add("hidden");
            const myTurn = practiceBoard.game.turn() === myPracticeGame.student_color;
            practiceBoard.setInteractive(myTurn && !practiceEngineBusy);
            // Si la última consulta al motor no devolvió jugada (ver requestEngineReply), se
            // ofrece un botón para pedirla de nuevo sin tener que reiniciar toda la partida.
            const stuck = practiceEngineLastFailed && !myTurn && !practiceEngineBusy;
            retryEngineBtn.classList.toggle("hidden", !stuck);
            statusEl.textContent = practiceEngineBusy
                ? "El motor está pensando…"
                : (myTurn ? "Es tu turno." : (stuck ? "El motor no respondió — toca \"Pedir jugada del motor\" para intentarlo de nuevo." : "Esperando la jugada del motor…"));
        }

        async function savePracticeGameRow(patch) {
            if (!myPracticeGame) return;
            const { error } = await sb.from("practice_games").update(patch).eq("id", myPracticeGame.id);
            if (error) { console.error(error); return; }
            myPracticeGame = Object.assign({}, myPracticeGame, patch);
        }

        // gameIdAtMove/attemptsAtMove: por si mientras el motor pensaba el alumno se rindió o
        // reintentó la ronda (misma fila de practice_games, mismo id — el reintento no crea
        // una fila nueva, solo la resetea — así que comparar solo el id no alcanza para
        // detectar un reintento de por medio; attempts sí cambia con cada reintento).
        async function updatePracticeGameEval(fen, gameIdAtMove, attemptsAtMove) {
            if (typeof PracticeEngine === "undefined" || !myPracticeGame) return;
            const turnAtEval = fen.split(" ")[1];
            const score = await PracticeEngine.evaluate(fen);
            if (!score || !myPracticeGame) return;
            if (myPracticeGame.id !== gameIdAtMove || myPracticeGame.attempts !== attemptsAtMove) return;
            await savePracticeGameRow({ eval_cp: scoreToWhiteCp(score, turnAtEval) });
        }

        // true si la última consulta al motor se quedó sin jugada (timeout interno de
        // practice-engine.js, worker que no contestó, etc.) — ver requestEngineReply().
        // Antes, si esto pasaba una sola vez, el alumno se quedaba viendo "Esperando la
        // jugada del motor…" para siempre, sin ninguna forma de salir de ahí más que
        // rendirse o reiniciar toda la partida.
        let practiceEngineLastFailed = false;

        // Le pide al motor la respuesta a la posición actual y la aplica. Reintenta un par
        // de veces antes de rendirse (el motor corre en un Worker de este mismo navegador:
        // un solo hiccup transitorio no debería dejar al alumno esperando para siempre) y,
        // si de plano no contesta, lo deja en claro en pantalla con un botón para reintentar
        // (ver updatePracticeCardInteractivity). Se llama tanto justo después de la jugada
        // del alumno como al recargar la página a mitad de una espera (ver
        // renderStudentPracticeCardNow) — por eso vuelve a leer el turno actual en vez de
        // asumir que ya le toca al motor.
        async function requestEngineReply(gameIdAtMove, attemptsAtMove) {
            if (practiceEngineBusy) return; // ya hay una consulta en curso, no duplicarla
            if (!myPracticeGame || myPracticeGame.id !== gameIdAtMove || myPracticeGame.attempts !== attemptsAtMove || myPracticeGame.status !== "playing") return;
            if (practiceBoard.game.turn() === myPracticeGame.student_color) return; // ya le toca al alumno

            practiceEngineBusy = true;
            practiceEngineLastFailed = false;
            updatePracticeCardInteractivity();
            const levelAtRequest = latestPracticeSession ? latestPracticeSession.level : "1500";
            let uci = null;
            for (let attempt = 0; attempt < 3 && !uci; attempt++) {
                const fen = practiceBoard.game.fen();
                uci = typeof PracticeEngine !== "undefined" ? await PracticeEngine.getMove(fen, levelAtRequest) : null;
                // Mientras el motor pensaba pudo cerrarse esta ronda, el profesor pudo lanzar
                // una nueva, o el propio alumno pudo rendirse o reintentar esta misma partida:
                // en cualquiera de esos casos, no seguir insistiendo con datos ya viejos.
                if (!myPracticeGame || myPracticeGame.id !== gameIdAtMove || myPracticeGame.attempts !== attemptsAtMove || myPracticeGame.status !== "playing") {
                    /* La ronda nueva se pintó con el motor ocupado —el tablero
                       quieto y «el motor está pensando»— y su propio pedido
                       salió de inmediato por ese mismo `busy`. Sin repintar y
                       sin volver a pedir, al alumno le tocaría mover en un
                       tablero que no responde nunca. */
                    practiceEngineBusy = false;
                    updatePracticeCardInteractivity();
                    if (myPracticeGame && myPracticeGame.status === "playing") {
                        requestEngineReply(myPracticeGame.id, myPracticeGame.attempts);
                    }
                    return;
                }
            }
            practiceEngineBusy = false;
            // Tres intentos sin respuesta: el bot mueve igual (ver jugadaDeRespaldo).
            if (!uci && typeof PracticeEngine !== "undefined") uci = PracticeEngine.jugadaDeRespaldo(practiceBoard.game.fen());

            if (uci) {
                const move = practiceBoard.game.move({
                    from: uci.slice(0, 2), to: uci.slice(2, 4),
                    promotion: uci.length > 4 ? uci.slice(4, 5) : "q",
                });
                if (move) {
                    practiceBoard.render();
                    pintarAyudaAlumno();
                    if (practicaAcc) {
                        practicaAcc.actualizar();
                        practicaAcc.decir("El motor jugó " + ClaseAdaptada.hablarJugada(move.san) + ". "
                            + (practiceBoard.game.game_over() ? "" : "Te toca."));
                    }
                    const newFen = practiceBoard.game.fen();
                    const newMoves = practiceBoard.game.history();
                    const newStatus = practiceResultForStudent(practiceBoard.game, myPracticeGame.student_color);
                    await savePracticeGameRow({ fen: newFen, moves: newMoves, status: newStatus });
                    updatePracticeGameEval(newFen, gameIdAtMove, attemptsAtMove);
                }
            } else {
                practiceEngineLastFailed = true;
            }
            updatePracticeCardInteractivity();
        }

        async function onPracticeStudentMove(fen, moves) {
            if (!myPracticeGame) return;
            pintarAyudaAlumno();
            if (practicaAcc) practicaAcc.actualizar();
            const gameIdAtMove = myPracticeGame.id;
            const attemptsAtMove = myPracticeGame.attempts || 1;
            practiceBoard.setInteractive(false);
            const status = practiceResultForStudent(practiceBoard.game, myPracticeGame.student_color);
            const reloj = relojDespuesDeMover();
            await savePracticeGameRow(Object.assign({ fen, moves, status }, reloj === null ? {} : { reloj_ms: reloj }));
            updatePracticeGameEval(fen, gameIdAtMove, attemptsAtMove); // en segundo plano, no bloquea la jugada del motor
            if (status !== "playing") { updatePracticeCardInteractivity(); return; }
            await requestEngineReply(gameIdAtMove, attemptsAtMove);
        }

        // El alumno se rinde a mitad de partida (incluso mientras el motor está "pensando" su
        // respuesta: el guard de arriba en onPracticeStudentMove evita que esa jugada, ya
        // obsoleta, se aplique después). No cuenta como un intento nuevo — solo termina el
        // actual, para eso está "Reintentar".
        async function resignPracticeGame() {
            if (!myPracticeGame || myPracticeGame.status !== "playing") return;
            if (practiceBoard) practiceBoard.setInteractive(false);
            await savePracticeGameRow({ status: "resigned" });
            updatePracticeCardInteractivity();
        }

        // Reinicia la MISMA ronda desde la posición con la que arrancó (no crea una fila
        // nueva: reutiliza la fila de practice_games, así el profesor sigue viendo un solo
        // tablero por alumno) y suma un intento — el profesor ve ese número en su grilla.
        async function retryPracticeGame() {
            if (!myPracticeGame || !latestPracticeSession || latestPracticeSession.ended_at) return;
            await savePracticeGameRow({
                fen: latestPracticeSession.fen, moves: [], status: "playing",
                eval_cp: null, attempts: (myPracticeGame.attempts || 1) + 1, reloj_ms: null,
            });
            // La base borra la ayuda al reintentar: era de la partida anterior.
            myPracticeGame = Object.assign({}, myPracticeGame, { ayuda: null, pide_ayuda_at: null });
            practiceBoard.loadMoves([], latestPracticeSession.fen);
            pintarAyudaAlumno();
            pintarPedidoAlumno();
            updatePracticeCardInteractivity();
        }

        // ---------- La ayuda del profe, en la tarjeta del alumno ----------
        // Las flechas se pintan SOLO en la posición para la que se dieron: después de la
        // siguiente jugada señalarían otra cosa. La pista sigue a la vista. Todo va
        // también en palabras: el color de una flecha no dice nada solo.
        // ---------- Pedir ayuda desde la partida ----------
        // El pedido vive en su fila (pide_ayuda_at): lo ve su profe y quien observa, y
        // se apaga solo cuando alguien le manda una ayuda. La hora la pone la base.
        let pedidoPintado = null;
        function pintarPedidoAlumno() {
            const boton = document.getElementById("practica-pedir-ayuda");
            if (!boton || isTeacher || esObservador) return;
            const pide = !!(myPracticeGame && myPracticeGame.pide_ayuda_at);
            boton.setAttribute("aria-pressed", pide ? "true" : "false");
            boton.textContent = pide ? "✋ Pediste ayuda · Cancelar" : "🙋 Pedir ayuda";
            if (pedidoPintado === pide) return;   // la región viva no se reescribe igual
            const antes = pedidoPintado;
            pedidoPintado = pide;
            document.getElementById("practica-pedido").textContent = pide
                ? "Le avisamos a tu profe que necesitas ayuda. Sigue jugando si quieres: te va a llegar aquí."
                : antes ? "Tu pedido de ayuda ya no está activo." : "";
        }

        document.getElementById("practica-pedir-ayuda").addEventListener("click", async () => {
            if (!myPracticeGame) return;
            const pide = !!myPracticeGame.pide_ayuda_at;
            await savePracticeGameRow({ pide_ayuda_at: pide ? null : new Date().toISOString() });
            pintarPedidoAlumno();
        });

        let ayudaPintada = null; // lo último escrito en la región viva, para no repetirlo
        function pintarAyudaAlumno() {
            const caja = document.getElementById("practica-ayuda");
            if (!caja || isTeacher) return;
            const ayuda = myPracticeGame ? PracticaAyuda.limpiar(myPracticeGame.ayuda) : null;
            const jugadas = practiceBoard ? practiceBoard.game.history().length : 0;
            const vigente = PracticaAyuda.vale(ayuda, jugadas);
            if (practiceBoard) practiceBoard.setMarks(vigente ? ayuda.flechas : [], vigente ? ayuda.circulos : []);
            const clave = ayuda ? JSON.stringify(ayuda) + ":" + vigente : "";
            if (clave === ayudaPintada) return; // reescribir la región viva la volvería a leer
            ayudaPintada = clave;
            if (!ayuda) { caja.replaceChildren(); return; }
            const marco = document.createElement("div");
            marco.className = "mt-3 rounded-lg border-2 border-accent-500 p-3 text-sm text-brand-800 dark:text-white";
            const titulo = document.createElement("p");
            titulo.className = "font-semibold";
            const ico = document.createElement("span");
            ico.setAttribute("aria-hidden", "true");
            ico.textContent = "💡 ";
            // La base pone quién la dio: puede ser su profe o alguien de supervisión.
            titulo.append(ico, ayuda.de && ayuda.de !== boardOwnerId && ayuda.nombre
                ? "Ayuda de " + ayuda.nombre : "Ayuda de tu profe");
            marco.appendChild(titulo);
            if (ayuda.texto) {
                const t = document.createElement("p");
                t.className = "mt-1";
                t.textContent = ayuda.texto;
                marco.appendChild(t);
            }
            const marcas = PracticaAyuda.enPalabras(ayuda);
            if (marcas) {
                const m = document.createElement("p");
                m.className = "mt-1 text-xs text-brand-600 dark:text-brand-300";
                m.textContent = vigente
                    ? "En tu tablero: " + marcas + "."
                    : "Te había marcado " + marcas + ", pero era para la posición de antes de tu jugada: ya no se muestran.";
                marco.appendChild(m);
            }
            caja.replaceChildren(marco);
        }

        document.getElementById("practice-resign-btn").addEventListener("click", resignPracticeGame);
        document.getElementById("practice-retry-btn").addEventListener("click", retryPracticeGame);
        document.getElementById("practice-retry-engine-btn").addEventListener("click", () => {
            if (!myPracticeGame) return;
            requestEngineReply(myPracticeGame.id, myPracticeGame.attempts || 1);
        });

        document.getElementById("practice-close-btn").addEventListener("click", () => {
            if (!latestPracticeSession) return;
            practiceCardDismissedFor = latestPracticeSession.id;
            renderStudentPracticeCard();
        });
        document.getElementById("practice-reopen-btn").addEventListener("click", () => {
            practiceCardDismissedFor = null;
            practiceCardAbiertaPara = null;   // que el foco vuelva a la práctica al reabrirla
            renderStudentPracticeCard();
        });

        // ---------- La clase todavía no empezó ----------
        // Lo que devolvió mis_clases(): un renglón por profesor, con si tiene
        // clase abierta ahora. Se guarda porque lo usan las dos pantallas —la
        // de espera y el selector de arriba— y pedirlo dos veces sería la misma
        // consulta para el mismo dato.
        let clasesDelAlumno = [];

        function mostrarSinClase() {
            const mia = clasesDelAlumno.find((c) => c.profesor_id === boardOwnerId);
            const nombre = (mia && mia.profesor) || "Tu profe";
            // Con varios profesores, que OTRO tenga clase abierta es el dato que
            // hace falta: si no, el alumno se queda esperando a quien hoy no va a
            // abrir mientras su otra clase ya empezó, y eso no se adivina.
            const otra = clasesDelAlumno.find((c) => c.clase_abierta && c.profesor_id !== boardOwnerId);
            document.getElementById("sin-clase-texto").textContent = otra
                ? nombre + " todavía no ha abierto la clase, pero " + otra.profesor + " sí tiene una en curso ahora mismo."
                : nombre + " todavía no ha abierto la clase. Cuando la abra vas a entrar directo al tablero.";
            // El selector es el mismo de arriba y solo aparece con dos o más
            // profesores; acá es además la forma de pasarse a la clase que sí
            // está abierta.
            ClaseElegida.montarSelector(document.getElementById("sin-clase-selector"), clasesDelAlumno, boardOwnerId);
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("sin-clase").classList.remove("hidden");
        }

        /* Un canal por profesor, no solo por el que está mirando: la clase la
           puede abrir cualquiera de ellos, y con un canal filtrado por
           boardOwnerId el alumno se quedaría en esta pantalla hasta que
           recargara — sin que nada fallara. */
        function esperarLaClase() {
            const ids = [...new Set(clasesDelAlumno.map((c) => c.profesor_id).filter(Boolean))];
            ids.forEach((id) => {
                sb.channel("clase-abre:" + id)
                    .on("postgres_changes", { event: "*", schema: "public", table: "class_sessions", filter: "created_by=eq." + id }, async (payload) => {
                        const abrio = payload.new && !payload.new.ended_at;
                        // La suya y abierta: se entra. Recargar y no montar acá
                        // es la misma decisión que cambiar de clase — todo
                        // cuelga de boardOwnerId y montarlo a mano dejaría la
                        // mitad sin suscribir.
                        if (abrio && id === boardOwnerId) { window.location.reload(); return; }
                        const { clases } = await ClaseElegida.resolver();
                        if (clases && clases.length) clasesDelAlumno = clases;
                        mostrarSinClase();
                    })
                    .subscribe();
            });
        }

        // ---------- Arranque ----------
        /* Antes de montar nada: ¿ese profesor tiene la clase abierta y quien
           mira lo supervisa? Las dos cosas las contesta la RLS —class_sessions
           le entrega a quien supervisa las clases de su gente, y el tablero
           solo con la clase abierta—; acá se dice en palabras en vez de pintar
           un tablero vacío. Devuelve false si no hay nada que mirar. */
        async function prepararObservador() {
            const [perfilRes, claseRes, salasRes] = await Promise.all([
                sb.from("profiles").select("full_name, email").eq("id", boardOwnerId).maybeSingle(),
                sb.from("class_sessions").select("id").eq("created_by", boardOwnerId).is("ended_at", null).limit(1),
                sb.from("profesor_videollamada").select("grupo, enlace").eq("profesor_id", boardOwnerId),
            ]);
            const p = perfilRes && perfilRes.data;
            nombreObservado = (p && (p.full_name || p.email)) || "este profesor";
            const abierta = claseRes && claseRes.data && claseRes.data.length;
            if (!abierta) {
                document.querySelector("#sin-clase h1").textContent = "No hay clase en este momento";
                document.getElementById("sin-clase-texto").textContent = p
                    ? nombreObservado + " no tiene la clase abierta ahora. Cuando la abra, vas a poder mirarla desde " + observaDesde.pantalla + "."
                    : "Esa persona no está a tu cargo, o no tiene la clase abierta ahora.";
                const volver = document.querySelector("#sin-clase a[href]");
                volver.href = observaDesde.volver;
                volver.textContent = "← Volver a " + observaDesde.pantalla;
                document.querySelector("#sin-clase p.text-sm").hidden = true;
                document.getElementById("loading").classList.add("hidden");
                document.getElementById("sin-clase").classList.remove("hidden");
                return false;
            }
            const volverPanel = document.querySelector("#observador-panel a[href]");
            volverPanel.href = observaDesde.volver;
            volverPanel.textContent = "← Volver a " + observaDesde.pantalla;
            document.getElementById("observador-texto").textContent =
                "Clase de " + nombreObservado + ". Solo miras: no mueves el tablero, no contestas y no cuentas como alumno. "
                + nombreObservado + " ve que estás mirando. Si la clase practica contra el motor, abajo del tablero "
                + "ves la partida de cada alumno y puedes ayudar a uno con flechas y una pista, sin jugar por él.";
            // Las salas de videollamada de su clase, si tiene (la RLS solo las
            // entrega con la clase abierta).
            const caja = document.getElementById("observador-llamadas");
            ((salasRes && salasRes.data) || [])
                .filter((x) => window.Videollamada ? Videollamada.esSeguro(x.enlace) : /^https:\/\//.test(x.enlace || ""))
                .forEach((x) => {
                    const a = document.createElement("a");
                    a.href = x.enlace;
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    a.className = "inline-block bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                    a.textContent = "📹 Entrar a la videollamada" + (x.grupo ? " (" + x.grupo + ")" : "");
                    caja.appendChild(a);
                });
            pintarObservadores([]);
            return true;
        }

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html"; return; }

            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { setStatus("No se pudo cargar tu perfil."); return; }
            profile = profileData;
            isTeacher = profile.role === "profesor" || profile.is_admin === true;
            const observar = new URLSearchParams(location.search).get("observar");
            if (observar && observar !== profile.id && (profile.es_supervisor || profile.is_admin || profile.es_coordinador)) {
                esObservador = true;
                observaDesde = profile.is_admin ? OBSERVA_DESDE.administracion
                    : profile.es_supervisor ? OBSERVA_DESDE.supervision : OBSERVA_DESDE.coordinacion;
                isTeacher = false;
                boardOwnerId = observar;
                if (!(await prepararObservador())) return;
            } else if (isTeacher) {
                boardOwnerId = profile.id;
            } else {
                // Con más de un profesor, el alumno elige a cuál clase entra.
                const { clases, elegida } = await ClaseElegida.resolver();
                boardOwnerId = elegida;
                clasesDelAlumno = clases;
            }
            if (!boardOwnerId) {
                setStatus("Todavía no tienes un profesor asignado — pídele a la persona administradora que te asigne uno.");
                document.getElementById("loading").classList.add("hidden");
                return;
            }

            /* La sesión en vivo empieza cuando el profesor ABRE la clase.
               Sin clase abierta la RLS no le entrega al alumno ni el tablero ni
               las variantes (ver la migración
               `sesion_en_vivo_solo_con_clase_abierta`), así que seguir adelante
               solo conseguiría pintarle una pantalla vacía: el candado se vería
               como una página rota. Y la clase ya no se abre sola cuando entra
               un alumno — justamente para que «hay clase» signifique algo. */
            if (!isTeacher && !esObservador) {
                const mia = clasesDelAlumno.find((c) => c.profesor_id === boardOwnerId);
                if (!mia || !mia.clase_abierta) { mostrarSinClase(); esperarLaClase(); return; }
                ClaseElegida.montarSelector(document.getElementById("selector-clase-wrap"), clasesDelAlumno, boardOwnerId);
            }

            const badge = document.getElementById("role-badge");
            badge.textContent = esObservador ? observaDesde.insignia : isTeacher ? "Profesor" : "Alumno";
            badge.classList.add(isTeacher ? "bg-accent-500" : "bg-brand-600", isTeacher ? "text-brand-900" : "text-white");

            if (isTeacher) {
                document.getElementById("teacher-toolbar").classList.remove("hidden");
                document.getElementById("modo-sencillo-fila").classList.remove("hidden");
                document.getElementById("engine-panel").classList.remove("hidden");
                document.getElementById("teacher-tabs-wrap").classList.remove("hidden");
                document.getElementById("clear-chat-btn").classList.remove("hidden");
                document.getElementById("chat-student-picker").classList.remove("hidden");
                let savedTab = TEACHER_TABS[0];
                try { savedTab = localStorage.getItem(TEACHER_TAB_KEY) || savedTab; } catch (e) {}
                activateTeacherTab(savedTab);
                await arrancarModoSencillo();
                cargarCupoInvitaciones();
                cargarPlanesEnClase();
                setupTeacherLessonTools();
                setupArchivosTools();
            } else if (esObservador) {
                document.getElementById("observador-panel").classList.remove("hidden");
            } else {
                document.getElementById("student-panel").classList.remove("hidden");
                document.getElementById("raise-hand-btn").classList.remove("hidden");
                cargarMisTrofeos();
            }
            setStatus(esObservador
                ? "Estás mirando la clase de " + nombreObservado + " en vivo. El tablero se mueve solo con cada jugada."
                : isTeacher
                ? "Mueve el tablero: cada jugada se transmite en vivo a todos los alumnos conectados."
                : "Bienvenido a la clase. Verás el tablero moverse en vivo mientras el profesor juega.");

            initBoardForRole();
            await loadGameState();
            subscribeRealtime();
            subscribePresence();
            await checkOpenClassSession();
            subscribeClassSessions();
            conectarControlesDeClase();
            await loadVariantTree();
            subscribeVariants();
            /* Quien observa ve el tablero, las variantes y quién está
               conectado; las preguntas, la práctica y el chat son entre el
               profesor y cada alumno. */
            if (esObservador) {
                // La práctica sí: mirar la partida de un alumno y ayudarlo (ver
                // «El profe mira la partida de un alumno y lo ayuda»). La RLS se
                // la entrega solo con la clase abierta.
                await loadCurrentPractice();
                subscribePractice();
                document.getElementById("loading").classList.add("hidden");
                document.getElementById("app").classList.remove("hidden");
                return;
            }
            if (isTeacher) { montarControlesDePreguntas(); montarControlesDePractica(); }
            await loadCurrentQuestion();
            subscribeQuestions();
            await loadCurrentPractice();
            subscribePractice();
            if (isTeacher) { await loadChatStudents(); } else { await loadChatMessages(); }
            subscribeChat();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }

        document.getElementById("logout-btn").addEventListener("click", async () => {
            if (presenceChannel) await presenceChannel.untrack();
            await stopPresenceLog();
            await sb.auth.signOut();
            window.location.href = "index.html";
        });

        // Salir por las migas o por el logo cierra antes la asistencia del
        // alumno, para que el registro diga a qué hora se fue de verdad.
        document.querySelectorAll("#migas a, #marca-enlace").forEach((enlace) => {
            enlace.addEventListener("click", async (e) => {
                if (!presenceLogId) return; // nada que cerrar (profesor, o todavía sin clase abierta)
                e.preventDefault();
                await stopPresenceLog();
                window.location.href = enlace.href;
            });
        });

        document.getElementById("reset-board-btn").addEventListener("click", async () => {
            board.reset();
            board.viewLive(); // la clase vuelve a la partida (vista null): el profe también
            board.setMarks([], []);
            comentariosClase = {};
            await pushBoardState({ comentarios: {} });
            await clearVariantTree();
            cerrarLeccionLocal(); // reiniciar el tablero también suelta el curso que estaba abierto en el panel del profesor
            updateTurnIndicator();
            renderMoveList();
            if (isTeacher) updateEngineEval();
        });

        document.getElementById("clear-marks-btn").addEventListener("click", () => board.clearMarks());

        /* Cuántos alumnos nuevos puede invitar este profesor. El tope lo pone quien
         * administra (profiles.invitaciones_max) y el descuento lo hace la función
         * create-student al invitar: esto es solo para que el profesor lo sepa
         * antes de escribir el correo, no es lo que manda. */
        let cupoRestante = null;   // null = sin tope (quien administra)

        function pintarCupo(restantes) {
            cupoRestante = restantes;
            const el = document.getElementById("create-student-cupo");
            const btn = document.getElementById("create-student-btn");
            if (!el) return;
            if (restantes === null) { el.textContent = ""; return; }
            if (restantes <= 0) {
                el.textContent = "No te quedan invitaciones. Pídele más a la persona administradora.";
                el.className = "text-xs font-semibold text-accent-700 dark:text-accent-400";
                if (btn) btn.disabled = true;
            } else {
                el.textContent = restantes === 1 ? "Te queda 1 invitación." : `Te quedan ${restantes} invitaciones.`;
                el.className = "text-xs text-brand-450 dark:text-brand-350";
                if (btn) btn.disabled = false;
            }
        }

        async function cargarCupoInvitaciones() {
            try {
                const { data } = await sb.from("profiles")
                    .select("is_admin, invitaciones_max, invitaciones_usadas")
                    .eq("id", session.user.id).single();
                if (!data) return;
                if (data.is_admin) { pintarCupo(null); return; }
                pintarCupo(Math.max((data.invitaciones_max || 0) - (data.invitaciones_usadas || 0), 0));
            } catch (e) { /* si no se puede leer, el servidor igual lo hace cumplir */ }
        }

        /* Qué se ve y qué se pide según haya correo propio o no. El campo del
           correo se apaga en vez de esconderse: así se ve que sigue ahí y que
           lo que cambió es que ya no hace falta. */
        function pintarModoAlumno() {
            const sinCorreo = document.getElementById("student-sin-correo").checked;
            const correo = document.getElementById("student-email");
            const usuario = document.getElementById("student-usuario");
            correo.disabled = sinCorreo;
            correo.required = !sinCorreo;
            correo.classList.toggle("opacity-50", sinCorreo);
            document.getElementById("student-casa").classList.toggle("hidden", !sinCorreo);
            document.getElementById("student-usuario-dominio").textContent = "@" + UsuarioAlumno.DOMINIO;
            // Se propone desde el nombre, pero lo escrito a mano no se pisa.
            if (sinCorreo && !usuario.dataset.tocado) {
                usuario.value = baseDeUsuarioEnPantalla(document.getElementById("student-name").value);
            }
        }

        /* La misma regla que `baseDeUsuario()` de la Edge Function: primer
           nombre y primer apellido, sin tildes. Acá solo PROPONE lo que se ve;
           quien decide es el servidor, que además desempata si ya está tomado.
           Que las dos coincidan lo comprueba verificar-alumno-sin-correo.js. */
        function baseDeUsuarioEnPantalla(nombre) {
            const pedazos = String(nombre || "")
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/gi, "n")
                .toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/).filter(Boolean);
            if (!pedazos.length) return "";
            const apellido = pedazos.length >= 4 ? pedazos[2] : pedazos[1];
            return [pedazos[0], apellido].filter(Boolean).join(".").slice(0, 40);
        }

        document.getElementById("student-sin-correo").addEventListener("change", pintarModoAlumno);
        document.getElementById("student-name").addEventListener("input", () => {
            if (!document.getElementById("student-usuario").dataset.tocado) pintarModoAlumno();
        });
        document.getElementById("student-usuario").addEventListener("input", (e) => {
            e.target.dataset.tocado = "1";
        });
        pintarModoAlumno();

        document.getElementById("create-student-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const msg = document.getElementById("create-student-msg");
            const btn = document.getElementById("create-student-btn");
            msg.textContent = "";
            btn.disabled = true; btn.textContent = "Enviando...";

            const email = document.getElementById("student-email").value.trim();
            const full_name = document.getElementById("student-name").value.trim();
            const sinCorreo = document.getElementById("student-sin-correo").checked;
            const encargadoEmail = document.getElementById("student-encargado-correo").value.trim();
            const encargadoNombre = document.getElementById("student-encargado-nombre").value.trim();
            const usuario = document.getElementById("student-usuario").value.trim();

            // Sin buzón propio, el correo de la casa es la ÚNICA forma de
            // mandar el enlace: sin él la cuenta queda creada y muda.
            if (sinCorreo && (!full_name || !encargadoEmail || !usuario)) {
                msg.textContent = !full_name
                    ? "Para armarle un usuario hace falta el nombre del alumno."
                    : (!usuario ? "Falta el usuario con el que va a entrar."
                                : "Falta el correo de la casa: es a donde va el enlace para crear la contraseña.");
                msg.className = "text-xs text-red-600 dark:text-red-400";
                btn.disabled = false; btn.textContent = "Enviar invitación";
                return;
            }

            try {
                const res = await fetch(EDGE_FUNCTION_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${session.access_token}`,
                        "apikey": window.SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({
                        email: sinCorreo ? "" : email,
                        full_name,
                        sin_correo: sinCorreo,
                        usuario: sinCorreo ? usuario : "",
                        encargado_email: sinCorreo ? encargadoEmail : "",
                        encargado_nombre: sinCorreo ? encargadoNombre : "",
                    }),
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.error || "Error desconocido");
                // Con qué entra lo dice el servidor: el usuario pudo salir con
                // un número al final si ya estaba tomado.
                const entra = result.usuario || result.email;
                if (result.correo_enviado === false) {
                    msg.textContent = `La cuenta quedó creada (entra con ${entra}), pero el correo NO salió. ` +
                        "Vuelve a intentarlo más tarde o dile que entre con «¿Olvidaste tu contraseña?» en la pantalla de acceso.";
                    msg.className = "text-xs font-semibold text-accent-700 dark:text-accent-400";
                } else if (result.sin_correo) {
                    // El usuario es el dato nuevo y hay que enseñarlo: no es un
                    // correo y nadie lo adivina. Y el correo salió a la casa, no
                    // al alumno — quien invitó tiene que poder decírselo.
                    msg.textContent = `Listo: entra con ${entra}. El enlace para crear la contraseña salió a ` +
                        `${result.correo_destino || encargadoEmail}, no al alumno — ese usuario no recibe correo.`;
                    msg.className = "text-xs text-green-600 dark:text-green-400";
                } else {
                    msg.textContent = `Invitación enviada a ${entra}. Recibirá un correo para crear su contraseña, con los pasos para entrar.`;
                    msg.className = "text-xs text-green-600 dark:text-green-400";
                }
                document.getElementById("create-student-form").reset();
                // reset() limpia los campos pero no la marca de "lo puso a
                // mano" ni vuelve a pintar el modo: sin esto, la invitación
                // siguiente arranca con los bloques abiertos de la anterior y
                // el usuario del alumno de antes todavía escrito.
                delete document.getElementById("student-usuario").dataset.tocado;
                pintarModoAlumno();
                // El servidor devuelve cuántas quedan: así el número de la pantalla
                // es el que de verdad tiene la base, no una cuenta del navegador.
                if (!result.ilimitado && typeof result.restantes === "number") {
                    pintarCupo(result.restantes);
                }
            } catch (err) {
                msg.textContent = err.message;
                msg.className = "text-xs text-red-600 dark:text-red-400";
                // El servidor es el que manda: si dice que no queda cupo, se
                // vuelve a leer para que la pantalla diga lo mismo que la base.
                if (/invitaciones/i.test(err.message)) cargarCupoInvitaciones();
            } finally {
                btn.textContent = "Enviar invitación";
                // Se vuelve a habilitar solo si de verdad queda cupo: si no, el
                // botón tiene que quedarse apagado después de la última invitación.
                btn.disabled = cupoRestante !== null && cupoRestante <= 0;
            }
        });

        // Modal de cambio de contraseña
        const pwModal = document.getElementById("pw-modal");
        document.getElementById("change-pw-btn").addEventListener("click", () => pwModal.classList.remove("hidden"));
        document.getElementById("pw-cancel-btn").addEventListener("click", () => pwModal.classList.add("hidden"));
        document.getElementById("pw-save-btn").addEventListener("click", async () => {
            const pwMsg = document.getElementById("pw-msg");
            const newPassword = document.getElementById("new-password").value;
            if (newPassword.length < 8) {
                pwMsg.textContent = "La contraseña debe tener al menos 8 caracteres.";
                pwMsg.className = "text-xs text-red-600 dark:text-red-400 mb-3";
                return;
            }
            const { error } = await sb.auth.updateUser({ password: newPassword });
            if (error) {
                pwMsg.textContent = error.message;
                pwMsg.className = "text-xs text-red-600 dark:text-red-400 mb-3";
                return;
            }
            pwMsg.textContent = "Contraseña actualizada.";
            pwMsg.className = "text-xs text-green-600 dark:text-green-400 mb-3";
            setTimeout(() => { pwModal.classList.add("hidden"); document.getElementById("new-password").value = ""; }, 1200);
        });

        init();
    