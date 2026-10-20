/* El código de sesion.html.

   Las respuestas de las prácticas de «Formación Ajedrez» (js/clase-formacion.js):
   en cada lámina el alumno puede tener preguntas —de opciones, de texto o la
   planilla de un dictado— y contesta; queda el registro para analizarlo en
   clase y calificarlo después. Ver «Las respuestas de la práctica» en
   docs/decisiones/clase-en-vivo.md.

   - Las preguntas salen de practicas.json (herramientas/formacion-practicas.js),
     que NO trae las respuestas correctas.
   - Se guardan por responder_practica() (migración practica_respuestas): la base
     comprueba que la práctica sea la que su profe tiene en la clase, la corrige
     con la clave que solo lee quien da clase y NO devuelve la corrección: el
     análisis es en clase. El alumno vuelve a leer lo suyo con
     mis_respuestas_practica(), sin nota.
   - El profe lee practica_respuestas (la RLS le da las de su clase) y las claves
     (practica_claves): ve qué contestó cada uno, la respuesta modelo, quién
     acertó y, de prácticas anteriores, lo que quedó guardado.

   Como las demás partes de la clase (ver «sesion.js en partes»), es un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js solo dentro de funciones. */

const claveDeRespuesta = (n, id) => n + "|" + id;
let formacionControles = [];          // alumno: las preguntas que se ven, {n, q, leer, estado}
let formacionPintandoPreguntas = 0;
const formacionGuardando = new Map(); // "lámina|pregunta" → promesa del último guardado (se guardan en orden)

const TEXTO_CAJA = "w-full text-sm bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 text-brand-800 dark:text-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
const BOTON_CHICO = "text-xs font-semibold px-3 py-2 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

function elementoDeFormacion(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
}

/* ---------- El alumno ---------- */
async function cargarMisRespuestasDeFormacion() {
    if (!formacionActual || vistaPrevia || isTeacher) return;
    const envio = formacionActual.id;
    const { data, error } = await sb.rpc("mis_respuestas_practica", { p_envio: envio });
    if (error) { console.error("No se pudieron leer tus respuestas:", error); return; }
    if (!formacionActual || formacionActual.id !== envio) return;
    (data || []).forEach((r) => { if (r.deck === formacionActual.deck) formacionRespuestas.set(claveDeRespuesta(r.lamina, r.pregunta), r.respuesta); });
    pintarPreguntasDeFormacion();
    anunciarFormacion();
}

function textoDeEstado(estado, texto) {
    estado.textContent = texto || "";
}

/* Guarda UNA respuesta. Lo que no cambió no se manda; lo que está en camino se
   espera, para que dos guardados seguidos lleguen en orden. */
function guardarRespuestaDeFormacion(n, q, valor, estado) {
    if (!formacionActual || !formacionMia) return Promise.resolve(false);
    const clave = claveDeRespuesta(n, q.id);
    const nuevo = valor.trim() === "" ? "" : valor;
    const antes = formacionRespuestas.get(clave) || "";
    if (nuevo === antes) return formacionGuardando.get(clave) || Promise.resolve(true);
    const envio = formacionActual.id, deck = formacionActual.deck;
    textoDeEstado(estado, "Guardando…");
    const previa = formacionGuardando.get(clave) || Promise.resolve();
    const p = previa.then(async () => {
        if (vistaPrevia) {
            // «Ver como alumno»: el profe mira cómo se ve, sin dejar respuestas en la clase.
            if (nuevo === "") formacionRespuestas.delete(clave); else formacionRespuestas.set(clave, nuevo);
            textoDeEstado(estado, "Vista previa: esto no se guarda.");
            return true;
        }
        const { error } = await sb.rpc("responder_practica", { p_envio: envio, p_deck: deck, p_lamina: n, p_pregunta: q.id, p_respuesta: nuevo });
        if (error) {
            console.error("No se pudo guardar la respuesta:", error);
            textoDeEstado(estado, /ya no está en tu clase/.test(error.message || "") ? "Tu profe ya quitó esta práctica: no se guardó."
                : "No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.");
            return false;
        }
        if (formacionActual && formacionActual.id === envio) {
            if (nuevo === "") formacionRespuestas.delete(clave); else formacionRespuestas.set(clave, nuevo);
            anunciarFormacion();
        }
        textoDeEstado(estado, nuevo === "" ? "Sin respuesta." : "Guardada ✓");
        return true;
    });
    formacionGuardando.set(clave, p);
    return p;
}

