/* El código de academias.html.

   Vivía escrito dentro de la página, en un <script> de 45 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Academias.
 *
 * Una página, dos públicos, como Informes:
 *  - quien administra ve todas, las crea, les pone supervisor y les reparte
 *    cualquier cuenta;
 *  - quien supervisa ve SOLO la suya: pone su WhatsApp y su correo, suma o
 *    quita a los alumnos de sus profesores y decide qué puede hacer cada
 *    coordinador.
 *
 * Todo se escribe por funciones de la base (academia_guardar,
 * academia_set_miembros, academia_set_funciones_coordinador…), que son las que
 * deciden quién puede qué. Esta pantalla solo no ofrece lo que la base va a
 * rechazar.
 *
 * La gente de la academia se manda SIEMPRE como lista completa, con el cambio
 * encima (la regla de set_teachers): mandar solo lo nuevo vaciaría la academia.
 */
const MOSTRAR = 40;
let session = null, perfil = null, esAdmin = false;
let academias = [];      // las que se ven
let perfiles = [];       // quien administra: todas las cuentas
let abierta = null;      // la academia abierta
let personas = [];       // academia_personas(): miembros y, para sumar, alumnos de sus profesores
let supervisores = [];   // quien administra: cuentas marcadas como supervisoras
let borrarPendiente = false;

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
function sinTildes(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function nombreDe(p) { return (p.full_name || p.nombre || "").trim() || String(p.email || p.correo || "").split("@")[0] || "Sin nombre"; }
function coincide(p, q) {
    if (!q) return true;
    return sinTildes([nombreDe(p), p.email || p.correo || "", p.grupo || ""].join(" ")).includes(q);
}
const ROL = { profesor: "Profesores", alumno: "Alumnos", admin: "Administración" };
function rolDe(p) { return (p.es_coordinador ? "coordinador" : (p.rol || p.role || "alumno")); }

/* PostgREST corta la respuesta sin avisar a partir de cierta cantidad de
   filas: se pide de mil en mil. */
async function traerTodo(armar) {
    const todo = [];
    for (let desde = 0; ; desde += 1000) {
        const { data, error } = await armar().range(desde, desde + 999);
        if (error) throw error;
        todo.push(...(data || []));
        if (!data || data.length < 1000) return todo;
    }
}

// ── La lista (quien administra) ─────────────────────────────────────────

async function cargarAcademias() {
    const { data, error } = await sb.from("academias").select("*").order("nombre");
    if (error) { avisar("No se pudieron cargar las academias: " + error.message, true); academias = []; return false; }
    academias = data || [];
    return true;
}

/* El emoji del título va escondido del lector de pantalla, como en todo el sitio. */
function ponerTitulo(texto) {
    const h = document.getElementById("titulo");
    const e = el("span", null, "🏫");
    e.setAttribute("aria-hidden", "true");
    h.replaceChildren(e, document.createTextNode(" " + texto));
}

function nombreDeId(id) {
    const p = perfiles.find((x) => x.id === id) || supervisores.find((x) => x.id === id);
    return p ? nombreDe(p) : "";
}

function llenarSupervisores(select, actual) {
    select.replaceChildren();
    const nadie = el("option", null, "— sin supervisor todavía —");
    nadie.value = "";
    select.appendChild(nadie);
    /* Un supervisor puede tener varias academias (las ve de una en una, ver
       «Un supervisor, varias academias»): se ofrecen todos, y se dice cuáles
       ya tiene para que no sea una sorpresa. */
    const otras = new Map();
    academias.filter((a) => a.id !== (abierta && abierta.id) && a.supervisor_id).forEach((a) => {
        if (!otras.has(a.supervisor_id)) otras.set(a.supervisor_id, []);
        otras.get(a.supervisor_id).push(a.nombre);
    });
    supervisores.forEach((s) => {
        const o = el("option", null, nombreDe(s) + (otras.has(s.id) ? " (también supervisa " + otras.get(s.id).join(", ") + ")" : ""));
        o.value = s.id;
        select.appendChild(o);
    });
    select.value = actual || "";
}

async function pintarLista() {
    document.getElementById("vista-academia").hidden = true;
    document.getElementById("vista-lista").hidden = false;
    document.getElementById("intro").textContent = "Cada academia tiene su supervisor, su gente y su nombre en los correos que les llegan a las familias.";
    let miembros = [];
    try { miembros = await traerTodo(() => sb.from("academia_miembros").select("academia_id, persona_id").order("academia_id")); }
    catch (err) { avisar("No se pudo contar la gente de cada academia: " + (err.message || err), true); }
    const porId = new Map(perfiles.map((p) => [p.id, p]));
    const ul = document.getElementById("lista");
    ul.replaceChildren();
    if (!academias.length) {
        ul.appendChild(el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-6 text-center text-sm text-brand-500 dark:text-brand-300", "Todavía no hay ninguna academia. Crea la primera abajo."));
    }
    academias.forEach((a) => {
        const suyos = (miembros || []).filter((m) => m.academia_id === a.id).map((m) => porId.get(m.persona_id)).filter(Boolean);
        const prof = suyos.filter((p) => p.role === "profesor").length;
        const alum = suyos.filter((p) => p.role === "alumno").length;
        const li = el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 flex flex-wrap items-center justify-between gap-3");
        const izq = el("div");
        izq.appendChild(el("h3", "font-semibold text-lg text-brand-900 dark:text-white", a.nombre));
        izq.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300",
            (a.supervisor_id ? "Supervisa " + nombreDeId(a.supervisor_id) : "⚠️ Sin supervisor: las respuestas de las familias caen en informes@") +
            " · " + prof + (prof === 1 ? " profesor" : " profesores") + " · " + alum + (alum === 1 ? " alumno" : " alumnos")));
        const abrir = el("button", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Abrir");
        abrir.type = "button";
        abrir.setAttribute("aria-label", "Abrir " + a.nombre);
        abrir.addEventListener("click", () => abrirAcademia(a.id));
        li.append(izq, abrir);
        ul.appendChild(li);
    });
    llenarSupervisores(document.getElementById("n-supervisor"), "");
    llenarGrupos();
    if (esAdmin) await pintarIA();
}

/* ── «Mejorar informe»: el modelo, el tope y el gasto de cada academia ──────
   SOLO para quien administra, y por eso se arma acá con JavaScript y no está
   escrito en el HTML: al supervisor no le llega ni el marcado. Los profesores
   ven el botón y nada más (public.ia_disponible()). */
const MODELOS_IA = [
    { id: "", nombre: "Sin IA (el botón no aparece)" },
    { id: "claude-haiku-4-5", nombre: "Claude Haiku 4.5 — el más económico (US$1 / US$5 por millón de tokens)" },
    { id: "claude-sonnet-5", nombre: "Claude Sonnet 5 — intermedio (US$2 / US$10)" },
    { id: "claude-opus-5", nombre: "Claude Opus 5 — el más capaz (US$5 / US$25)" },
];
const dolares = (n) => "US$" + (Number(n) || 0).toFixed(2);

async function pintarIA() {
    let seccion = document.getElementById("seccion-ia");
    if (!seccion) {
        seccion = el("section", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 mb-8");
        seccion.id = "seccion-ia";
        seccion.setAttribute("aria-labelledby", "h-ia");
        const h = el("h2", "font-semibold text-lg text-brand-900 dark:text-white mb-1");
        h.id = "h-ia";
        h.innerHTML = '<span aria-hidden="true">✨</span> Mejorar informe';
        seccion.append(h, el("p", "text-sm text-brand-500 dark:text-brand-300 mb-4",
            "Qué modelo usa cada academia para el botón «Mejorar informe», cuánto puede gastar por mes y cuánto lleva. Esto solo lo ves tú: los profesores ven el botón, y si su academia no tiene IA o se quedó sin presupuesto, el botón no aparece. El mes se cuenta en hora de Costa Rica."));
        const cuerpo = el("div", "space-y-4");
        cuerpo.id = "ia-filas";
        seccion.appendChild(cuerpo);
        document.getElementById("lista").insertAdjacentElement("afterend", seccion);
    }
    const cuerpo = document.getElementById("ia-filas");
    const [conf, gasto] = await Promise.all([
        sb.from("academia_ia").select("academia_id, modelo, tope_mensual_usd"),
        sb.rpc("ia_resumen_mes", { p_dia: null }),
    ]);
    if (conf.error || gasto.error) {
        cuerpo.replaceChildren(el("p", "text-sm text-red-700 dark:text-red-300",
            "No se pudo leer la configuración o el gasto de la IA: " + ((conf.error || gasto.error).message || "")));
        return;
    }
    const confDe = new Map((conf.data || []).map((c) => [c.academia_id || "", c]));
    const gastoDe = new Map((gasto.data || []).map((g) => [g.academia_id || "", g]));
    const filas = academias.map((a) => ({ id: a.id, nombre: a.nombre }))
        .concat([{ id: "", nombre: "Sin academia (tú y quien no es de ninguna academia)" }]);
    let total = 0;
    cuerpo.replaceChildren();
    filas.forEach((f) => {
        const c = confDe.get(f.id) || { modelo: null, tope_mensual_usd: 5 };
        const g = gastoDe.get(f.id) || { llamadas: 0, fallidas: 0, costo_usd: 0 };
        total += Number(g.costo_usd) || 0;
        const clave = f.id || "general";
        const caja = el("fieldset", "border border-brand-100 dark:border-brand-800 rounded-xl p-4");
        caja.appendChild(el("legend", "px-1 font-semibold text-brand-900 dark:text-white", f.nombre));
        const grid = el("div", "grid sm:grid-cols-3 gap-3 items-end");
        const dm = el("div", "sm:col-span-2");
        const lm = el("label", "block text-sm font-semibold mb-1", "Modelo");
        lm.htmlFor = "ia-modelo-" + clave;
        const sel = el("select", "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        sel.id = "ia-modelo-" + clave;
        MODELOS_IA.forEach((m) => { const o = el("option", null, m.nombre); o.value = m.id; sel.appendChild(o); });
        sel.value = c.modelo || "";
        dm.append(lm, sel);
        const dt = el("div");
        const lt = el("label", "block text-sm font-semibold mb-1", "Tope al mes (US$)");
        lt.htmlFor = "ia-tope-" + clave;
        const tope = el("input", "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        tope.id = "ia-tope-" + clave;
        tope.type = "number"; tope.min = "0"; tope.max = "1000"; tope.step = "0.5"; tope.inputMode = "decimal";
        tope.value = String(Number(c.tope_mensual_usd));
        dt.append(lt, tope);
        grid.append(dm, dt);
        const gastado = Number(g.costo_usd) || 0;
        const lleva = el("p", "text-sm mt-3 " + (c.modelo && gastado >= Number(c.tope_mensual_usd) ? "text-red-700 dark:text-red-300 font-semibold" : "text-brand-600 dark:text-brand-300"),
            "Este mes: " + dolares(gastado) + " de " + dolares(c.tope_mensual_usd) + " · " + g.llamadas + (Number(g.llamadas) === 1 ? " vez" : " veces") +
            (Number(g.fallidas) ? " (" + g.fallidas + " no salieron)" : "") +
            (c.modelo && gastado >= Number(c.tope_mensual_usd) ? " · Se acabó el presupuesto: el botón ya no aparece hasta el mes que viene." : ""));
        lleva.id = "ia-lleva-" + clave;
        const guardar = el("button", "mt-3 bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Guardar");
        guardar.type = "button";
        guardar.setAttribute("aria-label", "Guardar la IA de " + f.nombre);
        guardar.addEventListener("click", async () => {
            const n = Number(String(tope.value).replace(",", "."));
            if (!Number.isFinite(n) || n < 0 || n > 1000) { avisar("El tope mensual va de 0 a 1000 dólares.", true); tope.focus(); return; }
            const { error } = await sb.rpc("ia_guardar_config", { p_academia: f.id || null, p_modelo: sel.value || null, p_tope: n });
            if (error) { avisar(error.message, true); return; }
            avisar(sel.value ? "Guardado: " + f.nombre + " usa " + sel.options[sel.selectedIndex].text.split(" —")[0] + " con un tope de " + dolares(n) + " al mes." : "Guardado: " + f.nombre + " queda sin IA.");
            await pintarIA();
        });
        caja.append(grid, lleva, guardar);
        cuerpo.appendChild(caja);
    });
    cuerpo.appendChild(el("p", "text-sm font-semibold text-brand-900 dark:text-white", "Total este mes: " + dolares(total)));
}

document.getElementById("form-nueva").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("n-nombre").value.trim();
    if (nombre.length < 2) { avisar("Ponle un nombre a la academia.", true); document.getElementById("n-nombre").focus(); return; }
    const sup = document.getElementById("n-supervisor").value || null;
    const { data, error } = await sb.rpc("academia_guardar", { p_id: null, p_nombre: nombre, p_supervisor: sup, p_whatsapp: null, p_correo: null });
    if (error) { avisar(error.message, true); return; }
    document.getElementById("n-nombre").value = "";
    await cargarAcademias();
    avisar("Academia «" + data.nombre + "» creada. Ahora súmale su gente.");
    await abrirAcademia(data.id);
});

/* ── Crear una academia desde un grupo ─────────────────────────────────────
   Quién entraría lo dice la base (grupo_para_academia): los alumnos del grupo,
   el equipo docente con ese grupo y los profesores de esos alumnos, con
   profesores_de() —asignación directa o equipo—, que es la única fuente de
   «quién es profesor de quién». Crear es UNA llamada: nombrar al supervisor,
   crear la academia y sumar a la gente son el mismo acto, y partido en tres una
   falla a mitad dejaría una academia vacía que se ve perfecta. */
let gGente = [];           // lo que devolvió grupo_para_academia para el grupo elegido
let gNombreTocado = false; // si ya escribió un nombre, cambiar de grupo no se lo pisa
let gPeticion = 0;

function llenarGrupos() {
    const sel = document.getElementById("g-grupo");
    const cuenta = new Map();
    perfiles.forEach((p) => {
        const g = (p.grupo || "").trim();
        if (!g || p.is_admin) return;
        const k = g.toUpperCase();
        const c = cuenta.get(k) || { nombre: g, alumnos: 0 };
        if (p.role === "alumno") c.alumnos++;
        cuenta.set(k, c);
    });
    const actual = sel.value;
    sel.replaceChildren();
    const nada = el("option", null, "— elige un grupo —");
    nada.value = "";
    sel.appendChild(nada);
    [...cuenta.values()].sort((a, b) => b.alumnos - a.alumnos || a.nombre.localeCompare(b.nombre, "es")).forEach((c) => {
        const o = el("option", null, c.nombre + " (" + c.alumnos + (c.alumnos === 1 ? " alumno)" : " alumnos)"));
        o.value = c.nombre;
        sel.appendChild(o);
    });
    sel.value = [...sel.options].some((o) => o.value === actual) ? actual : "";
}

function gDocentes() { return gGente.filter((p) => p.rol !== "alumno"); }
function gAlumnos() { return gGente.filter((p) => p.rol === "alumno"); }

function gSeleccion() {
    const ids = [...document.querySelectorAll("#g-docentes input:checked")].map((i) => i.value);
    if (document.getElementById("g-alumnos").checked) ids.push(...gAlumnos().map((p) => p.id));
    return ids;
}

function gActualizarBoton() {
    const n = gSeleccion().length;
    const b = document.getElementById("g-crear");
    b.textContent = n ? "Crear la academia con " + n + (n === 1 ? " persona" : " personas") : "Marca a alguien para crear la academia";
    b.disabled = n === 0;
    b.classList.toggle("opacity-60", n === 0);
    const sup = document.getElementById("g-supervisor");
    const elegido = gGente.find((p) => p.id === sup.value) || supervisores.find((p) => p.id === sup.value);
    document.getElementById("g-supervisor-nota").textContent = !sup.value
        ? "Sin supervisor, las respuestas de las familias caen en informes@. Se puede poner después."
        : elegido && !elegido.es_supervisor
            ? "Al crear la academia, " + nombreDe(elegido) + " queda marcado como supervisor."
            : "A su correo llegan las respuestas de las familias.";
}

function gPintar() {
    const docentes = gDocentes(), alumnos = gAlumnos();
    const cont = document.getElementById("g-docentes");
    cont.replaceChildren();
    if (!docentes.length) cont.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "Nadie del equipo docente tiene este grupo ni da clase a sus alumnos."));
    docentes.forEach((p) => {
        const id = "g-doc-" + p.id;
        const lab = el("label", "flex items-start gap-2 text-sm");
        lab.htmlFor = id;
        const cb = el("input", "mt-1 h-4 w-4");
        cb.type = "checkbox"; cb.id = id; cb.value = p.id; cb.checked = true;
        cb.addEventListener("change", gActualizarBoton);
        const tx = el("span");
        tx.appendChild(el("span", "font-medium", nombreDe(p)));
        const detalle = [p.es_coordinador ? "coordina" : "profesor"];
        if (p.alumnos_del_grupo) detalle.push("da clase a " + p.alumnos_del_grupo + (p.alumnos_del_grupo === 1 ? " alumno del grupo" : " alumnos del grupo"));
        else if (p.en_grupo) detalle.push("tiene este grupo en su cuenta");
        if ((p.academias || []).length) detalle.push("ya está en " + p.academias.join(", "));
        tx.appendChild(el("span", "block text-xs text-brand-450 dark:text-brand-350", detalle.join(" · ")));
        lab.append(cb, tx);
        cont.appendChild(lab);
    });
    document.getElementById("g-alumnos-texto").textContent = alumnos.length
        ? "Sumar a los " + alumnos.length + (alumnos.length === 1 ? " alumno del grupo" : " alumnos del grupo")
        : "Este grupo no tiene alumnos.";
    const alumnosCb = document.getElementById("g-alumnos");
    alumnosCb.disabled = !alumnos.length;
    alumnosCb.checked = alumnos.length > 0;
    const enOtra = alumnos.filter((p) => (p.academias || []).length).length;
    document.getElementById("g-alumnos-otra").textContent = enOtra
        ? enOtra + (enOtra === 1 ? " ya está en otra academia y queda en las dos" : " ya están en otra academia y quedan en las dos") +
          ": recibirán un solo informe, con la suma de lo que entrenaron."
        : "";

    // El supervisor: los que ya supervisan y no tienen academia, y los profesores
    // del grupo (a esos se los marca al crear). Quien ya supervisa otra también
    // se ofrece: puede tener varias, y se dice cuáles.
    const sup = document.getElementById("g-supervisor");
    const otras = new Map();
    academias.filter((a) => a.supervisor_id).forEach((a) => {
        if (!otras.has(a.supervisor_id)) otras.set(a.supervisor_id, []);
        otras.get(a.supervisor_id).push(a.nombre);
    });
    const yaTiene = (id) => (otras.has(id) ? " (también supervisa " + otras.get(id).join(", ") + ")" : "");
    sup.replaceChildren();
    const nadie = el("option", null, "— sin supervisor todavía —");
    nadie.value = "";
    sup.appendChild(nadie);
    const delGrupo = docentes.filter((p) => p.rol === "profesor");
    if (delGrupo.length) {
        const og = el("optgroup");
        og.label = "Del equipo de este grupo";
        delGrupo.forEach((p) => { const o = el("option", null, nombreDe(p) + (p.es_supervisor ? yaTiene(p.id) : " (se marca como supervisor)")); o.value = p.id; og.appendChild(o); });
        sup.appendChild(og);
    }
    const libres = supervisores.filter((s) => !delGrupo.some((p) => p.id === s.id));
    if (libres.length) {
        const og = el("optgroup");
        og.label = "Otros supervisores";
        libres.forEach((s) => { const o = el("option", null, nombreDe(s) + yaTiene(s.id)); o.value = s.id; og.appendChild(o); });
        sup.appendChild(og);
    }
    gActualizarBoton();
}

