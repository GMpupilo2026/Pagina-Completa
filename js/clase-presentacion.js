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

   Hay dos clases de presentación, y el profe elige cuál compartir:
   - las del curso (LISTA): imágenes y diapositivas.json (título,
     transcripción, notas y posiciones) en cursos/recursos/<curso>/
     presentaciones/<clase>/, con el candado del worker; deck "<curso>/<clase>";
   - las suyas: sube un PDF (PowerPoint y Google Slides lo exportan), el
     navegador lo parte en una imagen por página con pdf.js y las guarda en el
     bucket privado «presentaciones», con el texto de cada página en la tabla
     presentaciones_profe; deck "subida/<id>". En cada diapositiva puede guardar
     la posición del tablero, para mandarla de un toque en la clase.
   Al alumno se le pide SOLO la diapositiva que se está mostrando (en las
   subidas, la política del bucket no le firma otra): adelantarle las
   siguientes sería adelantarle las respuestas.

   Como las demás partes de la clase (ver «sesion.js en partes»), un script
   clásico cargado ANTES que sesion.js: usa lo de sesion.js solo dentro de
   funciones. */

window.PresentacionClase = (function () {
    // Las presentaciones del curso. El texto y las posiciones de cada una están
    // en su diapositivas.json: la Clase 1 es la propia del profe; las sesiones
    // 2 a 7 las arma herramientas/curso-generar-formacion.py con su .pptx. El
    // título tiene que ser el mismo de su diapositivas.json (lo revisa
    // verificar-clase-presentacion.js). Las que sube cada profe vienen de la base.
    const LISTA = [
        { deck: "formacion-ajedrez/clase-01", titulo: "Formación Ajedrez · Clase 1: rol arbitral, reglas básicas y notación" },
        { deck: "formacion-ajedrez/clase-02", titulo: "Formación Ajedrez · Sesión 2: Reglas de competición" },
        { deck: "formacion-ajedrez/clase-03", titulo: "Formación Ajedrez · Sesión 3: Apéndices de las Leyes de Ajedrez y normativa de los Juegos Deportivos Estudiantiles" },
        { deck: "formacion-ajedrez/clase-04", titulo: "Formación Ajedrez · Sesión 4: Sistemas de emparejamiento para torneos" },
        { deck: "formacion-ajedrez/clase-05", titulo: "Formación Ajedrez · Sesión 5: Uso, configuración y control del reloj de ajedrez" },
        { deck: "formacion-ajedrez/clase-06", titulo: "Formación Ajedrez · Sesión 6: Resolución de casos en grupos y experiencias regionales" },
        { deck: "formacion-ajedrez/clase-07", titulo: "Formación Ajedrez · Sesión 7: Talleres prácticos y simulacros de arbitraje" },
    ];
    const FORMA_DECK = /^[a-z0-9-]{1,60}\/[a-z0-9-]{1,40}$/;
    const BUCKET = "presentaciones";

    function esSubida(deck) { return deck.indexOf("subida/") === 0; }

    function carpeta(deck) {
        const [curso, clase] = deck.split("/");
        return "cursos/recursos/" + curso + "/presentaciones/" + clase + "/";
    }

    // La misma forma que exige el CHECK de la base: lo demás se trata como «ninguna».
    function valida(p) {
        return !!(p && typeof p === "object" && typeof p.deck === "string" && FORMA_DECK.test(p.deck)
            && Number.isInteger(p.n) && p.n >= 1 && p.n <= 500);
    }

    // El título de una diapositiva subida: el comienzo de su texto, o su número.
    function tituloDeTexto(texto, n) {
        const primera = String(texto || "").split("\n")[0];
        const frase = primera.match(/^(.*?[.!?:])\s/);
        const linea = (frase ? frase[1] : primera).trim();
        if (!linea) return "Diapositiva " + n;
        return linea.length > 80 ? linea.slice(0, 77).trim() + "…" : linea;
    }

    function armarSubida(fila) {
        const textos = Array.isArray(fila.textos) ? fila.textos : [];
        const posiciones = fila.posiciones && typeof fila.posiciones === "object" ? fila.posiciones : {};
        return {
            titulo: fila.titulo,
            subida: fila,
            diapositivas: Array.from({ length: fila.paginas }, (_, i) => {
                const n = i + 1;
                const texto = String(textos[i] || "").trim();
                return {
                    titulo: tituloDeTexto(texto, n),
                    texto: texto || "Esta diapositiva no trae texto escrito: es solo imagen.",
                    imagen: fila.profesor_id + "/" + fila.id + "/" + n + "." + fila.formato,
                    posiciones: Array.isArray(posiciones[n]) ? posiciones[n] : [],
                };
            }),
        };
    }

    const pedidas = {};
    function cargar(deck) {
        if (!pedidas[deck]) {
            pedidas[deck] = (esSubida(deck)
                ? sb.from("presentaciones_profe").select("id, profesor_id, titulo, paginas, formato, textos, posiciones")
                    .eq("id", deck.slice(7)).maybeSingle().then(({ data, error }) => {
                        if (error) throw new Error("error");
                        if (!data) throw new Error("no_disponible");
                        return armarSubida(data);
                    })
                : fetch(carpeta(deck) + "diapositivas.json", { credentials: "same-origin" }).then((r) => {
                    if (!r.ok) throw new Error(r.status === 403 ? "sin_acceso" : r.status === 401 ? "sin_sesion" : "error");
                    return r.json();
                }))
                // Sin acceso no cambia con reintentar: se recuerda, y cada eco de
                // Realtime (cada jugada) no vuelve a pedirla. Lo demás, sí.
                .catch((e) => { if (e.message !== "sin_acceso") delete pedidas[deck]; throw e; });
        }
        return pedidas[deck];
    }
    function olvidar(deck) { delete pedidas[deck]; }

    /* La dirección de la imagen. Las del curso, directa (el worker pone el
       candado); las subidas, firmada por una hora, y solo si la política del
       bucket deja: al alumno, solo la que se está mostrando. */
    const firmadas = {};
    async function url(deck, d) {
        if (!esSubida(deck)) return carpeta(deck) + d.imagen;
        const ya = firmadas[d.imagen];
        if (ya && ya.vence > Date.now()) return ya.url;
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(d.imagen, 3600);
        if (error || !data || !data.signedUrl) throw new Error("sin_imagen");
        firmadas[d.imagen] = { url: data.signedUrl, vence: Date.now() + 50 * 60 * 1000 };
        return data.signedUrl;
    }

    return { LISTA, BUCKET, carpeta, valida, cargar, olvidar, url, esSubida, tituloDeTexto };
})();

