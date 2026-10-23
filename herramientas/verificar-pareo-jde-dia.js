/* Pareo Integral: el día del torneo y el paso de una etapa a otra en los JDE
 * (js/pareo/equipos.js, js/pareo/evento.js, js/pareo/ver.js y pareo.html).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - la hoja de alineación de cada equipo y los avisos de alineación
 *     (menos de dos, un tablero vacío, fuera de orden, alguien ajeno, el
 *     orden de tableros cambiado después de la ronda 1);
 *   - el mejor de cada tablero, sin contar las partidas no jugadas;
 *   - la lista de clasificados que dice de qué etapa viene, y al subirla, la
 *     etapa siguiente ya propuesta;
 *   - las listas de varias regionales juntas, con quien viene en dos;
 *   - el enlace en vivo de todo el evento (y quien lo abre, que pide el
 *     estado al entrar);
 *   - la premiación y los diplomas;
 *   - la revisión antes de la ronda 1, que no deja emparejar hasta marcarla;
 *   - el respaldo de todo el evento, que se abre en otra computadora.
 *
 * El canal en vivo se prueba con un doble de `window.sb` (nada sale a
 * Supabase): anota lo que se manda y deja disparar lo que llega.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-jde-dia.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const E = require(path.join(RAIZ, "js/pareo/equipos.js"));
const G = require(path.join(RAIZ, "js/pareo/grupos.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const TablaExcel = require(path.join(RAIZ, "js/tabla-excel.js"));
const { contestarEtapa } = require("./lib/pareo-etapa");
const P = require("./lib/pareo-pruebas");
const { XLSX, leerTodos, vis, anotar, jugarRondas } = P;
const abrirPagina = (browser, hash) => P.abrirPagina(browser, BASE, hash);

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const xlsx = (filas) => Buffer.from(TablaExcel.armar([{ nombre: "Hoja1", filas }]));

/* ==================================================================
   1. Sin navegador
   ================================================================== */
// Cuatro equipos de cuatro, todos contra todos. LICEO ALFA gana siempre el
// tablero 1 y lo demás son tablas: gana todos sus encuentros 2½ – 1½.
function torneoEquipos(alineacionDe) {
  const personas = [];
  for (const c of ["ALFA", "BETA", "GAMA", "DELTA"]) for (let i = 1; i <= 4; i++) personas.push({ id: c + i, nombre: "PRUEBA " + c + " " + i, institucion: "LICEO " + c, sexo: "m" });
  let k = 0;
  const eq = E.armarEquipos(personas, () => "q" + (++k));
  const t = T.nuevo({ tipo: "equipos", tableros: 4, jugadores: eq, sistema: "todos", grupo: "Equipos · Categoría C · Abierto", puntos: Object.assign({}, E.PUNTOS_EQUIPOS), desempates: ["PT", "DE", "SB"] });
  T.fijarNumeracion(t);
  E.fijarOrden(t);
  const alfa = eq.find((e) => e.nombre === "LICEO ALFA");
  for (let r = 0; r < T.rondasTodos(t); r++) {
    const R = T.rondaTodos(t, r);
    t.rondas.push(R);
    R.mesas.forEach((m, i) => {
      if (m.n === null) return;
      E.prepararMesa(t, m);
      if (alineacionDe) alineacionDe(t, m, r, i);
      for (const x of E.tablerosDe(t, m)) {
        if (x.fijo) continue;
        const blancas = x.bBlancas ? m.b : m.n;
        m.partidas[x.k].r = x.k === 0 && (m.b === alfa.id || m.n === alfa.id) ? (blancas === alfa.id ? "1-0" : "0-1") : "=";
      }
      m.r = E.resultadoEncuentro(t, m);
    });
  }
  return { t, alfa };
}

