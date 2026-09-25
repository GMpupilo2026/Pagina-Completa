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

// js/legal-version.js, leído como lo lee el navegador.
const VERSIONES = (() => {
  const w = {};
  new Function("window", fs.readFileSync(path.join(RAIZ, "js/legal-version.js"), "utf8"))(w);
  return JSON.stringify(w.LegalVersion);
})();
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

function paginasLegales() {
  console.log("\n=== Las dos páginas ===");
  // La versión que viaja con cada aceptación es la fecha que la página dice.
  // Si se cambia el texto y no el módulo, la base guardaría que se aceptó
  // otra cosa.
  const v = JSON.parse(VERSIONES);
  for (const [r, clave] of [["privacidad.html", "PRIVACIDAD"], ["terminos.html", "TERMINOS"]]) {
    const m = leer(r).match(/Última actualización: (\d{1,2}) de ([a-z]+) de (\d{4})\./);
    const impresa = m ? `${m[3]}-${String(MESES.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
    igual(`${r}: la fecha impresa es la versión de js/legal-version.js`, impresa, v[clave]);
  }
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
  const correoAjeno = [];   // el dominio es ajedrez-integral.com, con guion
  let cuantos = 0;
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const r = dir ? dir + "/" + e.name : e.name;
      if (e.isDirectory()) {
        if (!/^(node_modules|herramientas|docs|supabase|\.git)$/.test(r)) recorrer(r);
        continue;
      }
      if (!r.endsWith(".html")) continue;
      const html = require("./lib/codigo-de-pagina").leer(r);
      if (/@ajedrezintegral\.com/i.test(html)) correoAjeno.push(r);
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
  igual("ninguna página da un correo de otro dominio (ajedrezintegral.com, sin guion, no es nuestro)",
    correoAjeno, []);

  const tienda = leer("tienda.html");
  igual("el pedido de la tienda deja escrita la aceptación de las condiciones",
    [/CONDICIONES_TIENDA = "https:\/\/ajedrez-integral\.com\/terminos\.html#tienda"/.test(tienda),
     /Leí y acepto las condiciones de compra[^"]*" \+ CONDICIONES_TIENDA/.test(tienda)], [true, true]);
  for (const r of ["login.html", "bienvenida.html", "precios.html"]) {
    igual(r + ": enlaza los Términos", /href="terminos\.html/.test(leer(r)), true);
  }
}

function sbFalso(respuestas, sesion) {
  return `window.__rpc = [];
window.sb = {
  rpc: (n, a) => { window.__rpc.push({ n: n, a: a }); return Promise.resolve({ data: (${JSON.stringify(respuestas)})[n], error: null }); },
  auth: { getSession: () => Promise.resolve({ data: { session: ${JSON.stringify(sesion || null)} } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
};`;
}

async function abrir(ctx, ruta, respuestas, sesion, antes) {
  const page = await ctx.newPage();
  if (antes) await page.addInitScript(antes);
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/vendor/supabase.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: sbFalso(respuestas, sesion) }));
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
  igual("aceptada, la solicitud sale con la versión de la política que se aceptó",
    await page.evaluate(() => window.__rpc.filter((r) => r.n === "solicitar_academia").map((r) => r.a.p_version_privacidad)),
    [JSON.parse(VERSIONES).PRIVACIDAD]);
  igual("sin errores en la página", errores, []);
  await page.close();
}

async function elegirPlan(ctx) {
  console.log("\n=== elegir-plan.html ===");
  // Sin sesión se ven los planes, y nada más: elegir va con la cuenta del
  // correo de la solicitud (la base lo exige; ver elegir_plan_con_sesion).
  {
    const { page, errores } = await abrir(ctx, "/elegir-plan.html?s=abc", {
      solicitud_para_elegir_plan: [{ estado: "rechazada", nombre: "Ana Rojas", plan_elegido: null }],
    });
    await page.waitForSelector("#elegir:not(.hidden)");
    igual("sin sesión se ven los tres planes, sin botón de elegir ni casilla",
      await page.evaluate(() => [
        document.querySelectorAll("#elegir h2").length,
        [...document.querySelectorAll(".plan-btn")].filter((b) => b.checkVisibility()).length,
        document.getElementById("terminos-caja").checkVisibility()]), [3, 0, false]);
    igual("y ofrece iniciar sesión (volviendo a esta página) y escribir por WhatsApp",
      await page.evaluate(() => [
        document.getElementById("solo-ver-login").checkVisibility() && document.getElementById("solo-ver-login").getAttribute("href"),
        !![...document.querySelectorAll("#solo-ver a")].find((a) => a.checkVisibility() && /wa\.me\/506/.test(a.href))]),
      ["login.html?next=elegir-plan.html", true]);
    igual("guarda la solicitud para no perderla en el login", await page.evaluate(() => sessionStorage.getItem("elegir_plan_solicitud")), "abc");
    igual("sin sesión no le pregunta nada a la base", await page.evaluate(() => window.__rpc.length), 0);
    igual("sin errores en la página", errores, []);
    await page.close();
  }
  // Con sesión, de vuelta del login: la dirección ya no trae ?s=, la
  // solicitud sale de lo que la pestaña guardó antes de ir al login.
  const { page, errores } = await abrir(ctx, "/elegir-plan.html", {
    solicitud_para_elegir_plan: [{ estado: "rechazada", nombre: "Ana Rojas", plan_elegido: null }],
    elegir_plan: { ok: true },
  }, { access_token: "x", user: { id: "u-ana", email: "ana@x.cr" } },
  () => sessionStorage.setItem("elegir_plan_solicitud", "abc"));
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
    await page.evaluate(() => window.__rpc.filter((r) => r.n === "elegir_plan").map((r) => [r.a.p_plan, r.a.p_version_terminos, r.a.p_version_privacidad])),
    [["grupal", JSON.parse(VERSIONES).TERMINOS, JSON.parse(VERSIONES).PRIVACIDAD]]);
  igual("con la solicitud que traía el enlace, aunque el login la haya dejado fuera de la dirección",
    await page.evaluate(() => window.__rpc.filter((r) => r.n === "elegir_plan").map((r) => r.a.p_id)), ["abc"]);
  igual("sin errores en la página", errores, []);
  await page.close();
}

function laBaseLoExige() {
  console.log("\n=== La base exige y guarda la aceptación ===");
  // Lee supabase/migraciones/, como verificar-envios-publicos.js: la ÚLTIMA
  // migración que define cada función es la que vale. Una migración futura
  // que la vuelva a crear copiando una versión vieja borraría la exigencia
  // sin ningún error: el formulario se seguiría enviando igual.
  const DIR = path.join(RAIZ, "supabase", "migraciones");
  const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const casos = [
    ["solicitar_academia", "p_version_privacidad", /privacidad_version/],
    ["responder_formulario", "p_version_privacidad", /privacidad_version/],
    ["responder_encuesta_curso", "p_version_privacidad", /privacidad_version/],
    ["elegir_plan", "p_version_terminos", /terminos_version\s*=\s*p_version_terminos/],
  ];
  for (const [fn, param, guarda] of casos) {
    const inicio = new RegExp("create\\s+or\\s+replace\\s+function\\s+public\\." + fn + "\\s*\\(", "i");
    let ultima = null, cuerpo = null, firma = null;
    for (const f of archivos) {
      const sql = fs.readFileSync(path.join(DIR, f), "utf8");
      const m = sql.match(inicio);
      if (!m) continue;
      const resto = sql.slice(m.index);
      const d = resto.match(/as\s+(\$[a-z_]*\$)/i);
      if (!d) continue;
      const desde = resto.indexOf(d[1]) + d[1].length;
      ultima = f; firma = resto.slice(0, resto.indexOf(d[1])); cuerpo = resto.slice(desde, resto.indexOf(d[1], desde));
    }
    const exige = cuerpo ? cuerpo.search(new RegExp("interno\\.version_legal_valida\\(" + param + "\\)")) : -1;
    const escribe = cuerpo ? cuerpo.search(/insert\s+into|update\s+public\./i) : -1;
    igual(`${fn} (${ultima}): recibe ${param}, lo exige antes de escribir y lo guarda`,
      [!!firma && firma.includes(param), exige >= 0 && exige < escribe, !!cuerpo && guarda.test(cuerpo), !!cuerpo && /now\(\)/.test(cuerpo)],
      [true, true, true, true]);
  }
}

async function proveedores(ctx) {
  console.log("\n=== privacidad.html: la lista de proveedores ===");
  // Va plegada, pero tiene que seguir ahí: la ley obliga a decir quién recibe
  // los datos. Plegada no es borrada.
  const t = leer("privacidad.html");
  const plegado = (t.match(/<details id="proveedores"[\s\S]*?<\/details>/) || [""])[0];
  igual("los siete proveedores siguen nombrados dentro de la lista plegada",
    ["Supabase", "Cloudflare", "Resend", "Google", "Anthropic", "Meet", "Hacienda"].filter((x) => !plegado.includes(x)), []);
  const page = await ctx.newPage();
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.goto(BASE + "/privacidad.html", { waitUntil: "load" });
  const visible = () => page.evaluate(() => document.querySelector("#proveedores ul").checkVisibility());
  igual("al abrir la página la lista no se ve", await visible(), false);
  igual("el aviso del envío al extranjero sí se ve sin abrir nada",
    await page.evaluate(() => [...document.querySelectorAll("p")].some((p) => /transferencia internacional/.test(p.textContent) && p.checkVisibility())), true);
  await page.focus("#proveedores summary");
  await page.keyboard.press("Enter");
  igual("con el teclado se abre y la lista se ve", await visible(), true);
  await page.close();
}

(async () => {
  paginasLegales();
  enlacesEnTodoElSitio();
  laBaseLoExige();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await unirse(ctx);
  await elegirPlan(ctx);
  await proveedores(ctx);
  await browser.close();
  console.log(fallos ? `\n${fallos} fallas` : "\nTodo bien: lo legal está en su lugar.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
