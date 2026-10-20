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
   - lo que marcó un alumno se pierde al recargar, o no le llega al profe.

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
  console.log("\n=== practicas.json: completo y al día ===");
  const json = JSON.parse(fs.readFileSync(generador.SALIDA, "utf8"));
  cierto("está al día con lo que el generador armaría hoy (node herramientas/formacion-practicas.js)",
    fs.readFileSync(generador.SALIDA, "utf8") === JSON.stringify(generador.armar(), null, 2) + "\n");
  igual("las seis sesiones virtuales tienen su práctica", json.practicas.map((p) => p.n), [1, 2, 3, 4, 5, 6]);
  for (const p of json.practicas) {
    const dir = path.join(RAIZ, "cursos", "recursos", p.deck.split("/")[0], "presentaciones", p.deck.split("/")[1]);
    const ds = JSON.parse(fs.readFileSync(path.join(dir, "diapositivas.json"), "utf8")).diapositivas;
    cierto(p.deck + ": " + p.laminas.length + " láminas, cada una con su diapositiva e imagen",
      p.laminas.every((l) => ds[l.n - 1] && ds[l.n - 1].titulo === l.titulo && fs.existsSync(path.join(dir, ds[l.n - 1].imagen))));
    cierto(p.deck + ": ninguna lámina de respuestas, quiz, tarea ni receso", p.laminas.every((l) => !generador.NUNCA.test(l.titulo)),
      p.laminas.map((l) => l.titulo).join(" | "));
    cierto(p.deck + ": las láminas van en orden y sin repetir", p.laminas.every((l, k) => !k || l.n > p.laminas[k - 1].n));
    cierto(p.deck + ": la práctica entra en lo que acepta la base (de 1 a 40 láminas)", p.laminas.length >= 1 && p.laminas.length <= 40);
  }
  // La lámina de respuestas de cada sesión existe y NO está en la lista: si no, la prueba de arriba no probaría nada.
  const respuestas = json.practicas.map((p) => {
    const dir = path.join(RAIZ, "cursos", "recursos", p.deck.split("/")[0], "presentaciones", p.deck.split("/")[1]);
    const ds = JSON.parse(fs.readFileSync(path.join(dir, "diapositivas.json"), "utf8")).diapositivas;
    return ds.some((d) => /respuestas/i.test(d.titulo));
  });
  igual("cada sesión tiene láminas de respuestas que NO se mandan", respuestas, [true, true, true, true, true, true]);
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
  igual("la lista descarta una práctica mal armada", F.leerLista({ practicas: [{ deck: "x", titulo: "a", laminas: [{ n: 1 }] }, { deck: "formacion-ajedrez/clase-02", titulo: "ok", laminas: [{ n: 2 }] }] }).length, 1);
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
  igual("anuncia en la presencia lo que lleva (el profe lo ve)", await page.evaluate(() => (window.__tracks.filter((x) => x.formacion).slice(-1)[0].formacion)), { id: "abcd1234", h: [24] });
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
  igual("sin errores en consola (alumno)", errores, []);
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
  laParteQueNoTocaLaPagina();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaDelAlumno(browser);
    await pruebaDelProfe(browser);
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
