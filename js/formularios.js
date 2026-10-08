/* El código de formularios.html.

   Vivía escrito dentro de la página, en un <script> de 57 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Formularios de inscripción a torneos.
 *
 * Los arma quien coordina (profiles.es_coordinador, o quien administra) y se
 * comparten por enlace: quien contesta no necesita cuenta. El enlace da acceso
 * al formulario, NUNCA a las respuestas — esas las lee solo quien lo creó, y
 * eso lo hace cumplir la RLS de formulario_respuestas, no esta página.
 *
 * Esto es lo que inscripcion.html hace hoy escrito a mano para un solo torneo.
 * La diferencia es que acá el formulario es datos (el campo `campos` de la
 * tabla), así que armar el siguiente no es copiar 400 líneas de HTML.
 */
let session = null, perfil = null;
let misFormularios = [];
let campos = [];          // lo que se está editando
let editando = null;      // el formulario abierto en el editor, o null si es nuevo
let respuestasActuales = { formulario: null, filas: [] };
let coordinadores = [];   // con quién se puede compartir: el resto del equipo de coordinación
let compartidoCon = [];   // ids de coordinadores con los que YA se comparte el formulario abierto

// Es dueño (o administra) quien puede editar/borrar/compartir un formulario;
// la RLS ya lo impide para el de un colega, pero sin esto los botones
// "funcionarían" sin cambiar nada, que es peor que no mostrarlos.
function esDueno(f) {
    return !!f && (f.creado_por === perfil.id || perfil.is_admin);
}

const TIPOS = [
    { id: "texto",    etiqueta: "Texto corto" },
    { id: "parrafo",  etiqueta: "Texto largo" },
    { id: "numero",   etiqueta: "Número" },
    { id: "fecha",    etiqueta: "Fecha" },
    { id: "correo",   etiqueta: "Correo" },
    { id: "telefono", etiqueta: "Teléfono" },
    { id: "opcion",   etiqueta: "Una opción" },
    { id: "varias",   etiqueta: "Varias opciones" },
    { id: "si_no",    etiqueta: "Sí o no" },
    { id: "imagen",   etiqueta: "Imagen (foto)" },
    { id: "archivo",  etiqueta: "Archivo (PDF, Word, Excel o foto)" },
    // Pregunta qué sabe de ajedrez y, si dice que sabe mover, le hace una
    // prueba corta de reglas (js/prueba-nivel-inicial.js).
    { id: "nivel_ajedrez", etiqueta: "¿Sabe jugar ajedrez? (con prueba)" },
];
const TIPO_VALIDO = new Set(TIPOS.map((t) => t.id));

/* QUÉ ES CADA PREGUNTA, para poder crear la cuenta desde la respuesta.
   Una etiqueta es texto libre ("Nombre y 2 apellidos", "correo encargado"), así
   que para saber a quién invitar hace falta marcar cuál es cuál. Se declara al
   armar el formulario y queda guardado en el campo, junto al id. */
const PAPELES = [
    { id: "",                 etiqueta: "— Un dato más —" },
    { id: "alumno_nombre",    etiqueta: "Nombre del alumno" },
    { id: "alumno_correo",    etiqueta: "Correo del alumno" },
    { id: "encargado_nombre", etiqueta: "Nombre del encargado" },
    { id: "encargado_correo", etiqueta: "Correo del encargado" },
];
const PAPEL_VALIDO = new Set(PAPELES.map((p) => p.id).filter(Boolean));

