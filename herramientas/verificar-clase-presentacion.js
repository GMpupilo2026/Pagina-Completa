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
     respuestas); el proyector no muestra los botones del profe;
   - la pizarra (js/clase-pizarra.js): una marca que cae en otro lugar de la
     lámina en otra pantalla, un color que no se ve sobre la diapositiva, unas
     marcas que el alumno pueda dibujar o que se pierdan al volver a una
     lámina;
   - las notas del profe en cada diapositiva: que se guarden con su lámina y
     que nadie más las vea (la RLS de presentacion_notas, solo las propias).

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
    const enLista = (modulo.match(new RegExp('deck: "' + deck + '", titulo: ("[^"]*")')) || [])[1];
    cierto(`${deck}: el título de la lista es el de su diapositivas.json`, enLista && JSON.parse(enLista) === j.titulo, enLista + " / " + j.titulo);
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
  // Las subidas: al que no es su profe, el bucket solo le deja leer la página
  // que se está mostrando (la n de game_state.presentacion), no las siguientes.
  const mig = fs.readdirSync(dirMig).sort().filter((f) => /policy presentaciones_select on storage\.objects/.test(fs.readFileSync(path.join(dirMig, f), "utf8"))).pop();
  const pol = mig ? fs.readFileSync(path.join(dirMig, mig), "utf8").split("create policy presentaciones_select")[1].split(";")[0] : "";
  cierto("el bucket de las subidas solo firma la diapositiva que se está mostrando",
    /g\.presentacion->>'deck' = 'subida\/' \|\| \(storage\.foldername\(name\)\)\[2\]/.test(pol)
      && /g\.presentacion->>'n' = split_part\(storage\.filename\(name\), '\.', 1\)/.test(pol), mig || "sin migración");

  console.log("\n3b. La pizarra y las notas del profe");
  const todas = fs.readdirSync(dirMig).sort().map((f) => fs.readFileSync(path.join(dirMig, f), "utf8")).join("\n");
  cierto("las marcas de la pizarra tienen tope en la base (la fila viaja entera con cada jugada)",
    /constraint game_state_presentacion_tamano\s+check \(presentacion is null or length\(presentacion::text\) <= 60000\)/.test(todas));
  const notas = todas.slice(todas.indexOf("create table if not exists public.presentacion_notas"));
  const politicas = [...notas.matchAll(/create policy (presentacion_notas_\w+) on public\.presentacion_notas for (\w+) to authenticated\s+(using|with check) \(([^;]*);/g)];
  cierto("las notas: RLS encendida y una política por operación", /alter table public\.presentacion_notas enable row level security/.test(notas)
    && ["select", "insert", "update", "delete"].every((op) => politicas.some((m) => m[2] === op)), politicas.map((m) => m[2]).join(" "));
  cierto("y cada una deja SOLO las propias (ni alumnos, ni quien administra)",
    politicas.length === 4 && politicas.every((m) => !/soy_admin|game_state|alumnos_de|\bor\b/.test(m[4])
      && /profesor_id = \(select auth\.uid\(\)\)/.test(m[4])),
    politicas.map((m) => m[4]).join(" | "));
  // Los colores, contra el fondo real de la lámina: 3:1, el de un gráfico (WCAG 1.4.11).
  const ctxPz = { window: {}, document: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js", "clase-pizarra.js"), "utf8").split("let pizarraActiva")[0], ctxPz);
  const Pz = ctxPz.window.Pizarra;
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  Pz.COLORES.forEach((c) => {
    if (c.clave === "amarillo") return; // el del resaltador: va debajo de lo que resalta
    const fondo = c.clave === "blanco" ? "#000000" : "#ffffff";
    const r = contraste(c.hex, fondo);
    cierto(`${c.nombre} se ve sobre una lámina ${c.clave === "blanco" ? "oscura" : "blanca"} (${r.toFixed(1)}:1)`, r >= 3);
  });
  const sucias = [
    { h: "lapiz", c: "rojo", p: [10, 10, 20, 20] }, { h: "lapiz", c: "morado", p: [1, 1] }, { h: "script", c: "rojo", p: [1, 1] },
    { h: "linea", c: "azul", p: [1, 2, 3] }, { h: "flecha", c: "verde", p: [0, 0, 1001, 5] }, { h: "circulo", c: "negro", p: [1.5, 2, 3, 4] }, "x", null,
    { h: "circulo", c: "negro", p: [100, 100, 300, 300], extra: "<script>" },
  ];
  cierto("de la base solo se dibuja lo que tiene la forma (y sin claves de más)",
    JSON.stringify(Pz.limpiar(sucias)) === JSON.stringify([{ h: "lapiz", c: "rojo", p: [10, 10, 20, 20] }, { h: "circulo", c: "negro", p: [100, 100, 300, 300] }]),
    JSON.stringify(Pz.limpiar(sucias)));
  cierto("y nunca más de " + Pz.MAX_TRAZOS + " marcas", Pz.limpiar(Array.from({ length: 99 }, () => ({ h: "lapiz", c: "rojo", p: [1, 1] }))).length === Pz.MAX_TRAZOS);
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
  // Administración le compartió el curso (admin.html#asesores).
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()], puede_bajar: ["formacion-ajedrez"] });
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

