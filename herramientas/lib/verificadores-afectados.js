/* Qué verificadores toca un cambio.

   El CI corría los más de 400 verificadores en cada PR, aunque el PR cambiara
   una sola página. Este módulo dice, para una lista de archivos cambiados,
   cuáles de ellos pueden verse afectados, y verificar-todo.js corre solo esos.

   La regla es NUNCA dejar afuera uno que hacía falta: ante la duda, todos.
   Por eso:

     - De cada verificador se leen los archivos que nombra (páginas, módulos,
       migraciones, datos), y de ahí, en cadena, lo que esos cargan: el HTML,
       sus <script src> y <link href>; un JS, los .js/.json/.css que nombra.
       De un HTML NO se siguen los enlaces a otras páginas (si no, desde el
       inicio se llega a todo el sitio y todos dependerían de todo).
     - Un verificador que recorre carpetas (readdirSync, glob, ls-files…)
       comprueba cosas de TODO el sitio que no nombra una por una (el voseo,
       la CSP, el sello…): corre siempre.
     - Un archivo cambiado que ningún verificador nombra no se sabe a quién
       afecta: corren TODOS.
     - Lo que usan todos (el corredor, package*.json, el flujo del CI) también
       hace correr todos. herramientas/lib/ no: cada verificador la pide con
       require y eso se sigue como cualquier otro archivo.
     - La documentación (docs/ y los .md) y lo que no es código (fotos, PDF,
       descargas): si nadie lo nombra, no hace correr a nadie (los que lo leen
       lo nombran o barren la carpeta).

   Lo que esta lectura no ve (una ruta armada con variables, un fetch
   calculado) lo atrapa la corrida completa de cada semana (ver el «schedule»
   de .github/workflows/verificar.yml). */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const RAIZ = path.resolve(__dirname, "..", "..");

// Si cambia uno de estos, corren todos.
const GLOBALES = [
  /^herramientas\/verificar-todo\.js$/,
  /^herramientas\/lib\/verificadores-afectados\.js$/,
  // Estos dos los carga el corredor en TODOS (NODE_OPTIONS --require).
  /^herramientas\/lib\/(navegador-local|candado-de-prueba)\.js$/,
  /^package(-lock)?\.json$/,
  /^\.github\/workflows\/verificar\.yml$/,
];

// La documentación y los archivos que no son código (fotos, PDF, descargas):
// si nadie los nombra, no hay verificador al que puedan romper. Un .json sí
// cuenta: es un dato que una página lee.
const DOCUMENTACION = /^(docs\/|[^/]+\.md$)|\.(jpe?g|png|webp|gif|ico|mp3|mp4|webm|pdf|zip|pptx|docx|xlsx)$/i;

