/* El código de sesion.html.

   El cuestionario al estilo Kahoot, jugado con la clase: cada pregunta es una
   de opciones de las de siempre (hacer_pregunta_de_opciones: la correcta va
   aparte y la base califica sola); los puntos premian acertar y hacerlo
   rápido, y después de cada pregunta la clase ve qué contestó el grupo y cómo
   va el podio. Armarlos es de js/cuestionario-editor.js, que comparte con
   cuestionarios.html. Ver «El cuestionario al estilo Kahoot» en
   docs/decisiones/clase-en-vivo.md.

   Como las demás partes de la clase (ver «sesion.js en partes»), es un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js (board, sb,
   session, aplicarPosicionEnClase, setStatus…) solo dentro de funciones. */

let cuestionarioEnJuego = null;    // {c, i, q, inicio, fin, fase, totales, nombres, tic, contadas}

/* ---------- Jugarlo con la clase ---------- */

/* `listo`: uno de la Academia, que se juega tal cual. Sin él se juega el que
   se está editando, y se guarda antes: lo que se juega es lo que quedó
   guardado (y así se revisa lo que falta). */
async function jugarCuestionario(listo) {
    if (cuestionarioEnJuego) { setStatus("Ya hay un cuestionario en juego: termínalo antes de empezar otro."); return; }
    if (ronda) { setStatus("Hay una ronda rápida en curso: termínala antes de empezar el cuestionario."); return; }
    if (partidaClase) { setStatus("Hay una partida de la clase en curso: termínala antes de empezar el cuestionario."); return; }
    const c = listo || await guardarCuestionario();
    if (!c) return;
    cuestionarioEnJuego = { c: { titulo: c.titulo, preguntas: c.preguntas.map(Cuestionario.limpiar) }, i: -1, q: null,
        fase: null, totales: {}, nombres: {}, tic: null, contadas: 0, ultimas: {} };
    document.getElementById("cuestionario-editor").hidden = true;
    document.getElementById("cuestionario-listo").hidden = true;
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
        // Elegida una opción, no se puede cambiar: ver «El cuestionario al estilo
        // Kahoot» en docs/decisiones/clase-en-vivo.md.
        p_bloquea_cambio: true,
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
    pintarCuestionarioListo();
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

/* ---------- La lista de la clase y lo que la clase le pone al armador ---------- */

// Los propios arriba; los listos, agrupados por nivel.
function pintarListaDeCuestionarios() {
    const sel = document.getElementById("cuestionario-select");
    const antes = (cuestionarioEditado && cuestionarioEditado.id) || (cuestionarioListo && cuestionarioListo.id);
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "Elige un cuestionario…";
    sel.appendChild(o0);
    const grupo = (nombre, lista) => {
        if (!lista.length) return;
        const g = document.createElement("optgroup");
        g.label = nombre;
        lista.forEach((c) => {
            const o = document.createElement("option");
            o.value = c.id;
            o.textContent = String(c.titulo) + " (" + cqCuantas(c) + ")";   // textContent: lo escribió el profe
            g.appendChild(o);
        });
        sel.appendChild(g);
    };
    grupo("Tus cuestionarios", cqMios());
    Cuestionario.NIVELES.forEach((n) => grupo("Listos · " + n.nombre, cqListos(n.id)));
    sel.value = antes && cuestionarios.some((c) => c.id === antes) ? antes : "";
}

CQ.posicion = async () => board.fen();
CQ.textoPosicion = { usar: "Usar la posición del tablero de ahora", cambiar: "Cambiarla por la del tablero de ahora" };
CQ.estado = (t) => setStatus(t);
CQ.pintarLista = pintarListaDeCuestionarios;
CQ.enJuego = () => !!cuestionarioEnJuego;
CQ.accionesListo = (c, botones) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "text-xs font-semibold px-3 py-2 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    b.textContent = "▶️ Jugarlo con la clase";
    b.addEventListener("click", () => jugarCuestionario(c));
    botones.prepend(b);
};

/* sesion.html?cuestionario=<id>: viene de cuestionarios.html, a jugarlo. Se
   abre la caja con ese elegido; empezar lo decide el profe, con la clase ya
   conectada. Lo llama sesion.js cuando ya sabe que quien entra da clase. */
async function abrirCuestionarioPedido() {
    const id = new URLSearchParams(location.search).get("cuestionario");
    if (!id || !document.getElementById("cuestionario-caja")) return;
    await cargarCuestionarios();
    const c = cuestionarios.find((x) => x.id === id);
    if (!c) return;
    activateTeacherTab("preguntar");
    document.getElementById("cuestionario-caja").open = true;
    document.getElementById("cuestionario-select").value = c.id;
    editarCuestionario(c);
    document.getElementById("cuestionario-caja").scrollIntoView({ block: "nearest" });
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
    document.getElementById("cuestionario-select").addEventListener("focus", () => { if (!cuestionariosCargados) cargarCuestionarios(); });
    montarArmador();
    document.getElementById("cuestionario-jugar-btn").addEventListener("click", () => jugarCuestionario());
    document.getElementById("cuestionario-cerrar-btn").addEventListener("click", cerrarYaDelCuestionario);
    document.getElementById("cuestionario-siguiente-btn").addEventListener("click", siguienteDelCuestionario);
    document.getElementById("cuestionario-terminar-btn").addEventListener("click", () => terminarCuestionario());
}