/* Hacer algo y esperar a que la presentación se mande (no un tiempo fijo: con
   la máquina cargada, como en el CI, 350 ms no alcanzan). Si no se manda nada
   —un toque que no deja marca—, sigue a los 3 segundos. */
const enviosDePresentacion = (page) => page.evaluate(() => window.__updates.filter((x) => x.tabla === "game_state" && "presentacion" in x.campos).length);
async function yMandar(page, accion) {
  const antes = await enviosDePresentacion(page);
  await accion();
  await page.waitForFunction((n) => window.__updates.filter((x) => x.tabla === "game_state" && "presentacion" in x.campos).length > n, antes, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(50);
}

/* Arrastrar el mouse sobre la diapositiva, en fracciones de la imagen (0 a 1). */
async function trazar(page, puntos) {
  await yMandar(page, () => arrastrar(page, puntos));
}
async function arrastrar(page, puntos) {
  const r = await page.evaluate(() => { const b = document.getElementById("presentacion-img").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  const a = (f) => [r.x + f[0] * r.w, r.y + f[1] * r.h];
  await page.mouse.move(...a(puntos[0]));
  await page.mouse.down();
  for (const f of puntos.slice(1)) await page.mouse.move(...a(f), { steps: 6 });
  await page.mouse.up();
}
const marcasEnPantalla = (page) => page.evaluate(() => document.getElementById("presentacion-pizarra").children.length);
const punteroDePizarra = (page) => page.evaluate(() => getComputedStyle(document.getElementById("presentacion-pizarra")).pointerEvents);

async function pruebaPizarra(browser) {
  console.log("\n4b. La pizarra: el profe raya la diapositiva; sus notas, solo para él");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    game_state: [fila({ presentacion: { deck: DECK, n: 3 } })],
    presentacion_notas: [{ profesor_id: "u-profe", deck: DECK, n: 4, texto: "Preguntar quién ya arbitró un torneo." }],
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await esperarImagen(page, "03.webp");
  cierto("sin encender la pizarra, la diapositiva no se raya (el puntero pasa de largo)",
    await punteroDePizarra(page) === "none" && !(await seVe(page, "#pizarra-herramientas")));
  await page.click("#pizarra-btn");
  cierto("«✏️ Pizarra» la enciende, lo dice y saca las herramientas",
    (await page.getAttribute("#pizarra-btn", "aria-pressed")) === "true" && await seVe(page, "#pizarra-herramientas") && await punteroDePizarra(page) === "auto");
  cierto("cada color dice su nombre (el color nunca va solo)", await page.$$eval("#pizarra-colores button", (bs) =>
    bs.length >= 5 && bs.every((b) => b.textContent.trim().length > 2)));
  await trazar(page, [[0.2, 0.3], [0.3, 0.35], [0.4, 0.3]]);
  let enviada = await ultimaPresentacion(page);
  cierto("un trazo con el lápiz se manda al soltarlo, rojo de entrada", enviada && enviada.n === 3 && Array.isArray(enviada.trazos)
    && enviada.trazos.length === 1 && enviada.trazos[0].h === "lapiz" && enviada.trazos[0].c === "rojo" && enviada.trazos[0].p.length >= 4,
    JSON.stringify(enviada));
  await page.click("[data-pizarra-herramienta='linea']");
  await page.click("#pizarra-colores button:has-text('Azul')");
  await trazar(page, [[0.25, 0.5], [0.75, 0.5]]);
  enviada = await ultimaPresentacion(page);
  const linea = enviada && enviada.trazos && enviada.trazos[1];
  cierto("la línea azul cae donde se trazó, en milésimas de la imagen", !!linea && linea.h === "linea" && linea.c === "azul"
    && Math.abs(linea.p[0] - 250) <= 3 && Math.abs(linea.p[1] - 500) <= 3 && Math.abs(linea.p[2] - 750) <= 3 && Math.abs(linea.p[3] - 500) <= 3,
    JSON.stringify(linea));
  await page.click("[data-pizarra-herramienta='flecha']");
  await trazar(page, [[0.5, 0.7], [0.8, 0.8]]);
  await page.click("[data-pizarra-herramienta='circulo']");
  await trazar(page, [[0.6, 0.6], [0.6, 0.6]]);
  await trazar(page, [[0.1, 0.1], [0.2, 0.25]]);
  enviada = await ultimaPresentacion(page);
  cierto("flecha y círculo; un toque con la línea o el círculo no deja nada",
    enviada.trazos.map((t) => t.h).join(",") === "lapiz,linea,flecha,circulo" && await marcasEnPantalla(page) === 4, JSON.stringify(enviada.trazos.map((t) => t.h)));
  // Un eco viejo (de cuando había una sola marca) no le borra las demás.
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 3, trazos: [enviada.trazos[0]] } }));
  await page.waitForTimeout(200);
  cierto("un eco viejo de Realtime no le quita marcas", await marcasEnPantalla(page) === 4);
  await yMandar(page, () => page.click("#pizarra-deshacer"));
  cierto("«Deshacer» quita la última", (await ultimaPresentacion(page)).trazos.length === 3 && await marcasEnPantalla(page) === 3);
  await page.click("[data-pizarra-herramienta='borrador']");
  await trazar(page, [[0.5, 0.49], [0.5, 0.51]]);
  enviada = await ultimaPresentacion(page);
  cierto("el borrador quita la marca que toca (la línea) y deja las demás", enviada.trazos.map((t) => t.h).join(",") === "lapiz,flecha",
    JSON.stringify(enviada.trazos.map((t) => t.h)));

  // Pasar de lámina: la siguiente, limpia; al volver, sus marcas otra vez.
  await yMandar(page, () => page.click("#presentacion-siguiente"));
  await esperarImagen(page, "04.webp");
  await page.waitForFunction(() => !document.getElementById("presentacion-nota").disabled, null, { timeout: 5000 }).catch(() => {});
  cierto("la siguiente diapositiva va sin las marcas de la anterior",
    JSON.stringify(await ultimaPresentacion(page)) === JSON.stringify({ deck: DECK, n: 4 }) && await marcasEnPantalla(page) === 0);
  cierto("sus notas del profe, en su cuadro", await page.inputValue("#presentacion-nota") === "Preguntar quién ya arbitró un torneo.");
  await yMandar(page, () => page.click("#presentacion-anterior"));
  await esperarImagen(page, "03.webp");
  enviada = await ultimaPresentacion(page);
  cierto("al volver a la anterior, vuelven sus marcas (y se mandan a la clase)",
    enviada.n === 3 && !!enviada.trazos && enviada.trazos.length === 2 && await marcasEnPantalla(page) === 2, JSON.stringify(enviada));
  await yMandar(page, () => page.click("#pizarra-limpiar"));
  cierto("«Borrar todo» las quita para todos", JSON.stringify(await ultimaPresentacion(page)) === JSON.stringify({ deck: DECK, n: 3 }) && await marcasEnPantalla(page) === 0);
  await yMandar(page, () => page.click("#pizarra-deshacer"));
  cierto("y «Deshacer» las trae de vuelta", ((await ultimaPresentacion(page)).trazos || []).length === 2);

  // Las notas: escribir, guardar, que se guarde sola al pasar, y borrar.
  cierto("el cuadro de notas dice que son solo suyas", /solo las ves tú/.test(await page.textContent("label[for='presentacion-nota']")));
  await page.fill("#presentacion-nota", "Mostrar el reloj antes de esta.");
  await page.click("#presentacion-nota-guardar");
  await page.waitForFunction(() => /Nota guardada/.test(document.getElementById("presentacion-nota-msg").textContent), null, { timeout: 5000 }).catch(() => {});
  const ultimaNota = () => page.evaluate(() => { const u = window.__inserts.filter((i) => i.tabla === "presentacion_notas"); return u.length ? u[u.length - 1] : null; });
  const nota = await ultimaNota();
  cierto("«Guardar la nota» la guarda con su diapositiva, a su nombre", !!nota && nota.upsert && nota.fila.profesor_id === "u-profe"
    && nota.fila.deck === DECK && nota.fila.n === 3 && nota.fila.texto === "Mostrar el reloj antes de esta.", JSON.stringify(nota));
  cierto("y dice que quedó guardada", /Nota guardada/.test(await page.textContent("#presentacion-nota-msg")));
  await page.fill("#presentacion-nota", "Se guarda sola al pasar.");
  await page.click("#presentacion-siguiente");
  await esperarImagen(page, "04.webp");
  await page.waitForFunction(() => window.__inserts.filter((i) => i.tabla === "presentacion_notas").length >= 2, null, { timeout: 5000 }).catch(() => {});
  const sola = (await ultimaNota()).fila;
  cierto("lo escrito se guarda solo al pasar de diapositiva (en la que era)", sola.n === 3 && sola.texto === "Se guarda sola al pasar.", JSON.stringify(sola));
  await page.waitForFunction(() => !document.getElementById("presentacion-nota").disabled, null, { timeout: 5000 }).catch(() => {});
  await page.fill("#presentacion-nota", "");
  await page.click("#presentacion-nota-guardar");
  await page.waitForFunction(() => window.__deletes.some((x) => x.tabla === "presentacion_notas"), null, { timeout: 5000 }).catch(() => {});
  cierto("vaciarla la borra", await page.evaluate((d) => window.__deletes.some((x) => x.tabla === "presentacion_notas"
    && JSON.stringify(x.donde) === JSON.stringify([["profesor_id", "u-profe"], ["deck", d], ["n", 4]])), DECK));
  await page.click("#pizarra-btn");
  cierto("apagar la pizarra deja la diapositiva como antes", await punteroDePizarra(page) === "none" && !(await seVe(page, "#pizarra-herramientas")));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

