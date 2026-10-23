/* Los correos de «Torneos en Pareo Integral» (supabase/functions/pareo-publicar/correos.ts)
 * y lo que la función promete alrededor de ellos (index.ts, leído como texto:
 * acá no hay Deno ni red).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - lo que escribió cualquiera (el nombre de un torneo, de quien juega, el
 *     detalle de un reporte) llega escapado: nunca HTML dentro del correo;
 *   - el asunto no lleva saltos de línea (partirían la cabecera del correo);
 *   - el botón solo lleva a ajedrez-integral.com;
 *   - «recuperar» contesta lo mismo exista o no el correo (no dice quién
 *     está registrado) y el correo de la organización no sale entero hacia
 *     el navegador (va tapado);
 *   - el correo no se usa sin confirmarlo, y se avisa de cada inscripción y de
 *     cada reporte.
 *
 * Uso:  node herramientas/verificar-pareo-correos.js
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};

const MALO = '<img src=x onerror="alert(1)">';
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import * as C from ${JSON.stringify(path.join(RAIZ, "supabase/functions/pareo-publicar/correos.ts"))};
   const M = process.argv[1], cab = "<tr><td>CABECERA</td></tr>";
   const out = {
     confirmar: C.correoConfirmar(cab, M, "https://ajedrez-integral.com/pareo.html#org-correo=a.b"),
     malEnlace: C.correoConfirmar(cab, "Club", "https://otro.com/x"),
     recuperar: C.correoRecuperar(cab, [{ nombre: M, url: "https://ajedrez-integral.com/pareo.html#org-recuperar=a.b" }]),
     inscripcion: C.correoInscripcion(cab, "Torneo\\nde prueba", { nombre: M, institucion: "LICEO", categoria: "Sub-12" }),
     reporteOrg: C.correoReporteOrganizador(cab, M, "datos_personales", "https://ajedrez-integral.com/torneos-pareo.html#t=x"),
     reporteAdmin: C.correoReporteAdmin(cab, "Torneo", "raro", M, "https://ajedrez-integral.com/admin-pareo.html"),
     sello: C.correoSelloAdmin(cab, { organizacion: "Club", quien: M, representa: "Federación", contacto: "8888-8888", nota: M }, "https://ajedrez-integral.com/admin-pareo.html"),
   };
   process.stdout.write(JSON.stringify(out));`, MALO], { encoding: "utf8" });
if (r.status !== 0) { console.log(r.stderr); process.exit(1); }
const c = JSON.parse(r.stdout);

console.log("\n=== Los correos ===");
const todos = Object.values(c);
ok(todos.every((x) => x.html.includes("<tr><td>CABECERA</td></tr>")), "todos llevan la franja que les pasan");
ok(todos.every((x) => !x.html.includes("<img src=x") && !/onerror="/.test(x.html)), "lo que escribió cualquiera llega escapado, en todos",
  todos.find((x) => x.html.includes("<img src=x")) && todos.find((x) => x.html.includes("<img src=x")).html.slice(0, 200));
ok(c.confirmar.html.includes("&lt;img src=x"), "y se ve como texto, no desaparece");
ok(todos.every((x) => !/[\r\n]/.test(x.asunto)), "ningún asunto lleva saltos de línea", c.inscripcion.asunto);
ok(c.confirmar.html.includes('href="https://ajedrez-integral.com/pareo.html#org-correo=a.b"') && !c.malEnlace.html.includes("otro.com\""), "el botón lleva solo a ajedrez-integral.com");
ok(/48 horas/.test(c.confirmar.html) && /una hora/.test(c.recuperar.html), "dicen cuánto vale el enlace");
ok(/Sub-12/.test(c.inscripcion.html) && /LICEO/.test(c.inscripcion.html), "la inscripción dice quién, de dónde y su categoría");
ok(/datos personales/.test(c.reporteOrg.html) && /otra cosa/.test(c.reporteAdmin.html), "el reporte dice el motivo en palabras (y uno desconocido es «otra cosa»)");
ok(/8888-8888/.test(c.sello.html) && /Federación/.test(c.sello.html), "el pedido del sello trae a quién representa y cómo contactarle");

console.log("\n=== Lo que promete la función ===");
const fn = fs.readFileSync(path.join(RAIZ, "supabase/functions/pareo-publicar/index.ts"), "utf8");
const bloque = (desde, hasta) => fn.slice(fn.indexOf(desde), fn.indexOf(hasta, fn.indexOf(desde) + 1));
const recuperar = bloque('if (accion === "recuperar")', "\n  }\n");
ok(recuperar && /return json\(\{ ok: true \}\);\s*$/.test(recuperar.trimEnd()) && !/return json\(\{ ok: false[^}]*no (existe|está)/i.test(recuperar),
  "«recuperar» contesta siempre lo mismo: no dice si un correo está registrado");
ok(/\.not\("correo_confirmado", "is", null\)/.test(recuperar), "y solo manda a un correo ya confirmado");
const estado = bloque('if (accion === "organizador_estado" || accion === "pedir_sello")', "// ---------- Confirmar");
ok(/correo: tapado\(o\.correo\)/.test(estado) && !/correo: o\.correo\b/.test(estado), "la organización ve su correo tapado, nunca entero");
ok(/correoDe\(/.test(fn) && /data\.correo && data\.correo_confirmado \? data\.correo : null/.test(fn), "los avisos van solo a un correo confirmado");
ok(/correoInscripcion\(/.test(bloque('if (accion === "inscribir")', 'if (accion === "inscripciones"')), "cada inscripción le avisa a quien organiza");
const rep = bloque('if (accion === "reportar")', 'if (accion === "borrar")');
ok(/correoReporteAdmin\(/.test(rep) && /correoReporteOrganizador\(/.test(rep), "cada reporte le avisa a administración y a quien organiza");
ok(/body\.consentimiento !== true/.test(bloque('if (accion === "organizador")', "// ---------- Lo que la organización")), "un correo nuevo pide el consentimiento");
const sql = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261023145437_pareo_organizadores.sql"), "utf8");
ok(/grant select \(id, nombre, logo, verificado, oculto, creado, actualizado\) on public\.pareo_organizadores/.test(sql),
  "la lectura pública de las organizaciones es por columnas: el correo no está en la lista");

console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
