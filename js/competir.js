/* El código de competir.html: jugar contra otra persona de la Academia.

   Lo que había en juegos.html y era de COMPETIR —no de conocer modalidades
   ni de armar partidas— se mudó acá tal cual:
     - «En línea ahora»: quién tiene esta página abierta y el botón de retarlo,
       con los retos que me llegan encima de todo;
     - «Partidas en curso» y «Partidas terminadas».
   Y las tarjetas de Torneos y TV en vivo, que antes estaban en el panel.
   Juegos se quedó con el catálogo, los juegos para uno solo, el formulario
   del profesor y la tarjeta de la partida propia. Lo que usan las dos
   páginas vive en js/juegos-comun.js. */

        let session = null, profile = null, isTeacher = false;
        const playerNames = {};

        // Tiempo asignado a cada jugador (reloj tipo Fischer). La lista vive en
        // js/ritmos.js, la misma de los torneos y del formulario del profesor.
        const timeControlLabel = Ritmos.etiqueta;
        let ritmoReto = null;

        function fmtDateTime(iso) {
            return new Date(iso).toLocaleString("es-CR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });
        }

        function resultLabel(row) {
            if (row.status !== "finished") return "";
            if (row._table === "fourplayer_games") {
                const r = row.result || {};
                if (r.reason === "draw") return "🤝 Tablas";
                if (r.winners && r.winners.length) return "🏆 Ganó " + r.winners.map((s) => SEAT_LABEL[s]).join(" + ");
                return "Terminada";
            }
            if (row.result === "draw") return "🤝 Tablas";
            if (row.result === "white") return "🏆 Ganó " + (playerNames[row.white_id] || "blancas");
            if (row.result === "black") return "🏆 Ganó " + (playerNames[row.black_id] || "negras");
            return "Terminada";
        }


        function renderRoomCard(row, container) {
            const is4p = row._table === "fourplayer_games";
            const card = document.createElement("div");
            card.className = "bg-white dark:bg-brand-900 rounded-xl shadow-md p-4 flex items-center justify-between gap-3 flex-wrap";
            const info = document.createElement("div");
            const playersLine = is4p
                ? SEATS.map((s) => SEAT_LABEL[s] + " " + escapeHtml(playerNames[row.seats[s].player_id] || "?")).join(" · ")
                : escapeHtml(playerNames[row.white_id] || "?") + ' ⚪ vs ⚫ ' + escapeHtml(playerNames[row.black_id] || "?");
            const variantId = is4p ? (row.mode === "teams" ? "4teams" : "4ffa") : row.variant;
            info.innerHTML =
                '<p class="text-xs text-accent-700 dark:text-accent-400 font-semibold uppercase mb-1">' + variantLabel(variantId) + ' · ⏱️ ' + timeControlLabel(row.initial_seconds, row.increment_seconds) + '</p>' +
                '<h3 class="font-semibold text-brand-800 dark:text-white text-sm">' + playersLine + '</h3>' +
                '<p class="text-xs text-brand-450 dark:text-brand-350 mt-1">' + fmtDateTime(row.created_at) + (row.status === "finished" ? " · " + resultLabel(row) : "") + '</p>';
            const actions = document.createElement("div");
            actions.className = "flex items-center gap-2 shrink-0";
            // Si el profesor es uno de los jugadores no viene a mirar: viene a
            // jugar. Mismo enlace, otro nombre y otro color — un "Ver" sobre la
            // partida propia se pasa por alto.
            const juegoYo = is4p
                ? SEATS.some((sc) => row.seats[sc] && row.seats[sc].player_id === profile.id)
                : (row.white_id === profile.id || row.black_id === profile.id);
            const viewBtn = document.createElement("a");
            viewBtn.href = (is4p ? "cuatro-jugadores.html" : pageFor2pVariant(row.variant)) + "?room=" + row.id;
            viewBtn.className = juegoYo
                ? "text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-brand-900 transition-colors"
                : "text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 dark:bg-brand-800 dark:hover:bg-brand-700 text-brand-700 dark:text-brand-200 transition-colors";
            viewBtn.textContent = juegoYo ? "♟️ Jugar" : "👀 Ver";
            actions.appendChild(viewBtn);
            /* Terminar y Eliminar son de quien arma las partidas. Al alumno no se
               le pintan: la política de la base tampoco lo dejaría, y un botón
               que falla es peor que no tenerlo. */
            if (isTeacher && row.status === "playing") {
                const endBtn = document.createElement("button");
                endBtn.type = "button";
                endBtn.className = "text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 transition-colors";
                endBtn.textContent = "Terminar";
                endBtn.addEventListener("click", async () => {
                    if (!(await Avisos.confirmar("Queda terminada sin ganador.", { titulo: "¿Terminar esta partida?", aceptar: "Terminar" }))) return;
                    if (is4p) {
                        const g = FourPlayerChess.Game.fromJSON(row.board);
                        g.forceEnd();
                        const newSeats = JSON.parse(JSON.stringify(row.seats));
                        if (g.result && g.result.bonusPoints) Object.keys(g.result.bonusPoints).forEach((s) => { newSeats[s].score = (newSeats[s].score || 0) + g.result.bonusPoints[s]; });
                        await sb.from("fourplayer_games").update({ status: "finished", result: g.result, board: g.toJSON(), seats: newSeats, updated_at: new Date().toISOString() }).eq("id", row.id);
                    } else {
                        await sb.from("game_rooms").update({ status: "finished", updated_at: new Date().toISOString() }).eq("id", row.id);
                    }
                    await loadRooms();
                });
                actions.appendChild(endBtn);
            }
            if (isTeacher) {
                const delBtn = document.createElement("button");
                delBtn.type = "button";
                delBtn.className = "text-xs text-red-600 dark:text-red-400 hover:underline";
                delBtn.textContent = "Eliminar";
                delBtn.addEventListener("click", async () => {
                    if (!(await Avisos.confirmar("Se borra por completo. No se puede deshacer.", { titulo: "¿Eliminar esta partida?", aceptar: "Eliminar", peligro: true }))) return;
                    await sb.from(is4p ? "fourplayer_games" : "game_rooms").delete().eq("id", row.id);
                    await loadRooms();
                });
                actions.appendChild(delBtn);
            }
            card.append(info, actions);
            container.appendChild(card);
        }

        async function loadRooms() {
            const [{ data: rooms, error }, { data: games4p, error: error4p }] = await Promise.all([
                // Solo lo que pinta la tarjeta: `moves`, `fen` y los estados de cada
                // modalidad crecen con cada jugada y aquí no se usan. La de cuatro
                // va entera porque «Terminar» necesita su `board`.
                sb.from("game_rooms").select("id, variant, status, result, white_id, black_id, initial_seconds, increment_seconds, created_at").order("created_at", { ascending: false }).limit(100),
                sb.from("fourplayer_games").select("*").order("created_at", { ascending: false }).limit(100),
            ]);
            if (error) console.error(error);
            if (error4p) console.error(error4p);
            const ids = new Set();
            (rooms || []).forEach((r) => { ids.add(r.white_id); ids.add(r.black_id); });
            (games4p || []).forEach((r) => SEATS.forEach((s) => { if (r.seats[s].player_id) ids.add(r.seats[s].player_id); }));
            if (ids.size) {
                const { data: players } = await sb.rpc("nombres_de_jugadores", { p_ids: Array.from(ids) });
                (players || []).forEach((p) => { playerNames[p.id] = p.nombre; });
            }

            const all = (rooms || []).map((r) => Object.assign({ _table: "game_rooms" }, r))
                .concat((games4p || []).map((r) => Object.assign({ _table: "fourplayer_games" }, r)))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            const ongoing = all.filter((r) => r.status === "playing");
            const finished = all.filter((r) => r.status === "finished");

            const ongoingEl = document.getElementById("ongoing-list");
            ongoingEl.innerHTML = "";
            if (!ongoing.length) ongoingEl.innerHTML = '<p class="text-brand-450 dark:text-brand-350 text-sm">Todavía no hay partidas en curso.</p>';
            else ongoing.forEach((r) => renderRoomCard(r, ongoingEl));

            const finishedEl = document.getElementById("finished-list");
            finishedEl.innerHTML = "";
            if (!finished.length) finishedEl.innerHTML = '<p class="text-brand-450 dark:text-brand-350 text-sm">Todavía no hay partidas terminadas.</p>';
            else finished.forEach((r) => renderRoomCard(r, finishedEl));
        }

        /* Las listas solo cambian cuando una partida nace, termina o se borra.
           Antes se escuchaba TODO cambio, y cada jugada de cualquier partida
           actualiza su fila: con cada movida, todas las pantallas de Competir
           abiertas volvían a pedir las dos listas enteras a la vez (ver «Realtime
           escucha solo lo que la pantalla muestra»). Ahora el UPDATE se filtra a
           `status=eq.finished` (la única actualización que cambia una tarjeta:
           «playing» es el estado con que nacen), y las recargas que llegan
           juntas se juntan en una, que espera si la pestaña está escondida. */
        let recargaPendiente = null;
        function programarRecarga() {
            if (recargaPendiente) return;
            recargaPendiente = setTimeout(function recargar() {
                if (document.hidden) {
                    document.addEventListener("visibilitychange", recargar, { once: true });
                    return;
                }
                recargaPendiente = null;
                loadRooms();
            }, 1000);
        }

        function subscribeRoomsList() {
            const canal = sb.channel("game-rooms-list-changes");
            for (const table of ["game_rooms", "fourplayer_games"]) {
                canal.on("postgres_changes", { event: "INSERT", schema: "public", table }, programarRecarga);
                canal.on("postgres_changes", { event: "UPDATE", schema: "public", table, filter: "status=eq.finished" }, programarRecarga);
                canal.on("postgres_changes", { event: "DELETE", schema: "public", table }, programarRecarga);
            }
            canal.subscribe();
        }

        /* ================= Retar a quien está en línea =================
         *
         * Presencia: un canal de Realtime donde cada quien se anuncia mientras tiene
         * abierta esta página. No hay tabla de "conectados": si cierras la pestaña,
         * desapareces solo.
         *
         * El reto sí es una fila en `desafios`, porque tiene que sobrevivir al segundo
         * que tarda el otro en contestar y porque quien lo recibe se entera por
         * Realtime aunque no estuviera mirando. Al aceptar, la partida NO se crea con
         * un insert: un alumno no puede crear partidas (la política game_rooms_insert
         * exige profesor, y sigue igual). La crea la función aceptar_desafio(), que
         * comprueba que el desafío existe, que está pendiente y que quien acepta es
         * quien lo recibió, y sortea los colores.
         */
        const CANAL_PRESENCIA = "juegos-en-linea";
        let canalPresencia = null, canalDesafios = null;
        let gente = [];              // quién está conectado, sin contarme
        let retosPendientes = [];    // los que me llegaron y no he respondido
        let retosEnviados = {};      // id de reto -> {boton, timeoutId, para, nombre}: los míos, mientras espero respuesta

        /* Con quién puedo jugar: cualquiera de la Academia, que es la misma
           regla que aplica la base (public.pueden_jugar_entre_si). Acá es solo
           para no mostrar un botón que va a fallar; quien manda es la base.

           Antes había que compartir profesor, y eso dejaba la lista vacía casi
           siempre: un alumno que quiere jugar AHORA no tiene por qué esperar a
           que alguien de su propia clase esté conectado. Retarse es lo único
           que comparte toda la Academia — ver y gestionar alumnos sigue
           acotado a quien es su profesor, y armar una partida desde el
           formulario de abajo también (public.puedo_armar_partida_con). */
        function puedoJugarCon(otro) {
            return !!otro && !!otro.id && otro.id !== profile.id;
        }

        const MODALIDADES_ADAPTADAS = ["estandar", "niebla"];

        function prepararSelectoresDeReto() {
            const mod = document.getElementById("reto-modalidad");
            mod.innerHTML = "";
            /* A quien no ve (cuenta marcada como ciega, js/vision-cuenta.js)
               solo se le ofrecen las modalidades que se juegan escribiendo la
               jugada: retar a Crazyhouse lo mandaría a un tablero que no puede
               usar. */
            const ciego = document.documentElement.classList.contains("modo-ciego");
            VARIANTS.filter((v) => !v.disabled && v.id.indexOf("4") !== 0 && (!ciego || MODALIDADES_ADAPTADAS.includes(v.id))).forEach((v) => {
                const o = document.createElement("option");
                o.value = v.id; o.textContent = v.emoji + " " + v.label;
                mod.appendChild(o);
            });
            if (!ritmoReto) ritmoReto = Ritmos.montar(document.getElementById("reto-tiempo"), { valor: "10+0" });
        }

        async function iniciarPresencia() {
            prepararSelectoresDeReto();
            document.getElementById("en-linea-caja").classList.remove("hidden");

            /* En el canal de presencia va lo justo para pintar la fila y
               apretar "Retar": el id, el nombre y si da clase. Antes iba
               también la lista de profesores de cada quien, que servía para
               decidir si eran compañeros — ahora no hace falta y, de paso, era
               repartirle a toda la página con quién estudia cada alumno. */
            // La marca de la cuenta (js/vision-cuenta.js) puede llegar después
            // del primer pintado: la frase de la lista vacía depende de ella.
            document.addEventListener("vision:cambio", pintarEnLineaPronto);
            canalPresencia = sb.channel(CANAL_PRESENCIA, { config: { presence: { key: profile.id } } });
            canalPresencia.on("presence", { event: "sync" }, () => {
                const estado = canalPresencia.presenceState();
                const vistos = {};
                Object.keys(estado).forEach((k) => {
                    (estado[k] || []).forEach((p) => { if (p && p.id) vistos[p.id] = p; });
                });
                gente = Object.values(vistos).filter((p) => p.id !== profile.id);
                pintarEnLineaPronto();
            });
            canalPresencia.subscribe(async (estado) => {
                if (estado !== "SUBSCRIBED") return;
                await canalPresencia.track({
                    id: profile.id, nombre: nombreVisible(profile),
                    is_admin: !!profile.is_admin, role: profile.role,
                });
            });
        }

        /* El canal es de toda la Academia (retarse es lo único que se comparte),
           así que cada entrada o salida de cualquiera dispara un «sync» en todas
           las pantallas. Con mucha gente llegan varios por segundo: se pinta a
           lo sumo uno cada medio segundo, con el último estado. */
        let pintadoPendiente = null;
        function pintarEnLineaPronto() {
            if (pintadoPendiente) return;
            pintadoPendiente = setTimeout(() => { pintadoPendiente = null; pintarEnLinea(); }, 500);
        }

        function pintarEnLinea() {
            const lista = document.getElementById("en-linea-lista");
            const cuenta = document.getElementById("en-linea-cuenta");
            const disponibles = gente.filter(puedoJugarCon);
            cuenta.textContent = disponibles.length ? disponibles.length + (disponibles.length === 1 ? " persona" : " personas") : "";
            /* La lista se repinta con cada entrada o salida de alguien. Si el
               foco estaba en un «Retar», vuelve al de la MISMA persona; sin
               esto caía al <body> cada vez que alguien entraba a la página. */
            const enfocado = document.activeElement && lista.contains(document.activeElement)
                ? document.activeElement.dataset.retar || null : null;
            lista.innerHTML = "";
            if (!disponibles.length) {
                /* bot.html no se le ofrece a la cuenta ciega (se esconde: no
                   está adaptado), así que la frase se quedaba con un enlace que
                   no lleva a ningún lado. A ella se le ofrece jugar contra
                   Oscar en el Tablero, que sí se juega escribiendo. */
                lista.innerHTML = document.documentElement.classList.contains("modo-ciego")
                    ? '<p class="text-sm text-brand-450 dark:text-brand-350">Ahora mismo no hay nadie más en esta página. Si quieres jugar ya, puedes <a href="tablero.html" class="underline">jugar contra Oscar en el Tablero</a>.</p>'
                    : '<p class="text-sm text-brand-450 dark:text-brand-350">Ahora mismo no hay nadie más en esta página. Si quieres jugar ya, está <a href="bot.html" class="underline">el bot de Oscar</a>.</p>';
                return;
            }
            disponibles.forEach((p) => {
                const fila = document.createElement("div");
                fila.className = "flex items-center justify-between gap-3 border border-brand-100 dark:border-brand-800 rounded-xl px-3 py-2";
                const quien = document.createElement("p");
                quien.className = "text-sm font-medium text-brand-700 dark:text-brand-200";
                quien.textContent = "🟢 " + p.nombre + (p.role === "profesor" ? " · profe" : "");
                const boton = document.createElement("button");
                boton.type = "button";
                boton.dataset.retar = p.id;
                boton.className = "bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors";
                boton.textContent = "Retar";
                // Diez botones «Retar» seguidos no dicen a quién: el nombre va en el accesible.
                boton.setAttribute("aria-label", "Retar a " + p.nombre);
                boton.addEventListener("click", () => retar(p, boton));
                // Un reto mío que sigue esperando se pinta igual después de repintar.
                const pendiente = Object.values(retosEnviados).find((r) => r.para === p.id);
                if (pendiente) { pendiente.boton = boton; botonEsperando(boton, p.nombre); }
                fila.append(quien, boton);
                lista.appendChild(fila);
                if (enfocado === p.id) boton.focus();
            });
        }

        /* «Esperando…» NO es `disabled`: un botón deshabilitado suelta el foco,
           que caía al <body> justo después de retar, sin que se oyera nada. Se
           dice con aria-disabled, y el nombre accesible cambia con el texto:
           quedaba «Retar a Bruno» sobre un botón que decía «Esperando…». */
        function botonEsperando(boton, nombre) {
            boton.setAttribute("aria-disabled", "true");
            boton.classList.add("opacity-60", "cursor-not-allowed");
            boton.textContent = "Esperando…";
            boton.setAttribute("aria-label", "Esperando a que " + nombre + " acepte");
        }
        function botonRetar(boton, nombre) {
            boton.removeAttribute("aria-disabled");
            boton.classList.remove("opacity-60", "cursor-not-allowed");
            boton.textContent = "Retar";
            boton.setAttribute("aria-label", "Retar a " + nombre);
        }
        // Lo que pasa con el reto se dice en una región viva: el foco se queda en el botón.
        function anunciarReto(texto) {
            const viva = document.getElementById("reto-anuncio");
            if (!viva) return;
            viva.textContent = "";
            setTimeout(() => { viva.textContent = texto; }, 60);
        }

        async function retar(quien, boton) {
            const modalidad = document.getElementById("reto-modalidad").value;
            const tc = ritmoReto.leer();
            if (tc.error) { Avisos.avisar(tc.error, { tipo: "error" }); return; }
            if (boton.getAttribute("aria-disabled") === "true") return;   // ya hay uno esperando
            botonEsperando(boton, quien.nombre);
            boton.textContent = "Enviando…";
            const { data, error } = await sb.from("desafios").insert({
                de_id: profile.id, para_id: quien.id, modalidad: modalidad,
                initial_seconds: tc.initial, increment_seconds: tc.increment,
            }).select("id").single();
            if (error || !data) {
                botonRetar(boton, quien.nombre);
                Avisos.avisar("No se pudo enviar el reto: " + (error ? error.message : "intenta de nuevo"), { tipo: "error" });
                return;
            }
            boton.textContent = "Esperando…";
            anunciarReto("Reto enviado a " + quien.nombre + ". Te avisamos cuando conteste.");
            // Si tarda en contestar, el botón se libera solo a los 20s; si
            // contesta antes (sobre todo si rechaza), reactivarBoton() de
            // escucharDesafios() ya lo habrá liberado y este timeout no
            // encuentra nada que hacer.
            const timeoutId = setTimeout(() => {
                if (!retosEnviados[data.id]) return;
                reactivarBoton(data.id);
                anunciarReto(quien.nombre + " no contestó todavía. Puedes volver a retar.");
            }, 20000);
            retosEnviados[data.id] = { boton: boton, timeoutId: timeoutId, para: quien.id, nombre: quien.nombre };
        }

        // Libera el botón "Retar" de un reto mío, sea porque contestaron o
        // porque se cumplió el plazo de espera. Sin esto, rechazar un reto
        // de inmediato igual dejaba a quien retó viendo "Esperando…" el
        // resto de los 20 segundos, sin ninguna razón para seguir esperando.
        function reactivarBoton(retoId) {
            const pendiente = retosEnviados[retoId];
            if (!pendiente) return;
            clearTimeout(pendiente.timeoutId);
            botonRetar(pendiente.boton, pendiente.nombre);
            delete retosEnviados[retoId];
        }

        /* Los retos que me llegan y la respuesta al mío: las dos cosas por Realtime. */
        function escucharDesafios() {
            canalDesafios = sb.channel("desafios:" + profile.id)
                .on("postgres_changes",
                    { event: "INSERT", schema: "public", table: "desafios", filter: "para_id=eq." + profile.id },
                    (msg) => { if (msg.new && msg.new.estado === "pendiente") mostrarReto(msg.new); })
                .on("postgres_changes",
                    { event: "UPDATE", schema: "public", table: "desafios", filter: "de_id=eq." + profile.id },
                    (msg) => {
                        if (!msg.new) return;
                        if (msg.new.estado === "aceptado" && msg.new.room_id) { reactivarBoton(msg.new.id); irALaPartida(msg.new); }
                        if (msg.new.estado === "rechazado") {
                            reactivarBoton(msg.new.id);
                            avisoArriba(msg.new.motivo_rechazo
                                ? "Por ahora no — " + msg.new.motivo_rechazo
                                : "Tu reto no fue aceptado esta vez.");
                        }
                    })
                .subscribe();
            // Por si llegó uno mientras la página estaba cerrada.
            cargarRetosPendientes();
        }

        async function cargarRetosPendientes() {
            const { data } = await sb.from("desafios").select("*")
                .eq("para_id", profile.id).eq("estado", "pendiente")
                .order("created_at", { ascending: false }).limit(5);
            (data || []).forEach(mostrarReto);
        }

        async function mostrarReto(reto) {
            if (retosPendientes.some((r) => r.id === reto.id)) return;
            retosPendientes.push(reto);
            let nombre = playerNames[reto.de_id];
            if (!nombre) {
                const { data } = await sb.rpc("nombres_de_jugadores", { p_ids: [reto.de_id] });
                nombre = (data && data[0]) ? data[0].nombre : "Alguien";
                playerNames[reto.de_id] = nombre;
            }
            const tc = { label: Ritmos.etiqueta(reto.initial_seconds, reto.increment_seconds) };
            const caja = document.createElement("div");
            caja.dataset.reto = reto.id;
            caja.className = "bg-accent-50 dark:bg-brand-800 border-l-4 border-accent-500 rounded-r-xl px-4 py-3";
            const motivoId = "motivo-reto-" + reto.id;
            caja.innerHTML =
                '<p class="font-serif font-bold text-brand-800 dark:text-white mb-1">⚔️ ' + escapeHtml(nombre) + ' te reta</p>' +
                '<p class="text-sm text-brand-700 dark:text-brand-200 mb-3">' + escapeHtml(variantLabel(reto.modalidad)) +
                (tc ? " · " + escapeHtml(tc.label) : "") + '</p>' +
                '<label for="' + motivoId + '" class="block text-xs text-brand-450 dark:text-brand-350 mb-1">Si dices que no, puedes contarle por qué (opcional)</label>' +
                '<input type="text" id="' + motivoId + '" maxlength="140" placeholder="Ej. Estoy estudiando" ' +
                'class="w-full mb-2 rounded-lg border border-brand-200 dark:border-brand-700 bg-white dark:bg-brand-900 px-3 py-1.5 text-sm text-brand-700 dark:text-brand-200" />' +
                '<div class="flex flex-wrap gap-2">' +
                '<button type="button" data-aceptar="' + reto.id + '" class="bg-accent-500 hover:bg-accent-600 text-brand-900 font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors">Aceptar y jugar</button>' +
                '<button type="button" data-rechazar="' + reto.id + '" class="border border-brand-200 dark:border-brand-700 text-brand-600 dark:text-brand-300 font-semibold px-4 py-1.5 rounded-lg text-sm hover:border-red-400 transition-colors">Ahora no</button>' +
                '</div>';
            caja.querySelector("[data-aceptar]").addEventListener("click", () => aceptar(reto, caja));
            caja.querySelector("[data-rechazar]").addEventListener("click", () => rechazar(reto, caja));
            /* Un reto a una modalidad que no se puede jugar sin ver: a quien no
               ve no se le ofrece aceptarlo (lo llevaría a un tablero que no
               puede usar); se le dice y puede contestar «Ahora no». */
            const ciego = document.documentElement.classList.contains("modo-ciego");
            if (ciego && !MODALIDADES_ADAPTADAS.includes(reto.modalidad)) {
                caja.querySelector("[data-aceptar]").remove();
                const nota = document.createElement("p");
                nota.className = "text-sm text-brand-600 dark:text-brand-300 mb-2";
                nota.textContent = "Esta modalidad todavía no está adaptada para jugar sin ver. Puedes pedirle una de ajedrez estándar o de niebla de guerra.";
                caja.insertBefore(nota, caja.querySelector("div.flex"));
            }
            document.getElementById("retos-recibidos").appendChild(caja);
        }

        async function aceptar(reto, caja) {
            caja.querySelectorAll("button").forEach((b) => { b.disabled = true; });
            const inicial = estadoInicial(reto.modalidad);
            const { data, error } = await sb.rpc("aceptar_desafio", {
                p_desafio: reto.id,
                p_fen: inicial.fen || null,
                p_cartas: inicial.cartas_state || null,
                p_duelo: inicial.duelo_state || null,
                p_variant: inicial.variant_state || null,
            });
            if (error || !data) {
                caja.querySelectorAll("button").forEach((b) => { b.disabled = false; });
                Avisos.avisar("No se pudo empezar la partida: " + (error ? error.message : "el reto ya no está disponible"), { tipo: "error" });
                return;
            }
            irALaPartida({ modalidad: reto.modalidad, room_id: data });
        }

        async function rechazar(reto, caja) {
            const inputMotivo = caja.querySelector("input[id^='motivo-reto-']");
            const motivo = inputMotivo ? inputMotivo.value.trim().slice(0, 140) : "";
            await sb.from("desafios").update({
                estado: "rechazado",
                motivo_rechazo: motivo || null,
                respondido_at: new Date().toISOString(),
            }).eq("id", reto.id);
            retosPendientes = retosPendientes.filter((r) => r.id !== reto.id);
            caja.remove();
        }

        function irALaPartida(reto) {
            window.location.href = pageFor2pVariant(reto.modalidad) + "?room=" + reto.room_id;
        }

        function avisoArriba(texto) {
            const banner = document.getElementById("status-banner");
            banner.textContent = texto;
            banner.classList.remove("hidden");
            setTimeout(() => banner.classList.add("hidden"), 6000);
        }
        async function init() {
            const { data } = await sb.auth.getSession();
            session = data.session;
            if (!session) { window.location.href = "login.html"; return; }
            const { data: profileData, error: profileError } = await sb.from("profiles").select("*").eq("id", session.user.id).single();
            if (profileError || !profileData) { document.getElementById("loading").textContent = "No se pudo cargar tu perfil."; return; }
            profile = profileData;
            // Quien administra ve esta página como profesor, igual que en Juegos.
            isTeacher = profile.role === "profesor" || !!profile.is_admin;
            document.getElementById("subtitle").textContent = isTeacher
                ? "Torneos, TV en vivo, retos a quien esté en línea y las partidas de tus alumnos, en curso y terminadas."
                : "Torneos, TV en vivo, retos a quien esté en línea y tus partidas, en curso y terminadas.";
            // A quien arma torneos no se le dice «los que arma tu profesor».
            if (isTeacher) document.getElementById("torneos-desc").textContent = "Arma torneos para tus alumnos, con sus rondas y su tabla.";

            // Quién está en línea y los retos: para todos, alumnos y profesores.
            await iniciarPresencia();
            escucharDesafios();
            // Las listas: la RLS decide qué partidas le llegan a cada quien.
            await loadRooms();
            subscribeRoomsList();

            document.getElementById("loading").classList.add("hidden");
            document.getElementById("app").classList.remove("hidden");
        }
        init();
