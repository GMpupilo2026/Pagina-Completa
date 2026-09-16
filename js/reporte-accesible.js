/**
 * Ajedrez Integral — el mismo informe, en formato adaptado.
 *
 * Sale del MISMO documento que el PDF y el Word (js/reporte-armar.js), así que
 * dice exactamente lo mismo: no es un resumen ni una versión recortada.
 *
 * NO ES UN PDF, y eso es la decisión de fondo — la misma que ya se tomó con el
 * material de estudio de los cursos. Un PDF con marca de agua, tablas dibujadas
 * y fotos es lo peor que se le puede dar a un lector de pantalla: el orden de
 * lectura se desordena, la marca de agua se lee en medio del texto y las tablas
 * salen como una hilera de números sueltos. Un HTML sencillo, con los
 * encabezados en orden y las tablas marcadas como tablas, se recorre de un
 * tirón con cualquier lector.
 *
 * Sirve para dos personas distintas, y por eso son estas decisiones:
 *
 *   - Quien usa lector de pantalla: sin ninguna imagen (el verificador falla si
 *     aparece un <img>), encabezados sin saltos de nivel, tablas con <caption>
 *     y <th scope>, y las fotos DESCRITAS EN PALABRAS. Si una foto no trae
 *     descripción, se dice que no la trae en vez de callarlo: quien lee tiene
 *     derecho a saber que ahí hay algo que no puede ver.
 *   - Quien ve poco y necesita agrandar: una sola columna, texto de 1.15rem,
 *     interlínea de 1.8 y alto contraste, con su versión en oscuro.
 *
 * Va todo en un solo archivo, sin CSS ni fuentes de fuera: se manda por correo
 * y se abre en cualquier parte, también sin internet.
 */
