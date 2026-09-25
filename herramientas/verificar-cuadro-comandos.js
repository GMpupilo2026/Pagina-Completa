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

   5. EL ENTER QUE CONTESTA TAMBIÉN AVANZA. Y eso trae dos cosas que comprobar:
      que la respuesta quedó ANOTADA (no basta con que la pantalla haya pasado
      de pregunta) y que el aviso lee la pregunta nueva — al no pasar por el
      botón, ya no hay nada que anuncie el cambio. En la última, ese Enter
      termina la prueba: quedarse trabado ahí dejaría a quien contesta
      escribiendo sin forma de llegar al resultado.

   6. EL ORDEN EN QUE SE OFRECEN LAS COSAS. Un ejercicio se recorre de arriba
      abajo: primero hay que saber QUÉ HAY en el tablero y recién después
      contestarlo. Si la lectura de la posición queda debajo del recuadro y de la
      ayuda, hay que recorrer medio ejercicio para enterarse de qué se trata — y
      la página se ve exactamente igual. Por eso se mide el orden del DOM, y que
      la ayuda arranque plegada.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         npm install playwright chess.js@0.10.3
         node herramientas/verificar-cuadro-comandos.js                        */
const { chromium } = require("./lib/playwright-con-sesion");
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

/* Sin service worker, a propósito. Estas páginas lo registran, y al RECARGAR
   es él quien sirve los archivos: lo que pide el service worker no pasa por las
   rutas del contexto, así que volvía el js/supabase-client.js de verdad y la
   página moría con "createClient de undefined". Es la misma piedra que ya
   documentó verificar-reportes.js. Acá no se comprueba el service worker —de
   eso se encarga verificar-pwa.js—, así que lo más honesto es apagarlo. */
const SIN_SW = { serviceWorkers: "block" };

async function abrir(browser, ruta, adaptado) {
  const ctx = await browser.newContext(SIN_SW);
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
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
      // En Modo Adaptado, sin nada elegido, la pieza sale DIBUJADA con aro (ver
      // js/piece-style-themes.js), y desde que los ejercicios pasan por
      // js/pieza-preferida.js la respetan: el dibujo se lee por su <use>.
      const use = c.querySelector(".chess-piece-svg use");
      if (use) casillas[c.dataset.square] = (use.getAttribute("xlink:href") || use.getAttribute("href") || "").slice(1);
    });
    const pos = document.querySelector(sp);
    return { casillas, texto: pos ? pos.textContent : "" };
  }, [selTablero, selPos, Object.keys(GLIFO).join("")]);
  let filas = [];
  for (let rank = 8; rank >= 1; rank--) {
    let fila = "", vacias = 0;
    for (const f of "abcdefgh") {
      const g = d.casillas[f + rank];
      // "wK" / "bn": el id del dibujo es color + tipo.
      const p = !g ? null : GLIFO[g] || (g.length === 2 ? (g[0] === "w" ? g[1].toUpperCase() : g[1].toLowerCase()) : null);
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
  // Hay que esperar a que init() termine: mientras la página sigue pidiendo la
  // sesión, "Empezar" cree que no hay cuenta y reclama nombre y correo. Se
  // espera a que el propio #app se destape, que es lo que init() hace al final.
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
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

/* El estado que la propia página guarda en localStorage para poder retomar la
   prueba. No es una variable interna: es lo que escribe y vuelve a leer al
   recargar, y es la única forma de comprobar desde afuera que la respuesta
   quedó ANOTADA y no solo que la pantalla pasó de pregunta. */
async function respuestaGuardada(page, cuantasAtras) {
  return page.evaluate((atras) => {
    const crudo = JSON.parse(localStorage.getItem("diagnostico_estado_v1") || "null");
    if (!crudo || !crudo.estado) return null;
    const e = crudo.estado;
    const id = e.items[e.idx - atras];
    return id ? (e.respuestas[id] || null) : null;
  }, cuantasAtras);
}

/* Todo lo que pasa por un renglón, no solo cómo quedó al final. Hace falta
   porque en los ejercicios el aviso es de paso: al acertar, el ejercicio
   siguiente se carga a los 350 ms y lo borra, así que mirar el texto "después"
   es una carrera que se pierde de vez en cuando sin que nada esté roto. Y
   mirarlo "a ver si no está vacío" no probaba nada: ya empieza con el "Haz clic
   en la pieza que quieres mover". */
async function vigilar(page, sel) {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    window.__vistos = [el ? el.textContent.trim() : ""];
    if (!el) return;
    new MutationObserver(() => window.__vistos.push(el.textContent.trim()))
      .observe(el, { childList: true, subtree: true, characterData: true });
  }, sel);
}
async function loVisto(page) {
  return page.evaluate(() => window.__vistos || []);
}

