#!/usr/bin/env node
/* La cámara que lee el tablero (camara-tablero.html) y la partida en vivo
 * (tablero-vivo.html), comprobadas en un navegador de verdad con un cliente de
 * Supabase de mentira.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - una homografía mal resuelta, o un tablero encontrado corrido una fila,
 *    pone la cuadrícula sobre otras casillas y la lectura «funciona», pero
 *    de otro tablero;
 *  - un tablero con a1 en otra esquina lee perfecto la posición inicial (es
 *    simétrica) y después anota d4 cuando se jugó e4: por eso se juega con el
 *    tablero girado, visto de lado y desde el lado de las negras;
 *  - una jugada mal reconocida queda anotada como si fuera la buena: lo que
 *    no explica ninguna jugada legal NO se anota;
 *  - la transmisión puede dejar de llegar, llegar a quien no es o seguir
 *    mandando después de «Dejar de transmitir», y nadie se entera;
 *  - y la página de la cámara se le abriría a quien no administra.
 *
 * Las fotos las dibuja el mismo navegador, píxel a píxel: un tablero verde y
 * crema con un margen blanco (como los de vinilo), visto en perspectiva, con
 * piezas redondas, baldosas de piso alrededor y ruido. Nunca se habla con el
 * Supabase de verdad: cada página tiene su canal falso y Node releva los
 * mensajes de una a otra, como haría un canal de Broadcast.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-camara-tablero.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { Chess } = require("chess.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* ── El canal falso, relevado por Node ─────────────────────────────────── */
const paginas = new Set();
const sordas = new Set(); // las que no reciben (un mensaje que se pierde)
let mandados = 0;
const eventos = []; // todo lo que pasó por el canal: { nombre, event, payload }
async function relevar(desde, nombre, msg) {
  mandados++;
  eventos.push({ nombre, event: msg.event, payload: msg.payload });
  for (const p of paginas) {
    if (p === desde || sordas.has(p)) continue; // Broadcast no le devuelve a quien manda
    await p.evaluate(({ nombre, msg }) => {
      const oy = (window.__canales || {})[nombre];
      if (oy && oy[msg.event]) oy[msg.event]({ payload: msg.payload });
    }, { nombre, msg }).catch(() => { /* la página ya se cerró */ });
  }
}
const CANAL = `
    channel(nombre) {
      const oy = {};
      const c = {
        __nombre: nombre,
        on(t, f, cb) { if (t === "broadcast") oy[f.event] = cb; return c; },
        subscribe(cb) { (window.__canales = window.__canales || {})[nombre] = oy; if (cb) setTimeout(() => cb("SUBSCRIBED"), 0); return c; },
        send(m) { window.__aCanal(nombre, JSON.parse(JSON.stringify(m))); return Promise.resolve("ok"); },
        unsubscribe() {},
      };
      return c;
    },
    removeChannel(c) { if (window.__canales) delete window.__canales[c.__nombre]; },`;

function cliente(yo) {
  return `window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: ${yo.sinSesion ? "null" : '{ user: { id: "u" }, access_token: "t" }'} } }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } },
    // profiles: quien mira. pareo_publicados: los torneos de window.__pareo,
    // filtrados de verdad en el resolver (eq, gte, lte).
    from(tabla) {
      (window.__tablas = window.__tablas || []).push(tabla);
      const filtros = [];
      const filas = () => (window.__pareo || []).filter((x) => filtros.every((g) => g(x)));
      const b = {
        select: () => b, in: () => b, order: () => b, limit: () => b, range: () => b,
        // Lo que se guarda (la partida en la cuenta del alumno), para mirarlo.
        insert: (fila) => { (window.__insertados = window.__insertados || []).push({ tabla, fila }); return Promise.resolve({ data: null, error: null }); },
        eq: (c, v) => { filtros.push((x) => x[c] === v); return b; },
        gte: (c, v) => { filtros.push((x) => x[c] >= v); return b; },
        lte: (c, v) => { filtros.push((x) => x[c] <= v); return b; },
        maybeSingle: () => (tabla === "pareo_publicados" && window.__sinRed ? Promise.reject(new TypeError("Failed to fetch"))
          : Promise.resolve({ data: tabla === "pareo_publicados" ? filas()[0] || null : ${JSON.stringify(yo)}, error: null })),
        then: (ok, ko) => Promise.resolve({ data: tabla === "pareo_publicados" ? filas() : [], error: null }).then(ok, ko),
      };
      return b;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    ${CANAL}
  };`;
}

async function abrir(browser, ruta, yo, viewport, init) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: viewport || { width: 1280, height: 1400 } });
  if (init) await ctx.addInitScript(init.f, init.arg);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.exposeFunction("__aCanal", (nombre, msg) => relevar(page, nombre, msg));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente(yo || { is_admin: true }) }));
  paginas.add(page); // antes de cargar: quien mira pide la partida apenas abre
  await page.goto(BASE + "/" + ruta, { waitUntil: "load" });
  return { ctx, page, errores };
}
async function cerrar(x) { paginas.delete(x.page); await x.ctx.close(); }

/* ── Las fotos ──────────────────────────────────────────────────────────
 * Las esquinas a1, h1, h8, a8 caen donde se pide (en una foto de 800 × 600),
 * así que el mismo dibujo sirve para el tablero de frente, girado, de lado o
 * visto desde las negras. */
function dibujarFoto(opc) {
  const { fondo } = opc;
  const ancho = 800, alto = 600;
  const L = window.LectorTablero;
  // Uno o varios tableros en la misma foto, cada uno con su posición.
  const tabs = (opc.tableros || [{ fen: opc.fen, esq: opc.esq }]).map(({ fen, esq }) => {
    // De la imagen al tablero (en centésimas de casilla: el cuadrilátero de destino tiene que tener área).
    const inv = L.homografia(esq, L.ESQUINAS_TABLERO.map(([u, v]) => [u * 100, v * 100]));
    const pieza = {};
    fen.split(" ")[0].split("/").forEach((fila, i) => {
      let f = 0;
      for (const ch of fila) { if (/\d/.test(ch)) { f += +ch; continue; } pieza[f + "," + (7 - i)] = ch === ch.toUpperCase() ? "w" : "b"; f++; }
    });
    return { inv, pieza };
  });
  const c = document.createElement("canvas"); c.width = ancho; c.height = alto;
  const g = c.getContext("2d"), d = g.createImageData(ancho, alto), p = d.data;
  let s = 12345;
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
    let col, u = -9, v = -9, pieza = {};
    for (const t of tabs) {
      const [u100, v100] = L.aplicar(t.inv, x, y);
      if (u100 > -40 && u100 < 840 && v100 > -40 && v100 < 840) { u = u100 / 100; v = v100 / 100; pieza = t.pieza; break; }
    }
    if (u >= 0 && u < 8 && v >= 0 && v < 8) {
      const f = Math.floor(u), r = Math.floor(v);
      col = (f + r) % 2 === 0 ? [118, 150, 86] : [238, 238, 210];
      const pz = pieza[f + "," + r];
      if (pz) {
        const dd = Math.hypot(u - f - 0.5, v - r - 0.5);
        if (dd < 0.33) col = pz === "w" ? (dd > 0.28 ? [60, 60, 60] : [250, 248, 240]) : (dd > 0.28 ? [170, 170, 170] : [30, 30, 30]);
      }
    } else if (u > -0.4 && u < 8.4 && v > -0.4 && v < 8.4) {
      col = [245, 245, 240];
    } else if (fondo === "liso") {
      col = [120, 100, 80];
    } else {
      col = (x % 90) < 3 || (y % 90) < 3 ? [150, 130, 115] : [215, 195, 180];
    }
    // La luz: más oscura (`luz` < 1) y, con `sombra`, más hacia la derecha.
    if (opc.luz || opc.sombra) { const k = (opc.luz || 1) * (1 - (opc.sombra || 0) * x / ancho); col = col.map((c) => c * k); }
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const n = (s % 19) - 9, o = (y * ancho + x) * 4;
    p[o] = col[0] + n; p[o + 1] = col[1] + n; p[o + 2] = col[2] + n; p[o + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return c.toDataURL("image/png").split(",")[1];
}
async function foto(page, fen, esq, fondo, luz) {
  const opc = Array.isArray(fen) ? { tableros: fen } : Object.assign({ fen, esq, fondo }, luz);
  const b64 = await page.evaluate(([src, opc]) => new Function("return " + src)()(opc), [dibujarFoto.toString(), opc]);
  await page.setInputFiles("#foto", { name: "tablero.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") });
}
// La foto de 800 se trabaja a 640 de ancho.
const aLienzo = (esq) => esq.map(([x, y]) => [x * 0.8, y * 0.8]);

/* Los tableros de prueba: dónde caen a1, h1, h8 y a8 en la foto. */
const TABLEROS = {
  "de frente, un poco inclinado": [[180, 520], [596, 552], [548, 152], [132, 120]],
  "visto de lado (un trapecio)": [[150, 560], [650, 560], [560, 180], [240, 180]],
  "desde arriba y girado": [[220, 520], [560, 470], [610, 130], [270, 180]],
  "chico, en una esquina de la foto": [[480, 560], [760, 560], [740, 330], [500, 330]],
  "muy de lado": [[100, 580], [700, 580], [580, 300], [220, 300]],
  // Las blancas a la izquierda, como en la prueba con el tablero de verdad.
  "de lado, con las blancas a la izquierda": [[150, 180], [150, 560], [650, 560], [560, 180]].map((p, i, a) => a[(i + 1) % 4]),
  // La cámara del lado de las negras: a1 arriba a la derecha.
  "desde el lado de las negras": [[560, 180], [240, 180], [150, 560], [650, 560]],
};

async function tocar(page, puntos) {
  // A la vista entero y lejos del encabezado fijo: un toque fuera no llega.
  await page.locator("#lienzo").evaluate((c) => c.scrollIntoView({ block: "center", behavior: "instant" }));
  const caja = await page.locator("#lienzo").boundingBox();
  const k = caja.width / 640;
  for (const [x, y] of puntos) await page.mouse.click(caja.x + x * k, caja.y + y * k);
}

