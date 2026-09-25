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
        const VARIANT_LABEL = { estandar: "⚔️ Ajedrez Estándar", crazyhouse: "♞ Crazyhouse", cartas: "🃏 Ajedrez de Cartas", duelo: "⚡ Duelo Simultáneo", niebla: "🌫️ Niebla de Guerra" };
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
                    '<p class="text-xs text-brand-450 dark:text-brand-350">' + (FORMAT_LABEL[t.format] || t.format) + ' · ' + (VARIANT_LABEL[t.variant] || t.variant) + ' · ⏱️ ' + Ritmos.etiqueta(t.initial_seconds, t.increment_seconds) + ' · ' + (STATUS_LABEL[t.status] || t.status) + '</p>';
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

        function escapeHtml(text) {
            const div = document.createElement("div");
            div.textContent = text;
            return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        document.getElementById("create-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const msg = document.getElementById("create-msg");
            const name = document.getElementById("name-input").value.trim();
            if (!name) return;
            const format = document.getElementById("format-select").value;
            const variant = document.getElementById("variant-select").value;
            const tc = ritmoTorneo.leer();
            if (tc.error) { msg.textContent = tc.error; msg.className = "text-xs text-red-600 dark:text-red-400 min-h-[1em]"; return; }
            const { data, error } = await sb.from("tournaments").insert({
                name: name, format: format, variant: variant,
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
            await loadAll();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    