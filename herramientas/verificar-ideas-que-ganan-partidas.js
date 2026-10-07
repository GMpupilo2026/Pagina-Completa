/* Verifica el curso y el libro «Ideas que ganan partidas»: el banco
 * (material/ideas-que-ganan-partidas/banco.js), los ejemplos de las lecciones
 * del curso y la versión accesible del libro.
 *
 * Lo que comprueba, porque nada de esto da error si se rompe —el curso se ve
 * y el libro se imprime igual—:
 *   - ninguna posición repetida, ni una que ya esté en el diagnóstico, en
 *     «Ponte a prueba», en «Mide tu fuerza» o en «Rompe el estancamiento» (el
 *     mismo ejercicio en dos libros mediría memoria);
 *   - cada FEN es legal y la última jugada marcada la hizo el rival;
 *   - la solución guardada es legal, es la primera jugada de la línea, y la
 *     línea entera se puede jugar;
 *   - la idea que dice cada posición se ve EN la posición: el mismo CRITERIOS
 *     del generador (el alfil que toma en h7 con jaque, la torre que llega a
 *     la séptima, el final que solo tiene alfil y caballo…), mirado desde el
 *     banco, para que un cambio a mano no deje una lección diciendo algo que
 *     su ejemplo no muestra;
 *   - cada lección con idea tiene su ejemplo, y el ejemplo del curso
 *     (herramientas/cursos/…json y cursos/protegido/data/…json) es la MISMA
 *     posición que la del libro;
 *   - 8 ejercicios por capítulo, de las ideas de su capítulo, y 24 mixtos;
 *   - la versión accesible cuenta todas las posiciones, no trae imágenes ni
 *     jugadas escritas en notación.
 *
 *   node herramientas/verificar-ideas-que-ganan-partidas.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { DESCUENTO_LICHESS, IDEAS_CAPITULO, CRITERIOS, datosDe } = require("./ideas-que-ganan-partidas-generar.js");

const RAIZ = path.join(__dirname, "..");
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const win = {};
const cargar = (f) => new Function("window", fs.readFileSync(path.join(RAIZ, f), "utf8"))(win);
cargar("js/diagnostico-items.js");
cargar("material/ponte-a-prueba/banco.js");
cargar("material/mide-tu-fuerza/banco.js");
cargar("material/rompe-el-estancamiento/banco.js");
cargar("material/ideas-que-ganan-partidas/banco.js");

const LIBRO = win.IDEAS_QUE_GANAN;
const ITEMS = win.IDEAS_QUE_GANAN_ITEMS;
const CURSO = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos", "ideas-que-ganan-partidas.json"), "utf8"));
const DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos", "protegido", "data", "ideas-que-ganan-partidas.json"), "utf8"));
const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const aIngles = (san) => san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]);

/* ---------- el banco ---------- */
const otras = new Set([].concat(win.DIAGNOSTICO_ITEMS || [], win.LIBRO_EXAMEN_ITEMS || [], win.MIDE_TU_FUERZA_ITEMS || [],
  win.ROMPE_EL_ESTANCAMIENTO_ITEMS || []).map((i) => i.lichess).filter(Boolean));
