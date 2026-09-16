/**
 * Ajedrez Integral — entender una hoja de asistencia hecha a mano.
 *
 * Esto es para las clases que se dan FUERA de la plataforma: no hay base de
 * datos que consultar, la única fuente es el Excel que llevó quien dio la
 * clase. Y ahí está la dificultad: esa hoja no la escribió un sistema, la
 * escribió una persona, y cada quien la lleva a su manera.
 *
 * SE RECONOCEN LAS DOS FORMAS EN QUE LA GENTE LLEVA ASISTENCIA:
 *
 *   1. Una fila por asistencia — "fecha | estudiante | asistió"
 *      Es la que sale de un formulario o de una app.
 *
 *   2. Matriz — los alumnos en las filas y las fechas en las columnas, con una
 *      marca en cada cruce. Es la que hace todo el mundo a mano, y la que una
 *      librería de Excel no entiende sola: para ella son columnas con nombres
 *      raros.
 *
 * LO QUE NO SE HACE, Y ES A PROPÓSITO: adivinar en silencio. El resultado
 * siempre dice QUÉ entendió —qué columna tomó por la fecha, cuál por el
 * nombre, qué marcas contó como presente— y esa explicación va dentro del
 * informe. Una hoja mal leída da números perfectamente creíbles y equivocados;
 * si el informe dice de dónde sacó cada cosa, el error se ve de una ojeada. Si
 * no entiende la hoja, lo dice y no inventa.
 */