/* Dónde cae en pantalla el centro de la primera marca, en fracciones de la lámina. */
const centroDeMarca = (page) => page.evaluate(() => {
  const m = document.getElementById("presentacion-pizarra").firstElementChild.getBoundingClientRect();
  const i = document.getElementById("presentacion-img");
  const r = i.getBoundingClientRect();
  // La imagen va «contain»: la lámina es el rectángulo dibujado, no el de la etiqueta.
  const k = Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight);
  const w = i.naturalWidth * k, h = i.naturalHeight * k;
  const x0 = r.left + (r.width - w) / 2, y0 = r.top + (r.height - h) / 2;
  return [((m.left + m.right) / 2 - x0) / w, ((m.top + m.bottom) / 2 - y0) / h];
});
const cerca = (c) => Math.abs(c[0] - 0.7) < 0.01 && Math.abs(c[1] - 0.4) < 0.01;

async function pruebaPizarraClase(browser) {
  console.log("\n4c. Las marcas, en la pantalla de la alumna y en el proyector");
  const MARCA = { h: "circulo", c: "verde", p: [600, 300, 800, 500] }; // su centro: (0,7; 0,4) de la lámina
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ presentacion: { deck: DECK, n: 7, trazos: [MARCA] } })] });
  await page.setViewportSize({ width: 1280, height: 900 });
  await esperarImagen(page, "07.webp");
  await page.waitForTimeout(200);
  let c = await centroDeMarca(page);
  cierto("la alumna ve la marca del profe en su lugar de la lámina", cerca(c), JSON.stringify(c));
  cierto("sin pizarra ni notas, y la marca no se puede tocar",
    !(await seVe(page, "#pizarra-btn")) && !(await seVe(page, "#presentacion-mis-notas")) && await punteroDePizarra(page) === "none");
  await page.waitForFunction(() => /marcando la diapositiva/.test(document.getElementById("clase-voz").textContent), null, { timeout: 3000 }).catch(() => {});
  cierto("y se le dice en voz que su profe está marcando", /marcando la diapositiva/.test(await page.textContent("#clase-voz")));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  c = await centroDeMarca(page);
  cierto("en el celular, la misma marca en el mismo lugar", cerca(c), JSON.stringify(c));
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.click("#presentacion-completa");
  await page.waitForFunction(() => document.fullscreenElement && document.fullscreenElement.id === "presentacion-caja", null, { timeout: 5000 });
  await page.waitForTimeout(250);
  c = await centroDeMarca(page);
  cierto("a pantalla completa, con el tablero en pequeño al lado, también", cerca(c), JSON.stringify(c));
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(200);
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 7, trazos: [MARCA, { h: "flecha", c: "rojo", p: [100, 100, 300, 200] }] } }));
  await page.waitForTimeout(200);
  cierto("el profe raya otra: le llega sin volver a cargar la lámina", await marcasEnPantalla(page) === 2 && (await imagen(page)).src === "07.webp");
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 8 } }));
  await esperarImagen(page, "08.webp");
  cierto("pasa de lámina: las marcas se van", await marcasEnPantalla(page) === 0);
  cierto("la alumna nunca escribió la presentación ni notas", await page.evaluate(() =>
    !window.__updates.some((x) => x.tabla === "game_state" && "presentacion" in x.campos) && !window.__inserts.some((i) => i.tabla === "presentacion_notas")));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();

  const pr = await abrir(browser, "u-profe", CLASE, { game_state: [fila({ presentacion: { deck: DECK, n: 7, trazos: [MARCA] } })] }, { ruta: "/sesion.html?proyector=1" });
  await pr.page.setViewportSize({ width: 1600, height: 900 });
  await esperarImagen(pr.page, "07.webp");
  await pr.page.waitForTimeout(200);
  c = await centroDeMarca(pr.page);
  cierto("en el proyector la marca se ve en su lugar", cerca(c), JSON.stringify(c));
  cierto("sin la pizarra ni las notas del profe", !(await seVe(pr.page, "#pizarra-btn")) && !(await seVe(pr.page, "#presentacion-nota")));
  cierto("sin errores en consola", pr.errores.length === 0, pr.errores.join(" | "));
  await pr.ctx.close();
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


