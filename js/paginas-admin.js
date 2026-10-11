/* Las páginas de quien administra, en UNA sola lista.

   La usan dos pantallas:
   - el panel de la Academia (ADMIN_GROUPS de js/clases.js), que las pinta
     como tarjetas por grupo, igual que siempre;
   - admin.html, que las reparte en sus secciones según `zona`: cada página
     sale en la sección de su tema (Personas, Organización, Contenido, Cobros
     y accesos, Informes). Las que no llevan `zona` no salen en admin.html:
     «Administración» es la página misma y «Configuración» es de la cuenta.

   Antes la lista estaba escrita solo en clases.js, y admin.html no llevaba a
   ninguna otra página: quien administraba tenía que ir y volver del panel de
   la Academia para todo lo que no fueran las cuentas. Ver «El panel de
   Administración en seis secciones» en docs/decisiones/paneles.md. */
(function () {
    "use strict";
    if (window.PaginasAdmin) return;

    const GRUPOS = [
        { title: "Administración", tiles: [
            { emoji: "👑", label: "Administración", desc: "Lo urgente, las cuentas, supervisores, profesores, coordinadores y equipos", href: "admin.html" },
            { emoji: "🏫", label: "Academias", desc: "Crea las academias, ponles supervisor y reparte a su gente", href: "academias.html", zona: "organizacion" },
            { emoji: "🏅", label: "Ficha JDN 2027", desc: "La inscripción a los Juegos Deportivos Nacionales: la ficha lista para firmar y su carpeta en el Drive", href: "jdn.html", zona: "personas" },
        ] },
        { title: "Supervisión y coordinación", tiles: [
            { emoji: "🧑‍🏫", label: "Supervisión de profesores", desc: "Qué hizo cada profesor en el mes —clases, tareas, exámenes— y su informe mensual", href: "supervision.html", zona: "organizacion" },
            { emoji: "🧭", label: "Coordinación", desc: "Los profesores y sus alumnos: quién es quién, cómo entra y cómo se ordena", href: "coordinacion.html", zona: "organizacion" },
            { emoji: "📊", label: "Informes", desc: "El progreso de todos los alumnos, tema por tema, y los informes a la casa", href: "informes.html", zona: "informes" },
            { emoji: "🩺", label: "Justificaciones de ausencia", desc: "Por qué faltó cada alumno a clase, con sus documentos", href: "justificaciones.html", zona: "personas" },
            { emoji: "📈", label: "Tablero por academia", desc: "Clases, alumnos, informes, gasto de IA y cobros de cada academia", href: "tablero-academias.html", zona: "informes" },
            { emoji: "📄", label: "Reportes de actividades", desc: "El informe de lo que pasó en clase en un periodo, en Word y PDF", href: "reportes.html", zona: "informes" },
        ] },
        /* Todos los formularios juntos: los que se arman, el pedido de
           ingreso y las encuestas. Las inscripciones a torneos van con
           Torneos, que es donde se las busca. */
        { title: "Formularios", tiles: [
            { emoji: "⭐", label: "Satisfacción con los profesores", desc: "Qué opina el alumnado de cada profesor y quién dice que se va", href: "satisfaccion.html", zona: "informes" },
            { emoji: "🦯", label: "Encuestas anónimas de cursos", desc: "Sin iniciar sesión y accesibles con lector de pantalla: deserción, forma de enseñar y expectativas", href: "encuestas-curso.html", zona: "informes" },
            { emoji: "📋", label: "Formularios de inscripción", desc: "Arma un formulario, compártelo por enlace y baja las respuestas", href: "formularios.html", zona: "personas" },
            { emoji: "📝", label: "Solicitudes de la Academia", desc: "Quien pidió unirse: aprobar crea la cuenta, rechazar invita a un plan pago", href: "solicitudes.html", zona: "personas" },
        ] },
        { title: "Cobros y accesos", tiles: [
            { emoji: "💳", label: "Cobros de la Academia", desc: "Mensualidades, pagos y morosidad. Los recordatorios salen solos", href: "cobros.html", zona: "cobros" },
            { emoji: "🎟️", label: "Accesos y cupos", desc: "Los paquetes de acceso y los cupos de cada academia", href: "accesos.html", zona: "cobros" },
            { emoji: "🔑", label: "Licencias de herramientas", desc: "Genera y controla las licencias de las herramientas", href: "licencias.html", zona: "cobros" },
            { emoji: "🏷️", label: "Precios", desc: "La tabla para enseñar a una academia o un colegio", href: "precios.html", zona: "cobros" },
            { emoji: "🎁", label: "Prueba gratis", desc: "Crear los 3 días de prueba de quien la pidió por WhatsApp", href: "prueba-gratis.html", zona: "cobros" },
            { emoji: "🛒", label: "Tienda de materiales", desc: "El catálogo de venta: todavía no está abierta al público", href: "tienda.html", zona: "cobros" },
        ] },
        { title: "Resultados de las pruebas", tiles: [
            { emoji: "🧭", label: "Diagnósticos de nivel", desc: "El nivel medido de cada alumno y dónde está floja cada clase", href: "informes.html?tema=diagnostico", zona: "informes" },
            { emoji: "🌐", label: "Diagnósticos del público", desc: "Quién hizo el diagnóstico sin cuenta: contactos para invitar a la Academia", href: "informes.html?tema=diagnostico-publico", zona: "informes" },
            { emoji: "⚖️", label: "Examen de arbitraje", desc: "El del equipo docente, con el detalle de cada respuesta", href: "arbitraje.html", zona: "informes" },
            { emoji: "🌐", label: "Arbitraje del público", desc: "Quiénes lo hicieron sin cuenta y a quién falta responder", href: "informes.html?tema=arbitraje", zona: "informes" },
        ] },
        { title: "Torneos", tiles: [
            { emoji: "🏅", label: "Inscripciones a torneos en línea", desc: "Las respuestas del formulario de inscripcion.html", href: "inscripciones.html", zona: "contenido" },
            { emoji: "🔎", label: "Jugadores de chess-results", desc: "Busca a una persona y su historial de torneos", href: "admin-jugador.html", zona: "contenido" },
            { emoji: "🏅", label: "Selección por parámetros", desc: "La selección CODICADER desde chess-results, en vivo ronda a ronda", href: "seleccion-codicader.html", zona: "contenido" },
            { emoji: "🏆", label: "Resultados JDN por comité", desc: "Medallero y ficha de cada comité en los Juegos Deportivos Nacionales, de 2018 a hoy", href: "jdn-comites.html", zona: "contenido" },
            { emoji: "📋", label: "Proyección JDN por comité", desc: "Quién sigue en carrera por comité para la próxima eliminatoria, cruzado con su actividad 2026 en chess-results", href: "jdn-proyeccion.html", zona: "contenido" },
        ] },
        { title: "Herramientas", tiles: [
            { emoji: "♟️", label: "Pareo Integral", desc: "Empareja un torneo con el Sistema Holandés de FIDE: rondas, resultados, desempates y el TRF. Gratis", href: "pareo.html", zona: "contenido" },
            { emoji: "⚖️", label: "Desempates explicados", desc: "Recalcula la clasificación de un torneo de chess-results y explica, paso a paso, por qué cada persona queda arriba de la otra", href: "desempates.html", zona: "contenido" },
            { emoji: "🧰", label: "Todas las herramientas", desc: "La vitrina pública: lo que se vende con licencia y lo que viene", href: "herramientas-arbitraje.html", zona: "contenido" },
        ] },
        { title: "Revisar el contenido", tiles: [
            { emoji: "🏛️", label: "Cursos", desc: "Los cursos de la Academia y el temario de cada uno", href: "cursos/academia/index.html", zona: "contenido" },
            { emoji: "🏋️", label: "Entrenamiento", desc: "Los ejercicios y lecciones que usa el alumnado", href: "entreno/index.html", zona: "contenido" },
            { emoji: "📚", label: "Estudio", desc: "Las fichas de aperturas, defensas y temas tácticos", href: "entreno/estudio.html", zona: "contenido" },
            { emoji: "📖", label: "Artículos", desc: "Lecturas técnicas y pedagógicas", href: "articulos.html", zona: "contenido" },
            { emoji: "📺", label: "TV en vivo", desc: "Las partidas de la Academia en directo", href: "tv.html", zona: "contenido" },
            { emoji: "📘", label: "Guía del profesor", desc: "Todo lo que la plataforma deja hacer y cómo se hace", href: "guia-del-profesor-accesible.html", zona: "contenido" },
            { emoji: "📝", label: "Lector de planilla", desc: "Todavía en prueba: fotografía una planilla y conviértela en PGN", href: "lector-planilla.html", zona: "contenido" },
            { emoji: "🗂️", label: "Actualizaciones", desc: "Todo lo que se le ha hecho a la plataforma desde el primer día", href: "novedades.html", zona: "contenido" },
        ] },
        { title: "Tu cuenta", tiles: [
            { emoji: "⚙️", label: "Configuración", desc: "Tu perfil y contraseña", href: "configuracion.html" },
        ] },
    ];

    // Las de una sección de admin.html, en el orden de la lista.
    function deZona(zona) {
        const fuera = [];
        GRUPOS.forEach((g) => g.tiles.forEach((t) => { if (t.zona === zona) fuera.push(t); }));
        return fuera;
    }

    window.PaginasAdmin = { GRUPOS, deZona };
})();
