/* El código de sesion.html. La llamada de voz de la clase, en la misma página
   que el tablero (LiveKit). Ver «La llamada de voz de la clase» en
   docs/decisiones/clase-en-vivo.md.

   Para un alumno ciego lo difícil de Meet no es Meet: es tener la llamada en
   una pestaña y el tablero en otra, saltar entre las dos con el lector de
   pantalla y que los anuncios de las dos se pisen. Acá la voz está en la clase.

   Tres decisiones que no conviene deshacer:

   1. LA PALABRA ES EL TURNO DE LA CLASE, NO OTRA COLA. Puede hablar quien tiene
      `game_state.elegido` (el «Darle la palabra» de la mano levantada, o el
      sorteo) y el profe. La mano es la de la clase (`alternarMano`, la misma
      presencia). Una segunda cola de manos para la llamada se desincronizaría
      sin que nada fallara. Quien lo hace cumplir es el servidor de LiveKit, con
      el permiso que pone la Edge Function clase-llamada leyendo la base: la
      página solo pinta. Por eso el profe llama a `sincronizar()` después de dar
      o terminar un turno y de sacar a alguien.
   2. EL MICRÓFONO NO SE ENCIENDE SOLO al recibir la palabra: se avisa y lo
      enciende quien la recibió (Alt+M). Abrirle el micrófono a un menor sin que
      lo decida él no es algo que haga la página.
   3. LA LIBRERÍA SE PIDE AL ENTRAR, no al cargar: pesa 600 kB y la mayoría de
      las clases no la usa.

   Atajos (e.code, la tecla física: igual en teclado español o inglés). Alt
   solo: Ctrl+Alt es AltGr en el teclado español (Ctrl+Alt+Q da «@») y
   Alt+Mayúsculas cambia el idioma del teclado en Windows. Alt+X no: el tablero
   accesible ya lo usa (los rayos de la casilla).
     Alt+M micrófono · Alt+Y la mano (alumno) · Alt+Q quién está · Alt+W quién habla
     (y, si nadie habla, quién habló último) */
