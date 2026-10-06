/* El código de lector-planilla.html.

   Vivía escrito dentro de la página, en un <script> de 21 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null;

        function downloadText(filename, text) {
            const blob = new Blob([text], { type: "application/x-chess-pgn" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        /* La lectura en sí (las lecturas de notación, la jugada legal más
           parecida, el orden de las filas y la subida de la foto a
           ocr-scoresheet) vive en js/planilla-ocr.js: la usa también «Anota tu
           partida» de «Tus propios errores». */
        const { tryParseMove, forceMatchLegalMove, reconstructMoveTokens } = window.PlanillaOcr;
        const runOcr = async (file) => PlanillaOcr.leerFoto(file, await window.tokenDeSesion());

        /* ============================================================
           Estado del procesamiento jugada por jugada
           ============================================================ */
        let game = null;
        let tokens = [];
        let tokenIndex = 0;
        let processBoard = null;

        function updateProcessStatus(text) {
            document.getElementById("process-status").textContent = text;
        }

        function updateBoardPreview() {
            if (!processBoard) {
                processBoard = new ClasesBoard(document.getElementById("process-board"), { interactive: false });
            }
            processBoard.loadMoves(game.history());
        }

        // Jugadas que se forzaron por parecido con una jugada legal (forceMatchLegalMove),
        // no porque el texto del OCR haya calzado tal cual — se marcan con "≈" en la lista
        // para poder repasarlas de un vistazo, ya que nunca se detiene a confirmarlas.
        let guessedPlies = new Set();

        function updateMoveList() {
            const list = document.getElementById("move-list");
            list.innerHTML = "";
            const history = game.history();
            for (let i = 0; i < history.length; i += 2) {
                const li = document.createElement("li");
                const num = i / 2 + 1;
                const whiteMove = (guessedPlies.has(i) ? "≈" : "") + history[i];
                const blackMove = history[i + 1] ? "  " + (guessedPlies.has(i + 1) ? "≈" : "") + history[i + 1] : "";
                li.textContent = `${num}. ${whiteMove}${blackMove}`;
                if (guessedPlies.has(i) || guessedPlies.has(i + 1)) li.title = "≈ = adivinada por parecido con una jugada legal, revisala si quieres";
                list.appendChild(li);
            }
            list.scrollTop = list.scrollHeight;
        }

        function currentMoveLabel() {
            const ply = game.history().length;
            const moveNumber = Math.floor(ply / 2) + 1;
            const side = ply % 2 === 0 ? "blancas" : "negras";
            return { moveNumber, side };
        }

        function startProcessing(rawTokens) {
            game = new Chess();
            tokens = rawTokens;
            tokenIndex = 0;
            guessedPlies = new Set();
            document.getElementById("process-section").classList.remove("hidden");
            document.getElementById("result-section").classList.add("hidden");
            document.getElementById("move-list").innerHTML = "";
            updateBoardPreview();
            processNext();
        }

        function processNext() {
            if (tokenIndex >= tokens.length) { finishProcessing(); return; }
            const raw = tokens[tokenIndex];
            const { moveNumber, side } = currentMoveLabel();
            updateProcessStatus(`Leyendo jugada ${moveNumber} de las ${side}: "${raw}"…`);
            const move = tryParseMove(game, raw);
            if (move) {
                tokenIndex++;
                updateBoardPreview();
                updateMoveList();
                processNext();
                return;
            }
            // El texto no calzó con ninguna variante de notación tal cual: en vez de
            // detenerse a preguntar, se fuerza la jugada legal más parecida (ver
            // forceMatchLegalMove) y se sigue de largo. Solo si eso tampoco devuelve nada
            // (texto sin forma de jugada, o ya no quedan jugadas legales) se descarta el
            // texto sin tocar la partida y se sigue con el siguiente.
            const guess = forceMatchLegalMove(game, raw);
            if (guess) {
                guessedPlies.add(game.history().length);
                game.move(guess);
                tokenIndex++;
                updateBoardPreview();
                updateMoveList();
                processNext();
                return;
            }
            tokenIndex++;
            processNext();
        }

        function finishProcessing() {
            const pgn = game.pgn();
            const guessNote = guessedPlies.size
                ? ` (${guessedPlies.size} adivinada${guessedPlies.size === 1 ? "" : "s"} por parecido — están marcadas con "≈" en la lista, conviene repasarlas)`
                : "";
            updateProcessStatus(`Listo — ${game.history().length} jugadas leídas${guessNote}.`);
            document.getElementById("pgn-output").value = pgn;
            document.getElementById("result-section").classList.remove("hidden");
            document.getElementById("save-status").textContent = "";
            document.getElementById("result-section").scrollIntoView({ behavior: "smooth", block: "start" });
        }

        /* ============================================================
           Paso 1: elegir imagen + lanzar el OCR
           ============================================================ */
        let selectedFile = null;

        function handleFileSelected(file) {
            selectedFile = file || null;
            document.getElementById("read-btn").disabled = !selectedFile;
            const preview = document.getElementById("sheet-preview");
            const wrap = document.getElementById("preview-wrap");
            if (selectedFile) {
                preview.src = URL.createObjectURL(selectedFile);
                wrap.classList.remove("hidden");
            } else {
                wrap.classList.add("hidden");
            }
        }
        // Los dos inputs (cámara y archivos) comparten el mismo manejo: no importa de
        // dónde vino la imagen, una vez elegida el resto del flujo es idéntico.
        document.getElementById("sheet-input-camera").addEventListener("change", (e) => handleFileSelected(e.target.files[0]));
        document.getElementById("sheet-input-file").addEventListener("change", (e) => handleFileSelected(e.target.files[0]));

        document.getElementById("read-btn").addEventListener("click", async () => {
            if (!selectedFile) return;
            const readBtn = document.getElementById("read-btn");
            readBtn.disabled = true;
            const progressWrap = document.getElementById("ocr-progress-wrap");
            const progressBar = document.getElementById("ocr-progress-bar");
            const progressText = document.getElementById("ocr-progress-text");
            progressWrap.classList.remove("hidden");
            progressBar.style.width = "30%";
            progressText.textContent = "Preparando la imagen…";

            try {
                progressBar.style.width = "60%";
                progressText.textContent = "Leyendo la planilla…";
                const data = await runOcr(selectedFile);
                progressBar.style.width = "100%";
                const moveTokens = reconstructMoveTokens(data.words);
                progressWrap.classList.add("hidden");
                if (!moveTokens.length) {
                    progressText.textContent = "";
                    Avisos.avisar("No encontré texto legible en la imagen. Prueba con una foto más nítida y bien iluminada.", { tipo: "error" });
                    readBtn.disabled = false;
                    return;
                }
                startProcessing(moveTokens);
            } catch (err) {
                console.error(err);
                progressWrap.classList.add("hidden");
                Avisos.avisar("No se pudo leer la imagen: " + (err && err.message ? err.message : "error desconocido") + ". Prueba de nuevo.", { tipo: "error" });
                readBtn.disabled = false;
            }
        });

        /* ============================================================
           Paso 3: acciones sobre el PGN final
           ============================================================ */
        document.getElementById("copy-pgn-btn").addEventListener("click", async () => {
            const text = document.getElementById("pgn-output").value;
            try {
                await navigator.clipboard.writeText(text);
                document.getElementById("save-status").textContent = "PGN copiado.";
            } catch (e) {
                document.getElementById("pgn-output").select();
                document.execCommand("copy");
            }
        });

        document.getElementById("download-pgn-btn").addEventListener("click", () => {
            downloadText("planilla-" + new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }) + ".pgn", document.getElementById("pgn-output").value);
        });

        document.getElementById("save-shared-btn").addEventListener("click", async () => {
            const statusEl = document.getElementById("save-status");
            const pgn = document.getElementById("pgn-output").value;
            const moveCount = game.history().length;
            statusEl.className = "text-xs mt-2 text-brand-450 dark:text-brand-350";
            statusEl.textContent = "Guardando…";
            const { error } = await sb.from("saved_games").insert({
                pgn, fen_final: game.fen(), move_count: moveCount, created_by: session.user.id,
            });
            if (error) {
                console.error(error);
                statusEl.className = "text-xs mt-2 text-red-600 dark:text-red-400";
                statusEl.textContent = "No se pudo guardar: " + error.message;
                return;
            }
            statusEl.className = "text-xs mt-2 text-green-600 dark:text-green-400";
            statusEl.textContent = "Guardado en Archivos.";
        });

        document.getElementById("restart-btn").addEventListener("click", () => {
            selectedFile = null;
            document.getElementById("sheet-input-camera").value = "";
            document.getElementById("sheet-input-file").value = "";
            document.getElementById("read-btn").disabled = true;
            document.getElementById("preview-wrap").classList.add("hidden");
            document.getElementById("process-section").classList.add("hidden");
            document.getElementById("result-section").classList.add("hidden");
            document.getElementById("upload-section").scrollIntoView({ behavior: "smooth", block: "start" });
        });

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html?next=" + encodeURIComponent("lector-planilla.html"); return; }
            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { document.getElementById("loading").textContent = "No se pudo cargar tu perfil."; return; }
            profile = profileData;
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    