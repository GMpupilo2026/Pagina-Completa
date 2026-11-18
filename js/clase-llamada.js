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
     Alt+M micrófono · Alt+Y la mano (alumno) · Alt+Q quién está · Alt+W quién habla */
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
    const SON = { entra: [523, 784], sale: [784, 523], palabra: [659, 784, 988] };

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
        const quien = $("llamada-quien");
        const habla = $("llamada-habla");
        const salirBtn = $("llamada-salir");
        const audios = $("llamada-audios");
        const gente = $("llamada-gente");
        const genteTitulo = $("llamada-gente-titulo");
        const lista = $("llamada-lista");
        let sala = null;
        let entrando = false;
        let LK = null;
        // ¿El profe abrió la llamada en esta clase? Lo dice sesion.js con estado().
        let abierta = false;
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
            const encendido = micEncendido();
            mic.setAttribute("aria-pressed", String(encendido));
            mic.textContent = encendido ? "🎙️ Micrófono encendido" : "🔇 Micrófono apagado";
        }

        /* La voz de la página («Activar voz», el recuadro adaptado) dice las
           jugadas con speechSynthesis: mientras habla, la llamada baja, para que
           la voz del profe no tape la jugada. */
        function volumenDeLaLlamada(v) {
            if (!sala) return;
            for (const p of sala.remoteParticipants.values()) {
                for (const pub of p.audioTrackPublications.values()) if (pub.track) pub.track.setVolume(v);
            }
        }
        if (window.speechSynthesis && !window.speechSynthesis.__llamada) {
            const original = window.speechSynthesis.speak.bind(window.speechSynthesis);
            window.speechSynthesis.speak = function (u) {
                try {
                    if (enLlamada() && u) {
                        volumenDeLaLlamada(0.3);
                        const volver = () => setTimeout(() => { if (!window.speechSynthesis.speaking) volumenDeLaLlamada(1); }, 150);
                        u.addEventListener("end", volver);
                        u.addEventListener("error", volver);
                    }
                } catch (e) { /* nunca romper la voz por la llamada */ }
                return original(u);
            };
            window.speechSynthesis.__llamada = true;
        }

        async function pedir(accion) {
            const { data, error } = await sb.functions.invoke("clase-llamada", { body: { accion, profesor: profesorId } });
            if (error) throw new Error(await mensajeDe(error, "No se pudo entrar a la llamada."));
            return data;
        }

        async function alEntrar() {
            if (entrando || enLlamada()) return;
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
                }
                const [lk, pase] = await Promise.all([cargarLibreria(), pedir("pase")]);
                LK = lk;
                sala = new LK.Room({
                    adaptiveStream: true,
                    dynacast: true,
                    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    // DTX: nada en los silencios. RED: cada paquete viaja también en
                    // el siguiente, para que una conexión mala no corte palabras.
                    publishDefaults: { dtx: true, red: true },
                });
                escuchar(sala);
                await sala.connect(pase.url, pase.token);
                await sala.startAudio();   // el toque de «Entrar» deja sonar el audio
                sonido(SON.entra);
                const otros = sala.remoteParticipants.size;
                anunciar("Entraste a la llamada" + (otros ? "; hay " + otros + (otros === 1 ? " persona más" : " personas más") : "; todavía estás solo") + ". "
                    + (esProfe ? "Enciende el micrófono con Alt M."
                        : pase.puede_hablar ? "Tienes la palabra: enciende el micrófono con Alt M."
                        : "Para hablar, levanta la mano con Alt Y."));
                if (esProfe) sincronizar();
                pintar();
                mic.focus();
            } catch (e) {
                console.error(e);
                anunciar(e.message || "No se pudo entrar a la llamada.");
                if (sala) { try { await sala.disconnect(); } catch (_) { /* nada */ } }
                sala = null;
                pintar();
            } finally {
                entrando = false;
                entrar.disabled = false;
                pintar();
            }
        }

        async function alternarMic() {
            if (!enLlamada()) { anunciar("Primero entra a la llamada."); return; }
            if (!micEncendido() && !puedoHablar()) {
                anunciar(esProfe ? "Todavía no puedes encender el micrófono." : "Todavía no tienes la palabra. Levanta la mano con Alt Y.");
                return;
            }
            try {
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

        function quienEsta() {
            if (!enLlamada()) { anunciar("No estás en la llamada."); return; }
            const otros = enOrden().filter((f) => !f.yo).map((f) => f.p);
            if (!otros.length) { anunciar("Estás solo en la llamada."); return; }
            const partes = otros.map((p) => nombreDe(p) + (esElProfe(p) ? ", el profe" : tienePalabra(p) ? ", con la palabra" : ""));
            anunciar("En la llamada hay " + (otros.length + 1) + " contigo: " + partes.join("; ") + ".");
        }

        function quienHabla() {
            if (!enLlamada()) { anunciar("No estás en la llamada."); return; }
            const hablan = sala.activeSpeakers.filter((p) => p.isSpeaking);
            if (!hablan.length) { anunciar("Nadie está hablando."); return; }
            anunciar("Está hablando " + hablan.map((p) => (p === sala.localParticipant ? "tú" : nombreDe(p))).join(" y ") + ".");
        }

        async function salir() {
            if (sala) { try { await sala.disconnect(); } catch (e) { console.error(e); } }
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
            await sincronizar();
            await salir();
            anunciar("Terminaste la llamada para toda la clase.");
            pintar();
        }

        /* Lo que dice game_state: si el profe abrió la llamada en esta clase
           (sesion.js lo llama como `llamada.estado(…)`). */
        function ponerEstado(abiertaAhora) {
            const antes = abierta;
            abierta = Boolean(abiertaAhora);
            if (esProfe) { pintar(); return; }
            if (abierta && !antes) {
                caja.hidden = false;
                pintar();
                sonido(SON.entra);
                anunciar("Tu profe abrió la llamada de la clase: entra con «Entrar a la llamada».");
            } else if (!abierta && (antes || !caja.hidden)) {
                const estabaDentro = Boolean(sala);
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
                .on(E.ParticipantConnected, (p) => { sonido(SON.entra); anunciar("Entró a la llamada " + nombreDe(p) + (esElProfe(p) ? ", el profe" : "") + "."); pintarGente(); })
                .on(E.ParticipantDisconnected, (p) => { sonido(SON.sale); anunciar("Salió de la llamada " + nombreDe(p) + "."); pintarGente(); })
                // Quién habla cambia a cada rato: solo se repinta la lista (no se anuncia).
                .on(E.ActiveSpeakersChanged, pintarGente)
                .on(E.TrackSubscribed, (track) => { if (track.kind === "audio") audios.appendChild(track.attach()); })
                .on(E.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); })
                .on(E.ParticipantPermissionsChanged, (antes, p) => {
                    pintarGente();   // «con la palabra» en la lista, también de los demás
                    if (p !== room.localParticipant || esProfe) return;
                    const ahora = Boolean(p.permissions && p.permissions.canPublish);
                    if (ahora === Boolean(antes && antes.canPublish)) return;
                    if (ahora) { sonido(SON.palabra); anunciar("Tu profe te dio la palabra: enciende el micrófono con Alt M."); }
                    else anunciar("Se terminó tu turno: tu micrófono se apagó.");
                    pintar();
                })
                .on(E.LocalTrackPublished, pintar)
                .on(E.LocalTrackUnpublished, pintar)
                .on(E.ConnectionQualityChanged, (calidad, p) => {
                    if (p === room.localParticipant && calidad === LK.ConnectionQuality.Poor) anunciar("Tu conexión está mala: puede que se corte la voz.");
                })
                .on(E.Reconnecting, () => anunciar("Se cortó la llamada. Reconectando…"))
                .on(E.Reconnected, () => anunciar("Volviste a la llamada."))
                .on(E.Disconnected, (motivo) => {
                    sonido(SON.sale);
                    audios.textContent = "";
                    sala = null;
                    if (cerrandoPorElProfe) { cerrandoPorElProfe = false; pintar(); return; }
                    anunciar(LK && motivo === LK.DisconnectReason.PARTICIPANT_REMOVED ? "Tu profe te sacó de la llamada." : "Saliste de la llamada.");
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
                anunciar(arriba ? "Levantaste la mano: tu profe la ve en su lista." : "Bajaste la mano.");
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
        mic.addEventListener("click", alternarMic);
        quien.addEventListener("click", quienEsta);
        habla.addEventListener("click", quienHabla);
        salirBtn.addEventListener("click", () => (esProfe ? terminar() : salir()));
        // Cerrar la pestaña también cuelga (si no, LiveKit tarda en notar que se fue).
        window.addEventListener("pagehide", () => { if (sala) sala.disconnect(); });

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
