/* El código de asistencia.html.

   Vivía escrito dentro de la página, en un <script> de 34 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Ficha de asistencia presencial.
 *
 * UNA CLASE PRESENCIAL ES UNA `class_sessions` MÁS, no una tabla aparte, y eso
 * es lo único importante de esta pantalla: todo lo que el sitio sabe de una
 * clase —la asistencia, los minutos, el «asistió a 4 de 5» del informe a la
 * casa, el reporte de actividades y el «clases este mes» del panel— cuelga de
 * `class_sessions` + `class_attendance`. Con una tabla propia habría que tocar
 * las cuatro funciones que las leen, y las cuatro se irían separando a la
 * primera corrección. Acá no se agrega nada a los informes: la ficha ENTRA
 * sola porque es el mismo tipo de fila.
 *
 * Lo que la distingue es `modalidad = 'presencial'` y que nace CERRADA
 * (`ended_at` puesto), que es lo que hace que no choque con el índice único de
 * «una sola clase abierta por profesor» ni dispare el aviso push de «Empezó la
 * clase» — ver la migración ficha_de_asistencia_presencial.
 *
 * Guardar es UNA sola llamada, `guardar_clase_presencial()`: partido en dos
 * —la clase y después la lista— si la segunda mitad falla queda una clase con
 * cero asistentes, que en el reporte se lee como una clase a la que no fue
 * nadie. La misma decisión de crear_tarea().
 */
let session = null;
let alumnos = [];
let marcados = new Set();
/* Quién llegó tarde y cuántos minutos: `id → minutos`. Va aparte de
   `marcados` y no como un valor dentro de él porque son dos preguntas
   distintas —«¿vino?» y «¿a qué hora?»— y la primera se contesta marcando una
   casilla, que es lo que se hace veinte veces seguidas. Vacío = todos a
   tiempo, que es el caso de casi todas las clases. */
let tarde = new Map();
let fichas = [];
let totalFichas = 0;
let editando = null;          // id de la ficha que se está corrigiendo
let busqueda = "";
let horario = [];             // las clases fijas de la semana (horario_clases vigentes)
let subgrupos = [];           // los suyos, para «con quiénes» del horario

const POR_PAGINA = 10;

function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
}

/* Sin tildes, como el buscador de admin.html y el de subgrupos: quien escribe
   "ramirez" tiene que encontrar a "Ramírez". */
