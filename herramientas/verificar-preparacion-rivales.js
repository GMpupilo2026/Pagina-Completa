/* La preparación de rivales (preparacion-rivales.html y js/preparacion-analisis.js).
 *
 * Lo que se rompe acá no da error: un PGN con comentarios o variantes que se
 * cuelan como jugadas arma un árbol con líneas que nadie jugó; un rival
 * escrito «Apellido, Nombre» en unas partidas y «Nombre Apellido» en otras
 * queda partido en dos; una recomendación sale de 3 partidas; la revisión del
 * motor no marca el error que el rival repite. La página se ve perfecta en
 * todos esos casos. Por eso, dos partes:
 *
 *   1. EL ANÁLISIS, en Node y sin navegador: un PGN armado con patrones
 *      conocidos (dónde pierde, dónde gana, dónde improvisa) y la
 *      comprobación de que el análisis los encuentra.
 *   2. LA PÁGINA, en un navegador con un Supabase de mentira y un Stockfish
 *      de mentira: sin la función activa no se ve nada; con ella se carga un
 *      archivo, se elige al rival, se pinta el análisis, el motor marca el
 *      error plantado y se guarda solo el resultado.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-preparacion-rivales.js
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");
const A = require("../js/preparacion-analisis.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(nombre, v) { if (v) console.log("  ✓ " + nombre); else { console.log("  ✗ " + nombre); fallos += 1; } }

// ------------------------------------------------------------ el PGN de prueba

function partida(blancas, negras, resultado, jugadas, extra) {
  return `[Event "Rated Blitz game"]
[Date "2025.03.04"]
[White "${blancas}"]
[Black "${negras}"]
[Result "${resultado}"]
[WhiteElo "2000"]
[BlackElo "2010"]
[TimeControl "180+2"]
${extra || ""}
1. ${jugadas} ${resultado}

`;
}

/* El rival es Pedro Pérez, escrito de TRES maneras. Los patrones:
   - con negras contra 1.e4 juega 1…e5 y pierde 15 de 20 (su punto débil);
   - con negras contra 1.d4 juega 1…d5 y gana 16 de 20 (su fuerte);
   - con blancas juega 1.d4 c5 2.Cc3 cxd4 3.Dxd4 Cc6 4.Dh4 (el «error» que el
     Stockfish de mentira castiga) y ahí gana 10 de 12;
   - con blancas, después de 1.e4 e6 2.d4 d5 reparte entre cuatro jugadas.
   Y un comentario, una variante anidada y un NAG que no pueden colarse. */
function pgnDePrueba() {
  let t = "";
  for (let i = 0; i < 20; i++) t += partida("Rival " + i, i % 2 ? "Pérez, Pedro" : "Pedro Perez", i < 15 ? "1-0" : "0-1",
    "e4 e5 2. Nf3 {su jugada de siempre} Nc6 3. Bb5 (3. Bc4 Bc5 (3... Nf6)) a6 $1 4. Ba4 Nf6 5. O-O Be7");
  for (let i = 0; i < 20; i++) t += partida("Rival " + i, "Pedro Pérez", i < 16 ? "0-1" : "1/2-1/2", "d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7");
  for (let i = 0; i < 12; i++) t += partida("PEDRO PÉREZ", "Otro " + i, i < 10 ? "1-0" : "0-1", "d4 c5 2. Nc3 cxd4 3. Qxd4 Nc6 4. Qh4 e6");
  const reparto = ["Nc3", "e5", "exd5", "Nd2"];
  for (let i = 0; i < 20; i++) t += partida("Pedro Perez", "Otro " + i, i < 12 ? "1-0" : "0-1", "e4 e6 2. d4 d5 3. " + reparto[i % 4] + " Nf6");
  // Un nombre con marcado: tiene que salir como texto en toda la página.
  t += partida("<img src=x onerror=alert(1)>", "Pedro Perez", "1-0", "e4 e5 2. Nf3 Nc6");
  return t;
}

// ------------------------------------------------------------ 1. el análisis

