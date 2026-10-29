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
                const fin = room.variant_state && room.variant_state.fin;
                const resultText = room.result === "draw" ? SalaJuego.textoTablas(fin && fin.motivo) : (room.result === "white" ? nameFor(room.white_id) + " ganó con blancas." : nameFor(room.black_id) + " ganó con negras.");
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
                    : "Esperando la jugada de " + nameFor(myColor === "w" ? room.black_id : room.white_id) + "…" + (board.pre ? board.pre.texto() : ""));
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
            const { cambio, error } = await SalaJuego.marcarListo(room, ROOM_ID, myColor);
            if (error) { setStatus("No se pudo confirmar: " + error.message); return; }
            room = Object.assign({}, room, cambio);
            board.setInteractive(!!myColor && room.status === "playing" && bothReady(room));
            updateStatusText();
            renderClocks();
        });

        function formatClock(seconds) { return SalaJuego.formatear(seconds); }
        function liveTimeLeft(color) { return SalaJuego.restante(room, color, SalaJuego.turnoDe(room)); }
        // El reloj y su rótulo dicho son de js/sala-juego.js (una sola copia).
        function renderClocks() {
            SalaJuego.pintarRelojes(room, { miColor: myColor, turno: SalaJuego.turnoDe(room), nombreDe: (c) => nameFor(c === "w" ? room.white_id : room.black_id) });
        }
        function checkFlagFall() { return SalaJuego.revisarBandera(room, ROOM_ID, SalaJuego.turnoDe(room)); }
        setInterval(() => { if (!room || !board) return; renderClocks(); checkFlagFall(); }, 250);

        // Las jugadas se guardan como las da el motor (con letras inglesas) y se
        // muestran en algebraica española: solo la letra de la pieza del
        // principio («N@f3» → «C@f3», «Rxe8» → «Txe8») y la de la coronación.
        const LETRA_ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
        const jugadaVista = (san) => String(san == null ? "" : san)
            .replace(/^[KQRBN](?=[a-h1-8x@])/, (l) => LETRA_ES[l]).replace(/=([QRBN])/, (_, l) => "=" + LETRA_ES[l]);
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
                li.textContent = (Math.floor(i / 2) + 1) + ". " + jugadaVista(moves[i]) + (moves[i + 1] ? " " + jugadaVista(moves[i + 1]) : "");
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
            // Se pide la fila de vuelta (el reloj con la hora de la base) y, si mientras
            // viajaba ya llegó algo más nuevo, se queda lo más nuevo.
            const { data: guardada, error } = await sb.from("game_rooms").update(patch).eq("id", ROOM_ID).eq("status", "playing").select("*");
            if (error || !guardada || !guardada.length) {
                if (error) console.error(error);
                jugadaEnVuelo = false;
                await releerSala(error ? "No se pudo guardar la jugada: " + error.message : "La partida ya había terminado: esa jugada no quedó guardada.");
                return;
            }
            room = SalaJuego.laMasNueva(room, guardada[0]);
            SalaJuego.avisarTorneo(room);
            renderMoveHistory(room.moves);
            updateStatusText();
            renderClocks();
        }

        // El canal de la sala (SalaJuego.suscribir): jugada(), esperarBase(),
        // despuesDeGuardar(), refrescar(). Y si la jugada propia se está guardando.
        let vigilante = null;
        let jugadaEnVuelo = false;
        // La carta que se está guardando: la jugada que viene después la espera.
        let cartaEnVuelo = null;

        async function handleLocalMove(info) {
            // Si se acaba de jugar una carta, primero que quede guardada: la
            // jugada se comprueba contra la sala (ver vigilante.jugada), y sin la
            // carta no daría el mismo estado que el tablero.
            if (cartaEnVuelo) await cartaEnVuelo;
            // Primero que nada, la jugada a los que miran la sala (el canal rápido):
            // el rival la ve sin esperar a que la base la guarde. Ver «La jugada
            // viaja por Broadcast» en docs/decisiones/juegos-y-torneos.md. Va el
            // estado entero de después: del otro lado se busca la jugada que
            // lleva a él (ver jugarRapida).
            jugadaEnVuelo = true;
            const envio = vigilante ? await vigilante.jugada({ san: info.san, despues: board.state() }) : { ok: true };
            if (!envio.ok) {
                // La jugada del rival sobre la que se jugó no quedó: se manda lo que diga la base.
                jugadaEnVuelo = false;
                await releerSala("Esa jugada no quedó guardada: la del rival no llegó a la base.");
                return;
            }
            const newMoves = (room.moves || []).concat([info.san]);
            const patch = { moves: newMoves };
            if (room.initial_seconds != null) {
                const storedKey = myColor === "w" ? "white_time_left" : "black_time_left";
                const elapsed = SalaJuego.pensado(room, envio.alMover);
                patch[storedKey] = Math.max(0, (room[storedKey] || 0) - elapsed) + (room.increment_seconds || 0);
                patch.clock_updated_at = new Date().toISOString();
            }
            /* Triple repetición: el tablero se recarga desde cartas_state con
               cada cambio y chess.js pierde la historia, así que la cuenta viaja
               en la sala (variant_state.rep, ver Repeticion.enSala). La posición
               incluye las manos y las cartas pendientes (CartasChess.clave):
               las mismas piezas con otras cartas no son la misma posición. Las
               50 jugadas ya las aplica el motor. */
            const previo = room.variant_state && room.variant_state.rep;
            const claveAntes = previo ? null : CartasChess.Game.fromJSON(room.cartas_state).clave();
            const cuenta = Repeticion.enSala(previo, claveAntes, board.game.clave(), board.game.medias() === 0);
            patch.variant_state = Object.assign({}, room.variant_state || {}, { rep: cuenta.rep });
            if (!info.gameOver && cuenta.veces >= 3) info = Object.assign({}, info, { gameOver: true, result: "draw", motivo: "repeticion" });
            if (info.gameOver) {
                patch.status = "finished";
                patch.result = info.result;
                if (info.result === "draw" && info.motivo) patch.variant_state.fin = { motivo: info.motivo };
            }
            await pushState(patch);
            jugadaEnVuelo = false;
            if (vigilante) vigilante.despuesDeGuardar();
        }

        async function handleCardPlayed() {
            // Jugar una carta no consume turno ni reloj: solo se guarda el nuevo
            // estado (mano, tablero si la carta lo tocó, banderas de congelar/etc.).
            // Pero el estado que se guarda es el que se ve: si incluye una jugada
            // del rival todavía provisional, primero la tiene que tener la base.
            cartaEnVuelo = (async () => {
                if (vigilante && !(await vigilante.esperarBase())) {
                    await releerSala("Esa carta no quedó guardada: la jugada del rival no llegó a la base.");
                    return;
                }
                await pushState({});
            })();
            try { await cartaEnVuelo; } finally { cartaEnVuelo = null; }
        }

        /* La jugada del rival que llegó por el canal rápido (ver suscribir en
           js/sala-juego.js). El aviso trae el estado entero de después (las
           manos y el mazo cambian con la jugada): se prueban las jugadas
           legales de la posición que se ve hasta dar con la que lleva
           exactamente a ese estado. Si ninguna lleva (una carta del rival que
           acá todavía no llegó, por ejemplo), no se pinta nada: llegará por la
           base. */
        function jugarRapida(sala, aviso) {
            if (!aviso.despues || !sala.cartas_state) return null;
            const buscado = JSON.stringify(aviso.despues);
            const base = CartasChess.Game.fromJSON(sala.cartas_state);
            for (const m of base.legalMoves()) {
                const g = CartasChess.Game.fromJSON(sala.cartas_state);
                const r = g.move({ from: m.from, to: m.to, promotion: m.promotion });
                if (r.ok && JSON.stringify(g.toJSON()) === buscado) return { cartas_state: g.toJSON(), moves: (sala.moves || []).concat([r.san]) };
            }
            return null;
        }

        /* «La posición de la que sale la jugada», en Cartas: el estado entero
           (manos, cartas pendientes, tablero), en una huella corta para que el
           aviso no lo lleve dos veces. */
        function huellaCartas(sala) {
            const t = JSON.stringify((sala && sala.cartas_state) || null);
            let h = 5381;
            for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
            return t.length + ":" + (h >>> 0).toString(36);
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
            // La pre-jugada sale apenas es el turno propio (js/premovidas.js; si ya
            // no es legal, se descarta y se dice).
            if (row.status === "playing" && !jugadaEnVuelo) board.jugarPremovida();
        }

        // Vuelve a leer la sala de la base y la aplica como un cambio remoto, forzando
        // el tablero: se usa cuando una escritura propia no quedó guardada y lo que se
        // ve en pantalla ya no es lo que hay en la base.
        async function releerSala(mensaje) {
            const fila = await SalaJuego.releer(ROOM_ID);
            // Si mientras se leía ya salió otra jugada propia, lo leído es viejo:
            // recargar el tablero la borraría de la pantalla mientras se guarda, y
            // la jugada siguiente saldría de una posición que la sala no tiene.
            // Esa jugada, al terminar de guardarse (o al fallar), deja todo al día.
            if (fila && !jugadaEnVuelo) applyRemoteRoom(fila, true);
            if (mensaje) setStatus(mensaje);
        }

        function subscribeRoom() {
            vigilante = SalaJuego.suscribir(ROOM_ID, (fila) => applyRemoteRoom(fila), {
                sala: () => room, miColor: () => myColor,
                rapida: { jugar: jugarRapida, posicion: huellaCartas, enVuelo: () => jugadaEnVuelo },
            });
        }

        SalaJuego.montarRendirse({ salaId: ROOM_ID, sala: () => room, miColor: () => myColor, decir: setStatus, releer: releerSala });

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
                    // Pre-jugadas: en el turno del rival se deja preparada la propia.
                    premoves: !!myColor,
                    onPremove: () => updateStatusText(),
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
    