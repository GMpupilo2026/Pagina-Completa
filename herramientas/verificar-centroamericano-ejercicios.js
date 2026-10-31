/* «Ejercicios de la ronda» del Centroamericano 2026
 * (herramientas/centroamericano-ejercicios.js, js/ejercicios-partidas.js,
 * js/centroamericano-ejercicios.js).
 *
 * Los publica un flujo de GitHub sin que nadie los mire antes (lo pidió el
 * dueño), así que esto es lo único que se para entre Stockfish y la página.
 * Lo que se rompe acá no da error: una solución que no es legal y el
 * ejercicio no se puede resolver, un nombre que se cuela y alguien ve
 * publicado cómo perdió, o un mate que la página no acepta. Tres partes:
 *
 *   1. LOS DATOS (data/centroamericano-ejercicios.json y el de prueba): cada
 *      posición y cada línea, con chess.js; nada más que la categoría y, como
 *      mucho, un apellido. Es lo que corre el flujo antes de abrir su PR
 *      (--solo-datos).
 *   2. EL BUSCADOR (js/ejercicios-partidas.js) con un Stockfish de mentira:
 *      cuándo una jugada es la única que gana, la línea que se pide, el
 *      apellido solo de quien la encontró y el reparto entre categorías.
 *   3. LA PÁGINA, con los ejercicios de prueba
 *      (herramientas/datos/centroamericano-ejercicios-prueba.json: posiciones
 *      de partidas de verdad de Lichess, confirmadas con Stockfish, con los
 *      apellidos cambiados): la ficha, la línea de «Hoy», la lista por ronda y
 *      resolver escribiendo o en el tablero, desde las blancas y las negras.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-centroamericano-ejercicios.js [--solo-datos]
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const PAGINA = "centroamericano-2026.html";
const { Chess } = require(path.join(RAIZ, "js", "vendor", "chess.js"));
const E = require(path.join(RAIZ, "js", "ejercicios-partidas.js"));
const L = require(path.join(RAIZ, "js", "lichess-transmision.js"));
const PRUEBA = JSON.parse(fs.readFileSync(path.join(__dirname, "datos", "centroamericano-ejercicios-prueba.json"), "utf8"));

let fallos = 0;
function ok(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { fallos++; console.log("  ✗ " + nombre + (detalle ? " — " + String(detalle).slice(0, 600) : "")); }
}
const jugar = (g, u) => g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined });

/* ---------------- 1. los datos ---------------- */
const CLAVES = new Set(["categoria", "fen", "solucion", "despues", "tema", "mate", "logro"]);
const TEMAS = new Set(["mate", "dama", "corona", "torre", "pieza", "calidad", "ataque"]);
function problemas(datos) {
  const out = [];
  if (!datos || typeof datos.rondas !== "object") return ["no trae «rondas»"];
  Object.keys(datos.rondas).forEach((k) => {
    const lista = datos.rondas[k];
    if (!/^([1-9]|1[0-9]|20)$/.test(k)) out.push("ronda «" + k + "»");
    if (!Array.isArray(lista) || lista.length > 12) { out.push("ronda " + k + ": no es una lista de 0 a 12"); return; }
    const fens = new Set();
    lista.forEach((e, i) => {
      const yo = "ronda " + k + ", ejercicio " + (i + 1) + ": ";
      Object.keys(e).forEach((c) => { if (!CLAVES.has(c)) out.push(yo + "trae «" + c + "» (solo categoría, posición, línea, tema y apellido)"); });
      if (!/^(U[0-9]{2}F?)?$/.test(e.categoria || "")) out.push(yo + "categoría «" + e.categoria + "»");
      if (fens.has(e.fen)) out.push(yo + "posición repetida");
      fens.add(e.fen);
      let g;
      try { g = new Chess(e.fen); } catch (x) { g = null; }
      if (!g || g.fen().split(" ")[0] !== String(e.fen).split(" ")[0] || g.game_over()) { out.push(yo + "posición que chess.js no acepta o ya terminada"); return; }
      if (!Array.isArray(e.solucion) || !e.solucion.length || e.solucion.length % 2 !== 1 || e.solucion.length > 5) { out.push(yo + "la línea tiene que ser de 1, 3 o 5 jugadas"); return; }
      for (const u of e.solucion) if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u) || !jugar(g, u)) { out.push(yo + "jugada ilegal en la solución: " + u); return; }
      if (!Array.isArray(e.despues) || e.despues.length > 6) out.push(yo + "«despues» no es una lista corta");
      else for (const u of e.despues) if (!jugar(g, u)) { out.push(yo + "jugada ilegal en lo que sigue: " + u); break; }
      if (!TEMAS.has(e.tema)) out.push(yo + "tema «" + e.tema + "»");
      if ((e.tema === "mate") !== Number.isInteger(e.mate) || (e.tema === "mate" && (e.mate < 1 || e.mate > 9))) out.push(yo + "el mate y su número no cuadran");
      // Si la línea pide el mate entero, termina en mate.
      if (e.tema === "mate" && e.solucion.length === 2 * e.mate - 1) {
        const h = new Chess(e.fen);
        e.solucion.forEach((u) => jugar(h, u));
        if (!h.in_checkmate()) out.push(yo + "dice mate en " + e.mate + " y la línea no termina en mate");
      }
      if (e.logro != null && (typeof e.logro !== "string" || !/^[^,<>]{2,40}$/.test(e.logro.trim()))) out.push(yo + "«logro» no es solo un apellido: " + e.logro);
    });
  });
  return out;
}

