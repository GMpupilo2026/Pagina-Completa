/* sala-admin.html: los equipos, los jugadores y las arenas de la sala.

 * La sala (sala.html) es APARTE de la Academia: sus jugadores no son cuentas de
 * la Academia sino estudiantes de las inscripciones a los torneos en línea, a
 * quienes se les da un usuario y una clave. Todo eso vive en «Base de
 * Colegios», no en el Supabase de la Academia.
 *
 * Por eso acá no hay ningún `sb.from(...)`: las tablas `arena_*` no tienen
 * políticas de escritura y la lista de inscripciones no la lee nadie desde el
 * navegador (son menores de edad). Todo pasa por la Edge Function `arena-admin`,
 * que le reenvía la sesión a la Academia y le pregunta a `soy_coordinador()`
 * (la misma regla de inscripciones.html). El filtro de abajo solo decide si se
 * pinta la pantalla o el aviso.
 *
 * LAS CLAVES salen UNA vez, en la respuesta que crea la cuenta: en la base
 * queda solo su hash. Por eso, al agregar jugadores, la pantalla muestra la
 * tabla de usuarios y claves con «Bajar en Excel (CSV)» y «Copiar», y dice que
 * no se vuelve a ver. Si se pierde una, «Nueva clave» genera otra.
 *
 * Todo texto de una persona entra por `textContent`.
 */
const FUNCION = "https://prcfbzvshnusisczlpxl.supabase.co/functions/v1/arena-admin";
const MAX_POR_VEZ = 100;
const POR_PAGINA = 60;

let sala = { equipos: [], jugadores: [], torneos: [], inscripciones: [] };
const marcadas = new Set();
let mostradas = POR_PAGINA;

const $ = (id) => document.getElementById(id);

function el(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
}

function sinTildes(t) {
    return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function nombreCompleto(i) {
    return [i.nombre, i.apellido1, i.apellido2].filter(Boolean).join(" ") || "(sin nombre)";
}

const BOTON = "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ";
const BOTON_SECUNDARIO = BOTON + "bg-brand-100 hover:bg-brand-200 text-brand-800 dark:bg-brand-800 dark:hover:bg-brand-700 dark:text-brand-100";
const BOTON_PELIGRO = BOTON + "bg-red-100 hover:bg-red-200 text-red-800 dark:bg-red-950 dark:hover:bg-red-900 dark:text-red-200";
const CAMPO = "px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-sm focus:ring-2 focus:ring-accent-500 outline-none";

function boton(texto, clase, alTocar, etiqueta) {
    const b = el("button", clase, texto);
    b.type = "button";
    if (etiqueta) b.setAttribute("aria-label", etiqueta);
    b.addEventListener("click", alTocar);
    return b;
}

/* ------------------------------------------------------------ la función */

async function llamar(accion, datos) {
    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session) { window.location.href = "login.html?next=sala-admin.html"; throw new Error("Hace falta iniciar sesión."); }
    const res = await fetch(FUNCION, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify(Object.assign({ accion: accion }, datos || {})),
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || "No se pudo completar la acción.");
    return cuerpo;
}

/* Una acción con su aviso: lo que salió mal se dice, no se traga. */
async function hacer(accion, datos, ok) {
    try {
        const r = await llamar(accion, datos);
        if (ok) Avisos.avisar(ok);
        return r;
    } catch (err) {
        Avisos.avisar(err.message, { tipo: "error" });
        return null;
    }
}

async function recargar() {
    const r = await llamar("estado");
    sala = { equipos: r.equipos || [], jugadores: r.jugadores || [], torneos: r.torneos || [], inscripciones: r.inscripciones || [] };
    pintarTodo();
}

/* ------------------------------------------------------------- los equipos */

function nombreDeEquipo(id) {
    const e = sala.equipos.find((x) => x.id === id);
    return e ? e.nombre : "";
}