const vistas = new Set();
ITEMS.forEach((it) => {
  const id = `posición ${it.n} (${it.id})`;
  ok(!vistas.has(it.lichess), `${id}: repetida`);
  vistas.add(it.lichess);
  ok(!otras.has(it.lichess), `${id}: ya está en el diagnóstico o en otro libro`);
  ok(it.elo === it.rating - DESCUENTO_LICHESS, `${id}: la dificultad no sale del rating`);
  const g = new Chess();
  ok(g.load(it.fen), `${id}: la FEN no carga`);
  ok(g.turn() === it.juegan && it.fen.split(" ")[1] === it.juegan, `${id}: el turno no coincide`);
  const mov = g.move(it.solucion);
  ok(mov && aIngles(it.primera).replace(/[+#]/, "") === mov.san.replace(/[+#]/, ""), `${id}: la solución guardada no es ${it.primera}`);
  const linea = new Chess(it.fen);
  const jugadas = it.linea.replace(/\d+(\.|…)/g, " ").trim().split(/\s+/);
  ok(jugadas[0] === it.primera, `${id}: la línea no empieza por la solución`);
  jugadas.forEach((san) => ok(linea.move(aIngles(san)), `${id}: la jugada ${san} de la línea no es legal`));
  ok(it.marca && it.marca.length === 2, `${id}: falta la última jugada del rival`);
  /* La idea, en la posición. Los temas de Lichess se guardan en «explica»
     solo como texto, así que acá se miran las ideas que dependen de la
     jugada o del material; las que son solo una etiqueta de Lichess las
     garantizó el generador. */
  const criterio = CRITERIOS[it.tema];
  ok(criterio, `${id}: la idea «${it.tema}» no existe`);
  if (criterio && mov) {
    const d = datosDe(it.fen, it.solucion.from + it.solucion.to + (it.solucion.promotion || ""));
    const SOLO_JUGADA = ["h7", "demolicion", "septima", "dama", "calidad", "peonsac", "alfilcaballo"];
    if (SOLO_JUGADA.includes(it.tema)) ok(criterio("", d), `${id}: la idea «${it.tema}» no se ve en la posición`);
    if (it.tema === "peones") ok(/^[kKpP1-8/]+$/.test(it.fen.split(" ")[0]), `${id}: dice «final de peones» y hay piezas`);
    if (it.tema === "torres") ok(/^[kKpPrR1-8/]+$/.test(it.fen.split(" ")[0]), `${id}: dice «final de torres» y hay otras piezas`);
    if (it.tema === "alfiles") ok(/^[kKpPbB1-8/]+$/.test(it.fen.split(" ")[0]), `${id}: dice «final de alfiles» y hay otras piezas`);
    if (it.tema === "damas") ok(/^[kKpPqQ1-8/]+$/.test(it.fen.split(" ")[0]), `${id}: dice «final de damas» y hay otras piezas`);
    if (["caballo", "alfil", "pasado", "ruptura"].includes(it.tema)) {
      const pieza = { caballo: "n", alfil: "b", pasado: "p", ruptura: "p" }[it.tema];
      ok(d.m.piece === pieza, `${id}: la idea «${it.tema}» pide mover ${pieza} y la solución mueve ${d.m.piece}`);
    }
    if (it.tema === "mayores") ok("rq".includes(d.m.piece), `${id}: dice que entra una pieza mayor y la solución mueve ${d.m.piece}`);
    if (it.tema === "extraccion") ok(/\+/.test(d.m.san) && d.tras.some((r) => r.piece === "k" && r.to === d.m.to), `${id}: dice que saca al rey con jaque y no es así`);
    if (it.tema === "reycentro") ok("def".includes(d.reyEl[0]), `${id}: dice que el rey está en el centro y está en ${d.reyEl}`);
    if (it.tema === "opuestos") ok(("abc".includes(d.reyEl[0]) && "gh".includes(d.reyYo[0])) || ("gh".includes(d.reyEl[0]) && "abc".includes(d.reyYo[0])), `${id}: dice enroques opuestos y no lo son`);
  }
});

/* ---------- lo que pide cada uso ---------- */
const capitulos = Object.keys(IDEAS_CAPITULO).map(Number);
capitulos.forEach((c) => {
  const de = ITEMS.filter((i) => i.uso === "ejercicio" && i.capitulo === c);
  ok(de.length === LIBRO.POR_CAPITULO, `capítulo ${c}: ${de.length} ejercicios y deberían ser ${LIBRO.POR_CAPITULO}`);
  de.forEach((i) => ok(IDEAS_CAPITULO[c].includes(i.tema), `capítulo ${c}: el ejercicio ${i.id} es de ${i.tema}, que no es de su capítulo`));
});
ok(ITEMS.filter((i) => i.uso === "mixto").length === LIBRO.MIXTOS, `deberían ser ${LIBRO.MIXTOS} mixtos`);

/* ---------- el ejemplo de cada lección, en el curso y en el libro ---------- */
let n = 0;
CURSO.bloques.forEach((b) => b.lecciones.forEach((l) => {
  n += 1;
  const ej = ITEMS.find((i) => i.uso === "ejemplo" && i.leccion === n);
  if (!l.tema) {
    ok(!ej && !l.diagramas, `lección ${n}: no tiene idea y trae ejemplo`);
    return;
  }
  ok(IDEAS_CAPITULO[b.n].includes(l.tema), `lección ${n}: la idea ${l.tema} no es de su capítulo`);
  ok(ej, `lección ${n}: no tiene su ejemplo en el banco`);
  if (!ej) return;
  ok(ej.tema === l.tema, `lección ${n}: el ejemplo es de ${ej.tema} y la lección pide ${l.tema}`);
  ok(l.diagramas && l.diagramas[0].fen === ej.fen, `lección ${n}: el ejemplo del curso no es el del libro`);
  const datos = DATOS.finales.find((f) => f.leccion === n);
  ok(datos && datos.diagramas[0].fen === ej.fen, `lección ${n}: cursos/protegido/data no está al día (curso-posiciones.js)`);
}));

/* ---------- la versión accesible ---------- */
const acc = fs.readFileSync(path.join(RAIZ, "material", "ideas-que-ganan-partidas", "ideas-que-ganan-partidas-accesible.html"), "utf8");
ok(!/<img\b/i.test(acc), "la versión accesible trae imágenes");
ok((acc.match(/<p class="posicion">/g) || []).length === ITEMS.length, "la versión accesible no cuenta todas las posiciones");
const visible = acc.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<span class="fen">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " ");
const escrita = visible.match(/\b(?:\d+\.{1,3}|…)?[RDTAC][a-h]?[1-8]?x?[a-h][1-8][+#]?(?=[\s,.;)])/g);
ok(!escrita, "la versión accesible trae jugadas escritas: " + (escrita || []).slice(0, 5).join(", "));
ok(/Oscar Angulo Cubero/.test(acc), "la versión accesible no dice quién es el autor");

console.log(`${ITEMS.length} posiciones · ${ITEMS.filter((i) => i.uso === "ejemplo").length} ejemplos · ${capitulos.length} capítulos con ejercicios`);
if (fallos.length) {
  fallos.forEach((f) => console.log("  ✗ " + f));
  console.log(`\n${fallos.length} fallo(s)`);
  process.exit(1);
}
console.log("Todo bien.");
