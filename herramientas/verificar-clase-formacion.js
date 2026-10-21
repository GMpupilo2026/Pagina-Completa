#!/usr/bin/env node
/* Las prácticas de «Formación Ajedrez» en la clase en vivo (sesion.html,
   js/clase-formacion.js, game_state.practica, herramientas/formacion-practicas.js).

   Lo que se rompe acá no da ningún error en pantalla:
   - una lámina de respuestas en la lista de una práctica se la entrega al
     alumno junto con la pregunta: la lista nunca lleva respuestas, quiz ni tarea;
   - una lámina que no existe deja un recuadro vacío delante de todo el taller:
     cada una tiene su imagen;
   - practicas.json se genera: si se toca un diapositivas.json y no se vuelve a
     correr el generador, el alumno ve una práctica vieja;
   - sin la línea del trigger, cualquier alumno cambia la práctica de toda la
     clase: la última versión de protect_game_state_teacher_columns tiene que
     devolverle `practica` a quien no es profesor, y el CHECK tiene que
     rechazar lo que el módulo rechaza;
   - lo que marcó un alumno se pierde al recargar, o no le llega al profe;
   - las preguntas de cada lámina (opciones, texto, la planilla del dictado):
     la respuesta correcta NO puede viajar en practicas.json (lo baja todo
     alumno), la clave tiene que estar sembrada en la base para cada pregunta, y
     la presentación propia de la Sesión 1 tiene que estar dibujada al día;
   - la respuesta modelo (con su artículo) solo le llega al alumno cuando el
     profe la muestra: antes no está en su pantalla, después sí, y esa lámina
     ya no se puede contestar (ni en la base);
   - lo que contesta cada alumno se guarda por responder_practica() (no
     directo en la tabla), vuelve a su pantalla al recargar y el profe lo ve con
     su respuesta modelo, quién acertó y quién no contestó.

   Con el sitio en localhost:8777 y playwright, contra el doble de
   verificar-clase-registrada.js:
       node herramientas/verificar-clase-formacion.js
*/
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");
const generador = require("./formacion-practicas.js");

const { CHROME } = R;
const RAIZ = path.join(__dirname, "..");
const abrir = (browser, quien, clase, semilla, opciones) =>
  R.abrir(browser, quien, clase, semilla, Object.assign({ sinTopeDePresencia: true }, opciones));
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (extra) => Object.assign({ id: 7, owner_id: "u-profe", fen: INICIO, moves: [], start_fen: INICIO, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido: null, pensar: null, encuesta: null, calentamiento: null,
  podio: null, equipos: null, tanda_calentamiento: null, practica: null }, extra || {});
const cambiosDeGameState = (page) => page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").map((u) => u.campos));

const PRACTICA = { id: "abcd1234", deck: "formacion-ajedrez/clase-02", titulo: "Sesión 2: Reglas de competición", laminas: [24, 25, 26, 27, 28, 29, 30] };

function losDatos() {
  console.log("\n=== practicas.json y la presentación de la Sesión 1: completos y al día ===");
  const json = JSON.parse(fs.readFileSync(generador.SALIDA, "utf8"));
  cierto("todo lo generado está al día (node herramientas/formacion-practicas.js)",
    generador.archivos().esperado.every(([f, t]) => fs.existsSync(f) && fs.readFileSync(f, "utf8") === t));
  igual("las seis sesiones virtuales tienen su práctica", json.practicas.map((p) => p.n), [1, 2, 3, 4, 5, 6]);
  const carpetaDe = (deck) => path.join(RAIZ, "cursos", "recursos", deck.split("/")[0], "presentaciones", deck.split("/")[1]);
  for (const p of json.practicas) {
    const ds = JSON.parse(fs.readFileSync(path.join(carpetaDe(p.deck), "diapositivas.json"), "utf8")).diapositivas;
    cierto(p.deck + ": " + p.laminas.length + " láminas, cada una con su diapositiva e imagen",
      p.laminas.every((l) => ds[l.n - 1] && ds[l.n - 1].titulo === l.titulo && fs.existsSync(path.join(carpetaDe(p.deck), ds[l.n - 1].imagen))));
    cierto(p.deck + ": ninguna lámina de respuestas, quiz, tarea ni receso", p.laminas.every((l) => !generador.NUNCA.test(l.titulo)),
      p.laminas.map((l) => l.titulo).join(" | "));
    cierto(p.deck + ": las láminas van en orden y sin repetir", p.laminas.every((l, k) => !k || l.n > p.laminas[k - 1].n));
    cierto(p.deck + ": la práctica entra en lo que acepta la base (de 1 a 40 láminas)", p.laminas.length >= 1 && p.laminas.length <= 40);
  }
  // La lámina de respuestas de cada sesión existe en su presentación de clase y NO está en la lista.
  const sesiones = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos", "recursos", "formacion-ajedrez", "sesiones.json"), "utf8")).sesiones;
  const respuestas = json.practicas.map((p) => {
    const ds = JSON.parse(fs.readFileSync(path.join(carpetaDe(sesiones.find((x) => x.n === p.n).presentacion), "diapositivas.json"), "utf8")).diapositivas;
    return ds.some((d) => /respuestas/i.test(d.titulo));
  });
  igual("cada sesión tiene láminas de respuestas (en su presentación) que NO se mandan", respuestas, [true, true, true, true, true, true]);

  console.log("\n=== Las preguntas: sin respuestas a la vista, con su clave en la base ===");
  const crudo = fs.readFileSync(generador.SALIDA, "utf8");
  cierto("practicas.json no trae claves, respuestas correctas ni respuestas modelo", !/"(clave|correcta|modelo|respuesta)"\s*:/.test(crudo.replace(/"id": "respuesta"/g, "")),
    "se baja a todo navegador con acceso a la Academia");
  const preguntas = json.practicas.flatMap((p) => p.laminas.flatMap((l) => l.preguntas.map((q) => ({ deck: p.deck, lamina: l.n, q }))));
  cierto("todas las preguntas tienen la forma que lee la página", preguntas.every((x) => FPura().preguntaValida(x.q)));
  const p1 = json.practicas[0];
  igual("la Sesión 1 usa su presentación propia: ocho posiciones, el dictado, tres reclamos y cuatro casos (10 láminas)", [p1.deck, p1.laminas.length], ["formacion-ajedrez/practica-01", 10]);
  igual("el dictado es lo primero de la práctica (lámina 1)", [p1.laminas[0].titulo, p1.laminas[0].preguntas.map((q) => q.tipo)], ["Estación 1: dictado de planilla", ["planilla"]]);
  igual("Estación 2: ocho preguntas de opciones, de cinco opciones cada una",
    p1.laminas.slice(1, 3).flatMap((l) => l.preguntas).map((q) => [q.tipo, q.opciones.length]).filter(([t, n]) => t === "opciones" && n === 5).length, 8);
  igual("Estación 1: la planilla, de diez filas", p1.laminas[0].preguntas.map((q) => [q.tipo, q.filas]), [["planilla", 10]]);
  igual("Estaciones 3 y 4: una pregunta de texto por lámina, siete láminas", p1.laminas.slice(3).map((l) => l.preguntas.map((q) => q.tipo)), Array(7).fill(["texto"]));
  igual("sesiones 2 a 6: un ejercicio, una caja de texto", json.practicas.slice(1).flatMap((p) => p.laminas.filter((l) => /^Ejercicio/.test(l.titulo)))
    .every((l) => l.preguntas.length === 1 && l.preguntas[0].tipo === "texto"), true);
  const claves = generador.armar().claves;
  cierto("cada pregunta tiene su clave, y cada clave su pregunta", claves.length === preguntas.length
    && preguntas.every((x) => claves.some((c) => c.deck === x.deck && c.lamina === x.lamina && c.pregunta === x.q.id && c.tipo === x.q.tipo)));
  cierto("la correcta de cada pregunta de opciones es una de sus opciones", claves.filter((c) => c.tipo === "opciones").every((c) => {
    const q = preguntas.find((x) => x.deck === c.deck && x.lamina === c.lamina && x.q.id === c.pregunta).q;
    return q.opciones.some((o) => o.v === c.clave.correcta);
  }));
  // La siembra que se aplicó a la base es la de ahora.
  const dirMig = path.join(RAIZ, "supabase", "migraciones");
  const siembras = fs.readdirSync(dirMig).filter((f) => /insert into public\.practica_claves/.test(fs.readFileSync(path.join(dirMig, f), "utf8"))).sort();
  const sembrado = siembras.map((f) => fs.readFileSync(path.join(dirMig, f), "utf8")).join("\n");
  const filasSql = generador.sqlDeClaves(claves).split("\n").filter((l) => l.startsWith("  ("));
  cierto("la siembra de claves (" + siembras.join(", ") + ") trae cada fila de lo que el generador arma hoy",
    siembras.length > 0 && filasSql.every((l) => sembrado.includes(l.replace(/,$/, ""))),
    "node herramientas/formacion-practicas.js --sql, y aplicarlo como migración nueva");
  igual("la partida del dictado se juega entera con chess.js y termina en mate",
    (() => { const g = new (require("chess.js").Chess)(); generador.DICTADO.forEach((x) => g.move(generador.aIngles(x))); return g.in_checkmate(); })(), true);
  // La presentación propia está dibujada con los datos de ahora (la huella la deja formacion-laminas.js).
  const { huella, archivo } = require("./lib/formacion-huella");
  cierto("las imágenes de la presentación propia están dibujadas con los datos de ahora",
    fs.readFileSync(archivo("practica-01"), "utf8").trim() === huella("practica-01"), "node herramientas/formacion-practicas.js --imagenes");
}

