/* Los niveles de la academia (Iniciación, Básico, Intermedio…) y en cuál va
   cada alumno: el «itinerario de aprendizaje» de Chessgora. Ver «Los niveles
   de la academia» en docs/decisiones/paneles.md.

   - En academias.html, quien supervisa la academia (o administra) arma la
     lista: `montarEditor()`. Se guarda ENTERA con set_niveles_academia(), que
     la deja exactamente como llega.
   - En el informe de un alumno, `montarFicha()` dice en qué nivel va y desde
     cuándo, con su historial; su profe (o quien administra) se lo cambia con
     poner_nivel_alumno(). El alumno ve el suyo, sin poder cambiarlo.
   - Quién ve y quién escribe lo decide la base (RLS y las dos funciones):
     acá solo no se ofrece lo que la base va a rechazar.
   - `validar()`, `actual()` y `fecha()` son puras: se prueban en Node. */
(function (raiz, fabrica) {
    "use strict";
    const api = fabrica();
    if (typeof module === "object" && module.exports) module.exports = api;
    else raiz.Niveles = api;
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const MAX = 30;
    const MAX_NOMBRE = 60;
    const MAX_DESC = 300;

    // Lo que la base va a rechazar, dicho antes y en palabras.
    function validar(lista) {
        if (!Array.isArray(lista)) return "Los niveles no se pudieron leer.";
        if (lista.length > MAX) return "Como mucho " + MAX + " niveles.";
        const vistos = new Set();
        for (let i = 0; i < lista.length; i++) {
            const n = String((lista[i] && lista[i].nombre) || "").trim();
            if (!n) return "El nivel " + (i + 1) + " no tiene nombre.";
            if (n.length > MAX_NOMBRE) return "El nombre del nivel " + (i + 1) + " es muy largo (" + MAX_NOMBRE + " letras como mucho).";
            const d = String((lista[i] && lista[i].descripcion) || "");
            if (d.length > MAX_DESC) return "La descripción del nivel " + (i + 1) + " es muy larga (" + MAX_DESC + " letras como mucho).";
            const k = n.toLocaleLowerCase("es");
            if (vistos.has(k)) return "Hay dos niveles que se llaman «" + n + "».";
            vistos.add(k);
        }
        return null;
    }

    // El nivel de hoy: la última fila del historial (llega de la más nueva a la más vieja).
    function actual(historial) {
        const h = (historial || [])[0];
        if (!h || !h.nivel_nombre) return null;
        return { id: h.nivel_id || null, nombre: h.nivel_nombre, desde: h.created_at, borrado: !h.nivel_id };
    }

    function fecha(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        return new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "long", year: "numeric" }).format(d);
    }

    function el(doc, tag, clases, texto) {
        const n = doc.createElement(tag);
        if (clases) n.className = clases;
        if (texto != null) n.textContent = texto;
        return n;
    }
    const BOTON = "text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50";
    const CAMPO = "w-full rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 px-3 py-2 text-sm text-brand-800 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

    /* ---------- El editor de la academia ---------- */
    function montarEditor(o) {
        const doc = o.document || document;
        const sb = o.sb || window.sb;
        const caja = o.caja;
        const lista = caja.querySelector("[data-niveles-lista]");
        const estado = caja.querySelector("[data-niveles-estado]");
        // Copias limpias de los botones: al abrir otra academia se vuelve a montar,
        // y los listeners de la anterior guardarían en la academia equivocada.
        const limpio = (sel) => { const v = caja.querySelector(sel); const n = v.cloneNode(true); v.replaceWith(n); return n; };
        const agregar = limpio("[data-niveles-agregar]");
        const guardar = limpio("[data-niveles-guardar]");
        const avisar = o.avisar || ((t) => { estado.textContent = t; });
        let niveles = [];
        let cambiado = false;

        function marcar() { cambiado = true; guardar.disabled = false; }

        function pintar(enfocar) {
            lista.replaceChildren();
            if (!niveles.length) {
                lista.appendChild(el(doc, "li", "text-sm text-brand-500 dark:text-brand-300", "Todavía no hay niveles. Agrega el primero (por ejemplo, «Iniciación»)."));
            }
            niveles.forEach((n, i) => {
                const li = el(doc, "li", "rounded-xl border border-brand-100 dark:border-brand-800 p-3 space-y-2");
                const fila = el(doc, "div", "flex flex-wrap items-end gap-2");
                const num = el(doc, "span", "text-sm font-bold text-brand-700 dark:text-brand-200 w-6 pb-2", (i + 1) + ".");
                const cNombre = el(doc, "div", "flex-1 min-w-[10rem]");
                const idN = "nivel-nombre-" + i;
                const lN = el(doc, "label", "block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1", "Nombre del nivel " + (i + 1));
                lN.htmlFor = idN;
                const iN = el(doc, "input", CAMPO);
                iN.id = idN; iN.maxLength = MAX_NOMBRE; iN.value = n.nombre || "";
                iN.addEventListener("input", () => { n.nombre = iN.value; marcar(); });
                cNombre.append(lN, iN);
                const sube = el(doc, "button", BOTON, "↑");
                sube.type = "button"; sube.disabled = i === 0;
                sube.setAttribute("aria-label", "Subir el nivel " + (i + 1));
                sube.addEventListener("click", () => { niveles.splice(i - 1, 0, niveles.splice(i, 1)[0]); marcar(); pintar("sube-" + (i - 1)); });
                sube.dataset.foco = "sube-" + i;
                const baja = el(doc, "button", BOTON, "↓");
                baja.type = "button"; baja.disabled = i === niveles.length - 1;
                baja.setAttribute("aria-label", "Bajar el nivel " + (i + 1));
                baja.addEventListener("click", () => { niveles.splice(i + 1, 0, niveles.splice(i, 1)[0]); marcar(); pintar("baja-" + (i + 1)); });
                baja.dataset.foco = "baja-" + i;
                const quita = el(doc, "button", BOTON, "Quitar");
                quita.type = "button";
                quita.setAttribute("aria-label", "Quitar el nivel " + (i + 1));
                quita.addEventListener("click", () => { niveles.splice(i, 1); marcar(); pintar("agregar"); });
                fila.append(num, cNombre, sube, baja, quita);
                const idD = "nivel-desc-" + i;
                const lD = el(doc, "label", "block text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1", "Qué se ve en este nivel (opcional)");
                lD.htmlFor = idD;
                const iD = el(doc, "input", CAMPO);
                iD.id = idD; iD.maxLength = MAX_DESC; iD.value = n.descripcion || "";
                iD.addEventListener("input", () => { n.descripcion = iD.value; marcar(); });
                const cD = el(doc, "div", "pl-8");
                cD.append(lD, iD);
                li.append(fila, cD);
                lista.appendChild(li);
            });
            if (enfocar === "agregar") agregar.focus();
            else if (enfocar) {
                const b = lista.querySelector('[data-foco="' + enfocar + '"]');
                if (b && !b.disabled) b.focus();
                else agregar.focus();
            }
        }

        async function cargar() {
            const { data, error } = await sb.from("niveles_academia").select("id, nombre, descripcion, orden")
                .eq("academia_id", o.academiaId).order("orden");
            if (error) { avisar("No se pudieron leer los niveles. Revisa tu conexión."); return; }
            niveles = (data || []).map((n) => ({ id: n.id, nombre: n.nombre, descripcion: n.descripcion || "" }));
            cambiado = false;
            guardar.disabled = true;
            pintar();
        }

        agregar.addEventListener("click", () => {
            niveles.push({ id: null, nombre: "", descripcion: "" });
            marcar();
            pintar();
            const ultimo = lista.querySelector("#nivel-nombre-" + (niveles.length - 1));
            if (ultimo) ultimo.focus();
        });

        guardar.addEventListener("click", async () => {
            const malo = validar(niveles);
            if (malo) { avisar(malo); return; }
            guardar.disabled = true;
            avisar("Guardando los niveles…");
            const { data, error } = await sb.rpc("set_niveles_academia", {
                p_academia: o.academiaId,
                p_niveles: niveles.map((n) => ({ id: n.id, nombre: n.nombre.trim(), descripcion: (n.descripcion || "").trim() || null })),
            });
            if (error) {
                guardar.disabled = false;
                avisar(error.code === "42501" ? "Solo quien supervisa esta academia o quien administra arma sus niveles."
                    : error.code === "23505" ? "Hay dos niveles con el mismo nombre."
                    : "No se pudieron guardar los niveles. Revisa tu conexión y vuelve a intentarlo.");
                return;
            }
            // Lo que manda es lo que devolvió la base, no lo que se pidió.
            niveles = (data || []).map((n) => ({ id: n.id, nombre: n.nombre, descripcion: n.descripcion || "" }));
            cambiado = false;
            pintar();
            avisar("Listo: " + niveles.length + (niveles.length === 1 ? " nivel guardado." : " niveles guardados."));
        });

        caja.hidden = false;
        cargar();
        return { cargar, cambiado: () => cambiado, niveles: () => niveles };
    }

    /* ---------- La ficha del alumno ---------- */
    async function montarFicha(o) {
        const doc = o.document || document;
        const sb = o.sb || window.sb;
        const caja = o.caja;
        caja.replaceChildren();
        caja.hidden = true;
        const [h, n, a] = await Promise.all([
            sb.from("niveles_alumno").select("nivel_id, nivel_nombre, created_at").eq("alumno_id", o.alumnoId)
                .order("created_at", { ascending: false }).limit(10),
            o.puedeCambiar ? sb.from("niveles_academia").select("id, nombre, orden, academia_id").order("orden") : Promise.resolve({ data: [] }),
            o.puedeCambiar ? sb.from("academias").select("id, nombre") : Promise.resolve({ data: [] }),
        ]);
        if (o.vigente && !o.vigente()) return null;   // se cambió de alumno mientras contestaba
        const historial = (h && !h.error && h.data) || [];
        const niveles = (n && !n.error && n.data) || [];
        const ahora = actual(historial);
        if (!ahora && !niveles.length) return null;   // ni nivel ni niveles que ponerle: no se ocupa espacio

        const linea = el(doc, "p", "text-sm text-brand-700 dark:text-brand-200");
        linea.dataset.nivelActual = "";
        linea.textContent = ahora
            ? "Nivel: " + ahora.nombre + (ahora.borrado ? " (ese nivel ya no existe)" : "") + " · desde el " + fecha(ahora.desde)
            : "Todavía sin nivel.";
        caja.appendChild(linea);

        if (o.puedeCambiar && niveles.length) {
            const nombres = {};
            ((a && a.data) || []).forEach((x) => { nombres[x.id] = x.nombre; });
            const varias = new Set(niveles.map((x) => x.academia_id)).size > 1;
            const fila = el(doc, "div", "flex flex-wrap items-center gap-2 mt-1");
            const idS = "nivel-elegir-" + o.alumnoId;
            const lab = el(doc, "label", "sr-only", "Cambiarle el nivel");
            lab.htmlFor = idS;
            const sel = el(doc, "select", "rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-800 px-2 py-1.5 text-sm text-brand-800 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
            sel.id = idS;
            sel.appendChild(new Option("Sin nivel", ""));
            niveles.forEach((x) => sel.appendChild(new Option((varias && nombres[x.academia_id] ? nombres[x.academia_id] + " · " : "") + x.nombre, x.id)));
            sel.value = (ahora && ahora.id) || "";
            const boton = el(doc, "button", BOTON, "Cambiar el nivel");
            boton.type = "button";
            const estado = el(doc, "span", "text-xs text-brand-500 dark:text-brand-300");
            estado.setAttribute("role", "status");
            boton.addEventListener("click", async () => {
                if (sel.value === ((ahora && ahora.id) || "")) { estado.textContent = "Ya está en ese nivel."; return; }
                boton.disabled = true;
                estado.textContent = "Guardando…";
                const { data, error } = await sb.rpc("poner_nivel_alumno", { p_alumno: o.alumnoId, p_nivel: sel.value || null });
                boton.disabled = false;
                if (error) {
                    estado.textContent = error.code === "42501" ? "Solo un profe de este alumno le pone el nivel."
                        : error.code === "22023" ? "Ese nivel no es de una academia de este alumno."
                        : "No se pudo guardar. Revisa tu conexión.";
                    return;
                }
                await montarFicha(o);   // lo que manda es lo que quedó en la base
                const r = (Array.isArray(data) ? data[0] : data) || {};
                const st = caja.querySelector('[role="status"]');
                if (st) st.textContent = r.nivel_nombre ? "Listo: ahora va en «" + r.nivel_nombre + "»." : "Listo: quedó sin nivel.";
                const otraVez = caja.querySelector("select");
                if (otraVez) otraVez.focus();   // el foco no se pierde al volver a pintar
            });
            fila.append(lab, sel, boton, estado);
            caja.appendChild(fila);
        }

        if (historial.length > 1) {
            const det = el(doc, "details", "mt-1 text-xs text-brand-600 dark:text-brand-300");
            const sum = el(doc, "summary", "cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Su historial de niveles");
            const ul = el(doc, "ul", "mt-1 space-y-0.5 list-none p-0");
            historial.forEach((x) => ul.appendChild(el(doc, "li", null, fecha(x.created_at) + ": " + (x.nivel_nombre || "sin nivel"))));
            det.append(sum, ul);
            caja.appendChild(det);
        }
        caja.hidden = false;
        return { actual: ahora, niveles };
    }

    return { validar, actual, fecha, montarEditor, montarFicha, MAX };
});

/*! rev bfb5bbb0d2d82f9f */
