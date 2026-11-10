#!/usr/bin/env node
/* Que ninguna Edge Function deje pasar a quien no completó el segundo paso.
 *
 * No necesita red ni la base: lee supabase/functions/.
 *
 * La verificación en dos pasos la exige la base: PostgREST corre
 * antes_de_cada_pedido() antes de cada pedido. Una función que pregunta el
 * permiso con un cliente que lleva el token de quien llama
 * (`global: { headers: { Authorization } }`) pasa por ahí y queda cubierta
 * sola. Una que lo valida con `admin.auth.getUser(jwt)` y después trabaja con
 * la clave de servicio NO: tiene que leer el `aal` del token ella misma
 * (`sesionAMedias`, ver «La verificación en dos pasos» en
 * docs/decisiones/permisos-y-roles.md). mejorar-informe se quedó sin él: con
 * una contraseña robada se podía gastar el tope de IA de la academia, y nada
 * fallaba.
 *
 * Regla: toda función que llama a auth.getUser y no arma un cliente con el
 * token de quien llama tiene que llamar a sesionAMedias.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "supabase", "functions");
let fallos = 0, revisadas = 0;

console.log("=== El segundo paso en las Edge Functions con clave de servicio ===");
for (const nombre of fs.readdirSync(DIR).sort()) {
  const archivo = path.join(DIR, nombre, "index.ts");
  if (nombre.startsWith("_") || !fs.existsSync(archivo)) continue;
  const codigo = fs.readFileSync(archivo, "utf8").replace(/^\s*\/\/.*$/gm, "");
  if (!/auth\.getUser\s*\(/.test(codigo)) continue;
  // Un cliente con el token de quien llama: sus pedidos pasan por PostgREST.
  const conToken = /global\s*:\s*\{\s*headers\s*:\s*\{\s*Authorization/.test(codigo);
  if (conToken) continue;
  revisadas += 1;
  // Una LLAMADA, no solo la definición copiada: definida y sin usar no protege.
  if (!/(?<!function\s+)\bsesionAMedias\s*\(/.test(codigo)) {
    console.log(`  ✗ ${nombre}: valida la sesión con la clave de servicio y no mira el aal (falta sesionAMedias)`);
    fallos += 1;
  }
}
if (!fallos) console.log(`  ✓ ${revisadas} función(es) con clave de servicio, todas miran el aal del token`);
console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