// Antes de pasar de lámina o de marcarla: lo que está escrito y no se guardó.
function guardarPendientesDeFormacion() {
    formacionControles.forEach((c) => { guardarRespuestaDeFormacion(c.n, c.q, c.leer(), c.estado); });
}

function pintarPreguntaDeOpciones(n, q, guardado) {
    const caja = elementoDeFormacion("fieldset", "rounded-lg bg-brand-50 dark:bg-brand-800/50 px-3 py-2");
    caja.appendChild(elementoDeFormacion("legend", "text-sm font-semibold text-brand-800 dark:text-white px-1", q.texto));
    const estado = elementoDeFormacion("p", "text-xs font-semibold text-brand-700 dark:text-brand-200 min-h-[1rem] mt-1");
    estado.setAttribute("role", "status");
    const nombre = "fq-" + n + "-" + q.id;
    q.opciones.forEach((o, k) => {
        const lab = elementoDeFormacion("label", "flex items-center gap-2 text-sm text-brand-800 dark:text-brand-100 py-1 cursor-pointer");
        const r = document.createElement("input");
        r.type = "radio"; r.name = nombre; r.value = o.v; r.id = nombre + "-" + k;
        r.className = "w-4 h-4 shrink-0 accent-brand-700";
        r.checked = guardado === o.v;
        r.addEventListener("change", () => guardarRespuestaDeFormacion(n, q, o.v, estado));
        lab.append(r, elementoDeFormacion("span", "", o.t));
        caja.appendChild(lab);
    });
    caja.appendChild(estado);
    if (guardado) textoDeEstado(estado, "Guardada ✓");
    const leer = () => { const x = caja.querySelector("input:checked"); return x ? x.value : (formacionRespuestas.get(claveDeRespuesta(n, q.id)) || ""); };
    return { caja, leer, estado };
}

function pintarPreguntaDeTexto(n, q, guardado) {
    const caja = elementoDeFormacion("div", "rounded-lg bg-brand-50 dark:bg-brand-800/50 px-3 py-2");
    const id = "fq-" + n + "-" + q.id;
    const lab = elementoDeFormacion("label", "block text-sm font-semibold text-brand-800 dark:text-white mb-1", q.texto);
    lab.htmlFor = id;
    const area = document.createElement("textarea");
    area.id = id; area.rows = 4; area.maxLength = 2000; area.value = guardado || "";
    area.className = TEXTO_CAJA;
    area.setAttribute("autocomplete", "off");
    const fila = elementoDeFormacion("div", "flex flex-wrap items-center gap-2 mt-1");
    const guardar = elementoDeFormacion("button", BOTON_CHICO, "Guardar mi respuesta");
    guardar.type = "button";
    const estado = elementoDeFormacion("p", "text-xs font-semibold text-brand-700 dark:text-brand-200");
    estado.setAttribute("role", "status");
    if (guardado) textoDeEstado(estado, "Guardada ✓");
    const leer = () => area.value;
    const mandar = () => guardarRespuestaDeFormacion(n, q, leer(), estado);
    guardar.addEventListener("click", mandar);
    area.addEventListener("blur", mandar);
    fila.append(guardar, estado);
    caja.append(lab, area, fila);
    return { caja, leer, estado };
}

