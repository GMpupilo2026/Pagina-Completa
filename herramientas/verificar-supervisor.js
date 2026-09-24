#!/usr/bin/env node
/* Comprueba el rol de SUPERVISOR y los MODOS DE VISTA de quien administra.

   Lo que se rompe acá se rompe callado, así que se mira desde afuera, en un
   navegador de verdad:

   - que al supervisor se le pinte SU panel —el informe de sus estudiantes tema
     por tema, sus cuentas, cobros y formularios— y NADA de entrenar, jugar o dar
     clase (un enlace a un ejercicio que se cuela ahí no da ningún error: el
     panel se ve igual de bien y deja de ser administrativo);
   - que cada tema lleve a Informes YA filtrado por ese tema;
   - que el conteo de «sin entrenar» cuente SOLO a sus estudiantes a cargo, y
     no a los compañeros que la RLS de profiles también le deja ver;
   - que el administrador, en «modo estudiante / profesor / supervisor», vea el
     panel de ese rol con la franja que lo dice, y que el contenido cerrado se
     vea cerrado (AccesoAdmin.esAdmin() en falso);
   - que un modo guardado en el aparato NO le cambie nada a quien no administra;
   - que la bitácora del alumno le llegue a quien supervisa de TODOS sus
     profesores, con el nombre de quien escribió cada nota, y sin ningún
     control para escribir, compartir o borrar (la base lo rechazaría, pero el
     fallo lo descubriría quien apretó);
   - y que en Administración, sumar un grupo a un supervisor mande la UNIÓN con
     lo que ya tenía, no solo el grupo — mandar el grupo solo le quitaría sus
     cuentas anteriores sin que nadie lo pidiera.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-supervisor.js
*/
const { chromium } = require("playwright");
const P = require("./verificar-panel.js");

const { panel, BASE, CHROME, PROFE, ADMIN } = P;
const SUP = { id: "u-sup", role: "profesor", is_admin: false, es_coordinador: false, es_supervisor: true,
              full_name: "Marta Solano", email: "marta@x.cr", grupo: null };

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function mal(t) { console.log("  ✗ " + t); fallos += 1; }

const LEER = () => ({
  grupos: Array.from(document.querySelectorAll("#tile-grid section h2")).map((h) => h.textContent),
  enlaces: Array.from(document.querySelectorAll("#tile-grid a[href]")).map((a) => a.getAttribute("href")),
  badge: document.getElementById("role-badge").textContent,
  barra: !!(document.getElementById("modo-vista-barra") && document.getElementById("modo-vista-barra").checkVisibility()),
});

const CON_MODO = (modo) => ({
  storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: "modo_vista_admin_v1", value: modo }] }] },
});

const PROHIBIDOS = /^(entreno\/|juegos|torneos|tv|tablero\.html|logros|sesion|tareas|examenes|articulos|cursos\/|partidas|planes|asistencia)/;

