/* justificaciones.html — justificar una ausencia a clase.
 *
 * Una página, dos lados:
 *  - El ALUMNO cuenta por qué no llegó (un texto, un documento o las dos
 *    cosas) y ve las que ya mandó, con lo que le contestaron.
 *  - Quien da clase, coordina, supervisa o administra ve las que le llegaron,
 *    ordenadas por el día de la ausencia y agrupadas por mes, y las contesta.
 *
 * Nada se escribe directo en la tabla: `justificaciones_ausencia` no tiene
 * política de escritura. Mandar es justificar_ausencia() —que comprueba que
 * cada documento sea de la carpeta de quien manda y que exista, y avisa al
 * celular a sus profesores, coordinación y supervisión—; contestar es
 * responder_justificacion() y retirar, retirar_justificacion(). Qué ve cada
 * quien lo decide la RLS: la lista la da justificaciones_recibidas(), de a una
 * página, porque PostgREST corta a mil filas sin avisar.
 *
 * Los documentos van al bucket privado `justificaciones`, en
 * <id del alumno>/<id al azar>/<nombre>, con js/adjuntos.js (la misma copia
 * que los formularios): se suben al ENVIAR y se enseñan como blob:.
 *
 * Ver «Las justificaciones de ausencia» en docs/decisiones/seguimiento-del-alumno.md.
 */
