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
    return h ? h + " h" + (m ? " " + m + " min" : "") : m + " min";
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
    /* Las clases son de DOS clases y el informe tiene que decirlo: las de la
       plataforma (el tablero en vivo, que se abre y se cierra solo) y las
       presenciales, que el profesor anota en su ficha de asistencia. Meterlas
       todas dentro de "N clases en vivo" —como decía este párrafo cuando lo
       único que había era la plataforma— es decir algo que no es, y un informe
       que miente se ve exactamente igual de bien que uno que no.

       Los totales vienen partidos de reporte_actividades(); si llegaran sin
       partir (una versión vieja de la función), se asume que todas son de la
       plataforma, que es lo que eran antes de existir la ficha. */
    const presenciales = t.clases_presenciales || 0;
    const enLinea = (t.clases_en_linea == null) ? clases - presenciales : t.clases_en_linea;
    const cuantasClases = (n) => n + (n === 1 ? " clase" : " clases");

    if (clases === 0) {
      bloques.push({ tipo: "parrafo", texto:
        "En este periodo no quedó registrada ninguna clase. " +
        "Si hubo clases, es que no se abrieron desde la plataforma ni se les llenó la ficha " +
        "de asistencia presencial: lo que se cuenta acá es lo que quedó registrado, no lo que se hizo." });
    } else {
      const aciertos = t.respuestas ? Math.round((t.aciertos / t.respuestas) * 100) : null;
      // Cómo se reparten se dice en palabras y solo cuando hay de las dos: con
      // un solo tipo, "y ninguna presencial" es ruido en todas las visitas.
      let reparto = "";
      if (presenciales && enLinea) {
        reparto = " — " + cuantasClases(presenciales) + " presenciales y " +
                  cuantasClases(enLinea) + " en la plataforma";
      } else if (presenciales) {
        reparto = ", todas presenciales";
      } else {
        reparto = ", todas en la plataforma";
      }
      bloques.push({ tipo: "parrafo", texto:
        "Se impartieron " + cuantasClases(clases) + reparto + ", con " + (t.asistencias || 0) +
        ((t.asistencias === 1) ? " asistencia" : " asistencias") + " de " + estudiantes +
        (estudiantes === 1 ? " estudiante" : " estudiantes distintos") + ". " +
        "En total suman " + duracionLarga(t.minutos || 0) + " de trabajo en clase" +
        (t.preguntas ? ", y se plantearon " + t.preguntas + " posiciones en la pizarra" +
          (aciertos !== null ? ", con un " + aciertos + " % de respuestas correctas" : "") : "") + "." });
    }

    const filasResumen = [["Clases impartidas", String(clases)]];
    if (presenciales && enLinea) {
      filasResumen.push(["— de ellas, presenciales", String(presenciales)]);
      filasResumen.push(["— de ellas, en la plataforma", String(enLinea)]);
    }
    filasResumen.push(
      ["Estudiantes distintos que asistieron", String(estudiantes)],
      ["Asistencias registradas", String(t.asistencias || 0)],
      ["Tiempo total en clase", duracionLarga(t.minutos || 0)],
      ["Posiciones planteadas en pizarra", String(t.preguntas || 0)],
      ["Respuestas de los estudiantes", String(t.respuestas || 0)]);
    bloques.push({ tipo: "tabla",
      encabezados: ["Indicador", "Cantidad"],
      anchos: [3, 1],
      filas: filasResumen });

    /* --- 2. Clase por clase: fechas y contenido -------------------------- */
    if ((datos.clases || []).length) {
      bloques.push({ tipo: "titulo", texto: "Detalle de las clases" });
      /* La columna "Dónde" va ESCRITA y no como un color o un icono: este
         informe se imprime, se manda por correo y lo lee alguien que no sabe
         nada de la plataforma. Es la misma regla que las barras de Informes. */
      bloques.push({ tipo: "tabla",
        encabezados: ["Fecha", "Hora", "Clase", "Dónde", "Duración", "Asistentes"],
        anchos: [1.1, 0.7, 2.3, 0.9, 0.9, 0.9],
        filas: datos.clases.map((c) => [
          fechaCorta(c.started_at), hora(c.started_at), c.title || "(sin título)",
          c.modalidad === "presencial" ? "Presencial" : "Plataforma",
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
      // La columna de presenciales solo aparece cuando hay alguna: una columna
      // entera de ceros ocupa ancho y no dice nada.
      const hayPresenciales = presenciales > 0;
      bloques.push({ tipo: "tabla",
        encabezados: hayPresenciales
          ? ["Estudiante", "Grupo", "Clases", "De ellas presenciales", "Tiempo en clase"]
          : ["Estudiante", "Grupo", "Clases", "Tiempo en clase"],
        anchos: hayPresenciales ? [2.6, 1.1, 0.8, 1.1, 1.2] : [3, 1.2, 0.8, 1.3],
        filas: datos.estudiantes.map((s) => hayPresenciales
          ? [s.full_name || "(sin nombre)", s.grupo || "—", String(s.clases || 0),
             String(s.clases_presenciales || 0), duracionLarga(s.minutos || 0)]
          : [s.full_name || "(sin nombre)", s.grupo || "—",
             String(s.clases || 0), duracionLarga(s.minutos || 0)]) });
      bloques.push({ tipo: "nota", texto:
        "El tiempo en clase se cuenta uniendo los tramos que se solapan, así que dos " +
        "pestañas abiertas a la vez no lo cuentan dos veces. Es el mismo número que " +
        "muestra la página de Informes." +
        (hayPresenciales
          ? " En las clases presenciales el tramo es la duración que anotó quien dio la clase " +
            "al pasar lista, no una medición de la plataforma."
          : "") });
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

  /* =====================================================================
     EL INFORME DE CLASES DADAS POR FUERA DE LA PLATAFORMA

     Acá no hay base que consultar: TODO sale de lo que se cargó. La asistencia
     la recopila js/reporte-asistencia.js desde las hojas de Excel, y lo que se
     enseñó sale de los documentos que escribió quien dio la clase
     (js/reporte-textos.js).

     La gracia está en JUNTARLOS POR FECHA: cada clase queda con su asistencia
     y con lo que se trabajó ese día, en vez de dos listas sueltas que hay que
     ir cruzando a mano. Eso es lo que convierte un montón de archivos en un
     informe.
     ===================================================================== */
  function armarExterno(asistencia, documentos, archivos, extra) {
    const a = archivos || {};
    const e = extra || {};
    const docs = documentos || [];
    const bloques = [];
    const t = asistencia.totales || {};
    const clases = asistencia.clases || [];

    // El periodo sale de las fechas que traían las hojas.
    const fechas = clases.map((c) => c.fecha).filter((f) => /\d{2}\/\d{2}\/\d{4}/.test(f));
    const aIso = (f) => { const p = f.split("/"); return p[2] + "-" + p[1] + "-" + p[0]; };
    const ordenadas = fechas.slice().sort((x, y) => aIso(x).localeCompare(aIso(y)));
    const periodo = ordenadas.length
      ? periodoLargo(aIso(ordenadas[0]), aIso(ordenadas[ordenadas.length - 1]))
      : "sin fechas en los archivos";

    /* --- 1. El resumen --------------------------------------------------- */
    bloques.push({ tipo: "titulo", texto: "Resumen del periodo" });
    if (e.introduccion && e.introduccion.trim()) {
      bloques.push({ tipo: "parrafo", texto: e.introduccion.trim() });
    }

    if (!clases.length) {
      bloques.push({ tipo: "parrafo", texto:
        "No se pudo leer ninguna asistencia de los archivos cargados. Revisa que la hoja " +
        "tenga una columna con los nombres y, o bien una columna de fecha, o bien las " +
        "fechas en los encabezados de las columnas." });
    } else {
      bloques.push({ tipo: "parrafo", texto:
        "Se impartieron " + t.clases + (t.clases === 1 ? " clase" : " clases") + " con " +
        t.estudiantes + (t.estudiantes === 1 ? " estudiante" : " estudiantes distintos") + ". " +
        "Se registraron " + t.asistencias + " asistencias y " + t.ausencias +
        (t.ausencias === 1 ? " ausencia" : " ausencias") + ", o sea un " + t.porcentaje +
        " % de asistencia en el periodo." });

      bloques.push({ tipo: "tabla",
        encabezados: ["Indicador", "Cantidad"],
        anchos: [3, 1],
        filas: [
          ["Clases impartidas", String(t.clases)],
          ["Estudiantes distintos", String(t.estudiantes)],
          ["Asistencias registradas", String(t.asistencias)],
          ["Ausencias registradas", String(t.ausencias)],
          ["Asistencia del grupo", t.porcentaje + " %"],
        ] });
    }

    /* --- 2. Clase por clase, con lo que se trabajó ese día ---------------- */
    // Las secciones de los documentos, indexadas por fecha.
    const porFecha = new Map();
    const sueltas = [];
    for (const doc of docs) {
      for (const s of doc.secciones || []) {
        if (s.fecha) {
          if (!porFecha.has(s.fecha)) porFecha.set(s.fecha, []);
          porFecha.get(s.fecha).push(s);
        } else if ((s.texto || "").trim()) {
          sueltas.push(Object.assign({ documento: doc.nombre }, s));
        }
      }
    }

    if (clases.length) {
      bloques.push({ tipo: "titulo", texto: "Asistencia por clase" });
      bloques.push({ tipo: "tabla",
        encabezados: ["Fecha", "Clase", "Presentes", "Ausentes", "Asistencia"],
        anchos: [1.1, 2.4, 0.9, 0.9, 1],
        filas: clases.map((c) => {
          const total = c.presentes.length + c.ausentes.length;
          const titulo = c.clase || (porFecha.get(c.fecha) || []).map((s) => s.titulo).filter(Boolean)[0] || "—";
          return [c.fecha, limpiarTitulo(titulo, c.fecha), String(c.presentes.length),
                  String(c.ausentes.length),
                  (total ? Math.round((c.presentes.length / total) * 100) : 0) + " %"];
        }) });

      // El detalle de cada clase: quién faltó y qué se trabajó.
      bloques.push({ tipo: "titulo", texto: "Detalle de cada clase" });
      for (const c of clases) {
        const secciones = porFecha.get(c.fecha) || [];
        const titulo = c.clase || secciones.map((s) => s.titulo).filter(Boolean)[0] || "";
        bloques.push({ tipo: "subtitulo",
          texto: c.fecha + (titulo ? " · " + limpiarTitulo(titulo, c.fecha) : "") });
        bloques.push({ tipo: "parrafo", texto:
          "Asistieron " + c.presentes.length + " de " +
          (c.presentes.length + c.ausentes.length) + ". " +
          (c.ausentes.length
            ? "No vinieron: " + c.ausentes.slice().sort((x, y) => x.localeCompare(y, "es")).join(", ") + "."
            : "No faltó nadie.") });
        // Lo que escribió quien dio la clase, tal cual: acá no se resume nada.
        for (const s of secciones) {
          if ((s.texto || "").trim()) bloques.push({ tipo: "parrafo", texto: s.texto.trim() });
        }
      }
    }

    /* --- 3. Asistencia por estudiante ------------------------------------ */
    if ((asistencia.estudiantes || []).length) {
      bloques.push({ tipo: "titulo", texto: "Asistencia por estudiante" });
      bloques.push({ tipo: "tabla",
        encabezados: ["Estudiante", "Asistió a", "De", "Asistencia"],
        anchos: [3, 1, 0.8, 1],
        filas: asistencia.estudiantes.map((s) => [
          s.estudiante, String(s.asistio), String(s.posibles), s.porcentaje + " %",
        ]) });

      // A quién hay que mirar: el dato por el que suelen preguntar.
      const flojos = asistencia.estudiantes.filter((s) => s.porcentaje < 70 && s.posibles >= 2);
      if (flojos.length) {
        bloques.push({ tipo: "parrafo", texto:
          "Por debajo del 70 % de asistencia: " +
          flojos.map((s) => s.estudiante + " (" + s.porcentaje + " %)").join(", ") + "." });
      }
    }

    /* --- 4. Lo que quedó sin fecha --------------------------------------- */
    if (sueltas.length) {
      bloques.push({ tipo: "titulo", texto: "Otras notas de los documentos" });
      bloques.push({ tipo: "nota", texto:
        "Esto venía en los documentos sin una fecha que permitiera ponerlo en una clase." });
      for (const s of sueltas) {
        bloques.push({ tipo: "parrafo", texto: s.texto.trim() });
      }
    }

    /* --- 5. Grabaciones, fotos y respaldo -------------------------------- */
    const conTexto = (a.grabaciones || []).filter((g) => (g.transcripcion || "").trim());
    if (conTexto.length) {
      bloques.push({ tipo: "titulo", texto: "Lo que se trabajó, según las grabaciones" });
      for (const g of conTexto) {
        bloques.push({ tipo: "subtitulo", texto: g.nombre });
        bloques.push({ tipo: "parrafo", texto: g.transcripcion.trim() });
      }
    }

    if ((a.fotos || []).length) {
      bloques.push({ tipo: "titulo", texto: "Registro fotográfico" });
      for (const foto of a.fotos) {
        bloques.push({ tipo: "foto", foto: foto, anchoMax: 330, pie: foto.pie || foto.nombre || "" });
      }
    }

    const adjuntos = []
      .concat((a.grabaciones || []).map((g) => [g.nombre, g.clase || "Grabación", tamanoLegible(g.tamano || 0), g.duracion || "—"]))
      .concat(docs.map((d) => [d.nombre, "Documento", tamanoLegible(d.tamano || 0), d.palabras + " palabras"]))
      .concat((a.fotos || []).map((f) => [f.nombre, "Fotografía", tamanoLegible(f.tamano || 0), "—"]))
      .concat((a.hojas || []).map((h) => [h.hoja, "Hoja de cálculo", tamanoLegible(h.tamano || 0), (h.filas ? h.filas.length - 1 : 0) + " filas"]));
    if (adjuntos.length) {
      bloques.push({ tipo: "titulo", texto: "Material de respaldo" });
      bloques.push({ tipo: "tabla",
        encabezados: ["Archivo", "Tipo", "Tamaño", "Detalle"],
        anchos: [3, 1.3, 1, 1.2],
        filas: adjuntos });
    }

    /* --- 6. De dónde salió cada número ----------------------------------- */
    /* Esto va DENTRO del informe, no en un rincón de la pantalla. Una hoja mal
       leída da números creíbles y equivocados; si el informe dice qué columna
       tomó por la fecha y qué marcas contó como presente, el error se ve de una
       ojeada — y quien lo recibe puede confiar en el resto. */
    if ((asistencia.hojas || []).length || (asistencia.problemas || []).length) {
      bloques.push({ tipo: "titulo", texto: "De dónde salen estos números" });
      for (const h of asistencia.hojas || []) {
        bloques.push({ tipo: "nota", texto: h.explicacion });
      }
      for (const problema of asistencia.problemas || []) {
        bloques.push({ tipo: "parrafo", texto: "Atención: " + problema });
      }
    }

    return {
      titulo: e.titulo && e.titulo.trim() ? e.titulo.trim() : "Informe de actividades de clases",
      subtitulo: (e.academia || "Ajedrez Integral") + " · " + periodo,
      autor: e.autor || "Oscar Angulo Cubero",
      pie: (e.autor || "Oscar Angulo Cubero") + " · " + (e.academia || "Ajedrez Integral") +
        " · informe generado el " + fechaCorta(new Date().toISOString()),
      fotos: a.fotos || [],
      marca: a.marca || null,
      bloques: bloques,
    };
  }

  /* El título de una sección suele repetir la fecha con la que empieza ("02/09/2026
     — Táctica"): en una tabla que ya tiene su columna de fecha, sobra. */
  function limpiarTitulo(titulo, fecha) {
    return String(titulo || "")
      .replace(/^\s*\d{1,2}[/\-.]\d{1,2}(?:[/\-.]\d{2,4})?\s*[-–—:·]?\s*/, "")
      .replace(/^\s*\d{4}-\d{2}-\d{2}\s*[-–—:·]?\s*/, "")
      .replace(/^\s*\d{1,2}\s+de\s+[a-záéíóú]+(?:\s+de\s+\d{4})?\s*[-–—:·]?\s*/i, "")
      .trim() || "—";
  }

  return {
    armar: armar,
    armarExterno: armarExterno,
    _periodoLargo: periodoLargo,
    _fechaCorta: fechaCorta,
    _fechaLarga: fechaLarga,
    _duracionLarga: duracionLarga,
    _tamanoLegible: tamanoLegible,
  };
})();
