/* Comprueba entreno/estudio.html en un navegador de verdad.
 *
 * Estudio es la puerta chica de entreno/fichas.html: las mismas 12 fichas de
 * apertura y defensa (de las 28 que tiene Fichas), sin pestañas ni buscador
 * — antes tenía sus propias tarjetas simples (nombre + tablero, sin mapa de
 * ideas), repartidas en dos pestañas "Aperturas"/"Defensas"; ahora usa las
 * fichas de verdad y las pinta juntas, agrupadas en dos secciones con su
 * propio <h2>. El mapa y el tablero los pinta js/ficha-render.js, compartido
 * con Fichas — herramientas/verificar-fichas-pagina.js ya comprueba esa
 * lógica a fondo (bloques, tablero jugada por jugada, impresión,
 * accesibilidad); esto es lo que le toca solo a Estudio: que sean las 12
 * fichas correctas, agrupadas bien, sin pestañas, y que el enlace de
 * practicar siga funcionando desde acá.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       npm install chess.js@0.10.3 playwright
 *       node herramientas/verificar-estudio.js                */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { FICHAS } = require(path.join(__dirname, "..", "js", "fichas-estudio.js"));
const { LINEAS } = require(path.join(__dirname, "..", "js", "aperturas-lineas.js"));

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const POR_ID = new Map(LINEAS.map((L) => [L.id, L]));
const ESTUDIO = FICHAS.filter((F) => F.categoria === "apertura" || F.categoria === "defensa");
const APERTURAS = ESTUDIO.filter((F) => F.categoria === "apertura");
const DEFENSAS = ESTUDIO.filter((F) => F.categoria === "defensa");

let CHESSJS = "";
for (const base of String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
                  .concat([path.join(__dirname, "..", "node_modules")])) {
  const f = path.join(base, "chess.js", "chess.js");
  if (!CHESSJS && fs.existsSync(f)) CHESSJS = fs.readFileSync(f, "utf8");
}
if (!CHESSJS) { console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3"); process.exit(2); }
const CJS = require("chess.js");
const Chess = CJS.Chess || CJS;

const GLYPH = { w: { p:"♙", n:"♘", b:"♗", r:"♖", q:"♕", k:"♔" }, b: { p:"♟", n:"♞", b:"♝", r:"♜", q:"♛", k:"♚" } };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const CON_SESION = `
(function () {
  window.sb = { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" } } } }) } };
})();
`;
const SIN_SESION = CON_SESION.replace("session: { user: { id: \"u-ana\" } }", "session: null");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + (a.length > 90 ? a.slice(0, 90) + "…" : a));
}

async function abrir(browser, ruta, cliente) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente || CON_SESION }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

