#!/usr/bin/env node
/* Que los formularios que se llenan SIN cuenta sigan pasando por el freno.
 *
 * No necesita navegador, ni red, ni la base: lee supabase/migraciones/.
 *
 * responder_formulario, registrar_arbitraje_publico y solicitar_academia las
 * puede llamar cualquiera con la clave pública del HTML, y cada llamada es una
 * fila nueva. Desde 20260924122318_freno_envios_publicos llaman a
 * interno.frenar_envio_publico() antes de insertar. Se pierde callado: basta
 * con que una migración futura vuelva a crear una de las tres copiando su
 * versión vieja para que el freno desaparezca, y los formularios se sigan
 * viendo y enviando exactamente igual.
 *
 * Mira la ÚLTIMA migración que define cada una (la que vale en la base) y
 * comprueba que llame al freno, que lo llame antes del insert, y que se haga
 * caso de lo que devuelve.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "supabase", "migraciones");
const FUNCIONES = ["responder_formulario", "registrar_arbitraje_publico", "solicitar_academia"];
let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

console.log("=== Freno de los envíos sin cuenta ===");
for (const fn of FUNCIONES) {
  const inicio = new RegExp("create\\s+or\\s+replace\\s+function\\s+public\\." + fn + "\\s*\\(", "i");
  let ultima = null;
  let cuerpo = null;
  for (const f of archivos) {
    const sql = fs.readFileSync(path.join(DIR, f), "utf8");
    const m = sql.match(inicio);
    if (!m) continue;
    // El cuerpo va entre el primer par de delimitadores $algo$ después del nombre.
    const resto = sql.slice(m.index);
    const d = resto.match(/as\s+(\$[a-z_]*\$)/i);
    if (!d) continue;
    const desde = resto.indexOf(d[1]) + d[1].length;
    const hasta = resto.indexOf(d[1], desde);
    ultima = f;
    cuerpo = resto.slice(desde, hasta);
  }
  if (!ultima) { mal(fn + ": ninguna migración la define"); continue; }

  const freno = cuerpo.search(/interno\.frenar_envio_publico\s*\(/);
  const insert = cuerpo.search(/insert\s+into/i);
  if (freno < 0) mal(`${fn} (${ultima}): no llama a interno.frenar_envio_publico()`);
  else if (insert >= 0 && freno > insert) mal(`${fn} (${ultima}): llama al freno DESPUÉS del insert`);
  else if (!/freno\s+is\s+not\s+null/i.test(cuerpo)) mal(`${fn} (${ultima}): llama al freno pero no mira lo que devuelve`);
  else bien(`${fn}: pasa por el freno antes de guardar (${ultima})`);
}

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: los tres envíos sin cuenta pasan por el freno.");
process.exit(fallos ? 1 : 0);
