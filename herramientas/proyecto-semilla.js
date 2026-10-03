/* Siembra un proyecto (admin.html#proyectos): sus grupos, el calendario de
 * sesiones —cada una con su plan de clase para la clase en vivo— y las tareas
 * semanales listas para mandar.
 *
 * El contenido vive en herramientas/proyectos/<slug>.json (la guía de cada
 * grupo, lo que se hace en cada clase, qué lecciones y qué posiciones lleva su
 * plan, y las tareas de cada semana). Este script lo convierte en SQL.
 *
 * NINGUNA POSICIÓN SE INVENTA. El JSON no trae ni una FEN: dice DE DÓNDE sale
 * cada posición (un final de «El mapa de los finales», un tema de Ejercicios por
 * tema, un mate del banco, una línea de Aperturas) y acá se busca en ese banco,
 * con las mismas funciones que los planes de arranque (lib/planes-banco.js), y
 * pasa por la regla de la clase en vivo.
 *
 * Las LECCIONES se buscan por su título en el HTML del curso, no por número: el
 * número que abre la clase en vivo es la posición del <details> en la página,
 * y en un curso con «Solución» entre lección y lección no coincide con el que
 * dice el título. Un número escrito a mano abriría la lección de al lado.
 *
 * Las TAREAS se arman con el mismo catálogo que tareas.html
 * (js/material-plataforma.js, cargado tal cual): con qué nombre apunta cada
 * herramienta en training_progress, qué meta admite y a dónde lleva el enlace.
 * Un renglón con la actividad equivocada se queda en cero para siempre sin dar
 * ningún error.
 *
 * Uso:  npm install
 *       node herramientas/proyecto-semilla.js [campeones-colegiales-2026]
 * Escribe herramientas/planes/proyecto-<slug>.json (lo que revisa
 * verificar-planes-semilla.js) y .sql (lo que se aplica). El SQL se puede correr
 * las veces que haga falta: vuelve a sembrar el contenido sin tocar a qué
 * profesor se asignó cada grupo, y le vuelve a compartir sus planes.
 */
const fs = require("fs");
const path = require("path");

const banco = require("./lib/planes-banco");
const { RAIZ, contador, leerJSON, chuletaDeDiagrama, recorta, posicion, nota,
        renglonDeLinea, lineasDeAperturas, ejerciciosDeTema, renglonDeEjercicio } = banco;
const { lecciones: leccionesDeCurso } = require("./lib/leer-curso");

/* Los planes son de quien administra, como los de arranque: un plan es del
   profesor que lo escribió (la RLS no deja firmar por otro). Al profesor del
   grupo se le COMPARTEN; no se le copian. */
const PROFESOR_ID = process.env.PROFESOR_ID || "5fc884eb-5374-4353-9a5d-60454c0be6c9";

const SLUG = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "campeones-colegiales-2026";
const proyecto = leerJSON(path.join("herramientas", "proyectos", SLUG + ".json"));

// --------------------------------------------------------------- el catálogo
global.window = global.window || {};
require(path.join(RAIZ, "js", "material-plataforma.js"));
const Material = global.window.MaterialPlataforma;
const metas = leerJSON("entreno/data/metas.json");
const catalogo = leerJSON("herramientas/cursos/catalogo.json").cursos;
const { LISTOS } = require("./cuestionarios-listos.js");

const errores = [];
const falla = (m) => errores.push(m);

// ------------------------------------------------------------------ bancos
const mapa = leerJSON("cursos/protegido/data/el-mapa-de-los-finales.json");
const estrategia = leerJSON("cursos/protegido/data/estrategia-en-el-final.json");
const temas = leerJSON("entreno/data/temas.json");
const mates = leerJSON("entreno/data/mates.json");
const lineas = lineasDeAperturas();

