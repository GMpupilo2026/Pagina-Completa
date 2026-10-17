#!/usr/bin/env node
/* Practicar contra el motor: el profe elige cuántos intentos tiene cada alumno.

   La base (migración practica_intentos_por_alumno), comprobada impersonando a
   una alumna en un bloque que se deshace solo: su fila arranca en el intento 1
   aunque mande 0; una partida terminada no vuelve a «playing» sin gastar un
   intento; reintentar suma exactamente uno (ni vuelve a 1 ni salta); con tope
   2, el 3.º lo rechaza («Ya usaste tus 2 intentos de esta práctica.»), y si el
   profe sube el tope a 3, pasa.

   Aquí, con el doble de verificar-clase-registrada.js:

   - el tope elegido viaja en la ronda (crearPractica, la única puerta) y «Sin
     límite» manda null;
   - con la ronda en curso, el profe lo cambia y se escribe en la ronda;
   - la grilla del profe dice «intento 2 de 3»;
   - la alumna ve «Intento 1 de 3», reintenta y pasa a «Intento 2 de 3»;
   - con los intentos gastados no se le ofrece «Reintentar», ni escribiéndolo,
     y se le dice; si el profe le da uno más, vuelve el botón;
   - sin tope, todo como antes: «Reintentar» siempre y sin texto de intentos;
   - «Revisar los intentos» (también con la ronda cerrada) lista los de cada
     alumno, del primero al último, y «📺 Mostrar» pasa las jugadas de ese
     intento al tablero de la clase como variante, con o sin su nombre.

   Las jugadas de cada intento las guarda la base (migración
   practica_guarda_cada_intento): comprobado impersonando a una alumna que
   reintenta dos veces —quedan sus dos intentos con jugadas y resultado— y que
   no puede insertarlos, cambiarlos ni borrarlos; su profe los ve y otro alumno no.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-practica-intentos.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, CHROME } = R;
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const FINAL = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const ronda = (extra) => Object.assign({ id: "p1", fen: FINAL, level: "1500", created_by: "u-profe", reloj_segundos: null,
  incremento_segundos: 0, created_at: new Date().toISOString(), ended_at: null }, extra);
const partida = (extra) => Object.assign({ id: "pg1", session_id: "p1", student_id: "u-ana", fen: FINAL, moves: [],
  status: "playing", student_color: "w", attempts: 1 }, extra);

async function pruebaProfesor(browser) {
  console.log("\n=== El profe elige los intentos ===");
  let r = await abrir(browser, "u-profe", CLASE, {});
  await r.page.waitForFunction(() => document.querySelectorAll("#practice-reloj option").length > 0, null, { timeout: 10000 });
  await r.page.evaluate(() => activateTeacherTab("practicar"));
  igual("por omisión, sin límite", await r.page.inputValue("#practice-intentos"), "");
  await r.page.selectOption("#practice-intentos", "3");
  await r.page.click("#start-practice-btn");
  await r.page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "practice_sessions"), null, { timeout: 5000 });
  igual("la ronda lleva el tope", await r.page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "practice_sessions").pop().fila.max_intentos), 3);
  await r.page.evaluate(() => { window.__inserts.length = 0; });
  await r.page.selectOption("#practice-intentos", "");
  await r.page.evaluate(() => crearPractica("8/8/8/8/8/8/8/K6k w - - 0 1", "1500"));
  igual("«Sin límite» manda null", await r.page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "practice_sessions").pop().fila.max_intentos), null);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();

  console.log("\n=== Con la ronda en curso ===");
  r = await abrir(browser, "u-profe", CLASE, {
    practice_sessions: [ronda({ max_intentos: 3 })],
    practice_games: [partida({ status: "resigned", attempts: 2 })],
  });
  await r.page.evaluate(() => activateTeacherTab("practicar"));
  await r.page.waitForFunction(() => /intento/.test((document.querySelector(".practice-mini-status") || {}).textContent || ""), null, { timeout: 10000 });
  igual("la grilla dice de cuántos", await r.page.textContent(".practice-mini-status"), "🏳️ Se rindió · intento 2 de 3");
  igual("el selector de la ronda dice el tope", await r.page.inputValue("#practice-intentos-activa"), "3");
  igual("y se ve", await seVe(r.page, "#practice-intentos-activa"), true);
  await r.page.selectOption("#practice-intentos-activa", "5");
  await r.page.waitForFunction(() => window.__updates.some((u) => u.tabla === "practice_sessions" && "max_intentos" in u.campos), null, { timeout: 5000 });
  igual("cambiarlo se escribe en la ronda", await r.page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "practice_sessions" && "max_intentos" in u.campos).pop().campos), { max_intentos: 5 });
  igual("y se dice", await r.page.textContent("#practice-intentos-msg"), "Ahora cada alumno tiene 5 intentos.");
  igual("la grilla se pone al día", await r.page.textContent(".practice-mini-status"), "🏳️ Se rindió · intento 2 de 5");
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna con tres intentos ===");
  let r = await abrir(browser, "u-ana", CLASE, {
    practice_sessions: [ronda({ max_intentos: 3 })],
    practice_games: [partida({ status: "resigned", attempts: 1 })],
  });
  await r.page.waitForFunction(() => /Intento/.test(document.getElementById("practice-intentos-alumno").textContent), null, { timeout: 10000 });
  igual("ve cuál juega", await r.page.textContent("#practice-intentos-alumno"), "Intento 1 de 3.");
  igual("le quedan: puede reintentar", await seVe(r.page, "#practice-retry-btn"), true);
  await r.page.click("#practice-retry-btn");
  await r.page.waitForFunction(() => window.__updates.some((u) => u.tabla === "practice_games" && u.campos.attempts === 2), null, { timeout: 5000 });
  igual("y pasa al segundo", await r.page.textContent("#practice-intentos-alumno"), "Intento 2 de 3.");
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();

  console.log("\n=== Con los intentos gastados ===");
  r = await abrir(browser, "u-ana", CLASE, {
    practice_sessions: [ronda({ max_intentos: 3 })],
    practice_games: [partida({ status: "checkmate_loss", attempts: 3 })],
  });
  await r.page.waitForFunction(() => /intentos/.test(document.getElementById("practice-intentos-alumno").textContent), null, { timeout: 10000 });
  igual("se le dice", await r.page.textContent("#practice-intentos-alumno"), "Usaste tus 3 intentos.");
  igual("no se le ofrece «Reintentar»", await seVe(r.page, "#practice-retry-btn"), false);
  igual("ni escribiéndolo", await r.page.evaluate(() => {
    const c = document.querySelector("#practice-cmd input");
    return !!c;
  }) ? await escribir(r.page, "reintentar") : "sin cuadro", "Usaste tus 3 intentos. No quedan intentos.");
  igual("y no se escribió nada", await r.page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "practice_games" && "attempts" in u.campos).length), 0);
  await r.page.evaluate((f) => window.__cambioEnBase("practice_sessions", f), ronda({ max_intentos: 4 }));
  await r.page.waitForFunction(() => /Intento 3 de 4/.test(document.getElementById("practice-intentos-alumno").textContent), null, { timeout: 5000 });
  igual("si el profe le da uno más, vuelve el botón", await seVe(r.page, "#practice-retry-btn"), true);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();

  console.log("\n=== Un solo intento ===");
  r = await abrir(browser, "u-ana", CLASE, {
    practice_sessions: [ronda({ max_intentos: 1 })],
    practice_games: [partida({ status: "draw", attempts: 1 })],
  });
  await r.page.waitForFunction(() => /intento/.test(document.getElementById("practice-intentos-alumno").textContent), null, { timeout: 10000 });
  igual("se le dice", await r.page.textContent("#practice-intentos-alumno"), "Esta práctica era de un solo intento.");
  igual("sin «Reintentar»", await seVe(r.page, "#practice-retry-btn"), false);
  await r.ctx.close();

  console.log("\n=== Sin tope, como siempre ===");
  r = await abrir(browser, "u-ana", CLASE, {
    practice_sessions: [ronda({ max_intentos: null })],
    practice_games: [partida({ status: "resigned", attempts: 7 })],
  });
  await r.page.waitForFunction(() => !document.getElementById("practice-retry-btn").classList.contains("hidden"), null, { timeout: 10000 });
  igual("«Reintentar» a la vista", await seVe(r.page, "#practice-retry-btn"), true);
  igual("y sin texto de intentos", await r.page.textContent("#practice-intentos-alumno"), "");
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();
}

async function pruebaRevisar(browser) {
  console.log("\n=== Revisar los intentos de la ronda (ya terminada) ===");
  const r = await abrir(browser, "u-profe", CLASE, {
    game_state: [{ id: 7, owner_id: "u-profe", fen: FINAL, moves: [], start_fen: FINAL, arrows: [], circles: [],
      active_player_color: "both", vista: null, comentarios: {} }],
    practice_sessions: [ronda({ max_intentos: 3, ended_at: new Date().toISOString() })],
    practice_games: [partida({ status: "resigned", attempts: 3, moves: ["Kh1"], profiles: { full_name: "Ana Rojas" } })],
    practice_intentos: [
      { student_id: "u-ana", session_id: "p1", intento: 2, status: "checkmate_win", moves: ["Ra8#"] },
      { student_id: "u-ana", session_id: "p1", intento: 1, status: "draw", moves: ["Kf1", "Kf8"] },
    ],
  });
  await r.page.evaluate(() => activateTeacherTab("practicar"));
  await r.page.waitForFunction(() => !document.getElementById("practice-revisar").hidden, null, { timeout: 10000 });
  igual("con la ronda cerrada, el apartado se ve", await seVe(r.page, "#practice-revisar-btn"), true);
  igual("y la lista arranca cerrada", await r.page.getAttribute("#practice-revisar-btn", "aria-expanded"), "false");
  await r.page.click("#practice-revisar-btn");
  await r.page.waitForFunction(() => document.querySelectorAll("#practice-revisar-lista li").length === 3, null, { timeout: 5000 });
  igual("dice que está abierta", await r.page.getAttribute("#practice-revisar-btn", "aria-expanded"), "true");
  igual("los tres intentos, en orden, con cómo terminaron", await r.page.evaluate(() =>
    [...document.querySelectorAll("#practice-revisar-lista li span")].map((e) => e.textContent)), [
    "Intento 1 · 🤝 Tablas · 2 jugadas",
    "Intento 2 · 🏆 Ganó por jaque mate · 1 jugada",
    "Intento 3 · 🏳️ Se rindió · 1 jugada",
  ]);
  igual("con el nombre del alumno", await r.page.textContent("#practice-revisar-lista p"), "Ana Rojas");
  await r.page.getByRole("button", { name: "Mostrar a la clase el intento 1 de Ana Rojas" }).click();
  await r.page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state" && u.campos.vista), null, { timeout: 5000 });
  const vista = await r.page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state" && u.campos.vista).pop().campos.vista);
  igual("la clase ve las jugadas de ese intento, como variante", [vista.path, vista.root], [["Kf1", "Kf8"], 0]);
  igual("sin su nombre, si el profe no lo pidió", vista.respuesta, { nombre: null });
  igual("la partida de la clase no se toca", await r.page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "game_state" && "moves" in u.campos).length), 0);
  await r.page.check("#practica-mostrar-con-nombre");
  await r.page.getByRole("button", { name: "Mostrar a la clase el intento 2 de Ana Rojas" }).click();
  await r.page.waitForFunction(() => {
    const v = window.__updates.filter((u) => u.tabla === "game_state" && u.campos.vista).pop().campos.vista;
    return v.path.join() === "Ra8#";
  }, null, { timeout: 5000 });
  igual("con su nombre, si el profe lo marca", await r.page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "game_state" && u.campos.vista).pop().campos.vista.respuesta), { nombre: "Ana Rojas" });
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();

  const a = await abrir(browser, "u-ana", CLASE, {
    practice_sessions: [ronda({ max_intentos: 3 })],
    practice_games: [partida({ status: "resigned", attempts: 1 })],
  });
  await a.page.waitForFunction(() => /Intento/.test(document.getElementById("practice-intentos-alumno").textContent), null, { timeout: 10000 });
  igual("la alumna no ve el apartado del profe", await seVe(a.page, "#practice-revisar"), false);
  await a.ctx.close();
}

// Lo que contesta el cuadro de comandos de la práctica al escribir algo.
async function escribir(page, texto) {
  // El cuadro se muestra solo en Modo Adaptado; lo que contesta es lo mismo.
  await page.evaluate((t) => {
    const input = document.querySelector("#practice-cmd input");
    input.value = t;
    input.form.requestSubmit();
  }, texto);
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const vivas = [...document.querySelectorAll("#practice-cmd [aria-live], #practice-cmd [role=status]")];
    return vivas.map((v) => v.textContent.trim()).filter(Boolean).pop() || "";
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumna(browser);
    await pruebaRevisar(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: los intentos de la práctica.");
  process.exit(fallos ? 1 : 0);
})();
