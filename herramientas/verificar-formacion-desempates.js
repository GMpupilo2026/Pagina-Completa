#!/usr/bin/env node
/* Los ejemplos de desempate de la Sesión 3 de Formación Ajedrez: que cada
 * número de sus cuadros cruzados sea el que da el reglamento.
 *
 *   node herramientas/verificar-formacion-desempates.js
 *
 * Los cuadros viven en el tema del curso (herramientas/cursos/formacion-ajedrez.json,
 * `cuadro`) y de ahí salen la lámina, el cuadernillo y la página del curso. Acá
 * se vuelve a armar cada torneo DESDE el cuadro (las casillas de cada ronda o
 * la tabla del todos contra todos) y se recalcula todo con el motor de Pareo
 * Integral: los puntos, el Buchholz con y sin corte, el Sonneborn-Berger, el
 * encuentro directo y el puesto (js/pareo/desempates.js, comparado con
 * chesspairing y los casos del C.07:2026). El suizo, además, pasa por el
 * comprobador de bbpPairings (FPC): cada ronda tiene que ser la que da el
 * Sistema holandés. Ninguna cuenta queda hecha a ojo.
 *
 * Ver «Los desempates, con ejemplos resueltos» en docs/decisiones/clase-en-vivo.md.
 */
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const D = require(path.join(RAIZ, "js/pareo/desempates.js"));
const M = require(path.join(RAIZ, "js/pareo/motor.js")).enNode();

let fallas = 0;
function cierto(que, ok, detalle) {
  console.log((ok ? "  ✓ " : "  ✗ ") + que + (ok || detalle == null ? "" : "  → " + detalle));
  if (!ok) fallas++;
}

const curso = require(path.join(RAIZ, "herramientas/cursos/formacion-ajedrez.json"));
const leccion = curso.bloques.flatMap((b) => b.lecciones).find((l) => l.archivo === "03-apendices-normativa-y-emparejamiento");
const temas = leccion.temas.filter((t) => t.cuadro);
const suizo = temas.find((t) => t.titulo.startsWith("Ejemplo resuelto: un suizo"));
const todos = temas.find((t) => t.titulo.startsWith("Ejemplo resuelto: todos contra todos"));

// «2½» → 2.5, «¾» → 0.75
const numero = (s) => {
  const m = /^(\d*)([¼½¾]?)$/.exec(String(s));
  if (!m || (m[1] === "" && m[2] === "")) return NaN;
  return (m[1] === "" ? 0 : Number(m[1])) + ({ "": 0, "¼": 0.25, "½": 0.5, "¾": 0.75 })[m[2]];
};
const col = (c, nombre) => c.cab.indexOf(nombre);

