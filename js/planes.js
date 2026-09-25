/* El código de planes.html.

   Vivía escrito dentro de la página, en un <script> de 25 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

/* El armador de planes de clase.
 *
 * Lo que se arma acá se da en `sesion.html`: cada renglón lleva su botón para
 * mandarlo al tablero. Por eso la POSICIÓN se valida al guardarla y no al
 * usarla — con la misma función que usa la clase en vivo
 * (`js/posicion-valida.js`): una posición rota guardada en el plan no da ningún
 * error hasta que el profesor la manda al tablero, delante de todos.
 */
let session = null, profile = null, planes = [], planAbierto = null, items = [];
/* Los que otros comparten conmigo y a quién se lo comparto yo. Van aparte de
   `planes` a propósito: lo que se puede hacer con cada uno es distinto, y
   mezclarlos en una sola lista era ofrecerle "Borrar plan" sobre el material de
   una colega — la base lo rechazaría, pero el fallo lo descubriría ella. */
let compartidosConmigo = [], equipo = [], compartidoCon = [];
// Los que el profesor marcó, en la propia lista de "Tus planes", para
// compartirlos de una vez sin entrar a cada uno. Solo tiene sentido sobre los
// propios: los de un colega no se pueden volver a compartir.
let marcadosParaCompartir = new Set();

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

    PlanClase.TIPOS.forEach((t) => {
        const o = document.createElement("option");
        o.value = t.id;
        o.textContent = t.icono + " " + t.etiqueta;
        $("i-tipo").appendChild(o);
    });
    $("i-tipo").addEventListener("change", pintarCamposDelTipo);
    pintarCamposDelTipo();
    await cargarCursos();

    $("form-plan").addEventListener("submit", crearPlan);
    $("form-item").addEventListener("submit", agregarItem);
    $("duplicar-plan").addEventListener("click", duplicar);
    $("borrar-plan").addEventListener("click", borrarPlan);
    // Las notas del plan se guardan al salir del campo, no con un botón: es un
    // campo que se toca de pasada mientras se arma el resto.
    $("p-notas").addEventListener("blur", guardarNotas);
    $("c-todos").addEventListener("change", cambiarCompartidoTodos);
    $("c-sumar").addEventListener("click", sumarProfesor);
    $("lote-todos-btn").addEventListener("click", compartirLoteConTodos);
    $("lote-sumar").addEventListener("click", compartirLoteConProfesor);
    $("lote-quitar-marca").addEventListener("click", quitarMarcaDeLote);

    await cargarEquipo();
    await cargarPlanes();
    await cargarCompartidosConmigo();
}

/* El equipo docente sale de una función de la base y no de `profiles`: la RLS no
   le deja a un profesor ver a sus colegas. Si falla, se dice y el resto de la
   página sigue funcionando — lo que no se puede es ofrecer una lista vacía como
   si de verdad no hubiera nadie. */
async function cargarEquipo() {
    try {
        equipo = await PlanClase.equipoDocente(sb);
    } catch (e) {
        equipo = [];
        $("c-msg").textContent = "No se pudo cargar el equipo docente: " + e.message;
    }
}

async function cargarCompartidosConmigo() {
    try {
        compartidosConmigo = await PlanClase.planesCompartidosConmigo(sb);
    } catch (e) {
        compartidosConmigo = [];
        $("plan-msg").textContent = "No se pudieron cargar los planes compartidos: " + e.message;
    }
    pintarCompartidosConmigo();
}

function pintarCompartidosConmigo() {
    const lista = $("lista-compartidos");
    lista.innerHTML = "";
    $("bloque-compartidos").classList.toggle("hidden", compartidosConmigo.length === 0);
    compartidosConmigo.forEach((p) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.plan = p.id;
        b.className = claseDeBotonDePlan(planAbierto && planAbierto.id === p.id);
        const t = document.createElement("span");
        t.className = "block";
        t.textContent = PlanClase.tituloVisible(p.titulo);
        const a = document.createElement("span");
        a.className = "block text-xs font-normal opacity-80";
        // El nombre lo escribió una persona: siempre por textContent.
        a.textContent = "de " + (p.autor || "otro profesor");
        b.append(t, a);
        b.addEventListener("click", () => abrirPlan(p.id));
        li.appendChild(b);
        lista.appendChild(li);
    });
}

