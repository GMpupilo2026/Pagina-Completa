/* Reclamos de tablas desde el PGN: el cálculo, sin pantalla.

   La usa reclamos-tablas.html y la prueba herramientas/verificar-reclamos-tablas.js
   en Node, sin navegador. Recorre la partida con chess.js y dice, según las
   Leyes del Ajedrez de la FIDE:

   - Art. 9.2, triple repetición: en qué jugada apareció una posición por
     tercera vez y quién podía reclamar (quien iba a hacer esa jugada,
     anotándola antes; o el rival, en su turno, apenas apareció).
   - Art. 9.3, 50 jugadas: desde qué jugada cada jugador llevaba 50 sin mover
     un peón ni capturar.
   - Art. 9.6, tablas sin reclamo: la misma posición cinco veces (9.6.1) o 75
     jugadas de cada uno sin peón ni captura (9.6.2, salvo que la última dé
     mate).
   - Si un reclamo hecho en la jugada N por un color procedía.

   «La misma posición» es la del 9.2.2: las mismas piezas en las mismas
   casillas, el mismo jugador con el turno y las mismas posibilidades de
   enroque y de captura al paso. La captura al paso cuenta solo si de verdad
   se puede hacer (chess.js marca la casilla después de cualquier avance de
   dos, aunque nadie pueda capturar: eso no hace distinta la posición).

   Acepta el PGN en algebraica inglesa (Nf3) o española (Cf3), con 0-0 o
   O-O. Ver «Reclamos de tablas desde el PGN» en
   docs/decisiones/juegos-y-torneos.md. */
