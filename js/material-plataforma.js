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

    /* Cuenta cada final ganado o salvado UNA vez (como Mates): son diez, así
       que «5 finales» son cinco distintos. */
    { slug: "finales", label: "Finales contra la máquina", href: "entreno/finales.html",
      actividades: ["finales"], metas: ["cantidad", "minutos"], unidad: "finales" },

    /* Cada ejercicio resuelto se registra una vez como 'tipos', con el tipo en
       detail.category: ese es el recorte («10 de Detective»), y el enlace
       abre la ficha de ese tipo. */
    { slug: "tipos", label: "Habilidades", href: "entreno/tipos.html",
      actividades: ["tipos"], metas: ["cantidad", "minutos"],
      unidad: "ejercicios", recortes: "tipos", recorteLabel: "Habilidad",
      hrefRecorte: (c) => `entreno/tipos.html#${encodeURIComponent(c)}` },

    /* Precisión, el Sonar y Batalla naval registran cada tanda o partida
       terminada con el mismo nombre que su tiempo. Sin puzzle_id: se sortean
       cada vez, así que «5 partidas» son cinco partidas jugadas. */
    { slug: "precision-posicional", label: "Precisión posicional", href: "entreno/precision-posicional.html",
      actividades: ["precision-posicional"], metas: ["cantidad", "minutos"], unidad: "tandas" },

    { slug: "sonar", label: "El Sonar", href: "sonar.html",
      actividades: ["sonar"], metas: ["cantidad", "minutos"], unidad: "partidas" },

    { slug: "batalla-naval", label: "Batalla naval", href: "batalla-naval.html",
      actividades: ["batalla-naval"], metas: ["cantidad", "minutos"], unidad: "partidas" },

    /* Memoria: cada posición reconstruida, como una ronda (se sortea). */
    { slug: "memoria", label: "Memoria", href: "entreno/memoria.html",
      actividades: ["memoria"], metas: ["cantidad", "minutos"], unidad: "posiciones" },

    { slug: "concentracion", label: "Concentración", href: "concentracion.html",
      actividades: ["concentracion"], metas: ["cantidad", "minutos"], unidad: "rondas" },

    { slug: "ilumina", label: "Ilumina el tablero", href: "ilumina-tablero.html",
      actividades: ["ilumina"], metas: ["cantidad", "minutos"], unidad: "niveles" },

    { slug: "confites", label: "Confites del caballo", href: "confites.html",
      actividades: ["confites"], metas: ["cantidad", "minutos"], unidad: "partidas" },

    /* El diagnóstico se pide UNA vez (`unaVez`: sin cantidad que elegir) y se
       cuenta solo al terminarlo. Solo vale el que rinde DESPUÉS de que se lo
       asignan —tareas_con_avance() lo filtra por la fecha de la tarea—: si el
       profe lo pide es porque quiere una medición nueva, y uno de hace meses
       daría la tarea por hecha el día que nace. Ya no ofrece 'completar': que
       el alumno lo marque a mano sin rendirlo no mide nada. Mientras esté
       pendiente, el panel le ilumina la tarjeta del diagnóstico. */
    { slug: "diagnostico", label: "Diagnóstico de nivel", href: "entreno/diagnostico.html",
      actividades: ["diagnostico"], metas: ["cantidad"], unidad: "diagnósticos",
      unaVez: true, frase: "Hacer el diagnóstico de nivel" },

    { slug: "arbitraje", label: "Diagnóstico de arbitraje", href: "nivel-de-arbitraje.html",
      actividades: [], metas: ["completar"], unidad: "" },

    /* Un cuestionario (los del profe y los listos de la Academia), para
       contestarlo en la casa. Se pide UNA vez y se cumple al entregarlo. Lo
       cuenta tareas_con_avance() desde cuestionario_intentos, que solo escribe
       la base al calificar, no desde training_progress: `actividades` está
       porque la tabla exige una en las metas que se miden. El recorte es el
       cuestionario y no tiene «— todo —»: sin uno elegido no hay nada que
       contestar. Ver «El cuestionario como tarea» en seguimiento-del-alumno.md. */
    { slug: "cuestionario", label: "Cuestionario", href: "cuestionario-tarea.html",
      actividades: ["cuestionario"], metas: ["cantidad"], unidad: "cuestionarios",
      cuentaDesde: "cuestionario_intentos",
      recortes: "cuestionarios", recorteLabel: "Cuestionario", recorteObligatorio: true,
      hrefRecorte: (c) => `cuestionario-tarea.html?c=${encodeURIComponent(c)}`,
      unaVez: true, frase: (r) => `Contestar el cuestionario «${r.filtro_label || "sin título"}»` },

    /* El plan contra un rival: no se elige en Tareas, porque cada plan es de un
       alumno. Lo manda la preparación de rivales (mandar_plan_rival(), con el
       id del plan en filtro_clave) y está acá para que la tarea se lea bien
       («Aprender 4 líneas de tu plan contra…») y se sepa qué cuenta. */
    { slug: "plan-rival", label: "Tu plan contra un rival", href: "plan-rival.html",
      actividades: ["preparacion"], metas: ["cantidad"], unidad: "líneas", noSeElige: true },
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
      // Los escondidos (js/cursos-ocultos.js) no se asignan: el alumno no los
      // puede abrir.
      cursosCache = (d.cursos || []).filter((c) => !(window.CursosOcultos && CursosOcultos.es(c.slug))).map((c) => ({
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
    if (h.recortes === "cuestionarios") return cuestionarios();
    const m = await metas();
    return m[h.recortes] || [];
  }

  /* Los cuestionarios no están en metas.json: son de cada profe y viven en la
     base. La RLS decide cuáles ve (los suyos y los listos). Los suyos primero,
     y los listos por nivel, como en cuestionarios.html. */
  async function cuestionarios() {
    if (!window.sb) return [];
    try {
      const { data, error } = await window.sb.from("cuestionarios")
        .select("id, titulo, nivel, listo, preguntas").order("titulo");
      if (error || !data) return [];
      const NIVEL = { inicial: "Inicial", intermedio: "Intermedio", avanzado: "Avanzado" };
      // Los tuyos (0), los listos sin nivel (1) y los de cada nivel (2, 3, 4).
      const orden = (c) => (c.listo ? 2 + ["inicial", "intermedio", "avanzado"].indexOf(c.nivel) : 0);
      return data.slice().sort((a, b) => orden(a) - orden(b)).map((c) => {
        const n = Array.isArray(c.preguntas) ? c.preguntas.length : 0;
        return {
          clave: c.id,
          label: c.titulo,
          detalle: n + (n === 1 ? " pregunta" : " preguntas"),
          grupo: c.listo ? "Listos de la Academia · " + (NIVEL[c.nivel] || "Sin nivel") : "Tus cuestionarios",
        };
      });
    } catch (e) {
      return [];
    }
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

  /* Cómo se lee un renglón de tarea. Es lo único que el alumno va a leer de
     la tarea, así que se arma del material y la meta, no de un texto escrito
     a mano que después pueda decir otra cosa que la barra de al lado. La usan
     tareas.html y proyecto.html (las tareas semanales de un proyecto). */
  const VERBO = { ejercicios: "Resolver", líneas: "Aprender", lecciones: "Hacer" };
  const SINGULAR = {
    ejercicios: "ejercicio", líneas: "línea", lecciones: "lección", partidas: "partida",
    posiciones: "posición", finales: "final", fichas: "ficha", niveles: "nivel",
    rondas: "ronda", series: "serie", tandas: "tanda", cuestionarios: "cuestionario",
    diagnósticos: "diagnóstico",
  };
  function frase(r) {
    const nombre = r.filtro_label || r.material_label;
    if (r.meta_tipo === "minutos") return `Hacer ${r.meta_cantidad} minutos de ${nombre}`;
    if (r.meta_tipo === "completar") {
      return r.leccion ? `Estudiar la lección ${r.leccion} de ${nombre}` : `Terminar ${nombre}`;
    }
    /* La unidad no se guarda en el renglón: se busca en el catálogo por el
       slug. Guardarla sería una segunda copia que se separaría de la primera
       el día que Aprender deje de contar "lecciones" — y las tareas ya
       enviadas seguirían diciendo la palabra vieja. Lo que sí es una foto es
       el nombre del material, que tiene que sobrevivir a que lo renombren. */
    const h = herramienta(r.material_slug);
    // Lo que se pide una sola vez no dice «Hacer 1 diagnósticos de…».
    if (h && h.frase) return typeof h.frase === "function" ? h.frase(r) : h.frase;
    const unidad = (h && h.unidad) || "ejercicios";
    const verbo = VERBO[unidad] || "Hacer";
    // «Aprender 1 línea», no «1 líneas».
    const palabra = Number(r.meta_cantidad) === 1 ? (SINGULAR[unidad] || unidad) : unidad;
    return `${verbo} ${r.meta_cantidad} ${palabra} de ${nombre}`;
  }

  return { HERRAMIENTAS, META_LABEL, cursos, metas, recortesDe, actividadesDe, herramienta, frase };
})();
