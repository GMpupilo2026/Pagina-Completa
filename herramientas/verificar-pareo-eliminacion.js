/* Pareo Integral: la eliminación directa y el desempate jugado en Pareo
 * Integral (js/pareo/torneo.js, desempates.js, evento.js, pagina.js,
 * publicar.js).
 *
 * Lo que se rompe acá no da ningún error: un cuadro mal sembrado cruza al 1
 * y al 2 en semifinales, una tablas sin desempate deja pasar a nadie (o a
 * cualquiera), y una clasificación por puntos le da el segundo puesto a quien
 * cayó en cuartos. Dos partes:
 *
 *   1. La lógica, en Node: las semillas del cuadro, los byes de los primeros,
 *      cuántas rondas, que cada ronda cruce a los ganadores de su lado del
 *      cuadro, que unas tablas sin quién pasó no cierren la ronda, el puesto
 *      por hasta dónde llegó cada uno, el TRF; y el desempate en vivo
 *      (V.resolverDesempate): el todos contra todos, el Armagedón con las
 *      tablas para negras, los que siguen empatados y lo que queda suelto al
 *      corregir.
 *   2. La página, en un navegador: elegir eliminación directa, la ronda 1 con
 *      sus byes, unas tablas que piden quién pasa (y sin eso no se empareja
 *      la ronda siguiente), jugar hasta la final y ver el cuadro con el campeón.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-eliminacion.js
 */
