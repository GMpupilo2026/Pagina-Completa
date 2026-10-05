/* «Ejercicios sin internet» (entreno/sin-internet.html, js/sin-internet.js y
   la caché que sw.js no borra), en un navegador de verdad, cortándole la red.

   Lo que se rompe acá no da ningún error con señal, que es como se prueba
   todo lo demás: la página se ve perfecta y, en el bus, no abre; o abre y lo
   resuelto no se sube nunca; o se sube dos veces.

   Comprueba:
   - preparar una tanda con señal: los ejercicios de la dificultad elegida, en
     el aparato, y la página guardada en su caché;
   - sin señal: lo dice, no deja preparar otra, se resuelve con clics y
     escribiendo, lo resuelto queda en la cola con la hora, lo que costó entra
     al repaso, y no se escribe nada en la base;
   - al volver la señal: sube cada resultado con su hora y su
     `sin_internet_id`, vacía la cola, y uno que la base ya tenía (23505) sale
     de la cola sin contarse de nuevo;
   - con el service worker de verdad: la página se abre SIN RED desde la caché,
     con la tanda donde quedó.

   Uso:  node herramientas/verificar-todo.js sin-internet                     */
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RUTA = "/entreno/sin-internet.html";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* El doble anota cada insert y contesta 23505 a un sin_internet_id que «ya
   estaba» en la base. */
const CLIENTE_FALSO = `
window.__escrituras = window.__escrituras || [];
(function () {
  const YA_ESTABA = ["ya-subido"];
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" }, access_token: "t" } } }) },
    from: (t) => {
      let fila = null;
      const b = {
        select() { return b; }, eq() { return b; }, in() { return b; }, order() { return b; }, limit() { return b; },
        maybeSingle() { return b; }, upsert() { return b; },
        insert(f) { fila = f; return b; },
        then(r, j) {
          if (fila) {
            const id = fila.detail && fila.detail.sin_internet_id;
            if (YA_ESTABA.indexOf(id) !== -1) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } }).then(r, j);
            window.__escrituras.push({ tabla: t, fila });
          }
          return Promise.resolve({ data: [], error: null }).then(r, j);
        },
      };
      return b;
    },
    rpc: () => ({ then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
  };
})();
`;

async function abrir(ctx) {
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CLIENTE_FALSO }));
  await page.goto(BASE + RUTA, { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, errores };
}

const leerLS = (page, k) => page.evaluate((c) => JSON.parse(localStorage.getItem(c) || "null"), k);

