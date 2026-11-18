/* El panel del alumno con la forma de Chessgora («panel jornada»).

   NO es otro panel. Es el mismo clases.html, con las mismas secciones y
   tarjetas y sus datos reales, repartidas en cinco pestañas: Inicio (lo de
   hoy), Clases, Entrenar, Jugar y Perfil. En el celular las pestañas van en
   una barra fija abajo; en la computadora, en un menú a la izquierda. Nada se
   esconde para siempre: lo que no está en la pestaña abierta está en otra, y
   mientras se busca se ve todo, como en el panel de siempre.

   Solo lo ven las cuentas anotadas en la tabla vistas_en_prueba con
   «panel_jornada» (se anotan desde SQL; cada quien lee solo sus filas). A los
   demás este archivo no les hace nada. Tampoco se aplica:
   - a quien no es alumno (el panel docente tiene otros grupos),
   - al panel adaptado (alumno ciego): ese ya es corto y está pensado para el
     lector de pantalla, y unas pestañas le agregarían pasos,
   - en «Ver como»: quien administra mira con SU sesión, que no está anotada.

   Cómo reparte: cada sección de primer nivel y cada grupo de tarjetas lleva
   `data-jornada="<pestaña>"`; lo que no es de la pestaña abierta lleva la
   clase `jornada-fuera` (display: none). Los grupos se reconocen por su
   título, igual que los busca clases.js, y se vuelven a marcar cada vez que
   renderTiles() repinta la grilla. Lo que no está en el mapa no se marca y se
   ve en todas las pestañas: algo nuevo en el panel nunca queda escondido.

   Ver «El panel jornada: el del alumno, con pestañas» en
   docs/decisiones/paneles.md. Lo revisa verificar-panel-jornada.js. */
