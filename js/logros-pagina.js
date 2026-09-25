/* El código de logros.html.

   Vivía escrito dentro de la página, en un <script> de 7 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        const gate = document.getElementById('gate');
        const app = document.getElementById('app');
        const gateChecking = document.getElementById('gate-checking');
        const NEXT_PATH = 'logros.html';

        // Un nombre de sección por categoría, en el mismo orden en que el
        // catálogo ya las agrupa (js/logros-catalogo.js) — así no hace falta
        // una segunda lista con el orden a mano, que se iría separando de la
        // primera a la primera corrección.
        const CATEGORIA_TITULO = {
            racha: "Racha de días",
            ejercicios: "Ejercicios resueltos",
            variedad: "Variedad",
            dias: "Días de práctica",
            mates: "Mates",
            "4x4": "4×4",
            temas: "Ejercicios por tema",
            tactica: "Táctica de ataque",
            aprender: "Aprende",
            coordenadas: "Coordenadas",
            practicar: "Practicar",
            concentracion: "Concentración",
            diagnostico: "Diagnóstico de nivel",
            aperturas: "Aperturas y celadas",
            confites: "Confites del caballo",
            ilumina: "Ilumina el tablero",
            visualizacion: "Visualización",
        };
        const NIVEL_TEXTO = { bronce: "Bronce", plata: "Plata", oro: "Oro", diamante: "Diamante" };

        function fmt(n) { return new Intl.NumberFormat("es-CR").format(n); }

        function pintarRacha(stats) {
            document.getElementById("racha-actual").textContent = fmt(stats.racha_actual);
            const record = stats.racha_record > stats.racha_actual
                ? ` Tu récord es de ${fmt(stats.racha_record)} días.`
                : (stats.racha_record > 0 ? " Es tu récord — nunca habías llegado tan lejos." : "");
            document.getElementById("racha-record-texto").textContent =
                (stats.racha_actual > 0
                    ? `Llevas ${fmt(stats.racha_actual)} día${stats.racha_actual === 1 ? "" : "s"} seguidos con al menos 5 ejercicios.`
                    : "Todavía no tienes una racha activa — resuelve 5 ejercicios hoy para empezarla.") + record;

            const meta = window.Logros.META_DIARIA;
            const hoy = Math.min(stats.hoy_ejercicios, meta);
            document.getElementById("racha-hoy-texto").textContent = stats.hoy_ejercicios >= meta
                ? `Hoy ya llevas ${fmt(stats.hoy_ejercicios)} ejercicios — el día de hoy ya cuenta para la racha. ✅`
                : `Hoy llevas ${stats.hoy_ejercicios} de ${meta} ejercicios para que el día cuente.`;
            const barra = document.getElementById("racha-hoy-barra");
            barra.innerHTML = "";
            for (let i = 0; i < meta; i++) {
                const seg = document.createElement("span");
                seg.className = "h-2 flex-1 rounded-full " + (i < hoy ? "bg-accent-500" : "bg-brand-100 dark:bg-brand-800");
                barra.appendChild(seg);
            }
        }

        function tarjetaLogro(l) {
            const card = document.createElement("li");
            card.className = "flex flex-col gap-2 rounded-xl border p-4 " +
                (l.conseguido
                    ? "bg-white dark:bg-brand-900 border-accent-400 dark:border-accent-500"
                    : "bg-brand-50/60 dark:bg-brand-900/40 border-brand-100 dark:border-brand-800 opacity-75");
            const cabecera = document.createElement("div");
            cabecera.className = "flex items-start gap-3";
            const icono = document.createElement("span");
            icono.className = "text-2xl shrink-0";
            icono.setAttribute("aria-hidden", "true");
            icono.textContent = l.conseguido ? l.emoji : "🔒";
            const texto = document.createElement("div");
            texto.className = "flex-1 min-w-0";
            const nombre = document.createElement("p");
            nombre.className = "font-semibold text-sm text-brand-800 dark:text-white";
            nombre.textContent = l.nombre;
            const desc = document.createElement("p");
            desc.className = "text-xs text-brand-500 dark:text-brand-300 mt-0.5";
            desc.textContent = l.descripcion;
            texto.append(nombre, desc);
            cabecera.append(icono, texto);

            const pie = document.createElement("div");
            pie.className = "flex items-center justify-between gap-2 mt-auto pt-1";
            const nivel = document.createElement("span");
            nivel.className = "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-500 dark:text-brand-300";
            nivel.textContent = NIVEL_TEXTO[l.nivel] || l.nivel;
            const progreso = document.createElement("span");
            progreso.className = "text-xs font-medium " + (l.conseguido ? "text-accent-700 dark:text-accent-400" : "text-brand-450 dark:text-brand-350");
            progreso.textContent = l.conseguido ? "Conseguido ✔" : `${fmt(l.valor)} / ${fmt(l.meta)}`;
            pie.append(nivel, progreso);

            const barra = document.createElement("div");
            barra.className = "h-1.5 rounded-full bg-brand-100 dark:bg-brand-800 overflow-hidden";
            const relleno = document.createElement("div");
            relleno.className = "h-full rounded-full " + (l.conseguido ? "bg-accent-500" : "bg-brand-300 dark:bg-brand-600");
            relleno.style.width = Math.round(l.progreso * 100) + "%";
            barra.appendChild(relleno);

            card.append(cabecera, barra, pie);
            return card;
        }

        function pintarLogros(logros) {
            const cont = document.getElementById("logros-grid");
            cont.innerHTML = "";
            let categoriaActual = null, ul = null;
            logros.forEach((l) => {
                if (l.categoria !== categoriaActual) {
                    categoriaActual = l.categoria;
                    const section = document.createElement("section");
                    const conseguidos = logros.filter((x) => x.categoria === categoriaActual && x.conseguido).length;
                    const total = logros.filter((x) => x.categoria === categoriaActual).length;
                    const h2 = document.createElement("h2");
                    h2.className = "font-serif text-lg font-bold text-brand-800 dark:text-white mb-3 mt-8 first:mt-0";
                    h2.textContent = (CATEGORIA_TITULO[categoriaActual] || categoriaActual) + ` (${conseguidos}/${total})`;
                    ul = document.createElement("ul");
                    ul.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3";
                    section.append(h2, ul);
                    cont.appendChild(section);
                }
                ul.appendChild(tarjetaLogro(l));
            });
        }

        async function unlock() {
            gate.classList.add("hidden");
            app.classList.remove("hidden");
            const { stats, logros, error } = await window.Logros.cargar();
            document.getElementById("sin-sesion-aviso").classList.toggle("hidden", !error);
            pintarRacha(stats);
            pintarLogros(logros);
        }

        // Igual que Entrenamiento: exige sesión iniciada en el sitio, porque
        // la racha y los logros salen de training_progress y son de cada
        // cuenta, no del aparato.
        async function requireLoginThenGate() {
            let hasSession = false;
            try {
                const { data } = await sb.auth.getSession();
                hasSession = !!(data && data.session);
            } catch (e) {
                hasSession = false;
            }
            if (!hasSession) {
                gateChecking.textContent = "Necesitas iniciar sesión en el sitio para ver tus logros. Redirigiendo a iniciar sesión…";
                window.location.href = "login.html?next=" + encodeURIComponent(NEXT_PATH);
                return;
            }
            gateChecking.classList.add("hidden");
            unlock();
        }

        requireLoginThenGate();
    