function laBase() {
  console.log("\n=== La base: el trigger la protege y el CHECK pide su forma ===");
  const dirMig = path.join(RAIZ, "supabase", "migraciones");
  const ultima = fs.readdirSync(dirMig).sort().filter((f) =>
    /function public\.protect_game_state_teacher_columns/.test(fs.readFileSync(path.join(dirMig, f), "utf8"))).pop();
  const sql = fs.readFileSync(path.join(dirMig, ultima), "utf8");
  cierto("la última versión del trigger (" + ultima + ") le devuelve `practica` a quien no es profesor",
    /new\.practica := old\.practica;/.test(sql));
  cierto("y sigue devolviendo las demás columnas protegidas",
    ["presentacion", "planilla", "tanda_calentamiento", "podio", "equipos", "encuesta", "pensar"].every((c) => new RegExp("new\\." + c + " := old\\." + c + ";").test(sql)));
  const mig = fs.readdirSync(dirMig).sort().filter((f) => /practica/.test(fs.readFileSync(path.join(dirMig, f), "utf8")) && /game_state_practica_forma/.test(fs.readFileSync(path.join(dirMig, f), "utf8"))).pop();
  const check = fs.readFileSync(path.join(dirMig, mig), "utf8");
  cierto("el CHECK va envuelto en coalesce(…, false)", /check \(practica is null or coalesce\(/.test(check) && /, false\)\);/.test(check));
  cierto("y pide id, deck, titulo y laminas", ["'id'", "'deck'", "'titulo'", "'laminas'"].every((k) => check.includes("practica->" + k)));
}

function lasReveladas() {
  console.log("\n=== La base: la respuesta se muestra lámina por lámina y no antes ===");
  const dirMig = path.join(RAIZ, "supabase", "migraciones");
  const f = fs.readdirSync(dirMig).sort().filter((x) => /practica_reveladas/.test(x)).pop();
  const sql = f ? fs.readFileSync(path.join(dirMig, f), "utf8") : "";
  cierto("hay una migración que acepta practica.reveladas en el CHECK (en coalesce(…, false))", /practica->'reveladas'/.test(sql) && /, false\)\);/.test(sql), f);
  cierto("la lista de reveladas se revisa con jsonpath (números de lámina de 1 a 500) y con CASE (un arreglo que no lo es no rompe)",
    /\$\.reveladas\[\*\]/.test(sql) && /case when jsonb_typeof\(practica->'reveladas'\) = 'array'/.test(sql));
  cierto("responder_practica rechaza una lámina revelada", /reveladas'\) @> to_jsonb\(p_lamina\)/.test(sql) && /ya mostró la respuesta/.test(sql));
  cierto("respuestas_reveladas_practica solo une las láminas reveladas y las de quien tiene a ese profe",
    /respuestas_reveladas_practica/.test(sql) && /\(g\.practica->'reveladas'\) @> to_jsonb\(c\.lamina\)/.test(sql) && /es_mi_profesor\(g\.owner_id\)/.test(sql));
  cierto("y no se la entrega a anon", /revoke execute on function public\.respuestas_reveladas_practica\(text\) from public, anon;/.test(sql));
  const ok = /new\.practica := old\.practica;/.test(fs.readdirSync(dirMig).sort().filter((x) => /function public\.protect_game_state_teacher_columns/.test(fs.readFileSync(path.join(dirMig, x), "utf8")))
    .map((x) => fs.readFileSync(path.join(dirMig, x), "utf8")).pop());
  cierto("el trigger sigue devolviéndole `practica` (y con ella `reveladas`) a quien no es profesor: nadie más muestra respuestas", ok);
}