function pintarPreguntaDePlanilla(n, q, guardado) {
    const caja = elementoDeFormacion("div", "rounded-lg bg-brand-50 dark:bg-brand-800/50 px-3 py-2");
    caja.appendChild(elementoDeFormacion("p", "text-sm font-semibold text-brand-800 dark:text-white mb-1", q.texto));
    caja.appendChild(elementoDeFormacion("p", "text-xs text-brand-600 dark:text-brand-300 mb-1", "Anota cada jugada como la oyes, en notación algebraica española (C, A, T, D, R; x en las capturas; + en el jaque y # en el mate)."));
    const jugadas = FormacionPractica.planillaDeTexto(guardado, q.filas);
    const tabla = elementoDeFormacion("table", "text-sm w-full max-w-[420px]");
    const cab = document.createElement("thead");
    const filaCab = document.createElement("tr");
    ["N.º", "Blancas", "Negras"].forEach((t) => { const th = elementoDeFormacion("th", "text-left text-xs font-semibold text-brand-600 dark:text-brand-300 px-1 pb-1", t); th.scope = "col"; filaCab.appendChild(th); });
    cab.appendChild(filaCab);
    tabla.appendChild(cab);
    const cuerpo = document.createElement("tbody");
    const campos = [];
    for (let f = 0; f < q.filas; f++) {
        const tr = document.createElement("tr");
        tr.appendChild(elementoDeFormacion("td", "px-1 text-brand-600 dark:text-brand-300 tabular-nums", String(f + 1)));
        for (let c = 0; c < 2; c++) {
            const td = document.createElement("td");
            td.className = "px-1 py-0.5";
            const inp = document.createElement("input");
            inp.type = "text"; inp.maxLength = 12; inp.value = jugadas[f * 2 + c];
            inp.className = TEXTO_CAJA + " !py-1";
            inp.setAttribute("autocomplete", "off");
            inp.setAttribute("autocapitalize", "off");
            inp.setAttribute("autocorrect", "off");
            inp.spellcheck = false;
            inp.setAttribute("aria-label", FormacionPractica.nombreDeJugada(f * 2 + c));
            campos.push(inp);
            td.appendChild(inp);
            tr.appendChild(td);
        }
        cuerpo.appendChild(tr);
    }
    tabla.appendChild(cuerpo);
    const fila = elementoDeFormacion("div", "flex flex-wrap items-center gap-2 mt-1");
    const guardar = elementoDeFormacion("button", BOTON_CHICO, "Guardar mi planilla");
    guardar.type = "button";
    const estado = elementoDeFormacion("p", "text-xs font-semibold text-brand-700 dark:text-brand-200");
    estado.setAttribute("role", "status");
    if (guardado) textoDeEstado(estado, "Guardada ✓");
    const leer = () => {
        const v = campos.map((x) => x.value.trim());
        return v.every((x) => x === "") ? "" : FormacionPractica.planillaATexto(v);
    };
    const mandar = () => guardarRespuestaDeFormacion(n, q, leer(), estado);
    guardar.addEventListener("click", mandar);
    campos.forEach((x) => x.addEventListener("change", mandar));
    fila.append(guardar, estado);
    caja.append(tabla, fila);
    return { caja, leer, estado };
}

/* Las preguntas de la lámina que ve el alumno (si tiene). Lo escrito y no
   guardado de la lámina anterior se guardó al pasar (guardarPendientes…). */
async function pintarPreguntasDeFormacion() {
    const cont = document.getElementById("formacion-preguntas");
    if (!cont) return;
    const turno = ++formacionPintandoPreguntas;
    if (!formacionActual || !formacionMia) { cont.replaceChildren(); cont.hidden = true; formacionControles = []; return; }
    const n = formacionActual.laminas[formacionMia.i];
    let lista;
    try { lista = await listaDeFormacion(); } catch (e) { lista = []; }
    if (turno !== formacionPintandoPreguntas || !formacionActual || !formacionMia) return;
    const preguntas = FormacionPractica.preguntasDe(lista, formacionActual, n);
    cont.replaceChildren();
    formacionControles = [];
    cont.hidden = !preguntas.length;
    // Varias preguntas de opciones (las cuatro posiciones de una lámina): de a dos por fila, para no ir tan abajo.
    cont.classList.toggle("md:grid-cols-2", preguntas.length > 1 && preguntas.every((q) => q.tipo === "opciones"));
    preguntas.forEach((q) => {
        const guardado = formacionRespuestas.get(claveDeRespuesta(n, q.id)) || "";
        const c = q.tipo === "opciones" ? pintarPreguntaDeOpciones(n, q, guardado)
            : q.tipo === "planilla" ? pintarPreguntaDePlanilla(n, q, guardado) : pintarPreguntaDeTexto(n, q, guardado);
        formacionControles.push({ n, q, leer: c.leer, estado: c.estado });
        cont.appendChild(c.caja);
    });
}

