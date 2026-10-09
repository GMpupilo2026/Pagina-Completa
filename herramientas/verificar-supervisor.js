#!/usr/bin/env node
/* Comprueba el rol de SUPERVISOR y los MODOS DE VISTA de quien administra.

   Lo que se rompe acá se rompe callado, así que se mira desde afuera, en un
   navegador de verdad:

   - que al supervisor el panel de la Academia lo lleve a SU página,
     supervisor.html: cinco pestañas con sus profesores, sus estudiantes, sus
     cuentas (con la ficha de Coordinación al costado) y sus cobros, y NADA de
     entrenar, jugar o dar clase (un enlace a un ejercicio que se cuela ahí no
     da ningún error: la página se ve igual de bien y deja de ser
     administrativa);
   - que arriba vaya «Lo urgente», contado en la base, y que cada página
     esté UNA sola vez, en la pestaña de su tema;
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
const { chromium } = require("./lib/playwright-con-sesion");
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

/* ====================== supervisor.html ======================
   Quien supervisa tiene su propia página, con cinco pestañas, la ficha de
   cada persona al costado y Ctrl + K. Lo que se rompe callado: que el panel
   de la Academia no lo lleve ahí (o lleve también a quien administra mirando
   «como supervisor»), que «Lo urgente» cuente otra cosa, que una página se
   repita o se cuele un acceso a entrenar o jugar, que la ficha guarde a otra
   persona, o que una tarjeta de Informes pida un tema que no existe. */
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");

function datosDeSupervision() {
  const gente = [
    { id: "u-ana", full_name: "Ana Rojas", email: "ana@x.cr", role: "alumno", grupo: "7B", profesores: [{ id: "u-profe", nombre: "Karina Rojas" }], total: 12 },
    { id: "u-beto", full_name: "Beto Mora", email: "beto@alumno.ajedrez-integral.com", role: "alumno", grupo: "7B", profesores: [], total: 12 },
    { id: "u-profe", full_name: "Karina Rojas", email: "karina@x.cr", role: "profesor", grupo: null, alumnos: 18, subgrupos: 2, total: 12 },
  ];
  return {
    clase_abierta: true,   // Karina (u-profe) está dando clase
    rpc: {
      mi_gente: gente,
      mis_supervisados: ["u-ana", "u-luis"],
      // u-otro es un "compañero" que la RLS le deja ver, pero no está a su cargo.
      informes_inactivos: [{ id: "u-ana" }, { id: "u-otro" }],
      justificaciones_pendientes: 2,
      cobros_morosos: [],
      respuestas_satisfaccion: [{ id: "e-1", seguir: "no" }],
      resumen_profesores_supervisados: [{ id: "u-profe", nombre: "Karina Rojas", grupo: null, informe_id: "i-1", leido_at: null, comentado: false,
        actividad: { clases_en_linea: 10, clases_presenciales: 2, minutos_clase: 900, tareas_puestas: 4, alumnos_activos: 12, alumnos: 18 } }],
    },
    solicitudes_academia: [],
    recibos: [
      { id: "r-1", estado: "emitido", entrega: null },
      { id: "r-2", estado: "emitido", entrega: "correo" },
    ],
    informes_profesor: [
      { id: "i-1", profesor_id: "u-karina", estado: "enviado", leido_at: null },
      { id: "i-2", profesor_id: "u-luis-p", estado: "enviado", leido_at: null },
      { id: "i-4", profesor_id: "u-sup", estado: "enviado", leido_at: null },
    ],
  };
}

async function paginaSupervisor(browser, extra, url) {
  const r = await panel(browser, [SUP], SUP.id, Object.assign({ viewport: { width: 1280, height: 900 } }, extra || {}), datosDeSupervision());
  if (url) await r.page.goto(BASE + url, { waitUntil: "networkidle" });
  await r.page.waitForURL(/supervisor\.html/, { timeout: 10000 });
  await r.page.waitForFunction(() => document.getElementById("app") && !document.getElementById("app").hidden, null, { timeout: 15000 });
  await r.page.waitForFunction(() => !/Revisando/.test(document.getElementById("urgente-sup-estado").textContent), null, { timeout: 10000 });
  await r.page.waitForFunction(() => document.querySelectorAll("#prof-lista tr").length > 0 && document.querySelectorAll("#sup-lista tr").length > 0, null, { timeout: 10000 });
  return r;
}

const SECCION_VISIBLE = () => Array.from(document.querySelectorAll("[data-seccion]")).filter((s) => s.checkVisibility()).map((s) => s.dataset.seccion);

