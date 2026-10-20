/* El código de sesion.html.

   Las prácticas de «Formación Ajedrez» en la clase en vivo: el profe le manda a
   la clase la práctica de una sesión (las láminas de sus ejercicios) y cada
   alumno las pasa a su ritmo —hacia delante y hacia atrás— y marca cuáles ya
   hizo. El profe ve cuántas lleva cada uno y cuándo todos terminaron. Ver «Las
   prácticas de Formación Ajedrez en la clase» en docs/decisiones/clase-en-vivo.md.

   - Qué práctica se mandó va en game_state.practica ({id, deck, titulo,
     laminas}), no en un mensaje suelto: quien entra tarde o recarga ve la misma.
     Solo el profe la pone (protect_game_state_teacher_columns) y el CHECK
     game_state_practica_forma rechaza otra forma. `id` cambia con cada envío:
     lo que un alumno marcó vale solo para ese id.
   - Lo que hizo cada alumno NO va en la base: es de ese rato. Lo guarda en su
     aparato (por si recarga) y lo anuncia en la presencia (`formacion`, {id,
     h: [láminas hechas]}), como el calentamiento. El profe lo junta en
     `formacionVistos`, y quien se desconecta no se borra de la lista.
   - Las láminas son las mismas que el profe proyecta (presentaciones del curso,
     detrás del candado del worker), pero SOLO las de la práctica: las de
     respuestas no están en la lista (herramientas/formacion-practicas.js).
   - Quién la ve para mandarla: quien puede_bajar('formacion-ajedrez'), igual que
     las presentaciones de ese curso.

   Como las demás partes de la clase (ver «sesion.js en partes»), es un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js (sb, profile,
   isTeacher, anunciarPresencia…) solo dentro de funciones. La parte que no toca
   la página (FormacionPractica) es pura, para poder probarla sola. */

window.FormacionPractica = (function () {
    const CURSO = "formacion-ajedrez";
    const RUTA = "cursos/recursos/" + CURSO + "/practicas.json";
    const FORMA_DECK = /^[a-z0-9-]{1,60}\/[a-z0-9-]{1,40}$/;

    // La misma forma que exige el CHECK de la base: lo demás se trata como «ninguna».
    function valida(p) {
        return !!(p && typeof p === "object" && !Array.isArray(p)
            && typeof p.id === "string" && p.id.length >= 4 && p.id.length <= 40
            && typeof p.deck === "string" && FORMA_DECK.test(p.deck)
            && typeof p.titulo === "string" && p.titulo.length >= 1 && p.titulo.length <= 160
            && Array.isArray(p.laminas) && p.laminas.length >= 1 && p.laminas.length <= 40
            && p.laminas.every((n) => Number.isInteger(n) && n >= 1 && n <= 500));
    }

    // Lo que viaja a la base: solo lo que el CHECK pide, con un id nuevo.
    function paraMandar(practica, azar) {
        const r = azar || Math.random;
        const id = Math.floor(r() * 36 ** 6).toString(36).padStart(6, "0") + Date.now().toString(36).slice(-4);
        return { id, deck: practica.deck, titulo: practica.titulo.slice(0, 160), laminas: practica.laminas.map((l) => l.n) };
    }

    // Las láminas hechas que de verdad son de la práctica, sin repetir y en su orden.
    function limpiarHechas(hechas, laminas) {
        const hechasSet = new Set(Array.isArray(hechas) ? hechas : []);
        return (laminas || []).filter((n) => hechasSet.has(n));
    }

    // Una lámina hecha o deshecha: devuelve la lista nueva.
    function alternar(hechas, laminas, n) {
        const set = new Set(limpiarHechas(hechas, laminas));
        if (!(laminas || []).includes(n)) return [...set];
        if (set.has(n)) set.delete(n); else set.add(n);
        return limpiarHechas([...set], laminas);
    }

    const completa = (hechas, laminas) => limpiarHechas(hechas, laminas).length === (laminas || []).length && (laminas || []).length > 0;

    // Lo del grupo: cuántos terminaron toda la práctica, de los que hay en la lista.
    function resumen(filas, laminas) {
        const total = filas.length;
        const terminaron = filas.filter((f) => completa(f.hechas, laminas)).length;
        return { total, terminaron, todos: total > 0 && terminaron === total };
    }

    // Sin repetir una práctica mal armada: la lista que baja del sitio, validada.
    function leerLista(json) {
        const lista = json && Array.isArray(json.practicas) ? json.practicas : [];
        return lista.filter((p) => p && typeof p.deck === "string" && FORMA_DECK.test(p.deck) && typeof p.titulo === "string"
            && Array.isArray(p.laminas) && p.laminas.length && p.laminas.every((l) => l && Number.isInteger(l.n) && l.n >= 1 && l.n <= 500));
    }

    return { CURSO, RUTA, valida, paraMandar, limpiarHechas, alternar, completa, resumen, leerLista };
})();

