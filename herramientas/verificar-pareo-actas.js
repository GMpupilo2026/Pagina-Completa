/* Pareo Integral: el acta firmada, la sala y lo que ven las familias
 * (js/pareo/pagina.js, js/pareo/evento.js, js/pareo/ver.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - la revisión del pareo (mismo centro, tres colores seguidos, más de un
 *     punto de diferencia) y la mesa fija;
 *   - el artículo de las Leyes del Ajedrez en cada incidencia y en el informe;
 *   - la inscripción el mismo día (la categoría revisada y el acta);
 *   - la nota de un árbitro adjunto, que llega al informe con su nombre;
 *   - las firmas del acta: en la pantalla y desde un celular (con un doble de
 *     Supabase Realtime), como imagen en el PDF;
 *   - los certificados de los árbitros y el cartel para la entrada;
 *   - el reloj de la ronda en el proyector y «Mi centro» en el celular.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-actas.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const X = require(path.join(RAIZ, "js/pareo/textos.js"));
const TablaExcel = require(path.join(RAIZ, "js/tabla-excel.js"));
const { contestarEtapa } = require("./lib/pareo-etapa");
const P = require("./lib/pareo-pruebas");
const { XLSX, leerTodos } = P;

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const xlsx = (filas) => Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas }]));
const dialogo = 'dialog[data-avisos="formulario"][open]';
const confirmar = 'dialog[data-avisos="confirmar"][open]';
// Un JPEG de 1×1 (blanco), para las firmas que llegan del celular.
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

/* ==================================================================
   1. Sin navegador
   ================================================================== */
