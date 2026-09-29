#!/usr/bin/env node
/* La participación oral en la clase: anotar cómo respondió quien tuvo el
   turno, y la cola de manos levantadas con «Darle la palabra».

   La base (migración participacion_oral_en_la_clase), comprobada
   impersonando: clase_elegidos guarda el origen ('azar' o 'mano') y el
   resultado ('bien', 'casi' o null); solo quien dio la clase lo anota, el
   alumno lee solo lo suyo y no se puede calificar, otro profe no cambia nada,
   y resumen_de_la_clase cuenta los turnos de cada uno.

   Aquí, con el doble de verificar-clase-registrada.js:
   - «✅ Bien» anota el resultado en la fila de ESE turno, termina el turno y
     la cuenta lo dice («1 vez: 1 bien»);
   - las manos levantadas salen en el orden en que se levantaron, con su
     puesto escrito, y «Darle la palabra» es un turno de origen 'mano' que le
     baja la mano;
   - al alumno le sale «¡Tienes la palabra!» (no «te eligieron») y los demás
     leen «Tu profe le dio la palabra a …»;
   - levantar la mano anuncia la hora (hand_at), que es lo que ordena la cola;
   - el resumen del cierre trae la columna «Participación».

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-participacion.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const fila = (elegido) => ({ id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, arrows: [], circles: [],
  active_player_color: "both", vista: null, comentarios: {}, elegido });
const hace = (s) => new Date(Date.now() - s * 1000).toISOString();

async function pruebaAnotar(browser) {
  console.log("\n=== Anotar cómo respondió ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila(null)] });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForSelector("#elegir-azar-btn", { state: "attached", timeout: 10000 });
  await page.evaluate(() => { activateTeacherTab("alumnos"); window.__entraAlumno(); });
  await page.click("#elegir-azar-btn");
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "clase_elegidos"), null, { timeout: 5000 });
  const turno = await page.evaluate(() => window.__inserts.filter((i) => i.tabla === "clase_elegidos").pop().fila);
  igual("el sorteo es un turno de origen 'azar'", [turno.student_id, turno.origen], ["u-ana", "azar"]);
  await page.click("#elegido-bien-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "clase_elegidos"), null, { timeout: 5000 });
  const nota = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "clase_elegidos").pop());
  igual("«Bien» se anota en la fila de ESE turno", [nota.campos, nota.donde.length === 1 && nota.donde[0][0]], [{ resultado: "bien" }, "id"]);
  await page.waitForTimeout(150);
  igual("y termina el turno", await page.evaluate(() => {
    const u = window.__updates.filter((x) => x.tabla === "game_state" && "elegido" in x.campos);
    return u[u.length - 1].campos.elegido;
  }), null);
  igual("la cuenta dice cómo le fue", await page.evaluate(() =>
    [...document.querySelectorAll("#elegidos-cuenta li")].map((li) => li.textContent)), ["Ana Rojas1 vez: 1 bien"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaManos(browser) {
  console.log("\n=== La cola de manos levantadas ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, { game_state: [fila(null)] });
  await page.waitForSelector("#students-list", { state: "attached", timeout: 10000 });
  await page.evaluate(() => activateTeacherTab("alumnos"));
  // Beto la levantó primero (hace 30 s), Ana después (hace 5 s): Ana llega
  // primero a la presencia, así que el orden no puede salir de la llegada.
  await page.evaluate((a) => {
    window.__ponerPresencia("u-ana", { full_name: "Ana Rojas", role: "alumno", hand_raised: true, hand_at: a.ana });
    window.__ponerPresencia("u-beto", { full_name: "Beto Mora", role: "alumno", hand_raised: true, hand_at: a.beto });
  }, { ana: hace(5), beto: hace(30) });
  await page.waitForFunction(() => document.querySelectorAll("#students-list li").length === 2, null, { timeout: 5000 });
  igual("en el orden en que la levantaron, con el puesto escrito", await page.evaluate(() =>
    [...document.querySelectorAll("#students-list li")].map((li) => li.querySelector("span").textContent)),
    ["🖐️ 1.ºBeto Mora", "🖐️ 2.ºAna Rojas"]);
  await page.click('#students-list li:first-child button[aria-label="Darle la palabra a Beto Mora"]');
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "clase_elegidos"), null, { timeout: 5000 });
  igual("darle la palabra es un turno de origen 'mano'", await page.evaluate(() => {
    const f = window.__inserts.filter((i) => i.tabla === "clase_elegidos").pop().fila;
    return [f.student_id, f.origen];
  }), ["u-beto", "mano"]);
  igual("la clase lo sabe", await page.evaluate(() => {
    const e = window.__updates.filter((u) => u.tabla === "game_state" && u.campos.elegido).pop().campos.elegido;
    return [e.id, e.motivo, e.nombre];
  }), ["u-beto", "mano", "Beto Mora"]);
  igual("el profe ve quién tiene la palabra", [await page.textContent("#elegido-titulo"), await page.textContent("#elegido-nombre")],
    ["Tiene la palabra:", "Beto Mora"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumnos(browser) {
  console.log("\n=== Lo que ven los alumnos cuando es por mano levantada ===");
  const elegido = { id: "u-ana", at: new Date().toISOString(), nombre: "Ana Rojas", motivo: "mano" };
  let r = await abrir(browser, "u-ana", CLASE, { game_state: [fila(elegido)] });
  await r.page.waitForFunction(() => !document.getElementById("elegido-overlay").classList.contains("hidden"), null, { timeout: 10000 });
  igual("a quien la pidió: «¡Tienes la palabra!»", await r.page.textContent("#elegido-overlay-titulo"), "¡Tienes la palabra!");
  // Levantar la mano anuncia la hora: es lo que ordena la cola del profe.
  await r.page.click("#elegido-overlay-ok");
  await r.page.click("#raise-hand-btn");
  await r.page.waitForTimeout(200);
  igual("levantar la mano anuncia la hora", await r.page.evaluate(() => {
    const t = (window.__tracks || []).filter((x) => x.hand_raised).pop();
    return !!(t && typeof t.hand_at === "string");
  }), true);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();

  r = await abrir(browser, "u-ana", CLASE, { game_state: [fila({ id: "u-beto", at: new Date().toISOString(), nombre: "Beto Mora", motivo: "mano" })] });
  await r.page.waitForSelector("#chessboard [data-square]", { timeout: 10000 });
  await r.page.waitForTimeout(300);
  igual("los demás: «le dio la palabra a …»", await r.page.textContent("#elegido-otro"), "🎯 Tu profe le dio la palabra a Beto Mora.");
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();
}

async function pruebaResumen(browser) {
  console.log("\n=== El resumen del cierre trae la participación ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE, {
    class_attendance: [{ session_id: "c-viva", student_id: "u-ana" }],
    clase_elegidos: [
      { id: "e1", class_session_id: "c-viva", student_id: "u-ana", origen: "azar", resultado: "bien" },
      { id: "e2", class_session_id: "c-viva", student_id: "u-ana", origen: "mano", resultado: "casi" },
      { id: "e3", class_session_id: "c-viva", student_id: "u-ana", origen: "mano", resultado: null },
    ],
  });
  await page.waitForSelector("#clase-cerrar-btn:not(.hidden)", { timeout: 10000 });
  await page.click("#clase-cerrar-btn");
  await page.waitForFunction(() => /turnos de palabra/.test(document.getElementById("clase-resumen").textContent), null, { timeout: 5000 });
  igual("el titular los cuenta", await page.textContent("#clase-resumen p"), "En esta clase: 3 turnos de palabra.");
  igual("con su columna", await page.evaluate(() =>
    [...document.querySelectorAll("#clase-resumen thead th")].map((t) => t.textContent)).then((c) => c.includes("Participación")), true);
  igual("y la fila dice cómo le fue", await page.evaluate(() =>
    [...document.querySelectorAll("#clase-resumen tbody tr")][0].lastChild.textContent), "3 turnos: 1 bien, 1 casi, 1 sin anotar");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAnotar(browser);
    await pruebaManos(browser);
    await pruebaAlumnos(browser);
    await pruebaResumen(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: la participación queda anotada y las manos van en orden.");
  process.exit(fallos ? 1 : 0);
})();
