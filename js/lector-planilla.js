/* El código de lector-planilla.html: la foto de una planilla → la partida en PGN.

   Arma la partida con el mismo lector del Centroamericano y de Pareo
   Integral (js/planilla-reconstruir.js): las celdas salen de los NÚMEROS
   IMPRESOS de la planilla (hojasDeLaFoto) y la partida es la continuación
   LEGAL que mejor explica todo lo escrito (reconstruir, en su propio hilo:
   js/planilla-reconstruir-worker.js). Antes se leía por filas de toda la foto
   y cada texto se cambiaba por la jugada legal más parecida: con una planilla
   de tres columnas (1-20, 21-40, 41-60) la jugada 1 quedaba al lado de la 21 y
   la 41, y el 17/11 una planilla real salió con 111 jugadas, 109 de ellas
   «adivinadas» sin sentido. Ver «El Lector de planilla lee por columnas» en
   docs/decisiones/juegos-y-torneos.md.

   Lo que no tiene salida queda «ilegible desde la jugada N», con lo escrito
   tal cual: no se le inventan jugadas. Cada jugada dice cómo se leyó (sin
   marca, * corregida, ? dudosa), escrito y no solo en color. */

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

        const ESTADO_TXT = { leida: "leída tal cual", corregida: "corregida", dudosa: "dudosa" };
        const MARCA = { leida: "", corregida: " *", dudosa: " ?" };
        const hoyCR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
        // «la jugada 12 de las negras», con la media jugada contada desde 0
        const deQuien = (ply) => "jugada " + (Math.floor(ply / 2) + 1) + (ply % 2 ? " de las negras" : " de las blancas");

        /* ============================================================
           La partida leída
           ============================================================ */
        let game = null;        // la partida armada (chess.js)
        let resultado = null;   // lo que devolvió reconstruir()
        let lectura = null;     // { leida, metodo, hojas, resultado, palabras }: para «Descargar la lectura»
        let processBoard = null;

        function updateProcessStatus(text) {
            document.getElementById("process-status").textContent = text;
        }

        function pintarTablero() {
            if (!processBoard) {
                processBoard = new ClasesBoard(document.getElementById("process-board"), { interactive: false });
            }
            processBoard.loadMoves(game.history());
        }

        // Una media jugada: la jugada en español con su marca escrita y, para el lector de pantalla,
        // cómo se leyó y qué decía la planilla (el title solo lo ve quien pasa el ratón).
        function jugadaEl(j) {
            const s = document.createElement("span");
            s.className = "lp-jugada";
            s.dataset.estado = j.estado;
            const escrito = j.escrito && j.escrito.length ? "«" + j.escrito.join("» y «") + "»" : "";
            s.title = ESTADO_TXT[j.estado] + (escrito ? " · en la planilla: " + escrito : "");
            s.append(PlanillaOcr.sanEnEspanol(j.san) + MARCA[j.estado]);
            if (j.estado !== "leida") {
                const sr = document.createElement("span");
                sr.className = "sr-only";
                sr.textContent = " (" + ESTADO_TXT[j.estado] + (escrito ? "; en la planilla: " + escrito : "") + ")";
                s.append(sr);
            }
            return s;
        }

        function pintarLista() {
            const list = document.getElementById("move-list");
            list.replaceChildren();
            const js = resultado.jugadas;
            for (let i = 0; i < js.length; i += 2) {
                const li = document.createElement("li");
                li.append((i / 2 + 1) + ". ", jugadaEl(js[i]));
                if (js[i + 1]) li.append("  ", jugadaEl(js[i + 1]));
                list.appendChild(li);
            }
        }

        function pintarResumen() {
            const r = resultado, js = r.jugadas;
            const cuenta = (e) => js.filter((j) => j.estado === e).length;
            document.getElementById("resumen").textContent =
                js.length + " medias jugadas: " + cuenta("leida") + " leídas tal cual · " + cuenta("corregida") + " corregidas (*) · "
                + cuenta("dudosa") + " dudosas (?)" + (r.hojas > 1 ? " · se leyeron " + r.hojas + " planillas" : "") + ".";
            const caja = document.getElementById("ilegible");
            if (r.ilegibleDesde === null) { caja.classList.add("hidden"); return; }
            document.getElementById("ilegible-titulo").textContent = "⚠ Ilegible desde la " + deQuien(r.ilegibleDesde) + ".";
            const ul = document.getElementById("ilegible-resto");
            ul.replaceChildren();
            (r.resto || []).forEach((h, k) => {
                if (!h.length) return;
                const li = document.createElement("li");
                li.textContent = (r.hojas > 1 ? "Planilla " + (k + 1) + ": " : "") + h.join(" · ");
                ul.appendChild(li);
            });
            if (!ul.children.length) {
                const li = document.createElement("li");
                li.textContent = "(nada legible)";
                ul.appendChild(li);
            }
            caja.classList.remove("hidden");
        }

        function mostrarPartida(r, metodo) {
            resultado = r;
            game = new Chess();
            r.jugadas.forEach((j) => game.move(j.san));
            pintarTablero();
            pintarLista();
            pintarResumen();
            const n = r.jugadas.length;
            updateProcessStatus(
                (n ? "Listo: " + n + " medias jugadas armadas de la planilla." : "No se pudo armar ninguna jugada de la planilla.")
                + (metodo === "filas" ? " No encontré los números impresos de la planilla, así que se leyó por filas: revisa bien el orden." : ""));
            // El resultado no se lee de la casilla de la planilla: solo se pone si la partida termina en mate.
            const cab = { Date: hoyCR().replace(/-/g, "."), Annotator: "Lector de planilla de Ajedrez Integral" };
            if (r.ilegibleDesde === null && game.in_checkmate()) cab.Result = game.turn() === "w" ? "0-1" : "1-0";
            document.getElementById("pgn-output").value = PlanillaReconstruir.aPgn(Chess, r, cab);
            document.getElementById("result-section").classList.remove("hidden");
            document.getElementById("save-status").textContent = "";
            document.getElementById("process-section").scrollIntoView({ behavior: "smooth", block: "start" });
        }

        /* ============================================================
           Paso 1: elegir imagen + leerla
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
            const progreso = (porc, texto) => { progressBar.style.width = porc + "%"; progressText.textContent = texto; };
            progressWrap.classList.remove("hidden");
            document.getElementById("process-section").classList.add("hidden");
            document.getElementById("result-section").classList.add("hidden");
            progreso(10, "Leyendo la letra de la planilla…");

            try {
                // El token se pide en el momento (js/token-sesion.js). A 2600 px de lado, como en el
                // Centroamericano: con la planilla en tres bloques, a 1600 la letra queda chica.
                let words;
                try {
                    ({ words } = await PlanillaOcr.leerFoto(selectedFile, await window.tokenDeSesion(), { maxLado: 2600 }));
                } catch (e) {
                    // «Failed to fetch»: la función no contestó (se cayó, se pasó de tiempo o le falta la clave de Google Vision).
                    if (/failed to fetch|networkerror|load failed/i.test(String(e && e.message))) {
                        throw new Error("el lector de planillas no contestó. Puede que el servicio de lectura (Google Vision) no esté configurado o se haya caído: avísale a administración");
                    }
                    throw e;
                }
                const { hojas, metodo } = PlanillaReconstruir.hojasDeLaFoto(words || []);
                if (!hojas.length) {
                    progressWrap.classList.add("hidden");
                    Avisos.avisar("No encontré nada escrito en la imagen. Prueba con una foto más nítida y bien iluminada.", { tipo: "error" });
                    readBtn.disabled = false;
                    return;
                }
                progreso(40, "Armando la partida… 0 %");
                const r = await PlanillaReconstruir.enHilo(hojas, (x) => progreso(40 + Math.round(x * 60), "Armando la partida… " + Math.round(x * 100) + " %"));
                progressWrap.classList.add("hidden");
                document.getElementById("process-section").classList.remove("hidden");
                lectura = { leida: new Date().toISOString(), metodo, hojas, resultado: r, palabras: words || [] };
                mostrarPartida(r, metodo);
                readBtn.disabled = false;
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
            downloadText("planilla-" + hoyCR() + ".pgn", document.getElementById("pgn-output").value);
        });

        /* «Descargar la lectura»: lo que leyó Google Vision de la foto (cada palabra con su caja), las celdas y
           la partida que salió, para ver por qué una jugada se leyó mal (el 17/11 no se pudo saber qué había
           leído en la celda de «Cf6»). Lo arma PlanillaReconstruir.lectura(), la misma del Centroamericano. */
        document.getElementById("download-lectura-btn").addEventListener("click", () => {
            if (!lectura) return;
            const json = JSON.stringify(PlanillaReconstruir.lectura("Lectura de la foto de una planilla (Lector de planilla)", {}, lectura), null, 1);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "lectura-planilla-" + hoyCR() + ".json";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });

        document.getElementById("save-shared-btn").addEventListener("click", async () => {
            const statusEl = document.getElementById("save-status");
            const pgn = document.getElementById("pgn-output").value;
            // Lo que se guarda es lo que dice el cuadro (se puede corregir a mano), así que la posición final y
            // la cuenta salen de ahí, no de lo leído: si no, se guardaba un PGN con el final de otra partida.
            const guardada = new Chess();
            if (!guardada.load_pgn(pgn, { sloppy: true })) {
                statusEl.className = "text-xs mt-2 text-red-700 dark:text-red-300";
                statusEl.textContent = "El PGN tiene un error (una jugada ilegal o mal escrita; en el PGN las piezas van en inglés: N, B, R, Q, K): corrígelo antes de guardarlo.";
                return;
            }
            statusEl.className = "text-xs mt-2 text-brand-450 dark:text-brand-350";
            statusEl.textContent = "Guardando…";
            const { error } = await sb.from("saved_games").insert({
                pgn, fen_final: guardada.fen(), move_count: guardada.history().length, created_by: session.user.id,
            });
            if (error) {
                console.error(error);
                statusEl.className = "text-xs mt-2 text-red-700 dark:text-red-300";
                statusEl.textContent = "No se pudo guardar: " + error.message;
                return;
            }
            statusEl.className = "text-xs mt-2 text-green-700 dark:text-green-300";
            statusEl.textContent = "Guardado en Archivos.";
        });

        document.getElementById("restart-btn").addEventListener("click", () => {
            selectedFile = null;
            lectura = null;
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

/*! rev bfb5bbb0d2d82f9f */
