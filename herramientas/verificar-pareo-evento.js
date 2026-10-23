/* Pareo Integral: el evento de los JDE — el acta del congresillo, el
 * informe oficial de resultados y los clasificados a la etapa siguiente
 * (js/pareo/evento.js y su sección en la ficha Archivos de pareo.html).
 *
 * Lo que se rompe acá no da ningún error: un cupo mal contado (tres
 * clasificados donde van dos), un empate en el corte que se resuelve por el
 * orden de la lista, una decisión del congresillo que no llega al acta, o una
 * lista de clasificados que la etapa siguiente no sabe leer. Dos partes:
 *
 *   1. Sin navegador: los cupos del art. 66.1, los clasificados (con el
 *      empate en el corte avisado), lo que trae el acta (cada decisión y el
 *      orden de tableros), el informe (la participación por centro y quién
 *      clasifica) y las filas de la lista de clasificados.
 *   2. En la página, con un .xlsx como el de los JDE (nombres inventados):
 *      se crea el evento, se juega un torneo entero, y desde Archivos se
 *      bajan el acta y el informe (PDF de verdad, con su texto) y la lista
 *      de clasificados, que se vuelve a subir en una Interregional y la
 *      sugerencia separa otra vez, con la interregional ya elegida.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-evento.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const E = require(path.join(RAIZ, "js/pareo/equipos.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const TablaExcel = require(path.join(RAIZ, "js/tabla-excel.js"));
const { contestarEtapa } = require("./lib/pareo-etapa");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const textoDe = (doc) => JSON.stringify(doc.bloques);

/* ==================================================================
   1. Sin navegador
   ================================================================== */
// Un todos contra todos de 4, con resultados a mano: ronda 1 A–D 1-0, B–C
// 1-0; ronda 2 …; el orden sale de las tablas de Berger.
function todosDe4(resultados, datos) {
  const jugadores = ["Ana", "Bea", "Cira", "Dina"].map((n, i) => ({ id: "j" + i, nombre: n, institucion: "Centro " + (i % 2), sexo: "w", nacimiento: "2013-0" + (i + 1) + "-01", region: "Alajuela", retiradoDespuesDe: null }));
  const t = T.nuevo(Object.assign({ sistema: "todos", jugadores, desempates: ["DE", "SB"], grupo: "Individual · Categoría C · Mujeres" }, datos));
  T.fijarNumeracion(t);
  for (let r = 0; r < T.rondasTodos(t); r++) {
    const R = T.rondaTodos(t, r);
    R.mesas.forEach((m, k) => { m.r = resultados ? resultados(r, k, m) : null; });
    t.rondas.push(R);
  }
  return t;
}