function pruebaSinNavegador() {
  console.log("\n=== La revisión del pareo ===");
  const jug = (i, inst) => ({ id: "j" + i, nombre: "J" + i, institucion: inst });
  const t = T.nuevo({ sistema: "suizo", rondasTotales: 5, jugadores: [jug(0, "Liceo A"), jug(1, "LICEO A"), jug(2, "Liceo B"), jug(3, "Liceo C")] });
  t.rondas.push({ mesas: [{ b: "j0", n: "j1", r: null }, { b: "j2", n: "j3", r: null }] });
  igual("dos del mismo centro en una mesa (sin mirar mayúsculas)", V.revisarPareo(t, 0).map((x) => [x.tipo, x.mesa]), [["centro", 0]]);
  t.rondas[0] = { mesas: [{ b: "j0", n: "j2", r: "1-0" }, { b: "j3", n: "j1", r: "1-0" }] };
  t.rondas.push({ mesas: [{ b: "j0", n: "j3", r: "1-0" }, { b: "j1", n: "j2", r: "1-0" }] });
  t.rondas.push({ mesas: [{ b: "j0", n: "j2", r: null }, { b: "j1", n: "j3", r: null }] });
  const avisos = V.revisarPareo(t, 2);
  ok(avisos.some((x) => x.tipo === "colores" && x.nombre === "J0" && x.color === "w"), "el mismo color tres rondas seguidas", JSON.stringify(avisos));
  ok(avisos.some((x) => x.tipo === "puntos" && x.mesa === 0), "y más de un punto de diferencia en un suizo (2 contra 0)", JSON.stringify(avisos));
  ok(!V.revisarPareo(Object.assign({}, t, { sistema: "todos" }), 2).some((x) => x.tipo === "puntos"), "en todos contra todos los puntos no se miran");

  console.log("\n=== La mesa fija ===");
  const t2 = T.nuevo({ sistema: "suizo", rondasTotales: 3, jugadores: [0, 1, 2, 3, 4, 5].map((i) => jug(i, "")) });
  t2.jugadores[4].mesaFija = 1;
  const R = { mesas: [{ b: "j0", n: "j1" }, { b: "j2", n: "j3" }, { b: "j4", n: "j5" }] };
  igual("su mesa pasa al número fijo, sin cambiar quién juega con quién", [V.aplicarMesasFijas(t2, R), R.mesas.map((m) => m.b + m.n)], [[{ nombre: "J4", mesa: 1 }], ["j4j5", "j2j3", "j0j1"]]);
  t2.jugadores[2].mesaFija = 1;
  const R2 = { mesas: [{ b: "j4", n: "j5" }, { b: "j2", n: "j3" }] };
  igual("si la mesa ya es fija de otro, no se le quita", [V.aplicarMesasFijas(t2, R2), R2.mesas[0].b], [[], "j4"]);

  console.log("\n=== El artículo en el informe ===");
  const t3 = T.nuevo({ sistema: "todos", jugadores: [jug(0, ""), jug(1, "")] });
  t3.rondas.push({ mesas: [{ b: "j0", n: "j1", r: "=" }], incidencias: [{ tipo: "reclamo", articulo: "repeticion", mesa: 1, texto: "Reclama tablas." }, { tipo: "adjunto", autor: "Ana Mora", texto: "Todo en orden." }] });
  const inc = V.incidenciasDe(t3);
  ok(/Reclamo \(art\. 9\.2, triple repetición\): Reclama tablas\./.test(inc[0]), "lleva el artículo de las Leyes del Ajedrez", inc[0]);
  ok(/Nota de un árbitro adjunto Lo anota Ana Mora\.: Todo en orden\./.test(inc[1]), "y la nota del adjunto, con su nombre", inc[1]);

  console.log("\n=== Las firmas del acta ===");
  const ev = { nombre: "JDE", jde: { anio: 2026, etapa: "regional", lugar: "Alajuela" }, firmas: [{ cargo: "principal", nombre: "Ana Mora", jpeg: JPEG, ancho: 1, alto: 1, hora: Date.now() }] };
  const acta = V.acta(ev, [t3]);
  igual("la firma va como foto en el PDF", acta.fotos.length, 1);
  const bloques = acta.bloques.slice(acta.bloques.findIndex((b) => b.texto === "Firmas"));
  ok(bloques.some((b) => b.tipo === "foto" && /Árbitro principal: Ana Mora · firmó a las/.test(b.pie)), "con el cargo, el nombre y la hora");
  ok(bloques.some((b) => b.tipo === "parrafo" && /Representante del Comité Organizador/.test(b.texto)), "y los que no firmaron, con su línea");

  console.log("\n=== Certificados y «Mi centro» ===");
  const c = V.certificadosArbitro({ nombre: "JDE" }, [Object.assign({}, t3, { arbitro: "Ana Mora", arbitroAdjunto: "Luis; ANA MORA" }), Object.assign({}, t3, { arbitro: "Luis", grupo: "Abierto" })]);
  igual("uno por persona, con todos sus cargos", c.map((x) => [x.nombre, x.cargos.length]), [["Ana Mora", 2], ["Luis", 2]]);
  ok(/fue árbitro principal de .*; y fue árbitro adjunto de/.test(V.textoCertificadoArbitro(c[0]).motivo), "y el texto los dice", V.textoCertificadoArbitro(c[0]).motivo);
  const vista = { torneos: [{ nombre: "A", clasificacion: [{ p: 1, n: "X", pts: 2, i: "Liceo Uno" }, { p: 2, n: "Y", pts: 1, i: "LICEO UNO" }, { p: 3, n: "Z", pts: 0, i: "Otro" }] }, { nombre: "B", clasificacion: [{ p: 1, n: "W", pts: 1, i: "Otro" }] }] };
  igual("los centros del evento, una vez cada uno", V.centrosDeVista(vista), ["Liceo Uno", "Otro"]);
  igual("y los de un centro en todos los torneos", V.delCentro(vista, "liceo uno").map((x) => [x.torneo, x.filas.map((f) => f.n)]), [["A", ["X", "Y"]]]);
}

/* ==================================================================
   2. En la página
   ================================================================== */
