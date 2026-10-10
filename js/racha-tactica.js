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

        function updateStreakDisplay() {
            document.getElementById("current-streak").textContent = String(streak);
        }
        function updatePersonalBestDisplay() {
            document.getElementById("personal-best").textContent = String(personalBest);
        }

        function onCorrect() {
            if (resultLocked) return;
            resultLocked = true;
            clearTimeout(failTimeoutId);
            cortarLectura();
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
            cortarLectura();
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
        /* Las cuentas marcadas «ciego» (js/vision-cuenta.js) van aparte, como lo
           pidió ese grupo: las piezas se dicen una por una, con una pausa entre
           una y otra, y los 30 segundos empiezan cuando termina la lectura. Con
           los 60 de antes, oír la posición se comía casi todo el reloj. */
        const TIEMPO_CIEGO_MS = 30000;
        function modoCiego() {
            return document.documentElement.classList.contains("modo-ciego");
        }
        function limiteMs() {
            if (modoCiego()) return TIEMPO_CIEGO_MS;
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
        // La barra llena y quieta mientras se dicen las piezas: el reloj no corre.
        function prepararTimerBar() {
            const bar = document.getElementById("timer-bar");
            bar.style.transition = "none";
            bar.style.width = "100%";
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

        /* ---------- La posición pieza por pieza (cuentas «ciego») ----------
           Cada pieza va sola a una región viva, y la siguiente llega un segundo
           DESPUÉS de que se terminó de decir la anterior. Con «Activar voz» se
           sabe cuándo terminó (la voz del navegador avisa); con un lector de
           pantalla no hay forma de saberlo, así que se calcula por el largo de la
           frase. Contestar antes de que termine vale: corta la lectura. */
        const LECTURA = { pausaMs: 1000, msPorLetra: 65 };
        const GENERO = { k: "rey blanco", q: "dama blanca", r: "torre blanca", b: "alfil blanco", n: "caballo blanco", p: "peón blanco" };
        let lecturaId = 0, lecturaEspera = null, leyendoPiezas = false;
        function cortarLectura() {
            lecturaId++;
            clearTimeout(lecturaEspera);
            leyendoPiezas = false;
        }
        function piezasUnaPorUna(juego) {
            const orden = ["k", "q", "r", "b", "n", "p"], frases = [];
            ["w", "b"].forEach((color) => {
                orden.forEach((tipo) => {
                    juego.SQUARES.filter((sq) => { const c = juego.get(sq); return c && c.color === color && c.type === tipo; })
                        .sort()
                        .forEach((sq) => {
                            const nombre = color === "w" ? GENERO[tipo] : GENERO[tipo].replace("blanc", "negr");
                            frases.push(nombre.charAt(0).toUpperCase() + nombre.slice(1) + " en " + BlindNotation.squareSpoken(sq) + ".");
                        });
                });
            });
            return frases;
        }
        function estimarMs(texto) { return String(texto).length * LECTURA.msPorLetra; }
        function decirPieza(texto, despues) {
            const region = document.getElementById("pieza-dicha");
            const conVoz = window.BlindNotation && BlindNotation.isSpeechEnabled && BlindNotation.isSpeechEnabled();
            if (conVoz) {
                /* Muda para «Activar voz» (js/voz-pagina.js), que si no la diría
                   otra vez: acá se dice directo, para saber cuándo terminó. */
                region.setAttribute("aria-live", "off");
                region.textContent = texto;
                let listo = false;
                const seguir = () => { if (!listo) { listo = true; despues(); } };
                BlindNotation.speak(texto, { alTerminar: seguir });
                lecturaEspera = setTimeout(seguir, estimarMs(texto) * 3 + 1000);
            } else {
                region.setAttribute("aria-live", "polite");
                region.textContent = texto;
                lecturaEspera = setTimeout(despues, estimarMs(texto));
            }
        }
        function leerPiezasYEmpezar(aviso) {
            cortarLectura();
            const id = lecturaId;
            leyendoPiezas = true;
            const frases = piezasUnaPorUna(game);
            const turno = "Juegan las " + (game.turn() === "w" ? "blancas" : "negras") + ". Empieza el reloj: "
                + (limiteMs() / 1000) + " segundos.";
            let i = 0;
            const siguiente = () => {
                if (id !== lecturaId) return;
                if (i < frases.length) {
                    const frase = frases[i++];
                    decirPieza(frase, () => {
                        if (id !== lecturaId) return;
                        lecturaEspera = setTimeout(siguiente, LECTURA.pausaMs);
                    });
                    return;
                }
                leyendoPiezas = false;
                document.getElementById("pieza-dicha").textContent = "";
                setResultText(turno);
                startTimer();
            };
            // Primero se deja oír el aviso del ejercicio nuevo, y la pausa.
            lecturaEspera = setTimeout(siguiente, estimarMs(aviso) + LECTURA.pausaMs);
        }

        function loadPuzzle() {
            const [fen, uci, san, , jugadaRival] = pickRandomPuzzle();
            currentSolution = uci;
            currentSan = san;
            game = new Chess(fen);
            /* Lo que acaba de jugar el rival (el quinto campo del banco, que arma
               herramientas/racha-jugada-rival.js): se dice al llegar el ejercicio,
               y «última jugada» en el recuadro lo repite (js/comandos-tablero.js). */
            if (jugadaRival) game.jugadaPrevia = jugadaRival;
            const rivalJugo = jugadaRival && window.ComandosTablero
                ? "Las " + (game.turn() === "w" ? "negras" : "blancas") + " jugaron "
                  + ComandosTablero.jugadaParaMostrar(jugadaRival) + ". "
                : "";
            selected = null;
            resultLocked = false;
            /* En Modo Adaptado el renglón del resultado (región viva) dice que llegó
               un ejercicio nuevo, de qué color se juega y cuánto tiempo hay. Sin
               esto, el "¡Correcto!" se borraba a los 350 ms, antes de que el lector
               de pantalla lo dijera, y el ejercicio siguiente llegaba sin aviso: el
               reloj ya corría y quien no ve la pantalla no sabía que había cambiado. */
            if (modoCiego() && window.BlindNotation) {
                const aviso = (streak > 0 ? "✅ ¡Correcto! Racha: " + streak + ". " : "")
                    + "Ejercicio nuevo. " + rivalJugo + "Juegan las " + (game.turn() === "w" ? "blancas" : "negras")
                    + ". Te digo las piezas una por una; los " + (limiteMs() / 1000)
                    + " segundos empiezan cuando termine.";
                setResultText(aviso);
                renderBoard();
                prepararTimerBar();
                leerPiezasYEmpezar(aviso);
                return;
            }
            setResultText(modoAdaptado()
                ? (streak > 0 ? "✅ ¡Correcto! Racha: " + streak + ". " : "")
                  + "Ejercicio nuevo. " + rivalJugo + "Juegan las " + (game.turn() === "w" ? "blancas" : "negras")
                  + ". Tienes " + (limiteMs() / 1000) + " segundos."
                : rivalJugo.trim());
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