function tarjetaEquipo(equipo) {
    const miembros = sala.jugadores.filter((j) => (equipo ? j.equipo_id === equipo.id : !j.equipo_id));
    const caja = el("div", "border border-brand-100 dark:border-brand-800 rounded-xl p-4");
    const cab = el("div", "flex flex-wrap items-center justify-between gap-2 mb-2");
    const titulo = el("h3", "font-serif text-base font-bold text-brand-800 dark:text-white",
        (equipo ? equipo.nombre : "Sin equipo") + " · " + miembros.length + (miembros.length === 1 ? " jugador" : " jugadores"));
    cab.appendChild(titulo);
    if (equipo) {
        const acciones = el("div", "flex flex-wrap gap-2");
        acciones.appendChild(boton("Cambiar nombre", BOTON_SECUNDARIO, async () => {
            const v = await Avisos.pedir("Nuevo nombre del equipo", { valor: equipo.nombre, aceptar: "Cambiar nombre" });
            if (v == null || !v.trim()) return;
            if (await hacer("renombrar_equipo", { id: equipo.id, nombre: v }, "Equipo renombrado.")) await recargar();
        }, "Cambiar el nombre del equipo " + equipo.nombre));
        acciones.appendChild(boton("Borrar equipo", BOTON_PELIGRO, async () => {
            const si = await Avisos.confirmar("Los jugadores de «" + equipo.nombre + "» no se borran: quedan sin equipo.",
                { titulo: "¿Borrar el equipo?", aceptar: "Borrar equipo", peligro: true });
            if (si && await hacer("borrar_equipo", { id: equipo.id }, "Equipo borrado.")) await recargar();
        }, "Borrar el equipo " + equipo.nombre));
        cab.appendChild(acciones);
    }
    caja.appendChild(cab);

    if (!miembros.length) {
        caja.appendChild(el("p", "text-sm text-brand-450 dark:text-brand-350", "Todavía no tiene jugadores."));
        return caja;
    }
    const tabla = el("table", "w-full text-sm");
    tabla.appendChild(el("caption", "sr-only", "Jugadores de " + (equipo ? equipo.nombre : "ningún equipo")));
    const cabeza = el("thead");
    const fila0 = el("tr", "text-left text-brand-450 dark:text-brand-350 uppercase text-xs border-b border-brand-100 dark:border-brand-800");
    ["Jugador", "Usuario", "Equipo", "Acciones"].forEach((t) => {
        const th = el("th", "py-1.5 pr-3 font-semibold", t);
        th.scope = "col";
        fila0.appendChild(th);
    });
    cabeza.appendChild(fila0);
    tabla.appendChild(cabeza);
    const cuerpo = el("tbody");
    miembros.forEach((j) => {
        const tr = el("tr", "border-b border-brand-50 dark:border-brand-800/60");
        tr.appendChild(el("td", "py-1.5 pr-3", j.nombre));
        tr.appendChild(el("td", "py-1.5 pr-3 font-mono text-xs", j.usuario));
        const tdEq = el("td", "py-1.5 pr-3");
        const sel = el("select", CAMPO + " py-1 text-xs");
        sel.setAttribute("aria-label", "Equipo de " + j.nombre);
        const sin = el("option", null, "Sin equipo");
        sin.value = "";
        sel.appendChild(sin);
        sala.equipos.forEach((e) => {
            const o = el("option", null, e.nombre);
            o.value = e.id;
            sel.appendChild(o);
        });
        sel.value = j.equipo_id || "";
        sel.addEventListener("change", async () => {
            if (await hacer("mover_jugador", { jugador_id: j.id, equipo_id: sel.value || null }, j.nombre + " cambió de equipo.")) await recargar();
            else sel.value = j.equipo_id || "";
        });
        tdEq.appendChild(sel);
        tr.appendChild(tdEq);
        const tdAcc = el("td", "py-1.5 flex flex-wrap gap-2");
        tdAcc.appendChild(boton("Nueva clave", BOTON_SECUNDARIO, async () => {
            const si = await Avisos.confirmar("La clave anterior de " + j.nombre + " deja de servir.",
                { titulo: "¿Generar una clave nueva?", aceptar: "Generar clave nueva" });
            if (!si) return;
            const r = await hacer("reiniciar_clave", { jugador_id: j.id });
            if (r) mostrarCuentas([{ nombre: j.nombre, usuario: r.usuario, clave: r.clave }], "Clave nueva");
        }, "Generar una clave nueva para " + j.nombre));
        tdAcc.appendChild(boton("Quitar", BOTON_PELIGRO, async () => {
            const si = await Avisos.confirmar("Se borra su cuenta de la sala y sus partidas. La inscripción no se toca.",
                { titulo: "¿Quitar a " + j.nombre + "?", aceptar: "Quitar jugador", peligro: true });
            if (si && await hacer("quitar_jugador", { jugador_id: j.id }, j.nombre + " ya no está en la sala.")) await recargar();
        }, "Quitar a " + j.nombre + " de la sala"));
        tr.appendChild(tdAcc);
        cuerpo.appendChild(tr);
    });
    tabla.appendChild(cuerpo);
    const envoltura = el("div", "overflow-x-auto");
    envoltura.appendChild(tabla);
    caja.appendChild(envoltura);
    return caja;
}

