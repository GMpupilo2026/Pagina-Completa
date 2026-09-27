/* Comprueba la sala de cine de las transmisiones (transmision.html,
   js/transmision.js) sin tocar Lichess: un doble contesta la API de las
   transmisiones con un torneo de tres rondas, y otro doble (el de
   lib/doble-salas-torneo.js) hace de la tabla salas_torneo, de donde la sala
   saca qué torneo mostrar. Ver «La sala de cine de las transmisiones» en
   docs/decisiones/juegos-y-torneos.md.

   Lo que se rompe callado acá: una pizarra que suma mal (o que no deja
   compartir el puesto), una ronda que se refresca y no repinta, y un tablero
   que se ve lindo pero no es la posición. Las posiciones del doble no se
   escriben a mano: salen de jugar las jugadas con chess.js.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-transmision.js                    */
const fs = require("fs");
const { chromium } = require("playwright");
const { Chess } = require("chess.js");
const { dobleSalas, SALAS } = require("./lib/doble-salas-torneo");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

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
    partida("partida1", "Ana", "Beto", ["f3", "e5", "g4", "Qh4#"], "0-1"),   // gana Beto
    partida("partida2", "Caro", "Dani", ["e4", "e5"], "½-½"),
  ];
  if (rondaId === "R2bbbbbb") return [
    partida("partida3", "Ana", "Caro", ["d4", "d5"], "½-½"),
    partida("partida4", "Dani", "Beto", ["c4", "c5"], "1/2-1/2"),
  ];
  return [
    partida("partida5", "Ana", "Dani", ["e4", "e5", "Nf3"], ronda3Terminada ? "1-0" : "*"),
    partida("partida6", "Beto", "Caro", ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], "1-0"),
  ];
}

// opciones: caido, terminada() (la ronda 3 ya terminó), torneo() (rondas y
// defaultRoundId distintos), partidas(ronda) (otras partidas), vivo(ronda) (el
// PGN que manda la transmisión continua; sin esto contesta 404) y pedidosVivo
// (se anota cada vez que la página la abre).
async function ponerDoble(page, opciones) {
  const o = opciones || {};
  const cors = { "Access-Control-Allow-Origin": "*" };
  await page.route("https://lichess.org/**", async (route) => {
    const url = route.request().url();
    if (o.caido) return route.fulfill({ status: 503, body: "caído" });
    if (url === "https://lichess.org/api/broadcast/" + ID) {
      const t = o.torneo ? o.torneo() : { rounds: rondas, defaultRoundId: "R3cccccc" };
      return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ tour: TOUR, ...t }) });
    }
    const vivo = url.match(/^https:\/\/lichess\.org\/api\/stream\/broadcast\/round\/([^/.]+)\.pgn$/);
    if (vivo) {
      if (o.pedidosVivo) o.pedidosVivo.push(vivo[1]);
      if (!o.vivo) return route.fulfill({ status: 404, headers: cors, body: "" });
      return route.fulfill({ contentType: "application/x-chess-pgn", headers: cors, body: o.vivo(vivo[1]) });
    }
    const m = url.match(/^https:\/\/lichess\.org\/api\/broadcast\/[^/]+\/[^/]+\/([^/?]+)$/);
    if (m) {
      const games = o.partidas && o.partidas(m[1]) || partidasDe(m[1], o.terminada && o.terminada());
      return route.fulfill({ contentType: "application/json", headers: cors,
        body: JSON.stringify({ round: rondas.find((r) => r.id === m[1]), tour: TOUR, games }) });
    }
    return route.fulfill({ status: 404, body: "" });
  });
}

// El PGN de una partida como lo manda Lichess: cabecera con GameURL, y cada
// jugada con su reloj. Las jugadas se comprueban con chess.js.
function pgnDe(id, blancas, negras, jugadas, relojes, resultadoPgn) {
  const g = new Chess();
  let texto = "";
  jugadas.forEach((san, i) => {
    if (!g.move(san)) throw new Error("Jugada ilegal en el PGN de prueba: " + san);
    texto += (i % 2 === 0 ? (i / 2 + 1) + ". " : (Math.floor(i / 2) + 1) + "... ") + san + " { [%clk " + relojes[i] + "] } ";
  });
  return '[Event "Prueba"]\n[White "' + blancas + '"]\n[Black "' + negras + '"]\n[Result "' + (resultadoPgn || "*") + '"]\n' +
    '[GameURL "https://lichess.org/broadcast/desafio-de-prueba/ronda-3/R3cccccc/' + id + '"]\n\n' + texto + (resultadoPgn || "*") + "\n\n\n";
}

