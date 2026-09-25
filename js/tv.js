/* El código de tv.html.

   Vivía escrito dentro de la página, en un <script> de 35 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        (function () {
            "use strict";
            const sb = window.sb;
            let currentSettings = null;
            let refreshTimer = null;

            function parseLichessTournamentId(raw) {
                const trimmed = (raw || "").trim();
                if (!trimmed) return null;
                // Acepta tanto una URL completa (con o sin barra final) como el ID solo.
                const withoutQuery = trimmed.split(/[?#]/)[0].replace(/\/+$/, "");
                const parts = withoutQuery.split("/");
                return parts[parts.length - 1] || null;
            }

            // Reconoce enlaces de YouTube y Twitch (los dos que suelen usar los canales de
            // ajedrez para comentar torneos en vivo) y arma su URL de embed. Cualquier otro
            // enlace no se puede embeber de forma segura sin saber de qué servicio es, así que
            // se marca como "unknown" y la página solo ofrece un botón para abrirlo aparte.
            function parseVideoEmbed(raw) {
                const trimmed = (raw || "").trim();
                if (!trimmed) return null;
                let u;
                try { u = new URL(trimmed); } catch (e) { return { kind: "unknown", embedUrl: null, url: trimmed }; }
                const host = u.hostname.replace(/^www\.|^m\./, "");

                if (host === "youtube.com" || host === "youtu.be") {
                    let id = null;
                    if (host === "youtu.be") id = u.pathname.slice(1);
                    else if (u.pathname === "/watch") id = u.searchParams.get("v");
                    else if (u.pathname.startsWith("/live/") || u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2];
                    if (id) return { kind: "youtube", embedUrl: "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) };
                }

                if (host === "twitch.tv") {
                    const parent = window.location.hostname;
                    const parts = u.pathname.split("/").filter(Boolean);
                    if (parts[0] === "videos" && parts[1]) {
                        return { kind: "twitch", embedUrl: "https://player.twitch.tv/?video=" + encodeURIComponent(parts[1]) + "&parent=" + parent + "&autoplay=false" };
                    }
                    if (parts[0]) {
                        return { kind: "twitch", embedUrl: "https://player.twitch.tv/?channel=" + encodeURIComponent(parts[0]) + "&parent=" + parent + "&autoplay=false" };
                    }
                }

                return { kind: "unknown", embedUrl: null, url: trimmed };
            }

            // El video de comentaristas solo se muestra si el profesor puso un enlace
            // reconocible (YouTube o Twitch); si no, esa columna desaparece del todo y la
            // tarjeta del torneo pasa a ocupar todo el ancho — la partida "de ambiente" ya no
            // vive aquí, sino en la sección de Partidas en vivo de más abajo.
            function updateVideoSlot(videoUrl) {
                const videoWrap = document.getElementById("tv-video-wrap");
                const embedHost = document.getElementById("tv-video-embed");
                const tournamentSection = document.getElementById("tv-tournament-section");
                const parsed = videoUrl ? parseVideoEmbed(videoUrl) : null;

                if (parsed && parsed.embedUrl) {
                    embedHost.innerHTML = '<iframe src="' + parsed.embedUrl + '" title="Comentaristas en vivo" class="w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
                    videoWrap.classList.remove("hidden");
                    tournamentSection.classList.remove("lg:col-span-3");
                    tournamentSection.classList.add("lg:col-span-1");
                } else {
                    embedHost.innerHTML = "";
                    videoWrap.classList.add("hidden");
                    tournamentSection.classList.remove("lg:col-span-1");
                    tournamentSection.classList.add("lg:col-span-3");
                }
            }

            // Extrae hasta `maxCount` IDs de partidas realmente en curso en el torneo, a partir
            // del campo "duels" que trae la API de Lichess (los enfrentamientos destacados del
            // momento). Si el torneo no trae ese campo, o está vacío (recién armado, sin
            // partidas activas todavía), se devuelve una lista vacía y el llamador cae al
            // tablero de ambiente en vez de dejar la sección vacía.
            // Devuelve, para cada partida activa, su id y los nombres de usuario de
            // Lichess de quienes la juegan (para poder cruzarlos después contra la
            // lista de streamers en vivo).
            function extractLiveGames(tournamentData, maxCount) {
                const duels = tournamentData && Array.isArray(tournamentData.duels) ? tournamentData.duels : [];
                const games = [];
                const seen = new Set();
                for (const duel of duels) {
                    if (!duel || typeof duel.id !== "string" || seen.has(duel.id)) continue;
                    seen.add(duel.id);
                    const players = (Array.isArray(duel.p) ? duel.p : [])
                        .filter((p) => p && typeof (p.n || p.name) === "string")
                        .map((p) => ({ name: p.n || p.name, rating: p.r || p.rating || null }));
                    games.push({ id: duel.id, players });
                    if (games.length >= maxCount) break;
                }
                return games;
            }

            // Lista de streamers de Lichess actualmente en vivo (username en minúsculas
            // → {name, url}), para poder avisar si alguien del torneo está transmitiendo.
            let liveStreamers = new Map();

            async function fetchLiveStreamers() {
                try {
                    const res = await fetch("https://lichess.org/streamer/live", { headers: { Accept: "application/json" } });
                    if (!res.ok) return new Map();
                    const list = await res.json();
                    const map = new Map();
                    for (const s of Array.isArray(list) ? list : []) {
                        const id = ((s && (s.id || s.name)) || "").toLowerCase();
                        if (!id) continue;
                        const stream = (s && s.stream) || {};
                        const streamer = (s && s.streamer) || {};
                        const url = s.twitch || s.youTube || stream.twitch || stream.youTube
                            || streamer.twitch || streamer.youTube || null;
                        if (url) map.set(id, { name: (s && (s.name || s.id)) || id, url });
                    }
                    return map;
                } catch (e) {
                    console.error("No se pudo cargar la lista de streamers de Lichess:", e);
                    return new Map();
                }
            }

            function matchStreamer(game) {
                for (const player of game.players) {
                    const hit = liveStreamers.get(String(player.name).toLowerCase());
                    if (hit) return hit;
                }
                return null;
            }

            function renderStreamerBadges(games) {
                const grid = document.getElementById("tv-games-grid");
                for (const g of games) {
                    const slot = grid.querySelector('[data-stream-slot="' + CSS.escape(g.id) + '"]');
                    if (!slot) continue;
                    const streamer = matchStreamer(g);
                    if (streamer) {
                        slot.innerHTML = '<a href="' + escapeHtml(streamer.url) + '" target="_blank" rel="noopener" ' +
                            'class="flex items-center justify-center gap-1.5 hover:text-red-300">' +
                            '<span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden="true"></span>' +
                            '🔴 ' + escapeHtml(streamer.name) + ' está transmitiendo — abrir en otra pantalla ↗</a>';
                        slot.classList.remove("hidden");
                    } else {
                        slot.innerHTML = "";
                        slot.classList.add("hidden");
                    }
                }
            }

            // El widget de Lichess (lichess.org/embed/game/{id}) resultó no actualizarse
            // en vivo dentro de este iframe por más que se ajustara cuándo se recrea — así
            // que en vez de depender de esa caja negra, el tablero se dibuja aquí mismo a
            // partir de la posición real que se consulta directamente a la API de Lichess
            // (pollLiveBoards más abajo). Mismos glifos/colores que el tablero normal del
            // sitio (ver js/tablero-board.js) para que se vea igual en todas partes.
            const MINI_GLYPH = {
                w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
                b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
            };
            const MINI_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

            function isLightMiniSquare(square) {
                const file = square.charCodeAt(0) - 97;
                const rank = parseInt(square[1], 10) - 1;
                return (file + rank) % 2 === 1;
            }

            function renderMiniBoard(container, fen) {
                if (typeof Chess === "undefined" || !container) return;
                let game;
                try { game = new Chess(fen); } catch (e) { return; }
                container.innerHTML = "";
                for (let rank = 8; rank >= 1; rank--) {
                    for (let f = 0; f < 8; f++) {
                        const square = MINI_FILES[f] + rank;
                        const cell = document.createElement("div");
                        cell.className = "flex items-center justify-center text-lg sm:text-2xl " +
                            (isLightMiniSquare(square) ? "bg-brand-100" : "bg-brand-500");
                        const piece = game.get(square);
                        if (piece) {
                            const span = document.createElement("span");
                            span.textContent = MINI_GLYPH[piece.color][piece.type];
                            span.className = piece.color === "w" ? "piece-white" : "piece-black";
                            span.setAttribute("aria-hidden", "true");
                            cell.appendChild(span);
                        }
                        container.appendChild(cell);
                    }
                }
            }

            // Consulta a Lichess la lista de jugadas de una partida y reconstruye la
            // posición actual reproduciéndolas con chess.js — más lento que recibir un
            // empuje en vivo por WebSocket, pero es un dato plano que si llega, refleja
            // la posición real (a diferencia del iframe, que podía quedarse pegado sin
            // avisar de ningún error).
            async function fetchGameFen(gameId) {
                try {
                    const res = await fetch(
                        "https://lichess.org/game/export/" + encodeURIComponent(gameId) + "?evals=0&clocks=0&opening=0",
                        { headers: { Accept: "application/json" } }
                    );
                    if (!res.ok || typeof Chess === "undefined") return null;
                    const data = await res.json();
                    const game = new Chess();
                    const moves = typeof data.moves === "string" ? data.moves.trim().split(/\s+/).filter(Boolean) : [];
                    for (const san of moves) {
                        if (!game.move(san, { sloppy: true })) break; // notación no reconocida: se queda en la última jugada válida
                    }
                    return game.fen();
                } catch (e) {
                    console.error("No se pudo cargar la posición de la partida " + gameId + ":", e);
                    return null;
                }
            }

            async function pollLiveBoards(games) {
                await Promise.all(games.map(async (g) => {
                    const container = document.getElementById("tv-games-grid").querySelector('[data-board-id="' + CSS.escape(g.id) + '"]');
                    if (!container) return;
                    const fen = await fetchGameFen(g.id);
                    if (fen) renderMiniBoard(container, fen);
                }));
            }

            function playerLabel(player) {
                if (!player) return "";
                return escapeHtml(player.name) + (player.rating ? ' <span class="opacity-60">(' + escapeHtml(String(player.rating)) + ")</span>" : "");
            }

            // Muestra hasta 10 partidas del torneo lado a lado, cada una ocupando 1/N del
            // ancho (1 partida = 100%, 2 = 50% cada una, 3 = 33%...). Con más de 5 a la vez se
            // envuelve en varias filas de a 5 en vez de seguir angostando cada tablero — igual
            // que la grilla de "Tableros de los alumnos" en Practicar contra el motor.
            let lastRenderedGamesKey = null;

            function renderGamesGrid(games) {
                const grid = document.getElementById("tv-games-grid");
                const ambient = document.getElementById("tv-games-ambient");
                const ambientIframe = document.getElementById("tv-ambient-iframe");

                if (!games.length) {
                    lastRenderedGamesKey = null;
                    grid.classList.add("hidden");
                    grid.innerHTML = "";
                    ambient.classList.remove("hidden");
                    if (!ambientIframe.src) ambientIframe.src = "https://lichess.org/tv/frame?theme=brown&bg=dark";
                    return;
                }

                ambient.classList.add("hidden");
                ambientIframe.removeAttribute("src"); // no lo dejes cargando en segundo plano

                const columnas = Math.min(games.length, 5);
                grid.style.gridTemplateColumns = "repeat(" + columnas + ", minmax(0, 1fr))";

                const key = games.map((g) => g.id).join(",");
                if (key !== lastRenderedGamesKey) {
                    lastRenderedGamesKey = key;
                    // Solo el tablero, sin margen extra: un tablero de ajedrez es cuadrado,
                    // así que la tarjeta usa aspect-square en vez de dejar una franja vacía
                    // a los lados como pasaba forzándolo a 16:9.
                    grid.innerHTML = games.map((g) =>
                        '<div class="rounded-xl overflow-hidden shadow-md border-2 border-brand-700 bg-brand-950">' +
                            '<h3 class="flex items-center justify-between px-2 py-1 text-[11px] sm:text-xs text-brand-200 bg-brand-900">' +
                                '<span class="truncate">' + playerLabel(g.players[0]) + "</span>" +
                                '<span class="truncate text-right">' + playerLabel(g.players[1]) + "</span>" +
                            "</h3>" +
                            '<div class="aspect-square w-full grid grid-cols-8 grid-rows-8" data-board-id="' + escapeHtml(g.id) + '"></div>' +
                            '<div class="hidden px-2 py-1.5 text-center text-xs font-semibold text-red-400 bg-brand-900" data-stream-slot="' + escapeHtml(g.id) + '"></div>' +
                        "</div>"
                    ).join("");
                }
                grid.classList.remove("hidden");
                renderStreamerBadges(games);
                pollLiveBoards(games);
            }

            function statusBadge(data) {
                if (!data) return { label: "Torneo", cls: "bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-300" };
                if (data.isFinished || data.status === 30) return { label: "🏁 Finalizado", cls: "bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-300" };
                if (data.status === 20 || data.secondsToFinish !== undefined) return { label: "🔴 En vivo", cls: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" };
                return { label: "🕒 Programado", cls: "bg-accent-500/20 text-accent-600 dark:text-accent-400" };
            }

            function formatLine(data) {
                if (!data) return "";
                const parts = [];
                if (data.clock) parts.push(Math.round(data.clock.limit / 60) + "+" + data.clock.increment);
                if (data.variant && data.variant.key && data.variant.key !== "standard") parts.push(data.variant.name || data.variant.key);
                if (typeof data.nbPlayers === "number") parts.push(data.nbPlayers + (data.nbPlayers === 1 ? " jugador" : " jugadores"));
                return parts.join(" · ");
            }

            function renderTeamsTable(data) {
                const wrap = document.getElementById("tv-teams-wrap");
                const body = document.getElementById("tv-teams-body");
                const standing = data && Array.isArray(data.teamStanding) ? data.teamStanding : null;
                if (!standing || !standing.length) { wrap.classList.add("hidden"); body.innerHTML = ""; return; }
                const teamNames = (data.teamBattle && data.teamBattle.teams) || {};
                body.innerHTML = standing.map((team) => {
                    const name = teamNames[team.id] || team.id;
                    return '<tr class="border-b border-brand-50 dark:border-brand-800/60">' +
                        '<td class="py-1.5 pr-3 text-brand-450 dark:text-brand-350">' + (team.rank || "") + '</td>' +
                        '<td class="py-1.5 pr-3 font-medium">' + escapeHtml(name) + '</td>' +
                        '<td class="py-1.5 text-right font-semibold">' + (team.score != null ? team.score : "") + '</td>' +
                        '</tr>';
                }).join("");
                wrap.classList.remove("hidden");
            }

            function escapeHtml(s) {
                return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
            }

            // ===================================================================
            // Partidas propias de la academia en vivo (game_rooms + fourplayer_games)
            // ===================================================================
            const INTERNAL_VARIANT_LABEL = {
                estandar: "♟️ Estándar", crazyhouse: "🏇 Crazyhouse", cartas: "🃏 Ajedrez de Cartas",
                duelo: "⚔️ Duelo Simultáneo", niebla: "🌫️ Niebla de Guerra",
            };
            const INTERNAL_PAGE_FOR_VARIANT = {
                estandar: "estandar.html", crazyhouse: "crazyhouse.html", cartas: "cartas.html",
                duelo: "duelo.html", niebla: "niebla.html",
            };

            // El FEN de Crazyhouse (y Cartas, que comparte el mismo formato de reserva
            // aunque no la use) trae la reserva de piezas entre corchetes al final del
            // primer campo — chess.js 0.10.3 no la entiende, así que se recorta antes de
            // dársela para dibujar el mini tablero.
            function stripPockets(fen) {
                return (fen || "").replace(/\[[^\]]*\]/, "");
            }

            // La posición real de Duelo Simultáneo vive en duelo_state.fen, no en la
            // columna fen de game_rooms (que se queda en la posición inicial — ver
            // duelo.html/js/duelo-engine.js: solo se actualiza duelo_state en cada ronda).
            function fenForGameRoom(room) {
                if (room.variant === "duelo") return room.duelo_state && room.duelo_state.fen;
                return room.fen;
            }

            function internalPlayerLabel(id, names) {
                return escapeHtml((id && names[id]) || "?");
            }

            function renderInternalCard(item, names) {
                const room = item.row;
                const label = INTERNAL_VARIANT_LABEL[room.variant] || room.variant;
                const href = (INTERNAL_PAGE_FOR_VARIANT[room.variant] || "juegos.html") + "?room=" + encodeURIComponent(room.id);
                const isHiddenNiebla = room.variant === "niebla";
                const boardHtml = isHiddenNiebla
                    ? '<div class="aspect-square w-full flex items-center justify-center text-center text-xs text-brand-300 px-3">🌫️ Oculta por la niebla<br>hasta que termine</div>'
                    : '<div class="aspect-square w-full grid grid-cols-8 grid-rows-8" data-board-id="room-' + escapeHtml(room.id) + '"></div>';
                return '<a href="' + escapeHtml(href) + '" class="block rounded-xl overflow-hidden shadow-md border-2 border-brand-700 bg-brand-950 hover:border-accent-500 transition-colors">' +
                    '<h3 class="flex items-center justify-between px-2 py-1 text-[11px] sm:text-xs text-brand-200 bg-brand-900 gap-1">' +
                        '<span class="truncate">' + internalPlayerLabel(room.white_id, names) + '</span>' +
                        '<span class="shrink-0 opacity-70">' + label + '</span>' +
                        '<span class="truncate text-right">' + internalPlayerLabel(room.black_id, names) + '</span>' +
                    '</h3>' + boardHtml + '</a>';
            }

            // Ajedrez para 4 se dibuja aparte, con el tablero real (js/fourplayer-engine.js
            // + js/fourplayer-board.js, los mismos que usa cuatro-jugadores.html en modo
            // espectador: mySeat null, interactive false) en su propio ancho — la cruz de
            // 160 casillas no entra bien en la grilla chica pensada para tableros de 8x8.
            function renderFourplayerCard(room, names) {
                const SEATS = ["red", "blue", "yellow", "green"];
                const SEAT_EMOJI = { red: "🔴", blue: "🔵", yellow: "🟡", green: "🟢" };
                const seatLabels = SEATS.map((seat) => {
                    const s = room.seats[seat] || {};
                    const isTurn = room.turn === seat;
                    const score = room.mode === "ffa" ? " (" + (s.score || 0) + ")" : "";
                    return '<span class="' + (isTurn ? "text-accent-500 dark:text-accent-400 font-semibold" : "") + '">' +
                        SEAT_EMOJI[seat] + " " + internalPlayerLabel(s.player_id, names) + score + "</span>";
                }).join("");
                return '<div class="max-w-[560px] mx-auto">' +
                    '<h3 class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm text-brand-600 dark:text-brand-300 mb-2 text-center">' +
                        '<span class="font-semibold text-brand-800 dark:text-white">🎡 4 jugadores · ' + (room.mode === "teams" ? "Equipos" : "Todos contra todos") + '</span>' +
                        seatLabels +
                    '</h3>' +
                    '<a href="cuatro-jugadores.html?room=' + encodeURIComponent(room.id) + '" class="block" aria-label="Ver esta partida de Ajedrez para 4 completa">' +
                        '<div id="fp-board-' + escapeHtml(room.id) + '" class="grid gap-0 w-full aspect-square rounded-xl overflow-hidden shadow-2xl border-4 border-brand-700 select-none" style="grid-template-columns: repeat(14, minmax(0,1fr)); grid-template-rows: repeat(14, minmax(0,1fr));"></div>' +
                    '</a></div>';
            }

            async function fetchInternalGames() {
                const [{ data: rooms }, { data: fpGames }] = await Promise.all([
                    sb.from("game_rooms").select("*").eq("status", "playing").order("updated_at", { ascending: false }),
                    sb.from("fourplayer_games").select("*").eq("status", "playing").order("updated_at", { ascending: false }),
                ]);
                const items = (rooms || []).map((row) => ({ kind: "room", row }))
                    .concat((fpGames || []).map((row) => ({ kind: "fourplayer", row })));

                const ids = new Set();
                (rooms || []).forEach((r) => { if (r.white_id) ids.add(r.white_id); if (r.black_id) ids.add(r.black_id); });
                (fpGames || []).forEach((r) => { ["red", "blue", "yellow", "green"].forEach((s) => { const id = r.seats[s] && r.seats[s].player_id; if (id) ids.add(id); }); });

                let names = {};
                if (ids.size) {
                    const { data: players } = await sb.from("profiles").select("id, full_name, email").in("id", Array.from(ids));
                    (players || []).forEach((p) => { names[p.id] = p.full_name || p.email; });
                }
                return { items, names };
            }

            async function refreshInternalGames() {
                const { items, names } = await fetchInternalGames();
                const roomItems = items.filter((item) => item.kind === "room");
                const fpItems = items.filter((item) => item.kind === "fourplayer");

                // Ajedrez para 4: tablero real, ancho propio. Se reconstruye entero en cada
                // refresco (son pocas partidas a la vez) — en cuanto una termina y deja de
                // venir en la lista, el contenedor simplemente se vacía y se oculta solo,
                // sin dejar un hueco ni tocar el resto de "Partidas en vivo".
                const fpContainer = document.getElementById("tv-internal-fourplayer");
                if (fpItems.length) {
                    fpContainer.innerHTML = fpItems.map((item) => renderFourplayerCard(item.row, names)).join("");
                    fpContainer.classList.remove("hidden");
                    fpItems.forEach((item) => {
                        const boardEl = document.getElementById("fp-board-" + item.row.id);
                        if (!boardEl || typeof FourPlayerBoard === "undefined" || typeof FourPlayerChess === "undefined") return;
                        try {
                            const board = new FourPlayerBoard(boardEl, { mySeat: null, interactive: false });
                            board.loadGame(FourPlayerChess.Game.fromJSON(item.row.board));
                        } catch (e) { console.error("No se pudo dibujar la partida de 4 jugadores " + item.row.id + ":", e); }
                    });
                } else {
                    fpContainer.classList.add("hidden");
                    fpContainer.innerHTML = "";
                }

                const grid = document.getElementById("tv-internal-grid");
                if (roomItems.length) {
                    const columnas = Math.min(roomItems.length, 5);
                    grid.style.gridTemplateColumns = "repeat(" + columnas + ", minmax(0, 1fr))";
                    grid.innerHTML = roomItems.map((item) => renderInternalCard(item, names)).join("");
                    grid.classList.remove("hidden");
                    roomItems.forEach((item) => {
                        if (item.row.variant === "niebla") return;
                        const container = grid.querySelector('[data-board-id="room-' + CSS.escape(item.row.id) + '"]');
                        const fen = stripPockets(fenForGameRoom(item.row));
                        if (container && fen) renderMiniBoard(container, fen);
                    });
                } else {
                    grid.classList.add("hidden");
                    grid.innerHTML = "";
                }

                document.getElementById("tv-internal-empty").classList.toggle("hidden", !!(roomItems.length || fpItems.length));
            }

            function initInternalGames() {
                refreshInternalGames();
                // Sin filtro: son pocas partidas a la vez, así que ante cualquier cambio
                // (nueva partida, jugada, o que termine) simplemente se vuelve a pedir la
                // lista completa de "en curso" en vez de tratar de aplicar el parche a mano.
                sb.channel("tv-internal-games")
                    .on("postgres_changes", { event: "*", schema: "public", table: "game_rooms" }, refreshInternalGames)
                    .on("postgres_changes", { event: "*", schema: "public", table: "fourplayer_games" }, refreshInternalGames)
                    .subscribe();
            }

            function showState(state) {
                document.getElementById("tv-loading").classList.toggle("hidden", state !== "loading");
                document.getElementById("tv-empty").classList.toggle("hidden", state !== "empty");
                document.getElementById("tv-card").classList.toggle("hidden", state !== "card");
            }

            async function fetchLichessTournament(id) {
                try {
                    const res = await fetch("https://lichess.org/api/tournament/" + encodeURIComponent(id), { headers: { Accept: "application/json" } });
                    if (!res.ok) throw new Error("HTTP " + res.status);
                    return await res.json();
                } catch (e) {
                    console.error("No se pudo cargar el torneo de Lichess:", e);
                    return null;
                }
            }

            async function refreshTournamentCard() {
                const id = currentSettings && currentSettings.lichess_tournament_id;
                if (!id) { showState("empty"); renderGamesGrid([]); return; }

                document.getElementById("tv-join-link").href = "https://lichess.org/tournament/" + encodeURIComponent(id);

                const [data, streamers] = await Promise.all([fetchLichessTournament(id), fetchLiveStreamers()]);
                // El torneo pudo cambiar (u ocultarse) mientras esta consulta estaba en vuelo.
                if (!currentSettings || currentSettings.lichess_tournament_id !== id) return;
                liveStreamers = streamers;

                const badge = statusBadge(data);
                const badgeEl = document.getElementById("tv-status-badge");
                badgeEl.textContent = badge.label;
                badgeEl.className = "inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-2 " + badge.cls;

                document.getElementById("tv-name").textContent = (data && data.fullName) || "Torneo de Lichess";
                document.getElementById("tv-format").textContent = formatLine(data);
                document.getElementById("tv-fetch-error").classList.toggle("hidden", !!data);
                renderTeamsTable(data);
                renderGamesGrid(extractLiveGames(data, currentSettings.games_count || 1));
                showState("card");
            }

            function applySettings(row) {
                currentSettings = row;
                if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
                refreshTournamentCard();
                if (row && row.lichess_tournament_id) {
                    // Refresca cada 8s mientras esté configurado: tabla de posiciones,
                    // estado del torneo, qué partidas se muestran y quién está transmitiendo.
                    // Ya NO recrea los iframes de partidas que siguen siendo las mismas
                    // (ver renderGamesGrid) — solo actualiza el resto de la información.
                    refreshTimer = setInterval(refreshTournamentCard, 8000);
                }

                updateVideoSlot(row && row.video_url);

                const bannerEl = document.getElementById("tv-note-banner");
                if (row && row.note) { bannerEl.textContent = "📣 " + row.note; bannerEl.classList.remove("hidden"); }
                else { bannerEl.classList.add("hidden"); }

                if (isProfesor) fillAdminForm(row);
            }

            function fillAdminForm(row) {
                document.getElementById("tv-admin-input").value = (row && row.lichess_tournament_id) || "";
                document.getElementById("tv-admin-video").value = (row && row.video_url) || "";
                document.getElementById("tv-admin-games-count").value = (row && row.games_count) || 1;
                document.getElementById("tv-admin-note").value = (row && row.note) || "";
            }

            async function loadSettings() {
                showState("loading");
                const { data, error } = await sb.from("tv_settings").select("*").eq("id", true).maybeSingle();
                if (error) { console.error(error); showState("empty"); return; }
                applySettings(data || null);
            }

            let isProfesor = false;
            let currentUserId = null;

            async function initAdmin() {
                const { data: sessionData } = await sb.auth.getSession();
                const session = sessionData && sessionData.session;
                if (!session) return;
                currentUserId = session.user.id;
                const { data: profileData } = await sb.from("profiles").select("role, is_admin").eq("id", session.user.id).maybeSingle();
                if (profileData && (profileData.role === "profesor" || profileData.is_admin === true)) {
                    isProfesor = true;
                    document.getElementById("tv-admin-panel").classList.remove("hidden");
                    if (currentSettings) fillAdminForm(currentSettings);
                }
            }

            document.getElementById("tv-admin-save-btn").addEventListener("click", async () => {
                const statusEl = document.getElementById("tv-admin-status");
                const id = parseLichessTournamentId(document.getElementById("tv-admin-input").value);
                const videoUrl = document.getElementById("tv-admin-video").value.trim() || null;
                const gamesCountRaw = parseInt(document.getElementById("tv-admin-games-count").value, 10);
                const gamesCount = Math.min(10, Math.max(1, isNaN(gamesCountRaw) ? 1 : gamesCountRaw));
                const note = document.getElementById("tv-admin-note").value.trim() || null;
                statusEl.textContent = "Guardando…";
                const { error } = await sb.from("tv_settings").update({
                    lichess_tournament_id: id, video_url: videoUrl, games_count: gamesCount, note, updated_at: new Date().toISOString(), updated_by: currentUserId,
                }).eq("id", true);
                statusEl.textContent = error ? ("Error: " + error.message) : "Guardado ✓";
            });

            document.getElementById("tv-admin-clear-btn").addEventListener("click", async () => {
                const statusEl = document.getElementById("tv-admin-status");
                document.getElementById("tv-admin-input").value = "";
                document.getElementById("tv-admin-video").value = "";
                document.getElementById("tv-admin-games-count").value = 1;
                document.getElementById("tv-admin-note").value = "";
                statusEl.textContent = "Guardando…";
                const { error } = await sb.from("tv_settings").update({
                    lichess_tournament_id: null, video_url: null, games_count: 1, note: null, updated_at: new Date().toISOString(), updated_by: currentUserId,
                }).eq("id", true);
                statusEl.textContent = error ? ("Error: " + error.message) : "Quitado ✓";
            });

            // Cualquier visitante con esta página abierta ve el cambio en vivo cuando el
            // profesor guarda un torneo nuevo (o lo quita), sin tener que recargar.
            sb.channel("tv-settings-changes")
                .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tv_settings" }, (payload) => {
                    applySettings(payload.new);
                })
                .subscribe();

            loadSettings().then(initAdmin);
            initInternalGames();
        })();
    