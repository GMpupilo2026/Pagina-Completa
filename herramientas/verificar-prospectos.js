#!/usr/bin/env node
/* Verifica los interesados (prospectos.html, js/prospectos.js, tabla prospectos).

   Sin navegador:
   - La migración: RLS encendida, nada para anon, las cuatro políticas con el
     conjunto de academias armado UNA vez y auth.uid() envuelto, el trigger que
     sella quién lo creó y las horas, y la purga de los descartados a los 12
     meses.
   - La página: en la cabecera de la Academia con sus migas, la guardia de
     sesión, la hora de Costa Rica (js/hora-cr.js) y nada escrito por una
     persona pintado con innerHTML.
   - Los paneles: la tarjeta «Interesados» en el de administración y en el del
     supervisor, y la política de privacidad dice qué se guarda y por cuánto.

     node herramientas/verificar-prospectos.js */

const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

const migr = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /_prospectos\.sql$/.test(f));
ok(migr.length === 1, `tiene que haber una migración *_prospectos.sql y hay ${migr.length}`);
if (migr.length) {
    const sql = leer("supabase/migraciones/" + migr[0]);
    ok(/alter table public\.prospectos enable row level security/.test(sql), "prospectos tiene que tener la RLS encendida");
    ok(/revoke all on public\.prospectos from public, anon, authenticated/.test(sql), "anon no puede tener nada sobre prospectos");
    const politicas = sql.match(/create policy prospectos_\w+ on public\.prospectos for (select|insert|update|delete)/g) || [];
    ok(politicas.length === 4, `tiene que haber cuatro políticas (ver, agregar, cambiar, borrar) y hay ${politicas.length}`);
    const cuerpo = sql.slice(sql.indexOf("create policy prospectos_ver"), sql.indexOf("create or replace function interno.prospectos_sellar"));
    ok(!/auth\.uid\(\)/.test(cuerpo.replace(/\(select auth\.uid\(\)\)/g, "")), "en las políticas auth.uid() va envuelto: (select auth.uid())");
    ok((cuerpo.match(/academia_id in \(select a\.id from public\.academias a where a\.supervisor_id = \(select auth\.uid\(\)\)\)/g) || []).length === 5,
        "cada política arma el conjunto de academias del supervisor UNA vez (academia_id in (select …)), no fila por fila");
    ok(!/supervisa_academia\(academia_id\)/.test(cuerpo), "las políticas no preguntan academia por academia (supervisa_academia por fila)");
    ok(/new\.creado_por := auth\.uid\(\)/.test(sql) && /new\.creado_por := old\.creado_por/.test(sql) && /new\.updated_at := now\(\)/.test(sql),
        "el trigger tiene que sellar quién lo creó y las horas: el navegador no las manda");
    ok(/cron\.schedule\('prospectos-purga-descartados'/.test(sql) && /estado = 'descartado' and updated_at < now\(\) - interval '12 months'/.test(sql),
        "los descartados se borran solos a los 12 meses");
}

const html = leer("prospectos.html");
ok(/<!-- guardia: inicio -->/.test(html), "la página exige sesión: le falta la guardia");
ok(/<!-- migas: inicio -->[\s\S]*aria-current="page"[^>]*>Interesados<[\s\S]*<!-- migas: fin -->/.test(html), "la página no tiene sus migas (correr academia-cabecera.py)");
ok(/src="js\/hora-cr\.js"/.test(html), "la página tiene que cargar js/hora-cr.js: «toca hoy» es el día de Costa Rica");
ok(/href="privacidad\.html"/.test(html), "la página recuerda la política de privacidad");
const cab = leer("herramientas/academia-cabecera.py");
ok(/"prospectos\.html",/.test(cab) && /"prospectos\.html": \("Interesados", "clases\.html"\)/.test(cab), "prospectos.html tiene que estar en PAGINAS y en NOMBRE_Y_PADRE de academia-cabecera.py");

const js = leer("js/prospectos.js");
const malos = (js.match(/innerHTML\s*=\s*[^;]+;/g) || []).filter((s) => !/innerHTML\s*=\s*"";/.test(s));
ok(!malos.length, `js/prospectos.js pinta con innerHTML algo que no es vaciar: ${malos.join(" | ")}`);
ok(/HoraCR\.hoy\(\)/.test(js) && !/toISOString\(\)\.slice\(0, ?10\)/.test(js), "el «hoy» sale de HoraCR.hoy(), no de toISOString()");
ok(!/\b(alert|confirm|prompt)\(/.test(js.replace(/Avisos\.confirmar\(/g, "")), "nada de alert/confirm/prompt: se usa js/avisos.js");
ok(/\.range\(desde, desde \+ PASO - 1\)/.test(js), "la lista se pide de mil en mil: PostgREST corta a ~1000 filas sin avisar");

ok(/href: "prospectos\.html"/.test(leer("js/paginas-admin.js")), "falta la tarjeta «Interesados» en el panel de administración");
ok(/href: "prospectos\.html"/.test(leer("js/paginas-supervisor.js")), "falta la tarjeta «Interesados» en el panel del supervisor");
const priv = leer("privacidad.html");
ok(/Si preguntas por clases:/.test(priv) && /se borra a los 12 meses/.test(priv), "la política de privacidad tiene que decir qué se anota de quien pregunta por clases y por cuánto");

if (fallos.length) {
    console.error("✗ interesados:\n  - " + fallos.join("\n  - "));
    process.exit(1);
}
console.log("✓ interesados: RLS por conjunto, sellado, purga, página, paneles y privacidad en orden.");

/*! rev bfb5bbb0d2d82f9f */