function pelado(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function nombreDe(a) { return a.full_name || a.email || "Sin nombre"; }

/* Los mensajes salen por js/avisos.js, como en todo el sitio: arriba, se
   ven aunque uno haya bajado en la página, y los de error no se van solos
   (ver «Los avisos son de la página, no del navegador»). */
function avisar(texto, malo) { Avisos.avisar(texto, { tipo: malo ? "error" : "ok" }); }

function duracionLarga(min) {
    if (!min) return "—";
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + " min";
    return h + " h" + (m ? " " + m + " min" : "");
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fechaLarga(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear() +
           ", " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/* ------------------------------------------------------------ la fecha y la hora
   Los dos campos son LOCALES —lo que el profesor tiene en su reloj— y lo que
   viaja es un instante. Armarlo con `new Date(y, m, d, hh, mm)` usa el huso de
   su computadora, que es el de la clase; pegar los dos textos y mandarlos como
   si fueran UTC le correría la clase seis horas sin dar ningún error: quedaría
   fechada el día siguiente en el informe. */
function instante() {
    const f = document.getElementById("fecha").value;
    const h = document.getElementById("hora").value;
    if (!f || !h) return null;
    const [y, m, d] = f.split("-").map(Number);
    const [hh, mm] = h.split(":").map(Number);
    const fecha = new Date(y, m - 1, d, hh, mm, 0, 0);
    return isNaN(fecha.getTime()) ? null : fecha;
}

function ponerInstante(iso) {
    const d = iso ? new Date(iso) : new Date();
    const p = (n) => String(n).padStart(2, "0");
    document.getElementById("fecha").value = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    document.getElementById("hora").value = p(d.getHours()) + ":" + p(d.getMinutes());
}

/* ------------------------------------------------------------ pasar lista
   LAS CASILLAS SE PINTAN TODAS UNA VEZ Y EL BUSCADOR SOLO LAS ESCONDE, no las
   saca del DOM. Dos razones, y la segunda es la que se rompe callada:
     · repintar en cada tecla le quitaría el foco a quien está escribiendo;
     · `SubgruposMarcar` recorre `.alumno-chk` para marcar a los del subgrupo y
       DESMARCAR al resto — con media lista fuera del DOM por una búsqueda, los
       que estuvieran escondidos se quedarían marcados sin que nada lo dijera, y
       la ficha saldría con gente que no fue.
   Escondidas con `hidden` (o sea `display:none`), así que tampoco dejan una
   parada de tabulador fantasma. */
function pintarCasillas() {
    const caja = document.getElementById("casillas");
    caja.innerHTML = "";
    document.getElementById("sin-alumnos").classList.toggle("hidden", alumnos.length > 0);
    alumnos.forEach((a) => {
        /* La fila es un <div> y el <label> va DENTRO, envolviendo solo la
           casilla y el nombre. Con el recuadro de minutos dentro del label,
           tocarlo para escribir habría desmarcado al alumno — el clic en
           cualquier hijo de un label activa su control. */
        const fila = el("div", "alumno-fila flex items-center gap-2 text-sm text-brand-700 dark:text-brand-200 px-1 py-1 rounded hover:bg-white dark:hover:bg-brand-900");
        fila.dataset.buscar = pelado(nombreDe(a) + " " + (a.grupo || ""));

        const label = el("label", "flex items-center gap-2 flex-1 min-w-0 cursor-pointer");
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.className = "alumno-chk rounded border-brand-300 text-accent-500 focus:ring-accent-400 shrink-0";
        chk.value = a.id;
        chk.checked = marcados.has(a.id);
        label.appendChild(chk);
        // El nombre lo escribe una persona: siempre por textContent.
        label.appendChild(el("span", "truncate", nombreDe(a) + (a.grupo ? " · " + a.grupo : "")));
        fila.appendChild(label);

        const min = document.createElement("input");
        min.type = "number";
        min.min = "0";
        min.inputMode = "numeric";
        min.placeholder = "tarde";
        min.value = tarde.has(a.id) ? String(tarde.get(a.id)) : "";
        min.className = "tarde-min w-16 shrink-0 bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 rounded-lg px-1.5 py-0.5 text-xs text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        min.dataset.alumno = a.id;
        // El nombre va en la etiqueta accesible: con veinte recuadros iguales,
        // «Minutos tarde» a secas no dice de quién es el que tiene el foco.
        min.setAttribute("aria-label", "Minutos que llegó tarde " + nombreDe(a));
        min.title = "Minutos que llegó tarde. En blanco es a tiempo.";
        // Solo se ofrece sobre quien está marcado: preguntar a qué hora llegó
        // quien no vino no significa nada, y la base lo rechaza.
        min.hidden = !chk.checked;
        min.addEventListener("input", () => {
            const n = parseInt(min.value, 10);
            if (min.value.trim() === "" || isNaN(n) || n <= 0) tarde.delete(a.id);
            else tarde.set(a.id, n);
            pintarCuenta();
        });
        fila.appendChild(min);

        chk.addEventListener("change", () => {
            if (chk.checked) { marcados.add(a.id); }
            else {
                marcados.delete(a.id);
                /* Y se le borra la tardanza. Dejarla colgada haría que la base
                   rechazara el guardado entero con «hay una tardanza de alguien
                   que no está marcado», por algo que quien pasa lista ya
                   corrigió en pantalla. */
                tarde.delete(a.id);
                min.value = "";
            }
            min.hidden = !chk.checked;
            pintarCuenta();
        });

        caja.appendChild(fila);
    });
    caja.appendChild(el("p", "sin-coincidencias hidden text-sm text-brand-450 dark:text-brand-350 p-2 sm:col-span-2", "Ninguno coincide con eso."));
    filtrar();
    pintarCuenta();
}

function filtrar() {
    const q = pelado(busqueda);
    let visibles = 0;
    document.querySelectorAll(".alumno-fila").forEach((f) => {
        const cabe = !q || f.dataset.buscar.includes(q);
        f.hidden = !cabe;
        if (cabe) visibles += 1;
    });
    const nada = document.querySelector(".sin-coincidencias");
    if (nada) nada.classList.toggle("hidden", visibles > 0 || !alumnos.length);
}

/* Cuántos van marcados se dice SIEMPRE y al lado del botón. Pasar lista de
   veinte alumnos es marcar veinte casillas en una caja con scroll: sin el
   número, guardar con quince es un error que solo se descubre leyendo el
   informe del mes. */
function pintarCuenta() {
    const n = marcados.size;
    // Las tardías se cuentan solo entre los marcados: una que quedara de un
    // alumno ya desmarcado inflaría el número y la base rechazaría el guardado.
    const t = [...tarde.keys()].filter((id) => marcados.has(id)).length;
    document.getElementById("cuenta").textContent = (n === 0
        ? "Nadie marcado"
        : (n === 1 ? "1 alumno llegó" : n + " alumnos llegaron") + " de " + alumnos.length)
        + (t ? " · " + (t === 1 ? "1 llegó tarde" : t + " llegaron tarde") : "");
}

function marcarTodos(si) {
    marcados = si ? new Set(alumnos.map((a) => a.id)) : new Set();
    if (!si) tarde = new Map();          // sin nadie marcado no hay tardanza que valga
    document.querySelectorAll(".alumno-chk").forEach((c) => { c.checked = si; });
    document.querySelectorAll(".tarde-min").forEach((m) => {
        m.hidden = !si;
        if (!si) m.value = "";
    });
    pintarCuenta();
}

/* ------------------------------------------------------------ cargar */
async function cargarAlumnos() {
    const { data, error } = await sb.rpc("alumnos_del_profesor_con_nombre", { p_profesor: session.user.id });
    // Que la consulta falle y la pantalla pinte una lista vacía es el fallo
    // callado de siempre: se lee igual que "no tienes alumnos".
    if (error) { avisar("No se pudo cargar tu lista de alumnos: " + error.message, true); return false; }
    alumnos = data || [];
    return true;
}

async function cargarFichas(desde) {
    const inicio = desde || 0;
    const { data, error, count } = await sb
        .from("class_sessions")
        .select("id, title, started_at, ended_at, notes, class_attendance(student_id, minutos_tarde)", { count: "exact" })
        .eq("modalidad", "presencial")
        .eq("created_by", session.user.id)
        .order("started_at", { ascending: false })
        .range(inicio, inicio + POR_PAGINA - 1);
    if (error) { avisar("No se pudieron cargar tus clases presenciales: " + error.message, true); return false; }
    totalFichas = count || 0;
    fichas = inicio === 0 ? (data || []) : fichas.concat(data || []);
    return true;
}

function minutosDe(f) {
    if (!f.ended_at) return null;
    return Math.round((new Date(f.ended_at) - new Date(f.started_at)) / 60000);
}

function pintarFichas() {
    const caja = document.getElementById("lista");
    caja.innerHTML = "";
    document.getElementById("vacio").classList.toggle("hidden", fichas.length > 0);
    document.getElementById("conteo-fichas").textContent = totalFichas
        ? "Mostrando " + fichas.length + " de " + totalFichas
        : "";
    document.getElementById("ver-mas").classList.toggle("hidden", fichas.length >= totalFichas);

    fichas.forEach((f) => {
        const tarjeta = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4" +
            (editando === f.id ? " ring-2 ring-accent-400" : ""));
        const fila = el("div", "flex flex-wrap items-start justify-between gap-3");

        const izq = el("div", "flex-1 min-w-[12rem]");
        izq.appendChild(el("p", "font-semibold text-brand-800 dark:text-white", f.title || "Clase sin título"));
        const cuantos = (f.class_attendance || []).length;
        const tardios = (f.class_attendance || []).filter((a) => (a.minutos_tarde || 0) > 0).length;
        izq.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350",
            fechaLarga(f.started_at) + " · " + duracionLarga(minutosDe(f)) + " · " +
            (cuantos === 1 ? "1 asistente" : cuantos + " asistentes") +
            (tardios ? " · " + (tardios === 1 ? "1 llegó tarde" : tardios + " llegaron tarde") : "")));
        if ((f.notes || "").trim()) {
            izq.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300 mt-2", f.notes.trim()));
        }
        fila.appendChild(izq);

        const der = el("div", "flex gap-2 shrink-0");
        const btnEditar = el("button", "bg-brand-700 hover:bg-brand-800 text-white font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "✏️ Corregir");
        btnEditar.type = "button";
        btnEditar.addEventListener("click", () => editar(f));
        der.appendChild(btnEditar);

        const btnBorrar = el("button", "border border-brand-200 dark:border-brand-700 hover:border-red-400 text-red-600 dark:text-red-400 font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Borrar");
        btnBorrar.type = "button";
        btnBorrar.dataset.confirmar = "no";
        /* La confirmación va en el propio botón y no en un diálogo del
           navegador: esto se toca desde el celular al terminar la clase, y ahí
           el diálogo tapa la pantalla. El segundo toque dice qué se pierde. */
        btnBorrar.addEventListener("click", () => {
            if (btnBorrar.dataset.confirmar === "no") {
                btnBorrar.dataset.confirmar = "si";
                btnBorrar.textContent = "¿Seguro? Se va del informe";
                return;
            }
            borrar(f);
        });
        der.appendChild(btnBorrar);
        fila.appendChild(der);

        tarjeta.appendChild(fila);
        caja.appendChild(tarjeta);
    });
}

function editar(f) {
    editando = f.id;
    document.getElementById("ficha-titulo").textContent = "Corrigiendo una clase ya guardada";
    document.getElementById("titulo").value = f.title || "";
    document.getElementById("notas").value = f.notes || "";
    ponerInstante(f.started_at);
    document.getElementById("minutos").value = minutosDe(f) || 60;
    marcados = new Set((f.class_attendance || []).map((a) => a.student_id));
    tarde = new Map((f.class_attendance || [])
        .filter((a) => (a.minutos_tarde || 0) > 0)
        .map((a) => [a.student_id, a.minutos_tarde]));
    document.getElementById("guardar").textContent = "Guardar los cambios";
    document.getElementById("cancelar").classList.remove("hidden");
    busqueda = "";
    document.getElementById("buscar").value = "";
    pintarCasillas();
    pintarFichas();
    document.getElementById("ficha").scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("titulo").focus();
}

function limpiar() {
    editando = null;
    document.getElementById("ficha-titulo").textContent = "Una clase nueva";
    document.getElementById("titulo").value = "";
    document.getElementById("notas").value = "";
    document.getElementById("minutos").value = 60;
    ponerInstante(null);
    marcados = new Set();
    tarde = new Map();
    document.getElementById("guardar").textContent = "Guardar la ficha";
    document.getElementById("cancelar").classList.add("hidden");
    document.getElementById("guardar").dataset.confirmar = "no";
    pintarCasillas();
    pintarFichas();
}

async function borrar(f) {
    const { error } = await sb.from("class_sessions").delete().eq("id", f.id);
    if (error) return avisar("No se pudo borrar: " + error.message, true);
    if (editando === f.id) limpiar();
    avisar("Clase borrada. Sus asistencias se fueron con ella, así que ya no cuenta en ningún informe.");
    if (await cargarFichas(0)) pintarFichas();
}

async function guardar(ev) {
    ev.preventDefault();
    const boton = document.getElementById("guardar");
    const cuando = instante();
    if (!cuando) return avisar("Falta el día o la hora de la clase.", true);
    const minutos = parseInt(document.getElementById("minutos").value, 10);
    if (!minutos || minutos < 5 || minutos > 600) {
        return avisar("La clase tiene que durar entre 5 y 600 minutos.", true);
    }

    /* Solo viajan las tardanzas de quien está marcado, y solo las que caben
       dentro de la clase. Las dos cosas las rechaza también la base —es ella
       la que manda— pero acá se dice CON EL NOMBRE: un «no se pudo guardar»
       sobre veinte casillas deja a quien pasó lista sin saber cuál arreglar. */
    const tardanzas = {};
    for (const [id, min] of tarde) {
        if (!marcados.has(id)) continue;
        if (min >= minutos) {
            const quien = alumnos.find((a) => a.id === id);
            return avisar("A " + (quien ? nombreDe(quien) : "ese alumno") + " le pusiste " + min +
                " minutos tarde en una clase de " + minutos + ": eso no es llegar tarde, es no llegar. " +
                "Si no vino, desmárcalo.", true);
        }
        tardanzas[id] = min;
    }

    /* Guardar sin nadie marcado es decir «no fue nadie», y eso es una cosa que
       de verdad pasa —se cuenta la clase, la asistencia queda en cero— pero es
       también lo que sale al apretar Guardar antes de pasar lista. Se pide un
       segundo toque con lo que va a pasar escrito encima, en el propio botón. */
    if (marcados.size === 0 && boton.dataset.confirmar !== "si") {
        boton.dataset.confirmar = "si";
        boton.textContent = "No llegó nadie — guardar así";
        return;
    }

    boton.disabled = true;
    const textoAntes = editando ? "Guardar los cambios" : "Guardar la ficha";
    boton.textContent = "Guardando…";
    const { error } = await sb.rpc("guardar_clase_presencial", {
        p_titulo: document.getElementById("titulo").value,
        p_inicio: cuando.toISOString(),
        p_minutos: minutos,
        p_notas: document.getElementById("notas").value,
        p_alumnos: [...marcados],
        p_id: editando,
        p_tarde: tardanzas,
    });
    boton.disabled = false;
    boton.textContent = textoAntes;
    boton.dataset.confirmar = "no";
    if (error) {
        // El mensaje de la base es el que dice qué arreglar («la clase todavía
        // no ha pasado»); un «no se pudo guardar» a secas deja al profesor sin
        // saber qué cambiar.
        return avisar("No se pudo guardar: " + error.message, true);
    }

    const cuantos = marcados.size;
    const tardios = Object.keys(tardanzas).length;
    avisar((editando ? "Ficha corregida. " : "Clase guardada. ") +
        (cuantos === 0 ? "Quedó registrada sin asistentes." :
            (cuantos === 1 ? "1 alumno queda" : cuantos + " alumnos quedan") +
            " con su asistencia y sus " + duracionLarga(minutos) + " de clase.") +
        (tardios ? " " + (tardios === 1 ? "1 llegó tarde y se le cuentan" : tardios + " llegaron tarde y se les cuentan") +
            " menos minutos." : "") +
        " Ya cuenta en Informes y en el reporte de actividades.");
    limpiar();
    if (await cargarFichas(0)) pintarFichas();
}

/* ------------------------------------------------------------ el horario
   El horario es lo que hace que la ficha se llene sola. Tres cosas que no son
   de estilo:
     · LA FECHA SE CUENTA EN HORA DE COSTA RICA, igual que en la base: el aviso
       de la ficha que falta y el «dio 7 de 8» del informe comparan por día de
       Costa Rica, y una ficha llenada con el día de otro huso no le taparía el
       aviso a nadie.
     · QUITAR NO BORRA, CIERRA: se le pone `hasta` en ayer. Borrarlo le quitaría
       al informe de los meses pasados las clases que sí estaban programadas, y
       el «7 de 8» de agosto pasaría a «7 de 0» sin que nadie lo tocara. Solo se
       borra de verdad el que se agregó hoy mismo, que no tiene historia.
     · LOS ALUMNOS DEL GRUPO NACEN MARCADOS, y el aviso lo dice con el número:
       pasar lista de doce es desmarcar a los dos que faltaron, no marcar a los
       diez que vinieron. Lo peligroso de eso es guardar sin mirar, y por eso
       el aviso no dice «listo» sino «desmarca a quien no llegó». */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function hoyCR() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
}
function sumarDias(fecha, n) {
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function diaDe(fecha) {
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
/* La última vez que tocaba esa clase, hoy incluido. */
function ultimaFecha(h) {
    const hoy = hoyCR();
    return sumarDias(hoy, -((diaDe(hoy) - h.dia_semana + 7) % 7));
}
function horaCorta(h) { return String(h.hora || "").slice(0, 5); }
function quienesDe(h) {
    if (h.subgrupo_id) {
        const sg = subgrupos.find((x) => x.id === h.subgrupo_id);
        return sg ? "Subgrupo «" + sg.nombre + "»" : "";
    }
    return h.grupo ? "Grupo " + h.grupo : "";
}
function alumnosDelHorario(h) {
    if (h.subgrupo_id) {
        const sg = subgrupos.find((x) => x.id === h.subgrupo_id);
        const ids = new Set(sg ? sg.alumnos || [] : []);
        return alumnos.filter((a) => ids.has(a.id)).map((a) => a.id);
    }
    if (h.grupo) {
        const g = pelado(h.grupo).trim();
        return alumnos.filter((a) => pelado(a.grupo).trim() === g).map((a) => a.id);
    }
    return [];
}

function pintarHorario() {
    const lista = document.getElementById("horario-lista");
    lista.innerHTML = "";
    document.getElementById("horario-vacio").classList.toggle("hidden", horario.length > 0);
    horario.forEach((h) => {
        const li = el("li", "horario-fila flex flex-wrap items-center justify-between gap-2 bg-brand-50 dark:bg-brand-950 rounded-xl px-3 py-2");
        li.dataset.horario = h.id;
        const partes = [DIAS[h.dia_semana].replace(/^./, (c) => c.toUpperCase()) + " " + horaCorta(h),
            duracionLarga(h.duracion_min), quienesDe(h), h.modalidad === "en_linea" ? "En la plataforma" : "En el aula"]
            .filter(Boolean);
        const txt = el("div", "min-w-0");
        // El título y el grupo los escribe una persona: siempre por textContent.
        if (h.titulo) txt.appendChild(el("p", "text-sm font-semibold text-brand-800 dark:text-white", h.titulo));
        txt.appendChild(el("p", "text-sm text-brand-600 dark:text-brand-300", partes.join(" · ")));
        li.appendChild(txt);

        const botones = el("div", "flex gap-2 shrink-0");
        if (h.modalidad !== "en_linea") {
            const usar = el("button", "horario-usar bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Pasar lista");
            usar.type = "button";
            usar.setAttribute("aria-label", "Pasar lista de la clase del " + DIAS[h.dia_semana] + " a las " + horaCorta(h));
            usar.addEventListener("click", () => usarHorario(h, ultimaFecha(h)));
            botones.appendChild(usar);
        }
        const quitar = el("button", "horario-quitar border border-brand-200 dark:border-brand-700 hover:border-red-400 text-red-600 dark:text-red-400 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Quitar");
        quitar.type = "button";
        quitar.dataset.confirmar = "no";
        // Dos toques en el propio botón, como borrar una ficha: esto se toca
        // desde el celular.
        quitar.addEventListener("click", () => {
            if (quitar.dataset.confirmar === "no") {
                quitar.dataset.confirmar = "si";
                quitar.textContent = "¿Seguro? Sale de tu horario";
                return;
            }
            quitarHorario(h);
        });
        botones.appendChild(quitar);
        li.appendChild(botones);
        lista.appendChild(li);
    });
}

function usarHorario(h, fecha) {
    limpiar();
    document.getElementById("fecha").value = fecha;
    document.getElementById("hora").value = horaCorta(h);
    document.getElementById("minutos").value = h.duracion_min || 60;
    document.getElementById("titulo").value = h.titulo || quienesDe(h) || "";
    const ids = alumnosDelHorario(h);
    marcados = new Set(ids);
    pintarCasillas();
    const [, m, d] = fecha.split("-").map(Number);
    const cuando = "tu clase del " + DIAS[h.dia_semana] + " " + d + " de " + MESES[m - 1] + " a las " + horaCorta(h);
    if (!h.grupo && !h.subgrupo_id) {
        avisar("Ficha llena con " + cuando + ". Esa clase no tiene un grupo fijo: marca a quien llegó.");
    } else if (!ids.length) {
        avisar("Ficha llena con " + cuando + ", pero en tu lista no hay nadie de " + quienesDe(h).toLowerCase() +
            ". Marca a quien llegó.", true);
    } else {
        avisar("Ficha llena con " + cuando + ". Quedaron marcados " +
            (ids.length === 1 ? "el único alumno" : "los " + ids.length + " alumnos") + " de " +
            quienesDe(h).toLowerCase() + ": desmarca a quien no llegó y guarda.");
    }
    document.getElementById("ficha").scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("buscar").focus();
}

async function cargarHorario() {
    const { data, error } = await sb.from("horario_clases")
        .select("id, dia_semana, hora, duracion_min, grupo, subgrupo_id, titulo, modalidad, desde, hasta")
        .eq("profesor_id", session.user.id)
        .is("hasta", null)
        .order("dia_semana").order("hora");
    if (error) { avisar("No se pudo cargar tu horario: " + error.message, true); return false; }
    // Lunes primero: la semana de clases empieza el lunes, no el domingo.
    horario = (data || []).slice().sort((a, b) =>
        ((a.dia_semana + 6) % 7) - ((b.dia_semana + 6) % 7) || String(a.hora).localeCompare(String(b.hora)));
    return true;
}

async function cargarQuienes() {
    const sel = document.getElementById("h-quienes");
    const [g, sg] = await Promise.all([sb.rpc("grupos_de_mis_alumnos"), sb.rpc("mis_subgrupos")]);
    subgrupos = (sg && sg.data) || [];
    const grupos = ((g && g.data) || []).filter((x) => x.grupo);
    if (grupos.length) {
        const og = el("optgroup");
        og.label = "Grupos";
        grupos.forEach((x) => {
            const o = el("option", null, x.grupo + " (" + x.alumnos + ")");
            o.value = "g:" + x.grupo;
            og.appendChild(o);
        });
        sel.appendChild(og);
    }
    const conGente = subgrupos.filter((x) => (x.cuantos || 0) > 0);
    if (conGente.length) {
        const og = el("optgroup");
        og.label = "Tus subgrupos";
        conGente.forEach((x) => {
            const o = el("option", null, x.nombre + " (" + x.cuantos + ")");
            o.value = "s:" + x.id;
            og.appendChild(o);
        });
        sel.appendChild(og);
    }
}

async function agregarHorario() {
    const minutos = parseInt(document.getElementById("h-minutos").value, 10);
    const hora = document.getElementById("h-hora").value;
    if (!hora) return avisar("Falta la hora de la clase.", true);
    if (!minutos || minutos < 5 || minutos > 600) return avisar("La clase tiene que durar entre 5 y 600 minutos.", true);
    const q = document.getElementById("h-quienes").value;
    const fila = {
        profesor_id: session.user.id,
        dia_semana: parseInt(document.getElementById("h-dia").value, 10),
        hora: hora,
        duracion_min: minutos,
        grupo: q.startsWith("g:") ? q.slice(2) : null,
        subgrupo_id: q.startsWith("s:") ? q.slice(2) : null,
        titulo: document.getElementById("h-titulo").value.trim() || null,
        modalidad: document.getElementById("h-modalidad").value,
        desde: hoyCR(),
    };
    const boton = document.getElementById("h-guardar");
    boton.disabled = true;
    const { error } = await sb.from("horario_clases").insert(fila);
    boton.disabled = false;
    if (error) return avisar("No se pudo agregar al horario: " + error.message, true);
    document.getElementById("h-titulo").value = "";
    avisar("Listo: los " + DIAS[fila.dia_semana] + " a las " + hora + " quedaron en tu horario.");
    if (await cargarHorario()) pintarHorario();
}

async function quitarHorario(h) {
    const hoy = hoyCR();
    const { error } = h.desde >= hoy
        ? await sb.from("horario_clases").delete().eq("id", h.id)
        : await sb.from("horario_clases").update({ hasta: sumarDias(hoy, -1) }).eq("id", h.id);
    if (error) return avisar("No se pudo quitar: " + error.message, true);
    avisar("Esa clase salió de tu horario. Las semanas en que sí estaba siguen contando en tus informes.");
    if (await cargarHorario()) pintarHorario();
}

/* ?horario=<id>&fecha=AAAA-MM-DD es a donde lleva el aviso de la ficha que
   falta. Una fecha del futuro no se usa: se pasa lista de lo que ya pasó. */
function abrirDesdeLaDireccion() {
    const q = new URLSearchParams(location.search);
    const id = q.get("horario");
    if (!id) return;
    const h = horario.find((x) => x.id === id);
    if (!h) { avisar("Esa clase ya no está en tu horario. Puedes llenar la ficha a mano.", true); return; }
    let fecha = q.get("fecha") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyCR() || diaDe(fecha) !== h.dia_semana) fecha = ultimaFecha(h);
    usarHorario(h, fecha);
}

async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { location.href = "login.html?next=asistencia.html"; return; }

    const { data: perfil } = await sb.from("profiles").select("role, is_admin").eq("id", session.user.id).maybeSingle();
    const puede = !!(perfil && (perfil.role === "profesor" || perfil.is_admin));
    document.getElementById("loading").classList.add("hidden");
    if (!puede) { document.getElementById("denegado").classList.remove("hidden"); return; }

    document.getElementById("app").classList.remove("hidden");
    // «Mejorar informe»: solo aparece si la academia tiene IA y le queda presupuesto.
    MejorarInforme.montar({ sb, campo: document.getElementById("notas"), tipo: "clase" });
    ponerInstante(null);
    if (!(await cargarAlumnos())) return;
    pintarCasillas();
    await cargarQuienes();
    if (await cargarHorario()) pintarHorario();
    if (await cargarFichas(0)) pintarFichas();

    /* El mismo selector de subgrupos de Tareas y Exámenes, escrito una sola
       vez: «pásale lista a los del martes» marca a los suyos y desmarca al
       resto, que es justo con lo que se empieza una clase presencial. */
    if (window.SubgruposMarcar && alumnos.length) {
        await SubgruposMarcar.montar({
            sb: sb,
            antesDe: document.getElementById("buscar"),
            casillas: ".alumno-chk",
        });
        /* El módulo marca y desmarca las CASILLAS; quien lleva la cuenta acá es
           `marcados`, así que hay que volver a leerlas. Se hace escuchando su
           selector —y no con su `alMarcar`— porque ese solo avisa cuando se
           elige un subgrupo: al volver a «— un subgrupo —» desmarca todo y no
           avisa, y el Set se quedaría lleno de gente que ya no está marcada.
           Este listener se engancha después del suyo, así que el DOM ya está al
           día cuando corre. */
        const selector = document.getElementById("subgrupo-marcar");
        if (selector) selector.addEventListener("change", () => {
            marcados = new Set([...document.querySelectorAll(".alumno-chk")]
                .filter((c) => c.checked).map((c) => c.value));
            /* El módulo desmarca a quien no es del subgrupo, así que sus
               tardanzas tienen que irse con ellos: una que sobreviva hace que
               la base rechace el guardado entero por alguien que ya no está
               marcado. Y los recuadros se destapan o se esconden según quedó
               cada casilla — el módulo no sabe que existen. */
            for (const id of [...tarde.keys()]) if (!marcados.has(id)) tarde.delete(id);
            document.querySelectorAll(".tarde-min").forEach((m) => {
                m.hidden = !marcados.has(m.dataset.alumno);
                if (m.hidden) m.value = "";
            });
            // Y se limpia la búsqueda: con un filtro puesto, la mitad de los
            // que acaba de marcar el subgrupo estarían escondidos.
            busqueda = "";
            document.getElementById("buscar").value = "";
            filtrar();
            pintarCuenta();
        });
    }
    abrirDesdeLaDireccion();
}

