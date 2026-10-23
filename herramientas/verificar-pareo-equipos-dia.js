/* Pareo Integral, los equipos el día del torneo (js/pareo/pagina.js,
 * js/pareo/ver.js, js/pareo/evento.js):
 *
 *   - «Mover» lleva a un jugador también a un torneo por equipos: al equipo
 *     de su centro si tiene cupo; si está lleno, avisa que hay que sacar a
 *     alguien. Y revisa la categoría (art. 17 y 18): mayor de lo que permite,
 *     subir en individual, un salto que no es A→B, C→D ni D→E, el tope de 3;
 *   - en un equipo se quita a un integrante que no vino (va al acta) y se
 *     agrega un equipo que llegó y no estaba en la lista;
 *   - los que se quedan sin rivales juegan la «Categoría Amistoso», que no
 *     clasifica ni suma al medallero;
 *   - el plazo de los capitanes: hasta cuántos minutos antes de la ronda
 *     cambian la alineación, cuánto les queda en su celular, y pasado el
 *     plazo la pestaña del árbitro ya no lo acepta.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-equipos-dia.js
 */
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const TablaExcel = require(path.join(RAIZ, "js/tabla-excel.js"));
const { contestarEtapa } = require("./lib/pareo-etapa");
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const formulario = 'dialog[data-avisos="formulario"][open]';
const xlsx = (filas) => Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas }]));

const EV = { id: "ev1", nombre: "PRUEBA EVENTO", jde: { anio: 2026, etapa: "regional", lugar: "Alajuela" } };
const persona = (nombre, inst, nace) => ({ id: "j" + Math.random().toString(36).slice(2, 9), nombre, institucion: inst, nacimiento: nace, retiradoDespuesDe: null });
const equipo = (inst, gente) => ({ id: "e" + inst.replace(/\W/g, ""), nombre: inst, institucion: inst, elo: 0, retiradoDespuesDe: null, integrantes: gente });

// Tres torneos del mismo evento: el individual de la A (de donde se mueve),
// el de equipos de la B y el individual de la B.
function evento() {
  const ind = T.nuevo({ nombre: "PRUEBA IND A", grupo: "Individual · Categoría A · Abierto", jugadores: [
    persona("PRUEBA ANA", "LICEO NORTE", "2017-05-01"), persona("PRUEBA BEA", "LICEO SUR", "2018-01-01"),
    persona("PRUEBA CARLA", "LICEO ESTE", "2010-01-01"), persona("PRUEBA DORA", "LICEO OESTE", "2017-03-03")] });
  const eq = T.nuevo({ nombre: "PRUEBA EQ B", grupo: "Equipos · Categoría B · Abierto", tipo: "equipos", tableros: 4, jugadores: [
    equipo("LICEO NORTE", [1, 2, 3, 4].map((i) => persona("PRUEBA NORTE " + i, "LICEO NORTE", "2014-01-0" + i))),
    equipo("LICEO SUR", [1, 2, 3, 4, 5].map((i) => persona("PRUEBA SUR " + i, "LICEO SUR", "2014-01-0" + i))),
    // Tres que ya suben de la A a la B: el tope del art. 18.
    equipo("LICEO OESTE", [1, 2, 3].map((i) => persona("PRUEBA OESTE " + i, "LICEO OESTE", "2018-02-0" + i)))] });
  const indB = T.nuevo({ nombre: "PRUEBA IND B", grupo: "Individual · Categoría B · Abierto", jugadores: [persona("PRUEBA OTRA", "LICEO X", "2014-04-04")] });
  [ind, eq, indB].forEach((t, i) => Object.assign(t, { evento: EV, ordenEnEvento: i }));
  return { ind, eq, indB };
}
const sembrar = (lista, abierto) => (page) => page.addInitScript(([l, a]) => {
  if (localStorage.getItem("pareo_lista_v1")) return;
  localStorage.setItem("pareo_lista_v1", JSON.stringify(l.map(([id, t], i) => ({ id, nombre: t.nombre, actualizado: 10 - i, evento: t.evento ? { id: t.evento.id, nombre: t.evento.nombre } : null }))));
  for (const [id, t] of l) localStorage.setItem("pareo_torneo_v1_" + id, JSON.stringify(t));
  localStorage.setItem("pareo_abierto_v1", a);
}, [lista, abierto]);
const leer = (page, id) => page.evaluate((i) => JSON.parse(localStorage.getItem("pareo_torneo_v1_" + i)), id);
const textoAvisos = (page) => page.evaluate(() => document.body.innerText);

