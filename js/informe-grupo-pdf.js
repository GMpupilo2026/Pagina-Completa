/**
 * Ajedrez Integral — el informe de un grupo, en PDF.
 *
 * Para una reunión con las familias o con el colegio: un documento con lo que
 * pasa con el grupo (asistencia, tiempo, participación en clase y lo que dijo
 * el diagnóstico, área por área) y una fila por alumno. Sale de Informes
 * («📄 Informe del grupo en PDF»), con el grupo elegido arriba.
 *
 * NO cuenta nada por su cuenta. Los números son los que la página ya pintó
 * (informes_resumen_alumnos, la asistencia sin las faltas justificadas, el
 * nivel de PlanEntrenamiento.resumir): un PDF que diga otra cosa que la
 * pantalla sería peor que no tenerlo. El PDF lo escribe js/reporte-pdf.js, el
 * mismo de los reportes de actividades, con la marca de agua de
 * js/marca-agua.js. Ver «El informe del grupo en PDF» en
 * docs/decisiones/informes.md.
 *
 *   InformeGrupoPDF.documento(datos) → el documento neutral (para probarlo)
 *   InformeGrupoPDF.descargar(datos) → lo baja
 *
 * datos = { grupo, profesor, fecha, clasesCerradas,
 *           alumnos: [{ nombre, asistencia: { fue, just, tasa }, minutosClase,
 *                       minutosEjercicios, respuestas, correctas, nivel: { etiqueta, elo } | null }],
 *           areas: [{ nombre, promedio, banda }] }
 */
