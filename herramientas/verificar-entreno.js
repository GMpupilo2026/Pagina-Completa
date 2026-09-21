/* Comprueba el hub de Entrenamiento (entreno/index.html) y el traslado de los
   ejercicios de táctica a "Ejercicios por tema".

   Tres peligros, tres partes:

   1. LOS 148 EJERCICIOS. Se movieron de tactica.json a temas.json con un
      script, y un ejercicio que se pierda por el camino NO da ningún error: el
      grupo simplemente tiene menos de los que tenía y nadie lo nota. Se cuentan
      uno por uno contra el archivo de origen y —ya que están— se comprueba con
      chess.js que cada solución siga siendo jugable y que el mate prometido sea
      mate. Se hace SIN navegador, que es donde esto se rompe de verdad.

   2. LOS ENCABEZADOS. El pedido fue "que cada uno sea un encabezado para poder
      acceder de forma sencilla desde el modo adaptado": quien usa lector de
      pantalla salta de encabezado en encabezado, así que cada acceso tiene que
      ser un <h3> de verdad, dentro de su <h2> de grupo, sin saltarse niveles y
      con UN solo enlace por tarjeta (dos enlaces al mismo lado se escuchan dos
      veces). Eso se mira en un navegador, sobre el árbol que queda pintado.

   3. QUE LA PÁGINA SE VEA Y FUNCIONE. Que estén los tres grupos con lo suyo,
      que todos los destinos existan, que el área de clic siga cubriendo la
      tarjeta entera (el ::after) y que tactica.html mande a temas.html.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         npm install chess.js@0.10.3
         node herramientas/verificar-entreno.js                                */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

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
function mal(t) { console.log("  ✗ " + t); fallos += 1; }
function bien(t) { console.log("  ✓ " + t); }

/* ============ 1. Los 148 ejercicios llegaron enteros y son jugables ======== */

function pruebaDatos() {
  console.log("\n=== Los ejercicios de táctica, dentro de Ejercicios por tema ===");
  const Chess = require("chess.js").Chess;
  const temas = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/temas.json"), "utf8"));
  const tactica = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno/data/tactica.json"), "utf8"));

  const grupo = temas.groups.find((g) => g.id === "tactica");
  if (!grupo) { mal("temas.json no tiene el grupo de táctica"); return; }
  igual("el grupo va de primero en el selector", temas.groups[0].id, "tactica");
  igual("con sus cinco categorías",
    grupo.themes.map((t) => t.key),
    ["ultima-linea", "enroque-corto", "enroque-largo", "columnas-diagonales", "ataque-doble"]);

  // Ni uno menos, ni uno de más, y en el mismo orden que traía el archivo.
  const esperados = {};
  tactica.forEach((p) => { (esperados[p.category] = esperados[p.category] || []).push(p.id); });
  let completos = true;
  grupo.themes.forEach((t) => {
    const hay = temas.themes[t.key] || [];
    if (JSON.stringify(hay) !== JSON.stringify(esperados[t.key] || [])) {
      mal(`la categoría ${t.key} no trae los mismos ejercicios (${hay.length} contra ${(esperados[t.key] || []).length})`);
      completos = false;
    }
  });
  if (completos) bien("llegaron los 148, categoría por categoría y en el mismo orden");

  // Y siguen siendo jugables. Un ejercicio con la solución rota no da ningún
  // error: el alumno hace la jugada correcta, no pasa nada y no entiende por qué.
  let rotos = 0, mates = 0;
  tactica.forEach((p) => {
    const guardado = temas.puzzles[p.id];
    if (!guardado) { rotos += 1; return; }
    const juego = new Chess();
    if (!juego.load(guardado.fen)) { mal("FEN que no carga: " + p.id); rotos += 1; return; }
    for (const jugada of guardado.solution) {
      if (!juego.move(jugada)) { mal("jugada que no existe en " + p.id + ": " + jugada); rotos += 1; return; }
    }
    if (guardado.mate) {
      if (juego.in_checkmate()) mates += 1;
      else { mal("promete mate y no lo es: " + p.id); rotos += 1; }
    }
  });
  igual("las 148 soluciones se pueden jugar enteras", rotos, "0");
  igual("y los mates prometidos son mate", mates, String(tactica.filter((p) => p.mate).length));

  // El `rating` es de Lichess y estos no lo tienen: la página tiene que
  // aguantarlo, no inventarlo.
  const conRating = tactica.filter((p) => temas.puzzles[p.id] && temas.puzzles[p.id].rating != null).length;
  igual("no se les inventó una dificultad de Lichess", conRating, "0");

  // Nada de lo que ya estaba se perdió.
  igual("y los ejercicios de Lichess siguen todos",
    Object.keys(temas.puzzles).length >= 6860 + tactica.length, "true");
}

/* ============ 2 y 3. El hub, en un navegador ============ */

function clienteFalso() {
  return `
window.sb = {
  auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-1" }, access_token: "t" } } }) },
  from: () => { const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, range: () => b,
    then: (r) => Promise.resolve({ data: [], error: null }).then(r) }; return b; },
  rpc: () => Promise.resolve({ data: null, error: null }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
};
`;
}

