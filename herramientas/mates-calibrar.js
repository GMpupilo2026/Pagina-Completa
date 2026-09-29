/* ===== Calibración de la dificultad de los Mates con los intentos reales =====
 *
 * Los 2455 mates salen del libro de Polgár y no traen dificultad (ver «Mates:
 * de dónde salen y por qué no tienen dificultad»). La dificultad no se pone a
 * ojo: se mide con lo que pasó de verdad. Cada mate que un alumno resuelve por
 * primera vez queda en training_progress (activity = 'mates') con `limpio`
 * (sin error y sin pista, desde #491), y la fuerza del alumno se sabe por su
 * diagnóstico o por el Elo de su perfil. Con eso, herramientas/lib/mates-ajuste.js
 * le pone a cada mate su dificultad en puntos Elo (el modelo y el porqué están
 * ahí).
 *
 * Escribe entreno/data/mates-dificultad.json, que es SOLO agregado (la
 * dificultad de cada mate con MINIMO intentos o más, y el centro de cada
 * categoría). La página de Mates ordena una categoría por dificultad cuando
 * esa categoría tiene calibrados al menos el 80 % de sus mates; antes, la
 * baraja por bloques con la semilla de cada alumno. No se edita a mano.
 *
 * Cómo se corre:
 *   1. Exportar de Supabase (con cualquier cliente con permiso de lectura):
 *        with ultimo as (
 *          select distinct on (student_id) student_id,
 *                 (detail->'medicion'->>'elo')::int medido, (detail->'medicion'->>'error')::int error
 *            from training_progress
 *           where activity = 'diagnostico' and detail ? 'medicion'
 *           order by student_id, created_at desc),
 *        quienes as (
 *          select p.id, u.medido, u.error, p.elo, p.elo_tipo tipo,
 *                 row_number() over (order by p.id) k
 *            from profiles p left join ultimo u on u.student_id = p.id
 *           where p.id in (select student_id from training_progress
 *                           where activity = 'mates' and detail ? 'limpio'))
 *        select json_build_object(
 *          'alumnos', (select json_agg(json_build_object('k', k, 'medido', medido, 'error', error, 'elo', elo, 'tipo', tipo)) from quienes),
 *          'intentos', (select json_agg(json_build_object('k', q.k, 'id', tp.detail->>'puzzle_id',
 *                                                          'limpio', (tp.detail->>'limpio')::boolean) order by tp.created_at)
 *                         from training_progress tp join quienes q on q.id = tp.student_id
 *                        where tp.activity = 'mates' and tp.detail ? 'limpio'));
 *      y guardar el objeto en un archivo FUERA del repositorio (son datos de
 *      personas: no se commitean).
 *   2. node herramientas/mates-calibrar.js intentos.json
 *   3. node herramientas/verificar-todo.js mates-calibrar mates-dificultad
 *
 * Conviene volver a correrlo cada vez que se junten unos cuantos miles de
 * intentos nuevos: cada vez parte de cero (del centro de cada categoría), no
 * del resultado anterior, así que los mismos datos nunca se cuentan dos veces.
 */
const fs = require("fs");
const path = require("path");
const { ajustar, publicar } = require("./lib/mates-ajuste");

const RAIZ = path.join(__dirname, "..");
const SALIDA = path.join(RAIZ, "entreno/data/mates-dificultad.json");
/* Con menos intentos, la dificultad de un mate es casi la de su categoría: la
   prueba con datos inventados (verificar-mates-calibrar.js) muestra que con 8
   ya sigue a la de verdad. */
const MINIMO = 8;

const entrada = process.argv[2];
if (!entrada) { console.error("Uso: node herramientas/mates-calibrar.js intentos.json"); process.exit(2); }
if (path.resolve(entrada).startsWith(RAIZ + path.sep)) {
  console.error("El archivo exportado tiene datos de personas: guárdalo fuera del repositorio.");
  process.exit(2);
}
const datos = JSON.parse(fs.readFileSync(entrada, "utf8"));

const total = {};
const existen = new Set();
JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/mates.json"), "utf8"))
  .forEach((p) => { total[p.category] = (total[p.category] || 0) + 1; existen.add(p.id); });

const ajuste = ajustar(datos);
const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
const salida = publicar(ajuste, total, MINIMO, hoy);
fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 1) + "\n");

console.log(`Intentos que cuentan: ${salida.intentos}, de ${salida.alumnos} alumnos.`);
Object.keys(salida.categorias).forEach((cat) => {
  const c = salida.categorias[cat];
  const pct = c.total ? Math.round(100 * c.calibrados / c.total) : 0;
  console.log(`  ${cat}: centro ${c.centro}, ${c.calibrados} de ${c.total} calibrados (${pct} %)${pct >= 80 ? " → la página la ordena por dificultad" : ""}`);
});
const conteo = {};
Object.values(ajuste.mates).forEach((m) => { const n = m.intentos.length; conteo[n >= MINIMO ? "listos" : n] = (conteo[n >= MINIMO ? "listos" : n] || 0) + 1; });
console.log(`Mates con al menos ${MINIMO} intentos: ${conteo.listos || 0}. Los demás, por cantidad de intentos: ` +
  Object.keys(conteo).filter((k) => k !== "listos").map((k) => `${k}: ${conteo[k]}`).join(", "));
const ids = Object.keys(salida.elo).sort((a, b) => salida.elo[a] - salida.elo[b]);
if (ids.length) {
  console.log(`\nLos más fáciles: ${ids.slice(0, 5).map((id) => `${id} (${salida.elo[id]})`).join(", ")}`);
  console.log(`Los más difíciles: ${ids.slice(-5).map((id) => `${id} (${salida.elo[id]})`).join(", ")}`);
  const fuera = ids.filter((id) => !existen.has(id));
  if (fuera.length) console.log(`Ojo: ${fuera.length} mates que ya no están en mates.json.`);
}
console.log(`\nEscrito ${path.relative(RAIZ, SALIDA)}.`);
