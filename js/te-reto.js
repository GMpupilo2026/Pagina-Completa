/* El código de te-reto.html.

   Vivía escrito dentro de la página, en un <script> de 19 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

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
        let playerName = "";

        const TIME_LIMIT_MS = 10000;
        const NAME_KEY = "demuestraNivelName_v1";
        const BEST_KEY_PREFIX = "demuestraNivelBest_v1_";
        const DAY_STREAK_KEY = "demuestraNivelDias_v1";
        const MILESTONES = [5, 10, 15, 20, 30, 50];

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
        function setMilestoneText(text) {
            document.getElementById("milestone-text").textContent = text || "";
        }

        function updateStreakDisplay() { document.getElementById("current-streak").textContent = String(streak); }
        function updatePersonalBestDisplay() { document.getElementById("personal-best").textContent = String(personalBest); }

        // ---------- Nombre del jugador (localStorage, sin cuenta) ----------
        function bestKeyFor(name) { return BEST_KEY_PREFIX + name.trim().toLowerCase(); }

        function loadPersonalBestFor(name) {
            try {
                const raw = localStorage.getItem(bestKeyFor(name));
                return raw ? parseInt(raw, 10) || 0 : 0;
            } catch (e) { return 0; }
        }
        function savePersonalBestFor(name, value) {
            try { localStorage.setItem(bestKeyFor(name), String(value)); } catch (e) {}
        }

        function updateDayStreakUI() {
            let count = 1;
            try { count = parseInt(localStorage.getItem(DAY_STREAK_KEY + "_count") || "1", 10) || 1; } catch (e) {}
            const el = document.getElementById("day-streak-text");
            el.textContent = count > 1 ? "📅 Llevas " + count + " días seguidos jugando — ¡no cortes la racha!" : "";
        }

        // Registra la visita de HOY (al arrancar una corrida, no solo al cargar la página)
        // y sube el contador de "días seguidos" si la última vez fue ayer. Es puramente
        // local al navegador (sin cuenta no hay forma de saber que es la misma persona en
        // otro dispositivo) pero alcanza para darle al juego ese empujón de "no corte la
        // racha de venir todos los días".
        function registerDailyVisit() {
            try {
                const today = new Date().toISOString().slice(0, 10);
                const last = localStorage.getItem(DAY_STREAK_KEY);
                let count = parseInt(localStorage.getItem(DAY_STREAK_KEY + "_count") || "0", 10) || 0;
                if (last === today) {
                    // ya contado hoy, no hacer nada
                } else {
                    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                    count = last === yesterday ? count + 1 : 1;
                    localStorage.setItem(DAY_STREAK_KEY, today);
                    localStorage.setItem(DAY_STREAK_KEY + "_count", String(count));
                }
            } catch (e) {}
            updateDayStreakUI();
        }

        function startWithName(name) {
            playerName = name.trim().slice(0, 24);
            try { localStorage.setItem(NAME_KEY, playerName); } catch (e) {}
            document.getElementById("player-name-display").textContent = playerName;
            personalBest = loadPersonalBestFor(playerName);
            updatePersonalBestDisplay();
            document.getElementById("name-gate").classList.add("hidden");
            document.getElementById("game-area").classList.remove("hidden");
            beginRun();
        }

        // Arranca (o reinicia) una corrida — se llama tanto apenas se pone el nombre
        // (para no obligar a un segundo clic en "Empezar") como desde el botón
        // "Jugar de nuevo" tras terminar una racha.
        function beginRun() {
            if (!window.PUZZLE_RUSH_DATA || !window.PUZZLE_RUSH_DATA.length) {
                setResultText("No se pudieron cargar los ejercicios. Recarga la página.", "text-red-600 dark:text-red-400");
                return;
            }
            registerDailyVisit();
            streak = 0;
            updateStreakDisplay();
            setResultText("");
            setMilestoneText("");
            document.getElementById("start-btn").classList.add("hidden");
            running = true;
            loadPuzzle();
        }

        document.getElementById("name-form").addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.getElementById("name-input").value.trim();
            if (!name) return;
            startWithName(name);
        });

        document.getElementById("change-name-btn").addEventListener("click", () => {
            running = false;
            resultLocked = true;
            document.getElementById("game-area").classList.add("hidden");
            document.getElementById("name-gate").classList.remove("hidden");
            document.getElementById("name-input").value = playerName;
            document.getElementById("name-input").focus();
        });

        // ---------- Confeti (sin librerías externas) ----------
        function launchConfetti() {
            const layer = document.getElementById("confetti-layer");
            const colors = ["#de911d", "#f0b429", "#243b53", "#9fb3c8", "#cb6e17"];
            for (let i = 0; i < 24; i++) {
                const piece = document.createElement("span");
                piece.className = "confetti-piece";
                piece.style.left = Math.random() * 100 + "%";
                piece.style.background = colors[i % colors.length];
                piece.style.animationDelay = (Math.random() * 0.3) + "s";
                layer.appendChild(piece);
                setTimeout(() => piece.remove(), 1800);
            }
        }

        // ---------- Tablero (mismo patrón que racha-tactica.html) ----------
        function renderBoard() {
            refrescarComandos();
            const boardEl = document.getElementById("board");
            boardEl.innerHTML = "";
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
            const isCorrect = (from + to) === currentSolution.slice(0, 4);
            const move = game.move({ from, to, promotion: "q" });
            selected = null;
            if (!move) { renderBoard(); return; }
            if (isCorrect) onCorrect(); else onFail("wrong");
        }

        function flashBoard(kind) {
            const boardEl = document.getElementById("board");
            boardEl.classList.remove("ring-8", "ring-green-500", "ring-red-500");
            void boardEl.offsetWidth;
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
            if (MILESTONES.indexOf(streak) !== -1) {
                setMilestoneText("🔥 ¡Racha de " + streak + "!");
                launchConfetti();
            } else {
                setMilestoneText("");
            }
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
            setMilestoneText("");
            running = false;
            streak = 0;
            updateStreakDisplay();
            document.getElementById("start-btn").classList.remove("hidden");

            const isNewPersonalBest = finalStreak > personalBest;
            if (isNewPersonalBest) {
                personalBest = finalStreak;
                updatePersonalBestDisplay();
                savePersonalBestFor(playerName, personalBest);
            }
            if (finalStreak >= 1) {
                const saved = await saveToLeaderboard(playerName, finalStreak);
                const madeTop10 = saved && await loadLeaderboard(finalStreak);
                if (madeTop10) {
                    launchConfetti();
                    setMilestoneText("🎉 ¡Entraste al Top 10!");
                } else if (isNewPersonalBest) {
                    setMilestoneText("⭐ ¡Nuevo récord personal!");
                }
            }
        }

        // ---------- Cronómetro ----------
        function startTimerBar() {
            const bar = document.getElementById("timer-bar");
            bar.style.transition = "none";
            bar.style.width = "100%";
            void bar.offsetWidth;
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
            setMilestoneText("");
            renderBoard();
            startTimer();
        }

        document.getElementById("start-btn").addEventListener("click", beginRun);

        // ---------- Ranking público (sin login) ----------
        async function saveToLeaderboard(name, value) {
            const { error } = await sb.from("public_streak_leaderboard").insert({ display_name: name, best_streak: value });
            if (error) { console.error(error); return false; }
            // ¿Entró al Top 10? Se sabe recién después de recargar el ranking, así que
            // se decide en loadLeaderboard() — acá solo se avisa que se guardó bien.
            return true;
        }

        function medalFor(position) {
            return position === 0 ? "🥇" : position === 1 ? "🥈" : position === 2 ? "🥉" : (position + 1) + ".";
        }

        // highlightStreak (opcional): la racha de la corrida que se acaba de guardar —
        // se usa solo para saber si ESA corrida en particular entró al Top 10 (no si el
        // mejor histórico del jugador ya estaba ahí de antes), y el valor de retorno se
        // usa para decidir si mostrar el festejo de "entraste al Top 10".
        async function loadLeaderboard(highlightStreak) {
            const { data, error } = await sb.from("public_streak_leaderboard")
                .select("display_name, best_streak")
                .order("best_streak", { ascending: false })
                .limit(10);
            const listEl = document.getElementById("leaderboard-list");
            if (error) { console.error(error); listEl.innerHTML = '<li class="text-sm text-red-500">No se pudo cargar el ranking.</li>'; return false; }
            const rows = data || [];
            document.getElementById("top-streak").textContent = rows.length ? String(rows[0].best_streak) : "0";
            const madeTop10 = highlightStreak != null && rows.some((r) => r.display_name === playerName && r.best_streak === highlightStreak);
            if (!rows.length) { listEl.innerHTML = '<li class="text-sm text-brand-450 dark:text-brand-350">Todavía nadie jugó — ¡sé el primero!</li>'; return madeTop10; }
            listEl.innerHTML = "";
            rows.forEach((r, i) => {
                const li = document.createElement("li");
                const isMe = r.display_name === playerName;
                li.className = "flex items-center justify-between text-sm rounded-lg px-2 py-1.5 " + (isMe ? "bg-accent-500/20 font-semibold" : "");
                const left = document.createElement("span");
                left.textContent = medalFor(i) + " " + r.display_name;
                left.className = "truncate pr-2";
                const right = document.createElement("span");
                right.className = "font-bold text-brand-700 dark:text-brand-200 shrink-0";
                right.textContent = String(r.best_streak);
                li.append(left, right);
                listEl.appendChild(li);
            });
            return madeTop10;
        }

        async function init() {
            await loadLeaderboard();
            let savedName = "";
            try { savedName = localStorage.getItem(NAME_KEY) || ""; } catch (e) {}
            if (savedName) document.getElementById("name-input").value = savedName;
            updateDayStreakUI();
        }
        init();
    
/* Coordenadas del tablero (js/coordenadas-tablero.js): la letra de columna abajo
   y el número de fila a la izquierda, para que se entienda hacia dónde avanza la
   posición. Se repintan solas cada vez que la página redibuja el tablero. */
if (window.Coordenadas) Coordenadas.aplicar(document.getElementById('board'));
