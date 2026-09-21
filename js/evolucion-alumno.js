/* Cómo viene un alumno EN EL TIEMPO, no cuánto lleva acumulado.
 *
 * Informes contaba todo desde siempre. Eso dice cuánto hizo, pero no contesta
 * la pregunta del entrenador —"¿está mejor que hace tres meses?"— ni la de la
 * casa. Un total que solo sube se ve bien incluso cuando el alumno lleva un mes
 * sin entrar: el número de ayer sigue ahí.
 *
 * Los números salen de `public.evolucion_alumno()`, que es SECURITY INVOKER
 * como el resto de las de informes: la RLS decide quién puede pedir la curva de
 * quién, y de regalo un alumno que la llama recibe solo la suya — así esta
 * misma pieza pinta las dos pantallas y la cuenta no queda escrita dos veces.
 *
 * Lo que se dibuja acá:
 *
 *   1. La curva de ejercicios por semana, con las semanas VACÍAS incluidas.
 *      Esa rejilla completa la arma la función en la base a propósito: si las
 *      semanas sin nada no vinieran, el gráfico pegaría dos semanas separadas
 *      por un mes en blanco y dibujaría una línea que sube, cuando lo que pasó
 *      fue que el alumno no entró. No daría ningún error y diría lo contrario
 *      de lo que pasó.
 *
 *   2. El veredicto ESCRITO encima ("Va subiendo · 406 ejercicios este mes,
 *      0 el anterior"). Es lo primero y muchas veces lo único que se lee, la
 *      misma decisión que la franja del informe a la casa. El gráfico es el
 *      respaldo, no el mensaje.
 *
 *   3. La comparación de dos diagnósticos, área por área — lo único que mide
 *      si SABE más, no si trabajó más.
 *
 * El gráfico va con barras de CSS y no con un SVG, como el resto del sitio
 * (`barraHTML` de informes.html): así el Modo Adaptado agranda el texto solo y
 * no hay que pelearse con el viewBox. Y va `aria-hidden` con su tabla debajo:
 * doce columnas enfocables serían doce paradas de tabulador para leer lo que la
 * tabla dice mejor.
 */
