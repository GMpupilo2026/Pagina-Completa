/* El tablero de los ejercicios contra reloj: lo comparten racha-tactica.html
   y te-reto.html.

   Eran dos copias de las mismas 230 líneas (el tablero, el teclado, el
   arrastre, el cuadro de comandos, la coronación y la corrección de la
   jugada), y ya se habían separado: Racha táctica daba por buena cualquier
   otra jugada que diera mate en un ejercicio de mate (hay unas 140 posiciones
   con más de un mate) y Te reto la marcaba como incorrecta. Una sola copia.

   Script clásico, cargado ANTES del de cada página: sus function y let quedan
   globales, y usa las variables de la página (game, selected, currentSolution,
   currentSan, running, resultLocked) y sus funciones (onCorrect, onFail,
   limiteMs, modoAdaptado, empezarRacha) solo DENTRO de funciones, cuando ya
   existen. Nada de acá las toca al cargar. */
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
            comandos.ayuda('Jugada: "Cf3", "e4", "Dxh7+", "e8=D". Pregunta: "caballos", "qué hay en e4". Escribe "ayuda" para todo. '
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
