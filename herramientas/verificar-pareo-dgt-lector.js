/* «Transmitir sin LiveChess» de «Pareo para DGT» (pareo-dgt.html, sección 5):
 * la página lee tableros DGT de verdad, sin LiveChess, y empuja las partidas
 * a Lichess.
 *
 * Lo que se rompe callado acá: un tablero de la cadena que no se encuentra
 * porque su respuesta al ping chocó con la de otro, y esa mesa no sale en la
 * transmisión; una respuesta con la suma mal pedida otra vez con 0x83 en vez
 * de 0x84, y esas jugadas se pierden; una jugada leída a medio hacer (la
 * dama que pasa por c2 camino a c4, el enroque que empieza por la torre) que
 * queda anotada; el reloj de las blancas anotado como el de las negras; un
 * tablero con las blancas del lado del conector, leído al revés.
 *
 * Sin navegador: js/pareo/dgt-lector.js contra una cadena de tableros
 * virtuales (js/pareo/dgt-tablero.js, los mismos que LiveChess acepta), con
 * las 64 partidas modelo de js/estilo-modelos.js: los pings que chocan, las
 * respuestas con la suma rota, las piezas en el orden desordenado que
 * describe DGT, consultas que cortan una jugada por la mitad, jugadas
 * corregidas y el reloj. Con navegador: la página con un puerto COM de
 * mentira (tres tableros virtuales en cadena) y una Lichess de mentira que
 * recibe lo que se empuja.
 *
 * Ver «Transmitir sin LiveChess» en docs/decisiones/juegos-y-torneos.md.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-pareo-dgt-lector.js [--sin-navegador]
 */
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const L = require("../js/pareo/dgt-lector.js");
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

// Al azar, pero siempre el mismo azar: si algo falla, falla igual la próxima vez.
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Una cadena de tableros virtuales en un mismo cable. Si varios contestan a la
// vez el ping general, llega uno solo (los demás chocaron), y con `rotas` una
// parte de las respuestas llega con un byte cambiado.
function cadenaVirtual(tabs, opciones) {
  const o = opciones || {};
  const r = azar(o.semilla || 1);
  const flujo = L.crearFlujo();
  const cola = [];
  const puerto = {
    escritos: [],
    async escribir(b) {
      puerto.escritos.push(b.slice());
      let resp = [];
      for (const t of tabs) resp.push(...t.recibir(b));
      if (b[0] === 0x87 && b[1] === 0 && b[2] === 0 && resp.length > 1) resp = [resp[Math.floor(r() * resp.length)]];
      for (const m of resp) {
        const copia = m.slice();
        if (o.rotas && r() < o.rotas && copia.length > 6) copia[5 + Math.floor(r() * (copia.length - 6))] ^= 0x01;
        cola.push(...flujo.empujar(copia));
      }
    },
    async esperar() { return cola.shift() || null; },
  };
  return puerto;
}
const rapida = { espera: 5, ventanaPing: 5, dormir: async () => {} };

function pruebaPiezas() {
  console.log("=== Los mensajes (js/pareo/dgt-lector.js) ===");
  const f = L.crearFlujo();
  const msg = T.mensajeBus(0x05, [0x4e, 0x11], [0x41, 0x34]);
  igual("un mensaje que llega en pedazos se junta entero", [f.empujar(msg.slice(0, 2)), f.empujar(msg.slice(2, 5)), f.empujar(msg.slice(5))], [[], [], [msg]]);
  igual("lo que no empieza como mensaje (un choque) se tira hasta encontrar uno", L.crearFlujo().empujar([0x12, 0x00, 0x33].concat(msg)), [msg]);
  igual("la respuesta de bus: código, dirección y datos, con la suma comprobada", L.leerBus(msg), { codigo: 0x85, dir: 10001, datos: [0x41, 0x34] });
  const mala = msg.slice(); mala[5] ^= 1;
  igual("con un byte cambiado, la suma no da y se descarta", L.leerBus(mala), null);
  igual("el pedido: comando, dirección y suma (la del ejemplo de DGT: 81 10 06 → 17)", L.pedido(0x81, (0x10 << 7) | 0x06), [0x81, 0x10, 0x06, 0x17]);

  const rel = L.leerReloj(T.bwtime({ izquierda: 4 * 60 + 58, derecha: 3600 + 65, turno: "derecha", corriendo: true }));
  igual("el reloj: horas, minutos y segundos en BCD de cada lado, y de quién es el turno",
    [rel.izquierda.segundos, rel.derecha.segundos, rel.turno, rel.corriendo, rel.sinReloj], [298, 3665, "derecha", true, false]);
  igual("sin reloj conectado, se dice", L.leerReloj(T.bwtime(null)).sinReloj, true);
  igual("un acuse del reloj (0x0a) no son tiempos", L.leerReloj([0x0a, 0x10, 0x01, 0, 0, 0, 0]), null);
  igual("la memoria: una pieza, el tiempo del reloj que se paró (0x70 la izquierda) y las marcas",
    L.leerMemoria([0x6a, 0x41, 52, 0x70, 0x04, 0x58, 0x60, 0x02, 0x03, 0x6f]),
    [{ tipo: "marca", marca: "encendido" }, { tipo: "pieza", casilla: 52, pieza: 1 }, { tipo: "reloj", lado: "izquierda", segundos: 298 }, { tipo: "reloj", lado: "derecha", segundos: 123 }, { tipo: "marca", marca: "inicio" }]);
}

