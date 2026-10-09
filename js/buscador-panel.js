/* Ctrl + K en los paneles con pestañas: admin.html y supervisor.html.

   En las demás páginas de la Academia, Ctrl + K lleva al buscador del panel
   (js/atajo-buscar.js). En estos dos abre el suyo, sin salir de la página, y
   encuentra tres cosas:
     - personas: abre su ficha (lo que más se hace en estos paneles);
     - secciones del panel: lleva a la sección;
     - páginas: abre la página.
   Sin nada escrito enseña las secciones y las páginas, que es el mapa
   entero del panel en una lista. Ver «El panel de Administración en seis
   secciones» y «La página de supervisión» en docs/decisiones/paneles.md.

   Cada panel le dice qué buscar en window.PanelBuscador:
     secciones()        → [{ id, titulo, grupo }]
     irA(id)            → abre esa sección
     personas(texto)    → [{ titulo, detalle, ir }] (o una promesa: la lista
                          de supervisión la busca la base)
     paginas()          → [{ label, desc, href, grupo }]
   Con ?buscar=… en la dirección se abre ya buscando eso: así llega el
   Ctrl + K de las otras páginas cuando el panel de la Academia lleva a
   supervisor.html.

   Todo lo que se pinta es texto: los nombres los escribe la gente, y van
   por textContent. */
