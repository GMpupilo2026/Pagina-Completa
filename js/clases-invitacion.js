/* El código de clases.html.

   Vivía escrito dentro de la página, en un <script> de 1 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        /* Red de seguridad para el enlace de la invitación.
           Ese enlace tiene que llevar a /bienvenida.html, que es donde el alumno
           crea su contraseña. Pero a dónde puede mandar lo decide la lista de
           "Redirect URLs" de Supabase Auth, que vive FUERA del repositorio: si
           esa dirección no está permitida, Supabase manda al Site URL —o sea
           aquí— y el alumno entra con sesión y sin contraseña puesta, que es
           exactamente el agujero que este cambio viene a tapar. Y no daría
           ningún error: simplemente ese alumno no podría volver mañana.
           El token viaja igual al destino, así que si llega con marca de
           invitación o de recuperación, se lo manda a donde iba.
           Va antes del cliente de Supabase porque el cliente LIMPIA el hash. */
        (function () {
            var h = window.location.hash || "";
            if (/[#&]type=(invite|recovery)\b/.test(h)) {
                window.location.replace("bienvenida.html" + h);
            }
        })();
    