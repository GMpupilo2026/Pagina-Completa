/* Niebla de Guerra sin jaques: gana quien se come el rey. Ver «Niebla de
   Guerra: sin jaques, gana quien se come el rey» en
   docs/decisiones/juegos-y-torneos.md.

   Lo que se rompe acá no da ningún error: chess.js sigue diciendo que una
   pieza clavada no se mueve, o que el rey no puede ir a una casilla atacada,
   y la partida se ve perfecta — pero esas reglas delatan dónde está la pieza
   rival que la niebla tapa, y la partida no termina cuando se comen el rey.

   Las reglas (NieblaGuerra.reglas, sin navegador)
   - una pieza clavada se mueve, y el rey va a una casilla atacada;
   - se enroca pasando por una casilla atacada;
   - comerse el rey termina la partida y gana quien se lo come;
   - las jugadas se anotan sin «+» ni «#»;
   - la jugada escrita («e2e4», «Nf6», «O-O») entra igual;
   - la posición que queda (al paso, enroques, contadores) es la correcta;
   - con material insuficiente, tablas; sin rey, no hay jugadas que buscar.

   niebla.html (con el doble de verificar-juegos-accesible.js)
   - la regla está escrita arriba del tablero;
   - con el rey atacado se puede mover otra pieza, y no se avisa «jaque»;
   - comerse el rey guarda la partida terminada con su ganador, y lo dice.

   Uso:  npm install
         node herramientas/verificar-niebla-reglas.js        (con el sitio en el 8777) */
const { chromium } = require("playwright");
const { Chess } = require("chess.js");
const J = require("./verificar-juegos-accesible.js");

global.window = global.window || {};
global.Chess = Chess;
require("../js/niebla-engine.js");
const R = window.NieblaGuerra.reglas;

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { console.log("  ✓ " + nombre); return; }
  fallos++;
  console.log("  ✗ " + nombre + (detalle !== undefined ? "\n      salió: " + JSON.stringify(detalle) : ""));
}
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  ok(nombre + ": " + b, a === b, hallado);
}
const sans = (lista) => lista.map((m) => m.san).sort();

function pruebaLasReglas() {
  console.log("\n=== Las reglas, sin navegador ===");
  // Bb5 clava el caballo de d7 contra el rey de e8.
  let c = new Chess("rnbqk1nr/pppn1ppp/8/1B2p3/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 0 1");
  igual("chess.js no deja mover la pieza clavada", new Chess(c.fen()).moves({ square: "d7" }), []);
  igual("en la niebla, sí", sans(R.jugadas(c, { square: "d7" })), ["Nb6", "Nc5", "Ndf6", "Nf8"]);
  const hecha = R.jugar(c, { from: "d7", to: "f6" });
  ok("y se juega", hecha && c.get("f6") && c.get("f6").type === "n" && !c.get("d7"), c.fen());
  const comida = R.jugar(c, { from: "b5", to: "e8" });
  igual("comerse el rey se anota sin signos", comida && comida.san, "Bxe8");
  igual("y gana quien se lo come", R.desenlace(c), { fin: true, ganador: "w", texto: "Se comieron el rey negro" });
  igual("sin rey no hay a quién buscarle jugadas", R.reyComido(c), "b");

  // El rey se mete en una casilla atacada.
  c = new Chess("4k3/8/8/8/8/8/3r4/4K3 w - - 0 1");
  ok("el rey puede ir a d1, atacada por la torre", sans(R.jugadas(c)).includes("Kd1"), sans(R.jugadas(c)));
  R.jugar(c, { from: "e1", to: "f1" });
  const jaque = R.jugar(c, { from: "d2", to: "d1" });
  igual("dar jaque no se anota con «+»", jaque && jaque.san, "Rd1");
  igual("y la partida sigue", R.desenlace(c).fin, false);

  // Enroque pasando por f1, atacada por la torre de f8.
  c = new Chess("5r1k/8/8/8/8/8/8/4K2R w K - 0 1");
  ok("chess.js no deja enrocar pasando por una casilla atacada", !new Chess(c.fen()).moves().includes("O-O"));
  ok("en la niebla, sí", sans(R.jugadas(c)).includes("O-O"), sans(R.jugadas(c)));
  R.jugar(c, { from: "e1", to: "g1" });
  igual("rey y torre quedan enrocados, sin derechos", c.fen(), "5r1k/8/8/8/8/8/8/5RK1 b - - 1 1");

  // La posición que deja una jugada aplicada a mano.
  c = new Chess("4k3/8/8/8/8/8/4P3/4K2r w - - 0 1");   // el rey blanco está atacado: chess.js no deja mover el peón
  ok("chess.js no deja jugar e4 con el rey atacado", !new Chess(c.fen()).move("e4"));
  R.jugar(c, { from: "e2", to: "e4" });
  igual("en la niebla queda con su casilla al paso", c.fen(), "4k3/8/8/8/4P3/8/8/4K2r b - e3 0 1");

  // La jugada escrita.
  c = new Chess();
  ok("«e2e4» entra", !!R.moverTexto(c, "e2e4"));
  ok("«Nf6» entra", !!R.moverTexto(c, "Nf6"));
  ok("«cualquier cosa» no", !R.moverTexto(c, "Qh9"));

  igual("con material insuficiente, tablas", R.desenlace(new Chess("4k3/8/8/8/8/8/8/4K3 w - - 0 1")).ganador, null);
}

