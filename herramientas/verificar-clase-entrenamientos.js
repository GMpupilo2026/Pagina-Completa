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
   - «Abrirlo a todos en una ventana»: viaja el slug en la presencia del profe,
     y a cada alumno se le abre una ventana encima de la clase con la página
     del entrenamiento en un marco (?en-clase=1), con el enlace armado de la
     lista (nunca de lo que viene escrito). Se abre sola una vez; si la
     cierra, el aviso le deja volver; si el profe la cierra, se cierra.
   - El modo «en clase» de las páginas (js/main.js): dentro de un marco, sin
     encabezado, migas ni pie; abierta sola, la página es la de siempre.

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
        if (it.soloVer) {
          // Solo se ve: tiene que ser de verdad una que el tablero de la clase no acepta,
          // y no traer nada que la mande ahí.
          if (!motivoPosicionInvalida(it.fen)) out.malos.push(slug + "/" + it.id + ": la posición es válida y no va al tablero");
          if (it.solucion || it.opciones) out.malos.push(slug + "/" + it.id + ": solo se ve, pero trae para preguntarla");
          continue;
        }
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

  /* Desafíos: van TODOS, numerados desde el 1 dentro de su tema. Antes solo los que
     tenían los dos reyes, con el número del cuaderno entero: «Carrera a la
     coronación» mostraba 4 de 42 y empezaba en el 73. */
  const desafios = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno", "data", "desafios.json"), "utf8"));
  const deCoronacion = desafios.challenges.filter((x) => x.cat === "promocion").length;
  await page.evaluate(() => { activateTeacherTab("tipos"); entrenosView = { slug: "desafios", grupo: "promocion", mostrar: 100 }; pintarEntrenos(); });
  await page.waitForSelector("#entrenos-body li");
  const filasDesafio = await page.$$eval("#entrenos-body li", (l) => l.map((x) => ({
    titulo: x.querySelector("p").textContent,
    botones: [...x.querySelectorAll("button")].map((b) => b.textContent),
  })));
  igual("Desafíos → Carrera a la coronación: están todos", [filasDesafio.length, deCoronacion > 4], [deCoronacion, true]);
  // Y lo mismo en cada tema: todos los del archivo, del 1 al último, sin saltos.
  const porTema = await page.evaluate(async () => (await ADAPTADORES_ENTRENO.desafios.cargar())
    .map((g) => [g.id, g.items.length, g.items.map((it) => it.titulo.split(".")[0]).join(",")]));
  igual("Desafíos: cada tema con todos sus ejercicios, numerados del 1 sin saltos",
    porTema, desafios.categories.map((c) => {
      const n = desafios.challenges.filter((x) => x.cat === c.id).length;
      return [c.id, n, Array.from({ length: n }, (_, i) => String(i + 1)).join(",")];
    }));
  igual("numerados desde el 1", filasDesafio.slice(0, 2).map((f) => f.titulo.split(".")[0]), ["1", "2"]);
  const sinReyes = filasDesafio.filter((f) => !f.botones.some((b) => /Al tablero/.test(b)));
  igual("los que no tienen reyes: vista previa, ventana y guion, sin tablero ni pregunta",
    [sinReyes.length > 0, sinReyes.every((f) => f.botones.some((b) => /Vista previa/.test(b)) && f.botones.some((b) => /Que la practiquen/.test(b))
      && f.botones.some((b) => /Guion/.test(b)) && !f.botones.some((b) => /Preguntar|Calentamiento/.test(b)))], [true, true]);
  igual("«Que la practiquen» de un desafío abre ESE desafío, no la sección",
    await page.evaluate(() => EntrenosClase.enlaceDe(herramientasDelSitio(), "desafios", "73").href), "entreno/desafios.html?n=73");
  await page.locator("#entrenos-body li").first().getByRole("button", { name: "Que la practiquen" }).click();
  const pedido = await page.evaluate(() => window.__tracks.slice(-1)[0].entreno);
  igual("y el botón pide el desafío de la fila (el 1 de coronación es el n.º 1 del cuaderno)", [pedido.slug, pedido.recorte], ["desafios", "1"]);
  await page.click("#entreno-pedido-quitar");
  const k = filasDesafio.findIndex((f) => !f.botones.some((b) => /Al tablero/.test(b)));
  await page.locator("#entrenos-body li").nth(k).getByRole("button", { name: "Vista previa" }).click();
  await page.waitForFunction((k) => document.querySelectorAll("#entrenos-body li")[k].querySelector(".example-board"), k, { timeout: 5000 });
  igual("la vista previa de uno sin reyes dibuja el tablero", true, true);

  /* Aprender: «¿Jaque mate o ahogado?» tiene dos posiciones y en la clase solo iba
     la primera. Van las dos, como pregunta de opciones, y la respuesta la confirma
     chess.js (la correcta es mate si hay mate, ahogado si hay ahogado). */
  const quiz = await page.evaluate(async () => {
    const grupos = await ADAPTADORES_ENTRENO.aprender.cargar();
    const lecciones = window.AprenderLecciones.LESSONS;
    const enClase = grupos.flatMap((g) => g.items);
    const rondas = lecciones.reduce((n, l) => n + (l.type === "quiz" ? l.rounds.length : 1), 0);
    const malos = enClase.filter((it) => it.opciones).filter((it) => {
      const g = new Chess(it.fen);
      const debe = g.in_checkmate() ? "Jaque mate" : g.in_stalemate() ? "Ahogado" : null;
      return !debe || it.opciones[it.correcta] !== debe;
    }).map((it) => it.id);
    return [enClase.length === rondas, enClase.filter((it) => it.opciones).length, malos];
  });
  igual("Aprender: cada posición de cada lección, y las de mate o ahogado bien contestadas", quiz, [true, 2, []]);

  /* Visualización: los de táctica de la casa no traen rating. Antes salían «ELO
     undefined», metidos en cualquier lugar (restar undefined da NaN). Van al
     final, como en su página, y cada nivel trae todos los de su largo. */
  const vis = await page.evaluate(async () => {
    const grupos = await ADAPTADORES_ENTRENO.visualizacion.cargar();
    const datos = await temasParaEntrenos();
    return grupos.map((g) => {
      const elos = g.items.map((it) => it.elo);
      const conRating = g.items.filter((it) => /^\d+\. ELO \d+/.test(it.titulo)).map((it) => it.elo);
      const primerSin = g.items.findIndex((it) => /Sin ELO/.test(it.titulo));
      return [g.id,
        g.items.length === Object.keys(TandaCalentamiento.filtrar(datos.puzzles, "largo:" + g.id)).length,
        g.items.some((it) => /undefined|NaN/.test(it.titulo)) || elos.some((e) => typeof e !== "number" || !isFinite(e)),
        conRating.every((e, i) => !i || conRating[i - 1] <= e),
        primerSin === -1 || g.items.slice(primerSin).every((it) => /Sin ELO/.test(it.titulo))];
    });
  });
  igual("Visualización: todos, de fácil a difícil, los sin rating al final y sin «undefined»",
    vis, ["l1", "l2", "l3", "l4", "l5"].map((id) => [id, true, false, true, true]));
  // Finales: los del archivo, todos.
  const finales = await page.evaluate(async () => (await ADAPTADORES_ENTRENO.finales.cargar())[0].items.length);
  igual("Finales: están todos los del archivo", finales,
    JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno", "data", "finales.json"), "utf8")).finales.length);

  /* Memoria: todas las posiciones del banco (antes 8 de cada cantidad de piezas,
     240 de 1200). Aperturas: todas las líneas, cada una en su grupo. */
  const memoriaBanco = JSON.parse(fs.readFileSync(path.join(RAIZ, "entreno", "data", "memoria.json"), "utf8"));
  const memoria = await page.evaluate(async () => {
    const grupos = await ADAPTADORES_ENTRENO.memoria.cargar();
    const ids = grupos.flatMap((g) => g.items.map((it) => it.id));
    return [ids.length, new Set(ids).size, grupos.every((g) => g.items.every((it, i) => it.titulo.startsWith((i + 1) + ". ")))];
  });
  const enBanco = Object.values(memoriaBanco.porPiezas).reduce((n, l) => n + l.length, 0);
  igual("Memoria: todas las posiciones del banco, sin repetir y numeradas", memoria, [enBanco, enBanco, true]);
  const aperturas = await page.evaluate(async () => {
    const grupos = await ADAPTADORES_ENTRENO.aperturas.cargar();
    return [grupos.reduce((n, g) => n + g.items.length, 0), window.AperturasLineas.LINEAS.length];
  });
  igual("Aperturas: todas las líneas (aperturas y celadas)", aperturas[0], aperturas[1]);
  // Estudio y Precisión posicional: cada ficha y cada posición del banco, en su grupo.
  const otros = await page.evaluate(async () => {
    const est = await ADAPTADORES_ENTRENO.estudio.cargar();
    const pp = await ADAPTADORES_ENTRENO["precision-posicional"].cargar();
    const n = (g) => g.reduce((k, x) => k + x.items.length, 0);
    return [[n(est), window.FichasEstudio.FICHAS.length], [n(pp), window.PRECISION_POSICIONAL_ITEMS.length]];
  });
  igual("Estudio y Precisión posicional: todas las fichas y todas las posiciones", otros.map(([a, b]) => a === b && b > 0), [true, true]);

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

  // Coordenadas: tiene su propio tablero → «Abrirlo a todos en una ventana».
  await page.evaluate(() => { entrenosView = { slug: null, grupo: null, mostrar: 30 }; pintarEntrenos(); });
  igual("Habilidades se esconde al volver", await seVe(page, "#tipos-body"), false);
  await page.click('#entrenos-body [data-entreno="coordenadas"]');
  // Un botón por modo: a cada alumno se le abre ya jugando ese.
  await page.locator("#entrenos-body").getByRole("button", { name: "10 segundos por casilla" }).click();
  const conModo = await page.evaluate(() => window.__tracks.slice(-1)[0].entreno);
  igual("Coordenadas: el botón de un modo pide ese modo, y el enlace arranca jugando", [conModo.slug, conModo.recorte,
    await page.evaluate(() => EntrenosClase.enlaceDe(herramientasDelSitio(), "coordenadas", "mode10").href)],
    ["coordenadas", "mode10", "entreno/coordenadas.html?ronda=mode10"]);
  await page.click("#entreno-pedido-quitar");
  // 4×4: un botón por nivel.
  await page.evaluate(() => { entrenosView = { slug: "4x4", grupo: null, mostrar: 30 }; pintarEntrenos(); });
  await page.locator("#entrenos-body").getByRole("button", { name: "Avanzado" }).click();
  const nivel4 = await page.evaluate(() => window.__tracks.slice(-1)[0].entreno);
  igual("4×4: el botón de un nivel pide ese nivel", [nivel4.slug, nivel4.recorte,
    await page.evaluate(() => EntrenosClase.enlaceDe(herramientasDelSitio(), "4x4", "AVANZADO").href)],
    ["4x4", "AVANZADO", "entreno/4x4.html?nivel=AVANZADO"]);
  await page.click("#entreno-pedido-quitar");
  await page.evaluate(() => { entrenosView = { slug: "coordenadas", grupo: null, mostrar: 30 }; pintarEntrenos(); });
  await page.locator("#entrenos-body").getByRole("button", { name: "Abrirlo a todos en una ventana" }).click();
  const meta = await page.evaluate(() => window.__tracks.slice(-1)[0].entreno);
  igual("«Abrirlo a todos» va en la presencia del profe: el slug, no la dirección", [meta.slug, meta.href], ["coordenadas", undefined]);
  igual("el profe ve que lo está pidiendo", [await seVe(page, "#entreno-pedido"), await page.textContent("#entreno-pedido-texto")],
    [true, "Tus alumnos tienen abierto «Coordenadas» en una ventana encima de la clase."]);
  await page.click("#entreno-pedido-quitar");
  igual("«Cerrar la ventana a todos» lo saca de la presencia", [await seVe(page, "#entreno-pedido"), await page.evaluate(() => window.__tracks.slice(-1)[0].entreno)], [false, undefined]);
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

  igual("sin pedido, no hay aviso ni ventana", [await seVe(page, "#entreno-aviso"), await seVe(page, "#entreno-ventana")], [false, false]);
  // Un pedido de otro (no del profe de la clase) no cuenta.
  await page.evaluate(() => window.__ponerPresencia("u-beto", { role: "alumno", full_name: "Beto", entreno: { slug: "coordenadas", at: "x" } }));
  igual("lo que anuncia otro alumno no abre nada", [await seVe(page, "#entreno-aviso"), await seVe(page, "#entreno-ventana")], [false, false]);
  // El profe abre Coordenadas a todos: al alumno se le abre la ventana, sola.
  await page.evaluate(() => window.__ponerPresencia("u-profe", { role: "profesor", full_name: "Profe", entreno: { slug: "coordenadas", at: new Date().toISOString() } }));
  await page.waitForFunction(() => document.getElementById("entreno-ventana").checkVisibility(), null, { timeout: 5000 });
  igual("se le abre la ventana encima de la clase, con la página en su modo «en clase» (armada de la lista)",
    [await page.getAttribute("#entreno-ventana-marco", "src"), await page.textContent("#entreno-ventana-titulo"),
      await page.getAttribute("#entreno-ventana-marco", "title"), await page.getAttribute("#entreno-ventana-pestana", "href")],
    ["entreno/coordenadas.html?en-clase=1", "📲 Coordenadas: lo abrió tu profe", "Coordenadas, dentro de la clase", "entreno/coordenadas.html"]);
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "entreno-ventana-titulo", null, { timeout: 3000 }).catch(() => {});
  igual("es una ventana que lo dice (diálogo) y el foco va a su título",
    [await page.getAttribute("#entreno-ventana", "role"), await page.evaluate(() => document.activeElement.id)], ["dialog", "entreno-ventana-titulo"]);
  // Adentro, la página sin encabezado ni pie: la clase ya tiene los suyos.
  await page.waitForFunction(() => {
    const d = document.getElementById("entreno-ventana-marco").contentDocument;
    return d && d.documentElement.classList.contains("en-clase") && d.getElementById("header");
  }, null, { timeout: 15000 });
  igual("dentro del marco, sin encabezado, migas ni pie", await page.evaluate(() => {
    const d = document.getElementById("entreno-ventana-marco").contentDocument;
    const ve = (el) => !!(el && el.checkVisibility());
    return [ve(d.getElementById("header")), ve(d.getElementById("migas")), ve(d.querySelector("body > footer"))];
  }), [false, false, false]);

  await page.click("#entreno-ventana-cerrar");
  igual("«Volver a la clase» la cierra, y el aviso deja volver", [await seVe(page, "#entreno-ventana"), await seVe(page, "#entreno-aviso"),
    await page.textContent("#entreno-aviso-abrir"), await page.evaluate(() => document.activeElement.id)],
    [false, true, "Volver a «Coordenadas»", "entreno-aviso-abrir"]);
  // Otro eco de la presencia (el mismo pedido) no la vuelve a abrir sola.
  await page.evaluate(() => window.__entraOtroAlumno());
  igual("el mismo pedido no se vuelve a abrir solo", await seVe(page, "#entreno-ventana"), false);
  await page.click("#entreno-aviso-abrir");
  igual("«Volver a…» la abre otra vez, sin recargar la página de adentro",
    [await seVe(page, "#entreno-ventana"), await page.getAttribute("#entreno-ventana-marco", "src")], [true, "entreno/coordenadas.html?en-clase=1"]);
  await page.focus("#entreno-ventana-cerrar");
  await page.keyboard.press("Escape");
  igual("Escape también vuelve a la clase", await seVe(page, "#entreno-ventana"), false);

  // Con un recorte (una línea de Aperturas): el enlace sale de la lista, con su recorte.
  await page.evaluate(() => window.__ponerPresencia("u-profe", { role: "profesor", full_name: "Profe", entreno: { slug: "aperturas", recorte: "italiana", at: new Date(Date.now() + 1000).toISOString() } }));
  await page.waitForFunction(() => document.getElementById("entreno-ventana").checkVisibility(), null, { timeout: 5000 });
  igual("otro pedido se abre solo, con su recorte", await page.getAttribute("#entreno-ventana-marco", "src"), "entreno/aperturas.html?linea=italiana&en-clase=1");

  // El profe cierra la ventana a todos: se cierra y el marco se vacía.
  await page.evaluate(() => window.__ponerPresencia("u-profe", { role: "profesor", full_name: "Profe" }));
  igual("si el profe la cierra a todos, se cierra y se vacía",
    [await seVe(page, "#entreno-ventana"), await seVe(page, "#entreno-aviso"), await page.getAttribute("#entreno-ventana-marco", "src")], [false, false, null]);
  await page.evaluate(() => window.__ponerPresencia("u-profe", { role: "profesor", full_name: "Profe", entreno: { slug: "fuera", at: "y" } }));
  igual("un slug que no está en la lista no abre nada", [await seVe(page, "#entreno-aviso"), await seVe(page, "#entreno-ventana")], [false, false]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAbiertaSola(browser) {
  console.log("\n=== La página de un entrenamiento abierta sola: la de siempre ===");
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto("http://localhost:8777/entreno/coordenadas.html?en-clase=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  igual("aun con ?en-clase=1, sin marco no se esconde nada", [await page.evaluate(() => document.documentElement.classList.contains("en-clase")),
    await seVe(page, "#header")], [false, true]);
  await ctx.close();
}

(async () => {
  laParteQueNoTocaLaPagina();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaDelProfe(browser);
    await pruebaDelAlumno(browser);
    await pruebaAbiertaSola(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: todos los entrenamientos llegan a la clase, con sus ejercicios y sus puertas.");
  process.exit(fallos ? 1 : 0);
})();
