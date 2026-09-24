#!/usr/bin/env node
/* Que toda página de la Academia lleve su guardia de sesión, y la correcta.
 *
 * No necesita navegador, ni red, ni el sitio servido.
 *
 * La guardia (la pone herramientas/academia-cabecera.py, ver «La guardia de
 * sesión» ahí) manda al login ANTES de bajar nada si no hay ninguna sesión
 * guardada. Sin ella la página funciona igual —su propio script también manda
 * al login—, solo que después de bajar hasta 800 KB para nada. Por eso se
 * pierde callado: una página nueva que no pasó por el script, o una clave de
 * sesión que dejó de ser la de supabase-js, y nadie lo nota.
 *
 * Comprueba, para cada página de PAGINAS salvo SIN_GUARDIA:
 *   · que tenga la guardia UNA vez, justo después de <meta charset>;
 *   · que busque la clave sb-<proyecto>-auth-token del proyecto de
 *     js/supabase-client.js;
 *   · que vuelva a SU página (next=<ruta>) por una ruta al login que llegue;
 *   · que detenga la carga antes de navegar (window.stop()) y se aparte si ya
 *     hay un window.sb.
 */
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const py = fs.readFileSync(path.join(__dirname, "academia-cabecera.py"), "utf8");
const lista = (nombre) => {
  const m = py.match(new RegExp("^" + nombre + " = ([\\[{][\\s\\S]*?[\\]}])", "m"));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
};
const PAGINAS = lista("PAGINAS");
const SIN_GUARDIA = new Set(lista("SIN_GUARDIA"));
const proyecto = (fs.readFileSync(path.join(raiz, "js", "supabase-client.js"), "utf8")
  .match(/SUPABASE_URL = "https:\/\/([a-z0-9]+)\.supabase\.co"/) || [])[1];

let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };

console.log("=== La guardia de sesión de las páginas de la Academia ===");
if (!PAGINAS.length) mal("no encontré la lista PAGINAS en academia-cabecera.py");
if (!proyecto) mal("no encontré SUPABASE_URL en js/supabase-client.js");
let con = 0;
for (const ruta of PAGINAS) {
  const archivo = path.join(raiz, ruta);
  if (!fs.existsSync(archivo)) continue;
  const html = fs.readFileSync(archivo, "utf8");
  const guardias = html.match(/<!-- guardia: inicio -->[\s\S]*?<!-- guardia: fin -->/g) || [];
  if (SIN_GUARDIA.has(ruta)) {
    if (guardias.length) mal(`${ruta} está en SIN_GUARDIA pero lleva guardia`);
    continue;
  }
  if (guardias.length !== 1) { mal(`${ruta}: ${guardias.length} guardias (tiene que haber una). Corre: python3 herramientas/academia-cabecera.py`); continue; }
  const g = guardias[0];
  if (!/<meta charset="[^"]*"><!-- guardia: inicio -->/.test(html)) mal(`${ruta}: la guardia no va justo después de <meta charset>`);
  if (!g.includes(`"sb-${proyecto}-auth-token"`)) mal(`${ruta}: la guardia no busca la sesión de este proyecto (sb-${proyecto}-auth-token)`);
  if (!g.includes("window.sb||")) mal(`${ruta}: la guardia no se aparta si ya hay un window.sb`);
  if (!/window\.stop\(\)[\s\S]*location\.replace/.test(g)) mal(`${ruta}: la guardia no detiene la carga antes de navegar`);
  const login = (g.match(/location\.replace\("([^"]*)login\.html\?next="/) || [])[1];
  if (login === undefined) mal(`${ruta}: la guardia no manda a login.html?next=`);
  else if (path.resolve(path.dirname(archivo), login + "login.html") !== path.join(raiz, "login.html")) mal(`${ruta}: la ruta al login no llega (${login}login.html)`);
  if (!g.includes(`encodeURIComponent(${JSON.stringify(ruta)})`)) mal(`${ruta}: la guardia no vuelve a su propia página`);
  con += 1;
}
if (!fallos) console.log(`  ✓ ${con} páginas con su guardia, ${SIN_GUARDIA.size} sin ella a propósito`);
console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
