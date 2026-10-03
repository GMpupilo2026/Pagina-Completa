/* Lo que comparten los generadores de planes de clase: los planes de arranque
 * (herramientas/planes-semilla.js) y los de los proyectos
 * (herramientas/proyecto-semilla.js).
 *
 * NINGUNA POSICIÓN SE INVENTA ACÁ: estas funciones arman renglones a partir de
 * posiciones que ya trae un banco verificado, y cada una vuelve a pasar por la
 * MISMA regla que la clase en vivo (js/posicion-valida.js) antes de entrar a
 * un plan. Una posición que rompe a Stockfish no da ningún error hasta que el
 * profesor la manda al tablero, delante de todos.
 *
 * Vive en un solo lugar porque los dos generadores escriben chuletas que el
 * profesor lee en voz alta: si una copia corrigiera la notación y la otra no,
 * un plan diría «Rxa5» y el otro «Ra5» del mismo final.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "..");
const Chess = require(path.join(RAIZ, "node_modules", "chess.js")).Chess;

// ---------------------------------------------------------------- validación

/* La misma regla que js/posicion-valida.js. No se importa el archivo porque es
   de navegador (window.PosicionValida); si algún día se separan, este
   generador deja pasar lo que la clase en vivo rechaza — por eso
   verificar-planes-semilla.js corre las dos sobre las mismas posiciones. */
function motivoPosicionInvalida(fen) {
    const parts = String(fen || "").split(" ");
    const filas = (parts[0] || "").split("/");
    if (filas.length !== 8) return "no se pudo leer";
    if ((parts[0].match(/K/g) || []).length !== 1 || (parts[0].match(/k/g) || []).length !== 1) {
        return "tiene que haber un rey de cada color";
    }
    if (/[pP]/.test(filas[0]) || /[pP]/.test(filas[7])) return "peón en la primera o la última fila";
    const turnoContrario = parts[1] === "b" ? "w" : "b";
    const prueba = new Chess(filas.join("/") + " " + turnoContrario + " " + (parts[2] || "-") + " - 0 1");
    if (prueba.in_check && prueba.in_check()) return "el rey que no mueve está en jaque";
    return null;
}

const contador = { descartadas: 0 };
function fenUsable(fen) {
    if (!fen) return false;
    const motivo = motivoPosicionInvalida(fen);
    if (motivo) { contador.descartadas += 1; return false; }
    // Y que chess.js la cargue de verdad y queden jugadas: una posición sin
    // jugadas legales no se puede dar en clase, solo mirar.
    const c = new Chess();
    if (!c.load(fen)) { contador.descartadas += 1; return false; }
    if (!c.moves().length) { contador.descartadas += 1; return false; }
    return true;
}

// ------------------------------------------------------------------ utilidades

const leerJSON = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, p), "utf8"));

const PIEZA_ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
/* La notación de acá, para que la chuleta del profesor no diga "Nf3". Es la
   misma traducción que hace entreno/aperturas.html en pantalla. */
function aEspanol(san) {
    return String(san).replace(/[KQRBN]/g, (m) => PIEZA_ES[m] || m);
}
const lineaEnEspanol = (jugadas) => jugadas.map((j, i) =>
    (i % 2 === 0 ? (i / 2 + 1) + "." : "") + aEspanol(j)).join(" ");

/* La chuleta de un final se arma con los SAN de `jugadas[]`, NO con el campo
   `linea_es` del banco.
 *
 * Ese campo es texto suelto y tiene capturas escritas sin la x: en "Retrasando
 * la captura" dice "Ra5" donde la jugada de verdad es "Rxa5". Como es solo
 * texto que se lee, nunca falló nada — pero puesto en la chuleta es lo que el
 * profesor lee en voz alta delante de la clase, y no se puede jugar.
 * `jugadas[].san` es el mismo dato que mueve el visor del curso. */
function lineaDesdeJugadas(fen, jugadas) {
    const partes = String(fen).split(" ");
    let numero = parseInt(partes[5], 10) || 1;
    let tocanBlancas = partes[1] !== "b";
    const salida = [];
    jugadas.forEach((j) => {
        const san = aEspanol(j.san);
        if (tocanBlancas) {
            salida.push(numero + "." + san);
        } else {
            salida.push(salida.length === 0 ? numero + "..." + san : san);
            numero += 1;   // el número sube DESPUÉS de la jugada de las negras
        }
        tocanBlancas = !tocanBlancas;
    });
    return salida.join(" ");
}

