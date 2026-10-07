/* El código de supervisor.html: la página de quien supervisa.

   Antes, quien supervisa entraba al panel de la Academia: «Lo urgente», tres
   números y dieciséis tarjetas, y corregir una cuenta o ver cómo iba un
   profesor mandaba a otra página (Coordinación, Supervisión). El dueño pidió
   para esta persona la misma revisión que el panel de administración. Ahora
   son cinco pestañas:

     Inicio       lo que espera por ti (js/pendientes.js), a tu cargo y quién
                  está dando clase ahora mismo;
     Personas     tu gente, y la ficha de cada uno al costado: la MISMA ficha
                  de Coordinación (js/cuenta-coordinacion.js);
     Profesores   el mes de cada profesor (resumen_profesores_supervisados, lo
                  mismo que lee supervision.html) y su ficha;
     Estudiantes  cómo van, por tema: cada tarjeta abre Informes en su tema;
     Cobros y accesos  los números de tu academia y sus páginas.

   Debajo de cada pestaña, sus otras páginas (js/paginas-supervisor.js, la
   misma lista que pinta el panel de la Academia). Ctrl + K busca personas,
   pestañas y páginas (js/buscador-panel.js).

   Nada de lo que se ve o se cambia lo decide esta página: mi_gente y las
   funciones coord_* acotan a su gente, y la RLS de class_sessions solo le
   entrega las clases de los suyos. Ver «La página de supervisión» en
   docs/decisiones/paneles.md. */
