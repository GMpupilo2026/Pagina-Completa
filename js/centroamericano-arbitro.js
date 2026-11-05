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
    // La tablet vieja o lenta (js/modo-liviano.js): algunas consultas van menos seguido. Los avisos de la organización
    // y lo que se anota NO: eso no se demora nunca.
    const liviano = () => !!(window.ModoLiviano && window.ModoLiviano.activo());
    const AVISOS_MS = 8000; // los avisos (solo la base: liviano)

    let estado = null; // lo que contestó «leer»
    let fairPlay = []; // sus mesas elegidas para Fair Play en la ronda (borde dorado), de centroamericano-fair-play
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
    let cola = null; // lo que no pudo salir de la tablet (js/centroamericano-cola.js)
    let dueno = ""; // la huella del enlace (nunca el token)
    let sinSenal = false; // el último pedido no pudo salir por la red

    const token = () => (location.hash || "").replace(/^#(t=)?/, "").trim();

    // El Rápido y el Blitz: «modo rápido» (null en el clásico). Ver ritmoRapido en js/centroamericano-mesas.js y «El Rápido
    // y el Blitz: la mesa en un toque» en docs/decisiones/juegos-y-torneos.md.
    const rapido = () => (estado ? C.ritmoRapido(estado.torneo, estado.ritmo) : null);

    // La ficha nueva de cada mesa («A: tres toques»: más corta, el resultado en tres botones que guardan de un toque y las marcas de los dos
    // jugadores en una sola franja). POR AHORA SOLO PARA QUIEN ESTÁ EN ESTA LISTA, para probarla en una ronda real antes de darla a todos.
    // El nombre se compara sin tildes ni mayúsculas y basta con que traiga todas las palabras («Oscar Angulo Camacho» sirve). Para probarla
    // con otro enlace: «?ficha=a» después de la dirección; para volver a la de siempre aun estando en la lista: «?ficha=hoy».
    // Ver «La ficha de la mesa, opción A» en docs/decisiones/juegos-y-torneos.md.
    const FICHA_A = ["oscar angulo"];
    const sinTildes = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    function fichaA() {
        const q = location.search || "";
        if (/[?&]ficha=hoy\b/.test(q)) return false;
        if (/[?&]ficha=a\b/.test(q)) return true;
        const n = sinTildes(estado && estado.arbitro);
        return FICHA_A.some((x) => x.split(" ").every((w) => n.includes(w)));
    }
    const minutosIlegal = () => C.minutosIlegal(rapido());
    const textoMinutos = () => (minutosIlegal() === 1 ? "1 minuto" : "2 minutos");
    // Los tres resultados de siempre, en botones grandes: un toque y se guarda.
    const RAPIDOS = [{ valor: "1", texto: "1-0", ayuda: "ganan blancas" }, { valor: "2", texto: "½-½", ayuda: "tablas" }, { valor: "3", texto: "0-1", ayuda: "ganan negras" }];

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

    const Cola = window.CentroamericanoCola;
    const TIEMPO_MS = 25000, TIEMPO_FOTO_MS = 90000;

    // UN pedido a la función, sin reintentos. Siempre lanza un Error cuando no salió bien, con `http` (el
    // estado) y `red` (si fue la señal). Un error del servidor SIN mensaje nuestro (la función no arrancó,
    // un 503…) nunca se toma por una respuesta buena. La función contesta con un error legible aun en
    // 4xx/5xx: se lee el cuerpo.
    async function llamar(accion, cuerpo, ms) {
        let reloj;
        const espera = new Promise((_, no) => { reloj = setTimeout(() => no(Object.assign(new Error("La señal tardó demasiado en contestar."), { red: true })), ms); });
        let r;
        try { r = await Promise.race([sb.functions.invoke("centroamericano-mesa", { body: Object.assign({ action: accion, token: token() }, cuerpo || {}) }), espera]); }
        finally { clearTimeout(reloj); }
        let { data, error } = r;
        const estadoHttp = error && error.context && error.context.status;
        if (error && error.context && typeof error.context.json === "function") {
            try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ }
        }
        if (error || !data || data.error) {
            const propio = data && typeof data.error === "string" ? data.error : "";
            const e = new Error(propio || (estadoHttp >= 500 ? "El servidor tardó en arrancar. Se vuelve a intentar." : (error && error.message) || "No hubo respuesta. Revisa tu conexión."));
            e.http = estadoHttp;
            if (!estadoHttp && !propio) e.red = true;
            throw e;
        }
        return data;
    }

    // Con reintentos: 3 intentos (ahora, a los 1,5 s y a los 4 s) si fue la señal o el servidor; un «no» de
    // verdad (enlace vencido, mesa fuera de rango…) se devuelve de una vez.
    async function invocar(accion, cuerpo, { intentos = 3, ms } = {}) {
        const tiempo = ms || (accion === "planilla" ? TIEMPO_FOTO_MS : TIEMPO_MS);
        try {
            const d = await Cola.conReintentos(() => llamar(accion, cuerpo, tiempo), { esperas: Cola.ESPERAS_MS.slice(0, intentos) });
            ponerSenal(true);
            return d;
        } catch (e) {
            ponerSenal(!Cola.esDeRed(e));
            throw e;
        }
    }

    function ponerSenal(hay) {
        const volvio = sinSenal && hay;
        sinSenal = !hay;
        pintarConexion();
        if (volvio && cola && cola.lista().length) cola.vaciar();
    }

    // Lo que NO puede perderse (resultado, ilegal, tiempos, presencia, foto): si no salió por la señal, queda
    // en la cola de la tablet y se manda solo. Cada anotación lleva su `id`: reenviarla no la duplica.
    const CON_ID = { anotar: true, tiempo: true };
    // Con las labores concluidas ya no se escribe nada (la función también lo rechaza): solo se lee y se baja la bitácora.
    const concluida = () => !!(estado && estado.concluyo);
    async function escribir(accion, cuerpo, etiqueta, meta) {
        if (concluida()) throw new Error("Ya concluiste tus labores: ya no puedes anotar ni guardar. Si necesitas seguir, pide a la organización que las reabra.");
        const id = Cola.uuid();
        const c = CON_ID[accion] ? Object.assign({ id }, cuerpo) : cuerpo;
        try { return { d: await invocar(accion, c) }; }
        catch (e) {
            if (!Cola.esDeRed(e) || !cola) throw e;
            await cola.agregar({ id, accion, cuerpo: c, etiqueta, meta });
            return { encolado: true, id };
        }
    }

    // El aviso fijo de arriba: sin conexión, chess-results sin contestar (se ven las últimas mesas) y lo pendiente.
    function pintarConexion() {
        const caja = $("conexion");
        if (!caja) return;
        const pend = cola ? cola.lista() : [];
        const partes = [];
        let nivel = "";
        if (sinSenal) { nivel = "mal"; partes.push(estado ? "Sin conexión con el servidor. Ves tus mesas como estaban a las " + hora(estado.leido_en) + "." : "Sin conexión con el servidor."); }
        else if (estado && estado.datos && estado.datos.viejo) { nivel = "ojo"; partes.push("chess-results no está contestando: estas mesas son de las " + hora(estado.datos.desde) + ". Lo que anotes aquí se guarda igual."); }
        if (pend.length) { nivel = nivel || "ojo"; partes.push("Pendiente de enviar (" + pend.length + "): " + pend.map((x) => x.etiqueta).join(", ") + ". Se manda solo cuando haya señal; no cierres esta página."); }
        caja.hidden = !partes.length;
        caja.dataset.nivel = nivel;
        const botones = pend.length ? [el("button", { type: "button", class: "cam-btn", "data-accion": "reintentar-cola", onclick: () => { cola.vaciar(); } }, "Mandar ahora")] : [];
        caja.replaceChildren(el("p", { texto: (nivel === "mal" ? "⚠ " : "") + partes.join(" ") }), ...botones);
    }

    const clave = (mesa, color) => mesa + "|" + color;
    const marcaDe = (mesa, color) => (estado.marcas || {})[clave(mesa, color)] || { ilegales: 0, irregularidades: 0, ultima_ilegal: null, ultima_irregularidad: null, levantadas: 0, ultima_levantada: null };
    const nombreDe = (m, color) => (color === "blancas" ? m.blancas : m.negras);
    // La banderita del país de cada jugador, al final de su nombre (js/centroamericano-banderas.js); sin ella, nada.
    const banderaDe = (m, color) => (window.CentroamericanoBanderas ? window.CentroamericanoBanderas.deMesa(m, color) : null);
    const hora = (x, opciones) => window.HoraCR.hora(x, opciones);

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

    // El resultado que el árbitro ELIGIÓ en el desplegable y todavía no guardó: ilumina y hace parpadear al jugador que gana (a los dos en
    // tablas) para que se asegure de haber elegido bien ANTES de tocar «Guardar». Guardado, deja de brillar. 1/4 → blancas, 3/5 → negras, 2 → tablas.
    function gananElegido(m, color) {
        const v = elegido[m.mesa];
        if (v == null || v === "" || v === m.valor) return null;
        if (v === "2") return "tablas";
        if (color === "blancas" && (v === "1" || v === "4")) return "gana";
        if (color === "negras" && (v === "3" || v === "5")) return "gana";
        return null;
    }
    function bloqueJugador(m, color) {
        const k = marcaDe(m.mesa, color);
        const nombre = nombreDe(m, color);
        const ocupada = ocupadas.has(m.mesa);
        // Las marcas: el icono y, si hay más de una, «×2». La palabra queda para el lector de pantalla.
        const marcas = el("div", { class: "cam-marcas" });
        if (k.ilegales) marcas.append(el("span", { class: "cam-marca", "data-tipo": "ilegal", title: "Jugada ilegal" + (k.ilegales > 1 ? " ×" + k.ilegales : "") },
            el("span", { class: "cam-marca-glifo", "aria-hidden": "true", texto: C.marcasTexto({ ilegales: k.ilegales }) }), icono("ilegal"), el("span", { class: "sr-only", texto: "Ilegal" }), k.ilegales > 1 ? el("span", { texto: " ×" + k.ilegales }) : null));
        if (k.irregularidades) marcas.append(el("span", { class: "cam-marca", "data-tipo": "irregularidad", title: "Irregularidad" + (k.irregularidades > 1 ? " ×" + k.irregularidades : "") },
            el("span", { class: "cam-marca-glifo", "aria-hidden": "true", texto: C.marcasTexto({ irregularidades: k.irregularidades }) }), icono("irregularidad"), el("span", { class: "sr-only", texto: "Irregularidad" }), k.irregularidades > 1 ? el("span", { texto: " ×" + k.irregularidades }) : null));
        // Las veces que se levantó de la mesa (cada toque queda en la bitácora con la hora): «×3».
        if (k.levantadas) marcas.append(el("span", { class: "cam-marca", "data-tipo": "levanto", title: "Se levantó de la mesa " + k.levantadas + (k.levantadas === 1 ? " vez" : " veces") },
            icono("levantado"), el("span", { class: "sr-only", texto: "Se levantó " + k.levantadas + (k.levantadas === 1 ? " vez" : " veces") }), k.levantadas > 1 ? el("span", { "aria-hidden": "true", texto: " ×" + k.levantadas }) : null));
        const acciones = el("div", { class: "cam-acciones" },
            botonJugador("levanto", "levantado", "Anotar que " + nombre + " se levantó de la mesa" + (k.levantadas ? " (van " + k.levantadas + ")" : ""), "Se levantó", () => levanto(m, color), { variante: "cam-btn-icono-levanto", deshabilitado: ocupada }),
            botonJugador("ilegal", "ilegal", "Jugada ilegal de " + nombre, "Ilegal", () => ilegal(m, color), { variante: "cam-btn-icono-rojo", deshabilitado: ocupada }),
            botonJugador("irregularidad", "irregularidad", "Irregularidad de " + nombre, "Irregularidad", () => irregularidad(m, color), { deshabilitado: ocupada }));
        // «Anular»: solo aparece cuando hay algo que anular.
        const anulares = el("div", { class: "cam-anulares" });
        if (k.ultima_ilegal) anulares.append(botonJugador("anular-ilegal", "anular", "Anular la última ilegal de " + nombre, "Anular la última ilegal", () => anular(m, color, "ilegal", k.ultima_ilegal), { variante: "cam-btn-icono-anular", deshabilitado: ocupada }));
        if (k.ultima_irregularidad) anulares.append(botonJugador("anular-irregularidad", "anular", "Anular la última irregularidad de " + nombre, "Anular la última irregularidad", () => anular(m, color, "irregularidad", k.ultima_irregularidad), { variante: "cam-btn-icono-anular", deshabilitado: ocupada }));
        if (k.ultima_levantada) anulares.append(botonJugador("anular-levanto", "anular", "Anular la última vez que se levantó " + nombre, "Anular la última vez que se levantó", () => anular(m, color, "levanto", k.ultima_levantada), { variante: "cam-btn-icono-anular", deshabilitado: ocupada }));
        const gana = gananElegido(m, color);
        return el("div", { class: "cam-jugador", "data-color": color, "data-elegido": gana },
            el("div", { class: "cam-jugador-fila" },
                el("span", { class: "cam-color", "data-color": color, title: color === "blancas" ? "Blancas" : "Negras" }, el("span", { class: "sr-only", texto: color === "blancas" ? "Blancas" : "Negras" })),
                el("span", { class: "cam-nombre" }, el("span", { class: "cam-nombre-texto" }, nombre, banderaDe(m, color))),
                el("span", { class: "cam-jugador-estado" }, gana ? el("span", { class: "cam-gana", texto: gana === "tablas" ? "Tablas" : "Gana" }) : null, cuentaDe(m, color)),
                el("div", { class: "cam-jugador-botones" }, bloquePresencia(m, color), acciones)),
            // Lo que cambia (las marcas, «Anular», la guía del tiempo de espera) va en UNA franja de altura reservada: la tarjeta no se mueve.
            el("div", { class: "cam-jugador-extra" },
                cuentaDe(m, color) ? el("p", { class: "cam-cuenta-guia", "data-color": color, hidden: true }, "⏰ Se acabó el tiempo de espera: por reglas pierde por incomparecencia. Tú decides.") : null,
                marcas, anulares.children.length ? anulares : null));
    }

    // La banda de las ilegales de una mesa, sacada de las marcas (no de un recuerdo de la
    // pantalla): si se recarga la página, sigue ahí.
    function bandas(m) {
        const out = [];
        for (const color of ["blancas", "negras"]) {
            const k = marcaDe(m.mesa, color);
            if (k.ilegales >= 2) {
                const a = C.avisoIlegal(k.ilegales, nombreDe(m, color), color, minutosIlegal());
                const caja = el("div", { class: "cam-alerta", role: "alert", "data-nivel": "pierde" }, el("strong", { texto: a.titulo + ". " }), a.texto);
                if (m.valor === "0") caja.append(el("div", { class: "cam-acciones" }, el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "poner-pierde", onclick: () => ponerResultado(m, a.resultado) },
                    "Poner el resultado: pierde " + (color === "blancas" ? "las blancas" : "las negras") + " (" + M.textoResultado(a.resultado) + ")")));
                out.push(caja);
            } else if (k.ilegales === 1) {
                const a = C.avisoIlegal(1, nombreDe(m, color), color, minutosIlegal());
                // Una sola línea visible (el aviso completo lo oyen el lector de pantalla y el cuadro que salió al anotar): así la tarjeta no crece.
                out.push(el("div", { class: "cam-aviso-suave", "data-nivel": "primera" },
                    el("span", { class: "cam-aviso-corto", "aria-hidden": "true" }, el("strong", { texto: "Primera ilegal. " }), nombreDe(m, color) + ": " + minutosIlegal() + " min más al rival; con otra, pierde."),
                    el("span", { class: "sr-only", texto: a.titulo + ". " + a.texto })));
            }
        }
        return out;
    }

    // Ficha A: saca de cada jugador su franja de marcas y «Anular» y las junta en una sola, con un puntito del color de cada uno (blancas o negras).
    // Altura reservada UNA vez por tarjeta: anotar una ilegal no la mueve. Un jugador sin marcas no deja ni el puntito.
    function franjaMarcas(jugadores) {
        return el("div", { class: "cam-mesa-marcas" }, ...jugadores.map((j) => {
            const x = j.querySelector(".cam-jugador-extra");
            if (x) x.remove();
            const color = j.dataset.color;
            const hay = !!(x && x.querySelector(".cam-marca, .cam-anulares"));
            return el("div", { class: "cam-extra-grupo", "data-color": color, "data-vacio": hay || (x && x.querySelector(".cam-cuenta-guia")) ? null : "si" },
                hay ? el("span", { class: "cam-color", "data-color": color, "aria-hidden": "true" }) : null,
                hay ? el("span", { class: "sr-only", texto: color === "blancas" ? "Blancas: " : "Negras: " }) : null,
                ...(x ? [...x.childNodes] : []));
        }));
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
        // Fair Play: la mesa elegida lleva un borde dorado que brilla y una banda que dice a quién retener (o que no aplica).
        const fp = ((estado && estado.fair_play) || []).find((x) => x.mesa === m.mesa);
        const fpTexto = C.fairPlayDeMesa(fp, m, elegido[m.mesa]);
        const alcance = C.fairPlayAlcance(fp);
        const jugadores = [bloqueJugador(m, "blancas"), bloqueJugador(m, "negras")];
        jugadores.forEach((j) => { if (alcance && alcance === j.dataset.color) j.setAttribute("data-fair-play", "si"); });
        const A = fichaA();
        // Ficha A: las marcas y los «Anular» de los dos jugadores van juntos en UNA franja (la misma zona reservada de los avisos, y no una por jugador).
        const marcasJuntas = A ? franjaMarcas(jugadores) : null;
        return el("article", { id: "mesa-" + m.mesa, class: "cam-mesa", "data-ficha": A ? "a" : null, "data-mesa": String(m.mesa), "data-estado": est, "data-fair-play": fp ? fp.estado : null, "data-fp-alcance": alcance, tabindex: "-1", "aria-label": "Mesa " + m.mesa + (fp ? ", elegida para Fair Play" + (alcance === "blancas" || alcance === "negras" ? " (" + alcance + ")" : "") : "") },
            el("div", { class: "cam-mesa-cabeza" }, el("span", { class: "cam-mesa-numero", texto: "Mesa " + m.mesa }),
                el("div", { class: "cam-mesa-cabeza-acciones" },
                    el("button", { type: "button", class: "cam-btn cam-ayuda-mesa", "data-accion": "ayuda", "data-pedida": pedida ? "si" : null, disabled: pedida, "aria-label": pedida ? "Ya pediste al principal en la mesa " + m.mesa : "Pedir al árbitro principal en la mesa " + m.mesa + ": irá directo a esa mesa", onclick: () => pedirAyuda(m.mesa) },
                        icono("salvavidas"), el("span", { class: "sr-only", texto: pedida ? "Principal pedido" : "Principal en esta mesa" })),
                    el("span", { class: "cam-estado", texto: textoEstado(m, est) }))),
            // Los avisos van en una zona de altura reservada (vacía casi siempre): la tarjeta no cambia de forma al anotar. Dentro: lo de Fair Play y las ilegales.
            el("div", { class: "cam-mesa-avisos" },
                fpTexto ? el("div", { class: "cam-fp-banda", "data-tipo": fpTexto.tipo },
                    el("p", { role: fpTexto.tipo === "esperando" ? null : "status", texto: fpTexto.texto }),
                    bandaRetener(m, fp)) : null,
                bandas(m),
                marcasJuntas),
            ...jugadores,
            rapido() || A ? resultadoRapido(m, sel, pendiente, ocupada, msg, A) : el("div", { class: "cam-resultado" },
                el("p", { class: "cam-resultado-actual" }, "En chess-results: ", el("strong", { texto: M.textoResultado(m.valor) })),
                el("div", { class: "cam-resultado-fila" }, sel, botonGuardar(m, pendiente, ocupada)),
                // El «✓ Guardado» o el error ocupa siempre su renglón (reservado): al guardar no se mueve nada.
                msg ? el("p", { class: (msg.ok ? "cam-guardado" : "cam-fallo") + " cam-resultado-msg", role: msg.ok ? "status" : "alert", texto: msg.texto }) : el("p", { class: "cam-resultado-msg", "aria-hidden": "true", texto: "\u00a0" })),
            rapido() ? null : bloqueIconos(m, ocupada));
    }

    function botonGuardar(m, pendiente, ocupada) {
        return el("button", { type: "button", class: "cam-btn", "data-accion": "guardar", disabled: !pendiente || ocupada || !listaCompleta(), title: listaCompleta() ? null : "Primero la revisión previa de la ronda", onclick: () => guardar(m) }, ocupada ? "Guardando…" : "Guardar");
    }

    // En el Rápido y el Blitz: 1-0, ½-½ y 0-1 en botones grandes. Un toque GUARDA (sin «Guardar»): no hay tiempo para más.
    // Cambiar un resultado que ya está en chess-results sigue preguntando antes (lo hace guardar()). Cualquier otro
    // (incomparecencia, 0-0, borrar) va a mano en «Otro resultado», con el desplegable y «Guardar» de siempre.
    function resultadoRapido(m, sel, pendiente, ocupada, msg, fichaNueva) {
        const bloqueado = ocupada || !listaCompleta();
        const botones = RAPIDOS.map((r) => el("button", {
            type: "button", class: "cam-rapido-btn", "data-accion": "rapido", "data-valor": r.valor, "aria-pressed": String(m.valor === r.valor),
            disabled: bloqueado, title: listaCompleta() ? null : "Primero la revisión previa de la ronda",
            "aria-label": (m.valor === r.valor ? "Guardado: " : "Guardar ") + r.texto + " (" + r.ayuda + ") en la mesa " + m.mesa,
            onclick: () => { elegido[m.mesa] = r.valor; guardar(m); },
        }, el("span", { class: "cam-rapido-valor", texto: r.texto }), el("span", { class: "cam-rapido-ayuda", texto: r.ayuda })));
        const otroAbierto = pendiente && !RAPIDOS.some((r) => r.valor === elegido[m.mesa]);
        // Ficha A: «En chess-results: …» sobra (la cabecera ya dice si hay resultado y el botón guardado se ve); solo sale cuando es un resultado
        // que no tiene botón (incomparecencia, etc.), para no esconderlo.
        const sinBoton = m.valor !== "0" && !RAPIDOS.some((r) => r.valor === m.valor);
        return el("div", { class: "cam-resultado cam-resultado-rapido" },
            !fichaNueva || sinBoton ? el("p", { class: "cam-resultado-actual" }, "En chess-results: ", el("strong", { texto: M.textoResultado(m.valor) })) : null,
            el("div", { class: "cam-rapido-fila", role: "group", "aria-label": "Resultado de la mesa " + m.mesa + ": un toque y se guarda" }, ...botones),
            el("details", { class: "cam-rapido-otro", open: otroAbierto },
                el("summary", { texto: "Otro resultado (a mano)" }),
                el("div", { class: "cam-resultado-fila mt-2" }, sel, botonGuardar(m, pendiente, ocupada))),
            ocupada ? el("p", { class: "cam-guardado cam-resultado-msg", role: "status", texto: "Guardando…" })
                : msg ? el("p", { class: (msg.ok ? "cam-guardado" : "cam-fallo") + " cam-resultado-msg", role: msg.ok ? "status" : "alert", texto: msg.texto })
                : el("p", { class: "cam-resultado-msg", "aria-hidden": "true", texto: "\u00a0" }));
    }

    // ------------------------------------------------------------- los dos iconos de cada mesa: la cámara y el reloj

    // Iconos propios (SVG en línea): se ven igual en cualquier tablet y no dependen de las fuentes de emojis.
    const SVG_NS = "http://www.w3.org/2000/svg";
    const ICONOS = {
      camara: [["path", { d: "M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" }], ["circle", { cx: "12", cy: "13", r: "3.5" }]],
      reloj: [["circle", { cx: "12", cy: "12", r: "9" }], ["path", { d: "M12 7v5l3 2" }]],
      llego: [["path", { d: "M5 13l4 4L19 7" }]],
      ausente: [["path", { d: "M6 6l12 12M18 6L6 18" }]],
      dudoso: [["circle", { cx: "12", cy: "12", r: "9" }], ["path", { d: "M9.6 9.2a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8" }], ["path", { d: "M12 17.2v.01" }]],
      // Ilegal: un peón tachado (una jugada que no se puede hacer). Irregularidad: una mano (tocó una pieza, lo más común).
      ilegal: [["circle", { cx: "12", cy: "6.6", r: "3", fill: "currentColor", stroke: "none" }], ["path", { d: "M9.2 10.6h5.6l1.2 6.6H8z", fill: "currentColor", stroke: "none" }], ["rect", { x: "6.5", y: "18", width: "11", height: "2.6", rx: "1", fill: "currentColor", stroke: "none" }], ["path", { d: "M3.5 3.5l17 17", "stroke-width": "2.4" }]],
      irregularidad: [["path", { d: "M18 11V6a2 2 0 0 0-4 0" }], ["path", { d: "M14 10V4a2 2 0 0 0-4 0v2" }], ["path", { d: "M10 10.5V6a2 2 0 0 0-4 0v8" }], ["path", { d: "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" }]],
      levantado: [["circle", { cx: "12", cy: "4.5", r: "2" }], ["path", { d: "M12 7.5V15" }], ["path", { d: "M8.5 11l3.5-2.5 3.5 2.5" }], ["path", { d: "M9.5 21l2.5-6 2.5 6" }]],
      anular: [["path", { d: "M9 14L4 9l5-5" }], ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 0 11H11" }]],
      // Hablar: un globo de diálogo con tres rayitas (la conversación con el jugador).
      hablar: [["path", { d: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" }], ["path", { d: "M7.5 9.5h9M7.5 13h5.5" }]],
      salvavidas: [["circle", { cx: "12", cy: "12", r: "9" }], ["circle", { cx: "12", cy: "12", r: "3.5" }], ["path", { d: "M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" }]],
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

    // Un botón de icono de una fila de jugador. El texto va solo para lectores de pantalla y como pista (title): lo que se ve es
    // el icono (la leyenda de arriba los explica). 46 px: se toca con el dedo y con prisa.
    function botonJugador(accion, nombreIcono, etiqueta, texto, fn, { variante = "", pulsado = null, deshabilitado = false } = {}) {
        return el("button", { type: "button", class: "cam-btn-icono cam-btn-icono-chico " + variante, "data-accion": accion, "aria-pressed": pulsado === null ? null : String(pulsado), "aria-label": etiqueta, title: etiqueta, disabled: deshabilitado, onclick: fn },
            icono(nombreIcono), el("span", { class: "sr-only", texto }));
    }
    function bloqueIconos(m, ocupada) {
        const hecha = tienePlanilla(m.mesa), sube = subiendo.has(m.mesa);
        const pendiente = m.valor === "0";
        const hayLectura = lecturas(m.mesa).length > 0;
        return el("div", { class: "cam-planillas cam-iconos" },
            botonIcono("planilla", "camara",
                sube ? "Subiendo la foto de las planillas de la mesa " + m.mesa
                    : (hecha ? "Cambiar la foto de las planillas de la mesa " + m.mesa + ": tiene que salir las dos planillas juntas" : "Tomar la foto de las dos planillas de la mesa " + m.mesa + " (las dos juntas)"),
                () => subirPlanilla(m), { hecho: hecha, ocupado: sube, deshabilitado: ocupada || sube }),
            botonIcono("hablar", "hablar", "Hablar con el jugador de la mesa " + m.mesa + " (frases en inglés y francés, y traductor)", () => abrirHablar(m), { deshabilitado: ocupada }),
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
        // La cámara saca al navegador de la página a propósito: no cuenta como salirse del modo concentración.
        Conc.pausa(90000);
        const G = window.GuiaPlanillas;
        if (G && G.disponible()) {
            const r = await G.abrir({
                titulo: "Foto de las planillas · Mesa " + m.mesa,
                rotulos: ["Blancas · " + m.blancas, "Negras · " + m.negras],
            });
            Conc.pausa(0);
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
            const r = await escribir("planilla", { ronda: estado.ronda, mesa: m.mesa, imagen }, "Foto de las planillas de la mesa " + m.mesa, { mesa: m.mesa });
            if (r.encolado) { avisar("Sin señal: la foto de la mesa " + m.mesa + " quedó guardada en la tablet y se manda sola cuando vuelva la conexión. No cierres la página."); return; }
            const d = r.d;
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
            Conc.pausa(0);
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
        Conc.pausa(90000); // la cámara del aparato saca al navegador de la página
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
        if (rapido()) { pintarListaRapida(caja); return; }
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

    // En el Rápido y el Blitz, la revisión previa es UN botón: relojes (con el ritmo de este torneo) y tableros. La función
    // sigue pidiendo los dos pasos en orden: se aprueban uno detrás del otro.
    function pintarListaRapida(caja) {
        const ritmo = rapido() === "blitz" ? "el Blitz" : "el Rápido";
        caja.replaceChildren(
            el("h2", { id: "lista-titulo", class: "font-bold text-xl", texto: "Antes de la ronda " + estado.ronda + " de " + ritmo }),
            el("p", { class: "mt-1", texto: "Relojes con el ritmo de " + ritmo + " y listos para las blancas; tableros bien orientados y con las 32 piezas en su lugar." }),
            el("div", { class: "cam-acciones" }, el("button", { type: "button", id: "aprobar-paso", class: "cam-btn", "data-paso": "todos", onclick: aprobarTodo }, "Relojes y tableros listos")),
            el("p", { class: "cam-herramientas-nota mt-2", texto: "Hasta tocarlo no se pueden guardar resultados de esta ronda." }));
    }
    async function aprobarTodo() {
        $("aprobar-paso").disabled = true;
        try {
            for (const paso of PASOS_LISTA) {
                if (listaOk().includes(paso.id)) continue;
                const d = await invocar("lista", { ronda: estado.ronda, paso: paso.id });
                estado.lista = d.lista;
            }
            pintar();
            avisar("Listo: ya puedes guardar resultados.");
        } catch (e) {
            avisar(e.message, true);
            pintar();
        }
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
                el("p", { class: "mt-2", texto: "A las " + hora(estado.finalizada) + ". " + (rapido() ? "" : "Entrega las planillas ordenadas por mesa y firmadas. ") + "Si algún resultado cambia, avísale a la organización: ella puede reabrir tu ronda." }));
            return;
        }
        caja.dataset.estado = "pendiente";
        if (rapido()) { pintarRevisionRapida(caja); return; }
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

    // En el Rápido y el Blitz no hay planillas que juntar ni fotos: una sola confirmación, la de los resultados.
    // La función pide las tres revisiones; esta confirmación las cubre (ver «El Rápido y el Blitz: la mesa en un toque»).
    function pintarRevisionRapida(caja) {
        const filas = estado.mesas.slice().sort((a, b) => a.mesa - b.mesa).map((m) => el("tr", {},
            el("td", { texto: String(m.mesa) }), el("td", { texto: m.blancas + " – " + m.negras }), el("td", { texto: M.textoResultado(m.valor) })));
        caja.replaceChildren(
            el("h2", { id: "revision-titulo", class: "font-bold text-xl", texto: "Terminaste tus mesas: revisa y cierra la ronda" }),
            el("div", { class: "cam-tabla-envoltura mt-3" }, el("table", { class: "cam-tabla" },
                el("caption", { class: "sr-only", texto: "Resultados de tus mesas para revisar" }),
                el("thead", {}, el("tr", {}, el("th", { scope: "col", texto: "Mesa" }), el("th", { scope: "col", texto: "Partida" }), el("th", { scope: "col", texto: "Resultado" }))),
                el("tbody", {}, ...filas))),
            el("div", { class: "mt-3" }, el("label", { class: "cam-check cam-check-revision" },
                el("input", { type: "checkbox", id: "rev-resultados", class: "w-6 h-6", checked: !!revisadas["rev-resultados"], onchange: (e) => { revisadas["rev-resultados"] = e.target.checked; $("finalizar").disabled = !e.target.checked; } }),
                el("span", { texto: "Revisé que cada resultado es el que quedó en la mesa." }))),
            el("div", { class: "cam-acciones" }, el("button", { type: "button", id: "finalizar", class: "cam-btn", disabled: !revisadas["rev-resultados"], onclick: finalizarRonda }, "Finalizar la ronda " + estado.ronda)));
    }

    async function finalizarRonda() {
        if (rapido()) {
            $("finalizar").disabled = true;
            try {
                const ok = $("rev-resultados").checked;
                const d = await invocar("finalizar", { ronda: estado.ronda, revision: { resultados: ok, planillas: ok, firmadas: ok } });
                estado.finalizada = d.finalizada_en;
                pintar();
                avisar("Ronda " + estado.ronda + " finalizada: la organización ya lo sabe.");
            } catch (e) {
                avisar(e.message, true);
                $("finalizar").disabled = false;
            }
            return;
        }
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

    // Quien no está marcado «llegó» no ha llegado: no hay un botón de «no llegó» (se entiende por omisión).
    const llego = (mesa, color) => presenciaDe(mesa, color) === true;
    function pintarPresenciaResumen() {
        // Rápido y Blitz: no se marca quién llegó (ver bloquePresencia).
        if (rapido()) { $("presencia-resumen").textContent = ""; $("presencia-todos").hidden = true; return; }
        const total = estado.mesas.length * 2;
        const llegaron = estado.mesas.reduce((n, m) => n + (llego(m.mesa, "blancas") ? 1 : 0) + (llego(m.mesa, "negras") ? 1 : 0), 0);
        $("presencia-resumen").textContent = total ? "Han llegado " + llegaron + " de " + total + " jugadores" + (llegaron < total ? " · faltan " + (total - llegaron) : "") + "." : "";
        const b = $("presencia-todos");
        if (b) b.hidden = concluida() || total === 0 || llegaron >= total;
    }

    // «Marcar que llegaron todos»: un toque para arrancar la ronda, para quien llegó junto. A quien ya está marcado no le cambia nada.
    function sinLlegar() {
        const out = [];
        for (const m of estado.mesas) for (const color of ["blancas", "negras"]) if (!llego(m.mesa, color)) out.push({ mesa: m.mesa, color });
        return out;
    }
    async function marcarTodosLlegaron() {
        const falta = sinLlegar();
        if (!falta.length) return;
        const sigue = await Avisos.confirmar("¿Marcar que llegaron los " + falta.length + " jugadores que todavía no están marcados como llegados?", { titulo: "Llegaron todos", aceptar: "Sí, llegaron todos" });
        if (!sigue) return;
        const antes = presencias().slice();
        const ahora = new Date().toISOString();
        estado.presencia = presencias().filter((x) => x.presente).concat(falta.map((x) => ({ mesa: x.mesa, color: x.color, presente: true, marcada: ahora })));
        pintar();
        try {
            await escribir("presencia_todos", { ronda: estado.ronda }, "Presencia de todos los jugadores");
            avisar("Listo: " + falta.length + " jugadores marcados como llegados.");
        } catch (e) { estado.presencia = antes; pintar(); avisar(e.message, true); }
    }

    async function marcarPresencia(m, color, presente) {
        const antes = presencias().slice();
        // Se ve al instante; si la función dice que no, se deshace.
        estado.presencia = presencias().filter((x) => !(x.mesa === m.mesa && x.color === color)).concat([{ mesa: m.mesa, color, presente, marcada: new Date().toISOString() }]);
        pintar();
        // Con la hora del toque y la del inicio que usa la cuenta de la tablet: si llega tarde, la función deja la nota en la bitácora.
        const cuerpo = { ronda: estado.ronda, mesa: m.mesa, color, presente, ocurrio: new Date().toISOString() };
        const ini = inicioEfectivo();
        if (ini) cuerpo.inicio = ini;
        try {
            const res = await escribir("presencia", cuerpo, "Presencia de " + (color === "blancas" ? "blancas" : "negras") + " en la mesa " + m.mesa, { mesa: m.mesa });
            const d = res.d;
            if (d && d.anuladas && d.anuladas.length) for (const id of d.anuladas) anuladas.add(id);
            if (d && d.tarde) {
                // Queda a la vista en «Lo anotado» y el reloj que se apaga ya la cuenta, sin esperar la próxima lectura.
                estado.anotaciones = (estado.anotaciones || []).concat([d.tarde]);
                avisar(nombreDe(m, color) + " llegó " + C.tiempoEnPalabras(C.leerTarde(d.tarde.texto)) + " tarde: quedó anotado en la bitácora.");
            }
            if (d && ((d.anuladas && d.anuladas.length) || d.tarde)) pintar();
        }
        catch (e) { estado.presencia = antes; pintar(); avisar(e.message, true); }
    }
    // La hora en que empezó la ronda, la que usa la cuenta del tiempo de espera (la marcada por el árbitro de la categoría o, si no, la del horario).
    function inicioEfectivo() {
        const H = window.CentroamericanoHorario;
        const ev = H && estado && estado.ronda ? H.EVENTOS.find((e) => e.ronda === estado.ronda) : null;
        return ev ? new Date(H.inicioDe(ev, iniciosMarcados())).toISOString() : null;
    }

    // Solo hay un botón: «Llegó». Sin marcar se entiende que no ha llegado. Al marcarlo, el botón desaparece y queda su estado con un
    // «Corregir» chico (por si fue un toque equivocado: lo vuelve a poner como que no ha llegado).
    function bloquePresencia(m, color) {
        // En el Rápido y el Blitz no se marca quién llegó: la tolerancia es su propio reloj (pierde cuando le cae la bandera), así que
        // no hay presencia, ni cuenta de espera, ni «Inició la ronda». Una incomparecencia se pone a mano en «Otro resultado».
        if (rapido()) return null;
        const v = llego(m.mesa, color);
        const nombre = nombreDe(m, color);
        const texto = v ? "✓ Llegó" : "✗ No ha llegado";
        return el("div", { class: "cam-presencia", "data-presente": v ? "si" : "no" },
            // El estado: un icono (✓ llegó, ✗ no ha llegado) con su texto para el lector de pantalla.
            el("span", { class: "cam-presencia-estado", title: texto }, icono(v ? "llego" : "ausente"), el("span", { class: "sr-only", texto })),
            v && !concluida()
                ? el("button", { type: "button", class: "cam-btn cam-btn-chico cam-btn-claro", "data-accion": "corregir-presencia", "aria-label": "Corregir: " + nombre + " no ha llegado", onclick: () => marcarPresencia(m, color, false) }, "Corregir")
                : botonJugador("presente", "llego", nombre + " llegó", "Llegó", () => marcarPresencia(m, color, true), { variante: "cam-btn-icono-verde", pulsado: false }));
    }

    // El cronómetro de cada jugador que no ha llegado: cuenta el tiempo de espera (30 min desde que empezó la ronda de su categoría) y,
    // al llegar a cero, el nombre se resalta como GUÍA de que ya perdería por incomparecencia. El árbitro decide: no se hace nada solo.
    function finDeLaEspera() {
        const H = window.CentroamericanoHorario;
        if (!H || !estado) return null;
        const e = H.estado(new Date(), iniciosMarcados());
        return e.enCurso && e.ronda === estado.ronda ? e.hasta.getTime() : null;
    }
    function cuentaDe(m, color) {
        if (rapido()) return null;
        const fin = finDeLaEspera();
        if (fin == null || llego(m.mesa, color) || m.valor !== "0" || concluida()) return null;
        return el("span", { class: "cam-cuenta", role: "timer", "data-fin": String(fin), "aria-label": "Tiempo de espera de " + nombreDe(m, color) }, "");
    }
    const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    function latirCuentas() {
        const ahora = Date.now();
        for (const c of document.querySelectorAll(".cam-cuenta")) {
            const resta = Number(c.dataset.fin) - ahora;
            c.textContent = "⏱ " + mmss(resta);
            const jug = c.closest(".cam-jugador");
            if (!jug) continue;
            const vencido = resta <= 0;
            if (vencido !== (jug.dataset.vencido === "si")) {
                jug.dataset.vencido = vencido ? "si" : "no";
                const guia = jug.querySelector(".cam-cuenta-guia") || (jug.closest(".cam-mesa") || document).querySelector('.cam-cuenta-guia[data-color="' + jug.dataset.color + '"]');
                if (guia) guia.hidden = !vencido;
            }
        }
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
    // La hora exacta que el árbitro marcó con el botón (un momento, en ISO): la de su lectura de los relojes. Si no marca
    // ninguna, la función anota la hora en que llega el guardado. Nunca se teclea: así no hay horas inventadas.
    let horaMarcada = null;
    let txLlenado = null;         // { mesa, c }: lo que se puso en las casillas desde la transmisión sin atraso
    // «El reloj se apagó»: la misma ventanita pasa a calcular los tiempos de esa mesa (ver relojApagado en
    // js/centroamericano-mesas.js). Lo escrito queda en `apagado` mientras la ventana se vuelve a dibujar.
    let modoApagado = false;
    let apagado = {};

    const sinTerminar = () => estado.mesas.filter((m) => m.valor === "0").sort((a, b) => a.mesa - b.mesa);
    const lecturas = (mesa) => ((estado && estado.tiempos) || []).filter((x) => x.mesa === mesa);

    function abrirTiempos(porLaOrganizacion, mesa) {
        if (concluida()) return;   // con las labores concluidas ya no se anota nada
        tiemposAbierto = true;
        // Si la pide la organización en una pantalla angosta (un celular), sale minimizada: abierta taparía el aviso
        // que hay que leer primero. En una tablet sale abierta, como una ventanita en la esquina.
        tiemposMin = !!porLaOrganizacion && window.innerWidth < 700;
        tiemposPorMesa = !!mesa;
        modoApagado = false;
        if (mesa) lecturaMesa = mesa;
        if (estado) pintarTiempos();
        if (porLaOrganizacion) avisar("El árbitro principal pide un control de tiempos: anota el tiempo y las jugadas de las blancas y de las negras en las mesas sin terminar.");
    }

    function leerBorrador() {
        if ($("lt-tb")) borrador = { tb: $("lt-tb").value, jb: $("lt-jb").value, tn: $("lt-tn").value, jn: $("lt-jn").value };
    }

    // Mientras se escribe: los dos puntos solos y, debajo, lo que se entendió («45 min 10 s») o por qué no.
    const textoReloj = (v) => {
        if (!v) return "Solo números: 4510 → 45:10";
        const seg = C.leerTiempo(v);
        return seg === null ? "No se entiende: los minutos y segundos llegan hasta 59" : "= " + C.tiempoEnPalabras(seg);
    };
    function reloj(campo, id) {
        const v = C.ponerDosPuntos(campo.value);
        if (campo.value !== v) campo.value = v;
        const ayuda = $("lt-a" + id);
        if (ayuda) ayuda.textContent = textoReloj(v);
        campo.setAttribute("aria-invalid", v && C.leerTiempo(v) === null ? "true" : "false");
    }

    // Lo que pone un botón de «Llenar…» no se vuelve a leer de las casillas viejas al dibujar (las pisaría con lo que había escrito).
    let borradorFresco = false;
    function llenarYPintar(c, alAhora) { llenarConTx(c, alAhora); borradorFresco = true; pintarTiempos(); }

    function pintarTiempos() {
        const caja = $("control-tiempos");
        caja.hidden = !tiemposAbierto;
        if (!tiemposAbierto) { caja.replaceChildren(); return; }
        if (borradorFresco) borradorFresco = false; else leerBorrador();
        const mesas = sinTerminar();
        if (!lecturaMesa || !mesas.some((m) => m.mesa === lecturaMesa)) lecturaMesa = mesas.length ? mesas[0].mesa : null;
        // Otra mesa: lo escrito era de la anterior.
        if (borradorMesa !== lecturaMesa) { borrador = {}; horaMarcada = null; txLlenado = null; borradorMesa = lecturaMesa; }
        caja.dataset.minimizada = tiemposMin ? "si" : "no";
        const cabeza = el("div", { class: "cam-flotante-cabeza" },
            el("strong", { class: "cam-flotante-titulo" }, icono("reloj"), el("span", { texto: lecturaMesa ? "Mesa " + lecturaMesa + (modoApagado ? " · Reloj apagado" : "") : "Control de tiempos" })),
            el("span", { class: "cam-flotante-botones" },
                el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "minimizar-tiempos", "aria-expanded": tiemposMin ? "false" : "true", "aria-label": tiemposMin ? "Abrir el control de tiempos" : "Minimizar el control de tiempos", title: tiemposMin ? "Abrir" : "Minimizar", onclick: () => { tiemposMin = !tiemposMin; pintarTiempos(); } }, tiemposMin ? "▢" : "–"),
                el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", "data-accion": "cerrar-tiempos", "aria-label": "Cerrar el control de tiempos", title: "Cerrar", onclick: () => { tiemposAbierto = false; pintarTiempos(); } }, "✕")));
        if (tiemposMin) { caja.replaceChildren(cabeza); return; }
        if (!mesas.length) { caja.replaceChildren(cabeza, el("p", { class: "cam-flotante-cuerpo", texto: "Todas tus mesas ya tienen resultado: no hay partidas sin terminar." })); return; }
        const m = mesas.find((x) => x.mesa === lecturaMesa);
        if (modoApagado) { caja.replaceChildren(cabeza, formApagado(m, mesas)); return; }
        // La transmisión sin atraso: si reconoce esta mesa, las casillas se llenan solas con sus relojes (el árbitro las
        // revisa con el reloj y guarda); si no la reconoce, queda el formulario de siempre, a mano, y lo dice.
        const VIVO = window.CentroamericanoArbitroVivo;
        const ctlTx = vivoDe(lecturaMesa);
        const nuevaTx = ctlTx && !yaAnotado(lecturaMesa, ctlTx);
        if (nuevaTx && !borrador.tb && !borrador.tn && !borrador.jb && !borrador.jn && !horaMarcada) llenarConTx(ctlTx);
        const llena = txLlenado && txLlenado.mesa === lecturaMesa;
        const conTx = mesas.filter((x) => { const c = vivoDe(x.mesa); return c && !yaAnotado(x.mesa, c); }).length;
        const bloqueTx = ctlTx
            ? el("div", { class: "cam-tx-control", id: "lt-tx" },
                el("p", { class: "text-sm", texto: "📡 Transmisión sin atraso: relojes después de la jugada " + ctlTx.jugada + ", a las " + textoHoraExacta(ctlTx.ocurrio).replace(/\.$/, "") + "."
                    + (llena ? " Ya están en las casillas: revísalos con el reloj y toca «Guardar»." : nuevaTx ? "" : " Ya está anotado.") }),
                el("p", { class: "text-sm", texto: "El reloj de quien tiene el turno sigue corriendo desde esa hora: si ya lleva un rato pensando, «Llenar con los relojes de ahora» le descuenta ese rato y marca la hora de este momento." }),
                el("div", { class: "cam-acciones" },
                    llena ? null : el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", id: "lt-tx-llenar", onclick: () => llenarYPintar(ctlTx) }, "Llenar con la transmisión"),
                    el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", id: "lt-tx-ahora", onclick: () => llenarYPintar(ctlTx, true) }, "Llenar con los relojes de ahora")))
            : VIVO && VIVO.conectada() ? el("p", { class: "text-sm cam-tx-no", id: "lt-tx-no", texto: "📡 " + (VIVO.noReconoce(lecturaMesa) || "Esta mesa no está en la transmisión.") + " Anótalo a mano, como siempre." }) : null;
        const botonTodas = conTx ? el("button", { type: "button", id: "lt-tx-todas", class: "cam-btn cam-btn-claro", title: "Anota en la bitácora los relojes de la transmisión de todas tus mesas sin terminar", onclick: anotarTodasTx }, "Anotar todas desde la transmisión (" + conTx + ")") : null;
        const ult = lecturas(lecturaMesa).slice(0, 1);
        const lado = (color, nombre, id) => el("fieldset", { class: "cam-tiempo-lado", "data-color": color },
            el("legend", {}, el("span", { class: "cam-color", "data-color": color, texto: color === "blancas" ? "Blancas" : "Negras" }), " ", el("span", { class: "cam-tiempo-nombre" }, nombre, m ? banderaDe(m, color) : null)),
            el("div", { class: "grid grid-cols-2 gap-2" },
                el("div", {}, el("label", { for: "lt-t" + id, class: "block text-sm font-bold", texto: "Tiempo" }),
                    // Se escriben solo los números y los dos puntos se ponen solos (el teclado numérico no los trae).
                    el("input", { id: "lt-t" + id, type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "h:mm:ss", class: "cam-campo", "aria-describedby": "lt-a" + id, value: borrador["t" + id] || "", oninput: (e) => reloj(e.target, id) }),
                    el("span", { id: "lt-a" + id, class: "cam-tiempo-ayuda", "aria-live": "polite", texto: textoReloj(borrador["t" + id] || "") })),
                el("div", {}, el("label", { for: "lt-j" + id, class: "block text-sm font-bold", texto: "Jugadas" }), el("input", { id: "lt-j" + id, type: "number", min: "0", max: "400", inputmode: "numeric", class: "cam-campo", value: borrador["j" + id] || "" }))));
        const horaDeLectura = el("div", { class: "cam-hora-control" },
            el("span", { class: "text-sm font-bold", id: "lt-hora-etiqueta", texto: "Hora del control" }),
            el("output", { id: "lt-hora", class: "cam-hora-valor", "aria-labelledby": "lt-hora-etiqueta", "data-marcada": horaMarcada ? "si" : "no", texto: horaMarcada ? textoHoraExacta(horaMarcada) : "Sin marcar: se anota al guardar" }),
            el("button", { type: "button", class: "cam-btn cam-btn-claro cam-btn-chico", id: "lt-marcar-hora", "data-accion": "marcar-hora", title: "Anota la hora de este momento, al segundo", onclick: marcarHora }, icono("reloj"), el("span", { texto: horaMarcada ? "Marcar de nuevo" : "Marcar la hora ahora" })));
        caja.replaceChildren(cabeza, el("form", { class: "cam-flotante-cuerpo", id: "form-tiempos", novalidate: true, onsubmit: guardarLectura },
            mesas.length > 1 ? el("div", {}, el("label", { for: "lt-mesa", class: "sr-only", texto: "Mesa" }),
                el("select", { id: "lt-mesa", class: "cam-select", onchange: (e) => { leerBorrador(); lecturaMesa = Number(e.target.value); tiemposPorMesa = false; pintarTiempos(); } },
                    ...mesas.map((x) => el("option", { value: String(x.mesa), selected: x.mesa === lecturaMesa, texto: "Mesa " + x.mesa + " — " + x.blancas + " vs " + x.negras })))) : null,
            bloqueTx,
            horaDeLectura,
            lado("blancas", m ? m.blancas : "", "b"),
            lado("negras", m ? m.negras : "", "n"),
            el("div", { class: "cam-acciones" }, el("button", { type: "submit", id: "lt-guardar", class: "cam-btn" }, "Guardar"),
                el("button", { type: "button", id: "lt-apagado", class: "cam-btn cam-btn-claro", "data-accion": "reloj-apagado", title: "Calcula cuánto le toca a cada uno con el último control de esta mesa", onclick: () => { leerBorrador(); modoApagado = true; apagado = {}; pintarTiempos(); } }, "El reloj se apagó"),
                botonTodas),
            ult.length ? el("ul", { class: "text-sm mt-2", id: "lt-ultimas", "aria-label": "Lo último anotado en la mesa " + lecturaMesa },
                ...ult.map((x) => el("li", { texto: hora(x.ocurrio) + " · Blancas " + C.formatoTiempo(x.t_blancas) + (x.j_blancas != null ? " (" + x.j_blancas + ")" : "") + " · Negras " + C.formatoTiempo(x.t_negras) + (x.j_negras != null ? " (" + x.j_negras + ")" : x.j_blancas == null ? " · jugada " + x.jugada : "") })),
                ...ult.map((x) => { const t = corriendoAhora(x); return t ? el("li", { id: "lt-corriendo", texto: t }) : null; })) : null));
    }

    // Lo anotado es del momento en que se anotó: el reloj de quien tenía el turno siguió corriendo. Si pasó un rato, se dice cuánto le
    // quedaría hoy SI NADIE HA MOVIDO (el árbitro lo comprueba con el reloj; no se anota solo). El turno sale de las jugadas.
    function corriendoAhora(x) {
        if (x.j_blancas == null || x.j_negras == null || x.t_blancas == null || x.t_negras == null) return null;
        const pasaron = Math.round((Date.now() - new Date(x.ocurrio).getTime()) / 1000);
        if (pasaron < 30 || pasaron > 3 * 3600) return null;
        const color = x.j_blancas === x.j_negras ? "blancas" : "negras";
        return "Desde esa hora pasaron " + C.tiempoEnPalabras(pasaron) + ": si nadie ha movido, a las " + color + " (les toca) les quedan ahora " + C.formatoTiempo(Math.max(0, (color === "blancas" ? x.t_blancas : x.t_negras) - pasaron)) + ".";
    }
    const textoHoraExacta = (iso) => hora(iso, { hour: "numeric", minute: "2-digit", second: "2-digit" });
    // Toca el botón y queda anotada la hora de ESE momento (la del aparato, en hora de Costa Rica al mostrarla).
    function marcarHora() {
        leerBorrador();
        horaMarcada = new Date().toISOString();
        pintarTiempos();
        if ($("lt-hora")) avisar("Hora del control marcada: " + textoHoraExacta(horaMarcada));
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
            const cuerpo = { ronda: estado.ronda, mesa, t_blancas: tB, j_blancas: jB, t_negras: tN, j_negras: jN };
            if (horaMarcada) cuerpo.ocurrio = horaMarcada;   // la función la acepta si es de hace poco; si no, anota la suya
            // Llenado desde la transmisión: queda escrito, y si el árbitro cambió algo, también.
            if (txLlenado && txLlenado.mesa === mesa) {
                const c = txLlenado.c;
                cuerpo.turno = c.turno;
                const v = txLlenado.v || c;
                cuerpo.nota = notaTx(c, !(tB === v.t_blancas && tN === v.t_negras && jB === v.j_blancas && jN === v.j_negras && horaMarcada === v.ocurrio), txLlenado.alAhora);
            }
            const r = await escribir("tiempo", cuerpo, "Control de tiempos de la mesa " + mesa, { mesa });
            const d = r.encolado ? { id: r.id, ocurrio: horaMarcada || new Date().toISOString(), jugada: Math.max(1, jB, jN) } : r.d;
            estado.tiempos = [{ id: d.id, ocurrio: d.ocurrio, mesa, jugada: d.jugada, j_blancas: jB, j_negras: jN, turno: null, t_blancas: tB, t_negras: tN, nota: "" }].concat(estado.tiempos || []);
            if (txLlenado && txLlenado.mesa === mesa) anotadosTx.add(mesa + "|" + txLlenado.c.ocurrio);
            avisar(r.encolado ? "Sin señal: el control de tiempos de la mesa " + mesa + " quedó en la tablet y se manda solo cuando vuelva la conexión." : "Control de tiempos de la mesa " + mesa + " guardado: queda en la bitácora.");
            borrador = {};
            horaMarcada = null;
            borradorMesa = null;
            txLlenado = null;
            // Desde el reloj de una mesa se cierra; si lo pidió la organización, queda abierta para la siguiente mesa.
            if (tiemposPorMesa) tiemposAbierto = false;
            pintarTiempos();
            pintar();
        } catch (e) {
            avisar(e.message, true);
            if ($("lt-guardar")) $("lt-guardar").disabled = false;
        }
    }

    // ------------------------------------------------------------- la transmisión sin atraso

    // Una tabla que la transmisión acaba de ver (triple o quíntuple repetición, 50 o 75 jugadas): un aviso arriba que no se
    // pierde hasta «Entendido», con «Ver la posición». Vibra (sin sonido: en un torneo no hay ruido). El aviso no decide
    // nada: la triple y las 50 las reclama un jugador (arts. 9.2 y 9.3); la quíntuple y las 75 son tablas sin reclamo (9.6).
    function alertaDeTablas(a) {
        const caja = $("alertas-vivo");
        if (!caja) return;
        const titulo = { triple: "Triple repetición", cinco: "Quíntuple repetición: tablas", "50": "50 jugadas sin peón ni captura", "75": "75 jugadas: tablas" }[a.tipo] || "Tablas";
        const tarjeta = el("div", { class: "cam-alerta-vivo", role: "alert", "data-tipo": a.tipo, "data-mesa": String(a.mesa) },
            el("p", { class: "cam-alerta-vivo-titulo" }, el("span", { "aria-hidden": "true", texto: "⚖ " }), el("span", { texto: titulo + " · Mesa " + a.mesa })),
            el("p", { class: "cam-alerta-vivo-texto", texto: a.texto }),
            el("div", { class: "cam-acciones" },
                el("button", { type: "button", class: "cam-btn", "data-accion": "ver-posicion", onclick: () => window.CentroamericanoArbitroVivo.abrir(a.mesa) }, "Ver la posición"),
                el("button", { type: "button", class: "cam-btn cam-btn-claro", "data-accion": "entendido-tablas", onclick: () => { tarjeta.remove(); caja.hidden = !caja.children.length; } }, "Entendido")));
        caja.prepend(tarjeta);
        caja.hidden = false;
        try { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); } catch (e) { /* el iPad no vibra: se ve igual */ }
    }

    // El control de tiempos que sale de la transmisión (relojes justo después de la última jugada, con su hora real).
    const vivoDe = (mesa) => { const V = window.CentroamericanoArbitroVivo; const v = V && V.deLaMesa(mesa); return v ? V.control(v.m, v.leida) : null; };
    // Ya anotado: un control de esa mesa de esa hora o después (de la base), o lo que esta tablet ya anotó de la transmisión.
    const anotadosTx = new Set();
    const yaAnotado = (mesa, c) => anotadosTx.has(mesa + "|" + c.ocurrio) || lecturas(mesa).some((x) => String(x.ocurrio) >= c.ocurrio);
    const notaTx = (c, corregido, alAhora) => ("Tomado de la transmisión sin atraso (" + (c.fuente === "livechess" ? "LiveChess" : "Lichess") + "): los relojes después de la jugada " + c.jugada
        + (alAhora ? " (a las " + hora(c.ocurrio, { hour: "numeric", minute: "2-digit", second: "2-digit" }) + "), con el reloj de las " + (c.turno === "negras" ? "negras" : "blancas") + " (le tocaba) descontado hasta la hora del control" : "") + (corregido ? "; corregido a mano por el árbitro" : "")).slice(0, 300);
    // `alAhora`: el reloj de quien tiene el turno sigue corriendo desde la hora de la lectura; se le descuenta lo que pasó hasta este
    // momento y el control queda con la hora de ahora (nadie ha movido: la transmisión lo habría traído).
    function llenarConTx(c, alAhora) {
        const v = { t_blancas: c.t_blancas, t_negras: c.t_negras, j_blancas: c.j_blancas, j_negras: c.j_negras, ocurrio: c.ocurrio };
        if (alAhora) {
            const ahora = Date.now(), pasaron = Math.max(0, Math.round((ahora - new Date(c.ocurrio).getTime()) / 1000));
            const campo = c.turno === "negras" ? "t_negras" : "t_blancas";
            v[campo] = Math.max(0, v[campo] - pasaron);
            v.ocurrio = new Date(ahora).toISOString();
        }
        borrador = { tb: C.formatoTiempo(v.t_blancas), jb: String(v.j_blancas), tn: C.formatoTiempo(v.t_negras), jn: String(v.j_negras) };
        horaMarcada = v.ocurrio;
        txLlenado = { mesa: lecturaMesa, c, v, alAhora: !!alAhora };
    }

    // «Anotar todas desde la transmisión»: un control de cada mesa sin terminar que la transmisión reconoce, cada uno
    // con la hora real de su última jugada, en la bitácora. Las que no reconoce se dicen: esas van a mano.
    async function anotarTodasTx() {
        const V = window.CentroamericanoArbitroVivo;
        if (!V) return;
        await V.leer();
        const mesas = sinTerminar();
        const lista = mesas.map((m) => ({ m, c: vivoDe(m.mesa) })).filter((x) => x.c && !yaAnotado(x.m.mesa, x.c));
        const aMano = mesas.filter((m) => !vivoDe(m.mesa)).map((m) => m.mesa);
        if (!lista.length) { avisar("No hay controles nuevos de la transmisión para anotar." + (aMano.length ? " Las mesas " + aMano.join(", ") + " no están en la transmisión: van a mano." : "")); return; }
        const si = await Avisos.confirmar("Se anotan en la bitácora los relojes de la transmisión de " + (lista.length === 1 ? "la mesa " : "las mesas ") + lista.map((x) => x.m.mesa).join(", ") + ", cada uno con la hora de su última jugada."
            + (aMano.length ? " " + (aMano.length === 1 ? "La mesa " : "Las mesas ") + aMano.join(", ") + (aMano.length === 1 ? " no está" : " no están") + " en la transmisión: " + (aMano.length === 1 ? "anótala" : "anótalas") + " a mano." : ""),
            { titulo: "Control de tiempos desde la transmisión", aceptar: lista.length === 1 ? "Anotarlo" : "Anotar los " + lista.length });
        if (!si) return;
        let ok = 0;
        for (const { m, c } of lista) {
            const cuerpo = { ronda: estado.ronda, mesa: m.mesa, t_blancas: c.t_blancas, j_blancas: c.j_blancas, t_negras: c.t_negras, j_negras: c.j_negras, turno: c.turno, ocurrio: c.ocurrio, nota: notaTx(c) };
            try {
                const r = await escribir("tiempo", cuerpo, "Control de tiempos de la mesa " + m.mesa, { mesa: m.mesa });
                const d = r.encolado ? { id: r.id, ocurrio: c.ocurrio, jugada: c.jugada } : r.d;
                estado.tiempos = [{ id: d.id, ocurrio: d.ocurrio, mesa: m.mesa, jugada: d.jugada, j_blancas: c.j_blancas, j_negras: c.j_negras, turno: c.turno, t_blancas: c.t_blancas, t_negras: c.t_negras, nota: cuerpo.nota }].concat(estado.tiempos || []);
                anotadosTx.add(m.mesa + "|" + c.ocurrio);
                ok++;
            } catch (e) { avisar("Mesa " + m.mesa + ": " + e.message, true); }
        }
        if (ok) avisar((ok === 1 ? "Un control de tiempos anotado" : ok + " controles de tiempos anotados") + " desde la transmisión: quedan en la bitácora.");
        borrador = {}; horaMarcada = null; txLlenado = null;
        pintarTiempos();
        pintar();
    }

    // ------------------------------------------------------------- el reloj que se apagó

    // La calculadora es de js/centroamericano-reloj-apagado.js (la misma de la organización); acá solo se le da la
    // partida y se guarda lo que el árbitro pone en el reloj nuevo como un control más (acción `tiempo`).
    function formApagado(m, mesas) {
        const mesa = lecturaMesa;
        const R = window.CentroamericanoRelojApagado;
        const marcada = estado.inicio_ronda && estado.inicio_ronda.inicio && Number(estado.inicio_ronda.ronda) === Number(estado.ronda) ? estado.inicio_ronda.inicio : null;
        const antes = mesas.length > 1 ? el("div", {}, el("label", { for: "ra-mesa", class: "sr-only", texto: "Mesa" }),
            el("select", { id: "ra-mesa", class: "cam-select", onchange: (e) => { lecturaMesa = Number(e.target.value); apagado = {}; pintarTiempos(); } },
                ...mesas.map((x) => el("option", { value: String(x.mesa), selected: x.mesa === lecturaMesa, texto: "Mesa " + x.mesa + " — " + x.blancas + " vs " + x.negras })))) : null;
        // La tablet trae solo las últimas anotaciones del árbitro; las marcas (ilegales e irregularidades de cada
        // jugador) las cuenta la función con TODA la bitácora: si dicen más de las que hay a mano, falta alguna.
        const aMano = (color, tipo) => (estado.anotaciones || []).filter((f) => f.mesa === mesa && f.color === color && f.tipo === tipo && !anuladas.has(f.id)).length;
        const incompleta = ["blancas", "negras"].some((color) => { const k = marcaDe(mesa, color); return k.ilegales > aMano(color, "ilegal") || k.irregularidades > aMano(color, "irregularidad"); });
        const inicio = R.inicioDeLaRonda(estado.ronda, marcada);
        // Las mesas que se transmiten traen sus relojes en Lichess (con atraso): un control más, si el árbitro lo pide.
        const TX = window.CentroamericanoTransmisionReloj;
        // Primero la transmisión privada sin atraso (si la organización la conectó); si no, la pública con su atraso.
        const VIVO = window.CentroamericanoArbitroVivo;
        const transmision = TX && m ? async (bonos) => {
            if (VIVO && VIVO.conectada()) {
                await VIVO.leer();
                const v = VIVO.deLaMesa(mesa);
                if (v && v.m.fuente === "livechess") { const c = VIVO.control(v.m, v.leida); if (c) return Object.assign(c, { origen: "transmision", atraso: 0, avisos: [], sinAtraso: true }); }
                else if (v) return Object.assign(TX.controlDe(VIVO.lectura(v.m), { ahora: v.leida, atraso: v.delay, inicio: inicio ? inicio.ms : null, bonos }), { sinAtraso: v.delay === 0 });
            }
            return TX.buscar({ blancas: m.blancas, negras: m.negras, ronda: estado.ronda, inicio: inicio ? inicio.ms : null, bonos });
        } : null;
        return R.armar({
            estado: apagado, mesa, incompleta, transmision, blancas: m ? m.blancas : "", negras: m ? m.negras : "",
            lecturas: lecturas(mesa), anotaciones: estado.anotaciones, anuladas, inicio,
            antes, intro: "Con el último control de esta mesa se calcula cuánto le queda a cada uno. Es una propuesta: el tiempo lo decides tú (art. 6.10).",
            boton: "Anotar en la bitácora", clase: "cam-flotante-cuerpo", avisar,
            alVolver: () => { modoApagado = false; pintarTiempos(); },
            alGuardar: async (d) => {
                const cuerpo = { ronda: estado.ronda, mesa, t_blancas: d.tB, j_blancas: d.jB, t_negras: d.tN, j_negras: d.jN, turno: d.turno, nota: d.nota, ocurrio: d.ocurrio };
                const res = await escribir("tiempo", cuerpo, "Reloj apagado en la mesa " + mesa, { mesa });
                const g = res.encolado ? { id: res.id, ocurrio: cuerpo.ocurrio, jugada: Math.max(1, d.jB, d.jN) } : res.d;
                estado.tiempos = [{ id: g.id, ocurrio: g.ocurrio, mesa, jugada: g.jugada, j_blancas: d.jB, j_negras: d.jN, turno: d.turno, t_blancas: d.tB, t_negras: d.tN, nota: d.nota }].concat(estado.tiempos || []);
                avisar(res.encolado ? "Sin señal: los tiempos de la mesa " + mesa + " quedaron en la tablet y se mandan solos cuando vuelva la conexión." : "Tiempos de la mesa " + mesa + " anotados en la bitácora: Blancas " + C.formatoTiempo(d.tB) + ", Negras " + C.formatoTiempo(d.tN) + ".");
                modoApagado = false; apagado = {};
                if (tiemposPorMesa) tiemposAbierto = false;
                pintarTiempos();
                pintar();
            },
        });
    }

    // ------------------------------------------------------------- horarios y tiempo de espera

    // La hora real en que empezó la ronda, si el árbitro de la categoría la marcó (viene en `leer`): desde ahí corre la tolerancia.
    const iniciosMarcados = () => (estado && estado.inicio_ronda && estado.inicio_ronda.inicio ? { [estado.inicio_ronda.ronda]: estado.inicio_ronda.inicio } : null);

    // Cuando se cumple el tiempo de espera de TU categoría y alguien de tus mesas sigue sin llegar, sale este aviso (vibra una vez, sin sonido:
    // en un torneo no hay ruido) con cada mesa y un botón que deja el resultado por incomparecencia YA ELEGIDO en la mesa. Enviarlo es cosa
    // tuya: se toca «Guardar» (que pide la revisión previa y comprueba contra chess-results), nunca se manda solo.
    let alertaClave = "";
    function incomparecenciaDe(m) {
        const sin = (color) => !llego(m.mesa, color);
        if (sin("blancas") && sin("negras")) return { valor: "6", texto: "0f-0f: ninguno llegó" };
        if (sin("negras")) return { valor: "4", texto: "1-0 por incomparecencia de las negras" };
        if (sin("blancas")) return { valor: "5", texto: "0-1 por incomparecencia de las blancas" };
        return null;
    }
    function pintarEsperaAlerta(e) {
        const caja = $("espera-alerta");
        if (!caja) return;
        const H = window.CentroamericanoHorario;
        const vencida = !!(estado && e && e.enCurso && e.ronda === estado.ronda && e.quedan <= 0 && !concluida());
        const ausentes = vencida ? estado.mesas.filter((m) => m.valor === "0" && incomparecenciaDe(m)).sort((a, b) => a.mesa - b.mesa) : [];
        caja.hidden = !ausentes.length;
        if (!ausentes.length) { alertaClave = ""; return; }
        const clave = estado.ronda + "|" + ausentes.map((m) => m.mesa + incomparecenciaDe(m).valor).join(",");
        const nueva = clave !== alertaClave;
        alertaClave = clave;
        $("ea-titulo").textContent = "⏰ Se cumplió el tiempo de espera (" + (H ? H.TOLERANCIA_MIN : 30) + " min) en tu categoría: " + ausentes.length + (ausentes.length === 1 ? " mesa tiene" : " mesas tienen") + " jugadores sin llegar";
        // El lector de pantalla lo anuncia cuando aparece o cambia de verdad; los repintados iguales (cada 30 s) no lo repiten.
        if (nueva) caja.setAttribute("role", "alert");
        else if (!caja.getAttribute("role")) caja.setAttribute("role", "status");
        $("ea-lista").replaceChildren(...ausentes.map((m) => {
            const inc = incomparecenciaDe(m);
            const quien = ["blancas", "negras"].filter((c) => presenciaDe(m.mesa, c) === false).map((c) => nombreDe(m, c) + " (" + c + ")").join(" y ");
            const elegidaYa = elegido[m.mesa] === inc.valor;
            return el("li", { "data-mesa": String(m.mesa) },
                el("span", { texto: "Mesa " + m.mesa + " — " + quien + " no llegó" }),
                el("button", { type: "button", class: "cam-btn cam-btn-chico", "data-accion": "incomparecencia", disabled: elegidaYa || null,
                    onclick: () => { ponerResultado(m, inc.valor); avisar("Mesa " + m.mesa + ": quedó elegido «" + inc.texto + "». Toca «Guardar» para enviarlo."); } },
                    elegidaYa ? "Resultado elegido: toca «Guardar»" : "Pasar a incomparecencia (" + inc.texto + ")"));
        }));
        if (nueva) vibrar();
    }

    function pintarEspera() {
        const H = window.CentroamericanoHorario;
        if (!H) return;
        if (rapido()) { $("espera").textContent = ""; $("espera-alerta").hidden = true; return; }
        const e = H.estado(new Date(), iniciosMarcados());
        let t = "";
        if (e.enCurso) t = e.quedan > 0 ? "⏰ " + e.enCurso.nombre + ": quedan " + H.minutosTexto(e.quedan) + " de tolerancia (hasta las " + hora(e.hasta) + ")." : "⏰ " + e.enCurso.nombre + ": la tolerancia de 30 minutos ya pasó.";
        else if (e.siguiente) t = "⏰ Sigue: " + e.siguiente.nombre + " a las " + hora(new Date(e.siguiente.inicio + ":00-06:00")) + ".";
        $("espera").textContent = t;
        pintarEsperaAlerta(e);
        sincronizarAusentes(e);
    }

    // Cuando la ronda de su categoría empieza, los que no han llegado quedan anotados como «no ha llegado» (una sola vez por ronda): así la
    // organización los ve en su lista de los que faltan. Quien después llegue se marca con «Llegó» y eso lo cambia. Nunca pisa una marca.
    let ausentesSincronizados = 0;
    async function sincronizarAusentes(e) {
        if (!estado || concluida() || !e || !e.enCurso || e.ronda !== estado.ronda || ausentesSincronizados === estado.ronda) return;
        if (!estado.mesas.some((m) => m.valor === "0" && (presenciaDe(m.mesa, "blancas") === null || presenciaDe(m.mesa, "negras") === null))) return;
        ausentesSincronizados = estado.ronda;
        try { await escribir("presencia_ausentes", { ronda: estado.ronda }, "Los jugadores que no han llegado"); }
        catch (err) { ausentesSincronizados = 0; /* se vuelve a intentar en el próximo repintado */ }
    }

    // «Inició la ronda»: cada categoría puede empezar a una hora distinta, y quien lo sabe es el árbitro de la sala. Toca el botón en el
    // momento en que empieza (o escribe la hora si avisa tarde) y desde ahí corre el tiempo de espera de SU categoría, acá y en la
    // página de la organización. La hora sale de esta tablet (así vale también sin señal, desde la cola); la función la valida.
    const horaCampo = (iso) => window.HoraCR.paraCampo(iso).slice(11, 16);
    // Una vez marcada la hora, el bloque se esconde (ya no hace falta): queda solo el botón chico «Corregir la hora de inicio de la
    // ronda» junto a la línea del tiempo de espera, por si el toque fue equivocado. Sin marcar, el bloque está a la vista.
    let corrigiendoInicio = false;
    function pintarInicio() {
        const caja = $("inicio-ronda");
        if (!caja) return;
        const H = window.CentroamericanoHorario;
        const r = estado && estado.ronda, ev = H && r ? H.EVENTOS.find((e) => e.ronda === r) : null;
        const m = estado && estado.inicio_ronda && estado.inicio_ronda.inicio ? estado.inicio_ronda : null;
        const sinBloque = !estado || !r || concluida() || !!rapido();
        caja.dataset.marcada = m ? "si" : "no";
        $("ir-corregir").hidden = sinBloque || !m || corrigiendoInicio;
        caja.hidden = sinBloque || (!!m && !corrigiendoInicio);
        if (sinBloque) return;
        $("ir-ronda").textContent = "— ronda " + r + (estado.torneo ? " de " + estado.torneo : "");
        $("ir-quitar").hidden = !m;
        $("ir-cerrar").hidden = !(m && corrigiendoInicio);
        if (document.activeElement !== $("ir-hora")) $("ir-hora").value = m ? horaCampo(m.inicio) : "";
        const h = (x) => hora(x, { hour: "numeric", minute: "2-digit" });
        const fin = (t) => h(new Date(t + (H ? H.TOLERANCIA_MIN : 30) * 60000));
        $("ir-estado").textContent = m
            ? "✓ La ronda " + r + " empezó a las " + h(m.inicio) + (m.arbitro && m.arbitro !== estado.arbitro ? " (la hora que marcó " + m.arbitro + ")" : " (la hora que marcaste)") + ". El tiempo de espera de " + (H ? H.TOLERANCIA_MIN : 30) + " min termina a las " + fin(Date.parse(m.inicio)) + "."
            : ev ? "Todavía no marcaste cuándo empezó la ronda " + r + ": el tiempo de espera cuenta desde las " + h(new Date(H.inicioDe(ev))) + " del calendario. Toca «Inició la ronda ahora» cuando empiece en tu categoría."
                : "Toca «Inició la ronda ahora» cuando empiece en tu categoría.";
    }

    // Lo que esta tablet acaba de marcar vale hasta que «leer» lo confirme: una lectura que salió ANTES de marcarla y llega DESPUÉS no la
    // pisa (antes borraba la hora y los cronómetros de los jugadores volvían al calendario hasta la lectura siguiente). A los 2 minutos
    // se suelta, por si otro enlace de la misma categoría la cambió.
    let inicioPendiente = null;
    function conservarInicio(d) {
        if (!inicioPendiente) return;
        if (Date.now() > inicioPendiente.hasta || d.ronda !== inicioPendiente.ronda) { inicioPendiente = null; return; }
        const srv = d.inicio_ronda && d.inicio_ronda.inicio;
        const confirmada = !!srv && Math.abs(Date.parse(srv) - Date.parse(inicioPendiente.inicio)) < 1000;
        if (confirmada) { inicioPendiente = null; return; }
        d.inicio_ronda = { ronda: d.ronda, inicio: inicioPendiente.inicio, arbitro: d.arbitro };
    }

    async function marcarInicio(iso, quitar) {
        const r = estado && estado.ronda;
        if (!r) return;
        const h = (x) => hora(x, { hour: "numeric", minute: "2-digit" });
        const previa = estado.inicio_ronda && estado.inicio_ronda.inicio;
        if (!quitar) {
            const d = new Date(iso);
            if (isNaN(d)) { avisar("Elige la hora a la que empezó la ronda.", true); return; }
            if (d.getTime() > Date.now() + 60000) { avisar("Esa hora todavía no llega: elige la hora en que empezó la ronda (hoy, hasta ahora).", true); return; }
            if (previa && Math.abs(Date.parse(previa) - d.getTime()) > 60000) {
                const sigue = await Avisos.confirmar("La ronda " + r + " ya tenía las " + h(previa) + " marcadas. ¿Cambiarlas a las " + h(iso) + "?", { titulo: "Cambiar la hora de inicio", aceptar: "Sí, cambiarla" });
                if (!sigue) return;
            }
        }
        try {
            const res = await escribir("inicio", quitar ? { ronda: r, quitar: true } : { ronda: r, inicio: iso }, "Hora de inicio de la ronda " + r);
            const guardada = quitar ? null : (res.d && res.d.inicio) || iso;
            estado.inicio_ronda = guardada ? { ronda: r, inicio: guardada, arbitro: estado.arbitro } : null;
            inicioPendiente = guardada ? { ronda: r, inicio: guardada, hasta: Date.now() + 120000 } : null;
            corrigiendoInicio = false;
            pintar();   // las tarjetas también: el cronómetro de cada jugador cuenta desde la hora nueva
            avisar(res.encolado ? "Sin señal: la hora de inicio quedó en la tablet y se manda sola cuando vuelva la conexión."
                : quitar ? "Ronda " + r + ": vuelve a valer la hora del calendario."
                    : "Ronda " + r + ": empezó a las " + h(guardada) + ". El tiempo de espera corre desde ahí.");
        } catch (e) { avisar(e.message, true); }
    }

    function verHorarios() {
        const H = window.CentroamericanoHorario;
        const dia = (d) => new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", weekday: "long", day: "numeric", month: "long" }).format(d);
        Avisos.alerta(H.lineas(new Date(), (d) => hora(d), dia, iniciosMarcados()), { titulo: "Horarios y tiempo de espera", aceptar: "Cerrar" });
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
                el("td", { texto: hora(f.ocurrio) }), el("td", { texto: String(f.mesa) }), el("td", { texto: (f.tipo === "nota" && f.articulo === "Levantó" ? "Se levantó" : f.tipo === "nota" && f.articulo === "Llegó tarde" ? "Llegó tarde" : f.tipo === "nota" && f.articulo === "Comunicado" ? "Comunicado" : nombre[f.tipo] || f.tipo) + (anuladas.has(f.id) ? " (anulada)" : "") }), el("td", { texto: detalle })));
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
        pintarInicio();
        pintarConcluido();
        latirCuentas();
        if (tiemposAbierto && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#control-tiempos'))) pintarTiempos();
        pintarAnotado();
    }

    // ------------------------------------------------------------- «Ya terminé mis labores» y la bitácora en PDF

    // Concluidas las labores: se avisa arriba, se ofrece la bitácora y todo lo que escribe queda apagado.
    function pintarConcluido() {
        const cerrada = concluida();
        const caja = $("concluido");
        caja.hidden = !cerrada;
        $("concluir").hidden = cerrada;
        if (!cerrada) return;
        $("concluido-texto").textContent = "A las " + hora(estado.concluyo, { hour: "numeric", minute: "2-digit" }) + " dijiste que ya terminaste. Ya no puedes anotar ni guardar resultados en tus mesas. Baja tu bitácora: trae todas tus rondas, los torneos que atendiste y todo lo que anotaste. Si necesitas seguir, pide a la organización que reabra tus labores.";
        tiemposAbierto = false;
        pintarTiempos();
        $("lista-previa").hidden = true; $("revision").hidden = true;   // ya no hay nada que revisar ni finalizar
        // Lo que escribe queda apagado de verdad (no solo en apariencia): ni con el teclado se puede tocar.
        for (const n of document.querySelectorAll("#lista button, #lista select, #lista input, #lista-previa button, #lista-previa input, #revision button, #revision input, #abrir-tiempos, #pedir-ayuda, #nombre-guardar, #nombre-campo")) n.disabled = true;
    }

    async function concluirLabores() {
        if (concluida()) return;
        const pend = cola ? cola.lista() : [];
        if (pend.length) { avisar("Tienes " + pend.length + (pend.length === 1 ? " cosa" : " cosas") + " sin enviar (" + pend.map((x) => x.etiqueta).join(", ") + "). Espera a que se manden y vuelve a tocar «Ya terminé mis labores».", true); return; }
        const sinResultado = estado.mesas.filter((m) => m.valor === "0").length;
        const avisos = [];
        if (sinResultado) avisos.push("Todavía hay " + sinResultado + (sinResultado === 1 ? " mesa" : " mesas") + " sin resultado en la ronda " + estado.ronda + ".");
        if (!estado.finalizada) avisos.push("No has finalizado la ronda " + estado.ronda + ".");
        const sigue = await Avisos.confirmar((avisos.length ? avisos.join(" ") + " " : "") + "Se te cerrarán los resultados: ya no podrás anotar ni guardar nada, y podrás descargar tu bitácora en PDF. Si te equivocas, la organización puede reabrir tus labores.", { titulo: "Ya terminé mis labores", aceptar: "Sí, ya terminé", peligro: !!avisos.length });
        if (!sigue) return;
        $("concluir").disabled = true;
        try {
            const d = await invocar("concluir", {});
            estado.concluyo = d.concluyo;
            avisar("Concluiste tus labores. Ya puedes descargar tu bitácora.");
            pintar();
            const b = $("bajar-bitacora"); if (b) b.focus();
        } catch (e) {
            avisar(e.message, true);
        } finally { $("concluir").disabled = false; }
    }

    // La bitácora en PDF, con la marca de agua de Ajedrez Integral: la función la arma con todo lo que anotó con sus enlaces.
    // La bitácora ya armada (los datos de la función + el PDF con la marca de agua), para descargarla o mandarla por correo.
    async function armarBitacora() {
        const d = await invocar("bitacora", {}, { ms: 60000 });
        const F = { hora: (x) => hora(x, { hour: "numeric", minute: "2-digit" }), fechaHora: (x) => window.HoraCR.fechaHora(x, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }) };
        const blob = await window.ReportePDF.generar(window.CentroamericanoBitacora.armar(d, F));
        return { blob, nombre: window.CentroamericanoBitacora.nombreArchivo(d) };
    }

    async function bajarBitacora() {
        const boton = $("bajar-bitacora"), estadoEl = $("concluido-estado");
        boton.disabled = true;
        estadoEl.textContent = "Armando tu bitácora…";
        try {
            const { blob, nombre } = await armarBitacora();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = nombre;
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
            estadoEl.textContent = "Listo: se descargó «" + nombre + "».";
        } catch (e) {
            estadoEl.textContent = "";
            avisar("No se pudo bajar la bitácora: " + (e.message || e), true);
        } finally { boton.disabled = false; }
    }

    // «Mandarme la bitácora por correo»: el mismo PDF, a la dirección que el árbitro escribe (con su consentimiento; no se guarda).
    async function mandarBitacoraPorCorreo() {
        const boton = $("bit-enviar"), estadoEl = $("concluido-estado");
        const correo = $("bit-correo").value.trim();
        if (!/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(correo)) { avisar("Escribe un correo válido.", true); $("bit-correo").focus(); return; }
        if (!$("bit-consiento").checked) { avisar("Marca que aceptas que te la mandemos a ese correo.", true); $("bit-consiento").focus(); return; }
        boton.disabled = true;
        estadoEl.textContent = "Armando tu bitácora y mandándola…";
        try {
            const { blob } = await armarBitacora();
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let bin = "";
            for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            await invocar("bitacora_correo", { correo, pdf: btoa(bin) }, { ms: 60000, intentos: 1 });
            estadoEl.textContent = "Listo: te la mandamos a " + correo + ". Si no la ves, revisa el correo no deseado.";
        } catch (e) {
            estadoEl.textContent = "";
            avisar(e.message || String(e), true);
        } finally { boton.disabled = false; }
    }

    function pintarCabecera() {
        const r = rapido();
        $("titulo-torneo").textContent = (estado.categoria ? estado.categoria + " " + estado.rama : estado.torneo) + (r && estado.categoria ? (r === "blitz" ? " · Blitz" : " · Rápido") : "");
        // Modo rápido: sin control de tiempos (no se anotan en el Rápido ni en el Blitz) y la regla con sus minutos.
        document.body.dataset.ritmo = r || "clasico";
        $("abrir-tiempos").hidden = !!r;
        $("regla-minutos").textContent = textoMinutos();
        $("modo-rapido").hidden = !r;
        if (r) $("modo-rapido-ritmo").textContent = r === "blitz" ? "Blitz" : "Rápido";
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

    // «Todas las mesas» (el pizote): la organización lo habilita o deshabilita por enlace. Deshabilitado, el botón queda apagado y sin la pista
    // (la función también lo rechaza: esto solo lo esconde).
    function pintarTodasMesas(si) {
        const b = $("ver-todas-mesas");
        b.disabled = !si;
        b.setAttribute("aria-label", si ? "Buscar dónde juega un atleta, en todas las categorías" : "«¿Dónde juega?» no está habilitado en tu enlace");
        b.title = si ? "" : "La organización no habilitó «¿Dónde juega?» en tu enlace.";
        b.querySelector(".cam-mascota-pista").hidden = !si;
        $("donde-juega").hidden = !si;
    }

    // «¿Dónde juega?»: la lupa. Se pide TODO al cargar la página (una sola respuesta) para que al abrirla ya esté; la hora de cada ronda sale del calendario.
    const horaDeRonda = (ronda) => {
        const H = window.CentroamericanoHorario;
        const e = H && H.EVENTOS.find((x) => x.ronda === ronda);
        return e ? hora(new Date(H.inicioDe(e, null)), { hour: "numeric", minute: "2-digit" }) : "";
    };
    const dondeJuega = () => ({ pedir: (c) => invocar("todas_mesas", c, { intentos: 2 }), horaDe: horaDeRonda });
    let precargado = false;

    // «Modo concentración»: lo enciende la organización (llega en «leer» y en «avisos»); la tablet se tapa si el árbitro se sale.
    const Conc = window.CentroamericanoConcentracion.crear({ pedir: (c) => invocar("salida", c, { intentos: 1 }) });

    // Lo que de los avisos se ve en las tarjetas de las mesas: si nada de esto cambió, las tarjetas no se vuelven a
    // armar. Antes se armaban TODAS cada 8 s (cada consulta de avisos), aunque llegara lo mismo: en una tablet vieja
    // la página se trababa justo cuando el árbitro iba a tocar un botón. Ver «Las tablets viejas: el modo liviano».
    const firmaAvisos = () => JSON.stringify([abiertas, ayuda, nombrado, estado && estado.arbitro]);

    // Lo que contesta «leer» o «avisos»: el nombre, los mensajes sin leer y el pedido de ayuda. Con `sinPintar`
    // (lo llama mostrar(), que pinta enseguida) devuelve si cambió algo de las tarjetas en vez de pintar.
    function aplicarAvisos(d, sinPintar) {
        const antes = firmaAvisos();
        if (d.concentracion !== undefined) Conc.ponerActivo(d.concentracion === true);
        if (d.todas_las_mesas !== undefined) pintarTodasMesas(d.todas_las_mesas !== false);
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
        const cambio = firmaAvisos() !== antes;
        if (sinPintar) return cambio;
        if (estado && cambio) pintar();
        return cambio;
    }

    async function consultarAvisos() {
        if (!avisosVivo) return;
        try { aplicarAvisos(await invocar("avisos", null, { intentos: 1 })); }
        catch (e) { if (e.http === 404 || e.http === 410) avisosVivo = false; /* sin red: se vuelve a intentar */ }
    }

    async function entendido(id) {
        const antes = pendientes;
        pendientes = pendientes.filter((m) => m.id !== id);
        pintarMensajes();
        try { await invocar("leido", { id }); }
        catch (e) { pendientes = antes; pintarMensajes(); avisar(e.message, true); }
    }

    async function pedirAyuda(mesa, textoFijo) {
        let texto = textoFijo || "";
        if (mesa == null) {
            const nota = await Avisos.pedir("Pides ayuda PARA TI, no para una mesa en especial. Si lo que necesitas es que el principal vaya a una mesa, usa «Principal en esta mesa» en esa mesa. Si quieres, dile qué pasa.", { titulo: "Necesito ayuda", etiqueta: "Qué pasa (opcional)", aceptar: "Pedir ayuda" });
            if (nota === null) return false;
            texto = String(nota).trim();
        }
        try {
            const d = await invocar("ayuda", { mesa, texto });
            ayuda = { id: d.id, creado: d.creado, mesa, texto, estado: "abierto", atendido_en: null };
            if (!abiertas.includes(mesa)) abiertas = abiertas.concat([mesa]);
            pintarAyuda();
            if (estado) pintar();
            avisar(d.ya ? "Ya habías pedido ayuda" + (mesa != null ? " en la mesa " + mesa : "") + ": el árbitro principal ya lo sabe." : mesa != null ? "Aviso enviado: el árbitro principal irá directo a la mesa " + mesa + "." : "Aviso enviado: el árbitro principal sabe que necesitas ayuda.");
            return true;
        } catch (e) { avisar(e.message, true); return false; }
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

    // ------------------------------------------------------------- Fair Play: sus mesas elegidas
    // Las pide a centroamericano-fair-play con SU token (no a centroamericano-mesa, para no volver a desplegarla en pleno
    // torneo). Solo trae las suyas ya aprobadas; si no contesta, la tablet sigue igual. Ver «El sorteo de Fair Play» en
    // docs/decisiones/juegos-y-torneos.md.
    // «Ya lo retuve»: solo cuando el resultado ya está guardado y dice a quién revisar. Avisa al encargado de Fair Play.
    function bandaRetener(m, fp) {
        if (!fp || fp.estado !== "aprobada" || !fp.revisar_color) return null;
        const nombre = (fp.revisar_color === "blancas" ? m.blancas : m.negras) || (fp.revisar_color === "blancas" ? "quien jugó con blancas" : "quien jugó con negras");
        if (fp.retenido_en) return el("p", { class: "cam-fp-retenido", texto: "✓ Avisaste a Fair Play que retuviste a " + nombre + " (" + hora(fp.retenido_en) + "). Que no se vaya hasta que llegue el encargado." });
        return el("button", { type: "button", class: "cam-btn cam-btn-chico cam-fp-retener", "data-accion": "retener", onclick: (e) => retener(m, fp, e.currentTarget) },
            el("span", { "aria-hidden": "true", texto: "✋ " }), "Ya retuve a " + nombre);
    }

    async function retener(m, fp, boton) {
        boton.disabled = true;
        try {
            const { data, error } = await sb.functions.invoke("centroamericano-fair-play", { body: { action: "retener", arbitro_token: token(), ronda: estado.ronda, mesa: m.mesa } });
            if (error || !data || !data.ok) throw new Error((data && data.error) || "sin respuesta");
            fp.retenido_en = data.mesa.retenido_en;
            avisar("Listo: el encargado de Fair Play ya sabe que lo retuviste en la mesa " + m.mesa + ".");
            pintar();
        } catch (e) {
            boton.disabled = false;
            avisar("No se pudo avisar a Fair Play. Revisa la conexión y vuelve a tocar el botón.", true);
        }
    }

    async function cargarFairPlay() {
        if (!estado) return;
        try {
            const { data } = await sb.functions.invoke("centroamericano-fair-play", { body: { action: "mesas_arbitro", arbitro_token: token(), ronda: estado.ronda } });
            if (!data || !data.ok) return;
            if (JSON.stringify(data.mesas) === JSON.stringify(fairPlay)) return;
            fairPlay = data.mesas || [];
            if (estado) { estado.fair_play = fairPlay; pintar(); }
        } catch (e) { /* sin red: se vuelve a intentar */ }
    }

    // ------------------------------------------------------------- leer

    // Pone en pantalla lo que contestó «leer» (o la última lectura guardada en la tablet).
    function mostrar(d) {
        const cambioRonda = estado && estado.ronda !== d.ronda;
        if (cambioRonda) fairPlay = [];
        d.fair_play = fairPlay;
        if (cambioRonda) corrigiendoInicio = false;
        conservarInicio(d);
        // Si llegó lo mismo que ya está pintado (lo de siempre al actualizar cada 45 s con la ronda quieta), las
        // tarjetas no se vuelven a armar. `leido_en` cambia siempre y no se ve en ellas.
        const firma = (x) => JSON.stringify(Object.assign({}, x, { leido_en: null }));
        const firmaAnuladas = (a) => JSON.stringify(Array.from(a).sort());
        const igual = !!estado && !cambioRonda && firma(estado) === firma(d) && firmaAnuladas(anuladas) === firmaAnuladas(d.anuladas || []);
        estado = d;
        cargarFairPlay();
        anuladas = new Set(d.anuladas || []);
        if (cambioRonda) { elegido = {}; mensajes = {}; revisadas = {}; }
        $("problema").hidden = true;
        $("cargando").hidden = true;
        $("app").hidden = false;
        pintarCabecera();
        const cambioAvisos = aplicarAvisos(d, true);
        // «Todas las mesas» se adelanta a bajar en una tablet nueva; en el modo liviano, solo cuando se abre.
        if (!precargado && !liviano()) { precargado = true; setTimeout(() => window.CentroamericanoEmparejamientos.precargar(dondeJuega()), 1500); }
        if (!igual || cambioAvisos) pintar();
        pintarConexion();
    }

    async function leer(silencioso) {
        if (leyendo) return;
        leyendo = true;
        const boton = $("actualizar");
        boton.disabled = true;
        try {
            const d = await invocar("leer");
            mostrar(d);
            if (dueno) Cola.guardarEstado(dueno, d);
            $("actualizado").textContent = "Actualizado a las " + hora(d.leido_en);
        } catch (e) {
            if (e.http === 404 || e.http === 410) avisosVivo = false;
            const definitivo = e.http === 404 || e.http === 410;
            if (!estado && !definitivo && dueno && Cola.esDeRed(e)) {
                // Sin señal al abrir: se muestran las últimas mesas que esta tablet leyó, sin avisos viejos.
                const ultima = Cola.leerEstado(dueno);
                if (ultima) {
                    mostrar(Object.assign({}, ultima.estado, { mensajes: [], ayuda: null }));
                    $("actualizado").textContent = "Sin conexión: se muestra lo último que leyó esta tablet (" + hora(ultima.guardado) + ")";
                    return;
                }
            }
            if (!estado) problema(definitivo ? "Este enlace ya no sirve" : "No se pudo abrir tus mesas", e.message, !definitivo);
            else if (!silencioso) avisar(e.message, true);
            else $("actualizado").textContent = "No se pudo actualizar (se muestra lo último que se leyó)";
        } finally {
            leyendo = false;
            boton.disabled = false;
        }
    }

    // Lo que sale de la cola cuando vuelve la señal.
    function alEnviado(x, d) {
        if (estado && x.accion === "guardar") {
            const m = estado.mesas.find((y) => y.mesa === x.meta.mesa);
            if (m) resultadoGuardado(m, d, x.meta.antes, x.meta.valor);
        }
        if (estado && x.accion === "planilla") estado.planillas = subidas().filter((y) => y.mesa !== x.meta.mesa).concat([{ mesa: x.meta.mesa, lado: "blancas", subida: d.subida, drive_ok: d.drive === "enviada" }]);
        avisar("Ya se mandó: " + x.etiqueta + ".");
        if (estado) pintar();
        if (cola && !cola.lista().length && sinNadaPendiente()) leer(true);
    }
    function alRechazado(x, e) {
        if (estado && x.accion === "guardar") { mensajes[x.meta.mesa] = { ok: false, texto: "✗ No quedó guardado: " + e.message }; delete elegido[x.meta.mesa]; pintar(); }
        avisar("No se pudo enviar «" + x.etiqueta + "»: " + e.message + " Anótalo de nuevo si hace falta.", true);
    }
    async function prepararCola() {
        try {
            dueno = await Cola.huella(token());
            cola = await Cola.crear({ dueno, enviar: (a, c) => invocar(a, c, { intentos: 1 }), alCambiar: pintarConexion, alEnviado, alRechazado });
            await cola.cargar();
            cola.iniciar();
            // Cerrar la página con algo sin enviar lo pierde si el aparato no deja guardar en el navegador: se avisa.
            window.addEventListener("beforeunload", (ev) => { if (cola && cola.lista().length && cola.usaMemoria) { ev.preventDefault(); ev.returnValue = ""; } });
        } catch (e) { cola = null; /* sin cola: todo sigue funcionando, solo que sin red de seguridad */ }
    }

    // ------------------------------------------------------------- guardar

    function ponerResultado(m, valor) {
        elegido[m.mesa] = valor;
        delete mensajes[m.mesa];
        pintar();
        const s = $("res-" + m.mesa);
        if (s) s.focus();
    }

    // Lo que contestó «guardar»: lo que chess-results tiene de verdad (también cuando sale de la cola).
    function resultadoGuardado(m, d, antes, valor) {
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
    }

    async function guardar(m) {
        const valor = elegido[m.mesa];
        if (!valor || valor === m.valor) return;
        if (m.valor !== "0") {
            const sigue = await Avisos.confirmar("La mesa " + m.mesa + " ya tiene «" + M.textoResultado(m.valor) + "» en chess-results. ¿Cambiarlo a «" + M.textoResultado(valor) + "»?", { titulo: "Cambiar un resultado", aceptar: "Sí, cambiarlo" });
            if (!sigue) { if (rapido()) { delete elegido[m.mesa]; pintar(); } return; }
        }
        const antes = m.valor;
        ocupadas.add(m.mesa);
        delete mensajes[m.mesa];
        pintar();
        try {
            const r = await escribir("guardar", { ronda: estado.ronda, cambios: [{ mesa: m.mesa, blancas: m.blancas, negras: m.negras, valor }] }, "Resultado de la mesa " + m.mesa, { mesa: m.mesa, antes, valor });
            if (r.encolado) { mensajes[m.mesa] = { ok: true, texto: "⏳ Sin señal: el resultado quedó guardado en la tablet y se manda solo cuando vuelva la conexión. No lo repitas." }; return; }
            resultadoGuardado(m, r.d, antes, valor);
        } catch (e) {
            mensajes[m.mesa] = { ok: false, texto: "✗ " + e.message };
        } finally {
            ocupadas.delete(m.mesa);
            pintar();
        }
    }

    // ------------------------------------------------------------- ilegales e irregularidades

    function sumarAnotacion(m, color, tipo, id, jugador, texto, articulo) {
        (estado.anotaciones = estado.anotaciones || []).push({ id, ocurrio: new Date().toISOString(), mesa: m.mesa, color, jugador, tipo, resultado: null, anterior: null, texto: texto || "", articulo: articulo || (tipo === "nota" && /se levantó/.test(texto || "") ? "Levantó" : ""), enviado: false });
    }

    // Las dos de la lista: ilegal e irregularidad se eligen de una lista y la bitácora queda sola
    // (tipo de jugada, el artículo cuando lo hay y lo que quiera agregar el árbitro).
    // `conSancion`: la irregularidad pregunta además si hubo sanción de tiempo (art. 12.9). Va escrita al final del
    // texto con la forma de C.sancionTexto, y de ahí la lee el cálculo del reloj que se apaga.
    async function elegirTipo(titulo, texto, lista, etiqueta, aceptar, peligro, conSancion) {
        const r = await Avisos.formulario({
            titulo, texto, aceptar, peligro,
            campos: [
                { nombre: "tipo", etiqueta, tipo: "select", opciones: lista.map((t) => [t.id, t.texto]) },
                conSancion ? { nombre: "sancion", etiqueta: "Sanción de tiempo (art. " + C.ARTICULO_SANCION + ")", tipo: "select", valor: "", opciones: C.SANCIONES_TIEMPO.map((x) => [x.id, x.texto]) } : null,
                { nombre: "nota", etiqueta: "Detalle (opcional; obligatorio si eliges «Otra»)", tipo: "textarea", max: 500 },
            ].filter(Boolean),
        });
        if (r === null) return null;
        const t = C.textoTipo(lista, r.tipo, r.nota);
        if (!t) { avisar("Cuenta qué pasó para anotar «Otra».", true); return null; }
        const sancion = conSancion ? C.SANCIONES_TIEMPO.find((x) => x.id === r.sancion && x.segundos) : null;
        if (sancion) { t.texto += C.sancionTexto(sancion.id); t.sancion = sancion; }
        return t;
    }

    async function ilegal(m, color) {
        const k = marcaDe(m.mesa, color);
        const nombre = nombreDe(m, color);
        const segunda = k.ilegales >= 1;
        // En el Rápido y el Blitz no hay tiempo para elegir cuál fue: un toque la anota (y cuenta igual para el art. 7.5.5).
        // Un toque por error se deshace con «Anular la última ilegal».
        const t = rapido() ? { texto: "Jugada ilegal (" + (rapido() === "blitz" ? "Blitz" : "Rápido") + ": sin elegir el tipo)" } : await elegirTipo(
            "Jugada ilegal de " + nombre + " (mesa " + m.mesa + ")",
            segunda
                ? "Esta sería la SEGUNDA jugada ilegal de " + nombre + " en esta partida: pierde la partida (art. 7.5.5)."
                : "Elige qué jugada ilegal fue: queda en la bitácora. Es la primera de " + nombre + ": se le dan " + textoMinutos() + " más a su rival (art. 7.5.5).",
            C.TIPOS_ILEGAL, "¿Qué jugada ilegal fue?", segunda ? "Anotar la SEGUNDA ilegal" : "Anotar la ilegal", segunda);
        if (!t) return;
        ocupadas.add(m.mesa);
        pintar();
        try {
            const r = await escribir("anotar", { ronda: estado.ronda, mesa: m.mesa, color, tipo: "ilegal", texto: t.texto }, "Jugada ilegal de " + nombre + " (mesa " + m.mesa + ")", { mesa: m.mesa });
            if (r.encolado) {
                // Sin señal: ya cuenta en la tablet (y se manda sola); el árbitro la ve y recibe el mismo aviso.
                const marca = Object.assign({}, k, { ilegales: k.ilegales + 1, ultima_ilegal: r.id });
                estado.marcas[clave(m.mesa, color)] = marca;
                sumarAnotacion(m, color, "ilegal", r.id, nombre, t.texto);
                pintar();
                const a = C.avisoIlegal(marca.ilegales, nombre, color, minutosIlegal());
                await Avisos.alerta("Sin señal: quedó anotada en la tablet y se manda sola cuando vuelva la conexión. " + a.texto, { titulo: a.nivel === "pierde" ? a.titulo : "Primera ilegal: dale " + textoMinutos() + " al rival", aceptar: "Entendido" });
                return;
            }
            const d = r.d;
            estado.marcas[clave(m.mesa, color)] = d.marca;
            sumarAnotacion(m, color, "ilegal", d.id, d.jugador || nombre, t.texto);
            const a = C.avisoIlegal(d.marca.ilegales, d.jugador || nombre, color, minutosIlegal());
            pintar();
            // Las dos se avisan con un cuadro que no se pasa por alto: la primera recuerda los minutos (1 en el blitz).
            await Avisos.alerta(a.texto, { titulo: a.nivel === "pierde" ? a.titulo : "Primera ilegal: dale " + textoMinutos() + " al rival", aceptar: "Entendido" });
        } catch (e) {
            avisar(e.message, true);
        } finally {
            ocupadas.delete(m.mesa);
            pintar();
        }
    }

    // ------------------------------------------------------------- hablar con el jugador (frases en inglés y francés + traductor)

    // La traducción de «Conversar»: una función aparte (centroamericano-traducir), con el mismo enlace del árbitro. Sin reintentos: si
    // no hay señal o el servicio no está, el árbitro sigue con las frases fijas. Lanza un Error con un mensaje legible.
    async function traducirTexto(de, a, texto) {
        let reloj;
        const espera = new Promise((_, no) => { reloj = setTimeout(() => no(new Error("La traducción tardó demasiado.")), 20000); });
        let r;
        try { r = await Promise.race([sb.functions.invoke("centroamericano-traducir", { body: { token: token(), texto, de, a } }), espera]); }
        catch (e) { throw new Error(e && e.message ? e.message : "No se pudo traducir."); }
        finally { clearTimeout(reloj); }
        let { data, error } = r;
        if (error && error.context && typeof error.context.json === "function") { try { data = await error.context.json(); } catch (e) { /* sin cuerpo */ } }
        if (error || !data || data.error || !data.traduccion) throw new Error((data && typeof data.error === "string" && data.error) || "No hubo respuesta. Revisa tu conexión.");
        return String(data.traduccion);
    }

    // Lo que se le dijo al jugador queda en la bitácora SOLO cuando el árbitro lo marca («Anotar en la bitácora»).
    async function anotarComunicado(m, texto, color) {
        const nombre = nombreDe(m, color);
        const r = await escribir("anotar", { ronda: estado.ronda, mesa: m.mesa, color, tipo: "nota", texto, articulo: "Comunicado" }, "Comunicado a " + nombre + " (mesa " + m.mesa + ")", { mesa: m.mesa });
        if (r.encolado) { sumarAnotacion(m, color, "nota", r.id, nombre, texto, "Comunicado"); return; }
        sumarAnotacion(m, color, "nota", r.d.id, r.d.jugador || nombre, texto, "Comunicado");
    }

    function abrirHablar(m) {
        const H = window.CentroamericanoHablar;
        if (!H || !window.CentroamericanoFrases) { avisar("No se pudo abrir «Hablar con el jugador». Recarga la página.", true); return; }
        H.abrir({
            mesa: m.mesa,
            fairPlay: ((estado && estado.fair_play) || []).some((x) => x.mesa === m.mesa),
            jugadores: [{ color: "blancas", nombre: m.blancas, fed: m.fed_b || "" }, { color: "negras", nombre: m.negras, fed: m.fed_n || "" }],
            traducir: traducirTexto,
            anotar: (texto, color) => anotarComunicado(m, texto, color),
            pedirIdioma: async (id, nombreIdioma) => { if (!(await pedirAyuda(m.mesa, "Necesito un árbitro que hable " + (id === "fr" ? "francés" : "inglés") + " en esta mesa."))) throw new Error("No se pudo avisar. Intenta de nuevo."); },
        });
    }

    // «Se levantó»: un toque y queda en la bitácora (con la hora y tu nombre) que este jugador se levantó de la mesa. Cada toque es una
    // vez; la cuenta por jugador sale de ahí. Sin confirmar (con prisa), pero se puede anular la última.
    async function levanto(m, color) {
        const nombre = nombreDe(m, color);
        ocupadas.add(m.mesa);
        pintar();
        try {
            const r = await escribir("anotar", { ronda: estado.ronda, mesa: m.mesa, color, tipo: "nota", texto: "Se levantó de la mesa", articulo: "Levantó" }, nombre + " se levantó (mesa " + m.mesa + ")", { mesa: m.mesa });
            const ahora = new Date().toISOString();
            if (r.encolado) {
                const k = marcaDe(m.mesa, color);
                estado.marcas[clave(m.mesa, color)] = Object.assign({}, k, { levantadas: (k.levantadas || 0) + 1, ultima_levantada: r.id });
                sumarAnotacion(m, color, "nota", r.id, nombre, nombre + " (" + color + ") se levantó de la mesa");
                avisar("Sin señal: quedó anotado en la tablet que " + nombre + " se levantó y se manda solo cuando vuelva la conexión.");
                return;
            }
            const d = r.d;
            estado.marcas[clave(m.mesa, color)] = d.marca;
            sumarAnotacion(m, color, "nota", d.id, d.jugador || nombre, (d.jugador || nombre) + " (" + color + ") se levantó de la mesa");
            const n = d.marca && d.marca.levantadas ? d.marca.levantadas : 1;
            avisar((d.jugador || nombre) + " se levantó a las " + hora(ahora, { hour: "numeric", minute: "2-digit" }) + " (" + (n === 1 ? "primera vez" : "van " + n) + ").");
        } catch (e) {
            avisar(e.message, true);
        } finally {
            ocupadas.delete(m.mesa);
            pintar();
        }
    }

    async function irregularidad(m, color) {
        const nombre = nombreDe(m, color);
        const t = await elegirTipo("Irregularidad de " + nombre + " (mesa " + m.mesa + ")", "Elige qué fue: queda en la bitácora con la hora y tu nombre.", C.TIPOS_IRREGULARIDAD, "¿Qué irregularidad fue?", "Anotar la irregularidad", false, true);
        if (!t) return;
        ocupadas.add(m.mesa);
        pintar();
        try {
            const r = await escribir("anotar", { ronda: estado.ronda, mesa: m.mesa, color, tipo: "irregularidad", texto: t.texto, articulo: t.articulo }, "Irregularidad de " + nombre + " (mesa " + m.mesa + ")", { mesa: m.mesa });
            if (r.encolado) {
                const k = marcaDe(m.mesa, color);
                estado.marcas[clave(m.mesa, color)] = Object.assign({}, k, { irregularidades: k.irregularidades + 1, ultima_irregularidad: r.id });
                sumarAnotacion(m, color, "irregularidad", r.id, nombre, t.texto);
                avisar("Sin señal: la irregularidad de " + nombre + " quedó en la tablet y se manda sola cuando vuelva la conexión." + (t.sancion ? " No olvides ajustar el reloj por la sanción." : ""));
                return;
            }
            const d = r.d;
            estado.marcas[clave(m.mesa, color)] = d.marca;
            sumarAnotacion(m, color, "irregularidad", d.id, d.jugador || nombre, t.texto);
            avisar("Irregularidad anotada: " + (d.jugador || nombre) + ".");
            if (t.sancion) {
                const quien = t.sancion.a === "rival" ? nombreDe(m, color === "blancas" ? "negras" : "blancas") + " (" + (color === "blancas" ? "negras" : "blancas") + ")" : (d.jugador || nombre) + " (" + color + ")";
                await Avisos.alerta("Ajusta el reloj ahora: " + (t.sancion.segundos > 0 ? "súmale " : "réstale ") + C.formatoTiempo(Math.abs(t.sancion.segundos)) + " a " + quien + ". Quedó anotado en la bitácora y cuenta si después el reloj se apaga.", { titulo: "Sanción de tiempo", aceptar: "Entendido" });
            }
        } catch (e) {
            avisar(e.message, true);
        } finally {
            ocupadas.delete(m.mesa);
            pintar();
        }
    }

    async function anular(m, color, tipo, id) {
        const nombre = nombreDe(m, color);
        const sigue = await Avisos.confirmar("¿Anular " + (tipo === "levanto" ? "la última vez que se levantó " : "la última " + (tipo === "ilegal" ? "jugada ilegal" : "irregularidad") + " de ") + nombre + "? Queda constancia de las dos anotaciones.", { titulo: "Anular una anotación", aceptar: "Sí, anularla" });
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
        // El pizote abre los emparejamientos de todas las categorías (para ayudar a un atleta a encontrar su mesa).
        $("ver-todas-mesas").addEventListener("click", () => window.CentroamericanoEmparejamientos.abrir(dondeJuega()));
        $("donde-juega").addEventListener("click", () => window.CentroamericanoEmparejamientos.abrir(dondeJuega()));
        // El logo y la «Ronda abierta» abren «Mis pareos»: los pareos de SUS mesas, de todas las rondas (la abierta al abrir).
        const misPareos = () => window.CentroamericanoMisPareos.abrir({ pedir: (c) => invocar("mis_pareos", c, { intentos: 2 }), ronda: estado && estado.ronda });
        $("logo-pareos").addEventListener("click", misPareos);
        $("ver-rondas").addEventListener("click", misPareos);
        $("presencia-todos").addEventListener("click", marcarTodosLlegaron);
        $("bit-enviar").addEventListener("click", mandarBitacoraPorCorreo);
        $("ir-ahora").addEventListener("click", () => marcarInicio(new Date().toISOString(), false));
        $("ir-guardar").addEventListener("click", () => {
            const campo = $("ir-hora").value;
            if (!campo) { avisar("Escribe la hora a la que empezó la ronda.", true); return; }
            // La hora escrita es de HOY en Costa Rica (el día de la ronda).
            marcarInicio(window.HoraCR.desdeCampo(window.HoraCR.hoy() + "T" + campo).toISOString(), false);
        });
        $("ir-quitar").addEventListener("click", () => marcarInicio(null, true));
        $("ir-corregir").addEventListener("click", () => { corrigiendoInicio = true; pintarInicio(); $("ir-hora").focus(); });
        $("ir-cerrar").addEventListener("click", () => { corrigiendoInicio = false; pintarInicio(); $("ir-corregir").focus(); });
        $("concluir").addEventListener("click", concluirLabores);
        $("bajar-bitacora").addEventListener("click", bajarBitacora);
        $("abrir-tiempos").addEventListener("click", () => abrirTiempos(false));
        setInterval(() => { if (!document.hidden && estado) pintarEspera(); }, 30000);
        setInterval(() => { if (!document.hidden) latirCuentas(); }, 1000);
        $("nombre-guardar").addEventListener("click", guardarNombre);
        $("nombre-campo").addEventListener("keydown", (e) => { if (e.key === "Enter") guardarNombre(); });
        $("ir-mesa").addEventListener("change", irAMesa);
        $("ir-mesa").addEventListener("keydown", (e) => { if (e.key === "Enter") irAMesa(); });
        $("solo-faltan").addEventListener("change", pintar);
        setInterval(() => { if (!document.hidden && estado && sinNadaPendiente()) leer(true); }, REFRESCO_MS);
        setInterval(() => { if (!document.hidden) consultarAvisos(); }, AVISOS_MS);
        // Fair Play: cada 20 s; en el modo liviano, cada 40 s (una vuelta sí y otra no).
        let vueltaFp = 0;
        setInterval(() => { if (document.hidden) return; if (liviano() && (vueltaFp++ % 2)) return; cargarFairPlay(); }, 20000);
        // «Mis mesas en vivo»: solo aparece si la organización conectó la transmisión privada sin atraso.
        if (window.CentroamericanoArbitroVivo) window.CentroamericanoArbitroVivo.iniciar({ token, boton: $("ver-vivo"), alAlertar: alertaDeTablas });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) return;
            mantenerEncendida();
            consultarAvisos();
            if (cola && cola.lista().length) cola.vaciar();
            if (estado && sinNadaPendiente()) leer(true);
        });
        mantenerEncendida();
        prepararCola().then(() => { leer(false); if (cola && cola.lista().length) cola.vaciar(); });
    }

    init();
})();
