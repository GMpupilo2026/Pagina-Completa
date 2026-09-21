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
    const xy = (sq) => [pad + "abcdefgh".indexOf(sq[0]) * celda, pad + (8 - +sq[1]) * celda];

    const s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + " " + total +
               '" width="' + total + '" height="' + total + '" role="img" aria-labelledby="t">'];
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
    s.push('<rect width="' + total + '" height="' + total + '" rx="4" fill="' + BORDE + '"/>');
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        s.push('<rect x="' + (pad + c * celda) + '" y="' + (pad + r * celda) + '" width="' + celda +
               '" height="' + celda + '" fill="' + ((r + c) % 2 === 0 ? CLARA : OSCURA) + '"/>');
    }
    (opciones.destacar || []).forEach((sq) => {
        const [x, y] = xy(sq);
        s.push('<rect x="' + x + '" y="' + y + '" width="' + celda + '" height="' + celda +
               '" fill="' + MARCA + '" fill-opacity="0.55"/>');
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
    s.push("</svg>");
    return s.join("");
}

module.exports = { tablero: tablero, CLARA: CLARA, OSCURA: OSCURA, BORDE: BORDE, MARCA: MARCA };
