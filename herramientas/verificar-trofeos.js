/* Los trofeos de la clase: se acumulan y el profesor los puede ajustar.
 *
 * Cada respuesta que el profesor marca ✅ en sesion.html es un trofeo, y se
 * suman de clase en clase; el profesor, además, suma o quita a mano desde el
 * botón 🏆 del renglón del alumno. La cuenta la hace la base (trofeos_de) y el
 * ajuste lo valida ajustar_trofeos(): eso ya se comprobó con SQL de verdad,
 * impersonando al profesor, a la alumna y a un ajeno. Acá se comprueba lo que
 * la pantalla hace con eso:
 *
 *   1. EL PROFESOR AJUSTA AL ALUMNO QUE ES. El 🏆 de Ana abre el panel de Ana,
 *      con su total de verdad (respuestas correctas + ajustes), y +1 / −1 /
 *      una cantidad escrita mandan ajustar_trofeos con ESE alumno y ESA
 *      cantidad. Después del ajuste el total se vuelve a pedir, no se suma en
 *      el navegador.
 *   2. LO QUE NO SE PUEDE, NO SE MANDA. Una cantidad fuera de rango, cero, o
 *      quitar más de lo que tiene se dice escrito y no llega a la base.
 *   3. LA ALUMNA VE SUS TROFEOS Y CÓMO CRECEN. Su total aparece en la clase, y
 *      cuando el profesor la califica o le ajusta, se vuelve a contar solo.
 *
 * Usa el Supabase de mentira de verificar-clase-registrada.js, que cuenta los
 * trofeos igual que la base.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-trofeos.js                              */
const { chromium } = require("./lib/playwright-con-sesion");
const { abrir, igual, CHROME, fallos } = require("./verificar-clase-registrada.js");

const CLASE_ABIERTA = { id: "s-1", title: null, created_by: "u-profe",
                        ended_at: null, started_at: "2026-09-20T15:00:00Z", notes: null };
// Dos respuestas correctas de Ana y una a revisar: tiene 2 trofeos, no 3.
const SEMILLA = {
  question_answers: [
    { id: "qa-1", question_id: "q-1", student_id: "u-ana", moves: ["e4"], is_correct: true },
    { id: "qa-2", question_id: "q-2", student_id: "u-ana", moves: ["Nf3"], is_correct: true },
    { id: "qa-3", question_id: "q-3", student_id: "u-ana", moves: ["h4"], is_correct: false },
  ],
};

const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el && el.checkVisibility() ? "sí" : "no";
}, sel);
const ajustes = (page) => page.evaluate(() => (window.__rpcs || []).filter((r) => r.n === "ajustar_trofeos").map((r) => r.args));
const totalPanel = (page) => page.evaluate(() => {
  const el = document.querySelector("#trofeos-en-clase-body [data-trofeos-total]");
  return el ? el.textContent : null;
});