let presentacionActual = null;     // {deck, n} tal como vino de la base (o null)
let presentacionDatos = null;      // los datos de la que se ve
let presentacionPintando = 0;      // para descartar una carga vieja que llega tarde
let presentacionEnviada = null;    // el profe: lo último que mandó, y cuándo
let presentacionEnviadaEn = 0;
let presentacionesMias = null;     // el profe: las que subió (null = sin pedir todavía)
let presentacionCursos = null;     // el profe: los cursos cuyas presentaciones puede mostrar (null = sin preguntar)

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

const PRESENTACION_ERRORES = {
    sin_acceso: "Tu profe está mostrando una presentación, pero tu cuenta no tiene el acceso a la Academia activo para verla.",
    no_disponible: "Esta presentación ya no está disponible (puede que se haya borrado).",
    sin_imagen: "No se pudo abrir esta diapositiva. Si tu profe acaba de pasarla, espera un momento.",
};

/* Lo que llega de la base (applyGameStateRow) y lo que pone el profe. */
async function pintarPresentacion(p, propia) {
    const caja = document.getElementById("presentacion-caja");
    if (!caja) return;
    const nueva = PresentacionClase.valida(p) ? { deck: p.deck, n: p.n } : null;
    if (nueva && p.limpia === true) nueva.limpia = true;
    // Si el profe pasa tres diapositivas seguidas, los ecos de las dos primeras
    // llegan después y lo devolverían atrás: unos segundos, solo vale lo suyo.
    if (!propia && presentacionEsDelProfe() && Date.now() - presentacionEnviadaEn < 3000
        && JSON.stringify(nueva) !== presentacionEnviada) return;
    // El mismo eco de siempre (una jugada, una flecha): no se vuelve a pintar.
    if (presentacionDatos && JSON.stringify(nueva) === JSON.stringify(presentacionActual) && !caja.hidden) return;
    presentacionActual = nueva;
    pintarPresentacionPanel();
    pintarVistaLimpia(nueva);
    const turno = ++presentacionPintando;
    if (!nueva) {
        caja.hidden = true;
        presentacionDatos = null;
        anunciarALaClase("presentacion", null);
        return;
    }
    caja.hidden = false;
    const msg = document.getElementById("presentacion-msg");
    const img = document.getElementById("presentacion-img");
    const fallo = (e) => {
        if (turno !== presentacionPintando) return;
        msg.textContent = PRESENTACION_ERRORES[e && e.message]
            || "No se pudo abrir la presentación. Revisa tu conexión: se vuelve a intentar con la siguiente diapositiva.";
        msg.hidden = false;
        img.removeAttribute("src");
        // Sin la diapositiva, la vista limpia dejaría al alumno sin nada que mirar.
        document.documentElement.classList.remove("vista-limpia");
    };
    let datos, d, src, n;
    try {
        datos = await PresentacionClase.cargar(nueva.deck);
        if (turno !== presentacionPintando) return;
        n = Math.min(nueva.n, datos.diapositivas.length);
        d = datos.diapositivas[n - 1];
        src = await PresentacionClase.url(nueva.deck, d);
    } catch (e) {
        if (turno === presentacionPintando) presentacionDatos = null;
        fallo(e);
        return;
    }
    if (turno !== presentacionPintando) return;
    presentacionDatos = datos;
    msg.hidden = true;
    const total = datos.diapositivas.length;
    img.src = src;
    img.alt = /^Diapositiva \d+$/.test(d.titulo) ? d.titulo : "Diapositiva " + n + ": " + d.titulo;
    document.getElementById("presentacion-titulo").textContent = datos.titulo;
    document.getElementById("presentacion-cuenta").textContent = "Diapositiva " + n + " de " + total;
    document.getElementById("presentacion-texto").textContent = d.texto;
    anunciarALaClase("presentacion", nueva.deck + ":" + n,
        "Tu profe muestra la diapositiva " + n + " de " + total + ": " + d.titulo + ". Su texto está debajo de la imagen.");

    // En el proyector no van los botones ni las notas: es lo que ve la clase.
    const delProfe = presentacionEsDelProfe() && !modoProyector;
    document.getElementById("presentacion-profe").hidden = !delProfe;
    if (!delProfe) return;
    const limpia = document.getElementById("presentacion-limpia");
    limpia.setAttribute("aria-pressed", String(!!nueva.limpia));
    limpia.textContent = nueva.limpia ? "🧹 Vista limpia: encendida" : "🧹 Vista limpia para los alumnos";
    document.getElementById("presentacion-anterior").disabled = n <= 1;
    document.getElementById("presentacion-siguiente").disabled = n >= total;
    const notas = document.getElementById("presentacion-notas");
    notas.hidden = !d.notas;
    notas.textContent = d.notas ? "Notas (solo tú): " + d.notas : "";
    const sigue = document.getElementById("presentacion-sigue");
    sigue.textContent = n < total ? "Sigue: " + datos.diapositivas[n].titulo : "Es la última diapositiva.";
    // Al profe sí se le adelanta la siguiente: así pasa sin esperar a que cargue.
    if (n < total) {
        PresentacionClase.url(nueva.deck, datos.diapositivas[n])
            .then((u) => { const pre = new Image(); pre.src = u; }).catch(() => {});
    }
    pintarPresentacionPosiciones(d, n);
}

