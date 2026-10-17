/* El código de torneos.html.

   Vivía escrito dentro de la página, en un <script> de 7 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null, isManager = false;
        let tournaments = [], myRegistrations = new Set();

        function showError(text) {
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("error-text").textContent = text;
            document.getElementById("error-state").classList.remove("hidden");
        }

        // La lista de ritmos es la misma de las partidas amistosas: js/ritmos.js.
        let ritmoTorneo = null;
        function populateTimeSelect() {
            ritmoTorneo = Ritmos.montar(document.getElementById("time-select"), { valor: "5+0" });
        }

        const FORMAT_LABEL = { swiss: "Suizo", elimination: "Eliminación directa", round_robin: "Todos contra todos" };

        /* La modalidad: cualquiera de las de a dos (MODOS_TORNEO, de
           js/juegos-comun.js, la misma lista de juegos.html) y, al final,
           «Aleatorio», que sortea una distinta en cada ronda. Debajo, en una
           línea, de qué se trata la elegida: con once modalidades, el nombre
           solo no alcanza para decidir. */
        function populateVariantSelect() {
            const select = document.getElementById("variant-select");
            MODOS_TORNEO.concat(ALEATORIO.id).forEach((id) => {
                const opcion = document.createElement("option");
                opcion.value = id;
                opcion.textContent = etiquetaModoTorneo(id);
                select.appendChild(opcion);
            });
            /* En «Aleatorio», quien organiza elige cuáles entran al sorteo
               (montarCasillasModos, la misma de torneo.html): todas marcadas
               de entrada, y al menos dos. La cuenta dice cuántas quedaron. */
            const campo = document.getElementById("modos-campo");
            casillasModos = montarCasillasModos(document.getElementById("modos-casillas"));
            const describir = () => {
                const v = VARIANTS.find((x) => x.id === select.value);
                const azar = select.value === ALEATORIO.id;
                campo.hidden = !azar;
                const n = casillasModos.cuantas();
                document.getElementById("variant-desc").textContent = azar
                    ? "Cada ronda se juega en una modalidad distinta, sorteada al armarla entre las que marques abajo: no se repite ninguna hasta que salgan todas, y nunca dos rondas seguidas."
                    : (v ? v.desc : "");
                document.getElementById("modos-cuenta").textContent = n < MINIMO_DEL_SORTEO
                    ? "Marca al menos " + MINIMO_DEL_SORTEO + "."
                    : (n === MODOS_TORNEO.length ? "Entran las " + n + "." : "Entran " + n + " de " + MODOS_TORNEO.length + ".");
            };
            select.addEventListener("change", describir);
            campo.addEventListener("change", describir);
            describir();
        }
        let casillasModos = null;
        const STATUS_LABEL = { registration: "🟢 Inscripción abierta", in_progress: "🔵 En curso", finished: "🏁 Terminado" };

        async function register(tournamentId) {
            const { error } = await sb.from("tournament_registrations").insert({ tournament_id: tournamentId, player_id: profile.id });
            if (error) { console.error(error); Avisos.avisar("No se pudo inscribir: " + error.message, { tipo: "error" }); return; }
            await loadAll();
        }
        async function withdraw(tournamentId) {
            const { error } = await sb.from("tournament_registrations").delete().eq("tournament_id", tournamentId).eq("player_id", profile.id);
            if (error) { console.error(error); Avisos.avisar("No se pudo retirar la inscripción: " + error.message, { tipo: "error" }); return; }
            await loadAll();
        }

        function renderList() {
            const listEl = document.getElementById("tournament-list");
            const emptyEl = document.getElementById("list-empty");
            listEl.innerHTML = "";
            if (!tournaments.length) { emptyEl.classList.remove("hidden"); return; }
            emptyEl.classList.add("hidden");
            tournaments.forEach((t) => {
                const card = document.createElement("div");
                card.className = "bg-white dark:bg-brand-900 rounded-xl shadow-md p-4 flex items-center justify-between flex-wrap gap-3";
                const info = document.createElement("div");
                info.innerHTML =
                    '<p class="font-semibold text-brand-800 dark:text-white">' + escapeHtml(t.name) + '</p>' +
                    '<p class="text-xs text-brand-450 dark:text-brand-350">' + (FORMAT_LABEL[t.format] || t.format) + ' · ' + etiquetaModoTorneo(t.variant) + ' · ⏱️ ' + Ritmos.etiqueta(t.initial_seconds, t.increment_seconds) + ' · ' + (STATUS_LABEL[t.status] || t.status) + '</p>';
                card.appendChild(info);
                const actions = document.createElement("div");
                actions.className = "flex items-center gap-2";
                const viewLink = document.createElement("a");
                viewLink.href = "torneo.html?id=" + t.id;
                viewLink.className = "text-sm font-semibold text-brand-600 dark:text-brand-300 hover:text-accent-600 transition-colors";
                viewLink.textContent = "Ver →";
                actions.appendChild(viewLink);
                /* El botón sale para cualquiera, también para el profesor: puede
                   jugar sus propios torneos. No hace falta preguntar de quién es
                   cada uno — la RLS de `tournaments` solo devuelve los que creé,
                   los de mis profesores o, si administro, todos, y en los tres
                   casos la inscripción está permitida. */
                if (t.status === "registration") {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    const registrado = myRegistrations.has(t.id);
                    btn.textContent = registrado ? "Retirarme" : "Inscribirme";
                    btn.className = "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors " +
                        (registrado ? "bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300"
                                    : "bg-accent-500 hover:bg-accent-600 text-brand-900");
                    btn.addEventListener("click", () => registrado ? withdraw(t.id) : register(t.id));
                    actions.appendChild(btn);
                }
                card.appendChild(actions);
                listEl.appendChild(card);
            });
        }

        document.getElementById("create-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const msg = document.getElementById("create-msg");
            const name = document.getElementById("name-input").value.trim();
            if (!name) return;
            const format = document.getElementById("format-select").value;
            const variant = document.getElementById("variant-select").value;
            let modos = null;
            if (variant === ALEATORIO.id) {
                const elegidos = casillasModos.leer();
                if (elegidos.error) { msg.textContent = elegidos.error; msg.className = "text-xs text-red-600 dark:text-red-400 min-h-[1em]"; return; }
                modos = elegidos.modos;
            }
            const tc = ritmoTorneo.leer();
            if (tc.error) { msg.textContent = tc.error; msg.className = "text-xs text-red-600 dark:text-red-400 min-h-[1em]"; return; }
            const { data, error } = await sb.from("tournaments").insert({
                name: name, format: format, variant: variant, modos_aleatorio: modos,
                initial_seconds: tc.initial, increment_seconds: tc.increment,
                created_by: profile.id,
            }).select().single();
            if (error) { console.error(error); msg.textContent = "No se pudo crear: " + error.message; msg.className = "text-xs text-red-600 dark:text-red-400 min-h-[1em]"; return; }
            window.location.href = "torneo.html?id=" + data.id;
        });

        async function loadAll() {
            const { data: rows, error } = await sb.from("tournaments").select("*").order("created_at", { ascending: false });
            if (error) { console.error(error); showError("No se pudieron cargar los torneos: " + error.message); return; }
            tournaments = rows || [];
            // También para quien gestiona: el profesor juega sus propios torneos.
            const { data: regs } = await sb.from("tournament_registrations").select("tournament_id").eq("player_id", profile.id);
            myRegistrations = new Set((regs || []).map((r) => r.tournament_id));
            renderList();
        }

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html"; return; }

            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { showError("No se pudo cargar tu perfil. Cierra sesión y vuelve a entrar."); return; }
            profile = profileData;
            isManager = profile.role === "profesor" || !!profile.is_admin;

            document.getElementById("teacher-panel").classList.toggle("hidden", !isManager);
            document.getElementById("list-empty").textContent = "Todavía no hay ningún torneo" + (isManager ? " — crea el primero arriba." : ".");
            populateTimeSelect();
            populateVariantSelect();
            await loadAll();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    