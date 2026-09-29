/* El código de sesion.html.

   Los puntos de la clase, el podio (game_state.podio) y los equipos
   (game_state.equipos). Las cuentas son de js/puntos-clase.js; esto las pinta
   y las manda a la clase. Ver «Los equipos» en docs/decisiones/clase-en-vivo.md.

   Es una parte de js/sesion.js que se mudó a su archivo tal cual: un script
   clásico, cargado ANTES que sesion.js. Usa lo de sesion.js (board, sb,
   profile, isTeacher, myGameStateId, setStatus…) solo dentro de funciones,
   que corren cuando sesion.js ya cargó; y sesion.js llama a las de acá del
   mismo modo. Las `let`/`const` de arriba de un script clásico son globales
   para todos los scripts de la página: por eso se ven de un lado al otro. Ver
   «sesion.js en partes» en docs/decisiones/clase-en-vivo.md. */

/* ---------- Los puntos de la clase y el podio (game_state.podio) ----------
   Los puntos se cuentan de resumen_de_la_clase con la regla de
   js/puntos-clase.js, escrita a la vista. El podio que ve la clase es
   una foto que manda el profe: con nombres, o sin ellos (cada uno ve
   igual su propio lugar, porque se reconoce por su id). */
let filasDePuntos = [];
let podioActual = null;

function pintarListaDePuntos(caja, filas) {
    caja.innerHTML = "";
    const ranking = PuntosClase.ranking(filas).filter((x) => x.puntos > 0);
    if (!ranking.length) {
        const p = document.createElement("p");
        p.className = "text-brand-500 dark:text-brand-300";
        p.textContent = "Todavía nadie sumó puntos en esta clase.";
        caja.appendChild(p);
        return;
    }
    const ol = document.createElement("ol");
    ol.className = "space-y-1";
    ranking.forEach((x) => {
        const li = document.createElement("li");
        const cab = document.createElement("p");
        cab.className = "font-semibold text-brand-800 dark:text-brand-100";
        // El nombre lo escribió una persona: textContent.
        cab.textContent = (PuntosClase.medalla(x.puesto) ? PuntosClase.medalla(x.puesto) + " " : "") + x.puesto + ".º " + x.nombre + " — " + PuntosClase.textoPuntos(x.puntos);
        const det = document.createElement("p");
        det.className = "text-xs text-brand-500 dark:text-brand-300";
        det.textContent = PuntosClase.desglose(x.fila);
        li.append(cab, det);
        ol.appendChild(li);
    });
    caja.appendChild(ol);
}

async function contarPuntos() {
    const caja = document.getElementById("puntos-lista");
    if (!caja) return;
    document.getElementById("puntos-regla").textContent = "Cómo se cuentan: " + PuntosClase.reglaEscrita() + ".";
    if (!currentOpenSessionId) {
        filasDePuntos = [];
        caja.textContent = "Los puntos se cuentan desde que se abre la clase, y todavía no hay una abierta.";
        return;
    }
    caja.textContent = "Contando…";
    const { filas, error } = await ResumenClase.cargar(sb, currentOpenSessionId);
    if (error) { console.error(error); caja.textContent = "No se pudieron contar los puntos: " + error.message; return; }
    filasDePuntos = filas;
    pintarListaDePuntos(caja, filas);
    pintarEquiposProfe();
}

async function mostrarPodio(conNombres) {
    if (!currentOpenSessionId) { setStatus("Abre la clase para contar los puntos."); return; }
    const { filas, error } = await ResumenClase.cargar(sb, currentOpenSessionId);
    if (error) { console.error(error); setStatus("No se pudieron contar los puntos: " + error.message); return; }
    filasDePuntos = filas;
    const podio = PuntosClase.podioParaLaClase(filas, conNombres);
    if (!podio.lineas.length) { setStatus("Todavía nadie sumó puntos: no hay podio que mostrar."); return; }
    // Con equipos armados, el podio lleva también el de los equipos.
    if (equiposActual) podio.equipos = PuntosClase.puntosDeEquipos(filas, equiposActual.lista);
    const { error: err2 } = await sb.from("game_state").update({ podio }).eq("id", myGameStateId);
    if (err2) { console.error(err2); setStatus("No se pudo mostrar el podio: " + err2.message); return; }
    pintarPodio(podio);
    setStatus("🏆 La clase ve el podio" + (conNombres ? ", con los nombres." : ", sin nombres: cada uno ve su propio lugar."));
}