async function pruebaCadena() {
  console.log("\n=== Una cadena de 40 tableros: encontrarlos todos ===");
  const tabs = Array.from({ length: 40 }, (_, i) => T.crear({ serie: String(10001 + i) }));
  const io = cadenaVirtual(tabs, { semilla: 7 });
  const hallados = await L.crearCadena(io, rapida).encontrar();
  igual("aunque las respuestas al ping general choquen, los encuentra a los 40", hallados, tabs.map((t) => Number(t.serie)));
  cierto("usando «ignorar el próximo ping» (0x8a) con los que ya contestaron", io.escritos.some((b) => b[0] === 0x8a));
  igual("los que ya conocía se preguntan uno por uno, sin esperar al ping general",
    (await L.crearCadena(cadenaVirtual(tabs.slice(0, 3)), rapida).encontrar([10001, 10002, 10003])), [10001, 10002, 10003]);
  igual("un número que no contesta no se agrega", await L.crearCadena(cadenaVirtual(tabs.slice(0, 2)), rapida).encontrar([10001, 15000]), [10001, 10002]);
}

// Las 64 partidas en tableros virtuales de una cadena, leídas por el lector
// como lo hace la página: cada tanto 0x83 (con 1 o 2 jugadas nuevas) y 0x81.
async function pruebaPartidas() {
  console.log("\n=== Las 64 partidas modelo por la cadena, con reloj y respuestas rotas ===");
  const lista = Object.values(MODELOS);
  const tabs = lista.map((_, i) => T.crear({ serie: String(10001 + i), reloj: { izquierda: 300, derecha: 300, turno: null } }));
  const r = azar(3);
  const cad = L.crearCadena(cadenaVirtual(tabs, { semilla: 11, rotas: 0.08 }), rapida);
  const dirs = await cad.encontrar();
  const juegos = lista.map(() => new Chess());
  const lect = lista.map(() => L.crearPartida(Chess));
  const tiempos = lista.map(() => []);
  for (let i = 0; i < tabs.length; i++) lect[i].tablero((await cad.tablero(dirs[i])).casillas);
  let perdidas = 0;
  const largo = Math.max(...lista.map((m) => m.jugadas.length));
  for (let ply = 0; ply < largo; ply++) {
    for (let i = 0; i < tabs.length; i++) {
      if (ply >= lista[i].jugadas.length) continue;
      const mv = juegos[i].move(lista[i].jugadas[ply]);
      const lado = mv.color === "w" ? "izquierda" : "derecha";
      tabs[i].reloj[lado] = Math.max(0, tabs[i].reloj[lado] - 1 - Math.floor(r() * 9));   // un reloj no baja de cero
      tiempos[i].push(tabs[i].reloj[lado]);
      tabs[i].jugar(mv, juegos[i].fen());
      tabs[i].apretar(lado);
      if (r() < 0.55 && ply < lista[i].jugadas.length - 1) continue;   // a veces llegan dos jugadas juntas
      const c = await cad.cambios(dirs[i]);
      if (c.error) { perdidas += 1; continue; }
      lect[i].memoria(c.eventos);
      if (r() < 0.3) { const rr = await cad.reloj(dirs[i]); if (!rr.error) lect[i].reloj(rr.reloj); }
    }
  }
  const malas = [];
  for (let i = 0; i < tabs.length; i++) {
    const c = await cad.cambios(dirs[i]);
    if (!c.error) lect[i].memoria(c.eventos);
    if (lect[i].jugadas().join(" ") !== juegos[i].history().join(" ")) malas.push(i + ": " + lect[i].jugadas().length + " de " + juegos[i].history().length);
    else if (JSON.stringify(lect[i].tiempos()) !== JSON.stringify(tiempos[i])) malas.push(i + ": el reloj");
  }
  igual("con la suma rota en el 8 % de las respuestas, ninguna tanda de jugadas se pierde (0x84 la repite)", perdidas, 0);
  cierto("las 64 partidas llegan jugada a jugada, y cada una con el tiempo que le quedaba a quien la hizo", !malas.length, malas.slice(0, 5).join(" | "));
  const txt = lect[0].texto();
  cierto("el PGN lleva el reloj de cada jugada como lo lee Lichess: { [%clk 0:04:57] }", /^1\. \S+ \{ \[%clk 0:0\d:\d\d\] \} \S+ \{ \[%clk 0:0\d:\d\d\] \}/.test(txt), txt.slice(0, 80));
}