window.EvolucionAlumno = (function () {

    /* Cuántas semanas se piden y cuántas se comparan contra cuántas. Los dos
       números viven juntos porque el segundo tiene que caber dos veces en el
       primero: comparar las últimas 4 contra las 4 anteriores pide 8 como
       mínimo, y 12 deja además un mes de contexto a la vista. */
    const SEMANAS = 12;
    const BLOQUE = 4;

    const NOMBRE_MES = ["ene", "feb", "mar", "abr", "may", "jun",
                        "jul", "ago", "sep", "oct", "nov", "dic"];

    /* La fecha viene "2026-09-14" y se parte a mano: `new Date("2026-09-14")`
       la lee como UTC y en Costa Rica muestra el día anterior — la semana del
       14 se rotularía "13 sep". */
    function fechaCorta(iso) {
        const p = String(iso || "").split("-");
        if (p.length !== 3) return String(iso || "");
        return Number(p[2]) + " " + NOMBRE_MES[Number(p[1]) - 1];
    }

    function duracion(min) {
        const m = Math.max(0, Math.round(min || 0));
        if (m < 60) return m + " min";
        const h = Math.floor(m / 60);
        return h + " h" + (m % 60 ? " " + (m % 60) + " min" : "");
    }

    async function traer(sb, alumnoId, semanas) {
        const { data, error } = await sb.rpc("evolucion_alumno", {
            p_alumno: alumnoId || null,
            p_semanas: semanas || SEMANAS,
        });
        if (error) throw error;
        return data || [];
    }

    /* El veredicto: las últimas `BLOQUE` semanas contra las `BLOQUE` anteriores.
       No es un porcentaje a secas — de 0 a 40 no es "+∞%", es "empezó". */
    function resumir(filas, bloque) {
        const n = bloque || BLOQUE;
        const f = filas || [];
        const ahora = f.slice(-n);
        const antes = f.slice(-2 * n, -n);
        const suma = (lista, campo) => lista.reduce((t, x) => t + (Number(x[campo]) || 0), 0);

        const r = {
            semanas: n,
            ejercicios: suma(ahora, "ejercicios"),
            ejerciciosAntes: suma(antes, "ejercicios"),
            dias: suma(ahora, "dias_activos"),
            diasAntes: suma(antes, "dias_activos"),
            minutos: suma(ahora, "minutos"),
            minutosAntes: suma(antes, "minutos"),
            hayAntes: antes.length > 0,
        };

        // El orden de las reglas importa y va escrito, igual que en el informe a
        // la casa: "no entró" manda sobre todo lo demás, porque es lo único que
        // pide hacer algo hoy.
        if (!r.ejercicios && !r.ejerciciosAntes) {
            r.tendencia = "sin datos";
            r.titulo = "Todavía no hay con qué comparar";
            r.detalle = "No ha entrenado en las últimas " + (2 * n) + " semanas.";
        } else if (!r.ejercicios) {
            r.tendencia = "parado";
            r.titulo = "Dejó de entrenar";
            r.detalle = "Nada en las últimas " + n + " semanas; antes llevaba "
                      + r.ejerciciosAntes + " ejercicios.";
        } else if (!r.ejerciciosAntes) {
            r.tendencia = "empezo";
            r.titulo = "Empezó a entrenar";
            r.detalle = r.ejercicios + " ejercicios en " + r.dias
                      + (r.dias === 1 ? " día" : " días") + ", y antes ninguno.";
        } else {
            const cambio = Math.round(((r.ejercicios - r.ejerciciosAntes) / r.ejerciciosAntes) * 100);
            r.cambio = cambio;
            // Un ±15% de una semana a otra es el vaivén normal de cualquiera:
            // llamarlo "bajó" haría saltar la alarma cada mes sin motivo.
            r.tendencia = cambio >= 15 ? "sube" : cambio <= -15 ? "baja" : "igual";
            r.titulo = r.tendencia === "sube" ? "Va subiendo"
                     : r.tendencia === "baja" ? "Va bajando"
                     : "Se mantiene";
            r.detalle = r.ejercicios + " ejercicios este último mes contra "
                      + r.ejerciciosAntes + " el anterior ("
                      + (cambio > 0 ? "+" : "") + cambio + "%).";
        }
        return r;
    }

    /* El color de la franja nunca va solo: al lado está el título escrito y
       debajo los números. Es la misma regla de los gráficos del diagnóstico y
       de las barras del plan. */
    const ESTILO = {
        sube:  { emoji: "📈", caja: "bg-green-50 dark:bg-green-950/30", texto: "text-green-700 dark:text-green-400" },
        igual: { emoji: "➡️", caja: "bg-brand-50 dark:bg-brand-950",    texto: "text-brand-600 dark:text-brand-300" },
        baja:  { emoji: "📉", caja: "bg-accent-50 dark:bg-accent-700/20", texto: "text-accent-700 dark:text-accent-400" },
        parado:{ emoji: "⏸️", caja: "bg-red-50 dark:bg-red-950/30",     texto: "text-red-700 dark:text-red-400" },
        empezo:{ emoji: "🌱", caja: "bg-green-50 dark:bg-green-950/30", texto: "text-green-700 dark:text-green-400" },
        "sin datos": { emoji: "·", caja: "bg-brand-50 dark:bg-brand-950", texto: "text-brand-450 dark:text-brand-350" },
    };

    function escapar(s) {
        return String(s === null || s === undefined ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function veredictoHTML(r) {
        const e = ESTILO[r.tendencia] || ESTILO["sin datos"];
        return `<div class="${e.caja} rounded-xl p-4 mb-4">
            <p class="font-semibold ${e.texto}"><span aria-hidden="true">${e.emoji}</span> ${escapar(r.titulo)}</p>
            <p class="text-sm text-brand-600 dark:text-brand-300 mt-0.5">${escapar(r.detalle)}</p>
        </div>`;
    }

    /* Las columnas. Una sola serie, así que un solo color para todas: pintar
       cada barra más oscura cuanto más alta sería codificar el alto dos veces y
       gastar el color en algo que la barra ya dice.

       El valor NO se escribe encima de cada una —doce números pegados no los lee
       nadie— sino solo en la más alta y en la última, que son las dos que se
       miran. El resto lo cuenta la tabla de abajo. */
    function graficoHTML(filas) {
        const f = filas || [];
        const tope = Math.max.apply(null, f.map((x) => Number(x.ejercicios) || 0).concat([1]));
        const ultima = f.length - 1;
        const masAlta = f.reduce((mejor, x, i) =>
            (Number(x.ejercicios) || 0) > (Number(f[mejor].ejercicios) || 0) ? i : mejor, 0);

        const columnas = f.map((x, i) => {
            const v = Number(x.ejercicios) || 0;
            // Una semana en cero se queda en cero: darle un mínimo visible la
            // haría parecer una semana con algo, que es justo lo contrario.
            const alto = v ? Math.max(2, Math.round((v / tope) * 100)) : 0;
            const rotulo = (i === masAlta && v) || (i === ultima && v) ? v : "";
            // `data-barra` marca la barra de verdad y no la pista que la
            // contiene: al comprobar que una semana vacía no dibuja nada hay
            // que medir la de adentro, y las dos son "un div dentro de un div".
            return `<div class="flex-1 flex flex-col justify-end items-center gap-1 min-w-0" data-semana="${escapar(x.semana)}">
                <span class="text-[0.625rem] leading-none font-semibold text-brand-600 dark:text-brand-300 h-3">${rotulo}</span>
                <div class="w-full flex flex-col justify-end" style="height:5rem">
                    <div class="w-full bg-accent-500 rounded-t-[4px]" data-barra="${v}" style="height:${alto}%"></div>
                </div>
            </div>`;
        }).join("");

        /* Las columnas NO llevan pista de fondo, y no es un olvido: con doce
           bloques grises de la altura del gráfico, cuatro semanas con algo se
           leen como un gráfico casi lleno. Lo que marca el suelo es una línea
           de base hairline —recesiva, sólida, nunca punteada— y el resto lo
           dice el rótulo de la más alta. Esto solo se ve mirando la pantalla;
           ninguna comprobación lo iba a encontrar. */
        return `<div class="mb-1" aria-hidden="true">
            <div class="flex items-end gap-0.5 border-b border-brand-200 dark:border-brand-700">${columnas}</div>
            <div class="flex gap-0.5 mt-1">${f.map((x) => `<span class="flex-1 min-w-0 text-[0.625rem] leading-none text-brand-450 dark:text-brand-350 truncate text-center">${escapar(fechaCorta(x.semana))}</span>`).join("")}</div>
        </div>
        <p class="text-xs text-brand-450 dark:text-brand-350 mb-3">Ejercicios por semana · la más alta fue de ${tope}.</p>`;
    }

    /* La tabla no es un extra: es cómo se lee esto con lector de pantalla y en
       Modo Adaptado, y por eso el gráfico de arriba va `aria-hidden`. Va dentro
       de un <details> para no ocupar media pantalla a quien mira el dibujo. */
    function tablaHTML(filas) {
        const f = filas || [];
        const filasHTML = f.map((x) => `<tr class="border-b border-brand-100 dark:border-brand-800">
            <th scope="row" class="text-left font-normal py-1 pr-3 text-brand-600 dark:text-brand-300">Semana del ${escapar(fechaCorta(x.semana))}</th>
            <td class="py-1 pr-3 text-right">${Number(x.ejercicios) || 0}</td>
            <td class="py-1 pr-3 text-right">${Number(x.dias_activos) || 0}</td>
            <td class="py-1 text-right">${escapar(duracion(x.minutos))}</td>
        </tr>`).join("");

        return `<details class="mb-2">
            <summary class="text-sm text-brand-500 dark:text-brand-300 cursor-pointer">Ver los números semana por semana</summary>
            <table class="w-full text-xs mt-2">
                <caption class="sr-only">Ejercicios, días de práctica y tiempo, semana por semana</caption>
                <thead><tr class="border-b border-brand-200 dark:border-brand-700">
                    <th scope="col" class="text-left font-semibold py-1 pr-3 text-brand-500 dark:text-brand-300">Semana</th>
                    <th scope="col" class="text-right font-semibold py-1 pr-3 text-brand-500 dark:text-brand-300">Ejercicios</th>
                    <th scope="col" class="text-right font-semibold py-1 pr-3 text-brand-500 dark:text-brand-300">Días</th>
                    <th scope="col" class="text-right font-semibold py-1 text-brand-500 dark:text-brand-300">Tiempo</th>
                </tr></thead>
                <tbody>${filasHTML}</tbody>
            </table>
        </details>`;
    }

    /* ---- Los dos diagnósticos -------------------------------------------
     *
     * Lo de arriba mide si TRABAJÓ; esto mide si SABE más, que no es lo mismo:
     * se puede resolver trescientos ejercicios de lo que uno ya sabía.
     *
     * Recibe los dos resúmenes ya calculados por `PlanEntrenamiento.resumir()`,
     * que es quien sabe de áreas y porcentajes — reimplementarlo acá daría un
     * segundo criterio de nivel que puede decir otra cosa que el resto del
     * informe.
     */
    function compararDiagnosticos(antes, despues) {
        // `porArea` es como lo llama PlanEntrenamiento.resumir(); una prueba
        // vieja puede no traer alguna área (Maestría es la novena y llegó
        // después), así que se cruzan por id y lo que falte se dice.
        const mapa = {};
        ((antes && antes.porArea) || []).forEach((a) => {
            mapa[a.id] = { id: a.id, nombre: a.nombre, antes: a.porcentaje };
        });
        ((despues && despues.porArea) || []).forEach((a) => {
            mapa[a.id] = Object.assign(mapa[a.id] || { id: a.id, nombre: a.nombre },
                                       { nombre: a.nombre, despues: a.porcentaje });
        });
        return Object.keys(mapa).map((k) => {
            const a = mapa[k];
            const tiene = typeof a.antes === "number" && typeof a.despues === "number";
            return {
                id: a.id, nombre: a.nombre,
                antes: a.antes, despues: a.despues,
                delta: tiene ? a.despues - a.antes : null,
            };
        }).sort((x, y) => (y.delta === null ? -1 : x.delta === null ? 1 : y.delta - x.delta));
    }

    /* Barra divergente: sube a la derecha, baja a la izquierda, con el cero en
       el medio. El color dice bien/mal —es lo que de verdad significa— y por eso
       cada renglón lleva ADEMÁS la flecha y los puntos escritos: con daltonismo,
       verde y ámbar no se distinguen (está medido, en el diagnóstico de clase). */
    function comparacionHTML(lista, fechaAntes, fechaDespues) {
        const filas = lista.map((a) => {
            const d = a.delta;
            const sinDato = d === null;
            // ±5 puntos en una prueba sorteada es ruido, no aprendizaje.
            const clase = sinDato ? "bg-brand-300 dark:bg-brand-600"
                        : d >= 5 ? "bg-green-600" : d <= -5 ? "bg-red-500" : "bg-brand-300 dark:bg-brand-600";
            const flecha = sinDato ? "" : d >= 5 ? "▲" : d <= -5 ? "▼" : "=";
            const texto = sinDato ? "sin dato en los dos"
                        : (d > 0 ? "+" : "") + d + " puntos (" + a.antes + "% → " + a.despues + "%)";
            const ancho = sinDato ? 0 : Math.min(50, Math.abs(d) / 2);
            const lado = sinDato || d === 0 ? "" : d > 0
                ? `left:50%;width:${ancho}%`
                : `right:50%;width:${ancho}%`;
            return `<div class="grid grid-cols-[9rem_1fr] gap-2 items-center">
                <span class="text-xs text-brand-600 dark:text-brand-300 truncate" title="${escapar(a.nombre)}">${escapar(a.nombre)}</span>
                <div>
                    <div class="relative w-full h-2.5 bg-brand-100 dark:bg-brand-800 rounded-sm">
                        <span class="absolute inset-y-0 left-1/2 w-px bg-brand-300 dark:bg-brand-600"></span>
                        ${lado ? `<span class="absolute inset-y-0 ${clase} rounded-sm" style="${lado}"></span>` : ""}
                    </div>
                    <span class="text-xs text-brand-500 dark:text-brand-300"><span aria-hidden="true">${flecha}</span> ${escapar(texto)}</span>
                </div>
            </div>`;
        }).join("");

        return `<h3 class="font-serif font-bold text-brand-800 dark:text-white mb-1">Comparado con su diagnóstico anterior</h3>
            <p class="text-xs text-brand-450 dark:text-brand-350 mb-3">Del ${escapar(fechaAntes)} al ${escapar(fechaDespues)}. Son dos pruebas distintas —las preguntas se sortean—, así que menos de 5 puntos de diferencia no dice nada.</p>
            <div class="space-y-2">${filas}</div>`;
    }

    /* Monta el bloque entero. Devuelve cuántas semanas pintó, para que la página
       pueda esconderlo si no hay nada — la misma decisión de la bitácora: un
       bloque que diga "todavía no hay datos" es ruido en todas las visitas menos
       una. Y si la consulta FALLA se dice, porque una curva vacía y una que no
       se pudo leer se ven igual y son cosas muy distintas. */
    async function montar(sb, contenedor, alumnoId, opciones) {
        const o = opciones || {};
        const el = typeof contenedor === "string" ? document.getElementById(contenedor) : contenedor;
        if (!el) return 0;
        el.innerHTML = '<p class="text-sm text-brand-450 dark:text-brand-350">Cargando…</p>';

        let filas;
        try {
            filas = await traer(sb, alumnoId, o.semanas || SEMANAS);
        } catch (e) {
            el.innerHTML = '<p class="text-sm text-red-700 dark:text-red-400">No se pudo leer la evolución: '
                         + escapar(e.message) + "</p>";
            return 0;
        }

        const hayAlgo = filas.some((x) => (Number(x.ejercicios) || 0) > 0);
        if (!hayAlgo) {
            el.innerHTML = '<p class="text-sm text-brand-450 dark:text-brand-350">'
                + escapar(o.propio
                    ? "Cuando lleves un par de semanas entrenando, acá vas a ver cómo vienes."
                    : "Todavía no ha entrenado en las últimas semanas, así que no hay curva que mostrar.")
                + "</p>";
            return 0;
        }

        const r = resumir(filas, o.bloque || BLOQUE);
        el.innerHTML = veredictoHTML(r) + graficoHTML(filas) + tablaHTML(filas)
                     + (o.comparacion || "");
        return filas.length;
    }

    return {
        SEMANAS, BLOQUE,
        traer, resumir, montar,
        veredictoHTML, graficoHTML, tablaHTML,
        compararDiagnosticos, comparacionHTML,
        _fechaCorta: fechaCorta, _duracion: duracion,
    };
})();
