/* ===== Comprobación: «Activar voz» en todo el sitio =====
 *
 * El 🔇 del encabezado (js/voz-pagina.js, que carga js/adaptive-mode.js) hace
 * que el navegador diga en voz alta los avisos de cualquier página, para quien
 * ve poco y no usa lector de pantalla. Si se rompe no da ningún error: el botón
 * no aparece, o aparece y no habla, o habla de más. Se reemplaza speechSynthesis
 * por uno que anota lo que dice, y se mira:
 *
 *   - el botón está en la raíz y en las subcarpetas (entreno/, articulos/: la
 *     ruta de js/ se saca de dónde se cargó adaptive-mode.js), dice para quién
 *     es y arranca apagado;
 *   - NO está en las páginas con su propio botón de voz (Mates, las partidas de
 *     Juegos): serían dos para lo mismo;
 *   - en el celular el encabezado no se sale a lo ancho;
 *   - apagado no dice nada; encendido confirma y dice un aviso nuevo;
 *   - una caja nueva que ya es región viva (como «Partida asignada») se dice;
 *   - lo de un panel escondido no se dice;
 *   - lo que ya estaba al cargar no se dice;
 *   - la tecla Control sola calla lo que se está diciendo (y otra tecla no);
 *   - una cuenta atrás no se dice cada segundo;
 *   - el mismo cartel repintado no se repite;
 *   - con la voz encendida, «Decir la posición» dice la del tablero principal
 *     entera y agrupada, sin contar lo que el tablero oculta, y la respuesta a
 *     «posición» del recuadro no se corta;
 *   - una jugada escrita en un aviso («Dxf7+», «e4», «O-O») se dice en palabras;
 *   - los tableros de los ejercicios (Temas, Visualización) y el diagrama de un
 *     artículo dicen qué hay en cada casilla, y en Temas la jugada del alumno
 *     se oye sin deletrear notación;
 *   - las jugadas de un tablero se dicen (la captura, el enroque, la
 *     coronación), pero no las de una miniatura, ni con las piezas ocultas, ni
 *     cuando un aviso ya dijo la jugada.
 *
 * Cómo se corre (con el sitio en localhost:8777):
 *     node herramientas/verificar-todo.js voz-pagina
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { clienteFalso } = require("./verificar-clase-registrada.js");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://localhost:8777";
const { CHROME } = require("./verificar-clase-registrada.js");
const RAIZ = path.join(__dirname, "..");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

/* speechSynthesis de mentira: anota cada frase. */
function vozFalsa() {
  window.__dichos = [];
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  const falso = {
    speak(u) { window.__dichos.push(u.text); setTimeout(() => { if (u.onend) u.onend(); }, 5); },
    cancel() { window.__callada = (window.__callada || 0) + 1; }, getVoices() { return []; }, pending: false, speaking: false,
  };
  Object.defineProperty(window, "speechSynthesis", { value: falso, configurable: true });
}

async function abrir(browser, ruta, opciones) {
  opciones = opciones || {};
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones.contexto || {}));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  /* Con sesión (el doble de siempre): las páginas de la Academia no mandan al login. */
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso("u-ana", null, {}) }));
  await ctx.addInitScript(vozFalsa);
  await ctx.addInitScript((voz) => {
    try {
      localStorage.setItem("oscarBlindMode_v1", "0");
      if (voz !== undefined) localStorage.setItem("oscarSpeechMode_v1", voz);
      /* Una región que ya estaba escrita al cargar: no es un aviso. */
      document.addEventListener("DOMContentLoaded", () => {
        const p = document.createElement("p");
        p.id = "__ya-estaba";
        p.setAttribute("role", "status");
        p.textContent = "Esto ya estaba al cargar";
        document.body.appendChild(p);
      });
    } catch (e) {}
  }, opciones.voz);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + ruta, { waitUntil: "domcontentloaded" });
  return { page, ctx, errores };
}

