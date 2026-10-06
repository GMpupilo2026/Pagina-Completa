/* El código de cuestionario-tarea.html: el cuestionario que el profe mandó como
   tarea, para contestarlo en la casa, sin reloj y a su ritmo (lo que Blooket
   llama «Homework»). Llega desde Tareas con ?c=<cuestionario>&tarea=<id>&item=<renglón>.

   Lo que esta página NO hace, a propósito: saber cuál es la correcta. La
   opción correcta vive en public.cuestionarios, que el alumno no puede leer.
   Las preguntas llegan sin ella (cuestionario_de_tarea), las respuestas se
   mandan todas juntas y la base califica, guarda el intento y recién ahí
   devuelve cuáles eran (contestar_cuestionario_de_tarea). La tarea se cumple
   con ese intento: lo cuenta tareas_con_avance(), no esta página. Ver «El
   cuestionario como tarea» en docs/decisiones/seguimiento-del-alumno.md. */

let session = null;
let itemId = null;
let preguntas = [];
let tableros = [];
let intentosPrevios = 0;
// En qué orden se ven: las preguntas (índices originales) y, para cada una,
// sus opciones. Lo que se manda a la base va SIEMPRE en el orden original.
let orden = [];
let ordenOpciones = [];

const $ = (id) => document.getElementById(id);
const LETRAS = "ABCD";

async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { window.location.href = "login.html?next=" + encodeURIComponent("cuestionario-tarea.html" + location.search); return; }
    itemId = new URLSearchParams(location.search).get("item");

    $("loading").classList.add("hidden");
    $("app").classList.remove("hidden");

    if (!itemId) { mostrarError("Este enlace no dice qué cuestionario es. Ábrelo desde tus tareas."); return; }

    const { data: cq, error } = await sb.rpc("cuestionario_de_tarea", { p_item: itemId });
    if (error || !cq) {
        mostrarError((error && error.message) || "No se pudo cargar el cuestionario.");
        return;
    }
    preguntas = Array.isArray(cq.preguntas) ? cq.preguntas : [];
    // El título lo escribió una persona: textContent.
    $("cq-titulo").lastChild.textContent = " " + (cq.titulo || "Cuestionario");
    document.title = (cq.titulo || "Cuestionario") + " — Ajedrez Integral";
    $("cq-sub").textContent = preguntas.length + (preguntas.length === 1 ? " pregunta" : " preguntas")
        + ". Sin reloj: tómate el tiempo que necesites. Al entregar ves cuántas acertaste y cuál era la correcta de cada una.";

    await pintarIntentosAnteriores();
    pintarPreguntas();
    $("cq-form").classList.remove("hidden");
    $("cq-form").addEventListener("submit", entregar);
    $("cq-form").addEventListener("change", contarFaltan);
    $("cq-otra-vez").addEventListener("click", otraVez);
    contarFaltan();
}

function mostrarError(texto) {
    $("cq-error-texto").textContent = texto;
    $("cq-error").classList.remove("hidden");
}

/* Lo que ya hizo antes: la RLS le deja leer sus intentos. Se dice que el
   profe ve la primera vez, porque es la que cuenta como nota: después ya vio
   las correctas. */
async function pintarIntentosAnteriores() {
    const { data } = await sb.from("cuestionario_intentos")
        .select("aciertos, total, created_at").eq("tarea_item_id", itemId).order("created_at");
    const lista = data || [];
    intentosPrevios = lista.length;
    const p = $("cq-antes");
    if (!lista.length) { p.classList.add("hidden"); return; }
    const primero = lista[0];
    const mejor = Math.max.apply(null, lista.map((x) => x.aciertos));
    p.textContent = (lista.length === 1 ? "Ya lo contestaste una vez" : `Ya lo contestaste ${lista.length} veces`)
        + `: la primera acertaste ${primero.aciertos} de ${primero.total}`
        + (lista.length > 1 ? ` y la mejor, ${mejor}` : "")
        + ". Tu profe ve la primera y la mejor. Puedes contestarlo otra vez para practicar.";
    p.classList.remove("hidden");
}

