/* El código de centroamericano-mesas.html: el «programa» de la ORGANIZACIÓN (la cuenta
   principal) del Centroamericano 2026 para sus árbitros. Una ventana con barra de título,
   menú de pestañas, tablas en cuadrícula y barra de estado, pensada para una tablet o una
   computadora que se queda abierta durante la ronda.

   Siete pestañas:
   1. Ronda en curso: cuánto le queda a cada árbitro (resumen), la revisión previa que lleva,
      y los pedidos de ayuda y avisos de los árbitros —sin sonido, con contador y la barra que parpadea—: quién pidió
      ayuda, quién TERMINÓ sus mesas (con una sugerencia de a dónde ir a ayudar) y quién
      FINALIZÓ la ronda.
   2. Avisos: mandar un mensaje a un árbitro, a un torneo o a todos, y ver quién lo leyó.
   3. Árbitros y mesas: un enlace con su QR por árbitro (o «por definir», sin nombre, y el
      reparto de las mesas entre varios de una vez); nombre, mesas, aviso, apagar; la hoja de
      QR para imprimir (todos los QR llevan la marca de Ajedrez Integral).
   4. Planillas y Drive: las fotos de las planillas y su paso al Drive «Planillas
      Centroamericano»; conectar el Drive y reintentar lo que no llegó.
   5. Clave de chess-results: UNA sola para el grupo de torneos ligados. Va a la Edge Function
      centroamericano-clave, que la prueba y la guarda CIFRADA: esta página nunca la vuelve a
      ver y la casilla se vacía.
   6. Respaldo: las copias automáticas, hacer una ahora y bajarla, y restaurar (solo agrega lo
      que falta).
   7. Lo que anotan: resultados enviados, ilegales e irregularidades, y el PDF.
   Más: quién no ha llegado (presencia mesa por mesa), el control de tiempos que se le pide a los
   árbitros, y un árbitro con mesas de VARIOS torneos (`persona`: sus enlaces se juntan).

   Quien entra tiene que tener la licencia «mesa-arbitro» (administración también): lo hace
   cumplir la base (RLS), no esta página.
   Ver «Mesas de los árbitros del Centroamericano» y «Terminar la ronda, planillas y
   respaldo» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const C = window.CentroamericanoMesas;
    const M = window.MesaArbitro;
    const $ = (id) => document.getElementById(id);
    const avisar = (texto, error) => Avisos.avisar(texto, { tipo: error ? "error" : "ok" });
    const TIC_MS = 6000; // cada cuánto se miran los avisos y el avance
    const TITULO = document.title;
    const FRASES = ["Ya empieza la ronda: a sus mesas.", "Pasen por el escritorio principal, por favor.", "Pausa de 10 minutos.", "Revisen que cada mesa tenga su resultado guardado."];
    const PASOS_LISTA = 2; // relojes y tableros (centroamericano-mesa)

    let torneos = [];
    let asignaciones = [];
    let avisos = [];
    let progreso = [];
    let finales = [];
    let listas = [];
    let planillas = [];
    let presencia = [];
    let tiempos = [];
    let copias = [];
    let registro = [];
    let drive = null;
    let pedidosVistos = null; // null: todavía no se leyó nada (la primera lectura no suena)
    let tic = 0;
    let firmaRonda = "";
    let firmaAsignaciones = "";
    let firmaEnviados = "";

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

    // Las funciones contestan con un error legible aun en 4xx/5xx: se lee el cuerpo.
    async function invocar(cuerpo) {
        let { data, error } = await sb.functions.invoke("centroamericano-clave", { body: cuerpo });
        if (error && error.context && typeof error.context.json === "function") {
            try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (!data || data.error) throw new Error((data && data.error) || (error && error.message) || "No hubo respuesta. Revisa tu conexión.");
        return data;
    }

    // Una ventanita propia (el QR, una foto): <dialog> con showModal(), que encierra el foco.
    function ventanita(titulo, ...cuerpo) {
        const d = el("dialog", { class: "cam-dialogo", "aria-label": titulo });
        d.append(
            el("div", { class: "cam-dialogo-titulo" }, el("span", { texto: titulo }), el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "cerrar", onclick: () => d.close() }, "Cerrar")),
            el("div", { class: "cam-dialogo-cuerpo" }, ...cuerpo));
        d.addEventListener("close", () => d.remove());
        document.body.append(d);
        d.showModal();
        return d;
    }

    const nombreTorneo = (tnr) => (torneos.find((t) => t.tnr === tnr) || { nombre: tnr }).nombre;
    const asig = (id) => asignaciones.find((a) => a.id === id);
    const nombreAsig = (id) => (asig(id) || { arbitro: "Un árbitro" }).arbitro;
    const activa = (a) => C.estadoAsignacion(a, new Date()) === "activo";
    // El mismo árbitro con varios enlaces (varios torneos): un aviso le llega UNA vez, no una por enlace.
    const unicosPorPersona = (lista) => { const vistos = new Set(); return lista.filter((a) => { const k = a.persona || a.id; if (vistos.has(k)) return false; vistos.add(k); return true; }); };
    const otrosEnlaces = (a) => (a.persona ? asignaciones.filter((x) => x.persona === a.persona && x.id !== a.id) : []);
    const ahoraTxt = () => window.HoraCR.hora(new Date());

    // ------------------------------------------------------------- pestañas

    const PANELES = ["ronda", "avisos", "arbitros", "tiempos", "planillas", "claves", "respaldo", "registro"];
    function abrirPanel(nombre, enfocar) {
        if (!PANELES.includes(nombre)) nombre = "ronda";
        for (const p of PANELES) {
            const sel = p === nombre;
            const b = $("pest-" + p);
            b.setAttribute("aria-selected", sel ? "true" : "false");
            b.tabIndex = sel ? 0 : -1;
            $("panel-" + p).hidden = !sel;
        }
        if (enfocar) $("pest-" + nombre).focus();
        try { history.replaceState(null, "", "#" + nombre); } catch (e) { /* sin historial */ }
        if (nombre === "planillas") { cargarPlanillas(); cargarDrive(); }
        if (nombre === "tiempos") cargarTiempos();
        if (nombre === "respaldo") { cargarCopias(); cargarDrive(); }
        if (nombre === "registro") cargarRegistro();
    }
    function teclaPestana(ev) {
        const i = PANELES.indexOf(ev.currentTarget.dataset.panel);
        const salto = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
        const j = salto ? (i + salto + PANELES.length) % PANELES.length : ev.key === "Home" ? 0 : ev.key === "End" ? PANELES.length - 1 : null;
        if (j == null) return;
        ev.preventDefault();
        abrirPanel(PANELES[j], true);
    }

    // ------------------------------------------------------------- barra de estado (sin sonido: en un torneo no puede haber ruido)

    const abiertosDeArbitros = () => avisos.filter((f) => f.de === "arbitro" && f.estado === "abierto").sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
    const pedidosAbiertos = () => abiertosDeArbitros().filter((f) => f.tipo === "ayuda");

    function pintarEstadoGeneral() {
        const n = abiertosDeArbitros().length;
        const act = asignaciones.filter(activa);
        const en = act.filter((a) => C.enLinea(a, new Date())).length;
        const con = torneos.filter((t) => t.sid_en_boveda).length;
        $("eg-pedidos").replaceChildren(el("strong", { texto: n ? n + (n === 1 ? " aviso de árbitros abierto" : " avisos de árbitros abiertos") : "Sin pedidos de ayuda" }));
        $("eg-enlinea").textContent = act.length ? en + " de " + act.length + " árbitros conectados" : "Sin enlaces activos";
        $("eg-claves").textContent = torneos.length ? (con === torneos.length ? "Clave cargada en los " + torneos.length + " torneos" : "Clave en " + con + " de " + torneos.length + " torneos") : "";
        $("eg-drive").textContent = drive ? (drive.conectado ? "Drive conectado" + (drive.pendientes ? " · " + drive.pendientes + " planillas sin enviar" : "") : "Drive sin conectar") : "";
        const ultima = copias.filter((c) => c.anillo !== "d").map((c) => c.creada).sort().pop();
        $("eg-copia").textContent = ultima ? "Última copia: " + C.hace(ultima, new Date()) : "Sin copias todavía";
        $("eg-reloj").textContent = ahoraTxt();
        // Sin sonido (la vibración sí): la barra de abajo parpadea suave mientras haya avisos abiertos.
        $("estado-general").dataset.alerta = n ? "si" : "no";
        const c = $("contador-pedidos");
        c.hidden = n === 0;
        c.textContent = String(n);
        avisosEnTitulo = n;
        ponerTitulo();
    }

    // El título de la pestaña lleva los avisos abiertos «(2)» y, si se cumplió el tiempo de espera de alguien, un ⏰.
    let avisosEnTitulo = 0, esperaCumplida = false;
    function ponerTitulo() { document.title = (ensayo ? "ENSAYO · " : "") + (esperaCumplida ? "⏰ " : "") + (avisosEnTitulo ? "(" + avisosEnTitulo + ") " : "") + TITULO; }

    // ------------------------------------------------------------- «Modo ensayo»
    // Los torneos de PRUEBA (centroamericano_torneos.prueba) no se mezclan con los reales: por omisión la organización ve
    // solo los reales (el resumen, los que no han llegado, las hojas en papel, el informe final…); con «Modo ensayo» ve
    // solo los de prueba, para ensayar con las tablets sin ensuciar lo del torneo.
    let ensayo = false;
    let pruebas = new Set();
    const dentro = (tnr) => pruebas.has(tnr) === ensayo;
    const idsDentro = () => new Set(asignaciones.map((a) => a.id));

    // ------------------------------------------------------------- 1. ronda en curso

    async function cargarAvance() {
        const [p, f, l, pr] = await Promise.all([
            sb.from("centroamericano_progreso").select("*").range(0, 999),
            sb.from("centroamericano_finales").select("*").range(0, 999),
            sb.from("centroamericano_listas").select("*").range(0, 999),
            sb.from("centroamericano_presencia").select("*").range(0, 999),
        ]);
        const ids = idsDentro();
        if (!pr.error) presencia = (pr.data || []).filter((x) => dentro(x.tnr));
        if (!p.error) progreso = (p.data || []).filter((x) => ids.has(x.asignacion_id));
        if (!f.error) finales = (f.data || []).filter((x) => ids.has(x.asignacion_id));
        if (!l.error) listas = (l.data || []).filter((x) => ids.has(x.asignacion_id));
    }

    const filasRonda = () => C.resumenRonda(asignaciones, progreso, finales, new Date(), listas)
        .sort((a, b) => (torneos.findIndex((t) => t.tnr === a.tnr) - torneos.findIndex((t) => t.tnr === b.tnr)) || a.mesa_desde - b.mesa_desde);

    // La presencia revisada de un árbitro en la ronda: cuántos jugadores marcó y cuántos no han llegado.
    function presenciaDeFila(f) {
        const filas = presencia.filter((x) => x.tnr === f.tnr && x.ronda === f.ronda && x.mesa >= f.mesa_desde && x.mesa <= f.mesa_hasta);
        return { marcados: filas.length, faltan: filas.filter((x) => !x.presente).length, total: (f.sinDatos ? f.mesa_hasta - f.mesa_desde + 1 : f.total) * 2 };
    }

    const ETIQUETA_ESTADO = { "sin-datos": "Sin datos", "en-curso": "En curso", termino: "Terminó sus mesas", finalizada: "Ronda finalizada ✓" };

    function pintarResumen(filas) {
        $("resumen-vacio").hidden = filas.length > 0;
        const ronda = filas.length ? filas[0].ronda : 0;
        $("resumen-ronda").textContent = ronda ? " — ronda " + ronda : "";
        const con = filas.reduce((s, f) => s + (f.con_resultado || 0), 0), total = filas.reduce((s, f) => s + (f.sinDatos ? 0 : f.total), 0);
        $("resumen-total").textContent = total ? "Con resultado: " + con + " de " + total + " mesas (" + Math.round(con * 100 / total) + " %)" : "";
        $("resumen").replaceChildren(...filas.map((f) => el("tr", { "data-id": f.id, "data-estado": f.estado },
            el("td", { texto: f.arbitro }),
            el("td", { texto: nombreTorneo(f.tnr) }),
            el("td", { texto: f.mesa_desde + " a " + f.mesa_hasta }),
            el("td", {}, f.sinDatos ? el("span", { texto: "—" }) : el("span", { class: "cam-avance" }, el("progress", { max: String(f.total), value: String(f.con_resultado), "aria-label": "Mesas con resultado de " + f.arbitro }), " " + f.con_resultado + " de " + f.total)),
            el("td", { class: "cam-quedan", title: f.pendientes && f.pendientes.length ? "Faltan las mesas " + C.listaMesas(f.pendientes) : null, texto: f.sinDatos ? "—" : f.quedan === 0 ? "0" : f.quedan + " (" + C.listaMesas(f.pendientes) + ")" }),
            el("td", {}, el("span", { class: "cam-chip", "data-estado": f.estado, texto: ETIQUETA_ESTADO[f.estado] }), f.estado === "en-curso" || f.estado === "sin-datos" ? el("span", { class: "cam-lista-previa-estado", texto: " Revisión previa " + f.lista + "/" + PASOS_LISTA }) : null),
            el("td", { class: "cam-presencia-celda", texto: (() => { const q = presenciaDeFila(f); return q.marcados ? q.marcados + " de " + q.total + (q.faltan ? " · faltan " + q.faltan : "") : "Sin revisar"; })() }),
            el("td", { class: "cam-conectado", "data-en-linea": C.enLinea(asig(f.id) || {}, new Date()) ? "si" : "no", texto: C.enLinea(asig(f.id) || {}, new Date()) ? "● Conectado" : "—" }))));
        pintarFaltan(ronda);
    }

    // El tiempo de espera de las bases (30 min desde el inicio de la ronda, js/centroamericano-horario.js): mientras
    // la ronda está en juego, cuánto falta o cuánto pasó. Sin ronda en juego, null (no hay nada que avisar).
    let rondaDeFaltan = 0;
    function esperaDeRonda(ronda) {
        const H = window.CentroamericanoHorario;
        const ev = H && ronda ? H.EVENTOS.find((e) => e.ronda === ronda) : null;
        if (!ev) return null;
        const pasados = Math.floor((Date.now() - new Date(ev.inicio + ":00-06:00").getTime()) / 60000);
        if (pasados < 0 || pasados >= ev.minutos) return null;
        return { cumplido: pasados >= H.TOLERANCIA_MIN, quedan: H.TOLERANCIA_MIN - pasados, pasaron: pasados - H.TOLERANCIA_MIN, minutos: H.TOLERANCIA_MIN };
    }

    // Los que no han llegado, según el árbitro de cada mesa. Cuando se cumple el tiempo de espera, la alerta
    // sale arriba de la lista, bien visible (sin sonido: en un torneo no hay ruido) y en el título de la pestaña.
    function pintarFaltan(ronda) {
        rondaDeFaltan = ronda;
        const lista = C.jugadoresQueFaltan(presencia, ronda);
        const espera = esperaDeRonda(ronda);
        $("faltan-nota").textContent = ronda ? " — ronda " + ronda + ": " + lista.length : "";
        $("faltan-vacio").hidden = lista.length > 0;
        const textoEspera = !espera ? "" : espera.cumplido ? "Tiempo cumplido" + (espera.pasaron > 0 ? " (hace " + espera.pasaron + " min)" : "") : "Quedan " + espera.quedan + " min";
        $("faltan").replaceChildren(...lista.map((x) => el("tr", { "data-mesa": String(x.mesa), "data-espera": espera ? (espera.cumplido ? "cumplido" : "corre") : null },
            el("td", { texto: nombreTorneo(x.tnr) }), el("td", { texto: String(x.mesa) }), el("td", { texto: x.jugador }), el("td", { texto: x.color === "negras" ? "Negras" : "Blancas" }),
            el("td", { texto: x.arbitro }), el("td", { texto: window.HoraCR.hora(new Date(x.marcada)) }), el("td", { class: espera && espera.cumplido ? "cam-espera-cumplida" : "", texto: textoEspera }))));
        const alerta = $("espera-alerta");
        const mesas = [...new Set(lista.map((x) => x.mesa))].sort((a, b) => a - b);
        if (espera && lista.length && (espera.cumplido || espera.quedan <= 10)) {
            alerta.hidden = false;
            alerta.dataset.nivel = espera.cumplido ? "cumplido" : "pronto";
            alerta.setAttribute("role", espera.cumplido ? "alert" : "status");
            alerta.textContent = espera.cumplido
                ? "⏰ Se cumplió el tiempo de espera (" + espera.minutos + " min) de la ronda " + ronda + ": " + lista.length + (lista.length === 1 ? " jugador sigue sin llegar" : " jugadores siguen sin llegar") + " (mesas " + mesas.join(", ") + "). Avisa a los árbitros de esas mesas."
                : "⏳ Quedan " + espera.quedan + " min del tiempo de espera de la ronda " + ronda + " y " + lista.length + (lista.length === 1 ? " jugador no ha llegado" : " jugadores no han llegado") + " (mesas " + mesas.join(", ") + ").";
            esperaCumplida = espera.cumplido;
        } else { alerta.hidden = true; alerta.textContent = ""; esperaCumplida = false; }
        ponerTitulo();
    }

    function tarjetaAviso(f, atendido, filas) {
        const a = asig(f.asignacion_id);
        const quien = a ? a.arbitro : "Un árbitro";
        const donde = a ? nombreTorneo(a.tnr) + " · " : "";
        let titulo = "";
        if (f.tipo === "termino") titulo = "✅ " + quien + " terminó sus mesas de la ronda " + f.ronda;
        else if (f.tipo === "finalizo") titulo = "📋 " + quien + " finalizó la ronda " + f.ronda;
        else if (f.mesa) titulo = (atendido ? "✓ " : "🆘 ") + quien + " pide al principal EN LA MESA " + f.mesa;
        else titulo = (atendido ? "✓ " : "🆘 ") + quien + " necesita ayuda (para él o ella, no es de una mesa)";
        const hora = atendido && f.atendido_en ? "atendido a las " + window.HoraCR.hora(new Date(f.atendido_en)) : null;
        const sugerencias = [];
        if (f.tipo === "termino" && !atendido) {
            const yo = filas.find((x) => x.id === f.asignacion_id);
            const lista = yo && yo.ronda === f.ronda ? C.sugerirAyuda(yo, filas) : [];
            sugerencias.push(el("p", { class: "mt-2 font-bold", texto: "Sugerencia: a dónde puede ir a ayudar" }));
            if (!lista.length) sugerencias.push(el("p", { class: "cam-herramientas-nota", texto: "Nadie más tiene mesas pendientes según el último avance. Toca «Actualizar desde chess-results» para estar seguro." }));
            for (const s of lista) {
                sugerencias.push(el("div", { class: "cam-sugerencia", "data-id": s.id },
                    el("span", { texto: s.arbitro + " (" + nombreTorneo(s.tnr) + (s.mismoTorneo ? ", su mismo torneo" : "") + "): le quedan " + s.quedan + (s.quedan === 1 ? " mesa" : " mesas") + "; podría tomar " + (s.mesas.length === 1 ? "la mesa " : "las mesas ") + C.listaMesas(s.mesas) + "." }),
                    el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "sugerir", onclick: () => mandarSugerencia(f, s) }, "Mandarle esta sugerencia")));
            }
        }
        return el("article", { class: "cam-pedido", "data-estado": atendido ? "atendido" : "abierto", "data-tipo": f.tipo, "data-id": f.id },
            el("div", { class: "flex flex-wrap items-start justify-between gap-2" },
                el("div", {},
                    el("p", { class: "font-bold text-lg", texto: titulo }),
                    el("p", { class: "text-sm", ...(hora ? { texto: donde + hora } : { "data-creado": f.creado, "data-antes": donde, texto: donde + C.hace(f.creado, new Date()) + " (" + window.HoraCR.hora(new Date(f.creado)) + ")" }) })),
                atendido ? null : el("div", { class: "cam-acciones cam-acciones-sin-margen" },
                    el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "atender", onclick: () => atender(f) }, "Atendido"),
                    a && f.tipo === "ayuda" ? el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "escribir", onclick: () => escribirA(a.id) }, "Escribirle") : null)),
            f.texto && f.tipo === "ayuda" ? el("p", { class: "mt-2 font-bold", texto: "«" + f.texto + "»" }) : null,
            f.tipo === "finalizo" && f.texto ? el("p", { class: "mt-2 text-sm", texto: f.texto }) : null,
            ...sugerencias);
    }

    // Lo que cambia con el tiempo y no hace falta repintar: «hace 3 min» se corrige en el lugar.
    function refrescarHace() {
        document.querySelectorAll("[data-creado]").forEach((p) => { p.textContent = p.dataset.antes + C.hace(p.dataset.creado, new Date()) + " (" + window.HoraCR.hora(new Date(p.dataset.creado)) + ")"; });
    }

    function pintarRonda() {
        const filas = filasRonda();
        const abiertos = abiertosDeArbitros();
        const hechos = avisos.filter((f) => f.de === "arbitro" && f.estado === "atendido").slice(0, 20);
        // Se llega acá cada pocos segundos: si nada cambió, no se vuelven a dibujar los botones
        // (un toque no debe caer en un botón que se acaba de reemplazar).
        const firma = JSON.stringify([filas.map((f) => [f.id, f.arbitro, f.con_resultado, f.estado, f.lista, C.enLinea(asig(f.id) || {}, new Date())]), presencia.map((x) => [x.id, x.presente]), abiertos.map((f) => f.id), hechos.map((f) => f.id), torneos.map((t) => t.nombre)]);
        if (firma === firmaRonda) { refrescarHace(); return; }
        firmaRonda = firma;
        pintarResumen(filas);
        $("pedidos").replaceChildren(...abiertos.map((f) => tarjetaAviso(f, false, filas)));
        $("sin-pedidos").hidden = abiertos.length > 0;
        $("atendidos-caja").hidden = hechos.length === 0;
        $("atendidos-n").textContent = String(hechos.length);
        $("atendidos").replaceChildren(...hechos.map((f) => tarjetaAviso(f, true, filas)));
        marcarPedidos();
    }

    async function cargarAvisos() {
        const { data, error } = await sb.from("centroamericano_avisos").select("*").order("creado", { ascending: false }).range(0, 499);
        if (error) { if (pedidosVistos === null) avisar("No se pudieron leer los avisos: " + error.message, true); return; }
        await cargarAvance();
        const idsDeAqui = idsDentro();
        avisos = (data || []).filter((x) => idsDeAqui.has(x.asignacion_id));
        const ids = new Set(abiertosDeArbitros().map((f) => f.id));
        // Un aviso nuevo hace vibrar la tablet (no hace ruido); la primera lectura no vibra.
        if (pedidosVistos !== null && [...ids].some((id) => !pedidosVistos.has(id))) { try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* sin vibración */ } }
        pedidosVistos = ids;
        pintarRonda();
        marcarPedidos();
        pintarEnviados();
        pintarEstadoGeneral();
    }

    async function atender(f) {
        const { error } = await sb.from("centroamericano_avisos").update({ estado: "atendido" }).eq("id", f.id);
        if (error) { avisar("No se pudo marcar: " + error.message, true); return; }
        await cargarAvisos();
    }

    async function mandarSugerencia(f, s) {
        const texto = C.textoSugerencia(s, nombreTorneo(s.tnr));
        const { error } = await sb.from("centroamericano_avisos").insert([{ de: "organizacion", asignacion_id: f.asignacion_id, texto }]);
        if (error) { avisar("No se pudo enviar: " + error.message, true); return; }
        await sb.from("centroamericano_avisos").update({ estado: "atendido" }).eq("id", f.id);
        avisar("Sugerencia enviada a " + nombreAsig(f.asignacion_id) + ".");
        await cargarAvisos();
    }

    async function actualizarResumen() {
        const b = $("resumen-actualizar");
        b.disabled = true;
        $("resumen-total").textContent = "Leyendo chess-results…";
        try {
            const d = await invocar({ action: "resumen" });
            await cargarAvance();
            firmaRonda = "";
            pintarRonda();
            avisar("Avance puesto al día (" + d.torneos + (d.torneos === 1 ? " torneo" : " torneos") + ")." + (d.errores && d.errores.length ? " No se pudo leer: " + d.errores.map((e) => nombreTorneo(e.tnr)).join(", ") + "." : ""), !!(d.errores && d.errores.length && !d.torneos));
        } catch (e) {
            avisar(e.message, true);
        } finally {
            b.disabled = false;
        }
    }

    async function reportePdf() {
        const filas = filasRonda();
        if (!filas.length) { avisar("No hay enlaces activos para el reporte.", true); return; }
        const ronda = filas[0].ronda;
        const doc = {
            titulo: "Avance de la ronda " + (ronda || ""),
            subtitulo: "Centroamericano 2026 · " + window.HoraCR.fechaHora(new Date()),
            pie: "Centroamericano 2026 · ajedrez-integral.com",
            bloques: [
                { tipo: "titulo", texto: "Cuánto le queda a cada árbitro" },
                { tipo: "tabla", encabezados: ["Árbitro", "Torneo", "Mesas", "Con resultado", "Faltan", "Estado"], anchos: [2.4, 2.4, 1.1, 1.3, 2, 2],
                  filas: filas.map((f) => [f.arbitro, nombreTorneo(f.tnr), f.mesa_desde + " a " + f.mesa_hasta, f.sinDatos ? "—" : f.con_resultado + " de " + f.total, f.sinDatos ? "—" : f.quedan ? C.listaMesas(f.pendientes) : "ninguna", ETIQUETA_ESTADO[f.estado]]) },
                { tipo: "titulo", texto: "Pedidos y avisos sin atender" },
                abiertosDeArbitros().length
                    ? { tipo: "lista", items: abiertosDeArbitros().map((f) => nombreAsig(f.asignacion_id) + ": " + (f.tipo === "termino" ? "terminó sus mesas" : f.tipo === "finalizo" ? "finalizó la ronda" : "pidió ayuda" + (f.mesa ? " en la mesa " + f.mesa : "")) + " (" + window.HoraCR.hora(new Date(f.creado)) + ")") }
                    : { tipo: "parrafo", texto: "Ninguno." },
            ],
            fotos: [],
        };
        await descargarPdf(doc, "avance-ronda-" + (ronda || "x") + "-centroamericano-2026.pdf");
    }

    // El plan B en papel: una hoja por árbitro con sus mesas, los jugadores y un renglón para marcar el resultado a mano,
    // por si falla la señal de la sala. Sale de la última lectura de chess-results (la misma de las tablets).
    async function hojasPapelPdf() {
        $("resumen-hojas").disabled = true;
        try {
            const { data, error } = await sb.rpc("centroamericano_hojas");
            if (error) throw new Error(error.message);
            const hojas = (data || []).filter((h) => h.mesas && h.mesas.length && dentro(h.tnr));
            if (!hojas.length) { avisar("Todavía no hay mesas leídas. Toca «Actualizar desde chess-results» y vuelve a intentar.", true); return; }
            const bloques = [];
            hojas.forEach((h, i) => {
                if (i) bloques.push({ tipo: "salto" });
                bloques.push({ tipo: "titulo", texto: h.arbitro + " — mesas " + h.mesa_desde + " a " + h.mesa_hasta });
                bloques.push({ tipo: "parrafo", texto: (h.categoria ? h.categoria + " " + (h.rama || "") : h.torneo) + " · ronda " + h.ronda + " · mesas de chess-results a las " + window.HoraCR.hora(new Date(h.leida)) });
                bloques.push({ tipo: "nota", texto: "Marca con una X el resultado de cada partida y anota al lado lo que haga falta (ilegales, control de tiempos, incidencias). Cuando vuelva la señal, pasa los resultados a la tablet." });
                bloques.push({
                    tipo: "tabla", altoFila: 30, encabezados: ["Mesa", "Blancas", "Negras", "Resultado", "Notas"], anchos: [1.1, 3, 3, 3.6, 2.2],
                    filas: h.mesas.map((m) => [String(m.mesa), m.blancas, m.negras, m.valor && m.valor !== "0" ? "ya en chess-results: " + M.textoResultado(m.valor) : "[   ] 1-0     [   ] 1/2     [   ] 0-1", ""]),
                });
                bloques.push({ tipo: "parrafo", texto: "Firma del árbitro: ______________________________" });
            });
            const doc = {
                titulo: "Hojas de resultados en papel (plan B)",
                subtitulo: "Centroamericano 2026 · " + window.HoraCR.fechaHora(new Date()),
                pie: "Centroamericano 2026 · ajedrez-integral.com",
                bloques, fotos: [],
            };
            await descargarPdf(doc, "hojas-resultados-papel-ronda-" + (hojas[0].ronda || "x") + "-centroamericano-2026.pdf");
        } catch (e) {
            avisar("No se pudo armar las hojas: " + (e.message || e), true);
        } finally { $("resumen-hojas").disabled = false; }
    }

    async function descargarPdf(doc, nombre) {
        try {
            const blob = await window.ReportePDF.generar(doc);
            descargar(blob, nombre);
        } catch (e) {
            avisar("No se pudo armar el PDF: " + (e.message || e), true);
        }
    }

    function descargar(blob, nombre) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = nombre;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }

    function escribirA(id) {
        abrirPanel("avisos");
        $("av-para").value = "a:" + id;
        $("form-aviso").scrollIntoView({ block: "center" });
        $("av-texto").focus();
    }

    // ------------------------------------------------------------- 2. avisos

    function pintarEnviados() {
        const envios = C.enviosAgrupados(avisos, nombreAsig).slice(0, 40);
        const firma = JSON.stringify(envios.map((e) => [e.creado, e.texto, e.leidos, e.total]));
        if (firma === firmaEnviados) return;
        firmaEnviados = firma;
        $("enviados").replaceChildren(...envios.map((e) => el("tr", { "data-total": String(e.total), "data-leidos": String(e.leidos) },
            el("td", { texto: window.HoraCR.fechaHora(e.creado) }),
            el("td", { texto: e.texto }),
            el("td", { texto: e.leidos + " de " + e.total + (e.sinLeer.length ? " · falta: " + e.sinLeer.slice(0, 6).join(", ") + (e.sinLeer.length > 6 ? "…" : "") : " ✓") }))));
        $("enviados-vacio").hidden = envios.length > 0;
    }

    function pintarDestinos() {
        const antes = $("av-para").value;
        const act = asignaciones.filter(activa).sort((a, b) => nombreTorneo(a.tnr).localeCompare(nombreTorneo(b.tnr)) || a.mesa_desde - b.mesa_desde);
        const tnrs = [...new Set(act.map((a) => a.tnr))];
        const op = () => {
            const o = [el("option", { value: "todos", texto: "Todos los árbitros (" + unicosPorPersona(act).length + ")" })];
            for (const t of tnrs) o.push(el("option", { value: "t:" + t, texto: "Todo el torneo: " + nombreTorneo(t) + " (" + unicosPorPersona(act.filter((a) => a.tnr === t)).length + ")" }));
            for (const a of act) o.push(el("option", { value: "a:" + a.id, texto: a.arbitro + " — " + nombreTorneo(a.tnr) + ", mesas " + a.mesa_desde + " a " + a.mesa_hasta }));
            return o;
        };
        // Si la lista es la misma no se toca: con el desplegable abierto, cambiarla lo cerraría.
        for (const sel of [$("av-para"), $("ct-para")]) {
            const nuevas = op(), previo = sel.value;
            if ([...sel.options].map((o) => o.value + o.textContent).join("|") === nuevas.map((o) => o.value + o.textContent).join("|")) continue;
            sel.replaceChildren(...nuevas);
            if ([...sel.options].some((o) => o.value === previo)) sel.value = previo;
        }
        // El desplegable de «¿ya tiene mesas en otro torneo?» (un árbitro por persona).
        const personas = unicosPorPersona(act), sp = $("a-persona"), antesP = sp.value;
        const opsP = [el("option", { value: "", texto: "No: es un árbitro nuevo" }), ...personas.map((a) => el("option", { value: a.persona ? "p:" + a.persona : "a:" + a.id, texto: a.arbitro + " (" + asignaciones.filter((x) => activa(x) && (a.persona ? x.persona === a.persona : x.id === a.id)).map((x) => nombreTorneo(x.tnr)).join(", ") + ")" }))];
        if ([...sp.options].map((o) => o.value + o.textContent).join("|") !== opsP.map((o) => o.value + o.textContent).join("|")) {
            sp.replaceChildren(...opsP);
            if ([...sp.options].some((o) => o.value === antesP)) sp.value = antesP;
        }
    }

    async function enviarAviso(ev) {
        ev.preventDefault();
        const texto = $("av-texto").value.trim();
        if (!texto) { avisar("Escribe el mensaje.", true); return; }
        const para = $("av-para").value;
        const act = asignaciones.filter(activa);
        const destinos = para === "todos" ? unicosPorPersona(act) : para.startsWith("t:") ? unicosPorPersona(act.filter((a) => a.tnr === para.slice(2))) : act.filter((a) => a.id === para.slice(2));
        if (!destinos.length) { avisar("No hay ningún árbitro con enlace activo para ese aviso.", true); return; }
        $("av-enviar").disabled = true;
        const { error } = await sb.from("centroamericano_avisos").insert(destinos.map((a) => ({ de: "organizacion", asignacion_id: a.id, texto })));
        $("av-enviar").disabled = false;
        if (error) { avisar("No se pudo enviar: " + error.message, true); return; }
        $("av-texto").value = "";
        avisar("Aviso enviado a " + destinos.length + (destinos.length === 1 ? " árbitro." : " árbitros."));
        await cargarAvisos();
    }

    // ------------------------------------------------------------- 5. la clave del grupo

    async function cargarTorneos() {
        const { data, error } = await sb.from("centroamericano_torneos").select("tnr, nombre, categoria, rama, orden, sid_en_boveda, clave_puesta, acceso_tnr, prueba").order("orden");
        if (error) { avisar("No se pudieron leer los torneos: " + error.message, true); return; }
        pruebas = new Set((data || []).filter((t) => t.prueba).map((t) => t.tnr));
        torneos = (data || []).filter((t) => dentro(t.tnr));
        pintarTorneos();
        const opciones = () => torneos.map((t) => el("option", { value: t.tnr, texto: t.nombre + (t.sid_en_boveda ? "" : " (sin clave)") }));
        for (const id of ["a-torneo", "rp-torneo", "r-torneo", "pl-torneo", "ct-torneo"]) {
            const s = $(id), antes = s.value;
            s.replaceChildren(...(id === "r-torneo" || id === "pl-torneo" || id === "ct-torneo" ? [el("option", { value: "", texto: "Todos los torneos" })] : []), ...opciones());
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

    // ------------------------------------------------------------- 3. árbitros y mesas

    async function cargarAsignaciones() {
        const { data, error } = await sb.from("centroamericano_asignaciones").select("*").range(0, 499);
        if (error) { avisar("No se pudieron leer los enlaces: " + error.message, true); return; }
        asignaciones = (data || []).filter((a) => dentro(a.tnr));
        pintarAsignaciones();
        pintarDestinos();
        firmaRonda = "";
        pintarRonda();
        pintarEstadoGeneral();
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

    // El QR siempre lleva la marca de Ajedrez Integral al centro.
    const qrDe = (a, enlace) => (window.QrSvg ? window.QrSvg.dibujar(enlace, "QR del enlace de " + a.arbitro, { marca: true }) : null);

    function verQr(a) {
        const enlace = C.enlaceArbitro(location.origin, a.token);
        const torneo = nombreTorneo(a.tnr);
        const wa = "https://wa.me/?text=" + encodeURIComponent(C.textoWhatsapp(a, torneo, enlace));
        const qr = qrDe(a, enlace);
        ventanita("Enlace de " + a.arbitro,
            el("p", { class: "font-bold", texto: torneo + " · mesas " + a.mesa_desde + " a " + a.mesa_hasta }),
            qr ? el("div", { class: "cam-qr cam-qr-grande" }, qr) : null,
            el("p", { class: "text-sm", texto: textoEstado(a) }),
            el("div", { class: "cam-acciones" },
                el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "copiar", onclick: () => copiar(enlace) }, "Copiar el enlace"),
                el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: wa, target: "_blank", rel: "noopener", "data-accion": "whatsapp" }, "Mandar por WhatsApp"),
                el("a", { class: "cam-btn cam-btn-claro cam-btn-chico", href: enlace, target: "_blank", rel: "noopener", "data-accion": "abrir" }, "Abrir")));
    }

    function filaAsignacion(a) {
        const est = C.estadoAsignacion(a, new Date());
        const linea = C.enLinea(a, new Date());
        const boton = (accion, texto, fn, extra) => el("button", { type: "button", class: "cam-btn cam-btn-chico " + (extra || "cam-btn-claro"), "data-accion": accion, onclick: fn }, texto);
        return el("tr", { class: "cam-asignacion", "data-estado": est, "data-id": a.id, "data-nombrado": a.nombrado === false ? "no" : "si" },
            el("td", {}, el("strong", { texto: a.arbitro }), a.nombrado === false ? el("span", { class: "cam-chip cam-chip-al-lado", "data-clave": "neutro", texto: "Por definir" }) : null,
                otrosEnlaces(a).length ? el("span", { class: "cam-tambien", texto: "También en: " + otrosEnlaces(a).map((x) => nombreTorneo(x.tnr) + " (mesas " + x.mesa_desde + " a " + x.mesa_hasta + ")").join("; ") }) : null),
            el("td", { texto: a.mesa_desde + " a " + a.mesa_hasta }),
            el("td", { texto: textoEstado(a) }),
            el("td", { class: "cam-conectado", "data-en-linea": linea ? "si" : "no" }, linea ? "● Conectado ahora" : a.ultimo_uso ? "Visto: " + window.HoraCR.fechaHora(a.ultimo_uso) : "Todavía no ha abierto el enlace",
                el("span", { class: "cam-fallo cam-pedidos-abiertos", "data-pedidos": a.id, hidden: true })),
            el("td", {}, el("div", { class: "cam-acciones cam-acciones-sin-margen" },
                boton("qr", "QR y enlace", () => verQr(a), ""),
                boton("nombre", a.nombrado === false ? "Ponerle nombre" : "Nombre", () => cambiarNombre(a)),
                boton("mesas", "Mesas", () => cambiarMesas(a)),
                est === "activo" ? boton("avisarle", "Avisarle", () => escribirA(a.id)) : null,
                est === "activo" ? boton("otro-torneo", "Otro torneo", () => abrirOtroTorneo(a)) : null,
                boton(a.revocada ? "reactivar" : "apagar", a.revocada ? "Volver a encender" : "Apagar", () => cambiar(a, !a.revocada), a.revocada ? "cam-btn-claro" : "cam-btn-rojo"))));
    }

    const textoPedidos = (n) => "🆘 " + n + (n === 1 ? " aviso abierto" : " avisos abiertos");
    // Lo abierto de cada árbitro se pone al día en su fila, sin repintarla.
    function marcarPedidos() {
        const abiertos = abiertosDeArbitros();
        document.querySelectorAll("[data-pedidos]").forEach((p) => {
            const n = abiertos.filter((f) => f.asignacion_id === p.dataset.pedidos).length;
            p.hidden = n === 0;
            p.textContent = n ? textoPedidos(n) : "";
        });
    }

    function pintarAsignaciones() {
        $("sin-asignaciones").hidden = asignaciones.length > 0;
        const ahora = new Date();
        const firma = JSON.stringify([torneos.map((t) => t.nombre), asignaciones.map((a) => [a.id, a.arbitro, a.nombrado, a.persona, a.mesa_desde, a.mesa_hasta, a.revocada, a.vence, C.enLinea(a, ahora), C.enLinea(a, ahora) ? null : a.ultimo_uso])]);
        if (firma === firmaAsignaciones) return;
        firmaAsignaciones = firma;
        const grupos = new Map();
        for (const t of torneos) grupos.set(t.tnr, []);
        for (const a of asignaciones) { if (!grupos.has(a.tnr)) grupos.set(a.tnr, []); grupos.get(a.tnr).push(a); }
        const filas = [];
        for (const [tnr, lista] of grupos) {
            if (!lista.length) continue;
            lista.sort((x, y) => x.mesa_desde - y.mesa_desde || x.mesa_hasta - y.mesa_hasta || String(x.creada).localeCompare(String(y.creada)));
            filas.push(el("tr", { class: "cam-grupo-torneo", "data-tnr": tnr }, el("th", { colspan: "5", scope: "colgroup", texto: nombreTorneo(tnr) + " — " + lista.length + (lista.length === 1 ? " enlace" : " enlaces") })));
            filas.push(...lista.map(filaAsignacion));
        }
        $("asignaciones").replaceChildren(...filas);
        marcarPedidos();
    }

    // «Otro torneo» de un árbitro que ya tiene enlace: abre el formulario ya con él elegido.
    function abrirOtroTorneo(a) {
        $("nuevo").open = true;
        $("a-persona").value = a.persona ? "p:" + a.persona : "a:" + a.id;
        $("a-torneo").focus();
        $("nuevo").scrollIntoView({ block: "center" });
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
        const q = sb.from("centroamericano_asignaciones").update({ arbitro: nombre, nombrado: true });
        const { error } = await (a.persona ? q.eq("persona", a.persona) : q.eq("id", a.id));
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
        // «Otro torneo del mismo árbitro»: comparte persona (y nombre) con el que ya está.
        const elegida = $("a-persona").value;
        const base = !elegida ? null : elegida.startsWith("p:") ? asignaciones.find((x) => x.persona === elegida.slice(2)) : asignaciones.find((x) => x.id === elegida.slice(2));
        const persona = base ? (base.persona || crypto.randomUUID()) : null;
        const nombrado = base ? base.nombrado !== false : !!escrito;
        const arbitro = base ? base.arbitro : nombrado ? escrito : C.nombrePorDefinir(asignaciones.filter((a) => a.tnr === tnr));
        const vence = C.vencimiento($("a-vence").value, new Date(), window.HoraCR.hoy());
        $("a-crear").disabled = true;
        if (base && !base.persona) {
            const { error: e1 } = await sb.from("centroamericano_asignaciones").update({ persona }).eq("id", base.id);
            if (e1) { $("a-crear").disabled = false; avisar("No se pudo juntar con el otro torneo: " + e1.message, true); return; }
        }
        const { error } = await sb.from("centroamericano_asignaciones").insert(Object.assign({ tnr, arbitro, nombrado, mesa_desde: desde, mesa_hasta: hasta, vence: vence.toISOString() }, persona ? { persona } : {}));
        $("a-crear").disabled = false;
        if (error) { avisar("No se pudo crear el enlace: " + error.message, true); return; }
        $("a-arbitro").value = "";
        $("a-desde").value = "";
        $("a-hasta").value = "";
        $("a-persona").value = "";
        avisar("Enlace creado para " + arbitro + (persona ? " (en otro torneo, junto con los demás de ese árbitro)." : nombrado ? "." : " (por definir)."));
        await cargarAsignaciones();
    }

    // El reparto entre árbitros por definir.
    function vistaReparto() {
        const rangos = C.repartirMesas(entero("rp-mesas") || 0, entero("rp-arbitros") || 0);
        const tnr = $("rp-torneo").value;
        const sig = parseInt(C.nombrePorDefinir(asignaciones.filter((a) => a.tnr === tnr)).replace(/\D+/g, ""), 10);
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
        const n = parseInt(C.nombrePorDefinir(asignaciones.filter((a) => a.tnr === tnr)).replace(/\D+/g, ""), 10);
        $("rp-crear").disabled = true;
        const { error } = await sb.from("centroamericano_asignaciones").insert(rangos.map((r, i) => ({ tnr, arbitro: "Árbitro " + (n + i), nombrado: false, mesa_desde: r.desde, mesa_hasta: r.hasta, vence })));
        if (error) { $("rp-crear").disabled = false; avisar("No se pudieron crear los enlaces: " + error.message, true); return; }
        avisar("Se crearon " + rangos.length + " enlaces por definir.");
        $("rp-mesas").value = "";
        $("rp-arbitros").value = "";
        $("rp-vista").textContent = "";
        await cargarAsignaciones();
    }

    // La hoja de QR para imprimir: una tarjeta por árbitro, cada QR con la marca de la academia.
    function imprimirQr() {
        const act = asignaciones.filter(activa).sort((a, b) => (torneos.findIndex((t) => t.tnr === a.tnr) - torneos.findIndex((t) => t.tnr === b.tnr)) || a.mesa_desde - b.mesa_desde);
        if (!act.length) { avisar("No hay enlaces activos para imprimir.", true); return; }
        $("hoja-qr").replaceChildren(...act.map((a) => {
            const qr = qrDe(a, C.enlaceArbitro(location.origin, a.token));
            return el("article", { class: "cam-hoja-tarjeta" },
                el("h3", { texto: a.arbitro }),
                el("p", { texto: nombreTorneo(a.tnr) + " · mesas " + a.mesa_desde + " a " + a.mesa_hasta }),
                qr ? el("div", { class: "cam-qr cam-qr-grande" }, qr) : null,
                el("p", { class: "cam-hoja-pie" }, el("img", { src: "img/app/icon-192.png", width: "20", height: "20", alt: "" }), " Ajedrez Integral · Centroamericano 2026"),
                el("p", { class: "cam-hoja-nota", texto: "Escanea con la cámara del celular o la tablet. Vence el " + window.HoraCR.fechaHora(a.vence) + "." }));
        }));
        document.body.classList.add("cam-imprime-qr");
        window.addEventListener("afterprint", () => document.body.classList.remove("cam-imprime-qr"), { once: true });
        window.print();
    }

    // ------------------------------------------------------------- control de tiempos

    async function cargarTiempos() {
        const { data, error } = await sb.from("centroamericano_tiempos").select("*").order("ocurrio", { ascending: false }).range(0, 999);
        if (error) { avisar("No se pudieron leer las lecturas: " + error.message, true); return; }
        tiempos = (data || []).filter((x) => dentro(x.tnr));
        pintarTiempos();
    }

    function lecturasVisibles() {
        const tnr = $("ct-torneo").value;
        const lista = tiempos.filter((f) => !tnr || f.tnr === tnr);
        return $("ct-ultimas").checked ? C.ultimasLecturas(lista) : lista.slice().sort((a, b) => a.tnr.localeCompare(b.tnr) || a.mesa - b.mesa || String(b.ocurrio).localeCompare(String(a.ocurrio)));
    }

    // «45:10 · 23 jugadas»; en las lecturas viejas (una sola «jugada») va en las blancas.
    function textoLado(f, color) {
        const seg = color === "blancas" ? f.t_blancas : f.t_negras, j = color === "blancas" ? f.j_blancas : f.j_negras;
        return C.formatoTiempo(seg) + (j != null ? " · " + j + (j === 1 ? " jugada" : " jugadas") : color === "blancas" && f.j_negras == null ? " · jugada " + f.jugada : "");
    }

    function pintarTiempos() {
        const lista = lecturasVisibles();
        $("tiempos").replaceChildren(...lista.map((f) => el("tr", { "data-mesa": String(f.mesa) },
            el("td", { texto: nombreTorneo(f.tnr) }), el("td", { texto: String(f.ronda) }), el("td", { texto: String(f.mesa) }), el("td", { texto: f.blancas + " vs " + f.negras }),
            el("td", { class: "cam-tiempo", texto: textoLado(f, "blancas") }), el("td", { class: "cam-tiempo", texto: textoLado(f, "negras") }),
            el("td", { texto: f.arbitro }), el("td", { texto: window.HoraCR.fechaHora(f.ocurrio) }))));
        $("tiempos-vacio").hidden = lista.length > 0;
        $("ct-pdf").disabled = lista.length === 0;
    }

    async function pedirTiempos() {
        const para = $("ct-para").value;
        const act = asignaciones.filter(activa);
        const destinos = para === "todos" ? unicosPorPersona(act) : para.startsWith("t:") ? unicosPorPersona(act.filter((a) => a.tnr === para.slice(2))) : act.filter((a) => a.id === para.slice(2));
        if (!destinos.length) { avisar("No hay ningún árbitro con enlace activo.", true); return; }
        const texto = "Control de tiempos: anota la jugada y los relojes de las mesas que no han terminado.";
        $("ct-pedir").disabled = true;
        const { error } = await sb.from("centroamericano_avisos").insert(destinos.map((a) => ({ de: "organizacion", asignacion_id: a.id, texto, control_tiempos: true })));
        $("ct-pedir").disabled = false;
        if (error) { avisar("No se pudo pedir: " + error.message, true); return; }
        avisar("Control de tiempos pedido a " + destinos.length + (destinos.length === 1 ? " árbitro." : " árbitros."));
        await cargarAvisos();
    }

    async function tiemposPdf() {
        const lista = lecturasVisibles();
        const doc = {
            titulo: "Control de tiempos del Centroamericano 2026",
            subtitulo: window.HoraCR.fechaHora(new Date()),
            pie: "Centroamericano 2026 · ajedrez-integral.com",
            bloques: [{ tipo: "tabla", encabezados: ["Torneo", "Mesa", "Partida", "Blancas (tiempo · jugadas)", "Negras (tiempo · jugadas)", "Árbitro", "Hora"], anchos: [1.6, 0.6, 3, 1.7, 1.7, 1.5, 1.5],
                filas: lista.map((f) => [nombreTorneo(f.tnr), String(f.mesa), f.blancas + " vs " + f.negras, textoLado(f, "blancas"), textoLado(f, "negras"), f.arbitro, window.HoraCR.fechaHora(f.ocurrio)]) }],
            fotos: [],
        };
        await descargarPdf(doc, "control-de-tiempos-centroamericano-2026.pdf");
    }

    // ------------------------------------------------------------- 4. planillas y Drive

    async function cargarDrive() {
        try { drive = await invocar({ action: "drive_estado" }); } catch (e) { drive = null; }
        const t = $("drive-estado");
        if (drive) {
            t.dataset.estado = drive.conectado ? "si" : "no";
            t.textContent = drive.conectado
                ? "☁️ Drive conectado. " + (drive.pendientes ? drive.pendientes + " planillas todavía no llegaron al Drive (están a salvo aquí): toca «Mandar al Drive las que faltan»." : "Todas las planillas subidas están en el Drive.")
                : "☁️ El Drive todavía no está conectado: las fotos se guardan aquí, a salvo, y pasan al Drive cuando lo conectes. Abajo está cómo.";
            $("respaldo-estado").textContent = drive.conectado ? "La copia también va al Drive cada 10 minutos" + (drive.ultima_copia ? " (la última, " + C.hace(drive.ultima_copia, new Date()) + ")." : ".") : "El Drive no está conectado: las copias quedan solo en la base (y las que bajes tú).";
            $("respaldo-estado").dataset.estado = drive.conectado ? "si" : "no";
        }
        pintarEstadoGeneral();
    }

    async function conectarDrive() {
        const url = $("drive-url").value.trim(), secreto = $("drive-secreto").value.trim();
        const t = $("drive-conectar-estado");
        t.textContent = "Probando el Drive…";
        $("drive-conectar").disabled = true;
        try {
            const d = await invocar({ action: "drive_conectar", url, secreto });
            $("drive-secreto").value = "";
            $("drive-url").value = "";
            t.textContent = "✓ Conectado. Carpeta: «" + d.carpeta + "».";
            t.className = "cam-guardado text-sm mt-2";
            await cargarDrive();
        } catch (e) {
            t.textContent = "✗ " + e.message;
            t.className = "cam-fallo text-sm mt-2";
        } finally {
            $("drive-conectar").disabled = false;
        }
    }

    async function reintentarDrive() {
        const b = $("drive-reintentar");
        b.disabled = true;
        try {
            const d = await invocar({ action: "drive_reintentar" });
            avisar("Enviadas al Drive: " + d.enviadas + (d.fallaron ? ". No se pudieron: " + d.fallaron : "") + (d.quedan ? ". Quedan " + d.quedan + "." : "."), !!d.fallaron);
            await Promise.all([cargarPlanillas(), cargarDrive()]);
        } catch (e) {
            avisar(e.message, true);
        } finally {
            b.disabled = false;
        }
    }

    async function cargarPlanillas() {
        const { data, error } = await sb.from("centroamericano_planillas").select("*").order("subida", { ascending: false }).range(0, 999);
        if (error) { avisar("No se pudieron leer las planillas: " + error.message, true); return; }
        planillas = (data || []).filter((x) => dentro(x.tnr));
        pintarPlanillas();
    }

    function pintarPlanillas() {
        const tnr = $("pl-torneo").value, actual = $("pl-ronda").value;
        const rondas = [...new Set(planillas.map((p) => p.ronda))].sort((a, b) => a - b);
        $("pl-ronda").replaceChildren(el("option", { value: "", texto: "Todas" }), ...rondas.map((r) => el("option", { value: String(r), texto: "Ronda " + r })));
        $("pl-ronda").value = actual;
        const ronda = $("pl-ronda").value;
        const lista = planillas.filter((p) => (!tnr || p.tnr === tnr) && (!ronda || String(p.ronda) === ronda))
            .sort((a, b) => a.tnr.localeCompare(b.tnr) || a.ronda - b.ronda || a.mesa - b.mesa || a.lado.localeCompare(b.lado));
        $("planillas").replaceChildren(...lista.map((p) => el("tr", { "data-drive": p.drive_ok ? "si" : "no" },
            el("td", { texto: nombreTorneo(p.tnr) }), el("td", { texto: String(p.ronda) }), el("td", { texto: String(p.mesa) }),
            el("td", { texto: (p.lado === "blancas" ? p.jugador + " vs " + p.rival : p.rival + " vs " + p.jugador) }),
            el("td", { texto: p.arbitro }), el("td", { texto: window.HoraCR.fechaHora(p.subida) }),
            el("td", { texto: p.drive_ok ? "✓ En el Drive" : p.drive_error ? "✗ " + p.drive_error : "Pendiente" }),
            el("td", {}, el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "ver-foto", onclick: () => verFoto(p) }, "Ver")))));
        $("planillas-vacio").hidden = lista.length > 0;
    }

    async function verFoto(p) {
        const { data, error } = await sb.storage.from("centroamericano-planillas").createSignedUrl(p.ruta, 120);
        if (error || !data) { avisar("No se pudo abrir la foto: " + (error ? error.message : ""), true); return; }
        const enfrentamiento = p.lado === "blancas" ? p.jugador + " vs " + p.rival : p.rival + " vs " + p.jugador;
        ventanita("Mesa " + p.mesa + " · " + enfrentamiento,
            el("img", { src: data.signedUrl, alt: "Foto de las dos planillas de la mesa " + p.mesa + ": " + enfrentamiento, class: "cam-foto-planilla" }));
    }

    // ------------------------------------------------------------- 6. respaldo

    async function cargarCopias() {
        const { data, error } = await sb.from("centroamericano_copias").select("anillo, ranura, creada, huella, resumen").order("creada", { ascending: false }).range(0, 199);
        if (error) { avisar("No se pudieron leer las copias: " + error.message, true); return; }
        copias = data || [];
        pintarCopias();
        pintarEstadoGeneral();
    }

    const NOMBRE_ANILLO = { a: "Automática (5 min)", b: "Automática (cada hora)", m: "A pedido" };

    function pintarCopias() {
        const lista = copias.filter((c) => c.anillo !== "d").slice(0, 40);
        $("copias-vacio").hidden = lista.length > 0;
        $("copias").replaceChildren(...lista.map((c) => el("tr", { "data-anillo": c.anillo },
            el("td", { texto: window.HoraCR.fechaHora(c.creada) }), el("td", { texto: NOMBRE_ANILLO[c.anillo] || c.anillo }),
            el("td", { texto: String((c.resumen || {}).asignaciones ?? "") }), el("td", { texto: String((c.resumen || {}).registro ?? "") }),
            el("td", { texto: String((c.resumen || {}).avisos ?? "") }), el("td", { texto: String((c.resumen || {}).planillas ?? "") }),
            el("td", {}, el("div", { class: "cam-acciones cam-acciones-sin-margen" },
                el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "bajar-copia", onclick: () => bajarCopia(c) }, "Bajar"),
                el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "restaurar-copia", onclick: () => restaurarCopia(c) }, "Restaurar"))))));
    }

    // copia-centroamericano-2026-AAAA-MM-DD-HHMM.json, en hora de Costa Rica.
    function nombreArchivoCopia(fecha) {
        const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(fecha));
        const g = (t) => (p.find((x) => x.type === t) || { value: "" }).value;
        return "copia-centroamericano-2026-" + g("year") + "-" + g("month") + "-" + g("day") + "-" + g("hour") + g("minute") + ".json";
    }

    function bajarJson(copia, fecha) {
        descargar(new Blob([JSON.stringify(copia)], { type: "application/json" }), nombreArchivoCopia(fecha || copia.creada));
    }

    async function copiaAhora() {
        $("copia-ahora").disabled = true;
        try {
            const { data, error } = await sb.rpc("centroamericano_copia_manual");
            if (error || !data) throw new Error(error ? error.message : "No se pudo hacer la copia.");
            bajarJson(data);
            avisar("Copia hecha: " + data.asignaciones.length + " enlaces, " + data.registro.length + " anotaciones. Guárdala en un lugar seguro.");
            await cargarCopias();
        } catch (e) {
            avisar(e.message, true);
        } finally {
            $("copia-ahora").disabled = false;
        }
    }

    async function bajarCopia(c) {
        const { data, error } = await sb.from("centroamericano_copias").select("contenido").eq("anillo", c.anillo).eq("ranura", c.ranura).maybeSingle();
        if (error || !data || !data.contenido) { avisar("No se pudo bajar esa copia.", true); return; }
        bajarJson(data.contenido, c.creada);
    }

    async function restaurarDe(copia, origen) {
        if (!copia || copia.version !== 1 || copia.evento !== "Centroamericano 2026") { avisar("Ese archivo no es una copia del Centroamericano 2026.", true); return; }
        const sigue = await Avisos.confirmar("Vas a restaurar " + origen + ": " + (copia.asignaciones || []).length + " enlaces, " + (copia.registro || []).length + " anotaciones, " + (copia.avisos || []).length + " avisos y " + (copia.planillas || []).length + " planillas. Solo se agrega lo que falta: lo que ya está no se toca. Los enlaces conservan su mismo QR.", { titulo: "Restaurar la copia", aceptar: "Sí, restaurar" });
        if (!sigue) return;
        const { data, error } = await sb.rpc("centroamericano_restaurar", { p_copia: copia });
        if (error) { avisar("No se pudo restaurar: " + error.message, true); return; }
        avisar("Restaurado. Se agregaron " + data.asignaciones + " enlaces, " + data.registro + " anotaciones, " + data.avisos + " avisos, " + data.planillas + " planillas, " + (data.presencia || 0) + " marcas de presencia y " + (data.tiempos || 0) + " lecturas de tiempos.");
        await Promise.all([cargarAsignaciones(), cargarAvisos(), cargarPlanillas(), cargarRegistro()]);
    }

    async function restaurarCopia(c) {
        const { data, error } = await sb.from("centroamericano_copias").select("contenido").eq("anillo", c.anillo).eq("ranura", c.ranura).maybeSingle();
        if (error || !data || !data.contenido) { avisar("No se pudo leer esa copia.", true); return; }
        await restaurarDe(data.contenido, "la copia de " + window.HoraCR.fechaHora(c.creada));
    }

    async function restaurarArchivo() {
        const f = $("copia-archivo").files && $("copia-archivo").files[0];
        $("copia-archivo").value = "";
        if (!f) return;
        let copia;
        try { copia = JSON.parse(await f.text()); } catch (e) { avisar("Ese archivo no se pudo leer.", true); return; }
        await restaurarDe(copia, "el archivo «" + f.name + "»");
    }

    // ------------------------------------------------------------- 7. lo que anotan

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
        registro = todas.filter((x) => dentro(x.tnr));
        pintarRegistro();
        $("r-estado").textContent = "Actualizado a las " + ahoraTxt();
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
        await descargarPdf(doc, "registro-arbitros-centroamericano-2026" + (tnr ? "-" + tnr : "") + ".pdf");
    }

    // El informe final: por ronda, cuántos resultados, ilegales, irregularidades, incidencias y controles de tiempos hubo, el detalle de
    // lo que pasó en las mesas, quién no llegó, cuántas planillas quedaron y qué árbitro finalizó cada ronda. Con los datos que ya
    // tiene la página (el registro del torneo elegido); no inventa nada.
    async function informeFinalPdf() {
        const tnr = $("r-torneo").value;
        $("r-informe").disabled = true;
        try {
            await Promise.all([cargarRegistro(), cargarPlanillas(), cargarTiempos()]);
            const deTorneo = (x) => !tnr || x.tnr === tnr;
            const anuladas = new Set(registro.filter((f) => f.tipo === "anulacion" && f.anula).map((f) => f.anula));
            const reg = registro.filter((f) => f.tipo !== "anulacion" && !anuladas.has(f.id)).slice().sort((a, b) => String(a.ocurrio).localeCompare(String(b.ocurrio)));
            const rondas = [...new Set([...reg.map((f) => f.ronda), ...tiempos.filter(deTorneo).map((t) => t.ronda), ...planillas.filter(deTorneo).map((x) => x.ronda), ...finales.map((f) => f.ronda)])].filter((r) => r != null).sort((a, b) => a - b);
            const cuenta = (r, t) => reg.filter((f) => f.ronda === r && f.tipo === t).length;
            const hora = (x) => window.HoraCR.fechaHora(x);
            const b = [];
            b.push({ tipo: "titulo", texto: "Resumen por ronda" });
            b.push(rondas.length
                ? { tipo: "tabla", encabezados: ["Ronda", "Resultados", "Correcciones", "Ilegales", "Irregularidades", "Incidencias", "Controles de tiempos", "Planillas"], anchos: [0.9, 1.3, 1.4, 1.1, 1.5, 1.3, 1.6, 1.2],
                    filas: rondas.map((r) => [String(r), String(cuenta(r, "resultado")), String(cuenta(r, "correccion")), String(cuenta(r, "ilegal")), String(cuenta(r, "irregularidad")), String(cuenta(r, "incidencia")), String(tiempos.filter((t) => deTorneo(t) && t.ronda === r).length), String(planillas.filter((x) => deTorneo(x) && x.ronda === r).length)]) }
                : { tipo: "parrafo", texto: "Todavía no hay nada anotado." });
            const casos = reg.filter((f) => ["ilegal", "irregularidad", "incidencia"].includes(f.tipo));
            b.push({ tipo: "titulo", texto: "Jugadas ilegales, irregularidades e incidencias" });
            b.push(casos.length
                ? { tipo: "tabla", encabezados: ["Hora (Costa Rica)", "Ronda", "Mesa", "Tipo", "Detalle", "Art.", "Árbitro"], anchos: [2, 0.7, 0.7, 1.3, 3.6, 0.8, 1.6],
                    filas: casos.map((f) => [hora(f.ocurrio), String(f.ronda), String(f.mesa), M.TIPOS[f.tipo] || f.tipo, M.detalle ? M.detalle(f) : (f.jugador + (f.texto ? ": " + f.texto : "")), f.articulo || "", f.arbitro]) }
                : { tipo: "parrafo", texto: "No se anotó ninguna." });
            const ausentes = presencia.filter((x) => deTorneo(x) && !x.presente).sort((a, b2) => a.ronda - b2.ronda || a.mesa - b2.mesa);
            b.push({ tipo: "titulo", texto: "Jugadores marcados como «no ha llegado»" });
            b.push(ausentes.length
                ? { tipo: "tabla", encabezados: ["Ronda", "Mesa", "Jugador", "Color", "Marcado"], anchos: [0.8, 0.8, 4.2, 1.1, 2],
                    filas: ausentes.map((x) => [String(x.ronda), String(x.mesa), x.jugador, x.color === "negras" ? "Negras" : "Blancas", hora(x.marcada)]) }
                : { tipo: "parrafo", texto: "Ninguno quedó marcado como ausente." });
            const fin = finales.filter((f) => !f.reabierta).sort((a, b2) => a.ronda - b2.ronda || String(a.finalizada_en).localeCompare(String(b2.finalizada_en)));
            b.push({ tipo: "titulo", texto: "Rondas finalizadas por cada árbitro" });
            b.push(fin.length
                ? { tipo: "lista", items: fin.map((f) => "Ronda " + f.ronda + ": " + nombreAsig(f.asignacion_id) + " finalizó a las " + hora(f.finalizada_en) + ".") }
                : { tipo: "parrafo", texto: "Ningún árbitro ha finalizado una ronda." });
            const sinDrive = planillas.filter((x) => deTorneo(x) && !x.drive_ok).length;
            b.push({ tipo: "titulo", texto: "Planillas" });
            b.push({ tipo: "parrafo", texto: planillas.filter(deTorneo).length + " fotos de planillas guardadas" + (sinDrive ? ", " + sinDrive + " todavía sin pasar al Drive." : ", todas ya en el Drive.") });
            const doc = {
                titulo: "Informe final de los árbitros",
                subtitulo: (tnr ? nombreTorneo(tnr) : "Centroamericano 2026 (todos los torneos)") + " · " + hora(new Date()),
                pie: "Centroamericano 2026 · ajedrez-integral.com",
                bloques: b, fotos: [],
            };
            await descargarPdf(doc, "informe-final-arbitros-centroamericano-2026" + (tnr ? "-" + tnr : "") + ".pdf");
        } catch (e) {
            avisar("No se pudo armar el informe: " + (e.message || e), true);
        } finally { $("r-informe").disabled = false; }
    }

    // ------------------------------------------------------------- arranque

    // Cada 6 s se miran los avisos y el avance (es lo urgente); los enlaces cada 18 s (quién está
    // conectado), el Drive y las copias cada minuto, y el registro cada 30 s si está a la vista.
    // El interruptor «Modo ensayo»: cambia lo que se ve (reales o de prueba) y vuelve a leer todo.
    async function cambiarModo() {
        ensayo = $("modo-ensayo").checked;
        $("aviso-ensayo").hidden = !ensayo;
        ponerTitulo();
        await cargarTorneos();
        await cargarAsignaciones();
        await Promise.all([cargarAvisos(), cargarTiempos(), cargarPlanillas(), cargarRegistro()]);
        avisar(ensayo ? "Modo ensayo: ves solo los torneos de prueba." : "Volviste a los torneos reales.");
    }

    async function pulso() {
        if (document.hidden) return;
        tic++;
        const tareas = [cargarAvisos()];
        if (tic % 3 === 0) tareas.push(cargarAsignaciones());
        if (tic % 5 === 0 && !$("panel-registro").hidden) tareas.push(cargarRegistro());
        if (tic % 10 === 0) tareas.push(cargarCopias(), cargarDrive());
        if (tic % 5 === 0 && !$("panel-planillas").hidden) tareas.push(cargarPlanillas());
        if (tic % 3 === 0 && !$("panel-tiempos").hidden) tareas.push(cargarTiempos());
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
        $("form-aviso").addEventListener("submit", enviarAviso);
        $("resumen-actualizar").addEventListener("click", actualizarResumen);
        $("resumen-pdf").addEventListener("click", reportePdf);
        $("resumen-hojas").addEventListener("click", hojasPapelPdf);
        $("modo-ensayo").addEventListener("change", cambiarModo);
        $("g-guardar").addEventListener("click", guardarGrupo);
        $("claves-bloque-guardar").addEventListener("click", guardarBloque);
        $("form-asignar").addEventListener("submit", crear);
        $("abrir-nuevo").addEventListener("click", () => { $("nuevo").open = true; $("a-arbitro").focus(); });
        $("abrir-reparto").addEventListener("click", () => { $("reparto").open = true; $("rp-mesas").focus(); });
        for (const id of ["rp-mesas", "rp-arbitros"]) $(id).addEventListener("input", vistaReparto);
        $("rp-torneo").addEventListener("change", vistaReparto);
        $("rp-leer").addEventListener("click", leerMesas);
        $("rp-crear").addEventListener("click", repartir);
        $("imprimir-qr").addEventListener("click", imprimirQr);
        $("ct-pedir").addEventListener("click", pedirTiempos);
        $("ct-pdf").addEventListener("click", tiemposPdf);
        $("ct-torneo").addEventListener("change", pintarTiempos);
        $("ct-ultimas").addEventListener("change", pintarTiempos);
        $("pl-actualizar").addEventListener("click", () => { cargarPlanillas(); cargarDrive(); });
        $("pl-torneo").addEventListener("change", pintarPlanillas);
        $("pl-ronda").addEventListener("change", pintarPlanillas);
        $("drive-conectar").addEventListener("click", conectarDrive);
        $("drive-reintentar").addEventListener("click", reintentarDrive);
        $("copia-ahora").addEventListener("click", copiaAhora);
        $("copia-restaurar").addEventListener("click", () => $("copia-archivo").click());
        $("copia-archivo").addEventListener("change", restaurarArchivo);
        $("r-actualizar").addEventListener("click", cargarRegistro);
        $("r-torneo").addEventListener("change", cargarRegistro);
        $("r-tipo").addEventListener("change", pintarRegistro);
        $("r-pdf").addEventListener("click", bajarPdf);
        $("r-informe").addEventListener("click", informeFinalPdf);
        await cargarTorneos();
        await cargarAsignaciones();
        await Promise.all([cargarAvisos(), cargarCopias(), cargarDrive()]);
        // Sin clave todavía: lo primero que hay que hacer es ponerla.
        const hash = location.hash.replace("#", "");
        abrirPanel(PANELES.includes(hash) ? hash : torneos.some((t) => t.sid_en_boveda) ? "ronda" : "claves");
        setInterval(pulso, TIC_MS);
        setInterval(() => { if (rondaDeFaltan) pintarFaltan(rondaDeFaltan); }, 15000); // el tiempo de espera corre solo
    }

    init().catch((e) => { $("cargando").hidden = true; avisar("No se pudo abrir la página: " + (e.message || e), true); });
})();