async function pruebaProfesor(browser) {
  console.log("\n=== El profesor ajusta los trofeos del alumno que es ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", CLASE_ABIERTA, SEMILLA);
  await page.evaluate(() => window.__entraAlumno());
  await page.click("#teacher-tab-alumnos");
  const boton = page.locator('#students-list button[aria-label="Trofeos e insignias de Ana Rojas"]');
  await boton.waitFor({ timeout: 8000 });
  igual("el panel de trofeos arranca cerrado", await seVe(page, "#trofeos-en-clase"), "no");
  await boton.click();
  igual("el 🏆 del renglón lo abre", await seVe(page, "#trofeos-en-clase"), "sí");
  igual("con el nombre de Ana", await page.textContent("#trofeos-en-clase-titulo"), "🏆 Trofeos e insignias de Ana Rojas");
  await page.waitForFunction(() => /trofeo/.test((document.querySelector("#trofeos-en-clase-body [data-trofeos-total]") || {}).textContent || ""), null, { timeout: 5000 });
  igual("su total cuenta solo las respuestas correctas (2 de 3)", await totalPanel(page), "🏆 2 trofeos");

  await page.click('#trofeos-en-clase-body button[aria-label="Sumar 1 trofeo"]');
  await page.waitForFunction(() => document.querySelector("#trofeos-en-clase-body [data-trofeos-total]").textContent === "🏆 3 trofeos", null, { timeout: 5000 });
  igual("+1 manda el ajuste con Ana y 1", JSON.stringify(await ajustes(page)),
    JSON.stringify([{ p_alumno: "u-ana", p_cantidad: 1, p_motivo: "" }]));
  igual("y el total se vuelve a pedir: 3", await totalPanel(page), "🏆 3 trofeos");

  await page.fill("#trofeos-en-clase-body input[type=number]", "4");
  await page.fill("#trofeos-en-clase-body input[type=text]", "Resolvió el mate de la pizarra");
  await page.click("#trofeos-en-clase-body button[type=submit]");
  await page.waitForFunction(() => document.querySelector("#trofeos-en-clase-body [data-trofeos-total]").textContent === "🏆 7 trofeos", null, { timeout: 5000 });
  igual("una cantidad escrita va con su motivo", JSON.stringify((await ajustes(page))[1]),
    JSON.stringify({ p_alumno: "u-ana", p_cantidad: 4, p_motivo: "Resolvió el mate de la pizarra" }));
  igual("el ajuste queda en la lista, con su motivo",
    await page.evaluate(() => document.getElementById("trofeos-en-clase-body").textContent.includes("+4Resolvió el mate de la pizarra")), "true");

  await page.click('#trofeos-en-clase-body button[aria-label="Quitar 1 trofeo"]');
  await page.waitForFunction(() => document.querySelector("#trofeos-en-clase-body [data-trofeos-total]").textContent === "🏆 6 trofeos", null, { timeout: 5000 });
  igual("−1 resta", (await ajustes(page))[2].p_cantidad, -1);

  console.log("\n=== Lo que no se puede, no se manda ===");
  for (const [valor, nombre] of [["0", "cero"], ["150", "más de 100"], ["-7", "quitar más de lo que tiene (6)"]]) {
    const antes = (await ajustes(page)).length;
    await page.fill("#trofeos-en-clase-body input[type=number]", valor);
    await page.click("#trofeos-en-clase-body button[type=submit]");
    await page.waitForTimeout(200);
    igual(nombre + ": no llega a la base", (await ajustes(page)).length, antes);
    igual(nombre + ": y lo dice escrito",
      await page.evaluate(() => document.querySelector("#trofeos-en-clase-body [aria-live]").textContent.startsWith("Guardando") ? "no" : "sí"), "sí");
  }

  console.log("\n=== El profesor le da una insignia, y la puede deshacer ===");
  const dar = page.locator('#trofeos-en-clase-body button[aria-label="Dar la insignia «Buena respuesta»"]');
  await dar.waitFor({ timeout: 5000 });
  igual("hay un botón por cada insignia del catálogo de la base",
    await page.locator('#trofeos-en-clase-body button[aria-label^="Dar la insignia"]').count(), 2);
  await page.fill('#trofeos-en-clase-body input[placeholder^="Por ejemplo: explicó"]', "Vio el jaque doble antes que nadie");
  await dar.click();
  await page.waitForFunction(() => (window.__rpcs || []).some((r) => r.n === "otorgar_insignia"), null, { timeout: 5000 });
  igual("manda otorgar_insignia con Ana, el tipo y el motivo",
    JSON.stringify((await page.evaluate(() => window.__rpcs.filter((r) => r.n === "otorgar_insignia")))[0].args),
    JSON.stringify({ p_alumno: "u-ana", p_tipo: "buena_respuesta", p_motivo: "Vio el jaque doble antes que nadie" }));
  await page.waitForFunction(() => /Ya tiene 1 insignia/.test(document.getElementById("trofeos-en-clase-body").textContent), null, { timeout: 5000 })
    .catch(() => {});
  igual("el panel dice cuántas tiene, con su nombre escrito",
    await page.evaluate(() => /Ya tiene 1 insignia.*Buena respuesta × 1/.test(document.getElementById("trofeos-en-clase-body").textContent)), "true");
  await page.click('#trofeos-en-clase-body button[aria-label="Deshacer la insignia «Buena respuesta»"]');
  await page.waitForFunction(() => (window.__rpcs || []).some((r) => r.n === "quitar_insignia"), null, { timeout: 5000 });
  igual("Deshacer quita ESA insignia", JSON.stringify((await page.evaluate(() => window.__rpcs.filter((r) => r.n === "quitar_insignia")))[0].args),
    JSON.stringify({ p_id: "ins-1" }));
  await page.waitForFunction(() => !/Ya tiene/.test(document.getElementById("trofeos-en-clase-body").textContent), null, { timeout: 5000 })
    .catch(() => {});
  igual("y deja de contarla", await page.evaluate(() => /Ya tiene/.test(document.getElementById("trofeos-en-clase-body").textContent)), "false");

  await page.click("#trofeos-en-clase-cerrar");
  igual("✖ Cerrar lo cierra", await seVe(page, "#trofeos-en-clase"), "no");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna ve sus trofeos y cómo crecen ===");
  const { page, ctx, errores } = await abrir(browser, "u-ana", CLASE_ABIERTA, SEMILLA);
  await page.waitForFunction(() => /trofeo/.test(document.getElementById("mis-trofeos-total").textContent), null, { timeout: 8000 });
  igual("se ve su contador", await seVe(page, "#mis-trofeos-total"), "sí");
  igual("con los trofeos que ya traía de otras clases", await page.textContent("#mis-trofeos-total"), "🏆 2 trofeos");

  // El profesor le suma 3 (lo que haría su ajustar_trofeos) y Realtime avisa.
  await page.evaluate(async () => {
    await sb.rpc("ajustar_trofeos", { p_alumno: "u-ana", p_cantidad: 3, p_motivo: "Buen trabajo" });
    window.__cambioEnBase("trofeos_ajustes", { alumno_id: "u-ana", cantidad: 3, motivo: "Buen trabajo" }, "INSERT");
  });
  await page.waitForFunction(() => document.getElementById("mis-trofeos-total").textContent === "🏆 5 trofeos", null, { timeout: 5000 })
    .catch(() => {});
  igual("el ajuste del profesor se suma solo", await page.textContent("#mis-trofeos-total"), "🏆 5 trofeos");
  igual("y se le avisa con el motivo", await page.textContent("#status-banner"), "🏆 Tu profesor te sumó 3 trofeos: Buen trabajo");

  // El profesor le cambia un ✅ por ❌: el trofeo se va solo, sin restar a mano.
  await page.evaluate(() => sb.from("question_answers").update({ is_correct: false }).eq("id", "qa-2"));
  await page.evaluate(() => window.__cambioEnBase("question_answers", { id: "qa-2", question_id: "q-2", student_id: "u-ana", is_correct: false }));
  await page.waitForFunction(() => document.getElementById("mis-trofeos-total").textContent === "🏆 4 trofeos", null, { timeout: 5000 })
    .catch(() => {});
  igual("un ✅ cambiado a ❌ resta el trofeo", await page.textContent("#mis-trofeos-total"), "🏆 4 trofeos");

  console.log("\n=== La alumna recibe una insignia en vivo ===");
  await page.evaluate(async () => {
    const { data } = await sb.rpc("otorgar_insignia", { p_alumno: "u-ana", p_tipo: "buen_estudiante", p_motivo: "Atenta toda la clase" });
    window.__cambioEnBase("insignias", data[0], "INSERT");
  });
  await page.waitForFunction(() => !document.getElementById("answer-feedback-toast").classList.contains("hidden"), null, { timeout: 5000 })
    .catch(() => {});
  igual("se le celebra con el aviso flotante", await seVe(page, "#answer-feedback-toast"), "sí");
  igual("que dice cuál insignia y por qué", await page.textContent("#answer-feedback-text"),
    "⭐ ¡Tu profe te dio la insignia «Estrella de buen estudiante»! Atenta toda la clase");
  await page.waitForFunction(() => /Estrella de buen estudiante/.test(document.getElementById("mis-insignias").textContent), null, { timeout: 5000 })
    .catch(() => {});
  igual("y queda en su panel, con el nombre escrito", await page.textContent("#mis-insignias"), "⭐ Estrella de buen estudiante × 1");

  igual("no ve el panel de ajustar", await seVe(page, "#trofeos-en-clase"), "no");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  const n = fallos();
  console.log(n ? "\n" + n + " fallo(s)." : "\nTodo bien: los trofeos se acumulan y el profesor los ajusta.");
  process.exit(n ? 1 : 0);
})();
