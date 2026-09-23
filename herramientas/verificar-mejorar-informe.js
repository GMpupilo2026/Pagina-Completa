#!/usr/bin/env node
/* «Mejorar informe», comprobado desde afuera.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - que la lista de modelos se separe entre la base (el CHECK de academia_ia),
 *    la Edge Function (su tabla de precios) y la pantalla de quien administra:
 *    un modelo que se ofrece y no tiene precio se cobraría al precio de
 *    respaldo, y uno que la base no acepta es un «Guardar» que falla;
 *  - que la pantalla del profesor deje ver el modelo o el tope, que es justo lo
 *    que se decidió que no sepa;
 *  - que el texto mejorado PISE lo que escribió el profesor sin preguntar;
 *  - que el botón aparezca sin IA, o no aparezca con ella.
 *
 * Lo que hace cumplir la BASE (que ia_para_usuario() sea solo de la service
 * role, que el profesor lea 0 configuraciones, que el tope gastado apague el
 * botón) se comprobó impersonando roles en SQL.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-mejorar-informe.js [--sin-navegador]
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");

function pruebaListas() {
  console.log("\nLos modelos dicen lo mismo en la base, en la función y en la pantalla");
  const dir = path.join(RAIZ, "supabase", "migraciones");
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8")).filter((t) => /create table if not exists public\.academia_ia/.test(t)).pop() || "";
  const enBase = ((sql.match(/modelo\s+text check \(modelo in \(([^)]*)\)\)/) || [])[1] || "").split(",").map((x) => x.trim().replace(/'/g, "")).filter(Boolean);
  const fn = leer("supabase", "functions", "mejorar-informe", "index.ts");
  const bloque = (fn.match(/const PRECIOS[\s\S]*?\n};/) || [""])[0];
  const conPrecio = [...bloque.matchAll(/"([a-z0-9-]+)":\s*\[/g)].map((m) => m[1]);
  const pagina = leer("academias.html");
  const enPantalla = [...(pagina.match(/const MODELOS_IA = \[[\s\S]*?\];/) || [""])[0].matchAll(/id: "([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  igual("la pantalla ofrece exactamente los que acepta la base", enPantalla, enBase);
  igual("todos tienen su precio en la función", enBase.filter((m) => !conPrecio.includes(m)), []);
  igual("la función no llama a ningún modelo que la base no acepte (salvo el respaldo de Opus)",
    conPrecio.filter((m) => !enBase.includes(m) && m !== "claude-opus-4-8"), []);
  const alProfe = ["asistencia.html", "informe-mensual.html", "js/mejorar-informe.js"].map((f) => [f, leer(f)]);
  igual("ninguna pantalla del profesor nombra un modelo ni un tope",
    alProfe.filter(([, t]) => /claude-|tope_mensual|ia_resumen_mes|academia_ia/.test(t)).map(([f]) => f), []);
  igual("la función nunca guarda el texto (solo anota el uso)", /from\("(class_sessions|informes_profesor)"\)/.test(fn), false);
}

// ── En un navegador ──────────────────────────────────────────────────────
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const PROFE = { id: "prof", full_name: "Karina Rojas", email: "karina@x.cr", role: "profesor", is_admin: false };

function clienteFalso(o) {
  return `
window.__rpc = []; window.__invocadas = [];
(function () {
  const O = ${JSON.stringify(o)};
  const res = (data) => ({ then(ok, mal) { return Promise.resolve({ data: data, error: null, count: Array.isArray(data) ? data.length : 0 }).then(ok, mal); } });
  function tabla(nombre) {
    let unica = false;
    const b = new Proxy({}, { get(_, k) {
      if (k === "then") return (ok, mal) => {
        let d = nombre === "profiles" ? [O.yo] : [];
        if (unica) d = d[0] || null;
        return Promise.resolve({ data: d, error: null, count: 0 }).then(ok, mal);
      };
      if (k === "maybeSingle" || k === "single") return () => { unica = true; return b; };
      return () => b;
    } });
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: O.yo.id }, access_token: "t" } } }),
            onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } },
    from: tabla,
    channel() { return { on() { return this; }, subscribe() { return this; }, track() {}, presenceState() { return {}; } }; },
    removeChannel() {},
    rpc(n, args) {
      window.__rpc.push(n);
      if (n === "ia_disponible") return res(O.ia);
      if (n === "actividad_profesor") return res({});
      return res([]);
    },
    functions: { invoke(n, opts) {
      window.__invocadas.push({ n: n, body: opts && opts.body });
      return Promise.resolve(O.respuesta);
    } },
  };
})();`;
}

async function abrir(browser, pagina, o) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(o) }));
  await page.goto(BASE + pagina, { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
  await page.waitForTimeout(300);
  return { page, errores };
}

const PROPUESTA = "Objetivo general: Aplicar la oposición en finales de rey y peón.\n\nObjetivos específicos:\n- Reconocer la oposición\n- Aplicar la regla del cuadrado\n\nLo que se trabajó: finales de peón en el tablero grande.";

async function pruebaAsistencia(browser) {
  console.log("\nEl botón en la ficha de asistencia presencial");
  const o = { yo: PROFE, ia: true, respuesta: { data: { ok: true, texto: PROPUESTA }, error: null } };
  const { page, errores } = await abrir(browser, "/asistencia.html", o);
  igual("con IA, el botón aparece debajo del campo", await page.$eval("#notas-mejorar button", (b) => b.textContent.trim()), "✨ Mejorar informe");
  igual("y la nota pide no escribir datos personales", await page.$eval("#notas-mejorar", (d) => d.textContent.includes("no escribas datos personales")), true);

  await page.fill("#notas", "poco");
  await page.click("#notas-mejorar button");
  igual("un texto de una palabra no viaja", await page.evaluate(() => window.__invocadas.length), 0);

  const mio = "Repasamos la oposición y la regla del cuadrado con Sofía. Hicimos cuatro finales en el tablero grande.";
  await page.fill("#notas", mio);
  await page.click("#notas-mejorar button");
  await page.waitForFunction(() => !document.querySelector("#notas-mejorar > div.mt-3").hidden);
  igual("se manda el texto y el tipo, nada más", await page.evaluate(() => window.__invocadas[0]),
    { n: "mejorar-informe", body: { tipo: "clase", texto: mio } });
  igual("la propuesta se enseña", await page.$eval("#notas-mejorar p.whitespace-pre-wrap", (p) => p.textContent), PROPUESTA);
  igual("y el campo SIGUE con lo que escribió el profesor", await page.$eval("#notas", (t) => t.value), mio);
  await page.click("text=Usar este texto");
  igual("al aceptarla, el campo queda con la propuesta", await page.$eval("#notas", (t) => t.value), PROPUESTA);
  igual("sin errores en la página", errores, []);
  await page.close();

  console.log("\nSin IA, o cuando se acaba el presupuesto");
  const sin = await abrir(browser, "/asistencia.html", Object.assign({}, o, { ia: false }));
  igual("sin IA no hay ni rastro del botón", await sin.page.$("#notas-mejorar"), null);
  await sin.page.close();

  const agotado = await abrir(browser, "/asistencia.html", Object.assign({}, o, {
    respuesta: { data: { error: "no_disponible" }, error: null } }));
  await agotado.page.fill("#notas", mio);
  await agotado.page.click("#notas-mejorar button");
  await agotado.page.waitForFunction(() => !document.getElementById("notas-mejorar"));
  igual("si se acabó mientras tanto, el botón se va y el texto queda", await agotado.page.$eval("#notas", (t) => t.value), mio);
  await agotado.page.close();

  const falla = await abrir(browser, "/asistencia.html", Object.assign({}, o, {
    respuesta: { data: { error: "No se pudo mejorar el texto ahora. Tu texto quedó como estaba." }, error: { message: "502" } } }));
  await falla.page.fill("#notas", mio);
  await falla.page.click("#notas-mejorar button");
  await falla.page.waitForFunction(() => /Tu texto quedó como estaba/.test(document.querySelector("#notas-mejorar [role=status]").textContent));
  igual("si falla, lo dice y el texto queda", await falla.page.$eval("#notas", (t) => t.value), mio);
  await falla.page.close();
}

async function pruebaInformeMensual(browser) {
  console.log("\nEl botón en el informe mensual");
  const o = { yo: PROFE, ia: true, respuesta: { data: { ok: true, texto: PROPUESTA }, error: null } };
  const { page, errores } = await abrir(browser, "/informe-mensual.html", o);
  igual("aparece debajo del resumen", await page.$eval("#resumen-mejorar", (d) => d.checkVisibility()), true);
  await page.fill("#resumen", "Este mes trabajé finales con los tres grupos y preparamos el torneo.");
  await page.click("#resumen-mejorar button");
  await page.waitForFunction(() => window.__invocadas.length === 1);
  igual("manda el tipo del informe mensual", await page.evaluate(() => window.__invocadas[0].body.tipo), "informe_mensual");
  await page.evaluate(() => { document.getElementById("resumen").readOnly = true; });
  await page.waitForTimeout(100);
  igual("un informe ya enviado (campo de solo lectura) no ofrece mejorarlo", await page.$eval("#resumen-mejorar", (d) => d.checkVisibility()), false);
  igual("sin errores en la página", errores, []);
  await page.close();
}

(async () => {
  pruebaListas();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaAsistencia(browser);
    await pruebaInformeMensual(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e.stack || e));
    fallos += 1;
  }
  await browser.close();
  terminar();
})();

function terminar() {
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo en orden.");
  process.exit(fallos ? 1 : 0);
}
