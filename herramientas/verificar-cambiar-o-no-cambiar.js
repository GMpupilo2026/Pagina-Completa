/* Verifica el curso y el libro «Cambiar o no cambiar»: los datos escritos a
 * mano (herramientas/datos/cambiar-o-no-cambiar-*.json), el banco que arma
 * el generador (material/cambiar-o-no-cambiar/banco.js), los ejemplos y los
 * ejercicios del curso y la versión accesible del libro.
 *
 * Lo que comprueba, porque nada de esto da error si se rompe —el curso se ve
 * y el libro se imprime igual—:
 *   - cada partida modelo se juega entera, jugada por jugada, desde su
 *     comienzo (o desde la FEN de su diagrama);
 *   - cada ejercicio es una posición legal y su línea, que es la de la
 *     partida, se juega entera: es lo que confirma que el diagrama del libro
 *     se leyó bien. Son 22, del 1 al 22, sin repetir;
 *   - cada lección de los cuatro primeros bloques tiene su partida modelo, y
 *     el ejemplo del curso (herramientas/cursos/…json y
 *     cursos/protegido/data/…json) es la MISMA posición que la del libro, y
 *     sale de verdad de esa partida en ese momento: si se regenera uno y no el
 *     otro, el curso y el libro enseñarían posiciones distintas con el mismo
 *     texto;
 *   - el bloque de ejercicios trae los 22, cada uno una vez;
 *   - toda posición del curso es de estrategia y no promete un resultado
 *     («*»), y cada comentario dice lo que opina el motor;
 *   - la versión accesible cuenta todas las posiciones, no trae imágenes ni
 *     jugadas escritas en notación, y cita el libro de donde salen.
 *
 *   node herramientas/verificar-cambiar-o-no-cambiar.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const win = {};
new Function("window", fs.readFileSync(path.join(RAIZ, "material/cambiar-o-no-cambiar/banco.js"), "utf8"))(win);
const PARTIDAS = win.CAMBIAR_O_NO_CAMBIAR_PARTIDAS;
const EJEMPLOS = win.CAMBIAR_O_NO_CAMBIAR_EJEMPLOS;
const EJERCICIOS = win.CAMBIAR_O_NO_CAMBIAR_EJERCICIOS;
const DATOS_P = JSON.parse(fs.readFileSync(path.join(__dirname, "datos", "cambiar-o-no-cambiar-partidas.json"), "utf8")).partidas;
const DATOS_E = JSON.parse(fs.readFileSync(path.join(__dirname, "datos", "cambiar-o-no-cambiar-ejercicios.json"), "utf8")).ejercicios;
const CURSO = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos", "cambiar-o-no-cambiar.json"), "utf8"));
const DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos", "protegido", "data", "cambiar-o-no-cambiar.json"), "utf8"));
const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const aIngles = (san) => san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]);
const jugadasDe = (linea) => linea.replace(/\d+(\.|…)/g, " ").trim().split(/\s+/).filter(Boolean);

/* ---------- las partidas: los datos a mano y el banco dicen lo mismo ---------- */
const fenEn = {};
ok(PARTIDAS.length === DATOS_P.length, `el banco trae ${PARTIDAS.length} partidas y los datos ${DATOS_P.length}: vuelve a correr el generador`);
DATOS_P.forEach((p) => {
  const g = new Chess();
  ok(!p.fen_inicial || g.load(p.fen_inicial), `partida ${p.id}: la FEN del diagrama no carga`);
  const fens = [g.fen()];
  for (const [i, san] of p.jugadas.entries()) {
    if (!g.move(san, { sloppy: true })) { fallos.push(`partida ${p.id}: la jugada ${i + 1} (${san}) no es legal`); break; }
    fens.push(g.fen());
  }
  fenEn[p.id] = fens;
  const b = PARTIDAS.find((x) => x.id === p.id);
  ok(b, `partida ${p.id}: no está en el banco`);
  if (b) {
    ok(jugadasDe(b.jugadas).length === p.jugadas.length, `partida ${p.id}: el banco no trae todas sus jugadas`);
    const h = new Chess(b.fen);
    jugadasDe(b.jugadas).forEach((san) => ok(h.move(aIngles(san)), `partida ${p.id}: la jugada ${san} del banco no es legal`));
  }
});

