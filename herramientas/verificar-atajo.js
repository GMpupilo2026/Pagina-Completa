/* Ctrl + K en toda la Academia: lleva al buscador del panel.

   Lo que comprueba:

   1. Que toda página de la Academia cargue js/atajo-buscar.js, con la ruta
      de vuelta al panel que le corresponde por su carpeta. La excepciones son
      tres, a propósito: clases.html (tiene el suyo), sesion.html (salir de la
      clase tiene que cerrar antes la asistencia) y examen.html (salir del
      examen lo congela). En esas tres el archivo NO va.
   2. En el navegador: que Ctrl + K y ⌘ + K lleven a clases.html?buscar=, con
      lo que estaba seleccionado ya puesto; que una «k» sola no haga nada; y
      que desde una carpeta (entreno/) la ruta suba bien.

       node herramientas/verificar-atajo.js                                  */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");
const SIN_ATAJO = new Set(["clases.html", "sesion.html", "examen.html"]);

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

function paginasDeLaAcademia() {
  const lista = [];
  (function recorrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "herramientas", "supabase", "docs"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith(".html") && fs.readFileSync(p, "utf8").includes('id="marca-enlace"')) lista.push(path.relative(RAIZ, p));
    }
  })(RAIZ);
  return lista;
}

function pruebaEstatica() {
  console.log("\n=== Cada página de la Academia tiene su Ctrl + K ===");
  const paginas = paginasDeLaAcademia();
  const problemas = [];
  for (const rel of paginas) {
    const s = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    const arriba = "../".repeat(rel.split("/").length - 1);
    const etiqueta = `<script src="${arriba}js/atajo-buscar.js" data-arriba="${arriba}" defer></script>`;
    const lleva = s.includes("<!-- atajo: inicio -->");
    if (SIN_ATAJO.has(rel)) { if (lleva) problemas.push(`${rel}: no debería llevarlo`); continue; }
    if (!s.includes(etiqueta)) problemas.push(`${rel}: falta ${etiqueta}`);
  }
  cierto(`las ${paginas.length - SIN_ATAJO.size} páginas lo cargan, con su ruta, y las tres de la excepción no`,
    problemas.length === 0, "corre python3 herramientas/academia-cabecera.py:\n      " + problemas.join("\n      "));
  cierto("y son de verdad muchas (si esto da pocas, el barrido está roto)", paginas.length >= 60, "encontró " + paginas.length);
}

/* Una página mínima con la MISMA etiqueta que pone academia-cabecera.py. Las
   páginas de verdad, sin sesión, se van solas a login.html antes de poder
   probar nada; que las 65 carguen el archivo ya lo comprueba lo de arriba. */
async function abrir(browser, rel) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const arriba = "../".repeat(rel.split("/").length - 1);
  await page.route(BASE + "/" + rel, (r) => r.fulfill({ status: 200, contentType: "text/html",
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body><h1>Prueba</h1><p id="nombre">María  Rojas</p>`
        + `<script src="${arriba}js/atajo-buscar.js" data-arriba="${arriba}" defer></script></body></html>` }));
  await page.route(/\/clases\.html/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>panel</p>" }));
  await page.goto(BASE + "/" + rel, { waitUntil: "load" });
  await page.waitForFunction(() => window.AtajoBuscar === true, null, { timeout: 5000 });
  return { ctx, page };
}

async function pruebaEnPantalla(browser) {
  console.log("\n=== El atajo, en el navegador ===");
  let { ctx, page } = await abrir(browser, "prueba-atajo.html");
  await page.keyboard.press("k");
  await page.waitForTimeout(200);
  cierto("una «k» sola no hace nada", /prueba-atajo\.html/.test(page.url()));
  await Promise.all([page.waitForURL(/clases\.html\?buscar=$/, { timeout: 5000 }), page.keyboard.press("Control+K")]);
  cierto("Ctrl + K lleva al buscador del panel", /\/clases\.html\?buscar=$/.test(page.url()), page.url());
  await ctx.close();

  ({ ctx, page } = await abrir(browser, "prueba-atajo.html"));
  await page.evaluate(() => {
    const p = document.getElementById("nombre");
    const r = document.createRange(); r.selectNodeContents(p);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
  await Promise.all([page.waitForURL(/clases\.html\?buscar=/, { timeout: 5000 }), page.keyboard.press("Meta+K")]);
  cierto("⌘ + K también, y lleva lo seleccionado ya buscándolo",
    new URL(page.url()).searchParams.get("buscar") === "María Rojas", page.url());
  await ctx.close();

  ({ ctx, page } = await abrir(browser, "entreno/prueba-atajo.html"));
  await Promise.all([page.waitForURL(/clases\.html/, { timeout: 5000 }), page.keyboard.press("Control+K")]);
  cierto("desde entreno/ sube a clases.html de la raíz", new URL(page.url()).pathname === "/clases.html", page.url());
  await ctx.close();
}

(async () => {
  pruebaEstatica();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaEnPantalla(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
