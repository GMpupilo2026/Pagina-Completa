#!/usr/bin/env node
/*
 * Comprueba que el punto de restauración esté COMPLETO.
 *
 * POR QUÉ EXISTE
 * Un respaldo a medias no da ningún error: la carpeta está, los archivos se
 * ven, y el día que haga falta reconstruir la base resulta que faltaban
 * cuarenta migraciones o la Edge Function que manda los avisos. Eso no se
 * descubre nunca hasta el peor momento posible. Esto lo mira desde afuera.
 *
 * No necesita red, ni navegador, ni el sitio servido: todo lo que compara
 * vive en el repositorio. Lo único que NO puede comprobar solo es que lo
 * guardado siga coincidiendo con lo que hay en Supabase hoy — para eso
 * imprime la huella de las migraciones, que se compara contra la base con la
 * consulta que queda escrita abajo y en RESTAURAR.md.
 *
 *   node herramientas/verificar-punto-restauracion.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAIZ = path.join(__dirname, "..");
const MIGRACIONES = path.join(RAIZ, "supabase", "migraciones");
const MIGRACIONES_COLEGIOS = path.join(RAIZ, "supabase", "migraciones-colegios");
const ESQUEMA = path.join(RAIZ, "supabase", "esquema");
const FUNCIONES = path.join(RAIZ, "supabase", "functions");

let fallos = 0;
const mal = (m) => { console.log(`  ✗ ${m}`); fallos++; };
const bien = (m) => console.log(`  ✓ ${m}`);

/* Las migraciones son EL punto de restauración de la base: con ellas se
   reconstruye el esquema entero desde cero, y sin ellas no hay de dónde. */
function migraciones(dir, nombre, minimo) {
  console.log(`\n${nombre}`);
  if (!fs.existsSync(dir)) return mal(`no existe ${path.relative(RAIZ, dir)}`);

  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (archivos.length < minimo) {
    mal(`solo ${archivos.length} migraciones, se esperaban al menos ${minimo}`);
  } else {
    bien(`${archivos.length} migraciones`);
  }

  const versiones = new Set();
  for (const f of archivos) {
    const version = f.split("_")[0];
    // El nombre lleva la versión delante porque el orden de aplicación ES el
    // orden alfabético: una migración renombrada se aplica donde no era.
    if (!/^\d{14}$/.test(version)) mal(`${f}: la versión no son 14 dígitos`);
    if (versiones.has(version)) mal(`${f}: versión repetida`);
    versiones.add(version);
    if (fs.statSync(path.join(dir, f)).size === 0) mal(`${f}: está vacía`);
  }

  // La huella agregada es lo que se compara contra la base. Se calcula igual
  // que allá: "version:md5" por línea, unidas con \n y SIN salto final.
  const huella = crypto.createHash("md5").update(
    archivos.map((f) => {
      const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(dir, f))).digest("hex");
      return `${f.split("_")[0]}:${md5}`;
    }).join("\n"),
  ).digest("hex");
  console.log(`    huella: ${huella}`);
  return huella;
}

/* Lo que está desplegado y no está en el repositorio no se puede restaurar.
   Ya pasó: cinco Edge Functions vivían solo en Supabase. */
function funciones() {
  console.log("\nEdge Functions");
  const lista = path.join(ESQUEMA, "funciones-desplegadas.txt");
  if (!fs.existsSync(lista)) return mal("falta esquema/funciones-desplegadas.txt");

  const declaradas = fs.readFileSync(lista, "utf8").split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.trim().split(/\s+/)[0]);

  const enDisco = fs.readdirSync(FUNCIONES)
    .filter((f) => fs.statSync(path.join(FUNCIONES, f)).isDirectory() && f !== "_compartido");

  for (const f of declaradas) {
    if (!enDisco.includes(f)) mal(`${f}: está desplegada y NO está en el repositorio`);
    else if (!fs.existsSync(path.join(FUNCIONES, f, "index.ts"))) mal(`${f}: sin index.ts`);
  }
  // Al revés también importa, pero es mucho menos grave: una carpeta de más
  // es código que no se despliega, no un agujero en el respaldo.
  for (const f of enDisco) {
    if (!declaradas.includes(f)) mal(`${f}: está en el repositorio y no en la lista de desplegadas`);
  }
  if (!fallos) bien(`${declaradas.length} funciones, todas con su código`);
}

/* El retrato del esquema no restaura nada: sirve para comprobar, DESPUÉS de
   restaurar, que no falte ninguna política ni ningún trigger. */
function inventarios() {
  console.log("\nRetrato del esquema");
  for (const f of ["inventario-academia.txt", "inventario-colegios.txt", "cron.txt"]) {
    const p = path.join(ESQUEMA, f);
    if (!fs.existsSync(p)) { mal(`falta esquema/${f}`); continue; }
    const lineas = fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    if (!lineas.length) mal(`esquema/${f}: está vacío`);
    else bien(`${f}: ${lineas.length} líneas`);
  }
}

/* Cloudflare no se restaura desde el repositorio salvo por estos cuatro
   archivos: el worker, las cabeceras, las redirecciones y su configuración. */
function cloudflare() {
  console.log("\nCloudflare");
  for (const f of ["worker.js", "_headers", "_redirects", "wrangler.jsonc"]) {
    if (fs.existsSync(path.join(RAIZ, f))) bien(f);
    else mal(`falta ${f}`);
  }
}

console.log("Punto de restauración de la plataforma\n======================================");
const huella = migraciones(MIGRACIONES, "Base de la Academia (bgtijpimpcokxatxxbki)", 179);
migraciones(MIGRACIONES_COLEGIOS, "Base de inscripciones (prcfbzvshnusisczlpxl)", 5);
funciones();
inventarios();
cloudflare();

console.log(`
Para comprobar que la base sigue coinciendo con esto, correr en Supabase:

  select md5(string_agg(version || ':' || md5(array_to_string(statements, E'\\n\\n')),
                        E'\\n' order by version)) as huella,
         count(*) as n
  from supabase_migrations.schema_migrations;

Tiene que devolver la huella de arriba (${huella}). Si NO coincide, hay
migraciones aplicadas que no están respaldadas: volver a correr el volcado
como dice RESTAURAR.md antes de tocar nada más.
`);

if (fallos) { console.log(`✗ ${fallos} problema(s) en el punto de restauración`); process.exit(1); }
console.log("✓ El punto de restauración está completo");