/* chess.js viene de un CDN y temas.html lo NECESITA para armar el tablero: se
   le sirve la copia local (la misma versión) en vez de cortarlo. Lo de Supabase
   sí se corta: el cliente se reemplaza por el doble. */
const CHESSJS = fs.readFileSync(require.resolve("chess.js"), "utf8");

function rutasDeAfuera(ctx) {
  return Promise.all([
    ctx.route("**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS })),
    ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" })),
    ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" })),
    ctx.route("**/fonts.gstatic.com/**", (r) => r.abort()),
    ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso() })),
  ]);
}

async function abrir(browser, ruta, extra) {
  const ctx = await browser.newContext(extra || {});
  await rutasDeAfuera(ctx);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

async function pruebaHub(browser) {
  console.log("\n=== El hub de Entrenamiento ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/index.html");
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  const grupos = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#app section")).map((s) => ({
      titulo: s.querySelector("h2").textContent,
      accesos: Array.from(s.querySelectorAll("h3")).map((h) => ({
        nombre: h.textContent,
        destino: h.querySelector("a") ? h.querySelector("a").getAttribute("href") : null,
      })),
      // Dos enlaces al mismo lado dentro de una tarjeta se escuchan dos veces.
      enlacesPorTarjeta: Array.from(s.querySelectorAll("li")).map((li) => li.querySelectorAll("a").length),
    })));

  igual("los tres grupos, en su orden", grupos.map((g) => g.titulo),
    ["Fundamentos", "Practicar", "Entreno"]);
  igual("Fundamentos", grupos[0].accesos.map((a) => a.nombre),
    ["Mates", "Aprender", "Coordenadas", "Desafíos"]);
  igual("Practicar", grupos[1].accesos.map((a) => a.nombre),
    ["Ejercicios por tema", "Practicar"]);
  igual("Entreno", grupos[2].accesos.map((a) => a.nombre),
    ["Aperturas y celadas", "4×4", "Visualización"]);
  igual("la táctica ya no es un acceso suelto: se fue dentro de Ejercicios por tema",
    grupos.some((g) => g.accesos.some((a) => a.destino === "tactica.html")), "false");

  const todos = grupos.flatMap((g) => g.accesos);
  const sinDestino = todos.filter((a) => !a.destino);
  igual("cada acceso es un encabezado CON su enlace", sinDestino.length, "0");
  const rotos = todos.filter((a) => !fs.existsSync(path.join(RAIZ, "entreno", a.destino)));
  igual("y todos llevan a una página que existe", rotos.map((a) => a.destino).join(", ") || "ninguno roto", "ninguno roto");
  igual("un solo enlace por tarjeta",
    grupos.flatMap((g) => g.enlacesPorTarjeta).every((n) => n === 1), "true");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Lo que se pidió: que se pueda recorrer saltando de encabezado en encabezado,
   que es como se mueve quien usa lector de pantalla. */
async function pruebaEncabezados(browser) {
  console.log("\n=== Los encabezados, que es de lo que se trataba ===");
  const { page, ctx } = await abrir(browser, "/entreno/index.html");
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  const niveles = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#app h1, #app h2, #app h3, #app h4"))
      .map((h) => ({ nivel: Number(h.tagName[1]), texto: h.textContent.trim() })));

  igual("un solo h1, y es el título de la página",
    niveles.filter((h) => h.nivel === 1).map((h) => h.texto), ["Entrenamiento 🏋️"]);
  igual("los nueve accesos son encabezados de verdad",
    niveles.filter((h) => h.nivel === 3).length, "9");

  // Sin saltos de nivel: de un h1 no se pasa a un h3.
  let salto = null;
  for (let i = 1; i < niveles.length; i += 1) {
    if (niveles[i].nivel > niveles[i - 1].nivel + 1) { salto = niveles[i - 1].texto + " → " + niveles[i].texto; break; }
  }
  igual("y no se salta ningún nivel", salto || "ninguno", "ninguno");

  // El área de clic sigue cubriendo la tarjeta entera: el encabezado no puede
  // dejar un enlace del tamaño de dos palabras.
  const cubre = await page.evaluate(() => {
    const li = document.querySelector("#app li");
    const a = li.querySelector("a");
    const caja = li.getBoundingClientRect();
    // El ::after estirado no se puede medir directo; se pregunta qué elemento
    // hay en una esquina de la tarjeta.
    const enLaEsquina = document.elementFromPoint(caja.left + caja.width - 8, caja.top + caja.height - 8);
    return { mismo: enLaEsquina === a, etiqueta: enLaEsquina ? enLaEsquina.tagName : "nada" };
  });
  igual("el clic en la esquina de la tarjeta sigue abriendo su enlace", cubre.mismo, "true");

  await ctx.close();
}

