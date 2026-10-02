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
        /* En Modo Adaptado, seis veces más: 60 segundos. Diez segundos alcanzan
           para mirar un tablero, no para oírlo — solo escuchar la posición entera
           ya se lleva más que eso, y después hay que recorrerla y escribir la
           jugada. Con el mismo reloj para todos, quien usa lector de pantalla
           perdía todos los ejercicios por tiempo y no fallaba nada. Se mira en
           cada ejercicio, así que encender el modo vale desde el siguiente. */
        const FACTOR_ADAPTADO = 6;
        function modoAdaptado() {
            return window.CuadroComandos ? CuadroComandos.activo() : document.documentElement.classList.contains("adaptive-mode");
        }
        function limiteMs() {
            return modoAdaptado() ? TIME_LIMIT_MS * FACTOR_ADAPTADO : TIME_LIMIT_MS;
        }
        const NAME_KEY = "demuestraNivelName_v1";
        const BEST_KEY_PREFIX = "demuestraNivelBest_v1_";
        const DAY_STREAK_KEY = "demuestraNivelDias_v1";
        const MILESTONES = [5, 10, 15, 20, 30, 50];

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
                const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
                const last = localStorage.getItem(DAY_STREAK_KEY);
                let count = parseInt(localStorage.getItem(DAY_STREAK_KEY + "_count") || "0", 10) || 0;
                if (last === today) {
                    // ya contado hoy, no hacer nada
                } else {
                    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
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
            empezarRacha();
        }

        // Arranca (o reinicia) una corrida — se llama tanto apenas se pone el nombre
        // (para no obligar a un segundo clic en "Empezar") como desde el botón
        // "Jugar de nuevo" tras terminar una racha.
        function empezarRacha() {
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

        function onCorrect() {
            if (resultLocked) return;
            resultLocked = true;
            clearTimeout(failTimeoutId);
            if (relojHablado) relojHablado.parar();
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

        async function onFail(reason, sanJugada) {
            if (resultLocked) return;
            resultLocked = true;
            clearTimeout(failTimeoutId);
            if (relojHablado) relojHablado.parar();
            stopTimerBar();
            flashBoard("wrong");
            renderBoard();
            const finalStreak = streak;
            /* La jugada se pudo hacer pero no era la del ejercicio: el mensaje
               EMPIEZA por «Respuesta incorrecta» (ComandosTablero.incorrecta), que es
               lo que se dice en todo el sitio; «no es legal» queda para la que no se
               puede hacer. La jugada, en español (en palabras para quien no ve). */
            const dicha = sanJugada ? ComandosTablero.jugadaParaMostrar(sanJugada) : "";
            const reasonText = reason === "timeout" ? "⏱️ ¡Se acabó el tiempo!"
                : (window.ComandosTablero && dicha ? ComandosTablero.incorrecta(dicha) : "Respuesta incorrecta: esa no era la jugada.");
            // La jugada en algebraica española («Cf3»), y en palabras para quien
            // no ve («caballo felix 3»): el SAN en inglés no va nunca en pantalla.
            const correcta = ComandosTablero.jugadaParaMostrar(currentSan);
            yaTermino = true;
            /* Con el recuadro, el final dice qué escribir para seguir: el botón
               «Jugar de nuevo» no lo encuentra quien no ve. */
            setResultText(reasonText + " La respuesta correcta era " + correcta + ". Racha final: " + finalStreak + "."
                + (modoAdaptado() ? " Escribe «otra vez» para jugar de nuevo." : ""), "text-red-600 dark:text-red-400");
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
            bar.style.transition = "width " + limiteMs() + "ms linear";
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
            failTimeoutId = setTimeout(() => onFail("timeout"), limiteMs());
            if (relojHablado) relojHablado.empezar(limiteMs());
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

        /* La posición del ejercicio nuevo, dicha una sola vez y en el mismo aviso
           que «Ejercicio nuevo…» (el renglón del resultado es la región viva): dos
           regiones hablando a la vez se pisan. Va en un <span> solo para el lector,
           así que en pantalla el renglón sigue siendo corto. */
        function decirPosicionNueva() {
            if (!modoAdaptado() || !window.BlindNotation || !BlindNotation.positionSentence) return;
            const el = document.getElementById("result-text");
            const sr = document.createElement("span");
            sr.className = "sr-only";
            sr.textContent = " Posición: " + BlindNotation.positionSentence(game);
            el.appendChild(sr);
        }

        function loadPuzzle() {
            const [fen, uci, san] = pickRandomPuzzle();
            currentSolution = uci;
            currentSan = san;
            game = new Chess(fen);
            selected = null;
            resultLocked = false;
            /* En Modo Adaptado el renglón del resultado (región viva) dice que llegó
               un ejercicio nuevo, de qué color se juega y cuánto tiempo hay. Sin
               esto, el "¡Correcto!" se borraba a los 350 ms, antes de que el lector
               de pantalla lo dijera, y el ejercicio siguiente llegaba sin aviso: el
               reloj ya corría y quien no ve la pantalla no sabía que había cambiado. */
            setResultText(modoAdaptado()
                ? (streak > 0 ? "✅ ¡Correcto! Racha: " + streak + ". " : "")
                  + "Ejercicio nuevo: juegan las " + (game.turn() === "w" ? "blancas" : "negras")
                  + ". Tienes " + (limiteMs() / 1000) + " segundos."
                : "");
            decirPosicionNueva();
            setMilestoneText("");
            renderBoard();
            startTimer();
        }

        document.getElementById("start-btn").addEventListener("click", empezarRacha);

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
            enfocarNombreSiNoVe();
        }

        /* Con la cuenta ciega (o el Modo Adaptado) el foco empieza en el campo del
           nombre: la página abría con el foco en el <body>, y el nombre —lo único
           que hay que hacer para empezar— quedaba a diecinueve Tab. Solo si el foco
           no está en otro lado: no se le quita a nada que la persona haya elegido.
           La marca de la cuenta puede llegar después de cargar (js/vision-cuenta.js
           mira la sesión), así que se vuelve a probar cuando llega. */
        function enfocarNombreSiNoVe() {
            const raiz = document.documentElement.classList;
            if (!raiz.contains("modo-ciego") && !raiz.contains("adaptive-mode")) return;
            if (document.getElementById("name-gate").classList.contains("hidden")) return;
            const a = document.activeElement;
            if (a && a !== document.body) return;
            const campo = document.getElementById("name-input");
            try { campo.focus(); campo.select(); } catch (e) {}
        }
        document.addEventListener("vision:cambio", enfocarNombreSiNoVe);
        document.addEventListener("adaptivemode:change", enfocarNombreSiNoVe);
        init();
    
/* Coordenadas del tablero (js/coordenadas-tablero.js): la letra de columna abajo
   y el número de fila a la izquierda, para que se entienda hacia dónde avanza la
   posición. Se repintan solas cada vez que la página redibuja el tablero. */
if (window.Coordenadas) Coordenadas.aplicar(document.getElementById('board'));
