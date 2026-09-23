/* Comprueba que el tiempo de cada sección se registre y se nombre bien.
 *
 *     node herramientas/verificar-tiempo-secciones.js
 *
 * No necesita navegador, ni red, ni el sitio servido. Lo que se rompe acá se
 * rompe callado: una página que no carga js/tiempo-plataforma.js no suma ni un
 * minuto (el informe dice "0 min" de algo que sí se hizo), una actividad que no
 * está en la tabla de nombres sale en el informe con su clave pelada, y las dos
 * copias de la tabla —la del navegador y la del correo a la casa— se separan
 * a la primera corrección. El bloque de Informes en un navegador de verdad lo
 * comprueba herramientas/verificar-informes.js.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function igual(nombre, salio, esperaba) {
  const a = JSON.stringify(salio), b = JSON.stringify(esperaba);
  if (a === b) console.log("  ✓ " + nombre);
  else { fallos++; console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); }
}

// La tabla del navegador.
const ctx = { window: {}, document: {}, fetch: () => Promise.reject(new Error("sin red")) };
vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js/tiempo-secciones.js"), "utf8"), ctx);
const JS = ctx.window.TiempoSecciones.SECCIONES;

// La tabla del correo (TypeScript, se corre con --experimental-strip-types).
const ts = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import * as m from ${JSON.stringify(path.join(RAIZ, "supabase/functions/informes-encargados/informe-html.ts"))};
   import { cabeceraCorreo } from ${JSON.stringify(path.join(RAIZ, "supabase/functions/_compartido/marca-correo.ts"))};
   const casos = JSON.parse(process.argv[1]);
   const html = casos.map((c) => m.informeHtml(c, "semanal", "https://ajedrez-integral.com", null, (t, k) => cabeceraCorreo(null, t, k)));
   process.stdout.write(JSON.stringify({ SECCIONES: m.SECCIONES, TITULOS: m.TITULOS_CURSOS, html }));`,
  JSON.stringify([
    { alumno: "Ana Rojas", desde: "2026-09-16T00:00:00Z", hasta: "2026-09-23T00:00:00Z", dias_activos: 4,
      minutos_ejercicios: 90, entreno: { "4x4": { cuantos: 12, mejor: null } },
      secciones: [
        { seccion: "4x4", minutos: 62.4, ejercicios: 12 },
        { seccion: "curso:calculo-y-visualizacion", minutos: 25, ejercicios: 0 },
        { seccion: "estudio", minutos: 8, ejercicios: 0 },
        { seccion: "bot", minutos: 0.2, ejercicios: 0 },
      ] },
    // Una base de antes de tiempo_por_seccion(): sin `secciones`, los conteos de siempre.
    { alumno: "Ana Rojas", desde: "2026-09-16T00:00:00Z", hasta: "2026-09-23T00:00:00Z", dias_activos: 4,
      minutos_ejercicios: 90, entreno: { "4x4": { cuantos: 12, mejor: null } } },
  ])], { encoding: "utf8" });
if (ts.status !== 0) { console.log(ts.stderr); process.exit(1); }
const TS = JSON.parse(ts.stdout);

console.log("-- Las dos tablas de nombres dicen lo mismo");
igual("las mismas secciones, con el mismo nombre, emoji y unidad",
  Object.keys(TS.SECCIONES).sort().map((k) => [k, TS.SECCIONES[k]]),
  Object.keys(JS).sort().map((k) => [k, JSON.parse(JSON.stringify(JS[k]))]));

const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, "herramientas/cursos/catalogo.json"), "utf8")).cursos;
const titulos = {};
catalogo.forEach((c) => { titulos[c.slug] = c.titulo; });
igual("el correo nombra los cursos como el catálogo", TS.TITULOS, titulos);

console.log("-- Cada página que cuenta tiempo cuenta en una sección con nombre");
// Lo que la base junta (ver public.tiempo_por_seccion): el tiempo de la
// táctica vieja va a Ejercicios por tema y el de las Fichas, a Estudio.
const JUNTA = { tactica: "temas", fichas: "estudio" };
function paginas(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...paginas(p));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const sinNombre = [];
const conTiempo = {};
for (const p of paginas(RAIZ)) {
  const s = fs.readFileSync(p, "utf8");
  const m = s.match(/tiempo-plataforma\.js"[^>]*data-activity="([^"]+)"/);
  if (!m) continue;
  const rel = path.relative(RAIZ, p);
  conTiempo[rel] = m[1];
  const act = JUNTA[m[1]] || m[1];
  if (act !== "curso" && !JS[act]) sinNombre.push(rel + " → " + m[1]);
  if ((s.match(/<script[^>]*tiempo-plataforma\.js/g) || []).length > 1) sinNombre.push(rel + " lo carga dos veces");
}
igual("ninguna actividad sin nombre, y ninguna página lo carga dos veces", sinNombre, []);

const cursosSinTiempo = catalogo.map((c) => c.slug)
  .filter((slug) => conTiempo["cursos/academia/" + slug + ".html"] !== "curso");
igual("los doce cursos de la Academia cuentan su tiempo como curso", cursosSinTiempo, []);
igual("y las partidas y los exámenes también",
  ["estandar.html", "niebla.html", "crazyhouse.html", "cartas.html", "duelo.html", "variante.html",
   "cuatro-jugadores.html", "examen.html"].map((p) => conTiempo[p]),
  ["partidas", "partidas", "partidas", "partidas", "partidas", "partidas", "partidas", "examen"]);

console.log("-- Un curso se apunta con su nombre");
async function actividadApuntada(pathname, dataActivity) {
  const inserts = [];
  const doc = {
    readyState: "complete", visibilityState: "visible",
    currentScript: { getAttribute: () => dataActivity },
    addEventListener: () => {},
  };
  const sb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-1" } } } }) },
    from: () => ({ insert: (fila) => { inserts.push(fila); return { select: () => ({ single: async () => ({ data: { id: "r" }, error: null }) }) }; } }),
  };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js/tiempo-plataforma.js"), "utf8"),
    { document: doc, window: { location: { pathname } }, sb, setInterval: () => 0, Date });
  await new Promise((r) => setTimeout(r, 20));
  return inserts.map((f) => f.activity);
}
(async () => {
  igual("con .html", await actividadApuntada("/cursos/academia/el-mapa-de-los-finales.html", "curso"),
    ["curso:el-mapa-de-los-finales"]);
  igual("y sin .html, como también lo sirve Cloudflare",
    await actividadApuntada("/cursos/academia/el-mapa-de-los-finales", "curso"), ["curso:el-mapa-de-los-finales"]);
  igual("una actividad que no es curso no se toca", await actividadApuntada("/entreno/mates.html", "mates"), ["mates"]);

  console.log("-- El correo a la casa dice el tiempo de cada sección");
  const [con, sin] = TS.html;
  const trabajo = (h) => (h.split("En qué trabajó")[1] || "").split("</table>")[0]
    .replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
  igual("tiempo y ejercicios, el curso con su título, y lo de paso no sale", trabajo(con),
    "🧩 Ejercicios 4×4 1 h 2 min · 12 ejercicios 🏛️ Curso: Cálculo y Visualización 25 min 📚 Estudio (fichas) 8 min");
  igual("y con una base de antes, los conteos de siempre", trabajo(sin), "🧩 Ejercicios 4×4 12 resueltos");

  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\n✅ El tiempo por sección: todo bien.");
  process.exit(fallos ? 1 : 0);
})();
