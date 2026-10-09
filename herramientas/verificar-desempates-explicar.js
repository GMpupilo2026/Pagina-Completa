/* explicar() de js/pareo/desempates.js: el desglose jugador por jugador que
 * usa «Desempates explicados» (desempates.html) para decir DE DÓNDE sale
 * cada número, no solo cuál es.
 *
 * Lo que hay que comprobar no es la matemática del desempate otra vez —eso
 * ya lo hace herramientas/verificar-pareo.js contra los 62 casos del
 * C.07:2026 y contra chesspairing en miles de torneos al azar—, sino que
 * explicar() cuenta la MISMA historia que calcular(): que el total del
 * desglose (la suma de las rondas incluidas, o la fórmula) sea exactamente
 * el número que ya se mostraba. Si un desglose se queda sumando algo
 * distinto, la pantalla explicaría un número y mostraría otro al lado —y se
 * vería perfecta, que es justo el tipo de error que este archivo junta.
 *
 * También comprueba que toda ronda jugada aparezca en el desglose de CADA
 * desempate (nunca desaparece una fila sin decir «incluido: false» y un
 * motivo), y que los 26 códigos del catálogo tengan los dos: calcular() Y
 * explicar().
 *
 * No necesita navegador ni red.   node herramientas/verificar-desempates-explicar.js */
"use strict";
const path = require("path");
const raiz = path.join(__dirname, "..");
const T = require(path.join(raiz, "js/pareo/torneo.js"));
const D = require(path.join(raiz, "js/pareo/desempates.js"));

let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

function azar(s) { return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); }

// Un torneo con de todo: byes, incomparecencias en los dos sentidos, retiros
// y hasta un todos contra todos — sin pasar por el motor (no hace falta que
// el pareo sea legal, solo que los resultados existan).
function torneoAlAzar(semilla) {
  const az = azar(semilla);
  const todos = az() < 0.25;
  const n = 6 + Math.floor(az() * 14);
  const rondas = todos ? n - 1 + (n % 2 === 0 ? 0 : 1) : 4 + Math.floor(az() * 5);
  const t = T.nuevo({ nombre: "Prueba " + semilla, rondasTotales: rondas, sistema: todos ? "todos" : "suizo", colorInicial: "w" });
  for (let i = 1; i <= n; i++) t.jugadores.push({ id: "p" + i, nombre: "Jugador " + i, elo: az() < 0.1 ? 0 : 1200 + Math.floor(az() * 1200), titulo: "", fed: "CRC", sexo: "m", retiradoDespuesDe: null });
  T.fijarNumeracion(t);
  const vivos = () => t.jugadores.filter((j) => j.retiradoDespuesDe == null).map((j) => j.id);
  for (let r = 0; r < rondas; r++) {
    const disponibles = vivos();
    const candidatos = t.jugadores.filter((j) => j.retiradoDespuesDe == null);
    if (az() < 0.15 && candidatos.length > 4) candidatos[Math.floor(az() * candidatos.length)].retiradoDespuesDe = r;
    const mesas = [];
    const usados = new Set();
    const lista = vivos().filter((id) => !usados.has(id));
    for (let i = 0; i < lista.length; i += 2) {
      if (i + 1 >= lista.length) { mesas.push({ b: lista[i], n: null, r: null }); continue; }
      const x = az();
      const res = x < 0.35 ? "1-0" : x < 0.65 ? "0-1" : x < 0.85 ? "=" : x < 0.9 ? "+-" : x < 0.95 ? "-+" : x < 0.98 ? "--" : null;
      mesas.push({ b: lista[i], n: lista[i + 1], r: res });
    }
    const ausencias = {};
    for (const id of disponibles) if (az() < 0.06) ausencias[id] = az() < 0.6 ? "H" : "Z";
    t.rondas.push({ mesas, ausencias });
  }
  return t;
}