const pizarra = (page) => page.$$eval("#pizarra-cuerpo tr", (trs) => trs.map((tr) =>
  [...tr.children].map((td) => td.textContent.replace(/[🥇🥈🥉]\s*/u, "").trim()).join(" ")));

async function main() {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: dobleSalas({ salas: SALAS }) }));

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
  igual("el título es el que le puso administración a la sala", await page.textContent("#cine-titulo"), "Desafío Mentes Maestras CENFOTEC 2026");
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
  igual("sin video en la sala, no hay comentarista", await page.$eval("#cine-comentarista", (e) => e.checkVisibility()), false);

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

  console.log("\n=== Una sala que no existe, o que no es de Lichess ===");
  for (const clave of ["no-existe", "utn", "copa-secreta"]) {
    const p = await ctx.newPage();
    await ponerDoble(p);
    await p.goto(BASE + "/transmision.html?torneo=" + clave);
    await p.waitForSelector("#cine-error:not(.hidden)");
    igual("«" + clave + "»: dice que no está abierta", await p.textContent("#cine-error-texto"), "Esta sala no existe o todavía no está abierta.");
    igual("«" + clave + "»: y ofrece la lista de torneos", await p.getAttribute("#cine-error-enlace", "href"), "torneos-en-vivo.html");
    await p.close();
  }

  console.log("\n=== El comentarista en video ===");
  {
    const conVideo = { ...SALAS[0], id: "s-11", clave: "con-video", video_url: "https://www.youtube.com/watch?v=abcDEF12345" };
    const conTwitch = { ...SALAS[0], id: "s-12", clave: "con-twitch", video_url: "https://www.twitch.tv/canal_de_prueba" };
    const ctx3 = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    await ctx3.route("**/js/supabase-client.js", (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: dobleSalas({ salas: SALAS.concat([conVideo, conTwitch]) }) }));
    // Los reproductores no se bajan de verdad: solo importa qué se pide.
    await ctx3.route(/youtube-nocookie\.com|player\.twitch\.tv/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>video</p>" }));
    for (const [clave, src, titulo] of [
      ["con-video", "https://www.youtube-nocookie.com/embed/abcDEF12345", "Comentarista en vivo de Desafío Mentes Maestras CENFOTEC 2026 (YouTube)"],
      ["con-twitch", "https://player.twitch.tv/?channel=canal_de_prueba&parent=localhost&autoplay=false", "Comentarista en vivo de Desafío Mentes Maestras CENFOTEC 2026 (Twitch)"]]) {
      const p = await ctx3.newPage();
      await ponerDoble(p);
      await p.goto(BASE + "/transmision.html?torneo=" + clave);
      await p.waitForSelector("#cine-comentarista iframe", { state: "attached" });
      igual("«" + clave + "»: el reproductor, visible y con su título", [await p.$eval("#cine-comentarista", (e) => e.checkVisibility()),
        await p.getAttribute("#cine-comentarista iframe", "src"), await p.getAttribute("#cine-comentarista iframe", "title")], [true, src, titulo]);
      await p.close();
    }
    await ctx3.close();
  }

  console.log("\n=== En vivo: la transmisión continua ===");
  {
    const pedidosVivo = [];
    const p = await ctx.newPage();
    await ponerDoble(p, { pedidosVivo, vivo: (r) => r === "R3cccccc"
      ? pgnDe("partida5", "Ana", "Dani", ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], ["0:14:50", "0:14:40", "0:14:30", "0:14:20", "0:14:10", "0:14:00"])
      : "" });
    await p.goto(BASE + "/transmision.html?torneo=cenfotec");
    await p.waitForFunction(() => document.getElementById("cine-detalle").textContent.includes("a7–a6"), null, { timeout: 8000 }).catch(() => {});
    igual("la jugada llega por la transmisión continua, sin esperar", await p.textContent("#cine-detalle"), "En juego · mueven las blancas · última jugada a7–a6");
    igual("con la posición de verdad (alfil en b5, peón en a6)", await p.$$eval('#cine-tablero [data-square="b5"] span, #cine-tablero [data-square="a6"] span', (s) => s.length), 2);
    igual("se abrió la de la ronda elegida", pedidosVivo[0], "R3cccccc");
    igual("el reloj de las negras quedó en su último [%clk]", (await p.textContent("#cine-negras")).includes("14:00"), true);
    const antes = await p.textContent('#cine-blancas [data-reloj]');
    await p.waitForTimeout(2300);
    const despues = await p.textContent('#cine-blancas [data-reloj]');
    igual("y el de quien juega corre solo (" + antes + " → " + despues + ")", antes.startsWith("14:1") && despues < antes, true);
    await p.waitForTimeout(5600);
    igual("si la transmisión se corta, se vuelve a abrir sola", pedidosVivo.filter((r) => r === "R3cccccc").length >= 2, true);
    await p.close();
  }

  console.log("\n=== Abierta antes de que empiece, y siguiendo a la ronda en curso ===");
  {
    let empezo = false, actual = "R3cccccc";
    const cuarta = { id: "R4dddddd", name: "Ronda 4", slug: "ronda-4", url: "https://lichess.org/broadcast/" + TOUR.slug + "/ronda-4/R4dddddd" };
    const p = await ctx.newPage();
    await ponerDoble(p, {
      torneo: () => ({ rounds: rondas.concat([cuarta]), defaultRoundId: actual }),
      // La ronda 4 sin parear y después pareada: partidas SIN «fen», como las
      // manda Lichess antes de la primera jugada.
      partidas: (r) => r === "R4dddddd" ? (empezo ? [{ id: "partida7", players: [{ name: "Caro" }, { name: "Ana" }], status: "*" }] : []) : null,
    });
    await p.goto(BASE + "/transmision.html?torneo=cenfotec");
    await p.waitForFunction(() => document.querySelectorAll("#cine-tablero .cine-sq").length === 64);
    actual = "R4dddddd";
    await p.evaluate(() => window.Transmision.refrescarTorneo());
    await p.waitForFunction(() => document.querySelector('#cine-rondas button[aria-pressed="true"]').textContent.startsWith("Ronda 4"));
    igual("sin elegir a mano, la sala pasa sola a la ronda en curso", await p.textContent('#cine-rondas button[aria-pressed="true"]'), "Ronda 4");
    igual("que todavía no empieza, y lo dice", await p.$eval("#cine-sin-partidas", (e) => e.checkVisibility() && e.textContent), "Esta ronda todavía no empieza: las partidas aparecen aquí apenas arranquen.");
    empezo = true;
    await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await p.waitForFunction(() => document.querySelectorAll("#cine-cartelera button").length === 1, null, { timeout: 5000 }).catch(() => {});
    igual("una ronda vacía se sigue pidiendo: la mesa aparece sola", await p.$$eval("#cine-cartelera button", (b) => b.length), 1);
    igual("una partida sin jugadas se ve en la posición inicial", await p.$$eval("#cine-tablero .cine-sq", (sq) => [sq.filter((x) => x.querySelector("span")).length, !!sq.find((x) => x.dataset.square === "e2").querySelector("span")]), [32, true]);
    await p.click('#cine-rondas button[data-ronda="R3cccccc"]');
    await p.evaluate(() => window.Transmision.refrescarTorneo());
    await p.waitForTimeout(300);
    igual("pero si la persona eligió una ronda, no se la cambia", await p.textContent('#cine-rondas button[aria-pressed="true"]'), "Ronda 3en vivo");
    await p.close();
  }

  console.log("\n=== Con pizarras de chess-results: las posiciones oficiales ===");
  // Una sala de Lichess cuyas posiciones vienen de chess-results (como UTN,
  // que transmite solo dos mesas). Los nombres son inventados.
  const conPizarras = { id: "s-9", clave: "universitario", nombre: "Universitario de prueba", descripcion: "", emoji: "🎓",
    tipo: "lichess", lichess_id: ID, visible: true, orden: 9, enlaces: [],
    pizarras: [{ titulo: "Femenino", url: "https://s1.chess-results.com/tnr1.aspx" }, { titulo: "Masculino", url: "https://s3.chess-results.com/tnr2.aspx" }] };
  const OFICIAL = { universitario: { pizarras: [
    { titulo: "Femenino", url: "https://s1.chess-results.com/tnr1.aspx?lan=2&art=1&turdet=YES", ronda: "Clasificación después de la ronda 2",
      desempates: ["Direct Encounter", "Buchholz Tie-Break Variable"], leido_en: "2026-09-27T16:05:00Z",
      filas: [{ puesto: "1", titulo: "WIM", nombre: "Mora, Ana", club: "UCR", elo: "1900", puntos: "2", desempates: ["0", "3"] },
              { puesto: "2", titulo: "", nombre: "Vega, Bea", club: "TEC", elo: "0", puntos: "1½", desempates: ["0", "2"] }] },
    { titulo: "Masculino", url: "https://s3.chess-results.com/tnr2.aspx?lan=2&art=1&turdet=YES", ronda: "Clasificación después de la ronda 0",
      desempates: [], viejo: true, leido_en: "2026-09-27T16:05:00Z",
      filas: [{ puesto: "1", titulo: "", nombre: "Solís, Carlos", club: "UNA", elo: "2000", puntos: "0", desempates: [] }] },
  ] } };
  const ctx2 = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await ctx2.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: dobleSalas({ salas: SALAS.concat([conPizarras, { ...conPizarras, id: "s-10", clave: "sin-conexion" }]), oficial: OFICIAL }) }));
  const oficial = await ctx2.newPage();
  const erroresOficial = [];
  oficial.on("pageerror", (e) => erroresOficial.push(e.message));
  await ponerDoble(oficial);
  await oficial.goto(BASE + "/transmision.html?torneo=universitario");
  await oficial.waitForFunction(() => document.querySelectorAll("#pizarra-cuerpo tr").length === 2);
  const filasOficiales = () => oficial.$$eval("#pizarra-cuerpo tr", (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, " ").trim()));
  igual("la pide a la función con la clave de la sala", await oficial.evaluate(() => window.__pedidosPizarra[0]), "universitario");
  igual("muestra las posiciones oficiales, no la suma de las mesas", await filasOficiales(), ["🥇 1 WIM Mora, Ana UCR 2 1900", "🥈 2 Vega, Bea TEC 1½ –"]);
  igual("la cuarta columna es el Elo", await oficial.textContent("#pizarra-col4"), "Elo");
  igual("dice de dónde sale y después de qué ronda", await oficial.textContent("#pizarra-nota"), "Clasificación después de la ronda 2 · posiciones oficiales de chess-results");
  igual("una pestaña por pizarra, la primera elegida", await oficial.$$eval("#pizarra-pestanas button", (b) => b.map((x) => x.textContent + ":" + x.getAttribute("aria-pressed"))), ["Femenino:true", "Masculino:false"]);
  igual("las pestañas se ven", await oficial.$eval("#pizarra-pestanas", (e) => e.checkVisibility()), true);
  igual("los desempates y el enlace a chess-results", [await oficial.$eval("#pizarra-fuente", (e) => e.textContent.startsWith("Desempates, en orden: Direct Encounter, Buchholz Tie-Break Variable.")), await oficial.getAttribute("#pizarra-fuente a", "href")],
    [true, "https://s1.chess-results.com/tnr1.aspx?lan=2&art=1&turdet=YES"]);
  await oficial.click("#pizarra-pestanas button:nth-child(2)");
  igual("la otra pestaña: sin medallas mientras todos tienen 0", await filasOficiales(), ["1 Solís, Carlos UNA 0 2000"]);
  igual("y avisa si es lo último que se pudo leer", (await oficial.textContent("#pizarra-fuente")).includes("Sin conexión con chess-results: es lo último que se leyó, a las 10:05"), true);
  igual("el foco se queda en la pestaña", await oficial.evaluate(() => document.activeElement.textContent), "Masculino");
  const contrastePestana = await oficial.evaluate(() => {
    const rgb = (t) => (t.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const r = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const [sin, con] = [...document.querySelectorAll("#pizarra-pestanas button")].sort((a) => a.getAttribute("aria-pressed") === "true" ? 1 : -1);
    return [r(rgb(getComputedStyle(sin).color), [29, 58, 44]), r(rgb(getComputedStyle(con).color), rgb(getComputedStyle(con).backgroundColor))].map((x) => Math.round(x * 10) / 10);
  });
  igual("las pestañas llegan a 4,5:1 (" + contrastePestana.join(" y ") + ")", contrastePestana.every((x) => x >= 4.5), true);
  igual("sin errores de JavaScript", erroresOficial, []);
  await oficial.close();

  const caidaOficial = await ctx2.newPage();
  await ponerDoble(caidaOficial);
  await caidaOficial.goto(BASE + "/transmision.html?torneo=sin-conexion");
  await caidaOficial.waitForFunction(() => document.getElementById("pizarra-nota").textContent.startsWith("No pudimos"));
  igual("si la función falla lo dice, sin inventar una suma", [await caidaOficial.textContent("#pizarra-nota"), await caidaOficial.$$eval("#pizarra-cuerpo tr", (t) => t.length)],
    ["No pudimos leer las posiciones de chess-results ahora mismo. Se vuelve a intentar sola en un rato.", 0]);
  await ctx2.close();

  await browser.close();
  console.log(fallos ? "\n" + fallos + " falla(s)." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
