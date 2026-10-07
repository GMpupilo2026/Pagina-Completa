/* Verifica el curso y el libro «Ganar con poco»: el banco
 * (material/ganar-con-poco/banco.js), los ejemplos de las lecciones del curso
 * y la versión accesible del libro.
 *
 * Lo que comprueba, porque nada de esto da error si se rompe —el curso se ve
 * y el libro se imprime igual—:
 *   - ninguna posición repetida, ni una que ya esté en el diagnóstico, en
 *     «Ponte a prueba», en «Mide tu fuerza» o en «Rompe el estancamiento»
 *     (el mismo ejercicio en dos libros mediría memoria);
 *   - cada FEN es legal y la última jugada marcada la hizo el rival;
 *   - la solución guardada es legal, es la primera jugada de la línea, y la
 *     línea entera se puede jugar;
 *   - cada lección con tema tiene su ejemplo, y el ejemplo del curso
 *     (herramientas/cursos/…json y cursos/protegido/data/…json) es la MISMA
 *     posición que la del libro: si se regenera uno y no el otro, el curso y
 *     el libro enseñarían posiciones distintas con el mismo texto;
 *   - lo que el texto de la lección dice de su ejemplo es cierto en la
 *     posición (la jugada «tranquila» no da jaque ni captura, el «final de
 *     torres» no tiene más que torres, reyes y peones —y torre de los dos
 *     lados—, el zugzwang empieza sin capturar, la de coronación corona);
 *   - 8 ejercicios por capítulo y 24 mixtos;
 *   - la versión accesible cuenta todas las posiciones, no trae imágenes ni
 *     jugadas escritas en notación.
 *
 *   node herramientas/verificar-ganar-con-poco.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { DESCUENTO_LICHESS, TEMAS_CAPITULO, cumple } = require("./ganar-con-poco-generar.js");

const RAIZ = path.join(__dirname, "..");
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const win = {};
const cargar = (f) => new Function("window", fs.readFileSync(path.join(RAIZ, f), "utf8"))(win);
cargar("js/diagnostico-items.js");
cargar("material/ponte-a-prueba/banco.js");
cargar("material/mide-tu-fuerza/banco.js");
cargar("material/rompe-el-estancamiento/banco.js");
cargar("material/ganar-con-poco/banco.js");

const LIBRO = win.GANAR_CON_POCO;
const ITEMS = win.GANAR_CON_POCO_ITEMS;
const CURSO = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos", "ganar-con-poco.json"), "utf8"));
const DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos", "protegido", "data", "ganar-con-poco.json"), "utf8"));
const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const aIngles = (san) => san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]);

/* ---------- el banco ---------- */
const otras = new Set([].concat(win.DIAGNOSTICO_ITEMS || [], win.LIBRO_EXAMEN_ITEMS || [], win.MIDE_TU_FUERZA_ITEMS || [],
  win.ROMPE_EL_ESTANCAMIENTO_ITEMS || [])
  .map((i) => i.lichess).filter(Boolean));
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
  de.forEach((i) => ok(TEMAS_CAPITULO[c].includes(i.tema), `capítulo ${c}: el ejercicio ${i.id} es de ${i.tema}, que no es de su capítulo`));
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
  // Lo mismo que exige el generador, comprobado aparte: la regla vive en cumple().
  ok(cumple(l.tema, { fen: ej.fen, solSan: m.san, linea: [] }) || l.tema === "promotion",
    `lección ${n}: lo que la lección dice de su ejemplo (${l.tema}) no es cierto en la posición`);
  if (l.tema === "quietMove") ok(!m.captured && !/[+#]/.test(m.san), `lección ${n}: dice «jugada tranquila» y ${ej.primera} no lo es`);
  if (l.tema === "zugzwang") ok(!m.captured, `lección ${n}: dice «pasar el turno» y ${ej.primera} captura`);
  if (l.tema === "promotion") ok(/=/.test(ej.linea), `lección ${n}: dice que todo pasa por la coronación y la línea no corona`);
}));

/* ---------- las partidas del libro (capítulo 7) ----------
   Las jugadas, del PGN; lo que lee el visor del curso y lo que imprime el
   libro tienen que ser esas mismas jugadas. El motor no corre en el CI: que
   cada momento clave sea la mejor jugada lo exige el generador
   (ganar-con-poco-partidas.js) y acá se comprueba que el momento exista, sea
   del bando que ganó y traiga su explicación con el motor. */
const P = require("./ganar-con-poco-partidas.js");
const PARTIDAS = P.leerPartidas();
cargar("material/ganar-con-poco/partidas.js");
const LIBRO_PARTIDAS = win.GANAR_CON_POCO_PARTIDAS;
const bloque7 = CURSO.bloques.find((b) => b.n === 7);
ok(PARTIDAS.length === 18, `el PGN trae ${PARTIDAS.length} partidas y son 18`);
ok(bloque7 && bloque7.lecciones.length === PARTIDAS.length, "el capítulo 7 no tiene una lección por partida");
PARTIDAS.forEach((p) => {
  const id = `gp-p${p.n}`;
  ok(/^(1-0|0-1)$/.test(p.h.Result), `partida ${p.n}: sin resultado`);
  const enCurso = DATOS.partidas && DATOS.partidas[id];
  const enLibro = LIBRO_PARTIDAS.find((x) => x.id === id);
  ok(enCurso, `partida ${p.n}: no está en cursos/protegido/data (ganar-con-poco-partidas.js después de curso-posiciones.js)`);
  ok(enLibro, `partida ${p.n}: no está en el banco del libro`);
  ok(bloque7 && bloque7.lecciones.some((l) => l.partida === id), `partida ${p.n}: ninguna lección la muestra`);
  if (!enCurso || !enLibro) return;
  ok(enCurso.moves.map((m) => m.san).join(" ") === p.moves.map((m) => m.san).join(" "), `partida ${p.n}: el curso no trae las jugadas del PGN`);
  ok(enLibro.jugadas.join(" ") === p.moves.map((m) => m.san).join(" "), `partida ${p.n}: el libro no trae las jugadas del PGN`);
  const g = new Chess();
  enCurso.moves.forEach((m, k) => ok(g.move(m.san) && g.fen() === m.fen, `partida ${p.n}: la FEN de la jugada ${k + 1} no es la de la partida`));
  const gana = p.h.Result === "1-0" ? "w" : "b";
  enCurso.claves.forEach((c) => {
    const m = p.moves[c.ply - 1];
    ok(m && m.color === gana, `partida ${p.n}: el momento clave ${c.ply} no es una jugada del bando que ganó`);
    ok(/Stockfish 16 a profundidad/.test(c.explicacion), `partida ${p.n}: el momento clave ${c.ply} no dice qué comprobó el motor`);
  });
  ok(enLibro.claves.length === enCurso.claves.length, `partida ${p.n}: el libro y el curso no traen los mismos momentos clave`);
});

/* ---------- la versión accesible ---------- */
const acc = fs.readFileSync(path.join(RAIZ, "material", "ganar-con-poco", "ganar-con-poco-accesible.html"), "utf8");
ok(!/<img\b/i.test(acc), "la versión accesible trae imágenes");
const CLAVES = LIBRO_PARTIDAS.reduce((t, p) => t + p.claves.length, 0);
ok((acc.match(/<p class="posicion">/g) || []).length === ITEMS.length + CLAVES, "la versión accesible no cuenta todas las posiciones");
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
