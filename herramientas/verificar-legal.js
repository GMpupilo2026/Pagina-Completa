/* Comprueba lo legal del sitio: que las dos páginas existan y digan quién es el
   responsable, que todo pie las enlace, y que ningún formulario público mande
   datos (ni un plan se elija) sin aceptar antes la Política de privacidad o
   los Términos. Ver «Las páginas legales» en docs/decisiones/legal.md.

   Lo del navegador es lo que se rompe callado: una casilla que se ve pero que
   el botón no mira deja mandar todo igual, y la página se ve perfecta.
   formulario.html se prueba en verificar-formularios.js, con su doble.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-legal.js                     */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");
const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

function paginasLegales() {
  console.log("\n=== Las dos páginas ===");
  for (const r of ["privacidad.html", "terminos.html"]) {
    const t = leer(r);
    igual(r + ": dice quién responde, con su cédula",
      [/Oscar Angulo Cubero/.test(t), /1-1399-0053/.test(t)], [true, true]);
    igual(r + ": se puede encontrar (sin noindex)", /<meta name="robots"[^>]*noindex/.test(t), false);
    // El índice «En esta página» y los títulos son la misma lista: una sección
    // nueva sin su entrada, o una entrada que apunta a nada, falla acá.
    const indice = [...t.matchAll(/<li><a href="#([^"]+)"/g)].map((m) => m[1]);
    const titulos = [...t.matchAll(/<h2 [^>]*id="([^"]+)"/g)].map((m) => m[1]);
    igual(r + ": el índice lleva a cada sección, en orden", indice, titulos);
  }
  const p = leer("privacidad.html");
  igual("privacidad: nombra la ley, los derechos y la PRODHAB",
    ["Ley 8968", "cinco días hábiles", "PRODHAB", "transferencia internacional", "dato sensible"].filter((x) => !p.includes(x)), []);
  const tm = leer("terminos.html");
  igual("términos: la política de cancelación que se eligió (ocho días hábiles, monto completo)",
    /dentro de los ocho días hábiles siguientes a tu pago, te devolvemos el monto completo/.test(tm), true);
  igual("términos: el material digital no se devuelve una vez entregado, y se repone si llega mal",
    [/no se puede devolver una vez que te llega/.test(tm), /te lo reponemos/.test(tm)], [true, true]);
}

function enlacesEnTodoElSitio() {
  console.log("\n=== Los enlaces ===");
  let salida = "", codigo = 0;
  try { salida = execFileSync("python3", [path.join(__dirname, "legal-pie.py"), "--comprobar"], { encoding: "utf8" }); }
  catch (e) { salida = (e.stdout || "") + (e.stderr || ""); codigo = e.status || 1; }
  igual("todo pie lleva los enlaces legales (legal-pie.py --comprobar)", codigo === 0 ? "sí" : salida.trim(), "sí");

  // Cada enlace a una página legal, en cualquier página, llega a un archivo que
  // existe y, si lleva ancla, a una sección que existe.
  const destinos = { "privacidad.html": ids(leer("privacidad.html")), "terminos.html": ids(leer("terminos.html")) };
  const rotos = [];
  let cuantos = 0;
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const r = dir ? dir + "/" + e.name : e.name;
      if (e.isDirectory()) {
        if (!/^(node_modules|herramientas|docs|supabase|\.git)$/.test(r)) recorrer(r);
        continue;
      }
      if (!r.endsWith(".html")) continue;
      const html = leer(r);
      for (const m of html.matchAll(/href="([^"]*(?:privacidad|terminos)\.html)(?:#([^"]*))?"/g)) {
        cuantos += 1;
        const propia = m[1].match(/^https:\/\/ajedrez-integral\.com\/(.*)$/);   // el canonical
        const abs = propia ? propia[1] : path.normalize(path.join(path.dirname(r), m[1])).split(path.sep).join("/");
        if (!destinos[abs]) rotos.push(r + " → " + m[1]);
        else if (m[2] && !destinos[abs].has(m[2])) rotos.push(r + " → " + m[1] + "#" + m[2]);
      }
    }
  };
  recorrer("");
  igual("los " + cuantos + " enlaces a las páginas legales llegan a donde dicen", rotos, []);

  const tienda = leer("tienda.html");
  igual("el pedido de la tienda deja escrita la aceptación de las condiciones",
    [/CONDICIONES_TIENDA = "https:\/\/ajedrez-integral\.com\/terminos\.html#tienda"/.test(tienda),
     /Leí y acepto las condiciones de compra[^"]*" \+ CONDICIONES_TIENDA/.test(tienda)], [true, true]);
  for (const r of ["login.html", "bienvenida.html", "precios.html"]) {
    igual(r + ": enlaza los Términos", /href="terminos\.html/.test(leer(r)), true);
  }
}

function sbFalso(respuestas) {
  return `window.__rpc = [];
window.sb = {
  rpc: (n, a) => { window.__rpc.push({ n: n, a: a }); return Promise.resolve({ data: (${JSON.stringify(respuestas)})[n], error: null }); },
  auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
};`;
}

async function abrir(ctx, ruta, respuestas) {
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/vendor/supabase.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: sbFalso(respuestas) }));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, errores };
}
const llamadas = (page, n) => page.evaluate((n) => window.__rpc.filter((r) => r.n === n).length, n);

