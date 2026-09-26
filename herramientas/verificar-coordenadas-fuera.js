/* Comprueba las coordenadas POR FUERA de los tableros (js/coordenadas-tablero.js)
 * y el color de las casillas, en un navegador de verdad.
 *
 * Lo que se rompe sin ningún error y aquí se mide:
 *   - que cada página con tablero cargue el ayudante y que cada dibujante de
 *     tablero lo llame (una página nueva con tablero entra sola por
 *     tablero-cabecera.py; un dibujante nuevo que no lo llame, no);
 *   - que a1 sea OSCURA (en Tipos de entrenamiento salía clara: el tablero
 *     entero estaba al revés y no fallaba nada);
 *   - que las letras queden DEBAJO del tablero, cada una centrada en su
 *     columna, y los números a la IZQUIERDA, cada uno a la altura de su fila,
 *     ninguna encima de una casilla;
 *   - que con el tablero girado se lean h…a y 1…8 (leídas de la casilla, no
 *     de la posición);
 *   - que el tablero de cuatro jugadores, visto desde un costado, escriba los
 *     números abajo y las letras al costado;
 *   - que el color contraste 4,5:1 con el fondo real, también sobre la
 *     tarjeta oscura de la portada y en modo oscuro;
 *   - que las etiquetas sigan al tablero cuando la página lo redibuja, y se
 *     escondan con él.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-coordenadas-fuera.js
 */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const DATOS = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/tipos.json"), "utf8"));

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) { console.log("  ✓ " + nombre); return; }
  fallos += 1;
  console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : ""));
}

/* ---------------------------------------------------------------- sin navegador */
console.log("\n=== Quién lo carga y quién lo llama ===");
{
  // Los dibujantes de tablero del sitio. Los que no están: ilumina-board (no es
  // un tablero de ajedrez: es una figura de casillas sueltas), las miniaturas
  // de ClasesBoard (compact) y entreno-coordenadas (el juego ES adivinar la
  // casilla: rotularla lo regalaría).
  const DIBUJANTES = ["cartas-board", "crazyhouse-board", "duelo-board", "niebla-board", "variantes-board",
    "fourplayer-board", "tablero-board", "clases-board", "article-example-board", "entreno-tipos"];
  DIBUJANTES.forEach((n) => {
    const src = fs.readFileSync(path.join(RAIZ, "js", n + ".js"), "utf8");
    ok(n + ".js llama a Coordenadas.aplicar", /Coordenadas\.aplicar\(/.test(src));
  });
  const juego = fs.readFileSync(path.join(RAIZ, "js/entreno-coordenadas.js"), "utf8");
  ok("el juego de Coordenadas NO rotula su tablero", !/Coordenadas\.aplicar\(/.test(juego));

  // Las páginas con tablero, reconocidas igual que en tablero-cabecera.py.
  const TIENE_TABLERO = /piece-white|PiezaPreferida|js\/[a-z0-9-]*board\.js|tablero-pregunta\.js|ficha-render\.js|finales-100\.js|curso-partidas\.js/;
  const { execSync } = require("child_process");
  const paginas = execSync("git ls-files '*.html'", { cwd: RAIZ, encoding: "utf8" }).split("\n").filter((p) => p && !p.startsWith("node_modules/"));
  const sin = paginas.filter((p) => {
    const html = fs.readFileSync(path.join(RAIZ, p), "utf8");
    return TIENE_TABLERO.test(html) && !/js\/coordenadas-tablero\.js/.test(html);
  });
  ok("toda página con tablero carga js/coordenadas-tablero.js", !sin.length, "faltan: " + sin.join(", "));
}

/* ---------------------------------------------------------------- el doble */
const DOBLE = `(function(){function tabla(){const api={select(){return api},eq(){return api},in(){return api},neq(){return api},gte(){return api},lte(){return api},or(){return api},is(){return api},order(){return api},limit(){return api},range(){return api},
maybeSingle(){return Promise.resolve({data:null,error:null})},single(){return Promise.resolve({data:null,error:null})},upsert(){return Promise.resolve({error:null})},insert(){return Promise.resolve({error:null})},update(){return api},delete(){return api},
then(a,b){return Promise.resolve({data:[],error:null}).then(a,b)}};return api}
window.sb={auth:{getSession:()=>Promise.resolve({data:{session:{user:{id:"u-1",email:"a@b.c"},access_token:"t"}}}),getUser:()=>Promise.resolve({data:{user:{id:"u-1",email:"a@b.c"}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
from:()=>tabla(),rpc:()=>Promise.resolve({data:null,error:null}),channel:()=>({on(){return this},subscribe(){return this},track(){return Promise.resolve()},send(){}}),removeChannel:()=>{}};})();`;

async function abrir(browser, ruta, opciones) {
  const o = opciones || {};
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: o.viewport || { width: 1200, height: 900 } });
  if (o.oscuro) await ctx.addInitScript(() => { try { localStorage.setItem("theme", "dark"); } catch (e) { } });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: DOBLE }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/" + ruta, { waitUntil: "load" });
  return { page, ctx, errores };
}