let formacionActual = null;       // la de game_state: {id, deck, titulo, laminas} (o null)
let formacionPracticas = null;    // profe: las prácticas del curso (null = sin pedir todavía)
let formacionPermiso = null;      // profe: ¿puede mandar las de Formación Ajedrez?
let formacionMia = null;          // alumno: {clave, hechas: [n…], i} de la práctica que ve
let formacionPresencia = null;    // lo que el alumno anuncia en la presencia: {id, h: [n…]}
let formacionAnuncioPendiente = null;
let formacionPintando = 0;        // para descartar una lámina vieja que llega tarde
const formacionVistos = new Map(); // profe: id → {nombre, hechas, conectado}, de esta práctica
let formacionVistosDe = null;

const claveDeFormacion = (p) => "clase_formacion_v1:" + myGameStateId + ":" + p.id;

function guardarFormacionMia() {
    if (!formacionMia) return;
    try { localStorage.setItem(formacionMia.clave, JSON.stringify({ hechas: formacionMia.hechas, i: formacionMia.i })); } catch (e) {}
}

/* Los 30 alumnos marcando a la vez anunciarían en el mismo segundo, y cada
   anuncio le llega a todos los conectados (ver anunciarTanda): cada alumno
   espera un rato al azar y manda lo último que tenga. */
function anunciarFormacion() {
    if (formacionAnuncioPendiente) return;
    formacionAnuncioPendiente = setTimeout(() => {
        formacionAnuncioPendiente = null;
        enviarAnuncioDeFormacion().catch((e) => console.error(e));
    }, 300 + Math.random() * 1700);
}

async function enviarAnuncioDeFormacion() {
    const nuevo = formacionMia && formacionActual ? { id: formacionActual.id, h: formacionMia.hechas.slice() } : null;
    if (JSON.stringify(nuevo) === JSON.stringify(formacionPresencia)) return;
    formacionPresencia = nuevo;
    if (!vistaPrevia) await anunciarPresencia();
}

/* ---------- Lo que llega de game_state ---------- */
function pintarFormacion(p) {
    const antes = formacionActual;
    formacionActual = FormacionPractica.valida(p) ? p : null;
    const tarjeta = document.getElementById("formacion-tarjeta");
    if (!tarjeta) return;
    if (!formacionActual) {
        pintarFormacionProfe();
        formacionPintando += 1;
        tarjeta.hidden = true;
        formacionMia = null;
        formacionVistos.clear();
        formacionVistosDe = null;
        anunciarALaClase("formacion", null);
        if (formacionPresencia) anunciarFormacion();
        return;
    }
    if (isTeacher) {
        if (formacionVistosDe !== formacionActual.id) { formacionVistos.clear(); formacionVistosDe = formacionActual.id; }
        anotarFormacionDeLaPresencia();
        pintarFormacionProfe();
        return;
    }
    if (esObservador || modoProyector) { tarjeta.hidden = true; return; }
    anunciarALaClase("formacion", formacionActual.id, "Tu profe mandó una práctica: " + formacionActual.titulo
        + ". Tiene " + formacionActual.laminas.length + (formacionActual.laminas.length === 1 ? " lámina" : " láminas")
        + ". Está en tu pantalla, debajo del tablero: pásalas con Anterior y Siguiente, y marca cada una como completada.");
    if (antes && antes.id === formacionActual.id && formacionMia) return;
    let guardado = null;
    const clave = claveDeFormacion(formacionActual);
    try { guardado = JSON.parse(localStorage.getItem(clave) || "null"); } catch (e) { guardado = null; }
    const hechas = FormacionPractica.limpiarHechas(guardado && guardado.hechas, formacionActual.laminas);
    const i = guardado && Number.isInteger(guardado.i) && guardado.i >= 0 && guardado.i < formacionActual.laminas.length ? guardado.i : 0;
    formacionMia = { clave, hechas, i };
    pintarLaminaDeFormacion();
    anunciarFormacion();
}