/* ---------- Cada alumno, su orden ----------
   Las preguntas y sus opciones se ven en otro orden para cada alumno, y otro
   cada vez que lo vuelve a contestar: así no se pasan las respuestas por letra
   («la 3 es la B») y repetirlo para practicar no es repetir de memoria. La
   base no se entera: las respuestas se mandan en el orden original, con el
   número original de cada opción, y se califica igual que siempre.

   Lo que NO se baraja, porque cambiaría la pregunta:
   - las opciones de «Verdadero / Falso» y las que dicen «todas», «ninguna» o
     «anterior» (dependen de su lugar);
   - el orden de las preguntas, si alguna habla de la «anterior». */
const DEPENDE_DEL_LUGAR = /\b(anterior|anteriores|todas|ninguna|ambas)\b/i;

function azarDe(texto) {
    let s = 2166136261;
    for (const c of texto) s = Math.imul(s ^ c.charCodeAt(0), 16777619) >>> 0;
    s = s || 1;
    return () => {
        s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

function barajado(n, rnd) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function armarOrden() {
    const quien = (session && session.user && session.user.id) || "";
    const rnd = azarDe(itemId + "|" + quien + "|" + intentosPrevios);
    const sinOrdenFijo = !preguntas.some((q) => /\banterior\b/i.test(q.texto || ""));
    orden = sinOrdenFijo ? barajado(preguntas.length, rnd) : preguntas.map((_, i) => i);
    ordenOpciones = preguntas.map((q) => {
        const ops = q.opciones || [];
        const fijas = ops.length <= 2 || ops.some((o) => DEPENDE_DEL_LUGAR.test(String(o)));
        return fijas ? ops.map((_, k) => k) : barajado(ops.length, rnd);
    });
}

// La letra con que se VE una opción (su número original es otro).
function letraDe(i, original) {
    return LETRAS.charAt(ordenOpciones[i].indexOf(original));
}

function pintarPreguntas() {
    armarOrden();
    const ol = $("cq-preguntas");
    ol.innerHTML = "";
    tableros = [];
    orden.forEach((i, visto) => {
        const q = preguntas[i];
        const li = document.createElement("li");
        li.className = "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5";
        li.dataset.pregunta = String(i);
        const fs = document.createElement("fieldset");
        const lg = document.createElement("legend");
        lg.className = "font-semibold text-brand-800 dark:text-white mb-3";
        lg.textContent = `Pregunta ${visto + 1} de ${preguntas.length}: ${q.texto || ""}`;
        fs.appendChild(lg);

        // Con posición, el tablero para mirarla (no se mueve: se contesta abajo).
        if (q.fen && window.TableroPregunta) {
            const wrap = document.createElement("div");
            wrap.className = "flex justify-center mb-4";
            const board = document.createElement("div");
            board.className = "grid grid-cols-8 grid-rows-[repeat(8,minmax(0,1fr))] w-full max-w-[340px] aspect-square rounded-xl overflow-hidden shadow-lg border-4 border-brand-700 select-none";
            wrap.appendChild(board);
            fs.appendChild(wrap);
            try { tableros.push(TableroPregunta.montar(board, { fen: q.fen, tipo: "mirar" })); } catch (e) { wrap.remove(); }
        }

        const opciones = document.createElement("div");
        opciones.className = "grid gap-2";
        ordenOpciones[i].forEach((k, vista) => {
            const o = q.opciones[k];
            const label = document.createElement("label");
            label.className = "cq-opcion flex items-center gap-3 rounded-lg border border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-950 px-3 py-2 cursor-pointer hover:border-accent-500 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50 dark:has-[:checked]:bg-brand-800 has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-400";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "q" + i;
            radio.value = String(k);
            radio.className = "text-accent-500 focus:ring-accent-400";
            const t = document.createElement("span");
            t.className = "text-sm text-brand-700 dark:text-brand-100";
            t.textContent = `${LETRAS.charAt(vista)}. ${o}`;
            label.append(radio, t);
            opciones.appendChild(label);
        });
        fs.appendChild(opciones);
        const marca = document.createElement("p");
        marca.className = "cq-marca hidden mt-3 text-sm font-semibold";
        fs.appendChild(marca);
        li.appendChild(fs);
        ol.appendChild(li);
    });
}

function respuestas() {
    return preguntas.map((_, i) => {
        const r = document.querySelector(`input[name="q${i}"]:checked`);
        return r ? parseInt(r.value, 10) : null;
    });
}

function contarFaltan() {
    const faltan = respuestas().filter((x) => x === null).length;
    $("cq-faltan").textContent = faltan
        ? `Te ${faltan === 1 ? "falta 1 pregunta" : `faltan ${faltan} preguntas`} de ${preguntas.length}.`
        : "Contestaste todas. Ya puedes entregar.";
}

async function entregar(ev) {
    ev.preventDefault();
    const lista = respuestas();
    const faltan = lista.filter((x) => x === null).length;
    if (faltan) {
        const ok = await Avisos.confirmar(
            `Te ${faltan === 1 ? "falta 1 pregunta" : `faltan ${faltan} preguntas`} sin contestar. Las que dejes en blanco cuentan como no acertadas.`,
            { titulo: "¿Entregar así?", aceptar: "Entregar así", cancelar: "Seguir contestando" });
        if (!ok) return;
    }
    const boton = $("cq-entregar");
    boton.disabled = true;
    boton.textContent = "Entregando…";
    const { data, error } = await sb.rpc("contestar_cuestionario_de_tarea", { p_item: itemId, p_respuestas: lista });
    boton.disabled = false;
    boton.textContent = "Entregar mis respuestas";
    if (error || !data) {
        Avisos.avisar("No se pudo entregar: " + ((error && error.message) || "inténtalo de nuevo."), { tipo: "error" });
        return;
    }
    marcar(lista, data.correctas || []);
    mostrarResultado(data);
    await pintarIntentosAnteriores();
}

/* Cada pregunta dice, escrito, si estuvo bien y cuál era la correcta: el
   color nunca va solo. */
function marcar(lista, correctas) {
    preguntas.forEach((q, i) => {
        const li = document.querySelector(`#cq-preguntas li[data-pregunta="${i}"]`);
        if (!li) return;
        li.querySelectorAll("input[type=radio]").forEach((r) => { r.disabled = true; });
        const buena = correctas[i];
        const dada = lista[i];
        const marca = li.querySelector(".cq-marca");
        const textoBuena = typeof buena === "number" && q.opciones && q.opciones[buena] !== undefined
            ? `${letraDe(i, buena)}. ${q.opciones[buena]}` : "";
        if (dada !== null && dada === buena) {
            marca.textContent = "✓ Bien.";
            marca.className = "cq-marca mt-3 text-sm font-semibold text-green-700 dark:text-green-400";
        } else {
            marca.textContent = (dada === null ? "Sin contestar." : "✗ No era esa.") + (textoBuena ? " La correcta era: " + textoBuena : "");
            marca.className = "cq-marca mt-3 text-sm font-semibold text-red-700 dark:text-red-300";
        }
        li.dataset.resultado = dada !== null && dada === buena ? "bien" : "mal";
    });
}

function mostrarResultado(r) {
    const total = Number(r.total) || preguntas.length;
    const aciertos = Number(r.aciertos) || 0;
    $("cq-resultado-titulo").textContent = `Acertaste ${aciertos} de ${total}`;
    const frase = aciertos === total ? "¡Todas bien! Ya quedó en tu tarea."
        : aciertos / total >= 0.7 ? "Muy bien. Ya quedó en tu tarea; abajo puedes ver cuál era la correcta de las que fallaste."
        : "Ya quedó en tu tarea. Repasa las que fallaste: abajo dice cuál era la correcta de cada una.";
    $("cq-resultado-texto").textContent = frase;
    $("cq-resultado").classList.remove("hidden");
    // La barra de entregar se va entera: vacía, flotaría encima de las preguntas.
    $("cq-barra").classList.add("hidden");
    $("cq-resultado-titulo").focus();
    if (window.BlindNotation && typeof window.BlindNotation.speak === "function") {
        try { window.BlindNotation.speak(`Acertaste ${aciertos} de ${total}.`); } catch (e) {}
    }
}

function otraVez() {
    $("cq-resultado").classList.add("hidden");
    $("cq-barra").classList.remove("hidden");
    pintarPreguntas();
    contarFaltan();
    $("cq-titulo").focus();
    window.scrollTo(0, 0);
    $("cq-aviso").textContent = "";
    setTimeout(() => { $("cq-aviso").textContent = "Las respuestas quedaron en blanco. Puedes contestarlo otra vez."; }, 60);
}

init();
