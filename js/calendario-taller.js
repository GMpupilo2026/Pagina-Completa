/* El calendario de clases del panel de taller.

   Un taller —como «Formación Ajedrez» de los asesores del MEP— no es una clase
   de todas las semanas: son unas pocas sesiones con fecha, hora y duración
   distintas. En el panel del alumno de una academia con «panel de taller»
   (academias.panel_taller), esta tarjeta va en el lugar de «Hoy te toca» y
   dice las sesiones que vienen, una por renglón, con la próxima marcada.

   Las sesiones son las del horario de su profe (horario_clases, una fila por
   sesión con `desde` = `hasta`), y las da mis_clases_proximas(): la misma
   regla de «Tu próxima clase» y del .ics, así que las tres cosas dicen lo
   mismo. Las que ya terminaron no se piden.

   El renglón de la sesión de hoy lleva «Entrar a la sesión» (y, si es en
   línea y el profe puso el enlace, el de la videollamada): con la misma regla
   que la tarjeta «Sesión en vivo», se abre solo cuando el profe abrió la
   clase. Antes hay que ir a buscar esa tarjeta a otra parte del panel justo
   cuando el calendario dice «Ahora».

   Abajo van las grabaciones de las sesiones que ya pasaron (mis_grabaciones(),
   que pone el profe o quien administra con grabacion_clase_poner()), cada una
   con su reproductor a pedido y cuánto lleva visto (grabaciones_vistas, que
   se anota mientras la mira: ver «Cuánto vio cada uno»).

   Va aparte de js/clases.js para que se pueda probar sin la base: pintar()
   recibe las filas tal cual las devuelven mis_clases_proximas(),
   mis_grabaciones() y grabaciones_vistas, y lo que vio lo entrega a `alVer`.
   Ver «El panel de taller» en docs/decisiones/paneles.md. */
