/* El código de centroamericano-mesas.html: la página de la ORGANIZACIÓN del
   Centroamericano 2026 para sus árbitros.

   Tres cosas, en este orden:
   1. Cargar la clave (SID) de chess-results de cada uno de los 12 torneos. Va a la
      Edge Function centroamericano-clave, que la prueba contra chess-results y la
      guarda CIFRADA en la bóveda: esta página nunca la vuelve a ver, y la casilla
      se vacía en cuanto se manda.
   2. Asignarle a cada árbitro un torneo y un rango de mesas: se crea un enlace con
      su QR. El árbitro lo abre sin cuenta (centroamericano-arbitro.html).
   3. Ver lo que anotan: lo que se mandó a chess-results, las ilegales y las
      irregularidades por jugador, con su hora, y bajarlo en PDF.

   Quien entra tiene que tener la licencia «mesa-arbitro» (administración también):
   lo hace cumplir la base (RLS), no esta página.
   Ver «Mesas de los árbitros del Centroamericano» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const C = window.CentroamericanoMesas;
    const M = window.MesaArbitro;
    const $ = (id) => document.getElementById(id);
    const avisar = (texto, error) => Avisos.avisar(texto, { tipo: error ? "error" : "ok" });
    const REFRESCO_MS = 30000;

    let torneos = []; // los 12, con si tienen clave
    let asignaciones = [];
    let registro = [];

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

    // ------------------------------------------------------------- 1. las claves

    async function cargarTorneos() {
        const { data, error } = await sb.from("centroamericano_torneos").select("tnr, nombre, categoria, rama, orden, sid_en_boveda, clave_puesta, acceso_tnr").order("orden");
        if (error) { avisar("No se pudieron leer los torneos: " + error.message, true); return; }
        torneos = data || [];
        pintarTorneos();
        const opciones = torneos.map((t) => el("option", { value: t.tnr, texto: t.nombre + (t.sid_en_boveda ? "" : " (sin clave)") }));
        const a = $("a-torneo"), r = $("r-torneo");
        const antesA = a.value, antesR = r.value;
        a.replaceChildren(...opciones.map((o) => o.cloneNode(true)));
        r.replaceChildren(el("option", { value: "", texto: "Todos los torneos" }), ...opciones.map((o) => o.cloneNode(true)));
        if (antesA) a.value = antesA;
        if (antesR) r.value = antesR;
    }

    function pintarTorneos() {
        const con = torneos.filter((t) => t.sid_en_boveda).length;
        $("resumen-claves").textContent = con + " de " + torneos.length + " torneos con clave cargada" + (con === torneos.length ? ". ¡Todos listos!" : ".");
        // Al volver a dibujar las tarjetas no se pierde lo que alguien estaba escribiendo en otra.
        const escrito = {};
        document.querySelectorAll("#torneos input").forEach((i) => { escrito[i.id] = i.value; });
        $("torneos").replaceChildren(...torneos.map((t) => {
            const input = el("input", { type: "password", id: "sid-" + t.tnr, class: "cam-campo", maxlength: "32", autocomplete: "off", spellcheck: "false", "aria-label": "Clave (SID) de " + t.nombre, placeholder: t.sid_en_boveda ? "Cambiar la clave…" : "Pegar la clave…" });
            if (escrito["sid-" + t.tnr]) input.value = escrito["sid-" + t.tnr];
            const estado = el("p", { class: "text-sm mt-2", id: "est-" + t.tnr, role: "status" });
            return el("div", { class: "cam-torneo", "data-tnr": t.tnr, "data-clave": t.sid_en_boveda ? "si" : "no" },
                el("div", { class: "flex items-start justify-between gap-2" },
                    el("div", {}, el("p", { class: "font-bold", texto: t.nombre }),
                        el("a", { class: "text-sm underline", href: "https://chess-results.com/tnr" + t.tnr + ".aspx?lan=2", target: "_blank", rel: "noopener", texto: "tnr" + t.tnr + " en chess-results" })),
                    el("span", { class: "cam-chip", "data-clave": t.sid_en_boveda ? "si" : "no", texto: t.sid_en_boveda ? "Con clave" : "Sin clave" })),
                t.sid_en_boveda && t.acceso_tnr && t.acceso_tnr !== t.tnr ? el("p", { class: "text-sm mt-1", texto: "Entra por el grupo " + t.acceso_tnr }) : null,
                el("div", { class: "mt-2" }, input),
                el("div", { class: "cam-acciones" },
                    el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "poner", onclick: () => ponerClave(t, input, estado) }, "Guardar la clave"),
                    el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "probar", disabled: !t.sid_en_boveda, onclick: () => probar(t, estado) }, "Probar")),
                estado);
        }));
    }

    async function ponerClave(t, input, estado) {
        const sid = input.value.trim();
        if (!/^[A-Za-z0-9]{8,32}$/.test(sid)) { estado.textContent = "La clave son entre 8 y 32 letras y números."; estado.className = "cam-fallo text-sm mt-2"; return; }
        estado.textContent = "Probando la clave en chess-results…";
        estado.className = "text-sm mt-2";
        try {
            const d = await invocar({ action: "poner", tnr: t.tnr, sid });
            input.value = "";
            await cargarTorneos();
            const n = $("est-" + t.tnr);
            if (n) { n.textContent = "✓ " + resumenPuesta(d); n.className = "cam-guardado text-sm mt-2"; }
        } catch (e) {
            estado.textContent = "✗ " + e.message;
            estado.className = "cam-fallo text-sm mt-2";
        }
    }

    // Lo que dice una clave guardada: a cuántos torneos del Centroamericano abre.
    function resumenPuesta(d) {
        const n = (d.torneos || []).length;
        const cuales = (d.torneos || []).map((x) => x.nombre).join(", ");
        const ronda = d.mesas ? " Ronda " + d.ronda + " con " + d.mesas + " mesas en el primero." : " La ronda " + d.ronda + " todavía no tiene mesas.";
        return n > 1 ? "Guardada: esta clave abre " + n + " torneos ligados (" + cuales + ")." + ronda : "Guardada." + ronda;
    }

    async function probar(t, estado) {
        estado.textContent = "Probando…";
        estado.className = "text-sm mt-2";
        try {
            const d = await invocar({ action: "probar", tnr: t.tnr });
            estado.textContent = "✓ Sirve. " + (d.mesas ? "Ronda " + d.ronda + " con " + d.mesas + " mesas." : "La ronda " + d.ronda + " todavía no tiene mesas.");
            estado.className = "cam-guardado text-sm mt-2";
        } catch (e) {
            estado.textContent = "✗ " + e.message;
            estado.className = "cam-fallo text-sm mt-2";
        }
    }

    async function guardarBloque() {
        // El código puede ser el de un GRUPO de torneos ligados: no tiene que ser uno de los 12.
        const { buenas, malas } = C.leerClaves($("claves-bloque").value);
        const ul = $("claves-bloque-resultado");
        ul.replaceChildren(...malas.map((m) => el("li", { class: "cam-fallo", texto: "Línea " + m.linea + ": " + m.motivo })));
        if (!buenas.length) { if (!malas.length) avisar("Pega al menos una línea con el código y la clave.", true); return; }
        $("claves-bloque-guardar").disabled = true;
        let bien = 0;
        const guardadas = new Set();
        for (const b of buenas) {
            const li = el("li", { texto: "Código " + b.tnr + ": probando…" });
            ul.append(li);
            try {
                const d = await invocar({ action: "poner", tnr: b.tnr, sid: b.sid });
                li.textContent = "✓ Código " + b.tnr + ": " + resumenPuesta(d);
                li.className = "cam-guardado";
                guardadas.add(b.tnr);
                bien++;
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
        const { data, error } = await sb.from("centroamericano_asignaciones").select("*").order("creada", { ascending: false }).range(0, 499);
        if (error) { avisar("No se pudieron leer los enlaces: " + error.message, true); return; }
        asignaciones = data || [];
        pintarAsignaciones();
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

    function pintarAsignaciones() {
        const caja = $("asignaciones");
        $("sin-asignaciones").hidden = asignaciones.length > 0;
        caja.replaceChildren(...asignaciones.map((a) => {
            const enlace = C.enlaceArbitro(location.origin, a.token);
            const est = C.estadoAsignacion(a, new Date());
            const torneo = nombreTorneo(a.tnr);
            const qr = window.QrSvg ? window.QrSvg.dibujar(enlace, "QR del enlace de " + a.arbitro) : null;
            const wa = "https://wa.me/?text=" + encodeURIComponent(C.textoWhatsapp(a, torneo, enlace));
            return el("article", { class: "cam-asignacion", "data-estado": est, "data-id": a.id },
                el("div", {},
                    el("p", { class: "font-bold text-lg", texto: a.arbitro }),
                    el("p", { texto: torneo + " · mesas " + a.mesa_desde + " a " + a.mesa_hasta }),
                    el("p", { class: "text-sm", texto: textoEstado(a) + (a.ultimo_uso ? " · último uso: " + window.HoraCR.fechaHora(a.ultimo_uso) : " · todavía no lo ha abierto") }),
                    el("div", { class: "cam-acciones cam-no-qr" },
                        el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "copiar", onclick: () => copiar(enlace) }, "Copiar el enlace"),
                        el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: wa, target: "_blank", rel: "noopener", "data-accion": "whatsapp" }, "Mandar por WhatsApp"),
                        el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: enlace, target: "_blank", rel: "noopener", "data-accion": "abrir" }, "Abrir"),
                        el("button", { type: "button", class: "cam-btn cam-btn-chico " + (a.revocada ? "cam-btn-claro" : "cam-btn-rojo"), "data-accion": a.revocada ? "reactivar" : "apagar", onclick: () => cambiar(a, !a.revocada) }, a.revocada ? "Volver a encender" : "Apagar el enlace"))),
                qr ? el("div", { class: "cam-qr" }, qr) : null);
        }));
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

    function entero(id) { const v = parseInt($(id).value, 10); return Number.isFinite(v) ? v : null; }

    async function crear(ev) {
        ev.preventDefault();
        const arbitro = $("a-arbitro").value.trim();
        const tnr = $("a-torneo").value;
        const desde = entero("a-desde"), hasta = entero("a-hasta");
        if (!arbitro) { avisar("Falta el nombre del árbitro.", true); return; }
        if (!tnr) { avisar("Elige el torneo.", true); return; }
        if (!desde || !hasta || desde < 1 || hasta < desde) { avisar("Las mesas van de una mesa a otra igual o mayor (por ejemplo 1 a 15).", true); return; }
        const t = torneos.find((x) => x.tnr === tnr);
        const traslapa = asignaciones.filter((a) => a.tnr === tnr && C.estadoAsignacion(a, new Date()) === "activo" && a.mesa_desde <= hasta && a.mesa_hasta >= desde);
        const avisos = [];
        if (t && !t.sid_en_boveda) avisos.push("«" + t.nombre + "» todavía no tiene la clave cargada: el enlace no va a funcionar hasta que la pongas.");
        if (traslapa.length) avisos.push("Esas mesas ya las tiene " + traslapa.map((a) => a.arbitro + " (" + a.mesa_desde + " a " + a.mesa_hasta + ")").join(", ") + ".");
        if (avisos.length) {
            const sigue = await Avisos.confirmar(avisos.join(" ") + " ¿Crear el enlace igual?", { titulo: "Revisa esto", aceptar: "Sí, crearlo" });
            if (!sigue) return;
        }
        const vence = C.vencimiento($("a-vence").value, new Date(), window.HoraCR.hoy());
        $("a-crear").disabled = true;
        const { error } = await sb.from("centroamericano_asignaciones").insert({ tnr, arbitro, mesa_desde: desde, mesa_hasta: hasta, vence: vence.toISOString() });
        $("a-crear").disabled = false;
        if (error) { avisar("No se pudo crear el enlace: " + error.message, true); return; }
        $("a-arbitro").value = "";
        $("a-desde").value = "";
        $("a-hasta").value = "";
        avisar("Enlace creado para " + arbitro + ".");
        await cargarAsignaciones();
    }

    // ------------------------------------------------------------- 3. lo que anotan

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

    async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { location.href = "login.html?next=centroamericano-mesas.html"; return; }
        const { data: puede, error } = await sb.rpc("tengo_herramienta", { p_herramienta: "mesa-arbitro" });
        $("cargando").hidden = true;
        if (error || puede !== true) { $("denegado").hidden = false; return; }
        $("app").hidden = false;
        $("claves-bloque-guardar").addEventListener("click", guardarBloque);
        $("form-asignar").addEventListener("submit", crear);
        $("imprimir-qr").addEventListener("click", imprimirQr);
        $("r-actualizar").addEventListener("click", cargarRegistro);
        $("r-torneo").addEventListener("change", cargarRegistro);
        $("r-tipo").addEventListener("change", pintarRegistro);
        $("r-pdf").addEventListener("click", bajarPdf);
        await cargarTorneos();
        await Promise.all([cargarAsignaciones(), cargarRegistro()]);
        setInterval(() => { if (!document.hidden) { cargarAsignaciones(); cargarRegistro(); } }, REFRESCO_MS);
    }

    init().catch((e) => { $("cargando").hidden = true; avisar("No se pudo abrir la página: " + (e.message || e), true); });
})();
