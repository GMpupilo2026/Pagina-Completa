/* El código de sesion.html.

   El cuestionario al estilo Kahoot: el profe arma (y guarda) una lista de
   preguntas con opciones, cada una con su correcta y su tiempo, y la juega
   con la clase. Cada pregunta es una de opciones de las de siempre
   (hacer_pregunta_de_opciones: la correcta va aparte y la base califica
   sola); los puntos premian acertar y hacerlo rápido, y después de cada
   pregunta la clase ve qué contestó el grupo y cómo va el podio. Ver «El
   cuestionario» en docs/decisiones/clase-en-vivo.md.

   Como las demás partes de la clase (ver «sesion.js en partes»), es un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js (board, sb,
   session, aplicarPosicionEnClase, setStatus…) solo dentro de funciones. La
   parte que no toca la página (Cuestionario) es pura, para probarla sola. */

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
        preguntaVacia, limpiar, problemas, puntos, segundosDe, sumar, ranking, enunciado, podio,
    };
})();

/* ---------- La página ---------- */

let cuestionarios = [];            // los guardados del profe: [{id, titulo, preguntas, updated_at}]
let cuestionarioEditado = null;    // {id|null, titulo, preguntas}
let cuestionarioEnJuego = null;    // {c, i, q, inicio, fin, fase, totales, nombres, tic, contadas}
let cuestionariosCargados = false;

const CQ_BOTON = "text-xs font-semibold px-3 py-2 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
const CQ_BOTON_FUERTE = "text-xs font-semibold px-3 py-2 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
const CQ_CAMPO = "w-full text-xs bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-700 rounded-lg px-2 py-1.5 text-brand-700 dark:text-brand-200 focus:outline-none focus:ring-2 focus:ring-accent-500";

function cqAviso(texto) {
    const el = document.getElementById("cuestionario-aviso");
    if (el) el.textContent = texto || "";
}

async function cargarCuestionarios() {
    const { data, error } = await sb.from("cuestionarios").select("id, titulo, preguntas, updated_at")
        .eq("profesor_id", session.user.id).order("updated_at", { ascending: false }).range(0, 199);
    if (error) { console.error(error); cqAviso("No se pudieron traer tus cuestionarios: " + error.message); return; }
    cuestionarios = data || [];
    cuestionariosCargados = true;
    pintarListaDeCuestionarios();
}

function pintarListaDeCuestionarios() {
    const sel = document.getElementById("cuestionario-select");
    const antes = cuestionarioEditado && cuestionarioEditado.id;
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = cuestionarios.length ? "Elige uno de tus cuestionarios…" : "Todavía no tienes cuestionarios";
    sel.appendChild(o0);
    cuestionarios.forEach((c) => {
        const o = document.createElement("option");
        o.value = c.id;
        const n = (c.preguntas || []).length;
        o.textContent = String(c.titulo) + " (" + n + (n === 1 ? " pregunta)" : " preguntas)");   // textContent: lo escribió el profe
        sel.appendChild(o);
    });
    sel.value = antes && cuestionarios.some((c) => c.id === antes) ? antes : "";
}

function editarCuestionario(c) {
    cuestionarioEditado = c
        ? { id: c.id, titulo: c.titulo, preguntas: (c.preguntas || []).map((p) => Object.assign(Cuestionario.preguntaVacia(), p, {
            opciones: [0, 1, 2, 3].map((k) => (p.opciones || [])[k] || "") })) }
        : { id: null, titulo: "", preguntas: [Cuestionario.preguntaVacia()] };
    cqAviso("");
    pintarEditorDeCuestionario();
}