function laParteQueNoTocaLaPagina() {
  console.log("\n=== FormacionPractica, sola ===");
  global.window = {};
  const s = fs.readFileSync(path.join(RAIZ, "js", "clase-formacion.js"), "utf8");
  const i = s.indexOf("window."), j = s.indexOf("})();", i) + 5;
  eval(s.slice(i, j)); // el módulo del propio repositorio, no datos de nadie (igual que verificar-clase-tanda.js)
  const F = global.window.FormacionPractica;
  const buena = { id: "abcd1234", deck: "formacion-ajedrez/clase-02", titulo: "Sesión 2", laminas: [24, 25] };
  igual("la forma buena pasa", F.valida(buena), true);
  igual("las que rechaza el CHECK, también acá",
    [null, [], "x", {}, Object.assign({}, buena, { laminas: [] }), Object.assign({}, buena, { laminas: [0] }), Object.assign({}, buena, { laminas: [1.5] }),
      Object.assign({}, buena, { laminas: ["24"] }), Object.assign({}, buena, { laminas: [501] }), Object.assign({}, buena, { laminas: Array.from({ length: 41 }, (_, k) => k + 1) }),
      Object.assign({}, buena, { deck: "../x" }), Object.assign({}, buena, { id: "ab" }), Object.assign({}, buena, { titulo: "" })].map(F.valida),
    Array(13).fill(false));
  const practica = JSON.parse(fs.readFileSync(generador.SALIDA, "utf8")).practicas[1];
  const m1 = F.paraMandar(practica), m2 = F.paraMandar(practica);
  igual("lo que se manda es válido, con las láminas como números", [F.valida(m1), m1.laminas], [true, practica.laminas.map((l) => l.n)]);
  igual("cada envío trae un id nuevo (lo marcado vale solo para ese envío)", m1.id !== m2.id, true);
  const L = [24, 25, 26];
  igual("marcar suma la lámina", F.alternar([], L, 25), [25]);
  igual("marcar de nuevo la quita", F.alternar([25], L, 25), []);
  igual("una lámina que no es de la práctica no entra", F.alternar([24], L, 99), [24]);
  igual("las hechas salen en el orden de la práctica, sin repetir ni ajenas", F.limpiarHechas([26, 24, 24, 99, "25"], L), [24, 26]);
  igual("completa solo con todas", [F.completa([24, 25], L), F.completa([24, 25, 26], L), F.completa([], [])], [false, true, false]);
  const r = F.resumen([{ hechas: [24, 25, 26] }, { hechas: [24] }, { hechas: [] }], L);
  igual("el resumen cuenta quiénes terminaron", r, { total: 3, terminaron: 1, todos: false });
  igual("todos", F.resumen([{ hechas: L }, { hechas: [26, 25, 24] }], L).todos, true);
  igual("sin alumnos no hay «todos»", F.resumen([], L).todos, false);
  console.log("\n=== Las respuestas mostradas, solas ===");
  const con = Object.assign({}, buena, { reveladas: [25] });
  igual("la práctica con reveladas es válida, y una forma mala no", [F.valida(con), F.valida(Object.assign({}, buena, { reveladas: [0] })), F.valida(Object.assign({}, buena, { reveladas: "x" })),
    F.valida(Object.assign({}, buena, { reveladas: Array(41).fill(24) }))], [true, false, false, false]);
  igual("las reveladas son solo las de la práctica, en su orden", F.reveladasDe({ laminas: [24, 25, 26], reveladas: [26, 99, 24, 24] }), [24, 26]);
  igual("conReveladas pone y quita la lista, sin tocar lo demás", [F.conReveladas(buena, [25, 24]).reveladas, "reveladas" in F.conReveladas(con, []), F.conReveladas(buena, [24]).id], [[24, 25], false, "abcd1234"]);
  igual("estaRevelada", [F.estaRevelada(con, 25), F.estaRevelada(con, 24), F.estaRevelada(buena, 24)], [true, false, false]);
  console.log("\n=== Las respuestas, solas ===");
  igual("una jugada se compara sin espacios, puntos ni mayúsculas; el cero del enroque vale por la o",
    [F.normaJugada("C f3"), F.normaJugada("Cxe5"), F.normaJugada("0-0-0"), F.normaJugada(" 1.e4 "), F.normaJugada(null)], ["cf3", "cxe5", "o-o-o", "1e4", ""]);
  const dictada = ["e4", "e5", "Cf3", "Cxe5", "Cd5#"];
  igual("la planilla tolera mayúsculas y espacios pero no se salta la x, el + ni el #",
    F.compararPlanilla(["E4", "e5", "C f3", "Ce5", "Cd5"], dictada).errores.map((e) => [e.i, e.escribio, e.era]), [[3, "Ce5", "Cxe5"], [4, "Cd5", "Cd5#"]]);
  igual("con todas bien es correcta", F.compararPlanilla(dictada, dictada).correcta, true);
  igual("una jugada de más la echa a perder, aunque las demás estén bien", F.compararPlanilla(dictada.concat(["Rf8"]), dictada), { buenas: 5, total: 5, errores: [], extras: true, correcta: false });
  igual("la planilla vuelve del texto con todas sus casillas", [F.planillaDeTexto('["e4","e5"]', 3).length, F.planillaDeTexto("basura", 2), F.planillaDeTexto(null, 1)], [6, ["", "", "", ""], ["", ""]]);
  igual("y se guarda sin espacios sobrantes", F.planillaATexto([" e4 ", "e5", ""]), '["e4","e5",""]');
  igual("«3.ª jugada de las blancas»", [F.nombreDeJugada(4), F.nombreDeJugada(5)], ["3.ª jugada de las blancas", "3.ª jugada de las negras"]);
  const lista = F.leerLista({ practicas: [{ deck: "formacion-ajedrez/clase-02", titulo: "ok", laminas: [
    { n: 2, titulo: "buena", preguntas: [{ id: "respuesta", tipo: "texto", texto: "Tu respuesta" }] },
    { n: 3, titulo: "mala", preguntas: [{ id: "x", tipo: "opciones", texto: "?", opciones: [{ v: "a", t: "A" }] }] },
    { n: 4, titulo: "sin" }] }] });
  igual("una pregunta mal armada deja la lámina sin preguntas (no se adivina)", lista[0].laminas.map((l) => l.preguntas.length), [1, 0, 0]);
  igual("las preguntas de una lámina", [F.preguntasDe(lista, { deck: "formacion-ajedrez/clase-02" }, 2).length, F.preguntasDe(lista, { deck: "otro/clase" }, 2).length, F.preguntasDe(lista, { deck: "formacion-ajedrez/clase-02" }, 9).length], [1, 0, 0]);
  igual("la lista descarta una práctica mal armada", F.leerLista({ practicas: [{ deck: "x", titulo: "a", laminas: [{ n: 1 }] }, { deck: "formacion-ajedrez/clase-02", titulo: "ok", laminas: [{ n: 2 }] }] }).length, 1);
}

let _F = null;
function FPura() {
  if (_F) return _F;
  global.window = {};
  const src = fs.readFileSync(path.join(RAIZ, "js", "clase-formacion.js"), "utf8");
  const i = src.indexOf("window."), j = src.indexOf("})();", i) + 5;
  eval(src.slice(i, j)); // el módulo del propio repositorio, no datos de nadie (igual que verificar-clase-tanda.js)
  _F = global.window.FormacionPractica;
  return _F;
}

const esperarImagen = (page) => page.waitForFunction(() => {
  const img = document.getElementById("formacion-img");
  return img && img.complete && img.naturalWidth > 0;
}, null, { timeout: 15000 });

async function pruebaDelAlumno(browser) {
  console.log("\n=== El alumno pasa las láminas, marca las que hizo y el profe lo ve ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ practica: PRACTICA })] });
  await page.waitForFunction(() => document.getElementById("formacion-tarjeta").checkVisibility(), null, { timeout: 20000 });
  await esperarImagen(page);
  igual("se ve la tarjeta, con la primera lámina y cuántas lleva", [await page.textContent("#formacion-titulo"), await page.textContent("#formacion-cuenta")],
    ["📝 Práctica: Sesión 2: Reglas de competición", "Lámina 1 de 7 · 0 de 7 completadas"]);
  igual("la imagen es la lámina 24 de la sesión 2", /clase-02\/24\.webp$/.test(await page.getAttribute("#formacion-img", "src")), true);
  igual("no se pide ninguna otra que la que se ve (ni respuestas): solo la 24 y la siguiente, de adelanto",
    await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name.match(/clase-\d+\/(\d+)\.webp/)).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b)), [24, 25]);
  igual("◀ apagado en la primera; ▶ prendido", [await page.isDisabled("#formacion-anterior"), await page.isDisabled("#formacion-siguiente")], [true, false]);
  igual("la tarjeta está debajo del tablero de la clase", await page.evaluate(() => document.getElementById("formacion-tarjeta").getBoundingClientRect().top
    >= document.getElementById("chessboard").getBoundingClientRect().bottom - 1), true);
  igual("el texto de la lámina no se ve (solo con el Modo Adaptado)", await seVe(page, "#formacion-texto-caja"), false);

  await page.click("#formacion-hecha");
  igual("marcar dice que está completada, escrito y en el botón", [await page.getAttribute("#formacion-hecha", "aria-pressed"), await page.textContent("#formacion-hecha"),
    await page.textContent("#formacion-cuenta")], ["true", "✅ Completada (toca para desmarcar)", "Lámina 1 de 7 · 1 de 7 completadas"]);
  await page.click("#formacion-siguiente");
  await page.waitForFunction(() => /Lámina 2 de 7/.test(document.getElementById("formacion-cuenta").textContent));
  await esperarImagen(page);
  igual("▶ pasa a la 25; no la da por completada", [/clase-02\/25\.webp$/.test(await page.getAttribute("#formacion-img", "src")), await page.getAttribute("#formacion-hecha", "aria-pressed")], [true, "false"]);
  await page.click("#formacion-anterior");
  await page.waitForFunction(() => /Lámina 1 de 7/.test(document.getElementById("formacion-cuenta").textContent));
  igual("◀ vuelve a la 24, que sigue marcada", await page.getAttribute("#formacion-hecha", "aria-pressed"), "true");
  await page.click("#formacion-pasos button:nth-child(4)");
  await page.waitForFunction(() => /Lámina 4 de 7/.test(document.getElementById("formacion-cuenta").textContent));
  igual("un número salta a esa lámina", /clase-02\/27\.webp$/.test(await page.getAttribute("#formacion-img", "src")) || await page.evaluate(() => formacionMia.i), true);
  igual("los números dicen cuáles están hechas, con palabras", await page.evaluate(() => [...document.querySelectorAll("#formacion-pasos button")].slice(0, 2).map((b) => b.getAttribute("aria-label"))),
    ["Lámina 1, completada", "Lámina 2, sin completar"]);
  await page.keyboard.press("Tab");
  await page.focus("#formacion-hecha");
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => /Lámina 3 de 7/.test(document.getElementById("formacion-cuenta").textContent));
  igual("← del teclado también la pasa", await page.textContent("#formacion-cuenta"), "Lámina 3 de 7 · 1 de 7 completadas");

  await page.waitForFunction(() => (window.__tracks || []).some((x) => x.formacion), null, { timeout: 6000 });
  igual("anuncia en la presencia lo que lleva (el profe lo ve)", await page.evaluate(() => (window.__tracks.filter((x) => x.formacion).slice(-1)[0].formacion)), { id: "abcd1234", h: [24], r: 0 });
  igual("y lo guarda en el aparato (al recargar sigue donde iba)", await page.evaluate(() => JSON.parse(localStorage.getItem(formacionMia.clave))), { hechas: [24], i: 2 });

  // Todas.
  for (let k = 1; k < 7; k++) {
    await page.evaluate((k2) => irALaminaDeFormacion(k2), k);
    if ((await page.getAttribute("#formacion-hecha", "aria-pressed")) === "false") await page.click("#formacion-hecha");
  }
  igual("con todas marcadas lo dice", [await seVe(page, "#formacion-fin"), (await page.textContent("#formacion-fin")).startsWith("¡Terminaste toda la práctica!")], [true, true]);
  await page.waitForFunction(() => window.__tracks.filter((x) => x.formacion).slice(-1)[0].formacion.h.length === 7, null, { timeout: 6000 });
  igual("y anuncia las siete", await page.evaluate(() => window.__tracks.filter((x) => x.formacion).slice(-1)[0].formacion.h), PRACTICA.laminas);
  igual("el alumno no puede cambiar la práctica de la clase (nunca escribe game_state.practica)",
    (await cambiosDeGameState(page)).some((c) => "practica" in c), false);
  // (los dos avisos de «sin red» son la falla que se provocó a propósito)
  igual("sin errores en consola (alumno), salvo la falla de red que se provocó", errores.filter((e) => !/sin red/.test(e)), []);
  await ctx.close();

  // Recargar: sigue donde iba.
  const guardado = { hechas: [24, 26], i: 1 };
  const { page: p2, ctx: c2, errores: e2 } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ practica: PRACTICA })],
    extra: "" });
  await p2.evaluate(([clave, v]) => localStorage.setItem(clave, JSON.stringify(v)), ["clase_formacion_v1:7:abcd1234", guardado]);
  await p2.reload({ waitUntil: "domcontentloaded" });
  await p2.waitForFunction(() => document.getElementById("formacion-tarjeta") && document.getElementById("formacion-tarjeta").checkVisibility(), null, { timeout: 20000 });
  igual("al recargar sigue en la lámina y con lo marcado", await p2.textContent("#formacion-cuenta"), "Lámina 2 de 7 · 2 de 7 completadas");
  await c2.close();
  void e2;
}

