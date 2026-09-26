/* El código de articulos.html.

   Vivía escrito dentro de la página, en un <script> de 1 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        const filterStatus = document.getElementById('filter-status');
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('active', 'bg-brand-700', 'text-white');
                    b.classList.add('bg-white', 'text-brand-600', 'border', 'border-brand-200');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('active', 'bg-brand-700', 'text-white');
                btn.classList.remove('bg-white', 'text-brand-600', 'border', 'border-brand-200');
                btn.setAttribute('aria-pressed', 'true');

                const filter = btn.dataset.filter;
                let shown = 0;
                document.querySelectorAll('.article-card').forEach(card => {
                    // Se oculta el enlace completo (no solo la tarjeta), para que un enlace
                    // vacío no quede alcanzable con Tab ni con el lector de pantalla.
                    const link = card.closest('a') || card;
                    const match = filter === 'all' || card.dataset.category === filter;
                    link.style.display = match ? '' : 'none';
                    if (match) shown++;
                });
                filterStatus.textContent = filter === 'all'
                    ? `Mostrando los ${shown} artículos.`
                    : `Mostrando ${shown} artículo${shown === 1 ? '' : 's'} en la categoría ${btn.dataset.label}.`;
            });
        });
    