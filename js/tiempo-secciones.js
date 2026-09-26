/* En qué se fue el tiempo de un alumno, sección por sección.
 *
 * Informes decía UN total ("3 h en la plataforma") y, aparte, cuántos
 * ejercicios de cada cosa. No decía cuánto de ese rato fue un curso, cuánto
 * Visualización o cuánto una partida — y lo que no tiene ejercicios que contar
 * (un curso, una ficha de Estudio) no salía en ninguna parte, como si no lo
 * hubiera hecho.
 *
 * Los números salen de `public.tiempo_por_seccion()`, que es SECURITY INVOKER
 * como el resto de las de informes: la RLS decide quién puede pedir las
 * secciones de quién, y un alumno que la llama recibe solo las suyas. Así esta
 * misma pieza pinta las dos pantallas —la del profesor y la del propio
 * alumno— y la cuenta no queda escrita dos veces. El correo a la casa lee la
 * misma función (dentro de `informe_de_alumno()`).
 *
 * Una sección con ejercicios dice cuántos; una de contenido dice solo el
 * tiempo, que es lo único que se puede decir de estudiar un curso.
 *
 * Los nombres de sección están escritos también en
 * supabase/functions/informes-encargados/informe-html.ts (otro tiempo de
 * ejecución, que no puede leer este archivo). Si se separan, el correo nombra
 * una sección que la pantalla no conoce — por eso los compara
 * herramientas/verificar-tiempo-secciones.js.
 */