const LEER_TABLERO = () => {
  const piezas = {};
  document.querySelectorAll("#tablero .sq").forEach((c) => {
    const s = c.querySelector("span:not(.coord-etiqueta)");
    if (s && s.textContent.trim()) piezas[c.dataset.square] = s.textContent.trim();
  });
  return piezas;
};
const ordenado = (piezas) => Object.keys(piezas).sort().map((k) => k + piezas[k]).join(" ");
function tableroEsperado(jugadas, hasta) {
  const g = new Chess();
  for (let i = 0; i < hasta; i++) g.move(jugadas[i], { sloppy: true });
  const piezas = {};
  for (let r = 1; r <= 8; r++) FILES.forEach((f) => {
    const p = g.get(f + r);
    if (p) piezas[f + r] = GLYPH[p.color][p.type];
  });
  return piezas;
}
function jugadasDe(F) { return POR_ID.get(F.lineaId).jugadas; }

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("=== Sin sesión no se entra ===");
    {
      const { page, ctx } = await abrir(browser, "/entreno/estudio.html", SIN_SESION);
      await page.waitForURL(/login\.html/, { timeout: 15000 }).catch(() => {});
      igual("manda a iniciar sesión, con el volver puesto",
        /login\.html\?next=entreno%2Festudio\.html/.test(page.url()), "true");
      await ctx.close();
    }

    console.log("\n=== Las fichas de aperturas y defensas, juntas y sin pestañas ===");
    const { page, ctx, errores } = await abrir(browser, "/entreno/estudio.html");
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

    igual("no queda ninguna pestaña en la página",
      await page.evaluate(() => document.querySelectorAll("nav.tabs, .tab").length), 0);
    igual("ni buscador: para eso está Fichas",
      await page.evaluate(() => document.querySelectorAll("#buscar").length), 0);
    igual("se ven todas las fichas de aperturas y defensas de una", await page.evaluate(() => document.querySelectorAll(".ficha-item").length), ESTUDIO.length);
    igual("agrupadas en dos <h2>: Aperturas y Defensas",
      await page.evaluate(() => [...document.querySelectorAll("h2.study-group-title")].map((h) => h.textContent)),
      ["Aperturas", "Defensas"]);
    igual("bajo «Aperturas» van exactamente las 6 de esa categoría, en orden",
      await page.evaluate(() => {
        const h2 = [...document.querySelectorAll("h2.study-group-title")].find((h) => h.textContent === "Aperturas");
        return [...h2.nextElementSibling.querySelectorAll(".ficha-item .name")].map((n) => n.textContent);
      }), APERTURAS.map((F) => F.titulo));
    igual("bajo «Defensas» van las 6 suyas",
      await page.evaluate(() => {
        const h2 = [...document.querySelectorAll("h2.study-group-title")].find((h) => h.textContent === "Defensas");
        return [...h2.nextElementSibling.querySelectorAll(".ficha-item .name")].map((n) => n.textContent);
      }), DEFENSAS.map((F) => F.titulo));

    console.log("\n=== Una ficha: el mapa completo y el tablero ===");
    const F1 = ESTUDIO.find((F) => F.id === "espanola");
    await page.evaluate((nombre) => {
      [...document.querySelectorAll(".ficha-item")].find((b) => b.textContent.indexOf(nombre) !== -1).click();
    }, F1.titulo);
    await page.waitForSelector("#ficha-vista", { state: "visible", timeout: 5000 });

    igual("el título y la etiqueta de categoría son los de la ficha",
      await page.evaluate(() => [document.getElementById("ficha-titulo").textContent, document.getElementById("ficha-etiqueta").textContent]),
      [F1.titulo, "Aperturas"]);
    igual("los cinco bloques traen sus propios renglones",
      await page.evaluate(() => ["idea", "1", "2", "3", "4"].map((s) =>
        [...document.querySelectorAll("#l-" + s + " li")].map((li) => li.textContent))),
      [F1.centro].concat(F1.bloques));

    const jugadas1 = jugadasDe(F1);
    igual("el tablero arranca en la posición de salida de la línea",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(jugadas1, 0)));
    await page.click("#b-final");
    igual("y llega hasta la posición final, pieza por pieza",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(jugadas1, jugadas1.length)));
    igual("la posición contada en palabras dice lo que hay",
      await page.evaluate(() => { document.getElementById("en-palabras").open = true; return /Blancas:.*Negras:/.test(document.getElementById("posicion-escrita").textContent); }),
      "true");

    const enlace = await page.getAttribute("#b-practicar", "href");
    igual("el botón de practicar apunta a la línea del banco, no a la lista",
      enlace, "aperturas.html?linea=" + F1.lineaId);
    igual("y esa línea existe de verdad", POR_ID.has(F1.lineaId), "true");
    const destino = await abrir(browser, "/entreno/" + enlace);
    await destino.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 }).catch(() => {});
    igual("al abrirlo, esa página abre esa línea y no la lista",
      await destino.page.evaluate(() => (document.getElementById("lesson-title") || document.querySelector("h2") || {}).textContent || ""),
      POR_ID.get(F1.lineaId).nombre);
    await destino.ctx.close();

    await page.click("#volver");
    igual("«volver» regresa a la lista de fichas",
      await page.evaluate(() => getComputedStyle(document.getElementById("lista-vista")).display), "block");

    console.log("\n=== Una familia con líneas de los dos colores queda junta, cada una con su color ===");
    // La Defensa siciliana trae tanto "Siciliana cerrada" (blancas, en el
    // grupo Aperturas) como esta ficha (negras, en Defensas): no se pierde
    // ninguna y cada una dice con qué color se juega.
    igual("«Defensa siciliana» aparece en Defensas y dice que se juega con negras",
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll(".ficha-item")].find((b) => b.querySelector(".name").textContent === "Defensa siciliana");
        return btn ? btn.querySelector(".desc").textContent : null;
      }),
      "juegas con negras · " + { 1: "Principiante", 2: "Intermedio", 3: "Avanzado" }[ESTUDIO.find((F) => F.id === "siciliana").nivel] +
        " · " + ESTUDIO.find((F) => F.id === "siciliana").subtitulo);

    console.log("\n=== Que la página SE VEA ===");
    igual("no hay CSS impreso como texto arriba de la página",
      await page.evaluate(() => /[{;]\s*[a-z-]+\s*:/.test(document.body.innerText.slice(0, 600))), "false");
    const fuente = await (await page.request.get(BASE + "/entreno/estudio.html")).text();
    igual("una sola hoja de estilos en el HTML de la página", (fuente.match(/<style/g) || []).length, 1);
    igual("y se cierra una sola vez", (fuente.match(/<\/style>/g) || []).length, 1);
    igual("las clases propias pintan algo de verdad",
      await page.evaluate(() => {
        const c = document.querySelector(".caja");
        return getComputedStyle(c).borderTopWidth !== "0px" && getComputedStyle(c).padding !== "0px";
      }), "true");

    console.log("\n=== Al imprimir sale la ficha, no la lista ===");
    await page.evaluate((nombre) => {
      [...document.querySelectorAll(".ficha-item")].find((b) => b.textContent.indexOf(nombre) !== -1).click();
    }, F1.titulo);
    await page.waitForSelector("#ficha-vista", { state: "visible", timeout: 5000 });
    await page.emulateMedia({ media: "print" });
    igual("la lista, el encabezado y el pie se van del papel",
      await page.evaluate(() => ["#lista-vista", "header", "footer"].map((s) => document.querySelector(s).checkVisibility())),
      [false, false, false]);
    igual("los cinco bloques y el diagrama sí se imprimen",
      await page.evaluate(() => [...document.querySelectorAll(".caja")].every((c) => c.checkVisibility())
        && document.querySelector(".diagrama").checkVisibility()), "true");
    await page.emulateMedia({ media: "screen" });

    igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
