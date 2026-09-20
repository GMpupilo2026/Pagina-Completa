/* Catálogo de material asignable desde el área de Tareas (tareas.html): de
 * qué puede elegir un profesor para mandarle a un alumno, y —desde que una
 * tarea tiene renglones con cantidad— QUÉ se le puede pedir de cada cosa.
 *
 * Tres fuentes, ninguna escrita dos veces:
 *
 *  - Los CURSOS salen de herramientas/cursos/catalogo.json en tiempo real, la
 *    misma fuente que arma las tarjetas de cursos.html. El enlace apunta a
 *    cursos/academia/<slug>.html, el espejo del curso dentro de la Academia.
 *  - Los RECORTES (los 80 temas, las 3 categorías de Mates, las 40 líneas de
 *    Aperturas, las 56 fichas de Estudio…) salen de entreno/data/metas.json,
 *    que GENERA herramientas/metas-indice.py leyendo los bancos de verdad.
 *    No se bajan los bancos enteros acá: temas.json ya pesa 1,8 MB, y esta
 *    página no es para resolver ejercicios sino para elegirlos.
 *  - Las HERRAMIENTAS en sí están escritas abajo: son las fichas de
 *    entreno/index.html más los juegos y los dos diagnósticos. Cambian poco y
 *    no tienen un JSON propio del que leerlas.
 *
 * Lo que de verdad importa de esta lista son dos campos, y equivocarlos no da
 * ningún error — la tarea simplemente se queda en cero para siempre:
 *
 *  - `actividades`: con qué nombre apunta esa página en training_progress.
 *    NO siempre es el slug (Practicar y Desafíos apuntan las dos como
 *    'practicar'), y a veces son dos (un tema del grupo de táctica apunta
 *    como 'tactica' y el resto como 'temas').
 *  - `metas`: qué se le puede pedir. Una herramienta que NO escribe en
 *    training_progress —Estudio, a propósito— no puede ofrecer 'cantidad':
 *    contaría contra cero. Sí puede ofrecer 'minutos', que sale de
 *    platform_activity_log, y 'completar', que lo dice el alumno.
 */
