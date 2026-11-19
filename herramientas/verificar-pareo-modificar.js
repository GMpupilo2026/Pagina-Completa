/* Pareo Integral: modificar la ronda en juego sin deshacerla
 * (V.modificarRonda en js/pareo/evento.js y «Modificar la ronda sin
 * deshacerla» en js/pareo/pagina.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - cambiar a dos de lugar, también a uno que no juega por uno que sí (así
 *     entra quien llegó tarde), y que el que sale quede sin jugar;
 *   - invertir colores, sacar a alguien (su rival queda sin mesa) y armar una
 *     mesa con quienes no juegan, con el bye del pareo siempre al final;
 *   - las mesas con resultado no se tocan, ni los retirados entran;
 *   - al irse una mesa, lo que apunta a las de después por su número
 *     (incidencias, discrepancias, lo confirmado) se corre con ellas;
 *   - avisa si la pareja nueva ya jugó entre sí;
 *   - el historial lo cuenta (y por eso «Deshacer el último cambio» lo
 *     deshace), y la página deja hacerlo todo sin borrar la ronda, incluso
 *     agregar un jugador nuevo ahí mismo.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-modificar.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const T = require(path.join(RAIZ, "js/pareo/torneo.js"));
const V = require(path.join(RAIZ, "js/pareo/evento.js"));
const H = require(path.join(RAIZ, "js/pareo/historial.js"));
const P = require("./lib/pareo-pruebas");
const { leerTodos } = P;

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};
const parejas = (R) => R.mesas.map((m) => [m.b, m.n]);

// Seis jugadores (a…f) y uno que llegó tarde (g); la ronda 2 en juego.
function torneo() {
  const jugadores = "abcdefg".split("").map((id) => ({ id, nombre: id.toUpperCase(), retiradoDespuesDe: null }));
  return T.nuevo({ jugadores, rondas: [
    { mesas: [{ b: "a", n: "b", r: "1-0" }, { b: "c", n: "d", r: "=" }, { b: "e", n: "f", r: "0-1" }] },
    { mesas: [{ b: "a", n: "c", r: "1-0" }, { b: "d", n: "e", r: null }, { b: "f", n: "b", r: null }], ausencias: { g: "H" } },
  ] });
}

function pruebaSinNavegador() {
  console.log("\n=== Qué rondas se pueden modificar ===");
  const t = torneo();
  ok(V.sePuedeModificar(t, 1), "la última ronda de un suizo, sí");
  ok(!V.sePuedeModificar(t, 0), "una ronda vieja, no (la siguiente ya salió de ella)");
  ok(!V.sePuedeModificar(Object.assign(torneo(), { sistema: "todos" }), 1), "todos contra todos, no (el calendario es fijo)");
  ok(!V.sePuedeModificar(Object.assign(torneo(), { tipo: "equipos" }), 1), "por equipos, no");
  igual("en la ronda 1 del suizo no se puede tocar", V.modificarRonda(t, 0, { tipo: "colores", mesa: 1 }).error, "noSePuede");

  console.log("\n=== Cambiar a dos de lugar ===");
  let res = V.modificarRonda(t, 1, { tipo: "intercambiar", a: "d", b: "f" });
  ok(res.ok, "dos que juegan cambian de mesa", JSON.stringify(res));
  igual("d pasa a la mesa 3 con su color y f a la 2", parejas(t.rondas[1]), [["a", "c"], ["f", "e"], ["d", "b"]]);
  igual("y avisa que e y f ya jugaron en la ronda 1", res.repetidas, [{ b: "f", n: "e", ronda: 1 }]);
  res = V.modificarRonda(t, 1, { tipo: "intercambiar", a: "g", b: "b" });
  ok(res.ok, "quien no juega (g, el que llegó tarde) entra en el lugar de b");
  igual("g queda en la mesa de b", parejas(t.rondas[1])[2], ["d", "g"]);
  ok(!("g" in t.rondas[1].ausencias), "y ya no tiene su bye pedido");
  igual("b queda sin mesa (ausente, que el árbitro cambia en «No juegan»)", V.sinMesa(t, 1), ["b"]);
  igual("una mesa con resultado no se toca", V.modificarRonda(t, 1, { tipo: "intercambiar", a: "a", b: "d" }), { error: "conResultado", mesa: 0 });
  igual("dos que no juegan no se cambian: se les arma una mesa", V.modificarRonda(torneo(), 1, { tipo: "intercambiar", a: "g", b: "g" }).error, "mismo");

  console.log("\n=== Invertir colores ===");
  V.modificarRonda(t, 1, { tipo: "colores", mesa: 1 });
  igual("la mesa 2 queda al revés", parejas(t.rondas[1])[1], ["e", "f"]);
  V.modificarRonda(t, 1, { tipo: "intercambiar", a: "e", b: "f" });
  igual("dos de la misma mesa: también invierte", parejas(t.rondas[1])[1], ["f", "e"]);

  console.log("\n=== Sacar a alguien y armar una mesa ===");
  const t2 = torneo();
  const R2 = t2.rondas[1];
  R2.incidencias = [{ hora: 1, mesa: 2, tipo: "reclamo", texto: "en la mesa 2" }, { hora: 2, mesa: 3, tipo: "reclamo", texto: "en la mesa 3" }];
  R2.discrepancias = [{ mesa: 3, r: "1-0", ya: null }];
  R2.confirmadas = ["2|1-0"];
  res = V.modificarRonda(t2, 1, { tipo: "sacar", id: "d" });
  igual("al sacar a d, su rival queda sin mesa", res.sinRival, "e");
  igual("la mesa se va", parejas(R2), [["a", "c"], ["f", "b"]]);
  igual("la incidencia de la mesa que se fue queda sin número, la de la mesa 3 pasa a la 2", R2.incidencias.map((x) => x.mesa || null), [null, 2]);
  igual("la discrepancia y lo confirmado se corren con su mesa", [R2.discrepancias[0].mesa, R2.confirmadas[0]], [2, "1|1-0"]);
  igual("quedan sin mesa d, e y g", V.sinMesa(t2, 1).sort(), ["d", "e", "g"]);
  res = V.modificarRonda(t2, 1, { tipo: "mesa", b: "g", n: null });
  ok(res.ok, "g recibe el bye del pareo");
  res = V.modificarRonda(t2, 1, { tipo: "mesa", b: "e", n: "d" });
  ok(res.ok, "e y d arman una mesa nueva");
  igual("la mesa nueva va antes del bye, que sigue al final", parejas(R2), [["a", "c"], ["f", "b"], ["e", "d"], ["g", null]]);
  igual("la incidencia de la mesa 2 no se movió (la nueva entró después)", R2.incidencias[1].mesa, 2);
  igual("la mesa 1, con resultado, no se puede sacar", V.modificarRonda(t2, 1, { tipo: "sacar", id: "a" }).error, "conResultado");
  V.modificarRonda(t2, 1, { tipo: "sacar", id: "f" });
  igual("ni dos byes del pareo en la misma ronda", V.modificarRonda(t2, 1, { tipo: "mesa", b: "f", n: null }).error, "yaHayBye");
  igual("ni meter a alguien que ya tiene mesa", V.modificarRonda(t2, 1, { tipo: "mesa", b: "f", n: "e" }).error, "yaJuega");
  t2.jugadores.find((j) => j.id === "b").retiradoDespuesDe = 1;
  igual("ni a un retirado", V.modificarRonda(t2, 1, { tipo: "mesa", b: "f", n: "b" }).error, "retirado");

  console.log("\n=== El historial ===");
  const antes = torneo();
  const despues = torneo();
  V.modificarRonda(despues, 1, { tipo: "intercambiar", a: "g", b: "b" });
  igual("dice que se modificó la ronda (sin inventar resultados cambiados mesa por mesa)", H.describir(antes, despues), [{ clave: "histPareoModificado", vars: { r: 2 } }]);
  const tx = require(path.join(RAIZ, "js/pareo/textos.js"));
  ok(tx.t("es", "histPareoModificado", { r: 2 }).includes("ronda 2"), "y tiene su texto", tx.t("es", "histPareoModificado", { r: 2 }));
}

async function pruebaPagina(browser) {
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  console.log("\n=== En la página ===");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", ["Ana Mora", "Beatriz Solís", "Carla Ureña", "Diana Vargas", "Elena Zúñiga", "Fabiola Arias"].join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  await page.waitForSelector("#pi-mesa-0");
  ok(await page.$eval("#pi-modificar", (d) => d.checkVisibility() && !d.open), "la ronda en juego trae «Modificar la ronda sin deshacerla», cerrado");
  await page.click("#pi-modificar summary");

  // Un jugador nuevo, ahí mismo: queda elegido para entrar.
  await page.fill("#pi-mod-nuevo-nombre", "Gabriela Chaves");
  await page.fill("#pi-mod-nuevo-elo", "1500");
  await page.click("#pi-mod-nuevo-agregar");
  let todos = await P.esperarGuardado(page, (l) => l[0].jugadores.length === 7);
  const gaby = todos[0].jugadores.find((j) => j.nombre === "Gabriela Chaves");
  ok(gaby && gaby.elo === 1500, "«Agregar un jugador nuevo» la inscribe en el torneo", JSON.stringify(gaby));
  ok(await page.$eval("#pi-modificar", (d) => d.open), "y el panel sigue abierto");
  ok(/Gabriela Chaves/.test(await page.textContent("#pi-ronda h3 + ul")), "aparece en «No juegan esta ronda»");
  igual("y queda elegida en «Armar una mesa» (con el bye del pareo enfrente)", [await page.inputValue("#pi-mod-blancas"), await page.inputValue("#pi-mod-negras")], [gaby.id, ""]);

  // Entra en el lugar de quien juega en la mesa 3.
  const R0 = todos[0].rondas[0];
  const saleId = R0.mesas[2].n;
  await page.selectOption("#pi-mod-a", saleId);
  igual("en «Cambiar a dos de lugar», la recién llegada ya está elegida", await page.inputValue("#pi-mod-b"), gaby.id);
  await page.click("#pi-mod-intercambiar");
  todos = await P.esperarGuardado(page, (l, g) => l[0].rondas[0].mesas[2].n === g, gaby.id);
  const R = todos[0].rondas[0];
  igual("la ronda sigue siendo una sola, con sus 3 mesas", [todos[0].rondas.length, R.mesas.length], [1, 3]);
  ok(R.incidencias.some((x) => x.tipo === "decision" && /Pareo modificado/.test(x.texto)), "el cambio queda en las incidencias", JSON.stringify(R.incidencias));
  ok((todos[0].tardios || []).length === 0 || todos[0].tardios.every((x) => x.ronda === 1), "sin evento no hay acta de inscripción tardía (y con evento, valdría desde esta ronda)");
  const fuera = await page.textContent("#pi-ronda h3 + ul");
  ok(fuera.includes(todos[0].jugadores.find((j) => j.id === saleId).nombre), "quien salió pasa a «No juegan esta ronda»", fuera);
  ok(await page.$eval("#pi-mod-intercambiar", (b) => document.activeElement === b), "el foco vuelve al botón que se usó");

  // Invertir colores de la mesa 1 y armar una mesa con el bye.
  const m0 = R.mesas[0];
  await page.selectOption("#pi-mod-mesa", "0");
  await page.click("#pi-mod-invertir");
  todos = await P.esperarGuardado(page, (l, b) => l[0].rondas[0].mesas[0].n === b, m0.b);
  igual("«Invertir colores» da vuelta la mesa 1", [todos[0].rondas[0].mesas[0].b, todos[0].rondas[0].mesas[0].n], [m0.n, m0.b]);
  await page.selectOption("#pi-mod-negras", "");
  await page.click("#pi-mod-armar-boton");
  todos = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas.length === 4);
  igual("«Armar la mesa» con el bye: la mesa nueva va al final, sin rival", [todos[0].rondas[0].mesas[3].b, todos[0].rondas[0].mesas[3].n], [saleId, null]);

  // Con un resultado anotado, esa mesa ya no se toca.
  await page.selectOption("#pi-mesa-1", "1-0");
  await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[1].r === "1-0");
  await page.selectOption("#pi-mod-sacar", todos[0].rondas[0].mesas[1].b);
  await page.click("#pi-mod-sacar-boton");
  await page.waitForSelector("dialog[data-avisos][open], [data-avisos-lista] *", { timeout: 3000 }).catch(() => null);
  todos = await leerTodos(page);
  igual("sacar a alguien de una mesa con resultado no hace nada", todos[0].rondas[0].mesas.length, 4);
  ok(/ya tiene resultado/.test(await page.textContent("body")), "y dice por qué");

  // «Deshacer el último cambio» lo devuelve: el historial lo contó.
  await page.click('[data-ficha="archivos"]');
  ok(/se modificaron los emparejamientos de la ronda 1/.test(await page.textContent("#pi-historial-lista")), "el historial cuenta la modificación", await page.textContent("#pi-historial"));
  await page.click("#pi-deshacer");
  await page.click("dialog[data-avisos][open] [data-avisos-aceptar]");
  todos = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas[1].r == null);
  await page.click("#pi-deshacer");
  await page.click("dialog[data-avisos][open] [data-avisos-aceptar]");
  todos = await P.esperarGuardado(page, (l) => l[0].rondas[0].mesas.length === 3);
  igual("«Deshacer el último cambio» saca la mesa que se armó (y deja la ronda)", [todos[0].rondas.length, todos[0].rondas[0].mesas.length], [1, 3]);
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

/*! rev bfb5bbb0d2d82f9f */
