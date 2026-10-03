#!/usr/bin/env node
/* Una política de LECTURA de una tabla publicada en Realtime va `to
 * authenticated`, nunca `to public` (que es lo que queda si no se dice nada).
 *
 * No necesita red ni la base: lee supabase/migraciones/ y las tablas `realtime`
 * del retrato del esquema.
 *
 * Por qué: Realtime revisa cada cambio con los permisos de CADA suscriptor.
 * Si la política es `to public`, a un suscriptor `anon` (una pestaña con la
 * sesión vencida) también se le aplica, y al llamar a una función que anon no
 * puede ejecutar (my_profile(), alumnos_de()…) falla el lote ENTERO de
 * cambios: la jugada no le llega a nadie. El 3/10 los torneos se quedaron
 * así —el rival jugaba y al otro le seguía corriendo el reloj—, sin ningún
 * error en la pantalla. Ver «Realtime perdía jugadas» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 * Revisa las migraciones POSTERIORES a la que lo arregló
 * (20261003194333_realtime_politicas_solo_authenticated): cada `create policy`
 * de select (o all) sobre una tabla publicada tiene que decir `to
 * authenticated`, y un `alter policy … to public` sobre una de ellas tampoco
 * vale. La única pública a propósito es tv_settings_select_public, que no
 * llama a ninguna función.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DIR = path.join(RAIZ, "supabase", "migraciones");
const DESDE = "20261003194333";
const PUBLICAS_A_PROPOSITO = new Set(["tv_settings_select_public"]);

let fallos = 0;
function ok(cond, msg) {
  if (cond) console.log("  ✓ " + msg);
  else { fallos += 1; console.log("  ✗ " + msg); }
}

const publicadas = new Set([...fs.readFileSync(path.join(RAIZ, "supabase/esquema/inventario-academia.txt"), "utf8")
  .matchAll(/^realtime\s+([a-z_0-9]+)\s*$/gm)].map((m) => m[1]));
ok(publicadas.size > 10, "el retrato del esquema trae las tablas publicadas en Realtime (" + publicadas.size + ")");

const arreglo = fs.readdirSync(DIR).find((f) => f.startsWith(DESDE));
ok(!!arreglo, "está la migración que pasó las lecturas a authenticated");
if (arreglo) {
  const s = fs.readFileSync(path.join(DIR, arreglo), "utf8");
  ok(/alter policy game_rooms_select on public\.game_rooms to authenticated/.test(s), "  y pasa game_rooms_select, la de las partidas");
}

// Sin comentarios, para no tomar por código lo que se explica en ellos.
const limpiar = (s) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

let revisadas = 0;
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && f.slice(0, 14) > DESDE).sort()) {
  const sql = limpiar(fs.readFileSync(path.join(DIR, f), "utf8"));
  for (const m of sql.matchAll(/create\s+policy\s+"?([a-z_0-9]+)"?\s+on\s+(?:public\.)?"?([a-z_0-9]+)"?([\s\S]*?);/gi)) {
    const [, nombre, tabla, resto] = m;
    if (!publicadas.has(tabla) || PUBLICAS_A_PROPOSITO.has(nombre)) continue;
    const cmd = (resto.match(/\bfor\s+(select|insert|update|delete|all)\b/i) || [, "all"])[1].toLowerCase();
    if (cmd !== "select" && cmd !== "all") continue;
    revisadas += 1;
    ok(/\bto\s+authenticated\b/i.test(resto), f + ": la política " + nombre + " (lectura de " + tabla + ", que está en Realtime) va `to authenticated`");
  }
  for (const m of sql.matchAll(/alter\s+policy\s+"?([a-z_0-9]+)"?\s+on\s+(?:public\.)?"?([a-z_0-9]+)"?\s+to\s+([a-z_, ]+)/gi)) {
    const [, nombre, tabla, roles] = m;
    if (!publicadas.has(tabla) || PUBLICAS_A_PROPOSITO.has(nombre)) continue;
    revisadas += 1;
    ok(!/\b(public|anon)\b/i.test(roles), f + ": " + nombre + " (de " + tabla + ") no vuelve a `public` ni a `anon`");
  }
}
console.log("  " + revisadas + " política(s) de tablas publicadas en migraciones posteriores al arreglo.");

if (fallos) {
  console.log("\n✗ " + fallos + " problema(s): una lectura `to public` en una tabla de Realtime hace perder los avisos a todos.");
  process.exit(1);
}
console.log("\n✓ Las lecturas de las tablas de Realtime son solo para quien tiene sesión.");