/* ---------- El profe: qué contestó cada uno ---------- */
let formacionClaves = new Map();      // deck → promesa de sus claves ({lamina|pregunta → {tipo, clave, modelo}})
let formacionRespFirma = "";
let formacionRespEspera = null;
let formacionRespPintando = 0;
let formacionEnvios = [];             // [{envio, titulo, deck, created_at}], de lo guardado

function clavesDeFormacion(deck) {
    if (!formacionClaves.has(deck)) {
        const p = sb.from("practica_claves").select("lamina, pregunta, tipo, clave, modelo").eq("deck", deck)
            .then(({ data, error }) => {
                if (error) throw error;
                const m = new Map();
                (data || []).forEach((c) => m.set(claveDeRespuesta(c.lamina, c.pregunta), c));
                return m;
            });
        p.catch(() => formacionClaves.delete(deck));
        formacionClaves.set(deck, p);
    }
    return formacionClaves.get(deck);
}

const fechaDeFormacion = (iso) => new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

async function cargarEnviosDeFormacion() {
    const { data, error } = await sb.from("practica_respuestas").select("envio, titulo, deck, created_at").order("created_at", { ascending: false }).limit(1000);
    if (error) { console.error(error); return; }
    const vistos = new Map();
    (data || []).forEach((r) => { if (!vistos.has(r.envio)) vistos.set(r.envio, r); });
    formacionEnvios = [...vistos.values()];
}

function pintarEnviosDeFormacion() {
    const sel = document.getElementById("formacion-resp-envio");
    if (!sel) return;
    const elegido = sel.value;
    sel.replaceChildren();
    const opciones = [];
    if (formacionActual) opciones.push({ v: formacionActual.id, t: "La de ahora: " + formacionActual.titulo });
    formacionEnvios.filter((e) => !formacionActual || e.envio !== formacionActual.id)
        .forEach((e) => opciones.push({ v: e.envio, t: e.titulo + " · " + fechaDeFormacion(e.created_at) }));
    opciones.forEach((o) => { const x = document.createElement("option"); x.value = o.v; x.textContent = o.t; sel.appendChild(x); });
    if (opciones.some((o) => o.v === elegido)) sel.value = elegido;
    document.getElementById("formacion-resp-bloque").hidden = !opciones.length;
}

async function nombresDeFormacion(ids) {
    const nombres = new Map();
    for (const [id, v] of formacionVistos.entries()) nombres.set(id, v.nombre);
    const faltan = ids.filter((id) => !nombres.has(id));
    if (faltan.length) {
        const { data } = await sb.from("profiles").select("id, full_name, email").in("id", faltan);
        (data || []).forEach((p) => nombres.set(p.id, p.full_name || p.email || "Alumno"));
    }
    return nombres;
}

const textoDeOpcionDeFormacion = (q, v) => ((q.opciones || []).find((o) => o.v === v) || { t: v }).t;

async function cargarRespuestasDeFormacion() {
    if (!isTeacher) return;
    const sel = document.getElementById("formacion-resp-envio");
    const envio = sel && sel.value;
    if (!envio) return;
    const turno = ++formacionRespPintando;
    const lista = await listaDeFormacion().catch(() => []);
    const { data: filas, error } = await sb.from("practica_respuestas")
        .select("student_id, deck, lamina, pregunta, respuesta, correcta, buenas, total, updated_at").eq("envio", envio).limit(1000);
    if (error) { console.error(error); return; }
    if (turno !== formacionRespPintando) return;
    const deck = formacionActual && formacionActual.id === envio ? formacionActual.deck : ((formacionEnvios.find((e) => e.envio === envio) || {}).deck);
    const practica = lista.find((p) => p.deck === deck);
    const claves = deck ? await clavesDeFormacion(deck).catch(() => new Map()) : new Map();
    const alumnos = [...new Set((filas || []).map((r) => r.student_id).concat(formacionActual && formacionActual.id === envio ? [...formacionVistos.keys()] : []))];
    const nombres = await nombresDeFormacion(alumnos);
    if (turno !== formacionRespPintando) return;
    pintarNotasDeFormacion(filas || [], practica, claves, alumnos, nombres);
    pintarLaminasDeFormacion(filas || [], practica, claves, alumnos, nombres);
}