(function () {
  "use strict";

  // Un emoji no tiene dibujo en Helvetica: se quita, con su espacio.
  const sinEmoji = (s) => String(s == null ? "" : s)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ").trim();

  function duracion(min) {
    const m = Math.round(min || 0);
    if (!m) return "0 min";
    const h = Math.floor(m / 60), r = m % 60;
    return h ? h + " h" + (r ? " " + r + " min" : "") : r + " min";
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const media = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

  function fechaLarga(d) {
    const x = d instanceof Date ? d : new Date(d || Date.now());
    return x.toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" });
  }

  function documento(datos) {
    const d = datos || {};
    const alumnos = (d.alumnos || []).slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));
    const n = alumnos.length;
    const grupo = sinEmoji(d.grupo || "");
    const bloques = [];

    // --- El resumen: lo que se lee primero y muchas veces lo único.
    const tasas = alumnos.filter(() => (d.clasesCerradas || 0) > 0).map((a) => a.asistencia ? a.asistencia.tasa : 0);
    const minClase = alumnos.reduce((s, a) => s + (a.minutosClase || 0), 0);
    const minEj = alumnos.reduce((s, a) => s + (a.minutosEjercicios || 0), 0);
    const resp = alumnos.reduce((s, a) => s + (a.respuestas || 0), 0);
    const bien = alumnos.reduce((s, a) => s + (a.correctas || 0), 0);
    const conDiag = alumnos.filter((a) => a.nivel);
    const lineas = [
      n === 1 ? "1 alumno." : n + " alumnos.",
      tasas.length ? "Asistencia promedio: " + media(tasas) + " % de " + d.clasesCerradas + (d.clasesCerradas === 1 ? " clase" : " clases") + " (las faltas justificadas no cuentan en contra)." : "Todavía no hay clases cerradas en la plataforma.",
      "Tiempo en la plataforma: " + duracion(minClase) + " en clase y " + duracion(minEj) + " en ejercicios, entre todos.",
      resp ? "Participación en clase: " + resp + (resp === 1 ? " respuesta" : " respuestas") + " a las preguntas del profesor, " + pct(bien, resp) + " % correctas." : "Todavía no hay respuestas a preguntas de la clase.",
      conDiag.length
        ? "Diagnóstico de nivel: lo hicieron " + conDiag.length + " de " + n + "; fuerza media ≈" + media(conDiag.map((a) => a.nivel.elo)) + " puntos Elo."
        : "Ningún alumno del grupo ha hecho el diagnóstico de nivel.",
    ];
    bloques.push({ tipo: "titulo", texto: "Resumen" });
    bloques.push({ tipo: "lista", items: lineas });

    // --- Áreas: dónde está firme el grupo y dónde hay que trabajar.
    const areas = (d.areas || []).slice().sort((a, b) => a.promedio - b.promedio);
    if (areas.length && conDiag.length) {
      bloques.push({ tipo: "titulo", texto: "Por áreas" });
      bloques.push({ tipo: "parrafo", texto: "Promedio del grupo en cada área del diagnóstico, de la más floja a la más firme. Rendir lo esperable para su nivel es 70." });
      bloques.push({
        tipo: "tabla", encabezados: ["Área", "Promedio", "Cómo está"], anchos: [3, 1, 2],
        filas: areas.map((a) => [sinEmoji(a.nombre), String(a.promedio), sinEmoji(a.banda || "")]),
      });
      const floja = areas[0], firme = areas[areas.length - 1];
      if (floja && firme && floja !== firme) {
        bloques.push({ tipo: "nota", texto: "Para las próximas clases: reforzar " + sinEmoji(floja.nombre).toLowerCase() + "; el punto fuerte del grupo es " + sinEmoji(firme.nombre).toLowerCase() + "." });
      }
    }

    // --- Cada alumno, en una fila.
    bloques.push({ tipo: "titulo", texto: "Cada alumno" });
    bloques.push({
      tipo: "tabla",
      encabezados: ["Alumno", "Asistencia", "Tiempo", "Participación", "Nivel"],
      anchos: [3, 1.6, 1.8, 2, 2],
      filas: alumnos.map((a) => {
        const as = a.asistencia || { fue: 0, just: 0, tasa: 0 };
        const asistencia = (d.clasesCerradas ? as.fue + "/" + d.clasesCerradas + " (" + as.tasa + " %)" : "—") + (as.just ? ", " + as.just + " just." : "");
        const tiempo = duracion((a.minutosClase || 0) + (a.minutosEjercicios || 0));
        const part = a.respuestas ? a.respuestas + " resp., " + pct(a.correctas || 0, a.respuestas) + " %" : "—";
        const nivel = a.nivel ? sinEmoji(a.nivel.etiqueta) + " (≈" + a.nivel.elo + ")" : "Sin diagnóstico";
        return [sinEmoji(a.nombre), asistencia, tiempo, part, nivel];
      }),
    });
    bloques.push({ tipo: "nota", texto: "Asistencia: clases a las que vino sobre las cerradas en la plataforma (las justificadas no cuentan en contra). Tiempo: en clase y en ejercicios, desde que empezó. Participación: respuestas a las preguntas del profesor en la clase en vivo y cuántas fueron correctas. Nivel: el del último diagnóstico." });

    return {
      titulo: grupo ? "Informe del grupo " + grupo : "Informe de mis alumnos",
      subtitulo: [sinEmoji(d.profesor || ""), fechaLarga(d.fecha), "Ajedrez Integral"].filter(Boolean).join(" · "),
      bloques,
      fotos: [],
    };
  }

  function nombreArchivo(datos) {
    const base = String((datos && datos.grupo) || "mis-alumnos").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grupo";
    return "informe-" + base + ".pdf";
  }

  async function descargar(datos) {
    const doc = documento(datos);
    try { doc.marca = window.MarcaAgua ? await window.MarcaAgua.preparar() : null; } catch (e) { doc.marca = null; }
    const blob = await window.ReportePDF.generar(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo(datos);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { blob, nombre: a.download };
  }

  const api = { documento, descargar, nombreArchivo };
  if (typeof window !== "undefined") window.InformeGrupoPDF = api;
  if (typeof module !== "undefined") module.exports = api;
})();
