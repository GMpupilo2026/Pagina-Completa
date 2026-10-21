/* Pareo Integral: la sala de juego de los JDE y lo que la rodea
 * (js/pareo/evento.js, js/pareo/pagina.js, js/pareo/ver.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - el reloj del retraso: quien no llegó pierde cuando cae su reloj (art.
 *     30), con el tiempo base del ritmo, y la incomparecencia se anota sola;
 *   - las incidencias de cada ronda, que llegan al informe oficial;
 *   - mover a alguien a otro torneo del evento y reemplazar a un integrante
 *     de un equipo, los dos antes de la ronda 1 y anotados en el acta;
 *   - el medallero por centro educativo;
 *   - la pantalla para proyectar, que pasa sola de torneo en torneo;
 *   - «Mi jugador», que encuentra la mesa, el tablero y el color;
 *   - pasar lista antes de la ronda 1;
 *   - las estadísticas para el MEP;
 *   - la inscripción comparada con los clasificados de la etapa anterior.
 *
 * El canal en vivo, con el doble de `window.sb` (herramientas/lib/pareo-pruebas.js);
 * el tiempo, con el reloj de Playwright (page.clock).
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-jde-sala.js
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
const P = require("./lib/pareo-pruebas");
const { XLSX, leerTodos, vis, anotar, jugarRondas } = P;

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const xlsx = (filas) => Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas }]));
const textoDe = (doc) => JSON.stringify(doc.bloques);

/* ==================================================================
   1. Sin navegador
   ================================================================== */
// Un todos contra todos de 4 donde gana siempre el de número menor.
function individual(nombres, centros, grupo) {
  const jugadores = nombres.map((n, i) => ({ id: "j" + i, nombre: n, institucion: centros[i], sexo: i % 2 ? "m" : "w", categoria: (/Categoría (\S+)/.exec(grupo) || [])[1], retiradoDespuesDe: null }));
  const t = T.nuevo({ sistema: "todos", jugadores, desempates: ["DE", "SB"], grupo });
  T.fijarNumeracion(t);
  const num = T.numeros(t);
  for (let r = 0; r < T.rondasTodos(t); r++) {
    const R = T.rondaTodos(t, r);
    R.mesas.forEach((m) => { if (m.n) m.r = num.get(m.b) < num.get(m.n) ? "1-0" : "0-1"; });
    t.rondas.push(R);
  }
  return t;
}

