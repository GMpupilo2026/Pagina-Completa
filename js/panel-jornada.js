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
        // «Hoy te toca» completo va en Entrenar: en Inicio lo resume su sala.
        "progreso-alumno": "entrenar",
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
            const enLaPestana = pestanasDe(el).includes(actual);
            // Con una sección elegida, de los grupos de tarjetas solo queda ese.
            const otroGrupo = !!(seccion && el.dataset.grupo && el.dataset.grupo !== seccion);
            el.classList.toggle("jornada-fuera", !todo && (!enLaPestana || otroGrupo));
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
        }
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
            todo.textContent = "Todo";
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

        if (grilla) new MutationObserver(() => { marcar(); aplicar(); }).observe(grilla, { childList: true });
        const campo = document.getElementById("buscar-panel-campo");
        if (campo) campo.addEventListener("input", aplicar);
        window.addEventListener("hashchange", irAlHash);
    }

    /* ---------- El Inicio nuevo: la clase, las salas y lo que viene ----------
       Como el de Chessgora: arriba la clase en una tarjeta azul, debajo seis
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

    const SALAS = [
        { id: "hoy", icono: "⚡", nombre: "Hoy entrenaste", ir: "entrenar" },
        { id: "tareas", icono: "📋", nombre: "Tareas por hacer", href: "tareas.html" },
        { id: "puntos", icono: "🪙", nombre: "Puntos Ajedrez", href: "puntos-tienda.html" },
        { id: "rango", icono: "♗", nombre: "Tu rango", href: "puntos-tienda.html" },
        { id: "diagnostico", icono: "📈", nombre: "Tu nivel", href: "entreno/diagnostico.html" },
        { id: "clases", icono: "🗓️", nombre: "Clases esta semana", ir: "clases" }
    ];

    function armarInicio(contenedor, antes) {
        const caja = el("section", "jornada-inicio");
        caja.id = "jornada-inicio";
        caja.setAttribute("aria-label", "Tu jornada");
        const izq = el("div", "jornada-inicio-principal");
        const der = el("aside", "jornada-inicio-lado");
        der.setAttribute("aria-labelledby", "jornada-viene-titulo");

        // La clase: se llena cuando contestan mi_proxima_clase() y mis_clases().
        const clase = el("div", "jornada-clase");
        clase.id = "jornada-clase";
        clase.hidden = true;
        izq.appendChild(clase);

        const tituloSalas = el("h2", "jornada-titulo-sec", "Tus salas");
        tituloSalas.id = "jornada-salas-titulo";
        const salas = el("ul", "jornada-salas");
        salas.setAttribute("aria-labelledby", "jornada-salas-titulo");
        SALAS.forEach((s) => {
            const li = el("li");
            const a = s.href ? el("a", "jornada-sala") : el("button", "jornada-sala");
            if (s.href) a.href = s.href; else { a.type = "button"; a.addEventListener("click", () => ir(s.ir, true)); }
            a.dataset.sala = s.id;
            a.appendChild(el("span", "jornada-sala-icono", s.icono)).setAttribute("aria-hidden", "true");
            a.appendChild(el("span", "jornada-sala-nombre", s.nombre));
            a.appendChild(el("span", "jornada-sala-grande", "—"));
            a.appendChild(el("span", "jornada-sala-det", "Cargando…"));
            li.appendChild(a);
            salas.appendChild(li);
        });
        izq.append(tituloSalas, salas);

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

    function sala(id, grande, det) {
        const a = document.querySelector('.jornada-sala[data-sala="' + id + '"]');
        if (!a) return;
        a.querySelector(".jornada-sala-grande").textContent = grande;
        a.querySelector(".jornada-sala-det").textContent = det;
    }

    async function llenarInicio() {
        const sb = window.sb;
        if (!sb) return;
        const { data: ses } = await sb.auth.getSession();
        const uid = ses && ses.session && ses.session.user && ses.session.user.id;
        // Cada consulta aparte: una que revienta (aun antes de salir) no arrastra a las demás.
        const pedir = (fn) => { try { return Promise.resolve(fn()).then((r) => r, (e) => ({ error: e })); } catch (e) { return Promise.resolve({ error: e }); } };
        const [proxima, misClases, semanaClases, tareas, entreno, rango, diag, saldo] = await Promise.all([
            pedir(() => sb.rpc("mi_proxima_clase")),
            pedir(() => sb.rpc("mis_clases")),
            pedir(() => sb.rpc("mis_clases_proximas", { p_dias: 14 })),
            pedir(() => sb.rpc("tareas_con_avance", { p_alumno: uid, p_pendientes: true, p_limite: 50 })),
            pedir(() => sb.rpc("entreno_mi_semana", { alumno: uid })),
            pedir(() => sb.rpc("mi_rango", { p_alumno: uid })),
            pedir(() => sb.rpc("informes_diagnosticos_alumnos")),
            pedir(() => window.Puntos.saldo(sb, uid).then((n) => ({ data: n })))
        ]);
        const sinDato = "No se pudo cargar";

        // La clase.
        const abierta = !misClases.error && Array.isArray(misClases.data) && misClases.data.find((c) => c.clase_abierta);
        const prox = !proxima.error && Array.isArray(proxima.data) && proxima.data[0] && proxima.data[0].inicio ? proxima.data[0] : null;
        pintarClase(abierta, prox);

        // Hoy entrenaste (y la semana): los días de entreno_mi_semana(), el último es hoy.
        if (entreno.error || !entreno.data) sala("hoy", "—", sinDato);
        else {
            const dias = Array.isArray(entreno.data.dias) ? entreno.data.dias : [];
            const hoy = dias.length ? Number(dias[dias.length - 1].n) || 0 : 0;
            const semana = dias.reduce((s, d) => s + (Number(d.n) || 0), 0);
            sala("hoy", fmtN(hoy) + (hoy === 1 ? " ejercicio" : " ejercicios"), "Esta semana: " + fmtN(semana));
        }

        // Tareas por hacer: las pendientes que no vencieron.
        const ahora = Date.now();
        const porHacer = tareas.error || !Array.isArray(tareas.data) ? null
            : tareas.data.filter((t) => !t.vence_at || Date.parse(t.vence_at) > ahora)
                .sort((a, b) => (Date.parse(a.vence_at || "9999") - Date.parse(b.vence_at || "9999")));
        if (!porHacer) sala("tareas", "—", sinDato);
        else if (!porHacer.length) sala("tareas", "0", "Estás al día");
        else {
            const t = porHacer[0];
            sala("tareas", fmtN(porHacer.length), "«" + String(t.titulo || "Tarea").slice(0, 40) + "»" + (t.vence_at ? ", vence " + cuandoEs(new Date(t.vence_at)) : ""));
        }

        // Puntos y rango.
        if (saldo.error || saldo.data == null) sala("puntos", "—", sinDato);
        else sala("puntos", fmtN(saldo.data), "Canjéalos en la tienda");
        const r = !rango.error && Array.isArray(rango.data) ? rango.data[0] : (!rango.error ? rango.data : null);
        if (!r) sala("rango", "—", sinDato);
        else {
            const nombre = r.nombre || r.rango || "Peón";
            const sig = r.siguiente_nombre && r.umbral_siguiente ? "Para " + r.siguiente_nombre + ": " + fmtN(Math.max(0, r.umbral_siguiente - (r.puntos || 0))) + " puntos" : fmtN(r.puntos || 0) + " puntos ganados";
            sala("rango", nombre.charAt(0).toUpperCase() + nombre.slice(1), sig);
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
            sala("clases", fmtN(enSiete.length), enSiete.length ? "La próxima, " + cuandoEs(new Date(enSiete[0].inicio)) + " a las " + F_HORA.format(new Date(enSiete[0].inicio)) : "Sin clases en los próximos 7 días");
        }
        pintarLoQueViene(clases || [], porHacer || [], !clases && !porHacer);
    }

    function pintarClase(abierta, prox) {
        const caja = document.getElementById("jornada-clase");
        if (!caja || (!abierta && !prox)) return;
        caja.textContent = "";
        const chip = el("span", "jornada-clase-chip");
        const titulo = el("h3", "jornada-clase-titulo");
        const linea = el("p", "jornada-clase-linea");
        const boton = el("a", "jornada-clase-boton");
        if (abierta) {
            chip.textContent = "Tu clase está abierta";
            titulo.textContent = abierta.titulo_clase || "Clase en vivo";
            linea.textContent = "Con " + (abierta.profesor || "tu profe");
            boton.href = "sesion.html";
            boton.textContent = "Entrar a la clase";
        } else {
            const inicio = new Date(prox.inicio);
            chip.textContent = "Tu próxima clase: " + cuandoEs(inicio) + " a las " + F_HORA.format(inicio);
            titulo.textContent = prox.titulo || "Tu próxima clase";
            linea.textContent = [prox.profesor ? "Con " + prox.profesor : "", prox.modalidad === "en_linea" ? "en línea" : "presencial"].filter(Boolean).join(" · ");
            boton.href = "#";
            boton.textContent = "Ver tus clases";
            boton.addEventListener("click", (e) => { e.preventDefault(); ir("clases", true); });
        }
        caja.append(chip, titulo, linea, boton);
        caja.hidden = false;
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
        // Si vive en dos pestañas, la primera; y la pestaña entera, sin sección.
        ir(pestanasDe(conPestana)[0], false);
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

    /* El aspecto de Chessgora en TODO el sitio: el tema «jornada» de
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
