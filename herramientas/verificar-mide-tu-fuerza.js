/* Verifica los bancos del libro «Mide tu fuerza» (material/mide-tu-fuerza/banco.js,
 * material/mide-tu-fuerza-2/banco.js…) y sus versiones accesibles.
 *
 * Lo que comprueba en cada volumen, porque nada de esto da error si se rompe
 * —el libro se imprime igual—:
 *   - 45 tests de 8: cada uno de UN tema y UN nivel, cada tema una vez en
 *     cada nivel, y los niveles en orden;
 *   - ninguna posición repetida, ni una que ya esté en el diagnóstico, en
 *     «Ponte a prueba» o en otro volumen (el mismo ejercicio en dos pruebas
 *     mediría memoria);
 *   - cada FEN es legal, el bando que juega es el que dice el diagrama y la
 *     última jugada marcada la hizo el rival;
 *   - la solución guardada es legal, es la primera jugada de la línea, y la
 *     línea entera se puede jugar;
 *   - la dificultad sale del rating con el descuento del generador, y el
 *     tiempo de cada test es el de su nivel;
 *   - la versión accesible cuenta las 360 posiciones y no trae imágenes.
 *
 *   node herramientas/verificar-mide-tu-fuerza.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { DESCUENTO_LICHESS, temasDe, NIVELES, POR_TEST, producto, banco, volumenes } = require("./mide-tu-fuerza-generar.js");

const RAIZ = path.join(__dirname, "..");
const fallos = [];
let prefijo = "";
const ok = (cond, msg) => { if (!cond) fallos.push(prefijo + msg); };

const win = {};
const cargar = (f) => new Function("window", fs.readFileSync(path.join(RAIZ, f), "utf8"))(win);
cargar("js/diagnostico-items.js");
cargar("material/ponte-a-prueba/banco.js");
const VOLUMENES = volumenes();
const BANCOS = VOLUMENES.map((v) => {
  const o = {};
  new Function("window", fs.readFileSync(banco(v), "utf8"))(o);
  return { v, LIBRO: o.MIDE_TU_FUERZA, ITEMS: o.MIDE_TU_FUERZA_ITEMS };
});
if (!VOLUMENES.length) fallos.push("no hay ningún banco de «Mide tu fuerza»");

/* Entre volúmenes: ninguna posición en dos. */
const vistas = new Map();
BANCOS.forEach(({ v, ITEMS }) => ITEMS.forEach((i) => {
  if (vistas.has(i.lichess)) fallos.push(`la posición ${i.lichess} está en el volumen ${vistas.get(i.lichess)} y en el ${v}`);
  vistas.set(i.lichess, v);
}));

