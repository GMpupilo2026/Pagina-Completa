/* El código de sesion.html.

   La presentación de la clase: el profe muestra sus diapositivas DENTRO de la
   clase, arriba del tablero, y las pasa con ◀ ▶; todos (alumnos, proyector,
   quien supervisa, su celular de control remoto) ven la misma sin salir de la
   página. Las diapositivas que traen posiciones tienen, en la pantalla del
   profe, «📥 Al tablero de la clase», «❓ Preguntar» y «🎯 Practicar», que
   pasan por aplicarPosicionEnClase() como cualquier otra puerta.

   Qué diapositiva se ve va en game_state.presentacion ({deck, n} o null), no
   en un mensaje suelto: quien entra tarde o recarga ve la misma. Solo el
   profe la cambia (protect_game_state_teacher_columns) y el CHECK
   game_state_presentacion_forma rechaza otra forma. Ver «La presentación de
   la clase» en docs/decisiones/clase-en-vivo.md.

   Las imágenes y sus datos (diapositivas.json: título, transcripción, notas y
   posiciones) viven en cursos/recursos/<curso>/presentaciones/<clase>/, con el
   candado del worker. Al alumno se le pide SOLO la que se está mostrando:
   adelantarle las siguientes sería adelantarle las respuestas.

   Como las demás partes de la clase (ver «sesion.js en partes»), un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js solo dentro de
   funciones. */

window.PresentacionClase = (function () {
    // Las presentaciones que se pueden dar en clase. El texto y las posiciones
    // de cada una están en su diapositivas.json.
    const LISTA = [
        { deck: "formacion-ajedrez/clase-01", titulo: "Formación Ajedrez · Clase 1: rol arbitral, reglas básicas y notación" },
    ];
    const FORMA_DECK = /^[a-z0-9-]{1,60}\/[a-z0-9-]{1,40}$/;

    function carpeta(deck) {
        const [curso, clase] = deck.split("/");
        return "cursos/recursos/" + curso + "/presentaciones/" + clase + "/";
    }

    // La misma forma que exige el CHECK de la base: lo demás se trata como «ninguna».
    function valida(p) {
        return !!(p && typeof p === "object" && typeof p.deck === "string" && FORMA_DECK.test(p.deck)
            && Number.isInteger(p.n) && p.n >= 1 && p.n <= 500);
    }

    const pedidas = {};
    function cargar(deck) {
        if (!pedidas[deck]) {
            pedidas[deck] = fetch(carpeta(deck) + "diapositivas.json", { credentials: "same-origin" })
                .then((r) => {
                    if (!r.ok) throw new Error(r.status === 403 ? "sin_acceso" : r.status === 401 ? "sin_sesion" : "error");
                    return r.json();
                })
                // Sin acceso no cambia con reintentar: se recuerda, y cada eco de
                // Realtime (cada jugada) no vuelve a pedirla. Lo demás, sí.
                .catch((e) => { if (e.message !== "sin_acceso") delete pedidas[deck]; throw e; });
        }
        return pedidas[deck];
    }

    function titulo(deck) {
        const p = LISTA.find((x) => x.deck === deck);
        return p ? p.titulo : "Presentación";
    }

    return { LISTA, carpeta, valida, cargar, titulo };
})();

let presentacionActual = null;     // {deck, n} tal como vino de la base (o null)
let presentacionDatos = null;      // el diapositivas.json de la que se ve
let presentacionPintando = 0;      // para descartar una carga vieja que llega tarde
let presentacionEnviada = null;    // el profe: lo último que mandó, y cuándo
let presentacionEnviadaEn = 0;

function presentacionEsDelProfe() {
    return isTeacher && !esObservador;
}
function presentacionConPosiciones() {
    return presentacionEsDelProfe() && !modoProyector && !modoControl;
}

function presentacionBoton(texto, titulo, fuerte) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "text-xs font-semibold px-2 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " + (fuerte
        ? "bg-accent-500 hover:bg-accent-600 text-brand-900"
        : "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200");
    b.textContent = texto;
    if (titulo) b.title = titulo;
    return b;
}

