#!/usr/bin/env node
/*
 * Decide qué Edge Functions hay que desplegar y deja cada una armada, lista
 * para `supabase functions deploy`. Lo usa el flujo de GitHub
 * `.github/workflows/funciones.yml`; se puede correr a mano para ver qué haría.
 *
 *   node herramientas/funciones-desplegar.js --cambios <antes> <despues> --salida <carpeta>
 *   node herramientas/funciones-desplegar.js --funciones a,b --salida <carpeta>
 *
 * Imprime una línea por función: «<nombre> <verify_jwt>» (true o false), y deja
 * sus archivos en <carpeta>/supabase/functions/<nombre>/, con lo compartido ya
 * copiado (herramientas/funciones-armar.js, la misma lista de siempre).
 *
 * POR QUÉ EL verify_jwt SALE DE UN ARCHIVO Y NO DE UN VALOR POR OMISIÓN
 * Hay funciones que van con `verify_jwt` en false a propósito: las dispara
 * pg_cron, las llama quien perdió la contraseña o una tablet sin cuenta.
 * Desplegarlas con la verificación puesta las deja rechazando a su propio
 * disparador, y eso no da ningún error: simplemente dejan de llegar los
 * informes, o la tablet del árbitro deja de anotar. Y al revés, una que debía
 * ir en true quedaría abierta. Así que se lee de
 * supabase/esquema/funciones-desplegadas.txt, que ya es la lista oficial, y
 * una función que no esté ahí NO se despliega: falla, para que alguien la
 * anote antes.
 *
 * Ver «Las Edge Functions se despliegan solas desde GitHub» en
 * docs/decisiones/sitio-e-infraestructura.md.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { FUNCIONES, armar } = require("./funciones-armar.js");

const RAIZ = path.join(__dirname, "..");
const FUNC = path.join(RAIZ, "supabase", "functions");
const LISTA = path.join(RAIZ, "supabase", "esquema", "funciones-desplegadas.txt");

function salir(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

/** nombre → true/false, de la lista oficial. */
function verifyJwtDe() {
  const mapa = new Map();
  for (const linea of fs.readFileSync(LISTA, "utf8").split("\n")) {
    const m = linea.match(/^([a-z0-9][a-z0-9-]*)\s+(true|false)\b/);
    if (m) mapa.set(m[1], m[2] === "true");
  }
  return mapa;
}

/** Las carpetas que son una función (tienen index.ts). */
function existe(nombre) {
  return /^[a-z0-9][a-z0-9-]*$/.test(nombre) && fs.existsSync(path.join(FUNC, nombre, "index.ts"));
}

/** Qué funciones tocan estos archivos cambiados. */
function deCambios(archivos) {
  const out = new Set();
  for (const a of archivos) {
    const m = a.match(/^supabase\/functions\/([^/]+)\/(.+)$/);
    if (!m) continue;
    if (m[1] === "_compartido") {
      // Un archivo compartido: todas las que lo llevan.
      for (const [nombre, lista] of Object.entries(FUNCIONES)) if (lista.includes(m[2])) out.add(nombre);
    } else if (existe(m[1])) {
      out.add(m[1]);
    } else {
      // Una carpeta que ya no existe: borrar una función es a mano (y a propósito).
      console.error("aviso: " + m[1] + " ya no está en el repositorio; si se borró, se borra a mano en Supabase.");
    }
  }
  return [...out].sort();
}

function argumentos() {
  const a = process.argv.slice(2);
  const i = (k) => a.indexOf(k);
  const salida = i("--salida") >= 0 ? a[i("--salida") + 1] : null;
  if (!salida) salir("Falta --salida <carpeta>.");
  if (i("--cambios") >= 0) {
    const antes = a[i("--cambios") + 1], despues = a[i("--cambios") + 2];
    if (!/^[0-9a-f]{7,40}$/.test(antes || "") || !/^[0-9a-f]{7,40}$/.test(despues || "")) salir("--cambios lleva dos commits.");
    const archivos = execFileSync("git", ["diff", "--name-only", antes, despues, "--", "supabase/functions"], { cwd: RAIZ, encoding: "utf8" })
      .split("\n").filter(Boolean);
    return { salida, nombres: deCambios(archivos) };
  }
  if (i("--funciones") >= 0) {
    const nombres = String(a[i("--funciones") + 1] || "").split(/[\s,]+/).filter(Boolean);
    if (!nombres.length) salir("--funciones lleva al menos un nombre.");
    for (const n of nombres) if (!existe(n)) salir(n + " no es una Edge Function del repositorio.");
    return { salida, nombres: [...new Set(nombres)].sort() };
  }
  salir("Usa --cambios <antes> <despues> o --funciones a,b.");
}

if (require.main === module) {
  const { salida, nombres } = argumentos();
  const jwt = verifyJwtDe();
  const sinAnotar = nombres.filter((n) => !jwt.has(n));
  if (sinAnotar.length) {
    salir("No están en supabase/esquema/funciones-desplegadas.txt (con su verify_jwt): " + sinAnotar.join(", ") +
      ". Anótalas ahí antes: sin eso no se sabe si van con la verificación puesta.");
  }
  for (const n of nombres) {
    const dir = path.join(salida, "supabase", "functions", n);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of armar(n)) fs.writeFileSync(path.join(dir, f.name), f.content);
    console.log(n + " " + jwt.get(n));
  }
}

module.exports = { deCambios, verifyJwtDe };

/*! rev bfb5bbb0d2d82f9f */
