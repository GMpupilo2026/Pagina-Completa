/* Verifica el curso y el libro «Los cimientos del ajedrez»: el banco
 * (material/los-cimientos-del-ajedrez/banco.js), las partidas de donde salen
 * los ejemplos, los ejemplos de las lecciones del curso y la versión accesible
 * del libro.
 *
 * Lo que comprueba, porque nada de esto da error si se rompe —el curso se ve
 * y el libro se imprime igual—:
 *   - ninguna posición repetida, ni una que ya esté en el diagnóstico, en
 *     «Ponte a prueba», «Mide tu fuerza» o «Rompe el estancamiento» (el mismo
 *     ejercicio en dos libros mediría memoria);
 *   - cada FEN es legal y la última jugada marcada la hizo el rival;
 *   - la solución guardada es legal, es la primera jugada de la línea, y la
 *     línea entera se puede jugar;
 *   - cada posición de una partida dice de qué partida es, y es de verdad la
 *     posición de esa partida: la de herramientas/datos/los-cimientos-partidas.json
 *     (o …-base.json) después de la jugada del rival que marca;
 *   - las 72 lecciones tienen al menos un ejemplo y sus ejercicios, y los
 *     ejemplos del curso (herramientas/cursos/…json y
 *     cursos/protegido/data/…json) son las MISMAS posiciones que las del
 *     libro: si se regenera uno y no el otro, el curso y el libro enseñarían
 *     posiciones distintas con el mismo texto;
 *   - lo que la lección promete de su posición es cierto (la lección de
 *     ahogado termina en ahogado, la de dama contra peón tiene esas piezas, la
 *     de finales de peones no tiene otras…);
 *   - la versión accesible cuenta todas las posiciones, no trae imágenes ni
 *     jugadas escritas en notación.
 *
 *   node herramientas/verificar-los-cimientos.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");
const { DE_LA_BASE, SALVAR } = require("./los-cimientos-generar.js");

const RAIZ = path.join(__dirname, "..");
const SLUG = "los-cimientos-del-ajedrez";
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

/* Cada banco en su propia ventana: los diez volúmenes de «Mide tu fuerza» usan
   el mismo nombre global y uno pisaría al otro. */
const otrosItems = [];
const cargar = (f, nombre) => {
  const w = {};
  new Function("window", fs.readFileSync(path.join(RAIZ, f), "utf8"))(w);
  return nombre ? (w[nombre] || []).forEach((i) => otrosItems.push(i)) : w;
};
cargar("js/diagnostico-items.js", "DIAGNOSTICO_ITEMS");
cargar("material/ponte-a-prueba/banco.js", "LIBRO_EXAMEN_ITEMS");
fs.readdirSync(path.join(RAIZ, "material")).filter((d) => /^mide-tu-fuerza(-\d+)?$/.test(d))
  .forEach((d) => cargar(`material/${d}/banco.js`, "MIDE_TU_FUERZA_ITEMS"));
cargar("material/rompe-el-estancamiento/banco.js", "ROMPE_EL_ESTANCAMIENTO_ITEMS");
const win = cargar(`material/${SLUG}/banco.js`);

const LIBRO = win.LOS_CIMIENTOS;
const ITEMS = win.LOS_CIMIENTOS_ITEMS;
const CURSO = JSON.parse(fs.readFileSync(path.join(__dirname, "cursos", SLUG + ".json"), "utf8"));
const DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos", "protegido", "data", SLUG + ".json"), "utf8"));
const PARTIDAS = JSON.parse(fs.readFileSync(path.join(__dirname, "datos", "los-cimientos-partidas.json"), "utf8"));
const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, "datos", "los-cimientos-base.json"), "utf8"));
const INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const aIngles = (san) => san.replace(/^[RDTAC]/, (c) => INGLES[c]).replace(/=([DTAC])/, (_, c) => "=" + INGLES[c]);
const clave = (fen) => fen.split(" ").slice(0, 4).join(" ");

/* ---------- el banco ---------- */
const otrasLichess = new Set(otrosItems.map((i) => i.lichess).filter(Boolean));
const otrasFen = new Set(otrosItems.map((i) => clave(i.fen || "")));
/* Las posiciones de las partidas, tal como quedan después de la jugada del rival. */
const deLasPartidas = new Map();
PARTIDAS.concat(BASE).forEach((p) => {
  const g = new Chess(p.fenPrev);
  const m = g.move({ from: p.prevUci.slice(0, 2), to: p.prevUci.slice(2, 4), promotion: p.prevUci[4] });
  ok(m && g.fen() === p.fen, `la partida ${p.id || (p.partida && p.partida.blancas)}: su posición no sale de la jugada que marca`);
  deLasPartidas.set(clave(p.fen), p);
});
const vistas = new Set();
ITEMS.forEach((it) => {
  const id = `posición ${it.n} (${it.id})`;
  ok(!vistas.has(clave(it.fen)), `${id}: repetida`);
  vistas.add(clave(it.fen));
  ok(!(it.lichess && otrasLichess.has(it.lichess)) && !otrasFen.has(clave(it.fen)), `${id}: ya está en otro libro del sitio`);
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
  if (it.origen === "lichess") {
    ok(it.lichess && /Lichess/.test(it.comprobado), `${id}: no dice de qué ejercicio de Lichess sale`);
  } else {
    ok(it.partida, `${id}: es de una partida y no dice de cuál`);
    ok(deLasPartidas.has(clave(it.fen)), `${id}: la posición no es la de ninguna partida de los datos`);
  }
  ok(/Stockfish 16/.test(it.comprobado), `${id}: no dice cómo se comprobó`);
});

