/* Que la clase en vivo se pueda RECORRER: que un entrenador nuevo sepa dónde
   buscar cada cosa sin que nadie se lo explique.
 *
 * `sesion.html` es la pantalla más cargada del sitio: catorce controles del
 * profesor entre la barra de arriba y las pestañas. Estaban puestos sin ningún
 * criterio —una rejilla de ocho botones iguales, y una pestaña «Controles» cuyo
 * contenido era un párrafo explicando dónde estaban los otros ocho—, y eso no
 * da ningún error: la pantalla se ve bien, funciona, y quien la abre por
 * primera vez no sabe por dónde empezar ni cuál puede apretar con la clase
 * mirando.
 *
 * Cuatro cosas, y ninguna se puede comprobar leyendo el HTML:
 *
 *   1. LOS BOTONES VAN EN SUS DOS GRUPOS, CON SU RÓTULO. El rótulo no dice qué
 *      hace la herramienta sino QUIÉN LA VE, que es la línea de toda la clase
 *      en vivo. Un botón suelto fuera de los dos grupos es el principio de la
 *      rejilla sin criterio de antes, así que acá se cuenta: ocho, cuatro y
 *      cuatro, cada uno bajo el suyo.
 *
 *   2. LAS PESTAÑAS VAN EN EL ORDEN DE LA CLASE, y sobre todo: la que se abre
 *      sola la primera vez es «Mi plan». Es la única pestaña que contesta "¿qué
 *      voy a dar?", y estaba quinta.
 *
 *   3. ABRIR UNA HERRAMIENTA PROPIA NO TOCA EL TABLERO DE LA CLASE. Es lo que
 *      promete el rótulo «solo lo ves tú». Si alguna abriera escribiendo en
 *      `game_state`, los alumnos verían el movimiento sin que nada fallara.
 *
 *   4. AL ALUMNO NO SE LE PINTA NADA DE ESTO. Ni la barra ni las pestañas.
 *
 * Reusa el Supabase de mentira de verificar-clase-registrada.js: dos copias del
 * mismo doble se irían separando a la primera corrección.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       npm install playwright chess.js@0.10.3
 *       node herramientas/verificar-sesion-orden.js                          */
const { chromium } = require("playwright");
const { clienteFalso, abrir, igual, CHROME } = require("./verificar-clase-registrada.js");

const CLASE_ABIERTA = { id: "s-1", title: null, created_by: "u-profe",
                        ended_at: null, started_at: "2026-09-20T15:00:00Z", notes: null };

/* Los dos grupos, con el orden en que tienen que salir. El orden no es estético:
   dentro de "tu material" van primero los que traen algo ya preparado (un curso,
   un archivo, un PDF) y de último el de armar una posición a mano, que es el
   trabajo. */
const GRUPOS = [
  { rotulo: "Tu material — solo lo ves tú",
    botones: ["toggle-lesson-btn", "toggle-archivos-btn", "toggle-pdf-btn", "toggle-free-mode-btn"] },
  { rotulo: "El tablero — lo ve toda la clase",
    botones: ["reset-board-btn", "clear-marks-btn", "toggle-hide-btn", "save-game-btn"] },
];

// El orden de la clase: qué voy a dar, qué le pongo delante, qué le pido, a
// quién se lo doy, y al final lo que no se hace dando clase.
const PESTANAS = ["plan", "tactica", "preguntar", "practicar", "alumnos", "controles"];