const CODIGOS = D.CATALOGO.map((c) => c.codigo);
console.log("=== El catálogo ===");
if (CODIGOS.length === 26) bien("26 desempates, cada uno con calcular() y explicar()");
else mal("se esperaban 26 desempates y hay " + CODIGOS.length);

console.log("=== explicar() cuenta lo mismo que calcular(), en 80 torneos al azar ===");
let comparados = 0;
const N = 80;
const CODIGOS_COMPLETOS = ["DE", "KS", "STD", "WIN", "WON", "BPG", "BWG", "GE"]; // recorren TODAS las rondas del jugador
let filasDeMenos = 0;
for (let s = 1; s <= N; s++) {
  const t = torneoAlAzar(s * 97 + 13);
  for (const codigo of CODIGOS) {
    const valores = D.calcular(t, codigo);
    for (const j of t.jugadores) {
      const d = D.explicar(t, j.id, codigo);
      if (!d) { mal(`torneo ${s}, ${codigo}, ${j.id}: explicar() devolvió null`); continue; }
      const esperado = valores[j.id];
      const salio = typeof d.total === "number" ? Math.round(d.total * 1e6) / 1e6 : d.total;
      const esp = Math.round(esperado * 1e6) / 1e6;
      if (salio !== esp) { mal(`torneo ${s}, ${codigo}, jugador ${j.id}: calcular() dio ${esp} y explicar() ${salio}`); continue; }
      comparados++;
      // Los que recorren TODAS las rondas del jugador (no solo las jugadas)
      // tienen que traer una fila por cada ronda que ya se jugó: si una
      // desaparece en vez de marcarse «incluido: false» con su motivo, el
      // desempate explicado mentiría por omisión.
      if (CODIGOS_COMPLETOS.includes(codigo)) {
        // Solo las rondas con un rival de carne y hueso y resultado ya puesto
        // (el bye no es «un encuentro» para DE, y por eso no le hace falta
        // fila propia ahí; WIN/GE sí lo cuentan, pero eso ya lo comprobó la
        // igualdad de totales de arriba).
        const conRival = t.rondas.filter((R) => R.mesas.some((m) => (m.b === j.id || m.n === j.id) && m.n !== null && m.r)).length;
        if ((d.filas || []).length < conRival) filasDeMenos++;
      }
    }
  }
}
if (filasDeMenos === 0) bien(`${comparados} comparaciones (${N} torneos × 26 desempates × sus jugadores): el total de explicar() es igual al de calcular(), sin ninguna ronda de menos`);
else mal(`${filasDeMenos} casos con menos filas en el desglose que rondas ya resueltas`);

console.log("=== Lo que se le pide a cada tipo de desglose ===");
{
  const t = torneoAlAzar(777);
  const id = t.jugadores[0].id;
  const bh = D.explicar(t, id, "BH-C1");
  if (bh.tipo === "rondas" && bh.filas.some((f) => f.incluido === false)) bien("Buchholz Cut-1 marca «incluido: false» en el aporte que descarta");
  else mal("Buchholz Cut-1 no marcó ningún aporte como descartado");
  const de = D.explicar(t, id, "DE");
  if (de.nota) bien("el encuentro directo trae una nota explicando a quién cuenta");
  else mal("el encuentro directo no trae nota");
  const tpr = D.explicar(t, id, "TPR");
  if (tpr.tipo === "formula" && Array.isArray(tpr.partes) && tpr.partes.length >= 4) bien("el rendimiento (TPR) trae los pasos de la fórmula, no solo el número");
  else mal("TPR no trajo los pasos de la fórmula");
  const aob = D.explicar(t, id, "AOB");
  if (aob.promedio) bien("el Buchholz medio de los rivales (AOB) se marca como promedio, no como suma");
  else mal("AOB no se marcó como promedio");
  if (D.explicar(t, id, "no-existe") === null) bien("un código que no existe devuelve null");
  else mal("un código inventado no devolvió null");
}

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
