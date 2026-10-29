/* El código de acta-jde.html: «Acta e informe arbitral JDE».

   Lee cada torneo de la etapa con la Edge Function desempates-chess-results
   (pidiendo la licencia de «acta-jde»), los arma con js/acta-jde.js
   (ActaJde: el informe es el MISMO de Pareo Integral, js/pareo/evento.js) y
   baja el informe en PDF o en Word, y los clasificados a la etapa siguiente
   en el Excel que se sube en esa etapa. Lo que chess-results no trae (la
   etapa, el lugar, la sede, la fecha, los árbitros y las incidencias) lo
   escribe quien arbitró. Ver «Acta e informe arbitral JDE» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const A = window.ActaJde;
    const G = window.PareoGrupos;
    const $ = (id) => document.getElementById(id);
    const avisar = (texto, error) => Avisos.avisar(texto, { tipo: error ? "error" : "ok" });

    let lecturas = []; // [{ url, datos, todos }]

    function el(tag, attrs, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "texto") n.textContent = v;
            else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v === true ? "" : v);
        }
        for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
        return n;
    }

    // El lugar depende de la etapa: la Dirección Regional, la interregional o un texto.
    function pintarLugar() {
        const etapa = $("a-etapa").value;
        const sel = $("a-lugar"), txt = $("a-lugar-texto");
        const opciones = etapa === "regional" ? G.JDE_DIRECCIONES.map((d) => [d, d])
            : etapa === "interregional" ? G.JDE_INTERREGIONALES.map((x) => [x.numero, G.nombreInterregional(x)]) : null;
        $("a-lugar-etiqueta").textContent = etapa === "regional" ? "Dirección Regional" : etapa === "interregional" ? "Interregional" : etapa === "institucional" ? "Centro educativo o circuito" : "Lugar";
        sel.classList.toggle("hidden", !opciones);
        txt.classList.toggle("hidden", !!opciones);
        $("a-lugar-etiqueta").setAttribute("for", opciones ? "a-lugar" : "a-lugar-texto");
        if (opciones) sel.replaceChildren(...opciones.map(([v, t]) => el("option", { value: v, texto: t })));
    }

    function evento() {
        const etapa = $("a-etapa").value;
        const deLista = etapa === "regional" || etapa === "interregional";
        return {
            anio: Number($("a-anio").value) || 0, etapa, lugar: deLista ? $("a-lugar").value : $("a-lugar-texto").value.trim(),
            sede: $("a-sede").value.trim(), fecha: $("a-fecha").value, arbitro: $("a-arbitro").value.trim(), adjunto: $("a-adjunto").value.trim(),
        };
    }

    async function leer(url) {
        let { data, error } = await sb.functions.invoke("desempates-chess-results", { body: { url, herramienta: "acta-jde" } });
        if (error && error.context && typeof error.context.json === "function") {
            try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (!data || data.error) throw new Error((data && data.error) || (error && error.message) || "chess-results no contestó");
        return data;
    }

    function armado() {
        return A.armar(evento(), lecturas.map((l) => ({ datos: l.datos, todos: l.todos })));
    }

    function pintar() {
        const ul = $("a-torneos");
        ul.replaceChildren();
        lecturas.forEach((l, i) => {
            const id = "a-todos-" + i;
            ul.append(el("li", { class: "rounded-lg border border-brand-200 dark:border-brand-700 px-3 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1", "data-torneo": String(i) },
                el("span", { class: "font-semibold flex-1 min-w-[12rem]", texto: l.datos.titulo || l.url }),
                el("span", { texto: l.datos.jugadores.length + " jugadores · " + (l.datos.rondasJugadas || 0) + " rondas" + (l.datos.final ? "" : " · provisional") }),
                el("label", { class: "inline-flex items-center gap-2" },
                    el("input", { id, type: "checkbox", class: "w-4 h-4", checked: !!l.todos, onchange: (e) => { l.todos = e.target.checked; pintar(); } }),
                    "Todos contra todos")));
        });
        const listo = lecturas.length > 0;
        ["a-pdf", "a-docx", "a-excel"].forEach((b) => { $(b).disabled = !listo; });
        $("a-bajar-estado").textContent = listo ? "" : "Primero carga los torneos.";
        const av = $("avisos");
        av.replaceChildren();
        if (listo) armado().avisos.forEach((x) => av.append(el("li", { "data-aviso": x.tipo }, el("strong", { texto: x.torneo + ": " }), x.texto)));
        $("zona-avisos").classList.toggle("hidden", !av.children.length);
    }

    async function cargar() {
        const urls = $("a-enlaces").value.split(/\s+/).map((x) => x.trim()).filter(Boolean);
        if (!urls.length) { avisar("Pega al menos un enlace de chess-results.", true); return; }
        $("a-cargar").disabled = true;
        const nuevas = [];
        try {
            for (let i = 0; i < urls.length; i++) {
                $("a-estado").textContent = "Leyendo " + (i + 1) + " de " + urls.length + " en chess-results… (un torneo grande puede tardar un minuto)";
                const datos = await leer(urls[i]);
                // Todos contra todos si las rondas lo dicen; se puede corregir.
                const todos = window.DesempatesConvertir.convertir(datos, {}).posibleTodos;
                nuevas.push({ url: urls[i], datos, todos });
            }
            lecturas = nuevas;
            $("a-estado").textContent = "Leídos " + nuevas.length + (nuevas.length === 1 ? " torneo." : " torneos.");
            pintar();
        } catch (e) {
            $("a-estado").textContent = "";
            avisar((nuevas.length ? "Se leyeron " + nuevas.length + "; el siguiente falló: " : "") + (e.message || String(e)), true);
        } finally {
            $("a-cargar").disabled = false;
        }
    }

    function nombreArchivo(ext) {
        const ev = evento();
        const base = ["informe-jde", ev.anio, ev.etapa, ev.lugar].filter(Boolean).join("-").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
        return base + "." + ext;
    }
    function bajarBlob(blob, nombre) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nombre;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
    async function bajar(cual) {
        const ev = evento();
        if (!ev.anio) { avisar("Falta el año de los JDE.", true); return; }
        const estado = $("a-bajar-estado");
        estado.textContent = "Armando el archivo…";
        try {
            const { torneos } = armado();
            if (cual === "excel") {
                const filas = A.clasificados(ev, torneos);
                if (!filas.length) { estado.textContent = ""; avisar(ev.etapa === "nacional" ? "De la Etapa Nacional no se clasifica a otra etapa." : "Todavía no hay clasificados: falta terminar alguna ronda.", true); return; }
                window.TablaExcel.bajar(nombreArchivo("xlsx").replace("informe-jde", "clasificados-jde"), [{ nombre: "Clasificados", filas: [A.ENCABEZADOS].concat(filas) }]);
                estado.textContent = "Listo: " + filas.length + (filas.length === 1 ? " clasificado." : " clasificados.") + " El Excel se sube tal cual en Pareo Integral para armar la etapa siguiente.";
                return;
            }
            const doc = A.documento(ev, torneos, $("a-incidencias").value);
            let blob;
            if (cual === "docx") {
                try { doc.marca = await window.MarcaAgua.preparar(); } catch (e) { /* sin conexión: sin marca */ }
                blob = window.ReporteDOCX.generar(doc);
            } else blob = await window.ReportePDF.generar(doc);
            bajarBlob(blob, nombreArchivo(cual));
            estado.textContent = "Listo, se bajó en " + (cual === "docx" ? "Word" : "PDF") + ". Imprímelo, fírmalo y entrégalo al comité.";
        } catch (e) {
            estado.textContent = "";
            avisar("No se pudo armar el archivo: " + (e.message || e), true);
        }
    }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        $("loading").classList.add("hidden");
        if (!session) { location.href = "login.html?next=acta-jde.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "acta-jde" });
        if (error || puede !== true) { $("denegado").classList.remove("hidden"); return; }
        $("a-anio").value = window.HoraCR ? window.HoraCR.hoy().slice(0, 4) : "";
        pintarLugar();
        $("a-etapa").addEventListener("change", () => { pintarLugar(); pintar(); });
        ["a-anio", "a-lugar", "a-lugar-texto"].forEach((id) => $(id).addEventListener("change", pintar));
        $("a-cargar").addEventListener("click", cargar);
        $("a-pdf").addEventListener("click", () => bajar("pdf"));
        $("a-docx").addEventListener("click", () => bajar("docx"));
        $("a-excel").addEventListener("click", () => bajar("excel"));
        $("app").classList.remove("hidden");
    }
    init();
})();
