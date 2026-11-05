/* Las banderitas de los jugadores y las mesas sin rival del Centroamericano 2026: lo que no necesita navegador.

   1. supabase/functions/_compartido/inscritos-fed.ts, el módulo que comparten las funciones:
      - la lista de inscritos de chess-results (art=0) → la federación de cada jugador, buscada por el nombre como lo escribe
        la pantalla de resultados («Ramos Rodriguez Daniel») aunque la lista diga «Ramos Rodríguez, Daniel»;
      - las mesas SIN RIVAL («ausgeschieden», «bye»…) no son partidas: se reconocen y se quitan.
   2. Que de verdad se quitan en TODAS las lecturas que sirven las funciones (la copia compartida, la lupa, «Mis pareos», las mesas en vivo)
      y que cada función que usa el módulo lo recibe al armarse. Leído del código: una lectura nueva que se olvida de filtrar deja la
      mesa rara en la tablet de un árbitro, sin ningún error.
   3. js/centroamericano-banderas.js: la banderita solo sale si el país tiene dibujo; con una federación rara, no pone nada.

   Ver «Banderas y mesas sin rival» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-banderas        */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");
const leer = (...r) => fs.readFileSync(path.join(RAIZ, ...r), "utf8");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
  else console.log("  ✓ " + nombre);
}

// La lista de inscritos como la escribe chess-results (art=0): una fila de encabezado y una por jugador.
const LISTA = `<table class="CRs1"><tr><td>No.</td><td>&nbsp;</td><td></td><td>Nombre</td><td>FIDE-ID</td><td>FED</td><td>FIDE</td></tr>
<tr><td>1</td><td></td><td><div>FM</div></td><td>Guevara Ruiz, Santiago Jose</td><td>6708870</td><td>ESA</td><td>2252</td></tr>
<tr><td>2</td><td></td><td>WIM</td><td>Mayorga Araya, Sofía</td><td>6514065</td><td>CRC</td><td>2215</td></tr>
<tr><td>3</td><td></td><td></td><td>Ramos Rodríguez, Daniel</td><td></td><td>GUA</td><td>1900</td></tr>
<tr><td>4</td><td></td><td></td><td>Sin Federacion, Pedro</td><td></td><td></td><td>1500</td></tr></table>`;

// El módulo se prueba con node (--experimental-strip-types): no tiene nada de Deno al cargarse.
function correr(codigo) {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", codigo], { encoding: "utf8", cwd: RAIZ });
  if (r.status !== 0) { console.log("  ✗ no se pudo correr el módulo: " + (r.stderr || "").split("\n").slice(0, 6).join(" | ")); fallos++; return null; }
  return JSON.parse(r.stdout);
}
const ruta = (f) => JSON.stringify(path.join(RAIZ, "supabase/functions/_compartido", f));

console.log("\n=== La federación de cada jugador (inscritos-fed.ts) ===");
{
  const r = correr(`
    import * as M from ${ruta("inscritos-fed.ts")};
    const m = M.fedsDeHtml(${JSON.stringify(LISTA)});
    console.log(JSON.stringify({
      cuantos: m.size,
      ramos: M.fedDe(m, "Ramos Rodriguez Daniel"), mayorga: M.fedDe(m, "MAYORGA ARAYA SOFIA"), guevara: M.fedDe(m, "Guevara Ruiz Santiago Jose"),
      sinFed: M.fedDe(m, "Sin Federacion Pedro"), nadie: M.fedDe(m, "Nadie Aqui"), vacio: M.fedDe(null, "X"), sinLista: M.fedsDeHtml("<html></html>").size,
      clave: M.claveNombre("Ramos  Rodríguez, Daniel"),
    }));`);
  if (r) {
    igual("la federación se busca por el nombre de la pantalla de resultados (sin coma, sin tildes, sin mayúsculas)", [r.ramos, r.mayorga, r.guevara], ["GUA", "CRC", "ESA"]);
    igual("quien no tiene federación o no está en la lista no inventa una bandera", [r.sinFed, r.nadie, r.vacio], [null, null, null]);
    igual("cuenta solo a quien tiene un código de tres letras, y una página sin la tabla no rompe nada", [r.cuantos, r.sinLista], [3, 0]);
    igual("la clave de un nombre no depende de comas, tildes ni espacios dobles", r.clave, "ramos rodriguez daniel");
  }
}