function pintarPresentacionPosiciones(d, n) {
    const caja = document.getElementById("presentacion-posiciones");
    caja.innerHTML = "";
    const conPosiciones = presentacionConPosiciones();
    const subida = !!(presentacionDatos && presentacionDatos.subida);
    const lista = conPosiciones && Array.isArray(d.posiciones) ? d.posiciones : [];
    caja.hidden = !conPosiciones || (!lista.length && !subida);
    if (caja.hidden) return;
    if (lista.length) {
        const t = document.createElement("p");
        t.className = "text-xs font-semibold text-brand-700 dark:text-brand-200";
        t.textContent = lista.length === 1 ? "La posición de esta diapositiva:" : "Las posiciones de esta diapositiva:";
        caja.appendChild(t);
    }
    lista.forEach((pos, i) => {
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
        let terminada = true;
        try { terminada = new Chess(pos.fen).game_over(); } catch (e) {}
        if (!terminada) {
            const practicar = presentacionBoton("🎯 Practicar", "Que los alumnos jueguen esta posición contra el motor");
            practicar.addEventListener("click", () => presentacionPracticar(pos));
            fila.appendChild(practicar);
        }
        if (subida) {
            const quitar = presentacionBoton("✕ Quitar", "Quitar esta posición de la diapositiva (no toca el tablero)");
            quitar.setAttribute("aria-label", "Quitar " + pos.nombre + " de la diapositiva");
            quitar.addEventListener("click", () => guardarPosicionesDeDiapositiva(n, lista.filter((_, j) => j !== i), "Se quitó " + pos.nombre + " de la diapositiva."));
            fila.appendChild(quitar);
        }
        caja.appendChild(fila);
    });
    if (subida) {
        const guardar = presentacionBoton("➕ Guardar aquí la posición del tablero",
            "Arma la posición en el tablero (✏️ Armar posición, 📄 PDF o jugando) y guárdala en esta diapositiva: en la clase la mandas con un toque");
        guardar.classList.add("mt-2");
        guardar.addEventListener("click", () => guardarPosicionDelTablero(n, lista));
        caja.appendChild(guardar);
    }
}

