/* La encuesta anónima de un curso: las preguntas, UNA sola copia.
 *
 * La leen la página que contesta el público (encuesta-curso.html, sin cuenta y
 * pensada para lector de pantalla) y la que lee quien administra
 * (encuestas-curso.html). Cada `clave` y cada `valor` es lo que guarda la base
 * (encuesta_curso_respuestas) y lo que valida responder_encuesta_curso(): no se
 * cambian. Los textos sí se pueden corregir.
 *
 * Es para cursos de gente que empezó sabiendo 0 de ajedrez: por eso las
 * preguntas hablan de «lo más básico», de si el profesor describía el tablero
 * con palabras y de si el material funcionó con el lector de pantalla.
 *
 * Ver «La encuesta anónima de un curso» en docs/decisiones/cuentas-y-formularios.md.
 */
window.EncuestaCursoPreguntas = (function () {
    const ASISTENCIA = [
        { valor: "termino", texto: "Terminé el curso" },
        { valor: "sigue", texto: "Sigo yendo a todas o casi todas las clases" },
        { valor: "a_veces", texto: "Voy solo a veces" },
        { valor: "dejo", texto: "Dejé de ir" },
    ];

    const MOTIVOS = [
        { valor: "horario", texto: "El horario no me acomodaba" },
        { valor: "rapido", texto: "Iba muy rápido para alguien que empezaba de cero" },
        { valor: "no_entendia", texto: "No entendía las explicaciones" },
        { valor: "no_accesible", texto: "El material o la plataforma no funcionaban bien con mi lector de pantalla" },
        { valor: "tecnologia", texto: "Problemas con la conexión, la computadora o el celular" },
        { valor: "personal", texto: "Motivos personales, de trabajo o de salud" },
        { valor: "expectativa", texto: "No era lo que esperaba" },
        { valor: "otro", texto: "Otro motivo" },
    ];

    /* La forma de enseñar: del 1 al 5, o «No sé» (se guarda vacío y no entra
       en el promedio). Alguien que dejó el curso al principio no pudo ver el
       ritmo de todo el curso: sin esa salida, contestaría cualquier cosa. */
    const ESCALA = ["Nada de acuerdo", "Poco de acuerdo", "Más o menos", "Bastante de acuerdo", "Totalmente de acuerdo"];
    const NO_SE = "No sé o no llegué a verlo";
    // Todas empiezan con «El profesor…»: así, al escucharlas una tras otra
    // con el lector de pantalla, queda claro de quién habla cada frase.
    const METODOLOGIA = [
        { clave: "desde_cero", corto: "Desde cero", texto: "El profesor empezó desde lo más básico, sin dar nada por sabido." },
        { clave: "describe", corto: "Describe con palabras", texto: "El profesor describía el tablero y las jugadas con palabras (las casillas y sus coordenadas), de forma que podías seguirlas sin verlas." },
        { clave: "ritmo", corto: "Ritmo", texto: "El profesor llevó las clases a un ritmo adecuado para alguien que empezaba de cero." },
        { clave: "dudas", corto: "Resuelve dudas", texto: "El profesor te daba tiempo para preguntar y resolvía tus dudas." },
        { clave: "guia", corto: "Guía paso a paso", texto: "El profesor te guió paso a paso en tu aprendizaje." },
        { clave: "accesible", corto: "Accesible", texto: "El profesor usó materiales que funcionaron bien con tu lector de pantalla o tu forma de usar la computadora." },
    ];

    const APRENDIZAJE = [
        { valor: "nada", texto: "No aprendí casi nada" },
        { valor: "piezas", texto: "Conozco las piezas y cómo se mueve cada una" },
        { valor: "reglas", texto: "Conozco las reglas y puedo jugar una partida completa" },
        { valor: "ideas", texto: "Juego partidas y entiendo algunas ideas para jugar mejor" },
    ];

    const SUFICIENTE = [
        { valor: "si", texto: "Sí, fue justo lo que necesitaba" },
        { valor: "a_veces", texto: "En partes: a veces se adelantaba o daba cosas por sabidas" },
        { valor: "no", texto: "No, necesitaba empezar mucho más desde cero" },
    ];

    const RECOMENDARIA = [
        { valor: "si", texto: "Sí" },
        { valor: "tal_vez", texto: "Tal vez" },
        { valor: "no", texto: "No" },
    ];

    const TEXTOS = [
        { clave: "expectativas", etiqueta: "Antes de empezar, ¿qué esperabas del curso?", ayuda: "Por ejemplo: aprender a mover las piezas, jugar con tu familia, competir, conocer gente." },
        { clave: "realidad", etiqueta: "¿Qué encontraste de verdad? ¿Se cumplió lo que esperabas?", ayuda: "Lo que fue mejor o peor de lo que pensabas." },
        { clave: "comentario", etiqueta: "¿Algo más que quieras decirle a la Academia?", ayuda: "Qué cambiarías, qué te gustó, qué le pedirías al profesor." },
    ];

    function texto(lista, valor) {
        const x = lista.find((o) => o.valor === valor);
        return x ? x.texto : "";
    }

    return { ASISTENCIA, MOTIVOS, ESCALA, NO_SE, METODOLOGIA, APRENDIZAJE, SUFICIENTE, RECOMENDARIA, TEXTOS, texto };
})();