async function mover(page, nombre, destino) {
  await page.click(`[aria-label="Mover a ${nombre} a otro torneo"]`);
  await page.waitForSelector(formulario);
  await page.selectOption(formulario + ' select[name="destino"]', destino);
  await page.click(formulario + " [data-avisos-aceptar]");
  await page.waitForFunction(() => !document.querySelector('dialog[data-avisos="formulario"][open]'));
  await page.waitForTimeout(150);
}

async function pruebaMover(browser) {
  console.log("\n=== Mover a un torneo por equipos, con la categoría revisada ===");
  const { ind, eq, indB } = evento();
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar([["ind", ind], ["eq", eq], ["indB", indB]], "ind"));
  await page.click('[data-ficha="jugadores"]');
  await mover(page, "PRUEBA ANA", "eq");
  let e = await leer(page, "eq");
  const norte = e.jugadores.find((x) => x.nombre === "LICEO NORTE");
  ok(norte.integrantes.length === 5 && norte.integrantes[4].nombre === "PRUEBA ANA", "entra al equipo de su centro, que tenía cupo", JSON.stringify(norte.integrantes.map((j) => j.nombre)));
  ok(!(await leer(page, "ind")).jugadores.some((j) => j.nombre === "PRUEBA ANA"), "y sale del individual");
  ok(/PRUEBA ANA sube de la categoría A a la B: lo permite el art\. 18/.test(await textoAvisos(page)), "avisa que sube de categoría y que está permitido");

  await mover(page, "PRUEBA BEA", "eq");
  ok(/El equipo de LICEO SUR ya tiene 5, el máximo: para que quede el cupo, primero saca a alguien del equipo/.test(await textoAvisos(page)), "con el equipo lleno, dice que hay que sacar a alguien");
  ok((await leer(page, "ind")).jugadores.some((j) => j.nombre === "PRUEBA BEA") && (await leer(page, "eq")).jugadores.find((x) => x.nombre === "LICEO SUR").integrantes.length === 5, "y no lo mueve");

  await mover(page, "PRUEBA CARLA", "eq");
  ok(/PRUEBA CARLA nació en 2010: es mayor de lo que permite la categoría B \(art\. 17\)\. No se movió\./.test(await textoAvisos(page)), "a una categoría menor que la suya, no");

  await mover(page, "PRUEBA DORA", "indB");
  ok(/PRUEBA DORA es de la categoría A: en individual no se sube de categoría \(art\. 18\)\. No se movió\./.test(await textoAvisos(page)), "en individual no se sube de categoría");
  await mover(page, "PRUEBA DORA", "eq");
  ok(/El equipo de LICEO OESTE ya tiene 3 que suben de categoría: el tope es 3 \(art\. 18\)/.test(await textoAvisos(page)), "el tope de tres que suben por equipo");
  ok((await leer(page, "ind")).jugadores.some((j) => j.nombre === "PRUEBA DORA"), "y se queda donde estaba");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaEquipos(browser) {
  console.log("\n=== Quitar a un integrante y agregar un equipo ===");
  const { eq } = evento();
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", sembrar([["eq", eq]], "eq"));
  await page.click('[data-ficha="jugadores"]');
  await page.click('[aria-label="Quitar a PRUEBA NORTE 2 de LICEO NORTE"]');
  await page.click('dialog[data-avisos][open] [data-avisos-aceptar]');
  let e = await P.esperarGuardado(page, (l) => l[0].jugadores.find((x) => x.nombre === "LICEO NORTE").integrantes.length === 3);
  igual("sale del equipo y queda anotado para el acta", e[0].bajasEquipo, [{ equipo: "LICEO NORTE", nombre: "PRUEBA NORTE 2" }]);
  ok(V.acta(EV, [e[0]]).bloques.some((b) => (b.items || []).some((x) => /LICEO NORTE, .*: sale PRUEBA NORTE 2 \(no se presentó\)/.test(x))), "el acta trae la baja");
  await page.click("#pi-eq-nuevo summary");
  await page.fill("#pi-eq-nuevo-centro", "LICEO NUEVO");
  await page.fill("#pi-eq-nuevo-integrantes", "PRUEBA NUEVO 1;1500\nPRUEBA NUEVO 2\nPRUEBA NUEVO 3");
  await page.click("#pi-eq-nuevo-agregar");
  e = await P.esperarGuardado(page, (l) => l[0].jugadores.some((x) => x.nombre === "LICEO NUEVO"));
  const nuevo = e[0].jugadores.find((x) => x.nombre === "LICEO NUEVO");
  igual("se agrega el equipo que llegó, con sus integrantes en orden", [nuevo.integrantes.map((j) => j.nombre), nuevo.integrantes[0].elo], [["PRUEBA NUEVO 1", "PRUEBA NUEVO 2", "PRUEBA NUEVO 3"], 1500]);
  await page.fill("#pi-eq-nuevo-centro", "Liceo Norte");
  await page.fill("#pi-eq-nuevo-integrantes", "PRUEBA REPETIDO");
  await page.click("#pi-eq-nuevo-agregar");
  ok(/Liceo Norte ya tiene equipo en este torneo/.test(await textoAvisos(page)) && (await leer(page, "eq")).jugadores.length === 4, "un centro que ya tiene equipo no se repite");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaAmistoso(browser) {
  console.log("\n=== La Categoría Amistoso ===");
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "FDN"]];
  for (let i = 1; i <= 3; i++) filas.push(["PRUEBA C " + i, "MUJER", "LICEO " + i, "Alajuela", "C", "Individual", "Mujeres", "2013-01-0" + i]);
  filas.push(["PRUEBA SOLA A", "HOMBRE", "LICEO A", "Alajuela", "A", "Individual", "Abierto", "2018-01-01"]);
  filas.push(["PRUEBA SOLA B", "MUJER", "LICEO B", "Alajuela", "B", "Individual", "Mujeres", "2015-01-01"]);
  for (let i = 1; i <= 3; i++) filas.push(["PRUEBA SOLO EQ " + i, "HOMBRE", "LICEO SOLO", "Alajuela", "D", "Equipo", "Abierto", "2010-01-0" + i]);
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", { name: "r.xlsx", mimeType: P.XLSX, buffer: xlsx(filas) });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  ok(await page.isChecked("#pi-amistoso") && /con los 5 que se quedan sin rivales/.test(await page.textContent("#pi-sugerencia")), "ofrece el Amistoso con los que se quedan sin rivales, marcado");
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "regional", "Alajuela");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  const todos = await P.leerTodos(page);
  const am = todos.find((x) => x.amistoso);
  ok(am && /Categoría Amistoso$/.test(am.nombre) && am.jugadores.length === 5 && !am.tipo, "se crea «Categoría Amistoso», individual, con los cinco", am && am.nombre);
  ok(am && am.evento && am.ritmo === todos.find((x) => !x.amistoso).ritmo, "con los mismos datos que los demás torneos del evento");
  const t = Object.assign({}, am, { rondas: [{ mesas: [{ b: am.jugadores[0].id, n: am.jugadores[1].id, r: "1-0" }], ausencias: {} }], rondasTotales: 1, sistema: "suizo" });
  igual("no clasifica ni suma al medallero", [V.clasificados(t, 3).filas.length, V.medallero([t]).length], [0, 0]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

// "HH:MM" en Costa Rica dentro de `min` minutos.
const horaCR = (min) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Costa_Rica" }).format(new Date(Date.now() + min * 60000));

async function pruebaPlazo(browser) {
  console.log("\n=== El plazo de los capitanes ===");
  const { eq } = evento();
  eq.ritmo = "10 min + 2 s por jugada";
  eq.jugadores = eq.jugadores.slice(0, 2);
  T.fijarNumeracion(eq);
  eq.rondas = [{ mesas: [{ b: eq.jugadores[0].id, n: eq.jugadores[1].id, r: null }], ausencias: {} }];
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", async (p) => {
    await sembrar([["eq", eq]], "eq")(p);
    // La ronda 1 empieza dentro de 30 minutos (el horario del evento).
    await p.addInitScript((h) => { if (!localStorage.getItem("pareo_horario_v1_ev1")) localStorage.setItem("pareo_horario_v1_ev1", h); }, horaCR(30));
  });
  await page.click('[data-ficha="torneo"]');
  ok(/Sin plazo: hasta que se anote el primer tablero/.test(await page.textContent("#pi-plazo-alineacion")), "sin plazo, como antes");
  await page.fill("#pi-plazo-min", "10");
  await page.press("#pi-plazo-min", "Tab");
  const [g] = await P.esperarGuardado(page, (l) => l[0].plazoAlineacion === 10);
  ok(/Ronda 1: hasta las/.test(await page.textContent("#pi-plazo-estado")), "dice hasta qué hora", await page.textContent("#pi-plazo-estado"));
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-capitanes");
  await page.waitForSelector(".pi-capitan-url");
  const url = await page.textContent(".pi-capitan-url");
  const canal = "pareo-capitan-" + url.split("#capitan=")[1];
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "estado"), canal);
  const est = await page.evaluate((c) => window.__enviados.filter((x) => x.canal === c && x.evento === "estado").pop().payload, canal);
  const faltan = (est.limite - Date.now()) / 60000;
  ok(faltan > 18 && faltan <= 20.1 && !est.bloqueada, "al capitán le llega el plazo: 10 minutos antes de la ronda", JSON.stringify({ faltan, est }));

  // Ya pasó: la ronda empezó hace 5 minutos.
  await page.evaluate((h) => localStorage.setItem("pareo_horario_v1_ev1", h), horaCR(-5));
  await page.click('[data-ficha="torneo"]');
  await page.fill("#pi-plazo-min", "0");
  await page.press("#pi-plazo-min", "Tab");
  await P.esperarGuardado(page, (l) => l[0].plazoAlineacion === 0);
  await page.waitForFunction((c) => { const x = window.__enviados.filter((y) => y.canal === c && y.evento === "estado").pop(); return x && x.payload.vencido; }, canal);
  bien("vencido el plazo, al capitán le llega cerrado");
  const ids = g.jugadores[0].integrantes.map((j) => j.id);
  await page.evaluate(([c, a]) => window.__llega(c, "alineacion", { ronda: 1, alineacion: a }), [canal, [ids[1], ids[2]]]);
  await page.waitForTimeout(300);
  ok(!(await leer(page, "eq")).rondas[0].mesas[0].alineacionCapitan, "y lo que mande tarde no entra");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== Lo que ve el capitán ===");
  const cap = await P.abrirPagina(browser, BASE, "#capitan=prueba12");
  await cap.page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  const llega = (payload) => cap.page.evaluate((p) => window.__llega("pareo-capitan-prueba12", "estado", p), payload);
  const base = { nombre: "PRUEBA EQ B", equipo: "LICEO NORTE", ronda: 1, rival: "LICEO SUR", integrantes: [{ id: "a", nombre: "PRUEBA A" }, { id: "b", nombre: "PRUEBA B" }], alineacion: ["a", "b"] };
  await llega(Object.assign({}, base, { limite: Date.now() + 12 * 60000, bloqueada: false }));
  await cap.page.waitForSelector("#pi-cap-queda");
  ok(/Te quedan 12 min para cambiar la alineación \(hasta las/.test(await cap.page.textContent("#pi-cap-queda")), "le dice cuánto le queda para cambiar la alineación", await cap.page.textContent("#pi-cap-queda"));
  await llega(Object.assign({}, base, { limite: Date.now() - 60000, vencido: true, bloqueada: true }));
  await cap.page.waitForSelector("#pi-cap-vencido");
  ok(/Se cerró el plazo para cambiar la alineación/.test(await cap.page.textContent("#pi-cap-vencido")) && !(await cap.page.$("#pi-cap-confirmar")), "vencido, se lo dice y ya no hay botón");
  ok(!cap.errores.length, "sin errores en la página", cap.errores.join(" | "));
  await cap.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaMover(browser);
    await pruebaEquipos(browser);
    await pruebaAmistoso(browser);
    await pruebaPlazo(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
