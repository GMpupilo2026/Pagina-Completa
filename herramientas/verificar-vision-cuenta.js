/* La visión de la cuenta: lo que marca administración (vision_personas) llega
   solo a todas las páginas de esa persona. Ver «La visión de la persona la
   marca administración» en docs/decisiones/accesibilidad.md.

   Lo que se rompe acá no da ningún error: la marca se guarda, la página se ve
   perfecta, y a la alumna ciega le sigue saliendo el panel de siempre, con la
   mitad de las tarjetas llevándola a tableros que no puede usar. Por eso se
   mide en un navegador de verdad, con el doble del panel (verificar-panel.js):

     1. Ciega: el <html> lleva modo-ciego y el Modo Adaptado; el panel es el
        ADAPTADO (sus grupos, en su orden) y no enlaza nada de NO_ADAPTADAS; los
        «Accesos rápidos» están primeros y se ven; los atajos contestan (la
        ayuda por la región viva, el foco donde dicen); un enlace a una página
        no adaptada que llega después se esconde; queda guardada en el aparato.
     2. Sin marca: el panel de siempre, sin modo-ciego — aunque el aparato
        tuviera guardado «ciego» de antes: manda la base.
     3. Baja visión: la voz se enciende sola una vez; si después la apaga, se
        respeta.
     4. Juegos: las modalidades no adaptadas no se ofrecen y las que sí, sí.
     5. Una página no adaptada dice que no lo está y ofrece volver al panel.
     6. admin.html: el selector de cada cuenta llama a marcar_vision().

   Uso: con el sitio en localhost:8777,  node herramientas/verificar-vision-cuenta.js */
"use strict";

const { chromium } = require("./lib/playwright-con-sesion");
const { clienteFalso, panel, ALUMNA, PROFE, ADMIN } = require("./verificar-panel");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(n, v) { if (v) console.log("  ✓ " + n); else { console.log("  ✗ " + n); fallos += 1; } }

const CIEGA = { vision_personas: [{ persona_id: "u-ana", vision: "ciego" }] };
const BAJA = { vision_personas: [{ persona_id: "u-ana", vision: "baja_vision" }] };

