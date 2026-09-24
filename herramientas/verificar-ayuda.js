/* El «?» del encabezado de la Academia: el capítulo de la guía del profesor
   que habla de cada página.

   Lo que comprueba:

   1. Que cada «?» lleve a un capítulo que EXISTE en
      guia-del-profesor-accesible.html, y que su nombre accesible diga el
      título de ESE capítulo. Si la guía se reordena y el ancla queda
      apuntando al capítulo de al lado, esto lo nota.
   2. Que toda página con «?» cargue js/ayuda-guia.js, y que ninguna lo cargue
      sin tener el enlace.
   3. Que llegue escondido, y que js/ayuda-guia.js lo destape SOLO para quien
      administra y está en su propia vista. Ni a un profesor, ni a quien
      administra mirando «como estudiante». Hoy la guía no se le ofrece al
      equipo docente (ver «El «?» de la guía, solo para administración» en
      docs/decisiones/sitio-e-infraestructura.md).
   4. Que, a la vista, se vea, tenga contraste AA contra el encabezado y diga
      que se abre en otra pestaña.

       node herramientas/verificar-ayuda.js                                  */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

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

function paginasHtml() {
  const lista = [];
  (function recorrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "herramientas", "supabase", "docs"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith(".html")) lista.push(path.relative(RAIZ, p));
    }
  })(RAIZ);
  return lista;
}

function pruebaEstatica() {
  console.log("\n=== Cada «?» lleva al capítulo que le toca ===");
  const guia = fs.readFileSync(path.join(RAIZ, "guia-del-profesor-accesible.html"), "utf8");
  const capitulos = {};
  for (const m of guia.matchAll(/<section id="cap-(\d+)"><h2>Capítulo \d+\. ([^<]+)<\/h2>/g)) capitulos[m[1]] = m[2].trim();
  cierto("la guía tiene sus capítulos con ancla", Object.keys(capitulos).length >= 10, JSON.stringify(capitulos));

  const problemas = [];
  let conAyuda = 0;
  for (const rel of paginasHtml()) {
    const s = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    const m = s.match(/<a id="ayuda-guia" href="([^"]+)"[^>]*aria-label="Ayuda: capítulo «([^»]+)»[^"]*"/);
    const cargaScript = s.includes("js/ayuda-guia.js");
    if (!m) {
      if (cargaScript) problemas.push(`${rel}: carga js/ayuda-guia.js sin tener el «?»`);
      continue;
    }
    conAyuda += 1;
    const [href, ancla] = m[1].split("#");
    const destino = path.normalize(path.join(path.dirname(rel), href));
    if (destino !== "guia-del-profesor-accesible.html") problemas.push(`${rel}: el «?» lleva a ${destino}`);
    const n = (ancla || "").replace("cap-", "");
    if (!capitulos[n]) problemas.push(`${rel}: #${ancla} no existe en la guía`);
    else if (capitulos[n] !== m[2]) problemas.push(`${rel}: #${ancla} es «${capitulos[n]}» y el «?» dice «${m[2]}»`);
    if (!cargaScript) problemas.push(`${rel}: tiene el «?» pero no carga js/ayuda-guia.js`);
    if (!/class="hidden /.test(s.slice(s.indexOf('id="ayuda-guia"'), s.indexOf('id="ayuda-guia"') + 400)))
      problemas.push(`${rel}: el «?» no llega escondido`);
  }
  cierto(`los ${conAyuda} «?» apuntan a un capítulo que existe, con su título`, problemas.length === 0,
    "corre python3 herramientas/academia-cabecera.py:\n      " + problemas.join("\n      "));
  cierto("y son de verdad muchos (si esto da pocos, el barrido está roto)", conAyuda >= 40, "encontró " + conAyuda);
  const informes = fs.readFileSync(path.join(RAIZ, "informes.html"), "utf8");
  cierto("Informes lleva al capítulo «Informes»", /guia-del-profesor-accesible\.html#cap-\d+"[^>]*capítulo «Informes»/.test(informes));
  const subgrupos = fs.readFileSync(path.join(RAIZ, "subgrupos.html"), "utf8");
  cierto("una página que la guía no explica (Subgrupos) no lleva «?»", !subgrupos.includes('id="ayuda-guia"'));
}

/* Un cliente de Supabase de mentira que solo sabe quién es y si administra:
   es todo lo que js/ayuda-guia.js le pregunta. */
function clienteFalso(esAdmin) {
  return `window.sb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-1" } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_admin: ${esAdmin} } }) }) }) }),
  };`;
}

async function abrir(browser, { esAdmin, modo, js }) {
  const ctx = await browser.newContext({ serviceWorkers: "block", javaScriptEnabled: js !== false, viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage();
  if (modo) await page.addInitScript((m) => { try { localStorage.setItem("modo_vista_admin_v1", m); } catch (e) {} }, modo);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // La página se sirve tal cual, pero sin sus propios scripts: solo el
  // encabezado, js/modo-vista.js y js/ayuda-guia.js, con el cliente de mentira.
  await page.route("**/*.js", (r) => {
    const u = r.request().url();
    if (/\/js\/(ayuda-guia|modo-vista)\.js$/.test(u)) return r.continue();
    if (/\/js\/supabase-client\.js$/.test(u)) return r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(esAdmin) });
    return r.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });
  await page.goto(BASE + "/logros.html", { waitUntil: "load" });
  await page.waitForTimeout(400);
  return { page, ctx };
}

const SE_VE = () => document.getElementById("ayuda-guia").checkVisibility();

async function pruebaEnPantalla(browser) {
  console.log("\n=== A quién se le ofrece ===");
  let r = await abrir(browser, { js: false });
  cierto("sin JavaScript no se ve: llega escondido", !(await r.page.evaluate(SE_VE)));
  await r.ctx.close();

  r = await abrir(browser, { esAdmin: true });
  cierto("a quien administra se le ve", await r.page.evaluate(SE_VE));
  igual("y lleva al capítulo «Entrenamiento» desde Logros",
    await r.page.evaluate(() => document.getElementById("ayuda-guia").getAttribute("aria-label")),
    "Ayuda: capítulo «Entrenamiento» de la guía del profesor (se abre en otra pestaña)");
  igual("se abre en otra pestaña, sin darle acceso a esta", await r.page.evaluate(() =>
    [document.getElementById("ayuda-guia").target, document.getElementById("ayuda-guia").rel]), ["_blank", "noopener"]);
  const contraste = await r.page.evaluate(() => {
    const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = ([a, b, c]) => [a, b, c].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const el = document.getElementById("ayuda-guia");
    let fondo = null;
    for (let n = el; n && !fondo; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length === 3 || c[3] === 1) fondo = c; }
    const [x, y] = [lum(rgb(getComputedStyle(el).color)), lum(fondo)].sort((p, q) => q - p);
    return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
  });
  cierto(`contraste del «?» contra el encabezado ≥ 4.5 (${contraste})`, contraste >= 4.5);
  await r.page.focus("#ayuda-guia");
  cierto("se alcanza con Tab y el foco se ve", await r.page.evaluate(() =>
    document.activeElement.id === "ayuda-guia" && getComputedStyle(document.activeElement).boxShadow !== "none"));
  await r.ctx.close();

  r = await abrir(browser, { esAdmin: false });
  cierto("a un profesor no se le ve: la guía hoy no se le ofrece", !(await r.page.evaluate(SE_VE)));
  await r.ctx.close();

  r = await abrir(browser, { esAdmin: true, modo: "alumno" });
  cierto("a quien administra mirando «como estudiante» tampoco", !(await r.page.evaluate(SE_VE)));
  await r.ctx.close();
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
