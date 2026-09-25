/* El código de supervision.html.

   Vivía escrito dentro de la página, en un <script> de 13 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Supervisión de profesores.
 *
 * La lista la da `resumen_profesores_supervisados()`, que decide a quién se ve:
 * los profesores que quien administra le asignó a esta supervisión (o todos,
 * para quien administra). Sus números salen de `actividad_profesor()`, la
 * MISMA cuenta que ve el profesor en su informe: si esta pantalla sumara por
 * su lado, la supervisora leería otros números que los que él mandó.
 *
 * Un borrador no se ve acá: es del profesor hasta que lo envía. Lo que no
 * mandó se dice «sin enviar», que es lo que de verdad pasa.
 */
let session = null;
let mes = null;
let filas = [];
// Los profesores con la clase abierta ahora: la RLS de class_sessions solo le
// entrega a quien supervisa las de su gente.
let enClase = new Set();

function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
}

/* Los mensajes salen por js/avisos.js, como en todo el sitio: arriba, se
   ven aunque uno haya bajado en la página, y los de error no se van solos
   (ver «Los avisos son de la página, no del navegador»). */
function avisar(texto, malo) { Avisos.avisar(texto, { tipo: malo ? "error" : "ok" }); }

/* El estado del informe va ESCRITO, no solo con un color. */
function estadoInforme(f) {
    if (!f.informe_id) return { texto: "⏳ Sin enviar", clase: "bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-300" };
    if (f.comentado) return { texto: "💬 Enviado · ya le comentaste", clase: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" };
    if (f.leido_at) return { texto: "✅ Enviado · leído", clase: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" };
    return { texto: "📨 Enviado · sin leer", clase: "bg-accent-50 text-accent-700 dark:bg-brand-800 dark:text-accent-400" };
}

async function cargar() {
    const abiertas = await sb.from("class_sessions").select("created_by").is("ended_at", null);
    enClase = new Set(((abiertas && abiertas.data) || []).map((c) => c.created_by));
    const { data, error } = await sb.rpc("resumen_profesores_supervisados", { p_periodo: mes });
    // Una lista que no se pudo leer y una vacía se ven igual: se dice.
    if (error) { avisar("No se pudieron cargar tus profesores: " + error.message, true); filas = []; return false; }
    filas = data || [];
    return true;
}

function pintar() {
    const ul = document.getElementById("lista");
    ul.innerHTML = "";
    const vacio = document.getElementById("vacio");
    const enviados = filas.filter((f) => f.informe_id).length;
    const sinLeer = filas.filter((f) => f.informe_id && !f.leido_at).length;
    document.getElementById("resumen").textContent = filas.length
        ? filas.length + (filas.length === 1 ? " profesor" : " profesores") + " · " +
          enviados + " enviaron su informe de " + ActividadProfesor.textoMes(mes) +
          (sinLeer ? " · " + sinLeer + " sin leer" : "")
        : "";
    if (!filas.length) {
        vacio.textContent = "Todavía no tienes ningún profesor a tu cargo. Quien administra te los asigna desde Administración › Supervisores.";
        vacio.hidden = false;
        return;
    }
    vacio.hidden = true;
    filas.forEach((f) => ul.appendChild(tarjeta(f)));
}

function tarjeta(f) {
    const li = el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5");
    li.dataset.profesor = f.id;
    const cab = el("div", "flex flex-wrap items-center justify-between gap-2 mb-3");
    const t = el("div");
    // El nombre lo escribe una persona: siempre por textContent.
    t.appendChild(el("h2", "font-serif text-lg font-bold text-brand-800 dark:text-white", f.nombre || "Sin nombre"));
    if (f.grupo) t.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350", "Grupo: " + f.grupo));
    const est = estadoInforme(f);
    const chip = el("span", "text-xs font-semibold px-3 py-1 rounded-full " + est.clase, est.texto);
    chip.dataset.estado = "informe";
    /* Revisarlo directo: su panel, con sus números («Ver como», js/modo-vista.js). */
    const ver = el("a", "text-xs font-semibold text-accent-700 dark:text-accent-400 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded", "👁 Ver su panel");
    ver.href = "clases.html?ver_como=" + encodeURIComponent(f.id);
    ver.dataset.verComo = f.id;
    const der = el("div", "flex flex-wrap items-center gap-3");
    /* En clase ahora: se puede mirar en vivo (sesion.html?observar=<id>). Va
       escrito, no solo con el punto rojo. */
    if (enClase.has(f.id)) {
        const vivo = el("a", "text-xs font-semibold px-3 py-1 rounded-full bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "🔴 En clase ahora · Mirar la clase");
        vivo.href = "sesion.html?observar=" + encodeURIComponent(f.id);
        vivo.dataset.observar = f.id;
        der.appendChild(vivo);
    }
    der.append(ver, chip);
    cab.append(t, der);
    li.appendChild(cab);

    const a = f.actividad || {};
    const linea = el("p", "text-sm text-brand-600 dark:text-brand-300 mb-3",
        (Number(a.clases_en_linea || 0) + Number(a.clases_presenciales || 0)) + " clases (" +
        ActividadProfesor.horas(a.minutos_clase) + ")" +
        // «dio 7 de 8 de su horario» solo si tiene horario: sin él no hay contra qué medir.
        (Number(a.clases_programadas) > 0
            ? ", " + (a.clases_programadas_dadas || 0) + " de " + a.clases_programadas + " de su horario"
            : "") + " · " +
        (a.tareas_puestas || 0) + " tareas puestas · " +
        (a.alumnos_activos || 0) + " de " + (a.alumnos || 0) + " alumnos entrenaron");
    li.appendChild(linea);

    const det = el("details", "mb-2");
    const sum = el("summary", "cursor-pointer text-sm font-semibold text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded", "Todos sus números del mes");
    det.appendChild(sum);
    const cont = el("div", "mt-3");
    cont.appendChild(ActividadProfesor.tarjetas(a));
    det.appendChild(cont);
    li.appendChild(det);

    /* Clase por clase y estudiante por estudiante. Se pide al ABRIRLO, no al
       pintar la lista: con veinte profesores serían veinte consultas que nadie
       pidió. Si mandó el informe, la foto de ese día; si no, el de hoy. */
    const detC = el("details", "mb-2");
    detC.dataset.detalleDe = f.id;
    detC.appendChild(el("summary", "cursor-pointer text-sm font-semibold text-brand-700 dark:text-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded", "El detalle por clase y por estudiante"));
    const contC = el("div", "mt-3");
    detC.appendChild(contC);
    let cargado = false;
    detC.addEventListener("toggle", async () => {
        if (!detC.open || cargado) return;
        cargado = true;
        contC.replaceChildren(el("p", "text-sm text-brand-500 dark:text-brand-300", "Armando el detalle…"));
        const { data, error } = f.informe_id
            ? await sb.rpc("detalle_informe_mensual", { p_informe: f.informe_id })
            : await sb.rpc("detalle_mensual_profesor", { p_profesor: f.id, p_periodo: mes });
        if (error) { cargado = false; contC.replaceChildren(el("p", "text-sm text-red-600 dark:text-red-400", "No se pudo armar el detalle: " + error.message)); return; }
        const nota = el("p", "text-xs text-brand-450 dark:text-brand-350 mb-2", f.informe_id
            ? "Tal como iba con el informe que envió."
            : "De hoy: todavía no envió el informe de este mes.");
        DetalleMensual.pintar(contC, data, { archivo: String(f.nombre || "profesor").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") });
        contC.prepend(nota);
    });
    li.appendChild(detC);

    if (f.informe_id) {
        const b = el("button", "mt-2 bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Leer su informe");
        b.type = "button";
        b.setAttribute("aria-expanded", "false");
        const caja = el("div", "mt-4");
        caja.hidden = true;
        b.addEventListener("click", async () => {
            if (!caja.hidden) { caja.hidden = true; b.setAttribute("aria-expanded", "false"); b.textContent = "Leer su informe"; return; }
            await abrirInforme(f, caja);
            caja.hidden = false;
            b.setAttribute("aria-expanded", "true");
            b.textContent = "Cerrar el informe";
        });
        li.append(b, caja);
    }
    return li;
}

async function abrirInforme(f, caja) {
    caja.innerHTML = "";
    const { data: inf, error } = await sb.from("informes_profesor")
        .select("id, periodo, resumen, logros, dificultades, proximo_mes, datos, enviado_at, leido_at, comentario")
        .eq("id", f.informe_id).maybeSingle();
    if (error || !inf) { caja.appendChild(el("p", "text-sm text-red-600 dark:text-red-400", "No se pudo abrir el informe" + (error ? ": " + error.message : "."))); return; }

    caja.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mb-3", "Enviado el " + ActividadProfesor.fecha(inf.enviado_at) + "."));
    [["Resumen del mes", inf.resumen], ["Logros", inf.logros], ["Dificultades", inf.dificultades], ["Plan para el mes que viene", inf.proximo_mes]]
        .forEach(([titulo, texto]) => {
            if (!texto) return;
            caja.appendChild(el("h3", "font-semibold text-brand-800 dark:text-white mt-3", titulo));
            caja.appendChild(el("p", "text-sm text-brand-700 dark:text-brand-200 whitespace-pre-wrap break-words", texto));
        });
    if (inf.datos) {
        caja.appendChild(el("h3", "font-semibold text-brand-800 dark:text-white mt-4 mb-2", "Los números que mandó"));
        caja.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mb-2", "Tal como estaban el día que lo envió."));
        caja.appendChild(ActividadProfesor.tarjetas(inf.datos));
    }

    const form = el("form", "mt-5 border-t border-brand-100 dark:border-brand-800 pt-4");
    form.noValidate = true;
    const idc = "comentario-" + inf.id;
    const lab = el("label", "block text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1", "Tu comentario para " + (f.nombre || "este profesor"));
    lab.htmlFor = idc;
    const ta = el("textarea", "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
    ta.id = idc; ta.rows = 3; ta.maxLength = 2000;
    ta.value = inf.comentario || "";
    const nota = el("p", "text-xs text-brand-450 dark:text-brand-350 mt-1", "Le llega a su página del informe y como aviso al celular.");
    const botones = el("div", "flex flex-wrap gap-3 mt-3");
    const enviar = el("button", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Guardar comentario");
    enviar.type = "submit";
    botones.appendChild(enviar);
    if (!inf.leido_at) {
        const leido = el("button", "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Marcar como leído");
        leido.type = "button";
        leido.addEventListener("click", () => revisar(inf.id, null));
        botones.appendChild(leido);
    }
    form.append(lab, ta, nota, botones);
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const txt = ta.value.trim();
        if (!txt) { avisar("Escribe el comentario antes de guardarlo.", true); ta.focus(); return; }
        revisar(inf.id, txt);
    });
    caja.appendChild(form);
}

async function revisar(id, comentario) {
    const { error } = await sb.rpc("revisar_informe_mensual", { p_id: id, p_comentario: comentario });
    if (error) { avisar(error.message, true); return; }
    avisar(comentario ? "Comentario guardado: ya le llegó." : "Marcado como leído.");
    if (await cargar()) pintar();
}

async function elegirMes(valor) {
    mes = valor;
    if (await cargar()) pintar();
}

async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { location.href = "login.html?next=supervision.html"; return; }
    const { data: perfil } = await sb.from("profiles").select("es_supervisor, is_admin").eq("id", session.user.id).maybeSingle();
    document.getElementById("loading").classList.add("hidden");
    if (!perfil || !(perfil.es_supervisor || perfil.is_admin)) {
        document.getElementById("denegado").classList.remove("hidden");
        return;
    }
    const sel = document.getElementById("mes");
    ActividadProfesor.meses(12).forEach((m) => {
        const o = document.createElement("option");
        o.value = m.valor;
        o.textContent = m.texto.charAt(0).toUpperCase() + m.texto.slice(1);
        sel.appendChild(o);
    });
    const pedido = ActividadProfesor.mesPorOmision();
    sel.value = pedido;
    sel.addEventListener("change", () => elegirMes(sel.value));
    document.getElementById("app").classList.remove("hidden");
    await elegirMes(pedido);
}

init();
    