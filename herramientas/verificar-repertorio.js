/* «Mi repertorio» en entreno/aperturas.html (js/repertorio-aperturas.js), en un
   navegador de verdad.

   Lo que se rompe acá no da ningún error: una línea guardada con una jugada
   que no existe se ve perfecta en el árbol y el entrenador no la deja
   terminar nunca; una segunda respuesta a la misma posición hace que el
   entrenador pida dos jugadas distintas en el mismo lugar; y una línea
   borrada que deja su ficha de repaso sigue sumando en el «Repaso del día».

   Comprueba:
   - las funciones puras (validar, choque, árbol) con chess.js;
   - que el árbol pinte cada color con sus líneas, y que una fila que no se
     puede jugar no se entrene y se diga;
   - armar una línea escribiéndola y haciendo clic en el tablero, el aviso de
     la respuesta que choca, y lo que se guarda;
   - entrenarla de punta a punta (la ficha de repaso queda con «mi:<id>»);
   - borrarla: pregunta, borra ESA y deja la ficha marcada como borrada;
   - el enlace directo ?linea=mi:<id>.

   Uso:  node herramientas/verificar-todo.js repertorio                       */
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");
const R = require(path.join(__dirname, "..", "js", "repertorio-aperturas.js"));

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

const FILAS = [
  { id: "it", alumno_id: "u-ana", color: "w", nombre: "Italiana", jugadas: ["e4", "e5", "Nf3", "Nc6", "Bc4"], created_at: "2026-09-01T10:00:00Z" },
  { id: "sic", alumno_id: "u-ana", color: "b", nombre: "Siciliana", jugadas: ["e4", "c5", "Nf3", "d6"], created_at: "2026-09-02T10:00:00Z" },
  // Una fila que no se puede jugar (la base solo mira la forma de cada jugada).
  { id: "rota", alumno_id: "u-ana", color: "w", nombre: "Rota", jugadas: ["e4", "e4"], created_at: "2026-09-03T10:00:00Z" },
  // De otra alumna: con el doble filtrando de verdad, no puede colarse.
  { id: "otra", alumno_id: "u-beto", color: "w", nombre: "La de Beto", jugadas: ["d4", "d5"], created_at: "2026-09-04T10:00:00Z" },
];

/* El doble filtra por eq() y anota cada escritura EN EL RESOLVER, con sus
   condiciones: un delete sin .eq("id") sería un delete de todo. */
function clienteFalso(filas) {
  return `
window.__escrituras = [];
(function () {
  const TABLAS = { repertorio: ${JSON.stringify(filas)} };
  function consulta(tabla) {
    let conds = [], pendiente = null, unica = false;
    const b = {
      select() { return b; }, order() { return b; }, in() { return b; }, limit() { return b; },
      eq(c, v) { conds.push([c, v]); return b; },
      maybeSingle() { unica = true; return b; }, single() { unica = true; return b; },
      insert(f) { pendiente = { accion: "insert", fila: f }; return b; },
      upsert(f) { pendiente = { accion: "upsert", fila: f }; return b; },
      delete() { pendiente = { accion: "delete" }; return b; },
      then(res, rej) {
        if (pendiente) window.__escrituras.push(Object.assign({ tabla, donde: conds.slice() }, pendiente));
        if (pendiente && pendiente.accion === "insert") {
          const f = Object.assign({ id: "nueva-" + window.__escrituras.length, alumno_id: "u-ana", created_at: "2026-10-01T10:00:00Z" }, pendiente.fila);
          (TABLAS[tabla] = TABLAS[tabla] || []).push(f);
          return Promise.resolve({ data: unica ? f : [f], error: null }).then(res, rej);
        }
        let d = (TABLAS[tabla] || []).slice();
        conds.forEach(([c, v]) => { d = d.filter((f) => String(f[c]) === String(v)); });
        if (pendiente && pendiente.accion === "delete") {
          TABLAS[tabla] = (TABLAS[tabla] || []).filter((f) => d.indexOf(f) === -1);
          return Promise.resolve({ data: null, error: null }).then(res, rej);
        }
        return Promise.resolve({ data: unica ? (d[0] || null) : d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" }, access_token: "t" } } }) },
    from: (t) => consulta(t),
    rpc: () => ({ then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
  };
})();
`;
}

