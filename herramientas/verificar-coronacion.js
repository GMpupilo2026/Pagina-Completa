/* Elegir la pieza al coronar (js/coronacion.js), en todos los tableros.

   Varios tableros mandaban `promotion: "q"` fijo: el peón se volvía dama
   siempre, sin preguntar, y la subpromoción —a veces la única que gana, o la
   única que no ahoga— no se podía jugar. No daba ningún error.

   Lo que comprueba:

   1. Que ningún archivo de js/ vuelva a hacer una jugada con la dama escrita
      a mano (`promotion: "q" })`, o `onPromotionNeeded` que contesta
      `cb("q")` sin preguntar).
   2. Que los tableros que antes coronaban solos pregunten con
      js/coronacion.js, y que toda página que los carga cargue también
      js/coronacion.js (lo pone herramientas/tablero-cabecera.py).
   3. Que el diálogo funcione en el navegador: se ve, trae las cuatro piezas
      con su nombre escrito, el foco arranca en la dama, las flechas pasan de
      una a otra, Enter elige, Escape y «Cancelar» no juegan nada, el foco
      vuelve a donde estaba, y el texto pasa WCAG AA contra su fondo real, en
      claro y en oscuro.
   4. Que un tablero de verdad (js/tablero-pregunta.js, el del examen) juegue
      la pieza elegida: a8=C, no a8=D.

       node herramientas/verificar-coronacion.js                             */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