async function guardarPosicionDelTablero(n, lista) {
    if (board.freeMode) {
        setStatus("Primero aplica la posición que estás armando (✅ Aplicar posición) y después guárdala en la diapositiva.");
        return;
    }
    const fen = board.fen();
    const motivo = motivoPosicionInvalida(fen);
    if (motivo) { setStatus(motivo); return; }
    if (lista.some((p) => p.fen === fen)) { setStatus("Esa posición ya está guardada en esta diapositiva."); return; }
    if (lista.length >= 8) { setStatus("Una diapositiva lleva hasta 8 posiciones: quita una para guardar otra."); return; }
    const nombre = "Posición " + (lista.length + 1);
    await guardarPosicionesDeDiapositiva(n, lista.concat([{ nombre, fen }]), "Se guardó la posición del tablero en la diapositiva " + n + " como «" + nombre + "».");
}

async function guardarPosicionesDeDiapositiva(n, lista, aviso) {
    const fila = presentacionDatos && presentacionDatos.subida;
    if (!fila) return;
    const nuevas = Object.assign({}, fila.posiciones || {});
    if (lista.length) nuevas[n] = lista; else delete nuevas[n];
    const { error } = await sb.from("presentaciones_profe").update({ posiciones: nuevas }).eq("id", fila.id);
    if (error) { console.error(error); setStatus("No se pudo guardar en la diapositiva: " + error.message); return; }
    fila.posiciones = nuevas;
    presentacionDatos.diapositivas[n - 1].posiciones = lista;
    pintarPresentacionPosiciones(presentacionDatos.diapositivas[n - 1], n);
    setStatus(aviso);
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
        p = Object.assign({}, p, { n: Math.max(1, Math.min(p.n, presentacionDatos.diapositivas.length)) });
    }
    if (p && !p.limpia) delete p.limpia;
    presentacionEnviada = JSON.stringify(p);
    presentacionEnviadaEn = Date.now();
    const local = pintarPresentacion(p, true);
    const { error } = await sb.from("game_state").update({ presentacion: p }).eq("id", myGameStateId);
    await local;
    if (error) { console.error(error); setStatus("No se pudo cambiar la diapositiva: " + error.message); }
}

function pasarDiapositiva(paso) {
    if (!presentacionActual) return;
    mostrarPresentacion(Object.assign({}, presentacionActual, { n: presentacionActual.n + paso }));
}

/* ---------- La vista limpia de los alumnos ----------
   El profe la enciende («🧹 Vista limpia para los alumnos», presentacion.limpia)
   y a cada alumno le queda la diapositiva al lado del tablero, el chat abajo
   y nada más: las preguntas, las prácticas, el calentamiento y la competencia
   le salen encima. Lo hace la clase .vista-limpia en <html> (css/styles.css),
   que esconde por LISTA NEGRA —al revés que el proyector—: lo que se le
   escapa a un alumno es lo que no ve, así que una herramienta nueva para él
   aparece sin que nadie tenga que acordarse. Al profe, al proyector y a quien
   supervisa no se les aplica, y con el Modo Adaptado tampoco (lo dice el CSS). */
