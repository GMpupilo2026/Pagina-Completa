/* ===== Calibración del banco del diagnóstico con las respuestas reales =====
 *
 * Le pone a cada pregunta su dificultad en puntos Elo (`elo`) a partir de los
 * diagnósticos ya rendidos, y de ahí su escalón (`peso`). Es lo que convierte
 * el Elo que la gente declara al hacer el diagnóstico en una regla para medir:
 * si los de 1500 aciertan una pregunta casi siempre, esa pregunta NO es de
 * 1800 aunque alguien la haya escrito pensando que sí.
 *
 * El modelo es el de PlanEntrenamiento.medir() (misma curva que el Elo, con
 * azar 0,2 en las de opción) y se ajusta por turnos:
 *   1. la fuerza de cada persona, dadas las dificultades de ahora. Si declaró
 *      Elo, ese Elo es su punto de partida, con el margen de su origen (FIDE
 *      ± 100, en línea ± 250…): así la escala queda anclada al Elo de verdad.
 *      Sin Elo, parte de 1200 ± 500.
 *   2. la dificultad de cada pregunta, dadas esas fuerzas. Parte de `eloBase`
 *      —el rating de Lichess en las de tablero, o lo que decía su escalón
 *      original en las demás— con ± 250: una pregunta que contestaron dos
 *      personas casi no se mueve; una que contestaron treinta, sí.
 * Veinte vueltas alcanzan para que no cambie nada.
 *
 * `eloBase` no se toca nunca: volver a correr esto con más datos parte siempre
 * del mismo lugar, no del resultado anterior (si no, los mismos datos se
 * contarían dos veces).
 *
 * Quedan afuera los diagnósticos que no miden nada: menos de 20 respuestas, o
 * más del 80 % en «No lo sé» (hubo una tanda de pruebas con todo en blanco).
 *
 * Cómo se corre:
 *   1. Exportar de Supabase (con cualquier cliente con permiso de lectura):
 *        with d as (
 *          select detail det, (detail->'perfil'->>'elo')::int elo, detail->'perfil'->>'elo_tipo' tipo
 *            from training_progress where activity='diagnostico'
 *          union all select detalle, elo, elo_tipo from diagnosticos_publicos)
 *        select json_agg(json_build_object('elo',elo,'tipo',tipo,'v',det->>'version',
 *          'r',det->'respuestas','ns',coalesce(det->'nosabe','{}'::jsonb)))
 *        from d where (det->>'version')::int >= 3;
 *      y guardar el arreglo en un archivo FUERA del repositorio (son datos de
 *      personas: no se commitean).
 *   2. node herramientas/diagnostico-calibrar.js respuestas.json
 *
 * Reescribe `peso`, `elo` y `eloBase` en js/diagnostico-items.js e imprime un
 * informe: cuánto se movió cada pregunta y qué tan bien sigue la prueba al Elo
 * declarado.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const BANCO = path.join(RAIZ, "js/diagnostico-items.js");

global.window = {};
eval(fs.readFileSync(path.join(RAIZ, "js/plan-entrenamiento.js"), "utf8"));
eval(fs.readFileSync(BANCO, "utf8"));
const PE = global.window.PlanEntrenamiento;
const ITEMS = global.window.DIAGNOSTICO_ITEMS;

/* Lo que valía cada escalón ANTES de medir nada, para las preguntas escritas a
   mano: el punto de partida de su dificultad. */
const BASE_POR_PESO = { 1: 700, 2: 950, 3: 1200, 4: 1450, 5: 1700 };
const DESVIO_ITEM = 250;
/* Las preguntas de Lichess comparten además un CORRIMIENTO por tipo (uno para
   las de mover, otro para las de opción): cuánto se equivocó el descuento que
   les puso diagnostico-lichess.js al pasar del rating de Lichess a puntos Elo.
   Es un solo número que se estima con TODAS las respuestas a esas preguntas, y
   por eso se mueve con pocos diagnósticos; cada pregunta suelta, en cambio, la
   contestan una a tres personas y casi no se movería. Se vio en la primera
   calibración con la versión 5: el descuento se quedaba corto y la prueba
   sobrestimaba a los jugadores de club en 300-400 puntos. */