async function pruebaLaPagina(browser) {
  console.log("\n=== niebla.html ===");
  // Las blancas tienen el rey atacado por la torre de e7 y mueven otra pieza.
  const ATACADO = "4k3/4r3/8/8/8/8/3P4/4K3 w - - 0 1";
  let a = await J.abrir(browser, "/niebla.html?room=r1", { tablas: { game_rooms: [J.sala("r1", "niebla", ATACADO)], profiles: J.PERFILES } }, "u-ana", false);
  const regla = await a.page.evaluate(() => { const el = document.getElementById("regla-niebla"); return el && el.checkVisibility() ? el.textContent : null; });
  ok("la regla está escrita arriba del tablero", /gana quien se come el rey/.test(regla || ""), regla);
  ok("no se avisa el jaque", !/jaque/i.test(await a.page.textContent("#status-banner")), await a.page.textContent("#status-banner"));
  await a.page.click('#board [data-square="d2"]');
  await a.page.click('#board [data-square="d3"]');
  await a.page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "game_rooms" && e.cambio.moves), null, { timeout: 5000 });
  let cambio = await a.page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "game_rooms" && e.cambio.moves).pop().cambio);
  igual("con el rey atacado mueve otra pieza", [cambio.moves, cambio.fen], [["d3"], "4k3/4r3/8/8/8/3P4/8/4K3 b - - 0 1"]);
  ok("y la partida sigue", !("status" in cambio), cambio);
  ok("sin errores de la página", a.errores.length === 0, a.errores);
  await a.ctx.close();

  // La dama de e2 ve al rey de e8: se lo come.
  const REY_A_LA_VISTA = "4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1";
  a = await J.abrir(browser, "/niebla.html?room=r1", { tablas: { game_rooms: [J.sala("r1", "niebla", REY_A_LA_VISTA)], profiles: J.PERFILES } }, "u-ana", false);
  await a.page.click('#board [data-square="e2"]');
  await a.page.click('#board [data-square="e8"]');
  await a.page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "game_rooms" && e.cambio.moves), null, { timeout: 5000 });
  cambio = await a.page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "game_rooms" && e.cambio.moves).pop().cambio);
  igual("comerse el rey termina la partida, con su ganador", [cambio.moves, cambio.status, cambio.result], [["Qxe8"], "finished", "white"]);
  await a.page.waitForFunction(() => /se comió el rey/.test(document.getElementById("status-banner").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("y lo dice", await a.page.textContent("#status-banner"), "Partida terminada — Ana Rojas ganó con blancas: se comió el rey.");
  ok("sin errores de la página", a.errores.length === 0, a.errores);
  await a.ctx.close();
}

(async () => {
  pruebaLasReglas();
  const browser = await chromium.launch({ executablePath: J.CHROME });
  try {
    await pruebaLaPagina(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