function pintarVistaLimpia(p) {
    const limpia = !!(p && p.limpia) && !isTeacher && !esObservador;
    const habia = document.documentElement.classList.contains("vista-limpia");
    document.documentElement.classList.toggle("vista-limpia", limpia);
    anunciarALaClase("vista-limpia", limpia ? "si" : null,
        "Tu profe dejó la clase en vista limpia: la diapositiva, el tablero y el chat. Las preguntas te salen encima.");
    if (habia !== limpia && limpia) window.scrollTo(0, 0);
}

function cambiarVistaLimpia() {
    if (!presentacionActual) return;
    const p = Object.assign({}, presentacionActual);
    if (p.limpia) delete p.limpia; else p.limpia = true;
    mostrarPresentacion(p);
}

/* ---------- Elegir qué presentación compartir (panel «📊 Presentación») ---------- */
function cerrarPanelPresentacion() {
    document.getElementById("presentacion-panel").classList.add("hidden");
    document.getElementById("toggle-presentacion-btn").setAttribute("aria-expanded", "false");
}

function filaDePresentacion(deck, titulo, detalle, alBorrar) {
    const li = document.createElement("li");
    li.className = "bg-brand-50 dark:bg-brand-950 rounded-lg px-3 py-2";
    const t = document.createElement("p");
    t.className = "text-sm font-semibold text-brand-800 dark:text-white break-words";
    t.textContent = titulo;   // el título de una subida lo escribió el profe: textContent
    li.appendChild(t);
    if (detalle) {
        const dd = document.createElement("p");
        dd.className = "text-xs text-brand-450 dark:text-brand-350";
        dd.textContent = detalle;
        li.appendChild(dd);
    }
    const acciones = document.createElement("div");
    acciones.className = "flex flex-wrap gap-1.5 mt-2";
    const enCurso = presentacionActual && presentacionActual.deck === deck;
    if (enCurso) {
        const quitar = presentacionBoton("⏹ Quitar de la clase", "Dejar de mostrar la presentación a la clase");
        quitar.addEventListener("click", () => mostrarPresentacion(null));
        acciones.appendChild(quitar);
    } else {
        const mostrar = presentacionBoton("▶ Mostrar a la clase", "Mostrar la primera diapositiva a toda la clase, arriba del tablero", true);
        mostrar.addEventListener("click", () => {
            // Si ya estaba en vista limpia, la siguiente presentación sigue igual.
            const limpia = !!(presentacionActual && presentacionActual.limpia);
            mostrarPresentacion(limpia ? { deck: deck, n: 1, limpia: true } : { deck: deck, n: 1 });
            cerrarPanelPresentacion();
        });
        acciones.appendChild(mostrar);
    }
    if (alBorrar) {
        const borrar = presentacionBoton("🗑 Borrar", "Borrar esta presentación de tu lista");
        borrar.setAttribute("aria-label", "Borrar la presentación " + titulo);
        borrar.addEventListener("click", alBorrar);
        acciones.appendChild(borrar);
    }
    li.appendChild(acciones);
    return li;
}

function pintarPresentacionPanel() {
    const ul = document.getElementById("presentacion-panel-lista");
    if (!ul) return;
    ul.innerHTML = "";
    // Las del curso, solo las que le compartieron (admin.html#asesores).
    const delCurso = PresentacionClase.LISTA.filter((pr) => presentacionCursos && presentacionCursos.has(pr.deck.split("/")[0]));
    delCurso.forEach((pr) => ul.appendChild(filaDePresentacion(pr.deck, pr.titulo, "Del curso")));
    if (!delCurso.length) {
        const li = document.createElement("li");
        li.className = "text-xs text-brand-500 dark:text-brand-300";
        li.textContent = presentacionCursos ? "Ninguna compartida contigo todavía." : "Buscando…";
        ul.appendChild(li);
    }
    const mias = document.getElementById("presentacion-panel-mias");
    const vacia = document.getElementById("presentacion-panel-vacia");
    mias.innerHTML = "";
    vacia.hidden = !(presentacionesMias && !presentacionesMias.length);
    (presentacionesMias || []).forEach((pr) => {
        mias.appendChild(filaDePresentacion("subida/" + pr.id, pr.titulo,
            pr.paginas + (pr.paginas === 1 ? " diapositiva" : " diapositivas"), () => borrarPresentacion(pr)));
    });
}

/* Las presentaciones de un curso a medida («Formación Ajedrez») son de quien
   administra y de quien se las comparte (admin.html#asesores). Se pregunta lo
   mismo que el worker a los cursos escondidos: puede_bajar() sin que el acceso
   a la Academia baste. */
