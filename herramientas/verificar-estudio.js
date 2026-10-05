/* Comprueba entreno/estudio.html en un navegador de verdad.
 *
 * Acá viven TODAS las fichas —aperturas, defensas, táctica y conceptos— desde
 * que entreno/fichas.html se fusionó con esta página: eran la misma página dos
 * veces. Este archivo absorbió lo que comprobaba verificar-fichas-pagina.js,
 * que se fue con ella.
 *
 * Lo que se rompe acá no da ningún error: un bloque que se pinta con los
 * renglones de otro, un tablero que dibuja la posición de salida y no la
 * jugada 6, un botón de practicar que lleva a una línea que no existe. La
 * ficha se ve perfecta en los tres casos.
 *
 * Existe aparte de verificar-css.js porque esta página está detrás del login y
 * él abre las páginas sin cuenta: nada de esto lo ve nunca.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       npm install chess.js@0.10.3 playwright
 *       node herramientas/verificar-estudio.js                */
const path = require("path");
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const { FICHAS } = require(path.join(__dirname, "..", "js", "fichas-estudio.js"));
const { LINEAS } = require(path.join(__dirname, "..", "js", "aperturas-lineas.js"));

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const POR_ID = new Map(LINEAS.map((L) => [L.id, L]));
const { CATEGORIAS } = require(path.join(__dirname, "..", "js", "fichas-estudio.js"));
const ESTUDIO = FICHAS;
const APERTURAS = FICHAS.filter((F) => F.categoria === "apertura");
const DEFENSAS = FICHAS.filter((F) => F.categoria === "defensa");
const sinTildes = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const textoDe = (F) => [F.titulo, F.subtitulo, F.resumen, F.diagrama, F.centro.join(" "),
                        F.bloques.map((b) => b.join(" ")).join(" ")].join(" ");

const CJS = require("chess.js");
const Chess = CJS.Chess || CJS;