const dichos = (page) => page.evaluate(() => window.__dichos.slice());
const olvidar = (page) => page.evaluate(() => { window.__dichos.length = 0; });

async function botonEn(browser, ruta) {
  const { page, ctx } = await abrir(browser, ruta);
  await page.waitForSelector("#voz-toggle", { timeout: 8000 }).catch(() => {});
  const b = await page.evaluate(() => {
    const btn = document.getElementById("voz-toggle");
    if (!/\.html$/.test(location.pathname) || /login\.html/.test(location.pathname)) return "se fue a " + location.pathname;
    return btn ? { ve: btn.checkVisibility(), nombre: btn.getAttribute("aria-label"), pulsado: btn.getAttribute("aria-pressed") } : null;
  });
  await ctx.close();
  return b;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    console.log("\n=== El botón, en todas las páginas con encabezado ===");
    for (const ruta of ["/index.html", "/entreno/tactica.html", "/articulos/la-oposicion.html"]) {
      const b = await botonEn(browser, ruta);
      igual(ruta + ": el botón se ve", b && b.ve, true);
      igual(ruta + ": dice para quién es", !!(b && /solo si no usas lector de pantalla/.test(b.nombre || "")), true);
      igual(ruta + ": arranca apagado", b && b.pulsado, "false");
    }
    for (const ruta of ["/tablero.html", "/entreno/mates.html", "/estandar.html"]) {
      const b = await botonEn(browser, ruta);
      igual(ruta + ": trae su propio botón de voz, el del encabezado no sale", b, null);
    }

    console.log("\n=== En el celular, el encabezado no se sale ===");
    for (const ancho of [360, 375]) {
      const { page, ctx } = await abrir(browser, "/index.html",
        { contexto: { viewport: { width: ancho, height: 740 }, isMobile: true, hasTouch: true } });
      await page.waitForSelector("#voz-toggle", { timeout: 8000 });
      igual(ancho + " px: nada se sale a lo ancho", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await ctx.close();
    }

    console.log("\n=== Lo que dice y lo que no ===");
    const { page, ctx, errores } = await abrir(browser, "/index.html");
    await page.waitForSelector("#voz-toggle", { timeout: 8000 });
    await page.waitForTimeout(2000);
    const escribir = (texto, atributos) => page.evaluate(([t, a]) => {
      let r = document.getElementById("__aviso");
      if (!r) { r = document.createElement("p"); r.id = "__aviso"; r.setAttribute("aria-live", "polite"); document.body.appendChild(r); }
      Object.keys(a || {}).forEach((k) => r.setAttribute(k, a[k]));
      r.textContent = t;
    }, [texto, atributos]);

    await escribir("Aviso con la voz apagada");
    await page.waitForTimeout(400);
    igual("apagada no dice nada", (await dichos(page)).join(" | ") || "nada", "nada");

    await page.click("#voz-toggle");
    await page.waitForTimeout(200);
    igual("al encenderla queda pulsada", await page.getAttribute("#voz-toggle", "aria-pressed"), "true");
    igual("y confirma en voz", (await dichos(page)).some((t) => /Voz activada/.test(t)), true);

    await olvidar(page);
    await escribir("Guardaste los cambios");
    await page.waitForTimeout(400);
    igual("un aviso nuevo se dice", (await dichos(page)).includes("Guardaste los cambios"), true);

    await olvidar(page);
    await escribir("Guardaste los cambios");
    await page.waitForTimeout(400);
    igual("el mismo cartel repintado no se repite", (await dichos(page)).length, 0);

    await olvidar(page);
    await page.evaluate(() => {
      const box = document.createElement("div");
      box.setAttribute("role", "alert");
      box.innerHTML = "<p>Partida asignada</p><p>Tu profesor te asignó una partida de Estándar.</p>";
      document.body.appendChild(box);
    });
    await page.waitForTimeout(400);
    igual("una caja nueva que ya es región viva se dice", (await dichos(page)).some((t) => /te asignó una partida/.test(t)), true);

    await olvidar(page);
    await page.evaluate(() => {
      const panel = document.createElement("div");
      panel.hidden = true;
      panel.innerHTML = '<p id="__escondida" role="status"></p>';
      document.body.appendChild(panel);
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById("__escondida").textContent = "Esto es de un panel que no se ve"; });
    await page.waitForTimeout(400);
    igual("lo de un panel escondido no se dice", (await dichos(page)).some((t) => /panel que no se ve/.test(t)), false);

    await olvidar(page);
    for (let s = 30; s > 25; s--) {
      await escribir("Quedan " + s + " segundos");
      await page.waitForTimeout(450);
    }
    igual("una cuenta atrás se dice una vez, no cada segundo", (await dichos(page)).filter((t) => /Quedan/.test(t)).length, 1);

    await olvidar(page);
    await escribir("Dxf7+ es legal, pero no es la jugada. Elegiste e4. Jugaste O-O.");
    await page.waitForTimeout(400);
    igual("la jugada escrita en un aviso se dice en palabras", (await dichos(page)).join(" | "),
      "dama captura felix 7 jaque es legal, pero no es la jugada. Elegiste eva 4. Jugaste enroque corto.");
    await page.waitForTimeout(1600);   // ese «Jugaste» calla al tablero un momento, a propósito

    console.log("\n=== Las jugadas del tablero ===");
    /* Un tablero como los del sitio: 64 casillas con data-square y un
       aria-label que dice qué hay («Casilla e2: peón blanco»). */
    await page.evaluate(() => {
      const piezas = { e1: "rey blanco", h1: "torre blanca", e2: "peón blanco", d7: "peón negro",
                       e8: "rey negro", g1: "caballo blanco", b7: "peón blanco" };
      window.__armar = (id, ancho, pos) => {
        let t = document.getElementById(id);
        if (!t) { t = document.createElement("div"); t.id = id; t.style.cssText = "display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr)"; document.body.appendChild(t); }
        t.style.width = t.style.height = ancho + "px";   // cuadrado, como un tablero de verdad
        t.innerHTML = "";
        for (let r = 8; r >= 1; r--) for (const f of "abcdefgh") {
          const b = document.createElement("button");
          b.setAttribute("data-square", f + r);
          const p = pos[f + r];
          b.setAttribute("aria-label", "Casilla " + f + r + ": " + (p === null ? "oculta" : p || "vacía"));
          b.textContent = ".";
          t.appendChild(b);
        }
      };
      window.__pos = Object.assign({}, piezas);
      window.__armar("__tablero", 320, window.__pos);
      window.__armar("__mini", 120, window.__pos);
      window.__mover = (id, cambios) => {
        Object.keys(cambios).forEach((k) => { if (cambios[k] === undefined) delete window.__pos[k]; else window.__pos[k] = cambios[k]; });
        window.__armar(id, id === "__mini" ? 120 : 320, window.__pos);
      };
    });
    await page.waitForTimeout(700);
    const jugar = async (cambios, id) => {
      await olvidar(page);
      await page.evaluate(([c, i]) => window.__mover(i || "__tablero", c), [cambios, id]);
      await page.waitForTimeout(700);
      return (await dichos(page)).join(" | ") || "nada";
    };
    igual("una jugada se dice", await jugar({ e2: undefined, e4: "peón blanco" }), "Peón blanco de eva 2 a eva 4.");
    igual("una captura dice qué se comió", await jugar({ g1: undefined, d7: "caballo blanco" }), "Caballo blanco de gustav 1 a david 7, captura peón negro.");
    igual("el enroque se dice como enroque", await jugar({ e1: undefined, h1: undefined, g1: "rey blanco", f1: "torre blanca" }), "Enroque de las blancas.");
    igual("la coronación dice en qué corona", await jugar({ b7: undefined, b8: "dama blanca" }), "Peón blanco de bella 7 a bella 8, corona dama.");
    igual("una miniatura no habla", await jugar({ g1: undefined, h1: "rey blanco" }, "__mini"), "nada");
    const todasOcultas = {};
    "abcdefgh".split("").forEach((f) => { for (let r = 1; r <= 8; r++) todasOcultas[f + r] = null; });
    igual("ocultar las piezas no es una jugada", await jugar(todasOcultas), "nada");
    igual("y con las piezas ocultas no se dice nada", await jugar({ a1: null }), "nada");
    await page.evaluate(() => { window.__pos = { e1: "rey blanco", e8: "rey negro", d2: "peón blanco" }; });
    igual("volver a mostrarlas tampoco", await jugar({}), "nada");
    await olvidar(page);
    await page.evaluate(() => {
      window.__mover("__tablero", { d2: undefined, d4: "peón blanco" });
      document.getElementById("__aviso").textContent = "Jugaste peón david 4.";
    });
    await page.waitForTimeout(800);
    igual("si un aviso ya dijo la jugada, el tablero se calla", (await dichos(page)).join(" | "), "Jugaste peón david 4.");

    console.log("\n=== La posición completa, a pedido ===");
    const posBtn = () => page.evaluate(() => { const b = document.getElementById("voz-posicion"); return b ? b.checkVisibility() : null; });
    igual("con la voz encendida y un tablero a la vista, está el ♙ «Decir la posición»", await posBtn(), true);
    await page.evaluate(() => {
      window.__pos = { e1: "rey blanco", a1: "torre blanca", h1: "torre blanca", d2: "peón blanco", e2: "peón blanco", e8: "rey negro", g8: "caballo negro" };
      // Más grande que el tablero de la portada: el botón dice el que más se ve.
      window.__armar("__tablero", 1000, window.__pos);
    });
    await page.waitForTimeout(700);
    await olvidar(page);
    await page.click("#voz-posicion");
    await page.waitForTimeout(200);
    igual("dice la posición entera del tablero, agrupada (y no la de la miniatura)", (await dichos(page)).join(" | "),
      "Blancas: rey en eva 1; torres en anna 1 y hector 1; peones en david 2 y eva 2. Negras: rey en eva 8; caballo en gustav 8.");
    await page.evaluate(() => { window.__pos = Object.assign({}, window.__pos, { a8: null }); window.__armar("__tablero", 1000, window.__pos); });
    await page.waitForTimeout(700);
    await olvidar(page);
    await page.click("#voz-posicion");
    await page.waitForTimeout(200);
    igual("lo que el tablero oculta no se cuenta: dice que hay casillas que no se ven", /Hay casillas que no se ven\.$/.test((await dichos(page)).join(" | ")), true);

    /* La respuesta a «posición» en el recuadro de comandos es larga: se dice
       entera, no cortada a los 400 caracteres. */
    await olvidar(page);
    const larga = "Blancas: " + Array.from({ length: 40 }, (_, i) => "peón en la casilla número " + i).join("; ") + ". Negras: rey en eva 8.";
    await page.evaluate((t) => {
      const cont = document.createElement("div");
      cont.innerHTML = '<div class="cc-caja" style="display:none"><p class="cc-msg" role="status"></p></div>';
      document.body.appendChild(cont);
      setTimeout(() => { cont.querySelector(".cc-msg").textContent = t; }, 50);
    }, larga);
    await page.waitForTimeout(600);
    igual("la respuesta del recuadro se dice entera", (await dichos(page)).some((t) => t.endsWith("Negras: rey en eva 8.")), true);

    await page.click("#voz-toggle");
    await page.waitForTimeout(200);
    igual("con la voz apagada, el botón no está", await posBtn(), false);
    await olvidar(page);
    await escribir("Otro aviso, ya apagada");
    await page.waitForTimeout(400);
    igual("apagada otra vez, no dice nada", (await dichos(page)).join(" | ") || "nada", "nada");
    igual("sin errores en la página", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();

    console.log("\n=== Al cargar con la voz encendida ===");
    const c = await abrir(browser, "/index.html", { voz: "1" });
    await c.page.waitForSelector("#voz-toggle", { timeout: 8000 });
    await c.page.waitForTimeout(2200);
    igual("sale encendida", await c.page.getAttribute("#voz-toggle", "aria-pressed"), "true");
    igual("y no lee lo que ya estaba", (await dichos(c.page)).some((t) => /ya estaba al cargar/.test(t)), false);
    /* La tecla Control sola calla la voz, como en NVDA y JAWS; las otras no. */
    const calladas = () => c.page.evaluate(() => window.__callada || 0);
    let antes = await calladas();
    await c.page.keyboard.press("Shift");
    igual("otra tecla no la calla", (await calladas()) - antes, 0);
    antes = await calladas();
    await c.page.keyboard.press("Control");
    igual("la tecla Control la calla", (await calladas()) - antes, 1);
    igual("y el título lo dice", /tecla Control calla/.test(await c.page.getAttribute("#voz-toggle", "title") || ""), true);
    await c.ctx.close();

    console.log("\n=== Los tableros de los ejercicios dicen qué hay en cada casilla ===");
    /* Lo que lee el lector de pantalla y de donde «Activar voz» saca la jugada:
       una casilla muda, o «e4» a secas, deja al tablero sin nada que decir. */
    const casillasDe = (p, sel) => p.evaluate((s) => {
      const cs = [...document.querySelectorAll(s + " [data-square]")];
      const et = cs.map((c) => c.getAttribute("aria-label") || "");
      return { casillas: cs.length, mudas: et.filter((t) => !t.trim()).length,
               habladas: et.filter((t) => /^[a-z]+ [1-8], /.test(t)).length, vacia: et.some((t) => /, vacía$/.test(t)) };
    }, sel);
    const bienRotulado = { casillas: 64, mudas: 0, habladas: 64, vacia: true };

    {
      const t = await abrir(browser, "/entreno/temas.html", { voz: "1" });
      await t.page.waitForSelector("#voz-toggle", { timeout: 8000 });
      await t.page.click(".theme-card, [data-theme]", { timeout: 8000 });
      await t.page.waitForFunction(() => typeof game !== "undefined" && game && document.querySelectorAll("#board [data-square]").length === 64, null, { timeout: 15000 });
      await t.page.waitForTimeout(2000);
      igual("Ejercicios por tema: cada casilla dice qué hay", await casillasDe(t.page, "#board"), bienRotulado);
      const mv = await t.page.evaluate(() => {
        const exp = currentPuzzle().solution[solutionStep];
        const g = new Chess(game.fen());
        return g.move(exp, { sloppy: true }) || g.move({ from: exp.slice(0, 2), to: exp.slice(2, 4), promotion: exp[4] });
      });
      await olvidar(t.page);
      await t.page.click('#board [data-square="' + mv.from + '"]');
      await t.page.click('#board [data-square="' + mv.to + '"]');
      await t.page.waitForTimeout(2500);
      const d = await dichos(t.page);
      igual("Ejercicios por tema: la jugada del alumno se dice",
        d.some((x) => /^(Rey|Dama|Torre|Alfil|Caballo|Peón) (blanc|negr)[oa] de [a-z]+ [1-8] a [a-z]+ [1-8]/.test(x)), true);
      igual("y nada se deletrea en notación («Dxf7+»)", d.filter((x) => /(^|[^A-Za-z])[RDTAC]?x?[a-h][1-8]/.test(x)).join(" | ") || "nada", "nada");
      await olvidar(t.page);
      await t.page.click("#voz-posicion");
      await t.page.waitForTimeout(200);
      await t.page.setViewportSize({ width: 360, height: 740 });
      await t.page.waitForTimeout(300);
      igual("con el ♙ en el encabezado, a 360 px nada se sale a lo ancho",
        await t.page.evaluate(() => document.getElementById("voz-posicion").checkVisibility() && document.documentElement.scrollWidth <= innerWidth), true);
      igual("Ejercicios por tema: «Decir la posición» la dice entera", /^Blancas: .*\. Negras: .*\.$/.test((await dichos(t.page)).join(" | ")), true);
      igual("sin errores en la página", t.errores.join(" | ") || "ninguno", "ninguno");
      await t.ctx.close();
    }
    {
      const v = await abrir(browser, "/entreno/visualizacion.html");
      await v.page.waitForFunction(() => typeof NIVELES !== "undefined" && typeof openLevel === "function", null, { timeout: 15000 });
      await v.page.evaluate(() => openLevel(NIVELES[0].id));
      await v.page.waitForFunction(() => document.querySelectorAll("#board [data-square]").length === 64, null, { timeout: 15000 });
      igual("Visualización: cada casilla dice qué hay («eva 4, vacía»)", await casillasDe(v.page, "#board"), bienRotulado);
      await v.ctx.close();
    }
    {
      const a = await abrir(browser, "/articulos/la-oposicion.html");
      await a.page.waitForSelector(".example-board [data-square]", { timeout: 8000 });
      igual("El diagrama de un artículo: cada casilla dice qué hay", await casillasDe(a.page, ".example-board"), bienRotulado);
      /* Y que eso LLEGUE al lector: dentro de un role="img" los hijos no
         existen para él, por bien rotulados que estén. Se recorre como el de
         Estudio: una parada de Tab y las flechas adentro. */
      await a.page.waitForFunction(() => document.querySelector(".example-board [data-square][tabindex='0']"), null, { timeout: 8000 });
      igual("El diagrama de un artículo: ni el contenedor ni sus casillas son una imagen", await a.page.evaluate(() => {
        const b = document.querySelector(".example-board");
        return b.getAttribute("role") !== "img" && !b.querySelector("[data-square][role=img]");
      }), true);
      igual("El diagrama de un artículo: una sola parada de Tab", await a.page.evaluate(() =>
        [...document.querySelectorAll(".example-board")].map((b) => [...b.querySelectorAll("[data-square]")].filter((c) => c.tabIndex === 0).length).every((n) => n === 1)), true);
      await a.page.focus(".example-board [data-square][tabindex='0']");
      await a.page.keyboard.press("ArrowRight");
      igual("El diagrama de un artículo: → pasa a la casilla de al lado", await a.page.evaluate(() => document.activeElement.dataset.square), "b8");
      await a.ctx.close();
    }
    {
      /* El Modo Adaptado se lee del <html> (lo pone js/adaptive-mode.js), no
         del localStorage, y el tablero ya no se esconde: la posición escrita
         se SUMA debajo. */
      const a = await abrir(browser, "/articulos/la-oposicion.html");
      await a.page.waitForSelector(".example-board [data-square]", { timeout: 8000 });
      await a.page.evaluate(() => { document.documentElement.classList.add("adaptive-mode"); document.dispatchEvent(new CustomEvent("adaptivemode:change", { detail: { activo: true } })); });
      igual("Artículo en Modo Adaptado: el tablero se queda y la posición escrita aparece", await a.page.evaluate(() => {
        const c = document.querySelector(".example-card");
        return [c.querySelector(".example-board").checkVisibility(), c.querySelector(".example-readout").checkVisibility()];
      }), [true, true]);
      await a.ctx.close();
    }

    console.log("\n=== Juegos ===");
    const html = fs.readFileSync(path.join(RAIZ, "juegos.html"), "utf8");
    igual("«¡Partida creada!» y sus errores son región viva", /id="create-room-msg" role="status"/.test(html), true);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: la voz se enciende en todo el sitio y no habla de más.");
  process.exit(fallos ? 1 : 0);
})();