// Calificación: de las preguntas con respuesta correcta, cuántas salieron bien.
function pintarNotasDeFormacion(filas, practica, claves, alumnos, nombres) {
    const cont = document.getElementById("formacion-resp-notas");
    cont.replaceChildren();
    const calificables = [...claves.entries()].filter(([, c]) => c.tipo !== "texto").length;
    if (!calificables) {
        cont.appendChild(elementoDeFormacion("p", "text-xs text-brand-600 dark:text-brand-300", "Esta práctica no tiene preguntas con respuesta correcta única: las respuestas son para analizarlas en clase."));
        return;
    }
    cont.appendChild(elementoDeFormacion("p", "text-xs font-semibold text-brand-700 dark:text-brand-200", "Calificación: " + calificables + (calificables === 1 ? " pregunta" : " preguntas") + " con respuesta correcta (la planilla cuenta como una: sale bien si todas sus jugadas están bien)."));
    const ul = elementoDeFormacion("ul", "text-sm text-brand-700 dark:text-brand-200");
    alumnos.map((id) => {
        const suyas = filas.filter((r) => r.student_id === id && r.correcta !== null);
        return { id, nombre: nombres.get(id) || "Alumno", contestadas: suyas.length, bien: suyas.filter((r) => r.correcta === true).length };
    }).sort((a, b) => b.bien - a.bien || String(a.nombre).localeCompare(String(b.nombre))).forEach((x) => {
        const li = elementoDeFormacion("li", "flex flex-wrap items-center gap-2 py-0.5 border-b border-brand-100 dark:border-brand-800 last:border-0");
        li.appendChild(elementoDeFormacion("span", "font-semibold flex-1 min-w-0 break-words", x.nombre));
        li.appendChild(elementoDeFormacion("span", "", x.bien + " de " + calificables + " bien" + (x.contestadas < calificables ? " · " + (calificables - x.contestadas) + " sin contestar" : "")));
        ul.appendChild(li);
    });
    cont.appendChild(ul);
}

function detalleDePlanilla(r, clave) {
    const c = FormacionPractica.compararPlanilla(FormacionPractica.planillaDeTexto(r.respuesta, 40), clave);
    const partes = [c.buenas + " de " + c.total + " jugadas bien"];
    c.errores.slice(0, 6).forEach((e) => partes.push(FormacionPractica.nombreDeJugada(e.i) + ": " + (e.escribio ? "escribió «" + e.escribio + "»" : "sin escribir") + ", era «" + e.era + "»"));
    if (c.errores.length > 6) partes.push("y " + (c.errores.length - 6) + " más");
    if (c.extras) partes.push("anotó jugadas de más");
    return partes.join(" · ");
}

