/* Comprueba entreno/aperturas.html en un navegador de verdad: que se pueda
   jugar una línea entera haciendo clic en el tablero, que la nota salga de lo
   que pasó y no de lo que el alumno diga, y que el avance quede guardado.

   El banco y la repetición espaciada se comprueban aparte, sin navegador, con
   herramientas/verificar-aperturas.js. Esto es lo otro: que la página los use
   bien. Lo que se rompe acá no da error — el alumno hace la jugada correcta y
   el tablero no la acepta, y no hay forma de que entienda por qué.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-aperturas-pagina.js                      */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { LINEAS } = require(path.join(__dirname, "..", "js", "aperturas-lineas.js"));

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

// chess.js local, para saber de qué casilla a cuál va cada jugada.
let CHESSJS = "";
for (const base of String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
                  .concat([path.join(__dirname, "..", "node_modules")])) {
  const f = path.join(base, "chess.js", "chess.js");
  if (!CHESSJS && fs.existsSync(f)) CHESSJS = fs.readFileSync(f, "utf8");
}
if (!CHESSJS) { console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3"); process.exit(2); }

const CLIENTE_FALSO = `
window.__guardado = {};
(function () {
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" }, access_token: "t" } } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, in() { return this; },
                   upsert() { return this; }, maybeSingle() { return this; },
                   then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
    rpc: () => ({ then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
  };
})();
`;

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function abrir(browser) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CLIENTE_FALSO }));
  await page.goto(BASE + "/entreno/aperturas.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, errores };
}