document.getElementById("g-grupo").addEventListener("change", async (e) => {
    const g = e.target.value;
    const det = document.getElementById("g-detalle");
    if (!g) { det.hidden = true; gGente = []; return; }
    const marca = ++gPeticion;
    const { data, error } = await sb.rpc("grupo_para_academia", { p_grupo: g });
    if (marca !== gPeticion) return;   // llegó tarde: ya se eligió otro grupo
    if (error) { avisar("No se pudo leer quién está en el grupo " + g + ": " + error.message, true); det.hidden = true; return; }
    gGente = data || [];
    const nombre = document.getElementById("g-nombre");
    if (!gNombreTocado) nombre.value = g;
    det.hidden = false;
    gPintar();
});
document.getElementById("g-nombre").addEventListener("input", () => { gNombreTocado = true; });
document.getElementById("g-alumnos").addEventListener("change", gActualizarBoton);
document.getElementById("g-supervisor").addEventListener("change", gActualizarBoton);

document.getElementById("form-grupo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombreIn = document.getElementById("g-nombre");
    const nombre = nombreIn.value.trim();
    if (nombre.length < 2) { avisar("Ponle un nombre a la academia.", true); nombreIn.focus(); return; }
    const ids = gSeleccion();
    if (!ids.length) { avisar("Marca al menos a una persona para que la academia no nazca vacía.", true); return; }
    const sup = document.getElementById("g-supervisor").value || null;
    const b = document.getElementById("g-crear");
    b.disabled = true;
    const { data, error } = await sb.rpc("academia_crear_desde_grupo", { p_nombre: nombre, p_supervisor: sup, p_personas: ids });
    b.disabled = false;
    if (error) { avisar(error.message, true); return; }
    // El supervisor pudo quedar recién marcado: se refleja acá para que los
    // selectores de la academia abierta lo ofrezcan.
    if (sup) {
        const p = perfiles.find((x) => x.id === sup);
        if (p && !p.es_supervisor) { p.es_supervisor = true; supervisores = perfiles.filter((x) => x.es_supervisor); }
    }
    document.getElementById("g-grupo").value = "";
    document.getElementById("g-detalle").hidden = true;
    gGente = []; gNombreTocado = false;
    await cargarAcademias();
    avisar("Academia «" + data.nombre + "» creada con " + data.miembros + (Number(data.miembros) === 1 ? " persona." : " personas."));
    await abrirAcademia(data.id);
});