function sinComentarios(s) {
  return s.replace(/<!--[\s\S]*?-->/g, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

// Los tableros donde juega una persona y que antes coronaban en dama solos.
const TABLEROS = [
  "clases-board", "tablero-pregunta", "racha-tactica", "te-reto", "entreno-diagnostico",
  "entreno-aprender", "entreno-practicas", "entreno-tipos", "bot",
];

function pruebaEstatica() {
  console.log("\n=== Ninguna jugada corona en dama sin preguntar ===");
  const dir = path.join(RAIZ, "js");
  const hallados = [];
  for (const nombre of fs.readdirSync(dir)) {
    if (!nombre.endsWith(".js")) continue;
    const s = sinComentarios(fs.readFileSync(path.join(dir, nombre), "utf8"));
    s.split("\n").forEach((linea, i) => {
      // La carta «ascenso» que juega el propio bot no es una jugada de una persona.
      if (/playCard\(color, "ascenso"/.test(linea)) return;
      if (/promotion:\s*["']q["']\s*\}\s*\)/.test(linea) || /onPromotionNeeded:[^\n]*cb\(\s*["']q["']\s*\)/.test(linea)) {
        hallados.push("js/" + nombre + ":" + (i + 1) + "  " + linea.trim());
      }
    });
  }
  cierto("ninguna jugada con la dama escrita a mano", !hallados.length, hallados.join("\n      "));

  for (const t of TABLEROS) {
    const s = sinComentarios(fs.readFileSync(path.join(dir, t + ".js"), "utf8"));
    cierto("js/" + t + ".js pregunta con Coronacion.pedir", /Coronacion\.pedir\(/.test(s));
  }

  const paginas = require("child_process")
    .execSync("git ls-files '*.html'", { cwd: RAIZ, encoding: "utf8" })
    .split("\n").filter((p) => p && !p.startsWith("node_modules/"));
  const sinModulo = [];
  let conTablero = 0;
  for (const p of paginas) {
    const s = sinComentarios(fs.readFileSync(path.join(RAIZ, p), "utf8"));
    if (!TABLEROS.some((t) => new RegExp('src="[^"]*js/' + t + '\\.js').test(s))) continue;
    conTablero += 1;
    if (!/src="[^"]*js\/coronacion\.js"/.test(s)) sinModulo.push(p);
  }
  cierto("las " + conTablero + " páginas con esos tableros cargan js/coronacion.js", conTablero > 0 && !sinModulo.length,
    "faltan: " + sinModulo.join(", ") + " (correr python3 herramientas/tablero-cabecera.py)");
}

// ---------------------------------------------------------------- navegador
function luminancia(rgb) {
  const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

async function montar(page) {
  await page.goto(BASE + "/privacidad.html", { waitUntil: "load" });
  for (const s of ["js/vendor/chess.js", "js/pieza-preferida.js", "js/coronacion.js", "js/tablero-pregunta.js"]) {
    await page.addScriptTag({ url: BASE + "/" + s });
  }
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "abridor"; b.textContent = "abrir";
    document.body.prepend(b);
    b.focus();
  });
}

async function pruebaNavegador(browser, oscuro) {
  const tema = oscuro ? "oscuro" : "claro";
  console.log("\n=== El diálogo de coronar (" + tema + ") ===");
  const ctx = await browser.newContext({ serviceWorkers: "block", colorScheme: oscuro ? "dark" : "light" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await montar(page);
  if (oscuro) await page.evaluate(() => document.documentElement.classList.add("dark"));

  igual("hayQueElegir: peón en séptima a octava", await page.evaluate(() =>
    Coronacion.hayQueElegir(new Chess("8/P7/8/8/8/8/k7/7K w - - 0 1"), "a7", "a8")), true);
  igual("hayQueElegir: jugada sin coronar", await page.evaluate(() =>
    Coronacion.hayQueElegir(new Chess("8/8/8/8/8/P7/k7/7K w - - 0 1"), "a3", "a4")), false);

  // Elegir con el teclado: flecha a la derecha (Torre) y Enter.
  await page.evaluate(() => { window.__eleccion = "pendiente"; Coronacion.pedir("w", (p) => { window.__eleccion = p; }); });
  const d = page.locator("dialog.coronacion-dialogo");
  cierto("el diálogo se ve", await d.evaluate((n) => n.checkVisibility() && n.matches(":modal")));
  igual("las cuatro piezas, con su nombre escrito", await d.locator("button[data-pieza]").allInnerTexts()
    .then((ts) => ts.map((t) => t.replace(/\s+/g, " ").trim().split(" ").pop())), ["Dama", "Torre", "Alfil", "Caballo"]);
  igual("el foco arranca en la dama", await page.evaluate(() => document.activeElement.dataset.pieza), "q");

  const medidas = await d.locator("button[data-pieza]").first().evaluate((b) => {
    const nombre = b.querySelector("span:last-child");
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    return { texto: rgb(getComputedStyle(nombre).color), fondo: rgb(getComputedStyle(b).backgroundColor),
             tituloTexto: rgb(getComputedStyle(b.closest("dialog").querySelector("h2")).color),
             tituloFondo: rgb(getComputedStyle(b.closest("dialog")).backgroundColor) };
  });
  const c1 = contraste(medidas.texto, medidas.fondo), c2 = contraste(medidas.tituloTexto, medidas.tituloFondo);
  cierto("el nombre de la pieza pasa AA (" + c1.toFixed(2) + ":1)", c1 >= 4.5);
  cierto("el título pasa AA (" + c2.toFixed(2) + ":1)", c2 >= 4.5);

  await page.keyboard.press("ArrowRight");
  igual("la flecha pasa a la torre", await page.evaluate(() => document.activeElement.dataset.pieza), "r");
  await page.keyboard.press("Enter");
  igual("Enter elige la torre", await page.evaluate(() => window.__eleccion), "r");
  cierto("el diálogo se cierra", (await d.count()) === 0);
  igual("el foco vuelve a donde estaba", await page.evaluate(() => document.activeElement.id), "abridor");

  // Escape no elige nada.
  await page.evaluate(() => { window.__eleccion = "pendiente"; Coronacion.pedir("b", (p) => { window.__eleccion = p; }); });
  await page.keyboard.press("Escape");
  igual("Escape cancela", await page.evaluate(() => window.__eleccion), null);
  cierto("el diálogo se cierra con Escape", (await d.count()) === 0);

  // «Cancelar» tampoco; y la promesa trae lo mismo que el callback.
  const promesa = page.evaluate(() => Coronacion.pedir("w"));
  await d.getByRole("button", { name: "Cancelar" }).click();
  igual("«Cancelar» cancela (promesa)", await promesa, null);

  // Un tablero de verdad: el del examen.
  console.log("\n=== El tablero del examen juega la pieza elegida (" + tema + ") ===");
  await page.evaluate(() => {
    const nodo = document.createElement("div");
    nodo.id = "tp";
    nodo.className = "grid grid-cols-8";
    nodo.style.width = "320px"; nodo.style.height = "320px";
    document.body.prepend(nodo);
    window.__resp = null;
    TableroPregunta.montar(nodo, { fen: "8/P7/8/8/8/8/k7/7K w - - 0 1", tipo: "jugada", alSeleccionar: (r) => { window.__resp = r; } });
  });
  await page.click('#tp [data-square="a7"]');
  await page.click('#tp [data-square="a8"]');
  cierto("al llegar a la octava pregunta la pieza", await d.evaluate((n) => n.checkVisibility()));
  igual("todavía no hay respuesta", await page.evaluate(() => window.__resp), null);
  await d.getByRole("button", { name: /Caballo/ }).click();
  igual("se juega a8=C (caballo), no dama", await page.evaluate(() => window.__resp && window.__resp.san), "a8=N");

  await page.evaluate(() => { window.__resp = null; });
  await page.click('#tp [data-square="a7"]');
  await page.click('#tp [data-square="a8"]');
  await page.keyboard.press("Escape");
  igual("si se cancela, no se juega nada", await page.evaluate(() => window.__resp), null);

  cierto("sin errores en la página", !errores.length, errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaEstatica();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaNavegador(browser, false);
    await pruebaNavegador(browser, true);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\n✓ Todo bien");
  process.exit(fallos ? 1 : 0);
})();
