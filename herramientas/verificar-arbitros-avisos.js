/* El aviso por correo a cada árbitro de lo que se le vence: una norma de FIDE
   que deja de contar, el seminario que deja de valer o su actividad en la
   Federación (art. 19). Lo manda la Edge Function arbitros-avisos el día 1 de
   cada mes, disparada por pg_cron.

   Lo que comprueba, sin red ni base:

   - el correo: el saludo con el nombre de pila, cada cosa con su fecha en
     palabras y en orden, el asunto en singular y plural, por qué le llega y
     cómo dejar de recibirlo; lo que viene de la base se escapa;
   - la función exige el secreto ANTES de leer nada, a quién le escribe sale
     de la base (arbitros_cr_por_vencer), salta lo ya avisado, a quien no tiene
     correo o apagó los avisos, y anota lo que mandó para no repetirlo;
   - la migración: el correo y la autorización los ve y escribe solo
     administración, lo avisado no se escribe desde la web, la función de lo
     que se vence la ven solo administración y la service role, el secreto lo
     genera la base y lo lee solo la service role, y la tarea del día 1.

   Ver «El aviso por correo de lo que se vence» en
   docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-arbitros-avisos.js                         */
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
  dos: { nombre: "Rojas Prueba, Luis Alberto", avisos: [
    { que: "Quedas inactivo en la Federación si para esa fecha no arbitras", vence: "2027-01-05" },
    { que: "La norma de AF del torneo «Abierto <b>2021</b>» (02/03/2021) deja de contar", vence: "2026-12-01" }] },
  una: { nombre: "SinComa", avisos: [{ que: "El seminario deja de valer", vence: "2026-11-30" }] },
};
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { cuerpoAvisos, asunto, fechaLarga, pila } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/arbitros-avisos/avisos-html.ts"))};
   const casos = JSON.parse(process.argv[1]);
   const out = {};
   for (const k of Object.keys(casos)) out[k] = { html: cuerpoAvisos(casos[k].nombre, casos[k].avisos, "<tr><td>CABECERA</td></tr>"), asunto: asunto(casos[k].avisos) };
   out.fecha = [fechaLarga("2026-09-05"), fechaLarga("no"), pila("Rojas Prueba, Luis Alberto"), pila("")];
   process.stdout.write(JSON.stringify(out));`, JSON.stringify(casos)], { encoding: "utf8" });
if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
const out = JSON.parse(r.stdout);

console.log("\nEl correo");
const c = out.dos.html;
cierto("lleva la cabecera que le pasan", c.includes("<tr><td>CABECERA</td></tr>"));
cierto("saluda con el nombre de pila", c.includes("Hola, Luis:"));
cierto("sin coma en el nombre, saluda sin nombre", out.una.html.includes("Hola:"));
cierto("cada cosa con su fecha en palabras, la que vence antes primero",
  c.indexOf("1 de diciembre de 2026") > -1 && c.indexOf("1 de diciembre de 2026") < c.indexOf("5 de enero de 2027"));
cierto("la fecha en palabras, con «setiembre», y vacía si no es fecha", JSON.stringify(out.fecha.slice(0, 2)) === JSON.stringify(["5 de setiembre de 2026", ""]), JSON.stringify(out.fecha));
cierto("lo que viene de la base se escapa", c.includes("Abierto &lt;b&gt;2021&lt;/b&gt;") && !c.includes("<b>2021"));
cierto("el asunto en plural y en singular", out.dos.asunto === "Arbitraje: 2 cosas se te vencen pronto" && out.una.asunto === "Arbitraje: algo se te vence pronto", out.dos.asunto + " | " + out.una.asunto);
cierto("dice por qué le llega y cómo dejar de recibirlo", c.includes("autorizaste estos avisos") && c.includes("Si ya no los quieres, respóndenos"));

console.log("\nLa función");
const fn = fs.readFileSync(path.join(RAIZ, "supabase/functions/arbitros-avisos/index.ts"), "utf8");
const pos = (t) => fn.indexOf(t);
cierto("compara el secreto antes de leer nada",
  pos('rpc("secreto_tanda_arbitros")') !== -1 && pos('rpc("secreto_tanda_arbitros")') < pos('rpc("arbitros_cr_por_vencer"'));
cierto("no lee el cuerpo del pedido: a quién le escribe sale de la base", !/req\.json\(\)/.test(fn) && /rpc\("arbitros_cr_por_vencer"/.test(fn));
cierto("salta lo ya avisado, a quien no tiene correo y a quien apagó los avisos", /if \(!f\.avisos \|\| f\.avisado \|\| !CORREO\.test\(correo\)\) continue;/.test(fn));
cierto("anota lo que mandó, solo si salió, para no repetirlo",
  pos('from("arbitros_cr_avisos_enviados")') > pos("if (!res.ok)") && /onConflict: "fide_id,clave"/.test(fn));
cierto("responder llega a una persona, no al remitente automático", /reply_to: RESPONDER_A/.test(fn));
const armar = fs.readFileSync(path.join(RAIZ, "herramientas/funciones-armar.js"), "utf8");
cierto("se arma con su cabecera compartida", /"arbitros-avisos": \["marca-correo\.ts"\]/.test(armar));
const desplegadas = fs.readFileSync(path.join(RAIZ, "supabase/esquema/funciones-desplegadas.txt"), "utf8");
cierto("está en la lista de funciones desplegadas, sin verify_jwt", /^arbitros-avisos\s+false\s/m.test(desplegadas));

console.log("\nLa migración");
const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /\.sql$/.test(f)).sort()
  .map((f) => fs.readFileSync(path.join(RAIZ, "supabase/migraciones", f), "utf8"))
  .filter((s) => s.includes("create table public.arbitros_cr_contacto")).pop() || "";
const sql = mig.replace(/--.*$/gm, "");
cierto("existe", mig !== "");
cierto("el correo y la autorización: solo administración, para leer y escribir",
  /revoke all on public\.arbitros_cr_contacto from public, anon, authenticated/.test(sql) &&
  /create policy arbitros_cr_contacto_admin on public\.arbitros_cr_contacto for all to authenticated\s+using \(\(select public\.soy_admin\(\)\)\) with check \(\(select public\.soy_admin\(\)\)\)/.test(sql));
cierto("guarda cómo autorizó, obligatorio", /autorizo text not null check \(length\(btrim\(autorizo\)\) between 3 and 200\)/.test(sql));
cierto("lo avisado se lee (administración) pero no se escribe desde la web",
  /grant select on public\.arbitros_cr_avisos_enviados to authenticated/.test(sql) &&
  !/on public\.arbitros_cr_avisos_enviados for (insert|update|delete|all)/.test(sql));
cierto("lo avisado una sola vez por cosa (clave primaria)", /primary key \(fide_id, clave\)/.test(sql));
cierto("lo que se vence lo ven solo administración y la service role",
  /if not coalesce\(\(select public\.soy_admin\(\)\) or auth\.role\(\) = 'service_role', false\) then/.test(sql) &&
  /revoke execute on function public\.arbitros_cr_por_vencer\(integer\) from public, anon/.test(sql));
cierto("el secreto lo genera la base, no está escrito en el archivo",
  /vault\.create_secret\(encode\(gen_random_bytes\(32\), 'hex'\), 'tanda_arbitros_secreto'\)/.test(sql));
cierto("el secreto lo lee solo la service role",
  /revoke all on function public\.secreto_tanda_arbitros\(\) from public, anon, authenticated/.test(sql) &&
  /grant execute on function public\.secreto_tanda_arbitros\(\) to service_role/.test(sql));
cierto("el disparador solo lo corre pg_cron", /revoke execute on function public\.disparar_avisos_arbitros\(\) from public, anon, authenticated/.test(sql));
cierto("corre el día 1 de cada mes a las 8:07 de Costa Rica", /cron\.schedule\('avisos-arbitros', '7 14 1 \* \*'/.test(sql));
const cron = fs.readFileSync(path.join(RAIZ, "supabase/esquema/cron.txt"), "utf8");
cierto("y está en el retrato de las tareas programadas", /^avisos-arbitros\s+7 14 1 \* \*/m.test(cron));

console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