const sinTildes = (t) => String(t || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/* Los formularios que ya existen no traen `papel` —se armaron antes de que
   existiera—, así que se deduce de la etiqueta. Es una propuesta, no una
   certeza: por eso el alta SIEMPRE enseña qué dedujo antes de mandar nada.
   Mandarle la invitación al correo de la mamá en vez de al del alumno no da
   ningún error; simplemente entra la persona que no era. */
function papelesDe(campos) {
    const mapa = {};
    const poner = (papel, campo) => { if (papel && !mapa[papel]) mapa[papel] = campo.id; };

    // Lo declarado manda, y se aplica entero antes de adivinar nada.
    (campos || []).forEach((c) => { if (PAPEL_VALIDO.has(c.papel)) poner(c.papel, c); });

    (campos || []).forEach((c) => {
        if (PAPEL_VALIDO.has(c.papel)) return;
        const t = sinTildes(c.etiqueta);
        const esCorreo = c.tipo === "correo" || /correo|email|e-mail/.test(t);
        const esNombre = /nombre|apellido/.test(t);
        // "encargad", no "encargado": cubre encargada y encargados.
        const deLaCasa = /encargad|madre|padre|tutor|acudiente|responsable|familia|mama|papa/.test(t);
        if (deLaCasa) poner(esCorreo ? "encargado_correo" : esNombre ? "encargado_nombre" : "", c);
        else if (esCorreo) poner("alumno_correo", c);
        else if (esNombre) poner("alumno_nombre", c);
    });
    return mapa;
}

/* Las preguntas de una inscripción a torneo de verdad, sacadas de las que ya
   pide inscripcion.html. Es un punto de partida: se borran y se cambian. */
const PLANTILLA = [
    { etiqueta: "Nombre completo", tipo: "texto", requerido: true, papel: "alumno_nombre" },
    { etiqueta: "Correo del alumno", tipo: "correo", requerido: true, papel: "alumno_correo", ayuda: "Ahí le llega la invitación para entrar a la Academia." },
    { etiqueta: "Fecha de nacimiento", tipo: "fecha", requerido: true },
    { etiqueta: "Género", tipo: "opcion", requerido: true, opciones: ["Femenino", "Masculino", "Prefiero no decirlo"] },
    { etiqueta: "Centro educativo", tipo: "texto", requerido: true },
    { etiqueta: "Grado o nivel", tipo: "texto", requerido: true },
    { etiqueta: "Provincia", tipo: "texto", requerido: true },
    { etiqueta: "Cantón", tipo: "texto", requerido: false },
    { etiqueta: "Nombre de la persona encargada", tipo: "texto", requerido: true, papel: "encargado_nombre" },
    { etiqueta: "Correo de la persona encargada", tipo: "correo", requerido: true, papel: "encargado_correo", ayuda: "Ahí se manda la confirmación y, si entra a la Academia, el informe." },
    { etiqueta: "Teléfono de contacto", tipo: "telefono", requerido: true },
    { etiqueta: "Modalidad", tipo: "opcion", requerido: true, opciones: ["Presencial", "En línea"] },
    { etiqueta: "Autorizo el uso de estos datos para organizar el torneo", tipo: "si_no", requerido: true },
];

/* Para un curso que todavía no sabe si arranca desde cero: los datos de
   contacto y la pregunta «¿Sabes jugar ajedrez?» con su prueba. */
const PLANTILLA_CURSO = [
    { etiqueta: "Nombre completo", tipo: "texto", requerido: true, papel: "alumno_nombre" },
    { etiqueta: "Correo del alumno", tipo: "correo", requerido: false, papel: "alumno_correo", ayuda: "Ahí le llega la invitación para entrar a la Academia." },
    { etiqueta: "Fecha de nacimiento", tipo: "fecha", requerido: true },
    { etiqueta: "Nombre de la persona encargada", tipo: "texto", requerido: false, papel: "encargado_nombre", ayuda: "Solo si el alumno es menor de edad." },
    { etiqueta: "Correo de la persona encargada", tipo: "correo", requerido: false, papel: "encargado_correo" },
    { etiqueta: "Teléfono de contacto", tipo: "telefono", requerido: true },
    { etiqueta: "¿Sabes jugar ajedrez?", tipo: "nivel_ajedrez", requerido: true },
];

const escapar = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* El id de cada campo es lo que queda guardado en cada respuesta, así que NO
   puede cambiar cuando se le corrige una tilde a la etiqueta: se calcula una
   sola vez, al crear la pregunta, y después se queda quieto. */
function idDesde(texto, usados) {
    let base = String(texto || "campo").toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "campo";
    let id = base, n = 2;
    while (usados.has(id)) { id = base + "_" + n; n += 1; }
    usados.add(id);
    return id;
}

function slugDesde(titulo) {
    const base = String(titulo || "").toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 44) || "formulario";
    // Cuatro caracteres al azar: dos formularios con el mismo título no chocan,
    // y de paso la dirección no se adivina escribiendo el nombre del torneo.
    return base + "-" + Math.random().toString(36).slice(2, 6);
}

