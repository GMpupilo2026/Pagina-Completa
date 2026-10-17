/* Comprueba las sesiones intensivas (herramientas/sesion-*-intensiva.js):
 * finales, estrategia y las que se agreguen, que se encuentran solas.
 *
 * Sin navegador ni motor: el CI no tiene Stockfish. Lo que dice el motor lo
 * deja herramientas/sesion-intensiva-motor.js en sesion-<nombre>-motor.json,
 * y acá se exige que cada afirmación tenga su veredicto, para la MISMA
 * posición y la misma jugada. Todo lo que puede estar mal se rompe callado,
 * delante de la clase:
 *
 *  1. UNA POSICIÓN QUE NO ES LA DEL BANCO. Se vuelve a leer cada banco acá,
 *     por separado de lib/sesion-intensiva.js, y la posición y la línea
 *     tienen que salir de ahí (las únicas jugadas escritas a mano son las del
 *     final, `extra`).
 *  2. UNA JUGADA QUE NO EXISTE. La línea, cada trampa y su refutación, y la
 *     línea escrita en la chuleta se juegan con chess.js.
 *  3. UNA AFIRMACIÓN SIN MOTOR. «Única», «también gana», cada trampa, y que la
 *     posición sea buena al principio y al final de la línea: cada una con su
 *     veredicto bueno en el JSON del motor.
 *  4. EL TEXTO QUE DICE MÁS QUE LOS DATOS. Cada «N.jugada! ÚNICA» (o
 *     «N...jugada! ÚNICA») escrito en una nota tiene que estar entre las
 *     únicas, y cada «N.jugada?» entre las trampas: si alguien corrige la nota
 *     y no los datos, el motor nunca lo miró.
 *  5. LO QUE LA BASE O LA CLASE EN VIVO RECHAZAN: chuleta de más de 500,
 *     nota de más de 2000, orden con huecos, una posición que «Al tablero» no
 *     acepta, dos sesiones con el mismo título.
 *
 * Uso:  npm install
 *       node herramientas/sesion-finales-intensiva.js && node herramientas/sesion-estrategia-intensiva.js
 *       node herramientas/verificar-sesiones-intensivas.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const Chess = require(path.join(RAIZ, "node_modules", "chess.js")).Chess;

global.window = {};
global.Chess = Chess;
require(path.join(RAIZ, "js", "posicion-valida.js"));
const PosicionValida = global.window.PosicionValida;

const A_INGLES = { R: "K", D: "Q", T: "R", A: "B", C: "N" };
const aIngles = (san) => String(san).replace(/[RDTAC]/g, (m) => A_INGLES[m]);
const sinMarcas = (san) => san.replace(/[+#!?]/g, "");
const leer = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, p), "utf8"));

let fallos = 0;
const mal = (msg) => { console.log("  ✗ " + msg); fallos += 1; };

// ------------------------------------------------------------- los bancos

/* La posición y la línea de cada banco, leídas acá a mano, sin pasar por el
   código que arma la sesión: si ese código leyera mal, esto lo delata. */
const diagramas = {};
function deDiagramas(archivo, id) {
  if (!diagramas[archivo]) {
    diagramas[archivo] = {};
    for (const f of leer(archivo).finales) for (const d of f.diagramas || []) diagramas[archivo][d.id] = d;
  }
  const d = diagramas[archivo][id];
  return d && { fen: d.fen, jugadas: d.jugadas.map((j) => j.san) };
}
let unaClase = null;
function deUnaClase(id) {
  if (!unaClase) {
    unaClase = {};
    const dir = path.join(RAIZ, "cursos/protegido/data/una-clase-al-dia");
    for (const f of fs.readdirSync(dir)) {
      for (const e of Object.values(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).ejercicios || {})) unaClase[e.id] = e;
    }
  }
  const e = unaClase[id];
  return e && { fen: e.fen, jugadas: e.solucion.map((s) => s.san) };
}
function delBanco(banco) {
  const [tipo, id] = String(banco).split(":");
  if (tipo === "mapa") return deDiagramas("cursos/protegido/data/el-mapa-de-los-finales.json", id);
  if (tipo === "gp") return deDiagramas("cursos/protegido/data/ganar-con-poco.json", id);
  if (tipo === "ucd") return deUnaClase(id);
  return null;
}

