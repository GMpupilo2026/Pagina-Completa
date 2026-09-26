/* El código de entreno/tactica.html.

   Vivía escrito dentro de la página, en un <script> de 0 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

    // Sola, pero con `replace` para no dejar esta página en el historial: quien
    // le dé "atrás" tiene que volver a donde venía, no rebotar de nuevo acá.
    window.location.replace('temas.html');