async function pruebaSupervisor(browser) {
  console.log("\n=== El panel de quien supervisa ===");
  const datos = { rpc: {
    mi_gente: [{ total: 12 }],
    mis_supervisados: ["u-ana", "u-luis"],
    // u-otro es un "compañero" que la RLS le deja ver, pero no está a su cargo.
    informes_inactivos: [{ id: "u-ana" }, { id: "u-otro" }],
  } };
  const { page, ctx, errores } = await panel(browser, [SUP], SUP.id, null, datos);
  await page.waitForFunction(() => document.getElementById("sup-inactivos").textContent !== "—", null, { timeout: 10000 });
  const g = await page.evaluate(LEER);
  igual("grupos del supervisor", g.grupos, ["Cómo van tus estudiantes", "Tus profesores", "Qué están entrenando, tema por tema",
                                           "Cuentas a tu cargo", "Administración", "Tu cuenta"]);
  igual("rótulo", g.badge, "🧭 Supervisor");
  const colados = g.enlaces.filter((h) => PROHIBIDOS.test(h));
  igual("ningún acceso a entrenar, jugar ni dar clase", colados, []);
  const temas = await page.evaluate(() => Array.from(document.querySelectorAll("#tile-grid section"))
    .find((s) => s.querySelector("h2").textContent.startsWith("Qué están"))
    .querySelectorAll("a[href]").length);
  const temasBien = await page.evaluate(() => Array.from(document.querySelectorAll("#tile-grid section"))
    .find((s) => s.querySelector("h2").textContent.startsWith("Qué están"))
    .querySelectorAll('a[href^="informes.html?tema="]').length);
  igual("cada tema de entrenamiento abre Informes filtrado", temasBien, temas);
  igual("«sin entrenar» cuenta solo a los suyos", await page.textContent("#sup-inactivos"), "1");
  igual("estudiantes a cargo (de mi_gente)", await page.textContent("#sup-alumnos"), "12");
  igual("el registro de clases no se le pinta",
        await page.evaluate(() => document.getElementById("registro-clases").checkVisibility()), false);
  igual("sin franja de modo de vista (no administra)", g.barra, false);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaModosDelAdmin(browser) {
  console.log("\n=== Los modos de vista de quien administra ===");
  {
    const { page, ctx, errores } = await panel(browser, [ADMIN], ADMIN.id);
    const g = await page.evaluate(LEER);
    igual("en su vista: rótulo de administración", g.badge, "👑 Administrador");
    igual("en su vista: sin franja", g.barra, false);
    igual("en su vista: se le ofrece el selector «Ver como»",
          await page.evaluate(() => document.getElementById("modo-vista-panel").checkVisibility()), true);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.selectOption("#modo-vista-panel", "alumno"),
    ]);
    await page.waitForSelector("#app:not(.hidden)");
    await page.waitForSelector("#modo-vista-barra", { timeout: 10000 });
    const g2 = await page.evaluate(LEER);
    igual("al elegir «estudiante» se recarga como alumno", g2.badge, "Alumno");
    igual("y aparece la franja que lo dice", g2.barra, true);
    igual("sin errores en consola", errores, []);
    await ctx.close();
  }
  {
    const { page, ctx } = await panel(browser, [ADMIN], ADMIN.id, CON_MODO("alumno"));
    await page.waitForSelector("#modo-vista-barra", { timeout: 10000 });
    const g = await page.evaluate(LEER);
    igual("modo estudiante: rótulo", g.badge, "Alumno");
    igual("modo estudiante: sin el acceso a Administración", g.enlaces.includes("admin.html"), false);
    igual("modo estudiante: sin lo que es solo de administración (Mide tu nivel)", g.grupos.includes("Mide tu nivel"), false);
    await page.addScriptTag({ url: BASE + "/js/acceso-admin.js" });
    igual("modo estudiante: el contenido se ve cerrado (AccesoAdmin.esAdmin)",
          await page.evaluate(async () => { await window.AccesoAdmin.init(); return window.AccesoAdmin.esAdmin(); }), false);
    await ctx.close();
  }
  {
    const { page, ctx } = await panel(browser, [ADMIN], ADMIN.id, CON_MODO("profesor"));
    await page.waitForSelector("#modo-vista-barra", { timeout: 10000 });
    const g = await page.evaluate(LEER);
    igual("modo profesor: rótulo", g.badge, "Profesor");
    igual("modo profesor: tiene Planes de clase", g.enlaces.includes("planes.html"), true);
    igual("modo profesor: sin el acceso a Administración", g.enlaces.includes("admin.html"), false);
    await ctx.close();
  }
  {
    const { page, ctx } = await panel(browser, [ADMIN], ADMIN.id, CON_MODO("supervisor"),
                                      { rpc: { mi_gente: [], mis_supervisados: [], informes_inactivos: [] } });
    await page.waitForSelector("#modo-vista-barra", { timeout: 10000 });
    const g = await page.evaluate(LEER);
    igual("modo supervisor: rótulo", g.badge, "🧭 Supervisor");
    igual("modo supervisor: su primer grupo", g.grupos[0], "Cómo van tus estudiantes");
    igual("modo supervisor: dice que los números son de la cuenta que administra",
          await page.evaluate(() => document.getElementById("sup-aviso").checkVisibility()), true);
    await ctx.close();
  }
  {
    // Una computadora compartida: el modo quedó guardado, pero entra una profesora.
    const { page, ctx } = await panel(browser, [PROFE], PROFE.id, CON_MODO("alumno"));
    await page.waitForTimeout(800);
    const g = await page.evaluate(LEER);
    igual("un modo guardado no le cambia nada a quien no administra", g.badge, "Profesor");
    igual("y no le pinta ninguna franja", g.barra, false);
    await ctx.close();
  }
}