document.getElementById("ficha").addEventListener("submit", guardar);
document.getElementById("cancelar").addEventListener("click", limpiar);
document.getElementById("h-guardar").addEventListener("click", agregarHorario);
document.getElementById("marcar-todos").addEventListener("click", () => marcarTodos(true));
document.getElementById("marcar-ninguno").addEventListener("click", () => marcarTodos(false));
document.getElementById("buscar").addEventListener("input", (e) => {
    busqueda = e.target.value;
    filtrar();
});
document.querySelectorAll(".dura-btn").forEach((b) => {
    b.addEventListener("click", () => { document.getElementById("minutos").value = b.dataset.min; });
});
document.getElementById("ver-mas").addEventListener("click", async () => {
    if (await cargarFichas(fichas.length)) pintarFichas();
});
/* Si se cambia algo del formulario después de pedir el segundo toque, el botón
   vuelve a lo suyo: el «guardar así» tiene que confirmarse sobre lo que se está
   viendo, no sobre lo que se veía hace tres cambios. */
document.getElementById("ficha").addEventListener("input", () => {
    const b = document.getElementById("guardar");
    if (b.dataset.confirmar === "si") {
        b.dataset.confirmar = "no";
        b.textContent = editando ? "Guardar los cambios" : "Guardar la ficha";
    }
});

init();
    