(function (global) {
    "use strict";
    const ChessCtor = global.Chess || (typeof require === "function" ? require("chess.js").Chess : null);

    /* Separa un archivo con varias partidas: cada una empieza con su [Event …]
       (o con la primera etiqueta, si no trae Event). */
    function partidas(texto) {
        const t = String(texto || "").replace(/\r\n?/g, "\n").trim();
        if (!t) return [];
        const trozos = t.split(/\n\s*\n(?=\s*\[Event\s)/);
        return trozos.map((x) => x.trim()).filter(Boolean);
    }

    function etiquetas(pgn) {
        const r = {};
        const re = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm;
        let m;
        while ((m = re.exec(pgn))) r[m[1]] = m[2].replace(/\\(.)/g, "$1");
        return r;
    }

    /* Las jugadas en algebraica española (R, D, T, A, C) pasan a la inglesa que
       entiende chess.js; los enroques con cero, a la letra O. Solo se toca el
       cuerpo de la partida, nunca las etiquetas ni los comentarios. */
    const ES_A_EN = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
    function normalizarJugadas(pgn) {
        const lineas = pgn.split("\n");
        const cab = [], cuerpo = [];
        let enCuerpo = false;
        lineas.forEach((l) => {
            if (!enCuerpo && /^\s*\[/.test(l)) cab.push(l);
            else { if (l.trim()) enCuerpo = true; cuerpo.push(l); }
        });
        let jugadas = cuerpo.join("\n");
        // Los comentarios quedan aparte para no traducir lo que dicen.
        const comentarios = [];
        jugadas = jugadas.replace(/\{[^}]*\}/g, (c) => { comentarios.push(c); return "\u0000" + (comentarios.length - 1) + "\u0000"; });
        jugadas = jugadas.replace(/\b0-0-0\b/g, "O-O-O").replace(/\b0-0\b(?!-)/g, "O-O");
        // Es española si trae alguna jugada de pieza con C, A, T o D (en inglés no existen).
        const espanola = /(^|[\s.])[CATD][a-h]?[1-8]?x?[a-h][1-8]/.test(jugadas) || /=[DTAC]\b/.test(jugadas);
        if (espanola) {
            jugadas = jugadas.replace(/(^|[\s.(])([RDTAC])(?=[a-h1-8x])/g, (m, a, p) => a + ES_A_EN[p])
                .replace(/=([DTAC])/g, (m, p) => "=" + ES_A_EN[p]);
        }
        jugadas = jugadas.replace(/\u0000(\d+)\u0000/g, (m, i) => comentarios[Number(i)]);
        return { texto: cab.join("\n") + "\n\n" + jugadas, espanola };
    }

    /* La posición para comparar (art. 9.2.2): piezas, turno, enroques y la
       captura al paso solo si se puede hacer. */
    function clave(juego) {
        const p = juego.fen().split(" ");
        const alPaso = p[3] !== "-" && juego.moves({ verbose: true }).some((m) => m.flags.indexOf("e") !== -1) ? p[3] : "-";
        return p[0] + " " + p[1] + " " + p[2] + " " + alPaso;
    }

    const COLOR = { w: "Blancas", b: "Negras" };

    /* Una jugada a medias («ply»), numerada como en la planilla: «34.» las
       blancas y «34…» las negras. */
    function rotulo(numero, color) { return numero + (color === "w" ? "." : "…"); }

    function analizar(texto, indice) {
        if (!ChessCtor) throw new Error("Falta chess.js.");
        const lista = partidas(texto);
        if (!lista.length) return { error: "Pega la partida en PGN (o sus jugadas, como 1. e4 e5 2. Cf3…)." };
        const i = Math.min(Math.max(0, indice || 0), lista.length - 1);
        const crudo = lista[i];
        const norm = normalizarJugadas(crudo);
        const cargado = new ChessCtor();
        if (!cargado.load_pgn(norm.texto, { sloppy: true })) {
            return { error: "No se pudo leer la partida: revisa que las jugadas sean legales y estén completas (una jugada mal anotada corta la lectura ahí).", cuantas: lista.length };
        }
        const tags = etiquetas(crudo);
        const fenInicial = tags.SetUp === "1" && tags.FEN ? tags.FEN : null;
        const juego = fenInicial ? new ChessCtor(fenInicial) : new ChessCtor();
        const historia = cargado.history({ verbose: true });

        /* posiciones[k] = la posición después de k jugadas a medias. */
        const posiciones = [];
        const anotar = (ply, san) => {
            const p = juego.fen().split(" ");
            posiciones.push({ ply, clave: clave(juego), reloj: Number(p[4]) || 0, turno: p[1], numero: Number(p[5]) || 1, fen: juego.fen(), san: san || null, mate: juego.in_checkmate() });
        };
        anotar(0, null);
        historia.forEach((m, k) => { juego.move(m.san, { sloppy: true }); anotar(k + 1, m.san); });

        // La jugada a medias k (k ≥ 1) la hizo quien tenía el turno en posiciones[k-1].
        const jugada = (k) => {
            const antes = posiciones[k - 1];
            return { ply: k, numero: antes.numero, color: antes.turno, san: posiciones[k].san, rotulo: rotulo(antes.numero, antes.turno) };
        };

        // Cuántas veces había aparecido cada posición hasta cada momento.
        const vistas = new Map();
        posiciones.forEach((p) => {
            const l = vistas.get(p.clave) || [];
            l.push(p.ply);
            vistas.set(p.clave, l);
            p.vez = l.length;
            p.antes = l.slice();
        });

        const repeticiones = [];
        posiciones.forEach((p) => {
            if (p.vez === 3 && p.ply > 0) {
                const j = jugada(p.ply);
                repeticiones.push({
                    ply: p.ply, fen: p.fen, jugada: j,
                    apariciones: p.antes.map((k) => (k === 0 ? { ply: 0, rotulo: "al empezar" } : Object.assign({}, jugada(k)))),
                    // Quien iba a hacer la jugada podía reclamar anotándola antes; el rival, apenas apareció.
                    podian: [
                        { color: j.color, cuando: "antes de jugar " + j.rotulo + " " + j.san + ", anotándola en la planilla y declarando que la va a hacer" },
                        { color: j.color === "w" ? "b" : "w", cuando: "en su turno, apenas apareció, antes de tocar una pieza" },
                    ],
                });
            }
        });

        const cinco = posiciones.find((p) => p.vez === 5 && p.ply > 0);
        const setenta = posiciones.find((p) => p.reloj >= 150 && !p.mate && p.ply > 0);
        const cincuenta = posiciones.find((p) => p.reloj >= 100);
        let rachaMax = { jugadas: 0 };
        posiciones.forEach((p) => {
            if (p.reloj > (rachaMax.reloj || 0)) rachaMax = { reloj: p.reloj, jugadas: Math.floor(p.reloj / 2), hasta: p.ply ? jugada(p.ply) : null, desde: p.ply - p.reloj + 1 > 0 ? jugada(p.ply - p.reloj + 1) : null };
        });

        return {
            cuantas: lista.length, indice: i, espanola: norm.espanola, etiquetas: tags, fenInicial,
            jugadas: historia.length ? historia.map((m, k) => jugada(k + 1)) : [],
            posiciones, repeticiones,
            cincuenta: cincuenta && cincuenta.ply > 0 ? { ply: cincuenta.ply, jugada: jugada(cincuenta.ply), desde: cincuenta.ply - 99 >= 1 ? jugada(cincuenta.ply - 99) : null } : null,
            cincoVeces: cinco ? { ply: cinco.ply, jugada: jugada(cinco.ply), fen: cinco.fen } : null,
            setentaYCinco: setenta ? { ply: setenta.ply, jugada: jugada(setenta.ply) } : null,
            rachaMax,
        };
    }

    /* ¿Procedía un reclamo hecho en la jugada `numero` por `color` («w»/«b»)?
       El que reclama tiene el turno: o la posición acaba de aparecer (la de
       antes de su jugada), o va a aparecer con la jugada que anotó (la que trae
       el PGN en ese lugar, si la trae). */
    function revisarReclamo(a, tipo, numero, color) {
        const P = a.posiciones;
        const k = P.findIndex((p) => p.numero === numero && p.turno === color);
        if (k === -1) {
            return { procede: false, motivo: "En esa partida " + COLOR[color].toLowerCase() + " nunca tuvieron el turno en la jugada " + numero + ": revisa el número o el color." };
        }
        const antes = P[k], despues = P[k + 1] || null;
        const anotada = despues ? rotulo(numero, color) + " " + despues.san : null;
        if (tipo === "repeticion") {
            if (antes.vez >= 3) {
                return { procede: true, motivo: "Sí procedía: con " + COLOR[color].toLowerCase() + " al turno, la posición acababa de aparecer por " + ordinal(antes.vez) + " vez (art. 9.2.1.2).", fen: antes.fen, apariciones: antes.antes };
            }
            if (despues && despues.vez >= 3) {
                return { procede: true, motivo: "Sí procedía, si antes de jugar " + anotada + " la anotó en la planilla y declaró que la iba a hacer: con esa jugada la posición aparecía por " + ordinal(despues.vez) + " vez (art. 9.2.1.1).", fen: despues.fen, apariciones: despues.antes };
            }
            return { procede: false, motivo: "No procedía: la posición de antes de su jugada había aparecido " + veces(antes.vez) + (despues ? " y la que dejaba " + anotada + ", " + veces(despues.vez) : "") + "; hacen falta tres (art. 9.2).", fen: antes.fen };
        }
        // 50 jugadas
        if (antes.reloj >= 100) {
            return { procede: true, motivo: "Sí procedía: cada jugador llevaba " + Math.floor(antes.reloj / 2) + " jugadas sin mover un peón ni capturar (art. 9.3.2)." };
        }
        if (despues && despues.reloj >= 100) {
            return { procede: true, motivo: "Sí procedía, si antes de jugar " + anotada + " la anotó en la planilla y declaró que la iba a hacer: con esa jugada se completaban las 50 de cada uno sin peón ni captura (art. 9.3.1)." };
        }
        const llevaban = Math.floor(Math.max(antes.reloj, despues ? despues.reloj : 0) / 2);
        return { procede: false, motivo: "No procedía: llevaban " + llevaban + (llevaban === 1 ? " jugada" : " jugadas") + " de cada uno sin mover un peón ni capturar, y hacen falta 50 (art. 9.3)." };
    }

    function ordinal(n) { return ["", "primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima", "octava", "novena", "décima"][n] || (n + ".ª"); }
    function veces(n) { return n === 1 ? "una vez" : n + " veces"; }

    const api = { analizar, revisarReclamo, partidas, normalizarJugadas, clave, COLOR };
    if (typeof module === "object" && module.exports) module.exports = api;
    else global.ReclamosTablas = api;
})(typeof window !== "undefined" ? window : globalThis);
