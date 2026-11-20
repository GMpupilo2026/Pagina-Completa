/* ===== La bienvenida que llega a la casa =====
 *
 *   node herramientas/verificar-bienvenida-casa.js
 *
 * El primer correo que recibe una persona encargada es una bienvenida, no un
 * informe (`bienvenidaHtml` en supabase/functions/informes-encargados/
 * informe-html.ts; lo manda la tanda cuando `ultimo_envio_at` está vacío).
 * Sin navegador ni red: se llama la plantilla y se mira el TEXTO que va a
 * leer la familia.
 *
 * Se comprueba que diga cuándo llega el informe (con la hora de Costa Rica
 * bien dicha: «a la 1 p. m.», no «a las 1»), que cuente lo que de verdad trae
 * cada informe, que lleve la marca de la academia, que el nombre del alumno
 * vaya escapado y que la tanda la mande solo la primera vez.
 *
 * Ver «La bienvenida, antes del primer informe» en docs/decisiones/informes.md.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(__dirname, "casos-bienvenida-casa.mts")],
  { cwd: RAIZ, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
if (r.status !== 0) { console.error("No se pudo armar la bienvenida:\n" + (r.stderr || r.stdout)); process.exit(1); }
const { cuando, html } = JSON.parse(r.stdout);

let fallos = 0;
function igual(nombre, a, b) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) { console.log("  ✗ " + nombre + "\n      esperaba: " + sb + "\n      salió:    " + sa); fallos += 1; }
  else console.log("  ✓ " + nombre);
}
const texto = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

console.log("\n=== Cuándo llega, dicho como en la casa ===");
igual("lunes a la 1 p. m.", cuando.lunes13, "todos los lunes a la 1 p. m.");
igual("sábados a la 1 a. m.", cuando.sabado1, "todos los sábados a la 1 a. m.");
igual("semanal sin día", cuando.sinDia, "una vez por semana");
igual("diario a las 7 a. m.", cuando.diario7, "todos los días a las 7 a. m.");
igual("al mediodía", cuando.mediodia, "todos los miércoles al mediodía");
igual("mensual", cuando.mensual, "una vez al mes");

console.log("\n=== Lo que lee la familia ===");
const t = texto(html.pococi);
igual("saluda al alumno por su primer nombre", /Estefany ya tiene su cuenta/.test(t), true);
igual("dice cuándo llega el informe", /todos los lunes a la 1 p\. m\./.test(t), true);
for (const [n, re] of [["si practicó", /Si practicó lo suficiente/], ["el tiempo", /Cuánto entrenó y en qué/], ["tareas y exámenes", /Sus tareas y exámenes/],
  ["la comparación", /la semana anterior/], ["los mensajes de su profe", /Los mensajes de su profe/], ["el Elo y los premios", /Elo oficial/], ["el plan", /plan de entrenamiento/]]) {
  igual("cuenta " + n, re.test(t), true);
}
igual("no dice que no entró a practicar (no es un informe)", /no entró a practicar|Practicó poco|Va bien/.test(t), false);
igual("lleva la marca de la academia", html.pococi.includes("CCDR POCOCI") && html.pococi.includes("#1479b8"), true);
igual("el botón lleva a entrar", /href="https:\/\/ajedrez-integral\.com\/login\.html"/.test(html.pococi), true);
const raro = html.raro;
igual("el nombre va escapado", !raro.includes("<b>Ana</b>") && raro.includes("&lt;b&gt;Ana&lt;/b&gt;"), true);
igual("con WhatsApp de contacto, lo ofrece", /respondemos por WhatsApp al 6000-0000/.test(texto(raro)), true);
igual("mensual habla del mes anterior", /el mes anterior/.test(texto(raro)), true);

console.log("\n=== La tanda la manda solo la primera vez ===");
const idx = fs.readFileSync(path.join(RAIZ, "supabase/functions/informes-encargados/index.ts"), "utf8");
igual("si nunca se le mandó nada, va la bienvenida y se marca el envío",
  /if \(!e\.ultimo_envio_at\) \{\s*const r = await mandarBienvenida\(e\);[\s\S]{0,200}ultimo_envio_at: ahora\.toISOString\(\)[\s\S]{0,60}continue;/.test(idx), true);
igual("la tanda pide la hora de envío para decir cuándo llega", /dia_semana, hora_envio"\)/.test(idx), true);

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