async function enPantalla(page, sel) {
  return page.evaluate((s) => { const el = document.querySelector(s); return el ? el.textContent.trim() : ""; }, sel);
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

    // Tocar el botón NO avanza: ahí se ve la pantalla y poder cambiar de idea
    // antes de seguir es lo normal.
    const antesDeTocar = await enPantalla(page, "#q-counter");
    await page.evaluate(() => [...document.querySelectorAll("#q-options button")].filter((b) => b.id !== "no-se-btn")[1].click());
    igual("tocar la segunda opción la marca", await marcada(page), "1");
    igual("y NO pasa de pregunta (el botón no avanza)", await enPantalla(page, "#q-counter"), antesDeTocar);

    // Lo que no se entiende se dice, no se marca cualquier cosa ni se avanza.
    await page.fill("#q-comandos .cc-input", "la de arriba");
    await page.press("#q-comandos .cc-input", "Enter");
    igual("un texto que no se entiende no cambia la respuesta", await marcada(page), "1");
    igual("ni pasa de pregunta", await enPantalla(page, "#q-counter"), antesDeTocar);
    igual("y lo dice",
      await page.evaluate(() => /No entendí/.test(document.querySelector("#q-comandos .cc-msg").textContent)), "true");

    // Y ahora lo que de verdad importa: escribir la letra CONTESTA Y PASA SOLA.
    // `data-original` es el número de opción del ítem que hay detrás de la
    // letra B, y es lo que tiene que quedar anotado.
    const segundaOriginal = await page.evaluate(() =>
      [...document.querySelectorAll("#q-options button")].filter((b) => b.id !== "no-se-btn")[1].dataset.original);
    const enunciadoViejo = await enPantalla(page, "#q-text");
    await page.fill("#q-comandos .cc-input", "B");
    await page.press("#q-comandos .cc-input", "Enter");
    igual('escribir "B" pasa sola a la siguiente pregunta',
      (await enPantalla(page, "#q-counter")) !== antesDeTocar, "true");
    const anotada = await respuestaGuardada(page, 1);
    igual("y deja anotada la opción B, no otra", anotada && String(anotada.dada), segundaOriginal);
    igual("el cuadro queda vacío para la siguiente",
      await page.evaluate(() => document.querySelector("#q-comandos .cc-input").value), "");
    // Al no pasar por el botón, nada anunciaría la pregunta nueva: la dice el
    // propio aviso, que es región viva.
    const aviso = await enPantalla(page, "#q-comandos .cc-msg");
    igual("el aviso dice qué quedó anotado", /Anotado: opción B/.test(aviso), "true");
    igual("y lee la pregunta nueva, que si no nadie anunciaría",
      aviso.includes(await enPantalla(page, "#q-text")) && !aviso.includes(enunciadoViejo), "true");
    igual("y el foco se queda en el cuadro, listo para la siguiente",
      await page.evaluate(() => document.activeElement === document.querySelector("#q-comandos .cc-input")), "true");

    // "No lo sé" es una respuesta del diagnóstico, no un saltar: se guarda
    // aparte de un error. Tiene que poder escribirse, y también pasa sola.
    const contadorNoSe = await enPantalla(page, "#q-counter");
    await page.fill("#q-comandos .cc-input", "no lo sé");
    await page.press("#q-comandos .cc-input", "Enter");
    igual('escribir "no lo sé" queda anotado como tal',
      (await respuestaGuardada(page, 1) || {}).dada, "nose");
    igual("y también pasa sola", (await enPantalla(page, "#q-counter")) !== contadorNoSe, "true");
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

    // Primero la ilegal: tiene que decirlo y NO pasar de pregunta.
    const contador = await enPantalla(page, "#q-counter");
    await page.fill("#q-comandos .cc-input", "Txz9");
    await page.press("#q-comandos .cc-input", "Enter");
    igual("una jugada ilegal se rechaza diciéndolo",
      await page.evaluate(() => /no es una jugada legal/.test(document.querySelector("#q-comandos .cc-msg").textContent)), "true");
    igual("y no pasa de pregunta", await enPantalla(page, "#q-counter"), contador);

    if (!mv) mal("no se pudo leer la posición del tablero para probar una jugada (" + fen + ")");
    else {
      await page.fill("#q-comandos .cc-input", mv.san);
      await page.press("#q-comandos .cc-input", "Enter");
      igual(`una jugada escrita (${mv.san}) pasa sola a la siguiente`,
        (await enPantalla(page, "#q-counter")) !== contador, "true");
      const anotada = await respuestaGuardada(page, 1);
      igual("y queda anotada esa jugada, no otra",
        anotada && anotada.dada && anotada.dada.from + anotada.dada.to, mv.from + mv.to);
      igual("y el aviso la nombra y lee la pregunta nueva",
        await page.evaluate((san) => {
          const t = document.querySelector("#q-comandos .cc-msg").textContent;
          return t.includes(san) && t.includes(document.getElementById("q-text").textContent.trim());
        }, mv.san), "true");
    }
  }

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Las preguntas de casilla son 2 de las 583 del banco: una prueba sorteada al
   azar casi nunca trae una, y dejarlo al azar es dejar ese camino sin probar
   —que es como no tenerlo—. Se siembra el estado guardado con esos dos ítems:
   la página los toma al retomar la prueba, que es un camino suyo de verdad y no
   una puerta de pruebas. */
