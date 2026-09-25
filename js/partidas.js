/* El código de partidas.html.

   Vivía escrito dentro de la página, en un <script> de 23 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null, isTeacher = false, isAdmin = false, viewBoard = null;
        let archivosProfesores = {}; // id de profesor -> nombre, solo para cuando administración ve archivos de varios

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

        function openViewer(g) {
            document.getElementById("view-modal-title").textContent = (g.title || new Date(g.created_at).toLocaleString("es-CR")) + " · " + g.move_count + " jugadas";
            document.getElementById("view-modal").classList.remove("hidden");
            if (!viewBoard) viewBoard = new ClasesBoard(document.getElementById("view-board"), { interactive: false });
            const game = new Chess();
            game.load_pgn(g.pgn, { sloppy: true });
            // Un ejercicio suelto (como los que trae un PGN de posiciones) arranca de
            // un FEN propio, no del inicial: sin pasarlo, el tablero repetía las jugadas
            // desde la posición de siempre y mostraba un ejercicio que no era el que dice.
            const headers = typeof game.header === "function" ? game.header() : {};
            viewBoard.loadMoves(game.history(), headers.FEN || null);
        }
        document.getElementById("view-close-btn").addEventListener("click", () => document.getElementById("view-modal").classList.add("hidden"));

        function renderGames(games) {
            const list = document.getElementById("games-list");
            list.innerHTML = "";
            document.getElementById("empty-state").classList.toggle("hidden", games.length > 0);
            games.forEach((g) => {
                const li = document.createElement("li");
                li.className = "bg-white dark:bg-brand-900 rounded-xl shadow-md p-4 flex items-center justify-between gap-3 flex-wrap";
                const info = document.createElement("div");
                const title = document.createElement("h2");
                title.className = "font-semibold text-brand-800 dark:text-white";
                title.textContent = g.title || new Date(g.created_at).toLocaleDateString("es-CR", { day: "2-digit", month: "long", year: "numeric" });
                const meta = document.createElement("p");
                meta.className = "text-xs text-brand-450 dark:text-brand-350";
                meta.textContent = g.move_count + " jugadas · guardada el " + new Date(g.created_at).toLocaleString("es-CR");
                info.append(title, meta);

                const actions = document.createElement("div");
                actions.className = "flex items-center gap-2 shrink-0";
                const viewBtn = document.createElement("button");
                viewBtn.type = "button";
                viewBtn.className = "text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors";
                viewBtn.textContent = "Ver tablero";
                viewBtn.addEventListener("click", () => openViewer(g));
                const dlBtn = document.createElement("button");
                dlBtn.type = "button";
                dlBtn.className = "text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors";
                dlBtn.textContent = "Descargar PGN";
                dlBtn.addEventListener("click", () => downloadText("clase-" + g.id.slice(0, 8) + ".pgn", g.pgn));
                actions.append(viewBtn, dlBtn);

                if (isTeacher) {
                    const delBtn = document.createElement("button");
                    delBtn.type = "button";
                    delBtn.className = "text-xs text-red-600 dark:text-red-400 hover:underline";
                    delBtn.textContent = "Eliminar";
                    delBtn.addEventListener("click", async () => {
                        if (!(await Avisos.confirmar("No se puede deshacer.", { titulo: "¿Eliminar esta partida guardada?", aceptar: "Eliminar", peligro: true }))) return;
                        await sb.from("saved_games").delete().eq("id", g.id);
                        loadGames();
                    });
                    actions.appendChild(delBtn);
                }

                li.append(info, actions);
                list.appendChild(li);
            });
        }

        // ---------- Tus PGN subidos (archivos_pgn) ----------
        // Un .pgn puede traer varias partidas seguidas, cada una con sus propias
        // etiquetas [Event ...]: se separan ahí para guardar cada una por su cuenta,
        // que es como se pueden "jalar" una por una a la clase después.
        function splitPgnGames(text) {
            const trimmed = text.replace(/\r\n/g, "\n").trim();
            if (!trimmed) return [];
            return trimmed.split(/\n(?=\[Event\s)/i).map((c) => c.trim()).filter(Boolean);
        }

        function parsePgnChunk(chunk) {
            const game = new Chess();
            if (!game.load_pgn(chunk, { sloppy: true })) return null;
            const moves = game.history();
            if (!moves.length) return null; // sin jugadas no hay nada que jalar a la clase
            const headers = game.header();
            let titulo = null;
            if (headers.White && headers.Black && headers.White !== "?" && headers.Black !== "?") {
                titulo = headers.White + " vs " + headers.Black;
            } else if (headers.Event && headers.Event !== "?") {
                titulo = headers.Event;
            }
            return { pgn: chunk, titulo, move_count: moves.length, fen_final: game.fen() };
        }

        function openArchivoViewer(a) {
            openViewer({ title: a.titulo, created_at: a.created_at, move_count: a.move_count, pgn: a.pgn });
        }

        // ---------- Carpetas: puro texto (como profiles.grupo), sin tabla aparte ----------
        // Ordenan la lista cuando ya hay muchos PGN subidos; no cambian ningún permiso.
        let archivosSeleccionados = new Set(); // ids marcados para mover, descargar o borrar en lote
        let archivosCarpetasConocidas = []; // nombres ya usados, para los selectores y el datalist
        let ultimosArchivosCargados = []; // última lista traída, para "Seleccionar todas" y armar la descarga en lote

        function nombresDeCarpetas(archivos) {
            return [...new Set(archivos.map((a) => a.carpeta).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
        }

        function llenarSelectorCarpetas(select, carpetas, valorActual) {
            select.innerHTML = "";
            const optSin = document.createElement("option"); optSin.value = ""; optSin.textContent = "Sin carpeta";
            select.appendChild(optSin);
            carpetas.forEach((n) => { const o = document.createElement("option"); o.value = n; o.textContent = n; select.appendChild(o); });
            const optNueva = document.createElement("option"); optNueva.value = "__nueva__"; optNueva.textContent = "+ Nueva carpeta…";
            select.appendChild(optNueva);
            select.value = valorActual || "";
        }

        async function pedirNombreDeCarpetaNueva() {
            const nombre = ((await Avisos.pedir("", { titulo: "Carpeta nueva", etiqueta: "Nombre de la carpeta", aceptar: "Crear" })) || "").trim();
            return nombre || null;
        }

        async function moverArchivos(ids, carpeta) {
            const { error } = await sb.from("archivos_pgn").update({ carpeta: carpeta || null }).in("id", ids);
            if (error) { Avisos.avisar("No se pudo mover: " + error.message, { tipo: "error" }); return false; }
            return true;
        }

        // Un solo archivo .pgn con todas las partidas elegidas, para bajarlas de una
        // sola vez en vez de un clic por cada una.
        function descargarSeleccionArchivos() {
            const elegidos = ultimosArchivosCargados.filter((a) => archivosSeleccionados.has(a.id));
            if (!elegidos.length) return;
            const texto = elegidos.map((a) => a.pgn.trim()).join("\n\n");
            downloadText("archivos-pgn-" + new Date().toISOString().slice(0, 10) + ".pgn", texto);
        }

        async function eliminarSeleccionArchivos() {
            const ids = [...archivosSeleccionados];
            if (!ids.length) return;
            if (!(await eliminarPgn(ids))) return;
            archivosSeleccionados.clear();
            await loadArchivos();
        }

        /* Borrar un PGN propio no pregunta: se borra y el aviso ofrece
           «Deshacer», que lo vuelve a insertar tal cual (mismo id, misma
           carpeta, misma fecha). Es seguro porque la fila no tiene nada que
           cuelgue de ella. La política de insert exige profesor_id =
           auth.uid(), así que el PGN de OTRO profesor (lo que borra quien
           administra) no se puede devolver: ahí se pregunta antes, como
           siempre. */
        async function eliminarPgn(ids) {
            const { data: filas, error: eLeer } = await sb.from("archivos_pgn").select("*").in("id", ids);
            if (eLeer) { Avisos.avisar("No se pudo eliminar: " + eLeer.message, { tipo: "error" }); return false; }
            const todosMios = (filas || []).every((a) => a.profesor_id === session.user.id);
            const cuales = ids.length === 1 ? "este PGN" : "estos " + ids.length + " PGN";
            if (!todosMios && !(await Avisos.confirmar("No es tuyo, así que no se puede deshacer.",
                    { titulo: "¿Eliminar " + cuales + "?", aceptar: "Eliminar", peligro: true }))) return false;
            const { error } = await sb.from("archivos_pgn").delete().in("id", ids);
            if (error) { Avisos.avisar("No se pudo eliminar: " + error.message, { tipo: "error" }); return false; }
            const hecho = ids.length === 1 ? "PGN eliminado." : ids.length + " PGN eliminados.";
            Avisos.avisar(hecho, !todosMios ? {} : {
                deshacer: async () => {
                    const { error: eVolver } = await sb.from("archivos_pgn").insert(filas);
                    if (eVolver) throw eVolver;
                    Avisos.avisar(ids.length === 1 ? "PGN recuperado." : ids.length + " PGN recuperados.");
                    await loadArchivos();
                },
            });
            return true;
        }

        function actualizarBarraSeleccion() {
            const bar = document.getElementById("archivos-bulk-bar");
            const n = archivosSeleccionados.size;
            bar.classList.toggle("hidden", n === 0);
            if (n === 0) return;
            document.getElementById("archivos-bulk-count").textContent = n === 1 ? "1 seleccionado" : n + " seleccionados";
            llenarSelectorCarpetas(document.getElementById("archivos-bulk-carpeta"), archivosCarpetasConocidas, "");
        }

        function renderArchivoItem(a, carpetas) {
            const li = document.createElement("li");
            li.className = "bg-white dark:bg-brand-900 rounded-xl shadow-md p-4 flex items-center justify-between gap-3 flex-wrap";
            const puedeGestionar = isAdmin || a.profesor_id === session.user.id;

            if (puedeGestionar) {
                const check = document.createElement("input");
                check.type = "checkbox";
                check.className = "shrink-0";
                check.setAttribute("aria-label", "Seleccionar " + a.titulo);
                check.checked = archivosSeleccionados.has(a.id);
                check.addEventListener("change", () => {
                    if (check.checked) archivosSeleccionados.add(a.id); else archivosSeleccionados.delete(a.id);
                    actualizarBarraSeleccion();
                });
                li.appendChild(check);
            }

            const info = document.createElement("div");
            info.className = "min-w-0";
            const title = document.createElement("h3");
            title.className = "font-semibold text-brand-800 dark:text-white";
            title.textContent = a.titulo;
            const meta = document.createElement("p");
            meta.className = "text-xs text-brand-450 dark:text-brand-350";
            let metaTxt = a.move_count + " jugadas · de " + a.nombre_archivo;
            if (a.profesor_id !== session.user.id && archivosProfesores[a.profesor_id]) {
                metaTxt += " · subido por " + archivosProfesores[a.profesor_id];
            }
            meta.textContent = metaTxt;
            info.append(title, meta);

            const actions = document.createElement("div");
            actions.className = "flex items-center gap-2 shrink-0 flex-wrap";
            const viewBtn = document.createElement("button");
            viewBtn.type = "button";
            viewBtn.className = "text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors";
            viewBtn.textContent = "Ver tablero";
            viewBtn.addEventListener("click", () => openArchivoViewer(a));
            const dlBtn = document.createElement("button");
            dlBtn.type = "button";
            dlBtn.className = "text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors";
            dlBtn.textContent = "Descargar PGN";
            dlBtn.addEventListener("click", () => downloadText(a.nombre_archivo, a.pgn));
            actions.append(viewBtn, dlBtn);

            if (puedeGestionar) {
                const moveSel = document.createElement("select");
                moveSel.className = "text-xs bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 text-brand-700 dark:text-brand-200 focus:outline-none focus:ring-2 focus:ring-accent-500";
                moveSel.setAttribute("aria-label", "Mover \"" + a.titulo + "\" a otra carpeta");
                llenarSelectorCarpetas(moveSel, carpetas, a.carpeta);
                moveSel.addEventListener("change", async () => {
                    let destino = moveSel.value;
                    if (destino === "__nueva__") {
                        destino = await pedirNombreDeCarpetaNueva();
                        if (!destino) { moveSel.value = a.carpeta || ""; return; }
                    }
                    const ok = await moverArchivos([a.id], destino);
                    if (ok) await loadArchivos(); else moveSel.value = a.carpeta || "";
                });
                actions.appendChild(moveSel);

                const delBtn = document.createElement("button");
                delBtn.type = "button";
                delBtn.className = "text-xs text-red-600 dark:text-red-400 hover:underline";
                delBtn.textContent = "Eliminar";
                delBtn.addEventListener("click", async () => {
                    if (!(await eliminarPgn([a.id]))) return;
                    archivosSeleccionados.delete(a.id);
                    loadArchivos();
                });
                actions.appendChild(delBtn);
            }

            li.append(info, actions);
            return li;
        }

        function renderCarpeta(nombre, lista, carpetas) {
            const det = document.createElement("details");
            det.className = "bg-brand-50 dark:bg-brand-800 rounded-xl overflow-hidden";
            det.open = !nombre; // "Sin carpeta" arranca abierta; las que tienen nombre, cerradas
            const summary = document.createElement("summary");
            summary.className = "cursor-pointer font-semibold text-brand-800 dark:text-white px-4 py-3 marker:text-accent-600";
            summary.textContent = (nombre ? "📁 " + nombre : "🗂️ Sin carpeta") + " (" + lista.length + ")";
            det.appendChild(summary);
            const ul = document.createElement("ul");
            ul.className = "space-y-3 px-4 pb-4";
            lista.forEach((a) => ul.appendChild(renderArchivoItem(a, carpetas)));
            det.appendChild(ul);
            return det;
        }

        function renderArchivos(archivos) {
            const wrap = document.getElementById("archivos-list");
            wrap.innerHTML = "";
            document.getElementById("archivos-empty-state").classList.toggle("hidden", archivos.length > 0);

            const porCarpeta = new Map(); // "" = sin carpeta
            archivos.forEach((a) => {
                const clave = a.carpeta || "";
                if (!porCarpeta.has(clave)) porCarpeta.set(clave, []);
                porCarpeta.get(clave).push(a);
            });
            archivosCarpetasConocidas.forEach((nombre) => {
                if (porCarpeta.has(nombre)) wrap.appendChild(renderCarpeta(nombre, porCarpeta.get(nombre), archivosCarpetasConocidas));
            });
            if (porCarpeta.has("")) wrap.appendChild(renderCarpeta(null, porCarpeta.get(""), archivosCarpetasConocidas));
        }

        async function loadArchivos() {
            const { data, error } = await sb.from("archivos_pgn").select("*").order("created_at", { ascending: false }).limit(200);
            if (error) { console.error(error); return; }
            const archivos = data || [];
            // Solo hace falta buscar nombres cuando se ve el PGN de OTRO profesor —
            // o sea, solo para administración, que es quien ve el espacio de todos.
            const otrosIds = [...new Set(archivos.filter((a) => a.profesor_id !== session.user.id).map((a) => a.profesor_id))];
            archivosProfesores = {};
            if (otrosIds.length) {
                const { data: perfiles } = await sb.from("profiles").select("id, full_name").in("id", otrosIds);
                (perfiles || []).forEach((p) => { archivosProfesores[p.id] = p.full_name || "otro profesor"; });
            }
            archivosCarpetasConocidas = nombresDeCarpetas(archivos);
            const datalist = document.getElementById("archivo-carpetas-datalist");
            datalist.innerHTML = "";
            archivosCarpetasConocidas.forEach((n) => { const opt = document.createElement("option"); opt.value = n; datalist.appendChild(opt); });
            ultimosArchivosCargados = archivos;
            document.getElementById("archivos-select-all-wrap").classList.toggle("hidden", archivos.length === 0);
            renderArchivos(archivos);
            actualizarBarraSeleccion();
        }

        function subscribeArchivos() {
            sb.channel("archivos-pgn-panel")
                .on("postgres_changes", { event: "*", schema: "public", table: "archivos_pgn" }, () => loadArchivos())
                .subscribe();
        }

        document.getElementById("archivos-bulk-mover-btn").addEventListener("click", async () => {
            const select = document.getElementById("archivos-bulk-carpeta");
            let destino = select.value;
            if (destino === "__nueva__") {
                destino = await pedirNombreDeCarpetaNueva();
                if (!destino) return;
            }
            const ids = [...archivosSeleccionados];
            if (!ids.length) return;
            const ok = await moverArchivos(ids, destino);
            if (ok) { archivosSeleccionados.clear(); await loadArchivos(); }
        });
        document.getElementById("archivos-bulk-descargar-btn").addEventListener("click", () => {
            descargarSeleccionArchivos();
        });
        document.getElementById("archivos-bulk-eliminar-btn").addEventListener("click", async () => {
            await eliminarSeleccionArchivos();
        });
        document.getElementById("archivos-bulk-cancelar-btn").addEventListener("click", async () => {
            archivosSeleccionados.clear();
            await loadArchivos();
        });
        document.getElementById("archivos-select-all-btn").addEventListener("click", () => {
            ultimosArchivosCargados.forEach((a) => {
                if (isAdmin || a.profesor_id === session.user.id) archivosSeleccionados.add(a.id);
            });
            renderArchivos(ultimosArchivosCargados);
            actualizarBarraSeleccion();
        });

        document.getElementById("archivo-pgn-input").addEventListener("change", async (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = ""; // para poder volver a elegir el mismo archivo si algo falla
            if (!files.length) return;
            const msg = document.getElementById("archivo-pgn-msg");
            const carpeta = document.getElementById("archivo-carpeta-input").value.trim() || null;
            msg.textContent = "Subiendo…";
            const filas = [];
            let invalidas = 0;
            for (const file of files) {
                const texto = await file.text();
                const partidas = splitPgnGames(texto);
                partidas.forEach((chunk, i) => {
                    const parsed = parsePgnChunk(chunk);
                    if (!parsed) { invalidas++; return; }
                    filas.push({
                        profesor_id: session.user.id,
                        nombre_archivo: file.name,
                        titulo: parsed.titulo || (file.name + (partidas.length > 1 ? " · partida " + (i + 1) : "")),
                        pgn: parsed.pgn,
                        move_count: parsed.move_count,
                        fen_final: parsed.fen_final,
                        carpeta,
                    });
                });
            }
            if (!filas.length) {
                msg.textContent = "Ninguno de los archivos se pudo leer como PGN.";
                return;
            }
            const { error } = await sb.from("archivos_pgn").insert(filas);
            if (error) { msg.textContent = "No se pudo subir: " + error.message; return; }
            const n = filas.length;
            msg.textContent = "Se " + (n === 1 ? "subió 1 partida" : "subieron " + n + " partidas") +
                (invalidas ? " (" + invalidas + " no se " + (invalidas === 1 ? "pudo" : "pudieron") + " leer)" : "") + ".";
            await loadArchivos();
        });

        async function loadGames() {
            const { data, error } = await sb.from("saved_games").select("*").order("created_at", { ascending: false }).limit(100);
            if (error) { console.error(error); return; }
            renderGames(data || []);
        }

        function subscribeGames() {
            sb.channel("saved-games-panel")
                .on("postgres_changes", { event: "*", schema: "public", table: "saved_games" }, () => loadGames())
                .subscribe();
        }

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html"; return; }
            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { document.getElementById("loading").textContent = "No se pudo cargar tu perfil."; return; }
            profile = profileData;
            isTeacher = profile.role === "profesor" || profile.is_admin === true;
            isAdmin = !!profile.is_admin;
            const puedeVerArchivos = isTeacher || isAdmin;
            document.getElementById("archivos-section").classList.toggle("hidden", !puedeVerArchivos);
            document.getElementById("archivos-upload-wrap").classList.toggle("hidden", !isTeacher);
            if (isAdmin && !isTeacher) document.getElementById("archivos-upload-desc").textContent = "Los PGN que sube cada profesor para dar clase.";
            if (puedeVerArchivos) await loadArchivos();
            await loadGames();
            if (puedeVerArchivos) subscribeArchivos();
            subscribeGames();
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    