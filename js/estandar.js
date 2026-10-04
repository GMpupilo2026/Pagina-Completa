/* El código de estandar.html.

   Vivía escrito dentro de la página, en un <script> de 18 KB. Se mudó acá
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
            // Revisar ESTA partida con «Tus propios errores»: solo quien jugó, y solo
            // si hubo partida (menos de 10 jugadas no se revisan).
            const revisar = document.getElementById("revisar-partida");
            if (revisar) {
                const puede = room.status === "finished" && !!myColor && (room.moves || []).length >= 10;
                revisar.classList.toggle("hidden", !puede);
                if (puede) revisar.href = "entreno/tipos.html?revisar=" + encodeURIComponent("juego:" + ROOM_ID) + "#errores";
            }
            if (room.status === "finished") {
                const resultText = room.result === "draw" ? (esTripleRepeticion(room.moves, room.fen) ? "Tablas por triple repetición." : "Tablas.") : (room.result === "white" ? nameFor(room.white_id) + " ganó con blancas." : nameFor(room.black_id) + " ganó con negras.");
                setStatus("Partida terminada — " + resultText);
            } else if (waitingToStart) {
                if (!myColor) setStatus("Esperando a que " + nameFor(room.white_id) + " y " + nameFor(room.black_id) + " confirmen que están listos…");
                else if (myReady) setStatus("Ya confirmaste que estás listo — esperando a " + nameFor(myColor === "w" ? room.black_id : room.white_id) + "…");
                else setStatus("Toca \"Estoy listo\" cuando puedas empezar a jugar" + (room.initial_seconds != null ? " — el reloj arranca cuando ambos estén listos." : "."));
            } else if (!myColor) {
                setStatus("Estás mirando esta partida — solo pueden mover " + nameFor(room.white_id) + " y " + nameFor(room.black_id) + ".");
            } else {
                myTurnNow = board.game.turn() === myColor;
                const enJaque = board.game.in_check() && myTurnNow;
                setStatus((enJaque ? "¡Estás en jaque! " : "") + (myTurnNow ? "Es tu turno." : "Esperando la jugada de " + nameFor(myColor === "w" ? room.black_id : room.white_id) + "…"));
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

        function liveTimeLeft(color) { return SalaJuego.restante(room, color, SalaJuego.turnoDe(room)); }

        // El reloj y su rótulo dicho son de js/sala-juego.js (una sola copia).
        function renderClocks() {
            SalaJuego.pintarRelojes(room, { miColor: myColor, turno: SalaJuego.turnoDe(room), nombreDe: (c) => nameFor(c === "w" ? room.white_id : room.black_id) });
        }

        function checkFlagFall() { return SalaJuego.revisarBandera(room, ROOM_ID, SalaJuego.turnoDe(room)); }

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

        /* El tablero se recarga desde la FEN con cada jugada del rival, y
           `load()` borra la historia de chess.js: en Modo Adaptado «historial»
           contestaba «Todavía no hay jugadas» en plena partida. Después de
           cargar, se vuelven a jugar las jugadas guardadas sobre la MISMA
           partida del tablero (la posición es igual, solo gana la historia).
           Si la lista no lleva a esa posición (una sala que no arrancó de la
           inicial), se deja como estaba: una historia equivocada es peor que
           ninguna. */
        function cargarConHistoria(fen, jugadas) {
            board.loadFen(fen);
            if (!jugadas || !jugadas.length) return;
            const prueba = new Chess();
            for (const san of jugadas) { if (!prueba.move(san)) return; }
            const pos = (f) => String(f).split(" ").slice(0, 4).join(" ");
            if (pos(prueba.fen()) !== pos(board.game.fen())) return;
            board.game.reset();
            jugadas.forEach((san) => board.game.move(san));
        }

        // La posición de la jugada propia que se está guardando (ver handleLocalMove).
        let jugadaEnVuelo = null;

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
            // Y solo sobre la posición de la que salió la jugada (`fen`): si la sala
            // ya iba más adelante —otra pestaña de la misma cuenta, una jugada
            // repetida—, no la pisa. Se pide la fila de vuelta: el reloj queda con la
            // hora de la base, no con la de esta computadora.
            jugadaEnVuelo = info.fen;
            let guardar = sb.from("game_rooms").update(patch).eq("id", ROOM_ID).eq("status", "playing");
            if (room.fen) guardar = guardar.eq("fen", room.fen);
            const { data: guardada, error } = await guardar.select("*");
            jugadaEnVuelo = null;
            if (error || !guardada || !guardada.length) {
                if (error) console.error(error);
                await releerSala(error ? "No se pudo guardar la jugada: " + error.message : null);
                if (!error) setStatus(room.status === "playing" ? "Esa jugada no quedó guardada: la partida ya iba más adelante." : "La partida ya había terminado: esa jugada no quedó guardada.");
                return;
            }
            // Si mientras viajaba ya llegó algo más nuevo (el eco de esta misma jugada,
            // o hasta la respuesta del rival), se queda lo más nuevo: antes esto
            // pegaba el parche encima y la sala volvía una jugada atrás.
            room = SalaJuego.laMasNueva(room, guardada[0]);
            renderMoveHistory(room.moves);
            updateStatusText();
            renderClocks();
            if (blindCtl) blindCtl.announceOwnMove(info.san);
        }

        function applyRemoteRoom(row, forzarTablero) {
            const positionChanged = row.fen !== room.fen;
            room = row;
            if (positionChanged || forzarTablero) cargarConHistoria(row.fen, row.moves);
            board.setInteractive(!!myColor && row.status === "playing" && bothReady(row));
            renderMoveHistory(row.moves);
            updateStatusText();
            renderClocks();
            TorneoSync.onRoomUpdate(sb, row);
            // Si cambió la posición es porque la jugada la hizo el rival — la propia ya
            // quedó reflejada en "room" de forma local antes de que llegue este eco (ver
            // handleLocalMove), así que este caso siempre es una jugada ajena de verdad.
            if (positionChanged && row.fen !== jugadaEnVuelo && blindCtl && row.moves && row.moves.length) {
                blindCtl.announceOpponentMove(row.moves[row.moves.length - 1]);
            }
        }

        // Vuelve a leer la sala de la base y la aplica como un cambio remoto, forzando
        // el tablero: se usa cuando una escritura propia no quedó guardada y lo que se
        // ve en pantalla ya no es lo que hay en la base.
        async function releerSala(mensaje) {
            const fila = await SalaJuego.releer(ROOM_ID);
            if (fila) applyRemoteRoom(fila, true);
            if (mensaje) setStatus(mensaje);
        }

        function subscribeRoom() { SalaJuego.suscribir(ROOM_ID, (fila) => applyRemoteRoom(fila), { sala: () => room, miColor: () => myColor }); }

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

            board = new NieblaBoard(document.getElementById("board"), {
                interactive: !!myColor && room.status === "playing" && bothReady(room),
                myColor: myColor || "w",
                spectator: true, // ajedrez estándar: nunca hay niebla, para nadie
                onMove: handleLocalMove,
                onPromotionNeeded: showPromotionPicker,
            });
            cargarConHistoria(room.fen, room.moves);
            renderMoveHistory(room.moves);
            updateStatusText();
            renderClocks();
            subscribeRoom();

            // Ajedrez estándar no oculta nada: se anuncia la posición completa y cada
            // jugada del rival igual que la propia (a diferencia de Niebla de Guerra).
            if (window.JuegosBlind) {
                blindCtl = JuegosBlind.init({
                    tablero: document.getElementById("board"),
                    nombreTablero: "Tablero de la partida",
                    tryMove: (text) => board.tryMove(text),
                    miColor: () => myColor,
                    // "reloj" / "tiempo" en el recuadro, y los avisos de 30 y 10 segundos.
                    reloj: () => {
                        if (!room || room.initial_seconds == null) return null;
                        const corre = room.status === "playing" && bothReady(room) && room.clock_updated_at ? SalaJuego.turnoDe(room) : null;
                        return { blancas: liveTimeLeft("w"), negras: liveTimeLeft("b"), miColor: myColor, corre };
                    },
                    // "última jugada". Las jugadas se guardan desde la posición inicial,
                    // así que una lista de largo impar terminó en una jugada de blancas.
                    ultimaJugada: () => {
                        const jugadas = (room && room.moves) || [];
                        if (!jugadas.length) return null;
                        const color = jugadas.length % 2 ? "w" : "b";
                        return { san: jugadas[jugadas.length - 1], color, oculta: false };
                    },
                    getVisibleGame: () => board.game,
                });
            }

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    