const GRUPOS = () => Array.from(document.querySelectorAll("#tile-grid section h2")).map((h) => h.textContent);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function pruebaCiega(browser) {
  console.log("\n=== Una alumna marcada como ciega ===");
  const { page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", null, CIEGA);
  await page.waitForFunction(() => window.VisionCuenta && document.getElementById("accesos-rapidos"), { timeout: 10000 }).catch(() => {});

  igual("el <html> lleva modo-ciego y el Modo Adaptado",
    await page.evaluate(() => ["modo-ciego", "adaptive-mode"].map((c) => document.documentElement.classList.contains(c))), [true, true]);
  igual("el panel es el adaptado, grupo por grupo", await page.evaluate(GRUPOS),
    ["Clase en vivo", "Lo que te pone tu profesor", "Aprender y estudiar", "Entrenar", "Jugar", "Tu cuenta"]);
  const enlaces = await page.evaluate(() => Array.from(document.querySelectorAll("#tile-grid a[href]")).map((a) => a.getAttribute("href")));
  const noAdaptadas = await page.evaluate(() => VisionCuenta.NO_ADAPTADAS);
  igual("ninguna tarjeta lleva a una página no adaptada",
    enlaces.filter((h) => noAdaptadas.includes(h.split("?")[0].split("/").pop())), []);
  cierto("trae los juegos hechos para jugar sin ver y el entrenamiento con tablero",
    ["sonar.html", "batalla-naval.html", "entreno/mates.html", "entreno/estudio.html", "tareas.html", "ciegos.html"].every((h) => enlaces.includes(h)));
  cierto("y ninguna de las puertas que no están adaptadas (Archivos, las fichas por categoría repetidas)",
    !enlaces.includes("partidas.html") && !enlaces.some((h) => h.includes("?cat=")));
  igual("el grupo de entrenar se alcanza con #entrenar", await page.evaluate(() => !!document.querySelector("section#entrenar h2")), true);
  /* Se lee cuando el panel ya terminó de cargar. La nota va en su propio
     párrafo (#panel-adaptado-nota): el subtítulo lo reescribe la racha. */
  await page.waitForFunction(() => !/Cargando/.test((document.getElementById("tactics-record-text") || {}).textContent || ""), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  cierto("debajo del saludo dice que es el panel adaptado y cómo oír los atajos",
    /adaptado.*Alt \+ Mayúscula \+ H/.test(await page.evaluate(() => { const n = document.getElementById("panel-adaptado-nota"); return n && n.checkVisibility() ? n.textContent : ""; })));

  const accesos = await page.evaluate(() => {
    const nav = document.getElementById("accesos-rapidos");
    if (!nav) return null;
    const salto = document.querySelector('a[href="#main-content"]');
    return {
      seVe: nav.checkVisibility(),
      nombre: nav.getAttribute("aria-label"),
      despuesDelSalto: salto ? salto.nextElementSibling === nav : null,
      enlaces: Array.from(nav.querySelectorAll(":scope > ul > li > a")).map((a) => a.textContent + " → " + a.getAttribute("href")),
      atajos: nav.querySelectorAll("details li").length,
    };
  });
  igual("los accesos rápidos: se ven, primeros después de «Saltar al contenido», con sus enlaces",
    accesos, { seVe: true, nombre: "Accesos rápidos", despuesDelSalto: true,
      enlaces: ["Tu panel → /clases.html", "Clase en vivo → /sesion.html", "Tareas → /tareas.html", "Entrenar → /clases.html#entrenar"].map((x) => x.replace("→ /", "→ " + BASE + "/")),
      atajos: 11 });

  /* Lo que oye quien usa lector de pantalla es lo que sale por la región viva. */
  await page.keyboard.press("Alt+Shift+KeyH");
  await esperar(250);
  cierto("Alt + Mayúscula + H dice los atajos por una región viva",
    await page.evaluate(() => Array.from(document.querySelectorAll('[role="status"]')).some((r) => /^Atajos: Alt más Mayúscula más P/.test(r.textContent))));
  await page.keyboard.press("Alt+Shift+KeyD");
  await esperar(250);
  cierto("Alt + Mayúscula + D dice dónde está: la página y sus secciones",
    await page.evaluate(() => Array.from(document.querySelectorAll('[role="status"]')).some((r) => /^Estás en ¡Hola, Ana!\. Tiene \d+ secciones: .*Clase en vivo; Lo que te pone tu profesor/.test(r.textContent))));
  // Desde el saludo (el panel le pone el foco al cargar), la primera sección y la siguiente.
  await page.evaluate(() => document.getElementById("panel-titulo").focus());
  await page.keyboard.press("Alt+Shift+KeyS");
  const primera = await page.evaluate(() => document.activeElement && document.activeElement.tagName + ":" + document.activeElement.textContent.trim());
  await page.keyboard.press("Alt+Shift+KeyS");
  const segunda = await page.evaluate(() => document.activeElement && document.activeElement.tagName + ":" + document.activeElement.textContent.trim());
  cierto("Alt + Mayúscula + S salta de título en título (" + primera + " → " + segunda + ")",
    /^H2:/.test(primera) && /^H2:/.test(segunda) && primera !== segunda);

  /* El Modo Adaptado es fijo con la cuenta ciega: sin él los tableros no traen
     su recuadro, y quien no ve no tiene cómo notar que se apagó. */
  await page.evaluate(() => { const b = document.getElementById("adaptive-toggle"); if (b) b.click(); else AdaptiveMode.set(false); });
  await esperar(200);
  igual("apretar el interruptor no apaga el Modo Adaptado (y lo dice)", await page.evaluate(() => [
    document.documentElement.classList.contains("adaptive-mode"), localStorage.getItem("oscarBlindMode_v1"),
    Array.from(document.querySelectorAll('[role="status"]')).some((r) => /modo adaptado fijo/.test(r.textContent))]), [true, "1", true]);

  await page.keyboard.press("Alt+Shift+KeyM");
  igual("Alt + Mayúscula + M lleva el foco al contenido", await page.evaluate(() => document.activeElement && document.activeElement.id), "main-content");
  await page.keyboard.press("Alt+Shift+KeyB");
  await esperar(250);
  cierto("Alt + Mayúscula + B, sin tablero a la vista, dice que no hay posición en vez de callarse",
    await page.evaluate(() => Array.from(document.querySelectorAll('[role="status"]')).some((r) => /no hay una posición/.test(r.textContent))));

  /* Lo que la página pinta después también pasa por el filtro. */
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = "crazyhouse.html"; a.id = "tarde"; a.textContent = "Crazyhouse";
    document.getElementById("tile-grid").appendChild(a);
    const b = document.createElement("a");
    b.href = "estandar.html"; b.id = "tarde-bien"; b.textContent = "Estándar";
    document.getElementById("tile-grid").appendChild(b);
  });
  await esperar(150);
  igual("un enlace a una página no adaptada que llega tarde se esconde; uno adaptado no",
    await page.evaluate(() => [document.getElementById("tarde").checkVisibility(), document.getElementById("tarde-bien").checkVisibility()]), [false, true]);
  igual("la marca queda guardada en el aparato",
    await page.evaluate(() => JSON.parse(localStorage.getItem("ai_vision_v1"))), { persona: "u-ana", vision: "ciego" });
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaSinMarca(browser) {
  console.log("\n=== Sin marca, aunque el aparato dijera «ciego» ===");
  const { page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", null,
    { local: { ai_vision_v1: JSON.stringify({ persona: "u-ana", vision: "ciego" }) } });
  await page.waitForFunction(() => window.VisionCuenta && !document.documentElement.classList.contains("modo-ciego"), { timeout: 10000 }).catch(() => {});
  igual("la base manda: sin modo-ciego ni accesos rápidos",
    await page.evaluate(() => [document.documentElement.classList.contains("modo-ciego"), !!document.getElementById("accesos-rapidos")]), [false, false]);
  cierto("el panel es el de siempre", (await page.evaluate(GRUPOS)).includes("Entrenamiento básico"));
  igual("y el aparato se olvida de la marca vieja", await page.evaluate(() => localStorage.getItem("ai_vision_v1")), null);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaBajaVision(browser) {
  console.log("\n=== Una alumna con baja visión ===");
  let { page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", null, BAJA);
  await page.waitForFunction(() => localStorage.getItem("ai_vision_aplicada_v1"), { timeout: 10000 }).catch(() => {});
  await esperar(300);
  igual("la voz queda encendida", await page.evaluate(() => localStorage.getItem("oscarSpeechMode_v1")), "1");
  const boton = await page.evaluate(() => { const b = document.getElementById("voz-toggle"); return b ? b.getAttribute("aria-pressed") : "sin botón"; });
  cierto("y el botón de la voz lo dice (" + boton + ")", boton === "true" || boton === "sin botón");
  igual("el panel es el de siempre, sin modo-ciego",
    await page.evaluate(() => [document.documentElement.classList.contains("modo-ciego"), document.querySelectorAll("#tile-grid section").length > 6]), [false, true]);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  ({ page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", null,
    Object.assign({ local: { ai_vision_aplicada_v1: "u-ana:baja_vision", oscarSpeechMode_v1: "0" } }, BAJA)));
  await page.waitForFunction(() => window.VisionCuenta, { timeout: 10000 }).catch(() => {});
  await esperar(500);
  igual("si ya se aplicó y ella la apagó, se queda apagada", await page.evaluate(() => localStorage.getItem("oscarSpeechMode_v1")), "0");
  await ctx.close();
}

/* Otra página de la Academia con el mismo doble. */
async function abrir(browser, ruta, local) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((l) => { Object.entries(l).forEach(([k, v]) => localStorage.setItem(k, v)); }, local || {});
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/*.supabase.co/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso([ALUMNA, PROFE, ADMIN], local.__quien || "u-ana", [], CIEGA) }));
  const page = await ctx.newPage();
  await page.goto(BASE + ruta, { waitUntil: "load" });
  await page.waitForFunction(() => window.VisionCuenta, { timeout: 10000 }).catch(() => {});
  await esperar(600);
  return { page, ctx };
}

async function pruebaJuegos(browser) {
  console.log("\n=== Juegos, para la alumna ciega ===");
  const { page, ctx } = await abrir(browser, "/juegos.html", {});
  const vistas = await page.evaluate(() => {
    const ve = (h) => { const a = document.querySelector('main a[href="' + h + '"]'); return a ? a.checkVisibility() : "no está"; };
    return { bot: ve("bot.html"), confites: ve("confites.html"), concentracion: ve("concentracion.html"), sonar: ve("sonar.html"), batalla: ve("batalla-naval.html") };
  });
  igual("lo no adaptado no se ofrece y lo adaptado sí", vistas,
    { bot: false, confites: false, concentracion: false, sonar: true, batalla: true });
  await ctx.close();
}

async function pruebaPaginaNoAdaptada(browser) {
  console.log("\n=== Una página no adaptada ===");
  const { page, ctx } = await abrir(browser, "/crazyhouse.html", { ai_vision_v1: JSON.stringify({ persona: "u-ana", vision: "ciego" }) });
  const r = await page.evaluate(() => {
    const caja = document.getElementById("vc-no-adaptada");
    return caja && {
      seVe: caja.checkVisibility(),
      titulo: caja.querySelector("h1").textContent,
      foco: document.activeElement === caja.querySelector("h1"),
      volver: caja.querySelector("a").getAttribute("href").replace(location.origin, ""),
    };
  });
  igual("lo dice, con el foco en el aviso, y ofrece volver al panel", r,
    { seVe: true, titulo: "Esta página todavía no está adaptada", foco: true, volver: "/clases.html" });
  await ctx.close();
}

/* Quien no ve casi no usa el tablero: hace todo desde el recuadro. Se mide en
   Mates, con la cuenta ciega: el foco empieza en el recuadro, el tablero queda
   a la vista pero fuera del lector y del tabulador (es para el profe que
   ayuda), y los botones de la página se aprietan escribiendo su nombre o lo
   que hacen, sin que el foco se vaya del recuadro. */
async function pruebaTodoDesdeElRecuadro(browser) {
  console.log("\n=== Todo desde el recuadro (Mates, cuenta ciega) ===");
  const { page, ctx } = await abrir(browser, "/entreno/mates.html", { ai_vision_v1: JSON.stringify({ persona: "u-ana", vision: "ciego" }) });
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("cc-input"), null, { timeout: 8000 }).catch(() => {});
  igual("el foco empieza en el recuadro", await page.evaluate(() => document.activeElement && document.activeElement.className), "cc-input");
  igual("el tablero se ve, pero no está en el camino del lector ni del Tab",
    await page.evaluate(() => { const t = document.getElementById("board"); return [t.checkVisibility(), t.getAttribute("aria-hidden"), t.querySelectorAll("[tabindex='0']").length]; }),
    [true, "true", 0]);
  const decir = async (t) => {
    await page.fill(".cc-caja .cc-input", t);
    await page.press(".cc-caja .cc-input", "Enter");
    await esperar(250);
    return page.evaluate(() => document.querySelector(".cc-msg").textContent);
  };
  const acciones = await decir("acciones");
  cierto("«acciones» dice los botones del ejercicio, sin los interruptores del modo (" + acciones.slice(0, 90) + "…)",
    /Pista/.test(acciones) && /Reiniciar/.test(acciones) && /Saltar/.test(acciones) && !/Modo normal|Adaptado/.test(acciones));
  await page.evaluate(() => { window.__salto = 0; document.getElementById("skip-btn").addEventListener("click", () => { window.__salto++; }); });
  const salto = await decir("siguiente");
  igual("«siguiente» aprieta el botón que pasa al siguiente (aquí se llama «Saltar →»)", [await page.evaluate(() => window.__salto), salto], [1, "Listo: Saltar."]);
  await esperar(400);
  igual("y el foco sigue en el recuadro", await page.evaluate(() => document.activeElement && document.activeElement.className), "cc-input");
  cierto("«mis jugadas» dice todas las que se pueden hacer", /^Tienes \d+ jugadas?\./.test(await decir("mis jugadas")) || /una sola jugada/.test(await decir("mis jugadas")));
  cierto("«leer» lee el ejercicio", (await decir("leer")).length > 20);
  const casilla = await decir("ir a e4");
  cierto("«ir a e4» contesta qué hay ahí sin mover el foco (" + casilla + ")", /eva 4|e4/.test(casilla) && await page.evaluate(() => document.activeElement.className === "cc-input"));
  cierto("«Nf3» o una jugada sigue llegando a la página (no la come la capa de acciones)",
    !/^Listo:/.test(await decir("Nf3")));
  /* Lo que encontró la recorrida como alumna ciega: «posición» apretaba ⏮
     («Posición inicial») porque el nombre empezaba igual; «solución» no
     encontraba «Ver solución»; un recuadro apretaba el botón de OTRO
     ejercicio de la misma sección; y lo mal escrito se quedaba y lo siguiente
     se pegaba detrás. */
  await page.evaluate(() => {
    const cerca = document.querySelector(".cc-caja").parentNode;
    const b1 = document.createElement("button"); b1.type = "button"; b1.id = "p-ini"; b1.setAttribute("aria-label", "Posición inicial"); b1.textContent = "⏮";
    b1.addEventListener("click", () => { window.__inicial = 1; });
    const b2 = document.createElement("button"); b2.type = "button"; b2.id = "p-sol"; b2.textContent = "💡 Ver solución";
    b2.addEventListener("click", () => { window.__sol = 1; });
    cerca.append(b1, b2);
    // Otro ejercicio en la misma página, con su recuadro y su propio «Ver solución».
    const otro = document.createElement("div");
    otro.innerHTML = '<form><input class="cc-input" aria-label="otro recuadro"></form><button type="button" id="otra-sol">Ver solución</button>';
    otro.querySelector("#otra-sol").addEventListener("click", () => { window.__otraSol = 1; });
    // ANTES en el documento: con la zona mal tomada, sería el primero en encontrarse.
    document.querySelector("main").prepend(otro);
  });
  const posi = await decir("posición");
  igual("«posición» dice la posición y NO aprieta «Posición inicial»", [await page.evaluate(() => window.__inicial || 0), /Blancas/.test(posi)], [0, true]);
  await decir("solución");
  igual("«solución» aprieta «Ver solución» de SU ejercicio, no el del otro recuadro",
    await page.evaluate(() => [window.__sol || 0, window.__otraSol || 0]), [1, 0]);
  await page.fill(".cc-caja .cc-input", "zzqq");
  await page.press(".cc-caja .cc-input", "Enter");
  await esperar(250);
  igual("lo que no se entendió queda seleccionado: lo siguiente lo reemplaza",
    await page.evaluate(() => { const c = document.querySelector(".cc-caja .cc-input"); return c.value && c.selectionStart === 0 && c.selectionEnd === c.value.length; }), true);

  await page.keyboard.press("Alt+Shift+KeyB");
  await esperar(250);
  cierto("Alt + Mayúscula + B dice la posición en el recuadro", /Blancas|blancas/.test(await page.evaluate(() => document.querySelector(".cc-msg").textContent)));
  await ctx.close();
}

async function pruebaAdmin(browser) {
  console.log("\n=== admin.html: la columna Visión ===");
  const { page, ctx } = await abrir(browser, "/admin.html", { __quien: "u-admin" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => {
    window.__rpc = [];
    const rpc = sb.rpc;
    sb.rpc = (n, a, o) => { window.__rpc.push({ n, a }); return n === "marcar_vision" ? Promise.resolve({ data: a.p_vision, error: null }) : rpc(n, a, o); };
  });
  const hay = await page.evaluate(() => {
    const b = document.querySelector('[data-seccion="cuentas"], [href="#cuentas"]');
    if (b) b.click();
    const f = document.querySelector("#grupos-fichas article button");
    if (f) f.click();
    return true;
  });
  await page.waitForSelector('select[data-vision="u-ana"]', { timeout: 10000 }).catch(() => {});
  const sel = await page.$('select[data-vision="u-ana"]');
  if (!sel) { cierto("hay un selector de visión en la fila de la alumna", false); await ctx.close(); return; }
  igual("las tres opciones, dichas por lo que hacen", await page.evaluate(() =>
    Array.from(document.querySelector('select[data-vision="u-ana"]').options).map((o) => o.value + ":" + o.textContent)),
    [":Ve bien", "baja_vision:Baja visión: voz encendida", "ciego:Ciega: todo adaptado"]);
  igual("y el selector dice lo que ya está en la base", await page.evaluate(() => document.querySelector('select[data-vision="u-ana"]').value), "ciego");
  await sel.selectOption("baja_vision");
  await esperar(200);
  igual("cambiarlo llama a marcar_vision() con la persona y la visión",
    await page.evaluate(() => window.__rpc.filter((x) => x.n === "marcar_vision")), [{ n: "marcar_vision", a: { p_persona: "u-ana", p_vision: "baja_vision" } }]);
  await ctx.close();
  return hay;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaCiega(browser);
    await pruebaSinMarca(browser);
    await pruebaBajaVision(browser);
    await pruebaJuegos(browser);
    await pruebaPaginaNoAdaptada(browser);
    await pruebaTodoDesdeElRecuadro(browser);
    await pruebaAdmin(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nLa visión de la cuenta llega a todas sus páginas.");
  process.exit(fallos ? 1 : 0);
})();
