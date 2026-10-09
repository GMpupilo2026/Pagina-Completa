/* El armador de cuestionarios al estilo Kahoot: lo usan la clase en vivo
   (js/clase-cuestionario.js, que además los juega) y cuestionarios.html, donde
   el profe los prepara fuera de la clase. Una sola copia: las dos pantallas
   tienen los mismos id y cada una pone en `CQ` lo suyo (de dónde sale la
   posición, cómo se avisa, qué más se hace con uno listo). Ver «El
   cuestionario al estilo Kahoot» en docs/decisiones/clase-en-vivo.md.

   `Cuestionario` es la parte pura, para probarla sola. Lo demás es un script
   clásico: sus let/const de arriba son globales para toda la página. Usa
   `sb`, `session`, `Avisos` y `PosicionValida` solo dentro de funciones. */

window.Cuestionario = (function () {
    const MAX_PREGUNTAS = 50;
    const MAX_OPCIONES = 4;
    const LARGO_TITULO = 80;
    const LARGO_TEXTO = 160;
    const LARGO_OPCION = 75;
    // Lo que se puede elegir para contestar cada pregunta (la base admite de 10 a 900 s).
    const TIEMPOS = [10, 20, 30, 60, 90, 120];
    const TIEMPO_POR_OMISION = 20;
    const PUNTOS_MAX = 1000;
    // Las preguntas sin tablero van con la posición inicial: questions.fen no puede ir vacío.
    const FEN_INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    // La regla, escrita una sola vez: se le muestra al profe tal cual.
    const REGLA = "Respuesta correcta: de 500 a 1000 puntos, más cuanto antes se conteste. Incorrecta o sin contestar: 0.";

    // La dificultad de un cuestionario (cuestionarios.nivel). El color nunca va solo: va el nombre.
    const NIVELES = [
        { id: "inicial", nombre: "Inicial", emoji: "🟢" },
        { id: "intermedio", nombre: "Intermedio", emoji: "🟡" },
        { id: "avanzado", nombre: "Avanzado", emoji: "🔴" },
    ];
    function nombreNivel(id) {
        const n = NIVELES.find((x) => x.id === id);
        return n ? n.nombre : "Sin nivel";
    }
    function letra(k) { return "ABCDEF".charAt(k); }
    function textoTiempo(s) {
        const m = Math.floor(s / 60), r = s % 60;
        const partes = [];
        if (m) partes.push(m + (m === 1 ? " minuto" : " minutos"));
        if (r) partes.push(r + (r === 1 ? " segundo" : " segundos"));
        return partes.join(" y ");
    }

    function preguntaVacia() {
        return { texto: "", opciones: ["", "", "", ""], correcta: null, tiempo: TIEMPO_POR_OMISION, fen: null };
    }

    /* La pregunta como se juega: las opciones escritas, sin huecos, y la
       correcta renumerada (si la 2 quedó vacía, la 3 pasa a ser la segunda). */
    function limpiar(p) {
        const opciones = [];
        let correcta = null;
        (p.opciones || []).slice(0, MAX_OPCIONES).forEach((o, i) => {
            const t = String(o || "").trim();
            if (!t) return;
            if (p.correcta === i) correcta = opciones.length;
            opciones.push(t.slice(0, LARGO_OPCION));
        });
        const tiempo = TIEMPOS.includes(Number(p.tiempo)) ? Number(p.tiempo) : TIEMPO_POR_OMISION;
        return { texto: String(p.texto || "").trim().slice(0, LARGO_TEXTO), opciones, correcta, tiempo, fen: p.fen || null };
    }

    /* Lo que le falta para poder jugarse, dicho: una lista vacía es que está
       listo. Una posición que chess.js no acepta no se juega. */
    function problemas(c) {
        const out = [];
        if (!String((c && c.titulo) || "").trim()) out.push("Ponle un título al cuestionario.");
        const ps = (c && c.preguntas) || [];
        if (!ps.length) out.push("Agrega al menos una pregunta.");
        if (ps.length > MAX_PREGUNTAS) out.push("Un cuestionario lleva hasta " + MAX_PREGUNTAS + " preguntas.");
        ps.forEach((p, i) => {
            const n = "Pregunta " + (i + 1) + ": ";
            const l = limpiar(p);
            if (!l.texto) out.push(n + "escribe la pregunta.");
            if (l.opciones.length < 2) out.push(n + "escribe al menos dos opciones.");
            if (p.correcta === null || p.correcta === undefined) out.push(n + "marca cuál es la opción correcta.");
            else if (l.correcta === null) out.push(n + "la opción que marcaste como correcta está vacía.");
            if (l.fen && typeof Chess !== "undefined") {
                const v = new Chess().validate_fen(l.fen);
                if (!v.valid) out.push(n + "la posición no es válida.");
            }
        });
        return out;
    }

    /* Los puntos de una respuesta: acertar da de 500 a 1000, según cuánto se
       tardó de los segundos que había. `segundos` sale de las horas que pone
       la base (la de la pregunta y la de la respuesta), no del alumno. */
    function puntos(correcta, segundos, limite) {
        if (correcta !== true) return 0;
        const t = Math.min(Math.max(Number(segundos) || 0, 0), limite);
        return Math.round(PUNTOS_MAX * (1 - (limite ? t / limite : 0) / 2));
    }

    // Segundos que tardó: desde que la base creó la pregunta hasta su última respuesta.
    function segundosDe(respuesta, pregunta) {
        const fin = new Date(respuesta.updated_at || respuesta.created_at).getTime();
        const inicio = new Date(pregunta.created_at).getTime();
        return isFinite(fin) && isFinite(inicio) ? (fin - inicio) / 1000 : Infinity;
    }

    /* Suma una pregunta a los totales ({id: {id, nombre, puntos, buenas}}).
       Devuelve {id: puntos de esta pregunta}. `nombres` es {id: nombre}. */
    function sumar(totales, respuestas, pregunta, nombres) {
        const deEsta = {};
        (respuestas || []).forEach((a) => {
            const x = totales[a.student_id] = totales[a.student_id]
                || { id: a.student_id, nombre: (nombres || {})[a.student_id] || "Alumno", puntos: 0, buenas: 0 };
            const p = puntos(a.is_correct, segundosDe(a, pregunta), pregunta.tiempo_limite);
            x.puntos += p;
            if (a.is_correct === true) x.buenas += 1;
            deEsta[a.student_id] = p;
        });
        return deEsta;
    }

    /* Ordenados de más a menos, con puesto compartido en el empate
       («1.º, 1.º, 3.º»): nadie queda segundo por el orden alfabético. */
    function ranking(totales) {
        const lista = Object.values(totales || {}).map((x) => Object.assign({}, x))
            .sort((a, b) => b.puntos - a.puntos || String(a.nombre).localeCompare(String(b.nombre)));
        let puesto = 0, anterior = null;
        lista.forEach((x, i) => { if (x.puntos !== anterior) { puesto = i + 1; anterior = x.puntos; } x.puesto = puesto; });
        return lista;
    }

    // Lo que lee el alumno arriba de las opciones.
    function enunciado(i, total, texto) {
        return "🎯 Pregunta " + (i + 1) + " de " + total + ": " + String(texto || "").trim();
    }

    // La foto del podio que ve la clase (game_state.podio), con su título.
    function podio(lista, conNombres, titulo) {
        return {
            at: new Date().toISOString(), con_nombres: !!conNombres, titulo,
            lineas: (lista || []).filter((x) => x.puntos > 0).slice(0, 100)
                .map((x) => ({ id: x.id, nombre: conNombres ? x.nombre : null, puntos: x.puntos, puesto: x.puesto })),
        };
    }

    return {
        MAX_PREGUNTAS, MAX_OPCIONES, LARGO_TITULO, LARGO_TEXTO, LARGO_OPCION, TIEMPOS, TIEMPO_POR_OMISION, FEN_INICIAL, REGLA,
        NIVELES, nombreNivel, letra, textoTiempo,
        preguntaVacia, limpiar, problemas, puntos, segundosDe, sumar, ranking, enunciado, podio,
    };
})();