async function pruebaDelProfe(browser) {
  console.log("\n=== El profe manda la práctica y ve quién la termina ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()], puede_bajar: ["formacion-ajedrez"] });
  await page.waitForFunction(() => document.getElementById("formacion-caja") && !document.getElementById("formacion-caja").hidden, null, { timeout: 15000 });
  igual("tiene el espacio en Preguntar, con las seis prácticas", await page.evaluate(() => [...document.querySelectorAll("#formacion-select option")].map((o) => o.textContent.replace(/ \(.*$/, ""))), [
    "Sesión 1: Encuadre del curso y reglas básicas del ajedrez", "Sesión 2: Reglas de competición",
    "Sesión 3: Apéndices de las Leyes de Ajedrez, normativa JDE y sistemas de emparejamiento", "Sesión 4: Uso, configuración y control del reloj de ajedrez",
    "Sesión 5: Resolución de casos en grupos y experiencias regionales", "Sesión 6: Talleres prácticos y simulacros de arbitraje"]);
  igual("sin práctica enviada no hay seguimiento ni «Quitar»", [await seVe(page, "#formacion-seguimiento"), await seVe(page, "#formacion-quitar-btn")], [false, false]);
  await page.evaluate(() => activateTeacherTab("preguntar"));
  await page.click("#formacion-caja > summary");
  await page.selectOption("#formacion-select", "1");
  await page.click("#formacion-mandar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.practica), null, { timeout: 8000 });
  const enviada = (await cambiosDeGameState(page)).find((c) => c.practica).practica;
  igual("manda la práctica de la sesión 2 con sus láminas y un id", [enviada.deck, enviada.laminas, typeof enviada.id, enviada.id.length >= 4],
    ["formacion-ajedrez/clase-02", [24, 25, 26, 27, 28, 29, 30], "string", true]);
  igual("ninguna lámina de respuestas viaja", enviada.laminas.every((n) => n < 31), true);
  igual("el profe NO ve la tarjeta del alumno (no marca nada)", await seVe(page, "#formacion-tarjeta"), false);
  await page.waitForFunction(() => !document.getElementById("formacion-seguimiento").hidden, null, { timeout: 5000 });
  igual("dice qué mandó y que todavía no hay nadie conectado", [await page.textContent("#formacion-enviada"), await page.textContent("#formacion-cuenta-profe")],
    ["Enviada: Sesión 2: Reglas de competición · 7 láminas", "Todavía no hay alumnos conectados."]);

  const id = enviada.id;
  await page.evaluate((i) => {
    window.__ponerPresencia("u-ana", { email: "ana@x.cr", full_name: "Ana Rojas", role: "alumno", formacion: { id: i, h: [24, 25, 26, 27, 28, 29, 30] } });
    window.__ponerPresencia("u-beto", { email: "beto@x.cr", full_name: "Beto Mora", role: "alumno", formacion: { id: i, h: [24, 25] } });
    window.__ponerPresencia("u-ceci", { email: "ceci@x.cr", full_name: "Ceci Vargas", role: "alumno" });
    // Una marca de OTRA práctica no cuenta.
    window.__ponerPresencia("u-dani", { email: "dani@x.cr", full_name: "Dani Soto", role: "alumno", formacion: { id: "otra-vez", h: [24, 25, 26, 27, 28, 29, 30] } });
  }, id);
  igual("la lista: primero quienes faltan, con cuántas lleva cada uno",
    await page.evaluate(() => [...document.querySelectorAll("#formacion-lista li")].map((li) => [...li.querySelectorAll("span")].map((s) => s.textContent).join(" | "))),
    ["Beto Mora | 2 de 7 completadas", "Ceci Vargas | 0 de 7 completadas", "Dani Soto | 0 de 7 completadas", "Ana Rojas | ✅ Terminó (7 de 7)"]);
  igual("la cuenta de arriba", await page.textContent("#formacion-cuenta-profe"), "Han terminado toda la práctica: 1 de 4 alumnos.");
  igual("cada barra dice de quién es", await page.evaluate(() => document.querySelector("#formacion-lista progress").getAttribute("aria-label")), "Avance de Beto Mora");
  await page.evaluate((i) => {
    for (const [k, n, e] of [["u-beto", "Beto Mora", "beto@x.cr"], ["u-ceci", "Ceci Vargas", "ceci@x.cr"], ["u-dani", "Dani Soto", "dani@x.cr"]])
      window.__ponerPresencia(k, { email: e, full_name: n, role: "alumno", formacion: { id: i, h: [24, 25, 26, 27, 28, 29, 30] } });
  }, id);
  igual("cuando todos terminan, el profe lo ve escrito", await page.textContent("#formacion-cuenta-profe"), "✅ Todos terminaron: 4 de 4 alumnos.");
  // Quien se desconecta no desaparece de la lista.
  await page.evaluate(() => window.__presencia("u-beto", null));
  igual("quien se desconectó sigue en la lista, dicho", await page.evaluate(() => [...document.querySelectorAll("#formacion-lista li")].map((li) => li.querySelector("span").textContent).filter((t) => /Beto/.test(t))),
    ["Beto Mora (se desconectó)"]);

  await page.click("#formacion-quitar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.practica === null), null, { timeout: 8000 });
  igual("«Quitar» deja la práctica en null y se esconde el seguimiento", [(await cambiosDeGameState(page)).slice(-1)[0].practica, await seVe(page, "#formacion-seguimiento")], [null, false]);
  igual("sin errores en consola (profe)", errores, []);
  await ctx.close();
}

/* La base de las respuestas, de mentira: responder_practica() guarda en
   __guardadas lo que le llega (y falla si la prueba pone __falla), y
   mis_respuestas_practica() devuelve lo guardado, SIN nota, como la de verdad. */
const BASE_DE_RESPUESTAS = `
window.__guardadas = window.__guardadas || [];
(function () {
  const rpc = window.sb.rpc.bind(window.sb);
  window.sb.rpc = (n, a) => {
    if (n === "responder_practica") {
      (window.__rpcs = window.__rpcs || []).push({ n: n, args: a });
      if (window.__falla) return Promise.resolve({ data: null, error: { message: "sin red" } });
      const i = window.__guardadas.findIndex((r) => r.p_envio === a.p_envio && r.p_lamina === a.p_lamina && r.p_pregunta === a.p_pregunta);
      if (a.p_respuesta === "") { if (i >= 0) window.__guardadas.splice(i, 1); }
      else if (i >= 0) window.__guardadas[i] = a; else window.__guardadas.push(a);
      return Promise.resolve({ data: { guardada: true }, error: null });
    }
    if (n === "mis_respuestas_practica") {
      (window.__rpcs = window.__rpcs || []).push({ n: n, args: a });
      return Promise.resolve({ data: window.__guardadas.filter((r) => r.p_envio === a.p_envio)
        .map((r) => ({ deck: r.p_deck, lamina: r.p_lamina, pregunta: r.p_pregunta, respuesta: r.p_respuesta })), error: null });
    }
    if (n === "respuestas_reveladas_practica") {
      (window.__rpcs = window.__rpcs || []).push({ n: n, args: a });
      return Promise.resolve({ data: window.__reveladas || [], error: null });
    }
    return rpc(n, a);
  };
})();`;
const PRACTICA_1 = { id: "pr1-envio", deck: "formacion-ajedrez/practica-01", titulo: "Sesión 1: Encuadre", laminas: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
const guardadas = (page) => page.evaluate(() => window.__guardadas.map((r) => [r.p_lamina, r.p_pregunta, r.p_respuesta]));
const rpcsDe = (page, n) => page.evaluate((nombre) => (window.__rpcs || []).filter((r) => r.n === nombre).length, n);

async function pruebaDeLasRespuestas(browser) {
  console.log("\n=== El alumno contesta: opciones, texto y la planilla del dictado ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ practica: PRACTICA_1 })] }, { extra: BASE_DE_RESPUESTAS });
  // Lo primero que ve es el dictado (lámina 1): su planilla.
  await page.waitForFunction(() => document.getElementById("formacion-tarjeta").checkVisibility() && document.querySelectorAll("#formacion-preguntas table input").length === 20, null, { timeout: 20000 });
  igual("la práctica empieza por el dictado: lámina 1 y su planilla", await page.textContent("#formacion-cuenta"), "Lámina 1 de 10 · 0 de 10 completadas");
  await page.click("#formacion-pasos button:nth-child(2)");
  await page.waitForFunction(() => document.querySelectorAll("#formacion-preguntas fieldset").length === 4, null, { timeout: 8000 });
  igual("Estación 2: cuatro preguntas, cada una con sus cinco opciones, escritas",
    await page.evaluate(() => [...document.querySelectorAll("#formacion-preguntas fieldset")].map((f) => [f.querySelector("legend").textContent, f.querySelectorAll("input[type=radio]").length])),
    [["Posición 1 (juegan las negras)", 5], ["Posición 2 (juegan las negras)", 5], ["Posición 3 (juegan las negras)", 5], ["Posición 4 (juegan las blancas)", 5]]);
  igual("la corrección no está a la vista: ninguna opción dice cuál es la buena", await page.evaluate(() => document.getElementById("formacion-preguntas").innerHTML.includes("correcta")), false);
  await page.check("#fq-2-p1-0");
  await page.waitForFunction(() => window.__guardadas.length === 1, null, { timeout: 5000 });
  igual("elegir una opción la guarda al instante, por responder_practica", await guardadas(page), [[2, "p1", "mate"]]);
  igual("y dice «Guardada ✓»", await page.textContent("#formacion-preguntas fieldset >> nth=0 >> p[role=status]"), "Guardada ✓");
  await page.check("#fq-2-p2-0");
  await page.check("#fq-2-p2-1");
  await page.waitForFunction(() => window.__guardadas.some((r) => r.p_pregunta === "p2" && r.p_respuesta === "ahogado"), null, { timeout: 5000 });
  igual("cambiar de opinión reemplaza la respuesta, no la suma", (await guardadas(page)).filter((g) => g[1] === "p2"), [[2, "p2", "ahogado"]]);
  const args = await page.evaluate(() => window.__rpcs.find((r) => r.n === "responder_practica").args);
  igual("manda el envío, la práctica, la lámina y la pregunta", [args.p_envio, args.p_deck, args.p_lamina, args.p_pregunta], ["pr1-envio", "formacion-ajedrez/practica-01", 2, "p1"]);
  await page.waitForFunction(() => { const t = (window.__tracks || []).filter((x) => x.formacion).slice(-1)[0]; return !!t && t.formacion.r === 2; }, null, { timeout: 6000 });
  igual("anuncia cuántas lleva contestadas (el profe se entera)", await page.evaluate(() => window.__tracks.filter((x) => x.formacion).slice(-1)[0].formacion), { id: "pr1-envio", h: [], r: 2 });

  // La planilla del dictado (lámina 1).
  await page.click("#formacion-pasos button:nth-child(1)");
  await page.waitForFunction(() => document.querySelectorAll("#formacion-preguntas table input").length === 20, null, { timeout: 5000 });
  igual("Estación 1: la planilla de diez filas, con cada casilla dicha en voz («3.ª jugada de las blancas»)",
    await page.evaluate(() => [document.querySelectorAll("#formacion-preguntas tbody tr").length, document.querySelectorAll("#formacion-preguntas table input")[4].getAttribute("aria-label")]), [10, "3.ª jugada de las blancas"]);
  const celdas = await page.$$("#formacion-preguntas table input");
  await celdas[0].fill("e4"); await celdas[1].fill("e5"); await celdas[2].fill("Cf3");
  await celdas[2].press("Tab");
  await page.waitForFunction(() => window.__guardadas.some((r) => r.p_pregunta === "planilla"), null, { timeout: 5000 });
  igual("la planilla se guarda como la lista de jugadas, en orden", JSON.parse((await page.evaluate(() => window.__guardadas.find((r) => r.p_pregunta === "planilla").p_respuesta))).slice(0, 4), ["e4", "e5", "Cf3", ""]);

  // Texto libre: se guarda con el botón, y lo escrito sin guardar se guarda al pasar de lámina.
  await page.click("#formacion-pasos button:nth-child(4)");
  await page.waitForSelector("#formacion-preguntas textarea", { timeout: 5000 });
  igual("Estación 3 (reclamo 1): «Tu decisión y el artículo que aplicas», con su caja de texto",
    await page.evaluate(() => [document.querySelector("#formacion-preguntas label").textContent, document.querySelector("#formacion-preguntas textarea").labels.length]), ["Tu decisión y el artículo que aplicas", 1]);
  await page.fill("#formacion-preguntas textarea", "Debe mover el alfil (art. 4.3).");
  await page.click("#formacion-preguntas button:has-text('Guardar mi respuesta')");
  await page.waitForFunction(() => window.__guardadas.some((r) => r.p_lamina === 4), null, { timeout: 5000 });
  igual("el botón la guarda", (await guardadas(page)).filter((g) => g[0] === 4), [[4, "decision", "Debe mover el alfil (art. 4.3)."]]);
  await page.click("#formacion-siguiente");
  await page.waitForFunction(() => /Lámina 5 de 10/.test(document.getElementById("formacion-cuenta").textContent));
  await page.fill("#formacion-preguntas textarea", "Vuelve a la posición anterior.");
  await page.click("#formacion-siguiente");   // sin apretar «Guardar»: al pasar de lámina se guarda
  await page.waitForFunction(() => window.__guardadas.some((r) => r.p_lamina === 5), null, { timeout: 5000 });
  igual("lo escrito y no guardado se guarda solo al pasar de lámina", (await guardadas(page)).filter((g) => g[0] === 5), [[5, "decision", "Vuelve a la posición anterior."]]);
  await page.click("#formacion-anterior");
  await page.waitForFunction(() => /Lámina 5 de 10/.test(document.getElementById("formacion-cuenta").textContent));
  igual("al volver a una lámina, su respuesta sigue ahí", await page.inputValue("#formacion-preguntas textarea"), "Vuelve a la posición anterior.");
  await page.fill("#formacion-preguntas textarea", "");
  await page.click("#formacion-preguntas button:has-text('Guardar mi respuesta')");
  await page.waitForFunction(() => !window.__guardadas.some((r) => r.p_lamina === 5), null, { timeout: 5000 });
  igual("vaciar la caja borra la respuesta (la base la quita)", (await guardadas(page)).filter((g) => g[0] === 5), []);

  // Una falla de red se dice y no se pierde lo escrito.
  await page.evaluate(() => { window.__falla = true; });
  await page.fill("#formacion-preguntas textarea", "Sin red.");
  await page.click("#formacion-preguntas button:has-text('Guardar mi respuesta')");
  await page.waitForFunction(() => /No se pudo guardar/.test(document.querySelector("#formacion-preguntas p[role=status]").textContent), null, { timeout: 5000 });
  igual("si falla, lo dice y deja lo escrito", [await page.textContent("#formacion-preguntas p[role=status]"), await page.inputValue("#formacion-preguntas textarea")],
    ["No se pudo guardar. Revisa tu conexión y vuelve a intentarlo.", "Sin red."]);
  await page.evaluate(() => { window.__falla = false; });
  igual("el alumno nunca escribe la tabla de respuestas directo (todo va por la función)",
    await page.evaluate(() => window.__inserts.concat(window.__updates).filter((x) => x.tabla === "practica_respuestas").length), 0);
  // (los dos avisos de «sin red» son la falla que se provocó a propósito)
  igual("sin errores en consola (alumno), salvo la falla de red que se provocó", errores.filter((e) => !/sin red/.test(e)), []);
  await ctx.close();

  // Recargar: lo contestado vuelve de la base.
  const { page: p2, ctx: c2 } = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ practica: PRACTICA_1 })] }, { extra: BASE_DE_RESPUESTAS
    + 'window.__guardadas.push({ p_envio: "pr1-envio", p_deck: "formacion-ajedrez/practica-01", p_lamina: 2, p_pregunta: "p3", p_respuesta: "jaque" });'
    + 'window.__guardadas.push({ p_envio: "pr1-envio", p_deck: "formacion-ajedrez/practica-01", p_lamina: 4, p_pregunta: "decision", p_respuesta: "Mi decisión de antes" });' });
  await p2.waitForFunction(() => document.querySelectorAll("#formacion-preguntas table input").length === 20, null, { timeout: 20000 });
  await p2.click("#formacion-pasos button:nth-child(2)");
  await p2.waitForFunction(() => document.querySelectorAll("#formacion-preguntas input:checked").length === 1, null, { timeout: 8000 });
  igual("al entrar de nuevo, su opción de antes sigue marcada", await p2.evaluate(() => document.querySelector("#formacion-preguntas input:checked").value), "jaque");
  await p2.click("#formacion-pasos button:nth-child(4)");
  await p2.waitForSelector("#formacion-preguntas textarea");
  igual("y su texto de antes sigue en su caja", await p2.inputValue("#formacion-preguntas textarea"), "Mi decisión de antes");
  await c2.close();

  // «Ver como alumno»: el profe mira cómo se ve, sin dejar nada en la clase.
  const { page: p3, ctx: c3 } = await abrir(browser, "u-profe", CLASE, { game_state: [fila({ practica: PRACTICA_1 })] }, { ruta: "/sesion.html?como=alumno", extra: BASE_DE_RESPUESTAS });
  await p3.waitForFunction(() => document.querySelectorAll("#formacion-preguntas table input").length === 20, null, { timeout: 20000 });
  await p3.click("#formacion-pasos button:nth-child(2)");
  await p3.waitForFunction(() => document.querySelectorAll("#formacion-preguntas fieldset").length === 4, null, { timeout: 8000 });
  await p3.check("#fq-2-p1-0");
  await p3.waitForFunction(() => /Vista previa/.test(document.querySelector("#formacion-preguntas p[role=status]").textContent), null, { timeout: 5000 });
  igual("en la vista previa no se manda nada a la base", await rpcsDe(p3, "responder_practica"), 0);
  await c3.close();
}

async function pruebaDelProfeConRespuestas(browser) {
  console.log("\n=== El profe ve qué contestó cada uno, la respuesta modelo y quién acertó ===");
  const claves = generador.armar().claves.filter((c) => c.deck === "formacion-ajedrez/practica-01");
  const fil = (id, lamina, pregunta, respuesta, correcta, extra) => Object.assign({ student_id: id, envio: "pr1-envio", titulo: PRACTICA_1.titulo, deck: PRACTICA_1.deck, lamina, pregunta, respuesta,
    correcta, buenas: null, total: null, created_at: "2026-10-20T15:00:00Z", updated_at: "2026-10-20T15:05:00Z" }, extra || {});
  const respuestas = [
    fil("u-ana", 2, "p1", "mate", true), fil("u-ana", 2, "p2", "mate", false), fil("u-ana", 2, "p3", "jaque", true),
    fil("u-ana", 1, "planilla", JSON.stringify(["e4", "E5", "C f3", "d6", "Ac4", "Ag4", "Cc3", "g6", "Ce5", "Axd1", "Axf7+", "Re7", "Cd5#"]), false, { buenas: 12, total: 13 }),
    fil("u-ana", 4, "decision", "Debe mover el alfil (art. 4.3).", null),
    fil("u-beto", 2, "p1", "ahogado", false), fil("u-beto", 4, "decision", "<b>Pierde la partida</b>", null),
  ];
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila({ practica: PRACTICA_1 })], puede_bajar: ["formacion-ajedrez"],
    practica_respuestas: respuestas, practica_claves: claves });
  await page.waitForFunction(() => document.getElementById("formacion-caja") && !document.getElementById("formacion-caja").hidden, null, { timeout: 15000 });
  await page.evaluate(() => activateTeacherTab("preguntar"));
  await page.click("#formacion-caja > summary");
  await page.waitForFunction(() => document.querySelectorAll("#formacion-resp-lista > div.border").length > 0, null, { timeout: 8000 });
  await page.evaluate(() => {
    window.__ponerPresencia("u-ana", { email: "ana@x.cr", full_name: "Ana Rojas", role: "alumno", formacion: { id: "pr1-envio", h: [1], r: 5 } });
    window.__ponerPresencia("u-beto", { email: "beto@x.cr", full_name: "Beto Mora", role: "alumno", formacion: { id: "pr1-envio", h: [], r: 2 } });
    window.__ponerPresencia("u-ceci", { email: "ceci@x.cr", full_name: "Ceci Vargas", role: "alumno" });
  });
  await page.waitForFunction(() => /Ceci/.test(document.getElementById("formacion-resp-notas").textContent), null, { timeout: 8000 });
  igual("la práctica de ahora aparece primera en la lista de prácticas", await page.evaluate(() => document.querySelector("#formacion-resp-envio option").textContent), "La de ahora: Sesión 1: Encuadre");
  igual("la calificación: de las preguntas con respuesta única, cuántas salieron bien",
    await page.evaluate(() => [...document.querySelectorAll("#formacion-resp-notas li")].map((li) => li.textContent)),
    ["Ana Rojas2 de 9 bien · 5 sin contestar", "Beto Mora0 de 9 bien · 8 sin contestar", "Ceci Vargas0 de 9 bien · 9 sin contestar"]);
  igual("lo que cuenta es una pregunta de opciones o la planilla; el texto libre no se califica",
    await page.textContent("#formacion-resp-notas p"), "Calificación: 9 preguntas con respuesta correcta (la planilla cuenta como una: sale bien si todas sus jugadas están bien).");
  // Al abrir, la lámina que ve es la primera de la práctica (el dictado): elige la de las posiciones.
  await page.selectOption("#formacion-resp-lamina", "2");
  await page.waitForFunction(() => /Qué eligieron/.test(document.getElementById("formacion-resp-lista").textContent), null, { timeout: 5000 });
  igual("Estación 2: la respuesta modelo (solo del profe) y lo que eligieron, escrito",
    await page.evaluate(() => { const b = document.querySelector("#formacion-resp-lista > div.border"); return [b.textContent.includes("Respuesta modelo (solo tú): Jaque mate"), b.querySelector("p.text-xs.mt-1:not(.bg-green-50)").textContent.startsWith("Qué eligieron: Jaque mate: la partida terminó 1 · Ahogado: tablas 1")]; }), [true, true]);
  igual("cada alumno con su marca escrita (✓ bien / ✗ mal) y lo que eligió",
    await page.evaluate(() => [...document.querySelectorAll("#formacion-resp-lista > div:nth-of-type(2) li")].map((li) => li.textContent)),
    ["Ana Rojas ✓ bien: Jaque mate: la partida terminó", "Beto Mora ✗ mal: Ahogado: tablas"]);
  igual("y quién no contestó esa pregunta", await page.evaluate(() => [...document.querySelectorAll("#formacion-resp-lista > div:nth-of-type(2) p")].pop().textContent), "Sin contestar: Ceci Vargas");
  // La planilla: qué jugada falló y cuál era.
  await page.selectOption("#formacion-resp-lamina", "1");
  await page.waitForFunction(() => /jugadas bien/.test(document.getElementById("formacion-resp-lista").textContent), null, { timeout: 5000 });
  igual("la planilla: cuántas jugadas bien, cuál falló y cuál era, y la partida dictada para el profe",
    await page.evaluate(() => { const t = document.getElementById("formacion-resp-lista").textContent; return [t.includes("La partida dictada: 1. e4 e5 2. Cf3"), t.includes("Ana Rojas ✗ mal: 12 de 13 jugadas bien · 5.ª jugada de las blancas: escribió «Ce5», era «Cxe5»")]; }), [true, true]);
  // Los casos: lo que escribió una persona va como texto, nunca como HTML.
  await page.selectOption("#formacion-resp-lamina", "4");
  await page.waitForFunction(() => /Pierde la partida/.test(document.getElementById("formacion-resp-lista").textContent), null, { timeout: 5000 });
  igual("lo que escribe una persona no se interpreta (un <b> sale como texto)", await page.evaluate(() => [document.querySelectorAll("#formacion-resp-lista b").length, document.getElementById("formacion-resp-lista").textContent.includes("<b>Pierde la partida</b>")]), [0, true]);
  igual("el texto libre trae su respuesta modelo para analizarlo en clase", await page.evaluate(() => document.getElementById("formacion-resp-lista").textContent.includes("Respuesta modelo (solo tú): Pieza tocada: debe mover el alfil")), true);
  igual("sin errores en consola (profe)", errores, []);
  await ctx.close();
}