/* Lo que llega de la base (applyGameStateRow) y lo que pone el profe. */
async function pintarPresentacion(p, propia) {
    const caja = document.getElementById("presentacion-caja");
    if (!caja) return;
    const nueva = PresentacionClase.valida(p) ? { deck: p.deck, n: p.n } : null;
    // Si el profe pasa tres diapositivas seguidas, los ecos de las dos primeras
    // llegan después y lo devolverían atrás: unos segundos, solo vale lo suyo.
    if (!propia && presentacionEsDelProfe() && Date.now() - presentacionEnviadaEn < 3000
        && JSON.stringify(nueva) !== presentacionEnviada) return;
    // El mismo eco de siempre (una jugada, una flecha): no se vuelve a pintar.
    if (presentacionDatos && JSON.stringify(nueva) === JSON.stringify(presentacionActual) && !caja.hidden) return;
    presentacionActual = nueva;
    pintarPresentacionPanel();
    const turno = ++presentacionPintando;
    if (!nueva) {
        caja.hidden = true;
        presentacionDatos = null;
        anunciarALaClase("presentacion", null);
        return;
    }
    caja.hidden = false;
    const msg = document.getElementById("presentacion-msg");
    let datos;
    try {
        datos = await PresentacionClase.cargar(nueva.deck);
    } catch (e) {
        if (turno !== presentacionPintando) return;
        msg.textContent = e.message === "sin_acceso"
            ? "Tu profe está mostrando una presentación, pero tu cuenta no tiene el acceso a la Academia activo para verla."
            : "No se pudo abrir la presentación. Revisa tu conexión: se vuelve a intentar con la siguiente diapositiva.";
        msg.hidden = false;
        document.getElementById("presentacion-img").removeAttribute("src");
        return;
    }
    if (turno !== presentacionPintando) return;
    presentacionDatos = datos;
    msg.hidden = true;
    const total = datos.diapositivas.length;
    const n = Math.min(nueva.n, total);
    const d = datos.diapositivas[n - 1];
    const img = document.getElementById("presentacion-img");
    img.src = PresentacionClase.carpeta(nueva.deck) + d.imagen;
    img.alt = "Diapositiva " + n + ": " + d.titulo;
    document.getElementById("presentacion-titulo").textContent = PresentacionClase.titulo(nueva.deck);
    document.getElementById("presentacion-cuenta").textContent = "Diapositiva " + n + " de " + total;
    document.getElementById("presentacion-texto").textContent = d.texto;
    anunciarALaClase("presentacion", nueva.deck + ":" + n,
        "Tu profe muestra la diapositiva " + n + " de " + total + ": " + d.titulo + ". Su texto está debajo de la imagen.");

    // En el proyector no van los botones ni las notas: es lo que ve la clase.
    const delProfe = presentacionEsDelProfe() && !modoProyector;
    document.getElementById("presentacion-profe").hidden = !delProfe;
    if (!delProfe) return;
    document.getElementById("presentacion-anterior").disabled = n <= 1;
    document.getElementById("presentacion-siguiente").disabled = n >= total;
    const notas = document.getElementById("presentacion-notas");
    notas.hidden = !d.notas;
    notas.textContent = d.notas ? "Notas (solo tú): " + d.notas : "";
    const sigue = document.getElementById("presentacion-sigue");
    sigue.textContent = n < total ? "Sigue: " + datos.diapositivas[n].titulo : "Es la última diapositiva.";
    // Al profe sí se le adelanta la siguiente: así pasa sin esperar a que cargue.
    if (n < total) { const pre = new Image(); pre.src = PresentacionClase.carpeta(nueva.deck) + datos.diapositivas[n].imagen; }
    pintarPresentacionPosiciones(d);
}

function pintarPresentacionPosiciones(d) {
    const caja = document.getElementById("presentacion-posiciones");
    caja.innerHTML = "";
    const lista = presentacionConPosiciones() && Array.isArray(d.posiciones) ? d.posiciones : [];
    caja.hidden = !lista.length;
    if (!lista.length) return;
    const t = document.createElement("p");
    t.className = "text-xs font-semibold text-brand-700 dark:text-brand-200";
    t.textContent = lista.length === 1 ? "La posición de esta diapositiva:" : "Las posiciones de esta diapositiva:";
    caja.appendChild(t);
    lista.forEach((pos) => {
        const fila = document.createElement("div");
        fila.className = "flex flex-wrap items-center gap-1.5 mt-1.5";
        const nombre = document.createElement("span");
        nombre.className = "text-xs text-brand-700 dark:text-brand-200 mr-1";
        nombre.textContent = pos.nombre;
        const tablero = presentacionBoton("📥 Al tablero de la clase", "Poner esta posición en el tablero de toda la clase", true);
        tablero.addEventListener("click", () => presentacionAlTablero(pos));
        fila.append(nombre, tablero);
        if (pos.jugadas) {
            const preguntar = presentacionBoton("❓ Preguntar", "Mandar esta posición a la clase como pregunta");
            preguntar.addEventListener("click", () => presentacionPreguntar(pos));
            fila.appendChild(preguntar);
        }
        // Practicar contra el motor solo tiene sentido si la partida no terminó ahí.
        const g = new Chess(pos.fen);
        if (!g.game_over()) {
            const practicar = presentacionBoton("🎯 Practicar", "Que los alumnos jueguen esta posición contra el motor");
            practicar.addEventListener("click", () => presentacionPracticar(pos));
            fila.appendChild(practicar);
        }
        caja.appendChild(fila);
    });
}

async function presentacionAlTablero(pos) {
    await aplicarPosicionEnClase(pos.fen, "En el tablero de la clase: " + pos.nombre + ".");
}

// Igual que Preguntar de Archivos y de Táctica: la posición al tablero y la pregunta.
async function presentacionPreguntar(pos) {
    if (!(await aplicarPosicionEnClase(pos.fen))) return;
    document.getElementById("question-plies-input").value = pos.jugadas;
    const { data, error } = await crearPregunta(pos.fen, pos.jugadas);
    if (error) { console.error(error); setStatus("No se pudo crear la pregunta: " + error.message); return; }
    activateTeacherTab("preguntar");
    setStatus("Se envió \"" + pos.nombre + "\" a la clase como pregunta.");
    computeEngineAnswer(data.id, pos.fen, pos.jugadas); // en segundo plano
}

