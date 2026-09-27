/* Comprueba las salas de torneos de punta a punta, con un Supabase de mentira
   (lib/doble-salas-torneo.js) que aplica la RLS y los check de la tabla:

   1. torneos-en-vivo.html pinta una ficha por sala VISIBLE, en su orden, con
      el botón que le toca (la sala de cine o los enlaces aparte), y dice algo
      cuando no hay ninguna o no se pudieron leer.
   2. admin.html#torneos: crear una sala de cada tipo, que la dirección se arme
      con el nombre, que un enlace sin https o sin botones no se mande, que la
      dirección de UNA ronda de Lichess se guarde con el torneo entero,
      editar, ocultar, reordenar y borrar (con su confirmación).
   3. Sin ser admin, la RLS no deja escribir y la página lo dice en vez de
      decir «guardada».

   Lo que se rompe callado acá: un formulario que manda un enlace
   «javascript:» a una página pública (lo frena la base, pero la persona se
   quedaría sin saber por qué), una sala oculta que igual se ve, o un orden
   que no cambia.

   Ver «Las salas de torneos se editan en administración» en
   docs/decisiones/juegos-y-torneos.md.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-salas-torneo.js                    */
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const { instalarAvisos } = require("./lib/avisos-prueba.js");
const { dobleSalas, SALAS } = require("./lib/doble-salas-torneo");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function abrir(browser, ruta, opciones) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: dobleSalas(opciones) }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  // Lichess: un torneo y una de sus rondas.
  await ctx.route("https://lichess.org/**", (r) => {
    const u = r.request().url();
    const h = { "Access-Control-Allow-Origin": "*" };
    if (u === "https://lichess.org/api/broadcast/Qwer5678") {
      return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify({ tour: { id: "Qwer5678", name: "Copa Nacional 2026" }, rounds: [{ id: "Rnd00001" }, { id: "Rnd00002" }] }) });
    }
    if (u === "https://lichess.org/api/broadcast/copa-nacional-2026/ronda-2/Rnd00002") {
      return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify({ tour: { id: "Qwer5678", name: "Copa Nacional 2026" }, round: { id: "Rnd00002" }, games: [] }) });
    }
    return r.fulfill({ status: 404, body: "" });
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await instalarAvisos(page);
  await page.goto(BASE + ruta);
  return { page, ctx, errores };
}

const fichas = (page) => page.$$eval("#salas-lista > li", (lis) => lis.map((li) => ({
  nombre: li.querySelector("h2").textContent,
  enlaces: [...li.querySelectorAll("a")].map((a) => [a.textContent.replace(/\s+/g, " ").trim(), a.getAttribute("href"), a.target || ""]),
})));

async function paginaPublica(browser) {
  console.log("\n=== torneos-en-vivo.html ===");
  let { page, ctx, errores } = await abrir(browser, "/torneos-en-vivo.html", { salas: SALAS });
  await page.waitForSelector("#salas-lista:not(.hidden)");
  const f = await fichas(page);
  igual("una ficha por sala visible, en su orden (la oculta no)", f.map((x) => x.nombre), ["Desafío Mentes Maestras CENFOTEC 2026", "Torneo UTN 2026"]);
  igual("la de Lichess entra a la sala de cine y ofrece Lichess aparte", f[0].enlaces, [
    ["Entrar a la sala de Desafío Mentes Maestras CENFOTEC 2026 →", "transmision.html?torneo=cenfotec", ""],
    ["Verlo directo en Lichess de Desafío Mentes Maestras CENFOTEC 2026 (se abre en otra pestaña) ↗", "https://lichess.org/broadcast/desafio-mentes-maestras-cenfotec-2026/s7NfNv6H", "_blank"]]);
  igual("la de enlaces lleva un botón por transmisión, que se abre aparte", f[1].enlaces.map((e) => [e[0].split(" de ")[0], e[2]]), [["Partida masculina", "_blank"], ["Partida femenina", "_blank"]]);
  igual("la pantalla de carga se va", await page.$eval("#loading", (e) => e.checkVisibility()), false);
  igual("sin errores de JavaScript", errores, []);
  await ctx.close();

  ({ page, ctx } = await abrir(browser, "/torneos-en-vivo.html", { salas: SALAS.filter((s) => !s.visible) }));
  await page.waitForSelector("#salas-vacio:not(.hidden)");
  igual("sin salas visibles lo dice", (await page.textContent("#salas-vacio")).trim().startsWith("Por ahora no hay ningún torneo"), true);
  await ctx.close();

  ({ page, ctx } = await abrir(browser, "/torneos-en-vivo.html", { salas: SALAS, falla: true }));
  await page.waitForFunction(() => document.getElementById("loading").textContent.startsWith("No pudimos"));
  igual("si la base falla lo dice, y la ruedita se va", await page.$$eval("#loading span", (s) => s.length), 0);
  await ctx.close();
}

