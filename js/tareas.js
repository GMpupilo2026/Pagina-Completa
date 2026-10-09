/* El código de tareas.html.

   Vivía escrito dentro de la página, en un <script> de 28 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Área de Tareas: el profesor arma una tarea con VARIOS renglones —"10
 * ejercicios de ataque doble", "20 de 4x4", "10 minutos de coordenadas"— y se
 * la manda a uno o varios de sus alumnos con una fecha límite. El alumno la ve
 * en un solo lugar, con una barra por renglón y el enlace que lo deja DENTRO
 * del ejercicio, sin tener que buscarlo por la plataforma.
 *
 * Lo que hace que esto funcione, y que no se ve desde acá:
 *
 *  - El avance NO lo lleva esta página ni una columna: lo cuenta
 *    public.tareas_con_avance() a partir de lo que el alumno ya venía dejando
 *    al entrenar (training_progress y platform_activity_log). Así resolver un
 *    ejercicio llena la tarea Y lo marca como resuelto para no repetirlo —son
 *    el mismo acto, no dos contadores que se puedan contradecir.
 *  - Mandar la tarea es UNA llamada (crear_tarea), no un insert del encabezado
 *    y otro de los renglones: partido en dos, si la segunda mitad falla queda
 *    una tarea vacía en la lista del alumno y nadie se entera.
 *  - Quién ve y quién puede mandarle tarea a quién lo hace cumplir la RLS
 *    (soy_profesor_de), no esta página. El aviso push sale de un trigger.
 */
let session = null, profile = null, puedeAsignar = false;
let alumnosDisponibles = [];
let cursosCatalogo = [];

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatoFecha(iso) {
    return new Date(iso).toLocaleString("es-CR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });
}

/* Cómo se lee un renglón: vive en js/material-plataforma.js
   (MaterialPlataforma.frase), porque también la usa la página de un proyecto
   (proyecto.html) para mostrar las tareas semanales antes de mandarlas. */
const fraseDe = (r) => MaterialPlataforma.frase(r);

async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { window.location.href = "login.html?next=tareas.html"; return; }

    const { data: p } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
    profile = p;
    puedeAsignar = !!profile && (profile.role === "profesor" || profile.is_admin);

    document.getElementById("subtitulo").textContent = puedeAsignar
        ? "Arma la tarea con lo que quieras que hagan y mándala. Se va llenando sola con lo que entrenen."
        : "Lo que tu profe te pidió hacer. Cada cosa se marca sola cuando la haces.";

    if (puedeAsignar) {
        document.getElementById("vista-profesor").classList.remove("hidden");
        await cargarAlumnos();
        cursosCatalogo = await MaterialPlataforma.cursos();
        document.getElementById("agregar-renglon").addEventListener("click", () => agregarRenglon());
        await agregarRenglon();
        document.getElementById("form-tarea").addEventListener("submit", enviarTarea);
        await desdeLaBitacora();
        await desdeLaClase();
        await desdeElInforme();
        await cargarEnviadas();
    } else {
        document.getElementById("vista-alumno").classList.remove("hidden");
        await cargarMisTareas();
    }

    document.getElementById("loading").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    tituloAlAbrir();
}

/* Con la cuenta ciega, al abrir Tareas el foco quedaba en el <body>: el lector
   no decía nada. Se lleva al título (tabindex=-1: no suma una parada de Tab),
   salvo que algo ya lo tenga. La marca de la cuenta llega de la base después
   de cargar: si todavía no está, se espera a `vision:cambio`
   (js/vision-cuenta.js). */
function tituloAlAbrir() {
    const h1 = document.querySelector("#app h1");
    const intentar = () => {
        if (!document.documentElement.classList.contains("modo-ciego") || !h1) return false;
        const a = document.activeElement;
        if (a && a !== document.body && a.id !== "main-content") return true;
        h1.setAttribute("tabindex", "-1");
        h1.focus();
        return true;
    };
    if (!intentar()) document.addEventListener("vision:cambio", intentar, { once: true });
}

// PostgREST corta la respuesta a partir de cierta cantidad de filas sin dar
// ningún error: lo que puede pasar de mil se pide de mil en mil.
async function traerTodo(consulta) {
    const PASO = 1000; let desde = 0, todo = [];
    for (;;) {
        const { data, error } = await consulta().range(desde, desde + PASO - 1);
        if (error) return { data: todo, error };
        todo = todo.concat(data || []);
        if (!data || data.length < PASO) return { data: todo, error: null };
        desde += PASO;
    }
}
// ---------- Vista profesor: los alumnos ----------
async function cargarAlumnos() {
    const { data } = await traerTodo(() => sb.from("profiles").select("id, full_name, email").eq("role", "alumno").order("full_name").order("id"));
    alumnosDisponibles = data || [];
    const cont = document.getElementById("lista-alumnos");
    cont.innerHTML = "";
    document.getElementById("sin-alumnos").classList.toggle("hidden", !!alumnosDisponibles.length);
    alumnosDisponibles.forEach((a) => {
        const label = document.createElement("label");
        label.className = "flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-white dark:hover:bg-brand-900 cursor-pointer";
        label.innerHTML = `<input type="checkbox" value="${a.id}" class="rounded border-brand-300 text-accent-500 focus:ring-accent-400 alumno-check"><span>${escapeHtml(a.full_name || a.email)}</span>`;
        cont.appendChild(label);
    });
    // El selector de subgrupos se monta una sola vez, encima de la lista: es la
    // misma pieza que usa Exámenes, para que elegir "los del martes" se haga
    // igual en las dos pantallas donde se manda algo.
    if (window.SubgruposMarcar) SubgruposMarcar.montar({ sb, antesDe: cont, casillas: ".alumno-check" });
}

