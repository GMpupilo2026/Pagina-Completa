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

    function textoPartidas(f) {
        if (!f.partidas) return "—";
        const partes = [];
        if (f.partidas_ganadas) partes.push(plural(f.partidas_ganadas, "ganada", "ganadas"));
        if (f.partidas_tablas) partes.push(plural(f.partidas_tablas, "en tablas", "en tablas"));
        if (f.partidas_perdidas) partes.push(plural(f.partidas_perdidas, "perdida", "perdidas"));
        const enJuego = f.partidas - f.partidas_ganadas - f.partidas_tablas - f.partidas_perdidas;
        if (enJuego > 0) partes.push(plural(enJuego, "sin terminar", "sin terminar"));
        return plural(f.partidas, "partida", "partidas") + ": " + partes.join(", ");
    }

    // Una línea para todo el grupo: lo primero que se lee.
    function titular(filas) {
        const preguntas = filas.length ? filas[0].preguntas : 0;
        const practicas = filas.reduce((a, f) => a + f.practicas, 0);
        // Cada partida entre alumnos aparece en la fila de los dos.
        const partidas = Math.round(filas.reduce((a, f) => a + (f.partidas || 0), 0) / 2);
        if (!filas.length) return "Nadie de tus alumnos quedó registrado en esta clase.";
        if (!preguntas && !practicas && !partidas) return "En esta clase no se hicieron preguntas, prácticas contra el motor ni partidas entre alumnos.";
        const partes = [];
        if (preguntas) partes.push(plural(preguntas, "pregunta", "preguntas"));
        if (practicas) partes.push(plural(practicas, "partida de práctica", "partidas de práctica"));
        if (partidas) partes.push(plural(partidas, "partida entre alumnos", "partidas entre alumnos"));
        const sinCalificar = filas.reduce((a, f) => a + f.sin_calificar, 0);
        const lista = partes.length > 1 ? partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1] : partes[0];
        return "En esta clase: " + lista + "."
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
        const hay = filas.length && (filas[0].preguntas || filas.some((f) => f.practicas || f.partidas));
        const conPartidas = filas.some((f) => f.partidas);
        if (!hay) return;
        const envoltura = el("div", "overflow-x-auto mt-2");
        const tabla = el("table", "w-full text-sm");
        const cap = el("caption", "sr-only", o.titulo || "Lo que hizo cada alumno en la clase");
        const thead = el("thead");
        const trh = el("tr", "text-left text-xs uppercase text-brand-450 dark:text-brand-350 border-b border-brand-100 dark:border-brand-800");
        // La columna de partidas entre alumnos solo si hubo: una de guiones no dice nada.
        ["Alumno", "Preguntas", "Práctica contra el motor"].concat(conPartidas ? ["Partidas con compañeros"] : []).forEach((t) => {
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
            if (conPartidas) tr.appendChild(el("td", "py-1.5 pr-4 text-brand-600 dark:text-brand-300", textoPartidas(f)));
            tbody.appendChild(tr);
        });
        tabla.append(cap, thead, tbody);
        envoltura.appendChild(tabla);
        caja.appendChild(envoltura);
    }

    /* «Tu última clase», en el panel del alumno: lo que hizo él (su fila de
       resumen_de_la_clase, que la RLS le da solo a él) y lo que contestó en
       cada pregunta. Solo si la clase fue hace menos de dos semanas y él hizo
       o estuvo en algo: si no, la tarjeta no aparece. */
    const DIAS_ULTIMA_CLASE = 14;
    async function pintarUltimaClaseDelAlumno(sb, caja, alumnoId) {
        const desde = new Date(Date.now() - DIAS_ULTIMA_CLASE * 86400000).toISOString();
        const { data: clases } = await sb.from("class_sessions").select("id, title, started_at, modalidad")
            .not("ended_at", "is", null).gte("started_at", desde).eq("modalidad", "en_linea")
            .order("started_at", { ascending: false }).limit(1);
        const clase = (clases || [])[0];
        if (!clase) { caja.hidden = true; return; }
        const [{ filas }, { data: preguntas }] = await Promise.all([
            cargar(sb, clase.id),
            sb.from("questions").select("id, prompt, tipo, opciones").eq("class_session_id", clase.id).order("created_at"),
        ]);
        const mia = (filas || []).find((f) => f.student_id === alumnoId);
        if (!mia) { caja.hidden = true; return; }
        const ids = (preguntas || []).map((q) => q.id);
        const { data: respuestas } = ids.length
            ? await sb.from("question_answers").select("question_id, moves, opcion, is_correct").eq("student_id", alumnoId).in("question_id", ids)
            : { data: [] };

        caja.innerHTML = "";
        const fecha = new Date(clase.started_at).toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Costa_Rica" });
        const h2 = el("h2", "font-serif text-lg font-bold text-brand-800 dark:text-white", "Tu última clase");
        h2.id = "ultima-clase-titulo";
        caja.appendChild(h2);
        caja.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300 mb-2", fecha + (clase.title ? " · " + clase.title : "")));
        const partes = [];
        if (mia.preguntas) partes.push("Preguntas: " + textoPreguntas(mia));
        if (mia.practicas) partes.push("Práctica contra el motor: " + textoPracticas(mia));
        if (mia.partidas) partes.push("Partidas con compañeros: " + textoPartidas(mia));
        if (!partes.length) partes.push("Estuviste en la clase.");
        const ul = el("ul", "text-sm text-brand-700 dark:text-brand-200 space-y-0.5");
        partes.forEach((t) => ul.appendChild(el("li", "", t)));
        caja.appendChild(ul);
        if ((preguntas || []).length) {
            const det = el("details", "mt-3");
            det.appendChild(el("summary", "cursor-pointer text-sm font-semibold text-accent-700 dark:text-accent-400", "Ver lo que contestaste"));
            const ol = el("ol", "mt-2 space-y-1.5 text-sm list-decimal pl-5 text-brand-700 dark:text-brand-200");
            preguntas.forEach((q) => {
                const r = (respuestas || []).find((x) => x.question_id === q.id);
                let tuya = "Sin contestar";
                if (r) {
                    const texto = q.tipo === "opciones" && Array.isArray(q.opciones) ? "«" + (q.opciones[r.opcion] || "") + "»" : (r.moves || []).join(" ");
                    tuya = "Tu respuesta: " + texto + (r.is_correct === true ? " — ✅ correcta" : r.is_correct === false ? " — ❌ a revisar" : "");
                }
                const li = el("li", "");
                li.appendChild(el("span", "font-medium", q.prompt + " "));
                li.appendChild(el("span", "text-brand-500 dark:text-brand-300", tuya));
                ol.appendChild(li);
            });
            det.appendChild(ol);
            caja.appendChild(det);
        }
        // La partida de la clase, jugada por jugada, vive en «Repasar mis clases».
        const repasar = el("a", "inline-block mt-3 text-sm font-semibold text-accent-700 dark:text-accent-400 hover:underline", "🎞️ Repasar la partida de tus clases →");
        repasar.href = "repasar-clases.html";
        caja.appendChild(repasar);
        caja.hidden = false;
    }

    return { cargar, pintar, titular, textoPreguntas, textoPracticas, textoPartidas, pintarUltimaClaseDelAlumno };
})();