// ------------------------------------------------------------------ editor
function pintarCampos() {
    const caja = document.getElementById("campos");
    caja.innerHTML = "";
    document.getElementById("campos-vacio").classList.toggle("hidden", campos.length > 0);

    campos.forEach((c, i) => {
        const fila = document.createElement("div");
        fila.className = "border border-brand-100 dark:border-brand-800 rounded-xl p-4 bg-brand-50 dark:bg-brand-950";

        const arriba = document.createElement("div");
        arriba.className = "flex flex-wrap items-center gap-2 mb-2";

        const etiqueta = document.createElement("input");
        etiqueta.type = "text";
        etiqueta.value = c.etiqueta || "";
        etiqueta.maxLength = 200;
        etiqueta.placeholder = "La pregunta";
        etiqueta.setAttribute("aria-label", "Pregunta " + (i + 1));
        etiqueta.className = "flex-1 min-w-[12rem] bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        etiqueta.addEventListener("input", () => { c.etiqueta = etiqueta.value; });

        const tipo = document.createElement("select");
        tipo.setAttribute("aria-label", "Tipo de la pregunta " + (i + 1));
        tipo.className = "bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        tipo.innerHTML = TIPOS.map((t) => `<option value="${t.id}"${c.tipo === t.id ? " selected" : ""}>${t.etiqueta}</option>`).join("");
        tipo.addEventListener("change", () => { c.tipo = tipo.value; pintarCampos(); });

        const req = document.createElement("label");
        req.className = "flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-300";
        const reqInput = document.createElement("input");
        reqInput.type = "checkbox"; reqInput.checked = !!c.requerido;
        reqInput.className = "rounded border-brand-300 text-accent-500 focus:ring-accent-400";
        reqInput.addEventListener("change", () => { c.requerido = reqInput.checked; });
        req.append(reqInput, document.createTextNode("Obligatoria"));

        const subir = document.createElement("button");
        subir.type = "button"; subir.textContent = "↑"; subir.title = "Subir";
        subir.setAttribute("aria-label", "Subir la pregunta " + (i + 1));
        subir.className = "px-2 py-1 text-brand-600 dark:text-brand-300 hover:text-accent-600 disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
        subir.disabled = i === 0;
        subir.addEventListener("click", () => { campos.splice(i - 1, 0, campos.splice(i, 1)[0]); pintarCampos(); });

        const bajar = document.createElement("button");
        bajar.type = "button"; bajar.textContent = "↓"; bajar.title = "Bajar";
        bajar.setAttribute("aria-label", "Bajar la pregunta " + (i + 1));
        bajar.className = subir.className;
        bajar.disabled = i === campos.length - 1;
        bajar.addEventListener("click", () => { campos.splice(i + 1, 0, campos.splice(i, 1)[0]); pintarCampos(); });

        const quitar = document.createElement("button");
        quitar.type = "button"; quitar.textContent = "✕";
        quitar.setAttribute("aria-label", "Quitar la pregunta " + (i + 1));
        quitar.className = "px-2 py-1 text-brand-500 dark:text-brand-300 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
        quitar.addEventListener("click", () => { campos.splice(i, 1); pintarCampos(); });

        arriba.append(etiqueta, tipo, req, subir, bajar, quitar);
        fila.appendChild(arriba);

        /* Qué es esta pregunta. Sirve para una sola cosa, pero importante: dar
           de alta la cuenta desde la respuesta sin tener que adivinar cuál de
           las preguntas era el correo del alumno y cuál el de la casa. */
        const papel = document.createElement("select");
        papel.setAttribute("aria-label", "Qué dato es la pregunta " + (i + 1));
        papel.className = "mb-2 bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 text-xs text-brand-600 dark:text-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        papel.innerHTML = PAPELES.map((x) => `<option value="${x.id}"${(c.papel || "") === x.id ? " selected" : ""}>${x.etiqueta}</option>`).join("");
        papel.addEventListener("change", () => { c.papel = papel.value; });
        fila.appendChild(papel);

        const ayuda = document.createElement("input");
        ayuda.type = "text"; ayuda.value = c.ayuda || ""; ayuda.maxLength = 300;
        ayuda.placeholder = "Aclaración debajo de la pregunta (opcional)";
        ayuda.setAttribute("aria-label", "Aclaración de la pregunta " + (i + 1));
        ayuda.className = "w-full bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        ayuda.addEventListener("input", () => { c.ayuda = ayuda.value; });
        fila.appendChild(ayuda);

        if (c.tipo === "nivel_ajedrez") {
            const nota = document.createElement("p");
            nota.className = "mt-2 text-xs text-brand-600 dark:text-brand-300";
            nota.textContent = "Se le pregunta qué sabe de ajedrez. Si dice que sabe mover las piezas, contesta "
                + PruebaNivelInicial.PREGUNTAS.length + " preguntas cortas de reglas con su tablero. "
                + "En las respuestas sale qué se recomienda: empezar desde lo básico, repasar las reglas o empezar con base.";
            fila.appendChild(nota);
        }

        if (c.tipo === "opcion" || c.tipo === "varias") {
            const ops = document.createElement("input");
            ops.type = "text";
            ops.value = (c.opciones || []).join(", ");
            ops.placeholder = "Las opciones, separadas por coma";
            ops.setAttribute("aria-label", "Opciones de la pregunta " + (i + 1));
            ops.className = "w-full mt-2 bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            ops.addEventListener("input", () => {
                c.opciones = ops.value.split(",").map((x) => x.trim()).filter(Boolean);
            });
            fila.appendChild(ops);
        }

        caja.appendChild(fila);
    });
}

function agregarCampo(base) {
    const usados = new Set(campos.map((c) => c.id));
    const c = Object.assign({ etiqueta: "", tipo: "texto", requerido: false, ayuda: "", opciones: [], papel: "" }, base || {});
    c.id = idDesde(c.etiqueta || "pregunta", usados);
    campos.push(c);
}

let academiasMarca = [];

/* El selector de marca. Uno nuevo arranca con la academia de quien lo arma si
   es de una sola; si el formulario ya trae una que no está en la lista (la
   puso administración), se agrega para no borrársela sin querer. */
function llenarAcademias(form) {
    const caja = document.getElementById("c-academia");
    const sel = document.getElementById("f-academia");
    caja.hidden = !academiasMarca.length;
    if (!academiasMarca.length) return;
    const lista = academiasMarca.slice();
    if (form && form.academia_id && !lista.some((a) => a.id === form.academia_id)) {
        lista.push({ id: form.academia_id, nombre: "La academia que ya tenía" });
    }
    sel.replaceChildren();
    const nada = document.createElement("option");
    nada.value = ""; nada.textContent = "— Ajedrez Integral —";
    sel.appendChild(nada);
    lista.forEach((a) => {
        const o = document.createElement("option");
        o.value = a.id; o.textContent = a.nombre;
        sel.appendChild(o);
    });
    sel.value = form ? (form.academia_id || "") : (academiasMarca.length === 1 ? academiasMarca[0].id : "");
}

async function abrirEditor(form) {
    editando = form || null;
    campos = form ? JSON.parse(JSON.stringify(form.campos || [])) : [];
    document.getElementById("f-titulo").value = form ? form.titulo : "";
    document.getElementById("f-descripcion").value = form ? (form.descripcion || "") : "";
    document.getElementById("f-abierto").checked = form ? !!form.abierto : true;
    document.getElementById("f-cierra").value = form && form.cierra_el ? form.cierra_el.slice(0, 10) : "";
    document.getElementById("f-grupo").value = form ? (form.grupo || "") : "";
    llenarAcademias(form);
    document.getElementById("guardar-msg").textContent = "";
    pintarCampos();
    mostrar("vista-editor");
    await abrirCompartir(form);
}

