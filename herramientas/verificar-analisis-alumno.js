/* «Lo que juega en Lichess y Chess.com» (js/analisis-alumno.js): el alumno pone
   sus usuarios en Configuración, su navegador baja sus partidas y las analiza
   con el análisis de la preparación de rivales, y su profe lo ve en Informes
   comparado con «Mi repertorio».

   Lo que se rompe acá no da error: un análisis guardado entero (libro,
   táctica) que pesa diez veces más; una comparación que dice «es lo que
   juega» con dos partidas; las cuentas de Lichess y Chess.com analizadas como
   dos personas; o el profe que lee el análisis de otra cuenta.

   Comprueba:
   - sin navegador, con partidas armadas con chess.js: el análisis reducido
     (lo que se pinta, liviano), y la comparación con el repertorio: lo que
     coincide, lo que no, y «muy pocas partidas» cuando no alcanza;
   - Configuración, con Lichess y Chess.com de mentira: baja de los dos, junta
     las dos cuentas en una persona, guarda (upsert por alumno) los usuarios y
     el análisis, lo dice, y con los dos campos vacíos borra su fila.
   La parte del profe en Informes está en verificar-informes.js.

   Uso:  node herramientas/verificar-todo.js analisis-alumno                  */
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const A = require(path.join(__dirname, "..", "js", "preparacion-analisis.js"));
const AA = require(path.join(__dirname, "..", "js", "analisis-alumno.js"));
const ChessMod = require("chess.js");
const Chess = ChessMod.Chess || ChessMod;

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* Partidas armadas con chess.js (cada jugada existe de verdad), con los
   resultados elegidos para que el análisis tenga algo que decir. */
