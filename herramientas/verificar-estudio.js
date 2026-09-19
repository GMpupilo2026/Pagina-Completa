/* Comprueba entreno/estudio.html — las tarjetas de aperturas y defensas, con
   sus variantes principales, para leer y memorizar — y el enlace ?linea=<id>
   que las lleva a practicar en entreno/aperturas.html.

   No es un ejercicio con solución (eso lo comprueba
   herramientas/verificar-aperturas-pagina.js, jugando la línea entera): esto
   es material de lectura, así que lo que hay que comprobar es otra cosa —que
   el tablero de la tarjeta muestre de verdad la posición que toca en cada
   jugada, y que el botón "Practicarla" lleve a la línea correcta y no a la
   lista. Un id mal armado en el enlace no daría ningún error: el botón se ve
   igual y lleva a otra parte, o a ninguna.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         npm install chess.js@0.10.3
         node herramientas/verificar-estudio.js                */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { LINEAS } = require(path.join(__dirname, "..", "js", "aperturas-lineas.js"));

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const ESTUDIO = LINEAS.filter((L) => L.tipo === "apertura");
const APERTURAS = ESTUDIO.filter((L) => L.color === "w");
const DEFENSAS = ESTUDIO.filter((L) => L.color === "b");
const GRUPOS_APERTURAS = new Set(APERTURAS.map((L) => L.apertura));
const GRUPOS_DEFENSAS = new Set(DEFENSAS.map((L) => L.apertura));
const PIEZAS_ES = { N: "C", B: "A", R: "T", Q: "D", K: "R" };
const aEspanol = (san) => String(san).replace(/[NBRQK]/g, (l) => PIEZAS_ES[l]);

