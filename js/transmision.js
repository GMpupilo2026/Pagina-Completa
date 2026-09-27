/* El código de transmision.html: la «sala de cine» de un torneo transmitido
 * por Lichess (una transmisión o «broadcast»), con la partida elegida en la
 * pantalla grande, las demás de la ronda debajo y la pizarra de posiciones.
 *
 * Los torneos que se pueden ver acá son los de TORNEOS (la ficha de
 * torneos-en-vivo.html enlaza a transmision.html?torneo=<clave>). Para sumar
 * uno, se agrega su línea con el id de la transmisión: es lo último de su
 * dirección, lichess.org/broadcast/<nombre>/<id>.
 *
 * Todo sale de la API pública de Lichess, sin cuenta:
 *   /api/broadcast/<id>                  el torneo y sus rondas
 *   /api/broadcast/<torneo>/<ronda>/<id> las partidas de una ronda, con su FEN
 * La pizarra se arma sumando los resultados de todas las rondas: un punto por
 * ganar, medio por tablas. No se inventa ningún desempate: con los mismos
 * puntos se comparte el puesto.
 */
(function () {
    "use strict";

    const TORNEOS = {
        cenfotec: {
            id: "s7NfNv6H",
            nombre: "Desafío Mentes Maestras CENFOTEC 2026",
            enlace: "https://lichess.org/broadcast/desafio-mentes-maestras-cenfotec-2026/s7NfNv6H",
        },
    };
    const LICHESS = "https://lichess.org";
    const CADA_MS = 20000;          // cada cuánto se refresca la ronda en curso
    const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const NOMBRE_PIEZA = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
    const ORDEN_PIEZA = "kqrbnp";

    const $ = (id) => document.getElementById(id);

    const clave = new URLSearchParams(location.search).get("torneo") || Object.keys(TORNEOS)[0];
    const torneo = TORNEOS[clave] || TORNEOS[Object.keys(TORNEOS)[0]];

    const estado = {
        tour: null,
        rondas: [],
        partidasPorRonda: {},   // id de ronda → lista de partidas
        rondaElegida: null,
        partidaElegida: null,   // id de la partida en la pantalla grande
        temporizador: null,
    };

    // ---- Lichess -------------------------------------------------------------

    async function pedir(url) {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error("Lichess respondió " + res.status + " a " + url);
        return res.json();
    }

    // La dirección de la ronda que da Lichess es /broadcast/<torneo>/<ronda>/<id>;
    // la de sus datos, la misma bajo /api.
    function urlDatosRonda(ronda) {
        if (ronda.url && ronda.url.indexOf(LICHESS + "/broadcast/") === 0) {
            return LICHESS + "/api" + ronda.url.slice(LICHESS.length);
        }
        const tour = estado.tour || {};
        return LICHESS + "/api/broadcast/" + encodeURIComponent(tour.slug || "-") + "/" +
            encodeURIComponent(ronda.slug || "-") + "/" + encodeURIComponent(ronda.id);
    }

    async function cargarRonda(ronda) {
        const datos = await pedir(urlDatosRonda(ronda));
        estado.partidasPorRonda[ronda.id] = Array.isArray(datos.games) ? datos.games : [];
        return estado.partidasPorRonda[ronda.id];
    }

    // La ronda que se muestra al entrar: la que Lichess marca como la de ahora,
    // si no la que está en curso, si no la última que terminó, si no la primera.
    function rondaInicial(datos) {
        const rondas = estado.rondas;
        const porId = (id) => rondas.find((r) => r.id === id);
        return porId(datos.defaultRoundId) ||
            rondas.find((r) => r.ongoing) ||
            rondas.slice().reverse().find((r) => r.finished) ||
            rondas[0] || null;
    }

    // ---- El tablero ----------------------------------------------------------

    // Solo hace falta la parte de las piezas de la FEN: no se juega nada acá.
    function piezasDeFen(fen) {
        const piezas = {};
        const filas = String(fen || "").split(" ")[0].split("/");
        if (filas.length !== 8) return piezas;
        filas.forEach((fila, i) => {
            const rank = 8 - i;
            let f = 0;
            for (const ch of fila) {
                if (/[1-8]/.test(ch)) { f += Number(ch); continue; }
                if (f > 7) break;
                const tipo = ch.toLowerCase();
                if (ORDEN_PIEZA.indexOf(tipo) === -1) { f++; continue; }
                piezas[FILES[f] + rank] = { type: tipo, color: ch === tipo ? "b" : "w" };
                f++;
            }
        });
        return piezas;
    }

    function turnoDeFen(fen) {
        const t = String(fen || "").split(" ")[1];
        return t === "b" ? "b" : "w";
    }

    // Mismo dibujo que el resto del sitio: las casillas con los colores que
    // eligió cada quien (--sq-light/--sq-dark) y la pieza por PiezaPreferida.
    function dibujarTablero(el, fen, ultima, opts) {
        const piezas = piezasDeFen(fen);
        const marcadas = ultima && /^[a-h][1-8][a-h][1-8]/.test(ultima) ? [ultima.slice(0, 2), ultima.slice(2, 4)] : [];
        el.innerHTML = "";
        for (let rank = 8; rank >= 1; rank--) {
            for (let f = 0; f < 8; f++) {
                const casilla = FILES[f] + rank;
                const clara = (f + rank - 1) % 2 === 1;   // a1 oscura
                const sq = document.createElement("div");
                sq.className = "cine-sq " + (clara ? "cine-sq-clara" : "cine-sq-oscura") +
                    (marcadas.indexOf(casilla) !== -1 ? " cine-sq-ultima" : "");
                sq.dataset.square = casilla;
                const p = piezas[casilla];
                if (p) {
                    const span = document.createElement("span");
                    span.setAttribute("aria-hidden", "true");
                    if (window.PiezaPreferida) PiezaPreferida.pintar(span, p.type, p.color);
                    else {
                        span.className = p.color === "w" ? "piece-white" : "piece-black";
                        span.textContent = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }[p.type];
                    }
                    sq.appendChild(span);
                }
                el.appendChild(sq);
            }
        }
        requestAnimationFrame(() => ajustarPiezas(el));
        if (!opts || !opts.miniatura) { if (window.Coordenadas) Coordenadas.aplicar(el); }
    }

    // La pieza se mide contra la casilla ya dibujada, no contra la ventana.
    function ajustarPiezas(el) {
        const sq = el.querySelector(".cine-sq");
        if (!sq) return;
        const ancho = sq.getBoundingClientRect().width;
        if (!ancho) return;
        el.style.fontSize = Math.max(8, ancho * 0.72) + "px";
    }

    // Lo que dice el tablero en palabras, para quien no lo ve.
    function describirPosicion(fen) {
        const piezas = piezasDeFen(fen);
        const lado = (color) => Object.keys(piezas)
            .filter((c) => piezas[c].color === color)
            .sort((a, b) => ORDEN_PIEZA.indexOf(piezas[a].type) - ORDEN_PIEZA.indexOf(piezas[b].type) || a.localeCompare(b))
            .map((c) => NOMBRE_PIEZA[piezas[c].type] + " en " + c)
            .join(", ");
        return "Blancas: " + (lado("w") || "ninguna pieza") + ". Negras: " + (lado("b") || "ninguna pieza") + ".";
    }

    // ---- Textos de una partida -----------------------------------------------

    function nombreJugador(j) {
        if (!j) return "Por definir";
        return (j.title ? j.title + " " : "") + (j.name || "Por definir");
    }

    function reloj(cs) {
        if (typeof cs !== "number" || cs < 0) return "";
        const s = Math.floor(cs / 100);
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
        const dos = (n) => String(n).padStart(2, "0");
        return h ? h + ":" + dos(m) + ":" + dos(seg) : m + ":" + dos(seg);
    }

    // Lichess escribe el resultado «1-0», «0-1», «½-½» (o «1/2-1/2») y «*» en curso.
    function resultado(status) {
        const s = String(status || "*").replace("1/2-1/2", "½-½");
        if (s === "1-0") return { texto: "1-0", palabras: "ganaron las blancas", w: 1, b: 0 };
        if (s === "0-1") return { texto: "0-1", palabras: "ganaron las negras", w: 0, b: 1 };
        if (s === "½-½") return { texto: "½-½", palabras: "tablas", w: 0.5, b: 0.5 };
        return null;
    }

    function uciLegible(uci) {
        return uci && /^[a-h][1-8][a-h][1-8]/.test(uci) ? uci.slice(0, 2) + "–" + uci.slice(2, 4) : "";
    }

    function tarjetaJugador(el, j, color, partida, juega) {
        el.innerHTML = "";
        const nombre = document.createElement("span");
        nombre.className = "font-semibold text-white truncate";
        nombre.textContent = (color === "w" ? "♔ " : "♚ ") + nombreJugador(j);
        const izq = document.createElement("span");
        izq.className = "flex items-center gap-2 min-w-0";
        izq.appendChild(nombre);
        if (j && j.rating) {
            const elo = document.createElement("span");
            elo.className = "text-brand-200 text-xs shrink-0";
            elo.textContent = String(j.rating);
            izq.appendChild(elo);
        }
        el.appendChild(izq);
        const der = document.createElement("span");
        der.className = "flex items-center gap-2 shrink-0";
        if (juega) {
            const t = document.createElement("span");
            t.className = "cine-juega text-xs font-semibold";
            t.textContent = "Juega";
            der.appendChild(t);
        }
        const r = reloj(j && j.clock);
        if (r) {
            const c = document.createElement("span");
            c.className = "cine-reloj font-mono";
            c.textContent = r;
            c.setAttribute("aria-label", "Reloj: " + r);
            der.appendChild(c);
        }
        el.appendChild(der);
    }

    // ---- Pantalla grande y cartelera -------------------------------------------

    function partidasDeLaRonda() {
        return (estado.rondaElegida && estado.partidasPorRonda[estado.rondaElegida.id]) || [];
    }

    function pintarPantalla() {
        const partidas = partidasDeLaRonda();
        const sin = $("cine-sin-partidas");
        const escenario = document.querySelector(".cine-escenario");
        if (!partidas.length) {
            escenario.classList.add("hidden");
            $("cine-detalle").textContent = "";
            $("cine-posicion").textContent = "";
            sin.textContent = estado.rondaElegida && estado.rondaElegida.finished
                ? "Esta ronda no tiene partidas publicadas."
                : "Esta ronda todavía no empieza: las partidas aparecen aquí apenas arranquen.";
            sin.classList.remove("hidden");
            return;
        }
        sin.classList.add("hidden");
        escenario.classList.remove("hidden");
        let g = partidas.find((p) => p.id === estado.partidaElegida);
        if (!g) { g = partidas[0]; estado.partidaElegida = g.id; }
        const [w, b] = g.players || [];
        const res = resultado(g.status);
        const turno = turnoDeFen(g.fen);
        tarjetaJugador($("cine-blancas"), w, "w", g, !res && turno === "w");
        tarjetaJugador($("cine-negras"), b, "b", g, !res && turno === "b");
        const tablero = $("cine-tablero");
        dibujarTablero(tablero, g.fen, g.lastMove);
        const ult = uciLegible(g.lastMove);
        tablero.setAttribute("aria-label", "Tablero: " + nombreJugador(w) + " con blancas contra " + nombreJugador(b) + " con negras");
        const partes = [];
        partes.push(res ? "Terminó " + res.texto + " (" + res.palabras + ")" : "En juego · mueven las " + (turno === "w" ? "blancas" : "negras"));
        if (ult) partes.push("última jugada " + ult + (g.check === "#" ? ", jaque mate" : g.check === "+" ? ", jaque" : ""));
        $("cine-detalle").textContent = partes.join(" · ");
        $("cine-posicion").textContent = describirPosicion(g.fen);
    }

    function pintarCartelera() {
        const lista = $("cine-cartelera");
        lista.innerHTML = "";
        partidasDeLaRonda().forEach((g, i) => {
            const [w, b] = g.players || [];
            const res = resultado(g.status);
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "cine-miniatura w-full text-left rounded-xl p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            const elegida = g.id === estado.partidaElegida;
            btn.setAttribute("aria-pressed", String(elegida));
            const mini = document.createElement("div");
            mini.className = "cine-tablero cine-tablero-mini";
            mini.setAttribute("aria-hidden", "true");
            btn.appendChild(mini);
            const texto = document.createElement("span");
            texto.className = "block mt-2 text-xs leading-snug";
            const l1 = document.createElement("span");
            l1.className = "block text-white font-semibold truncate";
            l1.textContent = "Mesa " + (i + 1) + (res ? " · " + res.texto : " · en juego");
            const l2 = document.createElement("span");
            l2.className = "block text-brand-200 truncate";
            l2.textContent = nombreJugador(w) + " – " + nombreJugador(b);
            texto.appendChild(l1); texto.appendChild(l2);
            btn.appendChild(texto);
            const sr = document.createElement("span");
            sr.className = "sr-only";
            sr.textContent = elegida ? " (en la pantalla grande)" : " (pasar a la pantalla grande)";
            btn.appendChild(sr);
            btn.addEventListener("click", () => {
                estado.partidaElegida = g.id;
                pintarPantalla();
                pintarCartelera();
                const marco = $("cine-tablero-marco");
                if (marco.getBoundingClientRect().top < 0) marco.scrollIntoView({ behavior: "smooth", block: "center" });
            });
            li.appendChild(btn);
            lista.appendChild(li);
            dibujarTablero(mini, g.fen, g.lastMove, { miniatura: true });
        });
    }

    function pintarRondas() {
        const ul = $("cine-rondas");
        ul.innerHTML = "";
        estado.rondas.forEach((r) => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            const elegida = estado.rondaElegida && r.id === estado.rondaElegida.id;
            btn.className = "cine-ronda px-4 py-2 rounded-full text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950";
            btn.setAttribute("aria-pressed", String(!!elegida));
            btn.textContent = r.name || "Ronda";
            if (r.ongoing) {
                const vivo = document.createElement("span");
                vivo.className = "cine-envivo ml-2";
                vivo.textContent = "en vivo";
                btn.appendChild(vivo);
            }
            btn.addEventListener("click", () => elegirRonda(r));
            li.appendChild(btn);
            ul.appendChild(li);
        });
    }

    // ---- La pizarra ------------------------------------------------------------

    function posiciones() {
        const tabla = {};
        const sumar = (j, pts) => {
            if (!j || !j.name) return;
            const k = j.fideId ? "fide:" + j.fideId : "nombre:" + j.name;
            if (!tabla[k]) tabla[k] = { nombre: nombreJugador(j), rating: j.rating || null, puntos: 0, jugadas: 0 };
            tabla[k].puntos += pts;
            tabla[k].jugadas += 1;
            if (j.rating) tabla[k].rating = j.rating;
        };
        estado.rondas.forEach((r) => {
            (estado.partidasPorRonda[r.id] || []).forEach((g) => {
                const res = resultado(g.status);
                if (!res) return;
                const [w, b] = g.players || [];
                sumar(w, res.w);
                sumar(b, res.b);
            });
        });
        const filas = Object.values(tabla).sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, "es"));
        // Mismos puntos, mismo puesto (1, 2, 2, 4…).
        filas.forEach((f, i) => { f.puesto = i > 0 && f.puntos === filas[i - 1].puntos ? filas[i - 1].puesto : i + 1; });
        return filas;
    }

    function puntosTexto(p) {
        const entero = Math.floor(p);
        return p - entero ? (entero ? entero + "½" : "½") : String(entero);
    }

    function pintarPizarra() {
        const filas = posiciones();
        const cuerpo = $("pizarra-cuerpo");
        cuerpo.innerHTML = "";
        $("pizarra-vacia").classList.toggle("hidden", filas.length > 0);
        const cargadas = estado.rondas.filter((r) => estado.partidasPorRonda[r.id]).length;
        $("pizarra-nota").textContent = "Suma de " + cargadas + " de " + estado.rondas.length +
            " rondas · 1 punto por ganar, ½ por tablas · con los mismos puntos se comparte el puesto";
        filas.forEach((f) => {
            const tr = document.createElement("tr");
            tr.className = "pizarra-linea";
            const celda = (txt, cls, tag) => {
                const td = document.createElement(tag || "td");
                td.className = cls;
                td.textContent = txt;
                tr.appendChild(td);
                return td;
            };
            celda((f.puesto <= 3 ? ["🥇", "🥈", "🥉"][f.puesto - 1] + " " : "") + f.puesto, "py-2 pr-2 whitespace-nowrap");
            const th = celda(f.nombre, "py-2 pr-2 font-semibold text-left", "th");
            th.scope = "row";
            celda(puntosTexto(f.puntos), "py-2 pr-2 text-right font-bold pizarra-puntos");
            celda(String(f.jugadas), "py-2 text-right pizarra-tenue");
            cuerpo.appendChild(tr);
        });
    }

    // ---- El ciclo ----------------------------------------------------------------

    function horaDeAhora() {
        return new Date().toLocaleTimeString("es-CR", { timeZone: "America/Costa_Rica", hour: "numeric", minute: "2-digit" });
    }

    function pintarTodo() {
        pintarRondas();
        pintarPantalla();
        pintarCartelera();
        pintarPizarra();
        $("cine-actualizado").textContent = "Actualizado a las " + horaDeAhora() + " ·";
    }

    function rondaEnCurso(r) {
        if (!r) return false;
        if (r.ongoing) return true;
        return (estado.partidasPorRonda[r.id] || []).some((g) => !resultado(g.status));
    }

    function programar() {
        clearTimeout(estado.temporizador);
        estado.temporizador = setTimeout(refrescar, CADA_MS);
    }

    // Solo se vuelve a pedir la ronda que se está viendo si sigue en juego; una
    // pestaña escondida no le pide nada a Lichess.
    async function refrescar() {
        if (document.hidden) { programar(); return; }
        const r = estado.rondaElegida;
        if (rondaEnCurso(r)) {
            try { await cargarRonda(r); pintarTodo(); } catch (e) { console.error(e); }
        }
        programar();
    }

    async function elegirRonda(r) {
        estado.rondaElegida = r;
        estado.partidaElegida = null;
        if (!estado.partidasPorRonda[r.id] || rondaEnCurso(r)) {
            try { await cargarRonda(r); } catch (e) { console.error(e); estado.partidasPorRonda[r.id] = estado.partidasPorRonda[r.id] || []; }
        }
        pintarTodo();
        programar();
    }

    function mostrarError(texto) {
        $("loading").classList.add("hidden");
        $("cine-error-texto").textContent = texto;
        $("cine-error-enlace").href = torneo.enlace;
        $("cine-error").classList.remove("hidden");
    }

    async function arrancar() {
        $("cine-titulo").textContent = torneo.nombre;
        $("cine-lichess").href = torneo.enlace;
        let datos;
        try {
            datos = await pedir(LICHESS + "/api/broadcast/" + encodeURIComponent(torneo.id));
        } catch (e) {
            console.error(e);
            mostrarError("No pudimos conectarnos con Lichess ahora mismo. Vuelve a intentarlo en un rato, o mira la transmisión directamente allá.");
            return;
        }
        estado.tour = datos.tour || {};
        estado.rondas = Array.isArray(datos.rounds) ? datos.rounds : [];
        if (estado.tour.name) {
            $("cine-titulo").textContent = estado.tour.name;
            document.title = estado.tour.name + " — Ajedrez Integral";
        }
        const n = estado.rondas.length;
        $("cine-sub").textContent = n ? n + (n === 1 ? " ronda" : " rondas") : "";
        if (!n) {
            mostrarError("Este torneo todavía no tiene rondas publicadas. Vuelve más cerca de la fecha.");
            return;
        }
        // Todas las rondas, para la pizarra; si alguna falla, la pizarra lo dice
        // («suma de X de Y rondas») en vez de mostrar puntos de menos sin avisar.
        await Promise.all(estado.rondas.map((r) => cargarRonda(r).catch((e) => console.error(e))));
        $("loading").classList.add("hidden");
        $("cine-contenido").classList.remove("hidden");
        await elegirRonda(rondaInicial(datos));
    }

    // Con la ventana cambiando de ancho, la pieza se vuelve a medir.
    window.addEventListener("resize", () => document.querySelectorAll(".cine-tablero").forEach(ajustarPiezas));
    document.addEventListener("visibilitychange", () => { if (!document.hidden && estado.rondaElegida) refrescar(); });

    // Para el verificador.
    window.Transmision = { TORNEOS, posiciones, piezasDeFen, resultado };

    arrancar();
})();
