/* Las direcciones del entrenamiento: en qué se reparte el trabajo de un alumno.
 *
 * La idea viene de la escuela cubana. Allí la preparación del ajedrecista se
 * baja a «direcciones» concretas (aperturas, medio juego, finales, solución
 * de ejercicios, análisis de partidas, práctica de partidas…) para poder
 * repartir el tiempo, dosificarlo y controlar el plan. Ver «Las direcciones
 * del entrenamiento» en docs/decisiones/seguimiento-del-alumno.md, con la
 * fuente (Heredia Guilarte, EFDeportes n.º 144, 2010).
 *
 * La dirección NO se guarda en ningún lado: se deduce de lo que ya está
 * guardado. De un renglón de tarea, por su material y su recorte («10 de
 * Final de torres» es Finales); del tiempo de un alumno, por la sección de
 * `tiempo_por_seccion()`. Guardarla sería una segunda copia que el profesor
 * tendría que mantener a mano y que podría contradecir al material.
 *
 * Lo que mezcla direcciones (la clase en vivo, un curso, el tiempo en Estudio,
 * que no dice qué ficha) no se reparte a la fuerza: queda aparte, con su
 * nombre, para que el reparto no diga más de lo que sabe.
 *
 * Toda herramienta de MaterialPlataforma y toda sección de TiempoSecciones
 * tiene que estar en las tablas de abajo, aunque sea con `null`:
 * herramientas/verificar-direcciones.js lo comprueba, así una herramienta
 * nueva no queda fuera del reparto sin que nadie lo note.
 */