(function () {
    "use strict";

    const LIBRERIA = "js/vendor/livekit-client.js";
    let cargando = null;
    function cargarLibreria() {
        if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
        if (!cargando) {
            cargando = new Promise((listo, fallo) => {
                const s = document.createElement("script");
                s.src = LIBRERIA;
                s.onload = () => (window.LivekitClient ? listo(window.LivekitClient) : fallo(new Error("La librería de la llamada no cargó.")));
                s.onerror = () => { cargando = null; fallo(new Error("No se pudo cargar la llamada. Revisa tu conexión.")); };
                document.head.appendChild(s);
            });
        }
        return cargando;
    }

    // Sonidos cortos: se reconocen sin esperar a que el lector termine de hablar.
    // Cada uno los pone más bajos, más altos o apagados (volTonos), y la vibración aparte.
    let audioCtx = null;
    const CLAVE_TONOS = "llamadaTonos_v1";
    let volTonos = 1, conVibracion = true;
    try {
        const t = JSON.parse(localStorage.getItem(CLAVE_TONOS) || "null");
        if (t && isFinite(t.vol)) volTonos = Math.min(2, Math.max(0, t.vol));
        if (t && typeof t.vibrar === "boolean") conVibracion = t.vibrar;
    } catch (e) { /* sin almacenamiento */ }
    function guardarTonos() {
        try { localStorage.setItem(CLAVE_TONOS, JSON.stringify({ vol: volTonos, vibrar: conVibracion })); } catch (e) { /* sin almacenamiento */ }
    }
    function sonido(notas) {
        if (!volTonos) return;
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            let t = audioCtx.currentTime;
            for (const f of notas) {
                const osc = audioCtx.createOscillator();
                const gan = audioCtx.createGain();
                osc.frequency.value = f;
                gan.gain.setValueAtTime(0.0001, t);
                gan.gain.exponentialRampToValueAtTime(0.12 * volTonos, t + 0.02);
                gan.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
                osc.connect(gan).connect(audioCtx.destination);
                osc.start(t);
                osc.stop(t + 0.15);
                t += 0.12;
            }
        } catch (e) { /* sin audio: el anuncio escrito basta */ }
    }
    /* Cada aviso con su tono, que no se confunde con otro: recibir la palabra
       sube; perderla baja (distinto de «alguien salió»); la señal débil es
       grave; el profe que apaga tu micrófono, dos golpes iguales. */
    const SON = { entra: [523, 784], sale: [784, 523], palabra: [659, 784, 988], finTurno: [988, 659],
        debil: [262, 262], apagado: [440, 440], reaccion: [1175, 880], pregunta: [659, 880, 659],
        callado: [523, 523, 523], eco: [392, 330], aviso: [880, 880] };
    // En el celular, además, vibra (si el aparato puede): se nota sin audífonos.
    function vibrar(ms) { if (!conVibracion) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* sin vibración */ } }

    /* Lo que Whisper entendió («Caballo efe tres.», «peón e cuatro») a lo que
       entiende el cuadro de comandos («caballo f3», «peón e4»): las letras de
       las columnas dichas como se pronuncian y los números en palabras se
       juntan en la casilla. Pura: la prueba el verificador. */
    const LETRAS = { a: "a", be: "b", b: "b", ve: "b", ce: "c", c: "c", se: "c", de: "d", d: "d", e: "e", efe: "f", f: "f", ge: "g", g: "g", je: "g", hache: "h", h: "h", ache: "h" };
    const NUMEROS = { uno: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8" };
    function jugadaDicha(texto) {
        let t = String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[.,;:!?¡¿"«»()]/g, " ").replace(/\s+/g, " ").trim();
        if (!t) return "";
        const letras = Object.keys(LETRAS).sort((a, b) => b.length - a.length).join("|");
        const numeros = Object.keys(NUMEROS).join("|");
        t = t.replace(new RegExp("\\b(" + letras + ")\\s*(" + numeros + "|[1-8])\\b", "g"),
            (m, l, n) => LETRAS[l] + (NUMEROS[n] || n));
        // «peon» y «alfil» van con tilde en el cuadro, pero los entiende sin ella.
        return t.replace(/\bpeon\b/g, "peón");
    }

    // El error de una Edge Function trae su cuerpo en `context` (un Response).
    async function mensajeDe(error, porDefecto) {
        try {
            const cuerpo = error && error.context && typeof error.context.json === "function" ? await error.context.json() : null;
            if (cuerpo && cuerpo.error) return cuerpo.error;
        } catch (e) { /* sin cuerpo */ }
        return porDefecto;
    }

    function montar(op) {
        const { sb, profesorId, esProfe } = op;
        const $ = (id) => document.getElementById(id);
        const caja = $("llamada");
        if (!caja || !sb || !profesorId) return null;

        const estado = $("llamada-estado");
        const entrar = $("llamada-entrar");
        const mic = $("llamada-mic");
        const modos = $("llamada-modos");
        const grabarBtn = $("llamada-grabar");
        const pttCaja = $("llamada-ptt-caja");
        const ptt = $("llamada-ptt");
        const grabandoAviso = $("llamada-grabando");
        const quien = $("llamada-quien");
        const habla = $("llamada-habla");
        const salirBtn = $("llamada-salir");
        const audios = $("llamada-audios");
        const gente = $("llamada-gente");
        const genteTitulo = $("llamada-gente-titulo");
        const lista = $("llamada-lista");
        const micSelect = $("llamada-microfono");
        const probarBtn = $("llamada-probar");
        const espacialIn = $("llamada-espacial");
        const gruposCaja = $("llamada-grupos");
        const gruposTam = $("llamada-grupos-tam");
        const gruposArmar = $("llamada-grupos-armar");
        const gruposLista = $("llamada-grupos-lista");
        const gruposTerminar = $("llamada-grupos-terminar");
        const reaccionesCaja = $("llamada-reacciones");
        const preguntaCaja = $("llamada-pregunta");
        const preguntaBtn = $("llamada-pregunta-btn");
        const preguntaEstado = $("llamada-pregunta-estado");
        const soloProfeIn = $("llamada-solo-profe");
        const marcarBtn = $("llamada-marcar");
        const decirQuienIn = $("llamada-decir-quien");
        const siguienteBtn = $("llamada-siguiente");
        const tiempoSel = $("llamada-turno-tiempo");
        const turnosCaja = $("llamada-turnos");
        const tonosSel = $("llamada-tonos");
        const vibrarIn = $("llamada-vibrar");
        const guiaBtn = $("llamada-guia");
        const practicarCaja = $("llamada-practicar-caja");
        const practicarBtn = $("llamada-practicar");
        const faltanCaja = $("llamada-faltan");
        const faltanLista = $("llamada-faltan-lista");
        const concentracionIn = $("llamada-concentracion");
        const rondaBtn = $("llamada-ronda");
        const privadoFinBtn = $("llamada-privado-fin");
        const dictarBtn = $("llamada-dictar");
        let sala = null;
        let entrando = false;
        let LK = null;
        // ¿El profe abrió la llamada en esta clase? Lo dice sesion.js con estado().
        let abierta = false;
        let grabando = false;       // game_state.llamada_grabando (lo pone el profe)
        let permisoVoz = true;      // alumno: si su familia dio permiso para grabar su voz
        let sinPermiso = new Set(); // profe: los de la llamada sin permiso de grabación
        // Quién puede hablar, además del profe: "turno", "libre" (todos) o "bloqueada" (nadie).
        let modo = "turno";
        const SIN_PERMISO = "Mientras se graba no puedes encender el micrófono: tu familia todavía no dio permiso para grabar tu voz. Se da en Configuración.";
        const MODOS = {
            turno: { boton: "Con turno", alProfe: "Habla quien tiene el turno.", alAlumno: "Tu profe volvió al turno: habla quien tiene la palabra." },
            libre: { boton: "Todos", alProfe: "Micrófono libre: todos pueden hablar.", alAlumno: "Tu profe abrió el micrófono para todos: puedes hablar. Enciende el tuyo con Alt M." },
            bloqueada: { boton: "Nadie", alProfe: "Micrófonos bloqueados: solo hablas tú.", alAlumno: "Tu profe bloqueó los micrófonos: por ahora solo habla el profe." },
        };
        let cerrandoPorElProfe = false;   // el alumno sale porque el profe la terminó

        function anunciar(texto) {
            // Vaciar y volver a escribir: el lector repite aunque sea el mismo texto.
            estado.textContent = "";
            setTimeout(() => { estado.textContent = texto; }, 60);
        }

        const enLlamada = () => Boolean(sala && sala.state === "connected");
        const puedoHablar = () => Boolean(sala && sala.localParticipant.permissions && sala.localParticipant.permissions.canPublish);
        const micEncendido = () => Boolean(sala && sala.localParticipant.isMicrophoneEnabled);
        const nombreDe = (p) => p.name || "Alguien";
        const esElProfe = (p) => p.attributes && p.attributes.rol === "profe";

        /* Siempre el mismo orden: tú, el profe, y los demás por nombre. Con la
           lista en el orden en que fueron entrando, cada vez que alguien se
           reconecta cambia de lugar y no se encuentra a nadie. */
        const tienePalabra = (p) => Boolean(p.permissions && p.permissions.canPublish);
        function enOrden() {
            if (!sala) return [];
            const otros = [...sala.remoteParticipants.values()].sort((a, b) =>
                (esElProfe(b) - esElProfe(a)) || nombreDe(a).localeCompare(nombreDe(b), "es", { sensitivity: "base" }));
            return [{ p: sala.localParticipant, yo: true }, ...otros.map((p) => ({ p, yo: false }))];
        }
        function detalle(p, yo) {
            const d = [];
            if (yo) d.push("tú");
            if (esElProfe(p) || (yo && esProfe)) d.push("profe");
            else if (tienePalabra(p)) d.push("con la palabra");
            // Solo al profe: quién no tiene el permiso de su familia, y que mientras
            // se graba no puede hablar (así sabe por qué, y puede pausar la grabación).
            if (esProfe && !yo && sinPermiso.has(p.identity)) d.push(grabando ? "sin permiso de grabación: no puede hablar" : "sin permiso de grabación");
            if (esProfe && !yo && !esElProfe(p)) { const m = textoDeMinutos(p.identity); if (m) d.push(m); }
            if ((esProfe || yo) && senalDebil(p)) d.push("señal débil");
            if (esProfe && !yo) { const r = reaccionReciente(p.identity); if (r) d.push(REACCIONES[r.tipo].enLista); }
            if (esProfe && !yo && privadoCon === p.identity) d.push("le hablas en privado");
            if (p.isSpeaking) d.push("hablando");
            return d;
        }

        function pintarGente() {
            const filas = enLlamada() ? enOrden() : [];
            gente.hidden = !filas.length;
            lista.textContent = "";
            if (!filas.length) { pintarFaltan(); return; }
            genteTitulo.textContent = "En la llamada (" + filas.length + ")";
            for (const { p, yo } of filas) {
                const li = document.createElement("li");
                li.className = "flex items-center justify-between gap-2 px-3 py-1.5";
                const n = document.createElement("span");
                n.className = "font-semibold text-brand-800 dark:text-white break-words";
                n.textContent = yo ? (op.miNombre || "Tú") : nombreDe(p);   // lo escribió una persona
                const d = document.createElement("span");
                d.className = "shrink-0 text-xs text-brand-600 dark:text-brand-300";
                const partes = detalle(p, yo);
                if (p.isSpeaking) {
                    const icono = document.createElement("span");
                    icono.setAttribute("aria-hidden", "true");
                    icono.textContent = "🔊 ";
                    d.appendChild(icono);
                }
                d.appendChild(document.createTextNode(partes.join(" · ")));
                li.append(n, d);
                /* El profe apaga el micrófono de quien mete ruido (la tele, el
                   ventilador). Lo hace el servidor; el alumno lo puede volver a
                   encender si tiene la palabra, como en cualquier llamada. */
                if (esProfe && !yo && !esElProfe(p) && privadoCon !== p.identity) {
                    const bp = document.createElement("button");
                    bp.type = "button";
                    bp.className = "shrink-0 ml-2 bg-white hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-white font-semibold px-2 py-1 min-h-[44px] sm:min-h-0 rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                    bp.textContent = "En privado";
                    bp.setAttribute("aria-label", "Hablarle en privado a " + nombreDe(p));
                    bp.addEventListener("click", () => hablarEnPrivado(p));
                    li.appendChild(bp);
                }
                if (esProfe && !yo && !esElProfe(p) && p.isMicrophoneEnabled) {
                    const b = document.createElement("button");
                    b.type = "button";
                    b.className = "shrink-0 ml-2 bg-white hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-white font-semibold px-2 py-1 min-h-[44px] sm:min-h-0 rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                    b.textContent = "Apagar su micrófono";
                    b.setAttribute("aria-label", "Apagar el micrófono de " + nombreDe(p));
                    b.addEventListener("click", () => apagarMicDe(p));
                    li.appendChild(b);
                }
                lista.appendChild(li);
            }
            pintarFaltan();
        }

        function pintar() {
            if (practicando) { pintarPractica(); return; }
            if (practicarCaja) practicarCaja.hidden = esProfe || !caja.hidden;
            pintarGente();
            const dentro = enLlamada();
            entrar.hidden = dentro;
            mic.hidden = !dentro;
            quien.hidden = !dentro;
            habla.hidden = !dentro;
            salirBtn.hidden = !dentro;
            // El profe no «sale»: la termina, y se cierra para todos.
            salirBtn.textContent = esProfe ? "Terminar la llamada" : "Salir de la llamada";
            entrar.textContent = esProfe && !abierta ? "🎧 Abrir la llamada a la clase" : "🎧 Entrar a la llamada";
            // «Se está grabando la clase»: lo ven todos los de la llamada.
            grabandoAviso.hidden = !(abierta && grabando && (dentro || !esProfe));
            grabarBtn.hidden = !(esProfe && dentro);
            grabarBtn.setAttribute("aria-pressed", String(grabando));
            grabarBtn.textContent = grabando ? "⏸ Pausar la grabación" : "⏺ Volver a grabar";
            // Quién puede hablar: solo el profe, dentro de la llamada.
            modos.hidden = !(esProfe && dentro);
            modos.querySelectorAll("[data-modo]").forEach((b) => {
                const elegido = b.dataset.modo === modo;
                b.setAttribute("aria-pressed", String(elegido));
                b.textContent = (elegido ? "✓ " : "") + MODOS[b.dataset.modo].boton;
                // El color acompaña al «✓», nunca va solo.
                for (const c of ["bg-accent-500", "hover:bg-accent-600", "text-brand-900"]) b.classList.toggle(c, elegido);
                for (const c of ["bg-white", "hover:bg-brand-200", "dark:bg-brand-800", "dark:hover:bg-brand-700", "text-brand-800", "dark:text-white"]) b.classList.toggle(c, !elegido);
            });
            pttCaja.hidden = !dentro;
            if (volumenes) volumenes.hidden = !dentro;
            // Probar el micrófono es antes de entrar: dentro, la llamada ya dice si se oye.
            if (probarBtn) probarBtn.hidden = dentro;
            pintarGrupos();
            if (reaccionesCaja) reaccionesCaja.hidden = !(dentro && !esProfe);
            if (preguntaCaja) preguntaCaja.hidden = !(dentro && esProfe);
            if (soloProfeIn) soloProfeIn.closest("label").hidden = !(dentro && !esProfe);
            if (marcarBtn) marcarBtn.hidden = !dentro;
            // Los turnos (siguiente mano y su tiempo): el profe, dentro o fuera de la llamada.
            if (turnosCaja) turnosCaja.hidden = !esProfe;
            if (privadoFinBtn) privadoFinBtn.hidden = !(esProfe && dentro && privadoCon);
            if (concentracionIn) concentracionIn.closest("label").hidden = !(dentro && !esProfe);
            if (dictarBtn) dictarBtn.hidden = !dentro;
            // Con la pregunta del profe abierta, «Sí» y «No» lo dicen: contestan.
            if (reaccionesCaja) reaccionesCaja.querySelectorAll('[data-reaccion="si"], [data-reaccion="no"]').forEach((b) => {
                const si = b.dataset.reaccion === "si";
                b.textContent = (si ? "Sí" : "No") + (preguntaAbierta ? " (contestar)" : "");
            });
            const encendido = micEncendido();
            mic.setAttribute("aria-pressed", String(encendido));
            mic.textContent = ptt.checked
                ? (encendido ? "🎙️ Hablando… (suelta para callar)" : "🎙️ Mantén apretado para hablar")
                : (encendido ? "🎙️ Micrófono encendido" : "🔇 Micrófono apagado");
        }

        /* Dos volúmenes aparte, cada uno con su barra y recordados en este
           aparato: el de la llamada (las voces de los demás) y el de la voz de
           la página que dice las jugadas («Activar voz», el recuadro adaptado,
           con speechSynthesis). El de la voz vale solo mientras se está en la
           llamada: es donde está su barra.
           Y mientras esa voz habla, la llamada baja (al 30 % de su volumen), para
           que la voz del profe no tape la jugada. */
        const volLlamadaIn = $("llamada-vol-llamada");
        const volVozIn = $("llamada-vol-voz");
        const volumenes = $("llamada-volumenes");
        const CLAVE_VOL = "llamadaVolumenes_v1";
        let volLlamada = 1;
        let volVoz = 1;
        let vozHablando = false;
        try {
            const v = JSON.parse(localStorage.getItem(CLAVE_VOL) || "null");
            if (v && isFinite(v.llamada)) volLlamada = Math.min(1, Math.max(0, v.llamada));
            if (v && isFinite(v.voz)) volVoz = Math.min(1, Math.max(0, v.voz));
        } catch (e) { /* sin almacenamiento */ }
        function pintarVolumenes() {
            if (!volLlamadaIn) return;
            for (const [input, v, salida] of [[volLlamadaIn, volLlamada, "llamada-vol-llamada-valor"], [volVozIn, volVoz, "llamada-vol-voz-valor"]]) {
                const pct = Math.round(v * 100);
                input.value = String(pct);
                input.setAttribute("aria-valuetext", pct + " %");
                $(salida).textContent = pct + " %";
            }
        }
        function aplicarVolumenDeLaLlamada() {
            if (!sala) return;
            const v = volLlamada * (vozHablando ? 0.3 : 1);
            for (const p of sala.remoteParticipants.values()) {
                // «Solo oír al profe»: los compañeros, en silencio en este aparato.
                const suyo = soloProfe && !esElProfe(p) ? 0 : v;
                for (const pub of p.audioTrackPublications.values()) if (pub.track) pub.track.setVolume(suyo);
            }
        }
        function guardarVolumenes() {
            try { localStorage.setItem(CLAVE_VOL, JSON.stringify({ llamada: volLlamada, voz: volVoz })); } catch (e) { /* sin almacenamiento */ }
        }
        if (volLlamadaIn) {
            volLlamadaIn.addEventListener("input", () => { volLlamada = Number(volLlamadaIn.value) / 100; pintarVolumenes(); aplicarVolumenDeLaLlamada(); guardarVolumenes(); });
            volVozIn.addEventListener("input", () => { volVoz = Number(volVozIn.value) / 100; pintarVolumenes(); guardarVolumenes(); });
            pintarVolumenes();
        }
        if (window.speechSynthesis && !window.speechSynthesis.__llamada) {
            const original = window.speechSynthesis.speak.bind(window.speechSynthesis);
            window.speechSynthesis.speak = function (u) {
                try {
                    const ll = window.speechSynthesis.__llamada;
                    if (u && ll && ll.enLlamada()) ll.alHablar(u);
                } catch (e) { /* nunca romper la voz por la llamada */ }
                return original(u);
            };
        }
        // Lo que hace la voz con ESTA llamada (el envoltorio se pone una sola vez).
        if (window.speechSynthesis) {
            window.speechSynthesis.__llamada = {
                enLlamada,
                alHablar(u) {
                    u.volume = Math.min(1, Math.max(0, (typeof u.volume === "number" ? u.volume : 1) * volVoz));
                    vozHablando = true;
                    aplicarVolumenDeLaLlamada();
                    const volver = () => setTimeout(() => { if (!window.speechSynthesis.speaking) { vozHablando = false; aplicarVolumenDeLaLlamada(); } }, 150);
                    u.addEventListener("end", volver);
                    u.addEventListener("error", volver);
                },
            };
        }


        /* ---------- El micrófono: cuál y si se oye ----------
           Sin ver la pantalla cuesta darse cuenta de que el navegador tomó el
           micrófono equivocado (el de la cámara, el de unos audífonos
           desconectados). Se elige en la lista (se recuerda en este aparato) y
           «Probar el micrófono» graba 3 segundos, dice si se oyó bien, bajo o
           nada, y los hace sonar: así se oye uno mismo como lo oye la clase.
           Dentro de la llamada, cambiar de micrófono lo cambia en el momento. */
        const CLAVE_MIC = "llamadaMicrofono_v1";
        let micElegido = "";
        try { micElegido = localStorage.getItem(CLAVE_MIC) || ""; } catch (e) { /* sin almacenamiento */ }
        async function listarMicrofonos() {
            if (!micSelect || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
            let mics = [];
            try { mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default"); } catch (e) { return; }
            micSelect.textContent = "";
            const def = document.createElement("option");
            def.value = "";
            def.textContent = "El del aparato (el de siempre)";
            micSelect.appendChild(def);
            mics.forEach((d, k) => {
                const o = document.createElement("option");
                o.value = d.deviceId;
                // Sin permiso todavía, el navegador no dice los nombres.
                o.textContent = d.label || "Micrófono " + (k + 1);
                micSelect.appendChild(o);
            });
            micSelect.value = mics.some((d) => d.deviceId === micElegido) ? micElegido : "";
        }
        function nivel(analizador, datos) {
            analizador.getFloatTimeDomainData(datos);
            let s = 0;
            for (const x of datos) s += x * x;
            return Math.sqrt(s / datos.length);
        }
        let probando = false;
        async function probarMicrofono() {
            if (probando || enLlamada()) return;
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { anunciar("Este navegador no deja usar el micrófono."); return; }
            probando = true;
            probarBtn.disabled = true;
            let flujo = null, ctx = null;
            try {
                flujo = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: micElegido ? { exact: micElegido } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
                listarMicrofonos();   // con el permiso ya dado, los nombres de verdad
                ctx = new (window.AudioContext || window.webkitAudioContext)();
                const analizador = ctx.createAnalyser();
                analizador.fftSize = 2048;
                ctx.createMediaStreamSource(flujo).connect(analizador);
                const datos = new Float32Array(analizador.fftSize);
                const tipo = tipoDeGrabacion();
                const rec = tipo ? new MediaRecorder(flujo, { mimeType: tipo }) : null;
                const trozos = [];
                if (rec) { rec.ondataavailable = (e) => { if (e.data && e.data.size) trozos.push(e.data); }; }
                anunciar("Di algo durante 3 segundos, después del tono.");
                await new Promise((r) => setTimeout(r, 2200));   // que el lector termine de hablar
                sonido([880]);
                if (rec) rec.start();
                let maximo = 0;
                const hasta = Date.now() + 3000;
                while (Date.now() < hasta) {
                    maximo = Math.max(maximo, nivel(analizador, datos));
                    await new Promise((r) => setTimeout(r, 50));
                }
                if (rec) await new Promise((r) => { rec.onstop = r; rec.stop(); });
                sonido([660]);
                const veredicto = maximo < 0.01 ? "Tu micrófono no captó nada. Revisa que esté conectado y que sea el elegido en la lista."
                    : maximo < 0.04 ? "Tu micrófono se oye muy bajo: acércate o habla más fuerte."
                    : "Tu micrófono se oye bien.";
                if (!trozos.length || maximo < 0.01) { anunciar(veredicto); return; }
                anunciar(veredicto + " Así se oye:");
                await new Promise((r) => setTimeout(r, 2500));
                const audio = new Audio(URL.createObjectURL(new Blob(trozos, { type: trozos[0].type })));
                audio.volume = volLlamada;
                await audio.play().catch(() => {});
            } catch (e) {
                console.error(e);
                anunciar(e && e.name === "NotAllowedError" ? "El navegador no deja usar el micrófono. Permítelo en el candado de la barra de direcciones."
                    : e && (e.name === "NotFoundError" || e.name === "OverconstrainedError") ? "No se encontró ese micrófono. Elige otro en la lista."
                    : "No se pudo probar el micrófono.");
            } finally {
                if (flujo) flujo.getTracks().forEach((t) => t.stop());
                if (ctx) ctx.close().catch(() => {});
                probando = false;
                probarBtn.disabled = false;
            }
        }
        if (micSelect) {
            micSelect.addEventListener("focus", listarMicrofonos, { once: true });
            micSelect.addEventListener("change", async () => {
                micElegido = micSelect.value;
                try { localStorage.setItem(CLAVE_MIC, micElegido); } catch (e) { /* sin almacenamiento */ }
                if (enLlamada()) {
                    try { await sala.switchActiveDevice("audioinput", micElegido || "default"); anunciar("Cambiaste de micrófono."); }
                    catch (e) { console.error(e); anunciar("No se pudo cambiar al micrófono elegido."); }
                }
            });
            listarMicrofonos();
            if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", listarMicrofonos);
        }
        if (probarBtn) probarBtn.addEventListener("click", probarMicrofono);

        /* ---------- La señal de cada uno ----------
           LiveKit mide la calidad de la conexión de cada persona. A uno mismo
           se le dice cuando se pone débil (una vez por minuto como mucho, para
           no tapar la clase) y cuando mejora; el profe ve en la lista y en
           Alt+Q quién tiene la señal débil, para no esperar a quien no lo oye. */
        const calidad = new Map();   // identidad → "excellent" | "good" | "poor" | "lost"
        let avisoDebil = 0;
        let avisadoDebil = false;
        const senalDebil = (p) => ["poor", "lost"].includes(calidad.get(p.identity));
        function cambioDeCalidad(q, p) {
            const antes = senalDebil(p);
            calidad.set(p.identity, String(q));
            const ahora = senalDebil(p);
            if (antes !== ahora) pintarGente();
            if (!sala || p !== sala.localParticipant || antes === ahora) return;
            if (ahora && Date.now() - avisoDebil > 60000) {
                avisoDebil = Date.now();
                avisadoDebil = true;
                sonido(SON.debil);
                anunciar("Tu conexión está débil: puede que se corte la voz. Si puedes, acércate al router o cierra otras pestañas.");
            } else if (!ahora && avisadoDebil) {
                avisadoDebil = false;
                anunciar("Tu conexión mejoró.");
            }
        }

        /* ---------- Quién habló último ----------
           Cuando dos hablan casi juntos, o la voz se fue antes de reconocerla:
           Alt+W dice quién habla y, si ya nadie habla, quién habló último. */
        let ultimo = null;   // { nombre, t }
        function anotarQuienHabla() {
            if (!sala) return;
            const hablan = sala.activeSpeakers.filter((p) => p.isSpeaking);
            if (hablan.length) ultimo = { nombre: hablan.map((p) => (p === sala.localParticipant ? "tú" : nombreDe(p))).join(" y "), t: Date.now() };
            pintarGente();
        }

        /* ---------- Las voces, cada una en su lugar ----------
           Con audífonos: el profe al centro y cada alumno un poco a la izquierda
           o a la derecha (siempre el mismo lugar: por nombre). Así se sabe
           quién habla sin preguntar. Va por WebAudio (webAudioMix de LiveKit),
           que se pide al entrar: cambiarlo dentro de la llamada vuelve a entrar
           solo, en un segundo. Se recuerda en este aparato. */
        const CLAVE_ESPACIAL = "llamadaVocesEnSuLugar_v1";
        let espacial = false;
        try { espacial = localStorage.getItem(CLAVE_ESPACIAL) === "1"; } catch (e) { /* sin almacenamiento */ }
        if (espacialIn) espacialIn.checked = espacial;
        let ctxVoces = null;
        let mezclaConVoces = false;   // la sala de ahora se armó con WebAudio
        const paneos = new Map();     // identidad → StereoPannerNode
        function lugarDe(p) {
            if (!espacial || esElProfe(p)) return 0;
            const alumnos = [...sala.remoteParticipants.values()].filter((x) => !esElProfe(x))
                .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), "es", { sensitivity: "base" }));
            const k = alumnos.indexOf(p);
            if (alumnos.length < 2 || k < 0) return alumnos.length === 1 ? -0.5 : 0;
            return -0.8 + (1.6 * k) / (alumnos.length - 1);
        }
        function acomodarVoces() {
            if (!sala || !mezclaConVoces || !ctxVoces) return;
            for (const p of sala.remoteParticipants.values()) {
                for (const pub of p.audioTrackPublications.values()) {
                    if (!pub.track || typeof pub.track.setWebAudioPlugins !== "function") continue;
                    let pan = paneos.get(p.identity);
                    if (!pan) {
                        pan = ctxVoces.createStereoPanner();
                        paneos.set(p.identity, pan);
                        pub.track.setWebAudioPlugins([pan]);
                    }
                    pan.pan.value = lugarDe(p);
                }
            }
        }
        if (espacialIn) espacialIn.addEventListener("change", () => {
            espacial = espacialIn.checked;
            try { localStorage.setItem(CLAVE_ESPACIAL, espacial ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
            if (!enLlamada()) { anunciar(espacial ? "Al entrar, cada voz va a sonar en su lugar. Usa audífonos." : "Todas las voces van a sonar al centro."); return; }
            if (espacial === mezclaConVoces) { acomodarVoces(); return; }
            anunciar(espacial ? "Cada voz en su lugar: volviendo a entrar…" : "Todas las voces al centro: volviendo a entrar…");
            mudarse();
        });

        /* ---------- Grupos en la llamada ----------
           El profe parte la clase en grupos de voz (parejas, tríos…): cada
           grupo habla en su propia sala, y en el grupo pueden hablar todos.
           Quién va en qué grupo lo guarda game_state.llamada_grupos (solo el
           profe la escribe) y la sala de cada alumno la decide la base: la
           página solo se muda cuando ve el cambio. El profe pasa de un grupo a
           otro (graba, si está grabando, el grupo donde está) y «Terminar los
           grupos» devuelve a todos a la sala grande. */
        let grupos = null;          // { persona: n } o null
        let grupoActual = 0;        // el de la sala en la que estoy ahora (0 = la grande)
        let grupoDelProfe = 0;      // el que eligió el profe para sí
        const gruposVistos = new Set();   // para que «sincronizar» vacíe también las salas viejas
        let mudandose = false;
        const grupoQueMeToca = () => (esProfe ? grupoDelProfe : Number((grupos && op.yo && grupos[op.yo]) || 0));
        function numerosDeGrupo() {
            return [...new Set(Object.values(grupos || {}).map(Number).filter((n) => n >= 1 && n <= 20))].sort((a, b) => a - b);
        }
        function nombresDelGrupo(n) {
            return Object.entries(grupos || {}).filter(([id, g]) => Number(g) === n && id !== op.yo)
                .map(([id]) => (op.nombreDe ? op.nombreDe(id) : "") || "un compañero");
        }
        function decirLista(nombres) {
            return nombres.length > 1 ? nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1] : nombres.join("");
        }
        async function mudarse() {
            if (!sala || mudandose) { if (!sala && quiereEstar) alEntrar(true); return; }
            mudandose = true;
            try { await sala.disconnect(); } catch (e) { console.error(e); mudandose = false; }
        }
        function pintarGrupos() {
            if (!gruposCaja) return;
            const visible = esProfe && enLlamada();
            gruposCaja.hidden = !visible;
            if (!visible) return;
            const nums = numerosDeGrupo();
            gruposTerminar.hidden = !nums.length;
            gruposArmar.textContent = nums.length ? "Volver a armar los grupos" : "Armar grupos";
            gruposLista.textContent = "";
            if (!nums.length) return;
            for (const n of [0, ...nums]) {
                const b = document.createElement("button");
                b.type = "button";
                const aqui = n === grupoActual;
                b.setAttribute("aria-pressed", String(aqui));
                b.className = "w-full text-left font-semibold px-3 py-2 min-h-[44px] sm:min-h-[2.25rem] rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 "
                    + (aqui ? "bg-accent-500 hover:bg-accent-600 text-brand-900" : "bg-white hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-white");
                const nombres = n ? nombresDelGrupo(n) : [];
                // El elegido lo dice el texto («✓ estás aquí»), no solo el color.
                b.textContent = (aqui ? "✓ " : "") + (n ? "Grupo " + n + ": " + (decirLista(nombres) || "nadie") : "Sala grande") + (aqui ? " (estás aquí)" : "");
                b.addEventListener("click", () => irAlGrupo(n));
                gruposLista.appendChild(b);
            }
        }
        function mezclar(lista) {
            const a = [...lista];
            for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
            return a;
        }
        /* Grupos de `tam` con los alumnos que están en la clase (sorteados). Si
           sobra uno solo, se suma al último grupo: nadie queda hablando solo. */
        function armarGrupos(alumnos, tam) {
            const orden = mezclar(alumnos);
            const salida = {};
            let n = 0;
            for (let i = 0; i < orden.length; i += tam) n++;
            if (n > 1 && orden.length % tam === 1) n--;
            n = Math.min(Math.max(n, 1), 20);
            orden.forEach((id, k) => { salida[id] = Math.min(Math.floor(k / tam) + 1, n); });
            return salida;
        }
        async function hacerGrupos() {
            if (!esProfe || !op.grupos || !op.alumnosDeLaClase) return;
            const alumnos = op.alumnosDeLaClase();
            const tam = Math.max(2, Number(gruposTam && gruposTam.value) || 2);
            if (alumnos.length < 2) { anunciar("Para armar grupos hacen falta al menos dos alumnos en la clase."); return; }
            const nuevos = armarGrupos(alumnos, tam);
            const error = await op.grupos(nuevos);
            if (error) { anunciar(error); return; }
            grupos = nuevos;
            numerosDeGrupo().forEach((n) => gruposVistos.add(n));
            pintarGrupos();
            setTimeout(sincronizar, 4000);   // a los que no se mudaron solos, el servidor los saca de la sala vieja
            const nums = numerosDeGrupo();
            anunciar("Armaste " + nums.length + (nums.length === 1 ? " grupo" : " grupos") + ". Tú sigues en la sala grande: entra a un grupo para escucharlo.");
        }
        async function terminarGrupos() {
            if (!esProfe || !op.grupos) return;
            const error = await op.grupos(null);
            if (error) { anunciar(error); return; }
            grupos = null;
            anunciar("Terminaste los grupos: todos vuelven a la sala grande.");
            if (grupoDelProfe) irAlGrupo(0); else pintarGrupos();
            setTimeout(sincronizar, 4000);
        }
        function irAlGrupo(n) {
            if (!esProfe || n === grupoActual) return;
            grupoDelProfe = n;
            mudarse();
        }
        if (gruposArmar) gruposArmar.addEventListener("click", hacerGrupos);
        if (gruposTerminar) gruposTerminar.addEventListener("click", terminarGrupos);

        /* El profe apaga el micrófono de alguien (el servidor de LiveKit lo hace:
           la página no puede apagar el de otro). */
        async function apagarMicDe(p) {
            if (!esProfe) return;
            try {
                const r = await pedir("silenciar", { persona: p.identity });
                anunciar(r && r.silenciado ? "Apagaste el micrófono de " + nombreDe(p) + "." : nombreDe(p) + " ya tenía el micrófono apagado.");
            } catch (e) { anunciar(e.message || "No se pudo apagar ese micrófono."); }
        }
        let yoApague = 0;   // cuándo lo apagó uno mismo (para no confundirlo con el profe)


        /* ---------- Reacciones y preguntas de sí o no ----------
           El alumno le dice algo al profe sin interrumpir ni esperar el turno:
           «No entendí», «Más lento», «Sí», «No» (botones, o Alt+1 a Alt+4). Al
           profe le suena un tono corto, se le dice quién y qué, y la lista lo
           muestra un minuto. El profe puede abrir una pregunta de sí o no: cada
           alumno contesta con Sí o No, el profe ve el conteo y quién falta, y
           se le dice cuando contestaron todos. Va por la presencia de la clase
           (sesion.js), como la mano: no se guarda en ningún lado. */
        const REACCIONES = {
            no_entendi: { alProfe: (n) => n + " no entendió.", enLista: "no entendió", yo: "Le dijiste a tu profe que no entendiste." },
            lento: { alProfe: (n) => n + " pide ir más lento.", enLista: "pide más lento", yo: "Le pediste a tu profe que vaya más lento." },
            si: { alProfe: (n) => n + " dijo sí.", enLista: "dijo sí", yo: "Le dijiste sí a tu profe." },
            no: { alProfe: (n) => n + " dijo no.", enLista: "dijo no", yo: "Le dijiste no a tu profe." },
        };
        const recientes = new Map();   // profe: identidad → { tipo, t }
        let preguntaAbierta = false;   // profe: su pregunta; alumno: la de su profe
        let respuestas = null;         // profe: { si: [], no: [], faltan: [] }
        let todosContestaron = false;
        const reaccionReciente = (id) => { const r = recientes.get(id); return r && Date.now() - r.t < 60000 ? r : null; };
        async function reaccionar(tipo) {
            if (esProfe || !op.reaccionar || !REACCIONES[tipo] || !enLlamada()) return;
            try {
                const como = await op.reaccionar(tipo);
                sonido([880]);
                anunciar(como === "respuesta" ? "Contestaste " + (tipo === "si" ? "sí" : "no") + " a la pregunta de tu profe." : REACCIONES[tipo].yo);
            } catch (e) { console.error(e); anunciar("No se pudo mandar."); }
        }
        // Profe: llegó una reacción (sesion.js la saca de la presencia).
        function recibirReaccion(id, nombre, tipo, esRespuesta) {
            if (!esProfe || !REACCIONES[tipo]) return;
            recientes.set(id, { tipo, t: Date.now() });
            pintarGente();
            sonido(SON.reaccion);
            // Las respuestas a la pregunta no se dicen de a una: se cuentan.
            if (!esRespuesta) anunciar(REACCIONES[tipo].alProfe(nombre || "Un alumno"));
        }
        function textoDelConteo(c) {
            if (!c) return "";
            const s = c.si.length + " sí, " + c.no.length + " no";
            return c.faltan.length ? s + "; falta" + (c.faltan.length === 1 ? " " : "n ") + decirLista(c.faltan) : s;
        }
        function ponerRespuestas(c) {
            if (!esProfe || !preguntaAbierta) return;
            respuestas = c;
            pintarPregunta();
            const total = c.si.length + c.no.length;
            if (total && !c.faltan.length && !todosContestaron) {
                todosContestaron = true;
                anunciar("Contestaron todos: " + textoDelConteo(c) + ".");
            } else if (c.faltan.length) todosContestaron = false;
        }
        async function alternarPregunta() {
            if (!esProfe || !op.preguntarSiNo || !enLlamada()) return;
            const abrir = !preguntaAbierta;
            const final = await op.preguntarSiNo(abrir);
            preguntaAbierta = abrir;
            todosContestaron = false;
            respuestas = abrir ? { si: [], no: [], faltan: [] } : null;
            pintarPregunta();
            anunciar(abrir ? "Abriste una pregunta de sí o no: tus alumnos contestan con Alt 3 (sí) o Alt 4 (no)."
                : "Cerraste la pregunta" + (final ? ": " + textoDelConteo(final) : "") + ".");
        }
        function pintarPregunta() {
            if (!preguntaBtn) return;
            preguntaBtn.setAttribute("aria-pressed", String(preguntaAbierta));
            preguntaBtn.textContent = preguntaAbierta ? "Cerrar la pregunta de sí o no" : "❓ Preguntar sí o no";
            preguntaEstado.textContent = preguntaAbierta ? "Respuestas: " + (textoDelConteo(respuestas) || "todavía ninguna") + "." : "";
        }
        // Alumno: su profe abrió o cerró una pregunta.
        function ponerPregunta(abierta) {
            if (esProfe) return;
            const antes = preguntaAbierta;
            preguntaAbierta = Boolean(abierta);
            if (caja.hidden || preguntaAbierta === antes) { pintar(); return; }
            if (preguntaAbierta) { sonido(SON.pregunta); vibrar(120); }
            anunciar(preguntaAbierta ? "Tu profe hace una pregunta de sí o no: contesta con Alt 3 (sí) o Alt 4 (no)." : "Tu profe cerró la pregunta.");
            pintar();
        }
        if (reaccionesCaja) reaccionesCaja.querySelectorAll("[data-reaccion]").forEach((b) => b.addEventListener("click", () => reaccionar(b.dataset.reaccion)));
        if (preguntaBtn) preguntaBtn.addEventListener("click", alternarPregunta);

        /* ---------- Solo oír al profe ----------
           Para quien se distrae con las voces de los compañeros: los silencia
           EN ESTE APARATO (nadie más se entera). Se recuerda. */
        const CLAVE_SOLO_PROFE = "llamadaSoloProfe_v1";
        let soloProfe = false;
        try { soloProfe = localStorage.getItem(CLAVE_SOLO_PROFE) === "1"; } catch (e) { /* sin almacenamiento */ }
        if (soloProfeIn) {
            soloProfeIn.checked = soloProfe;
            soloProfeIn.addEventListener("change", () => {
                soloProfe = soloProfeIn.checked;
                try { localStorage.setItem(CLAVE_SOLO_PROFE, soloProfe ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
                aplicarVolumenDeLaLlamada();
                anunciar(soloProfe ? "Ahora oyes solo a tu profe: tus compañeros quedan en silencio en tu aparato." : "Vuelves a oír a todos.");
            });
        }

        /* ---------- Hablar con el micrófono apagado, y el eco ----------
           Desde la primera vez que se enciende el micrófono en la llamada, la
           página escucha una COPIA de esa pista (la de LiveKit se apaga al
           callarse; la copia no) y mide el volumen, sin grabar ni mandar nada:
           - si alguien habla un segundo y medio con el micrófono apagado, se le
             dice (como Meet), una vez cada 30 segundos como mucho;
           - si con el micrófono encendido LiveKit lo marca «hablando» casi
             siempre que habla otro, es que su micrófono capta la llamada (sin
             audífonos, el eco que oyen los demás): se le sugiere usarlos, una
             vez por llamada. Es una sospecha, no una certeza, y así se dice. */
        let monitor = null;   // { ctx, analizador, datos, pista, timer }
        let callado = 0, avisoCallado = 0;
        let ecoTotal = 0, ecoJuntos = 0, avisadoEco = false;
        function escucharMiMicrofono() {
            if (monitor || !sala) return;
            const pub = [...sala.localParticipant.audioTrackPublications.values()].find((x) => x.track && x.track.mediaStreamTrack);
            if (!pub) return;
            try {
                const pista = pub.track.mediaStreamTrack.clone();
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const analizador = ctx.createAnalyser();
                analizador.fftSize = 1024;
                ctx.createMediaStreamSource(new MediaStream([pista])).connect(analizador);
                monitor = { ctx, analizador, datos: new Float32Array(analizador.fftSize), pista, timer: setInterval(revisarMiMicrofono, 250) };
            } catch (e) { console.warn("No se pudo escuchar el micrófono para los avisos:", e); }
        }
        function revisarMiMicrofono() {
            if (!monitor || !enLlamada()) return;
            const encendido = micEncendido();
            const fuerte = nivel(monitor.analizador, monitor.datos) > 0.04;
            callado = !encendido && !apretado && fuerte ? callado + 1 : 0;
            if (callado >= 6 && Date.now() - avisoCallado > 30000) {
                avisoCallado = Date.now();
                callado = 0;
                sonido(SON.callado);
                anunciar("Estás hablando con el micrófono apagado: nadie te oye. "
                    + (ptt.checked ? "Mantén apretado Alt P mientras hablas." : puedoHablar() ? "Enciéndelo con Alt M." : "Para hablar, levanta la mano con Alt Y."));
            }
            if (!encendido || avisadoEco) return;
            if ([...sala.remoteParticipants.values()].some((p) => p.isSpeaking)) {
                ecoTotal++;
                if (sala.localParticipant.isSpeaking) ecoJuntos++;
            }
            if (ecoTotal >= 80) {   // 20 segundos de voces de otros
                if (ecoJuntos / ecoTotal > 0.6) {
                    avisadoEco = true;
                    sonido(SON.eco);
                    anunciar("Parece que tu micrófono capta las voces de la llamada y los demás oyen eco. Usa audífonos o baja el volumen de tu aparato.");
                }
                ecoTotal = 0;
                ecoJuntos = 0;
            }
        }
        function dejarDeEscucharMiMicrofono() {
            if (!monitor) return;
            clearInterval(monitor.timer);
            try { monitor.pista.stop(); } catch (e) { /* ya estaba */ }
            monitor.ctx.close().catch(() => {});
            monitor = null;
            callado = 0;
            ecoTotal = 0;
            ecoJuntos = 0;
        }

        /* ---------- Marcar este momento ----------
           Alt+K (o el botón): queda anotada la hora en la base, y en «Repasar
           mis clases» la marca lleva la grabación a ese momento. */
        async function marcarMomento() {
            if (!enLlamada() || !op.marcarMomento) return;
            const error = await op.marcarMomento();
            if (error) { anunciar(error); return; }
            sonido([988, 1175]);
            anunciar("Marcaste este momento. Lo encuentras en «Repasar mis clases», con la grabación.");
        }
        if (marcarBtn) marcarBtn.addEventListener("click", marcarMomento);

        /* ---------- Saltar entre la llamada y el tablero ----------
           Alt+T: desde la llamada, al tablero (la casilla que tenía el foco);
           desde cualquier otra parte, a la llamada (el micrófono, o «Entrar»).
           Sin recorrer la página entera con el lector. */
        function saltar() {
            if (caja.hidden) return;
            if (caja.contains(document.activeElement)) {
                if (!op.enfocarTablero || !op.enfocarTablero()) anunciar("No encontré el tablero.");
                return;
            }
            (enLlamada() ? mic : entrar).focus();
        }

        /* ---------- Decir quién empieza a hablar ----------
           Casilla opcional (se recuerda): cuando la voz pasa a otra persona, se
           dice su nombre («Habla Zoe Álvarez»). Para no hablar encima a cada
           rato: la persona tiene que seguir hablando un instante (700 ms), y a
           quien acaba de nombrarse no se lo vuelve a nombrar hasta que pasen 15
           segundos sin que hable. A uno mismo no se lo nombra. */
        const CLAVE_DECIR_QUIEN = "llamadaDecirQuienHabla_v1";
        let decirQuien = false;
        try { decirQuien = localStorage.getItem(CLAVE_DECIR_QUIEN) === "1"; } catch (e) { /* sin almacenamiento */ }
        if (decirQuienIn) {
            decirQuienIn.checked = decirQuien;
            decirQuienIn.addEventListener("change", () => {
                decirQuien = decirQuienIn.checked;
                try { localStorage.setItem(CLAVE_DECIR_QUIEN, decirQuien ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
                anunciar(decirQuien ? "Se va a decir el nombre de quien empieza a hablar." : "Ya no se dice quién empieza a hablar.");
            });
        }
        let nombrado = null;        // identidad del último que se nombró
        const ultimaVoz = new Map(); // identidad → cuándo se lo oyó hablar por última vez
        let porNombrar = null;
        function quizasDecirQuienHabla() {
            if (!sala) return;
            const ahora = Date.now();
            const hablan = sala.activeSpeakers.filter((p) => p.isSpeaking && p !== sala.localParticipant);
            for (const p of hablan) {
                const antes = ultimaVoz.get(p.identity) || 0;
                ultimaVoz.set(p.identity, ahora);
                // Volvió a hablar después de 15 s callado: se lo puede volver a nombrar.
                if (p.identity === nombrado && ahora - antes > 15000) nombrado = null;
            }
            if (!decirQuien || !hablan.length || hablan[0].identity === nombrado) return;
            const quien = hablan[0];
            clearTimeout(porNombrar);
            porNombrar = setTimeout(() => {
                if (!sala || !quien.isSpeaking || quien.identity === nombrado) return;
                if (callarMenor(quien)) return;
                nombrado = quien.identity;
                anunciar("Habla " + nombreDe(quien) + (esElProfe(quien) ? ", el profe" : "") + ".");
            }, 700);
        }

        /* ---------- Siguiente mano y el tiempo de cada turno (el profe) ----------
           Alt+N (o el botón): la palabra pasa a la primera mano de la fila. El
           tiempo de cada turno lo cuenta sesion.js (va con el turno, en
           game_state.elegido.hasta): acá solo se elige y se recuerda. */
        async function siguienteMano() {
            if (!esProfe || !op.siguienteMano) return;
            const r = await op.siguienteMano();
            if (r && r.error) { anunciar(r.error); return; }
            if (r && r.finRonda) { enRonda = false; pintarRonda(); anunciar("Terminó la ronda: hablaron todos."); return; }
            anunciar(r && r.nombre ? "Le diste la palabra a " + r.nombre + (r.enRonda ? " (" + r.lugar + " de " + r.total + " en la ronda)." : ".") : "No hay manos levantadas.");
        }
        const CLAVE_TIEMPO_TURNO = "llamadaTiempoDeTurno_v1";
        if (tiempoSel) {
            try { const t = localStorage.getItem(CLAVE_TIEMPO_TURNO); if (t && [...tiempoSel.options].some((o) => o.value === t)) tiempoSel.value = t; } catch (e) { /* sin almacenamiento */ }
            if (op.tiempoDeTurno) op.tiempoDeTurno(Number(tiempoSel.value) * 1000);
            tiempoSel.addEventListener("change", () => {
                try { localStorage.setItem(CLAVE_TIEMPO_TURNO, tiempoSel.value); } catch (e) { /* sin almacenamiento */ }
                if (op.tiempoDeTurno) op.tiempoDeTurno(Number(tiempoSel.value) * 1000);
                const s = Number(tiempoSel.value);
                anunciar(s ? "Cada turno va a durar " + (s < 60 ? s + " segundos" : s / 60 + (s === 60 ? " minuto" : " minutos")) + ": a los 10 segundos del final suena un aviso y después la palabra pasa a la siguiente mano."
                    : "Los turnos no tienen límite de tiempo.");
            });
        }
        if (siguienteBtn) siguienteBtn.addEventListener("click", siguienteMano);

        /* ---------- Sala de espera ----------
           El alumno que está en la sala grande sin el profe (todavía no entra,
           se cayó, o está escuchando un grupo) lo sabe: al entrar se le dice, y
           cuando el profe sale de la llamada, también. Que entre ya se anuncia
           («Entró a la llamada …, el profe», con su tono). En un grupo no se
           dice: ahí lo normal es estar sin el profe. */
        const hayProfe = () => Boolean(sala && [...sala.remoteParticipants.values()].some(esElProfe));
        function avisarSinProfe(alEntrar) {
            if (esProfe || grupoActual || !enLlamada() || hayProfe()) return;
            anunciar(alEntrar ? "Tu profe todavía no está en la llamada: te aviso cuando entre." : "Tu profe salió de la llamada: te aviso cuando vuelva.");
        }

        /* ---------- La batería del celular ----------
           Donde el navegador lo deja saber (Chrome y Edge; Safari y Firefox no):
           si al aparato le queda poca batería y no está cargando, se avisa una
           vez al 15 % y otra al 5 %, para que lo conecte antes de que se corte
           la llamada. */
        let bateria = null;
        let avisoBateria = 100;
        function revisarBateria() {
            if (!bateria || !enLlamada() || bateria.charging) return;
            const pct = Math.round(bateria.level * 100);
            const umbral = pct <= 5 ? 5 : pct <= 15 ? 15 : 0;
            if (!umbral || umbral >= avisoBateria) return;
            avisoBateria = umbral;
            sonido(SON.debil);
            anunciar("A tu aparato le queda " + pct + " % de batería: conéctalo al cargador para que no se corte la llamada.");
        }
        if (navigator.getBattery) {
            navigator.getBattery().then((b) => {
                bateria = b;
                b.addEventListener("levelchange", revisarBateria);
                b.addEventListener("chargingchange", () => { if (b.charging) avisoBateria = 100; });
            }).catch(() => { /* sin batería que mirar */ });
        }

        /* ---------- Los tonos, a gusto de cada uno ----------
           Normales, más bajos, más altos o apagados, y la vibración del celular
           aparte. Se recuerdan en el aparato. Lo escrito y lo que dice el lector
           no cambian: los tonos son un extra. */
        if (tonosSel) {
            tonosSel.value = String(volTonos);
            if (![...tonosSel.options].some((o) => o.value === tonosSel.value)) tonosSel.value = "1";
            tonosSel.addEventListener("change", () => {
                volTonos = Number(tonosSel.value);
                guardarTonos();
                sonido([880]);   // así se oye cómo quedó
                anunciar(volTonos ? "Tonos " + tonosSel.options[tonosSel.selectedIndex].textContent.toLowerCase() + "." : "Tonos apagados: los avisos siguen escritos y los dice el lector.");
            });
        }
        if (vibrarIn) {
            vibrarIn.checked = conVibracion;
            vibrarIn.addEventListener("change", () => {
                conVibracion = vibrarIn.checked;
                guardarTonos();
                if (conVibracion) vibrar(120);
                anunciar(conVibracion ? "El celular va a vibrar con los avisos." : "El celular ya no vibra con los avisos.");
            });
        }

        /* ---------- La guía de atajos (Alt+H) ----------
           Hay muchos atajos: Alt+H los dice de a un grupo, según quién eres, y
           cada vez que se vuelve a apretar sigue con el siguiente. Pasados 20
           segundos sin apretarla, vuelve a empezar. */
        const GUIA = esProfe ? [
            "Atajos de la llamada, 1 de 4. Alt M enciende o apaga el micrófono. Alt P, con «Mantener para hablar», suena mientras lo mantienes apretado.",
            "2 de 4. Alt N le da la palabra a la siguiente mano. Alt Q dice quién está en la llamada y quién de la clase no entró. Alt W dice quién habla, o quién habló último.",
            "3 de 4. Alt K marca este momento de la clase. Alt T salta entre la llamada y el tablero.",
            "4 de 4. Alt H repite esta guía. Vuelve a apretarla para empezar de nuevo.",
        ] : [
            "Atajos de la llamada, 1 de 4. Alt M enciende o apaga el micrófono. Alt P, con «Mantener para hablar», suena mientras lo mantienes apretado. Alt Y levanta o baja la mano.",
            "2 de 4. Para decirle algo a tu profe sin interrumpir: Alt 1 no entendí, Alt 2 más lento, Alt 3 sí, Alt 4 no. Con una pregunta de tu profe, Alt 3 y Alt 4 la contestan.",
            "3 de 4. Alt Q dice quién está en la llamada. Alt W dice quién habla, o quién habló último. Alt K marca este momento para repasarlo. Alt T salta entre la llamada y el tablero.",
            "4 de 4. Alt H repite esta guía. Vuelve a apretarla para empezar de nuevo.",
        ];
        let pasoGuia = 0, ultimaGuia = 0;
        function guia() {
            if (caja.hidden) return;
            if (Date.now() - ultimaGuia > 20000) pasoGuia = 0;
            ultimaGuia = Date.now();
            anunciar(GUIA[pasoGuia] + (pasoGuia < GUIA.length - 1 ? " Alt H para seguir." : ""));
            pasoGuia = (pasoGuia + 1) % GUIA.length;
        }
        if (guiaBtn) guiaBtn.addEventListener("click", guia);

        /* ---------- La primera vez ----------
           La primera vez que alguien entra a una llamada en este aparato, se le
           dice lo más importante y cómo oír el resto (Alt+H). Después no vuelve a
           salir solo: «Atajos (Alt+H)» lo repite cuando quiera. */
        const CLAVE_PRIMERA = "llamadaPrimeraVez_v1";
        function esPrimeraVez() {
            try { return localStorage.getItem(CLAVE_PRIMERA) !== "1"; } catch (e) { return false; }
        }
        function yaNoEsPrimeraVez() {
            try { localStorage.setItem(CLAVE_PRIMERA, "1"); } catch (e) { /* sin almacenamiento */ }
        }
        function explicarPrimeraVez() {
            anunciar("Es tu primera vez en la llamada. Lo más importante: Alt M enciende el micrófono"
                + (esProfe ? ", y Alt N le da la palabra a la siguiente mano." : ", y Alt Y levanta la mano para pedir la palabra.")
                + " Para oír todos los atajos, aprieta Alt H.");
            yaNoEsPrimeraVez();
        }

        /* ---------- La sala de práctica ----------
           «Practicar la llamada»: sin profe, sin nadie más y sin conectarse a
           nada. Los atajos y los botones hacen lo mismo que en la llamada (los
           tonos, lo que se dice), pero nada sale de este aparato: ni la mano, ni
           las reacciones, ni el micrófono. Sirve para aprendérselos con calma
           antes de la primera clase. «Probar el micrófono» sí funciona de verdad. */
        let practicando = false;
        let micPractica = false, manoPractica = false;
        function empezarPractica() {
            if (enLlamada() || practicando) return;
            practicando = true;
            micPractica = false;
            manoPractica = false;
            pasoGuia = 0;
            caja.hidden = false;
            pintar();
            sonido(SON.entra);
            anunciar("Estás en la sala de práctica: aquí no te oye nadie y nada sale de tu aparato. Prueba los atajos: Alt M el micrófono, Alt Y la mano, Alt 1 a Alt 4 para decirle algo a tu profe. Alt H dice todos.");
            mic.focus();
        }
        function terminarPractica() {
            if (!practicando) return;
            practicando = false;
            sonido(SON.sale);
            caja.hidden = !esProfe && !abierta;
            pintar();
            anunciar("Terminaste la práctica.");
            if (!caja.hidden) entrar.focus(); else if (practicarBtn) practicarBtn.focus();
        }
        // Lo que hace cada atajo en la práctica (lo mismo que en la llamada, sin red).
        const PRACTICA = {
            KeyM: () => { micPractica = !micPractica; sonido([micPractica ? 880 : 660]); anunciar(micPractica ? "Micrófono encendido (de práctica: no te oye nadie)." : "Micrófono apagado."); pintar(); },
            KeyY: () => { manoPractica = !manoPractica; anunciar(manoPractica ? "Levantaste la mano. En la clase, tu profe te ve en la fila y te dice tu lugar." : "Bajaste la mano."); },
            KeyQ: () => anunciar("Estás practicando solo: en la clase, aquí oirías quién está."),
            KeyW: () => anunciar("Nadie está hablando: en la clase, aquí oirías quién habla."),
            KeyK: () => { sonido([988, 1175]); anunciar("Marcaste este momento (de práctica). En la clase, lo encuentras en «Repasar mis clases»."); },
            KeyT: saltar,
            KeyH: guia,
            KeyN: () => anunciar(esProfe ? "En la clase, Alt N le da la palabra a la siguiente mano." : "Alt N es del profe."),
            Digit1: () => { sonido([880]); anunciar("En la clase, tu profe oiría: no entendí."); },
            Digit2: () => { sonido([880]); anunciar("En la clase, tu profe oiría: más lento."); },
            Digit3: () => { sonido([880]); anunciar("En la clase, tu profe oiría: sí."); },
            Digit4: () => { sonido([880]); anunciar("En la clase, tu profe oiría: no."); },
        };
        if (practicarBtn) {
            practicarBtn.addEventListener("click", empezarPractica);
            practicarCaja.hidden = esProfe;   // al profe no le hace falta: la abre él
        }

        /* ---------- Quién está en la clase pero no en la llamada (el profe) ----------
           Los alumnos que tienen la clase abierta (la presencia, sesion.js) y no
           están en la sala del profe. Solo sin grupos: con grupos, cada uno está
           en la sala de su grupo y no es que falte. «Avisarle» le suena un tono en
           su página y se le dice que su profe lo espera (por la presencia). */
        function faltanEnLaLlamada() {
            if (!esProfe || !enLlamada() || !op.alumnosDeLaClase || numerosDeGrupo().length) return [];
            const dentro = new Set([...sala.remoteParticipants.values()].map((p) => p.identity));
            return op.alumnosDeLaClase().filter((id) => !dentro.has(id))
                .map((id) => ({ id, nombre: (op.nombreDe && op.nombreDe(id)) || "Un alumno" }))
                .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
        }
        function pintarFaltan() {
            if (!faltanCaja) return;
            const faltan = faltanEnLaLlamada();
            faltanCaja.hidden = !faltan.length;
            faltanLista.textContent = "";
            for (const f of faltan) {
                const li = document.createElement("li");
                li.className = "flex items-center justify-between gap-2 px-3 py-1.5";
                const n = document.createElement("span");
                n.className = "font-semibold text-brand-800 dark:text-white break-words";
                n.textContent = f.nombre;   // lo escribió una persona
                const b = document.createElement("button");
                b.type = "button";
                b.className = "shrink-0 bg-white hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-800 dark:text-white font-semibold px-2 py-1 min-h-[44px] sm:min-h-0 rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
                b.textContent = "Avisarle";
                b.setAttribute("aria-label", "Avisarle a " + f.nombre + " que lo esperas en la llamada");
                b.addEventListener("click", async () => {
                    if (!op.llamarALaLlamada) return;
                    await op.llamarALaLlamada(f.id);
                    anunciar("Le avisaste a " + f.nombre + " que lo esperas en la llamada.");
                });
                li.append(n, b);
                faltanLista.appendChild(li);
            }
        }
        // Alumno: su profe lo llama a la llamada.
        function teLlaman() {
            if (esProfe || enLlamada() || caja.hidden) return;
            sonido(SON.pregunta);
            vibrar([100, 80, 100]);
            if (op.anunciarFuera) op.anunciarFuera("Tu profe te espera en la llamada: entra con «Entrar a la llamada».");
            anunciar("Tu profe te espera en la llamada: entra con «Entrar a la llamada».");
        }

        /* ---------- Quién se cayó y no volvió (el profe) ----------
           Si un alumno sale de la llamada y pasa un minuto sin volver, se le dice
           al profe (para no seguir esperándolo). No con grupos ni al mudarse de
           sala: ahí salir es lo normal. */
        const seFueron = new Map();   // identidad → timer
        function quizasNoVolvio(p) {
            if (!esProfe || esElProfe(p) || numerosDeGrupo().length || mudandose) return;
            clearTimeout(seFueron.get(p.identity));
            const nombre = nombreDe(p);
            seFueron.set(p.identity, setTimeout(() => {
                seFueron.delete(p.identity);
                if (!enLlamada() || numerosDeGrupo().length) return;
                if ([...sala.remoteParticipants.values()].some((x) => x.identity === p.identity)) return;
                sonido(SON.debil);
                anunciar(nombre + " salió de la llamada hace un minuto y no volvió.");
            }, 60000));
        }
        function yaVolvio(p) {
            clearTimeout(seFueron.get(p.identity));
            seFueron.delete(p.identity);
        }
        // La caja durante la práctica: el micrófono (de práctica), la guía y terminar.
        function pintarPractica() {
            for (const el of [entrar, quien, habla, modos, grabarBtn, grabandoAviso, pttCaja, volumenes, gente, reaccionesCaja, preguntaCaja, gruposCaja, turnosCaja, marcarBtn, faltanCaja]) if (el) el.hidden = true;
            if (practicarCaja) practicarCaja.hidden = true;
            mic.hidden = false;
            mic.setAttribute("aria-pressed", String(micPractica));
            mic.textContent = micPractica ? "🎙️ Micrófono encendido (práctica)" : "🔇 Micrófono apagado (práctica)";
            salirBtn.hidden = false;
            salirBtn.textContent = "Terminar la práctica";
        }


        /* ---------- Modo concentración (el alumno) ----------
           Mientras el profe explica, se callan los avisos menores: quién entra o
           sale (menos el profe), quién empieza a hablar. Queda lo importante: la
           palabra, las preguntas, el profe. Se recuerda en el aparato. */
        const CLAVE_CONCENTRACION = "llamadaConcentracion_v1";
        let concentracion = false;
        try { concentracion = localStorage.getItem(CLAVE_CONCENTRACION) === "1"; } catch (e) { /* sin almacenamiento */ }
        if (concentracionIn) {
            concentracionIn.checked = concentracion;
            concentracionIn.addEventListener("change", () => {
                concentracion = concentracionIn.checked;
                try { localStorage.setItem(CLAVE_CONCENTRACION, concentracion ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
                anunciar(concentracion ? "Modo concentración: no se avisa quién entra, quién sale ni quién habla. La palabra, las preguntas y tu profe sí."
                    : "Vuelven todos los avisos de la llamada.");
            });
        }
        // Un aviso menor: con el modo concentración (y sin ser del profe), no se dice.
        const callarMenor = (p) => !esProfe && concentracion && !(p && esElProfe(p));

        /* ---------- La ronda (el profe) ----------
           La palabra pasa por todos los alumnos conectados, por nombre, uno tras
           otro. La cuenta sesion.js (usa el tiempo de cada turno, si hay); acá
           el botón y lo que se dice. Alt+N pasa al siguiente de la ronda. */
        let enRonda = false;
        async function alternarRonda() {
            if (!esProfe || !op.ronda) return;
            const empezar = !enRonda;
            const r = await op.ronda(empezar);
            if (r && r.error) { anunciar(r.error); return; }
            enRonda = empezar;
            pintarRonda();
            anunciar(empezar ? "Empezó la ronda: habla " + r.nombre + " (1 de " + r.total + "). Con Alt N pasa al siguiente." : "Terminaste la ronda.");
        }
        function pintarRonda() {
            if (!rondaBtn) return;
            rondaBtn.setAttribute("aria-pressed", String(enRonda));
            rondaBtn.textContent = enRonda ? "⏹ Terminar la ronda" : "🔄 Ronda (todos, por turno)";
        }
        if (rondaBtn) rondaBtn.addEventListener("click", alternarRonda);

        /* ---------- Hablarle en privado a un alumno ----------
           El profe le habla solo a uno (para ayudarlo con su partida, por
           ejemplo): con los permisos de suscripción de LiveKit, que los hace
           cumplir el SERVIDOR, solo ese alumno recibe la voz del profe, y la
           página del alumno hace lo mismo con la suya (solo la recibe el profe).
           A los demás se les dice que el profe está ayudando a un compañero. Lo
           que se dice en privado no se graba: mientras dura, la grabación queda
           en silencio. Termina con «Volver a hablarle a todos» o al salir. */
        let privadoCon = null;   // profe: identidad del alumno
        async function hablarEnPrivado(p) {
            if (!esProfe || !enLlamada() || !op.privado) return;
            try {
                await sala.localParticipant.setTrackSubscriptionPermissions(false, [{ participantIdentity: p.identity, allowAll: true }]);
            } catch (e) { console.error(e); anunciar("No se pudo hablar en privado."); return; }
            privadoCon = p.identity;
            acomodarFuentes();
            await op.privado(p.identity);
            pintar();
            anunciar("Le hablas solo a " + nombreDe(p) + ": los demás no te oyen y no se graba. Para volver, «Volver a hablarle a todos».");
        }
        async function volverATodos(callado) {
            if (!esProfe || !privadoCon) return;
            privadoCon = null;
            try { if (sala) await sala.localParticipant.setTrackSubscriptionPermissions(true, []); } catch (e) { console.error(e); }
            acomodarFuentes();
            if (op.privado) await op.privado(null);
            pintar();
            if (!callado) anunciar("Volviste a hablarle a todos.");
        }
        // Alumno: su profe le habla en privado a él ("yo"), a otro ("otro") o volvió a todos (null).
        let privadoMio = null;
        async function ponerPrivado(estado) {
            if (esProfe) return;
            const antes = privadoMio;
            privadoMio = estado;
            if (enLlamada()) {
                try {
                    await sala.localParticipant.setTrackSubscriptionPermissions(estado !== "yo", estado === "yo" ? [{ participantIdentity: profesorId, allowAll: true }] : []);
                } catch (e) { console.error(e); }
            }
            if (caja.hidden || !enLlamada()) return;
            if (estado === "yo") { sonido(SON.pregunta); anunciar("Tu profe te habla solo a ti: los demás no los oyen."); }
            else if (estado === "otro") anunciar("Tu profe está ayudando a un compañero en privado: vuelve enseguida.");
            else if (antes) anunciar("Tu profe volvió a hablarle a todos.");
        }
        if (privadoFinBtn) privadoFinBtn.addEventListener("click", () => volverATodos(false));

        /* ---------- Decir una jugada por voz (Alt+J) ----------
           Graba 3 segundos, los pasa a texto CON WHISPER EN ESTE APARATO (el
           mismo de «Pasar a texto»: el audio no sale de acá) y lo que entendió
           entra al cuadro de comandos de la clase como si se hubiera escrito
           («caballo f3»): el cuadro decide si es una jugada y si le toca. La
           primera vez se baja el reconocedor (unos 80 MB) y queda guardado. Si
           se está en la llamada con el micrófono encendido, la clase también lo
           oye: es como decirlo en voz alta. */
        let dictando = false;
        async function dictarJugada() {
            if (dictando || caja.hidden || practicando) return;
            if (!window.ReporteTranscribir || !ReporteTranscribir.hayCómo() || !navigator.mediaDevices || !op.jugarTexto) {
                anunciar("Este navegador no puede reconocer la voz. Escribe la jugada en el cuadro de comandos.");
                return;
            }
            dictando = true;
            let flujo = null;
            try {
                flujo = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: micElegido ? { exact: micElegido } : undefined, echoCancellation: true, noiseSuppression: true } });
                const tipo = tipoDeGrabacion();
                if (!tipo) throw new Error("sin grabadora");
                const rec = new MediaRecorder(flujo, { mimeType: tipo });
                const trozos = [];
                rec.ondataavailable = (e) => { if (e.data && e.data.size) trozos.push(e.data); };
                anunciar("Di tu jugada después del tono, por ejemplo «caballo efe tres».");
                await new Promise((r) => setTimeout(r, 2200));
                sonido([880]);
                rec.start();
                await new Promise((r) => setTimeout(r, 3000));
                await new Promise((r) => { rec.onstop = r; rec.stop(); });
                sonido([660]);
                flujo.getTracks().forEach((t) => t.stop());
                flujo = null;
                let ultimoAviso = 0;
                const texto = await ReporteTranscribir.transcribir(new Blob(trozos, { type: trozos[0] ? trozos[0].type : tipo }), (a) => {
                    if (a.etapa === "modelo" && Date.now() - ultimoAviso > 8000) { ultimoAviso = Date.now(); anunciar("Bajando el reconocedor de voz por primera vez: " + Math.round(a.porcentaje || 0) + " %. Queda guardado."); }
                });
                const jugada = jugadaDicha(texto);
                if (!jugada) { anunciar("No entendí ninguna jugada. Prueba otra vez con Alt J, o escríbela."); return; }
                anunciar("Entendí: " + jugada + ".");
                const error = op.jugarTexto(jugada);
                if (error) anunciar(error);
            } catch (e) {
                console.error(e);
                anunciar(e && e.name === "NotAllowedError" ? "El navegador no deja usar el micrófono. Permítelo en el candado de la barra de direcciones." : "No se pudo reconocer la jugada. Escríbela en el cuadro de comandos.");
            } finally {
                if (flujo) flujo.getTracks().forEach((t) => t.stop());
                dictando = false;
            }
        }
        if (dictarBtn) dictarBtn.addEventListener("click", dictarJugada);
        async function pedir(accion, extra) {
            const body = Object.assign({ accion, profesor: profesorId }, extra || {});
            if (esProfe) { body.grupo = grupoDelProfe; body.viejos = [...gruposVistos]; }
            const { data, error } = await sb.functions.invoke("clase-llamada", { body });
            if (error) throw new Error(await mensajeDe(error, "No se pudo entrar a la llamada."));
            return data;
        }

        async function alEntrar(reconectando) {
            if (entrando || enLlamada()) return;
            if (reconectando !== true) { quiereEstar = true; intentos = 0; }
            entrando = true;
            entrar.disabled = true;
            entrar.textContent = "Entrando…";
            try {
                /* El profe la abre al entrar: desde ahí a sus alumnos les aparece la
                   caja. La base no le da pase a un alumno sin eso. */
                if (esProfe && !abierta && op.abrir) {
                    const error = await op.abrir(true);
                    if (error) throw new Error(error);
                    abierta = true;
                    grabando = true;   // abrir la llamada la deja grabando (sesion.js, llamada_grabando)
                }
                const [lk, pase] = await Promise.all([cargarLibreria(), pedir("pase")]);
                LK = lk;
                permisoVoz = esProfe || pase.permiso_voz !== false;
                // Las voces en su lugar necesitan WebAudio: se decide al entrar.
                mezclaConVoces = espacial;
                paneos.clear();
                if (espacial && !ctxVoces) ctxVoces = new (window.AudioContext || window.webkitAudioContext)();
                sala = new LK.Room({
                    adaptiveStream: true,
                    dynacast: true,
                    webAudioMix: espacial ? { audioContext: ctxVoces } : false,
                    /* Lo que el navegador hace para quitar el ruido de la casa (la
                       tele, el ventilador): las tres de siempre y aislar la voz,
                       donde el navegador lo sepa hacer. */
                    audioCaptureDefaults: { deviceId: micElegido || undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, voiceIsolation: true },
                    // DTX: nada en los silencios. RED: cada paquete viaja también en
                    // el siguiente, para que una conexión mala no corte palabras.
                    publishDefaults: { dtx: true, red: true },
                });
                escuchar(sala);
                await sala.connect(pase.url, pase.token);
                await sala.startAudio();   // el toque de «Entrar» deja sonar el audio
                if (ctxVoces && ctxVoces.state === "suspended") ctxVoces.resume().catch(() => {});
                const grupoAntes = grupoActual;
                grupoActual = esProfe ? grupoDelProfe : Number(pase.grupo) || 0;
                sonido(SON.entra);
                const otros = sala.remoteParticipants.size;
                if (grupoActual && !esProfe) {
                    const con = decirLista(nombresDelGrupo(grupoActual));
                    anunciar("Estás en el grupo " + grupoActual + (con ? " con " + con : "") + ". En el grupo pueden hablar todos: enciende el micrófono con Alt M.");
                } else if (grupoActual) {
                    anunciar("Entraste al grupo " + grupoActual + (otros ? "; hay " + otros + (otros === 1 ? " alumno" : " alumnos") : "; todavía no llegó nadie") + ".");
                } else if (grupoAntes && reconectando === true) {
                    anunciar(esProfe ? "Volviste a la sala grande." : "Volviste a la sala grande con toda la clase." + (pase.puede_hablar ? "" : " Para hablar, levanta la mano con Alt Y."));
                } else if (reconectando === true && quiereEstar && !intentos) {
                    anunciar("Volviste a la llamada.");
                } else {
                    anunciar("Entraste a la llamada" + (otros ? "; hay " + otros + (otros === 1 ? " persona más" : " personas más") : "; todavía estás solo") + ". "
                        + (esProfe ? "Enciende el micrófono con Alt M."
                            : pase.puede_hablar ? "Tienes la palabra: enciende el micrófono con Alt M."
                            : "Para hablar, levanta la mano con Alt Y."));
                }
                if (!esProfe && grabando) anunciar("Esta clase se está grabando." + (permisoVoz ? "" : " " + SIN_PERMISO));
                // Sin el profe en la sala grande, se dice (después del aviso de entrada).
                if (!esProfe) setTimeout(() => avisarSinProfe(true), 2500);
                if (reconectando !== true && esPrimeraVez()) setTimeout(explicarPrimeraVez, 4500);
                avisoBateria = 100;
                setTimeout(revisarBateria, 4000);
                if (esProfe) { sincronizar(); refrescarPermisos(); empezarAContar(); if (grabando) empezarAGrabar(); }
                pintar();
                // Al volver solo no se mueve el foco: puede estar en el tablero.
                if (reconectando !== true) mic.focus();
            } catch (e) {
                console.error(e);
                anunciar(e.message || "No se pudo entrar a la llamada.");
                // Primero se suelta: así su «Disconnected» llega como sala vieja y no corta los reintentos.
                const fallida = sala;
                sala = null;
                if (fallida) { try { await fallida.disconnect(); } catch (_) { /* nada */ } }
                pintar();
            } finally {
                entrando = false;
                entrar.disabled = false;
                pintar();
            }
        }

        async function alternarMic() {
            if (!enLlamada()) { anunciar("Primero entra a la llamada."); return; }
            if (ptt.checked) { anunciar("Con «Mantener para hablar», mantén apretado el botón del micrófono o Alt P mientras hablas."); return; }
            if (!micEncendido() && !puedoHablar()) {
                anunciar(esProfe ? "Todavía no puedes encender el micrófono."
                    : grabando && !permisoVoz ? SIN_PERMISO
                    : modo === "bloqueada" ? "Tu profe bloqueó los micrófonos: por ahora solo habla el profe."
                    : "Todavía no tienes la palabra. Levanta la mano con Alt Y.");
                return;
            }
            try {
                if (micEncendido()) yoApague = Date.now();
                await sala.localParticipant.setMicrophoneEnabled(!micEncendido());
                anunciar(micEncendido() ? "Micrófono encendido." : "Micrófono apagado.");
            } catch (e) {
                console.error(e);
                anunciar(e && e.name === "NotAllowedError"
                    ? "El navegador no deja usar el micrófono. Permítelo en el candado de la barra de direcciones."
                    : "No se pudo usar el micrófono.");
            }
            pintar();
        }

        /* ---------- Mantener para hablar ----------
           El micrófono suena solo mientras se aprieta: el botón (dedo, ratón, o
           Espacio/Enter con el foco en él) o Alt+P desde cualquier parte. Para
           alguien que no ve la pantalla es más fácil que recordar si lo dejó
           encendido, y no se cuela ruido en la clase. Un toque corto al empezar y
           otro al soltar dicen que está sonando, sin que el lector hable cada
           vez. La preferencia se recuerda en este aparato. */
        const CLAVE_PTT = "llamadaMantenerParaHablar_v1";
        try { ptt.checked = localStorage.getItem(CLAVE_PTT) === "1"; } catch (e) { /* sin almacenamiento */ }
        let apretado = false;
        async function empezarAHablar() {
            if (!ptt.checked || apretado || !enLlamada()) return;
            if (!puedoHablar()) {
                anunciar(esProfe ? "Todavía no puedes encender el micrófono."
                    : grabando && !permisoVoz ? SIN_PERMISO
                    : modo === "bloqueada" ? "Tu profe bloqueó los micrófonos: por ahora solo habla el profe."
                    : "Todavía no tienes la palabra. Levanta la mano con Alt Y.");
                return;
            }
            apretado = true;
            sonido([880]);
            try { await sala.localParticipant.setMicrophoneEnabled(true); } catch (e) { console.error(e); apretado = false; anunciar("No se pudo usar el micrófono."); }
            if (!apretado) await callarse();   // soltó antes de que el micrófono terminara de encender
            pintar();
        }
        async function callarse() {
            if (!apretado && !micEncendido()) return;
            apretado = false;
            sonido([660]);
            yoApague = Date.now();
            try { if (sala) await sala.localParticipant.setMicrophoneEnabled(false); } catch (e) { console.error(e); }
            pintar();
        }
        ptt.addEventListener("change", async () => {
            try { localStorage.setItem(CLAVE_PTT, ptt.checked ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
            if (ptt.checked && micEncendido()) { yoApague = Date.now(); await sala.localParticipant.setMicrophoneEnabled(false); }
            pintar();
            anunciar(ptt.checked ? "Mantener para hablar: mantén apretado Alt P o el botón del micrófono mientras hablas." : "El micrófono vuelve a encenderse y apagarse con un toque.");
        });
        // El botón del micrófono, apretado y soltado.
        mic.addEventListener("pointerdown", (e) => { if (ptt.checked) { e.preventDefault(); empezarAHablar(); } });
        for (const ev of ["pointerup", "pointerleave", "pointercancel"]) mic.addEventListener(ev, () => { if (ptt.checked) callarse(); });
        mic.addEventListener("keydown", (e) => {
            if (!ptt.checked || (e.key !== " " && e.key !== "Enter")) return;
            e.preventDefault();
            if (!e.repeat) empezarAHablar();
        });
        mic.addEventListener("keyup", (e) => { if (ptt.checked && (e.key === " " || e.key === "Enter")) { e.preventDefault(); callarse(); } });
        // Alt+P desde cualquier parte de la página.
        document.addEventListener("keydown", (e) => {
            if (!ptt.checked || e.code !== "KeyP" || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            e.preventDefault();
            if (!e.repeat) empezarAHablar();
        });
        document.addEventListener("keyup", (e) => {
            if (apretado && (e.code === "KeyP" || e.key === "Alt")) { e.preventDefault(); callarse(); }
        });
        // Si la ventana pierde el foco con la tecla apretada, nunca llega el keyup: se calla.
        window.addEventListener("blur", () => { if (apretado) callarse(); });

        /* ---------- Los minutos que habló cada alumno ----------
           Los mide la página del profe mientras él está en la llamada: cada
           segundo, a cada alumno que LiveKit marca «hablando» se le suma ese
           segundo. Se ven en la lista y en Alt+Q («habló 3 minutos») y cada
           minuto (y al salir) se mandan a la base (sumar_segundos_hablados:
           solo el profe de la clase, solo a quienes tienen asistencia). Lo
           que no se pudo mandar se vuelve a intentar en la tanda siguiente. */
        const hablado = new Map();   // identidad → segundos en esta clase (los de esta página)
        let porMandar = {};          // identidad → segundos todavía sin guardar
        let contador = null;
        let ultimoEnvio = 0;
        let claseContada = null;     // la clase viaja con la tanda: la última se manda al cerrarla
        function textoDeMinutos(id) {
            const s = hablado.get(id) || 0;
            if (s < 60) return "";
            const m = Math.floor(s / 60);
            return "habló " + m + (m === 1 ? " minuto" : " minutos");
        }
        async function mandarMinutos() {
            if (!esProfe || !op.sumarHablado) return;
            const tanda = porMandar;
            if (!Object.keys(tanda).length) return;
            porMandar = {};
            ultimoEnvio = Date.now();
            const ok = await op.sumarHablado(claseContada, tanda);
            // No se pudo: vuelve a la cola, sumado a lo que se juntó mientras tanto.
            if (!ok) for (const [id, s] of Object.entries(tanda)) porMandar[id] = (porMandar[id] || 0) + s;
        }
        function contarQuienHabla() {
            if (!enLlamada()) return;
            let cambioMinuto = false;
            for (const p of sala.remoteParticipants.values()) {
                if (!p.isSpeaking || esElProfe(p)) continue;
                const antes = hablado.get(p.identity) || 0;
                hablado.set(p.identity, antes + 1);
                porMandar[p.identity] = (porMandar[p.identity] || 0) + 1;
                if (Math.floor((antes + 1) / 60) !== Math.floor(antes / 60)) cambioMinuto = true;
            }
            if (cambioMinuto) pintarGente();
            if (Date.now() - ultimoEnvio >= 60000) mandarMinutos();
        }
        async function empezarAContar() {
            if (!esProfe || contador || !op.sumarHablado) return;
            const clase = op.claseActual ? op.claseActual() : null;
            if (!clase) return;
            if (clase !== claseContada) { hablado.clear(); porMandar = {}; }
            claseContada = clase;
            ultimoEnvio = Date.now();
            contador = setInterval(contarQuienHabla, 1000);
            // Lo que ya se habló en esta clase (si el profe recargó la página o volvió a entrar).
            const antes = op.hablaronAntes ? await op.hablaronAntes(clase) : null;
            if (antes && claseContada === clase) {
                for (const [id, s] of antes) hablado.set(id, Math.max(hablado.get(id) || 0, s + (porMandar[id] || 0)));
                pintarGente();
            }
        }
        function dejarDeContar() {
            clearInterval(contador);
            contador = null;
            mandarMinutos();
        }

        function quienEsta() {
            if (!enLlamada()) { anunciar("No estás en la llamada."); return; }
            const otros = enOrden().filter((f) => !f.yo).map((f) => f.p);
            if (!otros.length) { anunciar("Estás solo en la llamada."); return; }
            const partes = otros.map((p) => nombreDe(p) + (esElProfe(p) ? ", el profe" : tienePalabra(p) ? ", con la palabra" : "")
                + (esProfe && sinPermiso.has(p.identity) ? ", sin permiso de grabación" : "")
                + (esProfe && !esElProfe(p) && textoDeMinutos(p.identity) ? ", " + textoDeMinutos(p.identity) : "")
                + (esProfe && senalDebil(p) ? ", con la señal débil" : ""));
            const faltan = faltanEnLaLlamada().map((f) => f.nombre);
            anunciar("En la llamada hay " + (otros.length + 1) + " contigo: " + partes.join("; ") + "."
                + (faltan.length ? " En la clase pero no en la llamada: " + decirLista(faltan) + "." : ""));
        }

        function quienHabla() {
            if (!enLlamada()) { anunciar("No estás en la llamada."); return; }
            const hablan = sala.activeSpeakers.filter((p) => p.isSpeaking);
            if (!hablan.length) {
                if (!ultimo) { anunciar("Nadie está hablando."); return; }
                const s = Math.round((Date.now() - ultimo.t) / 1000);
                anunciar("Nadie está hablando ahora. Lo último lo dijo " + ultimo.nombre + ", hace "
                    + (s < 60 ? s + (s === 1 ? " segundo" : " segundos") : Math.round(s / 60) + (Math.round(s / 60) === 1 ? " minuto" : " minutos")) + ".");
                return;
            }
            anunciar("Está hablando " + hablan.map((p) => (p === sala.localParticipant ? "tú" : nombreDe(p))).join(" y ") + ".");
        }

        async function salir() {
            noVolver();
            if (sala) { try { await sala.disconnect(); } catch (e) { console.error(e); } }
        }

        /* ---------- Volver sola a la llamada ----------
           LiveKit ya aguanta los cortes cortos («Reconectando…»). Si igual se cae
           del todo (se fue la red un rato, el celular cambió de red), la página
           vuelve a entrar sola: en 2, 4, 8, 16 y 30 segundos, y si el aparato
           dice que no hay red, espera a que vuelva (evento «online»). No vuelve
           si la persona salió, si el profe la sacó o terminó la llamada, ni si
           entró con la misma cuenta en otra pestaña (se pelearían). Al volver no
           mueve el foco; el profe, si estaba grabando, sigue en una parte nueva. */
        let quiereEstar = false;   // entró y no salió por su cuenta
        let intentos = 0;
        let reintento = null;
        let esperandoRed = false;
        function noVolver() {
            quiereEstar = false;
            intentos = 0;
            clearTimeout(reintento);
            reintento = null;
        }
        function volverALaLlamada() {
            if (!quiereEstar || !abierta || reintento || entrando || enLlamada()) return;
            if (!navigator.onLine) {
                anunciar("Se cayó la llamada y no hay conexión. La página vuelve a entrar en cuanto regrese la conexión.");
                if (!esperandoRed) {
                    esperandoRed = true;
                    window.addEventListener("online", () => { esperandoRed = false; intentos = 0; volverALaLlamada(); }, { once: true });
                }
                return;
            }
            if (intentos >= 5) {
                anunciar("No se pudo volver a la llamada. Entra con «Entrar a la llamada» cuando tengas buena conexión.");
                noVolver();
                return;
            }
            const espera = Math.min(30000, 2000 * 2 ** intentos);
            intentos++;
            anunciar("Se cayó la llamada. Volviendo a entrar en " + Math.round(espera / 1000) + " segundos…");
            reintento = setTimeout(async () => {
                reintento = null;
                if (!quiereEstar || !abierta) return;
                await alEntrar(true);
                if (enLlamada()) intentos = 0;
                else volverALaLlamada();
            }, espera);
        }

        /* El profe termina la llamada: se cierra para todos. La base deja de dar
           pases, «sincronizar» saca de la sala a los que estaban, y a cada alumno
           la caja se le esconde por game_state (estado(false)) aunque el servidor
           tarde. */
        async function terminar() {
            if (op.abrir) {
                const error = await op.abrir(false);
                if (error) { anunciar(error); return; }
            }
            abierta = false;
            modo = "turno";
            grabando = false;
            grupos = null;
            grupoDelProfe = 0;
            await dejarDeGrabar();
            await sincronizar();
            await salir();
            anunciar("Terminaste la llamada para toda la clase.");
            pintar();
        }

        /* ---------- La grabación, en el navegador del profe ----------
           Junta en un AudioContext las voces que ya le llegan (las de la sala y
           su micrófono) y las graba con MediaRecorder. Cada PARTE_MS cierra la
           parte y empieza otra: cada una es un archivo entero que se puede
           escuchar solo, y si se le cierra la pestaña se pierde como mucho la
           última. No se graba nunca sin que antes quede puesto «Se está
           grabando» (game_state.llamada_grabando), que ven todos. */
        const PARTE_MS = 5 * 60 * 1000;
        let grab = null;   // { ctx, destino, fuentes: Map, rec, desde, timer, clase, tipo }
        const tipoDeGrabacion = () => {
            if (!window.MediaRecorder) return "";
            for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
                if (MediaRecorder.isTypeSupported(t)) return t;
            }
            return "";
        };
        function pistasDeAudio() {
            const pistas = [];
            if (!sala) return pistas;
            for (const pub of sala.localParticipant.audioTrackPublications.values()) if (pub.track) pistas.push(pub.track.mediaStreamTrack);
            for (const p of sala.remoteParticipants.values()) {
                for (const pub of p.audioTrackPublications.values()) if (pub.track) pistas.push(pub.track.mediaStreamTrack);
            }
            return pistas.filter(Boolean);
        }
        // Que la grabación tenga a todos los que suenan ahora (entran, salen, encienden el micrófono).
        function acomodarFuentes() {
            if (!grab) return;
            // Mientras el profe habla en privado, la grabación queda en silencio: eso no se graba.
            const ahora = new Set(privadoCon ? [] : pistasDeAudio());
            for (const [pista, fuente] of grab.fuentes) {
                if (!ahora.has(pista)) { try { fuente.disconnect(); } catch (e) { /* ya estaba */ } grab.fuentes.delete(pista); }
            }
            for (const pista of ahora) {
                if (grab.fuentes.has(pista)) continue;
                const fuente = grab.ctx.createMediaStreamSource(new MediaStream([pista]));
                fuente.connect(grab.destino);
                grab.fuentes.set(pista, fuente);
            }
        }
        /* La posición del tablero en cada momento de la parte: la clase no guarda
           la hora de cada jugada, así que la anota quien graba. Cada segundo se
           mira la posición que ve la clase y, si cambió, se anota {s, fen}. En
           «Repasar mis clases» el tablero sigue la grabación con esto.

           Y los TEMAS, solos: el profe no marca nada. Cada segundo se mira
           también de qué va la clase (`op.tema()`: la diapositiva, la práctica,
           el calentamiento, el tiempo para pensar o una posición nueva) y, si
           cambió, la marca lleva `tema` (el texto del capítulo). La primera marca
           de cada parte lo lleva siempre: así cada parte dice dónde empieza. */
        const MARCAS_MAX = 3600;
        function anotarPosicion(parte) {
            if (!parte || parte.marcas.length >= MARCAS_MAX) return;
            const fen = op.posicion ? op.posicion() : null;
            const t = op.tema ? op.tema() : null;
            const clave = t && t.clave ? String(t.clave) : null;
            const temaNuevo = clave && clave !== parte.ultimoTema;
            if ((!fen || fen === parte.ultimaFen) && !temaNuevo) return;
            const marca = { s: Math.round((Date.now() - parte.desde) / 100) / 10, fen: fen || parte.ultimaFen };
            if (temaNuevo) {
                // Volver a algo que ya se vio en la clase (la misma posición después de una diapositiva).
                marca.tema = String(grab && grab.temasVistos.has(clave) && parte.ultimoTema ? "De vuelta a: " + t.texto : t.texto).slice(0, 160);
                parte.ultimoTema = clave;
                if (grab) grab.temasVistos.add(clave);
            }
            if (!marca.fen) delete marca.fen;
            parte.ultimaFen = fen || parte.ultimaFen;
            parte.marcas.push(marca);
        }
        function nuevaParte() {
            const rec = new MediaRecorder(grab.destino.stream, { mimeType: grab.tipo, audioBitsPerSecond: 32000 });
            const trozos = [];
            const parte = { desde: Date.now(), marcas: [], ultimaFen: null, ultimoTema: null };
            const clase = grab.clase;
            anotarPosicion(parte);
            rec.ondataavailable = (e) => { if (e.data && e.data.size) trozos.push(e.data); };
            rec.onstop = async () => {
                if (!trozos.length) return;
                const blob = new Blob(trozos, { type: grab ? grab.tipo.split(";")[0] : trozos[0].type });
                const error = await op.subirParte(blob, (Date.now() - parte.desde) / 1000, blob.type, clase, parte.marcas);
                if (error) anunciar(error);
            };
            rec.start();
            grab.rec = rec;
            grab.parte = parte;
        }
        function empezarAGrabar() {
            if (!esProfe || grab || !enLlamada() || !op.subirParte) return;
            const tipo = tipoDeGrabacion();
            const clase = op.claseActual ? op.claseActual() : null;
            if (!tipo || !clase) {
                anunciar(tipo ? "No se puede grabar: abre la clase primero." : "Este navegador no puede grabar la clase.");
                if (op.grabar) op.grabar(false).then(() => { grabando = false; pintar(); sincronizar(); });
                return;
            }
            /* Una falla al grabar nunca tumba la llamada: se dice, se apaga la
               grabación (y el aviso para todos) y la clase sigue con voz. */
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                grab = { ctx: new Ctx(), fuentes: new Map(), rec: null, timer: null, clase, tipo, temasVistos: new Set() };
                grab.destino = grab.ctx.createMediaStreamDestination();
                acomodarFuentes();
                nuevaParte();
            } catch (e) {
                console.error(e);
                const g = grab;
                grab = null;
                if (g && g.ctx) g.ctx.close().catch(() => {});
                anunciar("No se pudo grabar la clase en este navegador.");
                if (op.grabar) op.grabar(false).then(() => { grabando = false; pintar(); sincronizar(); });
                return;
            }
            grab.timer = setInterval(() => {
                if (!grab) return;
                const vieja = grab.rec;
                nuevaParte();        // la siguiente arranca ya: no se pierde ni un segundo entre partes
                vieja.stop();
            }, PARTE_MS);
            grab.mirador = setInterval(() => { if (grab) anotarPosicion(grab.parte); }, 1000);
        }
        async function dejarDeGrabar() {
            if (!grab) return;
            const g = grab;
            clearInterval(g.timer);
            clearInterval(g.mirador);
            anotarPosicion(g.parte);   // lo último que se vio, antes de cerrar la parte
            if (g.rec && g.rec.state !== "inactive") {
                await new Promise((listo) => { g.rec.addEventListener("stop", () => setTimeout(listo, 0), { once: true }); g.rec.stop(); });
            }
            grab = null;
            for (const fuente of g.fuentes.values()) { try { fuente.disconnect(); } catch (e) { /* ya estaba */ } }
            try { await g.ctx.close(); } catch (e) { /* ya estaba cerrado */ }
        }
        // Pausar o volver a grabar. Primero el aviso para todos, después la grabadora.
        async function alternarGrabar() {
            if (!esProfe || !enLlamada() || !op.grabar) return;
            const encender = !grabando;
            if (!encender) await dejarDeGrabar();
            const error = await op.grabar(encender);
            if (error) { anunciar(error); return; }
            grabando = encender;
            if (encender) empezarAGrabar();
            pintar();
            await sincronizar();   // con la grabación, el alumno sin permiso no habla; sin ella, sí
            anunciar(grabando ? "Grabando la clase." : "Pausaste la grabación de la clase.");
        }

        /* El profe: quiénes de la llamada no tienen el permiso de grabación. Se
           pregunta al entrar y cada vez que entra alguien (juntando los que
           entran seguidos en un solo pedido). */
        let permisosPendiente = null;
        function refrescarPermisos() {
            if (!esProfe || !op.permisosDeVoz) return;
            clearTimeout(permisosPendiente);
            permisosPendiente = setTimeout(async () => {
                if (!sala) return;
                const ids = [...sala.remoteParticipants.values()].filter((p) => !esElProfe(p)).map((p) => p.identity);
                const con = await op.permisosDeVoz(ids);
                if (!con || !sala) return;
                sinPermiso = new Set(ids.filter((id) => !con.has(id)));
                pintarGente();
            }, 400);
        }

        /* El profe elige quién puede hablar. Lo guarda en game_state (lo ven
           todos) y le pide al servidor que le dé o le quite la palabra a cada uno:
           el permiso lo pone LiveKit, no la página. */
        async function elegirModo(nuevo) {
            if (!esProfe || !enLlamada() || !op.modo || !MODOS[nuevo] || nuevo === modo) return;
            const error = await op.modo(nuevo);
            if (error) { anunciar(error); return; }
            modo = nuevo;
            pintar();
            await sincronizar();
            anunciar(MODOS[modo].alProfe);
        }

        /* Lo que dice game_state: si el profe abrió la llamada en esta clase
           (sesion.js lo llama como `llamada.estado(…)`). */
        function ponerEstado(abiertaAhora, modoAhora, grabandoAhora, gruposAhora) {
            const antes = abierta;
            const modoAntes = modo;
            const grabandoAntes = grabando;
            abierta = Boolean(abiertaAhora);
            modo = abierta && MODOS[modoAhora] ? modoAhora : "turno";
            grabando = abierta && Boolean(grabandoAhora);
            grupos = abierta && gruposAhora && typeof gruposAhora === "object" ? gruposAhora : null;
            numerosDeGrupo().forEach((n) => gruposVistos.add(n));
            if (esProfe) { pintar(); return; }
            // El profe armó, cambió o terminó los grupos: a la sala que toca.
            if (abierta && enLlamada() && !mudandose && grupoQueMeToca() !== grupoActual) {
                sonido(SON.entra);
                anunciar(grupoQueMeToca() ? "Tu profe armó grupos: pasando al grupo " + grupoQueMeToca() + "…" : "Tu profe terminó los grupos: volviendo a la sala grande…");
                mudarse();
            }
            // Empezó o se pausó la grabación: se le dice al alumno (y por qué no habla, si no tiene permiso).
            if (abierta && antes && grabando !== grabandoAntes) {
                anunciar(grabando ? "Esta clase se está grabando." + (enLlamada() && !permisoVoz ? " " + SIN_PERMISO : "") : "Se pausó la grabación de la clase.");
                pintar();
            }
            // Cambió quién puede hablar con la llamada ya abierta: se le dice al alumno.
            if (abierta && antes && modo !== modoAntes) { anunciar(MODOS[modo].alAlumno); pintarGente(); }
            if (abierta && !antes) {
                caja.hidden = false;
                pintar();
                sonido(SON.entra);
                anunciar("Tu profe abrió la llamada de la clase: entra con «Entrar a la llamada».");
            } else if (!abierta && !practicando && (antes || !caja.hidden)) {
                const estabaDentro = Boolean(sala);
                noVolver();
                cerrandoPorElProfe = true;
                salir();
                caja.hidden = true;
                if (antes && op.anunciarFuera) op.anunciarFuera("Tu profe terminó la llamada de la clase." + (estabaDentro ? " Saliste de la llamada." : ""));
            }
        }

        /* El profe: que la sala quede igual que la clase (quién tiene el turno,
           a quién sacó). Aunque él no esté en la llamada: un alumno puede estar
           y esperar la palabra. Sin la llamada configurada no dice nada. */
        async function sincronizar() {
            if (!esProfe) return;
            try { await pedir("sincronizar"); } catch (e) { console.warn("clase-llamada:", e.message); }
        }

        function escuchar(room) {
            const E = LK.RoomEvent;
            room
                .on(E.ParticipantConnected, (p) => {
                    if (!callarMenor(p)) {
                        sonido(SON.entra);
                        anunciar((grupoActual ? "Entró al grupo " : "Entró a la llamada ") + nombreDe(p) + (esElProfe(p) ? ", el profe" : "") + ".");
                    }
                    yaVolvio(p);
                    pintarGente(); refrescarPermisos(); acomodarVoces();
                })
                .on(E.ParticipantDisconnected, (p) => {
                    if (!callarMenor(p)) {
                        sonido(SON.sale);
                        anunciar((grupoActual ? "Salió del grupo " : "Salió de la llamada ") + nombreDe(p) + ".");
                    }
                    if (privadoCon === p.identity) volverATodos(false);
                    if (esElProfe(p)) setTimeout(() => avisarSinProfe(false), 1500);
                    quizasNoVolvio(p);
                    paneos.delete(p.identity);
                    calidad.delete(p.identity);
                    pintarGente(); acomodarVoces();
                })
                // Quién habla cambia a cada rato: solo se repinta la lista (no se anuncia).
                .on(E.ActiveSpeakersChanged, () => { anotarQuienHabla(); quizasDecirQuienHabla(); })
                .on(E.TrackSubscribed, (track) => {
                    if (track.kind === "audio") { audios.appendChild(track.attach()); aplicarVolumenDeLaLlamada(); acomodarVoces(); }
                    acomodarFuentes();
                })
                // El micrófono de alguien se prendió o se apagó: el botón del profe para apagarlo.
                .on(E.TrackUnmuted, () => pintarGente())
                .on(E.TrackMuted, (pub, p) => {
                    pintarGente();
                    // A mí me lo apagó el profe (no fui yo): se dice, con su tono.
                    if (!esProfe && p === room.localParticipant && pub && pub.kind === "audio" && Date.now() - yoApague > 2000) {
                        sonido(SON.apagado);
                        vibrar(150);
                        anunciar("Tu profe apagó tu micrófono. Si tienes la palabra, lo vuelves a encender con Alt M.");
                        pintar();
                    }
                })
                .on(E.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); acomodarFuentes(); })
                .on(E.ParticipantPermissionsChanged, (antes, p) => {
                    pintarGente();   // «con la palabra» en la lista, también de los demás
                    if (p !== room.localParticipant || esProfe) return;
                    const ahora = Boolean(p.permissions && p.permissions.canPublish);
                    if (ahora === Boolean(antes && antes.canPublish)) return;
                    // Con «Todos» o «Nadie» ya se dijo el cambio de modo; acá solo el turno.
                    if (ahora) {
                        sonido(SON.palabra);
                        vibrar([80, 60, 80]);
                        if (modo !== "libre" && !grupoActual) anunciar("Tu profe te dio la palabra: enciende el micrófono con Alt M.");
                    } else {
                        sonido(SON.finTurno);
                        if (modo === "turno") anunciar("Se terminó tu turno: tu micrófono se apagó.");
                    }
                    pintar();
                })
                .on(E.LocalTrackPublished, () => { acomodarFuentes(); escucharMiMicrofono(); pintar(); })
                .on(E.LocalTrackUnpublished, () => { acomodarFuentes(); pintar(); })
                .on(E.ConnectionQualityChanged, cambioDeCalidad)
                .on(E.Reconnecting, () => anunciar("Se cortó la llamada. Reconectando…"))
                .on(E.Reconnected, () => anunciar("Volviste a la llamada."))
                .on(E.Disconnected, (motivo) => {
                    if (room !== sala) return;   // una sala vieja (un intento que falló) que terminó de cerrarse
                    dejarDeGrabar();   // la última parte se sube igual
                    dejarDeContar();   // y los últimos segundos hablados
                    audios.textContent = "";
                    sala = null;
                    paneos.clear();
                    calidad.clear();
                    dejarDeEscucharMiMicrofono();
                    if (privadoCon) { privadoCon = null; if (op.privado) op.privado(null); }
                    if (cerrandoPorElProfe) { cerrandoPorElProfe = false; mudandose = false; noVolver(); sonido(SON.sale); pintar(); return; }
                    /* Se muda de sala (otro grupo, la sala grande, las voces en su
                       lugar): entra enseguida a la que toca, sin decir «saliste».
                       También si el servidor la sacó de una sala que ya no es la
                       suya antes de que la página alcanzara a mudarse. */
                    if (abierta && quiereEstar && (mudandose || grupoQueMeToca() !== grupoActual)) {
                        mudandose = false;
                        pintar();
                        alEntrar(true);
                        return;
                    }
                    mudandose = false;
                    sonido(SON.sale);
                    const R = (LK && LK.DisconnectReason) || {};
                    const sacado = motivo === R.PARTICIPANT_REMOVED;
                    // Se cayó sin que nadie lo pidiera: vuelve sola.
                    const porSuCuenta = [R.CLIENT_INITIATED, R.PARTICIPANT_REMOVED, R.ROOM_DELETED, R.DUPLICATE_IDENTITY].includes(motivo);
                    if (quiereEstar && abierta && !porSuCuenta) { pintar(); volverALaLlamada(); return; }
                    noVolver();
                    anunciar(sacado ? "Tu profe te sacó de la llamada."
                        : motivo === R.DUPLICATE_IDENTITY ? "Saliste de la llamada: entraste con tu cuenta en otra pestaña o aparato."
                        : "Saliste de la llamada.");
                    pintar();
                    entrar.focus();
                });
        }

        const ATAJOS = {
            KeyM: alternarMic,
            // La mano de la clase (la misma presencia que el botón «Levantar la
            // mano»), dicha: el botón cambia en silencio.
            KeyY: async () => {
                if (esProfe || !op.alternarMano) return;
                const arriba = await op.alternarMano();
                // El lugar en la fila lo dice sesion.js en cuanto llega la presencia.
                anunciar(arriba ? "Levantaste la mano." : "Bajaste la mano.");
            },
            KeyQ: quienEsta,
            KeyW: quienHabla,
            KeyK: marcarMomento,
            KeyN: siguienteMano,
            KeyH: guia,
            KeyJ: dictarJugada,
            KeyT: saltar,
            // Las reacciones del alumno (Sí y No contestan la pregunta del profe, si hay una).
            Digit1: () => reaccionar("no_entendi"),
            Digit2: () => reaccionar("lento"),
            Digit3: () => reaccionar("si"),
            Digit4: () => reaccionar("no"),
        };
        document.addEventListener("keydown", (e) => {
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            // En la sala de práctica, los mismos atajos sin red.
            const accion = practicando ? PRACTICA[e.code] : ATAJOS[e.code];
            if (!accion) return;
            e.preventDefault();
            accion();
        });

        entrar.addEventListener("click", alEntrar);
        // Con «Mantener para hablar» el clic (que llega al soltar) no conmuta nada.
        mic.addEventListener("click", () => { if (practicando) { PRACTICA.KeyM(); return; } if (!ptt.checked) alternarMic(); });
        grabarBtn.addEventListener("click", alternarGrabar);
        modos.querySelectorAll("[data-modo]").forEach((b) => b.addEventListener("click", () => elegirModo(b.dataset.modo)));
        quien.addEventListener("click", quienEsta);
        habla.addEventListener("click", quienHabla);
        salirBtn.addEventListener("click", () => (practicando ? terminarPractica() : esProfe ? terminar() : salir()));
        // Cerrar la pestaña también cuelga (si no, LiveKit tarda en notar que se fue).
        window.addEventListener("pagehide", () => { noVolver(); if (sala) sala.disconnect(); });

        const atajoMano = $("llamada-atajo-mano");
        if (atajoMano) atajoMano.hidden = esProfe;
        const atajoReacciones = $("llamada-atajo-reacciones");
        if (atajoReacciones) atajoReacciones.hidden = esProfe;
        const atajoSiguiente = $("llamada-atajo-siguiente");
        if (atajoSiguiente) atajoSiguiente.hidden = !esProfe;
        // Al alumno la caja le sale cuando el profe abre la llamada (estado(true)).
        caja.hidden = !esProfe;
        pintar();
        // Un tono suelto (sesion.js: el aviso de los 10 segundos del turno).
        const tono = (nombre) => { if (SON[nombre]) { sonido(SON[nombre]); vibrar(120); } };
        return { sincronizar, salir, anunciar, estado: ponerEstado, reaccion: recibirReaccion, respuestas: ponerRespuestas, pregunta: ponerPregunta, tono,
            teLlaman, refrescar: pintarFaltan, privado: ponerPrivado };
    }

    window.ClaseLlamada = { montar, jugadaDicha };
})();

/*! rev bfb5bbb0d2d82f9f */
