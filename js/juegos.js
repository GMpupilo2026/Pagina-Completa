/* El código de juegos.html.

   Vivía escrito dentro de la página, en un <script> de 42 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md.

   «En línea ahora» (retar) y las listas de «Partidas en curso» y «Partidas
   terminadas» ya no están acá: se mudaron a competir.html (js/competir.js).
   Lo que las dos páginas comparten —el catálogo de modalidades, la posición
   de salida, a qué página se entra— vive en js/juegos-comun.js. */

        let session = null, profile = null, isTeacher = false;
        const playerNames = {};

        // Tiempo asignado a cada jugador (reloj tipo Fischer: minutos + segundos que se
        // suman después de cada jugada). "Sin límite" es como se jugó siempre — el
        // reloj es opcional. La lista vive en js/ritmos.js, la misma de los torneos.
        let ritmoPartida = null;

        function populateTimeControlSelect() {
            ritmoPartida = Ritmos.montar(document.getElementById("time-control-select"));
        }

        function setStatus(text) {
            const el = document.getElementById("status-banner");
            el.textContent = text;
            el.classList.toggle("hidden", !text);
        }

        // ---------- Mis partidas en curso ----------
        /* La usan los DOS, alumno y profesor. Desde que el profesor se sienta a
           jugar —contra un alumno suyo, o emparejado en su propio torneo—
           necesita entrar a su partida igual que cualquiera: verla pasar en la
           lista de supervisión de abajo no es lo mismo que tener el botón. */
        async function renderMisPartidas() {
            const { data: myRooms } = await sb.from("game_rooms")
                .select("*")
                .or("white_id.eq." + profile.id + ",black_id.eq." + profile.id)
                .order("created_at", { ascending: false })
                .limit(10);
            const { data: my4pGames } = await sb.from("fourplayer_games")
                .select("*")
                .or(SEATS.map((s) => "seats->" + s + "->>player_id.eq." + profile.id).join(","))
                .order("created_at", { ascending: false })
                .limit(10);

            const activeEl = document.getElementById("my-active-games");
            activeEl.innerHTML = "";
            const active = (myRooms || []).filter((r) => r.status === "playing").map((r) => Object.assign({ _table: "game_rooms" }, r));
            const active4p = (my4pGames || []).filter((r) => r.status === "playing").map((r) => Object.assign({ _table: "fourplayer_games" }, r));
            if (active.length || active4p.length) {
                const ids = new Set();
                active.forEach((r) => { ids.add(r.white_id); ids.add(r.black_id); });
                active4p.forEach((r) => SEATS.forEach((s) => { if (r.seats[s].player_id) ids.add(r.seats[s].player_id); }));
                const { data: players } = await sb.rpc("nombres_de_jugadores", { p_ids: Array.from(ids) });
                (players || []).forEach((p) => { playerNames[p.id] = p.nombre; });

                active.forEach((r) => {
                    const myColor = r.white_id === profile.id ? "w" : "b";
                    const rivalId = myColor === "w" ? r.black_id : r.white_id;
                    const card = document.createElement("a");
                    card.href = pageFor2pVariant(r.variant) + "?room=" + r.id;
                    card.className = "block bg-white dark:bg-brand-900 rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow";
                    card.innerHTML =
                        '<p class="text-xs text-accent-700 dark:text-accent-400 font-semibold uppercase mb-1">' + variantLabel(r.variant) + ' · en curso</p>' +
                        '<h2 class="font-semibold text-brand-800 dark:text-white">Contra ' + escapeHtml(playerNames[rivalId] || "tu rival") + '</h2>' +
                        '<p class="text-xs text-brand-450 dark:text-brand-350 mt-1">Juegas con ' + (myColor === "w" ? "blancas ⚪" : "negras ⚫") + ' — toca para continuar →</p>';
                    activeEl.appendChild(card);
                });
                active4p.forEach((r) => {
                    const mySeat = SEATS.find((s) => r.seats[s].player_id === profile.id);
                    const others = SEATS.filter((s) => s !== mySeat).map((s) => escapeHtml(playerNames[r.seats[s].player_id] || "?")).join(", ");
                    const card = document.createElement("a");
                    card.href = "cuatro-jugadores.html?room=" + r.id;
                    card.className = "block bg-white dark:bg-brand-900 rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow";
                    card.innerHTML =
                        '<p class="text-xs text-accent-700 dark:text-accent-400 font-semibold uppercase mb-1">' + variantLabel(r.mode === "teams" ? "4teams" : "4ffa") + ' · en curso</p>' +
                        '<h2 class="font-semibold text-brand-800 dark:text-white">Contra ' + others + '</h2>' +
                        '<p class="text-xs text-brand-450 dark:text-brand-350 mt-1">Juegas con ' + SEAT_LABEL[mySeat] + ' — toca para continuar →</p>';
                    activeEl.appendChild(card);
                });
            } else if (!isTeacher) {
                // Al profesor sin partidas propias no se le dice nada: lo suyo
                // empieza en el panel de abajo. El aviso de "espera a que te
                // asignen" es para el alumno y solo para él.
                const p = document.createElement("p");
                p.className = "text-sm text-brand-450 dark:text-brand-350 bg-white dark:bg-brand-900 rounded-xl p-4";
                p.textContent = "Todavía no tienes ninguna partida asignada. Espera a que tu profesor te asigne un rival.";
                activeEl.appendChild(p);
            }
        }

        // ---------- Vista del alumno ----------
        async function renderStudentView() {
            document.getElementById("student-view").classList.remove("hidden");
            const grid = document.getElementById("variant-grid");
            grid.innerHTML = "";
            /* Con la cuenta ciega solo se describen las modalidades que se
               juegan con el tablero accesible (Estándar y Niebla: ver «Las tres
               páginas de Juegos, con el mismo teclado» en
               docs/decisiones/accesibilidad.md). Las
               demás no tienen cómo jugarse escribiendo, y leerle diez
               descripciones de lo que no puede jugar era una lista de puertas
               cerradas. */
            const ciega = document.documentElement.classList.contains("modo-ciego");
            const nota = document.getElementById("variantes-nota");
            if (nota) nota.hidden = !ciega;
            VARIANTS.filter((v) => !ciega || v.id === "estandar" || v.id === "niebla").forEach((v) => {
                const card = document.createElement("div");
                card.className = "bg-white dark:bg-brand-900 rounded-xl shadow-md p-4 " + (v.disabled ? "opacity-60" : "");
                card.innerHTML =
                    '<span class="text-3xl block mb-2" aria-hidden="true">' + v.emoji + '</span>' +
                    '<h3 class="font-semibold text-brand-800 dark:text-white mb-1">' + v.label + '</h3>' +
                    '<p class="text-xs text-brand-450 dark:text-brand-350">' + v.desc + '</p>';
                grid.appendChild(card);
            });
        }


        // ---------- Vista del profesor ----------
        let allStudents = [];

        /* Los selectores llevan a los alumnos Y al propio profesor: desde que se
           puede sentar a jugar, es un jugador más. La lista de alumnos la acota
           la RLS de `profiles`, no este `.eq()`: cada profesor recibe los suyos.

           "Yo" va en su propio <optgroup> y AL FINAL, no arriba. Si fuera la
           primera opción, el caso de todos los días —armar una partida entre dos
           alumnos— arrancaría con el profesor puesto de blancas y habría que
           sacarlo a mano cada vez. Así los índices de la preselección siguen
           cayendo donde caían. */
        async function loadPlayersIntoSelects() {
            const { data } = await sb.from("profiles").select("id, full_name, email").eq("role", "alumno").order("full_name");
            allStudents = data || [];
            const whiteSelect = document.getElementById("white-select");
            const blackSelect = document.getElementById("black-select");
            const seatSelects = SEATS.map((s) => document.getElementById("seat-" + s + "-select"));
            [whiteSelect, blackSelect, ...seatSelects].forEach((sel) => {
                sel.innerHTML = "";
                if (allStudents.length) {
                    const grupo = document.createElement("optgroup");
                    grupo.label = "Mis alumnos";
                    allStudents.forEach((s) => {
                        const opt = document.createElement("option");
                        opt.value = s.id;
                        opt.textContent = s.full_name || s.email;
                        grupo.appendChild(opt);
                    });
                    sel.appendChild(grupo);
                }
                const mio = document.createElement("optgroup");
                mio.label = "Yo";
                const opt = document.createElement("option");
                opt.value = profile.id;
                opt.textContent = nombreVisible(profile);
                mio.appendChild(opt);
                sel.appendChild(mio);
            });
            // Con dos alumnos o más, el caso de siempre: los dos primeros. Con uno
            // solo, el rival natural soy yo — antes quedaban las dos casillas en
            // el mismo alumno y el formulario se quejaba sin razón aparente.
            if (allStudents.length > 1) blackSelect.selectedIndex = 1;
            else blackSelect.value = profile.id;
            // Preseleccionar 4 jugadores distintos si hay suficientes, para que
            // solo haya que cambiar los que hagan falta.
            seatSelects.forEach((sel, i) => { if (allStudents.length > i) sel.selectedIndex = i; });
        }

        function updateVariantFieldsVisibility() {
            const variant = document.getElementById("variant-select").value;
            const is4p = variant === "4ffa" || variant === "4teams";
            document.getElementById("fields-2p").classList.toggle("hidden", is4p);
            document.getElementById("fields-4p").classList.toggle("hidden", !is4p);
            document.getElementById("fields-4p-hint").textContent = variant === "4teams"
                ? "En Equipos, los que quedan frente a frente en el tablero son compañeros: 🔴 Rojo + 🟡 Amarillo vs. 🔵 Azul + 🟢 Verde."
                : "Todos contra todos: el orden de turno es Rojo → Azul → Amarillo → Verde.";
        }
        document.getElementById("variant-select").addEventListener("change", updateVariantFieldsVisibility);

        document.getElementById("create-room-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const msg = document.getElementById("create-room-msg");
            const fail = (text) => { msg.textContent = text; msg.className = "text-xs text-red-600 dark:text-red-400 min-h-[1em]"; };
            const variant = document.getElementById("variant-select").value;
            const timeControl = ritmoPartida.leer();
            if (timeControl.error) { fail(timeControl.error); return; }

            if (variant === "4ffa" || variant === "4teams") {
                const ids = SEATS.map((s) => document.getElementById("seat-" + s + "-select").value);
                if (ids.some((id) => !id)) return fail("Elige un jugador para cada uno de los 4 asientos.");
                if (new Set(ids).size !== 4) return fail("Elige 4 jugadores distintos.");
                const mode = variant === "4teams" ? "teams" : "ffa";
                const engineGame = new FourPlayerChess.Game(mode);
                const seats = {};
                SEATS.forEach((s, i) => { seats[s] = { player_id: ids[i], ready: false, score: 0, time_left: timeControl.initial }; });
                const { error } = await sb.from("fourplayer_games").insert({
                    mode: mode, seats: seats, turn: "red", board: engineGame.toJSON(), moves: [],
                    initial_seconds: timeControl.initial, increment_seconds: timeControl.increment,
                    created_by: session.user.id,
                });
                if (error) { console.error(error); return fail("No se pudo crear la partida: " + error.message); }
            } else {
                const whiteId = document.getElementById("white-select").value;
                const blackId = document.getElementById("black-select").value;
                if (!whiteId || !blackId) return fail("Elige un jugador para cada color.");
                if (whiteId === blackId) return fail("Elige dos jugadores distintos.");
                const fila = {
                    variant: variant, white_id: whiteId, black_id: blackId, created_by: session.user.id,
                    initial_seconds: timeControl.initial, increment_seconds: timeControl.increment,
                    // El reloj de ambos arranca completo, pero SIN empezar a correr todavía
                    // (clock_updated_at se deja sin poner) — recién arranca cuando los dos
                    // jugadores entran y se marcan listos (ver crazyhouse.html/cartas.html),
                    // no desde que el profesor crea la partida.
                    white_time_left: timeControl.initial, black_time_left: timeControl.initial,
                };
                Object.assign(fila, estadoInicial(variant));
                const { error } = await sb.from("game_rooms").insert(fila);
                if (error) { console.error(error); return fail("No se pudo crear la partida: " + error.message); }
            }
            // La lista de partidas vive en competir.html: el aviso dice dónde
            // seguirla, con su enlace, para que no parezca que no pasó nada.
            msg.textContent = "¡Partida creada! La sigues en ";
            const enlace = document.createElement("a");
            enlace.href = "competir.html";
            enlace.className = "underline font-semibold";
            enlace.textContent = "Competir";
            msg.append(enlace, ".");
            msg.className = "text-xs text-green-700 dark:text-green-400 min-h-[1em]";
            await renderMisPartidas();
        });

        async function renderTeacherView() {
            document.getElementById("teacher-view").classList.remove("hidden");
            populateTimeControlSelect();
            await loadPlayersIntoSelects();
            updateVariantFieldsVisibility();
            // Los topes bajan en uno porque el profesor cuenta como jugador: con
            // un solo alumno ya hay partida, y con tres ya se puede armar una de
            // cuatro.
            if (!allStudents.length) {
                setStatus("Todavía no tienes ningún alumno asignado, así que no hay con quién armar una partida.");
            } else if (allStudents.length < 3) {
                setStatus("Con menos de 3 alumnos no vas a poder armar partidas de 4 jugadores, aunque te cuentes a ti mismo.");
            }
        }

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html"; return; }
            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { document.getElementById("loading").textContent = "No se pudo cargar tu perfil."; return; }
            profile = profileData;
            // Quien administra ve esta página como profesor, igual que en Informes:
            // lo que se hace para el profesor se hace para administración.
            isTeacher = profile.role === "profesor" || !!profile.is_admin;
            document.getElementById("subtitle").textContent = isTeacher
                ? "Arma partidas entre tus alumnos —o contra ti mismo— y sigue su avance."
                : "Otras formas de jugar ajedrez, además de la partida clásica. Tu profesor te asigna el rival.";

            await renderMisPartidas();
            if (isTeacher) await renderTeacherView();
            else await renderStudentView();
            // El aviso de partida asignada (js/juego-aviso.js) se autoarranca solo
            // en todas las páginas de la Academia — ver herramientas/academia-cabecera.py.

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        /* La Racha táctica da 60 segundos por ejercicio en Modo Adaptado
           (js/racha-tactica.js): la tarjeta decía 10 también ahí, y quien usa
           lector de pantalla no se animaba a entrar. Se sigue al interruptor. */
        function segundosDeRacha() {
            const el = document.getElementById("racha-segundos");
            if (el) el.textContent = document.documentElement.classList.contains("adaptive-mode") ? "60 segundos" : "10 segundos";
        }
        segundosDeRacha();
        document.addEventListener("adaptivemode:change", segundosDeRacha);
        init();
