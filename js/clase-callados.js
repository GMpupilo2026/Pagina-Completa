/* El código de sesion.html.

   La participación pareja: un aviso discreto al profe (solo él lo ve) de
   quién lleva un rato sin contestar las preguntas de la clase, para que lo
   integre. Ver «La participación pareja» en docs/decisiones/clase-en-vivo.md.

   Como las demás partes de la clase (ver «sesion.js en partes»), un script
   clásico cargado ANTES que sesion.js. La cuenta (Callados.calcular) es pura,
   para probarla sola. */

window.Callados = (function () {
    const ULTIMAS = 4;       // se miran las últimas 4 preguntas de todos
    const MINIMO = 3;        // y avisa con 3 o más sin contestar

    /* preguntas: las de ESTA clase, ya cerradas, de la más nueva a la más vieja
       ({id, created_at, para_alumno}); respuestas: [{question_id, student_id}];
       conectados: [{id, nombre, desde}] con `desde` = cuándo lo vio conectado
       esta página (ms). Solo cuentan las preguntas que se hicieron mientras
       estaba: a quien acaba de entrar no se le cuenta lo de antes. Las
       dirigidas a alguien no son de todos, y no cuentan. */
    function calcular(preguntas, respuestas, conectados, opciones) {
        const o = Object.assign({ ultimas: ULTIMAS, minimo: MINIMO }, opciones || {});
        const deTodos = (preguntas || []).filter((q) => !q.para_alumno).slice(0, o.ultimas);
        const contesto = new Set((respuestas || []).map((a) => a.question_id + ":" + a.student_id));
        return (conectados || []).map((c) => {
            const suyas = deTodos.filter((q) => new Date(q.created_at).getTime() >= (c.desde || 0) - 60000);
            const sin = suyas.filter((q) => !contesto.has(q.id + ":" + c.id)).length;
            return { id: c.id, nombre: c.nombre, sin, de: suyas.length };
        }).filter((x) => x.de >= o.minimo && x.sin >= o.minimo)
          .sort((a, b) => b.sin - a.sin || String(a.nombre).localeCompare(String(b.nombre)));
    }

    return { ULTIMAS, MINIMO, calcular };
})();

// Desde cuándo ve esta página a cada alumno conectado (la presencia no lo dice:
// su online_at cambia con cada anuncio).
const conectadoDesde = new Map();
let revisandoCallados = null;

function anotarConectados() {
    const ahora = Date.now();
    for (const id of onlineStudents.keys()) if (!conectadoDesde.has(id)) conectadoDesde.set(id, ahora);
}

// Se pide sin apuro: varias llamadas seguidas (presencia, pregunta que se cierra) hacen una sola consulta.
function revisarCallados() {
    if (!isTeacher || modoProyector || modoControl) return;
    clearTimeout(revisandoCallados);
    revisandoCallados = setTimeout(contarCallados, 400);
}

async function contarCallados() {
    if (!currentOpenSessionId || !onlineStudents.size) { pintarCallados([]); return; }
    const { data: qs } = await sb.from("questions").select("id, created_at, para_alumno")
        .eq("class_session_id", currentOpenSessionId).not("closed_at", "is", null)
        .order("created_at", { ascending: false }).limit(12);
    const deTodos = (qs || []).filter((q) => !q.para_alumno).slice(0, Callados.ULTIMAS);
    if (deTodos.length < Callados.MINIMO) { pintarCallados([]); return; }
    const { data: resp } = await sb.from("question_answers").select("question_id, student_id").in("question_id", deTodos.map((q) => q.id));
    const conectados = [...onlineStudents.entries()].map(([id, info]) => ({ id, nombre: info.full_name || info.email || "Alumno", desde: conectadoDesde.get(id) || Date.now() }));
    pintarCallados(Callados.calcular(qs, resp, conectados));
}

function pintarCallados(lista) {
    const caja = document.getElementById("callados-aviso");
    if (!caja) return;
    caja.hidden = !lista.length;
    const ul = document.getElementById("callados-lista");
    ul.innerHTML = "";
    lista.forEach((x) => {
        const li = document.createElement("li");
        li.className = "flex items-center justify-between gap-2";
        const t = document.createElement("span");
        // El nombre lo escribió una persona: textContent.
        t.textContent = x.nombre + " — " + x.sin + " de las últimas " + x.de + " sin contestar";
        const b = document.createElement("button");
        b.type = "button";
        b.className = "shrink-0 text-xs font-semibold px-2 py-1 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        b.textContent = "🎯 Darle el turno";
        b.setAttribute("aria-label", "Darle el turno a " + x.nombre);
        b.addEventListener("click", async () => {
            if (!currentOpenSessionId) return;
            activateTeacherTab("alumnos");
            if (await darTurno(x.id, "profe")) setStatus("🎯 Le toca responder a " + x.nombre + ": ya le salió el aviso en su pantalla.");
        });
        li.append(t, b);
        ul.appendChild(li);
    });
}
