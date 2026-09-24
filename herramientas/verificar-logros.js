/* Comprueba logros.html y, de paso, la tarjeta de racha de clases.html.

   La cuenta de la racha y de los logros la hace la base
   (public.progreso_dias_y_racha, ver js/logros.js): esta prueba no
   recalcula esos números por su cuenta —eso ya se comprobó con SQL de
   verdad contra el proyecto de Supabase, con datos sintéticos e
   impersonando el rol del alumno— sino que le da a la página un resultado
   de mentira ya calculado y comprueba que PINTE lo que ese resultado dice:
   la racha, la barra de "hoy" y, sobre todo, que cada logro salga
   conseguido o no EXACTAMENTE según su meta, comparando contra lo que el
   propio js/logros-catalogo.js (cargado de verdad, sin doble) calcula para
   los mismos números — así una meta mal escrita en el catálogo se vería
   igual de mal en la página que en esta prueba.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-logros.js                */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

// A propósito, ni todo en cero ni todo conseguido: así se ve tanto un logro
// ganado como uno a medias, que es donde de verdad se puede romper algo.
const STATS = {
  dias_activos: 12,
  racha_actual: 5,
  racha_record: 7,
  total_ejercicios: 137,
  tipos_distintos: 4,
  hoy_ejercicios: 3,
  primer_dia: "2026-08-01",
  por_actividad: { mates: 60, "4x4": 50, temas: 3, confites: 1 },
};

function clienteFalso(sesion, stats) {
  return `
(function () {
  window.__rpcPedidos = [];
  window.sb = {
    auth: {
      getSession: () => Promise.resolve(${sesion ? '{ data: { session: { user: { id: "u-ana" }, access_token: "t" } } }' : "{ data: { session: null } }"}),
    },
    from: () => ({ select() { return this; }, eq() { return this; },
                   then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
    rpc: (nombre) => {
      window.__rpcPedidos.push(nombre);
      const filas = nombre === "progreso_dias_y_racha" ? ${JSON.stringify(stats ? [stats] : [])} : [];
      return { then(r) { return Promise.resolve({ data: filas, error: null }).then(r); } };
    },
  };
})();
`;
}

// Para las cuatro páginas que hasta ahora no alimentaban la racha
// (aperturas, confites, ilumina, visualización): un cliente que además
// ANOTA cada insert a training_progress, para comprobar que de verdad se
// registra la actividad correcta — no alcanza con que la página "no truene".
function clienteFalsoConInserts() {
  return `
(function () {
  window.__inserts = [];
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" }, access_token: "t" } } }) },
    from: (t) => ({
      select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
      insert(rows) {
        window.__inserts.push({ tabla: t, rows: rows });
        return { select() { return this; }, single() { return Promise.resolve({ data: { id: 1 }, error: null }); },
                 then(r) { return Promise.resolve({ data: null, error: null }).then(r); } };
      },
      then(r) { return Promise.resolve({ data: [], error: null }).then(r); },
    }),
    rpc: () => ({ then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
  };
})();
`;
}

function leerChessJs() {
  const path = require("path");
  const fs = require("fs");
  for (const base of String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
                    .concat([path.join(__dirname, "..", "node_modules")])) {
    const f = path.join(base, "chess.js", "chess.js");
    if (fs.existsSync(f)) return fs.readFileSync(f, "utf8");
  }
  return "";
}
const CHESSJS = leerChessJs();

async function abrirConInserts(browser, ruta, esperar) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalsoConInserts() }));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  await page.waitForSelector(esperar, { timeout: 20000 });
  return { page, errores };
}

// EntrenoProgress.log manda un ARREGLO de una fila (insert([{...}])), y la
// página además ya tiene su propio insert en platform_activity_log (el
// latido de tiempo-plataforma.js) — hay que mirar solo la fila de
// training_progress, no "la primera que llegó".
function filaDeTrainingProgress(inserts) {
  const fila = inserts.find((i) => i.tabla === "training_progress");
  return fila ? [fila.rows[0].activity, fila.rows[0].detail] : [null, null];
}

