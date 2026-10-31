#!/usr/bin/env node
/* Que los proyectos de IA de herramientas/ia/ no saquen datos de personas.
 *
 * No necesita red ni la base: lee los archivos y lo que git tiene.
 *
 * Los modelos se entrenan con exportaciones de la base que, aunque salgan
 * anónimas, son de alumnos, muchos menores de edad. Se puede escapar callado
 * por tres lados (ver «Los datos para entrenar no salen de la máquina» en
 * docs/decisiones/ia.md):
 *   1. Un cuaderno commiteado DESPUÉS de correrlo: las salidas (la tabla de
 *      datos.head(), un gráfico) viajan dentro del .ipynb.
 *   2. El CSV exportado commiteado por error: herramientas/ia/datos/ tiene que
 *      estar en .gitignore y nada de ahí puede estar en git.
 *   3. Una consulta de exportación que devuelva una columna que identifica
 *      (id, nombre, correo, una fecha exacta): cada *-exportar.sql dice qué
 *      columnas saca y solo pueden ser las de su lista.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const DIR = path.join(RAIZ, "herramientas", "ia");
let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

/* Las columnas que puede sacar cada exportación. Una nueva se agrega aquí a
   conciencia, después de pensar si dice quién es la persona. */
const COLUMNAS = {
  "abandono-exportar.sql": [
    "alumno", "corte", "dias_activos_28", "dias_activos_7", "dias_sin_venir",
    "dias_desde_la_primera", "ejercicios_28", "ejercicios_7", "clases_28",
    "minutos_tarde_prom", "tareas_28", "cobros_atrasados", "elo", "con_profe",
    "se_callo",
  ],
};

console.log("=== Los cuadernos van sin salidas ===");
const cuadernos = fs.readdirSync(DIR).filter((f) => f.endsWith(".ipynb"));
if (!cuadernos.length) mal("no hay ningún cuaderno en herramientas/ia/");
for (const f of cuadernos) {
  const nb = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  const conSalida = nb.cells.filter((c) => c.cell_type === "code"
    && ((c.outputs || []).length || c.execution_count != null));
  if (conSalida.length) mal(`${f}: ${conSalida.length} celda(s) con salidas; se commitea limpio (Kernel → Restart & Clear Output)`);
  else bien(`${f}: ${nb.cells.length} celdas, ninguna con salidas`);
}

console.log("=== Los datos exportados no entran a git ===");
const ignorado = (() => {
  try {
    execFileSync("git", ["check-ignore", "-q", "herramientas/ia/datos/x.csv"], { cwd: RAIZ });
    return true;
  } catch { return false; }
})();
if (ignorado) bien("herramientas/ia/datos/ está en .gitignore");
else mal("herramientas/ia/datos/ no está en .gitignore");
const enGit = execFileSync("git", ["ls-files", "herramientas/ia"], { cwd: RAIZ, encoding: "utf8" })
  .split("\n").filter(Boolean);
const datos = enGit.filter((f) => f.startsWith("herramientas/ia/datos/") || /\.(csv|tsv|xlsx|parquet|pkl|joblib)$/i.test(f));
if (datos.length) datos.forEach((f) => mal(`${f} está en git: son datos de alumnos`));
else bien(`ningún archivo de datos en git (${enGit.length} archivo(s) en herramientas/ia/)`);

console.log("=== Las exportaciones salen anónimas ===");
const consultas = fs.readdirSync(DIR).filter((f) => f.endsWith("-exportar.sql"));
for (const f of consultas) {
  const permitidas = COLUMNAS[f];
  if (!permitidas) { mal(`${f}: no tiene su lista de columnas en COLUMNAS de este verificador`); continue; }
  const sql = fs.readFileSync(path.join(DIR, f), "utf8").replace(/--.*$/gm, "");
  /* El último select de primer nivel: desde el último «select» que está al
     principio de una línea hasta su «from». */
  const ultimo = [...sql.matchAll(/^select\b([\s\S]*?)^from\b/gim)].pop();
  if (!ultimo) { mal(`${f}: no encuentro el select final`); continue; }
  /* Cada columna es lo que va antes de la coma de primer nivel; su nombre,
     el alias del final. */
  const cuerpo = ultimo[1];
  const partes = [];
  let nivel = 0, actual = "";
  for (const ch of cuerpo) {
    if (ch === "(") nivel += 1;
    if (ch === ")") nivel -= 1;
    if (ch === "," && nivel === 0) { partes.push(actual); actual = ""; } else actual += ch;
  }
  partes.push(actual);
  const nombres = partes.map((p) => p.trim()).filter(Boolean)
    .map((p) => (p.match(/([a-z_][a-z0-9_]*)\s*$/i) || [])[1]);
  const sobran = nombres.filter((n) => !permitidas.includes(n));
  if (sobran.length) mal(`${f}: saca columna(s) que no están en su lista: ${sobran.join(", ")}`);
  else bien(`${f}: ${nombres.length} columnas, todas de su lista`);
}

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
