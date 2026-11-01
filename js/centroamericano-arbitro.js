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

    // ------------------------------------------------------------- avisos sin ruido, y pantalla encendida

    // En un torneo no puede haber ruido: los avisos de la organización NUNCA suenan. Se ven (arriba,
    // pegados, con un parpadeo suave y un número en el título de la pestaña) y la tablet VIBRA, que
    // no hace ruido en la sala (lo pidió el dueño: vibración sí, sonido no).
    function vibrar() { try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* sin vibración */ } }
    const TITULO = document.title;
    function marcarTitulo() { document.title = (pendientes.length ? "(" + pendientes.length + ") " : "") + TITULO; }
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
            marcas, bloquePresencia(m, color), acciones);
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
                    el("button", { type: "button", class: "cam-btn cam-ayuda-mesa", "data-accion": "ayuda", "data-pedida": pedida ? "si" : null, disabled: pedida, "aria-label": pedida ? "Ya pediste al principal en la mesa " + m.mesa : "Pedir al árbitro principal en la mesa " + m.mesa + ": irá directo a esa mesa", onclick: () => pedirAyuda(m.mesa) },
                        el("span", { "aria-hidden": "true", texto: "🆘 " }), pedida ? "Principal pedido" : "Principal en esta mesa"),
                    el("span", { class: "cam-estado", texto: textoEstado(m, est) }))),
            bandas(m),
            bloqueJugador(m, "blancas"),
            bloqueJugador(m, "negras"),
            el("div", { class: "cam-resultado" },
                el("p", { class: "cam-resultado-actual" }, "En chess-results: ", el("strong", { texto: M.textoResultado(m.valor) })),
                el("div", { class: "cam-resultado-fila" }, sel,
                    el("button", { type: "button", class: "cam-btn", "data-accion": "guardar", disabled: !pendiente || ocupada || !listaCompleta(), title: listaCompleta() ? null : "Primero la revisión previa de la ronda", onclick: () => guardar(m) }, ocupada ? "Guardando…" : "Guardar")),
                msg ? el("p", { class: msg.ok ? "cam-guardado" : "cam-fallo", role: msg.ok ? "status" : "alert", texto: msg.texto }) : null),
            bloqueIconos(m, ocupada));
    }

    // ------------------------------------------------------------- los dos iconos de cada mesa: la cámara y el reloj

    // Iconos propios (SVG en línea): se ven igual en cualquier tablet y no dependen de las fuentes de emojis.
    const SVG_NS = "http://www.w3.org/2000/svg";
    const ICONOS = {
      camara: [["path", { d: "M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" }], ["circle", { cx: "12", cy: "13", r: "3.5" }]],
      reloj: [["circle", { cx: "12", cy: "12", r: "9" }], ["path", { d: "M12 7v5l3 2" }]],
    };
    function icono(nombre) {
      const s = document.createElementNS(SVG_NS, "svg");
      for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", class: "cam-icono", "aria-hidden": "true", focusable: "false", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" })) s.setAttribute(k, v);
      for (const [etiqueta, atributos] of ICONOS[nombre]) {
        const f = document.createElementNS(SVG_NS, etiqueta);
        for (const [k, v] of Object.entries(atributos)) f.setAttribute(k, v);
        s.append(f);
      }
      return s;
    }
    // Un botón de solo icono (el texto va en aria-label y en title): grande, para el dedo en una tablet.
    function botonIcono(accion, nombre, etiqueta, fn, { hecho = false, ocupado = false, deshabilitado = false } = {}) {
      return el("button", { type: "button", class: "cam-btn-icono", "data-accion": accion, "data-hecho": hecho ? "si" : null, "data-ocupado": ocupado ? "si" : null, disabled: deshabilitado,
        "aria-label": etiqueta, title: etiqueta, onclick: fn }, icono(nombre), hecho ? el("span", { class: "cam-icono-marca", "aria-hidden": "true", texto: "✓" }) : null);
    }

    // ------------------------------------------------------------- las planillas (UNA foto con las dos juntas)

    const subidas = () => (estado && estado.planillas) || [];
    // Una foto por mesa. (Las fotos de prueba de antes eran una por lado: cualquiera cuenta.)
    const tienePlanilla = (mesa) => subidas().some((x) => x.mesa === mesa);

    function bloqueIconos(m, ocupada) {
        const hecha = tienePlanilla(m.mesa), sube = subiendo.has(m.mesa);
        const pendiente = m.valor === "0";
        const hayLectura = lecturas(m.mesa).length > 0;
        return el("div", { class: "cam-planillas cam-iconos" },
            botonIcono("planilla", "camara",
                sube ? "Subiendo la foto de las planillas de la mesa " + m.mesa
                    : (hecha ? "Cambiar la foto de las planillas de la mesa " + m.mesa + ": tiene que salir las dos planillas juntas" : "Tomar la foto de las dos planillas de la mesa " + m.mesa + " (las dos juntas)"),
                () => subirPlanilla(m), { hecho: hecha, ocupado: sube, deshabilitado: ocupada || sube }),
            pendiente ? botonIcono("tiempo", "reloj", "Control de tiempos de la mesa " + m.mesa + (hayLectura ? " (ya hay una lectura)" : ""), () => abrirTiempos(false, m.mesa), { hecho: hayLectura }) : null,
            sube ? el("span", { class: "cam-iconos-estado", role: "status", texto: "Subiendo…" }) : null);
    }

    // La foto se achica y se pasa a JPG en el aparato (lado largo de 2600 px como máximo: son dos planillas en una foto):
    // así sube rápido aunque la señal del salón sea mala.
    async function reducir(archivo) {
        const bmp = await createImageBitmap(archivo);
        const lado = Math.max(bmp.width, bmp.height), esc = lado > 2600 ? 2600 / lado : 1;
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * esc);
        c.height = Math.round(bmp.height * esc);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        if (bmp.close) bmp.close();
        const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.82));
        if (!blob) throw new Error("No se pudo preparar la foto.");
        return await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mal(new Error("No se pudo leer la foto.")); r.readAsDataURL(blob); });
    }

    // El botón de la camarita. Primero la cámara CON GUÍA (dos marcos para acomodar las planillas; ver
    // js/guia-planillas.js); si el aparato no la da (sin permiso, sin cámara, o el árbitro prefiere la suya),
    // la cámara del aparato de siempre. Nunca se queda sin poder subir la foto.
    async function subirPlanilla(m) {
        const G = window.GuiaPlanillas;
        if (G && G.disponible()) {
            const r = await G.abrir({
                titulo: "Foto de las planillas · Mesa " + m.mesa,
                rotulos: ["Blancas · " + m.blancas, "Negras · " + m.negras],
            });
            if (r.imagen) { await enviarPlanilla(m, r.imagen); enfocarCamarita(m.mesa); return; }
            if (r.cancelado) { enfocarCamarita(m.mesa); return; }
            if (!r.elegida && r.motivo) avisar(r.motivo + " Se usa la cámara del aparato.", true);
        }
        subirConLaCamaraDelAparato(m);
    }

    // Al volver de la cámara, el foco del teclado vuelve a la camarita de esa mesa (la página se vuelve a dibujar al subir).
    function enfocarCamarita(mesa) {
        const b = document.querySelector('.cam-mesa[data-mesa="' + mesa + '"] [data-accion="planilla"]');
        if (b && !b.disabled) b.focus();
    }

    async function enviarPlanilla(m, imagen) {
        subiendo.add(m.mesa);
        pintar();
        try {
            const d = await invocar("planilla", { ronda: estado.ronda, mesa: m.mesa, imagen });
            estado.planillas = subidas().filter((x) => x.mesa !== m.mesa).concat([{ mesa: m.mesa, lado: "blancas", subida: d.subida, drive_ok: d.drive === "enviada" }]);
            avisar("Foto de las planillas de la mesa " + m.mesa + " guardada" + (d.drive === "enviada" ? " y ya está en el Drive." : d.drive === "pendiente" ? ". El Drive la recibirá en un rato." : "."));
        } catch (e) {
            avisar(e.message, true);
        } finally {
            subiendo.delete(m.mesa);
            pintar();
        }
    }

    function subirConLaCamaraDelAparato(m) {
        const entrada = document.createElement("input");
        entrada.type = "file";
        entrada.accept = "image/*";
        entrada.setAttribute("capture", "environment");
        entrada.addEventListener("change", async () => {
            const archivo = entrada.files && entrada.files[0];
            if (!archivo) return;
            subiendo.add(m.mesa);
            pintar();
            try {
                await enviarPlanilla(m, await reducir(archivo));
            } catch (e) {
                avisar(e.message, true);
                subiendo.delete(m.mesa);
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
        for (const m of estado.mesas) if (!tienePlanilla(m.mesa)) faltanFotos.push(m.mesa);
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
            el("td", { texto: tienePlanilla(m.mesa) ? "✓" : "—" })));
        caja.replaceChildren(
            el("h2", { id: "revision-titulo", class: "font-bold text-xl", texto: "Terminaste tus mesas: revisa antes de cerrar la ronda" }),
            el("p", { class: "mt-2", texto: "Repasa cada resultado contra su planilla. Cuando todo esté bien, confirma las tres cosas y finaliza la ronda: la organización recibe el aviso." }),
            el("div", { class: "cam-tabla-envoltura mt-3" }, el("table", { class: "cam-tabla" },
                el("caption", { class: "sr-only", texto: "Resultados de tus mesas para revisar" }),
                el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: "Mesa" }), el("th", { scope: "col", texto: "Partida" }), el("th", { scope: "col", texto: "Resultado" }), el("th", { scope: "col", texto: "Foto de las planillas" }))),
                el("tbody", {}, ...filas))),
            faltanFotos.length ? el("p", { class: "cam-aviso-suave mt-3", texto: "Todavía no subes la foto de las planillas de algunas mesas (" + C.listaMesas(faltanFotos) + "). Es opcional, pero ayuda a no perder nada." }) : null,
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

    // ------------------------------------------------------------- presencia: quién llegó a cada mesa

    const presencias = () => (estado && estado.presencia) || [];
    function presenciaDe(mesa, color) {
        const f = presencias().find((x) => x.mesa === mesa && x.color === color);
        return f ? f.presente : null;
    }

    function pintarPresenciaResumen() {
        const total = estado.mesas.length * 2;
        const revisados = estado.mesas.reduce((n, m) => n + (presenciaDe(m.mesa, "blancas") !== null ? 1 : 0) + (presenciaDe(m.mesa, "negras") !== null ? 1 : 0), 0);
        const faltan = presencias().filter((x) => !x.presente).length;
        $("presencia-resumen").textContent = total ? "Presencia revisada: " + revisados + " de " + total + " jugadores" + (faltan ? " · no han llegado: " + faltan : "") + "." : "";
    }

    async function marcarPresencia(m, color, presente) {
        const antes = presencias().slice();
        // Se ve al instante; si la función dice que no, se deshace.
        estado.presencia = presencias().filter((x) => !(x.mesa === m.mesa && x.color === color)).concat([{ mesa: m.mesa, color, presente, marcada: new Date().toISOString() }]);
        pintar();
        try { await invocar("presencia", { ronda: estado.ronda, mesa: m.mesa, color, presente }); }
        catch (e) { estado.presencia = antes; pintar(); avisar(e.message, true); }
    }

    function bloquePresencia(m, color) {
        const v = presenciaDe(m.mesa, color);
        const nombre = nombreDe(m, color);
        return el("div", { class: "cam-presencia", "data-presente": v === null ? "sin-revisar" : v ? "si" : "no" },
            el("span", { class: "cam-presencia-estado", texto: v === null ? "Presencia: sin revisar" : v ? "✓ Llegó" : "✗ No ha llegado" }),
            el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "presente", "aria-pressed": v === true ? "true" : "false", "aria-label": nombre + " llegó", onclick: () => marcarPresencia(m, color, true) }, "Llegó"),
            el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "ausente", "aria-pressed": v === false ? "true" : "false", "aria-label": nombre + " no ha llegado", onclick: () => marcarPresencia(m, color, false) }, "No ha llegado"));
    }

    // ------------------------------------------------------------- varios torneos para el mismo árbitro

    function pintarHermanas() {
        const caja = $("mis-torneos");
        const otras = (estado && estado.hermanas) || [];
        caja.hidden = otras.length === 0;
        if (!otras.length) { caja.replaceChildren(); return; }
        caja.replaceChildren(
            el("span", { class: "cam-mis-torneos-titulo", texto: "Tus torneos:" }),
            el("button", { type: "button", class: "cam-pestana", "aria-current": "true", disabled: true }, estado.torneo + " · mesas " + estado.desde + " a " + estado.hasta),
            ...otras.map((h) => el("button", { type: "button", class: "cam-pestana", "data-accion": "cambiar-torneo", onclick: () => cambiarTorneo(h.token) }, h.torneo + " · mesas " + h.mesa_desde + " a " + h.mesa_hasta)));
    }

    // Pasar al otro enlace del mismo árbitro: se cambia el «#» y se vuelve a leer todo.
    function cambiarTorneo(nuevo) {
        try { history.replaceState(null, "", "#" + nuevo); } catch (e) { location.hash = nuevo; }
        estado = null; elegido = {}; mensajes = {}; revisadas = {}; ayuda = null; abiertas = []; anuladas = new Set();
        $("app").hidden = true;
        $("cargando").hidden = false;
        leer(false);
    }

    // ------------------------------------------------------------- control de tiempos (ventana flotante)

    // Se abre con el reloj de una mesa (o con el botón de arriba, o sola cuando la organización lo pide).
    // Blancas: lo que marca su reloj y las jugadas que lleva; Negras, lo mismo; Guardar. Cada lectura
    // queda en la tabla de tiempos Y como una línea en la bitácora de la mesa (lo hace la función).
    let tiemposAbierto = false;
    let tiemposMin = false;
    let lecturaMesa = null;
    let tiemposPorMesa = false;   // se abrió con el reloj de una mesa: al guardar se cierra
    let borrador = {};            // lo escrito sobrevive a minimizar y a que la página se vuelva a dibujar
    let borradorMesa = null;

    const sinTerminar = () => estado.mesas.filter((m) => m.valor === "0").sort((a, b) => a.mesa - b.mesa);
    const lecturas = (mesa) => ((estado && estado.tiempos) || []).filter((x) => x.mesa === mesa);

    function abrirTiempos(porLaOrganizacion, mesa) {
        tiemposAbierto = true;
        // Si la pide la organización en una pantalla angosta (un celular), sale minimizada: abierta taparía el aviso
        // que hay que leer primero. En una tablet sale abierta, como una ventanita en la esquina.
        tiemposMin = !!porLaOrganizacion && window.innerWidth < 700;
        tiemposPorMesa = !!mesa;
        if (mesa) lecturaMesa = mesa;
        if (estado) pintarTiempos();
        if (porLaOrganizacion) avisar("El árbitro principal pide un control de tiempos: anota el tiempo y las jugadas de las blancas y de las negras en las mesas sin terminar.");
    }

    function leerBorrador() {
        if ($("lt-tb")) borrador = { tb: $("lt-tb").value, jb: $("lt-jb").value, tn: $("lt-tn").value, jn: $("lt-jn").value };
    }

    function pintarTiempos() {
        const caja = $("control-tiempos");
        caja.hidden = !tiemposAbierto;
        if (!tiemposAbierto) { caja.replaceChildren(); return; }
        leerBorrador();
        const mesas = sinTerminar();
        if (!lecturaMesa || !mesas.some((m) => m.mesa === lecturaMesa)) lecturaMesa = mesas.length ? mesas[0].mesa : null;
        // Otra mesa: lo escrito era de la anterior.
        if (borradorMesa !== lecturaMesa) { borrador = {}; borradorMesa = lecturaMesa; }
        caja.dataset.minimizada = tiemposMin ? "si" : "no";
        const cabeza = el("div", { class: "cam-flotante-cabeza" },
            el("strong", { class: "cam-flotante-titulo" }, icono("reloj"), el("span", { texto: lecturaMesa ? "Mesa " + lecturaMesa : "Control de tiempos" })),
            el("span", { class: "cam-flotante-botones" },
                el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "minimizar-tiempos", "aria-expanded": tiemposMin ? "false" : "true", "aria-label": tiemposMin ? "Abrir el control de tiempos" : "Minimizar el control de tiempos", title: tiemposMin ? "Abrir" : "Minimizar", onclick: () => { tiemposMin = !tiemposMin; pintarTiempos(); } }, tiemposMin ? "▢" : "–"),
                el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "cerrar-tiempos", "aria-label": "Cerrar el control de tiempos", title: "Cerrar", onclick: () => { tiemposAbierto = false; pintarTiempos(); } }, "✕")));
        if (tiemposMin) { caja.replaceChildren(cabeza); return; }
        if (!mesas.length) { caja.replaceChildren(cabeza, el("p", { class: "cam-flotante-cuerpo", texto: "Todas tus mesas ya tienen resultado: no hay partidas sin terminar." })); return; }
        const m = mesas.find((x) => x.mesa === lecturaMesa);
        const ult = lecturas(lecturaMesa).slice(0, 1);
        const lado = (color, nombre, id) => el("fieldset", { class: "cam-tiempo-lado", "data-color": color },
            el("legend", {}, el("span", { class: "cam-color", "data-color": color, texto: color === "blancas" ? "Blancas" : "Negras" }), " ", el("span", { class: "cam-tiempo-nombre", texto: nombre })),
            el("div", { class: "grid grid-cols-2 gap-2" },
                el("div", {}, el("label", { for: "lt-t" + id, class: "block text-sm font-bold", texto: "Tiempo" }), el("input", { id: "lt-t" + id, type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "h:mm:ss", class: "cam-campo", value: borrador["t" + id] || "" })),
                el("div", {}, el("label", { for: "lt-j" + id, class: "block text-sm font-bold", texto: "Jugadas" }), el("input", { id: "lt-j" + id, type: "number", min: "0", max: "400", inputmode: "numeric", class: "cam-campo", value: borrador["j" + id] || "" }))));
        caja.replaceChildren(cabeza, el("form", { class: "cam-flotante-cuerpo", id: "form-tiempos", novalidate: true, onsubmit: guardarLectura },
            mesas.length > 1 ? el("div", {}, el("label", { for: "lt-mesa", class: "sr-only", texto: "Mesa" }),
                el("select", { id: "lt-mesa", class: "cam-select", onchange: (e) => { leerBorrador(); lecturaMesa = Number(e.target.value); tiemposPorMesa = false; pintarTiempos(); } },
                    ...mesas.map((x) => el("option", { value: String(x.mesa), selected: x.mesa === lecturaMesa, texto: "Mesa " + x.mesa + " — " + x.blancas + " vs " + x.negras })))) : null,
            lado("blancas", m ? m.blancas : "", "b"),
            lado("negras", m ? m.negras : "", "n"),
            el("div", { class: "cam-acciones" }, el("button", { type: "submit", id: "lt-guardar", class: "cam-btn" }, "Guardar")),
            ult.length ? el("ul", { class: "text-sm mt-2", id: "lt-ultimas", "aria-label": "Lo último anotado en la mesa " + lecturaMesa },
                ...ult.map((x) => el("li", { texto: hora(x.ocurrio) + " · Blancas " + C.formatoTiempo(x.t_blancas) + (x.j_blancas != null ? " (" + x.j_blancas + ")" : "") + " · Negras " + C.formatoTiempo(x.t_negras) + (x.j_negras != null ? " (" + x.j_negras + ")" : x.j_blancas == null ? " · jugada " + x.jugada : "") }))) : null));
    }

    async function guardarLectura(ev) {
        ev.preventDefault();
        const tB = C.leerTiempo($("lt-tb").value), tN = C.leerTiempo($("lt-tn").value);
        const jB = $("lt-jb").value === "" ? NaN : Number($("lt-jb").value), jN = $("lt-jn").value === "" ? NaN : Number($("lt-jn").value);
        if (tB === null || tN === null) { avisar("Escribe el tiempo de cada reloj así: 1:23:45 o 45:10.", true); return; }
        if (![jB, jN].every((j) => Number.isInteger(j) && j >= 0 && j <= 400)) { avisar("Escribe las jugadas que lleva cada color (de 0 a 400).", true); return; }
        const mesa = lecturaMesa;
        $("lt-guardar").disabled = true;
        try {
            const d = await invocar("tiempo", { ronda: estado.ronda, mesa, t_blancas: tB, j_blancas: jB, t_negras: tN, j_negras: jN });
            estado.tiempos = [{ id: d.id, ocurrio: d.ocurrio, mesa, jugada: d.jugada, j_blancas: jB, j_negras: jN, turno: null, t_blancas: tB, t_negras: tN, nota: "" }].concat(estado.tiempos || []);
            avisar("Control de tiempos de la mesa " + mesa + " guardado: queda en la bitácora.");
            borrador = {};
            borradorMesa = null;
            // Desde el reloj de una mesa se cierra; si lo pidió la organización, queda abierta para la siguiente mesa.
            if (tiemposPorMesa) tiemposAbierto = false;
            pintarTiempos();
            pintar();
        } catch (e) {
            avisar(e.message, true);
            if ($("lt-guardar")) $("lt-guardar").disabled = false;
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
        pintarHermanas();
        pintarPresenciaResumen();
        pintarLista();
        pintarRevision();
        pintarEspera();
        if (tiemposAbierto && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#control-tiempos'))) pintarTiempos();
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
        if (nuevos.length) vibrar();
        if (nuevos.some((m) => m.control_tiempos)) abrirTiempos(true);
        const estabaAbierta = ayuda && ayuda.estado === "abierto";
        ayuda = d.ayuda || null;
        if (estabaAbierta && ayuda && ayuda.estado === "atendido") vibrar();
        abiertas = d.abiertas || (ayuda && ayuda.estado === "abierto" ? [ayuda.mesa] : []);
        pintarMensajes();
        marcarTitulo();
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
        let texto = "";
        if (mesa == null) {
            const nota = await Avisos.pedir("Pides ayuda PARA TI, no para una mesa en especial. Si lo que necesitas es que el principal vaya a una mesa, usa «Principal en esta mesa» en esa mesa. Si quieres, dile qué pasa.", { titulo: "Necesito ayuda", etiqueta: "Qué pasa (opcional)", aceptar: "Pedir ayuda" });
            if (nota === null) return;
            texto = String(nota).trim();
        }
        try {
            const d = await invocar("ayuda", { mesa, texto });
            ayuda = { id: d.id, creado: d.creado, mesa, texto, estado: "abierto", atendido_en: null };
            if (!abiertas.includes(mesa)) abiertas = abiertas.concat([mesa]);
            pintarAyuda();
            if (estado) pintar();
            avisar(d.ya ? "Ya habías pedido ayuda" + (mesa != null ? " en la mesa " + mesa : "") + ": el árbitro principal ya lo sabe." : mesa != null ? "Aviso enviado: el árbitro principal irá directo a la mesa " + mesa + "." : "Aviso enviado: el árbitro principal sabe que necesitas ayuda.");
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
        $("actualizar").addEventListener("click", () => { leer(false); consultarAvisos(); });
        $("problema-reintentar").addEventListener("click", () => { $("problema").hidden = true; $("cargando").hidden = false; leer(false); });
        $("pedir-ayuda").addEventListener("click", () => pedirAyuda(null));
        $("horarios").addEventListener("click", verHorarios);
        $("abrir-tiempos").addEventListener("click", () => abrirTiempos(false));
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