// Las piezas como las ve un tablero de verdad (lo describe DGT): lo nuevo
// antes que lo viejo, la dama que pasa por las casillas del medio, la pieza
// comida que nunca se ve vacía, el enroque que empieza por la torre; y las
// consultas que llegan cuando sea, también a mitad de una jugada.
function eventosDesordenados(mv, r) {
  const ev = [];
  const pz = (casilla, codigo) => ev.push({ tipo: "pieza", casilla: T.campo(casilla), pieza: codigo });
  const PZ = { p: 1, r: 2, n: 3, b: 4, k: 5, q: 6 };
  const cod = (color, tipo) => PZ[tipo] + (color === "w" ? 0 : 6);
  const f = mv.flags;
  if (f.includes("k") || f.includes("q")) {
    const fila = mv.color === "w" ? "1" : "8";
    const [rd, rh] = f.includes("k") ? ["h" + fila, "f" + fila] : ["a" + fila, "d" + fila];
    pz(rd, 0); pz(rh, cod(mv.color, "r"));                 // primero la torre: parece una jugada entera
    if (r() < 0.5) ev.push({ corte: true });
    pz(mv.to, cod(mv.color, "k")); pz(mv.from, 0);
    return ev;
  }
  const propia = cod(mv.color, mv.promotion || mv.piece);
  if ("qrb".includes(mv.piece) && r() < 0.7) {
    // Pasa por las casillas del medio: cada una se ve ocupada y después vacía.
    const df = Math.sign(mv.to.charCodeAt(0) - mv.from.charCodeAt(0)), dr = Math.sign(mv.to[1] - mv.from[1]);
    let c = mv.from.charCodeAt(0) + df, fi = Number(mv.from[1]) + dr;
    let antes = mv.from;
    while (String.fromCharCode(c) + fi !== mv.to) {
      const sq = String.fromCharCode(c) + fi;
      pz(sq, propia); pz(antes, 0);
      if (r() < 0.15) ev.push({ corte: true });
      antes = sq; c += df; fi += dr;
    }
    pz(mv.to, propia); pz(antes, 0);
  } else {
    pz(mv.to, propia);                                     // lo nuevo antes que lo viejo
    if (r() < 0.2) ev.push({ corte: true });
    pz(mv.from, 0);
  }
  if (f.includes("e")) pz(mv.to[0] + mv.from[1], 0);
  return ev;
}