async function pruebaCasilla(browser) {
  console.log("\n=== Una pregunta que se contesta con una casilla ===");
  const ctx = await browser.newContext(SIN_SW);
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  await ctx.addInitScript(() => {
    localStorage.setItem("oscarBlindMode_v1", "1");
    localStorage.setItem("diagnostico_estado_v1", JSON.stringify({
      version: 5,
      estado: { perfil: {}, idx: 0, respuestas: {}, items: ["fin_oposicion", "cal_jaque_doble"] },
    }));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/entreno/diagnostico.html", { waitUntil: "networkidle" });
  await page.click("#start-btn");
  await page.waitForSelector("#q-options button", { timeout: 15000 });
  if (!(await irHasta(page, "casilla"))) mal("la prueba sembrada no trajo ninguna pregunta de casilla");
  else {
    const contador = await enPantalla(page, "#q-counter");
    await page.fill("#q-comandos .cc-input", "z9");
    await page.press("#q-comandos .cc-input", "Enter");
    igual("una casilla que no existe se rechaza diciéndolo",
      await page.evaluate(() => /No entendí/.test(document.querySelector("#q-comandos .cc-msg").textContent)), "true");
    igual("y no pasa de pregunta", await enPantalla(page, "#q-counter"), contador);

    await page.fill("#q-comandos .cc-input", "eva 4");
    await page.press("#q-comandos .cc-input", "Enter");
    igual('escribir la casilla hablada ("eva 4") queda anotada como e4',
      (await respuestaGuardada(page, 1) || {}).dada, "e4");
    igual("y pasa sola a la siguiente", (await enPantalla(page, "#q-counter")) !== contador, "true");
  }
  await ctx.close();
}

/* La última pregunta es el caso con más filo: ahí ese Enter no pasa de
   pregunta, TERMINA la prueba. Tiene que avisarlo antes de que lo aprieten, y
   tiene que terminarla de verdad — quedarse trabado en la última sería dejar a
   quien contesta escribiendo sin forma de llegar al resultado. */
async function pruebaUltimaPregunta(browser) {
  console.log("\n=== La última pregunta ===");
  const ctx = await browser.newContext(SIN_SW);
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: STUB }));
  await ctx.addInitScript(() => localStorage.setItem("oscarBlindMode_v1", "1"));
  const page = await ctx.newPage();
  await page.goto(BASE + "/entreno/diagnostico.html", { waitUntil: "networkidle" });
  await saltarPortada(page);

  // Saltar a la última: se le cambia el `idx` al estado que la propia página
  // guarda para poder retomar la prueba, y se recarga. Es su camino de siempre.
  const total = await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem("diagnostico_estado_v1"));
    c.estado.idx = c.estado.items.length - 1;
    localStorage.setItem("diagnostico_estado_v1", JSON.stringify(c));
    return c.estado.items.length;
  });
  await page.reload({ waitUntil: "networkidle" });
  await saltarPortada(page);
  igual("se llegó a la última pregunta", await enPantalla(page, "#q-counter"), `Pregunta ${total} de ${total}`);
  igual("y el cuadro avisa que ese Enter TERMINA la prueba",
    await page.evaluate(() => /Es la última/.test(document.querySelector("#q-comandos .cc-ayuda").textContent)), "true");

  await page.fill("#q-comandos .cc-input", "no lo sé");
  await page.press("#q-comandos .cc-input", "Enter");
  await page.waitForSelector("#result-view:not(.hidden)", { timeout: 15000 });
  bien("contestar la última por el cuadro termina la prueba y muestra el resultado");
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
  // Escribir la letra contesta Y PASA SOLA. Que quedó anotada lo prueba volver
  // atrás con "Anterior" y verla marcada: todo desde la pantalla.
  const contador = await enPantalla(page, "#q-counter");
  const enunciadoViejo = await enPantalla(page, "#q-text");
  await page.fill(".cc-input", "C");
  await page.press(".cc-input", "Enter");
  igual('escribir "C" pasa sola a la siguiente pregunta',
    (await enPantalla(page, "#q-counter")) !== contador, "true");
  const aviso = await enPantalla(page, ".cc-msg");
  igual("el aviso dice qué quedó anotado", /Anotado: opción C/.test(aviso), "true");
  igual("y lee la pregunta nueva, que si no nadie anunciaría",
    aviso.includes(await enPantalla(page, "#q-text")) && !aviso.includes(enunciadoViejo), "true");
  await page.click("#prev-btn");
  igual("y al volver atrás la tercera opción está marcada", await marcada(page), "2");

  // Lo que no se entiende ni marca ni avanza.
  await page.fill(".cc-input", "la de arriba");
  await page.press(".cc-input", "Enter");
  igual("un texto que no se entiende no pasa de pregunta", await enPantalla(page, "#q-counter"), contador);
  igual("y lo dice", await page.evaluate(() => /No entendí/.test(document.querySelector(".cc-msg").textContent)), "true");

  // "Dejar en blanco" también se escribe: es una respuesta, no un saltar.
  await page.fill(".cc-input", "en blanco");
  await page.press(".cc-input", "Enter");
  await page.click("#prev-btn");
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
    // O la jugada era la de la solución (y el ejercicio avanza) o no lo era (y
    // se dice con todas las letras); lo que NO puede pasar es que escribirla no
    // haga nada. Se vigila el renglón de estado desde antes de escribir.
    await vigilar(page, "#round-status");
    await page.fill(".cc-input", mv.san);
    await page.press(".cc-input", "Enter");
    await page.waitForTimeout(700);
    const vistos = await loVisto(page);
    igual(`escribir una jugada legal (${mv.san}) se contesta como el clic`,
      vistos.length > 1 && vistos.slice(1).some((t) => t !== vistos[0]), "true");
    igual("y si no era la de la solución, lo dice",
      vistos.some((t) => /no es la jugada de la solución/.test(t)) || vistos.length > 2, "true");
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
    // Igual que en Ejercicios por tema: se vigila el renglón desde antes, que al
    // acertar lo borra el ejercicio siguiente a los 350 ms.
    await vigilar(page, "#result-text");
    await page.fill(".cc-input", mv.san);
    await page.press(".cc-input", "Enter");
    await page.waitForTimeout(800);
    const vistos = await loVisto(page);
    igual(`escribir una jugada legal (${mv.san}) se contesta como el clic`,
      vistos.some((t) => /Correcto|❌|✅/.test(t)), "true");
  }
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ============ 7. Los ejercicios 4×4 ============ */

