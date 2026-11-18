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
    let audioCtx = null;
    function sonido(notas) {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            let t = audioCtx.currentTime;
            for (const f of notas) {
                const osc = audioCtx.createOscillator();
                const gan = audioCtx.createGain();
                osc.frequency.value = f;
                gan.gain.setValueAtTime(0.0001, t);
                gan.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
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
        debil: [262, 262], apagado: [440, 440] };
    // En el celular, además, vibra (si el aparato puede): se nota sin audífonos.
    function vibrar(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* sin vibración */ } }

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
            if (p.isSpeaking) d.push("hablando");
            return d;
        }

        function pintarGente() {
            const filas = enLlamada() ? enOrden() : [];
            gente.hidden = !filas.length;
            lista.textContent = "";
            if (!filas.length) return;
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
        }

        function pintar() {
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
                for (const pub of p.audioTrackPublications.values()) if (pub.track) pub.track.setVolume(v);
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
            anunciar("En la llamada hay " + (otros.length + 1) + " contigo: " + partes.join("; ") + ".");
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
            const ahora = new Set(pistasDeAudio());
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
            } else if (!abierta && (antes || !caja.hidden)) {
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
                    sonido(SON.entra);
                    anunciar((grupoActual ? "Entró al grupo " : "Entró a la llamada ") + nombreDe(p) + (esElProfe(p) ? ", el profe" : "") + ".");
                    pintarGente(); refrescarPermisos(); acomodarVoces();
                })
                .on(E.ParticipantDisconnected, (p) => {
                    sonido(SON.sale);
                    anunciar((grupoActual ? "Salió del grupo " : "Salió de la llamada ") + nombreDe(p) + ".");
                    paneos.delete(p.identity);
                    calidad.delete(p.identity);
                    pintarGente(); acomodarVoces();
                })
                // Quién habla cambia a cada rato: solo se repinta la lista (no se anuncia).
                .on(E.ActiveSpeakersChanged, anotarQuienHabla)
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
                .on(E.LocalTrackPublished, () => { acomodarFuentes(); pintar(); })
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
        };
        document.addEventListener("keydown", (e) => {
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            const accion = ATAJOS[e.code];
            if (!accion) return;
            e.preventDefault();
            accion();
        });

        entrar.addEventListener("click", alEntrar);
        // Con «Mantener para hablar» el clic (que llega al soltar) no conmuta nada.
        mic.addEventListener("click", () => { if (!ptt.checked) alternarMic(); });
        grabarBtn.addEventListener("click", alternarGrabar);
        modos.querySelectorAll("[data-modo]").forEach((b) => b.addEventListener("click", () => elegirModo(b.dataset.modo)));
        quien.addEventListener("click", quienEsta);
        habla.addEventListener("click", quienHabla);
        salirBtn.addEventListener("click", () => (esProfe ? terminar() : salir()));
        // Cerrar la pestaña también cuelga (si no, LiveKit tarda en notar que se fue).
        window.addEventListener("pagehide", () => { noVolver(); if (sala) sala.disconnect(); });

        const atajoMano = $("llamada-atajo-mano");
        if (atajoMano) atajoMano.hidden = esProfe;
        // Al alumno la caja le sale cuando el profe abre la llamada (estado(true)).
        caja.hidden = !esProfe;
        pintar();
        return { sincronizar, salir, anunciar, estado: ponerEstado };
    }

    window.ClaseLlamada = { montar };
})();

/*! rev bfb5bbb0d2d82f9f */