function pintarPodio(podio) {
    podioActual = podio && Array.isArray(podio.lineas) && podio.lineas.length ? podio : null;
    if (!podioActual) anunciarALaClase("podio", null);
    const caja = document.getElementById("podio-caja");
    if (!caja) return;
    caja.hidden = !podioActual;
    const ol = document.getElementById("podio-lineas");
    ol.innerHTML = "";
    const tu = document.getElementById("podio-tu-lugar");
    tu.hidden = true;
    document.getElementById("podio-quitar-btn").hidden = !isTeacher;
    const olEq = document.getElementById("podio-equipos");
    olEq.innerHTML = "";
    olEq.hidden = !(podioActual && Array.isArray(podioActual.equipos) && podioActual.equipos.length);
    if (!podioActual) return;
    (podioActual.equipos || []).forEach((e) => {
        const li = document.createElement("li");
        const mio = equiposActual && miEquipo() && miEquipo().nombre === e.nombre;
        li.textContent = PuntosClase.medalla(e.puesto) + " " + e.puesto + ".º Equipo " + String(e.nombre) + " — "
            + PuntosClase.textoPuntos(Number(e.puntos) || 0) + (mio ? " (tu equipo)" : "");
        olEq.appendChild(li);
    });
    podioActual.lineas.filter((l) => l.puesto <= 3).forEach((l) => {
        const li = document.createElement("li");
        const mia = l.id === profile.id;
        const quien = l.nombre ? String(l.nombre) : (mia ? "Tú" : "");
        li.textContent = PuntosClase.medalla(l.puesto) + " " + l.puesto + ".º lugar" + (quien ? ": " + quien : "") + " — " + PuntosClase.textoPuntos(Number(l.puntos) || 0) + (mia && l.nombre ? " (tú)" : "");
        if (mia) li.className = "font-bold";
        ol.appendChild(li);
    });
    if (isTeacher || esObservador) return;
    const mia = podioActual.lineas.find((l) => l.id === profile.id);
    tu.hidden = false;
    tu.textContent = mia
        ? "Tú: " + mia.puesto + ".º lugar con " + PuntosClase.textoPuntos(Number(mia.puntos) || 0) + "."
        : "Todavía no sumaste puntos en esta clase: contesta la próxima pregunta.";
    const primero = (podioActual.equipos || [])[0];
    anunciarALaClase("podio", podioActual.at + ":" + tu.textContent, "Tu profe mostró el podio de la clase."
        + (primero ? " Va primero el equipo " + String(primero.nombre) + ", con " + PuntosClase.textoPuntos(Number(primero.puntos) || 0) + "." : "")
        + " " + tu.textContent);
}

if (document.getElementById("puntos-caja")) {
    document.getElementById("puntos-caja").addEventListener("toggle", (e) => { if (e.target.open) contarPuntos(); });
    document.getElementById("puntos-actualizar-btn").addEventListener("click", contarPuntos);
    document.getElementById("podio-mostrar-btn").addEventListener("click", () => mostrarPodio(document.getElementById("podio-con-nombres").checked));
}
// Los del mes: las clases de este mes del profe, con la misma regla y el mismo orden.
async function contarPuntosDelMes() {
    const caja = document.getElementById("puntos-mes-lista");
    caja.textContent = "Contando las clases del mes…";
    const { filas, error } = await PuntosClase.cargarDelMes(sb, profile.id);
    if (error) { console.error(error); caja.textContent = "No se pudieron contar los puntos del mes: " + error.message; return; }
    pintarListaDePuntos(caja, filas);
    const t = document.createElement("p");
    t.className = "text-xs font-semibold text-brand-700 dark:text-brand-200 mb-1";
    t.textContent = "Los puntos de " + PuntosClase.nombreDelMes() + ", sumando todas sus clases";
    caja.prepend(t);
}
if (document.getElementById("puntos-mes-btn")) {
    document.getElementById("puntos-mes-btn").addEventListener("click", (e) => {
        const caja = document.getElementById("puntos-mes-lista");
        caja.hidden = !caja.hidden;
        e.currentTarget.setAttribute("aria-expanded", caja.hidden ? "false" : "true");
        e.currentTarget.lastChild.textContent = caja.hidden ? "Ver los puntos del mes" : "Ocultar los puntos del mes";
        if (!caja.hidden) contarPuntosDelMes();
    });
}

