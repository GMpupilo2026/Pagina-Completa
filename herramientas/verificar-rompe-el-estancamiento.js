/* Verifica el curso y el libro «Rompe el estancamiento»: el banco
 * (material/rompe-el-estancamiento/banco.js), los ejemplos de las lecciones
 * del curso y la versión accesible del libro.
 *
 * Lo que comprueba, porque nada de esto da error si se rompe —el curso se ve
 * y el libro se imprime igual—:
 *   - ninguna posición repetida, ni una que ya esté en el diagnóstico, en
 *     «Ponte a prueba» o en «Mide tu fuerza» (el mismo ejercicio en dos
 *     libros mediría memoria);
 *   - cada FEN es legal y la última jugada marcada la hizo el rival;
 *   - la solución guardada es legal, es la primera jugada de la línea, y la
 *     línea entera se puede jugar;
 *   - cada lección con tema tiene su ejemplo, y el ejemplo del curso
 *     (herramientas/cursos/…json y cursos/protegido/data/…json) es la MISMA
 *     posición que la del libro: si se regenera uno y no el otro, el curso y
 *     el libro enseñarían posiciones distintas con el mismo texto;
 *   - lo que el texto de la lección dice de su ejemplo es cierto en la
 *     posición (la jugada «tranquila» no da jaque ni captura, el final de
 *     peones no tiene piezas);
 *   - 8 ejercicios por capítulo y 24 mixtos;
 *   - la versión accesible cuenta todas las posiciones, no trae imágenes ni
 *     jugadas escritas en notación.
 *
 *   node herramientas/verificar-rompe-el-estancamiento.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { DESCUENTO_LICHESS, TEMAS_CAPITULO } = require("./rompe-el-estancamiento-generar.js");

const RAIZ = path.join(__dirname, "..");
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const win = {};
const cargar = (f) => new Function("window", fs.readFileSync(path.join(RAIZ, f), "utf8"))(win);
cargar("js/diagnostico-items.js");
cargar("material/ponte-a-prueba/banco.js");
cargar("material/mide-tu-fuerza/banco.js");
cargar("material/rompe-el-estancamiento/banco.js");

const LIBRO = win.ROMPE_EL_ESTANCAMIENTO;
const ITEMS = win.ROMPE_EL_ESTANCAMIENTO_ITEMS;
const CURSO = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos", "rompe-el-estancamiento.json"), "utf8"));
const DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos", "protegido", "data", "rompe-el-estancamiento.json"), "utf8"));
const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const aIngles = (san) => san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]);

/* ---------- el banco ---------- */
const otras = new Set([].concat(win.DIAGNOSTICO_ITEMS || [], win.LIBRO_EXAMEN_ITEMS || [], win.MIDE_TU_FUERZA_ITEMS || [])
  .map((i) => i.lichess).filter(Boolean));
const vistas = new Set();
ITEMS.forEach((it) => {
  const id = `posición ${it.n} (${it.id})`;
  ok(!vistas.has(it.lichess), `${id}: repetida`);
  vistas.add(it.lichess);
  ok(!otras.has(it.lichess), `${id}: ya está en el diagnóstico, «Ponte a prueba» o «Mide tu fuerza»`);
  ok(it.elo === it.rating - DESCUENTO_LICHESS, `${id}: la dificultad no sale del rating`);
  const g = new Chess();
  ok(g.load(it.fen), `${id}: la FEN no carga`);
  ok(g.turn() === it.juegan, `${id}: dice que juegan las ${it.juegan} y la FEN dice otra cosa`);
  ok(it.fen.split(" ")[1] === it.juegan, `${id}: el turno no coincide`);
  const mov = g.move(it.solucion);
  ok(mov && aIngles(it.primera).replace(/[+#]/, "") === mov.san.replace(/[+#]/, ""), `${id}: la solución guardada no es ${it.primera}`);
  const linea = new Chess(it.fen);
  const jugadas = it.linea.replace(/\d+(\.|…)/g, " ").trim().split(/\s+/);
  ok(jugadas[0] === it.primera, `${id}: la línea no empieza por la solución`);
  jugadas.forEach((san) => ok(linea.move(aIngles(san)), `${id}: la jugada ${san} de la línea no es legal`));
  ok(it.marca && it.marca.length === 2, `${id}: falta la última jugada del rival`);
});

/* ---------- lo que pide cada uso ---------- */
const capitulos = Object.keys(TEMAS_CAPITULO).map(Number);
capitulos.forEach((c) => {
  const de = ITEMS.filter((i) => i.uso === "ejercicio" && i.capitulo === c);
  ok(de.length === LIBRO.POR_CAPITULO, `capítulo ${c}: ${de.length} ejercicios y deberían ser ${LIBRO.POR_CAPITULO}`);
  de.forEach((i) => ok(TEMAS_CAPITULO[c].includes(i.tema), `capítulo ${c}: el ejercicio ${i.id} es de ${i.tema}, que no es de su familia`));
});
ok(ITEMS.filter((i) => i.uso === "mixto").length === LIBRO.MIXTOS, `deberían ser ${LIBRO.MIXTOS} mixtos`);

/* ---------- el ejemplo de cada lección, en el curso y en el libro ---------- */
let n = 0;
CURSO.bloques.forEach((b) => b.lecciones.forEach((l) => {
  n += 1;
  const ej = ITEMS.find((i) => i.uso === "ejemplo" && i.leccion === n);
  if (!l.tema) {
    ok(!ej && !l.diagramas, `lección ${n}: no tiene tema y trae ejemplo`);
    return;
  }
  ok(ej, `lección ${n}: no tiene su ejemplo en el banco`);
  if (!ej) return;
  ok(ej.tema === l.tema, `lección ${n}: el ejemplo es de ${ej.tema} y la lección pide ${l.tema}`);
  ok(l.diagramas && l.diagramas[0].fen === ej.fen, `lección ${n}: el ejemplo del curso no es el del libro`);
  const datos = DATOS.finales.find((f) => f.leccion === n);
  ok(datos && datos.diagramas[0].fen === ej.fen, `lección ${n}: cursos/protegido/data no está al día (curso-posiciones.js)`);
  const g = new Chess(ej.fen);
  const m = g.move(ej.solucion);
  if (l.tema === "quietMove") ok(!m.captured && !/[+#]/.test(m.san), `lección ${n}: dice «jugada tranquila» y ${ej.primera} no lo es`);
  if (l.tema === "pawnEndgame") ok(/^[kKpP1-8/]+$/.test(ej.fen.split(" ")[0]), `lección ${n}: dice «final de peones» y hay piezas`);
  if (l.tema === "sacrifice") ok(g.moves({ verbose: true }).some((r) => r.to === m.to && r.captured), `lección ${n}: dice que entrega material y la pieza no queda al alcance`);
}));

/* ---------- la versión accesible ---------- */
const acc = fs.readFileSync(path.join(RAIZ, "material", "rompe-el-estancamiento", "rompe-el-estancamiento-accesible.html"), "utf8");
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
