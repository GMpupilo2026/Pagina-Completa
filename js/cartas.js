/* El código de cartas.html.

   Vivía escrito dentro de la página, en un <script> de 19 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null, isTeacher = false, room = null, myColor = null, board = null;
        const ROOM_ID = new URLSearchParams(window.location.search).get("room");
        const playerNames = {};

        function setStatus(text) { document.getElementById("status-banner").textContent = text; }
        function showError(text) {
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("error-text").textContent = text;
            document.getElementById("error-state").classList.remove("hidden");
        }
        function nameFor(id) { return playerNames[id] || "Alumno"; }
        function bothReady(row) { return !!(row.white_ready && row.black_ready); }

        function updateStatusText() {
            document.getElementById("top-player").textContent = nameFor(myColor === "b" ? room.white_id : room.black_id) + (myColor === "b" ? " (blancas)" : " (negras)");
            document.getElementById("bottom-player").textContent = myColor
                ? nameFor(profile.id) + (myColor === "w" ? " (blancas) — tú" : " (negras) — tú")
                : nameFor(room.white_id) + " (blancas)";
            if (!myColor) document.getElementById("top-player").textContent = nameFor(room.black_id) + " (negras)";
            document.getElementById("resign-btn").classList.toggle("hidden", !myColor || room.status !== "playing");

            const readyBtn = document.getElementById("ready-btn");
            const myReady = myColor === "w" ? room.white_ready : myColor === "b" ? room.black_ready : true;
            const waitingToStart = room.status === "playing" && !bothReady(room);
            readyBtn.classList.toggle("hidden", !myColor || room.status !== "playing" || myReady);

            let myTurnNow = false;
            if (room.status === "finished") {
                const resultText = room.result === "draw" ? "Tablas." : (room.result === "white" ? nameFor(room.white_id) + " ganó con blancas." : nameFor(room.black_id) + " ganó con negras.");
                setStatus("Partida terminada — " + resultText);
            } else if (waitingToStart) {
                if (!myColor) setStatus("Esperando a que " + nameFor(room.white_id) + " y " + nameFor(room.black_id) + " confirmen que están listos…");
                else if (myReady) setStatus("Ya confirmaste que estás listo — esperando a " + nameFor(myColor === "w" ? room.black_id : room.white_id) + "…");
                else setStatus("Toca \"Estoy listo\" cuando puedas empezar" + (room.initial_seconds != null ? " — el reloj arranca cuando ambos estén listos." : "."));
            } else if (!myColor) {
                setStatus("Estás mirando esta partida — solo pueden jugar " + nameFor(room.white_id) + " y " + nameFor(room.black_id) + ".");
            } else {
                myTurnNow = board.game.turn() === myColor;
                setStatus(myTurnNow
                    ? (board.game.cardPlayedThisTurn ? "Tu turno — haz tu jugada." : "Tu turno — puedes jugar una carta y después mover.")
                    : "Esperando la jugada de " + nameFor(myColor === "w" ? room.black_id : room.white_id) + "…");
            }
            if (window.TurnAlert) TurnAlert.check(myTurnNow);

            const eventEl = document.getElementById("card-event");
            if (board.lastError) {
                eventEl.textContent = "⚠️ " + board.lastError;
                eventEl.className = "mb-4 rounded-xl bg-red-500/15 border border-red-500/40 px-4 py-2 text-sm text-red-700 dark:text-red-400 font-medium";
            } else if (board.game.lastCardEvent) {
                eventEl.textContent = board.game.lastCardEvent;
                eventEl.className = "mb-4 rounded-xl bg-accent-500/15 border border-accent-500/40 px-4 py-2 text-sm text-accent-700 dark:text-accent-400 font-medium";
            } else {
                eventEl.classList.add("hidden");
            }
            eventEl.classList.toggle("hidden", !board.lastError && !board.game.lastCardEvent);
        }

        document.getElementById("ready-btn").addEventListener("click", async () => {
            if (!myColor || room.status !== "playing") return;
            const myKey = myColor === "w" ? "white_ready" : "black_ready";
            const otherAlreadyReady = myColor === "w" ? room.black_ready : room.white_ready;
            const patch = { [myKey]: true };
            if (otherAlreadyReady && room.initial_seconds != null && !room.clock_updated_at) patch.clock_updated_at = new Date().toISOString();
            const { error } = await sb.from("game_rooms").update(patch).eq("id", ROOM_ID);
            if (error) { console.error(error); setStatus("No se pudo confirmar: " + error.message); return; }
            room = Object.assign({}, room, patch);
            board.setInteractive(!!myColor && room.status === "playing" && bothReady(room));
            updateStatusText();
            renderClocks();
        });

        function formatClock(seconds) {
            if (seconds == null) return "";
            const s = Math.max(0, Math.ceil(seconds));
            return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
        }
        function liveTimeLeft(color) {
            const stored = color === "w" ? room.white_time_left : room.black_time_left;
            if (stored == null) return null;
            const isRunning = room.status === "playing" && room.clock_updated_at && board.game.turn() === color;
            if (!isRunning) return stored;
            return Math.max(0, stored - RelojServidor.desde(room.clock_updated_at));
        }
        function renderClocks() {
            const topEl = document.getElementById("top-clock");
            const bottomEl = document.getElementById("bottom-clock");
            if (room.initial_seconds == null) { topEl.classList.add("hidden"); bottomEl.classList.add("hidden"); return; }
            const bottomColor = myColor || "w";
            const topColor = bottomColor === "w" ? "b" : "w";
            const topSeconds = liveTimeLeft(topColor);
            const bottomSeconds = liveTimeLeft(bottomColor);
            topEl.textContent = formatClock(topSeconds);
            bottomEl.textContent = formatClock(bottomSeconds);
            topEl.classList.remove("hidden");
            bottomEl.classList.remove("hidden");
            [[topEl, topSeconds], [bottomEl, bottomSeconds]].forEach(([el, secs]) => {
                const isLow = room.status === "playing" && secs != null && secs <= 30;
                el.classList.toggle("text-red-600", isLow);
                el.classList.toggle("dark:text-red-400", isLow);
            });
        }
        async function checkFlagFall() {
            if (room.status !== "playing" || room.initial_seconds == null) return;
            const turnColor = board.game.turn();
            const secondsLeft = liveTimeLeft(turnColor);
            if (secondsLeft === null || secondsLeft > 0) return;
            const winner = turnColor === "w" ? "black" : "white";
            const timeKey = turnColor === "w" ? "white_time_left" : "black_time_left";
            const { error } = await sb.from("game_rooms").update({ status: "finished", result: winner, [timeKey]: 0, updated_at: new Date().toISOString() }).eq("id", ROOM_ID).eq("status", "playing");
            if (error) console.error(error);
        }
        setInterval(() => { if (!room || !board) return; renderClocks(); checkFlagFall(); }, 250);

        function renderMoveHistory(moves) {
            const listEl = document.getElementById("moves-list");
            const emptyEl = document.getElementById("moves-empty");
            if (!moves || !moves.length) { emptyEl.classList.remove("hidden"); listEl.classList.add("hidden"); return; }
            emptyEl.classList.add("hidden");
            listEl.classList.remove("hidden");
            listEl.classList.add("flex");
            listEl.innerHTML = "";
            for (let i = 0; i < moves.length; i += 2) {
                const li = document.createElement("li");
                li.textContent = (Math.floor(i / 2) + 1) + ". " + moves[i] + (moves[i + 1] ? " " + moves[i + 1] : "");
                listEl.appendChild(li);
            }
        }

        function showPromotionPicker(from, to, callback) {
            const modal = document.getElementById("promotion-modal");
            const optionsEl = document.getElementById("promotion-options");
            optionsEl.innerHTML = "";
            let resolved = false;
            [["q", "♛"], ["r", "♜"], ["b", "♝"], ["n", "♞"]].forEach(([type, glyph]) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "w-12 h-12 text-3xl rounded-lg border-2 border-brand-200 dark:border-brand-700 hover:border-accent-500 bg-white dark:bg-brand-800 transition-colors";
                btn.textContent = glyph;
                btn.addEventListener("click", () => { if (resolved) return; resolved = true; modal.classList.add("hidden"); callback(type); });
                optionsEl.appendChild(btn);
            });
            modal.classList.remove("hidden");
        }

        function showAscensoPicker(square, callback) {
            const modal = document.getElementById("ascenso-modal");
            const optionsEl = document.getElementById("ascenso-options");
            optionsEl.innerHTML = "";
            let resolved = false;
            const glyphs = myColor === "b" ? { q: "♛", r: "♜", b: "♝", n: "♞" } : { q: "♕", r: "♖", b: "♗", n: "♘" };
            [["q", glyphs.q], ["r", glyphs.r], ["b", glyphs.b], ["n", glyphs.n]].forEach(([type, glyph]) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "w-12 h-12 text-3xl rounded-lg border-2 border-brand-200 dark:border-brand-700 hover:border-accent-500 bg-white dark:bg-brand-800 transition-colors";
                btn.textContent = glyph;
                btn.addEventListener("click", () => { if (resolved) return; resolved = true; modal.classList.add("hidden"); callback(type); });
                optionsEl.appendChild(btn);
            });
            modal.classList.remove("hidden");
        }

        async function pushState(extraPatch) {
            const patch = Object.assign({
                cartas_state: board.state(),
                updated_at: new Date().toISOString(),
            }, extraPatch || {});
            // Solo se guarda si la partida sigue en juego: si al rival se le cayó la
            // bandera mientras tanto, esta jugada no puede pisar ese resultado. Y si no
            // quedó guardada, el tablero ya la muestra: se vuelve a leer la sala para
            // que enseñe el estado real en vez de quedarse desincronizado.
            const { data: guardada, error } = await sb.from("game_rooms").update(patch).eq("id", ROOM_ID).eq("status", "playing").select("id");
            if (error || !guardada || !guardada.length) {
                if (error) console.error(error);
                await releerSala(error ? "No se pudo guardar la jugada: " + error.message : "La partida ya había terminado: esa jugada no quedó guardada.");
                return;
            }
            room = Object.assign({}, room, patch);
            renderMoveHistory(room.moves);
            updateStatusText();
            renderClocks();
        }

        async function handleLocalMove(info) {
            const newMoves = (room.moves || []).concat([info.san]);
            const patch = { moves: newMoves };
            if (room.initial_seconds != null) {
                const storedKey = myColor === "w" ? "white_time_left" : "black_time_left";
                const elapsed = room.clock_updated_at ? RelojServidor.desde(room.clock_updated_at) : 0;
                patch[storedKey] = Math.max(0, (room[storedKey] || 0) - elapsed) + (room.increment_seconds || 0);
                patch.clock_updated_at = new Date().toISOString();
            }
            if (info.gameOver) { patch.status = "finished"; patch.result = info.result; }
            await pushState(patch);
        }

        async function handleCardPlayed() {
            // Jugar una carta no consume turno ni reloj: solo se guarda el nuevo
            // estado (mano, tablero si la carta lo tocó, banderas de congelar/etc.).
            await pushState({});
        }

        function applyRemoteRoom(row, forzarTablero) {
            const anterior = room ? room.cartas_state : null;
            room = row;
            const cambioEstado = JSON.stringify(anterior) !== JSON.stringify(row.cartas_state);
            if (cambioEstado || forzarTablero) board.loadState(row.cartas_state);
            board.setInteractive(!!myColor && row.status === "playing" && bothReady(row));
            renderMoveHistory(row.moves);
            updateStatusText();
            renderClocks();
            TorneoSync.onRoomUpdate(sb, row);
        }

        // Vuelve a leer la sala de la base y la aplica como un cambio remoto, forzando
        // el tablero: se usa cuando una escritura propia no quedó guardada y lo que se
        // ve en pantalla ya no es lo que hay en la base.
        async function releerSala(mensaje) {
            const { data: fila, error } = await sb.from("game_rooms").select("*").eq("id", ROOM_ID).single();
            if (error || !fila) console.error(error);
            else applyRemoteRoom(fila, true);
            setStatus(mensaje);
        }

        function subscribeRoom() {
            sb.channel("game-room-" + ROOM_ID)
                .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: "id=eq." + ROOM_ID }, (payload) => applyRemoteRoom(payload.new))
                .subscribe();
        }

        document.getElementById("resign-btn").addEventListener("click", async () => {
            if (!myColor || room.status !== "playing") return;
            if (!(await Avisos.confirmar("La partida se termina y la gana tu rival.", { titulo: "¿Rendirte?", aceptar: "Rendirme", peligro: true }))) return;
            // El diálogo pudo quedar abierto un buen rato: si mientras tanto la partida
            // terminó (por ejemplo, al rival se le cayó la bandera), rendirse no puede
            // pisar ese resultado. Por eso se vuelve a mirar, y la base lo exige también.
            if (room.status !== "playing") { setStatus("La partida ya había terminado."); return; }
            const result = myColor === "w" ? "black" : "white";
            const { data: rendida, error } = await sb.from("game_rooms").update({ status: "finished", result: result, updated_at: new Date().toISOString() }).eq("id", ROOM_ID).eq("status", "playing").select("id");
            if (error) { console.error(error); setStatus("No se pudo registrar la rendición: " + error.message); return; }
            if (!rendida || !rendida.length) await releerSala("La partida ya había terminado: la rendición no se registró.");
        });

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            RelojServidor.iniciar(sb);
            if (!session) { window.location.href = "login.html"; return; }
            if (!ROOM_ID) { showError("Falta indicar qué partida abrir. Vuelve a Juegos y entra desde ahí."); return; }

            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { showError("No se pudo cargar tu perfil. Cierra sesión y vuelve a entrar."); return; }
            profile = profileData;
            isTeacher = profile.role === "profesor" || profile.is_admin === true;

            const { data: roomData, error: roomError } = await sb.from("game_rooms").select("*").eq("id", ROOM_ID).maybeSingle();
            if (roomError || !roomData) { showError("No se encontró esa partida — puede que ya se haya eliminado."); return; }
            room = roomData;
            myColor = room.white_id === profile.id ? "w" : (room.black_id === profile.id ? "b" : null);
            /* Mirar una partida lo decide la RLS, no esta pantalla. Si
               `game_rooms_select` devolvió la fila, quien la pidió puede verla
               —juega, es su profesor, administra, o es compañero de clase
               (`es_companero`)—; y si no la devolvió, dos líneas más arriba ya
               se salió con "No se encontró esa partida". El `!isTeacher` que
               había acá era un SEGUNDO candado escrito en la página, más cerrado
               que el de la base, y dejaba fuera justo a quien más quiere mirar:
               en un torneo, el "Ver →" de torneo.html llevaba a todo el alumnado
               a "No formas parte de esta partida" —incluido a quien le tocó bye
               y no tiene otra cosa que hacer esa ronda—, y el cruce de al lado
               no lo podía seguir nadie más que quien daba clase.
               Jugar sigue cerrado por los dos lados: `interactive` cuelga de
               myColor, los botones de rendirse y de "estoy listo" también, y
               `game_rooms_update` no nombra a es_companero(). */

            /* El nombre de los dos lados sale de nombres_de_jugadores() y no de
               `profiles`: desde que el reto está abierto a toda la Academia el
               rival puede ser de otra clase, que por la RLS de `profiles` no se
               ve —la tarjeta diría "tu rival" sin que nada fallara— y, sobre
               todo, aquel select se llevaba también su correo. */
            const { data: players } = await sb.rpc("nombres_de_jugadores", { p_ids: [room.white_id, room.black_id] });
            (players || []).forEach((p) => { playerNames[p.id] = p.nombre; });

            board = new CartasBoard(
                document.getElementById("board"),
                document.getElementById("my-hand"),
                document.getElementById("rival-hand"),
                {
                    interactive: !!myColor && room.status === "playing" && bothReady(room),
                    /* Quien mira no ve ninguna mano. Sin esto, `myColor: "w"` —que
                       acá solo dice de qué lado se dibuja el tablero— le enseñaría
                       la mano COMPLETA de las blancas: en un torneo, eso es la
                       información con la que se gana la partida, y se la estaría
                       viendo quien espera para jugar contra ellas en la ronda
                       siguiente. No da ningún error: la pantalla se ve perfecta. */
                    spectator: !myColor,
                    myColor: myColor || "w",
                    onMove: (info) => { handleLocalMove(info); },
                    onCardPlayed: () => { handleCardPlayed(); },
                    onPromotionNeeded: showPromotionPicker,
                    onAscensoPieceNeeded: showAscensoPicker,
                }
            );
            // "Tu mano" no es cierto para quien mira: ahí no hay mano suya.
            if (!myColor) document.getElementById("my-hand-title").textContent = "Las cartas de las blancas";
            board.loadState(room.cartas_state);
            renderMoveHistory(room.moves);
            updateStatusText();
            renderClocks();
            subscribeRoom();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    