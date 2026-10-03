#!/usr/bin/env node
/* Sacar a un alumno de la clase en vivo, por si alguien entró por error.

   La base (migración clase_sacados), comprobada impersonando: solo el dueño
   de la clase (o quien administra) saca y deja volver; nadie escribe la
   tabla directo; el sacado ya no puede marcar asistencia ni tiempo en clase,
   ni contestar las preguntas, ni guardar el calentamiento de ESA clase; al
   dejarlo volver, puede de nuevo.

   Aquí, con el doble de verificar-clase-registrada.js:
   - el profe tiene el 🚪 en el renglón del alumno; con confirmación, llama a
     sacar_de_la_clase, avisa por el canal («sacar»), el alumno sale de la
     lista y aparece en «Sacados de esta clase»;
   - si una pestaña vieja del sacado se sigue anunciando, el profe no lo ve;
   - «Dejarlo volver» llama a dejar_volver_a_la_clase y lo quita de la lista;
   - el alumno que recibe el aviso pregunta a la base: si de verdad lo
     sacaron, se le cierra la clase («Tu profe te sacó de esta clase») y se
     desconecta; un aviso falso (la base dice que no) no le hace nada;
   - si recarga estando sacado, no entra: ni asistencia ni tiempo en clase.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-sacar.js
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
const nombres = (page) => page.evaluate(() => [...document.querySelectorAll("#students-list li .truncate")].map((x) => x.textContent));

async function pruebaProfe(browser) {
  console.log("\n=== El profe saca a un alumno y lo deja volver ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE);
  await page.waitForSelector("#students-list", { state: "attached", timeout: 10000 });
  await page.evaluate(() => {
    window.__ponerPresencia("u-ana", { full_name: "Ana Rojas", role: "alumno" });
    window.__ponerPresencia("u-beto", { full_name: "Beto Mora", role: "alumno" });
  });
  await page.waitForFunction(() => document.querySelectorAll("#students-list li").length === 2, null, { timeout: 5000 });
  igual("sin nadie sacado, la lista de sacados no se ve", await seVe(page, "#sacados-caja"), false);

  // Cancelar no hace nada.
  await page.click('#students-list button[aria-label="Sacar a Beto Mora de la clase"]');
  await page.click("[data-avisos-cancelar]");
  await page.waitForTimeout(200);
  igual("si se arrepiente, no saca a nadie", await page.evaluate(() => (window.__rpcs || []).filter((r) => r.n === "sacar_de_la_clase").length), 0);

  await page.click('#students-list button[aria-label="Sacar a Beto Mora de la clase"]');
  await page.getByRole("button", { name: "Sacarlo de la clase" }).click();
  await page.waitForFunction(() => document.querySelectorAll("#students-list li").length === 1, null, { timeout: 5000 });
  igual("llama a la base con la clase y el alumno", await page.evaluate(() =>
    (window.__rpcs || []).filter((r) => r.n === "sacar_de_la_clase").map((r) => r.args)), [{ p_clase: "c-viva", p_alumno: "u-beto" }]);
  igual("le avisa por el canal", await page.evaluate(() =>
    (window.__difusiones || []).filter((d) => d.event === "sacar").map((d) => d.payload)), [{ studentId: "u-beto" }]);
  igual("sale de la lista de conectados", await nombres(page), ["Ana Rojas"]);
  igual("y aparece en «Sacados de esta clase»", [await seVe(page, "#sacados-caja"),
    await page.textContent("#sacados-cuenta")], [true, "(1)"]);

  // Una pestaña vieja suya que se sigue anunciando no lo devuelve a la lista.
  await page.evaluate(() => window.__ponerPresencia("u-beto", { full_name: "Beto Mora", role: "alumno" }));
  await page.waitForTimeout(150);
  igual("aunque se siga anunciando, el profe no lo ve conectado", await nombres(page), ["Ana Rojas"]);

  await page.click("#sacados-caja summary");
  await page.click('#sacados-lista button[aria-label="Dejar volver a Beto Mora"]');
  await page.waitForFunction(() => document.getElementById("sacados-caja").hidden, null, { timeout: 5000 });
  igual("«Dejarlo volver» llama a la base", await page.evaluate(() =>
    (window.__rpcs || []).filter((r) => r.n === "dejar_volver_a_la_clase").map((r) => r.args)), [{ p_clase: "c-viva", p_alumno: "u-beto" }]);
  await page.evaluate(() => window.__ponerPresencia("u-beto", { full_name: "Beto Mora", role: "alumno" }));
  await page.waitForFunction(() => document.querySelectorAll("#students-list li").length === 2, null, { timeout: 5000 });
  igual("y vuelve a aparecer cuando se conecta", (await nombres(page)).sort(), ["Ana Rojas", "Beto Mora"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumno(browser) {
  console.log("\n=== Al alumno: el aviso, el aviso falso y la recarga ===");
  // Un aviso falso: la base no dice que lo sacaron.
  let r = await abrir(browser, "u-ana", CLASE);
  await r.page.waitForSelector("#app:not(.hidden)", { timeout: 10000 });
  await r.page.evaluate(() => window.__difundir("sacar", { studentId: "u-ana" }));
  await r.page.waitForTimeout(300);
  igual("un aviso sin respaldo en la base no le cierra la clase", [await seVe(r.page, "#app"), await seVe(r.page, "#sin-clase")], [true, false]);

  // Ahora sí lo sacaron (la base lo dice) y llega el aviso.
  await r.page.evaluate(() => {
    window.__tablas.clase_sacados.push({ class_session_id: "c-viva", student_id: "u-ana", devuelto_at: null });
    window.__difundir("sacar", { studentId: "u-beto" });
  });
  await r.page.waitForTimeout(300);
  igual("el aviso para otro no le hace nada", await seVe(r.page, "#app"), true);
  await r.page.evaluate(() => window.__difundir("sacar", { studentId: "u-ana" }));
  await r.page.waitForFunction(() => !document.getElementById("sin-clase").classList.contains("hidden"), null, { timeout: 5000 });
  igual("se le cierra la clase y se le dice por qué", [await seVe(r.page, "#app"), await seVe(r.page, "#sin-clase"),
    await r.page.textContent("#sin-clase h1")], [false, true, "Tu profe te sacó de esta clase"]);
  igual("se desconecta de todo", await r.page.evaluate(() => !!window.__desconectado), true);
  igual("puede intentar de nuevo o volver al panel", [await seVe(r.page, "#sin-clase-reintentar"),
    await seVe(r.page, '#sin-clase a[href="clases.html"]')], [true, true]);
  igual("el foco va al título (el lector de pantalla lo dice)", await r.page.evaluate(() => document.activeElement && document.activeElement.tagName), "H1");
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();

  // Recarga estando sacada: no entra.
  r = await abrir(browser, "u-ana", CLASE, { clase_sacados: [{ class_session_id: "c-viva", student_id: "u-ana", devuelto_at: null }] });
  await r.page.waitForSelector("#sin-clase:not(.hidden)", { timeout: 10000 });
  await r.page.waitForTimeout(400);
  igual("al recargar sigue afuera", [await seVe(r.page, "#app"), await r.page.textContent("#sin-clase h1")], [false, "Tu profe te sacó de esta clase"]);
  igual("ni asistencia ni tiempo en clase", await r.page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "class_attendance" || i.tabla === "class_presence_log").length), 0);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();

  // Si el profe lo dejó volver (devuelto_at), entra normal.
  r = await abrir(browser, "u-ana", CLASE, { clase_sacados: [{ class_session_id: "c-viva", student_id: "u-ana", devuelto_at: new Date().toISOString() }] });
  await r.page.waitForSelector("#app:not(.hidden)", { timeout: 10000 });
  igual("dejado volver, entra a la clase y marca asistencia", [await seVe(r.page, "#app"), await r.page.evaluate(() =>
    window.__inserts.some((i) => i.tabla === "class_attendance"))], [true, true]);
  igual("sin errores en consola", r.errores, []);
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfe(browser);
    await pruebaAlumno(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el profe saca y deja volver, y el alumno sacado queda afuera.");
  process.exit(fallos ? 1 : 0);
})();