/* ---------- Venir desde una nota de la bitácora ----------

   "Convertir en tarea" (informes.html y la clase en vivo) manda acá con el
   alumno y el id de la nota. Se marca ese alumno y la nota queda puesta como
   nota para él, que es lo que el profesor ya escribió — no hay que volver a
   teclearla.

   El TEXTO no viaja en la dirección: se lee de la base, que ya se la deja leer
   a quien la escribió. Una dirección con lo que el profesor anotó de un alumno
   queda en el historial del navegador, y esa nota puede ser privada.

   Si la nota ya no está (la borró), se marca igual el alumno y no se dice
   nada: el profesor venía a ponerle una tarea, no a leer la nota.

   El TÍTULO no se toca: lo propone la página desde el renglón elegido, y
   pisarlo con la etiqueta de la nota dejaría al profesor corrigiendo a mano un
   campo que antes salía bien. */
async function desdeLaBitacora() {
    const params = new URLSearchParams(location.search);
    const alumnoId = params.get("alumno");
    if (!alumnoId) return;

    const check = document.querySelector('.alumno-check[value="' + CSS.escape(alumnoId) + '"]');
    if (check) {
        check.checked = true;
        check.closest("label").scrollIntoView({ block: "nearest" });
    }

    const notaId = params.get("nota");
    if (!notaId) return;
    const { data } = await sb.from("notas_alumno").select("texto, etiqueta").eq("id", notaId).maybeSingle();
    if (!data) return;
    const campo = document.getElementById("t-instrucciones");
    if (!campo.value) campo.value = data.texto;
}

/* Desde el cierre de la clase en vivo: `?clase=<id>` marca a los que
   asistieron y propone el título. Viaja solo el id de la clase, como con la
   bitácora: quiénes fueron lo lee la base (class_attendance), que ya se lo deja
   leer a quien dio la clase. Un alumno que ya no es suyo no tiene casilla, y
   se queda sin marcar sin decir nada. */
async function desdeLaClase() {
    const claseId = new URLSearchParams(location.search).get("clase");
    if (!claseId) return;
    const [{ data: asistencia }, { data: clase }] = await Promise.all([
        sb.from("class_attendance").select("student_id").eq("session_id", claseId),
        sb.from("class_sessions").select("title, started_at").eq("id", claseId).maybeSingle(),
    ]);
    let primera = null;
    (asistencia || []).forEach((a) => {
        const check = document.querySelector('.alumno-check[value="' + CSS.escape(a.student_id) + '"]');
        if (!check) return;
        check.checked = true;
        if (!primera) primera = check;
    });
    if (primera) primera.closest("label").scrollIntoView({ block: "nearest" });
    /* El de la clase le gana al que se propone del primer renglón, y queda
       como elegido: cambiar los renglones no lo pisa (es lo que habría
       escrito el profe a mano). */
    const titulo = document.getElementById("t-titulo");
    if (titulo && !tituloTocado) {
        tituloTocado = true;
        const fecha = clase && clase.started_at
            ? new Date(clase.started_at).toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" }) : "";
        titulo.value = "Repaso de la clase" + (clase && clase.title ? ": " + clase.title : fecha ? " del " + fecha : "");
    }
}

/* Desde Informes («Mandarle 10 de La balanza», en la tarjeta del tipo más
   flojo): `?alumno=<id>&material=tipos&recorte=balanza&cantidad=10` deja el
   primer renglón armado; al alumno lo marca desdeLaBitacora. Lo que viaja en
   la dirección no es nada privado: el nombre de una herramienta, de un recorte
   y un número. Solo se toma lo que el renglón ofrece: un material o un
   recorte que no existe se ignora sin decir nada, y la cantidad respeta el
   tope del recorte (no se piden 300 de un tipo que tiene 80). */