(function () {
    "use strict";

    const velo = document.getElementById("buscador-velo");
    const caja = document.getElementById("buscador");
    const campo = document.getElementById("buscador-campo");
    const lista = document.getElementById("buscador-lista");
    const estado = document.getElementById("buscador-estado");
    if (!caja || !campo || !lista) return;

    const MAX_PERSONAS = 6;
    let resultados = [];
    let elegido = 0;
    let focoAntes = null;

    function sinTildes(t) {
        return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    }

    function cfg() { return window.PanelBuscador || {}; }

    function secciones() {
        const lista = cfg().secciones ? cfg().secciones() : [];
        return lista.map((x) => ({
            tipo: "seccion",
            titulo: x.titulo,
            detalle: x.grupo && x.grupo !== x.titulo ? "Sección · " + x.grupo : "Sección del panel",
            clave: sinTildes(x.titulo + " " + (x.grupo || "")),
            ir: () => { cfg().irA(x.id); window.scrollTo({ top: 0 }); },
        }));
    }

    function paginas() {
        const lista = cfg().paginas ? cfg().paginas() : [];
        return lista.map((t) => ({
            tipo: "pagina",
            titulo: t.label,
            detalle: "Página · " + t.desc,
            clave: sinTildes(t.label + " " + t.desc + " " + (t.grupo || "")),
            href: t.href,
        }));
    }

    async function personas(texto) {
        if (!texto || !cfg().personas) return [];
        try {
            const lista = await cfg().personas(texto);
            return (lista || []).slice(0, MAX_PERSONAS).map((p) => Object.assign({ tipo: "persona" }, p));
        } catch (_) { return []; }
    }

    // La búsqueda de personas puede llegar tarde (la base): la que llega
    // después de otra tecla se tira.
    let turno = 0;
    async function buscar() {
        const mio = ++turno;
        const crudo = campo.value.trim();
        const texto = sinTildes(crudo);
        const coincide = (x) => !texto || texto.split(/\s+/).every((p) => x.clave.includes(p));
        const fijos = secciones().filter(coincide).concat(paginas().filter(coincide));
        // Primero lo que ya está a mano; las personas se suman cuando llegan.
        resultados = fijos;
        elegido = 0;
        pintar();
        if (!texto) return;
        const gente = await personas(crudo);
        if (mio !== turno || !abierto()) return;
        resultados = gente.concat(fijos);
        elegido = 0;
        pintar();
    }

    function pintar() {
        lista.replaceChildren();
        if (!resultados.length) {
            const li = document.createElement("li");
            li.className = "px-3 py-3 text-sm text-brand-500 dark:text-brand-300";
            li.textContent = "No hay ninguna persona, sección ni página con eso.";
            lista.appendChild(li);
            campo.removeAttribute("aria-activedescendant");
            estado.textContent = "Nada encontrado.";
            return;
        }
        const etiquetas = { persona: "Persona", seccion: "Sección", pagina: "Página" };
        resultados.forEach((r, i) => {
            const li = document.createElement("li");
            li.id = "buscador-op-" + i;
            li.setAttribute("role", "option");
            li.setAttribute("aria-selected", i === elegido ? "true" : "false");
            li.dataset.tipo = r.tipo;
            li.className = "flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer " + (i === elegido ? "bg-brand-100 dark:bg-brand-800" : "hover:bg-brand-50 dark:hover:bg-brand-800/60");
            const texto = document.createElement("span");
            texto.className = "min-w-0 flex-1";
            const t = document.createElement("span");
            t.className = "block font-semibold text-sm text-brand-800 dark:text-white truncate";
            t.textContent = r.titulo;
            const d = document.createElement("span");
            d.className = "block text-xs text-brand-500 dark:text-brand-300 truncate";
            d.textContent = r.detalle;
            texto.append(t, d);
            const tipo = document.createElement("span");
            tipo.className = "shrink-0 text-xs font-semibold text-brand-500 dark:text-brand-300";
            tipo.textContent = etiquetas[r.tipo];
            li.append(texto, tipo);
            li.addEventListener("mousedown", (e) => e.preventDefault());   // que el campo no pierda el foco
            li.addEventListener("click", () => elegir(i));
            lista.appendChild(li);
        });
        campo.setAttribute("aria-activedescendant", "buscador-op-" + elegido);
        lista.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
        estado.textContent = resultados.length === 1 ? "1 resultado." : resultados.length + " resultados.";
    }

    function elegir(i) {
        const r = resultados[i];
        if (!r) return;
        cerrar(r.tipo !== "persona");
        if (r.href) { window.location.href = r.href; return; }
        r.ir();
    }

    function abierto() {
        return !caja.hidden;
    }

    function abrir(inicial) {
        if (abierto()) { campo.select(); return; }
        focoAntes = document.activeElement;
        velo.hidden = false;
        caja.hidden = false;
        campo.value = inicial || "";
        buscar();
        campo.focus();
        campo.select();
    }

    // `devolverFoco`: al ir a una sección o al cerrar, el foco vuelve a donde
    // estaba; al abrir una ficha, la ficha se lo queda.
    function cerrar(devolverFoco) {
        if (!abierto()) return;
        velo.hidden = true;
        caja.hidden = true;
        if (devolverFoco !== false && focoAntes && document.contains(focoAntes)) focoAntes.focus();
        focoAntes = null;
    }

    campo.addEventListener("input", buscar);
    campo.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); if (resultados.length) { elegido = (elegido + 1) % resultados.length; pintar(); } }
        else if (e.key === "ArrowUp") { e.preventDefault(); if (resultados.length) { elegido = (elegido - 1 + resultados.length) % resultados.length; pintar(); } }
        else if (e.key === "Enter") { e.preventDefault(); elegir(elegido); }
        else if (e.key === "Escape") { e.preventDefault(); cerrar(); }
        else if (e.key === "Tab") { e.preventDefault(); }   // es un diálogo de un solo campo
    });
    velo.addEventListener("click", () => cerrar());
    document.getElementById("abrir-buscador")?.addEventListener("click", () => abrir(""));

    document.addEventListener("keydown", (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || String(e.key).toLowerCase() !== "k") return;
        if (document.querySelector("dialog[open]")) return;   // un aviso abierto manda
        e.preventDefault();
        // Como en el resto de la Academia: lo seleccionado llega ya buscado.
        let sel = "";
        try { sel = String(window.getSelection ? window.getSelection() : "").trim().replace(/\s+/g, " ").slice(0, 80); } catch (err) {}
        abrir(sel);
    });

    // Llegando con ?buscar=… (el Ctrl + K de otra página), ya buscando.
    const pedido = new URLSearchParams(location.search).get("buscar");
    if (pedido) window.addEventListener("load", () => setTimeout(() => abrir(pedido.slice(0, 80)), 0));

    window.BuscadorPanel = { abrir, cerrar };
})();
