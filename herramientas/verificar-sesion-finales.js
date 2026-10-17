/* Comprueba la sesión intensiva de finales (herramientas/sesion-finales-intensiva.js).
 *
 * Sin navegador ni motor: el CI no tiene Stockfish. Lo que dice el motor lo
 * deja herramientas/sesion-finales-motor.js en sesion-finales-motor.json, y
 * acá se exige que cada afirmación tenga su veredicto, para la MISMA posición
 * y la misma jugada. Todo lo que puede estar mal se rompe callado, delante de
 * la clase:
 *
 *  1. UNA POSICIÓN QUE NO ES LA DEL BANCO. Se vuelve a leer «El mapa de los
 *     finales» acá, por separado, y la posición y la línea tienen que salir de
 *     ahí (las únicas jugadas escritas a mano son las del final, `extra`).
 *  2. UNA JUGADA QUE NO EXISTE. La línea, cada trampa y su refutación, y la
 *     línea escrita en la chuleta se juegan con chess.js.
 *  3. UNA AFIRMACIÓN SIN MOTOR. «Única», «también gana», cada trampa, y que la
 *     posición gane al principio y al final de la línea: cada una con su
 *     veredicto bueno en sesion-finales-motor.json.
 *  4. EL TEXTO QUE DICE MÁS QUE LOS DATOS. Cada «N.jugada! ÚNICA» escrito en
 *     una nota tiene que estar entre las únicas, y cada «N.jugada?» entre las
 *     trampas: si alguien corrige la nota y no los datos, el motor nunca lo
 *     miró.
 *  5. LO QUE LA BASE O LA CLASE EN VIVO RECHAZAN: chuleta de más de 500,
 *     nota de más de 2000, orden con huecos, una posición que «Al tablero» no
 *     acepta.
 *
 * Uso:  npm install
 *       node herramientas/sesion-finales-intensiva.js
 *       node herramientas/verificar-sesion-finales.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const Chess = require(path.join(RAIZ, "node_modules", "chess.js")).Chess;

const PLAN = path.join(__dirname, "planes", "sesion-finales-intensiva.json");
const MOTOR = path.join(__dirname, "sesion-finales-motor.json");
if (!fs.existsSync(PLAN)) {
  console.error("Falta " + path.relative(RAIZ, PLAN) + ". Corre antes: node herramientas/sesion-finales-intensiva.js");
  process.exit(2);
}
const plan = JSON.parse(fs.readFileSync(PLAN, "utf8")).planes[0];
const motor = JSON.parse(fs.readFileSync(MOTOR, "utf8"));
const mapa = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos/protegido/data/el-mapa-de-los-finales.json"), "utf8"));

global.window = {};
global.Chess = Chess;
require(path.join(RAIZ, "js", "posicion-valida.js"));
const PosicionValida = global.window.PosicionValida;

const A_INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const aIngles = (san) => String(san).replace(/[RDTAC]/g, (m) => A_INGLES[m]);
const sinMarcas = (san) => san.replace(/[+#!?]/g, "");

let fallos = 0;
const mal = (msg) => { console.log("  ✗ " + msg); fallos += 1; };

function diagrama(id) {
  for (const f of mapa.finales) for (const d of f.diagramas || []) if (d.id === id) return d;
  return null;
}
function jugar(fen, sans) {
  const c = new Chess();
  if (!c.load(fen)) return null;
  for (const san of sans) if (!c.move(san, { sloppy: true })) return null;
  return c;
}
const numero = (ej, i) => +ej.fen.split(" ")[5] + Math.floor(i / 2);

// ------------------------------------------------------------------ 5: forma

console.log("=== El plan ===");
const posiciones = plan.items.filter((it) => it.tipo === "posicion");
const ejercicios = plan.ejercicios;
console.log("  " + plan.items.length + " renglones · " + posiciones.length + " posiciones · " + ejercicios.length + " ejercicios");
if (ejercicios.length !== 10 || posiciones.length !== 10) mal("tienen que ser diez ejercicios, cada uno con su posición");
if (plan.items.map((i) => i.orden).join(",") !== plan.items.map((_, i) => i).join(",")) mal("orden con huecos o repetido");
plan.items.forEach((it) => {
  if (it.titulo.length > 200) mal("título largo: " + it.titulo);
  if (it.pregunta && it.pregunta.length > 500) mal("chuleta de más de 500: " + it.titulo);
  if (it.nota && it.nota.length > 2000) mal("nota de más de 2000: " + it.titulo);
  if (it.tipo === "nota" && !it.nota) mal("nota vacía: " + it.titulo);
  if (it.tipo === "posicion") {
    const motivo = PosicionValida.motivo(it.fen);
    if (motivo) mal("la clase en vivo la rechazaría (" + motivo + "): " + it.titulo);
  }
});
if (!fallos) console.log("  ✓ todo cabe en la base y pasa la regla de «Al tablero»");

// -------------------------------------------------------- 1 y 2: el banco

console.log("\n=== Las posiciones y las líneas, contra el banco ===");
const antes1 = fallos;
ejercicios.forEach((ej) => {
  const quien = "Ejercicio " + ej.n + " (" + ej.banco + ")";
  const d = diagrama(ej.banco);
  if (!d) { mal(quien + ": no está en «El mapa de los finales»"); return; }
  const delBanco = d.jugadas.map((j) => j.san);
  // La posición es la del banco, o la de unas jugadas de su línea más adelante.
  let saltar = -1;
  for (let k = 0; k <= delBanco.length; k++) {
    const c = jugar(d.fen, delBanco.slice(0, k));
    if (c && c.fen() === ej.fen) { saltar = k; break; }
  }
  if (saltar < 0) { mal(quien + ": la posición no sale del banco"); return; }
  const prefijo = delBanco.slice(saltar);
  if (ej.linea.slice(0, prefijo.length).join(" ") !== prefijo.join(" ")) mal(quien + ": la línea no es la del banco");
  const c = jugar(ej.fen, ej.linea);
  if (!c) { mal(quien + ": la línea no se puede jugar"); return; }
  if (c.fen() !== ej.final) mal(quien + ": la línea no llega a la posición final que dice");
  ej.linea.forEach((_, i) => {
    const p = jugar(ej.fen, ej.linea.slice(0, i));
    if (!p || p.fen() !== ej.antes[i]) mal(quien + ": la posición antes de la jugada " + i + " no corresponde");
  });
  ej.trampas.forEach((t) => {
    if (!jugar(ej.antes[t.jugada], [t.san].concat(t.refuta))) mal(quien + ": la trampa " + t.san + " o su refutación no se pueden jugar");
    if (t.san === ej.linea[t.jugada]) mal(quien + ": la trampa " + t.san + " es la jugada de la línea");
  });
  ej.tambien.forEach((t) => {
    if (!jugar(ej.antes[t.jugada], [t.san])) mal(quien + ": " + t.san + " no se puede jugar");
  });
});

// La línea escrita en la chuleta es la que lee el profesor en voz alta.
posiciones.forEach((it, k) => {
  const ej = ejercicios[k];
  if (!ej || it.fen !== ej.fen) { mal("la posición del renglón no es la del ejercicio: " + it.titulo); return; }
  const m = it.pregunta.match(/Línea:\s*(.+?)(?:\s·|$)/);
  if (!m) { mal("la chuleta no trae la línea: " + it.titulo); return; }
  const sans = m[1].trim().split(/\s+/).map((x) => aIngles(x.replace(/^\d+\.+/, ""))).filter(Boolean);
  const c = jugar(it.fen, sans);
  if (!c) { mal("la línea de la chuleta no se puede jugar: " + it.titulo); return; }
  if (c.fen() !== ej.final) mal("la línea de la chuleta no es la del ejercicio: " + it.titulo);
});
if (fallos === antes1) console.log("  ✓ las diez posiciones salen del banco; líneas, trampas y chuletas se juegan con chess.js");

// ------------------------------------------------------------ 3: el motor

console.log("\n=== Lo que afirma la sesión, contra Stockfish ===");
const antes3 = fallos;
let afirmaciones = 0;
function exigir(ej, fen, tipo, san, extra) {
  afirmaciones += 1;
  const v = motor.veredictos[fen + "|" + tipo + "|" + (san || "")];
  const que = "Ejercicio " + ej.n + " · " + tipo + (san ? " " + san : "");
  if (!v) { mal(que + ": sin veredicto del motor. Corre: node herramientas/sesion-finales-motor.js"); return; }
  if (!v.ok) { mal(que + ": el motor no lo confirma (" + v.detalle + ")"); return; }
  if (extra && (v.resultado !== extra.resultado || (v.refuta || []).join(" ") !== extra.refuta.join(" "))) {
    mal(que + ": el veredicto es de otra refutación. Corre: node herramientas/sesion-finales-motor.js");
  }
}
ejercicios.forEach((ej) => {
  exigir(ej, ej.fen, "inicio");
  exigir(ej, ej.final, "final");
  ej.unicas.forEach((i) => exigir(ej, ej.antes[i], "unica", ej.linea[i]));
  ej.tambien.forEach((t) => exigir(ej, ej.antes[t.jugada], "tambien", t.san));
  ej.trampas.forEach((t) => exigir(ej, ej.antes[t.jugada], "trampa", t.san, t));
});
if (fallos === antes3) console.log("  ✓ " + afirmaciones + " afirmaciones, todas confirmadas por " + motor.motor + " a profundidad " + motor.profundidad);

// ----------------------------------------------------- 4: el texto y los datos

console.log("\n=== Lo que dicen las notas, contra los datos ===");
const antes4 = fallos;
let enTexto = 0;
const JUGADA = /(?:^|[\s(])(\d+)\.([RDTAC]?[a-h]?[1-8]?x?[a-h][1-8](?:=[DTAC])?[+#]?)(!|\?\??)(\s+ÚNICA)?/g;
ejercicios.forEach((ej) => {
  let m;
  JUGADA.lastIndex = 0;
  while ((m = JUGADA.exec(ej.explicacion))) {
    const [, num, es, marca, unica] = m;
    const san = sinMarcas(aIngles(es));
    if (marca === "!" && !unica) continue;   // «!» sola es un elogio, no una afirmación
    enTexto += 1;
    if (unica) {
      const ok = ej.unicas.some((i) => numero(ej, i) === +num && sinMarcas(ej.linea[i]) === san);
      if (!ok) mal("Ejercicio " + ej.n + ": la nota dice «" + num + "." + es + "! ÚNICA» y no está entre las únicas");
    } else {
      const ok = ej.trampas.some((t) => numero(ej, t.jugada) === +num && sinMarcas(t.san) === san);
      if (!ok) mal("Ejercicio " + ej.n + ": la nota marca «" + num + "." + es + marca + "» y no está entre las trampas");
    }
  }
});
if (fallos === antes4) console.log("  ✓ las " + enTexto + " jugadas marcadas en las notas («! ÚNICA» y «?») están comprobadas");

console.log(fallos ? "\n" + fallos + " problema(s)." : "\nTodo en orden.");
process.exit(fallos ? 1 : 0);
