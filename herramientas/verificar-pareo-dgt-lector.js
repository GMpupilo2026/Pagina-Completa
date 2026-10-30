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

  // Una partida corta y las piezas otra vez en la posición inicial: se armó
  // la siguiente, no es «deshacer todo».
  const corta = L.crearPartida(Chess);
  const chc = new Chess();
  corta.tablero(T.volcado(chc.fen()).slice(3));
  for (const s of ["e4", "e5"]) { chc.move(s); corta.tablero(T.volcado(chc.fen()).slice(3)); }
  igual("las piezas otra vez en la posición inicial no borran la partida (se armó la siguiente)", [corta.tablero(T.volcado(T.INICIAL).slice(3)).atras, corta.jugadas()], [0, ["e4", "e5"]]);

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

// Dos categorías (Sub-12 y Abierto), cada una un torneo de chess-results con
// su ronda 1 ya leída y creada en Lichess, y un puerto COM con tres tableros
// virtuales en cadena (los de la página). Con «prueba-fens», los tableros
// arrancan donde quedaron (como uno de verdad después de recargar la página).
function preparar() {
  const j = (no, nombre) => ({ no, nombre, elo: 1800 + no });
  const pareo = (cat, n, mesas) => ({ torneo: cat, fecha: "2026.10.30", ronda: n, mesas: Array.from({ length: mesas }, (_, i) => ({ mesa: i + 1, blancas: j(i * 2 + 1, cat + " R" + n + " blancas " + (i + 1)), negras: j(i * 2 + 2, cat + " R" + n + " negras " + (i + 1)) })) });
  if (!localStorage.getItem("pareo-dgt")) {
    localStorage.setItem("pareo-dgt", JSON.stringify({ torneos: [
      { tnr: "111", nombre: "Sub-12", mesas: "", lichess: { id: "torneoA", url: "x" }, ultima: { ronda: 1 }, rondas: { 1: { firma: "1:1/Sub-12 R1 blancas 1-2/Sub-12 R1 negras 1|2:3/Sub-12 R1 blancas 2-4/Sub-12 R1 negras 2", pareo: pareo("Sub-12", 1, 2), lichess: { id: "rondaA01", url: "x" }, empujada: true } } },
      { tnr: "222", nombre: "Abierto", mesas: "", lichess: { id: "torneoB", url: "x" }, ultima: { ronda: 1 }, rondas: { 1: { firma: "1:1/Abierto R1 blancas 1-2/Abierto R1 negras 1", pareo: pareo("Abierto", 1, 1), lichess: { id: "rondaB01", url: "x" }, empujada: true } } },
    ] }));
  }
  sessionStorage.setItem("pareo-dgt-token", "lip_prueba");
  window.__pareo = pareo;
  // En document y desde antes que la página: así el puerto de mentira ya
  // existe cuando la sección 5 pregunta por los puertos permitidos.
  document.addEventListener("DOMContentLoaded", () => {
    const fens = JSON.parse(localStorage.getItem("prueba-fens") || "[]");
    const tabs = [10001, 10002, 10003].map((n, i) => DgtTablero.crear({ serie: String(n), fen: fens[i], reloj: { izquierda: 300, derecha: 300, turno: null } }));
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
    // Con permiso ya dado (después del primer «Conectar un puerto»), Chrome lo
    // devuelve en getPorts() al recargar. Es USB: trae usbVendorId.
    puerto.getInfo = () => ({ usbVendorId: 0x0403, usbProductId: 0x6001 });
    puerto.forget = () => { localStorage.removeItem("prueba-permiso"); return Promise.resolve(); };
    Object.defineProperty(navigator, "serial", { value: {
      requestPort: () => { localStorage.setItem("prueba-permiso", "1"); return Promise.resolve(puerto); },
      getPorts: () => Promise.resolve(localStorage.getItem("prueba-permiso") ? [puerto] : []),
    }, configurable: true });
    // Jugar en el tablero i (como alguien de verdad: mueve y aprieta el reloj).
    window.__jugar = (i, san, segundos) => {
      const t = tabs[i];
      t.chess = t.chess || new Chess(t.fen());
      const mv = t.chess.move(san);
      const lado = mv.color === "w" ? "izquierda" : "derecha";
      t.reloj[lado] -= segundos;
      t.jugar(mv, t.chess.fen());
      t.apretar(lado);
    };
    // Volver a armar las piezas en la posición inicial y el reloj en 5:00.
    window.__armar = (i) => { tabs[i].chess = new Chess(); tabs[i].ponerFen(DgtTablero.INICIAL); tabs[i].reloj = { izquierda: 300, derecha: 300, turno: null }; };
    window.__guardarFens = () => localStorage.setItem("prueba-fens", JSON.stringify(tabs.map((t) => t.fen())));
  });
}

