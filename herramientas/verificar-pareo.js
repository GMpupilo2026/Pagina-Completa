/* Pareo Integral sin navegador: el motor, el TRF, Berger y los desempates.
 *
 * Lo que se rompe acá no da ningún error: un emparejamiento mal armado se ve
 * igual de prolijo que uno bueno, y un desempate mal contado cambia quién se
 * lleva el trofeo. Ver «Pareo Integral» en docs/decisiones/juegos-y-torneos.md.
 *
 *   1. El motor (js/vendor/bbppairings, compilado a WebAssembly) contesta byte
 *      a byte lo mismo que esperan las pruebas del propio bbpPairings.
 *   2. Su generador de torneos al azar y su comprobador (los dos servicios
 *      públicos que pide FIDE para avalar un programa) andan, y el comprobador
 *      da por buenos los torneos que arma el generador.
 *   3. Torneos enteros armados por Pareo Integral —con byes pedidos, retiros,
 *      inscripciones tardías e incomparecencias— pasan por el comprobador sin
 *      una sola diferencia, y su TRF se lee y se vuelve a escribir igual.
 *   4. Las tablas de Berger son las de FIDE (4 y 6 jugadores, tal cual el
 *      Handbook) y, de 3 a 20, cada uno juega con todos una vez y los colores
 *      quedan parejos.
 *   5. Los desempates dan los valores de los casos del C.07:2026 y los de
 *      referencia de chesspairing en 60 torneos al azar
 *      (herramientas/datos/pareo-desempates.json).
 *
 * No necesita navegador ni red.   node herramientas/verificar-pareo.js       */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const T = require(path.join(raiz, "js/pareo/torneo.js"));
const D = require(path.join(raiz, "js/pareo/desempates.js"));
const M = require(path.join(raiz, "js/pareo/motor.js")).enNode();

let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

function azar(s) { return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); }

async function torneoAlAzar(semilla) {
  const az = azar(semilla);
  const n = 5 + Math.floor(az() * 40), rondas = 4 + Math.floor(az() * 7);
  const t = T.nuevo({ nombre: "Prueba " + semilla, rondasTotales: rondas, colorInicial: az() < 0.5 ? "w" : "b" });
  let k = 0;
  const alta = () => { k++; t.jugadores.push({ id: "p" + k, nombre: "Jugador " + k, elo: az() < 0.15 ? 0 : 1200 + Math.floor(az() * 1200), titulo: az() < 0.05 ? "FM" : "", fed: "CRC", sexo: "m", retiradoDespuesDe: null }); };
  for (let i = 0; i < n; i++) alta();
  for (let r = 0; r < rondas; r++) {
    if (r === 0) T.fijarNumeracion(t);
    if (r > 0 && r < 3 && az() < 0.3) alta();
    if (r > 1 && az() < 0.2) { const j = t.jugadores[Math.floor(az() * t.jugadores.length)]; if (j.retiradoDespuesDe == null) j.retiradoDespuesDe = r; }
    const aus = {};
    for (const j of t.jugadores) if (az() < 0.05 && j.retiradoDespuesDe == null) aus[j.id] = az() < 0.6 ? "H" : "Z";
    let mesas;
    try { mesas = T.leerPareo(t, await M.emparejar(T.aTrf(t, { hasta: r, proxima: { ausencias: aus } }))); }
    catch (e) { if (e.codigo === 1) break; throw e; }
    for (const m of mesas) if (m.n) { const x = az(); m.r = x < 0.4 ? "1-0" : x < 0.75 ? "0-1" : x < 0.95 ? "=" : x < 0.97 ? "+-" : x < 0.99 ? "-+" : "--"; }
    t.rondas.push({ mesas, ausencias: aus });
  }
  return t;
}