let dia = 0;
function partida(sitio, blancas, negras, jugadas, resultado) {
  const g = new Chess();
  jugadas.forEach((m) => { if (!g.move(m)) throw new Error("jugada imposible en la prueba: " + m); });
  dia += 1;
  const mv = g.history().map((m, i) => (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + m).join(" ");
  return `[Event "Rated blitz game"]\n[Site "${sitio}"]\n[Date "2026.09.${String((dia % 28) + 1).padStart(2, "0")}"]\n`
    + `[White "${blancas}"]\n[Black "${negras}"]\n[Result "${resultado}"]\n[TimeControl "180+0"]\n\n${mv} ${resultado}\n`;
}
function pgnDe(usuario, sitio, cuantas) {
  const p = [];
  for (let i = 0; i < cuantas.e4; i++) p.push(partida(sitio, usuario, "r" + i, ["e4", "e5", "Nf3", "Nc6", "Bc4"], i < cuantas.e4 - 2 ? "1-0" : "0-1"));
  for (let i = 0; i < cuantas.d4; i++) p.push(partida(sitio, usuario, "s" + i, ["d4", "d5", "c4"], "0-1"));
  for (let i = 0; i < cuantas.sic; i++) p.push(partida(sitio, "x" + i, usuario, ["e4", "c5", "Nf3", "d6"], i % 2 ? "1-0" : "0-1"));
  for (let i = 0; i < cuantas.india; i++) p.push(partida(sitio, "y" + i, usuario, ["d4", "Nf6", "c4"], "1-0"));
  for (let i = 0; i < (cuantas.reti || 0); i++) p.push(partida(sitio, "z" + i, usuario, ["Nf3", "d5", "g3"], "1/2-1/2"));
  return p.join("\n");
}
// Con menos, el análisis (con razón) no se anima a llamar fuerte o débil a ninguna línea.
const LICHESS = pgnDe("ana_123", "https://lichess.org", { e4: 12, d4: 4, sic: 10, india: 6, reti: 2 });
const CHESSCOM = pgnDe("AnaR", "Chess.com", { e4: 4, d4: 2, sic: 4, india: 3 });
const REPERTORIO = [
  { color: "w", nombre: "Londres", jugadas: ["d4", "d5", "Bf4"] },
  { color: "b", nombre: "Siciliana", jugadas: ["e4", "c5", "Nf3", "d6"] },
  { color: "b", nombre: "Contra d4", jugadas: ["d4", "d5"] },
  { color: "b", nombre: "Contra c4", jugadas: ["c4", "e5"] },
  // Dos partidas con 1.Cf3 no alcanzan para decir que «es lo que contesta».
  { color: "b", nombre: "Contra Cf3", jugadas: ["Nf3", "d5"] },
];

function clienteFalso(perfil, filas) {
  return `
window.__escrituras = [];
(function () {
  const PERFILES = [${JSON.stringify(perfil)}];
  const TABLAS = { analisis_partidas_alumno: ${JSON.stringify(filas || [])} };
  function constructor(tabla, base) {
    let filas = (base || []).slice(), unica = false, pendiente = null, conds = [];
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; }, in() { return b; },
      eq(col, val) { conds.push([col, val]); filas = filas.filter((r) => String(r[col]) === String(val)); return b; },
      update(f) { pendiente = { accion: "update", fila: f }; return b; },
      upsert(f, o) { pendiente = { accion: "upsert", fila: f, opciones: o || null }; return b; },
      delete() { pendiente = { accion: "delete" }; return b; },
      maybeSingle() { unica = true; return b; }, single() { unica = true; return b; },
      then(res, rej) {
        if (pendiente) window.__escrituras.push(Object.assign({ tabla, donde: conds.slice() }, pendiente));
        const d = unica ? (filas.length ? filas[0] : null) : filas;
        return Promise.resolve({ data: pendiente ? null : d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(perfil.id)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      mfa: { listFactors: () => Promise.resolve({ data: { totp: [] }, error: null }),
             getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
    },
    from: (t) => constructor(t, t === "profiles" ? PERFILES : TABLAS[t] || []),
    rpc: (n) => constructor(n, []),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); } }),
    removeChannel: () => {},
  };
})();
`;
}

const ANA = { id: "u-ana", role: "alumno", is_admin: false, es_coordinador: false, full_name: "Ana Rojas",
  email: "ana@x.cr", grupo: "7B", foto_path: null, elo: null, elo_tipo: null, fide_id: null };

async function abrir(browser, filas) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(ANA, filas) }));
  // Lichess y Chess.com de mentira: lo que contestan sus APIs públicas.
  const pedidos = [];
  await ctx.route("https://lichess.org/api/games/user/**", (r) => { pedidos.push(r.request().url()); r.fulfill({ status: 200, contentType: "application/x-chess-pgn", body: LICHESS }); });
  await ctx.route("https://api.chess.com/pub/player/**", (r) => {
    const u = r.request().url();
    pedidos.push(u);
    if (/\/games\/archives$/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ archives: ["https://api.chess.com/pub/player/anar/games/2026/09"] }) });
    if (/\/games\/2026\/09\/pgn$/.test(u)) return r.fulfill({ status: 200, contentType: "application/x-chess-pgn", body: CHESSCOM });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ games: [] }) });
  });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(BASE + "/configuracion.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, ctx, errores, pedidos };
}