function pintarEquipos() {
    const caja = $("lista-equipos");
    caja.textContent = "";
    sala.equipos.forEach((e) => caja.appendChild(tarjetaEquipo(e)));
    if (sala.jugadores.some((j) => !j.equipo_id)) caja.appendChild(tarjetaEquipo(null));
    if (!sala.equipos.length) {
        caja.appendChild(el("p", "text-sm text-brand-450 dark:text-brand-350", "Todavía no hay equipos. Crea el primero arriba."));
    }
    const destino = $("destino");
    const previo = destino.value;
    destino.textContent = "";
    const sin = el("option", null, "Sin equipo");
    sin.value = "";
    destino.appendChild(sin);
    sala.equipos.forEach((e) => {
        const o = el("option", null, e.nombre);
        o.value = e.id;
        destino.appendChild(o);
    });
    destino.value = sala.equipos.some((e) => e.id === previo) ? previo : (sala.equipos[0] ? sala.equipos[0].id : "");
    actualizarBotonAgregar();
}

/* ------------------------------------------------- agregar desde inscripciones */

function jugadorDeInscripcion(id) {
    return sala.jugadores.find((j) => j.inscripcion_id === id) || null;
}

function filtradas() {
    const texto = sinTildes($("buscar").value.trim());
    return sala.inscripciones.filter((i) => !texto
        || sinTildes(nombreCompleto(i)).includes(texto)
        || sinTildes(i.centro).includes(texto)
        || sinTildes(i.usuario).includes(texto));
}

function pintarInscritos() {
    const lista = filtradas();
    const caja = $("lista-inscritos");
    caja.textContent = "";
    lista.slice(0, mostradas).forEach((i) => {
        const etiqueta = el("label", "flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-800/60 cursor-pointer");
        const cb = el("input", "mt-1 h-4 w-4 accent-accent-500");
        cb.type = "checkbox";
        cb.checked = marcadas.has(i.id);
        cb.addEventListener("change", () => {
            if (cb.checked) marcadas.add(i.id); else marcadas.delete(i.id);
            actualizarBotonAgregar();
        });
        const texto = el("span", "text-sm");
        texto.appendChild(el("span", "font-semibold", nombreCompleto(i)));
        const detalle = [i.centro, i.grado].filter(Boolean).join(" · ");
        if (detalle) texto.appendChild(el("span", "block text-xs text-brand-450 dark:text-brand-350", detalle));
        const ya = jugadorDeInscripcion(i.id);
        if (ya) {
            const eq = nombreDeEquipo(ya.equipo_id);
            texto.appendChild(el("span", "block text-xs text-accent-700 dark:text-accent-400",
                "Ya tiene cuenta (" + ya.usuario + ")" + (eq ? " en " + eq : " sin equipo") + ": solo se le cambia de equipo."));
        }
        etiqueta.appendChild(cb);
        etiqueta.appendChild(texto);
        caja.appendChild(etiqueta);
    });
    $("resumen-inscritos").textContent = lista.length
        ? "Mostrando " + Math.min(mostradas, lista.length) + " de " + lista.length + (lista.length === 1 ? " inscripción." : " inscripciones.")
        : (sala.inscripciones.length ? "Ninguna inscripción coincide con la búsqueda." : "No hay inscripciones todavía.");
    $("ver-mas").hidden = lista.length <= mostradas;
    actualizarBotonAgregar();
}

function actualizarBotonAgregar() {
    const n = marcadas.size;
    const b = $("agregar");
    const destino = $("destino");
    const nombre = destino.value ? nombreDeEquipo(destino.value) : "";
    b.disabled = n === 0;
    b.textContent = n === 0
        ? "Agregar jugadores"
        : "Agregar " + n + (n === 1 ? " jugador" : " jugadores") + (nombre ? " a «" + nombre + "»" : " sin equipo");
}

