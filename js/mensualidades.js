/* El código de mensualidades.html: los cobros de la Academia, pensados para el
   celular.

   UNA idea: cada cuenta (un alumno o una familia) tiene una fecha de «activa
   hasta». Registrar un pago la corre y saca el recibo; si no paga, vence y,
   cuando quien administra lo encienda, se apaga sola. La regla de qué estado
   tiene cada cuenta NO está acá: la da la base (interno.cuenta_cobro_estado()
   por la vista cuentas_cobro_vista) y esta página solo la pinta. El mismo
   cálculo decide si el alumno entra (acceso_vigente()), así que lo que dice
   esta lista y lo que le pasa al alumno no pueden contradecirse.

   Las pantallas van por la dirección (#cuenta=…, #nueva, #reportes,
   #ajustes): en el celular, el botón «atrás» vuelve a la lista.

   Ver «Cobros, versión 2: una fecha de activo hasta» en
   docs/decisiones/cobros-acceso-y-tienda.md. */
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const H = window.HoraCR;

    let yo = null;              // { id, is_admin, es_coordinador, es_supervisor }
    let cuentas = [];           // filas de cuentas_cobro_vista
    let nombres = new Map();    // alumno → nombre
    let alumnosVisibles = null; // para el buscador de alumnos (se baja al abrir el formulario)
    let ajustes = null;
    let reportes = [];          // pagos_reportados pendientes
    let filtro = "todos";
    let editando = null;        // cuenta que se edita (null = nueva)
    let elegidos = [];          // alumnos del formulario

    const ESTADOS = {
        vencido: { orden: 0, clase: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-50" },
        vence_pronto: { orden: 1, clase: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-50" },
        apagado: { orden: 2, clase: "bg-brand-100 text-brand-800 border border-brand-300 dark:bg-brand-800 dark:text-brand-50 dark:border-brand-600" },
        al_dia: { orden: 3, clase: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-50" },
    };
    const FILTROS = [
        ["todos", "Todas"], ["vencido", "Vencidas"], ["vence_pronto", "Vencen pronto"],
        ["apagado", "Apagadas"], ["al_dia", "Al día"],
    ];
    const METODOS = [["sinpe", "SINPE"], ["efectivo", "Efectivo"], ["transferencia", "Transferencia"]];

    /* ------------------------------------------------------------ utilidades */
    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }
    function avisar(texto, error) { Avisos.avisar(texto, { tipo: error ? "error" : "ok" }); }
    function sinTildes(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
    // «₡24.000», con el punto de miles escrito a mano como en js/precios-acceso.js:
    // toLocaleString("es-CR") pone un espacio fino que cambia según el navegador.
    function dinero(n, moneda) {
        const v = String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, moneda === "USD" ? "," : ".");
        return moneda === "USD" ? "US$" + v : "₡" + v;
    }
    // «5 de diciembre»; con el año solo si no es el de ahora.
    function dia(iso, conAnio) {
        if (!iso) return "";
        const mismo = String(iso).slice(0, 4) === H.hoy().slice(0, 4);
        return H.fecha(iso, (conAnio || !mismo) ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "long" });
    }
    function diaCorto(iso) { return iso ? H.fecha(iso, { day: "numeric", month: "numeric", year: "numeric" }) : ""; }
    function numero(texto) {
        const n = Number(String(texto || "").replace(/[^\d.,]/g, "").replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
        return isFinite(n) ? n : NaN;
    }
    // Hasta: la víspera de «desde», n meses después (desde el 6/11, un mes: el 5/12).
    function hastaDe(desde, meses) {
        const base = H.sumarDias(desde, -1);
        const [y, m, d] = base.split("-").map(Number);
        const ultimo = new Date(Date.UTC(y, m - 1 + meses + 1, 0)).getUTCDate();
        return new Date(Date.UTC(y, m - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10);   // calendario en UTC
    }
    function errorDe(e) {
        const m = (e && (e.message || e.details)) || String(e || "");
        if (/JWT|session|sesi/i.test(m)) return "Tu sesión se cerró. Vuelve a iniciar sesión.";
        return m || "No se pudo. Intenta otra vez.";
    }
    async function traerTodo(armar) {
        const todo = [];
        for (let i = 0; ; i += 1000) {
            const { data, error } = await armar().range(i, i + 999);
            if (error) throw error;
            todo.push(...(data || []));
            if (!data || data.length < 1000) return todo;
        }
    }
    function nombresDe(c) {
        return (c.alumnos || []).map((id) => nombres.get(id) || "Alumno").join(", ");
    }
    function etiqueta(c) {
        const e = ESTADOS[c.estado] || ESTADOS.al_dia;
        let texto;
        if (c.estado === "al_dia") texto = "Al día";
        else if (c.estado === "vence_pronto") texto = c.dias === 0 ? "Vence hoy" : c.dias === 1 ? "Vence mañana" : "Vence en " + c.dias + " días";
        else if (c.estado === "vencido") texto = -c.dias === 1 ? "Vencida hace 1 día" : "Vencida hace " + (-c.dias) + " días";
        else texto = "Apagada";
        return el("span", "inline-block whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full " + e.clase, texto);
    }
    function lineaDe(c) {
        const d = c.estado === "vencido" || (c.estado === "apagado" && c.dias < 0)
            ? "venció el " + dia(c.activo_hasta)
            : "activa hasta el " + dia(c.activo_hasta);
        return dinero(c.monto, c.moneda) + " · " + d;
    }
    function sinpeTexto() {
        if (!ajustes || !ajustes.sinpe_numero) return "";
        const n = ajustes.sinpe_numero.replace(/(\d{4})(\d{4})/, "$1-$2");
        return " Puedes pagar por SINPE Móvil al " + n + (ajustes.sinpe_nombre ? " (a nombre de " + ajustes.sinpe_nombre + ")" : "") + ".";
    }

    /* ------------------------------------------------------------ carga */
    async function cargarCuentas() {
        cuentas = await traerTodo(() => sb.from("cuentas_cobro_vista")
            .select("id, nombre, monto, moneda, apagada, nota, activo_hasta_base, activo_hasta, pagado_hasta, ultimo_pago, estado, dias, apaga_el, alumnos, reportes_pendientes")
            .order("nombre"));
        const faltan = [...new Set(cuentas.flatMap((c) => c.alumnos || []))].filter((id) => !nombres.has(id));
        for (let i = 0; i < faltan.length; i += 200) {
            const { data } = await sb.from("profiles").select("id, full_name, email").in("id", faltan.slice(i, i + 200));
            (data || []).forEach((p) => nombres.set(p.id, p.full_name || p.email || "Alumno"));
        }
    }
    async function cargarReportes() {
        const { data, error } = await sb.from("pagos_reportados")
            .select("id, cuenta_id, alumno_id, monto, fecha, referencia, comprobante, nota, created_at")
            .eq("estado", "pendiente").order("created_at").range(0, 199);
        if (error) throw error;
        reportes = data || [];
    }
    async function cargarAjustes() {
        const { data } = await sb.from("cobros_ajustes").select("*").maybeSingle();
        ajustes = data || { avisos_auto: false, apagado_auto: false, dias_gracia: 5, dias_aviso_antes: 3 };
    }

    /* ------------------------------------------------------------ la lista */
    function pintarResumen(filas) {
        const caja = $("resumen");
        caja.replaceChildren();
        const r = (filas || [])[0] || { moneda: "CRC", entro_mes: 0, vencidas: 0, apagadas: 0, monto_vencidas: 0 };
        const mes = H.fecha(H.hoy(), { month: "long" });
        function dato(etq, valor, extra) {
            const d = el("div", "bg-white dark:bg-brand-900 rounded-xl shadow-sm px-3 py-3");
            d.append(el("p", "text-xs text-brand-500 dark:text-brand-300", etq), el("p", "text-xl font-bold", valor));
            if (extra) d.append(el("p", "text-xs text-brand-500 dark:text-brand-300", extra));
            caja.append(d);
        }
        dato("Entró en " + mes, dinero(r.entro_mes, r.moneda));
        const n = (r.vencidas || 0) + (r.apagadas || 0);
        dato("Sin pagar", n === 1 ? "1 cuenta" : n + " cuentas", n ? dinero(r.monto_vencidas, r.moneda) + " al mes" : "Todo al día");
    }

    function pintarFiltros() {
        const caja = $("filtros");
        caja.replaceChildren();
        FILTROS.forEach(([k, texto]) => {
            const n = k === "todos" ? cuentas.length : cuentas.filter((c) => c.estado === k).length;
            const b = el("button", "min-h-[40px] px-3 py-1.5 rounded-full text-sm font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 "
                + (filtro === k ? "bg-brand-800 text-white border-brand-800 dark:bg-accent-500 dark:text-brand-900 dark:border-accent-500"
                                : "bg-white text-brand-800 border-brand-200 dark:bg-brand-900 dark:text-brand-100 dark:border-brand-700"),
                texto + (k === "todos" ? "" : " " + n));
            b.type = "button";
            b.setAttribute("aria-pressed", String(filtro === k));
            b.addEventListener("click", () => { filtro = k; pintarFiltros(); pintarLista(); });
            caja.append(b);
        });
    }

    function pintarLista() {
        const q = sinTildes($("buscar").value.trim());
        const filas = cuentas
            .filter((c) => filtro === "todos" || c.estado === filtro)
            .filter((c) => !q || sinTildes(c.nombre + " " + nombresDe(c)).includes(q))
            .sort((a, b) => (ESTADOS[a.estado].orden - ESTADOS[b.estado].orden)
                || (a.estado === "vencido" ? a.dias - b.dias : 0)
                || a.nombre.localeCompare(b.nombre, "es"));
        const ul = $("cuentas");
        ul.replaceChildren();
        filas.forEach((c) => {
            const li = el("li");
            const a = el("a", "flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500");
            a.href = "#cuenta=" + c.id;
            const txt = el("span", "flex-1 min-w-0");
            const nombre = el("span", "block font-semibold truncate", c.nombre);
            const sub = el("span", "block text-sm text-brand-500 dark:text-brand-300", lineaDe(c));
            txt.append(nombre, sub);
            if ((c.alumnos || []).length > 1) sub.textContent = (c.alumnos.length) + " alumnos · " + lineaDe(c);
            a.append(txt);
            if (c.reportes_pendientes) {
                const ic = el("span", "text-base");
                const vis = el("span", "", "🧾");
                vis.setAttribute("aria-hidden", "true");
                ic.append(vis, el("span", "sr-only", "Mandó un comprobante por confirmar."));
                ic.title = "Mandó un comprobante por confirmar";
                a.append(ic);
            }
            a.append(etiqueta(c));
            li.append(a);
            ul.append(li);
        });
        $("cuentas").hidden = !filas.length;
        const vacia = $("lista-vacia");
        vacia.hidden = !!filas.length;
        vacia.textContent = !cuentas.length
            ? "Todavía no hay ninguna cuenta. Agrega la primera con el botón de abajo."
            : "No hay cuentas que coincidan.";
        $("lista-cuenta").textContent = filas.length === cuentas.length
            ? (cuentas.length === 1 ? "1 cuenta" : cuentas.length + " cuentas")
            : "Mostrando " + filas.length + " de " + cuentas.length;
        const n = reportes.length;
        $("aviso-reportes").hidden = !n;
        $("aviso-reportes-texto").textContent = n === 1 ? "1 pago por confirmar" : n + " pagos por confirmar";
    }

    async function refrescarLista() {
        await Promise.all([cargarCuentas(), cargarReportes()]);
        const { data } = await sb.rpc("cuentas_cobro_resumen");
        pintarResumen(data);
        pintarFiltros();
        pintarLista();
    }

    /* ------------------------------------------------------------ una cuenta */
    function boton(texto, clase, accion) {
        const b = el("button", clase, texto);
        b.type = "button";
        b.addEventListener("click", accion);
        return b;
    }
    const BTN_GRANDE = "w-full min-h-[48px] rounded-xl bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:opacity-60";
    const BTN_SUAVE = "min-h-[44px] px-3 rounded-xl text-sm font-semibold bg-brand-100 dark:bg-brand-800 hover:bg-brand-200 dark:hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500";
    const CAMPO = "w-full px-3 py-3 rounded-lg bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500";

    function grupoChips(etq, opciones, elegido, alCambiar) {
        const caja = el("div", "flex flex-wrap gap-2");
        caja.setAttribute("role", "group");
        caja.setAttribute("aria-label", etq);
        const botones = opciones.map(([v, texto]) => {
            const b = el("button", "", texto);
            b.type = "button";
            b.dataset.valor = v;
            b.addEventListener("click", () => { marcar(v); alCambiar(v); });
            caja.append(b);
            return b;
        });
        function marcar(v) {
            botones.forEach((b) => {
                const si = b.dataset.valor === String(v);
                b.setAttribute("aria-pressed", String(si));
                b.className = "min-h-[44px] min-w-[44px] px-3 rounded-full text-sm font-semibold border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 "
                    + (si ? "bg-brand-800 text-white border-brand-800 dark:bg-accent-500 dark:text-brand-900 dark:border-accent-500"
                          : "bg-white text-brand-800 border-brand-200 dark:bg-brand-900 dark:text-brand-100 dark:border-brand-700");
            });
        }
        marcar(elegido);
        caja.marcar = marcar;
        return caja;
    }

    function campo(etq, input, ayuda) {
        const d = el("div");
        const id = input.id || ("c-" + Math.random().toString(36).slice(2, 8));
        input.id = id;
        const l = el("label", "block text-sm font-semibold mb-1", etq);
        l.htmlFor = id;
        d.append(l, input);
        if (ayuda) d.append(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-1", ayuda));
        return d;
    }

    async function verCuenta(id, reporteId) {
        const sec = $("v-cuenta");
        let c = cuentas.find((x) => x.id === id);
        if (!c) { await cargarCuentas(); c = cuentas.find((x) => x.id === id); }
        if (!c) { sec.replaceChildren(el("p", "text-sm", "Esa cuenta ya no existe o no es de tu coordinación.")); return; }
        const reporte = reporteId ? reportes.find((r) => r.id === reporteId && r.cuenta_id === id)
                                  : reportes.find((r) => r.cuenta_id === id);
        sec.replaceChildren();

        const volver = el("a", "inline-flex items-center gap-1 text-sm font-semibold text-accent-700 dark:text-accent-400 mb-3 underline underline-offset-2", "← Volver a la lista");
        volver.href = "#";
        const cab = el("div", "flex items-start justify-between gap-3 mb-1");
        const h1 = el("h1", "font-serif text-2xl font-bold text-brand-800 dark:text-white", c.nombre);
        h1.id = "t-cuenta";
        h1.tabIndex = -1;
        cab.append(h1, etiqueta(c));
        const info = el("div", "text-sm text-brand-600 dark:text-brand-200 mb-4 space-y-0.5");
        info.append(el("p", "", "Mensualidad " + dinero(c.monto, c.moneda) + " · vence el día " + Number(String(c.activo_hasta).slice(8)) + " de cada mes"));
        info.append(el("p", "", "Activa hasta el " + dia(c.activo_hasta, true)));
        if ((c.alumnos || []).length > 1 || nombresDe(c) !== c.nombre) info.append(el("p", "", "Alumnos: " + nombresDe(c)));
        if (c.apagada) info.append(el("p", "font-semibold", "Apagada a mano: el alumno no puede entrar hasta que la enciendas o pague."));
        else if (c.apaga_el && c.estado !== "apagado") info.append(el("p", "", "Si no paga, se apaga sola el " + dia(c.apaga_el) + "."));
        if (c.nota) info.append(el("p", "italic", c.nota));
        sec.append(volver, cab, info);

        // El comprobante que mandó el alumno: se confirma con este mismo formulario.
        let reporteUsado = null;
        if (reporte) {
            const caja = el("div", "mb-4 rounded-xl bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-amber-50 p-3 text-sm");
            caja.append(el("p", "font-semibold", "Reportó un pago de " + dinero(reporte.monto, c.moneda) + " el " + dia(reporte.fecha)));
            if (reporte.referencia) caja.append(el("p", "", "Comprobante: " + reporte.referencia));
            if (reporte.nota) caja.append(el("p", "", "Nota: " + reporte.nota));
            const fila = el("div", "flex flex-wrap gap-2 mt-2");
            if (reporte.comprobante) fila.append(boton("Ver la foto", BTN_SUAVE, () => abrirComprobante(reporte.comprobante)));
            fila.append(boton("No es válido", BTN_SUAVE, () => rechazar(reporte)));
            caja.append(fila);
            caja.append(el("p", "text-xs mt-2", "Si el pago entró, registra el pago abajo: queda confirmado y el alumno se activa."));
            sec.append(caja);
            reporteUsado = reporte;
        }

        // ---- Registrar el pago
        const form = el("form", "bg-white dark:bg-brand-900 rounded-2xl shadow-sm p-4 space-y-4");
        form.noValidate = true;
        form.append(el("h2", "font-semibold text-lg", "Registrar pago"));
        const desde = el("input", CAMPO); desde.type = "date";
        desde.value = H.sumarDias(c.activo_hasta, 1);
        const hasta = el("input", CAMPO); hasta.type = "date";
        const monto = el("input", CAMPO); monto.inputMode = "numeric"; monto.autocomplete = "off";
        let meses = 1, montoTocado = false, metodo = "sinpe";
        const ponerHasta = () => { hasta.value = hastaDe(desde.value, meses); };
        const ponerMonto = () => { if (!montoTocado) monto.value = String(Math.round(c.monto * meses)); };
        ponerHasta(); ponerMonto();
        if (reporteUsado) { monto.value = String(Math.round(reporteUsado.monto)); montoTocado = true; }
        const chipsMeses = grupoChips("Cuántos meses paga", [["1", "1 mes"], ["2", "2"], ["3", "3"], ["6", "6"]], "1", (v) => {
            meses = Number(v); montoTocado = false; ponerHasta(); ponerMonto(); previa();
        });
        const refe = el("input", CAMPO); refe.maxLength = 120; refe.autocomplete = "off";
        if (reporteUsado && reporteUsado.referencia) refe.value = reporteUsado.referencia;
        const fecha = el("input", CAMPO); fecha.type = "date"; fecha.max = H.hoy();
        fecha.value = reporteUsado ? reporteUsado.fecha : H.hoy();
        const chipsMetodo = grupoChips("Cómo pagó", METODOS, "sinpe", (v) => { metodo = v; });

        const filaFechas = el("div", "grid grid-cols-2 gap-3");
        filaFechas.append(campo("Cuenta desde", desde), campo("Hasta (incluido)", hasta));
        const pMeses = el("div"); pMeses.append(el("p", "text-sm font-semibold mb-1", "Cuántos meses paga"), chipsMeses);
        const pMetodo = el("div"); pMetodo.append(el("p", "text-sm font-semibold mb-1", "Cómo pagó"), chipsMetodo);
        const ver = el("p", "text-sm bg-brand-50 dark:bg-brand-950 rounded-lg px-3 py-2");
        ver.setAttribute("aria-live", "polite");
        const error = el("p", "text-sm text-red-700 dark:text-red-300");
        error.setAttribute("role", "alert");
        const registrar = el("button", BTN_GRANDE, "Registrar pago");
        registrar.type = "submit";
        function previa() {
            error.textContent = "";
            if (!desde.value || !hasta.value || hasta.value < desde.value) { ver.textContent = "Revisa las fechas: «hasta» va después de «desde»."; return; }
            ver.textContent = "Queda activa hasta el " + dia(hasta.value, true) + ". Sale el recibo en el momento.";
        }
        desde.addEventListener("change", () => { ponerHasta(); previa(); });
        hasta.addEventListener("change", () => { chipsMeses.marcar(""); previa(); });
        monto.addEventListener("input", () => { montoTocado = true; });
        previa();
        form.append(pMeses, filaFechas, campo("Monto", monto), pMetodo,
            campo("Número de comprobante (opcional)", refe), campo("Fecha del pago", fecha), ver, error, registrar);
        form.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            const m = numero(monto.value);
            if (!(m > 0)) { error.textContent = "Escribe el monto que pagó."; monto.focus(); return; }
            if (!desde.value || !hasta.value || hasta.value < desde.value) { error.textContent = "Revisa las fechas: «hasta» va después de «desde»."; desde.focus(); return; }
            if (!fecha.value || fecha.value > H.hoy()) { error.textContent = "La fecha del pago no puede ser en el futuro."; fecha.focus(); return; }
            registrar.disabled = true;
            registrar.textContent = "Registrando…";
            const { data, error: e } = await sb.rpc("cuenta_cobro_pagar", {
                p_cuenta: c.id, p_desde: desde.value, p_hasta: hasta.value, p_monto: m, p_metodo: metodo,
                p_referencia: refe.value.trim() || null, p_nota: null, p_fecha: fecha.value,
                p_reporte: reporteUsado ? reporteUsado.id : null,
            });
            registrar.disabled = false;
            registrar.textContent = "Registrar pago";
            if (e) { error.textContent = errorDe(e); return; }
            await refrescarLista();
            listo(c.id, data, m, desde.value, hasta.value);
        });
        sec.append(form);

        // ---- Lo demás
        const acciones = el("div", "grid grid-cols-2 gap-2 mt-4");
        const wa = el("a", BTN_SUAVE + " flex items-center justify-center gap-1");
        const texto = c.estado === "vencido" || c.estado === "apagado"
            ? "Hola, te recordamos que la mensualidad de " + c.nombre + " (" + dinero(c.monto, c.moneda) + ") venció el " + dia(c.activo_hasta) + "." + sinpeTexto() + " ¡Gracias!"
            : "Hola, te recordamos que la mensualidad de " + c.nombre + " (" + dinero(c.monto, c.moneda) + ") vence el " + dia(c.activo_hasta) + "." + sinpeTexto() + " ¡Gracias!";
        wa.href = "https://wa.me/?text=" + encodeURIComponent(texto);
        wa.target = "_blank"; wa.rel = "noopener";
        wa.append(el("span", "", "💬"), document.createTextNode(" Recordar por WhatsApp"));
        wa.firstChild.setAttribute("aria-hidden", "true");
        acciones.append(wa);
        acciones.append(boton(c.apagada ? "Encender" : "Apagar ahora", BTN_SUAVE, () => apagar(c)));
        const editar = el("a", BTN_SUAVE + " col-span-2 flex items-center justify-center", "Editar la cuenta (monto, alumnos, fecha)");
        editar.href = "#editar=" + c.id;
        acciones.append(editar);
        sec.append(acciones);

        const hist = el("div", "mt-6");
        hist.append(el("h2", "font-semibold mb-2", "Pagos"));
        const lista = el("ul", "bg-white dark:bg-brand-900 rounded-2xl shadow-sm divide-y divide-brand-100 dark:divide-brand-800 text-sm");
        hist.append(lista);
        sec.append(hist);
        historial(c, lista);
    }

    async function historial(c, ul) {
        const { data, error } = await sb.from("cobros")
            .select("id, concepto, monto, moneda, estado, periodo_fin, pagos(monto, fecha, metodo, recibos(numero, estado))")
            .eq("cuenta_id", c.id).order("periodo_fin", { ascending: false }).range(0, 23);
        ul.replaceChildren();
        if (error) { ul.append(el("li", "px-4 py-3", "No se pudieron leer los pagos.")); return; }
        if (!data || !data.length) {
            ul.append(el("li", "px-4 py-3 text-brand-500 dark:text-brand-300",
                c.ultimo_pago || c.pagado_hasta ? "Los pagos de antes están en Recibos y cobros anteriores." : "Todavía no hay pagos registrados aquí."));
            return;
        }
        data.forEach((k) => {
            const li = el("li", "px-4 py-3");
            const p = (k.pagos || [])[0];
            const rec = p && p.recibos;
            const anulado = k.estado === "anulado" || (rec && rec.estado === "anulado");
            li.append(el("p", "font-semibold" + (anulado ? " line-through" : ""), k.concepto.replace(/^Mensualidad · /, "")));
            li.append(el("p", "text-brand-500 dark:text-brand-300",
                dinero(k.monto, k.moneda) + (p ? " · " + (METODOS.find((x) => x[0] === p.metodo) || [0, p.metodo])[1] + " · " + diaCorto(p.fecha) : "")
                + (rec ? " · " + rec.numero : "") + (anulado ? " · ANULADO" : "")));
            ul.append(li);
        });
    }

    function listo(cuentaId, recibo, monto, desde, hasta) {
        const c = cuentas.find((x) => x.id === cuentaId);
        const sec = $("v-cuenta");
        sec.replaceChildren();
        const caja = el("div", "bg-white dark:bg-brand-900 rounded-2xl shadow-sm p-6 text-center");
        caja.append(el("p", "text-4xl mb-2", "✅"));
        caja.firstChild.setAttribute("aria-hidden", "true");
        const h1 = el("h1", "font-serif text-2xl font-bold mb-2", "Pago registrado");
        h1.id = "t-cuenta"; h1.tabIndex = -1;
        caja.append(h1);
        caja.append(el("p", "", (c ? c.nombre : "La cuenta") + " queda activa hasta el " + dia(recibo.activo_hasta || hasta, true) + "."));
        caja.append(el("p", "text-sm text-brand-500 dark:text-brand-300 mt-1", "Recibo " + recibo.numero + " · " + dinero(monto, c && c.moneda)));
        const texto = "Recibo " + recibo.numero + " de Ajedrez Integral: recibimos " + dinero(monto, c && c.moneda)
            + " por la mensualidad de " + (c ? c.nombre : "") + " del " + dia(desde) + " al " + dia(hasta, true) + ". ¡Gracias!";
        const wa = el("a", BTN_GRANDE + " mt-5 flex items-center justify-center gap-2");
        wa.href = "https://wa.me/?text=" + encodeURIComponent(texto);
        wa.target = "_blank"; wa.rel = "noopener";
        wa.append(el("span", "", "💬"), document.createTextNode(" Mandar el recibo por WhatsApp"));
        wa.firstChild.setAttribute("aria-hidden", "true");
        wa.addEventListener("click", () => { sb.rpc("recibo_por_whatsapp", { p_recibo: recibo.id }).then(() => {}, () => {}); });
        const volver = el("a", BTN_SUAVE + " mt-3 flex items-center justify-center", "Volver a la lista");
        volver.href = "#";
        caja.append(wa, volver);
        sec.append(caja);
        h1.focus();
    }

    async function apagar(c) {
        const apagarla = !c.apagada;
        const si = await Avisos.confirmar(apagarla
            ? "El alumno no va a poder entrar a la Academia hasta que pague o la enciendas. Al entrar le sale el aviso con lo que tiene que pagar."
            : "La cuenta vuelve a funcionar ya. Ojo: encenderla no registra ningún pago.", {
            titulo: (apagarla ? "¿Apagar " : "¿Encender ") + c.nombre + "?",
            aceptar: apagarla ? "Apagar" : "Encender", peligro: apagarla,
        });
        if (!si) return;
        const { error } = await sb.rpc("cuenta_cobro_apagar", { p_id: c.id, p_apagar: apagarla });
        if (error) { avisar(errorDe(error), true); return; }
        avisar(apagarla ? c.nombre + " quedó apagada." : c.nombre + " quedó encendida.");
        await refrescarLista();
        verCuenta(c.id);
    }

    async function abrirComprobante(ruta) {
        const { data, error } = await sb.storage.from("comprobantes-pago").createSignedUrl(ruta, 600);
        if (error || !data) { avisar("No se pudo abrir el comprobante.", true); return; }
        window.open(data.signedUrl, "_blank", "noopener");
    }

    async function rechazar(r) {
        const motivo = await Avisos.pedir("Dile al alumno por qué no se confirma (lo va a leer en su aviso).", {
            titulo: "Este pago no es válido", etiqueta: "Motivo", aceptar: "No confirmar",
            valor: "No encontramos ese SINPE. Revisa el número o escríbenos.",
        });
        if (motivo == null) return;
        const { error } = await sb.rpc("pago_reporte_rechazar", { p_id: r.id, p_motivo: motivo });
        if (error) { avisar(errorDe(error), true); return; }
        avisar("Listo: el alumno va a ver que no se confirmó.");
        await refrescarLista();
        mostrar();
    }

    /* ------------------------------------------------------------ los comprobantes */
    async function verReportes() {
        await cargarReportes();
        const ul = $("reportes");
        ul.replaceChildren();
        if (!reportes.length) {
            ul.append(el("li", "bg-white dark:bg-brand-900 rounded-2xl p-6 text-center text-sm text-brand-500 dark:text-brand-300", "No hay pagos por confirmar."));
            return;
        }
        for (const r of reportes) {
            const c = cuentas.find((x) => x.id === r.cuenta_id);
            const li = el("li", "bg-white dark:bg-brand-900 rounded-2xl shadow-sm p-4");
            li.append(el("p", "font-semibold", c ? c.nombre : "Cuenta"));
            li.append(el("p", "text-sm", dinero(r.monto, c && c.moneda) + " · pagó el " + dia(r.fecha)
                + (r.referencia ? " · comprobante " + r.referencia : "")));
            if (r.nota) li.append(el("p", "text-sm italic", r.nota));
            li.append(el("p", "text-xs text-brand-500 dark:text-brand-300", "Lo mandó " + (nombres.get(r.alumno_id) || "el alumno") + " el " + H.fechaHora(r.created_at, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })));
            const fila = el("div", "grid grid-cols-2 gap-2 mt-3");
            if (r.comprobante) fila.append(boton("Ver la foto", BTN_SUAVE, () => abrirComprobante(r.comprobante)));
            const conf = el("a", BTN_GRANDE + " col-span-2 flex items-center justify-center", "Confirmar y registrar el pago");
            conf.href = "#cuenta=" + r.cuenta_id + "&reporte=" + r.id;
            fila.append(boton("No es válido", BTN_SUAVE, () => rechazar(r)), conf);
            li.append(fila);
            ul.append(li);
        }
    }

    /* ------------------------------------------------------------ agregar / editar */
    async function asegurarAlumnos() {
        if (alumnosVisibles) return;
        const filas = await traerTodo(() => sb.from("profiles").select("id, full_name, email").eq("role", "alumno").order("full_name"));
        alumnosVisibles = filas;
        filas.forEach((p) => nombres.set(p.id, p.full_name || p.email || "Alumno"));
    }
    function pintarElegidos() {
        const caja = $("e-elegidos");
        caja.replaceChildren();
        elegidos.forEach((id) => {
            const b = el("button", "inline-flex items-center gap-1 min-h-[40px] px-3 rounded-full text-sm font-semibold bg-brand-100 dark:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500");
            b.type = "button";
            b.append(document.createTextNode(nombres.get(id) || "Alumno"), el("span", "", " ✕"));
            b.lastChild.setAttribute("aria-hidden", "true");
            b.setAttribute("aria-label", "Quitar a " + (nombres.get(id) || "este alumno"));
            b.addEventListener("click", () => { elegidos = elegidos.filter((x) => x !== id); pintarElegidos(); });
            caja.append(b);
        });
    }
    function sugerir() {
        const q = sinTildes($("e-buscar").value.trim());
        const ul = $("e-sugeridos");
        ul.replaceChildren();
        if (q.length < 2 || !alumnosVisibles) { ul.hidden = true; return; }
        const enOtra = new Map();
        cuentas.forEach((c) => (c.alumnos || []).forEach((a) => { if (!editando || c.id !== editando.id) enOtra.set(a, c.nombre); }));
        const filas = alumnosVisibles.filter((p) => !elegidos.includes(p.id) && sinTildes(p.full_name + " " + p.email).includes(q)).slice(0, 8);
        filas.forEach((p) => {
            const li = el("li");
            const b = el("button", "w-full text-left px-3 py-3 min-h-[44px] hover:bg-brand-50 dark:hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500");
            b.type = "button";
            b.append(el("span", "block font-semibold", p.full_name || p.email));
            if (enOtra.has(p.id)) b.append(el("span", "block text-xs text-brand-500 dark:text-brand-300", "Ya está en «" + enOtra.get(p.id) + "»"));
            b.addEventListener("click", () => {
                elegidos.push(p.id);
                if (!$("e-nombre").value.trim()) $("e-nombre").value = p.full_name || "";
                $("e-buscar").value = "";
                ul.hidden = true;
                pintarElegidos();
                $("e-buscar").focus();
            });
            li.append(b);
            ul.append(li);
        });
        if (!filas.length) ul.append(el("li", "px-3 py-3 text-sm text-brand-500 dark:text-brand-300", "Ningún alumno con ese nombre."));
        ul.hidden = false;
    }
    async function verEditar(id) {
        await asegurarAlumnos();
        editando = id ? cuentas.find((c) => c.id === id) || null : null;
        elegidos = editando ? [...(editando.alumnos || [])] : [];
        $("t-editar").textContent = editando ? "Editar «" + editando.nombre + "»" : "Agregar alumno o familia";
        $("e-nombre").value = editando ? editando.nombre : "";
        $("e-monto").value = editando ? String(Math.round(editando.monto)) : "";
        $("e-moneda").value = editando ? editando.moneda : "CRC";
        $("e-hasta").value = editando ? editando.activo_hasta : H.hoy();
        $("e-nota").value = editando ? (editando.nota || "") : "";
        $("e-error").textContent = "";
        $("e-borrar").hidden = !editando;
        $("e-buscar").value = "";
        $("e-sugeridos").hidden = true;
        pintarElegidos();
    }
    async function guardarCuenta(ev) {
        ev.preventDefault();
        const err = $("e-error");
        err.textContent = "";
        const monto = numero($("e-monto").value);
        if (!elegidos.length) { err.textContent = "Elige al menos un alumno."; $("e-buscar").focus(); return; }
        if (!$("e-nombre").value.trim()) { err.textContent = "Escribe el nombre de la cuenta."; $("e-nombre").focus(); return; }
        if (!(monto > 0)) { err.textContent = "Escribe la mensualidad."; $("e-monto").focus(); return; }
        if (!$("e-hasta").value) { err.textContent = "Di hasta qué día está activa."; $("e-hasta").focus(); return; }
        const b = $("e-guardar");
        b.disabled = true;
        const { data, error } = await sb.rpc("cuenta_cobro_guardar", {
            p_id: editando ? editando.id : null, p_nombre: $("e-nombre").value.trim(), p_monto: monto,
            p_moneda: $("e-moneda").value, p_activo_hasta: $("e-hasta").value,
            p_nota: $("e-nota").value.trim() || null, p_alumnos: elegidos,
        });
        b.disabled = false;
        if (error) { err.textContent = errorDe(error); return; }
        avisar(editando ? "Cuenta guardada." : "Cuenta agregada.");
        await refrescarLista();
        location.hash = "#cuenta=" + data;
    }
    async function borrarCuenta() {
        if (!editando) return;
        const si = await Avisos.confirmar("Sus alumnos dejan de pasar por cobros (vuelve a decidir su paquete, si tienen). Los recibos que ya salieron se quedan.", {
            titulo: "¿Borrar la cuenta «" + editando.nombre + "»?", aceptar: "Borrar la cuenta", peligro: true,
        });
        if (!si) return;
        const { error } = await sb.rpc("cuenta_cobro_borrar", { p_id: editando.id });
        if (error) { avisar(errorDe(error), true); return; }
        avisar("Cuenta borrada.");
        await refrescarLista();
        location.hash = "";
    }

    /* ------------------------------------------------------------ ajustes */
    function interruptor(btn, si) {
        btn.setAttribute("aria-checked", String(!!si));
    }
    function textoAjustes() {
        const g = Math.max(1, Number($("a-gracia").value) || 5);
        const antes = Math.max(0, Number($("a-antes").value) || 0);
        $("a-avisos-d").textContent = "Un correo a la familia " + (antes ? antes + (antes === 1 ? " día" : " días") + " antes de vencer, " : "")
            + "el día que vence y el día antes de apagarse. Cada uno sale una sola vez.";
        $("a-apagado-d").textContent = "Pasados " + g + (g === 1 ? " día" : " días") + " sin pagar, la cuenta se apaga y el alumno ve el aviso para pagar. Al registrar el pago se enciende sola.";
        $("a-ejemplo").textContent = "Ejemplo: si vence el 5 y no paga, se apaga el " + (5 + g) + ".";
    }
    function verAjustes() {
        $("a-gracia").value = ajustes.dias_gracia;
        $("a-antes").value = ajustes.dias_aviso_antes;
        $("a-sinpe").value = ajustes.sinpe_numero || "";
        $("a-nombre").value = ajustes.sinpe_nombre || "";
        interruptor($("a-avisos"), ajustes.avisos_auto);
        interruptor($("a-apagado"), ajustes.apagado_auto);
        $("a-error").textContent = "";
        textoAjustes();
    }
    async function guardarAjustes(ev) {
        ev.preventDefault();
        const err = $("a-error");
        err.textContent = "";
        const gracia = Number($("a-gracia").value), antes = Number($("a-antes").value);
        const sinpe = $("a-sinpe").value.replace(/\D/g, "");
        if (!(gracia >= 1 && gracia <= 60)) { err.textContent = "Los días de gracia van de 1 a 60."; $("a-gracia").focus(); return; }
        if (!(antes >= 0 && antes <= 15)) { err.textContent = "Los días de aviso van de 0 a 15."; $("a-antes").focus(); return; }
        if (sinpe && sinpe.length !== 8) { err.textContent = "El número de SINPE Móvil lleva 8 dígitos."; $("a-sinpe").focus(); return; }
        const avisos = $("a-avisos").getAttribute("aria-checked") === "true";
        const apagado = $("a-apagado").getAttribute("aria-checked") === "true";
        if (apagado && !ajustes.apagado_auto) {
            const hoy = H.hoy();
            const caen = cuentas.filter((c) => !c.apagada && c.activo_hasta && H.sumarDias(c.activo_hasta, gracia) <= hoy);
            const si = await Avisos.confirmar(caen.length
                ? "Al guardar, " + (caen.length === 1 ? "1 cuenta queda apagada" : caen.length + " cuentas quedan apagadas") + " ahora mismo, porque ya pasaron los días de gracia: "
                  + caen.slice(0, 8).map((c) => c.nombre).join(", ") + (caen.length > 8 ? " y " + (caen.length - 8) + " más" : "") + "."
                : "Ahora mismo ninguna cuenta queda apagada. Desde hoy, la que pase los días de gracia sin pagar se apaga sola.", {
                titulo: "¿Encender el apagado automático?",
                aceptar: caen.length ? "Encender y apagar " + caen.length : "Encender", peligro: caen.length > 0,
            });
            if (!si) return;
        }
        if (avisos && !ajustes.avisos_auto && !sinpe) {
            const si = await Avisos.confirmar("Los correos van a salir sin el número de SINPE. ¿Seguir igual?", { titulo: "Falta el SINPE Móvil", aceptar: "Encender igual" });
            if (!si) return;
        }
        const { error } = await sb.rpc("cobros_ajustes_guardar", {
            p_avisos_auto: avisos, p_apagado_auto: apagado, p_dias_gracia: gracia, p_dias_aviso_antes: antes,
            p_sinpe_numero: sinpe || null, p_sinpe_nombre: $("a-nombre").value.trim() || null,
        });
        if (error) { err.textContent = errorDe(error); return; }
        await cargarAjustes();
        avisar("Ajustes guardados.");
        await refrescarLista();
        location.hash = "";
    }

    /* ------------------------------------------------------------ las pantallas */
    const VISTAS = ["v-lista", "v-cuenta", "v-editar", "v-reportes", "v-ajustes"];
    function parametros() {
        const h = location.hash.replace(/^#/, "");
        const p = {};
        h.split("&").forEach((par) => { const [k, v] = par.split("="); if (k) p[k] = v == null ? true : decodeURIComponent(v); });
        return p;
    }
    async function mostrar() {
        const p = parametros();
        let vista = "v-lista";
        if (p.cuenta) vista = "v-cuenta";
        else if (p.nueva || p.editar) vista = "v-editar";
        else if (p.reportes) vista = "v-reportes";
        else if (p.ajustes && yo.is_admin) vista = "v-ajustes";
        try {
            if (vista === "v-cuenta") await verCuenta(p.cuenta, p.reporte);
            if (vista === "v-editar") await verEditar(p.editar || null);
            if (vista === "v-reportes") await verReportes();
            if (vista === "v-ajustes") verAjustes();
        } catch (e) { avisar(errorDe(e), true); }
        VISTAS.forEach((v) => { $(v).hidden = v !== vista; });
        window.scrollTo(0, 0);
        const h = $(vista).querySelector("h1");
        if (h && document.activeElement !== h && arrancado) h.focus();
        arrancado = true;
    }
    let arrancado = false;

    async function arrancar() {
        const { data: ses } = await sb.auth.getSession();
        if (!ses || !ses.session) { location.replace("login.html?next=mensualidades.html"); return; }
        const { data: p } = await sb.from("profiles").select("id, is_admin, es_coordinador, es_supervisor")
            .eq("id", ses.session.user.id).maybeSingle();
        yo = p;
        $("loading").hidden = true;
        $("loading").classList.add("hidden");
        if (!p || !(p.is_admin || p.es_coordinador || p.es_supervisor)) { $("no-es-tuyo").hidden = false; return; }
        $("ir-ajustes").hidden = !p.is_admin;
        await cargarAjustes();
        await refrescarLista();
        $("app").hidden = false;

        $("buscar").addEventListener("input", pintarLista);
        $("e-buscar").addEventListener("input", sugerir);
        $("f-cuenta").addEventListener("submit", guardarCuenta);
        $("e-borrar").addEventListener("click", borrarCuenta);
        $("f-ajustes").addEventListener("submit", guardarAjustes);
        ["a-avisos", "a-apagado"].forEach((id) => $(id).addEventListener("click", () => {
            interruptor($(id), $(id).getAttribute("aria-checked") !== "true");
        }));
        ["a-gracia", "a-antes"].forEach((id) => $(id).addEventListener("input", textoAjustes));
        document.querySelectorAll("#app a.volver").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); history.length > 1 ? history.back() : (location.hash = ""); }));
        window.addEventListener("hashchange", mostrar);
        mostrar();
    }

    function inicio() {
        arrancar().catch((e) => {
            $("loading").hidden = true;
            $("loading").classList.add("hidden");
            avisar("No se pudieron cargar los cobros: " + errorDe(e), true);
        });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicio);
    else inicio();
})();

/*! rev bfb5bbb0d2d82f9f */