(function () {
    "use strict";

    const SECCIONES = ["inicio", "personas", "profesores", "estudiantes", "cobros"];
    const NOMBRES = { inicio: "Inicio", personas: "Personas", profesores: "Profesores", estudiantes: "Estudiantes", cobros: "Cobros y accesos" };
    const POR_PAGINA = 50;

    /* Los temas de Informes que más se miran de los estudiantes. Cada uno es
       un `?tema=` que informes.html de verdad tiene (verificar-supervisor.js
       lo comprueba contra su selector). */
    const TEMAS = [
        { emoji: "🏫", label: "Asistencia", desc: "Quién viene a clase y quién falta, y su tiempo en la plataforma", href: "informes.html?tema=asistencia" },
        { emoji: "😴", label: "Sin entrenar", desc: "Quién lleva 4 días o más sin entrenar: a quién llamar", href: "informes.html?tema=inactivos" },
        { emoji: "🧭", label: "Diagnóstico de nivel", desc: "La fuerza de cada uno en puntos Elo y dónde está floja cada clase", href: "informes.html?tema=diagnostico" },
        { emoji: "🏛️", label: "Cursos", desc: "Qué temas de cada curso ya estudió cada uno", href: "informes.html?tema=cursos" },
        { emoji: "⚔️", label: "Táctica", desc: "Los ejercicios de táctica que resuelven y en qué fallan", href: "informes.html?tema=tactica" },
        { emoji: "🧩", label: "Habilidades", desc: "Las habilidades que entrenan y cómo les va en cada una", href: "informes.html?tema=tipos" },
    ];

    let session = null;
    let perfil = null;
    let seccionActual = null;

    function el(tag, clase, texto) {
        const n = document.createElement(tag);
        if (clase) n.className = clase;
        if (texto != null) n.textContent = texto;
        return n;
    }

    const nombreDe = (u) => u.full_name || u.nombre || u.email || "Sin nombre";
    const $ = (id) => document.getElementById(id);

    /* ================= Las pestañas ================= */
    function seccionDelEnlace() {
        const h = location.hash.replace("#", "");
        return SECCIONES.includes(h) ? h : null;
    }

    function irA(nombre, opciones) {
        if (!SECCIONES.includes(nombre)) return;
        seccionActual = nombre;
        document.querySelectorAll("[data-seccion]").forEach((s) => { s.hidden = s.dataset.seccion !== nombre; });
        document.querySelectorAll(".sup-pestana").forEach((a) => {
            const activa = a.dataset.ir === nombre;
            if (activa) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
            a.classList.toggle("border-accent-400", activa);
            a.classList.toggle("text-white", activa);
            a.classList.toggle("border-transparent", !activa);
            a.classList.toggle("text-brand-200", !activa);
        });
        pintarPaginasDeZona(nombre);
        if (!(opciones && opciones.sinHistoria) && location.hash !== "#" + nombre) history.pushState(null, "", "#" + nombre);
    }

    function pintarPaginasDeZona(nombre) {
        const paginas = window.PaginasSupervisor && nombre !== "inicio" ? PaginasSupervisor.deZona(nombre) : [];
        $("paginas-zona").hidden = !paginas.length;
        $("paginas-zona-titulo").textContent = "Otras páginas de " + NOMBRES[nombre];
        $("paginas-zona-lista").replaceChildren(...paginas.map(TarjetaPagina));
    }

    document.querySelectorAll("[data-ir]").forEach((a) => a.addEventListener("click", (e) => {
        e.preventDefault();
        // «Estudiantes» de «A tu cargo» abre Personas ya filtrada.
        if (a.dataset.rol !== undefined && $("sup-rol").value !== a.dataset.rol) {
            $("sup-rol").value = a.dataset.rol;
            cargarPersonas(true);
        }
        irA(a.dataset.ir);
        window.scrollTo({ top: 0 });
    }));
    window.addEventListener("popstate", () => irA(seccionDelEnlace() || "inicio", { sinHistoria: true }));

    // «Buenos días / buenas tardes / buenas noches», en hora de Costa Rica.
    function pintarSaludo() {
        const ahora = new Date();
        const hora = Number(new Intl.DateTimeFormat("es-CR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Costa_Rica" }).format(ahora));
        const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
        const primero = String(perfil.full_name || "").trim().split(/\s+/)[0];
        $("sup-saludo").textContent = primero ? saludo + ", " + primero : saludo;
        const fecha = new Intl.DateTimeFormat("es-CR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" }).format(ahora);
        $("sup-fecha").textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    }

    /* ================= Inicio ================= */
    async function pintarUrgente() {
        const r = await Pendientes.pintar(sb, Pendientes.DE_SUPERVISOR, { yo: perfil.id, prefijo: "urgente-sup" });
        const badge = $("nav-urgentes");
        const n = r ? r.urgentes : 0;
        badge.hidden = !n;
        badge.textContent = n ? String(n) : "";
        if (n) badge.setAttribute("aria-label", n === 1 ? "1 cosa urgente" : n + " cosas urgentes");
    }

    async function pintarACargo() {
        const n = await Pendientes.aCargo(sb);
        const poner = (id, v) => { $(id).textContent = v === null ? "—" : v.toLocaleString("es-CR"); };
        poner("sup-n-alumnos", n.alumnos);
        poner("sup-n-profes", n.profesores);
        poner("sup-n-inactivos", n.inactivos);
        // El número que pide atención va en rojo, y además dice qué es.
        $("sup-n-inactivos").classList.toggle("text-red-600", n.inactivos > 0);
        $("sup-n-inactivos").classList.toggle("dark:text-red-400", n.inactivos > 0);
        if (!n.alumnos && !n.profesores && n.alumnos !== null) {
            const aviso = $("sup-aviso");
            aviso.textContent = perfil.is_admin
                ? "Estás en la página de supervisión desde la cuenta que administra: ves a toda la plataforma."
                : "Todavía no tienes ninguna cuenta a tu cargo. Quien administra te las asigna desde el panel de Administración › Supervisores.";
            aviso.hidden = false;
        }
    }

    /* Quién de su gente está dando clase: es cuando se puede ir a mirar. La
       RLS de class_sessions solo le entrega las de los suyos; los nombres
       salen de sus profesores (la misma lista de la pestaña Profesores). */
    let enClase = new Set();
    async function cargarEnClase() {
        const { data } = await sb.from("class_sessions").select("created_by").is("ended_at", null).limit(200);
        enClase = new Set((data || []).map((c) => c.created_by).filter((id) => id !== perfil.id));
    }

    function pintarAhora() {
        const ul = $("sup-ahora");
        ul.replaceChildren();
        const dando = profesores.filter((f) => enClase.has(f.id));
        $("sup-ahora-vacio").textContent = dando.length
            ? (dando.length === 1 ? "1 profesor está dando clase:" : dando.length + " profesores están dando clase:")
            : "Nadie de tu gente está dando clase en este momento.";
        dando.forEach((f) => {
            const li = el("li", "flex flex-wrap items-center justify-between gap-3 py-3");
            li.appendChild(el("span", "font-semibold text-brand-800 dark:text-white", nombreDe(f)));
            const a = el("a", "text-sm font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "🔴 En clase ahora · Mirar la clase");
            a.href = "sesion.html?observar=" + encodeURIComponent(f.id);
            a.dataset.observar = f.id;
            li.appendChild(a);
            ul.appendChild(li);
        });
    }

    /* ================= Personas =================
       La lista la filtra y la corta la base (mi_gente), de a 50: PostgREST
       corta a mil filas sin avisar. La ficha es la de Coordinación. */
    let filas = [], total = 0, desde = 0, peticion = 0;
    let misProfesores = [];

    async function cargarPersonas(desdeCero) {
        if (desdeCero) { desde = 0; filas = []; }
        const mia = ++peticion;
        const { data, error } = await sb.rpc("mi_gente", {
            p_busqueda: $("sup-buscar").value.trim() || null,
            p_rol: $("sup-rol").value || null,
            p_limite: POR_PAGINA,
            p_desde: desde,
        });
        if (mia !== peticion) return;          // llegó tarde: el filtro ya es otro
        if (error) { Avisos.avisar("No se pudo cargar tu gente: " + error.message, { tipo: "error" }); return; }
        filas = filas.concat(data || []);
        total = data && data.length ? Number(data[0].total) : (desde ? total : 0);
        desde = filas.length;
        pintarPersonas();
    }

    function rolDe(u) {
        if (u.role === "profesor") return u.es_coordinador ? "Coordina" : "Profesor";
        return "Estudiante";
    }

    function pintarPersonas() {
        const body = $("sup-lista");
        body.replaceChildren();
        $("sup-vacio").hidden = filas.length > 0;
        $("sup-cuenta").textContent = filas.length
            ? (filas.length < total ? "Mostrando " + filas.length + " de " + total : total) + (total === 1 ? " cuenta." : " cuentas.")
            : "";
        $("sup-mas").hidden = filas.length >= total;
        filas.forEach((u) => body.appendChild(filaPersona(u)));
    }

    function filaPersona(u) {
        const tr = el("tr", "border-b border-brand-50 dark:border-brand-800/60 last:border-0 hover:bg-brand-50/70 dark:hover:bg-brand-800/40");
        tr.dataset.persona = u.id;
        const td = el("td", "py-2 px-4");
        const nombre = el("button", "persona-abrir text-left font-semibold text-brand-800 dark:text-white hover:text-accent-700 dark:hover:text-accent-400 hover:underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", nombreDe(u));
        nombre.type = "button";
        nombre.setAttribute("aria-label", "Abrir la ficha de " + nombreDe(u));
        nombre.addEventListener("click", () => abrirPersona(u));
        td.append(nombre, el("div", "persona-correo text-xs text-brand-450 dark:text-brand-350 truncate max-w-[22rem]", u.email || ""));
        if (u.role === "profesor" && enClase.has(u.id)) td.appendChild(el("div", "text-xs font-semibold text-red-700 dark:text-red-300", "🔴 Dando clase ahora"));
        const tdProfes = el("td", "py-2 pr-3");
        if (u.role === "alumno") {
            const suyos = u.profesores || [];
            if (suyos.length) tdProfes.textContent = suyos.map((p) => p.nombre).join(", ");
            else tdProfes.appendChild(el("span", "inline-block rounded-full bg-accent-50 dark:bg-brand-800 text-accent-700 dark:text-accent-300 px-2 py-0.5 text-xs font-semibold", "Sin profesor"));
        } else {
            tdProfes.appendChild(el("span", "text-xs text-brand-450 dark:text-brand-350", u.alumnos === 1 ? "1 alumno" : (u.alumnos || 0) + " alumnos"));
        }
        const tdFicha = el("td", "py-2 pr-4 text-right");
        const abrir = el("button", "text-xs font-semibold border border-brand-200 dark:border-brand-700 hover:border-accent-400 rounded-lg px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Abrir ficha");
        abrir.type = "button";
        abrir.tabIndex = -1;       // el nombre ya es el botón para el teclado
        abrir.setAttribute("aria-label", "Abrir la ficha de " + nombreDe(u));
        abrir.addEventListener("click", () => abrirPersona(u));
        tdFicha.appendChild(abrir);
        tr.append(td, el("td", "py-2 pr-3", rolDe(u)), el("td", "py-2 pr-3", u.grupo || "—"), tdProfes, tdFicha);
        return tr;
    }

    function enlace(texto, href) {
        const a = el("a", "text-sm font-semibold text-accent-700 dark:text-accent-400 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", texto);
        a.href = href;
        return a;
    }

    function abrirPersona(u) {
        const filaDe = () => document.querySelector('#sup-lista tr[data-persona="' + CSS.escape(u.id) + '"] .persona-abrir') || $("sup-buscar");
        FichaLateral.abrir({
            clave: "persona:" + u.id,
            titulo: nombreDe(u),
            sub: [rolDe(u), u.grupo, u.email].filter(Boolean).join(" · "),
            foco: filaDe,
            pintar: (cuerpo) => {
                const b = CuentaCoord.botones(u, {
                    enClase, yo: perfil.id,
                    // Un cambio de rol cambia en qué lista está: se vuelve a pedir.
                    alCambiarRol: async () => { FichaLateral.cerrar(); await cargarPersonas(true); },
                });
                const acciones = el("div", "flex flex-wrap gap-2");
                [b.vivo, b.acceso, b.rol, b.subgrupos].forEach((x) => { if (x) acciones.appendChild(x); });
                cuerpo.appendChild(acciones);
                const ir = el("div", "flex flex-wrap gap-x-4 gap-y-2");
                if (u.role === "alumno") ir.appendChild(enlace("Ver su informe →", "informes.html?alumno=" + encodeURIComponent(u.id)));
                if (u.role === "profesor") {
                    const delMes = profesores.find((f) => f.id === u.id);
                    if (delMes) {
                        const mes = el("button", "text-sm font-semibold text-accent-700 dark:text-accent-400 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Su mes →");
                        mes.type = "button";
                        mes.addEventListener("click", () => abrirProfesor(delMes));
                        ir.appendChild(mes);
                    }
                    if (u.id !== perfil.id) ir.appendChild(enlace("👁 Ver su panel →", "clases.html?ver_como=" + encodeURIComponent(u.id)));
                }
                if (ir.childElementCount) cuerpo.appendChild(ir);
                if (FuncionesCoordinacion.puede("cuentas")) {
                    const ficha = el("div");
                    CuentaCoord.montarFicha(u, ficha, {
                        misProfesores: () => misProfesores,
                        alGuardar: () => { $("ficha-titulo").textContent = nombreDe(u); repintarFila(u); },
                        alCambiarProfesores: () => repintarFila(u),
                    });
                    cuerpo.appendChild(ficha);
                }
            },
        });
    }

    // La fila de atrás dice lo nuevo sin repintar toda la lista.
    function repintarFila(u) {
        const vieja = document.querySelector('#sup-lista tr[data-persona="' + CSS.escape(u.id) + '"]');
        if (vieja) vieja.replaceWith(filaPersona(u));
    }

    let buscarTimer = null;
    $("sup-buscar").addEventListener("input", () => {
        // El buscador está arriba, en todas las pestañas: escribir lleva a Personas.
        if (seccionActual !== "personas") irA("personas");
        clearTimeout(buscarTimer);
        buscarTimer = setTimeout(() => cargarPersonas(true), 300);
    });
    $("sup-rol").addEventListener("change", () => cargarPersonas(true));
    $("sup-mas").addEventListener("click", () => cargarPersonas(false));

    /* ================= Profesores =================
       resumen_profesores_supervisados decide a quién se ve y sus números son
       los de actividad_profesor(): los MISMOS que ve el profesor en su informe
       y la supervisión en supervision.html, que es donde se lee y se comenta
       el informe completo. */
    let profesores = [];
    let mes = null;

    async function cargarProfesores() {
        const { data, error } = await sb.rpc("resumen_profesores_supervisados", { p_periodo: mes });
        if (error) {
            profesores = [];
            $("prof-resumen").textContent = "";
            $("prof-vacio").textContent = "No se pudieron cargar tus profesores: " + error.message;
            $("prof-vacio").hidden = false;
            $("prof-lista").replaceChildren();
            pintarAhora();
            return false;
        }
        profesores = data || [];
        pintarProfesores();
        return true;
    }

    function clasesDe(a) {
        return (Number(a.clases_en_linea || 0) + Number(a.clases_presenciales || 0)) + " (" + ActividadProfesor.horas(a.minutos_clase) + ")";
    }

    function pintarProfesores() {
        const body = $("prof-lista");
        body.replaceChildren();
        const enviados = profesores.filter((f) => f.informe_id).length;
        const sinLeer = profesores.filter((f) => f.informe_id && !f.leido_at).length;
        $("prof-resumen").textContent = profesores.length
            ? profesores.length + (profesores.length === 1 ? " profesor" : " profesores") + " · " + enviados + " enviaron su informe de "
              + ActividadProfesor.textoMes(mes) + (sinLeer ? " · " + sinLeer + " sin leer" : "")
            : "";
        $("prof-vacio").hidden = profesores.length > 0;
        if (!profesores.length) $("prof-vacio").textContent = "Todavía no tienes ningún profesor a tu cargo. Quien administra te los asigna desde Administración › Supervisores.";
        profesores.forEach((f) => {
            const a = f.actividad || {};
            const tr = el("tr", "border-b border-brand-50 dark:border-brand-800/60 last:border-0 hover:bg-brand-50/70 dark:hover:bg-brand-800/40");
            tr.dataset.profesor = f.id;
            const td = el("td", "py-2 px-4");
            const nombre = el("button", "profesor-abrir text-left font-semibold text-brand-800 dark:text-white hover:text-accent-700 dark:hover:text-accent-400 hover:underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", nombreDe(f));
            nombre.type = "button";
            nombre.setAttribute("aria-label", "Abrir el mes de " + nombreDe(f));
            nombre.addEventListener("click", () => abrirProfesor(f));
            td.appendChild(nombre);
            if (f.grupo) td.appendChild(el("div", "text-xs text-brand-450 dark:text-brand-350", f.grupo));
            const est = ActividadProfesor.estadoInforme(f);
            const tdInf = el("td", "py-2 pr-3");
            const chip = el("span", "inline-block text-xs font-semibold px-3 py-1 rounded-full " + est.clase, est.texto);
            chip.dataset.estado = "informe";
            tdInf.appendChild(chip);
            const tdAhora = el("td", "py-2 pr-4");
            if (enClase.has(f.id)) {
                const vivo = el("a", "text-xs font-semibold px-3 py-1 rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "🔴 Mirar la clase");
                vivo.href = "sesion.html?observar=" + encodeURIComponent(f.id);
                vivo.dataset.observar = f.id;
                tdAhora.appendChild(vivo);
            } else {
                tdAhora.appendChild(el("span", "text-xs text-brand-450 dark:text-brand-350", "—"));
            }
            tr.append(td, el("td", "py-2 pr-3 tabular-nums", clasesDe(a)),
                el("td", "py-2 pr-3 tabular-nums", (a.alumnos_activos || 0) + " de " + (a.alumnos || 0)), tdInf, tdAhora);
            body.appendChild(tr);
        });
        pintarAhora();
    }

    function abrirProfesor(f) {
        const a = f.actividad || {};
        FichaLateral.abrir({
            clave: "profesor:" + f.id,
            titulo: nombreDe(f),
            sub: "Su mes: " + ActividadProfesor.textoMes(mes) + (f.grupo ? " · " + f.grupo : ""),
            foco: () => document.querySelector('#prof-lista tr[data-profesor="' + CSS.escape(f.id) + '"] .profesor-abrir') || $("sup-buscar"),
            pintar: (cuerpo) => {
                const est = ActividadProfesor.estadoInforme(f);
                const cab = el("div", "flex flex-wrap items-center gap-2");
                cab.appendChild(el("span", "text-xs font-semibold px-3 py-1 rounded-full " + est.clase, est.texto));
                if (enClase.has(f.id)) {
                    const vivo = el("a", "text-xs font-semibold px-3 py-1 rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "🔴 En clase ahora · Mirar la clase");
                    vivo.href = "sesion.html?observar=" + encodeURIComponent(f.id);
                    cab.appendChild(vivo);
                }
                cuerpo.appendChild(cab);
                const nClases = Number(a.clases_en_linea || 0) + Number(a.clases_presenciales || 0);
                cuerpo.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300",
                    nClases + (nClases === 1 ? " clase" : " clases") + " (" + ActividadProfesor.horas(a.minutos_clase) + ") · "
                    + (a.tareas_puestas || 0) + " tareas puestas · "
                    + (a.alumnos_activos || 0) + " de " + (a.alumnos || 0) + " alumnos entrenaron"));
                // Lo que se viene a hacer va antes que la pared de números.
                const ir = el("div", "flex flex-wrap gap-x-4 gap-y-2");
                ir.appendChild(enlace(f.informe_id ? "Leer su informe y el detalle del mes →" : "El detalle de su mes →",
                    "supervision.html?profesor=" + encodeURIComponent(f.id)));
                if (f.id !== perfil.id) ir.appendChild(enlace("👁 Ver su panel →", "clases.html?ver_como=" + encodeURIComponent(f.id)));
                cuerpo.appendChild(ir);
                cuerpo.appendChild(ActividadProfesor.tarjetas(a));
            },
        });
    }

    function montarMes() {
        const sel = $("prof-mes");
        ActividadProfesor.meses(12).forEach((m) => {
            const o = document.createElement("option");
            o.value = m.valor;
            o.textContent = m.texto.charAt(0).toUpperCase() + m.texto.slice(1);
            sel.appendChild(o);
        });
        mes = ActividadProfesor.mesPorOmision();
        sel.value = mes;
        sel.addEventListener("change", async () => { mes = sel.value; await cargarProfesores(); });
    }

    /* ================= Estudiantes y Cobros ================= */
    function pintarEstudiantes() {
        $("est-temas").replaceChildren(...TEMAS.map(TarjetaPagina));
    }

    async function pintarCobros() {
        const c = await Pendientes.contarEnLaBase(sb, ["morosos", "recibosSinEntregar"], { yo: perfil.id });
        const caja = $("cob-numeros");
        caja.replaceChildren();
        const numero = (n, texto, href, alDia) => {
            const li = el("li");
            const a = el("a", "flex items-center gap-4 rounded-xl bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 p-4 hover:border-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
            a.href = href;
            a.appendChild(el("span", "w-12 text-right text-2xl font-bold tabular-nums " + (n > 0 ? "text-red-600 dark:text-red-400" : "text-brand-800 dark:text-white"), n === null ? "—" : String(n)));
            const t = el("span", "flex-1 min-w-0");
            t.appendChild(el("span", "block text-sm font-semibold text-brand-800 dark:text-white", texto));
            // Va escrito si está al día o si no se pudo contar: nunca un cero falso.
            t.appendChild(el("span", "block text-xs text-brand-500 dark:text-brand-300", n === null ? "No se pudo contar: ábrelo para revisarlo." : n === 0 ? alDia : "Ábrelo para revisarlo."));
            a.appendChild(t);
            li.appendChild(a);
            caja.appendChild(li);
        };
        numero(c.morosos, "Saldos vencidos", "cobros.html", "Pagos al día.");
        numero(c.recibosSinEntregar, "Recibos por revisar y entregar", "cobros.html#recibos", "Todos los recibos entregados.");
    }

    /* ================= Ctrl + K ================= */
    window.PanelBuscador = {
        secciones: () => SECCIONES.map((id) => ({ id, titulo: NOMBRES[id], grupo: "" })),
        irA,
        async personas(texto) {
            const { data, error } = await sb.rpc("mi_gente", { p_busqueda: texto, p_rol: null, p_limite: 6, p_desde: 0 });
            if (error) return [];
            return (data || []).map((u) => ({
                titulo: nombreDe(u),
                detalle: [rolDe(u), u.grupo, u.email].filter(Boolean).join(" · "),
                ir: () => abrirPersona(u),
            }));
        },
        paginas() {
            const fuera = [{ label: "Cuenta nueva", desc: "Da de alta a un alumno", href: "formularios.html?alta=1", grupo: "Personas" }];
            if (window.PaginasSupervisor) ["personas", "profesores", "estudiantes", "cobros"].forEach((z) =>
                PaginasSupervisor.deZona(z).forEach((t) => fuera.push({ label: t.label, desc: t.desc, href: t.href, grupo: NOMBRES[z] })));
            TEMAS.forEach((t) => fuera.push({ label: t.label, desc: t.desc, href: t.href, grupo: "Estudiantes" }));
            return fuera;
        },
    };

    /* ================= Arranque ================= */
    async function init() {
        const { data } = await sb.auth.getSession();
        session = data.session;
        if (!session) { location.href = "login.html?next=supervisor.html"; return; }
        const { data: p } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
        perfil = p;
        $("loading").classList.add("hidden");
        if (!(perfil && (perfil.es_supervisor || perfil.is_admin))) { $("denied").hidden = false; return; }
        // Qué funciones de coordinación le tocan. A quien supervisa la base le
        // contesta con todas.
        await FuncionesCoordinacion.cargar(sb);
        pintarSaludo();
        montarMes();
        pintarEstudiantes();
        $("app").hidden = false;
        irA(seccionDelEnlace() || "inicio", { sinHistoria: true });

        // Cada parte por su lado: una que tarde no demora a las demás.
        pintarUrgente();
        pintarACargo();
        pintarCobros();
        const { data: docentes } = await sb.rpc("mi_gente", { p_busqueda: null, p_rol: "profesor", p_limite: 200, p_desde: 0 });
        misProfesores = (docentes || []).map((x) => ({ id: x.id, nombre: nombreDe(x) }));
        await cargarEnClase();
        await Promise.all([cargarProfesores(), cargarPersonas(true)]);
    }

    init();
})();