function pruebaDesorden() {
  console.log("\n=== Las piezas en el orden de un tablero de verdad ===");
  const r = azar(5);
  const malas = [];
  let jugadas = 0, cortes = 0;
  for (const [id, m] of Object.entries(MODELOS)) {
    const ch = new Chess();
    const lec = L.crearPartida(Chess);
    lec.tablero(T.volcado(ch.fen()).slice(3));
    let tanda = [];
    for (const san of m.jugadas) {
      const mv = ch.move(san);
      for (const e of eventosDesordenados(mv, r)) {
        if (e.corte) { lec.memoria(tanda); tanda = []; cortes += 1; continue; }
        tanda.push(e);
      }
      tanda.push({ tipo: "reloj", lado: mv.color === "w" ? "izquierda" : "derecha", segundos: 200 });
      if (r() < 0.6) { lec.memoria(tanda); tanda = []; }
      jugadas += 1;
    }
    lec.memoria(tanda);
    if (lec.jugadas().join(" ") !== ch.history().join(" ")) malas.push(id + " (" + lec.jugadas().length + "/" + ch.history().length + ")");
  }
  cierto("las 64 partidas (" + jugadas + " jugadas, " + cortes + " consultas a mitad de jugada): ninguna jugada a medio hacer queda anotada", !malas.length, malas.slice(0, 5).join(" | "));

  // Un enroque leído en dos consultas: Tf1 parece una jugada, después llega el rey.
  const lec = L.crearPartida(Chess);
  const ch = new Chess();
  lec.tablero(T.volcado(ch.fen()).slice(3));
  for (const s of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]) { const mv = ch.move(s); lec.memoria(T.cambiosDeJugada(mv).map((x) => ({ tipo: "pieza", casilla: x[3], pieza: x[4] }))); }
  const a = lec.memoria([{ tipo: "pieza", casilla: T.campo("h1"), pieza: 0 }, { tipo: "pieza", casilla: T.campo("f1"), pieza: 2 }]);
  const b = lec.memoria([{ tipo: "pieza", casilla: T.campo("e1"), pieza: 0 }, { tipo: "pieza", casilla: T.campo("g1"), pieza: 5 }]);
  igual("el enroque que empieza por la torre: primero parece Tf1, y con el rey se corrige a O-O", [a.nuevas, b.nuevas, b.atras, lec.jugadas().slice(-1)], [["Rf1"], ["O-O"], 1, ["O-O"]]);

  // Una jugada que se corrige: Cg5 y vuelve a f3 antes de soltar el reloj.
  const c = lec.memoria([{ tipo: "pieza", casilla: T.campo("f6"), pieza: 9 }, { tipo: "pieza", casilla: T.campo("g8"), pieza: 0 }]);
  const d = lec.memoria([{ tipo: "pieza", casilla: T.campo("g8"), pieza: 9 }, { tipo: "pieza", casilla: T.campo("f6"), pieza: 0 }]);
  igual("una jugada que se devuelve a su casilla se borra (vuelve atrás una)", [c.nuevas, d.atras, lec.jugadas().length], [["Nf6"], 1, 7]);

  // Las blancas del lado del conector: el tablero no da vuelta la numeración.
  const rot = L.crearPartida(Chess);
  const ch2 = new Chess();
  const girado = () => T.volcado(ch2.fen()).slice(3).reverse();
  rot.tablero(girado());
  for (const s of ["d4", "Nf6", "c4", "e6"]) { ch2.move(s); rot.tablero(girado()); }
  igual("con el tablero dado vuelta (blancas del lado del conector) se lee igual", [rot.rotado(), rot.jugadas()], [true, ["d4", "Nf6", "c4", "e6"]]);

  const nueva = L.crearPartida(Chess);
  nueva.tablero(T.volcado("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1").slice(3));
  igual("una partida empieza solo desde la posición inicial: con otra, espera", [nueva.rotado(), nueva.jugadas()], [null, []]);

  // El reloj: cuál lado es de las blancas se deduce de la primera jugada.
  const rl = L.crearPartida(Chess);
  const ch3 = new Chess();
  rl.tablero(T.volcado(ch3.fen()).slice(3));
  ch3.move("e4");
  rl.tablero(T.volcado(ch3.fen()).slice(3));
  rl.reloj(L.leerReloj(T.bwtime({ izquierda: 297, derecha: 300, turno: "izquierda", corriendo: true })));
  igual("las blancas jugaron y corre el reloj de la izquierda: las blancas están a la derecha, con 5:00", [rl.blancasA(), rl.tiempos()], ["derecha", [300]]);
  rl.ponerResultado("1-0");
  igual("el resultado que marca el árbitro va al final del PGN", rl.texto(), "1. e4 { [%clk 0:05:00] } 1-0");
}

// ------------------------------------------------------------ la página

