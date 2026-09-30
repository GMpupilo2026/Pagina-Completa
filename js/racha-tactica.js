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
            /* Vaciar el tablero saca del documento la casilla que tenía el foco, y
               el navegador lo manda al <body>: elegías la pieza con Intro y te
               quedabas fuera del tablero, a mitad de la jugada. Se recuerda en qué
               casilla estaba para devolverlo ahí al terminar de pintar. */
            const activa = document.activeElement;
            const casillaConFoco = activa && boardEl.contains(activa) && activa.dataset ? activa.dataset.square : null;
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
                /* El rótulo de la casilla lo escribe js/tablero-accesible.js ("eva 4,
                   caballo blanco"), no esta página: antes decía "Casilla e4: Blanco n",
                   deletreado y con la letra de la pieza en inglés, o sea un tablero que
                   con lector de pantalla no se entendía. Lo que sí decide la página es
                   el ESTADO de la casilla, y va en data-estado para que el módulo lo
                   sume al final. */
                if (selected === square) btn.dataset.estado = "elegida";
                else if (legalTargets.indexOf(square) !== -1) btn.dataset.estado = piece ? "puedes capturar ahí" : "puedes ir ahí";
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
            if (casillaConFoco) {
                const celda = boardEl.querySelector('[data-square="' + casillaConFoco + '"]');
                if (celda) celda.focus({ preventScroll: true });
            }
            montarTeclado();
        }

        /* Una sola parada de tabulador para todo el tablero y las flechas por
           dentro, más los atajos de una tecla en Modo Adaptado (o, z, m, x,
           k q r b n p). Eran 64 botones sueltos: sesenta y cinco Tab para llegar
           al botón de abajo, y sin forma de MIRAR el tablero. Se monta una vez y
           a partir de ahí se repone solo en cada repintado (js/tablero-accesible.js). */
        let teclado = null;
        function montarTeclado() {
            if (teclado || !window.TableroAccesible) return;
            teclado = TableroAccesible.montar(document.getElementById("board"), {
                nombre: "Tablero del ejercicio",
                juego: () => game,
                cuadro: () => (comandos ? comandos.input : null),
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
        /* El reloj dicho en voz: «tiempo» en el recuadro, y en Modo Adaptado los
           avisos de mitad de tiempo y de los 10 segundos, por la misma región viva
           del recuadro (y en voz alta si la voz está encendida). */
        const relojHablado = window.RelojHablado ? RelojHablado.crear({
            hablar: () => modoAdaptado(),
            decir: (texto) => {
                if (comandos) comandos.decir(texto);
                if (window.BlindNotation && BlindNotation.speak) { try { BlindNotation.speak(texto); } catch (e) {} }
            },
        }) : null;

        function refrescarComandos() {
            if (!window.CuadroComandos || !game) return;
            if (!comandos) {
                /* Con `juego` y `tablero`, el recuadro contesta también las preguntas
                   de todo el sitio ("posición", "caballos", "qué hay en e4") antes de
                   tratar el texto como jugada (js/comandos-tablero.js). Sin ellos, quien
                   no ve la pantalla solo podía oír la posición entera de corrido. */
                comandos = CuadroComandos.montar(document.getElementById("q-comandos"), {
                    etiqueta: "Escribe tu jugada, o una pregunta sobre la posición",
                    juego: () => game,
                    tablero: () => teclado,
                    onEnviar: jugarEscribiendo,
                    /* Muda: la posición se dice UNA vez, al llegar el ejercicio
                       (loadPuzzle). Viva, se volvía a dictar entera después de cada
                       jugada propia —treinta piezas con el reloj corriendo— y tapaba
                       el «¡Correcto!» y el aviso del ejercicio nuevo. */
                    posicionViva: false,
                });
            }
            comandos.ayuda('Jugada, en español o en inglés: "Cf3", "Nf3", "e4", "Dxh7+", "e8=D". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo. '
                + "Tienes " + (limiteMs() / 1000) + " segundos por ejercicio.");
            comandos.posicion(game);
        }

        // Lo que se escribe para empezar otra racha al terminar (o la primera).
        const PIDE_OTRA = /^(otra vez|otra|siguiente|de nuevo|jugar de nuevo|jugar otra vez|volver a jugar|otra racha|empezar|comenzar|empezar de nuevo|reiniciar|nueva racha)$/;
        let yaTermino = false;
        function normalizarPedido(t) {
            return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
        }

        function jugarEscribiendo(texto, api) {
            // «tiempo», «reloj», «cuánto tiempo»: los segundos que quedan. Va antes que
            // lo demás porque la barra que se achica no la oye nadie (js/reloj-hablado.js).
            if (relojHablado && relojHablado.esPregunta(texto)) {
                api.limpiar().decir(relojHablado.texto());
                return;
            }
            /* Terminada la racha (o antes de empezar), «otra vez», «siguiente» o
               «jugar de nuevo» arrancan otra: antes todo contestaba «Ahora mismo no
               se puede contestar» y quien no ve tenía que salir del recuadro a
               buscar el botón. */
            if (!running) {
                if (PIDE_OTRA.test(normalizarPedido(texto))) { api.limpiar().decir(""); empezarRacha(); return; }
                api.decir(yaTermino ? "La racha terminó. Escribe «otra vez» para jugar de nuevo."
                    : "La racha no ha empezado. Escribe «empezar» para jugar.");
                try { api.input.select(); } catch (e) {}
                return;
            }
            if (resultLocked) { api.decir("Espera un momento: ya viene el ejercicio siguiente."); return; }
            // El intérprete HACE la jugada sobre la partida que se le pasa, así
            // que se le pasa una copia: quien decide si entra es attemptMove(),
            // la misma puerta por la que pasa el clic.
            const copia = new Chess(game.fen());
            const mv = CuadroComandos.jugadaPedida(copia, texto);
            if (!mv) {
                /* Tres casos distintos (ComandosTablero.noSePudoJugar): lo escrito no
                   es una jugada («hola»), o es una jugada que no se puede hacer acá.
                   Decirle «no es legal» a un «hola» lo manda a revisar una jugada
                   que no escribió. */
                api.decir(window.ComandosTablero ? ComandosTablero.noSePudoJugar(texto)
                    : '"' + texto + '" no es una jugada legal en esta posición.');
                // Seleccionado, lo siguiente que se escriba lo reemplaza en vez de pegarse detrás.
                try { api.input.select(); } catch (e) {}
                return;
            }
            api.limpiar().decir("");
            attemptMove(mv.from, mv.to, mv.promotion);
        }

        function attemptMove(from, to, promotion) {
            // Si el peón corona y todavía no se dijo en qué, se pregunta (js/coronacion.js).
            if (!promotion && window.Coronacion && Coronacion.hayQueElegir(game, from, to)) {
                selected = null;
                renderBoard();
                Coronacion.pedir(game.turn(), (elegida) => {
                    if (elegida && running && !resultLocked) attemptMove(from, to, elegida);
                });
                return;
            }
            const move = game.move({ from, to, promotion });
            selected = null;
            if (!move) { renderBoard(); return; } // no debería pasar: ya se validó como legal
            // El UCI de la solución es siempre "origen+destino" (+ promoción, en los 2
            // puzzles que coronan): el origen y el destino tienen que coincidir, y si
            // la solución corona, también la pieza que eligió el alumno.
            // Además, en los puzzles de mate hay unas 140 posiciones con más de una
            // jugada que da jaque mate: si el ejercicio es un mate y la jugada elegida
            // también da mate (aunque no sea la guardada), también cuenta como acierto.
            const esLaJugadaGuardada = (from + to) === currentSolution.slice(0, 4) &&
                (currentSolution.length < 5 || currentSolution[4] === move.promotion);
            const esOtroMateValido = !esLaJugadaGuardada && currentSan.endsWith("#") && game.in_checkmate();
            const isCorrect = esLaJugadaGuardada || esOtroMateValido;
            if (isCorrect) onCorrect(); else onFail("wrong", move.san);
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
            if (relojHablado) relojHablado.parar();
            streak++;
            updateStreakDisplay();
            flashBoard("correct");
            renderBoard();
            setResultText("✅ ¡Correcto!", "text-green-600 dark:text-green-400");
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
               puede hacer. La jugada, en palabras. */
            const dicha = sanJugada && window.BlindNotation ? BlindNotation.sanSpoken(sanJugada) : (sanJugada || "");
            const reasonText = reason === "timeout" ? "⏱️ ¡Se acabó el tiempo!"
                : (window.ComandosTablero && dicha ? ComandosTablero.incorrecta(dicha) : "Respuesta incorrecta: esa no era la jugada.");
            // La jugada, dicha en palabras ("caballo efe 3", no "Nf3"): el SAN en
            // inglés lo deletrea el lector de pantalla y no se entiende.
            const correcta = window.BlindNotation ? BlindNotation.sanSpoken(currentSan) : currentSan;
            yaTermino = true;
            /* Con el recuadro, el final dice qué escribir para seguir: el botón
               «Jugar de nuevo» no lo encuentra quien no ve. */
            setResultText(reasonText + " La respuesta correcta era " + correcta + ". Racha final: " + finalStreak + "."
                + (modoAdaptado() ? " Escribe «otra vez» para jugar de nuevo." : ""), "text-red-600 dark:text-red-400");
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
        function startTimerBar() {
            const bar = document.getElementById("timer-bar");
            bar.style.transition = "none";
            bar.style.width = "100%";
            void bar.offsetWidth; // fuerza el reflow para que el siguiente cambio sí anime
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

        // ---------- Elegir el ejercicio: más difícil cuanto más larga la racha ----------
        // Antes se sorteaba entre los 4446 sin mirar el rating (de 399 a 1791): a
        // uno le tocaba un 1791 de entrada y a otro un 399 en el ejercicio treinta,
        // con el mismo reloj, y el récord del grupo comparaba rachas que no se
        // parecían. Ahora cada racha arranca fácil y sube: el ejercicio número n
        // se sortea entre los que están cerca de ratingDeLaRacha(n). Así una racha
        // de 20 vale lo mismo para todos. Dentro de una racha no se repite ninguno.
        const RATING_INICIAL = 500, SUBE_POR_ACIERTO = 60, VENTANA = 100, MINIMO_PARA_SORTEAR = 8;
        let ordenados = null;          // índices del banco, de menor a mayor rating
        let vistosEnLaRacha = new Set();
        function ratingDeLaRacha(n) { return RATING_INICIAL + SUBE_POR_ACIERTO * n; }
        function pickRandomPuzzle() {
            const pool = window.PUZZLE_RUSH_DATA || [];
            if (!ordenados) ordenados = pool.map((_, i) => i).sort((a, b) => (pool[a][3] || 0) - (pool[b][3] || 0));
            const meta = ratingDeLaRacha(streak);
            let ventana = VENTANA, candidatos = [];
            // Se abre la ventana hasta tener de dónde sortear (arriba de 1700 hay pocos).
            while (candidatos.length < MINIMO_PARA_SORTEAR && ventana < 3000) {
                candidatos = ordenados.filter((i) => !vistosEnLaRacha.has(i) && Math.abs((pool[i][3] || 0) - meta) <= ventana);
                ventana *= 2;
            }
            if (!candidatos.length) candidatos = ordenados.filter((i) => !vistosEnLaRacha.has(i));
            if (!candidatos.length) { vistosEnLaRacha = new Set(); candidatos = ordenados.slice(); }
            const idx = candidatos[Math.floor(Math.random() * candidatos.length)];
            vistosEnLaRacha.add(idx);
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
            renderBoard();
            startTimer();
        }

        function empezarRacha() {
            if (!window.PUZZLE_RUSH_DATA || !window.PUZZLE_RUSH_DATA.length) {
                setResultText("No se pudieron cargar los ejercicios. Recarga la página.", "text-red-600 dark:text-red-400");
                return;
            }
            streak = 0;
            vistosEnLaRacha = new Set();
            updateStreakDisplay();
            setResultText("");
            document.getElementById("start-btn").classList.add("hidden");
            running = true;
            loadPuzzle();
        }
        document.getElementById("start-btn").addEventListener("click", empezarRacha);

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
            // Con ?next= se vuelve a la Racha después de iniciar sesión, no al panel.
            if (!session) { window.location.href = "login.html?next=" + encodeURIComponent("racha-tactica.html"); return; }
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
