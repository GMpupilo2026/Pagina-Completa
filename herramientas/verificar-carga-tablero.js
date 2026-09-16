/* Comprueba que el tablero de la portada siga jugando igual después de haberle
   quitado los 7,6 MB que bajaba al cargar.

   POR QUÉ EXISTE ESTO. Lo que se rompe acá no da error en pantalla: si el libro
   de aperturas no llega a tiempo, el bot no falla — juega con el motor y
   responde otra cosa. Nadie se entera de que Oscar dejó de jugar como Oscar. Y
   al revés: si algo vuelve a pedir el libro al cargar la página, tampoco falla
   nada; simplemente la portada vuelve a pesar 8 MB sin que se note hasta que
   alguien la mide.

   Así que se comprueban las dos mitades:
     1. al CARGAR no se pide ninguno de los tres pesos pesados;
     2. al JUGAR sí se piden, y el bot contesta.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-carga-tablero.js                          */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || "http://127.0.0.1:8777";

/* Los tres que antes se bajaban al cargar y ahora tienen que esperar. */
const PESADOS = {
  libro: /\/data\/oscar-book\.json/,
  procedencia: /\/data\/oscar-book-provenance\.json/,
  motor: /stockfish-nnue-16-single\.(js|wasm)/,
};

/* Cuántas posiciones tiene el libro. Se lee del archivo, no se escribe a mano:
   el día que se regenere con más partidas, esta comprobación sigue valiendo. */
const POSICIONES_DEL_LIBRO = Object.keys(
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "oscar-book.json"), "utf8"))
).length;

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* chess.js viene de un CDN que este entorno no alcanza. Se le sirve la copia
   local: lo que se mide es el sitio, no la red de la caja donde corre. */
function copiaLocalDeChessJs() {
  const candidatos = [
    process.env.CHESSJS_PATH,
    path.join(process.cwd(), "node_modules/chess.js/chess.js"),
  ].filter(Boolean);
  for (const c of candidatos) if (fs.existsSync(c)) return fs.readFileSync(c, "utf8");
  return null;
}

async function abrir(contexto, ruta, chessjs) {
  const p = await contexto.newPage();
  const pedidos = [];
  p.on("request", (r) => pedidos.push(r.url()));
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  if (chessjs) {
    await p.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: chessjs }));
  }
  await p.goto(BASE + ruta, { waitUntil: "load" });
  return { p, pedidos, errores, pidio: (re) => pedidos.some((u) => re.test(u)) };
}

/* Juega la primera jugada de las blancas a punta de clics, como una persona. */
async function jugar(p, desde, hasta) {
  await p.click('[data-square="' + desde + '"]');
  await p.click('[data-square="' + hasta + '"]');
}

(async () => {
  const chessjs = copiaLocalDeChessJs();
  if (!chessjs) {
    console.log("Falta chess.js. Instalalo con: npm install chess.js@0.10.3");
    process.exit(1);
  }
  const navegador = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const contexto = await navegador.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });

  // ------------------------------------------------------- la portada, al cargar
  console.log("=== La portada, recién cargada ===");
  const portada = await abrir(contexto, "/index.html", chessjs);
  await portada.p.waitForTimeout(4000);   // tiempo de sobra para lo que arranque solo

  igual("el tablero se dibujó entero",
    await portada.p.$$eval('#chessboard [data-square]', (n) => n.length), 64);
  igual("con sus 32 piezas puestas",
    await portada.p.$$eval('#chessboard [data-square]', (n) =>
      n.filter((x) => x.textContent.trim() !== "").length), 32);

  igual("NO se bajó el libro de aperturas (2,9 MB)", portada.pidio(PESADOS.libro), "false");
  igual("NO se bajó la procedencia (4,2 MB)", portada.pidio(PESADOS.procedencia), "false");
  igual("NO se bajó el motor (587 KB)", portada.pidio(PESADOS.motor), "false");

  const bytes = await portada.p.evaluate(() =>
    performance.getEntriesByType("resource").reduce((n, r) => n + (r.decodedBodySize || 0), 0));
  igual("lo que baja la portada cabe en 1 MB", bytes < 1048576, "true");
  console.log("      (son " + (bytes / 1024).toFixed(0) + " KB de recursos)");

  // ------------------------------------------------------------ y ahora se juega
  console.log("\n=== Se juega una jugada ===");
  await jugar(portada.p, "e2", "e4");
  igual("la jugada de la persona quedó en el tablero",
    await portada.p.$eval('[data-square="e4"]', (n) => n.textContent.trim() !== ""), "true");

  // El bot contesta del libro: no necesita el motor para las primeras jugadas.
  await portada.p.waitForFunction(
    () => document.querySelectorAll('#chessboard [data-square]')
      .length && [...document.querySelectorAll('#chessboard [data-square]')]
      .filter((x) => x.textContent.trim() !== "").length === 32
      && document.querySelector('[data-square="e7"]').textContent.trim() === "",
    null, { timeout: 20000 }).catch(() => {});

  igual("al jugar SÍ se bajó el libro", portada.pidio(PESADOS.libro), "true");
  const turno = await portada.p.$eval("#turn-indicator", (n) => n.textContent);
  igual("y el bot contestó (vuelve a ser turno de blancas)", /blanca/i.test(turno), "true");

  /* Que el libro LLEGUE ENTERO, no solo que se pida. Un archivo truncado, o un
     404 que devuelve la página de error, no rompen nada: el bot simplemente
     deja de jugar como Oscar y juega como el motor. Nadie lo notaría. */
  igual("el libro llegó completo",
    await portada.p.evaluate(() => (window.OSCAR_BOOK ? Object.keys(window.OSCAR_BOOK).length : 0)),
    POSICIONES_DEL_LIBRO);
  igual("y la calibración del Elo de Oscar sigue llegando aparte, al cargar",
    await portada.p.evaluate(() =>
      !!(window.OSCAR_ELO_CALIB && window.OSCAR_ELO_CALIB.bullet.recent_median_elo)), "true");

  if (portada.errores.length) {
    console.log("  ✗ errores en la página: " + portada.errores.join(" | ")); fallos += 1;
  }
  await portada.p.close();

  // ------------------------------------------- la página del tablero y su panel
  console.log("\n=== La página del tablero (con su panel de partidas) ===");
  const tablero = await abrir(contexto, "/tablero.html", chessjs);
  await tablero.p.waitForTimeout(3000);
  igual("tampoco baja la procedencia al cargar", tablero.pidio(PESADOS.procedencia), "false");
  igual("el panel de partidas está en esta página",
    await tablero.p.$eval("#origins-panel", (n) => !!n), "true");

  await jugar(tablero.p, "e2", "e4");
  await tablero.p.waitForFunction(
    () => document.querySelector('[data-square="e7"]') &&
      [...document.querySelectorAll('#chessboard [data-square]')]
        .filter((x) => x.textContent.trim() !== "").length === 32 &&
      document.querySelector('[data-square="e7"]').textContent.trim() === "",
    null, { timeout: 20000 }).catch(() => {});
  await tablero.p.waitForTimeout(2000);

  igual("cuando el bot juega del libro, SÍ se pide la procedencia",
    tablero.pidio(PESADOS.procedencia), "true");

  if (tablero.errores.length) {
    console.log("  ✗ errores en la página: " + tablero.errores.join(" | ")); fallos += 1;
  }
  await tablero.p.close();

  await navegador.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