// ── Una academia ────────────────────────────────────────────────────────

async function abrirAcademia(id) {
    abierta = academias.find((a) => a.id === id) || null;
    if (!abierta) return;
    borrarPendiente = false;
    document.getElementById("vista-lista").hidden = true;
    document.getElementById("vista-academia").hidden = false;
    document.getElementById("volver").hidden = !esAdmin;
    ponerTitulo(abierta.nombre);
    document.getElementById("intro").textContent = esAdmin
        ? "Su supervisor, su gente y qué puede hacer cada coordinador."
        : "Tu academia: sus datos de contacto, quién está y qué puede hacer cada coordinador.";
    pintarDatos();
    await cargarPersonas();
    pintarPersonas();
    document.getElementById("titulo").focus({ preventScroll: false });
}

function pintarDatos() {
    // Lo que no puede cambiar no se ofrece: nombre y supervisor son de quien administra.
    document.getElementById("c-nombre").hidden = !esAdmin;
    document.getElementById("c-supervisor").hidden = !esAdmin;
    document.getElementById("borrar").hidden = !esAdmin;
    document.getElementById("borrar").textContent = "Borrar la academia";
    document.getElementById("d-nombre").value = abierta.nombre;
    if (esAdmin) llenarSupervisores(document.getElementById("d-supervisor"), abierta.supervisor_id);
    document.getElementById("d-whatsapp").value = abierta.whatsapp || "";
    document.getElementById("d-correo").value = abierta.correo_respuestas || "";
    pintarMarca();
}

