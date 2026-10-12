#!/usr/bin/env node
/* La planilla en vivo de la clase (js/clase-planilla.js): al lado del tablero,
   la planilla de torneo que se llena sola con las jugadas. Lo que se rompe acá
   no da ningún error en pantalla:

   - una jugada mal escrita enseña mal la notación delante de toda la clase
     («Nf3» en vez de «Cf3», una captura sin «x», un mate sin «#», el número de
     jugada corrido cuando la clase arranca con negras);
   - si el trigger no protege la columna, cualquier alumno le cambia el
     resultado a la planilla de toda la clase;
   - un nombre que escribe el profe pintado como HTML;
   - el eco de Realtime de un cambio anterior devolvería atrás lo que el profe
     acaba de marcar.

   Con el sitio en localhost:8777 y playwright, contra el doble de
   verificar-clase-registrada.js:
       node herramientas/verificar-clase-planilla.js
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { Chess } = require("chess.js");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

function datos() {
  console.log("1. Cómo se escribe cada jugada");
  const fuente = fs.readFileSync(path.join(RAIZ, "js", "clase-planilla.js"), "utf8");
  const ctx = { window: {}, Chess };
  vm.runInNewContext(fuente.split("let planillaActual")[0] + "\nwindow.P = PlanillaClase;", ctx);
  const P = ctx.window.P;
  const textos = (sans, fen) => P.jugadas(sans, fen).lista.map((j) => j.texto).join(" ");

  // La partida del dictado de la Clase 1 (el mate de Légal).
  const legal = "e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#".split(" ");
  const r = P.jugadas(legal, null);
  cierto("en algebraica española, con x, + y #",
    textos(legal) === "e4 e5 Cf3 d6 Ac4 Ag4 Cc3 g6 Cxe5 Axd1 Axf7+ Re7 Cd5#", textos(legal));
  cierto("el mate pone el resultado solo (1-0)", r.fin === "1-0", r.fin);
  cierto("y el cartel lo dice en palabras", r.lista[10].leida === "Alfil (A) captura en f7 (x), jaque (+)." && /jaque mate \(#\)\.$/.test(r.lista[12].leida),
    r.lista[10].leida + " | " + r.lista[12].leida);
  const filas = P.renglones(r.lista);
  cierto("un renglón por número, blancas y negras", filas.length === 7 && filas[5].blancas.texto === "Axf7+" && filas[5].negras.texto === "Re7"
    && filas[6].negras === null);

  cierto("los enroques: O-O y O-O-O",
    textos("e4 e5 Nf3 Nc6 Bc4 Bc5 O-O d6 d3 Be6 Nc3 Qd7 a3 O-O-O".split(" ")).endsWith("O-O d6 d3 Ae6 Cc3 Dd7 a3 O-O-O"));
  cierto("la coronación: =D", textos(["a8=Q"], "8/P6k/8/8/8/8/8/K7 w - - 0 1") === "a8=D");
  cierto("la captura al paso: «a.p.»", textos(["exd6"], "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1") === "exd6 a.p.");
  // Una clase que arranca en la jugada 30 con negras: «30. …  h6».
  const neg = P.jugadas(["h6", "Ra8+"], "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 30");
  const fn = P.renglones(neg.lista);
  cierto("arrancando con negras, el renglón lleva «…» en blancas y el número del FEN",
    fn[0].numero === 30 && fn[0].blancas.texto === "…" && fn[0].negras.texto === "h6" && fn[1].numero === 31 && fn[1].blancas.texto === "Ta8+",
    JSON.stringify(fn));
  cierto("una jugada que no entra corta la planilla (no inventa)", textos(["e4", "Nf6", "Ke8"]) === "e4 Cf6");
  cierto("de la base solo se toma lo que tiene la forma",
    JSON.stringify(P.forma({ blancas: "Ana", tablas: [3, -1, "x", 2.5], resultado: "2-0", otra: 1 }))
      === JSON.stringify({ blancas: "Ana", negras: "", tablas: [3], resultado: "" })
      && P.forma(null) === null && P.forma([1]) === null);

  console.log("\n2. La base: solo el profe cambia la planilla");
  const dirMig = path.join(RAIZ, "supabase", "migraciones");
  const ultima = fs.readdirSync(dirMig).sort().filter((f) =>
    /function public\.protect_game_state_teacher_columns/.test(fs.readFileSync(path.join(dirMig, f), "utf8"))).pop();
  const sql = fs.readFileSync(path.join(dirMig, ultima), "utf8");
  const ramaAlumno = sql.slice(sql.indexOf("if not is_teacher then"), sql.indexOf("else", sql.indexOf("if not is_teacher then")));
  cierto(`${ultima}: a quien no es profesor le devuelve la planilla de antes`, /new\.planilla := old\.planilla;/.test(ramaAlumno));
  cierto("la columna tiene su CHECK de forma", fs.readdirSync(dirMig).some((f) =>
    /game_state_planilla_forma/.test(fs.readFileSync(path.join(dirMig, f), "utf8"))));
  const sesion = fs.readFileSync(path.join(RAIZ, "js", "sesion.js"), "utf8");
  cierto("al cerrar la clase, la planilla se limpia con lo demás", /const cambios = \{[^}]*planilla: null/.test(sesion));
}

const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
function fila(extra) {
  return Object.assign({
    id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, last_move: null,
    arrows: [], circles: [], active_player_id: null, active_player_color: "both",
    shown_curso: null, shown_leccion: null, vista: null, presentacion: null, planilla: null, updated_by: "u-profe",
    updated_at: new Date().toISOString(),
  }, extra || {});
}
const ultimaPlanilla = (page) => page.evaluate(() => {
  const u = window.__updates.filter((x) => x.tabla === "game_state" && "planilla" in x.campos);
  return u.length ? u[u.length - 1].campos.planilla : "sin mandar";
});
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const celdas = (page) => page.$$eval("#planilla-jugadas tr", (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent)).filter((f) => f[1]));
const LEGAL = "e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7".split(" ");

async function pruebaProfesor(browser) {
  console.log("\n3. El profe la abre, juega, ofrece tablas, pone el resultado y la cierra");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForSelector("#planilla-btn", { state: "visible", timeout: 10000 });
  cierto("cerrada, no se ve", !(await seVe(page, "#planilla-caja")) && (await page.getAttribute("#planilla-btn", "aria-pressed")) === "false");
  await page.click("#planilla-btn");
  cierto("el botón la abre para toda la clase", JSON.stringify(await ultimaPlanilla(page)) === JSON.stringify({ blancas: "", negras: "", tablas: [], resultado: "" })
    && await seVe(page, "#planilla-caja") && (await page.getAttribute("#planilla-btn", "aria-pressed")) === "true");
  cierto("en una pantalla ancha va al lado del tablero", await page.evaluate(() => {
    const t = document.getElementById("chessboard").getBoundingClientRect(), p = document.getElementById("planilla-caja").getBoundingClientRect();
    return p.left >= t.right && p.top < t.bottom && t.width > 300;
  }));
  cierto("el profe ve lo suyo (nombres, tablas, resultado)", await seVe(page, "#planilla-profe"));

  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ moves: LEGAL, planilla: { blancas: "", negras: "", tablas: [], resultado: "" } }));
  await page.waitForTimeout(200);
  const c = await celdas(page);
  cierto("las jugadas de la clase se anotan solas, en español", JSON.stringify(c.slice(0, 6)) === JSON.stringify([
    ["1", "e4", "e5"], ["2", "Cf3", "d6"], ["3", "Ac4", "Ag4"], ["4", "Cc3", "g6"], ["5", "Cxe5", "Axd1"], ["6", "Axf7+", "Re7"]]), JSON.stringify(c));
  cierto("la última, resaltada, y el cartel dice cómo se lee",
    (await page.textContent(".planilla-ultima")) === "Re7" && /^6… Re7 — Rey \(R\) va a e7\.$/.test(await page.textContent("#planilla-cartel")),
    await page.textContent("#planilla-cartel"));

  await page.click("#planilla-tablas-btn");
  cierto("«Ofrecer tablas» marca la última jugada con (=)", JSON.stringify((await ultimaPlanilla(page)).tablas) === "[12]"
    && (await page.textContent(".planilla-ultima")) === "Re7 (=)");
  await page.fill("#planilla-blancas-input", "<b>Ana</b> Mora");
  await page.press("#planilla-blancas-input", "Tab");
  cierto("el nombre se guarda y se pinta como texto, no como HTML",
    (await ultimaPlanilla(page)).blancas === "<b>Ana</b> Mora" && (await page.textContent("#planilla-blancas")) === "<b>Ana</b> Mora"
      && (await page.$$("#planilla-blancas b")).length === 0);
  await page.click('#planilla-resultados button[data-resultado="1-0"]');
  cierto("el resultado se anota y su botón queda marcado", (await ultimaPlanilla(page)).resultado === "1-0"
    && (await page.textContent("#planilla-resultado")) === "1-0"
    && (await page.getAttribute('#planilla-resultados button[data-resultado="1-0"]', "aria-pressed")) === "true");
  // El eco de antes del resultado no lo borra.
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ moves: LEGAL, planilla: { blancas: "", negras: "", tablas: [12], resultado: "" } }));
  await page.waitForTimeout(200);
  cierto("un eco viejo no le borra al profe lo que acaba de marcar", (await page.textContent("#planilla-resultado")) === "1-0");

  await page.click("#planilla-cerrar-btn");
  cierto("«Cerrar la planilla» la quita para todos", (await ultimaPlanilla(page)) === null && !(await seVe(page, "#planilla-caja")));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n4. La alumna la ve, sin lo del profe");
  const planilla = { blancas: "Ana Mora", negras: "Luis Vega", tablas: [], resultado: "" };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ moves: LEGAL.concat("Nd5#"), planilla })] });
  await page.waitForSelector("#planilla-caja", { state: "visible", timeout: 10000 });
  cierto("ve la planilla con los nombres", (await page.textContent("#planilla-blancas")) === "Ana Mora" && (await page.textContent("#planilla-negras")) === "Luis Vega");
  cierto("con el mate y su resultado", (await page.textContent(".planilla-ultima")) === "Cd5#" && (await page.textContent("#planilla-resultado")) === "1-0");
  cierto("y no ve los botones del profe", !(await seVe(page, "#planilla-profe")) && !(await seVe(page, "#planilla-btn")));
  cierto("en el celular va debajo del tablero, sin salirse", await (async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    return page.evaluate(() => {
      const t = document.getElementById("chessboard").getBoundingClientRect(), p = document.getElementById("planilla-caja").getBoundingClientRect();
      return p.top >= t.bottom - 1 && p.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
    });
  })());
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ moves: LEGAL, planilla: null }));
  await page.waitForTimeout(200);
  cierto("cuando el profe la cierra, se va", !(await seVe(page, "#planilla-caja")));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { datos(); } catch (e) { cierto("los datos se pudieron leer", false, e && e.stack); }
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumna(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  if (fallos) { console.log("\n" + fallos + " fallo(s)."); process.exit(1); }
  console.log("\n✓ La planilla en vivo está bien.");
})();
