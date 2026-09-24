/* Comprueba que arrastrar piezas con el dedo funcione, y que arreglarlo no se
   haya llevado por delante el desplazamiento de la página.

   POR QUÉ EXISTE. Un navegador de celular, ante un dedo que se desliza, asume
   que quiere desplazar la página: se queda con el gesto y el arrastre muere a
   medio camino. Eso pasaba en los 16 tableros del sitio y NO daba ningún
   error — el alumno arrastraba una pieza, la página se movía sola y la jugada
   no se hacía. Se arregló con `touch-action` en js/board-drag.js.

   Las dos mitades hay que comprobarlas juntas, porque el arreglo fácil (marcar
   el tablero entero) rompe la otra: deja un cuadrado de media pantalla por el
   que no se puede desplazar la página. Por eso se marcan solo las casillas
   levantables, y por eso acá se prueba también que por las demás se desplace.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-arrastre-tactil.js                        */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || "http://127.0.0.1:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = String(hallado), b = String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* Un gesto de dedo de verdad: empieza, se desliza y levanta. */
async function dedo(ctx, p, desde, hasta) {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: desde.x, y: desde.y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
      { x: desde.x + (hasta.x - desde.x) * i / 8, y: desde.y + (hasta.y - desde.y) * i / 8 }] });
    await p.waitForTimeout(25);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await p.waitForTimeout(600);
}

const centro = (p, sel, casilla) => p.$eval(sel + ' [data-square="' + casilla + '"]',
  (n) => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });

/* Las páginas de entreno cargan Supabase de un CDN que este entorno no alcanza,
   y sin el cliente se caen antes de dibujar el tablero. Se les da uno de
   mentira, sin sesión: lo que se comprueba acá es el tablero, no la base. */
const SUPABASE_FALSO = `
window.supabase = { createClient: function () {
  const vacio = { data: null, error: null };
  const b = { select(){return b;}, eq(){return b;}, in(){return b;}, order(){return b;}, limit(){return b;},
              maybeSingle(){return b;}, single(){return b;}, insert(){return b;}, update(){return b;},
              upsert(){return b;}, delete(){return b;},
              then(res, rej){ return Promise.resolve(vacio).then(res, rej); } };
  return {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            getUser: () => Promise.resolve({ data: { user: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) },
    from: () => b, rpc: () => b,
    channel: () => ({ on(){return this;}, subscribe(){return this;}, track(){return Promise.resolve();}, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
} };
`;

async function conDobles(p) {
  await p.route("**/cdn.jsdelivr.net/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: SUPABASE_FALSO }));
  await p.route("**/fonts.googleapis.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await p.route("**/fonts.gstatic.com/**", (r) => r.abort());
}

async function probarTablero(navegador, { nombre, ruta, sel, pieza, destino, ajena, vacia, preparar }) {
  console.log("\n=== " + nombre + " ===");
  const ctx = await navegador.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await conDobles(p);
  await p.goto(BASE + ruta, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  if (preparar) await preparar(p);
  await p.waitForSelector(sel + ' [data-square="' + pieza + '"]', { timeout: 15000 });
  // Se deja el tablero a la vista y con página de sobra para poder desplazarse.
  // El sitio tiene `scroll-behavior: smooth`, así que hay que apagarlo antes de
  // medir: si no, se lee un scroll que todavía se está moviendo solo y la
  // prueba culpa al arrastre de algo que no hizo.
  await p.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
  await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), sel);
  await p.waitForTimeout(600);

  // 1. Arrastrar una pieza propia: mueve la pieza y NO mueve la página.
  const y0 = await p.evaluate(() => window.scrollY);
  await dedo(ctx, p, await centro(p, sel, pieza), await centro(p, sel, destino));
  const r1 = await p.evaluate((d) => ({
    scroll: window.scrollY,
    llego: document.querySelector('[data-square="' + d + '"]').textContent.trim() !== "",
  }), destino);
  igual("arrastrar con el dedo hace la jugada", r1.llego, "true");
  igual("y no desplaza la página", r1.scroll === y0, "true");

  // 2. Deslizar sobre una casilla que NO se puede levantar: la página se mueve.
  for (const [queEs, casilla] of [["una casilla vacía", vacia], ["una pieza del rival", ajena]]) {
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await p.waitForTimeout(300);
    const antes = await p.evaluate(() => window.scrollY);
    const c = await centro(p, sel, casilla);
    await dedo(ctx, p, { x: c.x, y: c.y }, { x: c.x, y: c.y - 120 });
    const despues = await p.evaluate(() => window.scrollY);
    igual("deslizando sobre " + queEs + " la página sí se desplaza", despues !== antes, "true");
  }
  await ctx.close();
}

(async () => {
  const navegador = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

  // La portada y una página de entreno: el arreglo vive en js/board-drag.js, que
  // comparten los 16 tableros, así que con dos alcanza para ver que sirve.
  await probarTablero(navegador, {
    nombre: "El tablero de la portada", ruta: "/index.html", sel: "#chessboard",
    pieza: "e2", destino: "e4", ajena: "e7", vacia: "e5",
  });
  /* En los demás tableros no se repite el gesto entero —haría falta saber la
     posición de cada ejercicio—: se comprueba el mecanismo, que es lo que
     comparten. Tiene que haber casillas marcadas (las levantables) y casillas
     sin marcar (el resto). Si estuvieran TODAS marcadas, la página no se
     podría desplazar por encima del tablero; si no hubiera NINGUNA, el
     arrastre con el dedo estaría roto otra vez. */
  /* Un segundo tablero, de OTRA familia. La portada usa js/tablero-board.js y
     el bot usa los de variantes; el arreglo vive en la librería que comparten,
     así que mirar dos que no comparten nada más es lo que dice si sirve para
     los 16.

     Acá se comprueba el MECANISMO y no el gesto entero, por dos razones: en
     bot.html hay modalidades que hoy no aceptan jugadas (ver la nota de
     alMover) y las páginas de entreno piden sesión. Lo que se mira es que haya
     casillas marcadas —las que se pueden levantar— y casillas sin marcar. Si
     estuvieran TODAS marcadas, la página no se podría desplazar por encima del
     tablero; si no hubiera NINGUNA, el arrastre con el dedo estaría roto otra
     vez. */
  for (const [nombre, ruta, sel, preparar] of [
    ["El bot de Oscar", "/bot.html", "#board", async (p) => {
      await p.getByText("Ajedrez Estándar").first().click();
      await p.waitForTimeout(600);
      await p.click("#empezar-btn");
      await p.waitForTimeout(1500);
    }],
  ]) {
    console.log("\n=== " + nombre + " ===");
    const ctx = await navegador.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await conDobles(p);
    await p.goto(BASE + ruta, { waitUntil: "load" });
    await p.waitForTimeout(2000);
    if (preparar) await preparar(p);
    const cuenta = await p.evaluate((s) => {
      const celdas = [...document.querySelectorAll(s + " [data-square]")];
      return { total: celdas.length, marcadas: celdas.filter((c) => getComputedStyle(c).touchAction === "none").length };
    }, sel);
    igual("el tablero está a la vista", cuenta.total, 64);
    igual("hay casillas que se pueden levantar", cuenta.marcadas > 0, "true");
    igual("y no está marcado el tablero entero", cuenta.marcadas < cuenta.total, "true");
    console.log("      (" + cuenta.marcadas + " de " + cuenta.total + " casillas marcadas)");
    await ctx.close();
  }

  await navegador.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