async function pruebaPagina(browser) {
  console.log("\n=== pareo-dgt.html: Transmitir sin LiveChess, dos categorías ===");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const p = await ctx.newPage();
  const errores = [];
  const empujados = {};                     // id de la ronda en Lichess → lo último que recibió
  const publicada = { 111: 1, 222: 1 };     // la última ronda de cada categoría en chess-results
  const anotados = {};                      // «tnr|ronda» → { mesa: "1 - 0" }: lo que el árbitro anotó en chess-results
  let sinInternet = false;                  // chess-results y Lichess no contestan
  p.on("pageerror", (e) => errores.push(String(e)));
  await p.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await p.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: clienteFalso() }));
  await p.route("https://falso.supabase.co/**", async (r) => {
    if (sinInternet && /functions\/v1/.test(r.request().url())) return r.abort("internetdisconnected");
    const b = JSON.parse(r.request().postData() || "{}");
    if (/functions\/v1\/pareo-dgt/.test(r.request().url())) {
      if (b.accion === "lichess") {
        const m = b.ruta.match(/^\/broadcast\/(torneo[AB])\/new$/);
        const id = m ? "ronda" + m[1].slice(-1) + "02" : "x";
        return r.fulfill({ contentType: "application/json", body: JSON.stringify({ status: 200, datos: { round: { id, url: "https://lichess.org/broadcast/-/-/" + id } } }) });
      }
      const cat = b.tnr === "111" ? "Sub-12" : "Abierto";
      const n = b.rd || publicada[b.tnr];
      const pareo = await p.evaluate(([c, n, m]) => window.__pareo(c, n, m), [cat, n, b.tnr === "111" ? 2 : 1]);
      for (const m of pareo.mesas) m.resultado = (anotados[b.tnr + "|" + n] || {})[m.mesa] || "";
      return r.fulfill({ contentType: "application/json", body: JSON.stringify(Object.assign(pareo, { leido_en: new Date().toISOString() })) });
    }
    return r.fulfill({ contentType: "application/json", body: "{}" });
  });
  await p.route("https://lichess.org/**", (r) => {
    if (sinInternet) return r.abort("internetdisconnected");
    const u = r.request().url();
    if (/\/api\/account$/.test(u)) return r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "oscar", username: "Oscar" }) });
    const m = u.match(/\/api\/broadcast\/round\/(\w+)\/push$/);
    if (m) { empujados[m[1]] = r.request().postData(); return r.fulfill({ contentType: "application/json", body: "{}" }); }
    return r.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  await p.addInitScript(preparar);
  await p.goto(BASE + "/pareo-dgt.html", { waitUntil: "networkidle" });
  await p.waitForFunction(() => /Conectado a Lichess/.test(document.getElementById("lichess-estado").textContent));

  const fila = (i, col) => p.textContent("#directo-tableros tr:nth-child(" + i + ") td:nth-child(" + col + ")");
  const esperarFila = (i, col, re) => p.waitForFunction(([i, col, re]) => new RegExp(re).test(document.querySelector("#directo-tableros tr:nth-child(" + i + ") td:nth-child(" + col + ")").textContent), [i, col, re], { timeout: 15000 });
  const esperarEmpuje = (id, re) => p.waitForFunction(() => true).then(async () => { for (let k = 0; k < 60; k++) { if (new RegExp(re).test(empujados[id] || "")) return true; await p.waitForTimeout(250); } return false; });

  await p.click("#btn-directo-puerto");
  await p.waitForFunction(() => document.querySelectorAll("#directo-tableros tr").length === 3, null, { timeout: 15000 });
  igual("encuentra los tres tableros de la cadena", await p.$$eval("#directo-tableros th", (t) => t.map((x) => x.textContent)), ["10001", "10002", "10003"]);
  cierto("y al conectar el puerto empieza a vigilar chess-results, para que las rondas lleguen solas", /Vigilando/.test(await p.textContent("#vigilar-estado")));

  // La configuración inicial: del 10001 al 10002 a Sub-12 desde la mesa 1, y el 10003 al Abierto.
  await p.fill("#directo-desde", "10001");
  await p.fill("#directo-hasta", "10002");
  await p.selectOption("#directo-categoria", "111");
  await p.fill("#directo-mesa1", "1");
  await p.click("#btn-directo-asignar");
  await p.selectOption("#directo-tableros tr:nth-child(3) select[aria-label^='Categoría']", "222");
  igual("«Asignar»: el 10001 y el 10002 a Sub-12, mesas 1 y 2; el 10003 al Abierto, mesa 1",
    [await p.$$eval("#directo-tableros select[aria-label^='Categoría']", (s) => s.map((x) => x.value)), await p.$$eval("#directo-tableros input[aria-label^='Mesa']", (s) => s.map((x) => x.value))],
    [["111", "111", "222"], ["1", "2", "1"]]);
  cierto("y cada fila dice quién juega en esa mesa y en qué ronda", /Sub-12 R1 blancas 2 – Sub-12 R1 negras 2 \(ronda 1\)/.test(await fila(2, 4)), await fila(2, 4));

  await p.evaluate(() => { window.__jugar(0, "e4", 3); window.__jugar(0, "c5", 4); window.__jugar(2, "d4", 2); });
  await esperarFila(1, 5, "2 · 1… c5");
  cierto("las jugadas de cada categoría van a su ronda en Lichess, con el reloj de cada jugada",
    (await esperarEmpuje("rondaA01", '\\[White "Sub-12 R1 blancas 1"\\][\\s\\S]*1\\. e4 \\{ \\[%clk 0:04:57\\] \\} c5 \\{ \\[%clk 0:04:56\\] \\}')) &&
    (await esperarEmpuje("rondaB01", '\\[White "Abierto R1 blancas 1"\\][\\s\\S]*1\\. d4 \\{ \\[%clk 0:04:58\\] \\}')), (empujados.rondaA01 || "").slice(0, 300));
  igual("cada categoría dice su ronda y cuándo subió", (await p.$$eval("#directo-categorias li", (l) => l.map((x) => x.textContent.replace(/: [\d:]+ [ap]\. m/, ": HORA")))), ["Sub-12: 2 tableros, ronda 1. Subido a Lichess: HORA.", "Abierto: 1 tablero, ronda 1. Subido a Lichess: HORA."]);

  // La mesa 1 de Sub-12 termina; la mesa 2 sigue jugando. Sale la ronda 2 de Sub-12.
  // Nadie marca el resultado en esta página: lo anota el árbitro en chess-results.
  await p.evaluate(() => window.__jugar(1, "e4", 2));
  await esperarFila(2, 5, "1 · 1. e4");
  // En chess-results: el árbitro anota el 1-0 de la mesa 1 de Sub-12 y empareja
  // la ronda 2; en el Abierto anota el 0-1 de su mesa 1 (sin ronda nueva).
  anotados["111|1"] = { 1: "1 - 0" };
  anotados["222|1"] = { 1: "0 - 1" };
  publicada[111] = 2;
  await p.click("#btn-revisar");
  await esperarFila(1, 4, "Sub-12 R2 blancas 1 – Sub-12 R2 negras 1 \\(ronda 2\\)");
  cierto("sale la ronda 2: el 1-0 que anotó el árbitro en chess-results termina la partida, y el tablero toma solo a los jugadores nuevos de su mesa", true);
  await esperarFila(2, 4, "\\(ronda 1; termina y pasa a la 2\\)");
  cierto("el que sigue jugando termina primero la partida de la ronda 1", true);
  cierto("el Abierto, sin ronda nueva, sigue en la 1", /Abierto R1 blancas 1 .*\(ronda 1\)$/.test(await fila(3, 4)), await fila(3, 4));
  await p.waitForFunction(() => document.querySelector("#directo-tableros tr:nth-child(3) select[aria-label^='Resultado']").value === "0-1", null, { timeout: 15000 });
  cierto("y el 0-1 que anotó el árbitro en chess-results aparece solo en su fila", true);
  cierto("y llega solo a Lichess", await esperarEmpuje("rondaB01", '\\[Result "0-1"\\][\\s\\S]*1\\. d4 \\{ \\[%clk 0:04:58\\] \\} 0-1'), (empujados.rondaB01 || "").slice(0, 400));

  await p.evaluate(() => { window.__armar(0); window.__jugar(0, "Nf3", 5); window.__jugar(1, "e5", 6); });
  cierto("la partida nueva va a la ronda 2 de Lichess, con los nombres nuevos",
    await esperarEmpuje("rondaA02", '\\[White "Sub-12 R2 blancas 1"\\][\\s\\S]*1\\. Nf3 \\{ \\[%clk 0:04:55\\] \\}'), (empujados.rondaA02 || "").slice(0, 300));
  cierto("y la ronda 1 sigue entera en Lichess: la partida terminada (1-0) y la que se sigue jugando",
    await esperarEmpuje("rondaA01", '\\[Result "1-0"\\][\\s\\S]*c5 \\{ \\[%clk 0:04:56\\] \\} 1-0[\\s\\S]*\\[White "Sub-12 R1 blancas 2"\\][\\s\\S]*1\\. e4 \\{ \\[%clk 0:04:58\\] \\} e5 \\{ \\[%clk 0:04:54\\] \\}'), (empujados.rondaA01 || "").slice(0, 600));
  await p.evaluate(() => window.__armar(1));
  await esperarFila(2, 4, "Sub-12 R2 blancas 2 – Sub-12 R2 negras 2 \\(ronda 2\\)");
  cierto("al volver a armar las piezas, ese tablero también pasa a la ronda 2", true);

  // Recargar la página no pierde nada: la configuración y las partidas quedan en la computadora.
  await p.evaluate(() => window.__guardarFens());
  await p.waitForTimeout(500);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForFunction(() => /Conectado a Lichess/.test(document.getElementById("lichess-estado").textContent));
  // Sin tocar «Conectar un puerto»: el puerto USB que ya tenía permiso se abre solo
  // (y vuelve a buscar sus tableros: unos segundos).
  await p.waitForFunction(() => document.querySelectorAll("#directo-tableros tr").length === 3, null, { timeout: 30000 });
  await esperarFila(1, 5, "1 · 1. Cf3");
  igual("después de recargar, sin tocar nada: el puerto se conecta solo, cada tablero en su categoría y su mesa, y la partida sigue donde iba",
    [await p.$$eval("#directo-tableros select[aria-label^='Categoría']", (s) => s.map((x) => x.value)), (await fila(1, 4)).trim(), (await fila(1, 5)).trim()],
    [["111", "111", "222"], "Sub-12 R2 blancas 1 – Sub-12 R2 negras 1 (ronda 2)", "1 · 1. Cf3"]);
  await p.evaluate(() => window.__jugar(0, "d5", 4));
  cierto("y lo que se juega después llega a Lichess con lo de antes",
    await esperarEmpuje("rondaA02", '1\\. Nf3 \\{ \\[%clk 0:04:55\\] \\} d5 \\{ \\[%clk 0:04:56\\] \\}'), (empujados.rondaA02 || "").slice(0, 300));

  // Se va internet: los tableros se siguen leyendo y nada se pierde. En el
  // Abierto la partida terminó (0-1), se arman las piezas y se empieza la
  // ronda 2, que la página todavía no puede leer de chess-results.
  sinInternet = true;
  publicada[222] = 2;
  await p.evaluate(() => { window.__jugar(0, "c4", 3); window.__armar(2); window.__jugar(2, "e4", 2); window.__jugar(2, "c5", 3); });
  await esperarFila(1, 5, "3 · 2\\. c4");
  await p.click("#btn-revisar");
  await p.waitForTimeout(4000);
  cierto("sin internet: los tableros se siguen leyendo, y el del Abierto espera en la ronda 1 (no sabe que salió la 2)", /\(ronda 1\)$/.test(await fila(3, 4)), await fila(3, 4));
  cierto("y a Lichess no llegó nada nuevo", !/c4/.test(empujados.rondaA02 || "") && !empujados.rondaB02);

  // Vuelve internet: la ronda 2 del Abierto se lee y se crea en Lichess, y la
  // partida que se empezó sin conexión llega entera, desde la primera jugada.
  sinInternet = false;
  await p.click("#btn-revisar");
  await esperarFila(3, 4, "Abierto R2 blancas 1 – Abierto R2 negras 1 \\(ronda 2\\)");
  cierto("vuelve internet: la partida que se empezó sin conexión queda en la ronda 2, desde la primera jugada",
    /2 · 1… c5/.test(await fila(3, 5)), await fila(3, 5));
  cierto("y llega entera a la ronda 2 de Lichess, con el reloj de cada jugada",
    await esperarEmpuje("rondaB02", '\\[White "Abierto R2 blancas 1"\\][\\s\\S]*1\\. e4 \\{ \\[%clk 0:04:58\\] \\} c5 \\{ \\[%clk 0:04:57\\] \\}'), (empujados.rondaB02 || "").slice(0, 400));
  // (Al recargar, el reloj del tablero virtual volvió a 5:00: la c4 queda con 4:57.)
  cierto("y lo que se jugó sin internet en Sub-12 también llega",
    await esperarEmpuje("rondaA02", '1\\. Nf3 \\{ \\[%clk 0:04:55\\] \\} d5 \\{ \\[%clk 0:04:56\\] \\} 2\\. c4 \\{ \\[%clk 0:04:57\\] \\}'), (empujados.rondaA02 || "").slice(0, 400));
  igual("y el Abierto de la ronda 1 sigue con su 0-1 en Lichess", /\[Result "0-1"\]/.test(empujados.rondaB01 || ""), true);

  // Una mesa de una categoría, un tablero.
  await p.fill("#directo-tableros tr:nth-child(2) input[aria-label^='Mesa']", "1");
  await p.press("#directo-tableros tr:nth-child(2) input[aria-label^='Mesa']", "Enter");
  await p.dispatchEvent("#directo-tableros tr:nth-child(2) input[aria-label^='Mesa']", "change");
  igual("si un tablero toma la mesa de otro de su categoría, el otro la suelta",
    await p.evaluate(() => JSON.parse(localStorage.getItem("pareo-dgt-directo")).asignadas), { 10002: { tnr: "111", mesa: 1 }, 10003: { tnr: "222", mesa: 1 } });
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