const GLYPH = { w: { p:"♙", n:"♘", b:"♗", r:"♖", q:"♕", k:"♔" }, b: { p:"♟", n:"♞", b:"♝", r:"♜", q:"♛", k:"♚" } };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const CON_SESION = `
(function () {
  window.sb = { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-ana" } } } }) } };
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

async function abrir(browser, ruta, cliente) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: cliente || CON_SESION }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

const LEER_TABLERO = () => {
  const piezas = {};
  document.querySelectorAll("#tablero .sq").forEach((c) => {
    const s = c.querySelector("span:not(.coord-etiqueta)");
    if (s && s.textContent.trim()) piezas[c.dataset.square] = s.textContent.trim();
  });
  return piezas;
};
const ordenado = (piezas) => Object.keys(piezas).sort().map((k) => k + piezas[k]).join(" ");
function tableroEsperado(jugadas, hasta, fen) {
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
function jugadasDe(F) {
  if (F.fen) return F.linea || [];
  if (F.jugadas) return F.jugadas;
  return POR_ID.get(F.lineaId).jugadas;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("=== Sin sesión no se entra ===");
    {
      const { page, ctx } = await abrir(browser, "/entreno/estudio.html", SIN_SESION);
      await page.waitForURL(/login\.html/, { timeout: 15000 }).catch(() => {});
      igual("manda a iniciar sesión, con el volver puesto",
        /login\.html\?next=entreno%2Festudio\.html/.test(page.url()), "true");
      await ctx.close();
    }

    console.log("\n=== Todas las fichas, juntas y sin pestañas ===");
    const { page, ctx, errores } = await abrir(browser, "/entreno/estudio.html");
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

    igual("no queda ninguna pestaña en la página",
      await page.evaluate(() => document.querySelectorAll("nav.tabs, .tab").length), 0);
    igual("se ven TODAS las fichas de una, todas las categorías juntas",
      await page.evaluate(() => document.querySelectorAll(".ficha-item").length), ESTUDIO.length);
    igual("agrupadas en un <h2> por categoría",
      await page.evaluate(() => [...document.querySelectorAll("h2.study-group-title")].map((h) => h.textContent)),
      CATEGORIAS.map((c) => c.etiqueta));
    igual("bajo «Aperturas» van exactamente las suyas, en orden",
      await page.evaluate(() => {
        const h2 = [...document.querySelectorAll("h2.study-group-title")].find((h) => h.textContent === "Aperturas");
        return [...h2.nextElementSibling.querySelectorAll(".ficha-item .name")].map((n) => n.textContent);
      }), APERTURAS.map((F) => F.titulo));
    igual("bajo «Defensas» van las suyas",
      await page.evaluate(() => {
        const h2 = [...document.querySelectorAll("h2.study-group-title")].find((h) => h.textContent === "Defensas");
        return [...h2.nextElementSibling.querySelectorAll(".ficha-item .name")].map((n) => n.textContent);
      }), DEFENSAS.map((F) => F.titulo));

    console.log("\n=== Una ficha: el mapa completo y el tablero ===");
    const F1 = ESTUDIO.find((F) => F.id === "espanola");
    await page.evaluate((nombre) => {
      [...document.querySelectorAll(".ficha-item")].find((b) => b.textContent.indexOf(nombre) !== -1).click();
    }, F1.titulo);
    await page.waitForSelector("#ficha-vista", { state: "visible", timeout: 5000 });

    igual("el título y la etiqueta de categoría son los de la ficha",
      await page.evaluate(() => [document.getElementById("ficha-titulo").textContent, document.getElementById("ficha-etiqueta").textContent]),
      [F1.titulo, "Aperturas"]);
    igual("los cinco bloques traen sus propios renglones",
      await page.evaluate(() => ["idea", "1", "2", "3", "4"].map((s) =>
        [...document.querySelectorAll("#l-" + s + " li")].map((li) => li.textContent))),
      [F1.centro].concat(F1.bloques));

    const jugadas1 = jugadasDe(F1);
    igual("el tablero arranca en la posición de salida de la línea",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(jugadas1, 0)));
    await page.click("#b-final");
    igual("y llega hasta la posición final, pieza por pieza",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(jugadas1, jugadas1.length)));
    /* La posición en palabras ya no vive plegada al final: va pegada a los
       botones que la cambian y es región viva, así que se vuelve a leer sola en
       cada jugada. Por eso hay que ESPERARLA: se vacía y se repuebla con un
       retraso a propósito —una región viva solo reacciona cuando el texto
       cambia, y volver a la misma posición desde el otro lado no se anunciaría—
       así que leerla en el mismo instante del clic la encuentra vacía. */
    /* Lo que se lee SOLO en cada jugada es la jugada, contada: qué pieza va de
       dónde a dónde. La posición entera NO —una apertura son doce jugadas y
       treinta y dos piezas, o sea casi cuatrocientas casillas dictadas para ver
       una línea que dura medio minuto, y eso no lo escucha nadie— así que queda
       escrita ahí al lado, para leerla cuando se quiera.
       Hay que ESPERARLA: se vacía y se repuebla con un retraso a propósito
       —una región viva solo reacciona cuando el texto cambia— así que leerla en
       el mismo instante del clic la encuentra vacía. */
    await page.waitForFunction(() => /[Jj]ugada \d+ de \d+/.test(document.getElementById("posicion-escrita").textContent), null, { timeout: 3000 }).catch(() => {});
    igual("en cada jugada se lee en qué jugada va",
      await page.evaluate(() => /[Jj]ugada \d+ de \d+/.test(document.getElementById("posicion-escrita").textContent)), "true");
    // La jugada contada: qué pieza va de dónde a dónde — o, si fue un enroque,
    // que fue un enroque. La última de la española es justamente un enroque, así
    // que una comprobación que solo mirara "va de … a …" fallaría sobre una
    // frase perfectamente correcta.
    igual("y la jugada contada, en palabras",
      await page.evaluate(() => /(va de .* a |[Ee]nroque)/.test(document.getElementById("posicion-escrita").textContent)), "true");
    igual("pero NO las treinta y dos piezas en cada paso",
      await page.evaluate(() => /Blancas:.*Negras:/.test(document.getElementById("posicion-escrita").textContent)), "false");
    igual("esas están ahí al lado, para leerlas cuando se quiera",
      await page.evaluate(() => /Blancas:.*Negras:/.test(document.getElementById("posicion-completa").textContent)), "true");

    const enlace = await page.getAttribute("#b-practicar", "href");
    igual("el botón de practicar apunta a la línea del banco, no a la lista",
      enlace, "aperturas.html?linea=" + F1.lineaId);
    igual("y esa línea existe de verdad", POR_ID.has(F1.lineaId), "true");
    const destino = await abrir(browser, "/entreno/" + enlace);
    await destino.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 }).catch(() => {});
    igual("al abrirlo, esa página abre esa línea y no la lista",
      await destino.page.evaluate(() => (document.getElementById("lesson-title") || document.querySelector("h2") || {}).textContent || ""),
      POR_ID.get(F1.lineaId).nombre);
    await destino.ctx.close();

    await page.click("#volver");
    igual("«volver» regresa a la lista de fichas",
      await page.evaluate(() => getComputedStyle(document.getElementById("lista-vista")).display), "block");

    console.log("\n=== Una familia con líneas de los dos colores queda junta, cada una con su color ===");
    // La Defensa siciliana trae tanto "Siciliana cerrada" (blancas, en el
    // grupo Aperturas) como esta ficha (negras, en Defensas): no se pierde
    // ninguna y cada una dice con qué color se juega.
    igual("«Defensa siciliana» aparece en Defensas y dice que se juega con negras",
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll(".ficha-item")].find((b) => b.querySelector(".name").textContent === "Defensa siciliana");
        return btn ? btn.querySelector(".desc").textContent : null;
      }),
      "juegas con negras · " + { 1: "Principiante", 2: "Intermedio", 3: "Avanzado" }[ESTUDIO.find((F) => F.id === "siciliana").nivel] +
        " · " + ESTUDIO.find((F) => F.id === "siciliana").subtitulo);

    console.log("\n=== El buscador mira todas las categorías ===");
    await page.fill("#buscar", "peon pasado");     // sin tilde, como lo escribe cualquiera
    const hallado = await page.evaluate(() => [...document.querySelectorAll(".ficha-item")].map((b) => b.dataset.ficha));
    igual("«peon pasado» encuentra exactamente las fichas que hablan de él",
      hallado.slice().sort(),
      FICHAS.filter((F) => sinTildes(textoDe(F)).includes("peon pasado")).map((F) => F.id).sort());
    igual("y no son todas de la misma categoría",
      new Set(hallado.map((id) => FICHAS.find((F) => F.id === id).categoria)).size > 1, "true");
    await page.fill("#buscar", "zzzz");
    igual("una búsqueda sin resultados lo dice en vez de dejar la lista vacía",
      await page.evaluate(() => (document.querySelector("#ficha-lista .vacio") || {}).textContent || ""),
      "Ninguna ficha dice eso. Prueba con otra palabra.");
    await page.fill("#buscar", "");

    console.log("\n=== Una ficha de táctica: la posición de estudio ===");
    const F2 = FICHAS.find((F) => F.id === "mate-coz");
    await page.click('[data-ficha="mate-coz"]');
    igual("dibuja la FEN de la ficha, pieza por pieza",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado([], 0, F2.fen)));
    await page.click("#b-adelante");
    igual("y después del mate, con el caballo ya en f7",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(F2.linea, F2.linea.length, F2.fen)));
    // Sin línea de apertura, una ficha de táctica se practica en su tema de
    // Ejercicios por tema (el mismo ?tema= de las tareas).
    igual("una ficha de táctica ofrece practicar su tema",
      await page.evaluate(() => document.getElementById("b-practicar").checkVisibility()), "true");
    igual("y el botón abre ese tema en Ejercicios por tema",
      await page.getAttribute("#b-practicar", "href"), "temas.html?tema=" + F2.temaPractica);

    console.log("\n=== El enlace de una ficha ===");
    igual("al abrirla, la dirección queda apuntando a esa ficha",
      /\?ficha=mate-coz/.test(page.url()), "true");
    await page.click("#volver");
    igual("y al volver a la lista, la dirección se limpia",
      /\?ficha=/.test(page.url()), "false");
    {
      // Una ficha de concepto sin línea ni tema no promete nada que no esté.
      const sinNada = FICHAS.find((F) => !F.lineaId && !F.temaPractica && !F.jugadas);
      await page.click(`[data-ficha="${sinNada.id}"]`);
      igual(`una ficha sin línea ni tema (${sinNada.id}) no ofrece el botón de practicar`,
        await page.evaluate(() => document.getElementById("b-practicar").checkVisibility()), "false");
      await page.click("#volver");
    }
    {
      const d = await abrir(browser, "/entreno/estudio.html?ficha=horquilla");
      await d.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      igual("un enlace directo abre esa ficha, sin pasar por la lista",
        await d.page.evaluate(() => [document.getElementById("ficha-titulo").textContent,
          getComputedStyle(document.getElementById("ficha-vista")).display]),
        [FICHAS.find((F) => F.id === "horquilla").titulo, "block"]);
      await d.ctx.close();
    }
    {
      // La dirección vieja de Fichas se compartía con su ?ficha=: la regla de
      // _redirects tiene que existir y apuntar a una página que existe.
      const reglas = fs.readFileSync(path.join(__dirname, "..", "_redirects"), "utf8");
      igual("la dirección de Fichas redirige a Estudio",
        /^\/entreno\/fichas\.html\s+\/entreno\/estudio\.html\s+301$/m.test(reglas), "true");
      igual("y el destino de esa regla existe",
        fs.existsSync(path.join(__dirname, "..", "entreno", "estudio.html")), "true");
      igual("la página vieja ya no está en el repositorio",
        fs.existsSync(path.join(__dirname, "..", "entreno", "fichas.html")), "false");
    }
    {
      const d = await abrir(browser, "/entreno/estudio.html?ficha=no-existe");
      await d.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      igual("un id inventado cae a la lista, no a una ficha en blanco",
        await d.page.evaluate(() => getComputedStyle(document.getElementById("lista-vista")).display), "block");
      await d.ctx.close();
    }

    console.log("\n=== Cómo lo recorre un lector de pantalla ===");
    await page.click('[data-ficha="horquilla"]');
    const niveles = await page.evaluate(() =>
      [...document.querySelectorAll("h1,h2,h3,h4")].filter((h) => h.checkVisibility()).map((h) => +h.tagName[1]));
    igual("un solo h1 a la vista", niveles.filter((n) => n === 1).length, 1);
    let salto = 0;
    niveles.forEach((n, i) => { if (i && n > niveles[i - 1] + 1) salto = n; });
    igual("no se salta ningún nivel de encabezado", salto, 0);
    igual("las líneas del mapa son decoración y no se anuncian",
      await page.evaluate(() => document.querySelector(".mapa-lineas").getAttribute("aria-hidden")), "true");
    /* El tablero de la ficha SE RECORRE. Era `aria-hidden`, o sea que para un
       lector de pantalla no existía, y lo único que quedaba era un desplegable
       al final del bloque que había que volver a abrir después de cada jugada.
       Ahora se entra con Tab y se anda con las flechas, como el resto de los
       tableros de Entrenamiento — lo comprueba, casilla por casilla,
       herramientas/verificar-entreno-accesible.js. */
    igual("el tablero de la ficha no está escondido al lector de pantalla",
      await page.evaluate(() => document.getElementById("tablero").getAttribute("aria-hidden")), "null");
    igual("y se recorre con el teclado: una sola parada de tabulador",
      await page.evaluate(() => [...document.querySelectorAll("#tablero [data-square]")].filter((c) => c.tabIndex >= 0).length), "1");
    await page.click("#volver");

    console.log("\n=== Que la página SE VEA ===");
    igual("no hay CSS impreso como texto arriba de la página",
      await page.evaluate(() => /[{;]\s*[a-z-]+\s*:/.test(document.body.innerText.slice(0, 600))), "false");
    const fuente = await (await page.request.get(BASE + "/entreno/estudio.html")).text();
    igual("una sola hoja de estilos en el HTML de la página", (fuente.match(/<style/g) || []).length, 1);
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
      await oscuro.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CON_SESION }));
      const p2 = await oscuro.newPage();
      await p2.goto(BASE + "/entreno/estudio.html", { waitUntil: "networkidle" });
      await p2.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
      const fondo = await p2.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const claro = (fondo.match(/\d+/g) || []).slice(0, 3).reduce((a, b) => a + +b, 0) / 3;
      igual("con el tema en oscuro, el fondo arranca oscuro", claro < 90, "true");
      await oscuro.close();
    }

    console.log("\n=== Al imprimir sale la ficha, no la lista ===");
    await page.evaluate((nombre) => {
      [...document.querySelectorAll(".ficha-item")].find((b) => b.textContent.indexOf(nombre) !== -1).click();
    }, F1.titulo);
    await page.waitForSelector("#ficha-vista", { state: "visible", timeout: 5000 });
    await page.emulateMedia({ media: "print" });
    igual("la lista, el encabezado y el pie se van del papel",
      await page.evaluate(() => ["#lista-vista", "header", "footer"].map((s) => document.querySelector(s).checkVisibility())),
      [false, false, false]);
    igual("los cinco bloques y el diagrama sí se imprimen",
      await page.evaluate(() => [...document.querySelectorAll(".caja")].every((c) => c.checkVisibility())
        && document.querySelector(".diagrama").checkVisibility()), "true");
    igual("en el papel es un mapa: la idea a lo ancho y el tablero EN MEDIO de los bloques",
      await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const t = r("#tablero"), i = r(".caja-idea"), c1 = r(".caja-1"), c2 = r(".caja-2");
        return i.bottom <= t.top && c1.right <= t.left && c2.left >= t.right;
      }), "true");
    igual("una flecha de su color por bloque, trazada con la maqueta de la hoja",
      await page.evaluate(() => document.querySelectorAll(".mapa-lineas path[marker-end]").length), 5);
    igual("el sello de Ajedrez Integral va en el medallón del centro, ya cargado, y sin marca de agua",
      await page.evaluate(() => {
        const img = document.querySelector(".logo-centro");
        const n = document.getElementById("nodo").getBoundingClientRect();
        const r = img.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dentro = Math.hypot(cx - (n.left + n.width / 2), cy - (n.top + n.height / 2)) < 12 && r.width < n.width;
        return img.checkVisibility() && img.complete && img.naturalWidth > 0
          && /logo-oscar-angulo-marca\.png$/.test(img.src) && dentro
          && !document.querySelector(".marca-agua")
          && getComputedStyle(document.querySelector("#nodo > *")).visibility === "hidden";
      }), "true");
    igual("en la esquina, el logo del encabezado (sin academia, el de Ajedrez Integral)",
      await page.evaluate(() => {
        const img = document.querySelector("#logo-esquina img");
        return !!img && img.checkVisibility() && img.src === document.querySelector("#marca-enlace img").src;
      }), "true");
    await page.emulateMedia({ media: "screen" });
    igual("en la pantalla no salen el sello del medallón ni el logo de esquina",
      await page.evaluate(() => [".logo-centro", "#logo-esquina"].map((s) => document.querySelector(s).checkVisibility())), [false, false]);

    console.log("\n=== Las fichas en papel: administración y quien las compró ===");
    // El libro y las cartas viven en material/, que el worker solo le sirve a
    // administración y a quien las compró: el recuadro se le ofrece a esas
    // cuentas, y no a quien administra mirando «como alumno» (Ver como).
    {
      // `compro`: lo que contesta puede_bajar('fichas-de-estudio', false), la
      // misma pregunta que hace el worker. Se anota con qué se preguntó.
      const conPerfil = (esAdmin, compro) => CON_SESION.replace("})();", `
  window.sb.from = () => { const q = { select: () => q, eq: () => q,
    maybeSingle: () => Promise.resolve({ data: { id: "u-ana", role: "profesor", is_admin: ${esAdmin}, es_supervisor: false }, error: null }) }; return q; };
  window.__preguntas = [];
  window.sb.rpc = (f, args) => { window.__preguntas.push([f, args]); return Promise.resolve({ data: f === "puede_bajar" ? ${!!compro} : null, error: null }); };
})();`);
      const verRecuadro = async (cliente, modo) => {
        const d = await abrir(browser, "/entreno/estudio.html", cliente);
        if (modo) {
          await d.page.evaluate((m) => localStorage.setItem("modo_vista_admin_v1", m), modo);
          await d.page.reload({ waitUntil: "networkidle" });
        }
        await d.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
        await d.page.waitForTimeout(400);
        const r = await d.page.evaluate(() => {
          const caja = document.getElementById("papel-admin");
          return { visible: caja.checkVisibility(), enlaces: [...caja.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
                   quien: document.getElementById("papel-quien").textContent, preguntas: window.__preguntas };
        });
        await d.ctx.close();
        return r;
      };
      const admin = await verRecuadro(conPerfil(true));
      igual("quien administra ve el recuadro para bajar el libro y las cartas", admin.visible, "true");
      igual("los tres enlaces (versión accesible, libro y cartas) llevan a archivos que existen",
        admin.enlaces.map((h) => fs.existsSync(path.join(__dirname, "..", "entreno", h))), [true, true, true]);
      igual("dice que es solo de administración", admin.quien, "Solo para administración.");
      igual("una cuenta que no administra ni lo compró no lo ve", (await verRecuadro(conPerfil(false, false))).visible, "false");
      const compra = await verRecuadro(conPerfil(false, true));
      igual("quien lo compró en la tienda sí lo ve", compra.visible, "true");
      igual("y se le dice por qué", /compraste/i.test(compra.quien), "true");
      igual("se pregunta lo mismo que el worker: puede_bajar con la carpeta y sin que baste el acceso",
        compra.preguntas.filter(([f]) => f === "puede_bajar"), [["puede_bajar", { p_producto: "fichas-de-estudio", p_basta_acceso: false }]]);
      igual("quien administra mirando «como alumno» tampoco", (await verRecuadro(conPerfil(true), "alumno")).visible, "false");
    }

    console.log("\n=== El logo de la esquina es el de la academia ===");
    // js/marca-academia.js cambia el encabezado cuando llega la marca: la
    // esquina lo sigue, con logo o, si la academia no tiene, con su nombre.
    igual("con logo de academia, la esquina pone ESE logo",
      await page.evaluate(async () => {
        const enlace = document.getElementById("marca-enlace");
        enlace.innerHTML = '<span><img src="/img/logo-oscar-angulo.png" alt=""><span class="font-serif">ADAPZ</span></span>';
        await new Promise((r) => setTimeout(r, 50));
        const img = document.querySelector("#logo-esquina img");
        return !!img && /logo-oscar-angulo\.png$/.test(img.src);
      }), "true");
    igual("sin logo, la esquina pone el nombre de la academia",
      await page.evaluate(async () => {
        const enlace = document.getElementById("marca-enlace");
        enlace.innerHTML = '<span><span aria-hidden="true">♟️</span><span class="font-serif">CCDR San José</span></span>';
        await new Promise((r) => setTimeout(r, 50));
        const e = document.getElementById("logo-esquina");
        return !e.querySelector("img") && e.textContent;
      }), "CCDR San José");

    console.log("\n=== En el papel, la posición que cuenta el pie ===");
    // En pantalla abre en la salida; impresa, una apertura con las piezas en
    // su casilla de siempre no dice nada. Al imprimir va al final de la línea
    // y al terminar vuelve.
    const jugadasF1 = jugadasDe(F1);
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    igual("al imprimir, el tablero muestra el final de la línea",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(jugadasF1, jugadasF1.length)));
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    igual("después de imprimir vuelve a la posición de salida",
      ordenado(await page.evaluate(LEER_TABLERO)), ordenado(tableroEsperado(jugadasF1, 0)));

    console.log("\n=== Cada ficha cabe en UNA hoja, carta y A4 ===");
    // Antes el tablero se partía entre dos hojas y las coordenadas de afuera
    // empujaban una segunda en blanco. Se imprime de verdad (PDF) y se cuentan
    // las hojas; y que las letras de las columnas salgan en el papel.
    const hojas = (pdf) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    // Sin esto el PDF sale con los estilos de pantalla: arriba se emuló «screen».
    await page.emulateMedia({ media: null });
    const deMas = [], deformes = [];
    let sinLetras = 0;
    for (const F of ESTUDIO) {
      await page.goto(BASE + "/entreno/estudio.html?ficha=" + F.id, { waitUntil: "networkidle" });
      await page.waitForSelector("#ficha-vista", { state: "visible", timeout: 10000 });
      for (const format of ["Letter", "A4"]) {
        const n = hojas(await page.pdf({ format }));
        if (n !== 1) deMas.push(F.id + " (" + format + ": " + n + ")");
      }
      const letras = await page.evaluate(() => [...document.querySelectorAll(".coord-columna")].map((e) => e.textContent).join(""));
      if (letras !== "abcdefgh") sinLetras += 1;
      // En el papel el tablero también es cuadrado y con las filas parejas:
      // las casillas con pieza crecían a lo alto (232×268 en la Española).
      await page.emulateMedia({ media: "print" });
      const forma = await page.evaluate(() => {
        const t = document.getElementById("tablero"), r = t.getBoundingClientRect();
        const filas = getComputedStyle(t).gridTemplateRows.split(" ").map(parseFloat);
        return { cuadrado: Math.abs(r.width - r.height) <= 1.5, parejas: Math.max(...filas) - Math.min(...filas) <= 1, medida: `${r.width.toFixed(0)}×${r.height.toFixed(0)}` };
      });
      await page.emulateMedia({ media: null });
      if (!forma.cuadrado || !forma.parejas) deformes.push(F.id + " " + forma.medida);
    }
    igual("en el papel, todos los tableros cuadrados y con las filas parejas", deformes.join(", ") || "todos", "todos");
    igual("las " + ESTUDIO.length + " fichas, en una sola hoja", deMas.join(", ") || "todas", "todas");
    igual("con las letras de las columnas debajo del tablero", sinLetras, 0);

    igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n✗ ${fallos} problema(s).` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})();
