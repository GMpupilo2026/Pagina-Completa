/* Comprueba entreno/fichas.html en un navegador de verdad.
 *
 * El banco lo comprueba herramientas/verificar-fichas.js (que las posiciones
 * sean legales y que el motivo que promete cada ficha se cumpla). Esto es lo
 * otro: que lo que se ve en pantalla sea lo que dice el banco. Lo que se rompe
 * acá no da ningún error —un bloque que se pinta con los renglones de otro, un
 * tablero que dibuja la posición de salida y no la jugada 6, un botón de
 * practicar que lleva a una línea que no existe—: la ficha se ve perfecta.
 *
 * Existe aparte de verificar-css.js porque esta página está detrás del login y
 * él abre las páginas sin cuenta: nada de esto lo ve nunca.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       npm install chess.js@0.10.3 playwright
 *       node herramientas/verificar-fichas-pagina.js                */
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { FICHAS, TITULOS, CATEGORIAS } = require(path.join(__dirname, "..", "js", "fichas-estudio.js"));
const { LINEAS } = require(path.join(__dirname, "..", "js", "aperturas-lineas.js"));

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const POR_ID = new Map(LINEAS.map((L) => [L.id, L]));

let CHESSJS = "";
for (const base of String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
                  .concat([path.join(__dirname, "..", "node_modules")])) {
  const f = path.join(base, "chess.js", "chess.js");
  if (!CHESSJS && fs.existsSync(f)) CHESSJS = fs.readFileSync(f, "utf8");
}
if (!CHESSJS) { console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3"); process.exit(2); }
const CJS = require("chess.js");
const Chess = CJS.Chess || CJS;

const GLYPH = { w: { p:"♙", n:"♘", b:"♗", r:"♖", q:"♕", k:"♔" }, b: { p:"♟", n:"♞", b:"♝", r:"♜", q:"♛", k:"♚" } };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// Una sesión de mentira: la página solo pregunta si hay una.
const CON_SESION = `
(function () {
  window.sb = { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" } } } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, upsert() { return this; },
                   then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }),
    rpc: () => ({ then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }) };
})();
`;
const SIN_SESION = CON_SESION.replace("session: { user: { id: \"u-ana\" } }", "session: null");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + (a.length > 90 ? a.slice(0, 90) + "…" : a));
}
const bien = (m) => console.log("  ✓ " + m);
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };

async function abrir(browser, ruta, cliente) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente || CON_SESION }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

