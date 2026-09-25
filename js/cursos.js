/* El código de cursos.html.

   Vivía escrito dentro de la página, en un <script> de 2 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        /* Filtro por nivel. Las tarjetas ya están en el HTML: esto solo las
           esconde. Por eso la barra arranca con `hidden` y se muestra desde
           acá — sin JavaScript no aparece un control que no haría nada, y los
           diez cursos se ven igual. */
        (function () {
            const barra = document.getElementById("filtro-cursos");
            const lista = document.getElementById("lista-cursos");
            if (!barra || !lista) return;
            const botones = Array.from(barra.querySelectorAll(".filtro-nivel"));
            const tarjetas = Array.from(lista.children);
            const aviso = document.getElementById("filtro-resultado");
            const vacio = document.getElementById("sin-resultados");

            const ELEGIDO = "bg-accent-500 border-accent-500 text-brand-900";
            const SUELTO = "bg-white dark:bg-brand-900 border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-200 hover:border-accent-500";

            function pintar(nivel) {
                botones.forEach((b) => {
                    const activo = b.dataset.nivel === nivel;
                    b.setAttribute("aria-pressed", activo ? "true" : "false");
                    b.className = "filtro-nivel px-4 py-2 rounded-full text-sm font-semibold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " + (activo ? ELEGIDO : SUELTO);
                });
                let visibles = 0;
                tarjetas.forEach((li) => {
                    const va = nivel === "todos" || li.dataset.nivel === nivel;
                    li.hidden = !va;
                    if (va) visibles++;
                });
                if (vacio) vacio.classList.toggle("hidden", visibles > 0);
                // Quien no ve la pantalla necesita que le digan cuántos quedaron.
                if (aviso) aviso.textContent = visibles === 1 ? "1 curso" : visibles + " cursos";
                try { history.replaceState(null, "", nivel === "todos" ? location.pathname : "?nivel=" + nivel); } catch (e) {}
            }

            botones.forEach((b) => b.addEventListener("click", () => pintar(b.dataset.nivel)));
            barra.classList.remove("hidden");

            // Se puede llegar directo a un nivel: cursos.html?nivel=avanzado
            let inicial = "todos";
            try {
                const pedido = new URLSearchParams(location.search).get("nivel");
                if (pedido && botones.some((b) => b.dataset.nivel === pedido)) inicial = pedido;
            } catch (e) {}
            pintar(inicial);
        })();
    