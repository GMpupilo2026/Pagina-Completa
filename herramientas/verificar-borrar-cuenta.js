#!/usr/bin/env node
/* Que borrar una cuenta no vuelva a fallar por una clave foránea.
 *
 * No necesita red ni la base: lee supabase/migraciones/.
 *
 * «Eliminar» en admin.html borra en auth.users, que cascadea a profiles. Si
 * una tabla apunta a profiles (o a auth.users) sin decir qué hacer al borrar,
 * la clave queda en NO ACTION y la base rechaza el borrado entero: el panel
 * solo dice «Database error deleting user». Se pierde callado: la tabla nueva
 * funciona perfecto hasta el día que alguien quiere borrar una cuenta que la
 * usó. La migración 20261004000748_borrar_cuenta_sin_trabas arregló las 23 que
 * había (ver «Borrar una cuenta» en docs/decisiones/permisos-y-roles.md).
 *
 * Mira esa migración y las POSTERIORES: cada `references profiles` o
 * `references auth.users` tiene que traer su `on delete` (cascade si la fila
 * es de la persona, set null si solo anota quién la hizo).
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "supabase", "migraciones");
const DESDE = "20261004000748";
let fallos = 0;

const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && f.split("_")[0] >= DESDE).sort();
console.log("=== Claves foráneas a una cuenta, con su on delete ===");
let claves = 0;
for (const f of archivos) {
  const sql = fs.readFileSync(path.join(DIR, f), "utf8").replace(/--.*$/gm, "");
  const re = /references\s+(?:public\.)?(?:"?profiles"?|auth\.users)\b\s*(?:\([^)]*\))?([^,;]*)/gi;
  for (const m of sql.matchAll(re)) {
    claves += 1;
    if (!/\bon\s+delete\b/i.test(m[1])) {
      const linea = sql.slice(0, m.index).split("\n").length;
      console.log(`  ✗ ${f}:${linea}: «${m[0].trim().slice(0, 70)}» no dice qué hacer al borrar la cuenta`);
      fallos += 1;
    }
  }
}
if (!fallos) console.log(`  ✓ ${claves} clave(s) en ${archivos.length} migración(es) desde ${DESDE}, todas con su on delete`);
console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
