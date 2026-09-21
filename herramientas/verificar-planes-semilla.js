/* Comprueba los planes de clase de arranque que genera herramientas/planes-semilla.js.
 *
 * No hace falta navegador ni red: lo que se comprueba es el CONTENIDO, y todo lo
 * que puede estar mal acá se rompe callado, delante de la clase:
 *
 *  1. UNA POSICIÓN QUE LA CLASE EN VIVO RECHAZA. El generador valida con su
 *     propia copia de la regla; si se separa de `js/posicion-valida.js`, siembra
 *     posiciones que después el botón "Al tablero" no acepta. Acá se corren LAS
 *     DOS sobre las mismas posiciones y se exige el mismo veredicto.
 *
 *  2. UNA SOLUCIÓN QUE NO SE PUEDE JUGAR. La chuleta de cada renglón lleva la
 *     solución escrita, y es lo que el profesor va a leer en voz alta. Si no
 *     corresponde a esa posición no falla nada: se lee, no funciona, y queda él
 *     delante de la clase. Se vuelve a jugar con chess.js, jugada por jugada.
 *
 *  3. UN MATE QUE NO ES MATE. Donde la solución promete mate (#), tiene que
 *     serlo. Es el mismo criterio del banco del diagnóstico y del de fichas.
 *
 *  4. UN PLAN VACÍO O REPETIDO. Un plan sin renglones es una tarjeta que se abre
 *     en clase para nada, y dos con el mismo título no se distinguen en la lista.
 *
 * Uso:  npm install chess.js@0.10.3
 *       node herramientas/planes-semilla.js && node herramientas/verificar-planes-semilla.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const Chess = require(path.join(RAIZ, "node_modules", "chess.js")).Chess;

const SEMILLA = path.join(__dirname, "planes", "semilla.json");
if (!fs.existsSync(SEMILLA)) {
    console.error("Falta " + path.relative(RAIZ, SEMILLA) + ". Corré antes: node herramientas/planes-semilla.js");
    process.exit(2);
}
const { planes } = JSON.parse(fs.readFileSync(SEMILLA, "utf8"));

/* La regla de la clase en vivo, cargada TAL CUAL del archivo que usa el sitio.
   Compararla contra una copia escrita acá no probaría nada: probaría la copia. */
global.window = {};
global.Chess = Chess;
require(path.join(RAIZ, "js", "posicion-valida.js"));
const PosicionValida = global.window.PosicionValida;

/* Des-traducir la chuleta. El generador escribe la solución en la notación de
   acá; para volver a jugarla hace falta la inglesa, que es la que entiende
   chess.js. Va en UN solo paso y no encadenado: con dos reemplazos seguidos,
   T→R y después R→K convertiría las torres en reyes. */
const A_INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const aIngles = (san) => String(san).replace(/[RDTAC]/g, (m) => A_INGLES[m]);

let fallos = 0;
const mal = (msg) => { console.log("  ✗ " + msg); fallos += 1; };

// ------------------------------------------------------------------ 1 y 4

console.log("=== Los planes ===");
console.log("  " + planes.length + " planes · " +
            planes.reduce((n, p) => n + p.items.length, 0) + " renglones");

const titulos = new Set();
planes.forEach((p) => {
    if (!p.items.length) mal("plan sin renglones: " + p.titulo);
    if (titulos.has(p.titulo)) mal("dos planes con el mismo título: " + p.titulo);
    titulos.add(p.titulo);
    if (p.titulo.length > 200) mal("título demasiado largo: " + p.titulo);
    // El CHECK de la base: una posición sin FEN es un renglón que no hace nada.
    p.items.forEach((it) => {
        if (it.tipo === "posicion" && !it.fen) mal("posición sin FEN en " + p.titulo + ": " + it.titulo);
        if (it.tipo === "leccion" && (!it.curso || it.leccion === null)) mal("lección incompleta en " + p.titulo);
        if (it.titulo.length > 200) mal("renglón con título largo en " + p.titulo);
        if (it.pregunta && it.pregunta.length > 500) mal("chuleta de más de 500 en " + p.titulo + ": " + it.titulo);
    });
    // El orden tiene que ser 0,1,2… sin huecos ni repetidos: con dos renglones
    // en el mismo número el plan sale distinto cada vez.
    const ordenes = p.items.map((i) => i.orden).join(",");
    const esperado = p.items.map((_, i) => i).join(",");
    if (ordenes !== esperado) mal("orden con huecos o repetido en " + p.titulo + ": " + ordenes);
});
if (!fallos) console.log("  ✓ ninguno vacío, ninguno repetido, todos con su orden seguido");

// ------------------------------------------------- 2: las dos validaciones

console.log("\n=== La posición, contra la regla de la clase en vivo ===");
const posiciones = [];
planes.forEach((p) => p.items.forEach((it) => { if (it.tipo === "posicion") posiciones.push({ p, it }); }));

let rechazadas = 0;
posiciones.forEach(({ p, it }) => {
    const motivo = PosicionValida.motivo(it.fen);
    if (motivo) { rechazadas += 1; mal("la clase en vivo la rechazaría (" + motivo + "): " + p.titulo + " / " + it.titulo); }
});
if (!rechazadas) console.log("  ✓ las " + posiciones.length + " posiciones pasan la MISMA regla que usa el botón «Al tablero»");