window.TiempoSecciones = (function () {

    /* Cómo se llama cada sección y qué cuenta. `unidad` es [singular, plural];
       sin unidad, la sección es de contenido y solo lleva tiempo. */
    const SECCIONES = {
        "clase":                { nombre: "Clases en vivo",        emoji: "🏫" },
        "4x4":                  { nombre: "Ejercicios 4×4",        emoji: "🧩", unidad: ["ejercicio", "ejercicios"] },
        "aprender":             { nombre: "Aprender",              emoji: "🎓", unidad: ["lección", "lecciones"] },
        "coordenadas":          { nombre: "Coordenadas",           emoji: "⚡", unidad: ["ronda", "rondas"] },
        "practicar":            { nombre: "Practicar",             emoji: "🏆", unidad: ["serie", "series"] },
        "desafios":             { nombre: "Desafíos",              emoji: "🔥", unidad: ["serie", "series"] },
        "mates":                { nombre: "Mates",                 emoji: "♚", unidad: ["mate", "mates"] },
        "temas":                { nombre: "Ejercicios por tema",   emoji: "🎯", unidad: ["ejercicio", "ejercicios"] },
        "concentracion":        { nombre: "Concentración",         emoji: "🧠", unidad: ["ejercicio", "ejercicios"] },
        "diagnostico":          { nombre: "Diagnóstico de nivel",  emoji: "🧭", unidad: ["prueba", "pruebas"] },
        "aperturas":            { nombre: "Aperturas y celadas",   emoji: "📖", unidad: ["línea", "líneas"] },
        "confites":             { nombre: "Confites del caballo",  emoji: "🍬", unidad: ["recorrido", "recorridos"] },
        "ilumina":              { nombre: "Ilumina el tablero",    emoji: "💡", unidad: ["nivel", "niveles"] },
        "visualizacion":        { nombre: "Visualización",         emoji: "👁️", unidad: ["ejercicio", "ejercicios"] },
        "estudio":              { nombre: "Estudio (fichas)",      emoji: "📚" },
        "precision-posicional": { nombre: "Precisión posicional",  emoji: "🧭" },
        "sonar":                { nombre: "El Sonar",              emoji: "🔊" },
        "tipos":                { nombre: "Tipos de entrenamiento", emoji: "🧠" },
        "racha":                { nombre: "Racha táctica",         emoji: "⚔️" },
        "bot":                  { nombre: "El bot de Oscar",       emoji: "🤖" },
        "logros":               { nombre: "Logros",                emoji: "🏅" },
        "partidas":             { nombre: "Partidas",              emoji: "♟️" },
        "torneos":              { nombre: "Torneos",               emoji: "🏆" },
        "examen":               { nombre: "Exámenes",              emoji: "📝" },
    };

    /* Los periodos que se ofrecen. "Desde siempre" es el de las tarjetas de
       arriba, así que es el que se abre: dos números del mismo alumno que no
       cuadran se leen como un error aunque midan cosas distintas. */
    const PERIODOS = [
        { id: "siempre", texto: "Desde siempre", dias: null },
        { id: "30", texto: "Últimos 30 días", dias: 30 },
        { id: "7", texto: "Últimos 7 días", dias: 7 },
    ];

    let catalogo = null;
    async function titulosDeCursos() {
        if (catalogo) return catalogo;
        catalogo = {};
        try {
            const r = await fetch(new URL("herramientas/cursos/catalogo.json", document.baseURI));
            if (r.ok) ((await r.json()).cursos || []).forEach((c) => { catalogo[c.slug] = c.titulo; });
        } catch (e) { /* sin catálogo, el curso se nombra por su dirección */ }
        return catalogo;
    }

    function nombreDeSlug(slug) {
        const t = String(slug || "").replace(/-/g, " ");
        return t.charAt(0).toUpperCase() + t.slice(1);
    }

    /* Nombre, emoji y unidad de una sección. Un curso es "curso:<slug>" (lo
       arma js/tiempo-plataforma.js con el nombre del archivo); una sección que
       no está en la tabla se enseña con su clave, no se esconde: se hizo. */
    function describir(seccion, titulos) {
        const s = String(seccion || "");
        if (s.startsWith("curso:")) {
            const slug = s.slice(6);
            return { nombre: "Curso: " + ((titulos || {})[slug] || nombreDeSlug(slug)), emoji: "🏛️", curso: true };
        }
        return SECCIONES[s] || { nombre: nombreDeSlug(s), emoji: "•" };
    }

    function duracion(min) {
        const m = Math.round(Number(min) || 0);
        if (m < 1) return "menos de 1 min";
        if (m < 60) return m + " min";
        const h = Math.floor(m / 60), mm = m % 60;
        return h + " h" + (mm ? " " + mm + " min" : "");
    }

    /* Lo que se hizo, en palabras. Sin unidad es contenido: se dice que ahí
       se cuenta el tiempo y no se inventa un "0 ejercicios". */
    function queHizo(d, ejercicios) {
        if (d.curso) return "Estudió el contenido";
        if (!d.unidad) return "—";
        const n = Number(ejercicios) || 0;
        return n + " " + (n === 1 ? d.unidad[0] : d.unidad[1]);
    }

    /* Las filas que vale la pena enseñar: una sección con menos de medio minuto
       y nada hecho es alguien que pasó por la página, no que la usó. */
    function filasUtiles(filas) {
        return (filas || []).filter((f) => (Number(f.minutos) || 0) >= 0.5 || (Number(f.ejercicios) || 0) > 0);
    }

    function desde(dias) {
        if (!dias) return null;
        return new Date(Date.now() - dias * 86400000).toISOString();
    }

    async function pedir(sb, studentId, dias) {
        const args = { p_alumno: studentId };
        const d = desde(dias);
        if (d) args.p_desde = d;
        return sb.rpc("tiempo_por_seccion", args);
    }

    function pintarTabla(cuerpo, filas, titulos, propio) {
        cuerpo.innerHTML = "";
        if (!filas.length) {
            const p = document.createElement("p");
            p.className = "text-sm text-brand-450 dark:text-brand-350";
            p.textContent = propio ? "En este periodo no hay tiempo registrado." : "En este periodo no tiene tiempo registrado.";
            cuerpo.appendChild(p);
            return;
        }
        const max = Math.max(...filas.map((f) => Number(f.minutos) || 0), 1);
        const tabla = document.createElement("table");
        tabla.className = "w-full text-sm";
        const cap = document.createElement("caption");
        cap.className = "sr-only";
        cap.textContent = "Tiempo y ejercicios por sección";
        const thead = document.createElement("thead");
        thead.innerHTML = '<tr class="text-left text-xs text-brand-450 dark:text-brand-350">'
            + '<th scope="col" class="py-2 pr-3 font-semibold">Sección</th>'
            + '<th scope="col" class="py-2 pr-3 font-semibold">Tiempo</th>'
            + '<th scope="col" class="py-2 font-semibold">Qué hizo</th></tr>';
        const tbody = document.createElement("tbody");
        filas.forEach((f) => {
            const d = describir(f.seccion, titulos);
            const tr = document.createElement("tr");
            tr.className = "border-t border-brand-50 dark:border-brand-800/60";
            tr.dataset.seccion = f.seccion;

            const th = document.createElement("th");
            th.scope = "row";
            th.className = "py-2 pr-3 text-left font-medium text-brand-700 dark:text-brand-200";
            const ic = document.createElement("span");
            ic.setAttribute("aria-hidden", "true");
            ic.textContent = d.emoji + " ";
            th.append(ic, document.createTextNode(d.nombre));

            // El tiempo va escrito Y con una barra: la barra deja comparar de
            // un vistazo, el número es lo que se lee. La barra es aria-hidden,
            // el número dice lo mismo.
            const tdT = document.createElement("td");
            tdT.className = "py-2 pr-3 w-2/5";
            const caja = document.createElement("div");
            caja.className = "flex items-center gap-2";
            const pista = document.createElement("div");
            pista.className = "flex-1 h-2 rounded-full bg-brand-50 dark:bg-brand-800 overflow-hidden";
            pista.setAttribute("aria-hidden", "true");
            const barra = document.createElement("div");
            barra.className = "h-full rounded-full bg-accent-500";
            barra.style.width = Math.max(2, Math.round(((Number(f.minutos) || 0) / max) * 100)) + "%";
            pista.appendChild(barra);
            const num = document.createElement("span");
            num.className = "tiempo-min whitespace-nowrap font-semibold text-brand-700 dark:text-brand-200";
            num.textContent = duracion(f.minutos);
            caja.append(pista, num);
            tdT.appendChild(caja);

            const tdH = document.createElement("td");
            tdH.className = "tiempo-hizo py-2 text-brand-500 dark:text-brand-300";
            tdH.textContent = queHizo(d, f.ejercicios);

            tr.append(th, tdT, tdH);
            tbody.appendChild(tr);
        });
        tabla.append(cap, thead, tbody);
        cuerpo.appendChild(tabla);

        const nota = document.createElement("p");
        nota.className = "text-xs text-brand-450 dark:text-brand-350 mt-3";
        nota.textContent = "El tiempo cuenta solo mientras hay actividad: si pasa un minuto sin tocar nada, "
            + "o la pestaña queda de fondo, deja de contar. Con dos secciones abiertas a la vez, "
            + "la suma puede dar un poco más que el total de arriba.";
        cuerpo.appendChild(nota);
    }

    /* Monta el bloque en `contenedorId`. Devuelve cuántas secciones tuvo el
       periodo que abre (el de siempre), para que la página esconda el panel
       entero cuando no hay nada — un "todavía no hay datos" es ruido en todas
       las visitas menos una. Si la consulta FALLA lo dice y devuelve 1: una
       tabla vacía y una que no se pudo leer se ven igual y no son lo mismo. */
    async function montar(sb, contenedorId, studentId, opciones) {
        const propio = !!(opciones && opciones.propio);
        const cont = document.getElementById(contenedorId);
        if (!cont) return 0;
        cont.innerHTML = "";

        const grupo = document.createElement("div");
        grupo.className = "flex flex-wrap gap-2 mb-4";
        grupo.setAttribute("role", "group");
        grupo.setAttribute("aria-label", "Periodo");
        const cuerpo = document.createElement("div");
        cuerpo.setAttribute("aria-live", "polite");
        cont.append(grupo, cuerpo);

        const titulos = await titulosDeCursos();
        let peticion = 0;

        async function cargar(periodo) {
            const mia = ++peticion;
            grupo.querySelectorAll("button").forEach((b) => {
                const activo = b.dataset.periodo === periodo.id;
                b.setAttribute("aria-pressed", activo ? "true" : "false");
                b.className = "text-xs font-semibold px-3 py-1.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
                    + (activo ? "bg-brand-800 text-white dark:bg-accent-500 dark:text-brand-900"
                              : "bg-brand-50 text-brand-600 hover:bg-brand-100 dark:bg-brand-800 dark:text-brand-300 dark:hover:bg-brand-700");
            });
            const { data, error } = await pedir(sb, studentId, periodo.dias);
            // Una respuesta que llega tarde no pinta el periodo que ya no está.
            if (mia !== peticion) return null;
            if (error) {
                cuerpo.innerHTML = "";
                const p = document.createElement("p");
                p.className = "text-sm text-red-600 dark:text-red-400";
                p.textContent = "No se pudo leer en qué se fue el tiempo. Vuelve a intentarlo en un rato.";
                cuerpo.appendChild(p);
                return null;
            }
            const filas = filasUtiles(data);
            pintarTabla(cuerpo, filas, titulos, propio);
            return filas;
        }

        PERIODOS.forEach((p) => {
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.periodo = p.id;
            b.textContent = p.texto;
            b.addEventListener("click", () => cargar(p));
            grupo.appendChild(b);
        });

        const filas = await cargar(PERIODOS[0]);
        return filas === null ? 1 : filas.length;
    }

    return { SECCIONES, describir, duracion, filasUtiles, montar };
})();
