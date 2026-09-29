/* ===== Verificador: Mates usa la dificultad medida solo cuando alcanza =====
 *
 * La página de Mates lee entreno/data/mates-dificultad.json (lo escribe
 * herramientas/mates-calibrar.js) y, con js/mates-dificultad.js, ordena de
 * fácil a difícil SOLO las categorías con el 80 % de sus mates calibrados.
 * Se prueba con archivos inventados (servidos en lugar del de verdad):
 *   - con el archivo de hoy (nada calibrado), barajado por bloques con la
 *     semilla del alumno;
 *   - con Mate en 1 calibrado entero, Mate en 1 va de fácil a difícil y dice
 *     la dificultad, y Mate en 2 (sin calibrar) sigue en el orden del libro;
 *   - con un 79 %, el orden del libro;
 *   - sin archivo, la página funciona igual.
 *
 * Uso: node herramientas/verificar-mates-dificultad.js (con el sitio en :8777)
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const doble = require("./lib/doble-entreno");
const MD = require("../js/mates-dificultad.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const RAIZ = path.join(__dirname, "..");
let fallos = 0;
const ok = (cond, texto, detalle) => {
  if (cond) console.log("  ✓ " + texto);
  else { fallos += 1; console.log("  ✗ " + texto + (detalle !== undefined ? "\n      " + detalle : "")); }
};

const banco = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/mates.json"), "utf8"));
const ids = (cat) => banco.filter((p) => p.category === cat).map((p) => p.id);
const total = { mate1: ids("mate1").length, mate2: ids("mate2").length, mate3: ids("mate3").length };

/* Un archivo con los primeros `cuantos` mates de `cat` calibrados, AL REVÉS del
   libro (el último del libro es el más fácil): así se nota si se ordena. */
function inventado(cat, cuantos) {
  const elo = {};
  ids(cat).slice(0, cuantos).forEach((id, i) => { elo[id] = 2000 - i; });
  const categorias = {};
  Object.keys(total).forEach((c) => { categorias[c] = { centro: 1500, calibrados: c === cat ? cuantos : 0, total: total[c] }; });
  return { generado: "2026-09-29", intentos: 9999, alumnos: 99, minimo: 8, categorias, elo };
}

/* ---------- 1. la regla, sin navegador ---------- */
console.log("\n=== js/mates-dificultad.js ===");
{
  const lista = [{ id: "mate1-a" }, { id: "mate1-b" }, { id: "mate1-c" }, { id: "mate1-d" }];
  const datos = { categorias: { mate1: { centro: 1200, calibrados: 4, total: 5 } }, elo: { "mate1-a": 1500, "mate1-b": 900, "mate1-d": 900 } };
  ok(MD.ordenar(lista, datos, "mate1").map((p) => p.id).join() === "mate1-b,mate1-d,mate1-c,mate1-a",
    "de fácil a difícil; el que no tiene medida va con el centro, y los empates guardan el orden del libro",
    MD.ordenar(lista, datos, "mate1").map((p) => p.id).join());
  const pocos = { categorias: { mate1: { centro: 1200, calibrados: 3, total: 4 } }, elo: datos.elo };
  ok(MD.ordenar(lista, pocos, "mate1").map((p) => p.id).join() === "mate1-a,mate1-b,mate1-c,mate1-d", "con menos del 80 % calibrado, el orden del libro");
  ok(MD.ordenar(lista, null, "mate1").map((p) => p.id).join() === "mate1-a,mate1-b,mate1-c,mate1-d", "sin datos, el orden del libro");
  ok(MD.ordenar(lista, datos, "mate1") !== lista, "devuelve una copia: no toca la lista que recibe");

  // Mientras no hay dificultad, se baraja por bloques con la semilla del alumno.
  const larga = Array.from({ length: 130 }, (_, i) => ({ id: "m" + i }));
  const a = MD.barajar(larga, "u-ana").map((p) => p.id);
  ok(JSON.stringify(a) === JSON.stringify(MD.barajar(larga, "u-ana").map((p) => p.id)), "la misma semilla da siempre el mismo orden (cualquier aparato)");
  ok(JSON.stringify(a) !== JSON.stringify(MD.barajar(larga, "u-beto").map((p) => p.id)), "otro alumno, otro orden: los intentos se reparten");
  ok(a.every((id, i) => Math.floor(Number(id.slice(1)) / MD.BLOQUE) === Math.floor(i / MD.BLOQUE)) && new Set(a).size === 130,
    `cada mate se queda en su bloque de ${MD.BLOQUE}: el orden grueso del libro se mantiene`);
  ok(a.slice(0, MD.BLOQUE).join() !== larga.slice(0, MD.BLOQUE).map((p) => p.id).join(), "y dentro del bloque sí cambia");
  ok(MD.barajar(larga, null).map((p) => p.id).join() === larga.map((p) => p.id).join(), "sin semilla (sin sesión), el orden del libro");
  ok(MD.orden(lista, datos, "mate1", "u-ana").map((p) => p.id).join() === "mate1-b,mate1-d,mate1-c,mate1-a", "calibrada, manda la dificultad y no se baraja");
}
// El doble de sesión es "u-ana" (herramientas/lib/doble-entreno.js).
const barajado = (cat) => MD.barajar(banco.filter((p) => p.category === cat), "u-ana").map((p) => p.id);

