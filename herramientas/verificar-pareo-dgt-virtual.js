/* Los tableros DGT virtuales de «Pareo para DGT» (pareo-dgt.html, sección
 * «Probar sin tableros físicos»): que LiveChess reciba lo mismo que de un
 * tablero de verdad.
 *
 * Lo que se rompe callado acá: una casilla contada al revés (a1 por a8) y
 * LiveChess ve otra partida; una captura que no levanta la pieza comida, un
 * enroque sin la torre o una captura al paso sin el peón, y la posición de
 * LiveChess se desarma a mitad de la ronda; el largo de un mensaje mal
 * puesto y LiveChess deja de entender todo lo que sigue; un mensaje para el
 * reloj (0x2b) leído como pedidos sueltos.
 *
 * Sin navegador: js/pareo/dgt-tablero.js con las 64 partidas modelo de
 * js/estilo-modelos.js (partidas de maestros, ya comprobadas): después de cada
 * jugada, la posición armada SOLO con los mensajes del tablero tiene que ser la
 * de chess.js. Con navegador: la página con un puerto COM de mentira (un
 * navigator.serial que hace de LiveChess).
 *
 * Ver «Probar sin tableros físicos» en docs/decisiones/juegos-y-torneos.md.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-pareo-dgt-virtual.js [--sin-navegador]
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const T = require("../js/pareo/dgt-tablero.js");
const { Chess } = require("../js/vendor/chess.js");
const MODELOS = require("../js/estilo-modelos.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre);
}
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

// Lee mensajes del tablero de una tira de bytes, como LiveChess (o Picochess):
// cabecera de 3 bytes con el largo total en dos de 7 bits.
function partir(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    const largo = (bytes[i + 1] << 7) + bytes[i + 2];
    out.push(bytes.slice(i, i + largo));
    i += largo;
  }
  return out;
}

function pruebaProtocolo() {
  console.log("=== El protocolo (js/pareo/dgt-tablero.js) ===");
  igual("las casillas en el orden de DGT: a8 es 0, h8 7, a1 56, h1 63, e2 52", ["a8", "h8", "a1", "h1", "e2"].map(T.campo), [0, 7, 56, 63, 52]);
  const ini = T.volcado(T.INICIAL);
  igual("el tablero entero: 0x86, largo 67 en dos bytes de 7 bits, de a8 a h1", [ini[0], ini[1], ini[2], ini.length, ini.slice(3, 11), ini.slice(59, 67)],
    [0x86, 0, 67, 67, [8, 9, 10, 12, 11, 10, 9, 8], [2, 3, 4, 6, 5, 4, 3, 2]]);

  const t = T.crear({ serie: "90007" });
  igual("pide el número de serie: 0x91 con 5 dígitos", t.recibir([0x45]), [[0x91, 0, 8, 57, 48, 48, 48, 55]]);
  igual("el número largo: 0xa2 con 10", t.recibir([0x55])[0].slice(0, 3), [0xa2, 0, 13]);
  igual("la versión: 0x93 con 2 bytes", t.recibir([0x4d]), [[0x93, 0, 5, 1, 0]]);
  igual("un mensaje para el reloj (0x2b, cuántos siguen y esos) no se lee como pedidos",
    t.recibir([0x2b, 0x04, 0x03, 0x42, 0x45, 0x00, 0x42]).map((m) => m[0]), [0x86]);
  const quieto = T.crear();
  const ch0 = new Chess();
  igual("sin que LiveChess pida las jugadas, el tablero no manda nada (como uno de verdad)", quieto.jugar(ch0.move("e4"), ch0.fen()), []);
  igual("pero el tablero entero ya tiene la jugada", quieto.recibir([0x42])[0][3 + T.campo("e4")], 1);

  let partidas = 0, jugadas = 0, malas = [];
  const tipos = new Set();
  for (const [id, m] of Object.entries(MODELOS)) {
    const ch = new Chess();
    const tab = T.crear({ serie: "90001" });
    tab.recibir([0x40, 0x45, 0x4d, 0x42, 0x4b]);
    const casillas = T.volcado(ch.fen()).slice(3);
    for (const san of m.jugadas) {
      const mv = ch.move(san);
      if (!mv) { malas.push(id + " " + san + " (ilegal)"); break; }
      tipos.add(mv.flags);
      const bytes = [].concat(...tab.jugar(mv, ch.fen()));
      for (const msg of partir(bytes)) {
        if (msg[0] !== 0x8e || msg.length !== 5) { malas.push(id + " " + san + " (mensaje)"); break; }
        casillas[msg[3]] = msg[4];
      }
      if (casillas.join() !== T.volcado(ch.fen()).slice(3).join()) { malas.push(id + " " + san); break; }
      jugadas += 1;
    }
    partidas += 1;
  }
  cierto("las " + partidas + " partidas modelo, jugada a jugada (" + jugadas + "): la posición que arma LiveChess con los cambios es la de chess.js",
    malas.length === 0 && partidas >= 60, malas.slice(0, 5).join(" | "));
  cierto("y pasaron capturas, enroques corto y largo, la captura al paso y una coronación", ["c", "k", "q", "e"].every((f) => [...tipos].some((x) => x.includes(f))) && [...tipos].some((x) => x.includes("p")), [...tipos].join(" "));

  const ch = new Chess();
  ch.move("e4");
  igual("una jugada: primero se levanta la pieza, después se apoya", T.cambiosDeJugada(ch.history({ verbose: true })[0]),
    [[0x8e, 0, 5, T.campo("e2"), 0], [0x8e, 0, 5, T.campo("e4"), 1]]);
  const vuelta = T.crear({ fen: ch.fen() });
  vuelta.recibir([0x4b]);
  igual("«Volver al principio»: se levanta el peón de e4 y se apoya en e2", vuelta.ponerFen(T.INICIAL),
    [[0x8e, 0, 5, T.campo("e4"), 0], [0x8e, 0, 5, T.campo("e2"), 1]]);
}

// ------------------------------------------------------------ la página

function clienteFalso() {
  return `window.SUPABASE_URL="https://falso.supabase.co";window.SUPABASE_ANON_KEY="x";
window.sb={auth:{getSession:()=>Promise.resolve({data:{session:{user:{id:"a"},access_token:"t"}}}),getUser:()=>Promise.resolve({data:{user:{id:"a"}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
from:()=>{const q={select(){return q},eq(){return q},maybeSingle(){return q},single(){return q},then(r){return Promise.resolve({data:null,error:null}).then(r)}};return q},
rpc:(n)=>({then(r){return Promise.resolve({data:n==="tengo_herramienta"?true:null,error:null}).then(r)}}),
channel:()=>({on(){return this},subscribe(){return this},track(){return Promise.resolve()},presenceState:()=>({})}),removeChannel(){}};`;
}

// Un puerto COM de mentira: lo que «escribe LiveChess» entra por la lectura
// del tablero, y lo que escribe el tablero queda en window.__salida.
function serialFalso() {
  window.__salida = [];
  window.__historia = [];   // los cambios de casilla, desde el principio
  let controlador;
  const puerto = {
    readable: new ReadableStream({ start(c) { controlador = c; } }),
    writable: new WritableStream({ write(chunk) { window.__salida.push(...chunk); if (chunk[0] === 0x8e) window.__historia.push(...chunk); } }),
    open: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
  window.__liveChess = (bytes) => controlador.enqueue(Uint8Array.from(bytes));
  Object.defineProperty(navigator, "serial", { value: { requestPort: () => Promise.resolve(puerto) }, configurable: true });
}

async function pruebaPagina(browser) {
  console.log("\n=== pareo-dgt.html: Probar sin tableros físicos ===");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  await p.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await p.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: clienteFalso() }));
  await p.route("https://falso.supabase.co/**", (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  await p.addInitScript(serialFalso);
  await p.goto(BASE + "/pareo-dgt.html", { waitUntil: "networkidle" });

  await p.fill("#virtual-segundos", "1");
  await p.click("#btn-virtual");
  await p.waitForSelector("#virtuales li");
  const salida = () => p.evaluate(() => window.__salida.slice());
  const limpiar = () => p.evaluate(() => { window.__salida.length = 0; });

  await p.evaluate(() => window.__liveChess([0x45]));
  await p.waitForFunction(() => window.__salida.length >= 8);
  igual("LiveChess pide el número de serie y el tablero contesta 90001", await salida(), [0x91, 0, 8, 57, 48, 48, 48, 49]);
  await limpiar();
  await p.evaluate(() => window.__liveChess([0x42, 0x4b]));
  await p.waitForFunction(() => window.__salida.length >= 67);
  igual("pide el tablero entero: la posición inicial", await salida(), T.volcado(T.INICIAL));
  await p.waitForFunction(() => /LiveChess lo está siguiendo/.test(document.querySelector("#virtuales [role=status]").textContent));
  cierto("y la tarjeta dice que LiveChess lo sigue", true);

  await limpiar();
  const primera = await p.evaluate(() => window.EstiloModelos[document.querySelector("#virtuales select").value].jugadas[0]);
  await p.click("#virtuales li button:has-text('Una jugada')");
  await p.waitForFunction(() => window.__salida.length >= 10);
  const ch = new Chess();
  const mv = ch.move(primera);
  igual("«Una jugada»: la primera de la partida elegida, levantando y apoyando", await salida(), [].concat(...T.cambiosDeJugada(mv)));
  cierto("la tarjeta lo dice", /jugada 1 de \d+/.test(await p.textContent("#virtuales [role=status]")));

  await p.click("#virtuales li button:has-text('Empezar')");
  igual("«Empezar» queda apretado y dice «Pausar»", [await p.getAttribute("#virtuales li button[aria-pressed]", "aria-pressed"), (await p.textContent("#virtuales li button[aria-pressed]")).trim()], ["true", "Pausar"]);
  await p.waitForFunction(() => /jugada 3 de/.test(document.querySelector("#virtuales [role=status]").textContent), null, { timeout: 8000 });
  cierto("y juega sola, una jugada por segundo", true);
  await p.click("#virtuales li button[aria-pressed]");

  // Desde acá, todo lo que mande se aplica sobre la posición en que quedó.
  const antes = await p.evaluate(() => window.__historia.slice());
  await limpiar();
  await p.click("#virtuales li button:has-text('Volver al principio')");
  await p.waitForFunction(() => /jugada 0 de/.test(document.querySelector("#virtuales [role=status]").textContent));
  const tablero = T.volcado(T.INICIAL).slice(3);
  for (const msg of partir(antes.concat(await salida()))) if (msg[0] === 0x8e) tablero[msg[3]] = msg[4];
  igual("«Volver al principio» deja, con lo que mandó, cada pieza en su casilla inicial", tablero, T.volcado(T.INICIAL).slice(3));

  await p.click("#virtuales li button:has-text('Desconectar')");
  igual("«Desconectar» lo quita de la lista", await p.$$eval("#virtuales li", (l) => l.length), 0);
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await ctx.close();

  // Sin Web Serial (Firefox, Safari, el celular): se dice, y el botón no se usa.
  const ctx2 = await browser.newContext({ serviceWorkers: "block" });
  const p2 = await ctx2.newPage();
  await p2.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: clienteFalso() }));
  await p2.route("https://falso.supabase.co/**", (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  await p2.addInitScript(() => Object.defineProperty(navigator, "serial", { value: undefined, configurable: true }));
  await p2.goto(BASE + "/pareo-dgt.html", { waitUntil: "networkidle" });
  igual("sin Web Serial el botón está apagado y se dice por qué",
    [await p2.isDisabled("#btn-virtual"), /Chrome o Edge/.test(await p2.textContent("#virtual-error"))], [true, true]);
  await ctx2.close();
}

(async () => {
  pruebaProtocolo();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaPagina(browser);
  } finally {
    await browser.close();
  }
  terminar();
})().catch((e) => { console.error(e); process.exit(1); });

function terminar() {
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron` : "\n✓ Todo en orden");
  process.exit(fallos ? 1 : 0);
}
