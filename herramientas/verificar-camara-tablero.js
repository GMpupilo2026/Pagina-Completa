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
let mandados = 0;
async function relevar(desde, nombre, msg) {
  mandados++;
  for (const p of paginas) {
    if (p === desde) continue; // Broadcast no le devuelve a quien manda
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
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u" }, access_token: "t" } } }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } },
    // profiles: quien mira. pareo_publicados: los torneos de window.__pareo,
    // filtrados de verdad en el resolver (eq, gte, lte).
    from(tabla) {
      const filtros = [];
      const filas = () => (window.__pareo || []).filter((x) => filtros.every((g) => g(x)));
      const b = {
        select: () => b, in: () => b, order: () => b, limit: () => b, range: () => b,
        eq: (c, v) => { filtros.push((x) => x[c] === v); return b; },
        gte: (c, v) => { filtros.push((x) => x[c] >= v); return b; },
        lte: (c, v) => { filtros.push((x) => x[c] <= v); return b; },
        maybeSingle: () => Promise.resolve({ data: tabla === "pareo_publicados" ? filas()[0] || null : ${JSON.stringify(yo)}, error: null }),
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
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const n = (s % 19) - 9, o = (y * ancho + x) * 4;
    p[o] = col[0] + n; p[o + 1] = col[1] + n; p[o + 2] = col[2] + n; p[o + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return c.toDataURL("image/png").split(",")[1];
}
async function foto(page, fen, esq, fondo) {
  const opc = Array.isArray(fen) ? { tableros: fen } : { fen, esq, fondo };
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
  igual("dice la última jugada, también al lector de pantalla", await pv.textContent("#ultima"), "Última jugada: 1. e4. Juegan las negras.");
  igual("cabe en el celular sin correrse de lado", await pv.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  for (const san of ["e5", "Nf3"]) { jv.move(san); await foto(pc, jv.fen(), ESQ0); await esperarJugadas(pc, jv.history().length); }
  await pv.waitForFunction(() => document.getElementById("jugadas").textContent === "1. e4 e5 2. Cf3", null, { timeout: 8000 }).catch(() => {});
  igual("cada jugada nueva le llega sola a quien mira", await pv.textContent("#jugadas"), "1. e4 e5 2. Cf3");
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
    await pa.click("#torneo-lista button:has-text('Por equipos')");
    igual("un torneo por equipos todavía no se puede", (await aviso(pa)).startsWith("Los torneos por equipos todavía no"), true);
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
    igual("la partida nueva de la mesa 5 llega con los jugadores de la ronda 2",
      await pw.$eval('#mesas-lista button[data-mesa="5"]', (b) => b.querySelectorAll("p")[1].textContent), '<img src=x onerror="window.__xss=1">Dani – Ana Mora');

    // El resultado: lo marca quien maneja la cámara y le llega a quien mira.
    await pa.click('[data-resultado="1-0"]');
    igual("«1-0» marca el resultado", [await pa.textContent("#resultado-texto"), await pa.getAttribute('[data-resultado="1-0"]', "aria-pressed")], ["Terminó: ganan las blancas (1-0).", "true"]);
    await pw.waitForFunction(() => /Terminó: ganan las blancas/.test(document.querySelector('#mesas-lista button[data-mesa="5"]').textContent), null, { timeout: 8000 }).catch(() => {});
    igual("y quien mira lo ve en la mesa", await pw.$eval('#mesas-lista button[data-mesa="5"]', (b) => b.querySelectorAll("p")[2].textContent), "Última jugada: 1. c4. Juegan las negras. Terminó: ganan las blancas (1-0).");
    igual("el PGN que viaja lleva el resultado", await pa.evaluate(() => /\[Result "1-0"\]/.test(localStorage.getItem("camara_partida_v1_0"))), true);
    await pa.click("#btn-deshacer");
    igual("«Deshacer» lo borra: la partida sigue", [await pa.textContent("#resultado-texto"), await pa.getAttribute('[data-resultado="1-0"]', "aria-pressed")], ["Sigue en juego.", "false"]);

    // El QR de cada mesa: una tarjeta por mesa de la ronda, que abre la cámara en esa mesa.
    await pa.evaluate(() => { window.print = () => { window.__impreso = (window.__impreso || 0) + 1; }; });
    await pa.click("#btn-torneo-qr");
    igual("«Imprimir el QR de cada mesa» arma una tarjeta por mesa y manda a imprimir",
      [await pa.$$eval("#hoja-qr .hoja-qr-numero", (x) => x.map((y) => y.textContent)), await pa.evaluate(() => window.__impreso), await pa.locator("#hoja-qr svg").count()], [["Mesa 5", "Mesa 6"], 1, 2]);
    igual("cada QR lleva el torneo, el código y su mesa (después del #)", (await pa.getAttribute("#hoja-qr .hoja-qr-mesa:nth-child(2)", "data-enlace")).endsWith("/camara-tablero.html#t=" + ID + "&c=" + codigoT + "&m=6"), true);
    await pa.emulateMedia({ media: "print" });
    igual("al imprimir sale solo la hoja, con la marca de agua", await pa.evaluate(() => ["hoja-qr", "hoja-qr-marca", "app"].map((id) => document.getElementById(id).checkVisibility())), [true, true, false]);
    await pa.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await pa.emulateMedia({ media: "screen" });
    igual("en la pantalla no se ve", await pa.evaluate(() => [document.getElementById("hoja-qr").checkVisibility(), document.getElementById("app").checkVisibility()]), [false, true]);
    igual("sin errores en la consola", [A.errores, Bc.errores, W.errores], [[], [], []]);
    await cerrar(W); await cerrar(Bc); await cerrar(A);

    // Un celular que escanea el QR de la mesa 6: el torneo, el código y la mesa puestos, transmitiendo.
    const Q = await abrir(browser, "camara-tablero.html#t=" + ID + "&c=" + codigoT + "&m=6", null, null, { f: (d) => { window.__pareo = d; }, arg: torneo([ronda1, ronda2]) });
    const pq = Q.page;
    await pq.waitForFunction(() => !document.getElementById("vivo-encendido").hidden, null, { timeout: 8000 }).catch(() => {});
    igual("llega por el QR: su torneo, su mesa y transmitiendo con el código del torneo",
      [await pq.textContent("#torneo-nombre"), await pq.inputValue("#torneo-mesa"), await pq.textContent("#vivo-codigo")], ["Abierto de prueba", "6", codigoT + " · mesa 6"]);
    igual("y el código ya no queda en la dirección", await pq.evaluate(() => location.hash), "");
    igual("sin errores en la consola (por el QR)", Q.errores, []);
    await cerrar(Q);
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

  console.log("\nQuien no administra");
  const n = await abrir(browser, "camara-tablero.html", { is_admin: false });
  await n.page.waitForSelector("#denegado:not(.hidden)");
  igual("ve el aviso y no la cámara", await n.page.evaluate(() => [
    document.getElementById("app").checkVisibility(), document.getElementById("denegado").checkVisibility()]), [false, true]);
  await cerrar(n);

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
