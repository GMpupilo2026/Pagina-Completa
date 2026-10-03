#!/usr/bin/env node
/* Los entrenamientos, en la clase (sesion.html, pestaña «🧠 Entrenamientos»,
   js/clase-entrenamientos.js).

   - La lista sale de MaterialPlataforma.HERRAMIENTAS: cada tarjeta del hub
     (entreno/index.html) tiene que estar ahí, o no llegaría a la clase. Así
     un entrenamiento nuevo entra solo.
   - Cada entrenamiento con ejercicios los carga, y cada ejercicio que ofrece
     «Al tablero» tiene una posición que el tablero de la clase acepta, y cada
     solución se juega con chess.js (los de Mates terminan en mate).
   - Las puertas: «Al tablero» transmite la posición, «Preguntar» crea la
     pregunta (la de opciones, con su correcta en la base), «Que lo
     practiquen» manda el calentamiento con su banco y su filtro, y el alumno
     arma sus ejercicios de ese banco.
   - «Que lo abran todos»: viaja el slug en la presencia del profe y el alumno
     arma el enlace de la lista (nunca de lo que viene escrito).

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-entrenamientos.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const RAIZ = path.join(__dirname, "..");
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (extra) => Object.assign({ id: 7, owner_id: "u-profe", fen: INICIO, moves: [], start_fen: INICIO, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, encuesta: null, calentamiento: null,
  podio: null, equipos: null, tanda_calentamiento: null }, extra || {});

function laParteQueNoTocaLaPagina() {
  console.log("\n=== La lista: la misma del sitio ===");
  global.window = {};
  global.Chess = require("chess.js").Chess;
  eval(fs.readFileSync(path.join(RAIZ, "js", "material-plataforma.js"), "utf8"));
  const s = fs.readFileSync(path.join(RAIZ, "js", "clase-entrenamientos.js"), "utf8");
  const i = s.indexOf("window.EntrenosClase"), j = s.indexOf("})();", i) + 5;
  eval(s.slice(i, j));
  const H = global.window.MaterialPlataforma.HERRAMIENTAS, E = global.window.EntrenosClase;

  // Cada tarjeta del hub está en la lista (si no, no llega a la clase).
  const hub = fs.readFileSync(path.join(RAIZ, "entreno", "index.html"), "utf8");
  const tarjetasHub = [...hub.matchAll(/<h3[^>]*><a href="([^"]+)"/g)].map((m) => "entreno/" + m[1]);
  const enLista = new Set(H.map((h) => h.href));
  igual("cada tarjeta de entreno/index.html está en MaterialPlataforma.HERRAMIENTAS", tarjetasHub.filter((h) => !enLista.has(h)), []);
  igual("el hub tiene tarjetas (la expresión las encuentra)", tarjetasHub.length >= 12, true);

  const t = E.tarjetas(H, { mates: {} });
  igual("todas las del hub menos Táctica (que tiene su pestaña) están en la clase",
    tarjetasHub.filter((h) => h !== "entreno/temas.html" && !t.some((x) => x.href === h)), []);
  igual("no van los diagnósticos, los cuestionarios ni el plan contra un rival",
    t.filter((x) => ["diagnostico", "arbitraje", "cuestionario", "plan-rival", "temas"].includes(x.slug)).length, 0);
  igual("un entrenamiento nuevo en la lista aparece solo (con «que lo abran»)",
    E.tarjetas(H.concat([{ slug: "nuevo", label: "Nuevo", href: "entreno/nuevo.html" }]), {}).some((x) => x.slug === "nuevo" && !x.conLista), true);
  igual("el enlace sale de la lista", E.enlaceDe(H, "mates"), { href: "entreno/mates.html", label: "Mates" });
  igual("con su recorte", E.enlaceDe(H, "aperturas", "fianchetto").href, "entreno/aperturas.html?linea=fianchetto");
  igual("un slug que no está, o que queda afuera, no da enlace", [E.enlaceDe(H, "https://otro.sitio"), E.enlaceDe(H, "diagnostico")], [null, null]);
  igual("las jugadas del alumno en una solución", [E.pliesDe(["Qxg7#"]), E.pliesDe(["a", "b", "c"]), E.pliesDe(null)], [1, 2, 1]);
  igual("la posición después de una línea", E.posicionTras(null, ["e4", "e5"], 2).split(" ")[0], "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR");
  igual("una línea que no se reproduce da null", E.posicionTras(null, ["e5"], 1), null);
}

async function pruebaDelProfe(browser) {
  console.log("\n=== El profe: cada entrenamiento con sus ejercicios, y las puertas ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.setViewportSize({ width: 1300, height: 1000 });
  await page.evaluate(() => {
    window.__ponerPresencia("u-ana", { email: "ana@x.cr", full_name: "Ana Rojas", role: "alumno" });
    activateTeacherTab("tipos");
  });
  await page.waitForSelector("#entrenos-body [data-entreno]");
  igual("la pestaña se llama Entrenamientos", (await page.textContent("#teacher-tab-tipos")).trim(), "🧠 Entrenamientos");
  const slugs = await page.$$eval("#entrenos-body [data-entreno]", (b) => b.map((x) => x.dataset.entreno));
  igual("están los que pidieron", ["mates", "aprender", "coordenadas", "desafios", "estudio", "aperturas", "4x4", "visualizacion",
    "precision-posicional", "finales", "memoria", "tipos"].filter((x) => !slugs.includes(x)), []);

  /* Todos los ejercicios de todos los entrenamientos con lista: la posición
     la acepta el tablero de la clase y la solución se juega. */
  const revision = await page.evaluate(async () => {
    const out = { ejercicios: 0, malos: [], sinGrupos: [] };
    for (const slug of Object.keys(ADAPTADORES_ENTRENO)) {
      const grupos = await ADAPTADORES_ENTRENO[slug].cargar();
      if (!grupos.length || !grupos.every((g) => g.items.length)) out.sinGrupos.push(slug);
      for (const g of grupos) for (const it of g.items) {
        out.ejercicios += 1;
        if (!it.fen) { out.malos.push(slug + "/" + it.id + ": sin posición"); continue; }
        if (!it.foto) {
          const m = motivoPosicionInvalida(it.fen);
          if (m) { out.malos.push(slug + "/" + it.id + ": " + m); continue; }
        }
        if (it.solucion) {
          const g2 = new Chess(it.fenClave || it.fen);
          for (const san of it.solucion) { if (!g2.move(san, { sloppy: true })) { out.malos.push(slug + "/" + it.id + ": " + san + " no se juega"); break; } }
          if (slug === "mates" && !g2.in_checkmate()) out.malos.push(slug + "/" + it.id + ": no termina en mate");
        }
        if (it.opciones && !(it.correcta >= 0 && it.correcta < it.opciones.length)) out.malos.push(slug + "/" + it.id + ": la correcta no es una opción");
      }
    }
    return out;
  });
  igual("cada entrenamiento con lista trae sus grupos con ejercicios", revision.sinGrupos, []);
  igual("revisados más de 3000 ejercicios", revision.ejercicios > 3000, true);
  igual("cada posición la acepta el tablero de la clase y cada solución se juega", revision.malos.slice(0, 10), []);

  // Mates → Mate en 2: «Al tablero» y «Preguntar».
  await page.click('#entrenos-body [data-entreno="mates"]');
  await page.click('#entrenos-body [data-grupo="mate2"]');
  await page.waitForSelector("#entrenos-body li");
  const primero = await page.evaluate(async () => (await ADAPTADORES_ENTRENO.mates.cargar()).find((g) => g.id === "mate2").items[0]);
  igual("las migas dicen dónde está", await page.$$eval("#entrenos-body .entreno-migas button", (b) => b.map((x) => x.textContent)), ["‹ Entrenamientos", "‹ Mates"]);
  igual("de a 30, con «Mostrar más»", [await page.$$eval("#entrenos-body li", (l) => l.length), /Mostrar 30 más/.test(await page.textContent("#entrenos-body"))], [30, true]);
  await page.locator("#entrenos-body li").first().getByRole("button", { name: "Al tablero" }).click();
  await page.waitForFunction((f) => window.__updates.some((u) => u.tabla === "game_state" && u.campos.fen === f), primero.fen, { timeout: 5000 });
  igual("«Al tablero» transmite la posición", true, true);
  await page.locator("#entrenos-body li").first().getByRole("button", { name: "Preguntar" }).click();
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "questions"), null, { timeout: 5000 });
  const q = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "questions").slice(-1)[0].fila);
  igual("«Preguntar» crea la pregunta con su posición y las jugadas del alumno (mate en 2: 2)", [q.fen, q.expected_plies], [primero.fen, 2]);

  // La vista previa y el guion (solo el profe).
  await page.evaluate(() => { activateTeacherTab("tipos"); entrenosView = { slug: "mates", grupo: "mate1", mostrar: 30 }; pintarEntrenos(); });
  await page.waitForSelector("#entrenos-body li");
  const li = page.locator("#entrenos-body li").first();
  await li.getByRole("button", { name: "Guion" }).click();
  igual("el guion trae la solución", /La solución: /.test(await li.textContent()), true);
  await li.getByRole("button", { name: "Vista previa" }).click();
  await page.waitForFunction(() => document.querySelector("#entrenos-body li .example-board"), null, { timeout: 5000 });
  igual("la vista previa dibuja el tablero", true, true);

  // «Que lo practiquen»: el calentamiento con los de Mate en 1, en competencia.
  await page.selectOption("#entrenos-body select", "reto");
  await page.fill('#entrenos-body input[type="number"]', "4");
  await page.click('#entrenos-body [data-practicar="1"]');
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.tanda_calentamiento), null, { timeout: 15000 });
  const t = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.tanda_calentamiento).slice(-1)[0].campos.tanda_calentamiento);
  igual("manda el calentamiento con su banco, su filtro y su título", [t.banco, t.filtro, t.titulo, t.modo, t.segundos], ["mates", "cat:mate1", "Mate en 1", "reto", 240]);
  igual("con el nivel de esos ejercicios", t.elo >= 800 && t.elo <= 1100, true);

  // Precisión posicional: pregunta de opciones, con la correcta en la base.
  await page.evaluate(() => { activateTeacherTab("tipos"); entrenosView = { slug: "precision-posicional", grupo: "mejorar_pieza", mostrar: 30 }; pintarEntrenos(); });
  await page.waitForSelector("#entrenos-body li");
  const pp = await page.evaluate(() => window.PRECISION_POSICIONAL_ITEMS.find((i) => i.area === "mejorar_pieza"));
  await page.locator("#entrenos-body li").first().getByRole("button", { name: "Preguntar" }).click();
  await page.waitForFunction(() => (window.__rpcs || []).some((r) => r.n === "hacer_pregunta_de_opciones"), null, { timeout: 5000 });
  const rpc = await page.evaluate(() => window.__rpcs.filter((r) => r.n === "hacer_pregunta_de_opciones").slice(-1)[0].args);
  igual("Precisión: pregunta de opciones con su correcta", [rpc.p_prompt, rpc.p_opciones.length, rpc.p_correcta, rpc.p_fen], [pp.enunciado, 4, pp.correcta, pp.fen]);

  // Habilidades: la cascada de siempre.
  await page.evaluate(() => { activateTeacherTab("tipos"); entrenosView = { slug: null, grupo: null, mostrar: 30 }; pintarEntrenos(); });
  await page.click('#entrenos-body [data-entreno="tipos"]');
  await page.waitForSelector("#tipos-body button");
  igual("Habilidades abre sus diecinueve", await page.$$eval("#tipos-body > div > button", (b) => b.length), 19);

  // Coordenadas: se hace en su página → «Que lo abran todos».
  await page.evaluate(() => { entrenosView = { slug: null, grupo: null, mostrar: 30 }; pintarEntrenos(); });
  igual("Habilidades se esconde al volver", await seVe(page, "#tipos-body"), false);
  await page.click('#entrenos-body [data-entreno="coordenadas"]');
  await page.locator("#entrenos-body").getByRole("button", { name: "Que lo abran todos" }).click();
  const meta = await page.evaluate(() => window.__tracks.slice(-1)[0].entreno);
  igual("«Que lo abran todos» va en la presencia del profe: el slug, no la dirección", [meta.slug, meta.href], ["coordenadas", undefined]);
  igual("el profe ve que lo está pidiendo", [await seVe(page, "#entreno-pedido"), await page.textContent("#entreno-pedido-texto")],
    [true, "Tus alumnos ven el botón para abrir «Coordenadas»."]);
  await page.click("#entreno-pedido-quitar");
  igual("y lo deja de pedir", [await seVe(page, "#entreno-pedido"), await page.evaluate(() => window.__tracks.slice(-1)[0].entreno)], [false, undefined]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaDelAlumno(browser) {
  console.log("\n=== El alumno: el calentamiento de Mates y el botón para abrir ===");
  const tanda = { at: new Date().toISOString(), semilla: "mates123", elo: 950, cantidad: 20, segundos: 300, alumnos: ["u-ana"], banco: "mates", filtro: "cat:mate1", titulo: "Mate en 1" };
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ tanda_calentamiento: tanda })] });
  await page.waitForFunction(() => tandaMia && tandaMia.ejercicios.length && document.getElementById("tanda-tablero").checkVisibility(), null, { timeout: 20000 });
  const ejs = await page.evaluate(() => tandaMia.ejercicios);
  const mates = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno", "data", "mates.json"), "utf8"));
  const mate1 = new Set(mates.filter((m) => m.category === "mate1").map((m) => m.id));
  igual("sus 20 ejercicios son de Mate en 1", [ejs.length, ejs.every((e) => mate1.has(e.id))], [20, true]);
  igual("la caja dice de qué es", await page.textContent("#tanda-titulo"), "🔥 Calentamiento: Mate en 1");
  // Lo resuelve: con la de la solución, mate.
  await page.evaluate((u) => tandaBoard.jugar({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || undefined }), ejs[0].uci[0]);
  await page.waitForFunction(() => /llevas 1 bien/.test(document.getElementById("tanda-estado").textContent), null, { timeout: 6000 });
  igual("el mate cuenta", true, true);

  igual("sin pedido, no hay aviso", await seVe(page, "#entreno-aviso"), false);
  // El profe pide abrir Aperturas, en una línea. Un pedido de otro (no del profe de la clase) no cuenta.
  await page.evaluate(() => window.__ponerPresencia("u-beto", { role: "alumno", full_name: "Beto", entreno: { slug: "coordenadas", at: "x" } }));
  igual("lo que anuncia otro alumno no abre nada", await seVe(page, "#entreno-aviso"), false);
  await page.evaluate(() => window.__ponerPresencia("u-profe", { role: "profesor", full_name: "Profe", entreno: { slug: "aperturas", recorte: "italiana", at: new Date().toISOString() } }));
  await page.waitForFunction(() => document.getElementById("entreno-aviso").checkVisibility(), null, { timeout: 5000 });
  igual("le aparece el botón, con el enlace armado de la lista",
    [await page.textContent("#entreno-aviso-texto"), await page.getAttribute("#entreno-aviso-abrir", "href"), await page.getAttribute("#entreno-aviso-abrir", "target")],
    ["Tu profe te pide abrir «Aperturas y celadas».", "entreno/aperturas.html?linea=italiana", "_blank"]);
  await page.click("#entreno-aviso-cerrar");
  igual("lo cierra", await seVe(page, "#entreno-aviso"), false);
  await page.evaluate(() => window.__ponerPresencia("u-profe", { role: "profesor", full_name: "Profe", entreno: { slug: "fuera", at: "y" } }));
  igual("un slug que no está en la lista no muestra nada", await seVe(page, "#entreno-aviso"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  laParteQueNoTocaLaPagina();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaDelProfe(browser);
    await pruebaDelAlumno(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: todos los entrenamientos llegan a la clase, con sus ejercicios y sus puertas.");
  process.exit(fallos ? 1 : 0);
})();
