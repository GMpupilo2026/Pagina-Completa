#!/usr/bin/env node
/* Comprueba el ejercicio «El tablero mal colocado» de Formación Ajedrez
 * (Sesión 1, presentaciones/ejercicio-tablero/).
 *
 *   node herramientas/verificar-formacion-ejercicio-tablero.js
 *
 * Lo que dibuja formacion-laminas.js y lo que dicen las láminas puede estar
 * mal sin que nada falle en la clase: una pieza corrida entre el tablero mal
 * colocado y el bien colocado enseñaría a cambiar la posición al pasarla, y un
 * tablero «mal colocado» con los colores de siempre no mostraría nada. Acá:
 *
 * - la posición del ejercicio sale de jugar PARTIDA con chess.js, y las 10
 *   jugadas de cada bando que dice la lámina son las de la partida;
 * - el tablero mal colocado tiene la casilla OSCURA en h1 (colores cambiados)
 *   y el bien colocado, la clara; los dos de la solución, la MISMA posición;
 * - el rey y la dama cambiados de la lámina 7 son lo que da «dama en su
 *   color» en un tablero girado: la posición inicial con cada dama en la
 *   casilla de su color en ese tablero, y el rey en la otra;
 * - la respuesta que se da (C) es la opción que dice «pasar la posición», con
 *   el art. 7.2.2, y ninguna lámina antes de la solución la adelanta;
 * - está en la lista de la clase en vivo y en la Sesión 1 de sesiones.json.
 */
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { tablero } = require("./lib/tablero-svg");

const RAIZ = path.join(__dirname, "..");
const DECK = "ejercicio-tablero";
const CARPETA = path.join(RAIZ, "cursos", "recursos", "formacion-ajedrez", "presentaciones", DECK);
const DATOS = require("./datos/formacion-laminas-" + DECK + ".js");
const JSON_DECK = JSON.parse(fs.readFileSync(path.join(CARPETA, "diapositivas.json"), "utf8"));
const DIAPOS = JSON_DECK.diapositivas;
const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let fallas = 0;
const cierto = (nombre, ok, detalle) => {
  console.log((ok ? "  ✓ " : "  ✗ ") + nombre + (ok || !detalle ? "" : "  → " + detalle));
  if (!ok) fallas++;
};
const tableros = (d) => (d.tipo === "tableros" ? d.items.map((x) => ({ pos: x.pos, opciones: x.opciones || {} }))
  : d.tipo === "tablero" ? [{ pos: d.pos, opciones: d.opciones || {} }] : []);
const tipoDe = (i) => DATOS[i].tipo;
const piezas = (fen) => fen.split(" ")[0];

// El color que pinta el SVG en una casilla, con las opciones de esa lámina.
function colorDe(opciones, casilla) {
  const svg = tablero("8/8/8/8/8/8/8/8 w - - 0 1", Object.assign({}, opciones, { estrellas: [] }));
  const col = "abcdefgh".indexOf(casilla[0]), fila = +casilla[1];
  const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="12" height="12" fill="([^"]+)"/g)];
  // Las casillas van en orden: primero la fila 8, de a a h.
  const r = rects[(8 - fila) * 8 + col];
  return r && r[3];
}
const CLARA = colorDe({}, "h1"), OSCURA = colorDe({}, "a1");

console.log("1. La presentación está completa");
cierto("una entrada de datos por diapositiva", DATOS.length === DIAPOS.length, DATOS.length + " / " + DIAPOS.length);
cierto("dice de qué sesión es (la 1, donde está el tema del tablero)", JSON_DECK.sesion === 1);
cierto("el dibujo del tablero distingue clara y oscura", CLARA && OSCURA && CLARA !== OSCURA, CLARA + " / " + OSCURA);

console.log("2. La posición del ejercicio sale de una partida jugada");
const g = new Chess();
const jugadas = DATOS.PARTIDA.split(" ");
const malas = jugadas.filter((m) => !g.move(m));
cierto("cada jugada de PARTIDA es legal", !malas.length, malas.join(" "));
cierto("son 10 jugadas de cada bando, como dice la lámina", jugadas.length === 20 && /10 jugadas de cada bando/.test(DATOS[3].k));
const iEj = DATOS.findIndex((d) => d.tipo === "tablero");
const fenEj = DIAPOS[iEj].posiciones[DATOS[iEj].pos].fen;
cierto("la posición del ejercicio es la de la partida", fenEj === g.fen(), fenEj + " / " + g.fen());
cierto("le toca a las blancas, en la jugada 11", / w - - \d+ 11$/.test(fenEj));

