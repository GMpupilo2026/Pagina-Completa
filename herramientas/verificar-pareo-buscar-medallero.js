/* «Torneos en Pareo Integral»: buscar a un jugador desde la portada, el
 * medallero de colegios y clubes, las aperturas (del torneo, del jugador y
 * del año), las rachas de la ficha, las imágenes para compartir y las cifras
 * de admin-pareo.html (js/torneos-pareo-pagina.js y js/admin-pareo.js, con
 * dobles de las funciones de la base de
 * supabase/migraciones/20261023213000_pareo_buscar_medallero_cifras.sql).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - buscar: con menos de tres letras no se pregunta nada; lo escrito viaja a
 *     la base tal cual (ella quita tildes y mayúsculas); una respuesta vieja no
 *     pisa a la nueva; dos personas con el mismo nombre se avisan y salen por
 *     separado, cada una con el enlace a SU ficha (con su huella);
 *   - el medallero: las medallas van escritas (oros, platas, bronces), el año
 *     viaja a la base y cada colegio lleva a su ficha;
 *   - las aperturas: en las Estadísticas del torneo, en la ficha (con blancas
 *     y con negras, desde SU lado) y en el año, reconocidas por las jugadas;
 *   - las rachas: sin perder, de victorias, la de ahora y el mejor torneo, en
 *     orden de fecha y con números escritos;
 *   - la imagen: se baja un PNG de verdad y lleva la marca de agua (la misma
 *     tabla sin marca sale distinta);
 *   - las cifras: las pide a la base y las pinta; la base las niega a quien no
 *     administra (coalesce) y nadie anónimo puede llamarlas;
 *   - en el celular nada se sale de la pantalla.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-buscar-medallero.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { columnasPedidas, dobleListaPareo } = require("./lib/pareo-pruebas");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const PP = require(path.join(RAIZ, "js/pareo/publicar.js"));

let fallos = 0;
const ok = (c, m, detalle) => {
  if (c) console.log("  ✓ " + m);
  else { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; }
};
const igual = (m, a, b) => ok(JSON.stringify(a) === JSON.stringify(b), m, "esperaba " + JSON.stringify(b) + ", salió " + JSON.stringify(a));
const clave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

const HA = "aaaaaaaaaaaaaaaaaaaaaaaa", HB = "bbbbbbbbbbbbbbbbbbbbbbbb";
function torneo(id, nombre, fecha, jug, rondas) {
  const t = T.nuevo({ nombre, rondasTotales: rondas.length, mesaInicial: 1, fechaInicio: fecha, jugadores: jug.map((j) => Object.assign({ elo: 1700 }, j)) });
  t.rondas = rondas.map((mesas) => ({ mesas, ausencias: {} }));
  const datos = PP.datosPublicos(t);
  datos.jugadores.forEach((j) => { delete j.fideId; const o = jug.find((x) => x.id === j.id); if (o.ident) j.ident = o.ident; });
  return { id, nombre, evento: "", lugar: "San José", fecha, rondas: rondas.length, rondas_total: rondas.length, jugadores: jug.length, actualizado: fecha + "T20:00:00Z", organizador_id: null, datos };
}
const SICILIANA = "1. e4 c5 2. Cf3 d6 3. d4 cxd4 4. Cxd4 Cf6 5. Cc3 a6 6. Ae3 e5 1-0";
const FRANCESA = '[Opening "Apertura Inglesa"]\n\n1. e4 e6 2. d4 d5 3. e5 c5 0-1';
const GAMBITO = "1. d4 d5 2. c4 dxc4 3. e3 *";
const ID1 = "22222222-2222-4222-8222-000000000001", ID2 = "22222222-2222-4222-8222-000000000002";
// Ana (HA): en T1 gana con blancas (Najdorf contra ella no: ella lleva
// blancas), gana con negras (Francesa) y empata; en T2 (después) pierde y gana.
// Racha sin perder: 3 (las de T1), se corta en T2 y vuelve a 1.
const T1 = torneo(ID1, "PRUEBA PRIMAVERA", "2026-03-10",
  [{ id: "a", nombre: "Ana Pérez", ident: HA, institucion: "Liceo PRUEBA" }, { id: "b", nombre: "Beto Solís" }, { id: "c", nombre: "Carla Mora" }, { id: "d", nombre: "Diego Rojas" }],
  [[{ b: "a", n: "b", r: "1-0", pgn: SICILIANA }, { b: "c", n: "d", r: "=", pgn: GAMBITO }],
   [{ b: "c", n: "a", r: "0-1", pgn: FRANCESA }, { b: "d", n: "b", r: "1-0" }],
   [{ b: "a", n: "d", r: "=" }, { b: "b", n: "c", r: "1-0" }]]);
const T2 = torneo(ID2, "PRUEBA OTOÑO", "2026-09-20",
  [{ id: "x", nombre: "Ana Pérez", ident: HA, institucion: "Liceo PRUEBA" }, { id: "y", nombre: "Eva Luna" }],
  [[{ b: "y", n: "x", r: "1-0" }], [{ b: "x", n: "y", r: "1-0" }]]);
const FILAS = [T1, T2];

const json = (route, x, status) => route.fulfill({ status: status || 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(x) });
const BUSCADOS = {
  "ANA PEREZ": [
    { persona: "i:" + HA, nombre: "Ana Pérez", ident: HA, institucion: "Liceo PRUEBA", torneos: 2, ultimo: "2026-09-20", podios: 2, homonimos: 2 },
    { persona: "i:" + HB, nombre: "ANA PEREZ", ident: HB, institucion: "", torneos: 1, ultimo: "2026-05-01", podios: 0, homonimos: 2 },
  ],
  "BETO <B>": [{ persona: "n:BETO <B>", nombre: "Beto <b>Solís</b>", ident: null, institucion: "", torneos: 1, ultimo: null, podios: 0, homonimos: 1 }],
};
async function dobles(page, opciones) {
  const o = opciones || {};
  const pedidos = [];
  await page.route("**/rest/v1/pareo_publicados**", (route) => {
    const u = new URL(route.request().url());
    const id = u.searchParams.get("id");
    const filas = id && id.startsWith("eq.") ? FILAS.filter((f) => f.id === id.slice(3)) : FILAS;
    const objeto = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
    const sel = u.searchParams.get("select") || "";
    return objeto ? (filas[0] ? json(route, columnasPedidas(sel, filas[0])) : json(route, { code: "PGRST116" }, 406)) : json(route, filas.map((f) => columnasPedidas(sel, f)));
  });
  await page.route("**/rest/v1/pareo_organizadores**", (route) => json(route, []));
  await dobleListaPareo(page, FILAS, { hoy: "2026-10-23" });
  await page.route("**/rest/v1/rpc/torneos_externos_lista", (route) => json(route, []));
  await page.route("**/rest/v1/rpc/pareo_torneos_de", (route) => {
    const a = JSON.parse(route.request().postData() || "{}");
    return json(route, FILAS.filter((f) => f.datos.jugadores.some((j) => (a.p_ident && j.ident === a.p_ident) || clave(j.nombre) === clave(a.p_nombre))).sort((x, y) => y.fecha.localeCompare(x.fecha)));
  });
  // public.pareo_buscar_jugador: la de «ana» contesta tarde, para ver que no
  // pisa a la de lo último que se escribió.
  await page.route("**/rest/v1/rpc/pareo_buscar_jugador", async (route) => {
    const a = JSON.parse(route.request().postData() || "{}");
    pedidos.push({ fn: "buscar", texto: a.p_texto });
    if (o.lenta && clave(a.p_texto) === "ANA") await new Promise((r) => setTimeout(r, 900));
    const k = clave(a.p_texto);
    return json(route, k === "ANA" ? [{ persona: "n:ANA VIEJA", nombre: "Ana VIEJA", ident: null, institucion: "", torneos: 1, ultimo: null, podios: 0, homonimos: 1 }] : BUSCADOS[k] || []);
  });
  await page.route("**/rest/v1/rpc/pareo_ranking", (route) => json(route, { anios: [2026], categorias: [], filas: [
    { persona: "i:" + HA, nombre: "Ana Pérez", ident: HA, institucion: "Liceo PRUEBA", categoria: "", torneos: 2, partidas: 5, puntos: 3.5, g: 3, e: 1, p: 1, podios: 2, pe: 5, rp: null, cambio: null }] }));
  await page.route("**/rest/v1/rpc/pareo_medallero", (route) => {
    const a = JSON.parse(route.request().postData() || "{}");
    pedidos.push({ fn: "medallero", anio: a.p_anio });
    return json(route, { anios: [2026, 2025], filas: [
      { institucion: "Liceo PRUEBA", oro: 2, plata: 1, bronce: 0, jugadores: 3, torneos: 2 },
      { institucion: "Club <i>Alfil</i>", oro: 0, plata: 0, bronce: 4, jugadores: 2, torneos: 1 },
    ] });
  });
  await page.route("**/rest/v1/rpc/pareo_partidas_del_anio", (route) => {
    const a = JSON.parse(route.request().postData() || "{}");
    pedidos.push({ fn: "partidas", anio: a.p_anio });
    return json(route, [{ torneo: ID1, r: "1-0", jugadas: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6" }, { torneo: ID1, r: "0-1", jugadas: "1. e4 c5 2. c3" },
      { torneo: ID1, r: "=", jugadas: "1. d4 d5 2. c4 e6" }, { torneo: ID1, r: "1-0", jugadas: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. N" }]);
  });
  return pedidos;
}

async function abrir(browser, hash, viewport, opciones) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: viewport || { width: 1280, height: 900 }, timezoneId: "America/Costa_Rica", acceptDownloads: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.clock.setFixedTime(new Date("2026-10-23T18:00:00Z"));
  const pedidos = await dobles(page, opciones);
  await page.goto(BASE + "/torneos-pareo.html" + hash, { waitUntil: "networkidle" });
  return { ctx, page, errores, pedidos };
}
const ir = async (page, hash, selector) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(selector); };
const esperar = (page, f, arg) => page.waitForFunction(f, arg, { timeout: 5000 }).then(() => true, () => false);

async function bajarImagen(page, boton) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.click(boton)]);
  const b = fs.readFileSync(await d.path());
  return { nombre: d.suggestedFilename(), png: b.slice(0, 8).toString("hex") === "89504e470d0a1a0a", bytes: b.length };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  console.log("\n=== Buscar a un jugador ===");
  {
    const { ctx, page, errores, pedidos } = await abrir(browser, "", null, { lenta: true });
    await page.waitForSelector("#tp-lista .tp-dia");
    ok(await page.locator("#tp-buscar-jugador").isVisible(), "está en la portada, al lado de «Buscar un torneo»");
    await page.fill("#tp-buscar-jugador", "an");
    await page.waitForTimeout(600);
    ok(!pedidos.some((p) => p.fn === "buscar"), "con menos de tres letras no se le pregunta nada a la base");
    igual("y lo dice", (await page.textContent("#tp-jugadores-estado")).trim(), "Escribe al menos tres letras.");
    await page.fill("#tp-buscar-jugador", "ana");
    await page.waitForTimeout(450);
    await page.fill("#tp-buscar-jugador", "Ána  Pérez");
    ok(await esperar(page, () => document.querySelectorAll("#tp-jugadores li").length === 2), "salen las dos personas");
    await page.waitForTimeout(1000);
    const nombres = await page.$$eval("#tp-jugadores li a", (l) => l.map((a) => a.textContent));
    igual("la respuesta vieja («ana», que llegó tarde) no pisa a la nueva", nombres, ["Ana Pérez", "ANA PEREZ"]);
    ok(pedidos.some((p) => p.fn === "buscar" && p.texto === "Ána  Pérez"), "lo escrito viaja tal cual: las tildes las quita la base");
    const hrefs = await page.$$eval("#tp-jugadores li a", (l) => l.map((a) => a.getAttribute("href")));
    igual("cada una con el enlace a SU ficha (con su huella)", hrefs, ["#p=Ana+P%C3%A9rez&i=" + HA, "#p=ANA+PEREZ&i=" + HB]);
    const estado = (await page.textContent("#tp-jugadores-estado")).trim();
    ok(/2 jugadores\./.test(estado) && /2 personas distintas/.test(estado), "avisa que hay dos personas con el mismo nombre", estado);
    const primero = await page.textContent("#tp-jugadores li");
    ok(/Liceo PRUEBA · 2 torneos · 2 podios · el último el 20 de (setiembre|septiembre) de 2026/.test(primero), "con su colegio, sus torneos, sus podios y el último, escritos", primero);
    await page.fill("#tp-buscar-jugador", "beto <b>");
    ok(await esperar(page, () => /Beto/.test(document.querySelector("#tp-jugadores") ? document.querySelector("#tp-jugadores").textContent : "")), "otra búsqueda");
    ok(!(await page.$("#tp-jugadores b")), "un nombre con HTML se pinta como texto");
    await page.fill("#tp-buscar-jugador", "zzz nadie");
    ok(await esperar(page, () => /Ningún jugador/.test(document.getElementById("tp-jugadores-estado").textContent)), "sin nadie, lo dice");
    await page.fill("#tp-buscar-jugador", "Ana Pérez");
    await esperar(page, () => document.querySelectorAll("#tp-jugadores li a").length === 2);
    await page.click("#tp-jugadores li a");
    ok(await esperar(page, () => /Ana Pérez/.test(document.getElementById("tp-titulo") ? document.getElementById("tp-titulo").textContent : "")), "y lleva a su ficha");
    ok(!errores.length, "sin errores en la consola", errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== La ficha: rachas, aperturas e imagen ===");
  {
    const { ctx, page, errores } = await abrir(browser, "#p=Ana+P%C3%A9rez&i=" + HA);
    await page.waitForSelector("#tp-ficha-rachas");
    const racha = (k) => page.$eval(`[data-racha="${k}"] dd`, (x) => x.textContent);
    igual("la mejor racha sin perder, en orden de fecha (las 3 de primavera)", await racha("Mejor racha sin perder"), "3 partidas seguidas");
    igual("la mejor racha de victorias", await racha("Mejor racha de victorias"), "2 partidas seguidas");
    igual("la racha de ahora (perdió en otoño y después ganó)", await racha("Racha de ahora"), "1 partida sin perder");
    ok(/PRUEBA PRIMAVERA \(10 de marzo de 2026\): puesto 1 de 4/.test(await racha("Su mejor torneo")), "su mejor torneo, con su puesto escrito", await racha("Su mejor torneo"));
    const ap = (color) => page.$$eval(`#tp-ficha-ap-${color} tbody tr`, (l) => l.map((tr) => [...tr.children].map((td) => td.textContent)));
    igual("con blancas: la Siciliana (Najdorf) que ganó, reconocida por las jugadas en español", await ap("blancas"), [["Defensa SicilianaSiciliana Najdorf (1)", "1", "1", "0", "0"]]);
    igual("con negras: la Francesa que ganó, desde SU lado (no el encabezado del PGN)", await ap("negras"), [["Defensa FrancesaFrancesa, variante del avance (1)", "1", "1", "0", "0"]]);
    const img = await bajarImagen(page, "#tp-ficha-imagen");
    ok(img.png && /^ficha-ana-perez\.png$/.test(img.nombre), "«Bajar como imagen» baja un PNG de verdad", JSON.stringify(img));
    const conYSin = await page.evaluate(async () => {
      const d = { titulo: "PRUEBA", encabezados: ["A", "B"], filas: [["1", "2"], ["3", "4"]] };
      const leer = async (b) => btoa(String.fromCharCode(...new Uint8Array(await b.arrayBuffer())));
      return [await leer(await TablaImagen.armar(d)), await leer(await TablaImagen.armar(Object.assign({ marca: false }, d)))];
    });
    ok(conYSin[0] !== conYSin[1], "y lleva la marca de agua (la misma tabla sin marca sale distinta)");
    ok(!errores.length, "sin errores en la consola", errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Las aperturas del torneo ===");
  {
    const { ctx, page, errores } = await abrir(browser, "#t=" + ID1 + "&v=estadisticas");
    await page.waitForSelector("#tp-est-aperturas");
    const filas = await page.$$eval("#tp-est-aperturas tbody tr", (l) => l.map((tr) => [tr.dataset.apertura, ...[...tr.children].slice(1).map((td) => td.textContent)]));
    igual("una fila por familia, con cómo le fue a cada color en porcentaje escrito", filas, [
      ["Defensa Francesa", "1", "0 %", "0 %", "100 %"], ["Defensa Siciliana", "1", "100 %", "0 %", "0 %"], ["Gambito de dama", "1", "0 %", "100 %", "0 %"]]);
    ok(!errores.length, "sin errores en la consola", errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== El ranking: medallero y aperturas del año ===");
  {
    const { ctx, page, errores, pedidos } = await abrir(browser, "#ranking=1");
    await page.waitForSelector("#tp-rk-tabla");
    igual("tres vistas del año", await page.$$eval("[data-vista-ranking]", (l) => l.map((a) => a.textContent)), ["Jugadores", "Colegios y clubes", "Aperturas"]);
    igual("la de ahora, marcada", await page.$eval("[aria-current='page'][data-vista-ranking]", (a) => a.dataset.vistaRanking), "jugadores");
    const imgRk = await bajarImagen(page, "#tp-rk-imagen-celular");
    ok(imgRk.png && /celular/.test(imgRk.nombre), "el ranking se baja como imagen (también para el celular)", JSON.stringify(imgRk));
    await page.click("[data-vista-ranking='colegios']");
    await page.waitForSelector("#tp-md-tabla");
    igual("el medallero pide el año", pedidos.filter((p) => p.fn === "medallero").map((p) => p.anio), [2026]);
    igual("las medallas van escritas en el encabezado", await page.$$eval("#tp-md-tabla thead th", (l) => l.map((x) => x.textContent)), ["#", "Colegio o club", "Oros (1.°)", "Platas (2.°)", "Bronces (3.°)", "Jugadores", "Torneos"]);
    igual("y los números en cada fila", await page.$$eval("#tp-md-tabla tbody tr", (l) => l.map((tr) => [...tr.children].map((td) => td.textContent))),
      [["1", "Liceo PRUEBA", "2", "1", "0", "3", "2"], ["2", "Club <i>Alfil</i>", "0", "0", "4", "2", "1"]]);
    ok(!(await page.$("#tp-md-tabla i")), "un nombre con HTML se pinta como texto");
    igual("cada colegio lleva a su ficha", await page.$eval("#tp-md-tabla tbody a", (a) => a.getAttribute("href")), "#c=Liceo+PRUEBA");
    await page.selectOption("#tp-md-anio", "2025");
    ok(await esperar(page, () => document.activeElement && document.activeElement.id === "tp-md-anio"), "al cambiar el año, el foco vuelve al control");
    igual("y el año viaja a la base", pedidos.filter((p) => p.fn === "medallero").map((p) => p.anio), [2026, 2025]);
    const imgMd = await bajarImagen(page, "#tp-md-imagen");
    ok(imgMd.png && /^medallero-2025\.png$/.test(imgMd.nombre), "el medallero se baja como imagen", JSON.stringify(imgMd));
    await page.click("[data-vista-ranking='aperturas']");
    await page.waitForSelector("#tp-ap-tabla");
    igual("las aperturas del año: reconocidas por las jugadas, aunque la partida venga cortada", await page.$$eval("#tp-ap-tabla tbody tr", (l) => l.map((tr) => [tr.dataset.apertura, tr.children[1].textContent])),
      [["Defensa Siciliana", "3"], ["Gambito de dama", "1"]]);
    ok(/Siciliana Najdorf \(1\)/.test(await page.textContent("#tp-ap-tabla tbody tr")) && /Siciliana Alapin \(1\)/.test(await page.textContent("#tp-ap-tabla tbody tr")), "con los nombres de adentro");
    igual("cuántas partidas", (await page.textContent("#tp-ap-cuantos")).trim(), "4 partidas publicadas en PGN.");
    ok(await page.$("#tp-ap-imagen") !== null, "y su imagen");
    ok(!errores.length, "sin errores en la consola", errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== En el celular ===");
  for (const hash of ["", "#ranking=colegios", "#p=Ana+P%C3%A9rez&i=" + HA]) {
    const { ctx, page } = await abrir(browser, hash, { width: 360, height: 740 });
    await page.waitForTimeout(400);
    if (!hash) { await page.fill("#tp-buscar-jugador", "Ana Pérez"); await esperar(page, () => document.querySelectorAll("#tp-jugadores li").length === 2); }
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(ancho <= 360, "nada se sale de la pantalla en «" + (hash || "la portada") + "»", ancho + " px");
    await ctx.close();
  }

  console.log("\n=== Las cifras de admin-pareo.html ===");
  {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
    await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: `
      window.__rpc = [];
      const tabla = () => { const b = { select: () => b, order: () => b, range: () => b, eq: () => b, in: () => b, maybeSingle: () => { b.u = 1; return b; },
        then: (res, rej) => Promise.resolve({ data: b.u ? { is_admin: true } : [], error: null }).then(res, rej) }; return b; };
      window.sb = { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "ad" }, access_token: "t" } } }) }, from: tabla,
        rpc(n) { window.__rpc.push(n); return Promise.resolve(n !== "pareo_cifras" ? { data: [], error: null } : { data: {
          torneos: 12, ocultos: 1, jugadores: 230, organizadores: 4, organizadores_activos: 3, verificados: 2, suscripciones: 9, suscripciones_sin_confirmar: 2,
          seguidores: 7, avisos_30_dias: 31, reportes_nuevos: 1, sellos_pendientes: 0, externos: { ajedrezcostarica: 5, "chess-results": 2 },
          por_mes: [{ mes: "2026-09", torneos: 4, jugadores: 80 }, { mes: "2026-10", torneos: 8, jugadores: 150 }] }, error: null }); } };` }));
    await page.goto(BASE + "/admin-pareo.html", { waitUntil: "networkidle" });
    await page.waitForSelector("#ap-cifras-numeros");
    const cifra = (k) => page.$eval(`[data-cifra="${k}"] dd`, (x) => x.textContent);
    igual("los números, escritos", [await cifra("Torneos publicados"), await cifra("Organizaciones"), await cifra("Organizaciones activas (90 días)"), await cifra("Personas que siguen a alguien"), await cifra("Reportes por revisar"), await cifra("De chess-results")],
      ["12", "4", "3", "7", "1", "2"]);
    igual("los meses, del más nuevo al más viejo y con su nombre", await page.$$eval("#ap-cifras tr[data-mes] td:first-child", (l) => l.map((x) => x.textContent)), ["octubre de 2026", "setiembre de 2026"]);
    ok(!/@/.test(await page.textContent("#ap-cifras")), "ningún correo");
    ok(!errores.length, "sin errores en la consola", errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== La base ===");
  const sql = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261023213000_pareo_buscar_medallero_cifras.sql"), "utf8");
  const cifras = sql.slice(sql.indexOf("create or replace function public.pareo_cifras()"));
  ok(/security definer/.test(cifras) && /if not coalesce\(public\.soy_admin\(\), false\) then\s+raise exception/.test(cifras), "las cifras, solo para administración (con coalesce: sin sesión no pasa)");
  ok(/revoke all on function public\.pareo_cifras\(\) from public, anon;/.test(cifras) && !/grant execute on function public\.pareo_cifras\(\) to anon/.test(cifras), "y nadie anónimo puede llamarlas");
  ok(!/'correo'|correo\)/.test(cifras.replace(/count\(distinct correo\)/g, "")), "nunca devuelven un correo, solo cuántos");
  ok(/security invoker/.test(sql.slice(sql.indexOf("pareo_buscar_jugador"), sql.indexOf("pareo_medallero"))), "buscar es invoker: ve lo que ve cualquiera (no los ocultos)");
  ok(/char_length\(array_to_string\(q\.palabras, ''\)\) >= 3/.test(sql), "y la base tampoco busca con menos de tres letras");
  ok(/limit 5000/.test(sql.slice(sql.indexOf("pareo_partidas_del_anio"))) && !/'nombre'|->>'nombre'/.test(sql.slice(sql.indexOf("create or replace function public.pareo_partidas_del_anio"), sql.indexOf("pareo_cifras"))),
    "las partidas del año van con tope y sin nombres");

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