window.ReporteAsistencia = (function () {
  "use strict";

  /* ------------------------------------------------------ reconocer textos */

  const normalizar = (s) => String(s == null ? "" : s).trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

  const ENCABEZADOS = {
    fecha: ["fecha", "dia", "day", "date", "sesion", "clase del"],
    estudiante: ["estudiante", "alumno", "alumna", "nombre", "participante", "student", "nombre completo"],
    asistio: ["asistio", "asistencia", "presente", "asiste", "vino", "attendance", "present"],
    clase: ["clase", "leccion", "tema", "grupo", "curso", "sesion", "actividad"],
  };

  function queColumna(texto) {
    const n = normalizar(texto);
    if (!n) return null;
    for (const clave of Object.keys(ENCABEZADOS)) {
      if (ENCABEZADOS[clave].some((p) => n === p || n.startsWith(p + " ") || n.indexOf(p) === 0)) return clave;
    }
    return null;
  }

  /* Las marcas que la gente usa para decir "vino" y para decir "no vino". */
  const PRESENTE = ["si", "sí", "x", "p", "1", "presente", "asistio", "v", "✓", "✔", "true", "verdadero", "ok"];
  const AUSENTE = ["no", "0", "a", "f", "ausente", "falta", "falto", "-", "--", "x?", "false", "falso"];

  function marcaDice(valor) {
    const n = normalizar(valor);
    if (n === "") return null;                        // celda vacía: no dice nada
    if (PRESENTE.indexOf(n) !== -1) return true;
    if (AUSENTE.indexOf(n) !== -1) return false;
    // Un número que no sea 0 ni 1 (una nota, por ejemplo) se toma como que vino:
    // si hay algo anotado ese día, es que estuvo.
    if (!isNaN(Number(n))) return Number(n) !== 0;
    return true;                                      // cualquier otra anotación
  }

  /* Una fecha, escrita como la escriba quien sea. Devuelve texto dd/mm/aaaa
     para poder agrupar, o null si no parece una fecha. */
  function comoFecha(valor) {
    const s = String(valor == null ? "" : valor).trim();
    if (!s) return null;
    let m = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?/.exec(s);
    if (m) {
      const d = Number(m[1]), mes = Number(m[2]);
      if (d > 31 || mes > 12) return null;
      let a = m[3] ? Number(m[3]) : new Date().getFullYear();
      if (a < 100) a += 2000;
      return String(d).padStart(2, "0") + "/" + String(mes).padStart(2, "0") + "/" + a;
    }
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);           // el formato que da una app
    if (m) return m[3] + "/" + m[2] + "/" + m[1];
    return null;
  }

  const ordenFecha = (f) => {
    const p = f.split("/");
    return p.length === 3 ? Number(p[2]) * 10000 + Number(p[1]) * 100 + Number(p[0]) : 0;
  };

  /* ------------------------------------------------- la forma de la hoja */

  /* Busca la fila de encabezados: la primera que tenga al menos dos celdas con
     texto. Una hoja hecha a mano suele empezar con el título del curso y una
     fila en blanco antes de la tabla de verdad. */
  function filaDeEncabezados(filas) {
    for (let i = 0; i < Math.min(filas.length, 12); i++) {
      const llenas = filas[i].filter((c) => String(c || "").trim()).length;
      if (llenas >= 2) return i;
    }
    return 0;
  }

  function leerHoja(hoja) {
    const filas = (hoja.filas || []).filter((f) => f.some((c) => String(c || "").trim()));
    if (filas.length < 2) {
      return { sirve: false, porque: "la hoja «" + hoja.hoja + "» no tiene filas suficientes para leer una asistencia." };
    }

    const iEnc = filaDeEncabezados(filas);
    const encabezados = filas[iEnc].map((c) => String(c == null ? "" : c).trim());
    const cuerpo = filas.slice(iEnc + 1);

    // ¿Las columnas tienen nombre de fecha? Entonces es una matriz.
    const columnasFecha = encabezados
      .map((h, i) => ({ i: i, fecha: comoFecha(h) }))
      .filter((c) => c.fecha);

    if (columnasFecha.length >= 2) return leerMatriz(hoja, encabezados, cuerpo, columnasFecha, iEnc);
    return leerFilaPorFila(hoja, encabezados, cuerpo, iEnc);
  }

  /* --- Forma 2: alumnos en filas, fechas en columnas ------------------- */
  function leerMatriz(hoja, encabezados, cuerpo, columnasFecha, iEnc) {
    // La columna del nombre: la que diga "estudiante"/"nombre", o la primera
    // que no sea una fecha.
    let iNombre = encabezados.findIndex((h) => queColumna(h) === "estudiante");
    if (iNombre < 0) {
      const fechas = new Set(columnasFecha.map((c) => c.i));
      iNombre = encabezados.findIndex((h, i) => !fechas.has(i) && String(h || "").trim());
    }
    if (iNombre < 0) iNombre = 0;

    const alumnos = cuerpo
      .map((fila) => ({ fila: fila, nombre: String(fila[iNombre] == null ? "" : fila[iNombre]).trim() }))
      // Una fila de totales al final no es un alumno.
      .filter((a) => a.nombre && !/^(total|totales|suma|promedio)\b/i.test(a.nombre));

    /* Una columna sin ninguna marca es una clase que no se dio (o una columna
       que quedó preparada de más). Se salta entera: si se contara, todos
       tendrían una falta el día que no hubo clase. */
    const conMarcas = columnasFecha.filter((col) =>
      alumnos.some((a) => String(a.fila[col.i] == null ? "" : a.fila[col.i]).trim() !== ""));
    const vacias = columnasFecha.length - conMarcas.length;

    const marcasVistas = new Set();
    const asistencias = [];
    for (const a of alumnos) {
      for (const col of conMarcas) {
        const bruto = a.fila[col.i];
        const texto = String(bruto == null ? "" : bruto).trim();
        /* LA CASILLA VACÍA ES UNA FALTA, y esto es lo que hace que la cuenta
           sirva de algo. En una cuadrícula hay una casilla por cada alumno y
           cada fecha: quien lleva la lista marca a los que vinieron y deja en
           blanco a los que no. Tratando el blanco como "no dice nada", todo el
           mundo salía con 100 % de asistencia — un número perfectamente
           creíble y falso, que es lo peor que puede llevar un informe. */
        const presente = texto === "" ? false : marcaDice(bruto);
        if (texto) marcasVistas.add(texto);
        asistencias.push({ fecha: col.fecha, estudiante: a.nombre, presente: presente, clase: "" });
      }
    }

    return {
      sirve: asistencias.length > 0,
      porque: asistencias.length ? "" : "en «" + hoja.hoja + "» las columnas parecen fechas pero no hay ninguna marca de asistencia debajo.",
      forma: "matriz",
      hoja: hoja.hoja,
      explicacion: "Se leyó «" + hoja.hoja + "» como una tabla de doble entrada: los nombres en la columna «" +
        (encabezados[iNombre] || "primera") + "» y las fechas en los encabezados (" +
        conMarcas.length + " fechas con marcas" +
        (vacias ? ", más " + vacias + " columna" + (vacias === 1 ? "" : "s") + " sin ninguna marca que no se contaron" : "") +
        "). Marcas contadas como presente: " +
        (marcasVistas.size ? [...marcasVistas].slice(0, 8).join(", ") : "ninguna") +
        ". Las casillas en blanco se contaron como falta.",
      asistencias: asistencias,
    };
  }

  /* --- Forma 1: una fila por asistencia -------------------------------- */
  function leerFilaPorFila(hoja, encabezados, cuerpo, iEnc) {
    const mapa = {};
    encabezados.forEach((h, i) => {
      const cual = queColumna(h);
      if (cual && mapa[cual] === undefined) mapa[cual] = i;
    });

    // Sin encabezados reconocibles se intenta por el contenido: la columna que
    // tenga fechas en casi todas sus celdas es la fecha; la que tenga textos
    // largos y repetidos, el nombre.
    if (mapa.fecha === undefined) {
      const cuantas = encabezados.map((_, i) =>
        cuerpo.filter((f) => comoFecha(f[i])).length);
      const mejor = cuantas.indexOf(Math.max.apply(null, cuantas));
      if (cuantas[mejor] >= Math.max(2, cuerpo.length * 0.6)) mapa.fecha = mejor;
    }
    if (mapa.estudiante === undefined) {
      const puntajes = encabezados.map((_, i) => {
        if (i === mapa.fecha) return -1;
        const textos = cuerpo.map((f) => String(f[i] == null ? "" : f[i]).trim()).filter(Boolean);
        if (!textos.length) return -1;
        const largo = textos.reduce((a, t) => a + t.length, 0) / textos.length;
        const conLetras = textos.filter((t) => /[a-záéíóúñ]/i.test(t)).length / textos.length;
        return largo > 4 && conLetras > 0.7 ? largo : -1;
      });
      const mejor = puntajes.indexOf(Math.max.apply(null, puntajes));
      if (puntajes[mejor] > 0) mapa.estudiante = mejor;
    }

    if (mapa.estudiante === undefined) {
      return { sirve: false, porque: "en «" + hoja.hoja + "» no se encontró ninguna columna con nombres de estudiantes." };
    }

    const asistencias = [];
    const marcasVistas = new Set();
    for (const fila of cuerpo) {
      const nombre = String(fila[mapa.estudiante] == null ? "" : fila[mapa.estudiante]).trim();
      if (!nombre || /^(total|totales|suma|promedio)\b/i.test(nombre)) continue;
      const fecha = mapa.fecha !== undefined ? comoFecha(fila[mapa.fecha]) : null;
      let presente = true;                            // si la fila existe, es que vino
      if (mapa.asistio !== undefined) {
        const bruto = fila[mapa.asistio];
        const dice = marcaDice(bruto);
        if (dice === null) continue;
        if (String(bruto || "").trim()) marcasVistas.add(String(bruto).trim());
        presente = dice;
      }
      asistencias.push({
        fecha: fecha || "(sin fecha)",
        estudiante: nombre,
        presente: presente,
        clase: mapa.clase !== undefined ? String(fila[mapa.clase] || "").trim() : "",
      });
    }

    const nombreCol = (i) => (i === undefined ? null : (encabezados[i] || "columna " + (i + 1)));
    return {
      sirve: asistencias.length > 0,
      porque: asistencias.length ? "" : "en «" + hoja.hoja + "» no se pudo leer ninguna asistencia.",
      forma: "filas",
      hoja: hoja.hoja,
      explicacion: "Se leyó «" + hoja.hoja + "» como una fila por asistencia: fecha en «" +
        (nombreCol(mapa.fecha) || "ninguna columna") + "», estudiante en «" + nombreCol(mapa.estudiante) + "»" +
        (mapa.clase !== undefined ? ", clase en «" + nombreCol(mapa.clase) + "»" : "") +
        (mapa.asistio !== undefined
          ? " y asistencia en «" + nombreCol(mapa.asistio) + "» (marcas: " +
            (marcasVistas.size ? [...marcasVistas].slice(0, 8).join(", ") : "ninguna") + ")."
          : ". No hay columna de asistencia, así que cada fila se contó como una asistencia."),
      asistencias: asistencias,
    };
  }

  /* --------------------------------------------------------- el recuento */

  /**
   * Junta todas las hojas y devuelve la asistencia ordenada: por clase, por
   * estudiante y el total.
   */
  function recopilar(hojas) {
    const leidas = (hojas || []).map(leerHoja);
    const buenas = leidas.filter((l) => l.sirve);
    const problemas = leidas.filter((l) => !l.sirve).map((l) => l.porque);

    const todas = [];
    for (const l of buenas) for (const a of l.asistencias) todas.push(a);

    // Por clase: cada fecha distinta es una clase.
    const porFecha = new Map();
    for (const a of todas) {
      if (!porFecha.has(a.fecha)) porFecha.set(a.fecha, { fecha: a.fecha, clase: a.clase, presentes: [], ausentes: [] });
      const c = porFecha.get(a.fecha);
      if (!c.clase && a.clase) c.clase = a.clase;
      (a.presente ? c.presentes : c.ausentes).push(a.estudiante);
    }
    const clases = [...porFecha.values()].sort((x, y) => ordenFecha(x.fecha) - ordenFecha(y.fecha));

    // Por estudiante.
    const porNombre = new Map();
    for (const a of todas) {
      if (!porNombre.has(a.estudiante)) porNombre.set(a.estudiante, { estudiante: a.estudiante, asistio: 0, falto: 0 });
      const e = porNombre.get(a.estudiante);
      if (a.presente) e.asistio += 1; else e.falto += 1;
    }
    const estudiantes = [...porNombre.values()]
      .map((e) => {
        const posibles = e.asistio + e.falto;
        return Object.assign({}, e, {
          posibles: posibles,
          porcentaje: posibles ? Math.round((e.asistio / posibles) * 100) : 0,
        });
      })
      .sort((a, b) => a.estudiante.localeCompare(b.estudiante, "es"));

    const presentes = todas.filter((a) => a.presente).length;
    return {
      hojas: buenas.map((l) => ({ hoja: l.hoja, forma: l.forma, explicacion: l.explicacion })),
      problemas: problemas,
      clases: clases,
      estudiantes: estudiantes,
      totales: {
        clases: clases.length,
        estudiantes: estudiantes.length,
        asistencias: presentes,
        ausencias: todas.length - presentes,
        // El promedio de asistencia del grupo, que es el número que se mira
        // primero en un informe de estos.
        porcentaje: todas.length ? Math.round((presentes / todas.length) * 100) : 0,
      },
    };
  }

  return {
    recopilar: recopilar,
    _leerHoja: leerHoja,
    _comoFecha: comoFecha,
    _marcaDice: marcaDice,
  };
})();