// Juega la línea entera en el tablero, jugada del alumno por jugada del alumno.
async function jugarLinea(page, linea) {
  const { Chess } = require("chess.js").Chess ? require("chess.js") : { Chess: require("chess.js") };
  const juego = new Chess();
  for (let i = 0; i < linea.jugadas.length; i++) {
    const mia = (linea.color === "w") === (i % 2 === 0);
    const m = juego.move(linea.jugadas[i], { sloppy: true });
    if (!m) throw new Error("jugada imposible en la prueba: " + linea.jugadas[i]);
    if (!mia) { await page.waitForTimeout(700); continue; }   // mueve la página
    await page.click('#board [data-square="' + m.from + '"]');
    await page.click('#board [data-square="' + m.to + '"]');
    if (m.promotion) {
      await page.waitForSelector("#promo:not(.hidden)", { timeout: 5000 });
      await page.click('.promo-btn[data-pieza="' + m.promotion + '"]');
    }
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
}

async function abrirPorNombre(page, nombre) {
  await page.click("#btn-todas");
  await page.waitForTimeout(150);
  const ok = await page.evaluate((n) => {
    const b = [...document.querySelectorAll(".ficha")].find((x) => x.textContent.indexOf(n) !== -1);
    if (!b) return false;
    b.click();
    return true;
  }, nombre);
  if (!ok) throw new Error("no encontré la línea «" + nombre + "» en la lista");
  await page.waitForSelector("#vista-tablero:not(.hidden)", { timeout: 5000 });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const { page, errores } = await abrir(browser);

    console.log("\n=== La lista ===");
    igual("al entrar, todas están pendientes",
      await page.evaluate(() => document.querySelectorAll(".ficha").length), LINEAS.length);
    igual("el resumen dice cuántas hay",
      (await page.evaluate(() => document.querySelector("#resumen").textContent)).indexOf(String(LINEAS.length)) !== -1, "true");
    await page.selectOption("#f-tipo", "celada");
    await page.waitForTimeout(150);
    igual("el filtro de celadas",
      await page.evaluate(() => document.querySelectorAll(".ficha").length),
      LINEAS.filter((L) => L.tipo === "celada").length);
    await page.selectOption("#f-tipo", "");

    // ---------- una línea entera, sin errores ----------
    console.log("\n=== Jugar una línea sin equivocarse (juegas con blancas) ===");
    const conBlancas = LINEAS.find((L) => L.color === "w" && L.jugadas.some((j) => j.indexOf("#") !== -1));
    await abrirPorNombre(page, conBlancas.nombre);
    await jugarLinea(page, conBlancas);
    igual("termina y muestra el cierre",
      await page.evaluate(() => !document.getElementById("final").classList.contains("hidden")), "true");
    igual("la nota es «bien» porque no hubo ayuda",
      (await page.evaluate(() => document.getElementById("final-nota").textContent)).indexOf("sin ayuda") !== -1, "true");
    igual("y dice cuándo vuelve",
      await page.evaluate(() => document.getElementById("final-cuando").textContent), "Vuelve a aparecer mañana.");
    igual("quedó guardada con intervalo 1",
      await page.evaluate((id) => JSON.parse(localStorage.getItem("aperturas_srs_v1"))[id].intervalo, conBlancas.id), 1);
    igual("y suma una vista",
      await page.evaluate(() => localStorage.getItem("aperturas_vistas_v1")), "1");

    // ---------- una jugada legal pero que no es la de la línea ----------
    console.log("\n=== Una jugada legal que no es la de la línea ===");
    const conNegras = LINEAS.find((L) => L.color === "b");
    await page.click("#volver-btn");
    await abrirPorNombre(page, conNegras.nombre);
    await page.waitForTimeout(800);   // el rival abre
    // Se mueve un caballo del borde, que es legal y nunca es la jugada de una línea.
    await page.click('#board [data-square="b8"]');
    await page.click('#board [data-square="a6"]');
    await page.waitForTimeout(200);
    igual("avisa que no es la jugada de la línea",
      (await page.evaluate(() => document.getElementById("round-status").textContent)).indexOf("no es la jugada") !== -1, "true");
    igual("y no la deja en el tablero: sigue tocándole al alumno",
      (await page.evaluate(() => document.getElementById("turn-banner").textContent)).indexOf("Te toca") !== -1, "true");

    // ---------- la pista cuenta ----------
    console.log("\n=== La pista baja la nota ===");
    await page.click("#reiniciar-btn");
    await page.waitForTimeout(800);
    await page.click("#pista-btn");
    await page.waitForTimeout(150);
    igual("la pista dice la jugada",
      (await page.evaluate(() => document.getElementById("round-status").textContent)).indexOf("La jugada es") !== -1, "true");
    await jugarLinea(page, conNegras);
    igual("con pista, la nota ya no es «bien»",
      (await page.evaluate(() => document.getElementById("final-nota").textContent)).indexOf("con alguna ayuda") !== -1, "true");

    // ---------- coronar eligiendo pieza ----------
    console.log("\n=== Coronar en algo que no es dama ===");
    const conCorona = LINEAS.find((L) => L.jugadas.some((j) => /=[NBR]/.test(j)));
    if (!conCorona) { console.log("  (el banco no tiene ninguna, se salta)"); }
    else {
      await page.click("#volver-btn");
      await abrirPorNombre(page, conCorona.nombre);
      await jugarLinea(page, conCorona);
      igual("la línea de la coronación termina",
        await page.evaluate(() => !document.getElementById("final").classList.contains("hidden")), "true");
    }

    // ---------- el repaso de hoy respeta lo programado ----------
    console.log("\n=== El repaso de hoy ===");
    await page.click("#volver-btn");
    await page.click("#btn-repaso");
    await page.waitForTimeout(200);
    const pendientesAhora = await page.evaluate(() => document.querySelectorAll(".ficha").length);
    igual("las ya estudiadas salen del repaso de hoy", pendientesAhora < LINEAS.length, "true");
    igual("y el resumen ya no las cuenta como pendientes",
      await page.evaluate(() => document.querySelector("#resumen div:nth-child(1) b").textContent), String(pendientesAhora));

    if (errores.length) { console.log("\n  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