console.log("1. Los datos");
const REAL = path.join(RAIZ, "data", "centroamericano-ejercicios.json");
let real = null;
try { real = JSON.parse(fs.readFileSync(REAL, "utf8")); } catch (e) { /* abajo */ }
ok("data/centroamericano-ejercicios.json se lee", !!real);
const pr = problemas(real);
ok("cada ejercicio publicado es legal, con su línea, y sin nombres", !pr.length, pr.join(" | "));
ok("los de prueba también", !problemas(PRUEBA).length, problemas(PRUEBA).join(" | "));
// Lo que tiene que saltar: un nombre entero, una jugada ilegal, una clave de más.
const roto = JSON.parse(JSON.stringify(PRUEBA));
roto.rondas["3"][0].logro = "Mora Vargas, Ana";
roto.rondas["3"][1].solucion = ["a1a8"];
roto.rondas["3"][2].blancas = "Alguien";
roto.rondas["3"][3].fen = roto.rondas["3"][4].fen;
const pr2 = problemas(roto);
ok("y salta con un nombre entero, una jugada ilegal, el nombre de un jugador o una posición repetida",
   pr2.some((x) => /logro/.test(x)) && pr2.some((x) => /ilegal/.test(x)) && pr2.some((x) => /blancas/.test(x)) && pr2.some((x) => /repetida/.test(x)), pr2.join(" | "));
if (process.argv.includes("--solo-datos")) process.exit(fallos ? 1 : 0);

/* ---------------- 2. el buscador ---------------- */
console.log("2. El buscador");
ok("solo el apellido: «Apellidos, Nombre» y sin coma",
   L.apellido("Mayorga Araya, Sofia") === "Mayorga Araya" && L.apellido("Sofia Mayorga") === "Mayorga" && L.apellido("") === "" && L.apellido("Ana X") === "" && L.apellido("<Mora>, Ana") === "Mora");
ok("una jugada es la única que gana: +3 contra +0,5 sí; contra +2 no; dos mates no; una sola jugada legal no",
   E.unica([{ cp: 300 }, { cp: 50 }]) === "gana" && E.unica([{ cp: 300 }, { cp: 200 }]) === null &&
   E.unica([{ mate: 2 }, { mate: 3 }]) === null && E.unica([{ mate: 2 }, { cp: 80 }]) === "mate" && E.unica([{ cp: 900 }]) === null && E.unica([{ cp: 150 }, { cp: -200 }]) === null);

