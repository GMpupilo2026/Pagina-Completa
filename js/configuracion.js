/* El código de configuracion.html.

   Vivía escrito dentro de la página, en un <script> de 50 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null;

        document.getElementById("save-name-btn").addEventListener("click", async () => {
            const msg = document.getElementById("name-msg");
            const value = document.getElementById("full-name-input").value.trim();
            if (!value) { msg.textContent = "El nombre no puede estar vacío."; msg.className = "text-xs text-red-600 dark:text-red-400 mb-4"; return; }
            const { error } = await sb.from("profiles").update({ full_name: value }).eq("id", profile.id);
            if (error) { msg.textContent = error.message; msg.className = "text-xs text-red-600 dark:text-red-400 mb-4"; return; }
            profile.full_name = value;
            msg.textContent = "Nombre actualizado.";
            msg.className = "text-xs text-green-600 dark:text-green-400 mb-4";
        });

        document.getElementById("save-elo-btn").addEventListener("click", async () => {
            const msg = document.getElementById("elo-msg");
            const raw = document.getElementById("elo-input").value.trim();
            const tipo = document.getElementById("elo-tipo").value;
            let elo = null;
            if (raw) {
                elo = parseInt(raw, 10);
                if (!Number.isFinite(elo) || elo < 100 || elo > 3500) { msg.textContent = "El Elo tiene que ser un número entre 100 y 3500 (o dejarlo vacío)."; msg.className = "text-xs text-red-600 dark:text-red-400 mb-1"; return; }
            }
            const { error } = await sb.from("profiles").update({ elo, elo_tipo: elo ? tipo : null, elo_actualizado: new Date().toISOString() }).eq("id", profile.id);
            if (error) { msg.textContent = error.message; msg.className = "text-xs text-red-600 dark:text-red-400 mb-1"; return; }
            profile.elo = elo; profile.elo_tipo = elo ? tipo : null;
            msg.textContent = elo ? `Elo guardado: ${elo}. El próximo diagnóstico lo tendrá en cuenta.` : "Elo borrado.";
            msg.className = "text-xs text-green-600 dark:text-green-400 mb-1";
        });

        /* ---------------- Videollamada de tus clases ----------------
           Dónde vive: `profesor_videollamada`, una fila por (profesor, grupo).
           Es la SALA y no la clase porque la clase se abre sola —al entrar un
           alumno o al mandarse una posición—, así que un enlace que hubiera que
           escribir en cada clase se quedaría sin escribir y el botón del alumno
           no se desbloquearía nunca, sin dar ningún error.

           UNA SALA POR GRUPO, porque un profesor da clase en varias sedes y
           cada una tiene la suya. El reparto lo hace la base: a cada alumno le
           llega la de su grupo, y la general solo si su grupo no tiene una
           propia. Acá no se decide nada de eso — solo se escriben los enlaces.

           La forma del enlace se comprueba con la MISMA regla que el panel
           (`js/videollamada.js`), y otra vez en el CHECK de la tabla. Acá se
           comprueba para poder explicar qué está mal; en la base, para que no
           se pueda saltar. */
        const vllLista = document.getElementById("videollamada-lista");
        let vllSalas = {};      // grupo -> enlace guardado ("" es la general)
        let vllGrupos = [];     // los grupos con alumnos suyos, con su conteo

        function decirVll(grupo, texto, malo) {
            const msg = vllLista.querySelector(`[data-msg="${CSS.escape(grupo)}"]`);
            if (!msg) return;
            msg.textContent = texto;
            msg.className = "text-xs mt-1 " + (malo
                ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400");
        }

        /* Cada fila se arma entera y no se va prendiendo y apagando: así no hay
           que acordarse de limpiar el mensaje ni el botón de quitar de la
           anterior, que es el descuido que dejaría «Guardado» encima de una
           sala que ya no es esa. */
        function filaVll(grupo, titulo, nota) {
            const fila = document.createElement("div");
            fila.dataset.fila = grupo;

            const etiqueta = document.createElement("label");
            etiqueta.className = "block text-xs font-medium text-brand-500 dark:text-brand-300 mb-1";
            etiqueta.setAttribute("for", "vll-" + (grupo || "general"));
            etiqueta.textContent = titulo;
            if (nota) {
                const chica = document.createElement("span");
                chica.className = "font-normal text-brand-450 dark:text-brand-350";
                chica.textContent = " · " + nota;
                etiqueta.appendChild(chica);
            }

            const caja = document.createElement("div");
            caja.className = "flex gap-2 flex-wrap";
            const input = document.createElement("input");
            input.id = "vll-" + (grupo || "general");
            input.type = "url";
            input.inputMode = "url";
            input.autocapitalize = "none";
            input.setAttribute("autocorrect", "off");
            input.spellcheck = false;
            input.placeholder = "https://meet.google.com/abc-defg-hij";
            input.className = "flex-1 min-w-[16rem] px-3 py-2 rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500";
            input.value = vllSalas[grupo] || "";
            input.dataset.input = grupo;

            const guardar = document.createElement("button");
            guardar.className = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg transition-colors text-sm whitespace-nowrap";
            guardar.textContent = "Guardar";
            guardar.dataset.guardar = grupo;
            guardar.addEventListener("click", () => guardarVll(grupo));

            caja.append(input, guardar);
            if (vllSalas[grupo]) {
                const quitar = document.createElement("button");
                quitar.className = "border border-brand-200 dark:border-brand-700 hover:border-accent-400 text-brand-600 dark:text-brand-300 font-semibold px-4 py-2 rounded-lg transition-colors text-sm whitespace-nowrap";
                quitar.textContent = "Quitar";
                quitar.dataset.quitar = grupo;
                quitar.addEventListener("click", () => quitarVll(grupo));
                caja.appendChild(quitar);
            }

            const msg = document.createElement("p");
            msg.className = "text-xs mt-1";
            msg.dataset.msg = grupo;
            msg.setAttribute("role", "status");
            msg.setAttribute("aria-live", "polite");

            fila.append(etiqueta, caja, msg);
            return fila;
        }

        function pintarVll(mensajes) {
            vllLista.innerHTML = "";
            /* Los grupos van primero y la general al final: la general es el
               respaldo —la reciben los alumnos cuyo grupo no tenga sala
               propia—, y ponerla arriba haría pensar que es la que manda. */
            vllGrupos.forEach((g) => vllLista.appendChild(
                filaVll(g.grupo, "Clase de " + g.grupo,
                    g.alumnos === 1 ? "1 alumno" : g.alumnos + " alumnos")));
            vllLista.appendChild(filaVll("", "Para todas tus clases",
                vllGrupos.length ? "la reciben los grupos que no tengan sala propia" : ""));
            // El aviso de lo que acaba de pasar se vuelve a poner DESPUÉS de
            // repintar: escrito antes se muere con la fila que lo llevaba y no
            // lo lee nadie.
            Object.keys(mensajes || {}).forEach((g) => decirVll(g, mensajes[g].texto, mensajes[g].malo));
        }

        async function cargarVll(mensajes) {
            const [salas, grupos] = await Promise.all([
                sb.from("profesor_videollamada").select("grupo, enlace").eq("profesor_id", profile.id),
                sb.rpc("grupos_de_mis_alumnos"),
            ]);
            // Una lista vacía y una que no se pudo leer se ven igual y son cosas
            // muy distintas: la segunda se dice.
            vllSalas = {};
            (salas.data || []).forEach((f) => { vllSalas[f.grupo || ""] = f.enlace; });
            vllGrupos = grupos.data || [];
            pintarVll(salas.error ? { "": { texto: "No se pudieron leer tus enlaces: " + salas.error.message, malo: true } } : mensajes);
        }

        async function guardarVll(grupo) {
            const input = vllLista.querySelector(`[data-input="${CSS.escape(grupo)}"]`);
            const enlace = Videollamada.normalizar(input.value);
            if (!enlace) { decirVll(grupo, "Escribe el enlace de la sala, o usa «Quitar» para dejar de ofrecerla.", true); return; }
            if (!Videollamada.esSeguro(enlace)) {
                decirVll(grupo, "Ese enlace no sirve: tiene que empezar con https:// y ser la dirección completa de la sala (por ejemplo https://meet.google.com/abc-defg-hij).", true);
                return;
            }
            const { data, error } = await sb.from("profesor_videollamada")
                .upsert({ profesor_id: profile.id, grupo: grupo, enlace: enlace },
                        { onConflict: "profesor_id,grupo" })
                .select("grupo, enlace").single();
            if (error) { decirVll(grupo, "No se pudo guardar: " + error.message, true); return; }
            // Lo que se enseña es lo que quedó GUARDADO, no lo que se escribió:
            // el servidor le quita los espacios, y enseñar lo propuesto deja a
            // quien guarda creyendo que guardó otra cosa.
            vllSalas[grupo] = data.enlace;
            pintarVll({ [grupo]: { texto: "Guardado. " + (grupo ? "A los alumnos de " + grupo : "A los alumnos sin sala de grupo")
                + " les saldrá «" + Videollamada.etiqueta(data.enlace) + "» (" + Videollamada.host(data.enlace)
                + ") mientras tengas una clase abierta." } });
        }

        async function quitarVll(grupo) {
            const { error } = await sb.from("profesor_videollamada").delete()
                .eq("profesor_id", profile.id).eq("grupo", grupo);
            if (error) { decirVll(grupo, "No se pudo quitar: " + error.message, true); return; }
            /* Se vuelve a LEER en vez de tachar la fila de la pantalla: lo que
               se enseña tiene que ser lo que quedó en la base. Si el borrado se
               llevara por delante otra sala —un filtro de menos—, con el estado
               local la pantalla seguiría enseñándola como si estuviera. */
            await cargarVll({ [grupo]: { texto: grupo
                ? "Quitado. Los alumnos de " + grupo + " pasan a ver la sala de todas tus clases, si tienes una."
                : "Quitado. Los alumnos sin sala de grupo ya no ven el botón de la videollamada." } });
        }

        document.getElementById("pw-save-btn").addEventListener("click", async () => {
            const msg = document.getElementById("pw-msg");
            const newPassword = document.getElementById("new-password").value;
            if (newPassword.length < 8) { msg.textContent = "La contraseña debe tener al menos 8 caracteres."; msg.className = "text-xs text-red-600 dark:text-red-400"; return; }
            const { error } = await sb.auth.updateUser({ password: newPassword });
            if (error) { msg.textContent = error.message; msg.className = "text-xs text-red-600 dark:text-red-400"; return; }
            msg.textContent = "Contraseña actualizada.";
            msg.className = "text-xs text-green-600 dark:text-green-400";
            document.getElementById("new-password").value = "";
        });

        // ---------- Tema de piezas del tablero (preferencia local, ver js/board-themes.js) ----------
        const THEME_ACTIVE = "text-center px-2 py-3 rounded-xl border-2 border-accent-500 bg-accent-500/10 transition-colors";
        const THEME_INACTIVE = "text-center px-2 py-3 rounded-xl border-2 border-brand-200 dark:border-brand-700 hover:border-accent-400 bg-white dark:bg-brand-800 transition-colors";
        // Mismos glifos Unicode que usa js/clases-board.js para el tema "Clásico" (rey y
        // dama, blanco y negro), para que la vista previa se vea igual que en el tablero real.
        const CLASSIC_GLYPH = { w: { k: "♔", q: "♕", n: "♘" }, b: { k: "♚", q: "♛", n: "♞" } };
        // Iniciales en español (mismo criterio que TYPE_LABEL en js/clases-board.js): un
        // emoji "divertido" no siempre deja claro qué pieza es, así que la vista previa
        // también lleva la marca chiquita para que se vea igual que en el tablero real.
        const TYPE_LABEL = { k: "R", q: "D", n: "C" };
        // Tres piezas de muestra por tarjeta (rey, dama, caballo) sobre casillas
        // clara/oscura/clara alternadas, igual que en un tablero real.
        const PREVIEW_TYPES = ["k", "q", "n"];
        const PREVIEW_SQUARES = ["light", "dark", "light"];

        function buildThemePreviewHTML(theme) {
            let html = '<span class="theme-preview-row" aria-hidden="true">';
            PREVIEW_TYPES.forEach((type, i) => {
                const square = PREVIEW_SQUARES[i];
                const isDark = square === "dark";
                html += '<span class="theme-preview-sq theme-preview-sq-' + square + '">';
                if (theme.pieces) {
                    html += '<span class="theme-token ' + (isDark ? "theme-token-black" : "theme-token-white") + '">' + theme.pieces[type] +
                        '<span class="theme-token-label">' + TYPE_LABEL[type] + "</span></span>";
                } else {
                    html += '<span class="' + (isDark ? "piece-black" : "piece-white") + '">' + (isDark ? CLASSIC_GLYPH.b[type] : CLASSIC_GLYPH.w[type]) + "</span>";
                }
                html += "</span>";
            });
            html += "</span>";
            return html;
        }

        function renderBoardThemeGrid() {
            const grid = document.getElementById("board-theme-grid");
            if (!grid || !window.BoardThemes) return;
            const current = window.BoardThemes.getPreference();
            grid.innerHTML = "";
            Object.keys(window.BoardThemes.THEMES).forEach((id) => {
                const theme = window.BoardThemes.THEMES[id];
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = id === current ? THEME_ACTIVE : THEME_INACTIVE;
                btn.setAttribute("role", "radio");
                btn.setAttribute("aria-checked", id === current ? "true" : "false");
                btn.innerHTML =
                    buildThemePreviewHTML(theme) +
                    '<span class="block text-lg mb-0.5" aria-hidden="true">' + theme.icon + "</span>" +
                    '<span class="block text-xs font-semibold text-brand-700 dark:text-brand-200">' + theme.label + "</span>";
                btn.addEventListener("click", () => {
                    window.BoardThemes.setPreference(id);
                    renderBoardThemeGrid();
                });
                grid.appendChild(btn);
            });
        }
        renderBoardThemeGrid();

        // ---------- Tema de TODA la plataforma (js/temas-plataforma.js) ----------
        // La vista previa es una "pantallita" con seis colores del tema: la barra del
        // encabezado, el fondo de la página, una tarjeta, el botón de acento y las dos
        // casillas del tablero. Elegir por el nombre no dice nada — "Sirenas" puede ser
        // cualquier cosa — y el nombre de un color tampoco: lo que se elige es cómo va a
        // quedar el sitio, así que eso es lo que hay que poder ver antes de tocar.
        function buildTemaPreviewHTML(tema) {
            const casillas = (window.BoardColorThemes || {}).THEMES || {};
            const sq = casillas[tema.casillas] || casillas.clasico || { light: "#f0f4f8", dark: "#486581" };
            return (
                '<span class="tema-previa" aria-hidden="true">' +
                '<span class="tema-previa-barra" style="background:' + tema.brand[800] + '"></span>' +
                '<span class="tema-previa-cuerpo" style="background:' + tema.brand[50] + '">' +
                '<span class="tema-previa-tarjeta" style="background:#ffffff"></span>' +
                '<span class="tema-previa-pastilla" style="background:' + tema.accent[500] + '"></span>' +
                '<span class="tema-previa-sq" style="background:' + sq.light + '"></span>' +
                '<span class="tema-previa-sq" style="background:' + sq.dark + '"></span>' +
                "</span></span>"
            );
        }

        function renderTemaPlataformaGrid() {
            const grid = document.getElementById("tema-plataforma-grid");
            if (!grid || !window.TemasPlataforma) return;
            const actual = window.TemasPlataforma.getPreference();
            grid.innerHTML = "";
            Object.keys(window.TemasPlataforma.TEMAS).forEach((id) => {
                const tema = window.TemasPlataforma.TEMAS[id];
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = id === actual ? THEME_ACTIVE : THEME_INACTIVE;
                btn.setAttribute("role", "radio");
                btn.setAttribute("aria-checked", id === actual ? "true" : "false");
                btn.innerHTML =
                    buildTemaPreviewHTML(tema) +
                    '<span class="block text-lg" aria-hidden="true">' + tema.icono + "</span>" +
                    '<span class="block text-xs font-semibold text-brand-700 dark:text-brand-200">' + tema.label + "</span>" +
                    '<span class="block text-[11px] leading-snug text-brand-450 dark:text-brand-350 mt-0.5">' + tema.descripcion + "</span>";
                btn.addEventListener("click", () => {
                    window.TemasPlataforma.setPreference(id);
                    // Las tres rejillas se vuelven a pintar: las dos de colores de
                    // tablero tienen una tarjeta "Como el tema", y su vista previa
                    // enseña el color que acaba de cambiar.
                    renderTemaPlataformaGrid();
                    renderBoardColorThemeGrids();
                });
                grid.appendChild(btn);
            });
        }

        // ---------- Colores del tablero, normal y Modo Adaptado (preferencia local,
        // ver js/board-color-themes.js) — mismo patrón visual que el tema de piezas de
        // arriba, pero la "vista previa" acá son las 2 casillas del propio tema (no hace
        // falta un tablero real: el color completo ya se ve con solo 2 cuadraditos). ----
        function buildColorPreviewHTML(theme) {
            return (
                '<span class="theme-preview-row" aria-hidden="true">' +
                '<span class="theme-preview-sq" style="background:' + theme.light + '"></span>' +
                '<span class="theme-preview-sq" style="background:' + theme.dark + '"></span>' +
                "</span>"
            );
        }

        // `vars`, cuando se pasa, agrega adelante la tarjeta "Como el tema": es lo que
        // trae quien nunca eligió un color a mano, y quiere decir que manda el que
        // proponga el tema de plataforma (ver AUTO en js/board-color-themes.js). Su
        // vista previa lee las variables YA CALCULADAS por el navegador y no la tabla
        // de temas, que es la única forma de que enseñe el color que de verdad está
        // puesto — el del tema, o el de resguardo de css/styles.css si no hay ninguno.
        function colorDeVariable(nombre, resguardo) {
            const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
            return v || resguardo;
        }

        // `custom` (opcional) es la función getCustom() del módulo: con ella la rejilla suma
        // al final "A tu gusto", con los colores que la persona eligió en la tarjeta 🎨.
        function renderColorThemeGrid(gridId, themes, getCurrent, setCurrent, buildPreview, vars, custom) {
            buildPreview = buildPreview || buildColorPreviewHTML;
            const grid = document.getElementById(gridId);
            if (!grid) return;
            const current = getCurrent();
            grid.innerHTML = "";
            let ids = vars ? ["auto"].concat(Object.keys(themes)) : Object.keys(themes);
            if (custom) ids = ids.concat(["personalizado"]);
            ids.forEach((id) => {
                // `vars` puede ser una función que arma la tarjeta "auto" entera: las
                // dos listas de Modo Adaptado la usan para "Igual que arriba".
                const theme = id === "auto"
                    ? (typeof vars === "function" ? vars() : { label: "Como el tema",
                        light: colorDeVariable(vars[0], "#f0f4f8"),
                        dark: colorDeVariable(vars[1], "#486581") })
                    : id === "personalizado" ? custom() : themes[id];
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = id === current ? THEME_ACTIVE : THEME_INACTIVE;
                btn.setAttribute("role", "radio");
                btn.setAttribute("aria-checked", id === current ? "true" : "false");
                btn.innerHTML =
                    buildPreview(theme) +
                    '<span class="block text-xs font-semibold text-brand-700 dark:text-brand-200">' + theme.label + "</span>";
                btn.addEventListener("click", () => {
                    setCurrent(id);
                    // Se repintan las cuatro: la tarjeta "Igual que arriba" de Modo
                    // Adaptado enseña lo que se acaba de elegir en la de arriba.
                    renderBoardColorThemeGrids();
                    renderPieceColorThemeGrids();
                });
                grid.appendChild(btn);
            });
        }

        function renderBoardColorThemeGrids() {
            if (!window.BoardColorThemes) return;
            renderColorThemeGrid(
                "board-color-theme-grid",
                window.BoardColorThemes.THEMES,
                window.BoardColorThemes.getPreference,
                window.BoardColorThemes.setPreference,
                buildColorPreviewHTML,
                ["--sq-light", "--sq-dark"],
                window.BoardColorThemes.getCustom
            );
            renderColorThemeGrid(
                "board-color-theme-adaptive-grid",
                window.BoardColorThemes.ADAPTIVE_THEMES,
                window.BoardColorThemes.getAdaptivePreference,
                window.BoardColorThemes.setAdaptivePreference,
                buildColorPreviewHTML,
                () => ({
                    label: window.BoardColorThemes.getPreference() === "auto" ? "Como el tema" : "Igual que arriba",
                    light: colorDeVariable("--sq-light-adaptive", "#ffffff"),
                    dark: colorDeVariable("--sq-dark-adaptive", "#d946ef"),
                })
            );
        }
        renderBoardColorThemeGrids();
        renderTemaPlataformaGrid();

        // ---------- Color de las piezas, normal y Modo Adaptado (js/piece-color-themes.js) —
        // mismo renderColorThemeGrid de arriba, con una vista previa propia: acá el par es
        // "blancas"/"negras" (theme.white/theme.black), no "casilla clara"/"casilla oscura". ----
        function buildPiecePreviewHTML(theme) {
            return (
                '<span class="theme-preview-row" aria-hidden="true">' +
                '<span class="theme-preview-sq" style="background:' + theme.white + '"></span>' +
                '<span class="theme-preview-sq" style="background:' + theme.black + '"></span>' +
                "</span>"
            );
        }
        function renderPieceColorThemeGrids() {
            if (!window.PieceColorThemes) return;
            renderColorThemeGrid(
                "piece-color-theme-grid",
                window.PieceColorThemes.THEMES,
                window.PieceColorThemes.getPreference,
                window.PieceColorThemes.setPreference,
                buildPiecePreviewHTML,
                null,
                window.PieceColorThemes.getCustom
            );
            renderColorThemeGrid(
                "piece-color-theme-adaptive-grid",
                window.PieceColorThemes.ADAPTIVE_THEMES,
                window.PieceColorThemes.getAdaptivePreference,
                window.PieceColorThemes.setAdaptivePreference,
                buildPiecePreviewHTML,
                () => ({
                    label: "Igual que arriba",
                    white: colorDeVariable("--piece-white-adaptive", "#ffffff"),
                    black: colorDeVariable("--piece-black-adaptive", "#000000"),
                })
            );
        }
        renderPieceColorThemeGrids();

        // ---------- Estilo de pieza (js/piece-style-themes.js) — acá la vista previa no es
        // un color, es una pieza de muestra dibujada de verdad con cada estilo (un rey), para
        // que se note la diferencia real entre el símbolo de siempre y el dibujo ilustrado. ----
        function buildPieceStylePreviewHTML(id) {
            const dibujado = window.PieceStyleThemes.THEMES[id].dibujado && window.ChessPieceSVG;
            const ilustrado = dibujado;
            const white = ilustrado ? window.ChessPieceSVG.markup("k", "w") : '<span class="piece-white">♔</span>';
            const black = ilustrado ? window.ChessPieceSVG.markup("k", "b") : '<span class="piece-black">♚</span>';
            return (
                '<span class="theme-preview-row text-2xl' + (id === "aro" ? " aro-siempre" : "") + '" aria-hidden="true">' +
                '<span class="theme-preview-sq theme-preview-sq-light">' + white + "</span>" +
                '<span class="theme-preview-sq theme-preview-sq-dark">' + black + "</span>" +
                "</span>"
            );
        }
        function renderPieceStyleThemeGrid() {
            const grid = document.getElementById("piece-style-theme-grid");
            if (!grid || !window.PieceStyleThemes) return;
            const current = window.PieceStyleThemes.getPreference();
            grid.innerHTML = "";
            Object.keys(window.PieceStyleThemes.THEMES).forEach((id) => {
                const theme = window.PieceStyleThemes.THEMES[id];
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = id === current ? THEME_ACTIVE : THEME_INACTIVE;
                btn.setAttribute("role", "radio");
                btn.setAttribute("aria-checked", id === current ? "true" : "false");
                btn.innerHTML =
                    buildPieceStylePreviewHTML(id) +
                    '<span class="block text-xs font-semibold text-brand-700 dark:text-brand-200">' + theme.label + "</span>";
                btn.addEventListener("click", () => {
                    window.PieceStyleThemes.setPreference(id);
                    renderPieceStyleThemeGrid();
                });
                grid.appendChild(btn);
            });
        }
        renderPieceStyleThemeGrid();

        // ---------- Colores a tu gusto (modo normal) ----------
        // Cada color se puede elegir de dos formas que dicen lo mismo: el cuadrito de la
        // paleta y el código escrito (#f0d9b5). Las dos se mantienen iguales, y cualquiera
        // de las dos guarda en el acto con setCustom(), que además deja puesto «A tu gusto»:
        // elegir un color ES elegirlo, no un paso más que haya que acordarse de dar.
        // La vista previa es un tablero ENTERO en la posición inicial, con sus coordenadas
        // afuera, pintado con el estilo de pieza que esté elegido: un par de casillas se ve
        // distinto de a dos que de a sesenta y cuatro.
        // Lo que no se hace es DECIDIR por la persona: si una pieza queda por debajo de 3:1
        // contra una casilla (el mínimo de WCAG para un objeto gráfico) se le dice cuál y
        // con qué número, pero se guarda igual — es su pantalla.
        (function () {
            const B = window.BoardColorThemes, P = window.PieceColorThemes;
            if (!B || !P || !B.setCustom || !P.setCustom) return;
            const el = (id) => document.getElementById(id);
            const CAMPOS = ["gusto-casilla-clara", "gusto-casilla-oscura", "gusto-pieza-blanca", "gusto-pieza-negra"];
            const color = (id) => el(id).value;
            const tablero = el("gusto-tablero"), pares = el("gusto-pares");
            const aviso = el("gusto-aviso"), msg = el("gusto-msg");

            // "f0d9b5", "#F0D9B5", "#fdb" y " #f0d9b5 " son el mismo color escrito de
            // cuatro formas; cualquier otra cosa no es un color.
            function normalizar(txt) {
                let t = String(txt || "").trim().toLowerCase();
                if (t && t[0] !== "#") t = "#" + t;
                if (/^#[0-9a-f]{3}$/.test(t)) t = "#" + t[1] + t[1] + t[2] + t[2] + t[3] + t[3];
                return /^#[0-9a-f]{6}$/.test(t) ? t : null;
            }
            const lum = (hex) => {
                const c = [1, 3, 5].map((i) => {
                    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
                    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
            };
            const contraste = (a, b) => {
                const x = lum(a), y = lum(b);
                return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
            };
            const num = (r) => r.toFixed(1).replace(".", ",");

            function llenar() {
                const c = B.getCustom(), p = P.getCustom();
                const v = { "gusto-casilla-clara": c.light, "gusto-casilla-oscura": c.dark,
                            "gusto-pieza-blanca": p.white, "gusto-pieza-negra": p.black };
                CAMPOS.forEach((id) => {
                    el(id).value = v[id];
                    el(id + "-hex").value = v[id];
                    el(id + "-hex").removeAttribute("aria-invalid");
                });
            }

            // El tablero de muestra: la posición inicial, con las piezas del estilo elegido
            // (dibujadas o de símbolo) y las coordenadas por fuera, como en la clase en vivo.
            const INICIO = ["rnbqkbnr", "pppppppp", "8", "8", "8", "8", "PPPPPPPP", "RNBQKBNR"];
            const GLIFO = { w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
                            b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" } };
            function pieza(ch) {
                const lado = ch === ch.toUpperCase() ? "w" : "b";
                const t = ch.toLowerCase();
                const dibujada = window.PieceStyleThemes && window.PieceStyleThemes.esDibujado && window.PieceStyleThemes.esDibujado() && window.ChessPieceSVG;
                if (dibujada) return window.ChessPieceSVG.markup(t, lado);
                return '<span class="' + (lado === "w" ? "piece-white" : "piece-black") + '">' + GLIFO[lado][t] + "</span>";
            }
            function pintarTablero() {
                const clara = color("gusto-casilla-clara"), oscura = color("gusto-casilla-oscura");
                let casillas = "";
                INICIO.forEach((fila, r) => {
                    const celdas = fila === "8" ? "        " : fila;
                    for (let c = 0; c < 8; c++) {
                        const ch = celdas[c];
                        const fondo = (r + c) % 2 === 0 ? clara : oscura;
                        casillas += '<div style="background:' + fondo + ';aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:10cqw;line-height:1">' +
                            (ch && ch !== " " ? pieza(ch) : "") + "</div>";
                    }
                });
                const numeros = [8, 7, 6, 5, 4, 3, 2, 1].map((n) => '<div class="flex items-center justify-center text-xs text-brand-500 dark:text-brand-300">' + n + "</div>").join("");
                const letras = "abcdefgh".split("").map((l) => '<div class="text-center text-xs text-brand-500 dark:text-brand-300 pt-1">' + l + "</div>").join("");
                tablero.innerHTML =
                    '<div style="display:grid;grid-template-columns:1.25rem 1fr">' +
                    '<div style="display:grid;grid-template-rows:repeat(8,minmax(0,1fr))">' + numeros + "</div>" +
                    '<div class="rounded-md overflow-hidden border border-brand-200 dark:border-brand-700" style="container-type:inline-size;display:grid;grid-template-columns:repeat(8,minmax(0,1fr))">' + casillas + "</div>" +
                    "<div></div>" +
                    '<div style="display:grid;grid-template-columns:repeat(8,minmax(0,1fr))">' + letras + "</div>" +
                    "</div>";
            }

            // Los pares de casillas del sitio, como punto de partida: tocar uno lo copia a
            // los dos colores de casilla, y desde ahí se retoca. No toca las piezas.
            function pintarPares() {
                const clara = color("gusto-casilla-clara"), oscura = color("gusto-casilla-oscura");
                pares.innerHTML = "";
                Object.keys(B.THEMES).forEach((id) => {
                    const t = B.THEMES[id];
                    const activo = t.light.toLowerCase() === clara && t.dark.toLowerCase() === oscura;
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "flex flex-col items-center gap-1 rounded-lg p-1 border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " +
                        (activo ? "border-accent-500" : "border-transparent hover:border-accent-400");
                    btn.setAttribute("aria-pressed", activo ? "true" : "false");
                    btn.innerHTML =
                        '<span class="flex w-16 h-8 rounded overflow-hidden border border-brand-200 dark:border-brand-700" aria-hidden="true">' +
                        '<span class="flex-1" style="background:' + t.light + '"></span>' +
                        '<span class="flex-1" style="background:' + t.dark + '"></span></span>' +
                        '<span class="text-xs leading-tight text-center text-brand-600 dark:text-brand-300">' + t.label + "</span>";
                    btn.addEventListener("click", () => {
                        ["gusto-casilla-clara", "gusto-casilla-oscura"].forEach((cid, i) => {
                            const v = (i === 0 ? t.light : t.dark).toLowerCase();
                            el(cid).value = v;
                            el(cid + "-hex").value = v;
                            el(cid + "-hex").removeAttribute("aria-invalid");
                        });
                        guardar();
                        msg.textContent = "Listo: casillas como «" + t.label + "». Puedes retocar cada color abajo.";
                    });
                    pares.appendChild(btn);
                });
            }

            function pintarAviso() {
                const casillas = [["la casilla clara", color("gusto-casilla-clara")], ["la casilla oscura", color("gusto-casilla-oscura")]];
                const problemas = [];
                // La pieza se ve si la separa de la casilla su relleno O su contorno: la blanca
                // de siempre sobre la casilla clara da 1,3:1 de relleno y se lee perfecto por
                // su borde oscuro. Contando solo el relleno, el aviso saldría hasta con Madera
                // y un aviso que sale siempre deja de leerse. El contorno es el mismo que
                // calcula piece-color-themes.js (contornoPara): oscuro para un relleno claro,
                // claro para uno oscuro.
                const contorno = (hex) => contraste(hex, "#000000") >= contraste(hex, "#ffffff") ? "#1e293b" : "#ffffff";
                [["La pieza blanca", color("gusto-pieza-blanca")], ["La pieza negra", color("gusto-pieza-negra")]].forEach(([n, pz]) => {
                    casillas.forEach(([m, sq]) => {
                        const r = Math.max(contraste(pz, sq), contraste(contorno(pz), sq));
                        if (r < 3) problemas.push(n + " sobre " + m + " casi no se distingue (" + num(r) + ":1; conviene 3:1 o más).");
                    });
                });
                const rc = contraste(color("gusto-pieza-blanca"), color("gusto-pieza-negra"));
                if (rc < 1.5) problemas.push("Las piezas blancas y las negras se parecen demasiado (" + num(rc) + ":1): cuesta saber de quién es cada una.");
                aviso.hidden = !problemas.length;
                aviso.textContent = problemas.length ? "⚠️ " + problemas.join(" ") : "";
            }
            function pintar() { pintarTablero(); pintarPares(); pintarAviso(); }

            function guardar() {
                B.setCustom(color("gusto-casilla-clara"), color("gusto-casilla-oscura"));
                P.setCustom(color("gusto-pieza-blanca"), color("gusto-pieza-negra"));
                renderBoardColorThemeGrids();
                renderPieceColorThemeGrids();
                pintar();
            }
            const decirGuardado = () => {
                msg.textContent = aviso.hidden
                    ? "Guardado: los tableros usan tus colores."
                    : "Guardado, pero revisa el aviso: alguna pieza se ve poco.";
            };

            CAMPOS.forEach((id) => {
                const paleta = el(id), texto = el(id + "-hex");
                paleta.addEventListener("input", () => {
                    texto.value = paleta.value;
                    texto.removeAttribute("aria-invalid");
                    guardar();
                });
                paleta.addEventListener("change", decirGuardado);
                // Mientras se escribe, solo se guarda lo que ya es un color: "#f0d" a medias
                // no puede pintar nada. Al salir del campo se dice qué estuvo mal.
                texto.addEventListener("input", () => {
                    const v = normalizar(texto.value);
                    if (!v) return;
                    texto.removeAttribute("aria-invalid");
                    paleta.value = v;
                    guardar();
                });
                texto.addEventListener("change", () => {
                    const v = normalizar(texto.value);
                    if (!v) {
                        texto.setAttribute("aria-invalid", "true");
                        msg.textContent = "«" + texto.value.trim() + "» no es un color: escribe un código como #f0d9b5.";
                        return;
                    }
                    texto.value = v;
                    decirGuardado();
                });
            });

            el("gusto-volver").addEventListener("click", () => {
                B.setPreference(B.AUTO);
                P.setPreference("clasico");
                renderBoardColorThemeGrids();
                renderPieceColorThemeGrids();
                msg.textContent = "Listo: los tableros volvieron a los colores de siempre. Tus colores quedan guardados como «A tu gusto» por si los quieres usar otra vez.";
            });

            // Cambiar el estilo de pieza en su tarjeta repinta también esta muestra.
            const repintarEstilo = renderPieceStyleThemeGrid;
            renderPieceStyleThemeGrid = function () { repintarEstilo(); pintarTablero(); };

            llenar();
            pintar();
        })();

        // ---------- Baja visión en modo normal: los cuatro ajustes de una vez ----------
        // Se guarda lo que había ANTES de tocar nada, para que «Volver» deje cada cosa como
        // estaba y no en el valor de fábrica: quien tenía Madera tiene que volver a Madera.
        (function () {
            const COPIA = "baja_vision_antes_v1";
            const PRESET = { tablero: "clasico", estilo: "aro", casillas: "celularturquesa", color: "clasico" };
            const aplicar = document.getElementById("baja-vision-aplicar");
            const deshacer = document.getElementById("baja-vision-deshacer");
            const msg = document.getElementById("baja-vision-msg");
            if (!aplicar || !window.PieceStyleThemes || !window.BoardColorThemes) return;
            const actual = () => ({
                tablero: window.BoardThemes ? window.BoardThemes.getPreference() : "clasico",
                estilo: window.PieceStyleThemes.getPreference(),
                casillas: window.BoardColorThemes.getPreference(),
                color: window.PieceColorThemes ? window.PieceColorThemes.getPreference() : "clasico",
            });
            const yaPuesto = () => { const a = actual(); return Object.keys(PRESET).every((k) => a[k] === PRESET[k]); };
            const poner = (v) => {
                if (window.BoardThemes) window.BoardThemes.setPreference(v.tablero);
                window.PieceStyleThemes.setPreference(v.estilo);
                window.BoardColorThemes.setPreference(v.casillas);
                if (window.PieceColorThemes) window.PieceColorThemes.setPreference(v.color);
                renderBoardThemeGrid();
                renderBoardColorThemeGrids();
                renderPieceColorThemeGrids();
                renderPieceStyleThemeGrid();
            };
            const leerCopia = () => {
                try { return JSON.parse(localStorage.getItem(COPIA) || "null"); } catch (e) { return null; }
            };
            const pintar = () => {
                aplicar.textContent = yaPuesto() ? "✅ Ya está puesto para baja visión" : "Poner el tablero para baja visión";
                deshacer.hidden = !leerCopia();
            };
            aplicar.addEventListener("click", () => {
                if (!yaPuesto()) {
                    try { localStorage.setItem(COPIA, JSON.stringify(actual())); } catch (e) {}
                }
                poner(PRESET);
                msg.textContent = "Listo: piezas dibujadas con aro y casillas turquesa y vino en todo el sitio. Si tenías abierta una página con tablero, recárgala.";
                pintar();
            });
            deshacer.addEventListener("click", () => {
                const antes = leerCopia();
                if (!antes) return;
                poner(antes);
                try { localStorage.removeItem(COPIA); } catch (e) {}
                msg.textContent = "Listo: el tablero volvió a como lo tenías.";
                pintar();
                aplicar.focus();
            });
            pintar();
        })();

        // ---------- Voz de Modo Speech (preferencia local, ver js/blind-notation.js) ----------
        function populateVoiceSelect() {
            const select = document.getElementById("speech-voice-select");
            const status = document.getElementById("speech-voice-status");
            if (!select || !window.BlindNotation) return;
            const voices = window.BlindNotation.getAvailableVoices();
            if (!voices.length) {
                // La lista suele llegar vacía al principio en la mayoría de los navegadores
                // hasta que disparan "voiceschanged" — más abajo se vuelve a llamar cuando
                // eso pasa. Si de verdad no hay ninguna voz instalada, se queda así.
                if (status) status.textContent = "Buscando las voces instaladas en tu navegador…";
                return;
            }
            const current = window.BlindNotation.getSpeechVoiceURI();
            select.innerHTML = "";
            const defaultOpt = document.createElement("option");
            defaultOpt.value = "";
            defaultOpt.textContent = "Predeterminada del navegador (español)";
            select.appendChild(defaultOpt);
            // Las voces en español primero, para encontrar rápido la más útil en este sitio
            // — el resto queda disponible igual, por si alguien prefiere otro idioma o acento.
            voices
                .slice()
                .sort((a, b) => {
                    const aEs = a.lang.toLowerCase().startsWith("es") ? 0 : 1;
                    const bEs = b.lang.toLowerCase().startsWith("es") ? 0 : 1;
                    if (aEs !== bEs) return aEs - bEs;
                    return a.name.localeCompare(b.name);
                })
                .forEach((voice) => {
                    const opt = document.createElement("option");
                    opt.value = voice.voiceURI;
                    opt.textContent = voice.name + " (" + voice.lang + ")";
                    if (voice.voiceURI === current) opt.selected = true;
                    select.appendChild(opt);
                });
            if (status) status.textContent = "";
        }

        function initSpeechVoicePicker() {
            const supported = "speechSynthesis" in window;
            document.getElementById("speech-voice-unsupported").classList.toggle("hidden", supported);
            document.getElementById("speech-voice-controls").classList.toggle("hidden", !supported);
            if (!supported) return;
            populateVoiceSelect();
            // En Chrome/Edge la lista de voces se carga de forma asíncrona: al principio
            // getVoices() da un array vacío y este evento avisa cuando ya están listas.
            window.speechSynthesis.onvoiceschanged = populateVoiceSelect;
            document.getElementById("speech-voice-select").addEventListener("change", (e) => {
                window.BlindNotation.setSpeechVoiceURI(e.target.value);
            });
            document.getElementById("speech-voice-test-btn").addEventListener("click", () => {
                // Habla directo con la Web Speech API, sin pasar por BlindNotation.speak():
                // esa función solo habla si Modo Speech ya está activado, y "probar" debe
                // funcionar igual aunque todavía esté apagado (o encendido en otra pestaña).
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance("Así vas a escuchar Modo Speech en el sitio.");
                const uri = document.getElementById("speech-voice-select").value;
                const voice = uri ? window.BlindNotation.getAvailableVoices().find((v) => v.voiceURI === uri) : null;
                if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else { utterance.lang = "es-ES"; }
                window.speechSynthesis.speak(utterance);
            });
        }
        initSpeechVoicePicker();

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html"; return; }
            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { document.getElementById("loading").textContent = "No se pudo cargar tu perfil."; return; }
            profile = profileData;
            document.getElementById("full-name-input").value = profile.full_name || "";
            document.getElementById("elo-input").value = profile.elo || "";
            if (profile.elo_tipo) document.getElementById("elo-tipo").value = profile.elo_tipo;
            document.getElementById("email-display").textContent = profile.email;
            /* Quien da clase pone su sala de videollamada; quien administra
               también, que la cuenta master también da clase — la regla
               permanente. */
            if (profile.role === "profesor" || profile.is_admin) {
                document.getElementById("videollamada").hidden = false;
                cargarVll();
            }
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
            pintarAvisos();
            Notificaciones.atenderRenovaciones();
        }

        /* ---------------- Avisos en el celular ----------------
           El permiso se pide SOLO al apretar el botón: el navegador deja
           pedirlo una vez por aparato, y si dicen que no, no se puede volver a
           preguntar nunca. Pedirlo al cargar la página es la forma más rápida
           de perder ese único tiro. */
        const avisosEstado = document.getElementById("avisos-estado");
        const avisosBtn = document.getElementById("avisos-btn");
        const avisosProbar = document.getElementById("avisos-probar");
        const avisosMsg = document.getElementById("avisos-msg");

        function decirAvisos(texto, malo) {
            avisosMsg.textContent = texto;
            avisosMsg.className = "text-xs mt-3 " + (malo
                ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400");
        }

        async function pintarAvisos() {
            const est = await Notificaciones.estado();
            avisosBtn.hidden = est === "no-se-puede" || est === "bloqueado";
            avisosProbar.hidden = est !== "encendido";
            if (est === "no-se-puede") {
                avisosEstado.textContent = "Este navegador no puede mandar avisos.";
                decirAvisos("En iPhone hay que instalar la Academia en la pantalla de inicio para que funcionen.", false);
                avisosMsg.className = "text-xs mt-3 text-brand-450 dark:text-brand-350";
            } else if (est === "bloqueado") {
                avisosEstado.textContent = "Los avisos están bloqueados.";
                decirAvisos("Se vuelven a permitir desde la configuración del navegador, en los permisos de este sitio.", true);
            } else if (est === "encendido") {
                avisosEstado.textContent = "✅ Este aparato recibe avisos.";
                avisosBtn.textContent = "Apagar";
            } else {
                avisosEstado.textContent = "Este aparato no recibe avisos.";
                avisosBtn.textContent = "Encender avisos";
            }
        }

        avisosBtn.addEventListener("click", async () => {
            const est = await Notificaciones.estado();
            avisosBtn.disabled = true;
            try {
                if (est === "encendido") {
                    await Notificaciones.apagar();
                    decirAvisos("Listo: este aparato deja de recibir avisos.", false);
                } else {
                    await Notificaciones.encender(session);
                    decirAvisos("Listo. Prueba con el botón de al lado para ver cómo se ven.", false);
                }
            } catch (e) {
                decirAvisos(e.message || String(e), true);
            }
            avisosBtn.disabled = false;
            pintarAvisos();
        });

        avisosProbar.addEventListener("click", async () => {
            avisosProbar.disabled = true;
            try {
                await Notificaciones.probar(session);
                decirAvisos("Mandado. Debería aparecer en un momento.", false);
            } catch (e) {
                decirAvisos(e.message || String(e), true);
            }
            avisosProbar.disabled = false;
        });

        init();
    