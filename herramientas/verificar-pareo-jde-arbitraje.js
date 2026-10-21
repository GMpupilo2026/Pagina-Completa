/* Pareo Integral: el trabajo del árbitro en los JDE (js/pareo/equipos.js,
 * js/pareo/evento.js, js/pareo/pagina.js, js/pareo/ver.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - el TRF de equipos de FIDE, partida por partida;
 *   - el desempate del corte, que ordena a los empatados (y deja de valer
 *     si el empate ya no existe);
 *   - corregir una ronda cerrada pide el motivo y lo deja en las
 *     incidencias; las apelaciones, con quién la presenta y su resolución;
 *   - los árbitros adjuntos anotan desde el celular: solo la última ronda,
 *     una mesa sin resultado y un resultado válido;
 *   - el aviso de la ronda atrasada;
 *   - el horario del día;
 *   - «Avisarme» cuando sale la ronda de quien se busca, y las rondas
 *     anteriores en el enlace del evento;
 *   - el informe por Dirección Regional y las constancias de participación.
 *
 * El canal en vivo, con el doble de `window.sb` (herramientas/lib/pareo-pruebas.js);
 * el tiempo, con el reloj de Playwright.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-jde-arbitraje.js
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
function pruebaSinNavegador() {
  console.log("\n=== El TRF de equipos de FIDE ===");
  const personas = [];
  for (const c of ["ALFA", "BETA"]) for (let i = 1; i <= 5; i++) personas.push({ id: c + i, nombre: "PRUEBA " + c + " " + i, institucion: "LICEO " + c, sexo: "m" });
  let k = 0;
  const te = T.nuevo({ nombre: "Prueba equipos", tipo: "equipos", tableros: 4, jugadores: E.armarEquipos(personas, () => "q" + (++k)), sistema: "todos", puntos: Object.assign({}, E.PUNTOS_EQUIPOS), desempates: ["PT"] });
  T.fijarNumeracion(te);
  const R = T.rondaTodos(te, 0);
  te.rondas.push(R);
  const m = R.mesas[0];
  E.prepararMesa(te, m);
  // El de la izquierda juega con tres: el tablero 4 lo gana el otro sin jugar.
  m.alineacion.b = m.alineacion.b.slice(0, 3);
  m.partidas[0].r = "1-0"; m.partidas[1].r = "="; m.partidas[2].r = "0-1";
  m.r = E.resultadoEncuentro(te, m);
  const trf = E.aTrfEquipos(te).split("\r\n").filter(Boolean);
  const l001 = trf.filter((l) => l.startsWith("001 "));
  const l013 = trf.filter((l) => l.startsWith("013 "));
  igual("una línea 001 por integrante (5 + 5) y una 013 por equipo", [l001.length, l013.length], [10, 2]);
  ok(trf.includes("092 Team: Round-Robin"), "dice que es un torneo por equipos");
  const izq = te.jugadores.find((e) => e.id === m.b), der = te.jugadores.find((e) => e.id === m.n);
  const numDe = (nombre) => Number(l001.find((l) => l.includes(nombre)).slice(4, 8));
  const linea = (nombre) => l001.find((l) => l.includes(nombre));
  ok(new RegExp(" " + String(numDe(der.integrantes[0].nombre)).padStart(4) + " w 1$").test(linea(izq.integrantes[0].nombre)), "el tablero 1: el de la izquierda con blancas, gana", linea(izq.integrantes[0].nombre));
  ok(new RegExp(" " + String(numDe(izq.integrantes[1].nombre)).padStart(4) + " w =$").test(linea(der.integrantes[1].nombre)), "el tablero 2: el de la derecha con blancas, tablas", linea(der.integrantes[1].nombre));
  ok(/ 0000 - \+$/.test(linea(der.integrantes[3].nombre)), "el tablero 4, sin rival: gana sin jugar («0000 - +»)", linea(der.integrantes[3].nombre));
  // Hasta la columna 89 van los datos del jugador; después, las rondas.
  ok(linea(izq.integrantes[4].nombre).length <= 89, "el suplente que no jugó va en blanco", linea(izq.integrantes[4].nombre));
  const n013 = l013.find((l) => l.includes(izq.nombre));
  igual("la línea 013 trae los números de sus 5 integrantes", n013.slice(36).trim().split(/\s+/).map(Number), izq.integrantes.map((j) => numDe(j.nombre)));

  console.log("\n=== El desempate del corte ===");
  const jugadores = ["Ana", "Bea", "Cira", "Dina"].map((n, i) => ({ id: "j" + i, nombre: n, institucion: "Liceo " + i, region: i < 2 ? "Alajuela" : "Occidente" }));
  const t = T.nuevo({ sistema: "todos", jugadores, desempates: ["DE"], grupo: "Individual · Mujeres", fechaInicio: "2026-11-02" });
  T.fijarNumeracion(t);
  for (let r = 0; r < 3; r++) { const RR = T.rondaTodos(t, r); RR.mesas.forEach((x) => { x.r = "="; }); t.rondas.push(RR); }
  igual("todas tablas: los cuatro empatados en el corte", V.empatadosEnCorte(t, 2).length, 4);
  ok(V.clasificados(t, 2).empate, "y el empate se avisa");
  t.desempateCorte = { formato: "Blitz 3 + 2", orden: ["j3", "j1", "j0", "j2"] };
  const c = V.clasificados(t, 2);
  igual("con el desempate, clasifican los dos primeros del desempate", c.filas.map((f) => f.id), ["j3", "j1"]);
  ok(!c.empate, "y ya no hay empate en el corte");
  ok(/Desempate del corte \(Blitz 3 \+ 2\): 1\. Dina, 2\. Bea/.test(textoDe(V.informe({ nombre: "E", jde: { etapa: "regional", lugar: "Nicoya" } }, [t]))), "el informe dice cómo se desempató");
  t.rondas[2].mesas[0].r = "1-0";
  ok(!V.clasificados(t, 2).filas.some((f) => f.porDesempate), "si una corrección deshace el empate, el desempate deja de valer");
  t.rondas[2].mesas[0].r = "=";

  console.log("\n=== Por Dirección Regional y las constancias ===");
  const dre = V.porDireccion([t], 2);
  igual("estudiantes por Dirección Regional", dre.map((x) => [x.region, x.estudiantes]).sort(), [["Alajuela", 2], ["Occidente", 2]]);
  igual("y cuántos clasifican de cada una", dre.reduce((a, x) => a + x.clasifican, 0), 2);
  const cons = V.constancias({ nombre: "JDE 2026 · Etapa Interregional" }, [t]);
  igual("una constancia por estudiante que jugó", cons.length, 4);
  igual("lo que dice", V.textoConstancia(cons[0]).motivo, "participó en Individual · Mujeres, el 2 de noviembre de 2026.");
  igual("sin rondas jugadas, ninguna", V.constancias({ nombre: "E" }, [T.nuevo({ jugadores, sistema: "todos" })]).length, 0);

  console.log("\n=== El horario del día ===");
  igual("lo que dura una ronda: el tiempo de los dos y 40 jugadas de incremento, redondeado a 5", ["10 min + 2 s", "90 min + 30 s", "15+10", ""].map(V.duracionRonda), [25, 220, 45, 0]);
  const h = V.horario([Object.assign({}, t, { ritmo: "10 min + 2 s" })], "08:30", 10);
  igual("las horas de cada ronda", h[0].rondas.map((x) => x.hora), ["08:30", "09:05", "09:40"]);
  igual("una hora mal escrita no arma nada", V.horario([t], "ocho", 10), []);

  console.log("\n=== Las apelaciones en el informe ===");
  t.rondas[0].incidencias = [{ hora: Date.UTC(2026, 10, 2, 15, 0), mesa: 1, tipo: "apelacion", texto: "Reclama tablas por repetición.", presenta: "Delegado del Liceo 0", resolucion: "" }];
  ok(/Apelación: Reclama tablas por repetición\. Presenta: Delegado del Liceo 0\. Resolución: pendiente\./.test(textoDe(V.informe({ nombre: "E" }, [t]))), "con quién la presenta y la resolución pendiente");

  console.log("\n=== Las rondas anteriores en la vista ===");
  const vt = V.vistaTorneo(t);
  igual("la vista trae las rondas anteriores", vt.anteriores.map((x) => x.n), [1, 2]);
}

/* ==================================================================
   2. En la página
   ================================================================== */