async function abrir(browser, ruta) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(FILAS) }));
  await page.addInitScript(contestarAvisos);
  await page.goto(BASE + (ruta || "/entreno/aperturas.html"), { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { ctx, page, errores };
}

const seVe = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

async function jugarClics(page, tablero, desde, hasta) {
  await page.click(`${tablero} [data-square="${desde}"]`);
  await page.click(`${tablero} [data-square="${hasta}"]`);
}

(async () => {
  console.log("\n=== Las funciones, sin navegador ===");
  igual("validar deja el SAN de chess.js", R.validar(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7"]).jugadas.slice(-1), ["Qxf7#"]);
  igual("una jugada que no existe en su posición no pasa", R.validar(["e4", "e4"]).ok, false);
  igual("con una sola jugada no hay línea", R.validar(["e4"]).ok, false);
  const sic = [{ id: "s", color: "b", nombre: "Sic", jugadas: ["e4", "c5", "Nf3", "d6"] }];
  igual("otra respuesta tuya a 1.e4 choca, y dice cuál juegas", (R.choque(sic, "b", ["e4", "e5"]) || {}).jugada, "c5");
  igual("otra jugada del RIVAL no choca (es otra rama)", R.choque(sic, "b", ["e4", "c5", "Nc3", "Nc6"]), null);
  igual("con el otro color no choca", R.choque(sic, "w", ["e4", "e5"]), null);
  igual("el árbol junta lo común y abre las ramas",
    R.arbol(sic.concat([{ id: "t", color: "b", nombre: "Cerrada", jugadas: ["e4", "c5", "Nc3", "Nc6"] }])).hijos[0].hijos[0].hijos.map((h) => h.san), ["Nf3", "Nc3"]);

  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const { ctx, page, errores } = await abrir(browser);

    console.log("\n=== El árbol ===");
    await page.click("#btn-mio");
    igual("«Mi repertorio» se ve y dice que está elegido", [await seVe(page, "#vista-mio"), await page.getAttribute("#btn-mio", "aria-pressed")], [true, "true"]);
    igual("la lista del banco no se ve", await seVe(page, "#vista-lista"), false);
    const arbol = await page.evaluate(() => ["w", "b"].map((c) => {
      const s = document.querySelector(`[data-rep-color="${c}"]`);
      return [s.querySelector("h2").textContent, [...s.querySelectorAll("li > p")].map((p) => p.textContent).join(" / "),
        [...s.querySelectorAll("[data-rep-linea]")].map((d) => d.getAttribute("data-rep-linea")).join(",")];
    }));
    igual("con blancas, la Italiana en un renglón, en la notación de acá",
      arbol[0], ["♔ Con blancas", "1. e4 e5 2. Cf3 Cc6 3. Ac4", "it"]);
    igual("con negras, la Siciliana", arbol[1], ["♚ Con negras", "1. e4 c5 2. Cf3 d6", "sic"]);
    const est = await page.textContent("#rep-estado");
    igual("cuenta las suyas, no la de Beto, y dice que una no se pudo leer",
      [/^2 líneas en tu repertorio · 2 para repasar hoy\./.test(est), /Una línea no se pudo leer y no se entrena\./.test(est), est.includes("Beto")], [true, true, false]);

    console.log("\n=== El repertorio en PDF ===");
    const [bajada] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }).catch(() => null), page.click("#rep-pdf")]);
    igual("baja «mi-repertorio.pdf»", bajada && bajada.suggestedFilename(), "mi-repertorio.pdf");
    if (bajada) {
      const ruta = await bajada.path();
      let texto = "";
      try {
        texto = require("child_process").execFileSync("python3", ["-c", "import sys,pypdf; print('\\n'.join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))", ruta]).toString().replace(/\s+/g, " ");
      } catch (e) { texto = "pypdf: " + e.message; }
      igual("con su título, los dos colores y cada línea en la notación de acá",
        ["Mi repertorio de aperturas", "Con blancas", "Italiana", "1. e4 e5 2. Cf3 Cc6 3. Ac4", "Con negras", "Siciliana", "1. e4 c5 2. Cf3 d6"].filter((t) => !texto.includes(t)), []);
      igual("la línea que no se puede jugar no va", texto.includes("Rota"), false);
    }

    console.log("\n=== Armar una línea ===");
    await page.click("#rep-agregar");
    igual("el botón dice que abrió el editor", await page.getAttribute("#rep-agregar", "aria-expanded"), "true");
    await page.check('input[name="rep-color"][value="b"]');
    await page.fill("#rep-escribir", "e4 e5");
    await page.click("#rep-escribir-btn");
    igual("escribir en la notación de acá arma la línea", await page.textContent("#rep-jugadas"), "1. e4 e5");
    igual("y avisa que choca con la Siciliana (1.e4 ya se contesta c5)",
      /^Choca con «Siciliana»: en la jugada 1 ahí juegas c5\./.test(await page.textContent("#rep-aviso")), true);
    await page.fill("#rep-nombre", "Abierta");
    await page.evaluate(() => { window.__escrituras.length = 0; });
    await page.click("#rep-guardar");
    await page.waitForTimeout(200);
    igual("con el choque no se guarda nada", await page.evaluate(() => window.__escrituras.length), 0);
    await page.click("#rep-deshacer");
    await page.click("#rep-deshacer");
    // Con clics: d4 lo juegan las blancas (el tablero está del lado negro).
    await jugarClics(page, "#rep-board", "d2", "d4");
    await jugarClics(page, "#rep-board", "g8", "f6");
    await page.fill("#rep-escribir", "2.c4 e6");
    await page.press("#rep-escribir", "Enter");
    igual("clics y escritura se suman", await page.textContent("#rep-jugadas"), "1. d4 Cf6 2. c4 e6");
    igual("sin choque, no hay aviso", await page.textContent("#rep-aviso"), "");
    await page.fill("#rep-nombre", "India de dama");
    await page.click("#rep-guardar");
    await page.waitForFunction(() => window.__escrituras.length > 0);
    igual("se guarda el color, el nombre y las jugadas en SAN",
      await page.evaluate(() => window.__escrituras[0]),
      { tabla: "repertorio", donde: [], accion: "insert", fila: { color: "b", nombre: "India de dama", jugadas: ["d4", "Nf6", "c4", "e6"] } });
    await page.waitForFunction(() => document.querySelector("#rep-editor").classList.contains("hidden"));
    igual("el editor se cierra y la línea nueva está en el árbol de negras",
      await page.evaluate(() => [...document.querySelectorAll('[data-rep-color="b"] li > p')].map((p) => p.textContent)),
      ["1. e4 c5 2. Cf3 d6", "1. d4 Cf6 2. c4 e6"]);

    console.log("\n=== Jugar con mi repertorio ===");
    // El sorteo entre las respuestas preparadas, fijo: sale la primera (1.e4).
    await page.evaluate(() => { Math.random = () => 0; });
    await page.click('[data-rep-jugar="b"]');
    await page.waitForSelector("#rep-partida:not(.hidden) .visor-tablero [data-square]", { timeout: 15000 });
    await page.waitForFunction(() => /El rival: /.test((document.querySelector("#rep-partida .visor-nota") || {}).textContent || ""), null, { timeout: 8000 });
    igual("el rival juega lo que preparaste, y lo dice",
      await page.evaluate(() => /^El rival: .*(e4|eva 4).* Es una de las respuestas del rival que preparaste aquí \(sale al azar\)\.$/
        .test(document.querySelector("#rep-partida .visor-nota").textContent)), true);
    // Me salgo de la línea: la Siciliana dice 1…c5.
    await jugarClics(page, "#rep-partida .visor-tablero", "e7", "e5");
    igual("al salirte te dice cuál era tu jugada",
      /En tu repertorio jugabas 1…c5\./.test(await page.textContent("#rep-partida .visor-nota")), true);
    await page.click('#rep-partida button:has-text("Terminar la partida")');
    await page.waitForSelector("#rep-partida [data-sparring-resumen] li", { timeout: 8000 });
    igual("y el resumen lo cuenta con las palabras del repertorio",
      await page.evaluate(() => [...document.querySelectorAll("#rep-partida [data-sparring-resumen] li")].map((li) => li.textContent)[0]),
      "Te saliste de tu repertorio en 1…e5: tu repertorio decía 1…c5.");
    await page.click('#rep-partida button:has-text("Cerrar la partida")');
    igual("«Cerrar la partida» la esconde", await seVe(page, "#rep-partida"), false);

    console.log("\n=== Entrenarla ===");
    await page.click('[data-rep-linea="it"] button:has-text("Entrenar")');
    await page.waitForSelector("#vista-tablero:not(.hidden)");
    igual("el entrenador dice que es de su repertorio", await page.textContent("#linea-apertura"), "Mi repertorio · juegas con blancas");
    igual("la barra de modos no estorba sobre el tablero", await seVe(page, "#barra-modos"), false);
    for (const [d, h] of [["e2", "e4"], ["g1", "f3"], ["f1", "c4"]]) {
      await jugarClics(page, "#board", d, h);
      await page.waitForTimeout(800);
    }
    await page.waitForSelector("#final:not(.hidden)", { timeout: 5000 });
    const srs = await page.evaluate(() => JSON.parse(localStorage.getItem("aperturas_srs_v1") || "{}"));
    igual("la ficha de repaso queda como «mi:it», con nota", [!!srs["mi:it"], !!(srs["mi:it"] && srs["mi:it"].ultimo)], [true, true]);
    igual("sin la «clave» del banco, ese renglón no se ve", await seVe(page, "#final-clave"), false);
    await page.click("#volver-btn");
    igual("«Volver» lleva a su repertorio", await seVe(page, "#vista-mio"), true);
    igual("y la línea ya no está para hoy", await page.textContent('[data-rep-linea="it"]'), "Italiana· mañanaEntrenarBorrar");

    console.log("\n=== Borrarla ===");
    await page.evaluate(() => { window.__escrituras.length = 0; window.__avisos.length = 0; });
    await page.click('[data-rep-linea="it"] button:has-text("Borrar")');
    await page.waitForFunction(() => window.__escrituras.some((e) => e.accion === "delete"));
    igual("pregunta, y borra ESA línea", await page.evaluate(() =>
      [window.__avisos.some((a) => /¿Borrar esta línea\?/.test(a)), JSON.stringify(window.__escrituras.find((e) => e.accion === "delete").donde)]),
      [true, '[["id","it"]]']);
    await page.waitForFunction(() => !document.querySelector('[data-rep-linea="it"]'));
    const srs2 = await page.evaluate(() => JSON.parse(localStorage.getItem("aperturas_srs_v1") || "{}")["mi:it"]);
    igual("su ficha de repaso queda marcada como borrada y sin vencer (la cuenta no la revive)",
      [srs2 && srs2.borrada, srs2 && srs2.vence], [true, "9999-12-31"]);
    igual("con blancas ya no queda nada", await page.textContent('[data-rep-color="w"] p.sub'), "Todavía no hay líneas con blancas.");
    if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
    await ctx.close();

    console.log("\n=== El enlace directo ===");
    const b = await abrir(browser, "/entreno/aperturas.html?linea=mi:sic");
    await b.page.waitForSelector("#vista-tablero:not(.hidden)", { timeout: 5000 }).catch(() => {});
    igual("?linea=mi:<id> abre esa línea", await b.page.textContent("#linea-nombre"), "Siciliana");
    if (b.errores.length) { console.log("  ✗ errores en la página: " + b.errores.join(" | ")); fallos += 1; }
    await b.ctx.close();
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: «Mi repertorio» arma, avisa, entrena y borra.");
  process.exit(fallos ? 1 : 0);
})();
