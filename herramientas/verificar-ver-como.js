#!/usr/bin/env node
/* Comprueba «Ver como» una persona: quien supervisa mira el panel de uno de
   SUS profesores o coordinadores (y quien administra, el de cualquiera).

   Lo que se rompe acá se rompe callado —el panel se ve perfecto con los
   números de otra persona—, así que se mira en un navegador de verdad:

   - que la lista de a quién se puede mirar salga de la BASE
     (personas_para_ver_como) y se ofrezca agrupada;
   - que al mirar a alguien los números de «Su semana» se pidan con SU id a
     panel_profesor_de() —y no a panel_profesor(), que contestaría con los de
     quien mira—, y que las tarjetas de coordinación sean las que ESA persona
     tiene (funciones_coordinador_de con su id);
   - que no se pinte nada de dar clase (abrir una clase desde ahí la abriría a
     nombre de quien mira) y que la franja diga de quién es el panel;
   - que clases.html?ver_como=<id> (el «Ver su panel» de supervision.html) solo
     fije a alguien que está en la lista;
   - que una persona guardada por OTRA cuenta, o que ya no está en la lista,
     no le cambie nada a quien entra;
   - (lo de Informes —los alumnos de esa persona, con
     alumnos_de_para_ver_como— lo comprueba verificar-informes.js).

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-ver-como.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const P = require("./verificar-panel.js");

const { panel, BASE, CHROME, ADMIN } = P;
const SUP = { id: "u-sup", role: "profesor", is_admin: false, es_coordinador: false, es_supervisor: true,
              full_name: "Marta Solano", email: "marta@x.cr", grupo: null };
const PROFE_X = { id: "u-x", role: "profesor", is_admin: false, es_coordinador: false, es_supervisor: false,
                  full_name: "Profe Cualquiera", email: "x@x.cr", grupo: null };

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

const PERSONAS = [
  { id: "u-coord", nombre: "Carla Mora", es_coordinador: true },
  { id: "u-karina", nombre: "Karina Rojas", es_coordinador: false },
];
const PANEL_DE = [{ alumnos: 49, activos_7d: 26, tareas_pendientes: 26, tareas_vencidas: 1, tareas_puestas: 31,
                    clases_30d: 3, clases_dadas: 3, con_diagnostico: 29, con_plan: 10 }];
const DATOS = { rpc: {
  personas_para_ver_como: PERSONAS,
  panel_profesor_de: PANEL_DE,
  // A Carla le apagaron cobros: la tarjeta no se le pinta.
  funciones_coordinador_de: ["formularios", "altas", "solicitudes", "cuentas", "acceso", "equipos", "subgrupos"],
  panel_profesor: [{ alumnos: 999 }],
  mi_gente: [{ total: 12 }], mis_supervisados: [], informes_inactivos: [],
} };

const CON_PERSONA = (p, de) => ({
  storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [
    { name: "ver_como_persona_v1", value: JSON.stringify(Object.assign({ de }, p)) }] }] },
});

const LEER = () => ({
  enlaces: Array.from(document.querySelectorAll("#tile-grid a[href]")).map((a) => a.getAttribute("href")),
  badge: document.getElementById("role-badge").textContent,
  barra: document.getElementById("modo-vista-barra") && document.getElementById("modo-vista-barra").checkVisibility()
    ? document.getElementById("modo-vista-barra").textContent : null,
  rpcs: window.__consultas.map((c) => c.tabla + (c.args ? " " + JSON.stringify(c.args) : "")),
  // De quién se preguntó si tiene la clase abierta.
  clases: window.__consultas.filter((c) => c.tabla === "class_sessions").map((c) => c.eq.created_by),
  mirar: document.getElementById("mirar-clase") ? document.getElementById("mirar-clase").getAttribute("href") : null,
  alumnos: document.getElementById("profe-alumnos").textContent,
  registro: document.getElementById("registro-clases").checkVisibility(),
  sesion: document.getElementById("session-status-card").checkVisibility(),
  semana: document.getElementById("progreso-profe").checkVisibility(),
  guardada: localStorage.getItem("ver_como_persona_v1"),
});

async function pruebaSelector(browser) {
  console.log("\n=== El supervisor en su vista: el selector sale de la base ===");
  const { page, ctx, errores } = await panel(browser, [SUP], SUP.id, null, DATOS);
  const opciones = await page.evaluate(() => {
    const s = document.getElementById("ver-como-persona");
    return s && s.checkVisibility() ? Array.from(s.querySelectorAll("optgroup")).map((g) =>
      g.label + ": " + Array.from(g.children).map((o) => o.textContent).join(", ")) : null;
  });
  igual("coordinadores y profesores, agrupados", opciones, ["Coordinadores: 👁 Carla Mora", "Profesores: 👁 Karina Rojas"]);
  igual("el selector tiene su etiqueta", await page.evaluate(() =>
    document.querySelector('label[for="ver-como-persona"]').textContent), "Ver como:");
  igual("sin franja en su vista", (await page.evaluate(LEER)).barra, null);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.selectOption("#ver-como-persona", "u-karina"),
  ]);
  await page.waitForSelector("#app:not(.hidden)");
  await page.waitForSelector("#modo-vista-barra", { timeout: 10000 });
  const g = await page.evaluate(LEER);
  igual("al elegir a Karina se recarga con su panel", g.badge, "👁 Profesor");
  igual("guarda a Karina a nombre de quien la eligió",
        JSON.parse(g.guardada), { id: "u-karina", nombre: "Karina Rojas", es_coordinador: false, de: "u-sup" });
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaCoordinadora(browser) {
  console.log("\n=== Mirando a una coordinadora ===");
  const { page, ctx, errores } = await panel(browser, [SUP], SUP.id, CON_PERSONA(PERSONAS[0], SUP.id), DATOS);
  await page.waitForFunction(() => document.getElementById("profe-alumnos").textContent !== "—", null, { timeout: 10000 });
  const g = await page.evaluate(LEER);
  igual("rótulo", g.badge, "👁 Coordinación");
  igual("sus números salen de panel_profesor_de con SU id",
        g.rpcs.filter((r) => r.startsWith("panel_profesor")), ['panel_profesor_de {"p_profesor":"u-coord"}']);
  igual("«Su semana» con sus alumnos", g.alumnos, "49");
  igual("sus funciones, pedidas con su id",
        g.rpcs.filter((r) => r.startsWith("funciones_coordinador_de") || r.startsWith("mis_funciones")),
        ['funciones_coordinador_de {"p_persona":"u-coord"}']);
  igual("tiene Coordinación y Formularios", ["coordinacion.html", "formularios.html"].every((h) => g.enlaces.includes(h)), true);
  igual("sin Cobros, que le apagaron", g.enlaces.includes("cobros.html"), false);
  igual("tiene las herramientas de profesor (Planes)", g.enlaces.includes("planes.html"), true);
  igual("sin el panel de supervisor (Supervisión de profesores)", g.enlaces.includes("supervision.html"), false);
  igual("sin registro de clases", g.registro, false);
  igual("sin estado de la clase en vivo", g.sesion, false);
  igual("la franja dice de quién es el panel", /panel de Carla Mora \(coordinación\)/.test(g.barra || ""), true);
  igual("y que lo que se guarde va con tu cuenta", /se hace con tu cuenta/.test(g.barra || ""), true);
  igual("de clases solo se pregunta si ELLA tiene una abierta", g.clases, ["u-coord"]);
  igual("sin clase abierta, no se ofrece mirarla", g.mirar, null);
  igual("sin errores en consola", errores, []);
  // Volver a la vista propia la borra.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.click("#modo-vista-barra button"),
  ]);
  await page.waitForSelector("#app:not(.hidden)");
  const g2 = await page.evaluate(LEER);
  igual("«Volver a mi vista» vuelve al panel de supervisor", g2.badge, "🧭 Supervisor");
  igual("y deja de estar guardada", g2.guardada, null);
  await ctx.close();
}

/* Si la persona está dando clase, su panel ofrece mirarla en vivo
   (sesion.html?observar=<id>; lo comprueba verificar-clase-supervisor.js). */