function pruebaAnalisis() {
  console.log("\n=== El análisis, sin navegador ===");
  igual("las jugadas no traen comentarios, variantes ni NAG",
    A.jugadasDe("1. e4 {bien} e5 2. Nf3 (2. Bc4 Bc5 (2... Nf6)) Nc6 $1 3. Bb5+! a6?! 4. O-O-O# 1-0"),
    ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "O-O-O"]);
  igual("«0-0» se lee como enroque y la coronación con su «=»", A.jugadasDe("1. 0-0 0-0-0 2. e8Q"), ["O-O", "O-O-O", "e8=Q"]);

  const partidas = A.leerPgn(pgnDePrueba());
  igual("se leen todas las partidas", partidas.length, 73);
  const lista = A.jugadores(partidas);
  igual("«Pérez, Pedro», «Pedro Perez» y «PEDRO PÉREZ» son la misma persona, y va primera",
    [lista[0].clave, lista[0].partidas], ["pedro perez", 73]);

  const r = A.analizar(partidas, lista[0].nombre);
  igual("cuenta sus partidas y sus resultados", [r.total, r.global.g, r.global.t, r.global.p], [73, 43, 4, 26]);
  igual("una línea cuenta desde 4 partidas con un archivo chico", r.minimo, 4);
  igual("el ritmo sale del TimeControl (180+2 es blitz)", r.porRitmo.map((x) => x.ritmo), ["blitz"]);

  const debiles = r.debiles.map((l) => l.color + " " + A.lineaEs(l.sec));
  cierto("encuentra su punto débil con negras: 1.e4 e5 (" + debiles.join(" | ") + ")", debiles.includes("b 1.e4 e5"));
  const fuertes = r.fuertes.map((l) => l.color + " " + A.lineaEs(l.sec));
  cierto("y su fuerte: 1.d4 d5 (" + fuertes.join(" | ") + ")", fuertes.includes("b 1.d4 d5"));
  igual("con blancas le recomienda 1.e4, donde él saca menos", A.sanEs(r.conBlancas.plan[0].san), "e4");
  igual("y la primera de la tabla es la mejor para ti", r.conBlancas.primeras.map((x) => x.san), ["e4", "d4"]);
  igual("el plan sigue su línea: después de 1.e4 él juega 1…e5 siempre",
    [r.conBlancas.plan[0].hijos[0].san, r.conBlancas.plan[0].hijos[0].quien, Math.round(100 * r.conBlancas.plan[0].hijos[0].reparto)], ["e5", "rival", 100]);
  cierto("dice dónde improvisa: después de 1.e4 e6 2.d4 d5", r.improvisa.some((x) => x.color === "w" && A.lineaEs(x.sec) === "1.e4 e6 2.d4 d5"));
  cierto("el FODA trae algo en los cuatro cuadros",
    ["fortalezas", "debilidades", "oportunidades", "amenazas"].every((k) => r.foda[k].length > 0));
  cierto("y habla en notación española (Cf3, no Nf3)", !JSON.stringify(r.foda).match(/\bN[a-h][1-8]\b/) && /Cf3|Dh4|Ab5/.test(JSON.stringify(r.foda) + A.lineaEs(r.principal.b.sec)));

  // El motor: las tareas son posiciones legales, y un error plantado se marca.
  const tareas = A.tareasDelMotor(r);
  cierto("las tareas del motor son posiciones legales", tareas.length > 0 && tareas.every((t) => A.fenDe(t.sec) && A.fenDe(t.sec.concat(t.jugada))));
  const dh4 = tareas.find((t) => t.clave === "d4 c5 Nc3 cxd4 Qxd4 Nc6 Qh4");
  cierto("entre ellas, su 4.Dh4 de siempre", !!dh4 && dh4.quien === "rival");
  const evals = {};
  tareas.forEach((t) => { evals[t.clave] = { antes: 0.2, mejor: t.jugada, despues: 0.2 }; });
  evals[dh4.clave] = { antes: 0.1, mejor: "Qd1", despues: -0.8 };
  A.aplicarMotor(r, tareas, evals, "prueba");
  igual("el motor marca 4.Dh4 como su error", r.motor.errores.map((x) => A.lineaEs(x.sec.concat(x.jugada))), ["1.d4 c5 2.Cc3 cxd4 3.Dxd4 Cc6 4.Dh4"]);
  cierto("y el FODA lo dice en Oportunidades", r.foda.oportunidades.some((t) => /suele jugar Dh4/.test(t) && /Dd1/.test(t)));
  igual("las evaluaciones se escriben como en español", [A.textoEval(-0.8), A.textoEval(1.25), A.textoEval(97)], ["−0,80", "+1,25", "+M3"]);
  cierto("el resultado se puede guardar como JSON (y pesa poco)", JSON.stringify(r).length < 200000);
  return r;
}

