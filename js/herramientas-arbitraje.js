/* Las herramientas de arbitraje, en UNA sola lista.

   La usan herramientas-arbitraje.html (la vitrina pública: qué hace cada una,
   con su candado) y licencias.html (administración: para qué herramienta es
   cada licencia). El `id` es el que guarda la base en
   licencias_herramientas.herramienta y el que pregunta tengo_herramienta();
   «todas» es la licencia que abre cualquiera.

   `disponible: false` es una herramienta anunciada que todavía no se puede
   usar: sale en la vitrina como «Próximamente», sin enlace. `gratis: true` es
   una que no lleva licencia (Pareo Integral, pública y sin cuenta): sale
   abierta para todos y no se ofrece en licencias.html. `licencia` es la de
   otra herramienta que también abre esta (el catálogo de torneos
   universitarios va con la de «universidades»): la vitrina pregunta por esa
   y licencias.html no la ofrece aparte. `tema` es la ficha
   de la vitrina donde sale (uno de TEMAS); la lista se ordena por tema, y
   dentro de cada uno queda en el orden en que está escrita. Ver «Herramientas
   de arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    if (window.HerramientasArbitraje) return;

    /* Las fichas de la vitrina, en el orden en que salen. */
    const TEMAS = [
        { id: "arbitraje", emoji: "⚖️", nombre: "Arbitraje", resumen: "Para dirigir un torneo: emparejar, desempatar y encontrar a los árbitros del país, con sus torneos y sus normas." },
        { id: "jde", emoji: "🏫", nombre: "JDE", largo: "Juegos Deportivos Estudiantiles", resumen: "Los Juegos Deportivos Estudiantiles del MEP: la participación año por año, cada estudiante y cada colegio, y la selección CODICADER." },
        { id: "jdn", emoji: "🏆", nombre: "JDN", largo: "Juegos Deportivos Nacionales", resumen: "Los Juegos Deportivos Nacionales del ICODER: los resultados de cada comité de deportes y quién está inscrito para la próxima eliminatoria." },
        { id: "universitarios", emoji: "🎓", nombre: "Universitarios", resumen: "Los torneos universitarios de Costa Rica: los resultados por universidad (también los JUDUCA), el catálogo de todos los torneos y la página de cada uno." },
    ];

    const LISTA = [
        {
            id: "pareo",
            tema: "arbitraje",
            emoji: "♟️",
            nombre: "Pareo Integral: emparejamientos con el Sistema Holandés de FIDE",
            corto: "Pareo Integral",
            href: "pareo.html",
            manual: "pareo-manual.html",
            disponible: true,
            gratis: true,
            resumen: "Empareja tu torneo suizo o todos contra todos, anota los resultados y saca la clasificación con los desempates de FIDE, la tabla cruzada y el TRF para el Elo. Gratis, sin cuenta y en tu computadora.",
            puntos: [
                "El Sistema Holandés vigente (C.04.3, 2026), calculado con bbpPairings, el motor que usan programas avalados por FIDE.",
                "Byes pedidos, retiros, inscripciones tardías e incomparecencias; aceleración Baku; puntos a elegir.",
                "Los 26 desempates del C.07 (versión 2026) en el orden que elijas, con las rondas no jugadas como dice el reglamento.",
                "Abre el TRF de Swiss-Manager o de Vega para seguir emparejando, y trae el comprobador de emparejamientos y el generador de torneos al azar.",
                "En español y en inglés, con su manual y una versión de línea de comandos. Todavía sin el aval de FIDE.",
            ],
        },
        {
            id: "torneos-costa-rica",
            tema: "arbitraje",
            emoji: "📅",
            nombre: "Torneos de Costa Rica: los de ajedrezcostarica.com",
            corto: "Torneos de Costa Rica",
            href: "torneos-pareo.html#tambien",
            disponible: true,
            gratis: true,
            resumen: "Los torneos que se anuncian en ajedrezcostarica.com y los que ya están cargados en chess-results, juntos en una lista, con la fecha, el ritmo, si valen para Elo y el enlace a su ficha para inscribirse. Gratis y sin cuenta.",
            puntos: [
                "Se pone al día sola una vez al día, sin repetir un torneo que está en las dos fuentes o que ya se publicó con Pareo Integral.",
                "Cada torneo con su día en hora de Costa Rica, el ritmo con su tiempo, si es válido para Elo FIDE o Nacional y el costo.",
                "Los mismos filtros que los torneos de Pareo Integral, y «Agregar a mi calendario» con todos los que se ven.",
                "En la misma página, los torneos publicados con Pareo Integral: rondas, clasificación y cada jugador con sus rivales.",
            ],
        },
        {
            id: "arbitros",
            tema: "arbitraje",
            emoji: "🧑‍⚖️",
            nombre: "Árbitros de Costa Rica: la lista y a quién contratar",
            corto: "Lista de árbitros",
            href: "arbitros.html",
            disponible: true,
            gratis: true,
            resumen: "La lista de árbitros de la Federación con su título, su categoría nacional y su último torneo, y qué categoría pide tu torneo según el Reglamento para Árbitros. Gratis y sin cuenta.",
            puntos: [
                "Dices si tu torneo es de Elo nacional, de FIDE o sin Elo, de qué división son los jugadores y cuántos son.",
                "Te dice qué categoría pide (arts. 11, 13 y 15) y quiénes la tienen, primero quienes arbitraron hace poco.",
                "Con el título de FIDE, si está activo y el enlace a su perfil.",
            ],
        },
        {
            id: "seleccion-codicader",
            tema: "jde",
            emoji: "🏅",
            nombre: "Selección por parámetros (CODICADER y JDE)",
            corto: "Selección CODICADER",
            href: "seleccion-codicader.html",
            disponible: true,
            resumen: "Pega los enlaces de chess-results de la Etapa Nacional y la herramienta calcula la selección con el método del ICODER: posición, rendimiento, ranking nacional y ranking FIDE.",
            puntos: [
                "Lee de chess-results la clasificación, el Elo nacional y FIDE, el año de nacimiento y cada partida de cada estudiante: clásico y blitz, individual y por equipos.",
                "Aplica los cuatro parámetros (A, B, C y D) con su prorrateo de empates, el 40 % de rondas en equipos y el desempate por ranking nacional y edad.",
                "Las mujeres que juegan en un absoluto se calculan solo en la rama femenina.",
                "Admite estudiantes de otra final que cumplen la edad (la final B en la selección de la C).",
                "Avisa lo que falta —un año de nacimiento, un nombre que no coincide entre torneos— para corregirlo en chess-results y volver a cargar.",
                "En vivo: se actualiza ronda a ronda, marca quién entra y quién sale y cuántos puntos le faltan a cada estudiante.",
            ],
        },
        {
            id: "jdn-comites",
            tema: "jdn",
            emoji: "🏆",
            nombre: "Resultados JDN por comité",
            corto: "Resultados JDN",
            href: "jdn-comites.html",
            disponible: true,
            resumen: "Todos los torneos de ajedrez de los Juegos Deportivos Nacionales que están en chess-results, eliminatorias y finales desde 2011, ordenados por comité de deportes.",
            puntos: [
                "El medallero de las finales, de todas juntas o de una edición, con individual y equipos.",
                "La ficha de cada comité: sus jugadores y equipos edición por edición, con el puesto, los puntos y la medalla.",
                "En una eliminatoria, quién jugó después la final de ese ciclo.",
                "Junta las variantes de un mismo comité («Goico», «CCDR Goicochea») y deduce el comité de quien no lo trae.",
            ],
        },
        {
            id: "universidades",
            tema: "universitarios",
            emoji: "🎓",
            nombre: "Resultados universitarios por universidad",
            corto: "Resultados universitarios",
            href: "universidades.html",
            disponible: true,
            resumen: "Todos los torneos universitarios de ajedrez de Costa Rica que están en chess-results —los JUNCOS, el torneo CONARE, la FEDEU, la FECUNDE— y los JUDUCA centroamericanos, desde 2010, ordenados por universidad.",
            puntos: [
                "El medallero de todos los torneos o de uno, con individual y equipos, y las medallas de cada universidad torneo por torneo.",
                "La ficha de cada universidad: sus jugadores, sus equipos y quién jugó en cada uno, edición por edición, con el puesto, los puntos y la medalla.",
                "El rendimiento contra el Elo, los enfrentamientos entre universidades, la copa de puntos por puesto y cada tabla en Excel, imagen o PDF.",
                "Junta las sedes y las variantes de una misma universidad («ITCR», «TEC Alajuela») y deduce la de quien no la trae.",
                "Con la misma licencia se abre «Torneos universitarios de Costa Rica», el catálogo de todos los torneos.",
            ],
        },
        {
            id: "torneos-universitarios",
            tema: "universitarios",
            licencia: "universidades",
            emoji: "📚",
            nombre: "Torneos universitarios de Costa Rica",
            corto: "Torneos universitarios",
            href: "torneos-universitarios.html",
            disponible: true,
            resumen: "El catálogo de todos los torneos universitarios de ajedrez de Costa Rica que están en chess-results, los que se juegan entre universidades y los que organiza cada una, con su fecha, quién lo organizó, cuántos jugaron y su podio. Va con la licencia de «Resultados universitarios por universidad».",
            puntos: [
                "Más de 170 torneos: los JUNCOS, CONARE, FEDEU, FECUNDE y JUDUCA, y los de cada universidad (los Blitz del club de la UCR, el interno del TEC, el Desafío Mentes Maestras de CENFOTEC…).",
                "Dice de qué tipo es cada uno: entre universidades o de una universidad, con su ritmo y el enlace a chess-results para comprobarlo.",
                "La ficha de cada jugador con todos sus torneos universitarios, su clasificación, sus podios y su año a año.",
                "Quién más ganó: los podios de los torneos individuales, jugador por jugador.",
            ],
        },
        {
            id: "cenfotec-2026",
            tema: "universitarios",
            emoji: "🧠",
            nombre: "Desafío Mentes Maestras CENFOTEC 2026",
            corto: "Mentes Maestras 2026",
            href: "cenfotec-2026.html",
            disponible: true,
            gratis: true,
            resumen: "El torneo de la Universidad CENFOTEC: el podio, la clasificación final, las rondas y el rendimiento de cada jugador, las partidas, el video de la transmisión y la comparación con la edición 2025.",
            puntos: [],
        },
        {
            id: "utn-2026",
            tema: "universitarios",
            emoji: "🏛️",
            nombre: "Torneo Universitario UTN-CONARE 2026",
            corto: "UTN-CONARE 2026",
            href: "utn-2026.html",
            disponible: true,
            gratis: true,
            resumen: "El II Torneo Universitario de Ajedrez UTN-CONARE, femenino y masculino: el podio de cada rama, la clasificación final, las rondas y el rendimiento de cada jugador, las partidas y la comparación con la primera edición.",
            puntos: [],
        },
        {
            id: "jdn-proyeccion",
            tema: "jdn",
            emoji: "📋",
            nombre: "Proyección JDN por comité",
            corto: "Proyección JDN",
            href: "jdn-proyeccion.html",
            disponible: true,
            resumen: "Quién está inscrito en la próxima eliminatoria de los JDN(P) por comité de deportes, con su cédula, su fecha de nacimiento, su categoría y en qué paso del trámite del ICODER va, cruzado con su actividad reciente en los torneos estudiantiles de chess-results.",
            puntos: [
                "Por comité: cuántos atletas en U-12, U-16 y U-20, cuántos con el trámite registrado, en trámite o no convocados.",
                "La ficha de cada comité: cada atleta con su cédula, su fecha de nacimiento, su categoría y el estado de su inscripción.",
                "«Activos 2026»: a quién se le encontró un torneo estudiantil de chess-results este año, con el enlace a su historial.",
                "Se carga a mano con cada export nuevo del sistema de inscripciones del ICODER (no es un dato público de chess-results).",
            ],
        },
        {
            id: "arbitros-cr",
            tema: "arbitraje",
            emoji: "🧑‍⚖️",
            nombre: "Árbitros de Costa Rica",
            corto: "Árbitros de Costa Rica",
            href: "arbitros-cr.html",
            disponible: true,
            resumen: "Los torneos de cada árbitro de Costa Rica en FIDE y en chess-results, con su cargo, y cuáles de los de FIDE cumplen las condiciones de un torneo para una norma de Árbitro FIDE y de Árbitro Internacional según el reglamento vigente.",
            puntos: [
                "Todos los torneos de Costa Rica en FIDE desde 2002, con quién fue principal, adjunto o árbitro, y todos los de la federación en chess-results desde 2007, con el director y el organizador.",
                "Por torneo, si vale para una norma de AF y de AI (B.06.1, 2026) y por qué: jugadores con Elo que cuentan, rondas, federaciones, ritmo y sistema.",
                "La lista de árbitros con sus torneos y normas, por años y por título; la ficha de cada uno, para bajar en Excel.",
                "Los títulos de los jugadores salen de la lista de FIDE, para saber si un internacional permitía una norma de jugador.",
            ],
        },
        {
            id: "ajedrez-estudiantil",
            tema: "jde",
            emoji: "📊",
            nombre: "Ajedrez estudiantil en Costa Rica",
            corto: "Ajedrez estudiantil",
            href: "ajedrez-estudiantil.html",
            disponible: true,
            gratis: true,
            resumen: "La participación en los Juegos Deportivos Estudiantiles año por año, por etapa, región y categoría, con todos los torneos estudiantiles de Costa Rica publicados en chess-results.",
            puntos: [
                "Las etapas institucional o circuital, regional, interregional y nacional, y la internacional (CODICADER).",
                "Filtros por región y por categoría (A a E) que cambian toda la página; el enlace guarda la vista para compartirla.",
                "La lista de los torneos con su enlace a chess-results, con buscador.",
                "Se pone al día sola: revisa chess-results cada seis horas y suma los torneos nuevos.",
            ],
        },
        {
            id: "historial-jugador",
            tema: "jde",
            emoji: "👤",
            nombre: "Historial de un jugador en los juegos estudiantiles",
            corto: "Historial de un jugador",
            href: "historial-jugador.html",
            disponible: true,
            gratis: true,
            resumen: "Busca a un estudiante por su nombre y mira todos sus torneos de los JDE y los estudiantiles internacionales en chess-results: la etapa a la que llegó cada año, su colegio, su puesto y sus puntos.",
            puntos: [
                "Su camino por las etapas, año por año: institucional, regional, interregional y nacional.",
                "Cada torneo con su categoría, su institución, el puesto entre cuántos, los puntos y el Elo publicado, con el enlace a chess-results.",
                "El enlace guarda al jugador, para mandárselo a la familia o al profesor.",
                "Se pone al día sola con cada torneo nuevo que se publica.",
            ],
        },
        {
            id: "estadisticas-colegios",
            tema: "jde",
            emoji: "🏫",
            nombre: "Estadísticas por colegio y región",
            corto: "Estadísticas por colegio",
            href: "estadisticas-colegios.html",
            disponible: true,
            gratis: true,
            resumen: "Los colegios y escuelas en los JDE: cuántos estudiantes llevó cada uno, sus podios regionales y nacionales, individuales y por equipos, y cuántos llegaron a la final, también región por región.",
            puntos: [
                "Filtros por región, categoría y año; la tabla se ordena por cualquier columna.",
                "El detalle de cada institución: año por año, sus estudiantes que llegaron más lejos y sus podios.",
                "La comparación de las regiones: instituciones, estudiantes, finalistas y podios nacionales.",
                "Sale de las clasificaciones publicadas en chess-results y se pone al día sola.",
            ],
        },
        {
            id: "inscripcion-jde",
            tema: "jde",
            emoji: "📝",
            nombre: "Inscripción de ajedrez para los JDE",
            corto: "Inscripción JDE",
            href: "inscripcion-jde.html",
            disponible: true,
            gratis: true,
            resumen: "Prepara la inscripción de tu centro educativo en el torneo de ajedrez de los Juegos Deportivos Estudiantiles: escoges tu colegio del banco, la categoría sale de la fecha de nacimiento y todo se revisa contra la Normativa 2026 mientras llenas.",
            puntos: [
                "El colegio se busca en el banco de más de mil centros que ya jugaron los JDE, y propone su Dirección Regional (de las 27), su interregional y cuántos clasifican.",
                "Trae a los estudiantes que jugaron antes con tu colegio, o pega una lista desde Excel: la herramienta pide solo lo que falta (fecha de nacimiento, sexo, documento).",
                "Calcula la categoría A a E por el año de nacimiento (art. 17), el ascenso en equipos (art. 18), la unión de centros (art. 19) y las categorías que juegan en cada etapa (art. 53).",
                "Revisa el art. 66: una sola modalidad por estudiante, dos individuales por categoría y torneo, equipos de 3 a 5 con su suplente, mujeres en el torneo de Mujeres o el Abierto.",
                "Revisa también lo de los arts. 59 y 60: el correo del MEP, el documento de cada estudiante y la jefatura y el cuerpo técnico con una persona del mismo sexo.",
                "Baja un Excel con las columnas del reporte del MEP, que Pareo Integral abre directo para armar los torneos, y la nómina en PDF para firmar. Nada sale de tu computadora.",
            ],
        },
        {
            id: "desempates",
            tema: "arbitraje",
            emoji: "⚖️",
            nombre: "Desempates explicados",
            href: "desempates.html",
            disponible: true,
            resumen: "Pega las bases del torneo (el orden de desempates) y el enlace de chess-results: la herramienta recalcula la clasificación desde las partidas y explica, paso a paso, por qué cada persona queda arriba de la otra.",
            puntos: [
                "Los 26 desempates del C.07 (versión 2026) en el orden que elijas, calculados con el mismo motor que Pareo Integral.",
                "El Buchholz (y sus variantes), el Sonneborn-Berger, el encuentro directo, el rendimiento y los demás, desglosados ronda por ronda: contra quién, con qué resultado y cuánto aportó cada partida.",
                "«¿Por qué fulano queda arriba de mengano?»: se compara a dos personas y se muestra el primer desempate que las distingue, con el detalle de los dos.",
                "Lee la clasificación y las partidas de cada jugador directo de chess-results; byes e incomparecencias quedan en su categoría del artículo 16.",
                "Si el puntaje que se reconstruye no coincide con el oficial de chess-results, lo avisa en vez de mostrar un número sin más: una ronda rara no se adivina.",
                "Solo torneos individuales por ahora (suizo o todos contra todos); uno por equipos reparte el Buchholz de otra forma.",
            ],
        },
        {
            id: "variacion-elo",
            tema: "arbitraje",
            emoji: "📈",
            nombre: "Variación de Elo del torneo",
            disponible: false,
            resumen: "Cuánto sube o baja el Elo FIDE y nacional de cada participante, partida por partida, antes de que salga la lista oficial.",
            puntos: [],
        },
        {
            id: "reclamos-tablas",
            tema: "arbitraje",
            emoji: "🔁",
            nombre: "Reclamos de tablas desde el PGN",
            disponible: false,
            resumen: "Triple repetición y regla de las 50 jugadas comprobadas en la partida: en qué jugada se cumplió y si el reclamo procede.",
            puntos: [],
        },
        {
            id: "acta-jde",
            tema: "jde",
            emoji: "📝",
            nombre: "Acta e informe arbitral JDE",
            disponible: false,
            resumen: "El informe del torneo con los resultados, los clasificados por etapa y las incidencias, listo para firmar y entregar al comité.",
            puntos: [],
        },
    ];

    const ordenTema = new Map(TEMAS.map((t, i) => [t.id, i]));
    LISTA.sort((a, b) => ordenTema.get(a.tema) - ordenTema.get(b.tema));

    const porId = new Map(LISTA.map((h) => [h.id, h]));
    function nombre(id) {
        if (id === "todas") return "Todas las herramientas";
        const h = porId.get(id);
        return h ? h.nombre : id;
    }

    window.HerramientasArbitraje = { TEMAS, LISTA, porId, nombre };
})();
