/* La guía de estudio de una clase, en «Audios de las clases» (audios-clases.html?clase=<id>).

   Lo pidió el dueño para ADAES, el grupo de alumnos ciegos: una clase de hora y
   media no se repasa escuchándola entera, hay que poder MOVERSE dentro de ella.
   Por eso, alrededor del audio:

   - Botones para saltar (15 segundos, 1 minuto) y atajos que el lector de
     pantalla no se come (Alt+Mayúscula+flechas), y «¿En qué minuto voy?», que
     dice el minuto y el tema.
   - De qué se trató y los temas con su minuto: cada tema es un botón que lleva
     el audio ahí.
   - Buscar una palabra en lo que se dijo: cada frase encontrada lleva al
     momento en que se dijo.
   - Las partidas que se dictaron, para recorrerlas jugada por jugada con la
     jugada dicha en palabras y la posición leída. Solo las que el profe revisó:
     Whisper confunde la notación dicha.
   - Preguntas de repaso, que pagan Puntos Ajedrez si se aciertan a la primera
     (lo decide la base, en responder_repaso()).
   - Marcas propias: «volver a este minuto», con una nota.

   Las tablas y sus permisos: migración 20261112060425_audios_clase_guia.

   Ver «La guía de estudio de cada clase» en docs/decisiones/accesibilidad.md. */
