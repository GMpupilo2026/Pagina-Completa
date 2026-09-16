/**
 * Ajedrez Integral — arma el contenido del informe UNA sola vez.
 *
 * De acá sale una estructura neutral —títulos, párrafos, tablas, fotos— que
 * leen los tres: la vista previa de la página, el generador de PDF y el de
 * Word. Si cada uno armara su contenido por su lado, el PDF y el Word se
 * irían separando a la primera corrección, que es exactamente el problema que
 * ya se resolvió con el informe que llega a la casa (informe-html.ts).
 *
 * Lo que dice el informe sale de DOS sitios y conviene no mezclarlos:
 *
 *   - Los datos de la Academia (clases, fechas, asistencias, minutos) los da
 *     `public.reporte_actividades()`. Son los mismos números que muestra la
 *     página de Informes: no se recalculan acá.
 *   - Los archivos que la persona sube (fotos, hojas de Excel, grabaciones)
 *     son la evidencia. No se suben a ningún lado: se leen en el navegador,
 *     se meten en el documento y ahí termina. Nada de fotos de menores
 *     guardadas en un servidor.
 */
window.ReporteArmar = (function () {
  "use strict";

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  function fechaLarga(iso) {
    const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
    if (isNaN(d.getTime())) return iso;
    return d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear();
  }

  /* "del 1 al 30 de septiembre de 2026" y no "del 1 de septiembre de 2026 al 30
     de septiembre de 2026": es la portada de un informe que va a leer un jefe,
     y repetir el mes ahí se nota. */
  function periodoLargo(desde, hasta) {
    const a = new Date(desde + "T12:00:00"), b = new Date(hasta + "T12:00:00");
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return "del " + desde + " al " + hasta;
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
      if (a.getDate() === b.getDate()) return "el " + fechaLarga(desde);
      return "del " + a.getDate() + " al " + b.getDate() + " de " + MESES[b.getMonth()] + " de " + b.getFullYear();
    }
    if (a.getFullYear() === b.getFullYear()) {
      return "del " + a.getDate() + " de " + MESES[a.getMonth()] +
             " al " + b.getDate() + " de " + MESES[b.getMonth()] + " de " + b.getFullYear();
    }
    return "del " + fechaLarga(desde) + " al " + fechaLarga(hasta);
  }

  function fechaCorta(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function hora(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function duracionLarga(minutos) {
    if (!minutos) return "0 min";
    const h = Math.floor(minutos / 60), m = Math.round(minutos % 60);
    return h ? h + " h " + (m ? m + " min" : "") : m + " min";
  }

  const tamanoLegible = (bytes) => {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
    return bytes + " B";
  };

  /* ------------------------------------------------------------ el armado */

  /**
   * @param datos     lo que devuelve public.reporte_actividades()
   * @param archivos  { fotos: [...], hojas: [...], grabaciones: [...] }
   * @param extra     { academia, autor, preparadoPor, introduccion }
   */
  function armar(datos, archivos, extra) {
    const a = archivos || {};
    const e = extra || {};
    const t = datos.totales || {};
    const bloques = [];

    const periodo = periodoLargo(datos.desde, datos.hasta);

    /* --- 1. El resumen, que es lo único que muchos jefes van a leer ------- */
    bloques.push({ tipo: "titulo", texto: "Resumen del periodo" });

    if (e.introduccion && e.introduccion.trim()) {
      bloques.push({ tipo: "parrafo", texto: e.introduccion.trim() });
    }

    // Se escribe en palabras y no solo en una tabla: un informe que empieza con
    // una rejilla de números obliga a quien lo lee a interpretarlo.
    const clases = t.clases || 0;
    const estudiantes = t.estudiantes || 0;
    if (clases === 0) {
      bloques.push({ tipo: "parrafo", texto:
        "En este periodo no quedó registrada ninguna clase en la plataforma. " +
        "Si hubo clases, es que no se abrieron desde la Academia: lo que se cuenta acá " +
        "es lo que quedó registrado, no lo que se hizo." });
    } else {
      const aciertos = t.respuestas ? Math.round((t.aciertos / t.respuestas) * 100) : null;
      bloques.push({ tipo: "parrafo", texto:
        "Se impartieron " + clases + (clases === 1 ? " clase" : " clases") +
        " en vivo, con " + (t.asistencias || 0) +
        ((t.asistencias === 1) ? " asistencia" : " asistencias") + " de " + estudiantes +
        (estudiantes === 1 ? " estudiante" : " estudiantes distintos") + ". " +
        "En total suman " + duracionLarga(t.minutos || 0) + " de trabajo en clase" +
        (t.preguntas ? ", y se plantearon " + t.preguntas + " posiciones en la pizarra" +
          (aciertos !== null ? ", con un " + aciertos + " % de respuestas correctas" : "") : "") + "." });
    }

    bloques.push({ tipo: "tabla",
      encabezados: ["Indicador", "Cantidad"],
      anchos: [3, 1],
      filas: [
        ["Clases impartidas", String(clases)],
        ["Estudiantes distintos que asistieron", String(estudiantes)],
        ["Asistencias registradas", String(t.asistencias || 0)],
        ["Tiempo total en clase", duracionLarga(t.minutos || 0)],
        ["Posiciones planteadas en pizarra", String(t.preguntas || 0)],
        ["Respuestas de los estudiantes", String(t.respuestas || 0)],
      ] });

    /* --- 2. Clase por clase: fechas y contenido -------------------------- */
    if ((datos.clases || []).length) {
      bloques.push({ tipo: "titulo", texto: "Detalle de las clases" });
      bloques.push({ tipo: "tabla",
        encabezados: ["Fecha", "Hora", "Clase", "Duración", "Asistentes"],
        anchos: [1.1, 0.7, 2.6, 0.9, 0.9],
        filas: datos.clases.map((c) => [
          fechaCorta(c.started_at), hora(c.started_at), c.title || "(sin título)",
          c.duracion_min ? duracionLarga(c.duracion_min) : "sin cerrar",
          String(c.asistentes || 0),
        ]) });

      // Lo que se trabajó en cada clase, cuando el profesor lo anotó.
      const conNotas = datos.clases.filter((c) => (c.notes || "").trim());
      if (conNotas.length) {
        bloques.push({ tipo: "subtitulo", texto: "Lo que se trabajó" });
        for (const c of conNotas) {
          bloques.push({ tipo: "parrafo", texto: fechaCorta(c.started_at) + " · " + (c.title || "Clase") + ": " + c.notes.trim() });
        }
      }
    }

    /* --- 3. Asistencia por estudiante ------------------------------------ */
    if ((datos.estudiantes || []).length) {
      bloques.push({ tipo: "titulo", texto: "Asistencia por estudiante" });
      bloques.push({ tipo: "tabla",
        encabezados: ["Estudiante", "Grupo", "Clases", "Tiempo en clase"],
        anchos: [3, 1.2, 0.8, 1.3],
        filas: datos.estudiantes.map((s) => [
          s.full_name || "(sin nombre)", s.grupo || "—",
          String(s.clases || 0), duracionLarga(s.minutos || 0),
        ]) });
      bloques.push({ tipo: "nota", texto:
        "El tiempo en clase se cuenta uniendo los tramos que se solapan, así que dos " +
        "pestañas abiertas a la vez no lo cuentan dos veces. Es el mismo número que " +
        "muestra la página de Informes." });
    }

    /* --- 4. Lo que se subió: hojas de cálculo ---------------------------- */
    for (const hoja of a.hojas || []) {
      if (!hoja.filas || !hoja.filas.length) continue;
      bloques.push({ tipo: "titulo", texto: "Hoja adjunta: " + hoja.hoja });
      const encabezados = hoja.filas[0].map((c) => String(c || ""));
      const filas = hoja.filas.slice(1, 61).map((f) => {
        const copia = f.map((c) => String(c == null ? "" : c));
        while (copia.length < encabezados.length) copia.push("");
        return copia.slice(0, encabezados.length);
      });
      bloques.push({ tipo: "tabla", encabezados: encabezados, filas: filas,
        anchos: encabezados.map(() => 1) });
      if (hoja.filas.length > 61) {
        bloques.push({ tipo: "nota", texto:
          "La hoja trae " + (hoja.filas.length - 1) + " filas; acá van las primeras 60. " +
          "Una tabla más larga que eso no se lee en un informe: si hacen falta todas, " +
          "el archivo original va aparte." });
      }
    }

    /* --- 5. Lo que se dijo en clase (transcripción) ---------------------- */
    const conTexto = (a.grabaciones || []).filter((g) => (g.transcripcion || "").trim());
    if (conTexto.length) {
      bloques.push({ tipo: "titulo", texto: "Lo que se trabajó, según las grabaciones" });
      for (const g of conTexto) {
        bloques.push({ tipo: "subtitulo", texto: g.nombre });
        bloques.push({ tipo: "parrafo", texto: g.transcripcion.trim() });
      }
      bloques.push({ tipo: "nota", texto:
        "Las grabaciones se transcribieron en esta misma computadora: no se subieron a " +
        "ningún servicio. La transcripción es automática, así que puede traer errores de " +
        "nombres y de términos de ajedrez." });
    }

    /* --- 6. Evidencia: las fotos ---------------------------------------- */
    if ((a.fotos || []).length) {
      bloques.push({ tipo: "titulo", texto: "Registro fotográfico" });
      for (const foto of a.fotos) {
        bloques.push({ tipo: "foto", foto: foto, anchoMax: 330, pie: foto.pie || foto.nombre || "" });
      }
    }

    /* --- 7. Los archivos que respaldan el informe ------------------------ */
    const adjuntos = []
      .concat((a.grabaciones || []).map((g) => [g.nombre, g.clase || "Grabación", tamanoLegible(g.tamano || 0), g.duracion || "—"]))
      .concat((a.fotos || []).map((f) => [f.nombre, "Fotografía", tamanoLegible(f.tamano || 0), "—"]))
      .concat((a.hojas || []).map((h) => [h.hoja, "Hoja de cálculo", tamanoLegible(h.tamano || 0), (h.filas ? h.filas.length - 1 : 0) + " filas"]));
    if (adjuntos.length) {
      bloques.push({ tipo: "titulo", texto: "Material de respaldo" });
      bloques.push({ tipo: "tabla",
        encabezados: ["Archivo", "Tipo", "Tamaño", "Detalle"],
        anchos: [3, 1.3, 1, 1.2],
        filas: adjuntos });
      bloques.push({ tipo: "nota", texto:
        "Los archivos no se guardan en ningún servidor: se usaron para armar este informe " +
        "y quedan en poder de quien lo preparó." });
    }

    return {
      titulo: "Informe de actividades de clases",
      subtitulo: (e.academia || "Academia Ajedrez Integral") + " · " + periodo,
      autor: e.autor || "Oscar Angulo Cubero",
      pie: (e.autor || "Oscar Angulo Cubero") + " · " + (e.academia || "Ajedrez Integral") +
        " · informe generado el " + fechaCorta(datos.generado || new Date().toISOString()),
      fotos: a.fotos || [],
      marca: a.marca || null,
      bloques: bloques,
    };
  }

  return {
    armar: armar,
    _periodoLargo: periodoLargo,
    _fechaCorta: fechaCorta,
    _fechaLarga: fechaLarga,
    _duracionLarga: duracionLarga,
    _tamanoLegible: tamanoLegible,
  };
})();