(async () => {
  console.log("Formación Ajedrez · Sesión 3: los cuadros de los ejemplos de desempate");
  cierto("la Sesión 3 trae los dos ejemplos con su cuadro", !!(suizo && todos), temas.map((t) => t.titulo).join(", "));
  if (!suizo || !todos) process.exit(1);

  // ---------- el suizo
  console.log("\nSuizo: " + suizo.titulo);
  const c = suizo.cuadro;
  const iN = col(c, "N.º"), iJ = col(c, "Jugador"), rondas = c.cab.filter((x) => /^R\d+$/.test(x)).length;
  const porNumero = new Map(c.filas.map((f) => [Number(f[iN]), f]));
  const n = c.filas.length;
  cierto("los números de jugador van de 1 a " + n + ", sin repetir", [...porNumero.keys()].sort((a, b) => a - b).join() === Array.from({ length: n }, (_, k) => k + 1).join());
  const t = T.nuevo({ sistema: "suizo", rondasTotales: rondas, desempates: ["BH-C1", "BH", "SB"],
    // el Elo baja con el número: así el orden inicial es el del cuadro
    jugadores: [...porNumero.keys()].sort((a, b) => a - b).map((k) => ({ id: "j" + k, nombre: porNumero.get(k)[iJ], elo: 2000 - k * 10 })) });
  t.numeracion = t.jugadores.map((j) => j.id);
  let coherente = true;
  for (let r = 0; r < rondas; r++) {
    const mesas = [], vistos = new Set();
    for (const [k, f] of porNumero) {
      if (vistos.has(k)) continue;
      const x = f[col(c, "R" + (r + 1))];
      if (x === "libre 1") { mesas.push({ b: "j" + k, n: null, r: null }); vistos.add(k); continue; }
      const m = /^(\d+)([bn]) ([01½])$/.exec(x);
      if (!m) { coherente = false; cierto("la casilla «" + x + "» se entiende (rival, color y resultado)", false); continue; }
      const rival = Number(m[1]), y = porNumero.get(rival) && porNumero.get(rival)[col(c, "R" + (r + 1))];
      const otro = { "1": "0", "0": "1", "½": "½" }[m[3]];
      if (y !== k + (m[2] === "b" ? "n" : "b") + " " + otro) { coherente = false; cierto("ronda " + (r + 1) + ": la casilla de " + k + " y la de su rival " + rival + " dicen lo mismo", false, x + " / " + y); }
      const blancas = m[2] === "b";
      const res = m[3] === "½" ? "=" : (m[3] === "1") === blancas ? "1-0" : "0-1";
      mesas.push(blancas ? { b: "j" + k, n: "j" + rival, r: res } : { b: "j" + rival, n: "j" + k, r: res });
      vistos.add(k); vistos.add(rival);
    }
    t.rondas.push({ mesas, ausencias: {} });
  }
  cierto("cada casilla y la de su rival dicen lo mismo", coherente);
  const fpc = await M.comprobar(T.aTrf(t));
  cierto("cada ronda es la que da el Sistema holandés (comprobador de bbpPairings)", fpc.correcto, fpc.diferencias.join(" | "));
  const cl = D.clasificacion(t, ["BH-C1", "BH", "SB"]);
  const calc = new Map(cl.map((x) => [Number(x.id.slice(1)), x]));
  for (const [nombre, f] of [["Pts", (x) => x.puntos], ["BH-C1", (x) => x.valores["BH-C1"]], ["BH", (x) => x.valores.BH], ["SB", (x) => x.valores.SB], ["Puesto", (x) => x.puesto]]) {
    const malos = c.filas.filter((fila) => numero(fila[col(c, nombre)]) !== f(calc.get(Number(fila[iN]))))
      .map((fila) => fila[iJ] + " dice " + fila[col(c, nombre)] + " y es " + f(calc.get(Number(fila[iN]))));
    cierto("la columna " + nombre + " es la del reglamento (C.07)", !malos.length, malos.join("; "));
  }
  cierto("las filas van en el orden final", c.filas.map((f) => f[iN]).join() === cl.map((x) => x.id.slice(1)).join());
  const arriba = cl.filter((x) => x.puntos === cl[0].puntos).map((_, i) => i);
  cierto("se resaltan justo los empatados en el primer puesto", (c.resaltar || []).join() === arriba.join(), (c.resaltar || []).join() + " / " + arriba.join());

  // ---------- el todos contra todos
  console.log("\nTodos contra todos: " + todos.titulo);
  const r2 = todos.cuadro;
  const jN = col(r2, "N.º"), jJ = col(r2, "Jugador"), m6 = r2.filas.length;
  const casilla = (i, k) => r2.filas[i][col(r2, String(k + 1))];
  let simetrico = true;
  for (let i = 0; i < m6; i++) {
    if (casilla(i, i) !== "×") simetrico = false;
    for (let k = 0; k < m6; k++) if (i !== k && numero(casilla(i, k)) + numero(casilla(k, i)) !== 1) simetrico = false;
  }
  cierto("la diagonal es «×» y cada partida suma 1 entre las dos casillas", simetrico);
  // Las rondas salen de las tablas de Berger (js/pareo/torneo.js), con el
  // resultado de cada partida leído del cuadro.
  const t2 = T.nuevo({ sistema: "todos", desempates: ["DE", "SB"],
    jugadores: r2.filas.map((f) => ({ id: "r" + f[jN], nombre: f[jJ], elo: 0 })) });
  t2.numeracion = t2.jugadores.map((j) => j.id);
  const pares = Array.from({ length: m6 - 1 }, (_, r) => T.berger(m6, r + 1));
  pares.forEach((ronda) => t2.rondas.push({ ausencias: {}, mesas: ronda.map(([b, nn]) => {
    const v = casilla(b - 1, nn - 1);
    return { b: "r" + b, n: "r" + nn, r: v === "½" ? "=" : v === "1" ? "1-0" : "0-1" };
  }) }));
  cierto("son " + (m6 - 1) + " rondas y " + (m6 * (m6 - 1)) / 2 + " partidas", t2.rondas.length === m6 - 1 && t2.rondas.flatMap((x) => x.mesas).length === (m6 * (m6 - 1)) / 2);
  const cl2 = D.clasificacion(t2, ["DE", "SB"]);
  const calc2 = new Map(cl2.map((x) => [Number(x.id.slice(1)), x]));
  const empatados = new Set(cl2.filter((x) => cl2.some((y) => y !== x && y.puntos === x.puntos)).map((x) => Number(x.id.slice(1))));
  for (const [nombre, f] of [["Pts", (x) => x.puntos], ["SB", (x) => x.valores.SB], ["Puesto", (x) => x.puesto]]) {
    const malos = r2.filas.filter((fila) => numero(fila[col(r2, nombre)]) !== f(calc2.get(Number(fila[jN]))))
      .map((fila) => fila[jJ] + " dice " + fila[col(r2, nombre)] + " y es " + f(calc2.get(Number(fila[jN]))));
    cierto("la columna " + nombre + " es la del reglamento (C.07)", !malos.length, malos.join("; "));
  }
  const malosDE = r2.filas.filter((fila) => {
    const k = Number(fila[jN]), v = fila[col(r2, "Directo")];
    return empatados.has(k) ? numero(v) !== calc2.get(k).valores.DE : v !== "—";
  }).map((fila) => fila[jJ] + ": " + fila[col(r2, "Directo")]);
  cierto("«Directo» es el encuentro directo de los empatados, y «—» para los demás", !malosDE.length, malosDE.join("; "));
  const tresArriba = cl2.filter((x) => x.puntos === cl2[0].puntos).map((x) => Number(x.id.slice(1)) - 1).sort();
  cierto("se resaltan justo los empatados arriba", (r2.resaltar || []).slice().sort().join() === tresArriba.join());

  // ---------- las láminas dibujan este mismo cuadro
  console.log("\nLas láminas");
  const datos = require(path.join(__dirname, "datos", "formacion-laminas-clase-03.js"));
  const usan = datos.filter((d) => d.tipo === "cruzado").map((d) => d.cuadro);
  cierto("la presentación dibuja los dos cuadros del curso, sin copia propia", usan.length === 2 && usan.includes(suizo.cuadro) && usan.includes(todos.cuadro));

  console.log(fallas ? "\n✗ " + fallas + " fallas" : "\nTodo bien.");
  process.exit(fallas ? 1 : 0);
})();
