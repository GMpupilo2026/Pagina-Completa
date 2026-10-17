#!/usr/bin/env node
/* Que el tablero de la clase siga cerrado al alumno, columna por columna.
 *
 * No necesita red ni la base: lee supabase/migraciones/ y js/sesion.js.
 *
 * protect_game_state_teacher_columns() le devuelve al alumno, una por una, las
 * columnas de game_state que solo pone el profe (flechas, vista, presentación,
 * planilla…). Cada función nueva se escribe con `create or replace` y la lista
 * ENTERA: si una migración se escribió antes de que otra sumara una columna y
 * se aplica después, reemplaza la función y esa columna se le vuelve a abrir al
 * alumno sin ningún error. Pasó casi el 17/10: clase_dos_alumnos_juegan se
 * escribió el 3/10 y no traía presentacion ni planilla (ver «Dos alumnos juegan
 * en el tablero de la clase» en docs/decisiones/clase-en-vivo.md).
 *
 * 1. Cada versión de la función protege todo lo que protegía la anterior.
 * 2. Con un solo color la base deja jugar de a una jugada: la pantalla no le
 *    ofrece «Deshacer» la jugada del otro ni «Jugar desde aquí».
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DIR = path.join(RAIZ, "supabase", "migraciones");
let fallos = 0;
const mal = (m) => { console.log(`  ✗ ${m}`); fallos++; };
const bien = (m) => console.log(`  ✓ ${m}`);

console.log("=== Las columnas que protege protect_game_state_teacher_columns ===");
const versiones = [];
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".sql")).sort()) {
  const sql = fs.readFileSync(path.join(DIR, f), "utf8").replace(/--.*$/gm, "");
  const m = sql.match(/function\s+public\.protect_game_state_teacher_columns\(\)[\s\S]*?\$(\w*)\$([\s\S]*?)\$\1\$/i);
  if (!m) continue;
  const cols = new Set([...m[2].matchAll(/new\.(\w+)\s*:=\s*old\.\1\b/gi)].map((x) => x[1].toLowerCase()));
  versiones.push({ f, cols });
}
if (versiones.length < 2) mal(`se esperaban varias versiones de la función, hay ${versiones.length}`);
for (let i = 1; i < versiones.length; i++) {
  const antes = versiones[i - 1], ahora = versiones[i];
  const perdidas = [...antes.cols].filter((c) => !ahora.cols.has(c));
  if (perdidas.length) mal(`${ahora.f} ya no le devuelve al alumno ${perdidas.join(", ")} (lo hacía ${antes.f})`);
}
const ultima = versiones[versiones.length - 1];
if (ultima) {
  for (const c of ["presentacion", "planilla", "active_player_color", "rival_id"]) {
    if (!ultima.cols.has(c)) mal(`${ultima.f} no le devuelve al alumno ${c}`);
  }
}
if (!fallos) bien(`${versiones.length} versiones, ninguna abre lo que la anterior cerraba; la última protege ${ultima.cols.size} columnas`);

console.log("\n=== Con un solo color, la pantalla no ofrece lo que la base rechaza ===");
const js = fs.readFileSync(path.join(RAIZ, "js", "sesion.js"), "utf8");
const cuerpo = (nombre) => {
  const i = js.indexOf(`function ${nombre}(`);
  if (i < 0) return null;
  return js.slice(i, js.indexOf("\n        }\n", i));
};
const reescribir = cuerpo("puedeReescribirPartida");
if (!reescribir || !/activePlayerColor === "both"/.test(reescribir)) mal("puedeReescribirPartida() no exige el control de los dos colores");
const deshacer = cuerpo("canUndoNow");
if (!deshacer || !/board\.game\.turn\(\) !== activePlayerColor/.test(deshacer)) mal("canUndoNow() no limita «Deshacer» a la jugada propia");
const boton = cuerpo("updateUndoButton");
if (!boton || !/canUndoNow\(\)/.test(boton)) mal("el botón «Deshacer» no se muestra según canUndoNow()");
if (!/getElementById\("undo-move-btn"\)\.addEventListener\("click", async \(\) => \{\s*if \(!canUndoNow\(\)/.test(js)) mal("el clic de «Deshacer» no pregunta canUndoNow()");
if (!/history-fork-btn"\)\.classList\.toggle\("hidden", !\(viewing && canMoveNow\(\) && puedeReescribirPartida\(\)\)\)/.test(js)) mal("«Jugar desde aquí» se le muestra a quien juega con un solo color");
if (!/getElementById\("history-fork-btn"\)\.addEventListener\("click", async \(\) => \{\s*if \(!canMoveNow\(\) \|\| !puedeReescribirPartida\(\)/.test(js)) mal("el clic de «Jugar desde aquí» no pregunta puedeReescribirPartida()");
if (!fallos) bien("«Deshacer» solo la jugada propia y «Jugar desde aquí» solo con los dos colores");

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
