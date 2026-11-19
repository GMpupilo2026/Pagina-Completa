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
  igual("las pestañas", await page.$$eval(".jornada-nav button", (b) => b.map((x) => x.textContent.trim())),
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

async function pruebaHash(browser) {
  console.log("\nclases.html#tus-clases abre la pestaña donde vive");
  const { ctx, page } = await abrir(browser, ALUMNO, ANOTADO(ALUMNO.id), { viewport: { width: 1280, height: 900 } }, "#tus-clases");
  igual("abre en Clases", await page.$eval(".jornada-nav button[aria-current='page']", (b) => b.dataset.pestana), "clases");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    for (const p of [pruebaSinAnotar, pruebaProfesoraAnotada, pruebaPestanas, pruebaCelular, pruebaHash]) await p(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl panel jornada está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