function pintarEditorDeCuestionario() {
    const ed = document.getElementById("cuestionario-editor");
    ed.hidden = !cuestionarioEditado || !!cuestionarioEnJuego;
    if (!cuestionarioEditado) return;
    const titulo = document.getElementById("cuestionario-titulo");
    titulo.value = cuestionarioEditado.titulo;
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
        const letra = CuadroComandos.letra(k);
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
        o.textContent = PreguntaClase.textoDeTiempo(s);
        sel.appendChild(o);
    });
    sel.value = String(p.tiempo);
    sel.addEventListener("change", () => { p.tiempo = Number(sel.value); });
    lt.appendChild(sel);
    abajo.appendChild(lt);
    li.appendChild(abajo);

    // La posición: la del tablero de la clase en el momento de tocar el botón.
    const pos = document.createElement("div");
    pos.className = "flex flex-wrap items-center gap-2";
    const dice = document.createElement("p");
    dice.className = "text-xs text-brand-600 dark:text-brand-300";
    dice.textContent = p.fen ? "Con posición: la clase la ve en el tablero." : "Sin tablero: solo el texto y las opciones.";
    const usar = document.createElement("button");
    usar.type = "button";
    usar.className = CQ_BOTON;
    usar.textContent = p.fen ? "📌 Cambiarla por la del tablero de ahora" : "📌 Usar la posición del tablero de ahora";
    usar.setAttribute("aria-label", "Pregunta " + n + ": " + usar.textContent.replace(/^📌 /, ""));
    usar.addEventListener("click", () => {
        const fen = board.fen();
        const motivo = motivoPosicionInvalida(fen);
        if (motivo) { cqAviso(motivo); return; }
        p.fen = fen;
        pintarEditorDeCuestionario();
        cqAviso("La pregunta " + n + " ya lleva la posición del tablero.");
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
    if (faltan.length) { cqAviso(faltan[0]); setStatus(faltan[0]); return null; }
    const fila = { titulo: c.titulo, preguntas: c.preguntas.map(Cuestionario.limpiar), updated_at: new Date().toISOString() };
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
    cqAviso("🗑️ Cuestionario borrado.");
}

/* ---------- Jugarlo con la clase ---------- */

async function jugarCuestionario() {
    if (cuestionarioEnJuego) { setStatus("Ya hay un cuestionario en juego: termínalo antes de empezar otro."); return; }
    if (ronda) { setStatus("Hay una ronda rápida en curso: termínala antes de empezar el cuestionario."); return; }
    if (partidaClase) { setStatus("Hay una partida de la clase en curso: termínala antes de empezar el cuestionario."); return; }
    // Se guarda antes: lo que se juega es lo que quedó guardado (y así se revisa lo que falta).
    const c = await guardarCuestionario();
    if (!c) return;
    cuestionarioEnJuego = { c: { titulo: c.titulo, preguntas: c.preguntas.map(Cuestionario.limpiar) }, i: -1, q: null,
        fase: null, totales: {}, nombres: {}, tic: null, contadas: 0, ultimas: {} };
    document.getElementById("cuestionario-editor").hidden = true;
    document.getElementById("cuestionario-elegir").hidden = true;
    document.getElementById("cuestionario-juego").hidden = false;
    document.getElementById("cuestionario-ranking").innerHTML = "";
    await siguienteDelCuestionario();
}

function pintarJuego(estado) {
    const j = cuestionarioEnJuego;
    if (!j) return;
    if (estado !== undefined) document.getElementById("cuestionario-estado").textContent = estado;
    const n = j.c.preguntas.length;
    document.getElementById("cuestionario-cerrar-btn").hidden = j.fase !== "contestando";
    const sig = document.getElementById("cuestionario-siguiente-btn");
    sig.hidden = j.fase !== "resultados";
    sig.textContent = j.i + 1 >= n ? "🏆 Terminar y mostrar el podio final" : "➡️ Siguiente pregunta";
}

async function siguienteDelCuestionario() {
    const j = cuestionarioEnJuego;
    if (!j) return;
    j.i += 1;
    const n = j.c.preguntas.length;
    if (j.i >= n) { await terminarCuestionario(); return; }
    const p = j.c.preguntas[j.i];
    // El podio de la pregunta anterior se quita: ahora se contesta.
    if (j.i > 0) await sb.from("game_state").update({ podio: null }).eq("id", myGameStateId);
    if (p.fen && !(await aplicarPosicionEnClase(p.fen))) {
        await terminarCuestionario("La posición de la pregunta " + (j.i + 1) + " no se pudo mandar: el cuestionario terminó.");
        return;
    }
    const { data, error } = await sb.rpc("hacer_pregunta_de_opciones", {
        p_fen: p.fen || Cuestionario.FEN_INICIAL, p_prompt: Cuestionario.enunciado(j.i, n, p.texto), p_opciones: p.opciones,
        p_correcta: p.correcta, p_tiempo_limite: p.tiempo, p_sin_tablero: !p.fen,
    });
    const q = Array.isArray(data) ? data[0] : data;
    if (error || !q) { console.error(error); await terminarCuestionario("No se pudo abrir la pregunta: el cuestionario terminó."); return; }
    j.q = q;
    j.fase = "contestando";
    j.contadas = 0;
    // El plazo se cuenta con el reloj de ESTA computadora desde que llegó la pregunta: el de
    // la base puede estar corrido unos segundos. La base acepta hasta 5 s más: se esperan 6.
    j.inicio = Date.now();
    j.fin = j.inicio + q.tiempo_limite * 1000;
    clearInterval(j.tic);
    j.tic = setInterval(ticDelCuestionario, 1000);
    ticDelCuestionario();
}

async function ticDelCuestionario() {
    const j = cuestionarioEnJuego;
    if (!j || j.fase !== "contestando") return;
    const ahora = Date.now();
    if (ahora >= j.fin + 6000) { await revelarDelCuestionario(); return; }
    // Cuántos contestaron, cada dos segundos: cuenta sin traer filas.
    if (Math.floor((ahora - j.inicio) / 1000) % 2 === 0) {
        const id = j.q.id;
        const { count } = await sb.from("question_answers").select("id", { count: "exact", head: true }).eq("question_id", id);
        if (cuestionarioEnJuego === j && j.q.id === id && typeof count === "number") j.contadas = count;
    }
    if (cuestionarioEnJuego !== j || j.fase !== "contestando") return;
    const quedan = Math.max(0, Math.ceil((j.fin - Date.now()) / 1000));
    pintarJuego("🎯 Pregunta " + (j.i + 1) + " de " + j.c.preguntas.length + ": "
        + (quedan > 0 ? "quedan " + PreguntaClase.reloj(quedan) : "se acabó el tiempo, llegan las últimas respuestas…")
        + " · contestaron " + j.contadas + ".");
}

/* «Cerrar ya»: se acorta el plazo EN LA BASE (tiempo_limite), no solo en la
   pantalla: con la respuesta correcta a la vista, alguien podría cambiar la
   suya. La base no deja menos de 10 s. */
async function cerrarYaDelCuestionario() {
    const j = cuestionarioEnJuego;
    if (!j || j.fase !== "contestando") return;
    const pasaron = Math.ceil((Date.now() - j.inicio) / 1000);
    const nuevo = Math.max(10, pasaron);
    if (nuevo < j.q.tiempo_limite) {
        const { error } = await sb.from("questions").update({ tiempo_limite: nuevo }).eq("id", j.q.id);
        if (error) { console.error(error); setStatus("No se pudo cerrar antes: " + error.message); return; }
        j.q.tiempo_limite = nuevo;
        j.fin = j.inicio + nuevo * 1000;
    }
    pintarJuego("Cerrando: se esperan unos segundos a las respuestas que vienen en camino…");
    document.getElementById("cuestionario-cerrar-btn").hidden = true;
}

// Se acabó el tiempo: la clase ve qué contestó el grupo (y cuál era), se suman los puntos y va el podio.
async function revelarDelCuestionario() {
    const j = cuestionarioEnJuego;
    if (!j || j.fase !== "contestando") return;
    j.fase = "calculando";
    clearInterval(j.tic);
    const q = j.q;
    await sb.from("questions").update({ resultados_visibles: true }).eq("id", q.id);
    const { data: resp, error } = await sb.from("question_answers")
        .select("student_id, opcion, is_correct, created_at, updated_at").eq("question_id", q.id).range(0, 999);
    if (error) console.error(error);
    const nuevos = [...new Set((resp || []).map((a) => a.student_id))].filter((id) => !(id in j.nombres));
    if (nuevos.length) {
        const { data: perfiles } = await sb.from("profiles").select("id, full_name, email").in("id", nuevos);
        (perfiles || []).forEach((p) => { j.nombres[p.id] = p.full_name || p.email; });
    }
    if (cuestionarioEnJuego !== j) return;
    j.ultimas = Cuestionario.sumar(j.totales, resp || [], q, j.nombres);
    const buenas = (resp || []).filter((a) => a.is_correct === true).length;
    const n = j.c.preguntas.length;
    const final = j.i + 1 >= n;
    j.fase = "resultados";
    pintarRankingDelCuestionario();
    pintarJuego("Pregunta " + (j.i + 1) + " de " + n + ": " + buenas + " de " + (resp || []).length
        + ((resp || []).length === 1 ? " acertó." : " acertaron.") + " La clase ya ve qué contestó el grupo y el podio.");
    await mandarPodioDelCuestionario(final ? "🎯 Podio final de «" + j.c.titulo + "»"
        : "🎯 «" + j.c.titulo + "»: así van después de la " + (j.i + 1) + " de " + n);
}

function pintarRankingDelCuestionario() {
    const j = cuestionarioEnJuego;
    const caja = document.getElementById("cuestionario-ranking");
    caja.innerHTML = "";
    if (!j) return;
    const lista = Cuestionario.ranking(j.totales);
    if (!lista.length) { caja.textContent = "Todavía nadie contestó."; return; }
    const ol = document.createElement("ol");
    ol.className = "space-y-0.5";
    lista.slice(0, 5).forEach((x) => {
        const li = document.createElement("li");
        const esta = j.ultimas[x.id];
        // El nombre lo escribió una persona: textContent.
        li.textContent = (PuntosClase.medalla(x.puesto) ? PuntosClase.medalla(x.puesto) + " " : "") + x.puesto + ".º " + x.nombre
            + " — " + x.puntos + " puntos" + (esta !== undefined ? " (+" + esta + " en esta)" : " (no contestó esta)");
        ol.appendChild(li);
    });
    caja.appendChild(ol);
    if (lista.length > 5) {
        const p = document.createElement("p");
        p.className = "text-xs text-brand-450 dark:text-brand-350";
        p.textContent = "Y " + (lista.length - 5) + " más. Cada alumno ve su propio lugar.";
        caja.appendChild(p);
    }
}

async function mandarPodioDelCuestionario(titulo) {
    const j = cuestionarioEnJuego;
    if (!j) return;
    const cb = document.getElementById("podio-con-nombres");
    const podio = Cuestionario.podio(Cuestionario.ranking(j.totales), cb ? cb.checked : true, titulo);
    if (!podio.lineas.length) return;   // nadie sumó: un podio vacío no dice nada
    const { error } = await sb.from("game_state").update({ podio }).eq("id", myGameStateId);
    if (error) { console.error(error); setStatus("No se pudo mostrar el podio: " + error.message); return; }
    pintarPodio(podio);
}

async function terminarCuestionario(mensaje) {
    const j = cuestionarioEnJuego;
    if (!j) return;
    clearInterval(j.tic);
    const abierta = j.q && j.fase !== "terminado" ? j.q : null;
    const aMedias = j.fase === "contestando";
    j.fase = "terminado";
    if (abierta) await sb.from("questions").update({ closed_at: new Date().toISOString() }).eq("id", abierta.id);
    // Terminado antes de tiempo, el podio final es el de lo que se alcanzó a contar
    // (la pregunta que se estaba contestando no suma: no se llegó a ver cuál era).
    await mandarPodioDelCuestionario("🎯 Podio final de «" + j.c.titulo + "»");
    const hechas = Math.min(j.i + (aMedias ? 0 : 1), j.c.preguntas.length);
    cuestionarioEnJuego = null;
    document.getElementById("cuestionario-juego").hidden = true;
    document.getElementById("cuestionario-elegir").hidden = false;
    document.getElementById("cuestionario-editor").hidden = !cuestionarioEditado;
    const fin = document.getElementById("cuestionario-final");
    fin.innerHTML = "";
    const lista = Cuestionario.ranking(j.totales);
    const t = document.createElement("p");
    t.className = "font-semibold text-brand-800 dark:text-brand-100";
    t.textContent = "Resultado de «" + j.c.titulo + "» (" + hechas + (hechas === 1 ? " pregunta)" : " preguntas)");
    fin.appendChild(t);
    const ol = document.createElement("ol");
    ol.className = "mt-1 space-y-0.5";
    lista.forEach((x) => {
        const li = document.createElement("li");
        li.textContent = (PuntosClase.medalla(x.puesto) ? PuntosClase.medalla(x.puesto) + " " : "") + x.puesto + ".º " + x.nombre
            + " — " + x.puntos + " puntos, " + x.buenas + (x.buenas === 1 ? " buena" : " buenas");
        ol.appendChild(li);
    });
    if (!lista.length) { const p = document.createElement("p"); p.textContent = "Nadie contestó."; fin.appendChild(p); }
    else fin.appendChild(ol);
    fin.hidden = false;
    setStatus(mensaje || "🎯 Terminó el cuestionario «" + j.c.titulo + "».");
}

if (document.getElementById("cuestionario-caja")) {
    document.getElementById("cuestionario-regla").textContent = Cuestionario.REGLA;
    document.getElementById("cuestionario-caja").addEventListener("toggle", (e) => {
        if (e.target.open && !cuestionariosCargados) cargarCuestionarios();
    });
    document.getElementById("cuestionario-select").addEventListener("change", (e) => {
        const c = cuestionarios.find((x) => x.id === e.target.value);
        if (c) editarCuestionario(c);
    });
    document.getElementById("cuestionario-nuevo-btn").addEventListener("click", () => {
        document.getElementById("cuestionario-select").value = "";
        editarCuestionario(null);
        document.getElementById("cuestionario-titulo").focus();
    });
    document.getElementById("cuestionario-agregar-btn").addEventListener("click", () => {
        if (!cuestionarioEditado || cuestionarioEditado.preguntas.length >= Cuestionario.MAX_PREGUNTAS) return;
        cuestionarioEditado.preguntas.push(Cuestionario.preguntaVacia());
        pintarEditorDeCuestionario();
        document.getElementById("cq-texto-" + (cuestionarioEditado.preguntas.length - 1)).focus();
    });
    document.getElementById("cuestionario-titulo").addEventListener("input", (e) => {
        if (cuestionarioEditado) cuestionarioEditado.titulo = e.target.value;
    });
    document.getElementById("cuestionario-guardar-btn").addEventListener("click", guardarCuestionario);
    document.getElementById("cuestionario-borrar-btn").addEventListener("click", borrarCuestionario);
    document.getElementById("cuestionario-jugar-btn").addEventListener("click", jugarCuestionario);
    document.getElementById("cuestionario-cerrar-btn").addEventListener("click", cerrarYaDelCuestionario);
    document.getElementById("cuestionario-siguiente-btn").addEventListener("click", siguienteDelCuestionario);
    document.getElementById("cuestionario-terminar-btn").addEventListener("click", () => terminarCuestionario());
}