/* ---------- El armador ---------- */

let cuestionarios = [];            // los que se ven: los propios y los listos [{id, titulo, nivel, listo, preguntas}]
let cuestionarioEditado = null;    // el propio que se está editando: {id|null, titulo, nivel, preguntas}
let cuestionarioListo = null;      // el listo que se está mirando
let cuestionariosCargados = false;

// Lo que cada pantalla pone de lo suyo.
const CQ = {
    // La posición para una pregunta: la del tablero en la clase; afuera, la que se pegue.
    posicion: async () => null,
    textoPosicion: { usar: "Usar una posición", cambiar: "Cambiar la posición" },
    estado: () => {},
    pintarLista: () => {},
    accionesListo: () => {},
    alBorrar: () => {},
    enJuego: () => false,
};

const CQ_BOTON = "text-xs font-semibold px-3 py-2 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
const CQ_CAMPO = "w-full text-xs bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 text-brand-700 dark:text-brand-200 focus:outline-none focus:ring-2 focus:ring-accent-500";

function cqAviso(texto) {
    const el = document.getElementById("cuestionario-aviso");
    if (el) el.textContent = texto || "";
}

/* Trae los propios y los listos: la RLS de `cuestionarios` deja ver los del
   profe y los listos de la Academia (a quien da clase o administra), nada más. */
