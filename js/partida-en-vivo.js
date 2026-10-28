/* Una partida de un tablero de verdad, transmitida en vivo: lo que comparten
 * quien la manda (camara-tablero.html, la cámara encima del tablero) y quien
 * la mira (tablero-vivo.html, sin cuenta).
 *
 * Va por un canal de Supabase Realtime en modo Broadcast, sin tabla, igual que
 * «Actualizar sola (en vivo)» de Pareo Integral: el nombre del canal
 * (tablero-vivo-<código>) hace de contraseña, y por eso el código es de 8
 * caracteres al azar, sin 0/1/i/l/o para poder dictarlo. Ver «La partida en
 * vivo desde la cámara» en docs/decisiones/juegos-y-torneos.md.
 *
 *   PartidaEnVivo.nuevoCodigo()         → «k7mq2xpa»
 *   PartidaEnVivo.codigoValido(c)
 *   PartidaEnVivo.canal(c)              → nombre del canal
 *   PartidaEnVivo.enlace(c)             → la dirección para mirarla
 *   PartidaEnVivo.estado(juego, nombres, donde, resultado) → lo que se manda
 *   PartidaEnVivo.leer(payload)         → { juego, blancas, negras, resultado } o null
 *   PartidaEnVivo.resultadoSolo(juego)  → «1-0», «=» o «0-1» si el tablero ya lo dice (mate, ahogado)
 *   PartidaEnVivo.pgn(juego, resultado) → el PGN con su [Result]
 *   PartidaEnVivo.pintar(div, juego, { girado })
 *
 * En un torneo de Pareo Integral, todas las cámaras transmiten por el mismo
 * canal (el código del torneo) y cada mensaje dice su torneo, su ronda y su
 * mesa física: quien mira ve todas las mesas juntas.
 *   PartidaEnVivo.torneoDe(texto)       → el id de un enlace de Torneos en Pareo Integral
 *   PartidaEnVivo.mesasDe(datos, ronda) → { ronda, mesas: [{ mesa, blancas, negras }] }
 */
