/* Ilustraciones vectoriales de la portada de cada número de la revista
   (las usa generar.js).
   Una función por número: devuelve un <svg> que el generador pone en el centro
   de la portada, entre el sello y el índice. Paleta de la portada: dorado,
   blanco y celeste sobre el azul. Los tableros salen de un FEN que el
   generador valida con chess.js (posiciones de la propia revista). */
"use strict";
const ORO = "#e0b04a", ORO2 = "#c9962b", BLANCO = "#ffffff", CELESTE = "#cfdcf3", NAVY = "#13294b", ROJO = "#d9534f";
const CLARA = "#e4ecf8", OSCURA = "#7f9ccb";

/* Las piezas son el set ilustrado del sitio (js/chess-piece-svg.js, dibujos de
   45×45), con los colores de la portada en vez de las variables de tema. */
global.window = global.window || {};
require("../../js/chess-piece-svg.js");
const DEFS_PIEZAS = window.ChessPieceSVG.PIECE_DEFS
    .split("var(--piece-white)").join("#ffffff")
    .split("var(--piece-black)").join(NAVY);

/* Tablero completo (o recortado a filas/columnas) a partir de un FEN. */
function tablero(fen, x, y, lado, opc = {}) {
    const filas = fen.split(" ")[0].split("/");
    const c = lado / 8;
    let s = DEFS_PIEZAS + `<g transform="translate(${x},${y})">`;
    s += `<rect x="-6" y="-6" width="${lado + 12}" height="${lado + 12}" rx="6" fill="none" stroke="${ORO}" stroke-width="3"/>`;
    filas.forEach((fila, r) => {
        let col = 0;
        for (const ch of fila) {
            if (/\d/.test(ch)) {
                for (let i = 0; i < +ch; i++, col++) s += casilla(r, col, c);
            } else {
                s += casilla(r, col, c);
                const id = (ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase();
                s += `<use href="#${id}" transform="translate(${col * c},${r * c}) scale(${c / 45})"/>`;
                col++;
            }
        }
    });
    if (opc.coordenadas !== false) {
        "abcdefgh".split("").forEach((l, i) => { s += `<text x="${i * c + c / 2}" y="${lado + 20}" font-size="11" fill="${CELESTE}" text-anchor="middle" font-family="Segoe UI, Arial">${l}</text>`; });
        for (let i = 0; i < 8; i++) s += `<text x="-16" y="${i * c + c / 2 + 4}" font-size="11" fill="${CELESTE}" text-anchor="middle" font-family="Segoe UI, Arial">${8 - i}</text>`;
    }
    return s + "</g>";
}
function casilla(r, col, c) {
    return `<rect x="${col * c}" y="${r * c}" width="${c}" height="${c}" fill="${(r + col) % 2 ? OSCURA : CLARA}"/>`;
}

/* Sello redondo dorado con un texto corto (½–½, 1–0…). */
function sello(cx, cy, rad, texto, sub) {
    return `<g transform="rotate(-12 ${cx} ${cy})">
      <circle cx="${cx}" cy="${cy}" r="${rad}" fill="${NAVY}" stroke="${ORO}" stroke-width="4"/>
      <circle cx="${cx}" cy="${cy}" r="${rad - 8}" fill="none" stroke="${ORO}" stroke-width="1.5" stroke-dasharray="3 4"/>
      <text x="${cx}" y="${cy + (sub ? 4 : 12)}" font-size="${rad * 0.62}" font-weight="700" text-anchor="middle" fill="${ORO}" font-family="Georgia, serif">${texto}</text>
      ${sub ? `<text x="${cx}" y="${cy + rad * 0.48}" font-size="${rad * 0.15}" letter-spacing="1" text-anchor="middle" fill="${CELESTE}" font-family="Segoe UI, Arial" font-weight="700">${sub}</text>` : ""}
    </g>`;
}

const svg = (contenido, ancho = 440, alto = 340) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="100%" height="100%" role="img">${contenido}</svg>`;

const ILUSTRACIONES = {
    /* N.º 3 · Posición muerta: rey y alfil contra rey (diagrama 3 de la revista). */
    3: {
        fen: "8/8/4k3/8/2K1B3/8/8/8 w - - 0 1",
        dibujo() {
            return svg(
                tablero(this.fen, 70, 24, 250) +
                sello(374, 214, 56, "½–½", "POSICIÓN MUERTA") +
                `<text x="220" y="332" font-size="13" fill="${CELESTE}" text-anchor="middle" font-family="Segoe UI, Arial" letter-spacing="1">Ninguna serie de jugadas legales lleva al mate · art. 5.2.2</text>`
            );
        },
    },

    /* N.º 8 · El Sistema Suizo: la cruz hecha de casillas y, debajo, la mitad
       de arriba del grupo (S1) contra la de abajo (S2), como en el Holandés. */
    8: {
        dibujo() {
            const t = 18; // lado de una casilla de la cruz
            const brazos = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]; // la cruz en una grilla de 3×3 bloques de 2×2
            const x0 = 220 - 3 * t, y0 = 8;
            let cruz = `<rect x="${x0 - 10}" y="${y0 - 4}" width="${6 * t + 20}" height="${6 * t + 8}" rx="10" fill="rgba(255,255,255,.06)"/>`;
            for (const [bx, by] of brazos) {
                for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
                    const x = x0 + bx * 2 * t + i * t, y = y0 + by * 2 * t + j * t;
                    cruz += `<rect x="${x}" y="${y}" width="${t}" height="${t}" fill="${(bx * 2 + i + by * 2 + j) % 2 ? ORO2 : BLANCO}"/>`;
                }
            }
            const ficha = (x, y, texto) =>
                `<rect x="${x}" y="${y}" width="96" height="24" rx="5" fill="rgba(255,255,255,.1)" stroke="${CELESTE}" stroke-width="1"/>` +
                `<text x="${x + 48}" y="${y + 16.5}" font-size="12.5" fill="${BLANCO}" text-anchor="middle" font-family="Segoe UI, Arial">${texto}</text>`;
            const izq = ["1 · Ana", "2 · Luis", "3 · Sofía"], der = ["4 · Diego", "5 · Marta", "6 · Pablo"];
            let parejas = `<text x="138" y="158" font-size="13" font-weight="700" fill="${ORO}" text-anchor="middle" font-family="Segoe UI, Arial">S1</text>` +
                `<text x="302" y="158" font-size="13" font-weight="700" fill="${ORO}" text-anchor="middle" font-family="Segoe UI, Arial">S2</text>`;
            izq.forEach((n, i) => {
                const y = 166 + i * 34;
                parejas += ficha(90, y, n) + ficha(254, y, der[i]);
                parejas += `<line x1="192" y1="${y + 12}" x2="248" y2="${y + 12}" stroke="${ORO}" stroke-width="2" marker-end="url(#punta8)" marker-start="url(#cola8)"/>`;
            });
            return svg(
                `<defs><marker id="punta8" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${ORO}"/></marker>` +
                `<marker id="cola8" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M10 0 L0 5 L10 10 z" fill="${ORO}"/></marker></defs>` +
                cruz +
                `<text x="220" y="132" font-size="12" fill="${CELESTE}" text-anchor="middle" font-family="Segoe UI, Arial" letter-spacing="2">GRUPO DE 2 PUNTOS</text>` +
                parejas +
                `<text x="220" y="290" font-size="12" fill="${CELESTE}" text-anchor="middle" font-family="Segoe UI, Arial" letter-spacing="1">La mitad de arriba contra la de abajo · Holandés C.04.3</text>`,
                440, 300
            );
        },
    },

    /* N.º 11 · Caída de bandera: el reloj analógico con la bandera izquierda caída. */
    11: {
        dibujo() {
            const esfera = (cx, cy, caida) => {
                let s = `<circle cx="${cx}" cy="${cy}" r="62" fill="${CLARA}" stroke="${ORO}" stroke-width="4"/>`;
                for (let i = 0; i < 12; i++) {
                    const a = (i * 30 * Math.PI) / 180, r1 = i % 3 ? 52 : 47;
                    s += `<line x1="${cx + Math.sin(a) * r1}" y1="${cy - Math.cos(a) * r1}" x2="${cx + Math.sin(a) * 57}" y2="${cy - Math.cos(a) * 57}" stroke="${NAVY}" stroke-width="${i % 3 ? 1.5 : 3}"/>`;
                }
                /* Zona roja de los últimos minutos, junto al 12. */
                s += `<path d="M ${cx} ${cy - 57} A 57 57 0 0 0 ${cx - 57 * Math.sin(Math.PI / 6)} ${cy - 57 * Math.cos(Math.PI / 6)}" fill="none" stroke="${ROJO}" stroke-width="5"/>`;
                /* Aguja del minutero: en la caída, justo en el 12. */
                const am = caida ? 0 : -50;
                const ah = caida ? 180 : 165;
                const p = (ang, r) => [cx + Math.sin((ang * Math.PI) / 180) * r, cy - Math.cos((ang * Math.PI) / 180) * r];
                const [mx, my] = p(am, 48), [hx, hy] = p(ah, 30);
                s += `<line x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}" stroke="${NAVY}" stroke-width="5" stroke-linecap="round"/>`;
                s += `<line x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}" stroke="${NAVY}" stroke-width="3" stroke-linecap="round"/>`;
                s += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${ORO2}"/>`;
                /* La bandera: levantada por el minutero o colgando, ya caída. */
                const fx = cx + 9, fy = cy - 44;
                s += caida
                    ? `<g><line x1="${fx}" y1="${fy}" x2="${fx}" y2="${fy + 22}" stroke="${NAVY}" stroke-width="2"/><path d="M${fx} ${fy + 22} l -9 -3 l 9 -10 z" fill="${ROJO}" stroke="${NAVY}" stroke-width="1"/></g>`
                    : `<g><line x1="${fx}" y1="${fy}" x2="${fx + 16}" y2="${fy - 10}" stroke="${NAVY}" stroke-width="2"/><path d="M${fx + 16} ${fy - 10} l -12 -2 l 5 -9 z" fill="${ROJO}" stroke="${NAVY}" stroke-width="1"/></g>`;
                return s;
            };
            return svg(
                /* Botones de arriba: el de la derecha está hundido (le toca a las blancas, a la izquierda). */
                `<rect x="118" y="38" width="56" height="20" rx="5" fill="${ORO}"/>` +
                `<rect x="266" y="46" width="56" height="12" rx="4" fill="${ORO2}"/>` +
                `<rect x="70" y="56" width="300" height="160" rx="18" fill="${NAVY}" stroke="${ORO}" stroke-width="3"/>` +
                `<rect x="82" y="68" width="276" height="136" rx="12" fill="rgba(255,255,255,.06)"/>` +
                esfera(146, 136, true) + esfera(294, 136, false) +
                `<text x="146" y="238" font-size="12.5" fill="${CELESTE}" text-anchor="middle" font-family="Segoe UI, Arial" letter-spacing="1">BANDERA CAÍDA</text>` +
                `<text x="294" y="238" font-size="12.5" fill="${CELESTE}" text-anchor="middle" font-family="Segoe UI, Arial" letter-spacing="1">AÚN TIENE TIEMPO</text>` +
                `<text x="220" y="282" font-size="22" fill="${BLANCO}" text-anchor="middle" font-family="Georgia, serif">¿<tspan fill="${ORO}" font-weight="700">0–1</tspan> o <tspan fill="${ORO}" font-weight="700">½–½</tspan>?</text>` +
                `<text x="220" y="306" font-size="12" fill="${CELESTE}" text-anchor="middle" font-family="Segoe UI, Arial" letter-spacing="1">Depende de si el rival puede dar mate · art. 6.9</text>`,
                440, 320
            );
        },
    },
};

