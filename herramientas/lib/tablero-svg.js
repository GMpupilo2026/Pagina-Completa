/* Dibuja un tablero de ajedrez como SVG, a partir de una FEN.
 *
 * Vive aparte porque lo usan dos generadores —los diagramas de las tarjetas de
 * cursos.html y el material de estudio de cada lección— y una segunda copia de
 * los mismos dibujos se iría separando de la primera a la primera corrección.
 *
 * Las piezas NO están acá: se leen de js/finales-100.js, que es donde ya
 * estaban para el visor del sitio. Un diagrama incluye solo las piezas que
 * aparecen en él: un final de peones no carga el dibujo de la dama.
 *
 *   tablero(fen, { titulo, destacar, coordenadas })
 *     titulo       el <title> del SVG, que es lo que lee un lector de pantalla
 *     destacar     casillas a sombrear en ámbar, p. ej. ["e4", "d5"]
 *     coordenadas  true para rotular columnas y filas por fuera del tablero
 *     colores      { clara, oscura, borde, marca } para otro juego de colores
 *                  (el libro de Peonita usa madera en vez de azul)
 *     puntos       casillas adonde puede ir la pieza: un punto en el centro
 *     capturas     casillas donde come: un aro alrededor de la pieza
 *     estrellas    casillas con una estrella (la meta de un ejercicio)
 *     flechas      [[desde, hasta], …]: una flecha entre dos casillas (el
 *                  truco de un cuento: la horquilla, la clavada…). Azul
 *                  #123e7c, medido: 8,6:1 contra la casilla clara de madera y
 *                  4,1:1 contra la oscura.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "..");

// Las piezas se sacan del mismo archivo que usan los tableros del sitio, para
// no tener dos copias de los mismos dibujos que se puedan ir separando.
// Vivían dentro de js/finales-100.js y se mudaron a js/chess-piece-svg.js;
// este archivo se quedó apuntando al viejo y los dos generadores que dependen
// de él —las tarjetas de cursos.html y el material de estudio— morían al
// arrancar. No daba error en el sitio: solo al regenerar.
const FUENTE_PIEZAS = path.join(RAIZ, "js", "chess-piece-svg.js");
const bruto = fs.readFileSync(FUENTE_PIEZAS, "utf8");
const m = bruto.match(/const PIECE_DEFS = ("(?:[^"\\]|\\.)*");/);
if (!m) { console.error("No se encontraron las piezas en js/chess-piece-svg.js"); process.exit(1); }
const PIEZAS = JSON.parse(m[1]);

function defsDe(usadas) {
    // Solo las piezas que aparecen en el diagrama: un final de peones no tiene
    // por qué cargar el dibujo de la dama.
    const trozos = [];
    usadas.forEach((id) => {
        const i = PIEZAS.indexOf('<g id="' + id + '"');
        if (i < 0) return;
        let nivel = 0, j = i;
        for (; j < PIEZAS.length; j++) {
            if (PIEZAS.startsWith("<g", j)) nivel++;
            else if (PIEZAS.startsWith("</g>", j)) { nivel--; if (nivel === 0) { j += 4; break; } }
        }
        trozos.push(PIEZAS.slice(i, j));
    });
    return "<defs>" + trozos.join("") + "</defs>";
}

const CLARA = "#f0f4f8", OSCURA = "#627d98", BORDE = "#243b53", MARCA = "#f0b429";

function tablero(fen, opciones) {
    opciones = opciones || {};
    const col = Object.assign({ clara: CLARA, oscura: OSCURA, borde: BORDE, marca: MARCA }, opciones.colores || {});
    const filas = fen.split(" ")[0].split("/");
    const casillas = {};
    filas.forEach((fila, r) => {
        let c = 0;
        for (const ch of fila) {
            if (/\d/.test(ch)) { c += +ch; continue; }
            casillas["abcdefgh"[c] + (8 - r)] = ch;
            c++;
        }
    });
    const tam = 96, celda = tam / 8, pad = 6, total = tam + 2 * pad;
    // Con coordenadas, los números van a la izquierda y las letras abajo, por
    // fuera del marco, como en los tableros del sitio: se agranda el lienzo
    // por esos dos lados y el tablero se corre a la derecha.
    const izq = opciones.coordenadas ? 8 : 0, abajo = opciones.coordenadas ? 8 : 0;
    const ancho = total + izq, alto = total + abajo;
    const xy = (sq) => [izq + pad + "abcdefgh".indexOf(sq[0]) * celda, pad + (8 - +sq[1]) * celda];

    const s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + ancho + " " + alto +
               '" width="' + ancho + '" height="' + alto + '" role="img" aria-labelledby="t">'];
    s.push("<title id=\"t\">" + (opciones.titulo || "Diagrama de ajedrez").replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</title>");
    // Las piezas de js/chess-piece-svg.js pintan con var(--piece-white) y
    // var(--piece-black), que css/styles.css define en :root para los
    // tableros del sitio. Este SVG sale a un archivo suelto —tarjeta de
    // cursos.html, diagrama del material de estudio— sin esa hoja de
    // estilos cargada, así que sin esto las piezas quedaban casi invisibles
    // (var() sin resolver cae al negro inicial, pero como también hay trazo
    // negro por encima, apenas se distinguía el contorno). Van los mismos
    // valores por defecto que css/styles.css, para que el dibujo se vea igual
    // suelto que dentro del sitio.
    s.push("<style>:root{--piece-white:#fff;--piece-black:#17202a;}</style>");
    s.push('<rect x="' + izq + '" width="' + total + '" height="' + total + '" rx="4" fill="' + col.borde + '"/>');
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        s.push('<rect x="' + (izq + pad + c * celda) + '" y="' + (pad + r * celda) + '" width="' + celda +
               '" height="' + celda + '" fill="' + ((r + c) % 2 === 0 ? col.clara : col.oscura) + '"/>');
    }
    if (opciones.coordenadas) {
        const letra = 'font-family="Inter, Arial, sans-serif" font-size="5.2" font-weight="600" fill="' + col.borde + '"';
        for (let i = 0; i < 8; i++) {
            s.push('<text x="' + (izq + pad + i * celda + celda / 2) + '" y="' + (total + 6) + '" text-anchor="middle" ' + letra + ">" + "abcdefgh"[i] + "</text>");
            s.push('<text x="' + (izq - 1.5) + '" y="' + (pad + i * celda + celda / 2 + 1.9) + '" text-anchor="end" ' + letra + ">" + (8 - i) + "</text>");
        }
    }
    (opciones.destacar || []).forEach((sq) => {
        const [x, y] = xy(sq);
        s.push('<rect x="' + x + '" y="' + y + '" width="' + celda + '" height="' + celda +
               '" fill="' + col.marca + '" fill-opacity="0.55"/>');
    });
    (opciones.estrellas || []).forEach((sq) => {
        const [x, y] = xy(sq), cx = x + celda / 2, cy = y + celda / 2, pts = [];
        for (let i = 0; i < 10; i++) {
            const r = i % 2 ? celda * 0.17 : celda * 0.4, a = -Math.PI / 2 + i * Math.PI / 5;
            pts.push((cx + r * Math.cos(a)).toFixed(2) + "," + (cy + r * Math.sin(a)).toFixed(2));
        }
        s.push('<polygon points="' + pts.join(" ") + '" fill="#fcc419" stroke="#a46a00" stroke-width="0.5"/>');
    });
    const usadas = new Set();
    const escala = (celda / 45) * 0.92, off = (celda - 45 * escala) / 2;
    const orden = Object.keys(casillas);
    orden.forEach((sq) => {
        const p = casillas[sq];
        usadas.add((p === p.toUpperCase() ? "w" : "b") + p.toUpperCase());
    });
    s.splice(2, 0, defsDe(usadas));
    orden.forEach((sq) => {
        const p = casillas[sq], [x, y] = xy(sq);
        const id = (p === p.toUpperCase() ? "w" : "b") + p.toUpperCase();
        s.push('<use href="#' + id + '" transform="translate(' + (x + off).toFixed(2) + "," +
               (y + off).toFixed(2) + ") scale(" + escala.toFixed(4) + ')"/>');
    });
    (opciones.puntos || []).forEach((sq) => {
        const [x, y] = xy(sq);
        s.push('<circle cx="' + (x + celda / 2) + '" cy="' + (y + celda / 2) + '" r="' + (celda * 0.17) +
               '" fill="#0b4a1f"/>');
    });
    (opciones.capturas || []).forEach((sq) => {
        const [x, y] = xy(sq);
        s.push('<circle cx="' + (x + celda / 2) + '" cy="' + (y + celda / 2) + '" r="' + (celda * 0.45) +
               '" fill="none" stroke="#7f1d1d" stroke-width="1.1"/>');
    });
    (opciones.flechas || []).forEach(([a, b]) => {
        const [x1, y1] = xy(a), [x2, y2] = xy(b);
        const cx1 = x1 + celda / 2, cy1 = y1 + celda / 2, cx2 = x2 + celda / 2, cy2 = y2 + celda / 2;
        const ang = Math.atan2(cy2 - cy1, cx2 - cx1), punta = celda * 0.42;
        // La línea termina donde empieza la punta, para que no la tape.
        const fx = cx2 - Math.cos(ang) * punta * 0.8, fy = cy2 - Math.sin(ang) * punta * 0.8;
        const p1 = [cx2 - punta * Math.cos(ang - 0.45), cy2 - punta * Math.sin(ang - 0.45)];
        const p2 = [cx2 - punta * Math.cos(ang + 0.45), cy2 - punta * Math.sin(ang + 0.45)];
        s.push('<line x1="' + cx1.toFixed(2) + '" y1="' + cy1.toFixed(2) + '" x2="' + fx.toFixed(2) + '" y2="' + fy.toFixed(2) +
               '" stroke="#123e7c" stroke-width="' + (celda * 0.13).toFixed(2) + '" stroke-linecap="round" opacity="0.9"/>');
        s.push('<polygon points="' + cx2.toFixed(2) + "," + cy2.toFixed(2) + " " + p1.map((v) => v.toFixed(2)).join(",") + " " +
               p2.map((v) => v.toFixed(2)).join(",") + '" fill="#123e7c" opacity="0.9"/>');
    });
    s.push("</svg>");
    return s.join("");
}

module.exports = { tablero: tablero, CLARA: CLARA, OSCURA: OSCURA, BORDE: BORDE, MARCA: MARCA };
