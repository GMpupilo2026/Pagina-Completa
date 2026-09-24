/* ===== Comprobación: la Academia se recorre sin ver la pantalla =====
 *
 * Lo que se arregló para quien usa lector de pantalla se rompe callado: la
 * página se ve perfecta y funciona con el ratón, y lo único que pasa es que
 * alguien que no ve deja de poder entrenar. Por eso se mira desde afuera, en un
 * navegador de verdad y con el Modo Adaptado encendido, lo que oiría esa
 * persona:
 *
 *   1. La clase en vivo (sesion.html), como alumna:
 *      - el tablero tiene UNA parada de tabulador aunque no tenga el control, y
 *        las flechas mueven el foco (antes: cero paradas, no se podía mirar);
 *      - cada casilla se dice con la columna hablada y el color concordado;
 *      - el recuadro se VE y contesta "posición";
 *      - sin el control, escribir una jugada explica por qué no y NO manda nada;
 *      - cuando el profesor mueve, se anuncia la jugada (y no las 32 piezas);
 *      - con el control, la jugada escrita llega a la base como la del clic;
 *      - con las piezas OCULTAS ni las casillas ni el recuadro las cuentan;
 *      - la pregunta del profesor es un diálogo que se lleva el foco y se
 *        contesta escribiendo.
 *   2. Ejercicios por tema: un solo "Saltar al contenido", cada botón dice qué
 *      tema abre, y al abrir uno se anuncia quién juega y qué buscar —nunca
 *      "haz clic"— con el foco en el recuadro.
 *   3. Aprender: abrir una lección deja el foco en su título, no en el <body>.
 *   4. En un celular sin la preferencia elegida se PREGUNTA por el modo, una
 *      sola vez; en la computadora no.
 *   5. Ningún título de la Academia le hace leer un emoji al lector.
 *
 * Cómo se corre (con el sitio en localhost:8777):
 *     npm install playwright chess.js@0.10.3
 *     node herramientas/verificar-clase-adaptada.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir, igual, CHROME, BASE, fallos } = require("./verificar-clase-registrada.js");
const guia = require("./guia-capturas.js");

const RAIZ = path.join(__dirname, "..");
let mias = 0;
function si(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); mias += 1; }
}

const CLASE = { id: "s-1", title: "Hoy", created_by: "u-profe", ended_at: null,
                started_at: new Date().toISOString(), notes: null };
const LUCENA = "1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1";
const fila = (extra) => Object.assign({
  id: 7, owner_id: "u-profe", moves: [], start_fen: LUCENA, arrows: [], circles: [],
  active_player_id: null, active_player_color: "both", pieces_hidden: false,
  shown_curso: null, shown_leccion: null,
}, extra || {});

async function enAdaptado(page) {
  await page.evaluate(() => localStorage.setItem("oscarBlindMode_v1", "1"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
  await page.waitForTimeout(1200);
}
const aviso = (page, sel) => page.evaluate((s) => (document.querySelector(s + " .cc-msg") || {}).textContent || "", sel);
async function escribir(page, sel, texto) {
  const inp = page.locator(sel + " .cc-input");
  await inp.fill(texto);
  await inp.press("Enter");
  await page.waitForTimeout(250);
}

async function pruebaClase(browser) {
  console.log("\n=== La clase en vivo, sin ver la pantalla ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE);
  await enAdaptado(page);
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila());
  await page.waitForTimeout(300);

  const t = await page.evaluate(() => {
    const c = [...document.querySelectorAll("#chessboard [data-square]")];
    return { paradas: c.filter((x) => x.tabIndex === 0).length,
             b8: document.querySelector('#chessboard [data-square="b8"]').getAttribute("aria-label"),
             a2: document.querySelector('#chessboard [data-square="a2"]').getAttribute("aria-label"),
             caja: document.querySelector("#clase-cmd .cc-caja").checkVisibility(),
             posViva: document.querySelector("#clase-cmd .cc-pos").getAttribute("aria-live") };
  });
  igual("el tablero tiene UNA parada de tabulador sin tener el control", t.paradas, 1);
  igual("la casilla dice la columna hablada y el color concordado", t.b8, "bella 8, rey blanco");
  igual("y la torre negra es negra, no «negro»", t.a2, "anna 2, torre negra");
  igual("el recuadro se ve en Modo Adaptado", t.caja, true);
  igual("la posición del recuadro NO es región viva (se anuncia la jugada)", t.posViva, null);

  await page.focus("#chessboard [tabindex='0']");
  const antes = await page.evaluate(() => document.activeElement.dataset.square);
  await page.keyboard.press("ArrowRight");
  const despues = await page.evaluate(() => document.activeElement.dataset.square);
  si("las flechas mueven el foco aunque no tenga el control", antes && despues && antes !== despues, antes + " → " + despues);

  await escribir(page, "#clase-cmd", "posición");
  si("«posición» contesta con las piezas", /Blancas: rey en bella 8/.test(await aviso(page, "#clase-cmd")), await aviso(page, "#clase-cmd"));

  await page.evaluate(() => { window.__updates.length = 0; });
  await escribir(page, "#clase-cmd", "Td1");
  si("sin el control, escribir una jugada explica por qué", /mueve tu profe/i.test(await aviso(page, "#clase-cmd")), await aviso(page, "#clase-cmd"));
  igual("y no manda nada a la base", await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").length), 0);

  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ moves: ["Rd1+"] }));
  await page.waitForTimeout(300);
  const jugada = await aviso(page, "#clase-cmd");
  si("la jugada del profesor se anuncia", /Se jugó torre david 1 jaque\. Juegan negras\./.test(jugada), jugada);
  si("sin dictar la posición entera", !/Blancas:/.test(jugada), jugada);

  // Le da el control con negras: la jugada escrita tiene que llegar a la base.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f),
    fila({ moves: ["Rd1+"], active_player_id: "u-ana", active_player_color: "b" }));
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__updates.length = 0; });
  await escribir(page, "#clase-cmd", "Re7");
  const env = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").map((u) => u.campos.moves));
  si("con el control, la jugada escrita se manda como la del clic", env.length && JSON.stringify(env[env.length - 1]) === JSON.stringify(["Rd1+", "Ke7"]), JSON.stringify(env));
  si("y se confirma en palabras", /Jugaste rey eva 7/.test(await aviso(page, "#clase-cmd")), await aviso(page, "#clase-cmd"));

  // Piezas ocultas: no se puede escapar ni una.
  await page.evaluate((f) => window.__cambioEnBase("game_state", f), fila({ pieces_hidden: true }));
  await page.waitForTimeout(300);
  const oc = await page.evaluate(() => ({
    b8: document.querySelector('#chessboard [data-square="b8"]').getAttribute("aria-label"),
    pos: document.querySelector("#clase-cmd .cc-pos").textContent,
  }));
  igual("con las piezas ocultas la casilla no dice qué hay", oc.b8, "bella 8");
  si("ni el recuadro las cuenta", /ocultas/.test(oc.pos) && !/rey/.test(oc.pos), oc.pos);
  await escribir(page, "#clase-cmd", "caballos");
  si("ni contesta preguntas sobre ellas", /ocultas/.test(await aviso(page, "#clase-cmd")), await aviso(page, "#clase-cmd"));

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaPregunta(browser) {
  console.log("\n=== La pregunta del profesor se contesta escribiendo ===");
  const pregunta = { id: "q-1", fen: LUCENA, created_by: "u-profe", expected_plies: 1, prompt: "¿Cómo se gana?",
                     closed_at: null, created_at: new Date().toISOString() };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { questions: [pregunta] });
  await enAdaptado(page);
  await page.waitForSelector("#question-card:not(.hidden)", { timeout: 8000 }).catch(() => {});
  const d = await page.evaluate(() => ({
    rol: document.getElementById("question-card").getAttribute("role"),
    foco: document.activeElement && document.activeElement.id,
    caja: !!document.querySelector("#question-cmd .cc-caja") && document.querySelector("#question-cmd .cc-caja").checkVisibility(),
  }));
  igual("la pregunta es un diálogo", d.rol, "dialog");
  igual("y se lleva el foco al abrirse", d.foco, "question-titulo");
  igual("con su recuadro a la vista", d.caja, true);
  await page.evaluate(() => { window.__inserts.length = 0; });
  await escribir(page, "#question-cmd", "Td1");
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "question_answers").map((i) => i.fila.moves));
  si("la jugada escrita se envía como respuesta", r.length && JSON.stringify(r[0]) === JSON.stringify(["Rd1+"]), JSON.stringify(r));
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function contextoAlumna(browser, opciones, adaptado) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones || {}));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript",
    body: guia.clienteFalso({ yo: guia.ALUMNOS[0] }) }));
  if (adaptado) await ctx.addInitScript(() => { try { localStorage.setItem("oscarBlindMode_v1", "1"); } catch (e) {} });
  return ctx;
}

async function pruebaTemas(browser) {
  console.log("\n=== Ejercicios por tema ===");
  const ctx = await contextoAlumna(browser, null, true);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/entreno/temas.html", { waitUntil: "networkidle" });
  await page.waitForSelector(".tbtn", { timeout: 20000 });
  const l = await page.evaluate(() => {
    const b = [...document.querySelectorAll(".tbtn")].map((x) => x.textContent.trim());
    return { saltos: [...document.querySelectorAll("a")].filter((a) => /Saltar al contenido/.test(a.textContent)).length,
             total: b.length, distintos: new Set(b).size };
  });
  igual("un solo «Saltar al contenido»", l.saltos, 1);
  si("cada botón dice qué tema abre (ninguno repetido)", l.total > 10 && l.total === l.distintos, l.distintos + " distintos de " + l.total);
  await page.locator(".tbtn").first().click();
  await page.waitForTimeout(800);
  const s = await page.evaluate(() => ({
    estado: document.getElementById("round-status").textContent,
    foco: document.activeElement && document.activeElement.className,
  }));
  si("se anuncia quién juega y qué buscar", /^Juegan (blancas|negras): encuentra/.test(s.estado), s.estado);
  si("sin mandar a hacer clic", !/clic/i.test(s.estado), s.estado);
  si("y el foco queda en el recuadro", /cc-input/.test(s.foco || ""), s.foco);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaFocoAlAbrir(browser, url, boton, titulo) {
  const ctx = await contextoAlumna(browser, null, true);
  const page = await ctx.newPage();
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator(boton).first().click();
  await page.waitForTimeout(600);
  igual("en " + url + " el foco va al título al abrir", await page.evaluate(() => document.activeElement.id), titulo);
  await ctx.close();
}

async function pruebaCelular(browser) {
  console.log("\n=== En el celular se pregunta por el modo, una vez ===");
  const tactil = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  let ctx = await contextoAlumna(browser, tactil, false);
  let page = await ctx.newPage();
  await page.goto(BASE + "/clases.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const o = await page.evaluate(() => {
    const c = document.getElementById("am-oferta");
    const salto = document.querySelector('a[href="#main-content"]');
    return { hay: !!c && c.checkVisibility(), justoDespues: !!c && salto && salto.nextElementSibling === c };
  });
  igual("en un celular sin la preferencia se pregunta", o.hay, true);
  igual("y es lo primero después de «Saltar al contenido»", o.justoDespues, true);
  await page.getByRole("button", { name: "Sí, activar el modo adaptado" }).tap();
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ clave: localStorage.getItem("oscarBlindMode_v1"),
    clase: document.documentElement.classList.contains("adaptive-mode"), sigue: !!document.getElementById("am-oferta") }));
  igual("decir que sí enciende el modo y lo guarda", r.clave + " " + r.clase, "1 true");
  igual("y la pregunta se va", r.sigue, false);
  await page.reload({ waitUntil: "networkidle" });
  igual("no vuelve a preguntar", await page.evaluate(() => !!document.getElementById("am-oferta")), false);
  await ctx.close();

  ctx = await contextoAlumna(browser, null, false);
  page = await ctx.newPage();
  await page.goto(BASE + "/clases.html", { waitUntil: "networkidle" });
  igual("en la computadora no se pregunta (ahí está el primer Tab)", await page.evaluate(() => !!document.getElementById("am-oferta")), false);
  await ctx.close();
}

function pruebaEmojis() {
  console.log("\n=== Los títulos no le hacen leer emojis al lector ===");
  const pat = /<(h[1-3])(\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2654}-\u{265F}]/u;
  const malos = [];
  const recorrer = (dir) => {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (/node_modules|cursos[\\/]recursos|\.git/.test(p)) continue;
      if (fs.statSync(p).isDirectory()) { recorrer(p); continue; }
      if (!p.endsWith(".html")) continue;
      const s = fs.readFileSync(p, "utf8").replace(/<script\b[\s\S]*?<\/script>/g, "");
      let m;
      while ((m = pat.exec(s))) {
        if (/\$\{|' \+/.test(m[3])) continue;
        const limpio = m[3].replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "");
        if (emo.test(limpio)) malos.push(path.relative(RAIZ, p) + ": " + limpio.trim().slice(0, 50));
      }
    }
  };
  recorrer(RAIZ);
  si("ningún h1-h3 con un emoji a la vista del lector", !malos.length, malos.slice(0, 5).join("\n      "));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaClase(browser);
    await pruebaPregunta(browser);
    await pruebaTemas(browser);
    console.log("\n=== Abrir una lección no pierde el foco ===");
    await pruebaFocoAlAbrir(browser, "/entreno/aprender.html", "#lesson-list button", "lesson-title");
    await pruebaFocoAlAbrir(browser, "/entreno/practicas.html", "#set-list button, #list-view button.set", "set-title");
    await pruebaCelular(browser);
    pruebaEmojis();
  } finally {
    await browser.close();
  }
  const total = fallos() + mias;
  console.log(total ? "\n" + total + " fallo(s)." : "\nTodo bien: la Academia se recorre sin ver la pantalla.");
  process.exit(total ? 1 : 0);
})();
