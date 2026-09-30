#!/usr/bin/env node
/* Que `elo-fide` lea bien el Elo de las dos páginas públicas, y que NUNCA
 * invente uno.
 *
 * No necesita red, ni navegador, ni el sitio servido: prueba
 * `supabase/functions/elo-fide/leer-elo.ts` contra extractos del HTML tal como
 * lo sirven ratings.fide.com y ajedrezcostarica.com (setiembre de 2026). Si
 * alguno de los dos cambia su formato, la función deja de encontrar el número
 * —y lo deja en null, no en 0—; este verificador es el que dice con qué forma
 * se contaba. Ver «El Elo oficial, mes a mes» en docs/decisiones/informes.md.
 *
 * `leer-elo.ts` es TypeScript (se despliega a Deno): se carga en un
 * subproceso con --experimental-strip-types, como el informe de la casa.
 *
 *   node herramientas/verificar-elo-fide.js
 */
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.join(__dirname, "..");

// ---- ratings.fide.com/profile/<id> ----
const fichaConRating = `<!DOCTYPE html><html lang="en"><head>
<title>Angulo Cubero, Oscar FIDE Profile</title></head><body>
<div class="profile-games ">
  <div class="profile-standart profile-game ">
    <img src="/img/logo_std.svg" alt="standart" height=25>
    <p>2152</p><p style="font-size: 8px; padding:0; margin:0;">STANDARD <span class=inactiv_note>inactive</span></p>
  </div>
  <div class="profile-rapid profile-game ">
    <img src="/img/logo_rpd.svg" alt="rapid"  height=25>
    <p>2095</p><p style="font-size: 8px; padding:0; margin:0;">RAPID<span class=inactiv_note></p>
  </div>
</div>
<div class="profile-info-row "><h5>FIDE ID</h5><p class="profile-info-id ">6501435</p></div>
</body></html>`;
const fichaSinRating = `<html><head><title>Salazar Perez, Aldana Maria FIDE Profile</title></head><body>
  <div class="profile-standart profile-game ">
    <img src="/img/logo_std.svg" alt="standart" height=25>
    <p>Not rated</p><p style="font-size: 8px; padding:0; margin:0;">STANDARD <span class=inactiv_note></span></p>
  </div>
  <div class="profile-rapid profile-game "><p>1650</p></div></body></html>`;
// Un código que no existe también contesta 200, con un título genérico.
const fichaInexistente = `<html><head><title>Chess Players Arbiters Trainers Database FIDE Profile</title></head>
<body><div class="search">No player found</div></body></html>`;

// ---- ajedrezcostarica.com/es/national-rating?name=… (Next.js) ----
// Los jugadores vienen como JSON dentro de un <script>, con las comillas
// escapadas; así llegan.
const jugador = (fideId, name, national, fideStandard, i) =>
  `[\\"$\\",\\"$1\\",\\"${i}\\",{\\"children\\":[[\\"$\\",\\"$L9a\\",null,{\\"player\\":{\\"fideId\\":\\"${fideId}\\",` +
  `\\"name\\":\\"${name}\\",\\"club\\":\\"Escazú\\",\\"title\\":\\"NM\\",\\"rank\\":\\"14\\",\\"gender\\":1,` +
  `\\"rating\\":${national},\\"delta\\":0,\\"age\\":37,\\"active\\":false,\\"images\\":{\\"small\\":\\"https://x.test/80x80/29.webp\\",` +
  `\\"medium\\":\\"\\"},\\"ratings\\":{\\"national\\":${national},\\"fideStandard\\":${fideStandard},\\"fideRapid\\":2095,` +
  `\\"fideBlitz\\":2154,\\"nationalDelta\\":0,\\"fideStandardDelta\\":0,\\"fideRapidDelta\\":0,\\"fideBlitzDelta\\":0}},` +
  `\\"index\\":${i},\\"userImg\\":true}],false]}]`;
const listaNacional = `<!DOCTYPE html><html lang="es"><head><title>Clasificación Nacional | Ajedrez Costa Rica</title></head><body>
<script>self.__next_f.push([1,"4d:[\\"$\\",\\"div\\",null,{\\"children\\":[[\\"$\\",\\"p\\",null,{\\"children\\":\\"2 jugadores\\"}],` +
  `[\\"$\\",\\"p\\",null,{\\"children\\":\\"Septiembre 2026\\"}]]}]\\n` +
  jugador("6501435", "Angulo Cubero, Oscar", 2268, 2152, 0) + "," +
  jugador("6539645", "Angulo Cubero, Otra Persona", 1400, 0, 1) +
  `\\n"])</script></body></html>`;

