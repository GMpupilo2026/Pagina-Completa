/* Verifica los proyectos (admin.html#proyectos, proyecto.html) sin navegador.
 *
 * Lo que revisa, y por qué cada cosa falla CALLADA si no se revisa:
 *
 *  - El calendario: las sesiones van seguidas (1, 2, 3…), las fechas avanzan y
 *    caen en los días del horario del grupo. Una clase en un jueves de un grupo
 *    de martes y viernes no da ningún error: el profesor simplemente no la da.
 *  - Que cada clase tenga su momento divertido, en la guía Y en el plan que se
 *    abre en la clase en vivo (es lo que se pidió: que la clase no sea solo
 *    teoría).
 *  - Que cada lección del plan sea la que dice su título. El número que abre la
 *    clase en vivo es la posición del <details> en el HTML del curso
 *    (abrirLeccionLocal(slug, n) usa detalles[n-1]); un número corrido abre la
 *    lección de al lado. Y que sesion.js le sume el 1.
 *  - Las tareas semanales: semanas seguidas, de lunes a lunes, cada renglón con
 *    una herramienta que existe, la actividad con que de verdad se cuenta y un
 *    enlace que abre. El enlace de un cuestionario lleva la marca SIN
 *    codificar: codificada, el replace() del SQL no la encuentra y la tarea
 *    abre un cuestionario que no existe (pasó al sembrar la primera vez).
 *  - Que la página esté conectada: en la cabecera de la Academia, en el menú de
 *    admin y en el panel del profesor.
 *  - La migración: RLS en las cuatro tablas, ninguna política de escritura, y
 *    asignar_grupo_proyecto() cerrada a anon (revocada de public, no solo de
 *    anon).
 *
 * Corre después de herramientas/proyecto-semilla.js (lo encadena
 * verificar-todo.js en ANTES): revisa el JSON que escribe en herramientas/planes/.
 *
 *   node herramientas/proyecto-semilla.js && node herramientas/verificar-proyectos.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const { lecciones } = require("./lib/leer-curso");

global.window = global.window || {};
require(path.join(RAIZ, "js", "material-plataforma.js"));
const Material = global.window.MaterialPlataforma;
const metas = JSON.parse(leer("entreno/data/metas.json"));

let fallos = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fallos++; };
const malos = (lista, que) => {
  ok(!lista.length, lista.length ? `${que}:\n      ${lista.slice(0, 12).join("\n      ")}${lista.length > 12 ? "\n      … y " + (lista.length - 12) + " más" : ""}` : que.replace(/^(\w)/, (m) => m) + ": ninguno");
};

// 0 = domingo … 6 = sábado. Un día de calendario, sin horas que corran.
const diaSemana = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const sumarDias = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const diasDelHorario = (h) => Object.entries(DIAS).filter(([n]) => new RegExp("\\b" + n + "\\b").test(sinTildes(h))).map(([, d]) => d);

const carpeta = path.join(RAIZ, "herramientas", "proyectos");
const archivos = fs.readdirSync(carpeta).filter((f) => f.endsWith(".json"));
ok(archivos.length > 0, `hay proyectos para revisar (${archivos.join(", ")})`);

const leccionesCache = {};
const leccionesDe = (slug) => leccionesCache[slug] || (leccionesCache[slug] = lecciones(slug));

for (const archivo of archivos) {
  const slug = archivo.replace(/\.json$/, "");
  const fuente = JSON.parse(fs.readFileSync(path.join(carpeta, archivo), "utf8"));
  const generado = path.join(RAIZ, "herramientas", "planes", "proyecto-" + slug + ".json");
  console.log(`\n=== ${fuente.nombre} (${slug}) ===`);
  if (!fs.existsSync(generado)) { ok(false, "falta " + path.relative(RAIZ, generado) + ": corre herramientas/proyecto-semilla.js"); continue; }
  const gen = JSON.parse(fs.readFileSync(generado, "utf8"));

  console.log("\nEl calendario");
  for (const g of fuente.grupos) {
    const dias = diasDelHorario(g.horario);
    ok(dias.length > 0, `«${g.nombre}»: el horario dice qué días hay clase (${g.horario})`);
    const s = g.sesiones;
    malos(s.filter((x, i) => x.numero !== i + 1).map((x) => "sesión " + x.numero + " en el lugar " + (s.indexOf(x) + 1)), `«${g.nombre}»: sesiones fuera de orden`);
    malos(s.filter((x, i) => i > 0 && !(x.fecha > s[i - 1].fecha)).map((x) => x.numero + " (" + x.fecha + ")"), `«${g.nombre}»: fechas que no avanzan`);
    malos(s.filter((x) => dias.length && !dias.includes(diaSemana(x.fecha))).map((x) => x.numero + " · " + x.fecha), `«${g.nombre}»: clases fuera de los días del horario`);
    malos(s.filter((x) => !["clase", "especial", "evaluacion"].includes(x.tipo)).map((x) => x.numero + " · " + x.tipo), `«${g.nombre}»: tipos de sesión desconocidos`);
    malos(s.filter((x) => !(x.detalle && String(x.detalle.divertido || "").trim().length > 10)).map((x) => "sesión " + x.numero), `«${g.nombre}»: clases sin momento divertido`);
    malos(s.filter((x) => !(x.detalle && String(x.detalle.sitio || "").trim())).map((x) => "sesión " + x.numero), `«${g.nombre}»: clases sin qué usar de la plataforma`);
    ok(s.some((x) => x.tipo === "evaluacion"), `«${g.nombre}»: tiene clases de evaluación`);
    const guia = g.guia || {};
    ok(guia.intro && (guia.objetivos || []).length && (guia.evaluacion || []).length && (guia.rubrica || []).length,
      `«${g.nombre}»: la guía trae introducción, objetivos, evaluación y rúbrica`);
  }

  console.log("\nLos planes de la clase en vivo");
  const totalSesiones = fuente.grupos.reduce((n, g) => n + g.sesiones.length, 0);
  ok(gen.planes.length === totalSesiones, `un plan por sesión (${gen.planes.length} de ${totalSesiones})`);
  /* Cada clase dura 2 horas y va en cinco partes, en orden, cada una con su
     paso a paso: es lo que el profesor lee de arriba abajo en la clase en vivo. */
  const PARTES = [["🔥", "Calentamiento"], ["📘", "Contenido"], ["🎉", "Actividad recreativa"], ["✅", "Cierre"], ["📨", "Tarea"]];
  const partesDe = (p) => p.items.filter((i) => i.tipo === "nota" && /^(🔥|📘|🎉|✅|📨) \d\. .* · \d+ min$/.test(i.titulo));
  malos(gen.planes.filter((p) => JSON.stringify(partesDe(p).map((i) => i.titulo.split(" ")[0])) !== JSON.stringify(PARTES.map((x) => x[0])))
    .map((p) => p.titulo + ": " + partesDe(p).map((i) => i.titulo).join(" | ")), "planes sin las cinco partes en orden (calentamiento, contenido, actividad recreativa, cierre, tarea)");
  malos(gen.planes.filter((p) => partesDe(p).reduce((t, i) => t + Number(i.titulo.match(/(\d+) min$/)[1]), 0) !== 120)
    .map((p) => p.titulo), "clases que no suman 2 horas (120 minutos)");
  malos(gen.planes.filter((p) => partesDe(p).some((i) => (String(i.nota || "").match(/^\d+\. /gm) || []).length < 2))
    .map((p) => p.titulo + ": " + partesDe(p).filter((i) => (String(i.nota || "").match(/^\d+\. /gm) || []).length < 2).map((i) => i.titulo).join(", ")),
    "partes sin paso a paso (al menos dos pasos numerados)");
  malos(gen.planes.filter((p) => {
    const t = p.items.map((i) => i.titulo);
    const k = (re) => t.findIndex((x) => re.test(x));
    // Los ejercicios de cada parte van debajo de su nota y antes de la parte siguiente.
    return p.items.some((i, n) => i.tipo === "posicion" && (/^Calentamiento · /.test(i.titulo) ? !(n > k(/^🔥/) && n < k(/^📘/)) : !(n > k(/^📘/) && n < k(/^🎉/))));
  }).map((p) => p.titulo), "ejercicios fuera de su parte");
  malos(gen.planes.filter((p) => p.items.filter((i) => /^Calentamiento · Ejercicio /.test(i.titulo)).length < 2).map((p) => p.titulo), "clases con menos de dos ejercicios de calentamiento");
  malos(gen.planes.flatMap((p) => p.items.filter((i) => i.tipo === "posicion" && !/② Pregunta: «.+» ③ ⏳ \d+ min.* ④ Respuesta: ./.test(i.pregunta || "")).map((i) => p.titulo + " · " + i.titulo)),
    "ejercicios sin su paso a paso (pregunta, tiempo y respuesta)");
  malos(gen.planes.flatMap((p) => p.items.filter((i) => (i.nota || "").length > 2000 || (i.pregunta || "").length > 500 || i.titulo.length > 200).map((i) => p.titulo + " · " + i.titulo)),
    "renglones que la base rechazaría por largos");
  const calientes = gen.planes.flatMap((p) => p.items.filter((i) => /^Calentamiento · /.test(i.titulo)).map((i) => i.fen));
  const delContenido = new Set(gen.planes.flatMap((p) => p.items.filter((i) => /^Contenido · /.test(i.titulo)).map((i) => i.fen)));
  ok(new Set(calientes).size === calientes.length && !calientes.some((f) => delContenido.has(f)),
    `los ${calientes.length} ejercicios de calentamiento no se repiten ni repiten uno del contenido`);
  malos(gen.planes.filter((p) => { const r = partesDe(p)[2]; return !r || /^Qué es: [^\n]*$/.test(r.nota); }).map((p) => p.titulo),
    "actividades recreativas sin su paso a paso");
  for (const g of fuente.grupos) {
    malos(g.sesiones.filter((s) => {
      const p = gen.planes.find((x) => x.grupo === g.slug && x.numero === s.numero);
      const t = g.tareas.find((x) => x.desde <= s.fecha && s.fecha < x.vence);
      const nota = p && partesDe(p)[4];
      return !t || !nota || !nota.nota.includes("«" + t.titulo + "»");
    }).map((s) => "sesión " + s.numero), `«${g.nombre}»: clases cuya parte «Tarea» no presenta la tarea de esa semana`);
  }
  malos(gen.planes.filter((p) => !p.items.some((i) => i.tipo === "posicion" || i.tipo === "leccion") &&
    !/Minilecciones|Cierre|Retroalimentación final|Torneo|Arranque|Analizar/.test(p.titulo)).map((p) => p.titulo),
    "clases de contenido sin ninguna posición ni lección para el tablero");
  const leccionMal = [];
  for (const p of gen.planes) {
    for (const i of p.items.filter((x) => x.tipo === "leccion")) {
      let lista;
      try { lista = leccionesDe(i.curso); } catch (e) { leccionMal.push(p.titulo + ": no existe el curso " + i.curso); continue; }
      const l = lista[i.leccion];
      const n = (i.titulo.match(/ · (\d+)\. /) || [])[1];
      if (!l) leccionMal.push(`${p.titulo}: ${i.curso} no tiene el <details> ${i.leccion}`);
      else if (String(l.n) !== n) leccionMal.push(`${p.titulo}: «${i.titulo}» abre la lección ${l.n} («${l.titulo}»)`);
    }
  }
  malos(leccionMal, "lecciones que abrirían otra en la clase en vivo");
  const sesion = leer("js/sesion.js");
  ok(/abrirLeccionLocal\(item\.curso,\s*item\.leccion \+ 1\)/.test(sesion),
    "sesion.js abre la lección del plan con el +1 (leccion cuenta desde 0; abrirLeccionLocal, desde 1)");
  ok(/searchParams|URLSearchParams/.test(sesion) && /get\("plan"\)/.test(sesion), "la clase en vivo acepta sesion.html?plan=");
  ok(/compartidosConmigo\.some\(\(p\) => p\.id === pedido\)/.test(leer("js/planes.js")),
    "planes.html?plan= abre también un plan compartido (los del proyecto se le comparten al profesor)");

  console.log("\nLas tareas semanales");
  for (const g of fuente.grupos) {
    const t = g.tareas;
    malos(t.filter((x, i) => x.semana !== i + 1).map((x) => "semana " + x.semana), `«${g.nombre}»: semanas fuera de orden`);
    malos(t.filter((x) => !(x.desde < x.vence) || sumarDias(x.desde, 7) < x.vence).map((x) => `semana ${x.semana}: ${x.desde} → ${x.vence}`), `«${g.nombre}»: semanas que no van de una fecha a otra en 7 días o menos`);
    malos(t.filter((x, i) => i > 0 && x.desde !== t[i - 1].vence).map((x) => "semana " + x.semana), `«${g.nombre}»: semanas que no empiezan donde terminó la anterior`);
    malos(t.filter((x) => diaSemana(x.desde) !== 1).map((x) => `semana ${x.semana} (${x.desde})`), `«${g.nombre}»: semanas que no empiezan en lunes`);
    malos(t.filter((x) => !new RegExp("^Semana " + x.semana + " · ").test(x.titulo)).map((x) => x.titulo), `«${g.nombre}»: títulos que no dicen la semana`);
    const ultimaClase = g.sesiones[g.sesiones.length - 1].fecha;
    ok(t.length && t[t.length - 1].vence >= ultimaClase, `«${g.nombre}»: las tareas llegan hasta la última clase (${ultimaClase})`);
  }
  const renglonMal = [];
  for (const t of gen.tareas) {
    const donde = `${t.grupo} semana ${t.semana}`;
    if (!t.items.length || t.items.length > 20) renglonMal.push(donde + ": " + t.items.length + " renglones");
    for (const r of t.items) {
      if (r.material_tipo === "curso") {
        if (!/^\d+$/.test(r.leccion) || r.meta_tipo !== "completar") renglonMal.push(`${donde}: curso ${r.material_slug} con lección «${r.leccion}» y meta ${r.meta_tipo}`);
        continue;
      }
      const h = Material.herramienta(r.material_slug);
      if (!h) { renglonMal.push(`${donde}: no existe la herramienta «${r.material_slug}»`); continue; }
      if (!h.metas.includes(r.meta_tipo)) renglonMal.push(`${donde}: «${r.material_slug}» no admite la meta ${r.meta_tipo}`);
      if (r.meta_tipo !== "completar" && !(r.meta_cantidad > 0)) renglonMal.push(`${donde}: «${r.material_slug}» sin cantidad`);
      if (h.slug === "cuestionario") {
        const marca = r.filtro_clave;
        if (!/^@@cuestionario:[^@]+@@$/.test(marca)) renglonMal.push(`${donde}: cuestionario sin su marca`);
        if (r.material_href !== h.hrefRecorte("") + marca) renglonMal.push(`${donde}: el enlace del cuestionario no lleva la marca tal cual (${r.material_href})`);
        continue;
      }
      const recorte = r.filtro_clave ? (metas[h.recortes] || []).find((x) => x.clave === r.filtro_clave) : null;
      if (r.filtro_clave && !recorte) { renglonMal.push(`${donde}: «${h.slug}» no tiene el recorte «${r.filtro_clave}»`); continue; }
      const esperadas = Material.actividadesDe(h, recorte);
      if (JSON.stringify(esperadas) !== JSON.stringify(r.actividades)) renglonMal.push(`${donde}: «${h.slug}» cuenta ${JSON.stringify(r.actividades)} y debería contar ${JSON.stringify(esperadas)}`);
      const href = recorte && h.hrefRecorte ? h.hrefRecorte(recorte.clave) : h.href;
      if (r.material_href !== href) renglonMal.push(`${donde}: «${h.slug}» lleva a ${r.material_href} y no a ${href}`);
    }
  }
  malos(renglonMal, "renglones de tarea que no se llenarían o no abrirían");
  ok(gen.tareas.some((t) => t.items.some((r) => ["batalla-naval", "sonar", "confites", "ilumina", "memoria"].includes(r.material_slug))),
    "las tareas traen también juegos, no solo ejercicios");
}