function jugar(fen, sans) {
  const c = new Chess();
  if (!c.load(fen)) return null;
  for (const san of sans) if (!c.move(san, { sloppy: true })) return null;
  return c;
}
/* El número de la jugada `i` de una línea que empieza en `fen`, y de quién es. */
function numero(fen, i) {
  const [, turno, , , , n] = fen.split(" ");
  const negras = turno === "b";
  return { n: +n + Math.floor((i + (negras ? 1 : 0)) / 2), color: (i % 2 === 0) === !negras ? "w" : "b" };
}

// ---------------------------------------------------------------- las sesiones

const NOMBRES = fs.readdirSync(__dirname).filter((f) => /^sesion-.+-intensiva\.js$/.test(f))
  .map((f) => f.replace(/^sesion-|-intensiva\.js$/g, "")).sort();
if (!NOMBRES.length) { console.error("No hay ninguna herramientas/sesion-*-intensiva.js"); process.exit(2); }

const titulos = new Set();
for (const nombre of NOMBRES) {
  const archivoPlan = path.join(__dirname, "planes", "sesion-" + nombre + "-intensiva.json");
  const archivoMotor = path.join(__dirname, "sesion-" + nombre + "-motor.json");
  console.log("\n######## Sesión «" + nombre + "»");
  if (!fs.existsSync(archivoPlan)) {
    mal("falta " + path.relative(RAIZ, archivoPlan) + ". Corre antes: node herramientas/sesion-" + nombre + "-intensiva.js");
    continue;
  }
  if (!fs.existsSync(archivoMotor)) {
    mal("falta " + path.relative(RAIZ, archivoMotor) + ". Corre: node herramientas/sesion-intensiva-motor.js " + nombre);
    continue;
  }
  const plan = JSON.parse(fs.readFileSync(archivoPlan, "utf8")).planes[0];
  const motor = JSON.parse(fs.readFileSync(archivoMotor, "utf8"));

  // ---------------------------------------------------------------- 5: forma
  console.log("=== El plan ===");
  const antes5 = fallos;
  const posiciones = plan.items.filter((it) => it.tipo === "posicion");
  const ejercicios = plan.ejercicios;
  console.log("  " + plan.titulo + " · " + plan.items.length + " renglones · " + ejercicios.length + " ejercicios");
  if (titulos.has(plan.titulo)) mal("dos sesiones con el mismo título: " + plan.titulo);
  titulos.add(plan.titulo);
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
  if (fallos === antes5) console.log("  ✓ todo cabe en la base y pasa la regla de «Al tablero»");

  // -------------------------------------------------------- 1 y 2: el banco
  console.log("=== Las posiciones y las líneas, contra el banco ===");
  const antes1 = fallos;
  ejercicios.forEach((ej) => {
    const quien = "Ejercicio " + ej.n + " (" + ej.banco + ")";
    const b = delBanco(ej.banco);
    if (!b) { mal(quien + ": no está en el banco"); return; }
    // La posición es la del banco, o la de unas jugadas de su línea más adelante.
    const c0 = jugar(b.fen, b.jugadas.slice(0, ej.saltar));
    if (!c0 || c0.fen() !== ej.fen) { mal(quien + ": la posición no sale del banco"); return; }
    // La línea: unas jugadas del banco, seguidas, y después las de `extra`.
    const delB = b.jugadas.slice(ej.saltar, ej.saltar + ej.delBanco);
    if (!ej.delBanco || ej.linea.slice(0, ej.delBanco).join(" ") !== delB.join(" ")) mal(quien + ": la línea no es la del banco");
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
      // «castiga» es un error del rival; las demás, del que tiene la ventaja.
      // Al revés, el motor estaría midiendo otra cosa que lo que dice la nota.
      const delRival = numero(ej.fen, t.jugada).color !== ej.fen.split(" ")[1];
      if (delRival !== (t.resultado === "castiga")) mal(quien + ": la trampa " + t.san + " no es del bando que dice su resultado");
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
  console.log("=== Lo que afirma la sesión, contra Stockfish ===");
  const antes3 = fallos;
  let afirmaciones = 0;
  const exigir = (ej, fen, tipo, san, extra) => {
    afirmaciones += 1;
    const v = motor.veredictos[fen + "|" + tipo + "|" + (san || "")];
    const que = "Ejercicio " + ej.n + " · " + tipo + (san ? " " + san : "");
    if (!v) { mal(que + ": sin veredicto del motor. Corre: node herramientas/sesion-intensiva-motor.js " + nombre); return; }
    if (!v.ok) { mal(que + ": el motor no lo confirma (" + v.detalle + ")"); return; }
    // Con otros umbrales el veredicto es de otra regla: si se cambian en el
    // archivo y no se vuelve a correr el motor, no vale.
    if (JSON.stringify(v.umbral) !== JSON.stringify(ej.umbral)) {
      mal(que + ": el veredicto es de otros umbrales. Corre: node herramientas/sesion-intensiva-motor.js " + nombre);
      return;
    }
    if (extra && (v.resultado !== extra.resultado || (v.refuta || []).join(" ") !== extra.refuta.join(" "))) {
      mal(que + ": el veredicto es de otra refutación. Corre: node herramientas/sesion-intensiva-motor.js " + nombre);
    }
  };
  ejercicios.forEach((ej) => {
    exigir(ej, ej.fen, "inicio");
    exigir(ej, ej.final, "final");
    ej.unicas.forEach((i) => exigir(ej, ej.antes[i], "unica", ej.linea[i]));
    ej.tambien.forEach((t) => exigir(ej, ej.antes[t.jugada], "tambien", t.san));
    ej.trampas.forEach((t) => exigir(ej, ej.antes[t.jugada], "trampa", t.san, t));
  });
  if (fallos === antes3) console.log("  ✓ " + afirmaciones + " afirmaciones, todas confirmadas por " + motor.motor + " a profundidad " + motor.profundidad);

  // ------------------------------------------------- 4: el texto y los datos
  console.log("=== Lo que dicen las notas, contra los datos ===");
  const antes4 = fallos;
  let enTexto = 0;
  const JUGADA = /(?:^|[\s(])(\d+)(\.\.\.|\.)([RDTAC]?[a-h]?[1-8]?x?[a-h][1-8](?:=[DTAC])?[+#]?)(!|\?\??)(\s+ÚNICA)?/g;
  ejercicios.forEach((ej) => {
    const es = (i, num, color, san, jugadaSan) => {
      const x = numero(ej.fen, i);
      return x.n === num && x.color === color && sinMarcas(jugadaSan) === san;
    };
    let m;
    JUGADA.lastIndex = 0;
    while ((m = JUGADA.exec(ej.explicacion))) {
      const [, num, puntos, texto, marca, unica] = m;
      const color = puntos === "..." ? "b" : "w";
      const san = sinMarcas(aIngles(texto));
      if (marca === "!" && !unica) continue;   // «!» sola es un elogio, no una afirmación
      enTexto += 1;
      if (unica) {
        if (!ej.unicas.some((i) => es(i, +num, color, san, ej.linea[i]))) {
          mal("Ejercicio " + ej.n + ": la nota dice «" + num + puntos + texto + "! ÚNICA» y no está entre las únicas");
        }
      } else if (!ej.trampas.some((t) => es(t.jugada, +num, color, san, t.san))) {
        mal("Ejercicio " + ej.n + ": la nota marca «" + num + puntos + texto + marca + "» y no está entre las trampas");
      }
    }
  });
  if (fallos === antes4) console.log("  ✓ las " + enTexto + " jugadas marcadas en las notas («! ÚNICA» y «?») están comprobadas");
}

console.log(fallos ? "\n" + fallos + " problema(s)." : "\nTodo en orden.");
process.exit(fallos ? 1 : 0);