window.ReporteAccesible = (function () {
  "use strict";

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const ESTILO = `
  /* Una sola columna y sin imágenes, a propósito: esta versión está hecha para
     lectores de pantalla y para quien necesita agrandar mucho el texto. */
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
         font-size: 1.15rem; line-height: 1.8; color: #102a43; background: #ffffff;
         max-width: 42rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  h1 { font-size: 1.7rem; line-height: 1.3; }
  h2 { font-size: 1.3rem; margin-top: 2.5rem; border-bottom: 2px solid #102a43; padding-bottom: .3rem; }
  h3 { font-size: 1.1rem; margin-top: 1.8rem; }
  a { color: #8a4a00; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  caption { text-align: left; font-weight: 700; padding-bottom: .4rem; }
  th, td { border: 1px solid #486581; padding: .5rem .6rem; text-align: left; vertical-align: top; }
  th { background: #f0f4f8; }
  .nota { font-size: .95rem; color: #334e68; }
  /* Fuera de la vista pero NO fuera del lector de pantalla: con display:none o
     visibility:hidden también desaparecería para quien lo necesita. */
  .solo-lectores { position: absolute; width: 1px; height: 1px; overflow: hidden;
                   clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
  .foto { border: 2px solid #243b53; border-radius: .5rem; padding: 1rem; margin: 1rem 0; }
  .sin-descripcion { border-left: 4px solid #8a4a00; padding-left: .8rem; }
  footer { margin-top: 3rem; border-top: 2px solid #102a43; padding-top: 1rem; font-size: .95rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #0a1f33; color: #f0f4f8; }
    h2, footer { border-color: #f0b429; }
    a { color: #f0b429; }
    th { background: #102a43; }
    th, td { border-color: #829ab1; }
    .nota { color: #bcccdc; }
    .foto { border-color: #829ab1; }
    .sin-descripcion { border-color: #f0b429; }
  }`;

  function tabla(bloque) {
    // Una tabla de verdad, con su título y sus encabezados marcados: así el
    // lector de pantalla puede decir "Fecha: 14/09/2026, Clase: Táctica básica"
    // en vez de soltar las celdas sueltas y sin contexto.
    //
    // El <caption> va SIEMPRE aunque repita el encabezado de arriba: quien usa
    // lector de pantalla puede saltar de tabla en tabla, sin pasar por los
    // encabezados, y ahí el nombre de la tabla es lo único que la identifica.
    // Pero se esconde a la vista cuando repite, porque en pantalla sí se ve
    // redundante: el mismo título dos veces seguidas.
    let html = "<table>";
    if (bloque.titulo) {
      html += '<caption' + (bloque.repiteEncabezado ? ' class="solo-lectores"' : "") + ">" +
        esc(bloque.titulo) + "</caption>";
    }
    html += "<thead><tr>" +
      bloque.encabezados.map((h) => '<th scope="col">' + esc(h) + "</th>").join("") +
      "</tr></thead><tbody>";
    for (const fila of bloque.filas) {
      html += "<tr>" + fila.map((c, i) =>
        (i === 0 ? '<th scope="row">' + esc(c) + "</th>" : "<td>" + esc(c) + "</td>")).join("") + "</tr>";
    }
    return html + "</tbody></table>";
  }

  /* El documento neutral usa "titulo" para lo que acá es <h2> y "subtitulo"
     para <h3>: no hay saltos de nivel, que es lo que rompe la navegación por
     encabezados de un lector de pantalla. */
  function generar(documento) {
    const autor = documento.autor || "Oscar Angulo Cubero";
    let cuerpo = "";

    // Las tablas heredan como título el último encabezado que vieron: sin eso,
    // quien salta de tabla en tabla no sabe cuál está oyendo.
    let ultimoTitulo = "";

    for (const b of documento.bloques || []) {
      if (b.tipo === "titulo") { ultimoTitulo = b.texto; cuerpo += "<h2>" + esc(b.texto) + "</h2>\n"; }
      else if (b.tipo === "subtitulo") { ultimoTitulo = b.texto; cuerpo += "<h3>" + esc(b.texto) + "</h3>\n"; }
      else if (b.tipo === "parrafo") cuerpo += "<p>" + esc(b.texto) + "</p>\n";
      else if (b.tipo === "nota") cuerpo += '<p class="nota">' + esc(b.texto) + "</p>\n";
      else if (b.tipo === "lista") {
        cuerpo += "<ul>\n" + b.items.map((i) => "  <li>" + esc(i) + "</li>").join("\n") + "\n</ul>\n";
      } else if (b.tipo === "tabla") {
        cuerpo += tabla({ titulo: ultimoTitulo, repiteEncabezado: true,
                          encabezados: b.encabezados, filas: b.filas }) + "\n";
      } else if (b.tipo === "foto") {
        // NINGUNA imagen: se cuenta lo que hay. Y si no hay descripción, se
        // dice — callarlo dejaría a quien lee creyendo que no se perdió nada.
        const pie = (b.pie || "").trim();
        const nombre = (b.foto && b.foto.nombre) || "fotografía";
        const distinta = pie && pie !== nombre;
        cuerpo += '<div class="foto' + (distinta ? "" : " sin-descripcion") + '">\n';
        cuerpo += "  <p><strong>Fotografía:</strong> " + esc(nombre) + "</p>\n";
        cuerpo += distinta
          ? "  <p>" + esc(pie) + "</p>\n"
          : "  <p>Esta fotografía no trae descripción escrita, así que su contenido no está " +
            "disponible en esta versión. Quien preparó el informe puede agregarla.</p>\n";
        cuerpo += "</div>\n";
      } else if (b.tipo === "separador") cuerpo += "<hr>\n";
    }

    return new Blob([
      "<!doctype html>\n<html lang=\"es\">\n<head>\n" +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      "<title>" + esc(documento.titulo) + " — formato adaptado</title>\n" +
      '<meta name="robots" content="noindex">\n' +
      '<meta name="author" content="' + esc(autor) + '">\n' +
      '<meta name="description" content="' + esc(documento.titulo + " · " + (documento.subtitulo || "")) + '">\n' +
      "<style>" + ESTILO + "\n</style>\n</head>\n<body>\n" +
      "<header>\n" +
      "  <h1>" + esc(documento.titulo) + "</h1>\n" +
      "  <p>" + esc(documento.subtitulo || "") + "</p>\n" +
      "  <p>Informe en formato adaptado. Autor: " + esc(autor) + ", Ajedrez Integral.</p>\n" +
      "  <p>Esta versión dice en palabras lo mismo que el informe en PDF y en Word, sin " +
      "ninguna imagen: las tablas están marcadas como tablas y los encabezados van en orden, " +
      "así que se puede recorrer entera con un lector de pantalla o agrandando el texto.</p>\n" +
      "</header>\n\n" + cuerpo + "\n" +
      "<footer>\n" +
      "  <p>© " + new Date().getFullYear() + " " + esc(autor) + " · Ajedrez Integral. " +
      "Informe de uso interno de la Academia.</p>\n" +
      "  <p>No se autoriza su reproducción ni su distribución fuera de ella.</p>\n" +
      "  <p class=\"nota\">" + esc(documento.pie || "") + "</p>\n" +
      "</footer>\n</body>\n</html>\n",
    ], { type: "text/html;charset=utf-8" });
  }

  return { generar: generar };
})();
