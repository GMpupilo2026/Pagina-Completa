/* La encuesta de satisfacción con el profesor: las preguntas, UNA sola copia.
 *
 * La usan la pantalla que contesta el alumno (encuesta-profesor.html) y la que
 * lee quien administra o supervisa (satisfaccion.html). Escritas dos veces, una
 * diría «explica claro» y la otra «explica bien», y el promedio de una pregunta
 * no correspondería al texto que el alumno leyó.
 *
 * Cada `clave` es una columna de `encuestas_profesor` (y un parámetro p_<clave>
 * de responder_encuesta_profesor()): no se cambia. El texto sí se puede
 * corregir. Todas van en el mismo sentido —1 es lo peor, 5 lo mejor—, también
 * «claridad», que es la de «¿te resulta confuso?»: así un promedio bajo siempre
 * quiere decir lo mismo.
 *
 * Ver «La encuesta de satisfacción» en docs/decisiones/cuentas-y-formularios.md.
 */
window.EncuestaPreguntas = (function () {
    const PREGUNTAS = [
        { clave: "explica", corto: "Explica",
          texto: "¿Tu profesor explica de forma que le entiendes?",
          opciones: ["Casi nunca le entiendo", "Pocas veces", "A veces", "Casi siempre", "Siempre le entiendo"] },
        { clave: "aprende", corto: "Aprende",
          texto: "¿Sientes que has aprendido ajedrez en sus clases?",
          opciones: ["Nada", "Poco", "Algo", "Bastante", "Muchísimo"] },
        { clave: "claridad", corto: "Claridad",
          texto: "¿Las clases te resultan claras o confusas?",
          opciones: ["Muy confusas", "Algo confusas", "Ni claras ni confusas", "Claras", "Muy claras"] },
        { clave: "creatividad", corto: "Creatividad",
          texto: "¿Las clases son creativas y entretenidas?",
          opciones: ["Nada", "Poco", "Más o menos", "Bastante", "Mucho"] },
        { clave: "resuelve", corto: "Resuelve",
          texto: "Cuando tienes una duda o algo sale mal, ¿te ayuda a resolverlo?",
          opciones: ["Nunca", "Pocas veces", "A veces", "Casi siempre", "Siempre"] },
        { clave: "contento", corto: "Le gustan",
          texto: "En general, ¿te gustan tus clases?",
          opciones: ["No me gustan", "Poco", "Más o menos", "Me gustan", "Me encantan"] },
    ];

    const SEGUIR = [
        { valor: "si", texto: "Sí, quiero seguir", corto: "Sigue" },
        { valor: "no_se", texto: "Todavía no lo sé", corto: "Duda" },
        { valor: "no", texto: "No, pienso dejarlas", corto: "Se va" },
    ];

    /* El mes de hoy en Costa Rica, "AAAA-MM-01": el mismo que calcula la base
       para guardar la respuesta. */
    function mesActual() {
        const partes = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit",
        }).formatToParts(new Date());
        const v = (t) => partes.find((p) => p.type === t).value;
        return v("year") + "-" + v("month") + "-01";
    }

    /* Un promedio con coma, como se escribe en Costa Rica: 4,3. */
    function nota(n) {
        if (n == null || n === "") return "—";
        return Number(n).toLocaleString("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    /* Lo que quiere decir un promedio, escrito: el número nunca va solo con un
       color. */
    function lectura(n) {
        if (n == null || n === "") return "Sin respuestas";
        const v = Number(n);
        if (v >= 4.5) return "Excelente";
        if (v >= 4) return "Bien";
        if (v >= 3) return "Regular";
        return "A revisar";
    }

    function textoSeguir(valor) {
        const s = SEGUIR.find((x) => x.valor === valor);
        return s ? s.texto : "";
    }

    return { PREGUNTAS, SEGUIR, mesActual, nota, lectura, textoSeguir };
})();