// ------------------------------------------------------------------ compartir
// Solo aparece en un formulario YA guardado (uno nuevo todavía no tiene id con
// qué compartir) y solo si es de quien mira: el material de un colega no es
// tuyo para repartirlo.
async function abrirCompartir(form) {
    const bloque = document.getElementById("bloque-compartir");
    compartidoCon = [];
    if (!form || !esDueno(form)) {
        bloque.classList.add("hidden");
        return;
    }
    bloque.classList.remove("hidden");
    document.getElementById("c-msg").textContent = "Cargando…";
    try {
        const { data, error } = await sb.from("formulario_compartidos")
            .select("coordinador_id").eq("formulario_id", form.id);
        if (error) throw error;
        compartidoCon = (data || []).map((r) => r.coordinador_id);
        document.getElementById("c-msg").textContent = "";
    } catch (err) {
        document.getElementById("c-msg").textContent = "No se pudo cargar con quién lo compartes: " + (err.message || err);
    }
    pintarCompartir();
}

function pintarCompartir() {
    const etiquetas = document.getElementById("c-etiquetas");
    etiquetas.innerHTML = "";
    document.getElementById("c-nadie").classList.toggle("hidden", compartidoCon.length > 0);
    compartidoCon.forEach((id) => {
        const quien = coordinadores.find((c) => c.id === id);
        const li = document.createElement("li");
        li.className = "inline-flex items-center gap-1.5 bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200 text-xs font-semibold pl-3 pr-1.5 py-1 rounded-full";
        const nombre = document.createElement("span");
        nombre.textContent = quien ? quien.nombre : "(ya no disponible)";
        li.appendChild(nombre);
        const x = document.createElement("button");
        x.type = "button";
        x.className = "w-4 h-4 flex items-center justify-center rounded-full hover:bg-brand-200 dark:hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        x.textContent = "✕";
        x.setAttribute("aria-label", "Dejar de compartir con " + (quien ? quien.nombre : "este coordinador"));
        x.addEventListener("click", () => dejarDeCompartir(id));
        li.appendChild(x);
        etiquetas.appendChild(li);
    });

    // El selector solo ofrece a quien todavía no lo tiene.
    const libres = coordinadores.filter((c) => !compartidoCon.includes(c.id));
    const select = document.getElementById("c-agregar");
    select.innerHTML = libres.map((c) => `<option value="${escapar(c.id)}">${escapar(c.nombre)}</option>`).join("");
    const sinNadie = libres.length === 0;
    select.disabled = sinNadie;
    document.getElementById("c-sumar").disabled = sinNadie;
    if (sinNadie && coordinadores.length === 0) {
        document.getElementById("c-msg").textContent = "No hay más coordinadores en la plataforma con quién compartirlo.";
    } else if (sinNadie) {
        document.getElementById("c-msg").textContent = "Ya lo compartes con todo el equipo de coordinación.";
    }
}

document.getElementById("c-sumar").addEventListener("click", async () => {
    const id = document.getElementById("c-agregar").value;
    if (!id || !editando) return;
    const btn = document.getElementById("c-sumar");
    const msg = document.getElementById("c-msg");
    btn.disabled = true;
    msg.textContent = "Compartiendo…";
    try {
        const { error } = await sb.from("formulario_compartidos")
            .insert({ formulario_id: editando.id, coordinador_id: id });
        if (error) throw error;
        compartidoCon = compartidoCon.concat([id]);
        pintarCompartir();
        msg.textContent = "Compartido.";
    } catch (err) {
        msg.textContent = "No se pudo compartir: " + (err.message || err);
    } finally {
        btn.disabled = false;
    }
});

async function dejarDeCompartir(id) {
    if (!editando) return;
    const msg = document.getElementById("c-msg");
    try {
        const { error } = await sb.from("formulario_compartidos")
            .delete().eq("formulario_id", editando.id).eq("coordinador_id", id);
        if (error) throw error;
        compartidoCon = compartidoCon.filter((x) => x !== id);
        pintarCompartir();
        msg.textContent = "Ya no lo ve.";
    } catch (err) {
        msg.textContent = "No se pudo quitar: " + (err.message || err);
    }
}

function mostrar(cual) {
    ["vista-lista", "vista-editor", "vista-respuestas"].forEach((v) => {
        document.getElementById(v).classList.toggle("hidden", v !== cual);
    });
    document.getElementById("nuevo-btn").classList.toggle("hidden", cual !== "vista-lista");
    document.getElementById("alumno-nuevo-btn").classList.toggle("hidden", cual !== "vista-lista");
}

