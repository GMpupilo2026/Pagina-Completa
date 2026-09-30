/* El aviso de base saturada: que quien administra se entere antes que los
   alumnos.

   El 29/9, en la hora pico de clases, la base cortó consultas por statement
   timeout y tres grupos no pudieron dar clase; nadie se enteró hasta que ya
   no entraba nadie. Ahora public.vigilar_base() mide cada cinco minutos y, si
   algo salta, la Edge Function alerta-base le escribe a administración.

   Lo que comprueba, sin red ni base:

   - el correo dice qué se midió, en palabras, una línea por señal encendida,
     con la hora de Costa Rica, qué hacer y el enlace al proyecto;
   - un número raro no rompe el correo ni se sale del HTML;
   - la función exige el secreto ANTES de leer nada, y a quién le escribe sale
     de la base (is_admin), no del pedido;
   - la migración: los umbrales, un correo cada dos horas como mucho, la
     tabla sin acceso desde la web, la función que solo corre pg_cron, el
     secreto que se lee solo con la service role, y la tarea cada 5 minutos.

   Ver «El aviso de base saturada» en docs/decisiones/sitio-e-infraestructura.md.

       node herramientas/verificar-alerta-base.js                            */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
}

const casos = {
  todo: { pulso_ms: 912.4, lentas: 4, cron_fallidos: 3, medido_at: "2026-09-30T00:05:00Z" },
  una: { pulso_ms: 2, lentas: 0, cron_fallidos: 1, medido_at: "2026-09-30T00:05:00Z" },
  bajo: { pulso_ms: 249, lentas: 2, cron_fallidos: 0, medido_at: "2026-09-30T00:05:00Z" },
  raro: { pulso_ms: "<b>", lentas: -5, cron_fallidos: NaN, medido_at: "no es fecha" },
};
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { cuerpoAlerta, senales } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/alerta-base/alerta-html.ts"))};
   const casos = JSON.parse(process.argv[1]);
   casos.raro.cron_fallidos = NaN;
   const out = {};
   for (const k of Object.keys(casos)) out[k] = { html: cuerpoAlerta(casos[k], "<tr><td>CABECERA</td></tr>"), senales: senales(casos[k]) };
   process.stdout.write(JSON.stringify(out));`, JSON.stringify(casos)], { encoding: "utf8" });
if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
const out = JSON.parse(r.stdout);

console.log("\nLo que dice el correo");
const c = out.todo.html;
cierto("lleva la cabecera que le pasan", c.includes("<tr><td>CABECERA</td></tr>"));
cierto("una línea por señal encendida (las tres)", out.todo.senales.length === 3, JSON.stringify(out.todo.senales));
cierto("la prueba lenta, con sus milisegundos redondeados", c.includes("tardó 912 ms"));
cierto("las consultas de más de 3 s", c.includes("Había 4 consultas"));
cierto("las tareas que no arrancaron, en plural", c.includes("3 tareas programadas no llegaron a arrancar"));
cierto("y en singular cuando es una", out.una.senales.join(" ").includes("Una tarea programada no llegó a arrancar"), JSON.stringify(out.una.senales));
cierto("con la hora de Costa Rica (00:05 UTC son las 6:05 p. m. del 29)",
  /29 de septiembre[^<]*6:05/.test(c) && c.includes("hora de Costa Rica"), c.match(/medido el [^)]*/));
cierto("dice qué hacer: que no hace falta reiniciar", c.includes("no hay nada que reiniciar"));
cierto("y cómo evitar que se repita (subir el tamaño de la base)", c.includes("Compute and Disk"));
cierto("con el enlace al proyecto en Supabase", c.includes('href="https://supabase.com/dashboard/project/bgtijpimpcokxatxxbki"'));

console.log("\nLos umbrales");
cierto("debajo de los umbrales no se enciende ninguna señal", out.bajo.senales.length === 0, JSON.stringify(out.bajo.senales));

console.log("\nNúmeros raros");
cierto("un valor que no es número no rompe el correo ni se cuela en el HTML",
  !out.raro.html.includes("<b>") && out.raro.senales.length === 0, JSON.stringify(out.raro.senales));
cierto("una fecha inválida no deja un «medido el» vacío", !out.raro.html.includes("medido el"));

console.log("\nLa función");
const fn = fs.readFileSync(path.join(RAIZ, "supabase/functions/alerta-base/index.ts"), "utf8");
const pos = (t) => fn.indexOf(t);
cierto("compara el secreto antes de leer nada",
  pos('rpc("secreto_alerta_base")') !== -1 && pos('rpc("secreto_alerta_base")') < pos("req.json()") &&
  pos('rpc("secreto_alerta_base")') < pos('from("profiles")'));
cierto("le escribe a quien administra, leído de la base", /from\("profiles"\)\.select\("email"\)\.eq\("is_admin", true\)/.test(fn));
cierto("el pedido no elige destinatario", !/body\.(para|to|email)/.test(fn));
const armar = fs.readFileSync(path.join(RAIZ, "herramientas/funciones-armar.js"), "utf8");
cierto("se arma con su cabecera compartida", /"alerta-base": \["marca-correo\.ts"\]/.test(armar));

console.log("\nLa migración");
const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones"))
  .filter((f) => /\.sql$/.test(f)).sort()
  .map((f) => fs.readFileSync(path.join(RAIZ, "supabase/migraciones", f), "utf8"))
  .filter((s) => s.includes("function public.vigilar_base()")).pop() || "";
const sinComentarios = mig.replace(/--.*$/gm, "");
cierto("existe", mig !== "");
cierto("los tres umbrales: 250 ms, 3 consultas lentas, 1 tarea fallida",
  /v_ms >= 250 or v_lentas >= 3 or v_cron >= 1/.test(sinComentarios));
cierto("como mucho un aviso cada dos horas",
  /aviso_enviado and medido_at > now\(\) - interval '2 hours'/.test(sinComentarios));
cierto("la tabla de mediciones no se lee desde la web",
  /revoke all on interno\.salud_base from public, anon, authenticated/.test(sinComentarios) &&
  /alter table interno\.salud_base enable row level security/.test(sinComentarios));
cierto("vigilar_base() solo la corre pg_cron",
  /revoke execute on function public\.vigilar_base\(\) from public, anon, authenticated/.test(sinComentarios));
cierto("el secreto lo lee solo la service role",
  /revoke all on function public\.secreto_alerta_base\(\) from public, anon, authenticated/.test(sinComentarios) &&
  /grant execute on function public\.secreto_alerta_base\(\) to service_role/.test(sinComentarios));
cierto("el secreto lo genera la base, no está escrito en el archivo",
  /vault\.create_secret\(encode\(gen_random_bytes\(32\), 'hex'\), 'alerta_base_secreto'\)/.test(sinComentarios));
cierto("corre cada cinco minutos", /cron\.schedule\('vigilar-base', '\*\/5 \* \* \* \*'/.test(sinComentarios));
cierto("y guarda dos semanas, no para siempre", /medido_at < now\(\) - interval '14 days'/.test(sinComentarios));

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