async function pruebaProfesor(browser) {
  console.log("\n=== La pantalla del profesor se puede recorrer ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE_ABIERTA);
  await page.waitForSelector("#teacher-toolbar:not(.hidden)", { timeout: 10000 });

  console.log("-- Los botones, en sus dos grupos");
  /* Se leen del DOM ya renderizado: cada grupo es el bloque que cuelga del
     rótulo. Un botón suelto, fuera de los dos, no aparecería en ninguno — que
     es exactamente lo que hay que impedir. */
  const grupos = await page.evaluate(() =>
    [...document.querySelectorAll("#teacher-toolbar > div")].map((bloque) => ({
      rotulo: (bloque.querySelector("p") || {}).textContent || "(sin rótulo)",
      botones: [...bloque.querySelectorAll("button")].map((b) => b.id),
    })));

  igual("hay dos grupos y no una rejilla suelta", grupos.length, 2);
  GRUPOS.forEach((esperado, i) => {
    igual("grupo " + (i + 1) + ": su rótulo dice quién lo ve",
      (grupos[i] || {}).rotulo, esperado.rotulo);
    igual("grupo " + (i + 1) + ": sus cuatro botones y en su orden",
      ((grupos[i] || {}).botones || []).join(", "), esperado.botones.join(", "));
  });
  igual("y no quedó ningún botón fuera de los dos grupos",
    await page.evaluate(() => document.querySelectorAll("#teacher-toolbar button").length), 8);

  console.log("-- Las pestañas, en el orden de la clase");
  igual("el orden es el de la clase", await page.evaluate(() =>
    [...document.querySelectorAll(".teacher-tab-btn")].map((b) => b.dataset.tab).join(",")),
    PESTANAS.join(","));
  /* La primera vez se abre "Mi plan": es lo único que contesta "¿qué voy a
     dar?", y estaba quinta detrás de una pestaña de ayuda. */
  igual("la que abre sola es Mi plan", await page.evaluate(() => {
    const b = [...document.querySelectorAll(".teacher-tab-btn")].find((x) => x.getAttribute("aria-selected") === "true");
    return b ? b.dataset.tab : "(ninguna)";
  }), "plan");
  igual("y se ve su panel, no otro", await page.evaluate(() =>
    [...document.querySelectorAll("[data-tab-panel]")]
      .filter((p) => getComputedStyle(p).display !== "none")
      .map((p) => p.dataset.tabPanel).join(",")), "plan");

  // Cada pestaña abre SU panel: un aria-controls que apunte al de al lado deja a
  // quien usa lector de pantalla siguiendo un enlace que no lleva ahí.
  igual("cada pestaña apunta a su propio panel", await page.evaluate(() =>
    [...document.querySelectorAll(".teacher-tab-btn")].every((b) => {
      const panel = document.getElementById(b.getAttribute("aria-controls"));
      return panel && panel.dataset.tabPanel === b.dataset.tab;
    })), "true");

  console.log("-- Abrir lo tuyo no toca el tablero de la clase");
  /* Es lo que promete el rótulo. Los cuatro abren un panel del profesor; si
     alguno escribiera en game_state al abrirse, la clase lo vería. */
  for (const id of GRUPOS[0].botones) {
    await page.evaluate(() => { window.__updates.length = 0; window.__inserts.length = 0; });
    // El clic va por JS y no con page.click(): estos paneles son flotantes y se
    // abren ENCIMA del propio botón, así que el segundo clic lo intercepta el
    // panel. Lo que se mira acá es qué manda la página, no si el ratón llega.
    await page.evaluate((i) => document.getElementById(i).click(), id);
    await page.waitForTimeout(250);
    igual(id + " no escribe en el tablero", await page.evaluate(() =>
      window.__updates.filter((u) => u.tabla === "game_state").length), 0);
    await page.evaluate((i) => document.getElementById(i).click(), id);  // cerrar
    await page.waitForTimeout(150);
  }

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== A la alumna no se le pinta nada de esto ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE_ABIERTA);
  await page.waitForTimeout(1200);

  const oculto = (id) => page.evaluate((i) => {
    const el = document.getElementById(i);
    return !el || getComputedStyle(el).display === "none" ? "oculto" : "a la vista";
  }, id);

  igual("ni la barra de herramientas", await oculto("teacher-toolbar"), "oculto");
  igual("ni las pestañas", await oculto("teacher-tabs-wrap"), "oculto");
  igual("ni el motor de análisis", await oculto("engine-panel"), "oculto");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* El modo sencillo: quien lleva menos de tres clases arranca viendo lo básico
   (el tablero, su plan, sus alumnos e invitar), y lo demás queda a un clic.
   Se mide con checkVisibility(), no con el atributo. */
async function pruebaModoSencillo(browser) {
  console.log("\n=== El modo sencillo de la clase en vivo ===");
  const seVe = (page, sel) => page.evaluate((x) => {
    const el = document.querySelector(x);
    return el ? el.checkVisibility() : null;
  }, sel);
  const pestanas = (page) => page.evaluate(() =>
    [...document.querySelectorAll(".teacher-tab-btn")].filter((b) => b.checkVisibility()).map((b) => b.dataset.tab));

  // 1. Una profesora con su primera clase: no hay preferencia guardada, decide la cuenta.
  let r = await abrir(browser, "u-profe", CLASE_ABIERTA, null, { modoSencillo: null });
  await r.page.waitForSelector("#teacher-toolbar:not(.hidden)", { timeout: 10000 });
  await r.page.waitForFunction(() => document.getElementById("modo-sencillo-btn").textContent !== "");
  igual("con una sola clase, arranca en modo sencillo: solo Mi plan, Alumnos e Invitar",
    (await pestanas(r.page)).join(","), "plan,alumnos,controles");
  igual("«Tu material» queda guardado", await seVe(r.page, "#toolbar-material"), false);
  igual("pero el tablero de la clase sigue a mano", await seVe(r.page, "#reset-board-btn"), true);
  igual("y el motor también", await seVe(r.page, "#engine-panel"), true);
  igual("se dice qué está guardado y dónde", /Táctica, Preguntar, Practicar y tu material/.test(await r.page.textContent("#modo-sencillo-nota")), true);
  igual("y el botón dice lo que hace", await r.page.textContent("#modo-sencillo-btn"), "🧰 Ver todas las herramientas");

  await r.page.click("#modo-sencillo-btn");
  igual("«Ver todas las herramientas» devuelve las seis pestañas",
    (await pestanas(r.page)).join(","), "plan,tactica,preguntar,practicar,alumnos,controles");
  igual("y «Tu material»", await seVe(r.page, "#toolbar-material"), true);
  igual("la nota se va", await r.page.textContent("#modo-sencillo-nota"), "");
  igual("y queda anotado en el aparato", await r.page.evaluate(() => localStorage.getItem("sesion_modo_sencillo_v1")), "0");

  await r.page.click("#teacher-tab-tactica");
  await r.page.click("#modo-sencillo-btn");
  igual("volver al modo sencillo con Táctica abierta la cierra y abre Mi plan",
    await r.page.evaluate(() => document.querySelector('.teacher-tab-btn[aria-selected="true"]').dataset.tab), "plan");
  igual("y su panel es el que se ve", await seVe(r.page, "#plan-panel"), true);
  igual("y también queda anotado", await r.page.evaluate(() => localStorage.getItem("sesion_modo_sencillo_v1")), "1");
  igual("sin errores en consola", r.errores.join(" | ") || "ninguno", "ninguno");
  await r.ctx.close();

  // 2. Quien ya da clases (tres o más): nada se mueve de lugar.
  const VIEJA = (n) => ({ id: "s-v" + n, title: null, created_by: "u-profe", ended_at: "2026-09-1" + n + "T16:00:00Z",
                          started_at: "2026-09-1" + n + "T15:00:00Z", notes: null });
  r = await abrir(browser, "u-profe", CLASE_ABIERTA, { class_sessions: [CLASE_ABIERTA, VIEJA(1), VIEJA(2)] }, { modoSencillo: null });
  await r.page.waitForSelector("#teacher-toolbar:not(.hidden)", { timeout: 10000 });
  await r.page.waitForFunction(() => document.getElementById("modo-sencillo-btn").textContent !== "");
  igual("con tres clases dadas, todas las herramientas", (await pestanas(r.page)).length, 6);
  igual("y el botón ofrece el modo sencillo", await r.page.textContent("#modo-sencillo-btn"), "🪶 Volver al modo sencillo");
  await r.ctx.close();

  // 3. Lo que eligió en este aparato manda sobre la cuenta.
  r = await abrir(browser, "u-profe", CLASE_ABIERTA, { class_sessions: [CLASE_ABIERTA, VIEJA(1), VIEJA(2)] }, { modoSencillo: "1" });
  await r.page.waitForSelector("#teacher-toolbar:not(.hidden)", { timeout: 10000 });
  await r.page.waitForFunction(() => document.getElementById("modo-sencillo-btn").textContent !== "");
  igual("si eligió el modo sencillo, se queda aunque ya dé clases", (await pestanas(r.page)).join(","), "plan,alumnos,controles");
  await r.ctx.close();

  // 4. A la alumna, nada de esto.
  r = await abrir(browser, "u-ana", CLASE_ABIERTA, null, { modoSencillo: null });
  await r.page.waitForSelector("#app:not(.hidden)", { timeout: 10000 });
  igual("a la alumna no se le pinta el botón del modo sencillo", await seVe(r.page, "#modo-sencillo-fila"), false);
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumna(browser);
    await pruebaModoSencillo(browser);
  } finally {
    await browser.close();
  }
  const fallos = require("./verificar-clase-registrada.js").fallos();
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: la clase en vivo se puede recorrer.");
  process.exit(fallos ? 1 : 0);
})();
