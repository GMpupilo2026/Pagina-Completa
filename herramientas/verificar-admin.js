/* Comprueba, en un navegador de verdad y con un Supabase de mentira, el panel
   de Administración (admin.html) y la lista de inscripciones a torneos
   (inscripciones.html).

   Existe por lo mismo que verificar-panel.js: las dos páginas están DETRÁS DEL
   LOGIN, así que verificar-css.js —que las abre sin cuenta— no ve nada de esto.
   Y lo que se rompe acá no da error en pantalla: un atajo que apunta a una
   dirección que ya no existe, un filtro que no filtra, una lista que se corta
   en mil filas sin avisar.

   Cuatro cosas, por cuatro peligros distintos:

   1. UNA SOLA PUERTA. Que admin.html no vuelva a traer atajos a las páginas
      que ya están en el panel de la Academia, ni una sección repetida.

   2. LAS CUENTAS. Que buscar encuentre sin importar las tildes, que el filtro
      de rol funcione —incluido "sin profesor asignado", que no es un rol pero
      es la pregunta que más se hace acá—, que se muestren de 50 en 50 y, lo
      más importante, que las cuentas se pidan DE MIL EN MIL: PostgREST corta
      a las mil filas sin dar ningún error, así que el día que la plataforma
      pase de mil, un solo pedido escondería cuentas en silencio.

   3. LAS INSCRIPCIONES. Que no se lean nunca directo de la tabla —tienen
      cédulas y fechas de nacimiento de menores— sino por la Edge Function, y
      que quien no coordina vea el aviso y ninguna fila. Que el CSV salga con
      punto y coma y BOM.

   4. QUE LAS PÁGINAS SE VEAN. Sin CSS impreso como texto, sin <style> suelto,
      en oscuro cuando toca, y con el nombre de la cuenta SIN CORTAR, que es
      con lo que empezó todo esto.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-admin.js                                 */
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

/* La cuenta master lleva `role: "admin"`: no es profesora ni alumna. Antes
   estaba guardada como profesora acá y como alumna en la base, y las dos
   cosas la metían donde no pinta nada — en la lista de «para quién» al mandar
   una tarea, en los conteos de alumnos, en el panel de profesores. */
const ADMIN = { id: "u-admin", role: "admin", is_admin: true, es_coordinador: false, full_name: "Oscar Angulo", email: "oscar@x.cr", grupo: null, created_at: "2026-01-10T10:00:00Z", invitaciones_max: 0, invitaciones_usadas: 0, teacher_id: null };
const PROFE = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false, full_name: "Karina Rojas", email: "karina@x.cr", grupo: null, created_at: "2026-02-01T10:00:00Z", invitaciones_max: 10, invitaciones_usadas: 3, teacher_id: null };
const ALUMNA = { id: "u-ana", role: "alumno", is_admin: false, es_coordinador: false, full_name: "Ana Rojas", email: "ana@x.cr", grupo: "7B", created_at: "2026-03-01T10:00:00Z", invitaciones_max: 0, invitaciones_usadas: 0, teacher_id: "u-profe" };

/* 1.205 cuentas: MÁS DE MIL a propósito. Es el único número con el que se nota
   si la página se las pide de una sola vez. */
function cuentasDeMentira() {
  const filas = [ADMIN, PROFE];
  for (let i = 0; i < 1203; i += 1) {
    filas.push({
      id: "u-" + i,
      role: "alumno",
      is_admin: false,
      es_coordinador: false,
      // Uno con tilde, para comprobar que "ramirez" también lo encuentra.
      full_name: i === 7 ? "Ana Ramírez" : "Alumno " + i,
      email: "alumno" + i + "@x.cr",
      grupo: i % 3 === 0 ? "7B" : "8A",
      created_at: "2026-03-01T10:00:00Z",
      teacher_id: i < 1200 ? "u-profe" : null,
      invitaciones_max: 0, invitaciones_usadas: 0,
    });
  }
  return filas;
}
// Los tres últimos quedan SIN profesor: son los que el filtro tiene que encontrar.
function parejasDeMentira() {
  const p = [];
  for (let i = 0; i < 1200; i += 1) p.push({ student_id: "u-" + i, teacher_id: "u-profe" });
  return p;
}

const INSCRIPCIONES = [
  { id: "i-1", cedula: "118820456", nombre: "Ana", apellido1: "Ramírez", apellido2: "Mora", fecha_nacimiento: "2012-04-03", edad: 14, contacto: "88887777", correo: "ana@x.cr", tipo_centro: "Colegio", provincia: "San José", canton: "Desamparados", centro: "Liceo de Desamparados", direccion_regional: "Desamparados", grado: "Sétimo", creado_en: "2026-09-10T15:00:00Z", circuito: 3, zona: "Urbana", modalidad: "Académica", acepto_datos: true, genero: "F", usuario: null,
    adjuntos: ["pendientes/aaaaaaaa-1111/cedula.jpg", "pendientes/bbbbbbbb-2222/Comprobante.pdf", "pendientes/cccccccc-3333/vencida.pdf"] },
  { id: "i-2", cedula: "402330111", nombre: "Bruno", apellido1: "Mena", apellido2: "Solís", fecha_nacimiento: "2010-01-20", edad: 16, contacto: "70001111", correo: "bruno@x.cr", tipo_centro: "Escuela", provincia: "Alajuela", canton: "Grecia", centro: "Escuela Central de Grecia", direccion_regional: "Occidente", grado: "Noveno", creado_en: "2026-09-12T15:00:00Z", circuito: 1, zona: "Rural", modalidad: "Técnica", acepto_datos: true, genero: "M", usuario: null },
];

function clienteFalso(usuario, perfiles, parejas) {
  return `
window.__consultas = [];
(function () {
  const TABLAS = {
    profiles: ${JSON.stringify(perfiles)},
    profile_teachers: ${JSON.stringify(parejas)},
    /* Un equipo con UN alumno dentro, que es lo que hace falta para que se
       note si volcar un grupo lo borra: la lista que se manda deja el equipo
       exactamente como llega. */
    equipos: [{ id: "eq-1", nombre: "Selección sub-14", created_by: "u-admin" }],
    equipo_alumnos: [{ equipo_id: "eq-1", alumno_id: "u-5" }],
    equipo_entrenadores: [],
    coordinador_profesores: [],
    preparacion_rivales_profesores: [],
    /* Los materiales de clase (admin.html#materiales): «Ponte a prueba» ya
       está compartido con una academia; la otra academia trae HTML en el
       nombre, que tiene que ir literal. Dos versiones cargadas de la prueba 1. */
    material_compartido: [{ id: "mc-1", producto: "ponte-a-prueba", persona_id: null, academia_id: "ac-1", todos_profesores: false, creado_en: "2026-10-06T10:00:00Z" }],
    academias: [{ id: "ac-1", nombre: "Academia Norte" }, { id: "ac-2", nombre: '<img src=x onerror="window.__xss=1">Sur' }],
    cuestionarios: [
      { id: "cq-1A", titulo: "Ponte a prueba · Prueba 1 · versión A", material: "ponte-a-prueba" },
      { id: "cq-1B", titulo: "Ponte a prueba · Prueba 1 · versión B", material: "ponte-a-prueba" },
    ],
    /* Un proyecto con dos grupos (admin.html#proyectos). «Finales» ya tiene
       profesora; el otro no, y su nombre trae HTML que tiene que ir literal.
       Las fechas: una clase que ya pasó y dos que vienen. */
    proyectos: [{ id: "p-1", slug: "campeones", nombre: "Campeones Colegiales 2026", descripcion: "Formar instructores.", periodo: "Octubre a diciembre de 2026" }],
    proyecto_grupos: [
      { id: "g-1", proyecto_id: "p-1", slug: "finales", nombre: "Finales", nivel: "avanzado", horario: "Martes y viernes", orden: 0, profesor_id: "u-profe" },
      { id: "g-2", proyecto_id: "p-1", slug: "otro", nombre: '<b>Aperturas</b>', nivel: "inicial", horario: "Miércoles", orden: 1, profesor_id: null },
    ],
    proyecto_sesiones: [
      { grupo_id: "g-1", numero: 1, fecha: "2020-01-07", titulo: "Arranque", tipo: "especial" },
      { grupo_id: "g-1", numero: 2, fecha: "2099-01-09", titulo: "Rey y peón", tipo: "clase" },
      { grupo_id: "g-1", numero: 3, fecha: "2099-01-13", titulo: "Evaluación 4", tipo: "evaluacion" },
    ],
    proyecto_tareas: [{ grupo_id: "g-1", semana: 1 }, { grupo_id: "g-1", semana: 2 }],
    /* Dos solicitudes esperando y una ya contestada: «Lo urgente» cuenta
       solo las que esperan, y las cuenta en la base (head), no bajándolas. */
    /* La bitácora (admin.html#auditoria): 62 filas, más de una página de
       50. La primera es un cambio de rol; la segunda la hizo «el sistema»;
       la tercera trae HTML en un dato guardado, que tiene que ir literal. */
    auditoria: [
      { id: 62, cuando: "2026-09-30T15:00:00Z", quien: "u-admin", via: "authenticated", tabla: "profiles", operacion: "cambio", sobre: "u-profe", antes: { role: "alumno" }, despues: { role: "profesor" } },
      { id: 61, cuando: "2026-09-30T14:00:00Z", quien: null, via: "postgres", tabla: "profile_teachers", operacion: "alta", sobre: "u-1", antes: null, despues: { student_id: "u-1", teacher_id: "u-profe" } },
      { id: 60, cuando: "2026-09-30T13:00:00Z", quien: "u-profe", via: "authenticated", tabla: "equipos", operacion: "cambio", sobre: null, antes: { nombre: "Sub-14" }, despues: { nombre: '<img src=x onerror="window.__xss=1">Sub-16' } },
    ].concat(Array.from({ length: 59 }, (_, i) => ({ id: 59 - i, cuando: "2026-09-29T10:00:00Z", quien: "u-admin", via: "authenticated", tabla: "cobros", operacion: "alta", sobre: "u-" + i, antes: null, despues: { monto: 15000 } }))),
    solicitudes_academia: [
      { id: "s-1", estado: "pendiente" }, { id: "s-2", estado: "pendiente" }, { id: "s-3", estado: "aprobada" },
    ],
    // Un recibo por revisar y entregar, uno ya entregado: solo el primero cuenta.
    recibos: [{ id: "r-1", estado: "emitido", entrega: null }, { id: "r-2", estado: "emitido", entrega: "mano" }],
  };
  /* Quién supervisa a cada profesor (supervisores_de) y quién lleva 4 días
     sin entrenar (informes_inactivos). Cada prueba pone los suyos. */
  const SUPERVISA = window.__supervisa || {};
  const INACTIVOS = (window.__inactivos || []).map((id) => ({ id: id }));
  const SUBGRUPOS_VISTA = [
    { id: "sg-1", nombre: "Los del martes", profesor_id: "u-profe", profesor: "Profe Vega",
      alumnos: ["u-1", "u-2"] },
  ];
  const USUARIO = ${JSON.stringify(usuario)};

  function constructor(tabla, filas) {
    const anotado = { tabla: tabla, range: null, eq: {} };
    window.__consultas.push(anotado);
    let filas2 = (filas || []).slice(), unica = false, cabeza = false;
    const b = {
      select(_c, op) { if (op && op.head) { cabeza = true; anotado.head = true; } return b; },
      conCabeza(op) { if (op && op.head) { cabeza = true; anotado.head = true; } return b; },
      eq(col, val) { anotado.eq[col] = val; filas2 = filas2.filter((r) => String(r[col]) === String(val)); return b; },
      in(col, vals) { anotado.in = { [col]: vals }; filas2 = filas2.filter((r) => vals.includes(r[col])); return b; },
      // .is(col, null): los recibos por entregar se cuentan así.
      is(col, val) { anotado.is = { [col]: val }; filas2 = filas2.filter((r) => (val === null ? r[col] == null : r[col] === val)); return b; },
      order() { return b; },
      range(a, z) { anotado.range = [a, z]; filas2 = filas2.slice(a, z + 1); return b; },
      single() { unica = true; return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) {
        let d = filas2;
        if (unica) d = filas2.length ? filas2[0] : null;
        if (cabeza) return Promise.resolve({ data: null, count: filas2.length, error: null }).then(res, rej);
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  window.SUPABASE_URL = "https://ejemplo.supabase.co";
  window.SUPABASE_ANON_KEY = "clave-de-mentira";
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: USUARIO.id }, access_token: "token-de-mentira" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    rpc: (n, args, op) => {
      if (n === "justificaciones_pendientes") {
        return Promise.resolve(window.__fallarJustificaciones
          ? { data: null, error: { message: "sin conexión" } } : { data: 3, error: null });
      }
      if (n === "supervisores_de") return constructor(n, (SUPERVISA[args.p_persona] || []).map((x) => ({ supervisores_de: x })));
      if (n === "informes_inactivos") return constructor(n, INACTIVOS).conCabeza(op);
      if (n === "respuestas_satisfaccion") {
        window.__satisfaccion = args;
        return constructor(n, args.p_solo_se_van ? [{ id: "e-1", seguir: "no" }] : []).conCabeza(op);
      }
      if (n === "cobros_morosos") return constructor(n, []).conCabeza(op);
      if (n === "soy_coordinador") {
        return Promise.resolve({ data: !!(USUARIO.is_admin || USUARIO.es_coordinador), error: null });
      }
      if (n === "subgrupos_a_la_vista") return constructor(n, SUBGRUPOS_VISTA);
      /* Activar la preparación de rivales: la base devuelve cómo QUEDÓ, y la
         página pinta eso. Se anota lo que se pidió. */
      /* Asignar un grupo de un proyecto: la base devuelve a quién QUEDÓ
         asignado (null si se quitó), y la página pinta eso. */
      if (n === "asignar_grupo_proyecto") {
        window.__asignaciones = (window.__asignaciones || []).concat([args]);
        return Promise.resolve({ data: args.p_profesor || null, error: null });
      }
      /* Compartir un material: la base escribe la fila (o la borra) y la
         página vuelve a LEER la lista. Se anota lo que se pidió. */
      if (n === "material_compartir") {
        window.__compartidos = (window.__compartidos || []).concat([args]);
        const lista = TABLAS.material_compartido;
        const igualA = (f) => f.producto === args.p_producto && (f.persona_id || null) === (args.p_persona || null)
          && (f.academia_id || null) === (args.p_academia || null) && !!f.todos_profesores === !!args.p_todos;
        if (args.p_compartir) {
          if (!lista.some(igualA)) lista.push({ id: "mc-" + (lista.length + 2), producto: args.p_producto, persona_id: args.p_persona || null,
            academia_id: args.p_academia || null, todos_profesores: !!args.p_todos, creado_en: "2026-10-06T11:00:00Z" });
        } else {
          for (let i = lista.length - 1; i >= 0; i--) if (igualA(lista[i])) lista.splice(i, 1);
        }
        return Promise.resolve({ data: null, error: null });
      }
      if (n === "activar_preparacion_rivales") {
        window.__activaciones = (window.__activaciones || []).concat([args]);
        return Promise.resolve({ data: !!(args && args.p_activa), error: null });
      }
      return constructor(n, []);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  };
})();
`;
}

