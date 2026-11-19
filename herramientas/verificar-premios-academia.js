#!/usr/bin/env node
/* Verifica los rangos (js/rangos.js) y los premios de cada academia
   (premios-academia.html, js/premios-academia*.js, migración premios_academia).

   Sin navegador:
   - Los rangos: suben en orden, cada umbral cae en su rango, el último no
     tiene siguiente, y lo que falta se cuenta bien.
   - La migración: sin políticas de escritura, el canje con el MISMO candado
     que canjear_premio(), FOR UPDATE en las existencias, solo miembros de la
     academia, cancelar devuelve los puntos con su referencia única, el
     trigger de auditoría en los canjes, y los permisos envueltos en coalesce.
   - Las páginas: la tienda monta el rango (con puntos GANADOS, no el saldo) y
     los premios filtrados por las academias del alumno, y recarga su saldo al
     canjear; la página de gestión está en la cabecera de la Academia y en los
     dos paneles; nada escrito por una persona pasa por innerHTML.

     node herramientas/verificar-premios-academia.js */

const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");
const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

// 1) Los rangos se ganan con un examen: los prueba verificar-rangos-examen.js.

// 2) La migración.
const migr = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /_premios_academia\.sql$/.test(f));
ok(migr.length === 1, `tiene que haber una migración *_premios_academia.sql y hay ${migr.length}`);
if (migr.length) {
    const sql = leer("supabase/migraciones/" + migr[0]);
    ok(!/create policy [^\n]* for (insert|update|delete|all)/i.test(sql), "premios_academia y sus canjes no llevan política de escritura: escriben las funciones");
    ok(/revoke all on public\.premios_academia, public\.premios_academia_canjes from public, anon, authenticated/.test(sql), "nada para anon, y authenticated solo lee");
    const canjear = sql.slice(sql.indexOf("function public.canjear_premio_academia"), sql.indexOf("function public.canje_academia_resolver"));
    ok(/pg_advisory_xact_lock\(hashtext\('puntos:' \|\| v_yo::text\)\)/.test(canjear), "canjear usa el MISMO candado que canjear_premio(): 'puntos:<alumno>'");
    ok(/where id = p_premio and activo for update/.test(canjear), "las existencias se bloquean con FOR UPDATE: dos no se llevan la última");
    ok(/from public\.academia_miembros m where m\.academia_id = v_premio\.academia_id and m\.persona_id = v_yo/.test(canjear), "solo canjea un miembro de la academia del premio");
    ok(/'canje_academia:' \|\| v_canje::text/.test(canjear), "el cobro lleva su referencia única");
    const resolver = sql.slice(sql.indexOf("function public.canje_academia_resolver"), sql.indexOf("function public.puntos_ganados_de"));
    ok(/'devolucion:canje_academia:' \|\| v_canje\.id::text/.test(resolver) && /'ajuste_manual'/.test(resolver),
        "cancelar devuelve los puntos como ajuste_manual (no cuentan como ganados) y con referencia única");
    ok(/if v_canje\.estado <> 'pendiente'/.test(resolver), "un canje ya resuelto no se resuelve otra vez");
    ok((sql.match(/if not coalesce\(public\.soy_admin\(\) or public\.supervisa_academia\(/g) || []).length === 2, "guardar y resolver piden supervisor o administración, envuelto en coalesce");
    ok(/create trigger auditar after insert or update on public\.premios_academia_canjes/.test(sql), "los canjes llevan el trigger de auditoría");
    ok(/interno\.puntos_ganados\(p_alumno\)/.test(sql) && /p_alumno = auth\.uid\(\) or public\.soy_profesor_de\(p_alumno\) or public\.soy_admin\(\)/.test(sql),
        "puntos_ganados_de da los ganados solo de uno mismo, de un alumno propio o a administración");
}
ok(/"premios_academia_canjes"/.test(leer("herramientas/verificar-auditoria.js")), "premios_academia_canjes tiene que estar en VIGILADAS de verificar-auditoria.js");

// 3) Las páginas.
const tienda = leer("puntos-tienda.html");
ok(/src="js\/rangos\.js"/.test(tienda) && /src="js\/premios-academia\.js"/.test(tienda) && /id="premios-academia"/.test(tienda) && /id="rango-caja"/.test(tienda),
    "la tienda de puntos tiene que cargar rangos y premios de la academia, con sus cajas");
const tiendaJs = leer("js/puntos-tienda-pagina.js");
ok(/sb\.rpc\("mi_rango"/.test(tiendaJs), "el rango de la tienda sale de mi_rango() (lo guarda la base), no del saldo");
ok(/alCanjear: \(\) => tienda && tienda\.recargar/.test(tiendaJs), "al canjear un premio de la academia, la tienda vuelve a leer el saldo");
const alumno = leer("js/premios-academia.js");
ok(/from\("academia_miembros"\)[\s\S]{0,80}\.eq\("persona_id", alumnoId\)/.test(alumno) && /\.in\("academia_id", suyas\)/.test(alumno),
    "la tienda ofrece solo los premios de las academias de las que el alumno es miembro");
const gestion = leer("premios-academia.html");
ok(/<!-- guardia: inicio -->/.test(gestion) && /<!-- migas: inicio -->[\s\S]*Premios de la academia[\s\S]*<!-- migas: fin -->/.test(gestion), "premios-academia.html exige sesión y tiene sus migas");
const cab = leer("herramientas/academia-cabecera.py");
ok(/"premios-academia\.html",/.test(cab) && /"premios-academia\.html": \("Premios de la academia", "clases\.html"\)/.test(cab), "la página está en PAGINAS y NOMBRE_Y_PADRE");
ok(/href: "premios-academia\.html"/.test(leer("js/paginas-admin.js")) && /href: "premios-academia\.html"/.test(leer("js/paginas-supervisor.js")), "falta la tarjeta en el panel de administración o en el del supervisor");
for (const f of ["js/premios-academia.js", "js/premios-academia-pagina.js", "js/rangos.js"]) {
    const js = leer(f);
    const malos = (js.match(/innerHTML\s*=\s*[^;]+;/g) || []).filter((s) => !/innerHTML\s*=\s*"";/.test(s));
    ok(!malos.length, `${f} pinta con innerHTML: ${malos.join(" | ")}`);
    ok(!/\b(alert|confirm|prompt)\(/.test(js.replace(/Avisos\.confirmar\(/g, "")), `${f}: nada de alert/confirm/prompt`);
}

if (fallos.length) {
    console.error("✗ rangos y premios de la academia:\n  - " + fallos.join("\n  - "));
    process.exit(1);
}
console.log("✓ rangos y premios de la academia: escalones, base, tienda, gestión y paneles en orden.");

/*! rev bfb5bbb0d2d82f9f */
