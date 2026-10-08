#!/usr/bin/env node
/* La presentación de la clase (js/clase-presentacion.js): el profe muestra sus
   diapositivas dentro de sesion.html y toda la clase ve la misma, arriba del
   tablero. Lo que se rompe acá no da ningún error en pantalla:

   - una posición de una diapositiva mal copiada se manda igual al tablero de
     todos (y una sin rey rompe a Stockfish para el resto de la clase): cada FEN
     se comprueba con chess.js y con la misma PosicionValida de la clase;
   - una imagen que falta deja un recuadro vacío delante de cuarenta personas:
     cada diapositiva tiene su imagen y cada imagen su diapositiva;
   - si el trigger no protege la columna, cualquier alumno pasa las láminas de
     toda la clase: la última versión de protect_game_state_teacher_columns
     tiene que devolverle `presentacion` a quien no es profesor;
   - el eco de Realtime de la diapositiva que el profe ya pasó lo devolvería
     atrás; al alumno no se le piden las láminas siguientes (son las
     respuestas); el proyector no muestra los botones del profe.

   Con el sitio en localhost:8777 y playwright, contra el doble de
   verificar-clase-registrada.js:
       node herramientas/verificar-clase-presentacion.js
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { Chess } = require("chess.js");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

// PosicionValida, la misma que usa la clase, cargada con el chess.js de npm.
const ctxPV = { window: {}, Chess };
vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js", "posicion-valida.js"), "utf8"), ctxPV);
const PosicionValida = ctxPV.window.PosicionValida;

const modulo = fs.readFileSync(path.join(RAIZ, "js", "clase-presentacion.js"), "utf8");
const decks = [...modulo.matchAll(/deck: "([a-z0-9-]+\/[a-z0-9-]+)"/g)].map((m) => m[1]);
const carpeta = (deck) => { const [c, k] = deck.split("/"); return path.join(RAIZ, "cursos", "recursos", c, "presentaciones", k); };

function datos() {
  console.log("1. Cada presentación de la lista, completa");
  cierto("la lista trae al menos una presentación", decks.length > 0);
  decks.forEach((deck) => {
    const dir = carpeta(deck);
    const j = JSON.parse(fs.readFileSync(path.join(dir, "diapositivas.json"), "utf8"));
    const ds = j.diapositivas;
    const imagenes = fs.readdirSync(dir).filter((f) => f.endsWith(".webp")).sort();
    cierto(`${deck}: ${ds.length} diapositivas y ${imagenes.length} imágenes, una por una`,
      ds.length === imagenes.length && ds.every((d, i) => d.imagen === imagenes[i]),
      "imágenes: " + imagenes.join(" "));
    cierto(`${deck}: cada una con título y su texto para el lector de pantalla`,
      ds.every((d) => d.titulo && d.texto && d.texto.length > 30));
    cierto(`${deck}: no pasa del tope del CHECK de la base (500)`, ds.length <= 500);
    const posiciones = ds.flatMap((d, i) => (d.posiciones || []).map((p) => Object.assign({ n: i + 1 }, p)));
    console.log(`\n2. ${deck}: ${posiciones.length} posiciones, contra chess.js`);
    posiciones.forEach((p) => {
      const g = new Chess();
      const ok = g.validate_fen(p.fen).valid && g.load(p.fen);
      const motivo = ok ? PosicionValida.motivo(p.fen) : "chess.js no la carga";
      cierto(`diapositiva ${p.n}, «${p.nombre}»: se puede poner en el tablero de la clase`, ok && !motivo, motivo || "");
      if (p.jugadas !== undefined) {
        cierto(`  y se puede preguntar: ${p.jugadas} jugada(s), con jugadas legales`,
          Number.isInteger(p.jugadas) && p.jugadas >= 1 && p.jugadas <= 6 && ok && g.moves().length > 0);
      }
    });
  });

  console.log("\n3. La base: solo el profe cambia la diapositiva");
  const dirMig = path.join(RAIZ, "supabase", "migraciones");
  const ultima = fs.readdirSync(dirMig).sort().filter((f) =>
    /function public\.protect_game_state_teacher_columns/.test(fs.readFileSync(path.join(dirMig, f), "utf8"))).pop();
  const sql = fs.readFileSync(path.join(dirMig, ultima), "utf8");
  const ramaAlumno = sql.slice(sql.indexOf("if not is_teacher then"), sql.indexOf("else", sql.indexOf("if not is_teacher then")));
  cierto(`${ultima}: a quien no es profesor le devuelve la presentación de antes`,
    /new\.presentacion := old\.presentacion;/.test(ramaAlumno));
  cierto("la columna tiene su CHECK de forma", fs.readdirSync(dirMig).some((f) =>
    /game_state_presentacion_forma/.test(fs.readFileSync(path.join(dirMig, f), "utf8"))));
}

const DECK = decks[0];
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
function fila(extra) {
  return Object.assign({
    id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, last_move: null,
    arrows: [], circles: [], active_player_id: null, active_player_color: "both",
    shown_curso: null, shown_leccion: null, vista: null, presentacion: null, updated_by: "u-profe",
    updated_at: new Date().toISOString(),
  }, extra || {});
}
const ultimaPresentacion = (page) => page.evaluate(() => {
  const u = window.__updates.filter((x) => x.tabla === "game_state" && "presentacion" in x.campos);
  return u.length ? u[u.length - 1].campos.presentacion : "sin mandar";
});
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const imagen = (page) => page.evaluate(() => {
  const i = document.getElementById("presentacion-img");
  return { src: (i.getAttribute("src") || "").split("/").pop(), cargada: i.complete && i.naturalWidth > 0, alt: i.alt };
});
async function esperarImagen(page, archivo) {
  await page.waitForFunction((a) => {
    const i = document.getElementById("presentacion-img");
    return (i.getAttribute("src") || "").endsWith("/" + a) && i.complete && i.naturalWidth > 0;
  }, archivo, { timeout: 8000 });
}

async function pruebaProfesor(browser) {
  console.log("\n4. El profe la pone, la pasa, manda una posición y la quita");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.waitForSelector("#toggle-presentacion-btn", { state: "visible", timeout: 10000 });
  cierto("sin presentación, no hay tarjeta", !(await seVe(page, "#presentacion-caja")));
  await page.click("#toggle-presentacion-btn");
  cierto("el botón abre el panel y lo dice", await seVe(page, "#presentacion-panel")
    && (await page.getAttribute("#toggle-presentacion-btn", "aria-expanded")) === "true");
  await page.click("#presentacion-panel-lista button:has-text('Mostrar a la clase')");
  await esperarImagen(page, "01.webp");
  cierto("«Mostrar a la clase» manda la primera", JSON.stringify(await ultimaPresentacion(page)) === JSON.stringify({ deck: DECK, n: 1 }));
  cierto("y la tarjeta se ve arriba del tablero, con la imagen cargada", await seVe(page, "#presentacion-caja")
    && await page.evaluate(() => document.getElementById("presentacion-caja").getBoundingClientRect().bottom
      <= document.getElementById("chessboard").getBoundingClientRect().top));
  cierto("◀ apagado en la primera", await page.isDisabled("#presentacion-anterior"));

  // Tres seguidas y, después, los ecos de las dos primeras: no la devuelven atrás.
  await page.click("#presentacion-siguiente");
  await page.click("#presentacion-siguiente");
  await page.click("#presentacion-siguiente");
  await esperarImagen(page, "04.webp");
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 2 } }));
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 3 } }));
  await page.waitForTimeout(300);
  cierto("los ecos viejos no la devuelven atrás", (await imagen(page)).src === "04.webp", (await imagen(page)).src);
  cierto("y dice cuál es", (await page.textContent("#presentacion-cuenta")) === "Diapositiva 4 de 34");

  // A la 9 (colocación del tablero): su posición, al tablero de la clase.
  await page.click("#presentacion-siguiente");
  await esperarImagen(page, "05.webp");
  cierto("las notas de la diapositiva, solo en la pantalla del profe",
    await seVe(page, "#presentacion-notas") && /^Notas \(solo tú\): Mostrar al inicio/.test(await page.textContent("#presentacion-notas")));
  cierto("y qué sigue", (await page.textContent("#presentacion-sigue")) === "Sigue: Deberes de la persona árbitra (art. 12)");
  for (let i = 0; i < 4; i++) await page.click("#presentacion-siguiente");
  await esperarImagen(page, "09.webp");
  cierto("la diapositiva con posición trae su botón", await page.isVisible("#presentacion-posiciones button:has-text('Al tablero de la clase')"));
  await page.click("#presentacion-posiciones button:has-text('Al tablero de la clase')");
  await page.waitForTimeout(300);
  const puesta = await page.evaluate(() => {
    const u = window.__updates.filter((x) => x.tabla === "game_state" && "start_fen" in x.campos);
    return u.length ? u[u.length - 1].campos : null;
  });
  cierto("«Al tablero de la clase» pasa por aplicarPosicionEnClase (posición, sin jugadas ni vista)",
    puesta && puesta.start_fen === new Chess().fen() && puesta.moves.length === 0 && puesta.vista === null,
    JSON.stringify(puesta));

  // La 20 (mate frente a ahogado): Practicar solo donde la partida sigue.
  await page.evaluate((d) => mostrarPresentacion({ deck: d, n: 20 }), DECK);
  await esperarImagen(page, "20.webp");
  const filas = await page.$$eval("#presentacion-posiciones > div", (ds) => ds.map((d) => d.textContent));
  cierto("en el mate y el ahogado no se ofrece practicar; en «No es ahogado», sí",
    filas.length === 3 && !/Practicar/.test(filas[0]) && !/Practicar/.test(filas[1]) && /Practicar/.test(filas[2]), filas.join(" | "));
  cierto("en la 20, que no tiene notas, no queda la caja de notas", !(await seVe(page, "#presentacion-notas")));

  await page.evaluate((d) => mostrarPresentacion({ deck: d, n: 34 }), DECK);
  await esperarImagen(page, "34.webp");
  cierto("▶ apagado en la última", await page.isDisabled("#presentacion-siguiente"));
  await page.evaluate((d) => mostrarPresentacion({ deck: d, n: 99 }), DECK);
  cierto("pasarse del final se queda en la última", JSON.stringify(await ultimaPresentacion(page)) === JSON.stringify({ deck: DECK, n: 34 }));

  await page.click("#presentacion-quitar");
  await page.waitForTimeout(200);
  cierto("«Quitar de la clase» manda null y la tarjeta se va",
    (await ultimaPresentacion(page)) === null && !(await seVe(page, "#presentacion-caja")));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n5. La alumna ve la misma, sin botones y sin adelantarse");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ presentacion: { deck: DECK, n: 5 } })] });
  const pedidas = [];
  page.on("request", (r) => { if (/\.webp$/.test(r.url())) pedidas.push(r.url().split("/").pop()); });
  await esperarImagen(page, "05.webp");
  cierto("al entrar ya ve la diapositiva que está en la base", (await page.textContent("#presentacion-cuenta")) === "Diapositiva 5 de 34");
  cierto("la imagen dice cuál es", /^Diapositiva 5: Cronograma/.test((await imagen(page)).alt), (await imagen(page)).alt);
  cierto("y su texto se puede leer", /300 minutos/.test(await page.textContent("#presentacion-texto")));
  cierto("sin los botones del profe", !(await seVe(page, "#presentacion-profe")) && !(await seVe(page, "#presentacion-siguiente")));
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 12 } }));
  await esperarImagen(page, "12.webp");
  cierto("el profe la pasa: la alumna ve la 12", (await page.textContent("#presentacion-cuenta")) === "Diapositiva 12 de 34");
  await page.waitForFunction(() => /diapositiva 12 de 34/.test(document.getElementById("clase-voz").textContent), null, { timeout: 3000 }).catch(() => {});
  cierto("y se le dice en voz", /diapositiva 12 de 34: Captura al paso/.test(await page.textContent("#clase-voz")));
  cierto("sin las posiciones para mandar al tablero", !(await seVe(page, "#presentacion-posiciones")));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  cierto("en el celular cabe: la página no se corre de lado", await page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth && document.getElementById("presentacion-caja").getBoundingClientRect().right <= innerWidth));
  await page.waitForTimeout(300);
  cierto("solo se le pidió la que se ve (no la siguiente: son las respuestas)",
    pedidas.every((p) => p === "12.webp" || p === "05.webp"), pedidas.join(" "));
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: "../../x", n: 1 } }));
  await page.waitForTimeout(200);
  cierto("una forma que no es la de la base no se muestra", !(await seVe(page, "#presentacion-caja")));
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: null }));
  cierto("sin presentación, sin tarjeta", !(await seVe(page, "#presentacion-caja")));
  cierto("la alumna nunca escribió la presentación", await page.evaluate(() =>
    !window.__updates.some((x) => x.tabla === "game_state" && "presentacion" in x.campos)));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaProyector(browser) {
  console.log("\n6. En el proyector: la lámina al lado del tablero, sin lo del profe");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE,
    { game_state: [fila({ presentacion: { deck: DECK, n: 11 } })] }, { ruta: "/sesion.html?proyector=1" });
  await page.setViewportSize({ width: 1600, height: 900 });
  await esperarImagen(page, "11.webp");
  cierto("se ve la diapositiva", await seVe(page, "#presentacion-caja"));
  cierto("sin ◀ ▶, notas ni posiciones", !(await seVe(page, "#presentacion-profe")));
  cierto("sin el texto desplegable ni pantalla completa", !(await seVe(page, "#presentacion-completa")));
  const cajas = await page.evaluate(() => {
    const a = document.getElementById("presentacion-caja").getBoundingClientRect();
    const b = document.getElementById("chessboard").getBoundingClientRect();
    return { lamina: [a.left, a.right, a.top], tablero: [b.left, b.right, b.top], ancho: innerWidth };
  });
  cierto("la lámina a la izquierda y el tablero a la derecha, los dos arriba",
    cajas.lamina[1] <= cajas.tablero[0] && cajas.tablero[2] < 400 && cajas.lamina[2] < 400 && cajas.tablero[1] <= cajas.ancho, JSON.stringify(cajas));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { datos(); } catch (e) { cierto("los datos se pudieron leer", false, e && e.stack); }
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumna(browser);
    await pruebaProyector(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: la presentación se ve en la clase.");
  process.exit(fallos ? 1 : 0);
})();