console.log("\n=== Las mesas sin rival ===");
{
  const r = correr(`
    import * as M from ${ruta("inscritos-fed.ts")};
    console.log(JSON.stringify({
      palabras: ["ausgeschieden", "Ausgeschieden", "bye", "BYE", "spielfrei", "Libre", " ", "", "---", "12", "not paired", "sin emparejar"].map(M.sinRival),
      personas: ["Ramos Rodriguez Daniel", "Li Javin", "Bye Ana", "Singh Aidan", "Peña D'Angelo José"].map(M.sinRival),
      filtra: M.conRival([{ mesa: 1, blancas: "A B", negras: "C D" }, { mesa: 2, blancas: "E F", negras: "ausgeschieden" }, { mesa: 3, blancas: "ausgeschieden", negras: "G H" }, { mesa: 4, blancas: "I J", negras: "" }]).map((m) => m.mesa),
    }));`);
  if (r) {
    igual("«ausgeschieden», bye, libre, vacío, solo símbolos o números: sin rival", r.palabras, r.palabras.map(() => true));
    igual("un nombre de verdad no se confunde con eso (ni uno que contiene «bye» como apellido)", r.personas, [false, false, false, false, false]);
    igual("conRival quita las mesas de rival raro, de cualquiera de los dos lados, o vacío", r.filtra, [1]);
  }
  // La copia compartida (lecturas-cache) la usa al armar cada lectura: lo que sirven todas las funciones sale ya sin esas mesas.
  const lc = correr(`
    import { aLectura } from ${ruta("lecturas-cache.ts")};
    const l = aLectura({ ronda: 4, torneo: "T", mesas: [
      { mesa: 1, blancas: "Ramos Rodriguez Daniel", negras: "Mayorga Araya Sofia", valor: "0", campo: "a" },
      { mesa: 2, blancas: "Lara Santos Angel Sebastian", negras: "ausgeschieden", valor: "3", campo: "b" } ] });
    console.log(JSON.stringify(l.mesas.map((m) => m.mesa)));`);
  igual("la lectura compartida (aLectura) no trae la mesa del retirado", lc, [1]);
}

