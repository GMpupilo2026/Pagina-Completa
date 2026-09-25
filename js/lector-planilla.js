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

        /* ============================================================
           Tolerancia de notación: misma lógica que usa js/tablero-board.js
           para el cuadro de comandos del modo adaptado (letras de pieza en
           español, "x" de captura omitida, enroque con ceros, sufijo de
           promoción faltante) — acá hace falta lo mismo porque el texto que
           sale del lector automático (OCR) rara vez es notación SAN perfecta.
           ============================================================ */
        const ES_TO_EN_PIECE = { T: "R", C: "N", A: "B", D: "Q", R: "K" };
        const SAN_PIECE_LETTERS = "NBRQKTCAD";

        function mapSpanishPieceLetter(letter) {
            return ES_TO_EN_PIECE[letter.toUpperCase()] || letter.toUpperCase();
        }

        function generateMoveCandidates(raw) {
            let s = String(raw || "").trim();
            s = s.replace(/^\d+\.(\.\.)?\s*/, ""); // por si el OCR incluyó el número de jugada ("14.Cf3")
            s = s.replace(/\s+/g, "");
            if (!s) return [];

            const candidates = new Set();
            candidates.add(s);

            if (/^0-0-0[+#]?$/.test(s) || /^0-0[+#]?$/.test(s)) candidates.add(s.replace(/0/g, "O"));
            // El OCR confunde fácilmente O (letra) con 0 (cero) en el enroque, y también con
            // D (que en notación española es la Dama) — probar las 3 lecturas más comunes.
            if (/^[0OD]-[0OD]([+#]?|-[0OD][+#]?)$/.test(s.toUpperCase())) candidates.add(s.toUpperCase().replace(/[0D]/g, "O"));

            const first = s[0];
            if (first && SAN_PIECE_LETTERS.indexOf(first.toUpperCase()) !== -1 && s.length >= 3) {
                candidates.add(first.toUpperCase() + s.slice(1));
                candidates.add(mapSpanishPieceLetter(first) + s.slice(1));
            }

            const promoMatch = s.match(/=([a-zA-Z])([+#]?)$/);
            if (promoMatch) {
                candidates.add(s.replace(/=([a-zA-Z])([+#]?)$/, "=" + mapSpanishPieceLetter(promoMatch[1]) + promoMatch[2]));
            }

            const expanded = new Set(candidates);
            for (const c of candidates) {
                const pawnCaptureNoX = c.match(/^([a-h])([a-h])([1-8])([+#]?)$/);
                if (pawnCaptureNoX) expanded.add(`${pawnCaptureNoX[1]}x${pawnCaptureNoX[2]}${pawnCaptureNoX[3]}${pawnCaptureNoX[4]}`);

                const pieceNoX = c.match(/^([NBRQK])([a-h])([1-8])([+#]?)$/);
                if (pieceNoX) expanded.add(`${pieceNoX[1]}x${pieceNoX[2]}${pieceNoX[3]}${pieceNoX[4]}`);

                const pieceDisambigNoX = c.match(/^([NBRQK])([a-h1-8])([a-h])([1-8])([+#]?)$/);
                if (pieceDisambigNoX) {
                    expanded.add(`${pieceDisambigNoX[1]}${pieceDisambigNoX[2]}x${pieceDisambigNoX[3]}${pieceDisambigNoX[4]}${pieceDisambigNoX[5]}`);
                }

                const pawnPromoNoSuffix = c.match(/^([a-h](x[a-h])?[18])([+#]?)$/);
                if (pawnPromoNoSuffix && !/=/.test(c)) expanded.add(`${pawnPromoNoSuffix[1]}=Q${pawnPromoNoSuffix[3]}`);
            }

            return Array.from(expanded);
        }

        function tryParseMove(game, raw) {
            const candidates = generateMoveCandidates(raw);
            for (const candidate of candidates) {
                let result = null;
                try { result = game.move(candidate, { sloppy: true }); } catch (e) {}
                if (result) return result;
            }
            return null;
        }

        /* ============================================================
           Segundo intento cuando tryParseMove() no entendió el texto tal
           cual: en vez de detenerse a preguntar, se fuerza una lectura
           comparando el texto crudo del OCR contra las jugadas LEGALES de
           la posición actual (game.moves(), normalmente 20-40 en una
           posición típica) por distancia de edición, y quedándose SIEMPRE
           con la más parecida, sin excepción por forma o largo del texto
           — la idea es que el lector tenga que "entender sí o sí" la
           posición, nunca quedarse esperando una respuesta. La única vez
           que no se fuerza nada es cuando ya no queda ninguna jugada legal
           (partida terminada) o no hay ningún texto que comparar (palabra
           vacía) — ahí no hay nada que forzar, literalmente. */
        function levenshtein(a, b) {
            const m = a.length, n = b.length;
            const dp = new Array(n + 1);
            for (let j = 0; j <= n; j++) dp[j] = j;
            for (let i = 1; i <= m; i++) {
                let prev = dp[0];
                dp[0] = i;
                for (let j = 1; j <= n; j++) {
                    const tmp = dp[j];
                    dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
                    prev = tmp;
                }
            }
            return dp[n];
        }

        function forceMatchLegalMove(game, raw) {
            const cleaned = String(raw || "").replace(/^\d+\.(\.\.)?\s*/, "").replace(/\s+/g, "").toLowerCase();
            if (!cleaned) return null; // no había ningún texto que comparar
            const legal = game.moves();
            if (!legal.length) return null; // no quedan jugadas legales: la partida ya terminó

            let best = null, bestDist = Infinity;
            legal.forEach((san) => {
                const d = levenshtein(cleaned, san.toLowerCase());
                if (d < bestDist) { bestDist = d; best = san; }
            });
            return best;
        }

        /* ============================================================
           Reconstrucción del orden real de las jugadas a partir de las
           palabras que devuelve el OCR (cada una con su posición en la
           imagen). Una planilla típica tiene una fila por número de jugada,
           con la jugada de blancas y la de negras una al lado de la otra —
           pero el orden en el que el OCR "lee" el texto no siempre
           respeta ese orden real (sobre todo si hay más de una columna de
           filas, o si la foto no salió perfectamente derecha). Agrupar por
           posición vertical (fila) y ordenar cada fila de izquierda a
           derecha reconstruye el orden real sin depender de eso.
           ============================================================ */
        function reconstructMoveTokens(words) {
            const valid = (words || []).filter((w) => w.text && w.text.trim());
            if (!valid.length) return [];

            const avgHeight = valid.reduce((s, w) => s + Math.max(1, w.bbox.y1 - w.bbox.y0), 0) / valid.length;
            const rowTolerance = avgHeight * 0.6;

            const rows = [];
            valid.forEach((w) => {
                const yCenter = (w.bbox.y0 + w.bbox.y1) / 2;
                let row = rows.find((r) => Math.abs(r.yCenter - yCenter) < rowTolerance);
                if (!row) { row = { yCenter, words: [] }; rows.push(row); }
                row.words.push(w);
                row.yCenter = (row.yCenter * (row.words.length - 1) + yCenter) / row.words.length;
            });
            rows.sort((a, b) => a.yCenter - b.yCenter);
            rows.forEach((r) => r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0));

            const tokens = [];
            rows.forEach((row) => {
                row.words.forEach((w) => {
                    const t = w.text.trim();
                    if (/^\d+[.):-]{0,2}$/.test(t)) return; // número de jugada suelto ("12.", "12)")
                    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) return; // marcador de resultado
                    tokens.push(t);
                });
            });
            return tokens;
        }

        /* ============================================================
           Lectura del OCR: Google Cloud Vision (DOCUMENT_TEXT_DETECTION), a
           través de la función de servidor ocr-scoresheet — la clave de
           Vision se queda ahí, nunca llega al navegador.
           Antes esto corría con Tesseract.js directo en el navegador (gratis,
           sin backend), pero probado contra una planilla real de torneo no
           sirvió: Tesseract está entrenado para texto IMPRESO, y ni una celda
           aislada y nítida con "e4" escrito a mano se leyó bien (salió
           "+6R565"). Vision sí reconoce letra manuscrita.
           Antes de subir la foto se la redimensiona en un <canvas> (lado más
           largo a 1600px): de sobra para que las casillas se sigan leyendo
           bien, y así la subida es rápida incluso con fotos de varios MB. */
        function fileToResizedBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
                reader.onload = () => {
                    const img = new Image();
                    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
                    img.onload = () => {
                        const MAX_SIDE = 1600;
                        let { width, height } = img;
                        if (width > MAX_SIDE || height > MAX_SIDE) {
                            const scale = MAX_SIDE / Math.max(width, height);
                            width = Math.round(width * scale);
                            height = Math.round(height * scale);
                        }
                        const canvas = document.createElement("canvas");
                        canvas.width = width;
                        canvas.height = height;
                        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
                    };
                    img.src = reader.result;
                };
                reader.readAsDataURL(file);
            });
        }

        async function runOcr(file) {
            const image_base64 = await fileToResizedBase64(file);
            const res = await fetch(`${window.SUPABASE_URL}/functions/v1/ocr-scoresheet`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                    "apikey": window.SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ image_base64 }),
            });
            const result = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(result.error || "No se pudo leer la imagen.");
            return { words: result.words || [] };
        }

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
            downloadText("planilla-" + new Date().toISOString().slice(0, 10) + ".pgn", document.getElementById("pgn-output").value);
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
    