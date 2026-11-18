/* El explorador de aperturas en la clase en vivo (js/clase-explorador.js).
 *
 * Lo que se comprueba, y por qué cada cosa se rompería sin avisar:
 *
 *   1. LAS CUENTAS (en Node): el reparto por jugada sale del total de la
 *      posición, cada jugada dice cuánto ganan blancas, tablas y negras SOBRE
 *      SUS partidas, van ordenadas de la más jugada a la menos, como mucho
 *      ocho, y una jugada sin partidas no sale. La clave de la posición deja
 *      fuera los contadores de jugadas (si no, la misma posición se pediría
 *      dos veces).
 *   2. EL PANEL DE VERDAD (con el marcado sacado de sesion.html, en el
 *      navegador): arranca apagado y sin pedir nada; al encenderlo pide la
 *      posición UNA vez; mover rápido no pide cada jugada (la espera); volver
 *      a una posición ya vista no la vuelve a pedir; las cifras van escritas,
 *      no solo en la barrita; una posición fuera de la teoría lo dice; y un
 *      403 dice que no está activo, no un error genérico.
 *   3. EL CABLEADO: sesion.js avisa al explorador dentro de updateEngineEval()
 *      (el mismo lugar que el motor, así no hay un segundo aviso que olvidar)
 *      y lo monta solo para el profesor; la Edge Function deja pasar a todo
 *      profesor y a quien administra, con la sesión de quien llama.
 *
 * Uso:  node herramientas/verificar-clase-explorador.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");
require("./lib/navegador-local");

const RAIZ = path.join(__dirname, "..");
const E = require(path.join(RAIZ, "js", "clase-explorador.js"));

let fallos = 0;
function ok(cond, msg) {
  if (cond) console.log("  ✓ " + msg);
  else { console.log("  ✗ " + msg); fallos++; }
}

// ---------- 1. Las cuentas ----------
console.log("Las cuentas:");
{
  const datos = {
    w: 500, d: 300, b: 200,
    apertura: { eco: "C50", nombre: "Italian Game" },
    jugadas: [
      { san: "Nf6", w: 50, d: 30, b: 20 },
      { san: "Bc5", w: 300, d: 150, b: 150 },
      { san: "h6", w: 0, d: 0, b: 0 },
      ...Array.from({ length: 9 }, (_, i) => ({ san: "x" + i, w: 1, d: 1, b: i })),
    ],
  };
  const r = E.resumen(datos);
  ok(r.total === 1000, "el total de la posición es la suma de blancas, tablas y negras");
  ok(r.apertura === "C50 · Italian Game", "la apertura lleva su código ECO");
  ok(r.jugadas[0].san === "Bc5" && r.jugadas[1].san === "Nf6", "de la más jugada a la menos");
  ok(r.jugadas[0].reparto === 60, "el reparto sale del total de la posición (600 de 1000 = 60 %)");
  ok(r.jugadas[0].blancas === 50 && r.jugadas[0].tablas === 25 && r.jugadas[0].negras === 25,
    "blancas, tablas y negras sobre las partidas de ESA jugada");
  ok(!r.jugadas.some((j) => j.san === "h6"), "una jugada sin partidas no sale");
  ok(r.jugadas.length === 8, "como mucho ocho jugadas");
  ok(/ganan blancas 50 % · tablas 25 % · ganan negras 25 %/.test(E.frase(r.jugadas[0])), "la frase dice las tres cifras con su nombre");
  ok(E.resumen({ w: 0, d: 0, b: 0, jugadas: [] }).total === 0, "una posición sin partidas da total 0");
  ok(E.clave("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1") ===
     E.clave("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 5 9"),
     "la clave no depende de los contadores de jugadas");
}

// ---------- 3. El cableado (estático) ----------
console.log("El cableado:");
{
  const sesion = fs.readFileSync(path.join(RAIZ, "js", "sesion.js"), "utf8");
  const ini = sesion.indexOf("async function updateEngineEval()");
  const cuerpo = sesion.slice(ini, ini + 600);
  ok(ini > 0 && /ClaseExplorador\.posicion\(board\.fen\(\)\)/.test(cuerpo.split("if (!engineEnabled")[0]),
    "updateEngineEval() avisa al explorador ANTES de mirar si el motor está encendido");
  const monta = sesion.indexOf("ClaseExplorador.montar()");
  const profe = sesion.lastIndexOf("if (isTeacher) {", monta);
  ok(monta > 0 && profe > 0 && monta - profe < 1500, "se monta dentro del bloque del profesor");
  // Al montar, el tablero todavía puede ser null: un board.fen() ahí tumbó la clase
  // entera en el CI (la app no se mostraba) sin ningún error a la vista.
  ok(!/board/.test(sesion.slice(monta - 200, monta + 120).split("ClaseExplorador.montar()")[1] || "x")
     && !/ClaseExplorador\.montar\(\);\s*ClaseExplorador\.posicion/.test(sesion),
    "al montarlo no se toca el tablero (puede no existir todavía)");
  ok(/ClaseExplorador && board && /.test(cuerpo), "updateEngineEval solo le avisa si ya hay tablero");
  const html = fs.readFileSync(path.join(RAIZ, "sesion.html"), "utf8");
  ok(html.indexOf('src="js/clase-explorador.js"') > 0 && html.indexOf('src="js/clase-explorador.js"') < html.indexOf('src="js/sesion.js"'),
    "sesion.html carga clase-explorador.js antes que sesion.js");
  const fn = fs.readFileSync(path.join(RAIZ, "supabase", "functions", "explorador-maestros", "index.ts"), "utf8");
  ok(/perfil\.role === "profesor" \|\| perfil\.is_admin === true/.test(fn), "la Edge Function deja pasar a profesores y a quien administra");
  ok(/usuario\.from\("profiles"\)/.test(fn) && !/admin\.from\("profiles"\)/.test(fn),
    "el permiso se mira con la sesión de quien llama, no con la clave de servicio");
}

// ---------- 2. El panel de verdad ----------
async function panel() {
  console.log("El panel:");
  const html = fs.readFileSync(path.join(RAIZ, "sesion.html"), "utf8");
  const m = html.match(/<section id="explorador-panel"[\s\S]*?<\/section>/);
  assert(m, "no encontré #explorador-panel en sesion.html");
  const js = fs.readFileSync(path.join(RAIZ, "js", "clase-explorador.js"), "utf8");
  const css = fs.readFileSync(path.join(RAIZ, "css", "tailwind.css"), "utf8");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${m[0]}</body></html>`);
  await page.addScriptTag({ content: js });

  const INI = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
  const E4E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
  const RARA = "8/8/8/8/8/8/k7/K7 w - - 0 1";

  await page.evaluate(({ INI, E4, E4E5, RARA }) => {
    const clave = (f) => f.split(" ").slice(0, 4).join(" ");
    const R = {
      [clave(INI)]: { w: 900, d: 700, b: 400, apertura: null, jugadas: [{ san: "e4", w: 450, d: 300, b: 250 }, { san: "d4", w: 400, d: 350, b: 150 }] },
      [clave(E4)]: { w: 500, d: 300, b: 200, apertura: { eco: "B00", nombre: "King's Pawn" }, jugadas: [{ san: "c5", w: 300, d: 150, b: 150 }] },
      [clave(E4E5)]: { w: 100, d: 50, b: 50, apertura: { eco: "C20", nombre: "King's Pawn Game" }, jugadas: [{ san: "Nf3", w: 100, d: 50, b: 50 }] },
      [clave(RARA)]: { w: 0, d: 0, b: 0, apertura: null, jugadas: [] },
    };
    window.__pedidos = [];
    window.__modo = "bien";
    window.ClaseExplorador.montar({
      pedir: async (fens) => {
        window.__pedidos.push(fens[0]);
        if (window.__modo === "403") return { error: { context: { status: 403 } } };
        return { data: { posiciones: { [fens[0]]: R[fens[0]] }, faltan: [], motivo: null } };
      },
    });
    window.ClaseExplorador.posicion(INI);
  }, { INI, E4, E4E5, RARA });

  const pedidos = () => page.evaluate(() => window.__pedidos.length);
  const estado = () => page.locator("#explorador-estado").textContent();
  const visible = (sel) => page.locator(sel).evaluate((el) => el.checkVisibility());

  ok(await visible("#explorador-panel"), "el panel se ve al montarlo");
  ok(!(await visible("#explorador-salida")), "arranca apagado: la lista no se ve");
  await page.waitForTimeout(700);
  ok((await pedidos()) === 0, "apagado no pide nada aunque cambie la posición");
  ok((await page.locator("#explorador-toggle-btn").getAttribute("aria-pressed")) === "false", "el botón dice que está apagado (aria-pressed)");

  await page.click("#explorador-toggle-btn");
  await page.waitForFunction(() => document.querySelectorAll("#explorador-jugadas li").length === 2);
  ok((await pedidos()) === 1, "al encenderlo pide la posición del tablero, una vez");
  ok((await page.locator("#explorador-toggle-btn").getAttribute("aria-pressed")) === "true", "el botón dice que está encendido");
  ok(await visible("#explorador-salida"), "encendido, la lista se ve");
  const primera = await page.locator("#explorador-jugadas li").first().textContent();
  ok(/e4/.test(primera) && /50 % de las veces/.test(primera) && /ganan blancas 45 %/.test(primera),
    "cada jugada dice su reparto y cómo les fue, escrito");
  ok(/2000 partidas de maestros|2\s?000 partidas de maestros/.test(await estado()), "dice cuántas partidas pasaron por la posición");
  const barra = await page.locator("#explorador-jugadas li div[aria-hidden='true']").first().count();
  ok(barra === 1, "la barrita de colores es un adorno (aria-hidden)");

  // Mover rápido: e4 y, 150 ms después, e5 (como un profe que recorre una línea).
  // Solo se pide la última. Las dos en el mismo instante no prueban la espera:
  // hasta un setTimeout de 0 las juntaría.
  await page.evaluate(async ({ E4, E4E5 }) => {
    ClaseExplorador.posicion(E4);
    await new Promise((r) => setTimeout(r, 150));
    ClaseExplorador.posicion(E4E5);
  }, { E4, E4E5 });
  await page.waitForFunction(() => /C20/.test(document.getElementById("explorador-apertura").textContent));
  ok((await pedidos()) === 2, "mover rápido no pide cada jugada: solo la posición donde se para");

  // Volver a la posición inicial (ya vista): no se vuelve a pedir.
  await page.evaluate(({ INI }) => ClaseExplorador.posicion(INI), { INI });
  await page.waitForTimeout(700);
  ok((await pedidos()) === 2, "volver a una posición ya vista no la vuelve a pedir");
  ok((await page.locator("#explorador-jugadas li").count()) === 2, "y la pinta igual con lo guardado");

  await page.evaluate(({ RARA }) => ClaseExplorador.posicion(RARA), { RARA });
  await page.waitForFunction(() => /fuera de la teoría/.test(document.getElementById("explorador-estado").textContent));
  ok((await page.locator("#explorador-jugadas li").count()) === 0, "fuera de la teoría lo dice y no deja jugadas viejas");

  await page.evaluate(({ E4 }) => { window.__modo = "403"; ClaseExplorador.posicion(E4); }, { E4 });
  await page.waitForFunction(() => /no está activo/.test(document.getElementById("explorador-estado").textContent));
  ok(true, "un 403 dice que no está activo para la cuenta");

  await page.click("#explorador-toggle-btn");
  ok(!(await visible("#explorador-salida")), "al apagarlo la lista se esconde");

  await browser.close();
}

panel().then(() => {
  if (fallos) { console.log("\n✗ " + fallos + " comprobación(es) fallaron."); process.exit(1); }
  console.log("\n✓ Todo bien.");
}).catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