async function guardar() {
    const btn = document.getElementById("guardar-btn");
    const msg = document.getElementById("guardar-msg");
    const titulo = document.getElementById("f-titulo").value.trim();
    if (!titulo) { msg.textContent = "Ponle un título."; msg.className = "text-sm text-red-600 dark:text-red-400"; return; }

    const limpios = campos
        .filter((c) => (c.etiqueta || "").trim())
        .map((c) => ({
            id: c.id, etiqueta: c.etiqueta.trim(), tipo: TIPO_VALIDO.has(c.tipo) ? c.tipo : "texto",
            requerido: !!c.requerido, ayuda: (c.ayuda || "").trim(),
            opciones: (c.tipo === "opcion" || c.tipo === "varias") ? (c.opciones || []) : [],
            papel: PAPEL_VALIDO.has(c.papel) ? c.papel : "",
        }));
    if (!limpios.length) { msg.textContent = "Agrégale al menos una pregunta."; msg.className = "text-sm text-red-600 dark:text-red-400"; return; }
    const sinOpciones = limpios.find((c) => (c.tipo === "opcion" || c.tipo === "varias") && !c.opciones.length);
    if (sinOpciones) {
        msg.textContent = `"${sinOpciones.etiqueta}" es de opciones pero no tiene ninguna.`;
        msg.className = "text-sm text-red-600 dark:text-red-400";
        return;
    }

    const cierra = document.getElementById("f-cierra").value;
    const fila = {
        titulo,
        descripcion: document.getElementById("f-descripcion").value.trim() || null,
        grupo: document.getElementById("f-grupo").value || null,
        campos: limpios,
        abierto: document.getElementById("f-abierto").checked,
        // La fecha se guarda como el final de ese día: "cierra el 20" es que el
        // 20 todavía se puede contestar.
        cierra_el: cierra ? new Date(cierra + "T23:59:59").toISOString() : null,
        updated_at: new Date().toISOString(),
    };
    // Sin academias a la vista no se toca: un formulario que armó
    // administración con marca no la pierde porque lo guarde otra persona.
    if (academiasMarca.length) fila.academia_id = document.getElementById("f-academia").value || null;

    btn.disabled = true;
    msg.textContent = "Guardando…";
    msg.className = "text-sm text-brand-500 dark:text-brand-300";
    try {
        if (editando) {
            const { error } = await sb.from("formularios").update(fila).eq("id", editando.id);
            if (error) throw error;
        } else {
            fila.slug = slugDesde(titulo);
            fila.creado_por = perfil.id;
            const { error } = await sb.from("formularios").insert(fila);
            if (error) throw error;
        }
        await cargarFormularios();
        mostrar("vista-lista");
    } catch (err) {
        msg.textContent = "No se pudo guardar: " + (err.message || err);
        msg.className = "text-sm text-red-600 dark:text-red-400";
    } finally {
        btn.disabled = false;
    }
}

// ------------------------------------------------------------------ lista
// El enlace se arma desde la CARPETA de esta página, no cortándole el ".html"
// al final del pathname. Cloudflare sirve la misma página en dos direcciones
// —/formularios y /formularios.html—, así que con el corte, a quien la abría
// sin la extensión el botón le copiaba "/formulariosformulario.html?f=…": los
// dos nombres pegados, o sea un 404. Y no daba ningún error: el enlace se
// copiaba igual, y el que se quedaba mirando la página que no era es quien lo
// recibía.
function enlacePublico(slug) {
    const carpeta = location.pathname.replace(/[^/]*$/, "");
    return location.origin + carpeta + "formulario.html?f=" + encodeURIComponent(slug);
}