/* ---------- los ejercicios ---------- */
ok(EJERCICIOS.length === 22 && DATOS_E.length === 22, "deberían ser 22 ejercicios");
ok(EJERCICIOS.map((e) => e.n).join() === Array.from({ length: 22 }, (_, i) => i + 1).join(), "los ejercicios no van del 1 al 22");
ok(new Set(EJERCICIOS.map((e) => e.fen.split(" ").slice(0, 2).join(" "))).size === EJERCICIOS.length, "hay dos ejercicios con la misma posición");
EJERCICIOS.forEach((e) => {
  const id = `ejercicio ${e.n}`;
  const g = new Chess();
  ok(g.load(e.fen), `${id}: la FEN no carga`);
  ok(g.turn() === e.juegan, `${id}: dice que juegan las ${e.juegan} y la FEN dice otra cosa`);
  const partes = e.fen.split(" "); partes[1] = partes[1] === "w" ? "b" : "w";
  const otro = new Chess();
  ok(!(otro.load(partes.join(" ")) && otro.in_check()), `${id}: el bando que no mueve está en jaque`);
  const j = jugadasDe(e.linea);
  ok(j[0] === e.primera, `${id}: la línea no empieza por ${e.primera}`);
  ok(j.length >= 3, `${id}: la línea es demasiado corta para confirmar el diagrama`);
  const h = new Chess(e.fen);
  j.forEach((san) => ok(h.move(aIngles(san)), `${id}: la jugada ${san} de la línea no es legal`));
  if (e.siguio) { const s = new Chess(e.fen); jugadasDe(e.siguio).forEach((san) => ok(s.move(aIngles(san)), `${id}: la jugada ${san} de la partida no es legal`)); }
  ok(/Stockfish \d+ a profundidad \d+/.test(e.comprobado), `${id}: no dice qué opina el motor`);
  ok(e.pregunta && e.pista && e.explica, `${id}: le falta la pregunta, la pista o la explicación`);
  const d = DATOS_E.find((x) => x.n === e.n);
  ok(d && d.fen === e.fen, `${id}: el banco no es el de los datos (vuelve a correr el generador)`);
});

/* ---------- el curso: cada ejemplo sale de su partida y es el del libro ---------- */
let n = 0;
const enCurso = [];
CURSO.bloques.forEach((b) => b.lecciones.forEach((l) => {
  n += 1;
  const datos = DATOS.finales.find((f) => f.leccion === n);
  if (l.ejercicios) {
    enCurso.push(...l.ejercicios);
    ok(l.diagramas && l.diagramas.length === l.ejercicios.length, `lección ${n}: no trae un diagrama por ejercicio`);
    l.ejercicios.forEach((k, i) => {
      const e = EJERCICIOS.find((x) => x.n === k);
      ok(e && l.diagramas[i].fen === e.fen, `lección ${n}: el ejercicio ${k} del curso no es el del libro`);
      ok(datos && datos.diagramas[i] && datos.diagramas[i].fen === (e && e.fen), `lección ${n}: cursos/protegido/data no está al día (curso-posiciones.js)`);
    });
    return;
  }
  ok(l.ejemplos && l.ejemplos.length, `lección ${n}: no tiene partida modelo`);
  const delLibro = EJEMPLOS.filter((e) => e.leccion === n);
  ok(delLibro.length === (l.ejemplos || []).length, `lección ${n}: el libro y el curso no traen los mismos ejemplos`);
  (l.ejemplos || []).forEach((ej, i) => {
    const fen = (fenEn[ej.partida] || [])[ej.ply];
    ok(fen, `lección ${n}: la partida ${ej.partida} no llega al momento ${ej.ply}`);
    ok(delLibro[i] && delLibro[i].fen === fen, `lección ${n}: el ejemplo del libro no es esa partida en ese momento`);
    ok(l.diagramas && l.diagramas[i] && l.diagramas[i].fen === fen, `lección ${n}: el ejemplo del curso no es el del libro`);
    ok(datos && datos.diagramas[i] && datos.diagramas[i].fen === fen, `lección ${n}: cursos/protegido/data no está al día (curso-posiciones.js)`);
    ok(delLibro[i] && /Stockfish \d+ a profundidad \d+/.test(delLibro[i].comprobado), `lección ${n}: el ejemplo no dice qué opina el motor`);
  });
}));
ok(enCurso.slice().sort((a, b) => a - b).join() === EJERCICIOS.map((e) => e.n).join(), "el bloque de ejercicios del curso no trae los 22, cada uno una vez");
DATOS.finales.forEach((f) => f.diagramas.forEach((d) => {
  ok(d.resultado === "*", `${d.id}: promete un resultado («${d.resultado}») y es una posición de estrategia`);
  ok(/Stockfish/.test(d.comentario), `${d.id}: el comentario no dice qué opina el motor`);
}));

/* ---------- la versión accesible ---------- */
const acc = fs.readFileSync(path.join(RAIZ, "material", "cambiar-o-no-cambiar", "cambiar-o-no-cambiar-accesible.html"), "utf8");
ok(!/<img\b/i.test(acc), "la versión accesible trae imágenes");
const desdeDiagrama = PARTIDAS.filter((p) => p.desde === "diagrama").length;
ok((acc.match(/<p class="posicion">/g) || []).length === EJEMPLOS.length + EJERCICIOS.length + desdeDiagrama, "la versión accesible no cuenta todas las posiciones");
const visible = acc.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<span class="fen">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " ");
const escrita = visible.match(/\b(?:\d+\.{1,3}|…)?[RDTAC][a-h]?[1-8]?x?[a-h][1-8][+#]?(?=[\s,.;)])/g);
ok(!escrita, "la versión accesible trae jugadas escritas: " + (escrita || []).slice(0, 5).join(", "));
ok(/Oscar Angulo Cubero/.test(acc), "la versión accesible no dice quién es el autor");
ok(/Valerga/.test(acc), "la versión accesible no cita el libro de donde salen las partidas");

console.log(`${PARTIDAS.length} partidas · ${EJEMPLOS.length} ejemplos · ${EJERCICIOS.length} ejercicios · ${n} lecciones`);
if (fallos.length) {
  fallos.forEach((f) => console.log("  ✗ " + f));
  console.log(`\n${fallos.length} fallo(s)`);
  process.exit(1);
}
console.log("Todo bien.");
