/* El código de clases.html.

   Vivía escrito dentro de la página, en un <script> de 136 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null, isTeacher = false, openSession = null;
        // A qué profesor pertenece la clase que se muestra aquí: uno mismo si es
        // profesor, o el profesor asignado si es alumno — cada profesor tiene su
        // propio registro de clases, completamente aparte del de cualquier otro.
        let boardOwnerId = null;

        // ---------- Grilla de accesos: agrupada por secciones para que se ubique todo
        // más rápido de un vistazo (antes eran 14 accesos sueltos en una sola grilla,
        // sin ningún criterio de orden). Un solo lugar para agregar o mover destinos:
        // basta con cambiar de grupo el objeto del tile, el resto se acomoda solo. ----------
        const TILE_GROUPS = [
            /* "Sesión en vivo" va sola y de primera: es lo único del panel que
               pasa AHORA MISMO, y mezclada entre Juegos y Torneos costaba
               encontrarla justo cuando hay clase. Su grupo lleva `destacado`,
               que la pinta ancha y en una línea en vez de como un cuadrito
               más. */
            /* Y al lado va la VIDEOLLAMADA, porque el tablero es la pizarra y
               no la clase: la voz va por Meet, Zoom o Teams, y ese enlace
               viajaba por WhatsApp cada vez. `videollamada: true` es lo único
               que lo pide — el botón lo arma renderTiles() al lado de la
               tarjeta, y NO dentro: un enlace dentro de otro enlace no es HTML
               válido, y el lector de pantalla anunciaría dos destinos donde se
               ve uno. */
            { title: "Clase en vivo", destacado: true, tiles: [
                { emoji: "♟️", label: "Sesión en vivo", desc: "Tablero en vivo con tu profesor", descProfe: "El tablero que ve tu clase, en vivo", href: "sesion.html", primary: true, videollamada: true },
            ] },
            /* Lo segundo que se ve, y antes de cualquier lugar a donde ir: lo
               que OTRA PERSONA te puso, con fecha. Tareas vivía en "Aprender" y
               Exámenes en "Evaluaciones", o sea que lo único del panel que
               tiene fecha estaba partido en dos grupos y cada mitad enterrada
               entre cosas que se hacen cuando uno quiere. La franja de arriba
               solo aparece cuando hay tareas pendientes —y nunca por un
               examen—, así que fuera de ese momento no había dónde mirar.

               El rótulo NO repite los nombres de las dos tarjetas: dice lo que
               las dos tienen en común y que no se deduce de ellas —que te las
               pone alguien más y traen fecha—, que es lo que las separa de un
               diagnóstico, que uno hace cuando le parece. Por
               eso lleva `titleProfe`, igual que los tiles llevan `descProfe`:
               del otro lado del escritorio la misma pareja es lo que MANDAS. */
            { title: "Lo que te pone tu profesor", titleProfe: "Lo que le pones a tus alumnos", tiles: [
                { emoji: "📋", label: "Tareas", desc: "Con fecha límite, y se llenan solas con lo que entrenas", descProfe: "Pide cantidades y la tarea se llena sola con lo que entrenan", href: "tareas.html" },
                { emoji: "📝", label: "Exámenes", desc: "Con nota y reloj: una sola oportunidad por pregunta", descProfe: "Con nota y reloj, y el informe pregunta por pregunta de cada uno", href: "examenes.html" },
            ] },
            /* "Aprender" va antes que "Jugar y competir": esto es una academia,
               y lo primero que se ofrece al entrar es lo que se viene a hacer.
               Jugar sigue estando a un golpe de vista, justo debajo — no se
               esconde, se ordena. Mover un grupo de lugar es mover su objeto
               dentro de esta lista y nada más: todo lo que después retoca la
               grilla (administración, coordinación, el equipo docente) busca su
               grupo POR NOMBRE, nunca por la posición. */
            /* Dentro del grupo, el orden es el del trabajo de todos los días:
               primero lo que se HACE (Entrenamiento), después lo que se mira de
               un vistazo para repasarlo (Estudio), después el curso completo, y
               al final la lectura. Cursos estaba primero y es lo más largo de
               los cuatro: quien entra a practicar veinte minutos tenía delante
               lo que menos se parece a eso. */
            { title: "Aprender", tiles: [
                { emoji: "🏋️", label: "Entrenamiento", desc: "Ejercicios tácticos y lecciones interactivas", href: "entreno/index.html" },
                { emoji: "📚", label: "Estudio", desc: "Aperturas, defensas, temas tácticos y conceptos: cada uno en una ficha de una pantalla", href: "entreno/estudio.html" },
                { emoji: "🏛️", label: "Cursos", desc: "Tus cursos completos, con tu línea de progreso", descProfe: "Los cursos de la Academia y el temario de cada uno", href: "cursos/academia/index.html" },
                { emoji: "📖", label: "Artículos", desc: "Lecturas técnicas y pedagógicas", href: "articulos.html" },
            ] },
            /* Primero donde se juega de verdad contra otra persona, después el
               torneo, y de último lo que se MIRA — TV en vivo no es jugar, es
               ver jugar. Detrás van las dos que cuelgan de eso: el bot y las
               medallas.

               «Racha táctica» se fue de acá porque ya es lo PRIMERO que hay
               dentro de juegos.html, en una franja ámbar a todo el ancho. Un
               mismo destino dos veces en el panel es el error que ya se cometió
               con «Torneos», y cuesta lo mismo: el segundo camino no se usa y
               de paso ensancha la grilla. Sigue enlazada desde Juegos, que es
               donde se la busca.

               Y por eso mismo «Torneos de la Academia» pudo volver a llamarse
               «Torneos» a secas: el nombre estaba largo para distinguirlo de la
               otra tarjeta que se llamaba igual, y esa otra es hoy «TV en
               vivo». Si algún día vuelve a haber dos «Torneos», el que se
               renombra es el nuevo. */
            { title: "Jugar y competir", tiles: [
                { emoji: "🎲", label: "Juegos", desc: "Crazyhouse y otras modalidades — tu profesor te asigna el rival", descProfe: "Crazyhouse y otras modalidades — arma las partidas de tus alumnos", href: "juegos.html" },
                { emoji: "🥇", label: "Torneos", desc: "Inscríbete y compite en los torneos que arma tu profesor", descProfe: "Arma torneos para tus alumnos, con sus rondas y su tabla", href: "torneos.html" },
                { emoji: "📺", label: "TV en vivo", desc: "Las partidas de la Academia en directo, con su tabla de posiciones", href: "tv.html" },
                { photo: "img/oscar-avatar.jpg", label: "Juega contra mí", desc: "Practica contra Oscar, nuestro motor", href: "tablero.html" },
                { emoji: "🏅", label: "Logros", desc: "Tu racha de días entrenando y las medallas que has ganado", descProfe: "El catálogo de medallas y cómo se gana la racha de días", href: "logros.html" },
            ] },
            /* «Mide tu nivel» (los dos diagnósticos) y las tarjetas que eran
               solo de administración —lector de planilla, tienda,
               actualizaciones, guía del profesor— ya no viven acá: quien
               administra tiene su propio panel (ADMIN_GROUPS) y las encuentra
               ahí. Al equipo docente y al alumnado nunca se les pintaban. */
            { title: "Herramientas", tiles: [
                { emoji: "📂", label: "Archivos", desc: "Sube tus PGN completos y revisa las partidas guardadas en clase — llévalos al tablero en vivo", href: "partidas.html", mantenimientoAlumno: true },
            ] },
            { title: "Tu cuenta", tiles: [
                { emoji: "📊", label: "Informes", desc: "Tu progreso y estadísticas", descProfe: "El progreso de tus alumnos y los informes a la casa", href: "informes.html" },
                { emoji: "⚙️", label: "Configuración", desc: "Tu perfil y contraseña", href: "configuracion.html" },
            ] },
        ];

        /* ---------- El panel de quien SUPERVISA ----------
           No entrena, no juega y no da clase: lo suyo es administrativo. Por
           eso no se le recorta el panel de siempre —quitarle tarjetas una por
           una deja la mitad olvidada a la vista—, sino que se le pinta OTRO,
           escrito entero acá. Cada tema de Informes es una tarjeta que abre
           el informe de sus estudiantes ya filtrado por ese tema
           (informes.html?tema=…, el mismo enlace que usa Administración). */
        const TEMA = (tema) => "informes.html" + (tema ? "?tema=" + tema : "");
        const SUPERVISOR_GROUPS = [
            { title: "Cómo van tus estudiantes", tiles: [
                { emoji: "📊", label: "Resumen general", desc: "Todos tus estudiantes a cargo, uno por fila, con su tiempo, asistencia y nivel", href: TEMA("") },
                { emoji: "😴", label: "Sin entrenar", desc: "Quién lleva 4 días o más sin hacer nada en la plataforma", href: TEMA("inactivos") },
                { emoji: "🏫", label: "Asistencia y tiempo", desc: "Clases a las que fue y cuánto tiempo pasó en la plataforma", href: TEMA("asistencia") },
                { emoji: "🚩", label: "Preguntas en clase", desc: "Cómo contestan cuando el profesor pregunta en la clase en vivo", href: TEMA("asignaciones") },
                { emoji: "🧭", label: "Diagnóstico de nivel", desc: "El nivel medido de cada uno y dónde está floja la clase", href: TEMA("diagnostico") },
                { emoji: "🏛️", label: "Cursos", desc: "Qué temas de cada curso ya estudió", href: TEMA("cursos") },
            ] },
            { title: "Tus profesores", tiles: [
                { emoji: "🧑‍🏫", label: "Supervisión de profesores", desc: "Qué hizo cada profesor en el mes —clases, tareas, exámenes— y su informe mensual", href: "supervision.html" },
                { emoji: "⭐", label: "Satisfacción del alumnado", desc: "Qué opinan los estudiantes de cada profesor y quién dice que se va", href: "satisfaccion.html" },
                /* Su academia: quién está, su número y su correo, y qué puede
                   hacer cada coordinador. */
                { emoji: "🏫", label: "Tu academia", desc: "Quién está en tu academia, sus datos de contacto y qué puede hacer cada coordinador", href: "academias.html" },
                /* Las cifras del mes de su academia en una fila: clases,
                   alumnos, informes y cobros pendientes (sin nada de IA). */
                { emoji: "📊", label: "Tablero de tu academia", desc: "Clases y horas del mes, alumnos que entrenaron, informes enviados y cobros pendientes", href: "tablero-academias.html" },
            ] },
            { title: "Qué están entrenando, tema por tema", tiles: [
                { emoji: "♚", label: "Mates", desc: "Mates en 1, 2 y 3 resueltos", href: TEMA("mates") },
                { emoji: "⚔️", label: "Táctica", desc: "Ejercicios de táctica resueltos", href: TEMA("tactica") },
                { emoji: "🧩", label: "4×4", desc: "Ejercicios del tablero de 4×4", href: TEMA("4x4") },
                { emoji: "🎓", label: "Lecciones", desc: "Lecciones de Aprender terminadas", href: TEMA("aprender") },
                { emoji: "⚡", label: "Coordenadas", desc: "Su mejor marca en Coordenadas", href: TEMA("coordenadas") },
                { emoji: "🏆", label: "Practicar", desc: "Series de Practicar y sus estrellas", href: TEMA("practicar") },
                { emoji: "🧠", label: "Concentración", desc: "Niveles de Concentración superados", href: TEMA("concentracion") },
            ] },
            { title: "Cuentas a tu cargo", tiles: [
                { emoji: "🧭", label: "Cuentas", desc: "Corrige nombre, grupo, correo, profesores y rol de las cuentas que te asignaron", href: "coordinacion.html" },
                { emoji: "📄", label: "Reportes de actividades", desc: "El informe de lo que pasó en clase en un periodo, en Word y PDF", href: "reportes.html" },
            ] },
            { title: "Administración", tiles: [
                { emoji: "💳", label: "Cobros", desc: "Mensualidades, pagos y morosidad de tus estudiantes", href: "cobros.html" },
                /* Los cupos que compró su academia: los reparte ella entre sus
                   miembros. Sin un paquete de su academia, la página se lo dice. */
                { emoji: "🎟️", label: "Cupos de tu academia", desc: "Reparte entre los alumnos de tu academia los cupos de acceso que compró", href: "accesos.html" },
                { emoji: "📋", label: "Formularios de inscripción", desc: "Arma un formulario, compártelo por enlace y baja las respuestas", href: "formularios.html" },
                { emoji: "📝", label: "Solicitudes de la Academia", desc: "Quien pidió unirse: aprobar crea la cuenta", href: "solicitudes.html" },
            ] },
            { title: "Tu cuenta", tiles: [
                { emoji: "⚙️", label: "Configuración", desc: "Tu perfil y contraseña", href: "configuracion.html" },
            ] },
        ];

        /* ---------- El panel de quien ADMINISTRA ----------
           Quien administra NO DA CLASE: se encarga de que toda la empresa vaya
           bien y funcione bien. Antes le salía el panel de un profesor —iniciar
           clase, «Tu semana» con sus tareas, el registro de clases, la sesión en
           vivo, planes, asistencia presencial, informe mensual, subgrupos—,
           todo sobre una cuenta que no tiene alumnos propios. Como a quien
           supervisa, no se le recorta el panel de siempre tarjeta por tarjeta:
           se le pinta el suyo, entero, acá.

           Lo de dar clase lo sigue pudiendo MIRAR: «Ver como: profesor» (js/
           modo-vista.js) le pinta el panel de un profesor, que es para lo que
           existe ese selector. Y lo que ya veía de los profesores lo sigue
           viendo: Informes, Supervisión y el Tablero por academia muestran a
           todos, con el alcance que le da la base.

           «Revisar el contenido» está porque su trabajo es que todo funcione:
           son las páginas que el alumnado usa, para abrirlas y comprobarlas. */
        const ADMIN_GROUPS = [
            { title: "Cómo va la plataforma", tiles: [
                { emoji: "📊", label: "Informes", desc: "El progreso de todos los alumnos, tema por tema, y los informes a la casa", href: "informes.html" },
                { emoji: "🧑‍🏫", label: "Supervisión de profesores", desc: "Qué hizo cada profesor en el mes —clases, tareas, exámenes— y su informe mensual", href: "supervision.html" },
                { emoji: "📈", label: "Tablero por academia", desc: "Clases, alumnos, informes, gasto de IA y cobros de cada academia", href: "tablero-academias.html" },
                { emoji: "📄", label: "Reportes de actividades", desc: "El informe de lo que pasó en clase en un periodo, en Word y PDF", href: "reportes.html" },
                { emoji: "🗂️", label: "Actualizaciones", desc: "Todo lo que se le ha hecho a la plataforma desde el primer día", href: "novedades.html" },
            ] },
            { title: "Cuentas y personas", tiles: [
                { emoji: "👑", label: "Administración", desc: "Cuentas, roles, profesores, supervisores y equipos", href: "admin.html" },
                { emoji: "🏫", label: "Academias", desc: "Crea las academias, ponles supervisor y reparte a su gente", href: "academias.html" },
                { emoji: "🧭", label: "Coordinación", desc: "Los profesores y sus alumnos: quién es quién, cómo entra y cómo se ordena", href: "coordinacion.html" },
            ] },
            /* Todos los formularios juntos: los que se arman, los que llegan
               de afuera (torneo en línea, pedir ingreso) y la encuesta de
               satisfacción. Antes estaban repartidos entre «Cuentas y
               personas» y el panel de Administración. La misma lista, en el
               mismo orden, es el grupo «Formularios» de ATAJOS en js/admin.js. */
            { title: "Formularios", tiles: [
                { emoji: "⭐", label: "Satisfacción con los profesores", desc: "Qué opina el alumnado de cada profesor y quién dice que se va", href: "satisfaccion.html" },
                { emoji: "📋", label: "Formularios de inscripción", desc: "Arma un formulario, compártelo por enlace y baja las respuestas", href: "formularios.html" },
                { emoji: "📝", label: "Solicitudes de la Academia", desc: "Quien pidió unirse: aprobar crea la cuenta, rechazar invita a un plan pago", href: "solicitudes.html" },
                { emoji: "🏅", label: "Inscripciones a torneos en línea", desc: "Las respuestas del formulario de inscripcion.html", href: "inscripciones.html" },
            ] },
            { title: "Cobros y accesos", tiles: [
                { emoji: "💳", label: "Cobros de la Academia", desc: "Mensualidades, pagos y morosidad. Los recordatorios salen solos", href: "cobros.html" },
                { emoji: "🎟️", label: "Accesos y cupos", desc: "Los paquetes de acceso y los cupos de cada academia", href: "accesos.html" },
                { emoji: "🛒", label: "Tienda de materiales", desc: "El catálogo de venta: todavía no está abierta al público", href: "tienda.html" },
            ] },
            { title: "Resultados de las pruebas", tiles: [
                { emoji: "🧭", label: "Diagnósticos de nivel", desc: "El nivel medido de cada alumno y dónde está floja cada clase", href: "informes.html?tema=diagnostico" },
                { emoji: "🌐", label: "Diagnósticos del público", desc: "Quién hizo el diagnóstico sin cuenta: contactos para invitar a la Academia", href: "informes.html?tema=diagnostico-publico" },
                { emoji: "⚖️", label: "Exámenes de arbitraje", desc: "Los del público: revísalos y respóndeles", href: "arbitraje.html" },
            ] },
            { title: "Revisar el contenido", tiles: [
                { emoji: "🏛️", label: "Cursos", desc: "Los cursos de la Academia y el temario de cada uno", href: "cursos/academia/index.html" },
                { emoji: "🏋️", label: "Entrenamiento", desc: "Los ejercicios y lecciones que usa el alumnado", href: "entreno/index.html" },
                { emoji: "📚", label: "Estudio", desc: "Las fichas de aperturas, defensas y temas tácticos", href: "entreno/estudio.html" },
                { emoji: "📖", label: "Artículos", desc: "Lecturas técnicas y pedagógicas", href: "articulos.html" },
                { emoji: "📺", label: "TV en vivo", desc: "Las partidas de la Academia en directo", href: "tv.html" },
                { emoji: "📘", label: "Guía del profesor", desc: "Todo lo que la plataforma deja hacer y cómo se hace", href: "guia-del-profesor-accesible.html" },
                { emoji: "📝", label: "Lector de planilla", desc: "Todavía en prueba: fotografía una planilla y conviértela en PGN", href: "lector-planilla.html" },
            ] },
            { title: "Tu cuenta", tiles: [
                { emoji: "⚙️", label: "Configuración", desc: "Tu perfil y contraseña", href: "configuracion.html" },
            ] },
        ];

        /* El resumen de arriba, el de toda la plataforma: los mismos tres números
           que ve quien supervisa (estudiantes, profesores, sin entrenar), pero de
           todos. Se cuentan en la base: mi_gente() trae el total en cada fila y
           informes_inactivos() se cuenta con `head` —sin bajarse la lista—,
           porque PostgREST corta a mil filas sin avisar. */
        async function cargarPanelAdmin() {
            document.getElementById("progreso-supervisor-titulo").textContent = "Toda la plataforma";
            const conteo = async (rol) => {
                const { data } = await sb.rpc("mi_gente", { p_busqueda: null, p_rol: rol, p_limite: 1, p_desde: 0 });
                return data && data.length ? Number(data[0].total) : 0;
            };
            const [nAlumnos, nProfes, inacRes] = await Promise.all([
                conteo("alumno"), conteo("profesor"),
                sb.rpc("informes_inactivos", { p_dias: 4 }, { count: "exact", head: true }),
            ]);
            document.getElementById("sup-alumnos").textContent = String(nAlumnos);
            document.getElementById("sup-profes").textContent = String(nProfes);
            const inac = document.getElementById("sup-inactivos");
            const inactivos = inacRes.error ? null : Number(inacRes.count || 0);
            inac.textContent = inactivos === null ? "—" : String(inactivos);
            inac.className = "text-2xl font-bold " + (inactivos > 0 ? "text-red-600 dark:text-red-400" : "text-brand-800 dark:text-white");
        }

        /* Quien supervisa y nada más: si además administra, manda su panel de
           administración (salvo que esté mirando "como supervisor"). */
        function esSupervisorSolo() { return !!(profile && profile.es_supervisor && !profile.is_admin); }

        async function cargarPanelSupervisor() {
            const conteo = async (rol) => {
                const { data } = await sb.rpc("mi_gente", { p_busqueda: null, p_rol: rol, p_limite: 1, p_desde: 0 });
                return data && data.length ? Number(data[0].total) : 0;
            };
            const [nAlumnos, nProfes, idsRes, inacRes] = await Promise.all([
                conteo("alumno"), conteo("profesor"),
                sb.rpc("mis_supervisados"),
                sb.rpc("informes_inactivos", { p_dias: 4 }),
            ]);
            const aCargo = new Set((idsRes.data || []).map((x) => (typeof x === "string" ? x : x.mis_supervisados)));
            const inactivos = (inacRes.data || []).filter((a) => aCargo.has(a.id)).length;
            document.getElementById("sup-alumnos").textContent = String(nAlumnos);
            document.getElementById("sup-profes").textContent = String(nProfes);
            const inac = document.getElementById("sup-inactivos");
            inac.textContent = idsRes.error || inacRes.error ? "—" : String(inactivos);
            inac.className = "text-2xl font-bold " + (inactivos > 0 ? "text-red-600 dark:text-red-400" : "text-brand-800 dark:text-white");
            const aviso = document.getElementById("sup-aviso");
            if (profile._admin_real) {
                aviso.textContent = "Estás mirando como supervisor desde la cuenta que administra: los números son los de esa cuenta, que no tiene ninguna asignada. Así se ve el panel; los datos los ve cada supervisor.";
                aviso.hidden = false;
            } else if (!nAlumnos && !nProfes) {
                aviso.textContent = "Todavía no tienes ninguna cuenta a tu cargo. Quien administra te las asigna desde el panel de Administración › Supervisores.";
                aviso.hidden = false;
            }
        }

        /* Un acceso "en mantenimiento" se apaga SOLO para el alumnado: el equipo
           docente lo sigue necesitando. Se apaga acá, en un solo lugar y sobre
           la lista ya armada, en vez de escribir `disabled` a mano en cada
           tile — así prender de nuevo un acceso es borrar una línea. Como todo
           filtro del sitio, esto decide qué se PINTA: la dirección sigue
           existiendo y quien la conozca entra igual. */
        /* Quien da clase y quien administra ven lo mismo: la regla permanente
           de que todo lo que se hace para los profesores vale también para
           quien administra, con el alcance que ya le da la base. Las tres
           funciones que reparten el panel entre sus dos públicos preguntan por
           acá, en vez de repetir el `||` y que a la cuarta se le olvide la
           mitad. */
        function esEquipoDocente() { return isTeacher || profile.is_admin; }

        function apagarEnMantenimiento() {
            if (esEquipoDocente()) return;
            TILE_GROUPS.forEach((g) => g.tiles.forEach((t) => {
                if (!t.mantenimientoAlumno) return;
                t.disabled = true;
                t.nota = "En mantenimiento";
                delete t.href;
            }));
        }

        /* El panel estaba escrito para el alumno de punta a punta, y a quien da
           clase le decía cosas que no son: que "tu profesor te asigna el rival"
           (lo asigna ella), que los torneos "los arma tu profesor" (los arma
           ella), que Informes es "tu progreso" (es el de sus 29 alumnos) o que
           la sesión en vivo es "el tablero con tu profesor". Tareas tenía el
           defecto al revés: su texto era el del profesor, así que al alumno le
           ofrecía asignarle material a unos alumnos que no tiene.

           No rompía nada —por eso nunca saltó—, que es justamente por lo que
           conviene que lo mire una prueba. El texto de cada rol vive junto al
           tile (`desc` y `descProfe`) y no repartido en `if`s por init(): así
           se ven los dos de un vistazo al leer la lista, y un tile nuevo que
           solo sirva para uno de los dos se nota enseguida.

           Se aplica sobre la lista ya armada y en un solo lugar, igual que
           apagarEnMantenimiento(). Vale para quien administra, como todo lo
           que se hace para los profesores. */
        function textosDelEquipoDocente() {
            if (!esEquipoDocente()) return;
            TILE_GROUPS.forEach((g) => g.tiles.forEach((t) => {
                if (t.descProfe) t.desc = t.descProfe;
            }));
        }

        function renderTileCard(t, destacado) {
            const base = "group flex flex-col items-center text-center gap-2 rounded-2xl p-5 shadow-md transition-all duration-200"
                + (destacado ? " sm:flex-row sm:items-center sm:text-left sm:gap-5" : "");
            let el;
            if (t.disabled) {
                // Ni <a> ni <button>: un acceso apagado no debe recibir el foco
                // del teclado ni prometer un destino que no va a abrir. La
                // razón va escrita en la tarjeta (t.nota) — un cuadro gris sin
                // explicación se lee como una página rota.
                el = document.createElement("div");
                /* Se puede ENFOCAR aunque no lleve a ninguna parte: con Tab,
                   quien usa lector de pantalla se saltaba la tarjeta entera y
                   no se enteraba de que «Sesión en vivo» existe ni de por qué
                   está cerrada. Con role="link" y aria-disabled se anuncia
                   como «enlace, no disponible» y se lee su razón; sigue sin
                   `href`, así que no promete ningún destino. */
                el.tabIndex = 0;
                el.setAttribute("role", "link");
                /* `apagado` es para el candado que SÍ se va a abrir hoy —la
                   sesión en vivo mientras el profe no empieza—: ahí la nota
                   explica el candado, y con `opacity` sobre el blanco de la
                   tarjeta de al lado esa nota queda casi ilegible. Es la misma
                   pinta que ya usa el botón de la videollamada, que va pegado. */
                el.className = base + " cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
                    + (t.apagado ? t.apagado.clases : "bg-white/60 dark:bg-brand-900/60 opacity-60");
                el.setAttribute("aria-disabled", "true");
            } else {
                el = document.createElement("a");
                el.href = t.href;
                el.className = base + " bg-white dark:bg-brand-900 hover:shadow-xl hover:-translate-y-0.5" + (t.primary ? " ring-2 ring-accent-500" : "");
            }
            const iconWrap = document.createElement("div");
            iconWrap.className = "w-14 h-14 rounded-xl flex items-center justify-center text-3xl overflow-hidden shrink-0 " + (t.primary ? "bg-accent-500/20" : "bg-brand-50 dark:bg-brand-800") + " group-hover:scale-105 transition-transform";
            if (t.photo) {
                // Foto real de Oscar en vez de un emoji genérico, igual que en tablero.html
                // ("Juega contra Oscar"): la etiqueta de al lado ya dice de qué se trata,
                // así que la imagen es puramente decorativa.
                const img = document.createElement("img");
                img.src = t.photo;
                img.alt = "";
                img.className = "w-full h-full object-cover";
                iconWrap.appendChild(img);
            } else {
                iconWrap.textContent = t.emoji;
                // El emoji es adorno: el nombre del acceso va escrito al lado. Sin
                // esconderlo, el lector de pantalla dice "persona levantando pesas,
                // Entrenamiento" en cada tarjeta del panel.
                iconWrap.setAttribute("aria-hidden", "true");
            }
            const texto = document.createElement("span");
            texto.className = "flex flex-col items-center gap-1" + (destacado ? " sm:items-start" : "");
            const label = document.createElement("span");
            label.className = "font-semibold text-sm " + ((t.apagado && t.apagado.tituloClases) || "text-brand-800 dark:text-white");
            label.textContent = t.label;
            const desc = document.createElement("span");
            desc.className = "text-xs " + ((t.apagado && t.apagado.notaClases) || "text-brand-450 dark:text-brand-350");
            desc.textContent = t.desc;
            texto.append(label, desc);
            if (t.nota) {
                const nota = document.createElement("span");
                nota.className = "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-800 text-brand-500 dark:text-brand-300";
                nota.textContent = t.nota;
                texto.appendChild(nota);
            }
            el.append(iconWrap, texto);
            return el;
        }

        /* ---------- La videollamada de la clase ----------
           El botón que va al lado de «Sesión en vivo». Está SIEMPRE y arranca
           con candado: así el alumno sabe que existe antes de necesitarlo, en
           vez de descubrirlo el día que alguien se acuerda de mandarle el
           enlace. Se abre cuando alguno de sus profes tiene clase abierta.

           QUIÉN VE EL ENLACE NO LO DECIDE ESTA PÁGINA. La RLS de
           `profesor_videollamada` solo se lo entrega al alumno mientras ese
           profesor tenga una clase abierta, así que sin clase la columna
           `videollamada` de mis_clases() llega en null y acá no hay nada que
           esconder. El candado que se dibuja es el mismo que ya hizo cumplir
           la base — no una pantalla que tape un dato que igual viajó. */
        /* La pinta del botón apagado, en un solo lugar: se usa en los tres
           estados en que no hay a dónde entrar. Va con fondo gris y borde y no
           con `opacity`, que al lado del blanco de la tarjeta dejaba la nota
           casi ilegible — y esa nota es justamente la que explica el candado. */
        const VLL_APAGADO = {
            clases: "bg-brand-100 dark:bg-brand-900 border border-brand-200 dark:border-brand-700",
            tituloClases: "text-brand-700 dark:text-brand-200",
            notaClases: "text-brand-600 dark:text-brand-300",
        };

        let misClases = [];          // lo que devolvió mis_clases(): un renglón por profesor
        let misSalas = [];           // las salas propias, para el equipo docente: una por grupo
        let videollamadaLista = false;

        function cajaVideollamada(boton) {
            const el = document.createElement(boton.href ? "a" : "div");
            el.className = "group flex flex-1 flex-col items-center justify-center text-center gap-1 rounded-2xl p-4 shadow-md transition-all duration-200 sm:min-w-[13rem] "
                + boton.clases;
            if (boton.href) {
                el.href = boton.href;
                if (boton.fuera) { el.target = "_blank"; el.rel = "noopener noreferrer"; }
            } else {
                // Igual que un acceso apagado: sin `href`, así que no promete
                // un destino, pero se puede enfocar para leer por qué está
                // cerrado (ver renderTileCard()).
                el.tabIndex = 0;
                el.setAttribute("role", "link");
                el.setAttribute("aria-disabled", "true");
                el.classList.add("focus:outline-none", "focus-visible:ring-2", "focus-visible:ring-accent-400");
            }
            const icono = document.createElement("span");
            icono.className = "text-2xl leading-none";
            icono.setAttribute("aria-hidden", "true");
            icono.textContent = boton.emoji;
            const titulo = document.createElement("span");
            titulo.className = "font-semibold text-sm " + (boton.tituloClases || "text-brand-800 dark:text-white");
            titulo.textContent = boton.titulo;
            const nota = document.createElement("span");
            nota.className = "text-xs " + (boton.notaClases || "text-brand-450 dark:text-brand-350");
            nota.textContent = boton.nota;
            el.append(icono, titulo, nota);
            return el;
        }

        function botonVideollamadaAlumno() {
            if (!videollamadaLista) {
                return cajaVideollamada({ emoji: "📹", titulo: "Videollamada", nota: "Viendo si hay clase…",
                    ...VLL_APAGADO });
            }
            const clase = Videollamada.claseConLlamada(misClases, boardOwnerId);
            /* Tres estados, y los tres dicen POR QUÉ. Un candado sin
               explicación se lee como una página rota, y "hay clase pero tu
               profe no puso el enlace" es lo único que separa un botón que
               todavía no toca de uno que nunca va a funcionar. */
            if (!clase) {
                return cajaVideollamada({ emoji: "🔒", titulo: "Videollamada",
                    nota: "Se abre cuando tu profe empiece la clase",
                    ...VLL_APAGADO, clases: VLL_APAGADO.clases + " cursor-not-allowed" });
            }
            if (!Videollamada.esSeguro(clase.videollamada)) {
                return cajaVideollamada({ emoji: "🔒", titulo: "Videollamada",
                    nota: "Hay clase, pero tu profe todavía no puso el enlace",
                    ...VLL_APAGADO, clases: VLL_APAGADO.clases + " cursor-not-allowed" });
            }
            return cajaVideollamada({ emoji: "📹", titulo: Videollamada.etiqueta(clase.videollamada),
                // De quién es la llamada va escrito: con varios profesores, el
                // botón podría llevar a la clase de otro y eso no se adivina.
                nota: "Con " + (clase.profesor || "tu profe"),
                href: clase.videollamada, fuera: true,
                clases: "bg-accent-500 hover:bg-accent-600 hover:shadow-xl hover:-translate-y-0.5",
                tituloClases: "text-brand-900", notaClases: "text-brand-900/80" });
        }

        /* El equipo docente puede tener VARIAS salas —una por sede— así que
           se pinta una por sala y no un botón con menú: con dos o tres, verlas
           todas de un vistazo es más rápido que desplegar nada, y el nombre
           del grupo va escrito en cada una. A las tres de la tarde, quien va a
           dar clase en SJ tiene que poder apretar «SJ» sin pensarlo. */
        function botonesVideollamadaProfesor() {
            if (!videollamadaLista) {
                return [cajaVideollamada({ emoji: "📹", titulo: "Videollamada", nota: "Cargando…", ...VLL_APAGADO })];
            }
            /* Al profesor NO se le bloquea: él entra a la llamada ANTES de que
               haya clase abierta —es él quien la abre—, así que un candado ahí
               le cerraría la puerta por la que tiene que entrar primero. El
               candado es del alumno, que es quien no debe entrar a una llamada
               que no está pasando. */
            const salas = misSalas.filter((x) => Videollamada.esSeguro(x.enlace));
            if (!salas.length) {
                return [cajaVideollamada({ emoji: "📹", titulo: "Pon tu videollamada",
                    nota: "Tus alumnos la verán cuando abras la clase",
                    href: "configuracion.html#videollamada",
                    clases: "bg-white dark:bg-brand-900 border-2 border-dashed border-accent-400 hover:shadow-xl hover:-translate-y-0.5" })];
            }
            // Los grupos primero y la general al final, como en Configuración:
            // la general es el respaldo, no la que manda.
            salas.sort((a, b) => (a.grupo ? 0 : 1) - (b.grupo ? 0 : 1) || String(a.grupo).localeCompare(b.grupo, "es"));
            return salas.map((sala) => cajaVideollamada({
                emoji: "📹",
                titulo: Videollamada.etiqueta(sala.enlace),
                // Con varias salas, cuál es cuál no se adivina por el enlace.
                nota: sala.grupo ? "Clase de " + sala.grupo : (salas.length > 1 ? "Los demás grupos" : "Tu sala"),
                href: sala.enlace, fuera: true,
                clases: "bg-accent-500 hover:bg-accent-600 hover:shadow-xl hover:-translate-y-0.5",
                tituloClases: "text-brand-900", notaClases: "text-brand-900/80" }));
        }

        /* La tarjeta «Sesión en vivo» se abre con la clase, igual que el botón
           de la videollamada que va a su lado — y por la misma razón de fondo:
           el candado NO lo pone esta pantalla. Sin clase abierta la RLS no le
           entrega al alumno el tablero, así que entrar solo le pintaría una
           pantalla vacía. Lo que se dibuja acá es ese mismo candado, dicho
           antes de tocar, para que «hay clase» se pueda saber de un vistazo.

           Al equipo docente no se le bloquea nada: la clase la abre él, así que
           un candado ahí le cerraría la puerta por la que tiene que entrar
           primero. */
        let tileSesion = null;

        function tarjetaSesionEnVivo() {
            const t = tileSesion;
            if (!t) return null;
            const apagada = (desc, nota) => renderTileCard(
                Object.assign({}, t, { disabled: true, desc, nota, apagado: VLL_APAGADO }), true);
            if (esEquipoDocente()) return renderTileCard(t, true);
            if (!videollamadaLista) return apagada(t.desc, "Viendo si hay clase…");
            // Sin ningún profesor no hay clase que esperar, y el panel ya se lo
            // dice con todas las letras: acá se nombra el motivo de verdad en
            // vez de un candado que parecería que se va a abrir solo.
            if (!misClases.length) return apagada("Pide que te asignen un profesor", "Sin profesor");
            if (!misClases.some((c) => c.clase_abierta)) {
                return apagada("Se abre cuando tu profe empiece la clase", "Todavía no hay clase");
            }
            return renderTileCard(t, true);
        }

        /* Que la clase se abra lo trae Realtime y la tarjeta se destapa sola:
           quien ve la pantalla lo nota, quien no la ve no se enteraba hasta
           volver a pasar por ahí. Se dice en una región viva, y solo en el
           CAMBIO: al cargar, la tarjeta ya lo dice y anunciarlo sería ruido. */
        let claseAbiertaAntes = null;
        function avisarCambioDeClase() {
            if (esEquipoDocente() || !videollamadaLista) return;
            const abierta = misClases.some((c) => c.clase_abierta);
            if (claseAbiertaAntes !== null && abierta !== claseAbiertaAntes) {
                const clase = misClases.find((c) => c.clase_abierta);
                document.getElementById("aviso-clase").textContent = abierta
                    ? `${(clase && clase.profesor) || "Tu profe"} abrió la clase: ya puedes entrar a la sesión en vivo.`
                    : "La clase en vivo terminó.";
            }
            claseAbiertaAntes = abierta;
        }

        function pintarClaseEnVivo() {
            avisarCambioDeClase();
            const wrap = document.getElementById("sesion-wrap");
            if (wrap) {
                wrap.innerHTML = "";
                const tarjeta = tarjetaSesionEnVivo();
                if (tarjeta) wrap.appendChild(tarjeta);
            }
            pintarVideollamada();
        }

        function pintarVideollamada() {
            const caja = document.getElementById("videollamada-wrap");
            if (!caja) return;
            caja.innerHTML = "";
            /* A un alumno sin ningún profesor no se le pinta: no hay clase que
               esperar, y el panel ya le dice con todas las letras que pida que
               le asignen uno. Un candado más ahí sería una promesa de algo que
               no va a llegar solo. */
            if (!esEquipoDocente() && videollamadaLista && !misClases.length) return;
            // Al alumno le toca UNA: la que la base ya eligió por su grupo.
            const botones = esEquipoDocente() ? botonesVideollamadaProfesor() : [botonVideollamadaAlumno()];
            botones.forEach((b) => caja.appendChild(b));
            /* Con una sola sala, el botón se estira hasta la altura de la
               tarjeta de al lado y la fila queda pareja. Con tres, estirar la
               tarjeta para acompañarlos la deja con media pantalla en blanco:
               ahí cada uno se queda con su alto. */
            if (caja.parentElement) caja.parentElement.classList.toggle("sm:items-start", botones.length > 1);
        }

        /* Se vuelve a preguntar entera en vez de mirar solo el evento que
           llegó: el alumno puede tener varios profesores y la clase la puede
           abrir cualquiera de ellos. */
        async function refrescarVideollamada() {
            if (esEquipoDocente()) {
                const { data } = await sb.from("profesor_videollamada").select("grupo, enlace").eq("profesor_id", profile.id);
                misSalas = data || [];
            } else {
                const { data } = await sb.rpc("mis_clases");
                misClases = data || [];
            }
            videollamadaLista = true;
            pintarClaseEnVivo();
        }

        function renderTiles() {
            // Quien puede buscar gente lo ve escrito en el campo.
            if (buscaPersonas()) campoBusqueda.placeholder = "Cobros, tareas, el nombre de un alumno…";
            const grid = document.getElementById("tile-grid");
            grid.innerHTML = "";
            TILE_GROUPS.forEach((group) => {
                /* Un grupo del que no queda ni un acceso utilizable no se
                   pinta. A la alumna, "Herramientas" le salía como un
                   encabezado y dos cuadros grises —sus dos accesos están en
                   mantenimiento—: una sección entera de la página que no lleva
                   a ninguna parte, que es la misma razón por la que se fue el
                   "Próximamente" sin fecha. Un acceso apagado ENTRE otros que
                   funcionan sí se queda, y con su razón escrita: ahí uno vino
                   por otra cosa y de paso se entera de que eso vuelve. */
                if (group.tiles.length === 0 || group.tiles.every((t) => t.disabled)) return;
                const section = document.createElement("section");
                const heading = document.createElement("h2");
                heading.className = "font-serif text-lg font-bold text-brand-800 dark:text-white mb-3";
                /* El rótulo tiene los mismos dos públicos que la descripción de
                   un tile: "Lo que te pone tu profesor" es, del otro lado del
                   escritorio, lo que ELLA le pone a sus alumnos. Pero al revés
                   que `descProfe`, se ELIGE al pintar y no se escribe encima de
                   `group.title`: todo lo que retoca la grilla busca su grupo por
                   ese nombre, y un título mutado dejaría esas búsquedas sin
                   encontrarlo. Al alumnado no le fallaría nunca —el rótulo solo
                   cambia para el equipo docente—, así que se descubriría en el
                   panel de otra persona. */
                heading.textContent = (esEquipoDocente() && group.titleProfe) || group.title;
                // Lo que se busca: el rótulo que se VE, no el de la lista.
                section.dataset.buscar = textoBuscable(heading.textContent);
                const tilesGrid = document.createElement("div");
                // Un grupo destacado lleva un solo acceso: en la grilla de cuatro
                // columnas quedaría un cuadrito perdido a la izquierda, así que
                // ocupa el ancho entero.
                // Un grupo destacado lleva la tarjeta ancha y, a su derecha, el
                // botón de la videollamada: 1fr para la tarjeta y lo que pida el
                // botón. En el celular se apilan, que es donde un botón al lado
                // dejaría las dos cosas ilegibles.
                tilesGrid.className = group.destacado
                    ? "grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 md:gap-5"
                    : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5";
                group.tiles.forEach((t) => {
                    if (!t.videollamada) {
                        const tarjeta = renderTileCard(t, !!group.destacado);
                        tarjeta.dataset.buscar = buscableDeTile(t);
                        tilesGrid.appendChild(tarjeta);
                        return;
                    }
                    /* La tarjeta de la clase en vivo va dentro de un envoltorio
                       para poder repintarla sola cuando se abre o se cierra una
                       clase — repintar la grilla entera cerraría cualquier cosa
                       que estuviera abierta debajo. Va con `contents`, así que
                       para el grid la celda sigue siendo la tarjeta: sin eso, el
                       envoltorio se comería el `sm:items-start` y la tarjeta
                       dejaría de estirarse. */
                    tileSesion = t;
                    const envoltorio = document.createElement("div");
                    envoltorio.id = "sesion-wrap";
                    envoltorio.className = "contents";
                    // La tarjeta de adentro se repinta sola; el texto que se
                    // busca vive en el envoltorio, que no se repinta.
                    envoltorio.dataset.buscar = buscableDeTile(t);
                    tilesGrid.appendChild(envoltorio);
                    const caja = document.createElement("div");
                    caja.id = "videollamada-wrap";
                    // Una celda del grid que apila lo que lleve dentro: con
                    // una sala se ve como un botón, con tres son tres.
                    caja.className = "flex flex-col gap-3";
                    tilesGrid.appendChild(caja);
                });
                section.append(heading, tilesGrid);
                grid.appendChild(section);
            });
            pintarClaseEnVivo();
            aplicarBusqueda();
        }

        /* ---------- El buscador de accesos ----------
           Filtra la grilla que YA está pintada: lo que el rol de cada quien no
           tiene no está en la grilla, así que tampoco aparece al buscar. No
           hay una segunda lista de destinos que se pueda desordenar de la
           primera; lo único propio es CLAVES_BUSQUEDA, las palabras con que la
           gente pide una cosa que se llama distinto («pagos» es Cobros,
           «contraseña» es Configuración). Van por destino (el href sin su
           ?tema=), así que valen igual en el panel de quien supervisa. Cada
           clave tiene que ser cierta: está porque ESA página lo tiene. */
        const CLAVES_BUSQUEDA = {
            "sesion.html": "clase en vivo tablero videollamada meet zoom teams pizarra",
            "tareas.html": "deberes asignaciones pendientes fecha limite",
            "examenes.html": "prueba pruebas evaluacion evaluaciones nota notas",
            "entreno/index.html": "ejercicios practicar tactica mates coordenadas lecciones problemas",
            "entreno/estudio.html": "fichas aperturas defensas repasar conceptos",
            "cursos/academia/index.html": "curso temario lecciones",
            "articulos.html": "leer lecturas blog",
            "juegos.html": "partidas jugar rival crazyhouse niebla variantes retar",
            "torneos.html": "torneo competir competencia rondas tabla",
            "tv.html": "ver partidas en directo transmision",
            "tablero.html": "bot motor oscar jugar contra la computadora",
            "logros.html": "medallas racha premios",
            "entreno/diagnostico.html": "nivel examen de nivel prueba de nivel",
            "nivel-de-arbitraje.html": "arbitro reglamento fide",
            "arbitraje.html": "arbitro reglamento fide revisar",
            "partidas.html": "pgn partidas guardadas carpetas subir",
            "informes.html": "progreso estadisticas notas reportes asistencia alumnos informe a la casa encargados padres",
            "configuracion.html": "contrasena clave perfil cuenta tema colores tablero piezas avisos notificaciones videollamada voz",
            "admin.html": "cuentas usuarios roles crear cuenta novedades",
            "supervision.html": "profesores informe mensual actividad",
            "academias.html": "academia supervisor",
            "tablero-academias.html": "cifras numeros del mes",
            "planes.html": "planificar preparar clase posiciones",
            "asistencia.html": "pasar lista presencial aula",
            "informe-mensual.html": "informe del mes supervision",
            "subgrupos.html": "listas grupos de alumnos",
            "guia-del-profesor-accesible.html": "ayuda manual como se hace",
            "coordinacion.html": "cuentas usuarios profesores alumnos",
            "solicitudes.html": "aprobar nuevos unirse inscripciones",
            "formularios.html": "inscripcion inscripciones enlace respuestas",
            "satisfaccion.html": "encuesta satisfaccion opinion calificar profesores alumnos contentos se van",
            "encuesta-profesor.html": "encuesta opinion calificar profesor",
            "cobros.html": "pagos pago mensualidad mensualidades dinero morosos morosidad recibos",
            "reportes.html": "word pdf actividades periodo",
            "accesos.html": "cupos paquetes acceso",
        };

        // Sin tildes y en minúscula: «contraseña», «contrasena» y «CONTRASEÑA»
        // encuentran lo mismo, como el buscador de admin.html.
        // Y solo letras y números, separados por un espacio (con uno al
        // principio): así cada palabra buscada se compara con el COMIENZO de
        // una palabra. «mari» encuentra a María, no la tarjeta de Cursos por
        // decir «temario».
        function textoBuscable(t) {
            return " " + String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
                .replace(/[^a-z0-9]+/g, " ").trim();
        }
        function buscableDeTile(t) {
            const destino = String(t.href || "").split("?")[0];
            return textoBuscable([t.label, t.desc, t.nota || "", CLAVES_BUSQUEDA[destino] || ""].join(" "));
        }

        const campoBusqueda = document.getElementById("buscar-panel-campo");
        const estadoBusqueda = document.getElementById("buscar-panel-estado");
        let primeroDeLaBusqueda = null;
        let anuncioBusqueda = null;
        let accesosEncontrados = 0, personasEncontradas = 0;

        /* ---------- Buscar personas ----------
           Además de las tarjetas, el buscador encuentra a la GENTE: «María»
           lleva al informe de María. Lo que se puede encontrar lo decide la
           base, no esta página: mi_gente() devuelve solo a quien cada uno
           alcanza (sus alumnos si da clase; sus profesores y los alumnos de
           ellos si coordina o supervisa; todos si administra), filtra sin
           tildes y corta. Al alumnado no se le busca gente: no la tiene. */
        const PERSONAS_A_LA_VEZ = 6;
        let busquedaDePersonas = 0, esperaDePersonas = null;

        function buscaPersonas() {
            return !!profile && (esEquipoDocente() || profile.es_supervisor || profile.es_coordinador);
        }
        function ofreceCoordinacion() {
            return !!profile && (profile.is_admin || profile.es_coordinador || profile.es_supervisor);
        }
        // A dónde lleva cada persona: el alumno, a su informe; quien da clase,
        // a Coordinación con su nombre puesto (si quien busca puede entrar ahí).
        function destinoDePersona(p) {
            if (p.role === "alumno") return { href: "informes.html?alumno=" + encodeURIComponent(p.id), que: "Ver su informe" };
            if (ofreceCoordinacion()) return { href: "coordinacion.html?buscar=" + encodeURIComponent(p.full_name || p.email || ""), que: "Verlo en Coordinación" };
            return null;
        }

        function pintarPersonas(filas, total) {
            const caja = document.getElementById("buscar-personas");
            const lista = document.getElementById("buscar-personas-lista");
            const mas = document.getElementById("buscar-personas-mas");
            lista.innerHTML = "";
            mas.textContent = "";
            let pintadas = 0;
            filas.forEach((p) => {
                const destino = destinoDePersona(p);
                if (!destino || (session && p.id === session.user.id)) return;
                const li = document.createElement("li");
                const a = document.createElement("a");
                a.href = destino.href;
                a.className = "flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-brand-900 shadow-md px-4 py-3 hover:shadow-lg transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                const quien = document.createElement("span");
                quien.className = "min-w-0";
                const nombre = document.createElement("span");
                nombre.className = "block font-semibold text-sm text-brand-800 dark:text-white truncate";
                nombre.textContent = p.full_name || p.email || "Sin nombre";
                const dato = document.createElement("span");
                dato.className = "block text-xs text-brand-500 dark:text-brand-300 truncate";
                dato.textContent = [p.role === "alumno" ? "Alumno" : (p.is_admin ? "Administración" : "Profesor"), p.grupo].filter(Boolean).join(" · ");
                quien.append(nombre, dato);
                const que = document.createElement("span");
                que.className = "shrink-0 text-xs font-semibold text-accent-700 dark:text-accent-400";
                que.textContent = destino.que + " →";
                a.append(quien, que);
                li.appendChild(a);
                lista.appendChild(li);
                pintadas += 1;
            });
            if (total > filas.length) {
                mas.textContent = `Hay ${total} en total. Escribe más para acotar`
                    + (ofreceCoordinacion() ? ", o búscalos a todos en Coordinación." : ".");
            }
            caja.hidden = pintadas === 0;
            personasEncontradas = pintadas;
            return pintadas;
        }

        function buscarPersonas(escrito) {
            clearTimeout(esperaDePersonas);
            const mia = ++busquedaDePersonas;
            if (!buscaPersonas() || escrito.length < 2) { pintarPersonas([], 0); return; }
            // Se espera a que se deje de escribir: una consulta por palabra, no por letra.
            esperaDePersonas = setTimeout(async () => {
                const { data, error } = await sb.rpc("mi_gente",
                    { p_busqueda: escrito, p_rol: null, p_limite: PERSONAS_A_LA_VEZ, p_desde: 0 });
                if (mia !== busquedaDePersonas) return;   // llegó tarde: ya se escribió otra cosa
                const filas = error ? [] : (data || []);
                pintarPersonas(filas, filas.length ? Number(filas[0].total) : 0);
                anunciarBusqueda();
            }, 300);
        }

        /* El resultado se anuncia (role="status"), pero no a cada tecla: con
           un lector de pantalla, «tres accesos» dicho por cada letra tapa lo
           que se está escribiendo. Junta las tarjetas y las personas. */
        function anunciarBusqueda() {
            clearTimeout(anuncioBusqueda);
            const escrito = campoBusqueda.value.trim();
            if (!escrito) { estadoBusqueda.textContent = ""; return; }
            anuncioBusqueda = setTimeout(() => {
                if (!accesosEncontrados && !personasEncontradas) {
                    estadoBusqueda.textContent = `Nada con «${escrito}». Prueba con otra palabra: cobros, tareas, contraseña…`;
                    return;
                }
                const partes = [];
                if (accesosEncontrados) partes.push(`${accesosEncontrados} ${accesosEncontrados === 1 ? "acceso" : "accesos"}`);
                if (personasEncontradas) partes.push(`${personasEncontradas} ${personasEncontradas === 1 ? "persona" : "personas"}`);
                const primero = primerResultado();
                const nombre = primero ? (primero.querySelector("span > span") || primero).textContent : "";
                estadoBusqueda.textContent = `${partes.join(" y ")} con «${escrito}».` + (nombre ? ` Enter abre «${nombre}».` : "");
            }, 350);
        }

        // Enter abre la primera tarjeta; si no quedó ninguna, la primera persona.
        function primerResultado() {
            return primeroDeLaBusqueda || document.querySelector("#buscar-personas:not([hidden]) a[href]");
        }

        function aplicarBusqueda() {
            const escrito = campoBusqueda.value.trim();
            const palabras = textoBuscable(escrito).split(" ").filter(Boolean);
            let total = 0;
            primeroDeLaBusqueda = null;
            document.querySelectorAll("#tile-grid > section").forEach((sec) => {
                let visibles = 0, sesionVisible = true;
                sec.querySelectorAll(".grid > [data-buscar]").forEach((celda) => {
                    // Todas las palabras tienen que estar, en la tarjeta o en
                    // el rótulo de su grupo: «cobros academia» encuentra una.
                    const ok = palabras.every((p) => (celda.dataset.buscar + sec.dataset.buscar).includes(" " + p));
                    celda.style.display = ok ? "" : "none";
                    if (celda.id === "sesion-wrap") sesionVisible = ok;
                    if (!ok) return;
                    visibles += 1;
                    const enlace = celda.matches("a[href]") ? celda : celda.querySelector("a[href]");
                    if (!primeroDeLaBusqueda && enlace) primeroDeLaBusqueda = enlace;
                });
                // El botón de la videollamada va con su tarjeta.
                const video = sec.querySelector("#videollamada-wrap");
                if (video) video.style.display = sesionVisible ? "" : "none";
                sec.style.display = visibles ? "" : "none";
                total += visibles;
            });

            /* Mientras se busca, todo lo que va debajo del buscador y no es la
               grilla (la clase en curso, la semana, el progreso, el registro de
               clases) se hace a un lado. El buscador va arriba de todo: sin
               esto los resultados quedaban una pantalla más abajo, y debajo de
               ellos el registro decía «Ninguna clase coincide con el filtro»,
               como si le contestara a la búsqueda. Es `style.display` y no
               `hidden`, porque ese atributo ya lo maneja el código de cada
               bloque y borrar lo escrito tiene que dejarlos como estaban. */
            const buscando = palabras.length > 0;
            for (let el = document.getElementById("buscar-panel").nextElementSibling; el; el = el.nextElementSibling) {
                if (el.id !== "tile-grid" && el.id !== "buscar-personas") el.style.display = buscando ? "none" : "";
            }
            accesosEncontrados = total;
            anunciarBusqueda();
        }

        campoBusqueda.addEventListener("input", () => {
            aplicarBusqueda();
            buscarPersonas(campoBusqueda.value.trim());
        });
        document.getElementById("buscar-panel").addEventListener("submit", (e) => {
            e.preventDefault();
            aplicarBusqueda();
            const primero = primerResultado();
            if (primero && campoBusqueda.value.trim()) window.location.href = primero.href;
        });
        campoBusqueda.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && campoBusqueda.value) { e.preventDefault(); campoBusqueda.value = ""; aplicarBusqueda(); buscarPersonas(""); }
        });
        /* Ctrl + K (⌘ + K en Mac) o «/» llevan al buscador desde cualquier
           parte del panel. «/» solo cuando no se está escribiendo en otro
           campo: ahí es una barra, no un atajo. */
        /* clases.html?buscar=… es a donde manda el Ctrl + K de las demás páginas
           de la Academia (js/atajo-buscar.js): el panel abre con el foco en el
           buscador y, si venía un texto (lo que estaba seleccionado), ya
           buscándolo. Se llama al final de init(), con el panel ya pintado. */
        function abrirBusquedaPedida() {
            const params = new URLSearchParams(location.search);
            if (!params.has("buscar")) return;
            const texto = (params.get("buscar") || "").slice(0, 80);
            campoBusqueda.value = texto;
            if (texto) { aplicarBusqueda(); buscarPersonas(texto); }
            campoBusqueda.focus();
            campoBusqueda.select();
            // La dirección queda limpia: recargar no vuelve a buscar.
            params.delete("buscar");
            history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
        }

        document.addEventListener("keydown", (e) => {
            const escribiendo = e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
            const atajo = ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k")
                || (e.key === "/" && !escribiendo && !e.ctrlKey && !e.metaKey && !e.altKey);
            if (!atajo || document.getElementById("app").classList.contains("hidden")) return;
            e.preventDefault();
            campoBusqueda.focus();
            campoBusqueda.select();
            campoBusqueda.scrollIntoView({ block: "center", behavior: "smooth" });
        });

        async function doLogout() {
            await sb.auth.signOut();
            window.location.href = "index.html";
        }
        document.getElementById("logout-btn").addEventListener("click", doLogout);

        // ---------- Estado de la clase (class_sessions) ----------
        function fmtTime(iso) {
            return new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
        }
        function fmtDate(iso) {
            return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
        }
        function fmtDuration(startIso, endIso) {
            const mins = Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
            const h = Math.floor(mins / 60), m = mins % 60;
            return h > 0 ? `${h} h ${m} min` : `${m} min`;
        }

        async function refreshSessionStatus() {
            if (!boardOwnerId) { openSession = null; return; }
            const { data } = await sb.from("class_sessions").select("*").eq("created_by", boardOwnerId).is("ended_at", null).order("started_at", { ascending: false }).limit(1);
            openSession = (data && data[0]) || null;

            document.getElementById("session-status-open").classList.toggle("hidden", !openSession);
            document.getElementById("session-status-closed").classList.toggle("hidden", !!openSession);
            document.getElementById("closed-status-hint").textContent = isTeacher
                ? "No hace falta apretar nada: la clase se abre sola al entrar a Sesión en vivo, en cuanto llegue un alumno o mandes una posición."
                : "";

            /* La tarjeta entera solo aparece cuando tiene algo que decir: hay
               clase en curso —eso lo ve todo el mundo— o quien mira da clase y
               puede iniciar una. A un alumno fuera del horario, que es casi
               siempre, le ocupaba el primer lugar de la página para avisarle de
               que NO pasa nada, empujando hacia abajo sus tareas.

               Se esconde la TARJETA y no solo sus dos mitades: con las dos
               ocultas quedaba la caja blanca vacía con su relleno, que se lee
               como algo que no cargó. Es la misma condición que ya decide el
               botón de iniciar clase, así que no se le esconde a nadie un
               control que sí podría usar. */
            document.getElementById("session-status-card").hidden = !openSession && !isTeacher;

            if (openSession) {
                document.getElementById("open-session-title").textContent = openSession.title ? `— ${openSession.title}` : "";
                document.getElementById("open-session-time").textContent = fmtTime(openSession.started_at);
                document.getElementById("close-session-controls").classList.toggle("hidden", !isTeacher);
            } else {
                document.getElementById("closed-status-text").textContent = isTeacher
                    ? "No hay ninguna clase en curso. Inicia una para que quede registrada."
                    : "No hay ninguna clase en curso ahora mismo.";
                document.getElementById("start-session-controls").classList.toggle("hidden", !isTeacher);
            }
        }

        // ---------- Logro: récord de "Racha táctica" (puzzle_rush_scores) ----------
        // Para un alumno, este récord se compara solo dentro de su propio grupo
        // (profiles.grupo) — no debe ver ni comparar contra la racha de alumnos
        // de otro grupo. El profesor sigue viendo el récord general de toda la
        // academia, igual que en Informes. profiles!inner es necesario para
        // poder filtrar por una columna de la tabla relacionada.
        async function loadTacticsRecord() {
            const el = document.getElementById("tactics-record-text");
            const scopedToGroup = !isTeacher && profile.grupo;
            document.getElementById("tactics-record-title").textContent = scopedToGroup
                ? `Racha táctica del grupo ${profile.grupo}`
                : "Racha táctica de la clase";
            let query = sb.from("puzzle_rush_scores")
                .select("best_streak, profiles!inner(full_name, email, grupo)")
                .order("best_streak", { ascending: false })
                .limit(1);
            if (scopedToGroup) query = query.eq("profiles.grupo", profile.grupo);
            const { data, error } = await query.maybeSingle();
            if (error) { el.textContent = "encuentra la jugada correcta en 10 segundos."; return; }
            if (!data || !data.best_streak) { el.textContent = "todavía nadie tiene una racha registrada. ¡Sé el primero!"; return; }
            const name = (data.profiles && (data.profiles.full_name || data.profiles.email)) || "?";
            el.textContent = name + " lleva el récord con " + data.best_streak + " aciertos seguidos.";
        }

        // ---------- Tu progreso: los tres números y la racha de días ----------
        // Los números NO se cuentan acá. Esta página se bajaba training_progress
        // ENTERA (select * where student_id = …) y sumaba en el navegador, y eso
        // tenía el techo invisible de siempre: PostgREST corta la respuesta a
        // partir de cierta cantidad de filas y no da ningún error, así que a un
        // alumno con bastante entrenamiento encima el panel le pintaba un número
        // que ya no subía. informes_resumen_alumnos() ya trae esos tres contados
        // por la base y, siendo SECURITY INVOKER, a un alumno le devuelve
        // únicamente su propio renglón — la misma función que usa informes.html,
        // así que la cuenta tampoco queda escrita dos veces.
        async function loadEntrenoProgress() {
            const { data, error } = await sb.rpc("informes_resumen_alumnos");
            if (error) return;   // deja los guiones en vez de romper el resto del panel
            const fila = (data || []).find((f) => f.id === profile.id);
            if (!fila) return;
            document.getElementById("entreno-puzzles").textContent = String(fila.puzzles || 0);
            document.getElementById("entreno-lessons").textContent = String(fila.lecciones || 0);
            document.getElementById("entreno-coord").textContent = fila.mejor_coord || "—";
        }

        // La racha de días la cuenta la base (public.progreso_dias_y_racha, ver
        // js/logros.js): acá solo se pone el número en su lugar.
        async function loadRachaWidget(rachaP) {
            const el = document.getElementById("progreso-racha");
            const { stats, error } = await rachaP;
            if (error || !stats) { el.textContent = "—"; return; }
            el.textContent = String(stats.racha_actual || 0);
        }

        /* ---------- Lo que te toca: tareas Y exámenes ----------
           La fecha límite ya vivía en `tareas.vence_at` y en `examenes.vence_at`;
           lo que faltaba era decirla en el panel. Un alumno abría esto, no veía
           nada que hacer, y la entrega vencía sin que nada avisara — del examen
           el único aviso es el push del momento en que se lo asignan, así que
           quien no lo vio no se entera nunca.

           Ninguna de las dos cuentas se hace acá:
           - `tareas_con_avance()` es la misma función que pinta `tareas.html`
             (desde que una tarea tiene renglones con cantidad, lo pendiente NO
             es una columna: `tareas.estado` quedó sin uso);
           - `examenes_con_nota()` es la misma que pinta la lista del alumno en
             `examenes.html`.
           Dos pantallas que cuenten lo mismo por su cuenta terminan diciendo
           cosas distintas del mismo alumno. */

        /* Un examen NO es una tarea vencida, y confundirlos sería mentirle.
           `iniciar_examen()` rechaza con "Se pasó la fecha para hacer este
           examen" el que sigue en `asignado` después de su `vence_at`: ahí se
           acabó, mientras que una tarea vencida se sigue pudiendo hacer. Y un
           `congelado` solo lo reabre el profesor. Así que de los cuatro estados
           solo dos son "puedes hacer algo ahora". */
        function estadoDeExamen(e, ahora) {
            if (e.estado === "entregado") return "hecho";
            if (e.estado === "congelado") return "congelado";
            if (e.estado === "en_curso") {
                // Volver a entrar no reinicia el reloj, así que un en_curso con
                // su termina_at pasado ya no da para nada.
                return new Date(e.termina_at) > ahora ? "corriendo" : "sin_tiempo";
            }
            return new Date(e.vence_at) > ahora ? "por_hacer" : "perdido";
        }

        async function cargarPendientes(rachaP) {
            const [t, x] = await Promise.all([
                sb.rpc("tareas_con_avance", { p_alumno: profile.id, p_pendientes: true, p_limite: 50 }),
                sb.rpc("examenes_con_nota", { p_alumno: profile.id, p_limite: 50 }),
            ]);
            const tareas = (t.error ? [] : t.data) || [];
            /* Si los exámenes no llegan se siguen mostrando las tareas: quedarse
               sin franja por la mitad que falló sería perder también la que sí
               se pudo leer. */
            const examenes = (x.error ? [] : x.data) || [];

            const ahora = new Date();
            const conEstado = examenes.map((e) => ({ ...e, situacion: estadoDeExamen(e, ahora) }));
            const porHacer   = conEstado.filter((e) => e.situacion === "por_hacer")
                                        .sort((a, b) => new Date(a.vence_at) - new Date(b.vence_at));
            const corriendo  = conEstado.filter((e) => e.situacion === "corriendo");
            const perdidos   = conEstado.filter((e) => e.situacion === "perdido" || e.situacion === "sin_tiempo");
            const congelados = conEstado.filter((e) => e.situacion === "congelado");
            const vencidas   = tareas.filter((t) => t.situacion === "vencida");

            // Los que se le pasaron se cuentan como cosas que decir, no como
            // pendientes: ya no se pueden hacer, así que sumarlos al "tienes N
            // pendientes" le ofrecería algo que no va a poder abrir.
            const hacibles = tareas.length + porHacer.length + corriendo.length;
            /* Sin nada que vence, la franja NO se queda vacía: la ocupa el
               siguiente paso de quien todavía no arrancó (ver abajo). Lo que
               vence manda siempre —una fecha le gana a una sugerencia—, así que
               el primer paso solo llega hasta acá. */
            if (!hacibles && !perdidos.length && !congelados.length) return mostrarPrimerPaso(rachaP);

            /* EL ORDEN DE LAS REGLAS IMPORTA Y ESTÁ ESCRITO, como el del informe
               a la casa: el texto se queda con UNA cosa, la que pide actuar
               antes. Primero lo que corre ahora mismo, después lo que ya se
               perdió, y al final lo que viene. */
            let msg, destino = "tareas.html", cta = "Ver tus tareas →";
            /* El icono acompaña a la LÍNEA, no a la franja: si el texto habla
               de un examen, el 📋 de la tarjeta Tareas estaría señalando otra
               cosa. Es decorativo (`aria-hidden`), así que lo que dice va
               escrito igual. */
            let icono = "📋";
            const urgente = !!(corriendo.length || perdidos.length || vencidas.length || congelados.length);

            if (corriendo.length) {
                const e = corriendo[0];
                /* NO se dicen los minutos que quedan. El reloj del examen sale
                   de la hora del SERVIDOR (`termina_at` contra `now()`), y acá
                   solo está la del navegador: un número calculado con el reloj
                   de la computadora podría decirle que le quedan diez minutos
                   cuando ya se le acabaron. Que el número lo dé `examen.html`,
                   que lo pide a la base. Decidir "corre o no corre" con el reloj
                   local sí es tolerable: en el peor caso lo manda a la pantalla
                   del examen, que le dice la verdad. */
                msg = `El examen «${e.titulo}» lo tienes a medias y el reloj corre. Entra a terminarlo.`;
                destino = `examen.html?id=${encodeURIComponent(e.id)}`;   // directo a rendirlo, como el aviso al celular
                cta = "Seguir el examen →"; icono = "⏰";
            } else if (perdidos.length) {
                const e = perdidos[0];
                // Acá NO se dice "todavía puedes": no puede, y prometérselo es
                // peor que no decir nada.
                msg = perdidos.length === 1
                    ? `Se te pasó la fecha del examen «${e.titulo}» y ya no se puede rendir. Habla con tu profe.`
                    : `Se te pasó la fecha de ${perdidos.length} exámenes y ya no se pueden rendir. Habla con tu profe.`;
                destino = "examenes.html"; cta = "Ver tus exámenes →"; icono = "⏰";
            } else if (vencidas.length) {
                // Una tarea vencida sí se sigue pudiendo hacer, y se dice.
                msg = vencidas.length === 1
                    ? `Se te pasó la fecha de «${vencidas[0].titulo}». Todavía puedes hacerla.`
                    : `Se te pasó la fecha de ${vencidas.length} de ellas. Todavía puedes hacerlas.`;
                icono = "⏰";
            } else if (congelados.length) {
                const e = congelados[0];
                msg = `El examen «${e.titulo}» quedó congelado a la mitad. Tu profe tiene que volver a abrirlo.`;
                destino = "examenes.html"; cta = "Ver tus exámenes →"; icono = "📝";
            } else {
                /* Nada urgente: se nombra lo que vence antes, sea tarea o
                   examen. Un examen tiene reloj y una sola oportunidad, así que
                   cuando los dos caen el mismo día manda el examen. */
                const t0 = tareas[0], e0 = porHacer[0];
                const antesElExamen = e0 && (!t0 || new Date(e0.vence_at) <= new Date(t0.vence_at));
                if (antesElExamen) {
                    msg = `El examen «${e0.titulo}» vence ${venceEnPalabras(e0.vence_at)}`
                        + ` · ${e0.preguntas} preguntas en ${e0.minutos} minutos.`;
                    destino = `examen.html?id=${encodeURIComponent(e0.id)}`;
                    cta = "Empezar el examen →"; icono = "📝";
                } else {
                    // Cuánto lleva de la más próxima: con renglones, "2 de 5"
                    // dice mucho más que el título solo.
                    const avance = t0.renglones > 1 ? ` Llevas ${t0.cumplidos} de ${t0.renglones}.` : "";
                    msg = `La más próxima es «${t0.titulo}», vence ${venceEnPalabras(t0.vence_at)}.${avance}`;
                }
            }

            pintarFranja({
                titulo: tituloPendientes(tareas.length, porHacer.length + corriendo.length),
                texto: msg, destino, cta, icono, urgente,
            });
        }

        /* La franja se pinta en UN solo lugar porque la usan dos cosas: lo que
           vence (arriba) y el primer paso de quien todavía no tiene nada (abajo).
           Con dos pintados, el que se olvidara de quitar el rojo dejaría una
           sugerencia con pinta de entrega vencida — y no daría ningún error. */
        function pintarFranja({ titulo: tit, texto: msg, destino, cta, icono, urgente }) {
            const caja = document.getElementById("pendientes-aviso");
            const titulo = document.getElementById("pendientes-aviso-titulo");
            const texto = document.getElementById("pendientes-aviso-texto");

            /* Hay un caso en que la franja NO lleva a ninguna parte: a un
               profesor sin alumnos no hay página que ofrecerle —asignárselos es
               cosa de quien administra—. Se le quita el href de verdad y no se
               deja uno que no haga nada: un <a> sin href no recibe el foco ni
               se anuncia como enlace, y un enlace que no lleva a ningún lado es
               peor que ninguno. */
            if (destino) caja.href = destino;
            else caja.removeAttribute("href");
            caja.className = "mb-6 rounded-2xl shadow-md p-5 md:p-6 flex items-center gap-4 flex-wrap hover:shadow-lg transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
                + (urgente
                    ? "bg-red-50 dark:bg-red-950/40 ring-2 ring-red-500"
                    : "bg-white dark:bg-brand-900");
            document.getElementById("pendientes-aviso-emoji").textContent = urgente && icono === "📋" ? "⏰" : icono;
            titulo.className = "font-serif text-lg font-bold " + (urgente ? "text-red-700 dark:text-red-300" : "text-brand-800 dark:text-white");
            texto.className = "text-sm " + (urgente ? "text-red-700 dark:text-red-300" : "text-brand-500 dark:text-brand-300");
            const cajaCta = document.getElementById("pendientes-aviso-cta");
            cajaCta.textContent = cta || "";
            cajaCta.hidden = !cta;
            cajaCta.className = "text-sm font-semibold whitespace-nowrap "
                + (urgente ? "text-red-700 dark:text-red-300" : "text-accent-700 dark:text-accent-400");

            titulo.textContent = tit;
            texto.textContent = msg;
            caja.hidden = false;
        }

        /* ---------- Por dónde empezar: el siguiente paso ----------
           Un alumno recién invitado abre esto, no tiene ninguna tarea ni ningún
           examen —nadie se los puso todavía— y se encuentra un directorio de
           veintitantos lugares sin ninguna pista de por cuál empezar. En los
           datos se ve exactamente así: de los que entraron alguna vez, buena
           parte no ha resuelto ni un ejercicio.

           No es UN primer paso, es EL SIGUIENTE, y son tres peldaños que se
           calculan de lo que ya hay. El panel pinta el primero que no esté
           cumplido y se apaga solo: al resolver el primer ejercicio, el peldaño
           deja de cumplirse. No hay nada que marcar ni ningún "ya lo vi" en
           localStorage que se pueda quedar desincronizado.

           Y NO se pinta "no tienes nada que hacer" cuando ya arrancó: un cartel
           que se repite deja de leerse, la misma lección del aviso de instalar
           la app. */
        async function mostrarPrimerPaso(rachaP) {
            let stats;
            try {
                const r = await rachaP;
                if (!r || r.error) return;   // no se pudo leer: callar es mejor que adivinar
                stats = r.stats || {};
            } catch (e) { return; }

            /* El diagnóstico TAMBIÉN es una fila de training_progress, así que
               "no ha hecho un solo ejercicio" no es `total_ejercicios === 0`:
               hay que descontarlo. Sin eso, a quien acaba de rendir el
               diagnóstico el panel lo daría por arrancado y no le diría nunca
               qué hacer con el resultado — que es justo el caso que más
               abunda. */
            const porActividad = stats.por_actividad || {};
            const ejercicios = Object.keys(porActividad)
                .filter((a) => a !== "diagnostico")
                .reduce((n, a) => n + (porActividad[a] || 0), 0);
            if (ejercicios > 0) return;   // ya arrancó: acá no hay nada que guiar

            const { data, error } = await sb.rpc("informes_diagnosticos_alumnos");
            if (error) return;
            // SECURITY INVOKER: a un alumno la RLS le devuelve solo su renglón,
            // pero se busca el suyo igual — es la misma precaución que en
            // loadEntrenoProgress().
            const mio = (data || []).find((f) => f.student_id === profile.id) || null;

            // 1. Ya lo rindió: lo que falta es qué hacer con el resultado.
            if (mio && mio.detalle) {
                const paso = await areaParaEmpezar(mio.detalle);
                if (paso) {
                    pintarFranja({
                        titulo: "Por dónde empezar",
                        texto: `Tu diagnóstico señala un hueco en ${paso.area.nombre.toLowerCase()}`
                             + ` (${paso.area.porcentaje}%). Empieza por ahí.`,
                        // El botón dice A DÓNDE VA y no "Ir a X": con los
                        // nombres del plan puestos ("Ejercicios de final de
                        // peones") el verbo delante no se lee.
                        destino: paso.href, cta: `${paso.label} →`,
                        icono: paso.emoji, urgente: false,
                    });
                } else {
                    // Diagnóstico sin ningún hueco marcado: no se le inventa uno.
                    pintarFranja({
                        titulo: "Por dónde empezar",
                        texto: "Ya sabes en qué nivel estás. Lo que falta es entrenar: escoge lo que quieras y empieza.",
                        destino: "entreno/index.html", cta: "Ir a Entrenamiento →",
                        icono: "🎯", urgente: false,
                    });
                }
                return;
            }

            // 2. Lo empezó y lo dejó. NO se le promete que se retoma donde iba:
            //    una prueba de una versión anterior se descarta a propósito (ver
            //    VERSION en entreno/diagnostico.html), así que prometerlo sería
            //    mentir justo a quien vuelve confiando en eso.
            if (mio && mio.a_medias_pregunta) {
                pintarFranja({
                    titulo: "Tienes el diagnóstico a medias",
                    texto: `Lo dejaste en la pregunta ${mio.a_medias_pregunta}. Terminarlo es lo que le dice a tu profe qué ponerte.`,
                    destino: "entreno/diagnostico.html", cta: "Seguir el diagnóstico →",
                    icono: "🧭", urgente: false,
                });
                return;
            }

            // 3. No lo empezó nunca: es lo primero que conviene hacer.
            pintarFranja({
                titulo: "Empieza por acá",
                texto: "El diagnóstico dice en qué estás bien y en qué no, y con eso tu profe sabe qué ponerte. No hay que estudiar nada antes.",
                destino: "entreno/diagnostico.html", cta: "Hacer el diagnóstico →",
                icono: "🧭", urgente: false,
            });
        }

        /* Qué área se le ofrece, y a dónde se le manda.

           Las dos cosas salen de donde ya viven y no se escriben otra vez: las
           áreas flojas las calcula `PlanEntrenamiento.resumir()` —la misma que
           pinta Informes y el resultado del diagnóstico— y a dónde va cada área
           está en su propio `recursos`, que ya estaba escrito y hasta ahora no
           lo leía el panel.

           Dos decisiones que no son de estilo:

           - EL DESTINO TIENE QUE SER UNA PÁGINA CUYO TRABAJO CUENTE, o sea una
             que ofrezca la meta `cantidad` en el catálogo de Tareas — que es lo
             mismo que decir "escribe en training_progress". Cinco de las nueve
             áreas tienen como primer recurso la PORTADA de un curso, que es un
             temario: mandarlo ahí lo deja leyendo un índice, y mañana el panel
             le diría exactamente lo mismo porque el peldaño no se apagaría
             nunca. Eso no da ningún error y no lo ve nadie.
           - POR ESO EL TEXTO NO DICE "LO MÁS FLOJO". Se ofrece la más floja de
             las que tienen dónde practicar, que no siempre es la peor de todas;
             "señala un hueco en X" es cierto para cualquiera por debajo del
             60%, y el superlativo sería mentira. */
        async function areaParaEmpezar(detalle) {
            try {
                await Promise.all([
                    traerScript("js/plan-entrenamiento.js"),
                    traerScript("js/material-plataforma.js"),
                ]);
            } catch (e) { return null; }
            const PE = window.PlanEntrenamiento, MP = window.MaterialPlataforma;
            if (!PE || !MP) return null;

            let resumen;
            try { resumen = PE.resumir(detalle || {}); } catch (e) { return null; }
            const flojas = (resumen.porArea || [])
                .filter((a) => a.porcentaje < 60)
                .sort((a, b) => a.porcentaje - b.porcentaje);

            for (const area of flojas) {
                const ficha = PE.AREA_POR_ID[area.id];
                if (!ficha) continue;
                for (const r of ficha.recursos || []) {
                    /* Se compara la PÁGINA, no la dirección entera: los recursos
                       del plan llevan su recorte puesto
                       (`entreno/temas.html?tema=pin`) y el catálogo de Tareas
                       guarda la página pelada. Comparando la dirección completa
                       no coincidiría ni uno solo y el paso caería siempre al
                       genérico, sin que nada fallara. */
                    const pagina = r.href.split("?")[0];
                    const h = (MP.HERRAMIENTAS || []).find(
                        (t) => t.href === pagina && (t.metas || []).includes("cantidad"));
                    /* Y se manda la dirección CON el recorte: es lo que separa
                       "haz ejercicios de clavada" de "ahí tienes ochenta temas,
                       busca". La misma decisión que el enlace de una tarea. */
                    if (h) return { area, href: r.href, label: r.texto, emoji: ficha.emoji };
                }
            }
            return null;
        }

        /* Los dos archivos de arriba se bajan CUANDO hacen falta y no en cada
           carga del panel: son 39 KB que solo usa quien ya tiene un diagnóstico
           rendido, y por acá entra todo el mundo —incluidos los que todavía no
           lo hicieron, que son justamente los que más van a ver esta franja—.
           Mismo criterio que el libro de aperturas del bot. */
        const scriptsPedidos = {};
        function traerScript(src) {
            if (!scriptsPedidos[src]) {
                scriptsPedidos[src] = new Promise((listo, falla) => {
                    const s = document.createElement("script");
                    s.src = src;
                    s.onload = listo;
                    s.onerror = () => falla(new Error("No se pudo cargar " + src));
                    document.head.appendChild(s);
                });
            }
            return scriptsPedidos[src];
        }

        /* "Tienes 3 tareas y 1 examen pendientes". Con una sola clase de cosa se
           dice solo esa: nombrar las dos siempre obligaría a escribir "y 0
           exámenes", que es ruido. */
        function tituloPendientes(nTareas, nExamenes) {
            const trozo = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
            if (nTareas && nExamenes) {
                return `Tienes ${trozo(nTareas, "tarea", "tareas")} y ${trozo(nExamenes, "examen", "exámenes")} pendientes`;
            }
            if (nExamenes) return `Tienes ${trozo(nExamenes, "examen pendiente", "exámenes pendientes")}`;
            if (nTareas)  return `Tienes ${trozo(nTareas, "tarea pendiente", "tareas pendientes")}`;
            // Sin nada que hacer pero con algo que decir (se le pasó uno, o le
            // quedó congelado): el título no puede prometer pendientes.
            return "Hay algo que tienes que saber";
        }

        // "vence hoy" / "vence mañana" se entienden de un vistazo; una fecha
        // hay que compararla con el almanaque. Se cuenta por días de calendario
        // y no por horas: una tarea de mañana a las 8 a. m. vence mañana,
        // aunque falten menos de 24 horas.
        function venceEnPalabras(iso) {
            const dia = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
            const dias = Math.round((dia(new Date(iso)) - dia(new Date())) / 86400000);
            if (dias <= 0) return "hoy";
            if (dias === 1) return "mañana";
            if (dias < 7) return `en ${dias} días`;
            return "el " + fmtDate(iso);
        }

        // ---------- Lo que te toca: continúa donde ibas ----------
        // El curso a medias cuya última lección marcada es la más reciente. Los
        // datos ya los cuenta informes_cursos_alumnos() (un renglón por alumno y
        // curso empezado, con el total, lo hecho y el último tema): acá solo se
        // elige cuál mostrar.
        async function cargarSeguirCurso() {
            const { data, error } = await sb.rpc("informes_cursos_alumnos");
            if (error || !data || !data.length) return;
            const mios = data.filter((c) => (!c.student_id || c.student_id === profile.id) && c.hechos > 0 && c.hechos < c.total);
            if (!mios.length) return;   // sin ningún curso a medias no hay nada que retomar
            mios.sort((a, b) => new Date(b.ultima_fecha || 0) - new Date(a.ultima_fecha || 0));
            const c = mios[0];

            document.getElementById("seguir-curso").href = `cursos/academia/${c.slug}.html`;
            document.getElementById("seguir-curso-texto").textContent =
                `${c.titulo} — ${c.hechos} de ${c.total} temas`
                + (c.ultimo_titulo ? `. Lo último: ${c.ultimo_titulo}.` : ".");
            const pct = Math.round((c.hechos / c.total) * 100);
            document.getElementById("seguir-curso-barra").style.width = pct + "%";
            // El ancho solo se VE: el lector de pantalla lee el valor.
            const progreso = document.getElementById("seguir-curso-progreso");
            progreso.setAttribute("aria-valuenow", String(pct));
            progreso.setAttribute("aria-valuetext", `${pct} % (${c.hechos} de ${c.total} temas)`);
            document.getElementById("seguir-curso").hidden = false;
        }

        // ---------- Tu semana (equipo docente) ----------
        // Los cinco números los cuenta public.panel_profesor(), que es
        // SECURITY INVOKER: quién es alumno de quién lo decide la RLS y no hay
        // ni un filtro de profesor escrito acá ni allá. Contar "alumnos
        // distintos que entrenaron" desde el navegador pediría bajarse
        // training_progress y cruzar el techo de PostgREST en silencio.
        async function cargarPanelProfe() {
            /* Mirando a otra persona («Ver como», js/modo-vista.js), los de
               ella: panel_profesor_de() pregunta antes si quien llama la
               supervisa. */
            const { data, error } = profile._persona
                ? await sb.rpc("panel_profesor_de", { p_profesor: profile._persona.id })
                : await sb.rpc("panel_profesor");
            const fila = (data && data[0]) || null;
            if (error || !fila) return;   // deja los guiones puestos

            const alumnos = fila.alumnos || 0;
            const inactivos = Math.max(0, alumnos - (fila.activos_7d || 0));
            document.getElementById("profe-alumnos").textContent = String(alumnos);
            document.getElementById("profe-tareas").textContent = String(fila.tareas_pendientes || 0);

            // Los dos números que piden hacer algo se pintan en rojo solo cuando
            // no son cero: en rojo permanente se dejan de ver.
            const inact = document.getElementById("profe-inactivos");
            inact.textContent = String(inactivos);
            inact.className = "text-2xl font-bold " + (inactivos > 0 ? "text-red-600 dark:text-red-400" : "text-brand-800 dark:text-white");
            const venc = document.getElementById("profe-vencidas");
            venc.textContent = String(fila.tareas_vencidas || 0);
            venc.className = "text-2xl font-bold " + (fila.tareas_vencidas > 0 ? "text-red-600 dark:text-red-400" : "text-brand-800 dark:text-white");

            const clases = fila.clases_30d || 0;
            const lleva = profile._persona ? "Lleva" : "Llevas";
            document.getElementById("profe-clases").textContent = clases === 1
                ? `${lleva} 1 clase dada en los últimos 30 días.`
                : `${lleva} ${clases} clases dadas en los últimos 30 días.`;

            // El primer paso le habla al profesor («asigna tu primera tarea»):
            // a quien lo está revisando no le toca hacerlo.
            if (!profile._persona) primerPasoDelProfesor(fila);
        }

        /* ---------- Por dónde empezar, del lado del que da clase ----------

           Es el mismo problema que el del alumno y la misma solución, con los
           peldaños del otro lado del escritorio: un entrenador nuevo abre esto,
           ve cuatro números en cero y un directorio de accesos, y no hay nada
           que le diga cuál es el siguiente paso. En los datos se ve igual — el
           profesor con más alumnos lleva decenas de entradas y ni una tarea, ni
           una clase, ni un plan.

           Son peldaños que se calculan de lo que ya hay y se apagan solos: al
           mandar la primera tarea, ese peldaño deja de cumplirse. No hay nada
           que marcar ni ningún "ya lo vi" en localStorage que se pueda quedar
           desincronizado.

           El ORDEN es el del trabajo, y por eso se dice UNA sola cosa —la que
           toca antes—: sin alumnos no hay nada que hacer; sin diagnóstico no
           hay plan que armar; un plan sin compartir no lo ve ni el alumno ni su
           casa, o sea que cuenta como que no existe; y recién entonces la
           tarea y la clase. Con todo al día no se dice nada: un cartel que se
           repite deja de leerse, la misma lección del aviso de instalar la app.

           Va en la MISMA franja que lo del alumno (#pendientes-aviso) y no en
           una nueva: contesta la misma pregunta —"¿qué hago ahora?"— y dos
           franjas peleando por el primer lugar es el problema que este panel ya
           tuvo con "Estado de la clase". */
        function primerPasoDelProfesor(fila) {
            const alumnos = fila.alumnos || 0;
            const conDiagnostico = fila.con_diagnostico || 0;
            const conPlan = fila.con_plan || 0;

            // 1. Sin alumnos asignados no funciona NADA de lo suyo, y hoy eso
            //    se ve como cuatro ceros sin explicación: Informes vacío,
            //    Tareas sin a quién mandarle y un subgrupo que no se puede
            //    llenar (su insert exige soy_profesor_de()). Parece roto y no
            //    lo está.
            if (!alumnos) {
                const suyo = profile.is_admin;
                pintarFranja({
                    titulo: "Todavía no tienes alumnos",
                    texto: "Mientras no te asignen ninguno, Informes, Tareas y los subgrupos te van a salir vacíos — no es que estén rotos."
                         + (suyo ? " Se asignan en el panel de Administración."
                                 : " Quien administra la Academia te los asigna desde el panel de Administración."),
                    // A un profesor no se le ofrece una página que la base le va
                    // a negar: asignar alumnos es de quien administra.
                    destino: suyo ? "admin.html" : null,
                    cta: suyo ? "Asignar alumnos →" : null,
                    icono: "👥", urgente: false,
                });
                return;
            }

            // 2. Sin diagnóstico no hay plan que armar, ni qué ponerles, ni qué
            //    contarle a la casa: es el primer cuello de verdad.
            if (!conDiagnostico) {
                pintarFranja({
                    titulo: "Empieza por el diagnóstico",
                    texto: `Ninguno de tus ${alumnos} alumnos lo ha hecho todavía. De ahí sale solo el plan de entrenamiento de cada uno`
                         + " — sin eso no hay qué ponerles ni qué contarle a la casa.",
                    destino: "tareas.html", cta: "Mandarlo como tarea →",
                    icono: "🧭", urgente: false,
                });
                return;
            }

            // 3. El plan se genera solo desde el diagnóstico, pero sin
            //    compartir no lo ve ni el alumno ni su casa. Estuvo en CERO
            //    desde que la tabla existe, y nada avisaba.
            if (conPlan < conDiagnostico) {
                const faltan = conDiagnostico - conPlan;
                pintarFranja({
                    titulo: "Hay planes sin compartir",
                    texto: `${conPlan} de los ${conDiagnostico} que hicieron el diagnóstico tienen su plan compartido.`
                         + ` A ${faltan === 1 ? "el otro no lo ve" : `los otros ${faltan} no los ven`} ni ellos ni su casa —`
                         + " el plan sale solo del diagnóstico y se comparte en Informes, todos de una vez.",
                    destino: "informes.html", cta: "Compartir los planes →",
                    icono: "🧭", urgente: false,
                });
                return;
            }

            // 4. Se mira `tareas_puestas` y no las pendientes: con todas hechas
            //    las pendientes son cero igual que si no hubiera puesto
            //    ninguna, y son dos situaciones muy distintas.
            if (!(fila.tareas_puestas || 0)) {
                pintarFranja({
                    titulo: "Ponles la primera tarea",
                    texto: "Una tarea se llena sola con lo que entrenan —«20 ejercicios de ataque doble» va subiendo sin que nadie marque nada—"
                         + " y al asignarla le llega el aviso al celular.",
                    destino: "tareas.html", cta: "Armar una tarea →",
                    icono: "📋", urgente: false,
                });
                return;
            }

            // 5. `clases_dadas` es desde siempre, no de los últimos 30 días:
            //    ese número no distingue "nunca" de "este mes no".
            if (!(fila.clases_dadas || 0)) {
                pintarFranja({
                    titulo: "Todavía no has dado ninguna clase",
                    texto: "La clase en vivo se abre sola en cuanto entre un alumno o mandes una posición al tablero, y desde ahí queda registrada la asistencia y el tiempo de cada uno.",
                    destino: "sesion.html", cta: "Abrir el tablero de la clase →",
                    icono: "🎬", urgente: false,
                });
                return;
            }

            // 6. Lo que queda es el goteo: los que faltan por diagnosticar. Va
            //    al final porque ya está todo lo demás andando.
            if (conDiagnostico < alumnos) {
                const faltan = alumnos - conDiagnostico;
                pintarFranja({
                    titulo: "Faltan diagnósticos",
                    texto: `Los ${conDiagnostico} que lo hicieron ya tienen su plan.`
                         + ` ${faltan === 1 ? "Falta 1 alumno" : `Faltan ${faltan} alumnos`} por hacerlo, y sin diagnóstico no hay plan que armarles.`,
                    destino: "tareas.html", cta: "Mandarlo como tarea →",
                    icono: "🧭", urgente: false,
                });
            }
            // Todo al día: no se dice nada.
        }

        // ---------- Registro de clases ----------
        // Con 100 clases, bajarlas todas y pintarlas de corrido no sirve de
        // nada: no se encuentra ninguna. Así que el filtro y el corte los hace
        // la BASE — `.gte()` por periodo, `.ilike()` por texto y `.range()` por
        // página— y acá solo se pinta. La cuenta total viene con
        // `count: "exact"`, así que "Mostrando 20 de 143" dice la verdad
        // aunque solo hayan llegado 20 filas.
        const SESIONES_POR_PAGINA = 20;
        let sesionesCargadas = [];
        let sesionesTotal = 0;
        let sesionesBusqueda = "";
        let sesionesPeriodo = 90;           // días; 0 = todas
        let sesionesPeticion = 0;           // descarta respuestas que llegan tarde
        // Qué meses dejó abiertos o cerrados quien mira, para que repintar no
        // los vuelva a cerrar todos. Lo que no está acá toma el valor por
        // omisión: abierto el más reciente, cerrados los de atrás.
        const sesionesMeses = new Map();

        function claveMes(iso) {
            const d = new Date(iso);
            return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        }
        function nombreMes(iso) {
            const t = new Date(iso).toLocaleDateString("es-CR", { month: "long", year: "numeric" });
            return t.charAt(0).toUpperCase() + t.slice(1);
        }
        function fmtMinutos(mins) {
            const h = Math.floor(mins / 60), m = mins % 60;
            if (!h) return `${m} min`;
            return m ? `${h} h ${m} min` : `${h} h`;   // "6 h", no "6 h 0 min"
        }

        // PostgREST arma el filtro `or=(...)` con comas y paréntesis, así que un
        // texto que los traiga rompe la consulta entera. Se limpian (y se corta
        // el largo) antes de mandarlo: lo que se busca es un título, no una
        // expresión.
        function limpiarBusqueda(t) {
            return t.replace(/[,()%*\\"']/g, " ").trim().slice(0, 60);
        }

        function consultaSesiones() {
            let q = sb.from("class_sessions").select("*", { count: "exact" }).eq("created_by", boardOwnerId);
            if (sesionesPeriodo) {
                q = q.gte("started_at", new Date(Date.now() - sesionesPeriodo * 86400000).toISOString());
            }
            const texto = limpiarBusqueda(sesionesBusqueda);
            if (texto) q = q.or(`title.ilike.%${texto}%,notes.ilike.%${texto}%`);
            return q.order("started_at", { ascending: false });
        }

        function filaDeSesion(s) {
            const tr = document.createElement("tr");
            tr.className = "border-b border-brand-50 dark:border-brand-800/60 last:border-0";
            const tdDate = document.createElement("td"); tdDate.className = "py-2 pr-4 whitespace-nowrap"; tdDate.textContent = fmtDate(s.started_at);
            const tdStart = document.createElement("td"); tdStart.className = "py-2 pr-4 whitespace-nowrap"; tdStart.textContent = fmtTime(s.started_at);
            const tdEnd = document.createElement("td"); tdEnd.className = "py-2 pr-4 whitespace-nowrap";
            tdEnd.textContent = s.ended_at ? fmtTime(s.ended_at) : "En curso";
            const tdDur = document.createElement("td"); tdDur.className = "py-2 pr-4 whitespace-nowrap";
            tdDur.textContent = s.ended_at ? fmtDuration(s.started_at, s.ended_at) : "—";
            const tdNotes = document.createElement("td"); tdNotes.className = "py-2 pr-4 text-brand-500 dark:text-brand-300";
            /* Una clase presencial se registra desde asistencia.html y no
               abriendo el tablero, así que en este registro aparece sin que el
               profesor se acuerde de haberla abierto. Va DICHO —y escrito, no
               con un color—: si no, se lee como una clase fantasma. */
            if (s.modalidad === "presencial") {
                const etiqueta = document.createElement("span");
                etiqueta.className = "inline-block mr-2 text-xs font-semibold rounded-lg px-2 py-0.5 bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-300";
                etiqueta.textContent = "Presencial";
                tdNotes.appendChild(etiqueta);
            }
            tdNotes.appendChild(document.createTextNode([s.title, s.notes].filter(Boolean).join(" · ") || "—"));
            const tdActions = document.createElement("td"); tdActions.className = "py-2 text-right";
            if (isTeacher) {
                const delBtn = document.createElement("button");
                delBtn.type = "button";
                delBtn.className = "text-xs text-red-600 dark:text-red-400 hover:underline";
                delBtn.textContent = "Eliminar";
                delBtn.addEventListener("click", async () => {
                    if (!(await Avisos.confirmar("Esta acción no se puede deshacer.", { titulo: "¿Eliminar esta clase del registro?", aceptar: "Eliminar", peligro: true }))) return;
                    const { error: delError } = await sb.from("class_sessions").delete().eq("id", s.id);
                    if (delError) { Avisos.avisar("No se pudo eliminar: " + delError.message, { tipo: "error" }); return; }
                    refreshSessionStatus();
                    cargarSesiones();
                });
                tdActions.appendChild(delBtn);
            }
            tr.append(tdDate, tdStart, tdEnd, tdDur, tdNotes, tdActions);
            return tr;
        }

        function avisoSesiones(texto) {
            const caja = document.getElementById("sessions-log");
            caja.innerHTML = "";
            const p = document.createElement("p");
            p.className = "py-4 text-sm text-brand-450 dark:text-brand-350";
            p.textContent = texto;
            caja.appendChild(p);
        }

        // Se repinta la lista entera desde lo que se lleva cargado, en vez de ir
        // pegando filas: así un mes partido entre dos páginas queda en un solo
        // bloque y su encabezado cuenta bien. Qué mes está abierto vive en
        // `sesionesMeses`, o al repintar se cerrarían todos.
        function pintarSesiones() {
            const caja = document.getElementById("sessions-log");
            caja.innerHTML = "";
            const meses = new Map();
            sesionesCargadas.forEach((s) => {
                const k = claveMes(s.started_at);
                if (!meses.has(k)) meses.set(k, []);
                meses.get(k).push(s);
            });
            let primero = true;
            meses.forEach((filas, k) => {
                const det = document.createElement("details");
                det.className = "border border-brand-100 dark:border-brand-800 rounded-xl overflow-hidden";
                // El mes más reciente abierto y los de atrás cerrados: eso es
                // lo que hace que 100 clases se puedan mirar. Salvo que quien
                // mira haya dicho otra cosa.
                det.open = sesionesMeses.has(k) ? sesionesMeses.get(k) : primero;
                det.addEventListener("toggle", () => sesionesMeses.set(k, det.open));
                primero = false;

                const sum = document.createElement("summary");
                sum.className = "cursor-pointer select-none px-4 py-3 bg-brand-50 dark:bg-brand-800/50 text-sm font-semibold text-brand-800 dark:text-white flex items-center justify-between gap-3";
                const nombre = document.createElement("span");
                nombre.textContent = nombreMes(filas[0].started_at);
                const cuenta = document.createElement("span");
                const minutos = filas.reduce((a, s) => a + (s.ended_at
                    ? Math.max(0, Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000)) : 0), 0);
                cuenta.className = "text-xs font-normal text-brand-450 dark:text-brand-350";
                cuenta.textContent = filas.length + (filas.length === 1 ? " clase" : " clases")
                    + (minutos ? " · " + fmtMinutos(minutos) : "");
                sum.append(nombre, cuenta);

                const envoltura = document.createElement("div");
                envoltura.className = "overflow-x-auto px-4 pb-3";
                const tabla = document.createElement("table");
                tabla.className = "w-full text-sm";
                tabla.innerHTML = '<caption class="sr-only">Clases de ' + nombreMes(filas[0].started_at) + '</caption>'
                    + '<thead><tr class="text-left text-brand-450 dark:text-brand-350 uppercase text-xs border-b border-brand-100 dark:border-brand-800">'
                    + '<th scope="col" class="py-2 pr-4 font-semibold">Fecha</th>'
                    + '<th scope="col" class="py-2 pr-4 font-semibold">Inicio</th>'
                    + '<th scope="col" class="py-2 pr-4 font-semibold">Cierre</th>'
                    + '<th scope="col" class="py-2 pr-4 font-semibold">Duración</th>'
                    + '<th scope="col" class="py-2 pr-4 font-semibold">Notas</th>'
                    + '<th scope="col" class="py-2 font-semibold"><span class="sr-only">Acciones</span></th>'
                    + '</tr></thead>';
                const tbody = document.createElement("tbody");
                filas.forEach((s) => tbody.appendChild(filaDeSesion(s)));
                tabla.appendChild(tbody);
                envoltura.appendChild(tabla);
                det.append(sum, envoltura);
                caja.appendChild(det);
            });
        }

        function pintarResumenSesiones(error) {
            const resumen = document.getElementById("sessions-log-summary");
            const masBtn = document.getElementById("sessions-more");
            if (error) {
                // Se DICE que falló, en vez de dejar el hueco de "no hay clases":
                // un registro vacío por un error de red se lee como un registro
                // vacío de verdad.
                resumen.textContent = "No se pudo cargar el registro: " + error;
                masBtn.hidden = true;
                return;
            }
            const hayFiltro = !!limpiarBusqueda(sesionesBusqueda) || sesionesPeriodo !== 0;
            resumen.textContent = sesionesTotal === 0
                ? (hayFiltro ? "Ninguna clase coincide con el filtro." : "Todavía no hay clases registradas.")
                : "Mostrando " + sesionesCargadas.length + " de " + sesionesTotal
                  + (sesionesTotal === 1 ? " clase" : " clases") + (hayFiltro ? " en el filtro elegido." : ".");
            masBtn.hidden = sesionesCargadas.length >= sesionesTotal;
        }

        async function cargarSesiones({ mas = false } = {}) {
            const masBtn = document.getElementById("sessions-more");
            if (!boardOwnerId) {
                sesionesCargadas = []; sesionesTotal = 0;
                avisoSesiones("Todavía no hay clases registradas.");
                masBtn.hidden = true;
                document.getElementById("sessions-log-summary").textContent = "Todavía no hay clases registradas.";
                return;
            }
            const marca = ++sesionesPeticion;
            const desde = mas ? sesionesCargadas.length : 0;
            masBtn.disabled = true;
            const { data, error, count } = await consultaSesiones().range(desde, desde + SESIONES_POR_PAGINA - 1);
            masBtn.disabled = false;
            // Llegó tarde: mientras tanto se escribió otra búsqueda. Pintarla
            // ahora dejaría en pantalla el resultado de un filtro que ya no está.
            if (marca !== sesionesPeticion) return;
            if (error) {
                sesionesCargadas = []; sesionesTotal = 0;
                avisoSesiones("No se pudo cargar el registro de clases.");
                pintarResumenSesiones(error.message);
                return;
            }
            sesionesCargadas = mas ? sesionesCargadas.concat(data || []) : (data || []);
            sesionesTotal = typeof count === "number" ? count : sesionesCargadas.length;
            if (!sesionesCargadas.length) {
                avisoSesiones(limpiarBusqueda(sesionesBusqueda) || sesionesPeriodo
                    ? "Ninguna clase coincide con el filtro. Prueba con otro periodo."
                    : "Todavía no hay clases registradas.");
            } else {
                pintarSesiones();
            }
            pintarResumenSesiones(null);
        }

        // Los filtros: el texto con un respiro de 300 ms para no pedirle a la
        // base una consulta por tecla.
        let sesionesTimer = null;
        document.getElementById("sessions-search").addEventListener("input", (e) => {
            sesionesBusqueda = e.target.value;
            clearTimeout(sesionesTimer);
            sesionesTimer = setTimeout(() => cargarSesiones(), 300);
        });
        document.getElementById("sessions-period").addEventListener("change", (e) => {
            sesionesPeriodo = Number(e.target.value) || 0;
            cargarSesiones();
        });
        document.getElementById("sessions-more").addEventListener("click", () => cargarSesiones({ mas: true }));


        document.getElementById("start-session-btn").addEventListener("click", async () => {
            const btn = document.getElementById("start-session-btn");
            const title = document.getElementById("new-session-title").value.trim();
            btn.disabled = true;
            const { error } = await sb.from("class_sessions").insert({ title: title || null, created_by: profile.id });
            btn.disabled = false;
            if (error) { Avisos.avisar("No se pudo iniciar la clase: " + error.message, { tipo: "error" }); return; }
            document.getElementById("new-session-title").value = "";
            await refreshSessionStatus();
            await cargarSesiones();
        });

        document.getElementById("close-session-btn").addEventListener("click", async () => {
            if (!openSession) return;
            const btn = document.getElementById("close-session-btn");
            const notes = document.getElementById("close-session-notes").value.trim();
            btn.disabled = true;
            const { error } = await sb.from("class_sessions").update({ ended_at: new Date().toISOString(), notes: notes || null }).eq("id", openSession.id);
            btn.disabled = false;
            if (error) { Avisos.avisar("No se pudo cerrar la clase: " + error.message, { tipo: "error" }); return; }
            document.getElementById("close-session-notes").value = "";
            await refreshSessionStatus();
            await cargarSesiones();
        });

        function subscribeSessions() {
            if (!boardOwnerId) return;
            sb.channel("class_sessions_panel:" + boardOwnerId)
                .on("postgres_changes", { event: "*", schema: "public", table: "class_sessions", filter: "created_by=eq." + boardOwnerId }, () => {
                    refreshSessionStatus();
                    cargarSesiones();
                    refrescarVideollamada();
                })
                .subscribe();

            /* Y el botón de la videollamada se desbloquea con la clase de
               CUALQUIERA de sus profesores, no solo la del que está mirando:
               el canal de arriba va filtrado por `boardOwnerId`, así que a los
               demás hay que escucharlos aparte. Sin esto, a un alumno con dos
               profesores el botón se le quedaría con el candado puesto hasta
               que recargara la página, sin que nada fallara. */
            misClases.filter((c) => c.profesor_id && c.profesor_id !== boardOwnerId).forEach((c) => {
                sb.channel("videollamada_panel:" + c.profesor_id)
                    .on("postgres_changes", { event: "*", schema: "public", table: "class_sessions", filter: "created_by=eq." + c.profesor_id },
                        () => refrescarVideollamada())
                    .subscribe();
            });
        }

        // Modal de cambio de contraseña
        /* Es un diálogo de verdad: el foco entra al abrirlo, no se escapa
           con Tab mientras está abierto, Escape lo cierra y al cerrar vuelve
           al botón que lo abrió. Sin eso, quien usa lector de pantalla
           apretaba «Contraseña», no oía nada, y el formulario quedaba al final
           de la página, detrás de todo el panel. */
        const pwModal = document.getElementById("pw-modal");
        const pwAbrir = document.getElementById("change-pw-btn");
        function cerrarPw() {
            if (pwModal.classList.contains("hidden")) return;
            pwModal.classList.add("hidden");
            document.getElementById("new-password").value = "";
            document.getElementById("pw-msg").textContent = "";
            pwAbrir.focus();
        }
        pwAbrir.addEventListener("click", () => {
            pwModal.classList.remove("hidden");
            document.getElementById("new-password").focus();
        });
        document.getElementById("pw-cancel-btn").addEventListener("click", cerrarPw);
        pwModal.addEventListener("click", (e) => { if (e.target === pwModal) cerrarPw(); });
        pwModal.addEventListener("keydown", (e) => {
            if (e.key === "Escape") { e.preventDefault(); cerrarPw(); return; }
            if (e.key !== "Tab") return;
            const enfocables = pwModal.querySelectorAll("input, button");
            const primero = enfocables[0], ultimo = enfocables[enfocables.length - 1];
            if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
        });
        document.getElementById("pw-save-btn").addEventListener("click", async () => {
            const pwMsg = document.getElementById("pw-msg");
            const newPassword = document.getElementById("new-password").value;
            if (newPassword.length < 8) {
                pwMsg.textContent = "La contraseña debe tener al menos 8 caracteres.";
                pwMsg.className = "text-xs text-red-600 dark:text-red-400 mb-3";
                return;
            }
            const { error } = await sb.auth.updateUser({ password: newPassword });
            if (error) {
                pwMsg.textContent = error.message;
                pwMsg.className = "text-xs text-red-600 dark:text-red-400 mb-3";
                return;
            }
            pwMsg.textContent = "Contraseña actualizada.";
            pwMsg.className = "text-xs text-green-600 dark:text-green-400 mb-3";
            setTimeout(cerrarPw, 1200);
        });

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html"; return; }

            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) {
                // No basta con avisar y dejar la rueda de carga dando vueltas: si el
                // perfil no carga (sesión caducada, fila borrada, error de red), se le
                // pide directamente volver a iniciar sesión en vez de quedarse
                // atascado sin explicación ni forma de salir de ahí.
                document.getElementById("loading-spinner").classList.add("hidden");
                document.getElementById("loading-error").classList.remove("hidden");
                document.getElementById("reingresar-btn").addEventListener("click", async () => {
                    try { await sb.auth.signOut(); } catch (e) {}
                    window.location.href = "login.html?next=clases.html";
                });
                return;
            }
            /* Quien administra puede mirar el panel "como estudiante", "como
               profesor" o "como supervisor" (js/modo-vista.js). Desde acá para
               abajo `profile` es el del rol que se está mirando; el selector
               sale con la cuenta real. */
            profile = window.ModoVista ? ModoVista.perfilVisto(profileData) : profileData;
            /* Y quien supervisa (o administra) puede mirar el panel de UNO de
               sus profesores o coordinadores, con sus números: «Ver como» una
               persona. La lista la da la base (personas_para_ver_como); si la
               persona guardada ya no está en ella —le quitaron esa
               supervisión—, se vuelve a la vista propia en vez de pintar un
               panel que la base se niega a llenar. */
            if (window.ModoVista && (profileData.is_admin || profileData.es_supervisor)) {
                const wrap = document.getElementById("modo-vista-wrap");
                if (profileData.is_admin) {
                    const lbl = document.createElement("label");
                    lbl.setAttribute("for", "modo-vista-panel");
                    lbl.className = "text-xs font-semibold text-brand-500 dark:text-brand-300";
                    lbl.textContent = "Ver como:";
                    wrap.append(lbl, ModoVista.selectorModos("modo-vista-panel"));
                }
                const selPersona = await ModoVista.selectorPersonas(sb, profileData.id, "ver-como-persona");
                /* clases.html?ver_como=<id>: así entra «Ver su panel» de
                   supervision.html. Solo si está en la lista que dio la base. */
                const pedida = new URLSearchParams(location.search).get("ver_como");
                const deLista = pedida && selPersona && selPersona._personas.find((x) => x.id === pedida);
                if (deLista) {
                    ModoVista.fijarPersona(deLista, profileData.id);
                    location.replace("clases.html");
                    return;
                }
                const guardada = ModoVista.personaDe(profileData);
                if (guardada && !(selPersona && selPersona._personas.some((x) => x.id === guardada.id))) {
                    ModoVista.fijarPersona(null);
                    location.reload();
                    return;
                }
                if (selPersona) {
                    const lblP = document.createElement("label");
                    lblP.setAttribute("for", "ver-como-persona");
                    lblP.className = "text-xs font-semibold text-brand-500 dark:text-brand-300";
                    lblP.textContent = profileData.is_admin ? "Panel de:" : "Ver como:";
                    wrap.append(lblP, selPersona);
                }
                wrap.hidden = !wrap.children.length;
            }
            // Novedades de la plataforma: solo para quien administra, y no
            // bloquea el resto del panel mientras se resuelve.
            if (profile.is_admin && window.ActualizacionesPopup) {
                ActualizacionesPopup.mostrarSiHayNuevas(sb, profile);
            }
            isTeacher = profile.role === "profesor" || profile.is_admin === true;
            if (isTeacher) {
                boardOwnerId = profile.id;
            } else {
                // Con más de un profesor, el alumno elige a cuál clase entra.
                const { clases, elegida } = await ClaseElegida.resolver();
                boardOwnerId = elegida;
                // La misma consulta trae el enlace de la videollamada de quien
                // tenga clase abierta: se guarda en vez de volver a pedirla.
                misClases = clases;
                videollamadaLista = true;
                ClaseElegida.montarSelector(document.getElementById("selector-clase-wrap"), clases, elegida);
            }

            const displayName = profile.full_name || profile.email;
            document.getElementById("welcome-name").textContent = displayName;
            document.getElementById("avatar").textContent = displayName.trim().charAt(0).toUpperCase();
            const badge = document.getElementById("role-badge");
            badge.textContent = profile.is_admin ? "👑 Administrador"
                : profile._persona ? (profile.es_coordinador ? "👁 Coordinación" : "👁 Profesor")
                : esSupervisorSolo() ? "🧭 Supervisor" : (isTeacher ? "Profesor" : "Alumno");
            if (profile._persona) {
                document.getElementById("panel-subtitulo").textContent =
                    "Así ve " + (profile.full_name || "esta persona") + " su panel: sus tarjetas y los números de su semana.";
            }
            badge.classList.add(isTeacher ? "bg-accent-500" : "bg-brand-600", isTeacher ? "text-brand-900" : "text-white");

            // Herramientas del equipo docente: no se le muestran al alumnado
            // (y la propia página vuelve a comprobar el perfil).
            if (isTeacher || profile.is_admin) {
                /* Preparar la clase antes de darla. Es solo del equipo docente,
                   así que no lleva `desc` de alumno: se suma acá en vez de vivir
                   en la lista con un descProfe. */
                TILE_GROUPS.find((g) => g.title === "Herramientas").tiles.push(
                    { emoji: "📋", label: "Planes de clase", desc: "Prepara la clase antes de darla: las posiciones y las lecciones, en orden", href: "planes.html" },
                    /* La clase del aula también queda registrada. Va acá, al
                       lado de los planes, porque es el otro extremo de la misma
                       clase: uno la prepara antes y el otro la anota después.
                       Lo que se guarda no es una lista suelta — es una
                       class_sessions más, así que entra sola en Informes, en el
                       informe que llega a la casa y en el reporte de
                       actividades. */
                    { emoji: "✅", label: "Asistencia presencial", desc: "Pasa lista de la clase que diste en el aula y anota qué se trabajó", href: "asistencia.html" },
                    /* El informe del mes para la supervisión. Los números se llenan
                       solos con lo que pasó en la plataforma; el profesor escribe
                       lo que los números no dicen. */
                    { emoji: "🗓️", label: "Informe mensual", desc: "Cuéntale a tu supervisión qué hiciste en el mes: los números salen solos", href: "informe-mensual.html" },
                    /* Tus propias listas de alumnos. No son los "equipos" de
                       Administración —esos dan permisos— ni el grupo de cada
                       alumno: son de quien las arma y solo sirven para filtrar
                       y para mandar una tarea a varios de una vez. */
                    { emoji: "👥", label: "Mis subgrupos", desc: "Arma tus propias listas de alumnos para filtrar Informes y mandarles tareas de una vez", href: "subgrupos.html" }
                );
            }

            // Coordinación: armar formularios de inscripción a torneos. La
            // página lo vuelve a comprobar, y la RLS es la que de verdad manda.
            if (profile.es_coordinador || profile.is_admin) {
                TILE_GROUPS.find((g) => g.title === "Herramientas").tiles.push(
                    /* Por dónde se entra a la gente que uno coordina. Va
                       primero del grupo de coordinación porque es la puerta:
                       desde ahí se llega a sus subgrupos, a su acceso y a su
                       rol. */
                    { emoji: "🧭", label: "Coordinación", desc: "Tus profesores y sus alumnos: quién es quién, cómo entra y cómo se ordena", href: "coordinacion.html" },
                    { emoji: "📝", label: "Solicitudes de la Academia", desc: "Quien pidió unirse desde unirse.html: aprobar crea la cuenta, rechazar invita a un plan pago", href: "solicitudes.html" },
                    { emoji: "📋", label: "Formularios de inscripción", desc: "Arma un formulario para tu equipo, compártelo por enlace y baja las respuestas", href: "formularios.html" },
                    { emoji: "💳", label: "Cobros de la Academia", desc: "Mensualidades, pagos y morosidad. Los recordatorios salen solos", href: "cobros.html" }
                );
                /* Lo que el supervisor de su academia le apagó no se ofrece: la
                   base lo rechazaría igual, pero el fallo lo descubriría quien
                   entró. Quien administra o supervisa tiene todas. */
                if (profile.es_coordinador && !profile.is_admin && !profile.es_supervisor && window.FuncionesCoordinacion) {
                    await FuncionesCoordinacion.cargar(sb, profile._persona ? profile._persona.id : null);
                    const herr = TILE_GROUPS.find((g) => g.title === "Herramientas");
                    herr.tiles = herr.tiles.filter((t) => FuncionesCoordinacion.permiteDestino(t.href));
                }
            }
            /* La encuesta de satisfacción: el alumno califica a su profesor una
               vez al mes. Solo al alumnado —el equipo docente no tiene a quién
               calificar— y la base vuelve a comprobar que sea SU profesor. */
            if (!isTeacher && profile.role === "alumno") {
                TILE_GROUPS.find((g) => g.title === "Tu cuenta").tiles.push(
                    { emoji: "⭐", label: "¿Cómo van tus clases?", desc: "Una encuesta corta sobre tu profesor: la lee la Academia, no tu profesor", href: "encuesta-profesor.html" }
                );
            }
            /* LOS COBROS NO SE LE OFRECEN A NADIE MÁS QUE A COORDINACIÓN.
               Aquí vivía «Mis pagos» para el alumnado. Se fue del panel entero,
               y no por mantenimiento: las mensualidades son cosa de la casa,
               no del alumno —a quien entra a entrenar no le toca resolver un
               pago— y a quien da clase esa tarjeta le ofrecía «lo que se te ha
               cobrado» sobre una cuenta a la que no se le cobra nada. Quien
               coordina llega por «Cobros de la Academia», en Herramientas.

               La página sigue existiendo y sigue enseñándole a cada quien sus
               propios recibos si entra por la dirección: lo que se quitó es el
               camino, no el derecho a ver lo suyo. Volver a ofrecerla es
               agregar la tarjeta otra vez acá. */

            /* Quien administra tampoco da clase: su panel es el de ADMIN_GROUPS,
               con el resumen de toda la plataforma, y nada de la clase en vivo,
               de «Tu semana» ni del registro de clases. Mirando «como profesor»
               `profile.is_admin` viene en false y cae en el panel docente, que
               es justamente lo que quiere revisar. */
            if (profile.is_admin) {
                document.getElementById("panel-subtitulo").textContent = "Desde aquí ves cómo va toda la plataforma.";
                TILE_GROUPS.splice(0, TILE_GROUPS.length, ...ADMIN_GROUPS);
                renderTiles();
                document.getElementById("registro-clases").hidden = true;
                document.getElementById("progreso-supervisor").hidden = false;
                await cargarPanelAdmin();
                document.getElementById("loading").classList.add("hidden");
                document.getElementById("app").classList.remove("hidden");
                if (!document.activeElement || document.activeElement === document.body) {
                    document.getElementById("panel-titulo").focus({ preventScroll: true });
                }
                abrirBusquedaPedida();
                return;
            }

            /* Quien supervisa no recorre el panel del equipo docente: se le
               pinta el suyo, entero, y nada de la clase en vivo ni del
               registro de clases — no da clase. */
            if (esSupervisorSolo()) {
                TILE_GROUPS.splice(0, TILE_GROUPS.length, ...SUPERVISOR_GROUPS);
                renderTiles();
                document.getElementById("registro-clases").hidden = true;
                document.getElementById("progreso-supervisor").hidden = false;
                await cargarPanelSupervisor();
                document.getElementById("loading").classList.add("hidden");
                document.getElementById("app").classList.remove("hidden");
                if (!document.activeElement || document.activeElement === document.body) {
                    document.getElementById("panel-titulo").focus({ preventScroll: true });
                }
                abrirBusquedaPedida();
                return;
            }

            // Después de armar la lista y antes de pintarla: apaga para el
            // alumnado lo que está en mantenimiento, sin tocar lo del equipo
            // docente.
            textosDelEquipoDocente();
            apagarEnMantenimiento();
            renderTiles();

            /* Mirando el panel de otra persona: sus tarjetas y «Tu semana» con
               SUS números, y nada de la clase en vivo ni del registro de
               clases — abrir una clase desde acá la abriría a nombre de quien
               mira, que no da clase. */
            if (profile._persona) {
                document.querySelector("#progreso-profe h2").textContent = "Su semana";
                document.getElementById("registro-clases").hidden = true;
                document.getElementById("progreso-profe").hidden = false;
                await cargarPanelProfe();
                /* Si está dando clase ahora, se puede mirar en vivo
                   (sesion.html?observar=<id>, solo lectura). */
                const { data: abierta } = await sb.from("class_sessions").select("id")
                    .eq("created_by", profile._persona.id).is("ended_at", null).limit(1);
                if (abierta && abierta.length) {
                    const vivo = document.createElement("a");
                    vivo.id = "mirar-clase";
                    vivo.href = "sesion.html?observar=" + encodeURIComponent(profile._persona.id);
                    vivo.className = "block mt-2 font-semibold text-red-700 dark:text-red-300 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
                    vivo.textContent = "🔴 Está dando clase ahora: mirar la clase en vivo";
                    document.getElementById("profe-clases").appendChild(vivo);
                }
                document.getElementById("loading").classList.add("hidden");
                document.getElementById("app").classList.remove("hidden");
                if (!document.activeElement || document.activeElement === document.body) {
                    document.getElementById("panel-titulo").focus({ preventScroll: true });
                }
                abrirBusquedaPedida();
                return;
            }
            // El equipo docente no pasa por mis_clases() —esos son SUS
            // profesores, no sus alumnos—, así que su sala se pide aparte.
            if (esEquipoDocente()) refrescarVideollamada();
            // Si el navegador renueva la suscripción de avisos por su cuenta,
            // se vuelve a guardar sola; si no, el aparato deja de recibir sin
            // que nadie se entere.
            if (window.Notificaciones) Notificaciones.atenderRenovaciones();
            // El aviso de partida asignada (js/juego-aviso.js) se autoarranca solo
            // en todas las páginas de la Academia — ver herramientas/academia-cabecera.py.
            await refreshSessionStatus();
            await cargarSesiones();

            /* Dos resúmenes distintos, no uno solo con los números del alumno
               para todo el mundo. Quien da clase veía acá SUS ejercicios 4×4
               (en cero, porque no es alumno) y su racha de días; lo que
               necesita al entrar es a quién hay que perseguir. Es la misma
               decisión de "una página, dos públicos" que ya toman
               informes.html, cobros.html y tareas.html.

               Y vale igual para quien administra, como todo lo que se hace
               para los profesores. */
            if (isTeacher || profile.is_admin) {
                document.getElementById("progreso-profe").hidden = false;
                await cargarPanelProfe();
            } else {
                document.getElementById("progreso-alumno").hidden = false;
                // Van en paralelo: son cinco consultas independientes y en
                // serie se nota al abrir el panel desde el celular.
                /* La racha se pide UNA vez y la promesa se reparte: la usan
                   el número de "Tu progreso" y el primer paso, que necesita
                   saber si ya resolvió algo. Dos llamadas serían dos veces la
                   misma consulta para pintar el mismo dato. */
                const rachaP = window.Logros.cargar();
                await Promise.all([
                    cargarPendientes(rachaP),
                    cargarSeguirCurso(),
                    loadEntrenoProgress(),
                    loadTacticsRecord(),
                    loadRachaWidget(rachaP),
                ]);
            }
            subscribeSessions();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
            /* «Cargando tu panel…» desaparece y, sin esto, el lector de
               pantalla no dice nada: quien no ve la página no sabe que ya
               cargó. El foco va al título —que dice de quién es el panel—,
               pero solo si nadie lo movió antes: arrancarle el foco a quien ya
               estaba navegando sería peor que el silencio. */
            if (!document.activeElement || document.activeElement === document.body) {
                document.getElementById("panel-titulo").focus({ preventScroll: true });
            }
            abrirBusquedaPedida();
        }

        init();
    