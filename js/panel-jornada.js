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

    /* Las secciones fijas de clases.html, por id. Una puede vivir en dos
       pestañas («inicio clases»): la clase en vivo es lo de hoy y es también
       de Clases. */
    const SECCIONES = {
        "instalar-app": "inicio",
        "fondo-region": "inicio",
        "lado-alumno-card": "inicio",
        "session-status-card": "inicio clases",
        "pendientes-aviso": "inicio",
        "seguir-curso": "inicio",
        /* «Hoy te toca» va SOLO en Inicio (20/11/2026, a pedido del dueño):
           cuando iba en Entrenar salía en la portada y encima de cada sección,
           y estorbaba. */
        "progreso-alumno": "inicio",
        "jornada-inicio": "inicio",
        "favoritas": "inicio",
        "mas-usado": "inicio",
        "calendario-taller": "clases",
        "horas-taller": "clases",
        "tus-clases": "clases",
        "jornada-perfil": "perfil"
    };

    // Los grupos de tarjetas, por su título (el de TILE_GROUPS en clases.js).
    const GRUPOS = {
        "Clase en vivo": "inicio clases",
        "Lo que te pone tu profesor": "inicio",
        "Estudiar": "entrenar",
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

    /* Lo de adentro de una pestaña, cada cosa por separado: en la computadora
       van debajo de su pestaña en el menú de la izquierda; en el celular, en
       una fila de botones arriba de la pestaña. Un `grupo` deja a la vista
       solo ese grupo de tarjetas (y lo abre si está plegado); un `enlace` lleva
       a otra página. */
    const SUBSECCIONES = {
        entrenar: [
            { grupo: "Estudiar", nombre: "Estudiar" },
            { grupo: "Aprender", nombre: "Aprender" },
            { grupo: "Entrenamiento básico", nombre: "Entrenamiento básico" },
            { grupo: "Entrenamiento intermedio", nombre: "Entrenamiento intermedio" },
            { grupo: "Entrenamiento avanzado", nombre: "Entrenamiento avanzado" },
            { grupo: "Mejorar por habilidades", nombre: "Habilidades" }
        ],
        jugar: [
            // «Prepárate tú»: el plan contra el rival de tu próxima partida.
            { enlace: "plan-rival.html", nombre: "Preparar a un rival" }
        ]
    };

    // Lo que pasa a Perfil aunque viva dentro de «Tus clases».
    const A_PERFIL = ["puntos-ajedrez", "puntos-mes"];

    const CLAVE = "panel_jornada_pestana_v1";
    let actual = "inicio";
    let seccion = null; // el grupo abierto solo, dentro de la pestaña (o null: toda la pestaña)
    let activo = false;
    const pestanasDe = (el) => (el.dataset.jornada || "").split(" ");

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
                const t = tituloDeGrupo(s);
                const p = GRUPOS[t];
                if (p) { s.dataset.jornada = p; s.dataset.grupo = t; }
                else { delete s.dataset.jornada; delete s.dataset.grupo; }
            });
        }
        llenarPortada();
    }

    function buscando() {
        const campo = document.getElementById("buscar-panel-campo");
        return !!(campo && campo.value.trim());
    }

    function aplicar() {
        if (!activo) return;
        const todo = buscando();
        // Entrenar sin sección elegida abre con su portada, no con todas las tarjetas.
        const portada = actual === "entrenar" && !seccion;
        document.body.classList.toggle("jornada-buscando", todo);
        document.body.classList.toggle("jornada-con-seccion", !!seccion);
        document.querySelectorAll("[data-jornada]").forEach((el) => {
            const enLaPestana = pestanasDe(el).includes(actual);
            // Con una sección elegida, de los grupos de tarjetas solo queda ese.
            const otroGrupo = !!(seccion && el.dataset.grupo && el.dataset.grupo !== seccion);
            const tapadoPorPortada = portada && !!el.dataset.grupo;
            const portadaFuera = el.hasAttribute("data-portada") && !!seccion;
            el.classList.toggle("jornada-fuera", !todo && (!enLaPestana || otroGrupo || tapadoPorPortada || portadaFuera));
        });
        /* La pestaña abierta lleva aria-current="page"; con una sección suya
           elegida, la sección es la página y la pestaña queda en "true". */
        document.querySelectorAll(".jornada-nav button[data-pestana]").forEach((b) => {
            if (b.dataset.pestana === actual) b.setAttribute("aria-current", seccion ? "true" : "page");
            else b.removeAttribute("aria-current");
        });
        document.querySelectorAll("button[data-seccion]").forEach((b) => {
            // «Todo» (data-seccion vacío) es la pestaña entera.
            if (b.dataset.pestanaDe === actual && (b.dataset.seccion || null) === seccion) b.setAttribute("aria-current", "page");
            else b.removeAttribute("aria-current");
        });
    }

    function guardar() {
        try { sessionStorage.setItem(CLAVE, JSON.stringify({ pestana: actual, seccion: seccion })); } catch (e) { /* sin almacenamiento: arranca en Inicio */ }
    }

    function abrirGrupo(titulo) {
        const s = Array.from(document.querySelectorAll("#tile-grid > section")).find((x) => x.dataset.grupo === titulo);
        const boton = s && s.querySelector("h2 button[aria-expanded='false']");
        if (boton) boton.click();
    }

    function ir(id, enfocar, sec) {
        if (!PESTANAS.some((p) => p.id === id)) return;
        actual = id;
        seccion = sec || null;
        guardar();
        aplicar();
        if (seccion) abrirGrupo(seccion);
        if (enfocar) {
            const titulo = document.getElementById("jornada-titulo");
            if (titulo) {
                const sub = seccion && (SUBSECCIONES[id] || []).find((x) => x.grupo === seccion);
                titulo.textContent = PESTANAS.find((p) => p.id === id).nombre + (sub ? " · " + sub.nombre : "");
                titulo.focus({ preventScroll: true });
            }
            window.scrollTo({ top: 0 });
            animarEntrada();
        }
    }

    /* ---------- Las animaciones ----------
       Solo si el sistema no pide menos movimiento (el CSS también lo exige:
       css/panel-jornada.css, «Las animaciones»). Al cambiar de pestaña, lo que
       queda a la vista entra con un fundido; sus tarjetas y salas, una detrás
       de otra. Nada se esconde para esperar: la clase se quita sola y, sin
       ella, todo está donde siempre. */
    const conMovimiento = () => { try { return window.matchMedia("(prefers-reduced-motion: no-preference)").matches; } catch (e) { return false; } };
    const PIEZAS = ".jornada-clase, .jornada-sala, .jornada-portada-carta, .jornada-grafico, .jornada-inicio-lado, .grid > a, .grid > div:not(.contents), .grid > .contents > *";
    const TOPE_ESCALON = 5; // la sexta pieza y las siguientes entran juntas: la última no espera
    let quitarEntrada = 0;

    function animarEntrada() {
        if (!activo || !conMovimiento() || buscando()) return;
        const viejas = document.querySelectorAll(".jornada-entra");
        viejas.forEach((e) => e.classList.remove("jornada-entra"));
        const secciones = Array.from(document.querySelectorAll("[data-jornada]:not(.jornada-fuera)"))
            .filter((e) => !e.checkVisibility || e.checkVisibility());
        void document.body.offsetWidth; // que la animación vuelva a empezar
        let n = 0;
        secciones.forEach((s) => {
            s.style.setProperty("--jornada-i", "0");
            s.classList.add("jornada-entra");
            s.querySelectorAll(PIEZAS).forEach((p) => {
                n += 1;
                p.style.setProperty("--jornada-i", String(Math.min(n, TOPE_ESCALON)));
                p.classList.add("jornada-entra");
            });
        });
        clearTimeout(quitarEntrada);
        quitarEntrada = setTimeout(() => {
            document.querySelectorAll(".jornada-entra").forEach((e) => e.classList.remove("jornada-entra"));
        }, 900);
    }

    /* El número grande de una sala cuenta desde 0 hasta el de verdad. El
       texto de .jornada-sala-grande es el número final desde el principio
       (el lector y el verificador leen ese); el que va contando se dibuja
       encima con data-contando (ver el CSS) y se quita al llegar. */
    function contar(span, numero, resto) {
        if (!conMovimiento() || !(numero > 0) || (span.checkVisibility && !span.checkVisibility())) return;
        const DURA = 800;
        const t0 = performance.now();
        const paso = (t) => {
            const f = Math.min(1, (t - t0) / DURA);
            const v = Math.round(numero * (1 - Math.pow(1 - f, 3))); // arranca rápido y frena al llegar
            if (f >= 1) { span.removeAttribute("data-contando"); return; }
            span.dataset.contando = fmtN(v) + resto;
            requestAnimationFrame(paso);
        };
        span.dataset.contando = fmtN(0) + resto;
        requestAnimationFrame(paso);
    }

    // Un botón (o enlace) de sección: el mismo para el menú y para la fila del celular.
    function botonDeSeccion(pestana, s) {
        let el;
        if (s.enlace) {
            el = document.createElement("a");
            el.href = s.enlace;
        } else {
            el = document.createElement("button");
            el.type = "button";
            el.dataset.seccion = s.grupo;
            el.dataset.pestanaDe = pestana;
            el.addEventListener("click", () => ir(pestana, true, s.grupo));
        }
        el.textContent = s.nombre;
        return el;
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
            // Lo de adentro, debajo de su pestaña (solo se ve en la computadora).
            if (SUBSECCIONES[p.id]) {
                const sub = document.createElement("ul");
                sub.className = "jornada-sub";
                sub.setAttribute("aria-label", "Dentro de " + p.nombre);
                SUBSECCIONES[p.id].forEach((s) => {
                    const sli = document.createElement("li");
                    sli.appendChild(botonDeSeccion(p.id, s));
                    sub.appendChild(sli);
                });
                li.appendChild(sub);
            }
            lista.appendChild(li);
        });
        nav.appendChild(lista);
        return nav;
    }

    // En el celular, lo de adentro de la pestaña va en una fila de botones arriba.
    function armarFilas(contenedor, antes) {
        Object.keys(SUBSECCIONES).forEach((pestana) => {
            const fila = document.createElement("nav");
            fila.className = "jornada-fila";
            fila.dataset.jornada = pestana;
            fila.setAttribute("aria-label", "Dentro de " + PESTANAS.find((p) => p.id === pestana).nombre);
            const todo = document.createElement("button");
            todo.type = "button";
            todo.dataset.seccion = "";
            todo.dataset.pestanaDe = pestana;
            // En Entrenar, la pestaña entera es su portada: un resumen, no «todo».
            todo.textContent = pestana === "entrenar" ? "Resumen" : "Todo";
            todo.addEventListener("click", () => ir(pestana, true));
            fila.appendChild(todo);
            SUBSECCIONES[pestana].forEach((s) => fila.appendChild(botonDeSeccion(pestana, s)));
            contenedor.insertBefore(fila, antes);
        });
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

        // Las filas de secciones del celular, justo debajo del buscador, y el Inicio nuevo.
        const buscador = document.getElementById("buscar-panel");
        const ancla = buscador ? buscador.nextSibling : titulo.nextSibling;
        armarFilas(contenedor, ancla);
        armarInicio(contenedor, ancla);
        armarCabeceras(contenedor, ancla);
        armarPortada();

        document.body.classList.add("jornada");
        activo = true;
        marcar();

        let guardada = null;
        try {
            const g = sessionStorage.getItem(CLAVE) || "";
            guardada = g.startsWith("{") ? JSON.parse(g) : { pestana: g, seccion: null };
        } catch (e) { /* nada */ }
        actual = guardada && PESTANAS.some((p) => p.id === guardada.pestana) ? guardada.pestana : "inicio";
        const valida = guardada && (SUBSECCIONES[actual] || []).some((s) => s.grupo && s.grupo === guardada.seccion);
        seccion = valida ? guardada.seccion : null;
        if (!irAlHash()) { aplicar(); if (seccion) abrirGrupo(seccion); }
        animarEntrada();

        if (grilla) new MutationObserver(() => { marcar(); aplicar(); }).observe(grilla, { childList: true });
        const campo = document.getElementById("buscar-panel-campo");
        if (campo) campo.addEventListener("input", aplicar);
        window.addEventListener("hashchange", irAlHash);
    }

    /* ---------- El Inicio nuevo: la clase, las salas y lo que viene ----------
       Como un tablero de control: arriba un banner con la clase, debajo seis
       «salas» con un número grande que llevan a su lugar, y al lado (abajo en
       el celular) lo que viene. Todo sale de funciones que el panel del alumno
       ya usa y que la RLS acota a lo suyo: mi_proxima_clase(), mis_clases(),
       mis_clases_proximas(), tareas_con_avance(), entreno_mi_semana(),
       mi_rango(), informes_diagnosticos_alumnos() y Puntos.saldo(). Cada sala
       arranca con «—» y, si su consulta falla, se queda así y lo dice: un
       número inventado se creería. Horas y días en hora de Costa Rica. */
    const ZONA = "America/Costa_Rica";
    const F_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA });
    const F_HORA = new Intl.DateTimeFormat("es-CR", { timeZone: ZONA, hour: "numeric", minute: "2-digit" });
    const F_SEMANA = new Intl.DateTimeFormat("es-CR", { timeZone: ZONA, weekday: "long" });
    const F_FECHA = new Intl.DateTimeFormat("es-CR", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });
    const fmtN = (n) => new Intl.NumberFormat("es-CR").format(n);
    function cuandoEs(fecha) {
        const ahora = new Date();
        const dia = F_DIA.format(fecha);
        if (dia === F_DIA.format(ahora)) return "hoy";
        if (dia === F_DIA.format(new Date(ahora.getTime() + 86400000))) return "mañana";
        return "el " + F_SEMANA.format(fecha);
    }
    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    /* Todas las salas (tarjetas de color). Una misma sala puede estar en dos
       pestañas: llenarInicio() las pinta todas a la vez. Las que traen
       `grande` fijo son atajos, sin número que pedir. */
    const SALAS = {
        hoy: { icono: "⚡", nombre: "Hoy entrenaste", ir: "entrenar" },
        tareas: { icono: "📋", nombre: "Tareas por hacer", href: "tareas.html" },
        puntos: { icono: "🪙", nombre: "Puntos Ajedrez", href: "puntos-tienda.html" },
        rango: { icono: "♗", nombre: "Tu rango", href: "puntos-tienda.html" },
        diagnostico: { icono: "📈", nombre: "Tu nivel", href: "entreno/diagnostico.html" },
        clases: { icono: "🗓️", nombre: "Clases esta semana", ir: "clases" },
        semana: { icono: "📅", nombre: "Esta semana" },
        mes: { icono: "📊", nombre: "Este mes" },
        proxima: { icono: "⏰", nombre: "Tu próxima clase" },
        repasar: { icono: "🎬", nombre: "Repasar mis clases", href: "repasar-clases.html", grande: "Repasar", det: "Lo que viste en cada clase" },
        cuaderno: { icono: "📓", nombre: "Mi cuaderno", href: "cuaderno.html", grande: "Anotar", det: "Tus apuntes y partidas" },
        rival: { icono: "🔍", nombre: "Preparar a un rival", href: "plan-rival.html", grande: "Preparar", det: "Su ficha y cómo juega" },
        competir: { icono: "⚔️", nombre: "Competir", href: "competir.html", grande: "Torneos", det: "Retos y partidas en vivo" }
    };
    const SALAS_INICIO = ["hoy", "tareas", "puntos", "rango", "diagnostico", "clases"];

    function armarSalas(ids, idTitulo) {
        const ul = el("ul", "jornada-salas");
        ul.setAttribute("aria-labelledby", idTitulo);
        ids.forEach((id) => {
            const s = SALAS[id];
            const li = el("li");
            const a = s.href ? el("a", "jornada-sala") : s.ir ? el("button", "jornada-sala") : el("div", "jornada-sala");
            if (s.href) a.href = s.href;
            else if (s.ir) { a.type = "button"; a.addEventListener("click", () => ir(s.ir, true)); }
            a.dataset.sala = id;
            a.appendChild(el("span", "jornada-sala-icono", s.icono)).setAttribute("aria-hidden", "true");
            a.appendChild(el("span", "jornada-sala-nombre", s.nombre));
            a.appendChild(el("span", "jornada-sala-grande", s.grande || "—"));
            a.appendChild(el("span", "jornada-sala-det", s.det || "Cargando…"));
            li.appendChild(a);
            ul.appendChild(li);
        });
        return ul;
    }

    /* La ilustración del banner: un tablero en perspectiva con dos piezas
       (cada pestaña las suyas), hecha para el sitio (no es la de ninguna otra
       página). Es adorno: va con aria-hidden y no lleva nada que se tenga que
       leer. */
    const ilustracion = (blanca, negra) => '<svg viewBox="0 0 260 170" aria-hidden="true" focusable="false">' +
        '<ellipse cx="130" cy="150" rx="118" ry="14" fill="#000" opacity=".18"/>' +
        '<g transform="translate(130 92) scale(1 .5) rotate(45)">' +
        [0, 1, 2, 3, 4, 5].map((f) => [0, 1, 2, 3, 4, 5].map((c) =>
            '<rect x="' + (c * 22 - 66) + '" y="' + (f * 22 - 66) + '" width="22" height="22" fill="' + ((f + c) % 2 ? "#0f3f48" : "#e9f3f5") + '"/>').join("")).join("") +
        '<rect x="-66" y="-66" width="132" height="132" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/></g>' +
        '<text x="104" y="96" font-size="74" text-anchor="middle" fill="#fff" stroke="#092d35" stroke-width="2" font-family="\'Segoe UI Symbol\',\'Noto Sans Symbols 2\',\'DejaVu Sans\',serif">' + blanca + '</text>' +
        '<text x="172" y="104" font-size="52" text-anchor="middle" fill="#092d35" stroke="#fff" stroke-width="1.5" font-family="\'Segoe UI Symbol\',\'Noto Sans Symbols 2\',\'DejaVu Sans\',serif">' + negra + '</text>' +
        '<circle cx="214" cy="30" r="5" fill="#f3aabb"/><circle cx="36" cy="44" r="3.5" fill="#fff" opacity=".7"/><circle cx="226" cy="64" r="2.5" fill="#fff" opacity=".7"/>' +
        '</svg>';

    // Los atajos del banner: lo que más se usa, a un toque.
    const ATAJOS = [
        { nombre: "Tareas", href: "tareas.html" },
        { nombre: "Entrenar", ir: "entrenar" },
        { nombre: "Jugar", ir: "jugar" },
        { nombre: "Repasar mis clases", href: "repasar-clases.html" },
        { nombre: "Mi cuaderno", href: "cuaderno.html" }
    ];

    function saludoDeHoy(nombre) {
        const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hour: "numeric", hourCycle: "h23" }).format(new Date()));
        const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
        const fecha = F_FECHA.format(new Date());
        return saludo + (nombre ? ", " + nombre : "") + ". " + fecha.charAt(0).toUpperCase() + fecha.slice(1) + ".";
    }

    function armarInicio(contenedor, antes) {
        const caja = el("section", "jornada-inicio");
        caja.id = "jornada-inicio";
        caja.setAttribute("aria-label", "Tu jornada");
        const izq = el("div", "jornada-inicio-principal");
        const der = el("aside", "jornada-inicio-lado");
        der.setAttribute("aria-labelledby", "jornada-viene-titulo");

        /* El banner: siempre se ve. La clase (chip, título y botón) se llena
           cuando contestan mi_proxima_clase() y mis_clases(). */
        const clase = el("div", "jornada-clase");
        clase.id = "jornada-clase";
        const texto = el("div", "jornada-clase-texto");
        const marca = el("span", "jornada-clase-marca", "Academia Ajedrez Integral");
        const chip = el("span", "jornada-clase-chip", "Buscando tu próxima clase…");
        const titulo = el("h3", "jornada-clase-titulo", "Tu jornada de ajedrez");
        const linea = el("p", "jornada-clase-linea", "Tu clase, tus tareas y tu entrenamiento, en un solo lugar.");
        const atajos = el("ul", "jornada-clase-atajos");
        atajos.setAttribute("aria-label", "Atajos");
        ATAJOS.forEach((x) => {
            const li = el("li");
            const a = x.href ? el("a", null, x.nombre) : el("button", null, x.nombre);
            if (x.href) a.href = x.href; else { a.type = "button"; a.addEventListener("click", () => ir(x.ir, true)); }
            li.appendChild(a);
            atajos.appendChild(li);
        });
        const nombreEl = document.getElementById("welcome-name");
        const saludo = el("p", "jornada-clase-saludo", saludoDeHoy(nombreEl ? nombreEl.textContent.trim() : ""));
        const botones = el("div", "jornada-clase-botones");
        const boton = el("a", "jornada-clase-boton", "Ver tus clases");
        boton.href = "#";
        boton.addEventListener("click", (e) => { if (boton.getAttribute("href") === "#") { e.preventDefault(); ir("clases", true); } });
        const entrenar = el("button", "jornada-clase-boton2", "Entrenar");
        entrenar.type = "button";
        entrenar.addEventListener("click", () => ir("entrenar", true));
        const buscar = el("button", "jornada-clase-boton2", "Buscar");
        buscar.type = "button";
        buscar.addEventListener("click", () => { const c = document.getElementById("buscar-panel-campo"); if (c) c.focus(); });
        botones.append(boton, entrenar, buscar);
        texto.append(marca, chip, titulo, linea, atajos, saludo, botones);
        const dibujo = el("div", "jornada-clase-dibujo");
        dibujo.innerHTML = ilustracion("♘", "♚");
        clase.append(texto, dibujo);
        izq.appendChild(clase);

        const tituloSalas = el("h2", "jornada-titulo-sec", "Tus salas");
        tituloSalas.id = "jornada-salas-titulo";
        izq.append(tituloSalas, armarSalas(SALAS_INICIO, "jornada-salas-titulo"));

        // Los cuatro gráficos: cada uno con sus números escritos debajo.
        izq.appendChild(armarGraficos(GRAFICOS.map((g) => g.id), ""));

        const tituloViene = el("h2", "jornada-titulo-sec", "Lo que viene");
        tituloViene.id = "jornada-viene-titulo";
        const viene = el("ul", "jornada-viene");
        viene.id = "jornada-viene";
        viene.appendChild(el("li", "jornada-viene-vacio", "Cargando…"));
        der.append(tituloViene, viene);

        caja.append(izq, der);
        contenedor.insertBefore(caja, antes);
        llenarInicio();
    }

    // Los gráficos de la lista `ids`; `prefijo` hace únicos los id de sus títulos.
    function armarGraficos(ids, prefijo) {
        const graficos = el("div", "jornada-graficos");
        ids.forEach((id) => {
            const g = GRAFICOS.find((x) => x.id === id);
            const t = el("section", "jornada-grafico");
            t.dataset.grafico = g.id;
            t.setAttribute("aria-labelledby", "jornada-g-" + prefijo + g.id);
            const h = el("h3", "jornada-grafico-titulo", g.titulo);
            h.id = "jornada-g-" + prefijo + g.id;
            t.append(h, el("p", "jornada-grafico-sub", g.sub), el("div", "jornada-grafico-dibujo"), el("ul", "jornada-grafico-datos"));
            t.querySelector(".jornada-grafico-datos").appendChild(el("li", null, "Cargando…"));
            graficos.appendChild(t);
        });
        return graficos;
    }

    /* ---------- Las otras pestañas, con la forma del Inicio ----------
       Cada una abre con su banner (sus piezas, sus atajos) y cuatro salas de
       color. Los números son los mismos del Inicio, de las mismas consultas:
       llenarInicio() pinta todas las salas que se llamen igual. */
    const CABECERAS = {
        clases: {
            titulo: "Tus clases", linea: "Tu horario, la clase en vivo y lo que viste en cada una.", piezas: ["♖", "♔"],
            salas: ["clases", "proxima", "repasar", "cuaderno"],
            botones: [{ nombre: "Repasar mis clases", href: "repasar-clases.html" }, { nombre: "Mi cuaderno", href: "cuaderno.html" }]
        },
        entrenar: {
            titulo: "Entrenar", linea: "Elige qué quieres mejorar hoy: cada sección trae sus ejercicios.", piezas: ["♗", "♚"],
            salas: ["hoy", "semana", "mes", "diagnostico"],
            botones: [{ nombre: "Mis tareas", href: "tareas.html" }, { nombre: "Hacer el diagnóstico", href: "entreno/diagnostico.html" }]
        },
        jugar: {
            titulo: "Jugar y competir", linea: "Partidas, torneos y retos con tus compañeros.", piezas: ["♘", "♛"],
            salas: ["rango", "puntos", "rival", "competir"],
            botones: [{ nombre: "Competir", href: "competir.html" }, { nombre: "Preparar a un rival", href: "plan-rival.html" }]
        },
        perfil: {
            titulo: "Tu perfil", linea: "Tus puntos, tu rango y tu nivel, de un vistazo.", piezas: ["♕", "♔"],
            salas: ["puntos", "rango", "diagnostico", "tareas"],
            botones: [{ nombre: "Tienda de puntos", href: "puntos-tienda.html" }, { nombre: "Configuración", href: "configuracion.html" }]
        }
    };

    function armarCabeceras(contenedor, antes) {
        Object.keys(CABECERAS).forEach((pestana) => {
            const c = CABECERAS[pestana];
            const caja = el("section", "jornada-cabecera");
            caja.id = "jornada-cabecera-" + pestana;
            caja.dataset.jornada = pestana;
            caja.setAttribute("aria-labelledby", "jornada-cab-" + pestana);
            const banner = el("div", "jornada-clase");
            const texto = el("div", "jornada-clase-texto");
            const titulo = el("h3", "jornada-clase-titulo", c.titulo);
            titulo.id = "jornada-cab-" + pestana;
            const botones = el("div", "jornada-clase-botones");
            c.botones.forEach((b, i) => {
                const a = el("a", i === 0 ? "jornada-clase-boton" : "jornada-clase-boton2", b.nombre);
                a.href = b.href;
                botones.appendChild(a);
            });
            texto.append(el("span", "jornada-clase-marca", "Academia Ajedrez Integral"), titulo, el("p", "jornada-clase-linea", c.linea), botones);
            const dibujo = el("div", "jornada-clase-dibujo");
            dibujo.innerHTML = ilustracion(c.piezas[0], c.piezas[1]);
            banner.append(texto, dibujo);
            const tituloSalas = el("h2", "sr-only", "De un vistazo: " + c.titulo.toLowerCase());
            tituloSalas.id = "jornada-cab-salas-" + pestana;
            caja.append(banner, tituloSalas, armarSalas(c.salas, tituloSalas.id));
            contenedor.insertBefore(caja, antes);
        });
    }

    /* ---------- La portada de Entrenar ----------
       Al tocar Entrenar no salen todas las tarjetas de golpe (eran más de
       treinta): salen sus seis secciones como cartas, cada una con cuántas
       herramientas trae y cuáles, y sus dos gráficos. Una carta abre su
       sección, igual que el menú. El plan de hoy («Hoy te toca») no está
       acá: va solo en Inicio. Lo que trae cada carta se lee de la grilla real
       (llenarPortada), así que nunca promete una tarjeta que no está. */
    const PORTADA = {
        "Estudiar": { icono: "📖", color: "#1f56b8" },
        "Aprender": { icono: "🎓", color: "#5b3cb0" },
        "Entrenamiento básico": { icono: "♙", color: "#156c3b" },
        "Entrenamiento intermedio": { icono: "♘", color: "#0b6a72" },
        "Entrenamiento avanzado": { icono: "♛", color: "#a8264c" },
        "Mejorar por habilidades": { icono: "🎯", color: "#9c450b" }
    };

    function armarPortada() {
        const ancla = document.getElementById("jornada-cabecera-entrenar");
        if (!ancla) return;
        const p = el("section", "jornada-portada");
        p.id = "jornada-entrenar-portada";
        p.dataset.jornada = "entrenar";
        p.setAttribute("data-portada", "");
        p.setAttribute("aria-labelledby", "jornada-portada-titulo");
        const h = el("h2", "jornada-titulo-sec", "¿Qué quieres entrenar hoy?");
        h.id = "jornada-portada-titulo";
        const ul = el("ul", "jornada-portada-lista");
        SUBSECCIONES.entrenar.forEach((s) => {
            const li = el("li");
            const b = el("button", "jornada-portada-carta");
            b.type = "button";
            b.dataset.portadaGrupo = s.grupo;
            b.style.setProperty("--carta", PORTADA[s.grupo].color);
            b.appendChild(el("span", "jornada-portada-icono", PORTADA[s.grupo].icono)).setAttribute("aria-hidden", "true");
            b.appendChild(el("b", "jornada-portada-nombre", s.nombre));
            b.appendChild(el("span", "jornada-portada-trae", ""));
            b.appendChild(el("span", "jornada-portada-ir", "Abrir")).setAttribute("aria-hidden", "true");
            b.addEventListener("click", () => ir("entrenar", true, s.grupo));
            li.appendChild(b);
            ul.appendChild(li);
        });
        p.append(h, ul, armarGraficos(["semana", "meses"], "e-"));
        ancla.after(p);
        llenarPortada();
    }

    function llenarPortada() {
        document.querySelectorAll(".jornada-portada-carta").forEach((b) => {
            const s = Array.from(document.querySelectorAll("#tile-grid > section")).find((x) => x.dataset.grupo === b.dataset.portadaGrupo);
            const nombres = s ? Array.from(s.querySelectorAll("span.flex-col > span.font-semibold:first-child")).map((x) => x.textContent.trim()).filter(Boolean) : [];
            // Un grupo que esta cuenta no tiene no ofrece carta.
            b.parentElement.hidden = !nombres.length;
            b.querySelector(".jornada-portada-trae").textContent = nombres.length
                ? (nombres.length === 1 ? "1 herramienta: " : nombres.length + " herramientas: ") + nombres.slice(0, 3).join(", ") + (nombres.length > 3 ? "…" : "")
                : "";
        });
    }

    // `numero`, si viene, es la cifra con la que empieza `grande`: esa cuenta hacia arriba.
    function sala(id, grande, det, numero) {
        document.querySelectorAll('.jornada-sala[data-sala="' + id + '"]').forEach((a) => {
            const span = a.querySelector(".jornada-sala-grande");
            span.textContent = grande;
            a.querySelector(".jornada-sala-det").textContent = det;
            if (typeof numero === "number" && grande.startsWith(fmtN(numero))) contar(span, numero, grande.slice(fmtN(numero).length));
        });
    }

    async function llenarInicio() {
        const sb = window.sb;
        if (!sb) return;
        const { data: ses } = await sb.auth.getSession();
        const uid = ses && ses.session && ses.session.user && ses.session.user.id;
        // Cada consulta aparte: una que revienta (aun antes de salir) no arrastra a las demás.
        const pedir = (fn) => { try { return Promise.resolve(fn()).then((r) => r, (e) => ({ error: e })); } catch (e) { return Promise.resolve({ error: e }); } };
        const meses = ultimosMeses(6);
        const [proxima, misClases, semanaClases, tareas, entreno, rango, diag, saldo, ...porMes] = await Promise.all([
            pedir(() => sb.rpc("mi_proxima_clase")),
            pedir(() => sb.rpc("mis_clases")),
            pedir(() => sb.rpc("mis_clases_proximas", { p_dias: 14 })),
            // Todas (no solo las pendientes): el gráfico cuenta también las completadas.
            pedir(() => sb.rpc("tareas_con_avance", { p_alumno: uid, p_pendientes: false, p_limite: 50 })),
            pedir(() => sb.rpc("entreno_mi_semana", { alumno: uid })),
            pedir(() => sb.rpc("mi_rango", { p_alumno: uid })),
            pedir(() => sb.rpc("informes_diagnosticos_alumnos")),
            pedir(() => window.Puntos.saldo(sb, uid).then((n) => ({ data: n }))),
            ...meses.map((m) => pedir(() => sb.rpc("entreno_mi_mes", { alumno: uid, p_mes: m.p_mes })))
        ]);
        const sinDato = "No se pudo cargar";

        // La clase.
        const abierta = !misClases.error && Array.isArray(misClases.data) && misClases.data.find((c) => c.clase_abierta);
        const prox = !proxima.error && Array.isArray(proxima.data) && proxima.data[0] && proxima.data[0].inicio ? proxima.data[0] : null;
        pintarClase(abierta, prox, !!(proxima.error && misClases.error));
        if (abierta) sala("proxima", "Ahora", "Tu clase está abierta");
        else if (prox) {
            const inicio = new Date(prox.inicio);
            const cuando = cuandoEs(inicio);
            sala("proxima", cuando.charAt(0).toUpperCase() + cuando.slice(1), "A las " + F_HORA.format(inicio) + (prox.titulo ? " · " + String(prox.titulo).slice(0, 30) : ""));
        } else sala("proxima", "—", proxima.error ? sinDato : "Sin clase programada");

        // Hoy entrenaste (y la semana): los días de entreno_mi_semana(), el último es hoy.
        const ejercicios = (n) => fmtN(n) + (n === 1 ? " ejercicio" : " ejercicios");
        if (entreno.error || !entreno.data) { sala("hoy", "—", sinDato); sala("semana", "—", sinDato); grafico("semana", null, [], true); }
        else {
            const dias = Array.isArray(entreno.data.dias) ? entreno.data.dias : [];
            const hoy = dias.length ? Number(dias[dias.length - 1].n) || 0 : 0;
            const semana = dias.reduce((s, d) => s + (Number(d.n) || 0), 0);
            sala("hoy", ejercicios(hoy), "Esta semana: " + fmtN(semana), hoy);
            const lista = dias.map((d, i) => ({ n: Number(d.n) || 0, corto: i === dias.length - 1 ? "hoy" : diaCorto(d.dia) }));
            const mejor = lista.reduce((a, d) => (d.n > a.n ? d : a), { n: -1 });
            const conEntreno = lista.filter((d) => d.n > 0).length;
            sala("semana", ejercicios(semana), conEntreno === 1 ? "1 día con entrenamiento" : conEntreno + " días con entrenamiento", semana);
            grafico("semana", lista.length ? barras(lista) : null, [
                { nombre: "Esta semana", valor: fmtN(semana) + (semana === 1 ? " ejercicio" : " ejercicios") },
                { nombre: "Hoy", valor: fmtN(hoy) },
                { nombre: "Tu mejor día", valor: mejor.n > 0 ? fmtN(mejor.n) : "—" }
            ]);
        }

        // Tareas: por hacer son las pendientes que no vencieron (las programadas todavía no se ven).
        const ahora = Date.now();
        const todas = tareas.error || !Array.isArray(tareas.data) ? null : tareas.data.filter((t) => t.situacion !== "programada");
        const completas = todas ? todas.filter((t) => t.situacion === "completada") : [];
        const porHacer = !todas ? null
            : todas.filter((t) => t.situacion !== "completada" && (!t.vence_at || Date.parse(t.vence_at) > ahora))
                .sort((a, b) => (Date.parse(a.vence_at || "9999") - Date.parse(b.vence_at || "9999")));
        if (!todas) grafico("tareas", null, [], true);
        else {
            const vencidas = todas.length - completas.length - porHacer.length;
            const partes = [
                { nombre: "Completadas", n: completas.length, color: "#1a7b44" },
                { nombre: "Por hacer", n: porHacer.length, color: color("brand-500") },
                { nombre: "Vencidas", n: vencidas, color: color("accent-700") }
            ];
            grafico("tareas", apilada(partes), partes.map((p) => ({ nombre: p.nombre, valor: fmtN(p.n), color: p.color })));
        }

        // Tu entrenamiento por mes.
        if (porMes.every((r) => r.error || !r.data)) { grafico("meses", null, [], true); sala("mes", "—", sinDato); }
        else {
            const lista = meses.map((m, i) => ({ corto: m.corto, n: porMes[i] && porMes[i].data ? Number(porMes[i].data.ejercicios) || 0 : 0 }));
            const total = lista.reduce((a, m) => a + m.n, 0);
            const este = lista[lista.length - 1].n;
            sala("mes", ejercicios(este), "El mes pasado: " + fmtN(lista[lista.length - 2].n), este);
            grafico("meses", linea(lista), [
                { nombre: "Este mes", valor: fmtN(lista[lista.length - 1].n) },
                { nombre: "El mes pasado", valor: fmtN(lista[lista.length - 2].n) },
                { nombre: "En seis meses", valor: fmtN(total) }
            ]);
        }
        if (!porHacer) sala("tareas", "—", sinDato);
        else if (!porHacer.length) sala("tareas", "0", "Estás al día");
        else {
            const t = porHacer[0];
            sala("tareas", fmtN(porHacer.length), "«" + String(t.titulo || "Tarea").slice(0, 40) + "»" + (t.vence_at ? ", vence " + cuandoEs(new Date(t.vence_at)) : ""), porHacer.length);
        }

        // Puntos y rango.
        if (saldo.error || saldo.data == null) sala("puntos", "—", sinDato);
        else sala("puntos", fmtN(saldo.data), "Canjéalos en la tienda", Number(saldo.data));
        const r = !rango.error && Array.isArray(rango.data) ? rango.data[0] : (!rango.error ? rango.data : null);
        if (!r) { sala("rango", "—", sinDato); grafico("rango", null, [], true); }
        else {
            const nombre = r.nombre || r.rango || "Peón";
            const puntos = Number(r.puntos) || 0;
            const sig = r.siguiente_nombre && r.umbral_siguiente ? "Para " + r.siguiente_nombre + ": " + fmtN(Math.max(0, r.umbral_siguiente - puntos)) + " puntos" : fmtN(puntos) + " puntos ganados";
            sala("rango", nombre.charAt(0).toUpperCase() + nombre.slice(1), sig);
            // El avance se mide desde donde empieza el rango actual (js/rangos.js, una sola copia).
            const desde = window.Rangos && window.Rangos.rango ? window.Rangos.rango(r.rango).desde : 0;
            if (r.umbral_siguiente && r.umbral_siguiente > desde) {
                const f = (puntos - desde) / (r.umbral_siguiente - desde);
                const pct = Math.max(0, Math.min(100, Math.round(f * 100)));
                grafico("rango", dona(f, pct + " %"), [
                    { nombre: "Rango actual", valor: nombre.charAt(0).toUpperCase() + nombre.slice(1) },
                    { nombre: "Hacia " + r.siguiente_nombre, valor: pct + " %" },
                    { nombre: "Te faltan", valor: fmtN(Math.max(0, r.umbral_siguiente - puntos)) + " puntos" }
                ]);
            } else {
                grafico("rango", dona(1, "★"), [{ nombre: "Rango actual", valor: nombre.charAt(0).toUpperCase() + nombre.slice(1) }, { nombre: "Puntos ganados", valor: fmtN(puntos) }]);
            }
        }

        // Tu nivel: el último diagnóstico propio.
        if (diag.error) sala("diagnostico", "—", sinDato);
        else {
            const mio = (diag.data || []).find((f) => f.student_id === uid);
            const nivel = mio && mio.detalle && (mio.detalle.nivel_etiqueta || mio.detalle.nivel);
            if (!mio) sala("diagnostico", "Sin hacer", "Haz el diagnóstico: ubica tu nivel");
            else sala("diagnostico", nivel ? String(nivel).charAt(0).toUpperCase() + String(nivel).slice(1) : "Hecho",
                mio.fecha ? "El " + F_FECHA.format(new Date(mio.fecha)) : "Tu último diagnóstico");
        }

        // Clases esta semana y lo que viene.
        const clases = semanaClases.error || !Array.isArray(semanaClases.data) ? null : semanaClases.data;
        if (!clases) sala("clases", "—", sinDato);
        else {
            const enSiete = clases.filter((c) => Date.parse(c.inicio) - ahora < 7 * 86400000 && Date.parse(c.fin || c.inicio) > ahora);
            sala("clases", fmtN(enSiete.length), enSiete.length ? "La próxima, " + cuandoEs(new Date(enSiete[0].inicio)) + " a las " + F_HORA.format(new Date(enSiete[0].inicio)) : "Sin clases en los próximos 7 días", enSiete.length);
        }
        pintarLoQueViene(clases || [], porHacer || [], !clases && !porHacer);
    }

    function pintarClase(abierta, prox, fallo) {
        const caja = document.getElementById("jornada-clase");
        if (!caja) return;
        const chip = caja.querySelector(".jornada-clase-chip");
        const titulo = caja.querySelector(".jornada-clase-titulo");
        const linea = caja.querySelector(".jornada-clase-linea");
        const boton = caja.querySelector(".jornada-clase-boton");
        if (abierta) {
            chip.textContent = "Tu clase está abierta";
            titulo.textContent = abierta.titulo_clase || "Clase en vivo";
            linea.textContent = "Con " + (abierta.profesor || "tu profe");
            boton.href = "sesion.html";
            boton.textContent = "Entrar a la clase";
        } else if (prox) {
            const inicio = new Date(prox.inicio);
            chip.textContent = "Tu próxima clase: " + cuandoEs(inicio) + " a las " + F_HORA.format(inicio);
            titulo.textContent = prox.titulo || "Tu próxima clase";
            linea.textContent = [prox.profesor ? "Con " + prox.profesor : "", prox.modalidad === "en_linea" ? "en línea" : "presencial"].filter(Boolean).join(" · ");
            boton.href = "#";
            boton.textContent = "Ver tus clases";
        } else {
            chip.textContent = fallo ? "No se pudo cargar tu próxima clase" : "Sin clase programada";
            boton.href = "#";
            boton.textContent = "Ver tus clases";
        }
    }

    /* ---------- Los gráficos ----------
       SVG dibujado aquí, con aria-hidden: el dato de verdad va escrito en la
       lista de debajo de cada uno (y es lo que lee el lector de pantalla y
       lo que comprueba el verificador). Los colores salen del tema, salvo los
       tres de las tareas, que se distinguen también por su nombre escrito. */
    const GRAFICOS = [
        { id: "semana", titulo: "Ejercicios de la semana", sub: "Lo que resolviste cada día, hasta hoy" },
        { id: "rango", titulo: "Camino a tu próximo rango", sub: "Los puntos ganados desde tu rango actual" },
        { id: "tareas", titulo: "Tus tareas", sub: "Las que te puso tu profe, por cómo van" },
        { id: "meses", titulo: "Tu entrenamiento por mes", sub: "Ejercicios de los últimos seis meses" }
    ];
    const SVG = "http://www.w3.org/2000/svg";
    function svgEl(tag, attrs) {
        const e = document.createElementNS(SVG, tag);
        Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
        return e;
    }
    function lienzo(ancho, alto) {
        const s = svgEl("svg", { viewBox: "0 0 " + ancho + " " + alto, "aria-hidden": "true", focusable: "false" });
        return s;
    }
    // Pinta todos los gráficos con ese id (el de la semana está en Inicio y en Entrenar).
    function grafico(id, dibujo, datos, fallo) {
        document.querySelectorAll('.jornada-grafico[data-grafico="' + id + '"]').forEach((t, i) => {
            const d = t.querySelector(".jornada-grafico-dibujo");
            const ul = t.querySelector(".jornada-grafico-datos");
            d.textContent = "";
            ul.textContent = "";
            if (fallo) { ul.appendChild(el("li", null, "No se pudo cargar")); return; }
            if (dibujo) d.appendChild(i === 0 ? dibujo : dibujo.cloneNode(true));
            datos.forEach((x) => {
                const li = el("li");
                if (x.color) { const m = el("span", "jornada-grafico-marca"); m.style.background = x.color; m.setAttribute("aria-hidden", "true"); li.appendChild(m); }
                li.appendChild(el("span", null, x.nombre));
                li.appendChild(el("b", null, x.valor));
                ul.appendChild(li);
            });
        });
    }
    const color = (v) => "rgb(var(--c-" + v + "))";

    function barras(dias) {
        const s = lienzo(280, 120);
        const max = Math.max(1, ...dias.map((d) => d.n));
        const ancho = 280 / dias.length;
        dias.forEach((d, i) => {
            const h = Math.round((d.n / max) * 82);
            s.appendChild(svgEl("rect", { x: i * ancho + 8, y: 96 - h, width: ancho - 16, height: Math.max(h, 2), rx: 5,
                fill: i === dias.length - 1 ? color("brand-600") : color("brand-300") }));
            const n = svgEl("text", { x: i * ancho + ancho / 2, y: 92 - h, "text-anchor": "middle", class: "jornada-svg-num" });
            n.textContent = String(d.n);
            s.appendChild(n);
            const e = svgEl("text", { x: i * ancho + ancho / 2, y: 114, "text-anchor": "middle", class: "jornada-svg-eje" });
            e.textContent = d.corto;
            s.appendChild(e);
        });
        return s;
    }

    function dona(fraccion, centro) {
        const s = lienzo(140, 140);
        const r = 54, largo = 2 * Math.PI * r;
        s.appendChild(svgEl("circle", { cx: 70, cy: 70, r: r, fill: "none", stroke: color("brand-100"), "stroke-width": 16 }));
        s.appendChild(svgEl("circle", { cx: 70, cy: 70, r: r, fill: "none", stroke: color("accent-600"), "stroke-width": 16, "stroke-linecap": "round",
            "stroke-dasharray": (largo * Math.max(0, Math.min(1, fraccion))) + " " + largo, transform: "rotate(-90 70 70)" }));
        const t = svgEl("text", { x: 70, y: 77, "text-anchor": "middle", class: "jornada-svg-centro" });
        t.textContent = centro;
        s.appendChild(t);
        return s;
    }

    function apilada(partes) {
        const s = lienzo(280, 28);
        const total = partes.reduce((a, p) => a + p.n, 0);
        let x = 0;
        if (!total) s.appendChild(svgEl("rect", { x: 0, y: 4, width: 280, height: 20, rx: 10, fill: color("brand-100") }));
        partes.forEach((p) => {
            if (!p.n) return;
            const w = (p.n / total) * 280;
            s.appendChild(svgEl("rect", { x: x, y: 4, width: Math.max(w - 2, 2), height: 20, rx: 4, fill: p.color }));
            x += w;
        });
        return s;
    }

    function linea(meses) {
        const s = lienzo(280, 120);
        const max = Math.max(1, ...meses.map((m) => m.n));
        const paso = 280 / (meses.length - 1 || 1);
        const pts = meses.map((m, i) => [Math.round(i * paso * 0.9 + 14), Math.round(96 - (m.n / max) * 76)]);
        s.appendChild(svgEl("path", { d: "M" + pts.map((p) => p.join(" ")).join(" L") + " L" + pts[pts.length - 1][0] + " 98 L" + pts[0][0] + " 98 Z", fill: color("brand-200"), opacity: ".55" }));
        s.appendChild(svgEl("path", { d: "M" + pts.map((p) => p.join(" ")).join(" L"), fill: "none", stroke: color("brand-500"), "stroke-width": 3, "stroke-linejoin": "round" }));
        pts.forEach((p, i) => {
            s.appendChild(svgEl("circle", { cx: p[0], cy: p[1], r: i === pts.length - 1 ? 5 : 3.5, fill: i === pts.length - 1 ? color("accent-600") : color("brand-500") }));
            const e = svgEl("text", { x: p[0], y: 114, "text-anchor": "middle", class: "jornada-svg-eje" });
            e.textContent = meses[i].corto;
            s.appendChild(e);
        });
        return s;
    }

    // Los últimos seis meses de calendario de Costa Rica, el actual al final.
    function ultimosMeses(n) {
        const [y, m] = F_DIA.format(new Date()).split("-").map(Number);
        const fuera = [];
        for (let i = n - 1; i >= 0; i--) {
            const fecha = new Date(Date.UTC(y, m - 1 - i, 1, 12));
            fuera.push({ p_mes: fecha.getUTCFullYear() + "-" + String(fecha.getUTCMonth() + 1).padStart(2, "0") + "-01", corto: new Intl.DateTimeFormat("es-CR", { timeZone: "UTC", month: "short" }).format(fecha).replace(".", "") });
        }
        return fuera;
    }
    // El día de la semana de una fecha «AAAA-MM-DD» (sin pasar por new Date("AAAA-MM-DD")).
    function diaCorto(iso) {
        const p = String(iso || "").split("-").map(Number);
        if (p.length !== 3 || !p[0]) return "";
        return new Intl.DateTimeFormat("es-CR", { timeZone: "UTC", weekday: "narrow" }).format(new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)));
    }

    function pintarLoQueViene(clases, tareas, fallo) {
        const lista = document.getElementById("jornada-viene");
        if (!lista) return;
        lista.textContent = "";
        const ahora = Date.now();
        const cosas = []
            .concat(clases.filter((c) => Date.parse(c.fin || c.inicio) > ahora).slice(0, 3).map((c) => ({
                cuando: new Date(c.inicio), que: c.titulo || "Clase", det: (c.modalidad === "en_linea" ? "En línea" : "Presencial") + (c.profesor ? " · " + c.profesor : ""), tipo: "clase"
            })))
            .concat(tareas.filter((t) => t.vence_at).slice(0, 3).map((t) => ({
                cuando: new Date(t.vence_at), que: "Vence «" + String(t.titulo || "Tarea").slice(0, 40) + "»", det: (t.cumplidos || 0) + " de " + (t.renglones || 0) + " hechos", tipo: "tarea"
            })))
            .sort((a, b) => a.cuando - b.cuando)
            .slice(0, 5);
        if (!cosas.length) {
            lista.appendChild(el("li", "jornada-viene-vacio", fallo ? "No se pudo cargar lo que viene." : "Nada en los próximos días."));
            return;
        }
        cosas.forEach((c) => {
            const li = el("li", "jornada-viene-item" + (c.tipo === "clase" ? " es-clase" : ""));
            const cuando = cuandoEs(c.cuando);
            li.appendChild(el("span", "jornada-viene-cuando", cuando.charAt(0).toUpperCase() + cuando.slice(1) + " · " + F_HORA.format(c.cuando)));
            li.appendChild(el("b", null, c.que));
            li.appendChild(el("span", "jornada-viene-det", c.det));
            lista.appendChild(li);
        });
    }

    // clases.html#entrenar y compañía: abre la pestaña donde vive lo que se pide.
    function irAlHash() {
        const id = decodeURIComponent(location.hash.slice(1));
        if (!id) return false;
        const el = document.getElementById(id);
        const conPestana = el && el.closest("[data-jornada]");
        if (!conPestana) return false;
        // Si vive en dos pestañas, la primera. Un grupo de Entrenar se abre como
        // su sección: la pestaña entera es la portada y lo dejaría tapado.
        const p = pestanasDe(conPestana)[0];
        const sec = conPestana.dataset.grupo && (SUBSECCIONES[p] || []).some((s) => s.grupo === conPestana.dataset.grupo) ? conPestana.dataset.grupo : null;
        ir(p, false, sec);
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
        // Si la base no contestó, no se sabe: null (y el tema no se toca).
        if (!vista || vista.error || !perfil || perfil.error) return null;
        return !!(vista.data && perfil.data && perfil.data.role === "alumno");
    }

    /* El aspecto del panel jornada en TODO el sitio: el tema «jornada» de
       js/temas-plataforma.js (oculto en Configuración). Los temas son una
       preferencia de este navegador (localStorage) que el <head> de cada página
       pone antes de pintar, sin parpadeo; así que basta con dejarlo puesto
       aquí, en el panel, que es a donde se llega al entrar. Se guarda el tema
       que había para devolverlo si la cuenta deja la prueba o si entra otra
       cuenta en este navegador. Solo con respuesta de la base: un error de red
       no le cambia el tema a nadie. */
    const CLAVE_TEMA = "plataforma_tema_v1";
    const CLAVE_PREVIO = "panel_jornada_tema_previo_v1";
    function temaDeLaPrueba(enPrueba) {
        try {
            const html = document.documentElement;
            const actualTema = localStorage.getItem(CLAVE_TEMA);
            if (enPrueba) {
                if (actualTema === "jornada") return;
                localStorage.setItem(CLAVE_PREVIO, actualTema || "");
                localStorage.setItem(CLAVE_TEMA, "jornada");
                html.setAttribute("data-tema", "jornada");
            } else if (actualTema === "jornada") {
                const previo = localStorage.getItem(CLAVE_PREVIO) || "";
                localStorage.removeItem(CLAVE_PREVIO);
                if (previo && previo !== "jornada" && previo !== "clasico") {
                    localStorage.setItem(CLAVE_TEMA, previo);
                    html.setAttribute("data-tema", previo);
                } else {
                    localStorage.removeItem(CLAVE_TEMA);
                    html.removeAttribute("data-tema");
                }
            }
        } catch (e) { /* sin almacenamiento: el sitio se queda como está */ }
    }

    function cuandoSeVeaElPanel(fn) {
        const app = document.getElementById("app");
        if (!app) return;
        const listo = () => !app.classList.contains("hidden");
        if (listo()) { fn(); return; }
        const obs = new MutationObserver(() => { if (listo()) { obs.disconnect(); fn(); } });
        obs.observe(app, { attributes: true, attributeFilter: ["class"] });
    }

    const pedido = corresponde().catch(() => null);
    cuandoSeVeaElPanel(async () => {
        const enPrueba = await pedido;
        if (enPrueba === null) return;
        // El panel adaptado (alumno ciego) y el panel docente se quedan como están.
        const adaptado = !!document.getElementById("panel-adaptado-nota");
        temaDeLaPrueba(enPrueba && !adaptado);
        if (!enPrueba || adaptado) return;
        armar();
    });

    window.PanelJornada = { ir, PESTANAS, SECCIONES, GRUPOS, SUBSECCIONES, temaDeLaPrueba };
})();

/*! rev bfb5bbb0d2d82f9f */
