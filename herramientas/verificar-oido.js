/* Comprueba «De oído» (entreno/oido.html): visualización sin ver el tablero.
 *
 * Sin navegador (js/oido-ejercicios.js, tal cual):
 *   - a qué casillas llega cada pieza en el tablero vacío, contado a mano;
 *   - el camino más corto del caballo (de a1 a h8 son 6, de b1 a e5 son 3);
 *   - se entienden las casillas escritas o dichas («eva 4», «efe tres»), el
 *     sí y el no, y los números en palabras;
 *   - el seguimiento de la partida dictada: con enroque (la torre también se
 *     mueve), capturas y captura al paso;
 *   - cada pregunta dictada sale de una apertura REAL del banco, con la
 *     respuesta comprobada con chess.js, en los tres niveles;
 *   - la base acepta la actividad 'oido' (la migración) y la página está en
 *     el hub, en el panel, en las tareas y en el plan.
 *
 * Con navegador (la página de verdad, con un Supabase de mentira):
 *   - sin sesión manda a iniciar sesión;
 *   - los tres ejercicios: la pregunta escrita y dicha, la respuesta buena y
 *     la mala corregidas, y cada respuesta registrada como 'oido';
 *   - no hay ningún tablero a la vista (es lo que se entrena).
 *
 * Uso:  node herramientas/verificar-todo.js oido
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const { Chess } = require("chess.js");
const O = require("../js/oido-ejercicios.js");
const LINEAS = require("../js/aperturas-lineas.js").LINEAS;

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function azar(semilla) { let s = semilla; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

console.log("\n=== Las piezas en el tablero vacío ===");
ok("el caballo de g1 llega a e2, f3 y h3", igual(O.alcance("n", "g1"), ["e2", "f3", "h3"]));
ok("el caballo de d4 llega a 8 casillas", O.alcance("n", "d4").length === 8);
ok("el rey de a1 llega a a2, b1 y b2", igual(O.alcance("k", "a1"), ["a2", "b1", "b2"]));
ok("el alfil de c1 llega a 7, la torre siempre a 14 y la dama de d4 a 27",
  O.alcance("b", "c1").length === 7 && O.TODAS.every((s) => O.alcance("r", s).length === 14) && O.alcance("q", "d4").length === 27);

console.log("\n=== El camino del caballo ===");
const c = O.caminoCaballo("b1", "e5");
ok("de b1 a e5: 3 jugadas, con un camino de verdad", c.jugadas === 3 && c.ruta[0] === "b1" && c.ruta[3] === "e5"
  && c.ruta.every((s, i) => i === 0 || O.alcance("n", c.ruta[i - 1]).indexOf(s) >= 0), JSON.stringify(c));
ok("de a1 a h8: 6; de a1 a b2: 4 (la esquina engaña)", O.caminoCaballo("a1", "h8").jugadas === 6 && O.caminoCaballo("a1", "b2").jugadas === 4);

console.log("\n=== Lo que escribe o dice el alumno ===");
ok("«eva 4, efe tres y h3 h3» → e4, f3, h3", igual(O.leerCasillas("eva 4, efe tres y h3 h3"), ["e4", "f3", "h3"]));
ok("«Anna 1» y «a uno» → a1", igual(O.leerCasillas("Anna 1"), ["a1"]) && igual(O.leerCasillas("a uno"), ["a1"]));
ok("sí, no y lo que no es ninguno", O.leerSiNo("Sí, llega") === true && O.leerSiNo("no") === false && O.leerSiNo("tal vez") === null);
ok("«tres jugadas» y «4» son números", O.leerNumero("tres jugadas") === 3 && O.leerNumero("4") === 4 && O.leerNumero("ni idea") === null);
const lista = { modo: "alcance", tipo: "lista", pieza: "n", desde: "g1", respuesta: ["e2", "f3", "h3"] };
const r1 = O.corregir(lista, "h3 e2 f3");
const r2 = O.corregir(lista, "e2 f3 g3");
ok("en otro orden también está bien; si falta una o sobra otra, se dice cuál",
  r1.bien && !r2.bien && igual(r2.faltan, ["h3"]) && igual(r2.sobran, ["g3"]), JSON.stringify([r1, r2]));

console.log("\n=== La partida dictada ===");
const s = O.seguirPiezas(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6", "d4", "exd4", "e5", "d5", "exd6"], Chess);
ok("con enroque, el rey queda en g1 y la torre de h1 en f1", s.dondeEsta.get("e1") === "g1" && s.dondeEsta.get("h1") === "f1");
ok("con captura al paso, el peón de d7 ya no está y el de e2 llegó a d6", s.dondeEsta.get("d7") === null && s.dondeEsta.get("e2") === "d6");
ok("con captura, el peón de d2 ya no está y el de e7 quedó en d4", s.dondeEsta.get("d2") === null && s.dondeEsta.get("e7") === "d4");
let malas = [];
for (const nivel of ["facil", "medio", "dificil"]) {
  const rand = azar(7 + nivel.length);
  for (let i = 0; i < 60; i++) {
    const e = O.generarDictado(rand, nivel, LINEAS, Chess);
    if (!e) { malas.push(nivel + ": sin pregunta"); continue; }
    const linea = LINEAS.find((l) => l.id === e.linea);
    const g = new Chess();
    e.jugadas.forEach((san) => g.move(san));
    const p = g.get(e.respuesta);
    const largo = { facil: 4, medio: 8, dificil: 12 }[nivel];
    if (!linea || !igual(linea.jugadas.slice(0, largo), e.jugadas)) malas.push(e.linea + ": no son las jugadas del banco");
    else if (!p || p.type !== e.pieza || p.color !== e.color) malas.push(e.linea + ": en " + e.respuesta + " no está esa pieza");
    else if (e.respuesta === e.origen) malas.push(e.linea + ": la pieza no se movió");
  }
}
ok("180 preguntas dictadas: todas de una apertura real del banco, y la pieza está donde dice la respuesta", !malas.length, malas.slice(0, 5).join(" | "));

console.log("\n=== Los otros dos ejercicios, sorteados ===");
let mal = [];
for (const nivel of ["facil", "medio", "dificil"]) {
  const rand = azar(31 + nivel.length);
  for (let i = 0; i < 100; i++) {
    const a = O.generarAlcance(rand, nivel);
    if (a.tipo === "lista" && !igual(a.respuesta, O.alcance(a.pieza, a.desde))) mal.push("lista " + a.desde);
    if (a.tipo === "llega" && a.respuesta !== (O.alcance(a.pieza, a.desde).indexOf(a.hasta) >= 0)) mal.push("llega " + a.desde + a.hasta);
    const k = O.generarCamino(rand, nivel);
    const [min, max] = { facil: [1, 2], medio: [3, 4], dificil: [5, 6] }[nivel];
    if (k.respuesta < min || k.respuesta > max || O.caminoCaballo(k.desde, k.hasta).jugadas !== k.respuesta) mal.push("camino " + k.desde + k.hasta);
  }
}
ok("600 preguntas de alcance y de camino: la respuesta es la que da la cuenta, y el camino tiene el largo del nivel", !mal.length, mal.slice(0, 5).join(" | "));

console.log("\n=== La página en el sitio ===");
{
  const mig = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).filter((f) => /training_progress_activity_check/.test(leer("supabase/migraciones/" + f))).sort().pop();
  ok("la última migración de training_progress acepta 'oido'", /'oido'/.test(leer("supabase/migraciones/" + mig)), mig);
  ok("está en el hub de Entrenamiento y en el panel", /href="oido\.html"/.test(leer("entreno/index.html")) && /href: "entreno\/oido\.html"/.test(leer("js/clases.js")));
  ok("las tareas la conocen (material-plataforma) y el plan también", /slug: "oido"/.test(leer("js/material-plataforma.js")) && /'entreno\/oido\.html': 'oido'/.test(leer("js/plan-entrenamiento.js")));
  ok("cuenta como entrenamiento de visión (direcciones)", (leer("js/direcciones-entrenamiento.js").match(/"oido": "vision"/g) || []).length === 2);
  ok("está en las páginas de la Academia (sesión y migas)", /"entreno\/oido\.html": \("De oído", "clases\.html"\)/.test(leer("herramientas/academia-cabecera.py")));
}

/* ------------------------------------------------------------------ el navegador */
function clienteFalso(conSesion) {
  return `
(function () {
  function tabla(nombre) {
    const api = {
      select() { return api; }, eq() { return api; }, in() { return api; }, order() { return api; }, limit() { return api; }, gte() { return api; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single() { return Promise.resolve({ data: null, error: null }); },
      upsert() { return Promise.resolve({ error: null }); },
      insert(filas) { (window.__inserts = window.__inserts || []).push({ tabla: nombre, fila: [].concat(filas)[0] }); return Promise.resolve({ error: null }); },
      update() { return api; },
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
    };
    return api;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: ${conSesion ? '{ user: { id: "u-1" }, access_token: "t" }' : "null"} } }),
      getUser: () => Promise.resolve({ data: { user: ${conSesion ? '{ id: "u-1" }' : "null"} } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (n) => tabla(n),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); } }),
    removeChannel: () => {},
  };
})();
`;
}
async function abrir(browser, conSesion, ruta) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1200, height: 900 } });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(conSesion) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("console: " + m.text()); });
  await page.goto(BASE + "/entreno/" + ruta, { waitUntil: "domcontentloaded" });
  return { page, ctx, errores };
}
const voz = async (page) => { await page.waitForTimeout(150); return page.textContent("#oido-voz"); };
// La respuesta buena de la pregunta que se está haciendo, como la escribiría el alumno.
function respuestaBuena(e) {
  if (e.modo === "alcance" && e.tipo === "lista") return e.respuesta.join(" ");
  if (e.modo === "alcance") return e.respuesta ? "sí" : "no";
  if (e.modo === "camino") return String(e.respuesta);
  return e.respuesta;
}
function respuestaMala(e) {
  if (e.modo === "alcance" && e.tipo === "lista") return e.respuesta.slice(1).join(" ");
  if (e.modo === "alcance") return e.respuesta ? "no" : "sí";
  if (e.modo === "camino") return String(e.respuesta + 1);
  return e.respuesta === "a1" ? "h8" : "a1";
}