async function pruebaSupervisor(browser) {
  console.log("\n=== La página de quien supervisa ===");
  const { page, ctx, errores } = await paginaSupervisor(browser);
  igual("el panel de la Academia lo lleva a su página", new URL(page.url()).pathname, "/supervisor.html");
  igual("cinco pestañas, en este orden",
        await page.evaluate(() => Array.from(document.querySelectorAll(".sup-pestana")).map((a) => a.dataset.ir + ":" + a.firstChild.textContent.trim())),
        ["inicio:Inicio", "personas:Personas", "profesores:Profesores", "estudiantes:Estudiantes", "cobros:Cobros y accesos"]);
  igual("al entrar se ve SOLO Inicio", await page.evaluate(SECCION_VISIBLE), ["inicio"]);
  igual("rótulo de la pestaña marcada", await page.getAttribute('.sup-pestana[aria-current="page"]', "data-ir"), "inicio");

  /* «Lo urgente»: lo que alguien espera primero, lo de vigilar después,
     contado en la base. Sus informes propios no cuentan. */
  igual("lo que tiene algo, lo urgente primero y el nivel escrito",
        await page.evaluate(() => Array.from(document.querySelectorAll("#urgente-sup-lista li")).filter((li) => li.checkVisibility())
          .map((li) => li.dataset.pendiente + " · " + li.querySelector("a > span:nth-child(2)").innerText.replace(/\s+/g, " ").trim() + " → " + li.querySelector("a").getAttribute("href"))),
        ["justificaciones · URGENTE 2 justificaciones de ausencia por revisar → justificaciones.html",
         "informesSinLeer · URGENTE 2 informes mensuales de tus profesores sin leer → supervision.html",
         "recibosSinEntregar · URGENTE 1 recibo de pago por revisar y entregar → cobros.html#recibos",
         "seVan · A VIGILAR 1 alumno dijo este mes que no sigue → satisfaccion.html"]);
  igual("lo que está en cero se dice", await page.textContent("#urgente-sup-al-dia"), "✓ Al día: Solicitudes de ingreso · Pagos al día.");
  igual("la pestaña Inicio lleva cuántas cosas urgentes hay", await page.textContent("#nav-urgentes"), "3");
  igual("los informes se cuentan en la base, sin los suyos",
        await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "informes_profesor").map((c) => [c.count, !!c.head, c.eq.estado, c.neq && c.neq.profesor_id])),
        [[true, true, "enviado", "u-sup"]]);
  igual("«sin entrenar» cuenta solo a los suyos", await page.textContent("#sup-n-inactivos"), "1");
  igual("estudiantes a cargo (de mi_gente)", await page.textContent("#sup-n-alumnos"), "12");
  igual("ahora mismo: quién está dando clase, con «Mirar la clase»",
        await page.evaluate(() => Array.from(document.querySelectorAll("#sup-ahora li")).map((li) => li.querySelector("span").textContent + " → " + li.querySelector("a").getAttribute("href"))),
        ["Karina Rojas → sesion.html?observar=u-profe"]);

  /* Las páginas: se recorren las pestañas como una persona. Cada página con
     `zona` de js/paginas-supervisor.js sale una vez, en su pestaña, y a un
     archivo que existe; nada de entrenar, jugar ni dar clase. */
  const vistas = [];
  for (const t of ["inicio", "personas", "profesores", "estudiantes", "cobros"]) {
    await page.click('.sup-pestana[data-ir="' + t + '"]');
    igual("la pestaña " + t + " enseña solo su sección", await page.evaluate(SECCION_VISIBLE), [t]);
    vistas.push(...await page.evaluate((z) => Array.from(document.querySelectorAll("a[data-pagina]")).filter((a) => a.checkVisibility()).map((a) => z + " " + a.getAttribute("href")), t));
  }
  const esperadas = await page.evaluate(() => {
    const fuera = [];
    PaginasSupervisor.GRUPOS.forEach((g) => g.tiles.forEach((t) => { if (t.zona) fuera.push(t.zona + " " + t.href); }));
    return fuera;
  });
  const temas = vistas.filter((v) => /^estudiantes informes\.html\?tema=/.test(v) && v !== "estudiantes informes.html?tema=diagnostico-publico");
  igual("cada página de quien supervisa sale en la pestaña de su tema",
        vistas.filter((v) => !temas.includes(v)).sort(), esperadas.slice().sort());
  const hrefs = vistas.map((v) => v.split(" ")[1]);
  igual("ninguna sale dos veces", hrefs.filter((h, i) => hrefs.indexOf(h) !== i), []);
  igual("todas llevan a un archivo que existe", hrefs.filter((h) => !fs.existsSync(path.join(RAIZ, h.split("?")[0].split("#")[0]))), []);
  igual("ningún acceso a entrenar, jugar ni dar clase", hrefs.filter((h) => PROHIBIDOS.test(h)), []);
  /* Un tema que informes.html no tiene lleva al resumen general sin decir
     nada: cada tarjeta de Estudiantes se mira contra su selector. */
  const opciones = (fs.readFileSync(path.join(RAIZ, "informes.html"), "utf8").match(/<option value="[a-z-]+"/g) || []).map((o) => o.slice(15, -1));
  igual("las tarjetas de Estudiantes piden temas que Informes tiene",
        temas.map((v) => v.split("tema=")[1]).filter((t) => !opciones.includes(t)), []);
  igual("y son varias (un tema por tarjeta)", temas.length >= 5, true);
  igual("el panel de la Academia arma su lista con la MISMA (una sola copia)",
        /const SUPERVISOR_GROUPS = window\.PaginasSupervisor\.GRUPOS;/.test(fs.readFileSync(path.join(RAIZ, "js", "clases.js"), "utf8")), true);

  // Cobros: los números de su academia, nunca un cero falso.
  await page.click('.sup-pestana[data-ir="cobros"]');
  igual("cobros: saldos vencidos y recibos por entregar, contados en la base",
        await page.evaluate(() => Array.from(document.querySelectorAll("#cob-numeros a")).map((a) => a.querySelector("span").textContent + " " + a.getAttribute("href"))),
        ["0 cobros.html", "1 cobros.html#recibos"]);

  // La dirección lleva la pestaña.
  await page.goto(BASE + "/supervisor.html#profesores", { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.getElementById("app").hidden, null, { timeout: 15000 });
  igual("supervisor.html#profesores abre Profesores", await page.evaluate(SECCION_VISIBLE), ["profesores"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaFichasDeSupervision(browser) {
  console.log("\n=== Supervisión: la ficha de cada persona y de cada profesor ===");
  const { page, ctx, errores } = await paginaSupervisor(browser);
  await page.click('.sup-pestana[data-ir="personas"]');
  igual("la lista dice quién es cada uno, y quién no tiene profesor",
        await page.evaluate(() => Array.from(document.querySelectorAll("#sup-lista tr")).map((tr) => Array.from(tr.children).slice(0, 4).map((td) => td.innerText.replace(/\s+/g, " ").trim()).join(" | "))),
        ["Ana Rojas ana@x.cr | Estudiante | 7B | Karina Rojas",
         "Beto Mora beto@alumno.ajedrez-integral.com | Estudiante | 7B | Sin profesor",
         "Karina Rojas karina@x.cr 🔴 Dando clase ahora | Profesor | — | 18 alumnos"]);
  await page.click('#sup-lista .persona-abrir[aria-label="Abrir la ficha de Ana Rojas"]');
  await page.waitForFunction(() => document.getElementById("ficha-persona").checkVisibility(), null, { timeout: 5000 });
  igual("se abre su ficha al costado, con el foco en su nombre",
        await page.evaluate(() => [document.getElementById("ficha-titulo").textContent, document.activeElement.id]), ["Ana Rojas", "ficha-titulo"]);
  igual("es la ficha de Coordinación: sus datos, con qué entra y sus profesores",
        await page.evaluate(() => Array.from(document.querySelectorAll("#ficha-cuerpo h3")).filter((h) => h.checkVisibility()).map((h) => h.textContent)),
        ["Sus datos", "Con qué entra", "Sus profesores"]);
  igual("con reenviar el acceso y su informe",
        await page.evaluate(() => [Array.from(document.querySelectorAll("#ficha-cuerpo button")).some((b) => /Reenviar acceso/.test(b.textContent)),
          document.querySelector("#ficha-cuerpo a[href^='informes.html']").getAttribute("href")]),
        [true, "informes.html?alumno=u-ana"]);
  // Guardar el nombre va por la función de la base, con ESTA persona.
  await page.fill("#ficha-cuerpo input", "Ana Rojas Mora");
  await page.click("#ficha-cuerpo button:text-is('Guardar')");
  await page.waitForFunction(() => window.__consultas.some((c) => c.tabla === "coord_guardar_cuenta"), null, { timeout: 5000 });
  igual("guardar el nombre va a coord_guardar_cuenta con esta persona",
        await page.evaluate(() => { const c = window.__consultas.filter((x) => x.tabla === "coord_guardar_cuenta").pop(); return [c.args.p_persona, c.args.p_nombre]; }),
        ["u-ana", "Ana Rojas Mora"]);
  igual("y la fila de atrás dice el nombre nuevo",
        await page.evaluate(() => document.querySelector('#sup-lista tr[data-persona="u-ana"] .persona-abrir').textContent), "Ana Rojas Mora");
  await page.keyboard.press("Escape");
  igual("Escape la cierra y el foco vuelve a su fila",
        await page.evaluate(() => [document.getElementById("ficha-persona").checkVisibility(), document.activeElement.classList.contains("persona-abrir")]),
        [false, true]);

  // El profesor: su mes, su informe en supervision.html y su clase en vivo.
  await page.click('.sup-pestana[data-ir="profesores"]');
  igual("la tabla dice el mes de cada profesor",
        await page.evaluate(() => Array.from(document.querySelectorAll("#prof-lista tr")).map((tr) => Array.from(tr.children).map((td) => td.innerText.replace(/\s+/g, " ").trim()).join(" | "))),
        ["Karina Rojas | 12 (15 h) | 12 de 18 | 📨 Enviado · sin leer | 🔴 Mirar la clase"]);
  await page.click("#prof-lista .profesor-abrir");
  await page.waitForFunction(() => document.getElementById("ficha-titulo").textContent === "Karina Rojas", null, { timeout: 5000 });
  igual("su ficha lleva a leer su informe, a su panel y a su clase",
        await page.evaluate(() => Array.from(document.querySelectorAll("#ficha-cuerpo a[href]")).map((a) => a.getAttribute("href"))),
        ["sesion.html?observar=u-profe", "supervision.html?profesor=u-profe", "clases.html?ver_como=u-profe"]);
  await page.keyboard.press("Escape");
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaBuscadorSupervision(browser) {
  console.log("\n=== Supervisión: Ctrl + K y el que llega buscando ===");
  const { page, ctx, errores } = await paginaSupervisor(browser);
  igual("no carga el atajo que lleva a clases.html",
        await page.evaluate(() => !!document.querySelector('script[src$="atajo-buscar.js"]')), false);
  await page.keyboard.press("Control+k");
  igual("Ctrl + K lo abre acá mismo", await page.evaluate(() => [document.getElementById("buscador").checkVisibility(), document.activeElement.id]), [true, "buscador-campo"]);
  await page.fill("#buscador-campo", "ana");
  await page.waitForFunction(() => { const li = document.querySelector("#buscador-lista [role=option]"); return li && li.dataset.tipo === "persona"; }, null, { timeout: 5000 });
  igual("las personas las busca la base (mi_gente), con lo escrito",
        await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "mi_gente" && c.args && c.args.p_busqueda === "ana").length > 0), true);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.getElementById("ficha-persona").checkVisibility(), null, { timeout: 5000 });
  igual("Enter abre su ficha", await page.textContent("#ficha-titulo"), "Ana Rojas");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.fill("#buscador-campo", "reportes");
  // (El doble de mi_gente no filtra por lo escrito: se mira entre las páginas.)
  await page.waitForTimeout(300);
  igual("encuentra también las páginas",
        await page.evaluate(() => Array.from(document.querySelectorAll('#buscador-lista [data-tipo="pagina"]')).map((li) => li.querySelector("span span").textContent)),
        ["Reportes de actividades"]);
  await page.keyboard.press("Escape");
  igual("sin errores en consola", errores, []);
  await ctx.close();

  // El Ctrl + K de otra página manda a clases.html?buscar=: llega buscando.
  const r = await paginaSupervisor(browser, null, "/clases.html?buscar=Beto");
  igual("clases.html?buscar= lo lleva a su página con la búsqueda", new URL(r.page.url()).search, "?buscar=Beto");
  await r.page.waitForFunction(() => document.getElementById("buscador").checkVisibility(), null, { timeout: 5000 });
  igual("y el buscador abierto con lo que buscaba", await r.page.inputValue("#buscador-campo"), "Beto");
  await r.ctx.close();
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
    igual("modo supervisor: su primer grupo", g.grupos[0], "Mi academia");
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
  // Supervisores es una sección de la pestaña «Organización»: se llega como
  // una persona, con la pestaña y después la sección.
  await page.click('.admin-grupo[data-grupo="organizacion"]');
  await page.click('.admin-nav[data-ir="supervisores"]');
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
  /* «Ver como» está una sola vez: en el selector de arriba del panel de la
     Academia (#modo-vista-panel, que se prueba más arriba con sus modos).
     admin.html tenía una tarjeta que hacía lo mismo. */
  igual("admin.html no repite «Ver como»", await page.$$eval("[data-modo-vista]", (bs) => bs.length), 0);
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
    await pruebaFichasDeSupervision(browser);
    await pruebaBuscadorSupervision(browser);
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
