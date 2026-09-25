/* El código de campeones.html.

   Vivía escrito dentro de la página, en un <script> de 3 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        const FORMAT_LABEL = { swiss: "Suizo", elimination: "Eliminación directa", round_robin: "Todos contra todos" };
        const VARIANT_LABEL = { estandar: "⚔️ Ajedrez Estándar", crazyhouse: "♞ Crazyhouse", cartas: "🃏 Ajedrez de Cartas", duelo: "⚡ Duelo Simultáneo", niebla: "🌫️ Niebla de Guerra" };

        function escapeHtml(text) {
            const div = document.createElement("div");
            div.textContent = text;
            return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        async function load() {
            const { data, error } = await sb.from("public_tournament_champions").select("*").order("finished_at", { ascending: false });
            if (error) { console.error(error); return; }
            const rows = data || [];

            // Trofeos por alumno: una fila por cada vez que aparece como campeón.
            const counts = {};
            rows.forEach((r) => { counts[r.display_name] = (counts[r.display_name] || 0) + 1; });
            const ranking = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
            const rankingEl = document.getElementById("trophy-ranking");
            rankingEl.innerHTML = "";
            ranking.forEach((name, i) => {
                const li = document.createElement("li");
                li.className = "flex items-center justify-between py-1 border-b border-brand-100 dark:border-brand-800 last:border-0";
                li.innerHTML = "<span>" + (i + 1) + ". " + escapeHtml(name) + "</span><span class='font-semibold'>🏆 × " + counts[name] + "</span>";
                rankingEl.appendChild(li);
            });
            document.getElementById("trophy-empty").classList.toggle("hidden", ranking.length > 0);

            // Torneos terminados: se agrupan por tournament_id (o por nombre+fecha
            // si el torneo original ya se borró) para mostrar co-campeones juntos.
            const groups = {};
            const order = [];
            rows.forEach((r) => {
                const key = r.tournament_id || (r.tournament_name + "|" + r.finished_at);
                if (!groups[key]) { groups[key] = { row: r, names: [] }; order.push(key); }
                groups[key].names.push(r.display_name);
            });
            const historyEl = document.getElementById("tournament-history");
            historyEl.innerHTML = "";
            order.forEach((key) => {
                const g = groups[key];
                const li = document.createElement("li");
                li.className = "border-b border-brand-100 dark:border-brand-800 pb-3 last:border-0";
                const fecha = new Date(g.row.finished_at).toLocaleDateString("es-CR", { year: "numeric", month: "long", day: "numeric" });
                li.innerHTML =
                    "<p class='font-semibold text-brand-800 dark:text-white'>" + escapeHtml(g.row.tournament_name) + "</p>" +
                    "<p class='text-xs text-brand-450 dark:text-brand-350'>" + (FORMAT_LABEL[g.row.format] || g.row.format) + " · " + (VARIANT_LABEL[g.row.variant] || g.row.variant) + " · " + fecha + "</p>" +
                    "<p class='text-sm text-accent-600 dark:text-accent-400 font-medium'>🏆 " + g.names.map(escapeHtml).join(" y ") + "</p>";
                historyEl.appendChild(li);
            });
            document.getElementById("history-empty").classList.toggle("hidden", order.length > 0);
        }
        load();
    