async function pruebaDeLasReveladas(browser) {
  console.log("\n=== El profe muestra la respuesta: el alumno la ve con su artículo y ya no contesta esa lámina ===");
  const filasReveladas = [
    { deck: PRACTICA_1.deck, lamina: 2, pregunta: "p1", tipo: "opciones", opcion: "mate", modelo: "Jaque mate: el rey está en jaque y no tiene ninguna jugada legal. La partida terminó (art. 5.1).", respondio: true, correcta: true, buenas: null, total: null },
    { deck: PRACTICA_1.deck, lamina: 2, pregunta: "p2", tipo: "opciones", opcion: "ahogado", modelo: "Ahogado: el rey no está en jaque (art. 5.2.1).", respondio: true, correcta: false, buenas: null, total: null },
    { deck: PRACTICA_1.deck, lamina: 2, pregunta: "p3", tipo: "opciones", opcion: "jaque", modelo: "Jaque, pero no mate (art. 3.9).", respondio: false, correcta: null, buenas: null, total: null },
    { deck: PRACTICA_1.deck, lamina: 2, pregunta: "p4", tipo: "opciones", opcion: "muerta", modelo: "Posición muerta (art. 5.2.2).", respondio: false, correcta: null, buenas: null, total: null },
    { deck: PRACTICA_1.deck, lamina: 1, pregunta: "planilla", tipo: "planilla", opcion: null, modelo: "La partida dictada: 1. e4 e5 2. Cf3 d6", respondio: true, correcta: false, buenas: 12, total: 13 },
    { deck: PRACTICA_1.deck, lamina: 4, pregunta: "decision", tipo: "texto", opcion: null, modelo: "Pieza tocada: debe mover el alfil (art. 4.3).", respondio: true, correcta: null, buenas: null, total: null },
  ];
  const sembrar = BASE_DE_RESPUESTAS + "window.__reveladas = " + JSON.stringify(filasReveladas) + ";"
    + 'window.__guardadas.push({ p_envio: "pr1-envio", p_deck: "formacion-ajedrez/practica-01", p_lamina: 2, p_pregunta: "p1", p_respuesta: "mate" });'
    + 'window.__guardadas.push({ p_envio: "pr1-envio", p_deck: "formacion-ajedrez/practica-01", p_lamina: 4, p_pregunta: "decision", p_respuesta: "Mi decisión" });';

  // Sin mostrar nada: ni una palabra de la respuesta en la pantalla.
  const a = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ practica: PRACTICA_1 })] }, { extra: sembrar });
  await a.page.waitForFunction(() => document.querySelectorAll("#formacion-preguntas table input").length === 20, null, { timeout: 20000 });
  await a.page.click("#formacion-pasos button:nth-child(2)");
  await a.page.waitForFunction(() => document.querySelectorAll("#formacion-preguntas fieldset").length === 4, null, { timeout: 8000 });
  igual("antes de mostrarla no hay ninguna respuesta en su pantalla (ni se le pidió a la base)",
    [await a.page.evaluate(() => /art\. 5\.1|La respuesta correcta/.test(document.getElementById("formacion-tarjeta").textContent)), await rpcsDe(a.page, "respuestas_reveladas_practica")], [false, 0]);
  igual("y puede contestar (las opciones no están apagadas)", await a.page.evaluate(() => [...document.querySelectorAll("#formacion-preguntas input[type=radio]")].some((r) => r.disabled)), false);

  // El profe la muestra (llega por la base, como Realtime): aparece sin recargar.
  await a.page.evaluate((p) => window.__cambioEnBase("game_state", Object.assign({ id: 7, owner_id: "u-profe" }, { practica: p })), Object.assign({}, PRACTICA_1, { reveladas: [2] }));
  await a.page.waitForFunction(() => document.querySelectorAll("#formacion-preguntas fieldset")[0].textContent.includes("La respuesta correcta"), null, { timeout: 8000 });
  igual("la respuesta aparece sola: la correcta, el artículo y cómo le fue (escrito)",
    await a.page.evaluate(() => [...document.querySelectorAll("#formacion-preguntas fieldset")].map((f) => f.querySelector(".bg-green-50").innerText.replace(/\s+/g, " ").trim())), [
      "La respuesta correcta Jaque mate: la partida terminó Jaque mate: el rey está en jaque y no tiene ninguna jugada legal. La partida terminó (art. 5.1). ✓ Tu respuesta fue correcta.",
      "La respuesta correcta Ahogado: tablas Ahogado: el rey no está en jaque (art. 5.2.1). ✗ Tu respuesta no era esa.",
      "La respuesta correcta Jaque, pero la partida sigue Jaque, pero no mate (art. 3.9). No contestaste esta pregunta.",
      "La respuesta correcta Posición muerta: tablas Posición muerta (art. 5.2.2). No contestaste esta pregunta."]);
  igual("esa lámina ya no se puede contestar: todo apagado, y su respuesta de antes sigue marcada",
    await a.page.evaluate(() => [[...document.querySelectorAll("#formacion-preguntas input[type=radio]")].every((r) => r.disabled), document.querySelector("#formacion-preguntas input:checked").value]), [true, "mate"]);
  await a.page.waitForFunction(() => /Tu profe mostró la respuesta de la lámina 2/.test(document.getElementById("clase-voz").textContent), null, { timeout: 4000 }).catch(() => {});
  igual("se le avisa en voz (Modo Adaptado)", await a.page.evaluate(() => /Tu profe mostró la respuesta de la lámina 2/.test(document.getElementById("clase-voz").textContent)), true);
  // La planilla y el texto, ya mostrados.
  await a.page.evaluate((p) => window.__cambioEnBase("game_state", Object.assign({ id: 7, owner_id: "u-profe" }, { practica: p })), Object.assign({}, PRACTICA_1, { reveladas: [1, 2, 4] }));
  await a.page.click("#formacion-pasos button:nth-child(1)");
  await a.page.waitForFunction(() => document.querySelectorAll("#formacion-preguntas table input").length === 20 && document.querySelector("#formacion-preguntas .bg-green-50"), null, { timeout: 8000 });
  igual("la planilla: la partida dictada (sin repetir el rótulo) y cuántas jugadas le salieron bien; sus casillas, apagadas",
    await a.page.evaluate(() => [document.querySelector("#formacion-preguntas .bg-green-50").innerText.replace(/\s+/g, " ").trim(), [...document.querySelectorAll("#formacion-preguntas table input")].every((i) => i.disabled)]),
    ["La partida dictada 1. e4 e5 2. Cf3 d6 ✗ Tu planilla: 12 de 13 jugadas bien.", true]);
  await a.page.click("#formacion-pasos button:nth-child(4)");
  await a.page.waitForSelector("#formacion-preguntas textarea:disabled", { timeout: 5000 });
  igual("el texto: su respuesta de antes, apagada, y la respuesta modelo de su profe",
    await a.page.evaluate(() => [document.querySelector("#formacion-preguntas textarea").value, document.querySelector("#formacion-preguntas button").hidden,
      document.querySelector("#formacion-preguntas .bg-green-50").innerText.replace(/\s+/g, " ").trim()]),
    ["Mi decisión", true, "Respuesta modelo de tu profe Pieza tocada: debe mover el alfil (art. 4.3)."]);
  igual("una lámina que no se mostró sigue abierta", await (async () => { await a.page.click("#formacion-pasos button:nth-child(5)"); await a.page.waitForSelector("#formacion-preguntas textarea"); return a.page.evaluate(() => [document.querySelector("#formacion-preguntas textarea").disabled, !!document.querySelector("#formacion-preguntas .bg-green-50")]); })(), [false, false]);
  await a.ctx.close();

  // El profe: mostrar una lámina, mostrar todas y ocultar.
  const claves = generador.armar().claves.filter((c) => c.deck === PRACTICA_1.deck);
  const t = await abrir(browser, "u-profe", CLASE, { game_state: [fila({ practica: PRACTICA_1 })], puede_bajar: ["formacion-ajedrez"], practica_respuestas: [], practica_claves: claves });
  await t.page.waitForFunction(() => document.getElementById("formacion-caja") && !document.getElementById("formacion-caja").hidden, null, { timeout: 15000 });
  await t.page.evaluate(() => activateTeacherTab("preguntar"));
  await t.page.click("#formacion-caja > summary");
  await t.page.waitForFunction(() => document.querySelector("#formacion-resp-lista button"), null, { timeout: 8000 });
  igual("antes: los alumnos todavía no ven la respuesta (escrito) y el botón ofrece mostrarla",
    await t.page.evaluate(() => [document.querySelector("#formacion-resp-lista p[role=status]").textContent, document.querySelector("#formacion-resp-lista button").textContent]),
    ["Los alumnos todavía no ven la respuesta de esta lámina.", "Mostrar la respuesta a los alumnos"]);
  await t.page.click("#formacion-resp-lista button:has-text('Mostrar la respuesta a los alumnos')");
  await t.page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.practica && u.campos.practica.reveladas), null, { timeout: 8000 });
  const u1 = (await cambiosDeGameState(t.page)).filter((c) => c.practica && c.practica.reveladas).pop().practica;
  igual("manda practica con reveladas [1] y lo demás igual (mismo envío, mismas láminas)", [u1.reveladas, u1.id, u1.laminas.length], [[1], "pr1-envio", 10]);
  await t.page.waitForFunction(() => /✓ Los alumnos ven la respuesta/.test(document.querySelector("#formacion-resp-lista p[role=status]").textContent), null, { timeout: 8000 });
  igual("el profe ve que ya la ven, escrito, y el botón ofrece ocultarla", await t.page.evaluate(() => [document.querySelector("#formacion-resp-lista p[role=status]").textContent, document.querySelector("#formacion-resp-lista button").textContent]),
    ["✓ Los alumnos ven la respuesta de esta lámina, con su artículo.", "Ocultar la respuesta a los alumnos"]);
  await t.page.click("#formacion-resp-lista button:has-text('Mostrar todas las respuestas')");
  await t.page.waitForFunction(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.practica && u.campos.practica.reveladas).length === 2, null, { timeout: 8000 });
  igual("«Mostrar todas» manda las diez", (await cambiosDeGameState(t.page)).filter((c) => c.practica && c.practica.reveladas).pop().practica.reveladas, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  await t.page.waitForFunction(() => document.querySelector("#formacion-resp-lista button:last-child").textContent === "Ocultar todas las respuestas", null, { timeout: 8000 });
  await t.page.click("#formacion-resp-lista button:has-text('Ocultar todas las respuestas')");
  await t.page.waitForFunction(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.practica).length >= 3, null, { timeout: 8000 });
  igual("«Ocultar todas» las quita: la práctica queda sin `reveladas`", "reveladas" in (await cambiosDeGameState(t.page)).filter((c) => c.practica).pop().practica, false);
  await t.ctx.close();
}

