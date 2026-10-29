/* El código de duelo.html.

   Vivía escrito dentro de la página, en un <script> de 17 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null, isTeacher = false, room = null, myColor = null, board = null;
        const ROOM_ID = new URLSearchParams(window.location.search).get("room");
        const playerNames = {};
        let mySecret = null; // {move, salt} de la jugada ya comprometida en la ronda actual — solo vive en este navegador

        function setStatus(text) { document.getElementById("status-banner").textContent = text; }
        function showError(text) {
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("error-text").textContent = text;
            document.getElementById("error-state").classList.remove("hidden");
        }
        function nameFor(id) { return playerNames[id] || "Alumno"; }
        function secretKey(round) { return "duelo_secreto_" + ROOM_ID + "_" + round; }

        /* Se juega con los dos listos, como en las demás salas: así el reloj
           arranca cuando los dos están (lo pone la base). Una partida que ya
           había empezado antes de que Duelo tuviera reloj no tiene esas
           banderas: se sigue jugando igual, sin reloj. */
        function bothReady(row) { return !!(row.white_ready && row.black_ready); }
        function listos(row) {
            const d = row.duelo_state || {};
            return bothReady(row) || (d.round || 1) > 1 || !!(d.commit && (d.commit.w || d.commit.b));
        }

        /* El reloj del duelo: los dos piensan a la vez, así que corren los dos
           relojes desde que empieza la ronda (clock_updated_at), y cada uno se
           detiene cuando ese jugador confirma su jugada (ahí se le descuenta lo
           pensado y se le suma el incremento). Al resolverse la ronda arrancan
           los dos de nuevo. La base lo valida igual (proteger_reloj_de_partida:
           en Duelo corren los dos, menos el de quien ya confirmó). */
        function corren(row) {
            const c = (row.duelo_state && row.duelo_state.commit) || {};
            return { w: !c.w, b: !c.b };
        }
        function renderClocks() {
            if (!room) return;
            SalaJuego.pintarRelojes(room, { miColor: myColor, corren: corren(room), nombreDe: (c) => nameFor(c === "w" ? room.white_id : room.black_id) });
        }
        setInterval(() => {
            if (!room || !board) return;
            renderClocks();
            // La bandera, para cada uno que todavía no confirmó su jugada.
            const c = corren(room);
            ["w", "b"].forEach((color) => { if (c[color]) SalaJuego.revisarBandera(room, ROOM_ID, color); });
        }, 250);
        function sinTiempo(color) {
            const quedan = SalaJuego.restante(room, color, null, corren(room));
            return quedan !== null && quedan <= 0;
        }

        function updateStatusText() {
            document.getElementById("top-player").textContent = nameFor(myColor === "b" ? room.white_id : room.black_id) + (myColor === "b" ? " (blancas)" : " (negras)");
            document.getElementById("bottom-player").textContent = myColor
                ? nameFor(profile.id) + (myColor === "w" ? " (blancas) — tú" : " (negras) — tú")
                : nameFor(room.white_id) + " (blancas)";
            if (!myColor) document.getElementById("top-player").textContent = nameFor(room.black_id) + " (negras)";
            document.getElementById("resign-btn").classList.toggle("hidden", !myColor || room.status !== "playing");
            const myReady = myColor === "w" ? room.white_ready : myColor === "b" ? room.black_ready : true;
            const esperandoInicio = room.status === "playing" && !listos(room);
            document.getElementById("ready-btn").classList.toggle("hidden", !myColor || !esperandoInicio || myReady);

            const g = board.game;
            let myTurnNow = false;
            if (room.status === "finished") {
                // Rendirse solo escribe room.result (no toca duelo_state), así que manda
                // el de la sala y el del estado queda de respaldo.
                const resultado = room.result || g.result;
                // El motivo, de la sala (que es siempre la más nueva): el tablero
                // puede haberse quedado con el estado de la revelación propia,
                // anterior a la ronda que terminó la partida, y diría «Tablas.».
                const motivo = (room.duelo_state && room.duelo_state.motivo) || g.motivo;
                const resultText = resultado === "draw" ? SalaJuego.textoTablas(motivo) : (resultado === "white" ? nameFor(room.white_id) + " ganó con blancas." : nameFor(room.black_id) + " ganó con negras.");
                setStatus("Partida terminada — " + resultText);
            } else if (esperandoInicio) {
                if (!myColor) setStatus("Esperando a que " + nameFor(room.white_id) + " y " + nameFor(room.black_id) + " confirmen que están listos…");
                else if (myReady) setStatus("Ya confirmaste que estás listo — esperando a " + nameFor(myColor === "w" ? room.black_id : room.white_id) + "…");
                else setStatus("Toca \"Estoy listo\" cuando puedas empezar a jugar" + (room.initial_seconds != null ? " — el reloj arranca cuando ambos estén listos." : "."));
            } else if (!myColor) {
                setStatus("Estás mirando esta partida — ronda " + g.round + ".");
            } else {
                const yaComprometi = !!g.commit[myColor];
                const rivalComprometio = !!g.commit[myColor === "w" ? "b" : "w"];
                myTurnNow = !yaComprometi;
                if (!yaComprometi) setStatus("Ronda " + g.round + " — elige tu jugada en secreto. El rival no la ve hasta que las dos estén comprometidas.");
                else if (!rivalComprometio) setStatus("Ya comprometiste tu jugada — esperando a que " + nameFor(myColor === "w" ? room.black_id : room.white_id) + " comprometa la suya.");
                else setStatus("Las dos jugadas están comprometidas — revelando y resolviendo la ronda…");
            }
            if (window.TurnAlert) TurnAlert.check(myTurnNow);

            const eventEl = document.getElementById("round-event");
            if (g.lastRound) {
                eventEl.textContent = "Ronda " + g.lastRound.round + ": blancas " + g.lastRound.w + (g.lastRound.b ? " · negras " + g.lastRound.b : "") + (g.lastRound.choque ? " — ¡choque! Las dos piezas se destruyeron." : "");
                eventEl.classList.remove("hidden");
            } else {
                eventEl.classList.add("hidden");
            }

            const stageControls = document.getElementById("stage-controls");
            // Comprometida la jugada, ya no hay nada que confirmar ni cambiar: la
            // jugada queda marcada en el tablero, pero los botones se van.
            const comprometida = board.locked || !!(myColor && g.commit[myColor]);
            stageControls.classList.toggle("hidden", !board.staged || comprometida || room.status !== "playing");
        }

        function renderRoundsHistory() {
            const listEl = document.getElementById("rounds-list");
            const emptyEl = document.getElementById("rounds-empty");
            const historial = (room.duelo_state && room.duelo_state.historial) || [];
            if (!historial.length) { emptyEl.classList.remove("hidden"); listEl.classList.add("hidden"); return; }
            emptyEl.classList.add("hidden");
            listEl.classList.remove("hidden");
            listEl.innerHTML = "";
            historial.forEach((r) => {
                const li = document.createElement("li");
                li.textContent = r.round + ". blancas " + r.w + " · negras " + r.b + (r.choque ? " (choque)" : "");
                listEl.appendChild(li);
            });
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

        /* El compromiso y la revelación de cada jugador van por
           duelo_guardar(): la base pone solo la parte propia (jsonb_set) sobre
           la fila bloqueada. Los dos escriben casi a la vez, y guardando el
           estado ENTERO tal como se había leído, la segunda escritura borraba
           lo que la primera acababa de poner: una revelación perdida dejaba la
           partida en «revelando…» para siempre. Ver «Las dos escrituras del
           duelo ya no se pisan» en docs/decisiones/juegos-y-torneos.md.
           Devuelve la sala guardada, o null si no quedó. */
        async function guardarParte(ronda, parte, valor, tiempo) {
            const { data, error } = await sb.rpc("duelo_guardar", { p_sala: ROOM_ID, p_ronda: ronda, p_parte: parte, p_valor: valor, p_tiempo: tiempo == null ? null : tiempo });
            const fila = Array.isArray(data) ? data[0] : data;
            if (error || !fila) {
                if (error) console.error(error);
                await releerSala(error ? "No se pudo guardar la jugada: " + error.message : null);
                return null;
            }
            room = SalaJuego.laMasNueva(room, fila);
            return fila;
        }

        // Resolver la ronda escribe el estado entero, pero solo si la ronda en la
        // base sigue siendo la que se resolvió: si ya la resolvió la otra
        // pantalla y el rival confirmó la siguiente, esto no se la borra.
        async function pushDueloState(state, extraPatch, ronda) {
            const patch = Object.assign({ duelo_state: state, updated_at: new Date().toISOString() }, extraPatch || {});
            // Solo se guarda si la partida sigue en juego: si el rival se rindió mientras
            // tanto, esta ronda no puede pisar ese resultado. Y si no quedó guardada, se
            // vuelve a leer la sala para que el tablero enseñe el estado real.
            // Se pide la fila de vuelta y, si mientras viajaba ya llegó algo más nuevo
            // (el rival también escribe), se queda lo más nuevo.
            let guardar = sb.from("game_rooms").update(patch).eq("id", ROOM_ID).eq("status", "playing");
            if (ronda != null) guardar = guardar.eq("duelo_state->>round", String(ronda));
            const { data: guardada, error } = await guardar.select("*");
            if (error || !guardada || !guardada.length) {
                if (error) console.error(error);
                const yaResuelta = !error && ronda != null && room.status === "playing";
                await releerSala(error ? "No se pudo guardar la jugada: " + error.message : (yaResuelta ? null : "La partida ya había terminado: esa jugada no quedó guardada."));
                return false;
            }
            room = SalaJuego.laMasNueva(room, guardada[0]);
            SalaJuego.avisarTorneo(room);
            return true;
        }

        // Tras cualquier cambio remoto (o local) del estado, revisa si hace
        // falta revelar automáticamente (si ya comprometí y el rival también,
        // y todavía no revelé) o resolver la ronda (si las dos ya revelaron).
        // Idempotente: si dos navegadores lo intentan a la vez, las dos
        // resoluciones dan el mismo resultado porque resolveRound() es una
        // función pura de las jugadas ya reveladas.
        //
        // A diferencia de Crazyhouse (donde solo un color escribe por turno),
        // acá los dos jugadores pueden escribir casi al mismo tiempo (cada uno
        // se auto-revela apenas ve que el otro ya comprometió). Por eso, antes
        // de guardar, se vuelve a leer la fila más reciente de la base en vez
        // de confiar en el `room` que ya está en memoria — así el reveal
        // propio nunca pisa un reveal del rival que se haya guardado un
        // instante antes.
        async function maybeAdvance() {
            let g = board.game;
            // Con la sala ya terminada (una rendición) no queda nada que revelar ni
            // resolver; y sin este corte, releerSala() → applyRemoteRoom() → acá
            // volvería a intentar guardar, fallar y releer, sin fin.
            if (g.gameOver || !myColor || room.status !== "playing") return;

            // Ojo: revelar la propia jugada ANTES de que el rival haya comprometido
            // la suya arruinaría todo el sentido del commit-reveal (dejaría mi
            // jugada en texto plano en la fila, visible para el rival, mientras
            // él todavía puede elegir la suya) — por eso bothCommitted() es una
            // condición obligatoria acá, no solo un detalle de orden.
            if (g.commit[myColor] && !g.reveal[myColor] && mySecret && g.bothCommitted()) {
                const { data: fresh, error } = await sb.from("game_rooms").select("duelo_state").eq("id", ROOM_ID).single();
                if (error || !fresh) return;
                g = DueloSimultaneo.Game.fromJSON(fresh.duelo_state);
                if (g.gameOver || g.reveal[myColor] || !g.bothCommitted()) return; // ya se adelantó otra pestaña/pestañeo
                const r = await g.revealMove(myColor, mySecret.move, mySecret.salt);
                if (!r.ok) return;
                const fila = await guardarParte(g.round, "reveal", g.reveal[myColor]);
                if (!fila) return;
                // Lo guardado trae también lo del rival, si ya había revelado.
                g = DueloSimultaneo.Game.fromJSON(fila.duelo_state);
                board.game = g; board.render(); updateStatusText();
                if (g.bothRevealed()) await maybeAdvance(); // por si el rival ya había revelado también
                return;
            }

            if (g.bothRevealed()) {
                const { data: fresh, error } = await sb.from("game_rooms").select("duelo_state, status").eq("id", ROOM_ID).single();
                if (error || !fresh) return;
                g = DueloSimultaneo.Game.fromJSON(fresh.duelo_state);
                if (g.gameOver || fresh.status === "finished" || !g.bothRevealed()) return; // ya la resolvió otra pestaña
                const ronda = g.round;
                const res = g.resolveRound();
                mySecret = null;
                try { localStorage.removeItem(secretKey(g.round - 1)); } catch (e) {}
                board.game = g;
                board.selected = null;
                board.staged = null;
                board.locked = false;
                board.render();
                const patch = {};
                // La ronda nueva empieza ya: los dos relojes arrancan de nuevo.
                if (room.initial_seconds != null && room.clock_updated_at) patch.clock_updated_at = new Date().toISOString();
                if (res.gameOver) {
                    patch.status = "finished";
                    patch.result = res.result === "draw" ? "draw" : (res.result === "white" ? "white" : "black");
                }
                await pushDueloState(g.toJSON(), patch, ronda);
                updateStatusText();
                renderRoundsHistory();
            }
        }

        document.getElementById("confirm-btn").addEventListener("click", async () => {
            if (!myColor || !board.staged || !listos(room)) return;
            if (sinTiempo(myColor)) { setStatus("Se te acabó el tiempo: esta jugada ya no cuenta."); return; }
            const r = await board.game.commitMove(myColor, board.staged);
            if (!r.ok) { setStatus(r.error); return; }
            mySecret = { move: r.move, salt: r.salt };
            try { localStorage.setItem(secretKey(board.game.round), JSON.stringify(mySecret)); } catch (e) {}
            board.markLocked();
            updateStatusText(); // los botones se van ya, sin esperar a la base
            // Se detiene el reloj propio: lo pensado se descuenta y se suma el
            // incremento. clock_updated_at no se toca: el del rival sigue.
            const tiempo = {};
            if (room.initial_seconds != null && room.clock_updated_at) {
                const clave = myColor === "w" ? "white_time_left" : "black_time_left";
                tiempo[clave] = Math.max(0, (room[clave] || 0) - RelojServidor.desde(room.clock_updated_at)) + (room.increment_seconds || 0);
            }
            const fila = await guardarParte(board.game.round, "commit", board.game.commit[myColor], Object.values(tiempo)[0]);
            if (fila) {
                // Lo guardado trae también el compromiso del rival, si ya había.
                board.game = DueloSimultaneo.Game.fromJSON(fila.duelo_state);
                board.markLocked();
                updateStatusText();
                await maybeAdvance();
            }
        });
        document.getElementById("change-btn").addEventListener("click", () => { board.clearStaged(); updateStatusText(); });

        function applyRemoteRoom(row, desdeRelectura) {
            room = row;
            board.loadState(row.duelo_state);
            // Si ya tenía una jugada comprometida guardada en este navegador
            // (por ejemplo, tras recargar la página), se recupera aquí.
            if (myColor && !mySecret && board.game.commit[myColor]) {
                try {
                    const guardado = localStorage.getItem(secretKey(board.game.round));
                    if (guardado) mySecret = JSON.parse(guardado);
                } catch (e) {}
            }
            board.setInteractive(!!myColor && room.status === "playing" && listos(room));
            updateStatusText();
            renderRoundsHistory();
            renderClocks();
            // Tras una escritura que no quedó (releerSala) no se reintenta solo: si el
            // fallo fuera persistente, guardar → fallar → releer daría vueltas sin fin.
            if (!desdeRelectura) maybeAdvance();
            TorneoSync.onRoomUpdate(sb, row);
        }

        // Vuelve a leer la sala de la base y la aplica como un cambio remoto, forzando
        // el tablero: se usa cuando una escritura propia no quedó guardada y lo que se
        // ve en pantalla ya no es lo que hay en la base.
        async function releerSala(mensaje) {
            const fila = await SalaJuego.releer(ROOM_ID);
            if (fila) applyRemoteRoom(fila, true);
            if (mensaje) setStatus(mensaje);
        }

        document.getElementById("ready-btn").addEventListener("click", async () => {
            if (!myColor || room.status !== "playing") return;
            const { cambio, error } = await SalaJuego.marcarListo(room, ROOM_ID, myColor);
            if (error) { setStatus("No se pudo confirmar: " + error.message); return; }
            room = Object.assign({}, room, cambio);
            board.setInteractive(!!myColor && room.status === "playing" && listos(room));
            updateStatusText();
            renderClocks();
        });

        function subscribeRoom() { SalaJuego.suscribir(ROOM_ID, (fila) => applyRemoteRoom(fila), { sala: () => room, miColor: () => myColor, esperando: () => true }); }

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

            board = new DueloBoard(document.getElementById("board"), {
                interactive: !!myColor && room.status === "playing" && listos(room),
                myColor: myColor || "w",
                onPromotionNeeded: showPromotionPicker,
                onStagedChange: updateStatusText,
            });
            board.loadState(room.duelo_state);
            if (myColor && board.game.commit[myColor]) {
                try {
                    const guardado = localStorage.getItem(secretKey(board.game.round));
                    if (guardado) mySecret = JSON.parse(guardado);
                } catch (e) {}
            }
            updateStatusText();
            renderRoundsHistory();
            subscribeRoom();
            await maybeAdvance();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    