/* El código de variante.html.

   Vivía escrito dentro de la página, en un <script> de 27 KB. Se mudó acá
   tal cual, sin tocar una línea (herramientas/mudar-script.py): así el
   navegador lo guarda en caché aparte, y es un paso hacia sacar
   'unsafe-inline' de la CSP. Es un script clásico cargado en el mismo lugar
   donde estaba el bloque: corre en el mismo orden y sus let/const de arriba
   siguen siendo globales. Ver «El código de las páginas sale del HTML» en
   docs/decisiones/sitio-e-infraestructura.md. */

        let session = null, profile = null, isTeacher = false, room = null, myColor = null, board = null, engine = null;
        const ROOM_ID = new URLSearchParams(window.location.search).get("room");
        const playerNames = {}; // id -> nombre para mostrar

        // Las modalidades que atiende esta página (su descripción corta está en js/juegos-comun.js).
        const MODALIDADES = {
            abrazos: {
                titulo: "🤗 Ajedrez de abrazos",
                reglas: [
                    "Nadie captura. Cuando una de tus piezas llega a la casilla de una pieza rival, las dos <strong>se abrazan</strong> y forman una unidad que pasa a ser tuya.",
                    "Una unidad mueve con las reglas de <strong>cualquiera</strong> de las piezas que la forman: caballo y torre juntos saltan como caballo o se deslizan como torre. Si abraza a otra pieza, la suma también. Un peón que llega a la última fila se vuelve dama.",
                    "No hay jaque ni mate: <strong>gana quien abraza a la unidad que lleva al rey rival</strong>. Cuida tu rey: cualquier unidad rival que pueda llegar a su casilla lo abraza y termina la partida.",
                    "Anotación: CTc3♥d5 = la unión de caballo y torre de c3 abrazó en d5; Cb1-c3 = movimiento simple.",
                ],
            },
            camaleon: {
                titulo: "🦎 Camaleón",
                reglas: [
                    "Cada pieza mueve como la pieza que empieza la partida en la <strong>columna donde está</strong>: en <strong>a</strong> y <strong>h</strong> como torre, en <strong>b</strong> y <strong>g</strong> como caballo, en <strong>c</strong> y <strong>f</strong> como alfil, en <strong>d</strong> como dama y en <strong>e</strong> como rey. Al cambiar de columna cambia de forma de mover; en cada casilla te decimos cómo mueve.",
                    "Los <strong>peones</strong> mueven siempre como peones (y coronan a dama). El rey también cambia de movimiento según su columna. No hay enroque ni captura al paso.",
                    "Se captura, hay jaque y se gana por <strong>jaque mate</strong> con estos movimientos; sin jugadas legales y sin jaque, tablas.",
                    "Ejemplo: Ch3 (el caballo, en la columna h, ahora mueve como torre) · Txh7 (esa misma pieza sube por la columna y captura) · si vuelve a la columna c, mueve como alfil.",
                ],
            },
            ciegas: {
                titulo: "🙈 A ciegas",
                reglas: [
                    "Ajedrez normal, pero <strong>sin ver las piezas</strong>: el tablero se muestra vacío y cada jugada se <strong>escribe</strong> en el panel (Cf3, g1f3; enroque 0-0).",
                    "La jugada del rival aparece escrita frente al tablero durante <strong>10 segundos</strong> y después desaparece. Si escribes una jugada ilegal, el panel te avisa y no cuenta.",
                    "Cada jugador tiene <strong>5 oportunidades</strong> de desbloquear la planilla de jugadas durante <strong>20 segundos</strong> para repasar; luego se vuelve a ocultar.",
                    "Se gana por jaque mate como siempre. Al terminar la partida, el tablero y la planilla se muestran completos.",
                ],
            },
            vampiro: {
                titulo: "🧛 Ajedrez Vampiro",
                reglas: [
                    "Ajedrez de toda la vida: las piezas mueven con sus reglas normales. La diferencia está solo en las capturas.",
                    "Cuando una pieza <strong>captura</strong> a una rival, se <strong>transforma</strong> en el tipo de pieza que acaba de capturar — conservando <strong>su propio color</strong>. Un caballo que captura un alfil se vuelve alfil; una torre que captura una dama se vuelve dama; ¡hasta un peón puede terminar siendo una torre!",
                    "El <strong>rey nunca se transforma</strong>: si captura una pieza, sigue siendo rey (si no, dejaría de haber rey en el tablero).",
                    "Si un peón <strong>corona capturando</strong> en la última fila, gana la transformación de Vampiro: se convierte en lo que capturó, no en dama.",
                    "Se captura, hay jaque y se gana por <strong>jaque mate</strong> como siempre, ya con las piezas transformadas.",
                    "Anotación: Cxb5=A (el caballo capturó en b5 y se transformó en alfil); cxb8=T+ (el peón coronó capturando una torre y dio jaque).",
                ],
            },
            volcanes: {
                titulo: "🌋 Volcanes",
                reglas: [
                    "Ajedrez de toda la vida, con un peligro más: <strong>los volcanes</strong>. Cada 6 jugadas (contando las de los dos), uno hace erupción en una casilla del medio del tablero, y <strong>la pieza que esté ahí se pierde</strong>, sea de quien sea.",
                    "El volcán se <strong>anuncia 4 jugadas antes</strong>: la casilla se marca en rojo con 🌋 y el número de jugadas que faltan, y arriba del tablero se dice cuál es. Hay tiempo de quitarse… o de llevar al rival hacia ahí.",
                    "El primero hace erupción al llegar a la jugada 10 (la quinta de cada uno), y después uno cada 6.",
                    "Si en el volcán está <strong>un rey, ese bando pierde</strong>. Y si la erupción le quita a tu rey la pieza que lo tapaba de un ataque justo después de tu jugada, tu rey queda indefenso y también pierdes: es como dejarlo en jaque.",
                    "Por lo demás, jaque mate de siempre. En la planilla, «Cf3 🌋d5×A» quiere decir que después de Cf3 hizo erupción el volcán de d5 y se llevó un alfil.",
                ],
            },
            misiones: {
                titulo: "🎯 Misiones secretas",
                reglas: [
                    "Ajedrez de toda la vida, pero cada uno recibe una <strong>misión secreta</strong> que el rival no ve: por ejemplo, «pon una torre en tu séptima fila» o «deja al rival sin caballos».",
                    "Ganas por jaque mate, como siempre, <strong>o si al llegar tu turno tu misión está cumplida</strong>: la cumpliste con tu jugada y tu rival no pudo (o no supo) deshacerla.",
                    "Cuando tu rival tiene su misión cumplida, te avisamos: <strong>esa jugada es tu única oportunidad</strong> de deshacerla. No sabes cuál es, así que hay que adivinar su plan por lo que viene haciendo.",
                    "Las filas se cuentan desde cada bando: la «sexta fila» de las negras es la tercera del tablero.",
                    "Al terminar la partida se destapan las dos misiones.",
                ],
            },
        };
        let mod = null;

        // ---- Volcanes ----
        const NOMBRE_LETRA = { R: "el rey", D: "una dama", T: "una torre", A: "un alfil", C: "un caballo", P: "un peón" };
        function pintarVolcan() {
            const el = document.getElementById("volcan-info");
            if (!room || room.variant !== "volcanes") { el.hidden = true; return; }
            el.hidden = false;
            const ultima = (room.moves || [])[(room.moves || []).length - 1] || "";
            const m = ultima.match(/🌋([a-h][1-8])(?:×([RDTACP]))?/);
            let texto = m ? "💥 Hizo erupción el volcán de " + m[1] + (m[2] ? " y se llevó " + NOMBRE_LETRA[m[2]] + ". " : ", pero la casilla estaba vacía. ") : "";
            if (room.status !== "playing") { el.textContent = texto.trim() || "🌋 La partida terminó."; return; }
            const p = engine.proximo();
            if (p && p.anunciado) {
                texto += "🌋 Próximo volcán: " + p.casilla + ". Hace erupción " + (p.faltan === 1 ? "después de la próxima jugada" : "dentro de " + p.faltan + " jugadas") + ": la pieza que esté ahí se pierde.";
            } else if (p) {
                const en = p.faltan - Variantes.Volcanes.AVISO;
                texto += "🌋 El próximo volcán se anuncia " + (en === 1 ? "después de la próxima jugada." : "dentro de " + en + " jugadas.");
            }
            el.textContent = texto;
        }

        // ---- Misiones secretas ----
        /* misionMia: la de quien juega (la reparte y la devuelve la base).
           misiones: las dos, cuando la base deja verlas (al terminar, o a quien
           da clase). La del rival nunca pasa por esta pantalla mientras se
           juega: la esconde la RLS de misiones_secretas. */
        let misionMia = null, misiones = null, reclamando = false;
        async function cargarMisiones() {
            if (!room || room.variant !== "misiones") return;
            if (myColor && room.status === "playing" && !misionMia) {
                const { data, error } = await sb.rpc("repartir_misiones", { p_sala: ROOM_ID });
                if (error) console.error(error);
                else misionMia = data;
            }
            if (!myColor || room.status !== "playing") {
                const { data, error } = await sb.from("misiones_secretas").select("color, mision").eq("sala_id", ROOM_ID);
                if (error) console.error(error);
                misiones = {};
                (data || []).forEach((r) => { misiones[r.color] = r.mision; });
                if (myColor && misiones[myColor]) misionMia = misiones[myColor];
            }
            pintarMision();
            revisarMision();
        }
        function amenazaDe(color) { return !!(room.variant_state && room.variant_state.amenaza && room.variant_state.amenaza[color]); }
        function pintarMision() {
            const panel = document.getElementById("mision-panel");
            if (!room || room.variant !== "misiones") { panel.hidden = true; return; }
            panel.hidden = false;
            const titulo = document.getElementById("mision-titulo"), texto = document.getElementById("mision-texto"), estado = document.getElementById("mision-estado");
            const nombreMision = (id) => { const m = MisionesSecretas.buscar(id); return m ? m.titulo + ": " + m.texto.charAt(0).toLowerCase() + m.texto.slice(1) : "—"; };
            if (room.status !== "playing" || !myColor) {
                const hay = misiones && (misiones.w || misiones.b);
                titulo.textContent = room.status === "playing" ? "Las misiones de esta partida" : "Las misiones, destapadas";
                texto.textContent = hay
                    ? "Blancas — " + nombreMision(misiones.w) + " Negras — " + nombreMision(misiones.b)
                    : (room.status === "playing" ? "Las misiones son secretas: se destapan cuando termina la partida." : "Esta partida no llegó a repartir misiones.");
                estado.textContent = "";
                return;
            }
            const m = MisionesSecretas.buscar(misionMia);
            titulo.textContent = m ? "Tu misión secreta: " + m.titulo : "Tu misión secreta";
            texto.textContent = m ? m.texto : "Repartiendo las misiones…";
            const rival = myColor === "w" ? "b" : "w";
            const miTurno = engine.turn() === myColor;
            if (m && !miTurno && MisionesSecretas.cumple(misionMia, engine.game, myColor)) {
                estado.textContent = "✅ ¡Tu misión está cumplida! Si sigue así cuando vuelva tu turno, ganas.";
            } else if (miTurno && amenazaDe(rival) && bothReady(room)) {
                estado.textContent = "⚠️ Tu rival tiene su misión cumplida: si no la deshaces con esta jugada, gana.";
            } else {
                estado.textContent = "";
            }
        }
        /* Al llegar el turno propio con la misión cumplida, se gana. Solo sobre
           la posición guardada (`fen`) y con la partida en juego: si mientras
           tanto pasó otra cosa (una bandera, una rendición), no la pisa. */
        async function revisarMision() {
            if (!room || room.variant !== "misiones" || !myColor || !misionMia || reclamando || jugadaEnVuelo) return;
            if (room.status !== "playing" || !bothReady(room) || engine.turn() !== myColor) return;
            if (!MisionesSecretas.cumple(misionMia, engine.game, myColor)) return;
            reclamando = true;
            const estado = Object.assign({}, room.variant_state || {}, { fin: { motivo: "mision", color: myColor, mision: misionMia } });
            const { data, error } = await sb.from("game_rooms")
                .update({ status: "finished", result: myColor === "w" ? "white" : "black", variant_state: estado, updated_at: new Date().toISOString() })
                .eq("id", ROOM_ID).eq("status", "playing").eq("fen", room.fen).select("*");
            reclamando = false;
            if (error || !data || !data.length) {
                if (error) console.error(error);
                await releerSala(error ? "No se pudo cobrar la misión: " + error.message : null);
                return;
            }
            room = SalaJuego.laMasNueva(room, data[0]);
            board.setInteractive(false);
            updateStatusText();
            await cargarMisiones();
        }

        // ---- La jugada escrita (Volcanes y Misiones) ----
        function conJugadaEscrita() { return !!room && (room.variant === "volcanes" || room.variant === "misiones") && !!myColor; }
        function pintarJugadaEscrita() {
            const form = document.getElementById("jugada-form");
            form.hidden = !conJugadaEscrita() || room.status !== "playing";
            const miTurno = room.status === "playing" && bothReady(room) && engine.turn() === myColor;
            document.getElementById("jugada-input").disabled = !miTurno;
            document.getElementById("jugada-jugar").disabled = !miTurno;
        }
        document.getElementById("jugada-form").addEventListener("submit", (ev) => {
            ev.preventDefault();
            if (!conJugadaEscrita() || room.status !== "playing" || !bothReady(room) || engine.turn() !== myColor) return;
            const input = document.getElementById("jugada-input"), msg = document.getElementById("jugada-msg");
            const texto = input.value.trim();
            if (!texto) return;
            const dicho = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
            const r = engine.moveText(dicho === "enroque corto" ? "O-O" : dicho === "enroque largo" ? "O-O-O" : texto);
            if (!r) { msg.textContent = window.ComandosTablero ? ComandosTablero.noSePudoJugar(texto) : "“" + texto + "” no es una jugada legal en esta posición."; input.select(); return; }
            input.value = "";
            msg.textContent = "Jugaste " + r.san + ".";
            board.render();
            handleLocalMove(Object.assign({ fen: engine.serialize() }, r));
        });

        // Lo que cambia en las dos con cada versión de la sala.
        function pintarExtras() {
            pintarVolcan();
            pintarMision();
            pintarJugadaEscrita();
        }

        // ---- A ciegas ----
        let ciegasTimer = null, ciegasUnlockTimer = null, ciegasUnlocked = false;
        function ciegasEsJugador() { return mod && room.variant === "ciegas" && !!myColor; }
        function ciegasOculto() { return ciegasEsJugador() && room.status === "playing"; }
        function ciegasDesbloqueosRestantes() {
            const st = room.variant_state || {};
            const k = myColor === "w" ? "w_unlocks" : "b_unlocks";
            return typeof st[k] === "number" ? st[k] : 5;
        }
        function ciegasMostrarUltima(texto, propia) {
            const box = document.getElementById("ciegas-ultima"), t = document.getElementById("ciegas-ultima-texto");
            if (!ciegasOculto()) return;
            box.classList.remove("hidden");
            t.textContent = (propia ? "Tu jugada: " : "Rival: ") + texto;
            if (ciegasTimer) clearTimeout(ciegasTimer);
            ciegasTimer = setTimeout(() => { t.textContent = "—"; }, 10000);
        }
        function ciegasActualizarPanel() {
            const panel = document.getElementById("ciegas-panel");
            if (!ciegasEsJugador()) { panel.classList.add("hidden"); return; }
            panel.classList.remove("hidden");
            const jugando = room.status === "playing" && bothReady(room);
            const miTurno = jugando && engine.turn() === myColor;
            document.getElementById("ciegas-input").disabled = !miTurno;
            document.getElementById("ciegas-jugar").disabled = !miTurno;
            const restan = ciegasDesbloqueosRestantes();
            const b = document.getElementById("ciegas-desbloquear");
            b.textContent = "👁️ Ver la planilla 20 s (quedan " + restan + ")";
            b.disabled = !jugando || restan <= 0 || ciegasUnlocked;
            if (room.status !== "playing") { panel.classList.add("hidden"); }
        }
        async function ciegasDesbloquear() {
            if (!ciegasOculto() || ciegasUnlocked) return;
            const restan = ciegasDesbloqueosRestantes();
            if (restan <= 0) return;
            const k = myColor === "w" ? "w_unlocks" : "b_unlocks";
            const st = Object.assign({ w_unlocks: 5, b_unlocks: 5 }, room.variant_state || {}, { [k]: restan - 1 });
            const { error } = await sb.from("game_rooms").update({ variant_state: st }).eq("id", ROOM_ID);
            if (error) { document.getElementById("ciegas-msg").textContent = "No se pudo desbloquear: " + error.message; return; }
            room = Object.assign({}, room, { variant_state: st });
            ciegasUnlocked = true;
            renderMoveHistory(room.moves);
            ciegasActualizarPanel();
            document.getElementById("ciegas-msg").textContent = "Planilla visible 20 segundos. Te quedan " + (restan - 1) + " desbloqueos.";
            if (ciegasUnlockTimer) clearTimeout(ciegasUnlockTimer);
            ciegasUnlockTimer = setTimeout(() => {
                ciegasUnlocked = false;
                renderMoveHistory(room.moves);
                ciegasActualizarPanel();
                document.getElementById("ciegas-msg").textContent = "La planilla volvió a ocultarse.";
            }, 20000);
        }
        document.getElementById("ciegas-desbloquear").addEventListener("click", ciegasDesbloquear);
        document.getElementById("ciegas-form").addEventListener("submit", (ev) => {
            ev.preventDefault();
            if (!ciegasEsJugador() || room.status !== "playing" || !bothReady(room) || engine.turn() !== myColor) return;
            const input = document.getElementById("ciegas-input"), msg = document.getElementById("ciegas-msg");
            const texto = input.value.trim();
            if (!texto) return;
            // «enroque corto/largo», como se dice en voz; el motor solo entiende «O-O».
            const dicho = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
            const r = engine.moveText(dicho === "enroque corto" ? "O-O" : dicho === "enroque largo" ? "O-O-O" : texto);
            /* «no es una jugada legal» solo si lo escrito ES una jugada; si no
               («hola»), que no se entendió (ComandosTablero.noSePudoJugar). */
            if (!r) { msg.textContent = window.ComandosTablero ? ComandosTablero.noSePudoJugar(texto) : "\u201c" + texto + "\u201d no es una jugada legal en esta posición."; input.select(); return; }
            input.value = ""; msg.textContent = "";
            board.render();
            ciegasMostrarUltima(r.san, true);
            handleLocalMove(Object.assign({ fen: engine.serialize() }, r));
        });

        function setStatus(text) {
            document.getElementById("status-banner").textContent = text;
        }

        function showError(text) {
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("error-text").textContent = text;
            document.getElementById("error-state").classList.remove("hidden");
        }

        function nameFor(id) {
            return playerNames[id] || "Alumno";
        }

        // El reloj (si la partida tiene uno) no debe arrancar hasta que blancas Y negras
        // hayan entrado y confirmado que están listas — antes arrancaba desde el momento
        // en que el profesor creaba la partida, corriendo en vacío mientras los alumnos
        // ni siquiera habían abierto la página.
        function bothReady(row) {
            return !!(row.white_ready && row.black_ready);
        }

        function updateStatusText() {
            document.getElementById("top-player").textContent = nameFor(myColor === "b" ? room.white_id : room.black_id) + (myColor === "b" ? " (blancas)" : " (negras)");
            document.getElementById("bottom-player").textContent = myColor
                ? nameFor(profile.id) + (myColor === "w" ? " (blancas) — tú" : " (negras) — tú")
                : nameFor(room.white_id) + " (blancas)";
            if (!myColor) {
                document.getElementById("top-player").textContent = nameFor(room.black_id) + " (negras)";
            }
            document.getElementById("resign-btn").classList.toggle("hidden", !myColor || room.status !== "playing");

            const readyBtn = document.getElementById("ready-btn");
            const myReady = myColor === "w" ? room.white_ready : myColor === "b" ? room.black_ready : true;
            const waitingToStart = room.status === "playing" && !bothReady(room);
            readyBtn.classList.toggle("hidden", !myColor || room.status !== "playing" || myReady);

            if (room.status === "finished") {
                let resultText = room.result === "draw" ? "Tablas." : (room.result === "white" ? nameFor(room.white_id) + " ganó con blancas." : nameFor(room.black_id) + " ganó con negras.");
                // Cómo se ganó, cuando no fue de la forma de siempre.
                const fin = room.variant_state && room.variant_state.fin;
                if (fin && fin.motivo === "mision") {
                    const m = window.MisionesSecretas && MisionesSecretas.buscar(fin.mision);
                    resultText = resultText.replace(/\.$/, "") + ", cumpliendo su misión secreta" + (m ? " («" + m.titulo + "»)." : ".");
                } else if (fin && fin.motivo === "volcan") {
                    resultText = "El rey cayó en el volcán. " + resultText;
                } else if (fin && fin.motivo === "expuesto") {
                    resultText = "El volcán dejó al rey sin protección. " + resultText;
                }
                setStatus("Partida terminada — " + resultText);
            } else if (waitingToStart) {
                if (!myColor) {
                    setStatus("Esperando a que " + nameFor(room.white_id) + " y " + nameFor(room.black_id) + " confirmen que están listos…");
                } else if (myReady) {
                    setStatus("Ya confirmaste que estás listo — esperando a " + nameFor(myColor === "w" ? room.black_id : room.white_id) + "…");
                } else {
                    setStatus("Toca \"Estoy listo\" cuando puedas empezar a jugar" + (room.initial_seconds != null ? " — el reloj arranca cuando ambos estén listos." : "."));
                }
            } else if (!myColor) {
                setStatus("Estás mirando esta partida — solo pueden mover " + nameFor(room.white_id) + " y " + nameFor(room.black_id) + ".");
            } else {
                const myTurn = engine.turn() === myColor;
                const jaque = engine.inCheck() ? " ¡Jaque!" : "";
                setStatus((myTurn ? "Es tu turno." + jaque : "Esperando la jugada de " + nameFor(myColor === "w" ? room.black_id : room.white_id) + "…") + (room.variant === "ciegas" && myTurn ? " Escribe tu jugada en el panel." : ""));
            }
        }

        document.getElementById("ready-btn").addEventListener("click", async () => {
            if (!myColor || room.status !== "playing") return;
            const { cambio, error } = await SalaJuego.marcarListo(room, ROOM_ID, myColor);
            if (error) { setStatus("No se pudo confirmar: " + error.message); return; }
            room = Object.assign({}, room, cambio);
            board.setInteractive(!!myColor && room.status === "playing" && bothReady(room) && room.variant !== "ciegas");
            if (room.variant === "ciegas") ciegasActualizarPanel();
            updateStatusText();
            pintarExtras();
            renderClocks();
            revisarMision();
        });

        // ---- Reloj (tiempo asignado a cada jugador) ----
        // El servidor no recibe un "tick" cada segundo: solo guarda cuántos segundos
        // le quedaban a cada color la última vez que se "congeló" su reloj (crear la
        // partida o su propia jugada) más desde cuándo corre el reloj de quien tiene
        // el turno ahora (clock_updated_at). El navegador calcula el tiempo restante
        // real restando el tiempo transcurrido desde entonces — así todos los que
        // miran la partida ven el mismo reloj sin sobrecargar la base de datos.
        function formatClock(seconds) { return SalaJuego.formatear(seconds); }

        function liveTimeLeft(color) { return SalaJuego.restante(room, color, SalaJuego.turnoDe(room)); }

        // El reloj y su rótulo dicho son de js/sala-juego.js (una sola copia).
        function renderClocks() {
            SalaJuego.pintarRelojes(room, { miColor: myColor, turno: SalaJuego.turnoDe(room), nombreDe: (c) => nameFor(c === "w" ? room.white_id : room.black_id) });
        }

        // Si a quien le toca mover se le acabó el reloj, declara ganador al rival.
        // El filtro .eq("status", "playing") evita que dos navegadores (por ejemplo
        // ambos jugadores, o un jugador y el profesor mirando) dupliquen el resultado
        // si detectan el mismo cero casi al mismo tiempo.
        function checkFlagFall() { return SalaJuego.revisarBandera(room, ROOM_ID, SalaJuego.turnoDe(room)); }

        setInterval(() => {
            if (!room || !board) return;
            renderClocks();
            checkFlagFall();
        }, 250);

        function renderMoveHistory(moves) {
            const listEl = document.getElementById("moves-list");
            const emptyEl = document.getElementById("moves-empty");
            const hiddenEl = document.getElementById("moves-hidden");
            if (ciegasOculto() && !ciegasUnlocked) {
                hiddenEl.classList.remove("hidden"); emptyEl.classList.add("hidden"); listEl.classList.add("hidden"); listEl.classList.remove("flex");
                return;
            }
            hiddenEl.classList.add("hidden");
            if (!moves || !moves.length) {
                emptyEl.classList.remove("hidden");
                listEl.classList.add("hidden");
                return;
            }
            emptyEl.classList.add("hidden");
            listEl.classList.remove("hidden");
            listEl.classList.add("flex");
            listEl.innerHTML = "";
            for (let i = 0; i < moves.length; i += 2) {
                const li = document.createElement("li");
                const num = Math.floor(i / 2) + 1;
                li.textContent = num + ". " + moves[i] + (moves[i + 1] ? " " + moves[i + 1] : "");
                listEl.appendChild(li);
            }
        }

        function showPromotionPicker(from, to, callback) {
            const modal = document.getElementById("promotion-modal");
            const optionsEl = document.getElementById("promotion-options");
            optionsEl.innerHTML = "";
            const pieces = [["q", "♛"], ["r", "♜"], ["b", "♝"], ["n", "♞"]];
            let resolved = false;
            function finish(piece) {
                if (resolved) return;
                resolved = true;
                modal.classList.add("hidden");
                callback(piece);
            }
            pieces.forEach(([type, glyph]) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "w-12 h-12 text-3xl rounded-lg border-2 border-brand-200 dark:border-brand-700 hover:border-accent-500 bg-white dark:bg-brand-800 transition-colors";
                btn.textContent = glyph;
                btn.addEventListener("click", () => finish(type));
                optionsEl.appendChild(btn);
            });
            modal.classList.remove("hidden");
        }

        // La posición de la jugada propia que se está guardando (ver handleLocalMove).
        let jugadaEnVuelo = null;

        async function handleLocalMove(info) {
            const newMoves = (room.moves || []).concat([info.san]);
            const patch = { fen: info.fen, moves: newMoves, updated_at: new Date().toISOString() };
            if (room.initial_seconds != null) {
                // Solo quien tiene el turno puede mover (ver _canActNow en
                // CrazyhouseBoard), así que myColor es siempre quien acaba de jugar.
                // Se "congela" su reloj: se le resta lo que pasó desde la última vez
                // que arrancó a correr y se le suma el incremento tipo Fischer.
                const storedKey = myColor === "w" ? "white_time_left" : "black_time_left";
                const elapsed = room.clock_updated_at ? RelojServidor.desde(room.clock_updated_at) : 0;
                const remaining = Math.max(0, (room[storedKey] || 0) - elapsed) + (room.increment_seconds || 0);
                patch[storedKey] = remaining;
                patch.clock_updated_at = new Date().toISOString();
            }
            if (info.gameOver) {
                patch.status = "finished";
                patch.result = info.result;
                // Volcanes: si la partida la terminó un volcán, queda dicho cómo.
                if (info.erupcion && info.erupcion.rey) patch.variant_state = Object.assign({}, room.variant_state || {}, { fin: { motivo: info.erupcion.rey === "volcan" ? "volcan" : "expuesto" } });
            }
            /* Misiones: si esta jugada deja la misión cumplida, el rival se
               entera (sin saber cuál es): su próxima jugada es su única
               oportunidad de deshacerla. */
            if (room.variant === "misiones" && misionMia) {
                const amenaza = Object.assign({}, (room.variant_state && room.variant_state.amenaza) || {}, { [myColor]: MisionesSecretas.cumple(misionMia, engine.game, myColor) });
                patch.variant_state = Object.assign({}, room.variant_state || {}, patch.variant_state || {}, { amenaza: amenaza });
            }
            // Solo se guarda si la partida sigue en juego: si al rival se le cayó la
            // bandera mientras tanto, esta jugada no puede pisar ese resultado. Y si no
            // quedó guardada, el tablero ya la muestra: se vuelve a leer la sala para
            // que enseñe la posición real en vez de quedarse desincronizado.
            // Y solo sobre la posición de la que salió la jugada (`fen`): si la sala
            // ya iba más adelante —otra pestaña de la misma cuenta, una jugada
            // repetida—, no la pisa. Se pide la fila de vuelta: el reloj queda con la
            // hora de la base, no con la de esta computadora.
            jugadaEnVuelo = info.fen;
            let guardar = sb.from("game_rooms").update(patch).eq("id", ROOM_ID).eq("status", "playing");
            if (room.fen) guardar = guardar.eq("fen", room.fen);
            const { data: guardada, error } = await guardar.select("*");
            jugadaEnVuelo = null;
            if (error || !guardada || !guardada.length) {
                if (error) console.error(error);
                await releerSala(error ? "No se pudo guardar la jugada: " + error.message : null);
                if (!error) setStatus(room.status === "playing" ? "Esa jugada no quedó guardada: la partida ya iba más adelante." : "La partida ya había terminado: esa jugada no quedó guardada.");
                return;
            }
            // Si mientras viajaba ya llegó algo más nuevo (el eco de esta misma jugada,
            // o hasta la respuesta del rival), se queda lo más nuevo: antes esto
            // pegaba el parche encima y la sala volvía una jugada atrás.
            room = SalaJuego.laMasNueva(room, guardada[0]);
            if (room.variant === "ciegas") { board.setHidePieces(ciegasOculto()); ciegasActualizarPanel(); }
            renderMoveHistory(room.moves);
            updateStatusText();
            pintarExtras();
            renderClocks();
            if (room.status !== "playing") cargarMisiones();
        }

        function applyRemoteRoom(row, forzarTablero) {
            const positionChanged = row.fen !== room.fen;
            const nuevas = (row.moves || []).length - (room.moves || []).length;
            room = row;
            if (positionChanged || forzarTablero) board.load(row.fen);
            board.setInteractive(!!myColor && row.status === "playing" && bothReady(row) && row.variant !== "ciegas");
            if (row.variant === "ciegas") {
                if (nuevas > 0 && engine.turn() === myColor) ciegasMostrarUltima(row.moves[row.moves.length - 1], false);
                board.setHidePieces(ciegasOculto());
                ciegasActualizarPanel();
            }
            renderMoveHistory(row.moves);
            updateStatusText();
            pintarExtras();
            renderClocks();
            if (row.variant === "misiones") { if (row.status !== "playing" && !misiones) cargarMisiones(); else revisarMision(); }
        }

        // Vuelve a leer la sala de la base y la aplica como un cambio remoto, forzando
        // el tablero: se usa cuando una escritura propia no quedó guardada y lo que se
        // ve en pantalla ya no es lo que hay en la base.
        async function releerSala(mensaje) {
            const fila = await SalaJuego.releer(ROOM_ID);
            if (fila) applyRemoteRoom(fila, true);
            if (mensaje) setStatus(mensaje);
        }

        function subscribeRoom() { SalaJuego.suscribir(ROOM_ID, (fila) => applyRemoteRoom(fila), { sala: () => room, miColor: () => myColor }); }

        SalaJuego.montarRendirse({ salaId: ROOM_ID, sala: () => room, miColor: () => myColor, decir: setStatus, releer: releerSala });

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            RelojServidor.iniciar(sb);
            if (!session) { window.location.href = "login.html"; return; }
            if (!ROOM_ID) { showError("Falta indicar qué partida abrir. Vuelve a Juegos y entra desde ahí."); return; }

            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { showError("No se pudo cargar tu perfil. Cierra sesión y vuelve a entrar."); return; }
            profile = profileData;
            isTeacher = profile.role === "profesor" || profile.is_admin === true;

            const { data: roomData, error: roomError } = await sb.from("game_rooms").select("*").eq("id", ROOM_ID).maybeSingle();
            if (roomError || !roomData) { showError("No se encontró esa partida — puede que ya se haya eliminado."); return; }
            room = roomData;
            myColor = room.white_id === profile.id ? "w" : (room.black_id === profile.id ? "b" : null);
            if (!myColor && !isTeacher) { showError("No formas parte de esta partida."); return; }

            /* El nombre de los dos lados sale de nombres_de_jugadores() y no de
               `profiles`: desde que el reto está abierto a toda la Academia el
               rival puede ser de otra clase, que por la RLS de `profiles` no se
               ve —la tarjeta diría "tu rival" sin que nada fallara— y, sobre
               todo, aquel select se llevaba también su correo. */
            const { data: players } = await sb.rpc("nombres_de_jugadores", { p_ids: [room.white_id, room.black_id] });
            (players || []).forEach((p) => { playerNames[p.id] = p.nombre; });

            mod = MODALIDADES[room.variant];
            if (!mod) { showError("Esta partida es de otra modalidad (" + room.variant + ") y se abre desde Juegos."); return; }
            document.title = mod.titulo.replace(/^\S+\s/, "") + " — Ajedrez Integral";
            document.getElementById("titulo").textContent = mod.titulo;
            document.getElementById("reglas-texto").innerHTML = mod.reglas.map((r) => "<p>" + r + "</p>").join("");
            engine = Variantes.crear(room.variant);
            if (engine.configurar) engine.configurar(room.variant_state);
            board = new VarianteBoard(document.getElementById("board"), {
                engine: engine,
                interactive: !!myColor && room.status === "playing" && bothReady(room) && room.variant !== "ciegas",
                myColor: myColor || "w",
                hidePieces: false,
                ariaLabel: "Tablero de " + mod.titulo.replace(/^\S+\s/, ""),
                onMove: handleLocalMove,
                onPromotionNeeded: showPromotionPicker,
            });
            board.load(room.fen);
            if (room.variant === "ciegas") { board.setHidePieces(ciegasOculto()); ciegasActualizarPanel(); }
            renderMoveHistory(room.moves);
            updateStatusText();
            pintarExtras();
            renderClocks();
            subscribeRoom();
            cargarMisiones();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
    