BANCOS.forEach(({ v, LIBRO, ITEMS }) => {
  prefijo = `volumen ${v}: `;
  ok(LIBRO.VOLUMEN === v && LIBRO.PRODUCTO === producto(v), `dice ser el volumen ${LIBRO.VOLUMEN} (${LIBRO.PRODUCTO})`);
  const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
  const aIngles = (san) => san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]);

  /* ---------- la forma ---------- */
  const TEMAS = temasDe(v);
  const TESTS = TEMAS.length * NIVELES.length;
  ok(JSON.stringify(LIBRO.TEMAS.map((t) => t.id)) === JSON.stringify(TEMAS.map((t) => t.id)),
    `los temas del banco no son los de su volumen: ${LIBRO.TEMAS.map((t) => t.id).join(", ")}`);
  ok(LIBRO.AUTOR === "Oscar Angulo Cubero", `el autor dice «${LIBRO.AUTOR}»`);
  ok(ITEMS.length === TESTS * POR_TEST, `esperaba ${TESTS * POR_TEST} posiciones y hay ${ITEMS.length}`);
  ok(ITEMS.every((it, i) => it.n === i + 1), "la numeración de las posiciones no va de 1 en adelante en orden");
  ok(new Set(ITEMS.map((i) => i.id)).size === ITEMS.length, "hay posiciones repetidas");
  const temasVistos = {};
  let nivelAnterior = 0;
  for (let t = 1; t <= TESTS; t++) {
    const delTest = ITEMS.filter((i) => i.test === t);
    ok(delTest.length === POR_TEST, `el test ${t} tiene ${delTest.length} posiciones`);
    if (!delTest.length) continue;
    ok(new Set(delTest.map((i) => i.tema)).size === 1, `el test ${t} mezcla temas`);
    ok(new Set(delTest.map((i) => i.nivel)).size === 1, `el test ${t} mezcla niveles`);
    ok(delTest[0].nivel >= nivelAnterior, `el test ${t} vuelve a un nivel anterior`);
    nivelAnterior = delTest[0].nivel;
    const k = delTest[0].tema + ":" + delTest[0].nivel;
    ok(!temasVistos[k], `el tema ${delTest[0].tema} sale dos veces en el nivel ${delTest[0].nivel}`);
    temasVistos[k] = true;
    ok(delTest.every((it, i) => i === 0 || delTest[i - 1].elo <= it.elo), `el test ${t} no va de la más fácil a la más difícil`);
  }
  ok(Object.keys(temasVistos).length === TESTS, "algún tema falta en algún nivel");
  ok(ITEMS.every((i) => TEMAS.some((t) => t.id === i.tema)), "hay un tema que no está en la lista de temas");

  const yaUsadas = new Set((win.DIAGNOSTICO_ITEMS || []).concat(win.LIBRO_EXAMEN_ITEMS || []).map((i) => i.lichess).filter(Boolean));
  const repetidas = ITEMS.filter((i) => yaUsadas.has(i.lichess));
  ok(!repetidas.length, `estas posiciones ya están en el diagnóstico o en «Ponte a prueba»: ${repetidas.map((i) => i.lichess).join(", ")}`);

  /* ---------- el ajedrez ---------- */
  ITEMS.forEach((it) => {
    const donde = `posición ${it.n} (${it.lichess})`;
    let g;
    try { g = new Chess(it.fen); } catch (e) { g = null; }
    const valida = g && (typeof g.validate_fen !== "function" || g.validate_fen(it.fen).valid);
    if (!valida) { fallos.push(`${donde}: FEN inválida`); return; }
    ok(g.turn() === it.juegan, `${donde}: dice que juegan ${it.juegan} y la FEN dice ${g.turn()}`);
    const llega = g.get(it.marca[1]);
    ok(llega && llega.color !== it.juegan, `${donde}: en ${it.marca[1]} no hay una pieza del rival que acabe de mover`);
    ok(!g.get(it.marca[0]), `${donde}: la casilla de salida ${it.marca[0]} no quedó vacía`);
    const m = g.move(Object.assign({}, it.solucion));
    ok(m && m.san.replace(/^[KQRBN]/, (c) => ({ K: "R", Q: "D", R: "T", B: "A", N: "C" })[c]).replace(/=([QRBN])/, (_, c) => "=" + ({ Q: "D", R: "T", B: "A", N: "C" })[c]) === it.primera,
      `${donde}: la solución guardada no es ${it.primera}`);
    const linea = new Chess(it.fen);
    const jugadas = it.linea.replace(/\d+(\.|…)/g, " ").trim().split(/\s+/);
    ok(jugadas[0] === it.primera, `${donde}: la línea no empieza por la solución`);
    ok(jugadas.every((san) => linea.move(aIngles(san))), `${donde}: la línea no se puede jugar entera`);
    ok(it.elo === it.rating - DESCUENTO_LICHESS, `${donde}: elo ${it.elo} no es rating − ${DESCUENTO_LICHESS}`);
    ok(it.explica && it.comprobado && /Stockfish/.test(it.comprobado), `${donde}: falta la explicación o cómo se comprobó`);
  });
  ok(LIBRO.NIVELES.every((n, i) => n.minutos === NIVELES[i].minutos), "los tiempos del banco no son los del generador");

  /* ---------- la versión accesible ---------- */
  const acc = path.join(RAIZ, "material", producto(v), `${producto(v)}-accesible.html`);
  if (fs.existsSync(acc)) {
    const html = fs.readFileSync(acc, "utf8");
    const cuantas = (html.match(/<h3>Posición \d+<\/h3>/g) || []).length;
    ok(cuantas === ITEMS.length, `la versión accesible cuenta ${cuantas} posiciones de ${ITEMS.length}`);
    ok(!/<img\b/i.test(html), "la versión accesible trae imágenes");
    ok(/<html lang="es">/.test(html), "la versión accesible no declara el idioma");
    ok(html.includes(LIBRO.AUTOR), "la versión accesible no dice quién es el autor");
  } else {
    ok(false, `falta ${path.relative(RAIZ, acc)}`);
  }
});

if (fallos.length) {
  console.log(`✗ ${fallos.length} problema(s):\n  ` + fallos.slice(0, 40).join("\n  "));
  process.exit(1);
}
console.log(`✓ «Mide tu fuerza», ${VOLUMENES.length} volumen(es): ${BANCOS.map((b) => b.ITEMS.length).join(" + ")} posiciones en tests de ${POR_TEST}, legales, sin repetir entre volúmenes, con sus soluciones y su versión accesible.`);