const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function posicionesDe(spec, contexto) {
    if (spec.fuente === "mapa") {
        const f = mapa.finales.find((x) => x.capitulo === spec.capitulo && x.titulo === spec.titulo);
        if (!f) { falla(contexto + ": no hay final «" + spec.titulo + "» en «" + spec.capitulo + "»"); return []; }
        const ds = (f.diagramas || []).slice(spec.desde || 0, (spec.desde || 0) + spec.n);
        if (ds.length < spec.n) falla(contexto + ": «" + spec.titulo + "» no tiene " + spec.n + " diagramas desde el " + (spec.desde || 0));
        return ds.map((d) => posicion(d.titulo || f.titulo, d.fen, chuletaDeDiagrama(d)));
    }
    if (spec.fuente === "estrategia") {
        const f = estrategia.finales.find((x) => x.titulo === spec.titulo);
        if (!f) { falla(contexto + ": no hay «" + spec.titulo + "» en Estrategia en el final"); return []; }
        return (f.diagramas || []).slice(0, spec.n).map((d) => posicion(d.titulo || f.titulo, d.fen, chuletaDeDiagrama(d)));
    }
    if (spec.fuente === "tema") {
        const elegidos = ejerciciosDeTema(temas, spec.tema, spec.n, spec.desde || 0);
        if (elegidos.length < spec.n) falla(contexto + ": el tema «" + spec.tema + "» no tiene " + spec.n + " ejercicios");
        const nombre = (metas.temas.find((t) => t.clave === spec.tema) || {}).label || spec.tema;
        return elegidos.map((p, i) => renglonDeEjercicio(p, nombre + " " + ((spec.desde || 0) + i + 1)));
    }
    if (spec.fuente === "mate") {
        const lista = mates.filter((p) => p && p.category === spec.cat && p.fen && banco.fenUsable(p.fen))
            .slice(spec.desde || 0, (spec.desde || 0) + spec.n);
        if (lista.length < spec.n) falla(contexto + ": no hay " + spec.n + " de «" + spec.cat + "»");
        const NOMBRE = { mate1: "Mate en 1", mate2: "Mate en 2", mate3: "Mate en 3" };
        return lista.map((p, i) => posicion(NOMBRE[spec.cat] + " · " + ((spec.desde || 0) + i + 1), p.fen,
            banco.turnoDe(p.fen) + " · Solución: " + (p.solution || []).map(banco.aEspanol).join(" ")));
    }
    if (spec.fuente === "linea") {
        const l = lineas.find((x) => x.id === spec.id);
        if (!l) { falla(contexto + ": no hay línea «" + spec.id + "»"); return []; }
        return [renglonDeLinea(l)];
    }
    falla(contexto + ": fuente desconocida «" + spec.fuente + "»");
    return [];
}

/* La lección por su título. Devuelve el renglón con `leccion` contada desde 0
   entre los <details> de primer nivel: es la que abre la clase en vivo. */
const leccionesCache = {};
function renglonDeLeccion(spec, contexto) {
    const lista = leccionesCache[spec.curso] || (leccionesCache[spec.curso] = leccionesDeCurso(spec.curso));
    const buscado = sinTildes(spec.titulo);
    const l = lista.find((x) => sinTildes(x.titulo).startsWith(buscado));
    if (!l) { falla(contexto + ": no hay lección «" + spec.titulo + "» en " + spec.curso); return null; }
    const curso = catalogo.find((c) => c.slug === spec.curso);
    return { tipo: "leccion", titulo: recorta((curso ? curso.titulo : spec.curso) + " · " + l.n + ". " + l.titulo, 200),
             curso: spec.curso, leccion: l.idxDetalle };
}

// --------------------------------------------------------------- los planes
const planes = [];
const sesionesSQL = [];
for (const g of proyecto.grupos) {
    for (const s of g.sesiones) {
        const contexto = g.nombre + " " + s.numero;
        const d = s.detalle;
        const items = [];
        const bloques = d.bloques.map(([k, v]) => k + ": " + v).join("\n");
        items.push(nota("Cómo va la clase", (d.objetivo ? "Objetivo: " + d.objetivo + "\n" : "") + bloques));
        for (const l of s.plan.lecciones) { const r = renglonDeLeccion(l, contexto); if (r) items.push(r); }
        for (const p of s.plan.posiciones) items.push(...posicionesDe(p, contexto).filter(Boolean));
        items.push(nota("🎉 Momento divertido", d.divertido));
        if (d.taller) items.push(nota("Para el taller", d.taller));
        items.push(nota("En ajedrez-integral.com", d.sitio));
        const numero = String(s.numero).padStart(2, "0");
        const plan = {
            grupo: g.slug, numero: s.numero,
            titulo: recorta(proyecto.nombre + " · " + g.nombre + " " + numero + " · " + s.titulo, 200),
            notas: recorta("Proyecto " + proyecto.nombre + ", grupo «" + g.nombre + "», clase " + s.numero + " (" + s.dia + "). " +
                           "La guía completa está en la página del proyecto.", 4000),
            items: items.map((it, i) => Object.assign({ orden: i }, it)),
        };
        planes.push(plan);
    }
}

