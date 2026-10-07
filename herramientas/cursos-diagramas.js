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

// El dibujo del tablero vive en herramientas/lib/tablero-svg.js, que es el
// mismo que usa el material de estudio de cada lección.
const { tablero } = require("./lib/tablero-svg.js");

// ---------- Qué posición le toca a cada curso ----------
const dato = (archivo, buscar) => {
    const d = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos/protegido/data", archivo + ".json"), "utf8"));
    return buscar(d);
};

const CURSOS = [
    { slug: "los-cimientos-del-ajedrez", desde: ["los-cimientos-del-ajedrez",
        (d) => d.finales[0].diagramas[0]],
      destacar: ["d4", "d8"],
      alt: "Primer ejemplo del curso, de la partida Lasker–Meyer, Praga 1900: las dos torres blancas, dobladas en la columna d, salen a cazar al rey negro con jaques." },
    { slug: "el-mapa-de-los-finales", desde: ["el-mapa-de-los-finales",
        (d) => d.finales.find((f) => /^Posición Lucena/.test(f.titulo)).diagramas[0]],
      destacar: ["d7", "e1"],
      alt: "La posición Lucena, del propio curso: el peón en séptima y la torre a punto de construir el puente." },
    { slug: "partidas-modelo", desde: ["partidas-modelo",
        (d) => ({ fen: d.partidas["nunn-1"].moves[d.partidas["nunn-1"].claves[0].ply - 1].fen })],
      alt: "Un momento clave de una de las treinta partidas comentadas del curso." },
    { slug: "desequilibrios-de-material", desde: ["desequilibrios-de-material",
        (d) => ({ fen: d.partidas["imb-5"].moves[d.partidas["imb-5"].claves[0].ply - 1].fen })],
      alt: "Material parejo en puntos y posición desnivelada: el tipo de desequilibrio que estudia el curso." },
    { slug: "rompe-el-estancamiento", desde: ["rompe-el-estancamiento",
        (d) => d.finales[0].diagramas.find((x) => x.id === "RE-1")],
      destacar: ["a5", "a4"],
      alt: "Final de torres del primer ejemplo del curso: juegan las negras y la jugada que gana es un avance tranquilo del peón de a, sin jaque ni captura." },
    { slug: "ganar-con-poco", desde: ["ganar-con-poco",
        (d) => d.finales[0].diagramas.find((x) => x.id === "GP-1")],
      destacar: ["e8", "e1"],
      alt: "Primer ejemplo del curso: juegan las negras y la jugada que gana es tranquila, una torre que baja a e1 sin dar jaque ni capturar." },
    { slug: "cambiar-o-no-cambiar", desde: ["cambiar-o-no-cambiar",
        (d) => d.finales[0].diagramas.find((x) => x.id === "CC-1")],
      destacar: ["e3", "c5"],
      alt: "Posición de Rubinstein contra Salwe, de 1908: juegan las blancas y el alfil va a c5 para cambiar el alfil negro que cuida las casillas oscuras." },
    { slug: "ideas-que-ganan-partidas", desde: ["ideas-que-ganan-partidas",
        (d) => d.finales.find((f) => f.leccion === 2).diagramas[0]],
      destacar: ["d3", "h7"],
      alt: "El sacrificio del alfil en h7, ejemplo del curso: juegan las blancas, el peón de e5 ya echó al caballo de f6 y el alfil de d3 toma en h7 con jaque." },
    // Sus partidas están repartidas en un archivo por clase: la tarjeta toma el
    // sacrificio 13.Axe5! de la primera (Browne – Quinteros, Wijk aan Zee 1974).
    { slug: "una-clase-al-dia", desde: ["una-clase-al-dia/l001",
        (d) => ({ fen: d.partidas["ml001-1"].moves[d.partidas["ml001-1"].claves[1].ply - 1].fen })],
      destacar: ["e5"],
      alt: "El sacrificio Axe5 de Browne contra Quinteros: con las piezas negras sin desarrollar, el alfil se entrega para abrir la columna e contra el rey en el centro." },
    { slug: "formacion-ajedrez", fen: "7k/5K2/6P1/8/8/8/8/8 b - - 0 1", ahogado: true,
      destacar: ["h8", "f7", "g6"],
      alt: "Ahogado: el rey negro en h8 no tiene jaque pero tampoco ninguna jugada legal — tablas, no mate." },
    { slug: "arbitro-nacional", fen: "4k3/8/8/8/8/3B4/8/4K3 w - - 0 1",
      destacar: ["e1", "d3", "e8"],
      alt: "Posición muerta: rey y alfil contra rey solo — con ese material, ningún bando puede dar mate con ninguna secuencia de jugadas legales." },
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
    // Sin jugadas legales solo vale si es de verdad un ahogado (el curso lo
    // marca a propósito): cualquier otra posición sin jugadas es un error.
    if (c.moves().length === 0 && !(curso.ahogado && c.in_stalemate())) {
        console.log("FALLA " + curso.slug + ": posición sin jugadas legales"); fallos++; continue;
    }
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