// Lo que la página le mandó a la Edge Function, en orden.
let llamadasDeAdmin = [];

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function mal(t) { console.log("  ✗ " + t); fallos += 1; }
function bien(t) { console.log("  ✓ " + t); }

async function abrir(browser, ruta, usuario, extra, datos) {
  const ctx = await browser.newContext(extra || {});
  /* admin-manage-users es la Edge Function que de verdad escribe. Acá se dobla y
     se ANOTA lo que la página le manda: es lo único que se puede comprobar desde
     un navegador, y es justo donde está el riesgo (mandar medio grupo, o mandar
     "reemplazar" donde debía decir "agregar"). */
  await ctx.route("**/functions/v1/admin-manage-users", async (ruta2) => {
    const cuerpo = JSON.parse(ruta2.request().postData() || "{}");
    await ruta2.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, asignados: (cuerpo.target_ids || []).length }) });
    llamadasDeAdmin.push(cuerpo);
  });
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript",
      body: (datos && datos.antes || "") + clienteFalso(usuario, datos ? datos.perfiles : cuentasDeMentira(), datos ? datos.parejas : parejasDeMentira()) }));
  llamadasDeAdmin = [];
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  return { page, ctx, errores };
}

// Espera a que la página le haya mandado tal acción a la Edge Function.
async function esperarLlamada(accion, ms = 10000) {
  const hasta = Date.now() + ms;
  for (;;) {
    const hallada = llamadasDeAdmin.filter((l) => l.action === accion).pop();
    if (hallada) return hallada;
    if (Date.now() > hasta) throw new Error("no llegó ninguna llamada de " + accion);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/* ====================== admin.html · el registro de cambios ======================
   La bitácora de auditoría la escribe la base; acá se comprueba que se pinte
   bien: de 50 en 50 (range, nunca la tabla entera), con los nombres de las
   personas, el cambio legible, «el sistema» cuando no hubo nadie, el filtro
   que filtra en la base (in) y el texto guardado sin ejecutarse. */
async function pruebaAuditoria(browser) {
  console.log("\n=== El registro de cambios ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html#auditoria", { waitUntil: "networkidle" });
  await page.waitForSelector("#aud-lista li", { timeout: 20000 });
  igual("la primera página trae 50", await page.locator("#aud-lista > li").count(), 50);
  igual("se pidió con range, de 0 a 49",
    await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "auditoria").map((c) => c.range)), [[0, 49]]);
  const primera = await page.locator("#aud-lista > li").first().innerText();
  igual("el cambio de rol se lee: qué, quién, sobre quién y el cambio",
    /Cambio en los permisos de una cuenta/.test(primera) && /Lo hizo: Oscar Angulo/.test(primera)
      && /Sobre: Karina Rojas/.test(primera) && /role: alumno → profesor/.test(primera), true);
  igual("sin nadie detrás, dice «el sistema»", /Lo hizo: El sistema/.test(await page.locator("#aud-lista > li").nth(1).innerText()), true);
  igual("el HTML guardado va literal y no se ejecuta",
    await page.evaluate(() => !window.__xss && /<img src=x/.test(document.querySelectorAll("#aud-lista > li")[2].textContent)), true);
  await page.click("#aud-mas");
  await page.waitForFunction(() => document.querySelectorAll("#aud-lista > li").length === 62);
  igual("«Ver 50 más» trae el resto y se esconde",
    [await page.locator("#aud-lista > li").count(), await page.locator("#aud-mas").isVisible()], [62, false]);
  await page.selectOption("#aud-filtro", "cobros");
  await page.waitForFunction(() => document.querySelectorAll("#aud-lista > li").length === 50);
  igual("el filtro filtra en la base",
    await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "auditoria").pop().in),
    { tabla: ["planes_cobro", "suscripciones", "cobros", "pagos"] });
  igual("y solo quedan cobros",
    await page.evaluate(() => Array.from(document.querySelectorAll("#aud-lista > li")).every((li) => /Cobro emitido/.test(li.textContent))), true);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ====================== admin.html · una sola puerta ======================
   Quien administra tiene dos pantallas: el panel de la Academia (clases.html),
   con TODAS las páginas, y ésta, con lo que se maneja adentro. Había una
   segunda lista de páginas acá («Herramientas»), un «Ver como» repetido, los
   números de la plataforma repetidos en Inicio y una sección («Quién cubre a
   quién») que repetía supervisores y coordinadores. Esta prueba cuida que no
   vuelvan: lo que se repite se desordena, y la gente se pierde. */