/* Mide las etiquetas contra el tablero: devuelve lo que se ve y los problemas. */
async function medir(page, selector) {
  await page.waitForTimeout(250);   // el ayudante recoloca en el cuadro siguiente
  return page.evaluate((sel) => {
    const t = document.querySelector(sel);
    const m = t && t.__coordenadas;
    if (!t || !m) return { error: "no hay capa de coordenadas en " + sel };
    const vis = (e) => e.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    const etiquetas = [...m.children].filter(vis).map((s) => ({ s, r: s.getBoundingClientRect(), texto: s.textContent }));
    // En el de cuatro las de las esquinas caen dentro del recuadro del tablero
    // (debajo de la última casilla de su columna): se agrupan por su clase y
    // lo de «no pisa ninguna casilla» se mide aparte, casilla por casilla.
    const abajo = etiquetas.filter((e) => e.s.classList.contains("coord-columna")).sort((a, b) => a.r.left - b.r.left);
    const izq = etiquetas.filter((e) => e.s.classList.contains("coord-fila")).sort((a, b) => a.r.top - b.r.top);
    const casillas = [...t.querySelectorAll("[data-square]")].map((c) => ({ c, r: c.getBoundingClientRect() }));
    const problemas = [];
    etiquetas.forEach((e) => {
      const cx = e.r.left + e.r.width / 2, cy = e.r.top + e.r.height / 2;
      if (casillas.some((q) => cx > q.r.left && cx < q.r.right && cy > q.r.top && cy < q.r.bottom)) problemas.push("«" + e.texto + "» está encima de una casilla");
    });
    // Cada letra, centrada en la columna de la casilla de la fila de abajo que la lleva.
    abajo.forEach((e) => {
      const cx = e.r.left + e.r.width / 2;
      const col = casillas.filter((q) => Math.abs(q.r.left + q.r.width / 2 - cx) < 1.5);
      if (!col.length) problemas.push("«" + e.texto + "» no está centrada en ninguna columna");
    });
    izq.forEach((e) => {
      const cy = e.r.top + e.r.height / 2;
      const fila = casillas.filter((q) => Math.abs(q.r.top + q.r.height / 2 - cy) < 1.5);
      if (!fila.length) problemas.push("«" + e.texto + "» no está a la altura de ninguna fila");
    });
    // El contraste contra el fondo real (se mezclan los fondos de los ancestros).
    const rgba = (x) => { const k = /rgba?\(([^)]+)\)/.exec(x || ""); if (!k) return null; const v = k[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
    const capas = [];
    for (let n = t.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const tonos = /gradient/.test(cs.backgroundImage) ? (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(rgba) : [];
      if (tonos.length) { const p = [0, 1, 2, 3].map((k) => tonos.reduce((s, c) => s + c[k], 0) / tonos.length); capas.push(p); if (p[3] >= 1) break; }
      const c = rgba(cs.backgroundColor); if (c && c[3] > 0) { capas.push(c); if (c[3] >= 1) break; }
    }
    let f = [255, 255, 255];
    for (let i = capas.length - 1; i >= 0; i--) { const c = capas[i]; f = [0, 1, 2].map((k) => c[k] * c[3] + f[k] * (1 - c[3])); }
    const L = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const color = etiquetas.length ? rgba(getComputedStyle(etiquetas[0].s).color) : [0, 0, 0];
    const x = L(color), y = L(f);
    return {
      abajo: abajo.map((e) => e.texto).join(" "),
      izq: izq.map((e) => e.texto).join(" "),
      total: etiquetas.length,
      problemas,
      contraste: (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05),
      hermana: t.nextSibling === m,
    };
  }, selector);
}

function revisar(nombre, v, esperado) {
  if (v.error) { ok(nombre, false, v.error); return; }
  ok(nombre + ": letras abajo " + esperado.abajo, v.abajo === esperado.abajo, "se ve «" + v.abajo + "»");
  ok(nombre + ": números a la izquierda " + esperado.izq, v.izq === esperado.izq, "se ve «" + v.izq + "»");
  ok(nombre + ": todas por fuera y alineadas", !v.problemas.length, v.problemas.slice(0, 4).join(" | "));
  ok(nombre + ": contraste 4,5:1 o más con el fondo", v.contraste >= 4.5, v.contraste.toFixed(2));
}

async function main() {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\n=== Tipos de entrenamiento: el color de las casillas y las coordenadas ===");
  {
    const item = DATOS.detective.find((x) => x.nivel === 1);
    const { page, ctx, errores } = await abrir(browser, "entreno/tipos.html#detective/1/" + item.id);
    await page.waitForSelector("#vista-juego:not(.hidden) #tablero [data-square]");
    const fondos = await page.evaluate(() => {
      const bg = (s) => getComputedStyle(document.querySelector('#tablero [data-square="' + s + '"]')).backgroundColor;
      const L = (t) => { const v = t.match(/\d+/g).map(Number); return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722; };
      return { a1: L(bg("a1")), h1: L(bg("h1")), a8: L(bg("a8")), e4: L(bg("e4")), d4: L(bg("d4")) };
    });
    ok("a1 es oscura y h1 clara", fondos.a1 < fondos.h1, JSON.stringify(fondos));
    ok("a8 es clara, e4 clara y d4 oscura", fondos.a8 > fondos.a1 && fondos.e4 > fondos.d4, JSON.stringify(fondos));
    const v = await medir(page, "#tablero");
    revisar("Detective", v, { abajo: "a b c d e f g h", izq: "8 7 6 5 4 3 2 1" });
    ok("la capa va justo después del tablero", v.hermana);

    // La página rehace el tablero en cada ejercicio: las etiquetas lo siguen.
    await page.getByRole("button", { name: /Siguiente/ }).click();
    await page.waitForTimeout(300);
    const v2 = await medir(page, "#tablero");
    ok("tras redibujar siguen las 16, en su lugar", v2.total === 16 && !v2.problemas.length && v2.hermana, JSON.stringify(v2).slice(0, 200));

    // Al volver a la lista de niveles el tablero se esconde, y las etiquetas con él.
    await page.goto(BASE + "/entreno/tipos.html#detective");
    await page.waitForSelector("#vista-tipo:not(.hidden)");
    await page.waitForTimeout(300);
    const visibles = await page.evaluate(() => [...document.querySelectorAll(".coord-marco span")].filter((s) => s.checkVisibility()).length);
    ok("con el tablero escondido no queda ninguna etiqueta a la vista", visibles === 0, visibles + " visibles");
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Modo oscuro ===");
  {
    const item = DATOS.detective.find((x) => x.nivel === 1);
    const { page, ctx } = await abrir(browser, "entreno/tipos.html#detective/1/" + item.id, { oscuro: true });
    await page.waitForSelector("#vista-juego:not(.hidden) #tablero [data-square]");
    revisar("Detective en modo oscuro", await medir(page, "#tablero"), { abajo: "a b c d e f g h", izq: "8 7 6 5 4 3 2 1" });
    await ctx.close();
  }

  console.log("\n=== La portada: tablero sobre una tarjeta oscura ===");
  for (const vp of [{ width: 1200, height: 900 }, { width: 390, height: 844 }]) {
    const { page, ctx, errores } = await abrir(browser, "index.html", { viewport: vp });
    await page.waitForSelector("#chessboard [data-square]");
    await page.evaluate(() => document.getElementById("chessboard").scrollIntoView({ block: "center" }));
    revisar("Portada a " + vp.width + " px", await medir(page, "#chessboard"), { abajo: "a b c d e f g h", izq: "8 7 6 5 4 3 2 1" });
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Tablero girado (el bot, jugando con negras) ===");
  {
    const { page, ctx, errores } = await abrir(browser, "bot.html");
    await page.getByText("Ajedrez Estándar", { exact: false }).first().click();
    await page.getByText("Negras", { exact: false }).first().click();
    await page.click("#empezar-btn");
    await page.waitForFunction(() => document.querySelector(".coord-marco:not([hidden])"), null, { timeout: 10000 }).catch(() => {});
    const sel = await page.evaluate(() => { const m = document.querySelector(".coord-marco:not([hidden])"); const t = m && m.previousElementSibling; if (!t) return null; t.id = t.id || "tablero-girado"; return "#" + t.id; });
    if (!sel) ok("el bot pinta un tablero con coordenadas", false);
    else revisar("Bot con negras", await medir(page, sel), { abajo: "h g f e d c b a", izq: "1 2 3 4 5 6 7 8" });
    ok("sin errores en consola", !errores.length, errores.join(" | "));
    await ctx.close();
  }

  console.log("\n=== Ajedrez para 4: sin esquinas y girado según el asiento ===");
  for (const [asiento, esperado] of [
    ["red", { abajo: "a b c d e f g h i j k l m n", izq: "14 13 12 11 10 9 8 7 6 5 4 3 2 1" }],
    ["blue", { abajo: "14 13 12 11 10 9 8 7 6 5 4 3 2 1", izq: "n m l k j i h g f e d c b a" }],
  ]) {
    const { page, ctx } = await abrir(browser, "cuatro-jugadores.html");
    await page.evaluate((seat) => {
      const el = document.getElementById("board");
      for (let n = el; n; n = n.parentElement) if (n.classList) n.classList.remove("hidden");
      const b = new FourPlayerBoard(el, { mySeat: seat });
      b.loadGame(new FourPlayerChess.Game("ffa", ["red", "blue", "yellow", "green"]));
    }, asiento);
    revisar("Asiento " + asiento, await medir(page, "#board"), esperado);
    const nombre = await page.evaluate(() => document.querySelector('#board [data-square="3,0"]').getAttribute("aria-label"));
    ok("la casilla 3,0 se nombra d1 también para el lector de pantalla", /Casilla d1:/.test(nombre), nombre);
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobaciones fallaron" : "\n✓ Todo en orden");
  process.exit(fallos ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