async function pintarLaminaDeFormacion() {
    const tarjeta = document.getElementById("formacion-tarjeta");
    const p = formacionActual;
    if (!tarjeta || !p || !formacionMia) return;
    tarjeta.hidden = false;
    const turno = ++formacionPintando;
    const laminas = p.laminas;
    const i = formacionMia.i;
    const n = laminas[i];
    const hecha = formacionMia.hechas.includes(n);
    const todas = FormacionPractica.completa(formacionMia.hechas, laminas);
    textoConEmojiMudo(document.getElementById("formacion-titulo"), "📝 Práctica: " + p.titulo);
    document.getElementById("formacion-cuenta").textContent = "Lámina " + (i + 1) + " de " + laminas.length
        + " · " + formacionMia.hechas.length + " de " + laminas.length + " completadas";
    document.getElementById("formacion-anterior").disabled = i <= 0;
    document.getElementById("formacion-siguiente").disabled = i >= laminas.length - 1;
    const marcar = document.getElementById("formacion-hecha");
    marcar.setAttribute("aria-pressed", String(hecha));
    textoConEmojiMudo(marcar, hecha ? "✅ Completada (toca para desmarcar)" : "☑️ Marcar como completada");
    const fin = document.getElementById("formacion-fin");
    fin.hidden = !todas;
    fin.textContent = todas ? "¡Terminaste toda la práctica! Tu profe ya lo ve. Si quieres, puedes volver a cualquier lámina." : "";
    // Los números de lámina, para saltar a una: el estado va escrito, no solo en el color.
    const nav = document.getElementById("formacion-pasos");
    nav.replaceChildren();
    laminas.forEach((lam, k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "min-w-[2.25rem] min-h-[2.25rem] text-xs font-semibold px-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
            + (k === i ? "bg-accent-500 text-brand-900" : formacionMia.hechas.includes(lam)
                ? "bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100" : "bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200");
        b.textContent = String(k + 1) + (formacionMia.hechas.includes(lam) ? " ✓" : "");
        b.setAttribute("aria-label", "Lámina " + (k + 1) + (formacionMia.hechas.includes(lam) ? ", completada" : ", sin completar"));
        if (k === i) b.setAttribute("aria-current", "step");
        b.addEventListener("click", () => irALaminaDeFormacion(k));
        nav.appendChild(b);
    });
    const img = document.getElementById("formacion-img");
    const msg = document.getElementById("formacion-msg");
    try {
        const datos = await PresentacionClase.cargar(p.deck);
        if (turno !== formacionPintando) return;
        const d = datos.diapositivas[n - 1];
        if (!d) throw new Error("no_disponible");
        const src = await PresentacionClase.url(p.deck, d);
        if (turno !== formacionPintando) return;
        msg.hidden = true;
        img.src = src;
        img.alt = "Lámina " + (i + 1) + " de la práctica: " + d.titulo;
        document.getElementById("formacion-texto").textContent = d.texto || "";
        // La siguiente, de una vez: así pasa sin esperar.
        if (i < laminas.length - 1 && datos.diapositivas[laminas[i + 1] - 1]) {
            PresentacionClase.url(p.deck, datos.diapositivas[laminas[i + 1] - 1]).then((u) => { const pre = new Image(); pre.src = u; }).catch(() => {});
        }
    } catch (e) {
        if (turno !== formacionPintando) return;
        img.removeAttribute("src");
        msg.textContent = e && e.message === "sin_acceso" ? "Tu cuenta no tiene acceso a las láminas de esta práctica. Avísale a tu profe."
            : "No se pudo abrir la lámina. Revisa tu conexión y vuelve a tocar el número de la lámina.";
        msg.hidden = false;
    }
}

