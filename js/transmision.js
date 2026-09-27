/* El código de transmision.html: la «sala de cine» de un torneo transmitido
 * por Lichess (una transmisión o «broadcast»), con la partida elegida en la
 * pantalla grande, las demás de la ronda debajo y la pizarra de posiciones.
 *
 * Qué torneo muestra lo dice la sala (tabla salas_torneo, que edita quien
 * administra en admin.html#torneos), y también si lleva comentarista en video
 * (ver «El comentarista en video»): torneos-en-vivo.html enlaza a
 * transmision.html?torneo=<clave>, y la sala de esa clave trae el id de la
 * transmisión de Lichess.
 *
 * EN VIVO: la ronda elegida se escucha por la transmisión continua de Lichess
 * (/api/stream/broadcast/round/<id>.pgn), que manda el PGN de cada partida en
 * el momento en que cambia: cada jugada llega al instante, y el reloj de quien
 * juega corre segundo a segundo en la pantalla. Si esa conexión se corta, se
 * vuelve a abrir sola. Además, cada CADA_MS se vuelve a pedir la ronda entera
 * (por si aparece una mesa nueva o se perdió algo) y cada TORNEO_MS el torneo,
 * para enterarse de que empezó otra ronda: si la persona no eligió una ronda a
 * mano, la sala pasa sola a la que está en curso. Ver «La sala se actualiza
 * sola, jugada por jugada» en docs/decisiones/juegos-y-torneos.md.
 *
 * Todo sale de la API pública de Lichess, sin cuenta:
 *   /api/broadcast/<id>                  el torneo y sus rondas
 *   /api/broadcast/<torneo>/<ronda>/<id> las partidas de una ronda, con su FEN
 * La pizarra se arma sumando los resultados de todas las rondas: un punto por
 * ganar, medio por tablas. No se inventa ningún desempate: con los mismos
 * puntos se comparte el puesto.
 *
 * SALVO que la sala traiga pizarras de chess-results: una transmisión puede
 * llevar solo algunas mesas (la de UTN trae dos), y sumar esas no es la tabla
 * del torneo. Entonces la pizarra muestra las posiciones oficiales, que lee la
 * Edge Function pizarra-torneo (chess-results no deja que el navegador le
 * pida nada), con una pestaña por pizarra. Ver «Las posiciones oficiales
 * vienen de chess-results» en docs/decisiones/juegos-y-torneos.md.
 */