(function () {
    "use strict";
    if (window.PartidaEnVivo) return;

    const LETRAS = "abcdefghjkmnpqrstuvwxyz23456789";
    const VALIDO = /^[a-hjkmnp-z2-9]{8}$/;

    function nuevoCodigo() {
        const n = new Uint8Array(8);
        crypto.getRandomValues(n);
        return Array.from(n, (x) => LETRAS[x % LETRAS.length]).join("");
    }
    const codigoValido = (c) => VALIDO.test(String(c || ""));
    const canal = (c) => "tablero-vivo-" + c;
    // Con .html: sirve igual en el sitio (que lo redirige sin perder el #) y
    // en un servidor de prueba.
    const enlace = (c, torneo) => new URL("tablero-vivo.html#" + c + (torneo ? "&t=" + torneo : ""), location.href).href;

    const nombre = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 60);

    const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    // El id del torneo en su enlace («torneos-pareo.html#t=…») o suelto.
    const torneoDe = (texto) => { const m = String(texto || "").toLowerCase().match(UUID); return m ? m[0] : null; };
    const entero = (x, max) => (Number.isInteger(x) && x >= 1 && x <= max ? x : null);

    /* El resultado, en la notación de Pareo Integral: «1-0», «=» (tablas) y
     * «0-1». El de una partida que terminó en el tablero (mate, ahogado, sin
     * material para dar mate) sale solo; los demás (abandono, tiempo, tablas
     * de mutuo acuerdo) los marca quien maneja la cámara. */
    const RESULTADOS = { "1-0": "1-0", "=": "1/2-1/2", "0-1": "0-1" };
    const resultadoValido = (r) => (Object.prototype.hasOwnProperty.call(RESULTADOS, r) ? r : null);
    function resultadoSolo(juego) {
        if (juego.in_checkmate()) return juego.turn() === "w" ? "0-1" : "1-0";
        if (juego.in_stalemate() || juego.insufficient_material()) return "=";
        return null;
    }
    /* El PGN con su resultado en la cabecera, sin tocar la partida que se
     * sigue anotando. */
    function pgn(juego, resultado) {
        const r = resultadoValido(resultado);
        // Sin jugadas, chess.js no vuelve a leer un PGN que es solo el resultado:
        // ahí el resultado viaja aparte (`resultado`) y basta.
        if (!r || !juego.history().length) return juego.pgn();
        const copia = new window.Chess();
        copia.load_pgn(juego.pgn());
        copia.header("Result", RESULTADOS[r]);
        return copia.pgn();
    }

    /* `donde`, en un torneo: { torneo, ronda, mesa }. */
    function estado(juego, nombres, donde, resultado) {
        const r = resultadoValido(resultado);
        const p = { v: 1, pgn: pgn(juego, r), blancas: nombre(nombres && nombres.blancas), negras: nombre(nombres && nombres.negras), t: Date.now() };
        if (r) p.resultado = r;
        if (donde && torneoDe(donde.torneo) && entero(donde.mesa, 999)) {
            p.torneo = torneoDe(donde.torneo); p.mesa = donde.mesa; p.ronda = entero(donde.ronda, 99);
        }
        return p;
    }

    /* La mesa física de la mesa k de una ronda: la misma cuenta que
     * PareoEvento.mesaFisica (el verificador comprueba que den lo mismo; ese
     * módulo es muy grande para cargarlo acá por una línea). */
    const mesaFisica = (datos, k) => (Number(datos.mesaInicial) > 1 ? Math.floor(Number(datos.mesaInicial)) : 1) + k;

    /* Las mesas de una ronda (por omisión, la última emparejada) de un torneo
     * publicado, con los nombres de quien juega con cada color; sin las de
     * «libre». null si el torneo es por equipos o todavía no tiene rondas. */
    function mesasDe(datos, ronda) {
        if (!datos || datos.tipo === "equipos" || !Array.isArray(datos.rondas) || !datos.rondas.length) return null;
        const r = ronda && ronda <= datos.rondas.length ? ronda : datos.rondas.length;
        const R = datos.rondas[r - 1] || {};
        const nom = (id) => ((datos.jugadores || []).find((j) => j.id === id) || {}).nombre || "";
        return {
            ronda: r,
            mesas: (R.mesas || []).map((m, k) => ({ mesa: mesaFisica(datos, k), blancas: nom(m.b), negras: m.n == null ? null : nom(m.n) }))
                .filter((x) => x.negras !== null),
        };
    }

    /* Lo que llega se vuelve a jugar con chess.js: una partida que no es legal
     * no se pinta. Los nombres son texto ajeno: van por textContent. */
    function leer(p) {
        if (!p || p.v !== 1 || typeof p.pgn !== "string" || p.pgn.length > 20000) return null;
        const juego = new window.Chess();
        if (p.pgn.trim() && !juego.load_pgn(p.pgn)) return null;
        const d = { juego, blancas: nombre(p.blancas), negras: nombre(p.negras), t: Number(p.t) || 0, resultado: resultadoValido(p.resultado) };
        if (torneoDe(p.torneo) && entero(p.mesa, 999)) { d.torneo = torneoDe(p.torneo); d.mesa = p.mesa; d.ronda = entero(p.ronda, 99); }
        return d;
    }

    const COLUMNAS = "abcdefgh";

    function pintar(div, juego, opciones) {
        const girado = !!(opciones && opciones.girado);
        const hist = juego.history({ verbose: true });
        const ultima = hist[hist.length - 1];
        div.textContent = "";
        for (let fila = 0; fila < 8; fila++) {
            for (let col = 0; col < 8; col++) {
                const f = girado ? 7 - col : col, r = girado ? fila : 7 - fila;
                const cas = COLUMNAS[f] + (r + 1);
                const c = document.createElement("div");
                c.dataset.square = cas;
                const oscura = (f + r) % 2 === 0;
                c.className = "relative flex items-center justify-center";
                c.style.background = oscura ? "var(--sq-dark, #486581)" : "var(--sq-light, #f0f4f8)";
                if (ultima && (cas === ultima.from || cas === ultima.to)) c.style.boxShadow = "inset 0 0 0 4px rgba(250, 204, 21, 0.9)";
                const p = juego.get(cas);
                if (p) {
                    // La pieza como la eligió quien mira (Configuración): js/pieza-preferida.js.
                    const s = document.createElement("span");
                    if (window.PiezaPreferida) window.PiezaPreferida.pintar(s, p.type, p.color, { clase: "w-[88%] h-[88%] flex items-center justify-center leading-none" });
                    else s.textContent = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }[p.type];
                    c.style.fontSize = "min(8vw, 2.4rem)";
                    c.append(s);
                }
                div.append(c);
            }
        }
        // Las letras y los números, por fuera del tablero como en todo el sitio.
        // (Los tableros chicos de la cuadrícula de un torneo, sin ellas.)
        if (window.Coordenadas && !div.dataset.coordenadas && !(opciones && opciones.coordenadas === false)) { div.dataset.coordenadas = "1"; window.Coordenadas.aplicar(div); }
    }

    /* Las jugadas para leer: «1. e4 e5 2. Cf3», en algebraica española. */
    /* Desde qué jugada arranca la partida: una que se cargó con un FEN no
     * empieza en la 1 ni, a veces, con las blancas. */
    function arranque(juego) {
        const j = new window.Chess();
        if (!j.load_pgn(juego.pgn())) return { n: 1, negras: false };
        while (j.undo()) { /* hasta la posición de la que arrancó */ }
        const partes = j.fen().split(" ");
        return { n: Number(partes[5]) || 1, negras: partes[1] === "b" };
    }
    // El número y los puntos de la jugada i (desde 0): «4.» o «4…».
    function numero(ini, i) {
        const ply = i + (ini.negras ? 1 : 0);
        return ini.n + Math.floor(ply / 2) + (ply % 2 ? "…" : ".");
    }

    function jugadasTexto(juego) {
        const es = (s) => (window.ComandosTablero ? window.ComandosTablero.jugadaParaMostrar(s) : s);
        const ini = arranque(juego);
        let txt = "";
        juego.history().forEach((s, i) => {
            const blancas = (i + (ini.negras ? 1 : 0)) % 2 === 0;
            txt += (blancas || i === 0 ? numero(ini, i) + " " : "") + es(s) + " ";
        });
        return txt.trim();
    }

    /* Cómo va: «Última jugada: 12. Cf3. Juegan las negras.», o el mate,
     * el ahogado o el jaque. */
    function comoVa(juego) {
        const es = (x) => (window.ComandosTablero ? window.ComandosTablero.jugadaParaMostrar(x) : x);
        const hist = juego.history(), n = hist.length;
        let fin = "";
        if (juego.in_checkmate()) fin = "Jaque mate.";
        else if (juego.in_stalemate()) fin = "Tablas por ahogado.";
        else if (juego.in_check()) fin = "Jaque.";
        const ultima = n ? "Última jugada: " + numero(arranque(juego), n - 1) + " " + es(hist[n - 1]) : (juego.fen() === new window.Chess().fen() ? "La partida está en la posición inicial" : "Todavía no se ha jugado nada desde esta posición");
        return ultima + ". " + (fin || "Juegan " + (juego.turn() === "w" ? "las blancas" : "las negras") + ".");
    }

    /* «Terminó 1-0», para quien mira. */
    const TEXTO_RESULTADO = { "1-0": "Terminó: ganan las blancas (1-0).", "=": "Terminó en tablas (½-½).", "0-1": "Terminó: ganan las negras (0-1)." };
    const textoResultado = (r) => TEXTO_RESULTADO[r] || "";

    window.PartidaEnVivo = { nuevoCodigo, codigoValido, canal, enlace, estado, leer, pintar, jugadasTexto, comoVa, torneoDe, mesaFisica, mesasDe, resultadoSolo, pgn, textoResultado };
})();
