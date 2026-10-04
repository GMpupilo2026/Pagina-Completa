#!/usr/bin/env node
/* Lo que el sitio escucha por Realtime tiene que estar publicado, y lo
 * publicado tiene que tener quien lo escuche.
 *
 * No necesita red, ni navegador, ni la base: compara las tablas que nombran
 * los `postgres_changes` de js/ con las líneas `realtime` del retrato del
 * esquema (supabase/esquema/inventario-academia.txt), que se arma desde la
 * base con herramientas/inventario-esquema.sql.
 *
 * Las dos cosas fallan callado:
 *  - una tabla escuchada que no está en `supabase_realtime` no manda nada, y
 *    la página se queda mostrando lo de la carga (torneo.js escuchó así cuatro
 *    tablas de torneos que nunca estuvieron publicadas: los resultados no
 *    llegaban hasta recargar);
 *  - una tabla publicada que nadie escucha le da trabajo a Realtime en cada
 *    cambio, para nada (class_attendance).
 * Ver «Lo que se escucha por Realtime tiene que estar publicado» en
 * docs/decisiones/sitio-e-infraestructura.md.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function ok(cond, msg) {
  if (cond) console.log("  ✓ " + msg);
  else { fallos += 1; console.log("  ✗ " + msg); }
}

/* Las tablas escuchadas: `table: "x"` escrito, y las que se recorren en una
   lista (`for (const table of ["a", "b"])` o `["a", "b"].forEach((table)`),
   que es como lo hacen competir.js y torneo.js. */
function escuchadas() {
  const dir = path.join(RAIZ, "js");
  const mapa = new Map();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    if (!/postgres_changes/.test(src)) continue;
    const nombres = new Set();
    for (const m of src.matchAll(/table:\s*["']([a-z_0-9]+)["']/g)) nombres.add(m[1]);
    /* La escucha de js/sala-juego.js recibe la tabla como opción
       (SalaJuego.suscribir(id, cb, { tabla: "relevos" })): esa página la
       escucha aunque el `postgres_changes` esté escrito en sala-juego.js. */
    if (/SalaJuego\.suscribir\(/.test(src)) {
      for (const m of src.matchAll(/tabla:\s*["']([a-z_0-9]+)["']/g)) nombres.add(m[1]);
    }
    const listas = [
      ...src.matchAll(/for\s*\(\s*const\s+table\s+of\s*\[([^\]]*)\]/g),
      ...src.matchAll(/\[([^\]]*)\]\s*\.forEach\(\s*\(?\s*table\b/g),
    ];
    for (const m of listas) {
      for (const n of m[1].matchAll(/["']([a-z_0-9]+)["']/g)) nombres.add(n[1]);
    }
    for (const n of nombres) {
      if (!mapa.has(n)) mapa.set(n, new Set());
      mapa.get(n).add(f);
    }
  }
  return mapa;
}

function publicadas() {
  const txt = fs.readFileSync(path.join(RAIZ, "supabase/esquema/inventario-academia.txt"), "utf8");
  return new Set([...txt.matchAll(/^realtime\s+([a-z_0-9]+)\s*$/gm)].map((m) => m[1]));
}

const oidas = escuchadas();
const pub = publicadas();

console.log("=== Realtime: lo escuchado y lo publicado ===");
ok(pub.size > 0, `el retrato del esquema trae la lista de tablas publicadas (${pub.size})`);
ok(oidas.size > 0, `se encontraron las tablas que escucha el sitio (${oidas.size})`);
for (const t of ["tournaments", "tournament_registrations", "tournament_rounds", "tournament_pairings", "game_rooms", "fourplayer_games"]) {
  ok(oidas.has(t), `se reconoce que ${t} se escucha (listas de competir.js y torneo.js incluidas)`);
}

for (const [t, archivos] of [...oidas].sort()) {
  ok(pub.has(t), `${t} se escucha (${[...archivos].join(", ")}) y está publicada`);
}
for (const t of [...pub].sort()) {
  ok(oidas.has(t), `${t} está publicada y alguien la escucha`);
}

console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
