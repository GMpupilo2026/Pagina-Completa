/* Sacar a un alumno de la clase en vivo (sesion.html), por si alguien entró
   por error. Parte de sesion.js: script clásico, comparte sus globales
   (sb, profile, isTeacher, presenceChannel, currentOpenSessionId…).

   Quien decide es la base (clase_sacados, migración clase_sacados): mientras
   esté sacado, no puede marcar asistencia ni tiempo en clase, contestar las
   preguntas ni guardar el calentamiento de ESA clase. La pantalla solo lo
   dice al instante:
     · al profe, el 🚪 de su renglón (con confirmación) y la lista «Sacados de
       esta clase» con «Dejarlo volver»;
     · al alumno, el aviso «sacar» por el canal de presencia. Ese aviso lo
       puede mandar cualquiera conectado al canal, así que no se le cree: se
       pregunta a la base si de verdad lo sacaron. Y al cargar la página se
       pregunta igual, así que recargar no lo vuelve a meter.
   Ver «Sacar a un alumno de la clase» en docs/decisiones/clase-en-vivo.md. */

// id -> nombre de los sacados de la clase abierta (solo el profe).
const sacadosDeLaClase = new Map();
// El alumno: ya quedó afuera (el arranque no destapa la clase).
let meSacaron = false;

async function cargarSacados() {
    if (!isTeacher) return;
    sacadosDeLaClase.clear();
    if (currentOpenSessionId) {
        const { data, error } = await sb.from("clase_sacados").select("student_id")
            .eq("class_session_id", currentOpenSessionId).is("devuelto_at", null);
        if (error) console.error(error);
        const ids = ((data || []).map((x) => x.student_id)).filter(Boolean);
        if (ids.length) {
            const { data: perfiles } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
            const nombres = new Map((perfiles || []).map((p) => [p.id, p.full_name || p.email]));
            ids.forEach((id) => sacadosDeLaClase.set(id, nombres.get(id) || "Un alumno"));
        }
    }
    pintarSacados();
    renderStudentsList();
}

function pintarSacados() {
    const caja = document.getElementById("sacados-caja");
    const lista = document.getElementById("sacados-lista");
    if (!caja || !lista) return;
    caja.hidden = !sacadosDeLaClase.size;
    document.getElementById("sacados-cuenta").textContent = "(" + sacadosDeLaClase.size + ")";
    lista.innerHTML = "";
    for (const [id, nombre] of sacadosDeLaClase) {
        const li = document.createElement("li");
        li.className = "flex items-center gap-2";
        const n = document.createElement("span");
        n.className = "truncate flex-1 min-w-0 text-brand-700 dark:text-brand-200";
        n.textContent = nombre;
        const volver = document.createElement("button");
        volver.type = "button";
        volver.className = "shrink-0 text-xs font-semibold px-2 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        volver.textContent = "↩️ Dejarlo volver";
        volver.setAttribute("aria-label", "Dejar volver a " + nombre);
        volver.addEventListener("click", () => dejarVolverALaClase(id, nombre));
        li.append(n, volver);
        lista.appendChild(li);
    }
}

async function sacarDeLaClase(studentId, nombre) {
    if (!currentOpenSessionId) {
        setStatus("La clase no está abierta: no hay de dónde sacar a nadie.");
        return;
    }
    const ok = await Avisos.confirmar(nombre + " deja de ver la clase al instante, y aunque recargue no puede volver a entrar a esta clase. Lo puedes dejar volver desde «Sacados de esta clase».",
        { titulo: "¿Sacar a " + nombre + " de la clase?", aceptar: "Sacarlo de la clase", peligro: true });
    if (!ok) return;
    const { error } = await sb.rpc("sacar_de_la_clase", { p_clase: currentOpenSessionId, p_alumno: studentId });
    if (error) { Avisos.avisar("No se pudo sacar: " + error.message, { tipo: "error" }); return; }
    sacadosDeLaClase.set(studentId, nombre);
    if (presenceChannel) presenceChannel.send({ type: "broadcast", event: "sacar", payload: { studentId } });
    if (activePlayerId === studentId) await setActivePlayer(null, "both");
    else if (rivalId === studentId) await setRival(null);
    onlineStudents.delete(studentId);
    renderStudentsList();
    pintarSacados();
    setStatus("🚪 Sacaste a " + nombre + " de la clase.");
}

async function dejarVolverALaClase(studentId, nombre) {
    if (!currentOpenSessionId) return;
    const { error } = await sb.rpc("dejar_volver_a_la_clase", { p_clase: currentOpenSessionId, p_alumno: studentId });
    if (error) { Avisos.avisar("No se pudo: " + error.message, { tipo: "error" }); return; }
    sacadosDeLaClase.delete(studentId);
    pintarSacados();
    setStatus("↩️ " + nombre + " ya puede volver a entrar: que toque «Intentar de nuevo» o recargue la página.");
}

// El alumno: ¿la base dice que lo sacaron de esta clase?
async function meSacaronDe(sesionId) {
    if (isTeacher || esObservador || vistaPrevia || !sesionId) return false;
    const { data, error } = await sb.from("clase_sacados").select("student_id")
        .eq("class_session_id", sesionId).eq("student_id", profile.id).is("devuelto_at", null).limit(1);
    if (error) { console.error(error); return false; }
    return !!(data && data.length);
}

// El alumno sale de la clase: deja de anunciarse, cierra su tiempo y se desconecta de todo.
async function quedarFueraDeLaClase() {
    if (meSacaron) return;
    meSacaron = true;
    try { if (presenceChannel) await presenceChannel.untrack(); } catch (e) { console.error(e); }
    try { await stopPresenceLog(); } catch (e) { console.error(e); }
    try { await sb.removeAllChannels(); } catch (e) { console.error(e); }
    document.querySelectorAll("#app, #loading, #entreno-ventana").forEach((el) => el.classList.add("hidden"));
    const caja = document.getElementById("sin-clase");
    const emoji = caja.querySelector("span.text-5xl");
    if (emoji) emoji.textContent = "🚪";
    caja.querySelector("h1").textContent = "Tu profe te sacó de esta clase";
    document.getElementById("sin-clase-texto").textContent =
        "Si fue un error, pídele que te deje volver y luego toca «Intentar de nuevo».";
    document.getElementById("sin-clase-selector").classList.add("hidden");
    const nota = caja.querySelector("p.text-sm");
    if (nota) nota.hidden = true;
    if (!document.getElementById("sin-clase-reintentar")) {
        const otra = document.createElement("button");
        otra.type = "button";
        otra.id = "sin-clase-reintentar";
        otra.className = "inline-block mr-2 mb-2 bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        otra.textContent = "🔄 Intentar de nuevo";
        otra.addEventListener("click", () => window.location.reload());
        caja.querySelector("a[href]").before(otra);
    }
    caja.classList.remove("hidden");
    // El foco al título: el lector de pantalla dice qué pasó (la clase ya no está).
    const titulo = caja.querySelector("h1");
    titulo.setAttribute("tabindex", "-1");
    titulo.focus();
}

// El aviso por el canal: solo un pedido de que pregunte a la base.
async function recibirAvisoDeSacar(payload) {
    if (isTeacher || esObservador || vistaPrevia) return;
    if (!payload || payload.studentId !== profile.id) return;
    if (await meSacaronDe(currentOpenSessionId)) await quedarFueraDeLaClase();
}