/* ---------------- admin.html · la tarjeta de Supervisores ---------------- */

function clienteAdmin() {
  const perfiles = [
    Object.assign({}, ADMIN, { es_supervisor: false }),
    Object.assign({}, SUP),
    Object.assign({}, PROFE, { es_supervisor: false }),
    { id: "u-a1", role: "alumno", is_admin: false, es_coordinador: false, es_supervisor: false, full_name: "Ana Mora", email: "a1@x.cr", grupo: "7B" },
    { id: "u-a2", role: "alumno", is_admin: false, es_coordinador: false, es_supervisor: false, full_name: "Bruno Mena", email: "a2@x.cr", grupo: "7B" },
    { id: "u-a3", role: "alumno", is_admin: false, es_coordinador: false, es_supervisor: false, full_name: "Carla Ríos", email: "a3@x.cr", grupo: "8A" },
  ];
  return `
window.__rpc = [];
(function () {
  const TABLAS = {
    profiles: ${JSON.stringify(perfiles)},
    supervisor_cuentas: [{ supervisor_id: "u-sup", persona_id: "u-a3" }],
  };
  function constructor(filas) {
    let f = (filas || []).slice(), unica = false;
    const b = {
      select() { return b; }, order() { return b; }, in() { return b; }, is() { return b; },
      eq(c, v) { f = f.filter((r) => String(r[c]) === String(v)); return b; },
      range(a, z) { f = f.slice(a, z + 1); return b; },
      limit(n) { f = f.slice(0, n); return b; },
      single() { unica = true; return b; }, maybeSingle() { unica = true; return b; },
      then(res, rej) { return Promise.resolve({ data: unica ? (f[0] || null) : f, error: null }).then(res, rej); },
    };
    return b;
  }
  window.SUPABASE_URL = "https://ejemplo.supabase.co";
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u-admin" }, access_token: "t" } } }),
            signOut: () => Promise.resolve({}) },
    from: (t) => constructor(TABLAS[t] || []),
    rpc: (n, args) => {
      window.__rpc.push({ n: n, args: args || null });
      if (n === "set_cuentas_del_supervisor") return Promise.resolve({ data: (args.p_cuentas || []).length, error: null });
      if (n === "marcar_supervisor") return Promise.resolve({ data: null, error: null });
      return constructor([]);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();`;
}