async function pruebaUnaSolaPuerta(browser) {
  console.log("\n=== Una sola puerta para cada cosa ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  igual("el menú, por grupos y sin repetir",
    await page.evaluate(() => Array.from(document.querySelectorAll("nav[aria-label='Secciones de administración'] ul")).map((ul) =>
      document.getElementById(ul.getAttribute("aria-labelledby")).textContent + ": " + Array.from(ul.querySelectorAll("a")).map((a) => a.dataset.ir).join(", "))),
    ["Hoy: inicio", "Supervisión y coordinación: supervisores, profesores, equipos", "Personas: cuentas, crear", "La plataforma: novedades, torneos, proyectos, materiales, archivos, preparacion, auditoria"]);
  igual("cada sección del menú existe y hay una por entrada",
    await page.evaluate(() => {
      const menu = Array.from(document.querySelectorAll(".admin-nav")).map((a) => a.dataset.ir).sort();
      const secciones = Array.from(document.querySelectorAll("[data-seccion]")).map((s) => s.dataset.seccion).sort();
      return JSON.stringify(menu) === JSON.stringify(secciones) && new Set(menu).size === menu.length;
    }), true);
  igual("sin atajos a páginas, sin «Ver como», sin números repetidos en Inicio",
    await page.evaluate(() => ["atajos", "inicio-numeros", "inicio-rapidos", "inicio-mando", "nav-sin-profesor", "profesores-badge"]
      .filter((id) => document.getElementById(id)).concat(document.querySelector("[data-modo-vista]") ? ["data-modo-vista"] : [])), []);
  /* Fuera de «Lo urgente» (que lleva a donde se resuelve cada cosa) y de «Ver
     su panel», la página enlaza a otras páginas solo para decir dónde están
     todas: el panel de la Academia. */
  igual("las páginas se abren desde el panel de la Academia, no desde acá",
    await page.evaluate(() => Array.from(document.querySelectorAll("#app a[href]"))
      .filter((a) => !a.closest("#urgentes") && !a.closest("[data-seccion='torneos']") && !a.closest("[data-seccion='preparacion']")
        /* La ficha de cada grupo de un proyecto abre SU página (proyecto.html?grupo=): es el contenido del grupo, no otra puerta. */
        && !a.closest("[data-seccion='proyectos']")
        /* Cada material abre SUS archivos y sus versiones como cuestionario: es el material, no otra puerta. */
        && !a.closest("[data-seccion='materiales']")
        && !/ver_como=/.test(a.getAttribute("href")) && /\.html/.test(a.getAttribute("href")))
      .map((a) => a.getAttribute("href"))), ["clases.html"]);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Ir a una sección del panel como una persona: con el menú de la izquierda. */
async function irA(page, seccion) {
  await page.click('.admin-nav[data-ir="' + seccion + '"]');
  await page.waitForFunction((s) => {
    const sec = document.querySelector('[data-seccion="' + s + '"]');
    return sec && sec.checkVisibility();
  }, seccion, { timeout: 5000 });
}

/* ====================== admin.html · las secciones ======================
   El panel muestra UNA sección a la vez. Lo que se rompe callado: que dos se
   vean juntas (vuelve la página larguísima), que un número de «Inicio» diga
   una cosa y lleve a otra, o que la dirección con #sección no abra esa. Lo
   que se ve se MIDE con checkVisibility(), no con el atributo. */
async function pruebaSecciones(browser) {
  console.log("\n=== Las secciones del panel ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  const visibles = () => page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-seccion]")).filter((s) => s.checkVisibility()).map((s) => s.dataset.seccion));

  igual("al entrar se ve SOLO «Inicio»", await visibles(), ["inicio"]);
  igual("y el menú lo marca como la página actual",
    await page.getAttribute('.admin-nav[aria-current="page"]', "data-ir"), "inicio");
  igual("el saludo lleva el nombre de quien entra",
    /^(Buenos días|Buenas tardes|Buenas noches), Oscar$/.test(await page.textContent("#admin-saludo")), true);

  /* «Sin profesor» sale de la lista entera (1205, pedida de mil en mil), no
     del primer pedazo, y lleva a ESAS cuentas. */
  igual("lo urgente cuenta los sin profesor con la lista entera",
    await page.evaluate(() => document.querySelector('#urgentes li[data-pendiente="sin-profesor"] p:nth-of-type(2)').textContent),
    "3 alumnos sin profesor asignado");
  await page.click('#urgentes li[data-pendiente="sin-profesor"] a');
  await page.waitForFunction(() => /3 cuentas/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  igual("«sin profesor» lleva a Cuentas con ese filtro",
    [await visibles(), await page.evaluate(() => document.getElementById("role-filter").value)],
    [["cuentas"], "sin-profesor"]);
  igual("y la dirección dice dónde se está", await page.evaluate(() => location.hash), "#cuentas");

  await page.goBack();
  await page.waitForFunction(() => document.querySelector('[data-seccion="inicio"]').checkVisibility(), { timeout: 5000 });
  bien("«Atrás» del navegador vuelve a Inicio");

  // El buscador está arriba en todas: escribir lleva a Cuentas.
  // Y el filtro «sin profesor» de recién quedó puesto, escondido: si siguiera
  // mandando, Ana (que tiene profesora) no saldría y no se sabría por qué.
  await irA(page, "equipos");
  igual("el menú cambia de sección", await visibles(), ["equipos"]);
  await page.fill("#user-search", "ramirez");
  await page.waitForFunction(() => /1 cuenta/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  igual("buscar desde otra sección lleva a Cuentas con lo encontrado", await visibles(), ["cuentas"]);

  // Una dirección con #sección abre esa.
  await page.goto(BASE + "/admin.html#supervisores", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  igual("admin.html#supervisores abre Supervisores", await visibles(), ["supervisores"]);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ====================== admin.html · lo urgente ======================
   Lo primero que se ve al entrar es lo que alguien está esperando, no cuántas
   cuentas hay. Lo que se rompe callado: un conteo que falla y se pinta como
   «al día», un número que se cuenta bajándose la lista (y se corta a las mil),
   un pendiente que lleva a otro lado, o un profesor que nadie supervisa y no
   sale. Quién supervisa a quién lo contesta la base (supervisores_de): si la
   página lo armara con supervisor_cuentas, Karina saldría sin supervisora. */
function genteDeMando() {
  const base = { is_admin: false, es_coordinador: false, es_supervisor: false, email: "x@x.cr", grupo: null, created_at: "2026-02-01T10:00:00Z", invitaciones_max: 5, invitaciones_usadas: 0, teacher_id: null };
  const perfiles = [
    ADMIN,
    Object.assign({}, base, { id: "u-profe", role: "profesor", full_name: "Karina Rojas" }),
    Object.assign({}, base, { id: "u-sup", role: "profesor", full_name: "Marta Solano", es_supervisor: true }),
    Object.assign({}, base, { id: "u-coord", role: "profesor", full_name: "Luis Coto", es_coordinador: true }),
    Object.assign({}, base, { id: "u-pedro", role: "profesor", full_name: "Pedro Vega" }),
    Object.assign({}, base, { id: "u-a1", role: "alumno", full_name: "Alumna Uno", grupo: "7B" }),
    Object.assign({}, base, { id: "u-a2", role: "alumno", full_name: "Alumno Dos", grupo: "7B" }),
    Object.assign({}, base, { id: "u-a3", role: "alumno", full_name: "Alumno Tres", grupo: "8A" }),
    Object.assign({}, base, { id: "u-a4", role: "alumno", full_name: "Alumna Suelta", grupo: "8A" }),
  ];
  const parejas = [
    { student_id: "u-a1", teacher_id: "u-profe" }, { student_id: "u-a2", teacher_id: "u-profe" },
    { student_id: "u-a3", teacher_id: "u-pedro" },
  ];
  /* Marta supervisa a Karina POR LA ACADEMIA: no hay ninguna fila en
     supervisor_cuentas. Solo supervisores_de() lo sabe. */
  const antes = 'window.__supervisa = { "u-profe": ["u-sup"] }; window.__inactivos = ["u-a1", "u-a3"];';
  return { perfiles, parejas, antes };
}

async function pruebaUrgente(browser) {
  console.log("\n=== Lo urgente, lo primero que se ve ===");
  const datos = genteDeMando();
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN, null, datos);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.waitForFunction(() => /Revisado a las/.test(document.getElementById("urgentes-resumen").textContent), null, { timeout: 10000 });

  const pendientes = await page.evaluate(() => Array.from(document.querySelectorAll("#urgentes li")).filter((li) => li.checkVisibility())
    .map((li) => li.dataset.pendiente + " · " + li.querySelector("p").textContent + " · " + li.querySelector("p:nth-of-type(2)").textContent));
  igual("los pendientes, lo urgente primero", pendientes, [
    "solicitudes · Urgente · 2 solicitudes de ingreso sin responder",
    "justificaciones · Urgente · 3 justificaciones de ausencia por revisar",
    "sin-profesor · Urgente · 1 alumno sin profesor asignado",
    "profes-sin-nadie · Urgente · 2 profesores que nadie supervisa ni coordina","recibosSinEntregar · Urgente · 1 recibo de pago por revisar y entregar",
    "coord-vacios · A vigilar · 1 coordinador sin profesores asignados",
    "seVan · A vigilar · 1 alumno dijo este mes que no sigue",
    "inactivos · A vigilar · 2 alumnos llevan 4 días o más sin entrenar",
  ]);
  igual("lo que está en cero se dice «al día», no desaparece",
    await page.evaluate(() => Array.from(document.querySelectorAll("#urgentes-al-dia li")).filter((li) => li.checkVisibility()).map((li) => li.textContent)),
    ["✓ Cada supervisor tiene gente a cargo", "✓ Pagos al día"]);
  igual("el resumen lo cuenta", (await page.textContent("#urgentes-resumen")).replace(/ Revisado.*/, ""), "5 cosas urgentes y 3 para vigilar.");
  igual("y el menú lleva el número de lo urgente",
    await page.evaluate(() => { const b = document.getElementById("nav-urgentes"); return b.checkVisibility() ? b.textContent : "no se ve"; }), "5");

  // Se cuenta en la base, no bajándose la lista.
  const consultas = await page.evaluate(() => window.__consultas.filter((c) => ["solicitudes_academia", "cobros_morosos", "respuestas_satisfaccion"].includes(c.tabla)).map((c) => c.tabla + (c.head ? ":head" : ":LISTA")));
  igual("solicitudes, cobros y satisfacción se cuentan con head", consultas.sort(), ["cobros_morosos:head", "respuestas_satisfaccion:head", "solicitudes_academia:head"]);
  igual("«este mes» arranca el primero del mes", /-01$/.test((await page.evaluate(() => window.__satisfaccion)).p_desde), true);

  // Cada pendiente lleva a donde se resuelve.
  igual("las solicitudes llevan a solicitudes.html",
    await page.getAttribute('#urgentes li[data-pendiente="solicitudes"] a', "href"), "solicitudes.html");
  await page.click('#urgentes li[data-pendiente="sin-profesor"] a');
  await page.waitForFunction(() => /1 cuenta/.test(document.getElementById("users-summary").textContent), null, { timeout: 10000 });
  igual("«sin profesor» lleva a Cuentas con ese filtro",
    await page.evaluate(() => [document.getElementById("role-filter").value, Array.from(document.querySelectorAll("[data-seccion]")).filter((s) => s.checkVisibility()).map((s) => s.dataset.seccion)]),
    ["sin-profesor", ["cuentas"]]);
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('[data-seccion="inicio"]').checkVisibility(), null, { timeout: 5000 });
  await page.click('#urgentes li[data-pendiente="profes-sin-nadie"] a');
  await page.waitForFunction(() => document.querySelector('[data-seccion="profesores"]').checkVisibility(), null, { timeout: 5000 });
  bien("«profesores sin nadie» lleva a Profesores y coordinadores");

  /* Quién tiene a cargo a cada profesor, en su fila: una sola vez, donde se
     arregla. Karina está a cargo de Marta SOLO por la academia. */
  const cargo = (id) => page.evaluate((i) => document.querySelector('[data-cargo="' + i + '"]').textContent, id);
  igual("Karina: la supervisa Marta (por la academia)", await cargo("u-profe"), "Supervisa: Marta Solano");
  igual("Pedro: nadie, y se dice", await cargo("u-pedro"), "⚠️ Nadie lo supervisa ni coordina");
  igual("Luis coordina pero no tiene a nadie, y se le avisa en su fila",
    await page.evaluate(() => document.querySelector('[data-abarca="u-coord"]').textContent),
    "⚠️ No coordina a ningún profesor: solo ve a sus propios alumnos.");
  igual("los profesores que nadie ve, con cuántos alumnos (la supervisora no cuenta)",
    await page.evaluate(() => Array.from(document.querySelectorAll("#mando-sin-nadie li")).filter((li) => li.checkVisibility()).map((li) => li.querySelector("span").textContent)),
    ["Luis Coto · 0 alumnos", "Pedro Vega · 1 alumno"]);
  igual("y se les puede mirar el panel",
    await page.getAttribute("#mando-sin-nadie li:last-child a", "href"), "clases.html?ver_como=u-pedro");
  // Y en la ficha de cada supervisor, lo que cubre y a quién llamar.
  await irA(page, "supervisores");
  igual("Marta cubre a Karina y sus 2 alumnos, 1 sin entrenar",
    await page.evaluate(() => document.querySelector('[data-cubre="u-sup"]').textContent),
    "Cubre 1 profesor y 2 alumnos; 1 lleva 4 días o más sin entrenar.");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  /* Un conteo que falla NO es un cero. */
  console.log("\n=== Un conteo que falla no dice «al día» ===");
  const d2 = genteDeMando();
  d2.antes += " window.__fallarJustificaciones = true;";
  const r2 = await abrir(browser, "/admin.html", ADMIN, null, d2);
  await r2.page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await r2.page.waitForFunction(() => /Revisado a las/.test(document.getElementById("urgentes-resumen").textContent), null, { timeout: 10000 });
  igual("las justificaciones dicen que no se pudieron revisar",
    await r2.page.evaluate(() => { const li = document.querySelector('#urgentes li[data-pendiente="justificaciones"]'); return li && li.checkVisibility() ? li.querySelector("p").textContent : "no está"; }),
    "No se pudo revisar");
  igual("y no salen entre lo que está al día",
    await r2.page.evaluate(() => Array.from(document.querySelectorAll("#urgentes-al-dia li")).some((li) => /Justificaciones/.test(li.textContent))), false);
  await r2.ctx.close();
}

/* ============ admin.html · a quién se le activa la preparación de rivales ============ */

async function pruebaPreparacionRivales(browser) {
  console.log("\n=== Preparación de rivales: a qué profesores se les activa ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await irA(page, "preparacion");
  await page.waitForSelector("#prep-lista li", { timeout: 10000 });
  const filas = () => page.evaluate(() => Array.from(document.querySelectorAll("#prep-lista li")).filter((li) => li.checkVisibility())
    .map((li) => [li.querySelector("p").textContent, (li.querySelector("[role=switch]") || {}).textContent || "", li.querySelector("[role=switch]") ? li.querySelector("[role=switch]").getAttribute("aria-checked") : "sin interruptor"]));
  igual("salen los profesores, y solo ellos, con su interruptor apagado", await filas(), [["Karina Rojas", "○Apagada", "false"]]);
  igual("el resumen lo dice con palabras", await page.textContent("#prep-resumen"), "0 de 1 profesores la tienen activa");
  await page.click("#prep-lista [role=switch]");
  await page.waitForFunction(() => document.querySelector("#prep-lista [role=switch]").getAttribute("aria-checked") === "true", null, { timeout: 5000 });
  igual("activarla le pide a la base ESE profesor, encendido",
    await page.evaluate(() => window.__activaciones), [{ p_profesor: "u-profe", p_activa: true }]);
  igual("y el interruptor pinta lo que devolvió la base, también en texto", await filas(), [["Karina Rojas", "●Activa", "true"]]);
  igual("el resumen se actualiza", await page.textContent("#prep-resumen"), "1 de 1 profesores la tiene activa");
  await page.fill("#prep-buscar", "zzz");
  igual("buscar a alguien que no está dice que no hay", await page.evaluate(() => document.getElementById("prep-vacio").checkVisibility()), true);
  await page.fill("#prep-buscar", "karina");
  igual("y buscando por nombre se encuentra", (await filas()).length, 1);
  igual("el botón abre la herramienta", await page.getAttribute('[data-seccion="preparacion"] a[href="preparacion-rivales.html"]', "href"), "preparacion-rivales.html");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ============ admin.html · los materiales de clase y con quién se comparten ============ */

async function pruebaMateriales(browser) {
  console.log("\n=== Materiales de clases: con quién se comparte cada uno ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  // Las confirmaciones son de js/avisos.js: se aprietan como una persona.
  await page.evaluate(contestarAvisos);
  await irA(page, "materiales");
  await page.waitForSelector("#mat-lista article", { timeout: 10000 });
  const resumen = () => page.textContent("#mat-lista [role=status]");
  const lista = () => page.evaluate(() => Array.from(document.querySelectorAll("#mat-lista article > section:first-of-type ul:first-of-type > li"))
    .filter((li) => li.checkVisibility()).map((li) => li.querySelector("p").textContent));
  igual("los libros, con sus archivos", await page.evaluate(() => Array.from(document.querySelectorAll("#mat-lista article > div:first-child a[href^='material/']")).map((a) => a.getAttribute("href"))),
    ["material/ponte-a-prueba/ponte-a-prueba.pdf", "material/ponte-a-prueba/ponte-a-prueba-accesible.html",
     "material/ponte-a-prueba/versiones/claves-de-correccion.pdf", "material/ponte-a-prueba/ponte-a-prueba-versiones-accesible.html",
     "material/mide-tu-fuerza/mide-tu-fuerza.pdf", "material/mide-tu-fuerza/mide-tu-fuerza-accesible.html",
     "material/peonita/peonita.pdf", "material/peonita/peonita-accesible.html",
     "material/peonita-trucos/peonita-trucos.pdf", "material/peonita-trucos/peonita-trucos-accesible.html"]);
  // El banco de ejercicios no tiene pruebas como cuestionario: solo se
  // comparte. Antes de separarlo, cualquier material sin pruebas pintaba
  // igual el título y «todavía no están en la base».
  igual("el banco de ejercicios se comparte y no tiene sección de pruebas", await page.evaluate(() => {
    const art = document.querySelector("#mat-lista article[aria-labelledby='mat-titulo-mide-tu-fuerza']");
    return [art.querySelectorAll(":scope > section").length, /como cuestionario/.test(art.textContent), !!art.querySelector("#mat-mide-tu-fuerza-buscar")];
  }), [1, false, true]);
  igual("el cuento de Peonita tampoco", await page.evaluate(() => {
    const art = document.querySelector("#mat-lista article[aria-labelledby='mat-titulo-peonita']");
    return [art.querySelectorAll(":scope > section").length, /como cuestionario/.test(art.textContent), !!art.querySelector("#mat-peonita-buscar")];
  }), [1, false, true]);
  igual("dice con quién está compartido, también con palabras", [await resumen(), await lista()],
    ["Lo tienen: 1 academia, y tú.", ["🏫 Academia Norte"]]);

  // Compartir con una persona: se busca sin tildes, y no salen las cuentas de administración.
  await page.fill("#mat-ponte-a-prueba-buscar", "karína");
  await page.waitForSelector("#mat-ponte-a-prueba-resultados button", { timeout: 5000 });
  igual("buscar encuentra sin importar las tildes", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#mat-ponte-a-prueba-resultados li p:first-child")).map((p) => p.textContent)), ["Karina Rojas"]);
  await page.fill("#mat-ponte-a-prueba-buscar", "oscar");
  igual("quien administra no sale: ya lo tiene siempre", await page.textContent("#mat-ponte-a-prueba-resultados"), "No hay nadie más con ese nombre o correo.");
  await page.fill("#mat-ponte-a-prueba-buscar", "karina");
  await page.click("#mat-ponte-a-prueba-resultados button");
  await page.waitForFunction(() => /1 persona/.test(document.querySelector("#mat-lista [role=status]").textContent), null, { timeout: 5000 });
  igual("compartir le pide a la base ESA persona y ESE material",
    await page.evaluate(() => window.__compartidos[0]), { p_producto: "ponte-a-prueba", p_persona: "u-profe", p_academia: null, p_todos: false, p_compartir: true });
  igual("y la lista pinta lo que quedó en la base", [await resumen(), await lista()],
    ["Lo tienen: 1 academia, 1 persona, y tú.", ["🏫 Academia Norte", "Karina Rojas"]]);

  // Una academia: la que ya está no se ofrece de nuevo, y el nombre va literal.
  await page.selectOption("#mat-ponte-a-prueba-tipo", "academia");
  igual("solo se ofrecen las academias que no lo tienen, con el nombre tal cual", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#mat-ponte-a-prueba-academia option")).map((o) => o.textContent)), ['<img src=x onerror="window.__xss=1">Sur']);
  igual("y el nombre no se ejecuta", await page.evaluate(() => window.__xss || 0), 0);

  // Todos los profesores.
  await page.selectOption("#mat-ponte-a-prueba-tipo", "todos");
  await page.click("#mat-lista button:has-text('Compartir con todos los profesores')");
  await page.waitForFunction(() => /todos los profesores/.test(document.querySelector("#mat-lista [role=status]").textContent), null, { timeout: 5000 });
  igual("con todos los profesores", await resumen(), "Lo tienen: todos los profesores, 1 academia, 1 persona, y tú.");

  // Dejar de compartir pregunta antes, y quita esa fila y nada más.
  await page.click("#mat-lista button[aria-label='Dejar de compartir con Karina Rojas']");
  await page.waitForFunction(() => !/1 persona/.test(document.querySelector("#mat-lista [role=status]").textContent), null, { timeout: 5000 });
  igual("dejar de compartir quita a esa persona y nada más", [await resumen(), await page.evaluate(() => window.__compartidos.slice(-1)[0])],
    ["Lo tienen: todos los profesores, 1 academia, y tú.", { p_producto: "ponte-a-prueba", p_persona: "u-profe", p_academia: null, p_todos: false, p_compartir: false }]);

  // Las sub-fichas: seis pruebas, y las versiones que hay llevan a su cuestionario.
  igual("seis pruebas, cada una con sus tres versiones", await page.evaluate(() => {
    const fichas = Array.from(document.querySelectorAll("#mat-lista article:first-of-type > section:last-of-type > ul > li"));
    return [fichas.length, fichas[0].querySelectorAll("ul > li").length];
  }), [6, 3]);
  igual("las versiones cargadas llevan a su cuestionario; la que falta lo dice", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#mat-lista article:first-of-type > section:last-of-type > ul > li"))[0].querySelector("ul").textContent.replace(/\s+/g, " ").trim()),
    "Versión A🖨️ PDFVersión B🖨️ PDFVersión C: sin cargar🖨️ PDF");
  // Cada versión también en papel: su cuadernillo, aunque no esté cargada como cuestionario.
  igual("cada versión lleva a su PDF para imprimir", await page.evaluate(() =>
    ["A", "C"].map((l) => document.querySelector("#mat-lista a[aria-label='Imprimir la versión " + l + " de la prueba 6']").getAttribute("href"))),
    ["material/ponte-a-prueba/versiones/prueba-6-version-a.pdf", "material/ponte-a-prueba/versiones/prueba-6-version-c.pdf"]);
  igual("el enlace de la versión A", await page.getAttribute("#mat-lista a[aria-label='Ver la versión A de la prueba 1']", "href"), "cuestionarios.html?id=cq-1A");
  // CAPTURAS=<carpeta> guarda cómo se ve, para mirarla y no solo medir el DOM.
  if (process.env.CAPTURAS) await page.screenshot({ path: path.join(process.env.CAPTURAS, "admin-materiales.png"), fullPage: true });
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ============ admin.html · Archivos: todos los PDF, Word, Excel y presentaciones ============
   La lista es data/archivos.json (herramientas/archivos-catalogo.js, leído del
   disco): acá se mira que la pantalla muestre TODOS, cada tipo en su ficha y
   en su lugar, que buscar y filtrar escondan de verdad (checkVisibility) y que
   «Bajar los N» baje N. Que el JSON esté al día con el disco lo cuida
   verificar-archivos-catalogo.js. */
async function pruebaPdfs(browser) {
  console.log("\n=== Archivos: PDF, Word, Excel y presentaciones, ordenados, para abrir o bajar ===");
  const todo = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "archivos.json"), "utf8"));
  const catalogo = todo.pdf;
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN, { acceptDownloads: true });
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await irA(page, "archivos");
  await page.waitForSelector("#pdf-lista .pdf-fila", { state: "attached", timeout: 10000 });
  igual("cuatro fichas, cada una con cuántos tiene, y se abre en PDF", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#arch-fichas [role=tab]")).map((b) => b.textContent.trim() + (b.getAttribute("aria-selected") === "true" ? " *" : ""))),
    ["📕 PDF (" + catalogo.total + ") *", "📝 Word (" + todo.word.total + ")", "📊 Excel (" + todo.excel.total + ")", "📽️ Presentaciones (" + todo.presentaciones.total + ")"]);
  igual("solo se ve la ficha de PDF", await page.evaluate(() =>
    ["pdf", "word", "excel", "presentaciones"].filter((t) => document.getElementById("arch-panel-" + t).checkVisibility())), ["pdf"]);
  igual("están todos los PDF, cada uno una vez", await page.evaluate(() => {
    const rutas = Array.from(document.querySelectorAll("#pdf-lista .pdf-fila a[download]")).map((a) => a.getAttribute("href"));
    return [rutas.length, new Set(rutas).size];
  }), [catalogo.total, catalogo.total]);
  igual("el resumen dice cuántos son", new RegExp("^" + catalogo.total + " PDF en total").test(await page.textContent("#pdf-resumen")), true);
  igual("primero los libros, después los cursos, después los sueltos", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#pdf-lista h3")).map((h) => h.textContent.trim())),
    ["📕 Libros y material", "🎓 Cursos", "📄 Otros PDF del sitio"]);
  igual("los cursos, por nivel y en el orden del catálogo", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#pdf-lista .pdf-curso summary")).map((s) => s.firstElementChild.textContent.replace("▸", ""))),
    catalogo.cursos.map((c) => c.titulo));
  igual("los cursos empiezan plegados: se ven los libros, no las 400 filas", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#pdf-lista .pdf-fila")).filter((f) => f.checkVisibility()).length),
    catalogo.material.length + catalogo.sueltos.length);
  await page.click("#pdf-lista .pdf-curso summary");
  const leccion = await page.evaluate(() => {
    const l = document.querySelector("#pdf-lista .pdf-curso[open] .pdf-leccion");
    return [l.querySelector("p").textContent, Array.from(l.querySelectorAll(".pdf-fila p:first-child")).map((p) => p.textContent)];
  });
  igual("abrir un curso muestra cada lección con su material y sus ejercicios", leccion,
    ["1. " + catalogo.cursos[0].lecciones[0].titulo, ["Material de estudio", "Ejercicios"]]);
  igual("el enlace de cada PDF existe en el sitio", await page.evaluate(async () => {
    const rutas = Array.from(document.querySelectorAll("#pdf-lista a[download]")).map((a) => a.getAttribute("href")).filter((_, i) => i % 37 === 0);
    const malos = [];
    for (const r of rutas) { const x = await fetch(r, { method: "HEAD" }); if (!x.ok) malos.push(r + " " + x.status); }
    return malos;
  }), []);

  await page.fill("#pdf-buscar", "lucena");
  const conLucena = await page.evaluate(() => Array.from(document.querySelectorAll("#pdf-lista .pdf-fila")).filter((f) => f.checkVisibility())
    .map((f) => f.querySelector("a[download]").getAttribute("href")));
  igual("buscar (sin tildes ni mayúsculas) abre el curso y deja solo lo que coincide",
    conLucena.length > 0 && conLucena.every((r) => /lucena/.test(r)) && conLucena.length < catalogo.total, true);
  await page.fill("#pdf-buscar", "");
  await page.selectOption("#pdf-tipo", "ejercicios");
  igual("«Solo ejercicios» deja solo ejercicios", await page.evaluate(() => {
    const v = Array.from(document.querySelectorAll("#pdf-lista .pdf-fila")).filter((f) => f.checkVisibility());
    return v.length > 0 && v.every((f) => f.dataset.tipo === "ejercicios") && !document.querySelector("[aria-labelledby='pdf-titulo-material']").checkVisibility();
  }), true);
  await page.selectOption("#pdf-tipo", "todos");
  await page.fill("#pdf-buscar", "zzzz no existe");
  igual("si nada coincide, se dice", await page.locator("#pdf-vacio").isVisible(), true);
  await page.fill("#pdf-buscar", "");

  const bajados = [];
  page.on("download", (d) => bajados.push(d.suggestedFilename()));
  await page.click("[aria-labelledby='pdf-titulo-material'] button");
  await page.waitForFunction(() => /^Listo/.test(document.querySelector("[aria-labelledby='pdf-titulo-material'] [role=status]").textContent), null, { timeout: 30000 });
  igual("«Bajar los N» de libros baja esos N", bajados.slice().sort(),
    catalogo.material.map((a) => a.ruta.split("/").pop()).sort());
  if (process.env.CAPTURAS) await page.screenshot({ path: path.join(process.env.CAPTURAS, "admin-pdf.png"), fullPage: true });

  // Word: con la flecha del teclado, como cualquier grupo de pestañas.
  await page.focus("#arch-ficha-pdf");
  await page.keyboard.press("ArrowRight");
  igual("la flecha pasa a Word, con el foco y solo esa ficha a la vista", await page.evaluate(() => [
    document.activeElement.id, document.getElementById("arch-ficha-word").getAttribute("aria-selected"),
    ["pdf", "word", "excel", "presentaciones"].filter((t) => document.getElementById("arch-panel-" + t).checkVisibility())]),
    ["arch-ficha-word", "true", ["word"]]);
  const words = todo.word.grupos.flatMap((g) => g.archivos.map((a) => a.ruta));
  igual("están todos los Word, por carpeta, y solo se bajan (no se «abren»)", await page.evaluate(() => {
    const filas = Array.from(document.querySelectorAll("#arch-lista-word .pdf-fila")).filter((f) => f.checkVisibility());
    return [filas.map((f) => f.querySelector("a[download]").getAttribute("href")).sort(),
      filas.every((f) => f.querySelectorAll("a").length === 1)];
  }), [words.slice().sort(), true]);
  igual("cada carpeta con su nombre", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#arch-lista-word h3")).map((h) => h.textContent.replace("📁 ", ""))),
    todo.word.grupos.map((g) => g.titulo));
  if (process.env.CAPTURAS) await page.screenshot({ path: path.join(process.env.CAPTURAS, "admin-word.png") });
  await page.keyboard.press("ArrowRight");
  const excelTexto = await page.evaluate(() => document.getElementById("arch-panel-excel").checkVisibility() && document.getElementById("arch-lista-excel").textContent);
  igual("Excel: lo que hay, o se dice que todavía no hay ninguno",
    todo.excel.total ? (excelTexto.match(/\.xls/g) || []).length >= todo.excel.total : /Todavía no hay ningún Excel/.test(excelTexto), true);
  await page.keyboard.press("ArrowRight");
  const pres = todo.presentaciones;
  const rutasPres = pres.material.concat(pres.sueltos, ...pres.cursos.map((c) => c.lecciones.flatMap((l) => l.archivos).concat(c.otros))).map((a) => a.ruta);
  igual("Presentaciones: están todas, una vez, y solo se bajan", await page.evaluate(() => {
    const p = document.getElementById("arch-panel-presentaciones");
    const filas = Array.from(p.querySelectorAll(".pdf-fila"));
    return [p.checkVisibility(), filas.map((f) => f.querySelector("a[download]").getAttribute("href")).sort(),
      filas.every((f) => f.querySelectorAll("a").length === 1)];
  }).then(([ve, rutas, soloBajar]) => [ve, rutas.length, JSON.stringify(rutas) === JSON.stringify(rutasPres.slice().sort()), soloBajar]),
  [true, rutasPres.length, true, true]);
  igual("por curso, en el orden del catálogo, plegados", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#arch-lista-presentaciones .pdf-curso")).map((d) => d.querySelector("summary").firstElementChild.textContent.replace("▸", "") + (d.open ? " (abierto)" : ""))),
    pres.cursos.map((c) => c.titulo));
  await page.click("#arch-lista-presentaciones .pdf-curso summary");
  igual("cada lección con su presentación", await page.evaluate(() => {
    const l = document.querySelector("#arch-lista-presentaciones .pdf-curso[open] .pdf-leccion");
    return [l.querySelector("p").textContent, l.querySelector(".pdf-fila p").textContent];
  }), ["1. " + pres.cursos[0].lecciones[0].titulo, "Presentación"]);
  if (process.env.CAPTURAS) await page.screenshot({ path: path.join(process.env.CAPTURAS, "admin-presentaciones.png") });
  await page.focus("#arch-ficha-presentaciones");
  await page.keyboard.press("ArrowRight");
  igual("y desde la última, la flecha vuelve a PDF", await page.evaluate(() => document.activeElement.id), "arch-ficha-pdf");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ============ admin.html · los proyectos: una ficha por grupo y su profesor ============ */

async function pruebaProyectos(browser) {
  console.log("\n=== Proyectos: una ficha por grupo y a quién se le asigna ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html#proyectos", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.waitForSelector("#proy-lista article", { timeout: 10000 });
  const fichas = () => page.evaluate(() => Array.from(document.querySelectorAll("#proy-lista article")).filter((a) => a.checkVisibility()).map((a) => ({
    nombre: a.querySelector("h4").textContent,
    lineas: Array.from(a.querySelectorAll("li")).map((li) => li.textContent.trim()),
    proxima: Array.from(a.querySelectorAll("p")).map((p) => p.textContent).find((t) => /Próxima clase|Ya se dieron/.test(t)) || "",
    elegido: a.querySelector("select").selectedOptions[0].textContent,
    estado: a.querySelector("[role=status]").textContent,
    enlace: a.querySelector("a[href^='proyecto.html']").getAttribute("href"),
  })));
  const f = await fichas();
  igual("el proyecto con su nombre", await page.evaluate(() => document.querySelector("#proy-lista h3").textContent), "Campeones Colegiales 2026");
  igual("una ficha por grupo, en su orden, y el nombre con HTML va como texto", f.map((x) => x.nombre), ["Finales", "<b>Aperturas</b>"]);
  igual("el HTML de un nombre no crea nodos", await page.evaluate(() => document.querySelectorAll("#proy-lista b").length), 0);
  igual("cada ficha dice lo que trae (y el emoji no se lee)", f[0].lineas, [
    "📚 3 clases de 2 horas, con su paso a paso y los ejercicios en orden", "🎉 Un momento divertido en cada clase",
    "📨 2 tareas semanales listas para mandar", "📝 1 clase de evaluación"]);
  igual("los emojis van escondidos del lector de pantalla", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#proy-lista li > span:first-child")).every((s) => s.getAttribute("aria-hidden") === "true")), true);
  igual("la próxima clase es la primera que no ha pasado (en hora de Costa Rica)", /^Próxima clase: .* · Rey y peón$/.test(f[0].proxima), true);
  igual("quién lo tiene asignado, en el selector y escrito", [f[0].elegido, f[0].estado, f[1].elegido, f[1].estado],
    ["Karina Rojas", "Asignado a Karina Rojas", "Sin asignar", "Sin profesor asignado"]);
  igual("el selector ofrece solo profesores (no alumnos ni administración)", await page.evaluate(() =>
    Array.from(document.querySelectorAll("#proy-lista article")[1].querySelectorAll("option")).map((o) => o.textContent)), ["Sin asignar", "Karina Rojas"]);
  igual("y cada ficha abre su grupo", f.map((x) => x.enlace), ["proyecto.html?grupo=g-1", "proyecto.html?grupo=g-2"]);

  const segunda = page.locator("#proy-lista article").nth(1);
  await segunda.locator("select").selectOption("u-profe");
  await segunda.getByRole("button", { name: "Asignar" }).click();
  await page.waitForFunction(() => /Asignado a Karina Rojas/.test(document.querySelectorAll("#proy-lista [role=status]")[1].textContent), null, { timeout: 5000 });
  igual("asignar le pide a la base ESE grupo y ESE profesor", await page.evaluate(() => window.__asignaciones), [{ p_grupo: "g-2", p_profesor: "u-profe" }]);
  await segunda.locator("select").selectOption("");
  await segunda.getByRole("button", { name: "Asignar" }).click();
  await page.waitForFunction(() => /Sin profesor/.test(document.querySelectorAll("#proy-lista [role=status]")[1].textContent), null, { timeout: 5000 });
  igual("y quitarlo manda null", await page.evaluate(() => window.__asignaciones.pop()), { p_grupo: "g-2", p_profesor: null });
  igual("las tablas se piden con su tope (PostgREST corta a ~1000 sin avisar)", await page.evaluate(() =>
    window.__consultas.filter((c) => /^proyecto/.test(c.tabla)).every((c) => c.range)), true);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ====================== admin.html · las cuentas ====================== */

async function pruebaFichasDeGrupo(browser) {
  console.log("\n=== Las fichas de grupo (lo primero que se ve) ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  // LO QUE MÁS IMPORTA: las cuentas se piden de mil en mil. PostgREST corta a
  // las mil filas sin dar ningún error.
  const rangos = await page.evaluate(() =>
    window.__consultas.filter((c) => c.tabla === "profiles" && c.range).map((c) => c.range));
  igual("las 1205 cuentas se piden de mil en mil, no de un solo pedido",
    rangos, [[0, 999], [1000, 1999]]);
  const rangosPT = await page.evaluate(() =>
    window.__consultas.filter((c) => c.tabla === "profile_teachers" && c.range).map((c) => c.range));
  igual("y los profesores de cada alumno, igual", rangosPT, [[0, 999], [1000, 1999]]);

  /* Y lo que se pidió: que la pantalla NO se sature. Con 1205 cuentas, lo
     primero que se ve son tres fichas, no mil doscientas filas. */
  igual("al entrar no se pinta ni una fila de cuenta",
    await page.evaluate(() => document.querySelectorAll("#users-body tr").length), "0");
  igual("el panel de cuentas arranca escondido",
    await page.evaluate(() => document.getElementById("users-panel").hidden), "true");

  const fichas = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#grupos-fichas article")).map((f) => ({
      nombre: f.querySelector("h3").textContent,
      cuenta: f.querySelector("p").textContent,
      profesores: Array.from(f.querySelectorAll("span.rounded-full")).map((n) => n.textContent),
      tieneSelector: !!f.querySelector("select"),
      aviso: (f.textContent.match(/⚠️[^＋]*/) || [""])[0].trim(),
    })));
  igual("una ficha por grupo, y el equipo docente al final",
    fichas.map((f) => f.nombre), ["7B", "8A", "Profesores y administración"]);
  igual("cada una dice cuánta gente tiene",
    fichas.map((f) => f.cuenta), ["401 alumnos", "802 alumnos", "2 cuentas"]);
  igual("y qué profesores la llevan", fichas[1].profesores, ["Karina Rojas · 800"]);
  // Los tres sin profesor caen 1 en 7B y 2 en 8A: cada ficha avisa de LOS SUYOS,
  // que es lo que sirve para ir a arreglarlo.
  igual("los alumnos sin profesor se ven en la ficha de su propio grupo",
    [fichas[0].aviso, fichas[1].aviso],
    ["⚠️ 1 sin profesor asignado", "⚠️ 2 sin profesor asignado"]);
  igual("el equipo docente no lleva selector de profesor (a un profesor no se le asigna profesor)",
    fichas[2].tieneSelector, "false");

  /* Agregarle un profesor a TODO el grupo desde su ficha, que es la operación
     de todos los años ("todo 7° B también al profesor nuevo"). Va en modo
     "agregar": suma, no reemplaza — quitarle un profesor a alguien sin querer
     es el error caro acá. */
  // Las confirmaciones son de js/avisos.js: se aprietan como una persona.
  await page.evaluate(contestarAvisos);
  await irA(page, "cuentas");
  await page.selectOption("#grupos-fichas article:first-of-type select", PROFE.id);
  const lote = await esperarLlamada("assign_bulk");
  igual("la ficha manda a todo el grupo, no a una página de él", lote.target_ids.length, "401");
  igual("en modo «agregar», que suma y no reemplaza", lote.modo, "agregar");
  igual("y con el profesor elegido", lote.teacher_id, PROFE.id);
  igual("solo alumnos: a un profesor no se le asigna profesor",
    lote.target_ids.every((id) => id.startsWith("u-") && id !== "u-profe" && id !== "u-admin"), "true");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaCuentasDeUnGrupo(browser) {
  console.log("\n=== Las cuentas de un grupo ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  const resumen = () => page.textContent("#users-summary");
  igual("de entrada, el resumen cuenta GRUPOS y no cuentas sueltas",
    (await resumen()).trim(), "1205 cuentas en 2 grupos. Abre uno para ver las suyas.");

  // Abrir 7B: 401 alumnos, de 50 en 50.
  await irA(page, "cuentas");
  await page.click("#grupos-fichas article:first-of-type button");
  await page.waitForFunction(() => !document.getElementById("users-panel").hidden, { timeout: 10000 });
  igual("se abre con su nombre a la vista", await page.textContent("#users-panel-title"), "7B");
  igual("y solo trae las suyas, de 50 en 50", (await resumen()).trim(), "Mostrando 50 de 401 cuentas.");
  igual("50 filas pintadas, no 401",
    await page.evaluate(() => document.querySelectorAll("#users-body tr td select[aria-label^='Rol']").length), "50");
  igual("las fichas se esconden mientras tanto",
    await page.evaluate(() => document.getElementById("grupos-fichas").hidden), "true");

  await page.click("#users-more");
  igual("«Ver más» trae otras 50", (await resumen()).trim(), "Mostrando 100 de 401 cuentas.");

  // Y se vuelve.
  await page.click("#volver-grupos");
  await page.waitForFunction(() => document.getElementById("users-panel").hidden, { timeout: 10000 });
  igual("«Volver a los grupos» devuelve a las fichas",
    await page.evaluate(() => document.getElementById("grupos-fichas").hidden), "false");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaBuscarEntreGrupos(browser) {
  console.log("\n=== Buscar, que manda sobre los grupos ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  const resumen = () => page.textContent("#users-summary");

  /* Buscar sin saber en qué grupo está alguien es justamente para lo que se
     busca: la búsqueda mira TODOS los grupos, aunque haya uno abierto. */
  await page.fill("#user-search", "ramirez");
  await page.waitForFunction(() => /1 cuenta/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  igual("buscar «ramirez» encuentra a «Ana Ramírez» aunque no se sepa su grupo",
    await page.evaluate(() => document.querySelector("#users-body input[type=text]").value), "Ana Ramírez");
  igual("y el panel se llama por lo que es",
    await page.textContent("#users-panel-title"), "Resultado de la búsqueda");

  await page.fill("#user-search", "");
  await page.waitForFunction(() => !document.getElementById("grupos-fichas").hidden, { timeout: 10000 });
  igual("al borrar la búsqueda se vuelve solo a las fichas",
    await page.evaluate(() => document.getElementById("users-panel").hidden), "true");

  /* El filtro de rol, y la opción que no es un rol.

     Es UNA sola profesora, no dos: desde que la cuenta master dejó de estar
     guardada como alumna y pasó a `role = 'admin'`, ya no cuenta ni como
     profesora ni como alumna en ninguna lista. Que acá se esperaran dos era
     justo el resto de antes. */
  await page.selectOption("#role-filter", "profesor");
  await page.waitForFunction(() => /1 cuenta/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  bien("filtrar por «Profesores» deja 1: la cuenta master ya no cuenta como profesora");

  await page.selectOption("#role-filter", "sin-profesor");
  await page.waitForFunction(() => /3 cuentas/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  bien("filtrar por «Sin profesor asignado» deja los 3 que no tienen — esos no salen en los informes de nadie");

  // El aviso de arriba los deja a la vista de un clic. Vive en la sección
  // «Profesores»: hay que ir a ella, y el botón tiene que traer de vuelta.
  await page.selectOption("#role-filter", "");
  await irA(page, "profesores");
  await page.click("#sin-profesor-aviso button");
  await page.waitForFunction(() => /3 cuentas/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  igual("y el aviso de «alumnos sin profesor» los deja a la vista de un clic",
    await page.evaluate(() => document.getElementById("role-filter").value), "sin-profesor");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* El nombre cortado es con lo que empezó todo esto: se MIDE. */
async function pruebaElNombreNoSeCorta(browser) {
  console.log("\n=== Que el nombre de la cuenta no se corte ===");
  const { page, ctx } = await abrir(browser, "/admin.html", ADMIN, { viewport: { width: 1280, height: 900 } });
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  // Hay que abrir un grupo: al entrar se ven las fichas, no las cuentas.
  await irA(page, "cuentas");
  await page.click("#grupos-fichas article:first-of-type button");
  await page.waitForFunction(() => document.querySelectorAll("#users-body input[type=text]").length > 0, { timeout: 10000 });

  const medidas = await page.evaluate(() => {
    const campo = document.querySelector("#users-body input[type=text]");
    campo.value = "María Fernanda Ramírez Quesada";
    return { ancho: campo.getBoundingClientRect().width, cabe: campo.scrollWidth <= campo.clientWidth + 1 };
  });
  igual("un nombre largo cabe entero en su campo", medidas.cabe, "true");
  if (medidas.ancho < 180) mal("la columna del nombre quedó en " + Math.round(medidas.ancho) + " px: muy angosta");
  else bien("la columna del nombre mide " + Math.round(medidas.ancho) + " px");

  igual("el correo quedó en la MISMA celda que el nombre, no en una columna aparte",
    await page.evaluate(() => {
      const td = document.querySelector("#users-body input[type=text]").closest("td");
      return !!td.querySelector('a[href^="mailto:"]');
    }), "true");
  // Bajó a 7 al juntar el correo con el nombre; la octava es la Visión
  // (ver «La visión de la persona la marca administración»).
  igual("la tabla tiene 8 columnas: el correo sin columna propia, y la visión",
    await page.evaluate(() => {
      const fila = document.querySelector("#users-body input[type=text]").closest("tr");
      return fila.querySelectorAll("td").length;
    }), "8");

  await ctx.close();
}

/* ============ admin.html · darle usuario y ponerle la contraseña ============
   Desde Cuentas, quien administra le da a un alumno un usuario de la Academia
   (si entraba con correo) y le pone la contraseña, para que entre sin abrir
   ningún correo. Las dos cosas van a `correos-alumno` —la misma puerta que la
   ficha de coordinación—: acá se dobla y se anota lo que la página le manda.
   Lo que se comprueba es lo que se rompería callado: que el panel diga si está
   abierto, que la contraseña NO se ofrezca a quien entra con su correo (el
   servidor la rechazaría), que aparezca en cuanto tiene usuario, que se enseñe
   el usuario que devolvió el SERVIDOR y no el escrito, y que el panel siga
   abierto después de que la tabla se repinta. */
async function pruebaUsuarioYContrasena(browser) {
  console.log("\n=== Usuario y contraseña de un alumno, desde Cuentas ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN, { viewport: { width: 1280, height: 900 } });
  const aCorreos = [];
  await ctx.route("**/functions/v1/correos-alumno", async (r) => {
    const cuerpo = JSON.parse(r.request().postData() || "{}");
    aCorreos.push(cuerpo);
    // El servidor desempata numerando: devuelve un usuario distinto del escrito.
    const respuesta = cuerpo.action === "cuenta"
      ? { ok: true, cambiado: "ana.ramirez2@alumno.ajedrez-integral.com" }
      : { ok: true, usuario: "ana.ramirez2@alumno.ajedrez-integral.com" };
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(respuesta) });
  });
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.evaluate(contestarAvisos);
  await irA(page, "cuentas");
  await page.fill("#user-search", "ramirez");
  const boton = page.locator('#users-body button[aria-controls="acceso-u-7"]');
  await boton.waitFor({ timeout: 10000 });
    igual("cerrado, dice que está cerrado", await boton.getAttribute("aria-expanded"), "false");

  await boton.click();
  igual("abierto, dice que está abierto", await boton.getAttribute("aria-expanded"), "true");
  const panel = page.locator("#acceso-u-7");
  igual("el panel se ve", await panel.evaluate((e) => e.checkVisibility()), "true");
  const claveVisible = () => page.evaluate(() => {
    const t = [...document.querySelectorAll("#acceso-u-7 h3")].find((h) => h.textContent === "Su contraseña");
    return !!t && t.parentElement.checkVisibility();
  });
  igual("con correo propio NO se ofrece la contraseña (el servidor la rechaza)", await claveVisible(), "false");

  await panel.locator("input").first().fill("ana.ramirez");
  await panel.getByRole("button", { name: "Darle este usuario" }).click();
  await page.waitForFunction(() => /ana\.ramirez2/.test(document.getElementById("acceso-u-7").textContent), { timeout: 10000 });
  const cuenta = aCorreos.find((c) => c.action === "cuenta");
  igual("le pide a correos-alumno un usuario de la Academia",
    cuenta && [cuenta.alumno_id, cuenta.sin_correo, cuenta.usuario], ["u-7", true, "ana.ramirez"]);
  igual("enseña el usuario que devolvió el servidor, no el escrito",
    await panel.locator("input").first().inputValue(), "ana.ramirez2");
  igual("en cuanto tiene usuario aparece la contraseña", await claveVisible(), "true");

  await panel.getByRole("button", { name: "Poner esta contraseña" }).waitFor();
  await panel.locator('input[type="text"]').nth(1).fill("caballo482");
  await panel.getByRole("button", { name: "Poner esta contraseña" }).click();
  await page.waitForFunction(() => (window.__avisos || []).some((a) => /caballo482/.test(a)), { timeout: 10000 });
  const clave = aCorreos.find((c) => c.action === "contrasena");
  igual("la contraseña va a correos-alumno con ese alumno",
    clave && [clave.alumno_id, clave.contrasena], ["u-7", "caballo482"]);
  igual("el aviso dice el usuario sin el dominio y la contraseña",
    await page.evaluate(() => (window.__avisos || []).some((a) => /«ana\.ramirez2» y la contraseña «caballo482»/.test(a))), "true");

  // Repintar la tabla (otra búsqueda que la encuentra igual) no cierra el panel.
  await page.fill("#user-search", "ana ramirez");
  await page.waitForFunction(() => !!document.getElementById("acceso-u-7"), { timeout: 10000 });
  igual("después de repintar, el panel sigue abierto y lo dice",
    await page.locator('#users-body button[aria-controls="acceso-u-7"]').getAttribute("aria-expanded"), "true");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ====================== inscripciones.html ====================== */

/* Las URL firmadas que da la función. La tercera ruta NO trae firma, como
   pasaría si Storage no la encontrara: la página tiene que decirlo. */
const FIRMA = "https://prcfbzvshnusisczlpxl.supabase.co/storage/v1/object/sign/inscripcion-adjuntos/";
const FIRMAS = {
  "pendientes/aaaaaaaa-1111/cedula.jpg": FIRMA + "pendientes/aaaaaaaa-1111/cedula.jpg?token=t1",
  "pendientes/bbbbbbbb-2222/Comprobante.pdf": FIRMA + "pendientes/bbbbbbbb-2222/Comprobante.pdf?token=t2",
};
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/* El doble de la Edge Function va en la RED y en el CONTEXTO, no dentro de la
   página: así se prueba TAMBIÉN el fetch —que mande la sesión en la cabecera y
   que lea bien la respuesta—, y no solo lo que la página hace después. En el
   contexto y no en la página porque esta registra el service worker, y lo que
   él pide no pasa por una ruta puesta en la página. */
function pagInscripciones(browser, usuario, respuesta, extra) {
  return (async () => {
    const { page, ctx, errores } = await abrir(browser, "/inscripciones.html", usuario, extra);
    const pedidos = [];
    await ctx.route("**/functions/v1/inscripciones-torneo", (ruta) => {
      pedidos.push(ruta.request().headers().authorization || "");
      if (respuesta === null) {
        return ruta.fulfill({ status: 403, contentType: "application/json",
          body: JSON.stringify({ error: "Esta lista es solo para quien administra o coordina." }) });
      }
      ruta.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ inscripciones: respuesta, firmas: FIRMAS }) });
    });
    const firmadas = [];
    await ctx.route("**/storage/v1/object/sign/**", (ruta) => {
      firmadas.push(ruta.request().url());
      const pdf = /\.pdf/.test(ruta.request().url());
      ruta.fulfill({ status: 200, contentType: pdf ? "application/pdf" : "image/png",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: pdf ? Buffer.from("%PDF-1.4 prueba") : PNG_1x1 });
    });
    pedidos.firmadas = firmadas;
    await page.goto(BASE + "/inscripciones.html", { waitUntil: "networkidle" });
    return { page, ctx, errores, pedidos };
  })();
}

async function pruebaInscripciones(browser) {
  console.log("\n=== Las inscripciones a torneos ===");
  const { page, ctx, errores, pedidos } = await pagInscripciones(browser, ADMIN, INSCRIPCIONES);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll("#cuerpo tr").length === 2, { timeout: 15000 });

  /* LO QUE MÁS IMPORTA: la tabla no se toca. Son cédulas y fechas de
     nacimiento de menores, y esa tabla no tiene ninguna política de lectura. */
  // Se miran solo las líneas de CÓDIGO: los comentarios de la página nombran
  // `sb.from("inscripciones")` justamente para decir que no está, y buscarlo a
  // secas daba por rota una página correcta.
  const html = require("./lib/codigo-de-pagina").leer("inscripciones.html")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  if (/sb\s*\.\s*from\s*\(\s*["']inscripciones["']/.test(html)) {
    mal("la página lee la tabla directo: eso son datos de menores y esa tabla no se abre");
  } else bien("la página no lee la tabla directo: pasa por la Edge Function");
  igual("y le manda la sesión de quien mira, que es lo que la función le reenvía a la Academia",
    pedidos, ["Bearer token-de-mentira"]);

  igual("se ven las dos inscripciones",
    await page.evaluate(() => document.querySelectorAll("#cuerpo tr").length), "2");
  igual("dice cuántas hay", (await page.textContent("#resumen")).trim(), "2 inscripciones en total.");
  igual("las tarjetas cuentan centros y provincias",
    await page.evaluate(() => Array.from(document.querySelectorAll("#totales p:nth-child(2)")).map((n) => n.textContent)),
    ["2", "2", "2", "15"]);

  // El detalle: lo que no cabe en la fila se despliega.
  await page.click("#cuerpo button");
  igual("«Ver detalle» muestra la cédula y lo demás",
    await page.evaluate(() => /118820456/.test(document.querySelector("tr[data-detalle]").textContent)), "true");

  // Los archivos adjuntos: se bajan por su URL firmada y se ofrecen para ver y descargar.
  igual("la fila avisa que trae archivos",
    await page.evaluate(() => /📎 3 archivos adjuntos/.test(document.getElementById("cuerpo").textContent)), "true");
  await page.waitForFunction(() => {
    const d = document.querySelector("tr[data-detalle]");
    return d && d.querySelector("img[src^='blob:']") && /No se pudo abrir «vencida\.pdf»/.test(d.textContent);
  }, { timeout: 10000 });
  igual("se piden por la URL firmada, no por una pública",
    pedidos.firmadas.map((u) => u.split("?")[1]).sort(), ["token=t1", "token=t2"]);
  igual("la foto se ve de verdad",
    await page.evaluate(() => { const i = document.querySelector("tr[data-detalle] img"); return i.complete && i.naturalWidth > 0; }), "true");
  igual("cada archivo se descarga con el nombre de quién es",
    await page.evaluate(() => [...document.querySelectorAll("tr[data-detalle] a[download]")].map((a) => a.download)),
    ["Ana-Ramirez-Mora-cedula.jpg", "Ana-Ramirez-Mora-Comprobante.pdf"]);
  igual("el PDF se ofrece por su nombre",
    await page.evaluate(() => /📄 Comprobante\.pdf/.test(document.querySelector("tr[data-detalle]").textContent)), "true");

  // Los filtros se arman con lo que de verdad hay.
  igual("el selector de provincia sale de los datos, no de una lista escrita a mano",
    await page.evaluate(() => Array.from(document.getElementById("f-provincia").options).map((o) => o.value)),
    ["", "Alajuela", "San José"]);
  await page.selectOption("#f-provincia", "Alajuela");
  await page.waitForFunction(() => document.querySelectorAll("#cuerpo tr").length === 1, { timeout: 10000 });
  igual("y filtra", await page.textContent("#cuerpo tr td:nth-child(2) p"), "Bruno Mena Solís");

  await page.selectOption("#f-provincia", "");
  await page.fill("#buscar", "ramirez");
  await page.waitForFunction(() => /1 inscripción/.test(document.getElementById("resumen").textContent), { timeout: 10000 });
  bien("buscar «ramirez» encuentra a «Ana Ramírez» (sin tildes también)");

  // El CSV: punto y coma y BOM, o Excel en español mete la fila en la columna A.
  await page.fill("#buscar", "");
  const csv = await page.evaluate(async () => {
    let capturado = null;
    const original = URL.createObjectURL;
    const clickOriginal = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (b) => { capturado = b; return "blob:x"; };
    HTMLAnchorElement.prototype.click = function () {};   // que no intente navegar a la URL de mentira
    document.getElementById("csv-btn").click();
    URL.createObjectURL = original;
    HTMLAnchorElement.prototype.click = clickOriginal;
    // Se leen los BYTES: Blob.text() decodifica como UTF-8 y se COME el BOM,
    // así que preguntándole al texto, un archivo sin BOM se vería igual de bien
    // — y Excel en español es justo lo que no lo abriría.
    const bytes = new Uint8Array(await capturado.arrayBuffer());
    return { bom: [bytes[0], bytes[1], bytes[2]].join(","), texto: new TextDecoder().decode(bytes) };
  });
  igual("el CSV arranca con BOM (mirando los bytes, no el texto)", csv.bom, "239,187,191");
  igual("y separa con punto y coma", csv.texto.split("\r\n")[0].split(";").length > 5, "true");
  igual("con las dos inscripciones", csv.texto.trim().split("\r\n").length, "3");
  igual("y los adjuntos contados, sin rutas internas",
    /3 archivos adjuntos/.test(csv.texto) && !/pendientes\//.test(csv.texto), true);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaInscripcionesDenegado(browser) {
  console.log("\n=== Las inscripciones, para quien no coordina ===");
  const { page, ctx, pedidos } = await pagInscripciones(browser, PROFE, null);
  await page.waitForSelector("#denegado:not(.hidden)", { timeout: 20000 });
  igual("a un profesor que no coordina se le muestra el aviso",
    await page.evaluate(() => !document.getElementById("denegado").classList.contains("hidden")), "true");
  igual("y no se le pinta la lista",
    await page.evaluate(() => document.getElementById("app").classList.contains("hidden")), "true");
  igual("ni se le piden las inscripciones", pedidos.length, "0");
  await ctx.close();
}

/* ============ Los PDF con las respuestas: SOLO administración ============
 *
 * El cuadernillo del diagnóstico, el libro del banco y el cuadernillo de
 * arbitraje traen las respuestas y la hoja de corrección. Cuanta más gente los
 * tenga bajados, más fácil es que circulen y que las dos pruebas dejen de medir
 * nada. Antes se le ofrecían a todo el equipo docente; ahora solo a quien
 * administra.
 *
 * Esto es exactamente lo que no da ningún error al romperse: el enlace vuelve a
 * aparecer y la página se ve igual de bien. Por eso se abre cada página con las
 * tres caras y se MIRA si el enlace está a la vista. */
async function pruebaPdfSoloAdmin(browser) {
  console.log("\n=== Los PDF con las respuestas ===");

  const casos = [
    { ruta: "/entreno/diagnostico.html", espera: "#pdf-docente", nombre: "el cuadernillo del diagnóstico" },
    { ruta: "/entreno/diagnostico.html", espera: "#libro-docente", nombre: "el libro del banco" },
    { ruta: "/arbitraje.html", espera: "#banco-pdf", nombre: "el cuadernillo de arbitraje" },
  ];
  const quienes = [
    { quien: ALUMNA, etiqueta: "una alumna", debeVer: false },
    { quien: PROFE, etiqueta: "una profesora", debeVer: false },
    { quien: ADMIN, etiqueta: "administración", debeVer: true },
  ];

  for (const caso of casos) {
    for (const q of quienes) {
      // arbitraje.html no deja entrar al alumnado: ahí el PDF ni se plantea.
      if (caso.ruta === "/arbitraje.html" && q.quien === ALUMNA) continue;
      const { page, ctx } = await abrir(browser, caso.ruta, q.quien);
      await page.goto(BASE + caso.ruta, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);   // las páginas destapan el enlace después de leer el perfil
      const seVe = await page.evaluate((sel) => {
        const n = document.querySelector(sel);
        if (!n) return "no está en la página";
        return getComputedStyle(n).display !== "none";
      }, caso.espera);
      igual(caso.nombre + " · " + q.etiqueta, seVe, String(q.debeVer));
      await ctx.close();
    }
  }

  /* Y que el enlace siga saliendo de un solo lugar: si alguien lo vuelve a
     escribir suelto en otra página, este barrido lo encuentra. */
  const pdfs = ["diagnostico-de-nivel.pdf", "libro-de-diagnostico.pdf", "examen-de-arbitraje.pdf"];
  const paginas = [];
  (function recorrer(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      if (e.name === "node_modules" || e.name === ".git") return;
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(completo);
      else if (e.name.endsWith(".html")) paginas.push(completo);
    });
  })(RAIZ);
  const sueltos = [];
  paginas.forEach((f) => {
    // Con su código mudado a js/: un enlace armado ahí también cuenta.
    const txt = require("./lib/codigo-de-pagina").leer(path.relative(RAIZ, f));
    pdfs.forEach((pdf) => {
      if (!new RegExp('href="[^"]*' + pdf.replace(/\./g, "\\.") + '"').test(txt)) return;
      const rel = path.relative(RAIZ, f);
      // informes.html también los enlaza, pero DENTRO de un `profile.is_admin ?`:
      // ahí no es un enlace suelto y la prueba de más abajo lo comprueba.
      if (!["entreno/diagnostico.html", "arbitraje.html", "informes.html"].includes(rel)) sueltos.push(rel + " → " + pdf);
    });
  });
  igual("nadie más enlaza esos PDF", sueltos.join(" | ") || "ninguno", "ninguno");

  /* informes.html los nombra en el texto de "todavía nadie ha hecho el
     diagnóstico". Ahí también tienen que salir solo para administración, y es
     el caso que se escapa: no es un enlace en el HTML, se arma con JavaScript
     dentro de un template. Se lee con su código mudado a js/: leyendo solo el
     .html, desde que el código salió de la página, esto no encontraba nada. */
  const informes = require("./lib/codigo-de-pagina").leer("informes.html");
  const trozo = informes.slice(Math.max(0, informes.indexOf("diagnostico-de-nivel.pdf") - 600), informes.indexOf("libro-de-diagnostico.pdf"));
  igual("en informes.html los dos PDF van detrás de un is_admin",
    /is_admin\s*\?/.test(trozo), "true");
}

/* ====================== que se vean ====================== */

async function pruebaPantalla(browser) {
  console.log("\n=== Que las páginas se vean ===");
  for (const ruta of ["/admin.html", "/inscripciones.html"]) {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
    await ctx.route("**/js/supabase-client.js", (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(ADMIN, cuentasDeMentira(), parejasDeMentira()) }));
    await ctx.route("**/functions/v1/inscripciones-torneo", (r) => r.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ inscripciones: INSCRIPCIONES }) }));
    const page = await ctx.newPage();
    await page.goto(BASE + ruta, { waitUntil: "networkidle" });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    const v = await page.evaluate(() => ({
      css: /\{[^}]*(color|display|margin)\s*:/.test(document.body.innerText),
      estilos: document.querySelectorAll("style").length,
      fondo: getComputedStyle(document.body).backgroundColor,
    }));
    igual(ruta + " · sin CSS impreso como texto", v.css, "false");
    igual(ruta + " · ningún <style> suelto", v.estilos, "0");
    const rgb = (v.fondo.match(/\d+/g) || []).map(Number);
    igual(ruta + " · con el tema oscuro, el fondo sale oscuro", rgb[0] + rgb[1] + rgb[2] < 200, "true");
    await ctx.close();
  }
}

/* ======================================================================
   Llenar un equipo de una vez.

   Un equipo es la única forma de agrupar que DA PERMISOS, y llenarlo era
   elegir de a uno entre mil doscientos nombres — que es la razón por la que
   los permisos se terminaban repartiendo alumno por alumno.

   Lo que se rompe callado: `equipo_set_alumnos` deja la lista EXACTAMENTE
   como llega, así que mandar solo los del grupo vacía el equipo de todo lo
   anterior. Se vería perfecto con sus nombres nuevos, y los de antes habrían
   perdido a sus entrenadores sin que nadie lo pidiera.
   ====================================================================== */
async function pruebaVolcarEnUnEquipo(browser) {
  console.log("\n=== Llenar un equipo de una vez ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll("#equipos-lista > div").length === 1, { timeout: 15000 });

  const opciones = await page.evaluate(() => {
    const sel = Array.from(document.querySelectorAll("#equipos-lista select"))
      .find((s) => (s.getAttribute("aria-label") || "").indexOf("grupo o un subgrupo") !== -1);
    if (!sel) return null;
    return Array.from(sel.querySelectorAll("optgroup")).map((g) => g.label);
  });
  igual("el equipo ofrece volcar un grupo o un subgrupo entero", opciones, ["Grupos", "Subgrupos"]);

  /* De quién es cada subgrupo va escrito: dos profesores pueden tener cada uno
     su «Los del martes», y son listas distintas. */
  igual("y el subgrupo dice de quién es y cuántos son",
    await page.evaluate(() => {
      const sel = Array.from(document.querySelectorAll("#equipos-lista select"))
        .find((s) => (s.getAttribute("aria-label") || "").indexOf("grupo o un subgrupo") !== -1);
      // Un <optgroup> no tiene .options; las opciones se piden por selector.
      const g = Array.from(sel.querySelectorAll("optgroup")).find((x) => x.label === "Subgrupos");
      return g.querySelector("option").textContent;
    }), "Los del martes — Profe Vega (2)");

  const volcar = (texto) => page.evaluate((t) => {
    const sel = Array.from(document.querySelectorAll("#equipos-lista select"))
      .find((s) => (s.getAttribute("aria-label") || "").indexOf("grupo o un subgrupo") !== -1);
    const op = Array.from(sel.options).find((o) => o.textContent.indexOf(t) === 0);
    if (!op) return "no está la opción " + t;
    sel.value = op.value;
    sel.dispatchEvent(new Event("change"));
    return "ok";
  }, texto);

  /* EL TOPE SE MIRA ANTES DE MANDAR. «7B» son 401 alumnos de los datos de
     prueba y un equipo aguanta 300: si esto viajara, volvería con el error del
     servidor y quien lo apretó se quedaría sin saber qué arreglar. */
  llamadasDeAdmin.length = 0;
  igual("el grupo grande está en la lista", await volcar("7B"), "ok");
  await page.waitForTimeout(400);
  igual("un grupo que no cabe no se manda, y se dice con el número",
    [llamadasDeAdmin.filter((l) => l.action === "equipo_set_alumnos").length,
     /Quedarían 40\d alumnos y el tope de un equipo es 300/.test(
       await page.evaluate(() => document.getElementById("equipos-lista").textContent))],
    [0, true]);

  // ------------------------------------------------- y el que sí cabe, entra
  llamadasDeAdmin.length = 0;
  igual("el subgrupo está en la lista", await volcar("Los del martes"), "ok");
  const mandado = await esperarLlamada("equipo_set_alumnos");
  igual("volcar SUMA al que ya estaba, no lo reemplaza",
    [mandado.equipo_id, mandado.alumno_ids.join(",")],
    ["eq-1", "u-5,u-1,u-2"]);
  igual("y ninguno se manda dos veces",
    new Set(mandado.alumno_ids).size === mandado.alumno_ids.length, "true");

  await page.waitForFunction(() => /Entraron 2 alumnos/.test(document.getElementById("equipos-lista").textContent), { timeout: 10000 });
  igual("se dice cuántos entraron, y se sigue viendo después de repintar la tarjeta",
    await page.evaluate(() => /Entraron 2 alumnos/.test(document.getElementById("equipos-lista").textContent)), "true");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaUnaSolaPuerta(browser);
    await pruebaSecciones(browser);
    await pruebaUrgente(browser);
    await pruebaPreparacionRivales(browser);
    await pruebaProyectos(browser);
    await pruebaMateriales(browser);
    await pruebaPdfs(browser);
    await pruebaAuditoria(browser);
    await pruebaFichasDeGrupo(browser);
    await pruebaVolcarEnUnEquipo(browser);
    await pruebaCuentasDeUnGrupo(browser);
    await pruebaBuscarEntreGrupos(browser);
    await pruebaElNombreNoSeCorta(browser);
    await pruebaUsuarioYContrasena(browser);
    await pruebaInscripciones(browser);
    await pruebaInscripcionesDenegado(browser);
    await pruebaPdfSoloAdmin(browser);
    await pruebaPantalla(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nAdministración e inscripciones están como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