(function () {
    "use strict";

    const PESTANAS = [
        { id: "inicio", nombre: "Inicio", icono: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>' },
        { id: "clases", nombre: "Clases", icono: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3z"/>' },
        { id: "entrenar", nombre: "Entrenar", icono: '<path d="M8 21h8M9 21l1-6M15 21l-1-6M7 15h10M9 15c-1-3 0-5 3-8 3 3 4 5 3 8"/><circle cx="12" cy="4" r="1.5"/>' },
        { id: "jugar", nombre: "Jugar", icono: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>' },
        { id: "perfil", nombre: "Perfil", icono: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>' }
    ];

    // Las secciones fijas de clases.html, por id.
    const SECCIONES = {
        "instalar-app": "inicio",
        "fondo-region": "inicio",
        "lado-alumno-card": "inicio",
        "session-status-card": "inicio",
        "pendientes-aviso": "inicio",
        "seguir-curso": "inicio",
        "progreso-alumno": "inicio",
        "favoritas": "inicio",
        "mas-usado": "inicio",
        "calendario-taller": "clases",
        "horas-taller": "clases",
        "tus-clases": "clases",
        "jornada-perfil": "perfil"
    };

    // Los grupos de tarjetas, por su título (el de TILE_GROUPS en clases.js).
    const GRUPOS = {
        "Clase en vivo": "inicio",
        "Lo que te pone tu profesor": "inicio",
        "Estudiar": "clases",
        "Aprender": "entrenar",
        "Entrenamiento básico": "entrenar",
        "Entrenamiento intermedio": "entrenar",
        "Entrenamiento avanzado": "entrenar",
        "Mejorar por habilidades": "entrenar",
        "Jugar y competir": "jugar",
        "Herramientas": "jugar",
        "Herramientas de arbitraje": "jugar",
        "Tu cuenta": "perfil",
        "Otras": "perfil"
    };

    // Lo que pasa a Perfil aunque viva dentro de «Tus clases».
    const A_PERFIL = ["puntos-ajedrez", "puntos-mes"];

    const CLAVE = "panel_jornada_pestana_v1";
    let actual = "inicio";
    let activo = false;

    function tituloDeGrupo(section) {
        const h2 = section.querySelector("h2");
        if (!h2) return "";
        return (h2.dataset.titulo || h2.textContent || "").trim();
    }

    function marcar() {
        Object.keys(SECCIONES).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.dataset.jornada = SECCIONES[id];
        });
        const grilla = document.getElementById("tile-grid");
        if (grilla) {
            Array.from(grilla.children).forEach((s) => {
                const p = GRUPOS[tituloDeGrupo(s)];
                if (p) s.dataset.jornada = p; else delete s.dataset.jornada;
            });
        }
    }

    function buscando() {
        const campo = document.getElementById("buscar-panel-campo");
        return !!(campo && campo.value.trim());
    }

    function aplicar() {
        if (!activo) return;
        const todo = buscando();
        document.body.classList.toggle("jornada-buscando", todo);
        document.querySelectorAll("[data-jornada]").forEach((el) => {
            el.classList.toggle("jornada-fuera", !todo && el.dataset.jornada !== actual);
        });
        document.querySelectorAll(".jornada-nav button[data-pestana]").forEach((b) => {
            if (b.dataset.pestana === actual) b.setAttribute("aria-current", "page");
            else b.removeAttribute("aria-current");
        });
    }

    function ir(id, enfocar) {
        if (!PESTANAS.some((p) => p.id === id)) return;
        actual = id;
        try { sessionStorage.setItem(CLAVE, id); } catch (e) { /* sin almacenamiento: arranca en Inicio */ }
        aplicar();
        if (enfocar) {
            const titulo = document.getElementById("jornada-titulo");
            if (titulo) {
                titulo.textContent = PESTANAS.find((p) => p.id === id).nombre;
                titulo.focus({ preventScroll: true });
            }
            window.scrollTo({ top: 0 });
        }
    }

    function armarNav() {
        const nav = document.createElement("nav");
        nav.className = "jornada-nav";
        nav.setAttribute("aria-label", "Secciones del panel");
        const lista = document.createElement("ul");
        PESTANAS.forEach((p) => {
            const li = document.createElement("li");
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.pestana = p.id;
            b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p.icono + "</svg>";
            const t = document.createElement("span");
            t.textContent = p.nombre;
            b.appendChild(t);
            b.addEventListener("click", () => ir(p.id, true));
            li.appendChild(b);
            lista.appendChild(li);
        });
        nav.appendChild(lista);
        return nav;
    }

    function armar() {
        const app = document.getElementById("app");
        const contenedor = app && app.firstElementChild;
        if (!contenedor || document.querySelector(".jornada-nav")) return;

        // Perfil: un lugar propio para los puntos, que vivían dentro de «Tus clases».
        const perfil = document.createElement("section");
        perfil.id = "jornada-perfil";
        perfil.setAttribute("aria-label", "Tus puntos");
        A_PERFIL.forEach((id) => { const el = document.getElementById(id); if (el) perfil.appendChild(el); });
        const grilla = document.getElementById("tile-grid");
        if (grilla) grilla.before(perfil);

        // El título de la pestaña: solo para el lector de pantalla y el foco al cambiar.
        const titulo = document.createElement("h2");
        titulo.id = "jornada-titulo";
        titulo.className = "sr-only";
        titulo.tabIndex = -1;
        titulo.textContent = "Inicio";
        contenedor.prepend(titulo);

        // «Tus clases» se abre solo: en esta forma es lo que hay en la pestaña Clases.
        const tusClases = document.getElementById("tus-clases");
        if (tusClases) tusClases.open = true;

        const marco = document.createElement("div");
        marco.className = "jornada-marco";
        app.insertBefore(marco, contenedor);
        marco.append(armarNav(), contenedor);

        document.body.classList.add("jornada");
        activo = true;
        marcar();

        let guardada = null;
        try { guardada = sessionStorage.getItem(CLAVE); } catch (e) { /* nada */ }
        actual = PESTANAS.some((p) => p.id === guardada) ? guardada : "inicio";
        if (!irAlHash()) aplicar();

        if (grilla) new MutationObserver(() => { marcar(); aplicar(); }).observe(grilla, { childList: true });
        const campo = document.getElementById("buscar-panel-campo");
        if (campo) campo.addEventListener("input", aplicar);
        window.addEventListener("hashchange", irAlHash);
    }

    // clases.html#entrenar y compañía: abre la pestaña donde vive lo que se pide.
    function irAlHash() {
        const id = decodeURIComponent(location.hash.slice(1));
        if (!id) return false;
        const el = document.getElementById(id);
        const conPestana = el && el.closest("[data-jornada]");
        if (!conPestana) return false;
        ir(conPestana.dataset.jornada, false);
        return true;
    }

    async function corresponde() {
        const sb = window.sb;
        if (!sb || !sb.auth) return false;
        const { data: ses } = await sb.auth.getSession();
        const uid = ses && ses.session && ses.session.user && ses.session.user.id;
        if (!uid) return false;
        const [vista, perfil] = await Promise.all([
            sb.from("vistas_en_prueba").select("vista").eq("profile_id", uid).eq("vista", "panel_jornada").maybeSingle(),
            sb.from("profiles").select("role").eq("id", uid).maybeSingle()
        ]);
        return !!(vista && vista.data && perfil && perfil.data && perfil.data.role === "alumno");
    }

    function cuandoSeVeaElPanel(fn) {
        const app = document.getElementById("app");
        if (!app) return;
        const listo = () => !app.classList.contains("hidden");
        if (listo()) { fn(); return; }
        const obs = new MutationObserver(() => { if (listo()) { obs.disconnect(); fn(); } });
        obs.observe(app, { attributes: true, attributeFilter: ["class"] });
    }

    const pedido = corresponde().catch(() => false);
    cuandoSeVeaElPanel(async () => {
        if (!(await pedido)) return;
        // El panel adaptado (alumno ciego) y el panel docente se quedan como están.
        if (document.getElementById("panel-adaptado-nota")) return;
        armar();
    });

    window.PanelJornada = { ir, PESTANAS, SECCIONES, GRUPOS };
})();

/*! rev bfb5bbb0d2d82f9f */