window.DireccionesEntrenamiento = (function () {

    /* En el orden en que se leen. `componente` es el de la fuente: lo
       teórico (lo que se estudia) y lo práctico (lo que se ejercita).
       «Visión del tablero» no está en la lista cubana como dirección aparte
       (allí es una habilidad práctica); acá sí, porque la plataforma tiene
       ocho herramientas para eso y meterlas en «Solución de ejercicios»
       escondería ese tiempo. «Historia» y «Cultura integral» no están porque
       ningún material de la plataforma es de eso: llegan por la clase o por
       un curso, que quedan aparte. */
    const DIRECCIONES = [
        { clave: "aperturas",   nombre: "Aperturas",                componente: "teórico" },
        { clave: "medio-juego", nombre: "Medio juego y estrategia", componente: "teórico" },
        { clave: "finales",     nombre: "Finales",                  componente: "teórico" },
        { clave: "ejercicios",  nombre: "Solución de ejercicios",   componente: "práctico" },
        { clave: "analisis",    nombre: "Análisis de partidas",     componente: "práctico" },
        { clave: "partidas",    nombre: "Práctica de partidas",     componente: "práctico" },
        { clave: "vision",      nombre: "Visión del tablero",       componente: "práctico" },
        { clave: "reglas",      nombre: "Reglas y primeros pasos",  componente: "teórico" },
    ];
    /* Una prueba (el diagnóstico, un examen) no es entrenamiento: mide. Se
       nombra, pero no entra en el porcentaje. */
    const CONTROL = { clave: "control", nombre: "Pruebas de control" };

    /* La sección de tiempo_por_seccion() → su dirección. `null`: mezcla
       direcciones o no es entrenamiento. Las claves son las de
       TiempoSecciones.SECCIONES; un curso ("curso:<slug>") es siempre null. */
    const POR_SECCION = {
        "clase": null,                 // la clase en vivo trabaja de todo
        "estudio": null,               // el tiempo no dice qué ficha
        "logros": null,                // mirar trofeos no es entrenar
        "4x4": "ejercicios",
        "practicar": "ejercicios",
        "desafios": "ejercicios",
        "mates": "ejercicios",
        "temas": "ejercicios",
        "tactica": "ejercicios",
        "tipos": "ejercicios",
        "racha": "ejercicios",
        "aperturas": "aperturas",
        "preparacion": "aperturas",
        "precision-posicional": "medio-juego",
        "finales": "finales",
        "bot": "partidas",
        "partidas": "partidas",
        "torneos": "partidas",
        "coordenadas": "vision",
        "visualizacion": "vision",
        "memoria": "vision",
        "concentracion": "vision",
        "ilumina": "vision",
        "confites": "vision",
        "sonar": "vision",
        "batalla-naval": "vision",
        "buscaminas": "vision",
        "aprender": "reglas",
        "diagnostico": "control",
        "estilo": "control",
        "examen": "control",
    };

    /* El material de un renglón de tarea → su dirección, cuando no depende
       del recorte. Las claves son los slugs de MaterialPlataforma.HERRAMIENTAS. */
    const POR_HERRAMIENTA = {
        "temas": "ejercicios",
        "mates": "ejercicios",
        "4x4": "ejercicios",
        "practicas": "ejercicios",
        "desafios": "ejercicios",
        "tipos": "ejercicios",
        "aperturas": "aperturas",
        "plan-rival": "aperturas",
        "precision-posicional": "medio-juego",
        "finales": "finales",
        "finales-clases": "finales",   // las posiciones de las clases: casi todas finales
        "coordenadas": "vision",
        "visualizacion": "vision",
        "memoria": "vision",
        "concentracion": "vision",
        "ilumina": "vision",
        "confites": "vision",
        "sonar": "vision",
        "batalla-naval": "vision",
        "aprende-a-jugar": "reglas",
        "aprender": "reglas",
        "arbitraje": "reglas",
        "diagnostico": "control",
        "estilo": "control",
        "cuestionario": "control",
        "estudio": null,               // depende de la ficha: ver POR_GRUPO_DE_ESTUDIO
        "mis-estudios": null,          // cada estudio es del alumno: puede ser cualquier cosa
    };

    /* Los recortes que cambian la dirección de su herramienta. Un ejercicio
       de «Final de torres» se resuelve igual que uno de clavada, pero lo que
       el alumno trabaja ahí es el final: el reparto es por contenido. Las
       claves son las de entreno/data/metas.json, y el verificador comprueba
       que existan. */
    const POR_RECORTE = {
        "temas": {
            "opening": "aperturas",
            "endgame": "finales", "rookEndgame": "finales", "bishopEndgame": "finales",
            "pawnEndgame": "finales", "knightEndgame": "finales", "queenEndgame": "finales",
            "queenRookEndgame": "finales",
        },
        "practicas": { "finales": "finales" },
        "aprender": { "tacticas": "ejercicios" },
        "tipos": {
            "apertura": "aperturas",
            "peones": "finales",
            "maestro": "analisis",     // adivinar la jugada del maestro es leer su partida
            "errores": "analisis",     // los ejercicios salen de sus propias partidas
        },
    };

    /* Estudio: la ficha trae su grupo en metas.json. */
    const POR_GRUPO_DE_ESTUDIO = {
        "Aperturas": "aperturas",
        "Defensas": "aperturas",
        "Táctica": "medio-juego",
        "Mates": "medio-juego",
        "Conceptos": "medio-juego",
        "Finales": "finales",
    };

    function direccion(clave) {
        if (clave === CONTROL.clave) return CONTROL;
        return DIRECCIONES.find((d) => d.clave === clave) || null;
    }

    /* La dirección de una sección de tiempo, o null si no tiene una sola. */
    function deSeccion(seccion) {
        const s = String(seccion || "");
        if (s.startsWith("curso:")) return null;
        return direccion(POR_SECCION[s]);
    }

    /* La dirección de un renglón de tarea: { material_tipo, material_slug,
       filtro_clave }. `grupo` es el grupo del recorte cuando se sabe (las
       fichas de Estudio lo necesitan). null: un curso, o algo que mezcla. */
    function deRenglon(r, grupo) {
        if (!r || r.material_tipo === "curso") return null;
        const slug = r.material_slug;
        const recorte = r.filtro_clave || "";
        if (slug === "estudio") return direccion(POR_GRUPO_DE_ESTUDIO[grupo || ""]);
        const porRecorte = POR_RECORTE[slug] && POR_RECORTE[slug][recorte];
        return direccion(porRecorte || POR_HERRAMIENTA[slug]);
    }

    /* El tiempo de un alumno (las filas de tiempo_por_seccion), repartido.
       Devuelve las direcciones con tiempo, de mayor a menor, con su porcentaje
       sobre el tiempo que SÍ se pudo repartir; y aparte lo que no entra: lo
       que mezcla direcciones y las pruebas de control. */
    function reparto(filas) {
        const minutos = {};
        const aparte = [];
        let repartido = 0;
        (filas || []).forEach((f) => {
            const m = Number(f.minutos) || 0;
            const d = deSeccion(f.seccion);
            if (!d || d.clave === CONTROL.clave) {
                aparte.push({ seccion: f.seccion, minutos: m, control: !!d });
                return;
            }
            minutos[d.clave] = (minutos[d.clave] || 0) + m;
            repartido += m;
        });
        const direcciones = DIRECCIONES
            .filter((d) => minutos[d.clave] > 0)
            .map((d) => ({ clave: d.clave, nombre: d.nombre, componente: d.componente, minutos: minutos[d.clave],
                           pct: repartido > 0 ? Math.round((100 * minutos[d.clave]) / repartido) : 0 }))
            .sort((a, b) => b.minutos - a.minutos);
        return { direcciones, repartido, aparte };
    }

    /* Los renglones de una tarea, contados por dirección, en el orden de la
       lista. Lo que no tiene una sola dirección se cuenta como `sin`. */
    function contarRenglones(lista) {
        const cuenta = {};
        let sin = 0;
        (lista || []).forEach(({ renglon, grupo }) => {
            const d = deRenglon(renglon, grupo);
            if (!d) { sin++; return; }
            cuenta[d.clave] = (cuenta[d.clave] || 0) + 1;
        });
        const orden = DIRECCIONES.concat([CONTROL]);
        return {
            direcciones: orden.filter((d) => cuenta[d.clave]).map((d) => ({ clave: d.clave, nombre: d.nombre, renglones: cuenta[d.clave] })),
            sin,
        };
    }

    /* El bloque «Por dirección del entrenamiento» para debajo de la tabla de
       tiempo. `describir` y `duracion` son los de TiempoSecciones, para que
       las secciones de aparte se nombren igual que arriba. Devuelve null si
       no hay nada que repartir. */
    function bloqueReparto(filas, describir, duracion, propio) {
        const r = reparto(filas);
        if (!r.direcciones.length) return null;

        const caja = document.createElement("div");
        caja.className = "direcciones-reparto mt-6";
        const h = document.createElement("h4");
        h.className = "text-sm font-semibold text-brand-700 dark:text-brand-200";
        h.textContent = "Por dirección del entrenamiento";
        const sub = document.createElement("p");
        sub.className = "text-xs text-brand-450 dark:text-brand-350 mt-1 mb-2";
        sub.textContent = (propio ? "Cómo se reparte tu trabajo" : "Cómo se reparte su trabajo")
            + " entre aperturas, medio juego, finales, ejercicios y lo demás, como lo planifica la escuela cubana.";
        caja.append(h, sub);

        const tabla = document.createElement("table");
        tabla.className = "w-full text-sm";
        const cap = document.createElement("caption");
        cap.className = "sr-only";
        cap.textContent = "Tiempo por dirección del entrenamiento";
        const thead = document.createElement("thead");
        thead.innerHTML = '<tr class="text-left text-xs text-brand-450 dark:text-brand-350">'
            + '<th scope="col" class="py-2 pr-3 font-semibold">Dirección</th>'
            + '<th scope="col" class="py-2 pr-3 font-semibold">Parte del tiempo</th>'
            + '<th scope="col" class="py-2 font-semibold">Tiempo</th></tr>';
        const tbody = document.createElement("tbody");
        r.direcciones.forEach((d) => {
            const tr = document.createElement("tr");
            tr.className = "border-t border-brand-50 dark:border-brand-800/60";
            tr.dataset.direccion = d.clave;
            const th = document.createElement("th");
            th.scope = "row";
            th.className = "py-2 pr-3 text-left font-medium text-brand-700 dark:text-brand-200";
            th.textContent = d.nombre;
            // El porcentaje va escrito y con barra: la barra es aria-hidden.
            const tdP = document.createElement("td");
            tdP.className = "py-2 pr-3 w-2/5";
            const fila = document.createElement("div");
            fila.className = "flex items-center gap-2";
            const pista = document.createElement("div");
            pista.className = "flex-1 h-2 rounded-full bg-brand-50 dark:bg-brand-800 overflow-hidden";
            pista.setAttribute("aria-hidden", "true");
            const barra = document.createElement("div");
            barra.className = "h-full rounded-full bg-accent-500";
            barra.style.width = Math.max(2, d.pct) + "%";
            pista.appendChild(barra);
            const pct = document.createElement("span");
            pct.className = "direccion-pct whitespace-nowrap font-semibold text-brand-700 dark:text-brand-200 tabular-nums";
            pct.textContent = d.pct + " %";
            fila.append(pista, pct);
            tdP.appendChild(fila);
            const tdT = document.createElement("td");
            tdT.className = "direccion-min py-2 text-brand-500 dark:text-brand-300 whitespace-nowrap";
            tdT.textContent = duracion(d.minutos);
            tr.append(th, tdP, tdT);
            tbody.appendChild(tr);
        });
        tabla.append(cap, thead, tbody);
        caja.appendChild(tabla);

        /* Lo que quedó afuera, con nombre: si no, un alumno con mucha clase en
           vivo parecería entrenar poco. */
        const mezcla = r.aparte.filter((a) => !a.control && a.minutos >= 0.5);
        const pruebas = r.aparte.filter((a) => a.control && a.minutos >= 0.5);
        const lista = (xs) => xs.map((a) => describir(a.seccion).nombre + " (" + duracion(a.minutos) + ")").join(", ");
        if (mezcla.length || pruebas.length) {
            const nota = document.createElement("p");
            nota.className = "direcciones-aparte text-xs text-brand-450 dark:text-brand-350 mt-3";
            const partes = [];
            if (mezcla.length) partes.push("Mezclan varias direcciones y no entran en el reparto: " + lista(mezcla) + ".");
            if (pruebas.length) partes.push("Son pruebas, no entrenamiento: " + lista(pruebas) + ".");
            nota.textContent = partes.join(" ");
            caja.appendChild(nota);
        }
        return caja;
    }

    return { DIRECCIONES, CONTROL, POR_SECCION, POR_HERRAMIENTA, POR_RECORTE, POR_GRUPO_DE_ESTUDIO,
             direccion, deSeccion, deRenglon, reparto, contarRenglones, bloqueReparto };
})();

/*! rev bfb5bbb0d2d82f9f */