// ------------------------------------------------------------ 2. la página

// Un Supabase de mentira. `puede` es lo que contesta puedo_preparar_rivales().
function clienteFalso(puede) {
  return `
window.__insertados = [];
window.__borrados = [];
(function () {
  const TABLAS = { preparaciones_rival: [] };
  function constructor(tabla, filas) {
    let filas2 = (filas || []).slice(), unica = false, insertando = null, borrando = false;
    const b = {
      select() { return b; },
      eq(col, val) { filas2 = filas2.filter((r) => String(r[col]) === String(val)); return b; },
      order() { return b; },
      range(a, z) { filas2 = filas2.slice(a, z + 1); return b; },
      insert(fila) {
        insertando = Object.assign({ id: "p-" + (TABLAS[tabla].length + 1), profesor_id: "u-profe", created_at: "2026-09-28T12:00:00Z" }, fila);
        return b;
      },
      delete() { borrando = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        if (insertando) {
          TABLAS[tabla].unshift(insertando);
          window.__insertados.push(JSON.parse(JSON.stringify(insertando)));
          filas2 = [insertando];
        }
        if (borrando) {
          filas2.forEach((f) => { TABLAS[tabla].splice(TABLAS[tabla].indexOf(f), 1); window.__borrados.push(f.id); });
          filas2 = [];
        }
        let d = filas2;
        if (unica) d = filas2.length ? filas2[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "u-profe" }, access_token: "t" } } }),
      getUser: () => Promise.resolve({ data: { user: { id: "u-profe" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    rpc: (n) => {
      if (n === "puedo_preparar_rivales") return Promise.resolve({ data: ${JSON.stringify(puede)}, error: null });
      return Promise.resolve({ data: [], error: null });
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

/* Un Stockfish de mentira, con la misma forma que js/shared-engine.js:
   contesta +0,20 en todo, salvo cuando la dama BLANCA está en h4, que da
   −0,80 (el error plantado: 4.Dh4). La mejor jugada es la primera legal que
   no sea Dh4. Con el de verdad, la prueba tardaría minutos y dependería de lo
   que opine el motor en cada versión. */
const MOTOR_FALSO = `
(function () {
  let manejador = null;
  const motor = {
    postMessage(m) {
      if (m.startsWith("position fen ")) { motor._fen = m.slice(13); return; }
      if (m.startsWith("go")) {
        const g = new Chess(motor._fen);
        const q = g.get("h4");
        const blancas = motor._fen.split(" ")[1] === "w";
        const desdeBlancas = q && q.type === "q" && q.color === "w" ? -80 : 20;
        const cp = blancas ? desdeBlancas : -desdeBlancas;
        const mv = g.moves({ verbose: true }).find((x) => !(x.piece === "q" && x.to === "h4"));
        setTimeout(() => {
          window.__motorPedidos = (window.__motorPedidos || 0) + 1;
          manejador && manejador({ data: "info depth 14 score cp " + cp + " pv " + (mv ? mv.from + mv.to : "") });
          manejador && manejador({ data: "bestmove " + (mv ? mv.from + mv.to + (mv.promotion || "") : "(none)") });
        }, 5);
      }
    },
  };
  let cola = Promise.resolve();
  window.SharedEngine = {
    ensureEngine: () => Promise.resolve(motor),
    runTask: (t) => { const r = cola.then(t, t); cola = r.catch(() => null); return r; },
    setMessageHandler: (f) => { manejador = f; },
    discardEngine: () => {},
    PROFUNDIDAD_MAXIMA: 40,
  };
})();
`;

async function abrir(browser, puede) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(puede) }));
  await ctx.route("**/js/shared-engine.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: MOTOR_FALSO }));
  await ctx.addInitScript(contestarAvisos);
  // «Se ve» se mide con checkVisibility(), no con la clase ni el atributo.
  await ctx.addInitScript(() => { window.SE_VE = (id) => document.getElementById(id).checkVisibility(); });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  page.on("dialog", (d) => { errores.push("diálogo del navegador: " + d.message()); d.dismiss(); });
  await page.goto(BASE + "/preparacion-rivales.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 15000 });
  return { page, ctx, errores };
}

async function pruebaSinPermiso(browser) {
  console.log("\n=== Sin la función activa ===");
  const { page, ctx, errores } = await abrir(browser, false);
  igual("se ve el aviso y no la herramienta", await page.evaluate(() => [SE_VE("denegado"), SE_VE("app")]), [true, false]);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaConPermiso(browser) {
  console.log("\n=== Con la función activa: cargar, analizar, revisar y guardar ===");
  const { page, ctx, errores } = await abrir(browser, true);
  igual("se ve la herramienta", await page.evaluate(() => SE_VE("app") && !SE_VE("denegado")), true);
  igual("el paso 2 no se ve antes de leer nada", await page.evaluate(() => SE_VE("paso-rival")), false);

  await page.setInputFiles("#pgn-archivo", { name: "rival.pgn", mimeType: "application/x-chess-pgn", buffer: Buffer.from(pgnDePrueba(), "utf8") });
  await page.click("#leer");
  await page.waitForFunction(() => /Se leyeron/.test(document.getElementById("leido").textContent), null, { timeout: 10000 });
  igual("dice cuántas leyó", await page.textContent("#leido"), "Se leyeron 73 partidas de 42 jugadores.");
  igual("el rival sugerido es el que más partidas tiene", await page.evaluate(() => document.getElementById("rival").selectedOptions[0].textContent), "Pedro Perez — 73 partidas");
  igual("el nombre con marcado queda como texto en la lista", await page.evaluate(() =>
    [document.querySelectorAll("#rival img").length, [...document.querySelectorAll("#rival option")].some((o) => o.textContent.startsWith("<img"))]), [0, true]);

  await page.click("#analizar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("se ve el resultado, con el nombre como más se escribe en el archivo", await page.evaluate(() => SE_VE("resultado") && document.getElementById("titulo-resultado").textContent), "Pedro Perez");
  igual("el foco va al título del resultado", await page.evaluate(() => document.activeElement.id), "titulo-resultado");
  const titulos = await page.evaluate(() => [...document.querySelectorAll("#resultado-cuerpo h3")].filter((h) => h.checkVisibility()).map((h) => h.textContent));
  igual("están todas las partes, en orden", titulos,
    ["Análisis FODA, visto desde quien quiere ganarle", "Qué jugarle", "Lo que dice Stockfish", "Su repertorio", "Dónde rinde menos y dónde más", "Por ritmo, por año y por Elo"]);
  igual("el FODA tiene sus cuatro cuadros", await page.evaluate(() =>
    [...document.querySelectorAll("#resultado-cuerpo h4")].map((h) => h.textContent).filter((t) => /^(Fortalezas|Debilidades|Oportunidades|Amenazas)/.test(t)).length), 4);
  igual("el plan con blancas empieza por 1.e4", await page.evaluate(() =>
    document.querySelector("[aria-labelledby='planes-titulo'] ul li p").textContent.replace(/ ·.*/, "")), "Juega 1.e4");
  const errorMotor = await page.evaluate(() => {
    const h = [...document.querySelectorAll("#resultado-cuerpo h4")].find((x) => /Errores que repite/.test(x.textContent));
    return h ? h.nextElementSibling.querySelector("tbody tr").textContent.replace(/\s+/g, " ") : "no está";
  });
  cierto("Stockfish marca su 4.Dh4 (" + errorMotor + ")", /Dh4/.test(errorMotor) && /\+0,20 → −0,80/.test(errorMotor));
  cierto("y el FODA lo trae en Oportunidades", await page.evaluate(() => /suele jugar Dh4/.test(document.getElementById("resultado-cuerpo").textContent)));
  igual("el estado dice cuánto revisó", /Listo: Stockfish 16, profundidad 14, \d+ de \d+ jugadas revisadas\./.test(await page.textContent("#motor-estado")), true);

  // Guardar: va el resultado (con la revisión), no el PGN.
  await page.click("#guardar");
  await page.waitForFunction(() => window.__insertados.length === 1, null, { timeout: 5000 });
  const ins = await page.evaluate(() => { const i = window.__insertados[0]; return { rival: i.rival, partidas: i.partidas, motor: !!i.analisis.motor, total: i.analisis.total, pgn: /\[Event/.test(JSON.stringify(i)) }; });
  igual("se guarda el resultado con la revisión, sin el PGN", ins, { rival: "Pedro Perez", partidas: 73, motor: true, total: 73, pgn: false });
  await page.waitForFunction(() => document.querySelectorAll("#guardados li").length === 1, null, { timeout: 5000 });
  igual("y aparece en «Tus análisis guardados»", await page.evaluate(() => document.querySelector("#guardados li p").textContent), "Pedro Perez");
  igual("el botón dice que ya está guardado", await page.textContent("#guardar"), "Guardado");

  // Eliminarlo pide confirmación con un aviso de la página.
  await page.click("#guardados button[aria-label^='Eliminar']");
  await page.waitForFunction(() => window.__borrados.length === 1, null, { timeout: 5000 });
  await page.waitForFunction(() => document.getElementById("guardados-vacio").checkVisibility(), null, { timeout: 5000 });
  cierto("eliminar pidió confirmar y la lista quedó vacía", await page.evaluate(() => window.__avisos.some((t) => /¿Eliminar este análisis\?/.test(t))));

  igual("el nombre con marcado no se volvió HTML en ningún lado", await page.evaluate(() => document.querySelectorAll("main img").length), 0);
  igual("sin errores en consola ni diálogos del navegador", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

// Las partidas «de Lichess»: las mismas de prueba, con el rival como usuario.
function pgnDeUsuario(usuario) {
  return pgnDePrueba().replace(/Pérez, Pedro|Pedro Perez|Pedro Pérez|PEDRO PÉREZ/g, usuario);
}

/* Lichess y Chess.com de mentira. Contestan con CORS abierto, como los de
   verdad: sin esa cabecera el navegador ni deja leer la respuesta. Se anota
   cada pedido para saber qué se pidió y en qué orden. */
async function servirSitios(ctx, pedidos) {
  const cors = { "Access-Control-Allow-Origin": "*" };
  await ctx.route("https://lichess.org/api/games/user/**", (r) => {
    pedidos.push(r.request().url());
    if (/\/user\/nadie\?/.test(r.request().url())) return r.fulfill({ status: 404, headers: cors, body: "" });
    return r.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/x-chess-pgn" }, cors), body: pgnDeUsuario("PedroP") });
  });
  const todo = pgnDeUsuario("pedrop").split(/\n\n(?=\[Event )/);
  const mitad = Math.ceil(todo.length / 2);
  await ctx.route("https://api.chess.com/pub/player/**", (r) => {
    const url = r.request().url();
    pedidos.push(url);
    if (/\/games\/archives$/.test(url)) {
      return r.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/json" }, cors),
        body: JSON.stringify({ archives: ["https://api.chess.com/pub/player/pedrop/games/2026/08", "https://api.chess.com/pub/player/pedrop/games/2026/09"] }) });
    }
    // Septiembre (el más nuevo) trae la primera mitad; agosto, el resto.
    const cuerpo = /2026\/09\/pgn$/.test(url) ? todo.slice(0, mitad).join("\n\n") : todo.slice(mitad).join("\n\n");
    return r.fulfill({ status: 200, headers: Object.assign({ "Content-Type": "application/x-chess-pgn" }, cors), body: cuerpo });
  });
}

async function pruebaDescarga(browser) {
  console.log("\n=== Bajar las partidas con el usuario de Lichess o Chess.com ===");
  const { page, ctx, errores } = await abrir(browser, true);
  const pedidos = [];
  await servirSitios(ctx, pedidos);

  // Un usuario inválido no se pide.
  await page.fill("#bajar-usuario", "no vale!");
  await page.click("#bajar");
  cierto("un usuario inválido se explica y no se pide nada", /tal como sale en su perfil/.test(await page.textContent("#bajar-estado")) && pedidos.length === 0);

  // Lichess: baja, elige al usuario como rival y analiza solo.
  await page.fill("#bajar-usuario", "PedroP");
  await page.selectOption("#bajar-maximo", "500");
  await page.click("#bajar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("a Lichess se le pide ese usuario, con el tope elegido y sin relojes ni evaluaciones",
    pedidos.map((u) => { const x = new URL(u); return x.pathname + " max=" + x.searchParams.get("max") + " clocks=" + x.searchParams.get("clocks") + " evals=" + x.searchParams.get("evals"); }),
    ["/api/games/user/PedroP max=500 clocks=false evals=false"]);
  igual("y analiza solo, con el usuario como rival", [await page.textContent("#titulo-resultado"), await page.evaluate(() => document.getElementById("rival").value)], ["PedroP", "PedroP"]);
  cierto("con todas sus partidas", /^73 partidas/.test(await page.textContent("#resultado-sub")));

  // Un usuario que no existe: se dice, en palabras.
  await page.fill("#bajar-usuario", "nadie");
  await page.click("#bajar");
  await page.waitForFunction(() => /No existe/.test(document.getElementById("bajar-estado").textContent), null, { timeout: 10000 });
  igual("un usuario que no existe se dice", await page.textContent("#bajar-estado"), "No existe el usuario «nadie» en Lichess.");

  // El 404 de «nadie» lo anota el navegador en la consola por su cuenta: es
  // el pedido que falló, no un error de la página.
  const errores404 = errores.filter((e) => /status of 404/.test(e));
  errores.splice(0, errores.length, ...errores.filter((e) => !errores404.includes(e)));

  // Chess.com: los meses, del más nuevo al más viejo.
  pedidos.length = 0;
  await page.check("#bajar-chesscom");
  await page.fill("#bajar-usuario", "PedroP");
  await page.selectOption("#bajar-maximo", "0");
  await page.evaluate(() => { document.getElementById("motor-estado").textContent = ""; document.getElementById("titulo-resultado").textContent = ""; });
  await page.click("#bajar");
  await page.waitForFunction(() => /Listo/.test(document.getElementById("motor-estado").textContent), null, { timeout: 30000 });
  igual("a Chess.com se le pide la lista de meses y cada mes, del más nuevo al más viejo",
    pedidos.map((u) => u.replace("https://api.chess.com/pub/player/", "")),
    ["pedrop/games/archives", "pedrop/games/2026/09/pgn", "pedrop/games/2026/08/pgn"]);
  igual("y analiza las de los dos meses, con el nombre como sale en las partidas",
    [await page.textContent("#titulo-resultado"), /^73 partidas/.test(await page.textContent("#resultado-sub"))], ["pedrop", true]);

  // Con un tope que ya se juntó en el mes más nuevo, no se pide el siguiente
  // y sale justo esa cantidad.
  pedidos.length = 0;
  const bajadas = await page.evaluate(async () => {
    const t = await window.PreparacionDescarga.descargar({ sitio: "chesscom", usuario: "pedrop", maximo: 10 });
    return window.PreparacionDescarga.contarPartidas(t);
  });
  igual("con tope 10: diez partidas y sin pedir agosto", [bajadas, pedidos.length], [10, 2]);

  igual("sin errores en consola ni diálogos del navegador", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

// La CSP tiene que dejar pedir a los dos sitios: sin eso, en producción la
// descarga falla aunque acá funcione (el servidor de prueba no manda _headers).
function pruebaCsp() {
  console.log("\n=== La CSP deja bajar de Lichess y Chess.com ===");
  const h = require("fs").readFileSync(require("path").join(__dirname, "..", "_headers"), "utf8");
  const politica = (h.match(/^\s*Content-Security-Policy: (.+)$/m) || [])[1] || "";
  const connect = ((politica.match(/connect-src ([^;]+);/) || [])[1] || "").split(/\s+/);
  igual("connect-src tiene los dos", ["https://lichess.org", "https://api.chess.com"].filter((x) => !connect.includes(x)), []);
}

(async () => {
  pruebaAnalisis();
  pruebaCsp();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaSinPermiso(browser);
    await pruebaConPermiso(browser);
    await pruebaDescarga(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nLa preparación de rivales está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
