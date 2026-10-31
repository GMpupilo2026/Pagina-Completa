#!/usr/bin/env node
/* «Agregar desde una lista de Elo» de Pareo Integral: que la Edge Function
 * `pareo-listas-elo` lea bien las dos listas y NUNCA invente un Elo, y que la
 * página agregue al jugador con el Elo de la lista elegida.
 *
 * 1. El lector (`supabase/functions/pareo-listas-elo/leer-listas.ts`), sin
 *    red: contra extractos del HTML tal como lo sirven el buscador de
 *    ratings.fide.com y ajedrezcostarica.com (octubre de 2026). Si alguno
 *    cambia su formato, la función deja de encontrar las filas —lista vacía,
 *    Elo en null—; este verificador dice con qué forma se contaba. Es
 *    TypeScript (se despliega a Deno): se carga en un subproceso con
 *    --experimental-strip-types, como verificar-elo-fide.js.
 * 2. La página (pareo.html), con un doble de la función por page.route():
 *    lo que viaja (solo la lista y lo escrito), la tabla de resultados, el
 *    Elo de la lista elegida (Estándar, Rápido, Blitz o Nacional), el título,
 *    la federación, el sexo y el código FIDE del jugador agregado, el «Ya
 *    está» de quien ya está inscrito y el error de la función dicho en un
 *    aviso.
 *
 * Ver «Pareo Integral: agregar jugadores desde las listas de Elo» en
 * docs/decisiones/juegos-y-torneos.md.
 *
 *   node herramientas/verificar-pareo-listas-elo.js
 */
const path = require("path");
const { spawnSync } = require("child_process");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";

const fallos = [];
const ok = (cond, msg) => { if (!cond) fallos.push(msg); };

// ---- ratings.fide.com/incl_search_l.php?search=angulo%20cubero&simple=1 ----
// Tal como llegó (con sus \r\n y tabuladores): dos personas, una sin ningún
// rating. A la segunda se le puso «FM» para probar el título (llegó vacío).
const fideFila = (id, nombre, titulo, std, rpd, blz, anio) => `<tr>\r\n\t\t\t\t\t\t<td data-label="FIDEID" class="box-div">${id}</td>\r\n` +
  `\t\t\t\t\t\t<td data-label="Name"><a href=/profile/${id} class="found_name">${nombre}</a></td>\t\t\t\t\t\t\r\n` +
  `\t\t\t\t\t\t<td data-label="title">${titulo}</td>\t\t\t\t\t\t\r\n` +
  `\t\t\t\t\t\t<td data-label="Train. Ttl."><span style="color:#c49191">FI</span></td>\r\n` +
  `\t\t\t\t\t\t<td class="flag-wrapper">\r\n                        <img src="/svg/CRC.svg" alt="CRC">CRC\r\n                        </td>\r\n` +
  `\t\t\t\t\t\t<td data-label="Rtg">${std}</td>\r\n\t\t\t\t\t\t<td data-label="Rtg">${rpd}</td>\r\n\t\t\t\t\t\t<td data-label="Rtg">${blz}</td>\r\n` +
  `\t\t\t\t\t\t<td data-label="B-Year">${anio}</td>\r\n\t\t\t\t\t\t</tr>`;
const busquedaFide = `<div id="tabs" class="ui-tabs ui-corner-all ui-widget ui-widget-content"><div>\r\n\t\t\t\t\t&nbsp;&nbsp;&nbsp;2 record(s) found. \r\n\t\t</div>` +
  `<div id="tabs-1" role="tabpanel"><table cellpadding=1 cellspacing=2 border=0 width=100% align=center class="table-top" id="table_results">\r\n` +
  `\t\t\t\t\t<thead>\t\t\t\t\t\r\n\t\t\t\t\t<tr>\r\n\t\t\t\t\t<th class="box-div"><b>FIDE ID</b></th>\r\n\t\t\t\t\t<th><b>Name</b></th>\r\n\t\t\t\t\t<th><b>Title</b></th>\r\n` +
  `\t\t\t\t\t<th><b>Tr.T.</b></th>\r\n\t\t\t\t\t<th><b>Fed</b></th>\r\n\t\t\t\t\t<th><b>Std.</b></th>\r\n\t\t\t\t\t<th><b>Rpd.</b></th>\r\n\t\t\t\t\t<th><b>Blz.</b></th>\r\n` +
  `\t\t\t\t\t<th><b>B-Year</b></th>\r\n\t\t\t\t\t</tr>\r\n\t\t\t\t\t</thead>\r\n\t\t\t\t\t<tbody>` +
  fideFila("6539645", "Angulo Cubero, Jovel Javier", " ", "", "", "", "1999") +
  fideFila("6501435", "Angulo Cubero, Oscar", "FM", "2152", "2095", "2154", "1989") +
  `</tbody></table></div></div>`;