let CHESSJS = "";
for (const base of String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
                  .concat([path.join(__dirname, "..", "node_modules")])) {
  const f = path.join(base, "chess.js", "chess.js");
  if (!CHESSJS && fs.existsSync(f)) CHESSJS = fs.readFileSync(f, "utf8");
}
if (!CHESSJS) { console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3"); process.exit(2); }
const { Chess } = require("chess.js").Chess ? require("chess.js") : { Chess: require("chess.js") };

const CLIENTE_FALSO = `
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

async function abrir(browser, ruta, esperar) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CLIENTE_FALSO }));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  await page.waitForSelector(esperar, { timeout: 20000 });
  return { page, errores };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("=== entreno/estudio.html — las pestañas ===");
    const { page, errores } = await abrir(browser, "/entreno/estudio.html", "#app:not(.hidden)");

    igual("hay dos pestañas: Aperturas y Defensas",
      await page.evaluate(() => [...document.querySelectorAll("#tabs .tab")].map((b) => b.textContent.trim().replace(/\s+/g, " "))),
      [`Aperturas ${APERTURAS.length}`, `Defensas ${DEFENSAS.length}`]);
    igual("arranca en Aperturas",
      await page.evaluate(() => document.querySelector("#tabs .tab").classList.contains("active")), "true");
    igual("por defecto se ven las de Aperturas, no las 25 juntas",
      await page.evaluate(() => document.querySelectorAll("#lesson-list .lesson-item").length),
      APERTURAS.length);
    igual("agrupadas en un <h2> por apertura o defensa",
      await page.evaluate(() => document.querySelectorAll("#lesson-list h2.study-group-title").length),
      GRUPOS_APERTURAS.size);
    igual("«Siciliana cerrada» juega con blancas, así que va en Aperturas y no en Defensas",
      await page.evaluate(() => [...document.querySelectorAll("#lesson-list .lesson-item .name")]
        .some((el) => el.textContent.trim() === "Siciliana cerrada")), "true");
    igual("nada queda bloqueado: es material de consulta, no una progresión",
      await page.evaluate(() => document.querySelectorAll("#lesson-list button:disabled").length), 0);

    await page.click("#tabs .tab:nth-child(2)");
    igual("al hacer clic en Defensas, esa queda activa",
      await page.evaluate(() => document.querySelectorAll("#tabs .tab")[1].classList.contains("active")), "true");
    igual("y se repinta con las 16 líneas de Defensas",
      await page.evaluate(() => document.querySelectorAll("#lesson-list .lesson-item").length),
      DEFENSAS.length);
    igual("agrupadas por su propia apertura o defensa",
      await page.evaluate(() => document.querySelectorAll("#lesson-list h2.study-group-title").length),
      GRUPOS_DEFENSAS.size);
    igual("«Siciliana cerrada» no aparece acá: la juegan las blancas",
      await page.evaluate(() => [...document.querySelectorAll("#lesson-list .lesson-item .name")]
        .some((el) => el.textContent.trim() === "Siciliana cerrada")), "false");

    await page.click("#tabs .tab:nth-child(1)");
    igual("volver a Aperturas la deja activa otra vez",
      await page.evaluate(() => document.querySelector("#tabs .tab").classList.contains("active")), "true");

    console.log("\n=== La tarjeta de una variante ===");
    const linea = ESTUDIO.find((L) => L.id === "espanola-cerrada");
    await page.evaluate((nombre) => {
      [...document.querySelectorAll("#lesson-list .lesson-item")]
        .find((b) => b.textContent.indexOf(nombre) !== -1).click();
    }, linea.nombre);
    await page.waitForSelector("#study-view", { state: "visible", timeout: 5000 });

    igual("el título es el de la línea", await page.evaluate(() => document.getElementById("study-title").textContent), linea.nombre);
    igual("el tablero se ve pero es decorativo (la posición ya está en el texto)",
      await page.evaluate(() => document.getElementById("study-board").getAttribute("aria-hidden")), "true");
    igual("arranca en la posición inicial: 64 casillas, ninguna con pieza negra movida",
      await page.evaluate(() => document.querySelectorAll("#study-board .sq").length), 64);
    igual("al empezar, no se puede ir más atrás", await page.evaluate(() => document.getElementById("study-prev-btn").disabled), "true");
    igual("pero sí adelante", await page.evaluate(() => document.getElementById("study-next-btn").disabled), "false");
    igual("el botón de practicarla apunta a la línea, no a la lista",
      await page.evaluate(() => new URL(document.getElementById("study-practicar-btn").href).search),
      "?linea=" + linea.id);

    // Avanza jugada por jugada y compara el tablero de verdad contra chess.js,
    // no contra lo que la propia página cree que hizo.
    const juego = new Chess();
    for (let i = 0; i < linea.jugadas.length; i++) {
      await page.click("#study-next-btn");
      juego.move(linea.jugadas[i], { sloppy: true });
      const jugadaResaltada = await page.evaluate(() => {
        const b = document.querySelector(".study-move.actual");
        return b ? b.textContent : null;
      });
      igual(`jugada ${i + 1} (${aEspanol(linea.jugadas[i])}) queda resaltada en la lista`,
        jugadaResaltada, aEspanol(linea.jugadas[i]));
    }
    // No solo que la jugada se resalte en la lista: que el TABLERO de verdad
    // dibuje la posición final, pieza por pieza — un bug de drawStudyBoard() no
    // se notaría mirando solo el texto resaltado de arriba.
    const GLYPH_A_LETRA = { "♙": "P", "♘": "N", "♗": "B", "♖": "R", "♕": "Q", "♔": "K",
                             "♟": "p", "♞": "n", "♝": "b", "♜": "r", "♛": "q", "♚": "k" };
    const piezasPagina = await page.evaluate((tabla) => {
      const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const out = {};
      const celdas = document.querySelectorAll("#study-board .sq");
      let i = 0;
      for (let rank = 8; rank >= 1; rank--) {
        for (const f of FILES) {
          const span = celdas[i].querySelector("span");
          if (span) out[f + rank] = tabla[span.textContent] || span.textContent;
          i++;
        }
      }
      return out;
    }, GLYPH_A_LETRA);
    const piezasEsperadas = {};
    juego.board().forEach((fila, r) => fila.forEach((p, c) => {
      if (p) piezasEsperadas["abcdefgh"[c] + (8 - r)] = p.color === "w" ? p.type.toUpperCase() : p.type;
    }));
    igual("el tablero dibuja de verdad la posición final, pieza por pieza", piezasPagina, piezasEsperadas);

    igual("al llegar al final, no se puede seguir adelante",
      await page.evaluate(() => document.getElementById("study-next-btn").disabled), "true");
    igual("y sí se puede volver atrás", await page.evaluate(() => document.getElementById("study-prev-btn").disabled), "false");

    await page.click("#study-start-btn");
    igual("«ir al inicio» vuelve a la posición de salida",
      await page.evaluate(() => document.getElementById("study-prev-btn").disabled), "true");

    await page.click("#study-back-to-list");
    igual("«volver» regresa a la lista de variantes",
      await page.evaluate(() => getComputedStyle(document.getElementById("list-view")).display), "block");

    errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
    await page.close();

    console.log("\n=== entreno/aperturas.html — abrir directo con ?linea=<id> ===");
    const { page: page2, errores: errores2 } = await abrir(
      browser, "/entreno/aperturas.html?linea=" + encodeURIComponent(linea.id), "#app:not(.hidden)");
    await page2.waitForSelector("#vista-tablero:not(.hidden)", { timeout: 5000 });
    igual("abre el tablero de esa línea de una, sin pasar por la lista",
      await page2.evaluate(() => document.getElementById("linea-nombre").textContent), linea.nombre);

    const { page: page3, errores: errores3 } = await abrir(
      browser, "/entreno/aperturas.html?linea=no-existe-esta-linea", "#app:not(.hidden)");
    igual("un id que no existe cae a la lista de siempre, no a un tablero vacío",
      await page3.evaluate(() => getComputedStyle(document.getElementById("vista-lista")).display), "block");

    errores2.concat(errores3).forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
    await page2.close(); await page3.close();
  } finally {
    await browser.close();
  }

  console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : "\nTodo bien: las tarjetas de estudio muestran lo que prometen.");
  process.exit(fallos ? 1 : 0);
})();
