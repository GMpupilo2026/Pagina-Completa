/* Comprueba el banco de «Finales contra la máquina» (entreno/data/finales.json)
   y que la actividad 'finales' esté conectada donde tiene que estar. Sin
   navegador ni motor: lo que dijo Stockfish al generar quedó escrito en el
   banco (`motor`), y acá se exige que cuadre con la meta.

   - Cada posición carga en chess.js, es legal (el bando que NO mueve no está
     en jaque: con eso Stockfish se cuelga sin avisar) y la partida no terminó.
   - Ganar: el motor dio mate o +4 desde el lado del alumno. Salvar: 0,5 o
     menos, sin mate.
   - La base acepta TODA actividad que las páginas registran: el CHECK de la
     última migración que lo define nombra cada EntrenoProgress.log('<x>', …)
     de js/. Si falta una, la base rechaza sus filas sin que nada avise (pasó:
     el diagnóstico, Mates y Practicar estuvieron meses sin llegar a Informes).
   - 'finales' está en el catálogo de Tareas, en el plan del diagnóstico, en
     el tiempo por sección y su progreso viaja con la cuenta.

   Uso:  node herramientas/verificar-todo.js finales                          */
"use strict";
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const RAIZ = path.join(__dirname, "..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos++; };
const bien = (m) => console.log("  ✓ " + m);

/* Dos bancos: los finales de libro (+4 para ganar, 0,5 para salvar, con
   pista) y las posiciones de las clases de ADAES (?banco=clases), que se
   comprobaron como el profe las enseñó: +1,5 para ganar, 1 para salvar, y sin
   pista escrita (la pista es la jugada del motor). */
const BANCOS = [
  { archivo: "entreno/data/finales.json", minimo: 8, ganaDesde: 400, tablasHasta: 50, campos: ["titulo", "idea", "pista"] },
  { archivo: "entreno/data/finales-clases.json", minimo: 10, ganaDesde: 150, tablasHasta: 100, campos: ["titulo", "idea"], prefijo: "clase-" },
];
const ids = new Set();
for (const B of BANCOS) {
console.log("\n=== El banco " + B.archivo + " ===");
const banco = JSON.parse(leer(B.archivo));
const finales = banco.finales || [];
if (finales.length >= B.minimo) bien(`${finales.length} posiciones`); else mal(`solo ${finales.length} posiciones`);
if (Number.isInteger(banco.aguantar) && banco.aguantar >= 10) bien(`salvar pide aguantar ${banco.aguantar} jugadas`);
else mal(`«aguantar» tiene que ser un entero de 10 o más (hay ${banco.aguantar})`);

for (const f of finales) {
  const q = f.id || "(sin id)";
  if (!/^[a-z0-9-]+$/.test(f.id || "")) mal(`${q}: el id tiene que ser minúsculas, números y guiones`);
  if (ids.has(f.id)) mal(`${q}: id repetido (también entre los dos bancos: comparten lo logrado)`);
  if (B.prefijo && !String(f.id).startsWith(B.prefijo)) mal(`${q}: el id tiene que empezar con «${B.prefijo}»`);
  ids.add(f.id);
  for (const campo of B.campos) if (!f[campo] || !String(f[campo]).trim()) mal(`${q}: falta «${campo}»`);
  if (!["ganar", "tablas"].includes(f.meta)) { mal(`${q}: meta «${f.meta}»`); continue; }
  if (!["w", "b"].includes(f.alumno)) { mal(`${q}: alumno «${f.alumno}»`); continue; }

  const c = new Chess();
  if (!c.load(f.fen)) { mal(`${q}: la FEN no carga`); continue; }
  const p = f.fen.split(" ");
  p[1] = p[1] === "w" ? "b" : "w";
  p[3] = "-";
  if (new Chess(p.join(" ")).in_check()) { mal(`${q}: el bando que no mueve está en jaque`); continue; }
  if (c.game_over()) { mal(`${q}: la partida ya terminó`); continue; }

  const m = f.motor || {};
  const ok = f.meta === "ganar"
    ? ((typeof m.mate === "number" && m.mate > 0) || (typeof m.cp === "number" && m.cp >= B.ganaDesde))
    : (m.mate === undefined && typeof m.cp === "number" && Math.abs(m.cp) <= B.tablasHasta);
  if (!ok) mal(`${q}: lo que dijo el motor (${JSON.stringify(m)}) no cuadra con la meta «${f.meta}»`);
  else bien(`${f.id}: ${f.meta}, juega con ${f.alumno === "w" ? "blancas" : "negras"}${c.turn() !== f.alumno ? " (empieza la máquina)" : ""}, motor ${m.mate ? "mate en " + m.mate : (m.cp / 100).toFixed(2)}`);
}

}

console.log("\n=== La base acepta cada actividad que se registra ===");
const migs = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => f.endsWith(".sql")).sort();
let check = null;
for (const f of migs) {
  const sql = leer("supabase/migraciones/" + f);
  const m = /add constraint training_progress_activity_check\s+check \(activity = any \(array\[([^\]]*)\]/i.exec(sql);
  if (m) check = { f, actividades: new Set((m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1))) };
}
if (!check) mal("ninguna migración define training_progress_activity_check");
else {
  const registradas = new Set();
  const js = fs.readdirSync(path.join(RAIZ, "js")).filter((f) => f.endsWith(".js"));
  for (const f of js) {
    const re = /EntrenoProgress\.log\(\s*['"]([a-z0-9_-]+)['"]/g;
    let m;
    const src = leer("js/" + f);
    while ((m = re.exec(src))) registradas.add(m[1]);
    /* Y las que se insertan directo, sin EntrenoProgress: el avance de los
       cursos ('curso', js/curso-academia.js) nunca se guardó por esto. */
    const directo = /from\(\s*['"]training_progress['"]\s*\)\s*\.insert\(([^;]*)/g;
    while ((m = directo.exec(src))) {
      const a = /activity:\s*['"]([a-z0-9_-]+)['"]/.exec(m[1]);
      if (a) registradas.add(a[1]);
    }
  }
  /* Ninguna fuera: 'finales100' y 'curso' fueron las que la base rechazaba
     callada (20260929152955_finales100_cuenta_en_su_curso.sql,
     20260929213024_training_progress_curso.sql). */
  const faltan = [...registradas].filter((a) => !check.actividades.has(a));
  if (faltan.length) mal(`la base (${check.f}) rechazaría: ${faltan.join(", ")}`);
  else bien(`las ${registradas.size} actividades que registran las páginas están en ${check.f}`);
  if (check.actividades.has("finales")) bien("'finales' está en el CHECK"); else mal("'finales' no está en el CHECK");
}

console.log("\n=== 'finales' conectada ===");
const g = { window: {} };
new Function("window", leer("js/material-plataforma.js"))(g.window);
const h = ((g.window.MaterialPlataforma || {}).HERRAMIENTAS || []).find((t) => t.href === "entreno/finales.html");
if (h && (h.actividades || []).includes("finales") && (h.metas || []).includes("cantidad")) bien("en el catálogo de Tareas, con meta de cantidad");
else mal("falta en el catálogo de Tareas (js/material-plataforma.js) con actividad 'finales' y meta 'cantidad'");

new Function("window", leer("js/plan-entrenamiento.js"))(g.window);
const PE = g.window.PlanEntrenamiento;
if (PE.claveDeAvance("entreno/finales.html") === "actividad:finales") bien("el plan del diagnóstico cuenta lo hecho ahí");
else mal("PlanEntrenamiento.claveDeAvance no conoce entreno/finales.html");
const enPlan = (PE.AREA_POR_ID.finales.recursos || []).some((r) => r.href === "entreno/finales.html");
if (enPlan) bien("el área de finales del plan la ofrece"); else mal("el área de finales del plan no la ofrece");

if (/"finales":\s*\{/.test(leer("js/tiempo-secciones.js"))) bien("tiene nombre en el tiempo por sección");
else mal("falta en js/tiempo-secciones.js");
const pu = leer("js/progreso-usuario.js");
if (/clave: "entreno_finales_solved",\s*fusion: "unionObjeto"/.test(pu)) bien("lo logrado viaja con la cuenta");
else mal("entreno_finales_solved no está en js/progreso-usuario.js (unionObjeto)");
if (/href="finales\.html"/.test(leer("entreno/index.html"))) bien("el hub de Entrenamiento la ofrece");
else mal("el hub de Entrenamiento no enlaza finales.html");

console.log("\n=== 'finales_clases' (las posiciones de las clases) conectada ===");
const hc = ((g.window.MaterialPlataforma || {}).HERRAMIENTAS || []).find((t) => t.slug === "finales-clases");
if (hc && (hc.actividades || []).join() === "finales_clases" && hc.recortes === "finales-clases" && hc.hrefRecorte("clase-0716-1") === "entreno/finales.html?banco=clases&final=clase-0716-1")
  bien("en el catálogo de Tareas, con su actividad y una posición por recorte que abre esa posición");
else mal("«Posiciones de las clases» no está bien en js/material-plataforma.js (actividad 'finales_clases', recortes, enlace)");
const metasJson = JSON.parse(leer("entreno/data/metas.json"));
const clases = JSON.parse(leer("entreno/data/finales-clases.json")).finales || [];
const rec = metasJson["finales-clases"] || [];
if (rec.length === clases.length && rec.every((r, i) => r.clave === clases[i].id && (r.actividades || []).join() === "finales_clases"))
  bien(`metas.json trae las ${rec.length} posiciones como recortes`);
else mal("entreno/data/metas.json no está al día con finales-clases.json: corre python3 herramientas/metas-indice.py");
const ef = leer("js/entreno-finales.js");
if (/EntrenoProgress\.log\('finales_clases', Object\.assign\(\{ theme: f\.id \}/.test(ef)) bien("la página guarda la posición en detail.theme (el recorte de la tarea)");
else mal("js/entreno-finales.js no guarda la posición en detail.theme con la actividad 'finales_clases'");
if (/href="finales\.html\?banco=clases"/.test(leer("entreno/index.html"))) bien("el hub de Entrenamiento la ofrece");
else mal("el hub de Entrenamiento no enlaza finales.html?banco=clases");

console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);

/*! rev bfb5bbb0d2d82f9f */