// Juega el ejercicio actual entero con clics: las jugadas propias de la solución.
async function resolverConClics(page) {
  const t = await leerLS(page, "sin_internet_tanda_v1");
  const e = t.ejercicios[t.i];
  const { Chess } = require("chess.js").Chess ? require("chess.js") : { Chess: require("chess.js") };
  const juego = new Chess(e.fen);
  for (let k = 0; k < e.solution.length; k++) {
    const m = juego.move(e.solution[k], { sloppy: true });
    if (k % 2 === 1) { await page.waitForTimeout(800); continue; }
    await page.click(`#board [data-square="${m.from}"]`);
    await page.click(`#board [data-square="${m.to}"]`);
    if (m.promotion) {
      const elegir = page.locator(`[data-pieza="${m.promotion}"], [data-coronar="${m.promotion}"]`).first();
      if (await elegir.count()) await elegir.click();
    }
    await page.waitForTimeout(150);
  }
  await page.waitForSelector("#siguiente-btn:not(.hidden)", { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== Preparar la tanda con señal ===");
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    // Con Modo Adaptado: el recuadro para escribir la jugada se ve, y los
    // clics en el tablero siguen andando.
    await ctx.addInitScript(() => localStorage.setItem("oscarBlindMode_v1", "1"));
    const { page, errores } = await abrir(ctx);
    igual("dice que hay señal", await page.textContent("#red"), "📶 Tienes señal.");
    await page.selectOption("#cuantos", "10");
    await page.selectOption("#nivel", "facil");
    await page.click("#guardar-btn");
    await page.waitForFunction(() => /^Lista: 10 ejercicios guardados \(Fácil\)/.test(document.getElementById("preparar-estado").textContent), null, { timeout: 30000 });
    const t0 = await leerLS(page, "sin_internet_tanda_v1");
    igual("10 ejercicios en el aparato, todos fáciles (≤ 1199), sin repetir",
      [t0.ejercicios.length, t0.ejercicios.every((e) => e.rating <= 1199 && e.fen && e.solution.length), new Set(t0.ejercicios.map((e) => e.id)).size], [10, true, 10]);
    const guardado = await page.evaluate(async () => {
      const c = await caches.open("ajedrez-integral-sin-red");
      const claves = (await c.keys()).map((r) => new URL(r.url).pathname);
      const pag = await c.match("/entreno/sin-internet.html");
      return { pagina: !!pag && !pag.redirected, script: claves.includes("/js/sin-internet.js"), chess: claves.includes("/js/vendor/chess.js"), css: claves.includes("/css/tailwind.css"), sinHtml: claves.includes("/entreno/sin-internet") };
    });
    igual("la página queda en su caché, con sus scripts y su CSS (y también sin .html)", guardado, { pagina: true, script: true, chess: true, css: true, sinHtml: true });
    igual("la tanda se ve, en el primer ejercicio", [await page.isVisible("#tanda"), /^Ejercicio 1 de 10/.test(await page.textContent("#tanda-avance"))], [true, true]);

    console.log("\n=== Sin señal ===");
    await ctx.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    igual("lo dice", /^📴 Sin señal/.test(await page.textContent("#red")), true);
    igual("y no deja preparar otra tanda", await page.isDisabled("#guardar-btn"), true);
    await resolverConClics(page);
    let cola = await leerLS(page, "sin_internet_resultados_v1");
    igual("lo resuelto queda en la cola, limpio, con su hora", [cola.length, cola[0].limpio, !!Date.parse(cola[0].hecho_at), !!cola[0].sin_internet_id], [1, true, true, true]);
    igual("y dice que se sube con señal", /Se sube cuando vuelva la señal\./.test(await page.textContent("#round-status")), true);
    await page.click("#siguiente-btn");
    igual("pasa al ejercicio 2", /^Ejercicio 2 de 10/.test(await page.textContent("#tanda-avance")), true);
    // Escribiendo una jugada que no es: cuenta como error. Después, «Ver solución».
    const t1 = await leerLS(page, "sin_internet_tanda_v1");
    const mala = await page.evaluate((e) => {
      const j = new Chess(e.fen);
      const buena = j.move(e.solution[0], { sloppy: true }).san; j.undo();
      // Escrita como la escribe el alumno: en la notación de acá (Ae5, no Be5).
      return ComandosTablero.sanEspanol(j.moves().find((m) => m !== buena && !/#/.test(m)));
    }, t1.ejercicios[t1.i]);
    await page.fill("#q-comandos .cc-input", mala);
    await page.press("#q-comandos .cc-input", "Enter");
    await page.waitForTimeout(200);
    igual("una jugada escrita que no es se dice como incorrecta", /^Respuesta incorrecta: /.test(await page.textContent("#round-status")), true);
    await page.click("#solucion-btn");
    cola = await leerLS(page, "sin_internet_resultados_v1");
    igual("con error y solución: no es limpio", [cola.length, cola[1].limpio, cola[1].con_error, cola[1].con_pista], [2, false, true, true]);
    const repaso = await page.evaluate((id) => {
      const k = window.RepasoFallados ? RepasoFallados.CLAVES.temas : null;
      const e = k ? JSON.parse(localStorage.getItem(k) || "{}") : {};
      return !!e[id];
    }, t1.ejercicios[t1.i].id);
    igual("el que costó entra a la cola de repaso de Ejercicios por tema", repaso, true);
    igual("sin señal no se escribe nada en la base", await page.evaluate(() => window.__escrituras.length), 0);
    igual("y avisa cuántos esperan", await page.textContent("#pendientes-texto"), "2 resultados esperan para subirse a tu cuenta.");

    console.log("\n=== Vuelve la señal ===");
    // Uno que ya estaba en la base (la respuesta se perdió): sale sin contarse.
    await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("sin_internet_resultados_v1"));
      c.push({ sin_internet_id: "ya-subido", puzzle_id: "zzz", rating: 900, limpio: true, con_error: false, con_pista: false, hecho_at: new Date().toISOString() });
      localStorage.setItem("sin_internet_resultados_v1", JSON.stringify(c));
    });
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem("sin_internet_resultados_v1") || "[]")).length === 0, null, { timeout: 10000 }).catch(() => {});
    const subidos = await page.evaluate(() => window.__escrituras.map((e) => [e.tabla, e.fila.activity, e.fila.student_id, e.fila.created_at, e.fila.detail.sin_internet_id, e.fila.detail.limpio]));
    igual("sube los dos, a training_progress como «temas», con la hora en que se resolvieron",
      subidos.map((s) => s.slice(0, 3).concat([s[3] === cola[subidos.indexOf(s)].hecho_at, s[4] === cola[subidos.indexOf(s)].sin_internet_id, s[5]])),
      [["training_progress", "temas", "u-ana", true, true, true], ["training_progress", "temas", "u-ana", true, true, false]]);
    igual("y la cola queda vacía (el que ya estaba también sale)", (await leerLS(page, "sin_internet_resultados_v1")).length, 0);
    igual("el aviso cuenta lo que entró", await page.evaluate(() => (window.__avisos || []).length >= 0 && document.getElementById("pendientes").classList.contains("hidden")), true);
    if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
    await ctx.close();

    console.log("\n=== Con el service worker de verdad, sin red ===");
    const ctx2 = await browser.newContext({ serviceWorkers: "allow" });
    const b = await abrir(ctx2);
    await b.page.evaluate(async () => { if (navigator.serviceWorker) await navigator.serviceWorker.ready; });
    await b.page.selectOption("#cuantos", "10");
    await b.page.click("#guardar-btn");
    await b.page.waitForFunction(() => /^Lista:/.test(document.getElementById("preparar-estado").textContent), null, { timeout: 30000 });
    const id0 = (await leerLS(b.page, "sin_internet_tanda_v1")).ejercicios[0].id;
    await ctx2.setOffline(true);
    let abrio = false, texto = "";
    try {
      await b.page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
      await b.page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
      abrio = true;
      texto = await b.page.textContent("#tanda-avance");
    } catch (e) { texto = String(e.message).slice(0, 120); }
    igual("sin red, la página abre desde la caché", abrio, true);
    igual("con la tanda donde quedó", [/^Ejercicio 1 de 10/.test(texto), (await leerLS(b.page, "sin_internet_tanda_v1")).ejercicios[0].id === id0], [true, true]);
    igual("y dice que no hay señal", /^📴 Sin señal/.test(await b.page.textContent("#red").catch(() => "")), true);
    await ctx2.close();
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: la tanda se guarda, se resuelve sin red y se sube una vez.");
  process.exit(fallos ? 1 : 0);
})();