function clienteFalso() {
  return `window.SUPABASE_URL="https://falso.supabase.co";window.SUPABASE_ANON_KEY="x";
window.sb={auth:{getSession:()=>Promise.resolve({data:{session:{user:{id:"a"},access_token:"t"}}}),getUser:()=>Promise.resolve({data:{user:{id:"a"}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
from:()=>{const q={select(){return q},eq(){return q},maybeSingle(){return q},single(){return q},then(r){return Promise.resolve({data:null,error:null}).then(r)}};return q},
rpc:(n)=>({then(r){return Promise.resolve({data:n==="tengo_herramienta"?true:null,error:null}).then(r)}}),
channel:()=>({on(){return this},subscribe(){return this},track(){return Promise.resolve()},presenceState:()=>({})}),removeChannel(){}};`;
}

// Un torneo con su ronda 1 ya leída de chess-results y creada en Lichess, y
// un puerto COM con tres tableros virtuales en cadena (los de la página).
function preparar() {
  const j = (no, nombre) => ({ no, nombre, elo: 1800 + no });
  const pareo = { torneo: "Blitz de prueba", fecha: "2026.10.30", ronda: 1, mesas: [1, 2, 3].map((n) => ({ mesa: n, blancas: j(n * 2 - 1, "Blancas " + n), negras: j(n * 2, "Negras " + n) })) };
  localStorage.setItem("pareo-dgt", JSON.stringify({ torneos: [{ tnr: "999", nombre: "Blitz de prueba", mesas: "", ultima: { ronda: 1 }, rondas: { 1: { firma: "x", pareo, lichess: { id: "abcd1234", url: "https://lichess.org/broadcast/-/-/abcd1234" }, empujada: true } } }] }));
  sessionStorage.setItem("pareo-dgt-token", "lip_prueba");
  window.addEventListener("DOMContentLoaded", () => {
    const tabs = [10001, 10002, 10003].map((n) => DgtTablero.crear({ serie: String(n), reloj: { izquierda: 300, derecha: 300, turno: null } }));
    window.__tabs = tabs;
    let ctl;
    const puerto = {
      readable: new ReadableStream({ start(c) { ctl = c; } }),
      writable: new WritableStream({ write(chunk) {
        let resp = [];
        for (const t of tabs) resp.push(...t.recibir(Array.from(chunk)));
        if (chunk[0] === 0x87 && chunk[1] === 0 && chunk[2] === 0 && resp.length > 1) resp = [resp[0]];   // chocan: llega uno
        for (const m of resp) setTimeout(() => ctl.enqueue(Uint8Array.from(m)), 2);
      } }),
      open: () => Promise.resolve(), close: () => Promise.resolve(), setSignals: () => Promise.resolve(), getInfo: () => ({ usbProductId: 1 }),
    };
    Object.defineProperty(navigator, "serial", { value: { requestPort: () => Promise.resolve(puerto) }, configurable: true });
    // Jugar en el tablero i (como alguien de verdad: mueve y aprieta el reloj).
    window.__jugar = (i, san, segundos) => {
      const t = tabs[i];
      t.chess = t.chess || new Chess();
      const mv = t.chess.move(san);
      const lado = mv.color === "w" ? "izquierda" : "derecha";
      t.reloj[lado] -= segundos;
      t.jugar(mv, t.chess.fen());
      t.apretar(lado);
    };
  });
}

