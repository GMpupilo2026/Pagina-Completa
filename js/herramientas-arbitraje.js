/* Las herramientas de arbitraje, en UNA sola lista.

   La usan herramientas-arbitraje.html (la vitrina pública: qué hace cada una,
   con su candado) y licencias.html (administración: para qué herramienta es
   cada licencia). El `id` es el que guarda la base en
   licencias_herramientas.herramienta y el que pregunta tengo_herramienta();
   «todas» es la licencia que abre cualquiera.

   `disponible: false` es una herramienta anunciada que todavía no se puede
   usar: sale en la vitrina como «Próximamente», sin enlace. `gratis: true` es
   una que no lleva licencia (Pareo Integral, pública y sin cuenta): sale
   abierta para todos y no se ofrece en licencias.html. Ver «Herramientas
   de arbitraje» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    if (window.HerramientasArbitraje) return;

    const LISTA = [
        {
            id: "pareo",
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
            id: "seleccion-codicader",
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
            emoji: "🏆",
            nombre: "Resultados JDN por comité",
            corto: "Resultados JDN",
            href: "jdn-comites.html",
            disponible: true,
            resumen: "Todos los torneos de ajedrez de los Juegos Deportivos Nacionales que están en chess-results, eliminatorias y finales desde 2018, ordenados por comité de deportes.",
            puntos: [
                "El medallero de las finales, de todas juntas o de una edición, con individual y equipos.",
                "La ficha de cada comité: sus jugadores y equipos edición por edición, con el puesto, los puntos y la medalla.",
                "En una eliminatoria, quién jugó después la final de ese ciclo.",
                "Junta las variantes de un mismo comité («Goico», «CCDR Goicochea») y deduce el comité de quien no lo trae.",
            ],
        },
        {
            id: "desempates",
            emoji: "⚖️",
            nombre: "Desempates explicados",
            disponible: false,
            resumen: "El Buchholz, el Sonneborn-Berger, el encuentro directo y los demás, calculados jugador por jugador desde chess-results, para responder un reclamo con números.",
            puntos: [],
        },
        {
            id: "variacion-elo",
            emoji: "📈",
            nombre: "Variación de Elo del torneo",
            disponible: false,
            resumen: "Cuánto sube o baja el Elo FIDE y nacional de cada participante, partida por partida, antes de que salga la lista oficial.",
            puntos: [],
        },
        {
            id: "reclamos-tablas",
            emoji: "🔁",
            nombre: "Reclamos de tablas desde el PGN",
            disponible: false,
            resumen: "Triple repetición y regla de las 50 jugadas comprobadas en la partida: en qué jugada se cumplió y si el reclamo procede.",
            puntos: [],
        },
        {
            id: "acta-jde",
            emoji: "📝",
            nombre: "Acta e informe arbitral JDE",
            disponible: false,
            resumen: "El informe del torneo con los resultados, los clasificados por etapa y las incidencias, listo para firmar y entregar al comité.",
            puntos: [],
        },
    ];

    const porId = new Map(LISTA.map((h) => [h.id, h]));
    function nombre(id) {
        if (id === "todas") return "Todas las herramientas";
        const h = porId.get(id);
        return h ? h.nombre : id;
    }

    window.HerramientasArbitraje = { LISTA, porId, nombre };
})();
