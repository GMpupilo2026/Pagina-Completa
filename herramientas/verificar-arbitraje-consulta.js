#!/usr/bin/env node
/* El Espacio de consultas de «Herramientas de arbitraje»
 * (herramientas-arbitraje.html → js/consulta-arbitraje.js → Edge Function
 * consulta-arbitraje). No necesita red, navegador ni la base: lee los
 * archivos. Ver «Herramientas de arbitraje» en docs/decisiones/juegos-y-torneos.md.
 *
 * Lo que puede perderse sin dar ningún error:
 *   - que la Edge Function deje de pasar por el freno de los envíos públicos
 *     antes de llamar a la IA (gastaría dinero sin tope);
 *   - que la Edge Function lea el presupuesto (arbitraje_consulta_config) de
 *     otra tabla, o no lo lea, y gaste sin tope;
 *   - que el formulario público deje de pedir alguno de los campos que la
 *     Edge Function espera, o mande el cuerpo a otra ruta.
 *
 *   node herramientas/verificar-arbitraje-consulta.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");

let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

console.log("=== Espacio de consultas (Herramientas de arbitraje) ===");

// ---- la Edge Function ----
const FN = "supabase/functions/consulta-arbitraje/index.ts";
let fn = null;
try { fn = leer(FN); } catch (e) { mal(`${FN} no existe`); }

if (fn) {
  const iFreno = fn.search(/arbitraje_consulta_frenar/);
  const iIA = fn.search(/messages\.create/);
  if (iFreno < 0) mal("la Edge Function no llama a arbitraje_consulta_frenar");
  else if (iIA >= 0 && iFreno > iIA) mal("la Edge Function llama a la IA ANTES del freno");
  else bien("el freno se llama antes de gastar en la IA");

  if (!/if\s*\(\s*freno\s*\)/.test(fn)) mal("la Edge Function no hace caso de lo que devuelve el freno");
  else bien("se hace caso de lo que devuelve el freno");

  if (!/arbitraje_consulta_config/.test(fn)) mal("la Edge Function no lee arbitraje_consulta_config");
  else bien("lee el presupuesto de arbitraje_consulta_config");

  if (!/tope_mensual_usd/.test(fn) || !/gastado/.test(fn)) mal("la Edge Function no compara el gasto del mes contra el tope");
  else bien("compara el gasto del mes contra el tope antes de llamar a la IA");

  if (!/verify_jwt en false/i.test(fn)) mal("la Edge Function no deja constancia de que va con verify_jwt en false");
  else bien("deja constancia de que va con verify_jwt en false (sin sesión)");
}

// ---- el freno conoce el tipo ----
const DIR_MIGRACIONES = path.join(RAIZ, "supabase", "migraciones");
const archivos = fs.readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith(".sql")).sort();
let tiposDelFreno = null;
for (const f of archivos) {
  const sql = fs.readFileSync(path.join(DIR_MIGRACIONES, f), "utf8");
  const m = sql.match(/create\s+(or\s+replace\s+)?function\s+interno\.frenar_envio_publico\s*\([\s\S]*?\$function\$([\s\S]*?)\$function\$/i);
  if (m) tiposDelFreno = [...m[2].matchAll(/when\s+'([a-z_]+)'\s+then/gi)].map((x) => x[1]);
}
if (!tiposDelFreno || !tiposDelFreno.includes("arbitraje_consulta")) {
  mal("interno.frenar_envio_publico no conoce el tipo 'arbitraje_consulta'");
} else {
  bien("el freno conoce el tipo 'arbitraje_consulta'");
}

// ---- el formulario público ----
const HTML = "herramientas-arbitraje.html";
let html = null;
try { html = leer(HTML); } catch (e) { mal(`${HTML} no existe`); }
if (html) {
  ["c-nombre", "c-email", "c-pregunta", "consulta-form"].forEach((id) => {
    if (!html.includes(`id="${id}"`)) mal(`${HTML} no tiene el campo #${id}`);
    else bien(`${HTML} tiene #${id}`);
  });
  if (!/name="quien"/.test(html)) mal(`${HTML} no tiene el radio "quien"`);
  else bien(`${HTML} pide quién pregunta`);
  if (!/js\/consulta-arbitraje\.js/.test(html)) mal(`${HTML} no carga js/consulta-arbitraje.js`);
  else bien(`${HTML} carga js/consulta-arbitraje.js`);
}

// ---- el JS del formulario llama a la ruta correcta con los campos que la función espera ----
const JS = "js/consulta-arbitraje.js";
let js = null;
try { js = leer(JS); } catch (e) { mal(`${JS} no existe`); }
if (js) {
  if (!/functions\/v1\/consulta-arbitraje/.test(js)) mal(`${JS} no llama a la Edge Function consulta-arbitraje`);
  else bien(`${JS} llama a la Edge Function consulta-arbitraje`);
  ["nombre", "email", "quien", "pregunta"].forEach((campo) => {
    if (!js.includes(campo)) mal(`${JS} no manda el campo "${campo}"`);
    else bien(`${JS} manda el campo "${campo}"`);
  });
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien: el Espacio de consultas pasa por el freno y gasta con tope.");
process.exit(fallos ? 1 : 0);
