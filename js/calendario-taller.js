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
   se anota mientras la mira: ver «Cuánto vio cada uno»). Debajo de cada
   grabación va la presentación que se vio en esa sesión, para repasarla
   (ver «La presentación junto a la grabación»).

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
       grabaciones_vistas de quien mira; `alVer(g, tramos)`, lo que anota lo
       que vio y devuelve el total (ver «Cuánto vio»), y `presentaciones`, las
       sesiones del curso (sesiones.json de Formación Ajedrez), para poner la
       presentación junto a su grabación (ver presentacionDe). */
    function pintar(caja, sesiones, { ahora = new Date(), alBajar = null, entrada = null, grabaciones = null, vistas = null, alVer = null, presentaciones = null } = {}) {
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
        pintarGrabaciones(caja, grabaciones, lista[0], vistas, alVer, presentaciones, ahora);
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

    /* La presentación que se vio en la sesión de esa grabación: la de la sesión
       del curso con el mismo número («Sesión III» → la 3) y cuyo título empieza
       con el tema de la grabación (o al revés), sin mayúsculas, tildes ni
       signos: el tema «Encuadre del curso y reglas básicas» es la sesión 1,
       «Encuadre del curso y reglas básicas del ajedrez». El número solo no
       basta: otro taller con sus «Sesión I, II…» mostraría las láminas de este.
       Solo de una sesión que ya terminó (que tenga grabación ya dice que se
       dio). Devuelve el deck («formacion-ajedrez/clase-03») o "". */
    const ROMANO = { I: 1, V: 5, X: 10, L: 50, C: 100 };
    function aEntero(n) {
        if (/^\d+$/.test(n)) return Number(n);
        let total = 0;
        for (let i = 0; i < n.length; i++) {
            const v = ROMANO[n[i]], sig = ROMANO[n[i + 1]] || 0;
            total += v < sig ? -v : v;
        }
        return total;
    }
    const llano = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, " ").trim();
    function presentacionDe(g, presentaciones, ahora) {
        const n = numero(g.titulo), tema = llano(g.tema);
        if (!n || !tema || !(new Date(g.fin) <= ahora)) return "";
        const s = (presentaciones || []).find((x) => x && x.n === aEntero(n));
        const titulo = s && llano(s.titulo);
        if (!titulo || !(titulo.startsWith(tema) || tema.startsWith(titulo))) return "";
        return /^[a-z0-9-]+\/[a-z0-9-]+$/.test(s.presentacion || "") ? s.presentacion : "";
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
        const b = el("button", "group block w-full flex-1 overflow-hidden rounded-2xl bg-brand-50 text-left ring-1 ring-brand-100 transition hover:ring-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 dark:bg-brand-950 dark:ring-brand-800");
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
        const t = el("div", "flex-1 overflow-hidden rounded-2xl bg-brand-50 ring-1 ring-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 dark:bg-brand-950 dark:ring-brand-800");
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

    /* «📊 Ver la presentación», debajo de la tarjeta (un botón no puede ir
       dentro de otro). Se abre en la vista previa de js/vista-previa.js,
       lámina por lámina; las imágenes las sirve el worker solo a quien tiene
       acceso al curso. */
    function botonPresentacion(g, deck) {
        const b = el("button", "inline-flex items-center gap-1 self-start rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 hover:border-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60 dark:border-brand-700 dark:bg-brand-900 dark:text-brand-100");
        b.type = "button";
        b.dataset.presentacion = deck;
        b.setAttribute("aria-haspopup", "dialog");
        const emoji = el("span", null, "📊");
        emoji.setAttribute("aria-hidden", "true");
        b.append(emoji, " Ver la presentación", el("span", "sr-only", " de la " + (g.titulo || "clase")));   // del profe: textContent
        const titulo = (g.titulo || "Clase") + (g.tema ? " · " + g.tema : "");
        b.addEventListener("click", () => window.VistaPrevia && VistaPrevia.abrirPresentacion(deck, titulo, b));
        return b;
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
        // El video y, al lado (debajo en el celular), la lámina y los
        // capítulos cuando la sesión los tiene (ver «La grabación con
        // capítulos y su lámina»).
        const cuerpo = el("div", "mx-4 mt-3 grid gap-4 sm:mx-6");
        cuerpo.id = "grabacion-cine-cuerpo";
        const marco = el("div", "aspect-video overflow-hidden rounded-xl bg-black");
        marco.id = "grabacion-cine-video";
        const guia = el("div", "min-w-0");
        guia.id = "grabacion-cine-guia";
        guia.hidden = true;
        cuerpo.append(marco, guia);
        const pie = el("p", "px-4 pb-4 pt-3 text-sm sm:px-6");
        const afuera = el("a", "font-semibold text-white underline", "Abrir en YouTube (para verla en el celular o en pantalla completa)");
        afuera.id = "grabacion-cine-youtube";
        afuera.target = "_blank";
        afuera.rel = "noopener noreferrer";
        pie.appendChild(afuera);
        d.append(cab, cuerpo, pie);
        document.body.appendChild(d);
        // Cerrar quita el video (con el botón, con Esc o tocando afuera) y
        // devuelve el foco a la tarjeta de donde se abrió.
        cerrar.addEventListener("click", () => d.close());
        d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
        d.addEventListener("close", () => {
            parar();
            marco.replaceChildren();
            quitarGuia();
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
        if (typeof info.currentTime === "number" && Number.isFinite(info.currentTime)) {
            avanzar(m, info.currentTime);
            if (guiaActual && guiaActual.medidor === m) seguirVideo(guiaActual, info.currentTime);
        }
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

    function abrirCine(g, desde, alVer, deck) {
        if (!ID_VIDEO.test(String(g.youtube_id || ""))) return;
        const d = armarCine();
        quitarGuia();
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
        if (deck) ponerGuia(g, deck, medidor);
    }

    /* La grabación con capítulos y su lámina. Si la sesión del curso tiene su
       grabacion.json (junto a diapositivas.json, en la carpeta de la
       presentación; lo escribe herramientas/formacion-grabaciones.js), al lado
       del video van la lámina que se está explicando en ese momento y los
       capítulos: tocar uno lleva el video a ese minuto, y «Lámina anterior» y
       «Lámina siguiente» lo llevan a donde se explicó esa otra lámina. El
       video se mueve con los mismos mensajes con que se mide lo visto
       (seekTo, como la librería de YouTube); lo que se salta así no cuenta
       como visto, igual que adelantar. Los minutos son de ESE video: si la
       duración de la grabación no es la del archivo (se subió otra), no se
       pone nada, porque los capítulos caerían en cualquier parte. Sin el
       archivo o sin acceso, el video se ve igual que siempre.
       Las aclaraciones del profe: en el minuto en que el video dice algo
       que no es así, sale arriba una tarjeta con el avatar del profe Oscar
       (js/avatar-profe-oscar.js), la regla buena y su fuente, y se dice en
       voz; abajo, la lista de todas para ir directo. */
    let guiaActual = null;
    // La aclaración se ve 2 minutos de video desde que se dice; desde la
    // lista, el video arranca 10 segundos antes, para oír lo que se aclara.
    const DURA_ACLARACION = 120, ANTES_ACLARACION = 10;
    function quitarGuia() {
        guiaActual = null;
        const guia = cine && cine.querySelector("#grabacion-cine-guia");
        if (!guia) return;
        guia.replaceChildren();
        guia.hidden = true;
        cine.classList.remove("max-w-7xl");
        cine.classList.add("max-w-5xl");
        cine.querySelector("#grabacion-cine-cuerpo").classList.remove("lg:grid-cols-[minmax(0,1fr)_20rem]");
    }

    const entero = (n) => Number.isInteger(n) && n >= 0;
    async function leerGuia(deck, duracion) {
        const [curso, clase] = String(deck || "").split("/");
        if (!/^[a-z0-9-]+$/.test(curso || "") || !/^[a-z0-9-]+$/.test(clase || "")) return null;
        const carpeta = "cursos/recursos/" + curso + "/presentaciones/" + clase + "/";
        const pedir = (n) => fetch(carpeta + n, { cache: "no-cache", credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null));
        const gj = await pedir("grabacion.json");
        if (!gj || !(Number(duracion) > 0) || Math.abs(Number(gj.duracion) - Number(duracion)) > 2) return null;
        // Una lámina puede ser de la presentación de otra sesión del curso
        // (`clase`): la Sesión II empezó terminando lo pendiente de la I.
        const entradas = (Array.isArray(gj.laminas) ? gj.laminas : [])
            .filter((x) => x && entero(x.t) && x.t < gj.duracion && Number.isInteger(x.lamina) && (x.clase == null || /^clase-\d\d$/.test(x.clase)));
        const decks = [...new Set([clase].concat(entradas.map((x) => x.clase || clase)))];
        const leidas = await Promise.all(decks.map((c) => fetch("cursos/recursos/" + curso + "/presentaciones/" + c + "/diapositivas.json", { cache: "no-cache", credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : null)).catch(() => null)));
        const porDeck = new Map(decks.map((c, i) => [c, leidas[i] && Array.isArray(leidas[i].diapositivas) ? leidas[i].diapositivas : null]));
        const linea = entradas.map((x) => {
            const c = x.clase || clase, lista = porDeck.get(c), d = lista && lista[x.lamina - 1];
            if (!d || !/^[\w.-]+\.webp$/.test(d.imagen || "")) return null;
            return { t: x.t, lamina: x.lamina, total: lista.length, d, ruta: "cursos/recursos/" + curso + "/presentaciones/" + c + "/" + d.imagen, otra: c !== clase };
        }).filter(Boolean);
        const capitulos = (Array.isArray(gj.capitulos) ? gj.capitulos : [])
            .filter((c) => c && entero(c.t) && c.t < gj.duracion && typeof c.titulo === "string" && c.titulo.trim());
        // Lo que el video dice mal, con la regla buena y su fuente (ver «Las
        // aclaraciones del profe»).
        const aclaraciones = (Array.isArray(gj.aclaraciones) ? gj.aclaraciones : [])
            .filter((a) => a && entero(a.t) && a.t < gj.duracion && /^[a-z0-9-]+$/.test(a.avatar || "")
                && typeof a.titulo === "string" && typeof a.texto === "string" && typeof a.fuente === "string");
        if (!capitulos.length && !linea.length) return null;
        return { capitulos, linea, aclaraciones };
    }

    // El último de la lista que ya empezó en el segundo `t` (van en orden).
    function vigente(lista, t) {
        let i = -1;
        for (let k = 0; k < lista.length && lista[k].t <= t + 0.5; k++) i = k;
        return i;
    }

    function irA(m, t) {
        const w = m && m.iframe && m.iframe.contentWindow;
        if (!w) return;
        w.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [t, true], id: 1, channel: "widget" }), YT);
        w.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [], id: 1, channel: "widget" }), YT);
    }

    async function ponerGuia(g, deck, m) {
        let datos = null;
        try { datos = await leerGuia(deck, g.duracion_seg); } catch (e) { datos = null; }
        if (!datos || !cine || !cine.open || medidor !== m) return;
        const guia = cine.querySelector("#grabacion-cine-guia");
        const G = { medidor: m, datos, lam: -2, cap: -2, ac: -2 };
        guiaActual = G;
        cine.classList.remove("max-w-5xl");
        cine.classList.add("max-w-7xl");
        cine.querySelector("#grabacion-cine-cuerpo").classList.add("lg:grid-cols-[minmax(0,1fr)_20rem]");

        if (datos.aclaraciones.length) {
            // La tarjeta sale arriba de la lámina mientras dura (DURA_ACLARACION
            // segundos de video desde que se dice), y se lee en voz.
            const tarjeta = el("aside", "mb-4 flex gap-3 rounded-xl bg-white p-3 text-brand-900 shadow-lg ring-2 ring-accent-400");
            tarjeta.id = "grabacion-cine-aclaracion";
            tarjeta.setAttribute("aria-labelledby", "grabacion-cine-aclaracion-titulo");
            tarjeta.hidden = true;
            const img = el("img", "h-24 w-auto shrink-0 self-end");
            img.id = "grabacion-cine-aclaracion-avatar";
            img.decoding = "async";
            const texto = el("div", "min-w-0");
            const h = el("h3", "text-sm font-bold text-brand-800");
            h.id = "grabacion-cine-aclaracion-titulo";
            texto.append(h, el("p", "mt-1 text-sm"), el("p", "mt-1 text-xs text-brand-700"));
            tarjeta.append(img, texto);
            const voz = el("p", "sr-only");
            voz.id = "grabacion-cine-aclaracion-voz";
            voz.setAttribute("aria-live", "polite");
            guia.append(tarjeta, voz);
        }

        if (datos.linea.length) {
            const caja = el("section", "rounded-xl bg-white/5 p-3 ring-1 ring-white/10");
            caja.setAttribute("aria-labelledby", "grabacion-cine-lamina-titulo");
            const h = el("h3", "text-sm font-semibold text-brand-100");
            h.id = "grabacion-cine-lamina-titulo";
            const emoji = el("span", null, "📊 ");
            emoji.setAttribute("aria-hidden", "true");
            h.append(emoji, "La lámina de este momento");
            const img = el("img", "mt-2 aspect-video w-full rounded-lg bg-white object-contain");
            img.id = "grabacion-cine-lamina";
            img.decoding = "async";
            const cual = el("p", "mt-2 text-sm text-white");
            cual.id = "grabacion-cine-lamina-cual";
            const botones = el("div", "mt-2 flex gap-2");
            const boton = (texto, id, paso) => {
                const b = el("button", "flex-1 rounded-lg bg-white/15 px-2 py-1.5 text-xs font-semibold text-white hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:cursor-not-allowed disabled:opacity-50", texto);
                b.type = "button";
                b.id = id;
                b.addEventListener("click", () => {
                    const i = G.lam + paso, x = datos.linea[i];
                    if (!x) return;
                    irA(m, x.t);
                    seguirVideo(G, x.t);
                });
                return b;
            };
            botones.append(boton("◀ Lámina anterior", "grabacion-cine-lamina-antes", -1), boton("Lámina siguiente ▶", "grabacion-cine-lamina-despues", 1));
            caja.append(h, img, cual, botones);
            guia.appendChild(caja);
        }

        if (datos.capitulos.length) {
            const caja = el("nav", "mt-4 rounded-xl bg-white/5 p-3 ring-1 ring-white/10 lg:max-h-[22rem] lg:overflow-y-auto");
            caja.setAttribute("aria-labelledby", "grabacion-cine-capitulos-titulo");
            const h = el("h3", "text-sm font-semibold text-brand-100");
            h.id = "grabacion-cine-capitulos-titulo";
            const emoji = el("span", null, "📑 ");
            emoji.setAttribute("aria-hidden", "true");
            h.append(emoji, "Capítulos");
            const ayuda = el("p", "mt-1 text-xs text-brand-200", "Toca uno para ir a esa parte del video.");
            const ol = el("ol", "mt-2 space-y-1");
            ol.id = "grabacion-cine-capitulos";
            datos.capitulos.forEach((c) => {
                const li = el("li");
                const b = el("button", "flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
                b.type = "button";
                b.dataset.capitulo = String(c.t);
                const hora = el("span", "w-14 shrink-0 text-right font-mono text-xs text-brand-200", reloj(c.t));
                hora.setAttribute("aria-hidden", "true");
                b.append(hora, el("span", "sr-only", "Ir al minuto " + Math.floor(c.t / 60) + ": "), el("span", "min-w-0 flex-1", c.titulo),
                    el("span", "hidden shrink-0 text-xs font-bold text-accent-300", "Viendo"));
                b.addEventListener("click", () => { irA(m, c.t); seguirVideo(G, c.t); });
                li.appendChild(b);
                ol.appendChild(li);
            });
            caja.append(h, ayuda, ol);
            guia.appendChild(caja);
        }

        if (datos.aclaraciones.length) {
            // Todas a la mano: cada una lleva el video un poco antes de donde se dice.
            const caja = el("section", "mt-4 rounded-xl bg-white/5 p-3 ring-1 ring-white/10");
            caja.setAttribute("aria-labelledby", "grabacion-cine-aclaraciones-titulo");
            const cab = el("div", "flex items-center gap-2");
            const av = window.AvatarProfeOscar && AvatarProfeOscar.porId("arbitro");
            if (av) {
                const cara = el("img", "h-10 w-auto shrink-0");
                cara.src = AvatarProfeOscar.ruta(av.id);
                cara.alt = "";
                cab.appendChild(cara);
            }
            const h = el("h3", "text-sm font-semibold text-brand-100", "Aclaraciones del profe");
            h.id = "grabacion-cine-aclaraciones-titulo";
            cab.appendChild(h);
            const ayuda = el("p", "mt-1 text-xs text-brand-200",
                datos.aclaraciones.length === 1 ? "En un momento el video dice algo que no es así. Toca para ir ahí." : "En " + datos.aclaraciones.length + " momentos el video dice algo que no es así. Toca una para ir ahí.");
            const ol = el("ol", "mt-2 space-y-1");
            ol.id = "grabacion-cine-aclaraciones";
            datos.aclaraciones.forEach((a) => {
                const li = el("li");
                const b = el("button", "flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
                b.type = "button";
                b.dataset.aclaracion = String(a.t);
                const hora = el("span", "w-14 shrink-0 text-right font-mono text-xs text-brand-200", reloj(a.t));
                hora.setAttribute("aria-hidden", "true");
                b.append(hora, el("span", "sr-only", "Ir al minuto " + Math.floor(a.t / 60) + ": "), el("span", "min-w-0 flex-1", a.titulo));
                const ir = Math.max(0, a.t - ANTES_ACLARACION);
                b.addEventListener("click", () => { irA(m, ir); seguirVideo(G, ir); });
                li.appendChild(b);
                ol.appendChild(li);
            });
            caja.append(cab, ayuda, ol);
            guia.appendChild(caja);
        }
        guia.hidden = false;
        seguirVideo(G, 0);
    }

    // Pone la lámina y marca el capítulo del segundo `t` (solo si cambiaron).
    function seguirVideo(G, t) {
        if (!cine || guiaActual !== G) return;
        const { datos } = G;
        const lam = vigente(datos.linea, t);
        if (lam !== G.lam && datos.linea.length) {
            G.lam = lam;
            const x = datos.linea[Math.max(0, lam)], d = x.d;
            const img = cine.querySelector("#grabacion-cine-lamina");
            img.src = x.ruta;
            img.alt = d.texto || d.titulo || "";
            // De otra sesión se dice cuál: «Lámina 40 de 51 de la Sesión 1».
            const deOtra = x.otra ? " de la Sesión " + Number(/\d+$/.exec(x.ruta.split("/").slice(-2)[0])[0]) : "";
            cine.querySelector("#grabacion-cine-lamina-cual").textContent = "Lámina " + x.lamina + " de " + x.total + deOtra + (d.titulo ? ": " + d.titulo : "");
            cine.querySelector("#grabacion-cine-lamina-antes").disabled = lam <= 0;
            cine.querySelector("#grabacion-cine-lamina-despues").disabled = lam >= datos.linea.length - 1;
        }
        if (datos.aclaraciones.length) {
            const i = vigente(datos.aclaraciones, t), a = datos.aclaraciones[i];
            const ac = a && t < a.t + DURA_ACLARACION ? i : -1;
            if (ac !== G.ac) {
                G.ac = ac;
                const tarjeta = cine.querySelector("#grabacion-cine-aclaracion");
                tarjeta.hidden = ac < 0;
                if (ac >= 0) {
                    const av = window.AvatarProfeOscar && AvatarProfeOscar.porId(a.avatar);
                    const img = cine.querySelector("#grabacion-cine-aclaracion-avatar");
                    img.hidden = !av;
                    if (av) { img.src = AvatarProfeOscar.ruta(av.id); img.alt = av.alt; }
                    const [h, p, f] = tarjeta.lastElementChild.children;
                    h.textContent = "Aclaración del profe: " + a.titulo;
                    p.textContent = a.texto;
                    f.textContent = "Fuente: " + a.fuente;
                    cine.querySelector("#grabacion-cine-aclaracion-voz").textContent = "Aclaración del profe: " + a.titulo + ". " + a.texto;
                }
            }
        }
        const cap = vigente(datos.capitulos, t);
        if (cap !== G.cap && datos.capitulos.length) {
            G.cap = cap;
            cine.querySelectorAll("#grabacion-cine-capitulos button").forEach((b, i) => {
                const es = i === cap;
                if (es) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
                b.classList.toggle("bg-white/15", es);
                b.lastElementChild.classList.toggle("hidden", !es);
            });
            // Que el capítulo que corre se vea en la lista (tiene su propia
            // barra en la computadora): se mueve solo la lista, no la página.
            const lista = cine.querySelector("#grabacion-cine-capitulos").parentElement, b = lista.querySelectorAll("button")[cap];
            if (b && lista.scrollHeight > lista.clientHeight) {
                const arriba = b.offsetTop - lista.offsetTop;
                if (arriba < lista.scrollTop || arriba + b.offsetHeight > lista.scrollTop + lista.clientHeight) lista.scrollTop = Math.max(0, arriba - 48);
            }
        }
    }

    function pintarGrabaciones(caja, grabaciones, proxima, vistas, alVer, presentaciones, ahora) {
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
            "Para repasar una sesión o ver la que te perdiste, con la presentación que se vio. Se abre en grande aquí mismo.");
        const rejilla = el("div", "grid gap-4 sm:grid-cols-2 lg:grid-cols-3");
        rejilla.setAttribute("role", "list");
        rejilla.setAttribute("aria-label", "Grabaciones");
        const item = (...hijos) => { const li = el("div", "flex flex-col gap-2"); li.setAttribute("role", "listitem"); li.append(...hijos); return li; };
        lista.forEach((g) => {
            const deck = presentacionDe(g, presentaciones, ahora || new Date());
            const tarjeta = tarjetaGrabacion(g, (x, b) => abrirCine(x, b, alVer, deck));
            rejilla.appendChild(deck ? item(tarjeta, botonPresentacion(g, deck)) : item(tarjeta));
        });
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

/*! rev bfb5bbb0d2d82f9f */
