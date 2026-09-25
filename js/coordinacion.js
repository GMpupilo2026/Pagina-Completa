/* El código de coordinacion.html.

   Vivía escrito dentro de la página, en un <script> de 41 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* Coordinación: las cuentas que alcanza quien coordina.
 *
 * QUÉ ALCANZA Y POR QUÉ. `soy_coordinador()` dice quién entra acá;
 * `bajo_mi_coordinacion()` dice sobre quién. Son sus profesores —los que le
 * vinculó quien administra—, los alumnos de esos profesores y sus propios
 * alumnos. Antes coordinar abría la Academia entera: con miles de alumnos eso
 * no es coordinar, es administrar, y las cuentas de un colegio no son asunto
 * de quien coordina otro.
 *
 * LA LISTA LA FILTRA Y LA CORTA LA BASE (`mi_gente`), no el navegador. Es la
 * piedra con la que ya tropezaron Informes, el registro de clases y Cobros:
 * PostgREST corta la respuesta a partir de cierta cantidad de filas sin dar
 * ningún error, así que con miles de cuentas la página empezaría a esconder
 * gente en silencio.
 */
let session = null;
let perfil = null;
let filas = [];
let total = 0;
let desde = 0;
let peticion = 0;          // descarta la respuesta que llega tarde
/* Los profesores a los que puede repartir alumnos: los de SU coordinación y
   nadie más. Se piden una vez al abrir la página —son pocos— y de ahí sale el
   selector de cada ficha. Ofrecer uno que no coordina sería ofrecer un botón
   que `coord_set_profesores()` va a rechazar. */
let misProfesores = [];
const POR_PAGINA = 50;

function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
}

/* Los mensajes salen por js/avisos.js, como en todo el sitio: arriba, se
   ven aunque uno haya bajado en la página, y los de error no se van solos
   (ver «Los avisos son de la página, no del navegador»). */
function avisar(texto, malo) { Avisos.avisar(texto, { tipo: malo ? "error" : "ok" }); }

const nombreDe = (u) => u.full_name || u.email || "Sin nombre";

async function cargar(desdeCero) {
    if (desdeCero) { desde = 0; filas = []; }
    const mia = ++peticion;
    const { data, error } = await sb.rpc("mi_gente", {
        p_busqueda: document.getElementById("buscar").value.trim() || null,
        p_rol: document.getElementById("f-rol").value || null,
        p_limite: POR_PAGINA,
        p_desde: desde,
    });
    if (mia !== peticion) return;         // llegó tarde: el filtro ya es otro
    if (error) { avisar("No se pudo cargar: " + error.message, true); return; }
    filas = filas.concat(data || []);
    total = data && data.length ? Number(data[0].total) : (desde ? total : 0);
    desde = filas.length;
    pintar();
}

function pintar() {
    const caja = document.getElementById("lista");
    caja.innerHTML = "";
    document.getElementById("vacio").classList.toggle("hidden", filas.length > 0);
    document.getElementById("cuenta").textContent = filas.length
        ? "Mostrando " + filas.length + " de " + total + (total === 1 ? " cuenta" : " cuentas") : "";
    document.getElementById("mas").classList.toggle("hidden", filas.length >= total);

    filas.forEach((u) => caja.appendChild(tarjeta(u)));
}

