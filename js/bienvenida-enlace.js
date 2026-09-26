/* El código de bienvenida.html.

   Vivía escrito dentro de la página, en un <script> de 0 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        /* El enlace del correo llega con el token —o con el error— en el hash
           (#access_token=… / #error=…&error_code=otp_expired). El cliente de
           Supabase lo procesa y LIMPIA el hash al arrancar, así que hay que
           copiarlo antes de que eso pase: sin esto, un enlace vencido se vería
           como "no hay sesión" a secas y la página no podría decir por qué. */
        window.__entrada = { hash: window.location.hash || "", busqueda: window.location.search || "" };
    