const fs = require("fs");
const { chromium } = require("playwright");
const T = require("../js/pareo/torneo.js");
const D = require("../js/pareo/desempates.js");
const V = require("../js/pareo/evento.js");
const PP = require("../js/pareo/publicar.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => { const ja = JSON.stringify(a), jb = JSON.stringify(b); ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja); };

function torneo(n) {
  const jugadores = [];
  for (let i = 1; i <= n; i++) jugadores.push({ id: "s" + i, nombre: "Semilla " + i, elo: 2500 - i * 10 });
  const t = T.nuevo({ sistema: "eliminacion", jugadores });
  T.fijarNumeracion(t);
  return t;
}
// Juega el torneo entero: gana siempre la mejor semilla (la de número más bajo).
function jugarTodo(t, conTablas) {
  const total = T.rondasDelTorneo(t);
  for (let r = 0; r < total; r++) {
    const R = T.rondaFija(t, r);
    for (const m of R.mesas) {
      if (m.n === null) continue;
      const mejor = Number(m.b.slice(1)) < Number(m.n.slice(1)) ? m.b : m.n;
      if (conTablas) { m.r = "="; m.pasa = mejor; m.desempate = "Armagedón"; } else m.r = mejor === m.b ? "1-0" : "0-1";
    }
    t.rondas.push(R);
  }
}

function pruebaLogica() {
  console.log("\n=== El cuadro ===");
  igual("las semillas de 8 en el cuadro de siempre", T.semillasCuadro(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  igual("y las de 16", T.semillasCuadro(16), [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
  const rondas = [2, 3, 4, 5, 8, 9, 16, 33].map((n) => T.rondasDelTorneo(torneo(n)));
  igual("cuántas rondas: 2→1, 3→2, 4→2, 5→3, 8→3, 9→4, 16→4, 33→6", rondas, [1, 2, 2, 3, 3, 4, 4, 6]);
  const t6 = torneo(6);
  const r1 = T.rondaFija(t6, 0);
  const byes = r1.mesas.filter((m) => m.n === null).map((m) => m.b);
  igual("con 6, las semillas 1 y 2 pasan la ronda 1 sin jugar", byes.sort(), ["s1", "s2"]);
  ok(r1.mesas.every((m) => m.ko === true && Number.isInteger(m.slot)), "cada mesa sabe su lugar en el cuadro");

  const problemas = [];
  for (const n of [2, 3, 5, 7, 8, 12, 16, 21, 32]) {
    const t = torneo(n);
    jugarTodo(t);
    const total = T.rondasDelTorneo(t);
    const final = t.rondas[total - 1].mesas;
    if (final.length !== 1) problemas.push(n + ": la final tiene " + final.length + " mesas");
    else if (T.pasaDe(final[0]) !== "s1") problemas.push(n + ": el campeón es " + T.pasaDe(final[0]));
    // Ganando siempre la mejor semilla, la final es 1 contra 2.
    if (n >= 2 && final.length === 1 && [final[0].b, final[0].n].sort().join() !== "s1,s2") problemas.push(n + ": la final es " + final[0].b + "-" + final[0].n);
    // Nadie juega dos veces en la misma ronda, y nadie juega después de perder.
    const fuera = new Set();
    t.rondas.forEach((R, r) => {
      const vistos = new Set();
      for (const m of R.mesas) for (const id of [m.b, m.n].filter(Boolean)) {
        if (vistos.has(id)) problemas.push(n + ": " + id + " dos veces en la ronda " + (r + 1));
        if (fuera.has(id)) problemas.push(n + ": " + id + " juega después de quedar fuera");
        vistos.add(id);
      }
      for (const m of R.mesas) if (m.n !== null) fuera.add(T.pasaDe(m) === m.b ? m.n : m.b);
    });
    const clas = D.clasificacion(t, []);
    if (clas[0].id !== "s1" || clas[0].puesto !== 1 || clas[1].id !== "s2" || clas[1].puesto !== 2) problemas.push(n + ": el podio es " + clas.slice(0, 2).map((f) => f.id + ":" + f.puesto));
    if (n >= 4 && !(clas[2].puesto === 3 && clas[3].puesto === 3)) problemas.push(n + ": los de semifinales no comparten el 3.º");
  }
  ok(!problemas.length, "de 2 a 32: la final es 1 contra 2, nadie juega dos veces ni después de quedar fuera, y el podio sale de hasta dónde llegó cada uno", problemas.slice(0, 6).join(" | "));

  console.log("\n=== Las tablas y el desempate en la mesa ===");
  const t = torneo(4);
  const R = T.rondaFija(t, 0);
  R.mesas.forEach((m) => { m.r = "="; });
  ok(!T.rondaCompleta(R), "unas tablas sin quién pasó no cierran la ronda");
  R.mesas.forEach((m) => { m.pasa = Number(m.b.slice(1)) > Number(m.n.slice(1)) ? m.b : m.n; m.desempate = "Armagedón"; });
  ok(T.rondaCompleta(R), "con quién pasó, sí");
  t.rondas.push(R);
  const final = T.rondaFija(t, 1).mesas[0];
  igual("y la final la juegan los que pasaron por el desempate (las semillas 3 y 4)", [final.b, final.n].sort(), ["s3", "s4"]);
  const sinPasar = torneo(4);
  const R2 = T.rondaFija(sinPasar, 0);
  R2.mesas[0].r = "--"; R2.mesas[1].r = "1-0";
  sinPasar.rondas.push(R2);
  const f2 = T.rondaFija(sinPasar, 1).mesas;
  ok(f2.length === 1 && f2[0].n === null, "si en una mesa no se presenta nadie, el del otro lado pasa la final sin jugar");
  const otraVez = torneo(4);
  const R3 = T.rondaFija(otraVez, 0);
  R3.mesas[0].r = "="; R3.mesas[0].pasa = "s99";
  ok(!T.rondaCompleta(R3), "un «pasa» que no es de la mesa no cuenta");

  console.log("\n=== El TRF y lo que se publica ===");
  const tt = torneo(4);
  jugarTodo(tt, true);
  const trf = T.aTrf(tt);
  ok(/^092 Individual: Knockout$/m.test(trf) && /^142 2$/m.test(trf) && !/^192 /m.test(trf), "el TRF dice Knockout, sus rondas y sin la línea del Holandés");
  igual("y se vuelve a leer como eliminación directa", T.deTrf(trf).sistema, "eliminacion");
  ok(/ =/.test(trf), "las tablas van como tablas (el desempate no es una partida para el Elo)");
  const pub = PP.datosPublicos(tt);
  ok(pub.sistema === "eliminacion" && pub.rondasTotales === 2, "se publica como eliminación directa, con sus rondas");
  ok(pub.rondas[0].mesas.every((m) => m.ko && Number.isInteger(m.slot) && m.pasa && m.desempate === "Armagedón"), "y cada mesa con su lugar y quién pasó", JSON.stringify(pub.rondas[0].mesas[0]));
  const desdePub = Object.assign(T.nuevo(), pub);
  igual("con eso, la página pública arma el mismo podio", D.clasificacion(desdePub, []).slice(0, 2).map((f) => f.id), ["s1", "s2"]);

  console.log("\n=== El desempate jugado en Pareo Integral ===");
  const d2 = { partidas: [] };
  ok(V.resolverDesempate(d2, ["a", "b"]) === null && d2.partidas.length === 2 && d2.partidas[0].b === d2.partidas[1].n, "dos empatados: dos partidas, con los colores cambiados");
  d2.partidas.forEach((p) => { p.r = "1-0"; });
  ok(V.resolverDesempate(d2, ["a", "b"]) === null && d2.partidas.length === 3 && d2.partidas[2].arm, "1 a 1: un Armagedón");
  d2.partidas[2].r = "=";
  igual("tablas en el Armagedón: gana el de negras", V.resolverDesempate(d2, ["a", "b"]), [d2.partidas[2].n, d2.partidas[2].b]);
  const d3 = { partidas: [] };
  V.resolverDesempate(d3, ["a", "b", "c"]);
  ok(d3.partidas.length === 3, "tres empatados: todos contra todos (3 partidas)");
  d3.partidas.forEach((p) => { p.r = [p.b, p.n].includes("a") ? (p.b === "a" ? "1-0" : "0-1") : "="; });
  ok(V.resolverDesempate(d3, ["a", "b", "c"]) === null && d3.partidas.length === 5 && d3.partidas.slice(3).every((p) => [p.b, p.n].sort().join() === "b,c"),
    "si uno se separa, los otros dos juegan lo suyo");
  d3.partidas.slice(3).forEach((p) => { p.r = p.b === "c" ? "1-0" : "0-1"; });
  igual("y el orden sale entero", V.resolverDesempate(d3, ["a", "b", "c"]), ["a", "c", "b"]);
  // Corregidas las tres primeras a tablas, nadie se separa: el desempate
  // entre b y c ya no sirve y toca otra vuelta de los tres.
  d3.partidas.slice(0, 3).forEach((p) => { p.r = "="; });
  V.resolverDesempate(d3, ["a", "b", "c"]);
  ok(d3.orden === null && !d3.partidas.some((p) => p.grupo === "b|c") && d3.partidas.filter((p) => p.intento === 1).length === 3,
    "al corregir, lo que quedó suelto se borra, el orden vuelve a faltar y toca otra vuelta", JSON.stringify(d3.partidas));
  const corte = { desempateCorte: { orden: null, vivo: true, partidas: [] } };
  const filas = [{ id: "a", puesto: 3 }, { id: "b", puesto: 3 }];
  igual("mientras se juega, la clasificación no cambia", V.aplicarDesempate(corte, filas), filas);
}

async function pruebaPagina(browser) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  await page.click('[data-ficha="torneo"]');
  await page.fill('#pi-form-torneo [name="nombre"]', "PRUEBA Copa");
  await page.press('#pi-form-torneo [name="nombre"]', "Tab");
  await page.check('#pi-form-torneo input[name="sistema"][value="eliminacion"]');
  ok(!(await P.vis(page, "#pi-campo-rondas")) && !(await P.vis(page, "#pi-campo-doble")), "con eliminación directa, sin «Número de rondas» ni «A doble vuelta»");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", ["Ana;;2000", "Beto;;1900", "Caro;;1800", "Dani;;1700", "Eva;;1600", "Fede;;1500"].join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click('[data-ficha="rondas"]');
  ok(/la 1 y la 2 solo se cruzan en la final/.test(await page.textContent("#pi-ronda")), "antes de la ronda 1, explica cómo funciona");
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-1");
  ok(/Ronda 1 · Cuartos de final|Emparejamientos de la ronda 1 · Cuartos de final/.test(await page.textContent("#pi-ronda")), "la ronda dice qué ronda del cuadro es");
  const texto = await page.textContent("#pi-ronda");
  ok((texto.match(/Bye del pareo/g) || []).length === 2 || /Ana[\s\S]*Bye/.test(texto), "las semillas 1 y 2 pasan sin jugar", texto.slice(0, 300));

  // Las dos partidas: una gana blancas, la otra tablas.
  const sels = await page.$$eval("#pi-ronda select[data-resultado]", (l) => l.map((x) => x.id));
  await page.selectOption("#" + sels[0], "1-0");
  await page.selectOption("#" + sels[1], "=");
  await page.waitForSelector("#pi-ronda select[data-pasa]");
  ok(await P.vis(page, "#pi-ronda select[data-pasa]"), "unas tablas piden quién pasa por el desempate");
  ok(!(await page.$("#pi-emparejar")) || await page.$eval("#pi-emparejar", (b) => b.disabled || !b.checkVisibility()), "y sin eso no se empareja la ronda siguiente");
  const opciones = await page.$$eval("#pi-ronda select[data-pasa] option", (l) => l.map((o) => o.value).filter(Boolean));
  await page.selectOption("#pi-ronda select[data-pasa]", opciones[1]);
  const t1 = (await P.leerTodos(page)).find((x) => x.nombre === "PRUEBA Copa");
  const tablas = t1.rondas[0].mesas.find((m) => m.r === "=");
  ok(tablas && tablas.pasa === opciones[1] && tablas.desempate === "Armagedón", "queda anotado quién pasó y cómo (Armagedón por omisión)", JSON.stringify(tablas));

  await P.jugarRondas(page, "1-0");
  const tf = (await P.leerTodos(page)).find((x) => x.nombre === "PRUEBA Copa");
  ok(tf.rondas.length === 3 && tf.rondas[2].mesas.length === 1, "tres rondas, y la última es la final", tf.rondas.map((R) => R.mesas.length).join(","));
  const pasaron = new Set(tf.rondas[0].mesas.map((m) => (m.n === null ? m.b : m.r === "1-0" ? m.b : m.r === "=" ? m.pasa : m.n)));
  ok(tf.rondas[1].mesas.every((m) => pasaron.has(m.b) && (m.n === null || pasaron.has(m.n))), "la ronda 2 la juegan los que pasaron la 1");

  await page.click('[data-ficha="clasificacion"]');
  ok(await P.vis(page, "#pi-clas-cuadro"), "la clasificación trae el cuadro");
  const cuadro = await page.textContent("#pi-clas-cuadro");
  ok(/Campeón: /.test(cuadro) && /Final/.test(cuadro) && /Semifinales/.test(cuadro), "con el campeón y cada ronda por su nombre", cuadro.slice(0, 300));
  ok(/pasa .+ \(Armagedón\)/.test(cuadro), "y quién pasó por desempate, escrito");
  const primeros = await page.$$eval("#pi-tabla-clas tbody tr", (l) => l.slice(0, 4).map((r) => r.children[0].textContent));
  igual("los puestos: 1, 2 y los de semifinales comparten el 3", primeros, ["1", "2", "3", "3"]);
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { pruebaLogica(); } catch (e) { mal("la prueba de la lógica se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { console.log("\n=== La página ==="); await pruebaPagina(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
