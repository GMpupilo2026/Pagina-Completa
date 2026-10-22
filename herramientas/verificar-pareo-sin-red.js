/* Pareo Integral el día del torneo: que funcione sin internet y que aguante
 * un evento grande (js/pareo/pagina.js, js/pareo/ver.js).
 *
 * Lo que se prueba, porque se rompe sin dar ningún error:
 *   - con el service worker del sitio (este verificador lo deja correr, a
 *     diferencia de los demás): la página se guarda sola, se recarga SIN RED
 *     y empareja con el motor guardado;
 *   - lo que se manda por un canal en vivo: chico, tal cual; grande (más de
 *     lo que deja Supabase en un mensaje), comprimido, y el celular lo lee;
 *   - con muchos jugadores, emparejar dice cuánto puede tardar.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-sin-red.js
 */
const fs = require("fs");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const P = require("./lib/pareo-pruebas");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));

async function pruebaSinRed(browser) {
  console.log("\n=== Sin internet ===");
  // Con el service worker: sin serviceWorkers: "block".
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.goto(BASE + "/pareo.html", { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => /Listo para usar sin internet|No se pudo/.test(document.getElementById("pi-sin-red").textContent), null, { timeout: 60000 });
  ok(/Listo para usar sin internet/.test(await page.textContent("#pi-sin-red")), "en la primera visita se guarda sola y lo dice", await page.textContent("#pi-sin-red"));
  const guardados = await page.evaluate(async () => (await (await caches.open("ajedrez-integral-sin-red")).keys()).map((r) => new URL(r.url).pathname));
  ok(["/pareo.html", "/js/pareo/motor-worker.js", "/js/vendor/bbppairings/bbppairings.wasm", "/js/pareo/pagina.js", "/css/tailwind.css"].every((u) => guardados.includes(u)),
    "con la página, sus scripts, sus hojas y el motor", JSON.stringify(guardados));
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "load" });
  ok(/Pareo Integral/.test(await page.title()), "sin red, la página vuelve a abrir");
  await page.waitForFunction(() => /Sin conexión: el torneo sigue funcionando/.test(document.getElementById("pi-sin-red").textContent));
  ok(true, "y dice que está sin conexión y qué espera a la conexión");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", ["PRUEBA A;X;1500", "PRUEBA B;Y;1600", "PRUEBA C;Z;1700", "PRUEBA D;W;1800"].join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click('[data-ficha="rondas"]');
  await page.click("#pi-emparejar");
  const empareja = await page.waitForSelector("#pi-mesa-0", { timeout: 30000 }).then(() => true).catch(() => false);
  ok(empareja, "y empareja sin red, con el motor guardado", await page.textContent("#pi-ronda").catch(() => ""));
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaEventoGrande(browser) {
  console.log("\n=== Lo que se manda en vivo, con un evento grande ===");
  const { ctx, page, errores } = await P.abrirPagina(browser, BASE);
  const r = await page.evaluate(async () => {
    const chico = { nombre: "E", torneos: [{ nombre: "T", clasificacion: [] }] };
    // Un evento como de 800 jugadores: unos 360 KB de JSON.
    const grande = { nombre: "E", torneos: Array.from({ length: 16 }, (_, k) => ({ nombre: "Torneo " + k,
      clasificacion: Array.from({ length: 50 }, (_, i) => ({ p: i + 1, n: "APELLIDO APELLIDO NOMBRE " + k + "-" + i, pts: 3, i: "LICEO DE SAN JOSE " + (i % 9), d: [{ c: "BH", v: 12.5 }] })),
      anteriores: Array.from({ length: 6 }, (_, r) => ({ n: r + 1, mesas: Array.from({ length: 25 }, (_, m) => ({ m: m + 1, b: "APELLIDO APELLIDO NOMBRE " + k + "-" + m, n: "APELLIDO APELLIDO NOMBRE " + k + "-" + (m + 25), r: "1-0" })) })) })) };
    const a = await PareoVer.paraMandar(chico);
    const b = await PareoVer.paraMandar(grande);
    const vuelta = await PareoVer.alLlegar(b);
    return { chicoIgual: a === chico, tam: JSON.stringify(grande).length, comprimido: typeof b.z === "string" ? b.z.length : null,
      vuelve: JSON.stringify(vuelta) === JSON.stringify(grande), limite: PareoVer.LIMITE_VIVO };
  });
  ok(r.chicoIgual, "lo chico va tal cual (lo lee también un celular viejo)");
  ok(r.tam > 256 * 1024 && r.comprimido && r.comprimido < r.limite / 4, "lo grande (más de los 256 KB de un mensaje de Supabase) va comprimido", JSON.stringify(r));
  ok(r.vuelve, "y el celular lo vuelve a armar igual");

  console.log("\n=== Emparejar muchos dice cuánto puede tardar ===");
  await page.click('[data-ficha="jugadores"]');
  await page.click("#pi-pegar-caja summary");
  await page.fill("#pi-pegar", Array.from({ length: 260 }, (_, i) => "PRUEBA " + i + ";LICEO " + (i % 30) + ";" + (1000 + ((i * 37) % 1200))).join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.click('[data-ficha="rondas"]');
  for (const c of await page.$$("#pi-revisar input[type=checkbox]")) await c.check();
  // El aviso sale apenas se toca el botón (antes de esperar al motor).
  const aviso = await page.evaluate(() => { document.getElementById("pi-emparejar").click(); return document.querySelector("#pi-ronda [role=status]").textContent; });
  ok(/Emparejando 260 jugadores con el Sistema Holandés: con tantos puede tardar/.test(aviso), "con 260 jugadores, dice que puede tardar", aviso);
  await page.waitForSelector("#pi-mesa-0", { timeout: 120000 });
  ok(!(await page.$("#pi-emparejar-lleva")), "y al terminar, la cuenta de segundos se va");
  ok(!errores.length, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await pruebaSinRed(browser); await pruebaEventoGrande(browser); }
  catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
