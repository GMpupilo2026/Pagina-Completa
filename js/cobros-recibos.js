/* Los recibos de cobros.html: la ficha «🧾 Recibos», el pago adelantado y
   «Tus recibos» del alumno.

   Se carga ANTES que js/cobros.js y solo declara funciones: usa lo que
   cobros.js deja global (sb, session, alumnos, suscripciones, planes, el,
   plata, fecha, avisar, nombreDe, hoyCR, METODOS, llamarCobros), y lo llama
   cobros.js una vez que todo eso está cargado.

   QUIÉN HACE QUÉ, y lo decide la base (no esta pantalla, que solo esconde
   botones):
   - quien coordina registra el pago y queda su recibo, con número propio de
     la academia (R-ADAPZ-2026-0001);
   - quien supervisa a ese alumno, o administración, lo REVISA y lo entrega:
     lo manda por correo o lo marca como entregado en mano. También corrige
     (montos, fecha, método) y anula. puedo_corregir_cobros() en la base y en
     la Edge Function.
   Ver «Recibos por academia» en docs/decisiones/cobros-acceso-y-tienda.md. */

// Quien revisa y entrega: quien supervisa o administra. Lo pone cobros.js.
let corrige = false;

const RECIBOS_POR_PAGINA = 30;
let recibos = [];
let recibosDesde = 0;
let recibosTotal = 0;
let recibosPeticion = 0;    // descarta la respuesta que llega tarde

const BTN_RECIBO = "text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
const BTN_RECIBO_SUAVE = BTN_RECIBO + " border-brand-200 dark:border-brand-700 hover:border-accent-400 text-brand-600 dark:text-brand-300";
const BTN_RECIBO_FUERTE = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-3 py-1.5 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";

function boton(texto, clase, alHacer) {
    const b = el("button", clase, texto);
    b.type = "button";
    b.addEventListener("click", alHacer);
    return b;
}