/* Un PDF de verdad, chico, armado acá: una página por texto (Helvetica). */
function pdfDePrueba(textos) {
  const objs = [];
  const n = textos.length;
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push("<< /Type /Pages /Kids [" + textos.map((_, i) => (4 + i * 2) + " 0 R").join(" ") + "] /Count " + n + " >>");
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  textos.forEach((tx, i) => {
    const flujo = "BT /F1 48 Tf 60 300 Td (" + tx + ") Tj ET";
    objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Contents " + (5 + i * 2) + " 0 R /Resources << /Font << /F1 3 0 R >> >> >>");
    objs.push("<< /Length " + flujo.length + " >>\nstream\n" + flujo + "\nendstream");
  });
  let s = "%PDF-1.4\n";
  const pos = [];
  objs.forEach((o, i) => { pos.push(s.length); s += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
  const xref = s.length;
  s += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + pos.map((p) => String(p).padStart(10, "0") + " 00000 n \n").join("");
  s += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(s, "latin1");
}

/* El Storage de mentira: apunta lo que se sube, lo que se firma y lo que se
   borra, y firma con la imagen subida (o con una del curso, si la semilla trae
   una presentación que no se subió en esta prueba). */
const STORAGE = `
window.__subidas = []; window.__firmadas = []; window.__borradas = []; window.__blobs = {};
window.sb.storage = { from: (bucket) => ({
  upload: (ruta, blob, o) => {
    window.__subidas.push({ bucket, ruta, tipo: blob.type, tam: blob.size,
      filasAntes: window.__inserts.filter((i) => i.tabla === "presentaciones_profe").length });
    window.__blobs[ruta] = URL.createObjectURL(blob);
    return Promise.resolve({ data: { path: ruta }, error: null });
  },
  createSignedUrl: (ruta) => {
    window.__firmadas.push(ruta);
    return Promise.resolve({ data: { signedUrl: window.__blobs[ruta] || "/cursos/recursos/formacion-ajedrez/presentaciones/clase-01/0" + ruta.split("/").pop().replace(/\\D/g, "") + ".webp" }, error: null });
  },
  remove: (rutas) => { window.__borradas.push(...rutas); return Promise.resolve({ data: [], error: null }); },
}) };`;

async function pruebaSubida(browser) {
  console.log("\n7. El profe sube su PDF, lo elige, le guarda una posición y lo borra");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE,
    { game_state: [fila()], presentaciones_profe: [] }, { extra: STORAGE });
  await page.waitForSelector("#toggle-presentacion-btn", { state: "visible", timeout: 10000 });
  await page.click("#toggle-presentacion-btn");
  await page.waitForSelector("#presentacion-panel-vacia", { state: "visible", timeout: 5000 });
  cierto("sin presentaciones propias, lo dice", true);
  // A este profe no le compartieron «Formación Ajedrez»: no se la ofrece.
  await page.waitForSelector("#presentacion-panel-lista li:has-text('Ninguna compartida contigo')", { timeout: 5000 });
  cierto("las del curso, solo si se las compartieron (acá, ninguna)",
    !(await page.isVisible("#presentacion-panel-lista li:has-text('Formación Ajedrez')")));
  await page.setInputFiles("#presentacion-subir-archivo", { name: "charla.pdf", mimeType: "application/pdf",
    buffer: pdfDePrueba(["Hola mundo del arbitraje. Primera", "Segunda pagina con texto"]) });
  await page.fill("#presentacion-subir-titulo", "Mi charla");
  await page.click("#presentacion-subir-btn");
  await page.waitForFunction(() => /^Lista:/.test(document.getElementById("presentacion-subir-msg").textContent), null, { timeout: 30000 })
    .catch(() => {});
  cierto("el PDF se prepara y lo dice", /Lista: «Mi charla», 2 diapositivas/.test(await page.textContent("#presentacion-subir-msg")),
    await page.textContent("#presentacion-subir-msg"));
  const subidas = await page.evaluate(() => window.__subidas);
  const fila1 = await page.evaluate(() => (window.__inserts.find((i) => i.tabla === "presentaciones_profe") || {}).fila);
  cierto("una imagen por página, en su carpeta del bucket privado",
    subidas.length === 2 && subidas.every((s, i) => s.bucket === "presentaciones" && s.ruta === "u-profe/" + fila1.id + "/" + (i + 1) + "." + fila1.formato && s.tam > 1000),
    JSON.stringify(subidas));
  cierto("la fila se guarda DESPUÉS de subir las imágenes", subidas.every((s) => s.filasAntes === 0));
  cierto("con su título, sus páginas y el texto de cada una",
    fila1 && fila1.titulo === "Mi charla" && fila1.paginas === 2 && /Hola mundo del arbitraje/.test(fila1.textos[0]) && /Segunda pagina/.test(fila1.textos[1]),
    JSON.stringify(fila1 && Object.assign({}, fila1, { textos: fila1.textos })));
  const deck = "subida/" + fila1.id;
  await page.click("#presentacion-panel-mias li:has-text('Mi charla') button:has-text('Mostrar a la clase')");
  await page.waitForFunction(() => { const i = document.getElementById("presentacion-img"); return i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
  cierto("«Mostrar a la clase» manda la suya", JSON.stringify(await ultimaPresentacion(page)) === JSON.stringify({ deck, n: 1 }));
  cierto("con su título, y la diapositiva con su texto", (await page.textContent("#presentacion-titulo")) === "Mi charla"
    && /Hola mundo del arbitraje/.test(await page.textContent("#presentacion-texto"))
    && (await imagen(page)).alt === "Diapositiva 1: Hola mundo del arbitraje.", (await imagen(page)).alt);

  // Guardar en la diapositiva la posición del tablero, y quitarla.
  await page.click("#presentacion-posiciones button:has-text('Guardar aquí la posición del tablero')");
  await page.waitForTimeout(200);
  const pos = await page.evaluate(() => {
    const u = window.__updates.filter((x) => x.tabla === "presentaciones_profe");
    return u.length ? u[u.length - 1] : null;
  });
  cierto("«Guardar aquí la posición del tablero» la guarda en esa diapositiva",
    pos && JSON.stringify(pos.campos.posiciones) === JSON.stringify({ 1: [{ nombre: "Posición 1", fen: new Chess().fen() }] })
      && JSON.stringify(pos.donde) === JSON.stringify([["id", fila1.id]]), JSON.stringify(pos));
  cierto("y ya sale con su «Al tablero de la clase»", await page.isVisible("#presentacion-posiciones button:has-text('Al tablero de la clase')"));
  await page.click("#presentacion-posiciones button:has-text('Quitar')");
  await page.waitForTimeout(200);
  cierto("«✕ Quitar» la saca de la diapositiva", await page.evaluate(() => {
    const u = window.__updates.filter((x) => x.tabla === "presentaciones_profe");
    return JSON.stringify(u[u.length - 1].campos.posiciones) === "{}";
  }) && !(await page.isVisible("#presentacion-posiciones button:has-text('Al tablero de la clase')")));

  await page.click("#presentacion-siguiente");
  await page.waitForTimeout(300);
  cierto("▶ pasa a la 2 y se firma esa", (await page.textContent("#presentacion-cuenta")) === "Diapositiva 2 de 2"
    && (await page.evaluate(() => window.__firmadas)).includes("u-profe/" + fila1.id + "/2." + fila1.formato));

  await page.click("#toggle-presentacion-btn");
  await page.click("#presentacion-panel-mias li:has-text('Mi charla') button:has-text('Borrar')");
  await page.click("button:has-text('Borrar la presentación')");
  await page.waitForFunction(() => window.__deletes.some((d) => d.tabla === "presentaciones_profe"), null, { timeout: 5000 }).catch(() => {});
  cierto("borrarla la quita antes de la clase, borra sus imágenes y su fila",
    (await ultimaPresentacion(page)) === null
      && JSON.stringify(await page.evaluate(() => window.__borradas)) === JSON.stringify(subidas.map((s) => s.ruta))
      && await page.evaluate((id) => window.__deletes.some((d) => d.tabla === "presentaciones_profe" && JSON.stringify(d.donde) === JSON.stringify([["id", id]])), fila1.id));
  cierto("y deja de estar en la lista", !(await page.isVisible("#presentacion-panel-mias li:has-text('Mi charla')")));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

async function pruebaSubidaAlumna(browser) {
  console.log("\n8. La alumna ve la del profe: solo se le firma la que se muestra");
  const fila1 = { id: "0b8f6a2e-1111-4222-8333-944455556666", profesor_id: "u-profe", titulo: "Charla del profe", paginas: 3,
    formato: "webp", textos: ["Uno", "Dos: el texto de la segunda", "Tres"], posiciones: { 2: [{ nombre: "Posición 1", fen: new Chess().fen() }] } };
  const deck = "subida/" + fila1.id;
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE,
    { game_state: [fila({ presentacion: { deck, n: 2 } })], presentaciones_profe: [fila1] }, { extra: STORAGE });
  await page.waitForFunction(() => { const i = document.getElementById("presentacion-img"); return i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 });
  cierto("ve la diapositiva 2 de la charla, con su texto", (await page.textContent("#presentacion-cuenta")) === "Diapositiva 2 de 3"
    && (await page.textContent("#presentacion-titulo")) === "Charla del profe" && /el texto de la segunda/.test(await page.textContent("#presentacion-texto")));
  cierto("sin los botones ni las posiciones del profe", !(await seVe(page, "#presentacion-profe")));
  cierto("solo se le firmó la que se ve", JSON.stringify(await page.evaluate(() => window.__firmadas)) === JSON.stringify(["u-profe/" + fila1.id + "/2.webp"]),
    JSON.stringify(await page.evaluate(() => window.__firmadas)));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();
}


async function pruebaVistaLimpia(browser) {
  console.log("\n9. La vista limpia: el profe la enciende y al alumno le queda la diapositiva, el tablero y el chat");
  {
    const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila({ presentacion: { deck: DECK, n: 3 } })] });
    await esperarImagen(page, "03.webp");
    await page.click("#presentacion-limpia");
    cierto("«🧹 Vista limpia» la manda en la presentación", JSON.stringify(await ultimaPresentacion(page)) === JSON.stringify({ deck: DECK, n: 3, limpia: true }));
    cierto("y el botón dice que está encendida", (await page.getAttribute("#presentacion-limpia", "aria-pressed")) === "true");
    cierto("al profe no se le aplica: él sigue con todo", !(await page.evaluate(() => document.documentElement.classList.contains("vista-limpia")))
      && await seVe(page, "#teacher-toolbar"));
    await page.click("#presentacion-siguiente");
    await esperarImagen(page, "04.webp");
    cierto("pasar la diapositiva no la apaga", JSON.stringify(await ultimaPresentacion(page)) === JSON.stringify({ deck: DECK, n: 4, limpia: true }));
    await page.click("#presentacion-limpia");
    cierto("apagarla la saca de la presentación", JSON.stringify(await ultimaPresentacion(page)) === JSON.stringify({ deck: DECK, n: 4 }));
    cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
    await ctx.close();
  }
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ presentacion: { deck: DECK, n: 29, limpia: true } })] });
  await page.setViewportSize({ width: 1440, height: 900 });
  await esperarImagen(page, "29.webp");
  cierto("la alumna queda en vista limpia", await page.evaluate(() => document.documentElement.classList.contains("vista-limpia")));
  cierto("sin encabezado, título, columna lateral ni lista de jugadas",
    !(await seVe(page, "#header")) && !(await seVe(page, "#status-banner")) && !(await seVe(page, "#herramientas-profe")) && !(await seVe(page, "#moves-panel")));
  cierto("con el tablero, «Levantar la mano» y el chat", await seVe(page, "#chessboard") && await seVe(page, "#raise-hand-btn") && await seVe(page, "#chat-caja"));
  const cajas = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const a = r("presentacion-caja"), b = r("chessboard"), c = r("chat-caja");
    return { lamina: [a.left, a.right, a.top, a.bottom], tablero: [b.left, b.top], chat: [c.left, c.right, c.top] };
  });
  cierto("la diapositiva a la izquierda, el tablero a la derecha y el chat abajo, a lo ancho",
    cajas.lamina[1] <= cajas.tablero[0] && cajas.tablero[1] < 200 && cajas.chat[2] >= cajas.lamina[3]
      && cajas.chat[0] <= cajas.lamina[0] + 1 && cajas.chat[1] > cajas.tablero[0], JSON.stringify(cajas));
  // Con la máquina cargada, el aviso de la diapositiva (que llega cuando carga
  // la imagen) puede pisar al de la vista limpia antes de leerlo: con la lámina
  // ya a la vista, el profe la apaga y la vuelve a encender, y se lee ese.
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 29 } }));
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 29, limpia: true } }));
  await page.waitForFunction(() => /vista limpia/.test(document.getElementById("clase-voz").textContent), null, { timeout: 5000 }).catch(() => {});
  cierto("y se le dice en voz", /vista limpia/.test(await page.textContent("#clase-voz")));
  const encima = await page.evaluate(() => {
    const c = document.getElementById("calentamiento-caja");
    c.hidden = false;
    const s = getComputedStyle(c), q = getComputedStyle(document.getElementById("question-card"));
    const r = { cal: [s.position, +s.zIndex], pregunta: [q.position, +q.zIndex] };
    c.hidden = true;
    return r;
  });
  cierto("el calentamiento le sale encima, y las preguntas por encima de todo",
    encima.cal[0] === "fixed" && encima.cal[1] >= 45 && encima.pregunta[0] === "fixed" && encima.pregunta[1] > encima.cal[1], JSON.stringify(encima));
  await page.evaluate(() => document.documentElement.classList.add("adaptive-mode"));
  cierto("con el Modo Adaptado no se aplica (vuelve el encabezado)", await seVe(page, "#header"));
  await page.evaluate(() => document.documentElement.classList.remove("adaptive-mode"));
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 29 } }));
  await page.waitForTimeout(200);
  cierto("el profe la apaga: vuelve todo", !(await page.evaluate(() => document.documentElement.classList.contains("vista-limpia"))) && await seVe(page, "#header"));
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 29, limpia: true } }));
  await page.waitForTimeout(200);
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: null }));
  await page.waitForTimeout(200);
  cierto("y si quita la presentación, también", !(await page.evaluate(() => document.documentElement.classList.contains("vista-limpia"))));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate((v) => window.__cambioEnBase("game_state", v), fila({ presentacion: { deck: DECK, n: 29, limpia: true } }));
  await esperarImagen(page, "29.webp");
  cierto("en el celular, una columna que cabe", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth
    && document.getElementById("presentacion-caja").getBoundingClientRect().bottom <= document.getElementById("chessboard").getBoundingClientRect().top));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();
}