async function pruebaSinPermiso(browser) {
  console.log("\n=== Quien no tiene el curso no ve el espacio ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila()] });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
  await page.waitForTimeout(800);
  igual("sin puede_bajar('formacion-ajedrez') no está el espacio para mandar", await seVe(page, "#formacion-caja"), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaLaClaseSeCierra(browser) {
  console.log("\n=== Al cerrar la clase la práctica se quita sola ===");
  const { page, ctx } = await abrir(browser, "u-profe", CLASE, { game_state: [fila({ practica: PRACTICA })], puede_bajar: ["formacion-ajedrez"] });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 15000 });
  await page.evaluate(() => limpiarLoDeLaClase());
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && "practica" in u.campos), null, { timeout: 8000 });
  igual("limpiarLoDeLaClase manda practica: null", (await cambiosDeGameState(page)).find((c) => "practica" in c).practica, null);
  await ctx.close();
}

(async () => {
  losDatos();
  laBase();
  lasReveladas();
  laParteQueNoTocaLaPagina();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaDelAlumno(browser);
    await pruebaDelProfe(browser);
    await pruebaDeLasRespuestas(browser);
    await pruebaDelProfeConRespuestas(browser);
    await pruebaDeLasReveladas(browser);
    await pruebaSinPermiso(browser);
    await pruebaLaClaseSeCierra(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: las prácticas llegan a cada alumno sin respuestas, cada uno marca las suyas y el profe ve quién terminó.");
  process.exit(fallos ? 1 : 0);
})();