/* ── La marca ──────────────────────────────────────────────────────────────
   El logo se achica en el navegador y se sube al ENVIAR, no al elegirlo: uno
   descartado no queda subido por nada. El color pasa por la misma regla que la
   base (4.5 contra el blanco), dicha antes de guardar con el número. */
let logoNuevo = null;      // Blob ya achicado, o null
let quitarLogo = false;
let colorMarca = "";       // "" = sin color propio

function pintarMarca() {
    logoNuevo = null;
    quitarLogo = false;
    colorMarca = abierta.color || "";
    document.getElementById("m-logo").value = "";
    document.getElementById("m-color-texto").value = colorMarca;
    if (colorMarca) document.getElementById("m-color").value = colorMarca;
    pintarVistaMarca();
}

function logoVisible() {
    if (logoNuevo) return URL.createObjectURL(logoNuevo);
    if (quitarLogo || !abierta.logo_path) return "";
    return MarcaAcademia.urlDelLogo(abierta.logo_path);
}

function pintarVistaMarca() {
    const vista = document.getElementById("m-vista");
    const img = document.getElementById("m-vista-logo");
    const url = logoVisible();
    img.hidden = !url;
    if (url) img.src = url; else img.removeAttribute("src");
    document.getElementById("m-vista-pieza").hidden = !!url;
    document.getElementById("m-quitar-logo").hidden = !url;
    document.getElementById("m-vista-nombre").textContent = abierta.nombre;
    const nota = document.getElementById("m-contraste");
    const c = colorMarca ? MarcaAcademia.contrasteConBlanco(colorMarca) : null;
    if (!colorMarca) {
        vista.style.backgroundColor = "";
        nota.textContent = "Sin color propio: el encabezado queda con el azul de siempre.";
        nota.className = "text-xs mt-1 text-brand-450 dark:text-brand-350";
    } else if (c == null) {
        vista.style.backgroundColor = "";
        nota.textContent = "Escríbelo como #102a43: un numeral y seis cifras.";
        nota.className = "text-xs mt-1 text-red-700 dark:text-red-300";
    } else {
        vista.style.backgroundColor = colorMarca;
        const num = c.toFixed(1).replace(".", ",");
        if (c >= 4.5) {
            nota.textContent = "Contraste con el texto blanco: " + num + " a 1. Se lee bien.";
            nota.className = "text-xs mt-1 text-brand-450 dark:text-brand-350";
        } else {
            nota.textContent = "Contraste con el texto blanco: " + num + " a 1. Tiene que llegar a 4,5: elige un tono más oscuro.";
            nota.className = "text-xs mt-1 text-red-700 dark:text-red-300";
        }
    }
}

