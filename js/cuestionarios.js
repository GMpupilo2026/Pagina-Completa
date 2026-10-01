/* El código de cuestionarios.html.

   Los cuestionarios al estilo Kahoot, fuera de la clase: el profe arma los
   suyos y mira los listos de la Academia (30, por nivel). Jugarlos es de la
   clase en vivo: cada uno lleva a sesion.html?cuestionario=<id>. O se manda
   como tarea, para contestarlo en la casa (tareas.html?material=cuestionario). El armador es
   el mismo de la clase (js/cuestionario-editor.js); esto pone la lista y lo
   que cambia afuera: la posición de una pregunta se pega como FEN, porque acá
   no hay tablero. Ver «Los cuestionarios listos» en
   docs/decisiones/clase-en-vivo.md. */

let session = null, profile = null;
let filtroNivel = "";   // "" = todos los niveles

const $ = (id) => document.getElementById(id);

async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { window.location.href = "login.html"; return; }
    const { data: perfil } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
    if (!perfil) { $("loading").textContent = "No se pudo cargar tu perfil."; return; }
    profile = perfil;
    $("loading").classList.add("hidden");
    $("app").classList.remove("hidden");

    // Como en el resto del sitio, is_admin va con los profesores.
    if (!(profile.role === "profesor" || profile.is_admin === true)) {
        $("sin-permiso").classList.remove("hidden");
        return;
    }
    $("cuerpo").classList.remove("hidden");

    CQ.posicion = async (actual) => {
        const fen = await Avisos.pedir("Copia la posición en formato FEN (por ejemplo, desde el tablero de Análisis o de Lichess) y pégala acá.",
            { titulo: "La posición de la pregunta", etiqueta: "Posición (FEN)", valor: actual || "", aceptar: "Usar esta posición" });
        return fen ? String(fen).trim() : null;
    };
    CQ.textoPosicion = { usar: "Poner una posición (FEN)", cambiar: "Cambiar la posición (FEN)" };
    CQ.estado = () => {};
    CQ.pintarLista = pintarListas;
    CQ.accionesListo = (c, botones) => botones.prepend(enlaceJugar(c.id), enlaceTarea(c.id));
    CQ.alBorrar = () => { $("cuestionario-vacio").hidden = false; };
    montarArmador();
    montarFiltro();

    $("cuestionario-nuevo-btn").addEventListener("click", () => {
        abrir(null);
        $("cuestionario-titulo").focus();
    });

    await cargarCuestionarios();
    // cuestionarios.html?id=<id>: abre ese.
    const pedido = new URLSearchParams(location.search).get("id");
    const c = pedido && cuestionarios.find((x) => x.id === pedido);
    if (c) abrir(c);
}

function enlaceJugar(id) {
    const a = document.createElement("a");
    a.href = "sesion.html?cuestionario=" + encodeURIComponent(id);
    a.className = "text-xs font-semibold px-3 py-2 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    a.textContent = "▶️ Jugarlo en la clase en vivo";
    return a;
}

/* Mandarlo como tarea: Tareas con el renglón ya armado (el mismo
   ?material=&recorte= que usa «Mandarle 10 de…» desde Informes). Allá se
   eligen los alumnos y la fecha. */
function hrefTarea(id) {
    return "tareas.html?material=cuestionario&recorte=" + encodeURIComponent(id);
}
function enlaceTarea(id) {
    const a = document.createElement("a");
    a.href = hrefTarea(id);
    a.className = "text-xs font-semibold px-3 py-2 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    a.textContent = "📨 Mandarlo como tarea";
    return a;
}

function abrir(c) {
    editarCuestionario(c);
    $("cuestionario-vacio").hidden = true;
    pintarListas();
    // En el celular la lista va arriba: se baja a lo que se abrió.
    const destino = c && c.listo ? $("cuestionario-listo") : $("cuestionario-editor");
    if (destino.scrollIntoView && window.matchMedia("(max-width: 1023px)").matches) destino.scrollIntoView({ block: "start" });
}

function montarFiltro() {
    const caja = $("filtro-nivel");
    [{ id: "", nombre: "Todos" }].concat(Cuestionario.NIVELES).forEach((n) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.nivel = n.id;
        b.textContent = (n.emoji ? n.emoji + " " : "") + n.nombre;
        b.addEventListener("click", () => { filtroNivel = n.id; pintarListas(); });
        caja.appendChild(b);
    });
}

// Un renglón de la lista: el título, el nivel (escrito) y cuántas preguntas.
function renglon(c, abierto) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.cuestionario = c.id;
    b.className = "w-full text-left px-3 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
        + (abierto ? "bg-accent-500/20 ring-1 ring-accent-500" : "hover:bg-brand-50 dark:hover:bg-brand-800");
    if (abierto) b.setAttribute("aria-current", "true");
    const t = document.createElement("span");
    t.className = "block text-sm font-semibold text-brand-800 dark:text-brand-100";
    t.textContent = c.titulo;   // lo escribió una persona: textContent
    const d = document.createElement("span");
    d.className = "block text-xs text-brand-500 dark:text-brand-300";
    d.textContent = (c.nivel ? Cuestionario.nombreNivel(c.nivel) + " · " : "") + cqCuantas(c);
    b.append(t, d);
    b.addEventListener("click", () => abrir(c));
    li.appendChild(b);
    return li;
}

function pintarListas() {
    const abierto = (cuestionarioEditado && cuestionarioEditado.id) || (cuestionarioListo && cuestionarioListo.id) || null;
    const mios = cqMios();
    $("lista-mios").innerHTML = "";
    mios.forEach((c) => $("lista-mios").appendChild(renglon(c, c.id === abierto)));
    $("sin-mios").classList.toggle("hidden", mios.length > 0);

    [...$("filtro-nivel").children].forEach((b) => {
        const activo = b.dataset.nivel === filtroNivel;
        b.setAttribute("aria-pressed", activo ? "true" : "false");
        b.className = "text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
            + (activo ? "bg-accent-500 text-brand-900" : "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200");
    });
    const caja = $("lista-listos");
    caja.innerHTML = "";
    Cuestionario.NIVELES.filter((n) => !filtroNivel || n.id === filtroNivel).forEach((n) => {
        const lista = cqListos(n.id);
        if (!lista.length) return;
        const grupo = document.createElement("div");
        const h = document.createElement("h3");
        h.className = "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1.5";
        h.innerHTML = '<span aria-hidden="true">' + n.emoji + " </span>";
        h.appendChild(document.createTextNode(n.nombre + " (" + lista.length + ")"));
        const ul = document.createElement("ul");
        ul.className = "grid gap-1.5";
        lista.forEach((c) => ul.appendChild(renglon(c, c.id === abierto)));
        grupo.append(h, ul);
        caja.appendChild(grupo);
    });
    if (!caja.childElementCount) caja.textContent = "No hay cuestionarios listos de este nivel.";

    // Uno propio ya guardado se puede jugar; uno sin guardar, todavía no.
    const enlace = $("cuestionario-jugar-enlace");
    const id = cuestionarioEditado && cuestionarioEditado.id;
    enlace.hidden = !id;
    if (id) enlace.href = "sesion.html?cuestionario=" + encodeURIComponent(id);
    const tarea = $("cuestionario-tarea-enlace");
    tarea.hidden = !id;
    if (id) tarea.href = hrefTarea(id);
}

init();
