/* Las páginas de quien supervisa, en UNA sola lista.

   La usan dos pantallas:
   - el panel de la Academia (SUPERVISOR_GROUPS de js/clases.js), que las
     pinta como tarjetas por grupo: es el panel de un supervisor que mira
     quien administra («Ver como»);
   - supervisor.html, la página de quien supervisa, que las reparte en sus
     pestañas según `zona` (Personas, Profesores, Estudiantes, Cobros y
     accesos). `panel` cambia cómo se nombra una página ahí: «Cuentas» es la
     pestaña Personas misma, así que de Coordinación queda lo que solo está
     allá, los equipos. Las que no llevan `zona` no salen: «Cuenta nueva» es
     el botón de arriba y «Configuración», la cuenta propia.

   Ver «La página de supervisión» en docs/decisiones/paneles.md. */
(function () {
    "use strict";
    if (window.PaginasSupervisor) return;

    const GRUPOS = [
        /* Lo primero, a pedido del dueño de la Academia: lo que se hace
           todos los días con la gente de la academia —dar de alta una
           cuenta y corregir las que ya están— a un golpe de vista. «Cuenta
           nueva» abre formularios.html ya con la caja de «＋ Alumno nuevo»
           abierta (?alta=1); «Cuentas» es la ficha de coordinacion.html:
           nombre, grupo, correo o usuario, profesores, rol y reenviar el
           acceso. */
        { title: "Mi academia", tiles: [
            { emoji: "➕", label: "Cuenta nueva", desc: "Da de alta a un alumno: le llega su acceso por correo, o entra con un usuario si no tiene", href: "formularios.html?alta=1" },
            { emoji: "✏️", label: "Cuentas", desc: "Corrige todos los datos de las cuentas a tu cargo: nombre, grupo, correo, profesores y rol, y reenvía el acceso", href: "coordinacion.html", zona: "personas",
                panel: { emoji: "👥", label: "Equipos y subgrupos", desc: "En Coordinación: los equipos que dan acceso a varios alumnos a la vez" } },
            { emoji: "📝", label: "Solicitudes de la Academia", desc: "Quien pidió unirse: aprobar crea la cuenta", href: "solicitudes.html", zona: "personas" },
            /* Su academia: quién está, su número y su correo, y qué puede
               hacer cada coordinador. */
            { emoji: "🏫", label: "Tu academia", desc: "Quién está en tu academia, sus datos de contacto y qué puede hacer cada coordinador", href: "academias.html", zona: "personas" },
        ] },
        /* Supervisar es, sobre todo, supervisar a los profesores: va antes
           que el detalle de los estudiantes. */
        { title: "Tus profesores", tiles: [
            { emoji: "🧑‍🏫", label: "Supervisión de profesores", desc: "Qué hizo cada profesor en el mes —clases, tareas, exámenes— y su informe mensual", href: "supervision.html", zona: "profesores" },
            { emoji: "⭐", label: "Satisfacción del alumnado", desc: "Qué opinan los estudiantes de cada profesor y quién dice que se va", href: "satisfaccion.html", zona: "profesores" },
            /* Las cifras del mes de su academia en una fila: clases,
               alumnos, informes y cobros pendientes (sin nada de IA). */
            { emoji: "📊", label: "Tablero de tu academia", desc: "Clases y horas del mes, alumnos que entrenaron, informes enviados y cobros pendientes", href: "tablero-academias.html", zona: "profesores" },
            { emoji: "📄", label: "Reportes de actividades", desc: "El informe de lo que pasó en clase en un periodo, en Word y PDF", href: "reportes.html", zona: "profesores" },
        ] },
        { title: "Tus estudiantes", tiles: [
            /* UNA tarjeta para Informes: adentro se elige el tema
               (asistencia, diagnóstico, cursos, mates, táctica…). */
            { emoji: "📈", label: "Informes de tus estudiantes", desc: "Todos tus estudiantes a cargo, y arriba en la página eliges el tema: asistencia, diagnóstico, cursos, lo que entrenan…", href: "informes.html", zona: "estudiantes" },
            { emoji: "🩺", label: "Justificaciones de ausencia", desc: "Por qué faltó cada uno a clase, con sus documentos, para aceptarla o no", href: "justificaciones.html", zona: "estudiantes" },
            /* Su propio enlace del diagnóstico para gente sin cuenta: lo
               que se hace por él le llega solo a quien supervisa. Es un
               tema de Informes, pero no es mirar a sus estudiantes: es
               repartir un enlace. */
            { emoji: "🌐", label: "Diagnóstico de visitantes", desc: "Tu enlace para que alguien sin cuenta mida su nivel, y los resultados que te llegan", href: "informes.html?tema=diagnostico-publico", zona: "estudiantes" },
        ] },
        { title: "Cobros y formularios", tiles: [
            { emoji: "💳", label: "Cobros", desc: "Mensualidades, pagos y morosidad de tus estudiantes", href: "cobros.html", zona: "cobros" },
            /* Los cupos que compró su academia: los reparte ella entre sus
               miembros. Sin un paquete de su academia, la página se lo dice. */
            { emoji: "🎟️", label: "Cupos de tu academia", desc: "Reparte entre los alumnos de tu academia los cupos de acceso que compró", href: "accesos.html", zona: "cobros" },
            { emoji: "📋", label: "Formularios de inscripción", desc: "Arma un formulario, compártelo por enlace y baja las respuestas", href: "formularios.html", zona: "personas" },
        ] },
        { title: "Tu cuenta", tiles: [
            { emoji: "⚙️", label: "Configuración", desc: "Tu perfil y contraseña", href: "configuracion.html" },
        ] },
    ];

    // Las de una pestaña de supervisor.html, en el orden de la lista, con
    // el nombre que llevan ahí.
    function deZona(zona) {
        const fuera = [];
        GRUPOS.forEach((g) => g.tiles.forEach((t) => {
            if (t.zona === zona) fuera.push(Object.assign({}, t, t.panel || {}));
        }));
        return fuera;
    }

    window.PaginasSupervisor = { GRUPOS, deZona };
})();
