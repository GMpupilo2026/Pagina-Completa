/**
 * Pareo Integral — Clasificación y Tabla cruzada en PDF, de verdad.
 *
 * Antes solo había «Imprimir» (window.print() con CSS de impresión): bueno
 * para pegarlo en la pared, pero no para mandarlo por correo o adjuntarlo al
 * informe de un torneo. Esto arma el documento neutral que ya sabe dibujar
 * js/reporte-pdf.js (el mismo de los informes de actividades), sin agregar
 * ninguna librería — ver la cabecera de ese archivo. Con la marca de agua de
 * Ajedrez Integral (el caballo y «AJEDREZ INTEGRAL», sin el nombre de Oscar),
 * armada con js/marca-agua.js: la pidió el dueño del sitio en todas las hojas
 * de Pareo Integral.
 *
 * El módulo no toca el DOM ni sabe de js/pareo/pagina.js: recibe encabezados,
 * anchos y filas ya armados (y ya en el idioma elegido), así que
 * `documento()` se puede probar con Node, sin navegador.
 *
 *   PareoPDF.documento(d) → el documento neutral (para probarlo), con
 *     d = { titulo, subtitulo, encabezados, anchos, filas, notas }
 *   PareoPDF.nombreArchivo(nombreTorneo, sufijo) → "torneo-sufijo.pdf"
 *   PareoPDF.bajar(d, nombreArchivo) → lo arma y lo baja
 *   PareoPDF.generar(doc) → el Blob de cualquier documento, con la marca
 */
(function (raiz) {
  "use strict";

  function documento(d) {
    const bloques = [{ tipo: "tabla", encabezados: d.encabezados, anchos: d.anchos, filas: d.filas }];
    for (const nota of d.notas || []) bloques.push({ tipo: "nota", texto: nota });
    return {
      titulo: d.titulo || "",
      subtitulo: d.subtitulo || "",
      pie: "Pareo Integral · ajedrez-integral.com",
      bloques: bloques,
      fotos: [],
    };
  }

  function nombreArchivo(nombreTorneo, sufijo) {
    const base = String(nombreTorneo || "torneo").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "torneo";
    return base + "-" + sufijo + ".pdf";
  }

  // La de Ajedrez Integral (herramientas/marca-agua-ajedrez-integral.js), la
  // misma que sale en las hojas impresas desde pareo.html.
  const MARCA = "img/marca-agua-ajedrez-integral.png";
  // La marca de agua, si se puede armar: si el logo no baja (sin conexión
  // y sin haberlo guardado), el PDF sale igual, sin ella.
  async function conMarca(doc) {
    if (doc.marca || !raiz.MarcaAgua) return doc;
    try { return Object.assign({}, doc, { marca: await raiz.MarcaAgua.prepararDesde(MARCA) }); }
    catch (e) { return doc; }
  }
  async function generar(doc) { return raiz.ReportePDF.generar(await conMarca(doc)); }

  async function bajar(d, archivo) {
    const blob = await generar(documento(d));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = archivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { blob: blob, nombre: archivo };
  }

  const api = { documento: documento, nombreArchivo: nombreArchivo, bajar: bajar, generar: generar, conMarca: conMarca };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.PareoPDF = api;
})(typeof self !== "undefined" ? self : this);