function excelRegional() {
  const filas = [["Nombre", "Sexo", "Nombre de Centro Educativo", "Dirección Regional", "Categoría", "Equipo/Ind", "Torneo", "FDN"]];
  for (let i = 1; i <= 9; i++) filas.push(["PRUEBA MUJER " + i, "MUJER", "LICEO " + i, i % 2 ? "Alajuela" : "Occidente", "C", "Individual", "Mujeres", "2013-01-0" + i]);
  for (let i = 1; i <= 3; i++) filas.push(["PRUEBA HOMBRE " + i, "HOMBRE", "LICEO " + i, "Alajuela", "C", "Individual", "Abierto", "2013-02-0" + i]);
  return xlsx(filas);
}
const dialogo = 'dialog[data-avisos="formulario"][open]';

async function pruebaPagina(browser) {
  let { ctx, page, errores } = await P.abrirPagina(browser, BASE, "", (p) => p.clock.install());
  await page.click('[data-ficha="torneo"]');
  await page.fill('#pi-form-torneo [name="ritmo"]', "10 min + 2 s");
  await page.press('#pi-form-torneo [name="ritmo"]', "Tab");
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", { name: "inter.xlsx", mimeType: XLSX, buffer: excelRegional() });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  // Sin la configuración de los JDE: el de 9 queda en suizo de 7 rondas (lo
  // que trae el torneo abierto).
  await page.uncheck("#pi-config-jde");
  await page.click("#pi-sugerencia-crear");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  let todos = await leerTodos(page);
  const mujeres = todos.find((x) => /Mujeres/.test(x.nombre));
  await page.selectOption("#pi-lista", mujeres.idLista);
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForFunction(() => document.querySelector("#pi-ronda table select"));

  console.log("\n=== El árbitro adjunto anota desde el celular ===");
  await page.click("#pi-adjunto");
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="desde"]', "1");
  await page.fill(dialogo + ' [name="hasta"]', "2");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForSelector(".pi-adjunto-url");
  const url = await page.textContent(".pi-adjunto-url");
  ok(/#adjunto=[a-z0-9]{8}&m=1-2$/.test(url), "un enlace con el código y las mesas", url);
  const codigo = url.split("#adjunto=")[1].split("&")[0];
  const canal = "pareo-adjunto-" + codigo;
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.evento === "estado"), canal);
  const llega = (p) => page.evaluate(([c, x]) => window.__llega(c, "resultado", x), [canal, p]);
  await llega({ ronda: 1, mesa: 1, r: "1-0" });
  todos = await leerTodos(page);
  let R = todos.find((x) => x.idLista === mujeres.idLista).rondas[0];
  igual("un resultado del adjunto entra a su mesa, marcado", [R.mesas[0].r, R.mesas[0].porAdjunto], ["1-0", true]);
  ok(/lo anotó el adjunto/.test(await page.textContent("#pi-ronda")), "y la ronda lo dice");
  await llega({ ronda: 1, mesa: 1, r: "0-1" });
  await llega({ ronda: 1, mesa: 2, r: "gana" });
  await llega({ ronda: 2, mesa: 2, r: "1-0" });
  todos = await leerTodos(page);
  R = todos.find((x) => x.idLista === mujeres.idLista).rondas[0];
  igual("nunca pisa un resultado que ya está, ni acepta uno inválido o de otra ronda", [R.mesas[0].r, R.mesas[1].r], ["1-0", null]);
  await llega({ ronda: 1, mesa: 3, r: "1-0" });
  todos = await leerTodos(page);
  igual("ni una mesa fuera de su rango (1-2)", todos.find((x) => x.idLista === mujeres.idLista).rondas[0].mesas[2].r, null);
  // Apagar el enlace: avisa al celular y ya no acepta nada.
  await page.click('#pi-adjunto-caja [data-apagar="' + codigo + '"]');
  await page.waitForSelector('dialog[data-avisos="confirmar"][open]');
  await page.click('dialog[data-avisos="confirmar"][open] [data-avisos-aceptar]');
  await page.waitForFunction((c) => window.__enviados.some((x) => x.canal === c && x.payload && x.payload.apagado), canal);
  ok(true, "apagar el enlace le avisa al celular del adjunto");
  await llega({ ronda: 1, mesa: 2, r: "1-0" });
  todos = await leerTodos(page);
  igual("y ya no acepta resultados", todos.find((x) => x.idLista === mujeres.idLista).rondas[0].mesas[1].r, null);

  console.log("\n=== La ronda atrasada ===");
  await page.click("#pi-reloj-empezar");
  await page.clock.fastForward("26:00");
  await page.waitForFunction(() => /siguen jugando las mesas/.test(document.getElementById("pi-reloj-atrasada").textContent));
  ok(/con este ritmo dura unos 25\): siguen jugando las mesas 2, 3, 4/.test(await page.textContent("#pi-reloj-atrasada")), "pasados los 25 minutos, dice qué mesas siguen jugando", await page.textContent("#pi-reloj-atrasada"));
  await anotar(page, "1-0");
  ok(await page.$eval("#pi-reloj-atrasada", (x) => x.hidden || !x.textContent), "con todas anotadas, el aviso se va");

  console.log("\n=== Corregir una ronda cerrada ===");
  await page.click(`#pi-rondas-nav button:has-text("Ronda 2")`);
  await page.click("#pi-emparejar");
  await page.waitForFunction(() => document.querySelector("#pi-ronda table select"));
  await page.click(`#pi-rondas-nav button:has-text("Ronda 1")`);
  await page.selectOption("#pi-ronda table select", "0-1");
  await page.waitForSelector(dialogo);
  ok(/pasa de 1-0 a 0-1/.test(await page.textContent(dialogo)), "pide el motivo, diciendo de qué a qué", await page.textContent(dialogo));
  await page.click(dialogo + " [data-avisos-cancelar]");
  // El select vuelve a su valor cuando la página termina de atender el diálogo.
  await page.waitForFunction(() => !document.querySelector('dialog[data-avisos="formulario"][open]') && document.querySelector("#pi-ronda table select").value === "1-0", null, { timeout: 5000 }).catch(() => {});
  igual("al cancelar, el resultado no cambia", await page.$eval("#pi-ronda table select", (s) => s.value), "1-0");
  igual("ni en lo guardado", (await leerTodos(page)).find((x) => x.idLista === mujeres.idLista).rondas[0].mesas[0].r, "1-0");
  await page.selectOption("#pi-ronda table select", "0-1");
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="motivo"]', "Las planillas firmadas dicen 0-1.");
  await page.click(dialogo + " [data-avisos-aceptar]");
  todos = await P.esperarGuardado(page, (l, id) => l.find((x) => x.idLista === id).rondas[0].mesas[0].r === "0-1", mujeres.idLista);
  R = todos.find((x) => x.idLista === mujeres.idLista).rondas[0];
  igual("con el motivo, cambia", R.mesas[0].r, "0-1");
  ok(R.incidencias.some((x) => x.tipo === "correccion" && /de 1-0 a 0-1\. Motivo: Las planillas firmadas dicen 0-1\./.test(x.texto)), "y queda en las incidencias", JSON.stringify(R.incidencias));

  console.log("\n=== Una apelación ===");
  await page.selectOption("#pi-inc-tipo", "apelacion");
  ok(await vis(page, "#pi-inc-presenta"), "pide quién la presenta");
  await page.fill("#pi-inc-texto", "Reclama la corrección de la mesa 1.");
  await page.click("#pi-inc-anotar");
  ok(/Escribe quién presenta/.test(await page.textContent("body")), "sin quién la presenta no se anota");
  await page.fill("#pi-inc-presenta", "Delegada del Liceo 1");
  await page.click("#pi-inc-anotar");
  ok(/Presenta: Delegada del Liceo 1\. Resolución: pendiente\./.test(await page.textContent("#pi-inc-lista")), "queda pendiente de resolver");
  await page.click('#pi-inc-lista button:has-text("Anotar la resolución")');
  await page.waitForSelector(dialogo);
  await page.fill(dialogo + ' [name="resolucion"]', "Se mantiene el 0-1.");
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction(() => /Resolución: Se mantiene el 0-1\./.test(document.getElementById("pi-inc-lista").textContent));
  ok(true, "y se anota lo que resolvió el comité");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== La página del adjunto ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#adjunto=prueba123&m=2-3"));
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir" && x.canal === "pareo-adjunto-prueba123"));
  const estadoAdj = { nombre: "Prueba", ronda: 1, mesas: [
    { m: 1, b: "A", n: "B", r: null }, { m: 2, b: "C", n: "D", r: "1-0" }, { m: 3, b: "E", n: "F", r: null }, { m: 4, b: "G", n: null, r: "bye" }] };
  await page.evaluate((x) => window.__llega("pareo-adjunto-prueba123", "estado", x), estadoAdj);
  await page.waitForSelector("#pi-ver [data-mesa]");
  igual("solo sus mesas", await page.$$eval("#pi-ver [data-mesa]", (l) => l.map((x) => x.dataset.mesa)), ["2", "3"]);
  ok(/Anotada: 1-0/.test(await page.textContent('#pi-ver [data-mesa="2"]')) && !(await page.$('#pi-ver [data-mesa="2"] select')), "la que ya está anotada no se toca");
  await page.selectOption("#pi-adj-3", "=");
  const mandado = await page.evaluate(() => window.__enviados.filter((x) => x.evento === "resultado").pop());
  igual("al elegir, manda el resultado de su mesa", mandado && mandado.payload, { ronda: 1, mesa: 3, r: "=" });
  ok(/Enviando/.test(await page.textContent('#pi-ver [data-mesa="3"]')), "y dice que está enviando hasta que el principal confirma");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== El evento: horario, Dirección Regional y constancias ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE));
  await page.click('[data-ficha="torneo"]');
  await page.fill('#pi-form-torneo [name="ritmo"]', "10 min + 2 s");
  await page.press('#pi-form-torneo [name="ritmo"]', "Tab");
  await page.click('[data-ficha="jugadores"]');
  await page.setInputFiles("#pi-subir-lista", { name: "inter.xlsx", mimeType: XLSX, buffer: excelRegional() });
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").checkVisibility());
  await page.click("#pi-sugerencia-crear");
  await contestarEtapa(page, "interregional", "III");
  await page.waitForFunction(() => document.getElementById("pi-sugerencia").hidden);
  todos = await leerTodos(page);
  for (const x of todos) {
    await page.selectOption("#pi-lista", x.idLista);
    await page.click('[data-ficha="rondas"]');
    await jugarRondas(page, "=");
  }
  await page.click('[data-ficha="archivos"]');
  ok(await vis(page, "#pi-por-dre"), "en la Interregional, la tabla por Dirección Regional");
  igual("con las dos regionales", (await page.$$eval("#pi-por-dre tbody tr td:first-child", (l) => l.map((x) => x.textContent))).sort(), ["Alajuela", "Occidente"]);
  await page.fill("#pi-horario-inicio", "08:30");
  await page.dispatchEvent("#pi-horario-inicio", "change");
  ok(/Ronda 1 08:30 · Ronda 2 09:05/.test(await page.textContent("#pi-horario-lista")), "el horario de cada torneo", await page.textContent("#pi-horario-lista"));
  await page.click("#pi-horario-imprimir");
  ok(/Horario del día/.test(await page.textContent("#pi-firmas")), "y se imprime");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  // Todo tablas: todos empatados en el corte. El desempate.
  const botonDesempate = await page.$("#pi-clasificados [data-desempate]");
  ok(!!botonDesempate, "con un empate en el corte, ofrece anotar el desempate");
  await botonDesempate.click();
  await page.waitForSelector(dialogo);
  const opciones = await page.$$eval(dialogo + ' select[name="p0"] option', (o) => o.map((x) => x.value));
  await page.selectOption(dialogo + ' select[name="p0"]', opciones[opciones.length - 1]);
  await page.selectOption(dialogo + ' select[name="p' + (opciones.length - 1) + '"]', opciones[0]);
  await page.click(dialogo + " [data-avisos-aceptar]");
  await page.waitForFunction(() => /Desempatado con/.test(document.getElementById("pi-clasificados").textContent));
  ok(true, "anotado, la lista lo dice");
  await page.click("#pi-evento-constancias");
  const constancias = await page.$$eval("#pi-firmas .pi-diploma", (l) => l.map((x) => x.textContent));
  igual("una constancia por estudiante que jugó (9 + 3)", constancias.length, 12);
  ok(constancias.every((x) => /Constancia de participación/.test(x) && /participó en/.test(x)), "cada una dice en qué participó");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  todos = await leerTodos(page);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();

  console.log("\n=== Avisarme y las rondas anteriores ===");
  const lista = todos.filter((x) => x.evento).sort((a, b) => a.ordenEnEvento - b.ordenEnEvento);
  const vistaVieja = V.vistaEvento(lista[0].evento, lista.map((x) => Object.assign({}, x, { rondas: x.rondas.slice(0, 1) })));
  const vistaNueva = V.vistaEvento(lista[0].evento, lista.map((x) => Object.assign({}, x, { rondas: x.rondas.slice(0, 2) })));
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE, "#evento=prueba123"));
  await page.evaluate(() => {
    window.__notificaciones = [];
    window.Notification = function (titulo, o) { window.__notificaciones.push([titulo, o && o.body]); };
    window.Notification.permission = "granted";
    window.Notification.requestPermission = () => Promise.resolve("granted");
  });
  await page.waitForFunction(() => window.__enviados.some((x) => x.evento === "pedir"));
  await page.evaluate((v) => window.__llega("pareo-evento-prueba123", "estado", v), vistaVieja);
  await page.waitForSelector("#pi-ver-buscar");
  // Alguien que jugó en las dos rondas (en un torneo impar, uno descansa).
  const conMesa = (v) => new Set(v.torneos.flatMap((x) => x.ronda.mesas.filter((m) => m.n).flatMap((m) => [m.b, m.n])));
  const enLaVieja = conMesa(vistaVieja), enLaNueva = conMesa(vistaNueva);
  const quien = [...enLaVieja].find((n) => enLaNueva.has(n));
  await page.fill("#pi-ver-buscar", quien.toLowerCase());
  await page.click("#pi-ver-avisar");
  ok(new RegExp("avisa cuando salga la próxima ronda de «" + quien.toLowerCase() + "»").test(await page.textContent("#pi-ver-aviso")), "queda esperando la próxima ronda");
  await page.evaluate((v) => window.__llega("pareo-evento-prueba123", "estado", v), vistaNueva);
  await page.waitForFunction(() => /Salió la ronda/.test(document.getElementById("pi-ver-aviso").textContent));
  ok(new RegExp(quien + ": Ronda 2, mesa \\d").test(await page.textContent("#pi-ver-aviso")), "al salir la ronda 2, lo dice en la página", await page.textContent("#pi-ver-aviso"));
  igual("y con una notificación del celular", (await page.evaluate(() => window.__notificaciones)).length, 1);
  await page.evaluate((v) => window.__llega("pareo-evento-prueba123", "estado", v), vistaNueva);
  igual("la misma ronda no avisa dos veces", (await page.evaluate(() => window.__notificaciones)).length, 1);
  ok(/Antes: Ronda 1:/.test(await page.textContent("#pi-ver-mio")), "«Mi jugador» trae lo que jugó antes", await page.textContent("#pi-ver-mio"));
  await page.click("#pi-ver-torneos details summary");
  const sel = await page.$("#pi-ver-torneos details select");
  ok(!!sel, "cada torneo deja elegir una ronda anterior");
  await sel.selectOption("1");
  await page.evaluate((v) => window.__llega("pareo-evento-prueba123", "estado", v), vistaNueva);
  igual("la ronda elegida se queda aunque llegue un resultado", await page.$eval("#pi-ver-torneos details select", (s) => s.value), "1");
  ok(/Ronda 1/.test(await page.textContent("#pi-ver-torneos details h3")), "y se ve esa ronda");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
  console.log("\n=== Marcar varios jugadores y eliminarlos ===");
  ({ ctx, page, errores } = await P.abrirPagina(browser, BASE));
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", Array.from({ length: 6 }, (_, i) => "PRUEBA BORRAR " + (i + 1)).join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.check("#pi-marcar-todos");
  igual("la casilla de arriba marca a todos", await page.textContent("#pi-masivo-cuenta"), "6 marcados.");
  await page.click('#pi-tabla-jugadores input[aria-label="Marcar a PRUEBA BORRAR 3"]');
  igual("y se puede desmarcar a uno", await page.textContent("#pi-masivo-cuenta"), "5 marcados.");
  await page.click("#pi-eliminar-marcados");
  await page.waitForSelector('dialog[data-avisos="confirmar"][open]');
  ok(/¿Eliminar a los 5 marcados/.test(await page.textContent('dialog[data-avisos="confirmar"][open]')), "pregunta antes, con cuántos");
  await page.click('dialog[data-avisos="confirmar"][open] [data-avisos-aceptar]');
  await page.waitForFunction(() => document.querySelectorAll("#pi-tabla-jugadores tbody tr").length === 1);
  igual("queda solo el que no se marcó", await page.textContent("#pi-tabla-jugadores tbody td.font-semibold"), "PRUEBA BORRAR 3");
  // Con el buscador, «marcar a todos» marca solo a los que se ven.
  await page.fill("#pi-pegar", Array.from({ length: 4 }, (_, i) => "OTRA PERSONA " + (i + 1)).join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.fill("#pi-buscar-jugador", "otra");
  await page.check("#pi-marcar-todos");
  igual("con el buscador, solo los que se ven", await page.textContent("#pi-masivo-cuenta"), "4 marcados.");
  await page.fill("#pi-buscar-jugador", "");
  // Quien ya jugó una ronda no se elimina.
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForFunction(() => document.querySelector("#pi-ronda table select"));
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-eliminar-marcados");
  ok(/ya jugaron una ronda/.test(await page.textContent("body")), "si todos ya jugaron, dice que se retiran, no se eliminan");
  igual("y no elimina a nadie", (await leerTodos(page))[0].jugadores.length, 5);
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