document.getElementById("m-color").addEventListener("input", (e) => {
    colorMarca = e.target.value.toLowerCase();
    document.getElementById("m-color-texto").value = colorMarca;
    pintarVistaMarca();
});
document.getElementById("m-color-texto").addEventListener("input", (e) => {
    let v = e.target.value.trim().toLowerCase();
    if (v && v[0] !== "#") v = "#" + v;
    colorMarca = v;
    if (/^#[0-9a-f]{6}$/.test(v)) document.getElementById("m-color").value = v;
    pintarVistaMarca();
});
document.getElementById("m-sin-color").addEventListener("click", () => {
    colorMarca = "";
    document.getElementById("m-color-texto").value = "";
    pintarVistaMarca();
});
document.getElementById("m-quitar-logo").addEventListener("click", () => {
    logoNuevo = null;
    quitarLogo = true;
    document.getElementById("m-logo").value = "";
    pintarVistaMarca();
});

/* Achica la imagen a 512 px del lado mayor y la saca en WebP (o PNG si el
   navegador no sabe), conservando la transparencia. */
function achicarLogo(archivo) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(archivo);
        img.onload = () => {
            const lado = Math.max(img.naturalWidth, img.naturalHeight) || 1;
            const k = Math.min(1, 512 / lado);
            const cv = document.createElement("canvas");
            cv.width = Math.max(1, Math.round(img.naturalWidth * k));
            cv.height = Math.max(1, Math.round(img.naturalHeight * k));
            cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
            URL.revokeObjectURL(url);
            cv.toBlob((b) => {
                if (b && b.type === "image/webp") return resolve(b);
                cv.toBlob((p) => p ? resolve(p) : reject(new Error("No se pudo leer la imagen.")), "image/png");
            }, "image/webp", 0.9);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Esa imagen no se pudo abrir.")); };
        img.src = url;
    });
}

