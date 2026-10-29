/* El código de bases-torneo.html: «Generador de bases del torneo».

   Lee el formulario, arma el documento con js/bases-torneo.js (BasesTorneo) y
   lo muestra en la vista previa; al bajar, el MISMO documento va a
   js/reporte-pdf.js o a js/reporte-docx.js, los dos con la marca de agua de
   Ajedrez Integral (js/marca-agua.js). Nada sale del navegador: lo llenado se
   guarda en localStorage solo para la próxima visita (si el navegador no
   deja, la página funciona igual). Ver «Generador de bases del torneo» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const B = window.BasesTorneo;
    const $ = (id) => document.getElementById(id);
    const GUARDADO = "bases_torneo_v1";

    let desempates = B.DESEMPATES_SUGERIDOS.suizo.slice();
    let sistemaAnterior = "suizo";

    const CAMPOS = {
        nombre: "b-nombre", organizador: "b-organizador", director: "b-director", fechaInicio: "b-inicio", fechaFin: "b-fin",
        lugar: "b-lugar", contacto: "b-contacto", sistema: "b-sistema", rondas: "b-rondas", ritmoMin: "b-ritmo-min",
        ritmoInc: "b-ritmo-inc", rondasPorDia: "b-por-dia", horaInicio: "b-hora", descanso: "b-descanso", tolerancia: "b-tolerancia",
        byes: "b-byes", byesHasta: "b-byes-hasta", participantes: "b-participantes", categorias: "b-categorias", costo: "b-costo",
        cupo: "b-cupo", inscripcionHasta: "b-hasta", comoInscribirse: "b-como", premios: "b-premios", arbitro: "b-arbitro",
        plazoApelacion: "b-apelacion", otras: "b-otras",
    };
    const MARCAS = { eloFide: "b-elo-fide", eloNacional: "b-elo-nacional" };

    function datos() {
        const d = {};
        for (const [k, id] of Object.entries(CAMPOS)) d[k] = $(id).value;
        for (const [k, id] of Object.entries(MARCAS)) d[k] = $(id).checked;
        d.desempates = desempates.slice();
        return d;
    }
    function poner(d) {
        for (const [k, id] of Object.entries(CAMPOS)) if (d[k] != null) $(id).value = d[k];
        for (const [k, id] of Object.entries(MARCAS)) $(id).checked = !!d[k];
        if (Array.isArray(d.desempates)) desempates = d.desempates.filter((c) => B.NOMBRE_DESEMPATE[c]);
        sistemaAnterior = $("b-sistema").value;
    }
    function guardar(d) { try { localStorage.setItem(GUARDADO, JSON.stringify(d)); } catch (e) { /* sin guardar */ } }
    function leerGuardado() { try { return JSON.parse(localStorage.getItem(GUARDADO) || "null"); } catch (e) { return null; } }

    function boton(texto, etiqueta, accion, apagado) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = texto;
        b.setAttribute("aria-label", etiqueta);
        b.disabled = !!apagado;
        b.className = "text-xs font-semibold w-8 h-8 rounded-md border border-brand-300 dark:border-brand-600 hover:bg-brand-50 dark:hover:bg-brand-800 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        b.addEventListener("click", accion);
        return b;
    }
    function pintarDesempates(foco) {
        const ol = $("b-desempates");
        ol.replaceChildren();
        desempates.forEach((c, i) => {
            const li = document.createElement("li");
            li.dataset.codigo = c;
            li.className = "flex items-center gap-2 rounded-lg border border-brand-200 dark:border-brand-700 px-3 py-2 text-sm";
            const nombre = document.createElement("span");
            nombre.className = "flex-1";
            nombre.textContent = (i + 1) + ". " + B.NOMBRE_DESEMPATE[c] + " (" + c + ")";
            const mover = (a) => () => { const x = desempates.splice(i, 1)[0]; desempates.splice(i + a, 0, x); pintarDesempates(c); actualizar(); };
            li.append(nombre,
                boton("↑", "Subir " + B.NOMBRE_DESEMPATE[c], mover(-1), i === 0),
                boton("↓", "Bajar " + B.NOMBRE_DESEMPATE[c], mover(1), i === desempates.length - 1),
                boton("✕", "Quitar " + B.NOMBRE_DESEMPATE[c], () => { desempates.splice(i, 1); pintarDesempates(); actualizar(); $("b-desempate-nuevo").focus(); }));
            ol.append(li);
        });
        if (foco) { const li = ol.querySelector(`li[data-codigo="${foco}"]`); const b = li && [...li.querySelectorAll("button")].find((x) => !x.disabled); if (b) b.focus(); }
        const sel = $("b-desempate-nuevo");
        sel.replaceChildren(...Object.keys(B.NOMBRE_DESEMPATE).filter((c) => !desempates.includes(c)).map((c) => {
            const o = document.createElement("option");
            o.value = c;
            o.textContent = B.NOMBRE_DESEMPATE[c] + " (" + c + ")";
            return o;
        }));
    }

    function pintarVista(doc) {
        const v = $("vista");
        v.replaceChildren();
        const h = document.createElement("h3");
        h.className = "font-serif text-xl font-bold text-brand-800 dark:text-white";
        h.textContent = doc.titulo;
        const sub = document.createElement("p");
        sub.className = "text-brand-500 dark:text-brand-300";
        sub.textContent = doc.subtitulo;
        v.append(h, sub);
        for (const b of doc.bloques) {
            if (b.tipo === "subtitulo") { const x = document.createElement("h4"); x.className = "font-semibold text-brand-800 dark:text-white pt-2"; x.textContent = b.texto; v.append(x); }
            else if (b.tipo === "parrafo") { const x = document.createElement("p"); x.textContent = b.texto; v.append(x); }
            else if (b.tipo === "lista") { const ul = document.createElement("ul"); ul.className = "list-disc pl-5"; b.items.forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.append(li); }); v.append(ul); }
            else if (b.tipo === "tabla") {
                const t = document.createElement("table");
                t.className = "w-full text-left";
                const tr = document.createElement("tr");
                b.encabezados.forEach((e) => { const th = document.createElement("th"); th.scope = "col"; th.className = "py-1 pr-2"; th.textContent = e; tr.append(th); });
                const thead = document.createElement("thead"); thead.append(tr);
                const tbody = document.createElement("tbody");
                b.filas.forEach((f) => { const r = document.createElement("tr"); f.forEach((c) => { const td = document.createElement("td"); td.className = "py-1 pr-2 border-t border-brand-100 dark:border-brand-800"; td.textContent = c; r.append(td); }); tbody.append(r); });
                t.append(thead, tbody);
                v.append(t);
            }
        }
    }

    function pintarRevision(lista) {
        const ul = $("revision");
        ul.replaceChildren();
        if (!lista.length) {
            const li = document.createElement("li");
            li.dataset.tipo = "ok";
            li.textContent = "✓ Está todo lo que hace falta.";
            ul.append(li);
        }
        lista.forEach((x) => {
            const li = document.createElement("li");
            li.dataset.tipo = x.tipo;
            li.className = x.tipo === "error" ? "font-semibold" : "";
            li.textContent = (x.tipo === "error" ? "" : "Ojo: ") + x.texto;
            ul.append(li);
        });
    }

    function actualizar() {
        const d = datos();
        const mod = B.modalidad(d);
        $("b-modalidad").textContent = mod
            ? B.minutosPara60(d) + " minutos por jugador para 60 jugadas: " + { relampago: "ajedrez relámpago", rapido: "ajedrez rápido", clasico: "ajedrez clásico" }[mod] + "."
            : "";
        $("zona-byes").classList.toggle("hidden", d.sistema !== "suizo");
        pintarRevision(B.revisar(d));
        pintarVista(B.documento(d));
        guardar(d);
    }

    function nombreArchivo(ext) {
        const base = String($("b-nombre").value || "torneo").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        return "bases-" + (base || "torneo") + "." + ext;
    }
    async function bajar(cual) {
        const d = datos();
        const errores = B.revisar(d).filter((x) => x.tipo === "error");
        if (errores.length) {
            Avisos.avisar("Antes de bajar, completa: " + errores.map((x) => x.texto.replace(/^Falta /, "").replace(/\.$/, "")).join(", ") + ".", { tipo: "error" });
            return;
        }
        $("b-estado").textContent = "Armando el archivo…";
        try {
            const doc = B.documento(d);
            let blob;
            if (cual === "docx") {
                // El Word lleva la marca en el encabezado; la pide aparte (el PDF la busca solo).
                try { doc.marca = await window.MarcaAgua.preparar(); } catch (e) { /* sin conexión: sin marca */ }
                blob = window.ReporteDOCX.generar(doc);
            } else blob = await window.ReportePDF.generar(doc);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = nombreArchivo(cual);
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
            $("b-estado").textContent = "Listo, se bajó en " + (cual === "docx" ? "Word" : "PDF") + ".";
        } catch (e) {
            $("b-estado").textContent = "";
            Avisos.avisar("No se pudo armar el archivo: " + (e.message || e), { tipo: "error" });
        }
    }

    function iniciar() {
        const g = leerGuardado();
        if (g) poner(g);
        pintarDesempates();
        $("formulario").addEventListener("input", actualizar);
        $("formulario").addEventListener("change", (e) => {
            if (e.target.id === "b-sistema" && e.target.value !== sistemaAnterior) {
                // Al cambiar el sistema, los desempates de Pareo Integral para ese sistema.
                sistemaAnterior = e.target.value;
                desempates = (B.DESEMPATES_SUGERIDOS[e.target.value] || []).slice();
                pintarDesempates();
            }
            actualizar();
        });
        $("formulario").addEventListener("submit", (e) => e.preventDefault());
        $("b-agregar").addEventListener("click", () => {
            const c = $("b-desempate-nuevo").value;
            if (!c) return;
            desempates.push(c);
            pintarDesempates();
            actualizar();
            $("b-desempate-nuevo").focus();
        });
        $("b-pdf").addEventListener("click", () => bajar("pdf"));
        $("b-docx").addEventListener("click", () => bajar("docx"));
        actualizar();
    }
    iniciar();
})();