(function () {
    "use strict";

    const BUCKET = "justificaciones";
    const POR_PAGINA = 50;

    /* El motivo: la clave la conoce la base (CHECK de la tabla); el texto y el
       emoji son de acá. El emoji nunca va solo: el texto va al lado. */
    const MOTIVOS = [
        { valor: "salud", emoji: "🤒", texto: "Salud (enfermedad o malestar)" },
        { valor: "cita", emoji: "🏥", texto: "Cita médica o trámite" },
        { valor: "familiar", emoji: "👪", texto: "Asunto familiar" },
        { valor: "estudios", emoji: "🎒", texto: "Colegio o estudios (exámenes, actividades)" },
        { valor: "viaje", emoji: "🧳", texto: "Viaje" },
        { valor: "otro", emoji: "📝", texto: "Otro motivo" },
    ];
    const motivoDe = (v) => MOTIVOS.find((m) => m.valor === v) || MOTIVOS[MOTIVOS.length - 1];

    /* El estado va ESCRITO: el color acompaña, no dice. Pares de color que ya
       usa supervisión, medidos contra el fondo blanco y el oscuro. */
    const ESTADOS = {
        pendiente: { texto: "⏳ Por revisar", clase: "bg-accent-50 text-accent-700 dark:bg-brand-800 dark:text-accent-400" },
        aceptada: { texto: "✅ Aceptada", clase: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
        no_aceptada: { texto: "❌ No aceptada", clase: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
    };

    let session = null;

    // ------------------------------------------------------------ ayudas
    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    const hoyCR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

    /* Una fecha sin hora ('2026-09-28') se lee en UTC: leída en la hora del
       navegador, en Costa Rica caería el día anterior. */
    function fechaLarga(iso) {
        return new Date(iso + "T00:00:00Z").toLocaleDateString("es-CR", {
            timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
        });
    }
    function fechaCorta(iso) {
        return new Date(iso + "T00:00:00Z").toLocaleDateString("es-CR", { timeZone: "UTC", day: "numeric", month: "long" });
    }
    function diasDe(j) {
        if (j.fecha_hasta && j.fecha_hasta !== j.fecha_desde) {
            const n = Math.round((Date.parse(j.fecha_hasta) - Date.parse(j.fecha_desde)) / 86400000) + 1;
            const hasta = new Date(j.fecha_hasta + "T00:00:00Z").toLocaleDateString("es-CR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
            return "Del " + fechaCorta(j.fecha_desde) + " al " + hasta + " (" + n + " días)";
        }
        const t = fechaLarga(j.fecha_desde);
        return t.charAt(0).toUpperCase() + t.slice(1);
    }
    function mesDe(iso) {
        const t = new Date(iso + "T00:00:00Z").toLocaleDateString("es-CR", { timeZone: "UTC", month: "long", year: "numeric" });
        return t.charAt(0).toUpperCase() + t.slice(1);
    }
    function momento(ts) {
        return new Date(ts).toLocaleString("es-CR", {
            timeZone: "America/Costa_Rica", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
        });
    }

    const bajar = async (ruta) => {
        const { data, error } = await sb.storage.from(BUCKET).download(ruta);
        if (error) throw error;
        return data;
    };

    /* La tarjeta de una justificación: la misma para los dos lados. `quien`
       es el nombre del alumno (solo del lado de quien la recibe); `nivel`, el
       del título, uno más que el del mes que la agrupa. */
    function tarjeta(j, quien, nivel) {
        const art = el("article", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5");
        const cab = el("div", "flex flex-wrap items-start justify-between gap-2");
        const tit = el("div", "min-w-0");
        if (quien) {
            const h = el(nivel, "font-semibold text-lg text-brand-800 dark:text-white break-words", quien);
            tit.appendChild(h);
            if (j.grupo) tit.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300", "Grupo: " + j.grupo));
            tit.appendChild(el("p", "text-sm font-semibold text-brand-700 dark:text-brand-200 mt-1", diasDe(j)));
        } else {
            tit.appendChild(el(nivel, "font-semibold text-brand-800 dark:text-white", diasDe(j)));
        }
        const est = ESTADOS[j.estado] || ESTADOS.pendiente;
        cab.append(tit, el("span", "shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full " + est.clase, est.texto));
        art.appendChild(cab);

        const m = motivoDe(j.motivo);
        const pm = el("p", "text-sm text-brand-600 dark:text-brand-300 mt-2");
        const em = el("span", null, m.emoji + " ");
        em.setAttribute("aria-hidden", "true");
        pm.append(em, document.createTextNode("Motivo: " + m.texto));
        art.appendChild(pm);

        if (j.detalle) art.appendChild(el("p", "mt-3 text-brand-800 dark:text-brand-100 whitespace-pre-line break-words", j.detalle));
        const rutas = Array.isArray(j.adjuntos) ? j.adjuntos : [];
        if (rutas.length) {
            const caja = el("div", "mt-3");
            caja.appendChild(el("p", "text-xs font-semibold text-brand-500 dark:text-brand-300 mb-1", Adjuntos.contar(rutas)));
            caja.appendChild(Adjuntos.celda(rutas, bajar, quien || "", "justificacion " + j.fecha_desde));
            art.appendChild(caja);
        }
        art.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-3", "Enviada el " + momento(j.created_at)));

        if (j.estado !== "pendiente" || j.respuesta) {
            const r = el("div", "mt-3 border-l-4 border-brand-200 dark:border-brand-700 pl-3");
            const quienContesto = j.revisada_por_nombre ? j.revisada_por_nombre : "Tu profesor";
            r.appendChild(el("p", "text-xs font-semibold text-brand-600 dark:text-brand-300",
                "Contestó " + quienContesto + (j.revisada_en ? " el " + momento(j.revisada_en) : "")));
            if (j.respuesta) r.appendChild(el("p", "text-sm text-brand-800 dark:text-brand-100 whitespace-pre-line break-words mt-1", j.respuesta));
            art.appendChild(r);
        }
        return art;
    }

    /* Agrupa por el mes de la ausencia: la lista ya llega ordenada por día. */
    function pintarPorMes(caja, filas, pintarUna, nivel) {
        let mes = null, grupo = null;
        filas.forEach((j) => {
            const m = mesDe(j.fecha_desde);
            if (m !== mes) {
                mes = m;
                const sec = el("section", "space-y-4");
                const h = el(nivel || "h3", "font-serif text-lg font-bold text-brand-700 dark:text-brand-200 border-b border-brand-200 dark:border-brand-700 pb-1", m);
                grupo = el("div", "space-y-4");
                sec.append(h, grupo);
                caja.appendChild(sec);
            }
            grupo.appendChild(pintarUna(j));
        });
    }

    // ================================================== el lado del alumno
    let selector = null;

    async function cargarMias() {
        const caja = document.getElementById("mias");
        const { data, error } = await sb.from("justificaciones_ausencia")
            .select("id, fecha_desde, fecha_hasta, motivo, detalle, adjuntos, estado, respuesta, revisada_por, revisada_por_nombre, revisada_en, created_at")
            .eq("student_id", session.user.id)
            .order("fecha_desde", { ascending: false }).order("created_at", { ascending: false })
            .range(0, 199);
        caja.replaceChildren();
        if (error) { caja.appendChild(el("p", "text-sm text-red-600 dark:text-red-400", "No se pudieron cargar tus justificaciones: " + error.message)); return; }
        document.getElementById("mias-vacio").hidden = (data || []).length > 0;
        pintarPorMes(caja, data || [], (j) => {
            const art = tarjeta(j, null, "h4");
            if (j.estado === "pendiente" && !j.revisada_por) {
                const b = el("button", "mt-3 text-sm font-semibold text-red-700 dark:text-red-300 underline hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Retirar esta justificación");
                b.type = "button";
                b.addEventListener("click", () => retirar(j));
                art.appendChild(b);
            }
            return art;
        }, "h3");
    }

    async function retirar(j) {
        const ok = await Avisos.confirmar("Se borra la justificación de " + diasDe(j).toLowerCase() + " y sus documentos. Tus profesores ya no la van a ver.",
            { titulo: "¿Retirar la justificación?", aceptar: "Retirarla", cancelar: "Dejarla", peligro: true });
        if (!ok) return;
        const { data, error } = await sb.rpc("retirar_justificacion", { p_id: j.id });
        if (error) { Avisos.avisar("No se pudo retirar: " + error.message, { tipo: "error" }); return; }
        const rutas = Array.isArray(data) ? data.filter((x) => typeof x === "string") : [];
        if (rutas.length) await sb.storage.from(BUCKET).remove(rutas);
        Avisos.avisar("Justificación retirada.");
        await cargarMias();
    }

    function mensaje(texto, error) {
        const msg = document.getElementById("msg");
        msg.textContent = texto;
        msg.className = "text-sm " + (error ? "text-red-600 dark:text-red-400" : "text-brand-600 dark:text-brand-300");
    }

    async function enviar(ev) {
        ev.preventDefault();
        const desde = document.getElementById("desde").value;
        const varios = document.getElementById("varios").checked;
        const hasta = varios ? document.getElementById("hasta").value : "";
        const motivo = document.getElementById("motivo").value;
        const detalle = document.getElementById("detalle").value.trim();
        const falta = (texto, id) => { mensaje(texto, true); document.getElementById(id).focus(); };
        if (!desde) return falta("Falta el día en que faltaste.", "desde");
        if (varios && !hasta) return falta("Falta el último día que faltaste.", "hasta");
        if (varios && hasta < desde) return falta("El último día no puede ser antes del primero.", "hasta");
        if (!motivo) return falta("Elige el motivo.", "motivo");
        if (!detalle && !selector.cantidad()) return falta("Escribe qué pasó o adjunta un documento.", "detalle");
        // Antes de subir nada: subir un documento ya es tratar el dato.
        if (!document.getElementById("acepto-datos").checked) return falta("Para enviarla, marca la casilla de la política de privacidad.", "acepto-datos");

        const boton = document.getElementById("enviar");
        boton.disabled = true;
        try {
            const rutas = await selector.subirTodo(sb.storage.from(BUCKET), session.user.id, (t) => mensaje(t, false));
            mensaje("Enviando…", false);
            const { error } = await sb.rpc("justificar_ausencia", {
                p_desde: desde, p_hasta: hasta || null, p_motivo: motivo, p_detalle: detalle,
                p_adjuntos: rutas, p_privacidad: window.LegalVersion.PRIVACIDAD,
            });
            // El mensaje de la base dice qué arreglar: se enseña tal cual.
            if (error) throw new Error(error.message);
        } catch (e) {
            mensaje("No se pudo enviar: " + (e.message || e), true);
            boton.disabled = false;
            return;
        }
        boton.disabled = false;
        document.getElementById("form").reset();
        document.getElementById("hasta-caja").hidden = true;
        document.getElementById("desde").value = hoyCR();
        selector.limpiar();
        mensaje("✅ Enviada. Ya les llegó el aviso.", false);
        Avisos.avisar("✅ Tu justificación quedó enviada.");
        await cargarMias();
    }

    async function iniciarAlumno() {
        document.getElementById("app-alumno").classList.remove("hidden");
        const sel = document.getElementById("motivo");
        MOTIVOS.forEach((m) => { const o = el("option", null, m.texto); o.value = m.valor; sel.appendChild(o); });
        const hoy = hoyCR();
        document.getElementById("desde").value = hoy;
        const varios = document.getElementById("varios");
        varios.addEventListener("change", () => {
            document.getElementById("hasta-caja").hidden = !varios.checked;
            if (varios.checked && !document.getElementById("hasta").value) document.getElementById("hasta").value = document.getElementById("desde").value;
        });
        const archivos = document.getElementById("archivos");
        archivos.accept = Adjuntos.aceptar(false);
        document.getElementById("archivos-formatos").textContent = Adjuntos.textoFormatos(false);
        selector = Adjuntos.montarSelector(archivos, document.getElementById("archivos-lista"),
            document.getElementById("archivos-estado"), { alError: (t) => mensaje(t, true) });
        document.getElementById("form").addEventListener("submit", enviar);

        // A quién le llega, con nombre: «le llega a tu profesor» no dice a cuál.
        try {
            const { data } = await sb.rpc("encuesta_mis_profesores");
            const nombres = (data || []).map((p) => p.nombre).filter(Boolean);
            if (nombres.length) {
                document.getElementById("a-quien").textContent = "Le llega a " + (nombres.length === 1 ? "tu profesor, " : "tus profesores, ")
                    + nombres.join(", ") + ", y a la coordinación y la supervisión de tu academia.";
            }
        } catch (e) { /* se queda el texto general */ }
        await cargarMias();
    }

    // ============================== el lado de quien las recibe y contesta
    let filtro = "pendiente";
    let busqueda = "";
    let desdeFila = 0;
    let pedido = 0;

    const FILTROS = [
        { valor: "pendiente", texto: "⏳ Por revisar" },
        { valor: "aceptada", texto: "✅ Aceptadas" },
        { valor: "no_aceptada", texto: "❌ No aceptadas" },
        { valor: "", texto: "Todas" },
    ];

    async function contar() {
        await Promise.all(["pendiente", "aceptada", "no_aceptada"].map(async (e) => {
            const { count, error } = await sb.from("justificaciones_ausencia")
                .select("id", { count: "exact", head: true })
                .eq("estado", e).neq("student_id", session.user.id);
            document.getElementById("n-" + e).textContent = error ? "—" : String(count || 0);
        }));
    }

    function pintarFiltros() {
        const caja = document.getElementById("filtros");
        caja.replaceChildren();
        FILTROS.forEach((f) => {
            const b = el("button", "text-sm font-semibold px-3 py-2 rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
                + (f.valor === filtro
                    ? "bg-brand-800 text-white border-brand-800 dark:bg-accent-500 dark:text-brand-900 dark:border-accent-500"
                    : "bg-white text-brand-700 border-brand-200 hover:border-accent-400 dark:bg-brand-900 dark:text-brand-200 dark:border-brand-700"), f.texto);
            b.type = "button";
            b.setAttribute("aria-pressed", f.valor === filtro ? "true" : "false");
            b.addEventListener("click", () => { filtro = f.valor; pintarFiltros(); cargarRecibidas(true); });
            caja.appendChild(b);
        });
    }

    function controlesDeRespuesta(j, art) {
        const caja = el("div", "mt-4 border-t border-brand-100 dark:border-brand-800 pt-4");
        const abrir = el("button", "text-sm font-semibold text-accent-700 dark:text-accent-400 underline hover:no-underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Cambiar la respuesta");
        abrir.type = "button";
        const form = el("div", "space-y-3");
        const idTxt = "resp-" + j.id;
        const lab = el("label", "block text-xs font-semibold text-brand-500 dark:text-brand-300", "Respuesta para " + j.alumno + " (opcional)");
        lab.htmlFor = idTxt;
        const txt = el("textarea", "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        txt.id = idTxt; txt.rows = 2; txt.maxLength = 1000;
        txt.value = j.respuesta || "";
        const botones = el("div", "flex flex-wrap gap-2");
        const si = el("button", "bg-green-700 hover:bg-green-800 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "✅ Aceptar la justificación");
        const no = el("button", "bg-red-700 hover:bg-red-800 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "❌ No aceptarla");
        si.type = "button"; no.type = "button";
        botones.append(si, no);
        form.append(lab, txt, botones);

        async function contestar(estado, boton) {
            si.disabled = true; no.disabled = true;
            const { error } = await sb.rpc("responder_justificacion", { p_id: j.id, p_estado: estado, p_respuesta: txt.value.trim() });
            si.disabled = false; no.disabled = false;
            if (error) { Avisos.avisar("No se pudo guardar: " + error.message, { tipo: "error" }); boton.focus(); return; }
            Avisos.avisar((estado === "aceptada" ? "✅ Aceptada" : "Guardada como no aceptada") + ": a " + j.alumno + " ya le llegó el aviso.");
            await Promise.all([contar(), cargarRecibidas(true)]);
        }
        si.addEventListener("click", () => contestar("aceptada", si));
        no.addEventListener("click", () => contestar("no_aceptada", no));

        if (j.estado === "pendiente") {
            caja.appendChild(form);
        } else {
            form.hidden = true;
            abrir.setAttribute("aria-expanded", "false");
            abrir.setAttribute("aria-controls", "form-" + j.id);
            form.id = "form-" + j.id;
            abrir.addEventListener("click", () => {
                form.hidden = !form.hidden;
                abrir.setAttribute("aria-expanded", form.hidden ? "false" : "true");
                if (!form.hidden) txt.focus();
            });
            caja.append(abrir, form);
        }
        art.appendChild(caja);
    }

    async function cargarRecibidas(desdeCero) {
        const n = ++pedido;
        if (desdeCero) desdeFila = 0;
        const estado = document.getElementById("lista-estado");
        estado.textContent = "Cargando…";
        const { data, error } = await sb.rpc("justificaciones_recibidas", {
            p_estado: filtro || null, p_busqueda: busqueda || null, p_limite: POR_PAGINA, p_desde: desdeFila,
        });
        if (n !== pedido) return;   // llegó tarde: ya se pidió otra cosa
        const caja = document.getElementById("lista");
        if (desdeCero) { Adjuntos.soltar(); caja.replaceChildren(); }
        const mas = document.getElementById("mas");
        if (error) { estado.textContent = "No se pudo cargar la lista: " + error.message; mas.hidden = true; return; }
        const filas = data || [];
        const total = filas.length ? Number(filas[0].total) : 0;
        desdeFila += filas.length;
        pintarPorMes(caja, filas, (j) => {
            const art = tarjeta(j, j.alumno, "h3");
            controlesDeRespuesta(j, art);
            return art;
        }, "h2");
        const nombreFiltro = (FILTROS.find((f) => f.valor === filtro) || FILTROS[3]).texto.replace(/^\S+\s/, "").toLowerCase();
        if (!total && desdeCero) {
            estado.textContent = busqueda ? "Nadie con ese nombre en esta lista."
                : filtro === "pendiente" ? "No hay justificaciones por revisar. Cuando un estudiante mande una, te llega un aviso al celular y aparece aquí."
                : "No hay justificaciones en «" + nombreFiltro + "».";
        } else {
            estado.textContent = (total === 1 ? "1 justificación" : total + " justificaciones")
                + (filtro ? " · " + nombreFiltro : "") + (desdeFila < total ? " · se ven " + desdeFila : "");
        }
        mas.hidden = desdeFila >= total;
    }

    async function iniciarEquipo() {
        document.getElementById("app-equipo").classList.remove("hidden");
        const pedidoFiltro = new URLSearchParams(location.search).get("estado");
        if (pedidoFiltro != null && FILTROS.some((f) => f.valor === pedidoFiltro)) filtro = pedidoFiltro;
        pintarFiltros();
        let espera = null;
        document.getElementById("buscar").addEventListener("input", (e) => {
            clearTimeout(espera);
            espera = setTimeout(() => { busqueda = e.target.value.trim(); cargarRecibidas(true); }, 300);
        });
        document.getElementById("mas").addEventListener("click", () => cargarRecibidas(false));
        await Promise.all([contar(), cargarRecibidas(true)]);
    }

    // ------------------------------------------------------------- arranque
    async function init() {
        const { data } = await sb.auth.getSession();
        session = data.session;
        if (!session) { location.href = "login.html?next=justificaciones.html"; return; }
        const { data: perfil } = await sb.from("profiles").select("role, is_admin").eq("id", session.user.id).maybeSingle();
        document.getElementById("loading").classList.add("hidden");
        if (perfil && perfil.role === "alumno" && !perfil.is_admin) await iniciarAlumno();
        else await iniciarEquipo();
    }

    init();
})();