async function firmarEnLienzo(page, sel) {
  const caja = await page.$eval(sel, (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.mouse.move(caja.x + 20, caja.y + caja.h / 2);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(caja.x + 20 + k * 25, caja.y + caja.h / 2 + (k % 2 ? 20 : -20));
  await page.mouse.up();
}

async function pruebaTorneo(browser) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);

  console.log("\n=== La mesa fija y la revisión del pareo, en la página ===");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", ["PRUEBA UNO;LICEO X", "PRUEBA DOS;LICEO X", "PRUEBA TRES;LICEO X", "PRUEBA CUATRO;LICEO X"].join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click(`button[aria-label="${X.t("es", "editarA", { n: "PRUEBA CUATRO" })}"]`);
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="mesaFija"]', "2");
  await page.click(dialogo + " [data-avisos-aceptar]");
  let todos = await P.esperarGuardado(page, (l) => l[0].jugadores.some((j) => j.mesaFija === 2));
  ok(/mesa fija: 2/.test(await page.textContent("#pi-p-jugadores")), "la lista dice quién tiene mesa fija");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  todos = await leerTodos(page);
  const cuatro = todos[0].jugadores.find((j) => j.nombre === "PRUEBA CUATRO").id;
  ok([todos[0].rondas[0].mesas[1].b, todos[0].rondas[0].mesas[1].n].includes(cuatro), "al emparejar, su partida queda en la mesa 2", JSON.stringify(todos[0].rondas[0].mesas));
  await page.waitForSelector("#pi-revision-pareo");
  ok(/Mesa 1: .* son del mismo centro educativo \(LICEO X\)/.test(await page.textContent("#pi-revision-pareo")), "la revisión del pareo avisa de los del mismo centro", await page.textContent("#pi-revision-pareo"));
  await page.click("#pi-pareo-visto");
  todos = await P.esperarGuardado(page, (l) => l[0].rondas[0].pareoVisto === true);
  ok(!(await page.$("#pi-revision-pareo")), "«Visto» la quita");

  console.log("\n=== El artículo de una incidencia ===");
  await page.selectOption("#pi-inc-tipo", "reclamo");
  await page.selectOption("#pi-inc-articulo", "celular");
  await page.fill("#pi-inc-texto", "Le sonó el celular.");
  await page.click("#pi-inc-anotar");
  todos = await P.esperarGuardado(page, (l) => (l[0].rondas[0].incidencias || []).length === 1);
  igual("queda con su artículo", todos[0].rondas[0].incidencias[0].articulo, "celular");
  ok(/Reclamo \(art\. 11\.3\.2, aparato electrónico en la sala\)/.test(await page.textContent("#pi-inc-lista")), "y la lista lo dice");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaEvento(browser) {
  let { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  console.log("\n=== Un evento: la inscripción del mismo día ===");
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "FDN"]];
  for (let i = 1; i <= 4; i++) filas.push(["PRUEBA MUJER " + i, "MUJER", "LICEO " + Math.ceil(i / 2), "Alajuela", "C", "Individual", "Mujeres", "2013-01-0" + i]);
  filas.push(["PRUEBA HOMBRE 1", "HOMBRE", "LICEO 1", "Alajuela", "C", "Individual", "Abierto", "2013-02-01"]);
  filas.push(["PRUEBA HOMBRE 2", "HOMBRE", "LICEO 2", "Alajuela", "C", "Individual", "Abierto", "2013-02-02"]);
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", { name: "r.xlsx", mimeType: XLSX, buffer: xlsx(filas) });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "regional", "Alajuela");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  let todos = await leerTodos(page);
  const mujeres = todos.find((x) => /Mujeres/.test(x.nombre));
  await page.selectOption("#pi-lista", mujeres.idLista);
  await page.click('[data-ficha="torneo"]');
  await page.fill('#pi-form-torneo [name="arbitro"]', "PRUEBA ÁRBITRA");
  await page.fill('#pi-form-torneo [name="arbitroAdjunto"]', "PRUEBA ADJUNTO");
  await page.press('#pi-form-torneo [name="arbitroAdjunto"]', "Tab");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  await page.click('[data-ficha="jugadores"]');
  await page.fill('#pi-form-jugador [name="nombre"]', "PRUEBA TARDE");
  await page.fill('#pi-form-jugador [name="institucion"]', "LICEO 3");
  await page.fill('#pi-form-jugador [name="categoria"]', "C");
  await page.fill('#pi-form-jugador [name="nacimiento"]', "2005-03-03");
  await page.press('#pi-form-jugador [name="nombre"]', "Enter");
  todos = await P.esperarGuardado(page, (l, id) => (l.find((x) => x.idLista === id).tardios || []).length === 1, mujeres.idLista);
  const tarde = todos.find((x) => x.idLista === mujeres.idLista).tardios[0];
  igual("quien entra con una ronda jugada queda anotado para el acta", [tarde.nombre, tarde.ronda], ["PRUEBA TARDE", 2]);
  ok(/No está en la categoría/.test(tarde.aviso), "con el aviso de su categoría");
  ok(await page.evaluate(() => [...document.querySelectorAll(".avisos-mensaje")].some((n) => /nació en 2005/.test(n.textContent))), "y se avisa en la pantalla");

  console.log("\n=== La nota de un adjunto ===");
  await page.click('[data-ficha="rondas"]');
  await P.anotar(page, "1-0");
  await page.click("#pi-adjunto");
  await page.waitForSelector(dialogo);
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForSelector(".pi-adjunto-url");
  const codigoAdj = (await page.textContent(".pi-adjunto-url")).split("#adjunto=")[1].split("&")[0];
  const canalAdj = "pareo-adjunto-" + codigoAdj;
  await page.evaluate((c) => window.__llega(c, "nota", { texto: "Sin nombre." }), canalAdj);
  await page.evaluate((c) => window.__llega(c, "nota", { autor: "PRUEBA ADJUNTO", texto: "Un reclamo de tablas en la mesa 1.", mesa: 1 }), canalAdj);
  todos = await P.esperarGuardado(page, (l, id) => (l.find((x) => x.idLista === id).rondas[0].incidencias || []).length === 1, mujeres.idLista);
  const nota = todos.find((x) => x.idLista === mujeres.idLista).rondas[0].incidencias[0];
  igual("llega a las incidencias, con su nombre y su mesa (la sin nombre, no)", [nota.tipo, nota.autor, nota.mesa], ["adjunto", "PRUEBA ADJUNTO", 1]);
  ok(await page.evaluate((c) => window.__enviados.some((x) => x.canal === c && x.evento === "notaRecibida"), canalAdj), "y el celular se entera");

  // La ronda 2 en juego, con el reloj.
  await page.click("#pi-rondas-nav button:last-child");
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-reloj-empezar");
  await page.click("#pi-reloj-empezar");
  await P.esperarGuardado(page, (l, id) => !!l.find((x) => x.idLista === id).rondas[1].inicio, mujeres.idLista);

  console.log("\n=== Las firmas del acta ===");
  await page.click('[data-ficha="archivos"]');
  await page.click("#pi-firmar-aqui");
  await page.waitForSelector("#pi-firma-dialogo[open]");
  await page.click("#pi-firma-guardar");
  ok(/Escribe el nombre/.test(await page.textContent("#pi-firma-dialogo")), "sin nombre, no guarda");
  await page.fill("#pi-firma-nombre", "PRUEBA ÁRBITRA");
  await page.click("#pi-firma-guardar");
  ok(/Falta la firma/.test(await page.textContent("#pi-firma-dialogo")), "ni sin firma");
  await firmarEnLienzo(page, "#pi-firma-dialogo canvas");
  await page.click("#pi-firma-guardar");
  todos = await P.esperarGuardado(page, (l) => l.filter((x) => x.evento && (x.evento.firmas || []).length === 1).length === 2);
  ok(/^[A-Za-z0-9+/=]+$/.test(todos[0].evento.firmas[0].jpeg) && todos[0].evento.firmas[0].cargo === "principal", "la firma queda en los dos torneos del evento, en JPEG");
  await page.click("#pi-firmar-celular");
  await page.waitForSelector("#pi-firma-url");
  const codigoFirma = (await page.textContent("#pi-firma-url")).split("#firma=")[1];
  const canalFirma = "pareo-firma-" + codigoFirma;
  await page.evaluate((c) => window.__llega(c, "firma", { cargo: "rey", nombre: "X", jpeg: "abc", ancho: 1, alto: 1 }), canalFirma);
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "negada"), canalFirma);
  ok(!(await page.$(confirmar)), "una firma que no vale se rechaza sin preguntar");
  await page.evaluate(([c, j]) => window.__llega(c, "firma", { cargo: "comite", nombre: "PRUEBA COMITÉ", jpeg: j, ancho: 1, alto: 1 }), [canalFirma, JPEG]);
  await page.waitForSelector(confirmar);
  ok(/Llegó la firma de PRUEBA COMITÉ como Representante del Comité Organizador/.test(await page.textContent(confirmar)), "la del celular se pregunta antes de ir al acta");
  await page.click(confirmar + " [data-avisos-aceptar]");
  todos = await P.esperarGuardado(page, (l) => l.filter((x) => x.evento && (x.evento.firmas || []).length === 2).length === 2);
  ok(await page.evaluate((c) => window.__enviados.some((x) => x.canal === c && x.evento === "recibida"), canalFirma), "y al celular le llega que quedó");
  const [dlActa] = await Promise.all([page.waitForEvent("download"), page.click("#pi-evento-acta")]);
  const pdf = fs.readFileSync(await dlActa.path()).toString("latin1");
  ok((pdf.match(/\/DCTDecode/g) || []).length >= 2 && pdf.includes("PRUEBA") && /Inscripciones el d.a del torneo/.test(pdf), "el acta lleva las dos firmas como imagen y la inscripción del mismo día");

  console.log("\n=== Los certificados de los árbitros y el cartel ===");
  await page.click("#pi-evento-certificados");
  const cert = await page.$$eval("#pi-firmas .pi-diploma", (l) => l.map((d) => d.textContent));
  ok(cert.length === 2 && cert.every((x) => /Certificado de arbitraje/.test(x)) && cert.some((x) => /PRUEBA ÁRBITRA.*fue árbitro principal de/.test(x)), "uno por árbitro, con su cargo", JSON.stringify(cert).slice(0, 300));
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.click("#pi-evento-cartel");
  await page.waitForSelector(confirmar);
  await page.click(confirmar + " [data-avisos-aceptar]");
  await page.waitForSelector("#pi-firmas .pi-cartel svg", { state: "attached" });
  const cartel = await page.textContent("#pi-firmas .pi-cartel");
  ok(/#evento=[a-z0-9]{8}/.test(cartel) && /Torneos/.test(cartel) && /Mujeres/.test(cartel), "el cartel trae el QR del enlace en vivo y los torneos", cartel.slice(0, 200));
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  const vista = await page.evaluate(() => window.__enviados.filter((x) => x.evento === "estado" && /^pareo-evento-/.test(x.canal)).pop().payload);
  const tm = vista.torneos.find((x) => /Mujeres/.test(x.nombre));
  ok(tm.ronda.inicio > 0 && tm.clasificacion.every((f) => /^LICEO /.test(f.i)), "el enlace del evento lleva cuándo empezó la ronda y el centro de cada uno", JSON.stringify(tm).slice(0, 300));
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== El reloj de la ronda en el proyector ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#evento=prueba555&proyectar", (p) => p.clock.install({ time: new Date(tm.ronda.inicio + 47 * 60000) })));
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  await page.evaluate((v) => window.__llega("pareo-evento-prueba555", "estado", v), Object.assign({}, vista, { torneos: [tm] }));
  await page.waitForSelector("[data-reloj-ronda]");
  const reloj = await page.textContent("[data-reloj-ronda]");
  ok(/Ronda 2 · empezó a las .* · lleva 47 min/.test(reloj) && /Faltan 2 mesas por terminar: 1, 2/.test(reloj), "dice desde cuándo se juega y qué mesas faltan", reloj);
  await ctx.close();

  console.log("\n=== Mi centro en el celular ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#evento=prueba555"));
  const llega = async () => {
    await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
    await page.evaluate((v) => window.__llega("pareo-evento-prueba555", "estado", v), vista);
    await page.waitForSelector("#pi-ver-centro option[value='LICEO 1']", { state: "attached" });
  };
  await llega();
  await page.selectOption("#pi-ver-centro", "LICEO 1");
  const filasCentro = await page.$$eval("#pi-ver-centro-lista li", (l) => l.map((x) => x.textContent));
  ok(filasCentro.length >= 2 && filasCentro.every((x) => /PRUEBA (MUJER [12]|HOMBRE 1)/.test(x)), "solo los de su centro, en todos los torneos", JSON.stringify(filasCentro));
  await page.reload({ waitUntil: "networkidle" });
  await llega();
  igual("y se recuerda", await page.inputValue("#pi-ver-centro"), "LICEO 1");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaCelulares(browser) {
  console.log("\n=== Firmar desde el celular ===");
  let { ctx, page, errores } = await P.abrirPagina(browser, BASE, "#firma=prueba777", (p) => p.setViewportSize({ width: 390, height: 800 }));
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  await page.evaluate(() => window.__llega("pareo-firma-prueba777", "estado", { evento: "JDE de prueba", cargos: { principal: "Árbitro principal", delegado: "Representante de las delegaciones" } }));
  await page.waitForSelector("#pi-firma-mandar");
  await page.selectOption("#pi-firma-cargo", "delegado");
  await page.fill("#pi-firma-nombre", "PRUEBA DELEGADA");
  await firmarEnLienzo(page, "#pi-ver canvas");
  await page.click("#pi-firma-mandar");
  const firma = await page.evaluate(() => window.__enviados.filter((x) => x.evento === "firma").pop());
  ok(firma && firma.payload.cargo === "delegado" && firma.payload.nombre === "PRUEBA DELEGADA" && firma.payload.jpeg.length > 100, "manda el cargo, el nombre y la firma");
  await page.evaluate(() => window.__llega("pareo-firma-prueba777", "recibida", {}));
  ok(/tu firma quedó en el acta/.test(await page.textContent("#pi-firma-estado")), "y dice cuando quedó");
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), "cabe en el celular, sin correrse de lado");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== La nota del adjunto desde el celular ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#adjunto=prueba888&m=1-3"));
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  const estado = { nombre: "Torneo", ronda: 1, mesas: [{ m: 1, b: "PRUEBA A", n: "PRUEBA B", r: null }] };
  await page.evaluate((e) => window.__llega("pareo-adjunto-prueba888", "estado", e), estado);
  await page.waitForSelector("#pi-adj-nota-mandar");
  await page.fill("#pi-adj-nota", "Reclamo de tablas por repetición.");
  await page.click("#pi-adj-nota-mandar");
  ok(/Escribe tu nombre/.test(await page.textContent("#pi-adj-nota-estado")), "sin su nombre no la manda");
  await page.fill("#pi-adj-autor", "PRUEBA ADJUNTO");
  await page.selectOption("#pi-adj-nota-mesa", "1");
  await page.click("#pi-adj-nota-mandar");
  const mandada = await page.evaluate(() => window.__enviados.filter((x) => x.evento === "nota").pop());
  igual("manda la nota con su nombre y su mesa", mandada && mandada.payload, { autor: "PRUEBA ADJUNTO", texto: "Reclamo de tablas por repetición.", mesa: 1, lado: null, tipo: "reclamo", articulo: null });
  // Llega un resultado nuevo: lo escrito no se pierde.
  await page.fill("#pi-adj-nota", "Otra cosa");
  await page.evaluate((e) => window.__llega("pareo-adjunto-prueba888", "estado", e), estado);
  igual("lo que se está escribiendo no se borra cuando llega un resultado", await page.inputValue("#pi-adj-nota"), "Otra cosa");
  await page.evaluate(() => window.__llega("pareo-adjunto-prueba888", "notaRecibida", {}));
  ok(/llegó al árbitro principal/.test(await page.textContent("#pi-adj-nota-estado")), "y dice cuando llegó");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { pruebaSinNavegador(); } catch (e) { mal("la parte sin navegador se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaTorneo(browser); await pruebaEvento(browser); await pruebaCelulares(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
