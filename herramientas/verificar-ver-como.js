#!/usr/bin/env node
/* Comprueba «Ver como» una persona: quien supervisa mira el panel de uno de
   SUS profesores o coordinadores (y quien administra, el de cualquiera, y
   además el de un supervisor o el de un estudiante).

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
   - que clases.html?ver_como=<id> (el «Ver su panel» de supervision.html y
     de las fichas de supervisor.html) solo fije a alguien que está en la
     lista, y que sin nadie fijado quien supervisa vaya a su página;
   - que una persona guardada por OTRA cuenta, o que ya no está en la lista,
     no le cambie nada a quien entra;
   - que el panel de un supervisor pida sus tres números a
     panel_supervisor_de() con SU id (y no a mi_gente/mis_supervisados, que
     contestarían con los de quien mira), sin «Lo urgente» de quien mira;
   - que el panel de un estudiante pida sus tareas, exámenes, racha y
     progreso con SU id, y nada de la clase en vivo ni de «Hoy te toca»
     (saldrían de quien mira); y que a un supervisor que no administra un
     estudiante guardado no le cambie nada;
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

/* Quien supervisa entra a su página, supervisor.html (ver «La página de
   supervisión»): ya no ve el selector en su panel, sino «Ver su panel» en la
   ficha de cada profesor o coordinador. Ese enlace es clases.html?ver_como=,
   el mismo de supervision.html, que solo fija a alguien de la lista que da
   la base (personas_para_ver_como). */
async function pruebaSelector(browser) {
  console.log("\n=== El supervisor en su página: «Ver su panel» desde la ficha ===");
  const datos = Object.assign({}, DATOS, { rpc: Object.assign({}, DATOS.rpc, {
    mi_gente: [{ id: "u-karina", full_name: "Karina Rojas", email: "karina@x.cr", role: "profesor", grupo: null, alumnos: 49, subgrupos: 0, total: 1 }],
  }) });
  const { page, ctx, errores } = await panel(browser, [SUP], SUP.id, null, datos);
  await page.waitForURL(/supervisor\.html/, { timeout: 10000 });
  igual("su panel lo lleva a su página", new URL(page.url()).pathname, "/supervisor.html");
  igual("ahí no hay selector «Ver como»", await page.evaluate(() => !!document.getElementById("ver-como-persona")), false);
  await page.click('.sup-pestana[data-ir="personas"]');
  await page.waitForSelector('#sup-lista .persona-abrir[aria-label="Abrir la ficha de Karina Rojas"]', { timeout: 10000 });
  await page.click('#sup-lista .persona-abrir[aria-label="Abrir la ficha de Karina Rojas"]');
  const ver = page.locator("#ficha-cuerpo a[href^='clases.html?ver_como=']");
  igual("la ficha de un profesor ofrece «Ver su panel»", await ver.getAttribute("href"), "clases.html?ver_como=u-karina");
  await Promise.all([
    page.waitForURL(/clases\.html$/, { timeout: 15000 }),
    ver.click(),
  ]);
  await page.waitForSelector("#modo-vista-barra", { timeout: 10000 });
  const g = await page.evaluate(LEER);
  igual("al tocarlo se ve el panel de Karina", g.badge, "👁 Profesor");
  igual("guarda a Karina a nombre de quien la eligió",
        JSON.parse(g.guardada), { id: "u-karina", nombre: "Karina Rojas", es_coordinador: false, tipo: "profesor", de: "u-sup" });
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
  await page.waitForURL(/supervisor\.html/, { timeout: 10000 });
  igual("«Volver a mi vista» vuelve a su página de supervisión", new URL(page.url()).pathname, "/supervisor.html");
  igual("y deja de estar guardada", await page.evaluate(() => localStorage.getItem("ver_como_persona_v1")), null);
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
    igual("guardada por otra cuenta: sigue a su página de supervisión", new URL(page.url()).pathname, "/supervisor.html");
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
    await page.waitForURL(/supervisor\.html/, { timeout: 10000 });
    igual("ya no está en la lista: vuelve a su página de supervisión", new URL(page.url()).pathname, "/supervisor.html");
    igual("ya no está en la lista: se borra", await page.evaluate(() => localStorage.getItem("ver_como_persona_v1")), null);
    igual("ya no está en la lista: nunca se le pidió su panel",
          await page.evaluate(() => window.__consultas.some((c) => c.tabla === "panel_profesor_de")), false);
    await ctx.close();
  }
}