function tarjeta(u) {
    const d = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4");
    const fila = el("div", "flex flex-wrap items-start justify-between gap-3");
    const izq = el("div", "min-w-0 flex-1");
    const linea = el("p", "font-semibold text-brand-800 dark:text-white");
    // El nombre lo escribe una persona: siempre por textContent.
    linea.append(nombreDe(u) + " ");
    /* Los tonos salen de la paleta que de verdad existe (ver PALETA en
       herramientas/css-construir.js): el ámbar tiene 50, 300, 400, 500, 600 y
       700, no 100 ni 900. Una clase que no está en la paleta no pinta nada y
       no da ningún error — la etiqueta se vería sin fondo y nadie lo notaría. */
    linea.appendChild(el("span", "ml-1 inline-block px-2 py-0.5 rounded-full text-xs font-semibold " + (u.role === "profesor"
        ? "bg-accent-50 text-accent-700 dark:bg-brand-800 dark:text-accent-400"
        : "bg-brand-100 text-brand-600 dark:bg-brand-800 dark:text-brand-200"),
        u.role === "profesor" ? (u.es_coordinador ? "Coordina" : "Profesor") : "Alumno"));
    izq.appendChild(linea);
    izq.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", u.email || ""));
    const pie = [];
    if (u.grupo) pie.push(u.grupo);
    if (u.role === "profesor") {
        pie.push(u.alumnos === 1 ? "1 alumno" : u.alumnos + " alumnos");
        pie.push(u.subgrupos === 1 ? "1 subgrupo" : u.subgrupos + " subgrupos");
    }
    if (pie.length) izq.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-1", pie.join(" · ")));
    fila.appendChild(izq);

    const acciones = el("div", "flex flex-wrap gap-2");

    /* La ficha se monta ENTERA al abrirla y se tira al cerrarla, en vez de ir
       actualizando lo que cambió: así no hay que acordarse de limpiar lo de la
       cuenta anterior, que es justo el descuido que dejaría a quien coordina
       corrigiéndole el correo a quien no era. Misma decisión que el panel de
       la bitácora. */
    const ficha = el("div", "hidden");
    const editar = el("button", "border border-brand-200 dark:border-brand-700 hover:border-accent-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "✏️ Su ficha");
    editar.type = "button";
    editar.setAttribute("aria-expanded", "false");
    editar.addEventListener("click", () => {
        const abierta = editar.getAttribute("aria-expanded") === "true";
        editar.setAttribute("aria-expanded", abierta ? "false" : "true");
        ficha.classList.toggle("hidden", abierta);
        ficha.innerHTML = "";
        if (!abierta) montarFicha(u, ficha, linea);
    });
    /* Lo que el supervisor de su academia le apagó no se pinta: la base lo
       rechazaría igual, pero el fallo lo descubriría quien apretó. */
    if (FuncionesCoordinacion.puede("cuentas")) acciones.appendChild(editar);

    if (u.role === "profesor" && FuncionesCoordinacion.puede("subgrupos")) {
        const subs = el("a", "border border-brand-200 dark:border-brand-700 hover:border-accent-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "👥 Sus subgrupos");
        subs.href = "subgrupos.html?profesor=" + encodeURIComponent(u.id);
        acciones.appendChild(subs);
    }

    /* Reenviar el acceso es lo que se pide cuando una familia dice que el
       correo de bienvenida nunca llegó. La Edge Function decide a dónde sale
       —al correo propio, o al de la casa si entra con un usuario— y lo dice:
       ese dato es justo el que hace falta para poder avisarle a la familia. */
    const acceso = el("button", "border border-brand-200 dark:border-brand-700 hover:border-accent-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "✉️ Reenviar acceso");
    acceso.type = "button";
    acceso.addEventListener("click", () => reenviar(u, acceso));
    if (FuncionesCoordinacion.puede("acceso")) acciones.appendChild(acceso);

    // La cuenta master no cambia de rol desde acá, y la propia tampoco.
    if (!u.is_admin && u.id !== session.user.id && FuncionesCoordinacion.puede("roles")) {
        const otro = u.role === "profesor" ? "alumno" : "profesor";
        const rol = el("button", "border border-brand-200 dark:border-brand-700 hover:border-accent-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400",
            otro === "profesor" ? "⬆️ Hacer profesor" : "⬇️ Pasar a alumno");
        rol.type = "button";
        rol.dataset.confirmar = "no";
        rol.addEventListener("click", () => {
            if (rol.dataset.confirmar === "no") {
                rol.dataset.confirmar = "si";
                rol.textContent = "¿Seguro? " + (otro === "profesor" ? "Hacer profesor" : "Pasar a alumno");
                return;
            }
            cambiarRol(u, otro, rol);
        });
        acciones.appendChild(rol);
    }

    fila.appendChild(acciones);
    d.append(fila, ficha);
    return d;
}

/* ------------------------------------------------------------------ la ficha
   Lo mismo que quien administra hace en admin.html, acotado a su gente: el
   nombre, el grupo, con qué correo entra y entre qué profesores está
   repartido. Quien coordina tiene que poder corregir un nombre mal escrito y
   un correo con una letra de más sin pedírselo a nadie — es lo que pasa todos
   los días con una familia nueva.

   Lo que NO se ofrece acá, a propósito, porque la base lo va a rechazar y un
   botón que va a fallar es peor que ninguno: el rol (va en su propio botón,
   que sabe rechazar bajar a un profesor con alumnos), is_admin, el cupo de
   invitaciones, borrar la cuenta y los equipos. Eso es de la cuenta master. */
function campo(etiqueta, valor, tipo) {
    const caja = el("label", "block");
    caja.appendChild(el("span", "block text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", etiqueta));
    const i = document.createElement("input");
    i.type = tipo || "text";
    i.value = valor || "";
    i.className = "w-full px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    caja.appendChild(i);
    return { caja: caja, input: i };
}

function seccion(titulo) {
    const s = el("div", "mt-4 pt-4 border-t border-brand-100 dark:border-brand-800");
    s.appendChild(el("h3", "font-semibold text-sm text-brand-700 dark:text-brand-200 mb-2", titulo));
    return s;
}

function montarFicha(u, caja, lineaNombre) {
    const esAlumno = u.role === "alumno";

    // ---------------------------------------------------- nombre y grupo
    const datos = seccion("Sus datos");
    const rejilla = el("div", "grid gap-3 sm:grid-cols-2");
    const nombre = campo("Nombre completo", u.full_name);
    const grupo = campo("Grupo / equipo", u.grupo);
    rejilla.append(nombre.caja, grupo.caja);
    datos.appendChild(rejilla);
    const guardar = el("button", "mt-3 bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Guardar");
    guardar.type = "button";
    guardar.addEventListener("click", () => guardarDatos(u, nombre.input, grupo.input, guardar, lineaNombre));
    datos.appendChild(guardar);
    caja.appendChild(datos);

    // ----------------------------------------- con qué entra a la Academia
    /* `correos-alumno` solo corrige el correo de un ALUMNO: el del equipo
       docente es otra cosa y lo rechaza. Así que acá ni se ofrece. */
    if (esAlumno) {
        const correo = seccion("Con qué entra");
        const actual = campo("Correo o usuario", u.email, "text");
        actual.input.setAttribute("autocapitalize", "none");
        actual.input.setAttribute("autocorrect", "off");
        correo.appendChild(actual.caja);

        const sinCorreo = el("label", "flex items-center gap-2 mt-2 text-sm text-brand-600 dark:text-brand-300");
        const marca = document.createElement("input");
        marca.type = "checkbox";
        marca.className = "rounded border-brand-300 dark:border-brand-700 text-accent-500 focus:ring-accent-400";
        sinCorreo.append(marca, el("span", null, "No tiene correo propio (entra con un usuario de la Academia)"));
        correo.appendChild(sinCorreo);
        /* El campo se APAGA, no se esconde: así se ve que sigue ahí y que lo
           que cambió es que ya no hace falta. Misma decisión que las dos
           puertas de alta. */
        marca.addEventListener("change", () => { actual.input.disabled = marca.checked; });

        correo.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-2",
            "El correo es la llave con la que inicia sesión. Si ya es de otra cuenta no se puede repetir: "
            + "si son hermanos, marca «No tiene correo propio»."));

        const botonCorreo = el("button", "mt-3 border border-brand-200 dark:border-brand-700 hover:border-accent-400 px-4 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Cambiar el correo");
        botonCorreo.type = "button";
        correo.appendChild(botonCorreo);
        caja.appendChild(correo);

        // ------------------------------------ su contraseña, si entra con usuario
        /* La pone quien coordina y se la da en la clase. Aparece en cuanto se
           le da un usuario, sin cerrar la ficha. Ver js/contrasena-alumno.js. */
        const clave = ContrasenaAlumno.montar(caja, { alumnoId: u.id, nombre: nombreDe(u), usuario: () => u.email });

        botonCorreo.addEventListener("click", () => guardarCorreo(u, actual.input, marca, botonCorreo, clave.pintar));

        // ------------------------------------------------ sus profesores
        const profes = seccion("Sus profesores");
        const tags = el("div", "flex flex-wrap gap-2 mb-2");
        profes.appendChild(tags);
        const selector = document.createElement("select");
        selector.className = "w-full sm:w-auto px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        selector.setAttribute("aria-label", "Sumarle un profesor");
        profes.appendChild(selector);
        caja.appendChild(profes);
        pintarProfesores(u, tags, selector);
    }
}

/* Las etiquetas de sus profesores, con su ✕, y el selector para sumar otro:
   el mismo patrón que ya usan admin.html y la tarjeta de Equipos.

   A un profesor que NO coordina se le ve el nombre pero NO se le pinta ✕:
   quitárselo sería dejar sin su alumno a una colega de otra coordinación.
   `coord_set_profesores()` lo conserva igual aunque la pantalla se equivocara
   —une lo que se le manda con los que quedan fuera del alcance de quien
   coordina— así que acá solo se evita ofrecer un botón que va a fallar. */
function pintarProfesores(u, tags, selector) {
    const suyos = (u.profesores || []);
    const puedoQuitar = new Set(misProfesores.map((p) => p.id));
    tags.innerHTML = "";
    if (!suyos.length) {
        tags.appendChild(el("p", "text-sm text-brand-450 dark:text-brand-350",
            "Todavía no tiene ninguno, así que no le sale en los informes de nadie."));
    }
    suyos.forEach((pr) => {
        const t = el("span", "inline-flex items-center gap-1 bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200 px-2 py-1 rounded-full text-xs");
        t.appendChild(el("span", null, pr.nombre));
        if (puedoQuitar.has(pr.id)) {
            const x = el("button", "text-brand-500 dark:text-brand-300 hover:text-red-600 dark:hover:text-red-400 font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded", "✕");
            x.type = "button";
            x.setAttribute("aria-label", "Quitarle a " + pr.nombre);
            x.addEventListener("click", () => mandarProfesores(u, suyos.filter((o) => o.id !== pr.id), tags, selector));
            t.appendChild(x);
        }
        tags.appendChild(t);
    });

    const yaEstan = new Set(suyos.map((p) => p.id));
    selector.innerHTML = "";
    const vacia = document.createElement("option");
    vacia.value = "";
    vacia.textContent = "Sumarle un profesor…";
    selector.appendChild(vacia);
    misProfesores.filter((p) => !yaEstan.has(p.id)).forEach((p) => {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.nombre;
        selector.appendChild(o);
    });
    selector.disabled = selector.options.length < 2;
    selector.onchange = () => {
        const elegido = misProfesores.find((p) => p.id === selector.value);
        if (elegido) mandarProfesores(u, suyos.concat([elegido]), tags, selector);
    };
}

/* Las dos escrituras van por SU FUNCIÓN DE LA BASE, no por la Edge Function
   del panel de administración: el alcance de la coordinación ya vive en SQL
   —`bajo_mi_coordinacion()`, `cambiar_rol()`, `set_profesores_del_coordinador()`—
   y partirlo entre la base y una función que tendría que volver a preguntar lo
   mismo es cómo se separan dos versiones de la misma regla.

   El mensaje que devuelven se enseña TAL CUAL —«Esa cuenta no está bajo tu
   coordinación», «Hay un profesor que no está bajo tu coordinación»—, porque un
   «no se pudo» a secas deja a quien coordina sin saber qué arreglar. Es la
   misma decisión del botón de rol. */
async function guardarDatos(u, nombre, grupo, boton, lineaNombre) {
    boton.disabled = true;
    boton.textContent = "Guardando…";
    try {
        const { error } = await sb.rpc("coord_guardar_cuenta", {
            p_persona: u.id,
            p_nombre: nombre.value.trim(),
            p_grupo: grupo.value.trim(),
        });
        if (error) throw new Error(error.message);
        u.full_name = nombre.value.trim();
        u.grupo = grupo.value.trim() || null;
        // El encabezado de la tarjeta se actualiza sin repintar la lista: si
        // se repintara, la ficha abierta se cerraría en la cara de quien
        // acaba de guardar.
        if (lineaNombre) lineaNombre.firstChild.textContent = nombreDe(u) + " ";
        avisar("Guardado.");
    } catch (err) {
        avisar("No se pudo guardar: " + err.message, true);
    }
    boton.disabled = false;
    boton.textContent = "Guardar";
}

async function mandarProfesores(u, lista, tags, selector) {
    selector.disabled = true;
    try {
        const { error } = await sb.rpc("coord_set_profesores", {
            p_alumno: u.id,
            p_profesores: lista.map((p) => p.id),
        });
        if (error) throw new Error(error.message);
        u.profesores = lista;
        pintarProfesores(u, tags, selector);
        avisar(lista.length
            ? nombreDe(u) + " queda con " + lista.length + (lista.length === 1 ? " profesor." : " profesores.")
            : nombreDe(u) + " se quedó sin ningún profesor: así no sale en los informes de nadie.");
    } catch (err) {
        avisar("No se pudo: " + err.message, true);
        selector.disabled = false;
    }
}

/* El correo lo cambia `correos-alumno`, que es donde ya vivía esa regla: el
   409 cuando ya es de otra cuenta, el usuario de la Academia para quien no
   tiene buzón, y la relectura de la fila —el trigger de identidad revierte
   esa columna sin decir nada—. Escribirlo otra vez acá sería una segunda
   versión que se separa a la primera corrección. */
async function guardarCorreo(u, input, marca, boton, alCambiar) {
    boton.disabled = true;
    boton.textContent = "Cambiando…";
    try {
        const datos = await llamarCorreos({
            action: "cuenta",
            alumno_id: u.id,
            email: input.value.trim(),
            sin_correo: marca.checked,
        });
        if (datos.sin_cambios) {
            avisar("Ese ya era su correo: no se cambió nada.");
        } else {
            /* Lo que se enseña es lo que devolvió el SERVIDOR, no lo que se
               escribió: con «No tiene correo propio» el usuario lo desempata
               él, así que enseñar el propuesto dejaría a la familia
               intentando entrar con uno que no es. */
            u.email = datos.cambiado || u.email;
            input.value = u.email;
            avisar("Ahora entra con " + u.email + ".");
            if (alCambiar) alCambiar();
        }
    } catch (err) {
        avisar("No se pudo cambiar: " + err.message, true);
    }
    boton.disabled = false;
    boton.textContent = "Cambiar el correo";
}

async function llamarCorreos(cuerpo) {
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/correos-alumno`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": window.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(cuerpo),
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok || datos.error) throw new Error(datos.error || `El servidor respondió ${res.status}`);
    return datos;
}

async function cambiarRol(u, rol, boton) {
    boton.disabled = true;
    boton.textContent = "Cambiando…";
    const { data, error } = await sb.rpc("cambiar_rol", { p_persona: u.id, p_rol: rol });
    boton.disabled = false;
    if (error) {
        /* La base dice POR QUÉ no se puede —«todavía tiene 12 alumnos
           asignados»—, y eso es lo que hay que enseñar: un "no se pudo" a
           secas deja a quien coordina sin saber qué arreglar. */
        avisar(error.message, true);
        await cargar(true);
        return;
    }
    avisar(rol === "profesor"
        ? nombreDe(u) + " ahora es profesor, y queda bajo tu coordinación."
        : nombreDe(u) + " vuelve a ser alumno, y queda asignado a ti.");
    await cargar(true);
}

async function reenviar(u, boton) {
    boton.disabled = true;
    boton.textContent = "Mandando…";
    try {
        const res = await fetch(`${window.SUPABASE_URL}/functions/v1/reenviar-acceso`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
                "apikey": window.SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ alumno_id: u.id }),
        });
        const datos = await res.json().catch(() => ({}));
        if (!res.ok || datos.error) throw new Error(datos.error || `El servidor respondió ${res.status}`);
        avisar("Le salió el enlace para crear su contraseña a " + (datos.correo_destino || "su correo") + ".");
    } catch (err) {
        avisar("No se pudo mandar: " + err.message, true);
    }
    boton.disabled = false;
    boton.textContent = "✉️ Reenviar acceso";
}

function pintarTarjetas(profesores, alumnos) {
    const caja = document.getElementById("tarjetas");
    caja.innerHTML = "";
    const t = (valor, etiqueta) => {
        const d = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5");
        d.appendChild(el("p", "text-2xl font-bold text-brand-800 dark:text-white", String(valor)));
        d.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-1", etiqueta));
        return d;
    };
    caja.appendChild(t(profesores, profesores === 1 ? "profesor que coordinas" : "profesores que coordinas"));
    caja.appendChild(t(alumnos, alumnos === 1 ? "alumno alcanzado" : "alumnos alcanzados"));
    caja.appendChild(t(profesores + alumnos, "cuentas en total"));
}

/* ---------------------------------------------------------------- equipos
   La única forma de agrupar que DA PERMISOS. Lo que se escribe acá lo
   escriben las funciones de la base —`coord_equipo_*`, todas exigiendo
   `soy_coordinador()` y `bajo_mi_coordinacion()` de cada persona— y no la
   Edge Function del panel de administración, por lo mismo que la ficha: el
   alcance de la coordinación ya vive en SQL y partirlo en dos es cómo se
   separan dos versiones de la misma regla.

   La fuga propia de los equipos, y por qué la base la cierra: meter a un
   alumno suyo en un equipo con entrenadores AJENOS le daría a esos
   entrenadores acceso a ese alumno. Por eso tocar la gente de un equipo pide
   que TODA la gente del equipo esté bajo su coordinación. Acá eso solo decide
   qué se OFRECE —un botón que va a fallar es peor que ninguno—; quien manda
   es la función. */
let equipos = [];                       // [{id, nombre, created_by}…]
let alumnosDeEquipo = new Map();
let entrenadoresDeEquipo = new Map();
let misAlumnos = [];                    // [{id, nombre, grupo}…]
let subgruposAlaVista = [];
let avisoDelLote = new Map();           // id de equipo -> qué pasó al volcar

/* `mi_gente` viene paginada a propósito (PostgREST corta sin avisar), así que
   para el selector de un equipo se pide hasta el final en vez de poner un
   límite a ojo: con un límite, a partir de cierta cantidad de cuentas la
   pantalla empezaría a no ofrecer alumnos que sí puede repartir, y eso no da
   ningún error. */
async function traerGente(rol) {
    // 200 es el tope que pone `mi_gente` por página: con un trozo más grande,
    // `desde` saltaría filas que nunca llegaron.
    const trozo = 200;
    let desde = 0, todo = [], total = null;
    for (;;) {
        const { data, error } = await sb.rpc("mi_gente",
            { p_busqueda: null, p_rol: rol, p_limite: trozo, p_desde: desde });
        if (error) throw new Error(error.message);
        const filas = data || [];
        if (total === null) total = filas.length ? Number(filas[0].total) : 0;
        todo = todo.concat(filas);
        desde += trozo;
        if (!filas.length || todo.length >= total) break;
    }
    return todo;
}

/* De mil en mil hasta que llega una página corta: PostgREST corta la
   respuesta sin dar ningún error. La misma de admin.html. */
async function traerTodo(consulta) {
    const PASO = 1000;
    let desde = 0, todo = [];
    for (;;) {
        const { data, error } = await consulta().range(desde, desde + PASO - 1);
        if (error) throw new Error(error.message);
        todo = todo.concat(data || []);
        if (!data || data.length < PASO) return todo;
        desde += PASO;
    }
}

async function cargarEquipos() {
    const caja = document.getElementById("equipos-lista");
    try {
        /* Las tres, enteras y comprobadas. coord_equipo_set_alumnos() y
           coord_equipo_set_entrenadores() dejan la lista EXACTAMENTE como llega,
           y lo que se manda es la unión con lo que se leyó acá: una lectura que
           falló —o que PostgREST cortó en mil filas sin decir nada— dejaría el
           equipo vacío en pantalla, y el siguiente volcado sacaría del equipo a
           los que no llegaron. Por eso un error NO se ignora: sin datos no se
           pinta ni un control que escriba. */
        const [eqData, eaData, eeData] = await Promise.all([
            traerTodo(() => sb.from("equipos").select("id, nombre, created_by").order("nombre").order("id")),
            traerTodo(() => sb.from("equipo_alumnos").select("equipo_id, alumno_id").order("equipo_id").order("alumno_id")),
            traerTodo(() => sb.from("equipo_entrenadores").select("equipo_id, teacher_id").order("equipo_id").order("teacher_id")),
        ]);
        equipos = eqData;
        alumnosDeEquipo = new Map();
        eaData.forEach((r) => {
            if (!alumnosDeEquipo.has(r.equipo_id)) alumnosDeEquipo.set(r.equipo_id, []);
            alumnosDeEquipo.get(r.equipo_id).push(r.alumno_id);
        });
        entrenadoresDeEquipo = new Map();
        eeData.forEach((r) => {
            if (!entrenadoresDeEquipo.has(r.equipo_id)) entrenadoresDeEquipo.set(r.equipo_id, []);
            entrenadoresDeEquipo.get(r.equipo_id).push(r.teacher_id);
        });
    } catch (err) {
        // Una lista vacía y una que no se pudo leer se ven igual y son cosas
        // muy distintas: la misma regla de la bitácora.
        caja.innerHTML = "";
        caja.appendChild(el("p", "text-xs text-red-600 dark:text-red-400",
            "No se pudieron cargar los equipos: " + err.message));
        return;
    }
    // Los subgrupos son para volcarlos; si no llegan, los equipos se siguen
    // armando a mano.
    try {
        const { data } = await sb.rpc("subgrupos_a_la_vista");
        subgruposAlaVista = data || [];
    } catch (_) { subgruposAlaVista = []; }
    pintarEquipos();
}

// Quién está a su alcance, con ella misma incluida: `bajo_mi_coordinacion()`
// contesta que sí sobre la propia cuenta, así que una coordinadora puede
// entrenar su propio equipo.
function aMiAlcance() {
    const s = new Set(misAlumnos.map((a) => a.id));
    misProfesores.forEach((p) => s.add(p.id));
    if (perfil && perfil.id) s.add(perfil.id);
    return s;
}

function puedoRepartirle(eq) {
    if (perfil && perfil.is_admin) return true;
    const mios = aMiAlcance();
    const gente = (alumnosDeEquipo.get(eq.id) || []).concat(entrenadoresDeEquipo.get(eq.id) || []);
    return gente.every((id) => mios.has(id));
}

function loCreeYo(eq) {
    return !!(perfil && (perfil.is_admin || eq.created_by === perfil.id));
}

/* Las etiquetas con su ✕ y el selector para sumar otro — el mismo patrón que
   la ficha de una cuenta. Sobre un equipo que no puede repartir no se pinta
   ni el ✕ ni el selector: la base lo rechazaría igual, pero el fallo lo
   descubriría quien apretó. */
function etiquetasDeEquipo(puestos, opciones, puedo, guardar, quePasa) {
    const caja = el("div", "flex flex-wrap items-center gap-2");
    const porId = new Map(opciones.map((o) => [o.id, o]));
    if (!puestos.length) {
        caja.appendChild(el("span", "text-sm text-brand-450 dark:text-brand-350", "Todavía nadie."));
    }
    puestos.forEach((id) => {
        const t = el("span", "inline-flex items-center gap-1 bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200 px-2 py-1 rounded-full text-xs");
        // El nombre lo escribe una persona: siempre por textContent.
        t.appendChild(el("span", null, porId.has(id) ? porId.get(id).nombre : "Alguien de otra coordinación"));
        if (puedo && porId.has(id)) {
            const x = el("button", "text-brand-500 dark:text-brand-300 hover:text-red-600 dark:hover:text-red-400 font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded", "✕");
            x.type = "button";
            x.setAttribute("aria-label", "Quitar a " + porId.get(id).nombre + " de " + quePasa);
            x.addEventListener("click", () => guardar(puestos.filter((o) => o !== id)));
            t.appendChild(x);
        }
        caja.appendChild(t);
    });
    if (puedo) {
        const libres = opciones.filter((o) => puestos.indexOf(o.id) === -1);
        if (libres.length) {
            const sel = document.createElement("select");
            sel.className = "px-2 py-1 rounded bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-xs max-w-[12rem]";
            sel.setAttribute("aria-label", "Sumar a " + quePasa);
            const vacia = document.createElement("option");
            vacia.value = "";
            vacia.textContent = "＋ sumar…";
            sel.appendChild(vacia);
            libres.forEach((o) => {
                const op = document.createElement("option");
                op.value = o.id;
                op.textContent = o.nombre;
                sel.appendChild(op);
            });
            sel.addEventListener("change", () => {
                if (sel.value) guardar(puestos.concat([sel.value]));
            });
            caja.appendChild(sel);
        }
    }
    return caja;
}

function pintarEquipos() {
    const caja = document.getElementById("equipos-lista");
    caja.innerHTML = "";
    document.getElementById("equipos-vacio").classList.toggle("hidden", equipos.length > 0);

    const profesores = misProfesores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const alumnos = misAlumnos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    equipos.forEach((eq) => {
        const puedo = puedoRepartirle(eq);
        const card = el("div", "rounded-xl border border-brand-100 dark:border-brand-800 p-4");

        const arriba = el("div", "flex flex-wrap items-center gap-3 mb-3");
        if (loCreeYo(eq)) {
            const nombre = document.createElement("input");
            nombre.type = "text";
            nombre.value = eq.nombre;
            nombre.setAttribute("aria-label", "Nombre del equipo");
            nombre.className = "font-serif font-bold text-brand-800 dark:text-white bg-transparent border border-transparent hover:border-brand-200 dark:hover:border-brand-700 focus:border-accent-500 outline-none rounded px-2 py-1 text-sm flex-1 min-w-[10rem]";
            nombre.addEventListener("change", () => renombrarEquipo(eq, nombre));
            const borrar = el("button", "text-xs text-brand-500 dark:text-brand-300 hover:text-red-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded", "Borrar equipo");
            borrar.type = "button";
            // Dos toques en el propio botón, no un diálogo del navegador: esto
            // se toca desde el celular, y borrar un equipo le quita el acceso a
            // sus entrenadores.
            borrar.addEventListener("click", () => {
                if (borrar.dataset.seguro !== "1") {
                    borrar.dataset.seguro = "1";
                    borrar.textContent = "Sí, borrarlo — sus entrenadores pierden a estos alumnos";
                    return;
                }
                borrarEquipo(eq);
            });
            arriba.append(nombre, borrar);
        } else {
            const nombre = el("p", "font-serif font-bold text-brand-800 dark:text-white text-sm flex-1 min-w-[10rem] px-2 py-1");
            nombre.textContent = eq.nombre;
            arriba.appendChild(nombre);
            arriba.appendChild(el("span", "text-xs text-brand-450 dark:text-brand-350", "lo armó otra persona"));
        }
        card.appendChild(arriba);

        if (!puedo) {
            card.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mb-2",
                "Este equipo tiene gente que no está bajo tu coordinación, así que no se reparte desde acá."));
        }

        const cajaEnt = el("div", "mb-3");
        cajaEnt.appendChild(el("h3", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", "Entrenadores"));
        cajaEnt.appendChild(etiquetasDeEquipo(
            entrenadoresDeEquipo.get(eq.id) || [], profesores, puedo,
            (lista) => guardarEntrenadores(eq, lista),
            "los entrenadores de " + eq.nombre,
        ));
        card.appendChild(cajaEnt);

        const cajaAl = el("div");
        cajaAl.appendChild(el("h3", "text-xs font-semibold text-brand-500 dark:text-brand-300 uppercase tracking-wide mb-1", "Alumnos"));
        cajaAl.appendChild(etiquetasDeEquipo(
            alumnosDeEquipo.get(eq.id) || [], alumnos, puedo,
            (lista) => guardarAlumnos(eq, lista),
            "los alumnos de " + eq.nombre,
        ));
        if (puedo) {
            // Lo que de verdad evita el uno por uno.
            cajaAl.appendChild(EquipoVolcar.montar({
                nombre: eq.nombre,
                yaEstan: alumnosDeEquipo.get(eq.id) || [],
                alumnos: misAlumnos,
                subgrupos: subgruposAlaVista,
                tope: 300,
                mensaje: avisoDelLote.get(eq.id),
                guardar: async (lista, dicho) => {
                    await escribirAlumnos(eq, lista);
                    avisoDelLote.set(eq.id, dicho);
                    pintarEquipos();
                },
            }));
        }
        card.appendChild(cajaAl);
        caja.appendChild(card);
    });
}

/* Las cuatro escrituras van por su función de la base. El mensaje que
   devuelven se enseña TAL CUAL —«Ese equipo tiene gente que no está bajo tu
   coordinación»—, porque un «no se pudo» a secas deja a quien coordina sin
   saber qué arreglar. */
async function escribirAlumnos(eq, lista) {
    const { error } = await sb.rpc("coord_equipo_set_alumnos",
        { p_equipo: eq.id, p_alumnos: lista });
    if (error) throw new Error(error.message);
    alumnosDeEquipo.set(eq.id, lista);
}

async function guardarAlumnos(eq, lista) {
    try {
        await escribirAlumnos(eq, lista);
        pintarEquipos();
        avisar(eq.nombre + " queda con " + lista.length + (lista.length === 1 ? " alumno." : " alumnos."));
    } catch (err) {
        avisar("No se pudo: " + err.message, true);
    }
}

async function guardarEntrenadores(eq, lista) {
    try {
        const { error } = await sb.rpc("coord_equipo_set_entrenadores",
            { p_equipo: eq.id, p_entrenadores: lista });
        if (error) throw new Error(error.message);
        entrenadoresDeEquipo.set(eq.id, lista);
        pintarEquipos();
        avisar(lista.length
            ? eq.nombre + " queda con " + lista.length + (lista.length === 1 ? " entrenador." : " entrenadores.")
            : eq.nombre + " se quedó sin entrenadores: así no le sirve a nadie.");
    } catch (err) {
        avisar("No se pudo: " + err.message, true);
    }
}

async function renombrarEquipo(eq, input) {
    const nombre = input.value.trim();
    if (!nombre || nombre === eq.nombre) { input.value = eq.nombre; return; }
    const { error } = await sb.rpc("coord_equipo_rename", { p_equipo: eq.id, p_nombre: nombre });
    if (error) {
        avisar("No se pudo renombrar: " + error.message, true);
        input.value = eq.nombre;
        return;
    }
    eq.nombre = nombre;
    avisar("Renombrado.");
}

async function borrarEquipo(eq) {
    const { error } = await sb.rpc("coord_equipo_delete", { p_equipo: eq.id });
    if (error) { avisar("No se pudo borrar: " + error.message, true); return; }
    equipos = equipos.filter((x) => x.id !== eq.id);
    pintarEquipos();
    avisar("Equipo borrado.");
}

async function init() {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { location.href = "login.html?next=coordinacion.html"; return; }

    const { data: p } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    perfil = p;
    document.getElementById("loading").classList.add("hidden");
    if (!(perfil && (perfil.es_coordinador || perfil.es_supervisor || perfil.is_admin))) {
        document.getElementById("denegado").classList.remove("hidden");
        return;
    }
    // Qué funciones le dejó su supervisor. A quien administra o supervisa la
    // base le contesta con todas.
    await FuncionesCoordinacion.cargar(sb);
    const conEquipos = FuncionesCoordinacion.puede("equipos");
    document.getElementById("seccion-equipos").hidden = !conEquipos;
    document.getElementById("app").classList.remove("hidden");

    // Los conteos salen de la propia función, con el tope de cordura: pedir
    // "todas" solo para contarlas es justo lo que esta página no hace.
    const [{ data: profes }, { data: alums }] = await Promise.all([
        sb.rpc("mi_gente", { p_busqueda: null, p_rol: "profesor", p_limite: 1, p_desde: 0 }),
        sb.rpc("mi_gente", { p_busqueda: null, p_rol: "alumno", p_limite: 1, p_desde: 0 }),
    ]);
    const nProfes = profes && profes.length ? Number(profes[0].total) : 0;
    const nAlumnos = alums && alums.length ? Number(alums[0].total) : 0;
    pintarTarjetas(nProfes, nAlumnos);

    // Y la lista de a quién puede asignarle alumnos. Si falla, la ficha sigue
    // dejando corregir el nombre y el correo: perder eso también por esto
    // sería peor.
    const { data: docentes } = await sb.rpc("mi_gente",
        { p_busqueda: null, p_rol: "profesor", p_limite: 200, p_desde: 0 });
    misProfesores = (docentes || []).map((x) => ({ id: x.id, nombre: nombreDe(x) }));

    /* Y los alumnos que alcanza, para los equipos. Van hasta el final y no con
       un límite a ojo: es la lista de a quién puede repartir, y una que se
       corte deja alumnos fuera del selector sin que nada falle. Si esto se
       cae, el resto de la página sigue sirviendo. */
    try {
        misAlumnos = (await traerGente("alumno"))
            .map((x) => ({ id: x.id, nombre: nombreDe(x), grupo: x.grupo || "" }));
    } catch (err) {
        misAlumnos = [];
        avisar("No se pudieron cargar tus alumnos para los equipos: " + err.message, true);
    }
    if (conEquipos) await cargarEquipos();

    document.getElementById("equipo-nuevo").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("equipo-nombre");
        const msg = document.getElementById("equipo-nuevo-msg");
        const nombre = input.value.trim();
        if (!nombre) return;
        msg.textContent = "";
        const { error } = await sb.rpc("coord_equipo_create", { p_nombre: nombre });
        if (error) {
            msg.textContent = error.message;
            msg.className = "text-xs text-red-600 dark:text-red-400";
            return;
        }
        input.value = "";
        await cargarEquipos();
        avisar("Equipo creado. Ahora ponle sus entrenadores y vuélcale un grupo.");
    });

    /* Quien supervisa no tiene "profesores vinculados": tiene las cuentas que
       le asignaron, que pueden ser solo alumnos. Decirle que le faltan
       profesores sería mandarlo a pedir algo que no necesita. */
    if (perfil.es_supervisor && !perfil.is_admin) {
        if (!nProfes && !nAlumnos) {
            const franja = document.getElementById("sin-profesores");
            franja.textContent = "Todavía no tienes ninguna cuenta a tu cargo. "
                + "Quien administra te las asigna desde el panel de Administración › Supervisores.";
            franja.hidden = false;
        }
    } else if (!nProfes && !perfil.is_admin) {
        const franja = document.getElementById("sin-profesores");
        franja.textContent = "Todavía no tienes ningún profesor asignado, así que acá solo ves a tus propios alumnos. "
            + "Quien administra te los vincula desde el panel de Administración.";
        franja.hidden = false;
    }

    // coordinacion.html?buscar=Ana llega con la búsqueda puesta: así la abre el
    // buscador del panel cuando se toca a una persona.
    const buscado = new URLSearchParams(location.search).get("buscar");
    if (buscado) document.getElementById("buscar").value = buscado.slice(0, 80);
    await cargar(true);
}

let temporizador = null;
document.getElementById("buscar").addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => cargar(true), 300);
});
document.getElementById("f-rol").addEventListener("change", () => cargar(true));
document.getElementById("mas").addEventListener("click", () => cargar(false));
init();
    