/* 4×4 tiene su propio recuadro de comandos (#cmd-form, más viejo que
   js/cuadro-comandos.js) y su propio interruptor de modo. Lo que se comprueba acá
   no es el recuadro sino el ORDEN: encabezado "Piezas" → qué hay en el tablero →
   el tablero → dónde se contesta, con la ayuda plegada al final. */
async function prueba4x4(browser) {
  console.log("\n=== Los ejercicios 4×4, en Modo Adaptado ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/4x4.html", true);
  await page.waitForSelector("#board4 [data-square], #board4 .sq4, #board4 button", { timeout: 25000 });
  await page.waitForFunction(() => {
    const p = document.getElementById("position-readout");
    return p && p.textContent.trim().length > 10;
  }, null, { timeout: 25000 });

  // --- el orden, medido sobre el documento y no sobre el CSS
  const orden = await page.evaluate(() => {
    const ids = ["piezas-heading", "position-readout", "board4", "cmd-form", "ayuda-detalles"];
    const nodos = ids.map((id) => document.getElementById(id));
    if (nodos.some((n) => !n)) return nodos.map((n, i) => (n ? ids[i] : "FALTA:" + ids[i]));
    // compareDocumentPosition: 4 = el segundo va después del primero.
    const ok = nodos.every((n, i) => i === 0 || (nodos[i - 1].compareDocumentPosition(n) & 4) !== 0);
    return ok ? "en orden" : "desordenado";
  });
  igual("Piezas → la posición → el tablero → el recuadro → la ayuda", orden, "en orden");

  // --- qué dice la lectura: cuántas piezas hay y dónde está cada una
  const lectura = await enPantalla(page, "#position-readout");
  igual("la lectura dice cuántas piezas hay", /\d+ piezas? en el tablero/.test(lectura), "true");
  igual("y dónde está cada una", /:\s*\w+\s*[1-4]/.test(lectura), "true");
  igual("y se ve de verdad",
    await page.evaluate(() => { const e = document.getElementById("position-readout"); return e ? getComputedStyle(e).display : "no está"; }), "block");

  // --- la ayuda, plegada
  const ayuda = await page.evaluate(() => {
    const d = document.getElementById("ayuda-detalles");
    const cuerpo = document.getElementById("cmd-help");
    return {
      abierta: !!(d && d.open),
      escrita: !!(cuerpo && cuerpo.textContent.trim().length > 100),
      // checkVisibility() y no el rectángulo: un <details> cerrado esconde su
      // contenido con content-visibility, y ahí getBoundingClientRect() sigue
      // devolviendo el alto de antes — daría verde sobre una ayuda desplegada.
      visible: !!(cuerpo && cuerpo.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })),
      titulo: d ? d.querySelector("summary").textContent.trim() : "",
      encabezadoEnSummary: !!(d && d.querySelector("summary h2")),
    };
  });
  igual("la ayuda arranca plegada, también la primera vez", ayuda.abierta, "false");
  // Lo que SÍ se dice la primera vez es una línea que señala la puerta, no el manual.
  const bienvenida = await enPantalla(page, "#board-announcer");
  igual('la primera vez se dice dónde contestar y cómo pedir ayuda, en una línea',
    /ayuda/i.test(bienvenida) && bienvenida.length < 200, "true");
  igual("y por eso no se ve", ayuda.visible, "false");
  igual("pero ya está escrita, para que abrirla no muestre una caja vacía", ayuda.escrita, "true");
  igual("su título es un encabezado de verdad dentro del summary", ayuda.encabezadoEnSummary, "true");
  igual("y dice que es la ayuda", /Ayuda/.test(ayuda.titulo), "true");

  // --- el tablero ya no recita el manual en cada foco
  const desc = await page.evaluate(() => {
    const b = document.getElementById("board4");
    const id = b && b.getAttribute("aria-describedby");
    const p = id && document.getElementById(id);
    return p ? p.textContent.trim().replace(/\s+/g, " ") : "";
  });
  igual("lo que el tablero describe en cada foco es UNA línea, no el manual",
    desc.length > 0 && desc.length < 220, "true");
  igual("y lo que hace es señalar dónde está la ayuda", /Ayuda/.test(desc), "true");

  // --- la ayuda vive en un solo lugar
  igual("los atajos no están escritos dos veces",
    await page.evaluate(() => document.querySelectorAll(".shortcuts-help").length), "0");

  // --- el comando "ayuda" la abre y la vuelve a leer
  await page.fill("#cmd-input", "ayuda");
  await page.press("#cmd-input", "Enter");
  await page.waitForTimeout(300);
  igual('el comando "ayuda" la abre',
    await page.evaluate(() => document.getElementById("ayuda-detalles").open), "true");
  igual("y entonces sí se ve",
    await page.evaluate(() => document.getElementById("cmd-help").checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })), "true");

  // --- la posición NO se dice dos veces: la lleva la lectura, no el anuncio
  igual("el anuncio del ejercicio no repite la posición (la dice la lectura de arriba)",
    await page.evaluate(() => /piezas? en el tablero/.test(document.getElementById("board-announcer").textContent)), "false");

  // --- y sobre todo: se puede contestar escribiendo, y la lectura lo refleja.
  // La captura se busca en la PANTALLA: se toca cada pieza y se mira qué casillas
  // queda marcando la propia página como capturables.
  const captura = await page.evaluate(() => {
    const celdas = () => [...document.querySelectorAll("#board4 [data-square]")];
    // Ojo: cada clic repinta el tablero entero, así que hay que volver a pedir las
    // casillas después de tocar — las de antes ya no están en el documento.
    const conPieza = celdas().filter((c) => c.textContent.trim()).map((c) => c.dataset.square);
    for (const sq of conPieza) {
      const origen = celdas().find((c) => c.dataset.square === sq);
      origen.click();
      const destino = celdas().find((x) => x.classList.contains("target-capture"));
      if (destino) return { de: sq, a: destino.dataset.square };
      celdas().find((c) => c.dataset.square === sq).click(); // deseleccionar y seguir
    }
    return null;
  });
  if (!captura) mal("no se encontró ninguna captura posible para probar el recuadro");
  else {
    const cuantas = (t) => Number((t.match(/(\d+) piezas? en el tablero/) || [])[1] || 0);
    const antes = cuantas(await enPantalla(page, "#position-readout"));
    await page.fill("#cmd-input", captura.de + " " + captura.a);
    await page.press("#cmd-input", "Enter");
    await page.waitForTimeout(400);
    const despues = cuantas(await enPantalla(page, "#position-readout"));
    igual(`escribir la captura (${captura.de} ${captura.a}) la hace y la lectura lo dice`,
      despues === antes - 1, "true");
    igual("y el aviso de la captura no repite la posición entera",
      await page.evaluate(() => /piezas? en el tablero/.test(document.getElementById("board-announcer").textContent)), "false");
  }

  // --- la voz: UNA frase, con todo dentro
  // No deja rastro en el DOM, así que se engancha en BlindNotation.speak(), que es
  // la puerta por donde el sitio habla. Hace falta porque speak() CANCELA lo
  // anterior: dos llamadas seguidas se comen la primera, y repartir el texto entre
  // las dos regiones vivas —que es justo lo que hay que hacer para el lector de
  // pantalla— dejaba a quien usa la voz sin oír la mitad.
  await page.evaluate(() => {
    window.__dicho = [];
    const orig = window.BlindNotation.speak;
    window.BlindNotation.speak = function (t) { window.__dicho.push(String(t)); return orig.apply(this, arguments); };
  });
  // "Reiniciar" y no "Siguiente": los dos pasan por loadPuzzleAt(), pero Siguiente
  // puede estar deshabilitado según dónde quedó el recorrido.
  await page.click("#board-reset");
  await page.waitForTimeout(400);
  const dicho = await page.evaluate(() => window.__dicho);
  igual("al reiniciar, la voz habla UNA sola vez", dicho.length, "1");
  igual("y en esa frase van el aviso, el ejercicio Y la posición",
    dicho.length === 1 && /reiniciado/i.test(dicho[0]) && /Ejercicio \d+ de \d+/.test(dicho[0])
      && /piezas? en el tablero/.test(dicho[0]), "true");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Fuera del Modo Adaptado, la lectura y la ayuda no estorban a quien ve el tablero. */