async function agregar() {
    const ids = Array.from(marcadas);
    if (!ids.length) return;
    if (ids.length > MAX_POR_VEZ) {
        Avisos.avisar("Se pueden agregar " + MAX_POR_VEZ + " a la vez como máximo. Quita algunas y repite.", { tipo: "error" });
        return;
    }
    const b = $("agregar");
    b.disabled = true;
    const r = await hacer("agregar_jugadores", { equipo_id: $("destino").value || null, inscripciones: ids });
    if (!r) { actualizarBotonAgregar(); return; }
    marcadas.clear();
    await recargar();
    const cuentas = r.cuentas || [];
    if (cuentas.length) mostrarCuentas(cuentas, "Cuentas nuevas");
    const partes = [];
    if (cuentas.length) partes.push(cuentas.length + (cuentas.length === 1 ? " cuenta creada" : " cuentas creadas"));
    if ((r.movidos || []).length) partes.push(r.movidos.length + (r.movidos.length === 1 ? " cambió de equipo" : " cambiaron de equipo"));
    if (partes.length) Avisos.avisar(partes.join(" y ") + ".");
    if ((r.fallos || []).length) {
        Avisos.avisar(r.fallos.length + " no se pudieron agregar: " + r.fallos.map((f) => f.error).join(" "), { tipo: "error" });
    }
}

/* ------------------------------------------------------ usuarios y claves */

let ultimasCuentas = [];

function mostrarCuentas(cuentas, titulo) {
    ultimasCuentas = cuentas;
    $("cuentas-titulo").textContent = titulo + " (" + cuentas.length + ")";
    const cuerpo = $("cuentas-cuerpo");
    cuerpo.textContent = "";
    cuentas.forEach((c) => {
        const tr = el("tr", "border-b border-brand-50 dark:border-brand-800/60");
        tr.appendChild(el("td", "py-1.5 pr-3", c.nombre));
        tr.appendChild(el("td", "py-1.5 pr-3 font-mono", c.usuario));
        tr.appendChild(el("td", "py-1.5 pr-3 font-mono font-bold", c.clave));
        cuerpo.appendChild(tr);
    });
    const panel = $("cuentas");
    panel.hidden = false;
    panel.scrollIntoView({ block: "nearest" });
    $("cuentas-titulo").focus();
}

function textoDeCuentas() {
    return ultimasCuentas.map((c) => c.nombre + "\t" + c.usuario + "\t" + c.clave).join("\n");
}

function csvDeCuentas() {
    const celda = (t) => '"' + String(t).replace(/"/g, '""') + '"';
    const filas = [["Nombre", "Usuario", "Clave"]].concat(ultimasCuentas.map((c) => [c.nombre, c.usuario, c.clave]));
    // El BOM hace que Excel lea las tildes bien.
    return "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
}

function bajarCsv() {
    const blob = new Blob([csvDeCuentas()], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "claves-sala.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copiarCuentas() {
    try {
        await navigator.clipboard.writeText(textoDeCuentas());
        Avisos.avisar("Usuarios y claves copiados.");
    } catch (_e) {
        Avisos.avisar("No se pudo copiar. Usa «Bajar en Excel (CSV)».", { tipo: "error" });
    }
}

/* ------------------------------------------------------------- las arenas */

function estadoDeArena(t) {
    const ini = new Date(t.inicia).getTime();
    const fin = ini + t.minutos * 60000;
    const ahora = Date.now();
    return ahora < ini ? "Próxima" : ahora < fin ? "En curso" : "Terminada";
}

function pintarArenas() {
    const caja = $("lista-arenas");
    caja.textContent = "";
    if (!sala.torneos.length) {
        caja.appendChild(el("p", "text-sm text-brand-450 dark:text-brand-350", "Todavía no hay arenas. Programa la primera arriba."));
        return;
    }
    sala.torneos.forEach((t) => {
        const fila = el("div", "flex flex-wrap items-center justify-between gap-3 border border-brand-100 dark:border-brand-800 rounded-xl p-3");
        const info = el("div", "text-sm");
        info.appendChild(el("p", "font-semibold", t.nombre + " · " + estadoDeArena(t)));
        const ritmo = (t.inicial_seg / 60) + "+" + t.incremento_seg;
        info.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350",
            HoraCR.fechaHora(t.inicia, { dateStyle: "medium", timeStyle: "short" }) + " · " + t.minutos + " min · ritmo " + ritmo
            + (t.por_equipos ? " · por equipos (cuentan los " + t.mejores + " mejores)" : " · individual")));
        fila.appendChild(info);
        fila.appendChild(boton("Borrar arena", BOTON_PELIGRO, async () => {
            const si = await Avisos.confirmar("Se borran también sus partidas y su clasificación.",
                { titulo: "¿Borrar «" + t.nombre + "»?", aceptar: "Borrar arena", peligro: true });
            if (si && await hacer("borrar_torneo", { id: t.id }, "Arena borrada.")) await recargar();
        }, "Borrar la arena " + t.nombre));
        caja.appendChild(fila);
    });
}