const aviso = (p) => p.textContent("#aviso");
const esperarAviso = (p, re, ms) => p.waitForFunction((src) => new RegExp(src).test(document.getElementById("aviso").textContent), re.source, { timeout: ms || 8000 });
const jugadasDe = (p) => p.textContent("#jugadas");
async function esperarJugadas(p, n) {
  await p.waitForFunction((n) => {
    const t = document.getElementById("jugadas").textContent;
    return t.split(" ").filter((x) => x && !/\.$/.test(x) && !/ninguna/.test(t)).length === n;
  }, n, { timeout: 8000 }).catch(() => { /* lo dice la comprobación que sigue */ });
}

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\nLas cuentas, sin la página");
  const a = await abrir(browser, "camara-tablero.html");
  const p = a.page;
  await p.waitForSelector("#app:not(.hidden)");
  const ESQ0 = TABLEROS["de frente, un poco inclinado"];
  igual("la homografía lleva cada esquina del tablero a la marcada",
    await p.evaluate((ESQ) => {
      const L = window.LectorTablero, h = L.homografia(L.ESQUINAS_TABLERO, ESQ);
      return L.ESQUINAS_TABLERO.every(([u, v], i) => { const [x, y] = L.aplicar(h, u, v); return Math.hypot(x - ESQ[i][0], y - ESQ[i][1]) < 1e-6; });
    }, ESQ0), true);
  igual("tres esquinas en línea no dan tablero",
    await p.evaluate(() => window.LectorTablero.homografia(window.LectorTablero.ESQUINAS_TABLERO, [[0, 0], [10, 0], [20, 0], [5, 5]])), null);
  igual("las esquinas tocadas en cualquier orden se ordenan en el giro de a1, h1, h8, a8",
    await p.evaluate((ESQ) => {
      const D = window.DetectarTablero, revueltas = [ESQ[2], ESQ[0], ESQ[3], ESQ[1]];
      const q = D.ordenar(revueltas);
      // Es el mismo ciclo que el original, empezando en cualquiera.
      return [0, 1, 2, 3].some((k) => D.girar(q, k).every((pt, i) => pt === ESQ[i]));
    }, ESQ0), true);

  const jugadas = (pgnAntes, pgnDespues) => p.evaluate(([a, b]) => {
    const L = window.LectorTablero;
    const j = new window.Chess(); j.load_pgn(a);
    const k = new window.Chess(); k.load_pgn(b);
    return L.buscarJugadas(j, L.esperada(k));
  }, [pgnAntes, pgnDespues]);
  igual("reconoce 1. e4", await jugadas("", "1. e4"), ["e4"]);
  igual("reconoce una captura (exd5)", await jugadas("1. e4 d5", "1. e4 d5 2. exd5"), ["exd5"]);
  igual("reconoce el enroque corto (cambian 4 casillas)", await jugadas("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5", "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O"), ["O-O"]);
  igual("reconoce la captura al paso (cambian 3 casillas)", await jugadas("1. e4 a6 2. e5 d5", "1. e4 a6 2. e5 d5 3. exd6"), ["exd6"]);
  igual("si se escapó una jugada, encuentra las dos", await jugadas("", "1. e4 e5"), ["e4", "e5"]);
  igual("lo que no explica ninguna jugada legal no se anota", await p.evaluate(() => {
    const L = window.LectorTablero, j = new window.Chess();
    return L.buscarJugadas(j, ".".repeat(64));
  }), null);
  igual("la posición inicial se lee BBBBBBBB…NNNNNNNN", await p.evaluate(() => window.LectorTablero.esperada(new window.Chess())), "B".repeat(16) + ".".repeat(32) + "N".repeat(16));

  igual("antes de abrir la cámara, el recuadro no queda negro: dice qué va ahí", await p.evaluate(() => {
    const c = document.getElementById("lienzo"), d = c.getContext("2d").getImageData(5, 5, 1, 1).data;
    return [c.width, c.height, d[0], d[1], d[2]];
  }), [640, 400, 16, 42, 67]);
  igual("el tablero digital dice cómo va la partida", await p.textContent("#como-va"), "La partida está en la posición inicial. Juegan las blancas.");

  console.log("\nEncontrar el tablero en la foto");
  const INICIAL = new Chess().fen();
  const medir = (esq, fondo, rough) => p.evaluate(async ([src, opc, rough]) => {
    const b64 = new Function("return " + src)()(opc);
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = 640; c.height = 480;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0, 640, 480);
    const D = window.DetectarTablero;
    const gr = D.gris(g.getImageData(0, 0, 640, 480).data, 640, 480);
    const verdad = opc.esq.map(([x, y]) => [x * 0.8, y * 0.8]);
    const error = (q) => Math.max(...q.map((pt) => Math.min(...verdad.map((v) => Math.hypot(v[0] - pt[0], v[1] - pt[1])))));
    if (rough) {
      // Tocadas a ojo: hasta 10 px de error en cada esquina y en otro orden.
      const ojo = verdad.map(([x, y], i) => [x + [-9, 8, 7, -10][i], y + [8, -9, 10, 7][i]]);
      return Math.round(error(D.ajustar(gr, D.ordenar([ojo[2], ojo[0], ojo[3], ojo[1]])).esquinas) * 10) / 10;
    }
    const r = await D.buscar(gr);
    return r ? Math.round(error(r.esquinas) * 10) / 10 : null;
  }, [dibujarFoto.toString(), { fen: INICIAL, esq, fondo }, rough]);
  for (const [nombre, esq] of Object.entries(TABLEROS)) {
    const err = await medir(esq);
    igual("«Buscar el tablero» lo encuentra " + nombre + " (a menos de 4 px)", err !== null && err < 4, true);
  }
  for (const nombre of ["visto de lado (un trapecio)", "desde arriba y girado"]) {
    const err = await medir(TABLEROS[nombre], undefined, true);
    igual("esquinas tocadas a ojo (10 px de error, otro orden) se ajustan solas, " + nombre + " (a menos de 3 px)", err < 3, true);
  }
  igual("en una foto sin tablero (solo el piso) no encuentra nada",
    await medir([[-900, -900], [-800, -900], [-800, -800], [-900, -800]]), null);

  console.log("\nUna partida foto a foto, con las esquinas tocadas a ojo");
  const partida = new Chess();
  await foto(p, partida.fen(), ESQ0);
  await esperarAviso(p, /esquinas/);
  // En otro orden y corridas hasta 8 px: el ajuste las pone en su lugar.
  const ojo = aLienzo(ESQ0).map(([x, y], i) => [x + [6, -7, 8, -5][i], y + [-6, 7, 5, -8][i]]);
  await tocar(p, [ojo[2], ojo[3], ojo[0], ojo[1]]);
  igual("con las cuatro, pide calibrar", (await aviso(p)).includes("Calibrar"), true);
  await p.click("#btn-calibrar");
  await esperarAviso(p, /Calibrado/);
  igual("calibra y lee bien las 64 casillas de la posición inicial", await aviso(p), "Calibrado: lee bien 64 de 64 casillas en la posición inicial. Ya puedes jugar.");

  for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O"]) {
    partida.move(san);
    await foto(p, partida.fen(), ESQ0);
    await esperarJugadas(p, partida.history().length);
  }
  igual("anota la partida jugada frente a la cámara, en algebraica española", await jugadasDe(p), "1. e4 e5 2. Cf3 Cc6 3. Ac4 Cf6 4. O-O");
  igual("la posición digital es la de la partida", await p.textContent("#fen"), partida.fen());
  igual("y debajo del tablero, la última jugada y a quién le toca", await p.textContent("#como-va"), "Última jugada: 4. O-O. Juegan las negras.");
  igual("y lee las 64 casillas como se esperan", await p.textContent("#acierto"), "64 de 64");

  // Una pieza que desaparece sin jugada: no se anota nada y se dice dónde.
  const rara = new Chess(partida.fen());
  rara.remove("a2");
  await foto(p, rara.fen(), ESQ0);
  await esperarAviso(p, /No reconozco/);
  igual("lo que no es una jugada legal no se anota y dice la casilla", (await aviso(p)).includes("a2"), true);
  igual("la partida sigue igual", await jugadasDe(p), "1. e4 e5 2. Cf3 Cc6 3. Ac4 Cf6 4. O-O");
  await p.click("#btn-deshacer");
  igual("«Deshacer» quita la última jugada", await jugadasDe(p), "1. e4 e5 2. Cf3 Cc6 3. Ac4 Cf6");
  igual("sin errores en la consola", a.errores, []);
  await cerrar(a);

  console.log("\nCon «Buscar el tablero», a1 en cualquier esquina");
  for (const nombre of ["visto de lado (un trapecio)", "de lado, con las blancas a la izquierda", "desde el lado de las negras"]) {
    const esq = TABLEROS[nombre];
    const b = await abrir(browser, "camara-tablero.html");
    await b.page.waitForSelector("#app:not(.hidden)");
    const j = new Chess();
    await foto(b.page, j.fen(), esq);
    await esperarAviso(b.page, /esquinas/);
    await b.page.click("#btn-buscar");
    await esperarAviso(b.page, /Encontré|No encontré/, 60000);
    igual(nombre + ": lo encuentra", (await aviso(b.page)).startsWith("Encontré el tablero"), true);
    await b.page.click("#btn-calibrar");
    await esperarAviso(b.page, /Calibrado|no se ve/);
    igual(nombre + ": calibra con las 64", (await aviso(b.page)).includes("64 de 64"), true);
    for (const san of ["e4", "c5"]) { j.move(san); await foto(b.page, j.fen(), esq); await esperarJugadas(b.page, j.history().length); }
    igual(nombre + ": e4 es e4 y c5 es c5 (a1 donde corresponde)", await jugadasDe(b.page), "1. e4 c5");
    igual(nombre + ": sin errores en la consola", b.errores, []);
    await cerrar(b);
  }

  console.log("\nLa jugada dudosa: la más probable, o se pregunta");
  {
    const b = await abrir(browser, "camara-tablero.html");
    const pb = b.page;
    await pb.waitForSelector("#app:not(.hidden)");
    // Lecturas armadas a mano, con la seguridad de cada casilla.
    const decidir = (pgn, cambios, seguras) => pb.evaluate(([pgn, cambios, seguras]) => {
      const L = window.LectorTablero, j = new window.Chess();
      j.load_pgn(pgn);
      const lec = L.esperada(j).split("");
      const seg = new Float32Array(64).fill(0.9);
      for (const [cas, letra, s] of cambios) {
        const k = (Number(cas[1]) - 1) * 8 + "abcdefgh".indexOf(cas[0]);
        lec[k] = letra; seg[k] = s;
      }
      return L.decidir(j, lec.join(""), seguras === false ? undefined : seg);
    }, [pgn, cambios, seguras]);
    // Cf3 con la pieza que «se ve un poco» en e3 y en f4 (dudosas): sin la
    // seguridad no calzaba ninguna; con ella, se anota Cf3.
    const cf3 = [["g1", ".", 0.9], ["f3", "B", 0.8], ["e3", "B", 0.1], ["f4", "B", 0.1]];
    igual("sin la seguridad de cada casilla, Cf3 con e3 dudosa no se anotaba", await decidir("1. e4 e5", cf3, false), null);
    igual("con ella, se anota Cf3 (e3 y f4 casi no pesan)", await decidir("1. e4 e5", cf3), { jugadas: ["Nf3"] });
    const empate = await decidir("1. e4 e5", [["g1", ".", 0.9], ["f3", "B", 0.2], ["e2", "B", 0.2]]);
    igual("si dos jugadas explican igual la lectura, pregunta cuál fue (Cf3 o Ce2)",
      empate && empate.dudas && empate.dudas.map((x) => x.join()).sort(), ["Ne2", "Nf3"]);
    igual("una sombra dudosa sin ninguna casilla vacía de más no inventa una jugada",
      await decidir("1. e4 e5", [["h6", "N", 0.2]]), null);
    igual("una jugada clara sigue saliendo igual", await decidir("1. e4 e5", [["g1", ".", 0.9], ["f3", "B", 0.9]]), { jugadas: ["Nf3"] });

    // Anotar a mano: en español, y solo si es legal.
    const j = new Chess();
    await foto(pb, j.fen(), ESQ0);
    await esperarAviso(pb, /esquinas/);
    await tocar(pb, aLienzo(ESQ0));
    await pb.click("#btn-calibrar");
    await esperarAviso(pb, /Calibrado/);
    await pb.fill("#jugada-mano", "Cf6");
    await pb.click("#form-anotar button[type=submit]");
    igual("una jugada que no es legal no se anota", [(await aviso(pb)).includes("no es una jugada legal"), await jugadasDe(pb)], [true, "Todavía ninguna."]);
    await pb.fill("#jugada-mano", "e4");
    await pb.click("#form-anotar button[type=submit]");
    igual("una legal sí, escrita a mano", await jugadasDe(pb), "1. e4");
    j.move("e4");
    await foto(pb, j.fen(), ESQ0);
    j.move("e5"); await foto(pb, j.fen(), ESQ0); await esperarJugadas(pb, 2);
    igual("y la cámara sigue desde ahí", await jugadasDe(pb), "1. e4 e5");

    // Un golpe chico a la cámara: todo se corre unos píxeles.
    const CORRIDA = ESQ0.map(([x, y]) => [x + 30, y + 18]);
    j.move("Nf3");
    await foto(pb, j.fen(), CORRIDA);
    await esperarAviso(pb, /cámara se movió/, 15000).catch(() => { /* lo dice la comprobación que sigue */ });
    igual("si la cámara se corre un poco, vuelve a ubicar el tablero sola", await aviso(pb), "La cámara se movió: el tablero se volvió a ubicar y la partida sigue.");
    await esperarJugadas(pb, 3);
    j.move("Nc6"); await foto(pb, j.fen(), CORRIDA); await esperarJugadas(pb, 4);
    igual("y sigue anotando sin perder nada", await jugadasDe(pb), "1. e4 e5 2. Cf3 Cc6");

    // Un golpe grande: el tablero queda en otro lado de la foto.
    const LEJOS = TABLEROS["visto de lado (un trapecio)"];
    j.move("Bc4");
    await foto(pb, j.fen(), LEJOS);
    await esperarAviso(pb, /cámara se movió/, 15000);
    igual("si se corre mucho, dice qué hacer sin perder lo anotado", (await aviso(pb)).startsWith("Parece que la cámara se movió"), true);
    await pb.click("#btn-buscar");
    await esperarAviso(pb, /Encontré|No encontré/, 60000);
    await pb.click("#btn-seguir");
    await esperarAviso(pb, /sigo con la partida|no se ve/);
    igual("«Buscar el tablero» y «Seguir con esta partida» siguen con las mismas jugadas", [(await aviso(pb)).startsWith("Listo, sigo con la partida"), (await jugadasDe(pb)).startsWith("1. e4 e5 2. Cf3 Cc6")], [true, true]);
    await esperarJugadas(pb, 5);
    j.move("Nf6"); await foto(pb, j.fen(), LEJOS); await esperarJugadas(pb, 6);
    igual("y las jugadas siguientes se anotan", await jugadasDe(pb), "1. e4 e5 2. Cf3 Cc6 3. Ac4 Cf6");

    // La página se recarga: la partida estaba guardada en el celular.
    await pb.reload({ waitUntil: "load" });
    await pb.waitForSelector("#app:not(.hidden)");
    igual("al volver a abrir la página, recupera la partida", [(await aviso(pb)).startsWith("Se recuperó la partida que estabas anotando (6 jugadas)"), await jugadasDe(pb)], [true, "1. e4 e5 2. Cf3 Cc6 3. Ac4 Cf6"]);
    await foto(pb, j.fen(), LEJOS);
    await esperarAviso(pb, /esquinas/);
    await pb.click("#btn-buscar");
    await esperarAviso(pb, /Encontré|No encontré/, 60000);
    await pb.click("#btn-seguir");
    await esperarAviso(pb, /sigo con la partida|no se ve/);
    j.move("O-O"); await foto(pb, j.fen(), LEJOS); await esperarJugadas(pb, 7);
    igual("y la sigue donde quedó", await jugadasDe(pb), "1. e4 e5 2. Cf3 Cc6 3. Ac4 Cf6 4. O-O");
    igual("sin errores en la consola", b.errores, []);
    await cerrar(b);

    // Una partida que no estaba anotada: se pega su FEN.
    const c = await abrir(browser, "camara-tablero.html");
    const pc2 = c.page;
    await pc2.waitForSelector("#app:not(.hidden)");
    const k = new Chess(); ["d4", "d5", "c4", "e6", "Nc3", "Nf6"].forEach((x) => k.move(x));
    await pc2.click("summary:has-text('Empezar desde otra posición')");
    await pc2.fill("#posicion", "esto no es una posición");
    await pc2.click("#form-posicion button[type=submit]");
    igual("lo que no es un FEN ni un PGN se dice", (await aviso(pc2)).startsWith("No entiendo esa posición"), true);
    await pc2.fill("#posicion", k.fen());
    await pc2.click("#form-posicion button[type=submit]");
    igual("con un FEN, el tablero digital queda en esa posición", await pc2.textContent("#fen"), k.fen());
    await foto(pc2, k.fen(), ESQ0);
    await esperarAviso(pc2, /esquinas/);
    await tocar(pc2, aLienzo(ESQ0));
    await pc2.click("#btn-seguir");
    await esperarAviso(pc2, /sigo con la partida|no se ve/);
    igual("calibra con esa posición y no con la inicial", (await aviso(pc2)).startsWith("Listo, sigo con la partida"), true);
    k.move("Bg5"); await foto(pc2, k.fen(), ESQ0); await esperarJugadas(pc2, 1);
    igual("y anota la jugada siguiente", await jugadasDe(pc2), "4. Ag5");
    igual("sin errores en la consola", c.errores, []);
    await cerrar(c);
  }

  console.log("\n«¿Está bien armada?»");
  {
    const b = await abrir(browser, "camara-tablero.html");
    const pg = b.page;
    await pg.waitForSelector("#app:not(.hidden)");
    // Mal armada: falta el caballo de b1, hay un peón blanco de más en e4 y un
    // peón negro en vez del blanco de h2.
    const mal = new Chess(); mal.remove("b1"); mal.put({ type: "p", color: "w" }, "e4"); mal.remove("h2"); mal.put({ type: "p", color: "b" }, "h2");
    await foto(pg, mal.fen(), ESQ0);
    await esperarAviso(pg, /esquinas/);
    await tocar(pg, aLienzo(ESQ0));
    await pg.click("#btn-armado");
    await esperarAviso(pg, /armada/);
    igual("sin calibrar todavía, dice qué casillas no calzan con la posición inicial, con el nombre de la pieza",
      [(await aviso(pg)).startsWith("No está bien armada: hay 3 casillas"), await pg.$$eval("#armado-lista li", (l) => l.map((x) => x.textContent))],
      [true, ["Falta el caballo blanco en b1.", "En h2 hay una pieza negra y debería ser blanca (el peón).", "Sobra una pieza blanca en e4."]]);
    await foto(pg, new Chess().fen(), ESQ0);
    await pg.click("#btn-armado");
    await esperarAviso(pg, /Está bien armada/);
    igual("bien armada, lo dice y no queda ninguna casilla en la lista", [(await aviso(pg)).startsWith("Está bien armada"), await pg.locator("#armado-lista li").count()], [true, 0]);
    // Ya calibrada y con una partida: contra la posición de la partida.
    await pg.click("#btn-calibrar");
    await esperarAviso(pg, /Calibrado/);
    const j = new Chess(); j.move("e4"); await foto(pg, j.fen(), ESQ0); await esperarJugadas(pg, 1);
    const otra = new Chess(j.fen()); otra.remove("d8");
    await foto(pg, otra.fen(), ESQ0);
    await pg.click("#btn-armado");
    await esperarAviso(pg, /armada/);
    igual("con la cámara calibrada, la compara con la posición de la partida", await pg.$$eval("#armado-lista li", (l) => l.map((x) => x.textContent)), ["Falta la dama negra en d8."]);
    igual("sin errores en la consola", b.errores, []);
    await cerrar(b);
  }

  console.log("\nEntrenar en el tablero: contra el motor y un ejercicio");
  {
    const b = await abrir(browser, "camara-tablero.html");
    const pg = b.page;
    // Stockfish de mentira: contesta 1... e5 a 1. e4.
    await pg.route("**/js/shared-engine.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "window.SharedEngine = {};" }));
    await pg.route("**/js/preparacion-motor.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript",
      body: "window.PreparacionMotor = { evaluar: (fen, p) => { window.__prof = p; return Promise.resolve({ eval: 0.2, mejor: window.__motor ? window.__motor(fen) : / b /.test(fen) ? 'e5' : 'Nf3' }); } };" }));
    // El banco, con un solo mate en 2 (del banco de verdad: mate2-0307).
    await pg.route("**/entreno/data/mates.json", (r) => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify([{ id: "mate2-0307", category: "mate2", fen: "1Q6/8/8/8/8/k2K4/8/8 w - - 0 1", solution: ["Kc3", "Ka2", "Qb2#"] }]) }));
    await pg.waitForSelector("#app:not(.hidden)");
    const j = new Chess();
    await foto(pg, j.fen(), ESQ0);
    await esperarAviso(pg, /esquinas/);
    await tocar(pg, aLienzo(ESQ0));
    await pg.click("#btn-calibrar");
    await esperarAviso(pg, /Calibrado/);
    await pg.click("#btn-entreno-motor");
    igual("contra el motor, con blancas: empieza quien entrena", await pg.textContent("#entreno-estado"), "Te toca: juegas con blancas.");
    j.move("e4"); await foto(pg, j.fen(), ESQ0); await esperarJugadas(pg, 1);
    await pg.waitForFunction(() => /El motor juega/.test(document.getElementById("entreno-estado").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("el motor contesta (a la profundidad del nivel) y dice cómo poner su jugada", [await pg.textContent("#entreno-estado"), await pg.evaluate(() => window.__prof)],
      ["El motor juega e5: mueve el peón negro de e7 a e5. Pon esa jugada en tu tablero.", 5]);
    const malo = new Chess(j.fen()); malo.move("d5");
    await foto(pg, malo.fen(), ESQ0);
    await esperarAviso(pg, /Esa no es/);
    igual("si se pone otra, no se anota y dice cuál es", [await jugadasDe(pg), (await aviso(pg)).includes("hay que poner e5")], ["1. e4", true]);
    j.move("e5"); await foto(pg, j.fen(), ESQ0); await esperarJugadas(pg, 2);
    igual("puesta la del motor, se anota y te toca otra vez", [await jugadasDe(pg), await pg.textContent("#entreno-estado")], ["1. e4 e5", "Te toca."]);
    await pg.click("#btn-entreno-dejar");
    igual("dejarla a medias no guarda nada", await pg.evaluate(() => (window.__insertados || []).length), 0);

    // Una partida entera contra el motor (escrita a mano), con la pista al pensar más de un minuto.
    await foto(pg, new Chess().fen(), ESQ0);
    await pg.evaluate(() => {
      const real = Date.now; window.__mas = 0; Date.now = () => real() + window.__mas;
      const negras = ["a6", "b6", "a5", "h6", "g6"];
      window.__motor = (fen) => (/ b /.test(fen) ? negras.shift() : "Qxf7#");
    });
    await pg.click("#btn-entreno-motor");
    const escribir = async (san) => { await pg.fill("#jugada-mano", san); await pg.click("#form-anotar button[type=submit]"); };
    for (const [mia, suya] of [["e4", "a6"], ["Bc4", "b6"], ["Qf3", "a5"], ["Nh3", "h6"], ["d3", "g6"]]) {
      await escribir(mia);
      await pg.waitForFunction(() => /El motor juega/.test(document.getElementById("entreno-estado").textContent), null, { timeout: 8000 }).catch(() => {});
      await escribir(suya);
    }
    igual("sin pensar mucho, no hay pista", await pg.evaluate(() => document.getElementById("entreno-pista").checkVisibility()), false);
    await pg.evaluate(() => { window.__mas += 61000; });
    await pg.waitForFunction(() => document.getElementById("entreno-pista").checkVisibility(), null, { timeout: 8000 }).catch(() => {});
    igual("pensando más de un minuto, la pista: qué pieza mira el motor (no la jugada)", await pg.textContent("#entreno-pista"), "Pista: mira la dama de f3.");
    await escribir("Qxf7#");
    await pg.waitForFunction(() => (window.__insertados || []).some((x) => x.tabla === "partidas_torneo"), null, { timeout: 8000 }).catch(() => {});
    igual("terminada, la partida queda en su libreta de torneos («Tus propios errores»)", await pg.evaluate(() => {
      const f = (window.__insertados || []).find((x) => x.tabla === "partidas_torneo");
      return f && [f.fila.color, f.fila.resultado, f.fila.jugadas.length, f.fila.evento, f.fila.fecha === window.HoraCR.hoy()];
    }), ["w", "1-0", 11, "Contra el motor (cámara, nivel medio)", true]);
    igual("y lo dice", (await pg.textContent("#entreno-estado")).includes("Quedó en tu libreta de torneos"), true);
    await pg.evaluate(() => { window.__motor = null; });

    // Un ejercicio: armarlo, una jugada equivocada que vuelve, la solución y la respuesta del rival.
    await pg.selectOption("#entreno-banco", "mate2");
    await pg.click("#btn-entreno-ejercicio");
    await pg.waitForFunction(() => /Arma en tu tablero/.test(document.getElementById("entreno-estado").textContent), null, { timeout: 8000 }).catch(() => {});
    const e = new Chess("1Q6/8/8/8/8/k2K4/8/8 w - - 0 1");
    igual("el ejercicio aparece en el tablero de la derecha, para armarlo", [await pg.textContent("#fen"), (await pg.textContent("#entreno-estado")).startsWith("Arma en tu tablero")], [e.fen(), true]);
    await foto(pg, new Chess("1Q6/8/8/8/8/k7/8/3K4 w - - 0 1").fen(), ESQ0);
    await pg.click("#btn-entreno-armado");
    await esperarAviso(pg, /Todavía no está igual/);
    igual("armado mal, dice qué casillas arreglar", await pg.$$eval("#armado-lista li", (l) => l.map((x) => x.textContent)), ["Sobra una pieza blanca en d1.", "Falta el rey blanco en d3."]);
    await foto(pg, e.fen(), ESQ0);
    await pg.click("#btn-entreno-armado");
    await esperarAviso(pg, /Bien armada/);
    const mal = new Chess(e.fen()); mal.move("Kc4");
    await foto(pg, mal.fen(), ESQ0);
    await esperarAviso(pg, /No es esa/);
    igual("una jugada que no es se dice y no se anota", [(await aviso(pg)).startsWith("No es esa (Rc4)"), await jugadasDe(pg)], [true, "Todavía ninguna."]);
    await foto(pg, e.fen(), ESQ0);
    await esperarAviso(pg, /de vuelta/);
    igual("con un intento fallido, todavía sin pista", await pg.evaluate(() => document.getElementById("entreno-pista").checkVisibility()), false);
    const mal2 = new Chess(e.fen()); mal2.move("Kd4");
    await foto(pg, mal2.fen(), ESQ0);
    await esperarAviso(pg, /Pista/);
    igual("al segundo, la pista: qué pieza se mueve", await pg.textContent("#entreno-pista"), "Pista: se mueve el rey de d3.");
    await foto(pg, e.fen(), ESQ0);
    await esperarAviso(pg, /de vuelta/);
    e.move("Kc3"); await foto(pg, e.fen(), ESQ0); await esperarJugadas(pg, 1);
    await pg.waitForFunction(() => /El rival responde/.test(document.getElementById("entreno-estado").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("la buena se anota y el rival responde lo del banco", await pg.textContent("#entreno-estado"), "El rival responde Ra2: mueve el rey negro de a3 a a2. Pon esa jugada en tu tablero.");
    e.move("Ka2"); await foto(pg, e.fen(), ESQ0); await esperarJugadas(pg, 2);
    e.move("Qb2#"); await foto(pg, e.fen(), ESQ0); await esperarJugadas(pg, 3);
    await esperarAviso(pg, /Resuelto/);
    igual("y con el mate, resuelto (con cuántos intentos fallidos)", await pg.textContent("#entreno-estado"), "¡Resuelto (con 2 intentos fallidos)! Es mate.");
    await pg.waitForFunction(() => (window.__insertados || []).some((x) => x.tabla === "training_progress"), null, { timeout: 8000 }).catch(() => {});
    igual("el mate resuelto cuenta en su progreso del Entrenamiento (con error y con pista: no es limpio)", await pg.evaluate(() => {
      const f = (window.__insertados || []).find((x) => x.tabla === "training_progress");
      return f && [f.fila[0].activity, f.fila[0].detail];
    }), ["mates", { puzzle_id: "mate2-0307", category: "mate2", desde: "camara", limpio: false, con_error: true, con_pista: true }]);
    igual("sin errores en la consola", b.errores, []);
    await cerrar(b);
  }

  console.log("\nLa luz que cambia");
  {
    const reloj = { f: () => { const pn = performance.now.bind(performance); window.__adelanto = 0; performance.now = () => pn() + window.__adelanto; } };
    const b = await abrir(browser, "camara-tablero.html", null, null, reloj);
    const pg = b.page;
    await pg.waitForSelector("#app:not(.hidden)");
    const j = new Chess();
    await foto(pg, j.fen(), ESQ0);
    await esperarAviso(pg, /esquinas/);
    await tocar(pg, aLienzo(ESQ0));
    await pg.click("#btn-calibrar");
    await esperarAviso(pg, /Calibrado/);
    j.move("e4"); await foto(pg, j.fen(), ESQ0); await esperarJugadas(pg, 1);
    // De golpe, mucho más oscuro y con sombra de un lado: con la calibración de
    // antes varias casillas se leen mal, pero no es ninguna jugada.
    await foto(pg, j.fen(), ESQ0, null, { luz: 0.55, sombra: 0.35 });
    await esperarAviso(pg, /luz|ilegal|movió/);
    igual("si cambia la luz de golpe, se vuelve a calibrar sola: ni jugada ilegal ni jugada nueva",
      [(await aviso(pg)).startsWith("Cambió la luz"), await jugadasDe(pg)], [true, "1. e4"]);
    j.move("e5"); await foto(pg, j.fen(), ESQ0, null, { luz: 0.55, sombra: 0.35 }); await esperarJugadas(pg, 2);
    igual("y con la luz nueva sigue anotando", await jugadasDe(pg), "1. e4 e5");
    // Poco a poco: mientras lee la partida, cada 15 s afina la calibración.
    const antes = (await pg.evaluate(() => window.gastoCamara())).afinadas;
    await pg.evaluate(() => { window.__adelanto += 16000; });
    await foto(pg, j.fen(), ESQ0, null, { luz: 0.5, sombra: 0.35 });
    await pg.waitForFunction((n) => window.gastoCamara().afinadas > n, antes, { timeout: 8000 }).catch(() => {});
    igual("con la partida en paz, cada 15 segundos afina la calibración con la luz de ahora", (await pg.evaluate(() => window.gastoCamara())).afinadas > antes, true);
    // Una pieza que de verdad salta (la torre de a1 a a5) no es la luz: se avisa.
    const ilegal = new Chess(j.fen()); ilegal.remove("a1"); ilegal.put({ type: "r", color: "w" }, "a5");
    await foto(pg, ilegal.fen(), ESQ0, null, { luz: 0.5, sombra: 0.35 });
    await esperarAviso(pg, /No reconozco/);
    igual("una pieza que se movió sin ser jugada legal sigue siendo un aviso, no «la luz»", (await aviso(pg)).includes("puede ser una jugada ilegal"), true);
    igual("sin errores en la consola", b.errores, []);
    await cerrar(b);
  }

  console.log("\nEnseñarle a la cámara: fotos con su posición, solo si se enciende");
  {
    const b = await abrir(browser, "camara-tablero.html");
    const pg = b.page;
    await pg.waitForSelector("#app:not(.hidden)");
    const j = new Chess();
    await foto(pg, j.fen(), ESQ0);
    await esperarAviso(pg, /esquinas/);
    await tocar(pg, aLienzo(ESQ0));
    await pg.click("#btn-calibrar");
    await esperarAviso(pg, /Calibrado/);
    j.move("d4"); await foto(pg, j.fen(), ESQ0); await esperarJugadas(pg, 1);
    igual("viene apagado: sin encenderlo no guarda nada", [await pg.isChecked("#muestras-si"), await pg.textContent("#muestras-cuenta"), await pg.isDisabled("#btn-muestras-bajar")], [false, "Ninguna foto guardada.", true]);
    await pg.click("summary:has-text('Enseñarle a la cámara')");
    await pg.check("#muestras-si");
    j.move("d5"); await foto(pg, j.fen(), ESQ0); await esperarJugadas(pg, 2);
    j.move("c4"); await foto(pg, j.fen(), ESQ0); await esperarJugadas(pg, 3);
    await pg.waitForFunction(() => /2 fotos/.test(document.getElementById("muestras-cuenta").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("encendido, guarda una foto por jugada anotada", await pg.textContent("#muestras-cuenta"), "2 fotos guardadas.");
    const [descarga] = await Promise.all([pg.waitForEvent("download"), pg.click("#btn-muestras-bajar")]);
    const zip = fs.readFileSync(await descarga.path());
    const texto = zip.toString("latin1");
    const csv = texto.slice(texto.indexOf("archivo,etiqueta"), texto.indexOf("\n", texto.indexOf("\n", texto.indexOf("\n", texto.indexOf("archivo,etiqueta")) + 1) + 1));
    const filas = csv.trim().split("\n").slice(1).map((l) => l.split(","));
    const tras = (lista) => { const x = new Chess(); lista.forEach((m) => x.move(m)); return x; };
    const etiqueta = (x) => { let s = ""; for (let k = 0; k < 64; k++) { const p = x.get("abcdefgh"[k & 7] + ((k >> 3) + 1)); s += !p ? "." : p.color === "w" ? "B" : "N"; } return s; };
    igual("el .zip trae etiquetas.csv con cada foto, su posición en 64 letras y su FEN",
      [descarga.suggestedFilename().startsWith("camara-muestras-"), filas.length, filas.map((f) => [f[1], f[2]]), (texto.match(/tablero-\d{5}\.jpg/g) || []).length >= 2, texto.includes("JFIF")],
      [true, 2, [[etiqueta(tras(["d4", "d5"])), tras(["d4", "d5"]).fen()], [etiqueta(tras(["d4", "d5", "c4"])), tras(["d4", "d5", "c4"]).fen()]], true, true]);
    await pg.click("#btn-muestras-borrar");
    igual("«Borrar» pide tocar otra vez", [await pg.textContent("#btn-muestras-borrar"), await pg.textContent("#muestras-cuenta")], ["Toca otra vez para borrarlas", "2 fotos guardadas."]);
    await pg.click("#btn-muestras-borrar");
    await pg.waitForFunction(() => /Ninguna/.test(document.getElementById("muestras-cuenta").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("y las borra de este aparato", await pg.textContent("#muestras-cuenta"), "Ninguna foto guardada.");
    igual("sin errores en la consola", b.errores, []);
    await cerrar(b);
  }

  console.log("\nLa coronación: se pregunta la pieza, o se deduce si se mueve como caballo");
  {
    // Un peón blanco en e7 con e8 libre (el rey negro en c5, donde ni la
    // dama ni el caballo de e8 le dan jaque).
    const FEN = "rnbq1bnr/ppp1Pppp/8/2k5/8/8/PPPP1PPP/RNBQKBNR w KQ - 0 5";
    const desde = async (b) => {
      const pg = b.page;
      await pg.waitForSelector("#app:not(.hidden)");
      await pg.click("summary:has-text('Empezar desde otra posición')");
      await pg.fill("#posicion", FEN);
      await pg.click("#form-posicion button[type=submit]");
      await foto(pg, FEN, ESQ0);
      await esperarAviso(pg, /esquinas/);
      await tocar(pg, aLienzo(ESQ0));
      await pg.click("#btn-seguir");
      await esperarAviso(pg, /sigo con la partida/);
      return pg;
    };
    const seVe = (pg) => pg.evaluate(() => document.getElementById("coronacion").checkVisibility());

    const b = await abrir(browser, "camara-tablero.html");
    const pg = await desde(b);
    const k = new Chess(FEN);
    k.move("e8=Q"); await foto(pg, k.fen(), ESQ0); await esperarJugadas(pg, 1);
    igual("al coronar se anota dama y se pregunta qué pieza puso",
      [await jugadasDe(pg), await seVe(pg), (await pg.textContent("#coronacion-texto")).includes("e8")], ["5. e8=D", true, true]);
    await pg.click("[data-corona=r]");
    igual("elegir «Torre» corrige la jugada y la pregunta se va", [await jugadasDe(pg), await seVe(pg)], ["5. e8=T", false]);
    igual("y el FEN tiene una torre en e8", (await pg.textContent("#fen")).startsWith("rnbqRbnr/"), true);
    igual("sin errores en la consola", b.errores, []);
    await cerrar(b);

    const c = await abrir(browser, "camara-tablero.html");
    const pc = await desde(c);
    const j = new Chess(FEN);
    j.move("e8=Q"); await foto(pc, j.fen(), ESQ0); await esperarJugadas(pc, 1);
    j.move("a6"); await foto(pc, j.fen(), ESQ0); await esperarJugadas(pc, 2);
    // La pieza de e8 salta a f6: una dama no puede, un caballo sí.
    const n = new Chess(FEN); ["e8=N", "a6", "Nf6"].forEach((x) => n.move(x));
    await foto(pc, n.fen(), ESQ0); await esperarJugadas(pc, 3);
    igual("si la pieza coronada se mueve como caballo, era caballo: se corrige sola",
      [await jugadasDe(pc), await seVe(pc), (await aviso(pc)).includes("se movió como caballo")], ["5. e8=C a6 6. Cf6", false, true]);
    igual("y la partida sigue en la posición correcta", await pc.textContent("#fen"), n.fen());
    igual("sin errores en la consola", c.errores, []);
    await cerrar(c);

    // Lo de LectorTablero, sin cámara: lo que sigue a la coronación tiene
    // que seguir siendo legal con la otra pieza.
    const p2 = await abrir(browser, "camara-tablero.html");
    await p2.page.waitForSelector("#app:not(.hidden)");
    igual("cambiar la coronación no deja una partida ilegal (la dama movida en diagonal no puede ser torre)", await p2.page.evaluate((fen) => {
      const L = window.LectorTablero, x = new window.Chess(fen);
      ["e8=Q", "a6", "Qxf7"].forEach((m) => x.move(m));
      const antes = x.fen();
      return [L.cambiarCoronacion(x, 0, "r"), x.fen() === antes, L.cambiarCoronacion(x, 0, "b"), x.history()[0]];
    }, FEN), [false, true, true, "e8=B"]);
    igual("la repetición y las 50 jugadas se dicen justo en la jugada en que se cumplen", await p2.page.evaluate(() => {
      const V = window.PartidaEnVivo, j = new window.Chess(), r = [];
      for (let i = 0; i < 4; i++) ["Nf3", "Nf6", "Ng1", "Ng8"].forEach((m) => { j.move(m); r.push(V.reglaDeTablas(j)); });
      const k = new window.Chess("8/8/4k3/8/8/4K3/8/R7 w - - 98 80"), r2 = [];
      ["Ra2", "Kd6", "Ra1"].forEach((m) => { k.move(m); r2.push(V.reglaDeTablas(k)); });
      const l = new window.Chess("8/8/4k3/8/8/4K3/8/R7 w - - 149 80"); l.move("Ra2");
      // Una posición con la casilla al paso que nadie puede usar es la misma (art. 9.2.3).
      const m = new window.Chess(); m.move("c4");
      ["Nc6", "Nf3", "Nb8", "Ng1", "Nc6", "Nf3", "Nb8"].forEach((x) => m.move(x));
      const antes = V.reglaDeTablas(m); m.move("Ng1");
      return [r.map((x, i) => x && i + 1 + ":" + x).filter(Boolean), r2, V.reglaDeTablas(l), antes, V.reglaDeTablas(m)];
    }), [["8:repeticion3", "9:repeticion3", "10:repeticion3", "11:repeticion3", "16:repeticion5"], [null, "jugadas50", null], "jugadas75", null, "repeticion3"]);
    igual("cuántas jugadas se escribieron a mano viaja con la partida (para el informe de Pareo)", await p2.page.evaluate(() => {
      const V = window.PartidaEnVivo, j = new window.Chess(); j.move("e4"); j.move("e5");
      const p = V.estado(j, {}, null, null, { mano: 1, id: "x-0" }), q = V.loNuevo("x-0", j, 1, null, null, { mano: 2 });
      return [p.mano, V.leer(p).mano, q.mano, V.estado(j, {}, null, null, {}).mano];
    }), [1, 1, 2, undefined]);
    await cerrar(p2);
  }

  console.log("\nUna simultánea: una cámara por tablero, sin torneo");
  {
    const arrancar = async (tablero, codigo) => {
      const b = await abrir(browser, "camara-tablero.html");
      const pg = b.page;
      await pg.waitForSelector("#app:not(.hidden)");
      await foto(pg, new Chess().fen(), ESQ0);
      await esperarAviso(pg, /esquinas/);
      await tocar(pg, aLienzo(ESQ0));
      await pg.click("#btn-calibrar");
      await esperarAviso(pg, /Calibrado/);
      await pg.click("summary:has-text('Una simultánea')");
      if (codigo) await pg.fill("#simul-codigo", codigo);
      await pg.fill("#simul-tablero", String(tablero));
      await pg.click("#btn-vivo");
      await pg.waitForSelector("#vivo-encendido:not([hidden])");
      return b;
    };
    const A = await arrancar(1);
    const codigo = (await A.page.textContent("#vivo-codigo")).split(" ")[0];
    igual("la primera cámara crea la simultánea y dice su tablero", await A.page.textContent("#vivo-codigo"), codigo + " · tablero 1 de la simultánea");
    igual("y el enlace del alumno de ese tablero abre su partida", await A.page.textContent("#vivo-enlace-alumno"), await A.page.textContent("#vivo-enlace") + "&m=1");
    const B = await arrancar(2, codigo);
    igual("la segunda se une con el mismo código, en su tablero", await B.page.textContent("#vivo-codigo"), codigo + " · tablero 2 de la simultánea");
    const W = await abrir(browser, "tablero-vivo.html#" + codigo, null, { width: 1280, height: 1000 });
    await W.page.waitForFunction(() => document.querySelectorAll("#mesas-lista button[data-mesa]").length === 2, null, { timeout: 8000 }).catch(() => {});
    igual("quien mira ve los dos tableros juntos", await W.page.$$eval("#mesas-lista button[data-mesa]", (bs) => bs.map((b) => b.querySelector("p").textContent)), ["Tablero 1", "Tablero 2"]);
    const S = await abrir(browser, "tablero-vivo.html#" + codigo + "&m=2", null, { width: 390, height: 844 });
    const jb = new Chess(); jb.move("d4");
    await foto(B.page, jb.fen(), ESQ0); await esperarJugadas(B.page, 1);
    await S.page.waitForFunction(() => !document.getElementById("partida").hidden && /d4/.test(document.getElementById("jugadas").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("el alumno del tablero 2, con su enlace, ve su partida en grande", [await S.page.textContent("#mesa-titulo"), await S.page.textContent("#jugadas")], ["Tablero 2", "1. d4"]);
    const ja = new Chess(); ja.move("e4");
    const antes = eventos.length;
    await foto(A.page, ja.fen(), ESQ0); await esperarJugadas(A.page, 1);
    await W.page.waitForFunction(() => /e4/.test(document.querySelector('#mesas-lista button[data-mesa="1"]').textContent), null, { timeout: 8000 }).catch(() => {});
    igual("cada jugada llega a su tablero", [/e4/.test(await W.page.textContent('#mesas-lista button[data-mesa="1"]')), /d4/.test(await W.page.textContent('#mesas-lista button[data-mesa="2"]'))], [true, true]);
    const [bajada] = await Promise.all([W.page.waitForEvent("download"), W.page.click("#btn-pgn-todas")]);
    const pgnTodas = fs.readFileSync(await bajada.path(), "utf8");
    const juegos = pgnTodas.trim().split(/\n\n(?=\[Event)/);
    igual("«Bajar todas las partidas» deja un PGN con cada tablero, sus datos y sus jugadas, que chess.js vuelve a leer",
      [bajada.suggestedFilename().endsWith(".pgn"), juegos.length, juegos.map((g) => (/\[Board "([^"]+)"\]/.exec(g) || [])[1]),
        juegos.map((g) => { const c = new Chess(); return c.load_pgn(g) ? c.history().join(" ") : "no se lee"; }), /\[Date "\d{4}\.\d{2}\.\d{2}"\]/.test(pgnTodas)],
      [true, 2, ["Tablero 1", "Tablero 2"], ["e4", "d4"], true]);
    igual("lo que viaja dice el tablero de la simultánea, sin torneo", eventos.slice(antes).filter((x) => x.event === "estado").map((x) => [x.payload.simul, x.payload.mesa, "torneo" in x.payload]).slice(-1), [[1, 1, false]]);
    igual("sin errores en la consola (simultánea)", [A.errores, B.errores, W.errores, S.errores], [[], [], [], []]);
    for (const x of [A, B, W, S]) await cerrar(x);
  }

  console.log("\nDos tableros con un celular (opcional)");
  {
    const IZQ = [[40, 520], [380, 535], [390, 195], [50, 180]], DER = [[430, 530], [770, 515], [760, 175], [420, 190]];
    const b = await abrir(browser, "camara-tablero.html");
    const pb = b.page;
    await pb.waitForSelector("#app:not(.hidden)");
    igual("por omisión lee un solo tablero: la opción apagada y sin pestañas",
      [await pb.isChecked("#dos-tableros"), await pb.locator("#pestanas").isVisible()], [false, false]);
    const ji = new Chess(), jd = new Chess();
    const ambas = () => foto(pb, [{ fen: ji.fen(), esq: IZQ }, { fen: jd.fen(), esq: DER }]);
    await ambas();
    await esperarAviso(pb, /esquinas/);
    await pb.check("#dos-tableros");
    igual("al encenderla aparecen las pestañas, con el tablero 2 elegido",
      [await pb.locator("#pestanas").isVisible(), await pb.getAttribute('[data-tablero="1"]', "aria-pressed")], [true, "true"]);
    igual("y recuerda que lo más confiable es un celular por tablero", (await aviso(pb)).includes("un celular por tablero"), true);
    igual("la imagen se trabaja más grande (960 de ancho)", await pb.evaluate(() => document.getElementById("lienzo").width), 960);
    for (const n of ["1", "2"]) {
      await pb.click(`[data-tablero="${n - 1}"]`);
      await pb.click("#btn-buscar");
      await esperarAviso(pb, /Encontré|No encontré/, 90000);
      igual("tablero " + n + ": lo encuentra" + (n === "2" ? " (el otro, no el mismo)" : ""), (await aviso(pb)).startsWith("Tablero " + n + ": Encontré el tablero"), true);
      await pb.click("#btn-calibrar");
      await esperarAviso(pb, /Calibrado|no se ve/);
      igual("tablero " + n + ": calibra con las 64", (await aviso(pb)).includes("64 de 64"), true);
    }
    ji.move("e4"); jd.move("d4");
    await ambas();
    await pb.waitForTimeout(2500);
    const partidas = [];
    for (const n of [0, 1]) { await pb.click(`[data-tablero="${n}"]`); partidas.push(await jugadasDe(pb)); }
    igual("cada tablero anota su propia partida (e4 en uno, d4 en el otro)", partidas.slice().sort(), ["1. d4", "1. e4"]);
    jd.move("d5");
    await ambas();
    await pb.waitForTimeout(2500);
    const despues = [];
    for (const n of [0, 1]) { await pb.click(`[data-tablero="${n}"]`); despues.push(await jugadasDe(pb)); }
    igual("una jugada en un tablero no toca al otro", despues.slice().sort(), ["1. d4 d5", "1. e4"]);
    const codigos = [];
    for (const n of [0, 1]) { await pb.click(`[data-tablero="${n}"]`); await pb.click("#btn-vivo"); codigos.push(await pb.textContent("#vivo-codigo")); }
    igual("cada tablero se transmite con su propio código", codigos[0] !== codigos[1] && codigos.every((c) => /^[a-hjkmnp-z2-9]{8}$/.test(c)), true);
    await pb.click('[data-tablero="0"]');
    const primero = await jugadasDe(pb);
    await pb.uncheck("#dos-tableros");
    igual("al apagarla vuelve a un tablero: sin pestañas y la imagen a 640", [await pb.locator("#pestanas").isVisible(), await pb.evaluate(() => document.getElementById("lienzo").width)], [false, 640]);
    igual("el tablero 1 sigue con su partida", await jugadasDe(pb), primero);
    igual("sin errores en la consola", b.errores, []);
    await cerrar(b);
  }

  console.log("\nLa partida en vivo");
  const cam = await abrir(browser, "camara-tablero.html");
  const pc = cam.page;
  await pc.waitForSelector("#app:not(.hidden)");
  const jv = new Chess();
  await foto(pc, jv.fen(), ESQ0);
  await esperarAviso(pc, /esquinas/);
  await tocar(pc, aLienzo(ESQ0));
  await pc.click("#btn-calibrar");
  await esperarAviso(pc, /Calibrado/);
  igual("antes de empezar, no se ve el enlace", await pc.locator("#vivo-encendido").isVisible(), false);
  await pc.fill("#vivo-blancas", '<img src=x onerror="window.__xss=1">Ana');
  await pc.fill("#vivo-negras", "Beto");
  await pc.click("#btn-vivo");
  const codigo = await pc.textContent("#vivo-codigo");
  igual("transmitiendo, con un código de 8 letras y números sin 0, 1, i, l ni o", /^[a-hjkmnp-z2-9]{8}$/.test(codigo), true);
  const enlace = await pc.getAttribute("#vivo-enlace", "href");
  igual("el enlace lleva el código después del #", enlace.endsWith("/tablero-vivo.html#" + codigo), true);
  // La librería del QR se carga al pedirlo: se espera a que aparezca.
  await pc.waitForSelector("#vivo-qr svg", { timeout: 8000 }).catch(() => {});
  igual("y su código QR", await pc.locator("#vivo-qr svg").count(), 1);
  igual("WhatsApp lleva el enlace", decodeURIComponent(await pc.getAttribute("#vivo-whatsapp", "href")).includes(enlace), true);

  jv.move("e4");
  await foto(pc, jv.fen(), ESQ0);
  await esperarJugadas(pc, 1);

  const ver = await abrir(browser, "tablero-vivo.html#" + codigo, null, { width: 390, height: 844 });
  const pv = ver.page;
  await pv.waitForFunction(() => !document.getElementById("partida").hidden, null, { timeout: 8000 });
  igual("quien llega tarde pide la partida y la recibe entera", await pv.textContent("#jugadas"), "1. e4");
  igual("dice que está en vivo", await pv.textContent("#conexion"), "● En vivo");
  igual("los nombres llegan como texto, sin ejecutar nada",
    await pv.evaluate(() => [document.getElementById("jugador-abajo").textContent, document.getElementById("jugador-arriba").textContent, !!window.__xss, document.querySelectorAll("#visor img").length]),
    ['Blancas: <img src=x onerror="window.__xss=1">Ana', "Negras: Beto", false, 0]);
  igual("el tablero tiene sus 64 casillas y la pieza en e4", await pv.evaluate(() => document.querySelectorAll("#tablero > div").length), 64);
  igual("dice la última jugada (y cuánto la pensó), también al lector de pantalla", /^Última jugada: 1\. e4\. Juegan las negras\. La pensó \d+:\d\d\.$/.test(await pv.textContent("#ultima")), true);
  igual("y quién está pensando, con su reloj", /^Piensan las negras: \d+:\d\d$/.test(await pv.textContent("#reloj-turno")), true);
  igual("cabe en el celular sin correrse de lado", await pv.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  for (const san of ["e5", "Nf3"]) { jv.move(san); await foto(pc, jv.fen(), ESQ0); await esperarJugadas(pc, jv.history().length); }
  await pv.waitForFunction(() => document.getElementById("jugadas").textContent === "1. e4 e5 2. Cf3", null, { timeout: 8000 }).catch(() => {});
  igual("cada jugada nueva le llega sola a quien mira", await pv.textContent("#jugadas"), "1. e4 e5 2. Cf3");
  {
    const estados = eventos.filter((x) => x.event === "estado" && x.nombre === "tablero-vivo-" + codigo).map((x) => x.payload);
    const conE5 = estados.find((x) => x.v === 2 && (x.san || []).includes("e5")), conCf3 = estados.find((x) => x.v === 2 && (x.san || []).includes("Nf3"));
    igual("una jugada más viaja sola: solo lo nuevo, no la partida entera", [conE5 && [conE5.desde, conE5.san], conCf3 && [conCf3.desde, conCf3.san]], [[1, ["e5"]], [2, ["Nf3"]]]);
    const entera = estados.filter((x) => x.v === 1).pop();
    igual("y pesa menos de 200 bytes", !!conCf3 && JSON.stringify(conCf3).length < 200, true);
    igual("la entera va cuando la piden (quien llega tarde)", !!entera && /1\. e4/.test(entera.pgn), true);
  }
  // Repasar jugada a jugada.
  await pv.click("#ir-atras");
  igual("«◀» repasa la jugada anterior: el caballo todavía no está en f3", [/^Repasando: jugada 2 de 3, e5 \(pensó \d+:\d\d\)\.$/.test(await pv.textContent("#paso")),
    await pv.evaluate(() => !!document.querySelector('#tablero [data-square="f3"] span')), await pv.locator("#ir-vivo").isVisible()], [true, false, true]);
  await pv.click("#ir-inicio");
  igual("«⏮» va a la posición del principio", [await pv.textContent("#paso"), await pv.evaluate(() => !!document.querySelector('#tablero [data-square="e2"] span'))], ["Repasando: la posición del principio.", true]);
  await pv.keyboard.press("End");
  igual("y con el teclado (Fin) vuelve al vivo", [await pv.textContent("#paso"), await pv.locator("#ir-vivo").isVisible()], ["En vivo: la última jugada.", false]);
  // La evaluación de Stockfish, si se pide.
  await pv.check("#ver-motor");
  await pv.waitForFunction(() => /^Stockfish: /.test(document.getElementById("evaluacion-texto").textContent), null, { timeout: 60000 }).catch(() => {});
  igual("«Ver la evaluación de Stockfish» la muestra, con la barra", [/^Stockfish: (Igualado|[+−])/.test(await pv.textContent("#evaluacion-texto")), await pv.locator("#evaluacion").isVisible()], [true, true]);
  await pv.uncheck("#ver-motor");
  igual("y se apaga", await pv.locator("#evaluacion").isVisible(), false);
  await pc.click("#btn-deshacer");
  await pv.waitForFunction(() => document.getElementById("jugadas").textContent === "1. e4 e5", null, { timeout: 8000 }).catch(() => {});
  igual("y también «Deshacer»", await pv.textContent("#jugadas"), "1. e4 e5");

  igual("las blancas abajo: a8 arriba a la izquierda y h1 abajo a la derecha", await pv.evaluate(() => {
    const c = document.querySelectorAll("#tablero > div");
    return [c[0].dataset.square, c[63].dataset.square];
  }), ["a8", "h1"]);
  igual("las coordenadas van por fuera del tablero, como en todo el sitio", await pv.evaluate(() => document.querySelectorAll(".coord-fuera").length >= 16), true);
  await pv.click("#girar");
  igual("«Girar el tablero» deja las negras abajo: h1 arriba a la izquierda y a8 abajo a la derecha", await pv.evaluate(() => {
    const c = document.querySelectorAll("#tablero > div");
    return [c[0].dataset.square, c[63].dataset.square];
  }), ["h1", "a8"]);
  igual("y los nombres cambian de lado con sus piezas", [await pv.textContent("#jugador-arriba"), await pv.textContent("#jugador-abajo")], ['Blancas: <img src=x onerror="window.__xss=1">Ana', "Negras: Beto"]);

  // Un mensaje viejo que llega tarde no pisa lo nuevo.
  await pv.evaluate(() => window.__canales[Object.keys(window.__canales)[0]].estado({ payload: { v: 1, pgn: "1. d4", blancas: "", negras: "", t: 1 } }));
  igual("lo viejo que llega tarde no pisa lo nuevo", await pv.textContent("#jugadas"), "1. e4 e5");
  // Una partida que no es legal no se pinta.
  await pv.evaluate(() => window.__canales[Object.keys(window.__canales)[0]].estado({ payload: { v: 1, pgn: "1. e5", blancas: "", negras: "", t: Date.now() + 9e9 } }));
  igual("una partida que no es legal no se pinta", await pv.textContent("#jugadas"), "1. e4 e5");

  await pc.click("#btn-vivo-parar");
  const antes = mandados;
  jv.undo(); jv.move("Nf3");
  await foto(pc, jv.fen(), ESQ0);
  await esperarJugadas(pc, 3);
  igual("después de «Dejar de transmitir», la cámara sigue anotando", await jugadasDe(pc), "1. e4 e5 2. Cf3");
  igual("pero ya no manda nada", mandados, antes);
  igual("y quien mira se queda con la última que le llegó", await pv.textContent("#jugadas"), "1. e4 e5");

  await pc.click("#btn-vivo");
  igual("al volver a transmitir, usa el mismo código (quien ya tiene el enlace no lo pierde)", await pc.textContent("#vivo-codigo"), codigo);
  await pv.waitForFunction(() => document.getElementById("jugadas").textContent === "1. e4 e5 2. Cf3", null, { timeout: 8000 }).catch(() => {});
  igual("y quien mira se pone al día", await pv.textContent("#jugadas"), "1. e4 e5 2. Cf3");
  // Si a quien mira se le pierde un mensaje, lo nota en el siguiente, pide la partida y se pone al día.
  sordas.add(pv);
  jv.move("Nc6"); await foto(pc, jv.fen(), ESQ0); await esperarJugadas(pc, 4);
  await new Promise((r) => setTimeout(r, 900)); // lo que se manda 600 ms después de la jugada, también perdido
  sordas.delete(pv);
  const antesHueco = eventos.length;
  jv.move("Bc4"); await foto(pc, jv.fen(), ESQ0); await esperarJugadas(pc, 5);
  await pv.waitForFunction(() => document.getElementById("jugadas").textContent === "1. e4 e5 2. Cf3 Cc6 3. Ac4", null, { timeout: 8000 }).catch(() => {});
  igual("si se pierde un mensaje, quien mira pide la partida y se pone al día", [await pv.textContent("#jugadas"), eventos.slice(antesHueco).some((x) => x.event === "pedir")], ["1. e4 e5 2. Cf3 Cc6 3. Ac4", true]);
  await pc.click("#btn-vivo-nuevo");
  igual("«Usar un código nuevo» cambia el código", (await pc.textContent("#vivo-codigo")) !== codigo, true);
  igual("sin errores en la consola (cámara)", cam.errores, []);
  igual("sin errores en la consola (quien mira)", ver.errores, []);
  await cerrar(ver);
  await cerrar(cam);

  console.log("\nUn torneo de Pareo Integral: cada cámara en su mesa, todas las mesas juntas");
  {
    // La mesa física: la misma cuenta que Pareo Integral (PareoEvento.mesaFisica).
    const PE = require("../js/pareo/evento.js");
    const pc0 = (await abrir(browser, "camara-tablero.html")).page;
    const iguales = await pc0.evaluate((casos) => casos.map(([mi, k]) => window.PartidaEnVivo.mesaFisica({ mesaInicial: mi }, k)),
      [[undefined, 0], [1, 3], [5, 0], [5, 2], [7.6, 1], ["12", 4]]);
    igual("las mesas se numeran igual que en Pareo Integral", iguales,
      [[undefined, 0], [1, 3], [5, 0], [5, 2], [7.6, 1], ["12", 4]].map(([mi, k]) => PE.mesaFisica({ mesaInicial: mi }, k)));
    await cerrar({ page: pc0, ctx: pc0.context() });

    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
    const ID = "0b9f3c2e-7a41-4d8e-9c55-1f2a3b4c5d6e";
    const jugadores = [["j1", "Ana Mora"], ["j2", "Beto Solís"], ["j3", "Carla Ruiz"], ["j4", '<img src=x onerror="window.__xss=1">Dani'], ["j5", "Eva Rojas"]]
      .map(([id, nombre]) => ({ id, nombre }));
    const ronda1 = { mesas: [{ b: "j1", n: "j2" }, { b: "j3", n: "j4" }, { b: "j5", n: null }] };
    const ronda2 = { mesas: [{ b: "j4", n: "j1" }, { b: "j2", n: "j3" }, { b: "j5", n: null }] };
    const torneo = (rondas) => [{ id: ID, nombre: "Abierto de prueba", fecha: hoy, rondas: rondas.length, oculto: false,
      datos: { nombre: "Abierto de prueba", tipo: "individual", mesaInicial: 5, jugadores, rondas } },
      { id: "5d6e0b9f-3c2e-4d8e-9c55-7a411f2a3b4c", nombre: "Por equipos", fecha: hoy, rondas: 1, oculto: false,
        datos: { nombre: "Por equipos", tipo: "equipos", jugadores: [], rondas: [ronda1] } }];
    const conTorneo = async (pg, rondas) => pg.evaluate((d) => { window.__pareo = d; }, torneo(rondas));

    // La cámara A, en la mesa 5 (la primera: el torneo arranca en la 5).
    const A = await abrir(browser, "camara-tablero.html");
    const pa = A.page;
    await pa.waitForSelector("#app:not(.hidden)");
    await conTorneo(pa, [ronda1]);
    await pa.click("#btn-torneo-lista");
    await pa.waitForSelector("#torneo-lista button");
    igual("«Ver los torneos de estos días» los muestra", await pa.locator("#torneo-lista button").allTextContents(), ["Abierto de prueba · ronda 1", "Por equipos · ronda 1"]);
    await pa.fill("#torneo-enlace", "https://ajedrez-integral.com/torneos-pareo.html#t=" + ID);
    await pa.click("#btn-torneo");
    await pa.waitForFunction(() => !document.getElementById("torneo-elegido").hidden);
    igual("con el enlace del torneo, dice su nombre y su ronda", [await pa.textContent("#torneo-nombre"), await pa.textContent("#torneo-ronda")], ["Abierto de prueba", "1"]);
    igual("las mesas de la ronda, numeradas como en la sala y sin la de «libre»", await pa.locator("#torneo-mesa option").allTextContents(),
      ["Elige la mesa…", "Mesa 5: Ana Mora – Beto Solís", 'Mesa 6: Carla Ruiz – <img src=x onerror="window.__xss=1">Dani']);
    await pa.selectOption("#torneo-mesa", "5");
    igual("al elegir la mesa, los nombres salen solos (y no se editan)", [await pa.inputValue("#vivo-blancas"), await pa.inputValue("#vivo-negras"), await pa.evaluate(() => document.getElementById("vivo-blancas").readOnly)], ["Ana Mora", "Beto Solís", true]);
    const ja = new Chess();
    await foto(pa, ja.fen(), ESQ0);
    await esperarAviso(pa, /esquinas/);
    await tocar(pa, aLienzo(ESQ0));
    await pa.click("#btn-calibrar");
    await esperarAviso(pa, /Calibrado/);
    await pa.click("#btn-vivo");
    const codigoT = await pa.inputValue("#torneo-codigo");
    igual("transmite con el código del torneo, en su mesa", await pa.textContent("#vivo-codigo"), codigoT + " · mesa 5");
    const enlaceT = await pa.getAttribute("#vivo-enlace", "href");
    igual("el enlace lleva el código y el torneo", enlaceT.endsWith("/tablero-vivo.html#" + codigoT + "&t=" + ID), true);

    // La cámara B, en otra computadora: se une con el código de la A.
    const Bc = await abrir(browser, "camara-tablero.html");
    const pbb = Bc.page;
    await pbb.waitForSelector("#app:not(.hidden)");
    await conTorneo(pbb, [ronda1]);
    await pbb.fill("#torneo-codigo-unirse", codigoT);
    await pbb.fill("#torneo-enlace", ID);
    await pbb.click("#btn-torneo");
    await pbb.waitForFunction(() => !document.getElementById("torneo-elegido").hidden);
    igual("la otra cámara se une al mismo código", await pbb.inputValue("#torneo-codigo"), codigoT);
    await pbb.selectOption("#torneo-mesa", "6");
    const jb = new Chess();
    await foto(pbb, jb.fen(), ESQ0);
    await esperarAviso(pbb, /esquinas/);
    await tocar(pbb, aLienzo(ESQ0));
    await pbb.click("#btn-calibrar");
    await esperarAviso(pbb, /Calibrado/);
    await pbb.click("#btn-vivo");

    // Quien mira: todas las mesas.
    const W = await abrir(browser, "tablero-vivo.html#" + codigoT + "&t=" + ID, null, { width: 1280, height: 1000 });
    const pw = W.page;
    await pw.evaluate((d) => { window.__pareo = d; }, torneo([ronda1]));
    await pw.evaluate(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
    await pw.waitForFunction(() => document.querySelectorAll("#mesas-lista button[data-mesa]").length === 2, null, { timeout: 8000 }).catch(() => {});
    igual("quien mira ve las dos mesas del torneo", await pw.$$eval("#mesas-lista button[data-mesa]", (b) => b.map((x) => x.dataset.mesa)), ["5", "6"]);
    igual("con el nombre del torneo arriba", await pw.textContent("#torneo-titulo"), "Abierto de prueba");
    ja.move("e4"); await foto(pa, ja.fen(), ESQ0); await esperarJugadas(pa, 1);
    jb.move("d4"); await foto(pbb, jb.fen(), ESQ0); await esperarJugadas(pbb, 1);
    await pw.waitForFunction(() => /1\. d4/.test(document.querySelector('#mesas-lista button[data-mesa="6"]').textContent), null, { timeout: 8000 }).catch(() => {});
    igual("cada mesa trae su partida", await pw.$$eval("#mesas-lista button[data-mesa]", (b) => b.map((x) => x.querySelectorAll("p")[2].textContent)),
      ["Última jugada: 1. e4. Juegan las negras.", "Última jugada: 1. d4. Juegan las negras."]);
    // Una jugada en la mesa 5 vuelve a armar solo su tarjeta: la de la mesa 6 sigue siendo la misma.
    await pw.evaluate(() => { for (const b of document.querySelectorAll("#mesas-lista button[data-mesa]")) b.__marca = 1; });
    ja.move("e5"); await foto(pa, ja.fen(), ESQ0); await esperarJugadas(pa, 2);
    await pw.waitForFunction(() => /e5/.test(document.querySelector('#mesas-lista button[data-mesa="5"]').textContent), null, { timeout: 8000 }).catch(() => {});
    igual("una jugada en una mesa repinta solo esa tarjeta, no todas las de la sala",
      await pw.evaluate(() => ["5", "6"].map((m) => [/e5/.test(document.querySelector('#mesas-lista button[data-mesa="' + m + '"]').textContent), document.querySelector('#mesas-lista button[data-mesa="' + m + '"]').__marca || 0])), [[true, 0], [false, 1]]);
    igual("los nombres del torneo van como texto, sin ejecutar nada",
      await pw.evaluate(() => [document.querySelector('#mesas-lista button[data-mesa="6"]').textContent.includes('<img src=x onerror="window.__xss=1">Dani'), !!window.__xss, document.querySelectorAll("#mesas img").length]), [true, false, 0]);
    await pw.click('#mesas-lista button[data-mesa="6"]');
    igual("al tocar una mesa se ve en grande, con su número y su ronda", [await pw.textContent("#mesa-titulo"), await pw.textContent("#jugadas"), await pw.locator("#mesas").isVisible()], ["Mesa 6 · ronda 1", "1. d4", false]);
    await pw.click("#volver");
    igual("«Todas las mesas» vuelve a la cuadrícula", await pw.locator("#mesas").isVisible(), true);

    // La ronda 2: la cámara A sigue en la mesa 5, ahora con otros jugadores.
    await conTorneo(pa, [ronda1, ronda2]);
    await pa.click("#btn-torneo-ronda");
    await esperarAviso(pa, /ronda 2/);
    igual("«Buscar ronda nueva» avisa quién juega ahora en su mesa", await aviso(pa),
      'Empezó la ronda 2: en la mesa 5 juegan <img src=x onerror="window.__xss=1">Dani y Ana Mora. Pon las piezas en la posición inicial y toca «Calibrar con la posición inicial».');
    igual("la partida que se estaba anotando sigue con los nombres de su ronda", [await pa.inputValue("#vivo-blancas"), await pa.inputValue("#vivo-negras")], ["Ana Mora", "Beto Solís"]);
    const ja2 = new Chess();
    await foto(pa, ja2.fen(), ESQ0);
    await pa.click("#btn-calibrar");
    await esperarAviso(pa, /Calibrado/);
    igual("al calibrar la partida nueva, los nombres pasan a los de la ronda 2", [await pa.inputValue("#vivo-blancas"), await pa.inputValue("#vivo-negras")], ['<img src=x onerror="window.__xss=1">Dani', "Ana Mora"]);
    ja2.move("c4"); await foto(pa, ja2.fen(), ESQ0); await esperarJugadas(pa, 1);
    await pw.waitForFunction(() => /c4/.test(document.querySelector('#mesas-lista button[data-mesa="5"]').textContent), null, { timeout: 8000 }).catch(() => {});
    // Proyectar en la sala.
    await pw.click("#btn-proyectar");
    igual("«Proyectar en la sala» pone las mesas en grande, en toda la pantalla", [await pw.evaluate(() => document.getElementById("mesas").classList.contains("proyector")),
      await pw.getAttribute("#btn-proyectar", "aria-pressed"), await pw.textContent("#btn-proyectar-texto"), await pw.locator("#mesas-lista button[data-mesa]").count()], [true, "true", "Dejar de proyectar", 2]);
    await pw.click("#btn-proyectar");
    igual("y se deja", await pw.evaluate(() => document.getElementById("mesas").classList.contains("proyector")), false);
    igual("la partida nueva de la mesa 5 llega con los jugadores de la ronda 2",
      await pw.$eval('#mesas-lista button[data-mesa="5"]', (b) => b.querySelectorAll("p")[1].textContent), '<img src=x onerror="window.__xss=1">Dani – Ana Mora');

    // Algo que no sale de ninguna jugada legal (una torre que salta su peón):
    // se le avisa al árbitro, sin las casillas.
    const ilegal = new Chess(ja2.fen());
    ilegal.remove("a1"); ilegal.put({ type: "r", color: "w" }, "a5");
    const antesAlerta = eventos.length;
    await foto(pa, ilegal.fen(), ESQ0);
    await esperarAviso(pa, /No reconozco/);
    igual("una posible jugada ilegal se dice, y se le avisa al árbitro", (await aviso(pa)).includes("puede ser una jugada ilegal") && (await aviso(pa)).endsWith("Se le avisó al árbitro."), true);
    const alerta = eventos.slice(antesAlerta).find((x) => x.event === "alerta");
    igual("el aviso al árbitro dice el torneo, la ronda y la mesa, pero no las casillas", alerta && [alerta.payload.torneo, alerta.payload.ronda, alerta.payload.mesa, /a1|a5/.test(JSON.stringify(alerta.payload))], [ID, 2, 5, false]);
    const fotoIlegal = eventos.slice(antesAlerta).find((x) => x.event === "foto");
    igual("con el aviso, al árbitro le llega una foto del tablero (una JPEG chica, con su mesa y su motivo)",
      fotoIlegal && [fotoIlegal.payload.mesa, fotoIlegal.payload.motivo, /^data:image\/jpeg;base64,/.test(fotoIlegal.payload.img), fotoIlegal.payload.img.length < 120000], [5, "ilegal", true, true]);
    igual("y en la cámara queda en «Fotos del tablero», para bajarla", await pa.evaluate(() => [document.getElementById("fotos").checkVisibility(),
      document.querySelectorAll("#fotos-lista a[download] img").length, document.querySelector("#fotos-lista span").textContent.startsWith("Posible jugada ilegal")]), [true, 1, true]);
    // La foto es el tablero enderezado, visto desde arriba con la fila 8
    // arriba: la torre blanca que saltó está en a5, una casilla oscura que
    // se ve mucho más clara que la a3 (oscura y vacía); y arriba, en la fila
    // 8, las piezas negras.
    igual("la foto es el tablero enderezado, como un diagrama (a5 tiene la torre blanca)", await pa.evaluate(async (src) => {
      const im = new Image(); im.src = src; await im.decode();
      const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
      const luz = (col, fila) => { const d = g.getImageData(col * 32 + 12, (8 - fila) * 32 + 12, 8, 8).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
      return [luz(0, 5) > luz(0, 3) + 60, luz(4, 8) + 60 < luz(4, 1)];
    }, fotoIlegal.payload.img), [true, true]);
    await foto(pa, ja2.fen(), ESQ0);
    igual("el aviso de la jugada ilegal va con su tipo", alerta && alerta.payload.tipo, "ilegal");

    // La triple repetición: los caballos van y vuelven dos veces. No se marca
    // sola (se reclama), pero se dice y le llega al árbitro.
    const antesRep = eventos.length;
    for (const x of ["Nc6", "Nf3", "Nb8", "Ng1", "Nc6", "Nf3", "Nb8", "Ng1"]) {
      ja2.move(x); await foto(pa, ja2.fen(), ESQ0); await esperarJugadas(pa, ja2.history().length);
    }
    igual("la triple repetición se dice, sin marcar el resultado", [(await aviso(pa)).includes("se repitió tres veces"), (await aviso(pa)).endsWith("Se le avisó al árbitro."), await pa.textContent("#resultado-texto")],
      [true, true, "Sigue en juego."]);
    const rep = eventos.slice(antesRep).filter((x) => x.event === "alerta");
    igual("y al árbitro le llega una vez, con su tipo", rep.map((x) => [x.payload.mesa, x.payload.tipo]), [[5, "repeticion3"]]);
    igual("también con su foto", eventos.slice(antesRep).filter((x) => x.event === "foto").map((x) => x.payload.motivo), ["repeticion3"]);

    // El resultado: lo marca quien maneja la cámara y le llega a quien mira.
    const antesRes = eventos.length;
    await pa.click('[data-resultado="1-0"]');
    igual("«1-0» marca el resultado", [await pa.textContent("#resultado-texto"), await pa.getAttribute('[data-resultado="1-0"]', "aria-pressed")], ["Terminó: ganan las blancas (1-0).", "true"]);
    igual("con el resultado se toma la foto del tablero, y le llega al árbitro", [eventos.slice(antesRes).filter((x) => x.event === "foto").map((x) => x.payload.motivo),
      await pa.locator("#fotos-lista img").count()], [["resultado"], 3]);
    await pw.waitForFunction(() => /Terminó: ganan las blancas/.test(document.querySelector('#mesas-lista button[data-mesa="5"]').textContent), null, { timeout: 8000 }).catch(() => {});
    igual("y quien mira lo ve en la mesa", await pw.$eval('#mesas-lista button[data-mesa="5"]', (b) => b.querySelectorAll("p")[2].textContent), "Última jugada: 5. Cg1. Juegan las negras. Terminó: ganan las blancas (1-0).");
    igual("el PGN que viaja lleva el resultado", await pa.evaluate(() => /\[Result "1-0"\]/.test(localStorage.getItem("camara_partida_v1_0"))), true);
    await pa.click("#btn-deshacer");
    igual("«Deshacer» lo borra: la partida sigue", [await pa.textContent("#resultado-texto"), await pa.getAttribute('[data-resultado="1-0"]', "aria-pressed")], ["Sigue en juego.", "false"]);

    // El árbitro adjunto: su cámara no está en ninguna mesa; apunta a un
    // tablero de la sala y pregunta qué mesa es.
    const ADJ = await abrir(browser, "camara-tablero.html");
    const pj = ADJ.page;
    await pj.waitForSelector("#app:not(.hidden)");
    await conTorneo(pj, [ronda1, ronda2]);
    await pj.fill("#torneo-codigo-unirse", codigoT);
    await pj.fill("#torneo-enlace", ID);
    await pj.click("#btn-torneo");
    await pj.waitForFunction(() => !document.getElementById("torneo-elegido").hidden);
    await foto(pj, jb.fen(), TABLEROS["visto de lado (un trapecio)"]);
    await esperarAviso(pj, /esquinas/);
    await tocar(pj, aLienzo(TABLEROS["visto de lado (un trapecio)"]));
    const preguntar = async () => {
      await pj.evaluate(() => { document.getElementById("que-mesa-msg").textContent = ""; });
      await pj.click("#btn-que-mesa");
      await pj.waitForFunction(() => /^(Es|Parece|No se parece|Ninguna)/.test(document.getElementById("que-mesa-msg").textContent), null, { timeout: 8000 }).catch(() => {});
      return pj.textContent("#que-mesa-msg");
    };
    igual("«¿Qué mesa es?» la encuentra entre las que transmiten, sin calibrar, y dice que coincide", await preguntar(),
      'Es la mesa 6 (Carla Ruiz – <img src=x onerror="window.__xss=1">Dani): coincide con la partida transmitida (64 de 64 casillas).');
    igual("pidió las partidas por el canal del torneo", eventos.some((x) => x.nombre.endsWith(codigoT) && x.event === "pedir"), true);
    const movida = new Chess(jb.fen()); movida.remove("h2");
    await foto(pj, movida.fen(), TABLEROS["visto de lado (un trapecio)"]);
    igual("si algo no calza, dice qué mesa parece y cuál casilla", [await preguntar(), await pj.$$eval("#que-mesa-lista li", (l) => l.map((x) => x.textContent))],
      ['Parece la mesa 6 (Carla Ruiz – <img src=x onerror="window.__xss=1">Dani), pero 1 casilla no coincide con la partida transmitida: puede que la cámara de esa mesa haya anotado mal o que se haya movido una pieza.', ["Falta el peón blanco en h2."]]);
    await foto(pj, "4k3/8/8/8/8/8/8/4K3 w - - 0 1", TABLEROS["visto de lado (un trapecio)"]);
    igual("un tablero que no es de ninguna mesa, lo dice", (await preguntar()).startsWith("No se parece a ninguna de las 2 partidas"), true);
    igual("los nombres, como texto", await pj.evaluate(() => !!window.__xss || document.querySelectorAll("#que-mesa-msg img").length), 0);
    igual("sin errores en la consola (adjunto)", ADJ.errores, []);
    await cerrar(ADJ);

    // El QR de cada mesa: una tarjeta por mesa de la ronda, que abre la cámara en esa mesa.
    await pa.evaluate(() => { window.print = () => { window.__impreso = (window.__impreso || 0) + 1; }; });
    await pa.click("#btn-torneo-qr");
    await pa.waitForFunction(() => window.__impreso, null, { timeout: 8000 }).catch(() => {});
    igual("«Imprimir el QR de cada mesa» arma una tarjeta por mesa y manda a imprimir",
      [await pa.$$eval("#hoja-qr .hoja-qr-numero", (x) => x.map((y) => y.textContent)), await pa.evaluate(() => window.__impreso), await pa.locator("#hoja-qr svg").count()], [["Mesa 5", "Mesa 6"], 1, 2]);
    igual("cada QR lleva el torneo, el código y su mesa (después del #)", (await pa.getAttribute("#hoja-qr .hoja-qr-mesa:nth-child(2)", "data-enlace")).endsWith("/camara-tablero.html#t=" + ID + "&c=" + codigoT + "&m=6&r=0"), true);
    await pa.emulateMedia({ media: "print" });
    igual("al imprimir sale solo la hoja, con la marca de agua", await pa.evaluate(() => ["hoja-qr", "hoja-qr-marca", "app"].map((id) => document.getElementById(id).checkVisibility())), [true, true, false]);
    await pa.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await pa.emulateMedia({ media: "screen" });
    igual("en la pantalla no se ve", await pa.evaluate(() => [document.getElementById("hoja-qr").checkVisibility(), document.getElementById("app").checkVisibility()]), [false, true]);
    igual("sin errores en la consola", [A.errores, Bc.errores, W.errores], [[], [], []]);
    await cerrar(W); await cerrar(Bc); await cerrar(A);

    // Un celular SIN CUENTA que escanea el QR de la mesa 6 (con 10 minutos
    // de retraso): modo mesa, con el torneo, el código y la mesa puestos, transmitiendo.
    const Q = await abrir(browser, "camara-tablero.html#t=" + ID + "&c=" + codigoT + "&m=6&r=10", { sinSesion: true }, { width: 412, height: 900 }, { f: (d) => { window.__pareo = d; }, arg: torneo([ronda1, ronda2]) });
    const pq = Q.page;
    await pq.waitForFunction(() => !document.getElementById("vivo-encendido").hidden, null, { timeout: 8000 }).catch(() => {});
    igual("sin cuenta, por el QR: su torneo, su mesa y transmitiendo con el código y el retraso del torneo",
      [await pq.textContent("#torneo-nombre"), await pq.inputValue("#torneo-mesa"), await pq.textContent("#vivo-codigo")], ["Abierto de prueba", "6", codigoT + " · mesa 6 · con 10 minutos de retraso"]);
    igual("dice arriba qué mesa transmite", [await pq.isVisible("#mesa-titulo-qr"), await pq.textContent("#mesa-titulo-qr")], [true, "Mesa 6 · Abierto de prueba"]);
    igual("no deja elegir otro torneo, mesa, código ni retraso, ni parar",
      await pq.evaluate(() => ["torneo-elegir", "torneo-mesa", "torneo-codigo", "btn-torneo-quitar", "btn-torneo-qr", "vivo-retraso", "btn-vivo-parar", "btn-vivo-nuevo", "header"]
        .map((id) => document.getElementById(id).checkVisibility())), [false, false, false, false, false, false, false, false, false]);
    igual("y sigue leyendo el tablero: «Buscar el tablero» a la vista", await pq.evaluate(() => document.getElementById("btn-buscar").checkVisibility()), true);
    igual("no toca nada de la Academia: solo lee el torneo publicado", [...new Set(await pq.evaluate(() => window.__tablas || []))], ["pareo_publicados"]);
    igual("el QR se queda en la dirección (al recargar sigue en su mesa)", await pq.evaluate(() => location.hash), "#t=" + ID + "&c=" + codigoT + "&m=6&r=10");
    igual("sin errores en la consola (por el QR)", Q.errores, []);
    await cerrar(Q);

    // Sin cuenta y con un QR que no es válido: no hay modo mesa, va al login.
    const Z = await abrir(browser, "camara-tablero.html#t=" + ID + "&c=XX&m=6", { sinSesion: true });
    await Z.page.waitForURL(/login\.html/, { timeout: 8000 }).catch(() => {});
    igual("sin cuenta y con un QR roto, va al login", /\/login\.html\?next=camara-tablero\.html/.test(Z.page.url()), true);
    await cerrar(Z);
  }

  console.log("\nEl retraso de la transmisión");
  {
    const R = await abrir(browser, "camara-tablero.html");
    const pr = R.page;
    await pr.waitForSelector("#app:not(.hidden)");
    for (const j of ["e4", "e5"]) { await pr.fill("#jugada-mano", j); await pr.click("#form-anotar button[type=submit]"); }
    await pr.selectOption("#vivo-retraso", "5");
    await pr.click("#btn-vivo");
    const cod = (await pr.textContent("#vivo-codigo")).split(" ")[0];
    igual("con retraso, lo dice junto al código", await pr.textContent("#vivo-codigo"), cod + " · con 5 minutos de retraso");
    const RV = await abrir(browser, "tablero-vivo.html#" + cod);
    const prv = RV.page;
    await prv.waitForFunction(() => !document.getElementById("partida").hidden, null, { timeout: 8000 }).catch(() => {});
    igual("quien mira todavía no ve las jugadas de hace menos de 5 minutos", [await prv.textContent("#jugadas"), await prv.textContent("#retraso-aviso")], ["Todavía no se ha jugado nada.", "Con 5 minutos de retraso"]);
    // Pasan 6 minutos (el reloj de la cámara se adelanta): salen solas.
    await pr.evaluate(() => { const real = Date.now; Date.now = () => real() + 6 * 60000; });
    await prv.waitForFunction(() => document.getElementById("jugadas").textContent === "1. e4 e5", null, { timeout: 12000 }).catch(() => {});
    igual("cuando cumplen su tiempo, salen solas", await prv.textContent("#jugadas"), "1. e4 e5");
    await pr.fill("#jugada-mano", "Nf3"); await pr.click("#form-anotar button[type=submit]");
    await prv.waitForTimeout(800);
    igual("la jugada recién hecha todavía no", await prv.textContent("#jugadas"), "1. e4 e5");
    await pr.click('[data-resultado="1-0"]');
    await prv.waitForFunction(() => document.getElementById("jugadas").textContent === "1. e4 e5 2. Cf3", null, { timeout: 8000 }).catch(() => {});
    igual("al terminar la partida, se ve entera", [await prv.textContent("#jugadas"), /Terminó: ganan las blancas/.test(await prv.textContent("#ultima"))], ["1. e4 e5 2. Cf3", true]);
    igual("el retraso se recuerda", await pr.evaluate(() => localStorage.getItem("camara_retraso_v1")), "5");
    igual("sin errores en la consola", [R.errores, RV.errores], [[], []]);
    await cerrar(RV); await cerrar(R);
  }

  console.log("\nEl reloj de la partida");
  {
    const R = await abrir(browser, "camara-tablero.html");
    const pr = R.page;
    await pr.waitForSelector("#app:not(.hidden)");
    // El reloj del aparato, adelantado a pedido.
    await pr.evaluate(() => { const real = Date.now; window.__mas = 0; Date.now = () => real() + window.__mas; });
    const pasan = async (ms) => { await pr.evaluate((ms) => { window.__mas += ms; }, ms); await pr.waitForTimeout(450); };
    const tiempos = () => pr.evaluate(() => ["w", "b"].map((c) => document.querySelector("#reloj-" + c + " [data-tiempo]").textContent + (document.getElementById("reloj-" + c).getAttribute("aria-current") === "true" ? "*" : "")));
    igual("sin empezar, no hay tiempos", await pr.evaluate(() => document.getElementById("reloj-tiempos").checkVisibility()), false);
    await pr.selectOption("#reloj-ritmo", "3+2");
    await pr.click("#btn-reloj");
    igual("al empezar, 3:00 cada uno y corre el de las blancas", await tiempos(), ["3:00*", "3:00"]);
    await pasan(10000);
    igual("pasan 10 s: se le restan a las blancas", await tiempos(), ["2:50*", "3:00"]);
    await pr.fill("#jugada-mano", "e4"); await pr.click("#form-anotar button[type=submit]");
    igual("con la jugada, suma el incremento y pasa a correr el de las negras", await tiempos(), ["2:52", "3:00*"]);
    await pr.click("#btn-reloj-pausa");
    await pasan(30000);
    igual("en pausa no corre ninguno, y el botón lo dice", [await tiempos(), await pr.getAttribute("#btn-reloj-pausa", "aria-pressed")], [["2:52", "3:00"], "true"]);
    await pr.click("#btn-vivo");
    const cod = (await pr.textContent("#vivo-codigo")).split(" ")[0];
    const RV = await abrir(browser, "tablero-vivo.html#" + cod);
    const prv = RV.page;
    await prv.waitForFunction(() => /Blancas/.test(document.getElementById("reloj-partida").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("quien mira ve los dos tiempos", await prv.textContent("#reloj-partida"), "⏱ Blancas 2:52 · Negras 3:00");
    await pr.click("#btn-reloj-pausa");
    await prv.waitForFunction(() => /corre/.test(document.getElementById("reloj-partida").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("y de quién corre", await prv.textContent("#reloj-partida"), "⏱ Blancas 2:52 · Negras 3:00 (corre)");
    await pasan(181000);
    igual("se le cae la bandera a las negras: ganan las blancas", [await pr.textContent("#reloj-msg"), await pr.textContent("#resultado-texto"), await tiempos()],
      ["Se le cayó la bandera a las negras: ganan las blancas. Lo confirma el árbitro.", "Terminó: ganan las blancas (1-0).", ["2:52", "0:00"]]);
    await prv.waitForFunction(() => /Terminó/.test(document.getElementById("ultima").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("a quien mira le llega el resultado y el reloj en cero", [/Terminó: ganan las blancas/.test(await prv.textContent("#ultima")), await prv.textContent("#reloj-partida")], [true, "⏱ Blancas 2:52 · Negras 0:00"]);
    // Sin con qué dar mate, la bandera da tablas.
    await pr.click("summary:has-text('Empezar desde otra posición')");
    await pr.fill("#posicion", "kq6/8/8/8/8/8/8/K7 b - - 0 1");
    await pr.click("#form-posicion button[type=submit]");
    igual("una partida nueva apaga el reloj", await pr.evaluate(() => document.getElementById("reloj-tiempos").checkVisibility()), false);
    await pr.click("#btn-reloj");
    await pasan(181000);
    igual("sin con qué dar mate, la bandera da tablas", [await pr.textContent("#reloj-msg"), await pr.textContent("#resultado-texto")],
      ["Se le cayó la bandera a las negras: son tablas, porque las blancas ya no pueden dar mate. Lo confirma el árbitro.", "Terminó en tablas (½-½)."]);
    // Con un caballo contra rey y peón sí hay mate posible (el peón tapa): ganan.
    await pr.fill("#posicion", "k7/p7/8/8/8/8/8/K6N b - - 0 1");
    await pr.click("#form-posicion button[type=submit]");
    await pr.click("#btn-reloj");
    await pasan(181000);
    igual("un caballo contra rey y peón: hay mate posible, ganan", await pr.textContent("#reloj-msg"), "Se le cayó la bandera a las negras: ganan las blancas. Lo confirma el árbitro.");
    igual("sin errores en la consola", [R.errores, RV.errores], [[], []]);
    await cerrar(RV); await cerrar(R);
  }

  console.log("\nEl mate se marca solo");
  {
    const M = await abrir(browser, "camara-tablero.html");
    const pm = M.page;
    await pm.waitForSelector("#app:not(.hidden)");
    for (const j of ["f3", "e5", "g4", "Dh4"]) { await pm.fill("#jugada-mano", j); await pm.click("#form-anotar button[type=submit]"); }
    igual("con mate, el resultado sale solo", await pm.textContent("#resultado-texto"), "Terminó: ganan las negras (0-1). Lo dice el tablero.");
    await pm.click('[data-resultado="1-0"]');
    igual("y no se puede marcar otro", [(await aviso(pm)).startsWith("El tablero ya dice cómo terminó"), await pm.getAttribute('[data-resultado="0-1"]', "aria-pressed")], [true, "true"]);
    igual("sin errores en la consola", M.errores, []);
    await cerrar(M);
  }

  console.log("\nQuien mira sin código, con uno malo o sin nadie transmitiendo");
  const v2 = await abrir(browser, "tablero-vivo.html", null, { width: 390, height: 844 });
  igual("sin código, pide el código", await v2.page.locator("#pedir-codigo").isVisible(), true);
  await v2.page.fill("#codigo", "abc");
  await v2.page.click("#form-codigo button[type=submit]");
  igual("un código que no es válido se dice", (await v2.page.textContent("#codigo-error")).startsWith("Ese código no es válido"), true);
  await v2.page.fill("#codigo", "zzzz2222");
  await v2.page.click("#form-codigo button[type=submit]");
  await v2.page.waitForFunction(() => !document.getElementById("esperando").hidden, null, { timeout: 12000 }).catch(() => {});
  igual("con un código al que nadie transmite, dice que está esperando (no una pantalla en blanco)", await v2.page.textContent("#conexion"), "Esperando la transmisión");
  igual("sin errores en la consola", v2.errores, []);
  await cerrar(v2);

  console.log("\nLa cámara de verdad (las falsas de Chromium): elegir cuál");
  {
    // Un navegador aparte, con dos cámaras de mentira y el permiso ya dado.
    const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
      args: ["--use-fake-device-for-media-stream=device-count=2", "--use-fake-ui-for-media-stream"] });
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 1400 }, permissions: ["camera"] });
    // La pantalla encendida (Wake Lock): un doble que cuenta los pedidos.
    await ctx.addInitScript(() => Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async (tipo) => {
      window.__pantalla = (window.__pantalla || []).concat(tipo);
      return { release: async () => {}, addEventListener() {} };
    } } }));
    const pg = await ctx.newPage();
    const errores = [];
    pg.on("pageerror", (e) => errores.push(String(e)));
    await pg.exposeFunction("__aCanal", () => {});
    await pg.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente({ is_admin: true }) }));
    await pg.goto(BASE + "/camara-tablero.html", { waitUntil: "load" });
    await pg.waitForSelector("#app:not(.hidden)");
    igual("antes de abrir la cámara no hay lista de cámaras", await pg.locator("#camara-elegir-caja").isVisible(), false);
    await pg.click("#btn-camara");
    await esperarAviso(pg, /esquinas/);
    igual("abre la cámara y pide las esquinas", (await aviso(pg)).includes("esquinas"), true);
    igual("con la cámara abierta, pide que la pantalla no se apague (y lo dice)", [await pg.evaluate(() => window.__pantalla), await pg.locator("#pantalla-encendida").isVisible()], [["screen"], true]);
    await pg.waitForFunction(() => !document.getElementById("camara-elegir-caja").hidden, null, { timeout: 8000 }).catch(() => {});
    const opciones = await pg.$$eval("#camara-elegir option", (o) => o.map((x) => x.value));
    igual("con dos cámaras, deja elegir cuál", opciones.length, 2);
    await pg.selectOption("#camara-elegir", opciones[1]);
    await pg.waitForFunction((id) => localStorage.getItem("camara_dispositivo_v1") === id, opciones[1], { timeout: 8000 }).catch(() => {});
    igual("cambia a la otra y la recuerda", await pg.evaluate(() => localStorage.getItem("camara_dispositivo_v1")), opciones[1]);
    igual("y la imagen sigue llegando", await pg.evaluate(() => { const v = document.getElementById("video"); return !!v.srcObject && v.videoWidth > 0; }), true);
    igual("le pide a la cámara lo justo: 10 imágenes por segundo y no más de 1280 de ancho", await pg.evaluate(() => {
      const s = document.getElementById("video").srcObject.getVideoTracks()[0].getSettings();
      return [s.frameRate <= 10.5, s.width <= 1280];
    }), [true, true]);
    igual("sin errores en la consola", errores, []);
    await nav.close();
  }

  console.log("\nVarias cámaras en una computadora (camaras.html)");
  {
    const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
      args: ["--use-fake-device-for-media-stream=device-count=2", "--use-fake-ui-for-media-stream"] });
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1600, height: 1400 }, permissions: ["camera"] });
    // El sonido de «necesita ayuda»: un doble que cuenta los pitidos.
    await ctx.addInitScript(() => {
      window.AudioContext = function () {
        const nodo = () => ({ connect() {}, frequency: {}, gain: {}, start() { window.__pitidos = (window.__pitidos || 0) + 1; }, stop() {} });
        return { currentTime: 0, destination: {}, createOscillator: nodo, createGain: nodo };
      };
    });
    const pg = await ctx.newPage();
    const errores = [];
    pg.on("pageerror", (e) => errores.push(String(e)));
    await pg.exposeFunction("__aCanal", () => {});
    await pg.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente({ is_admin: true }) }));
    await pg.goto(BASE + "/camaras.html", { waitUntil: "load" });
    await pg.waitForSelector("#app:not(.hidden)");
    const marcos = () => pg.$$eval("#puestos iframe", (f) => f.map((x) => x.getAttribute("src")));
    igual("arranca con dos cámaras, cada una en su cuadrito", await marcos(), ["camara-tablero.html?compacto=1&puesto=1", "camara-tablero.html?compacto=1&puesto=2"]);
    igual("cada cuadrito puede usar la cámara", await pg.$$eval("#puestos iframe", (f) => f.map((x) => x.getAttribute("allow"))), ["camera", "camera"]);
    const cuadro = async (n) => {
      const f = pg.frame({ url: new RegExp("puesto=" + n + "$") });
      await f.waitForSelector("#app:not(.hidden)");
      return f;
    };
    const f1 = await cuadro(1), f2 = await cuadro(2);
    igual("en el cuadrito no se repiten el encabezado, las explicaciones ni el pie", await f1.evaluate(() => [
      document.getElementById("header").checkVisibility(), document.querySelector("h1").checkVisibility(), document.querySelector("footer").checkVisibility(),
      document.getElementById("lienzo").checkVisibility(), document.getElementById("btn-camara").checkVisibility()]), [false, false, false, true, true]);
    await f1.evaluate(() => { window.__sigue = true; });
    await pg.click("#btn-agregar");
    igual("«Agregar una cámara» suma un cuadrito", (await marcos()).length, 3);
    await pg.click("#btn-quitar");
    igual("«Quitar una cámara» quita el último", (await marcos()).length, 2);
    igual("y los que ya estaban no se recargan (no pierden su cámara ni su calibración)", await f1.evaluate(() => window.__sigue === true), true);

    // Una cámara distinta en cada cuadrito, guardada aparte.
    await f1.click("#btn-camara");
    await f1.waitForFunction(() => /esquinas/.test(document.getElementById("aviso").textContent), null, { timeout: 8000 });
    await f2.click("#btn-camara");
    await f2.waitForFunction(() => !document.getElementById("camara-elegir-caja").hidden, null, { timeout: 8000 }).catch(() => {});
    const ops = await f2.$$eval("#camara-elegir option", (o) => o.map((x) => x.value));
    const otra = ops.find((x) => x !== (ops[0])) || ops[0];
    await f2.selectOption("#camara-elegir", ops[1]);
    await f2.waitForFunction((id) => localStorage.getItem("camara_dispositivo_v1_p2") === id, ops[1], { timeout: 8000 }).catch(() => {});
    // «Cómo van las cámaras»: con palabras y color, y suena cuando una necesita ayuda.
    const fila = (n) => pg.$eval('#resumen-lista [data-puesto="' + n + '"]', (f) => [f.dataset.estado, f.textContent]);
    await pg.waitForFunction(() => document.querySelector('#resumen-lista [data-puesto="1"]') && document.querySelector('#resumen-lista [data-puesto="1"]').dataset.estado === "sin-calibrar", null, { timeout: 8000 }).catch(() => {});
    igual("una cámara abierta y sin calibrar dice «Falta calibrar»", (await fila(1))[0], "sin-calibrar");
    await f2.fill("#torneo-enlace", "esto no es un torneo");
    await f2.click("#btn-torneo");
    await pg.waitForFunction(() => document.querySelector('#resumen-lista [data-puesto="2"]').dataset.estado === "ayuda", null, { timeout: 8000 }).catch(() => {});
    const f2ayuda = await fila(2);
    igual("la que tiene un problema dice «Necesita ayuda» y cuál", [f2ayuda[0], /Necesita ayuda.*Pega el enlace del torneo/.test(f2ayuda[1])], ["ayuda", true]);
    igual("y suena una vez", await pg.evaluate(() => window.__pitidos), 1);
    igual("arriba se cuenta", /1 necesita ayuda/.test(await pg.textContent("#resumen-cuentas")), true);
    await pg.click('#resumen-lista [data-puesto="2"] button');
    igual("«Ir a la cámara 2» lleva a su cuadrito", await pg.evaluate(() => document.activeElement && document.activeElement.id), "puesto-titulo-2");
    igual("cada cuadrito recuerda su propia cámara", await pg.evaluate(() => [localStorage.getItem("camara_dispositivo_v1_p1") !== localStorage.getItem("camara_dispositivo_v1_p2"), !!localStorage.getItem("camara_dispositivo_v1_p2")]), [true, true]);

    // El torneo: se elige en uno y el otro lo toma solo; la mesa, cada uno la suya.
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
    const ID = "0b9f3c2e-7a41-4d8e-9c55-1f2a3b4c5d6e";
    const datos = [{ id: ID, nombre: "Abierto de prueba", fecha: hoy, rondas: 1, oculto: false,
      datos: { nombre: "Abierto de prueba", tipo: "individual", jugadores: [{ id: "a", nombre: "Ana" }, { id: "b", nombre: "Beto" }, { id: "c", nombre: "Carla" }, { id: "d", nombre: "Dani" }],
        rondas: [{ mesas: [{ b: "a", n: "b" }, { b: "c", n: "d" }] }] } }];
    for (const f of [f1, f2]) await f.evaluate((d) => { window.__pareo = d; }, datos);
    await f1.fill("#torneo-enlace", ID);
    await f1.click("#btn-torneo");
    await f2.waitForFunction(() => !document.getElementById("torneo-elegido").hidden, null, { timeout: 8000 }).catch(() => {});
    igual("el torneo elegido en una cámara le llega solo a la otra, con el mismo código",
      [await f2.textContent("#torneo-nombre"), await f2.inputValue("#torneo-codigo") === await f1.inputValue("#torneo-codigo")], ["Abierto de prueba", true]);
    await f1.selectOption("#torneo-mesa", "1");
    await f2.selectOption("#torneo-mesa", "2");
    await pg.waitForFunction(() => document.querySelector('#resumen-lista [data-puesto="2"]').dataset.estado !== "ayuda", null, { timeout: 8000 }).catch(() => {});
    igual("cuando se arregla, deja de pedir ayuda y dice su mesa", [(await fila(2))[0], /Cámara 2 · mesa 2/.test((await fila(2))[1])], ["sin-calibrar", true]);
    igual("y cada una tiene su mesa, con sus jugadores", [await f1.inputValue("#vivo-blancas"), await f2.inputValue("#vivo-blancas"),
      await pg.evaluate(() => [localStorage.getItem("camara_mesa_v1_p1_0"), localStorage.getItem("camara_mesa_v1_p2_0")])], ["Ana", "Carla", ["1", "2"]]);
    igual("sin errores en la consola", errores, []);
    await nav.close();
  }

  console.log("\nUn torneo por equipos: una cámara por tablero");
  {
    const PEq = require("../js/pareo/equipos.js");
    const IDE = "9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a";
    const gente = (c, eq) => [1, 2, 3, 4, 5].map((k) => ({ id: c + k, nombre: eq + " " + k }));
    const datosE = { nombre: "Equipos de prueba", tipo: "equipos", tableros: 4, mesaInicial: 3,
      jugadores: [{ id: "EA", nombre: "Escuela Ana", integrantes: gente("a", "Ana") }, { id: "EB", nombre: "Escuela Beto", integrantes: gente("b", "Beto") }],
      rondas: [{ mesas: [{ b: "EA", n: "EB", alineacion: { b: ["a1", "a2", "a3", "a5"], n: ["b1", "b2", "b3", "b4"] } }] }] };
    const torneoE = [{ id: IDE, nombre: "Equipos de prueba", fecha: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()), rondas: 1, oculto: false, datos: datosE }];
    // Los colores y quién juega cada tablero: igual que en Pareo Integral (PareoEquipos.tablerosDe).
    const pe = (await abrir(browser, "camara-tablero.html")).page;
    const deLaCamara = await pe.evaluate((d) => window.PartidaEnVivo.mesasDe(d).mesas.map((m) => [m.tablero, m.blancas, m.negras]), datosE);
    const nombre = (id) => [...datosE.jugadores[0].integrantes, ...datosE.jugadores[1].integrantes].find((j) => j.id === id).nombre;
    const dePareo = PEq.tablerosDe(datosE, datosE.rondas[0].mesas[0]).map((x) => [x.k + 1, nombre(x.blancas), nombre(x.negras)]);
    igual("cada tablero, con quién juega con cada color: lo mismo que Pareo Integral (el suplente que entró en el 4, también)", deLaCamara, dePareo);
    await cerrar({ page: pe, ctx: pe.context() });

    const C = await abrir(browser, "camara-tablero.html", null, null, { f: (d) => { window.__pareo = d; }, arg: torneoE });
    const pc2 = C.page;
    await pc2.waitForSelector("#app:not(.hidden)");
    await pc2.fill("#torneo-enlace", IDE);
    await pc2.click("#btn-torneo");
    await pc2.waitForFunction(() => !document.getElementById("torneo-elegido").hidden);
    igual("en un torneo por equipos, la cámara elige mesa Y tablero, con los equipos",
      await pc2.locator("#torneo-mesa option").allTextContents(),
      ["Elige la mesa y el tablero…", "Mesa 3 · tablero 1: Ana 1 – Beto 1 (Escuela Ana – Escuela Beto)", "Mesa 3 · tablero 2: Beto 2 – Ana 2 (Escuela Beto – Escuela Ana)",
        "Mesa 3 · tablero 3: Ana 3 – Beto 3 (Escuela Ana – Escuela Beto)", "Mesa 3 · tablero 4: Beto 4 – Ana 5 (Escuela Beto – Escuela Ana)"]);
    await pc2.selectOption("#torneo-mesa", "3.2");
    igual("y los nombres de ese tablero salen solos", [await pc2.inputValue("#vivo-blancas"), await pc2.inputValue("#vivo-negras")], ["Beto 2", "Ana 2"]);
    const je = new Chess();
    await foto(pc2, je.fen(), ESQ0);
    await esperarAviso(pc2, /esquinas/);
    await tocar(pc2, aLienzo(ESQ0));
    await pc2.click("#btn-calibrar");
    await esperarAviso(pc2, /Calibrado/);
    await pc2.click("#btn-vivo");
    const codE = await pc2.inputValue("#torneo-codigo");
    igual("transmite diciendo su mesa y su tablero", await pc2.textContent("#vivo-codigo"), codE + " · mesa 3 · tablero 2");
    const WE = await abrir(browser, "tablero-vivo.html#" + codE + "&t=" + IDE, null, { width: 1280, height: 1000 }, { f: (d) => { window.__pareo = d; }, arg: torneoE });
    const pwe = WE.page;
    await pwe.waitForFunction(() => document.querySelectorAll("#mesas-lista button[data-mesa]").length === 4, null, { timeout: 8000 }).catch(() => {});
    je.move("e4"); await foto(pc2, je.fen(), ESQ0); await esperarJugadas(pc2, 1);
    await pwe.waitForFunction(() => /e4/.test((document.querySelector('#mesas-lista [data-clave="m3t2"]') || {}).textContent || ""), null, { timeout: 8000 }).catch(() => {});
    igual("quien mira ve los cuatro tableros del encuentro, cada uno con su partida",
      await pwe.$$eval("#mesas-lista button[data-mesa]", (b) => b.map((x) => [x.dataset.clave, x.querySelector("p").textContent, /1\. e4/.test(x.textContent)])),
      [["m3t1", "Mesa 3 · tablero 1", false], ["m3t2", "Mesa 3 · tablero 2", true], ["m3t3", "Mesa 3 · tablero 3", false], ["m3t4", "Mesa 3 · tablero 4", false]]);
    const ev = eventos.filter((x) => x.event === "estado" && x.nombre === "tablero-vivo-" + codE).pop();
    igual("lo que viaja dice el torneo, la mesa y el tablero", ev && [ev.payload.torneo, ev.payload.mesa, ev.payload.tablero], [IDE, 3, 2]);
    await pwe.click('#mesas-lista [data-clave="m3t2"]');
    igual("en grande, con su mesa y su tablero", await pwe.textContent("#mesa-titulo"), "Mesa 3 · tablero 2 · ronda 1");
    await pc2.evaluate(() => { window.print = () => { window.__impreso = (window.__impreso || 0) + 1; }; });
    await pc2.click("#btn-torneo-qr");
    await pc2.waitForFunction(() => window.__impreso, null, { timeout: 8000 }).catch(() => {});
    igual("un QR por tablero, que abre la cámara en su mesa y su tablero",
      [await pc2.$$eval("#hoja-qr .hoja-qr-numero", (x) => x.map((y) => y.textContent)), (await pc2.getAttribute("#hoja-qr .hoja-qr-mesa:nth-child(4)", "data-enlace")).includes("&m=3&b=4&")],
      [["Mesa 3 · tablero 1", "Mesa 3 · tablero 2", "Mesa 3 · tablero 3", "Mesa 3 · tablero 4"], true]);
    igual("sin errores en la consola (equipos)", [C.errores, WE.errores], [[], []]);
    await cerrar(WE); await cerrar(C);
    const QE = await abrir(browser, "camara-tablero.html#t=" + IDE + "&c=" + codE + "&m=3&b=4&r=0", { sinSesion: true }, { width: 412, height: 900 }, { f: (d) => { window.__pareo = d; }, arg: torneoE });
    await QE.page.waitForFunction(() => /Equipos/.test(document.getElementById("mesa-titulo-qr").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("sin cuenta, por el QR del tablero 4: esa mesa y ese tablero, transmitiendo",
      [await QE.page.textContent("#mesa-titulo-qr"), await QE.page.textContent("#vivo-codigo")], ["Mesa 3 · tablero 4 · Equipos de prueba", codE + " · mesa 3 · tablero 4"]);
    await cerrar(QE);
  }

  console.log("\nGuardar la partida en la cuenta del alumno");
  {
    const diez = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d4", "exd4"];
    const jg = new Chess(); diez.forEach((x) => jg.move(x));
    const llega = (pg, jugadas, r) => pg.evaluate(([pgn, r]) => {
      const c = window.__canales[Object.keys(window.__canales)[0]];
      c.estado({ payload: { v: 1, pgn, blancas: "Ana Mora", negras: "Beto Solís", t: Date.now(), resultado: r || undefined, id: "abc-0" } });
    }, [jugadas, r]);
    const G = await abrir(browser, "tablero-vivo.html#guardar2", null, { width: 390, height: 844 });
    const pg = G.page;
    await pg.waitForFunction(() => window.__canales && Object.keys(window.__canales).length, null, { timeout: 8000 });
    await llega(pg, "1. e4 e5 2. Nf3");
    await pg.waitForFunction(() => !document.getElementById("partida").hidden, null, { timeout: 8000 });
    igual("con menos de 10 medias jugadas no se ofrece (la base no guarda tan pocas)", await pg.evaluate(() => document.getElementById("guardar-caja").checkVisibility()), false);
    await llega(pg, jg.pgn(), "0-1");
    await pg.waitForFunction(() => document.getElementById("guardar-caja").checkVisibility(), null, { timeout: 8000 }).catch(() => {});
    await pg.click("#btn-guardar");
    igual("«Guardar en mi cuenta», con la sesión abierta, pregunta con qué color jugó (con los nombres)",
      [await pg.evaluate(() => document.getElementById("form-guardar").checkVisibility()), await pg.getAttribute("#btn-guardar", "aria-expanded"), await pg.textContent("#guardar-negras")], [true, "true", "Con negras (Beto Solís)"]);
    await pg.click('#form-guardar button[type="submit"]');
    igual("sin el color no guarda, y lo dice", [await pg.textContent("#guardar-msg"), await pg.evaluate(() => (window.__insertados || []).length)], ["Elige con qué color jugaste.", 0]);
    await pg.check('#form-guardar input[value="b"]');
    await pg.fill("#guardar-evento", "Abierto de prueba");
    await pg.fill("#guardar-ronda", "3");
    await pg.click('#form-guardar button[type="submit"]');
    await pg.waitForFunction(() => /^Listo/.test(document.getElementById("guardar-msg").textContent), null, { timeout: 8000 }).catch(() => {});
    const fila = await pg.evaluate(() => (window.__insertados || [])[0]);
    igual("la guarda en SU libreta de torneos (partidas_torneo), con sus jugadas, el color, el resultado y la fecha de hoy en Costa Rica",
      fila && [fila.tabla, fila.fila.color, fila.fila.jugadas, fila.fila.resultado, fila.fila.evento, fila.fila.ronda, fila.fila.fecha, "student_id" in fila.fila],
      ["partidas_torneo", "b", diez, "0-1", "Abierto de prueba", 3, new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()), false]);
    igual("y no deja guardarla dos veces", [await pg.textContent("#btn-guardar"), await pg.isDisabled("#btn-guardar")], ["Ya está en tu cuenta", true]);
    igual("sin errores en la consola (guardar)", G.errores, []);
    await cerrar(G);

    // «Activar voz» del encabezado (js/voz-pagina.js) dice cada jugada nueva:
    // lee la región viva #anuncio. Con la voz del navegador de mentira.
    const conVoz = { f: () => {
      localStorage.setItem("oscarSpeechMode_v1", "1");
      window.__dicho = [];
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
      Object.defineProperty(window, "speechSynthesis", { value: { speak: (u) => window.__dicho.push(u.text), cancel() {}, getVoices: () => [], addEventListener() {} } });
    } };
    const VZ = await abrir(browser, "tablero-vivo.html#vxzmentx", null, { width: 390, height: 844 }, conVoz);
    await VZ.page.waitForFunction(() => window.__canales && Object.keys(window.__canales).length, null, { timeout: 8000 });
    // Lo del primer segundo y medio es parte de la página, no un aviso (ver js/voz-pagina.js).
    await VZ.page.waitForTimeout(1700);
    await llega(VZ.page, "1. e4");
    await VZ.page.waitForTimeout(1200);
    await llega(VZ.page, "1. e4 e5 2. Nf3");
    await VZ.page.waitForFunction(() => window.__dicho.some((x) => /caballo/.test(x)), null, { timeout: 8000 }).catch(() => {});
    igual("con «Activar voz», quien mira oye cada jugada nueva", [await VZ.page.evaluate(() => document.getElementById("voz-toggle").checkVisibility()),
      await VZ.page.evaluate(() => window.__dicho.filter((x) => /^Última jugada/.test(x)).pop())], [true, "Última jugada: 2. caballo felix 3. Juegan las negras."]);
    await cerrar(VZ);

    // Los momentos clave: con un Stockfish de mentira que da evaluaciones
    // conocidas. Las blancas regalan en 3. Ac4 (de +0,3 a −2,5) y las negras
    // devuelven en 4... Cf6 (de −2,5 a +0,5, es decir de +2,5 a −0,5 para ellas).
    const fensDiez = [], recorre = new Chess();
    fensDiez.push(recorre.fen()); diez.forEach((x) => { recorre.move(x); fensDiez.push(recorre.fen()); });
    const evs = fensDiez.map((f, i) => ({ fen: f, eval: i <= 4 ? 0.3 : i <= 7 ? -2.5 : 0.5, mejor: i === 4 ? "d4" : i === 7 ? "d6" : null }));
    const M = await abrir(browser, "tablero-vivo.html#mxmentxs", null, { width: 390, height: 844 });
    const pm = M.page;
    await pm.route("**/js/shared-engine.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "window.SharedEngine = {};" }));
    await pm.route("**/js/preparacion-motor.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript",
      body: "window.__revisadas = 0; window.PreparacionMotor = { evaluar: (fen, p) => { window.__revisadas++; window.__prof = p; const x = (window.__evs || []).find((e) => e.fen === fen); return Promise.resolve(x ? { eval: x.eval, mejor: x.mejor } : { eval: 0, mejor: null }); } };" }));
    await pm.evaluate((e) => { window.__evs = e; }, evs);
    await pm.waitForFunction(() => window.__canales && Object.keys(window.__canales).length, null, { timeout: 8000 });
    await llega(pm, "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5");
    await pm.waitForFunction(() => !document.getElementById("partida").hidden, null, { timeout: 8000 });
    igual("mientras se juega, los momentos clave no se ofrecen", await pm.evaluate(() => document.getElementById("momentos").checkVisibility()), false);
    await llega(pm, jg.pgn(), "0-1");
    await pm.waitForFunction(() => document.getElementById("momentos").checkVisibility(), null, { timeout: 8000 }).catch(() => {});
    igual("al terminar, se ofrecen con un botón (Stockfish no arranca solo)", [await pm.evaluate(() => document.getElementById("btn-momentos").checkVisibility()), await pm.evaluate(() => window.__revisadas === undefined)], [true, true]);
    await pm.click("#btn-momentos");
    await pm.waitForFunction(() => document.querySelectorAll("#momentos-lista button").length, null, { timeout: 8000 }).catch(() => {});
    igual("Stockfish revisa cada posición (11) a profundidad 10, y salen los dos momentos, en orden, con la mejor jugada",
      [await pm.evaluate(() => [window.__revisadas, window.__prof]), await pm.$$eval("#momentos-lista button", (bs) => bs.map((b) => b.textContent))],
      [[11, 10], ["3. Ac4: las blancas estaban en +0,3 y quedaron en −2,5 (contado desde las blancas). Mejor era d4.",
        "4... Cf6: las negras estaban en +2,5 y quedaron en −0,5 (contado desde las negras). Mejor era d6."]]);
    await pm.click('#momentos-lista button[data-ply="4"]');
    igual("tocar uno lleva el tablero a esa jugada", await pm.textContent("#paso"), "Repasando: jugada 5 de 10, Ac4.");
    igual("sin errores en la consola (momentos)", M.errores, []);
    await cerrar(M);
    const S = await abrir(browser, "tablero-vivo.html#guardar3", { sinSesion: true }, { width: 390, height: 844 });
    await S.page.waitForFunction(() => window.__canales && Object.keys(window.__canales).length, null, { timeout: 8000 });
    await llega(S.page, jg.pgn());
    await S.page.waitForFunction(() => document.getElementById("guardar-caja").checkVisibility(), null, { timeout: 8000 }).catch(() => {});
    await S.page.click("#btn-guardar");
    igual("sin sesión, dice cómo entrar y no abre el formulario",
      [/^Para guardarla, entra a tu cuenta/.test(await S.page.textContent("#guardar-msg")), await S.page.evaluate(() => document.getElementById("form-guardar").checkVisibility())], [true, false]);
    await cerrar(S);

    // «Guardar solas» en un torneo: se guarda una a mano con la casilla, y
    // las siguientes de ese nombre se guardan solas al terminar.
    const llegaMesa = (pg, o) => pg.evaluate((o) => {
      const c = window.__canales[Object.keys(window.__canales)[0]];
      c.estado({ payload: Object.assign({ v: 1, t: Date.now(), torneo: o.torneo }, o) });
    }, o);
    const IDS = "7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
    const GS = await abrir(browser, "tablero-vivo.html#gxardxsx&t=" + IDS, null, { width: 390, height: 844 });
    const ps = GS.page;
    await ps.waitForFunction(() => window.__canales && Object.keys(window.__canales).length, null, { timeout: 8000 });
    await llegaMesa(ps, { torneo: IDS, mesa: 3, ronda: 2, id: "m3-0", pgn: jg.pgn(), blancas: "Ana Mora", negras: "Beto Solís", resultado: "1-0" });
    await ps.waitForSelector('#mesas-lista button[data-mesa="3"]');
    await ps.click('#mesas-lista button[data-mesa="3"]');
    await ps.waitForFunction(() => document.getElementById("guardar-caja").checkVisibility(), null, { timeout: 8000 }).catch(() => {});
    await ps.click("#btn-guardar");
    await ps.check('#form-guardar input[value="w"]');
    igual("en un torneo se ofrece guardarlas solas", await ps.evaluate(() => document.getElementById("guardar-solas-caja").checkVisibility()), true);
    await ps.check("#guardar-solas");
    await ps.click('#form-guardar button[type="submit"]');
    await ps.waitForFunction(() => /^Listo/.test(document.getElementById("guardar-msg").textContent), null, { timeout: 8000 }).catch(() => {});
    await ps.click("#volver");
    igual("queda dicho arriba: las de «Ana Mora» se guardan solas", [await ps.evaluate(() => document.getElementById("solas-caja").checkVisibility()), await ps.textContent("#solas-texto")],
      [true, "Las partidas de «Ana Mora» en este torneo se guardan solas en tu cuenta cuando terminan."]);
    const pgn3 = jg.pgn();
    await llegaMesa(ps, { torneo: IDS, mesa: 5, ronda: 3, id: "m5-0", pgn: pgn3, blancas: "Carla Vega", negras: "Ana Mora" });
    await ps.waitForTimeout(400);
    igual("mientras sigue en juego, no se guarda", await ps.evaluate(() => (window.__insertados || []).length), 1);
    await llegaMesa(ps, { torneo: IDS, mesa: 6, ronda: 3, id: "m6-0", pgn: pgn3, blancas: "Dani Rojas", negras: "Eva Mena", resultado: "1-0" });
    await llegaMesa(ps, { torneo: IDS, mesa: 5, ronda: 3, id: "m5-0", pgn: pgn3, blancas: "Carla Vega", negras: "Ana Mora", resultado: "0-1" });
    await ps.waitForFunction(() => (window.__insertados || []).length >= 2, null, { timeout: 8000 }).catch(() => {});
    const sola = await ps.evaluate(() => (window.__insertados || []).slice(1));
    igual("al terminar, la de «Ana Mora» se guarda sola, con su color y su ronda; la de otros, no",
      [sola.length, sola[0] && [sola[0].fila.color, sola[0].fila.ronda, sola[0].fila.resultado, sola[0].fila.jugadas.length], /Se guardó sola en tu cuenta: Mesa 5, ronda 3/.test(await ps.textContent("#solas-msg"))],
      [1, ["b", 3, "0-1", 10], true]);
    await llegaMesa(ps, { torneo: IDS, mesa: 5, ronda: 3, id: "m5-0", pgn: pgn3, blancas: "Carla Vega", negras: "Ana Mora", resultado: "0-1", t: Date.now() + 1 });
    await ps.waitForTimeout(400);
    igual("y no se guarda dos veces", await ps.evaluate(() => (window.__insertados || []).length), 2);
    await ps.click("#btn-solas-dejar");
    igual("«Dejar de guardarlas solas» lo apaga", await ps.evaluate(() => document.getElementById("solas-caja").checkVisibility()), false);
    igual("sin errores en la consola (guardar solas)", GS.errores, []);
    await cerrar(GS);
  }

  console.log("\nLa cámara gasta poco");
  {
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const gasto = (pg) => pg.evaluate(() => window.gastoCamara());
    // performance.now adelantable: para no esperar los 2 minutos de «Ahorrar batería» solo.
    const reloj = { f: () => { const pn = performance.now.bind(performance); window.__adelanto = 0; performance.now = () => pn() + window.__adelanto; } };
    const G = await abrir(browser, "camara-tablero.html", null, null, reloj);
    const pg = G.page;
    await pg.waitForSelector("#app:not(.hidden)");
    const jg = new Chess();
    await foto(pg, jg.fen(), ESQ0);
    await esperarAviso(pg, /esquinas/);
    await tocar(pg, aLienzo(ESQ0));
    await pg.click("#btn-calibrar");
    await esperarAviso(pg, /Calibrado/);
    jg.move("e4"); await foto(pg, jg.fen(), ESQ0); await esperarJugadas(pg, 1);
    const g0 = await gasto(pg);
    igual("anota leyendo en su propio hilo (un Web Worker)", [await jugadasDe(pg), g0.hilo, g0.enHilo > 0], ["1. e4", true, true]);
    // En esta foto el tablero ocupa media imagen; desde más arriba, menos.
    const parte = g0.pixeles / g0.lecturas / (640 * 480);
    igual("lee solo el pedazo donde está el tablero (" + Math.round(parte * 100) + " % de la imagen), no la imagen entera", parte < 0.6, true);
    // Con el tablero quieto: el dibujo, 2 veces por segundo; la lectura, a 2 después de 10 s.
    await espera(11000);
    const g1 = await gasto(pg);
    await espera(3000);
    const g2 = await gasto(pg);
    igual("ya calibrada, la imagen se dibuja 2 veces por segundo, no 60 (en 3 s: " + (g2.dibujos - g1.dibujos) + ")", g2.dibujos - g1.dibujos <= 9, true);
    igual("con el tablero quieto, lee 2 veces por segundo y no 5 (en 3 s: " + (g2.lecturas - g1.lecturas) + ")", [g1.lento, g2.lecturas - g1.lecturas <= 8, g2.lecturas - g1.lecturas >= 4], [true, true, true]);
    const t0 = Date.now();
    jg.move("e5"); await foto(pg, jg.fen(), ESQ0); await esperarJugadas(pg, 2);
    igual("y una jugada se anota igual, en menos de 4 s", [await jugadasDe(pg), Date.now() - t0 < 4000], ["1. e4 e5", true]);
    igual("apenas algo cambia, vuelve a leer 5 veces por segundo", (await gasto(pg)).lento, false);

    // «Ahorrar batería»: la pantalla en negro, sin dibujar, y sigue anotando.
    await pg.click("#btn-ahorro");
    const d0 = (await gasto(pg)).dibujos;
    igual("«Ahorrar batería» deja la pantalla en negro con letra blanca, y dice cómo va",
      await pg.evaluate(() => { const a = document.getElementById("ahorro"), c = getComputedStyle(a); return [a.checkVisibility(), c.backgroundColor, c.color, document.activeElement === a, document.getElementById("ahorro-estado").textContent]; }),
      [true, "rgb(0, 0, 0)", "rgb(255, 255, 255)", true, "2 jugadas anotadas. Última jugada: 1… e5. Juegan las blancas."]);
    jg.move("Nf3"); await foto(pg, jg.fen(), ESQ0); await esperarJugadas(pg, 3);
    await espera(1500);
    igual("con la pantalla en negro no dibuja, pero sigue anotando", [(await gasto(pg)).dibujos - d0, await jugadasDe(pg)], [0, "1. e4 e5 2. Cf3"]);
    await pg.click("#ahorro");
    igual("al tocar la pantalla vuelve la cámara", await pg.evaluate(() => [document.getElementById("ahorro").checkVisibility(), document.activeElement.id]), [false, "btn-ahorro"]);
    // Si necesita a alguien, la pantalla negra se quita sola.
    await pg.click("#btn-ahorro");
    const rara = new Chess(jg.fen()); rara.remove("a2");
    await foto(pg, rara.fen(), ESQ0);
    await esperarAviso(pg, /No reconozco/);
    await pg.waitForFunction(() => !document.getElementById("ahorro").checkVisibility(), null, { timeout: 4000 }).catch(() => {});
    igual("si la cámara necesita a alguien (no reconoce algo), la pantalla negra se quita sola", await pg.evaluate(() => document.getElementById("ahorro").checkVisibility()), false);
    await foto(pg, jg.fen(), ESQ0);

    // Sin señal: sigue anotando, lo dice, y al volver manda la partida entera.
    await pg.click("#btn-vivo");
    const cod = (await pg.textContent("#vivo-codigo")).split(" ")[0];
    await G.ctx.setOffline(true);
    await pg.waitForFunction(() => document.getElementById("sin-red").checkVisibility(), null, { timeout: 5000 }).catch(() => {});
    igual("sin señal, lo dice: la partida se sigue anotando y se manda al volver", await pg.evaluate(() => [document.getElementById("sin-red").checkVisibility(), window.estadoCamara().sinRed]), [true, true]);
    jg.move("Nc6"); await foto(pg, jg.fen(), ESQ0); await esperarJugadas(pg, 4);
    igual("y sigue anotando", await jugadasDe(pg), "1. e4 e5 2. Cf3 Cc6");
    const antesRed = eventos.length;
    await G.ctx.setOffline(false);
    await pg.waitForFunction(() => !document.getElementById("sin-red").checkVisibility(), null, { timeout: 5000 }).catch(() => {});
    const alVolver = eventos.slice(antesRed).find((x) => x.event === "estado" && x.nombre === "tablero-vivo-" + cod);
    igual("al volver la señal, se quita el aviso y manda la partida entera", [await pg.evaluate(() => document.getElementById("sin-red").checkVisibility()), alVolver && alVolver.payload.v, alVolver && /Nc6/.test(alVolver.payload.pgn)], [false, 1, true]);
    igual("sin errores en la consola", G.errores, []);
    await cerrar(G);

    // Sin OffscreenCanvas (un navegador viejo): lee en la página, igual de bien.
    const H = await abrir(browser, "camara-tablero.html", null, null, { f: () => { delete window.OffscreenCanvas; } });
    const ph = H.page;
    await ph.waitForSelector("#app:not(.hidden)");
    const jh = new Chess();
    await foto(ph, jh.fen(), ESQ0);
    await esperarAviso(ph, /esquinas/);
    await tocar(ph, aLienzo(ESQ0));
    await ph.click("#btn-calibrar");
    await esperarAviso(ph, /Calibrado/);
    jh.move("d4"); await foto(ph, jh.fen(), ESQ0); await esperarJugadas(ph, 1);
    const gh = await gasto(ph);
    igual("sin el hilo aparte, lee en la página (también solo el recorte)", [await jugadasDe(ph), gh.hilo, gh.enHilo, gh.pixeles / gh.lecturas < 0.6 * 640 * 480], ["1. d4", false, 0, true]);
    igual("sin errores en la consola (sin hilo)", H.errores, []);
    await cerrar(H);

    // Modo mesa: sin el QR de ver (ni su librería), «Ahorrar batería» sola a
    // los 2 minutos, y sin señal abre con el torneo guardado.
    const IDM = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f", codM = "mesa2345";
    const torneoM = [{ id: IDM, nombre: "Relámpago de prueba", fecha: "2026-10-28", rondas: 1, oculto: false,
      datos: { nombre: "Relámpago de prueba", tipo: "individual", jugadores: [{ id: "a", nombre: "Ana" }, { id: "b", nombre: "Beto" }], rondas: [{ mesas: [{ b: "a", n: "b" }] }] } }];
    const M = await abrir(browser, "camara-tablero.html#t=" + IDM + "&c=" + codM + "&m=1&r=0", { sinSesion: true }, { width: 412, height: 900 },
      { f: (d) => { window.__pareo = d; const pn = performance.now.bind(performance); window.__adelanto = 0; performance.now = () => pn() + window.__adelanto; }, arg: torneoM });
    const pm = M.page;
    await pm.waitForFunction(() => !document.getElementById("vivo-encendido").hidden, null, { timeout: 8000 }).catch(() => {});
    igual("en modo mesa no se carga la librería del QR (57 KB que ese celular no usa)", await pm.evaluate(() => [typeof window.qrcode, document.querySelectorAll("#vivo-qr svg").length]), ["undefined", 0]);
    const jm = new Chess();
    await foto(pm, jm.fen(), ESQ0);
    await esperarAviso(pm, /esquinas/);
    await tocar(pm, aLienzo(ESQ0));
    await pm.click("#btn-calibrar");
    await esperarAviso(pm, /Calibrado/);
    igual("recién calibrada, la pantalla sigue a la vista", await pm.evaluate(() => document.getElementById("ahorro").checkVisibility()), false);
    await pm.evaluate(() => { window.__adelanto = 125000; });
    await pm.waitForFunction(() => document.getElementById("ahorro").checkVisibility(), null, { timeout: 4000 }).catch(() => {});
    igual("a los 2 minutos sin tocar nada, se pone sola en «Ahorrar batería», con la mesa arriba",
      await pm.evaluate(() => [document.getElementById("ahorro").checkVisibility(), document.getElementById("ahorro-titulo").textContent]), [true, "Mesa 1 · transmitiendo"]);
    igual("sin errores en la consola (modo mesa)", M.errores, []);
    await cerrar(M);
    // El mismo QR sin señal: el torneo leído antes se guardó en el celular.
    const guardado = JSON.stringify(torneoM[0]);
    const N2 = await abrir(browser, "camara-tablero.html#t=" + IDM + "&c=" + codM + "&m=1&r=0", { sinSesion: true }, { width: 412, height: 900 },
      { f: (x) => { window.__sinRed = true; try { localStorage.setItem("camara_torneo_datos_v1", x); } catch (e) { /* nada */ } }, arg: guardado });
    const pn2 = N2.page;
    await pn2.waitForFunction(() => /Relámpago/.test(document.getElementById("mesa-titulo-qr").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("sin señal, el QR abre la mesa con el torneo guardado", await pn2.textContent("#mesa-titulo-qr"), "Mesa 1 · Relámpago de prueba");
    await cerrar(N2);
    // Y sin señal ni nada guardado: abre igual, y el torneo llega cuando vuelve.
    const N3 = await abrir(browser, "camara-tablero.html#t=" + IDM + "&c=" + codM + "&m=1&r=0", { sinSesion: true }, { width: 412, height: 900 },
      { f: (d) => { window.__sinRed = true; window.__pareo = d; }, arg: torneoM });
    const pn3 = N3.page;
    await pn3.waitForFunction(() => document.getElementById("app").checkVisibility(), null, { timeout: 8000 }).catch(() => {});
    igual("sin señal ni torneo guardado, abre igual", await pn3.evaluate(() => [document.getElementById("app").checkVisibility(), document.getElementById("mesa-titulo-qr").textContent]), [true, "Mesa 1"]);
    await pn3.evaluate(() => { window.__sinRed = false; window.dispatchEvent(new Event("online")); });
    await pn3.waitForFunction(() => /Relámpago/.test(document.getElementById("mesa-titulo-qr").textContent), null, { timeout: 8000 }).catch(() => {});
    igual("y cuando vuelve la señal, toma el torneo y transmite", [await pn3.textContent("#mesa-titulo-qr"), await pn3.evaluate(() => !document.getElementById("vivo-encendido").hidden)], ["Mesa 1 · Relámpago de prueba", true]);
    await cerrar(N3);
  }

  console.log("\nSin cuenta y sin QR");
  {
    const z = await abrir(browser, "camara-tablero.html", { sinSesion: true });
    await z.page.waitForURL(/login\.html/, { timeout: 8000 }).catch(() => {});
    igual("va al login: sin el QR de una mesa, hace falta una cuenta", /\/login\.html\?next=camara-tablero\.html/.test(z.page.url()), true);
    await cerrar(z);
  }

  console.log("\nQuien no administra");
  const n = await abrir(browser, "camara-tablero.html", { is_admin: false, role: "alumno" });
  await n.page.waitForSelector("#app:not(.hidden), #denegado:not(.hidden)");
  igual("un alumno también la abre (entrena en su tablero de verdad)", await n.page.evaluate(() => [
    document.getElementById("app").checkVisibility(), document.getElementById("denegado").checkVisibility()]), [true, false]);
  await cerrar(n);
  const pf = await abrir(browser, "camara-tablero.html", { is_admin: false, role: "profesor" });
  await pf.page.waitForSelector("#app:not(.hidden), #denegado:not(.hidden)");
  igual("quien da clase sí la abre (para su tablero de verdad en la clase en vivo)", await pf.page.evaluate(() => [
    document.getElementById("app").checkVisibility(), document.getElementById("denegado").checkVisibility()]), [true, false]);
  await cerrar(pf);

  console.log("\nLa cámara, solo en esta página");
  const cab = fs.readFileSync(path.join(__dirname, "..", "_headers"), "utf8");
  const reglas = {};
  let ruta = null;
  for (const l of cab.split("\n")) {
    if (/^\S/.test(l) && !l.startsWith("#")) { ruta = l.trim(); reglas[ruta] = reglas[ruta] || []; }
    else if (ruta && /^\s+\S/.test(l)) reglas[ruta].push(l.trim());
  }
  const pp = (r) => (reglas[r] || []).filter((x) => /^Permissions-Policy:/.test(x)).join(" | ");
  igual("todo el sitio la apaga", /camera=\(\)/.test(pp("/*")), true);
  for (const r of ["/camara-tablero", "/camara-tablero.html"]) {
    igual(r + " quita la cabecera general", (reglas[r] || []).includes("! Permissions-Policy"), true);
    igual(r + " la deja encendida solo para el sitio", /camera=\(self\)/.test(pp(r)) && !/camera=\(\)/.test(pp(r)), true);
  }
  const conCamara = Object.keys(reglas).filter((r) => /camera=\((?!\))/.test(pp(r)));
  for (const r of ["/camaras", "/camaras.html"]) {
    igual(r + " (la de los cuadritos) también la tiene: sin eso, ningún cuadrito podría usarla", /camera=\(self\)/.test(pp(r)) && (reglas[r] || []).includes("! Permissions-Policy"), true);
  }
  igual("ninguna otra página tiene la cámara (tampoco la de mirar la partida)", [...conCamara].sort(), ["/camara-tablero", "/camara-tablero.html", "/camaras", "/camaras.html"]);

  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron.` : "\nLa cámara que lee el tablero y la partida en vivo están como se pidió.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
