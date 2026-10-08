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
 * Cinco cosas, y ninguna se puede comprobar leyendo el HTML:
 *
 *   1. LOS BOTONES VAN EN SUS DOS GRUPOS, CON SU RÓTULO. El rótulo no dice qué
 *      hace la herramienta sino QUIÉN LA VE, que es la línea de toda la clase
 *      en vivo. «Tu material» va en la columna de herramientas; «El tablero»
 *      (Tiempo para pensar; Reiniciar, Borrar flechas, Ocultar y Guardar PGN van en
 *      la barra del tablero, como iconos, en su grupo #botones-tablero)
 *      DEBAJO del tablero que tocan. Un botón suelto fuera de los grupos es el
 *      principio de la rejilla sin criterio de antes, así que acá se cuentan.
 *
 *   2. LAS PESTAÑAS VAN EN EL ORDEN DE LA CLASE, y sobre todo: la que se abre
 *      sola la primera vez es «Mi plan». Es la única pestaña que contesta "¿qué
 *      voy a dar?", y estaba quinta. «Invitar» ya no está: invitar no se hace
 *      dando clase (se hace en Formularios).
 *
 *   2b. EL MOTOR Y LOS ALUMNOS CONECTADOS SE VEN SIEMPRE, sin abrir nada y con
 *      cualquier pestaña delante, arriba de la columna: se miran toda la clase.
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
const { chromium } = require("./lib/playwright-con-sesion");
const { clienteFalso, abrir, igual, CHROME } = require("./verificar-clase-registrada.js");

const CLASE_ABIERTA = { id: "s-1", title: null, created_by: "u-profe",
                        ended_at: null, started_at: "2026-09-20T15:00:00Z", notes: null };

/* Los dos grupos, con el orden en que tienen que salir y DÓNDE. El orden no es
   estético: dentro de "tu material" van primero los que traen algo ya preparado
   (un curso, un archivo, un PDF, una presentación) y de último el de armar una
   posición a mano, que es el trabajo. La presentación sí la ve la clase, pero
   elegirla y pasarla es del profe: es su material. */
const GRUPOS = [
  { donde: "teacher-toolbar", rotulo: "Tu material — solo lo ves tú",
    botones: ["toggle-lesson-btn", "toggle-archivos-btn", "toggle-pdf-btn", "toggle-presentacion-btn", "toggle-free-mode-btn"] },
];
/* «El tablero — lo ve toda la clase» ya no es una tarjeta: sus cuatro botones van en
   la barra del tablero, en su grupo #botones-tablero (que lleva ese rótulo como
   aria-label), y debajo solo queda «⏳ Tiempo para pensar», que se abre al tocarlo. */

// El orden de la clase: qué voy a dar, qué le pongo delante, qué le pido.
// «Alumnos» no es pestaña (se ve siempre) e «Invitar» se quitó de la clase.
const PESTANAS = ["plan", "tactica", "tipos", "preguntar", "practicar"];

async function pruebaProfesor(browser) {
  console.log("\n=== La pantalla del profesor se puede recorrer ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE_ABIERTA);
  await page.waitForSelector("#teacher-toolbar:not(.hidden)", { timeout: 10000 });

  console.log("-- Los botones, en sus dos grupos");
  /* Se leen del DOM ya renderizado: cada grupo es su tarjeta, con el rótulo
     arriba. Un botón suelto no aparecería en ninguno — que es exactamente lo
     que hay que impedir. Los colores de las flechas (#marks-color-picker) no
     cuentan: no son una herramienta, son el color con que se dibuja. */
  for (const esperado of GRUPOS) {
    const g = await page.evaluate((id) => {
      const bloque = document.getElementById(id);
      if (!bloque) return null;
      return {
        rotulo: (bloque.querySelector("p") || {}).textContent || "(sin rótulo)",
        botones: [...bloque.querySelectorAll("button")].filter((b) => !b.closest("#marks-color-picker")).map((b) => b.id),
        seVe: bloque.checkVisibility(),
      };
    }, esperado.donde);
    igual(esperado.donde + ": su rótulo dice quién lo ve", (g || {}).rotulo, esperado.rotulo);
    igual(esperado.donde + ": sus botones, en su orden y ninguno de más",
      ((g || {}).botones || []).join(", "), esperado.botones.join(", "));
    igual(esperado.donde + ": se ve", (g || {}).seVe, true);
  }
  igual("debajo de la barra, solo «Tiempo para pensar» (y los colores de las flechas)", await page.evaluate(() =>
    [...document.querySelectorAll("#toolbar-tablero button")].filter((b) => b.checkVisibility() && !b.closest("#marks-color-picker"))
      .map((b) => b.id).join(", ")), "pensar-abrir-btn");
  igual("sin rótulo de tarjeta", await page.evaluate(() =>
    /lo ve toda la clase/i.test(document.getElementById("toolbar-tablero").textContent)), false);
  /* La franja de estado empieza vacía para el profe —la de la clase ya dice lo que
     pasa— y vacía no ocupa lugar: dos franjas apiladas empujaban el tablero. */
  igual("la franja de estado, vacía, no ocupa alto", await page.evaluate(() => {
    const b = document.getElementById("status-banner");
    return [b.textContent, Math.round(b.getBoundingClientRect().height)];
  }), ["", 0]);
  igual("«Deshacer» va en la barra del tablero, como icono", await page.evaluate(() => {
    const b = document.getElementById("undo-move-btn");
    return [!!b.closest("#barra-tablero"), b.checkVisibility(), b.querySelector(".boton-icono-ayuda").textContent];
  }), [true, true, "Deshacer la última jugada"]);
  /* La barra del tablero es UNA fila de botones de solo icono. Lo que toca el tablero
     que ve toda la clase va en su grupo, que lo dice; y cada botón dice lo que hace
     al pasar el ratón: se mide que el rótulo NO se vea quieto y SÍ al pasar encima
     (la pantalla, no la clase), y que sea también su nombre accesible. */
  igual("lo que toca el tablero, en su grupo de la barra y en su orden", await page.evaluate(() => {
    const g = document.getElementById("botones-tablero");
    return [g.getAttribute("aria-label"), [...g.querySelectorAll("button")].map((b) => b.id).join(", "), g.checkVisibility(),
            !!g.closest("#barra-tablero")];
  }), ["El tablero — lo ve toda la clase", "reset-board-btn, clear-marks-btn, toggle-hide-btn, save-game-btn", true, true]);
  const ayuda = () => page.evaluate(() => {
    const r = document.querySelector("#clear-marks-btn .boton-icono-ayuda").getBoundingClientRect();
    return r.width > 40 && r.height > 12;
  });
  igual("quieto, el botón es solo su icono", await ayuda(), false);
  await page.hover("#clear-marks-btn");
  igual("al pasar el ratón dice lo que hace", await ayuda(), true);
  await page.mouse.move(0, 0);
  igual("y eso mismo es su nombre accesible", await page.evaluate(() => {
    const b = document.getElementById("clear-marks-btn");
    return [b.querySelector('[aria-hidden="true"]').textContent, b.querySelector(".boton-icono-ayuda").textContent];
  }), ["🧹", "Borrar flechas y círculos"]);
  await page.click("#toggle-hide-btn");
  igual("«Ocultar» cambia a «Mostrar», icono y texto", await page.evaluate(() =>
    document.getElementById("toggle-hide-btn").textContent), "👁️Mostrar las piezas a los alumnos");
  await page.click("#toggle-hide-btn");

  console.log("-- Lo que toca el tablero va DEBAJO del tablero");
  igual("«El tablero» está en la columna del tablero, no en la de herramientas", await page.evaluate(() =>
    !!document.getElementById("toolbar-tablero").closest(".proyector-columna")
    && !document.getElementById("toolbar-tablero").closest("aside")), true);
  /* Justo debajo: entre el tablero y sus botones solo va la barra de girar y
     recorrer la partida, y quedan centrados con él. */
  igual("y justo debajo de él, centrado", await page.evaluate(() => {
    let e = document.getElementById("toolbar-tablero").previousElementSibling;
    while (e && !e.checkVisibility()) e = e.previousElementSibling;
    if (!e || !e.contains(document.getElementById("flip-board-btn"))) return "antes va " + (e ? e.id || e.className : "nada");
    // Con sus coordenadas de afuera: el tablero con sus letras y números es lo que se ve.
    const tablero = document.getElementById("chessboard");
    const t = (tablero.closest(".board-coords-outer") || tablero).getBoundingClientRect();
    const b = document.getElementById("toolbar-tablero").getBoundingClientRect();
    const centrado = Math.abs((t.left + t.right) / 2 - (b.left + b.right) / 2) < 4;
    return b.top >= t.bottom && centrado ? "sí" : JSON.stringify([t, b].map((r) => [r.left, r.top, r.right, r.bottom].map(Math.round)));
  }), "sí");

  console.log("-- El motor y los alumnos se ven siempre");
  for (const tab of PESTANAS) {
    await page.click("#teacher-tab-" + tab);
    igual("con «" + tab + "» abierta se ven el motor y los alumnos conectados", await page.evaluate(() =>
      ["engine-panel", "students-panel", "students-list"].map((i) => document.getElementById(i).checkVisibility())), [true, true, true]);
  }
  await page.click("#teacher-tab-plan");
  igual("arriba de la columna: el motor, luego los alumnos, luego lo demás", await page.evaluate(() => {
    const y = (i) => document.getElementById(i).getBoundingClientRect().top;
    return y("engine-panel") < y("students-panel") && y("students-panel") < y("teacher-toolbar") && y("teacher-toolbar") < y("teacher-tabs-wrap");
  }), true);

  console.log("-- Invitar ya no está en la clase");
  igual("ni la pestaña ni el formulario", await page.evaluate(() =>
    [!!document.getElementById("teacher-tab-controles"), !!document.getElementById("create-student-form")]), [false, false]);

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
  igual("ni los botones de debajo del tablero", await oculto("toolbar-tablero"), "oculto");
  igual("ni la lista de alumnos conectados", await oculto("students-panel"), "oculto");
  igual("ni las pestañas", await oculto("teacher-tabs-wrap"), "oculto");
  igual("ni el motor de análisis", await oculto("engine-panel"), "oculto");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* El modo sencillo: quien lleva menos de tres clases arranca viendo lo básico
   (el tablero, el motor, sus alumnos y su plan), y lo demás queda a un clic.
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
  await r.page.waitForSelector("#teacher-tabs-wrap:not(.hidden)", { timeout: 10000 });
  await r.page.waitForFunction(() => document.getElementById("modo-sencillo-btn").textContent !== "");
  igual("con una sola clase, arranca en modo sencillo: solo Mi plan",
    (await pestanas(r.page)).join(","), "plan");
  igual("«Tu material» queda guardado, con su tarjeta", [await seVe(r.page, "#toolbar-material"), await seVe(r.page, "#teacher-toolbar")], [false, false]);
  igual("los alumnos conectados siguen a la vista", await seVe(r.page, "#students-panel"), true);
  igual("pero el tablero de la clase sigue a mano", await seVe(r.page, "#reset-board-btn"), true);
  igual("y el motor también", await seVe(r.page, "#engine-panel"), true);
  igual("se dice qué está guardado y dónde", /Táctica, Entrenamientos, Preguntar, Practicar y tu material/.test(await r.page.textContent("#modo-sencillo-nota")), true);
  igual("y el botón dice lo que hace", await r.page.textContent("#modo-sencillo-btn"), "🧰 Ver todas las herramientas");

  await r.page.click("#modo-sencillo-btn");
  igual("«Ver todas las herramientas» devuelve las cinco pestañas",
    (await pestanas(r.page)).join(","), PESTANAS.join(","));
  igual("y «Tu material»", [await seVe(r.page, "#toolbar-material"), await seVe(r.page, "#teacher-toolbar")], [true, true]);
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
  await r.page.waitForSelector("#teacher-tabs-wrap:not(.hidden)", { timeout: 10000 });
  await r.page.waitForFunction(() => document.getElementById("modo-sencillo-btn").textContent !== "");
  igual("con tres clases dadas, todas las herramientas", (await pestanas(r.page)).length, PESTANAS.length);
  igual("y el botón ofrece el modo sencillo", await r.page.textContent("#modo-sencillo-btn"), "🪶 Volver al modo sencillo");
  await r.ctx.close();

  // 3. Lo que eligió en este aparato manda sobre la cuenta.
  r = await abrir(browser, "u-profe", CLASE_ABIERTA, { class_sessions: [CLASE_ABIERTA, VIEJA(1), VIEJA(2)] }, { modoSencillo: "1" });
  await r.page.waitForSelector("#teacher-tabs-wrap:not(.hidden)", { timeout: 10000 });
  await r.page.waitForFunction(() => document.getElementById("modo-sencillo-btn").textContent !== "");
  igual("si eligió el modo sencillo, se queda aunque ya dé clases", (await pestanas(r.page)).join(","), "plan");
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