async function desdeElInforme() {
    const params = new URLSearchParams(location.search);
    const slug = params.get("material");
    const div = document.querySelector("#renglones .renglon");
    if (!slug || !div) return;
    const hay = (sel, v) => [...sel.options].some((o) => o.value === v);
    const selMat = div.querySelector(".r-material");
    if (!hay(selMat, "herramienta:" + slug)) return;
    selMat.value = "herramienta:" + slug;
    await refrescarRenglon(div, true);
    const recorte = params.get("recorte");
    const selRec = div.querySelector(".r-recorte");
    if (recorte && hay(selRec, recorte)) selRec.value = recorte;
    const selMeta = div.querySelector(".r-meta");
    if (hay(selMeta, "cantidad")) selMeta.value = "cantidad";
    const n = parseInt(params.get("cantidad"), 10);
    if (n > 0 && selMeta.value === "cantidad") div.querySelector(".r-cantidad").value = String(n);
    await refrescarRenglon(div);
}

// ---------- Vista profesor: los renglones ----------
function agregarRenglon() {
    const tpl = document.getElementById("tpl-renglon");
    const div = tpl.content.firstElementChild.cloneNode(true);

    const selMat = div.querySelector(".r-material");
    // Dos grupos, para no mezclar "Mates" con "Fundamentos del Ajedrez".
    const gH = document.createElement("optgroup"); gH.label = "Entrenamiento";
    MaterialPlataforma.HERRAMIENTAS.filter((h) => !h.noSeElige).forEach((h) => {
        const o = document.createElement("option");
        o.value = "herramienta:" + h.slug; o.textContent = h.label;
        gH.appendChild(o);
    });
    const gC = document.createElement("optgroup"); gC.label = "Cursos";
    cursosCatalogo.forEach((c) => {
        const o = document.createElement("option");
        o.value = "curso:" + c.slug; o.textContent = c.label;
        gC.appendChild(o);
    });
    selMat.appendChild(gH);
    if (cursosCatalogo.length) selMat.appendChild(gC);

    selMat.addEventListener("change", () => refrescarRenglon(div, true));
    div.querySelector(".r-recorte").addEventListener("change", () => refrescarRenglon(div));
    div.querySelector(".r-meta").addEventListener("change", () => refrescarRenglon(div));
    div.querySelector(".r-cantidad").addEventListener("input", () => pintarFrase(div));
    // Al salir del campo, lo que pasa del tope se baja al tope: no se puede
    // pedir más de lo que hay en la plataforma.
    div.querySelector(".r-cantidad").addEventListener("change", (ev) => {
        const tope = parseInt(ev.target.max, 10);
        if (tope > 0 && parseInt(ev.target.value, 10) > tope) {
            ev.target.value = String(tope);
            pintarFrase(div);
        }
    });
    div.querySelector(".r-leccion").addEventListener("input", () => pintarFrase(div));
    div.querySelector(".r-quitar").addEventListener("click", () => {
        div.remove();
        actualizarQuitar();
        proponerTitulo();
    });

    document.getElementById("renglones").appendChild(div);
    const listo = refrescarRenglon(div, true);
    actualizarQuitar();
    return listo;
}

/* Con un solo renglón no se ofrece quitarlo: una tarea sin nada que hacer no
   se puede mandar, así que el botón solo llevaría a un aviso de error. */
function actualizarQuitar() {
    const todos = [...document.querySelectorAll("#renglones .renglon")];
    todos.forEach((d) => d.querySelector(".r-quitar").classList.toggle("invisible", todos.length === 1));
}

function materialDe(div) {
    const [tipo, slug] = (div.querySelector(".r-material").value || "").split(":");
    if (tipo === "curso") {
        const c = cursosCatalogo.find((x) => x.slug === slug);
        return c ? { tipo, item: c, herramienta: null } : null;
    }
    const h = MaterialPlataforma.herramienta(slug);
    return h ? { tipo: "herramienta", item: h, herramienta: h } : null;
}

