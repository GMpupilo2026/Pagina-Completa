/* El código de niebla.html.

   Vivía escrito dentro de la página, en un <script> de 23 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null, isTeacher = false, room = null, myColor = null, board = null, blindCtl = null;
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
                // Cómo ganó: se comió el rey (la única forma de ganar jugando), o
                // por rendición o tiempo, que la posición no dice.
                const comido = room.fen ? NieblaGuerra.reglas.reyComido(new Chess(room.fen)) : null;
                const resultText = room.result === "draw" ? (esTripleRepeticion(room.moves, room.fen) ? "Tablas por triple repetición." : "Tablas.")
                    : (room.result === "white" ? nameFor(room.white_id) + " ganó con blancas" : nameFor(room.black_id) + " ganó con negras")
                        + (comido ? ": se comió el rey." : ".");
                setStatus("Partida terminada — " + resultText);
            } else if (waitingToStart) {
                if (!myColor) setStatus("Esperando a que " + nameFor(room.white_id) + " y " + nameFor(room.black_id) + " confirmen que están listos…");
                else if (myReady) setStatus("Ya confirmaste que estás listo — esperando a " + nameFor(myColor === "w" ? room.black_id : room.white_id) + "…");
                else setStatus("Toca \"Estoy listo\" cuando puedas empezar a jugar" + (room.initial_seconds != null ? " — el reloj arranca cuando ambos estén listos." : "."));
            } else if (!myColor) {
                setStatus("Estás mirando esta partida — solo pueden mover " + nameFor(room.white_id) + " y " + nameFor(room.black_id) + ".");
            } else {
                myTurnNow = board.game.turn() === myColor;
                // Sin «¡Estás en jaque!»: en la niebla no hay jaques (gana quien se
                // come el rey), y avisarlo delataba una pieza rival tapada.
                setStatus(myTurnNow ? "Es tu turno." : "Esperando la jugada de " + nameFor(myColor === "w" ? room.black_id : room.white_id) + "…");
            }
            if (window.TurnAlert) TurnAlert.check(myTurnNow);
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

        function liveTimeLeft(color) { return SalaJuego.restante(room, color, board.game.turn()); }

        // El reloj y su rótulo dicho son de js/sala-juego.js (una sola copia).
        function renderClocks() {
            SalaJuego.pintarRelojes(room, { miColor: myColor, turno: board.game.turn(), nombreDe: (c) => nameFor(c === "w" ? room.white_id : room.black_id) });
        }

        function checkFlagFall() { return SalaJuego.revisarBandera(room, ROOM_ID, board.game.turn()); }

        setInterval(() => {
            if (!room || !board) return;
            renderClocks();
            checkFlagFall();
        }, 250);

        // Las jugadas se guardan como las da chess.js (en inglés) y se muestran
        // en algebraica española («Cf3»), o en palabras para quien no ve.
        const jugadaVista = (san) => (window.ComandosTablero ? ComandosTablero.jugadaParaMostrar(san) : san);
        function renderMoveHistory(moves) {
            const listEl = document.getElementById("moves-list");
            const emptyEl = document.getElementById("moves-empty");
            if (!moves || !moves.length) {
                emptyEl.classList.remove("hidden");
                listEl.classList.add("hidden");
                return;
            }
            emptyEl.classList.add("hidden");
            listEl.classList.remove("hidden");
            listEl.classList.add("flex");
            listEl.innerHTML = "";
            for (let i = 0; i < moves.length; i += 2) {
                const li = document.createElement("li");
                const num = Math.floor(i / 2) + 1;
                li.textContent = num + ". " + jugadaVista(moves[i]) + (moves[i + 1] ? " " + jugadaVista(moves[i + 1]) : "");
                listEl.appendChild(li);
            }
        }

        // La gracia de Niebla de Guerra es que nadie ve más que sus propias
        // casillas — pero la lista de jugadas (una especie de PGN en vivo) sí
        // revelaba, en texto plano, adónde se movió cada pieza, aunque
        // estuviera bajo niebla en el tablero. Por eso se oculta mientras la
        // partida está en curso y solo se revela completa cuando termina.
        function renderMovesPanel(room) {
            const hiddenEl = document.getElementById("moves-hidden");
            const moves = room.moves || [];
            if (room.status === "playing") {
                hiddenEl.classList.remove("hidden");
                document.getElementById("moves-empty").classList.add("hidden");
                document.getElementById("moves-list").classList.add("hidden");
                document.getElementById("moves-hidden-count").textContent = moves.length + (moves.length === 1 ? " jugada" : " jugadas");
                return;
            }
            hiddenEl.classList.add("hidden");
            renderMoveHistory(moves);
        }

        /* La pieza al coronar la pregunta js/coronacion.js, el mismo diálogo de
           todos los tableros del sitio. Esta página tenía el suyo: cuatro botones
           con solo el dibujo de la pieza (el lector de pantalla decía "botón" o
           el nombre del carácter Unicode, "black chess queen"), sin rol de
           diálogo y sin llevar el foco adentro, así que con el teclado no había
           forma de llegar a él y la jugada se quedaba a medias. El de
           Coronacion es un <dialog> modal con el nombre escrito en cada botón,
           el foco en la dama, Escape para cancelar y el foco de vuelta al cerrar. */
        function showPromotionPicker(from, to, callback) {
            if (!window.Coronacion) { callback("q"); return; }
            Coronacion.pedir(myColor || board.game.turn(), callback);
        }

        // Triple repetición: el tablero se recarga desde la FEN con cada jugada del
        // rival y chess.js pierde el historial, así que se cuenta reproduciendo la
        // lista de jugadas guardada (ver js/repeticion.js).
        function esTripleRepeticion(jugadas, fen) { return SalaJuego.esTripleRepeticion(jugadas, fen); }

        async function handleLocalMove(info) {
            const newMoves = (room.moves || []).concat([info.san]);
            const patch = { fen: info.fen, moves: newMoves, updated_at: new Date().toISOString() };
            if (room.initial_seconds != null) {
                const storedKey = myColor === "w" ? "white_time_left" : "black_time_left";
                const elapsed = room.clock_updated_at ? RelojServidor.desde(room.clock_updated_at) : 0;
                const remaining = Math.max(0, (room[storedKey] || 0) - elapsed) + (room.increment_seconds || 0);
                patch[storedKey] = remaining;
                patch.clock_updated_at = new Date().toISOString();
            }
            if (!info.gameOver && esTripleRepeticion(newMoves, info.fen)) {
                info = Object.assign({}, info, { gameOver: true, result: "draw" });
            }
            if (info.gameOver) {
                patch.status = "finished";
                patch.result = info.result;
            }
            // Solo se guarda si la partida sigue en juego: si al rival se le cayó la
            // bandera mientras tanto, esta jugada no puede pisar ese resultado. Y si no
            // quedó guardada, el tablero ya la muestra: se vuelve a leer la sala para
            // que enseñe la posición real en vez de quedarse desincronizado.
            const { data: guardada, error } = await sb.from("game_rooms").update(patch).eq("id", ROOM_ID).eq("status", "playing").select("id");
            if (error || !guardada || !guardada.length) {
                if (error) console.error(error);
                await releerSala(error ? "No se pudo guardar la jugada: " + error.message : "La partida ya había terminado: esa jugada no quedó guardada.");
                return;
            }
            room = Object.assign({}, room, patch);
            renderMovesPanel(room);
            updateStatusText();
            renderClocks();
            if (blindCtl) blindCtl.announceOwnMove(info.san);
        }

        function applyRemoteRoom(row, forzarTablero) {
            const positionChanged = row.fen !== room.fen;
            room = row;
            if (positionChanged || forzarTablero) board.loadFen(row.fen);
            board.setInteractive(!!myColor && row.status === "playing" && bothReady(row));
            renderMovesPanel(row);
            updateStatusText();
            renderClocks();
            TorneoSync.onRoomUpdate(sb, row);
            // Si cambió la posición, es porque la jugada la hizo el rival — la propia ya
            // quedó reflejada en "room" de forma local antes de que llegue este eco (ver
            // handleLocalMove), así que este caso siempre es una jugada ajena de verdad.
            if (positionChanged && blindCtl && row.moves && row.moves.length) {
                blindCtl.announceOpponentMove(row.moves[row.moves.length - 1]);
            }
        }

        // Vuelve a leer la sala de la base y la aplica como un cambio remoto, forzando
        // el tablero: se usa cuando una escritura propia no quedó guardada y lo que se
        // ve en pantalla ya no es lo que hay en la base.
        async function releerSala(mensaje) {
            const fila = await SalaJuego.releer(ROOM_ID);
            if (fila) applyRemoteRoom(fila, true);
            setStatus(mensaje);
        }

        function subscribeRoom() { SalaJuego.suscribir(ROOM_ID, (fila) => applyRemoteRoom(fila)); }

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
            /* La única excepción, y es la misma que ya escribe tv.html: mientras
               una partida de Niebla de Guerra está EN CURSO su posición real no
               se le enseña a nadie de fuera. Cualquiera de los dos jugadores
               podría estar mirando esa pantalla —o alguien al lado suyo— y con
               eso se acabó la niebla, que es el juego entero. Al terminar sí se
               puede mirar: ahí ya no queda nada que tapar. Quien da clase entra
               igual, que es como supervisa. */
            if (!myColor && !isTeacher && room.status === "playing") {
                showError("Esta partida de Niebla de Guerra está en curso. La posición no se puede mirar desde fuera hasta que termine — si no, se acabaría la niebla para quien la está jugando.");
                return;
            }

            /* El nombre de los dos lados sale de nombres_de_jugadores() y no de
               `profiles`: desde que el reto está abierto a toda la Academia el
               rival puede ser de otra clase, que por la RLS de `profiles` no se
               ve —la tarjeta diría "tu rival" sin que nada fallara— y, sobre
               todo, aquel select se llevaba también su correo. */
            const { data: players } = await sb.rpc("nombres_de_jugadores", { p_ids: [room.white_id, room.black_id] });
            (players || []).forEach((p) => { playerNames[p.id] = p.nombre; });

            const spectator = !myColor;
            document.getElementById("spectator-hint").classList.toggle("hidden", !spectator);

            board = new NieblaBoard(document.getElementById("board"), {
                interactive: !!myColor && room.status === "playing" && bothReady(room),
                myColor: myColor || "w",
                spectator: spectator,
                onMove: handleLocalMove,
                onPromotionNeeded: showPromotionPicker,
                sinJaques: true,
            });
            board.loadFen(room.fen);
            renderMovesPanel(room);
            updateStatusText();
            renderClocks();
            subscribeRoom();

            // Modo adaptado: "lo que ves" respeta la niebla — solo tus propias piezas y las
            // casillas que alcanzan a atacar o defender, igual que en el tablero visual. Un
            // espectador (el profesor) ve todo, sin niebla, igual que en el tablero visual.
            let vistaVisible = null; // { fen, vista } — ver getVisibleGame más abajo
            if (window.JuegosBlind) {
                blindCtl = JuegosBlind.init({
                    tablero: document.getElementById("board"),
                    nombreTablero: "Tablero de Niebla de Guerra",
                    tryMove: (text) => board.tryMove(text),
                    miColor: () => myColor,
                    // "reloj" / "tiempo" en el recuadro, y los avisos de 30 y 10 segundos.
                    reloj: () => {
                        if (!room || room.initial_seconds == null) return null;
                        const corre = room.status === "playing" && bothReady(room) && room.clock_updated_at ? board.game.turn() : null;
                        return { blancas: liveTimeLeft("w"), negras: liveTimeLeft("b"), miColor: myColor, corre };
                    },
                    // "última jugada". Las jugadas se guardan desde la posición inicial,
                    // así que una lista de largo impar terminó en una jugada de blancas.
                    ultimaJugada: () => {
                        const jugadas = (room && room.moves) || [];
                        if (!jugadas.length) return null;
                        const color = jugadas.length % 2 ? "w" : "b";
                        /* La del rival NO se dice mientras dura la partida: es lo mismo que
                           tapa la lista de jugadas (renderMovesPanel), y decirla por el
                           recuadro levantaría la niebla. La propia sí: ya la sabes. */
                        return { san: jugadas[jugadas.length - 1], color, oculta: room.status === "playing" && !!myColor && color !== myColor };
                    },
                    /* «historial»: con la niebla, solo TUS jugadas mientras se juega (las
                       del rival las tapa también el panel de jugadas, ver
                       renderMovesPanel). Terminada la partida, o mirando, todas. */
                    historial: () => {
                        const jugadas = (room && room.moves) || [];
                        const dicha = (san) => (window.BlindNotation ? BlindNotation.sanSpoken(san) : san);
                        const tapar = room.status === "playing" && !!myColor;
                        if (!tapar) {
                            if (!jugadas.length) return "Todavía no hay jugadas.";
                            const partes = [];
                            for (let i = 0; i < jugadas.length; i += 2) partes.push((i / 2 + 1) + ": " + dicha(jugadas[i]) + (jugadas[i + 1] ? ", " + dicha(jugadas[i + 1]) : ""));
                            return jugadas.length + (jugadas.length === 1 ? " jugada. " : " jugadas. ") + partes.join("; ") + ".";
                        }
                        const propias = [];
                        jugadas.forEach((san, i) => { if ((i % 2 === 0 ? "w" : "b") === myColor) propias.push((propias.length + 1) + ": " + dicha(san)); });
                        if (!propias.length) return "Todavía no has jugado. Con la niebla, las jugadas del rival no se dicen.";
                        return "Tus jugadas (con la niebla, las del rival no se dicen): " + propias.join("; ") + ".";
                    },
                    getVisibleGame: () => {
                        if (!myColor) return board.game;
                        /* Se guarda la vista y se rehace solo cuando cambia la posición. Desde
                           que el tablero se recorre con el teclado, sus 64 casillas se vuelven a
                           rotular en CADA repintado, y cada rótulo pide la partida visible: sin
                           esto, un repintado recalculaba la visibilidad 64 veces. No daría ningún
                           error — solo un tablero que responde tarde, que en una partida con
                           reloj es justo lo que no se puede permitir. */
                        const fen = board.game.fen();
                        if (vistaVisible && vistaVisible.fen === fen) return vistaVisible.vista;
                        const visible = NieblaGuerra.visibleSquaresFor(board.game, myColor);
                        const vista = {
                            get: (sq) => (visible.has(sq) ? board.game.get(sq) : null),
                            turn: () => board.game.turn(),
                            // En la niebla no hay jaques: decirlo delataría a la pieza que ataca.
                            in_check: () => false,
                            /* `oculta` es lo que separa "ahí no hay nada" de "no sabes qué hay
                               ahí". Sin ella, preguntar por una casilla con niebla contestaba
                               "vacía" — que es falso (puede haber una pieza rival) y además dice
                               algo distinto de lo que el tablero visual enseña con su 🌫️. La
                               entienden los dos módulos compartidos (js/tablero-accesible.js y
                               js/comandos-tablero.js), así que basta con ponerla acá. */
                            oculta: (sq) => !visible.has(sq),
                            miColor: myColor,
                            /* Las jugadas, SOLO cuando te toca mover: así todas las que salen son
                               tuyas. Devolviendo también las del rival en su turno, el recuadro
                               contaría de dónde a dónde puede ir una pieza que la niebla está
                               tapando — la fuga entera de la variante, y se vería perfecto.
                               Las propias no revelan nada que el tablero no enseñe ya: toda
                               casilla a la que puede ir una pieza tuya es una casilla que esa
                               pieza VE (el rayo de visibilidad llega hasta la primera ocupada),
                               y el tablero visual le pinta encima su punto de destino. */
                            moves: (o) => {
                                if (board.game.turn() !== myColor) return [];
                                // Las de la niebla: sin jaques (ver NieblaGuerra.reglas).
                                const lista = NieblaGuerra.reglas.jugadas(board.game, o);
                                return o && o.verbose ? lista : lista.map((m) => m.san);
                            },
                        };
                        vistaVisible = { fen, vista };
                        return vista;
                    },
                    // La niebla oculta la jugada del rival igual que oculta el panel de
                    // jugadas visual (ver renderMovesPanel) — no se anuncia qué jugó ni
                    // adónde, solo que ya jugó (el status "Es tu turno" ya lo dice, por el
                    // aria-live del status-banner).
                    describeOpponentMove: () => null,
                });
            }

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    