/* ===== Sincronizar el banco del diagnóstico con Supabase =====
 *
 * `js/diagnostico-items.js` sigue siendo la fuente de verdad del banco —lo
 * sigue editando a mano quien escribe preguntas, y lo sigue reescribiendo
 * herramientas/diagnostico-calibrar.js después de cada tanda de diagnósticos
 * reales— pero ya no se publica: desde que existe la tabla
 * `public.diagnostico_items` (ver la migración
 * `diagnostico_banco_protegido`), el navegador ya no necesita el banco
 * entero para hacer el diagnóstico ni para armar un examen por tema. Ver
 * «Diagnóstico» en docs/decisiones/entrenamiento.md.
 *
 * Este script genera DOS cosas a partir de `js/diagnostico-items.js`:
 *
 *   1. `js/diagnostico-catalogo.js` — un archivo público y sin secretos
 *      (solo id, área, peso y tipo de cada ítem) que reemplaza al banco
 *      entero en examenes.html: ahí es lo único que hace falta para saber
 *      cuántas preguntas hay de cada tipo y sortear cuáles tocan, sin que el
 *      navegador vea ni una sola respuesta.
 *   2. Una migración nueva con el `insert ... on conflict ... do update` que
 *      pone la tabla al día (se corre con `--migracion`).
 *
 * Cuándo correrlo: cada vez que cambie `js/diagnostico-items.js` —al escribir
 * preguntas nuevas, después de diagnostico-calibrar.js o de
 * diagnostico-lichess.js—. Sin esto, el banco de la base queda desactualizado
 * en silencio: la prueba seguiría funcionando, pero con las preguntas, pesos
 * o respuestas de antes.
 *
 * Cómo se corre:
 *   node herramientas/diagnostico-sincronizar.js
 *     — regenera solo js/diagnostico-catalogo.js.
 *   node herramientas/diagnostico-sincronizar.js --migracion
 *     — además escribe supabase/migraciones/<fecha>_diagnostico_banco_datos.sql
 *       con el insert/update de todos los ítems, para aplicarla a mano.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const BANCO = path.join(RAIZ, "js/diagnostico-items.js");
const CATALOGO = path.join(RAIZ, "js/diagnostico-catalogo.js");

// eval() de un archivo propio del repositorio, no de nada externo: el mismo
// truco que ya usan herramientas/diagnostico-calibrar.js y
// verificar-diagnostico.js para cargar este banco en Node sin duplicarlo.
global.window = {};
eval(fs.readFileSync(BANCO, "utf8"));
const ITEMS = global.window.DIAGNOSTICO_ITEMS;
if (!Array.isArray(ITEMS) || !ITEMS.length) {
  console.error("No se pudo leer DIAGNOSTICO_ITEMS de " + BANCO);
  process.exit(1);
}

/* ---------------- El catálogo público ---------------- */

/* La exporta el módulo para que herramientas/verificar-diagnostico-catalogo.js
   pueda armar el mismo catálogo y compararlo con el archivo publicado, sin
   tener que repetir esta regla en dos lugares. */
function catalogoDe(items) {
  return items.map((it) => ({ id: it.id, area: it.area, peso: it.peso, tipo: it.tipo }));
}

function generarCatalogo() {
  const catalogo = catalogoDe(ITEMS);
  const cabecera = `/* ===== Catálogo público del banco del diagnóstico de nivel =====
 *
 * Generado por herramientas/diagnostico-sincronizar.js a partir de
 * js/diagnostico-items.js. NO SE EDITA A MANO.
 *
 * Solo lleva id, área, peso y tipo de cada ítem — nada de enunciado, opciones
 * ni respuesta. Con esto alcanza para armar un examen por tema en
 * examenes.html (js/examen-banco.js): cuántas preguntas hay de cada filtro y
 * cuáles le tocan a este examen. El contenido de verdad —y la respuesta— los
 * entrega la base, solo para las preguntas que de verdad se van a usar
 * (public.diagnostico_items, por diagnostico_items_para_examen()). Ver
 * «Diagnóstico» en docs/decisiones/entrenamiento.md.
 */
`;
  const cuerpo = `window.DIAGNOSTICO_CATALOGO = ${JSON.stringify(catalogo)};\n`;
  fs.writeFileSync(CATALOGO, cabecera + cuerpo);
  console.log(`Escrito ${path.relative(RAIZ, CATALOGO)} con ${catalogo.length} ítems.`);
}

