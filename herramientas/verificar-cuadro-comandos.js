/* Comprueba el cuadro de comandos de los ejercicios (js/cuadro-comandos.js):
   que en Modo Adaptado se pueda contestar TODO sin tocar el tablero.

   Por qué hace falta, y por qué en un navegador de verdad:

   1. UN EJERCICIO INCONTESTABLE NO DA ERROR. El diagnóstico se veía perfecto y
      media prueba —los ítems de tablero— no se podía contestar con lector de
      pantalla. Nada fallaba: la página cargaba, el ejercicio se pintaba, y
      quien no podía verlo simplemente no avanzaba. Así que acá se contesta de
      verdad, escribiendo, y se mira qué quedó elegido.

   2. QUE SE VEA, NO QUE ESTÉ. El cuadro se monta siempre y lo destapa el CSS
      (html.adaptive-mode). Preguntar por la clase o por el atributo daría verde
      sobre una página rota — es la misma lección de verificar-pwa.js con el
      cartel de instalar. Se mide el `display` que calcula el navegador.

   3. LAS LETRAS DE LAS OPCIONES TIENEN QUE ESTAR ESCRITAS. Si la "A" se pusiera
      con CSS (un ::before, un contador), se vería igual en pantalla y el lector
      de pantalla no la diría: quien contesta por el cuadro no sabría qué letra
      escribir. Se lee el texto del botón.

   4. LA POSICIÓN, PEGADA AL CUADRO. Leerla y contestarla son el mismo gesto.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         npm install playwright chess.js@0.10.3
         node herramientas/verificar-cuadro-comandos.js                        */
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

const CHESSJS = fs.readFileSync(require.resolve("chess.js"), "utf8");

/* Supabase de mentira: estas páginas piden la sesión y el perfil al cargar, y
   sin respuesta se quedan en "Cargando…" para siempre. Devuelve un profesor
   con is_admin, que es el caso que más cosas destapa. */
const STUB = `
window.SUPABASE_URL = "https://ejemplo.supabase.co";
window.SUPABASE_ANON_KEY = "clave-de-mentira";
window.sb = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: { user: { id: "u-1", email: "p@ejemplo.com" }, access_token: "t" } } }),
    getUser: () => Promise.resolve({ data: { user: { id: "u-1", email: "p@ejemplo.com" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: () => Promise.resolve({ error: null }),
  },
  from: () => {
    const fila = { id: "u-1", role: "profesor", is_admin: true, full_name: "Profe", elo: null, elo_tipo: "fide" };
    const b = {
      select: () => b, eq: () => b, in: () => b, or: () => b, order: () => b, limit: () => b,
      range: () => b, gte: () => b, lte: () => b, ilike: () => b, upsert: () => b, insert: () => b,
      update: () => b, delete: () => b,
      single: () => Promise.resolve({ data: fila, error: null }),
      maybeSingle: () => Promise.resolve({ data: fila, error: null }),
      then: (r) => Promise.resolve({ data: [], error: null }).then(r),
    };
    return b;
  },
  rpc: () => Promise.resolve({ data: null, error: null }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
};`;

