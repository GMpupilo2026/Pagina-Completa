/* El código de torneo.html.

   Vivía escrito dentro de la página, en un <script> de 34 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null, tournament = null, isOwner = false, amIRegistered = false;
        let registrations = [], rounds = [], pairingsByRound = {};
        // Las salas de las partidas que se están jugando ahora, por id, y el tablerito
        // que dibuja cada una. Se rehacen en cada render de las rondas.
        let salasEnJuego = {}, tablerosEnVivo = {};
        const playerNames = {};
        const TOURNEY_ID = new URLSearchParams(window.location.search).get("id");

        const FORMAT_LABEL = { swiss: "Suizo", elimination: "Eliminación directa", round_robin: "Todos contra todos" };
        const VARIANT_LABEL = { estandar: "⚔️ Ajedrez Estándar", crazyhouse: "♞ Crazyhouse", cartas: "🃏 Ajedrez de Cartas", duelo: "⚡ Duelo Simultáneo", niebla: "🌫️ Niebla de Guerra" };
        const STATUS_LABEL = { registration: "🟢 Inscripción abierta", in_progress: "🔵 En curso", finished: "🏁 Terminado" };

        function nameFor(id) { return playerNames[id] || "Jugador"; }   // "Jugador" y no "Alumno": el profesor también se inscribe
        function escapeHtml(text) {
            const div = document.createElement("div");
            div.textContent = text;
            return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        function showError(text) {
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("error-text").textContent = text;
            document.getElementById("error-state").classList.remove("hidden");
        }

        // Cada variante de 2 jugadores vive en su propia página — igual que en
        // juegos.html, pero acá se enlaza directo desde un cruce de torneo.
        function pageFor2pVariant(variant) {
            if (variant === "estandar") return "estandar.html";
            if (variant === "cartas") return "cartas.html";
            if (variant === "duelo") return "duelo.html";
            if (variant === "niebla") return "niebla.html";
            return "crazyhouse.html";
        }

        /* ---------------------------------------------------------------
           La posición de una partida NO vive siempre en la misma columna, y
           equivocarse acá no da ningún error: chess.js rechaza la FEN, el
           tablero se dibuja en la posición inicial y se ve perfecto — solo que
           enseña una partida que nadie está jugando.
             · estándar y niebla → `fen`
             · crazyhouse        → `fen`, pero con la reserva entre corchetes
                                   pegada al final, que chess.js no entiende
             · cartas            → `cartas_state.fen`
             · duelo             → `duelo_state.fen` (la columna `fen` de la
                                   sala se queda en la posición de salida)
           Es la misma cuenta que hace tv.html para su grilla de partidas en
           vivo; acá se escribe otra vez porque son dos páginas sueltas sin un
           módulo común, y la de allá lleva meses funcionando sin tocarse. */
        function fenDeLaSala(room) {
            if (!room) return null;
            if (room.variant === "cartas") return room.cartas_state && room.cartas_state.fen;
            if (room.variant === "duelo") return room.duelo_state && room.duelo_state.fen;
            return (room.fen || "").replace(/\[[^\]]*\]/, "") || null;
        }

        function buildGameRoomFields(whiteId, blackId) {
            const fila = {
                variant: tournament.variant, white_id: whiteId, black_id: blackId, created_by: profile.id,
                initial_seconds: tournament.initial_seconds, increment_seconds: tournament.increment_seconds,
                white_time_left: tournament.initial_seconds, black_time_left: tournament.initial_seconds,
            };
            if (tournament.variant === "cartas") fila.cartas_state = CartasChess.Game.iniciar().toJSON();
            if (tournament.variant === "duelo") fila.duelo_state = new DueloSimultaneo.Game().toJSON();
            if (tournament.variant === "niebla" || tournament.variant === "estandar") fila.fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
            return fila;
        }

        async function register() {
            const { error } = await sb.from("tournament_registrations").insert({ tournament_id: tournament.id, player_id: profile.id });
            if (error) { Avisos.avisar("No se pudo inscribir: " + error.message, { tipo: "error" }); return; }
            await loadAll();
        }
        async function withdraw() {
            const { error } = await sb.from("tournament_registrations").delete().eq("tournament_id", tournament.id).eq("player_id", profile.id);
            if (error) { Avisos.avisar("No se pudo retirar la inscripción: " + error.message, { tipo: "error" }); return; }
            await loadAll();
        }

        async function startTournament() {
            if (registrations.length < 2) { Avisos.avisar("Hacen falta al menos 2 inscritos.", { tipo: "error" }); return; }
            const players = registrations.map((r) => r.player_id);
            let totalRounds;
            if (tournament.format === "swiss") {
                const input = document.getElementById("rounds-input");
                totalRounds = parseInt(input.value, 10) || TorneoEngine.suggestedTotalRounds("swiss", players.length);
            } else {
                totalRounds = TorneoEngine.suggestedTotalRounds(tournament.format, players.length);
            }
            const { error } = await sb.from("tournaments").update({
                status: "in_progress", total_rounds: totalRounds, current_round: 0,
                started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).eq("id", tournament.id);
            if (error) { Avisos.avisar("No se pudo empezar el torneo: " + error.message, { tipo: "error" }); return; }
            tournament.status = "in_progress";
            tournament.total_rounds = totalRounds;
            tournament.current_round = 0;
            await generateRound();
        }

        async function fetchAllPairingsFlat() {
            const { data } = await sb.from("tournament_pairings").select("white_id, black_id, is_bye, result, advance_id").eq("tournament_id", tournament.id);
            return (data || []).map((p) => ({ white: p.white_id, black: p.black_id, isBye: p.is_bye, result: p.result, advanceId: p.advance_id }));
        }

        async function generateRound() {
            const nextRoundNumber = tournament.current_round + 1;
            const players = registrations.map((r) => r.player_id);
            let pairings;
            if (tournament.format === "round_robin") {
                pairings = TorneoEngine.roundRobinRound(players, nextRoundNumber);
            } else if (tournament.format === "swiss") {
                pairings = TorneoEngine.swissRound(players, await fetchAllPairingsFlat(), players);
            } else {
                if (nextRoundNumber === 1) {
                    pairings = TorneoEngine.eliminationFirstRound(players);
                } else {
                    const prevRound = rounds.find((r) => r.round_number === nextRoundNumber - 1);
                    const prevPairings = (pairingsByRound[prevRound.id] || []).slice().sort((a, b) => a.board_number - b.board_number)
                        .map((p) => ({ white: p.white_id, black: p.black_id, isBye: p.is_bye, result: p.result, advanceId: p.advance_id }));
                    pairings = TorneoEngine.eliminationNextRound(prevPairings);
                }
            }

            // Primero TODAS las salas, y recién con todas creadas la ronda y sus cruces.
            // Al revés, un cruce cuya sala fallaba desaparecía de la ronda: la ronda
            // se daba por completa sin esos dos jugadores, el suizo no les sumaba nada y
            // en eliminación directa la llave se corría. Una ronda y sus cruces no se
            // pueden borrar desde acá, pero una sala sí: si falla alguna, se deshacen
            // las creadas y no se abre la ronda.
            //
            // Las salas se piden todas a la vez: con varias decenas de jugadores,
            // esperar cada ida y vuelta por turno se sentía como que la página se había
            // colgado.
            const salas = new Map();   // índice del cruce → id de su sala
            const erroresDeSala = [];
            await Promise.all(pairings.map(async (p, i) => {
                if (p.isBye) return;
                const { data: roomRow, error: roomError } = await sb.from("game_rooms").insert(buildGameRoomFields(p.white, p.black)).select().single();
                if (roomError) { console.error(roomError); erroresDeSala.push(roomError.message); return; }
                salas.set(i, roomRow.id);
            }));
            if (erroresDeSala.length) {
                const creadas = [...salas.values()];
                if (creadas.length) await sb.from("game_rooms").delete().in("id", creadas);
                Avisos.avisar("No se generó la ronda: no se pudo crear la partida de " + erroresDeSala.length +
                      " cruce(s). Inténtalo de nuevo.\n" + erroresDeSala.join("\n"), { tipo: "error" });
                return;
            }

            const { data: roundRow, error: roundError } = await sb.from("tournament_rounds").insert({
                tournament_id: tournament.id, round_number: nextRoundNumber,
            }).select().single();
            if (roundError) {
                if (salas.size) await sb.from("game_rooms").delete().in("id", [...salas.values()]);
                Avisos.avisar("No se pudo crear la ronda: " + roundError.message, { tipo: "error" });
                return;
            }

            // El número de tablero sigue el orden de pairings: 1, 2, 3…
            const erroresDeCruce = [];
            await Promise.all(pairings.map(async (p, i) => {
                const fila = p.isBye
                    ? { round_id: roundRow.id, tournament_id: tournament.id, board_number: i + 1,
                        white_id: p.white, black_id: null, is_bye: true, result: "white", finished_at: new Date().toISOString() }
                    : { round_id: roundRow.id, tournament_id: tournament.id, board_number: i + 1,
                        white_id: p.white, black_id: p.black, is_bye: false, game_room_id: salas.get(i) };
                const { error } = await sb.from("tournament_pairings").insert(fila);
                if (error) { console.error(error); erroresDeCruce.push(error.message); }
            }));
            if (erroresDeCruce.length) {
                Avisos.avisar("La ronda quedó con " + erroresDeCruce.length + " cruce(s) sin guardar:\n" + erroresDeCruce.join("\n"), { tipo: "error" });
            }

            await sb.from("tournaments").update({ current_round: nextRoundNumber, updated_at: new Date().toISOString() }).eq("id", tournament.id);
            tournament.current_round = nextRoundNumber;
            await TorneoSync.maybeFinishRound(sb, roundRow.id); // por si la ronda generada salió toda de byes
            await loadAll();
        }

        async function resolveAdvance(pairingId, winnerId, roundId) {
            await sb.from("tournament_pairings").update({ advance_id: winnerId, needs_manual_advance: false }).eq("id", pairingId);
            await TorneoSync.maybeFinishRound(sb, roundId);
            await loadAll();
        }

        /* Cambiar el tiempo del torneo. Es de quien lo organiza (y de quien
           administra): la base se lo revierte a cualquier otro, y un torneo
           terminado ya no cambia de ritmo. Las partidas se arman con el tiempo
           del torneo al generar cada ronda, así que cambiarlo a mitad de torneo
           vale desde la ronda siguiente: la que está en juego sigue con su reloj.
           El selector se vuelve a poner SOLO si el tiempo guardado cambió: un
           repintado por Realtime no puede pisarle a quien lo está eligiendo. */
        let ritmoControl = null, ritmoPuesto = null;
        function renderRitmo() {
            const seccion = document.getElementById("ritmo-seccion");
            const puede = isOwner && tournament.status !== "finished";
            seccion.hidden = !puede;
            if (!puede) return;
            if (!ritmoControl) ritmoControl = Ritmos.montar(document.getElementById("ritmo-torneo"));
            const clave = tournament.initial_seconds + "+" + tournament.increment_seconds;
            if (clave !== ritmoPuesto) { ritmoControl.poner(tournament.initial_seconds, tournament.increment_seconds); ritmoPuesto = clave; }
            document.getElementById("ritmo-nota").textContent = tournament.status === "registration"
                ? "Todavía se puede cambiar: todas las partidas del torneo se van a jugar con este tiempo."
                : "Las partidas que ya empezaron siguen con su reloj; el tiempo nuevo vale desde la próxima ronda.";
        }

        async function guardarRitmo() {
            const msg = document.getElementById("ritmo-msg");
            const r = ritmoControl.leer();
            if (r.error) { msg.textContent = r.error; msg.className = "text-xs text-red-600 dark:text-red-400 min-h-[1em]"; return; }
            const boton = document.getElementById("ritmo-guardar");
            boton.disabled = true;
            const { data, error } = await sb.from("tournaments")
                .update({ initial_seconds: r.initial, increment_seconds: r.increment, updated_at: new Date().toISOString() })
                .eq("id", tournament.id).select("initial_seconds, increment_seconds");
            boton.disabled = false;
            const fila = data && data[0];
            // Se vuelve a leer lo que quedó: la base revierte en silencio a quien no organiza.
            if (error || !fila || fila.initial_seconds !== r.initial || fila.increment_seconds !== r.increment) {
                msg.textContent = "No se pudo cambiar el tiempo" + (error ? ": " + error.message : ".");
                msg.className = "text-xs text-red-600 dark:text-red-400 min-h-[1em]";
                return;
            }
            tournament.initial_seconds = fila.initial_seconds;
            tournament.increment_seconds = fila.increment_seconds;
            ritmoPuesto = null;
            render();
            msg.textContent = "✅ Guardado: " + Ritmos.etiqueta(fila.initial_seconds, fila.increment_seconds) + ".";
            msg.className = "text-xs text-green-700 dark:text-green-400 min-h-[1em]";
        }

        function render() {
            document.getElementById("t-name").textContent = tournament.name;
            document.getElementById("t-meta").textContent = (FORMAT_LABEL[tournament.format] || tournament.format) + " · " + (VARIANT_LABEL[tournament.variant] || tournament.variant) + " · ⏱️ " + Ritmos.etiqueta(tournament.initial_seconds, tournament.increment_seconds) + " · " + (STATUS_LABEL[tournament.status] || tournament.status);
            renderRitmo();

            document.getElementById("registration-section").classList.toggle("hidden", tournament.status !== "registration");
            if (tournament.status === "registration") renderRegistration();

            document.getElementById("rounds-section").classList.toggle("hidden", tournament.status === "registration");
            if (tournament.status !== "registration") renderRounds();

            const showStandings = tournament.status !== "registration" && tournament.format !== "elimination";
            document.getElementById("standings-section").classList.toggle("hidden", !showStandings);
            if (showStandings) renderStandings();

            const finished = tournament.status === "finished";
            document.getElementById("finished-banner").classList.toggle("hidden", !finished);
            if (finished) document.getElementById("champion-names").textContent = (tournament.winner_ids || []).map(nameFor).join(" y ") || "—";
        }

        function renderRegistration() {
            const listEl = document.getElementById("registrants-list");
            listEl.innerHTML = "";
            registrations.forEach((r) => {
                const li = document.createElement("li");
                li.textContent = nameFor(r.player_id);
                listEl.appendChild(li);
            });
            document.getElementById("registrants-count").textContent = String(registrations.length);

            /* Quien organiza también se puede inscribir: un profesor juega sus
               propios torneos, y el emparejamiento lo trata como a cualquiera.
               Antes este botón se le escondía y era la única razón por la que no
               podía jugar. */
            const selfBtn = document.getElementById("self-register-btn");
            selfBtn.classList.remove("hidden");
            selfBtn.textContent = amIRegistered ? "Retirarme" : "Inscribirme";
            selfBtn.className = "text-sm font-semibold px-4 py-2 rounded-lg transition-colors " +
                (amIRegistered ? "bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300" : "bg-accent-500 hover:bg-accent-600 text-brand-900");

            document.getElementById("owner-start-panel").classList.toggle("hidden", !isOwner);
            if (isOwner) {
                document.getElementById("start-btn").disabled = registrations.length < 2;
                const roundsField = document.getElementById("rounds-field");
                roundsField.classList.toggle("hidden", tournament.format !== "swiss");
                if (tournament.format === "swiss" && !roundsField.dataset.filled) {
                    document.getElementById("rounds-input").value = TorneoEngine.suggestedTotalRounds("swiss", Math.max(registrations.length, 2));
                    roundsField.dataset.filled = "1";
                }
            }
        }

        function renderPairingRow(p, round) {
            const row = document.createElement("div");
            row.className = "flex items-center justify-between gap-2 flex-wrap text-sm border-t border-brand-100 dark:border-brand-800 pt-2 mt-2 first:border-0 first:pt-0 first:mt-0";
            const label = document.createElement("span");
            label.textContent = p.is_bye
                ? ("Tablero " + p.board_number + ": " + nameFor(p.white_id) + " — bye (pasa directo)")
                : ("Tablero " + p.board_number + ": " + nameFor(p.white_id) + " (blancas) vs " + nameFor(p.black_id) + " (negras)");
            row.appendChild(label);

            const right = document.createElement("div");
            right.className = "flex items-center gap-2 flex-wrap";
            if (!p.is_bye) {
                if (p.result && !p.needs_manual_advance) {
                    const span = document.createElement("span");
                    span.className = "text-xs text-brand-500 dark:text-brand-300";
                    span.textContent = p.result === "draw" ? "Tablas" : (p.result === "white" ? nameFor(p.white_id) + " ganó" : nameFor(p.black_id) + " ganó");
                    right.appendChild(span);
                } else if (p.game_room_id && !p.result) {
                    const link = document.createElement("a");
                    link.href = pageFor2pVariant(tournament.variant) + "?room=" + p.game_room_id;
                    link.className = "text-xs font-semibold text-accent-600 hover:text-accent-700 transition-colors";
                    const soyJugador = p.white_id === profile.id || p.black_id === profile.id;
                    link.textContent = soyJugador ? "Jugar →" : "Ver →";
                    right.appendChild(link);
                }
                if (p.needs_manual_advance && isOwner) {
                    const hint = document.createElement("span");
                    hint.className = "text-xs text-amber-600 dark:text-amber-400 font-semibold";
                    hint.textContent = "Tablas — ¿quién avanza?";
                    right.appendChild(hint);
                    [["white_id", p.white_id], ["black_id", p.black_id]].forEach(([key, id]) => {
                        const btn = document.createElement("button");
                        btn.type = "button";
                        btn.className = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors";
                        btn.textContent = "Avanza " + nameFor(id);
                        btn.addEventListener("click", () => resolveAdvance(p.id, id, round.id));
                        right.appendChild(btn);
                    });
                }
            }
            row.appendChild(right);
            return row;
        }

        /* ---------------------------------------------------------------
           «Las partidas, en vivo»: un tablerito por cruce que se está jugando,
           debajo de la lista de la ronda.

           Existe porque hasta ahora, durante una ronda, las partidas eran
           INVISIBLES desde acá: el único acceso era un "Ver →" por cruce que
           además saca de esta página, así que para seguir tres tableros había
           que entrar y volver tres veces. Y a quien le tocó bye —que esa ronda
           no tiene ninguna otra cosa que hacer— no le quedaba nada que mirar.

           Se dibuja con el MISMO ClasesBoard compacto de las miniaturas de la
           clase en vivo (`compact: true`), que ya es la pieza compartida para
           esto: a este tamaño el glifo de texto de las blancas es un contorno
           hueco que se lee negro, así que compacto dibuja las piezas con el set
           de js/chess-piece-svg.js, que tiene relleno sólido.

           `interactive: false` en los dos sentidos que importan: acá no se
           juega —jugar es entrar a la partida— y la base tampoco lo dejaría,
           porque `game_rooms_update` no nombra a es_companero(). */
        function renderPartidasEnVivo(pairings) {
            const enJuego = pairings.filter((p) => !p.is_bye && p.game_room_id && !p.result && salasEnJuego[p.game_room_id]);
            if (!enJuego.length) return null;

            const caja = document.createElement("div");
            caja.className = "mt-4 border-t border-brand-100 dark:border-brand-800 pt-3";
            const titulo = document.createElement("h4");
            titulo.className = "text-sm font-semibold text-brand-700 dark:text-brand-200 mb-2";
            titulo.textContent = "Las partidas, en vivo";
            caja.appendChild(titulo);

            const grid = document.createElement("div");
            /* Mismo tope fijo que las miniaturas de la clase en vivo, y por la
               misma razón: con `1/N` del ancho, dos partidas se ven enormes y
               —peor— todas cambian de tamaño en cuanto empieza una más, justo
               mientras se las está mirando. */
            grid.className = "grid gap-3";
            grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(min(190px, 100%), 190px))";
            caja.appendChild(grid);

            enJuego.forEach((p) => {
                const sala = salasEnJuego[p.game_room_id];
                const soyJugador = p.white_id === profile.id || p.black_id === profile.id;

                const tarjeta = document.createElement("a");
                tarjeta.href = pageFor2pVariant(tournament.variant) + "?room=" + p.game_room_id;
                tarjeta.className = "block rounded-xl overflow-hidden border-2 border-brand-200 dark:border-brand-700 hover:border-accent-500 transition-colors bg-white dark:bg-brand-900";
                tarjeta.setAttribute("aria-label",
                    (soyJugador ? "Seguir jugando" : "Ver") + " la partida del tablero " + p.board_number +
                    ": " + nameFor(p.white_id) + " con blancas contra " + nameFor(p.black_id) + " con negras");

                const cabecera = document.createElement("p");
                cabecera.className = "px-2 py-1 text-[11px] text-brand-600 dark:text-brand-200 bg-brand-50 dark:bg-brand-800 truncate";
                cabecera.textContent = "Tablero " + p.board_number + " · " + nameFor(p.white_id) + " vs " + nameFor(p.black_id);
                tarjeta.appendChild(cabecera);

                /* Niebla de Guerra es la única que NO se dibuja mientras se
                   juega, y es la misma regla que ya escribe tv.html: cualquiera
                   de los dos jugadores puede tener esta página abierta al lado,
                   y con la posición real a la vista se acabó la niebla, que es
                   el juego entero. */
                if (tournament.variant === "niebla") {
                    const tapada = document.createElement("p");
                    tapada.className = "aspect-square w-full flex items-center justify-center text-center text-xs text-brand-450 dark:text-brand-350 px-3";
                    tapada.textContent = "🌫️ Oculta por la niebla hasta que termine";
                    tarjeta.appendChild(tapada);
                    grid.appendChild(tarjeta);
                    return;
                }

                const tableroEl = document.createElement("div");
                tableroEl.className = "grid grid-cols-8 aspect-square w-full select-none";
                // Marca de qué sala es este tablero: la usa el verificador para
                // comprobar que cada uno dibuje SU posición y no la del de al lado.
                tableroEl.dataset.tableroSala = p.game_room_id;
                tarjeta.appendChild(tableroEl);
                grid.appendChild(tarjeta);

                const tablero = new ClasesBoard(tableroEl, { interactive: false, compact: true });
                tablero.loadFen(fenDeLaSala(sala));
                tablerosEnVivo[p.game_room_id] = tablero;
            });

            const pie = document.createElement("p");
            pie.className = "text-xs text-brand-450 dark:text-brand-350 mt-2";
            pie.textContent = "Se mueven solos. Toca un tablero para verlo en grande.";
            caja.appendChild(pie);
            return caja;
        }

        function renderRounds() {
            const container = document.getElementById("rounds-container");
            container.innerHTML = "";
            // Se vacía el mapa junto con el HTML: los tableros de la vuelta anterior
            // quedaron colgando de nodos que ya no están en la página, y guardarlos
            // dejaría que una jugada que llega por Realtime se pinte donde no se ve.
            tablerosEnVivo = {};
            rounds.forEach((round) => {
                const pairings = (pairingsByRound[round.id] || []).slice().sort((a, b) => a.board_number - b.board_number);
                const box = document.createElement("div");
                box.className = "bg-white dark:bg-brand-900 rounded-xl shadow-md p-4 mb-4";
                const heading = document.createElement("h3");
                heading.className = "font-serif font-bold text-brand-800 dark:text-white mb-1";
                heading.textContent = "Ronda " + round.round_number + (round.status === "finished" ? " ✅" : " (en curso)");
                box.appendChild(heading);
                pairings.forEach((p) => box.appendChild(renderPairingRow(p, round)));
                if (round.status !== "finished") {
                    const enVivo = renderPartidasEnVivo(pairings);
                    if (enVivo) box.appendChild(enVivo);
                }
                container.appendChild(box);
            });

            const lastRound = rounds[rounds.length - 1];
            const genBtn = document.getElementById("generate-round-btn");
            const isManagerHere = isOwner && tournament.status === "in_progress";
            genBtn.classList.toggle("hidden", !isManagerHere);
            if (isManagerHere) {
                const canGenerate = (!lastRound || lastRound.status === "finished") && tournament.current_round < (tournament.total_rounds || 0);
                genBtn.disabled = !canGenerate;
                genBtn.textContent = lastRound ? ("Generar ronda " + (tournament.current_round + 1)) : "Generar ronda 1";
            }
        }

        function renderStandings() {
            const players = registrations.map((r) => r.player_id);
            const allPairings = [];
            Object.keys(pairingsByRound).forEach((roundId) => {
                pairingsByRound[roundId].forEach((p) => allPairings.push({ white: p.white_id, black: p.black_id, isBye: p.is_bye, result: p.result }));
            });
            const { score } = TorneoEngine.standingsFromPairings(players, allPairings);
            const sorted = players.slice().sort((a, b) => score[b] - score[a]);
            const listEl = document.getElementById("standings-list");
            listEl.innerHTML = "";
            sorted.forEach((id, i) => {
                const li = document.createElement("li");
                li.className = "flex justify-between py-1 border-b border-brand-100 dark:border-brand-800 last:border-0";
                const left = document.createElement("span");
                left.textContent = (i + 1) + ". " + nameFor(id);
                const right = document.createElement("span");
                right.className = "font-mono font-semibold";
                right.textContent = String(score[id]);
                li.appendChild(left); li.appendChild(right);
                listEl.appendChild(li);
            });
        }

        document.getElementById("self-register-btn").addEventListener("click", () => amIRegistered ? withdraw() : register());
        document.getElementById("start-btn").addEventListener("click", startTournament);
        document.getElementById("ritmo-guardar").addEventListener("click", guardarRitmo);
        document.getElementById("generate-round-btn").addEventListener("click", generateRound);

        async function loadAll() {
            const { data: t, error } = await sb.from("tournaments").select("*").eq("id", TOURNEY_ID).maybeSingle();
            if (error || !t) { showError("No se encontró ese torneo — puede que ya se haya eliminado."); return; }
            tournament = t;
            isOwner = tournament.created_by === profile.id || !!profile.is_admin;

            const { data: regs } = await sb.from("tournament_registrations").select("*").eq("tournament_id", TOURNEY_ID).order("registered_at", { ascending: true });
            registrations = regs || [];
            const ids = registrations.map((r) => r.player_id);
            if (ids.length) {
                const { data: perfiles } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
                (perfiles || []).forEach((p) => { playerNames[p.id] = p.full_name || p.email; });
            }
            amIRegistered = registrations.some((r) => r.player_id === profile.id);

            const { data: roundsData } = await sb.from("tournament_rounds").select("*").eq("tournament_id", TOURNEY_ID).order("round_number", { ascending: true });
            rounds = roundsData || [];
            pairingsByRound = {};
            if (rounds.length) {
                const { data: pairingsData } = await sb.from("tournament_pairings").select("*").eq("tournament_id", TOURNEY_ID).order("board_number", { ascending: true });
                (pairingsData || []).forEach((p) => {
                    if (!pairingsByRound[p.round_id]) pairingsByRound[p.round_id] = [];
                    pairingsByRound[p.round_id].push(p);
                });
            }
            /* Las salas de los cruces que siguen en juego, para dibujarlas acá
               mismo. Se piden solo las que hacen falta —ni una de las rondas ya
               terminadas— y se pide la sala ENTERA porque de dónde sale la
               posición depende de la variante (ver fenDeLaSala). Si la RLS no
               devuelve alguna, esa tarjeta simplemente no se pinta: nada se
               rompe y el "Ver →" del cruce sigue ahí. */
            salasEnJuego = {};
            const idsEnJuego = rounds
                .filter((r) => r.status !== "finished")
                .reduce((acc, r) => acc.concat(pairingsByRound[r.id] || []), [])
                .filter((p) => !p.is_bye && p.game_room_id && !p.result)
                .map((p) => p.game_room_id);
            if (idsEnJuego.length) {
                const { data: salas } = await sb.from("game_rooms").select("*").in("id", idsEnJuego);
                (salas || []).forEach((sala) => { salasEnJuego[sala.id] = sala; });
            }

            render();
        }

        /* Una jugada NO recarga el torneo entero: se repinta el tablerito de esa
           sala y nada más. Volver a pedir inscritos, rondas y cruces en cada
           jugada de cada tablero son tres consultas por jugada y, de paso, el
           parpadeo de toda la lista mientras se está mirando. Lo que sí recarga
           es que la partida TERMINE (llega por tournament_pairings, con su
           resultado). */
        function actualizarSala(sala) {
            if (!sala || !sala.id) return;
            salasEnJuego[sala.id] = sala;
            const tablero = tablerosEnVivo[sala.id];
            if (tablero) tablero.loadFen(fenDeLaSala(sala));
        }

        let reloadPending = false;
        function scheduleReload() {
            if (reloadPending) return;
            reloadPending = true;
            setTimeout(() => { reloadPending = false; loadAll(); }, 150);
        }

        function subscribe() {
            const ch = sb.channel("torneo-" + TOURNEY_ID);
            ["tournaments", "tournament_registrations", "tournament_rounds", "tournament_pairings"].forEach((table) => {
                const filterColumn = table === "tournaments" ? "id" : "tournament_id";
                ch.on("postgres_changes", { event: "*", schema: "public", table: table, filter: filterColumn + "=eq." + TOURNEY_ID }, scheduleReload);
            });
            /* Las partidas de la ronda se mueven en su propia tabla, que no lleva
               `tournament_id`: no se puede filtrar del lado del servidor, así que
               llegan todas las de game_rooms y acá se descarta lo que no es de
               este torneo. `actualizarSala` ya lo hace solo —una sala que no esté
               en `tablerosEnVivo` no pinta nada—. */
            ch.on("postgres_changes", { event: "*", schema: "public", table: "game_rooms" },
                (payload) => actualizarSala(payload.new));
            ch.subscribe();
        }

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html"; return; }
            if (!TOURNEY_ID) { showError("Falta indicar qué torneo abrir. Vuelve a Torneos y entra desde ahí."); return; }

            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { showError("No se pudo cargar tu perfil. Cierra sesión y vuelve a entrar."); return; }
            profile = profileData;

            await loadAll();
            if (!tournament) return;
            subscribe();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    