async function prueba4x4Normal(browser) {
  console.log("\n=== 4×4 fuera del Modo Adaptado ===");
  const { page, ctx } = await abrir(browser, "/entreno/4x4.html", false);
  await page.waitForSelector("#board4", { timeout: 25000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const ver = (id) => {
      const e = document.getElementById(id);
      return !!(e && e.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true }));
    };
    return { pos: ver("position-readout"), ayuda: ver("ayuda-detalles"), panel: ver("a11y-panel"), tablero: ver("board4") };
  });
  igual("el tablero se ve", r.tablero, "true");
  igual("la posición escrita no", r.pos, "false");
  igual("la ayuda tampoco", r.ayuda, "false");
  igual("ni el recuadro de comandos", r.panel, "false");
  await ctx.close();
}

(async () => {
  pruebaLectura();
  pruebaPosicionUnaSolaVez();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaDiagnostico(browser);
    await pruebaCasilla(browser);
    await pruebaUltimaPregunta(browser);
    await pruebaFueraDelModo(browser);
    await pruebaArbitraje(browser, "/arbitraje.html", "Examen de arbitraje (docente)");
    await pruebaArbitraje(browser, "/nivel-de-arbitraje.html", "Examen de arbitraje (público)");
    await pruebaTemas(browser);
    await pruebaContrarreloj(browser, "/racha-tactica.html", "Racha táctica");
    await pruebaContrarreloj(browser, "/te-reto.html", "¡Te reto!");
    await prueba4x4(browser);
    await prueba4x4Normal(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo se puede contestar sin tocar el tablero.");
  process.exit(fallos ? 1 : 0);
})();