// Lo que de verdad hay dibujado en el tablero, casilla por casilla.
const LEER_TABLERO = () => {
  const piezas = {};
  document.querySelectorAll("#tablero .sq").forEach((c) => {
    const s = c.querySelector("span:not(.coord-etiqueta)");
    if (s && s.textContent.trim()) piezas[c.dataset.square] = s.textContent.trim();
  });
  return piezas;
};
const ordenado = (piezas) => Object.keys(piezas).sort().map((k) => k + piezas[k]).join(" ");
function tableroEsperado(fen, jugadas, hasta) {
  const g = new Chess();
  if (fen) g.load(fen);
  for (let i = 0; i < hasta; i++) g.move(jugadas[i], { sloppy: true });
  const piezas = {};
  for (let r = 1; r <= 8; r++) FILES.forEach((f) => {
    const p = g.get(f + r);
    if (p) piezas[f + r] = GLYPH[p.color][p.type];
  });
  return piezas;
}
const sinTildes = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const textoDe = (F) => [F.titulo, F.subtitulo, F.resumen, F.diagrama, F.centro.join(" "), F.bloques.map((b) => b.join(" ")).join(" ")].join(" ");
function jugadasDe(F) {
  if (F.fen) return F.linea || [];
  if (F.jugadas) return F.jugadas;
  return POR_ID.get(F.lineaId).jugadas;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    // ---------------------------------------------------------------- sesión
    console.log("=== Sin sesión no se entra ===");
    {
      const { page, ctx } = await abrir(browser, "/entreno/fichas.html", SIN_SESION);
      await page.waitForURL(/login\.html/, { timeout: 15000 }).catch(() => {});
      igual("manda a iniciar sesión, con el volver puesto",
        /login\.html\?next=entreno%2Ffichas\.html/.test(page.url()), "true");
      await ctx.close();
    }

    // ------------------------------------------------------------ pestañas
    console.log("\n=== Las cuatro pestañas ===");
    const { page, ctx, errores } = await abrir(browser, "/entreno/fichas.html");
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

    igual("las pestañas, con su cuenta",
      await page.evaluate(() => [...document.querySelectorAll("#tabs .tab")].map((b) => b.textContent.trim().replace(/\s+/g, " "))),
      CATEGORIAS.map((c) => `${c.etiqueta} ${FICHAS.filter((F) => F.categoria === c.id).length}`));
    igual("arranca en Aperturas y solo enseña las suyas",
      await page.evaluate(() => document.querySelectorAll("#ficha-lista .ficha-item").length),
      FICHAS.filter((F) => F.categoria === "apertura").length);
    await page.click("#tabs .tab:nth-child(3)");
    igual("al tocar «Táctica» se repinta con las suyas",
      await page.evaluate(() => [...document.querySelectorAll("#ficha-lista .ficha-item")].map((b) => b.dataset.ficha)),
      FICHAS.filter((F) => F.categoria === "tactica").map((F) => F.id));

    // ------------------------------------------------------------- buscador
    console.log("\n=== Buscar mira TODAS las pestañas, no solo la abierta ===");
    await page.click("#tabs .tab:nth-child(1)");   // volver a Aperturas
    await page.fill("#buscar", "peon pasado");     // sin tilde, como lo escribe cualquiera
    const hallado = await page.evaluate(() => [...document.querySelectorAll("#ficha-lista .ficha-item")].map((b) => b.dataset.ficha));
    igual("«peon pasado» encuentra, desde Aperturas, exactamente las fichas que hablan de él",
      hallado.slice().sort(),
      FICHAS.filter((F) => sinTildes(textoDe(F)).includes("peon pasado")).map((F) => F.id).sort());
    igual("y esas fichas no son todas de la pestaña abierta",
      new Set(hallado.map((id) => FICHAS.find((F) => F.id === id).categoria)).size > 1, "true");
    await page.fill("#buscar", "zzzz");
    igual("una búsqueda sin resultados lo dice en vez de dejar la lista vacía",
      await page.evaluate(() => (document.querySelector("#ficha-lista .vacio") || {}).textContent || ""),
      "Ninguna ficha dice eso. Prueba con otra palabra.");
    await page.fill("#buscar", "");

    // --------------------------------------------------- la ficha por dentro
    console.log("\n=== Una ficha de apertura: los cinco bloques y el tablero ===");
    const F1 = FICHAS.find((F) => F.id === "italiana");
    await page.click('[data-ficha="italiana"]');
    igual("los cinco títulos son los de su categoría",
      await page.evaluate(() => ["idea", "1", "2", "3", "4"].map((s) => document.getElementById("t-" + s).textContent)),
      TITULOS[F1.categoria]);
    igual("cada bloque trae SUS renglones, no los del de al lado",
      await page.evaluate(() => ["idea", "1", "2", "3", "4"].map((s) =>
        [...document.querySelectorAll("#l-" + s + " li")].map((li) => li.textContent))),
      [F1.centro].concat(F1.bloques));
    igual("el pie cuenta qué se ve en el diagrama",
      await page.evaluate(() => document.getElementById("pie-diagrama").textContent), F1.diagrama);

    const jugadas1 = jugadasDe(F1);
    igual("el tablero dibuja la posición de salida de la línea, pieza por pieza",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(null, jugadas1, 0)));
    await page.click("#b-final");
    igual("y la posición del final de la línea",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(null, jugadas1, jugadas1.length)));
    await page.click("#b-atras");
    igual("una jugada para atrás, la de antes",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(null, jugadas1, jugadas1.length - 1)));
    igual("la jugada de ahora queda marcada en la lista, en español",
      await page.evaluate(() => (document.querySelector("#jugadas .jugada.actual") || {}).textContent || ""),
      jugadas1[jugadas1.length - 2].replace(/[NBRQK]/g, (l) => ({ N: "C", B: "A", R: "T", Q: "D", K: "R" }[l])));

    // El botón tiene que llevar a una línea que EXISTE en el banco de
    // aperturas: un id mal escrito no da error, lleva a la lista de allá.
    const enlace = await page.getAttribute("#b-practicar", "href");
    igual("el botón de practicar apunta a la línea del banco",
      enlace, "aperturas.html?linea=" + F1.lineaId);
    igual("y esa línea existe de verdad", POR_ID.has(F1.lineaId), "true");
    const destino = await abrir(browser, "/entreno/" + enlace);
    await destino.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 }).catch(() => {});
    igual("al abrirlo, esa página abre esa línea y no la lista",
      await destino.page.evaluate(() => (document.getElementById("lesson-title") || document.querySelector("h2") || {}).textContent || ""),
      POR_ID.get(F1.lineaId).nombre);
    await destino.ctx.close();

    console.log("\n=== Una ficha de táctica: la posición de estudio ===");
    await page.click("#volver");
    await page.click("#tabs .tab:nth-child(3)");
    const F2 = FICHAS.find((F) => F.id === "mate-coz");
    await page.click('[data-ficha="mate-coz"]');
    igual("dibuja la FEN de la ficha",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(F2.fen, [], 0)));
    await page.click("#b-adelante");
    igual("y después del mate, la posición con el caballo ya en f7",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(F2.fen, F2.linea, F2.linea.length)));
    igual("una ficha sin línea de apertura no ofrece el botón de practicar",
      await page.evaluate(() => getComputedStyle(document.getElementById("b-practicar")).display), "none");
    igual("la posición contada en palabras dice lo que hay",
      await page.evaluate(() => /Blancas:.*Negras:/.test(document.getElementById("posicion-escrita").textContent)), "true");

    // -------------------------------------------------------- el enlace
    console.log("\n=== El enlace de una ficha ===");
    igual("al abrirla, la dirección queda apuntando a esa ficha",
      /\?ficha=mate-coz/.test(page.url()), "true");
    await page.click("#volver");
    igual("y al volver a la lista, la dirección se limpia",
      /\?ficha=/.test(page.url()), "false");
    {
      const d = await abrir(browser, "/entreno/fichas.html?ficha=horquilla");
      await d.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      igual("un enlace directo abre esa ficha, sin pasar por la lista",
        await d.page.evaluate(() => [document.getElementById("ficha-titulo").textContent,
          getComputedStyle(document.getElementById("ficha-vista")).display]),
        [FICHAS.find((F) => F.id === "horquilla").titulo, "block"]);
      await d.ctx.close();
    }
    {
      const d = await abrir(browser, "/entreno/fichas.html?ficha=no-existe");
      await d.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      igual("un id inventado cae a la lista, no a una ficha en blanco",
        await d.page.evaluate(() => getComputedStyle(document.getElementById("lista-vista")).display), "block");
      await d.ctx.close();
    }

    // ------------------------------------------------- se ve y se lee bien
    console.log("\n=== Que la página SE VEA (la lección de las cabeceras clonadas) ===");
    igual("no hay CSS impreso como texto arriba de la página",
      await page.evaluate(() => /[{;]\s*[a-z-]+\s*:/.test(document.body.innerText.slice(0, 600))), "false");
    // Se cuenta en el HTML tal como lo sirve el servidor, no en el DOM:
    // js/coordenadas-tablero.js inyecta el suyo al rotular el tablero y ese es
    // legítimo. Lo que se busca acá es el </style> de otra página colado al
    // clonar la cabecera, que parte la hoja en dos.
    const fuente = await (await page.request.get(BASE + "/entreno/fichas.html")).text();
    igual("una sola hoja de estilos en el HTML de la página",
      (fuente.match(/<style/g) || []).length, 1);
    igual("y se cierra una sola vez", (fuente.match(/<\/style>/g) || []).length, 1);
    igual("las clases propias pintan algo de verdad",
      await page.evaluate(() => {
        const c = document.querySelector(".caja");
        return getComputedStyle(c).borderTopWidth !== "0px" && getComputedStyle(c).padding !== "0px";
      }), "true");
    {
      const oscuro = await browser.newContext({ serviceWorkers: "block" });
      await oscuro.addInitScript(() => { try { localStorage.setItem("theme", "dark"); } catch (e) {} });
      await oscuro.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
      await oscuro.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
      await oscuro.route("**/fonts.gstatic.com/**", (r) => r.abort());
      await oscuro.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
      await oscuro.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CON_SESION }));
      const p2 = await oscuro.newPage();
      await p2.goto(BASE + "/entreno/fichas.html", { waitUntil: "networkidle" });
      await p2.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      const fondo = await p2.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const claro = (fondo.match(/\d+/g) || []).slice(0, 3).reduce((a, b) => a + +b, 0) / 3;
      igual("con el tema en oscuro, el fondo arranca oscuro", claro < 90, "true");
      await oscuro.close();
    }

    console.log("\n=== Cómo lo recorre un lector de pantalla ===");
    await page.click('[data-ficha="horquilla"]').catch(() => {});
    if (!(await page.isVisible("#ficha-vista"))) { await page.click("#tabs .tab:nth-child(3)"); await page.click('[data-ficha="horquilla"]'); }
    const niveles = await page.evaluate(() =>
      [...document.querySelectorAll("h1,h2,h3,h4")].filter((h) => h.checkVisibility()).map((h) => +h.tagName[1]));
    igual("un solo h1 a la vista", niveles.filter((n) => n === 1).length, 1);
    let salto = 0;
    niveles.forEach((n, i) => { if (i && n > niveles[i - 1] + 1) salto = n; });
    igual("no se salta ningún nivel de encabezado", salto, 0);
    igual("las líneas del mapa son decoración y no se anuncian",
      await page.evaluate(() => document.querySelector(".mapa-lineas").getAttribute("aria-hidden")), "true");
    igual("el tablero también: lo que se lee es la posición en palabras",
      await page.evaluate(() => document.getElementById("tablero").getAttribute("aria-hidden")), "true");

    console.log("\n=== Al imprimir sale la ficha, no la lista ===");
    await page.emulateMedia({ media: "print" });
    igual("la lista, las pestañas y el buscador se van del papel",
      await page.evaluate(() => ["#lista-vista", "#tabs", ".buscador", "header", "footer"]
        .map((s) => document.querySelector(s).checkVisibility())), [false, false, false, false, false]);
    igual("los cinco bloques y el diagrama sí se imprimen",
      await page.evaluate(() => [...document.querySelectorAll(".caja")].every((c) => c.checkVisibility())
        && document.querySelector(".diagrama").checkVisibility()), "true");
    await page.emulateMedia({ media: "screen" });

    igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