async function escribir(page, sel, texto) { await page.fill(sel, ""); await page.type(sel, texto); }
const mensaje = (page) => page.textContent("#sala-msg");
const escrituras = (page) => page.evaluate(() => window.__escrituras);
const lista = (page) => page.$$eval("#salas-admin > li", (lis) => lis.map((li) => li.querySelector("p").textContent + " · " + li.querySelector("span.rounded-full").textContent));

async function editor(browser) {
  console.log("\n=== admin.html#torneos: la lista ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html#torneos", { salas: SALAS, admin: true });
  await page.waitForSelector("#salas-admin > li");
  igual("están todas, también la oculta, y lo dice", await lista(page), [
    "Desafío Mentes Maestras CENFOTEC 2026 · Publicada", "Torneo UTN 2026 · Publicada", "Copa en preparación · Oculta"]);
  igual("la sección se ve", await page.$eval('section[data-seccion="torneos"]', (s) => s.checkVisibility()), true);
  igual("el menú la marca", await page.getAttribute('a[data-ir="torneos"]', "aria-current"), "page");

  console.log("\n=== Contraste (AA, contra el fondo real, en claro y en oscuro) ===");
  for (const oscuro of [false, true]) {
    await page.evaluate((o) => document.documentElement.classList.toggle("dark", o), oscuro);
    const medidas = await page.evaluate(() => {
      const rgb = (t) => (t.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
      const lum = (c) => { const v = c.slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const fondo = (e) => { while (e) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || c[3] > 0.5) return c; e = e.parentElement; } return [255, 255, 255]; };
      const razon = (e) => { const [x, y] = [lum(rgb(getComputedStyle(e).color)), lum(fondo(e))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const peor = {};
      [["«Publicada»", '#salas-admin li[data-sala="cenfotec"] span.rounded-full'], ["«Oculta»", '#salas-admin li[data-sala="copa-secreta"] span.rounded-full'],
       ["«Borrar»", 'button[aria-label^="Borrar"]'], ["«Editar»", 'button[aria-label^="Editar"]'], ["el dato de cada sala", "#salas-admin li p.text-xs"]]
        .forEach(([k, sel]) => { peor[k] = Math.round(razon(document.querySelector(sel)) * 10) / 10; });
      return peor;
    });
    for (const [k, v] of Object.entries(medidas)) igual((oscuro ? "oscuro" : "claro") + ": " + k + " llega a 4,5:1 (" + v + ")", v >= 4.5, true);
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  console.log("\n=== Una sala de enlaces nueva ===");
  await page.click("#sala-nueva");
  igual("el botón dice que abrió el editor", await page.getAttribute("#sala-nueva", "aria-expanded"), "true");
  await escribir(page, "#sala-nombre", "Copa Invierno Árbitros 2026");
  igual("la dirección se arma sola, sin tildes", await page.inputValue("#sala-clave"), "copa-invierno-arbitros-2026");
  await page.check('input[name="sala-tipo"][value="enlaces"]');
  igual("sin Lichess, no se pide su dirección", await page.$eval("#sala-lichess-caja", (e) => e.checkVisibility()), false);
  await page.click("#sala-guardar");
  igual("sin botones no se manda", [await mensaje(page), (await escrituras(page)).length], ["Agrega al menos un botón con su dirección.", 0]);
  await page.click("#sala-enlace-mas");
  await escribir(page, "#sala-enlaces li:nth-child(1) [data-campo=texto]", "Sala A");
  await escribir(page, "#sala-enlaces li:nth-child(1) [data-campo=url]", "http://inseguro.com/a");
  await page.click("#sala-guardar");
  igual("un enlace sin https no se manda", [await mensaje(page), (await escrituras(page)).length], ["La dirección del botón 1 tiene que empezar con https:// y no llevar espacios.", 0]);
  igual("y el foco va al campo que hay que corregir", await page.evaluate(() => document.activeElement.dataset.campo), "url");
  await escribir(page, "#sala-enlaces li:nth-child(1) [data-campo=url]", "https://www.youtube.com/watch?v=abc123");
  igual("la vista previa es la ficha pública, y no se puede tocar", await page.$eval("#sala-previa", (c) => [c.inert, c.querySelector("h2").textContent, c.querySelector("a").textContent.split(" de ")[0]]),
    [true, "Copa Invierno Árbitros 2026", "Sala A"]);
  await page.click("#sala-guardar");
  await page.waitForFunction(() => document.getElementById("sala-editor").classList.contains("hidden"));
  const ins = (await escrituras(page)).pop();
  igual("se inserta lo del formulario, al final de la lista", [ins.op, ins.datos.clave, ins.datos.tipo, ins.datos.lichess_id, ins.datos.enlaces, ins.datos.orden],
    ["insert", "copa-invierno-arbitros-2026", "enlaces", null, [{ texto: "Sala A", url: "https://www.youtube.com/watch?v=abc123" }], 4]);
  igual("y aparece en la lista", (await lista(page)).pop(), "Copa Invierno Árbitros 2026 · Publicada");

  console.log("\n=== Una sala de Lichess, pegando la dirección de UNA ronda ===");
  await page.click("#sala-nueva");
  await escribir(page, "#sala-lichess", "https://lichess.org/broadcast/copa-nacional-2026/ronda-2/Rnd00002");
  await page.click("#sala-lichess-comprobar");
  await page.waitForFunction(() => document.getElementById("sala-lichess-estado").textContent.startsWith("✓"));
  igual("Lichess dice de qué torneo es", await page.textContent("#sala-lichess-estado"), "✓ «Copa Nacional 2026». Transmisión Qwer5678. (Pegaste la dirección de una ronda: la sala muestra el torneo entero.)");
  igual("y el nombre se llena solo", [await page.inputValue("#sala-nombre"), await page.inputValue("#sala-clave")], ["Copa Nacional 2026", "copa-nacional-2026"]);
  await page.uncheck("#sala-visible");
  await page.click("#sala-guardar");
  await page.waitForFunction(() => document.getElementById("sala-editor").classList.contains("hidden"));
  const ins2 = (await escrituras(page)).pop();
  igual("se guarda con el id del TORNEO, oculta", [ins2.datos.tipo, ins2.datos.lichess_id, ins2.datos.visible], ["lichess", "Qwer5678", false]);

  console.log("\n=== Lo que la base rechaza ===");
  await page.click("#sala-nueva");
  await escribir(page, "#sala-nombre", "Otra");
  await escribir(page, "#sala-clave", "cenfotec");
  await escribir(page, "#sala-lichess", "Zxcv0987");
  await page.click("#sala-guardar");
  await page.waitForFunction(() => document.getElementById("sala-msg").textContent.length > 0);
  igual("una dirección repetida se explica", await mensaje(page), "Ya hay otra sala con esa dirección. Cambia la dirección de la sala.");
  await escribir(page, "#sala-clave", "Mal Escrita");
  await page.click("#sala-guardar");
  igual("una dirección con mayúsculas o espacios, antes de mandar", await mensaje(page), "La dirección de la sala lleva solo minúsculas, números y guiones (por ejemplo «copa-2026»).");
  await page.click("#sala-cancelar");

  console.log("\n=== Editar, ocultar, ordenar, borrar ===");
  await page.click('#salas-admin li[data-sala="utn"] button[aria-label="Editar Torneo UTN 2026"]');
  igual("el editor trae la sala", [await page.inputValue("#sala-nombre"), await page.$$eval("#sala-enlaces li", (l) => l.length), await page.isChecked('input[name="sala-tipo"][value="enlaces"]')], ["Torneo UTN 2026", 2, true]);
  await escribir(page, "#sala-nombre", "Torneo UTN 2026 · Final");
  igual("editar el nombre no pisa la dirección", await page.inputValue("#sala-clave"), "utn");
  await page.click("#sala-guardar");
  await page.waitForFunction(() => document.getElementById("sala-editor").classList.contains("hidden"));
  const upd = (await escrituras(page)).pop();
  igual("se actualiza esa sala y solo esa", [upd.op, upd.filtros, upd.filas, upd.datos.nombre], ["update", [["id", "s-2"]], 1, "Torneo UTN 2026 · Final"]);

  await page.click('#salas-admin li[data-sala="cenfotec"] button[aria-label="Ocultar Desafío Mentes Maestras CENFOTEC 2026"]');
  await page.waitForFunction(() => document.querySelector('#salas-admin li[data-sala="cenfotec"] span.rounded-full').textContent === "Oculta");
  igual("ocultar la deja oculta", (await escrituras(page)).pop().datos, { visible: false });

  await page.click('#salas-admin li[data-sala="utn"] button[aria-label="Subir Torneo UTN 2026 · Final"]');
  await page.waitForFunction(() => document.querySelector("#salas-admin > li").dataset.sala === "utn");
  igual("subir la pone primera", await page.$$eval("#salas-admin > li", (l) => l.slice(0, 2).map((x) => x.dataset.sala)), ["utn", "cenfotec"]);
  igual("la primera no se puede subir más", await page.$eval('#salas-admin li[data-sala="utn"] button[aria-label^="Subir"]', (b) => b.disabled), true);

  await page.click('#salas-admin li[data-sala="copa-secreta"] button[aria-label="Borrar Copa en preparación"]');
  await page.waitForFunction(() => !document.querySelector('#salas-admin li[data-sala="copa-secreta"]'));
  igual("borrar pide confirmación con un botón que dice lo que hace", (await page.evaluate(() => window.__avisos)).some((a) => a.includes("¿Borrar la sala «Copa en preparación»?") && a.includes("Borrar la sala")), true);
  igual("y la borra", (await escrituras(page)).pop(), { op: "delete", filtros: [["id", "s-3"]], filas: 1 });
  igual("sin errores de JavaScript", errores, []);
  await ctx.close();
}

async function sinPermiso(browser) {
  console.log("\n=== Si la base no deja escribir, no dice «guardada» ===");
  // Quien administraba pierde el permiso con el panel abierto: el update no
  // da error (la RLS no toca ninguna fila), y la página tiene que notarlo.
  const { page, ctx } = await abrir(browser, "/admin.html#torneos", { salas: SALAS, admin: true });
  await page.waitForSelector("#salas-admin > li");
  await page.evaluate(() => window.__quitarAdmin());
  await page.click('#salas-admin li[data-sala="utn"] button[aria-label="Editar Torneo UTN 2026"]');
  await escribir(page, "#sala-nombre", "Hackeado");
  await page.click("#sala-guardar");
  await page.waitForFunction(() => document.getElementById("sala-msg").textContent.length > 0);
  igual("lo dice", await mensaje(page), "No se guardó: tu cuenta no tiene permiso para cambiar las salas.");
  igual("y el editor queda abierto con lo escrito", [await page.$eval("#sala-editor", (f) => f.checkVisibility()), await page.inputValue("#sala-nombre")], [true, "Hackeado"]);
  igual("la base no cambió", (await page.evaluate(() => window.__salas())).find((x) => x.clave === "utn").nombre, "Torneo UTN 2026");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await paginaPublica(browser);
    await editor(browser);
    await sinPermiso(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " falla(s)." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
