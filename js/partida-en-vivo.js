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
 *   PartidaEnVivo.estado(juego, nombres, donde, resultado, extra) → lo que se manda
 *     (extra: { tiempos: ms de cada jugada, espera: ms desde la última, retraso: minutos })
 *   PartidaEnVivo.leer(payload, antes)  → { juego, blancas, negras, resultado, tiempos, espera, retraso, id } o null
 *     (o { falta: true, mesa } si es «lo nuevo» y no calza con `antes`: hay que pedir la partida)
 *   PartidaEnVivo.loNuevo(id, juego, desde, donde, resultado, extra) → solo las jugadas desde `desde`
 *   PartidaEnVivo.hasta(juego, k)       → la partida con sus primeras k jugadas
 *   PartidaEnVivo.reloj(ms)             → «1:23» o «1:02:03»
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
     * sigue anotando. Con `tiempos` (ms de cada jugada), cada jugada lleva su
     * tiempo como lo escriben Lichess y ChessBase: {[%emt 0:01:23]}. */
    const emt = (ms) => { const x = Math.max(0, Math.round(ms / 1000)); return Math.floor(x / 3600) + ":" + String(Math.floor(x / 60) % 60).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0"); };
    function pgnConTiempos(juego, r, tiempos) {
        const cab = Object.assign({}, juego.header());
        if (r) cab.Result = RESULTADOS[r];
        const ini = arranque(juego);
        const partes = [];
        juego.history().forEach((san, i) => {
            if ((i + (ini.negras ? 1 : 0)) % 2 === 0 || i === 0) partes.push(numero(ini, i).replace("…", "..."));
            partes.push(san);
            if (Number.isFinite(tiempos[i])) partes.push("{[%emt " + emt(tiempos[i]) + "]}");
        });
        partes.push(r ? RESULTADOS[r] : "*");
        const lineas = Object.entries(cab).map(([k, v]) => "[" + k + ' "' + String(v).replace(/["\\]/g, "") + '"]');
        return (lineas.length ? lineas.join("\n") + "\n\n" : "") + partes.join(" ");
    }
    function pgn(juego, resultado, tiempos) {
        const r = resultadoValido(resultado);
        if (Array.isArray(tiempos) && tiempos.some(Number.isFinite) && juego.history().length) return pgnConTiempos(juego, r, tiempos);
        // Sin jugadas, chess.js no vuelve a leer un PGN que es solo el resultado:
        // ahí el resultado viaja aparte (`resultado`) y basta.
        if (!r || !juego.history().length) return juego.pgn();
        const copia = new window.Chess();
        copia.load_pgn(juego.pgn());
        copia.header("Result", RESULTADOS[r]);
        return copia.pgn();
    }

    /* Cada partida lleva un id (el de la cámara: cambia con cada partida
     * nueva), para que «lo nuevo» se pegue solo a la partida que es. */
    const ID = /^[a-z0-9-]{1,24}$/;
    const idValido = (x) => (typeof x === "string" && ID.test(x) ? x : null);
    const msEnteros = (lista) => lista.map((y) => (Number.isFinite(y) ? Math.max(0, Math.round(y)) : null));

    // Lo que va igual en la partida entera y en lo nuevo.
    function comun(p, r, x, donde) {
        if (r) p.resultado = r;
        if (Number.isFinite(x.espera)) p.espera = Math.max(0, Math.round(x.espera));
        if (x.retraso) p.retraso = entero(x.retraso, 120);
        if (donde && torneoDe(donde.torneo) && entero(donde.mesa, 999)) {
            p.torneo = torneoDe(donde.torneo); p.mesa = donde.mesa; p.ronda = entero(donde.ronda, 99);
        }
        return p;
    }
    /* La partida entera. `donde`, en un torneo: { torneo, ronda, mesa }. */
    function estado(juego, nombres, donde, resultado, extra) {
        const r = resultadoValido(resultado);
        const x = extra || {};
        const p = { v: 1, pgn: pgn(juego, r), blancas: nombre(nombres && nombres.blancas), negras: nombre(nombres && nombres.negras), t: Date.now() };
        if (idValido(x.id)) p.id = x.id;
        const n = juego.history().length;
        if (Array.isArray(x.tiempos)) p.tiempos = msEnteros(x.tiempos.slice(0, n));
        return comun(p, r, x, donde);
    }
    /* Solo lo nuevo: las jugadas desde la `desde` (y sus tiempos). Pesa unos
     * 150 bytes en vez de la partida entera, y quien la recibe no vuelve a
     * leer el PGN: la pega a la que ya tiene. Va como v: 2, que una página
     * vieja no entiende y deja pasar (le llega la entera cuando la pide). */
    function loNuevo(id, juego, desde, donde, resultado, extra) {
        const x = extra || {};
        const hist = juego.history();
        const p = { v: 2, id: idValido(id), desde, san: hist.slice(desde), t: Date.now() };
        if (Array.isArray(x.tiempos)) p.tiempos = msEnteros(x.tiempos.slice(desde, hist.length));
        return comun(p, resultadoValido(resultado), x, donde);
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
    function leer(p, antes) {
        if (p && p.v === 2) return seguir(p, antes);
        if (!p || p.v !== 1 || typeof p.pgn !== "string" || p.pgn.length > 20000) return null;
        const juego = new window.Chess();
        if (p.pgn.trim() && !juego.load_pgn(p.pgn)) return null;
        const d = { juego, blancas: nombre(p.blancas), negras: nombre(p.negras), t: Number(p.t) || 0, resultado: resultadoValido(p.resultado) };
        const n = juego.history().length;
        d.tiempos = Array.isArray(p.tiempos) ? p.tiempos.slice(0, n).map((y) => (Number.isFinite(y) && y >= 0 ? y : null)) : [];
        d.espera = Number.isFinite(p.espera) && p.espera >= 0 ? p.espera : null;
        d.retraso = entero(p.retraso, 120);
        if (torneoDe(p.torneo) && entero(p.mesa, 999)) { d.torneo = torneoDe(p.torneo); d.mesa = p.mesa; d.ronda = entero(p.ronda, 99); }
        d.id = idValido(p.id);
        return d;
    }
    /* Lo nuevo, pegado a la partida que ya se tiene (`antes`, lo que devolvió
     * leer). Si no calza —otra partida, faltó un mensaje, se deshizo algo—
     * devuelve { falta: true, mesa }: hay que pedir la entera. Lo viejo no
     * pisa lo nuevo: si llega atrasado, null. */
    function seguir(p, antes) {
        const mesa = entero(p.mesa, 999);
        const falta = { falta: true, mesa };
        const id = idValido(p.id);
        if (!antes || !antes.juego || !id || antes.id !== id || !Array.isArray(p.san) || p.san.length > 600) return falta;
        if (Number(p.t) < antes.t) return null;
        if ((antes.mesa || null) !== mesa || (antes.torneo || null) !== (torneoDe(p.torneo) || null)) return falta;
        const j = antes.juego;
        if (j.history().length !== p.desde) return falta;
        let k = 0;
        for (const san of p.san) {
            if (typeof san !== "string" || !j.move(san)) { while (k--) j.undo(); return falta; }
            k++;
        }
        const nuevos = Array.isArray(p.tiempos) ? p.tiempos.slice(0, k).map((y) => (Number.isFinite(y) && y >= 0 ? y : null)) : [];
        while (nuevos.length < k) nuevos.push(null);
        const d = { juego: j, blancas: antes.blancas, negras: antes.negras, t: Number(p.t) || 0, resultado: resultadoValido(p.resultado), id };
        d.tiempos = (antes.tiempos || []).slice(0, p.desde).concat(nuevos);
        d.espera = Number.isFinite(p.espera) && p.espera >= 0 ? p.espera : null;
        d.retraso = entero(p.retraso, 120);
        if (antes.torneo) { d.torneo = antes.torneo; d.mesa = antes.mesa; d.ronda = entero(p.ronda, 99) || antes.ronda; }
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

    /* La partida hasta su jugada k (0 = la posición de arranque). */
    function hasta(juego, k) {
        const j = new window.Chess();
        j.load_pgn(juego.pgn());
        const sobran = juego.history().length - k;
        for (let i = 0; i < sobran; i++) j.undo();
        return j;
    }
    /* Un tiempo, para leer: «0:45», «12:03», «1:02:03». */
    function reloj(ms) {
        const x = Math.max(0, Math.round(ms / 1000)), h = Math.floor(x / 3600), m = Math.floor(x / 60) % 60, s2 = String(x % 60).padStart(2, "0");
        return h ? h + ":" + String(m).padStart(2, "0") + ":" + s2 : m + ":" + s2;
    }

    /* «Terminó 1-0», para quien mira. */
    const TEXTO_RESULTADO = { "1-0": "Terminó: ganan las blancas (1-0).", "=": "Terminó en tablas (½-½).", "0-1": "Terminó: ganan las negras (0-1)." };
    const textoResultado = (r) => TEXTO_RESULTADO[r] || "";

    window.PartidaEnVivo = { nuevoCodigo, codigoValido, canal, enlace, estado, loNuevo, leer, pintar, jugadasTexto, comoVa, torneoDe, mesaFisica, mesasDe, resultadoSolo, pgn, textoResultado, hasta, reloj };
})();