const claseDeBotonDePlan = (activo, ancho) =>
    (ancho || "w-full") + " text-left text-sm px-3 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " +
    (activo ? "bg-accent-500 text-brand-900 font-semibold"
            : "bg-brand-50 dark:bg-brand-950 hover:bg-brand-100 dark:hover:bg-brand-800 text-brand-700 dark:text-brand-200");

/* Los cursos salen del mismo catálogo que las tarjetas de cursos.html, para no
   tener una segunda lista que se vaya quedando vieja. */
async function cargarCursos() {
    const sel = $("i-curso");
    try {
        const res = await fetch("herramientas/cursos/catalogo.json");
        const catalogo = await res.json();
        (catalogo.cursos || catalogo || []).forEach((c) => {
            const o = document.createElement("option");
            o.value = c.slug;
            o.textContent = c.titulo || c.slug;
            sel.appendChild(o);
        });
    } catch (e) {
        // Sin catálogo se sigue pudiendo armar el plan con posiciones y notas:
        // lo que no se puede es inventar una lista de cursos.
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "(no se pudo cargar la lista de cursos)";
        sel.appendChild(o);
    }
}

function pintarCamposDelTipo() {
    const tipo = $("i-tipo").value;
    $("campo-posicion").classList.toggle("hidden", tipo !== "posicion");
    $("campo-leccion").classList.toggle("hidden", tipo !== "leccion");
    $("campo-nota").classList.toggle("hidden", tipo !== "nota");
    $("i-ayuda").textContent = PlanClase.tipoDe(tipo).ayuda;
}

async function cargarPlanes() {
    try {
        planes = await PlanClase.listarPlanes(sb, profile.id);
    } catch (e) {
        $("plan-msg").textContent = "No se pudieron cargar tus planes: " + e.message;
        return;
    }
    const lista = $("lista-planes");
    lista.innerHTML = "";
    $("sin-planes").classList.toggle("hidden", planes.length > 0);
    planes.forEach((p) => {
        const li = document.createElement("li");
        li.className = "flex items-center gap-2";
        // La casilla es lo que permite marcar varios planes desde la lista y
        // compartirlos de una vez, sin entrar a cada uno — ver "lote-compartir".
        const marca = document.createElement("input");
        marca.type = "checkbox";
        marca.className = "shrink-0 w-4 h-4 accent-accent-500 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded";
        marca.checked = marcadosParaCompartir.has(p.id);
        marca.setAttribute("aria-label", "Marcar «" + PlanClase.tituloVisible(p.titulo) + "» para compartirlo");
        marca.addEventListener("change", () => {
            if (marca.checked) marcadosParaCompartir.add(p.id); else marcadosParaCompartir.delete(p.id);
            pintarLoteCompartir();
        });
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.plan = p.id;
        b.className = claseDeBotonDePlan(planAbierto && planAbierto.id === p.id, "flex-1 min-w-0");
        b.textContent = PlanClase.tituloVisible(p.titulo);
        b.addEventListener("click", () => abrirPlan(p.id));
        li.append(marca, b);
        lista.appendChild(li);
    });
    // Un plan compartido también se puede tener abierto: no se cierra por no
    // estar en la lista propia.
    const abiertoSigue = planAbierto && (planes.some((p) => p.id === planAbierto.id)
        || compartidosConmigo.some((p) => p.id === planAbierto.id));
    if (planAbierto && !abiertoSigue) cerrarPlan();
    pintarCompartidosConmigo();
    pintarLoteCompartir();
}

/* La barra de "compartir varios de una vez". Un plan borrado o que dejó de
   ser propio se cae solo de la marca — si no, "3 marcados" podría contar uno
   que ya no está en la lista. */
