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
  pruebaBus();
}

// El modo bus, con lo que mandó un LiveChess 2.2.11 de verdad (su registro
// en «Lo que llega de LiveChess»): ahí quedó trabado la primera vez, porque el
// tablero no contestaba la versión (8b 3f 11 5b) y LiveChess volvía a empezar.
const ARRANQUE_REGISTRO = [0x40, 0x40, 0x47, 0x46, 0x4a, 0x8b, 0x3f, 0x11, 0x5b,
  0xdf, 0x0d, 0x12, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0, 0x03, 0x02, 0x30, 0,
  0xdf, 0x31, 0x12, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0x02, 0, 0x03, 0x02, 0x30, 0];
const pedido = (c, dir) => [c, dir[0], dir[1], T.suma([c, dir[0], dir[1]])];
// El mismo arranque, para un tablero con otra dirección (LiveChess le pregunta
// la versión a la que le contestó el tablero).
const arranque = (dir) => ARRANQUE_REGISTRO.slice(0, 5).concat(pedido(0x8b, dir), ARRANQUE_REGISTRO.slice(9));

// Lee una respuesta de bus y comprueba su suma: [código, dirección, datos].
function leerBus(m) {
  const largo = (m[1] << 7) + m[2];
  if (largo !== m.length || T.suma(m.slice(0, -1)) !== m[m.length - 1]) return null;
  return [m[0], [m[3], m[4]], m.slice(5, -1)];
}

