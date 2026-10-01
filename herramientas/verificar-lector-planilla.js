#!/usr/bin/env node
/* Que el lector de planilla siga pasando por su tope diario.
 *
 * No necesita navegador, ni red, ni la base: lee la Edge Function
 * (supabase/functions/ocr-scoresheet/index.ts) y supabase/migraciones/.
 *
 * Cada foto que llega a ocr-scoresheet se le paga a Google Vision, y la puede
 * mandar cualquier cuenta con sesión. Desde 20261001143746 la función gasta un
 * uso de public.lector_planilla_gastar() antes de llamar a Google (30 por
 * persona al día, 500 en total). Se pierde callado: basta con que alguien
 * despliegue una copia vieja de la función, o vuelva a crear la de la base sin
 * el `where` del upsert, para que el lector funcione exactamente igual y sin
 * tope. Ver «El lector de planilla tiene tope diario» en
 * docs/decisiones/cuentas-y-formularios.md.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const FUNCION = path.join(RAIZ, "supabase", "functions", "ocr-scoresheet", "index.ts");
const DIR = path.join(RAIZ, "supabase", "migraciones");
let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

console.log("=== Tope diario del lector de planilla ===");

// 1. La Edge Function gasta el uso antes de llamar a Google, y hace caso.
const ts = fs.readFileSync(FUNCION, "utf8");
const gasto = ts.search(/callerClient\.rpc\(\s*["']lector_planilla_gastar["']\s*\)/);
const google = ts.indexOf("vision.googleapis.com");
if (gasto < 0) {
  mal("ocr-scoresheet no llama a lector_planilla_gastar() con el token de quien llama (callerClient)");
} else if (google < 0 || gasto > google) {
  mal("ocr-scoresheet llama a Google Vision ANTES de gastar el uso: la foto se paga aunque no haya cupo");
} else {
  bien("ocr-scoresheet gasta el uso, con el token de quien llama, antes de llamar a Google");
}
const tramo = gasto >= 0 && google > gasto ? ts.slice(gasto, google) : "";
if (/if\s*\(\s*frenoError\s*\)\s*\{[\s\S]*?return\s+json\(/.test(tramo)) {
  bien("si la base no contesta, no se manda la foto (sin cuenta no hay tope)");
} else {
  mal("si lector_planilla_gastar() falla, la función sigue y manda la foto igual");
}
if (/if\s*\(\s*freno\s*\)\s*\{[\s\S]*?return\s+json\(\s*\{\s*error:\s*freno\s*\}\s*,\s*429\s*\)/.test(tramo)) {
  bien("con el tope lleno corta con 429 y le dice a la persona el mensaje de la base");
} else {
  mal("lo que devuelve lector_planilla_gastar() no corta la llamada (o no con 429 y su mensaje)");
}

// 2. La ÚLTIMA migración que define la función de la base cuenta de verdad.
let ultima = null;
let cuerpo = null;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".sql")).sort()) {
  const sql = fs.readFileSync(path.join(DIR, f), "utf8");
  const m = sql.match(/create\s+or\s+replace\s+function\s+public\.lector_planilla_gastar\s*\(/i);
  if (!m) continue;
  const resto = sql.slice(m.index);
  const d = resto.match(/as\s+(\$[a-z_]*\$)/i);
  if (!d) continue;
  const desde = resto.indexOf(d[1]) + d[1].length;
  ultima = f;
  cuerpo = resto.slice(desde, resto.indexOf(d[1], desde));
  // Los permisos van después del cuerpo, en la misma migración.
  cuerpo += "\n" + resto.slice(resto.indexOf(d[1], desde));
}
if (!ultima) {
  mal("ninguna migración define public.lector_planilla_gastar()");
} else {
  console.log("  (la vigente: " + ultima + ")");
  if (/auth\.uid\(\)/.test(cuerpo) && /if\s+v_yo\s+is\s+null\s+then\s+return/i.test(cuerpo)) {
    bien("sin sesión no pasa");
  } else {
    mal("lector_planilla_gastar() no rechaza a quien no tiene sesión");
  }
  if (/America\/Costa_Rica/.test(cuerpo)) bien("el día es el de Costa Rica");
  else mal("el día no se cuenta en hora de Costa Rica");
  // El tope lo garantiza el upsert, no un if: solo suma si no llegó.
  if (/on\s+conflict\s*\(\s*persona\s*,\s*dia\s*\)\s*do\s+update\s+set\s+usos\s*=\s*\w+\.usos\s*\+\s*1\s+where\s+\w+\.usos\s*<\s*tope_persona/i.test(cuerpo)) {
    bien("el tope por persona lo garantiza el upsert (dos fotos a la vez no se cuelan)");
  } else {
    mal("el upsert suma sin mirar el tope por persona");
  }
  if (/sum\(\s*usos\s*\)[\s\S]*>=\s*tope_total/i.test(cuerpo)) bien("hay techo total por día");
  else mal("falta el techo total por día");
  if (/revoke\s+execute\s+on\s+function\s+public\.lector_planilla_gastar\(\)\s+from\s+public\s*,\s*anon/i.test(cuerpo)) {
    bien("anon no la puede llamar (se le quita a public y a anon)");
  } else {
    mal("lector_planilla_gastar() la puede llamar anon (falta el revoke de public y anon)");
  }
}

console.log(fallos ? `\n✗ ${fallos} problema(s)` : "\n✓ El lector de planilla tiene su tope");
process.exit(fallos ? 1 : 0);