async function pruebaMirarClase(browser) {
  console.log("\n=== Mirando a un profesor que está dando clase ===");
  const karina = { id: "u-profe", nombre: "Karina Rojas", es_coordinador: false };
  const datos = Object.assign({}, DATOS, { clase_abierta: true,
    rpc: Object.assign({}, DATOS.rpc, { personas_para_ver_como: PERSONAS.concat([karina]) }) });
  const { page, ctx, errores } = await panel(browser, [SUP], SUP.id, CON_PERSONA(karina, SUP.id), datos);
  await page.waitForSelector("#mirar-clase", { timeout: 10000 });
  const g = await page.evaluate(LEER);
  igual("ofrece mirar SU clase en vivo", g.mirar, "sesion.html?observar=u-profe");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaGuardas(browser) {
  console.log("\n=== Lo que NO tiene que cambiar nada ===");
  {
    // Guardada por otra cuenta en la misma computadora.
    const { page, ctx } = await panel(browser, [SUP], SUP.id, CON_PERSONA(PERSONAS[1], "u-otra"), DATOS);
    const g = await page.evaluate(LEER);
    igual("guardada por otra cuenta: sigue su panel de supervisor", g.badge, "🧭 Supervisor");
    igual("guardada por otra cuenta: sin franja", g.barra, null);
    await ctx.close();
  }
  {
    // Un profesor cualquiera con una persona guardada a su nombre.
    const { page, ctx } = await panel(browser, [PROFE_X], PROFE_X.id, CON_PERSONA(PERSONAS[1], PROFE_X.id), DATOS);
    const g = await page.evaluate(LEER);
    igual("un profesor que no supervisa: su propio panel", g.badge, "Profesor");
    igual("un profesor que no supervisa: pide SUS números", g.rpcs.some((r) => r.startsWith("panel_profesor_de")), false);
    igual("un profesor que no supervisa: sin selector",
          await page.evaluate(() => !!document.getElementById("ver-como-persona")), false);
    await ctx.close();
  }
  {
    // Alguien que ya no está a su cargo: se vuelve a la vista propia.
    const fuera = { id: "u-fuera", nombre: "Ya No", es_coordinador: false };
    const { page, ctx } = await panel(browser, [SUP], SUP.id, CON_PERSONA(fuera, SUP.id), DATOS);
    await page.waitForSelector("#sup-alumnos", { timeout: 10000 });
    const g = await page.evaluate(LEER);
    igual("ya no está en la lista: vuelve al panel de supervisor", g.badge, "🧭 Supervisor");
    igual("ya no está en la lista: se borra", g.guardada, null);
    igual("ya no está en la lista: nunca se le pidió su panel", g.rpcs.some((r) => r.startsWith("panel_profesor_de")), false);
    await ctx.close();
  }
}

async function pruebaEnlace(browser) {
  console.log("\n=== clases.html?ver_como=<id> (el «Ver su panel» de Supervisión) ===");
  for (const [id, esperado] of [["u-karina", "👁 Profesor"], ["u-ajeno", "🧭 Supervisor"]]) {
    const { page, ctx } = await panel(browser, [SUP], SUP.id, null, DATOS);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
      page.goto(BASE + "/clases.html?ver_como=" + id, { waitUntil: "networkidle" }),
    ]);
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    const g = await page.evaluate(LEER);
    igual("?ver_como=" + id, g.badge, esperado);
    if (esperado !== "🧭 Supervisor") igual("?ver_como=" + id + ": la dirección queda limpia",
          await page.evaluate(() => location.search), "");
    await ctx.close();
  }
}