async function pruebaAdminSupervisores(browser) {
  console.log("\n=== Administración › Supervisores ===");
  const ctx = await browser.newContext();
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/functions/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteAdmin() }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  // La tarjeta va plegada, como Profesores y Equipos: se abre tocando su encabezado.
  await page.click("summary:has(h2:text-is('Supervisores'))");
  const tarjetas = await page.$$eval("#sup-lista h3", (hs) => hs.map((h) => h.textContent));
  igual("se lista a la supervisora", tarjetas, ["Marta Solano"]);
  const candidatos = await page.$$eval("#sup-nuevo option", (os) => os.map((o) => o.value).filter(Boolean));
  igual("para nombrar se ofrecen solo profesores que no supervisan", candidatos, ["u-profe"]);
  await page.selectOption("#sup-grupo-u-sup", "7B");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "set_cuentas_del_supervisor"), null, { timeout: 5000 });
  const enviado = await page.evaluate(() => window.__rpc.filter((r) => r.n === "set_cuentas_del_supervisor").pop().args);
  igual("sumar el grupo 7B manda la UNIÓN con la cuenta que ya tenía",
        { sup: enviado.p_supervisor, cuentas: enviado.p_cuentas.slice().sort() },
        { sup: "u-sup", cuentas: ["u-a1", "u-a2", "u-a3"] });
  igual("y lo dice", await page.textContent("#sup-msg"), "Entraron 2 alumnos del grupo 7B a cargo de Marta Solano.");
  await page.selectOption("#sup-nuevo", "u-profe");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "marcar_supervisor"), null, { timeout: 5000 });
  igual("nombrar supervisor manda a quién y el valor",
        await page.evaluate(() => window.__rpc.filter((r) => r.n === "marcar_supervisor").pop().args),
        { p_persona: "u-profe", p_valor: true });
  igual("la tarjeta «Ver la plataforma como…» ofrece los tres modos",
        await page.$$eval("[data-modo-vista]", (bs) => bs.map((b) => b.dataset.modoVista)), ["alumno", "profesor", "supervisor"]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

/* La bitácora en modo supervisor: se monta el módulo en una página vacía con
   un cliente de mentira que anota qué se le pidió. Que vaya por la función de
   la base y no por la tabla es lo que importa: la RLS de notas_alumno solo le
   devuelve a cada profesor LAS SUYAS, así que leer la tabla daría una bitácora
   vacía que se ve igual de bien. */
async function pruebaBitacora(browser) {
  console.log("\nLa bitácora, para quien supervisa");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/offline.html");
  await page.addScriptTag({ url: BASE + "/js/notas-alumno.js" });
  const r = await page.evaluate(async () => {
    const pedidos = [];
    const filas = [
      { id: "n1", alumno_id: "u-ana", profesor_id: "p1", autor: "Karina Rojas", texto: "Le cuesta el final de torre",
        etiqueta: "Finales", compartida: false, created_at: "2026-09-20T15:00:00Z" },
      { id: "n2", alumno_id: "u-ana", profesor_id: "p2", autor: "Luis <b>Mora</b>", texto: "Mejoró la apertura",
        etiqueta: null, compartida: true, created_at: "2026-09-18T15:00:00Z" },
    ];
    const sb = {
      rpc: (n, args) => { pedidos.push({ n, args }); return Promise.resolve({ data: n === "bitacora_supervisada" ? filas : [], error: null }); },
      from: (t) => { pedidos.push({ tabla: t }); throw new Error("no se lee la tabla"); },
    };
    const caja = document.createElement("div");
    document.body.appendChild(caja);
    const cuantas = await NotasAlumno.montarLectura(caja, { sb, alumnoId: "u-ana", supervisor: true });
    const vacia = document.createElement("div");
    document.body.appendChild(vacia);
    const sbVacio = { rpc: () => Promise.resolve({ data: [], error: null }) };
    await NotasAlumno.montarLectura(vacia, { sb: sbVacio, alumnoId: "u-ana", supervisor: true });
    return {
      cuantas, pedidos,
      autores: Array.from(caja.querySelectorAll("li")).map((li) => li.querySelector("div span:nth-child(2)").textContent),
      controles: caja.querySelectorAll("button, textarea, input, select, a").length,
      negrita: caja.querySelectorAll("b").length,
      vacia: vacia.textContent,
    };
  });
  igual("pide la bitácora a la función de la base, con ese alumno",
        r.pedidos, [{ n: "bitacora_supervisada", args: { p_alumno: "u-ana" } }]);
  igual("pinta las notas de los dos profesores", r.cuantas, 2);
  igual("cada nota dice quién la escribió", r.autores, ["De Karina Rojas", "De Luis <b>Mora</b>"]);
  igual("el nombre del autor no se ejecuta como HTML", r.negrita, 0);
  igual("no se pinta ningún control para escribir, compartir o borrar", r.controles, 0);
  igual("sin notas lo dice en vez de dejar el bloque en blanco", r.vacia, "Sus profesores todavía no le han escrito ninguna nota.");
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaSupervisor(browser);
    await pruebaModosDelAdmin(browser);
    await pruebaAdminSupervisores(browser);
    await pruebaBitacora(browser);
  } catch (e) {
    mal("la prueba se cayó: " + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  const total = fallos + P.fallos();
  console.log(total ? `\n${total} fallo(s)` : "\nEl supervisor y los modos de vista están como se pidió.");
  process.exit(total ? 1 : 0);
})();