function pintarLoteCompartir() {
    const vivos = new Set(planes.map((p) => p.id));
    marcadosParaCompartir.forEach((id) => { if (!vivos.has(id)) marcadosParaCompartir.delete(id); });
    const ids = Array.from(marcadosParaCompartir);
    const caja = $("lote-compartir");
    caja.classList.toggle("hidden", ids.length === 0);
    if (!ids.length) return;
    $("lote-cuantos").textContent = ids.length + (ids.length === 1 ? " plan" : " planes");
    $("lote-msg").textContent = "";

    const sel = $("lote-agregar");
    sel.innerHTML = "";
    if (!equipo.length) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "No hay otros profesores";
        sel.appendChild(o);
        $("lote-sumar").disabled = true;
        return;
    }
    $("lote-sumar").disabled = false;
    equipo.forEach((pr) => {
        const o = document.createElement("option");
        o.value = pr.id;
        o.textContent = pr.nombre + (pr.es_admin ? " 👑" : "");
        sel.appendChild(o);
    });
}

async function compartirLoteConTodos() {
    const ids = Array.from(marcadosParaCompartir);
    if (!ids.length) return;
    const btn = $("lote-todos-btn");
    btn.disabled = true;
    $("lote-msg").textContent = "Compartiendo…";
    try {
        for (const id of ids) {
            const actualizado = await PlanClase.actualizarPlan(sb, id, { compartido_todos: true });
            planes = planes.map((p) => (p.id === id ? actualizado : p));
            if (planAbierto && planAbierto.id === id) { planAbierto = actualizado; pintarCompartir(); }
        }
        $("lote-msg").textContent = "Listo: " + ids.length + (ids.length === 1 ? " plan lo ve" : " planes los ve") + " ahora todo el equipo docente de tu academia.";
    } catch (err) {
        $("lote-msg").textContent = "No se pudo compartir: " + err.message;
    }
    btn.disabled = false;
}

async function compartirLoteConProfesor() {
    const ids = Array.from(marcadosParaCompartir);
    const profesorId = $("lote-agregar").value;
    if (!ids.length || !profesorId) return;
    const btn = $("lote-sumar");
    btn.disabled = true;
    $("lote-msg").textContent = "Compartiendo…";
    try {
        for (const id of ids) await PlanClase.compartirCon(sb, id, profesorId);
        if (planAbierto && ids.includes(planAbierto.id)) await cargarCompartidoCon(planAbierto.id);
        const quien = equipo.find((p) => p.id === profesorId);
        $("lote-msg").textContent = "Compartido con " + (quien ? quien.nombre : "ese profesor") + " en " +
            ids.length + (ids.length === 1 ? " plan." : " planes.");
    } catch (err) {
        $("lote-msg").textContent = "No se pudo compartir: " + err.message;
    }
    btn.disabled = false;
}

function quitarMarcaDeLote() {
    marcadosParaCompartir.clear();
    $("lista-planes").querySelectorAll('input[type="checkbox"]').forEach((c) => { c.checked = false; });
    pintarLoteCompartir();
}

function cerrarPlan() {
    planAbierto = null;
    items = [];
    $("detalle").classList.add("hidden");
}

async function abrirPlan(id) {
    planAbierto = planes.find((p) => p.id === id)
        || compartidosConmigo.find((p) => p.id === id) || null;
    if (!planAbierto) return;
    const mio = PlanClase.esMio(planAbierto, profile.id);
    $("detalle").classList.remove("hidden");
    $("detalle-titulo").textContent = PlanClase.tituloVisible(planAbierto.titulo);
    $("p-notas").value = planAbierto.notas || "";
    $("detalle-msg").textContent = "";
    $("item-msg").textContent = "";
    pintarModoDelPlan(mio);
    if (mio) await cargarCompartidoCon(planAbierto.id);
    try {
        items = await PlanClase.itemsDe(sb, id);
    } catch (e) {
        $("detalle-msg").textContent = "No se pudieron cargar los renglones: " + e.message;
        items = [];
    }
    pintarItems();
    await cargarPlanes();
}