const DESVIO_CORRIMIENTO = 300;
const grupoDe = (it) => (it.lichess ? it.tipo : null);
const SIN_ELO = { media: 1200, desvio: 500 };
const VUELTAS = 20;

const entrada = process.argv[2];
if (!entrada) { console.error("Uso: node herramientas/diagnostico-calibrar.js respuestas.json"); process.exit(2); }
const crudo = JSON.parse(fs.readFileSync(entrada, "utf8"));

const porId = {};
ITEMS.forEach((i) => {
  porId[i.id] = i;
  i.eloAntes = i.elo;
  if (typeof i.eloBase !== "number") i.eloBase = BASE_POR_PESO[i.peso];
  i.elo = i.eloBase;
  i.resto = 0;   // lo que la pregunta se aparta de su grupo
});
const corrimiento = { jugada: 0, opcion_tablero: 0 };

const personas = crudo.map((c) => {
  const r = {};
  Object.keys(c.r || {}).forEach((id) => { if (porId[id]) r[id] = c.r[id] === true; });
  const n = Object.keys(r).length;
  const ns = Object.keys(c.ns || {}).length;
  const elo = PE.eloValido(c.elo);
  const tipo = PE.ELO_TIPO_POR_ID[c.tipo] ? c.tipo : "estimado";
  return { r, n, ns, elo, tipo, v: c.v, partida: elo ? { media: elo, desvio: PE.ELO_TIPO_POR_ID[tipo].desvio } : SIN_ELO };
}).filter((p) => p.n >= 20 && p.ns / p.n <= 0.8);

const respondidas = {};
personas.forEach((p, k) => Object.keys(p.r).forEach((id) => { (respondidas[id] = respondidas[id] || []).push(k); }));

for (let v = 0; v < VUELTAS; v++) {
  personas.forEach((p) => { p.fuerza = PE.medir(ITEMS.filter((i) => i.id in p.r), p.r, p.partida).elo; });
  // 1. El corrimiento de cada grupo de Lichess, con todas sus respuestas juntas.
  Object.keys(corrimiento).forEach((g) => {
    const ids = Object.keys(respondidas).filter((id) => grupoDe(porId[id]) === g);
    if (!ids.length) return;
    let mejor = corrimiento[g], max = -Infinity;
    for (let d = -600; d <= 1000; d += 10) {
      let lp = -0.5 * Math.pow(d / DESVIO_CORRIMIENTO, 2);
      ids.forEach((id) => {
        const it = porId[id];
        const b = it.eloBase + d + it.resto, c = PE.azarDe(it);
        respondidas[id].forEach((k) => {
          const p = PE.probabilidad(personas[k].fuerza, b, c);
          lp += Math.log(personas[k].r[id] ? p : 1 - p);
        });
      });
      if (lp > max) { max = lp; mejor = d; }
    }
    corrimiento[g] = mejor;
  });
  // 2. Cada pregunta, partiendo de su base (más el corrimiento de su grupo).
  Object.keys(respondidas).forEach((id) => {
    const it = porId[id];
    const c = PE.azarDe(it);
    const centro = it.eloBase + (grupoDe(it) ? corrimiento[grupoDe(it)] : 0);
    let mejor = centro, max = -Infinity;
    for (let b = 100; b <= 3200; b += 10) {
      let lp = -0.5 * Math.pow((b - centro) / DESVIO_ITEM, 2);
      respondidas[id].forEach((k) => {
        const p = PE.probabilidad(personas[k].fuerza, b, c);
        lp += Math.log(personas[k].r[id] ? p : 1 - p);
      });
      if (lp > max) { max = lp; mejor = b; }
    }
    it.elo = mejor;
    it.resto = mejor - centro;
  });
}
// Las de Lichess que nadie contestó también llevan el corrimiento de su grupo.
ITEMS.forEach((it) => { if (grupoDe(it) && !respondidas[it.id]) it.elo = it.eloBase + corrimiento[grupoDe(it)]; });