async function cargarCursosDePresentacion() {
    const cursos = [...new Set(PresentacionClase.LISTA.map((pr) => pr.deck.split("/")[0]))];
    const si = new Set();
    await Promise.all(cursos.map(async (curso) => {
        const { data, error } = await sb.rpc("puede_bajar", { p_producto: curso, p_basta_acceso: false });
        if (error) console.error(error);
        else if (data === true) si.add(curso);
    }));
    presentacionCursos = si;
    pintarPresentacionPanel();
}

async function cargarMisPresentaciones() {
    const { data, error } = await sb.from("presentaciones_profe").select("id, titulo, paginas, formato, created_at")
        .eq("profesor_id", session.user.id).order("created_at", { ascending: false });
    if (error) { console.error(error); avisoSubida("No se pudo cargar tu lista de presentaciones."); return; }
    presentacionesMias = data || [];
    pintarPresentacionPanel();
}

function avisoSubida(texto) {
    document.getElementById("presentacion-subir-msg").textContent = texto || "";
}

async function borrarPresentacion(pr) {
    const ok = await Avisos.confirmar("Se borra de tu lista con todas sus diapositivas y las posiciones que guardaste. El PDF que tienes en tu computadora no se toca.",
        { titulo: "¿Borrar «" + pr.titulo + "»?", aceptar: "Borrar la presentación", cancelar: "No, dejarla", peligro: true });
    if (!ok) return;
    const deck = "subida/" + pr.id;
    if (presentacionActual && presentacionActual.deck === deck) await mostrarPresentacion(null);
    const rutas = Array.from({ length: pr.paginas }, (_, i) => session.user.id + "/" + pr.id + "/" + (i + 1) + "." + pr.formato);
    const { error: e1 } = await sb.storage.from(PresentacionClase.BUCKET).remove(rutas);
    if (e1) { console.error(e1); avisoSubida("No se pudieron borrar sus imágenes: " + e1.message); return; }
    const { error } = await sb.from("presentaciones_profe").delete().eq("id", pr.id);
    if (error) { console.error(error); avisoSubida("No se pudo borrar: " + error.message); return; }
    PresentacionClase.olvidar(deck);
    presentacionesMias = (presentacionesMias || []).filter((x) => x.id !== pr.id);
    pintarPresentacionPanel();
    avisoSubida("Se borró «" + pr.titulo + "».");
}

/* ---------- Subir una presentación: un PDF, una imagen por página ----------
   pdf.js (el mismo de «📄 PDF», vendorizado) dibuja cada página a 1600 px de
   ancho y se guarda en WebP (o JPG si el navegador no sabe hacer WebP, como
   Safari viejo), con el texto de la página para el lector de pantalla. Se
   suben las imágenes y RECIÉN después la fila: una subida a medias no aparece
   en la lista, y lo que alcanzó a subir se borra. */
const PRESENTACION_MAX_PAGINAS = 200;
const PRESENTACION_MAX_MB = 60;
const PRESENTACION_TOPE_IMAGEN = 3 * 1024 * 1024; // el del bucket

let presentacionPdfjs = null;
function cargarPdfjsPresentacion() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!presentacionPdfjs) {
        presentacionPdfjs = new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "js/pdf.min.js";
            s.onload = () => (window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error("sin pdfjsLib")));
            s.onerror = () => reject(new Error("no se pudo bajar pdf.js"));
            document.head.appendChild(s);
        }).catch((e) => { presentacionPdfjs = null; throw e; });
    }
    return presentacionPdfjs;
}

function textoDePagina(contenido) {
    let s = "";
    (contenido.items || []).forEach((it) => { s += (it.str || "") + (it.hasEOL ? "\n" : " "); });
    return s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim().slice(0, 4000);
}

function lienzoABlob(canvas, tipo, calidad) {
    return new Promise((r) => canvas.toBlob(r, tipo, calidad));
}

