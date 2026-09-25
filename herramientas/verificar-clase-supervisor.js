#!/usr/bin/env node
/* Comprueba que quien SUPERVISA pueda mirar la clase en vivo de uno de sus
   profesores (sesion.html?observar=<id>) y que SOLO mire.

   Lo que se rompe acá no da ningún error: una supervisora que «mira» y de paso
   queda anotada como alumna en la asistencia, o abre una clase a su nombre, o
   aparece en la lista de alumnos del profesor, ensucia justo los registros que
   después va a revisar. Así que se comprueba, en un navegador de verdad:

   - que con la clase abierta se monte el tablero con el panel de quien observa
     (y ninguna herramienta del profesor ni del alumno);
   - que NO se escriba nada: ni asistencia, ni tiempo en clase, ni una clase
     nueva, ni el tablero;
   - que entre a la presencia como "supervision" (no como alumno), vea quién
     está conectado, y que el profesor vea que lo están mirando;
   - que el enlace de la videollamada salga solo si es https;
   - que sin clase abierta lo diga en palabras y lleve de vuelta a Supervisión;
   - que al cerrarse la clase vuelva a Supervisión;
   - y que un alumno con ?observar= en la dirección siga siendo un alumno.

   Lo que de verdad puede leer lo decide la RLS (game_state_select_supervisor y
   compañía, comprobadas impersonando roles en SQL). Reusa el doble de
   verificar-clase-registrada.js.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-clase-supervisor.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const R = require("./verificar-clase-registrada.js");

const { abrir, PROFE, ALUMNA, CHROME } = R;
const SUP = { id: "u-sup", role: "profesor", is_admin: false, es_coordinador: false, es_supervisor: true,
              full_name: "Marta Solano", email: "marta@x.cr", grupo: null };
const PERFILES = [PROFE, ALUMNA, SUP];
const CLASE = { id: "c-viva", created_by: "u-profe", started_at: new Date().toISOString(), ended_at: null };
const SALAS = [
  { profesor_id: "u-profe", grupo: "", enlace: "https://meet.jit.si/clase-karina" },
  { profesor_id: "u-profe", grupo: "7B", enlace: "javascript:alert(1)" },
];

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  return !!(el && el.checkVisibility());
}, id);

async function pruebaMira(browser) {
  console.log("\n=== La supervisora mira la clase abierta de Karina ===");
  const { page, ctx, errores } = await abrir(browser, SUP.id, CLASE,
    { profiles: PERFILES, profesor_videollamada: SALAS }, { ruta: "/sesion.html?observar=u-profe" });
  igual("se monta la clase", await seVe(page, "app"), true);
  igual("con el panel de quien observa", await seVe(page, "observador-panel"), true);
  igual("rótulo", await page.textContent("#role-badge"), "👁 Supervisión");
  igual("dice de quién es la clase y que solo mira",
        /Clase de Karina Rojas\. Solo miras/.test(await page.textContent("#observador-texto")), true);
  igual("sin herramientas del profesor", await seVe(page, "teacher-toolbar"), false);
  igual("sin el panel del alumno", await seVe(page, "student-panel"), false);
  igual("sin levantar la mano", await seVe(page, "raise-hand-btn"), false);
  igual("sin abrir ni cerrar la clase", await seVe(page, "clase-estado"), false);
  igual("la videollamada, solo la https",
        await page.$$eval("#observador-llamadas a", (as) => as.map((a) => a.getAttribute("href"))),
        ["https://meet.jit.si/clase-karina"]);
  igual("entra a la presencia como supervisión, no como alumna",
        await page.evaluate(() => (window.__tracks || []).map((t) => t.role)), ["supervision"]);
  await page.evaluate(() => window.__entraAlumno());
  igual("ve quién está conectado",
        await page.textContent("#observador-conectados"), "Conectados ahora (1): Ana Rojas.");
  igual("no escribió NADA (ni asistencia, ni tiempo, ni clase, ni tablero)",
        await page.evaluate(() => ({ i: window.__inserts.map((x) => x.tabla), u: window.__updates.map((x) => x.tabla) })),
        { i: [], u: [] });
  // El profesor cierra la clase: vuelve a Supervisión.
  await Promise.all([
    page.waitForURL(/supervision\.html/, { timeout: 10000 }),
    page.evaluate(() => window.__cambioEnBase("class_sessions",
      { id: "c-viva", created_by: "u-profe", ended_at: new Date().toISOString() }, "UPDATE")),
  ]);
  igual("al cerrarse la clase vuelve a Supervisión", /supervision\.html$/.test(page.url()), true);
  igual("sin errores en consola", errores.filter((e) => !/supervision/.test(e)), []);
  await ctx.close();
}

async function pruebaSinClase(browser) {
  console.log("\n=== Sin clase abierta ===");
  const { page, ctx, errores } = await abrir(browser, SUP.id, null,
    { profiles: PERFILES }, { ruta: "/sesion.html?observar=u-profe" });
  igual("no monta la clase", await seVe(page, "app"), false);
  igual("lo dice en palabras", /Karina Rojas no tiene la clase abierta ahora/.test(await page.textContent("#sin-clase-texto")), true);
  igual("y lleva de vuelta a Supervisión", await page.getAttribute("#sin-clase a[href]", "href"), "supervision.html");
  igual("no escribió nada", await page.evaluate(() => window.__inserts.length + window.__updates.length), 0);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaElProfesorLoVe(browser) {
  console.log("\n=== El profesor ve que lo están mirando ===");
  const { page, ctx, errores } = await abrir(browser, PROFE.id, CLASE, { profiles: PERFILES });
  igual("sin nadie mirando, no dice nada", await seVe(page, "observadores"), false);
  await page.evaluate(() => window.__entraSupervision());
  igual("con la supervisora mirando, lo dice",
        await page.textContent("#observadores"), "👁 Marta Solano (supervisión) está mirando la clase.");
  igual("y la supervisora no aparece como alumna",
        /Marta/.test(await page.textContent("#students-list")), false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAlumnaNoObserva(browser) {
  console.log("\n=== Una alumna con ?observar= sigue siendo alumna ===");
  const { page, ctx } = await abrir(browser, ALUMNA.id, CLASE,
    { profiles: PERFILES }, { ruta: "/sesion.html?observar=u-profe" });
  igual("rótulo", await page.textContent("#role-badge"), "Alumno");
  igual("sin el panel de quien observa", await seVe(page, "observador-panel"), false);
  igual("marca su asistencia como siempre",
        await page.evaluate(() => window.__inserts.some((x) => x.tabla === "class_attendance")), true);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaMira(browser);
    await pruebaSinClase(browser);
    await pruebaElProfesorLoVe(browser);
    await pruebaAlumnaNoObserva(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: quien supervisa mira la clase y solo mira.");
  process.exit(fallos ? 1 : 0);
})();