window.AudiosGuia = (function () {
    let audioActivo = null;
    let anunciar = () => {};

    function el(tag, clase, texto) {
        const n = document.createElement(tag);
        if (clase) n.className = clase;
        if (texto != null) n.textContent = texto;
        return n;
    }
    const BOTON = "bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-brand-100 font-semibold px-3 py-2 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60";
    const ENLACE = "text-left text-brand-700 dark:text-accent-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
    function boton(texto, clase, etiqueta) {
        const b = el("button", clase || BOTON, texto);
        b.type = "button";
        if (etiqueta) b.setAttribute("aria-label", etiqueta);
        return b;
    }

    /* «12:30» o «1:05:20». */
    function reloj(seg) {
        seg = Math.max(0, Math.floor(+seg || 0));
        const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
        const dos = (x) => String(x).padStart(2, "0");
        return h ? h + ":" + dos(m) + ":" + dos(s) : m + ":" + dos(s);
    }
    /* Para el lector: «minuto 12 con 30 segundos», «1 hora, 5 minutos». */
    function relojDicho(seg) {
        seg = Math.max(0, Math.floor(+seg || 0));
        const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
        if (h) return h + (h === 1 ? " hora" : " horas") + " y " + m + (m === 1 ? " minuto" : " minutos");
        return "minuto " + m + (s ? " con " + s + " segundos" : "");
    }

    /* Sin tildes ni mayúsculas, para buscar «filidor» y encontrar «Filidor». */
    function normal(t) {
        return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    }
    /* Las frases con su segundo, sin las repetidas seguidas (los bucles de
       Whisper en el silencio: «no», «no», «no»). */
    function frases(segmentos) {
        const salida = [];
        (Array.isArray(segmentos) ? segmentos : []).forEach((s) => {
            if (!Array.isArray(s) || s.length < 2) return;
            const t = String(s[1] || "").trim();
            if (!t) return;
            if (salida.length && salida[salida.length - 1][1] === t) return;
            salida.push([Math.max(0, Math.floor(+s[0] || 0)), t]);
        });
        return salida;
    }
    function buscar(lista, palabra, max) {
        const q = normal(palabra).trim();
        if (q.length < 2) return [];
        return lista.filter((f) => normal(f[1]).includes(q)).slice(0, max || 50);
    }
    /* Las frases agrupadas por minuto, para leer todo de corrido. */
    function porMinuto(lista) {
        const grupos = [];
        lista.forEach(([seg, t]) => {
            const min = Math.floor(seg / 60);
            const g = grupos[grupos.length - 1];
            if (g && g.min === min) g.texto += " " + t;
            else grupos.push({ min, seg: min * 60, texto: t });
        });
        return grupos;
    }
    /* El tema que va sonando: el último que empezó antes de este segundo. */
    function temaEn(indice, seg) {
        let actual = null;
        (indice || []).forEach((t) => { if (t && +t.seg <= seg) actual = t; });
        return actual;
    }

    /* La jugada como se escribe en español (C, A, T, D, R) y como se dice. */
    function sanEspanol(san) {
        const m = { N: "C", B: "A", R: "T", Q: "D", K: "R" };
        return String(san).replace(/^[NBRQK]/, (p) => m[p]).replace(/=([NBRQ])/, (x, p) => "=" + m[p]);
    }
    function sanDicha(san) {
        const s = String(san || "");
        if (!window.BlindNotation) return sanEspanol(s);
        const d = BlindNotation.sanSpoken(s);
        return /^[a-h]/.test(s) ? "peón " + d : d;
    }
    /* Las jugadas que sí son legales desde la posición inicial, una por una:
       en la primera que no lo es, se corta. Ninguna posición se inventa. */
    function jugadasLegales(texto) {
        if (typeof Chess === "undefined") return [];
        const g = new Chess();
        const salida = [];
        String(texto || "").replace(/\d+\.(\.\.)?/g, " ").split(/\s+/).filter(Boolean).every((j) => {
            const mv = g.move(j, { sloppy: true });
            if (!mv) return false;
            salida.push(mv.san);
            return true;
        });
        return salida;
    }

    /* ---------- Los minutos exactos de Whisper ---------- */
    /* La transcripción de Whisper con sus minutos (whisper --output_format
       json): {"segments": [{"start": 12.3, "text": " …"}, …]}. */
    function deWhisper(obj) {
        if (!obj || !Array.isArray(obj.segments)) return null;
        return frases(obj.segments.map((s) => [s && s.start, s && String(s.text || "").trim()]));
    }
    function palabras(t) {
        return normal(t).replace(/[^a-z0-9ñ]+/g, " ").split(" ").filter((w) => w.length >= 3);
    }
    /* Vuelve a encontrar el minuto de cada tema en la transcripción nueva:
       busca la cita del tema (lo que se dijo justo ahí) cerca del minuto
       aproximado, en ventanas de cuatro frases. Si no la encuentra (menos de
       6 de cada 10 palabras), el tema se queda con su minuto. Devuelve también
       cuánto se movió cada tema encontrado, para mover las partidas igual. */
    function reanclar(indice, nuevos, duracion) {
        const lista = frases(nuevos);
        const ventanas = lista.map((f, i) => new Set(palabras(lista.slice(i, i + 4).map((x) => x[1]).join(" "))));
        const margen = Math.max(600, (+duracion || 0) * 0.2);
        const movidas = [];
        const salida = (Array.isArray(indice) ? indice : []).map((t) => {
            const x = Object.assign({}, t);
            const ps = Array.from(new Set(palabras(t.cita)));
            if (ps.length < 3) return x;
            let mejor = null, mejorP = 0, mejorD = Infinity;
            lista.forEach((f, i) => {
                const d = Math.abs(f[0] - t.seg);
                if (d > margen) return;
                const p = ps.filter((w) => ventanas[i].has(w)).length / ps.length;
                if (p > mejorP + 1e-9 || (Math.abs(p - mejorP) < 1e-9 && d < mejorD)) { mejor = f[0]; mejorP = p; mejorD = d; }
            });
            if (mejor != null && mejorP >= 0.6) { movidas.push([t.seg, mejor - t.seg]); x.seg = mejor; }
            return x;
        }).sort((a, b) => a.seg - b.seg);
        return { indice: salida, movidas, encontrados: movidas.length };
    }
    /* Una partida se mueve lo mismo que el tema encontrado más cercano. */
    function moverSeg(seg, movidas) {
        if (seg == null || !movidas || !movidas.length) return seg;
        let cerca = movidas[0];
        movidas.forEach((m) => { if (Math.abs(m[0] - seg) < Math.abs(cerca[0] - seg)) cerca = m; });
        return Math.max(0, seg + cerca[1]);
    }

    /* ---------- Moverse en el audio ---------- */
    function ir(audio, seg, reproducir) {
        if (!audio) return;
        const hacer = () => {
            audio.currentTime = Math.max(0, Math.min(seg, (audio.duration || seg + 1) - 0.5));
            if (reproducir) { const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
        };
        audioActivo = audio;
        if (audio.readyState >= 1) hacer();
        else { audio.addEventListener("loadedmetadata", hacer, { once: true }); audio.load(); }
    }
    function saltar(audio, delta) {
        if (!audio) return;
        audioActivo = audio;
        ir(audio, (audio.currentTime || 0) + delta, false);
        anunciar((delta < 0 ? "Atrás " : "Adelante ") + duracionSalto(delta) + ". Vas en el " + relojDicho(audio.currentTime) + ".");
    }
    function duracionSalto(d) { d = Math.abs(d); return d >= 60 ? (d / 60) + (d === 60 ? " minuto" : " minutos") : d + " segundos"; }

    /* Los botones para saltar, debajo de cualquier reproductor. */
    function controles(audio, extra) {
        const fila = el("div", "flex flex-wrap gap-2 mt-3");
        fila.setAttribute("role", "group");
        fila.setAttribute("aria-label", "Moverse en el audio");
        [[-60, "Atrás 1 min"], [-15, "Atrás 15 s"], [15, "Adelante 15 s"], [60, "Adelante 1 min"]].forEach(([d, t]) => {
            const b = boton(t, null, (d < 0 ? "Atrás " : "Adelante ") + duracionSalto(d));
            b.addEventListener("click", () => saltar(audio, d));
            fila.append(b);
        });
        const donde = boton("¿En qué minuto voy?");
        donde.addEventListener("click", () => decirDonde(audio, extra && extra.indice));
        fila.append(donde);
        audio.addEventListener("play", () => { audioActivo = audio; });
        return fila;
    }
    function decirDonde(audio, indice) {
        const seg = audio.currentTime || 0;
        const t = temaEn(indice, seg);
        anunciar("Vas en el " + relojDicho(seg) + (audio.duration ? " de " + reloj(audio.duration) : "") + "." + (t ? " Tema: " + t.titulo + "." : ""));
    }

    /* Los atajos: Alt+Mayúscula+flecha (15 s), con Control 1 min. El lector de
       pantalla deja pasar las combinaciones con Alt; las letras sueltas, no. */
    let opcionesAtajos = {}, atajosPuestos = false;
    function atajos(o) {
        opcionesAtajos = o || {};
        if (atajosPuestos) return;   // la guía se vuelve a montar al publicar una partida
        atajosPuestos = true;
        document.addEventListener("keydown", (e) => {
            const opciones = opcionesAtajos;
            if (!e.altKey || !e.shiftKey || !audioActivo) return;
            const a = audioActivo;
            const k = e.key;
            if (k === "ArrowLeft" || k === "ArrowRight") {
                e.preventDefault();
                saltar(a, (k === "ArrowLeft" ? -1 : 1) * (e.ctrlKey ? 60 : 15));
            } else if (k === "ArrowDown" || k === "ArrowUp") {
                e.preventDefault();
                if (a.paused) { const p = a.play(); if (p && p.catch) p.catch(() => {}); anunciar("Sigue el audio."); }
                else { a.pause(); anunciar("En pausa, en el " + relojDicho(a.currentTime) + "."); }
            } else if (e.code === "KeyT") {
                e.preventDefault();
                decirDonde(a, opciones && opciones.indice);
            } else if (e.code === "KeyM" && opciones && opciones.marcar) {
                e.preventDefault();
                opciones.marcar();
            }
        });
    }

    /* ---------- La guía ---------- */
    function seccion(titulo, id) {
        const s = el("section", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 mt-5");
        const h = el("h3", "font-serif text-xl font-bold text-brand-800 dark:text-white mb-3", titulo);
        h.id = id;
        s.setAttribute("aria-labelledby", id);
        s.append(h);
        return s;
    }

    const AVISO_APROX = "Los minutos son aproximados: pueden caer uno o dos minutos antes o después. Si no oyes el tema, avanza o retrocede un minuto.";
    function temas(a, audio) {
        const s = seccion("Temas de la clase", "temas");
        if (a.minutos_aproximados) s.append(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-2", AVISO_APROX));
        const ol = el("ol", "space-y-2");
        a.indice.forEach((t) => {
            const li = el("li");
            const b = boton(reloj(t.seg) + " · " + t.titulo, ENLACE, "Escuchar desde el " + relojDicho(t.seg) + ": " + t.titulo);
            b.addEventListener("click", () => { ir(audio, t.seg, true); anunciar("Desde el " + relojDicho(t.seg) + ": " + t.titulo + "."); });
            li.append(b);
            ol.append(li);
        });
        s.append(ol);
        return s;
    }

    function buscador(lista, audio, aproximados) {
        const s = seccion("Buscar en lo que se dijo", "buscar");
        if (aproximados) s.append(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-2", AVISO_APROX));
        const form = el("form", "flex flex-wrap gap-2 items-end");
        form.setAttribute("role", "search");
        const caja = el("div", "flex-1 min-w-[12rem]");
        const lab = el("label", "block text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1", "Una palabra o una jugada (por ejemplo «enroque» o «caballo»)");
        lab.htmlFor = "buscar-palabra";
        const inp = el("input", "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        inp.type = "search"; inp.id = "buscar-palabra"; inp.autocomplete = "off";
        caja.append(lab, inp);
        const ir_ = el("button", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Buscar");
        ir_.type = "submit";
        form.append(caja, ir_);
        const estado = el("p", "text-sm text-brand-600 dark:text-brand-300 mt-3");
        estado.id = "buscar-estado";
        estado.setAttribute("role", "status");
        const ol = el("ol", "space-y-2 mt-2");
        ol.id = "buscar-resultados";
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            ol.textContent = "";
            const q = inp.value.trim();
            if (normal(q).length < 2) { estado.textContent = "Escribe al menos dos letras."; return; }
            const total = lista.filter((f) => normal(f[1]).includes(normal(q))).length;
            const hallados = buscar(lista, q, 50);
            estado.textContent = !total ? "Ninguna frase dice «" + q + "». Prueba con otra palabra: la transcripción puede haberla escrito distinto."
                : (total === 1 ? "Una frase dice «" + q + "»." : total + " frases dicen «" + q + "»." + (total > 50 ? " Van las primeras 50." : "")) + " Toca una para escucharla.";
            hallados.forEach(([seg, t]) => {
                const li = el("li");
                const b = boton(reloj(seg) + " · " + t, ENLACE, relojDicho(seg) + ": " + t);
                b.addEventListener("click", () => ir(audio, Math.max(0, seg - 3), true));
                li.append(b);
                ol.append(li);
            });
        });
        s.append(form, estado, ol);
        return s;
    }

    function todoLoDicho(lista, audio) {
        const det = el("details", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 mt-5");
        const sum = el("summary", "cursor-pointer font-serif text-xl font-bold text-brand-800 dark:text-white rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Todo lo que se dijo, minuto a minuto");
        det.append(sum);
        let hecho = false;
        det.addEventListener("toggle", () => {
            if (!det.open || hecho) return;
            hecho = true;
            det.append(el("p", "text-xs text-brand-500 dark:text-brand-300 mt-3", "La escribió una computadora a partir del audio: puede tener palabras equivocadas, sobre todo en las jugadas. Toca el minuto para escuchar desde ahí."));
            porMinuto(lista).forEach((g) => {
                const p = el("p", "mt-3 text-brand-800 dark:text-brand-100 leading-relaxed");
                const b = boton(reloj(g.seg), ENLACE + " font-semibold mr-2", "Escuchar desde el " + relojDicho(g.seg));
                b.addEventListener("click", () => ir(audio, g.seg, true));
                p.append(b, document.createTextNode(g.texto));
                det.append(p);
            });
        });
        return det;
    }

    /* ---------- Las partidas ---------- */
    function partidas(a, lista, audio, opciones) {
        const s = seccion("Partidas de la clase", "partidas");
        if (opciones.puedeSubir && lista.some((p) => !p.revisada)) {
            s.append(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-3", "Las sacó una computadora de lo que se dijo: revísalas contra el audio antes de publicarlas. Los alumnos solo ven las publicadas."));
        }
        lista.forEach((p) => s.append(partida(p, audio, opciones)));
        return s;
    }

    function partida(p, audio, opciones) {
        const caja = el("div", "border-t border-brand-100 dark:border-brand-800 pt-4 mt-4 first-of-type:border-0");
        const idT = "partida-" + p.id;
        const h = el("h4", "font-semibold text-lg text-brand-800 dark:text-white", p.titulo);
        h.id = idT;
        caja.setAttribute("role", "group");
        caja.setAttribute("aria-labelledby", idT);
        caja.append(h);
        if (!p.revisada) caja.append(el("p", "text-sm font-semibold text-amber-800 dark:text-amber-300", "Sin revisar: los alumnos todavía no la ven."));
        const jugadas = jugadasLegales(p.jugadas);
        const g = new Chess();
        let i = 0;   // cuántas jugadas van hechas
        const pos = el("p", "mt-2 text-brand-800 dark:text-brand-100");
        pos.setAttribute("aria-live", "polite");
        const texto = el("p", "mt-2 text-sm text-brand-600 dark:text-brand-300 font-mono break-words");
        texto.setAttribute("aria-hidden", "true");

        function pintar(decir) {
            g.reset();
            for (let k = 0; k < i; k++) g.move(jugadas[k]);
            let t;
            if (!i) t = "Posición inicial. " + jugadas.length + " jugadas.";
            else {
                const k = i - 1, num = Math.floor(k / 2) + 1;
                t = "Jugada " + num + (k % 2 ? ", negras: " : ", blancas: ") + sanDicha(jugadas[k]) + ".";
                if (g.in_checkmate()) t += " Jaque mate.";
                else if (g.in_stalemate()) t += " Ahogado.";
                if (i === jugadas.length) t += " Es la última.";
            }
            pos.textContent = decir ? t : "";
            texto.textContent = "";
            jugadas.forEach((j, k) => {
                const sp = el("span", k === i - 1 ? "font-bold text-brand-900 dark:text-white bg-accent-100 dark:bg-accent-700 rounded px-0.5" : null,
                    (k % 2 ? "" : (Math.floor(k / 2) + 1) + ". ") + sanEspanol(j) + " ");
                texto.append(sp);
            });
            if (!decir) pos.textContent = t;
        }
        const fila = el("div", "flex flex-wrap gap-2 mt-3");
        fila.setAttribute("role", "group");
        fila.setAttribute("aria-label", "Recorrer la partida " + p.titulo);
        const nav = [["Al principio", () => { i = 0; }], ["Anterior", () => { i = Math.max(0, i - 1); }],
            ["Siguiente", () => { i = Math.min(jugadas.length, i + 1); }], ["Al final", () => { i = jugadas.length; }]];
        nav.forEach(([t, f]) => {
            const b = boton(t, null, t === "Siguiente" || t === "Anterior" ? "Jugada " + t.toLowerCase() : t);
            b.addEventListener("click", () => { f(); pintar(true); });
            fila.append(b);
        });
        const leer = boton("Leer la posición");
        leer.addEventListener("click", () => { pos.textContent = window.BlindNotation ? BlindNotation.positionSentence(g) : g.fen(); });
        fila.append(leer);
        if (p.seg != null) {
            const oir = boton("Escucharla en la clase", null, "Escuchar la partida en la clase, desde el " + relojDicho(p.seg));
            oir.addEventListener("click", () => ir(audio, p.seg, true));
            fila.append(oir);
        }
        caja.append(fila, pos, texto);
        pintar(false);
        if (opciones.puedeSubir) caja.append(revisar(p, opciones));
        return caja;
    }

    function revisar(p, opciones) {
        const fila = el("div", "flex flex-wrap gap-3 mt-3");
        const pub = boton(p.revisada ? "Ocultarla a los alumnos" : "Publicarla para los alumnos", null,
            (p.revisada ? "Ocultar a los alumnos la partida " : "Publicar para los alumnos la partida ") + p.titulo);
        pub.addEventListener("click", async () => {
            pub.disabled = true;
            const { error } = await sb.from("audios_clase_partidas").update({ revisada: !p.revisada }).eq("id", p.id);
            if (error) { pub.disabled = false; Avisos.avisar("No se pudo guardar.", { tipo: "error" }); return; }
            Avisos.avisar(p.revisada ? "La partida ya no se ve." : "Publicada: los alumnos ya la ven.");
            opciones.recargar();
        });
        const quitar = boton("Quitar la partida", "text-sm font-semibold text-red-700 dark:text-red-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Quitar la partida " + p.titulo);
        quitar.addEventListener("click", async () => {
            if (!await Avisos.confirmar("¿Quitar la partida «" + p.titulo + "»?", { aceptar: "Quitar la partida", peligro: true })) return;
            const { error } = await sb.from("audios_clase_partidas").delete().eq("id", p.id);
            if (error) { Avisos.avisar("No se pudo quitar.", { tipo: "error" }); return; }
            opciones.recargar();
        });
        fila.append(pub, quitar);
        return fila;
    }

    /* ---------- Las preguntas de repaso ---------- */
    function preguntas(a, lista, hechas) {
        const s = seccion("Preguntas de repaso", "preguntas");
        s.append(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-2", "Si aciertas a la primera, ganas 2 Puntos Ajedrez por pregunta."));
        lista.forEach((q) => s.append(pregunta(a, q, lista.length, hechas.get(q.n))));
        return s;
    }

    /* Una pregunta con sus radios. Con «extra.vuelta» es una vuelta del repaso
       de hoy (responder_vuelta, que dice cuándo vuelve); si no, la primera
       respuesta (responder_repaso, que paga la primera vez). */
    function pregunta(a, q, total, hecha, extra) {
        extra = extra || {};
        const fs = el("fieldset", "border-t border-brand-100 dark:border-brand-800 pt-4 mt-4");
        const lg = el("legend", "font-semibold text-brand-800 dark:text-white", (extra.leyenda || "Pregunta " + q.n + " de " + total) + ": " + q.pregunta);
        fs.append(lg);
        const nombre = extra.nombre || "preg-" + q.n;
        const radios = q.opciones.map((op, k) => {
            const lab = el("label", "flex items-start gap-2 mt-2 text-brand-800 dark:text-brand-100 cursor-pointer");
            const r = el("input", "mt-1 accent-accent-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
            r.type = "radio"; r.name = nombre; r.value = String(k + 1);
            lab.append(r, el("span", null, op));
            fs.append(lab);
            return r;
        });
        const b = boton("Contestar", "mt-3 bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60", "Contestar la pregunta " + q.n);
        const res = el("p", "mt-3 text-sm");
        res.setAttribute("role", "status");
        fs.append(b, res);

        async function contestar(opcion, primeraVez) {
            b.disabled = true;
            const { data, error } = await sb.rpc(extra.vuelta ? "responder_vuelta" : "responder_repaso", { p_audio: a.id, p_n: q.n, p_opcion: opcion });
            const r = Array.isArray(data) ? data[0] : data;
            if (error || !r) { b.disabled = false; res.textContent = "No se pudo revisar la respuesta. Vuelve a intentarlo."; return; }
            radios.forEach((x) => { x.disabled = true; });
            const buena = q.opciones[r.correcta - 1];
            let t = r.acerto ? "¡Correcto!" : "No era esa. La buena es: «" + buena + "».";
            if (r.puntos > 0) t += " Ganaste " + r.puntos + (r.puntos === 1 ? " Punto Ajedrez." : " Puntos Ajedrez.");
            else if (r.acerto && !r.primera && primeraVez) t += " Ya la habías contestado antes: los puntos se dan solo la primera vez.";
            if (r.explicacion) t += " " + r.explicacion;
            if (extra.vuelta) t += r.proxima ? " Vuelve el " + diaDicho(r.proxima) + "." : " Ya la aprendiste: no vuelve más.";
            else if (r.primera) t += " Vuelve dentro de " + (r.acerto ? "dos días" : "un día") + ", para que no se te olvide.";
            res.className = "mt-3 text-sm " + (r.acerto ? "text-green-800 dark:text-green-300" : "text-brand-800 dark:text-brand-100");
            res.textContent = t;
            b.hidden = true;
        }
        if (hecha) {
            radios.forEach((x) => { x.disabled = true; x.checked = +x.value === hecha.opcion; });
            res.textContent = hecha.acerto ? "Ya la contestaste y acertaste." : "Ya la contestaste y no acertaste.";
            b.textContent = "Ver la respuesta";
            b.setAttribute("aria-label", "Ver la respuesta de la pregunta " + q.n);
            b.addEventListener("click", () => contestar(hecha.opcion, false));
        } else {
            b.addEventListener("click", () => {
                const elegida = radios.find((x) => x.checked);
                if (!elegida) { res.textContent = "Elige una opción."; return; }
                contestar(+elegida.value, true);
            });
        }
        return fs;
    }

    /* ---------- Los ejercicios de las posiciones de la clase ---------- */
    /* Las posiciones que el profe dictó, para contestarlas escribiendo la
       jugada («Cf3», «Txe6», «e4»). La jugada se entiende con
       ComandosTablero.jugadaEscrita (la misma de todo Entrenamiento) entre las
       legales de la posición, y la revisa la base (responder_ejercicio): la
       buena no se puede leer desde afuera. El profe ve además la respuesta
       para revisarla antes de publicar. */
    function jugadaDe(fen, texto) {
        const g = new Chess(fen);
        let mv = null;
        if (window.ComandosTablero && ComandosTablero.jugadaEscrita) {
            const x = ComandosTablero.jugadaEscrita(g, texto);
            if (x) mv = g.move({ from: x.from, to: x.to, promotion: x.promotion || undefined });
        } else {
            mv = g.move(String(texto || "").trim(), { sloppy: true });
        }
        return mv ? mv.san : null;
    }

    function ejercicios(a, lista, hechos, audio, opciones, respuestas) {
        const s = seccion("Ejercicios de la clase", "ejercicios");
        s.append(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-2",
            "Las posiciones que dictó el profe. Escribe tu jugada como se anota (por ejemplo «Cf3», «Txe6» o «e4»). Si aciertas al primer intento, ganas 2 Puntos Ajedrez."));
        if (opciones.puedeSubir && lista.some((e) => !e.revisado)) {
            s.append(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-2",
                "Las posiciones salen de lo que se dictó y Stockfish confirmó que la jugada es la única buena, pero revísalas contra el audio antes de publicarlas. Los alumnos solo ven las publicadas."));
        }
        lista.forEach((e) => s.append(ejercicio(a, e, hechos.get(e.id), audio, opciones, respuestas.get(e.id))));
        return s;
    }

    function ejercicio(a, e, hecho, audio, opciones, respuesta) {
        const caja = el("div", "border-t border-brand-100 dark:border-brand-800 pt-4 mt-4");
        const idT = "ejercicio-" + e.id;
        const h = el("h4", "font-semibold text-lg text-brand-800 dark:text-white", "Ejercicio " + e.n);
        h.id = idT;
        caja.setAttribute("role", "group");
        caja.setAttribute("aria-labelledby", idT);
        caja.append(h, el("p", "mt-1 text-brand-800 dark:text-brand-100", e.enunciado));
        if (!e.revisado) caja.append(el("p", "text-sm font-semibold text-amber-800 dark:text-amber-300", "Sin revisar: los alumnos todavía no lo ven."));
        const g = new Chess(e.fen);
        caja.append(el("p", "mt-2 text-sm text-brand-700 dark:text-brand-200", window.BlindNotation ? BlindNotation.positionSentence(g) : e.fen));
        const fila = el("div", "flex flex-wrap gap-2 mt-3");
        if (e.seg != null) {
            const oir = boton("Escucharlo en la clase", null, "Escuchar el ejercicio " + e.n + " en la clase, desde el " + relojDicho(e.seg));
            oir.addEventListener("click", () => ir(audio, e.seg, true));
            fila.append(oir);
        }
        caja.append(fila);

        const form = el("form", "flex flex-wrap gap-2 items-end mt-3");
        const cajaInp = el("div", "flex-1 min-w-[10rem]");
        const idI = "jugada-" + e.id;
        const lab = el("label", "block text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1", "Tu jugada en el ejercicio " + e.n);
        lab.htmlFor = idI;
        const inp = el("input", "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        inp.id = idI; inp.autocomplete = "off"; inp.maxLength = 30; inp.setAttribute("autocapitalize", "off");
        cajaInp.append(lab, inp);
        const b = el("button", "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60", "Contestar");
        b.type = "submit";
        b.setAttribute("aria-label", "Contestar el ejercicio " + e.n);
        form.append(cajaInp, b);
        const res = el("p", "mt-3 text-sm");
        res.setAttribute("role", "status");
        caja.append(form, res);

        async function contestar(san, primeraVez) {
            b.disabled = true;
            const { data, error } = await sb.rpc("responder_ejercicio", { p_id: e.id, p_jugada: san });
            const r = Array.isArray(data) ? data[0] : data;
            if (error || !r) { b.disabled = false; res.textContent = "No se pudo revisar la jugada. Vuelve a intentarlo."; return; }
            inp.disabled = true;
            let t = r.acerto ? "¡Correcto! " + sanEspanol(r.buena) + "." : "No era esa. La buena es " + sanEspanol(r.buena) + " (" + sanDicha(r.buena) + ").";
            if (r.puntos > 0) t += " Ganaste " + r.puntos + (r.puntos === 1 ? " Punto Ajedrez." : " Puntos Ajedrez.");
            else if (r.acerto && !r.primera && primeraVez) t += " Ya lo habías contestado: los puntos se dan solo la primera vez.";
            if (r.explicacion) t += " " + r.explicacion;
            res.className = "mt-3 text-sm " + (r.acerto ? "text-green-800 dark:text-green-300" : "text-brand-800 dark:text-brand-100");
            res.textContent = t;
            b.hidden = true;
        }
        if (hecho) {
            inp.value = sanEspanol(hecho.jugada);
            inp.disabled = true;
            res.textContent = "Ya lo contestaste con " + sanEspanol(hecho.jugada) + (hecho.acerto ? " y acertaste." : " y no acertaste.");
            b.textContent = "Ver la solución";
            b.setAttribute("aria-label", "Ver la solución del ejercicio " + e.n);
            b.type = "button";
            b.addEventListener("click", () => contestar(hecho.jugada, false));
        } else {
            form.addEventListener("submit", (ev) => {
                ev.preventDefault();
                if (!inp.value.trim()) { res.textContent = "Escribe una jugada."; return; }
                const san = jugadaDe(e.fen, inp.value);
                if (!san) { res.textContent = "No entendí «" + inp.value.trim() + "» o no es legal en esta posición. Escríbela como se anota, por ejemplo «Cf3»."; return; }
                contestar(san, true);
            });
        }
        if (opciones.puedeSubir) {
            if (respuesta) caja.append(el("p", "mt-3 text-sm text-brand-700 dark:text-brand-200",
                "Para revisar: la buena es " + sanEspanol(respuesta.buena) + "." + (respuesta.explicacion ? " " + respuesta.explicacion : "")));
            const pub = boton(e.revisado ? "Ocultarlo a los alumnos" : "Publicarlo para los alumnos", null,
                (e.revisado ? "Ocultar a los alumnos el ejercicio " : "Publicar para los alumnos el ejercicio ") + e.n);
            pub.classList.add("mt-3");
            pub.addEventListener("click", async () => {
                pub.disabled = true;
                const { error } = await sb.from("audios_clase_ejercicios").update({ revisado: !e.revisado }).eq("id", e.id);
                if (error) { pub.disabled = false; Avisos.avisar("No se pudo guardar.", { tipo: "error" }); return; }
                Avisos.avisar(e.revisado ? "El ejercicio ya no se ve." : "Publicado: los alumnos ya lo ven.");
                opciones.recargar();
            });
            caja.append(pub);
        }
        return caja;
    }

    /* ---------- Mis marcas ---------- */
    function marcas(a, audio) {
        const s = seccion("Mis marcas", "marcas");
        s.append(el("p", "text-sm text-brand-600 dark:text-brand-300 mb-2", "Guarda un momento para volver a él: con «Marcar este momento» o con Alt+Mayúscula+M. Solo tú ves tus marcas."));
        const marcar = boton("Marcar este momento");
        const form = el("form", "hidden mt-3 flex flex-wrap gap-2 items-end");
        const caja = el("div", "flex-1 min-w-[12rem]");
        const lab = el("label", "block text-sm font-semibold text-brand-700 dark:text-brand-200 mb-1");
        lab.htmlFor = "marca-nota";
        const inp = el("input", "w-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400");
        inp.id = "marca-nota"; inp.maxLength = 300; inp.autocomplete = "off";
        caja.append(lab, inp);
        const guardarB = el("button", BOTON, "Guardar la marca"); guardarB.type = "submit";
        const cancelar = boton("Cancelar");
        form.append(caja, guardarB, cancelar);
        const ol = el("ol", "space-y-2 mt-3");
        ol.id = "marcas-lista";
        let seg = 0;

        function abrir() {
            seg = Math.floor(audio.currentTime || 0);
            lab.textContent = "Nota para el " + relojDicho(seg) + " (si quieres)";
            form.classList.remove("hidden");
            inp.value = "";
            inp.focus();
        }
        marcar.addEventListener("click", abrir);
        cancelar.addEventListener("click", () => { form.classList.add("hidden"); marcar.focus(); });
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            guardarB.disabled = true;
            const { error } = await sb.from("audios_clase_marcas").insert({ audio_id: a.id, seg, nota: inp.value.trim() || null });
            guardarB.disabled = false;
            if (error) { anunciar("No se pudo guardar la marca."); return; }
            form.classList.add("hidden");
            anunciar("Marca guardada en el " + relojDicho(seg) + ".");
            await pintar();
            marcar.focus();
        });

        async function pintar() {
            const { data, error } = await sb.from("audios_clase_marcas").select("id, seg, nota").eq("audio_id", a.id).order("seg").range(0, 199);
            ol.textContent = "";
            if (error) { ol.append(el("li", "text-sm text-red-700 dark:text-red-300", "No se pudieron leer tus marcas.")); return; }
            if (!data.length) { ol.append(el("li", "text-sm text-brand-500 dark:text-brand-300", "Todavía no tienes marcas en esta clase.")); return; }
            data.forEach((m) => {
                const li = el("li", "flex flex-wrap gap-3 items-baseline");
                const ir_ = boton(reloj(m.seg) + (m.nota ? " · " + m.nota : ""), ENLACE, "Escuchar desde el " + relojDicho(m.seg) + (m.nota ? ": " + m.nota : ""));
                ir_.addEventListener("click", () => ir(audio, m.seg, true));
                const borrar = boton("Borrar", "text-sm text-red-700 dark:text-red-300 underline underline-offset-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400", "Borrar la marca del " + relojDicho(m.seg));
                borrar.addEventListener("click", async () => {
                    const { error: e2 } = await sb.from("audios_clase_marcas").delete().eq("id", m.id);
                    if (e2) { anunciar("No se pudo borrar la marca."); return; }
                    anunciar("Marca borrada.");
                    await pintar();
                    marcar.focus();
                });
                li.append(ir_, borrar);
                ol.append(li);
            });
        }
        s.append(marcar, form, ol);
        pintar();
        return { seccion: s, abrir };
    }

    /* Todo lo de una clase, debajo de su reproductor. */
    async function montar(destino, a, audio, opciones) {
        anunciar = opciones.anunciar || anunciar;
        audioActivo = audio;
        const lista = frases(a.segmentos);
        const [part, preg, hechas, ejs] = await Promise.all([
            sb.from("audios_clase_partidas").select("id, orden, seg, titulo, jugadas, revisada").eq("audio_id", a.id).order("orden").range(0, 49),
            sb.from("audios_clase_preguntas").select("audio_id, n, pregunta, opciones").eq("audio_id", a.id).order("n").range(0, 19),
            sb.from("audios_clase_repasos").select("n, opcion, acerto").eq("audio_id", a.id).range(0, 19),
            sb.from("audios_clase_ejercicios").select("id, n, seg, enunciado, fen, revisado").eq("audio_id", a.id).order("n").range(0, 29),
        ]);
        /* Solo los de FEN válido: una posición rota no se muestra. */
        const listaEj = (ejs.data || []).filter((e) => { try { return new Chess().validate_fen(e.fen).valid; } catch (x) { return false; } });
        let hechosEj = new Map(), respuestas = new Map();
        if (listaEj.length) {
            const [int, rev] = await Promise.all([
                sb.from("audios_clase_ejercicio_intentos").select("ejercicio_id, jugada, acerto").in("ejercicio_id", listaEj.map((e) => e.id)).range(0, 29),
                opciones.puedeSubir ? sb.rpc("ejercicios_para_revisar", { p_audio: a.id }) : { data: [] },
            ]);
            hechosEj = new Map((int.data || []).map((x) => [x.ejercicio_id, x]));
            respuestas = new Map((rev.data || []).map((x) => [x.id, x]));
        }
        if (a.resumen) {
            const s = seccion("De qué se trató", "resumen");
            String(a.resumen).split(/\n+/).filter(Boolean).forEach((t) => s.append(el("p", "text-brand-800 dark:text-brand-100 leading-relaxed mt-2", t)));
            destino.append(s);
        }
        if (Array.isArray(a.indice) && a.indice.length) destino.append(temas(a, audio));
        if (lista.length) destino.append(buscador(lista, audio, a.minutos_aproximados));
        const ps = (part.data || []).filter((p) => jugadasLegales(p.jugadas).length);
        if (ps.length) destino.append(partidas(a, ps, audio, opciones));
        if (listaEj.length) destino.append(ejercicios(a, listaEj, hechosEj, audio, opciones, respuestas));
        if (preg.data && preg.data.length) destino.append(preguntas(a, preg.data, new Map((hechas.data || []).map((h) => [h.n, h]))));
        const m = marcas(a, audio);
        destino.append(m.seccion);
        if (lista.length) destino.append(todoLoDicho(lista, audio));
        atajos({ indice: a.indice, marcar: m.abrir });
    }

    /* ---------- El repaso de hoy ---------- */
    /* «Martes 10 de noviembre», en hora de Costa Rica. */
    function diaDicho(fecha) {
        const t = HoraCR.fecha(fecha, { weekday: "long", day: "numeric", month: "long" }).replace(/^([^\s,]+),/, "$1");
        return t.charAt(0).toUpperCase() + t.slice(1);
    }
    /* Las preguntas que tocan hoy (repaso_de_hoy): las vueltas de las que ya
       se contestaron (a los 2, 7 y 21 días) y las nuevas de las clases de las
       últimas dos semanas. Si no toca ninguna, la sección no sale. */
    async function repasoDeHoy(destino) {
        const { data, error } = await sb.rpc("repaso_de_hoy");
        if (error || !Array.isArray(data) || !data.length) return 0;
        const s = el("section", "bg-white dark:bg-brand-900 rounded-2xl shadow-md p-5 mb-8");
        const h = el("h2", "font-serif text-xl font-bold text-brand-800 dark:text-white", "Repaso de hoy");
        h.id = "repaso-hoy";
        s.setAttribute("aria-labelledby", "repaso-hoy");
        s.append(h);
        const vueltas = data.filter((q) => q.vuelta > 0).length;
        s.append(el("p", "text-sm text-brand-600 dark:text-brand-300 mt-1",
            (data.length === 1 ? "Te toca una pregunta" : "Te tocan " + data.length + " preguntas") + " de tus clases. "
            + (vueltas ? "Las que ya contestaste vuelven a los 2, 7 y 21 días, para que no se te olviden; cada acierto da 1 Punto Ajedrez. " : "")
            + (data.length > vueltas ? "Las nuevas dan 2 Puntos Ajedrez si aciertas a la primera." : "")));
        data.forEach((q) => {
            const leyenda = "Clase del " + diaDicho(q.fecha) + (q.vuelta > 0 ? " (repaso " + q.vuelta + " de 3)" : " (nueva)");
            s.append(pregunta({ id: q.audio_id }, q, data.length, null, { leyenda, vuelta: q.vuelta > 0, nombre: "rep-" + q.audio_id + "-" + q.n }));
        });
        destino.append(s);
        return data.length;
    }

    /* ---------- Los conceptos de todas las clases ---------- */
    /* Cada tema de cada guía trae su concepto («Contrajuego», «Final de
       torres»…): juntos arman un índice para estudiar un concepto a lo largo
       del curso. Devuelve [{concepto, temas: [{audio, fecha, seg, titulo}]}],
       por orden alfabético y cada concepto de la clase más vieja a la nueva. */
    function conceptos(clases) {
        const m = new Map();
        (clases || []).forEach((c) => (Array.isArray(c.indice) ? c.indice : []).forEach((t) => {
            const nombre = String((t && t.concepto) || "").trim();
            if (!nombre) return;
            const k = normal(nombre);
            if (!m.has(k)) m.set(k, { concepto: nombre, temas: [] });
            m.get(k).temas.push({ audio: c.id, fecha: c.fecha, seg: Math.max(0, Math.floor(+t.seg || 0)), titulo: String(t.titulo || "") });
        }));
        const lista = Array.from(m.values());
        lista.forEach((x) => x.temas.sort((p, q) => (p.fecha < q.fecha ? -1 : p.fecha > q.fecha ? 1 : p.seg - q.seg)));
        return lista.sort((x, y) => x.concepto.localeCompare(y.concepto, "es"));
    }

    /* Lo que trae un archivo de guía (.json), revisado antes de guardarlo. */
    function leerGuia(obj) {
        const o = obj && typeof obj === "object" ? obj : {};
        const segmentos = frases(o.segmentos).map(([s, t]) => [s, t.slice(0, 2000)]);
        const indice = (Array.isArray(o.indice) ? o.indice : [])
            .filter((t) => t && isFinite(+t.seg) && String(t.titulo || "").trim())
            .map((t) => {
                /* El concepto arma el índice de todas las clases; la cita (lo
                   que se dijo justo ahí) deja volver a encontrar el minuto
                   cuando llega la transcripción de Whisper con sus minutos. */
                const x = { seg: Math.max(0, Math.floor(+t.seg)), titulo: String(t.titulo).trim().slice(0, 160) };
                if (String(t.concepto || "").trim()) x.concepto = String(t.concepto).trim().slice(0, 60);
                if (String(t.cita || "").trim()) x.cita = String(t.cita).trim().slice(0, 240);
                return x;
            })
            .sort((x, y) => x.seg - y.seg).slice(0, 40);
        const preguntas = (Array.isArray(o.preguntas) ? o.preguntas : [])
            .filter((q) => q && String(q.pregunta || "").trim() && Array.isArray(q.opciones) && q.opciones.length >= 2 && q.opciones.length <= 5
                && Number.isInteger(+q.correcta) && +q.correcta >= 1 && +q.correcta <= q.opciones.length)
            .slice(0, 10)
            .map((q, k) => ({ n: k + 1, pregunta: String(q.pregunta).trim().slice(0, 400), opciones: q.opciones.map((x) => String(x).trim().slice(0, 300)),
                correcta: +q.correcta, explicacion: q.explicacion ? String(q.explicacion).trim().slice(0, 800) : null }));
        const partidas = (Array.isArray(o.partidas) ? o.partidas : [])
            .map((p) => ({ titulo: String((p && p.titulo) || "").trim().slice(0, 120), seg: p && isFinite(+p.seg) ? Math.max(0, Math.floor(+p.seg)) : null,
                jugadas: jugadasLegales(Array.isArray(p && p.jugadas) ? p.jugadas.join(" ") : p && p.jugadas) }))
            .filter((p) => p.titulo && p.jugadas.length >= 2)
            .slice(0, 50)
            .map((p, k) => ({ orden: k + 1, titulo: p.titulo, seg: p.seg, jugadas: p.jugadas.join(" ") }));
        return { segmentos, resumen: o.resumen ? String(o.resumen).trim().slice(0, 3000) : null, indice, preguntas, partidas };
    }

    return { anunciarCon: (f) => { anunciar = f; }, montar, controles, atajos, leerGuia, reloj, relojDicho, frases, buscar, porMinuto, temaEn, sanEspanol, sanDicha, jugadasLegales,
        ir, deWhisper, reanclar, moverSeg, repasoDeHoy, conceptos, normal };
})();

/*! rev bfb5bbb0d2d82f9f */
