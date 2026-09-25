/* El código de racha-tactica.html.

   Vivía escrito dentro de la página, en un <script> de 15 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null;
        let game = new Chess();
        let selected = null;
        let currentSolution = "";
        let currentSan = "";
        let lastIndex = -1;
        let streak = 0;
        let personalBest = 0;
        let running = false;
        let resultLocked = true;
        let failTimeoutId = null;

        const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
        const GLYPH = {
            p: { w: "♙", b: "♟" }, n: { w: "♘", b: "♞" }, b: { w: "♗", b: "♝" },
            r: { w: "♖", b: "♜" }, q: { w: "♕", b: "♛" }, k: { w: "♔", b: "♚" },
        };

        function squareIsLight(square) {
            const file = FILES.indexOf(square[0]);
            const rank = parseInt(square[1], 10) - 1;
            return (file + rank) % 2 === 1;
        }

        function setResultText(text, cls) {
            const el = document.getElementById("result-text");
            el.textContent = text;
            el.className = "text-center text-sm mt-4 min-h-[1.5em] " + (cls || "text-brand-600 dark:text-brand-300");
        }

        function updateStreakDisplay() {
            document.getElementById("current-streak").textContent = String(streak);
        }
        function updatePersonalBestDisplay() {
            document.getElementById("personal-best").textContent = String(personalBest);
        }

        // ---------- Tablero ----------
        function renderBoard() {
            refrescarComandos();
            const boardEl = document.getElementById("board");
            boardEl.innerHTML = "";
            // Mostrar el tablero desde la perspectiva de quien tiene que mover — el
            // alumno siempre juega "hacia arriba", sea cual sea el color del puzzle.
            const flipped = game.turn() === "b";
            const squares = [];
            for (let rank = 8; rank >= 1; rank--) for (const f of FILES) squares.push(f + rank);
            const ordered = flipped ? squares.slice().reverse() : squares;

            let legalTargets = [];
            if (selected) legalTargets = game.moves({ square: selected, verbose: true }).map((m) => m.to);

            ordered.forEach((square) => {
                const btn = document.createElement("button");
                btn.type = "button";
                const light = squareIsLight(square);
                let cls = "flex items-center justify-center select-none relative w-full h-full border-0 p-0 m-0 text-3xl sm:text-4xl md:text-5xl ";
                cls += (running && !resultLocked) ? "cursor-pointer " : "cursor-default ";
                cls += light ? "bg-brand-100 " : "bg-brand-500 ";
                if (selected === square) cls += "outline outline-4 -outline-offset-4 outline-accent-500 ";
                btn.className = cls;
                btn.setAttribute("data-square", square);
                const piece = game.get(square);
                const pieceName = piece ? ((piece.color === "w" ? "Blanco" : "Negro") + " " + (piece.type)) : "vacía";
                btn.setAttribute("aria-label", "Casilla " + square + ": " + pieceName);
                if (piece) {
                    const span = document.createElement("span");
                    if (window.PiezaPreferida) PiezaPreferida.pintar(span, piece.type, piece.color);
                    else {
                      span.textContent = GLYPH[piece.type][piece.color];
                      span.className = piece.color === "w" ? "piece-white" : "piece-black";
                    }
                    span.setAttribute("aria-hidden", "true");
                    btn.appendChild(span);
                }
                if (legalTargets.indexOf(square) !== -1) {
                    const dot = document.createElement("span");
                    dot.className = piece
                        ? "absolute inset-1 rounded-full ring-4 ring-accent-600/70"
                        : "absolute w-1/3 h-1/3 rounded-full bg-accent-500/60";
                    dot.setAttribute("aria-hidden", "true");
                    btn.appendChild(dot);
                }
                btn.addEventListener("click", () => onSquareClick(square));
                boardEl.appendChild(btn);
            });
        }

        function onSquareClick(square) {
            if (!running || resultLocked) return;
            if (selected === square) { selected = null; renderBoard(); return; }
            if (selected) {
                const moves = game.moves({ square: selected, verbose: true });
                if (moves.some((m) => m.to === square)) {
                    attemptMove(selected, square);
                    return;
                }
            }
            const piece = game.get(square);
            if (piece && piece.color === game.turn()) { selected = square; renderBoard(); }
            else { selected = null; renderBoard(); }
        }

        enableBoardDrag(document.getElementById("board"), {
            isDraggable: (square) => {
                if (!running || resultLocked) return false;
                const piece = game.get(square);
                return !!(piece && piece.color === game.turn());
            },
            isSelected: (square) => selected === square,
            onSquareClick: (square) => onSquareClick(square),
        });


        /* ---------------- El cuadro de comandos (Modo Adaptado) ----------------
         * El ejercicio solo se podía contestar tocando el tablero: con lector de
         * pantalla era incontestable, y no daba ningún error — la página se veía
         * perfecta y quien no podía verla no resolvía ni uno. Acá la jugada
         * también se escribe, con la posición contada en palabras justo encima.
         * Ver js/cuadro-comandos.js. El tablero NO se esconde: quien ve poco usa
         * las dos cosas. */
        let comandos = null;

        function refrescarComandos() {
            if (!window.CuadroComandos || !game) return;
            if (!comandos) {
                comandos = CuadroComandos.montar(document.getElementById("q-comandos"), {
                    etiqueta: "Escribe tu jugada",
                    onEnviar: jugarEscribiendo,
                });
                comandos.ayuda('En español o en inglés: "Cf3", "Nf3", "e4", "Dxh7+", "e8=D".');
            }
            comandos.posicion(game);
        }

        function jugarEscribiendo(texto, api) {
            if (!running || resultLocked) { api.decir("Ahora mismo no se puede contestar."); return; }
            // El intérprete HACE la jugada sobre la partida que se le pasa, así
            // que se le pasa una copia: quien decide si entra es attemptMove(),
            // la misma puerta por la que pasa el clic.
            const copia = new Chess(game.fen());
            const mv = CuadroComandos.jugadaPedida(copia, texto);
            if (!mv) { api.decir('"' + texto + '" no es una jugada legal en esta posición. Revísala e inténtalo de nuevo.'); return; }
            api.limpiar().decir("");
            attemptMove(mv.from, mv.to);
        }

        function attemptMove(from, to) {
            const move = game.move({ from, to, promotion: "q" });
            selected = null;
            if (!move) { renderBoard(); return; } // no debería pasar: ya se validó como legal
            // El UCI de la solución es siempre "origen+destino" (+ promoción, en los 2
            // puzzles que coronan) — alcanza con los primeros 4 caracteres porque el
            // tablero solo permite mover una pieza legal de esa casilla a esa otra.
            // Además, en los puzzles de mate hay unas 140 posiciones con más de una
            // jugada que da jaque mate: si el ejercicio es un mate y la jugada elegida
            // también da mate (aunque no sea la guardada), también cuenta como acierto.
            const esLaJugadaGuardada = (from + to) === currentSolution.slice(0, 4);
            const esOtroMateValido = !esLaJugadaGuardada && currentSan.endsWith("#") && game.in_checkmate();
            const isCorrect = esLaJugadaGuardada || esOtroMateValido;
            if (isCorrect) onCorrect(); else onFail("wrong");
        }

        function flashBoard(kind) {
            const boardEl = document.getElementById("board");
            boardEl.classList.remove("ring-8", "ring-green-500", "ring-red-500");
            void boardEl.offsetWidth; // fuerza a reiniciar la transición si se repite rápido
            boardEl.classList.add("ring-8", kind === "correct" ? "ring-green-500" : "ring-red-500");
            setTimeout(() => boardEl.classList.remove("ring-8", "ring-green-500", "ring-red-500"), 400);
        }

        function onCorrect() {
            if (resultLocked) return;
            resultLocked = true;
            clearTimeout(failTimeoutId);
            streak++;
            updateStreakDisplay();
            flashBoard("correct");
            renderBoard();
            setResultText("✅ ¡Correcto!", "text-green-600 dark:text-green-400");
            setTimeout(() => { if (running) loadPuzzle(); }, 350);
        }

        async function onFail(reason) {
            if (resultLocked) return;
            resultLocked = true;
            clearTimeout(failTimeoutId);
            stopTimerBar();
            flashBoard("wrong");
            renderBoard();
            const finalStreak = streak;
            const reasonText = reason === "timeout" ? "⏱️ ¡Se acabó el tiempo!" : "❌ Esa no era la jugada.";
            setResultText(reasonText + " La respuesta correcta era " + currentSan + ". Racha final: " + finalStreak + ".", "text-red-600 dark:text-red-400");
            running = false;
            streak = 0;
            updateStreakDisplay();
            document.getElementById("start-btn").textContent = "🔄 Jugar de nuevo";
            document.getElementById("start-btn").classList.remove("hidden");
            if (finalStreak > personalBest) {
                personalBest = finalStreak;
                updatePersonalBestDisplay();
                await saveBestStreak(finalStreak);
                await loadLeaderboard();
            }
        }

        // ---------- Cronómetro (10 segundos, visual con una barra que se achica) ----------
        const TIME_LIMIT_MS = 10000;
        function startTimerBar() {
            const bar = document.getElementById("timer-bar");
            bar.style.transition = "none";
            bar.style.width = "100%";
            void bar.offsetWidth; // fuerza el reflow para que el siguiente cambio sí anime
            bar.style.transition = "width " + TIME_LIMIT_MS + "ms linear";
            bar.style.width = "0%";
        }
        function stopTimerBar() {
            const bar = document.getElementById("timer-bar");
            const current = getComputedStyle(bar).width;
            bar.style.transition = "none";
            bar.style.width = current;
        }

        function startTimer() {
            clearTimeout(failTimeoutId);
            startTimerBar();
            failTimeoutId = setTimeout(() => onFail("timeout"), TIME_LIMIT_MS);
        }

        // ---------- Elegir y cargar un ejercicio al azar ----------
        function pickRandomPuzzle() {
            const pool = window.PUZZLE_RUSH_DATA || [];
            let idx;
            do {
                idx = Math.floor(Math.random() * pool.length);
            } while (pool.length > 1 && idx === lastIndex);
            lastIndex = idx;
            return pool[idx];
        }

        function loadPuzzle() {
            const [fen, uci, san] = pickRandomPuzzle();
            currentSolution = uci;
            currentSan = san;
            game = new Chess(fen);
            selected = null;
            resultLocked = false;
            setResultText("");
            renderBoard();
            startTimer();
        }

        document.getElementById("start-btn").addEventListener("click", () => {
            if (!window.PUZZLE_RUSH_DATA || !window.PUZZLE_RUSH_DATA.length) {
                setResultText("No se pudieron cargar los ejercicios. Recarga la página.", "text-red-600 dark:text-red-400");
                return;
            }
            streak = 0;
            updateStreakDisplay();
            setResultText("");
            document.getElementById("start-btn").classList.add("hidden");
            running = true;
            loadPuzzle();
        });

        // ---------- Guardar mejor racha (logro visible para toda la clase) ----------
        async function saveBestStreak(value) {
            const nowIso = new Date().toISOString();
            const { error } = await sb.from("puzzle_rush_scores").upsert({
                student_id: profile.id, best_streak: value, achieved_at: nowIso, updated_at: nowIso,
            });
            if (error) console.error(error);
        }

        async function loadPersonalBest() {
            const { data, error } = await sb.from("puzzle_rush_scores").select("best_streak").eq("student_id", profile.id).maybeSingle();
            if (error) { console.error(error); return; }
            personalBest = (data && data.best_streak) || 0;
            updatePersonalBestDisplay();
        }

        // El "récord de la clase" se compara solo dentro del propio grupo del
        // alumno (profiles.grupo) — no tiene sentido que un alumno de un grupo
        // vea (o compita contra) la racha de alumnos de otro grupo. Si el
        // alumno todavía no tiene grupo asignado, se muestra el récord general
        // como respaldo (profiles!inner es necesario para poder filtrar por una
        // columna de la tabla relacionada).
        async function loadLeaderboard() {
            let query = sb.from("puzzle_rush_scores")
                .select("best_streak, profiles!inner(full_name, email, grupo)")
                .order("best_streak", { ascending: false })
                .limit(1);
            if (profile.grupo) query = query.eq("profiles.grupo", profile.grupo);
            const { data, error } = await query.maybeSingle();
            if (error) { console.error(error); return; }
            document.getElementById("class-record-label").textContent = profile.grupo ? `🏆 Récord del grupo ${profile.grupo}` : "🏆 Récord de la clase";
            const nameEl = document.getElementById("class-record-name");
            const streakEl = document.getElementById("class-record-streak");
            if (!data || !data.best_streak) { nameEl.textContent = "—"; streakEl.textContent = "0"; return; }
            nameEl.textContent = (data.profiles && (data.profiles.full_name || data.profiles.email)) || "?";
            streakEl.textContent = String(data.best_streak);
        }

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html"; return; }
            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { document.getElementById("loading").textContent = "No se pudo cargar tu perfil. Cierra sesión y vuelve a entrar."; return; }
            profile = profileData;

            renderBoard();
            await loadPersonalBest();
            await loadLeaderboard();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    
/* Coordenadas del tablero (js/coordenadas-tablero.js): la letra de columna abajo
   y el número de fila a la izquierda, para que se entienda hacia dónde avanza la
   posición. Se repintan solas cada vez que la página redibuja el tablero. */
if (window.Coordenadas) Coordenadas.aplicar(document.getElementById('board'));
