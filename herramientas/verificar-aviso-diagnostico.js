/* El correo al supervisor por un diagnóstico que llegó por su enlace.

   Lo arma supabase/functions/avisar-diagnostico/aviso-html.ts y lo manda la
   Edge Function avisar-diagnostico, disparada por la base. Lo que comprueba,
   sin red ni base:

   - trae el nombre, el correo, el WhatsApp, el nivel, el resultado y el
     enlace a Informes del diagnóstico;
   - lo que escribió el visitante va escapado, también dentro de los
     atributos (el href del correo y el de WhatsApp);
   - un dato que no llegó no deja una fila vacía;
   - la función exige el secreto antes de leer nada, se «toma» la fila solo
     si no se avisó (aviso_enviado_at) y la suelta si el envío falla;
   - la migración encola el aviso DESPUÉS del insert y no tumba el insert si
     algo falla.

   Ver «El enlace del diagnóstico de cada supervisor» en docs/decisiones/informes.md.

       node herramientas/verificar-aviso-diagnostico.js                      */
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
  completo: { id: "x", created_at: "2026-09-29T00:00:00Z", nombre: "Lucía Fernández", email: "lucia@ejemplo.cr",
    telefono: "+506 8888-1111", elo: 1450, porcentaje: 68, nivel: "Intermedio", supervisor_id: "s" },
  ajeno: { id: "y", created_at: "2026-09-29T00:00:00Z", nombre: '<img src=x onerror="alert(1)">',
    email: 'a"b@x.cr" onmouseover="x', telefono: null, elo: null, porcentaje: null, nivel: null, supervisor_id: "s" },
};
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { cuerpoAviso } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/avisar-diagnostico/aviso-html.ts"))};
   const casos = JSON.parse(process.argv[1]);
   const out = {};
   out.completo = cuerpoAviso(casos.completo, "Karina", "<tr><td>CABECERA</td></tr>");
   out.ajeno = cuerpoAviso(casos.ajeno, "", "<tr><td>CABECERA</td></tr>");
   process.stdout.write(JSON.stringify(out));`, JSON.stringify(casos)], { encoding: "utf8" });
if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
const html = JSON.parse(r.stdout);

console.log("\nLo que dice el correo");
const c = html.completo;
cierto("lleva la cabecera que le pasan", c.includes("<tr><td>CABECERA</td></tr>"));
cierto("saluda al supervisor por su nombre", c.includes("Hola, Karina."));
cierto("con el nombre del visitante", c.includes("<strong>Lucía Fernández</strong>"));
cierto("su correo, para escribirle", c.includes('href="mailto:lucia@ejemplo.cr"'));
cierto("su WhatsApp, solo con los números", c.includes('href="https://wa.me/50688881111"'), c);
cierto("el nivel, el resultado y el Elo", c.includes("Intermedio") && c.includes("68%") && c.includes("1450"));
cierto("y el enlace al diagnóstico completo en Informes",
  c.includes('href="https://ajedrez-integral.com/informes.html?tema=diagnostico-publico"'));

console.log("\nTexto ajeno");
const a = html.ajeno;
cierto("el nombre no se ejecuta", !a.includes("<img src=x") && a.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"), a);
cierto("el correo no se sale del atributo", !/onmouseover="/.test(a), a);
cierto("sin nombre del supervisor, un «Hola.» a secas", a.includes("Hola. Alguien"));
cierto("lo que no llegó no deja filas vacías", !a.includes("WhatsApp") && !a.includes("Resultado") && !a.includes("Elo"));

console.log("\nLa función");
const fn = fs.readFileSync(path.join(RAIZ, "supabase/functions/avisar-diagnostico/index.ts"), "utf8");
const pos = (t) => fn.indexOf(t);
cierto("compara el secreto antes de leer ninguna fila",
  pos('rpc("secreto_aviso_diagnostico")') !== -1 && pos('rpc("secreto_aviso_diagnostico")') < pos('from("diagnosticos_publicos")'));
cierto("toma la fila solo si no se avisó", /\.is\("aviso_enviado_at", null\)/.test(fn));
cierto("y la suelta si el envío falla", /if \(!res\.ok\) \{\s*await soltar\(\)/.test(fn));
cierto("a un usuario sin buzón no le escribe", fn.includes("esCorreoInterno(para)"));

console.log("\nEl disparador");
const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones"))
  .filter((f) => /\.sql$/.test(f))
  .map((f) => fs.readFileSync(path.join(RAIZ, "supabase/migraciones", f), "utf8"))
  .filter((s) => s.includes("function public.avisar_diagnostico_supervisor()")).pop() || "";
cierto("existe", mig !== "");
cierto("va DESPUÉS del insert (el supervisor_id ya lo puso el otro trigger)", /after insert on public\.diagnosticos_publicos/.test(mig));
cierto("un fallo al encolar no tumba el insert", /exception when others then\s*raise warning/.test(mig));
cierto("no la puede llamar nadie desde la API",
  /revoke execute on function public\.avisar_diagnostico_supervisor\(\) from public, anon, authenticated/.test(mig));

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