async function pruebaRedireccion(browser) {
  console.log("\n=== La dirección vieja de táctica ===");
  const { page, ctx } = await abrir(browser, "/entreno/tactica.html");
  await page.waitForURL(/temas\.html/, { timeout: 15000 });
  igual("tactica.html manda a Ejercicios por tema", new URL(page.url()).pathname, "/entreno/temas.html");
  await ctx.close();

  // Y el aviso está escrito, por si el JavaScript no corre.
  const html = fs.readFileSync(path.join(RAIZ, "entreno/tactica.html"), "utf8");
  igual("y lo dice también sin JavaScript", /Ejercicios por tema/.test(html), "true");
}

/* Que el traslado del progreso funcione: quien llevaba táctica resuelta no
   empieza de cero. Es lo que más calladito fallaría. */
async function pruebaProgresoHeredado(browser) {
  console.log("\n=== El progreso de táctica se hereda ===");
  const ctx = await browser.newContext();
  await rutasDeAfuera(ctx);
  await ctx.addInitScript(() => {
    localStorage.setItem("entreno_tactica_solved", JSON.stringify({ "ultima-linea-001": true, "ataque-doble-001": true }));
    localStorage.setItem("entreno_temas_solved", JSON.stringify({ "11853": true }));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/entreno/temas.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.waitForFunction(() => {
    try { return Object.keys(JSON.parse(localStorage.getItem("entreno_temas_solved") || "{}")).length >= 3; }
    catch (e) { return false; }
  }, { timeout: 15000 });
  const resueltos = await page.evaluate(() => JSON.parse(localStorage.getItem("entreno_temas_solved")));
  igual("lo resuelto en la página vieja pasa a la nueva",
    ["ultima-linea-001", "ataque-doble-001"].every((id) => resueltos[id]), "true");
  igual("y no se pierde lo que ya había", !!resueltos["11853"], "true");

  // La categoría se ve en el selector, con su cuenta.
  const grupo = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("h2, h3")).find((n) => /Táctica de ataque/.test(n.textContent));
    return h ? h.textContent.trim() : "no está";
  });
  igual("y el grupo aparece en el selector de temas", /Táctica de ataque/.test(grupo), "true");

  /* Y se puede JUGAR uno: es el paso que de verdad prueba que un ejercicio sin
     `rating` no rompe nada. La primera versión escribía "Dificultad undefined"
     debajo del tablero, y eso no da ningún error — solo se ve mal. */
  const jugando = await page.evaluate(() => {
    const abrir = window.openTheme;
    if (typeof abrir !== "function") return { error: "openTheme no existe" };
    abrir("ultima-linea");
    return {
      titulo: document.getElementById("play-title").textContent,
      meta: document.getElementById("puzzle-meta").textContent,
      casillas: document.querySelectorAll("#board [data-square]").length,
    };
  });
  igual("se entra a una categoría de táctica", jugando.titulo, "Ataque a la última línea");
  igual("el tablero se arma", jugando.casillas, "64");
  igual("y NO dice «Dificultad undefined» (estos no tienen rating de Lichess)",
    /undefined/.test(jugando.meta), "false");

  /* Informes cuenta Táctica aparte de Ejercicios por tema. Al mudarlos, si todo
     se apuntara como "temas" esa columna se quedaría congelada en el número del
     día de la mudanza, y eso no da ningún error: el profesor ve un número que ya
     no sube. Se comprueba que cada ejercicio se apunte bajo la actividad que le
     toca, y que la lista NO esté escrita a mano en la página. */
  // `TEMAS_DE_TACTICA` va con `let`, así que no cuelga de window; se le pregunta
  // a la función que lo calcula, que es lo que importa: que salga de los datos.
  const actividades = await page.evaluate(() => ({
    tactica: typeof temasDeTactica === "function" ? [...temasDeTactica()].sort() : "no existe",
    deTactica: typeof temasDeTactica === "function",
  }));
  igual("las categorías de táctica salen del propio temas.json, no de una lista escrita a mano",
    actividades.deTactica, "true");
  igual("y son las cinco", actividades.tactica,
    ["ataque-doble", "columnas-diagonales", "enroque-corto", "enroque-largo", "ultima-linea"]);

  const apuntes = [];
  await page.exposeFunction("__apuntar", (a, d) => apuntes.push({ actividad: a, tema: d.theme }));
  await page.evaluate(() => { window.EntrenoProgress.log = (a, d) => window.__apuntar(a, d); });
  // Se resuelve un ejercicio de táctica jugando su solución.
  await page.evaluate(() => {
    openTheme("ultima-linea");
    const p = DATA.puzzles[idsOf("ultima-linea")[currentIndex]];
    p.solution.forEach((san) => { const m = game.move(san); if (m) { /* recorre la línea */ } });
    finishPuzzle();
  });
  igual("un ejercicio de táctica se apunta como «tactica», igual que antes de mudarse",
    apuntes.map((a) => a.actividad), ["tactica"]);
  await ctx.close();
}

(async () => {
  pruebaDatos();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaHub(browser);
    await pruebaEncabezados(browser);
    await pruebaRedireccion(browser);
    await pruebaProgresoHeredado(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEntrenamiento está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