if (document.getElementById("cierre-podio-btn")) {
    document.getElementById("cierre-podio-btn").addEventListener("click", () => {
        const cb = document.getElementById("podio-con-nombres");
        mostrarPodio(cb ? cb.checked : true);
    });
}
document.getElementById("podio-quitar-btn").addEventListener("click", async () => {
    const { error } = await sb.from("game_state").update({ podio: null }).eq("id", myGameStateId);
    if (error) { console.error(error); setStatus("No se pudo quitar el podio: " + error.message); return; }
    pintarPodio(null);
});

/* ---------- Los equipos (game_state.equipos) ----------
   El profe reparte a los conectados al azar en dos a cuatro equipos
   (PuntosClase.repartir: quedan parejos) y puede cambiar a cualquiera
   de equipo. Los ve toda la clase; los puntos de cada equipo se suman
   de los de sus integrantes y salen en el podio. Quien se conecta
   después queda «sin equipo» hasta que el profe lo pone en uno. */
let equiposActual = null;
const miEquipo = () => (equiposActual ? equiposActual.lista.find((e) => (e.miembros || []).some((m) => m.id === profile.id)) || null : null);

function muestraDeColor(color) {
    const m = document.createElement("span");
    m.setAttribute("aria-hidden", "true");
    m.className = "inline-block w-3 h-3 rounded-full shrink-0 align-middle mr-1.5";
    m.style.background = ClasesBoard.MARK_COLORS[color] || ClasesBoard.MARK_COLORS.naranja;
    return m;
}

function pintarEquipos(equipos) {
    equiposActual = equipos && Array.isArray(equipos.lista) && equipos.lista.length >= 2 ? equipos : null;
    {
        const mio = miEquipo();
        const con = mio ? (mio.miembros || []).filter((m) => m.id !== profile.id).map((m) => String(m.nombre || "Alumno")) : [];
        anunciarALaClase("equipos", equiposActual ? equiposActual.at + ":" + (mio ? mio.nombre + ":" + con.join(",") : "-") : null,
            mio ? "Estás en el equipo " + String(mio.nombre) + (con.length ? ", con " + con.join(", ") + "." : ", por ahora solo.")
                : "Tu profe armó equipos, y todavía no estás en ninguno.");
    }
    const caja = document.getElementById("equipos-caja");
    if (caja) {
        caja.hidden = !equiposActual;
        const ul = document.getElementById("equipos-lineas");
        ul.innerHTML = "";
        if (equiposActual) {
            const mio = miEquipo();
            equiposActual.lista.forEach((e) => {
                const li = document.createElement("li");
                const t = document.createElement("span");
                const nombres = (e.miembros || []).map((m) => String(m.nombre || "Alumno")).join(", ");
                // Los nombres los escribió una persona: textContent.
                t.textContent = "Equipo " + String(e.nombre) + ": " + (nombres || "nadie todavía") + (mio === e ? " (tu equipo)" : "");
                if (mio === e) li.className = "font-bold";
                li.append(muestraDeColor(e.color), t);
                ul.appendChild(li);
            });
        }
    }
    pintarEquiposProfe();
}