async function presentacionPracticar(pos) {
    if (!(await aplicarPosicionEnClase(pos.fen))) return;
    if (typeof PracticeEngine !== "undefined") PracticeEngine.preload();
    const { error } = await crearPractica(pos.fen, selectedPracticeLevel);
    if (error) { console.error(error); setStatus("No se pudo iniciar la práctica: " + error.message); return; }
    activateTeacherTab("practicar");
    setStatus("Práctica iniciada desde \"" + pos.nombre + "\": los alumnos ya pueden jugar contra el motor.");
}

/* El profe la pone, la pasa o la quita. Se pinta en su pantalla en el acto y
   el eco de Realtime no la devuelve atrás (presentacionEnviada). */
async function mostrarPresentacion(p) {
    if (!presentacionEsDelProfe() || !myGameStateId) return;
    if (p && presentacionDatos && p.deck === (presentacionActual && presentacionActual.deck)) {
        p = { deck: p.deck, n: Math.max(1, Math.min(p.n, presentacionDatos.diapositivas.length)) };
    }
    presentacionEnviada = JSON.stringify(p);
    presentacionEnviadaEn = Date.now();
    const local = pintarPresentacion(p, true);
    const { error } = await sb.from("game_state").update({ presentacion: p }).eq("id", myGameStateId);
    await local;
    if (error) { console.error(error); setStatus("No se pudo cambiar la diapositiva: " + error.message); }
}

function pasarDiapositiva(paso) {
    if (!presentacionActual) return;
    mostrarPresentacion({ deck: presentacionActual.deck, n: presentacionActual.n + paso });
}

// El panel para elegir la presentación (botón «📽️ Presentación» de la barra del profe).
function pintarPresentacionPanel() {
    const ul = document.getElementById("presentacion-panel-lista");
    if (!ul) return;
    ul.innerHTML = "";
    PresentacionClase.LISTA.forEach((pr) => {
        const li = document.createElement("li");
        li.className = "bg-brand-50 dark:bg-brand-950 rounded-lg px-3 py-2";
        const t = document.createElement("p");
        t.className = "text-sm font-semibold text-brand-800 dark:text-white";
        t.textContent = pr.titulo;
        const acciones = document.createElement("div");
        acciones.className = "flex flex-wrap gap-1.5 mt-2";
        const enCurso = presentacionActual && presentacionActual.deck === pr.deck;
        if (enCurso) {
            const quitar = presentacionBoton("⏹ Quitar de la clase", "Dejar de mostrar la presentación a la clase");
            quitar.addEventListener("click", () => mostrarPresentacion(null));
            acciones.appendChild(quitar);
        } else {
            const mostrar = presentacionBoton("▶ Mostrar a la clase", "Mostrar la primera diapositiva a toda la clase, arriba del tablero", true);
            mostrar.addEventListener("click", () => {
                mostrarPresentacion({ deck: pr.deck, n: 1 });
                document.getElementById("presentacion-panel").classList.add("hidden");
                document.getElementById("toggle-presentacion-btn").setAttribute("aria-expanded", "false");
            });
            acciones.appendChild(mostrar);
        }
        li.append(t, acciones);
        ul.appendChild(li);
    });
}

function setupPresentacionTools() {
    const btn = document.getElementById("toggle-presentacion-btn");
    const panel = document.getElementById("presentacion-panel");
    btn.addEventListener("click", () => {
        const abrir = panel.classList.contains("hidden");
        panel.classList.toggle("hidden", !abrir);
        btn.setAttribute("aria-expanded", String(abrir));
        ["board-edit-panel", "lesson-picker-panel", "pdf-panel", "archivos-panel"].forEach((id) => {
            const otro = document.getElementById(id);
            if (otro) otro.classList.add("hidden");
        });
        if (abrir) pintarPresentacionPanel();
    });
    document.getElementById("presentacion-panel-close-btn").addEventListener("click", () => {
        panel.classList.add("hidden");
        btn.setAttribute("aria-expanded", "false");
    });
}

// Lo de todos: pantalla completa. Lo del profe: ◀ ▶ y quitar (también con el teclado en pantalla completa).
document.getElementById("presentacion-completa").addEventListener("click", () => {
    const caja = document.getElementById("presentacion-caja");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (caja.requestFullscreen) caja.requestFullscreen().catch(() => {});
});
document.getElementById("presentacion-anterior").addEventListener("click", () => pasarDiapositiva(-1));
document.getElementById("presentacion-siguiente").addEventListener("click", () => pasarDiapositiva(1));
document.getElementById("presentacion-quitar").addEventListener("click", () => mostrarPresentacion(null));
document.getElementById("presentacion-caja").addEventListener("keydown", (e) => {
    if (!presentacionEsDelProfe() || document.fullscreenElement !== e.currentTarget) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); pasarDiapositiva(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); pasarDiapositiva(-1); }
});