window.CalendarioTaller = (function () {
    "use strict";

    // Las doce del mediodía se dicen «12 m. d.», como en el calendario del taller.
    function hora(x) {
        const t = HoraCR.hora(x);
        return /^12:00\s*p/.test(t) ? "12:00 m. d." : t;
    }

    // «Lunes 12 de octubre», con mayúscula al empezar el renglón y sin la coma
    // que pone el navegador después del día («lunes, 12 de octubre»).
    function dia(x) {
        const t = HoraCR.fecha(x, { weekday: "long", day: "numeric", month: "long" }).replace(/^(\S+),\s*/, "$1 ");
        return t.charAt(0).toUpperCase() + t.slice(1);
    }

    // Termina una frase con punto, sin doblarlo después de «a. m.».
    function conPunto(t) {
        return /\.$/.test(t) ? t : t + ".";
    }

    /* En qué está cada sesión: la que pasa ahora, la de hoy, la próxima o una
       más. El estado va ESCRITO en la etiqueta, no solo en el color. */
    function estadoDe(s, ahora, esPrimera) {
        const inicio = new Date(s.inicio), fin = new Date(s.fin);
        if (inicio <= ahora && ahora < fin) return { texto: "Ahora", clase: "bg-emerald-700 text-white" };
        if (HoraCR.dia(inicio) === HoraCR.dia(ahora)) return { texto: "Hoy", clase: "bg-accent-500 text-brand-900" };
        if (esPrimera) return { texto: "Próxima", clase: "bg-accent-500 text-brand-900" };
        return null;
    }

    const CLASE_BOTON = "inline-flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2";

    /* Lo que va en el renglón de hoy según la clase. `entrada`:
       undefined/null mientras no se sabe; { abierta, videollamada } después,
       con `videollamada` = { href, etiqueta } o null. El candado lo pone la
       base (sin clase abierta la RLS no da el tablero): acá solo se dice
       antes de tocar, como en la tarjeta «Sesión en vivo». */
    function pintarEntrada(caja, entrada, modalidad) {
        caja.replaceChildren();
        if (!entrada || !entrada.abierta) {
            // Apagado: sin href, pero se alcanza con Tab para leer por qué.
            const apagado = document.createElement("span");
            apagado.className = CLASE_BOTON + " cursor-not-allowed bg-brand-100 dark:bg-brand-900 border border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-200";
            apagado.tabIndex = 0;
            apagado.setAttribute("role", "link");
            apagado.setAttribute("aria-disabled", "true");
            apagado.dataset.entrar = "apagado";
            const candado = document.createElement("span");
            candado.setAttribute("aria-hidden", "true");
            candado.textContent = "🔒 ";
            apagado.append(candado, entrada ? "Entrar a la sesión: se abre cuando tu profe empiece la clase" : "Viendo si hay clase…");
            caja.appendChild(apagado);
            return;
        }
        const entrar = document.createElement("a");
        entrar.href = "sesion.html";
        entrar.dataset.entrar = "sesion";
        entrar.className = CLASE_BOTON + " bg-accent-500 text-brand-900 hover:bg-accent-400";
        entrar.textContent = "Entrar a la sesión →";
        caja.appendChild(entrar);
        if (modalidad !== "presencial" && entrada.videollamada && entrada.videollamada.href) {
            const llamada = document.createElement("a");
            llamada.href = entrada.videollamada.href;
            llamada.target = "_blank";
            llamada.rel = "noopener noreferrer";
            llamada.dataset.entrar = "videollamada";
            llamada.className = CLASE_BOTON + " bg-white dark:bg-brand-900 border-2 border-accent-500 text-brand-800 dark:text-white hover:bg-accent-50 dark:hover:bg-brand-800";
            const icono = document.createElement("span");
            icono.setAttribute("aria-hidden", "true");
            icono.textContent = "📹 ";
            llamada.append(icono, entrada.videollamada.etiqueta || "Entrar a la videollamada");
            caja.appendChild(llamada);
        }
    }

    function renglon(s, ahora, esPrimera, entrada) {
        const li = document.createElement("li");
        const estado = estadoDe(s, ahora, esPrimera);
        li.className = "flex items-start gap-3 rounded-xl px-3 py-3 "
            + (estado ? "bg-accent-50 dark:bg-brand-800 ring-1 ring-accent-300 dark:ring-accent-700" : "bg-brand-50 dark:bg-brand-950");

        const icono = document.createElement("span");
        icono.className = "text-2xl leading-none mt-0.5";
        icono.setAttribute("aria-hidden", "true");
        icono.textContent = s.modalidad === "presencial" ? "🏫" : "💻";

        const cuerpo = document.createElement("div");
        cuerpo.className = "flex-1 min-w-0";
        const arriba = document.createElement("p");
        arriba.className = "flex items-center gap-2 flex-wrap";
        const titulo = document.createElement("span");
        titulo.className = "font-semibold text-brand-800 dark:text-white";
        titulo.textContent = s.titulo || "Clase";   // lo escribió el profe: textContent
        arriba.appendChild(titulo);
        if (estado) {
            const etiqueta = document.createElement("span");
            etiqueta.className = "text-xs font-bold rounded-full px-2 py-0.5 " + estado.clase;
            etiqueta.textContent = estado.texto;
            arriba.appendChild(etiqueta);
        }
        const cuando = document.createElement("p");
        cuando.className = "text-sm text-brand-700 dark:text-brand-200";
        // La hora va junta: en el celular baja entera al renglón de abajo, no partida en «a. m. a / 12:00».
        const horas = document.createElement("span");
        horas.className = "whitespace-nowrap";
        horas.textContent = hora(s.inicio) + " a " + hora(s.fin);
        cuando.append(dia(s.inicio) + " · ", horas);
        const donde = document.createElement("p");
        donde.className = "text-xs text-brand-500 dark:text-brand-300";
        donde.textContent = s.modalidad === "presencial" ? "Presencial" : "En línea";
        cuerpo.append(arriba, cuando, donde);

        // Solo la sesión de hoy (la que pasa ahora o la que viene más tarde):
        // el profe puede abrir la clase unos minutos antes de la hora.
        if (estado && estado.texto !== "Próxima") {
            const botones = document.createElement("div");
            botones.className = "mt-3 flex flex-wrap gap-2";
            botones.setAttribute("data-entrada", "");
            botones.dataset.modalidad = s.modalidad || "";
            pintarEntrada(botones, entrada, s.modalidad);
            cuerpo.appendChild(botones);
        }

        li.append(icono, cuerpo);
        return li;
    }

    /* Pinta la tarjeta en `caja`. `sesiones` son las filas de
       mis_clases_proximas() (ya ordenadas y sin las que terminaron);
       `alBajar` es lo que hace «Agregar a mi calendario»; `entrada`, si la
       clase está abierta (ver pintarEntrada); `grabaciones`, las filas de
       mis_grabaciones() (ver pintarGrabaciones); `vistas`, las de
       grabaciones_vistas de quien mira, y `alVer(g, tramos)`, lo que anota lo
       que vio y devuelve el total (ver «Cuánto vio»). */
    function pintar(caja, sesiones, { ahora = new Date(), alBajar = null, entrada = null, grabaciones = null, vistas = null, alVer = null } = {}) {
        caja.replaceChildren();
        const lista = (sesiones || []).filter((s) => s && s.inicio && s.fin && new Date(s.fin) > ahora);

        const titulo = document.createElement("h2");
        titulo.id = "calendario-taller-titulo";
        titulo.className = "font-serif text-lg font-bold text-brand-800 dark:text-white";
        const emoji = document.createElement("span");
        emoji.setAttribute("aria-hidden", "true");
        emoji.textContent = "📅 ";
        titulo.append(emoji, "Calendario de clases");
        const sub = document.createElement("p");
        sub.className = "text-sm text-brand-500 dark:text-brand-300 mt-1 mb-4";
        sub.textContent = lista.length
            ? (lista.length === 1 ? "Te queda una sesión." : "Te quedan " + lista.length + " sesiones.") + " Horas de Costa Rica."
            : "No te quedan sesiones en el calendario.";
        caja.append(titulo, sub);

        if (lista.length) {
            const ol = document.createElement("ol");
            ol.className = "space-y-2";
            ol.setAttribute("aria-label", "Sesiones que vienen");
            lista.forEach((s, i) => ol.appendChild(renglon(s, ahora, i === 0, entrada)));
            caja.appendChild(ol);
        }

        if (lista.length && alBajar) {
            const boton = document.createElement("button");
            boton.type = "button";
            boton.id = "calendario-taller-bajar";
            boton.className = "mt-4 rounded-xl px-4 py-2 text-sm font-semibold bg-accent-500 text-brand-900 hover:bg-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2";
            boton.textContent = "Agregar a mi calendario";
            const estado = document.createElement("p");
            estado.id = "calendario-taller-estado";
            estado.setAttribute("role", "status");
            estado.className = "mt-2 text-xs text-brand-500 dark:text-brand-300";
            boton.addEventListener("click", () => alBajar(boton, estado));
            caja.append(boton, estado);
        }
        pintarGrabaciones(caja, grabaciones, lista[0], vistas, alVer);
        caja.hidden = false;
        return lista.length;
    }

    /* Las grabaciones de las sesiones que ya pasaron (mis_grabaciones(): el
       id de un video de YouTube «No listado», con su tema y su duración), en
       una galería: una tarjeta por sesión con su miniatura —el azul del tema
       de la plataforma con un tablero tenue, el número de la sesión y la
       duración—, y la próxima en gris. Al tocar una, se abre en grande sobre
       la página («modo cine», un <dialog>): el reproductor de YouTube no se
       carga hasta ese momento, y al cerrar se quita, para que no siga sonando
       escondido. Va por youtube-nocookie, que es lo que deja la CSP. */
    const ID_VIDEO = /^[A-Za-z0-9_-]{11}$/;

    // «3:12:00» en la miniatura (como en YouTube) y «3 h 12 min» en el texto.
    function reloj(seg) {
        const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
        const dos = (n) => String(n).padStart(2, "0");
        return h ? h + ":" + dos(m) + ":" + dos(s) : m + ":" + dos(s);
    }
    const duracion = (seg) => HoraCR.duracion(seg);
    // El número de la sesión, del final del título: «Sesión II» → «II».
    function numero(titulo) {
        const m = /(?:^|\s)([IVXLC]+|\d+)\s*$/.exec(titulo || "");
        return m ? m[1] : "";
    }

    function el(tag, clase, texto) {
        const e = document.createElement(tag);
        if (clase) e.className = clase;
        if (texto != null) e.textContent = texto;
        return e;
    }

    // La miniatura: sin imagen de YouTube (la CSP no la deja y no hace falta).
    function miniatura(titulo, abajo, apagada) {
        const m = el("div", "relative aspect-video w-full overflow-hidden" + (apagada ? " grayscale opacity-60" : ""));
        m.style.background = "radial-gradient(120% 90% at 85% 10%, rgba(255,255,255,.12), transparent 60%),"
            + " repeating-conic-gradient(rgba(255,255,255,.05) 0 25%, transparent 0 50%) 0 0 / 28px 28px,"
            + " linear-gradient(135deg, rgb(var(--c-brand-900)), rgb(var(--c-brand-700)))";
        const n = numero(titulo);
        if (n) {
            const num = el("span", "absolute left-3 top-1 font-serif text-4xl font-bold text-white/90", n);
            num.setAttribute("aria-hidden", "true");
            m.appendChild(num);
        }
        if (!apagada) {
            const play = el("span", "absolute inset-0 m-auto grid h-14 w-14 place-items-center rounded-full bg-accent-500 shadow-lg ring-8 ring-accent-500/20 transition-transform group-hover:scale-110");
            play.setAttribute("aria-hidden", "true");
            play.innerHTML = '<svg viewBox="0 0 24 24" class="ml-1 h-6 w-6 fill-current text-brand-900"><path d="M7 4.5v15l12-7.5z"/></svg>';
            m.appendChild(play);
        }
        if (abajo) {
            const chip = el("span", "absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-bold text-white", abajo);
            chip.setAttribute("aria-hidden", "true");
            m.appendChild(chip);
        }
        return m;
    }

    function tarjetaGrabacion(g, abrir) {
        const b = el("button", "group block h-full w-full overflow-hidden rounded-2xl bg-brand-50 text-left ring-1 ring-brand-100 transition hover:ring-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 dark:bg-brand-950 dark:ring-brand-800");
        b.type = "button";
        b.dataset.grabacion = g.youtube_id;
        b.setAttribute("aria-haspopup", "dialog");
        const seg = Number(g.duracion_seg) > 0 ? Number(g.duracion_seg) : 0;
        b.appendChild(miniatura(g.titulo, seg ? reloj(seg) : ""));
        const texto = el("span", "block p-3");
        texto.append(el("span", "sr-only", "Ver la grabación: "),
            el("span", "block font-semibold text-brand-800 dark:text-white", g.titulo || "Clase"));   // del profe: textContent
        if (g.tema) texto.appendChild(el("span", "block text-sm text-brand-700 dark:text-brand-200", g.tema));
        texto.appendChild(el("span", "mt-1 block text-xs text-brand-600 dark:text-brand-300", dia(g.inicio) + (seg ? " · " + duracion(seg) : "")));
        b.appendChild(texto);
        ponerVisto(b, g);
        b.addEventListener("click", () => abrir(g, b));
        return b;
    }

    // «Viste 1 h 36 min (50 %)»: lo que lleva visto, sin contar lo repetido.
    function textoVisto(g) {
        const visto = Number(g.visto_seg) > 0 ? Number(g.visto_seg) : 0;
        if (!visto) return "";
        const total = Number(g.duracion_seg) > 0 ? Number(g.duracion_seg) : 0;
        if (total && visto >= total * 0.95) return "✓ La viste completa";
        const pct = total ? Math.round((100 * visto) / total) : 0;
        return "Viste " + duracion(visto) + (pct >= 1 ? " (" + pct + " %)" : "");
    }

    /* En la tarjeta: el texto debajo del día y, como en YouTube, una barra al
       pie de la miniatura. La barra es adorno: lo que dice va escrito. Se
       repinta cuando la base devuelve el total nuevo, con la ventana todavía
       abierta. */
    function ponerVisto(b, g) {
        if (!b) return;
        const dicho = textoVisto(g);
        let t = b.querySelector("[data-visto]"), barra = b.querySelector("[data-visto-barra]");
        if (!dicho) { if (t) t.remove(); if (barra) barra.remove(); return; }
        if (!t) {
            t = el("span", "mt-1 block text-xs font-semibold text-brand-700 dark:text-brand-200");
            t.dataset.visto = "";
            b.lastElementChild.appendChild(t);
        }
        t.textContent = dicho;
        const total = Number(g.duracion_seg) > 0 ? Number(g.duracion_seg) : 0;
        if (!total) return;
        if (!barra) {
            barra = el("span", "absolute inset-x-0 bottom-0 block h-1.5 bg-white/30");
            barra.dataset.vistoBarra = "";
            barra.setAttribute("aria-hidden", "true");
            barra.appendChild(el("span", "block h-full bg-accent-500"));
            b.firstElementChild.appendChild(barra);
        }
        barra.firstElementChild.style.width = Math.min(100, (100 * Number(g.visto_seg)) / total).toFixed(1) + "%";
    }

    // La próxima sesión, en gris: todavía no tiene grabación. Apagada: sin
    // acción, pero se alcanza con Tab para leer cuándo llega.
    function tarjetaProxima(s) {
        const t = el("div", "h-full overflow-hidden rounded-2xl bg-brand-50 ring-1 ring-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 dark:bg-brand-950 dark:ring-brand-800");
        t.tabIndex = 0;
        t.setAttribute("role", "link");
        t.setAttribute("aria-disabled", "true");
        t.dataset.grabacionProxima = "";
        const corto = HoraCR.fecha(s.inicio, { day: "numeric", month: "short" }).replace(/\.$/, "");
        t.appendChild(miniatura(s.titulo, corto, true));
        const texto = el("div", "p-3");
        texto.append(el("p", "font-semibold text-brand-700 dark:text-brand-200", s.titulo || "Clase"),
            el("p", "text-sm text-brand-600 dark:text-brand-300", "Su grabación sale después de la clase"),
            el("p", "mt-1 text-xs text-brand-600 dark:text-brand-300", dia(s.inicio)));
        t.appendChild(texto);
        return t;
    }

    // El modo cine: uno solo por página, armado la primera vez que se usa.
    let cine = null, volverA = null;
    function armarCine() {
        if (cine) return cine;
        const d = el("dialog", "w-[calc(100%-1rem)] max-w-5xl rounded-2xl bg-brand-950 p-0 text-white shadow-2xl backdrop:bg-black/80");
        d.id = "grabacion-cine";
        d.setAttribute("aria-labelledby", "grabacion-cine-titulo");
        const cab = el("div", "flex items-start justify-between gap-3 px-4 pt-4 sm:px-6");
        const titulo = el("h2", "font-serif text-lg font-bold sm:text-xl");
        titulo.id = "grabacion-cine-titulo";
        const cerrar = el("button", "shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "✕ Cerrar");
        cerrar.type = "button";
        cerrar.id = "grabacion-cine-cerrar";
        cab.append(titulo, cerrar);
        const marco = el("div", "mx-4 mt-3 aspect-video overflow-hidden rounded-xl bg-black sm:mx-6");
        marco.id = "grabacion-cine-video";
        const pie = el("p", "px-4 pb-4 pt-3 text-sm sm:px-6");
        const afuera = el("a", "font-semibold text-white underline", "Abrir en YouTube (para verla en el celular o en pantalla completa)");
        afuera.id = "grabacion-cine-youtube";
        afuera.target = "_blank";
        afuera.rel = "noopener noreferrer";
        pie.appendChild(afuera);
        d.append(cab, marco, pie);
        document.body.appendChild(d);
        // Cerrar quita el video (con el botón, con Esc o tocando afuera) y
        // devuelve el foco a la tarjeta de donde se abrió.
        cerrar.addEventListener("click", () => d.close());
        d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
        d.addEventListener("close", () => {
            parar();
            marco.replaceChildren();
            if (volverA && document.contains(volverA)) volverA.focus();
            volverA = null;
        });
        window.addEventListener("message", alMensaje);
        // Al irse de la página (o dejarla en el fondo) se manda lo que haya.
        window.addEventListener("pagehide", () => mandar(medidor));
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") mandar(medidor); });
        cine = d;
        return d;
    }

    /* Cuánto vio. Con enablejsapi=1, el reproductor de YouTube dice por
       mensajes (postMessage) en qué segundo va y si está corriendo: es lo que
       hace la librería de YouTube por dentro, sin cargar su código en la
       página (la CSP no lo deja, y tendría la sesión al alcance). Se anotan
       los TRAMOS del video que corrieron reproduciéndose —de una muestra a la
       siguiente, si avanzó lo que da el reloj—, así que adelantar, volver
       atrás y la pausa no suman. Se mandan a la base con `alVer` cada 30
       segundos, al pausar, al cerrar y al salir de la página; la base los
       junta con los de antes y devuelve el total. Si el reproductor no
       contesta, no se anota nada y el video se ve igual. Lo que se mira en
       YouTube aparte («Abrir en YouTube») no se cuenta. */
    const YT = "https://www.youtube-nocookie.com";
    const CADA = 30000, TERMINO = 0, CORRIENDO = 1, PAUSA = 2;
    let medidor = null;

    // Junta [a, b) a una lista de tramos ordenados y sin pisarse.
    function sumarTramo(lista, a, b) {
        if (!(b > a)) return lista;
        const fuera = [];
        let puesto = false;
        for (const [x, y] of lista) {
            if (y < a) fuera.push([x, y]);
            else if (x > b) { if (!puesto) { fuera.push([a, b]); puesto = true; } fuera.push([x, y]); }
            else { a = Math.min(a, x); b = Math.max(b, y); }
        }
        if (!puesto) fuera.push([a, b]);
        return fuera;
    }

    function medir(g, iframe, tarjeta, alVer) {
        parar();
        const m = { g, iframe, tarjeta, alVer, tramos: [], estado: -1, velocidad: 1, previo: null, reloj: 0, oye: false, enviando: false };
        medidor = m;
        // Hasta que conteste, se le avisa que alguien escucha (como la librería).
        let veces = 0;
        const hola = () => {
            if (medidor !== m || m.oye || ++veces > 40) return clearInterval(m.hola);
            if (iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YT);
        };
        iframe.addEventListener("load", hola);
        m.hola = setInterval(hola, 500);
        if (alVer) m.envio = setInterval(() => mandar(m), CADA);
    }

    function alMensaje(e) {
        const m = medidor;
        if (!m || e.origin !== YT || e.source !== m.iframe.contentWindow) return;
        let d = e.data;
        if (typeof d === "string") { try { d = JSON.parse(d); } catch (_) { return; } }
        if (!d || typeof d !== "object") return;
        if (!m.oye) {
            m.oye = true;
            // Que avise también cuando corre o se detiene (como la librería, con addEventListener).
            m.iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"], id: 1, channel: "widget" }), YT);
        }
        if (d.event === "onStateChange" && typeof d.info === "number") cambiaEstado(m, d.info);
        const info = d.info && typeof d.info === "object" ? d.info : null;
        if (!info || (d.event !== "infoDelivery" && d.event !== "initialDelivery")) return;
        if (typeof info.playbackRate === "number" && info.playbackRate > 0) m.velocidad = info.playbackRate;
        if (typeof info.playerState === "number") cambiaEstado(m, info.playerState);
        if (typeof info.currentTime === "number" && Number.isFinite(info.currentTime)) avanzar(m, info.currentTime);
    }

    /* Detenido (en pausa, terminado, cargando) se olvida la última muestra: lo
       que se adelante con el video quieto no se cuenta, aunque haya pasado el
       rato. Se manda al pausar y al terminar; al cargar, no (con una conexión
       mala serían muchos envíos). */
    function cambiaEstado(m, estado) {
        if (estado === m.estado) return;
        m.estado = estado;
        if (estado === CORRIENDO) return;
        m.previo = null;
        if (estado === PAUSA || estado === TERMINO) mandar(m);
    }

    // Cuenta lo que corrió desde la muestra anterior si es lo que da el reloj
    // (a la velocidad que va, con un margen): un salto más grande es que adelantó.
    function avanzar(m, t) {
        const ahora = performance.now();
        if (m.estado !== CORRIENDO) { m.previo = null; return; }
        if (m.previo != null) {
            const corrio = t - m.previo;
            const daElReloj = ((ahora - m.reloj) / 1000) * m.velocidad + 2;
            if (corrio > 0 && corrio <= Math.max(3, daElReloj)) m.tramos = sumarTramo(m.tramos, Math.floor(m.previo), Math.ceil(t));
        }
        m.previo = t;
        m.reloj = ahora;
    }

    async function mandar(m) {
        if (!m || !m.alVer || m.enviando || !m.tramos.length) return;
        const tramos = m.tramos.slice(0, 200);   // la base recibe hasta 200 de una vez
        m.tramos = m.tramos.slice(200);
        m.enviando = true;
        try {
            const total = await m.alVer(m.g, tramos);
            if (Number.isFinite(total)) { m.g.visto_seg = total; ponerVisto(m.tarjeta, m.g); }
        } catch (e) {
            // Sin red se vuelven a juntar para la próxima; lo que la base rechazó, no.
            if (!(e && e.descartar)) tramos.forEach(([a, b]) => { m.tramos = sumarTramo(m.tramos, a, b); });
        } finally {
            m.enviando = false;
        }
    }

    function parar() {
        const m = medidor;
        if (!m) return;
        clearInterval(m.hola);
        clearInterval(m.envio);
        medidor = null;
        mandar(m);
    }

    function abrirCine(g, desde, alVer) {
        if (!ID_VIDEO.test(String(g.youtube_id || ""))) return;
        const d = armarCine();
        volverA = desde;
        d.querySelector("#grabacion-cine-titulo").textContent = (g.titulo || "Clase") + (g.tema ? " · " + g.tema : "");
        d.querySelector("#grabacion-cine-youtube").href = "https://youtu.be/" + encodeURIComponent(g.youtube_id);
        const video = document.createElement("iframe");
        // `origin` es a quién le contesta el reproductor sus mensajes.
        video.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(g.youtube_id) + "?rel=0&autoplay=1&enablejsapi=1"
            + (location.origin && location.origin !== "null" ? "&origin=" + encodeURIComponent(location.origin) : "");
        video.title = "Grabación de la " + (g.titulo || "clase");
        video.className = "h-full w-full";
        video.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen";
        video.allowFullscreen = true;
        video.referrerPolicy = "strict-origin-when-cross-origin";
        medir(g, video, desde, alVer);
        d.querySelector("#grabacion-cine-video").replaceChildren(video);
        if (!d.open) d.showModal();
        d.querySelector("#grabacion-cine-cerrar").focus();
    }

    function pintarGrabaciones(caja, grabaciones, proxima, vistas, alVer) {
        // Lo que ya vio va con su grabación (la fila de grabaciones_vistas de ese día).
        const visto = new Map((vistas || []).filter(Boolean).map((v) => [v.horario_id + "|" + v.fecha, Number(v.visto_seg) || 0]));
        const lista = (grabaciones || []).filter((g) => g && g.inicio && g.fin && ID_VIDEO.test(String(g.youtube_id || "")))
            .map((g) => Object.assign({}, g, { visto_seg: visto.get(g.horario_id + "|" + g.fecha) || 0 }));
        if (!lista.length) return 0;
        const seccion = el("section", "mt-6");
        seccion.setAttribute("aria-labelledby", "grabaciones-taller-titulo");
        const titulo = el("h3", "font-serif text-base font-bold text-brand-800 dark:text-white");
        titulo.id = "grabaciones-taller-titulo";
        const emoji = el("span", null, "🎞️ ");
        emoji.setAttribute("aria-hidden", "true");
        titulo.append(emoji, "Grabaciones de las sesiones");
        const sub = el("p", "mt-1 mb-3 text-sm text-brand-500 dark:text-brand-300",
            "Para repasar una sesión o ver la que te perdiste. Se abre en grande aquí mismo.");
        const rejilla = el("div", "grid gap-4 sm:grid-cols-2 lg:grid-cols-3");
        rejilla.setAttribute("role", "list");
        rejilla.setAttribute("aria-label", "Grabaciones");
        const item = (hijo) => { const li = el("div"); li.setAttribute("role", "listitem"); li.appendChild(hijo); return li; };
        lista.forEach((g) => rejilla.appendChild(item(tarjetaGrabacion(g, (x, b) => abrirCine(x, b, alVer)))));
        if (proxima) rejilla.appendChild(item(tarjetaProxima(proxima)));
        seccion.append(titulo, sub, rejilla);
        caja.appendChild(seccion);
        return lista.length;
    }

    /* Cuando la clase se abre o se cierra (llega por Realtime), se repinta
       solo el lugar de los botones: repintar la tarjeta entera borraría lo
       que dijo «Agregar a mi calendario». */
    function ponerEntrada(caja, entrada) {
        const lugar = caja && caja.querySelector("[data-entrada]");
        if (lugar) pintarEntrada(lugar, entrada, lugar.dataset.modalidad);
    }

    return { pintar, ponerEntrada, hora, dia, conPunto };
})();