async function pruebaEnlace(browser) {
  console.log("\n=== clases.html?ver_como=<id> (el «Ver su panel» de Supervisión) ===");
  for (const [id, esperado] of [["u-karina", "👁 Profesor"], ["u-ajeno", "supervisor.html"]]) {
    const { page, ctx } = await panel(browser, [SUP], SUP.id, null, DATOS);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
      page.goto(BASE + "/clases.html?ver_como=" + id, { waitUntil: "networkidle" }),
    ]);
    if (esperado === "supervisor.html") {
      // Alguien que no está en su lista: no se fija nada, y va a su página.
      await page.waitForURL(/supervisor\.html/, { timeout: 10000 });
      igual("?ver_como=" + id + ": no se fija y va a su página", new URL(page.url()).pathname, "/supervisor.html");
      await ctx.close();
      continue;
    }
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    const g = await page.evaluate(LEER);
    igual("?ver_como=" + id, g.badge, esperado);
    igual("?ver_como=" + id + ": la dirección queda limpia",
          await page.evaluate(() => location.search), "");
    await ctx.close();
  }
}

/* Lo que la base le da a quien administra: además del equipo docente, los
   supervisores y los estudiantes, cada uno con su `tipo`. */
const SUP_B = { id: "u-sup-b", nombre: "Sonia Vargas", es_coordinador: false, tipo: "supervisor" };
const ALUMNO_B = { id: "u-alu-b", nombre: "Luis Pérez", es_coordinador: false, tipo: "alumno" };
const PERSONAS_ADMIN = [
  Object.assign({ tipo: "coordinador" }, PERSONAS[0]), Object.assign({ tipo: "profesor" }, PERSONAS[1]), SUP_B, ALUMNO_B,
];
const DATOS_ADMIN = Object.assign({}, DATOS, {
  rpc: Object.assign({}, DATOS.rpc, {
    personas_para_ver_como: PERSONAS_ADMIN,
    panel_supervisor_de: [{ alumnos: 64, profesores: 3, inactivos: 52 }],
  }),
  // Lo que hizo el estudiante (lo último, para «Lo último que hiciste»).
  training_progress: [{ student_id: "u-alu-b", activity: "4x4", created_at: new Date().toISOString() }],
});