function pruebaBus() {
  console.log("\n=== El modo bus (lo que usa LiveChess por un puerto COM) ===");
  igual("la suma de comprobación: 8b 3f 11 → 5b, como la mandó LiveChess", T.suma([0x8b, 0x3f, 0x11]), 0x5b);
  // La serie 8081 es la dirección 3f 11, la del registro: su arranque, byte a byte.
  const t = T.crear({ serie: "8081" });
  const r = t.recibir(ARRANQUE_REGISTRO);
  igual("al arranque de LiveChess contesta la marca, la dirección (3f 11) y la versión", r.map((m) => m[0]), [0x92, 0x90, 0x89]);
  igual("la versión en modo bus: 89, largo 8, la dirección, 1.2 y la suma", r[2], [0x89, 0, 8, 0x3f, 0x11, 1, 2, 0x64]);
  igual("lo que va para otro aparato del bus (0xdf…) no se contesta", r.length, 3);
  const dir = [0x3f, 0x11];
  igual("un ping con su dirección: 87, largo 6", t.recibir(pedido(0x87, dir)), [T.mensajeBus(0x07, dir, [])]);
  igual("un pedido para otra dirección no se contesta", t.recibir(pedido(0x87, [0x10, 0x06])), []);
  igual("ni uno con la suma mal", t.recibir([0x87, 0x3f, 0x11, 0x00]), []);
  const tab = leerBus(t.recibir(pedido(0x82, dir))[0]);
  igual("el tablero entero en modo bus: 83 con las 64 casillas de a8 a h1", [tab[0], tab[2]], [0x83, T.volcado(T.INICIAL).slice(3)]);

  // Las partidas modelo por bus: cada jugada queda en la memoria, LiveChess
  // pregunta (0x83) y arma la posición con lo que le llega.
  let partidas = 0, malas = [];
  for (const [id, m] of Object.entries(MODELOS)) {
    const ch = new Chess();
    const b = T.crear({ serie: "8081" });
    b.recibir(ARRANQUE_REGISTRO);
    const casillas = new Array(64).fill(0);
    const aplicar = () => {
      const resp = leerBus(b.recibir(pedido(0x83, dir))[0]);
      if (!resp || resp[0] !== 0x85) return false;
      const datos = resp[2];
      for (let i = 0; i < datos.length; i++) {
        const x = datos[i];
        if (x >= 0x40 && x <= 0x4c) { casillas[datos[i + 1]] = x - 0x40; i += 1; }
        else if (![0x6a, 0x6f, 0x7f].includes(x)) return false;
      }
      return true;
    };
    if (!aplicar() || casillas.join() !== T.volcado(T.INICIAL).slice(3).join()) { malas.push(id + " (al empezar)"); continue; }
    for (const [k, san] of m.jugadas.entries()) {
      const mv = ch.move(san);
      if (!mv) break;
      if (b.jugar(mv, ch.fen()).length) { malas.push(id + " " + san + " (mandó sin que le pregunten)"); break; }
      if (k % 3 !== 2 && k !== m.jugadas.length - 1) continue;   // LiveChess no pregunta en cada jugada
      if (!aplicar() || casillas.join() !== T.volcado(ch.fen()).slice(3).join()) { malas.push(id + " " + san); break; }
    }
    partidas += 1;
  }
  cierto("las " + partidas + " partidas modelo por bus: con lo que contesta a 0x83, la posición de LiveChess es la de chess.js",
    malas.length === 0 && partidas >= 60, malas.slice(0, 5).join(" | "));

  const rep = T.crear({ serie: "8081" });
  rep.recibir(ARRANQUE_REGISTRO);
  const ultima = rep.recibir(pedido(0x83, dir));
  igual("0x84 repite la última respuesta tal cual", rep.recibir(pedido(0x84, dir)), ultima);
  igual("y otra 0x83 sin jugadas nuevas no trae cambios", leerBus(rep.recibir(pedido(0x83, dir))[0])[2], []);
  igual("0x40 lo saca del modo bus", (rep.recibir([0x40]), rep.bus), false);
  const seriesBien = [];
  for (let n = 10001; n <= 10099; n++) {
    const dir = T.crear({ serie: String(n) }).recibir([0x46])[0].slice(3, 5);
    if ((dir[0] << 7) + dir[1] === n) seriesBien.push(n);
  }
  igual("del 10001 al 10099, la dirección de bus es el mismo número de serie (lo que muestra LiveChess)", seriesBien.length, 99);
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
    setSignals: (s) => { window.__senales = s; return Promise.resolve(); },
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
  igual("LiveChess pide el número de serie y el tablero contesta 10001", await salida(), [0x91, 0, 8, 49, 48, 48, 48, 49]);
  igual("al abrir el puerto enciende DTR y RTS, como un tablero de verdad", await p.evaluate(() => window.__senales), { dataTerminalReady: true, requestToSend: true });
  const registro = await p.textContent("#virtuales details pre");
  cierto("«Lo que llega de LiveChess» anota el pedido en hexadecimal", /LiveChess →  45$/m.test(registro), registro);
  cierto("y la respuesta del tablero", /Tablero →  91 00 08 31 30 30 30 31$/m.test(registro), registro);
  cierto("y cuenta los bytes recibidos", /\(1 bytes recibidos\)/.test(await p.textContent("#virtuales details summary")));
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

  // Por bus, como LiveChess por un puerto COM: la jugada no se manda sola, se
  // la lleva la respuesta a 0x83.
  await limpiar();
  await p.evaluate((b) => window.__liveChess(b), [arranque([0x4e, 0x11]), pedido(0x83, [0x4e, 0x11])].flat());
  await p.waitForFunction(() => /LiveChess lo está siguiendo/.test(document.querySelector("#virtuales [role=status]").textContent));
  cierto("la página contesta la versión en bus con la dirección 4e 11, la del 10001", /Tablero →  89 00 08 4e 11 01 02/.test(await p.textContent("#virtuales details pre")));
  cierto("por bus, con el arranque de LiveChess y su primera pregunta, la tarjeta dice que lo sigue", true);
  await limpiar();
  await p.click("#virtuales li button:has-text('Una jugada')");
  await p.waitForFunction(() => /jugada 1 de/.test(document.querySelector("#virtuales [role=status]").textContent));
  igual("«Una jugada» por bus no manda nada sola", await salida(), []);
  await p.evaluate((b) => window.__liveChess(b), pedido(0x83, [0x4e, 0x11]));
  await p.waitForFunction(() => window.__salida.length > 0);
  const resp = leerBus(await salida());
  igual("y la trae la respuesta a 0x83: levantar y apoyar", resp && resp[2], [].concat(...T.cambiosDeJugada(mv).map((m) => [0x40 + m[4], m[3]])));

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