function irALaminaDeFormacion(k) {
    if (!formacionActual || !formacionMia) return;
    formacionMia.i = Math.max(0, Math.min(formacionActual.laminas.length - 1, k));
    guardarFormacionMia();
    pintarLaminaDeFormacion();
}

function marcarLaminaDeFormacion() {
    if (!formacionActual || !formacionMia) return;
    const n = formacionActual.laminas[formacionMia.i];
    const antes = FormacionPractica.completa(formacionMia.hechas, formacionActual.laminas);
    formacionMia.hechas = FormacionPractica.alternar(formacionMia.hechas, formacionActual.laminas, n);
    guardarFormacionMia();
    pintarLaminaDeFormacion();
    anunciarFormacion();
    if (!antes && FormacionPractica.completa(formacionMia.hechas, formacionActual.laminas) && claseAcc) {
        claseAcc.decir("Terminaste toda la práctica. Tu profe ya lo ve.");
    }
}

/* ---------- El profe ---------- */
let formacionCargando = false;
async function cargarPracticasDeFormacion() {
    if (!isTeacher || formacionPracticas || formacionCargando) return;
    const caja = document.getElementById("formacion-caja");
    if (!caja) return;
    formacionCargando = true;
    try {
        const { data, error } = await sb.rpc("puede_bajar", { p_producto: FormacionPractica.CURSO, p_basta_acceso: false });
        if (error) throw error;
        formacionPermiso = data === true;
        if (!formacionPermiso) { formacionPracticas = []; formacionCargando = false; return; }
        const r = await fetch(FormacionPractica.RUTA, { credentials: "same-origin" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        formacionPracticas = FormacionPractica.leerLista(await r.json());
    } catch (e) {
        console.error("No se pudieron cargar las prácticas de Formación Ajedrez:", e);
        formacionCargando = false;
        return;
    }
    formacionCargando = false;
    const sel = document.getElementById("formacion-select");
    sel.replaceChildren();
    formacionPracticas.forEach((p, k) => {
        const o = document.createElement("option");
        o.value = String(k);
        o.textContent = p.titulo + " (" + p.laminas.length + (p.laminas.length === 1 ? " lámina)" : " láminas)");
        sel.appendChild(o);
    });
    caja.hidden = !formacionPracticas.length;
    pintarFormacionProfe();
}

async function mandarPracticaDeFormacion() {
    const aviso = document.getElementById("formacion-aviso");
    const k = parseInt(document.getElementById("formacion-select").value, 10);
    const practica = formacionPracticas && formacionPracticas[k];
    if (!practica || !myGameStateId) return;
    const nueva = FormacionPractica.paraMandar(practica);
    if (!FormacionPractica.valida(nueva)) { aviso.textContent = "Esa práctica no tiene la forma que la base acepta."; return; }
    aviso.textContent = "Mandando…";
    const { data, error } = await sb.from("game_state").update({ practica: nueva }).eq("id", myGameStateId).select("practica").single();
    if (error) { console.error(error); aviso.textContent = "No se pudo mandar la práctica. Vuelve a intentarlo."; return; }
    aviso.textContent = "";
    pintarFormacion(data && data.practica ? data.practica : nueva);
}

async function quitarPracticaDeFormacion() {
    const aviso = document.getElementById("formacion-aviso");
    const { error } = await sb.from("game_state").update({ practica: null }).eq("id", myGameStateId);
    if (error) { console.error(error); aviso.textContent = "No se pudo quitar la práctica. Vuelve a intentarlo."; return; }
    aviso.textContent = "";
    pintarFormacion(null);
}

function anotarFormacionDeLaPresencia() {
    if (!isTeacher || !formacionActual) return;
    for (const v of formacionVistos.values()) v.conectado = false;
    for (const [id, s] of onlineStudents.entries()) {
        const f = s.formacion && s.formacion.id === formacionActual.id ? s.formacion : null;
        const antes = formacionVistos.get(id);
        formacionVistos.set(id, Object.assign({ hechas: [] }, antes || {},
            f ? { hechas: FormacionPractica.limpiarHechas(f.h, formacionActual.laminas) } : {},
            { nombre: s.full_name || s.email || "Alumno", conectado: true }));
    }
}

function pintarFormacionProfe() {
    const seg = document.getElementById("formacion-seguimiento");
    if (!seg) return;
    const hay = isTeacher && !!formacionActual;
    seg.hidden = !hay;
    document.getElementById("formacion-quitar-btn").hidden = !hay;
    document.getElementById("formacion-mandar-btn").textContent = hay ? "Mandar de nuevo (empieza de cero)" : "Mandar a la clase";
    if (!hay) return;
    const laminas = formacionActual.laminas;
    document.getElementById("formacion-enviada").textContent = "Enviada: " + formacionActual.titulo + " · " + laminas.length + (laminas.length === 1 ? " lámina" : " láminas");
    const filas = [...formacionVistos.entries()].map(([id, v]) => Object.assign({ id }, v));
    const r = FormacionPractica.resumen(filas, laminas);
    const cuenta = document.getElementById("formacion-cuenta-profe");
    cuenta.textContent = !filas.length ? "Todavía no hay alumnos conectados."
        : r.todos ? "✅ Todos terminaron: " + r.terminaron + " de " + r.total + (r.total === 1 ? " alumno." : " alumnos.")
            : "Han terminado toda la práctica: " + r.terminaron + " de " + r.total + (r.total === 1 ? " alumno." : " alumnos.");
    filas.sort((a, b) => Number(FormacionPractica.completa(a.hechas, laminas)) - Number(FormacionPractica.completa(b.hechas, laminas))
        || String(a.nombre).localeCompare(String(b.nombre)));
    const ul = document.getElementById("formacion-lista");
    ul.replaceChildren();
    for (const v of filas) {
        const li = document.createElement("li");
        li.className = "flex flex-wrap items-center gap-2 py-1 border-b border-brand-100 dark:border-brand-800 last:border-0";
        const nombre = document.createElement("span");
        nombre.className = "font-semibold w-full break-words";
        // El nombre lo escribió una persona: textContent.
        nombre.textContent = v.nombre + (v.conectado ? "" : " (se desconectó)");
        const hechas = FormacionPractica.limpiarHechas(v.hechas, laminas).length;
        const cuentaAlumno = document.createElement("span");
        cuentaAlumno.textContent = hechas >= laminas.length ? "✅ Terminó (" + hechas + " de " + laminas.length + ")" : hechas + " de " + laminas.length + " completadas";
        const barra = document.createElement("progress");
        barra.max = laminas.length;
        barra.value = hechas;
        barra.className = "w-20 h-2";
        barra.setAttribute("aria-label", "Avance de " + v.nombre);
        li.append(nombre, cuentaAlumno, barra);
        ul.appendChild(li);
    }
}

if (document.getElementById("formacion-tarjeta")) {
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
    on("formacion-anterior", () => formacionMia && irALaminaDeFormacion(formacionMia.i - 1));
    on("formacion-siguiente", () => formacionMia && irALaminaDeFormacion(formacionMia.i + 1));
    on("formacion-hecha", marcarLaminaDeFormacion);
    on("formacion-mandar-btn", () => mandarPracticaDeFormacion());
    on("formacion-quitar-btn", () => quitarPracticaDeFormacion());
    const tarjeta = document.getElementById("formacion-tarjeta");
    // ← → pasan de lámina cuando el foco está dentro de la tarjeta (y no en un campo).
    if (tarjeta) tarjeta.addEventListener("keydown", (e) => {
        if (!formacionMia || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); irALaminaDeFormacion(formacionMia.i - 1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); irALaminaDeFormacion(formacionMia.i + 1); }
    });
}