async function refrescarRenglon(div, cambioMaterial) {
    const m = materialDe(div);
    if (!m) return;
    const h = m.herramienta;

    // Los recortes: los 80 temas, las 3 categorías de Mates, las 40 líneas…
    const recWrap = div.querySelector(".r-recorte-wrap");
    const recSel = div.querySelector(".r-recorte");
    if (cambioMaterial) {
        const recortes = h ? await MaterialPlataforma.recortesDe(h.slug) : [];
        recSel.innerHTML = "";
        if (recortes.length) {
            // Un cuestionario hay que elegirlo: «— todo —» no es nada que contestar.
            if (!(h && h.recorteObligatorio)) {
                const todo = document.createElement("option");
                todo.value = ""; todo.textContent = "— todo —";
                /* «Todo» también tiene tope: lo que suman los recortes.
                   Sin él se podían pedir 50 series de Practicar, que tiene
                   9. Si algún recorte no tiene banco (los errores propios de
                   cada alumno), no hay suma que valga y queda sin tope. */
                const sinBanco = recortes.some((r) => !(r.total > 0));
                todo.dataset.total = sinBanco ? "0" : String(recortes.reduce((n, r) => n + r.total, 0));
                recSel.appendChild(todo);
            }
            // Agrupados como vienen en su página, que es como el profesor los
            // tiene en la cabeza ("Táctica de ataque", "Aperturas").
            const grupos = new Map();
            recortes.forEach((r) => {
                const g = r.grupo || "";
                if (!grupos.has(g)) grupos.set(g, []);
                grupos.get(g).push(r);
            });
            grupos.forEach((lista, nombre) => {
                const cont = nombre ? document.createElement("optgroup") : recSel;
                if (nombre) { cont.label = nombre; recSel.appendChild(cont); }
                lista.forEach((r) => {
                    const o = document.createElement("option");
                    o.value = r.clave;
                    o.textContent = r.detalle ? `${r.label} (${r.detalle})` : r.total > 1 ? `${r.label} (${r.total})` : r.label;
                    o.dataset.total = String(r.total || 0);
                    o.dataset.label = r.label;
                    o.dataset.actividades = JSON.stringify(r.actividades || []);
                    cont.appendChild(o);
                });
            });
        }
        recWrap.classList.toggle("hidden", !recortes.length);
        /* Sin ningún cuestionario a la vista no hay qué elegir: se dice dónde
           se arman, en vez de un renglón que no se puede mandar. */
        const sinRecortes = div.querySelector(".r-sin-recortes");
        if (sinRecortes) sinRecortes.classList.toggle("hidden", !(h && h.recorteObligatorio && !recortes.length));
        div.querySelector(".r-recorte-label").textContent = (h && h.recorteLabel) || "Tema";

        // Qué se le puede pedir a esto. Una herramienta que no escribe en
        // training_progress no ofrece "cantidad": sería una barra clavada en
        // cero para siempre.
        const metaSel = div.querySelector(".r-meta");
        const metas = (m.item.metas && m.item.metas.length) ? m.item.metas : ["completar"];
        metaSel.innerHTML = metas.map((k) => `<option value="${k}">${escapeHtml(MaterialPlataforma.META_LABEL[k] || k)}</option>`).join("");
    }

    const meta = div.querySelector(".r-meta").value;
    const cantWrap = div.querySelector(".r-cantidad-wrap");
    const cant = div.querySelector(".r-cantidad");
    cantWrap.classList.toggle("hidden", meta === "completar" || !!(h && h.unaVez));
    /* Lo que se pide una sola vez (el diagnóstico) no tiene cantidad que
       elegir: va fija en 1. Al cambiar de material se devuelve el 10 de
       siempre, o el renglón siguiente nacería pidiendo un ejercicio. */
    if (h && h.unaVez) {
        cant.value = "1";
        cant.dataset.fija = "1";
    } else if (cant.dataset.fija) {
        cant.value = "10";
        delete cant.dataset.fija;
    }

    // El tope es de verdad: no se pueden pedir 300 ejercicios de un tema que
    // tiene 53. Pedir más de los que hay dejaría la tarea imposible de
    // terminar, y eso no daría ningún error — la barra se quedaría a un paso.
    const opc = div.querySelector(".r-recorte").selectedOptions[0];
    const total = opc && opc.dataset.total ? parseInt(opc.dataset.total, 10) : 0;
    if (h && h.unaVez) {
        cant.max = "1";
    } else if (meta === "cantidad" && total > 0) {
        cant.max = String(total);
        if (parseInt(cant.value, 10) > total) cant.value = String(total);
    } else {
        cant.max = meta === "minutos" ? "600" : "1000";
    }

    // La lección, solo en los cursos.
    const lecWrap = div.querySelector(".r-leccion-wrap");
    const esCursoConLecciones = m.tipo === "curso" && m.item.lecciones;
    lecWrap.classList.toggle("hidden", !esCursoConLecciones);
    if (esCursoConLecciones) div.querySelector(".r-leccion").max = String(m.item.lecciones);
    else div.querySelector(".r-leccion").value = "";

    pintarFrase(div);
    proponerTitulo();
}

/* Lo que el renglón va a decirle al alumno, escrito debajo mientras se arma:
   lo que se ve antes de mandar es exactamente lo que se manda. */
function pintarFrase(div) {
    const r = leerRenglon(div);
    div.querySelector(".r-frase").textContent = r ? fraseDe(r) : "";
}

function leerRenglon(div) {
    const m = materialDe(div);
    if (!m) return null;
    const h = m.herramienta;
    const opc = div.querySelector(".r-recorte").selectedOptions[0];
    const clave = div.querySelector(".r-recorte-wrap").classList.contains("hidden") ? "" : div.querySelector(".r-recorte").value;
    const recorte = clave && opc ? {
        clave,
        label: opc.dataset.label || opc.textContent,
        actividades: JSON.parse(opc.dataset.actividades || "[]"),
    } : null;

    const meta = div.querySelector(".r-meta").value;
    const leccionVal = div.querySelector(".r-leccion-wrap").classList.contains("hidden")
        ? "" : div.querySelector(".r-leccion").value;
    const cantidad = meta === "completar" ? null : parseInt(div.querySelector(".r-cantidad").value, 10);

    // El enlace lleva al recorte cuando la página sabe abrirlo directo.
    const href = (recorte && h && h.hrefRecorte) ? h.hrefRecorte(recorte.clave) : m.item.href;

    return {
        material_tipo: m.tipo,
        material_slug: m.item.slug,
        material_label: m.item.label,
        material_href: href,
        filtro_clave: recorte ? recorte.clave : "",
        filtro_label: recorte ? recorte.label : "",
        leccion: leccionVal || "",
        actividades: meta === "completar" ? [] : MaterialPlataforma.actividadesDe(h, recorte),
        meta_tipo: meta,
        meta_cantidad: cantidad,
    };
}

