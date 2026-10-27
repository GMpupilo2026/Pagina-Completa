#!/usr/bin/env node
/* La cámara que lee el tablero (camara-tablero.html), comprobada en un
 * navegador de verdad con un cliente de Supabase de mentira.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - una homografía mal resuelta pone la cuadrícula corrida una casilla y la
 *    lectura «funciona», pero de otro tablero;
 *  - una jugada mal reconocida queda anotada como si fuera la buena: por eso
 *    lo que no explica ninguna jugada legal NO se anota;
 *  - y la página se le abriría a quien no administra.
 *
 * Las fotos las dibuja el mismo navegador: un tablero inclinado, con piezas
 * redondas y ruido, desde el mismo lugar en cada jugada. Se marcan sus cuatro
 * esquinas con el ratón, se calibra y se juega foto a foto.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-camara-tablero.js
 */
const fs = require("fs");
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

function cliente(yo) {
  return `window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u" }, access_token: "t" } } }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } },
    from() { const b = { select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b, maybeSingle: () => Promise.resolve({ data: ${JSON.stringify(yo)}, error: null }), then: (f) => Promise.resolve({ data: [], error: null }).then(f) }; return b; },
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel() { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel() {},
  };`;
}

async function abrir(browser, yo) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 1400 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente(yo) }));
  await page.goto(BASE + "/camara-tablero.html", { waitUntil: "load" });
  return { ctx, page, errores };
}

/* Dónde cae cada esquina del tablero en la foto: x = 52u − 6v + 180,
 * y = 4u − 50v + 520 (u la columna, v la fila). Un tablero inclinado y
 * achatado, como lo vería un celular que no está justo encima. */
const T = [52, 4, -6, -50, 180, 520];
const ESQ = [[0, 0], [8, 0], [8, 8], [0, 8]].map(([u, v]) => [T[0] * u + T[2] * v + T[4], T[1] * u + T[3] * v + T[5]]);

async function foto(page, fen) {
  const base64 = await page.evaluate(([fen, T]) => {
    const c = document.createElement("canvas");
    c.width = 800; c.height = 600;
    const g = c.getContext("2d");
    g.fillStyle = "#5b4636"; g.fillRect(0, 0, 800, 600);
    g.setTransform(...T);
    const filas = fen.split(" ")[0].split("/");
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      g.fillStyle = (r + f) % 2 === 0 ? "#769656" : "#eeeed2";
      g.fillRect(f, r, 1, 1);
    }
    filas.forEach((fila, i) => {
      const r = 7 - i;
      let f = 0;
      for (const ch of fila) {
        if (/\d/.test(ch)) { f += Number(ch); continue; }
        const blanca = ch === ch.toUpperCase();
        g.beginPath(); g.arc(f + 0.5, r + 0.5, 0.33, 0, 2 * Math.PI);
        g.fillStyle = blanca ? "#fafaf5" : "#1f1f1f"; g.fill();
        g.lineWidth = 0.06; g.strokeStyle = blanca ? "#333333" : "#bbbbbb"; g.stroke();
        f++;
      }
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Ruido, para que no sea un dibujo perfecto (siempre el mismo: semilla fija).
    const d = g.getImageData(0, 0, 800, 600), p = d.data;
    let s = 12345;
    for (let k = 0; k < p.length; k += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s % 17) - 8;
      p[k] += n; p[k + 1] += n; p[k + 2] += n;
    }
    g.putImageData(d, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  }, [fen, T]);
  await page.setInputFiles("#foto", { name: "tablero.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") });
}

async function marcarEsquinas(page) {
  const caja = await page.locator("#lienzo").boundingBox();
  const escala = caja.width / 640; // la foto de 800 se trabaja a 640
  for (const [x, y] of ESQ) {
    await page.mouse.click(caja.x + x * 0.8 * escala, caja.y + y * 0.8 * escala);
  }
}

const aviso = (p) => p.textContent("#aviso");
const esperarAviso = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.getElementById("aviso").textContent), re.source, { timeout: 8000 });

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });

  console.log("\nLas cuentas, sin la página");
  const a = await abrir(browser, { is_admin: true });
  const p = a.page;
  await p.waitForSelector("#app:not(.hidden)");
  igual("la homografía lleva cada esquina del tablero a la marcada",
    await p.evaluate((ESQ) => {
      const L = window.LectorTablero, h = L.homografia(L.ESQUINAS_TABLERO, ESQ);
      return L.ESQUINAS_TABLERO.every(([u, v], i) => { const [x, y] = L.aplicar(h, u, v); return Math.hypot(x - ESQ[i][0], y - ESQ[i][1]) < 1e-6; });
    }, ESQ), true);
  igual("tres esquinas en línea no dan tablero",
    await p.evaluate(() => window.LectorTablero.homografia(window.LectorTablero.ESQUINAS_TABLERO, [[0, 0], [10, 0], [20, 0], [5, 5]])), null);

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

  console.log("\nUna partida foto a foto");
  const partida = new Chess();
  await foto(p, partida.fen());
  await p.waitForFunction(() => /esquina 1 de 4/.test(document.getElementById("aviso").textContent));
  igual("pide la esquina de a1", (await aviso(p)).includes("a1"), true);
  await marcarEsquinas(p);
  igual("con las cuatro, pide calibrar", (await aviso(p)).includes("Calibrar"), true);
  await p.click("#btn-calibrar");
  await esperarAviso(p, /Calibrado/);
  igual("calibra y lee bien las 64 casillas de la posición inicial", await aviso(p), "Calibrado: lee bien 64 de 64 casillas en la posición inicial. Ya puedes jugar.");

  for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O"]) {
    partida.move(san);
    await foto(p, partida.fen());
    await p.waitForFunction((n) => document.getElementById("jugadas").textContent.split(" ").filter((x) => !/\.$/.test(x)).length === n, partida.history().length, { timeout: 8000 }).catch(() => {});
  }
  igual("anota la partida jugada frente a la cámara", await p.textContent("#jugadas"), "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O");
  igual("la posición digital es la de la partida", await p.textContent("#fen"), partida.fen());
  igual("y lee las 64 casillas como se esperan", await p.textContent("#acierto"), "64 de 64");

  // Una pieza que desaparece sin jugada: no se anota nada y se dice dónde.
  const rara = new Chess(partida.fen());
  rara.remove("a2");
  await foto(p, rara.fen());
  await esperarAviso(p, /No reconozco/);
  igual("lo que no es una jugada legal no se anota y dice la casilla", (await aviso(p)).includes("a2"), true);
  igual("la partida sigue igual", await p.textContent("#jugadas"), "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O");

  await p.click("#btn-deshacer");
  igual("«Deshacer» quita la última jugada", await p.textContent("#jugadas"), "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6");
  igual("sin errores en la consola", a.errores, []);
  await a.ctx.close();

  console.log("\nQuien no administra");
  const b = await abrir(browser, { is_admin: false });
  await b.page.waitForSelector("#denegado:not(.hidden)");
  igual("ve el aviso y no la cámara", await b.page.evaluate(() => [
    document.getElementById("app").checkVisibility(), document.getElementById("denegado").checkVisibility()]), [false, true]);
  await b.ctx.close();

  console.log("\nLa cámara, solo en esta página");
  const cab = fs.readFileSync(require("path").join(__dirname, "..", "_headers"), "utf8");
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
  igual("ninguna otra página tiene la cámara", conCamara, ["/camara-tablero", "/camara-tablero.html"]);

  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron.` : "\nLa cámara que lee el tablero está como se pidió.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