/* ---------------- La migración de datos ---------------- */

function sqlTexto(v) {
  if (v === null || v === undefined) return "null";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function sqlJsonb(v) {
  if (v === null || v === undefined) return "null";
  return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
}
function sqlInt(v) {
  return v === null || v === undefined ? "null" : String(parseInt(v, 10));
}

/* El tipo de ítem decide qué trae cada columna: 'opcion'/'opcion_tablero'
   llevan opciones+correcta, 'jugada'/'casilla' llevan solucion (y a veces
   alternas). Igual que esCorrecta() en js/entreno-diagnostico.js. */
function filaDe(it) {
  const esOpcion = it.tipo === "opcion" || it.tipo === "opcion_tablero";
  const solucion = esOpcion ? null : it.solucion;
  return `  (${sqlTexto(it.id)}, ${sqlTexto(it.area)}, ${sqlTexto(it.tipo)}, ${sqlInt(it.peso)}, ${sqlInt(it.elo)}, ${sqlInt(it.eloBase)}, ${sqlTexto(it.enunciado)}, `
    + `${esOpcion ? sqlJsonb(it.opciones) : "null"}, ${sqlTexto(it.fen || null)}, `
    + `${esOpcion ? sqlInt(it.correcta) : "null"}, ${sqlJsonb(solucion)}, ${sqlJsonb(it.alternas || null)}, ${sqlTexto(it.explica || "")}, `
    + `${sqlTexto(it.lichess || null)}, ${it.rating == null ? "null" : sqlInt(it.rating)})`;
}

/* Varios `insert` chicos en vez de uno con todas las filas juntas: así la
   migración se puede aplicar (o simplemente leer) en pedazos sin partir un
   statement por la mitad. Cada pedazo es válido por sí solo. */
const TANDA = 50;

function generarMigracion() {
  const encabezado = `insert into public.diagnostico_items
  (id, area, tipo, peso, elo, elo_base, enunciado, opciones, fen, correcta, solucion, alternas, explica, lichess, rating)
values
`;
  const pie = `
on conflict (id) do update set
  area = excluded.area, tipo = excluded.tipo, peso = excluded.peso,
  elo = excluded.elo, elo_base = excluded.elo_base, enunciado = excluded.enunciado,
  opciones = excluded.opciones, fen = excluded.fen, correcta = excluded.correcta,
  solucion = excluded.solucion, alternas = excluded.alternas, explica = excluded.explica,
  lichess = excluded.lichess, rating = excluded.rating, updated_at = now();
`;
  const tandas = [];
  for (let i = 0; i < ITEMS.length; i += TANDA) {
    const filas = ITEMS.slice(i, i + TANDA).map(filaDe).join(",\n");
    tandas.push(encabezado + filas + pie);
  }
  const sql = `-- Generado por herramientas/diagnostico-sincronizar.js --migracion a partir de
-- js/diagnostico-items.js (${ITEMS.length} ítems). NO SE EDITA A MANO: para
-- corregir una pregunta se edita js/diagnostico-items.js y se vuelve a correr
-- el script.
${tandas.join("\n")}
-- Preguntas que se hayan borrado de js/diagnostico-items.js: se quitan
-- también de la base. Si estuvieran en una prueba en curso, esa prueba
-- fallaría al pedir esa pregunta — igual que hoy un banco más corto deja
-- huecos; es un caso ya contemplado en diagnostico_armar().
delete from public.diagnostico_items
 where id not in (${ITEMS.map((it) => sqlTexto(it.id)).join(", ")});
`;
  const fecha = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "");
  const destino = path.join(RAIZ, `supabase/migraciones/${fecha}_diagnostico_banco_datos.sql`);
  fs.writeFileSync(destino, sql);
  console.log(`Escrito ${path.relative(RAIZ, destino)} con ${ITEMS.length} ítems.`);
}

if (require.main === module) {
  generarCatalogo();
  if (process.argv.includes("--migracion")) generarMigracion();
}

module.exports = { BANCO, CATALOGO, ITEMS, catalogoDe };