async function pruebaAdmin(browser) {
  console.log("\n=== Quien administra: los modos y además el panel de una persona ===");
  const { page, ctx, errores } = await panel(browser, [ADMIN], ADMIN.id, null, DATOS);
  igual("sigue el selector de modos",
        await page.evaluate(() => document.getElementById("modo-vista-panel").checkVisibility()), true);
  igual("y el de personas, con su etiqueta",
        await page.evaluate(() => document.querySelector('label[for="ver-como-persona"]').textContent), "Panel de:");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.selectOption("#ver-como-persona", "u-coord"),
  ]);
  await page.waitForSelector("#modo-vista-barra", { timeout: 10000 });
  const g = await page.evaluate(LEER);
  igual("admin mirando a Carla: su panel", g.badge, "👁 Coordinación");
  igual("admin mirando a Carla: sin Administración", g.enlaces.includes("admin.html"), false);
  // Elegir un modo de rol quita a la persona: no se suman.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.selectOption("#modo-vista-panel", "alumno"),
  ]);
  await page.waitForSelector("#app:not(.hidden)");
  const g2 = await page.evaluate(LEER);
  igual("elegir «estudiante» quita a la persona", [g2.badge, g2.guardada], ["Alumno", null]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  try {
    await pruebaSelector(browser);
    await pruebaCoordinadora(browser);
    await pruebaMirarClase(browser);
    await pruebaGuardas(browser);
    await pruebaEnlace(browser);
    await pruebaAdmin(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
