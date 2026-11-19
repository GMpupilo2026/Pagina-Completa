/* Comprueba el panel jornada (js/panel-jornada.js): el panel del alumno
   repartido en cinco pestañas, solo para las cuentas de vistas_en_prueba.

   Lo que se rompería callado:
   - que a una cuenta que NO está anotada se le cambie el panel (o a una
     profesora que sí lo está: el panel docente tiene otros grupos);
   - que una sección quede en la pestaña equivocada o escondida en todas;
   - que buscar no destape lo de las otras pestañas (el resultado no se vería);
   - que los puntos no lleguen a Perfil;
   - que la barra no quede abajo en el celular ni a la izquierda en la
     computadora.
   Lo visible se mide con checkVisibility()/getComputedStyle, no por la clase.

   Ver «El panel jornada: el del alumno, con pestañas» en
   docs/decisiones/paneles.md.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-panel-jornada.js                        */
const { chromium } = require("./lib/playwright-con-sesion");
const { clasesDeMentira, clienteFalso } = require("./lib/doble-panel");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const ALUMNO = { id: "u-oscarov", role: "alumno", is_admin: false, es_coordinador: false, full_name: "Oscarov", email: "o@x.cr", grupo: "SJ" };
const PROFE = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false, full_name: "Karina Rojas", email: "karina@x.cr", grupo: null,
                invitaciones_max: 10, invitaciones_usadas: 3 };
const ANOTADO = (id) => ({ vistas_en_prueba: [{ profile_id: id, vista: "panel_jornada" }] });

let fallos = 0;
const bien = (t) => console.log("  ✓ " + t);
const mal = (t) => { console.log("  ✗ " + t); fallos += 1; };
const cierto = (t, v) => (v ? bien(t) : mal(t));
function igual(t, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) bien(t + ": " + a); else mal(t + "\n      esperaba: " + b + "\n      salió:    " + a);
}

async function abrir(browser, perfil, datos, opciones, hash) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones || {}));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso([perfil], perfil.id, clasesDeMentira(), datos) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/clases.html" + (hash || ""), { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  // El módulo espera su consulta: se le da un respiro para que arme (o no) las pestañas.
  await page.waitForTimeout(600);
  return { ctx, page, errores };
}

// Qué se ve: las secciones por id y los grupos por título.
const QUE_SE_VE = () => {
  const ve = (el) => !!el && el.checkVisibility();
  const ids = ["session-status-card", "progreso-alumno", "tus-clases", "jornada-perfil", "buscar-panel"];
  const r = { ids: {}, grupos: {} };
  ids.forEach((id) => { const el = document.getElementById(id); r.ids[id] = el ? (el.dataset.jornada || "-") + (ve(el) ? ":ve" : ":no") : "falta"; });
  document.querySelectorAll("#tile-grid > section").forEach((s) => {
    const h = s.querySelector("h2");
    const t = ((h && (h.dataset.titulo || h.textContent)) || "").trim();
    r.grupos[t] = (s.dataset.jornada || "-") + (ve(s) ? ":ve" : ":no");
  });
  return r;
};

async function pruebaSinAnotar(browser) {
  console.log("\nSin la fila en vistas_en_prueba, el panel no cambia");
  const { ctx, page, errores } = await abrir(browser, ALUMNO, {});
  igual("sin barra de pestañas", await page.$$eval(".jornada-nav", (n) => n.length), 0);
  igual("body sin la clase jornada", await page.evaluate(() => document.body.classList.contains("jornada")), false);
  igual("nada marcado con data-jornada", await page.$$eval("[data-jornada]", (n) => n.length), 0);
  igual("sin errores", errores, []);
  await ctx.close();
}

async function pruebaProfesoraAnotada(browser) {
  console.log("\nUna profesora anotada sigue con su panel (las pestañas son del alumno)");
  const { ctx, page } = await abrir(browser, PROFE, ANOTADO(PROFE.id));
  igual("sin barra de pestañas", await page.$$eval(".jornada-nav", (n) => n.length), 0);
  await ctx.close();
}