async function cargarCuestionarios() {
    const { data, error } = await sb.from("cuestionarios").select("id, titulo, nivel, listo, material, preguntas, updated_at")
        .order("updated_at", { ascending: false }).range(0, 299);
    if (error) { console.error(error); cqAviso("No se pudieron traer los cuestionarios: " + error.message); return; }
    cuestionarios = data || [];
    cuestionariosCargados = true;
    CQ.pintarLista();
}

const cqMios = () => cuestionarios.filter((c) => !c.listo);
/* Los listos de un material de clase no tienen nivel (los del taller de
   asesores, por ejemplo): van en su propio grupo, con el nombre de acá. Sin
   esto no salían en ningún grupo, ni en la clase ni en Cuestionarios. La RLS
   ya decide quién los ve (puede_bajar: administración, quien lo compró y a
   quien se lo compartieron). */
const CQ_MATERIALES = [{ material: "formacion-ajedrez", nombre: "Asesores", emoji: "⚖️" }];
const cqDelMaterial = (material) => cuestionarios.filter((c) => c.listo && c.material === material)
    .sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), "es", { numeric: true }));
// Los listos, ordenados por nivel y por título.
const cqListos = (nivel) => cuestionarios.filter((c) => c.listo && (!nivel || c.nivel === nivel))
    .sort((a, b) => Cuestionario.NIVELES.findIndex((n) => n.id === a.nivel) - Cuestionario.NIVELES.findIndex((n) => n.id === b.nivel)
        || String(a.titulo).localeCompare(String(b.titulo)));

function cqCuantas(c) {
    const n = (c.preguntas || []).length;
    return n + (n === 1 ? " pregunta" : " preguntas");
}

/* Abrir uno: el propio se edita; uno listo se mira (es de la Academia: para
   cambiarlo se copia). null es uno nuevo. */
function editarCuestionario(c) {
    cqAviso("");
    if (c && c.listo) {
        cuestionarioEditado = null;
        cuestionarioListo = c;
        pintarEditorDeCuestionario();
        pintarCuestionarioListo();
        return;
    }
    cuestionarioListo = null;
    cuestionarioEditado = c
        ? { id: c.id, titulo: c.titulo, nivel: c.nivel || "", preguntas: (c.preguntas || []).map((p) => Object.assign(Cuestionario.preguntaVacia(), p, {
            opciones: [0, 1, 2, 3].map((k) => (p.opciones || [])[k] || "") })) }
        : { id: null, titulo: "", nivel: "", preguntas: [Cuestionario.preguntaVacia()] };
    pintarCuestionarioListo();
    pintarEditorDeCuestionario();
}