// Lo que contesta cuando no encuentra a nadie.
const fideNadie = `<div id="tabs"><div>\r\n\t\t\t\t\t&nbsp;&nbsp;&nbsp;0 record(s) found. \r\n\t\t</div></div>`;

// ---- ajedrezcostarica.com/es/national-rating?name=… (Next.js) ----
// Los jugadores vienen como JSON dentro de un <script>, con las comillas
// escapadas; así llegan. «gender»: 1 hombre, 2 mujer.
const nacionalJugador = (fideId, name, title, gender, national, std, rpd, blz, i) =>
  `[\\"$\\",\\"$1\\",\\"${i}\\",{\\"children\\":[[\\"$\\",\\"$Lb4\\",null,{\\"player\\":{\\"fideId\\":\\"${fideId}\\",` +
  `\\"name\\":\\"${name}\\",\\"club\\":\\"Escazú\\",\\"title\\":\\"${title}\\",\\"rank\\":\\"14\\",\\"gender\\":${gender},` +
  `\\"rating\\":${national},\\"delta\\":0,\\"age\\":37,\\"active\\":false,\\"images\\":{\\"small\\":\\"\\",\\"medium\\":\\"\\"},` +
  `\\"ratings\\":{\\"national\\":${national},\\"fideStandard\\":${std},\\"fideRapid\\":${rpd},\\"fideBlitz\\":${blz},` +
  `\\"nationalDelta\\":0,\\"fideStandardDelta\\":0,\\"fideRapidDelta\\":0,\\"fideBlitzDelta\\":0}},\\"index\\":${i},\\"userImg\\":true}],false]}]`;
const listaNacional = `<!DOCTYPE html><html lang="es"><head><title>Clasificación Nacional | Ajedrez Costa Rica</title></head><body>
<script>self.__next_f.push([1,"4d:[\\"$\\",\\"div\\",null,{\\"className\\":\\"border-t border-border\\",\\"children\\":[` +
  nacionalJugador("6501435", "Angulo Cubero, Oscar", "NM", 1, 2268, 2152, 2095, 2154, 0) + "," +
  nacionalJugador("6539645", "Rojas Quintero, Yendry", "WCM", 2, 1407, 0, 0, 0, 1) +
  `]}]\\n"])</script><div hidden id="S:3"><div><div class="flex items-center justify-end gap-2 mb-2 text-muted-foreground text-sm"><p>2 jugadores</p><span>•</span><p>Octubre 2026</p></div></div></div></body></html>`;

const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", `
  const m = await import(${JSON.stringify(path.join(RAIZ, "supabase/functions/pareo-listas-elo/leer-listas.ts"))});
  const casos = JSON.parse(process.argv[1]);
  process.stdout.write(JSON.stringify({
    fide: m.leerBusquedaFide(casos.busquedaFide),
    fideNadie: m.leerBusquedaFide(casos.fideNadie),
    fideRaro: m.leerBusquedaFide("<html><body>Service unavailable</body></html>"),
    nacional: m.leerListaNacionalCompleta(casos.listaNacional),
    nacionalVacia: m.leerListaNacionalCompleta("<html><body><p>0 jugadores</p></body></html>"),
  }));