async function pruebaPestanas(browser) {
  console.log("\nCon la fila: cinco pestañas y cada cosa en la suya");
  const { ctx, page, errores } = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 1280, height: 900 } });
  igual("las pestañas", await page.$$eval(".jornada-nav button[data-pestana]", (b) => b.map((x) => x.textContent.trim())),
    ["Inicio", "Clases", "Entrenar", "Jugar", "Perfil"]);
  igual("abre en Inicio", await page.$eval(".jornada-nav button[aria-current='page']", (b) => b.textContent.trim()), "Inicio");

  let v = await page.evaluate(QUE_SE_VE);
  igual("«Hoy te toca» es de Inicio", v.ids["progreso-alumno"].split(":")[0], "inicio");
  igual("«Tus clases» es de Clases y no se ve en Inicio", v.ids["tus-clases"].startsWith("clases:") && v.ids["tus-clases"].endsWith(":no"), true);
  igual("«Jugar y competir» no se ve en Inicio", v.grupos["Jugar y competir"], "jugar:no");
  igual("el buscador (sin pestaña) se ve", v.ids["buscar-panel"], "-:ve");
  const sinPestana = Object.entries(v.grupos).filter(([, x]) => x.startsWith("-")).map(([t]) => t);
  igual("todo grupo del alumno tiene su pestaña", sinPestana, []);

  await page.click(".jornada-nav button[data-pestana='jugar']");
  v = await page.evaluate(QUE_SE_VE);
  igual("en Jugar se ve «Jugar y competir»", v.grupos["Jugar y competir"], "jugar:ve");
  igual("en Jugar no se ve «Hoy te toca»", v.ids["progreso-alumno"].endsWith(":no"), true);
  igual("aria-current pasó a Jugar", await page.$eval(".jornada-nav button[aria-current='page']", (b) => b.dataset.pestana), "jugar");
  igual("el foco va al título de la pestaña", await page.evaluate(() => document.activeElement && document.activeElement.id + "=" + document.activeElement.textContent), "jornada-titulo=Jugar");

  await page.click(".jornada-nav button[data-pestana='perfil']");
  igual("los Puntos Ajedrez se mudaron a Perfil", await page.evaluate(() => !!document.querySelector("#jornada-perfil #puntos-ajedrez")), true);
  v = await page.evaluate(QUE_SE_VE);
  igual("en Perfil se ve «Tu cuenta»", v.grupos["Tu cuenta"], "perfil:ve");

  console.log("\nBuscar destapa todas las pestañas");
  await page.fill("#buscar-panel-campo", "a");
  await page.waitForTimeout(200);
  igual("ninguna sección queda fuera mientras se busca", await page.$$eval(".jornada-fuera", (n) => n.length), 0);
  await page.fill("#buscar-panel-campo", "");
  await page.dispatchEvent("#buscar-panel-campo", "input");
  await page.waitForTimeout(200);
  cierto("al borrar la búsqueda vuelven las pestañas", (await page.$$eval(".jornada-fuera", (n) => n.length)) > 0);

  console.log("\nEn la computadora, el menú a la izquierda");
  const caja = await page.evaluate(() => {
    const nav = document.querySelector(".jornada-nav").getBoundingClientRect();
    const cont = document.querySelector(".jornada-marco > .max-w-6xl").getBoundingClientRect();
    return { pos: getComputedStyle(document.querySelector(".jornada-nav")).position, izquierda: nav.right <= cont.left + 1 };
  });
  igual("el menú es sticky y queda a la izquierda", caja, { pos: "sticky", izquierda: true });
  igual("sin errores", errores, []);
  await ctx.close();
}

async function pruebaCelular(browser) {
  console.log("\nEn el celular, la barra fija abajo");
  const { ctx, page, errores } = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 390, height: 844 } });
  const barra = await page.evaluate(() => {
    const n = document.querySelector(".jornada-nav");
    const r = n.getBoundingClientRect();
    return { pos: getComputedStyle(n).position, abajo: Math.abs(r.bottom - innerHeight) <= 1, ancho: Math.round(r.width) };
  });
  igual("fija, pegada abajo y de lado a lado", barra, { pos: "fixed", abajo: true, ancho: 390 });
  igual("la página no se ensancha", await page.evaluate(() => document.documentElement.scrollWidth <= 390), true);
  igual("sin errores", errores, []);
  await ctx.close();
}

// Los grupos de Entrenar que se ven ahora mismo.
const GRUPOS_VISIBLES_DE = (pestana) => Array.from(document.querySelectorAll("#tile-grid > section"))
  .filter((s) => (s.dataset.jornada || "").split(" ").includes(pestana) && s.checkVisibility())
  .map((s) => s.dataset.grupo);