console.log("3. El tablero mal colocado tiene la oscura a la derecha; el bien colocado, la clara");
DATOS.forEach((d, i) => tableros(d).forEach((t, k) => {
  const nombre = DIAPOS[i].posiciones[t.pos].nombre;
  const mal = /mal colocado/i.test(nombre);
  const h1 = colorDe(t.opciones, "h1"), a8 = colorDe(t.opciones, "a8");
  cierto("lámina " + (i + 1) + ", «" + nombre + "»: h1 y a8 " + (mal ? "oscuras" : "claras"),
    h1 === (mal ? OSCURA : CLARA) && a8 === h1, h1 + " " + a8);
  if (d.tipo === "tableros") {
    const x = d.items[k];
    cierto("  y su marca lo dice escrito (" + x.tono + ")", mal ? x.tono === "no" : x.tono === "si");
  }
}));

console.log("4. La solución: los dos tableros, con la misma posición");
const iSol = DATOS.findIndex((d) => d.tipo === "tableros" && /Respuesta/.test(d.k));
cierto("hay una lámina de solución después del ejercicio", iSol > iEj);
if (iSol > 0) {
  const [a, b] = DATOS[iSol].items.map((x) => DIAPOS[iSol].posiciones[x.pos].fen);
  cierto("el de la izquierda está mal colocado y el de la derecha bien", colorDe(DATOS[iSol].items[0].opciones, "h1") === OSCURA &&
    colorDe(DATOS[iSol].items[1].opciones || {}, "h1") === CLARA);
  cierto("las mismas piezas en las mismas casillas, y el mismo turno", a === b && a === fenEj, a + " / " + b);
  const letra = (DATOS[iSol].k.match(/Respuesta: ([A-D])/) || [])[1];
  const opcion = DATOS[iEj].items.find((x) => x.t.startsWith(letra + " ·"));
  cierto("la respuesta (" + letra + ") es la opción de pasar la posición", opcion && /Pasar la posición a un tablero bien colocado/.test(opcion.t));
  cierto("con el artículo 7.2.2", /7\.2\.2/.test(DATOS[iSol].k) && /7\.2\.2/.test(DIAPOS[iSol].texto));
  const antes = DIAPOS.slice(0, iSol).map((x) => x.titulo + " " + x.texto).join(" ") + JSON.stringify(DATOS.slice(0, iSol));
  cierto("ninguna lámina antes de la solución dice la respuesta", !/7\.2\.2|Respuesta/.test(antes));
}

console.log("5. Rey y dama cambiados: lo que da «dama en su color» en un tablero girado");
const iOjo = DATOS.findIndex((d) => d.tipo === "tableros" && d.items.some((x) => /Rey y dama cambiados/.test(x.t)));
cierto("está la lámina", iOjo > 0);
if (iOjo > 0) {
  const x = DATOS[iOjo].items.find((y) => /Rey y dama cambiados/.test(y.t));
  const fen = DIAPOS[iOjo].posiciones[x.pos].fen;
  const c = new Chess();
  cierto("chess.js la carga", c.load(fen));
  // En el tablero girado, cada dama va a la casilla de su color (la blanca a
  // una clara, la negra a una oscura) y el rey a la que queda.
  const enSuColor = (casilla, colorPieza) => colorDe(x.opciones, casilla) === (colorPieza === "w" ? CLARA : OSCURA);
  const dama = (lado) => ["d", "e"].map((f) => f + (lado === "w" ? 1 : 8)).find((sq) => (c.get(sq) || {}).type === "q");
  cierto("cada dama está en la casilla de su color de ese tablero", enSuColor(dama("w"), "w") && enSuColor(dama("b"), "b"), dama("w") + " " + dama("b"));
  cierto("y fuera de eso es la posición inicial con el rey y la dama cambiados de lugar",
    piezas(fen) === piezas(INICIAL).replace(/qk/g, "kq").replace(/QK/g, "KQ"));
  const bien = DATOS[iOjo].items.find((y) => y !== x);
  cierto("al lado, la posición inicial correcta en un tablero bien colocado", DIAPOS[iOjo].posiciones[bien.pos].fen === INICIAL);
  cierto("dice que se anula, con el 7.2.1", x.tono === "no" && /7\.2\.1/.test(x.s));
}

console.log("6. Se ofrece en la clase en vivo y en la ficha Asesores");
const modulo = fs.readFileSync(path.join(RAIZ, "js", "clase-presentacion.js"), "utf8");
cierto("está en la lista de la clase en vivo (LISTA), con su título", modulo.includes('deck: "formacion-ajedrez/' + DECK + '", titulo: ' + JSON.stringify(JSON_DECK.titulo)));
const ses = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos", "recursos", "formacion-ajedrez", "sesiones.json"), "utf8")).sesiones;
cierto("sesiones.json lo pone en la Sesión 1", (ses.find((s) => s.n === 1).ejercicios || []).some((e) => e.presentacion === "formacion-ajedrez/" + DECK));
cierto("la ficha Asesores pinta los ejercicios de cada sesión", /s\.ejercicios/.test(fs.readFileSync(path.join(RAIZ, "js", "admin-asesores.js"), "utf8")));

if (fallas) { console.log("\n✗ " + fallas + " fallas"); process.exit(1); }
console.log("\n✓ El ejercicio del tablero mal colocado está bien");

/*! rev bfb5bbb0d2d82f9f */