function pintarItems() {
    const lista = $("lista-items");
    const mio = planAbierto ? PlanClase.esMio(planAbierto, profile.id) : true;
    lista.innerHTML = "";
    $("sin-items").classList.toggle("hidden", items.length > 0);
    items.forEach((it, i) => {
        const li = document.createElement("li");
        li.dataset.itemId = it.id;
        li.className = "bg-brand-50 dark:bg-brand-950 rounded-lg px-3 py-2 flex items-start justify-between gap-2 flex-wrap";

        const izq = document.createElement("div");
        izq.className = "min-w-0 flex-1";
        const t = document.createElement("p");
        t.className = "text-sm font-semibold text-brand-700 dark:text-brand-200 break-words";
        t.textContent = PlanClase.resumen(it);
        izq.appendChild(t);
        const detalle = it.pregunta || it.nota || it.fen;
        if (detalle) {
            const d = document.createElement("p");
            d.className = "text-xs text-brand-450 dark:text-brand-350 break-words" + (it.fen && !it.pregunta && !it.nota ? " font-mono" : "");
            d.textContent = detalle;
            izq.appendChild(d);
        }
        li.appendChild(izq);

        // En el plan de una colega no se pintan reordenar ni quitar. La base los
        // rechazaría igual, pero un botón que va a fallar es peor que no tenerlo.
        if (!mio) { lista.appendChild(li); return; }

        const acciones = document.createElement("div");
        acciones.className = "flex items-center gap-1 shrink-0";
        const clases = "text-xs font-semibold px-2 py-1 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-40";

        const subir = document.createElement("button");
        subir.type = "button"; subir.className = clases; subir.textContent = "↑";
        subir.title = "Subir este renglón";
        subir.setAttribute("aria-label", "Subir: " + it.titulo);
        subir.disabled = i === 0;
        subir.addEventListener("click", () => mover(it.id, -1));

        const bajar = document.createElement("button");
        bajar.type = "button"; bajar.className = clases; bajar.textContent = "↓";
        bajar.title = "Bajar este renglón";
        bajar.setAttribute("aria-label", "Bajar: " + it.titulo);
        bajar.disabled = i === items.length - 1;
        bajar.addEventListener("click", () => mover(it.id, 1));

        const quitar = document.createElement("button");
        quitar.type = "button"; quitar.className = clases; quitar.textContent = "✖";
        quitar.title = "Quitar del plan";
        quitar.setAttribute("aria-label", "Quitar: " + it.titulo);
        quitar.addEventListener("click", () => quitarItem(it.id));

        acciones.append(subir, bajar, quitar);
        li.appendChild(acciones);
        lista.appendChild(li);
    });
}

/* Qué se ve del plan abierto según de quién sea. Se pinta ENTERO cada vez que se
   abre uno, en vez de ir prendiendo y apagando lo que cambió: así no hay que
   acordarse de limpiar lo del anterior, que es justo el descuido que dejaría el
   botón de borrar encima del material de una colega. */
function pintarModoDelPlan(mio) {
    $("detalle-autor").classList.toggle("hidden", mio);
    if (!mio) {
        $("detalle-autor").textContent = "Lo escribió " + (planAbierto.autor || "otro profesor");
    }
    $("borrar-plan").classList.toggle("hidden", !mio);
    $("bloque-compartir").classList.toggle("hidden", !mio);
    $("form-item").classList.toggle("hidden", !mio);
    $("solo-lectura").classList.toggle("hidden", mio);
    // Las notas del plan de una colega se leen —explican cómo darlo— pero no se
    // escriben. Va `readOnly` y no `disabled`: un campo desactivado sale del
    // recorrido del teclado y quien no ve la pantalla no se enteraría de que
    // están ahí.
    $("p-notas").readOnly = !mio;
    $("p-notas").classList.toggle("opacity-70", !mio);
}

async function cargarCompartidoCon(planId) {
    try {
        compartidoCon = await PlanClase.compartidosDe(sb, planId);
        $("c-msg").textContent = "";
    } catch (e) {
        compartidoCon = [];
        $("c-msg").textContent = "No se pudo leer con quién lo compartes: " + e.message;
    }
    pintarCompartir();
}

