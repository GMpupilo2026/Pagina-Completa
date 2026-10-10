/* Pareo Integral en un navegador de verdad (pareo.html).
 *
 * El motor, el TRF y los desempates los comprueba verificar-pareo.js sin
 * navegador. Esto es la página, que es donde se rompería callado: un botón que
 * no empareja, una clasificación que no se ve, un torneo que no sobrevive a
 * recargar, un texto que se queda en español al pasar a inglés.
 *
 *   1. Los textos: cada clave que usa la página está en js/pareo/textos.js con
 *      su español y su inglés.
 *   2. Un suizo de 9 de punta a punta: lista pegada, un bye pedido, un retiro,
 *      una incomparecencia; el motor (en su Worker) empareja las 5 rondas, la
 *      clasificación y la cruzada se VEN, el TRF que baja la página pasa el
 *      comprobador, y el torneo sigue ahí al recargar.
 *   3. Un nombre con HTML adentro se muestra como texto.
 *   4. Deshacer el emparejamiento de la última ronda la saca, y se vuelve a emparejar igual.
 *   5. El comprobador de la página marca un TRF alterado y da por bueno el propio.
 *   6. El generador al azar abre un torneo entero.
 *   7. Un todos contra todos de 5 (con ronda libre): cada uno juega con todos una vez.
 *   8. En inglés, todo [data-t] dice lo del inglés y <html lang> es "en".
 *   9. Nada sale del sitio: ni una petición a otro origen.
 *  10. El manual (pareo-manual.html) se ve en el idioma elegido, explica todos
 *      los desempates en los dos idiomas, y la descarga de la línea de comandos está.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-pagina.js                         */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const raiz = path.join(__dirname, "..");
const T = require(path.join(raiz, "js/pareo/torneo.js"));
const X = require(path.join(raiz, "js/pareo/textos.js"));
const M = require(path.join(raiz, "js/pareo/motor.js")).enNode();

let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m + (detalle ? " — " + detalle : "")));

