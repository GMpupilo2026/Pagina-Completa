#!/usr/bin/env node
/* Que ninguna política nueva sobre una tabla que crece vuelva a preguntar el
 * permiso fila por fila.
 *
 * No necesita red ni la base: lee supabase/migraciones/.
 *
 * `soy_profesor_de(student_id)` o `bajo_mi_coordinacion(student_id)` en una
 * política se llaman UNA VEZ POR FILA, y cada llamada arma por dentro la misma
 * lista de alumnos. Con 7000 filas el informe se cayó por statement timeout
 * (ver «La RLS de las tablas de actividad arma el conjunto UNA vez» en
 * docs/decisiones/informes.md). La forma buena arma el conjunto una vez:
 *   student_id in (select interno.alumnos_de((select auth.uid())))
 *   student_id in (select interno.bajo_mi_coordinacion_conjunto())
 * Se pierde callado: la política escrita como siempre funciona perfecto y
 * solo se nota el día que la tabla crece.
 *
 * Mira las migraciones desde la que pasó cobros a conjuntos
 * (20261110140559_cobros_rls_conjunto_una_vez): cada create/alter policy sobre
 * una tabla de CRECEN no puede llamar a una de las funciones POR_FILA.
 * Las tablas chicas que no crecen con cada alumno (subgrupos, formularios…)
 * pueden seguir con la función: ahí no cuesta.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "supabase", "migraciones");
const DESDE = "20261110140559";

// Tablas que crecen con cada alumno, cada clase o cada mes.
const CRECEN = [
  "cobros", "recibos", "pagos", "avisos_cobro", "suscripciones", "cobros_contacto",
  "datos_facturacion", "cobros_recordatorios_programados",
  "training_progress", "training_state", "platform_activity_log", "class_attendance",
  "class_presence_log", "question_answers", "profiles", "formulario_respuestas",
  "tareas", "class_sessions",
];
// Las que preguntan sobre UNA persona: con una columna adentro, se llaman por fila.
const POR_FILA = [
  "bajo_mi_coordinacion", "soy_profesor_de", "es_mi_profesor", "supervisado_por_mi",
  "sesion_de_supervisado",
];

let fallos = 0;
const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && f.split("_")[0] >= DESDE).sort();
console.log("=== El permiso, como conjunto, en las tablas que crecen ===");
let revisadas = 0;
for (const f of archivos) {
  const sql = fs.readFileSync(path.join(DIR, f), "utf8").replace(/--.*$/gm, "");
  for (const m of sql.matchAll(/\b(create|alter)\s+policy\b[\s\S]*?;/gi)) {
    const tabla = ((m[0].match(/\bon\s+(?:public\.)?("?)(\w+)\1/i) || [])[2] || "").toLowerCase();
    if (!CRECEN.includes(tabla)) continue;
    revisadas += 1;
    const nombre = (m[0].match(/policy\s+("[^"]+"|\S+)/i) || [])[1];
    for (const fn of POR_FILA) {
      // La función con algo adentro: bajo_mi_coordinacion(student_id). Sin
      // argumentos (o el conjunto, que se llama distinto) no es por fila.
      if (new RegExp(`\\b${fn}\\s*\\(\\s*[^)\\s]`, "i").test(m[0])) {
        console.log(`  ✗ ${f}: la política ${nombre} de ${tabla} llama a ${fn}() fila por fila; va «columna in (select …conjunto)»`);
        fallos += 1;
      }
    }
  }
}
if (!fallos) console.log(`  ✓ ${revisadas} política(s) sobre tablas que crecen en ${archivos.length} migración(es), todas con el conjunto armado una vez`);
console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