// --------------------------------------------------------------- las tareas
function renglonDeTarea(spec, contexto) {
    if (spec.curso) {
        const c = catalogo.find((x) => x.slug === spec.curso);
        if (!c) { falla(contexto + ": no hay curso " + spec.curso); return null; }
        if (!(spec.leccion >= 1 && spec.leccion <= c.lecciones)) falla(contexto + ": " + spec.curso + " no tiene lección " + spec.leccion);
        return { material_tipo: "curso", material_slug: c.slug, material_label: c.titulo,
                 material_href: "cursos/academia/" + c.slug + ".html", filtro_clave: "", filtro_label: "",
                 leccion: String(spec.leccion), actividades: [], meta_tipo: "completar", meta_cantidad: null };
    }
    const h = Material.herramienta(spec.herramienta);
    if (!h || h.noSeElige) { falla(contexto + ": no se puede mandar «" + spec.herramienta + "»"); return null; }
    if (spec.cuestionario) {
        if (!LISTOS.some((q) => q.titulo === spec.cuestionario)) falla(contexto + ": no hay cuestionario listo «" + spec.cuestionario + "»");
        // El id lo pone la base al sembrar: el cuestionario listo vive allá.
        const marca = "@@cuestionario:" + spec.cuestionario + "@@";
        // La marca va SIN codificar también en el enlace: hrefRecorte(marca)
        // la escribe como %40%40…, el replace() del SQL no la encuentra y la
        // tarea abre un cuestionario que no existe. Un uuid no necesita
        // codificarse, así que el enlace queda igual a hrefRecorte(id).
        return { material_tipo: "herramienta", material_slug: h.slug, material_label: h.label,
                 material_href: h.hrefRecorte("") + marca, filtro_clave: marca, filtro_label: spec.cuestionario, leccion: "",
                 actividades: Material.actividadesDe(h, null), meta_tipo: "cantidad", meta_cantidad: 1 };
    }
    let recorte = null;
    if (spec.recorte) {
        recorte = ((metas[h.recortes] || [])).find((r) => r.clave === spec.recorte);
        if (!recorte) { falla(contexto + ": «" + h.slug + "» no tiene el recorte «" + spec.recorte + "»"); return null; }
        if (recorte.total && spec.cantidad > recorte.total) falla(contexto + ": se piden " + spec.cantidad + " de «" + recorte.label + "», que tiene " + recorte.total);
    }
    const meta = spec.meta || (h.metas.includes("cantidad") ? "cantidad" : h.metas[0]);
    if (!h.metas.includes(meta)) falla(contexto + ": «" + h.slug + "» no admite la meta «" + meta + "»");
    const actividades = meta === "completar" ? [] : Material.actividadesDe(h, recorte);
    if (meta !== "completar" && !actividades.length) falla(contexto + ": «" + h.slug + "» sin actividad que contar");
    return { material_tipo: "herramienta", material_slug: h.slug, material_label: h.label,
             material_href: recorte && h.hrefRecorte ? h.hrefRecorte(recorte.clave) : h.href,
             filtro_clave: recorte ? recorte.clave : "", filtro_label: recorte ? recorte.label : "", leccion: "",
             actividades, meta_tipo: meta, meta_cantidad: meta === "completar" ? null : spec.cantidad };
}