function pintarCompartir() {
    const todos = planAbierto ? planAbierto.compartido_todos === true : false;
    $("c-todos").checked = todos;
    // Con "todo el equipo" puesto, elegir de a uno no agrega nada: ya lo ven
    // todos. Se esconde en vez de dejar un control que no cambia nada.
    $("c-elegidos-bloque").classList.toggle("hidden", todos);

    const ul = $("c-etiquetas");
    ul.innerHTML = "";
    $("c-nadie").classList.toggle("hidden", todos || compartidoCon.length > 0);
    compartidoCon.forEach((id) => {
        const quien = equipo.find((p) => p.id === id);
        const li = document.createElement("li");
        li.className = "inline-flex items-center gap-1 bg-white dark:bg-brand-900 border border-brand-200 dark:border-brand-700 rounded-full pl-3 pr-1 py-1 text-xs text-brand-700 dark:text-brand-200";
        const n = document.createElement("span");
        n.textContent = quien ? quien.nombre : "Profesor";
        const x = document.createElement("button");
        x.type = "button";
        x.className = "w-5 h-5 flex items-center justify-center rounded-full hover:bg-brand-100 dark:hover:bg-brand-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
        x.textContent = "✕";
        x.setAttribute("aria-label", "Dejar de compartir con " + (quien ? quien.nombre : "este profesor"));
        x.addEventListener("click", () => quitarProfesor(id));
        li.append(n, x);
        ul.appendChild(li);
    });

    const sel = $("c-agregar");
    sel.innerHTML = "";
    const libres = equipo.filter((p) => !compartidoCon.includes(p.id));
    if (!libres.length) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = equipo.length ? "Ya lo compartes con todos" : "No hay otros profesores";
        sel.appendChild(o);
        $("c-sumar").disabled = true;
        return;
    }
    $("c-sumar").disabled = false;
    libres.forEach((pr) => {
        const o = document.createElement("option");
        o.value = pr.id;
        o.textContent = pr.nombre + (pr.es_admin ? " 👑" : "");
        sel.appendChild(o);
    });
}

async function cambiarCompartidoTodos() {
    if (!planAbierto) return;
    const valor = $("c-todos").checked;
    $("c-msg").textContent = "Guardando…";
    try {
        planAbierto = Object.assign({}, planAbierto,
            await PlanClase.actualizarPlan(sb, planAbierto.id, { compartido_todos: valor }));
        planes = planes.map((p) => (p.id === planAbierto.id ? planAbierto : p));
        $("c-msg").textContent = valor
            ? "Lo ve todo el equipo docente de tu academia."
            : "Ya no lo ve todo el equipo. Sigue compartido con quien elegiste.";
        pintarCompartir();
    } catch (err) {
        // Si no se guardó, la casilla tiene que volver a decir la verdad.
        $("c-todos").checked = !valor;
        $("c-msg").textContent = "No se pudo guardar: " + err.message;
    }
}

async function sumarProfesor() {
    if (!planAbierto) return;
    const id = $("c-agregar").value;
    if (!id) return;
    $("c-msg").textContent = "Compartiendo…";
    try {
        await PlanClase.compartirCon(sb, planAbierto.id, id);
        compartidoCon = compartidoCon.concat([id]);
        pintarCompartir();
        const quien = equipo.find((p) => p.id === id);
        $("c-msg").textContent = "Compartido con " + (quien ? quien.nombre : "ese profesor") + ".";
    } catch (err) {
        $("c-msg").textContent = "No se pudo compartir: " + err.message;
    }
}

async function quitarProfesor(id) {
    if (!planAbierto) return;
    try {
        await PlanClase.dejarDeCompartir(sb, planAbierto.id, id);
        compartidoCon = compartidoCon.filter((x) => x !== id);
        pintarCompartir();
        $("c-msg").textContent = "Ya no lo comparte.";
    } catch (err) {
        $("c-msg").textContent = "No se pudo quitar: " + err.message;
    }
}

async function crearPlan(e) {
    e.preventDefault();
    const titulo = $("p-titulo").value.trim();
    if (!titulo) return;
    $("plan-msg").textContent = "Creando…";
    try {
        const nuevo = await PlanClase.crearPlan(sb, profile.id, titulo, null);
        $("p-titulo").value = "";
        $("plan-msg").textContent = "";
        planes.unshift(nuevo);
        await abrirPlan(nuevo.id);
    } catch (err) {
        $("plan-msg").textContent = "No se pudo crear: " + err.message;
    }
}

async function guardarNotas() {
    if (!planAbierto || !PlanClase.esMio(planAbierto, profile.id)) return;
    const notas = $("p-notas").value.trim();
    if ((planAbierto.notas || "") === notas) return;
    try {
        planAbierto = await PlanClase.actualizarPlan(sb, planAbierto.id, { notas: notas || null });
        planes = planes.map((p) => (p.id === planAbierto.id ? planAbierto : p));
        $("detalle-msg").textContent = "Notas guardadas.";
    } catch (err) {
        $("detalle-msg").textContent = "No se pudieron guardar las notas: " + err.message;
    }
}