document.getElementById("m-logo").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
        avisar("«" + f.name + "» no es PNG, JPG ni WebP: elige una imagen de esas.", true);
        e.target.value = ""; return;
    }
    try {
        const b = await achicarLogo(f);
        if (b.size > 512 * 1024) { avisar("Aun achicado, el logo pesa más de medio mega. Prueba con uno más simple.", true); e.target.value = ""; return; }
        logoNuevo = b;
        quitarLogo = false;
        pintarVistaMarca();
    } catch (err) {
        avisar(err.message, true);
        e.target.value = "";
    }
});

document.getElementById("form-marca").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (colorMarca) {
        const c = MarcaAcademia.contrasteConBlanco(colorMarca);
        if (c == null || c < 4.5) {
            avisar(c == null ? "Ese color no se entiende: escríbelo como #102a43." : "Ese color es muy claro: el nombre en blanco no se leería.", true);
            document.getElementById("m-color-texto").focus(); return;
        }
    }
    const viejo = abierta.logo_path || null;
    let ruta = quitarLogo ? null : viejo;
    if (logoNuevo) {
        const ext = logoNuevo.type === "image/webp" ? "webp" : "png";
        const azar = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 16);
        ruta = abierta.id + "/logo-" + azar + "." + ext;
        const { error: eSub } = await sb.storage.from(MarcaAcademia.BUCKET).upload(ruta, logoNuevo, { contentType: logoNuevo.type, upsert: false });
        if (eSub) { avisar("No se pudo subir el logo: " + eSub.message, true); return; }
    }
    const { data, error } = await sb.rpc("academia_guardar_marca", { p_id: abierta.id, p_color: colorMarca || null, p_logo_path: ruta });
    if (error) {
        // El logo recién subido no quedó en ninguna parte: se borra.
        if (logoNuevo && ruta) await sb.storage.from(MarcaAcademia.BUCKET).remove([ruta]);
        avisar(error.message, true); return;
    }
    // El de antes ya no lo usa nadie.
    if (viejo && viejo !== ruta) await sb.storage.from(MarcaAcademia.BUCKET).remove([viejo]);
    abierta = data;
    academias = academias.map((a) => a.id === abierta.id ? abierta : a);
    pintarMarca();
    avisar("Marca guardada. Su gente la ve la próxima vez que abra una página.");
});

async function cargarPersonas() {
    const { data, error } = await sb.rpc("academia_personas", { p_academia: abierta.id });
    if (error) { avisar("No se pudo leer quién está en la academia: " + error.message, true); personas = []; return; }
    personas = data || [];
}

function miembros() { return personas.filter((p) => p.miembro); }

/* Solo lo que se vería igual en pantalla y en la base: el supervisor mueve
   alumnos; lo demás lo reparte quien administra. */
function puedeQuitar(p) { return esAdmin || (p.rol === "alumno" && !p.es_coordinador); }

function pintarPersonas() {
    const ms = miembros();
    const cuenta = (r) => ms.filter((p) => rolDe(p) === r).length;
    document.getElementById("gente-resumen").textContent = ms.length
        ? cuenta("profesor") + " profesores, " + cuenta("coordinador") + " coordinadores y " + cuenta("alumno") + " alumnos."
        : "Todavía no hay nadie en esta academia.";
    pintarMiembros();
    pintarCoordinadores();
    pintarSumar();
}

function pintarMiembros() {
    const q = sinTildes(document.getElementById("buscar").value.trim());
    const cont = document.getElementById("miembros");
    cont.replaceChildren();
    const grupos = [["coordinador", "Coordinadores"], ["profesor", "Profesores"], ["alumno", "Alumnos"]];
    let alguno = false;
    grupos.forEach(([rol, titulo]) => {
        const lista = miembros().filter((p) => rolDe(p) === rol && coincide(p, q));
        if (!lista.length) return;
        alguno = true;
        const bloque = el("div");
        bloque.appendChild(el("h3", "text-sm font-semibold text-brand-600 dark:text-brand-300 mb-2", titulo + " (" + lista.length + ")"));
        const ul = el("ul", "divide-y divide-brand-100 dark:divide-brand-800");
        lista.slice(0, MOSTRAR).forEach((p) => {
            const li = el("li", "flex items-center justify-between gap-3 py-2");
            const t = el("div", "min-w-0");
            t.appendChild(el("p", "font-medium truncate", nombreDe(p)));
            t.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 truncate", [p.correo, p.grupo].filter(Boolean).join(" · ")));
            li.appendChild(t);
            if (puedeQuitar(p)) {
                const b = el("button", "shrink-0 text-sm font-semibold text-red-700 dark:text-red-300 hover:underline px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "✕ Quitar");
                b.type = "button";
                b.setAttribute("aria-label", "Quitar a " + nombreDe(p) + " de la academia");
                b.addEventListener("click", () => cambiarMiembros([], [p.id], "Quitaste a " + nombreDe(p) + "."));
                li.appendChild(b);
            }
            ul.appendChild(li);
        });
        bloque.appendChild(ul);
        if (lista.length > MOSTRAR) bloque.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-1", "Mostrando " + MOSTRAR + " de " + lista.length + ". Usa el buscador para llegar a los demás."));
        cont.appendChild(bloque);
    });
    if (!alguno && miembros().length) cont.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "Nadie coincide con esa búsqueda."));
}

