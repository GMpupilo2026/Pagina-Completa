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
 *   PartidaEnVivo.estado(juego, nombres) → lo que se manda
 *   PartidaEnVivo.leer(payload)         → { juego, blancas, negras } o null
 *   PartidaEnVivo.pintar(div, juego, { girado })
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
    const enlace = (c) => new URL("tablero-vivo.html#" + c, location.href).href;

    const nombre = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 60);

    function estado(juego, nombres) {
        return { v: 1, pgn: juego.pgn(), blancas: nombre(nombres && nombres.blancas), negras: nombre(nombres && nombres.negras), t: Date.now() };
    }

    /* Lo que llega se vuelve a jugar con chess.js: una partida que no es legal
     * no se pinta. Los nombres son texto ajeno: van por textContent. */
    function leer(p) {
        if (!p || p.v !== 1 || typeof p.pgn !== "string" || p.pgn.length > 20000) return null;
        const juego = new window.Chess();
        if (p.pgn.trim() && !juego.load_pgn(p.pgn)) return null;
        return { juego, blancas: nombre(p.blancas), negras: nombre(p.negras), t: Number(p.t) || 0 };
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
        if (window.Coordenadas && !div.dataset.coordenadas) { div.dataset.coordenadas = "1"; window.Coordenadas.aplicar(div); }
    }

    /* Las jugadas para leer: «1. e4 e5 2. Cf3», en algebraica española. */
    function jugadasTexto(juego) {
        const es = (s) => (window.ComandosTablero ? window.ComandosTablero.jugadaParaMostrar(s) : s);
        let txt = "";
        juego.history().forEach((s, i) => { txt += (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + es(s) + " "; });
        return txt.trim();
    }

    window.PartidaEnVivo = { nuevoCodigo, codigoValido, canal, enlace, estado, leer, pintar, jugadasTexto };
})();
