/* Lo que hizo cada alumno en UNA clase: las preguntas que contestó y cómo se
 * calificaron, y las prácticas contra el motor.
 *
 * La cuenta la hace la base (`resumen_de_la_clase`, SECURITY INVOKER: la RLS
 * decide quién ve qué), porque las respuestas de una academia pasan de mil en
 * un mes y PostgREST corta a mil sin avisar. Esto solo la pinta, y la usan dos
 * pantallas: el cierre de la clase en sesion.html y el registro de clases del
 * panel. Una sola copia: dos se irían separando a la primera corrección.
 *
 * Todo va escrito («3 bien, 1 mal»), nunca solo con un color: este resumen se
 * lee también en voz y lo copia quien arma el informe.
 */
window.ResumenClase = (function () {
    async function cargar(sb, claseId) {
        const { data, error } = await sb.rpc("resumen_de_la_clase", { p_clase: claseId });
        return { filas: data || [], error };
    }

    function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

    function textoPreguntas(f) {
        if (!f.preguntas) return "—";
        if (!f.respondidas) return "No contestó ninguna de " + f.preguntas;
        const partes = [];
        if (f.correctas) partes.push(f.correctas + " bien");
        if (f.incorrectas) partes.push(f.incorrectas + " mal");
        if (f.sin_calificar) partes.push(f.sin_calificar + " sin calificar");
        return f.respondidas + " de " + f.preguntas + " contestadas: " + partes.join(", ");
    }

    function textoPracticas(f) {
        if (!f.practicas) return "—";
        const partes = [];
        if (f.ganadas) partes.push(plural(f.ganadas, "ganada", "ganadas"));
        if (f.tablas) partes.push(plural(f.tablas, "en tablas", "en tablas"));
        if (f.perdidas) partes.push(plural(f.perdidas, "perdida", "perdidas"));
        const enJuego = f.practicas - f.ganadas - f.tablas - f.perdidas;
        if (enJuego > 0) partes.push(plural(enJuego, "sin terminar", "sin terminar"));
        return plural(f.practicas, "partida", "partidas") + ": " + partes.join(", ");
    }

    // Una línea para todo el grupo: lo primero que se lee.
    function titular(filas) {
        const preguntas = filas.length ? filas[0].preguntas : 0;
        const practicas = filas.reduce((a, f) => a + f.practicas, 0);
        if (!filas.length) return "Nadie de tus alumnos quedó registrado en esta clase.";
        if (!preguntas && !practicas) return "En esta clase no se hicieron preguntas ni prácticas contra el motor.";
        const partes = [];
        if (preguntas) partes.push(plural(preguntas, "pregunta", "preguntas"));
        if (practicas) partes.push(plural(practicas, "partida de práctica", "partidas de práctica"));
        const sinCalificar = filas.reduce((a, f) => a + f.sin_calificar, 0);
        return "En esta clase: " + partes.join(" y ") + "."
            + (sinCalificar ? (sinCalificar === 1 ? " Queda 1 respuesta sin calificar." : " Quedan " + sinCalificar + " respuestas sin calificar.") : "");
    }

    function el(tag, cls, texto) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (texto != null) e.textContent = texto;   // los nombres los escribió una persona
        return e;
    }

    function pintar(caja, filas, opciones) {
        const o = opciones || {};
        caja.innerHTML = "";
        caja.appendChild(el("p", "text-sm font-semibold text-brand-700 dark:text-brand-200", titular(filas)));
        const hay = filas.length && (filas[0].preguntas || filas.some((f) => f.practicas));
        if (!hay) return;
        const envoltura = el("div", "overflow-x-auto mt-2");
        const tabla = el("table", "w-full text-sm");
        const cap = el("caption", "sr-only", o.titulo || "Lo que hizo cada alumno en la clase");
        const thead = el("thead");
        const trh = el("tr", "text-left text-xs uppercase text-brand-450 dark:text-brand-350 border-b border-brand-100 dark:border-brand-800");
        ["Alumno", "Preguntas", "Práctica contra el motor"].forEach((t) => {
            const th = el("th", "py-1.5 pr-4 font-semibold", t);
            th.scope = "col";
            trh.appendChild(th);
        });
        thead.appendChild(trh);
        const tbody = el("tbody");
        filas.forEach((f) => {
            const tr = el("tr", "border-b border-brand-50 dark:border-brand-800/60 last:border-0");
            const th = el("th", "py-1.5 pr-4 text-left font-medium text-brand-800 dark:text-brand-100", f.nombre);
            th.scope = "row";
            tr.append(th,
                el("td", "py-1.5 pr-4 text-brand-600 dark:text-brand-300", textoPreguntas(f)),
                el("td", "py-1.5 pr-4 text-brand-600 dark:text-brand-300", textoPracticas(f)));
            tbody.appendChild(tr);
        });
        tabla.append(cap, thead, tbody);
        envoltura.appendChild(tabla);
        caja.appendChild(envoltura);
    }

    return { cargar, pintar, titular, textoPreguntas, textoPracticas };
})();