async function pruebaSecciones(browser) {
  console.log("\nEn la computadora, lo de Entrenar por separado en el menú");
  const { ctx, page, errores } = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 1280, height: 900 } });
  igual("debajo de Entrenar, sus secciones", await page.$$eval(".jornada-nav li:has(> button[data-pestana='entrenar']) .jornada-sub > li > *", (b) => b.map((x) => x.textContent.trim())),
    ["Estudiar", "Aprender", "Entrenamiento básico", "Entrenamiento intermedio", "Entrenamiento avanzado", "Habilidades"]);
  igual("debajo de Jugar, preparar a un rival (enlace a «Prepárate tú»)", await page.$$eval(".jornada-nav li:has(> button[data-pestana='jugar']) .jornada-sub a", (a) => a.map((x) => [x.textContent.trim(), x.getAttribute("href")])),
    [["Preparar a un rival", "plan-rival.html"]]);
  cierto("las secciones se ven en el menú", await page.$eval(".jornada-nav .jornada-sub button[data-seccion='Aprender']", (b) => b.checkVisibility()));
  igual("la fila del celular no se ve en la computadora", await page.$$eval(".jornada-fila", (f) => f.filter((x) => x.checkVisibility()).length), 0);

  await page.click(".jornada-nav .jornada-sub button[data-seccion='Aprender']");
  igual("al elegir Aprender, de Entrenar solo se ve Aprender", await page.evaluate(GRUPOS_VISIBLES_DE, "entrenar"), ["Aprender"]);
  igual("Aprender es la página; Entrenar queda marcada como parte", await page.evaluate(() => [
    document.querySelector(".jornada-nav .jornada-sub button[data-seccion='Aprender']").getAttribute("aria-current"),
    document.querySelector(".jornada-nav button[data-pestana='entrenar']").getAttribute("aria-current")]), ["page", "true"]);
  igual("el título dice la sección", await page.$eval("#jornada-titulo", (t) => t.textContent), "Entrenar · Aprender");
  await page.click(".jornada-nav button[data-pestana='entrenar']");
  const todos = await page.evaluate(GRUPOS_VISIBLES_DE, "entrenar");
  igual("la pestaña Entrenar vuelve a mostrar todo, Estudiar incluido", todos.includes("Estudiar") && todos.includes("Aprender") && todos.length >= 5, true);

  console.log("\nLa sesión también en Clases");
  await page.click(".jornada-nav button[data-pestana='clases']");
  igual("«Clase en vivo» está en Inicio y en Clases", await page.evaluate(() => {
    const s = Array.from(document.querySelectorAll("#tile-grid > section")).find((x) => x.dataset.grupo === "Clase en vivo");
    return s ? [s.dataset.jornada, s.checkVisibility()] : "falta";
  }), ["inicio clases", true]);
  igual("el estado de la clase en vivo también es de Clases", await page.$eval("#session-status-card", (s) => s.dataset.jornada), "inicio clases");
  igual("sin errores", errores, []);
  await ctx.close();

  console.log("\nEn el celular, las secciones en una fila arriba de la pestaña");
  const c = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 390, height: 844 } });
  await c.page.click(".jornada-nav button[data-pestana='entrenar']");
  igual("la fila de Entrenar se ve y trae todo", await c.page.$$eval(".jornada-fila[data-jornada='entrenar']", (f) => f.filter((x) => x.checkVisibility()).map((x) => Array.from(x.children).map((b) => b.textContent.trim()))),
    [["Todo", "Estudiar", "Aprender", "Entrenamiento básico", "Entrenamiento intermedio", "Entrenamiento avanzado", "Habilidades"]]);
  igual("el menú de la computadora no se ve en el celular", await c.page.$$eval(".jornada-sub", (s) => s.filter((x) => x.checkVisibility()).length), 0);
  await c.page.click(".jornada-fila[data-jornada='entrenar'] button[data-seccion='Mejorar por habilidades']");
  igual("Habilidades queda sola", await c.page.evaluate(GRUPOS_VISIBLES_DE, "entrenar"), ["Mejorar por habilidades"]);
  igual("y abierta (en el celular los grupos arrancan plegados)", await c.page.evaluate(() => {
    const s = Array.from(document.querySelectorAll("#tile-grid > section")).find((x) => x.dataset.grupo === "Mejorar por habilidades");
    const b = s.querySelector("h2 button[aria-expanded]");
    return b ? b.getAttribute("aria-expanded") : "sin botón";
  }), "true");
  await c.page.click(".jornada-nav button[data-pestana='jugar']");
  igual("en Jugar, la fila trae preparar a un rival", await c.page.$$eval(".jornada-fila[data-jornada='jugar'] a", (a) => a.filter((x) => x.checkVisibility()).map((x) => x.getAttribute("href"))), ["plan-rival.html"]);
  igual("la página no se ensancha con la fila", await c.page.evaluate(() => document.documentElement.scrollWidth <= 390), true);
  igual("sin errores", c.errores, []);
  await c.ctx.close();
}

async function pruebaHash(browser) {
  console.log("\nclases.html#tus-clases abre la pestaña donde vive");
  const { ctx, page } = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 1280, height: 900 } }, "#tus-clases");
  igual("abre en Clases", await page.$eval(".jornada-nav button[aria-current='page']", (b) => b.dataset.pestana), "clases");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    for (const p of [pruebaSinAnotar, pruebaProfesoraAnotada, pruebaPestanas, pruebaCelular, pruebaSecciones, pruebaHash]) await p(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl panel jornada está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
