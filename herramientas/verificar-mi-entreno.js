#!/usr/bin/env node
/* Que los tres números de «Tu progreso» (clases.html) se cuenten igual que en
 * Informes.
 *
 * No necesita red ni la base: lee supabase/migraciones/ y js/clases.js.
 *
 * El panel del alumno pedía sus tres números a informes_resumen_alumnos(), que
 * arma el renglón de todo el grupo para usar uno: 7 s en hora pico, y con la
 * base cargada se cortaba y el panel se quedaba en «Cargando tu panel…». Ahora
 * los pide a mi_entreno_resumen(), que cuenta solo esos tres de una persona.
 *
 * Son dos copias de las mismas tres cuentas, y eso se separa callado: si un
 * día Informes cuenta los puzzles de otra forma, el panel sigue mostrando un
 * número perfectamente creíble y distinto. Por eso se exige que las tres
 * expresiones estén, tal cual, en la última versión de cada función.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DIR = path.join(RAIZ, "supabase", "migraciones");
let fallos = 0;
const bien = (t) => console.log("  ✓ " + t);
const mal = (t) => { console.log("  ✗ " + t); fallos += 1; };

const plano = (t) => t.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();

// La última migración que (re)define la función, sin comentarios y en una línea.
function ultimaDefinicion(nombre) {
  const re = new RegExp("create\\s+or\\s+replace\\s+function\\s+public\\." + nombre + "\\s*\\(", "i");
  const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  let ultima = null;
  for (const f of archivos) {
    const sql = fs.readFileSync(path.join(DIR, f), "utf8");
    const m = sql.search(re);
    if (m < 0) continue;
    // El cuerpo va entre el primer par de $$ (o $function$) después del create.
    const resto = sql.slice(m);
    const cuerpo = resto.match(/\$(\w*)\$([\s\S]*?)\$\1\$/);
    ultima = { archivo: f, cuerpo: plano(cuerpo ? cuerpo[2] : resto) };
  }
  return ultima;
}

const CUENTAS = [
  ["los puzzles 4×4", "count(distinct tp.detail->>'puzzle_id') filter (where tp.activity = '4x4' and coalesce(tp.detail->>'puzzle_id', '') <> '')::int"],
  ["las lecciones", "count(distinct tp.detail->>'lesson_id') filter (where tp.activity = 'aprender' and coalesce(tp.detail->>'lesson_id', '') <> '')::int"],
  ["la mejor marca de Coordenadas", "coalesce(max(case when tp.activity = 'coordenadas' and jsonb_typeof(tp.detail->'score') = 'number' then (tp.detail->>'score')::numeric end), 0)::int"],
];

console.log("=== mi_entreno_resumen() cuenta igual que informes_resumen_alumnos() ===");
const informes = ultimaDefinicion("informes_resumen_alumnos");
const mia = ultimaDefinicion("mi_entreno_resumen");
if (!informes) mal("no encontré ninguna migración que defina informes_resumen_alumnos()");
if (!mia) mal("no encontré ninguna migración que defina mi_entreno_resumen()");
if (informes && mia) {
  for (const [nombre, expr] of CUENTAS) {
    const e = plano(expr);
    const enInformes = informes.cuerpo.includes(e);
    const enMia = mia.cuerpo.includes(e);
    if (enInformes && enMia) bien(`${nombre}: la misma cuenta en las dos`);
    else mal(`${nombre} se cuenta distinto: ${enInformes ? "" : informes.archivo + " no la trae tal cual; "}${enMia ? "" : mia.archivo + " no la trae tal cual; "}si cambió en una, va en las dos (y aquí)`);
  }
  // Las tres actividades del where: sin una, su número sale siempre en cero.
  for (const act of ["'4x4'", "'aprender'", "'coordenadas'"]) {
    if (/tp\.activity in \(([^)]*)\)/.test(mia.cuerpo) && mia.cuerpo.match(/tp\.activity in \(([^)]*)\)/)[1].includes(act)) bien(`mi_entreno_resumen() lee la actividad ${act}`);
    else mal(`mi_entreno_resumen() no lee la actividad ${act}: ese número saldría siempre en cero`);
  }
  if (/security\s+definer/i.test(fs.readFileSync(path.join(DIR, mia.archivo), "utf8"))) mal("mi_entreno_resumen() es SECURITY DEFINER: quién ve a quién lo tiene que decidir la RLS");
  else bien("mi_entreno_resumen() es SECURITY INVOKER: la RLS decide qué se cuenta");
}

console.log("\n=== El panel pide sus números a la función liviana ===");
const js = fs.readFileSync(path.join(RAIZ, "js", "clases.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
if (/rpc\(\s*["']mi_entreno_resumen["']/.test(js)) bien("clases.js llama a mi_entreno_resumen()");
else mal("clases.js no llama a mi_entreno_resumen()");
if (/rpc\(\s*["']informes_resumen_alumnos["']/.test(js)) mal("clases.js volvió a llamar a informes_resumen_alumnos(): arma el renglón de todo el grupo para usar uno");
else bien("y no a informes_resumen_alumnos()");

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