(async () => {
  // Una partida de verdad (la de prueba de las partidas en vivo, con los
  // nombres cambiados): las candidatas son las posiciones donde el rival
  // acaba de equivocarse.
  const juegos = L.leerPgn(fs.readFileSync(path.join(__dirname, "datos", "lichess-prueba", "ronda.pgn"), "utf8"), Chess);
  juegos.forEach((g, i) => { g.categoria = i % 2 ? "U10F" : "U14"; });
  const cands = E.candidatas(juegos, { plyMin: 6 });
  ok("las candidatas salen de las partidas, donde la evaluación saltó a favor de quien mueve",
     cands.length > 0 && cands.every((c) => c.salto >= 1.5 && new Chess(c.fen).turn() === c.fen.split(" ")[1] && c.jugada && c.quien), cands.length);
  // Un Stockfish de mentira: la jugada de la partida es la única que gana.
  const c = cands[0];
  const otra = new Chess(c.fen).moves({ verbose: true }).find((m) => m.from + m.to !== c.jugada);
  const motor = (buena) => async (fen) => (fen === c.fen ? [{ cp: 420, pv: [buena] }, { cp: 30, pv: [otra.from + otra.to] }] : [{ cp: 420, pv: [] }]);
  const e1 = await E.verificar(c, motor(c.jugada), { Chess });
  ok("si en la partida se jugó la buena, el ejercicio lleva el apellido de quien la jugó, y nada más",
     e1 && e1.solucion[0] === c.jugada && e1.logro === L.apellido(c.quien) && e1.logro && !/,/.test(e1.logro), JSON.stringify(e1));
  const e2 = await E.verificar(c, motor(otra.from + otra.to), { Chess });
  ok("si no la jugó (se le pasó), no se nombra a nadie", e2 && !e2.logro, JSON.stringify(e2));
  const e3 = await E.verificar(c, async () => [{ cp: 420, pv: [c.jugada] }, { cp: 300, pv: [otra.from + otra.to] }], { Chess });
  ok("y si la segunda también gana, no es un ejercicio", e3 === null);
  // El reparto: nunca dos de la misma partida, las categorías se turnan.
  const lista = [
    { fen: "a w", categoria: "U14", juego: "1", puntaje: 50 }, { fen: "b w", categoria: "U14", juego: "1", puntaje: 49 },
    { fen: "c w", categoria: "U14", juego: "2", puntaje: 48 }, { fen: "d w", categoria: "U10F", juego: "3", puntaje: 10 },
    { fen: "a w", categoria: "U18", juego: "4", puntaje: 47 },
  ];
  const el = E.elegir(lista, 3).map((x) => x.fen + x.categoria);
  ok("elegir: una por partida, una vuelta por categoría y sin repetir la posición", JSON.stringify(el) === JSON.stringify(["a wU14", "d wU10F", "c wU14"]), JSON.stringify(el));

  /* ---------------- 3. la página ---------------- */
  console.log("3. La página");
  const { chromium } = require("playwright");
  const nav = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    const abrirPagina = async (datos, extra) => {
      const ctx = await nav.newContext({ viewport: { width: 430, height: 1000 }, serviceWorkers: "block" });
      const p = await ctx.newPage();
      p.errores = [];
      p.on("pageerror", (e) => p.errores.push(e.message));
      await p.route(/supabase\.co|lichess\.org|chess-results/, (r) => r.abort());
      await p.route(/data\/centroamericano-ejercicios\.json/, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(datos) }));
      await p.goto(BASE + "/" + PAGINA + (extra || ""), { waitUntil: "load" });
      await p.waitForFunction(() => window.CentroamericanoEjercicios, null, { timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(400);
      return p;
    };

    // Sin ejercicios todavía: la ficha dice «Pronto» y «Hoy» no dice nada.
    const p0 = await abrirPagina({ sala: "centroamericano-2026", rondas: {} });
    ok("sin ejercicios, la ficha queda en «Pronto» y la línea de «Hoy» no se ve",
       await p0.evaluate(() => document.getElementById("ficha-ejercicios").tagName === "DIV" && !document.getElementById("hoy-ejercicios").checkVisibility()));
    await p0.context().close();

    const p = await abrirPagina(PRUEBA);
    const afuera = await p.evaluate(() => ({ ficha: document.getElementById("ficha-ejercicios"), hoy: document.getElementById("hoy-ejercicios") }))
      .then(() => p.evaluate(() => ({ tag: document.getElementById("ficha-ejercicios").tagName, href: document.getElementById("ficha-ejercicios").getAttribute("href"),
        pie: document.getElementById("ficha-ejercicios").textContent, hoy: document.getElementById("hoy-ejercicios").checkVisibility() ? document.getElementById("hoy-ejercicios").textContent : "" })));
    ok("con ejercicios, la ficha se enciende con los de la última ronda y «Hoy» lo avisa",
       afuera.tag === "A" && afuera.href === "#ejercicios" && /Resolver los de la ronda 3/.test(afuera.pie) && /Ya están los ejercicios de la ronda 3/.test(afuera.hoy), JSON.stringify(afuera));
    await p.click("#hoy-ejercicios a");
    await p.waitForSelector("#ejercicios [data-ejercicio]", { timeout: 5000 }).catch(() => {});
    const lista3 = await p.evaluate(() => ({ abierto: document.getElementById("ejercicios").open, n: document.querySelectorAll("#ejercicios [data-ejercicio]").length,
      rondas: [...document.querySelectorAll("#ejercicios [data-ejercicios-ronda]")].map((b) => b.textContent + ":" + b.getAttribute("aria-pressed")),
      texto: document.getElementById("ejercicios-contenido").innerText, tableros: document.querySelectorAll("#ejercicios [data-ejercicio] .cine-sq").length }));
    ok("la línea de «Hoy» abre la ventana en la última ronda, con un botón por ronda y una tarjeta con su tablero por ejercicio",
       lista3.abierto && lista3.n === 5 && lista3.tableros === 5 * 64 && JSON.stringify(lista3.rondas) === JSON.stringify(["Ronda 1:false", "Ronda 3:true"]) &&
       /Sub-14 Absoluto/.test(lista3.texto) && /resolviste 0 de 5/.test(lista3.texto), JSON.stringify(lista3));
    ok("la lista no dice ningún nombre (ni el apellido: ese sale al resolverlo)", !/Mora|Rojas|Jiménez|Segura/.test(lista3.texto));

    // El 2: juegan las blancas, una jugada. Escrita mal, sin sentido y bien.
    const e = PRUEBA.rondas["3"][1];
    const g = new Chess(e.fen);
    const buena = jugar(g, e.solucion[0]).san; g.undo();
    const mala = g.moves().find((m) => m !== buena && !/[+#]/.test(m));
    const es = (san) => san.replace(/[KQRBN]/g, (x) => ({ K: "R", Q: "D", R: "T", B: "A", N: "C" })[x]);
    await p.click('#ejercicios [data-ejercicio="1"]');
    const cab = await p.evaluate(() => ({ pregunta: document.querySelector(".cac-ejercicio-pregunta").textContent, donde: document.querySelector(".cac-ejercicio").innerText,
      primera: document.querySelector(".cac-ejercicio-tablero [data-square]").dataset.square, foco: document.activeElement.className }));
    ok("el ejercicio dice quién juega, qué se pide y en qué categoría pasó, desde las blancas",
       cab.pregunta === "Juegan las blancas. ¿Cómo ganas?" && /Pasó en la ronda 3 del Sub-10 Femenino/.test(cab.donde) && cab.primera === "a8" && /pregunta/.test(cab.foco), JSON.stringify(cab));
    const escribir = async (t) => { await p.fill("#ejercicio-jugada", t); await p.press("#ejercicio-jugada", "Enter"); await p.waitForTimeout(150); return p.$eval("[data-aviso]", (x) => x.textContent); };
    ok("una jugada escrita que no es: lo dice y deja intentar otra vez", new RegExp("^" + es(mala).replace(/[+]/g, "\\+") + " no es\\. Inténtalo otra vez\\.$").test(await escribir(es(mala))));
    await p.waitForTimeout(800);
    ok("una que no se entiende: lo dice", /^No entendí esa jugada/.test(await escribir("zz9")));
    await p.click("[data-pista]");
    ok("la pista marca la pieza que se mueve", await p.evaluate((de) => document.querySelector('.cac-ejercicio-tablero [data-square="' + de + '"]').dataset.estado === "elegida", e.solucion[0].slice(0, 2)));
    await escribir(es(buena));
    const res = await p.evaluate(() => ({ r: document.querySelector("[data-resultado]") && document.querySelector("[data-resultado]").dataset.resultado,
      texto: document.querySelector("[data-resultado]") ? document.querySelector("[data-resultado]").innerText : "", aviso: document.querySelector("[data-aviso]").textContent,
      escribir: document.querySelector(".cac-ejercicio-escribir").checkVisibility(), sig: !!document.querySelector("[data-siguiente]") }));
    ok("la buena: «¡Bien!», qué gana, cómo sigue y el apellido de quien la encontró en la partida",
       res.r === "bien" && /^✓ ¡Bien! Esa es la jugada\./.test(res.texto) && /\d+\. \S+: las blancas ganan una torre\./.test(res.texto) &&
       /Cómo sigue, según Stockfish: /.test(res.texto) && /En la partida la encontró Rojas Quesada\./.test(res.texto) && !res.aviso && !res.escribir && res.sig, JSON.stringify(res));

    // El 1: juegan las negras, tres jugadas, en el tablero; la del rival la hace la página.
    await p.click("[data-volver]");
    ok("al volver, cuenta el resuelto", /resolviste 1 de 5/.test(await p.$eval("#ejercicios-contenido", (x) => x.innerText)));
    await p.click('#ejercicios [data-ejercicio="0"]');
    const e0 = PRUEBA.rondas["3"][0];
    ok("desde las negras, el tablero se ve al revés", await p.$eval(".cac-ejercicio-tablero [data-square]", (x) => x.dataset.square) === "h1");
    const tocar = async (u) => { await p.click('.cac-ejercicio-tablero [data-square="' + u.slice(0, 2) + '"]'); await p.click('.cac-ejercicio-tablero [data-square="' + u.slice(2, 4) + '"]'); };
    await tocar(e0.solucion[0]);
    await p.waitForTimeout(150);
    const medio = await p.$eval("[data-aviso]", (x) => x.textContent);
    await p.waitForTimeout(800);
    const tras = await p.evaluate((u) => document.querySelector('.cac-ejercicio-tablero [data-square="' + u.slice(2, 4) + '"] span') !== null, e0.solucion[1]);
    ok("a mitad de la línea: «¡Bien! El rival contesta …» y la página hace la jugada del rival", /^¡Bien! El rival contesta \S+\. ¿Y ahora\?$/.test(medio) && tras, medio);
    await tocar(e0.solucion[2]);
    await p.waitForTimeout(300);
    ok("y con la última, resuelto: las negras ganan una pieza", await p.evaluate(() => { const r = document.querySelector("[data-resultado]"); return !!r && r.dataset.resultado === "bien" && /las negras ganan una pieza/.test(r.innerText); }));

    // «Ver la solución» no cuenta como resuelto.
    await p.click("[data-volver]");
    await p.click('#ejercicios [data-ejercicio="2"]');
    await p.click("[data-solucion]");
    const sol = await p.evaluate(() => { const r = document.querySelector("[data-resultado]"); return r ? r.dataset.resultado + "|" + r.innerText : ""; });
    ok("«Ver la solución» la muestra y la juega, sin contarla", /^solucion\|La solución/.test(sol) && !/En la partida la encontró/.test(sol), sol);
    await p.click("[data-volver]");
    ok("resolviste 2 de 5 (no 3), y lo resuelto queda marcado en la tarjeta",
       await p.evaluate(() => /resolviste 2 de 5/.test(document.getElementById("ejercicios-contenido").innerText) && document.querySelectorAll(".cac-ejercicio-hecho").length === 2));
    ok("sin errores en la página", !p.errores.length, p.errores.join(" | "));
    await p.context().close();

    // Lo resuelto se recuerda en el aparato; en francés, sus textos.
    const pf = await abrirPagina(PRUEBA, "?lang=fr");
    await pf.evaluate(() => localStorage.setItem("cac_ejercicios_resueltos", JSON.stringify(["3|" + "x"])));
    await pf.click("#ficha-ejercicios");
    await pf.waitForSelector("#ejercicios [data-ejercicio]", { timeout: 5000 }).catch(() => {});
    await pf.click('#ejercicios [data-ejercicio="4"]');
    const fr = await pf.evaluate(() => document.querySelector(".cac-ejercicio-pregunta").textContent + " | " + document.querySelector(".cac-ejercicio").innerText);
    ok("en francés", /^Les noirs jouent\. Comment gagner \?/.test(fr) && /Ronde 3, U16 Filles/.test(fr), fr);
    await pf.context().close();
  } finally {
    await nav.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