function pruebaSinNavegador() {
  console.log("\n=== El mejor de cada tablero ===");
  const { t, alfa } = torneoEquipos();
  const mt = E.mejoresTableros(t);
  igual("cuatro tableros, con el mínimo de la mitad de las rondas (2 de 3)", [mt.length, mt[0].minimo], [4, 2]);
  igual("el tablero 1 lo gana el de ALFA, 3 de 3", [mt[0].filas[0].nombre, mt[0].filas[0].puntos, mt[0].filas[0].jugadas, mt[0].filas[0].porcentaje], ["PRUEBA ALFA 1", 3, 3, 1]);
  ok(mt[0].filas[1].puesto === 2, "y el resto queda detrás");
  ok(mt[1].filas.length === 4 && mt[1].filas.every((f) => f.puesto === 1), "en el tablero 2, todo tablas: los cuatro empatados en el primer lugar");
  // Un encuentro con BETA de tres: el tablero 4 no se juega y no cuenta.
  const conVacio = torneoEquipos((tt, m, r) => {
    const beta = tt.jugadores.find((e) => e.nombre === "LICEO BETA");
    if (r === 0 && (m.b === beta.id || m.n === beta.id)) m.alineacion[m.b === beta.id ? "b" : "n"] = beta.integrantes.slice(0, 3).map((j) => j.id);
  }).t;
  const beta = conVacio.jugadores.find((e) => e.nombre === "LICEO BETA");
  const r0 = conVacio.rondas[0].mesas.find((m) => m.b === beta.id || m.n === beta.id);
  const rival = conVacio.jugadores.find((e) => e.id === (r0.b === beta.id ? r0.n : r0.b));
  const delRival = E.mejoresTableros(conVacio)[3].filas.find((f) => f.nombre === rival.integrantes[3].nombre);
  igual("el tablero 4 ganado porque el otro no vino no cuenta: 2 partidas, no 3", delRival && delRival.jugadas, 2);

  console.log("\n=== Los avisos de alineación ===");
  const ladoBeta = r0.b === beta.id ? "b" : "n";
  const avisos = (x) => E.avisosAlineacion(x, 0).filter((a) => a.equipo === beta.id).map((a) => a.tipo);
  igual("con tres: pierde el tablero de abajo", avisos(conVacio), ["incompleto"]);
  igual("y dice cuántos tableros pierde", E.avisosAlineacion(conVacio, 0).find((a) => a.tipo === "incompleto").pierde, 1);
  r0.alineacion[ladoBeta] = [beta.integrantes[0].id];
  igual("con uno: pierde el encuentro", avisos(conVacio), ["menos2"]);
  r0.alineacion[ladoBeta] = [beta.integrantes[2].id, beta.integrantes[0].id, beta.integrantes[1].id, beta.integrantes[3].id];
  igual("con el 3 arriba del 1: fuera del orden de tableros", avisos(conVacio), ["fueraDeOrden"]);
  r0.alineacion[ladoBeta] = beta.integrantes.slice(0, 3).map((j) => j.id).concat("alguien-de-otro-equipo");
  igual("con alguien que no es del equipo", avisos(conVacio), ["ajeno"]);
  r0.alineacion[ladoBeta] = beta.integrantes.slice(0, 4).map((j) => j.id);
  igual("con los cuatro en orden: nada que avisar", avisos(conVacio), []);
  const a1 = alfa.integrantes.shift(); alfa.integrantes.push(a1);
  ok(E.avisosAlineacion(t, 1).some((a) => a.tipo === "ordenCambiado" && a.equipo === alfa.id && a.mesa == null), "el orden de tableros cambiado después de la ronda 1");
  alfa.integrantes.unshift(alfa.integrantes.pop());

  console.log("\n=== La premiación y los diplomas ===");
  const evento = { id: "ev1", nombre: "JDE 2026 · Etapa Regional · DRE Alajuela", jde: { anio: 2026, etapa: "regional", lugar: "Alajuela" }, creado: "2026-10-21", decisiones: {} };
  const p = V.podio(t);
  igual("el oro para ALFA; los otros tres empatados en el segundo lugar, los tres con plata", p.filas.map((f) => f.medalla), ["Oro", "Plata", "Plata", "Plata"]);
  igual("el mejor del tablero 1, en el podio", p.tableros[0].filas.map((f) => f.nombre), ["PRUEBA ALFA 1"]);
  const texto = JSON.stringify(V.premiacion(evento, [t]).bloques);
  // (En tablas: medalla, lugar, equipo, integrantes, puntos; el mejor tablero en la suya.)
  ok(/\["Oro","Primer lugar","LICEO ALFA","PRUEBA ALFA 1, PRUEBA ALFA 2/.test(texto), "la premiación nombra al equipo y a sus integrantes", texto.slice(0, 300));
  ok(texto.indexOf("Plata") < texto.indexOf("Oro"), "del tercer lugar al primero, como se lee en el acto");
  ok(/\["Tablero 1","PRUEBA ALFA 1","LICEO ALFA","3 de 3","100 %"\]/.test(texto), "y el mejor de cada tablero");
  const dip = V.diplomas(evento, [t]);
  const deAlfa1 = dip.filter((d) => d.nombre === "PRUEBA ALFA 1").map((d) => d.lugar);
  igual("PRUEBA ALFA 1 lleva dos diplomas: primer lugar y mejor tablero 1", deAlfa1, ["Primer lugar", "Mejor tablero 1"]);
  igual("cada integrante del equipo campeón, el suyo", dip.filter((d) => d.lugar === "Primer lugar").length, 4);
  const td = V.textoDiploma(dip.find((d) => d.lugar === "Mejor tablero 1"));
  igual("lo que dice el diploma", td.motivo, "por ser el mejor tablero 1 con el equipo de LICEO ALFA en Equipos · Categoría C · Abierto.");
  igual("y el de un lugar", V.textoDiploma(dip[0]).motivo, "por obtener el primer lugar con el equipo de LICEO ALFA en Equipos · Categoría C · Abierto.");
  const vacio = T.nuevo({ jugadores: [{ id: "a", nombre: "A" }, { id: "b", nombre: "B" }], sistema: "todos" });
  igual("sin rondas, nadie a quien premiar", V.diplomas(evento, [vacio]).length, 0);

  console.log("\n=== La revisión antes de la ronda 1 ===");
  const conRevisar = Object.assign({}, t, { evento: { decisiones: { revisar: [
    { tipo: "hombre", personas: ["PRUEBA ALFA 2"], vars: {} },
    { tipo: "hombre", personas: ["Prueba Alfa 3"], vars: {} },
    { tipo: "hombre", personas: ["ALGUIEN DE OTRO TORNEO"], vars: {} },
  ] } } });
  igual("solo lo de quienes juegan en este torneo (sin importar tildes ni mayúsculas)", V.pendientes(conRevisar).map((x) => x.personas[0]), ["PRUEBA ALFA 2", "Prueba Alfa 3"]);
  igual("un torneo sin evento no tiene nada que revisar", V.pendientes(vacio), []);

  console.log("\n=== La etapa siguiente y las listas de varias regionales ===");
  igual("de una lista de la Regional, la Interregional", V.siguienteDe(["regional", "regional"]), { desde: "regional", etapa: "interregional" });
  igual("de la Institucional, la Regional", V.siguienteDe(["institucional"]), { desde: "institucional", etapa: "regional" });
  igual("de la Interregional no se propone nada: la Nacional no se arma acá", V.siguienteDe(["interregional"]), null);
  igual("si una fila no dice de dónde viene, tampoco", V.siguienteDe(["regional", ""]), null);
  igual("la columna Etapa se lee", [G.leerEtapa("Regional"), G.leerEtapa("Etapa Interregional"), G.leerEtapa("otra")], ["regional", "interregional", ""]);
  const persona = (region, origen) => ({ nombre: "PRUEBA DOBLE", nacimiento: "2013-01-01", region, origen, modalidad: "individual", categoria: "C" });
  const dos = G.quitarRepetidos([persona("Alajuela", "a.xlsx"), persona("Occidente", "b.xlsx")]);
  igual("viene en dos Direcciones Regionales: se avisa", dos.variosOrigenes.map((x) => x.origenes), [["Alajuela", "Occidente"]]);
  igual("y queda una sola inscripción", dos.lista.length, 1);
  igual("repetida en la misma regional no es lo mismo: no se avisa como de dos", G.quitarRepetidos([persona("Alajuela", "a.xlsx"), persona("Alajuela", "a.xlsx")]).variosOrigenes.length, 0);
  const filas = V.filasClasificados(evento, [t]);
  igual("la lista de clasificados dice de qué etapa y de dónde viene", V.ENCABEZADOS.slice(-2).concat(filas[0].slice(-2)), ["Etapa", "Lugar", "Regional", "DRE Alajuela"]);

  console.log("\n=== El respaldo y la vista del evento ===");
  const r = V.respaldo(evento, [t, vacio]);
  ok(V.esRespaldo(JSON.parse(JSON.stringify(r))), "el respaldo se reconoce");
  ok(!V.esRespaldo({ formato: V.FORMATO_RESPALDO, torneos: [{ nombre: "x" }] }), "y uno roto, no");
  const vista = V.vistaEvento(evento, [t]);
  igual("la vista del evento trae cada torneo, su ronda y su clasificación con nombres", [vista.torneos.length, vista.torneos[0].ronda.n, vista.torneos[0].clasificacion[0].n], [1, 3, "LICEO ALFA"]);
}

/* ==================================================================
   2. En la página
   ================================================================== */
// La inscripción de una regional: cuatro mujeres y un hombre anotado en el
// torneo de mujeres (individual C), y tres equipos de cuatro (abierto C).
function excelRegional() {
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "FDN"]];
  ["UNA", "DOS", "TRES", "CUATRO"].forEach((n, i) => filas.push(["PRUEBA " + n, "MUJER", "LICEO " + (i % 2 ? "NORTE" : "SUR"), "Alajuela", "C", "Individual", "Mujeres", "2013-0" + (i + 1) + "-10"]));
  filas.push(["PRUEBA HOMBRE ANOTADO", "HOMBRE", "LICEO OESTE", "Alajuela", "C", "Individual", "Mujeres", "2013-06-10"]);
  for (const c of ["NORTE", "SUR", "ESTE"]) for (let i = 1; i <= 4; i++) filas.push(["PRUEBA " + c + " " + i, "HOMBRE", "LICEO " + c, "Alajuela", "C", "Equipo", "Abierto", "2013-07-0" + i]);
  return xlsx(filas);
}