function pintarCuestionarioListo() {
    const caja = document.getElementById("cuestionario-listo");
    if (!caja) return;
    const c = cuestionarioListo;
    caja.hidden = !c || CQ.enJuego();
    caja.innerHTML = "";
    if (!c) return;
    const h = document.createElement("p");
    h.className = "text-sm font-semibold text-brand-800 dark:text-brand-100";
    h.textContent = c.titulo;
    const sub = document.createElement("p");
    sub.className = "text-xs text-brand-500 dark:text-brand-300";
    sub.textContent = "Listo de la Academia · " + Cuestionario.nombreNivel(c.nivel) + " · " + cqCuantas(c)
        + ". Para cambiarle algo, cópialo a tus cuestionarios.";
    caja.append(h, sub);
    const botones = document.createElement("div");
    botones.className = "flex flex-wrap gap-2";
    const copiar = document.createElement("button");
    copiar.type = "button";
    copiar.className = CQ_BOTON;
    copiar.textContent = "📋 Copiarlo a mis cuestionarios";
    copiar.addEventListener("click", () => copiarCuestionario(c));
    botones.appendChild(copiar);
    CQ.accionesListo(c, botones);
    caja.appendChild(botones);
    const det = document.createElement("details");
    const sum = document.createElement("summary");
    sum.className = "cursor-pointer text-xs font-semibold text-brand-700 dark:text-brand-200";
    sum.textContent = "Ver las preguntas y sus respuestas";
    det.appendChild(sum);
    const ol = document.createElement("ol");
    ol.className = "mt-2 space-y-2 text-xs text-brand-700 dark:text-brand-200 list-decimal pl-5";
    (c.preguntas || []).forEach((p) => {
        const li = document.createElement("li");
        const t = document.createElement("p");
        t.className = "font-semibold";
        t.textContent = p.texto;
        const ul = document.createElement("ul");
        (p.opciones || []).forEach((o, k) => {
            const op = document.createElement("li");
            // La correcta va ESCRITA, no solo marcada con un color.
            op.textContent = Cuestionario.letra(k) + ". " + o + (k === p.correcta ? " ✓ (la correcta)" : "");
            if (k === p.correcta) op.className = "font-semibold";
            ul.appendChild(op);
        });
        li.append(t, ul);
        ol.appendChild(li);
    });
    det.appendChild(ol);
    caja.appendChild(det);
}

// La copia es del profe: la puede cambiar, y la original queda igual para los demás.
async function copiarCuestionario(c) {
    cuestionarioListo = null;
    pintarCuestionarioListo();
    cuestionarioEditado = { id: null, titulo: (String(c.titulo) + " (copia)").slice(0, Cuestionario.LARGO_TITULO), nivel: c.nivel || "",
        preguntas: (c.preguntas || []).map((p) => Object.assign(Cuestionario.preguntaVacia(), JSON.parse(JSON.stringify(p)), {
            opciones: [0, 1, 2, 3].map((k) => (p.opciones || [])[k] || "") })) };
    pintarEditorDeCuestionario();
    const guardado = await guardarCuestionario();
    if (guardado) cqAviso("📋 Copiado a tus cuestionarios: ya lo puedes cambiar.");
}

function pintarEditorDeCuestionario() {
    const ed = document.getElementById("cuestionario-editor");
    ed.hidden = !cuestionarioEditado || CQ.enJuego();
    if (!cuestionarioEditado) return;
    const titulo = document.getElementById("cuestionario-titulo");
    titulo.value = cuestionarioEditado.titulo;
    document.getElementById("cuestionario-nivel").value = cuestionarioEditado.nivel || "";
    document.getElementById("cuestionario-borrar-btn").hidden = !cuestionarioEditado.id;
    const lista = document.getElementById("cuestionario-preguntas");
    lista.innerHTML = "";
    const ps = cuestionarioEditado.preguntas;
    ps.forEach((p, i) => lista.appendChild(tarjetaDePregunta(p, i, ps.length)));
    document.getElementById("cuestionario-agregar-btn").disabled = ps.length >= Cuestionario.MAX_PREGUNTAS;
}