function montarFormularioArena() {
    const sel = $("arena-ritmo");
    Ritmos.LISTA.filter((r) => r.initial && r.initial <= 1800 && r.increment <= 30).forEach((r) => {
        const o = el("option", null, r.label);
        o.value = r.id;
        sel.appendChild(o);
    });
    sel.value = "3+0";
    // Por omisión, hoy a las 7 de la noche (hora de Costa Rica).
    $("arena-inicia").value = HoraCR.dia() + "T19:00";
    $("form-arena").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const ritmo = Ritmos.LISTA.find((r) => r.id === sel.value);
        const inicia = HoraCR.desdeCampo($("arena-inicia").value);
        if (isNaN(inicia.getTime())) { Avisos.avisar("Falta la fecha y la hora de inicio.", { tipo: "error" }); return; }
        const r = await hacer("crear_torneo", {
            nombre: $("arena-nombre").value,
            inicia: inicia.toISOString(),
            minutos: Number($("arena-minutos").value),
            inicial_seg: ritmo.initial,
            incremento_seg: ritmo.increment,
            por_equipos: $("arena-equipos").checked,
            mejores: Number($("arena-mejores").value),
        }, "Arena programada.");
        if (r) { $("arena-nombre").value = ""; await recargar(); }
    });
    $("arena-equipos").addEventListener("change", () => { $("arena-mejores-caja").hidden = !$("arena-equipos").checked; });
}

/* ---------------------------------------------------------------- arranque */

function pintarTodo() {
    pintarEquipos();
    pintarInscritos();
    pintarArenas();
}

async function init() {
    const { data } = await sb.auth.getSession();
    if (!data.session) { window.location.href = "login.html?next=sala-admin.html"; return; }
    /* Filtro de PINTAR: quien deja pasar de verdad es la Edge Function, que
       vuelve a preguntar lo mismo con esta misma sesión. */
    const { data: puede } = await sb.rpc("soy_coordinador");
    $("loading").classList.add("hidden");
    if (puede !== true) { $("denegado").classList.remove("hidden"); return; }
    $("app").classList.remove("hidden");

    $("form-equipo").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const campo = $("equipo-nombre");
        if (!campo.value.trim()) return;
        if (await hacer("crear_equipo", { nombre: campo.value }, "Equipo creado.")) { campo.value = ""; await recargar(); }
    });
    $("buscar").addEventListener("input", () => { mostradas = POR_PAGINA; pintarInscritos(); });
    $("ver-mas").addEventListener("click", () => { mostradas += POR_PAGINA; pintarInscritos(); });
    $("marcar-visibles").addEventListener("click", () => {
        filtradas().slice(0, mostradas).forEach((i) => marcadas.add(i.id));
        pintarInscritos();
    });
    $("desmarcar").addEventListener("click", () => { marcadas.clear(); pintarInscritos(); });
    $("destino").addEventListener("change", actualizarBotonAgregar);
    $("agregar").addEventListener("click", agregar);
    $("bajar-csv").addEventListener("click", bajarCsv);
    $("copiar-cuentas").addEventListener("click", copiarCuentas);
    $("cerrar-cuentas").addEventListener("click", () => { $("cuentas").hidden = true; ultimasCuentas = []; $("cuentas-cuerpo").textContent = ""; });
    montarFormularioArena();

    try {
        await recargar();
    } catch (err) {
        // Se dice lo que pasó en vez de dejar listas vacías que se leen como «no hay nada».
        $("error-carga").textContent = err.message;
        $("error-carga").hidden = false;
    }
}

init();
