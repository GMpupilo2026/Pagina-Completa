#!/usr/bin/env node
/* Las fechas y las horas del sitio van en hora de Costa Rica (CLAUDE.md:
   «Horas y días se cuentan en hora de Costa Rica»). Ver «Las fechas y las
   horas, siempre en hora de Costa Rica» en docs/decisiones/sitio-e-infraestructura.md.

   Lo que se rompe callado:
   - `new Date().toISOString().slice(0, 10)` es el día en UTC: de las 6 de la
     tarde a la medianoche de Costa Rica ya es «mañana». Una racha, un archivo
     o un «hoy» calculado así cambian de día seis horas antes.
   - `toLocaleDateString`, `toLocaleTimeString`, `toLocaleString` (de una
     fecha) e `Intl.DateTimeFormat` SIN `timeZone` usan la zona de quien mira:
     en la computadora de alguien que viaja, o en el servidor de una Edge
     Function (que corre en UTC), la hora sale corrida seis horas.

   Este verificador lee todo el código propio (js/, entreno/, cursos/, el
   worker y las Edge Functions; no js/vendor ni lo minificado) y pide que
   cada formato de fecha u hora diga su zona. La zona es "America/Costa_Rica";
   "UTC" se acepta solo para una fecha de calendario armada en UTC (un
   «2026-09-30» que no tiene hora), y va con su comentario.

       node herramientas/verificar-hora-cr.js
*/
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const CARPETAS = ["js", "entreno", "cursos", "supabase/functions"];
const SUELTOS = ["worker.js", "sw.js"];
const FUERA = /(^|\/)(vendor|node_modules|data)\/|\.min\.js$|pdf\.worker|chess\.js$/;

function archivos() {
  const out = [];
  const recorrer = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const rel = path.relative(RAIZ, p);
      if (FUERA.test(rel)) continue;
      if (e.isDirectory()) recorrer(p);
      else if (/\.(js|ts|mjs)$/.test(e.name)) out.push(p);
    }
  };
  CARPETAS.forEach((c) => recorrer(path.join(RAIZ, c)));
  SUELTOS.forEach((s) => { if (fs.existsSync(path.join(RAIZ, s))) out.push(path.join(RAIZ, s)); });
  return out;
}

// Lo que va entre los paréntesis de la llamada que empieza en `desde` (puede ocupar varias líneas).
function argumentos(texto, desde) {
  let i = texto.indexOf("(", desde), nivel = 0, j = i;
  for (; j < texto.length; j++) {
    const c = texto[j];
    if (c === "(") nivel++;
    else if (c === ")") { nivel--; if (nivel === 0) break; }
  }
  return texto.slice(i + 1, j);
}

const linea = (texto, pos) => texto.slice(0, pos).split("\n").length;
const PIDE_FECHA = /\b(day|month|year|weekday|hour|minute|second|dateStyle|timeStyle|era)\b/;

function revisar(archivo) {
  const texto = fs.readFileSync(archivo, "utf8");
  const rel = path.relative(RAIZ, archivo);
  const mal = [];
  let m;
  // 1. Formatos de fecha u hora sin zona.
  const re = /\.(toLocaleDateString|toLocaleTimeString|toLocaleString)\s*\(|new\s+Intl\.DateTimeFormat\s*\(|Intl\.DateTimeFormat\s*\(/g;
  while ((m = re.exec(texto))) {
    const args = argumentos(texto, m.index);
    const metodo = m[1] || "Intl.DateTimeFormat";
    if (metodo === "toLocaleString") {
      // toLocaleString también formatea números: solo cuenta si se le piden partes de fecha,
      // o si se llama sobre una fecha (new Date(…).toLocaleString()).
      const antes = texto.slice(Math.max(0, m.index - 80), m.index);
      const sobreFecha = /new Date\([^()]*(\([^()]*\))?[^()]*\)\s*$/.test(antes) || /\bDate\b[^;]*$/.test(antes.split("\n").pop());
      if (!PIDE_FECHA.test(args) && !sobreFecha) continue;
      if (/maximumFractionDigits|minimumFractionDigits|style:\s*["']currency/.test(args)) continue;
    }
    if (!/timeZone\s*:/.test(args)) mal.push(rel + ":" + linea(texto, m.index) + "  " + metodo + " sin timeZone");
  }
  // 2. El día o el mes sacados de una fecha en UTC.
  const iso = /toISOString\(\)\s*\.\s*(slice|substring|substr)\s*\(\s*0\s*,\s*(7|10|13|16)\s*\)|toISOString\(\)\s*\.\s*split\(\s*["']T["']\s*\)/g;
  while ((m = iso.exec(texto))) {
    // Una fecha de calendario armada en UTC (Date.UTC o "…Z") y leída en UTC no se corre: se acepta
    // si la línea lo dice con el comentario «calendario en UTC».
    const l = texto.split("\n")[linea(texto, m.index) - 1];
    if (/calendario en UTC/.test(l)) continue;
    mal.push(rel + ":" + linea(texto, m.index) + "  día sacado en UTC (toISOString)");
  }
  return mal;
}

/* 3. Una página que carga un archivo que usa HoraCR carga antes js/hora-cr.js:
   sin él, la página se cae con «HoraCR is not defined» al pintar la primera fecha. */
function paginas() {
  const usan = new Set(fs.readdirSync(path.join(RAIZ, "js")).filter((f) => f.endsWith(".js") && f !== "hora-cr.js"
    && /\bHoraCR\./.test(fs.readFileSync(path.join(RAIZ, "js", f), "utf8"))));
  const mal = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (/node_modules|\.git|herramientas|supabase|docs/.test(path.relative(RAIZ, p))) continue;
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith(".html")) {
        const html = fs.readFileSync(p, "utf8");
        const scripts = [...html.matchAll(/<script src="(?:\.\.\/)*js\/([a-z0-9-]+\.js)"/g)].map((m) => m[1]);
        const i = scripts.findIndex((s) => usan.has(s));
        if (i < 0) continue;
        const j = scripts.indexOf("hora-cr.js");
        if (j < 0 || j > i) mal.push(path.relative(RAIZ, p) + "  carga " + scripts[i] + " sin cargar antes js/hora-cr.js");
      }
    }
  };
  recorrer(RAIZ);
  return mal;
}

const todos = archivos();
const errores = todos.flatMap(revisar).concat(paginas());
console.log("Revisados " + todos.length + " archivos de código.");
if (errores.length) {
  console.log("\n✗ Fechas u horas que no dicen que son de Costa Rica (" + errores.length + "):");
  errores.forEach((e) => console.log("  " + e));
  console.log("\nCada formato lleva timeZone: \"America/Costa_Rica\"; el día de hoy, " +
    "new Date().toLocaleDateString(\"en-CA\", { timeZone: \"America/Costa_Rica\" }).");
  process.exit(1);
}
console.log("✓ Todas las fechas y horas dicen su zona: la de Costa Rica.");