async function pruebaPagina(browser) {
  console.log("\n=== pareo-dgt.html: Transmitir sin LiveChess ===");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const p = await ctx.newPage();
  const errores = [];
  const empujados = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  await p.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await p.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: clienteFalso() }));
  await p.route("https://falso.supabase.co/**", (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  await p.route("https://lichess.org/**", (r) => {
    const u = r.request().url();
    if (/\/api\/account$/.test(u)) return r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "oscar", username: "Oscar" }) });
    if (/\/api\/broadcast\/round\/abcd1234\/push$/.test(u)) { empujados.push(r.request().postData()); return r.fulfill({ contentType: "application/json", body: "{}" }); }
    return r.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  await p.addInitScript(preparar);
  await p.goto(BASE + "/pareo-dgt.html", { waitUntil: "networkidle" });
  await p.waitForFunction(() => /Conectado a Lichess/.test(document.getElementById("lichess-estado").textContent));

  igual("el torneo de la lista ya está elegido", await p.inputValue("#directo-torneo"), "999");
  await p.click("#btn-directo-puerto");
  await p.waitForFunction(() => document.querySelectorAll("#directo-tableros tr").length === 3, null, { timeout: 15000 });
  igual("encuentra los tres tableros de la cadena", await p.$$eval("#directo-tableros th", (t) => t.map((x) => x.textContent)), ["10001", "10002", "10003"]);
  await p.click("#btn-directo-orden");
  igual("«Asignar en orden»: el 10001 a la mesa 1, el 10002 a la 2…", await p.$$eval("#directo-tableros select[aria-label^='Mesa']", (s) => s.map((x) => x.value)), ["1", "2", "3"]);
  igual("y la fila dice quién juega en esa mesa", await p.textContent("#directo-tableros tr:first-child td:nth-child(3)"), "Blancas 1 – Negras 1");

  await p.evaluate(() => { window.__jugar(0, "e4", 3); window.__jugar(0, "c5", 4); window.__jugar(1, "d4", 2); });
  await p.waitForFunction(() => /Sicilian|c5/.test(document.querySelector("#directo-tableros tr:first-child td:nth-child(4)").textContent), null, { timeout: 15000 });
  cierto("las jugadas del tablero aparecen en su fila", /2 · 1… c5/.test(await p.textContent("#directo-tableros tr:first-child td:nth-child(4)")), await p.textContent("#directo-tableros tr:first-child td:nth-child(4)"));
  await p.waitForFunction(() => /Subido a Lichess/.test(document.getElementById("directo-estado").textContent), null, { timeout: 15000 });
  await p.waitForTimeout(3500);
  const ultimo = empujados[empujados.length - 1] || "";
  cierto("y llegan a Lichess con los nombres de su mesa y el reloj de cada jugada",
    /\[White "Blancas 1"\][\s\S]*1\. e4 \{ \[%clk 0:04:57\] \} c5 \{ \[%clk 0:04:56\] \}/.test(ultimo) && /\[White "Blancas 2"\][\s\S]*1\. d4 \{ \[%clk 0:04:58\] \}/.test(ultimo), ultimo.slice(0, 400));
  cierto("la mesa 3, sin jugadas, sale con su pareo para que se vea en Lichess", /\[White "Blancas 3"\][\s\S]*?\n\n\*\n/.test(ultimo));

  await p.selectOption("#directo-tableros tr:first-child select[aria-label^='Resultado']", "0-1");
  await p.waitForFunction((n) => true, null);
  await p.waitForTimeout(3500);
  await p.evaluate(() => window.__jugar(1, "d5", 1));
  await p.waitForTimeout(3500);
  const fin = empujados[empujados.length - 1] || "";
  cierto("el resultado que marca el árbitro va a Lichess", /\[White "Blancas 1"\][\s\S]*\[Result "0-1"\][\s\S]*c5 \{ \[%clk 0:04:56\] \} 0-1/.test(fin), fin.slice(0, 500));

  // Buscar otra vez mientras se leen las jugadas: un pedido a la vez por puerto.
  await p.click("#directo-puertos button:has-text('Buscar tableros otra vez')");
  await p.waitForFunction(() => /Puerto 1 \(USB\): 3 tableros/.test(document.getElementById("directo-puertos").textContent), null, { timeout: 15000 });
  await p.evaluate(() => window.__jugar(2, "Nf3", 2));
  await p.waitForFunction(() => /1 · 1\. Cf3/.test(document.querySelector("#directo-tableros tr:nth-child(3) td:nth-child(4)").textContent), null, { timeout: 15000 });
  cierto("«Buscar tableros otra vez» mientras se leen las jugadas: siguen los tres y la jugada nueva llega", true);

  // La mesa que se cambia a mano: una mesa, un tablero.
  await p.selectOption("#directo-tableros tr:nth-child(3) select[aria-label^='Mesa']", "1");
  igual("si un tablero toma una mesa que tenía otro, el otro la suelta", await p.$$eval("#directo-tableros select[aria-label^='Mesa']", (s) => s.map((x) => x.value)), ["", "2", "1"]);
  igual("y se recuerda para la ronda siguiente", await p.evaluate(() => JSON.parse(localStorage.getItem("pareo-dgt-directo")).asignadas), { 10002: 2, 10003: 1 });
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

(async () => {
  pruebaPiezas();
  await pruebaCadena();
  await pruebaPartidas();
  pruebaDesorden();
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