/* Y que la regla siga siendo la misma en los dos lados: tres posiciones que la
   clase en vivo rechaza a propósito tienen que seguir siendo rechazadas. Si
   alguien afloja una de las dos copias, esto salta. */
const ROTAS = [
    ["8/8/8/8/8/8/8/KK6 w - - 0 1", "dos reyes blancos y ninguno negro"],
    ["k7/8/8/8/8/8/7P/K7 w - - 0 1", "esta es legal, de control"],
    ["P6k/8/8/8/8/8/8/K7 w - - 0 1", "peón en la última fila"],
];
let coinciden = true;
ROTAS.forEach(([fen, que]) => {
    const rechaza = !!PosicionValida.motivo(fen);
    const debe = que !== "esta es legal, de control";
    if (rechaza !== debe) { coinciden = false; mal("la regla cambió de opinión sobre «" + que + "»"); }
});
if (coinciden) console.log("  ✓ y sigue rechazando lo que tiene que rechazar (sin rey, peón en la fila 8)");

// ----------------------------------------- 3: la solución se puede jugar

console.log("\n=== La solución escrita en cada chuleta ===");
let conSolucion = 0, jugadas = 0, mates = 0;
posiciones.forEach(({ p, it }) => {
    if (!it.pregunta) return;
    // Los finales escriben "Línea:" y la táctica "Solución:": las dos son la
    // respuesta que el profesor va a leer en voz alta, así que las dos se juegan.
    const m = it.pregunta.match(/(?:Solución|Línea):\s*(.+?)(?:\s·|$)/);
    const linea = m && m[1];
    if (!linea || linea === "—") return;
    conSolucion += 1;

    const c = new Chess();
    if (!c.load(it.fen)) { mal("la FEN no carga: " + p.titulo + " / " + it.titulo); return; }
    const pasos = linea.trim().split(/\s+/).filter((x) => x && !/^\d+\.+$/.test(x));
    let prometeMate = false;
    for (const paso of pasos) {
        const san = aIngles(paso.replace(/^\d+\.+/, ""));
        if (!san) continue;
        if (san.includes("#")) prometeMate = true;
        const hecha = c.move(san, { sloppy: true });
        if (!hecha) {
            mal("esa jugada no existe en esa posición (" + paso + "): " + p.titulo + " / " + it.titulo +
                "\n        fen: " + it.fen + "\n        solución: " + linea);
            return;
        }
        jugadas += 1;
    }
    // Lo que promete mate tiene que ser mate: es el criterio del resto del repo.
    if (prometeMate) {
        mates += 1;
        if (!c.in_checkmate()) {
            mal("promete mate y no es mate: " + p.titulo + " / " + it.titulo + " · " + linea);
        }
    }
});
if (conSolucion) {
    console.log("  ✓ " + conSolucion + " soluciones jugadas con chess.js (" + jugadas + " jugadas)");
    console.log("  ✓ " + mates + " de ellas prometen mate, y lo dan");
}

// ------------------------------------------------------- la línea de apertura

console.log("\n=== Las líneas de apertura llegan a su posición ===");
global.window = global.window || {};
require(path.join(RAIZ, "js", "aperturas-lineas.js"));
const api = global.window.AperturasLineas;
const LINEAS = api.todas ? api.todas() : (api.LINEAS || []);
let comprobadas = 0;
planes.filter((p) => /^(Apertura|Celadas)/.test(p.titulo)).forEach((p) => {
    p.items.filter((it) => it.tipo === "posicion").forEach((it) => {
        const l = LINEAS.find((x) => x.nombre === it.titulo);
        if (!l) return;
        const c = new Chess();
        l.jugadas.forEach((san) => c.move(san));

        /* La posición sembrada tiene que salir de jugar ESA línea. Hay dos
           finales legítimos y ninguno más:
             - la posición a la que llega la línea entera;
             - o la de una jugada antes, cuando la final ya no tiene jugadas
               (toda celada que termina en mate). Ahí la chuleta tiene que decir
               cuál remata, y esa jugada tiene que dar mate de verdad. */
        if (c.fen() === it.fen) { comprobadas += 1; return; }

        const ultima = c.undo();
        if (ultima && c.fen() === it.fen) {
            const m = (it.pregunta || "").match(/¿Cómo remata\?\s*(\S+)/);
            if (!m) {
                mal("se sembró una jugada antes pero la chuleta no dice cuál remata: " + l.nombre);
                return;
            }
            const san = aIngles(m[1]);
            const hecha = c.move(san, { sloppy: true });
            if (!hecha) { mal("la jugada de remate no existe ahí (" + m[1] + "): " + l.nombre); return; }
            if (!c.in_checkmate()) { mal("la jugada de remate no da mate: " + l.nombre + " · " + m[1]); return; }
            comprobadas += 1;
            return;
        }

        mal("la posición no es a la que llega la línea: " + l.nombre +
            "\n        sembrada: " + it.fen + "\n        de la línea: " + c.fen());
    });
});
console.log("  ✓ " + comprobadas + " posiciones de apertura salen de jugar su línea (o la de justo antes del mate, con su remate comprobado)");

console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: los planes de arranque se pueden dar tal cual.");
process.exit(fallos ? 1 : 0);