function pintarCoordinadores() {
    const cont = document.getElementById("coordinadores");
    cont.replaceChildren();
    const coords = miembros().filter((p) => p.es_coordinador);
    if (!coords.length) {
        cont.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", "Esta academia no tiene coordinadores. Quien administra marca a alguien como coordinador y lo suma aquí."));
        return;
    }
    coords.forEach((c) => {
        const fs = el("fieldset", "border border-brand-100 dark:border-brand-800 rounded-xl p-4");
        fs.appendChild(el("legend", "px-1 font-semibold text-brand-900 dark:text-white", nombreDe(c)));
        const tiene = new Set(c.funciones || []);
        const grid = el("div", "grid sm:grid-cols-2 gap-2");
        FuncionesCoordinacion.LISTA.forEach((f) => {
            const id = "f-" + c.id + "-" + f.clave;
            const lab = el("label", "flex items-start gap-2 text-sm");
            lab.htmlFor = id;
            const cb = el("input", "mt-1 h-4 w-4");
            cb.type = "checkbox"; cb.id = id; cb.value = f.clave; cb.checked = tiene.has(f.clave);
            const tx = el("span");
            tx.appendChild(el("span", "font-medium", f.titulo));
            tx.appendChild(el("span", "block text-xs text-brand-450 dark:text-brand-350", f.detalle));
            lab.append(cb, tx);
            grid.appendChild(lab);
        });
        fs.appendChild(grid);
        const guardar = el("button", "mt-3 bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Guardar sus funciones");
        guardar.type = "button";
        guardar.addEventListener("click", async () => {
            const permitidas = [...grid.querySelectorAll("input:checked")].map((i) => i.value);
            const { data, error } = await sb.rpc("academia_set_funciones_coordinador", {
                p_academia: abierta.id, p_coordinador: c.id, p_permitidas: permitidas });
            if (error) { avisar(error.message, true); return; }
            c.funciones = data || permitidas;
            const quitadas = FuncionesCoordinacion.LISTA.length - c.funciones.length;
            avisar(nombreDe(c) + (quitadas ? " ya no puede hacer " + quitadas + (quitadas === 1 ? " función." : " funciones.") : " puede hacer todas las funciones de coordinación."));
        });
        fs.appendChild(guardar);
        cont.appendChild(fs);
    });
}

function candidatosDisponibles() {
    const dentro = new Set(miembros().map((p) => p.id));
    if (esAdmin) return perfiles.filter((p) => !dentro.has(p.id) && !p.is_admin);
    return personas.filter((p) => !p.miembro);   // los alumnos de sus profesores
}

