/* El código de partida-perdida.html: «La partida perdida».

   Se muestra una posición y cuántas medias jugadas se hicieron para llegar a
   ella desde la de salida; hay que reconstruir la partida. Cuenta cualquier
   camino que deje las piezas EXACTAMENTE así (cada pieza en su casilla) en ese
   número de jugadas: la solución del banco es una de las posibles. Las
   posiciones salen de js/partida-perdida-banco.js, que genera
   herramientas/partida-perdida-generar.js jugando cada solución con chess.js
   (ver «La partida perdida» en docs/decisiones/juegos-y-torneos.md).

   Los retos resueltos se guardan en localStorage (partida_perdida_resueltos)
   y viajan con la cuenta por js/progreso-usuario.js. */

        const RETOS = window.PARTIDA_PERDIDA || [];
        const CLAVE = "partida_perdida_resueltos";
        const NOMBRE = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
        const COLUMNAS = ["a", "b", "c", "d", "e", "f", "g", "h"];
        let reto = null, engine = null, board = null, metaEngine = null, metaBoard = null, resuelto = false;

        function leerResueltos() { try { return JSON.parse(localStorage.getItem(CLAVE) || "{}") || {}; } catch (e) { return {}; } }
        function marcarResuelto(id) {
            const r = leerResueltos();
            if (r[id]) return;
            r[id] = true;
            try { localStorage.setItem(CLAVE, JSON.stringify(r)); } catch (e) {}
        }

        const colocacion = (fen) => String(fen).split(" ")[0];
        const hechas = () => engine.game.history().length;

        // La posición escrita: «Blancas: rey e1, dama d1…». El tablero de la
        // meta no es interactivo, y esto es lo que oye quien no lo ve.
        function escribir(fenColocacion) {
            const g = new Chess(fenColocacion + " w - - 0 1");
            const lado = { w: [], b: [] };
            const orden = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };
            for (let r = 1; r <= 8; r++) for (const f of COLUMNAS) {
                const p = g.get(f + r);
                if (p) lado[p.color].push({ t: p.type, s: f + r });
            }
            const lista = (xs) => xs.sort((a, b) => orden[a.t] - orden[b.t] || (a.s < b.s ? -1 : 1)).map((x) => NOMBRE[x.t] + " " + x.s).join(", ");
            return "Blancas: " + lista(lado.w) + ". Negras: " + lista(lado.b) + ".";
        }

        // Las casillas donde lo tuyo y la meta no coinciden.
        function diferencias(a, b) {
            const ga = new Chess(a + " w - - 0 1"), gb = new Chess(b + " w - - 0 1"), out = [];
            const decir = (p) => (p ? NOMBRE[p.type] + (p.color === "w" ? " blanco" : " negro") : "vacía");
            for (let r = 8; r >= 1; r--) for (const f of COLUMNAS) {
                const x = ga.get(f + r), y = gb.get(f + r);
                if ((x && x.type) !== (y && y.type) || (x && x.color) !== (y && y.color)) out.push(f + r + " (tú: " + decir(x) + "; la meta: " + decir(y) + ")");
            }
            return out;
        }

        function pintar() {
            const n = hechas(), total = reto.jugadas;
            const turno = engine.turn() === "w" ? "blancas" : "negras";
            document.getElementById("contador").textContent = n < total
                ? "Jugada " + (n + 1) + " de " + total + ": juegan las " + turno + "."
                : "Hiciste las " + total + " jugadas.";
            const ol = document.getElementById("jugadas");
            const h = engine.game.history().map((san) => Variantes.Ciegas.sanEs(san));
            document.getElementById("jugadas-vacio").hidden = h.length > 0;
            ol.innerHTML = "";
            for (let i = 0; i < h.length; i += 2) {
                const li = document.createElement("li");
                li.textContent = (i / 2 + 1) + ". " + h[i] + (h[i + 1] ? " " + h[i + 1] : "");
                ol.appendChild(li);
            }
            const puede = !resuelto && n < total;
            board.setInteractive(puede);
            document.getElementById("jugada-input").disabled = !puede;
            document.getElementById("jugada-jugar").disabled = !puede;
            document.getElementById("deshacer-btn").disabled = n === 0 || resuelto;
        }

        function revisar() {
            const res = document.getElementById("resultado");
            if (hechas() < reto.jugadas) { res.textContent = ""; return; }
            const mia = colocacion(engine.game.fen());
            if (mia === reto.posicion) {
                resuelto = true;
                marcarResuelto(reto.id);
                res.textContent = "🎉 ¡Lo lograste! Reconstruiste la partida en " + reto.jugadas + " jugadas.";
                const sig = RETOS[RETOS.indexOf(reto) + 1];
                document.getElementById("siguiente-btn").hidden = !sig;
                llenarSelector();
            } else {
                const d = diferencias(mia, reto.posicion);
                res.textContent = "No es la misma posición. " + (d.length === 1 ? "Cambia esta casilla: " : "Cambian " + d.length + " casillas: ") +
                    d.slice(0, 4).join("; ") + (d.length > 4 ? "…" : "") + ". Deshaz y prueba otro camino.";
            }
            pintar();
        }

        function alMover() {
            document.getElementById("resultado").textContent = "";
            pintar();
            revisar();
        }

        function cargar(id) {
            reto = RETOS.find((r) => r.id === id) || RETOS[0];
            resuelto = false;
            engine.game.reset();
            board.selected = null;
            board.lastMove = null;
            board.render();
            metaBoard.load(reto.posicion + " w - - 0 1");
            document.getElementById("meta-cuantas").textContent = "«" + reto.titulo + "»: se llegó en " + reto.jugadas + " jugadas exactas (" + Math.ceil(reto.jugadas / 2) + " de blancas y " + Math.floor(reto.jugadas / 2) + " de negras).";
            document.getElementById("meta-escrita").textContent = escribir(reto.posicion);
            document.getElementById("resultado").textContent = leerResueltos()[reto.id] ? "Este reto ya lo resolviste. Puedes volver a hacerlo." : "";
            ocultar("pista"); ocultar("solucion");
            document.getElementById("pista").textContent = reto.pista;
            document.getElementById("solucion").textContent = reto.solucion.map((s, i) => (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + s).join(" ");
            document.getElementById("siguiente-btn").hidden = true;
            document.getElementById("reto-select").value = String(reto.id);
            pintar();
        }

        function ocultar(id) {
            document.getElementById(id).hidden = true;
            document.getElementById(id + "-btn").setAttribute("aria-expanded", "false");
        }
        function alternar(id) {
            const el = document.getElementById(id), abrir = el.hidden;
            el.hidden = !abrir;
            document.getElementById(id + "-btn").setAttribute("aria-expanded", abrir ? "true" : "false");
        }

        function llenarSelector() {
            const sel = document.getElementById("reto-select"), hechos = leerResueltos();
            const actual = sel.value;
            sel.innerHTML = "";
            RETOS.forEach((r) => {
                const o = document.createElement("option");
                o.value = String(r.id);
                o.textContent = r.id + ". " + r.titulo + " — " + r.jugadas + " jugadas" + (hechos[r.id] ? " ✓ resuelto" : "");
                sel.appendChild(o);
            });
            if (actual) sel.value = actual;
        }

        document.getElementById("reto-select").addEventListener("change", (e) => cargar(parseInt(e.target.value, 10)));
        document.getElementById("deshacer-btn").addEventListener("click", () => {
            if (resuelto || !hechas()) return;
            engine.game.undo();
            board.selected = null; board.lastMove = null; board.render();
            document.getElementById("resultado").textContent = "";
            pintar();
        });
        document.getElementById("reiniciar-btn").addEventListener("click", () => cargar(reto.id));
        document.getElementById("pista-btn").addEventListener("click", () => alternar("pista"));
        document.getElementById("solucion-btn").addEventListener("click", () => alternar("solucion"));
        document.getElementById("siguiente-btn").addEventListener("click", () => {
            const sig = RETOS[RETOS.indexOf(reto) + 1];
            if (sig) cargar(sig.id);
        });
        document.getElementById("jugada-form").addEventListener("submit", (ev) => {
            ev.preventDefault();
            if (resuelto || hechas() >= reto.jugadas) return;
            const input = document.getElementById("jugada-input");
            const texto = input.value.trim();
            if (!texto) return;
            const dicho = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
            const r = engine.moveText(dicho === "enroque corto" ? "O-O" : dicho === "enroque largo" ? "O-O-O" : texto);
            if (!r) {
                document.getElementById("resultado").textContent = window.ComandosTablero ? ComandosTablero.noSePudoJugar(texto) : "“" + texto + "” no es una jugada legal en esta posición.";
                input.select();
                return;
            }
            input.value = "";
            board.render();
            alMover();
        });

        async function init() {
            if (window.ProgresoUsuario) { try { await ProgresoUsuario.init(); } catch (e) {} }
            engine = Variantes.crear("ciegas");
            board = new VarianteBoard(document.getElementById("board"), {
                engine: engine, interactive: true, myColor: "w", ambosColores: true,
                ariaLabel: "Tu tablero",
                onMove: alMover,
                onPromotionNeeded: (desde, hasta, cb) => Coronacion.pedir(engine.turn(), cb),
            });
            metaEngine = Variantes.crear("ciegas");
            metaBoard = new VarianteBoard(document.getElementById("meta-board"), {
                engine: metaEngine, interactive: false, myColor: "w", ariaLabel: "La posición a la que hay que llegar",
            });
            llenarSelector();
            const hechos = leerResueltos();
            const primero = RETOS.find((r) => !hechos[r.id]) || RETOS[0];
            cargar(primero.id);
        }
        init();