async function abrir(browser, archivo) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: doble.clienteFalso({}) }));
  if (archivo === "falta") await ctx.route("**/data/mates-dificultad.json", (r) => r.fulfill({ status: 404, body: "" }));
  else if (archivo) await ctx.route("**/data/mates-dificultad.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(archivo) }));
  await page.goto(doble.BASE + "/entreno/mates.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => PUZZLES.mate1.length > 0 && document.getElementById("progress-label").textContent, null, { timeout: 20000 });
  return { page, ctx, errores };
}
const estado = (page) => page.evaluate(() => ({
  cat: currentCategory, id: currentPuzzle().id, etiqueta: document.getElementById("progress-label").textContent,
  mate1: PUZZLES.mate1.map((p) => p.id), mate2: PUZZLES.mate2.map((p) => p.id),
}));

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== Con el archivo de verdad ===");
    {
      const { page, ctx, errores } = await abrir(browser, null);
      const e = await estado(page);
      const real = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/mates-dificultad.json"), "utf8"));
      const esperado = MD.ordenada(real, "mate1") ? MD.ordenar(banco.filter((p) => p.category === "mate1"), real, "mate1").map((p) => p.id) : barajado("mate1");
      ok(e.mate1.join() === esperado.join(), MD.ordenada(real, "mate1") ? "Mate en 1 va de fácil a difícil" : "Mate en 1 va barajado por bloques con la semilla del alumno (todavía no alcanza para calibrar)");
      ok(!errores.length, "sin errores en la página", errores.join(" | "));
      await ctx.close();
    }

    console.log("\n=== Mate en 1 calibrado entero ===");
    {
      const { page, ctx, errores } = await abrir(browser, inventado("mate1", total.mate1));
      const e = await estado(page);
      ok(e.mate1.join() === ids("mate1").slice().reverse().join(), "Mate en 1 va de fácil a difícil (acá, al revés del libro)");
      ok(e.id === ids("mate1")[total.mate1 - 1], "arranca por el más fácil", e.id);
      ok(new RegExp(`dificultad ≈${2000 - (total.mate1 - 1)}$`).test(e.etiqueta), "la barra dice la dificultad, en números", e.etiqueta);
      ok(e.mate2.join() === barajado("mate2").join(), "Mate en 2, sin calibrar, va barajado por bloques");
      await page.click("#tabs button:nth-child(2)");
      const e2 = await estado(page);
      ok(e2.cat === "mate2" && e2.id === barajado("mate2")[0] && !/dificultad/.test(e2.etiqueta), "y al pasar a Mate en 2 arranca por el primero del barajado, sin decir dificultad", e2.etiqueta);
      ok(!errores.length, "sin errores en la página", errores.join(" | "));
      await ctx.close();
    }

    console.log("\n=== Con el 79 % ===");
    {
      const cuantos = Math.floor(total.mate1 * 0.79);
      const { page, ctx } = await abrir(browser, inventado("mate1", cuantos));
      const e = await estado(page);
      ok(e.mate1.join() === barajado("mate1").join() && !/dificultad/.test(e.etiqueta), `con ${cuantos} de ${total.mate1} calibrados, barajado y sin dificultad`, e.etiqueta);
      await ctx.close();
    }

    console.log("\n=== Sin el archivo ===");
    {
      const { page, ctx, errores } = await abrir(browser, "falta");
      const e = await estado(page);
      ok(e.mate1.join() === barajado("mate1").join() && e.id === barajado("mate1")[0], "la página funciona igual, barajada por bloques");
      ok(!errores.length, "sin errores en la página", errores.join(" | "));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  if (fallos) { console.log(`\n${fallos} comprobación(es) fallaron.`); process.exit(1); }
  console.log("\nTodo en orden.");
}
main().catch((e) => { console.error(e); process.exit(1); });
