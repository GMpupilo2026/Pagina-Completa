/* Comprueba la sala de cine de las transmisiones (transmision.html,
   js/transmision.js) sin tocar Lichess: un doble contesta la API de las
   transmisiones con un torneo de tres rondas. Ver «La sala de cine de las
   transmisiones» en docs/decisiones/juegos-y-torneos.md.

   Lo que se rompe callado acá: una pizarra que suma mal (o que no deja
   compartir el puesto), una ronda que se refresca y no repinta, y un tablero
   que se ve lindo pero no es la posición. Las posiciones del doble no se
   escriben a mano: salen de jugar las jugadas con chess.js.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-transmision.js                    */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { Chess } = require("chess.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

// ---- El doble de Lichess ----------------------------------------------------

function partida(id, blancas, negras, jugadas, status) {
  const g = new Chess();
  let ultima = null;
  for (const san of jugadas) {
    const m = g.move(san);
    if (!m) throw new Error("Jugada ilegal en el doble: " + san);
    ultima = m.from + m.to;
  }
  return {
    id, name: blancas + " - " + negras, fen: g.fen(), lastMove: ultima, status,
    check: g.in_checkmate() ? "#" : g.in_check() ? "+" : undefined,
    players: [{ name: blancas, rating: 1500, clock: 54300 }, { name: negras, rating: 1450, clock: 61000 }],
  };
}

const ID = "s7NfNv6H";
const TOUR = { id: ID, name: "Desafío de prueba", slug: "desafio-de-prueba" };
const rondas = [
  { id: "R1aaaaaa", name: "Ronda 1", slug: "ronda-1", finished: true },
  { id: "R2bbbbbb", name: "Ronda 2", slug: "ronda-2", finished: true },
  { id: "R3cccccc", name: "Ronda 3", slug: "ronda-3", ongoing: true },
].map((r) => ({ ...r, url: "https://lichess.org/broadcast/" + TOUR.slug + "/" + r.slug + "/" + r.id }));

// Beto 2½, Caro 1, Dani 1, Ana ½ → Caro y Dani comparten el 2. Cuando Ana le gana
// a Dani en la ronda 3, Ana sube al 2 y Caro y Dani comparten el 3.
function partidasDe(rondaId, ronda3Terminada) {
  if (rondaId === "R1aaaaaa") return [
    partida("g1", "Ana", "Beto", ["f3", "e5", "g4", "Qh4#"], "0-1"),   // gana Beto
    partida("g2", "Caro", "Dani", ["e4", "e5"], "½-½"),
  ];
  if (rondaId === "R2bbbbbb") return [
    partida("g3", "Ana", "Caro", ["d4", "d5"], "½-½"),
    partida("g4", "Dani", "Beto", ["c4", "c5"], "1/2-1/2"),
  ];
  return [
    partida("g5", "Ana", "Dani", ["e4", "e5", "Nf3"], ronda3Terminada ? "1-0" : "*"),
    partida("g6", "Beto", "Caro", ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], "1-0"),
  ];
}

async function ponerDoble(page, opciones) {
  const o = opciones || {};
  await page.route("https://lichess.org/**", async (route) => {
    const url = route.request().url();
    if (o.caido) return route.fulfill({ status: 503, body: "caído" });
    if (url === "https://lichess.org/api/broadcast/" + ID) {
      return route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ tour: TOUR, rounds: rondas, defaultRoundId: "R3cccccc" }) });
    }
    const m = url.match(/^https:\/\/lichess\.org\/api\/broadcast\/[^/]+\/[^/]+\/([^/?]+)$/);
    if (m) {
      return route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ round: rondas.find((r) => r.id === m[1]), tour: TOUR, games: partidasDe(m[1], o.terminada && o.terminada()) }) });
    }
    return route.fulfill({ status: 404, body: "" });
  });
}

const pizarra = (page) => page.$$eval("#pizarra-cuerpo tr", (trs) => trs.map((tr) =>
  [...tr.children].map((td) => td.textContent.replace(/[🥇🥈🥉]\s*/u, "").trim()).join(" ")));