/* ---------- Ayudas de las demás ilustraciones ---------- */
const FUENTE = 'font-family="Segoe UI, Arial"';
const leyenda = (y, texto, ancho = 440) =>
    `<text x="${ancho / 2}" y="${y}" font-size="12.5" fill="${CELESTE}" text-anchor="middle" ${FUENTE} letter-spacing="1">${texto}</text>`;
/* Una pieza del set ilustrado, de lado «t», con giro opcional sobre su centro. */
const pieza = (id, x, y, t, giro = 0) =>
    `<use href="#${id}" transform="translate(${x},${y}) rotate(${giro} ${t / 2} ${t / 2}) scale(${t / 45})"/>`;
const flecha = (x1, y1, x2, y2, id = "f") =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ORO}" stroke-width="3" marker-end="url(#${id})"/>`;
const puntaDef = (id = "f") =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${ORO}"/></marker>`;
/* Reloj digital pequeño con un tiempo en cada lado. */
function relojDigital(x, y, ancho, izq, der, opc = {}) {
    const alto = ancho * 0.46;
    let s = `<g transform="translate(${x},${y})">`;
    s += `<rect x="${ancho * 0.12}" y="-${alto * 0.12}" width="${ancho * 0.2}" height="${alto * 0.14}" rx="3" fill="${opc.pulsado === "izq" ? ORO2 : ORO}"/>`;
    s += `<rect x="${ancho * 0.68}" y="-${alto * 0.12}" width="${ancho * 0.2}" height="${alto * 0.14}" rx="3" fill="${opc.pulsado === "der" ? ORO2 : ORO}"/>`;
    s += `<rect width="${ancho}" height="${alto}" rx="${alto * 0.14}" fill="${NAVY}" stroke="${ORO}" stroke-width="2.5"/>`;
    s += `<rect x="${ancho * 0.08}" y="${alto * 0.22}" width="${ancho * 0.84}" height="${alto * 0.52}" rx="5" fill="#cfe0c4"/>`;
    s += `<text x="${ancho * 0.29}" y="${alto * 0.6}" font-size="${Math.min(alto * 0.27, ancho * 0.36 / Math.max(izq.length, der.length) * 1.6)}" text-anchor="middle" font-family="Consolas, monospace" font-weight="700" fill="${opc.rojoIzq ? "#a8322a" : "#1d2a1a"}">${izq}</text>`;
    s += `<text x="${ancho * 0.71}" y="${alto * 0.6}" font-size="${Math.min(alto * 0.27, ancho * 0.36 / Math.max(izq.length, der.length) * 1.6)}" text-anchor="middle" font-family="Consolas, monospace" font-weight="700" fill="${opc.rojoDer ? "#a8322a" : "#1d2a1a"}">${der}</text>`;
    s += `<line x1="${ancho / 2}" y1="${alto * 0.26}" x2="${ancho / 2}" y2="${alto * 0.7}" stroke="#8aa07e" stroke-width="1.5"/>`;
    return s + "</g>";
}

Object.assign(ILUSTRACIONES, {
    /* N.º 1 · Ajuste de relojes: volver a la posición anterior y corregir los tiempos. */
    1: {
        dibujo() {
            return svg(
                `<defs>${puntaDef("f1")}</defs>` +
                relojDigital(80, 104, 280, "1:12:40", "0:47:05") +
                `<path d="M 330 86 C 300 40, 140 40, 112 80" fill="none" stroke="${ORO}" stroke-width="3.5" stroke-dasharray="7 5" marker-end="url(#f1)"/>` +
                `<text x="220" y="26" font-size="13" font-weight="700" fill="${ORO}" text-anchor="middle" ${FUENTE} letter-spacing="2">VOLVER ATRÁS</text>` +
                `<g transform="translate(140,262)"><rect width="160" height="34" rx="17" fill="rgba(255,255,255,.1)" stroke="${CELESTE}"/>` +
                `<text x="80" y="22" font-size="13.5" fill="${BLANCO}" text-anchor="middle" ${FUENTE}>+ ajuste del árbitro</text></g>` +
                leyenda(326, "Restablecer la posición anterior y ajustar los relojes"),
                440, 338
            );
        },
    },

    /* N.º 2 · Coronación: el peón se cambia por dama, torre, alfil o caballo. */
    2: {
        dibujo() {
            const opciones = ["wQ", "wR", "wB", "wN"].map((id, i) => {
                const x = 214 + i * 50;
                return `<rect x="${x}" y="106" width="46" height="46" rx="6" fill="${i ? "rgba(255,255,255,.12)" : CLARA}" stroke="${i ? CELESTE : ORO}" stroke-width="${i ? 1 : 3}"/>` + pieza(id, x + 1, 107, 44);
            }).join("");
            return svg(
                DEFS_PIEZAS + `<defs>${puntaDef("f2")}</defs>` +
                `<rect x="40" y="78" width="100" height="100" fill="${OSCURA}" stroke="${ORO}" stroke-width="3" rx="4"/>` +
                pieza("wP", 50, 88, 80) +
                flecha(152, 129, 200, 129, "f2") +
                opciones +
                `<text x="90" y="204" font-size="13" fill="${CELESTE}" text-anchor="middle" ${FUENTE}>el peón llega a la 8.ª fila</text>` +
                `<text x="313" y="178" font-size="13" fill="${CELESTE}" text-anchor="middle" ${FUENTE}>dama · torre · alfil · caballo</text>` +
                leyenda(262, "Se cambia, en la misma jugada, por una pieza de su color · art. 3.7.5"),
                440, 280
            );
        },
    },

    /* N.º 4 · Sistema Wimbledon: el cuadro de eliminación directa hasta el trofeo. */
    4: {
        dibujo() {
            let s = "";
            const linea = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} H${x2} V${y2}" fill="none" stroke="${CELESTE}" stroke-width="2"/>`;
            const nombres = ["Ana", "Luis", "Sofía", "Diego", "Marta", "Pablo", "Elena", "Raúl"];
            nombres.forEach((n, i) => {
                const y = 30 + i * 32;
                s += `<rect x="20" y="${y - 12}" width="76" height="22" rx="4" fill="rgba(255,255,255,.1)" stroke="${CELESTE}"/>`;
                s += `<text x="58" y="${y + 3}" font-size="12" fill="${BLANCO}" text-anchor="middle" ${FUENTE}>${n}</text>`;
            });
            for (let i = 0; i < 4; i++) { const a = 30 + i * 64, b = a + 32; s += linea(96, a, 130, b) + linea(96, b, 130, a); }
            const ganadores1 = ["Ana", "Sofía", "Pablo", "Elena"];
            ganadores1.forEach((n, i) => {
                const y = 46 + i * 64;
                s += `<rect x="130" y="${y - 12}" width="70" height="22" rx="4" fill="rgba(255,255,255,.14)" stroke="${CELESTE}"/>`;
                s += `<text x="165" y="${y + 3}" font-size="12" fill="${BLANCO}" text-anchor="middle" ${FUENTE}>${n}</text>`;
            });
            for (let i = 0; i < 2; i++) { const a = 46 + i * 128, b = a + 64; s += linea(200, a, 232, a + 32) + linea(200, b, 232, a + 32); }
            ["Sofía", "Elena"].forEach((n, i) => {
                const y = 78 + i * 128;
                s += `<rect x="232" y="${y - 12}" width="70" height="22" rx="4" fill="rgba(255,255,255,.18)" stroke="${ORO}"/>`;
                s += `<text x="267" y="${y + 3}" font-size="12" fill="${BLANCO}" text-anchor="middle" ${FUENTE}>${n}</text>`;
            });
            s += linea(302, 78, 330, 142) + linea(302, 206, 330, 142);
            /* El trofeo. */
            s += `<g transform="translate(336,96)">
                <path d="M14 6 H78 V30 C78 58 62 70 46 72 C30 70 14 58 14 30 Z" fill="${ORO}" stroke="${ORO2}" stroke-width="2"/>
                <path d="M14 14 H2 C2 34 10 42 18 44 M78 14 H90 C90 34 82 42 74 44" fill="none" stroke="${ORO}" stroke-width="5"/>
                <rect x="40" y="72" width="12" height="16" fill="${ORO2}"/>
                <rect x="24" y="88" width="44" height="10" rx="2" fill="${ORO}"/>
                <text x="46" y="44" font-size="22" text-anchor="middle" fill="${NAVY}" font-family="Georgia, serif" font-weight="700">1</text></g>`;
            return svg(s + leyenda(298, "Eliminación directa: quien pierde, queda fuera"), 440, 312);
        },
    },

    /* N.º 5 · Zonas de la sala de juego: el plano visto desde arriba. */
    5: {
        dibujo() {
            let s = `<rect x="30" y="16" width="380" height="250" rx="8" fill="rgba(255,255,255,.05)" stroke="${CELESTE}" stroke-width="2"/>`;
            s += `<rect x="150" y="28" width="140" height="28" rx="4" fill="${ORO}"/>`;
            s += `<text x="220" y="47" font-size="12.5" font-weight="700" fill="${NAVY}" text-anchor="middle" ${FUENTE} letter-spacing="2">ÁRBITROS</text>`;
            for (let f = 0; f < 3; f++) for (let c = 0; c < 4; c++) {
                const x = 62 + c * 84, y = 76 + f * 42;
                s += `<rect x="${x}" y="${y}" width="64" height="26" rx="3" fill="rgba(255,255,255,.14)" stroke="${CELESTE}"/>`;
                s += `<rect x="${x + 22}" y="${y + 4}" width="18" height="18" fill="${CLARA}"/><rect x="${x + 22}" y="${y + 4}" width="9" height="9" fill="${OSCURA}"/><rect x="${x + 31}" y="${y + 13}" width="9" height="9" fill="${OSCURA}"/>`;
                s += `<rect x="${x + 44}" y="${y + 9}" width="14" height="8" rx="2" fill="${ORO}"/>`;
            }
            s += `<text x="220" y="214" font-size="12.5" font-weight="700" fill="${ORO}" text-anchor="middle" ${FUENTE} letter-spacing="2">ZONA DE JUEGO</text>`;
            s += `<line x1="30" y1="226" x2="410" y2="226" stroke="${ORO}" stroke-width="3" stroke-dasharray="10 6"/>`;
            for (let i = 0; i < 8; i++) s += `<circle cx="${66 + i * 38}" cy="248" r="7" fill="${CELESTE}" opacity=".6"/>`;
            s += `<text x="404" y="252" font-size="11.5" fill="${CELESTE}" text-anchor="end" ${FUENTE}>público</text>`;
            return svg(s + leyenda(296, "Zona de juego, árbitros y público, cada uno en su lugar · art. 11.2"), 440, 310);
        },
    },

    /* N.º 6 · La convocatoria: las bases del torneo, con su sello. */
    6: {
        dibujo() {
            const filas = [["Sistema", "Suizo, 7 rondas"], ["Ritmo", "90 min + 30 s"], ["Desempates", "BH-C1, BH, SB"], ["Premios", "1.º al 5.º lugar"], ["Inscripción", "hasta el viernes"]];
            let s = `<g transform="rotate(-3 220 150)"><rect x="110" y="12" width="220" height="276" rx="6" fill="${CLARA}" stroke="${ORO}" stroke-width="2"/>`;
            s += `<text x="220" y="48" font-size="17" font-weight="700" fill="${NAVY}" text-anchor="middle" font-family="Georgia, serif" letter-spacing="2">CONVOCATORIA</text>`;
            s += `<line x1="134" y1="60" x2="306" y2="60" stroke="${ORO2}" stroke-width="2"/>`;
            filas.forEach(([a, b], i) => {
                const y = 90 + i * 32;
                s += `<text x="134" y="${y}" font-size="11.5" font-weight="700" fill="${NAVY}" ${FUENTE}>${a}</text>`;
                s += `<text x="306" y="${y}" font-size="11.5" fill="#33415c" text-anchor="end" ${FUENTE}>${b}</text>`;
                s += `<line x1="134" y1="${y + 9}" x2="306" y2="${y + 9}" stroke="#b9c7dd" stroke-width="1"/>`;
            });
            s += "</g>";
            s += sello(322, 238, 40, "✓", "APROBADA");
            /* La pluma. */
            s += `<g transform="translate(62,200) rotate(-40)"><rect width="110" height="12" rx="6" fill="${ORO}"/><path d="M110 0 L132 6 L110 12 Z" fill="${CELESTE}"/><rect x="18" y="0" width="6" height="12" fill="${ORO2}"/></g>`;
            return svg(s + leyenda(318, "Las bases dicen las reglas del torneo antes de empezar"), 440, 330);
        },
    },

    /* N.º 7 · Anotar una posición: el tablero y su FEN (diagrama de la revista). */
    7: {
        fen: "8/6p1/pk3p2/2r5/1pp5/1N5P/2K3P1/R7 w - - 0 1",
        dibujo() {
            return svg(
                tablero(this.fen, 120, 14, 200) +
                `<rect x="30" y="252" width="380" height="34" rx="6" fill="rgba(255,255,255,.1)" stroke="${ORO}" stroke-width="1.5"/>` +
                `<text x="220" y="274" font-size="13.5" fill="${BLANCO}" text-anchor="middle" font-family="Consolas, monospace">${this.fen}</text>` +
                leyenda(312, "Cada fila, de la 8.ª a la 1.ª: piezas y casillas vacías · FEN"),
                440, 324
            );
        },
    },

    /* N.º 9 · Títulos FIDE: el rating que exige cada título. */
    9: {
        dibujo() {
            const titulos = [["CM", 2200], ["MF", 2300], ["MI", 2400], ["GM", 2500]];
            let s = `<line x1="40" y1="270" x2="400" y2="270" stroke="${CELESTE}" stroke-width="2"/>`;
            titulos.forEach(([t, r], i) => {
                const alto = 60 + i * 44, x = 56 + i * 88, y = 270 - alto;
                s += `<rect x="${x}" y="${y}" width="64" height="${alto}" rx="4" fill="${i === 3 ? ORO : "rgba(255,255,255,.14)"}" stroke="${i === 3 ? ORO2 : CELESTE}"/>`;
                s += `<text x="${x + 32}" y="${y + 24}" font-size="13" font-weight="700" fill="${i === 3 ? NAVY : BLANCO}" text-anchor="middle" ${FUENTE}>${r}</text>`;
                /* La insignia del título encima de su columna. */
                s += `<circle cx="${x + 32}" cy="${y - 28}" r="22" fill="${NAVY}" stroke="${ORO}" stroke-width="3"/>`;
                s += `<text x="${x + 32}" y="${y - 22}" font-size="16" font-weight="700" fill="${ORO}" text-anchor="middle" font-family="Georgia, serif">${t}</text>`;
            });
            return svg(s + leyenda(302, "Títulos FIDE: el rating que exige cada uno"), 440, 314);
        },
    },

    /* N.º 10 · Piezas caídas: la posición de la revista con el alfil de c1 volcado. */
    10: {
        fen: "8/8/8/4k3/8/8/PP4PP/R1BQ1RK1 b - - 0 40",
        dibujo() {
            /* El tablero sin el alfil de c1, que se dibuja aparte, acostado. */
            const sinAlfil = "8/8/8/4k3/8/8/PP4PP/R2Q1RK1 b - - 0 40";
            const c = 240 / 8;
            return svg(
                tablero(sinAlfil, 100, 14, 240) +
                `<g transform="translate(100,14)">${pieza("wB", 2 * c + 2, 7 * c - 2, c, 78)}` +
                `<path d="M ${2 * c - 6} ${7 * c - 6} q -10 -14 4 -24 M ${3 * c + 8} ${7 * c - 4} q 12 -12 0 -26" fill="none" stroke="${ORO}" stroke-width="2.5" stroke-linecap="round"/></g>` +
                leyenda(300, "Quien desplaza una pieza la repone en su tiempo · art. 7.4"),
                440, 314
            );
        },
    },

    /* N.º 12 · Supervisar el tiempo: una fila de relojes y la lupa del árbitro. */
    12: {
        dibujo() {
            let s = relojDigital(24, 70, 124, "0:41", "0:12") + relojDigital(158, 70, 124, "1:05", "0:58") + relojDigital(292, 70, 124, "0:02", "0:30", { rojoIzq: true });
            /* La lupa sobre el reloj de la derecha, que está en apuros. */
            s += `<circle cx="324" cy="112" r="44" fill="rgba(255,255,255,.08)" stroke="${ORO}" stroke-width="5"/>`;
            s += `<line x1="356" y1="144" x2="392" y2="182" stroke="${ORO}" stroke-width="11" stroke-linecap="round"/>`;
            s += `<text x="324" y="212" font-size="13" font-weight="700" fill="${ORO}" text-anchor="middle" ${FUENTE} letter-spacing="1">¡APURO DE TIEMPO!</text>`;
            return svg(s + leyenda(262, "El árbitro vigila los relojes, sobre todo en los apuros"), 440, 276);
        },
    },

    /* N.º 13 · Ajedrez960: una de las posiciones iniciales de la revista y el dado. */
    13: {
        fen: "rbnkrqbn/pppppppp/8/8/8/8/PPPPPPPP/RBNKRQBN w - - 0 1",
        dibujo() {
            const fila = "RBNKRQBN";
            const c = 44;
            let s = DEFS_PIEZAS + `<rect x="${44 - 5}" y="${70 - 5}" width="${8 * c + 10}" height="${c + 10}" rx="5" fill="none" stroke="${ORO}" stroke-width="3"/>`;
            fila.split("").forEach((p, i) => {
                s += `<rect x="${44 + i * c}" y="70" width="${c}" height="${c}" fill="${i % 2 ? CLARA : OSCURA}"/>`;
                s += pieza("w" + p, 44 + i * c, 70, c);
                s += `<text x="${44 + i * c + c / 2}" y="134" font-size="11" fill="${CELESTE}" text-anchor="middle" ${FUENTE}>${"abcdefgh"[i]}</text>`;
            });
            /* El dado. */
            s += `<g transform="translate(180,160) rotate(12 40 40)"><rect width="80" height="80" rx="14" fill="${BLANCO}" stroke="${ORO}" stroke-width="3"/>` +
                [[20, 20], [60, 20], [40, 40], [20, 60], [60, 60]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${NAVY}"/>`).join("") + "</g>";
            s += `<text x="220" y="40" font-size="20" font-weight="700" fill="${ORO}" text-anchor="middle" font-family="Georgia, serif">960</text>`;
            return svg(s + leyenda(290, "Los alfiles en colores distintos y el rey entre las torres"), 440, 304);
        },
    },

    /* N.º 14 · Antidopaje: el frasco de la muestra con el escudo del caballo. */
    14: {
        dibujo() {
            let s = DEFS_PIEZAS;
            s += `<rect x="172" y="20" width="96" height="30" rx="6" fill="${ORO}"/>`;
            s += `<path d="M180 50 H260 V70 C290 84 296 104 296 130 V236 C296 252 284 262 268 262 H172 C156 262 144 252 144 236 V130 C144 104 150 84 180 70 Z" fill="rgba(255,255,255,.14)" stroke="${CELESTE}" stroke-width="3"/>`;
            s += `<rect x="160" y="120" width="120" height="104" rx="8" fill="${CLARA}"/>`;
            s += `<path d="M220 130 L256 142 V170 C256 192 240 206 220 214 C200 206 184 192 184 170 V142 Z" fill="${NAVY}" stroke="${ORO}" stroke-width="2.5"/>`;
            s += pieza("wN", 198, 146, 44);
            s += sello(320, 214, 36, "✓", "CONTROL");
            return svg(s + leyenda(300, "La FIDE aplica el Código Mundial Antidopaje"), 440, 314);
        },
    },

    /* N.º 15 · La jugada a dos manos: la coronación se hace con una sola mano. */
    15: {
        dibujo() {
            let s = DEFS_PIEZAS + `<defs>${puntaDef("f15")}</defs>`;
            s += `<rect x="60" y="70" width="96" height="96" rx="4" fill="${OSCURA}" stroke="${ORO}" stroke-width="3"/>` + pieza("wP", 68, 78, 80);
            s += flecha(170, 118, 220, 118, "f15");
            s += `<rect x="234" y="70" width="96" height="96" rx="4" fill="${CLARA}" stroke="${ORO}" stroke-width="3"/>` + pieza("wQ", 242, 78, 80);
            /* La tarjeta de aviso. */
            s += `<g transform="rotate(14 360 70)"><rect x="330" y="20" width="62" height="86" rx="6" fill="#f2c94c" stroke="${NAVY}" stroke-width="2"/>` +
                `<text x="361" y="58" font-size="15" font-weight="700" fill="${NAVY}" text-anchor="middle" ${FUENTE}>UNA</text>` +
                `<text x="361" y="78" font-size="15" font-weight="700" fill="${NAVY}" text-anchor="middle" ${FUENTE}>MANO</text></g>`;
            s += `<text x="195" y="196" font-size="13" fill="${CELESTE}" text-anchor="middle" ${FUENTE}>quitar el peón y poner la dama: con la misma mano</text>`;
            return svg(s + leyenda(244, "Cada jugada se hace con una sola mano · art. 4.1"), 440, 258);
        },
    },

    /* N.º 16 · La torre invertida: puesta de cabeza en la casilla de coronación. */
    16: {
        dibujo() {
            let s = DEFS_PIEZAS;
            s += `<rect x="60" y="40" width="130" height="130" rx="4" fill="${CLARA}" stroke="${ORO}" stroke-width="3"/>`;
            s += pieza("wR", 70, 50, 110, 180);
            s += `<text x="125" y="196" font-size="13" fill="${CELESTE}" text-anchor="middle" ${FUENTE}>torre de cabeza en e8</text>`;
            s += `<text x="232" y="122" font-size="44" font-weight="700" fill="${ORO}" text-anchor="middle" font-family="Georgia, serif">=</text>`;
            s += `<rect x="276" y="56" width="98" height="98" rx="4" fill="${OSCURA}" stroke="${ORO}" stroke-width="3"/>`;
            s += pieza("wR", 285, 65, 80);
            s += `<text x="325" y="180" font-size="13" fill="${CELESTE}" text-anchor="middle" ${FUENTE}>es una torre, no una dama</text>`;
            return svg(s + leyenda(240, "Una torre invertida sigue siendo una torre · Manual del Árbitro FIDE"), 440, 254);
        },
    },

    /* N.º 17 · Rating performance: los rivales, su promedio y el dp. */
    17: {
        dibujo() {
            const rivales = [2310, 2420, 2380, 2290, 2450, 2350];
            const ra = Math.round(rivales.reduce((a, b) => a + b, 0) / rivales.length);
            const y = (r) => 230 - (r - 2200) * 0.7;
            let s = `<line x1="40" y1="230" x2="300" y2="230" stroke="${CELESTE}" stroke-width="2"/>`;
            rivales.forEach((r, i) => {
                const x = 52 + i * 40;
                s += `<rect x="${x}" y="${y(r)}" width="28" height="${230 - y(r)}" rx="3" fill="rgba(255,255,255,.16)" stroke="${CELESTE}"/>`;
                s += `<text x="${x + 14}" y="${y(r) - 6}" font-size="10" fill="${CELESTE}" text-anchor="middle" ${FUENTE}>${r}</text>`;
            });
            s += `<line x1="40" y1="${y(ra)}" x2="300" y2="${y(ra)}" stroke="${ORO}" stroke-width="2.5" stroke-dasharray="7 5"/>`;
            s += `<text x="44" y="${y(ra) - 8}" font-size="12" font-weight="700" fill="${ORO}" ${FUENTE}>Ra = ${ra}</text>`;
            s += `<g transform="translate(318,96)"><rect width="104" height="86" rx="10" fill="${NAVY}" stroke="${ORO}" stroke-width="3"/>` +
                `<text x="52" y="38" font-size="20" font-weight="700" fill="${ORO}" text-anchor="middle" font-family="Georgia, serif">Rp =</text>` +
                `<text x="52" y="66" font-size="19" fill="${BLANCO}" text-anchor="middle" font-family="Georgia, serif">Ra + dp</text></g>`;
            return svg(s + leyenda(270, "El promedio de los rivales más el dp de la tabla FIDE"), 440, 284);
        },
    },

    /* N.º 18 · Juego limpio: el celular prohibido y el detector de metales. */
    18: {
        dibujo() {
            let s = `<rect x="96" y="40" width="104" height="186" rx="16" fill="${NAVY}" stroke="${CELESTE}" stroke-width="4"/>`;
            s += `<rect x="108" y="62" width="80" height="136" rx="4" fill="rgba(255,255,255,.14)"/>`;
            s += `<circle cx="148" cy="212" r="6" fill="${CELESTE}"/>`;
            s += `<circle cx="148" cy="133" r="88" fill="none" stroke="${ROJO}" stroke-width="10"/>`;
            s += `<line x1="86" y1="71" x2="210" y2="195" stroke="${ROJO}" stroke-width="10" stroke-linecap="round"/>`;
            /* El detector de metales. */
            s += `<g transform="translate(300,40) rotate(18)"><rect x="-26" y="0" width="52" height="118" rx="26" fill="${ORO}" stroke="${ORO2}" stroke-width="2"/>` +
                `<rect x="-10" y="20" width="20" height="40" rx="4" fill="${NAVY}"/><circle cx="0" cy="80" r="6" fill="${ROJO}"/>` +
                `<rect x="-12" y="118" width="24" height="86" rx="10" fill="${CELESTE}"/></g>`;
            return svg(s + leyenda(266, "Ningún dispositivo electrónico en la zona de juego · art. 11.3"), 440, 280);
        },
    },

    /* N.º 19 · Pareo Integral y la mesa del árbitro: la computadora con los
       emparejamientos de la ronda y, al lado, el reloj de la mesa. */
    19: {
        dibujo() {
            const filas = [["1", "Ana", "1 – 0", "Luis"], ["2", "Sofía", "½ – ½", "Diego"], ["3", "Marta", "", "Pablo"], ["4", "Elena", "", "Raúl"]];
            let s = `<rect x="30" y="14" width="280" height="188" rx="10" fill="${NAVY}" stroke="${ORO}" stroke-width="3"/>`;
            s += `<rect x="42" y="26" width="256" height="164" rx="4" fill="${CLARA}"/>`;
            s += `<rect x="42" y="26" width="256" height="26" rx="4" fill="${ORO}"/>`;
            s += `<text x="54" y="44" font-size="12.5" font-weight="700" fill="${NAVY}" ${FUENTE}>Pareo Integral · Ronda 3</text>`;
            filas.forEach(([m, b, r, n], i) => {
                const y = 74 + i * 28;
                s += `<rect x="50" y="${y - 15}" width="240" height="22" rx="3" fill="${i % 2 ? "#d5e1f2" : "#ffffff"}"/>`;
                s += `<text x="60" y="${y}" font-size="11" font-weight="700" fill="${NAVY}" ${FUENTE}>${m}</text>`;
                s += `<text x="78" y="${y}" font-size="11.5" fill="${NAVY}" ${FUENTE}>${b}</text>`;
                s += `<text x="170" y="${y}" font-size="11.5" font-weight="700" fill="${r ? "#1d6b3f" : "#8a97ad"}" text-anchor="middle" ${FUENTE}>${r || "· · ·"}</text>`;
                s += `<text x="282" y="${y}" font-size="11.5" fill="${NAVY}" text-anchor="end" ${FUENTE}>${n}</text>`;
            });
            /* La base de la computadora. */
            s += `<path d="M14 202 H326 L312 216 H28 Z" fill="${ORO2}"/>`;
            /* La mesa del árbitro: el reloj y la carpeta de actas. */
            s += relojDigital(330, 128, 100, "0:58", "1:04");
            s += `<g transform="translate(346,30)"><rect width="68" height="80" rx="4" fill="${BLANCO}" stroke="${ORO}" stroke-width="2"/>` +
                `<rect x="22" y="-6" width="24" height="12" rx="3" fill="${ORO}"/>` +
                [18, 32, 46, 60].map((y) => `<line x1="10" y1="${y}" x2="58" y2="${y}" stroke="#b9c7dd" stroke-width="2"/>`).join("") +
                `<path d="M12 44 l6 6 l12 -14" fill="none" stroke="#1d6b3f" stroke-width="3"/></g>`;
            s += `<text x="382" y="208" font-size="11" fill="${CELESTE}" text-anchor="middle" ${FUENTE}>mesa del árbitro</text>`;
            return svg(s + leyenda(258, "Del emparejamiento al resultado, paso a paso"), 440, 272);
        },
    },

    /* N.º 20 · La mesa del árbitro del Centroamericano: la tableta del adjunto
       con sus mesas y, al lado, el código QR con el que entra. */
    20: {
        dibujo() {
            let s = `<rect x="40" y="10" width="200" height="236" rx="16" fill="${NAVY}" stroke="${ORO}" stroke-width="3"/>`;
            s += `<rect x="52" y="24" width="176" height="200" rx="5" fill="${CLARA}"/>`;
            s += `<circle cx="140" cy="236" r="5" fill="${CELESTE}"/>`;
            s += `<rect x="52" y="24" width="176" height="24" rx="5" fill="${ORO}"/>`;
            s += `<text x="62" y="41" font-size="11.5" font-weight="700" fill="${NAVY}" ${FUENTE}>Mis mesas · Ronda 3</text>`;
            [["1", "1 – 0", true], ["2", "½ – ½", true], ["3", "", false], ["4", "", false], ["5", "0 – 1", true]].forEach(([m, r, listo], i) => {
                const y = 70 + i * 30;
                s += `<rect x="60" y="${y - 16}" width="160" height="24" rx="4" fill="${i % 2 ? "#d5e1f2" : "#ffffff"}"/>`;
                s += `<text x="70" y="${y}" font-size="11" font-weight="700" fill="${NAVY}" ${FUENTE}>Mesa ${m}</text>`;
                s += listo
                    ? `<text x="208" y="${y}" font-size="11.5" font-weight="700" fill="#1d6b3f" text-anchor="end" ${FUENTE}>${r}</text>`
                    : `<rect x="150" y="${y - 12}" width="22" height="16" rx="3" fill="${BLANCO}" stroke="${NAVY}"/><rect x="176" y="${y - 12}" width="22" height="16" rx="3" fill="${BLANCO}" stroke="${NAVY}"/><text x="161" y="${y}" font-size="9" text-anchor="middle" fill="${NAVY}" ${FUENTE}>1-0</text><text x="187" y="${y}" font-size="9" text-anchor="middle" fill="${NAVY}" ${FUENTE}>0-1</text>`;
            });
            /* El código QR (un dibujo: no lleva datos). */
            const qx = 278, qy = 40, c = 9;
            s += `<rect x="${qx - 10}" y="${qy - 10}" width="${13 * c + 20}" height="${13 * c + 20}" rx="8" fill="${BLANCO}" stroke="${ORO}" stroke-width="3"/>`;
            const ojo = (x, y) => `<rect x="${x}" y="${y}" width="${3 * c}" height="${3 * c}" fill="${NAVY}"/><rect x="${x + c * 0.6}" y="${y + c * 0.6}" width="${c * 1.8}" height="${c * 1.8}" fill="${BLANCO}"/><rect x="${x + c}" y="${y + c}" width="${c}" height="${c}" fill="${NAVY}"/>`;
            s += ojo(qx, qy) + ojo(qx + 10 * c, qy) + ojo(qx, qy + 10 * c);
            const puntos = "0101101011010010110100101011010101101001010110100101101001011010110100101011010100101101";
            let k = 0;
            for (let fila = 0; fila < 13; fila++) for (let col = 0; col < 13; col++) {
                const enOjo = (fila < 4 && (col < 4 || col > 8)) || (fila > 8 && col < 4);
                if (enOjo) continue;
                if (puntos[k++ % puntos.length] === "1") s += `<rect x="${qx + col * c}" y="${qy + fila * c}" width="${c}" height="${c}" fill="${NAVY}"/>`;
            }
            s += `<text x="${qx + 6.5 * c}" y="${qy + 13 * c + 30}" font-size="11.5" fill="${CELESTE}" text-anchor="middle" ${FUENTE}>el árbitro entra con su QR</text>`;
            s += relojDigital(286, 196, 100, "0:41", "0:37");
            return svg(s + leyenda(276, "La sala entera, mesa por mesa, en la tableta del árbitro"), 440, 290);
        },
    },
});

module.exports = { ILUSTRACIONES };

/*! rev bfb5bbb0d2d82f9f */
