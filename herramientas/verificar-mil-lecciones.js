/* Comprueba el curso «Las mil y una lecciones de ajedrez» y su libro en doce
 * tomos (sin navegador).
 *
 * Lo que se rompe acá no da ningún error en pantalla: una partida con una
 * jugada imposible se ve perfecta hasta que el visor se planta en ella; un
 * momento clave que apunta a la jugada equivocada pide adivinar otra cosa; una
 * lección cuyo trozo de datos no existe dice «Elemento no encontrado» solo
 * cuando alguien la abre, y son 360.
 *
 *   - el índice: 12 bloques, 360 lecciones numeradas de corrido, y cada
 *     partida y ejercicio de «trozos» apunta a un archivo que lo trae;
 *   - cada partida se vuelve a jugar entera con chess.js desde su posición de
 *     partida, y la FEN guardada en cada jugada es la que sale;
 *   - cada momento clave apunta a una jugada de la partida, su respuesta es
 *     esa jugada y sus alternativas son legales en esa posición;
 *   - cada ejercicio: la solución se juega entera y la primera jugada (o una
 *     alternativa) es legal;
 *   - la página protegida monta exactamente las partidas y ejercicios de los
 *     datos, y cada lección enlaza su tomo y su versión accesible;
 *   - los doce tomos existen, en PDF y accesibles; el accesible no trae
 *     ninguna imagen y tiene el ancla de cada una de sus lecciones.
 *
 *     node herramientas/verificar-mil-lecciones.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const SLUG = "las-mil-y-una-lecciones-de-ajedrez";
const DATOS = path.join(RAIZ, "cursos/protegido/data");
const RECURSOS = path.join(RAIZ, "cursos/recursos", SLUG);
let fallos = 0;
const mal = (t) => { fallos += 1; console.log("  ✗ " + t); };
const bien = (t) => console.log("  ✓ " + t);
const fen3 = (f) => f.split(" ").slice(0, 3).join(" ");

const indice = JSON.parse(fs.readFileSync(path.join(DATOS, SLUG + ".json"), "utf8"));
const bloques = indice.curso.bloques;
console.log("=== El índice ===");
if (bloques.length !== 12) mal(`son ${bloques.length} bloques y deberían ser 12`);
const lecciones = bloques.flatMap((b) => b.lecciones.map((l) => Object.assign({ bloque: b.n }, l)));
if (lecciones.length !== 360) mal(`son ${lecciones.length} lecciones y deberían ser 360`);
lecciones.forEach((l, i) => { if (l.n !== i + 1) mal(`la lección en el puesto ${i + 1} dice ser la ${l.n}`); });
const clases = new Set(lecciones.map((l) => l.clase));
if (clases.size !== 360) mal("hay clases del libro repetidas o que faltan");
bien(`${bloques.length} bloques, ${lecciones.length} lecciones`);

console.log("\n=== Las partidas, los momentos clave y los ejercicios ===");
let nPartidas = 0, nJugadas = 0, nClaves = 0, nEj = 0;
const enDatos = new Set();
lecciones.forEach((l) => {
  const archivo = path.join(DATOS, SLUG, l.archivo + ".json");
  if (!fs.existsSync(archivo)) { mal(`falta el archivo de la lección ${l.n} (${l.archivo})`); return; }
  const d = JSON.parse(fs.readFileSync(archivo, "utf8"));
  if (d.leccion.n !== l.n || d.leccion.clase !== l.clase) mal(`el archivo ${l.archivo} es de otra lección`);
  d.leccion.items.forEach((it) => {
    if (it.tipo === "partida" && !d.partidas[it.id]) mal(`${l.archivo}: la lección pide la partida ${it.id} y no está`);
    if (it.tipo === "ejercicio" && !d.ejercicios[it.id]) mal(`${l.archivo}: la lección pide el ejercicio ${it.id} y no está`);
  });
  Object.values(d.partidas).forEach((g) => {
    nPartidas += 1; enDatos.add(g.id);
    if (indice.trozos[g.id] !== l.archivo) mal(`${g.id}: «trozos» no apunta a ${l.archivo}`);
    const c = new Chess(g.start_fen);
    const antes = [c.fen()];
    for (let i = 0; i < g.moves.length; i += 1) {
      const m = g.moves[i];
      if (!c.move(m.san, { sloppy: true })) { mal(`${g.id}: la jugada ${i + 1} (${m.san}) no es legal`); return; }
      if (fen3(c.fen()) !== fen3(m.fen)) { mal(`${g.id}: la posición después de ${m.san} no coincide con la guardada`); return; }
      antes.push(c.fen());
      nJugadas += 1;
    }
    (g.claves || []).forEach((k) => {
      nClaves += 1;
      const m = g.moves[k.ply - 1];
      if (!m) { mal(`${g.id}: un momento clave apunta a la jugada ${k.ply}, que no existe`); return; }
      const p = new Chess(antes[k.ply - 1]);
      (k.alternativas || []).forEach((u) => {
        if (!p.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })) mal(`${g.id}: la alternativa ${u} del momento ${k.ply} no es legal`);
        else p.undo();
      });
      if (!k.pregunta || !k.pista) mal(`${g.id}: el momento ${k.ply} no tiene pregunta o pista`);
    });
  });
  Object.values(d.ejercicios).forEach((x) => {
    nEj += 1; enDatos.add(x.id);
    if (indice.trozos[x.id] !== l.archivo) mal(`${x.id}: «trozos» no apunta a ${l.archivo}`);
    const c = new Chess(x.fen);
    x.solucion.forEach((m) => { if (!c.move(m.san, { sloppy: true })) mal(`${x.id}: ${m.san} de la solución no es legal`); });
    (x.alternativas || []).forEach((u) => {
      const p = new Chess(x.fen);
      if (!p.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })) mal(`${x.id}: la alternativa ${u} no es legal`);
    });
  });
});
Object.keys(indice.trozos).forEach((id) => { if (!enDatos.has(id)) mal(`«trozos» nombra ${id} y no está en ningún archivo`); });
const m = indice.meta;
if (m.partidas !== nPartidas || m.ejercicios !== nEj || m.claves !== nClaves || m.semijugadas !== nJugadas)
  mal(`las cifras del índice (${m.partidas} partidas, ${m.semijugadas} jugadas, ${m.claves} momentos, ${m.ejercicios} ejercicios) no son las de los datos`);
if (nPartidas < 1500) mal(`solo ${nPartidas} partidas: ¿se perdieron al regenerar?`);
bien(`${nPartidas} partidas (${nJugadas} jugadas) que se juegan enteras, ${nClaves} momentos clave y ${nEj} ejercicios`);

console.log("\n=== La página protegida ===");
const html = fs.readFileSync(path.join(RAIZ, "cursos/protegido", SLUG + ".html"), "utf8");
const enPagina = new Set([...html.matchAll(/class="cp-(?:partida|ejercicio)" data-id="([^"]+)"/g)].map((x) => x[1]));
const sobran = [...enPagina].filter((id) => !enDatos.has(id));
const faltan = [...enDatos].filter((id) => !enPagina.has(id));
if (sobran.length) mal(`la página monta ${sobran.length} elementos que no están en los datos: ${sobran.slice(0, 4).join(", ")}`);
if (faltan.length) mal(`la página no monta ${faltan.length} elementos de los datos: ${faltan.slice(0, 4).join(", ")}`);
const detalles = (html.match(/<details /g) || []).length;
if (detalles !== 360) mal(`la página tiene ${detalles} lecciones`);
lecciones.forEach((l) => {
  const t = String(l.bloque).padStart(2, "0");
  if (!html.includes(`href="../recursos/${SLUG}/tomo-${t}-accesible.html#leccion-${l.n}"`)) mal(`la lección ${l.n} no enlaza su tomo accesible`);
});
if (!fallos) bien(`360 lecciones, ${enPagina.size} partidas y ejercicios montados, cada una con su tomo`);

console.log("\n=== Los doce tomos ===");
bloques.forEach((b) => {
  const t = String(b.n).padStart(2, "0");
  const pdf = path.join(RECURSOS, `tomo-${t}.pdf`);
  const acc = path.join(RECURSOS, `tomo-${t}-accesible.html`);
  if (!fs.existsSync(pdf)) mal(`falta el tomo ${b.n} en PDF`);
  else if (fs.statSync(pdf).size > 24 * 1024 * 1024) mal(`el tomo ${b.n} pasa de 24 MB (Cloudflare no sirve archivos de más de 25)`);
  if (!fs.existsSync(acc)) { mal(`falta el tomo ${b.n} accesible`); return; }
  const a = fs.readFileSync(acc, "utf8");
  if (/<img\b|<svg\b/i.test(a)) mal(`el tomo ${b.n} accesible trae imágenes`);
  b.lecciones.forEach((l) => { if (!a.includes(`id="leccion-${l.n}"`)) mal(`el tomo ${b.n} accesible no tiene la lección ${l.n}`); });
});
if (!fallos) bien("12 tomos en PDF y accesibles, cada uno con todas sus lecciones");

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