async function main() {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  console.log("\n=== Sin sesión ===");
  {
    const { page, ctx } = await abrir(browser, false, "oido.html");
    await page.waitForURL(/login\.html/, { timeout: 8000 }).catch(() => {});
    ok("manda a login.html", /login\.html/.test(page.url()), page.url());
    await ctx.close();
  }
  console.log("\n=== Los tres ejercicios ===");
  {
    const { page, ctx, errores } = await abrir(browser, true, "oido.html");
    await page.waitForSelector("#app:not(.hidden) #oido-pregunta", { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById("oido-pregunta").textContent.length > 0, null, { timeout: 8000 });
    ok("no hay ningún tablero a la vista", (await page.$$("[data-square], .board, #tablero")).length === 0);
    ok("arranca en «¿A dónde llega?», marcado escrito y con aria-pressed",
      (await page.getAttribute('[data-oido-modo="alcance"]', "aria-pressed")) === "true" && /^✓ /.test(await page.textContent('[data-oido-modo="alcance"]')));
    for (const modo of ["alcance", "camino", "dictado"]) {
      await page.click('[data-oido-modo="' + modo + '"]');
      let e = await page.evaluate(() => window.OidoEntreno.ej());
      const pregunta = await page.textContent("#oido-pregunta");
      ok(modo + ": la pregunta se escribe y se dice", pregunta.length > 20 && (await voz(page)) === pregunta, pregunta.slice(0, 80));
      await page.fill("#oido-respuesta", respuestaBuena(e));
      await page.press("#oido-respuesta", "Enter");
      ok(modo + ": la respuesta buena se festeja", /^¡Bien!/.test(await page.textContent("#oido-explicacion")) && /^¡Bien!/.test(await voz(page)));
      await page.click("#oido-nueva");
      e = await page.evaluate(() => window.OidoEntreno.ej());
      await page.fill("#oido-respuesta", respuestaMala(e));
      await page.click("#oido-responder");
      const corr = await page.textContent("#oido-explicacion");
      ok(modo + ": la mala se corrige diciendo la respuesta", /^No\. /.test(corr), corr.slice(0, 120));
    }
    const cuenta = await page.textContent("#oido-cuenta");
    ok("la cuenta va escrita: 3 de 6 bien", /^3 de 6 bien/.test(cuenta), cuenta);
    const ins = await page.evaluate(() => (window.__inserts || []).filter((x) => x.tabla === "training_progress"));
    ok("cada respuesta queda en training_progress como 'oido'", ins.length === 6 && ins.every((x) => x.fila.activity === "oido"), JSON.stringify(ins.map((x) => x.fila.activity)));
    await page.click("#oido-nueva");
    await page.fill("#oido-respuesta", "ni idea");
    await page.click("#oido-responder");
    ok("lo que no se entiende no cuenta como respuesta: se dice cómo escribirla", /Escribe|Contesta/.test(await voz(page)) && (await page.evaluate(() => window.OidoEntreno.cuenta().intentos)) === 6);
    ok("sin errores en la página", !errores.length, errores.join(" | "));
    await ctx.close();
  }
  await browser.close();
}

main().then(() => {
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien: «De oído» entrena a ver sin mirar.");
  process.exit(fallos ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