function pintarLista() {
    const caja = document.getElementById("lista");
    caja.innerHTML = "";
    document.getElementById("lista-vacia").classList.toggle("hidden", misFormularios.length > 0);

    misFormularios.forEach((f) => {
        const card = document.createElement("div");
        card.className = "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 flex flex-col gap-3";

        const cerrado = !f.abierto || (f.cierra_el && new Date(f.cierra_el) < new Date());
        card.innerHTML = `
            <div>
                <div class="flex items-start justify-between gap-2">
                    <h3 class="font-serif font-bold text-brand-800 dark:text-white">${escapar(f.titulo)}</h3>
                    <span class="shrink-0 text-xs px-2 py-0.5 rounded-full ${cerrado ? "bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-300" : "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"}">${cerrado ? "cerrado" : "abierto"}</span>
                </div>
                <p class="text-xs text-brand-450 dark:text-brand-350 mt-1">
                    ${f.grupo ? escapar(f.grupo) + " · " : ""}${(f.campos || []).length} pregunta${(f.campos || []).length === 1 ? "" : "s"} ·
                    <strong class="text-brand-600 dark:text-brand-300">${f.n_respuestas} respuesta${f.n_respuestas === 1 ? "" : "s"}</strong>
                </p>
            </div>`;

        const acciones = document.createElement("div");
        acciones.className = "flex flex-wrap gap-2 mt-auto";
        const boton = (texto, clases, alPulsar) => {
            const b = document.createElement("button");
            b.type = "button"; b.textContent = texto;
            b.className = clases + " text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            b.addEventListener("click", alPulsar);
            return b;
        };
        // Editar y Borrar solo si es de quien mira (o administra): la RLS ya
        // lo impide para el de un compañero de equipo, pero sin esto el botón
        // "funcionaría" sin cambiar nada, que es peor que no mostrarlo.
        const esMio = esDueno(f);
        if (esMio) {
            acciones.append(boton("Editar", "bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200", () => abrirEditor(f)));
        }
        acciones.append(
            boton("Respuestas", "bg-accent-500 hover:bg-accent-600 text-brand-900", () => verRespuestas(f)),
            boton("Copiar enlace", "bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200", async (e) => {
                const b = e.currentTarget;
                try { await navigator.clipboard.writeText(enlacePublico(f.slug)); b.textContent = "¡Copiado!"; }
                catch (err) { await Avisos.pedir("No se pudo copiar solo: cópialo de aquí.", { titulo: "Enlace del formulario", valor: enlacePublico(f.slug), soloLectura: true, aceptar: "Listo" }); }
                setTimeout(() => { b.textContent = "Copiar enlace"; }, 1500);
            }),
        );
        if (esMio) {
            acciones.append(boton("Borrar", "text-red-600 dark:text-red-400 underline", async () => {
                if (!(await Avisos.confirmar(`Se borran también sus ${f.n_respuestas} respuestas. No se puede deshacer.`, { titulo: `¿Borrar «${f.titulo}»?`, aceptar: "Borrar", peligro: true }))) return;
                // Primero sus imágenes: borrado el formulario, la política de
                // Storage ya no encuentra de quién eran y quedarían huérfanas.
                // Cada archivo va en <formulario>/<id>/<nombre>, así que la
                // lista de rutas sale de las respuestas, que las guardan.
                const { data: resp, error: eResp } = await traerTodo(() => sb.from("formulario_respuestas")
                    .select("respuestas").eq("formulario_id", f.id).order("id"));
                if (eResp) { Avisos.avisar("No se pudieron leer sus archivos, así que no se borró: " + eResp.message, { tipo: "error" }); return; }
                const rutas = [];
                (resp || []).forEach((r) => (f.campos || []).forEach((c) => {
                    const v = r.respuestas && r.respuestas[c.id];
                    if ((c.tipo === "imagen" || c.tipo === "archivo") && Array.isArray(v)) rutas.push(...v);
                }));
                if (rutas.length) await sb.storage.from("formulario-adjuntos").remove(rutas);
                const { error } = await sb.from("formularios").delete().eq("id", f.id);
                if (error) { Avisos.avisar("No se pudo borrar: " + error.message, { tipo: "error" }); return; }
                await cargarFormularios();
            }));
        }
        card.appendChild(acciones);
        caja.appendChild(card);
    });
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
async function cargarFormularios() {
    const { data, error } = await sb.from("formularios")
        .select("*, formulario_respuestas(count)")
        .order("created_at", { ascending: false });
    if (error) throw error;
    misFormularios = (data || []).map((f) => Object.assign({}, f, {
        n_respuestas: (f.formulario_respuestas && f.formulario_respuestas[0] && f.formulario_respuestas[0].count) || 0,
    }));
    pintarLista();
}

// ------------------------------------------------------------------ respuestas
async function verRespuestas(f) {
    Adjuntos.soltar();
    document.getElementById("respuestas-titulo").textContent = "Respuestas · " + f.titulo;
    const { data, error } = await traerTodo(() => sb.from("formulario_respuestas")
        .select("id, respuestas, created_at, cuenta_id, cuenta_creada_at").eq("formulario_id", f.id)
        .order("created_at", { ascending: false }).order("id"));
    if (error) { Avisos.avisar("No se pudieron cargar: " + error.message, { tipo: "error" }); return; }
    respuestasActuales = { formulario: f, filas: data || [], papeles: papelesDe(f.campos) };
    document.getElementById("buscar-respuestas").value = "";
    pintarRespuestas();
    mostrar("vista-respuestas");
}

/* El buscador mira todo lo que se ve en la fila (fecha, cada respuesta y si
   ya tiene cuenta), sin tildes ni mayúsculas. Con varias palabras tienen que
   estar todas: «rojas sub-14» encuentra a quien se llama Rojas Y va en Sub-14.
   Solo filtra la tabla: el CSV sigue bajando todas las respuestas. */
function textoDeRespuesta(r, campos) {
    return sinTildes([
        new Date(r.created_at).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Costa_Rica" }),
        r.cuenta_id ? "cuenta creada" : "sin cuenta",
    ].concat((campos || []).map((c) => valorLegible(r.respuestas[c.id], c))).join(" "));
}

function pintarRespuestas() {
    const { formulario: f, filas: todas } = respuestasActuales;
    const palabras = sinTildes(document.getElementById("buscar-respuestas").value).split(/\s+/).filter(Boolean);
    const filas = palabras.length
        ? todas.filter((r) => { const t = textoDeRespuesta(r, f.campos); return palabras.every((p) => t.includes(p)); })
        : todas;
    document.getElementById("buscar-respuestas-cuenta").textContent = palabras.length && todas.length
        ? `${filas.length} de ${todas.length} respuesta${todas.length === 1 ? "" : "s"}`
        : "";
    const cabecera = document.getElementById("respuestas-cabecera");
    const cuerpo = document.getElementById("respuestas-cuerpo");
    cabecera.innerHTML = "";
    cuerpo.innerHTML = "";

    const columnas = [{ id: "__fecha", etiqueta: "Fecha" }].concat(f.campos || [])
        .concat([{ id: "__cuenta", etiqueta: "Cuenta" }]);
    columnas.forEach((c) => {
        const th = document.createElement("th");
        th.className = "py-2 pr-4 font-semibold whitespace-nowrap";
        th.textContent = c.etiqueta;
        cabecera.appendChild(th);
    });

    if (!filas.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = columnas.length;
        td.className = "py-4 text-brand-450 dark:text-brand-350";
        td.textContent = todas.length
            ? "Ninguna respuesta coincide con esa búsqueda."
            : "Todavía no ha contestado nadie. Compártelo desde la lista de formularios, con «Copiar enlace».";
        tr.appendChild(td); cuerpo.appendChild(tr);
        return;
    }

    filas.forEach((r) => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-brand-50 dark:border-brand-800/60 last:border-0";
        columnas.forEach((c) => {
            const td = document.createElement("td");
            td.className = "py-2 pr-4 text-brand-600 dark:text-brand-300 align-top";
            if (c.id === "__cuenta") {
                td.appendChild(celdaCuenta(r));
            } else if (c.tipo === "imagen" || c.tipo === "archivo") {
                td.appendChild(celdaAdjuntos(r.respuestas[c.id], c, r));
            } else {
                td.textContent = c.id === "__fecha"
                    ? new Date(r.created_at).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Costa_Rica" })
                    : valorLegible(r.respuestas[c.id]);
            }
            tr.appendChild(td);
        });
        cuerpo.appendChild(tr);
    });
}