async function subirPresentacion(archivo, tituloEscrito) {
    if (!archivo) { avisoSubida("Elige el PDF de tu presentación."); return false; }
    if (!(archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name))) {
        avisoSubida("Tiene que ser un PDF. En PowerPoint: Archivo → Exportar → PDF. En Google Slides: Archivo → Descargar → PDF.");
        return false;
    }
    if (archivo.size > PRESENTACION_MAX_MB * 1024 * 1024) {
        avisoSubida("El PDF pesa más de " + PRESENTACION_MAX_MB + " MB. Expórtalo con las imágenes comprimidas y vuelve a intentarlo.");
        return false;
    }
    const titulo = (String(tituloEscrito || "").trim() || archivo.name.replace(/\.pdf$/i, "")).slice(0, 120);
    avisoSubida("Preparando el lector de PDF…");
    let doc;
    try {
        const pdfjs = await cargarPdfjsPresentacion();
        if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = "js/pdf.worker.min.js";
        doc = await pdfjs.getDocument({ data: await archivo.arrayBuffer() }).promise;
    } catch (e) {
        console.error(e);
        avisoSubida("No se pudo leer ese PDF. ¿Está protegido con contraseña o dañado?");
        return false;
    }
    const total = doc.numPages;
    if (total > PRESENTACION_MAX_PAGINAS) {
        avisoSubida("Tiene " + total + " páginas: el tope es " + PRESENTACION_MAX_PAGINAS + ". Pártela en dos presentaciones.");
        return false;
    }
    const id = crypto.randomUUID();
    const base = session.user.id + "/" + id + "/";
    const subidas = [];
    const textos = [];
    let formato = null;
    const deshacer = async (texto) => {
        if (subidas.length) await sb.storage.from(PresentacionClase.BUCKET).remove(subidas);
        avisoSubida(texto);
        return false;
    };
    for (let n = 1; n <= total; n++) {
        avisoSubida("Preparando la diapositiva " + n + " de " + total + "…");
        let blob;
        try {
            const pagina = await doc.getPage(n);
            const v1 = pagina.getViewport({ scale: 1 });
            const vista = pagina.getViewport({ scale: 1600 / v1.width });
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(vista.width);
            canvas.height = Math.round(vista.height);
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
            textos.push(textoDePagina(await pagina.getTextContent()));
            if (!formato) {
                blob = await lienzoABlob(canvas, "image/webp", 0.8);
                formato = blob && blob.type === "image/webp" ? "webp" : "jpg";
            }
            if (!blob || formato === "jpg") blob = await lienzoABlob(canvas, formato === "webp" ? "image/webp" : "image/jpeg", 0.85);
            if (blob && blob.size > PRESENTACION_TOPE_IMAGEN) blob = await lienzoABlob(canvas, formato === "webp" ? "image/webp" : "image/jpeg", 0.55);
            pagina.cleanup();
        } catch (e) {
            console.error(e);
            return deshacer("No se pudo dibujar la página " + n + " del PDF.");
        }
        if (!blob || blob.size > PRESENTACION_TOPE_IMAGEN) return deshacer("La página " + n + " queda demasiado pesada aun comprimida.");
        const ruta = base + n + "." + formato;
        const { error } = await sb.storage.from(PresentacionClase.BUCKET).upload(ruta, blob, { contentType: blob.type, upsert: false });
        if (error) { console.error(error); return deshacer("No se pudo subir la diapositiva " + n + ": " + error.message); }
        subidas.push(ruta);
    }
    const fila = { id, profesor_id: session.user.id, titulo, paginas: total, formato, textos };
    const { error } = await sb.from("presentaciones_profe").insert(fila);
    if (error) { console.error(error); return deshacer("No se pudo guardar la presentación: " + error.message); }
    presentacionesMias = [Object.assign({ created_at: new Date().toISOString() }, fila)].concat(presentacionesMias || []);
    pintarPresentacionPanel();
    avisoSubida("Lista: «" + titulo + "», " + total + (total === 1 ? " diapositiva" : " diapositivas") + ". Ya la puedes mostrar a la clase.");
    return true;
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
        if (abrir) {
            pintarPresentacionPanel();
            if (presentacionesMias === null) cargarMisPresentaciones();
            if (presentacionCursos === null) cargarCursosDePresentacion();
        }
    });
    document.getElementById("presentacion-panel-close-btn").addEventListener("click", cerrarPanelPresentacion);
    const form = document.getElementById("presentacion-subir");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const enviar = document.getElementById("presentacion-subir-btn");
        const archivo = document.getElementById("presentacion-subir-archivo");
        enviar.disabled = true;
        try {
            const ok = await subirPresentacion(archivo.files && archivo.files[0], document.getElementById("presentacion-subir-titulo").value);
            if (ok) form.reset();
        } finally {
            enviar.disabled = false;
        }
    });
}