/* ---------- cada lección: ejemplos, ejercicios y lo que promete ---------- */
const soloPeones = (fen) => /^[kKpP1-8/]+$/.test(fen.split(" ")[0]);
const material = (fen) => fen.split(" ")[0].replace(/[1-8/]/g, "");
let n = 0;
CURSO.bloques.forEach((b) => b.lecciones.forEach((l) => {
  n += 1;
  const ejemplos = ITEMS.filter((i) => i.uso === "ejemplo" && i.leccion === n);
  const ejercicios = ITEMS.filter((i) => i.uso === "ejercicio" && i.leccion === n);
  ok(ejemplos.length >= 1, `lección ${n}: no tiene ejemplo`);
  ok(ejercicios.length === LIBRO.POR_LECCION, `lección ${n}: ${ejercicios.length} ejercicios y deberían ser ${LIBRO.POR_LECCION}`);
  ok(l.diagramas && l.diagramas.length === ejemplos.length && l.diagramas.every((d, i) => d.fen === ejemplos[i].fen), `lección ${n}: los ejemplos del curso no son los del libro`);
  const datos = DATOS.finales.find((f) => f.leccion === n);
  ok(datos && datos.diagramas.length === ejemplos.length && datos.diagramas.every((d, i) => d.fen === ejemplos[i].fen), `lección ${n}: cursos/protegido/data no está al día (curso-posiciones.js)`);
  ejercicios.concat(ejemplos).forEach((it) => {
    const id = `lección ${n}, ${it.id}`;
    if (SALVAR.has(l.clave) && it.origen !== "lichess") ok(!it.gana, `${id}: la lección es de tablas y la posición gana`);
    if (!SALVAR.has(l.clave) && it.uso === "ejercicio") ok(it.gana || l.clave === "fortaleza" || (DE_LA_BASE[l.clave] && it.origen === "base"), `${id}: el ejercicio no gana`);
    if (l.clave === "ahogado" || l.clave === "ahogado2") {
      const g = new Chess(it.fen);
      it.linea.replace(/\d+(\.|…)/g, " ").trim().split(/\s+/).forEach((s) => g.move(aIngles(s)));
      ok(g.in_stalemate(), `${id}: la lección es de ahogado y la línea no termina en ahogado`);
    }
    if (l.clave === "peones1" || l.clave === "oposicion") ok(soloPeones(it.fen), `${id}: dice «final de peones» y hay piezas`);
    if (l.clave === "dama-peon") ok(/^(K?Q?k?p+|k?q?K?P+)$/i.test(material(it.fen)) && /q/i.test(material(it.fen)), `${id}: dice «dama contra peón» y el material es ${material(it.fen)}`);
    if (l.clave === "dama-torre") ok(/q/i.test(material(it.fen)) && /r/i.test(material(it.fen)), `${id}: dice «dama contra torre» y el material es ${material(it.fen)}`);
  });
}));
ok(n === 72, `el curso tiene ${n} lecciones y deberían ser 72`);
[1, 2, 3].forEach((nivel) => ok(ITEMS.filter((i) => i.uso === "repaso" && i.nivel === nivel).length === LIBRO.REPASO, `el repaso del nivel ${nivel} no tiene ${LIBRO.REPASO} posiciones`));
ok(ITEMS.some((i) => i.origen === "libro" && i.uso === "ejemplo"), "ningún ejemplo sale de las partidas del método");

/* ---------- la versión accesible ---------- */
const acc = fs.readFileSync(path.join(RAIZ, "material", SLUG, SLUG + "-accesible.html"), "utf8");
ok(!/<img\b/i.test(acc), "la versión accesible trae imágenes");
ok((acc.match(/<p class="posicion">/g) || []).length === ITEMS.length, "la versión accesible no cuenta todas las posiciones");
const visible = acc.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<span class="fen">[^<]*<\/span>/g, "").replace(/<[^>]+>/g, " ");
const escrita = visible.match(/\b(?:\d+\.{1,3}|…)?[RDTAC][a-h]?[1-8]?x?[a-h][1-8][+#]?(?=[\s,.;)])/g);
ok(!escrita, "la versión accesible trae jugadas escritas: " + (escrita || []).slice(0, 5).join(", "));
ok(/Oscar Angulo Cubero/.test(acc), "la versión accesible no dice quién es el autor");

console.log(`${ITEMS.length} posiciones · ${ITEMS.filter((i) => i.uso === "ejemplo").length} ejemplos (${ITEMS.filter((i) => i.uso === "ejemplo" && i.origen === "libro").length} de las partidas del método) · ${n} lecciones`);
if (fallos.length) {
  fallos.forEach((f) => console.log("  ✗ " + f));
  console.log(`\n${fallos.length} fallo(s)`);
  process.exit(1);
}
console.log("Todo bien.");