function pintarLaminasDeFormacion(filas, practica, claves, alumnos, nombres) {
    const selL = document.getElementById("formacion-resp-lamina");
    const lista = document.getElementById("formacion-resp-lista");
    const conPreguntas = practica ? practica.laminas.filter((l) => l.preguntas.length) : [];
    const antes = selL.value;
    selL.replaceChildren();
    conPreguntas.forEach((l) => { const o = document.createElement("option"); o.value = String(l.n); o.textContent = l.titulo; selL.appendChild(o); });
    if (conPreguntas.some((l) => String(l.n) === antes)) selL.value = antes;
    lista.replaceChildren();
    const lamina = conPreguntas.find((l) => String(l.n) === selL.value);
    if (!lamina) { lista.appendChild(elementoDeFormacion("p", "text-xs text-brand-600 dark:text-brand-300", "Esta práctica no tiene preguntas para contestar.")); return; }
    lamina.preguntas.forEach((q) => {
        const bloque = elementoDeFormacion("div", "rounded-lg bg-white dark:bg-brand-900 border border-brand-100 dark:border-brand-800 px-3 py-2 mb-2");
        bloque.appendChild(elementoDeFormacion("p", "text-sm font-semibold text-brand-800 dark:text-white", q.texto));
        const c = claves.get(claveDeRespuesta(lamina.n, q.id));
        if (c && c.modelo) {
            const modelo = elementoDeFormacion("p", "text-xs text-brand-700 dark:text-brand-200 bg-green-50 dark:bg-green-900/30 rounded px-2 py-1 mt-1");
            modelo.appendChild(elementoDeFormacion("strong", "", "Respuesta modelo (solo tú): "));
            modelo.appendChild(document.createTextNode(c.modelo));
            bloque.appendChild(modelo);
        }
        const suyas = filas.filter((r) => r.lamina === lamina.n && r.pregunta === q.id);
        const ul = elementoDeFormacion("ul", "mt-1 text-sm text-brand-700 dark:text-brand-200");
        if (q.tipo === "opciones") {
            // El conteo por opción: lo que sirve para el análisis en clase.
            const cuenta = elementoDeFormacion("p", "text-xs text-brand-700 dark:text-brand-200 mt-1");
            cuenta.textContent = "Qué eligieron: " + q.opciones.map((o) => o.t + " " + suyas.filter((r) => r.respuesta === o.v).length).join(" · ");
            bloque.appendChild(cuenta);
        }
        suyas.map((r) => ({ r, nombre: nombres.get(r.student_id) || "Alumno" })).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))).forEach(({ r, nombre }) => {
            const li = elementoDeFormacion("li", "py-0.5 border-b border-brand-100 dark:border-brand-800 last:border-0");
            const marca = r.correcta === true ? " ✓ bien" : r.correcta === false ? " ✗ mal" : "";
            li.appendChild(elementoDeFormacion("span", "font-semibold", nombre + marca + ": "));
            // Lo que escribió una persona va por textContent.
            li.appendChild(document.createTextNode(q.tipo === "opciones" ? textoDeOpcionDeFormacion(q, r.respuesta)
                : q.tipo === "planilla" && c && Array.isArray(c.clave) ? detalleDePlanilla(r, c.clave) : r.respuesta));
            ul.appendChild(li);
        });
        bloque.appendChild(ul);
        const sin = alumnos.filter((id) => !suyas.some((r) => r.student_id === id));
        if (sin.length) bloque.appendChild(elementoDeFormacion("p", "text-xs text-brand-600 dark:text-brand-300 mt-1", "Sin contestar: " + sin.map((id) => nombres.get(id) || "Alumno").join(", ")));
        lista.appendChild(bloque);
    });
}

// Cuando alguien contesta o marca, lo que el profe mira se pone al día solo (sin Realtime: la presencia avisa).
function refrescarRespuestasDeFormacionSiCambio() {
    if (!isTeacher || !formacionActual) return;
    const caja = document.getElementById("formacion-caja");
    if (!caja || !caja.open) return;
    const firma = [...formacionVistos.entries()].map(([id, v]) => id + ":" + v.hechas.length + ":" + (v.contestadas || 0)).sort().join(",");
    if (firma === formacionRespFirma) return;
    formacionRespFirma = firma;
    clearTimeout(formacionRespEspera);
    formacionRespEspera = setTimeout(() => { cargarRespuestasDeFormacion(); }, 1500);
}

async function abrirRespuestasDeFormacion() {
    if (!isTeacher) return;
    await cargarEnviosDeFormacion();
    pintarEnviosDeFormacion();
    cargarRespuestasDeFormacion();
}

if (document.getElementById("formacion-resp-bloque")) {
    document.getElementById("formacion-caja").addEventListener("toggle", () => { if (document.getElementById("formacion-caja").open) abrirRespuestasDeFormacion(); });
    document.getElementById("formacion-resp-envio").addEventListener("change", () => cargarRespuestasDeFormacion());
    document.getElementById("formacion-resp-lamina").addEventListener("change", () => cargarRespuestasDeFormacion());
    document.getElementById("formacion-resp-actualizar").addEventListener("click", () => abrirRespuestasDeFormacion());
}