async function main() {
  console.log("\n=== La ficha lleva a la sala ===");
  const fichas = fs.readFileSync(path.join(RAIZ, "torneos-en-vivo.html"), "utf8");
  igual("la ficha de CENFOTEC entra a la sala", fichas.includes('href="transmision.html?torneo=cenfotec"'), true);
  igual("UTN lleva sus dos salas de idchess, que se abren aparte", [
    /href="https:\/\/media\.idchess\.com\/en\/tournaments\/kYfhVJ\/utn-2026\/[^"]+" target="_blank" rel="noopener"[^>]*>Partida masculina/.test(fichas),
    /href="https:\/\/media\.idchess\.com\/en\/tournaments\/b0fhVJ\/utn-2026\/[^"]+" target="_blank" rel="noopener"[^>]*>Partida femenina/.test(fichas),
    fichas.includes("Transmisión: próximamente")], [true, true, false]);
  const js = fs.readFileSync(path.join(RAIZ, "js/transmision.js"), "utf8");
  igual("la clave cenfotec apunta a su transmisión", /cenfotec:\s*\{\s*id:\s*"s7NfNv6H"/.test(js), true);

  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });

  console.log("\n=== La sala, con la ronda en curso ===");
  let terminada = false;
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await ponerDoble(page, { terminada: () => terminada });
  await page.goto(BASE + "/transmision.html?torneo=cenfotec");
  await page.waitForSelector("#cine-contenido:not(.hidden)");
  await page.waitForFunction(() => document.querySelectorAll("#cine-tablero .cine-sq").length === 64);
  igual("la pantalla de carga se va", await page.$eval("#loading", (e) => e.checkVisibility()), false);
  igual("el título es el del torneo", await page.textContent("#cine-titulo"), "Desafío de prueba");
  igual("una función por ronda", await page.$$eval("#cine-rondas button", (b) => b.map((x) => x.textContent)), ["Ronda 1", "Ronda 2", "Ronda 3en vivo"]);
  igual("arranca en la ronda que marca Lichess", await page.$$eval("#cine-rondas button", (b) => b.map((x) => x.getAttribute("aria-pressed"))), ["false", "false", "true"]);

  // El tablero grande dice la posición de verdad: 1.e4 e5 2.Nf3.
  const casillas = await page.$$eval("#cine-tablero .cine-sq", (sqs) => sqs.map((s) => [s.dataset.square, !!s.querySelector("span"), s.classList.contains("cine-sq-ultima")]));
  const pieza = (c) => casillas.find((x) => x[0] === c)[1];
  igual("hay caballo en f3 y no en g1", [pieza("f3"), pieza("g1")], [true, false]);
  igual("32 piezas en el tablero", casillas.filter((x) => x[1]).length, 32);
  igual("se marca la última jugada (g1 y f3)", casillas.filter((x) => x[2]).map((x) => x[0]).sort(), ["f3", "g1"]);
  igual("a1 es oscura", await page.$eval('#cine-tablero [data-square="a1"]', (e) => e.classList.contains("cine-sq-oscura")), true);
  igual("la jugada también va escrita", await page.textContent("#cine-detalle"), "En juego · mueven las negras · última jugada g1–f3");
  igual("quien juega lo dice su barra", [await page.textContent("#cine-negras"), await page.textContent("#cine-blancas")].map((t) => t.includes("Juega")), [true, false]);
  igual("el reloj se lee (543 s = 9:03)", (await page.textContent("#cine-blancas")).includes("9:03"), true);
  igual("la posición en palabras para el lector de pantalla", (await page.textContent("#cine-posicion")).startsWith("Blancas: rey en e1, dama en d1"), true);
  igual("el tablero grande lleva coordenadas y las miniaturas no", await page.$$eval(".coord-marco", (m) => m.length), 1);

  console.log("\n=== La pizarra ===");
  igual("mismos puntos, mismo puesto", await pizarra(page), ["1 Beto 2½ 3", "2 Caro 1 3", "2 Dani 1 2", "4 Ana ½ 2"]);
  igual("dice de cuántas rondas sale", (await page.textContent("#pizarra-nota")).startsWith("Suma de 3 de 3 rondas"), true);

  console.log("\n=== La cartelera ===");
  igual("dos mesas en la ronda", await page.$$eval("#cine-cartelera button", (b) => b.length), 2);
  await page.click("#cine-cartelera li:nth-child(2) button");
  igual("la mesa 2 pasa a la pantalla grande", await page.getAttribute("#cine-tablero", "aria-label"), "Tablero: Beto con blancas contra Caro con negras");
  igual("y queda marcada", await page.$$eval("#cine-cartelera button", (b) => b.map((x) => x.getAttribute("aria-pressed"))), ["false", "true"]);
  igual("el mate se escribe", await page.textContent("#cine-detalle"), "Terminó 1-0 (ganaron las blancas) · última jugada h5–f7, jaque mate");

  console.log("\n=== Otra ronda ===");
  await page.click("#cine-rondas li:nth-child(1) button");
  await page.waitForFunction(() => document.getElementById("cine-tablero").getAttribute("aria-label").includes("Ana con blancas contra Beto"));
  igual("la ronda 1 muestra su primera mesa", await page.textContent("#cine-detalle"), "Terminó 0-1 (ganaron las negras) · última jugada d8–h4, jaque mate");

  console.log("\n=== La ronda en curso se refresca sola ===");
  await page.click("#cine-rondas li:nth-child(3) button");
  await page.waitForFunction(() => document.getElementById("cine-detalle").textContent.startsWith("En juego"));
  terminada = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForFunction(() => document.getElementById("cine-detalle").textContent.startsWith("Terminó 1-0"), null, { timeout: 5000 }).catch(() => {});
  igual("el resultado nuevo llega a la pantalla", (await page.textContent("#cine-detalle")).startsWith("Terminó 1-0"), true);
  igual("y a la pizarra", await pizarra(page), ["1 Beto 2½ 3", "2 Ana 1½ 3", "3 Caro 1 3", "3 Dani 1 3"]);

  console.log("\n=== Contraste (AA contra el fondo real) ===");
  const contrastes = await page.evaluate(() => {
    const rgb = (s) => s[0] === "#" ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) : (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const razon = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const par = (sel, fondo) => { const e = document.querySelector(sel); return Math.round(razon(rgb(getComputedStyle(e).color), rgb(fondo)) * 10) / 10; };
    return {
      pizarra: par("#pizarra-titulo", "#1d3a2c"),
      "pizarra tenue": par("#pizarra-nota", "#1d3a2c"),
      "pizarra puntos": par(".pizarra-puntos", "#1d3a2c"),
      "ronda elegida": par('#cine-rondas button[aria-pressed="true"]', getComputedStyle(document.querySelector('#cine-rondas button[aria-pressed="true"]')).backgroundColor),
      "ronda sin elegir": par('#cine-rondas button[aria-pressed="false"]', "#111a28"),
      "detalle": par("#cine-detalle", "#0b1422"),
      "mesa": par("#cine-cartelera .text-brand-200", "#111a28"),
    };
  });
  for (const [k, v] of Object.entries(contrastes)) igual("«" + k + "» llega a 4,5:1 (" + v + ")", v >= 4.5, true);

  igual("sin errores de JavaScript", errores, []);
  await page.close();

  console.log("\n=== Con Lichess caído ===");
  const caida = await ctx.newPage();
  await ponerDoble(caida, { caido: true });
  await caida.goto(BASE + "/transmision.html?torneo=cenfotec");
  await caida.waitForSelector("#cine-error:not(.hidden)");
  igual("se ve el aviso", await caida.$eval("#cine-error", (e) => e.checkVisibility()), true);
  igual("y ofrece la transmisión en Lichess", await caida.getAttribute("#cine-error-enlace", "href"), "https://lichess.org/broadcast/desafio-mentes-maestras-cenfotec-2026/s7NfNv6H");
  igual("la pantalla de carga no se queda girando", await caida.$eval("#loading", (e) => e.checkVisibility()), false);

  await browser.close();
  console.log(fallos ? "\n" + fallos + " falla(s)." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