(async () => {
  console.log("=== 1. El motor contesta lo que esperan las pruebas de bbpPairings ===");
  const dirPruebas = path.join(__dirname, "datos", "pareo-motor");
  for (const f of fs.readdirSync(dirPruebas).filter((x) => x.endsWith(".trf")).sort()) {
    const base = f.replace(/\.trf$/, "");
    const salida = await M.emparejar(fs.readFileSync(path.join(dirPruebas, f), "utf8"));
    if (salida === fs.readFileSync(path.join(dirPruebas, base + ".esperado"), "utf8")) bien(base);
    else mal(base + ": el motor contestó otra cosa:\n" + salida);
  }

  console.log("=== 2. El generador (RTG) y el comprobador (FPC) ===");
  let generados = 0;
  for (let s = 1; s <= 10; s++) {
    const trf = await M.generar(s * 104729);
    const c = await M.comprobar(trf);
    // Y Pareo Integral lo lee y lo vuelve a escribir sin romperlo (el generador
    // no pone la línea 142 cuando ya se jugaron todas las rondas).
    const c2 = await M.comprobar(T.aTrf(T.deTrf(trf))).catch((e) => ({ correcto: false, diferencias: [e.message] }));
    if (c.correcto && c2.correcto) generados++;
    else mal(`semilla ${s * 104729}: ${c.correcto ? "leído y vuelto a escribir" : "tal cual"}, el comprobador no lo da por bueno: ${(c.correcto ? c2 : c).diferencias.slice(0, 3).join(" | ")}`);
  }
  if (generados === 10) bien("10 torneos generados al azar, sin diferencias para el comprobador, tal cual y leídos y vueltos a escribir por Pareo Integral");
  // El comprobador tiene que SALTAR si una ronda no es la del reglamento: se
  // invierten los colores de una mesa de la ronda 1 en las dos líneas (el
  // archivo sigue siendo coherente, solo que esa no es la ronda del Holandés).
  {
    const lineas = (await M.generar(4242)).split("\r");
    const i = lineas.findIndex((l) => l.startsWith("001"));
    const rival = Number(lineas[i].slice(91, 95));
    const j = lineas.findIndex((l) => l.startsWith("001") && Number(l.slice(4, 8)) === rival);
    const voltear = (l) => l.slice(0, 96) + (l[96] === "w" ? "b" : "w") + l.slice(97);
    lineas[i] = voltear(lineas[i]);
    lineas[j] = voltear(lineas[j]);
    const c = await M.comprobar(lineas.join("\r"));
    if (!c.correcto) bien("una mesa de la ronda 1 con los colores al revés: el comprobador la marca (" + c.diferencias[0] + ")");
    else mal("el comprobador dio por buena una ronda 1 con los colores al revés");
  }

  console.log("=== 3. Torneos enteros de Pareo Integral pasan el comprobador ===");
  let enteros = 0, vuelta = 0, conTodo = { bye: 0, H: 0, retiro: 0, tarde: 0, incomp: 0 };
  const N = 60;
  for (let s = 1; s <= N; s++) {
    const t = await torneoAlAzar(s);
    const trf = T.aTrf(t);
    const c = await M.comprobar(trf);
    if (c.correcto) enteros++;
    else mal(`torneo ${s}: ${c.diferencias.slice(0, 3).join(" | ")}`);
    if (T.aTrf(T.deTrf(trf)) === trf) vuelta++;
    else mal(`torneo ${s}: leer el TRF y volver a escribirlo no da lo mismo`);
    for (const R of t.rondas) {
      if (R.mesas.some((m) => m.n === null)) conTodo.bye++;
      if (Object.values(R.ausencias).includes("H")) conTodo.H++;
      if (R.mesas.some((m) => m.r && /[+-]{2}|-\+|\+-/.test(m.r))) conTodo.incomp++;
    }
    if (t.jugadores.some((j) => j.retiradoDespuesDe != null)) conTodo.retiro++;
    if (t.numeracion && t.jugadores.length > t.numeracion.length) conTodo.tarde++;
  }
  if (enteros === N) bien(`${N} torneos de 5 a 45 jugadores: el comprobador no encuentra ni una diferencia`);
  if (vuelta === N) bien(`${N} TRF leídos y vueltos a escribir, idénticos`);
  if (Object.values(conTodo).every((x) => x > 0)) bien(`y la prueba tocó de todo: ${JSON.stringify(conTodo)}`);
  else mal("la prueba no tocó todos los casos: " + JSON.stringify(conTodo));

  console.log("=== 4. Las tablas de Berger ===");
  const pares = (n) => Array.from({ length: n - 1 }, (_, r) => T.berger(n, r + 1).map(([a, b]) => a + "-" + b).join(" "));
  const FIDE4 = ["1-4 2-3", "4-3 1-2", "2-4 3-1"];
  const FIDE6 = ["1-6 2-5 3-4", "6-4 5-3 1-2", "2-6 3-1 4-5", "6-5 1-4 2-3", "3-6 4-2 5-1"];
  if (JSON.stringify(pares(4)) === JSON.stringify(FIDE4)) bien("4 jugadores: la tabla de FIDE"); else mal("4 jugadores: " + pares(4).join(" / "));
  if (JSON.stringify(pares(6)) === JSON.stringify(FIDE6)) bien("6 jugadores: la tabla de FIDE"); else mal("6 jugadores: " + pares(6).join(" / "));
  let bergerBien = true;
  for (let jug = 3; jug <= 20; jug++) {
    const t = T.nuevo({ sistema: "todos", jugadores: Array.from({ length: jug }, (_, i) => ({ id: "x" + i, nombre: "x" + i, elo: 2000 - i })) });
    T.fijarNumeracion(t);
    const vistos = new Set();
    const blancas = new Map(t.jugadores.map((j) => [j.id, 0]));
    for (let r = 0; r < T.rondasTodos(t); r++) {
      for (const m of T.rondaTodos(t, r).mesas) {
        const clave = [m.b, m.n].sort().join("|");
        if (vistos.has(clave)) { bergerBien = false; mal(`${jug} jugadores: ${clave} se repite`); }
        vistos.add(clave);
        blancas.set(m.b, blancas.get(m.b) + 1);
      }
    }
    if (vistos.size !== (jug * (jug - 1)) / 2) { bergerBien = false; mal(`${jug} jugadores: faltan partidas`); }
    const nR = T.rondasTodos(t);
    for (const [id, b] of blancas) {
      const juega = jug % 2 ? nR - 1 : nR;
      if (Math.abs(b - (juega - b)) > 1) { bergerBien = false; mal(`${jug} jugadores: ${id} juega ${b} con blancas de ${juega}`); }
    }
  }
  if (bergerBien) bien("de 3 a 20 jugadores: cada uno juega con todos una vez y nadie pasa de una partida de diferencia entre blancas y negras");

  console.log("=== 5. Los desempates ===");
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "datos", "pareo-desempates.json"), "utf8"));
  const torneoDe = (c) => T.nuevo({ sistema: c.sistema, jugadores: c.jugadores.map((j) => Object.assign({ nombre: j.id }, j)), rondas: c.rondas });
  let fide = 0, fideMal = 0;
  for (const c of ref.casosFide2026) {
    const t = torneoDe(c);
    for (const [id, p] of Object.entries(c.puntaje)) if (T.puntos(t, id) !== p) { fideMal++; mal(`${c.nombre}: puntaje de ${id} = ${T.puntos(t, id)}, FIDE ${p}`); }
    for (const [cod, want] of Object.entries(c.esperado)) {
      const v = D.calcular(t, cod);
      for (const [id, w] of Object.entries(want)) {
        if (Math.abs(v[id] - w) < 1e-9) fide++;
        else { fideMal++; mal(`${c.nombre} ${cod} ${id}: ${v[id]}, FIDE ${w}`); }
      }
    }
  }
  if (!fideMal) bien(`${fide} valores de los casos del C.07:2026 (artículos 15.2, 16.2 a 16.5, 7.7 y 8.2-8.3)`);
  let iguales = 0, distintos = 0;
  for (const c of ref.azar) {
    const t = torneoDe(c);
    for (const { codigo } of D.CATALOGO) {
      const v = D.calcular(t, codigo);
      for (const j of c.jugadores) {
        if (Math.abs(v[j.id] - c.esperado[codigo][j.id]) < 1e-9) iguales++;
        else if (++distintos <= 10) mal(`referencia: ${codigo} de ${j.id} = ${v[j.id]}, chesspairing ${c.esperado[codigo][j.id]}`);
      }
    }
  }
  if (!distintos) bien(`${iguales} valores de ${D.CATALOGO.length} desempates en ${ref.azar.length} torneos al azar, iguales a chesspairing`);
  else mal(`${distintos} valores distintos de chesspairing`);

  // La clasificación ordena por puntos y después por los desempates EN EL ORDEN pedido.
  {
    const c = ref.azar.find((x) => x.sistema === "suizo" && x.jugadores.length > 8);
    const t = torneoDe(c);
    const filas = D.clasificacion(t, ["BH-C1", "SB"]);
    let orden = true;
    for (let i = 1; i < filas.length; i++) {
      const a = filas[i - 1], b = filas[i];
      const clave = (f) => [f.puntos, f.valores["BH-C1"], f.valores.SB];
      const ka = clave(a), kb = clave(b);
      const cmp = ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
      if (cmp < 0) orden = false;
      if (cmp === 0 && a.puesto !== b.puesto) orden = false;
      if (cmp > 0 && b.puesto !== i + 1) orden = false;
    }
    if (orden) bien("la clasificación ordena por puntos, BH-C1 y SB, y los empatados en todo comparten puesto");
    else mal("la clasificación no respeta el orden de los desempates");
  }

  console.log(fallos ? `\n${fallos} comprobaciones fallaron` : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