console.log("\nLa página, conectada");
const cabecera = leer("herramientas/academia-cabecera.py");
ok(/"proyecto\.html"/.test(cabecera.split("NOMBRE_Y_PADRE")[0]), "proyecto.html va en PAGINAS de academia-cabecera.py (guardia de sesión)");
ok(/"proyecto\.html": \("Proyecto", "clases\.html"\)/.test(cabecera), "y en NOMBRE_Y_PADRE (las migas)");
const pagina = leer("proyecto.html");
ok(/<script src="js\/proyecto\.js"><\/script>/.test(pagina) && /<script src="js\/hora-cr\.js"><\/script>/.test(pagina) && /<script src="js\/material-plataforma\.js"><\/script>/.test(pagina),
  "proyecto.html carga su código, hora-cr y el catálogo de material");
ok(!/\son[a-z]+="/.test(pagina), "proyecto.html sin atributos on…");
const codigo = leer("js/proyecto.js");
ok(!/innerHTML/.test(codigo), "proyecto.js pinta todo con textContent (la guía la escribió una persona)");
ok(!/\b(alert|confirm|prompt)\(/.test(codigo), "proyecto.js sin alert/confirm/prompt");
ok(/HoraCR\.desdeCampo\(venceVal\)/.test(codigo), "el vencimiento se lee en hora de Costa Rica");
ok(/range\(desde, desde \+ 999\)/.test(codigo), "los alumnos se piden de mil en mil");
const admin = leer("admin.html"), adminJs = leer("js/admin.js");
ok(/data-ir="proyectos"/.test(admin) && /data-seccion="proyectos"/.test(admin), "admin.html tiene la ficha «Proyectos» en el menú y su sección");
ok(/"proyectos"/.test(adminJs.match(/const SECCIONES = \[[^\]]*\]/)[0]), "y admin.js la cuenta entre sus secciones");
ok(/AdminProyectos\.iniciar\(/.test(adminJs) && /<script src="js\/admin-proyectos\.js"><\/script>/.test(admin), "admin.js arranca js/admin-proyectos.js");
ok(/rpc\("asignar_grupo_proyecto"/.test(leer("js/admin-proyectos.js")), "la asignación pasa por asignar_grupo_proyecto()");
const clases = leer("js/clases.js");
ok(/hrefs: \["proyecto\.html"/.test(clases), "el panel del profesor ubica la tarjeta en «Tus clases»");
ok(/from\("proyecto_grupos"\)[^\n]*\.eq\("profesor_id", quien\)/.test(clases), "y la muestra solo si tiene un grupo asignado");

console.log("\nLa base");
const migracion = fs.readdirSync(path.join(RAIZ, "supabase", "migraciones")).find((f) => /_proyectos\.sql$/.test(f));
ok(!!migracion, "la migración está guardada en supabase/migraciones/");
if (migracion) {
  const sql = fs.readFileSync(path.join(RAIZ, "supabase", "migraciones", migracion), "utf8");
  for (const t of ["proyectos", "proyecto_grupos", "proyecto_sesiones", "proyecto_tareas"]) {
    ok(new RegExp(`alter table public\\.${t} enable row level security`).test(sql), `${t} con RLS`);
  }
  // Política por política: el «for update» del select de la función no cuenta.
  const politicas = sql.match(/create policy[^;]*;/g) || [];
  ok(politicas.length === 4 && politicas.every((p) => /\bfor select\b/.test(p)), `ninguna política de escritura: las ${politicas.length} son de lectura`);
  ok(/revoke execute on function public\.asignar_grupo_proyecto\(uuid, uuid\) from public, anon/.test(sql), "asignar_grupo_proyecto() revocada de public y anon");
  ok(/coalesce\(\(select public\.soy_admin\(\)\), false\)/.test(sql), "y el permiso envuelto en coalesce (con auth.uid() nulo no deja pasar)");
  ok(/execute function interno\.auditar\(/.test(sql), "la asignación queda en la bitácora de auditoría");
}
const inventario = leer("supabase/esquema/inventario-academia.txt");
ok(/^funcion  asignar_grupo_proyecto\(p_grupo uuid, p_profesor uuid\)  definer  anon=false  auth=true$/m.test(inventario),
  "el retrato del esquema la tiene, cerrada a anon");

console.log(fallos ? `\n${fallos} cosas por arreglar.` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