/* ---------- se escribe en el banco ---------- */
let texto = fs.readFileSync(BANCO, "utf8");
let cambiados = 0;
texto = texto.replace(/(id: '([^']+)', area: '[^']+', )peso: \d,( elo: -?\d+, eloBase: -?\d+,)?/g, (todo, cab, id) => {
  const it = porId[id];
  if (!it) return todo;
  const peso = PE.escalonDeElo(it.elo);
  if (peso !== it.peso) cambiados += 1;
  return `${cab}peso: ${peso}, elo: ${Math.round(it.elo)}, eloBase: ${Math.round(it.eloBase)},`;
});
fs.writeFileSync(BANCO, texto);

/* ---------- informe ---------- */
const movidas = Object.keys(respondidas).map((id) => ({ id, n: respondidas[id].length, de: porId[id].eloBase, a: porId[id].elo }))
  .sort((x, y) => Math.abs(y.a - y.de) - Math.abs(x.a - x.de));
console.log(`Diagnósticos que cuentan: ${personas.length} (${personas.filter((p) => p.elo).length} con Elo declarado).`);
console.log(`Preguntas con respuestas: ${movidas.length} de ${ITEMS.length}. Cambiaron de escalón: ${cambiados}.`);
console.log(`Corrimiento de las preguntas de Lichess: ${corrimiento.jugada >= 0 ? "+" : ""}${corrimiento.jugada} las de mover, ${corrimiento.opcion_tablero >= 0 ? "+" : ""}${corrimiento.opcion_tablero} las de opción.`);
console.log("\nLas que más se movieron:");
movidas.slice(0, 15).forEach((m) => console.log(`  ${m.id.padEnd(32)} ${String(m.n).padStart(3)} resp.  ${m.de} → ${m.a}`));

/* Qué tan bien sigue la prueba al Elo declarado: la fuerza SOLO por la
   prueba (sin el Elo como punto de partida) contra el Elo. Ojo: son las mismas
   personas con que se calibró, así que es una cota optimista. */
function pearson(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sx += (x - mx) ** 2; sy += (ys[i] - my) ** 2; });
  return sxy / Math.sqrt(sx * sy);
}
/* Cuánto se aparta la prueba del Elo declarado, por versión: con las
   dificultades de antes de esta calibración y con las de ahora. */
["3", "4", "5"].forEach((v) => {
  const grupo = personas.filter((p) => p.elo && String(p.v) === v);
  if (!grupo.length) return;
  const sesgo = (clave) => Math.round(grupo.reduce((s, p) => {
    const items = ITEMS.filter((i) => i.id in p.r).map((i) => Object.assign({}, i, { elo: i[clave] }));
    return s + PE.medir(items, p.r).elo - p.elo;
  }, 0) / grupo.length);
  console.log(`Versión ${v} (${grupo.length} con Elo): la prueba se aparta del Elo en ${sesgo("eloAntes")} puntos antes de calibrar y ${sesgo("elo")} después, en promedio.`);
});
const conElo = personas.filter((p) => p.elo);
if (conElo.length >= 5) {
  const solo = conElo.map((p) => PE.medir(ITEMS.filter((i) => i.id in p.r), p.r));
  const pct = conElo.map((p) => Object.values(p.r).filter(Boolean).length / p.n);
  console.log(`\nCorrelación con el Elo declarado (${conElo.length} personas):`);
  console.log(`  porcentaje de aciertos: ${pearson(pct, conElo.map((p) => p.elo)).toFixed(2)}`);
  console.log(`  fuerza medida por la prueba: ${pearson(solo.map((s) => s.elo), conElo.map((p) => p.elo)).toFixed(2)}`);
  conElo.map((p, k) => ({ elo: p.elo, tipo: p.tipo, pct: Math.round(pct[k] * 100), m: solo[k] }))
    .sort((a, b) => a.elo - b.elo)
    .forEach((x) => console.log(`  Elo ${String(x.elo).padStart(4)} (${x.tipo.padEnd(8)}) ${String(x.pct).padStart(3)} % → prueba ≈${x.m.elo} ± ${x.m.error}`));
}