/* El título se propone del primer renglón —"Ejercicios por tema · Ataque a la
   última línea"— y se puede cambiar. Escribirlo a mano cada vez, teniendo los
   renglones ya puestos, es pedir dos veces lo mismo. */
let tituloTocado = false;
document.addEventListener("input", (ev) => {
    if (ev.target && ev.target.id === "t-titulo") tituloTocado = true;
});
function proponerTitulo() {
    if (tituloTocado) return;
    const primero = document.querySelector("#renglones .renglon");
    if (!primero) return;
    const r = leerRenglon(primero);
    if (!r) return;
    const cuantos = document.querySelectorAll("#renglones .renglon").length;
    const base = r.filtro_label || r.material_label;
    document.getElementById("t-titulo").value = cuantos > 1 ? `${base} y ${cuantos - 1} cosa${cuantos > 2 ? "s" : ""} más` : base;
}

async function enviarTarea(ev) {
    ev.preventDefault();
    const status = document.getElementById("form-status");
    const seleccionados = [...document.querySelectorAll(".alumno-check:checked")].map((c) => c.value);
    if (!seleccionados.length) { status.textContent = "Elige al menos un alumno."; return; }

    const divs = [...document.querySelectorAll("#renglones .renglon")];
    const items = [];
    for (const d of divs) {
        const r = leerRenglon(d);
        if (!r) { status.textContent = "Hay un renglón sin material."; return; }
        const hr = MaterialPlataforma.herramienta(r.material_slug);
        if (hr && hr.recorteObligatorio && !r.filtro_clave) {
            status.textContent = `Elige qué ${String(hr.recorteLabel || "recorte").toLowerCase()} mandar.`;
            return;
        }
        if (r.meta_tipo !== "completar" && !(r.meta_cantidad > 0)) {
            status.textContent = `Ponle una cantidad a «${r.filtro_label || r.material_label}».`;
            return;
        }
        /* El tope del campo (refrescarRenglon) no basta: un número escrito a
           mano pasa por encima del `max` si el navegador no valida. Pedir más
           de lo que hay deja la tarea imposible de terminar. */
        const tope = parseInt(d.querySelector(".r-cantidad").max, 10);
        if (r.meta_tipo === "cantidad" && tope > 0 && r.meta_cantidad > tope) {
            status.textContent = `«${r.filtro_label || r.material_label}» solo tiene ${tope} en la plataforma: no se pueden pedir ${r.meta_cantidad}.`;
            d.querySelector(".r-cantidad").focus();
            return;
        }
        items.push(r);
    }
    if (!items.length) { status.textContent = "Agrega al menos una cosa que hacer."; return; }

    const venceVal = document.getElementById("t-vence").value;
    if (!venceVal) { status.textContent = "Ponle una fecha límite."; return; }

    // "Disponible desde" es opcional: en blanco, la tarea aparece de una vez,
    // igual que siempre. Con fecha, es lo que deja al profesor prepararla con
    // anticipación sin que el alumno la vea todavía — el candado de verdad lo
    // pone la RLS (crear_tarea lo vuelve a comprobar del lado del servidor).
    const desdeVal = document.getElementById("t-desde").value;
    if (desdeVal && HoraCR.desdeCampo(desdeVal) >= HoraCR.desdeCampo(venceVal)) {
        status.textContent = "La tarea tiene que empezar antes de vencer.";
        return;
    }

    const titulo = document.getElementById("t-titulo").value.trim();
    if (!titulo) { status.textContent = "Falta el título."; return; }

    const boton = document.getElementById("enviar-btn");
    boton.disabled = true;
    status.textContent = "Enviando…";
    const { data, error } = await sb.rpc("crear_tarea", {
        p_alumnos: seleccionados,
        p_titulo: titulo,
        p_instrucciones: document.getElementById("t-instrucciones").value.trim(),
        p_vence: HoraCR.desdeCampo(venceVal).toISOString(),   // lo escrito es hora de Costa Rica
        p_items: items,
        p_disponible_desde: desdeVal ? HoraCR.desdeCampo(desdeVal).toISOString() : null,
    });
    boton.disabled = false;
    if (error) { status.textContent = "No se pudo enviar: " + error.message; return; }

    const n = typeof data === "number" ? data : seleccionados.length;
    status.textContent = `Tarea enviada a ${n} ${n === 1 ? "alumno" : "alumnos"}.`;
    document.getElementById("form-tarea").reset();
    document.querySelectorAll(".alumno-check").forEach((c) => { c.checked = false; });
    document.getElementById("renglones").innerHTML = "";
    tituloTocado = false;
    agregarRenglon();
    await cargarEnviadas();
}