(async () => {
  console.log("=== 1. Los textos ===");
  {
    const js = fs.readFileSync(path.join(raiz, "js/pareo/pagina.js"), "utf8");
    const html = fs.readFileSync(path.join(raiz, "pareo.html"), "utf8");
    const usadas = new Set([
      ...[...js.matchAll(/\btx\("([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
      ...[...js.matchAll(/\? "([A-Za-z]+)" : "([A-Za-z]+)"/g)].flatMap((m) => [m[1], m[2]]),
      ...[...js.matchAll(/\["[^"]*", "([A-Za-z0-9]+)"\]/g)].map((m) => m[1]),
      ...[...html.matchAll(/data-t(?:-aria)?="([^"]+)"/g)].map((m) => m[1]),
      ...["1-0", "=", "0-1", "+-", "-+", "--"].map((r) => "corto_" + r),
    ].filter((k) => !["es", "en", "true", "false", "corto_"].includes(k)));
    const faltan = [...usadas].filter((k) => !X.TEXTOS[k]);
    const cojas = Object.entries(X.TEXTOS).filter(([, v]) => !(Array.isArray(v) && v.length === 2 && v[0] && v[1])).map(([k]) => k);
    ok(!faltan.length, `las ${usadas.size} claves que usa la página están en textos.js`, faltan.join(", "));
    ok(!cojas.length, "todas tienen su español y su inglés", cojas.join(", "));
  }

  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [];
  const afuera = [];
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  p.on("request", (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) afuera.push(r.url()); });
  const visible = (sel) => p.$eval(sel, (n) => n.checkVisibility()).catch(() => false);
  const ficha = (f) => p.click("#pi-f-" + f);
  const leerTorneo = () => p.evaluate(() => {
    const id = localStorage.getItem("pareo_abierto_v1");
    return JSON.parse(localStorage.getItem("pareo_torneo_v1_" + id));
  });
  async function emparejar(r) {
    await p.click(`#pi-ronda button:has-text("${r}")`.replace(`"${r}"`, `"Emparejar la ronda ${r}"`));
    await p.waitForFunction((r) => {
      const h = document.querySelector("#pi-ronda h2");
      return h && h.textContent.startsWith("Emparejamientos de la ronda " + r);
    }, r, { timeout: 20000 });
  }
  async function resultados(lista) {
    const sels = await p.$$("#pi-ronda table select");
    for (let i = 0; i < sels.length; i++) await sels[i].selectOption(lista[i % lista.length]);
  }

  console.log("=== 2. Un suizo de 9 de punta a punta ===");
  await p.goto(BASE + "/pareo.html");
  await ficha("jugadores");
  ok(await visible("#pi-p-jugadores") && !(await visible("#pi-p-torneo")), "la ficha elegida se ve y las otras no");
  await p.click("#pi-p-jugadores summary");
  await p.fill("#pi-pegar", ["Rojas, Ana;2100;FM;CRC;12345", "Mena, Bruno;2050", "Soto, Carla;1980;WFM", "Paz, Diego;1900", "Vargas, Elena;1850",
    "Mora, Fabián;1800", "Solís, Gabriela;1750", "Brenes, Héctor;1700", "<img src=x onerror=window.__xss=1>;1600"].join("\n"));
  await p.click("#pi-pegar-agregar");
  ok((await p.$$("#pi-tabla-jugadores tbody tr")).length === 9, "la lista pegada inscribe a los 9");
  await ficha("torneo");
  await p.fill('#pi-form-torneo input[name="nombre"]', "Abierto de prueba");
  await p.dispatchEvent('#pi-form-torneo input[name="nombre"]', "change");
  await p.fill('#pi-form-torneo input[name="rondasTotales"]', "5");
  await p.dispatchEvent('#pi-form-torneo input[name="rondasTotales"]', "change");
  await ficha("rondas");
  await emparejar(1);
  ok((await p.$$("#pi-ronda table tbody tr")).length === 5, "ronda 1: 4 mesas y el bye del pareo");
  await resultados(["1-0", "=", "0-1", "+-"]);
  await p.click('#pi-rondas-nav button:has-text("Ronda 2")');
  // Ronda 2: Bruno pide bye de medio punto.
  await p.selectOption('#pi-ronda select[aria-label^="Mena, Bruno"]', "H");
  await emparejar(2);
  {
    const t = await leerTorneo();
    const bruno = t.jugadores.find((j) => j.nombre === "Mena, Bruno").id;
    ok(t.rondas[1].ausencias[bruno] === "H" && !t.rondas[1].mesas.some((m) => m.b === bruno || m.n === bruno), "el bye pedido queda fuera del emparejamiento y anotado");
  }
  await resultados(["0-1", "1-0", "="]);
  // Antes de la ronda 3, Héctor se retira.
  await ficha("jugadores");
  await p.click('#pi-tabla-jugadores button[aria-label="Retirar a Brenes, Héctor"]');
  await p.click('dialog.avisos-dialogo[open] button:has-text("Retirar")');
  await ficha("rondas");
  await p.click('#pi-rondas-nav button:has-text("Ronda 3")');
  // Diego avisa que no viene a la ronda 3, con el atajo de un clic (en vez de abrir el select).
  const selDiego = '#pi-ronda select[aria-label^="Paz, Diego"]';
  const botonDiego = '#pi-ronda button[aria-label="Marcar que Paz, Diego no viene a esta ronda"]';
  await p.click(botonDiego);
  ok((await p.$eval(selDiego, (s) => s.value)) === "Z", "el botón «No viene» marca Z en el select, sin abrirlo");
  await p.click('#pi-ronda button[aria-label="Deshacer que Paz, Diego no viene a esta ronda"]');
  ok((await p.$eval(selDiego, (s) => s.value)) === "", "y se puede deshacer antes de emparejar");
  await p.click(botonDiego);
  await emparejar(3);
  {
    const t = await leerTorneo();
    const diego = t.jugadores.find((j) => j.nombre === "Paz, Diego").id;
    ok(t.rondas[2].ausencias[diego] === "Z" && !t.rondas[2].mesas.some((m) => m.b === diego || m.n === diego), "el botón deja a Diego fuera del emparejamiento, igual que elegirlo a mano");
  }
  await resultados(["=", "1-0", "0-1", "1-0"]);
  for (let r = 4; r <= 5; r++) {
    await p.click(`#pi-rondas-nav button:has-text("Ronda ${r}")`);
    await emparejar(r);
    await resultados(["=", "1-0", "0-1", "1-0"]);
  }
  {
    const t = await leerTorneo();
    const hector = t.jugadores.find((j) => j.nombre === "Brenes, Héctor").id;
    ok(t.rondas.slice(2).every((R) => !R.mesas.some((m) => m.b === hector || m.n === hector)), "el retirado no vuelve a aparecer en una mesa");
    ok(t.rondas.length === 5 && t.rondas.every((R) => R.mesas.every((m) => m.n === null || m.r)), "las 5 rondas emparejadas y con todos sus resultados");
    const trf = T.aTrf(T.nuevo(t));
    const c = await M.comprobar(trf);
    ok(c.correcto, "el torneo armado en la página pasa el comprobador", c.diferencias.slice(0, 3).join(" | "));
  }
  await ficha("clasificacion");
  ok(await visible("#pi-tabla-clas"), "la clasificación se ve");
  {
    const cab = await p.$$eval("#pi-tabla-clas thead th", (t) => t.map((x) => x.textContent.trim()));
    ok(["BH-C1", "BH", "SB"].every((c) => cab.includes(c)), "con las columnas de los desempates elegidos", cab.join(" "));
    ok((await p.$$("#pi-tabla-clas tbody tr")).length === 9, "y una fila por jugador");
    ok((await p.textContent("#pi-clas-titulo")).includes("ronda 5"), "tras la ronda 5");
  }
  await ficha("cruzada");
  ok(await visible("#pi-tabla-cruzada") && (await p.$$("#pi-tabla-cruzada thead th")).length === 4 + 5 + 1, "la tabla cruzada se ve, con una columna por ronda");

  console.log("=== 3. Un nombre con HTML adentro ===");
  ok(!(await p.evaluate(() => window.__xss)) && (await p.$$eval("#pi-tabla-cruzada td", (t) => t.some((x) => x.textContent.includes("<img")))), "se muestra como texto y no corre");

  await ficha("archivos");
  {
    const [d] = await Promise.all([p.waitForEvent("download"), p.click("#pi-bajar-trf")]);
    const trf = fs.readFileSync(await d.path(), "utf8");
    ok(/^012 Abierto de prueba/m.test(trf) && (trf.match(/^001/gm) || []).length === 9, "el TRF que baja la página trae el torneo y sus 9 jugadores");
    const c = await M.comprobar(trf);
    ok(c.correcto, "y pasa el comprobador fuera del navegador");
  }
  await p.reload();
  {
    const t = await leerTorneo();
    ok(t && t.nombre === "Abierto de prueba" && t.rondas.length === 5, "al recargar, el torneo sigue ahí");
  }

  console.log("=== 4. Deshacer la última ronda ===");
  {
    const antes = await leerTorneo();
    await ficha("rondas");
    await p.click('#pi-rondas-nav button:has-text("Ronda 5")');
    await p.click('#pi-ronda button:has-text("Deshacer el emparejamiento")');
    await p.click('dialog.avisos-dialogo[open] button:has-text("Deshacer el emparejamiento")');
    await p.waitForFunction(() => /Emparejar la ronda 5/.test(document.querySelector("#pi-ronda").textContent));
    ok((await leerTorneo()).rondas.length === 4, "la ronda 5 se va");
    await emparejar(5);
    const despues = await leerTorneo();
    const mesas = (R) => R.mesas.map((m) => m.b + "-" + m.n).join(" ");
    ok(mesas(despues.rondas[4]) === mesas(antes.rondas[4]), "y al volver a emparejarla sale la misma (el Holandés es uno solo)");
    await resultados(["=", "1-0", "0-1", "1-0"]);
  }

  console.log("=== 5. El comprobador ===");
  await ficha("archivos");
  await p.click("#pi-fpc-este");
  await p.waitForFunction(() => /Correcto|no coinciden|No se pudo/.test(document.querySelector("#pi-fpc-resultado").textContent), null, { timeout: 20000 });
  ok(/Correcto: las 5 rondas/.test(await p.textContent("#pi-fpc-resultado")), "el torneo propio: «Correcto»");
  {
    // Los colores de la mesa 1 de la ronda 1, al revés en las dos líneas.
    const lineas = (await p.inputValue("#pi-fpc-texto")).split(/\r?\n/);
    const i = lineas.findIndex((l) => l.startsWith("001") && /^\s*\d+$/.test(l.slice(91, 95)) && l.slice(91, 95).trim() !== "0000");
    const rival = Number(lineas[i].slice(91, 95));
    const j = lineas.findIndex((l) => l.startsWith("001") && Number(l.slice(4, 8)) === rival);
    const voltear = (l) => l.slice(0, 96) + (l[96] === "w" ? "b" : "w") + l.slice(97);
    lineas[i] = voltear(lineas[i]); lineas[j] = voltear(lineas[j]);
    await p.fill("#pi-fpc-texto", lineas.join("\r\n"));
    await p.click("#pi-fpc");
    await p.waitForFunction(() => /no coinciden|No se pudo/.test(document.querySelector("#pi-fpc-resultado").textContent), null, { timeout: 20000 });
    ok(/no coinciden/.test(await p.textContent("#pi-fpc-resultado")), "un TRF con una mesa alterada: lo marca");
  }

  console.log("=== 6. El generador al azar ===");
  await p.fill("#pi-rtg-semilla", "777");
  await p.click("#pi-rtg-abrir");
  await p.waitForFunction(() => /semilla 777/.test(document.querySelector("#pi-lista").selectedOptions[0].textContent), null, { timeout: 30000 });
  ok(await visible("#pi-tabla-clas") && (await p.$$("#pi-tabla-clas tbody tr")).length > 4, "abre un torneo entero y muestra su clasificación");
  {
    const t = await leerTorneo();
    const c = await M.comprobar(T.aTrf(T.nuevo(t)));
    ok(t.rondas.length > 0 && c.correcto, "que pasa el comprobador después de leído y vuelto a escribir");
  }

  console.log("=== 7. Un todos contra todos de 5 ===");
  await p.click("#pi-nuevo");
  await p.fill('#pi-form-torneo input[name="nombre"]', "Cuadrangular");
  await p.dispatchEvent('#pi-form-torneo input[name="nombre"]', "change");
  await p.check('#pi-form-torneo input[value="todos"]');
  await ficha("jugadores");
  for (const [n, e] of [["Uno", 2000], ["Dos", 1900], ["Tres", 1800], ["Cuatro", 1700], ["Cinco", 1600]]) {
    await p.fill('#pi-form-jugador input[name="nombre"]', n);
    await p.fill('#pi-form-jugador input[name="elo"]', String(e));
    await p.click('#pi-form-jugador button[type="submit"]');
  }
  await ficha("rondas");
  for (let r = 1; r <= 5; r++) {
    if (r > 1) await p.click(`#pi-rondas-nav button:has-text("Ronda ${r}")`);
    await emparejar(r);
    await resultados(["1-0", "0-1"]);
  }
  {
    const t = await leerTorneo();
    const pares = new Set();
    let repetidos = 0, libres = 0;
    for (const R of t.rondas) {
      libres += Object.keys(R.ausencias).length;
      for (const m of R.mesas) { const k = [m.b, m.n].sort().join(); if (pares.has(k)) repetidos++; pares.add(k); }
    }
    ok(t.rondas.length === 5 && pares.size === 10 && !repetidos && libres === 5, "5 rondas, 10 partidas distintas y una ronda libre para cada uno");
    ok(!(await p.$('#pi-rondas-nav button:has-text("Ronda 6")')), "y no ofrece una ronda 6");
  }

  console.log("=== 8. En inglés ===");
  await p.click("#pi-idioma");
  {
    const raros = await p.$$eval("[data-t]", (ns) => ns.map((n) => [n.dataset.t, n.textContent]));
    const malos = raros.filter(([k, v]) => X.TEXTOS[k] && v !== X.TEXTOS[k][1]).map(([k]) => k);
    ok(!malos.length && (await p.getAttribute("html", "lang")) === "en", "cada [data-t] dice su inglés y <html lang=\"en\">", malos.join(", "));
    ok((await p.textContent("#pi-f-clasificacion")) === "Standings" && (await p.title()).includes("pairings"), "las fichas y el título también");
    await p.reload();
    ok((await p.getAttribute("html", "lang")) === "en", "y el idioma elegido se recuerda al recargar");
    await p.click("#pi-idioma");
  }

  console.log("=== 10. El manual y la línea de comandos ===");
  {
    const D = require(path.join(raiz, "js/pareo/desempates.js"));
    await p.evaluate(() => { try { localStorage.setItem("pareo_idioma_v1", "es"); } catch (e) { /* nada */ } });
    await p.goto(BASE + "/pareo-manual.html");
    ok(await visible("#pm-es") && !(await visible("#pm-en")) && (await p.getAttribute("html", "lang")) === "es", "el manual abre en español y el inglés no se ve");
    await p.click("#pm-idioma");
    ok(await visible("#pm-en") && !(await visible("#pm-es")) && (await p.getAttribute("html", "lang")) === "en", "con «English» se ve el inglés y <html lang=\"en\">");
    await p.goto(BASE + "/pareo-manual.html?lang=en");
    ok(await visible("#pm-en"), "?lang=en lo abre en inglés (el enlace para FIDE)");
    for (const id of ["pm-es", "pm-en"]) {
      // Los códigos de la lista de desempates, uno por uno (textContent pegaría
      // cada <dt> con su <dd>: «DEEncuentro»).
      const codigos = (await p.$$eval(`#${id} .pm-desempates dt`, (ds) => ds.map((d) => d.textContent))).join(",").split(",").map((c) => c.trim());
      const faltan = D.CATALOGO.map((x) => x.codigo).filter((c) => !codigos.includes(c));
      ok(!faltan.length, `el manual (${id === "pm-es" ? "español" : "inglés"}) explica los ${D.CATALOGO.length} desempates`, faltan.join(", "));
      const rotos = await p.$$eval(`#${id} a[href^="#"]`, (as) => as.map((a) => a.getAttribute("href")).filter((h) => !document.querySelector(h)));
      ok(!rotos.length, `y su índice lleva a secciones que existen (${id})`, rotos.join(" "));
    }
    const zip = await p.request.get(BASE + "/descargas/pareo-integral-cli.zip");
    ok(zip.ok() && (await zip.body()).slice(0, 2).toString() === "PK", "la descarga de la línea de comandos es un zip que está");
    await p.goto(BASE + "/pareo.html");
    ok((await p.$$('a[href="pareo-manual.html"]')).length >= 2 && (await p.$('a[href="descargas/pareo-integral-cli.zip"]')) !== null, "pareo.html enlaza al manual y a la descarga");
  }

  console.log("=== 11. Reportes: la plantilla para la pared y el PDF ===");
  {
    // La sección 10 deja el idioma en inglés (el ?lang=en del manual, que
    // comparte la misma llave de localStorage): se vuelve a español acá.
    await p.evaluate(() => { try { localStorage.setItem("pareo_idioma_v1", "es"); } catch (e) { /* nada */ } });
    await p.goto(BASE + "/pareo.html");
    await p.evaluate(() => { window.print = () => {}; });
    await p.click("#pi-nuevo");
    await p.fill('#pi-form-torneo input[name="nombre"]', "Reportes de prueba");
    await p.dispatchEvent('#pi-form-torneo input[name="nombre"]', "change");
    await ficha("jugadores");
    for (const [n, inst] of [["Alfa, Uno", "Liceo Reportes"], ["Beta, Dos", "Liceo Reportes"], ["Gama, Tres", ""], ["Delta, Cuatro", ""]]) {
      await p.fill('#pi-form-jugador input[name="nombre"]', n);
      await p.fill('#pi-form-jugador input[name="institucion"]', inst);
      await p.click('#pi-form-jugador button[type="submit"]');
    }
    await ficha("rondas");
    await emparejar(1);
    await resultados(["1-0", "0-1"]);

    console.log("--- La plantilla para la pared ---");
    ok(!(await visible("#pi-plantilla")), "normalmente no se ve en pantalla");
    await p.click('#pi-ronda button:has-text("Plantilla para la pared")');
    const plantilla = await p.textContent("#pi-plantilla");
    ok(plantilla.includes("Ronda 1") && plantilla.includes("Reportes de prueba"), "trae el título de la ronda y el torneo", plantilla);
    ok(!/1-0|0-1/.test(plantilla), "no trae ningún resultado: es para escribirlo a mano", plantilla);
    ok(await p.evaluate(() => document.body.classList.contains("pi-imprimiendo-plantilla")), "marca el body mientras imprime");
    await p.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    ok(!(await p.evaluate(() => document.body.classList.contains("pi-imprimiendo-plantilla"))), "y la saca al terminar");
    ok((await p.textContent("#pi-plantilla")) === "", "limpia el contenido también");

    console.log("--- El PDF de la Clasificación ---");
    await ficha("clasificacion");
    const [descargaClas] = await Promise.all([p.waitForEvent("download"), p.click("#pi-clas-pdf")]);
    const pdfClas = fs.readFileSync(await descargaClas.path()).toString("latin1");
    ok(pdfClas.slice(0, 5) === "%PDF-", "es un PDF de verdad");
    ok(pdfClas.includes("Alfa, Uno") && pdfClas.includes("Liceo Reportes"), "trae los nombres y la institución");
    ok(pdfClas.includes("Pareo Integral"), "con su pie de página");

    console.log("--- El PDF de la Tabla cruzada ---");
    await ficha("cruzada");
    const [descargaCruz] = await Promise.all([p.waitForEvent("download"), p.click("#pi-cruzada-pdf")]);
    const pdfCruz = fs.readFileSync(await descargaCruz.path()).toString("latin1");
    ok(pdfCruz.slice(0, 5) === "%PDF-", "también es un PDF de verdad");
    ok(pdfCruz.includes("Alfa, Uno"), "trae los nombres");

    console.log("--- El filtro de institución, también en el PDF ---");
    await ficha("clasificacion");
    await p.selectOption("#pi-clas-institucion", "Liceo Reportes");
    const [descargaFiltro] = await Promise.all([p.waitForEvent("download"), p.click("#pi-clas-pdf")]);
    const pdfFiltro = fs.readFileSync(await descargaFiltro.path()).toString("latin1");
    ok(pdfFiltro.includes("Alfa, Uno") && !pdfFiltro.includes("Gama, Tres"), "baja solo la institución elegida");
  }

  console.log("=== 9. Nada sale del sitio ===");
  ok(!afuera.length, "ninguna petición a otro origen", afuera.slice(0, 3).join(" "));
  ok(!errores.length, "sin errores en la consola", errores.slice(0, 3).join(" | "));

  await browser.close();
  console.log(fallos ? `\n${fallos} comprobaciones fallaron` : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