const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", `
  const m = await import(${JSON.stringify(path.join(RAIZ, "supabase/functions/elo-fide/leer-elo.ts"))});
  const casos = JSON.parse(process.argv[1]);
  process.stdout.write(JSON.stringify({
    conRating: m.leerFichaFide(casos.fichaConRating),
    sinRating: m.leerFichaFide(casos.fichaSinRating),
    inexistente: m.leerFichaFide(casos.fichaInexistente),
    lista: m.leerListaNacional(casos.listaNacional),
    listaVacia: m.leerListaNacional("<html><body>0 jugadores</body></html>"),
    busquedas: m.busquedasPorNombre("Angulo Cubero, Oscar"),
    busquedasSinComa: m.busquedasPorNombre("  Oscar   Angulo Cubero "),
    busquedasVacio: m.busquedasPorNombre(null),
    finDeMesUtc: m.periodoCostaRica(new Date("2026-10-01T05:59:00Z")),
    inicioDeMesCr: m.periodoCostaRica(new Date("2026-10-01T06:00:00Z")),
  }));
`, JSON.stringify({ fichaConRating, fichaSinRating, fichaInexistente, listaNacional })], { cwd: RAIZ, encoding: "utf8" });
if (r.status !== 0) {
  console.error("No se pudo cargar leer-elo.ts:\n" + (r.stderr || r.stdout));
  process.exit(1);
}
const x = JSON.parse(r.stdout);

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

// ---- La ficha de la FIDE ----
ok(x.conRating && x.conRating.estandar === 2152, "la ficha con rating debería dar el Estándar 2152: " + JSON.stringify(x.conRating));
ok(x.conRating && x.conRating.nombre === "Angulo Cubero, Oscar", "el nombre sale del <title>, sin «FIDE Profile»");
ok(x.sinRating && x.sinRating.estandar === null, "«Not rated» es null, no 0 ni el rating de Rápidas: " + JSON.stringify(x.sinRating));
ok(x.sinRating && x.sinRating.nombre === "Salazar Perez, Aldana Maria", "sin rating el nombre igual se lee");
ok(x.inexistente === null, "un código que no existe (título genérico, sin ratings) no es una ficha: " + JSON.stringify(x.inexistente));

// ---- La lista nacional ----
ok(Array.isArray(x.lista) && x.lista.length === 2, "la lista nacional debería traer los 2 jugadores: " + JSON.stringify(x.lista));
const oscar = (x.lista || []).find((f) => f.fideId === "6501435");
ok(oscar && oscar.nacional === 2268 && oscar.fideEstandar === 2152, "el jugador 6501435 debería tener Nacional 2268 y FIDE 2152: " + JSON.stringify(oscar));
const otro = (x.lista || []).find((f) => f.fideId === "6539645");
ok(otro && otro.nacional === 1400 && otro.fideEstandar === null, "un FIDE Estándar en 0 es null: " + JSON.stringify(otro));
ok(otro && otro.nombre === "Angulo Cubero, Otra Persona", "cada fila con SU nombre: los homónimos se separan por código, no por nombre");
ok(Array.isArray(x.listaVacia) && x.listaVacia.length === 0, "una lista sin jugadores es una lista vacía");

// ---- Cómo se busca y en qué mes cae ----
ok(JSON.stringify(x.busquedas) === JSON.stringify(["Angulo Cubero", "Angulo Cubero Oscar", "Angulo"]),
  "se busca primero por los apellidos, después el nombre entero y por último el primer apellido: " + JSON.stringify(x.busquedas));
ok(x.busquedasSinComa[0] === "Oscar Angulo Cubero", "un nombre sin coma se busca entero y sin espacios de más: " + JSON.stringify(x.busquedasSinComa));
ok(Array.isArray(x.busquedasVacio) && x.busquedasVacio.length === 0, "sin nombre no hay búsqueda");
ok(x.finDeMesUtc === "2026-09-01", "el 30 de setiembre a las 11:59 p. m. de Costa Rica todavía es setiembre: " + x.finDeMesUtc);
ok(x.inicioDeMesCr === "2026-10-01", "y a la medianoche de Costa Rica ya es octubre: " + x.inicioDeMesCr);

if (fallos.length) {
  console.error(`❌ ${fallos.length} fallo(s):\n` + fallos.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
console.log("✅ El lector del Elo FIDE y Nacional: todo bien.");
