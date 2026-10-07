/* Verifica el curso y el libro «¿Cambio o no cambio?»: el banco
 * (material/cambio-o-no-cambio/banco.js), los ejemplos de las lecciones del
 * curso y la versión accesible del libro.
 *
 * Lo que comprueba, porque nada de esto da error si se rompe —el curso se ve
 * y el libro se imprime igual—:
 *   - ninguna posición repetida, ni una que ya esté en el diagnóstico, en
 *     «Ponte a prueba», en «Mide tu fuerza» o en «Rompe el estancamiento»;
 *   - cada FEN es legal y la solución guardada es la primera jugada de una
 *     línea que se puede jugar entera;
 *   - cada lección con tema tiene su ejemplo, y el ejemplo del curso
 *     (herramientas/cursos/…json y cursos/protegido/data/…json) es la MISMA
 *     posición que la del libro;
 *   - LO QUE EL TEXTO DICE DEL CAMBIO es cierto en la línea de la solución,
 *     contado otra vez con chess.js y no leído del banco: si la lección dice
 *     que se cambian las damas, una dama se come a la otra y se recaptura;
 *     si dice que no cambia, la solución podía cambiar y no lo hace; si dice
 *     que queda un final de peones, al final de la línea solo hay reyes y
 *     peones; si dice que la jugada conserva la ventaja, el motor dijo que gana;
 *   - el comentario no llama «tranquila» a una jugada que captura o da jaque;
 *   - 8 ejercicios por capítulo, cada uno con su regla de cambio, y 24 mixtos
 *     con una decisión de cambio;
 *   - las cinco preguntas de la tarjeta del libro son las de la última lección;
 *   - la versión accesible cuenta todas las posiciones, no trae imágenes ni
 *     jugadas escritas en notación.
 *
 *   node herramientas/verificar-cambio-o-no-cambio.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { DESCUENTO_LICHESS, CAPITULOS, cambios, exige } = require("./cambio-o-no-cambio-generar.js");

const RAIZ = path.join(__dirname, "..");
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const win = {};
const cargar = (f) => new Function("window", fs.readFileSync(path.join(RAIZ, f), "utf8"))(win);
cargar("js/diagnostico-items.js");
cargar("material/ponte-a-prueba/banco.js");
cargar("material/mide-tu-fuerza/banco.js");
cargar("material/rompe-el-estancamiento/banco.js");
cargar("material/cambio-o-no-cambio/banco.js");

const LIBRO = win.CAMBIO_O_NO_CAMBIO;
const ITEMS = win.CAMBIO_O_NO_CAMBIO_ITEMS;
const CURSO = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos", "cambio-o-no-cambio.json"), "utf8"));
const DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos", "protegido", "data", "cambio-o-no-cambio.json"), "utf8"));
const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const aIngles = (san) => san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]);

/* La línea de la solución en UCI, jugada desde la FEN: de ahí se vuelven a
   contar los cambios, sin creerle al banco. */