// Los controles del profe: cada equipo con sus puntos y un selector por integrante.
function pintarEquiposProfe() {
    const caja = document.getElementById("equipos-lista-profe");
    if (!caja || !isTeacher) return;
    document.getElementById("equipos-quitar-btn").hidden = !equiposActual;
    caja.innerHTML = "";
    if (!equiposActual) return;
    const puntos = new Map(PuntosClase.puntosDeEquipos(filasDePuntos, equiposActual.lista).map((e) => [e.nombre, e.puntos]));
    const enAlguno = new Set(equiposActual.lista.flatMap((e) => (e.miembros || []).map((m) => m.id)));
    const sinEquipo = [...onlineStudents.entries()].filter(([id]) => !enAlguno.has(id))
        .map(([id, info]) => ({ id, nombre: info.full_name || info.email || "Alumno" }));
    const grupos = equiposActual.lista.map((e, i) => ({ titulo: "Equipo " + e.nombre + " — " + PuntosClase.textoPuntos(puntos.get(e.nombre) || 0), color: e.color, miembros: e.miembros || [], indice: i }));
    if (sinEquipo.length) grupos.push({ titulo: "Sin equipo (se conectaron después)", color: null, miembros: sinEquipo, indice: -1 });
    grupos.forEach((g) => {
        const div = document.createElement("div");
        const h = document.createElement("p");
        h.className = "font-semibold text-brand-800 dark:text-brand-100";
        if (g.color) h.appendChild(muestraDeColor(g.color));
        h.appendChild(document.createTextNode(g.titulo));
        div.appendChild(h);
        const ul = document.createElement("ul");
        ul.className = "space-y-1 mt-1";
        g.miembros.forEach((m) => {
            const li = document.createElement("li");
            li.className = "flex items-center justify-between gap-2";
            const n = document.createElement("span");
            n.textContent = String(m.nombre || "Alumno");
            const sel = document.createElement("select");
            sel.className = "text-xs bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1 text-brand-700 dark:text-brand-200 focus:outline-none focus:ring-2 focus:ring-accent-500";
            sel.setAttribute("aria-label", "Equipo de " + String(m.nombre || "Alumno"));
            if (g.indice === -1) {
                const o = document.createElement("option");
                o.value = "-1"; o.textContent = "Elegir equipo…";
                sel.appendChild(o);
            }
            equiposActual.lista.forEach((e, i) => {
                const o = document.createElement("option");
                o.value = String(i);
                o.textContent = "Equipo " + e.nombre;
                sel.appendChild(o);
            });
            sel.value = String(g.indice);
            sel.addEventListener("change", () => moverDeEquipo(m, parseInt(sel.value, 10)));
            li.append(n, sel);
            ul.appendChild(li);
        });
        if (!g.miembros.length) {
            const li = document.createElement("li");
            li.className = "text-xs text-brand-500 dark:text-brand-300";
            li.textContent = "Nadie todavía.";
            ul.appendChild(li);
        }
        div.appendChild(ul);
        caja.appendChild(div);
    });
}

async function guardarEquipos(equipos) {
    const { error } = await sb.from("game_state").update({ equipos }).eq("id", myGameStateId);
    if (error) { console.error(error); setStatus("No se pudieron guardar los equipos: " + error.message); return false; }
    pintarEquipos(equipos);
    return true;
}

async function armarEquipos() {
    const alumnos = [...onlineStudents.entries()].map(([id, info]) => ({ id, nombre: info.full_name || info.email || "Alumno" }));
    const cuantos = parseInt(document.getElementById("equipos-cuantos").value, 10) || 2;
    if (alumnos.length < cuantos) {
        setStatus("Para " + cuantos + " equipos hacen falta al menos " + cuantos + " alumnos conectados, y hay " + alumnos.length + ".");
        return;
    }
    if (equiposActual && !(await Avisos.confirmar("Los equipos de ahora se reemplazan por unos nuevos, repartidos al azar.",
        { titulo: "¿Armar equipos nuevos?", aceptar: "Armar equipos nuevos" }))) return;
    if (await guardarEquipos(PuntosClase.repartir(alumnos, cuantos))) {
        setStatus("👥 Equipos armados: toda la clase ve en cuál quedó cada uno.");
    }
}

async function moverDeEquipo(miembro, destino) {
    if (!equiposActual || !(destino >= 0)) return;
    const lista = equiposActual.lista.map((e, i) => ({
        nombre: e.nombre, color: e.color,
        miembros: (e.miembros || []).filter((m) => m.id !== miembro.id).concat(i === destino ? [{ id: miembro.id, nombre: miembro.nombre }] : []),
    }));
    await guardarEquipos({ at: equiposActual.at, lista });
}

if (document.getElementById("equipos-armar-btn")) {
    document.getElementById("equipos-armar-btn").addEventListener("click", armarEquipos);
    document.getElementById("equipos-quitar-btn").addEventListener("click", async () => {
        if (await guardarEquipos(null)) setStatus("Quitaste los equipos.");
    });
    document.getElementById("equipos-profe").addEventListener("toggle", (e) => { if (e.target.open) pintarEquiposProfe(); });
}