function pruebaSinNavegador() {
  console.log("\n=== Los cupos del art. 66.1 ===");
  igual("de la Regional de Alajuela (interregional III, de dos DRE): 3", V.cupo({ etapa: "regional", lugar: "Alajuela" }), 3);
  igual("de la Regional de Nicoya (interregional II, de tres DRE): 2", V.cupo({ etapa: "regional", lugar: "Nicoya" }), 2);
  igual("de la Interregional: el primero", V.cupo({ etapa: "interregional", lugar: "III" }), 1);
  igual("de la Institucional: dos", V.cupo({ etapa: "institucional", lugar: "" }), 2);

  console.log("\n=== Los clasificados ===");
  // Gana siempre el de número menor: Ana 3, Bea 2, Cira 1, Dina 0.
  const num = (t, id) => T.numeros(t).get(id);
  const t1 = todosDe4(null);
  t1.rondas.forEach((R) => R.mesas.forEach((m) => { m.r = num(t1, m.b) < num(t1, m.n) ? "1-0" : "0-1"; }));
  const c1 = V.clasificados(t1, 3);
  igual("los tres primeros, en orden", c1.filas.map((f) => t1.jugadores.find((j) => j.id === f.id).nombre), T.ordenInicial(t1).slice(0, 3).map((id) => t1.jugadores.find((j) => j.id === id).nombre));
  ok(c1.terminado && !c1.empate, "terminado y sin empate en el corte");
  // Todas tablas: los cuatro empatados en todo.
  const t2 = todosDe4((r, k) => "=");
  const c2 = V.clasificados(t2, 3);
  ok(c2.empate, "con todos empatados, el empate en el corte se avisa (no lo decide el orden de la lista)");
  const t3 = todosDe4((r, k) => (r === 0 ? "1-0" : null));
  const c3 = V.clasificados(t3, 3);
  igual("a medio jugar: provisional, con las rondas completas", [c3.terminado, c3.rondas, c3.total], [false, 1, 3]);

  console.log("\n=== El acta del congresillo ===");
  const eq = E.armarEquipos(["Uno", "Dos", "Tres", "Cuatro", "Cinco"].map((n, i) => ({ id: "e" + i, nombre: "PRUEBA " + n, institucion: "Liceo Equipo", sexo: "m" }))
    .concat(["Seis", "Siete", "Ocho"].map((n, i) => ({ id: "f" + i, nombre: "PRUEBA " + n, institucion: "Liceo Rival", sexo: "m" }))), ((k) => () => "q" + (++k))(0));
  const te = T.nuevo({ tipo: "equipos", jugadores: eq, sistema: "todos", grupo: "Equipos · Categoría C · Abierto", puntos: Object.assign({}, E.PUNTOS_EQUIPOS), desempates: ["PT", "DE"] });
  const evento = {
    id: "e1", nombre: "JDE 2026 · Etapa Regional · DRE Alajuela", jde: { anio: 2026, etapa: "regional", lugar: "Alajuela" }, creado: "2026-10-21",
    decisiones: {
      repetidos: [{ nombre: "PRUEBA REPETIDA", institucion: "Liceo A", veces: 3 }],
      dosModalidades: [{ nombre: "PRUEBA DOBLE", institucion: "Liceo B", inscripciones: "Equipos C y Individual C", queda: "Individual C" }],
      pase: [{ institucion: "Liceo C", categoria: "C", nombres: "PRUEBA PASA" }],
      descartados: [{ nombre: "PRUEBA SEXTA", institucion: "Liceo D", grupo: "Equipos · Categoría C · Abierto" }],
      cortos: [{ institucion: "Liceo E", grupo: "Equipos · Categoría C · Mujeres", cuantos: 2, nombres: "X, Y" }],
      categorias: ["Permitido: PRUEBA SUBE (Liceo F) nació en 2017…"],
      hombresEnMujeres: [],
    },
  };
  const acta = V.acta(evento, [Object.assign(t1, { arbitro: "Árbitro de Prueba", fechaInicio: "2026-11-02", ciudad: "Alajuela" }), te]);
  const ta = textoDe(acta);
  igual("se titula como acta del congresillo, con el nombre del evento", [acta.titulo, acta.subtitulo], ["Acta del congresillo técnico — Ajedrez", "JDE 2026 · Etapa Regional · DRE Alajuela"]);
  ok(/2 de noviembre de 2026/.test(ta) && /Árbitro principal: Árbitro de Prueba/.test(ta), "la fecha, la sede y el árbitro");
  for (const [que, re] of [["los repetidos", /PRUEBA REPETIDA \(Liceo A\): aparece 3 veces en la inscripción/], ["las dos modalidades y dónde quedó", /PRUEBA DOBLE .*Queda en Individual C/], ["el pase al abierto", /Liceo C, categoría C: PRUEBA PASA/],
    ["los descartados", /PRUEBA SEXTA \(Liceo D, Equipos · Categoría C · Abierto\)/], ["los equipos cortos", /Liceo E, Equipos · Categoría C · Mujeres: 2/], ["las categorías", /Permitido: PRUEBA SUBE/]]) ok(re.test(ta), "trae " + que);
  ok(/Orden de tableros/.test(ta) && /Liceo Equipo: Tablero 1: PRUEBA Uno · .*Suplente: PRUEBA Cinco/.test(ta), "trae el orden de tableros de cada equipo, con el suplente");
  ok(/Firmas/.test(ta) && /Representante de las delegaciones/.test(ta), "y las firmas");
  const tTorneos = acta.bloques.find((x) => x.tipo === "tabla" && x.encabezados[0] === "Torneo");
  igual("la tabla de los torneos, con su grupo, participantes y sistema", tTorneos.filas.map((f) => f.slice(0, 3)), [["Individual · Categoría C · Mujeres", "4", "Todos c. todos"], ["Equipos · Categoría C · Abierto", "2 eq.", "Todos c. todos"]]);

  console.log("\n=== El informe oficial ===");
  const inf = V.informe(evento, [t1]);
  const ti = textoDe(inf);
  ok(/1 torneos, 4 participaciones de estudiantes de 2 centros educativos/.test(ti), "la participación, contada", ti.slice(0, 400));
  ok(/y clasificados a la Etapa Interregional/.test(ti), "dice a qué etapa clasifican");
  const tabla = inf.bloques.find((x) => x.tipo === "tabla" && x.encabezados[0] === "Pto.");
  // La clasificación entera (los cuatro), con «Clasifica» en la última columna.
  igual("los tres primeros, con «Sí» en Clasifica (cupo 3)", tabla.filas.map((f) => f[f.length - 1]), ["Sí", "Sí", "Sí", ""]);

  console.log("\n=== La lista de clasificados ===");
  const filas = V.filasClasificados(evento, [t1, te]);
  igual("el mismo formato de la inscripción, con Torneo", V.ENCABEZADOS.slice(0, 8), ["Nombre", "Sexo", "FDN", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo"]);
  igual("las tres de individual: mujeres, de Alajuela, categoría C", filas.filter((f) => f[6] === "Individual").map((f) => [f[1], f[4], f[5], f[7]]), [["MUJER", "Alajuela", "C", "Mujeres"], ["MUJER", "Alajuela", "C", "Mujeres"], ["MUJER", "Alajuela", "C", "Mujeres"]]);
  igual("sin rondas jugadas, el torneo de equipos todavía no tiene clasificados", filas.filter((f) => f[6] === "Equipo").length, 0);
}

/* ==================================================================
   2. En la página
   ================================================================== */
function excelRegional() {
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "FDN"]];
  ["UNA", "DOS", "TRES", "CUATRO"].forEach((n, i) => filas.push(["PRUEBA " + n, "MUJER", "LICEO " + (i % 2 ? "NORTE" : "SUR"), "Alajuela", "C", "Individual", "2013-0" + (i + 1) + "-10"]));
  ["CINCO", "SEIS"].forEach((n) => filas.push(["PRUEBA " + n, "HOMBRE", "LICEO NORTE", "Alajuela", "C", "Individual", "2013-02-0" + (n === "CINCO" ? 2 : 3)]));
  // Una inscripción repetida: tiene que llegar al acta.
  filas.push(["PRUEBA UNA", "MUJER", "LICEO SUR", "Alajuela", "C", "Individual", "2013-01-10"]);
  return Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas }]));
}