async function pruebaTableroMini(browser) {
  console.log("\n10. En pantalla completa, el tablero de la clase en pequeño");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ presentacion: { deck: DECK, n: 18 } })] });
  await page.setViewportSize({ width: 1600, height: 900 });
  await esperarImagen(page, "18.webp");
  cierto("fuera de la pantalla completa no hay mini tablero ni su botón",
    !(await seVe(page, "#presentacion-mini")) && !(await seVe(page, "#presentacion-mini-btn")));
  await page.click("#presentacion-completa");
  await page.waitForFunction(() => document.fullscreenElement && document.fullscreenElement.id === "presentacion-caja", null, { timeout: 5000 });
  await page.waitForTimeout(200);
  cierto("a pantalla completa sale abajo a la derecha", await page.evaluate(() => {
    const m = document.getElementById("presentacion-mini"), r = m.getBoundingClientRect();
    return m.checkVisibility() && r.right > innerWidth * 0.75 && r.bottom > innerHeight * 0.75 && r.width > 100;
  }));
  await page.evaluate((v) => window.__cambioEnBase("game_state", v),
    fila({ moves: ["e4", "e5", "Nf3"], last_move: "Nf3", arrows: [{ from: "f8", to: "c5", color: "green" }], presentacion: { deck: DECK, n: 18 } }));
  await page.waitForTimeout(300);
  const mini = await page.evaluate(() => {
    const m = document.getElementById("presentacion-mini");
    const sq = m.querySelector('[data-square="f3"]');
    return { f3: sq && sq.getAttribute("aria-label"), flecha: !!m.querySelector("svg.marks-overlay *"), ids: m.querySelectorAll("[id]").length };
  });
  cierto("copia en vivo la jugada y la flecha del profe, sin ids repetidos",
    /caballo blanco/.test(mini.f3 || "") && mini.flecha && mini.ids === 0, JSON.stringify(mini));
  cierto("la lámina le deja su lugar: no se tapan", await page.evaluate(() =>
    document.getElementById("presentacion-img").getBoundingClientRect().right <= document.getElementById("presentacion-mini").getBoundingClientRect().left));
  const contraste = await page.evaluate(() => getComputedStyle(document.getElementById("presentacion-titulo")).color);
  cierto("el título se lee sobre el fondo oscuro", contraste === "rgb(241, 245, 249)", contraste);
  await page.click("#presentacion-mini-btn");
  cierto("«Ocultar el tablero» lo oculta y el botón ofrece volver a verlo",
    !(await seVe(page, "#presentacion-mini")) && /Ver el tablero/.test(await page.textContent("#presentacion-mini-btn")));
  await page.click("#presentacion-mini-btn");
  cierto("y «Ver el tablero» lo trae de vuelta", await seVe(page, "#presentacion-mini"));
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(200);
  cierto("al salir de la pantalla completa se va", !(await seVe(page, "#presentacion-mini")));
  cierto("sin errores en consola", errores.length === 0, errores.join(" | "));
  await ctx.close();
}

(async () => {
  try { datos(); } catch (e) { cierto("los datos se pudieron leer", false, e && e.stack); }
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaPizarra(browser);
    await pruebaPizarraClase(browser);
    await pruebaAlumna(browser);
    await pruebaProyector(browser);
    await pruebaSubida(browser);
    await pruebaSubidaAlumna(browser);
    await pruebaVistaLimpia(browser);
    await pruebaTableroMini(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: la presentación se ve en la clase.");
  process.exit(fallos ? 1 : 0);
})();
