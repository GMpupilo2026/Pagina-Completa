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

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  const fallos = require("./verificar-clase-registrada.js").fallos();
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: la clase en vivo se puede recorrer.");
  process.exit(fallos ? 1 : 0);
})();