async function abrirPagina(browser) {
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.goto(BASE + "/pareo.html", { waitUntil: "networkidle" });
  await page.click('[data-ficha="jugadores"]');
  return { ctx, page, errores };
}

async function pruebaPagina(browser) {
  console.log("\n=== Crear el evento y jugar un torneo ===");
  let { ctx, page, errores } = await abrirPagina(browser);
  await page.setInputFiles("#pi-subir-lista", { name: "regional.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: excelRegional() });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "regional", "Alajuela");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  const guardado = await page.evaluate(() => {
    const lista = JSON.parse(localStorage.getItem("pareo_lista_v1"));
    return lista.map((x) => JSON.parse(localStorage.getItem("pareo_torneo_v1_" + x.id)));
  });
  igual("los dos torneos son del mismo evento", new Set(guardado.map((x) => x.evento && x.evento.id)).size, 1);
  igual("el evento guarda la etapa y las decisiones (la inscripción repetida)", [guardado[0].evento.nombre, guardado[0].evento.decisiones.repetidos],
    ["JDE 2026 · Etapa Regional · DRE Alajuela", [{ nombre: "PRUEBA UNA", institucion: "LICEO SUR", veces: 2 }]]);
  const idMujeres = await page.evaluate(() => JSON.parse(localStorage.getItem("pareo_lista_v1")).find((x) => /Mujeres/.test(x.nombre)).id);
  await page.selectOption("#pi-lista", idMujeres);
  await page.click('[data-ficha="rondas"]');
  // Todos contra todos de 4: tres rondas, gana siempre el de la izquierda.
  for (let r = 1; r <= 3; r++) {
    if (r > 1) await page.click(`#pi-rondas-nav button:has-text("Ronda ${r}")`);
    await page.click(`#pi-ronda button:has-text("Emparejar la ronda ${r}")`);
    await page.waitForFunction(() => document.querySelector("#pi-ronda select"));
    for (const s of await page.$$("#pi-ronda table select")) await s.selectOption("1-0");
  }

  console.log("\n=== La ficha Archivos: el evento ===");
  await page.click('[data-ficha="archivos"]');
  ok(await page.$eval("#pi-evento", (n) => n.checkVisibility()), "se ve la sección del evento");
  ok(/JDE 2026 · Etapa Regional · DRE Alajuela/.test(await page.textContent("#pi-evento")), "con el nombre del evento");
  ok(/Clasificados a la Etapa Interregional \(3 por torneo\)/.test(await page.textContent("#pi-evento")), "y sus clasificados: 3 por torneo (Alajuela, interregional de dos DRE)");
  const mujeres = (await page.$$eval("#pi-clasificados section", (l) => l.map((x) => x.textContent))).find((x) => /Mujeres/.test(x)) || "";
  igual("el torneo terminado: tres clasificadas", (mujeres.match(/PRUEBA/g) || []).length, 3);
  ok(!/Provisional/.test(mujeres), "sin «provisional»");
  const abierto = (await page.$$eval("#pi-clasificados section", (l) => l.map((x) => x.textContent))).find((x) => /Abierto/.test(x)) || "";
  ok(/Todavía sin rondas jugadas/.test(abierto), "el que no se jugó lo dice", abierto);

  const pdf = async (id) => {
    const [d] = await Promise.all([page.waitForEvent("download"), page.click(id)]);
    return { nombre: d.suggestedFilename(), texto: fs.readFileSync(await d.path()).toString("latin1") };
  };
  const a = await pdf("#pi-evento-acta");
  ok(a.texto.startsWith("%PDF-") && a.texto.includes("Acta del congresillo") && /acta-congresillo\.pdf$/.test(a.nombre), "el acta es un PDF de verdad, con su nombre", a.nombre);
  // En el PDF los paréntesis van escapados («\(»): se busca sin ellos.
  ok(a.texto.includes("PRUEBA UNA") && a.texto.includes("aparece 2 veces"), "y trae lo que se decidió en la sugerencia");
  const inf = await pdf("#pi-evento-informe");
  ok(inf.texto.startsWith("%PDF-") && inf.texto.includes("Informe oficial") && inf.texto.includes("PRUEBA"), "el informe también, con los nombres");

  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#pi-evento-clasificados")]);
  const lista = fs.readFileSync(await dl.path());
  ok(/clasificados\.xlsx$/.test(dl.suggestedFilename()), "la lista de clasificados es un .xlsx", dl.suggestedFilename());
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== La Interregional: subir los clasificados ===");
  ({ ctx, page, errores } = await abrirPagina(browser));
  // Los clasificados de Alajuela y una lista de Occidente, juntas.
  const occidente = Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas: [V.ENCABEZADOS,
    ["PRUEBA OCCIDENTE 1", "MUJER", "2013-05-05", "LICEO OESTE", "Occidente", "C", "Individual", "Mujeres", "", "", "1"],
    ["PRUEBA OCCIDENTE 2", "HOMBRE", "2013-05-06", "LICEO OESTE", "Occidente", "C", "Individual", "Abierto", "", "", "1"]] }]));
  await page.setInputFiles("#pi-subir-lista", [
    { name: "alajuela-clasificados.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: lista },
    { name: "occidente-clasificados.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: occidente },
  ]);
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  ok(/5 jugadores/.test(await page.textContent("#pi-sugerencia")), "los dos archivos, juntos (3 + 2)", await page.textContent("#pi-sugerencia-titulo + p"));
  await page.click("#pi-sugerencia-crear");
  await page.waitForSelector('dialog[data-avisos="formulario"][open]');
  await page.selectOption('dialog[data-avisos="formulario"][open] select[name="etapa"]', "interregional");
  await page.click('dialog[data-avisos="formulario"][open] [data-avisos-aceptar]');
  await page.waitForFunction(() => document.querySelector('dialog[data-avisos="formulario"][open] [name="lugar"]'));
  igual("la interregional viene elegida: la de Alajuela y Occidente (III)", await page.$eval('dialog[data-avisos="formulario"][open] [name="lugar"]', (x) => x.value), "III");
  await page.click('dialog[data-avisos="formulario"][open] [data-avisos-aceptar]');
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  const nombres = await page.$$eval("#pi-lista option", (o) => o.map((x) => x.textContent));
  ok(nombres.some((x) => x === "JDE 2026 · Etapa Interregional · Interregional III (Alajuela-Occidente) — Mujeres"), "el torneo de mujeres de la interregional, con su nombre", nombres.join(" | "));
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { pruebaSinNavegador(); } catch (e) { mal("la parte sin navegador se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaPagina(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