async function abrir(browser, ruta, adaptado) {
  const ctx = await browser.newContext();
  // Ojo con el orden: playwright resuelve la ÚLTIMA ruta que encaje, así que la
  // de chess.js va después de la de su CDN. Al revés, chess.js llegaba vacío y
  // la página moría con "Chess is not defined" — que es justo lo que esta
  // prueba tiene que ver en la página, no en su propio andamiaje.
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/cdnjs.cloudflare.com/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  if (adaptado) await ctx.addInitScript(() => localStorage.setItem("oscarBlindMode_v1", "1"));
  else await ctx.addInitScript(() => localStorage.setItem("oscarBlindMode_v1", "0"));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push("console: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

/* ============ 1. Los ayudantes, sin navegador de por medio ============ */

function pruebaLectura() {
  console.log("\n=== Entender lo que se escribe ===");
  const src = fs.readFileSync(path.join(RAIZ, "js", "cuadro-comandos.js"), "utf8");
  const ventana = { document: { createElement: () => ({ style: {}, classList: { add() {}, contains: () => false }, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, documentElement: { classList: { contains: () => false } } } };
  const fn = new Function("window", "document", src + "\n;return window.CuadroComandos;");
  const CC = fn(ventana, ventana.document);

  // La letra de la opción, escrita de todas las formas en que alguien la dice.
  const casos = [["A", 0], ["b", 1], ["C)", 2], ["opción D", 3], ["Opcion b", 1], ["la c", 2], ["2", 1]];
  let malos = 0;
  casos.forEach(([txt, esperado]) => { if (CC.opcionPedida(txt, 4) !== esperado) { mal(`"${txt}" debería ser la opción ${esperado} y dio ${CC.opcionPedida(txt, 4)}`); malos += 1; } });
  if (!malos) bien("se entiende la letra de la opción escrita de siete formas distintas");
  // Y lo que NO se entiende se dice que no se entendió, en vez de marcar cualquiera.
  igual("una letra fuera de rango no marca nada", CC.opcionPedida("F", 4), "null");
  igual("un texto cualquiera tampoco", CC.opcionPedida("la de arriba", 4), "null");

  // La casilla, también con el nombre hablado de la columna.
  igual('"e4" es e4', CC.casillaPedida("e4"), "e4");
  igual('"eva 4" es e4 (así se dicen las columnas en todo el sitio)', CC.casillaPedida("eva 4"), "e4");
  igual('"E 4" es e4', CC.casillaPedida("E 4"), "e4");
  igual('"z9" no es ninguna casilla', CC.casillaPedida("z9"), "null");

  // "No lo sé" es una respuesta del diagnóstico, no un saltar: tiene que poder
  // escribirse igual que se puede apretar.
  ["no lo sé", "no se", "No lo sé todavía", "ns", "ni idea"].forEach((t) => {
    if (!CC.esNoSe(t)) { mal(`"${t}" debería contar como "no lo sé"`); }
  });
  igual('y "Cf3" no es un "no lo sé"', CC.esNoSe("Cf3"), "false");
  igual("las letras de las opciones son A, B, C, D", [0, 1, 2, 3].map(CC.letra), ["A", "B", "C", "D"]);
}

/* ============ 2. La posición en palabras sale de un solo lugar ============ */

function pruebaPosicionUnaSolaVez() {
  console.log("\n=== La posición en palabras ===");
  const bn = fs.readFileSync(path.join(RAIZ, "js", "blind-notation.js"), "utf8");
  const cc = fs.readFileSync(path.join(RAIZ, "js", "cuadro-comandos.js"), "utf8");
  // El cuadro NO puede tener su propia tabla de nombres de pieza: sería la
  // cuarta copia, y las cuatro se irían separando. Los plurales escritos viven
  // en blind-notation.js y de ahí tienen que salir.
  if (/alfil|caballo|peón|peon\b/i.test(cc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, ""))) {
    mal("js/cuadro-comandos.js escribió sus propios nombres de pieza: tienen que salir de blind-notation.js");
  } else bien("el cuadro no tiene su propia tabla de nombres de pieza");
  if (!/positionSentence/.test(bn)) mal("falta positionSentence() en js/blind-notation.js");
  else bien("positionSentence() vive en blind-notation.js, con groupedReadoutHTML");
  // Y sin encabezados: la página donde entra ya tiene su árbol.
  const fn = new Function("window", "document", bn + "\n;return window.BlindNotation;");
  const BN = fn({}, { createElement: () => ({ style: {} }) });
  const Chess = require("chess.js").Chess;
  const frase = BN.positionSentence(new Chess("8/8/8/8/4K3/8/5b2/6k1 w - - 0 1"));
  igual("la frase no trae ningún encabezado", /<h[1-6]/.test(frase), "false");
  igual("y cuenta las piezas por su nombre y su casilla hablada",
    /Blancas: rey en eva 4\./.test(frase) && /alfil en felix 2/.test(frase), "true");
}

/* ============ 3. El diagnóstico, contestado sin tocar el tablero ============ */

/* Todo lo que esta prueba mira sale de la PANTALLA, nunca de una variable
   interna de la página: qué dice el botón, qué dice la etiqueta del cuadro,
   qué piezas hay dibujadas en el tablero. Es a propósito — es exactamente lo
   que recibe quien contesta, y una prueba que espiara las variables daría
   verde sobre una página que no se puede contestar. */

const GLIFO = {
  "♙": "P", "♘": "N", "♗": "B", "♖": "R", "♕": "Q", "♔": "K",
  "♟": "p", "♞": "n", "♝": "b", "♜": "r", "♛": "q", "♚": "k",
};

/* La posición que se está viendo, leída del tablero dibujado, más el turno que
   dice la lectura en palabras. Con eso se arma una FEN y chess.js puede decir
   qué jugadas son legales — igual que podría hacerlo quien escucha. */
async function fenDeLaPantalla(page, selTablero, selPos) {
  const d = await page.evaluate(([st, sp, glifos]) => {
    const casillas = {};
    document.querySelectorAll(st + " [data-square]").forEach((c) => {
      // De la casilla se saca SOLO el glifo de la pieza: las del borde llevan
      // además su etiqueta de coordenada (js/coordenadas-tablero.js), y leer el
      // texto entero daba "♔e" — una casilla que parecía vacía y una FEN sin rey.
      const g = [...c.textContent].find((ch) => glifos.indexOf(ch) !== -1);
      if (g) casillas[c.dataset.square] = g;
    });
    const pos = document.querySelector(sp);
    return { casillas, texto: pos ? pos.textContent : "" };
  }, [selTablero, selPos, Object.keys(GLIFO).join("")]);
  let filas = [];
  for (let rank = 8; rank >= 1; rank--) {
    let fila = "", vacias = 0;
    for (const f of "abcdefgh") {
      const g = d.casillas[f + rank];
      const p = g ? GLIFO[g] : null;
      if (!p) { vacias += 1; continue; }
      if (vacias) { fila += vacias; vacias = 0; }
      fila += p;
    }
    if (vacias) fila += vacias;
    filas.push(fila);
  }
  const turno = /Juegan negras/.test(d.texto) ? "b" : "w";
  return filas.join("/") + " " + turno + " - - 0 1";
}

/* De qué tipo es la pregunta en pantalla: lo dice la etiqueta del propio cuadro
   de comandos, que es lo único que sobre esto oye quien contesta. */
async function tipoEnPantalla(page) {
  const t = await page.evaluate(() => {
    const l = document.querySelector("#q-comandos .cc-etiqueta");
    return l ? l.textContent : "";
  });
  if (/letra de la opción/.test(t)) return "opcion";
  if (/la casilla/.test(t)) return "casilla";
  if (/tu jugada/.test(t)) return "jugada";
  return "?";
}

async function saltarPortada(page) {
  await page.click("#start-btn");
  await page.waitForSelector("#q-options button", { timeout: 15000 });
}

// Avanza hasta la primera pregunta del tipo pedido, contestando "no lo sé" por
// el camino. Devuelve false si la prueba se terminó antes.
async function irHasta(page, tipo) {
  for (let i = 0; i < 70; i++) {
    if (await page.locator("#result-view:not(.hidden)").count()) return false;
    if ((await tipoEnPantalla(page)) === tipo) return true;
    if (!(await page.locator("#no-se-btn").count())) return false;
    await page.click("#no-se-btn");
    await page.click("#next-btn");
    await page.waitForTimeout(25);
  }
  return false;
}

// Qué opción quedó marcada, mirando el estilo que de verdad calcula el
// navegador y no la clase: una clase puesta no garantiza que se vea.
async function marcada(page) {
  return page.evaluate(() => {
    const botones = [...document.querySelectorAll("#q-options button")]
      .filter((b) => b.id !== "no-se-btn" && !/blanco/i.test(b.textContent));
    const fondos = botones.map((b) => getComputedStyle(b).backgroundColor);
    // La elegida es la única con un fondo distinto del resto.
    const cuenta = {};
    fondos.forEach((c) => { cuenta[c] = (cuenta[c] || 0) + 1; });
    return fondos.findIndex((c) => cuenta[c] === 1);
  });
}

async function pruebaDiagnostico(browser) {
  console.log("\n=== El diagnóstico, en Modo Adaptado ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/diagnostico.html", true);
  await saltarPortada(page);

  // Se ve de verdad, no "tiene la clase".
  igual("el cuadro de comandos se ve en Modo Adaptado",
    await page.evaluate(() => { const c = document.querySelector("#q-comandos .cc-caja"); return c ? getComputedStyle(c).display : "no se montó"; }), "block");

  // --- una pregunta de opción
  if (!(await irHasta(page, "opcion"))) mal("no se encontró ninguna pregunta de opción");
  else {
    const letras = await page.evaluate(() =>
      [...document.querySelectorAll("#q-options button")].filter((b) => b.id !== "no-se-btn").map((b) => b.textContent.slice(0, 9)));
    igual("cada opción dice su letra, escrita en el botón",
      letras.length > 1 && letras.every((t, i) => t === "Opción " + "ABCDEFGH"[i] + "."), "true");

    await page.fill("#q-comandos .cc-input", "B");
    await page.press("#q-comandos .cc-input", "Enter");
    igual('escribir "B" marca la segunda opción', await marcada(page), "1");
    igual("y se puede pasar a la siguiente", await page.evaluate(() => !document.getElementById("next-btn").disabled), "true");
    igual("y se dice qué quedó elegido",
      await page.evaluate(() => /opción B/.test(document.querySelector("#q-comandos .cc-msg").textContent)), "true");

    // Tocar el botón tiene que dejar lo mismo que escribir su letra.
    await page.evaluate(() => [...document.querySelectorAll("#q-options button")].filter((b) => b.id !== "no-se-btn")[1].click());
    igual("y tocar esa misma opción deja lo mismo", await marcada(page), "1");

    // Lo que no se entiende se dice, no se marca cualquier cosa.
    await page.fill("#q-comandos .cc-input", "la de arriba");
    await page.press("#q-comandos .cc-input", "Enter");
    igual("un texto que no se entiende no cambia la respuesta", await marcada(page), "1");
    igual("y lo dice",
      await page.evaluate(() => /No entendí/.test(document.querySelector("#q-comandos .cc-msg").textContent)), "true");

    // "No lo sé" es una respuesta del diagnóstico, no un saltar: se guarda
    // aparte de un error. Tiene que poder escribirse igual que apretarse.
    await page.fill("#q-comandos .cc-input", "no lo sé");
    await page.press("#q-comandos .cc-input", "Enter");
    igual('escribir "no lo sé" hace lo mismo que su botón',
      await page.evaluate(() => /no lo sabías/.test(document.getElementById("q-hint").textContent)), "true");
    await page.click("#next-btn");
  }

  // --- una pregunta de jugada
  if (!(await irHasta(page, "jugada"))) mal("no se encontró ninguna pregunta de jugada");
  else {
    igual("la posición va contada en palabras, encima del cuadro",
      await page.evaluate(() => /Blancas:.*Negras:/.test(document.querySelector("#q-comandos .cc-pos").textContent)), "true");
    igual("y el cuadro va justo después de esa lectura",
      await page.evaluate(() => {
        const pos = document.querySelector("#q-comandos .cc-pos");
        return !!pos && pos.nextElementSibling && pos.nextElementSibling.classList.contains("cc-form");
      }), "true");
    const fen = await fenDeLaPantalla(page, "#q-board", "#q-comandos .cc-pos");
    const { Chess } = require("chess.js");
    const juego = new Chess(fen);
    const mv = juego.moves({ verbose: true })[0];
    if (!mv) mal("no se pudo leer la posición del tablero para probar una jugada (" + fen + ")");
    else {
      await page.fill("#q-comandos .cc-input", mv.san);
      await page.press("#q-comandos .cc-input", "Enter");
      igual(`una jugada escrita (${mv.san}) queda como respuesta`,
        await page.evaluate(() => /esa es tu respuesta/.test(document.getElementById("q-hint").textContent)), "true");
      igual("y se puede pasar a la siguiente",
        await page.evaluate(() => !document.getElementById("next-btn").disabled), "true");
      igual("y el tablero muestra la jugada hecha",
        await page.evaluate((to) => {
          const c = document.querySelector(`#q-board [data-square="${to}"]`);
          return !!c && c.textContent.trim().length > 0;
        }, mv.to), "true");
    }
    await page.fill("#q-comandos .cc-input", "Txz9");
    await page.press("#q-comandos .cc-input", "Enter");
    igual("una jugada ilegal se rechaza diciéndolo",
      await page.evaluate(() => /no es una jugada legal/.test(document.querySelector("#q-comandos .cc-msg").textContent)), "true");
    await page.click("#next-btn");
  }

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Las preguntas de casilla son 2 de las 301 del banco: una prueba sorteada al
   azar casi nunca trae una, y dejarlo al azar es dejar ese camino sin probar
   —que es como no tenerlo—. Se siembra el estado guardado con esos dos ítems:
   la página los toma al retomar la prueba, que es un camino suyo de verdad y no
   una puerta de pruebas. */
async function pruebaCasilla(browser) {
  console.log("\n=== Una pregunta que se contesta con una casilla ===");
  const ctx = await browser.newContext();
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/cdnjs.cloudflare.com/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  await ctx.addInitScript(() => {
    localStorage.setItem("oscarBlindMode_v1", "1");
    localStorage.setItem("diagnostico_estado_v1", JSON.stringify({
      version: 4,
      estado: { perfil: {}, idx: 0, respuestas: {}, items: ["fin_oposicion", "cal_jaque_doble"] },
    }));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/entreno/diagnostico.html", { waitUntil: "networkidle" });
  await page.click("#start-btn");
  await page.waitForSelector("#q-options button", { timeout: 15000 });
  if (!(await irHasta(page, "casilla"))) mal("la prueba sembrada no trajo ninguna pregunta de casilla");
  else {
    await page.fill("#q-comandos .cc-input", "eva 4");
    await page.press("#q-comandos .cc-input", "Enter");
    igual('escribir la casilla hablada ("eva 4") responde e4',
      await page.evaluate(() => /Elegiste e4/.test(document.getElementById("q-hint").textContent)), "true");
    igual("y se puede pasar a la siguiente",
      await page.evaluate(() => !document.getElementById("next-btn").disabled), "true");
    await page.fill("#q-comandos .cc-input", "z9");
    await page.press("#q-comandos .cc-input", "Enter");
    igual("una casilla que no existe se rechaza diciéndolo",
      await page.evaluate(() => /No entendí/.test(document.querySelector("#q-comandos .cc-msg").textContent)), "true");
  }
  await ctx.close();
}

/* Fuera del Modo Adaptado el cuadro no estorba: un campo de texto invisible
   pero enfocable sería una parada de tabulador fantasma para quien ve. */
async function pruebaFueraDelModo(browser) {
  console.log("\n=== Fuera del Modo Adaptado ===");
  const { page, ctx } = await abrir(browser, "/entreno/diagnostico.html", false);
  await saltarPortada(page);
  const r = await page.evaluate(() => {
    const c = document.querySelector("#q-comandos .cc-caja");
    const input = document.querySelector("#q-comandos .cc-input");
    return { display: c ? getComputedStyle(c).display : "no está", montado: !!c, inputVisible: input ? input.offsetParent !== null : false };
  });
  igual("el cuadro se monta igual (el modo se enciende sin repintar)", r.montado, "true");
  igual("pero no se ve", r.display, "none");
  igual("y su campo no recibe el foco de nadie", r.inputVisible, "false");
  igual("las letras de las opciones están siempre, no solo en Adaptado",
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("#q-options button")].find((x) => x.id !== "no-se-btn");
      return !!b && /^Opción [A-Z]\./.test(b.textContent);
    }), "true");
  await ctx.close();
}

/* ============ 4. Los exámenes de arbitraje ============ */

async function pruebaArbitraje(browser, ruta, nombre) {
  console.log("\n=== " + nombre + " ===");
  const { page, ctx, errores } = await abrir(browser, ruta, true);
  // La versión pública pide nombre y correo antes de empezar; la docente no.
  if (await page.locator("#datos-form").count()) {
    await page.click("#ir-form-btn");
    await page.fill("#f-nombre", "Persona de prueba");
    await page.fill("#f-email", "prueba@ejemplo.com");
    await page.click("#datos-form button[type=submit]");
  } else if (await page.locator("#start-btn").count()) {
    await page.click("#start-btn");
  } else { mal(nombre + ": no se encontró por dónde empezar el examen"); await ctx.close(); return; }
  await page.waitForSelector("#q-options button", { timeout: 15000 });
  const letras = await page.evaluate(() =>
    [...document.querySelectorAll("#q-options button")].filter((b) => !/blanco/i.test(b.textContent)).map((b) => b.textContent.slice(0, 9)));
  igual("cada opción dice su letra", letras.length > 1 && letras.every((t, i) => t === "Opción " + "ABCDEFGH"[i] + "."), "true");
  igual("el cuadro de comandos se ve",
    await page.evaluate(() => { const c = document.querySelector(".cc-caja"); return c ? getComputedStyle(c).display : "no se montó"; }), "block");
  await page.fill(".cc-input", "C");
  await page.press(".cc-input", "Enter");
  igual('escribir "C" marca la tercera opción', await marcada(page), "2");
  igual("y se dice qué quedó elegido",
    await page.evaluate(() => /opción C/.test(document.querySelector(".cc-msg").textContent)), "true");
  // "Dejar en blanco" también se escribe: es una respuesta, no un saltar.
  await page.fill(".cc-input", "en blanco");
  await page.press(".cc-input", "Enter");
  igual('escribir "en blanco" la deja en blanco', await marcada(page), "-1");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ============ 5. Ejercicios por tema ============ */

async function pruebaTemas(browser) {
  console.log("\n=== Ejercicios por tema ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/temas.html", true);
  // Hay que entrar a un tema: el tablero no existe hasta entonces.
  await page.waitForSelector("button[data-theme]", { timeout: 25000 });
  await page.click("button[data-theme]");
  await page.waitForSelector("#board [data-square]", { timeout: 25000 });
  await page.waitForFunction(() => {
    const p = document.querySelector(".cc-pos");
    return p && p.textContent.length > 20;
  }, null, { timeout: 25000 });
  igual("el cuadro de comandos se ve",
    await page.evaluate(() => { const c = document.querySelector(".cc-caja"); return c ? getComputedStyle(c).display : "no se montó"; }), "block");
  igual("con la posición contada en palabras",
    await page.evaluate(() => /Blancas:.*Negras:/.test(document.querySelector(".cc-pos").textContent)), "true");

  const fen = await fenDeLaPantalla(page, "#board", ".cc-pos");
  const { Chess } = require("chess.js");
  const juego = new Chess(fen);
  const mv = juego.moves({ verbose: true })[0];
  if (!mv) mal("no se pudo leer la posición del tablero (" + fen + ")");
  else {
    await page.fill(".cc-input", mv.san);
    await page.press(".cc-input", "Enter");
    await page.waitForTimeout(500);
    // O la jugada era la de la solución (y avanza) o no lo era (y lo dice); lo
    // que NO puede pasar es que escribirla no haga nada.
    igual(`escribir una jugada legal (${mv.san}) hace algo`,
      await page.evaluate(() => {
        const est = document.getElementById("round-status").textContent.trim();
        const msg = document.querySelector(".cc-msg").textContent.trim();
        return (est + msg).length > 0;
      }), "true");
  }
  await page.fill(".cc-input", "Txz9");
  await page.press(".cc-input", "Enter");
  igual("una jugada ilegal se rechaza diciéndolo",
    await page.evaluate(() => /no es una jugada legal/i.test(document.querySelector(".cc-msg").textContent)), "true");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ============ 6. Racha táctica y ¡Te reto! ============ */

/* Las dos son el mismo ejercicio contrarreloj y hasta ahora ni siquiera
   cargaban js/adaptive-mode.js: no tenían Modo Adaptado, ni interruptor, ni
   forma de contestar que no fuera tocar el tablero. */
async function pruebaContrarreloj(browser, ruta, nombre) {
  console.log("\n=== " + nombre + " ===");
  const { page, ctx, errores } = await abrir(browser, ruta, true);
  // ¡Te reto! pide el nombre antes de arrancar (y arranca sola al ponerlo);
  // Racha táctica tiene su botón de empezar.
  if (await page.locator("#name-input").count()) {
    await page.fill("#name-input", "Persona de prueba");
    await page.press("#name-input", "Enter");
  } else {
    await page.click("#start-btn");
  }
  await page.waitForSelector("#board [data-square]", { timeout: 25000 });
  await page.waitForFunction(() => {
    const p = document.querySelector(".cc-pos");
    return p && p.textContent.length > 20;
  }, null, { timeout: 25000 });
  igual("el cuadro de comandos se ve",
    await page.evaluate(() => { const c = document.querySelector(".cc-caja"); return c ? getComputedStyle(c).display : "no se montó"; }), "block");
  igual("con la posición contada en palabras",
    await page.evaluate(() => /Blancas:.*Negras:/.test(document.querySelector(".cc-pos").textContent)), "true");

  const fen = await fenDeLaPantalla(page, "#board", ".cc-pos");
  const { Chess } = require("chess.js");
  const juego = new Chess(fen);
  const mv = juego.moves({ verbose: true })[0];
  if (!mv) mal("no se pudo leer la posición del tablero (" + fen + ")");
  else {
    await page.fill(".cc-input", mv.san);
    await page.press(".cc-input", "Enter");
    await page.waitForTimeout(600);
    // Acertó o falló, da igual: lo que NO puede pasar es que escribir una
    // jugada legal no haga nada.
    igual(`escribir una jugada legal (${mv.san}) hace algo`,
      await page.evaluate(() => document.getElementById("result-text").textContent.trim().length > 0
        || document.querySelector(".cc-msg").textContent.trim().length > 0), "true");
  }
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

(async () => {
  pruebaLectura();
  pruebaPosicionUnaSolaVez();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaDiagnostico(browser);
    await pruebaCasilla(browser);
    await pruebaFueraDelModo(browser);
    await pruebaArbitraje(browser, "/arbitraje.html", "Examen de arbitraje (docente)");
    await pruebaArbitraje(browser, "/nivel-de-arbitraje.html", "Examen de arbitraje (público)");
    await pruebaTemas(browser);
    await pruebaContrarreloj(browser, "/racha-tactica.html", "Racha táctica");
    await pruebaContrarreloj(browser, "/te-reto.html", "¡Te reto!");
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo se puede contestar sin tocar el tablero.");
  process.exit(fallos ? 1 : 0);
})();