const turnoDe = (fen) => (String(fen).split(" ")[1] === "b" ? "Juegan negras" : "Juegan blancas");

const chuletaDeDiagrama = (d) =>
    [turnoDe(d.fen), d.resultado_texto].filter(Boolean).join(" · ") +
    (d.jugadas && d.jugadas.length ? " · Línea: " + lineaDesdeJugadas(d.fen, d.jugadas) : "");

const recorta = (texto, n) => {
    const t = String(texto || "").replace(/\s+/g, " ").trim();
    return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
};

/* Un renglón de posición. La `pregunta` lleva la consigna Y la respuesta: este
   panel solo lo ve el profesor (como el PDF y la lección de curso), así que es
   su chuleta — no hay ningún lugar donde el alumno la lea. */
function posicion(titulo, fen, consigna) {
    if (!fenUsable(fen)) return null;
    return { tipo: "posicion", titulo: recorta(titulo, 200), fen: fen,
             pregunta: consigna ? recorta(consigna, 500) : null };
}
const nota = (titulo, texto) => ({ tipo: "nota", titulo: recorta(titulo, 200), nota: recorta(texto, 2000) });

/* De una línea se siembra la posición a la que LLEGA… salvo cuando esa posición
   ya no tiene jugadas, que es lo que pasa con toda celada que termina en mate.
   Ahí se siembra la de UNA JUGADA ANTES y la chuleta dice cuál remata: así la
   clase tiene algo que encontrar, que es para lo que sirve una celada. Sembrar
   la final sería enseñarles el mate ya puesto — y además no se puede: una
   posición sin jugadas legales no entra al tablero de la clase. */
function renglonDeLinea(l) {
    const c = new Chess();
    for (const san of l.jugadas) { if (!c.move(san)) return null; }
    const quien = l.color === "w" ? "blancas" : "negras";
    const clave = l.clave ? " · Clave: " + l.clave : "";

    if (c.moves().length) {
        return posicion(l.nombre, c.fen(),
            "El alumno lleva " + quien + " · " + lineaEnEspanol(l.jugadas) + clave);
    }

    const ultima = c.undo();
    if (!ultima) return null;
    const antes = l.jugadas.slice(0, -1);
    return posicion(l.nombre, c.fen(),
        "El alumno lleva " + quien + " · ¿Cómo remata? " + aEspanol(ultima.san) +
        " · Hasta aquí: " + lineaEnEspanol(antes) + clave);
}

/* Las 40 líneas de js/aperturas-lineas.js, que es un archivo de navegador. */
function lineasDeAperturas() {
    global.window = global.window || {};
    require(path.join(RAIZ, "js", "aperturas-lineas.js"));
    const api = global.window.AperturasLineas;
    return api.todas ? api.todas() : (api.LINEAS || api.lineas || []);
}

/* Los ejercicios de Lichess que ya sirve `entreno/temas.html`. Se eligen los más
   fáciles de cada tema (rating más bajo): una clase no empieza por el ejercicio
   más duro. Con `desde` se saltan los primeros, para que dos clases del mismo
   tema no repitan ejercicios. */
function ejerciciosDeTema(d, key, cuantos, desde) {
    const ids = (d.themes && d.themes[key]) || [];
    return ids
        .map((id) => Object.assign({ id }, d.puzzles[id]))
        .filter((p) => p && p.fen && fenUsable(p.fen))
        .sort((a, b) => (a.rating || 9999) - (b.rating || 9999))
        .slice(desde || 0, (desde || 0) + cuantos);
}

/* Un ejercicio de táctica como renglón, con la solución en la chuleta. */
const renglonDeEjercicio = (p, titulo) => posicion(
    titulo + (p.rating ? " (dificultad " + p.rating + ")" : ""),
    p.fen,
    turnoDe(p.fen) + " · Solución: " + (p.solution || []).map(aEspanol).join(" "));

module.exports = {
    RAIZ, Chess, contador, motivoPosicionInvalida, fenUsable, leerJSON,
    aEspanol, lineaEnEspanol, lineaDesdeJugadas, turnoDe, chuletaDeDiagrama,
    recorta, posicion, nota, renglonDeLinea, lineasDeAperturas,
    ejerciciosDeTema, renglonDeEjercicio,
};