/* Cómo le llegó a la familia, en palabras: el color nunca va solo. */
function entregaDe(r) {
    if (r.estado === "anulado") return { texto: "Anulado", clase: "bg-brand-100 text-brand-450 dark:bg-brand-800 dark:text-brand-350" };
    if (r.entrega === "correo") return { texto: "Enviado por correo", clase: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" };
    if (r.entrega === "mano") return { texto: "Entregado en mano", clase: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" };
    return { texto: "Por revisar y entregar", clase: "bg-accent-100 text-brand-900 dark:bg-accent-900 dark:text-white" };
}

// ------------------------------------------------------------- la lista
function consultaRecibos() {
    let q = sb.from("recibos_vista").select("*", { count: "exact" });
    const estado = document.getElementById("rc-estado").value;
    const alumno = document.getElementById("rc-alumno").value;
    const buscar = BusquedaBase.limpiar(document.getElementById("rc-buscar").value.trim());
    if (estado === "sin-entregar") q = q.eq("estado", "emitido").is("entrega", null);
    if (estado === "entregados") q = q.eq("estado", "emitido").not("entrega", "is", null);
    if (estado === "anulados") q = q.eq("estado", "anulado");
    if (alumno) q = q.eq("student_id", alumno);
    if (buscar) q = q.ilike("numero", "%" + buscar + "%");
    return q.order("fecha", { ascending: false }).order("created_at", { ascending: false });
}

async function cargarRecibos(desdeCero) {
    if (desdeCero) { recibosDesde = 0; recibos = []; }
    const mia = ++recibosPeticion;
    const { data, error, count } = await consultaRecibos().range(recibosDesde, recibosDesde + RECIBOS_POR_PAGINA - 1);
    if (mia !== recibosPeticion) return;
    if (error) { avisar("No se pudieron cargar los recibos: " + error.message, true); return; }
    if (count != null) recibosTotal = count;
    recibos = recibos.concat(data || []);
    recibosDesde = recibos.length;
    pintarRecibos();
}

function pintarRecibos() {
    const caja = document.getElementById("rc-lista");
    caja.innerHTML = "";
    document.getElementById("rc-vacio").classList.toggle("hidden", recibos.length > 0);
    document.getElementById("rc-cuenta").textContent = recibos.length
        ? "Mostrando " + recibos.length + " de " + recibosTotal + (recibosTotal === 1 ? " recibo" : " recibos") : "";
    document.getElementById("rc-mas").classList.toggle("hidden", recibos.length >= recibosTotal);
    recibos.forEach((r) => caja.appendChild(tarjetaRecibo(r)));
}

function tarjetaRecibo(r) {
    const d = el("div", "recibo-fila bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4");
    d.dataset.id = r.id;
    const fila = el("div", "flex flex-wrap items-start justify-between gap-3");
    const izq = el("div", "min-w-0");
    const linea = el("p", "font-semibold text-brand-800 dark:text-white");
    linea.append(r.numero + " ");
    const e = entregaDe(r);
    linea.appendChild(el("span", "recibo-entrega ml-1 inline-block px-2 py-0.5 rounded-full text-xs font-semibold " + e.clase, e.texto));
    izq.appendChild(linea);
    izq.appendChild(el("p", "text-sm text-brand-500 dark:text-brand-300", nombreDe(r.student_id)));
    const detalle = (r.detalle || []).map((x) => x.concepto).join(" · ");
    if (detalle) izq.appendChild(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-1", detalle));
    const pie = [fecha(r.fecha), METODOS[r.metodo] || r.metodo];
    if (r.referencia) pie.push("ref. " + r.referencia);
    if (r.entrega === "correo" && r.enviado_at) {
        pie.push("enviado el " + fecha(String(r.enviado_at).slice(0, 10)) + (r.enviado_a && r.enviado_a.length ? " a " + r.enviado_a.join(", ") : ""));
    }
    if (r.estado === "anulado" && r.anulado_motivo) pie.push("anulado: " + r.anulado_motivo);
    izq.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350 mt-1", pie.join(" · ")));
    fila.appendChild(izq);
    fila.appendChild(el("p", "text-lg font-bold text-brand-800 dark:text-white", plata(r.total, r.moneda || "CRC")));
    d.appendChild(fila);

    const botones = el("div", "flex flex-wrap gap-2 mt-3 pt-3 border-t border-brand-100 dark:border-brand-800");
    botones.appendChild(boton("👁️ Ver o imprimir", BTN_RECIBO_SUAVE, () => verRecibo(r)));
    if (corrige) {
        if (r.estado === "emitido") {
            botones.appendChild(boton(r.entrega === "correo" ? "📧 Volver a mandar" : "📧 Mandar por correo",
                r.entrega ? BTN_RECIBO_SUAVE : BTN_RECIBO_FUERTE, () => verRecibo(r)));
            botones.appendChild(r.entrega === "mano"
                ? boton("Deshacer «entregado en mano»", BTN_RECIBO_SUAVE, () => entregadoEnMano(r, false))
                : boton("Marcar como entregado en mano", BTN_RECIBO_SUAVE, () => entregadoEnMano(r, true)));
            botones.appendChild(boton("Corregir", BTN_RECIBO_SUAVE, () => corregirRecibo(r)));
            botones.appendChild(boton("Anular", BTN_RECIBO + " border-brand-200 dark:border-brand-700 hover:border-red-400 text-red-700 dark:text-red-300", () => anularRecibo(r, true)));
        } else {
            botones.appendChild(boton("Reactivar", BTN_RECIBO_SUAVE, () => anularRecibo(r, false)));
        }
    }
    d.appendChild(botones);
    return d;
}

/* Lo que puede hacer quien mira, dicho arriba de la lista: quien coordina
   tiene que saber que el recibo no sale hasta que alguien lo revise. */
function pintarQuienEntrega() {
    document.getElementById("rc-quien").textContent = corrige
        ? "Revisa cada recibo antes de entregarlo: lo mandas por correo a la familia o lo marcas como entregado en mano."
        : "Los recibos los revisa y los entrega quien supervisa la academia. Tú registras el pago; el recibo sale cuando lo revisen.";
}

async function contarRecibosSinEntregar() {
    const marca = document.getElementById("rc-pendientes-ficha");
    const { count, error } = await sb.from("recibos").select("id", { count: "exact", head: true })
        .eq("estado", "emitido").is("entrega", null);
    marca.textContent = !error && count ? " (" + count + " por entregar)" : "";
}

// ------------------------------------------------- ver, imprimir y mandar
/* Muestra el recibo en un marco: el HTML lo arma la misma función que lo
   manda por correo. `donde` dice en qué caja (la de coordinación o la del
   alumno). */
async function verRecibo(r, donde) {
    const ids = donde || { caja: "rc-previa", titulo: "rc-previa-titulo", botones: "rc-previa-botones", destinos: "rc-previa-destinos" };
    const caja = document.getElementById(ids.caja);
    const titulo = document.getElementById(ids.titulo);
    const botones = document.getElementById(ids.botones);
    titulo.textContent = "Armando el recibo " + r.numero + "…";
    botones.innerHTML = "";
    caja.hidden = false;
    let datos;
    try { datos = await llamarCobros({ action: "recibo_ver", recibo_id: r.id }); }
    catch (err) { titulo.textContent = "No se pudo armar el recibo: " + err.message; return; }
    titulo.textContent = "Recibo " + datos.numero;

    let marco = caja.querySelector("iframe");
    if (!marco) {
        marco = document.createElement("iframe");
        marco.title = "Recibo de pago";
        // Sin allow-scripts: el recibo es HTML sin código. allow-same-origin y
        // allow-modals hacen falta para imprimirlo desde el botón.
        marco.setAttribute("sandbox", "allow-same-origin allow-modals");
        marco.className = "w-full h-[40rem] rounded-xl border border-brand-200 dark:border-brand-700 bg-white";
        caja.appendChild(marco);
    }
    marco.srcdoc = datos.html;

    botones.appendChild(boton("🖨️ Imprimir o guardar en PDF", BTN_RECIBO_FUERTE, () => {
        try { marco.contentWindow.focus(); marco.contentWindow.print(); }
        catch (e) { avisar("No se pudo abrir la impresión: " + e.message, true); }
    }));
    if (ids.destinos) {
        const destinos = document.getElementById(ids.destinos);
        destinos.textContent = "";
        if (corrige && r.estado === "emitido") {
            destinos.textContent = datos.correos && datos.correos.length
                ? "Se manda a: " + datos.correos.join(", ") + ". Si no es ahí, corrígelo en la ficha «Contacto»."
                : "⚠️ Este alumno no tiene ningún correo al que mandarle el recibo. Ponle uno en la ficha «Contacto», o entrégalo impreso.";
            if (datos.correos && datos.correos.length) {
                const mandar = boton(r.entrega === "correo" ? "📧 Volver a mandar" : "📧 Ya lo revisé: mandarlo", BTN_RECIBO_FUERTE, () => enviarRecibo(r, mandar));
                botones.appendChild(mandar);
            }
        }
    }
    botones.appendChild(boton("Cerrar", BTN_RECIBO_SUAVE, () => { caja.hidden = true; }));
    titulo.focus();
    caja.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function enviarRecibo(r, b) {
    const antes = b.textContent;
    b.disabled = true; b.textContent = "Mandando…";
    try {
        const res = await llamarCobros({ action: "recibo_enviar", recibo_id: r.id });
        avisar("Recibo " + r.numero + " mandado a: " + (res.correos || []).join(", ") + "."
            + (res.fallos && res.fallos.length ? " No llegó a: " + res.fallos.join(" | ") : ""), res.fallos && res.fallos.length > 0);
        document.getElementById("rc-previa").hidden = true;
        await Promise.all([cargarRecibos(true), contarRecibosSinEntregar()]);
    } catch (err) {
        b.disabled = false; b.textContent = antes;
        avisar("No se pudo mandar: " + err.message, true);
    }
}

async function entregadoEnMano(r, si) {
    const { error } = await sb.rpc("recibo_entregado_en_mano", { p_recibo: r.id, p_entregado: si });
    if (error) return avisar("No se pudo: " + error.message, true);
    avisar(si ? "Recibo " + r.numero + " marcado como entregado en mano." : "Listo: el recibo " + r.numero + " vuelve a quedar por entregar.");
    await Promise.all([cargarRecibos(true), contarRecibosSinEntregar()]);
}

// ------------------------------------------------- lo que corrige quien supervisa
function fechaValida(t) {
    return /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(new Date(t + "T12:00:00Z").getTime());
}

async function corregirRecibo(r) {
    const lineas = r.detalle || [];
    const r2 = await Avisos.formulario({
        titulo: "Corregir el recibo " + r.numero,
        texto: "Si cambias un monto, cambia lo que se da por pagado de ese cobro. Un monto en 0 quita esa línea del recibo.",
        campos: [
            { nombre: "fecha", etiqueta: "Fecha del pago (AAAA-MM-DD)", valor: r.fecha, inputmode: "numeric" },
            { nombre: "metodo", etiqueta: "Cómo pagó", tipo: "select", valor: r.metodo, opciones: Object.entries(METODOS) },
            { nombre: "referencia", etiqueta: "Comprobante o referencia (opcional)", valor: r.referencia || "" },
            { nombre: "nota", etiqueta: "Nota (opcional)", valor: r.nota || "" },
            ...lineas.map((x, i) => ({ nombre: "m" + i, etiqueta: "Monto de «" + x.concepto + "»", valor: String(x.monto), inputmode: "decimal" })),
        ],
        aceptar: "Guardar los cambios",
    });
    if (!r2) return;
    const fechaNueva = String(r2.fecha || "").trim();
    if (!fechaValida(fechaNueva)) return avisar("La fecha va como AAAA-MM-DD, por ejemplo " + hoyCR() + ".", true);
    if (fechaNueva > hoyCR()) return avisar("La fecha del pago no puede ser en el futuro.", true);
    const montos = {};
    for (let i = 0; i < lineas.length; i++) {
        const texto = String(r2["m" + i] || "").replace(",", ".").trim();
        const n = Number(texto);
        if (texto === "" || !(n >= 0)) return avisar("Cada monto tiene que ser un número (0 o más).", true);
        if (n !== Number(lineas[i].monto)) montos[lineas[i].pago_id] = n;
    }
    const { error } = await sb.rpc("corregir_recibo", {
        p_recibo: r.id, p_fecha: fechaNueva, p_metodo: r2.metodo,
        p_referencia: String(r2.referencia || "").trim() || null, p_nota: String(r2.nota || "").trim() || null,
        p_montos: Object.keys(montos).length ? montos : null,
    });
    if (error) return avisar("No se pudo corregir: " + error.message, true);
    avisar("Recibo " + r.numero + " corregido." + (r.entrega === "correo" ? " Ya se había mandado: si cambió algo importante, vuelve a mandarlo." : ""));
    await recargarTrasCorregir();
}

async function anularRecibo(r, anular) {
    if (anular) {
        const motivo = await Avisos.pedir("Sus pagos dejan de contar y el cobro vuelve a quedar pendiente. El recibo no se borra: queda anulado, con su número.", {
            titulo: "Anular el recibo " + r.numero, etiqueta: "¿Por qué se anula?", valor: "", aceptar: "Anular el recibo",
        });
        if (motivo === null) return;
        const { error } = await sb.rpc("anular_recibo", { p_recibo: r.id, p_anular: true, p_motivo: motivo.trim() || null });
        if (error) return avisar("No se pudo anular: " + error.message, true);
        avisar("Recibo " + r.numero + " anulado.");
    } else {
        const { error } = await sb.rpc("anular_recibo", { p_recibo: r.id, p_anular: false, p_motivo: null });
        if (error) return avisar("No se pudo reactivar: " + error.message, true);
        avisar("Recibo " + r.numero + " reactivado: sus pagos vuelven a contar.");
    }
    await recargarTrasCorregir();
}

// Corregir un recibo cambia lo pagado: las tarjetas, los cobros y los morosos.
async function recargarTrasCorregir() {
    document.getElementById("rc-previa").hidden = true;
    await Promise.all([cargarRecibos(true), contarRecibosSinEntregar()]);
    await cargarTodo();
}

/* Recién registrado un pago: quien entrega lo ve enseguida para revisarlo y
   mandarlo; quien coordina sabe que sale cuando lo revise su supervisión. */
async function trasRegistrarPago(recibo) {
    if (!recibo) return;
    if (!corrige) {
        avisar("Pago registrado. Recibo " + recibo.numero + ": lo revisa y lo entrega quien supervisa la academia.");
        return;
    }
    avisar("Pago registrado. Revisa el recibo " + recibo.numero + " y mándalo.");
    mostrarFicha("recibos");
    await Promise.all([cargarRecibos(true), contarRecibosSinEntregar()]);
    const r = recibos.find((x) => x.id === recibo.id);
    if (r) await verRecibo(r);
}

// ----------------------------------------------------------- pago adelantado
function llenarPagoAdelantado() {
    const sel = document.getElementById("pa-alumno");
    if (sel.options.length) return;
    sel.innerHTML = '<option value="">— Elige —</option>';
    alumnos.forEach((a) => {
        const o = el("option", null, a.full_name || a.email || "Sin nombre");
        o.value = a.id;
        sel.appendChild(o);
    });
    document.getElementById("pa-fecha").value = hoyCR();
    pintarQuePaga();
}

const PERIODO_DE = { mensual: "mes", trimestral: "trimestre", semestral: "semestre", anual: "año" };

let paAlumnoPintado = null;

function pintarQuePaga() {
    const alumno = document.getElementById("pa-alumno").value;
    const sel = document.getElementById("pa-que");
    // Lo elegido se conserva solo si sigue siendo el mismo alumno (al recargar
    // los planes): con otro, lo primero que se ofrece es SU plan, no la
    // «Otra cosa» que quedó elegida cuando no había nadie.
    const antes = alumno === paAlumnoPintado ? sel.value : "";
    paAlumnoPintado = alumno;
    sel.innerHTML = "";
    suscripciones.filter((s) => s.student_id === alumno).forEach((s) => {
        const p = planes.find((x) => x.id === s.plan_id);
        if (!p || !p.activo) return;
        const o = el("option", null, "Adelantar «" + p.nombre + "»");
        o.value = s.id;
        sel.appendChild(o);
    });
    const otro = el("option", null, "Otra cosa (sin cobro previo)");
    otro.value = "otro";
    sel.appendChild(otro);
    if ([...sel.options].some((o) => o.value === antes)) sel.value = antes;
    pintarAyudaAdelanto();
}

function pintarAyudaAdelanto() {
    const que = document.getElementById("pa-que").value;
    const esOtro = que === "otro" || !que;
    document.getElementById("pa-plan-cell").classList.toggle("hidden", esOtro);
    document.getElementById("pa-otro-cell").classList.toggle("hidden", !esOtro);
    const ayuda = document.getElementById("pa-plan-ayuda");
    if (esOtro) {
        ayuda.textContent = document.getElementById("pa-alumno").value
            ? "Se emite un cobro con ese concepto y queda pagado, con su recibo." : "";
        return;
    }
    const s = suscripciones.find((x) => x.id === que);
    const p = s && planes.find((x) => x.id === s.plan_id);
    if (!p) { ayuda.textContent = ""; return; }
    const cada = plata(p.monto * (1 - (Number(s.descuento_pct) || 0) / 100), p.moneda);
    ayuda.textContent = "Cada " + (PERIODO_DE[p.periodicidad] || "periodo") + " de este plan es de " + cada
        + ". Se pagan los periodos que siguen sin pagar, empezando por el más viejo (si debe algo, eso va primero).";
}

async function registrarPagoAdelantado() {
    const alumno = document.getElementById("pa-alumno").value;
    const que = document.getElementById("pa-que").value;
    const metodo = document.getElementById("pa-metodo").value;
    const referencia = document.getElementById("pa-referencia").value.trim() || null;
    const fechaPago = document.getElementById("pa-fecha").value || hoyCR();
    if (!alumno) return avisar("Elige el alumno.", true);
    if (fechaPago > hoyCR()) return avisar("La fecha del pago no puede ser en el futuro.", true);
    let res;
    if (que && que !== "otro") {
        const periodos = Number(document.getElementById("pa-periodos").value);
        if (!Number.isInteger(periodos) || periodos < 1 || periodos > 24) return avisar("Se pueden adelantar de 1 a 24 periodos.", true);
        res = await sb.rpc("pago_adelantado", { p_suscripcion: que, p_periodos: periodos, p_metodo: metodo,
            p_referencia: referencia, p_nota: null, p_fecha: fechaPago });
    } else {
        const concepto = document.getElementById("pa-concepto").value.trim();
        const monto = Number(document.getElementById("pa-monto").value);
        if (!concepto) return avisar("Escribe qué se paga.", true);
        if (!(monto > 0)) return avisar("El monto tiene que ser mayor que cero.", true);
        res = await sb.rpc("registrar_cobro_pagado", { p_alumno: alumno, p_concepto: concepto, p_monto: monto,
            p_moneda: document.getElementById("pa-moneda").value, p_metodo: metodo,
            p_referencia: referencia, p_nota: null, p_fecha: fechaPago });
    }
    if (res.error) return avisar("No se pudo registrar: " + res.error.message, true);
    document.getElementById("pa-referencia").value = "";
    document.getElementById("pa-concepto").value = "";
    document.getElementById("pa-monto").value = "";
    document.getElementById("pa-periodos").value = "1";
    await cargarTodo();
    await trasRegistrarPago(res.data);
}

// ------------------------------------------------------------ el prefijo
let academiasPrefijo = [];

async function cargarPrefijos() {
    const caja = document.getElementById("rc-prefijo-caja");
    if (!corrige) { caja.hidden = true; return; }
    // Quien administra, todas; quien supervisa, las suyas (la base decide
    // igual en academia_guardar_prefijo_recibo).
    let q = sb.from("academias").select("id, nombre, prefijo_recibo").order("nombre");
    if (!perfil.is_admin) q = q.eq("supervisor_id", session.user.id);
    const { data, error } = await q;
    academiasPrefijo = error ? [] : (data || []);
    caja.hidden = !academiasPrefijo.length;
    if (!academiasPrefijo.length) return;
    const sel = document.getElementById("rc-academia");
    sel.innerHTML = "";
    academiasPrefijo.forEach((a) => { const o = el("option", null, a.nombre); o.value = a.id; sel.appendChild(o); });
    await pintarPrefijo();
}

async function pintarPrefijo() {
    const id = document.getElementById("rc-academia").value;
    const { data } = await sb.rpc("prefijo_recibo", { p_academia: id });
    const actual = data || "";
    document.getElementById("rc-prefijo").value = actual;
    document.getElementById("rc-prefijo-ejemplo").textContent = actual
        ? "Así sale el próximo: R-" + actual + "-" + hoyCR().slice(0, 4) + "-0001 (el número sigue la cuenta de esa academia)." : "";
}

async function guardarPrefijo() {
    const id = document.getElementById("rc-academia").value;
    const prefijo = document.getElementById("rc-prefijo").value.trim().toUpperCase();
    if (prefijo && (!/^[A-Z0-9]{2,10}$/.test(prefijo) || prefijo === "AI")) {
        return avisar("El prefijo lleva de 2 a 10 letras o números, sin espacios ni tildes (y no puede ser AI).", true);
    }
    const { error } = await sb.rpc("academia_guardar_prefijo_recibo", { p_academia: id, p_prefijo: prefijo || null });
    if (error) return avisar("No se pudo guardar: " + error.message, true);
    avisar("Prefijo guardado. Los recibos que ya salieron conservan su número.");
    await pintarPrefijo();
}

// ------------------------------------------------------- «Tus recibos»
async function recibosDelAlumno() {
    const { data, error } = await sb.from("recibos_vista").select("*")
        .eq("student_id", session.user.id).order("fecha", { ascending: false }).limit(200);
    if (error || !data || !data.length) return;
    const caja = document.getElementById("alumno-recibos");
    data.forEach((r) => {
        const d = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-4 flex flex-wrap items-center justify-between gap-3");
        const izq = el("div", "min-w-0");
        const linea = el("p", "font-semibold text-brand-800 dark:text-white", r.numero + " · " + plata(r.total, r.moneda || "CRC"));
        if (r.estado === "anulado") linea.append(" (anulado)");
        izq.appendChild(linea);
        izq.appendChild(el("p", "text-xs text-brand-450 dark:text-brand-350", fecha(r.fecha) + " · "
            + (r.detalle || []).map((x) => x.concepto).join(" · ")));
        d.appendChild(izq);
        d.appendChild(boton("👁️ Ver recibo", BTN_RECIBO_SUAVE, () => verRecibo(r,
            { caja: "alumno-previa", titulo: "alumno-previa-titulo", botones: "alumno-previa-botones" })));
        caja.appendChild(d);
    });
    document.getElementById("alumno-recibos-caja").hidden = false;
}

// --------------------------------------------------------------- eventos
function engancharRecibos() {
    ["rc-estado", "rc-alumno"].forEach((id) => document.getElementById(id).addEventListener("change", () => cargarRecibos(true)));
    let espera = null;
    document.getElementById("rc-buscar").addEventListener("input", () => {
        clearTimeout(espera);
        espera = setTimeout(() => cargarRecibos(true), 300);
    });
    document.getElementById("rc-mas").addEventListener("click", () => cargarRecibos(false));
    document.getElementById("pa-alumno").addEventListener("change", pintarQuePaga);
    document.getElementById("pa-que").addEventListener("change", pintarAyudaAdelanto);
    // Un doble clic registraría dos pagos: mientras guarda, el botón no responde.
    document.getElementById("pa-guardar").addEventListener("click", async (ev) => {
        const b = ev.currentTarget;
        if (b.disabled) return;
        b.disabled = true;
        try { await registrarPagoAdelantado(); } finally { b.disabled = false; }
    });
    document.getElementById("rc-academia").addEventListener("change", pintarPrefijo);
    document.getElementById("rc-prefijo-guardar").addEventListener("click", guardarPrefijo);
}
