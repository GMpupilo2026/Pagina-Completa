/* Ctrl + K en admin.html: buscar en todo el panel.

   En las demás páginas de la Academia, Ctrl + K lleva al buscador del panel
   (js/atajo-buscar.js). Acá abre el suyo, sin salir de la página, y
   encuentra tres cosas:
     - personas: abre su ficha (lo que más se hace en este panel);
     - secciones del panel: lleva a la sección;
     - páginas de quien administra (js/paginas-admin.js): abre la página.
   Sin nada escrito enseña las secciones y las páginas, que es el mapa
   entero del panel en una lista. Ver «El panel de Administración en seis
   secciones» en docs/decisiones/paneles.md.

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

    // Las secciones salen de los enlaces del propio menú: si se agrega una
    // sección con su enlace, el buscador ya la encuentra.
    function secciones() {
        const vistas = new Map();
        const grupos = (window.AdminPanel && AdminPanel.grupos) || [];
        const nombreGrupo = (seccion) => (grupos.find((g) => g.secciones.includes(seccion)) || {}).nombre || "";
        document.querySelectorAll(".admin-nav[data-ir], .admin-grupo[data-ir]").forEach((a) => {
            const id = a.dataset.ir;
            // De una pestaña con varias secciones vale la sección, no la pestaña.
            if (a.classList.contains("admin-grupo") && document.querySelector('.admin-nav[data-ir="' + id + '"]')) return;
            if (vistas.has(id)) return;
            const texto = a.textContent.replace(/[＋+]/g, "").replace(/\d+$/, "").trim();
            const grupo = nombreGrupo(id);
            vistas.set(id, {
                tipo: "seccion",
                titulo: texto,
                detalle: grupo && grupo !== texto ? "Sección · " + grupo : "Sección del panel",
                clave: sinTildes(texto + " " + grupo),
                ir: () => { AdminPanel.irA(id); window.scrollTo({ top: 0 }); },
            });
        });
        return [...vistas.values()];
    }

    function paginas() {
        if (!window.PaginasAdmin) return [];
        const fuera = [];
        PaginasAdmin.GRUPOS.forEach((g) => g.tiles.forEach((t) => {
            if (t.href === "admin.html") return;
            fuera.push({
                tipo: "pagina",
                titulo: t.label,
                detalle: "Página · " + t.desc,
                clave: sinTildes(t.label + " " + t.desc + " " + g.title),
                href: t.href,
            });
        }));
        return fuera;
    }

    function personas(texto) {
        if (!texto || !window.AdminPanel) return [];
        const rol = { alumno: "Estudiante", profesor: "Profesor" };
        return AdminPanel.personas()
            .filter((u) => sinTildes(u.full_name).includes(texto) || sinTildes(u.email).includes(texto) || sinTildes(u.grupo).includes(texto))
            .slice(0, MAX_PERSONAS)
            .map((u) => ({
                tipo: "persona",
                titulo: u.full_name || u.email,
                detalle: [rol[u.role] || u.role, u.grupo, u.email].filter(Boolean).join(" · "),
                ir: () => AdminPanel.abrirFicha(u.id),
            }));
    }

    function buscar() {
        const texto = sinTildes(campo.value.trim());
        const coincide = (x) => !texto || texto.split(/\s+/).every((p) => x.clave.includes(p));
        resultados = personas(texto).concat(secciones().filter(coincide), paginas().filter(coincide));
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

    window.AdminBuscador = { abrir, cerrar };
})();