async function agregarItem(e) {
    e.preventDefault();
    if (!planAbierto) return;
    const tipo = $("i-tipo").value;
    const titulo = $("i-titulo").value.trim();
    if (!titulo) { $("item-msg").textContent = "Ponle un nombre al renglón."; return; }

    const item = { tipo, titulo, orden: items.length };
    if (tipo === "posicion") {
        const fen = $("i-fen").value.trim();
        if (!fen) { $("item-msg").textContent = "Pega la posición en FEN."; return; }
        // La misma pregunta que hace la clase en vivo, pero AHORA: enterarse
        // aquí cuesta una corrección; enterarse allá cuesta la clase.
        const motivo = PosicionValida.motivo(fen);
        if (motivo) { $("item-msg").textContent = motivo; return; }
        item.fen = fen;
        item.pregunta = $("i-pregunta").value.trim() || null;
    } else if (tipo === "leccion") {
        const curso = $("i-curso").value;
        if (!curso) { $("item-msg").textContent = "Elige el curso."; return; }
        item.curso = curso;
        // En la base y en los visores la primera lección es la 0; en pantalla se
        // numera desde 1, que es como la nombra el profesor.
        item.leccion = Math.max(1, parseInt($("i-leccion").value, 10) || 1) - 1;
    } else {
        item.nota = $("i-nota").value.trim() || null;
    }

    $("item-msg").textContent = "Guardando…";
    try {
        const nuevo = await PlanClase.agregarItem(sb, planAbierto.id, item);
        items.push(nuevo);
        pintarItems();
        $("i-titulo").value = "";
        $("i-fen").value = "";
        $("i-pregunta").value = "";
        $("i-nota").value = "";
        $("item-msg").textContent = "Agregado.";
    } catch (err) {
        $("item-msg").textContent = "No se pudo agregar: " + err.message;
    }
}

async function mover(id, direccion) {
    try {
        items = await PlanClase.moverItem(sb, items, id, direccion);
        pintarItems();
    } catch (err) {
        $("detalle-msg").textContent = "No se pudo reordenar: " + err.message;
    }
}

async function quitarItem(id) {
    try {
        await PlanClase.borrarItem(sb, id);
        items = items.filter((x) => x.id !== id);
        pintarItems();
    } catch (err) {
        $("detalle-msg").textContent = "No se pudo quitar: " + err.message;
    }
}

async function duplicar() {
    if (!planAbierto) return;
    $("detalle-msg").textContent = "Duplicando…";
    try {
        const copia = await PlanClase.duplicarPlan(sb, profile.id, planAbierto);
        planes.unshift(copia);
        await abrirPlan(copia.id);
        $("detalle-msg").textContent = "Listo: la copia es tuya y la puedes cambiar.";
    } catch (err) {
        $("detalle-msg").textContent = "No se pudo duplicar: " + err.message;
    }
}

/* Borrar un plan se lleva sus renglones, así que el paso de confirmación va en
   el propio botón y no en un diálogo del navegador, que en el celular tapa la
   pantalla. Mismo patrón que la bitácora. */
async function borrarPlan() {
    if (!planAbierto) return;
    const btn = $("borrar-plan");
    if (btn.dataset.confirmando !== "1") {
        btn.dataset.confirmando = "1";
        btn.textContent = "¿Seguro? Borrar plan";
        setTimeout(() => {
            if (btn.dataset.confirmando === "1") { btn.dataset.confirmando = ""; btn.textContent = "Borrar plan"; }
        }, 4000);
        return;
    }
    btn.dataset.confirmando = "";
    btn.textContent = "Borrar plan";
    try {
        await PlanClase.borrarPlan(sb, planAbierto.id);
        planes = planes.filter((p) => p.id !== planAbierto.id);
        cerrarPlan();
        await cargarPlanes();
    } catch (err) {
        $("detalle-msg").textContent = "No se pudo borrar: " + err.message;
    }
}

init();
    