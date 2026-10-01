#!/usr/bin/env node
/* Todas las páginas, en un navegador, con la CSP de _headers puesta.
 *
 * verificar-csp.js comprueba en el código que ninguna página necesite
 * 'unsafe-inline'. Esto lo comprueba donde importa: abre cada página con la
 * CSP exacta de _headers y escucha las violaciones de script-src. Una página
 * que se rompe por la CSP no da ningún error visible: el script que el
 * navegador bloquea simplemente no corre, y la página se queda a medio armar.
 *
 * El sitio local (python3 -m http.server, o el que levanta verificar-todo.js)
 * no manda las cabeceras de _headers: la CSP se le pone a cada página al
 * servirla, interceptando la respuesta. Lo que no es del sitio se corta
 * (Supabase, los CDN): no hace falta para ver qué bloquea la CSP, y
 * sin red cada página tarda lo mismo.
 *
 * Además:
 *   · un <script> metido en la página NO corre (si corriera, la CSP no se
 *     estaría aplicando y todo lo demás pasaría sin comprobar nada);
 *   · sin sesión, la guardia (que corre antes que todo) manda al login;
 *   · con la CSP puesta, el modo oscuro y las fuentes del sitio siguen andando
 *     (la hoja se contesta acá, sin red).
 *
 * Necesita el sitio servido en BASE_URL (por defecto http://localhost:8777).
 */
const fs = require("fs");
const path = require("path");
const pw = require("playwright");
const { chromium } = require("./lib/playwright-con-sesion");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const CSP = (fs.readFileSync(path.join(RAIZ, "_headers"), "utf8").match(/Content-Security-Policy: ([^\n]+)/) || [])[1];

let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

function paginas(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "herramientas", "docs", "supabase"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) paginas(p, acc);
    else if (e.name.endsWith(".html")) acc.push(path.relative(RAIZ, p).split(path.sep).join("/"));
  }
  return acc.sort();
}

/* Un contexto que sirve las páginas con la CSP y corta lo que no es del sitio. */
async function contexto(browser, opciones = {}) {
  const ctx = await browser.newContext({ serviceWorkers: "block", ...opciones });
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    if (!req.url().startsWith(BASE)) return route.abort();
    if (req.resourceType() !== "document") return route.continue();
    const resp = await route.fetch();
    route.fulfill({ response: resp, headers: { ...resp.headers(), "content-security-policy": CSP } });
  });
  await ctx.addInitScript(() => {
    window.__violaciones = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__violaciones.push({ directiva: e.violatedDirective, bloqueado: e.blockedURI, muestra: e.sample, linea: e.lineNumber });
    });
  });
  return ctx;
}

(async () => {
  if (!CSP) { mal("no encontré la CSP en _headers"); process.exit(1); }
  const browser = await chromium.launch({ executablePath: CHROME });

  console.log("=== La CSP se aplica de verdad ===");
  {
    const ctx = await contexto(browser);
    const p = await ctx.newPage();
    await p.goto(BASE + "/index.html", { waitUntil: "load" });
    const r = await p.evaluate(() => new Promise((listo) => {
      const s = document.createElement("script");
      s.textContent = "window.__inyectado = 1;";
      document.body.appendChild(s);
      setTimeout(() => listo({ corrio: window.__inyectado === 1, violaciones: window.__violaciones.length }), 200);
    }));
    if (r.corrio) mal("un <script> metido en la página CORRIÓ: la CSP no se está aplicando (o tiene 'unsafe-inline')");
    else bien("un <script> metido en la página no corre");
    if (!r.violaciones) mal("y el navegador no avisó ninguna violación: así no se vería ninguna");
    else bien("y el navegador lo avisa como violación de la CSP");
    await p.waitForTimeout(300);
    // Las fuentes las sirve el sitio: con font-src 'self' tienen que cargar.
    const inter = await p.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some((f) => /Inter/.test(f.family) && f.status === "loaded"); });
    if (inter) bien("con la CSP puesta, Inter carga desde el propio sitio");
    else mal("con la CSP puesta, Inter no cargó: ¿font-src deja pasar /fonts/?");
    await ctx.close();
  }

  console.log("\n=== Con la CSP puesta, lo de antes del pintado sigue andando ===");
  {
    // Sin sesión: la guardia tiene que correr (es un script en línea) y mandar al login.
    const b2 = await pw.chromium.launch({ executablePath: CHROME });
    const ctx = await contexto(b2);
    const p = await ctx.newPage();
    await p.goto(BASE + "/entreno/estudio.html").catch(() => {});
    await p.waitForURL(/login\.html/, { timeout: 10000 }).catch(() => {});
    const u = new URL(p.url());
    if (u.pathname === "/login.html" && u.searchParams.get("next") === "entreno/estudio.html") bien("sin sesión, la guardia manda al login y vuelve a su página");
    else mal("sin sesión, la guardia no mandó al login: terminó en " + p.url());
    await b2.close();
  }
  {
    const ctx = await contexto(browser, { colorScheme: "dark" });
    const p = await ctx.newPage();
    await p.goto(BASE + "/index.html", { waitUntil: "load" });
    if (await p.evaluate(() => document.documentElement.classList.contains("dark"))) bien("el modo oscuro se pone con el sistema oscuro");
    else mal("con el sistema oscuro, la página no quedó en modo oscuro: el bloque «oscuro» no corrió");
    await ctx.close();
  }

  const lista = paginas(RAIZ);
  console.log("\n=== Las " + lista.length + " páginas, con la CSP de _headers ===");
  const rotas = [];
  const ctx = await contexto(browser);
  let i = 0;
  async function obrero() {
    const p = await ctx.newPage();
    while (i < lista.length) {
      const ruta = lista[i++];
      try {
        await p.goto(BASE + "/" + ruta, { waitUntil: "load", timeout: 20000 });
        await p.waitForTimeout(250);
        const v = await p.evaluate(() => window.__violaciones || []);
        const deScript = v.filter((x) => /^script-src/.test(x.directiva));
        if (deScript.length) rotas.push(ruta + ": " + deScript.map((x) => x.directiva + " " + (x.bloqueado || "") + " «" + (x.muestra || "").slice(0, 40) + "» línea " + x.linea).join(" · "));
      } catch (e) {
        rotas.push(ruta + ": no cargó (" + String(e.message || e).split("\n")[0] + ")");
      }
    }
    await p.close();
  }
  await Promise.all([obrero(), obrero(), obrero(), obrero()]);
  if (rotas.length) mal(rotas.length + " página(s) con JavaScript bloqueado por la CSP:\n      " + rotas.join("\n      "));
  else bien("ninguna página tiene JavaScript bloqueado por la CSP");
  await ctx.close();

  await browser.close();
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();

