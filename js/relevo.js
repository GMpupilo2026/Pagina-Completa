/* El código de relevo.html: «Relevo en silencio».

   Ajedrez por equipos: cada integrante hace una jugada cuando le toca, en el
   orden de su equipo, sin hablar; para ponerse de acuerdo solo hay tres
   señales (ataca, defiende, cuidado), que el equipo rival no ve. Ver
   «Relevo en silencio» en docs/decisiones/juegos-y-torneos.md.

   Quién decide qué:
     · a quién le toca lo decide la BASE (relevo_jugar() rechaza a quien no
       le toca y una jugada que no salga de la posición guardada); la pantalla
       solo lo muestra y deja mover a quien corresponde;
     · las señales del equipo rival no llegan a esta pantalla: las esconde la
       RLS de relevo_senales mientras se juega;
     · la legalidad de la jugada la mira chess.js acá, como en las demás
       partidas.

   La sala se escucha con SalaJuego.suscribir (la misma escucha que no pierde
   jugadas de las demás partidas), sobre la tabla relevos. */

        let session = null, profile = null, relevo = null, jugadores = [], miColor = null, board = null, engine = null;
        let senales = [];
        const RELEVO_ID = new URLSearchParams(window.location.search).get("relevo");
        const nombres = {};
        const SENAL = { ataca: "⚔️ Ataca", defiende: "🛡️ Defiende", cuidado: "⚠️ Cuidado" };
        const COLOR = { w: "blancas", b: "negras" };

        function setStatus(texto) { document.getElementById("status-banner").textContent = texto; }
        function showError(texto) {
            document.getElementById("loading").classList.add("hidden");
            document.getElementById("error-text").textContent = texto;
            document.getElementById("error-state").classList.remove("hidden");
        }
        const nombre = (id) => nombres[id] || "Alguien";

        function equipo(color) { return jugadores.filter((j) => j.color === color).sort((a, b) => a.orden - b.orden); }
        /* El que sigue de cada equipo. Las blancas llevan hechas ceil(n/2)
           jugadas y las negras floor(n/2): es la misma cuenta que la base
           (interno.relevo_a_quien_le_toca). */
        function siguienteDe(color, r) {
            const eq = equipo(color);
            if (!eq.length) return null;
            const n = (r.moves || []).length;
            const hechas = color === "w" ? Math.ceil(n / 2) : Math.floor(n / 2);
            return eq[hechas % eq.length].jugador_id;
        }
        function aQuienLeToca(r) { return siguienteDe(SalaJuego.turnoDe(r), r); }
        function meToca() { return !!relevo && relevo.status === "playing" && aQuienLeToca(relevo) === profile.id; }

        function pintarEquipos() {
            const turno = SalaJuego.turnoDe(relevo);
            ["w", "b"].forEach((c) => {
                const ol = document.getElementById("equipo-" + c);
                ol.innerHTML = "";
                const sigue = siguienteDe(c, relevo);
                equipo(c).forEach((j) => {
                    const li = document.createElement("li");
                    let texto = nombre(j.jugador_id) + (j.jugador_id === profile.id ? " (tú)" : "");
                    if (relevo.status === "playing" && j.jugador_id === sigue) texto += c === turno ? " — ▶ le toca" : " — sigue";
                    li.textContent = texto;
                    if (relevo.status === "playing" && j.jugador_id === sigue && c === turno) li.className = "font-bold text-brand-800 dark:text-white";
                    ol.appendChild(li);
                });
            });
            const arriba = miColor === "b" ? "w" : "b";
            document.getElementById("arriba").textContent = "Equipo de " + COLOR[arriba] + (miColor === arriba ? " — el tuyo" : "");
            document.getElementById("abajo").textContent = "Equipo de " + COLOR[arriba === "w" ? "b" : "w"] + (miColor && miColor !== arriba ? " — el tuyo" : "");
        }

        function pintarEstado() {
            if (relevo.status === "finished") {
                const gana = relevo.result === "draw" ? "Tablas." : "Ganó el equipo de " + (relevo.result === "white" ? "blancas" : "negras") + ".";
                const como = relevo.motivo === "rendicion" ? " (el otro equipo se rindió)" : relevo.motivo === "profesor" ? " (lo dio por terminado el profe)" : "";
                setStatus("Relevo terminado — " + gana.replace(/\.$/, "") + como + ".");
                return;
            }
            const turno = SalaJuego.turnoDe(relevo), toca = aQuienLeToca(relevo);
            const jaque = engine.inCheck() ? " ¡Jaque!" : "";
            if (toca === profile.id) setStatus("¡Te toca! Haz la jugada de tu equipo (" + COLOR[turno] + ")." + jaque);
            else if (miColor === turno) setStatus("Le toca a " + nombre(toca) + ", de tu equipo. Sin hablar: si quieres, mándale una señal." + jaque);
            else if (miColor) setStatus("Le toca a " + nombre(toca) + ", del equipo rival." + jaque);
            else setStatus("Le toca a " + nombre(toca) + " (" + COLOR[turno] + ")." + jaque);
        }

        function pintarJugadas() {
            const ol = document.getElementById("jugadas"), vacio = document.getElementById("jugadas-vacio");
            const moves = relevo.moves || [];
            vacio.hidden = moves.length > 0;
            ol.innerHTML = "";
            for (let i = 0; i < moves.length; i += 2) {
                const li = document.createElement("li");
                li.textContent = (i / 2 + 1) + ". " + moves[i] + (moves[i + 1] ? " " + moves[i + 1] : "");
                ol.appendChild(li);
            }
        }

        function pintarControles() {
            const jugando = relevo.status === "playing";
            document.getElementById("rendirse-btn").classList.toggle("hidden", !miColor || !jugando);
            document.getElementById("profe-panel").hidden = !!miColor || !jugando;
            const form = document.getElementById("jugada-form");
            form.hidden = !miColor || !jugando;
            document.getElementById("jugada-input").disabled = !meToca();
            document.getElementById("jugada-jugar").disabled = !meToca();
            document.getElementById("senales").hidden = !miColor && !senales.length;
            document.getElementById("senales-botones").hidden = !miColor || !jugando;
            document.getElementById("senales-nota").textContent = miColor
                ? (jugando ? "Solo las ve tu equipo. Una por jugada." : "La partida terminó: ahora se ven las de los dos equipos.")
                : "Las señales de los dos equipos.";
        }

        function pintar() {
            pintarEquipos();
            pintarEstado();
            pintarJugadas();
            pintarControles();
            pintarSenales();
        }

        // ---------- Señales ----------
        function pintarSenales() {
            const ol = document.getElementById("senales-lista");
            ol.innerHTML = "";
            senales.slice().reverse().forEach((s) => {
                const li = document.createElement("li");
                const deMiEquipo = miColor && s.color === miColor;
                li.textContent = "Jugada " + (Math.floor(s.ply / 2) + 1) + " · " + nombre(s.de_id) +
                    (deMiEquipo ? "" : " (" + COLOR[s.color] + ")") + ": " + SENAL[s.senal];
                ol.appendChild(li);
            });
        }
        async function cargarSenales() {
            const { data, error } = await sb.from("relevo_senales").select("*").eq("relevo_id", RELEVO_ID).order("id");
            if (error) { console.error(error); return; }
            senales = data || [];
            pintarSenales();
            pintarControles();
        }
        function escucharSenales() {
            sb.channel("relevo-senales-" + RELEVO_ID)
                .on("postgres_changes", { event: "INSERT", schema: "public", table: "relevo_senales", filter: "relevo_id=eq." + RELEVO_ID },
                    (payload) => {
                        if (!payload.new || senales.some((s) => s.id === payload.new.id)) return;
                        senales.push(payload.new);
                        pintarSenales();
                    })
                .subscribe((estado) => { if (estado === "SUBSCRIBED") cargarSenales(); });
        }
        document.querySelectorAll("[data-senal]").forEach((b) => b.addEventListener("click", async () => {
            const msg = document.getElementById("senales-msg");
            const { error } = await sb.rpc("relevo_senal", { p_relevo: RELEVO_ID, p_senal: b.dataset.senal });
            if (error) { msg.textContent = error.message; return; }
            msg.textContent = "Mandaste «" + SENAL[b.dataset.senal].replace(/^\S+\s/, "") + "» a tu equipo.";
            cargarSenales();
        }));

        // ---------- Jugar ----------
        async function jugar(info) {
            const antes = relevo.fen;
            board.setInteractive(false);
            const { data, error } = await sb.rpc("relevo_jugar", {
                p_relevo: RELEVO_ID, p_fen_antes: antes, p_fen: info.fen, p_san: info.san,
                p_resultado: info.gameOver ? info.result : null,
            });
            if (error || !data) {
                if (error) console.error(error);
                await releer();
                setStatus("Esa jugada no quedó guardada: " + (error ? error.message : "la partida ya iba más adelante."));
                return;
            }
            aplicar(Array.isArray(data) ? data[0] : data);
        }

        function aplicar(fila) {
            if (!fila) return;
            if (relevo && SalaJuego.esAnterior(fila, relevo)) return;
            const cambio = !relevo || fila.fen !== relevo.fen;
            relevo = fila;
            if (cambio) board.load(fila.fen);
            board.setInteractive(meToca());
            pintar();
            cargarSenales();
        }
        async function releer() {
            const { data } = await sb.from("relevos").select("*").eq("id", RELEVO_ID).maybeSingle();
            if (data) { relevo = null; aplicar(data); }
        }

        document.getElementById("jugada-form").addEventListener("submit", (ev) => {
            ev.preventDefault();
            if (!meToca()) return;
            const input = document.getElementById("jugada-input"), msg = document.getElementById("jugada-msg");
            const texto = input.value.trim();
            if (!texto) return;
            const dicho = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
            const r = engine.moveText(dicho === "enroque corto" ? "O-O" : dicho === "enroque largo" ? "O-O-O" : texto);
            if (!r) { msg.textContent = window.ComandosTablero ? ComandosTablero.noSePudoJugar(texto) : "“" + texto + "” no es una jugada legal en esta posición."; input.select(); return; }
            input.value = "";
            msg.textContent = "Jugaste " + r.san + ".";
            board.render();
            jugar(Object.assign({ fen: engine.serialize() }, r));
        });

        document.getElementById("rendirse-btn").addEventListener("click", async () => {
            if (!miColor || relevo.status !== "playing") return;
            if (!(await Avisos.confirmar("La partida se termina y la gana el otro equipo.", { titulo: "¿Rendir a tu equipo?", aceptar: "Rendir a mi equipo", peligro: true }))) return;
            const { data, error } = await sb.rpc("relevo_terminar", { p_relevo: RELEVO_ID });
            if (error) { setStatus("No se pudo: " + error.message); await releer(); return; }
            aplicar(Array.isArray(data) ? data[0] : data);
        });
        document.querySelectorAll("[data-terminar]").forEach((b) => b.addEventListener("click", async () => {
            const textos = { white: "Ganan blancas", black: "Ganan negras", draw: "Tablas" };
            if (!(await Avisos.confirmar("El relevo se termina así: " + textos[b.dataset.terminar].toLowerCase() + ".", { titulo: "¿Terminar el relevo?", aceptar: "Terminar: " + textos[b.dataset.terminar] }))) return;
            const { data, error } = await sb.rpc("relevo_terminar", { p_relevo: RELEVO_ID, p_resultado: b.dataset.terminar });
            if (error) { setStatus("No se pudo: " + error.message); await releer(); return; }
            aplicar(Array.isArray(data) ? data[0] : data);
        }));

        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html"; return; }
            if (!RELEVO_ID) { showError("Falta indicar qué relevo abrir. Vuelve a Juegos y entra desde ahí."); return; }
            const { data: perfil } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (!perfil) { showError("No se pudo cargar tu perfil. Cierra sesión y vuelve a entrar."); return; }
            profile = perfil;

            const { data: fila } = await sb.from("relevos").select("*").eq("id", RELEVO_ID).maybeSingle();
            if (!fila) { showError("No se encontró ese relevo, o no formas parte de él."); return; }
            const { data: lista } = await sb.from("relevo_jugadores").select("*").eq("relevo_id", RELEVO_ID);
            jugadores = lista || [];
            const yo = jugadores.find((j) => j.jugador_id === profile.id);
            miColor = yo ? yo.color : null;
            const { data: nom } = await sb.rpc("nombres_de_jugadores", { p_ids: jugadores.map((j) => j.jugador_id) });
            (nom || []).forEach((p) => { nombres[p.id] = p.nombre; });

            engine = Variantes.crear("ciegas");
            board = new VarianteBoard(document.getElementById("board"), {
                engine: engine,
                interactive: false,
                myColor: miColor || "w",
                ariaLabel: "Tablero del relevo",
                onMove: jugar,
                onPromotionNeeded: (desde, hasta, cb) => Coronacion.pedir(SalaJuego.turnoDe(relevo), cb),
            });
            aplicar(fila);
            SalaJuego.suscribir(RELEVO_ID, aplicar, {
                tabla: "relevos", canal: "relevo-",
                sala: () => relevo, miColor: () => miColor,
                esperando: () => !meToca(),
            });
            escucharSenales();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