(async () => {
  console.log("\n=== El análisis y la comparación, sin navegador ===");
  const r = AA.reducir(A.analizar(A.leerPgn(LICHESS), "ana_123", { reciente: true }));
  igual("analiza sus 34 partidas, con lo que abre con blancas", [r.total, r.repertorio.blancas.map((x) => x.san + ":" + x.n)], [34, ["e4:12", "d4:4"]]);
  igual("se guarda solo lo que se pinta (sin libro ni táctica) y pesa poco",
    [r.libro === undefined, r.tactica === undefined, JSON.stringify(r).length < 20000], [true, true, true]);
  igual("con sus puntos fuertes y débiles, las frases del análisis",
    [r.foda.fortalezas.some((t) => /1\.e4 e5/.test(t)), r.foda.debilidades.some((t) => /1\.d4 Cf6/.test(t))], [true, true]);
  const cr = AA.cruce(r, REPERTORIO);
  igual("la comparación con su repertorio", cr.map((x) => x.tipo + ": " + x.texto), [
    "distinto: Con blancas preparó 1.d4, pero en sus partidas abre sobre todo 1.e4 (75 % de 16); 1.d4 sale en el 25 %.",
    "coincide: Contra 1.e4 preparó 1…c5, y es lo que contesta: 100 % de 10 partidas.",
    "distinto: Contra 1.d4 preparó 1…d5, pero contesta sobre todo 1…Cf6 (100 % de 6).",
    "pocas: Contra 1.c4 preparó 1…e5: en sus partidas hay muy pocas con 1.c4 para saber si la juega.",
    "pocas: Contra 1.Cf3 preparó 1…d5: en sus partidas hay muy pocas con 1.Cf3 para saber si la juega.",
  ]);
  igual("sin repertorio, no hay nada que comparar", AA.cruce(r, []), []);

  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== Configuración: el alumno pone sus usuarios ===");
    const { page, ctx, errores, pedidos } = await abrir(browser, []);
    igual("la sección se ve, para el alumno", await page.evaluate(() => document.getElementById("cuentas-juego").checkVisibility()), true);
    await page.fill("#cuenta-lichess", "malo usuario!");
    await page.click("#save-cuentas-btn");
    igual("un usuario mal escrito no sale de la página", [await page.textContent("#cuentas-msg"), pedidos.length],
      ["Un usuario lleva solo letras, números, guion o guion bajo.", 0]);
    await page.fill("#cuenta-lichess", "ana_123");
    await page.fill("#cuenta-chesscom", "AnaR");
    await page.click("#save-cuentas-btn");
    await page.waitForFunction(() => /^Listo|No se pudo/.test(document.getElementById("cuentas-msg").textContent), null, { timeout: 30000 });
    igual("lo dice, con las partidas de las DOS cuentas como una sola persona", await page.textContent("#cuentas-msg"),
      "Listo: se analizaron 47 partidas. Tu profe ya puede ver qué juegas y dónde te va mejor y peor.");
    igual("bajó de Lichess y de Chess.com", [pedidos.some((u) => /lichess\.org\/api\/games\/user\/ana_123/.test(u)), pedidos.some((u) => /api\.chess\.com\/pub\/player\/anar/.test(u))], [true, true]);
    const esc = await page.evaluate(() => window.__escrituras.find((e) => e.tabla === "analisis_partidas_alumno"));
    igual("guarda una fila por alumno (upsert por alumno_id) con los usuarios y el análisis",
      [esc && esc.accion, esc && esc.opciones, esc && esc.fila.alumno_id, esc && esc.fila.lichess, esc && esc.fila.chesscom, esc && esc.fila.partidas,
       esc && esc.fila.analisis && esc.fila.analisis.rival, esc && esc.fila.analisis && esc.fila.analisis.repertorio.blancas[0].san],
      ["upsert", { onConflict: "alumno_id" }, "u-ana", "ana_123", "AnaR", 47, "ana_123", "e4"]);
    igual("y no guarda las partidas", esc && JSON.stringify(esc.fila).includes("[Event"), false);
    await page.evaluate(() => { window.__escrituras.length = 0; });
    await page.fill("#cuenta-lichess", "");
    await page.fill("#cuenta-chesscom", "");
    await page.click("#save-cuentas-btn");
    await page.waitForFunction(() => window.__escrituras.length > 0, null, { timeout: 5000 }).catch(() => {});
    igual("con los dos vacíos, borra SU fila", await page.evaluate(() => window.__escrituras.map((e) => [e.accion, e.donde])),
      [["delete", [["alumno_id", "u-ana"]]]]);
    igual("y lo dice", await page.textContent("#cuentas-msg"), "Se borraron tus usuarios y el resumen de tus partidas.");
    if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
    await ctx.close();

    console.log("\n=== Configuración: con un análisis ya hecho ===");
    const b = await abrir(browser, [{ alumno_id: "u-ana", lichess: "ana_123", chesscom: null, partidas: 19, analizado_at: "2026-10-01T10:00:00Z" }]);
    igual("trae sus usuarios y dice que su profe ya lo ve",
      [await b.page.inputValue("#cuenta-lichess"), await b.page.textContent("#cuentas-msg")],
      ["ana_123", "Tu profe ya ve el análisis de 19 partidas. Puedes volver a analizarlas cuando juegues más."]);
    await b.ctx.close();
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: el análisis de sus partidas se arma, se compara y se guarda.");
  process.exit(fallos ? 1 : 0);
})();
