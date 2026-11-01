/* El código de centroamericano-mesas.html: la página de la ORGANIZACIÓN (la cuenta
   principal) del Centroamericano 2026 para sus árbitros. Pensada para una tablet o una
   computadora que se queda abierta durante la ronda.

   Cuatro pestañas:
   1. Ayuda y avisos: los pedidos de ayuda de los árbitros (con sonido y contador, y
      «Atendido») y los avisos que la organización les manda, con quién ya los leyó.
   2. Árbitros y mesas: un enlace con su QR por árbitro (o «por definir», sin nombre, y
      el reparto de las mesas entre varios de una vez), agrupados por torneo y
      ordenados por mesa; cambiar el nombre y las mesas, avisarle, apagar.
   3. Clave de chess-results: UNA sola para todo el grupo de torneos ligados (código del
      grupo + SID). Va a la Edge Function centroamericano-clave, que la prueba y la
      guarda CIFRADA en la bóveda: esta página nunca la vuelve a ver y la casilla se vacía.
   4. Lo que anotan: resultados enviados, ilegales e irregularidades, y el PDF.

   Quien entra tiene que tener la licencia «mesa-arbitro» (administración también): lo
   hace cumplir la base (RLS), no esta página.
   Ver «Mesas de los árbitros del Centroamericano» y «Avisos y árbitros por definir» en
   docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const C = window.CentroamericanoMesas;
    const M = window.MesaArbitro;
    const $ = (id) => document.getElementById(id);
    const avisar = (texto, error) => Avisos.avisar(texto, { tipo: error ? "error" : "ok" });
    const TIC_MS = 6000; // cada cuánto se miran los pedidos de ayuda
    const TITULO = document.title;
    const FRASES = ["Ya empieza la ronda: a sus mesas.", "Pasen por el escritorio principal, por favor.", "Pausa de 10 minutos.", "Revisen que cada mesa tenga su resultado guardado."];

    let torneos = [];
    let asignaciones = [];
    let avisos = [];
    let registro = [];
    let pedidosVistos = null; // null: todavía no se leyó nada (la primera lectura no suena)
    let audio = null;
    let sonido = false;
    let tic = 0;
    let firmaAvisos = "";
    let firmaAsignaciones = "";

    function el(tag, attrs, ...hijos) {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "texto") n.textContent = v;
            else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
            else n.setAttribute(k, v === true ? "" : v);
        }
        for (const h of hijos.flat()) if (h != null) n.append(h.nodeType ? h : document.createTextNode(String(h)));
        return n;
    }

    // La función contesta con un error legible aun en 4xx/5xx: se lee el cuerpo.
    async function invocar(cuerpo) {
        let { data, error } = await sb.functions.invoke("centroamericano-clave", { body: cuerpo });
        if (error && error.context && typeof error.context.json === "function") {
            try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (!data || data.error) throw new Error((data && data.error) || (error && error.message) || "No hubo respuesta. Revisa tu conexión.");
        return data;
    }

    const nombreTorneo = (tnr) => (torneos.find((t) => t.tnr === tnr) || { nombre: tnr }).nombre;
    const asig = (id) => asignaciones.find((a) => a.id === id);
    const nombreAsig = (id) => (asig(id) || { arbitro: "Un árbitro" }).arbitro;
    const activa = (a) => C.estadoAsignacion(a, new Date()) === "activo";

    // ------------------------------------------------------------- pestañas

    const PANELES = ["avisos", "arbitros", "claves", "registro"];
    function abrirPanel(nombre, enfocar) {
        if (!PANELES.includes(nombre)) nombre = "avisos";
        for (const p of PANELES) {
            const sel = p === nombre;
            const b = $("pest-" + p);
            b.setAttribute("aria-selected", sel ? "true" : "false");
            b.tabIndex = sel ? 0 : -1;
            $("panel-" + p).hidden = !sel;
        }
        if (enfocar) $("pest-" + nombre).focus();
        try { history.replaceState(null, "", "#" + nombre); } catch (e) { /* sin historial */ }
    }
    function teclaPestana(ev) {
        const i = PANELES.indexOf(ev.currentTarget.dataset.panel);
        const salto = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
        let j = salto ? (i + salto + PANELES.length) % PANELES.length : ev.key === "Home" ? 0 : ev.key === "End" ? PANELES.length - 1 : null;
        if (j == null) return;
        ev.preventDefault();
        abrirPanel(PANELES[j], true);
    }

    // ------------------------------------------------------------- estado general y sonido

    function pedidosAbiertos() {
        return avisos.filter((f) => f.de === "arbitro" && f.estado === "abierto").sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
    }

    function pintarEstadoGeneral() {
        const n = pedidosAbiertos().length;
        const act = asignaciones.filter(activa);
        const en = act.filter((a) => C.enLinea(a, new Date())).length;
        const con = torneos.filter((t) => t.sid_en_boveda).length;
        $("eg-pedidos").replaceChildren(el("strong", { texto: n ? n + (n === 1 ? " pedido de ayuda abierto" : " pedidos de ayuda abiertos") : "Sin pedidos de ayuda" }));
        $("eg-enlinea").textContent = act.length ? en + " de " + act.length + " árbitros conectados" : "Sin enlaces activos";
        $("eg-claves").textContent = torneos.length ? (con === torneos.length ? "Clave cargada en los " + torneos.length + " torneos" : "Clave en " + con + " de " + torneos.length + " torneos") : "";
        const c = $("contador-pedidos");
        c.hidden = n === 0;
        c.textContent = String(n);
        document.title = (n ? "(" + n + ") " : "") + TITULO;
    }

    function pitar() {
        if (!sonido || !audio) return;
        try {
            const t0 = audio.currentTime;
            [660, 880, 660].forEach((f, i) => {
                const o = audio.createOscillator(), g = audio.createGain();
                o.type = "sine";
                o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t0 + i * 0.2);
                g.gain.exponentialRampToValueAtTime(0.3, t0 + i * 0.2 + 0.03);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.2 + 0.18);
                o.connect(g).connect(audio.destination);
                o.start(t0 + i * 0.2);
                o.stop(t0 + i * 0.2 + 0.2);
            });
        } catch (e) { /* sin audio */ }
    }

    function alternarSonido() {
        // El navegador solo deja sonar después de un toque: por eso es un botón.
        if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; } }
        if (!audio) { avisar("Este navegador no puede reproducir el sonido.", true); return; }
        sonido = !sonido;
        if (audio.state === "suspended") audio.resume();
        const b = $("sonido");
        b.setAttribute("aria-pressed", sonido ? "true" : "false");
        b.replaceChildren(el("span", { "aria-hidden": "true", texto: sonido ? "🔔" : "🔕" }), document.createTextNode(sonido ? " Sonido activado" : " Activar el sonido de los pedidos"));
        if (sonido) pitar();
    }

    // ------------------------------------------------------------- 1. ayuda y avisos

    async function cargarAvisos() {
        const { data, error } = await sb.from("centroamericano_avisos").select("*").order("creado", { ascending: false }).range(0, 499);
        if (error) { if (pedidosVistos === null) avisar("No se pudieron leer los avisos: " + error.message, true); return; }
        avisos = data || [];
        const ids = new Set(pedidosAbiertos().map((f) => f.id));
        if (pedidosVistos !== null && [...ids].some((id) => !pedidosVistos.has(id))) pitar();
        pedidosVistos = ids;
        pintarAvisos();
        marcarPedidos();
        pintarEstadoGeneral();
    }

    function tarjetaPedido(f, atendido) {
        const a = asig(f.asignacion_id);
        return el("article", { class: "cam-pedido", "data-estado": atendido ? "atendido" : "abierto", "data-id": f.id },
            el("div", { class: "flex flex-wrap items-start justify-between gap-2" },
                el("div", {},
                    el("p", { class: "font-bold text-lg", texto: (atendido ? "✓ " : "🆘 ") + (f.mesa ? "Mesa " + f.mesa : "Ayuda general") + " — " + (a ? a.arbitro : "Un árbitro") }),
                    el("p", { class: "text-sm", texto: (a ? nombreTorneo(a.tnr) + " · " : "") + (atendido && f.atendido_en ? "atendido a las " + window.HoraCR.hora(new Date(f.atendido_en)) : C.hace(f.creado, new Date()) + " (" + window.HoraCR.hora(new Date(f.creado)) + ")"), "data-creado": atendido ? null : f.creado, "data-antes": atendido ? null : (a ? nombreTorneo(a.tnr) + " · " : "") })),
                atendido ? null : el("div", { class: "cam-acciones cam-acciones-sin-margen" },
                    el("button", { type: "button", class: "cam-btn", "data-accion": "atender", onclick: () => atender(f) }, "Atendido"),
                    a ? el("button", { type: "button", class: "cam-btn cam-btn-claro", "data-accion": "escribir", onclick: () => escribirA(a.id) }, "Escribirle") : null)),
            f.texto ? el("p", { class: "mt-2 font-bold", texto: "«" + f.texto + "»" }) : null);
    }

    // Lo que cambia con el tiempo y no hace falta repintar: «hace 3 min» se corrige en el lugar.
    function refrescarHace() {
        document.querySelectorAll("[data-creado]").forEach((p) => { p.textContent = p.dataset.antes + C.hace(p.dataset.creado, new Date()) + " (" + window.HoraCR.hora(new Date(p.dataset.creado)) + ")"; });
    }

    function pintarAvisos() {
        const abiertos = pedidosAbiertos();
        // Se llega acá cada pocos segundos: si nada cambió, no se vuelven a dibujar los botones
        // (un toque no debe caer en un botón que se acaba de reemplazar).
        const firma = JSON.stringify([abiertos.map((f) => f.id), avisos.filter((f) => f.estado === "atendido").map((f) => f.id), avisos.filter((f) => f.de === "organizacion").map((f) => [f.id, !!f.leido_en]), asignaciones.map((a) => [a.id, a.arbitro])]);
        if (firma === firmaAvisos) { refrescarHace(); return; }
        firmaAvisos = firma;
        $("pedidos").replaceChildren(...abiertos.map((f) => tarjetaPedido(f, false)));
        $("sin-pedidos").hidden = abiertos.length > 0;
        const hechos = avisos.filter((f) => f.de === "arbitro" && f.estado === "atendido").slice(0, 20);
        $("atendidos-caja").hidden = hechos.length === 0;
        $("atendidos-n").textContent = String(hechos.length);
        $("atendidos").replaceChildren(...hechos.map((f) => tarjetaPedido(f, true)));
        const envios = C.enviosAgrupados(avisos, nombreAsig).slice(0, 40);
        $("enviados").replaceChildren(...envios.map((e) => el("tr", { "data-total": String(e.total), "data-leidos": String(e.leidos) },
            el("td", { texto: window.HoraCR.fechaHora(e.creado) }),
            el("td", { texto: e.texto }),
            el("td", { texto: e.leidos + " de " + e.total + (e.sinLeer.length ? " · falta: " + e.sinLeer.slice(0, 6).join(", ") + (e.sinLeer.length > 6 ? "…" : "") : " ✓") }))));
        $("enviados-vacio").hidden = envios.length > 0;
    }

    async function atender(f) {
        const { error } = await sb.from("centroamericano_avisos").update({ estado: "atendido" }).eq("id", f.id);
        if (error) { avisar("No se pudo marcar: " + error.message, true); return; }
        await cargarAvisos();
    }

    function escribirA(id) {
        abrirPanel("avisos");
        $("av-para").value = "a:" + id;
        $("form-aviso").scrollIntoView({ block: "center" });
        $("av-texto").focus();
    }

    function pintarDestinos() {
        const antes = $("av-para").value;
        const act = asignaciones.filter(activa).sort((a, b) => nombreTorneo(a.tnr).localeCompare(nombreTorneo(b.tnr)) || a.mesa_desde - b.mesa_desde);
        const tnrs = [...new Set(act.map((a) => a.tnr))];
        const op = [el("option", { value: "todos", texto: "Todos los árbitros (" + act.length + ")" })];
        for (const t of tnrs) op.push(el("option", { value: "t:" + t, texto: "Todo el torneo: " + nombreTorneo(t) + " (" + act.filter((a) => a.tnr === t).length + ")" }));
        for (const a of act) op.push(el("option", { value: "a:" + a.id, texto: a.arbitro + " — " + nombreTorneo(a.tnr) + ", mesas " + a.mesa_desde + " a " + a.mesa_hasta }));
        // Si la lista es la misma no se toca: con el desplegable abierto, cambiarla lo cerraría.
        if ([...$("av-para").options].map((o) => o.value + o.textContent).join("|") === op.map((o) => o.value + o.textContent).join("|")) return;
        $("av-para").replaceChildren(...op);
        if ([...$("av-para").options].some((o) => o.value === antes)) $("av-para").value = antes;
    }

    async function enviarAviso(ev) {
        ev.preventDefault();
        const texto = $("av-texto").value.trim();
        if (!texto) { avisar("Escribe el mensaje.", true); return; }
        const para = $("av-para").value;
        const act = asignaciones.filter(activa);
        const destinos = para === "todos" ? act : para.startsWith("t:") ? act.filter((a) => a.tnr === para.slice(2)) : act.filter((a) => a.id === para.slice(2));
        if (!destinos.length) { avisar("No hay ningún árbitro con enlace activo para ese aviso.", true); return; }
        $("av-enviar").disabled = true;
        const { error } = await sb.from("centroamericano_avisos").insert(destinos.map((a) => ({ de: "organizacion", asignacion_id: a.id, texto })));
        $("av-enviar").disabled = false;
        if (error) { avisar("No se pudo enviar: " + error.message, true); return; }
        $("av-texto").value = "";
        avisar("Aviso enviado a " + destinos.length + (destinos.length === 1 ? " árbitro." : " árbitros."));
        await cargarAvisos();
    }

    // ------------------------------------------------------------- 3. la clave del grupo

    async function cargarTorneos() {
        const { data, error } = await sb.from("centroamericano_torneos").select("tnr, nombre, categoria, rama, orden, sid_en_boveda, clave_puesta, acceso_tnr").order("orden");
        if (error) { avisar("No se pudieron leer los torneos: " + error.message, true); return; }
        torneos = data || [];
        pintarTorneos();
        const opciones = () => torneos.map((t) => el("option", { value: t.tnr, texto: t.nombre + (t.sid_en_boveda ? "" : " (sin clave)") }));
        for (const id of ["a-torneo", "rp-torneo", "r-torneo"]) {
            const s = $(id), antes = s.value;
            s.replaceChildren(...(id === "r-torneo" ? [el("option", { value: "", texto: "Todos los torneos" })] : []), ...opciones());
            if (antes) s.value = antes;
        }
        // El código del grupo no es secreto: se propone el que ya se usó.
        if (!$("g-codigo").value) {
            const usados = torneos.map((t) => t.acceso_tnr).filter(Boolean);
            if (usados.length) $("g-codigo").value = usados.sort((a, b) => usados.filter((x) => x === b).length - usados.filter((x) => x === a).length)[0];
        }
        pintarEstadoGeneral();
    }

    function pintarTorneos() {
        const con = torneos.filter((t) => t.sid_en_boveda).length;
        $("resumen-claves").textContent = !torneos.length ? "" : con === torneos.length
            ? "✓ Los " + torneos.length + " torneos tienen la clave cargada."
            : con + " de " + torneos.length + " torneos tienen la clave. Faltan: " + torneos.filter((t) => !t.sid_en_boveda).map((t) => t.nombre).join(", ") + ".";
        const previo = {};
        document.querySelectorAll("#torneos [role='status']").forEach((p) => { previo[p.id] = [p.textContent, p.className]; });
        $("torneos").replaceChildren(...torneos.map((t) => {
            const estado = el("p", { class: "text-sm mt-1", id: "est-" + t.tnr, role: "status" });
            if (previo["est-" + t.tnr]) { estado.textContent = previo["est-" + t.tnr][0]; estado.className = previo["est-" + t.tnr][1]; }
            return el("div", { class: "cam-estado-torneo", "data-tnr": t.tnr, "data-clave": t.sid_en_boveda ? "si" : "no" },
                el("p", { class: "font-bold", texto: t.nombre }),
                el("p", { class: "mt-1" }, el("span", { class: "cam-chip", "data-clave": t.sid_en_boveda ? "si" : "no", texto: t.sid_en_boveda ? "Con clave" : "Sin clave" })),
                t.sid_en_boveda && t.acceso_tnr && t.acceso_tnr !== t.tnr ? el("p", { class: "text-sm mt-1", texto: "Entra por el grupo " + t.acceso_tnr }) : null,
                el("div", { class: "cam-acciones" }, el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "probar", disabled: !t.sid_en_boveda, onclick: () => probar(t, estado) }, "Probar")),
                estado);
        }));
    }

    // Lo que dice una clave guardada: a cuántos torneos del Centroamericano abre.
    function resumenPuesta(d) {
        const n = (d.torneos || []).length;
        const cuales = (d.torneos || []).map((x) => x.nombre).join(", ");
        const ronda = d.mesas ? " Ronda " + d.ronda + " con " + d.mesas + " mesas en el primero." : " La ronda " + d.ronda + " todavía no tiene mesas.";
        return n > 1 ? "Guardada: esta clave abre " + n + " torneos ligados (" + cuales + ")." + ronda : "Guardada." + ronda;
    }

    async function guardarGrupo() {
        const tnr = $("g-codigo").value.trim(), sid = $("g-sid").value.trim();
        const estado = $("g-estado");
        const mal = (t) => { estado.textContent = "✗ " + t; estado.className = "cam-fallo text-sm mt-2"; };
        if (!/^\d{1,7}$/.test(tnr)) { mal("El código del grupo son hasta 7 números."); return; }
        if (!/^[A-Za-z0-9]{8,32}$/.test(sid)) { mal("La clave son entre 8 y 32 letras y números."); return; }
        estado.textContent = "Probando la clave en chess-results…";
        estado.className = "text-sm mt-2";
        $("g-guardar").disabled = true;
        try {
            const d = await invocar({ action: "poner", tnr, sid });
            $("g-sid").value = "";
            await cargarTorneos();
            estado.textContent = "✓ " + resumenPuesta(d) + (d.otros && d.otros.length ? " También abre otros torneos que no son del Centroamericano (" + d.otros.join(", ") + "): no se usan." : "");
            estado.className = "cam-guardado text-sm mt-2";
            const faltan = torneos.filter((t) => !t.sid_en_boveda);
            if (faltan.length) estado.textContent += " Todavía sin clave: " + faltan.map((t) => t.nombre).join(", ") + ".";
        } catch (e) {
            mal(e.message);
        } finally {
            $("g-guardar").disabled = false;
        }
    }

    async function probar(t, estado) {
        estado.textContent = "Probando…";
        estado.className = "text-sm mt-1";
        try {
            const d = await invocar({ action: "probar", tnr: t.tnr });
            estado.textContent = "✓ Sirve. " + (d.mesas ? "Ronda " + d.ronda + ", " + d.mesas + " mesas." : "Ronda " + d.ronda + " sin mesas todavía.");
            estado.className = "cam-guardado text-sm mt-1";
        } catch (e) {
            estado.textContent = "✗ " + e.message;
            estado.className = "cam-fallo text-sm mt-1";
        }
    }

    async function guardarBloque() {
        // El código puede ser el de un GRUPO de torneos ligados: no tiene que ser uno de los 12.
        const { buenas, malas } = C.leerClaves($("claves-bloque").value);
        const ul = $("claves-bloque-resultado");
        ul.replaceChildren(...malas.map((m) => el("li", { class: "cam-fallo", texto: "Línea " + m.linea + ": " + m.motivo })));
        if (!buenas.length) { if (!malas.length) avisar("Pega al menos una línea con el código y la clave.", true); return; }
        $("claves-bloque-guardar").disabled = true;
        const guardadas = new Set();
        for (const b of buenas) {
            const li = el("li", { texto: "Código " + b.tnr + ": probando…" });
            ul.append(li);
            try {
                const d = await invocar({ action: "poner", tnr: b.tnr, sid: b.sid });
                li.textContent = "✓ Código " + b.tnr + ": " + resumenPuesta(d);
                li.className = "cam-guardado";
                guardadas.add(b.tnr);
            } catch (e) {
                li.textContent = "✗ Código " + b.tnr + ": " + e.message;
                li.className = "cam-fallo";
            }
        }
        // Una clave guardada no se queda escrita en la página: se quitan las líneas que ya
        // quedaron en la bóveda y solo sobran las que hay que corregir o repetir.
        $("claves-bloque").value = $("claves-bloque").value.split(/\r?\n/).filter((l) => !guardadas.has(l.trim().split(/[\s,;:]+/)[0])).join("\n");
        $("claves-bloque-guardar").disabled = false;
        await cargarTorneos();
    }

    // ------------------------------------------------------------- 2. árbitros y mesas

    async function cargarAsignaciones() {
        const { data, error } = await sb.from("centroamericano_asignaciones").select("*").range(0, 499);
        if (error) { avisar("No se pudieron leer los enlaces: " + error.message, true); return; }
        asignaciones = data || [];
        pintarAsignaciones();
        pintarDestinos();
        pintarEstadoGeneral();
        pintarAvisos();
        marcarPedidos();
    }

    function textoEstado(a) {
        const e = C.estadoAsignacion(a, new Date());
        if (e === "apagado") return "Apagado";
        if (e === "vencido") return "Venció";
        return "Activo hasta el " + window.HoraCR.fechaHora(a.vence);
    }

    async function copiar(texto) {
        try { await navigator.clipboard.writeText(texto); avisar("Enlace copiado."); }
        catch (e) { await Avisos.pedir("Copia el enlace:", { titulo: "Enlace del árbitro", valor: texto, aceptar: "Listo", soloLectura: true }); }
    }

    const textoPedidos = (n) => "🆘 Tiene " + n + (n === 1 ? " pedido de ayuda abierto" : " pedidos de ayuda abiertos");
    // Los pedidos de cada árbitro se ponen al día en su tarjeta, sin repintarla.
    function marcarPedidos() {
        const abiertos = pedidosAbiertos();
        document.querySelectorAll("[data-pedidos]").forEach((p) => {
            const n = abiertos.filter((f) => f.asignacion_id === p.dataset.pedidos).length;
            p.hidden = n === 0;
            p.textContent = textoPedidos(n);
        });
    }

    function tarjetaAsignacion(a) {
        const enlace = C.enlaceArbitro(location.origin, a.token);
        const est = C.estadoAsignacion(a, new Date());
        const torneo = nombreTorneo(a.tnr);
        const qr = window.QrSvg ? window.QrSvg.dibujar(enlace, "QR del enlace de " + a.arbitro) : null;
        const wa = "https://wa.me/?text=" + encodeURIComponent(C.textoWhatsapp(a, torneo, enlace));
        const linea = C.enLinea(a, new Date());
        const pedidos = pedidosAbiertos().filter((f) => f.asignacion_id === a.id).length;
        return el("article", { class: "cam-asignacion", "data-estado": est, "data-id": a.id, "data-nombrado": a.nombrado === false ? "no" : "si" },
            el("div", {},
                el("p", { class: "font-bold text-lg" }, a.arbitro, a.nombrado === false ? el("span", { class: "cam-chip cam-chip-al-lado", "data-clave": "neutro", texto: "Por definir" }) : null),
                el("p", { texto: torneo + " · mesas " + a.mesa_desde + " a " + a.mesa_hasta }),
                el("p", { class: "text-sm", texto: textoEstado(a) }),
                el("p", { class: "cam-conectado", "data-en-linea": linea ? "si" : "no", texto: linea ? "● Conectado ahora" : a.ultimo_uso ? "Visto por última vez: " + window.HoraCR.fechaHora(a.ultimo_uso) : "Todavía no ha abierto el enlace" }),
                el("p", { class: "font-bold cam-fallo", "data-pedidos": a.id, hidden: pedidos === 0, texto: textoPedidos(pedidos) }),
                el("div", { class: "cam-acciones cam-no-qr" },
                    el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "copiar", onclick: () => copiar(enlace) }, "Copiar el enlace"),
                    el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: wa, target: "_blank", rel: "noopener", "data-accion": "whatsapp" }, "Mandar por WhatsApp"),
                    el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: enlace, target: "_blank", rel: "noopener", "data-accion": "abrir" }, "Abrir"),
                    el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "nombre", onclick: () => cambiarNombre(a) }, a.nombrado === false ? "Ponerle nombre" : "Cambiar el nombre"),
                    el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "mesas", onclick: () => cambiarMesas(a) }, "Cambiar las mesas"),
                    est === "activo" ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "avisarle", onclick: () => escribirA(a.id) }, "Mandarle un aviso") : null,
                    el("button", { type: "button", class: "cam-btn cam-btn-chico " + (a.revocada ? "cam-btn-claro" : "cam-btn-rojo"), "data-accion": a.revocada ? "reactivar" : "apagar", onclick: () => cambiar(a, !a.revocada) }, a.revocada ? "Volver a encender" : "Apagar el enlace"))),
            qr ? el("div", { class: "cam-qr" }, qr) : null);
    }

    function pintarAsignaciones() {
        $("sin-asignaciones").hidden = asignaciones.length > 0;
        const ahora = new Date();
        const firma = JSON.stringify([torneos.map((t) => t.nombre), asignaciones.map((a) => [a.id, a.arbitro, a.nombrado, a.mesa_desde, a.mesa_hasta, a.revocada, a.vence, C.enLinea(a, ahora), C.enLinea(a, ahora) ? null : a.ultimo_uso])]);
        if (firma === firmaAsignaciones) return;
        firmaAsignaciones = firma;
        const grupos = new Map();
        for (const t of torneos) grupos.set(t.tnr, []);
        for (const a of asignaciones) { if (!grupos.has(a.tnr)) grupos.set(a.tnr, []); grupos.get(a.tnr).push(a); }
        const secciones = [];
        for (const [tnr, lista] of grupos) {
            if (!lista.length) continue;
            lista.sort((x, y) => x.mesa_desde - y.mesa_desde || x.mesa_hasta - y.mesa_hasta || String(x.creada).localeCompare(String(y.creada)));
            secciones.push(el("section", { class: "cam-grupo-torneo", "data-tnr": tnr },
                el("h3", {}, nombreTorneo(tnr), el("span", { class: "text-sm font-normal", texto: lista.length + (lista.length === 1 ? " enlace" : " enlaces") })),
                el("div", { class: "cam-asignaciones-lista" }, ...lista.map(tarjetaAsignacion))));
        }
        $("asignaciones").replaceChildren(...secciones);
    }

    async function cambiar(a, apagar) {
        if (apagar) {
            const sigue = await Avisos.confirmar("El enlace de " + a.arbitro + " deja de funcionar al instante. Lo puedes volver a encender.", { titulo: "Apagar un enlace", aceptar: "Sí, apagarlo", peligro: true });
            if (!sigue) return;
        }
        const { error } = await sb.from("centroamericano_asignaciones").update({ revocada: apagar }).eq("id", a.id);
        if (error) { avisar("No se pudo cambiar: " + error.message, true); return; }
        await cargarAsignaciones();
    }

    async function cambiarNombre(a) {
        const v = await Avisos.pedir("Nombre y apellido del árbitro:", { titulo: "Nombre del árbitro", valor: a.nombrado === false ? "" : a.arbitro, aceptar: "Guardar el nombre" });
        if (v == null) return;
        const nombre = String(v).trim().slice(0, 80);
        if (!nombre) { avisar("El nombre no puede quedar vacío.", true); return; }
        const { error } = await sb.from("centroamericano_asignaciones").update({ arbitro: nombre, nombrado: true }).eq("id", a.id);
        if (error) { avisar("No se pudo cambiar el nombre: " + error.message, true); return; }
        await cargarAsignaciones();
    }

    function traslapan(tnr, desde, hasta, salvoId) {
        return asignaciones.filter((x) => x.tnr === tnr && x.id !== salvoId && activa(x) && x.mesa_desde <= hasta && x.mesa_hasta >= desde);
    }

    async function cambiarMesas(a) {
        const v = await Avisos.pedir("Mesas de " + a.arbitro + ", de una a otra (por ejemplo 1-15):", { titulo: "Cambiar las mesas", valor: a.mesa_desde + "-" + a.mesa_hasta, aceptar: "Guardar las mesas" });
        if (v == null) return;
        const r = C.leerRango(v);
        if (!r) { avisar("No entendí las mesas. Escríbelas así: 1-15 (o una sola, como 7).", true); return; }
        const otros = traslapan(a.tnr, r.desde, r.hasta, a.id);
        if (otros.length) {
            const sigue = await Avisos.confirmar("Esas mesas ya las tiene " + otros.map((x) => x.arbitro + " (" + x.mesa_desde + " a " + x.mesa_hasta + ")").join(", ") + ". ¿Cambiarlas igual?", { titulo: "Revisa esto", aceptar: "Sí, cambiarlas" });
            if (!sigue) return;
        }
        const { error } = await sb.from("centroamericano_asignaciones").update({ mesa_desde: r.desde, mesa_hasta: r.hasta }).eq("id", a.id);
        if (error) { avisar("No se pudieron cambiar las mesas: " + error.message, true); return; }
        avisar("Mesas de " + a.arbitro + ": " + r.desde + " a " + r.hasta + ".");
        await cargarAsignaciones();
    }

    function entero(id) { const v = parseInt($(id).value, 10); return Number.isFinite(v) ? v : null; }

    async function crear(ev) {
        ev.preventDefault();
        const escrito = $("a-arbitro").value.trim();
        const tnr = $("a-torneo").value;
        const desde = entero("a-desde"), hasta = entero("a-hasta");
        if (!tnr) { avisar("Elige el torneo.", true); return; }
        if (!desde || !hasta || desde < 1 || hasta < desde) { avisar("Las mesas van de una mesa a otra igual o mayor (por ejemplo 1 a 15).", true); return; }
        const t = torneos.find((x) => x.tnr === tnr);
        const traslapa = traslapan(tnr, desde, hasta);
        const avisos2 = [];
        if (t && !t.sid_en_boveda) avisos2.push("«" + t.nombre + "» todavía no tiene la clave cargada: el enlace no va a funcionar hasta que la pongas.");
        if (traslapa.length) avisos2.push("Esas mesas ya las tiene " + traslapa.map((a) => a.arbitro + " (" + a.mesa_desde + " a " + a.mesa_hasta + ")").join(", ") + ".");
        if (avisos2.length) {
            const sigue = await Avisos.confirmar(avisos2.join(" ") + " ¿Crear el enlace igual?", { titulo: "Revisa esto", aceptar: "Sí, crearlo" });
            if (!sigue) return;
        }
        const nombrado = !!escrito;
        const arbitro = nombrado ? escrito : C.nombrePorDefinir(asignaciones.filter((a) => a.tnr === tnr));
        const vence = C.vencimiento($("a-vence").value, new Date(), window.HoraCR.hoy());
        $("a-crear").disabled = true;
        const { error } = await sb.from("centroamericano_asignaciones").insert({ tnr, arbitro, nombrado, mesa_desde: desde, mesa_hasta: hasta, vence: vence.toISOString() });
        $("a-crear").disabled = false;
        if (error) { avisar("No se pudo crear el enlace: " + error.message, true); return; }
        $("a-arbitro").value = "";
        $("a-desde").value = "";
        $("a-hasta").value = "";
        avisar("Enlace creado para " + arbitro + (nombrado ? "." : " (por definir)."));
        await cargarAsignaciones();
    }

    // El reparto entre árbitros por definir.
    function vistaReparto() {
        const rangos = C.repartirMesas(entero("rp-mesas") || 0, entero("rp-arbitros") || 0);
        const tnr = $("rp-torneo").value;
        let sig = parseInt(C.nombrePorDefinir(asignaciones.filter((a) => a.tnr === tnr)).replace(/\D+/g, ""), 10);
        $("rp-vista").textContent = rangos.length ? rangos.map((r, i) => "Árbitro " + (sig + i) + ": mesas " + r.desde + " a " + r.hasta).join(" · ") : "";
        $("rp-crear").disabled = rangos.length === 0;
        return rangos;
    }

    async function leerMesas() {
        const tnr = $("rp-torneo").value;
        const estado = $("rp-estado");
        estado.textContent = "Leyendo chess-results…";
        $("rp-leer").disabled = true;
        try {
            const d = await invocar({ action: "probar", tnr });
            if (d.mesas) { $("rp-mesas").value = String(d.mesas); estado.textContent = "La ronda " + d.ronda + " tiene " + d.mesas + " mesas."; }
            else estado.textContent = "La ronda " + d.ronda + " todavía no tiene mesas: escribe cuántas habrá.";
            vistaReparto();
        } catch (e) {
            estado.textContent = "✗ " + e.message;
        } finally {
            $("rp-leer").disabled = false;
        }
    }

    async function repartir() {
        const rangos = vistaReparto();
        const tnr = $("rp-torneo").value;
        if (!rangos.length) { avisar("Escribe cuántas mesas y cuántos árbitros.", true); return; }
        const t = torneos.find((x) => x.tnr === tnr);
        const previos = asignaciones.filter((a) => a.tnr === tnr && activa(a));
        const avisos2 = [];
        if (t && !t.sid_en_boveda) avisos2.push("«" + t.nombre + "» todavía no tiene la clave cargada: los enlaces no van a funcionar hasta que la pongas.");
        if (previos.length) avisos2.push("Este torneo ya tiene " + previos.length + (previos.length === 1 ? " enlace activo" : " enlaces activos") + "; los nuevos se suman a ellos.");
        const sigue = await Avisos.confirmar(avisos2.concat(["Se crean " + rangos.length + " enlaces. ¿Seguir?"]).join(" "), { titulo: "Crear los enlaces", aceptar: "Sí, crearlos" });
        if (!sigue) return;
        const vence = C.vencimiento($("a-vence").value, new Date(), window.HoraCR.hoy()).toISOString();
        let n = parseInt(C.nombrePorDefinir(asignaciones.filter((a) => a.tnr === tnr)).replace(/\D+/g, ""), 10);
        $("rp-crear").disabled = true;
        const { error } = await sb.from("centroamericano_asignaciones").insert(rangos.map((r, i) => ({ tnr, arbitro: "Árbitro " + (n + i), nombrado: false, mesa_desde: r.desde, mesa_hasta: r.hasta, vence })));
        if (error) { $("rp-crear").disabled = false; avisar("No se pudieron crear los enlaces: " + error.message, true); return; }
        avisar("Se crearon " + rangos.length + " enlaces por definir.");
        $("rp-mesas").value = "";
        $("rp-arbitros").value = "";
        $("rp-vista").textContent = "";
        await cargarAsignaciones();
    }

    // ------------------------------------------------------------- 4. lo que anotan

    const NOMBRE_TIPO = { resultado: "Resultado", correccion: "Corrección", ilegal: "Ilegal", irregularidad: "Irregularidad", incidencia: "Incidencia", nota: "Nota", anulacion: "Anulación" };

    function detalle(f) {
        const r = (x) => { const o = M.RESULTADOS.find((y) => y.bitacora === x); return o ? o.texto : x; };
        if (f.tipo === "resultado") return r(f.resultado) + " — " + f.jugador + (f.enviado ? " · enviado a chess-results" : "");
        if (f.tipo === "correccion") return "De «" + r(f.anterior) + "» a «" + r(f.resultado) + "» — " + f.jugador + (f.enviado ? " · enviado a chess-results" : "");
        if (f.tipo === "ilegal" || f.tipo === "irregularidad") return f.jugador + " (" + (f.color === "negras" ? "negras" : "blancas") + ")" + (f.texto ? ": " + f.texto : "");
        if (f.tipo === "anulacion") return "Anula una anotación de " + f.jugador;
        return f.texto;
    }

    async function cargarRegistro() {
        const tnr = $("r-torneo").value;
        const todas = [];
        for (let desde = 0; desde < 3000; desde += 1000) {
            let q = sb.from("centroamericano_registro").select("*").order("ocurrio", { ascending: false });
            if (tnr) q = q.eq("tnr", tnr);
            const { data, error } = await q.range(desde, desde + 999);
            if (error) { avisar("No se pudo leer el registro: " + error.message, true); return; }
            todas.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        registro = todas;
        pintarRegistro();
        $("r-estado").textContent = "Actualizado a las " + window.HoraCR.hora(new Date());
    }

    function pintarRegistro() {
        const tipo = $("r-tipo").value;
        const anuladas = new Set(registro.filter((f) => f.tipo === "anulacion" && f.anula).map((f) => f.anula));
        const lista = registro.filter((f) => !tipo || f.tipo === tipo);
        $("registro").replaceChildren(...lista.slice(0, 400).map((f) => el("tr", { "data-tipo": f.tipo, "data-anulada": anuladas.has(f.id) ? "si" : null },
            el("td", { texto: window.HoraCR.fechaHora(f.ocurrio) }), el("td", { texto: nombreTorneo(f.tnr) }), el("td", { texto: String(f.ronda) }), el("td", { texto: String(f.mesa) }),
            el("td", { texto: f.arbitro }), el("td", { texto: (NOMBRE_TIPO[f.tipo] || f.tipo) + (anuladas.has(f.id) ? " (anulada)" : "") }), el("td", { texto: detalle(f) }))));
        $("registro-vacio").hidden = lista.length > 0;
        const marcados = C.jugadoresMarcados(registro);
        $("marcados").replaceChildren(...marcados.map((j) => el("tr", { "data-ilegales": String(j.ilegales) },
            el("td", { texto: nombreTorneo(j.tnr) }), el("td", { texto: String(j.ronda) }), el("td", { texto: String(j.mesa) }),
            el("td", { texto: j.jugador + " (" + (j.color === "negras" ? "negras" : "blancas") + ")" }),
            el("td", { texto: j.ilegales ? C.marcasTexto({ ilegales: j.ilegales }) + " " + j.ilegales + (j.ilegales >= 2 ? " — pierde la partida (art. 7.5.5)" : "") : "—" }),
            el("td", { texto: j.irregularidades ? C.marcasTexto({ irregularidades: j.irregularidades }) + " " + j.irregularidades : "—" }))));
        $("marcados-vacio").hidden = marcados.length > 0;
        $("r-pdf").disabled = registro.length === 0;
    }

    async function bajarPdf() {
        const tnr = $("r-torneo").value;
        const filas = registro.filter((f) => f.tipo !== "anulacion").map((f) => ({
            ocurrio: f.ocurrio, ronda: f.ronda, mesa: f.mesa, tipo: f.tipo, resultado: f.resultado, anterior: f.anterior, enviado: f.enviado,
            articulo: f.articulo, texto: f.tipo === "ilegal" || f.tipo === "irregularidad" ? f.jugador + " (" + (f.color === "negras" ? "negras" : "blancas") + ")" + (f.texto ? ": " + f.texto : "") : (f.jugador && (f.tipo === "resultado" || f.tipo === "correccion") ? f.jugador : f.texto),
            arbitro: f.arbitro,
        }));
        const doc = M.documento({ tnr: tnr || "todos", torneo: tnr ? nombreTorneo(tnr) : "Centroamericano 2026 (todos los torneos)" }, filas, "", (x) => window.HoraCR.fechaHora(x));
        doc.titulo = "Registro de los árbitros del Centroamericano 2026";
        doc.pie = "Centroamericano 2026 · ajedrez-integral.com";
        try {
            const blob = await window.ReportePDF.generar(doc);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "registro-arbitros-centroamericano-2026" + (tnr ? "-" + tnr : "") + ".pdf";
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        } catch (e) {
            avisar("No se pudo armar el PDF: " + (e.message || e), true);
        }
    }

    // ------------------------------------------------------------- arranque

    function imprimirQr() {
        document.body.classList.add("cam-imprime-qr");
        window.addEventListener("afterprint", () => document.body.classList.remove("cam-imprime-qr"), { once: true });
        window.print();
    }

    // Cada 6 s se miran los avisos (es lo urgente); los enlaces cada 18 s (quién está
    // conectado) y el registro cada 30 s, solo si esa pestaña está a la vista.
    async function pulso() {
        if (document.hidden) return;
        tic++;
        const tareas = [cargarAvisos()];
        if (tic % 3 === 0) tareas.push(cargarAsignaciones());
        if (tic % 5 === 0 && !$("panel-registro").hidden) tareas.push(cargarRegistro());
        await Promise.all(tareas);
    }

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = "login.html?next=centroamericano-mesas.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "mesa-arbitro" });
        $("cargando").hidden = true;
        if (error || puede !== true) { $("denegado").hidden = false; return; }
        $("app").hidden = false;
        document.querySelectorAll(".cam-pestana").forEach((b) => {
            b.addEventListener("click", () => abrirPanel(b.dataset.panel));
            b.addEventListener("keydown", teclaPestana);
        });
        $("frases").replaceChildren(...FRASES.map((f) => el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "frase", onclick: () => { $("av-texto").value = f; $("av-texto").focus(); } }, f)));
        $("sonido").addEventListener("click", alternarSonido);
        $("form-aviso").addEventListener("submit", enviarAviso);
        $("g-guardar").addEventListener("click", guardarGrupo);
        $("claves-bloque-guardar").addEventListener("click", guardarBloque);
        $("form-asignar").addEventListener("submit", crear);
        for (const id of ["rp-mesas", "rp-arbitros"]) $(id).addEventListener("input", vistaReparto);
        $("rp-torneo").addEventListener("change", vistaReparto);
        $("rp-leer").addEventListener("click", leerMesas);
        $("rp-crear").addEventListener("click", repartir);
        $("imprimir-qr").addEventListener("click", imprimirQr);
        $("r-actualizar").addEventListener("click", cargarRegistro);
        $("r-torneo").addEventListener("change", cargarRegistro);
        $("r-tipo").addEventListener("change", pintarRegistro);
        $("r-pdf").addEventListener("click", bajarPdf);
        await cargarTorneos();
        await cargarAsignaciones();
        await Promise.all([cargarAvisos(), cargarRegistro()]);
        // Sin clave todavía: lo primero que hay que hacer es ponerla.
        const hash = location.hash.replace("#", "");
        abrirPanel(PANELES.includes(hash) ? hash : torneos.some((t) => t.sid_en_boveda) ? "avisos" : "claves");
        setInterval(pulso, TIC_MS);
    }

    init().catch((e) => { $("cargando").hidden = true; avisar("No se pudo abrir la página: " + (e.message || e), true); });
})();