// ---------- Vista profesor: lo que ya mandó ----------
async function cargarEnviadas() {
    const { data, error } = await sb.rpc("tareas_con_avance", { p_profesor: session.user.id });
    const lista = document.getElementById("enviadas-lista");
    lista.innerHTML = "";
    const filas = data || [];
    const vacia = document.getElementById("enviadas-vacia");
    vacia.classList.toggle("hidden", !!filas.length);
    if (error) { vacia.textContent = "No se pudieron cargar: " + error.message; vacia.classList.remove("hidden"); return; }
    filas.forEach((t) => lista.appendChild(tarjetaEnviada(t)));
}

const COLOR_SITUACION = {
    completada: "text-green-600 dark:text-green-400",
    vencida: "text-red-600 dark:text-red-400",
    pendiente: "text-brand-500 dark:text-brand-300",
    programada: "text-accent-700 dark:text-accent-400",
};
const TEXTO_SITUACION = {
    completada: "✔ Completada", vencida: "⏰ Vencida", pendiente: "Pendiente",
    programada: "🕒 Programada",
};

function tarjetaEnviada(t) {
    const div = document.createElement("div");
    div.className = "bg-white dark:bg-brand-900 rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3";
    const items = t.items || [];
    // Qué lleva hecho, renglón por renglón: es lo que el profesor viene a ver.
    const resumen = items.map((r) => {
        /* El diagnóstico no es «1/1»: lo que el profe viene a saber es si ya
           lo rindió, y si sí, cuál le salió. `cumplido` sale de la base, que
           solo cuenta el rendido DESPUÉS de asignarlo, así que «ya lo hizo»
           quiere decir uno nuevo. El enlace abre Informes en el diagnóstico
           de ESE alumno. */
        if (r.material_slug === "diagnostico") {
            if (!r.cumplido) return `<span>🧭 ${t.situacion === "programada" ? "Diagnóstico de nivel" : "Todavía no hace el diagnóstico"}</span>`;
            const resultado = "informes.html?tema=diagnostico&alumno=" + encodeURIComponent(t.alumno_id || "");
            return `<span class="text-green-600 dark:text-green-400">✔ Ya hizo el diagnóstico</span>`
                + ` <a href="${escapeHtml(resultado)}" class="font-semibold text-accent-700 dark:text-accent-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded">Ver su resultado →</a>`;
        }
        /* El cuestionario tampoco: el profe viene a ver cuánto sacó. Vale el
           primer intento (después ya vio las correctas); el mejor y cuántas
           veces lo hizo van al lado. Los números los calcula la base. */
        if (r.material_slug === "cuestionario") {
            const nombre = `«${escapeHtml(r.filtro_label || "Cuestionario")}»`;
            const c = r.cuestionario;
            if (!c) return `<span>🎯 ${t.situacion === "programada" ? "Cuestionario " + nombre : "Todavía no contesta " + nombre}</span>`;
            const extra = c.intentos > 1 ? ` (lo hizo ${c.intentos} veces; la mejor, ${c.mejor} de ${c.total})` : "";
            return `<span class="text-green-600 dark:text-green-400">✔ ${nombre}: ${c.primero} de ${c.total} la primera vez${extra}</span>`;
        }
        const meta = r.meta_tipo === "completar" ? 1 : r.meta_cantidad;
        return `<span class="${r.cumplido ? "text-green-600 dark:text-green-400" : ""}">${r.cumplido ? "✔" : ""} ${escapeHtml(r.filtro_label || r.material_label)} ${r.hecho}/${meta}</span>`;
    }).join(" · ");
    // Mientras esté programada, la línea de fechas dice CUÁNDO se destapa, no
    // cuánto lleva de renglones cumplidos: el alumno todavía no la ve, así
    // que "0 de 3" se leería como que no ha empezado a hacerla, y no es eso.
    const lineaFecha = t.situacion === "programada"
        ? `Para ${escapeHtml(t.alumno_nombre || "—")} · Se destapa ${formatoFecha(t.disponible_desde)} · Vence ${formatoFecha(t.vence_at)}`
        : `Para ${escapeHtml(t.alumno_nombre || "—")} · Vence ${formatoFecha(t.vence_at)}`;
    div.innerHTML = `
        <div class="min-w-0">
            <p class="font-semibold text-brand-800 dark:text-white text-sm">${escapeHtml(t.titulo)}</p>
            <p class="text-xs text-brand-450 dark:text-brand-350">${lineaFecha}</p>
            <p class="text-xs text-brand-450 dark:text-brand-350 mt-0.5">${resumen}</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
            <span class="text-xs font-semibold ${COLOR_SITUACION[t.situacion]}">${TEXTO_SITUACION[t.situacion]} ${t.cumplidos}/${t.renglones}</span>
            <button type="button" class="text-xs text-red-600 dark:text-red-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded eliminar-btn">Eliminar</button>
        </div>`;
    div.querySelector(".eliminar-btn").addEventListener("click", () => eliminarTarea(t.id));
    return div;
}