const tareas = [];
for (const g of proyecto.grupos) {
    for (const t of g.tareas) {
        const contexto = g.nombre + " semana " + t.semana;
        const items = t.items.map((x) => renglonDeTarea(x, contexto)).filter(Boolean);
        if (!items.length || items.length > 20) falla(contexto + ": " + items.length + " renglones");
        tareas.push({ grupo: g.slug, semana: t.semana, desde: t.desde, vence: t.vence, titulo: t.titulo,
                      instrucciones: t.instrucciones, items });
    }
}

if (errores.length) {
    console.error("No se sembró nada:\n  " + errores.join("\n  "));
    process.exit(1);
}

// ---------------------------------------------------------------------- SQL
/* Un texto largo va partido en trozos unidos con ||: el SQL dice lo mismo,
   pero ningún renglón pasa de unos cientos de caracteres. Así se puede leer,
   revisar y pegar por partes en el editor de Supabase sin que se corte. */
const TROZO = 700;
function esc(v) {
    if (v === null || v === undefined) return "NULL";
    // Por puntos de código y no por unidades de UTF-16: cortar un emoji por la
    // mitad dejaría dos mitades que al escribir el archivo se vuelven «�».
    const t = Array.from(String(v));
    if (t.length <= TROZO) return "'" + t.join("").replace(/'/g, "''") + "'";
    const partes = [];
    for (let i = 0; i < t.length; i += TROZO) partes.push("'" + t.slice(i, i + TROZO).join("").replace(/'/g, "''") + "'");
    return "(" + partes.join(" ||\n  ") + ")";
}
const jsonb = (o) => esc(JSON.stringify(o)) + "::jsonb";

/* Los renglones de cuestionario llevan la marca @@cuestionario:Título@@ donde
   va el id: se reemplaza con el del cuestionario listo de la base. Si no
   existe, replace() da NULL y la fila no entra (items es NOT NULL): el SQL
   entero se cae en vez de dejar una tarea que no abre nada. */
function itemsSQL(items) {
    let expr = esc(JSON.stringify(items));
    const titulos = [...new Set(JSON.stringify(items).match(/@@cuestionario:[^@]+@@/g) || [])];
    for (const m of titulos) {
        const titulo = m.slice("@@cuestionario:".length, -2);
        expr = "replace(" + expr + ", " + esc(m) + ", (select q.id::text from public.cuestionarios q where q.listo and q.titulo = " + esc(titulo) + " limit 1))";
    }
    return "(" + expr + ")::jsonb";
}

function aSQL() {
    const out = [];
    const P = esc(proyecto.slug);
    const grupoDe = (slug) => "(select g.id from public.proyecto_grupos g join public.proyectos p on p.id = g.proyecto_id where p.slug = " + P + " and g.slug = " + esc(slug) + ")";
    const grupos = "(select g.id from public.proyecto_grupos g join public.proyectos p on p.id = g.proyecto_id where p.slug = " + P + ")";
    out.push("-- Proyecto «" + proyecto.nombre + "». Generado por herramientas/proyecto-semilla.js; no se edita a mano.");
    out.push("-- Se puede correr las veces que haga falta: vuelve a sembrar el contenido y respeta las asignaciones.");
    out.push("begin;");
    out.push("insert into public.proyectos (slug, nombre, descripcion, periodo) values (" + [P, esc(proyecto.nombre), esc(proyecto.descripcion), esc(proyecto.periodo)].join(", ") + ")");
    out.push("  on conflict (slug) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, periodo = excluded.periodo;");
    for (const g of proyecto.grupos) {
        out.push("insert into public.proyecto_grupos (proyecto_id, slug, nombre, nivel, horario, orden, guia) select p.id, " +
                 [esc(g.slug), esc(g.nombre), esc(g.nivel), esc(g.horario), g.orden, jsonb(g.guia)].join(", ") +
                 " from public.proyectos p where p.slug = " + P);
        out.push("  on conflict (proyecto_id, slug) do update set nombre = excluded.nombre, nivel = excluded.nivel, horario = excluded.horario, orden = excluded.orden, guia = excluded.guia;");
    }
    // Lo sembrado antes se borra entero: los planes (con sus renglones y lo
    // compartido, en cascada), las sesiones y las tareas.
    out.push("delete from public.planes_clase where id in (select s.plan_id from public.proyecto_sesiones s where s.grupo_id in " + grupos + " and s.plan_id is not null);");
    out.push("delete from public.proyecto_sesiones where grupo_id in " + grupos + ";");
    out.push("delete from public.proyecto_tareas where grupo_id in " + grupos + ";");

    planes.forEach((pl, i) => {
        const g = proyecto.grupos.find((x) => x.slug === pl.grupo);
        const s = g.sesiones.find((x) => x.numero === pl.numero);
        const v = "pl" + i;
        out.push("with " + v + " as (insert into public.planes_clase (profesor_id, titulo, notas) values (" +
                 esc(PROFESOR_ID) + ", " + esc(pl.titulo) + ", " + esc(pl.notas) + ") returning id),");
        out.push("  it" + i + " as (insert into public.plan_items (plan_id, orden, tipo, titulo, fen, pregunta, curso, leccion, nota)");
        out.push("    select " + v + ".id, x.orden, x.tipo, x.titulo, x.fen, x.pregunta, x.curso, x.leccion::integer, x.nota from " + v + ", (values");
        out.push(pl.items.map((it) => "      (" + it.orden + ", " + esc(it.tipo) + ", " + esc(it.titulo) + ", " + esc(it.fen || null) + ", " +
                 esc(it.pregunta || null) + ", " + esc(it.curso || null) + ", " + (it.leccion === undefined || it.leccion === null ? "NULL" : String(it.leccion)) + ", " + esc(it.nota || null) + ")").join(",\n"));
        out.push("    ) as x(orden, tipo, titulo, fen, pregunta, curso, leccion, nota) returning 1)");
        out.push("insert into public.proyecto_sesiones (grupo_id, numero, fecha, titulo, tipo, detalle, plan_id) select " +
                 grupoDe(g.slug) + ", " + s.numero + ", " + esc(s.fecha) + ", " + esc(s.titulo) + ", " + esc(s.tipo) + ", " +
                 jsonb(Object.assign({ dia: s.dia }, s.detalle)) + ", " + v + ".id from " + v + ";");
    });

    tareas.forEach((t) => {
        out.push("insert into public.proyecto_tareas (grupo_id, semana, desde, vence, titulo, instrucciones, items) values (" +
                 [grupoDe(t.grupo), t.semana, esc(t.desde), esc(t.vence), esc(t.titulo), esc(t.instrucciones), itemsSQL(t.items)].join(", ") + ");");
    });

    // A quien ya tenía el grupo asignado se le vuelven a compartir los planes
    // nuevos (los viejos se fueron con su compartido en cascada).
    out.push("insert into public.plan_compartidos (plan_id, profesor_id)");
    out.push("  select s.plan_id, g.profesor_id from public.proyecto_sesiones s join public.proyecto_grupos g on g.id = s.grupo_id");
    out.push("   where g.id in " + grupos + " and g.profesor_id is not null and s.plan_id is not null");
    out.push("  on conflict do nothing;");
    out.push("commit;");
    return out.join("\n");
}

const salida = path.join(__dirname, "planes");
fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, "proyecto-" + SLUG + ".json"),
    JSON.stringify({ profesor_id: PROFESOR_ID, proyecto: SLUG, planes, tareas }, null, 2));
fs.writeFileSync(path.join(salida, "proyecto-" + SLUG + ".sql"), aSQL());

if (process.argv.includes("--sql")) { console.log(aSQL()); process.exit(0); }
const posiciones = planes.reduce((n, p) => n + p.items.filter((i) => i.tipo === "posicion").length, 0);
const lecc = planes.reduce((n, p) => n + p.items.filter((i) => i.tipo === "leccion").length, 0);
console.log(proyecto.nombre + ": " + proyecto.grupos.length + " grupos · " + planes.length + " planes · " +
            posiciones + " posiciones · " + lecc + " lecciones · " + tareas.length + " tareas semanales");
console.log(contador.descartadas + " posiciones descartadas por la regla de la clase en vivo");
console.log("Escritos: herramientas/planes/proyecto-" + SLUG + ".json y .sql");
