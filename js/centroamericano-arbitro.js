/* El código de centroamericano-arbitro.html: «Mis mesas» de un árbitro del
   Centroamericano 2026, hecho para una TABLET (también sirve en el celular).

   El árbitro entra con el enlace (QR) que le dio la organización, SIN CUENTA: el
   token va en lo que sigue al «#» de la dirección (así no viaja en las visitas ni
   se guarda en los registros del servidor) y se lo manda a la Edge Function
   centroamericano-mesa, que valida el token, hace cumplir el rango de mesas y
   escribe el registro. Esta página solo pinta y pide: ningún permiso depende de
   ella.

   Cada mesa es una tarjeta con su «Guardar» al lado del resultado que se cambia, y
   cada jugador lleva sus botones «Ilegal» e «Irregularidad». Las ilegales se
   cuentan por partida: a la primera, 2 minutos más para el rival; a la segunda,
   pierde (art. 7.5.5), y la página solo avisa: el árbitro decide y guarda el
   resultado. Un toque por error se deshace con «Anular».

   Hablar con la organización: «Pedir al árbitro principal» (general o en una mesa)
   le llega como aviso a la cuenta principal; lo que la organización le manda sale
   arriba, pegado, con sonido y vibración, hasta que toca «Entendido». Los avisos
   van por la base, no por chess-results: llegan cada pocos segundos aunque
   chess-results esté caído. Un enlace «por definir» pide el nombre una sola vez. La
   pantalla de la tablet se mantiene encendida (Wake Lock, si el aparato lo tiene).

   Todo texto que viene de chess-results o de la gente va por textContent.
   Ver «Mesas de los árbitros del Centroamericano» y «Avisos y árbitros por
   definir» en docs/decisiones/juegos-y-torneos.md. */