async function eliminarTarea(id) {
    if (!(await Avisos.confirmar("Desaparece también de la lista de cada alumno que la tenía.", { titulo: "¿Eliminar esta tarea?", aceptar: "Eliminar", peligro: true }))) return;
    const { error } = await sb.from("tareas").delete().eq("id", id);
    if (error) { Avisos.avisar("No se pudo eliminar: " + error.message, { tipo: "error" }); return; }
    await cargarEnviadas();
}

// ---------- Vista alumno ----------
async function cargarMisTareas() {
    const { data, error } = await sb.rpc("tareas_con_avance", { p_alumno: session.user.id });
    const filas = data || [];
    const pendientes = filas.filter((t) => t.situacion !== "completada");
    const completadas = filas.filter((t) => t.situacion === "completada");

    const pl = document.getElementById("pendientes-lista");
    pl.innerHTML = "";
    const pv = document.getElementById("pendientes-vacia");
    pv.classList.toggle("hidden", !!pendientes.length);
    pendientes.forEach((t) => pl.appendChild(tarjetaAlumno(t)));

    const cl = document.getElementById("completadas-lista");
    cl.innerHTML = "";
    document.getElementById("completadas-vacia").classList.toggle("hidden", !!completadas.length);
    completadas.forEach((t) => cl.appendChild(tarjetaAlumno(t)));

    if (error) { pv.textContent = "No se pudieron cargar tus tareas: " + error.message; pv.classList.remove("hidden"); }
}

/* Un renglón del alumno: lo que hay que hacer, cuánto lleva, y el enlace que
   lo deja DENTRO del ejercicio. El enlace lleva de qué tarea viene, así que la
   propia página de entreno puede decirle cuánto le falta (ver
   js/tarea-en-curso.js). */
function renglonAlumno(r, tareaId, tareaTitulo) {
    const li = document.createElement("li");
    const meta = r.meta_tipo === "completar" ? 1 : r.meta_cantidad;
    /* Un cuestionario contestado dos veces no es «2/1»: se pidió una. */
    if (r.material_slug === "cuestionario") r = Object.assign({}, r, { hecho: Math.min(Number(r.hecho) || 0, meta) });
    const pct = Math.min(100, Math.round((100 * r.hecho) / (meta || 1)));
    // material_href lo escribe quien pone la tarea: un "javascript:" ahí se
    // ejecutaría con la sesión del alumno al tocar "Ir". Solo valen direcciones
    // del propio sitio —todo el catálogo lo es—: un "//otro-dominio" se llevaría
    // al alumno afuera con la tarea en la mano. Se decide con new URL() y no con una expresión
    // regular: el navegador ignora tabuladores, saltos de línea y caracteres de
    // control dentro del esquema, así que "java\tscript:" pasaba una regex y
    // se ejecutaba igual.
    const href = String(r.material_href || "");
    let seguro = false;
    try {
        const u = new URL(href, location.href);
        seguro = u.origin === location.origin;
    } catch (e) {}
    /* El cuestionario necesita saber de qué renglón es: lo que contesta se
       guarda en ese renglón, y es lo que la base usa para dejarlo entrar. */
    const extra = r.material_slug === "cuestionario" ? "&item=" + encodeURIComponent(r.id) : "";
    const enlace = seguro ? href + (href.includes("?") ? "&" : "?") + "tarea=" + encodeURIComponent(tareaId) + extra : "tareas.html";

    /* Con lector de pantalla, la lista de enlaces de la página era «Ir, Ir,
       Repasar, Ir»: el nombre dice a qué va y de qué tarea es. Empieza con la
       palabra que se ve («Ir», «Repasar»), para quien lo dice en voz alta. */
    const nombreEnlace = `${r.cumplido ? "Repasar" : "Ir"}: ${fraseDe(r)}${tareaTitulo ? ` (tarea «${tareaTitulo}»)` : ""}`;
    const cq = r.material_slug === "cuestionario" ? r.cuestionario : null;
    li.className = "border-l-2 pl-3 py-1 " + (r.cumplido ? "border-green-500" : "border-brand-200 dark:border-brand-700");
    li.innerHTML = `
        <div class="flex items-center justify-between gap-2 flex-wrap">
            <span class="text-sm ${r.cumplido ? "text-green-700 dark:text-green-400" : "text-brand-700 dark:text-brand-100"}">${r.cumplido ? "✔ " : ""}${escapeHtml(fraseDe(r))}${cq ? ` · acertaste ${cq.primero} de ${cq.total}` : ""}</span>
            <a href="${escapeHtml(enlace)}" aria-label="${escapeHtml(nombreEnlace)}" class="text-xs font-semibold text-accent-700 dark:text-accent-400 hover:underline shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded">${r.cumplido ? "Repasar" : "Ir"} <span aria-hidden="true">→</span></a>
        </div>`;

    if (r.meta_tipo === "completar") {
        // Lo que la plataforma no puede medir lo dice el alumno. Es el único
        // caso: donde el avance se cuenta solo, un check a mano no significa
        // nada y por eso no se ofrece.
        const label = document.createElement("label");
        label.className = "flex items-center gap-1.5 text-xs text-brand-500 dark:text-brand-300 mt-1 cursor-pointer";
        /* El nombre dice DE QUÉ punto es: con lector de pantalla, una tarea con
           tres puntos a mano eran tres «Ya lo hice, casilla» iguales. El texto
           visible sigue siendo «Ya lo hice» y va al principio del nombre. */
        label.innerHTML = `<input type="checkbox" class="rounded border-brand-300 text-accent-500 focus:ring-accent-400 marcar-item" data-item="${escapeHtml(String(r.id))}" aria-label="${escapeHtml("Ya lo hice: " + fraseDe(r))}" ${r.cumplido ? "checked" : ""}> Ya lo hice`;
        label.querySelector("input").addEventListener("change", (ev) => marcarItem(r.id, ev.target.checked, fraseDe(r)));
        li.appendChild(label);
    } else {
        const barra = document.createElement("div");
        barra.className = "mt-1 flex items-center gap-2";
        barra.innerHTML = `
            <div class="flex-1 h-1.5 bg-brand-200 dark:bg-brand-700 rounded-full overflow-hidden" role="progressbar"
                 aria-label="${escapeHtml(fraseDe(r))}" aria-valuemin="0" aria-valuemax="${meta}" aria-valuenow="${r.hecho}">
                <i class="block h-full ${r.cumplido ? "bg-green-500" : "bg-accent-500"}" style="width:${pct}%"></i>
            </div>
            <span class="text-xs text-brand-450 dark:text-brand-350 tabular-nums"><span aria-hidden="true">${r.hecho}/${meta}</span><span class="sr-only">${r.hecho} de ${meta} hechos</span></span>`;
        li.appendChild(barra);
    }
    return li;
}