window.MaterialPlataforma = (function () {
  /* meta: 'cantidad' (ejercicios resueltos), 'minutos' (rato de verdad en la
     página) y 'completar' (lo marca el alumno). La primera de la lista es la
     que sale propuesta. */
  const HERRAMIENTAS = [
    { slug: "temas", label: "Ejercicios por tema", href: "entreno/temas.html",
      actividades: ["temas", "tactica"], metas: ["cantidad", "minutos"],
      unidad: "ejercicios", recortes: "temas", recorteLabel: "Tema",
      // El enlace tiene que caer en el tema, no en la lista de ochenta.
      hrefRecorte: (c) => `entreno/temas.html?tema=${encodeURIComponent(c)}` },

    { slug: "mates", label: "Mates", href: "entreno/mates.html",
      actividades: ["mates"], metas: ["cantidad", "minutos"],
      unidad: "ejercicios", recortes: "mates", recorteLabel: "Categoría",
      hrefRecorte: (c) => `entreno/mates.html?cat=${encodeURIComponent(c)}` },

    { slug: "4x4", label: "4×4", href: "entreno/4x4.html",
      actividades: ["4x4"], metas: ["cantidad", "minutos"],
      unidad: "ejercicios", recortes: "4x4", recorteLabel: "Nivel" },

    { slug: "aprender", label: "Aprender", href: "entreno/aprender.html",
      actividades: ["aprender"], metas: ["cantidad", "minutos"],
      unidad: "lecciones", recortes: "aprender", recorteLabel: "Bloque" },

    { slug: "practicas", label: "Practicar", href: "entreno/practicas.html",
      actividades: ["practicar"], metas: ["cantidad", "minutos"],
      unidad: "series", recortes: "practicas", recorteLabel: "Bloque" },

    { slug: "aperturas", label: "Aperturas y celadas", href: "entreno/aperturas.html",
      actividades: ["aperturas"], metas: ["cantidad", "minutos"],
      unidad: "líneas", recortes: "aperturas", recorteLabel: "Línea",
      hrefRecorte: (c) => `entreno/aperturas.html?linea=${encodeURIComponent(c)}` },

    /* Estudio NO escribe en training_progress, y es a propósito (ver
       CLAUDE.md): la memorización de verdad vive en Aperturas y celadas. Así
       que no ofrece 'cantidad' — ofrecerla sería una barra clavada en cero
       sin que nada avisara. El tiempo sí se registra. */
    { slug: "estudio", label: "Estudio", href: "entreno/estudio.html",
      actividades: ["estudio"], metas: ["completar", "minutos"],
      unidad: "fichas", recortes: "estudio", recorteLabel: "Ficha",
      hrefRecorte: (c) => `entreno/estudio.html?ficha=${encodeURIComponent(c)}` },

    { slug: "coordenadas", label: "Coordenadas", href: "entreno/coordenadas.html",
      actividades: ["coordenadas"], metas: ["minutos", "cantidad"],
      unidad: "rondas" },

    /* Desafíos apunta sus series como 'practicar', igual que Practicar: por
       cantidad no se podrían distinguir las unas de las otras, así que solo
       ofrece minutos (que sí lleva su propio nombre en el registro de
       tiempo). Pedir "5 desafíos" contaría también lo hecho en Practicar. */
    { slug: "desafios", label: "Desafíos", href: "entreno/desafios.html",
      actividades: ["desafios"], metas: ["minutos", "completar"], unidad: "series" },

    { slug: "visualizacion", label: "Visualización", href: "entreno/visualizacion.html",
      actividades: ["visualizacion"], metas: ["cantidad", "minutos"], unidad: "ejercicios" },

    { slug: "concentracion", label: "Concentración", href: "concentracion.html",
      actividades: ["concentracion"], metas: ["cantidad", "minutos"], unidad: "rondas" },

    { slug: "ilumina", label: "Ilumina el tablero", href: "ilumina-tablero.html",
      actividades: ["ilumina"], metas: ["cantidad", "minutos"], unidad: "niveles" },

    { slug: "confites", label: "Confites del caballo", href: "confites.html",
      actividades: ["confites"], metas: ["cantidad", "minutos"], unidad: "partidas" },

    { slug: "diagnostico", label: "Diagnóstico de nivel", href: "entreno/diagnostico.html",
      actividades: ["diagnostico"], metas: ["completar", "cantidad"], unidad: "diagnósticos" },

    { slug: "arbitraje", label: "Diagnóstico de arbitraje", href: "nivel-de-arbitraje.html",
      actividades: [], metas: ["completar"], unidad: "" },
  ];

  const META_LABEL = {
    cantidad: "Cantidad",
    minutos: "Minutos",
    completar: "Terminarlo",
  };

  let cursosCache = null;
  let metasCache = null;

  async function cursos() {
    if (cursosCache) return cursosCache;
    try {
      const r = await fetch("herramientas/cursos/catalogo.json");
      const d = await r.json();
      cursosCache = (d.cursos || []).map((c) => ({
        slug: c.slug,
        label: c.titulo,
        href: `cursos/academia/${c.slug}.html`,
        lecciones: c.lecciones,
        // Un curso se termina, no se cuenta: sus lecciones no se apuntan una
        // por una en training_progress.
        metas: ["completar"],
      }));
    } catch (e) {
      cursosCache = [];
    }
    return cursosCache;
  }

  /* Los recortes de una herramienta: los temas, las categorías, las líneas.
     Devuelve [] —y no revienta— si el índice no está: la tarea se puede
     mandar igual, sin recorte. */
  async function metas() {
    if (metasCache) return metasCache;
    try {
      const r = await fetch("entreno/data/metas.json");
      metasCache = await r.json();
    } catch (e) {
      metasCache = {};
    }
    return metasCache;
  }

  async function recortesDe(slug) {
    const h = HERRAMIENTAS.find((x) => x.slug === slug);
    if (!h || !h.recortes) return [];
    const m = await metas();
    return m[h.recortes] || [];
  }

  /* Con qué nombre apunta ESTE renglón en training_progress. Un recorte puede
     traer la suya (un tema de táctica apunta como 'tactica', no como
     'temas'); si no, valen las de la herramienta. */
  function actividadesDe(herramienta, recorte) {
    if (recorte && recorte.actividades && recorte.actividades.length) return recorte.actividades;
    return (herramienta && herramienta.actividades) || [];
  }

  function herramienta(slug) {
    return HERRAMIENTAS.find((x) => x.slug === slug) || null;
  }

  return { HERRAMIENTAS, META_LABEL, cursos, metas, recortesDe, actividadesDe, herramienta };
})();