function tarjetaDePregunta(p, i, total) {
    const n = i + 1;
    const li = document.createElement("li");
    li.className = "rounded-lg border border-brand-100 dark:border-brand-800 p-2 space-y-1.5";
    const h = document.createElement("p");
    h.className = "text-xs font-semibold text-brand-700 dark:text-brand-200";
    h.textContent = "Pregunta " + n;
    li.appendChild(h);

    const texto = document.createElement("textarea");
    texto.id = "cq-texto-" + i;
    texto.rows = 2;
    texto.maxLength = Cuestionario.LARGO_TEXTO;
    texto.className = CQ_CAMPO;
    texto.placeholder = "¿Qué pieza puede saltar sobre las demás?";
    texto.setAttribute("aria-label", "Pregunta " + n + ": lo que se pregunta");
    texto.value = p.texto;
    texto.addEventListener("input", () => { p.texto = texto.value; });
    li.appendChild(texto);

    for (let k = 0; k < Cuestionario.MAX_OPCIONES; k++) {
        const letra = Cuestionario.letra(k);
        const fila = document.createElement("div");
        fila.className = "flex items-center gap-2";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "cq-correcta-" + i;
        radio.checked = p.correcta === k;
        radio.className = "accent-accent-500";
        radio.setAttribute("aria-label", "Pregunta " + n + ": la opción " + letra + " es la correcta");
        radio.addEventListener("change", () => { if (radio.checked) p.correcta = k; });
        const et = document.createElement("span");
        et.className = "text-xs font-semibold text-brand-600 dark:text-brand-300 w-4";
        et.setAttribute("aria-hidden", "true");
        et.textContent = letra;
        const op = document.createElement("input");
        op.type = "text";
        op.maxLength = Cuestionario.LARGO_OPCION;
        op.className = CQ_CAMPO + " flex-1";
        op.placeholder = k < 2 ? "Opción " + letra : "Opción " + letra + " (si quieres)";
        op.setAttribute("aria-label", "Pregunta " + n + ": opción " + letra);
        op.value = p.opciones[k] || "";
        op.addEventListener("input", () => { p.opciones[k] = op.value; });
        fila.append(radio, et, op);
        li.appendChild(fila);
    }
    const nota = document.createElement("p");
    nota.className = "text-xs text-brand-450 dark:text-brand-350";
    nota.textContent = "Marca con el círculo la opción correcta.";
    li.appendChild(nota);

    const abajo = document.createElement("div");
    abajo.className = "flex flex-wrap items-center gap-2";
    const lt = document.createElement("label");
    lt.className = "text-xs text-brand-700 dark:text-brand-200 flex items-center gap-1";
    lt.textContent = "Tiempo: ";
    const sel = document.createElement("select");
    sel.className = "text-xs bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1 text-brand-700 dark:text-brand-200";
    sel.setAttribute("aria-label", "Pregunta " + n + ": tiempo para contestar");
    Cuestionario.TIEMPOS.forEach((s) => {
        const o = document.createElement("option");
        o.value = String(s);
        o.textContent = Cuestionario.textoTiempo(s);
        sel.appendChild(o);
    });
    sel.value = String(p.tiempo);
    sel.addEventListener("change", () => { p.tiempo = Number(sel.value); });
    lt.appendChild(sel);
    abajo.appendChild(lt);
    li.appendChild(abajo);

    // La posición: la del tablero de la clase al tocar el botón, o la que se pegue (FEN) fuera de la clase.
    const pos = document.createElement("div");
    pos.className = "flex flex-wrap items-center gap-2";
    const dice = document.createElement("p");
    dice.className = "text-xs text-brand-600 dark:text-brand-300";
    dice.textContent = p.fen ? "Con posición: la clase la ve en el tablero." : "Sin tablero: solo el texto y las opciones.";
    const usar = document.createElement("button");
    usar.type = "button";
    usar.className = CQ_BOTON;
    usar.textContent = "📌 " + (p.fen ? CQ.textoPosicion.cambiar : CQ.textoPosicion.usar);
    usar.setAttribute("aria-label", "Pregunta " + n + ": " + usar.textContent.replace(/^📌 /, ""));
    usar.addEventListener("click", async () => {
        const fen = await CQ.posicion(p.fen);
        if (!fen) return;
        // La misma regla de la clase en vivo (js/posicion-valida.js): una posición rota
        // guardada acá no daría ningún error hasta mandarla al tablero, delante de todos.
        const motivo = PosicionValida.motivo(fen);
        if (motivo) { cqAviso(motivo); return; }
        p.fen = fen;
        pintarEditorDeCuestionario();
        cqAviso("La pregunta " + n + " ya lleva su posición.");
    });
    pos.append(dice, usar);
    if (p.fen) {
        const quitar = document.createElement("button");
        quitar.type = "button";
        quitar.className = CQ_BOTON;
        quitar.textContent = "Quitar la posición";
        quitar.setAttribute("aria-label", "Pregunta " + n + ": quitar la posición");
        quitar.addEventListener("click", () => { p.fen = null; pintarEditorDeCuestionario(); });
        pos.appendChild(quitar);
    }
    li.appendChild(pos);

    const orden = document.createElement("div");
    orden.className = "flex flex-wrap gap-2";
    const mover = (texto, etiqueta, deshabilitado, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = CQ_BOTON;
        b.textContent = texto;
        b.setAttribute("aria-label", etiqueta);
        b.disabled = deshabilitado;
        b.addEventListener("click", fn);
        orden.appendChild(b);
    };
    const ps = cuestionarioEditado.preguntas;
    mover("↑ Subir", "Subir la pregunta " + n, i === 0, () => { [ps[i - 1], ps[i]] = [ps[i], ps[i - 1]]; pintarEditorDeCuestionario(); });
    mover("↓ Bajar", "Bajar la pregunta " + n, i === total - 1, () => { [ps[i + 1], ps[i]] = [ps[i], ps[i + 1]]; pintarEditorDeCuestionario(); });
    mover("Quitar", "Quitar la pregunta " + n, total === 1, () => { ps.splice(i, 1); pintarEditorDeCuestionario(); });
    li.appendChild(orden);
    return li;
}

