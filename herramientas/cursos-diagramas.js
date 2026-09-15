/* Genera los diagramas de las tarjetas de cursos.html: img/cursos/<slug>.svg
 *
 * Antes cada tarjeta tenía un emoji gigante sobre un degradado — dos cursos
 * compartían el 🏁 y cuatro el mismo degradado, así que al bajar por la página
 * se veían intercambiables, y los emojis se dibujan distinto en cada sistema.
 * Un diagrama real dice de qué se trata el curso en vez de solo decorarlo, pesa
 * unos 6 KB y se ve igual en todas partes.
 *
 * Las posiciones NO se inventan:
 *  - las de los cursos con tablero salen de su propio archivo de datos
 *    (cursos/protegido/data/<slug>.json), que ya está verificado con motor;
 *  - las demás van escritas acá y se comprueban con chess.js antes de dibujar:
 *    que la FEN cargue, que la posición sea legal y que la jugada clave exista.
 *
 *   npm install chess.js@0.10.3
 *   node herramientas/cursos-diagramas.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "img", "cursos");
const Chess = require("chess.js").Chess;

// Las piezas se sacan del mismo sitio que las usa el visor de finales, para no
// tener dos copias de los mismos dibujos que se puedan ir separando.
const FUENTE_PIEZAS = path.join(RAIZ, "js", "finales-100.js");
const bruto = fs.readFileSync(FUENTE_PIEZAS, "utf8");
const m = bruto.match(/const PIECE_DEFS = ("(?:[^"\\]|\\.)*");/);
if (!m) { console.error("No se encontraron las piezas en js/finales-100.js"); process.exit(1); }
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

// ---------- Qué posición le toca a cada curso ----------
const dato = (archivo, buscar) => {
    const d = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos/protegido/data", archivo + ".json"), "utf8"));
    return buscar(d);
};

const CURSOS = [
    { slug: "fundamentos-del-ajedrez", fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1",
      clave: "Ra8#", destacar: ["a1", "a8"],
      alt: "Mate del pasillo: la torre blanca entra por la primera fila y el rey negro, tapado por sus propios peones, no tiene salida." },
    { slug: "aperturas-y-defensas", fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
      destacar: ["e4", "c5"],
      alt: "La Defensa Siciliana después de 1.e4 c5: el peón negro discute el centro desde el flanco." },
    { slug: "estrategia-y-tactica", fen: "r2qkb1r/ppp2ppp/2n2n2/3p2B1/3P4/2N2N2/PPP2PPP/R2QKB1R b KQkq - 0 1",
      destacar: ["g5", "f6", "d8"],
      alt: "Una clavada: el alfil blanco de g5 sujeta al caballo de f6 contra la dama negra de d8." },
    { slug: "finales-practicos", fen: "8/5pk1/6p1/4b2p/7P/5BP1/5PK1/8 w - - 0 1",
      destacar: ["e5", "f3"],
      alt: "Final de alfiles de distinto color: cada alfil manda en casillas que el otro no pisa nunca." },
    { slug: "calculo-y-visualizacion", fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1",
      destacar: ["c4", "f7"],
      alt: "Posición abierta con piezas apuntando al enroque: la clase de posición donde hay que calcular antes de mover." },
    { slug: "el-mapa-de-los-finales", desde: ["el-mapa-de-los-finales",
        (d) => d.finales.find((f) => /^Posición Lucena/.test(f.titulo)).diagramas[0]],
      destacar: ["d7", "e1"],
      alt: "La posición Lucena, del propio curso: el peón en séptima y la torre a punto de construir el puente." },
    { slug: "estrategia-en-el-final", desde: ["estrategia-en-el-final",
        (d) => d.finales[0].diagramas.find((x) => x.id === "EEF-2")],
      destacar: ["d4", "d6"],
      alt: "Rey contra rey con un peón: los reyes enfrentados deciden la partida antes que el peón." },
    { slug: "partidas-modelo", desde: ["partidas-modelo",
        (d) => ({ fen: d.partidas["nunn-1"].moves[d.partidas["nunn-1"].claves[0].ply - 1].fen })],
      alt: "Un momento clave de una de las treinta partidas comentadas del curso." },
    { slug: "desequilibrios-de-material", desde: ["desequilibrios-de-material",
        (d) => ({ fen: d.partidas["imb-5"].moves[d.partidas["imb-5"].claves[0].ply - 1].fen })],
      alt: "Material parejo en puntos y posición desnivelada: el tipo de desequilibrio que estudia el curso." },
    { slug: "preparacion-para-torneos", fen: "r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1B3/PPP2PPP/R2Q1RK1 w - - 0 1",
      destacar: ["c4", "g7"],
      alt: "Posición de repertorio con ataques en flancos opuestos: la clase de lucha que aparece en torneo." },
];

fs.mkdirSync(SALIDA, { recursive: true });
let fallos = 0;
for (const curso of CURSOS) {
    let fen = curso.fen, origen = "escrita a mano";
    if (curso.desde) {
        const d = dato(curso.desde[0], curso.desde[1]);
        if (!d || !d.fen) { console.log("FALLA " + curso.slug + ": no se encontró la posición en los datos del curso"); fallos++; continue; }
        fen = d.fen; origen = "del curso (" + curso.desde[0] + ")";
    }
    // Verificación: la FEN carga, la posición es legal y hay jugadas.
    const c = new Chess();
    if (!c.load(fen)) { console.log("FALLA " + curso.slug + ": la FEN no carga — " + fen); fallos++; continue; }
    if (c.moves().length === 0) { console.log("FALLA " + curso.slug + ": posición sin jugadas legales"); fallos++; continue; }
    if (curso.clave) {
        const c2 = new Chess(fen);
        const hecha = c2.move(curso.clave);
        if (!hecha) { console.log("FALLA " + curso.slug + ": la jugada " + curso.clave + " no es legal"); fallos++; continue; }
        if (/#$/.test(curso.clave) && !c2.in_checkmate()) { console.log("FALLA " + curso.slug + ": " + curso.clave + " no da mate"); fallos++; continue; }
    }
    // Las casillas destacadas tienen que existir en el tablero.
    const malas = (curso.destacar || []).filter((sq) => !/^[a-h][1-8]$/.test(sq));
    if (malas.length) { console.log("FALLA " + curso.slug + ": casillas raras " + malas); fallos++; continue; }

    const svg = tablero(fen, { titulo: curso.alt, destacar: curso.destacar });
    const destino = path.join(SALIDA, curso.slug + ".svg");
    fs.writeFileSync(destino, svg);
    const kb = (fs.statSync(destino).size / 1024).toFixed(1);
    console.log("ok    " + curso.slug.padEnd(28) + kb.padStart(5) + " KB · " + origen);
}
console.log(fallos ? "\n" + fallos + " diagramas sin generar" : "\n" + CURSOS.length + " diagramas listos en img/cursos/");
process.exit(fallos ? 1 : 0);