async function pruebaAdminSelector(browser) {
  console.log("\n=== Quien administra: el selector trae también supervisores y estudiantes ===");
  const { page, ctx, errores } = await panel(browser, [ADMIN], ADMIN.id, null, DATOS_ADMIN);
  const opciones = await page.evaluate(() => Array.from(document.querySelectorAll("#ver-como-persona optgroup")).map((g) =>
    g.label + ": " + Array.from(g.children).map((o) => o.textContent).join(", ")));
  igual("agrupados por lo que es cada uno", opciones,
        ["Supervisores: 👁 Sonia Vargas", "Coordinadores: 👁 Carla Mora", "Profesores: 👁 Karina Rojas", "Estudiantes: 👁 Luis Pérez"]);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page.selectOption("#ver-como-persona", "u-alu-b"),
  ]);
  await page.waitForSelector("#modo-vista-barra", { timeout: 10000 });
  const g = await page.evaluate(LEER);
  igual("al elegir al estudiante se guarda con su tipo", JSON.parse(g.guardada),
        { id: "u-alu-b", nombre: "Luis Pérez", es_coordinador: false, tipo: "alumno", de: ADMIN.id });
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAdminMiraSupervisor(browser) {
  console.log("\n=== Quien administra mira el panel de un supervisor ===");
  const { page, ctx, errores } = await panel(browser, [ADMIN], ADMIN.id, CON_PERSONA(SUP_B, ADMIN.id), DATOS_ADMIN);
  await page.waitForFunction(() => document.getElementById("sup-alumnos").textContent !== "—"
    && document.getElementById("sup-alumnos").textContent !== "", null, { timeout: 10000 });
  const g = await page.evaluate(LEER);
  const numeros = await page.evaluate(() => ["sup-alumnos", "sup-profes", "sup-inactivos"].map((id) => document.getElementById(id).textContent));
  igual("rótulo", g.badge, "👁 Supervisión");
  igual("el panel de supervisión (Supervisión de profesores)", g.enlaces.includes("supervision.html"), true);
  igual("sin Administración", g.enlaces.includes("admin.html"), false);
  igual("sus números salen de panel_supervisor_de con SU id",
        g.rpcs.filter((r) => /^(panel_supervisor_de|mi_gente|mis_supervisados)/.test(r)), ['panel_supervisor_de {"p_supervisor":"u-sup-b"}']);
  igual("estudiantes, profesores y sin entrenar", numeros, ["64", "3", "52"]);
  igual("sin «Lo urgente» de quien mira",
        await page.evaluate(() => document.getElementById("urgente-panel").checkVisibility()), false);
  igual("sin el aviso de «la cuenta que administra no tiene ninguna asignada»",
        await page.evaluate(() => document.getElementById("sup-aviso").checkVisibility()), false);
  igual("la franja dice de quién es el panel", /panel de Sonia Vargas \(supervisión\)/.test(g.barra || ""), true);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaAdminMiraEstudiante(browser) {
  console.log("\n=== Quien administra mira el panel de un estudiante ===");
  const { page, ctx, errores } = await panel(browser, [ADMIN], ADMIN.id, CON_PERSONA(ALUMNO_B, ADMIN.id), DATOS_ADMIN);
  await page.waitForFunction(() => window.__consultas.some((c) => c.tabla === "training_progress"), null, { timeout: 10000 });
  const g = await page.evaluate(LEER);
  const con = (n) => g.rpcs.filter((r) => r.startsWith(n + " ") || r === n);
  igual("rótulo", g.badge, "👁 Estudiante");
  igual("su panel de estudiante", await page.evaluate(() => document.getElementById("progreso-alumno").checkVisibility()), true);
  igual("sin Administración", g.enlaces.includes("admin.html"), false);
  igual("sus tareas, con SU id", con("tareas_con_avance").map((r) => JSON.parse(r.slice(r.indexOf("{"))).p_alumno), ["u-alu-b"]);
  igual("sus exámenes, con SU id", con("examenes_con_nota").map((r) => JSON.parse(r.slice(r.indexOf("{"))).p_alumno), ["u-alu-b"]);
  igual("su progreso, con SU id", con("mi_entreno_resumen"), ['mi_entreno_resumen {"p_alumno":"u-alu-b"}']);
  igual("su racha, con SU id", con("progreso_dias_y_racha"), ['progreso_dias_y_racha {"alumno":"u-alu-b"}']);
  igual("lo último que hizo, con SU id",
        await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "training_progress").map((c) => c.eq.student_id)), ["u-alu-b"]);
  igual("no pregunta por las clases de quien mira", con("mis_clases"), []);
  igual("sin estado de la clase en vivo", g.sesion, false);
  igual("la clase en vivo no le inventa que no tiene profesor",
        await page.evaluate(() => (document.querySelector("[data-clase-compacta]") || {}).textContent || ""),
        "🔒Sesión en vivo y videollamada: Su clase en vivo se ve solo desde su cuenta");
  igual("sin «Hoy te toca» (saldría de este aparato)",
        await page.evaluate(() => document.getElementById("hoy").checkVisibility()), false);
  igual("la franja dice de quién es el panel", /panel de Luis Pérez \(estudiante\)/.test(g.barra || ""), true);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaSupervisorNoMiraEstudiantes(browser) {
  console.log("\n=== Un estudiante guardado no le cambia nada a quien solo supervisa ===");
  const { page, ctx } = await panel(browser, [SUP], SUP.id, CON_PERSONA(ALUMNO_B, SUP.id), DATOS);
  await page.waitForURL(/supervisor\.html/, { timeout: 10000 });
  igual("sigue a su página de supervisión", new URL(page.url()).pathname, "/supervisor.html");
  igual("nunca pidió las tareas del estudiante",
        await page.evaluate(() => window.__consultas.some((c) => c.tabla === "tareas_con_avance")), false);
  await ctx.close();
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
    await pruebaAdminSelector(browser);
    await pruebaAdminMiraSupervisor(browser);
    await pruebaAdminMiraEstudiante(browser);
    await pruebaSupervisorNoMiraEstudiantes(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