function pintarSumar() {
    document.getElementById("sumar-texto").textContent = esAdmin
        ? "Cualquier cuenta de la plataforma. Un profesor o un alumno puede estar en varias academias."
        : "Los alumnos de los profesores de tu academia que todavía no están en ella. A los profesores y coordinadores los suma quien administra.";
    document.getElementById("sumar-grupo").hidden = !esAdmin;
    if (esAdmin) {
        const sel = document.getElementById("grupo");
        const grupos = [...new Set(perfiles.map((p) => (p.grupo || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
        sel.replaceChildren();
        grupos.forEach((g) => {
            const n = perfiles.filter((p) => (p.grupo || "").trim() === g && !p.is_admin).length;
            const o = el("option", null, g + " (" + n + ")");
            o.value = g;
            sel.appendChild(o);
        });
    }
    const todos = document.getElementById("sumar-todos");
    const disp = candidatosDisponibles();
    todos.hidden = esAdmin || disp.length === 0;
    todos.textContent = "Sumar a los " + disp.length + " alumnos de tus profesores";
    pintarCandidatos();
}

function pintarCandidatos() {
    const q = sinTildes(document.getElementById("buscar-sumar").value.trim());
    const lista = candidatosDisponibles().filter((p) => coincide(p, q));
    const ul = document.getElementById("candidatos");
    ul.replaceChildren();
    lista.slice(0, MOSTRAR).forEach((p) => {
        const li = el("li", "flex items-center justify-between gap-3 py-2");
        const t = el("div", "min-w-0");
        const rol = rolDe(p) === "coordinador" ? "coordina" : (p.rol || p.role) === "profesor" ? "profesor" : "alumno";
        t.appendChild(el("p", "font-medium truncate", nombreDe(p)));
        t.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 truncate", [rol, p.email || p.correo, p.grupo].filter(Boolean).join(" · ")));
        const b = el("button", "shrink-0 bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 font-semibold px-3 py-1.5 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "＋ Sumar");
        b.type = "button";
        b.setAttribute("aria-label", "Sumar a " + nombreDe(p) + " a la academia");
        b.addEventListener("click", () => cambiarMiembros([p.id], [], "Sumaste a " + nombreDe(p) + "."));
        li.append(t, b);
        ul.appendChild(li);
    });
    document.getElementById("candidatos-mas").textContent = !lista.length
        ? (q ? "Nadie coincide con esa búsqueda." : "No queda nadie por sumar.")
        : lista.length > MOSTRAR ? "Mostrando " + MOSTRAR + " de " + lista.length + ". Escribe para buscar." : "";
}

/* SE MANDA LA LISTA COMPLETA con el cambio encima. Mandar solo lo nuevo
   dejaría la academia con esa gente y nadie más. */
async function cambiarMiembros(sumar, quitar, mensaje) {
    const fuera = new Set(quitar);
    const ids = [...new Set([...miembros().map((p) => p.id), ...sumar])].filter((id) => !fuera.has(id));
    const { error } = await sb.rpc("academia_set_miembros", { p_academia: abierta.id, p_personas: ids });
    if (error) { avisar(error.message, true); return; }
    await cargarPersonas();
    pintarPersonas();
    avisar(mensaje);
}

document.getElementById("buscar").addEventListener("input", pintarMiembros);
document.getElementById("buscar-sumar").addEventListener("input", pintarCandidatos);
document.getElementById("sumar-todos").addEventListener("click", () => {
    const disp = candidatosDisponibles();
    cambiarMiembros(disp.map((p) => p.id), [], "Sumaste " + disp.length + (disp.length === 1 ? " alumno." : " alumnos."));
});
document.getElementById("sumar-grupo-btn").addEventListener("click", () => {
    const g = document.getElementById("grupo").value;
    const dentro = new Set(miembros().map((p) => p.id));
    const nuevos = perfiles.filter((p) => (p.grupo || "").trim() === g && !p.is_admin && !dentro.has(p.id));
    if (!nuevos.length) { avisar("Todo el grupo " + g + " ya está en la academia."); return; }
    cambiarMiembros(nuevos.map((p) => p.id), [], "Sumaste " + nuevos.length + " del grupo " + g + ".");
});
document.getElementById("volver").addEventListener("click", async () => {
    abierta = null;
    ponerTitulo("Academias");
    await cargarAcademias();
    await pintarLista();
    document.getElementById("titulo").focus();
});

document.getElementById("form-datos").addEventListener("submit", async (e) => {
    e.preventDefault();
    const wa = document.getElementById("d-whatsapp").value.trim();
    const correo = document.getElementById("d-correo").value.trim();
    const digitos = wa.replace(/\D/g, "");
    if (wa && (digitos.length < 8 || digitos.length > 15)) {
        avisar("El WhatsApp tiene que tener al menos 8 dígitos (con el código de país si no es de Costa Rica).", true);
        document.getElementById("d-whatsapp").focus(); return;
    }
    if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
        avisar("Ese correo no parece un correo: revisa que tenga @ y un dominio.", true);
        document.getElementById("d-correo").focus(); return;
    }
    let res;
    if (esAdmin) {
        const nombre = document.getElementById("d-nombre").value.trim();
        if (nombre.length < 2) { avisar("La academia necesita un nombre.", true); document.getElementById("d-nombre").focus(); return; }
        res = await sb.rpc("academia_guardar", { p_id: abierta.id, p_nombre: nombre,
            p_supervisor: document.getElementById("d-supervisor").value || null, p_whatsapp: wa || null, p_correo: correo || null });
    } else {
        res = await sb.rpc("academia_guardar_contacto", { p_id: abierta.id, p_whatsapp: wa || null, p_correo: correo || null });
    }
    if (res.error) { avisar(res.error.message, true); return; }
    abierta = res.data;
    academias = academias.map((a) => a.id === abierta.id ? abierta : a);
    ponerTitulo(abierta.nombre);
    pintarDatos();
    avisar("Datos guardados.");
});

/* Borrar pide dos toques en el propio botón, con lo que va a pasar escrito. */
document.getElementById("borrar").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (!borrarPendiente) {
        borrarPendiente = true;
        b.textContent = "Sí, borrar «" + abierta.nombre + "»: su gente sale de la academia (las cuentas no se borran)";
        return;
    }
    const { error } = await sb.rpc("academia_borrar", { p_id: abierta.id });
    if (error) { avisar(error.message, true); return; }
    const nombre = abierta.nombre;
    abierta = null;
    await cargarAcademias();
    ponerTitulo("Academias");
    await pintarLista();
    avisar("Academia «" + nombre + "» borrada.");
    document.getElementById("titulo").focus();
});

async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { location.href = "login.html?next=academias.html"; return; }
    const { data: p } = await sb.from("profiles").select("is_admin, es_supervisor").eq("id", session.user.id).maybeSingle();
    perfil = p;
    document.getElementById("loading").classList.add("hidden");
    esAdmin = !!(perfil && perfil.is_admin);
    if (!perfil || !(esAdmin || perfil.es_supervisor)) {
        document.getElementById("denegado").classList.remove("hidden");
        return;
    }
    if (!(await cargarAcademias())) { document.getElementById("app").classList.remove("hidden"); return; }

    if (esAdmin) {
        try {
            perfiles = await traerTodo(() => sb.from("profiles")
                .select("id, full_name, email, role, grupo, is_admin, es_coordinador, es_supervisor").order("full_name"));
        } catch (err) {
            avisar("No se pudieron cargar las cuentas: " + (err.message || err), true);
        }
        supervisores = perfiles.filter((x) => x.es_supervisor);
        document.getElementById("app").classList.remove("hidden");
        await pintarLista();
        return;
    }

    /* Quien supervisa: su academia, directo. Con varias, la que tiene
       abierta (la «academia activa», la misma que acota todo lo demás); se
       cambia en la franja de arriba (js/marca-academia.js). */
    const { data: suyas } = await sb.rpc("mis_academias_supervisadas");
    const activa = (suyas || []).find((a) => a.activa);
    const suya = (activa && academias.find((a) => a.id === activa.id))
        || academias.find((a) => a.supervisor_id === session.user.id);
    document.getElementById("app").classList.remove("hidden");
    if (!suya) {
        document.getElementById("intro").textContent = "Todavía no tienes una academia a tu cargo. La crea y te la asigna quien administra.";
        return;
    }
    await abrirAcademia(suya.id);
}

init();
    