function tarjetaAlumno(t) {
    const div = document.createElement("div");
    const vencida = t.situacion === "vencida";
    div.className = "bg-white dark:bg-brand-900 rounded-xl shadow-sm p-4" + (vencida ? " border-l-4 border-red-500" : "");
    const profeNombre = t.profesor_nombre || "tu profe";
    const vencePrefijo = vencida ? '<span class="text-red-600 dark:text-red-400 font-semibold">Venció</span>' : "Vence";
    div.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-1">
            <h3 class="font-semibold text-brand-800 dark:text-white text-sm">${escapeHtml(t.titulo)}</h3>
            <span class="text-xs font-semibold shrink-0 ${COLOR_SITUACION[t.situacion]}"><span aria-hidden="true">${t.cumplidos}/${t.renglones}</span><span class="sr-only">${t.cumplidos} de ${t.renglones} ${t.renglones === 1 ? "hecha" : "hechas"}</span></span>
        </div>
        <p class="text-xs text-brand-450 dark:text-brand-350 mb-2">De ${escapeHtml(profeNombre)} · ${vencePrefijo} ${formatoFecha(t.vence_at)}</p>`;
    if (t.instrucciones) {
        const p = document.createElement("p");
        p.className = "text-sm text-brand-600 dark:text-brand-300 mb-2";
        p.textContent = t.instrucciones;
        div.appendChild(p);
    }
    const ul = document.createElement("ul");
    ul.className = "grid gap-2";
    (t.items || []).forEach((r) => ul.appendChild(renglonAlumno(r, t.id, t.titulo)));
    div.appendChild(ul);
    return div;
}

async function marcarItem(id, hecha, que) {
    // La hora la pone el servidor (proteger_tarea_items_alumno): acá solo se
    // dice si va marcado o no.
    const { error } = await sb.from("tarea_items")
        .update({ completada_at: hecha ? new Date().toISOString() : null }).eq("id", id);
    if (error) { Avisos.avisar("No se pudo actualizar: " + error.message, { tipo: "error" }); return; }
    await cargarMisTareas();
    /* Repintar la lista borra la casilla que tenía el foco, y el foco caía al
       <body>: quien no ve quedaba al principio de la página sin saber si se
       marcó. Se devuelve a la MISMA casilla (la nueva, del mismo punto; si el
       punto se pasó a «Completadas», ahí la encuentra) y se dice qué pasó. */
    const casilla = Array.from(document.querySelectorAll("input.marcar-item"))
        .find((c) => c.dataset.item === String(id));
    if (casilla) casilla.focus();
    const aviso = document.getElementById("tareas-aviso");
    if (aviso) {
        aviso.textContent = "";
        setTimeout(() => { aviso.textContent = (hecha ? "Marcado como hecho: " : "Desmarcado: ") + (que || "el punto") + "."; }, 60);
    }
}

init();
    