// Los que recorren carpetas: comprueban todo el sitio sin nombrarlo.
const BARRE = /readdirSync|readdir\(|globSync|glob\(|ls-files|os\.walk|glob\.glob|rglob|os\.listdir|scandir|iterdir/;

// Una ruta escrita en el texto: «js/x.js», "/panel.html", './torneo.js',
// `${BASE}/torneos-pareo.html?t=1`… No se exige que vaya entre comillas (la
// de una plantilla viene después de «}»): lo que no es un archivo del
// repositorio se descarta al resolver.
const EXT = "html|js|mjs|cjs|css|json|jsonc|sql|ts|py|txt|md|svg|png|webp|jpg|pdf|pptx|docx|xlsx|xml|webmanifest|csv|pgn";
const RUTA = new RegExp("(?<![\\w\\-./@])(\\.{0,2}\\/?[\\w\\-./@]+\\.(?:" + EXT + "))(?![\\w\\-@])", "g");
// path.join(RAIZ, "js", "x.js") / path.resolve(__dirname, "..", "x.html")
const JOIN = /path\.(?:join|resolve)\(([^()]*)\)/g;
const LITERAL = /["'`]([^"'`$]+)["'`]/g;

/* Los comentarios nombran archivos que el código no carga («ver js/x.js»,
   «una sola copia: js/y.js»): contados, cada módulo arrastraba a decenas de
   verificadores de más. Se borran antes de leer; las cadenas quedan intactas. */
const CADENA_O_COMENTARIO = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
function sinComentarios(archivo, texto) {
  if (/\.(js|mjs|cjs|ts)$/.test(archivo)) return texto.replace(CADENA_O_COMENTARIO, (m, cadena) => cadena || " ");
  if (archivo.endsWith(".html")) return texto.replace(/<!--[\s\S]*?-->/g, " ");
  return texto;
}

function archivosDelRepo() {
  const salida = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return new Set(salida.split("\0").filter(Boolean));
}

function crearLector(repo) {
  const carpetas = new Set();
  for (const f of repo) {
    const partes = f.split("/");
    for (let i = 1; i < partes.length; i += 1) carpetas.add(partes.slice(0, i).join("/"));
  }
  const cache = new Map();

  function resolver(desde, ruta) {
    const limpia = ruta.replace(/^\.\//, "");
    const candidatos = [];
    if (ruta.startsWith("/")) candidatos.push(ruta.slice(1));
    else {
      candidatos.push(path.posix.normalize(path.posix.join(path.posix.dirname(desde), limpia)));
      candidatos.push(path.posix.normalize(limpia));
    }
    return candidatos.find((c) => repo.has(c) || carpetas.has(c));
  }

  /* Lo que nombra un archivo. `todo`: también páginas y datos (para el
     verificador mismo); si no, solo lo que se carga (para seguir la cadena). */
  function nombrados(archivo, todo) {
    const clave = archivo + (todo ? "*" : "");
    if (cache.has(clave)) return cache.get(clave);
    const res = new Set();
    cache.set(clave, res);
    let texto;
    try { texto = sinComentarios(archivo, fs.readFileSync(path.join(RAIZ, archivo), "utf8")); } catch (e) { return res; }
    const esHtml = archivo.endsWith(".html");
    const sirve = (r) => todo || (esHtml ? /\.(js|mjs|css|json|webmanifest)$/.test(r) : /\.(js|mjs|cjs|json|css|wasm)$/.test(r));
    for (const m of texto.matchAll(RUTA)) {
      if (!sirve(m[1])) continue;
      const r = resolver(archivo, m[1]);
      if (r) res.add(r);
    }
    if (todo) {
      for (const m of texto.matchAll(JOIN)) {
        const partes = [...m[1].matchAll(LITERAL)].map((x) => x[1]).filter((p) => p !== "..");
        if (!partes.length) continue;
        const r = resolver("", partes.join("/"));
        if (r) res.add(r);
      }
      // require("./verificar-panel") y require("./lib/x"): el otro verificador
      // también es parte de este.
      for (const m of texto.matchAll(/require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(archivo), m[1]));
        const r = [base, base + ".js"].find((c) => repo.has(c));
        if (r) res.add(r);
      }
    }
    return res;
  }

  /* Todo aquello de lo que depende un verificador: archivos y carpetas. */
  function dependencias(verificador) {
    const vistos = new Set([verificador]);
    const pendientes = [...nombrados(verificador, true)];
    while (pendientes.length) {
      const f = pendientes.pop();
      if (vistos.has(f)) continue;
      vistos.add(f);
      if (!repo.has(f)) continue; // una carpeta: no se lee
      // sw.js nombra media página en su lista de precarga: no se sigue.
      if (f === "sw.js") continue;
      // Otro verificador o su biblioteca: se sigue entero.
      const entero = /^herramientas\//.test(f) && /\.(js|py)$/.test(f);
      if (!/\.(html|js|mjs|cjs|py)$/.test(f)) continue;
      for (const g of nombrados(f, entero)) if (!vistos.has(g)) pendientes.push(g);
    }
    return vistos;
  }

  return { dependencias, nombrados, barre:(archivo) => BARRE.test(fs.readFileSync(path.join(RAIZ, archivo), "utf8")) };
}

/* 2: lo nombra (el archivo, o la carpeta de dos niveles o más donde está:
   «supabase/migraciones»). 1: solo lo alcanza una carpeta de primer nivel
   («js», de un path.join(RAIZ, "js", variable)): el verificador corre, pero
   eso no dice que alguien lea ESE archivo, y un archivo nuevo en js/ quedaría
   «cubierto» por cualquiera. 0: nada. */
function cubre(deps, archivo) {
  if (deps.has(archivo)) return 2;
  let nivel = 0;
  for (const d of deps) {
    if (!archivo.startsWith(d + "/")) continue;
    if (d.includes("/")) return 2;
    nivel = 1;
  }
  return nivel;
}

/* cambios: rutas del repo. verificadores: nombres de archivo dentro de
   herramientas/. Devuelve { todos: true, motivo } o { todos: false, elegidos: Set }. */
function afectados(cambios, verificadores) {
  const global = cambios.find((c) => GLOBALES.some((g) => g.test(c)));
  if (global) return { todos: true, motivo: global + " lo usan todos" };
  const repo = archivosDelRepo();
  for (const c of cambios) repo.add(c); // los nuevos del PR, aunque no estén en el índice
  const lector = crearLector(repo);
  const elegidos = new Set();
  const cubiertos = new Set();
  for (const v of verificadores) {
    const ruta = "herramientas/" + v;
    // Un verificador que cambió se cubre a sí mismo (también si barre).
    if (cambios.includes(ruta)) { elegidos.add(v); cubiertos.add(ruta); }
    if (lector.barre(ruta)) { elegidos.add(v); continue; }
    const deps = lector.dependencias(ruta);
    for (const c of cambios) {
      const n = cubre(deps, c);
      if (n) elegidos.add(v);
      if (n === 2) cubiertos.add(c);
    }
  }
  // Un cambio que solo «cubre» un barredor no dice nada: el barredor corre
  // siempre. Si nadie más lo nombra, no sabemos a quién afecta.
  const huerfanos = cambios.filter((c) => !cubiertos.has(c) && !DOCUMENTACION.test(c) && fs.existsSync(path.join(RAIZ, c)));
  if (huerfanos.length) return { todos: true, motivo: huerfanos.join(", ") + (huerfanos.length > 1 ? " no los nombra" : " no lo nombra") + " ningún verificador", huerfanos };
  return { todos: false, elegidos };
}

function cambiosDesde(base) {
  const salida = execFileSync("git", ["diff", "--name-only", "-z", base, "HEAD"], { cwd: RAIZ, encoding: "utf8" });
  return salida.split("\0").filter(Boolean);
}

module.exports = { afectados, cambiosDesde, crearLector, archivosDelRepo };

/*! rev bfb5bbb0d2d82f9f */
