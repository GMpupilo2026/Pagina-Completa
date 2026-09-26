/* El código de offline.html.

   Vivía escrito dentro de la página, en un <script> de 0 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        /* El botón no adivina: pregunta al navegador si ya hay red y solo
           entonces recarga. Recargar sin señal deja la misma pantalla y parece
           que el botón no sirve. */
        var estado = document.getElementById("estado");
        function intentar() {
            if (navigator.onLine) { location.reload(); return; }
            estado.textContent = "Todavía no hay señal. Revisa los datos o el wifi.";
        }
        document.getElementById("reintentar").addEventListener("click", intentar);
        window.addEventListener("online", function () {
            estado.textContent = "Volvió la señal. Cargando…";
            location.reload();
        });
    