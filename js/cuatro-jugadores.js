/* El código de cuatro-jugadores.html.

   Vivía escrito dentro de la página, en un <script> de 20 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        const SEATS = ["red", "blue", "yellow", "green"];
        const SEAT_LABEL = { red: "🔴 Rojo", blue: "🔵 Azul", yellow: "🟡 Amarillo", green: "🟢 Verde" };
        const TEAMMATE = { red: "yellow", yellow: "red", blue: "green", green: "blue" };

        let session = null, profile = null, isTeacher = false, room = null, mySeat = null, board = null, game = null;
        const ROOM_ID = new URLSearchParams(window.location.search).get("room");
        const playerNames = {}; // id -> nombre para mostrar

        function setStatus(text) {
            document.getElementById("status-banner").textContent = text;
        }
        function showError(text) {
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("error-text").textContent = text;
            document.getElementById("error-state").classList.remove("hidden");
        }
        function nameFor(seat) {
            const id = room.seats[seat] && room.seats[seat].player_id;
            return id ? (playerNames[id] || "Alumno") : "—";
        }
        function allReady(row) {
            return SEATS.every((s) => row.seats[s] && row.seats[s].ready);
        }
        function statusLabel(seat) {
            const st = game.status[seat];
            if (st === "eliminated") return "Eliminado";
            if (st === "zombie") return "Se rindió (rey en piloto automático)";
            return "Jugando";
        }

        function updateStatusText() {
            document.getElementById("resign-btn").classList.toggle("hidden", !mySeat || room.status !== "playing" || game.status[mySeat] !== "active");
            const readyBtn = document.getElementById("ready-btn");
            const myReady = mySeat && room.seats[mySeat].ready;
            const waitingToStart = room.status === "playing" && !allReady(room);
            readyBtn.classList.toggle("hidden", !mySeat || room.status !== "playing" || myReady);

            if (room.status === "finished") {
                const r = room.result || {};
                let text;
                if (r.reason === "draw") text = "Tablas — se repartieron los puntos.";
                else if (r.winners && r.winners.length) {
                    text = "Ganó " + r.winners.map((s) => SEAT_LABEL[s] + " (" + nameFor(s) + ")").join(" + ") + ".";
                    // "Todos contra todos" termina en cuanto queda un solo jugador activo
                    // (ver «Fin de partida en FFA» en js/fourplayer-engine.js): los demás
                    // pudieron quedarse sin tiempo o rendirse sin que les dieran mate, y sus
                    // reyes siguen en el tablero. Sin esto, verlos ahí después de "Ganó
                    // Verde" parece que la partida se cortó a medias en vez de terminar.
                    if (r.reason === "last-standing" && r.bonusPoints && Object.values(r.bonusPoints).some((p) => p > 0)) {
                        text += " Los demás se quedaron sin tiempo o se rindieron — sus reyes no llegaron a mate, pero ya se sumó el bono por cada uno.";
                    }
                }
                else text = "Partida terminada.";
                setStatus("Partida terminada — " + text);
            } else if (waitingToStart) {
                const pending = SEATS.filter((s) => !room.seats[s].ready).map((s) => nameFor(s));
                setStatus(mySeat ? (myReady ? "Ya confirmaste que estás listo — esperando a " + pending.join(", ") + "…" : "Toca \"Estoy listo\" cuando puedas empezar.") : "Esperando a que confirmen: " + pending.join(", "));
            } else if (!mySeat) {
                setStatus("Estás mirando esta partida.");
            } else if (game.gameOver) {
                setStatus("La partida terminó.");
            } else {
                setStatus(game.turn === mySeat ? "Es tu turno." : "Le toca a " + SEAT_LABEL[game.turn] + " (" + nameFor(game.turn) + ")…");
            }
            if (window.TurnAlert) TurnAlert.check(!!mySeat && room.status === "playing" && !game.gameOver && game.turn === mySeat);
        }

        function renderSeatsPanel() {
            const wrap = document.getElementById("seats-panel");
            wrap.innerHTML = "";
            SEATS.forEach((seat) => {
                const card = document.createElement("div");
                const isTurn = room.status === "playing" && !game.gameOver && game.turn === seat;
                const eliminated = game.status[seat] === "eliminated";
                card.className = "rounded-xl p-2.5 text-center border-2 " +
                    (isTurn ? "border-accent-500 bg-accent-500/10" : "border-transparent bg-brand-50 dark:bg-brand-900") +
                    (eliminated ? " opacity-50" : "");
                const name = document.createElement("p");
                name.className = "text-xs font-semibold text-brand-800 dark:text-white truncate";
                name.textContent = SEAT_LABEL[seat] + (seat === mySeat ? " (tú)" : "");
                const player = document.createElement("p");
                player.className = "text-[11px] text-brand-500 dark:text-brand-300 truncate";
                player.textContent = nameFor(seat);
                const status = document.createElement("p");
                status.className = "text-[10px] text-brand-450 dark:text-brand-350";
                status.textContent = statusLabel(seat);
                card.append(name, player, status);
                if (room.mode === "ffa") {
                    const score = document.createElement("p");
                    score.className = "text-sm font-mono font-bold text-accent-600 dark:text-accent-400";
                    score.textContent = (room.seats[seat].score || 0) + " pts";
                    card.appendChild(score);
                }
                const clockEl = document.createElement("p");
                clockEl.className = "font-mono text-xs font-bold mt-0.5";
                clockEl.id = "clock-" + seat;
                card.appendChild(clockEl);
                wrap.appendChild(card);
            });
        }

        // ---- Reloj: igual patrón que crazyhouse.html — cada asiento guarda cuántos
        // segundos le quedaban la última vez que se "congeló" (crear la partida o
        // terminar su propia jugada); clock_updated_at (compartido) dice desde cuándo
        // corre el reloj de quien tiene el turno ahora. ----
        function formatClock(seconds) {
            if (seconds == null) return "";
            const s = Math.max(0, Math.ceil(seconds));
            return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
        }
        /* El turno del reloj es el de la sala GUARDADA (room.turn), no el del
           tablero: mientras la jugada propia viaja a la base, el tablero ya le
           pasó el turno al siguiente, pero su reloj todavía no arrancó. Con el
           del tablero, al siguiente le bajaba de golpe todo lo que uno había
           pensado y —como acá la base no valida la bandera— esta pantalla podía
           llegar a darlo por eliminado. Ver «Las jugadas llegan siempre». */
        function liveTimeLeft(seat) {
            const stored = room.seats[seat] && room.seats[seat].time_left;
            if (stored == null) return null;
            const isRunning = room.status === "playing" && !game.gameOver && room.clock_updated_at && room.turn === seat && game.status[seat] !== "eliminated";
            if (!isRunning) return stored;
            const elapsed = RelojServidor.desde(room.clock_updated_at);
            return Math.max(0, stored - elapsed);
        }
        function renderClocks() {
            SEATS.forEach((seat) => {
                const el = document.getElementById("clock-" + seat);
                if (!el) return;
                if (room.initial_seconds == null) { el.textContent = ""; return; }
                const secs = liveTimeLeft(seat);
                el.textContent = formatClock(secs);
                const isLow = room.status === "playing" && secs != null && secs <= 30;
                el.classList.toggle("text-red-600", isLow);
                el.classList.toggle("dark:text-red-400", isLow);
                el.classList.toggle("text-brand-600", !isLow);
                el.classList.toggle("dark:text-brand-300", !isLow);
            });
        }

        // Si a quien le toca mover se le acabó el reloj, se le declara eliminado (pierde
        // sus puntos de rey a quien estuviera al frente en FFA no aplica — simplemente
        // pasa el turno como si hubiera abandonado). El filtro .eq("turn", turnSeat)
        // evita que dos navegadores dupliquen el resultado si lo ven al mismo tiempo.
        async function checkFlagFall() {
            if (room.status !== "playing" || room.initial_seconds == null || game.gameOver) return;
            // Con una jugada propia viajando, el tablero va adelantado: nada que cantar.
            if (game.turn !== room.turn) return;
            const turnSeat = game.turn;
            const secondsLeft = liveTimeLeft(turnSeat);
            if (secondsLeft === null || secondsLeft > 0) return;
            game.resign(turnSeat);
            // El reloj vuelve a arrancar desde ahora: sin esto el siguiente en jugar
            // pagaría también el tiempo que se le fue al que se quedó sin reloj.
            await persist({ turn: game.turn, clock_updated_at: new Date().toISOString() }, { turnoDe: turnSeat });
        }

        setInterval(() => {
            if (!room || !game) return;
            renderClocks();
            checkFlagFall();
            maybeAdvanceZombie();
        }, 700);

        // ---- Un jugador zombi (se rindió o se le acabó el reloj): cualquier navegador
        // conectado a la partida puede resolver su turno automáticamente. El guard
        // .eq("turn", zombieSeat) hace que, si dos navegadores lo intentan casi a la vez,
        // solo el primero en llegar a la base de datos tenga efecto (el segundo actualiza
        // 0 filas porque el turno ya cambió) — no hace falta coordinación extra. ----
        let zombieAttemptInFlight = false;
        async function maybeAdvanceZombie() {
            if (zombieAttemptInFlight || !room || room.status !== "playing" || game.gameOver || game.turn !== room.turn) return;
            const seat = game.turn;
            if (game.status[seat] !== "zombie") return;
            zombieAttemptInFlight = true;
            try {
                const res = game.playZombieTurn();
                // Mismo motivo que en la caída de bandera: el reloj del siguiente
                // arranca ahora, no cuando empezó a correr el del rey abandonado. Y la
                // jugada automática también puede capturar o dar mate: sus puntos van.
                if (res && res.ok) await persist({ clock_updated_at: new Date().toISOString() }, { turnoDe: seat, jugada: res });
            } finally {
                zombieAttemptInFlight = false;
            }
        }

        function renderMoveHistory(moves) {
            const listEl = document.getElementById("moves-list");
            const emptyEl = document.getElementById("moves-empty");
            if (!moves || !moves.length) { emptyEl.classList.remove("hidden"); listEl.classList.add("hidden"); return; }
            emptyEl.classList.add("hidden");
            listEl.classList.remove("hidden");
            listEl.classList.add("flex");
            listEl.innerHTML = "";
            moves.forEach((m, i) => {
                const li = document.createElement("li");
                li.textContent = (i + 1) + ". " + SEAT_LABEL[m.seat].slice(2, 3) + " " + FourPlayerChess.nombre(m.from) + "→" + FourPlayerChess.nombre(m.to) + (m.capture ? "x" : "") + (m.promotion ? "=D" : "") + (m.castle ? " (enroque)" : "");
                listEl.appendChild(li);
            });
        }

        function showPromotionPicker(from, to, callback) {
            const modal = document.getElementById("promotion-modal");
            const optionsEl = document.getElementById("promotion-options");
            optionsEl.innerHTML = "";
            const pieces = [["q", "♛"], ["r", "♜"], ["b", "♝"], ["n", "♞"]];
            let resolved = false;
            function finish(piece) { if (resolved) return; resolved = true; modal.classList.add("hidden"); callback(piece); }
            pieces.forEach(([type, glyph]) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "w-12 h-12 text-3xl rounded-lg border-2 border-brand-200 dark:border-brand-700 hover:border-accent-500 bg-white dark:bg-brand-800 transition-colors";
                btn.textContent = glyph;
                btn.addEventListener("click", () => finish(type));
                optionsEl.appendChild(btn);
            });
            modal.classList.remove("hidden");
        }

        // Suma al `seats` los puntos de la jugada y, si la partida terminó con ESTA
        // escritura, el bono final — y guarda todo (tablero + seats + estado). Los puntos
        // se suman acá y no en handleLocalMove porque la partida también avanza por
        // bandera, rendición o jugada automática, y ahí se perdían. `patch` son campos
        // extra (p. ej. el reloj); `opts.turnoDe`, si se pasa, se usa como condición
        // .eq("turn", ...) para pisadas seguras (jugadas zombi/reloj); `opts.jugada` es
        // lo que devolvió el motor, de donde salen los puntos; `opts.aviso` se dice si
        // la escritura no quedó.
        async function persist(patch, opts) {
            opts = opts || {};
            const newSeats = JSON.parse(JSON.stringify(room.seats));
            SEATS.forEach((s) => { newSeats[s].status = game.status[s]; });
            const puntos = (opts.jugada && opts.jugada.pointsAwarded) || {};
            Object.keys(puntos).forEach((seat) => { newSeats[seat].score = (newSeats[seat].score || 0) + puntos[seat]; });
            // El bono solo lo suma quien termina la partida: si la sala ya estaba
            // terminada, ese bono ya se había sumado antes.
            if (game.gameOver && room.status === "playing" && game.result && game.result.bonusPoints) {
                Object.keys(game.result.bonusPoints).forEach((seat) => { newSeats[seat].score = (newSeats[seat].score || 0) + game.result.bonusPoints[seat]; });
            }
            const fullPatch = Object.assign({
                board: game.toJSON(),
                turn: game.turn,
                moves: game.moves,
                seats: newSeats,
                status: game.gameOver ? "finished" : "playing",
                result: game.result,
                updated_at: new Date().toISOString(),
            }, patch, { seats: newSeats });
            // Solo se escribe sobre una partida que sigue en juego: una rendición o una
            // jugada que llega tarde no puede pisar un final que ya quedó guardado.
            // Y solo sobre la versión de la sala que se tenía a la vista
            // (`updated_at`, que cambia con cada escritura de la partida): acá se
            // guarda el tablero ENTERO, así que una rendición y una jugada casi a la
            // vez se pisaban, y la que llegaba segunda borraba a la otra.
            let query = sb.from("fourplayer_games").update(fullPatch).eq("id", ROOM_ID).eq("status", "playing");
            if (opts.turnoDe) query = query.eq("turn", opts.turnoDe);
            if (room.updated_at) query = query.eq("updated_at", room.updated_at);
            const { data: guardada, error } = await query.select("*");
            if (error || !guardada || !guardada.length) {
                // No quedó: el tablero local ya muestra la jugada, así que se vuelve a
                // leer la sala para que enseñe la real. Con turnoDe, cero filas es lo
                // normal (otro navegador resolvió ese turno antes) y no se avisa.
                if (error) console.error(error);
                const aviso = error ? "No se pudo guardar: " + error.message : (opts.aviso != null ? opts.aviso : (opts.turnoDe ? null : "La partida ya había terminado: esa jugada no quedó guardada."));
                await releerSala(aviso || null);
                // null: la base dio un error (ya se dijo); false: cero filas, la
                // sala había cambiado.
                return error ? null : false;
            }
            // La fila de la base (el reloj con SU hora), o algo más nuevo si ya llegó.
            // El tablero se rehace desde ella: una relectura que llegó mientras se
            // guardaba traía la sala de antes de la jugada y la borraba del tablero
            // local, y la jugada quedaba guardada sin verse (ni su eco la traía de
            // vuelta, porque era igual a `room`).
            room = SalaJuego.laMasNueva(room, guardada[0]);
            game = FourPlayerChess.Game.fromJSON(room.board);
            renderAll();
            return true;
        }

        // Vuelve a leer la sala y la aplica como un cambio remoto: el `game` local se
        // rehace desde la base, así que lo que no quedó guardado desaparece del tablero.
        async function releerSala(mensaje) {
            const { data: fila, error } = await sb.from("fourplayer_games").select("*").eq("id", ROOM_ID).single();
            if (error || !fila) console.error(error);
            else applyRemoteRoom(fila);
            if (mensaje) setStatus(mensaje);
        }

        async function handleLocalMove(res) {
            // Los puntos (y el bono si termina) los suma persist() con `jugada`, que es
            // el mismo camino de la bandera, la rendición y la jugada automática.
            const newSeats = JSON.parse(JSON.stringify(room.seats));
            const patch = {};
            if (room.initial_seconds != null) {
                const elapsed = room.clock_updated_at ? RelojServidor.desde(room.clock_updated_at) : 0;
                newSeats[mySeat].time_left = Math.max(0, (room.seats[mySeat].time_left || 0) - elapsed) + (room.increment_seconds || 0);
                patch.clock_updated_at = new Date().toISOString();
            }
            room = Object.assign({}, room, { seats: newSeats });
            await persist(patch, { jugada: res, turnoDe: mySeat, aviso: "Esa jugada no quedó guardada: la partida ya iba más adelante." });
        }

        function renderAll() {
            board.loadGame(game);
            board.setInteractive(!!mySeat && room.status === "playing" && allReady(room) && game.status[mySeat] === "active" && !game.gameOver);
            renderSeatsPanel();
            renderMoveHistory(game.moves);
            updateStatusText();
            renderClocks();
        }

        function applyRemoteRoom(row) {
            // Lo viejo o repetido que llegue tarde no hace retroceder el tablero.
            if (room && SalaJuego.esAnterior(row, room)) return;
            room = row;
            game = FourPlayerChess.Game.fromJSON(row.board);
            renderAll();
        }

        /* La misma escucha que las salas de dos (js/sala-juego.js): vuelve a
           leer la sala al reconectarse, al volver a la pestaña y si pasa un rato
           sin noticias. Antes solo escuchaba Realtime, y una jugada que pasaba con
           el canal caído no llegaba nunca. */
        function subscribeRoom() {
            SalaJuego.suscribir(ROOM_ID, (fila) => applyRemoteRoom(fila), {
                tabla: "fourplayer_games", canal: "fourplayer-game-",
                sala: () => room, miColor: () => mySeat,
                esperando: () => !allReady(room) || room.turn !== mySeat,
            });
        }

        /* «Estoy listo» guarda los cuatro asientos (es un solo jsonb): si dos lo
           tocaban casi a la vez, el segundo borraba el «listo» del primero y la
           partida no arrancaba nunca. Ahora se guarda solo sobre la versión que se
           tenía a la vista (`updated_at`) y, si otro escribió antes, se vuelve a
           leer y se intenta otra vez sobre lo nuevo. */
        document.getElementById("ready-btn").addEventListener("click", async () => {
            for (let intento = 0; intento < 6; intento++) {
                if (!mySeat || room.status !== "playing" || room.seats[mySeat].ready) return;
                const newSeats = JSON.parse(JSON.stringify(room.seats));
                newSeats[mySeat].ready = true;
                const patch = { seats: newSeats, updated_at: new Date().toISOString() };
                if (allReady(Object.assign({}, room, { seats: newSeats })) && room.initial_seconds != null && !room.clock_updated_at) {
                    patch.clock_updated_at = new Date().toISOString();
                }
                let query = sb.from("fourplayer_games").update(patch).eq("id", ROOM_ID);
                if (room.updated_at) query = query.eq("updated_at", room.updated_at);
                const { data: guardada, error } = await query.select("*");
                if (error) { console.error(error); setStatus("No se pudo confirmar: " + error.message); return; }
                if (guardada && guardada[0]) { room = SalaJuego.laMasNueva(room, guardada[0]); renderAll(); return; }
                await releerSala(null);
            }
            setStatus("No se pudo confirmar: la sala cambiaba sin parar. Vuelve a tocar «Estoy listo».");
        });

        document.getElementById("resign-btn").addEventListener("click", async () => {
            if (!mySeat || room.status !== "playing") return;
            if (!(await Avisos.confirmar("Tu rey seguirá moviéndose solo hasta que le den mate.", { titulo: "¿Rendirte?", aceptar: "Rendirme", peligro: true }))) return;
            // El diálogo pudo quedar abierto un buen rato: si mientras tanto la partida
            // terminó o te eliminaron, rendirse no puede pisar ese estado.
            if (room.status !== "playing" || game.gameOver || game.status[mySeat] !== "active") { setStatus("La partida ya había terminado para ti."); return; }
            // Con cuatro jugando, la rendición choca a menudo con la jugada de otro
            // (persist solo escribe sobre la versión de la sala que se tenía): si
            // la partida sigue, se vuelve a intentar sobre la sala recién leída,
            // igual que «Estoy listo».
            for (let intento = 0; intento < 3; intento++) {
                if (room.status !== "playing" || game.gameOver || game.status[mySeat] !== "active") { setStatus("La partida ya había terminado para ti: la rendición no hizo falta."); return; }
                const turnoAntes = game.turn;
                game.resign(mySeat);
                const patch = {};
                // Si la rendición le pasa el turno a otro, su reloj arranca ahora.
                if (game.turn !== turnoAntes) patch.clock_updated_at = new Date().toISOString();
                const quedo = await persist(patch, { aviso: "" });
                if (quedo !== false) return;
            }
            setStatus("Tu rendición no quedó: la partida cambiaba sin parar. Vuelve a tocar «Rendirse».");
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

            const { data: roomData, error: roomError } = await sb.from("fourplayer_games").select("*").eq("id", ROOM_ID).maybeSingle();
            if (roomError || !roomData) { showError("No se encontró esa partida — puede que ya se haya eliminado."); return; }
            room = roomData;
            game = FourPlayerChess.Game.fromJSON(room.board);
            mySeat = SEATS.find((s) => room.seats[s].player_id === profile.id) || null;
            if (!mySeat && !isTeacher) { showError("No formas parte de esta partida."); return; }

            const ids = SEATS.map((s) => room.seats[s].player_id).filter(Boolean);
            /* Los nombres salen de nombres_de_jugadores() y no de `profiles`:
               desde que el reto está abierto a toda la Academia un asiento
               puede ser de otra clase, que por la RLS de `profiles` no se ve, y
               aquel select se llevaba también su correo. */
            const { data: players } = await sb.rpc("nombres_de_jugadores", { p_ids: ids });
            (players || []).forEach((p) => { playerNames[p.id] = p.nombre; });

            document.getElementById("page-title").textContent = "♟️ Ajedrez para 4 · " + (room.mode === "teams" ? "Equipos" : "Todos contra todos");

            board = new FourPlayerBoard(document.getElementById("board"), {
                mySeat: mySeat,
                interactive: !!mySeat && room.status === "playing" && allReady(room) && game.status[mySeat] === "active",
                onMove: handleLocalMove,
                onPromotionNeeded: showPromotionPicker,
            });
            renderAll();
            subscribeRoom();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    