`, JSON.stringify({ busquedaFide, fideNadie, listaNacional })], { cwd: RAIZ, encoding: "utf8" });
if (r.status !== 0) {
  console.error("No se pudo cargar leer-listas.ts:\n" + (r.stderr || r.stdout));
  process.exit(1);
}
const x = JSON.parse(r.stdout);

// ---- La búsqueda de FIDE ----
ok(x.fide.total === 2 && x.fide.filas.length === 2, "la búsqueda de FIDE debería traer 2 filas y decir 2 encontrados: " + JSON.stringify(x.fide));
const oscarF = x.fide.filas.find((f) => f.fideId === "6501435") || {};
ok(oscarF.nombre === "Angulo Cubero, Oscar", "el nombre sale del enlace, sin etiquetas: " + JSON.stringify(oscarF));
ok(oscarF.estandar === 2152 && oscarF.rapido === 2095 && oscarF.blitz === 2154, "las tres listas de FIDE, cada una en su lugar: " + JSON.stringify(oscarF));
ok(oscarF.titulo === "FM" && oscarF.fed === "CRC" && oscarF.nacimiento === 1989, "título, federación y año de nacimiento: " + JSON.stringify(oscarF));
ok(oscarF.sexo === "" && oscarF.nacional === null, "lo que FIDE no dice (sexo, Elo Nacional) queda vacío, no adivinado: " + JSON.stringify(oscarF));
const jovel = x.fide.filas.find((f) => f.fideId === "6539645") || {};
ok(jovel.estandar === null && jovel.rapido === null && jovel.blitz === null, "una celda sin rating es null, no 0: " + JSON.stringify(jovel));
ok(jovel.titulo === "", "sin título es vacío: " + JSON.stringify(jovel));
ok(x.fideNadie.total === 0 && x.fideNadie.filas.length === 0, "«0 record(s) found» es una lista vacía: " + JSON.stringify(x.fideNadie));
ok(x.fideRaro.filas.length === 0 && x.fideRaro.total === null, "una página que no es la búsqueda no da filas ni un total inventado: " + JSON.stringify(x.fideRaro));

// ---- La lista nacional ----
ok(x.nacional.filas.length === 2 && x.nacional.total === 2, "la lista nacional debería traer 2 jugadores y decir 2: " + JSON.stringify(x.nacional));
ok(x.nacional.periodo === "Octubre 2026", "el mes de la lista: " + x.nacional.periodo);
const oscarN = x.nacional.filas.find((f) => f.fideId === "6501435") || {};
ok(oscarN.nacional === 2268 && oscarN.estandar === 2152 && oscarN.rapido === 2095 && oscarN.blitz === 2154, "los cuatro Elo de la lista nacional: " + JSON.stringify(oscarN));
ok(oscarN.titulo === "", "«NM» no es un título de FIDE de jugador: queda vacío: " + JSON.stringify(oscarN));
ok(oscarN.sexo === "m" && oscarN.fed === "CRC" && oscarN.club === "Escazú", "gender 1 es hombre, la federación es CRC y el club se lee: " + JSON.stringify(oscarN));
const yendry = x.nacional.filas.find((f) => f.fideId === "6539645") || {};
ok(yendry.sexo === "w" && yendry.titulo === "WCM", "gender 2 es mujer y WCM sí es un título de FIDE: " + JSON.stringify(yendry));
ok(yendry.estandar === null && yendry.nacional === 1407, "un Elo FIDE en 0 es null: " + JSON.stringify(yendry));
ok(x.nacionalVacia.filas.length === 0 && x.nacionalVacia.total === 0, "una lista sin jugadores es una lista vacía: " + JSON.stringify(x.nacionalVacia));

// ---- La página ----
const URL_FUNCION = "**/functions/v1/pareo-listas-elo";
const filasFide = x.fide.filas;
const filasNacional = x.nacional.filas;

(async () => {
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  const pedidos = [];
  let responder = (cuerpo) => ({ ok: true, lista: cuerpo.lista, filas: cuerpo.lista === "fide" ? filasFide : filasNacional, total: 2, hayMas: false, periodo: cuerpo.lista === "fide" ? null : "Octubre 2026" });
  await page.route(URL_FUNCION, async (route) => {
    const cuerpo = JSON.parse(route.request().postData() || "{}");
    pedidos.push(cuerpo);
    const res = responder(cuerpo);
    await route.fulfill({ status: res.ok ? 200 : 429, contentType: "application/json", body: JSON.stringify(res) });
  });
  await page.goto(BASE + "/pareo.html");
  await page.click("#pi-nuevo");
  await page.click("#pi-f-jugadores");

  const caja = page.locator("#pi-listas-caja");
  ok(await caja.evaluate((n) => n.checkVisibility()), "el apartado «Agregar desde una lista de Elo» se ve en Jugadores");
  if (!(await caja.evaluate((n) => n.open))) await page.click("#pi-listas-caja > summary");
  const opciones = await page.$$eval("#pi-listas-lista option", (os) => os.map((o) => o.value));
  ok(JSON.stringify(opciones) === JSON.stringify(["estandar", "rapido", "blitz", "nacional"]), "las cuatro listas: " + JSON.stringify(opciones));

  // FIDE Rápido: el Elo que entra es el de Rápido.
  await page.selectOption("#pi-listas-lista", "rapido");
  await page.fill("#pi-listas-q", "Angulo Cubero");
  await page.click("#pi-listas-buscar");
  await page.waitForSelector("#pi-listas-resultados tbody tr");
  ok(pedidos.length === 1 && pedidos[0].lista === "fide" && pedidos[0].q === "Angulo Cubero" && Object.keys(pedidos[0]).length === 2,
    "viaja solo la lista (fide) y lo escrito: " + JSON.stringify(pedidos[0]));
  const filas = await page.$$eval("#pi-listas-resultados tbody tr", (trs) => trs.map((tr) => tr.textContent));
  ok(filas.length === 2, "dos filas de resultados: " + filas.length);
  ok(filas.some((t) => /Angulo Cubero, Oscar/.test(t) && /2095/.test(t)), "la fila de Oscar muestra su Elo de Rápido: " + JSON.stringify(filas));
  await page.click("#pi-listas-resultados button[data-fide-id='6501435']");
  let jug = await page.evaluate(() => {
    const id = localStorage.getItem("pareo_abierto_v1");
    return JSON.parse(localStorage.getItem("pareo_torneo_v1_" + id)).jugadores;
  });
  const o = jug.find((j) => j.fideId === "6501435") || {};
  ok(o.nombre === "Angulo Cubero, Oscar" && o.elo === 2095 && o.titulo === "FM" && o.fed === "CRC",
    "se agrega con el Elo de Rápido, su título y su federación: " + JSON.stringify(o));
  ok(!o.nacimiento, "el año de nacimiento NO se vuelve una fecha inventada: " + JSON.stringify(o));
  const ya = page.locator("#pi-listas-resultados button[data-fide-id='6501435']");
  ok(await ya.isDisabled() && /Ya está/.test(await ya.textContent()), "quien ya está inscrito dice «Ya está» y no se agrega dos veces");
  // Sin Elo en la lista elegida: se agrega con 0, no con el de otra lista.
  await page.click("#pi-listas-resultados button[data-fide-id='6539645']");
  jug = await page.evaluate(() => JSON.parse(localStorage.getItem("pareo_torneo_v1_" + localStorage.getItem("pareo_abierto_v1"))).jugadores);
  const j2 = jug.find((j) => j.fideId === "6539645") || {};
  ok(j2.elo === 0, "sin Elo en la lista elegida entra sin Elo: " + JSON.stringify(j2));

  // La lista nacional: el Elo Nacional y el sexo.
  await page.selectOption("#pi-listas-lista", "nacional");
  await page.fill("#pi-listas-q", "Rojas");
  await page.click("#pi-listas-buscar");
  await page.waitForFunction(() => /Octubre 2026/.test(document.querySelector("#pi-listas-estado").textContent));
  ok(pedidos[1] && pedidos[1].lista === "nacional", "la lista nacional se pide como «nacional»: " + JSON.stringify(pedidos[1]));
  const yaN = page.locator("#pi-listas-resultados button[data-fide-id='6501435']");
  ok(await yaN.isDisabled(), "el mismo código FIDE ya inscrito sale como «Ya está» también en la lista nacional");
  // Quitar a Jovel (6539645) para poder agregar a Yendry, que en el doble tiene su código.
  await page.evaluate(() => {
    const k = "pareo_torneo_v1_" + localStorage.getItem("pareo_abierto_v1");
    const t = JSON.parse(localStorage.getItem(k));
    t.jugadores = t.jugadores.filter((j) => j.fideId !== "6539645");
    localStorage.setItem(k, JSON.stringify(t));
  });
  await page.reload();
  await page.click("#pi-f-jugadores");
  if (!(await page.locator("#pi-listas-caja").evaluate((n) => n.open))) await page.click("#pi-listas-caja > summary");
  ok(await page.inputValue("#pi-listas-lista") === "nacional", "la lista elegida se recuerda");
  await page.fill("#pi-listas-q", "Rojas");
  await page.click("#pi-listas-buscar");
  await page.waitForSelector("#pi-listas-resultados button[data-fide-id='6539645']:not([disabled])");
  await page.click("#pi-listas-resultados button[data-fide-id='6539645']");
  jug = await page.evaluate(() => JSON.parse(localStorage.getItem("pareo_torneo_v1_" + localStorage.getItem("pareo_abierto_v1"))).jugadores);
  const y = jug.find((j) => j.fideId === "6539645") || {};
  ok(y.nombre === "Rojas Quintero, Yendry" && y.elo === 1407 && y.sexo === "w" && y.titulo === "WCM",
    "de la lista nacional entra con el Elo Nacional, su sexo y su título: " + JSON.stringify(y));
  ok(await page.$eval("#pi-cuenta", (n) => n.textContent) === "2", "la tabla de inscritos se pinta con los nuevos");

  // Lo escrito muy corto no viaja.
  const antes = pedidos.length;
  await page.fill("#pi-listas-q", "ab");
  await page.click("#pi-listas-buscar");
  await page.waitForTimeout(300);
  ok(pedidos.length === antes, "con menos de 3 letras no se manda nada");

  // El error de la función (el freno) se dice en un aviso.
  responder = () => ({ ok: false, error: "Ya buscaste muchas veces en la última hora. Espera un rato e intenta de nuevo." });
  await page.fill("#pi-listas-q", "Rojas");
  await page.click("#pi-listas-buscar");
  await page.waitForFunction(() => /Ya buscaste muchas veces/.test(document.body.textContent));
  ok(true, "");

  ok(errores.length === 0, "sin errores en la página: " + errores.join(" | "));
  await navegador.close();

  if (fallos.length) {
    console.error(`❌ ${fallos.length} fallo(s):\n` + fallos.map((f) => "  - " + f).join("\n"));
    process.exit(1);
  }
  console.log("✅ Agregar desde las listas de Elo: todo bien.");
})().catch((e) => { console.error(e); process.exit(1); });