/* -------------------------------------------------------------- adjuntos
   Viven en el bucket PRIVADO "formulario-adjuntos": los lee solo quien ya puede
   ver el formulario (la misma RLS que sus respuestas). Se bajan con la sesión
   (storage.download) y los pinta js/adjuntos.js, igual que en Inscripciones. */
const bajarAdjunto = (ruta) => sb.storage.from("formulario-adjuntos").download(ruta)
    .then(({ data, error }) => { if (error) throw error; return data; });

function celdaAdjuntos(v, c, r) {
    const idNombre = (respuestasActuales.papeles || {}).alumno_nombre;
    const quien = idNombre ? valorLegible(r.respuestas[idNombre])
        : new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
    return Adjuntos.celda(v, bajarAdjunto, quien, c.etiqueta);
}

/* Que ya se le creó la cuenta lo dice la BASE (cuenta_id de la propia
   respuesta), no una variable de la pantalla: al volver a abrir las respuestas
   mañana, el botón no vuelve a ofrecer mandar una segunda invitación al mismo
   correo. */
function celdaCuenta(r) {
    if (r.cuenta_id) {
        const listo = document.createElement("span");
        listo.className = "whitespace-nowrap text-green-700 dark:text-green-400";
        listo.textContent = "✅ Creada" + (r.cuenta_creada_at
            ? " el " + new Date(r.cuenta_creada_at).toLocaleDateString("es-CR", { day: "2-digit", month: "short", timeZone: "America/Costa_Rica" })
            : "");
        return listo;
    }
    // Dar de alta es una función que su supervisor le puede apagar: sin ella,
    // la Edge Function contestaría 403, así que no se ofrece.
    if (!FuncionesCoordinacion.puede("altas")) {
        const no = document.createElement("span");
        no.className = "text-xs text-brand-450 dark:text-brand-350";
        no.textContent = "Sin cuenta";
        return no;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "Crear cuenta";
    b.className = "whitespace-nowrap bg-accent-500 hover:bg-accent-600 text-brand-900 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    b.addEventListener("click", () => abrirAlta(r, b));
    return b;
}

// ------------------------------------------------------------------ dar de alta
// La caja vive en js/alta-alumno.js, que comparte con alumno-nuevo.html (la
// ficha «Crear cuenta de alumno» del panel del profesor). Acá solo se decide
// con qué datos se abre.

function abrirAlta(r, boton) {
    const { formulario: f, papeles } = respuestasActuales;
    const dato = (papel) => {
        const id = papeles[papel];
        return id ? valorLegible(r.respuestas[id]) : "";
    };
    AltaAlumno.abrir({
        respuestaId: r.id,
        volverEl: boton || null,
        datos: {
            alumnoNombre: dato("alumno_nombre"),
            alumnoCorreo: dato("alumno_correo"),
            encargadoNombre: dato("encargado_nombre"),
            encargadoCorreo: dato("encargado_correo"),
            // El equipo del formulario: si se armó para 7° B, sus alumnos son de 7° B.
            grupo: f.grupo || "",
        },
        // La pantalla dice lo que de verdad pasó, no "listo" a secas: si ya
        // tenía cuenta no salió ninguna invitación, y conviene saberlo.
        alCrear: (out) => {
            r.cuenta_id = out.alumno_id;
            r.cuenta_creada_at = new Date().toISOString();
            pintarRespuestas();
        },
    });
}

/* La misma caja, en blanco: para el alumno que se inscribe por WhatsApp o en
   persona, sin pasar por el enlace del formulario. Manda a create-student en
   vez de inscribir-alumno. */
function abrirAltaManual() {
    AltaAlumno.abrir({ volverEl: document.getElementById("alumno-nuevo-btn") });
}

function valorLegible(v, c) {
    if (v === null || v === undefined) return "";
    if (c && (c.tipo === "imagen" || c.tipo === "archivo")) return Adjuntos.contar(v);
    if (Array.isArray(v)) return v.join(", ");
    if (v === true) return "Sí";
    if (v === false) return "No";
    return String(v);
}

/* CSV con punto y coma y BOM: es lo que Excel en español abre de un doble clic
   sin preguntar nada. Con coma, Excel mete la fila entera en la columna A. */
function bajarCsv() {
    const { formulario, filas } = respuestasActuales;
    if (!formulario) return;
    const columnas = [{ id: "__fecha", etiqueta: "Fecha" }].concat(formulario.campos || [])
        .concat([{ id: "__cuenta", etiqueta: "Cuenta creada" }]);
    const celda = (t) => '"' + String(t == null ? "" : t).replace(/"/g, '""') + '"';
    const lineas = [columnas.map((c) => celda(c.etiqueta)).join(";")];
    filas.forEach((r) => {
        lineas.push(columnas.map((c) => celda(
            c.id === "__fecha" ? new Date(r.created_at).toLocaleString("es-CR", { timeZone: "America/Costa_Rica" })
            : c.id === "__cuenta" ? (r.cuenta_id ? "Sí" : "No")
            : valorLegible(r.respuestas[c.id], c)
        )).join(";"));
    });
    const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (formulario.slug || "respuestas") + ".csv";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ------------------------------------------------------------------ arranque
document.getElementById("nuevo-btn").addEventListener("click", () => abrirEditor(null));
document.getElementById("alumno-nuevo-btn").addEventListener("click", abrirAltaManual);
document.getElementById("volver-btn").addEventListener("click", () => mostrar("vista-lista"));
document.getElementById("volver-btn-2").addEventListener("click", () => mostrar("vista-lista"));
document.getElementById("guardar-btn").addEventListener("click", guardar);
document.getElementById("csv-btn").addEventListener("click", bajarCsv);
document.getElementById("buscar-respuestas").addEventListener("input", pintarRespuestas);
document.getElementById("campo-btn").addEventListener("click", () => { agregarCampo(); pintarCampos(); });
async function usarPlantilla(plantilla) {
    if (campos.length && !(await Avisos.confirmar("Las preguntas que ya pusiste se cambian por las de la plantilla.", { titulo: "¿Usar la plantilla?", aceptar: "Usar la plantilla" }))) return;
    campos = [];
    plantilla.forEach(agregarCampo);
    pintarCampos();
}
document.getElementById("plantilla-btn").addEventListener("click", () => usarPlantilla(PLANTILLA));
document.getElementById("plantilla-curso-btn").addEventListener("click", () => usarPlantilla(PLANTILLA_CURSO));

async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { window.location.href = "login.html?next=formularios.html"; return; }

    const { data: p } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
    perfil = p;
    // La página lo comprueba para no enseñar lo que no toca, pero quien de
    // verdad lo impide es la RLS: sin es_coordinador, el insert no pasa.
    if (!perfil || !(perfil.es_coordinador || perfil.es_supervisor || perfil.is_admin)) {
        document.getElementById("loading").classList.add("hidden");
        document.getElementById("denegado").classList.remove("hidden");
        return;
    }
    // Quien supervisa su academia pudo haberle apagado esta función: se dice
    // quién, en vez de enseñar una página vacía (la base la cierra igual).
    await FuncionesCoordinacion.cargar(sb);
    if (!FuncionesCoordinacion.puede("formularios")) {
        const aqui = document.getElementById("loading");
        aqui.classList.remove("hidden");
        FuncionesCoordinacion.aviso(aqui, "formularios");
        return;
    }
    document.getElementById("alumno-nuevo-btn").hidden = !FuncionesCoordinacion.puede("altas");
    AltaAlumno.montar(perfil);
    if (perfil.is_admin) {
        document.getElementById("subtitulo").textContent =
            "Arma un formulario, compártelo por enlace y baja las respuestas en Excel. Como administras, ves todos los formularios de la plataforma.";
    } else {
        document.getElementById("subtitulo").textContent =
            "Arma un formulario para tu equipo, compártelo por enlace y baja las respuestas en Excel. También ves los formularios y las respuestas de quien coordina tu mismo equipo.";
    }

    // Los equipos que de verdad existen entre los alumnos que uno ve.
    const { data: alumnos } = await sb.rpc("informes_resumen_alumnos");
    const grupos = [...new Set((alumnos || []).map((a) => a.grupo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    document.getElementById("f-grupo").innerHTML =
        '<option value="">— Sin equipo en particular —</option>' +
        grupos.map((g) => `<option value="${escapar(g)}">${escapar(g)}</option>`).join("");

    // Las academias con cuya marca puede salir un formulario: las que la RLS
    // deja ver (las propias; todas si administra). Si falla, no se ofrece.
    try {
        const { data: acs, error } = await sb.from("academias").select("id, nombre").order("nombre");
        if (error) throw error;
        academiasMarca = acs || [];
    } catch (err) {
        academiasMarca = [];
    }

    // Con quién se puede compartir un formulario: el resto del equipo de
    // coordinación. Si falla, el bloque de compartir se queda sin opciones en
    // vez de tumbar la página entera — lo que se comparte no es lo primero
    // que hace falta al entrar.
    try {
        const { data: cs, error } = await sb.rpc("coordinadores_disponibles");
        if (error) throw error;
        coordinadores = cs || [];
    } catch (err) {
        coordinadores = [];
    }

    try {
        await cargarFormularios();
    } catch (err) {
        document.getElementById("loading").textContent = "No se pudieron cargar los formularios: " + (err.message || err);
        return;
    }
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    mostrar("vista-lista");
    /* formularios.html?alta=1 es el acceso directo «Cuenta nueva» del panel
       de quien supervisa (js/clases.js, grupo «Mi academia»): abre ya la caja
       de «＋ Alumno nuevo». Solo si esa función no le fue apagada —la base la
       rechazaría igual—, y la dirección queda limpia para que recargar no la
       vuelva a abrir. */
    const url = new URL(location.href);
    if (url.searchParams.get("alta") === "1") {
        url.searchParams.delete("alta");
        history.replaceState(null, "", url.pathname + url.search + url.hash);
        if (FuncionesCoordinacion.puede("altas")) abrirAltaManual();
    }
}
init();
    