(function () {
    "use strict";
    const C = window.CentroamericanoMesas;
    const M = window.MesaArbitro;
    const $ = (id) => document.getElementById(id);
    const avisar = (texto, error) => Avisos.avisar(texto, { tipo: error ? "error" : "ok" });
    const REFRESCO_MS = 45000; // las mesas (hablan con chess-results)
    const AVISOS_MS = 8000; // los avisos (solo la base: liviano)

    let estado = null; // lo que contestó «leer»
    let elegido = {}; // mesa → resultado elegido, todavía sin guardar
    let subiendo = new Set();
    let revisadas = {};
    let ocupadas = new Set(); // mesas que se están guardando o anotando
    let mensajes = {}; // mesa → { ok, texto } de lo último que pasó ahí
    let anuladas = new Set();
    let leyendo = false;
    let avisosVivo = true; // se apaga si el enlace ya no sirve
    let nombrado = true;
    let pendientes = []; // mensajes de la organización sin leer
    let vistosMensajes = new Set(); // los que ya sonaron
    let ayuda = null; // el último pedido de ayuda (abierto o recién atendido)
    let abiertas = []; // mesas (o null = general) con un pedido abierto
    let audio = null;
    let bloqueo = null;

    const token = () => (location.hash || "").replace(/^#(t=)?/, "").trim();

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
    async function invocar(accion, cuerpo) {
        let { data, error } = await sb.functions.invoke("centroamericano-mesa", { body: Object.assign({ action: accion, token: token() }, cuerpo || {}) });
        let estadoHttp = error && error.context && error.context.status;
        if (error && error.context && typeof error.context.json === "function") {
            try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (!data || data.error) {
            const e = new Error((data && data.error) || (error && error.message) || "No hubo respuesta. Revisa tu conexión.");
            e.http = estadoHttp;
            throw e;
        }
        return data;
    }

    const clave = (mesa, color) => mesa + "|" + color;
    const marcaDe = (mesa, color) => (estado.marcas || {})[clave(mesa, color)] || { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null };
    const nombreDe = (m, color) => (color === "blancas" ? m.blancas : m.negras);
    const hora = (x) => window.HoraCR.hora(x);

    // ------------------------------------------------------------- sonido, vibración y pantalla encendida

    // El navegador solo deja sonar después de un toque: se prepara en el primero.
    function prepararAudio() {
        if (audio) return;
        try { const A = window.AudioContext || window.webkitAudioContext; if (A) audio = new A(); } catch (e) { audio = null; }
    }
    function pitar() {
        try {
            if (!audio) return;
            if (audio.state === "suspended") audio.resume();
            [0, 0.28].forEach((t) => {
                const o = audio.createOscillator(), g = audio.createGain();
                o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.25;
                o.connect(g); g.connect(audio.destination);
                o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
            });
        } catch (e) { /* sin sonido */ }
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* sin vibración */ }
    }
    async function mantenerEncendida() {
        try {
            if (!("wakeLock" in navigator) || document.hidden) return;
            bloqueo = await navigator.wakeLock.request("screen");
            bloqueo.addEventListener("release", () => { bloqueo = null; });
        } catch (e) { bloqueo = null; /* sin pantalla encendida: no pasa nada */ }
    }

    // ------------------------------------------------------------- pintar

    function textoEstado(m, est) {
        if (est === "sin-guardar") return "Sin guardar";
        if (est === "con-resultado") return "Con resultado";
        if (est === "pierde") return "Falta el resultado";
        return "Sin resultado";
    }

    function bloqueJugador(m, color) {
        const k = marcaDe(m.mesa, color);
        const nombre = nombreDe(m, color);
        const ocupada = ocupadas.has(m.mesa);
        const marcas = el("div", { class: "cam-marcas" });
        if (k.ilegales) marcas.append(el("span", { class: "cam-marca", "data-tipo": "ilegal" }, el("span", { "aria-hidden": "true", texto: C.marcasTexto({ ilegales: k.ilegales }) }), "Ilegal" + (k.ilegales > 1 ? " ×" + k.ilegales : "")));
        if (k.irregularidades) marcas.append(el("span", { class: "cam-marca", "data-tipo": "irregularidad" }, el("span", { "aria-hidden": "true", texto: C.marcasTexto({ irregularidades: k.irregularidades }) }), "Irregularidad" + (k.irregularidades > 1 ? " ×" + k.irregularidades : "")));
        const acciones = el("div", { class: "cam-acciones" },
            el("button", { type: "button", class: "cam-btn cam-btn-rojo cam-btn-chico", "data-accion": "ilegal", disabled: ocupada, onclick: () => ilegal(m, color) }, "Ilegal"),
            el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "irregularidad", disabled: ocupada, onclick: () => irregularidad(m, color) }, "Irregularidad"));
        if (k.ultima_ilegal) acciones.append(el("button", { type: "button", class: "cam-anular", "data-accion": "anular-ilegal", disabled: ocupada, onclick: () => anular(m, color, "ilegal", k.ultima_ilegal) }, "Anular la última ilegal"));
        if (k.ultima_irregularidad) acciones.append(el("button", { type: "button", class: "cam-anular", "data-accion": "anular-irregularidad", disabled: ocupada, onclick: () => anular(m, color, "irregularidad", k.ultima_irregularidad) }, "Anular la última irregularidad"));
        return el("div", { class: "cam-jugador", "data-color": color },
            el("div", { class: "cam-jugador-fila" }, el("span", { class: "cam-color", "data-color": color, texto: color === "blancas" ? "Blancas" : "Negras" }), el("span", { class: "cam-nombre", texto: nombre })),
            marcas, acciones);
    }

    // La banda de las ilegales de una mesa, sacada de las marcas (no de un recuerdo de la
    // pantalla): si se recarga la página, sigue ahí.
    function bandas(m) {
        const out = [];
        for (const color of ["blancas", "negras"]) {
            const k = marcaDe(m.mesa, color);
            if (k.ilegales >= 2) {
                const a = C.avisoIlegal(k.ilegales, nombreDe(m, color), color);
                const caja = el("div", { class: "cam-alerta", role: "alert", "data-nivel": "pierde" }, el("strong", { texto: a.titulo + ". " }), a.texto);
                if (m.valor === "0") caja.append(el("div", { class: "cam-acciones" }, el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "poner-pierde", onclick: () => ponerResultado(m, a.resultado) },
                    "Poner el resultado: pierde " + (color === "blancas" ? "las blancas" : "las negras") + " (" + M.textoResultado(a.resultado) + ")")));
                out.push(caja);
            } else if (k.ilegales === 1) {
                const a = C.avisoIlegal(1, nombreDe(m, color), color);
                out.push(el("div", { class: "cam-aviso-suave", "data-nivel": "primera" }, el("strong", { texto: a.titulo + ". " }), a.texto));
            }
        }
        return out;
    }

    function tarjeta(m) {
        const est = C.estadoMesa(m, estado.marcas, elegido[m.mesa]);
        const ocupada = ocupadas.has(m.mesa);
        const msg = mensajes[m.mesa];
        const pedida = abiertas.includes(m.mesa);
        const sel = el("select", {
            id: "res-" + m.mesa, class: "cam-select", "data-mesa": String(m.mesa), "aria-label": "Resultado de la mesa " + m.mesa, disabled: ocupada,
            onchange: (e) => { elegido[m.mesa] = e.target.value; delete mensajes[m.mesa]; pintar(); const n = $("res-" + m.mesa); if (n) n.focus(); },
        }, el("option", { value: "", texto: "— elige el resultado —" }),
            M.RESULTADOS.filter((r) => r.valor !== "0" && !(r.valor === "D" && m.valor === "0")).map((r) => el("option", { value: r.valor, texto: r.texto })));
        sel.value = elegido[m.mesa] || "";
        const pendiente = elegido[m.mesa] != null && elegido[m.mesa] !== "" && elegido[m.mesa] !== m.valor;
        return el("article", { id: "mesa-" + m.mesa, class: "cam-mesa", "data-mesa": String(m.mesa), "data-estado": est, tabindex: "-1", "aria-label": "Mesa " + m.mesa },
            el("div", { class: "cam-mesa-cabeza" }, el("span", { class: "cam-mesa-numero", texto: "Mesa " + m.mesa }),
                el("div", { class: "cam-mesa-cabeza-acciones" },
                    el("button", { type: "button", class: "cam-btn cam-ayuda-mesa", "data-accion": "ayuda", "data-pedida": pedida ? "si" : null, disabled: pedida, "aria-label": pedida ? "Ya pediste ayuda en la mesa " + m.mesa : "Pedir al árbitro principal en la mesa " + m.mesa, onclick: () => pedirAyuda(m.mesa) },
                        el("span", { "aria-hidden": "true", texto: "🆘 " }), pedida ? "Ayuda pedida" : "Ayuda"),
                    el("span", { class: "cam-estado", texto: textoEstado(m, est) }))),
            bandas(m),
            bloqueJugador(m, "blancas"),
            bloqueJugador(m, "negras"),
            el("div", { class: "cam-resultado" },
                el("p", { class: "cam-resultado-actual" }, "En chess-results: ", el("strong", { texto: M.textoResultado(m.valor) })),
                el("div", { class: "cam-resultado-fila" }, sel,
                    el("button", { type: "button", class: "cam-btn", "data-accion": "guardar", disabled: !pendiente || ocupada || !listaCompleta(), title: listaCompleta() ? null : "Primero la revisión previa de la ronda", onclick: () => guardar(m) }, ocupada ? "Guardando…" : "Guardar")),
                msg ? el("p", { class: msg.ok ? "cam-guardado" : "cam-fallo", role: msg.ok ? "status" : "alert", texto: msg.texto }) : null),
            bloquePlanillas(m, ocupada));
    }

    // ------------------------------------------------------------- las planillas (fotos)

    const subidas = () => (estado && estado.planillas) || [];
    const tienePlanilla = (mesa, lado) => subidas().some((x) => x.mesa === mesa && x.lado === lado);

    function bloquePlanillas(m, ocupada) {
        const boton = (lado) => el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "planilla", "data-lado": lado, "data-subida": tienePlanilla(m.mesa, lado) ? "si" : null, disabled: ocupada || subiendo.has(m.mesa + lado),
            "aria-label": (tienePlanilla(m.mesa, lado) ? "Cambiar la foto de la planilla de " : "Subir la foto de la planilla de ") + lado + " de la mesa " + m.mesa, onclick: () => subirPlanilla(m, lado) },
            el("span", { "aria-hidden": "true", texto: "📷 " }), (subiendo.has(m.mesa + lado) ? "Subiendo…" : "Planilla de " + lado), tienePlanilla(m.mesa, lado) ? el("span", { texto: " ✓" }) : null);
        return el("div", { class: "cam-planillas" },
            el("p", { class: "cam-planillas-estado", texto: "Fotos de las planillas: blancas " + (tienePlanilla(m.mesa, "blancas") ? "✓ subida" : "falta") + " · negras " + (tienePlanilla(m.mesa, "negras") ? "✓ subida" : "falta") }),
            el("div", { class: "cam-acciones" }, boton("blancas"), boton("negras")));
    }

    // La foto se achica y se pasa a JPG en el aparato (una planilla legible cabe en ~400 KB):
    // así sube rápido aunque la señal del salón sea mala.
    async function reducir(archivo) {
        const bmp = await createImageBitmap(archivo);
        const lado = Math.max(bmp.width, bmp.height), esc = lado > 1800 ? 1800 / lado : 1;
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * esc);
        c.height = Math.round(bmp.height * esc);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        if (bmp.close) bmp.close();
        const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.82));
        if (!blob) throw new Error("No se pudo preparar la foto.");
        return await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mal(new Error("No se pudo leer la foto.")); r.readAsDataURL(blob); });
    }

    function subirPlanilla(m, lado) {
        const entrada = document.createElement("input");
        entrada.type = "file";
        entrada.accept = "image/*";
        entrada.setAttribute("capture", "environment");
        entrada.addEventListener("change", async () => {
            const archivo = entrada.files && entrada.files[0];
            if (!archivo) return;
            const k = m.mesa + lado;
            subiendo.add(k);
            pintar();
            try {
                const imagen = await reducir(archivo);
                const d = await invocar("planilla", { ronda: estado.ronda, mesa: m.mesa, lado, imagen });
                estado.planillas = subidas().filter((x) => !(x.mesa === m.mesa && x.lado === lado)).concat([{ mesa: m.mesa, lado, subida: d.subida, drive_ok: d.drive === "enviada" }]);
                avisar("Planilla de " + lado + " de la mesa " + m.mesa + " guardada" + (d.drive === "enviada" ? " y ya está en el Drive." : d.drive === "pendiente" ? ". El Drive la recibirá en un rato." : "."));
            } catch (e) {
                avisar(e.message, true);
            } finally {
                subiendo.delete(k);
                pintar();
            }
        });
        entrada.click();
    }

    // ------------------------------------------------------------- antes de iniciar: la lista previa

    // Paso a paso, en este orden. El ritmo es el de las bases del torneo (centroamericano-2026.html:
    // «90 minutos con 30 segundos de incremento por jugada desde el inicio»). Sin los dos pasos
    // aprobados la función no guarda resultados de la ronda.
    const PASOS_LISTA = [
        { id: "relojes", titulo: "Los relojes", texto: "Revisa el reloj de cada una de tus mesas: puesto en 90 minutos para cada jugador, con 30 segundos de incremento por jugada desde el inicio (el ritmo de las bases), con el tiempo programado y listo para que arranque el de las blancas.", boton: "Sí, revisé los relojes de mis mesas" },
        { id: "tableros", titulo: "Los tableros", texto: "Revisa el tablero de cada una de tus mesas: bien orientado (casilla blanca a la derecha de cada jugador), con las 32 piezas y todas bien puestas (la dama en su color, los reyes enfrentados, los peones en su fila).", boton: "Sí, revisé los tableros de mis mesas" },
    ];
    const listaOk = () => ((estado && estado.lista) || []);
    const listaCompleta = () => PASOS_LISTA.every((x) => listaOk().includes(x.id));

    function pintarLista() {
        const caja = $("lista-previa");
        const hay = estado.mesas.length > 0 && !estado.finalizada;
        caja.hidden = !hay || listaCompleta();
        if (caja.hidden) { caja.replaceChildren(); return; }
        const i = PASOS_LISTA.findIndex((x) => !listaOk().includes(x.id));
        const paso = PASOS_LISTA[i];
        caja.replaceChildren(
            el("h2", { id: "lista-titulo", class: "font-bold text-xl", texto: "Antes de iniciar la ronda " + estado.ronda + ": revisión previa (paso " + (i + 1) + " de " + PASOS_LISTA.length + ")" }),
            el("ol", { class: "cam-pasos" }, ...PASOS_LISTA.map((x, j) => el("li", { "data-estado": listaOk().includes(x.id) ? "hecho" : j === i ? "actual" : "pendiente", texto: (listaOk().includes(x.id) ? "✓ " : j === i ? "▶ " : "· ") + x.titulo }))),
            el("p", { class: "mt-2 font-bold", texto: paso.titulo }),
            el("p", { class: "mt-1", texto: paso.texto }),
            el("div", { class: "cam-acciones" }, el("button", { type: "button", id: "aprobar-paso", class: "cam-btn", "data-paso": paso.id, onclick: () => aprobarPaso(paso) }, paso.boton)),
            el("p", { class: "cam-herramientas-nota mt-2", texto: "Hasta aprobar los dos pasos no se pueden guardar resultados de esta ronda." }));
    }

    async function aprobarPaso(paso) {
        $("aprobar-paso").disabled = true;
        try {
            const d = await invocar("lista", { ronda: estado.ronda, paso: paso.id });
            estado.lista = d.lista;
            pintar();
            avisar(listaCompleta() ? "Revisión previa completa: ya puedes guardar resultados." : "Paso aprobado: sigue el siguiente.");
        } catch (e) {
            avisar(e.message, true);
            $("aprobar-paso").disabled = false;
        }
    }

    // ------------------------------------------------------------- terminar: revisar y finalizar

    function pintarRevision() {
        const caja = $("revision");
        const todas = estado.mesas.length > 0 && estado.mesas.every((m) => m.valor !== "0");
        caja.hidden = !todas;
        if (!todas) { caja.replaceChildren(); return; }
        const faltanFotos = [];
        for (const m of estado.mesas) for (const l of ["blancas", "negras"]) if (!tienePlanilla(m.mesa, l)) faltanFotos.push(m.mesa);
        if (estado.finalizada) {
            caja.dataset.estado = "finalizada";
            caja.replaceChildren(
                el("h2", { id: "revision-titulo", class: "font-bold text-xl", texto: "✓ Finalizaste la ronda " + estado.ronda }),
                el("p", { class: "mt-2", texto: "A las " + hora(estado.finalizada) + ". Entrega las planillas ordenadas por mesa y firmadas. Si algún resultado cambia, avísale a la organización: ella puede reabrir tu ronda." }));
            return;
        }
        caja.dataset.estado = "pendiente";
        const completas = () => ["rev-resultados", "rev-planillas", "rev-firmadas"].every((i) => revisadas[i]);
        // Lo marcado se recuerda: la página se vuelve a dibujar con cada lectura y no debe desmarcar nada.
        const casilla = (id, texto) => el("label", { class: "cam-check cam-check-revision" }, el("input", { type: "checkbox", id, class: "w-6 h-6", checked: !!revisadas[id], onchange: (e) => { revisadas[id] = e.target.checked; $("finalizar").disabled = !completas(); } }), el("span", { texto }));
        const filas = estado.mesas.slice().sort((a, b) => a.mesa - b.mesa).map((m) => el("tr", {},
            el("td", { texto: String(m.mesa) }), el("td", { texto: m.blancas + " – " + m.negras }), el("td", { texto: M.textoResultado(m.valor) }),
            el("td", { texto: (tienePlanilla(m.mesa, "blancas") ? "✓" : "—") + " / " + (tienePlanilla(m.mesa, "negras") ? "✓" : "—") })));
        caja.replaceChildren(
            el("h2", { id: "revision-titulo", class: "font-bold text-xl", texto: "Terminaste tus mesas: revisa antes de cerrar la ronda" }),
            el("p", { class: "mt-2", texto: "Repasa cada resultado contra su planilla. Cuando todo esté bien, confirma las tres cosas y finaliza la ronda: la organización recibe el aviso." }),
            el("div", { class: "cam-tabla-envoltura mt-3" }, el("table", { class: "cam-tabla" },
                el("caption", { class: "sr-only", texto: "Resultados de tus mesas para revisar" }),
                el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: "Mesa" }), el("th", { scope: "col", texto: "Partida" }), el("th", { scope: "col", texto: "Resultado" }), el("th", { scope: "col", texto: "Fotos (blancas / negras)" }))),
                el("tbody", {}, ...filas))),
            faltanFotos.length ? el("p", { class: "cam-aviso-suave mt-3", texto: "Todavía no subes la foto de algunas planillas (mesas " + C.listaMesas(faltanFotos) + "). Es opcional, pero ayuda a no perder nada." }) : null,
            el("div", { class: "mt-3" },
                casilla("rev-resultados", "Revisé que cada resultado coincide con su planilla."),
                casilla("rev-planillas", "Tengo todas las planillas de mis partidas, ordenadas por mesa."),
                casilla("rev-firmadas", "Todas están firmadas (por los dos jugadores y por mí).")),
            el("div", { class: "cam-acciones" }, el("button", { type: "button", id: "finalizar", class: "cam-btn", disabled: !completas(), onclick: finalizarRonda }, "Finalizar la ronda " + estado.ronda)));
    }

    async function finalizarRonda() {
        const sigue = await Avisos.confirmar("Vas a finalizar la ronda " + estado.ronda + ". Antes de seguir: ¿revisaste todas las planillas, las ordenaste por mesa y están firmadas?", { titulo: "Finalizar la ronda", aceptar: "Sí, finalizar la ronda" });
        if (!sigue) return;
        $("finalizar").disabled = true;
        try {
            const d = await invocar("finalizar", { ronda: estado.ronda, revision: { resultados: $("rev-resultados").checked, planillas: $("rev-planillas").checked, firmadas: $("rev-firmadas").checked } });
            estado.finalizada = d.finalizada_en;
            pintar();
            avisar("Ronda " + estado.ronda + " finalizada. La organización ya lo sabe.");
        } catch (e) {
            avisar(e.message, true);
            $("finalizar").disabled = false;
        }
    }

    // ------------------------------------------------------------- horarios y tiempo de espera

    function pintarEspera() {
        const H = window.CentroamericanoHorario;
        if (!H) return;
        const e = H.estado(new Date());
        let t = "";
        if (e.enCurso) t = e.quedan > 0 ? "⏰ " + e.enCurso.nombre + ": quedan " + H.minutosTexto(e.quedan) + " de tolerancia (hasta las " + hora(e.hasta) + ")." : "⏰ " + e.enCurso.nombre + ": la tolerancia de 30 minutos ya pasó.";
        else if (e.siguiente) t = "⏰ Sigue: " + e.siguiente.nombre + " a las " + hora(new Date(e.siguiente.inicio + ":00-06:00")) + ".";
        $("espera").textContent = t;
    }

    function verHorarios() {
        const H = window.CentroamericanoHorario;
        const dia = (d) => new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", weekday: "long", day: "numeric", month: "long" }).format(d);
        Avisos.alerta(H.lineas(new Date(), (d) => hora(d), dia), { titulo: "Horarios y tiempo de espera", aceptar: "Cerrar" });
    }

    function pintarAnotado() {
        const filas = $("anotado-filas");
        filas.replaceChildren();
        const lista = (estado.anotaciones || []).slice().reverse();
        $("anotado-vacio").hidden = lista.length > 0;
        const nombre = { resultado: "Resultado", correccion: "Corrección", ilegal: "Ilegal", irregularidad: "Irregularidad", incidencia: "Incidencia", nota: "Nota" };
        for (const f of lista) {
            let detalle = "";
            const r = (x) => { const o = M.RESULTADOS.find((y) => y.bitacora === x); return o ? o.texto : x; };
            if (f.tipo === "resultado") detalle = r(f.resultado) + " — " + f.jugador;
            else if (f.tipo === "correccion") detalle = "De «" + r(f.anterior) + "» a «" + r(f.resultado) + "» — " + f.jugador;
            else if (f.tipo === "ilegal" || f.tipo === "irregularidad") detalle = f.jugador + " (" + (f.color === "negras" ? "negras" : "blancas") + ")" + (f.texto ? ": " + f.texto : "");
            else detalle = f.texto;
            filas.append(el("tr", { "data-tipo": f.tipo, "data-anulada": anuladas.has(f.id) ? "si" : null },
                el("td", { texto: hora(f.ocurrio) }), el("td", { texto: String(f.mesa) }), el("td", { texto: (nombre[f.tipo] || f.tipo) + (anuladas.has(f.id) ? " (anulada)" : "") }), el("td", { texto: detalle })));
        }
    }

    // Las mesas van en orden de número; «Solo las que faltan» esconde las que ya tienen resultado.
    function mesasVisibles() {
        const faltan = $("solo-faltan").checked;
        return estado.mesas.slice().sort((a, b) => a.mesa - b.mesa).filter((m) => !faltan || m.valor === "0" || elegido[m.mesa]);
    }

    function pintarProgreso() {
        const con = estado.mesas.filter((m) => m.valor !== "0").length;
        const total = estado.mesas.length;
        $("progreso").textContent = total ? "Con resultado: " + con + " de " + total + (con === total ? " — ¡todas!" : " · faltan " + (total - con)) : "Todavía no hay mesas en esta ronda.";
    }

    function pintar() {
        if (!estado) return;
        const visibles = mesasVisibles();
        $("lista").replaceChildren(...visibles.map(tarjeta));
        $("sin-mesas").hidden = estado.mesas.length > 0;
        pintarProgreso();
        pintarLista();
        pintarRevision();
        pintarEspera();
        pintarAnotado();
    }

    function pintarCabecera() {
        $("titulo-torneo").textContent = estado.categoria ? estado.categoria + " " + estado.rama : estado.torneo;
        $("d-arbitro").textContent = estado.arbitro;
        $("d-ronda").textContent = "Ronda " + estado.ronda;
        $("d-mesas").textContent = "Mesas " + estado.desde + " a " + estado.hasta;
        $("datos").hidden = false;
    }

    function problema(titulo, texto, reintentar) {
        $("cargando").hidden = true;
        $("app").hidden = true;
        $("problema-titulo").textContent = titulo;
        $("problema-texto").textContent = texto;
        $("problema-reintentar").hidden = !reintentar;
        $("problema").hidden = false;
    }

    // ------------------------------------------------------------- avisos de la organización y pedidos de ayuda

    function pintarMensajes() {
        const caja = $("mensajes");
        caja.hidden = pendientes.length === 0;
        caja.replaceChildren(...pendientes.map((m) => el("article", { class: "cam-mensaje", "data-id": m.id, role: "alert" },
            el("p", { class: "cam-mensaje-de", texto: "El árbitro principal te avisa · " + hora(m.creado) }),
            el("p", { class: "cam-mensaje-texto", texto: m.texto }),
            el("button", { type: "button", class: "cam-btn", "data-accion": "entendido", onclick: () => entendido(m.id) }, "Entendido"))));
    }

    function pintarAyuda() {
        const caja = $("estado-ayuda");
        if (!ayuda) { caja.hidden = true; caja.dataset.estado = ""; return; }
        const donde = ayuda.mesa != null ? " en la mesa " + ayuda.mesa : "";
        caja.hidden = false;
        caja.dataset.estado = ayuda.estado;
        caja.textContent = ayuda.estado === "abierto"
            ? "🆘 Pediste al árbitro principal" + donde + " a las " + hora(ayuda.creado) + ". Ya le llegó el aviso; espera, va para allá."
            : "✓ El árbitro principal ya atendió tu pedido" + donde + " (" + hora(ayuda.atendido_en || ayuda.creado) + ").";
    }

    function pintarNombre() {
        $("nombre-caja").hidden = nombrado;
    }

    // Lo que contesta «leer» o «avisos»: el nombre, los mensajes sin leer y el pedido de ayuda.
    function aplicarAvisos(d) {
        nombrado = d.nombrado !== false;
        if (d.arbitro && estado) { estado.arbitro = d.arbitro; $("d-arbitro").textContent = d.arbitro; }
        pendientes = d.mensajes || [];
        const nuevos = pendientes.filter((m) => !vistosMensajes.has(m.id));
        nuevos.forEach((m) => vistosMensajes.add(m.id));
        if (nuevos.length) pitar();
        const estabaAbierta = ayuda && ayuda.estado === "abierto";
        ayuda = d.ayuda || null;
        if (estabaAbierta && ayuda && ayuda.estado === "atendido") pitar();
        abiertas = d.abiertas || (ayuda && ayuda.estado === "abierto" ? [ayuda.mesa] : []);
        pintarMensajes();
        pintarAyuda();
        pintarNombre();
        if (estado) pintar();
    }

    async function consultarAvisos() {
        if (!avisosVivo) return;
        try { aplicarAvisos(await invocar("avisos")); }
        catch (e) { if (e.http === 404 || e.http === 410) avisosVivo = false; /* sin red: se vuelve a intentar */ }
    }

    async function entendido(id) {
        const antes = pendientes;
        pendientes = pendientes.filter((m) => m.id !== id);
        pintarMensajes();
        try { await invocar("leido", { id }); }
        catch (e) { pendientes = antes; pintarMensajes(); avisar(e.message, true); }
    }

    async function pedirAyuda(mesa) {
        prepararAudio();
        let texto = "";
        if (mesa == null) {
            const nota = await Avisos.pedir("Se le avisa al árbitro principal ahora mismo. Si quieres, dile qué pasa.", { titulo: "Pedir al árbitro principal", etiqueta: "Qué pasa (opcional)", aceptar: "Pedir ayuda" });
            if (nota === null) return;
            texto = String(nota).trim();
        }
        try {
            const d = await invocar("ayuda", { mesa, texto });
            ayuda = { id: d.id, creado: d.creado, mesa, texto, estado: "abierto", atendido_en: null };
            if (!abiertas.includes(mesa)) abiertas = abiertas.concat([mesa]);
            pintarAyuda();
            if (estado) pintar();
            avisar(d.ya ? "Ya habías pedido ayuda" + (mesa != null ? " en la mesa " + mesa : "") + ": el árbitro principal ya lo sabe." : "Aviso enviado al árbitro principal.");
        } catch (e) { avisar(e.message, true); }
    }

    async function guardarNombre() {
        const nombre = $("nombre-campo").value.trim();
        if (!nombre) { avisar("Escribe tu nombre.", true); return; }
        $("nombre-guardar").disabled = true;
        try {
            const d = await invocar("nombre", { nombre });
            nombrado = true;
            if (estado) estado.arbitro = d.arbitro;
            $("d-arbitro").textContent = d.arbitro;
            pintarNombre();
            avisar("Listo, " + d.arbitro + ".");
        } catch (e) { avisar(e.message, true); }
        finally { $("nombre-guardar").disabled = false; }
    }

    function irAMesa() {
        const n = parseInt($("ir-mesa").value, 10);
        if (!Number.isFinite(n)) return;
        const m = estado && estado.mesas.find((x) => x.mesa === n);
        if (!m) { avisar("La mesa " + n + " no es de tus mesas (" + (estado ? estado.desde + " a " + estado.hasta : "") + ").", true); return; }
        if ($("solo-faltan").checked && m.valor !== "0") { $("solo-faltan").checked = false; pintar(); }
        const t = $("mesa-" + n);
        if (t) { t.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); t.focus({ preventScroll: true }); }
    }

    // ------------------------------------------------------------- leer

    async function leer(silencioso) {
        if (leyendo) return;
        leyendo = true;
        const boton = $("actualizar");
        boton.disabled = true;
        try {
            const d = await invocar("leer");
            const cambioRonda = estado && estado.ronda !== d.ronda;
            estado = d;
            anuladas = new Set(d.anuladas || []);
            if (cambioRonda) { elegido = {}; mensajes = {}; revisadas = {}; }
            $("problema").hidden = true;
            $("cargando").hidden = true;
            $("app").hidden = false;
            pintarCabecera();
            aplicarAvisos(d);
            pintar();
            $("actualizado").textContent = "Actualizado a las " + hora(d.leido_en);
        } catch (e) {
            if (e.http === 404 || e.http === 410) avisosVivo = false;
            if (!estado) problema(e.http === 404 || e.http === 410 ? "Este enlace ya no sirve" : "No se pudo abrir tus mesas", e.message, !(e.http === 404 || e.http === 410));
            else if (!silencioso) avisar(e.message, true);
            else $("actualizado").textContent = "No se pudo actualizar (se muestra lo último que se leyó)";
        } finally {
            leyendo = false;
            boton.disabled = false;
        }
    }

    // ------------------------------------------------------------- guardar

    function ponerResultado(m, valor) {
        elegido[m.mesa] = valor;
        delete mensajes[m.mesa];
        pintar();
        const s = $("res-" + m.mesa);
        if (s) s.focus();
    }

    async function guardar(m) {
        const valor = elegido[m.mesa];
        if (!valor || valor === m.valor) return;
        if (m.valor !== "0") {
            const sigue = await Avisos.confirmar("La mesa " + m.mesa + " ya tiene «" + M.textoResultado(m.valor) + "» en chess-results. ¿Cambiarlo a «" + M.textoResultado(valor) + "»?", { titulo: "Cambiar un resultado", aceptar: "Sí, cambiarlo" });
            if (!sigue) return;
        }
        const antes = m.valor;
        ocupadas.add(m.mesa);
        delete mensajes[m.mesa];
        pintar();
        try {
            const d = await invocar("guardar", { ronda: estado.ronda, cambios: [{ mesa: m.mesa, blancas: m.blancas, negras: m.negras, valor }] });
            const r = d.resultados[0];
            if (r && r.quedo != null) m.valor = r.quedo;
            if (r && r.ok) {
                delete elegido[m.mesa];
                mensajes[m.mesa] = { ok: true, texto: "✓ Guardado en chess-results a las " + hora(d.leido_en) + (d.registro_error ? " Ojo: no quedó en el registro; avisa a la organización." : "") };
                const nombreDe = (v) => (M.RESULTADOS.find((x) => x.valor === v) || {}).bitacora || null;
                (estado.anotaciones = estado.anotaciones || []).push({ id: "local-" + Date.now(), ocurrio: d.leido_en, mesa: m.mesa, color: null, jugador: m.blancas + " – " + m.negras, tipo: antes !== "0" ? "correccion" : "resultado", resultado: nombreDe(valor), anterior: antes !== "0" ? nombreDe(antes) : null, texto: "", articulo: "", enviado: true });
            } else {
                mensajes[m.mesa] = { ok: false, texto: "✗ No quedó guardado: chess-results tiene «" + (r && r.quedo != null ? M.textoResultado(r.quedo) : "nada") + "». Intenta de nuevo." };
            }
            for (const x of d.diferencias || []) { const o = estado.mesas.find((y) => y.mesa === x.mesa); if (o) o.valor = x.ahora; }
            if ((d.diferencias || []).length) avisar("Otra mesa cambió sin que la tocaras (" + d.diferencias.map((x) => x.mesa).join(", ") + "). Revisa chess-results.", true);
        } catch (e) {
            mensajes[m.mesa] = { ok: false, texto: "✗ " + e.message };
        } finally {
            ocupadas.delete(m.mesa);
            pintar();
        }
    }

    // ------------------------------------------------------------- ilegales e irregularidades

    function sumarAnotacion(m, color, tipo, id, jugador, texto) {
        (estado.anotaciones = estado.anotaciones || []).push({ id, ocurrio: new Date().toISOString(), mesa: m.mesa, color, jugador, tipo, resultado: null, anterior: null, texto: texto || "", articulo: "", enviado: false });
    }

    // Las dos de la lista: ilegal e irregularidad se eligen de una lista y la bitácora queda sola
    // (tipo de jugada, el artículo cuando lo hay y lo que quiera agregar el árbitro).
    async function elegirTipo(titulo, texto, lista, etiqueta, aceptar, peligro) {
        const r = await Avisos.formulario({
            titulo, texto, aceptar, peligro,
            campos: [
                { nombre: "tipo", etiqueta, tipo: "select", opciones: lista.map((t) => [t.id, t.texto]) },
                { nombre: "nota", etiqueta: "Detalle (opcional; obligatorio si eliges «Otra»)", tipo: "textarea", max: 500 },
            ],
        });
        if (r === null) return null;
        const t = C.textoTipo(lista, r.tipo, r.nota);
        if (!t) { avisar("Cuenta qué pasó para anotar «Otra».", true); return null; }
        return t;
    }

    async function ilegal(m, color) {
        const k = marcaDe(m.mesa, color);
        const nombre = nombreDe(m, color);
        const segunda = k.ilegales >= 1;
        const t = await elegirTipo(
            "Jugada ilegal de " + nombre + " (mesa " + m.mesa + ")",
            segunda
                ? "Esta sería la SEGUNDA jugada ilegal de " + nombre + " en esta partida: pierde la partida (art. 7.5.5)."
                : "Elige qué jugada ilegal fue: queda en la bitácora. Es la primera de " + nombre + ": se le dan 2 minutos más a su rival (art. 7.5.5).",
            C.TIPOS_ILEGAL, "¿Qué jugada ilegal fue?", segunda ? "Anotar la SEGUNDA ilegal" : "Anotar la ilegal", segunda);
        if (!t) return;
        ocupadas.add(m.mesa);
        pintar();
        try {
            const d = await invocar("anotar", { ronda: estado.ronda, mesa: m.mesa, color, tipo: "ilegal", texto: t.texto });
            estado.marcas[clave(m.mesa, color)] = d.marca;
            sumarAnotacion(m, color, "ilegal", d.id, d.jugador || nombre, t.texto);
            const a = C.avisoIlegal(d.marca.ilegales, d.jugador || nombre, color);
            pintar();
            // Las dos se avisan con un cuadro que no se pasa por alto: la primera recuerda los 2 minutos.
            await Avisos.alerta(a.texto, { titulo: a.nivel === "pierde" ? a.titulo : "Primera ilegal: dale 2 minutos al rival", aceptar: "Entendido" });
        } catch (e) {
            avisar(e.message, true);
        } finally {
            ocupadas.delete(m.mesa);
            pintar();
        }
    }

    async function irregularidad(m, color) {
        const nombre = nombreDe(m, color);
        const t = await elegirTipo("Irregularidad de " + nombre + " (mesa " + m.mesa + ")", "Elige qué fue: queda en la bitácora con la hora y tu nombre.", C.TIPOS_IRREGULARIDAD, "¿Qué irregularidad fue?", "Anotar la irregularidad", false);
        if (!t) return;
        ocupadas.add(m.mesa);
        pintar();
        try {
            const d = await invocar("anotar", { ronda: estado.ronda, mesa: m.mesa, color, tipo: "irregularidad", texto: t.texto, articulo: t.articulo });
            estado.marcas[clave(m.mesa, color)] = d.marca;
            sumarAnotacion(m, color, "irregularidad", d.id, d.jugador || nombre, t.texto);
            avisar("Irregularidad anotada: " + (d.jugador || nombre) + ".");
        } catch (e) {
            avisar(e.message, true);
        } finally {
            ocupadas.delete(m.mesa);
            pintar();
        }
    }

    async function anular(m, color, tipo, id) {
        const nombre = nombreDe(m, color);
        const sigue = await Avisos.confirmar("¿Anular la última " + (tipo === "ilegal" ? "jugada ilegal" : "irregularidad") + " de " + nombre + "? Queda constancia de las dos anotaciones.", { titulo: "Anular una anotación", aceptar: "Sí, anularla" });
        if (!sigue) return;
        ocupadas.add(m.mesa);
        pintar();
        try {
            const d = await invocar("anular", { id });
            estado.marcas[clave(m.mesa, color)] = d.marca;
            anuladas.add(id);
            avisar("Anulada.");
        } catch (e) {
            avisar(e.message, true);
        } finally {
            ocupadas.delete(m.mesa);
            pintar();
        }
    }

    // ------------------------------------------------------------- arranque

    function sinNadaPendiente() {
        const escribiendo = document.activeElement && document.activeElement.closest && document.activeElement.closest("#lista");
        return !ocupadas.size && !Object.values(elegido).some((v) => v) && !escribiendo;
    }

    function init() {
        if (!/^[0-9a-f]{64}$/.test(token())) {
            problema("Falta tu enlace", "Esta página se abre con el enlace o el QR que te dio la organización. Pídelo de nuevo o escanéalo otra vez.", false);
            return;
        }
        // El primer toque prepara el sonido de los avisos.
        document.addEventListener("pointerdown", prepararAudio, { once: true });
        $("actualizar").addEventListener("click", () => { prepararAudio(); leer(false); consultarAvisos(); });
        $("problema-reintentar").addEventListener("click", () => { $("problema").hidden = true; $("cargando").hidden = false; leer(false); });
        $("pedir-ayuda").addEventListener("click", () => pedirAyuda(null));
        $("horarios").addEventListener("click", verHorarios);
        setInterval(() => { if (!document.hidden && estado) pintarEspera(); }, 30000);
        $("nombre-guardar").addEventListener("click", guardarNombre);
        $("nombre-campo").addEventListener("keydown", (e) => { if (e.key === "Enter") guardarNombre(); });
        $("ir-mesa").addEventListener("change", irAMesa);
        $("ir-mesa").addEventListener("keydown", (e) => { if (e.key === "Enter") irAMesa(); });
        $("solo-faltan").addEventListener("change", pintar);
        setInterval(() => { if (!document.hidden && estado && sinNadaPendiente()) leer(true); }, REFRESCO_MS);
        setInterval(() => { if (!document.hidden) consultarAvisos(); }, AVISOS_MS);
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) return;
            mantenerEncendida();
            consultarAvisos();
            if (estado && sinNadaPendiente()) leer(true);
        });
        mantenerEncendida();
        leer(false);
    }

    init();
})();