console.log("\n=== Que ninguna lectura que se sirve se olvide de quitarlas ===");
{
  const cache = leer("supabase/functions/_compartido/lecturas-cache.ts"), idx = leer("supabase/functions/centroamericano-mesa/index.ts"), vivo = leer("supabase/functions/centroamericano-mesas-vivo/index.ts");
  igual("la copia compartida filtra al armar la lectura Y al leerla de la base (deFila)", [/conRival\(p\.mesas/.test(cache), /mesas: conRival\(f\.mesas\)/.test(cache)], [true, true]);
  igual("«¿Dónde juega?» filtra la copia que lee directo de la tabla", /copias\.set\(f\.tnr, \{ ronda: f\.ronda, mesas: conRival\(f\.mesas\)/.test(idx), true);
  igual("«Mis pareos» quita las partidas guardadas sin rival y las de la copia", [/sinRival\(g\.blancas\) \|\| sinRival\(g\.negras\)/.test(idx), /conRival\(copia\.mesas\)/.test(idx)], [true, true]);
  igual("las mesas en vivo (la transmisión sin atraso) no la cuentan como «no reconocida»", /!sinRival\(m\.blancas\) && !sinRival\(m\.negras\)/.test(vivo), true);
  igual("al guardar un resultado el avance también deja fuera las mesas sin rival (igual que al leer)", /avance\(conRival\(res\.antes\.mesas\.map/.test(idx), true);
  igual("las tres respuestas con mesas llevan la federación de cada lado", [/fed_b: fedDe\(feds, blancas\)/.test(idx), /fed_b: fedDe\(fd, blancas\)/.test(idx), /fed_b: fedDe\(fedsPor\.get\(e\.tnr\), m\.blancas\)/.test(idx)], [true, true, true]);
  // El desestructurado de `leer` tiene que tener UN nombre por cada petición de Promise.all, en el mismo orden: si falta uno, todo lo de
  // después se corre de lugar (la hora de inicio de la ronda salía siempre vacía y, con las banderas, la respuesta era un 502).
  {
    const ini = idx.indexOf("const [filas, { data: fin }"), cabeza = idx.slice(ini, idx.indexOf("] = await Promise.all([", ini));
    const nombres = cabeza.replace("const [", "").split(/,(?![^{]*\})/).map((x) => x.trim());
    igual("leer: un nombre por cada petición del Promise.all, en el mismo orden (guardarAvance y la hora de inicio no se pisan)", [nombres.length, nombres.slice(-3)], [11, ["_avance", "{ data: inicioRonda }", "feds"]]);
  }
  igual("leer pide la lista de inscritos con un tope de espera: sin ella, sin banderas y nada más se retrasa", /fedsDe\(a\.tnr, 3000\)\.catch/.test(idx), true);
  const armar = leer("herramientas/funciones-armar.js");
  igual("las tres funciones reciben el módulo al armarse", ["centroamericano-mesa", "centroamericano-clave", "centroamericano-mesas-vivo"].map((f) => new RegExp('"' + f + '": \\[[^\\]]*"inscritos-fed\\.ts"').test(armar)), [true, true, true]);
  // La función solo manda el nombre y la federación: nunca una dirección ni una clave de chess-results.
  igual("la lectura de inscritos pide solo chess-results.com con un número de torneo de cifras", [/tnr\\" \+ tnr|tnr" \+ tnr/.test(leer("supabase/functions/_compartido/inscritos-fed.ts")), /\^\\d\{4,9\}\$/.test(leer("supabase/functions/_compartido/inscritos-fed.ts"))], [true, true]);
}

console.log("\n=== La banderita en la tablet (js/centroamericano-banderas.js) ===");
{
  const src = leer("js", "centroamericano-banderas.js"), banderas = require(path.join(RAIZ, "js", "gafetes-banderas.js"));
  igual("el dibujo es el de la tabla de FIDE a ISO ya copiada (nada nuevo que mantener)", [banderas.iso("CRC"), banderas.iso("GUA"), banderas.iso("ESA"), banderas.iso("TTO"), banderas.iso("XXX")], ["cr", "gt", "sv", "tt", null]);
  igual("todas las federaciones de la tabla tienen su dibujo en img/banderas/", Object.values(banderas.FIDE).every((i) => fs.existsSync(path.join(RAIZ, "img", "banderas", i + ".svg"))), true);
  igual("el dibujo es decorativo (alt vacío) y el código va escrito para el lector de pantalla, no solo la imagen", [/i\.alt = ""/.test(src), /sr-only/.test(src), /s\.title = codigo/.test(src)], [true, true, true]);
  igual("sin dibujo para el país no pone nada (null)", /if \(!iso\) return null/.test(src), true);
  for (const pagina of ["centroamericano-arbitro.html"]) {
    const html = leer(pagina), i = html.indexOf("gafetes-banderas.js"), j = html.indexOf("centroamericano-banderas.js"), k = html.lastIndexOf("js/centroamericano-arbitro.js");
    igual(pagina + " carga la tabla de banderas, luego la banderita y luego la página", i > 0 && j > i && k > j, true);
  }
}

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
process.exit(fallos ? 1 : 0);
