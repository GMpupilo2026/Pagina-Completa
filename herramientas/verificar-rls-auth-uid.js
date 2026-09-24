#!/usr/bin/env node
/* Que ninguna política nueva vuelva a llamar a auth.uid() suelto.
 *
 * No necesita red ni la base: lee supabase/migraciones/.
 *
 * `auth.uid()` suelto en una política se evalúa UNA VEZ POR FILA; envuelto,
 * `(select auth.uid())`, una vez por consulta. La migración
 * 20260924134346_rls_auth_uid_una_vez_por_consulta envolvió las 150 que
 * había. Se pierde callado: una política nueva escrita como siempre funciona
 * perfecto y solo se nota el día que la tabla crece y el informe se cae por
 * statement timeout (ver «`auth.uid()` va envuelto» en docs/decisiones/informes.md).
 *
 * Mira las migraciones POSTERIORES a esa: cada create/alter policy tiene que
 * traer auth.uid() dentro de un select.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "supabase", "migraciones");
const DESDE = "20260924134346";
let fallos = 0;

const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && f.split("_")[0] > DESDE).sort();
console.log("=== auth.uid() en las políticas nuevas ===");
let politicas = 0;
for (const f of archivos) {
  const sql = fs.readFileSync(path.join(DIR, f), "utf8").replace(/--.*$/gm, "");
  for (const m of sql.matchAll(/\b(create|alter)\s+policy\b[\s\S]*?;/gi)) {
    politicas += 1;
    const suelto = m[0].replace(/\(\s*select\s+auth\.uid\(\)\s*(as\s+\w+\s*)?\)/gi, "").match(/auth\.uid\(\)/i);
    if (suelto) {
      const nombre = (m[0].match(/policy\s+("[^"]+"|\S+)/i) || [])[1];
      console.log(`  ✗ ${f}: la política ${nombre} llama a auth.uid() suelto; va (select auth.uid())`);
      fallos += 1;
    }
  }
}
if (!fallos) console.log(`  ✓ ${politicas} política(s) en ${archivos.length} migración(es) posteriores, todas con (select auth.uid())`);
console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