async function unirse(ctx) {
  console.log("\n=== unirse.html ===");
  const { page, errores } = await abrir(ctx, "/unirse.html", { solicitar_academia: { ok: true } });
  await page.fill("#nombre", "Ana Rojas");
  await page.fill("#email", "mama@x.cr");
  await page.click("#submit-btn");
  igual("sin aceptar la Política de privacidad no se manda nada",
    [await llamadas(page, "solicitar_academia"), await page.evaluate(() => document.activeElement.id)], [0, "acepto-datos"]);
  igual("la casilla dice qué acepta y enlaza la política",
    await page.evaluate(() => { const l = document.querySelector('label[for="acepto-datos"]');
      return [/menor de edad/.test(l.textContent), !!l.querySelector('a[href="privacidad.html"][target="_blank"]')]; }), [true, true]);
  await page.check("#acepto-datos");
  await page.click("#submit-btn");
  await page.waitForFunction(() => window.__rpc.length > 0);
  igual("aceptada, la solicitud sale", await llamadas(page, "solicitar_academia"), 1);
  igual("sin errores en la página", errores, []);
  await page.close();
}

async function elegirPlan(ctx) {
  console.log("\n=== elegir-plan.html ===");
  const { page, errores } = await abrir(ctx, "/elegir-plan.html?s=abc", {
    solicitud_para_elegir_plan: [{ estado: "contactada", nombre: "Ana Rojas", plan_elegido: null }],
    elegir_plan: { ok: true },
  });
  await page.waitForSelector("#elegir:not(.hidden)");
  igual("antes de los botones dice la política de reembolso",
    await page.evaluate(() => /ocho días hábiles/.test(document.getElementById("elegir").textContent)), true);
  await page.click('.plan-btn[data-plan="grupal"]');
  igual("sin aceptar los Términos no se elige: avisa, pone el foco en la casilla y no llama a la base",
    [await llamadas(page, "elegir_plan"),
     await page.evaluate(() => document.getElementById("elegir-error").checkVisibility()),
     await page.evaluate(() => document.activeElement.id)], [0, true, "acepto-terminos"]);
  await page.check("#acepto-terminos");
  await page.click('.plan-btn[data-plan="grupal"]');
  await page.waitForSelector("#ya-elegido:not(.hidden)");
  igual("aceptados, se guarda el plan elegido",
    await page.evaluate(() => window.__rpc.filter((r) => r.n === "elegir_plan").map((r) => r.a.p_plan)), ["grupal"]);
  igual("sin errores en la página", errores, []);
  await page.close();
}

(async () => {
  paginasLegales();
  enlacesEnTodoElSitio();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await unirse(ctx);
  await elegirPlan(ctx);
  await browser.close();
  console.log(fallos ? `\n${fallos} fallas` : "\nTodo bien: lo legal está en su lugar.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