async function pruebaPagina(browser) {
  let { ctx, page, errores } = await abrirPagina(browser);
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", { name: "regional.xlsx", mimeType: XLSX, buffer: excelRegional() });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "regional", "Alajuela");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  let todos = await leerTodos(page);
  const mujeres = todos.find((x) => /Mujeres/.test(x.nombre));
  const equipos = todos.find((x) => x.tipo === "equipos");
  igual("el evento guarda lo que hay que revisar: el hombre en el torneo de mujeres", mujeres.evento.decisiones.revisar.map((x) => [x.tipo, x.personas]), [["hombre", ["PRUEBA HOMBRE ANOTADO"]]]);

  console.log("\n=== Antes de la ronda 1: revisar ===");
  await page.click('[data-ficha="archivos"]');
  await page.selectOption("#pi-lista", equipos.idLista);
  ok(/hay puntos por revisar/.test(await page.textContent("#pi-evento-revisar")) && /Mujeres: 1/.test(await page.textContent("#pi-evento-revisar")),
    "la tarjeta del evento dice qué torneo tiene puntos sin revisar", await page.textContent("#pi-evento").catch(() => ""));
  await page.selectOption("#pi-lista", mujeres.idLista);
  await page.click('[data-ficha="rondas"]');
  ok(await vis(page, "#pi-revisar") && /PRUEBA HOMBRE ANOTADO/.test(await page.textContent("#pi-revisar")), "en Rondas, el punto por revisar, con el nombre");
  ok(await page.$eval("#pi-emparejar", (b) => b.disabled), "y hasta marcarlo no se empareja");
  ok(/Falta 1 punto por marcar/.test(await page.textContent("#pi-revisar-estado")), "lo dice escrito, no solo con el botón apagado");
  await page.check("#pi-revisar-0");
  ok(!(await page.$eval("#pi-emparejar", (b) => b.disabled)) && /Todo revisado/.test(await page.textContent("#pi-revisar-estado")), "marcado como visto, ya se empareja");
  todos = await leerTodos(page);
  igual("lo visto queda guardado en el torneo", todos.find((x) => x.idLista === mujeres.idLista).revisadoAntes, ["hombre|PRUEBA HOMBRE ANOTADO"]);
  await jugarRondas(page, "1-0");

  console.log("\n=== La alineación de cada ronda ===");
  await page.selectOption("#pi-lista", equipos.idLista);
  ok(!(await page.$("#pi-revisar")), "el torneo de equipos no tiene nada que revisar");
  await page.click('#pi-ronda button:has-text("Emparejar la ronda 1")');
  await page.waitForFunction(() => document.querySelector("#pi-ronda section"));
  todos = await leerTodos(page);
  const tEq = todos.find((x) => x.idLista === equipos.idLista);
  ok(tEq.ordenTableros && Object.keys(tEq.ordenTableros).length === 3, "al emparejar la ronda 1 queda anotado el orden de tableros de cada equipo");
  const i = tEq.rondas[0].mesas.findIndex((m) => m.n);
  ok(!(await page.$(`#pi-enc-${i}-avisos`)), "con los cuatro en orden, ningún aviso");
  await page.click(`#pi-enc-${i}-b-3`);
  ok(/juega con 3: pierde por incomparecencia 1 tablero/.test(await page.textContent(`#pi-enc-${i}-avisos`)), "con tres, el aviso del tablero que se pierde", await page.textContent(`#pi-enc-${i}`).catch(() => ""));
  await page.click(`#pi-enc-${i}-b-3`);
  await page.click("#pi-alineaciones");
  const hojas = await page.$$eval("#pi-firmas .pi-firma-mesa", (l) => l.map((x) => x.textContent));
  igual("una hoja de alineación por equipo en cada encuentro (3 equipos: un encuentro y uno libre)", hojas.length, 2);
  ok(/Alineación · Ronda 1 · Mesa/.test(hojas[0]) && /☐  Tablero 1: PRUEBA/.test(hojas[0]) && /Firma del capitán/.test(hojas[0]) && /Hora de entrega/.test(hojas[0]), "con la casilla de cada integrante, la firma y la hora", hojas[0]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await anotar(page, "1-0");
  await jugarRondas(page, "1-0");

  console.log("\n=== El mejor tablero en la clasificación ===");
  await page.click('[data-ficha="clasificacion"]');
  ok(await vis(page, "#pi-clas-tableros"), "se ve el mejor tablero");
  igual("una tabla por tablero", await page.$$eval("#pi-clas-tableros table", (l) => l.length), 4);

  console.log("\n=== La premiación y los diplomas ===");
  await page.click('[data-ficha="archivos"]');
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.click("#pi-evento-premiacion")]);
  const textoPdf = fs.readFileSync(await pdf.path()).toString("latin1");
  ok(textoPdf.startsWith("%PDF-") && textoPdf.includes("Premiaci") && textoPdf.includes("Oro") && /premiacion\.pdf$/.test(pdf.suggestedFilename()), "la premiación es un PDF con las medallas", pdf.suggestedFilename());
  await page.click("#pi-evento-diplomas");
  const diplomas = await page.$$eval("#pi-firmas .pi-diploma", (l) => l.map((x) => x.textContent));
  ok(diplomas.length >= 3 && diplomas.every((d) => /Se otorga el presente reconocimiento a/.test(d)), "un diploma por persona premiada", diplomas.length);
  ok(diplomas.some((d) => /por obtener el primer lugar en Individual · Mujeres\./.test(d)), "con lo que ganó y en qué torneo", diplomas[0]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

  console.log("\n=== El evento en vivo ===");
  await page.click("#pi-evento-vivo");
  await page.waitForSelector("#pi-evento-url");
  const url = await page.textContent("#pi-evento-url");
  ok(/pareo\.html#evento=[a-z0-9]{8}$/.test(url), "un enlace para todo el evento", url);
  ok(await page.$eval("#pi-evento-qr svg", (s) => !!s), "con su código QR");
  const codigo = url.split("#evento=")[1];
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "estado"));
  let enviado = await page.evaluate(() => window.__enviados.filter((x) => x.evento === "estado").pop());
  igual("al prenderlo manda todo el evento por su canal", [enviado.canal, enviado.payload.torneos.length], ["pareo-evento-" + codigo, 2]);
  const antes = await page.evaluate(() => window.__enviados.length);
  await page.evaluate((c) => window.__llega("pareo-evento-" + c, "pedir", {}), codigo);
  ok(await page.evaluate((n) => window.__enviados.length > n, antes), "y vuelve a mandarlo cuando alguien lo pide al entrar");
  await page.click('[data-ficha="rondas"]');
  const antes2 = await page.evaluate(() => window.__enviados.length);
  await page.selectOption("#pi-ronda select", "0-1");
  // El envío sale un instante después de anotar: con el CI cargado, leerlo enseguida
  // fallaba a veces. Si en 5 s no salió, sigue fallando.
  const salio = await page.waitForFunction((n) => window.__enviados.length > n, antes2, { timeout: 5000 }).then(() => true, () => false);
  ok(salio, "cada resultado que se anota también sale");
  await page.click('[data-ficha="archivos"]');
  ok(/Apagar/.test(await page.textContent("#pi-evento-vivo")), "el botón dice que está prendido");

  console.log("\n=== El respaldo del evento ===");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#pi-evento-respaldo")]);
  const respaldo = fs.readFileSync(await dl.path());
  const datos = JSON.parse(respaldo.toString("utf8"));
  ok(/respaldo\.json$/.test(dl.suggestedFilename()) && datos.formato === "pareo-integral-evento" && datos.torneos.length === 2, "un solo archivo con los dos torneos", dl.suggestedFilename());
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  ({ ctx, page, errores } = await abrirPagina(browser));
  await page.click('[data-ficha="archivos"]');
  const abrirRespaldo = () => page.setInputFiles("#pi-abrir", { name: "respaldo.json", mimeType: "application/json", buffer: respaldo });
  await abrirRespaldo();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("pareo_lista_v1") || "[]").length >= 3);
  todos = await leerTodos(page);
  const delEvento = todos.filter((x) => x.evento && x.evento.id === datos.evento.id);
  igual("en otra computadora se abren los dos torneos, con sus rondas", delEvento.map((x) => x.rondas.length > 0), [true, true]);
  ok(await vis(page, "#pi-evento") && /2 torneos/.test(await page.textContent("#pi-evento")), "y la tarjeta del evento los reconoce juntos");
  await abrirRespaldo();
  await page.waitForSelector('dialog[data-avisos="confirmar"][open]');
  ok(/ya están 2 torneos de este evento/.test(await page.textContent('dialog[data-avisos="confirmar"][open]')), "abrirlo otra vez pregunta antes de reemplazar");
  await page.click('dialog[data-avisos="confirmar"][open] [data-avisos-aceptar]');
  await page.waitForFunction(() => !document.querySelector('dialog[data-avisos="confirmar"][open]'));
  todos = await leerTodos(page);
  igual("y no los duplica", todos.filter((x) => x.evento && x.evento.id === datos.evento.id).length, 2);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== Lo que ve el público ===");
  ({ ctx, page, errores } = await abrirPagina(browser, "#evento=prueba123"));
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  ok(true, "al entrar, pide el estado");
  const vista = V.vistaEvento(datos.evento, datos.torneos);
  await page.evaluate((v) => window.__llega("pareo-evento-prueba123", "estado", v), vista);
  await page.waitForSelector("#pi-ver details");
  igual("un desplegable por torneo", await page.$$eval("#pi-ver details", (l) => l.length), 2);
  ok(/Etapa Regional · DRE Alajuela/.test(await page.textContent("#pi-ver h1")), "con el nombre del evento");
  ok(!(await vis(page, "#pi-editor")), "y sin el editor");
  await page.click("#pi-ver details summary");
  await page.evaluate((v) => window.__llega("pareo-evento-prueba123", "estado", v), vista);
  ok(await page.$eval("#pi-ver details", (d) => d.open), "el torneo que se abrió sigue abierto al llegar un resultado nuevo");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== La Interregional: los clasificados de dos regionales ===");
  ({ ctx, page, errores } = await abrirPagina(browser));
  await page.click('[data-ficha="jugadores"]');
  const fila = (n, sexo, centro, dre, torneo) => [n, sexo, "2013-05-05", centro, dre, "C", "Individual", torneo, "", "", "1", "Regional", "DRE " + dre];
  const alajuela = xlsx([V.ENCABEZADOS, fila("PRUEBA ALA 1", "MUJER", "LICEO A", "Alajuela", "Mujeres"), fila("PRUEBA ALA 2", "MUJER", "LICEO A", "Alajuela", "Mujeres"), fila("PRUEBA REPETIDA", "MUJER", "LICEO X", "Alajuela", "Mujeres")]);
  const occidente = xlsx([V.ENCABEZADOS, fila("PRUEBA OCC 1", "MUJER", "LICEO O", "Occidente", "Mujeres"), fila("PRUEBA REPETIDA", "MUJER", "LICEO X", "Occidente", "Mujeres"), fila("PRUEBA OCC 2", "HOMBRE", "LICEO O", "Occidente", "Abierto")]);
  await page.setInputFiles("#pi-subir-lista", [{ name: "alajuela.xlsx", mimeType: XLSX, buffer: alajuela }, { name: "occidente.xlsx", mimeType: XLSX, buffer: occidente }]);
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  ok(/clasificados de la Etapa Regional: al crear los torneos se propone la Etapa Interregional/.test(await page.textContent("#pi-sugerencia-siguiente")), "reconoce la lista de clasificados y propone la etapa que sigue");
  ok(/PRUEBA REPETIDA \(LICEO X\) viene en Alajuela y Occidente/.test(await page.textContent("#pi-varios-origenes")), "avisa de quien viene en las dos listas", await page.textContent("#pi-sugerencia"));
  await page.click("#pi-sugerencia-crear");
  const dialogo = 'dialog[data-avisos="formulario"][open]';
  await page.waitForSelector(dialogo);
  igual("la etapa viene elegida: la Interregional", await page.$eval(dialogo + ' select[name="etapa"]', (s) => s.value), "interregional");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction((d) => { const x = document.querySelector(d); return x && x.querySelector('[name="lugar"]'); }, dialogo);
  igual("y el lugar: la III, la de Alajuela y Occidente", await page.$eval(dialogo + ' [name="lugar"]', (s) => s.value), "III");
  // Otra interregional: pregunta, y se cancela.
  await page.selectOption(dialogo + ' [name="lugar"]', "I");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForSelector('dialog[data-avisos="confirmar"][open]');
  ok(/Alajuela, Occidente, que no es de la Interregional I/.test(await page.textContent('dialog[data-avisos="confirmar"][open]')), "con otra interregional, pregunta antes de crear");
  await page.click('dialog[data-avisos="confirmar"][open] [data-avisos-cancelar]');
  ok(await vis(page, "#pi-sugerencia"), "y al cancelar no crea nada");
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "interregional", "III");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  todos = await leerTodos(page);
  const tm = todos.find((x) => /Mujeres/.test(x.nombre));
  ok(/^JDE 2026 · Etapa Interregional · Interregional III/.test(tm.nombre), "el torneo queda en la Interregional III", tm.nombre);
  await page.selectOption("#pi-lista", tm.idLista);
  await page.click('[data-ficha="rondas"]');
  ok(/PRUEBA REPETIDA \(LICEO X\) venía en dos listas/.test(await page.textContent("#pi-revisar")), "y quien venía en dos listas queda para revisar antes de la ronda 1");
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