// Las cuatro actividades que se sumaron al CHECK de training_progress porque
// hasta ahora solo vivían en localStorage. Se dispara el mismo camino que ya
// usa cada página al terminar un ejercicio —llamando a su propia función de
// arriba hacia abajo, en vez de reimplementar el gesto del usuario— y se
// comprueba que la fila que sale de ahí es la que espera la racha.
async function pruebaPaginasQueAlimentanLaRacha(browser) {
  console.log("\n=== Las cuatro páginas que se sumaron a la racha ===");

  {
    const { page, errores } = await abrirConInserts(browser, "/confites.html", "#board");
    await page.evaluate(() => {
      caballo = "a1"; pisadas = new Set(["a1"]); conAyuda = false; terminado = false;
      window.saltosDesde = () => [];   // fuerza "sin más saltos" sin jugar el tablero entero
      revisarFinal();
    });
    const inserts = await page.evaluate(() => window.__inserts);
    igual("confites.html registra la ronda en training_progress", filaDeTrainingProgress(inserts)[0], "confites");
    errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
    await page.close();
  }

  {
    const { page, errores } = await abrirConInserts(browser, "/ilumina-tablero.html", "#app:not(.hidden)");
    await page.evaluate(() => {
      nivelActualIdx = 0;
      onBoardChange({ objetivosIluminados: 1, objetivosTotal: 1, resuelto: true });
    });
    const inserts = await page.evaluate(() => window.__inserts);
    igual("ilumina-tablero.html registra el nivel resuelto en training_progress", filaDeTrainingProgress(inserts)[0], "ilumina");
    errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
    await page.close();
  }

  {
    const { page, errores } = await abrirConInserts(browser, "/entreno/aperturas.html", "#app:not(.hidden)");
    await page.evaluate(() => {
      linea = { id: "linea-de-prueba" };
      errores = 0; pistas = 0;   // línea perfecta, para que notaDe() no reviente con undefined
      terminar();
    });
    const inserts = await page.evaluate(() => window.__inserts);
    const [actividad, detalle] = filaDeTrainingProgress(inserts);
    igual("entreno/aperturas.html registra la línea terminada en training_progress",
      [actividad, detalle && detalle.linea_id], ["aperturas", "linea-de-prueba"]);
    errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
    await page.close();
  }

  {
    const { page, errores } = await abrirConInserts(browser, "/entreno/visualizacion.html", "#app:not(.hidden)");
    // Los niveles (NIVELES) son un arreglo fijo del propio script; abrir el
    // primero es lo mismo que haría un clic en su tarjeta, sin tener que
    // esperar a que termine de bajar el banco de puzzles para ubicarla.
    await page.waitForFunction(() => typeof NIVELES !== "undefined" && typeof openLevel === "function", { timeout: 15000 });
    await page.evaluate(() => openLevel(NIVELES[0].id));
    await page.waitForFunction(() => typeof currentId === "function" && currentId() !== undefined && game !== null, { timeout: 15000 });
    await page.evaluate(() => finishPuzzle());
    const inserts = await page.evaluate(() => window.__inserts);
    igual("entreno/visualizacion.html registra el ejercicio en training_progress", filaDeTrainingProgress(inserts)[0], "visualizacion");
    errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
    await page.close();
  }
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function abrir(browser, ruta, sesion, stats, opts) {
  const ctx = await browser.newContext(opts || {});
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(sesion, stats) }));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("=== Sin sesión: manda a iniciar sesión ===");
    {
      const { page, ctx } = await abrir(browser, "/logros.html", false, STATS);
      await page.waitForFunction(() => location.pathname.includes("login.html"), { timeout: 10000 });
      igual("redirige a login.html con next=logros.html",
        await page.evaluate(() => new URL(location.href).searchParams.get("next")), "logros.html");
      await ctx.close();
    }

    console.log("\n=== Con sesión: la racha ===");
    const { page, ctx, errores } = await abrir(browser, "/logros.html", true, STATS);
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    await page.waitForFunction(() => document.getElementById("racha-actual").textContent !== "—", { timeout: 10000 });

    igual("el gate queda oculto de verdad", await page.evaluate(() => getComputedStyle(document.getElementById("gate")).display), "none");
    igual("racha actual pintada", await page.evaluate(() => document.getElementById("racha-actual").textContent), String(STATS.racha_actual));
    igual("el texto menciona el récord, que es más alto que la racha actual",
      await page.evaluate(() => /récord.*7 días/i.test(document.getElementById("racha-record-texto").textContent)), "true");
    igual("hoy: 3 de 5 ejercicios", await page.evaluate(() => document.getElementById("racha-hoy-texto").textContent),
      "Hoy llevas 3 de 5 ejercicios para que el día cuente.");
    igual("la barra de hoy pinta 3 segmentos llenos de 5",
      await page.evaluate(() => document.querySelectorAll("#racha-hoy-barra > span.bg-accent-500").length), 3);
    igual("no se muestra el aviso de error", await page.evaluate(() => getComputedStyle(document.getElementById("sin-sesion-aviso")).display), "none");
    igual("se pidió progreso_dias_y_racha por RPC, no se bajó ninguna tabla entera",
      // mi_acceso es el candado de acceso (js/acceso-vigente.js, en toda página de
      // la Academia desde #378) y mi_marca_academia el logo y el color de la
      // academia (js/marca-academia.js, igual en todas): ninguna es una cuenta de
      // progreso, así que no cuentan acá.
      await page.evaluate(() => window.__rpcPedidos.filter((n) => n !== "mi_acceso" && n !== "mi_marca_academia")), ["progreso_dias_y_racha"]);

    console.log("\n=== Los logros: la página pinta lo que el catálogo calcula ===");
    const esperado = await page.evaluate((stats) => window.LogrosCatalogo.conEstado(stats), STATS);
    const pintado = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#logros-grid li")).map((li) => ({
        conseguido: li.textContent.includes("Conseguido ✔"),
        texto: li.textContent,
      })));
    igual("hay una tarjeta por cada logro del catálogo", pintado.length, esperado.length);
    const desajustados = esperado.filter((l, i) => l.conseguido !== pintado[i].conseguido);
    igual("cada tarjeta dice «Conseguido» si y solo si el catálogo lo marca conseguido", desajustados.length, 0);

    // Un par de cabeceras de sección, con el conteo correcto.
    const cabeceras = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#logros-grid h2")).map((h) => h.textContent));
    igual("racha (2/8): solo llegó a los 3 y a los 7 días", cabeceras[0], "Racha de días (2/8)");
    igual("confites (1/1): su primera ronda ya cuenta", cabeceras.find((t) => t.startsWith("Confites")), "Confites del caballo (1/1)");
    igual("mates (2/3): tiene 60, así que le falta el de 200", cabeceras.find((t) => t.startsWith("Mates")), "Mates (2/3)");

    // Un logro ya conseguido no debe verse "bloqueado": ni con 🔒 ni apagado.
    const primeraRacha = await page.evaluate(() => document.querySelector("#logros-grid li"));
    igual("el primer logro (racha de 3 días, ya conseguido) no muestra el candado",
      await page.evaluate(() => document.querySelector("#logros-grid li").textContent.includes("🔒")), "false");

    errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
    await ctx.close();

    console.log("\n=== Sin datos (RPC vacío): no rompe, se ve todo en cero ===");
    {
      const { page: page2, ctx: ctx2, errores: errores2 } = await abrir(browser, "/logros.html", true, null);
      await page2.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      await page2.waitForFunction(() => document.getElementById("racha-actual").textContent !== "—", { timeout: 10000 });
      igual("sin fila del RPC, la racha se ve en 0 y no rompe la página",
        await page2.evaluate(() => document.getElementById("racha-actual").textContent), "0");
      igual("y ningún logro sale conseguido",
        await page2.evaluate(() => document.getElementById("logros-grid").textContent.includes("Conseguido ✔")), "false");
      errores2.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
      await ctx2.close();
    }

    console.log("\n=== Que la página se vea (tema oscuro) ===");
    {
      const { page: page3, ctx: ctx3 } = await abrir(browser, "/logros.html", true, STATS, { colorScheme: "dark" });
      await page3.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      const sueltos = await page3.evaluate(() => ({
        css: /\{[^}]*(color|display|margin)\s*:/.test(document.body.innerText),
        estilos: document.querySelectorAll("style").length,
      }));
      igual("no hay CSS impreso como texto", sueltos.css, "false");
      igual("ningún <style> suelto (clases.html no lleva ninguno propio, y esta se clonó de ahí)", sueltos.estilos, "0");
      const fondo = await page3.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const rgb = (fondo.match(/\d+/g) || []).map(Number);
      igual("con el tema en oscuro, el fondo sale oscuro", rgb[0] + rgb[1] + rgb[2] < 200, "true");
      await page3.setViewportSize({ width: 1024, height: 900 });
      igual("la grilla de logros de verdad usa grid (no columnas de a una)",
        await page3.evaluate(() => getComputedStyle(document.querySelector("#logros-grid ul")).display), "grid");
      await ctx3.close();
    }

    await pruebaPaginasQueAlimentanLaRacha(browser);
  } finally {
    await browser.close();
  }

  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien: la racha y los logros pintan lo que dice la base.");
  process.exit(fallos ? 1 : 0);
})();