(function () {
    "use strict";

    const LICHESS = "https://lichess.org";
    const CADA_MS = 20000;          // respaldo: cada cuánto se vuelve a pedir la ronda entera
    const TORNEO_MS = 60000;        // cada cuánto se vuelve a pedir el torneo (rondas nuevas)
    const REINTENTO_MS = 5000;      // cuánto se espera para reabrir la transmisión continua
    // Una partida que todavía no empezó viene de Lichess SIN «fen»: es la inicial.
    const POSICION_INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const PIZARRA_MS = 90000;       // y la pizarra de chess-results (la función guarda 90 s)
    const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const NOMBRE_PIEZA = { k: "rey", q: "dama", r: "torre", b: "alfil", n: "caballo", p: "peón" };
    const ORDEN_PIEZA = "kqrbnp";

    const $ = (id) => document.getElementById(id);

    const clave = new URLSearchParams(location.search).get("torneo");
    let torneo = null;   // { id, nombre, enlace } de la sala elegida

    const estado = {
        tour: null,
        rondas: [],
        partidasPorRonda: {},   // id de ronda → lista de partidas
        rondaElegida: null,
        partidaElegida: null,   // id de la partida en la pantalla grande
        temporizador: null,
        sala: null,
        oficiales: null,        // lo que devolvió pizarra-torneo, o null mientras carga
        oficialError: null,
        pestana: 0,
        temporizadorPizarra: null,
        temporizadorTorneo: null,
        aMano: false,           // si la persona eligió la ronda (entonces no se la cambia sola)
        vivo: null,             // { ctrl, ronda } de la transmisión continua abierta
        vivoConectado: false,
        vivoReintento: null,
        pintado: 0,             // requestAnimationFrame pendiente
    };

    // ---- Lichess -------------------------------------------------------------

    async function pedir(url) {
        const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
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

    // Cuántas medias jugadas lleva una posición (para no volver atrás con un
    // dato más viejo que lo que ya trajo la transmisión continua).
    function medias(fen) {
        const p = String(fen || POSICION_INICIAL).split(" ");
        const n = Number(p[5]) || 1;
        return (n - 1) * 2 + (p[1] === "b" ? 1 : 0);
    }

    // La ronda entera, pedida de nuevo. Una partida que la transmisión continua
    // ya trajo más adelantada no se pisa con esta, que puede venir atrasada.
    async function cargarRonda(ronda) {
        const datos = await pedir(urlDatosRonda(ronda));
        const nuevas = Array.isArray(datos.games) ? datos.games : [];
        const viejas = estado.partidasPorRonda[ronda.id] || [];
        const ahora = Date.now();
        estado.partidasPorRonda[ronda.id] = nuevas.map((g) => {
            const antes = viejas.find((v) => v.id === g.id);
            if (antes && medias(antes.fen) > medias(g.fen) && !resultado(g.status)) return antes;
            // thinkTime: segundos desde la última jugada, para que el reloj corra.
            g._desde = typeof g.thinkTime === "number" ? ahora - g.thinkTime * 1000 : (antes && antes._desde) || ahora;
            return g;
        });
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
        const filas = String(fen || POSICION_INICIAL).split(" ")[0].split("/");
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
        const t = String(fen || POSICION_INICIAL).split(" ")[1];
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
        const r = reloj(relojAhora(j, partida, juega));
        if (r) {
            const c = document.createElement("span");
            c.className = "cine-reloj font-mono";
            c.dataset.reloj = color;
            c.textContent = r;
            c.setAttribute("aria-label", "Reloj: " + r);
            der.appendChild(c);
        }
        el.appendChild(der);
    }

    // El reloj de quien juega corre desde su última jugada (_desde); el del otro
    // está quieto. Antes de la primera jugada no corre ninguno: no se sabe
    // cuándo se echó a andar el reloj de las blancas.
    function relojAhora(j, partida, juega) {
        const cs = j && j.clock;
        if (typeof cs !== "number") return cs;
        if (!juega || !partida || !partida._desde || medias(partida.fen) === 0) return cs;
        return Math.max(0, cs - Math.floor((Date.now() - partida._desde) / 10));
    }

    // Cada segundo, solo el número del reloj que corre (no se redibuja nada más).
    function actualizarRelojes() {
        const g = partidasDeLaRonda().find((p) => p.id === estado.partidaElegida);
        if (!g || resultado(g.status)) return;
        const turno = turnoDeFen(g.fen);
        const span = document.querySelector('#cine-' + (turno === "w" ? "blancas" : "negras") + ' [data-reloj]');
        const j = (g.players || [])[turno === "w" ? 0 : 1];
        const r = reloj(relojAhora(j, g, true));
        if (span && r && span.textContent !== r) span.textContent = r;
    }
    setInterval(actualizarRelojes, 1000);

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

    // Lo que tiene el foco adentro de una lista que se redibuja con cada jugada:
    // se anota antes y se devuelve después, si no quien navega con Tab lo
    // pierde en cada jugada.
    function focoEn(contenedor, dato) {
        const a = document.activeElement;
        return a && contenedor.contains(a) ? a.dataset[dato] : null;
    }
    function devolverFoco(contenedor, dato, valor) {
        if (!valor) return;
        const b = [...contenedor.querySelectorAll("button")].find((x) => x.dataset[dato] === valor);
        if (b) b.focus();
    }

    function pintarCartelera() {
        const lista = $("cine-cartelera");
        const enfocada = focoEn(lista, "partida");
        lista.innerHTML = "";
        partidasDeLaRonda().forEach((g, i) => {
            const [w, b] = g.players || [];
            const res = resultado(g.status);
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "cine-miniatura w-full text-left rounded-xl p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            const elegida = g.id === estado.partidaElegida;
            btn.dataset.partida = g.id;
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
        devolverFoco(lista, "partida", enfocada);
    }

    function pintarRondas() {
        const ul = $("cine-rondas");
        const enfocada = focoEn(ul, "ronda");
        ul.innerHTML = "";
        estado.rondas.forEach((r) => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            const elegida = estado.rondaElegida && r.id === estado.rondaElegida.id;
            btn.className = "cine-ronda px-4 py-2 rounded-full text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950";
            btn.dataset.ronda = r.id;
            btn.setAttribute("aria-pressed", String(!!elegida));
            btn.textContent = r.name || "Ronda";
            if (rondaJugandose(r)) {
                const vivo = document.createElement("span");
                vivo.className = "cine-envivo ml-2";
                vivo.textContent = "en vivo";
                btn.appendChild(vivo);
            }
            btn.addEventListener("click", () => { estado.aMano = true; elegirRonda(r); });
            li.appendChild(btn);
            ul.appendChild(li);
        });
        devolverFoco(ul, "ronda", enfocada);
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
        if (estado.sala && (estado.sala.pizarras || []).length) { pintarOficial(); return; }
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

    // ---- La pizarra oficial (chess-results) --------------------------------------

    async function cargarOficial() {
        try {
            const { data, error } = await sb.functions.invoke("pizarra-torneo", { body: { clave: estado.sala.clave } });
            if (error) throw error;
            estado.oficiales = Array.isArray(data && data.pizarras) ? data.pizarras : [];
            estado.oficialError = null;
        } catch (e) {
            console.error(e);
            estado.oficialError = "No pudimos leer las posiciones de chess-results ahora mismo. Se vuelve a intentar sola en un rato.";
        }
        pintarOficial();
    }

    function programarPizarra() {
        clearTimeout(estado.temporizadorPizarra);
        estado.temporizadorPizarra = setTimeout(async () => {
            if (!document.hidden) await cargarOficial();
            programarPizarra();
        }, PIZARRA_MS);
    }

    function hora(iso) {
        const d = new Date(iso);
        return isNaN(d) ? "" : d.toLocaleTimeString("es-CR", { timeZone: "America/Costa_Rica", hour: "numeric", minute: "2-digit" });
    }

    function pintarOficial() {
        const pizarrasSala = estado.sala.pizarras || [];
        const cuerpo = $("pizarra-cuerpo");
        const nota = $("pizarra-nota");
        const vacia = $("pizarra-vacia");
        const fuente = $("pizarra-fuente");
        $("pizarra-col4").textContent = "Elo";
        $("pizarra-leyenda").textContent = "Posiciones oficiales del torneo: puesto, jugador, puntos y Elo";
        cuerpo.innerHTML = "";

        // Las pestañas: una por pizarra, si hay más de una.
        const pestanas = $("pizarra-pestanas");
        pestanas.innerHTML = "";
        pestanas.classList.toggle("hidden", pizarrasSala.length < 2);
        if (estado.pestana >= pizarrasSala.length) estado.pestana = 0;
        pizarrasSala.forEach((p, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "pizarra-pestana px-3 py-1 rounded-full text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            b.textContent = p.titulo;
            b.setAttribute("aria-pressed", String(i === estado.pestana));
            b.addEventListener("click", () => { estado.pestana = i; pintarOficial(); pestanas.querySelectorAll("button")[i].focus(); });
            pestanas.appendChild(b);
        });

        if (!estado.oficiales) {
            nota.textContent = estado.oficialError || "Cargando las posiciones de chess-results…";
            vacia.classList.add("hidden");
            fuente.classList.add("hidden");
            return;
        }
        const titulo = (pizarrasSala[estado.pestana] || {}).titulo;
        const p = estado.oficiales.find((x) => x.titulo === titulo) || estado.oficiales[estado.pestana];
        if (!p || p.error) {
            nota.textContent = (p && p.error) || "Esta pizarra no se pudo leer.";
            vacia.classList.add("hidden");
            fuente.classList.add("hidden");
            return;
        }
        nota.textContent = (p.ronda || "Posiciones") + " · posiciones oficiales de chess-results" +
            (estado.oficialError ? " · " + estado.oficialError : "");
        const filas = Array.isArray(p.filas) ? p.filas : [];
        vacia.textContent = "chess-results todavía no publicó las posiciones de este torneo.";
        vacia.classList.toggle("hidden", filas.length > 0);
        // Medallas solo cuando ya hay puntos: en la ronda 0 todos tienen 0.
        const hayPuntos = filas.some((f) => f.puntos && f.puntos !== "0");
        filas.forEach((f) => {
            const tr = document.createElement("tr");
            tr.className = "pizarra-linea";
            const puesto = document.createElement("td");
            puesto.className = "py-2 pr-2 whitespace-nowrap align-top";
            const n = Number(f.puesto);
            puesto.textContent = (hayPuntos && n >= 1 && n <= 3 ? ["🥇", "🥈", "🥉"][n - 1] + " " : "") + f.puesto;
            tr.appendChild(puesto);
            const th = document.createElement("th");
            th.scope = "row";
            th.className = "py-2 pr-2 text-left align-top";
            const nombre = document.createElement("span");
            nombre.className = "font-semibold block";
            nombre.textContent = (f.titulo ? f.titulo + " " : "") + f.nombre;
            th.appendChild(nombre);
            if (f.club) {
                const club = document.createElement("span");
                club.className = "pizarra-tenue text-xs font-normal block";
                club.textContent = f.club;
                th.appendChild(club);
            }
            tr.appendChild(th);
            const pts = document.createElement("td");
            pts.className = "py-2 pr-2 text-right font-bold pizarra-puntos align-top";
            pts.textContent = f.puntos;
            tr.appendChild(pts);
            const elo = document.createElement("td");
            elo.className = "py-2 text-right pizarra-tenue align-top";
            elo.textContent = f.elo && f.elo !== "0" ? f.elo : "–";
            tr.appendChild(elo);
            cuerpo.appendChild(tr);
        });

        fuente.innerHTML = "";
        if (Array.isArray(p.desempates) && p.desempates.length) {
            fuente.appendChild(document.createTextNode("Desempates, en orden: " + p.desempates.join(", ") + ". "));
        }
        if (p.viejo && p.leido_en) {
            fuente.appendChild(document.createTextNode("Sin conexión con chess-results: es lo último que se leyó, a las " + hora(p.leido_en) + ". "));
        }
        if (p.url) {
            const a = document.createElement("a");
            a.href = p.url;
            a.target = "_blank";
            a.rel = "noopener";
            a.className = "underline underline-offset-2 hover:text-white rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400";
            a.textContent = "Ver en chess-results";
            const sr = document.createElement("span");
            sr.className = "sr-only";
            sr.textContent = " (se abre en otra pestaña)";
            a.appendChild(sr);
            a.appendChild(document.createTextNode(" ↗"));
            fuente.appendChild(a);
        }
        fuente.classList.remove("hidden");
    }

    // ---- El ciclo ----------------------------------------------------------------

    function horaDeAhora() {
        return new Date().toLocaleTimeString("es-CR", { timeZone: "America/Costa_Rica", hour: "numeric", minute: "2-digit" });
    }

    function pintarTodo() {
        pintarRondas();
        pintarPantalla();
        pintarCartelera();
        // La pizarra oficial (chess-results) no depende de las jugadas: se pinta
        // cuando llega (cargarOficial), y así no se le roba el foco a sus pestañas.
        if (!(estado.sala && (estado.sala.pizarras || []).length)) pintarPizarra();
        $("cine-actualizado").textContent = estado.vivoConectado
            ? "En vivo: cada jugada llega al instante ·"
            : "Actualizado a las " + horaDeAhora() + " ·";
    }

    // Muchas jugadas juntas (al conectarse llegan todas las partidas) se pintan
    // una sola vez, en el siguiente cuadro.
    function pintarPronto() {
        if (estado.pintado) return;
        estado.pintado = requestAnimationFrame(() => { estado.pintado = 0; pintarTodo(); });
    }

    // Una ronda se sigue pidiendo mientras no hayan terminado todas sus
    // partidas; una ronda sin partidas todavía (no empezó) también: si no, la
    // sala abierta antes de la hora no se enteraba nunca de que empezó.
    function rondaEnCurso(r) {
        if (!r) return false;
        if (r.ongoing) return true;
        const partidas = estado.partidasPorRonda[r.id] || [];
        if (!partidas.length) return !r.finished;
        return partidas.some((g) => !resultado(g.status));
    }

    // «En vivo» en el botón de la ronda: ya se está jugando (no solo pareada).
    function rondaJugandose(r) {
        if (r.ongoing) return true;
        return (estado.partidasPorRonda[r.id] || []).some((g) => !resultado(g.status) && medias(g.fen) > 0);
    }

    function programar() {
        clearTimeout(estado.temporizador);
        estado.temporizador = setTimeout(refrescar, CADA_MS);
    }

    // El respaldo: la ronda entera cada CADA_MS, mientras siga en curso. Una
    // pestaña escondida no le pide nada a Lichess.
    async function refrescar() {
        clearTimeout(estado.temporizador);
        const r = estado.rondaElegida;
        if (!document.hidden && rondaEnCurso(r)) {
            try { await cargarRonda(r); pintarTodo(); } catch (e) { console.error(e); }
            if (!estado.vivo) abrirVivo(r);
        }
        programar();
    }

    // ---- La transmisión continua -------------------------------------------------

    function cerrarVivo() {
        clearTimeout(estado.vivoReintento);
        if (estado.vivo) estado.vivo.ctrl.abort();
        estado.vivo = null;
        estado.vivoConectado = false;
    }

    // Lichess manda el PGN de cada partida que cambia; entre una y otra, dos
    // renglones vacíos (el PGN de una partida tiene uno solo, entre la
    // cabecera y las jugadas).
    function abrirVivo(r) {
        cerrarVivo();
        if (!r || !rondaEnCurso(r) || typeof Chess === "undefined") return;
        const ctrl = new AbortController();
        estado.vivo = { ctrl, ronda: r.id };
        (async () => {
            try {
                const res = await fetch(LICHESS + "/api/stream/broadcast/round/" + encodeURIComponent(r.id) + ".pgn",
                    { signal: ctrl.signal, cache: "no-store" });
                if (!res.ok || !res.body) throw new Error("Lichess respondió " + res.status + " a la transmisión continua");
                estado.vivoConectado = true;
                pintarPronto();
                const lector = res.body.getReader();
                const texto = new TextDecoder();
                let resto = "";
                for (;;) {
                    const { value, done } = await lector.read();
                    if (done) break;
                    resto += texto.decode(value, { stream: true }).replace(/\r\n/g, "\n");
                    let corte;
                    while ((corte = resto.search(/\n\n\n/)) >= 0) {
                        recibirPgn(r.id, resto.slice(0, corte));
                        resto = resto.slice(corte).replace(/^\n+/, "");
                    }
                }
                if (resto.trim()) recibirPgn(r.id, resto);
            } catch (e) {
                if (ctrl.signal.aborted) return;
                console.error(e);
            }
            if (ctrl.signal.aborted || !estado.vivo || estado.vivo.ctrl !== ctrl) return;
            // Se cortó (o Lichess la cerró): se vuelve a abrir mientras la ronda
            // siga en curso. Hasta entonces, el respaldo de CADA_MS.
            estado.vivo = null;
            estado.vivoConectado = false;
            pintarPronto();
            estado.vivoReintento = setTimeout(() => {
                if (estado.rondaElegida && estado.rondaElegida.id === r.id && !document.hidden) abrirVivo(r);
            }, REINTENTO_MS);
        })();
    }

    // Una partida que llegó por la transmisión continua: se reproduce su PGN con
    // chess.js (así la posición es de verdad legal) y se actualiza en su lugar.
    function recibirPgn(rondaId, pgn) {
        if (!pgn.trim()) return;
        const cab = {};
        pgn.replace(/^\[(\w+) "((?:[^"\\]|\\.)*)"\]\s*$/gm, (_, k, v) => { cab[k] = v; return ""; });
        const id = ((cab.GameURL || "").match(/\/([A-Za-z0-9]{8})\/?$/) || [])[1];
        if (!id) return;
        const juego = new Chess();
        if (!juego.load_pgn(pgn, { sloppy: true })) { console.error("PGN que no se pudo leer:", id); return; }
        const historia = juego.history({ verbose: true });
        const ultima = historia[historia.length - 1];
        const jugadas = pgn.replace(/^\[.*\]\s*$/gm, "");
        const relojes = [...jugadas.matchAll(/\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g)]
            .map((m) => Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 100));
        const res = { "1-0": "1-0", "0-1": "0-1", "1/2-1/2": "½-½", "½-½": "½-½" }[cab.Result] || "*";

        const lista = estado.partidasPorRonda[rondaId] || (estado.partidasPorRonda[rondaId] = []);
        let g = lista.find((x) => x.id === id);
        if (!g) {
            const jugador = (lado) => ({
                name: cab[lado] || "", title: cab[lado + "Title"] || undefined,
                rating: Number(cab[lado + "Elo"]) || undefined,
            });
            g = { id, players: [jugador("White"), jugador("Black")], status: "*" };
            lista.push(g);
        }
        const fen = juego.fen();
        if (medias(g.fen) > historia.length && res === "*") return;   // llegó atrasada
        if (medias(g.fen) !== historia.length || !g._desde) g._desde = Date.now();
        g.fen = fen;
        g.lastMove = ultima ? ultima.from + ultima.to : undefined;
        g.status = res;
        g.check = juego.in_checkmate() ? "#" : juego.in_check() ? "+" : undefined;
        // Un [%clk] por jugada: los de índice par son de las blancas.
        if (relojes.length === historia.length && relojes.length) {
            const [w, b] = g.players || [];
            const blancas = relojes.filter((_, i) => i % 2 === 0), negras = relojes.filter((_, i) => i % 2 === 1);
            if (w && blancas.length) w.clock = blancas[blancas.length - 1];
            if (b && negras.length) b.clock = negras[negras.length - 1];
        }
        if (estado.rondaElegida && estado.rondaElegida.id === rondaId) pintarPronto();
    }

    // ---- El torneo, cada TORNEO_MS: rondas nuevas y cuál está en curso ---------

    async function refrescarTorneo() {
        clearTimeout(estado.temporizadorTorneo);
        if (!document.hidden) {
            try {
                const datos = await pedir(LICHESS + "/api/broadcast/" + encodeURIComponent(torneo.id));
                if (Array.isArray(datos.rounds) && datos.rounds.length) {
                    estado.rondas = datos.rounds;
                    const actual = estado.rondas.find((r) => estado.rondaElegida && r.id === estado.rondaElegida.id);
                    if (actual) estado.rondaElegida = actual;
                    const ahora = rondaInicial(datos);
                    // Sin haber elegido a mano, la sala sigue a la ronda en curso.
                    if (!estado.aMano && ahora && estado.rondaElegida && ahora.id !== estado.rondaElegida.id) {
                        await elegirRonda(ahora);
                    } else {
                        pintarTodo();
                    }
                }
            } catch (e) { console.error(e); }
        }
        estado.temporizadorTorneo = setTimeout(refrescarTorneo, TORNEO_MS);
    }

    async function elegirRonda(r) {
        estado.rondaElegida = r;
        estado.partidaElegida = null;
        cerrarVivo();
        if (!estado.partidasPorRonda[r.id] || rondaEnCurso(r)) {
            try { await cargarRonda(r); } catch (e) { console.error(e); estado.partidasPorRonda[r.id] = estado.partidasPorRonda[r.id] || []; }
        }
        pintarTodo();
        abrirVivo(r);
        programar();
    }

    // Con enlace a Lichess si se sabe cuál es; si no (la sala no existe), a
    // la lista de torneos.
    function mostrarError(texto) {
        $("loading").classList.add("hidden");
        $("cine-error-texto").textContent = texto;
        const a = $("cine-error-enlace");
        if (torneo && torneo.enlace) {
            a.href = torneo.enlace;
        } else {
            a.href = "torneos-en-vivo.html";
            a.removeAttribute("target");
            a.textContent = "Ver todos los torneos";
        }
        $("cine-error").classList.remove("hidden");
    }

    // El comentarista en video, si la sala tiene uno de YouTube o Twitch (la
    // base no deja guardar otro). El reproductor lo arma js/video-embebido.js.
    function pintarComentarista(sala) {
        const v = window.VideoEmbebido ? VideoEmbebido.leer(sala.video_url) : null;
        const caja = $("cine-comentarista");
        const lugar = $("cine-comentarista-video");
        lugar.innerHTML = "";
        if (!v || !v.embedUrl) { caja.classList.add("hidden"); return; }
        const marco = document.createElement("iframe");
        marco.src = v.embedUrl;
        marco.title = "Comentarista en vivo de " + sala.nombre + (v.kind === "twitch" ? " (Twitch)" : " (YouTube)");
        marco.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        marco.allowFullscreen = true;
        marco.loading = "lazy";
        lugar.appendChild(marco);
        caja.classList.remove("hidden");
    }

    // La sala de la clave, o la primera sala de Lichess visible si no se dijo cuál.
    async function buscarSala() {
        if (clave) return SalasTorneo.porClave(clave);
        return (await SalasTorneo.listar()).find((s) => s.visible && s.tipo === "lichess") || null;
    }

    async function arrancar() {
        let sala;
        try {
            sala = await buscarSala();
        } catch (e) {
            console.error(e);
            mostrarError("No pudimos cargar esta sala ahora mismo. Vuelve a intentarlo en un rato.");
            return;
        }
        if (!sala || sala.tipo !== "lichess" || !sala.lichess_id) {
            mostrarError("Esta sala no existe o todavía no está abierta.");
            return;
        }
        estado.sala = sala;
        if ((sala.pizarras || []).length) { cargarOficial().then(programarPizarra); }
        const aLichess = (Array.isArray(sala.enlaces) ? sala.enlaces : []).find((e) => /^https:\/\/lichess\.org\//.test(e.url));
        torneo = { id: sala.lichess_id, nombre: sala.nombre, enlace: aLichess ? aLichess.url : "https://lichess.org/broadcast/-/" + sala.lichess_id };
        $("cine-titulo").textContent = torneo.nombre;
        document.title = torneo.nombre + " — Ajedrez Integral";
        pintarComentarista(sala);
        if (window.Quiniela) Quiniela.iniciar(sala);
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
        if (estado.tour.url && /^https:\/\/lichess\.org\//.test(estado.tour.url)) {
            torneo.enlace = estado.tour.url;
            $("cine-lichess").href = torneo.enlace;
        }
        estado.rondas = Array.isArray(datos.rounds) ? datos.rounds : [];
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
        estado.temporizadorTorneo = setTimeout(refrescarTorneo, TORNEO_MS);
    }

    // Con la ventana cambiando de ancho, la pieza se vuelve a medir.
    window.addEventListener("resize", () => document.querySelectorAll(".cine-tablero").forEach(ajustarPiezas));
    document.addEventListener("visibilitychange", () => {
        if (document.hidden || !estado.rondaElegida) return;
        refrescar();
        if (!estado.vivo) abrirVivo(estado.rondaElegida);
    });

    // Para el verificador.
    window.Transmision = { posiciones, piezasDeFen, resultado, recibirPgn, refrescarTorneo };

    arrancar();
})();