function ucis(it) {
  const g = new Chess(it.fen);
  return it.linea.replace(/\d+(\.|…)/g, " ").trim().split(/\s+/).map((san) => {
    const m = g.move(aIngles(san));
    return m ? m.from + m.to + (m.promotion || "") : null;
  });
}

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
  ok(g.turn() === it.juegan, `${id}: dice que juegan las ${it.juegan} y la FEN dice otra cosa`);
  const mov = g.move(it.solucion);
  ok(mov && aIngles(it.primera).replace(/[+#]/, "") === mov.san.replace(/[+#]/, ""), `${id}: la solución guardada no es ${it.primera}`);
  const linea = new Chess(it.fen);
  const jugadas = it.linea.replace(/\d+(\.|…)/g, " ").trim().split(/\s+/);
  ok(jugadas[0] === it.primera, `${id}: la línea no empieza por la solución`);
  jugadas.forEach((san) => ok(linea.move(aIngles(san)), `${id}: la jugada ${san} de la línea no es legal`));
  ok(it.marca && it.marca.length === 2, `${id}: falta la última jugada del rival`);
  const c = cambios(it.fen, ucis(it));
  ok(JSON.stringify(c.lista) === JSON.stringify(it.cambios), `${id}: los cambios guardados no son los de la línea`);
  ok(exige(it.exige || null, c), `${id}: la línea no cumple «${it.exige}»`);
  if (/tranquila/.test(it.explica)) ok(!/[x+#]/.test(it.primera), `${id}: el comentario dice «jugada tranquila» y ${it.primera} captura o da jaque`);
  if (/se cambian/.test(it.explica)) ok(c.lista.length > 0, `${id}: el comentario dice que se cambian piezas y no hay cambio`);
});

/* ---------- lo que pide cada uso ---------- */
Object.keys(CAPITULOS).map(Number).forEach((cap) => {
  const de = ITEMS.filter((i) => i.uso === "ejercicio" && i.capitulo === cap);
  ok(de.length === LIBRO.POR_CAPITULO, `capítulo ${cap}: ${de.length} ejercicios y deberían ser ${LIBRO.POR_CAPITULO}`);
  de.forEach((i) => {
    ok(CAPITULOS[cap].temas.includes(i.tema), `capítulo ${cap}: el ejercicio ${i.id} es de ${i.tema}, que no es de su capítulo`);
    ok((i.exige || null) === CAPITULOS[cap].exige, `capítulo ${cap}: el ejercicio ${i.id} no lleva la regla del capítulo`);
  });
});
const mixtos = ITEMS.filter((i) => i.uso === "mixto");
ok(mixtos.length === LIBRO.MIXTOS, `deberían ser ${LIBRO.MIXTOS} mixtos`);
mixtos.forEach((i) => ok(exige("decision", cambios(i.fen, ucis(i))), `mixto ${i.id}: no tiene una decisión de cambio`));

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
  ok([].concat(l.tema).includes(ej.tema), `lección ${n}: el ejemplo es de ${ej.tema} y la lección pide ${l.tema}`);
  ok((ej.exige || "") === (l.exige || ""), `lección ${n}: el ejemplo no lleva la regla de la lección`);
  ok(exige(l.exige || null, cambios(ej.fen, ucis(ej))), `lección ${n}: lo que dice del cambio («${l.exige}») no pasa en ${ej.linea}`);
  if (l.gana) ok(ej.gana, `lección ${n}: dice que la jugada conserva la ventaja y el motor no dijo que gane`);
  ok(l.diagramas && l.diagramas[0].fen === ej.fen, `lección ${n}: el ejemplo del curso no es el del libro`);
  const datos = DATOS.finales.find((f) => f.leccion === n);
  ok(datos && datos.diagramas[0].fen === ej.fen, `lección ${n}: cursos/protegido/data no está al día (curso-posiciones.js)`);
  if ([].concat(l.tema).includes("pawnEndgame")) ok(/^[kKpP1-8/]+$/.test(ej.fen.split(" ")[0]), `lección ${n}: dice «final de peones» y hay piezas`);
  if (l.tema === "bishopEndgame") ok(/^[kKpPbB1-8/]+$/.test(ej.fen.split(" ")[0]), `lección ${n}: dice «final de alfiles» y hay otras piezas`);
}));

/* ---------- las cinco preguntas: las del libro son las de la lección ---------- */
const ultima = CURSO.bloques[CURSO.bloques.length - 1].lecciones.slice(-1)[0];
const pdf = fs.readFileSync(path.join(__dirname, "cambio-o-no-cambio-pdf.js"), "utf8");
const preguntas = (pdf.match(/const PREGUNTAS = \[([\s\S]*?)\];/) || [])[1];
ok(preguntas, "el libro no trae la lista de las cinco preguntas");
const lista = preguntas ? preguntas.match(/"([^"]+)"/g).map((q) => q.slice(1, -1)) : [];
ok(lista.length === 5, `la tarjeta trae ${lista.length} preguntas y deberían ser cinco`);
const texto = ultima.parrafos.join(" ").toLowerCase();
lista.forEach((q) => ok(texto.includes(q.replace(/^¿/, "").replace(/\?$/, "").toLowerCase()),
  `la pregunta «${q}» de la tarjeta no es la que dice la lección «${ultima.titulo}»`));

/* ---------- la versión accesible ---------- */
const acc = fs.readFileSync(path.join(RAIZ, "material", "cambio-o-no-cambio", "cambio-o-no-cambio-accesible.html"), "utf8");
ok(!/<img\b/i.test(acc), "la versión accesible trae imágenes");
ok((acc.match(/<p class="posicion">/g) || []).length === ITEMS.length, "la versión accesible no cuenta todas las posiciones");
const visible = acc.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<span class="fen">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " ");
const escrita = visible.match(/\b(?:\d+\.{1,3}|…)?[RDTAC][a-h]?[1-8]?x?[a-h][1-8][+#]?(?=[\s,.;)])/g);
ok(!escrita, "la versión accesible trae jugadas escritas: " + (escrita || []).slice(0, 5).join(", "));
ok(/Oscar Angulo Cubero/.test(acc), "la versión accesible no dice quién es el autor");

console.log(`${ITEMS.length} posiciones · ${ITEMS.filter((i) => i.uso === "ejemplo").length} ejemplos · ${Object.keys(CAPITULOS).length} capítulos con ejercicios`);
if (fallos.length) {
  fallos.forEach((f) => console.log("  ✗ " + f));
  console.log(`\n${fallos.length} fallo(s)`);
  process.exit(1);
}
console.log("Todo bien.");