function pruebaSinNavegador() {
  console.log("\n=== El tiempo de espera (art. 30) ===");
  igual("del ritmo sale el tiempo base, sin el incremento", ["10 min + 2 s", "90 minutos + 30 s", "1 h 30 min", "15+10", "90' + 30''", ""].map(V.minutosBase), [10, 90, 90, 15, 90, 0]);
  const R = { inicio: 0, tarde: { a: { llego: null }, b: { llego: 7 * 60000 } } };
  igual("quien no llegó a los 12 minutos, con 10 de base: su reloj cayó", V.estadoRetraso(R, "a", 12 * 60000, 10), { minutos: 12, llego: false, vencido: true });
  igual("quien llegó a los 7: llegó tarde, no pierde", V.estadoRetraso(R, "b", 12 * 60000, 10), { minutos: 7, llego: true, vencido: false });
  igual("a los 9, todavía no", V.estadoRetraso(R, "a", 9 * 60000, 10).vencido, false);
  igual("sin ritmo escrito no se declara vencido a nadie", V.estadoRetraso(R, "a", 99 * 60000, 0).vencido, false);
  igual("quien no está marcado no tiene retraso", V.estadoRetraso(R, "c", 1, 10), null);

  console.log("\n=== El medallero ===");
  const t1 = individual(["Ana", "Beto", "Cira", "Dani"], ["Liceo Norte", "Liceo Sur", "Liceo Norte", "Liceo Este"], "Individual · Categoría C");
  const t2 = individual(["Eva", "Fede", "Gabi", "Hugo"], ["Liceo Sur", "Liceo Sur", "Liceo Este", "Liceo Norte"], "Individual · Categoría D");
  const orden = (t) => T.ordenInicial(t).map((id) => t.jugadores.find((j) => j.id === id).institucion);
  const med = V.medallero([t1, t2]);
  const esperado = new Map();
  for (const t of [t1, t2]) orden(t).slice(0, 3).forEach((c, k) => {
    if (!esperado.has(c)) esperado.set(c, [0, 0, 0]);
    esperado.get(c)[k]++;
  });
  igual("cada centro con sus oros, platas y bronces de los dos torneos", med.map((x) => [x.centro, x.oro, x.plata, x.bronce]).sort(), [...esperado.entries()].map(([c, v]) => [c].concat(v)).sort());
  ok(med.every((x, i) => i === 0 || x.oro < med[i - 1].oro || (x.oro === med[i - 1].oro && (x.plata < med[i - 1].plata || (x.plata === med[i - 1].plata && x.bronce <= med[i - 1].bronce)))), "ordenado por oro, después plata y bronce");

  console.log("\n=== Las estadísticas para el MEP ===");
  const est = V.estadisticas({ nombre: "Prueba" }, [t1, t2]);
  igual("tres hojas", est.map((h) => h.nombre), ["Por torneo", "Por categoría", "Por centro"]);
  igual("por categoría, con mujeres y hombres", est[1].filas.slice(1), [["C", "Individual", "2", "2", "4"], ["D", "Individual", "2", "2", "4"]]);
  const sur = est[2].filas.find((f) => f[0] === "Liceo Sur");
  igual("por centro: Liceo Sur, 3 participaciones", sur, ["Liceo Sur", "1", "2", "3"]);

  console.log("\n=== Comparar con la etapa anterior ===");
  const c = V.compararEtapa([{ nombre: "José Pérez" }, { nombre: "ANA MORA" }, { nombre: "Intruso" }], [{ nombre: "JOSE PEREZ" }, { nombre: "Ana Mora" }, { nombre: "Ausente" }]);
  igual("se compara por nombre, sin tildes ni mayúsculas", [c.noClasificaron.map((j) => j.nombre), c.faltan.map((j) => j.nombre)], [["Intruso"], ["Ausente"]]);

  console.log("\n=== El acta y el informe ===");
  const ev = { id: "e", nombre: "JDE 2026 · Etapa Regional · DRE Alajuela", jde: { anio: 2026, etapa: "regional", lugar: "Alajuela" }, creado: "2026-10-21",
    decisiones: { comparacion: { noClasificaron: ["INTRUSO (Liceo X)"], faltan: ["AUSENTE (Liceo Y)"] } } };
  t1.movimientos = [{ nombre: "Ana", institucion: "Liceo Norte", desde: "Individual · Categoría B" }];
  t1.noSePresentaron = ["Zoe"];
  t1.rondas[0].incidencias = [{ hora: Date.UTC(2026, 9, 21, 16, 5), mesa: 2, tipo: "sancion", texto: "Usó el celular durante la partida." }];
  const acta = textoDe(V.acta(ev, [t1, t2]));
  ok(/Ana \(Liceo Norte\): de Individual · Categoría B a Individual · Categoría C/.test(acta), "el acta trae el cambio de torneo");
  ok(/No se presentaron a la ronda 1/.test(acta) && /Zoe/.test(acta), "y quien no se presentó");
  ok(/INTRUSO \(Liceo X\)/.test(acta) && /AUSENTE \(Liceo Y\)/.test(acta), "y la comparación con los clasificados");
  const inf = textoDe(V.informe(ev, [t1, t2]));
  ok(/Ronda 1, mesa 2, 10:05\sa\.\sm\. · Sanción: Usó el celular durante la partida\./.test(inf), "el informe trae la incidencia, con su ronda, su mesa y la hora de Costa Rica", (inf.match(/Ronda 1[^"]*/) || [""])[0]);
  ok(/Medallero por centro educativo/.test(inf), "y el medallero");

  console.log("\n=== Lo que ve el público de un torneo por equipos ===");
  const personas = [];
  for (const cc of ["ALFA", "BETA"]) for (let i = 1; i <= 4; i++) personas.push({ id: cc + i, nombre: "PRUEBA " + cc + " " + i, institucion: "LICEO " + cc });
  let k = 0;
  const te = T.nuevo({ tipo: "equipos", tableros: 4, jugadores: E.armarEquipos(personas, () => "q" + (++k)), sistema: "todos", puntos: Object.assign({}, E.PUNTOS_EQUIPOS), desempates: ["PT"] });
  T.fijarNumeracion(te);
  const Re = T.rondaTodos(te, 0);
  E.prepararMesa(te, Re.mesas[0]);
  te.rondas.push(Re);
  const vt = V.vistaTorneo(te);
  igual("cada tablero con quién juega con cada color", vt.ronda.mesas[0].tableros.map((x) => x.t), [1, 2, 3, 4]);
  ok(vt.ronda.mesas[0].tableros.every((x) => /PRUEBA/.test(x.b) && /PRUEBA/.test(x.n)), "con los nombres de los integrantes");
}

/* ==================================================================
   2. En la página
   ================================================================== */
// Una regional: cuatro mujeres y dos hombres en individual C, y tres equipos
// de cuatro (abierto C).
function excelRegional() {
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "FDN"]];
  ["UNA", "DOS", "TRES", "CUATRO"].forEach((n, i) => filas.push(["PRUEBA " + n, "MUJER", "LICEO " + (i % 2 ? "NORTE" : "SUR"), "Alajuela", "C", "Individual", "Mujeres", "2013-0" + (i + 1) + "-10"]));
  ["CINCO", "SEIS"].forEach((n, i) => filas.push(["PRUEBA " + n, "HOMBRE", "LICEO " + (i ? "NORTE" : "SUR"), "Alajuela", "C", "Individual", "Abierto", "2013-0" + (i + 5) + "-10"]));
  for (const c of ["NORTE", "SUR", "ESTE"]) for (let i = 1; i <= 4; i++) filas.push(["PRUEBA " + c + " " + i, "HOMBRE", "LICEO " + c, "Alajuela", "C", "Equipo", "Abierto", "2013-07-0" + i]);
  return xlsx(filas);
}

const dialogo = 'dialog[data-avisos="formulario"][open]';
const confirmar = 'dialog[data-avisos="confirmar"][open]';

async function pruebaPagina(browser) {
  let { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", (p) => p.clock.install());
  await page.click('[data-ficha="torneo"]');
  await page.fill('#pi-form-torneo [name="ritmo"]', "10 min + 2 s");
  await page.press('#pi-form-torneo [name="ritmo"]', "Tab");
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", { name: "regional.xlsx", mimeType: XLSX, buffer: excelRegional() });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "regional", "Alajuela");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  let todos = await leerTodos(page);
  const mujeres = todos.find((x) => /Individual · Mujeres/.test(x.nombre));
  const abierto = todos.find((x) => /Individual · Abierto/.test(x.nombre));
  const equipos = todos.find((x) => x.tipo === "equipos");
  ok(mujeres && abierto && equipos && mujeres.ritmo === "10 min + 2 s", "tres torneos, con el ritmo del abierto", todos.map((x) => x.nombre).join(" | "));

  console.log("\n=== Mover a otro torneo del evento ===");
  await page.selectOption("#pi-lista", mujeres.idLista);
  await page.click('[data-ficha="jugadores"]');
  await page.click('#pi-tabla-jugadores button[aria-label="Mover a PRUEBA CUATRO a otro torneo"]');
  await page.waitForSelector(dialogo);
  const destinos = await page.$$eval(dialogo + ' select[name="destino"] option', (o) => o.map((x) => x.textContent));
  igual("solo los torneos individuales del evento sin empezar", destinos, ["Individual · Abierto"]);
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction(() => !document.querySelector('dialog[data-avisos="formulario"][open]'));
  todos = await leerTodos(page);
  const ab = todos.find((x) => x.idLista === abierto.idLista);
  ok(!todos.find((x) => x.idLista === mujeres.idLista).jugadores.some((j) => j.nombre === "PRUEBA CUATRO") && ab.jugadores.some((j) => j.nombre === "PRUEBA CUATRO"), "sale de un torneo y entra al otro");
  igual("y queda anotado en el torneo al que llegó", ab.movimientos, [{ nombre: "PRUEBA CUATRO", institucion: "LICEO NORTE", desde: "Individual · Mujeres" }]);

  console.log("\n=== Reemplazar a un integrante ===");
  await page.selectOption("#pi-lista", equipos.idLista);
  const norte = equipos.jugadores.find((e) => e.nombre === "LICEO NORTE");
  await page.click(`#pi-reemplazar-${norte.id}-1`);
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="nombre"]', "PRUEBA NUEVA");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction(() => !document.querySelector('dialog[data-avisos="formulario"][open]'));
  todos = await leerTodos(page);
  const teq = todos.find((x) => x.idLista === equipos.idLista);
  igual("entra en el mismo lugar del orden de tableros", teq.jugadores.find((e) => e.id === norte.id).integrantes.map((j) => j.nombre), ["PRUEBA NORTE 1", "PRUEBA NUEVA", "PRUEBA NORTE 3", "PRUEBA NORTE 4"]);
  igual("y queda anotado", teq.reemplazos, [{ equipo: "LICEO NORTE", sale: "PRUEBA NORTE 2", entra: "PRUEBA NUEVA" }]);

  console.log("\n=== Pasar lista antes de la ronda 1 ===");
  await page.selectOption("#pi-lista", mujeres.idLista);
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-asistencia summary");
  await page.check("#pi-asistencia-activar");
  igual("de entrada no llegó nadie", await page.textContent("#pi-asistencia-cuenta"), "Llegaron 0 de 3.");
  await page.click("#pi-asistencia-todos");
  await page.click("#pi-asistencia li:nth-child(3) input");
  igual("al desmarcar a una, cuenta 2 de 3", await page.textContent("#pi-asistencia-cuenta"), "Llegaron 2 de 3.");
  await page.click("#pi-emparejar");
  await page.waitForSelector(confirmar);
  ok(/1 no llegaron: PRUEBA/.test(await page.textContent(confirmar)), "en todos contra todos pregunta si sacarla antes de sortear");
  await page.click(confirmar + " [data-avisos-aceptar]");
  await page.waitForFunction(() => document.querySelector("#pi-ronda select"));
  todos = await leerTodos(page);
  const tm = todos.find((x) => x.idLista === mujeres.idLista);
  igual("sale del torneo y queda anotada", [tm.jugadores.length, tm.noSePresentaron.length], [2, 1]);

  console.log("\n=== El reloj del retraso ===");
  await page.click("#pi-reloj-empezar");
  await page.waitForSelector("#pi-reloj-quien");
  const quien = await page.$eval("#pi-reloj-quien option:nth-child(2)", (o) => o.value);
  await page.selectOption("#pi-reloj-quien", quien);
  await page.click("#pi-reloj-agregar");
  ok(/lleva 0 min \(su reloj cae a los 10\)/.test(await page.textContent("#pi-reloj-lista")), "cuenta los minutos contra el tiempo base del ritmo", await page.textContent("#pi-reloj"));
  await page.clock.fastForward("11:00");
  await page.waitForFunction(() => /su reloj cayó/.test(document.getElementById("pi-reloj-lista").textContent));
  ok(true, "a los 11 minutos dice que su reloj cayó, sin tocar nada");
  await page.click('#pi-reloj-lista button:has-text("Anotar la incomparecencia")');
  todos = await leerTodos(page);
  const R0 = todos.find((x) => x.idLista === mujeres.idLista).rondas[0];
  const mesa = R0.mesas.find((m) => m.b === quien || m.n === quien);
  igual("anotar la incomparecencia pone el resultado de la mesa", mesa.r, mesa.b === quien ? "-+" : "+-");
  ok(R0.incidencias.length === 1 && /no se presentó antes de que cayera su reloj/.test(R0.incidencias[0].texto), "y lo deja en las incidencias");

  console.log("\n=== Las incidencias ===");
  await page.selectOption("#pi-inc-tipo", "sancion");
  await page.selectOption("#pi-inc-mesa", "1");
  await page.fill("#pi-inc-texto", "PRUEBA anotó mal una jugada; se le amonestó.");
  await page.click("#pi-inc-anotar");
  ok(/Mesa 1 · Sanción: PRUEBA anotó mal una jugada/.test(await page.textContent("#pi-inc-lista")), "se anota con su mesa y su tipo");
  ok(await page.$eval("#pi-inc-texto", (x) => document.activeElement === x && x.value === ""), "y el cuadro queda vacío y con el foco, para la siguiente");
  await jugarRondas(page, "1-0");
  await page.selectOption("#pi-lista", abierto.idLista);
  await page.click('[data-ficha="rondas"]');
  await jugarRondas(page, "1-0");
  await page.selectOption("#pi-lista", equipos.idLista);
  await page.click('[data-ficha="rondas"]');
  await jugarRondas(page, "1-0");

  console.log("\n=== El medallero, las estadísticas y el informe ===");
  await page.click('[data-ficha="archivos"]');
  ok(await vis(page, "#pi-medallero"), "la tarjeta del evento trae el medallero");
  const filasMed = await page.$$eval("#pi-medallero tbody tr", (l) => l.map((x) => [...x.children].map((c) => c.textContent)));
  ok(filasMed.length >= 2 && filasMed.every((f) => /^LICEO/.test(f[1])), "una fila por centro", JSON.stringify(filasMed));
  const [dlE] = await Promise.all([page.waitForEvent("download"), page.click("#pi-evento-estadisticas")]);
  const est = fs.readFileSync(await dlE.path());
  ok(/estadisticas\.xlsx$/.test(dlE.suggestedFilename()) && est.slice(0, 2).toString() === "PK", "las estadísticas son un .xlsx", dlE.suggestedFilename());
  const [dlI] = await Promise.all([page.waitForEvent("download"), page.click("#pi-evento-informe")]);
  const inf = fs.readFileSync(await dlI.path()).toString("latin1");
  ok(inf.includes("Incidencias") && inf.includes("anot") && inf.includes("Medallero"), "el informe trae las incidencias y el medallero");
  todos = await leerTodos(page);
  const delEvento = todos.filter((x) => x.evento && x.evento.id === mujeres.evento.id);
  const vista = V.vistaEvento(mujeres.evento, delEvento.sort((a, b) => a.ordenEnEvento - b.ordenEnEvento));
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== Mi jugador ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#evento=prueba123"));
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  await page.evaluate((v) => window.__llega("pareo-evento-prueba123", "estado", v), vista);
  await page.waitForSelector("#pi-ver-buscar");
  // Una integrante de un equipo que juega la última ronda (con 3 equipos, uno descansa).
  const deEquipos = vista.torneos.find((x) => x.ronda && x.ronda.mesas.some((m) => m.tableros));
  const integrante = deEquipos.ronda.mesas.find((m) => m.tableros).tableros[1].n;
  await page.fill("#pi-ver-buscar", integrante.toLowerCase());
  const mio = await page.textContent("#pi-ver-mio");
  ok(mio.includes(integrante) && /Ronda 3, mesa \d/.test(mio) && /Tablero [1-4]/.test(mio) && /con (blancas|negras) contra PRUEBA/.test(mio), "encuentra a una integrante: su mesa, su tablero, su color y su rival", mio);
  await page.fill("#pi-ver-buscar", "prueba dos");
  ok(/PRUEBA DOS/.test(await page.textContent("#pi-ver-mio")) && /va de \d\.º con/.test(await page.textContent("#pi-ver-mio")), "y a alguien de individual, con cómo va en la clasificación", await page.textContent("#pi-ver-mio"));
  // Llega un resultado nuevo: PRUEBA DOS pasa a tener 9 puntos.
  const otra = JSON.parse(JSON.stringify(vista));
  for (const x of otra.torneos) for (const f of x.clasificacion) if (f.n === "PRUEBA DOS") f.pts = 9;
  await page.evaluate((v) => window.__llega("pareo-evento-prueba123", "estado", v), otra);
  igual("al llegar un resultado nuevo, lo buscado no se borra", await page.$eval("#pi-ver-buscar", (x) => x.value), "prueba dos");
  ok(/con 9 puntos/.test(await page.textContent("#pi-ver-mio")), "y la respuesta se pone al día sola", await page.textContent("#pi-ver-mio"));
  await page.fill("#pi-ver-buscar", "nadie así");
  ok(/No aparece/.test(await page.textContent("#pi-ver-mio")), "si no aparece, lo dice");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== La pantalla para proyectar ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#evento=prueba123&proyectar", (p) => p.clock.install()));
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir" && x.canal === "pareo-evento-prueba123"));
  await page.evaluate((v) => window.__llega("pareo-evento-prueba123", "estado", v), vista);
  await page.waitForSelector(".pi-proyector h1");
  const primero = await page.textContent(".pi-proyector h1");
  igual("muestra un torneo a la vez", primero, vista.torneos[0].nombre);
  await page.clock.fastForward(15000);
  await page.waitForFunction((n) => document.querySelector(".pi-proyector h1").textContent !== n, primero);
  igual("y a los 15 segundos pasa al siguiente", await page.textContent(".pi-proyector h1"), vista.torneos[1].nombre);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== La inscripción comparada con los clasificados ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE));
  await page.click('[data-ficha="jugadores"]');
  const clasificados = xlsx([V.ENCABEZADOS,
    ["PRUEBA ALA 1", "MUJER", "2013-05-05", "LICEO A", "Alajuela", "C", "Individual", "Mujeres", "", "", "1", "Regional", "DRE Alajuela"],
    ["PRUEBA ALA 2", "MUJER", "2013-05-06", "LICEO A", "Alajuela", "C", "Individual", "Mujeres", "", "", "2", "Regional", "DRE Alajuela"],
    ["PRUEBA AUSENTE", "HOMBRE", "2013-05-07", "LICEO A", "Alajuela", "C", "Individual", "Abierto", "", "", "1", "Regional", "DRE Alajuela"]]);
  const inscripcion = xlsx([["Nombre", "Sexo", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "FDN"],
    ["Prueba Ala 1", "MUJER", "LICEO A", "Alajuela", "C", "Individual", "Mujeres", "2013-05-05"],
    ["PRUEBA ALA 2", "MUJER", "LICEO A", "Alajuela", "C", "Individual", "Mujeres", "2013-05-06"],
    ["PRUEBA INTRUSA", "MUJER", "LICEO B", "Occidente", "C", "Individual", "Mujeres", "2013-05-08"],
    ["PRUEBA OCC", "HOMBRE", "LICEO B", "Occidente", "C", "Individual", "Abierto", "2013-05-09"]]);
  await page.setInputFiles("#pi-subir-lista", [{ name: "inscripcion.xlsx", mimeType: XLSX, buffer: inscripcion }, { name: "clasificados.xlsx", mimeType: XLSX, buffer: clasificados }]);
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  ok(/PRUEBA INTRUSA \(LICEO B\)/.test(await page.textContent("#pi-comp-no")), "avisa de quien se inscribió sin venir en los clasificados", await page.textContent("#pi-comparacion"));
  ok(/PRUEBA AUSENTE \(LICEO A\)/.test(await page.textContent("#pi-comp-faltan")), "y de quien clasificó y no viene");
  ok(/4 jugadores|3 jugadores|2 jugadores/.test(await page.textContent("#pi-sugerencia")) && !/PRUEBA AUSENTE/.test(await page.textContent("#pi-sugerencia fieldset")), "juega la inscripción: el que no viene no entra a ningún torneo");
  ok(/se propone la Etapa Interregional/.test(await page.textContent("#pi-sugerencia-siguiente")), "y se propone la etapa que sigue a la de los clasificados");
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "interregional", "III");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  todos = await leerTodos(page);
  const tmu = todos.find((x) => /Mujeres/.test(x.nombre));
  await page.selectOption("#pi-lista", tmu.idLista);
  await page.click('[data-ficha="rondas"]');
  ok(/PRUEBA INTRUSA \(LICEO B\) está inscrito pero no viene en los clasificados/.test(await page.textContent("#pi-revisar")), "queda para revisar antes de la ronda 1");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== Pasar lista en un suizo ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE));
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", Array.from({ length: 9 }, (_, i) => "PRUEBA SUIZO " + (i + 1) + ";Liceo " + (i % 3)).join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-asistencia summary");
  await page.check("#pi-asistencia-activar");
  await page.click("#pi-asistencia-todos");
  await page.click("#pi-asistencia li:nth-child(1) input");
  const ausente = await page.$eval("#pi-asistencia li label", (l) => l.textContent);
  igual("en un suizo, quien no llegó queda de entrada como «no viene»", await page.$eval(`#pi-ronda select[aria-label*="${ausente}"]`, (s) => s.value), "Z");
  await page.click("#pi-emparejar");
  await page.waitForFunction(() => document.querySelector("#pi-ronda table select"));
  const R = (await leerTodos(page))[0].rondas[0];
  const enMesa = R.mesas.flatMap((m) => [m.b, m.n]).filter(Boolean);
  const idAusente = (await leerTodos(page))[0].jugadores.find((j) => j.nombre === ausente).id;
  ok(!enMesa.includes(idAusente) && (R.ausencias || {})[idAusente] === "Z", "y no entra al pareo de la ronda 1");
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