/* ---------- En pantalla completa, el tablero de la clase en pequeño ----------
   La tarjeta a pantalla completa tapa el tablero, y el profe muchas veces
   explica ahí. Abajo a la derecha va una COPIA de lo que muestra #chessboard
   (la posición, la jugada que está mirando el profe, las flechas, el lado),
   que se vuelve a copiar con cada cambio (un MutationObserver, solo mientras
   dura la pantalla completa). Copiarlo y no dibujarlo aparte es lo que hace
   que muestre exactamente lo mismo, también la vista del profe y las piezas
   ocultas. Cada quien lo oculta o lo muestra en su aparato. */
const MINI_CLAVE = "presentacion_mini_tablero_v1";
let miniObservador = null;
let miniPendiente = false;

function miniQuiereVerse() {
    try { return localStorage.getItem(MINI_CLAVE) !== "0"; } catch (e) { return true; }
}

function copiarTableroMini() {
    miniPendiente = false;
    const mini = document.getElementById("presentacion-mini");
    const fuente = document.getElementById("chessboard");
    if (!mini || !fuente || mini.hidden) return;
    const copia = fuente.cloneNode(true);
    copia.removeAttribute("id");
    copia.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    copia.querySelectorAll("[tabindex]").forEach((el) => el.setAttribute("tabindex", "-1"));
    mini.replaceChildren(copia);
    // La pieza se mide sobre la casilla: la copia es más chica que el original.
    requestAnimationFrame(() => {
        const casilla = copia.querySelector("[data-square]");
        if (!casilla) return;
        const ancho = casilla.getBoundingClientRect().width;
        if (!ancho) return;
        const px = Math.max(6, ancho * (copia.querySelector(".chess-piece-illustrated") ? 0.82 : 0.62));
        copia.querySelectorAll("[data-square]").forEach((sq) => { sq.style.fontSize = px + "px"; });
    });
}

function programarCopiaMini() {
    if (miniPendiente) return;
    miniPendiente = true;
    requestAnimationFrame(copiarTableroMini);
}

function pintarTableroMini() {
    const caja = document.getElementById("presentacion-caja");
    const mini = document.getElementById("presentacion-mini");
    const btn = document.getElementById("presentacion-mini-btn");
    const fuente = document.getElementById("chessboard");
    const ver = document.fullscreenElement === caja && miniQuiereVerse();
    mini.hidden = !ver;
    btn.textContent = miniQuiereVerse() ? "♟ Ocultar el tablero" : "♟ Ver el tablero";
    btn.setAttribute("aria-expanded", String(ver));
    if (ver && fuente) {
        copiarTableroMini();
        if (!miniObservador) {
            miniObservador = new MutationObserver(programarCopiaMini);
            miniObservador.observe(fuente, { subtree: true, childList: true, attributes: true, characterData: true });
        }
    } else {
        if (miniObservador) { miniObservador.disconnect(); miniObservador = null; }
        mini.replaceChildren();
    }
}

document.addEventListener("fullscreenchange", pintarTableroMini);
document.getElementById("presentacion-mini-btn").addEventListener("click", () => {
    try { localStorage.setItem(MINI_CLAVE, miniQuiereVerse() ? "0" : "1"); } catch (e) {}
    pintarTableroMini();
});

// Lo de todos: pantalla completa. Lo del profe: ◀ ▶ y quitar (también con el teclado en pantalla completa).
document.getElementById("presentacion-completa").addEventListener("click", () => {
    const caja = document.getElementById("presentacion-caja");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (caja.requestFullscreen) caja.requestFullscreen().catch(() => {});
});
document.getElementById("presentacion-anterior").addEventListener("click", () => pasarDiapositiva(-1));
document.getElementById("presentacion-siguiente").addEventListener("click", () => pasarDiapositiva(1));
document.getElementById("presentacion-quitar").addEventListener("click", () => mostrarPresentacion(null));
document.getElementById("presentacion-limpia").addEventListener("click", cambiarVistaLimpia);
document.getElementById("presentacion-caja").addEventListener("keydown", (e) => {
    if (!presentacionEsDelProfe() || document.fullscreenElement !== e.currentTarget) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); pasarDiapositiva(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); pasarDiapositiva(-1); }
});