async function guardarCuestionario() {
    const c = cuestionarioEditado;
    if (!c) return null;
    c.titulo = document.getElementById("cuestionario-titulo").value.trim().slice(0, Cuestionario.LARGO_TITULO);
    const faltan = Cuestionario.problemas(c);
    if (faltan.length) { cqAviso(faltan[0]); CQ.estado(faltan[0]); return null; }
    c.nivel = document.getElementById("cuestionario-nivel").value;
    const fila = { titulo: c.titulo, nivel: c.nivel || null, preguntas: c.preguntas.map(Cuestionario.limpiar), updated_at: new Date().toISOString() };
    const pedido = c.id
        ? sb.from("cuestionarios").update(fila).eq("id", c.id).select().single()
        : sb.from("cuestionarios").insert(Object.assign({ profesor_id: session.user.id }, fila)).select().single();
    const { data, error } = await pedido;
    if (error) { console.error(error); cqAviso("No se pudo guardar: " + error.message); return null; }
    c.id = (data && data.id) || c.id;
    await cargarCuestionarios();
    cqAviso("💾 Guardado: «" + c.titulo + "».");
    return c;
}

async function borrarCuestionario() {
    const c = cuestionarioEditado;
    if (!c || !c.id) return;
    const ok = await Avisos.confirmar("Se borra con todas sus preguntas y no se puede deshacer. Lo que ya se jugó en clase no se pierde.",
        { titulo: "¿Borrar «" + c.titulo + "»?", aceptar: "Borrar el cuestionario", peligro: true });
    if (!ok) return;
    const { error } = await sb.from("cuestionarios").delete().eq("id", c.id);
    if (error) { console.error(error); cqAviso("No se pudo borrar: " + error.message); return; }
    cuestionarioEditado = null;
    document.getElementById("cuestionario-editor").hidden = true;
    await cargarCuestionarios();
    CQ.alBorrar();
    cqAviso("🗑️ Cuestionario borrado.");
}

// Los botones del armador, iguales en las dos pantallas.
function montarArmador() {
    document.getElementById("cuestionario-agregar-btn").addEventListener("click", () => {
        if (!cuestionarioEditado || cuestionarioEditado.preguntas.length >= Cuestionario.MAX_PREGUNTAS) return;
        cuestionarioEditado.preguntas.push(Cuestionario.preguntaVacia());
        pintarEditorDeCuestionario();
        document.getElementById("cq-texto-" + (cuestionarioEditado.preguntas.length - 1)).focus();
    });
    document.getElementById("cuestionario-titulo").addEventListener("input", (e) => {
        if (cuestionarioEditado) cuestionarioEditado.titulo = e.target.value;
    });
    // Se guarda al elegirlo: el armador se vuelve a pintar (al poner una posición,
    // al mover una pregunta) y lo pintaría con el de antes.
    document.getElementById("cuestionario-nivel").addEventListener("change", (e) => {
        if (cuestionarioEditado) cuestionarioEditado.nivel = e.target.value;
    });
    document.getElementById("cuestionario-guardar-btn").addEventListener("click", guardarCuestionario);
    document.getElementById("cuestionario-borrar-btn").addEventListener("click", borrarCuestionario);
}
