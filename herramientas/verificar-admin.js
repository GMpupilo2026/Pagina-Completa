/* Comprueba, en un navegador de verdad y con un Supabase de mentira, el panel
   de Administración (admin.html) y la lista de inscripciones a torneos
   (inscripciones.html).

   Existe por lo mismo que verificar-panel.js: las dos páginas están DETRÁS DEL
   LOGIN, así que verificar-css.js —que las abre sin cuenta— no ve nada de esto.
   Y lo que se rompe acá no da error en pantalla: un atajo que apunta a una
   dirección que ya no existe, un filtro que no filtra, una lista que se corta
   en mil filas sin avisar.

   Cuatro cosas, por cuatro peligros distintos:

   1. LOS ATAJOS. Que estén los cuatro grupos con lo suyo y que cada uno apunte
      a una página o a un filtro que de verdad existe.

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
  };
  const SUBGRUPOS_VISTA = [
    { id: "sg-1", nombre: "Los del martes", profesor_id: "u-profe", profesor: "Profe Vega",
      alumnos: ["u-1", "u-2"] },
  ];
  const USUARIO = ${JSON.stringify(usuario)};

  function constructor(tabla, filas) {
    const anotado = { tabla: tabla, range: null, eq: {} };
    window.__consultas.push(anotado);
    let filas2 = (filas || []).slice(), unica = false;
    const b = {
      select() { return b; },
      eq(col, val) { anotado.eq[col] = val; filas2 = filas2.filter((r) => String(r[col]) === String(val)); return b; },
      order() { return b; },
      range(a, z) { anotado.range = [a, z]; filas2 = filas2.slice(a, z + 1); return b; },
      single() { unica = true; return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) {
        let d = filas2;
        if (unica) d = filas2.length ? filas2[0] : null;
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
    rpc: (n) => {
      if (n === "soy_coordinador") {
        return Promise.resolve({ data: !!(USUARIO.is_admin || USUARIO.es_coordinador), error: null });
      }
      if (n === "subgrupos_a_la_vista") return constructor(n, SUBGRUPOS_VISTA);
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

async function abrir(browser, ruta, usuario, extra) {
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
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(usuario, cuentasDeMentira(), parejasDeMentira()) }));
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

/* ====================== admin.html · los atajos ====================== */

async function pruebaAtajos(browser) {
  console.log("\n=== Los atajos de administración ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  const grupos = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#atajos section")).map((s) => ({
      titulo: s.querySelector("h3").textContent,
      enlaces: Array.from(s.querySelectorAll("a")).map((a) => a.getAttribute("href")),
      etiquetas: Array.from(s.querySelectorAll("a span span:first-child")).map((n) => n.textContent),
    })));

  igual("los grupos de atajos, en su orden", grupos.map((g) => g.titulo),
    ["Formularios", "Resultados", "Bases de datos", "Acceso a la plataforma", "Venta de materiales", "Reportes", "La plataforma"]);
  /* Cada grupo se busca POR NOMBRE y no por su posición: con índices, sumar un
     grupo renumeraba media docena de comprobaciones que no tienen nada que ver
     con el orden, y había que corregirlas a mano una por una. Es la misma
     razón por la que clases.html busca sus grupos por título. El orden se
     comprueba arriba, una sola vez, que es donde importa. */
  const atajos = (t) => (grupos.find((g) => g.titulo === t) || { enlaces: ["(no está ese grupo)"] }).enlaces;
  igual("Resultados: los dos diagnósticos y los dos exámenes", atajos("Resultados"),
    ["informes.html?tema=diagnostico", "arbitraje.html",
     "informes.html?tema=diagnostico-publico", "informes.html?tema=arbitraje"]);
  igual("Formularios: todos juntos, con la encuesta de satisfacción", atajos("Formularios"), ["satisfaccion.html", "encuestas-curso.html", "formularios.html", "solicitudes.html", "inscripciones.html"]);
  igual("Bases de datos", atajos("Bases de datos"), ["admin-jugador.html"]);
  igual("Acceso a la plataforma", atajos("Acceso a la plataforma"), ["accesos.html", "precios.html", "prueba-gratis.html"]);
  igual("Venta de materiales", atajos("Venta de materiales"), ["tienda.html"]);
  igual("Reportes", atajos("Reportes"), ["reportes.html", "supervision.html", "tablero-academias.html", "cobros.html"]);
  igual("La plataforma", atajos("La plataforma"), ["novedades.html"]);
  igual("los informes de toda la plataforma siguen aparte y de primeros",
    await page.evaluate(() => {
      const a = document.querySelector('#app a[href="informes.html"]');
      // Aparte de las tarjetas y antes que ellas.
      return a && !a.closest("#atajos") && (a.compareDocumentPosition(document.getElementById("atajos")) & Node.DOCUMENT_POSITION_FOLLOWING) ? "sí" : "no";
    }), "sí");

  /* Un atajo que apunta a una página que no existe no da ningún error: se ve
     igual de bien y solo falla al apretarlo. Se comprueban los archivos, y
     para los que llevan ?tema=, que ese tema exista en el selector de
     informes.html. */
  const informes = fs.readFileSync(path.join(RAIZ, "informes.html"), "utf8");
  const temas = [...informes.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  let rotos = [];
  grupos.forEach((g) => g.enlaces.forEach((href) => {
    const [archivo, consulta] = href.split("?");
    if (!fs.existsSync(path.join(RAIZ, archivo))) { rotos.push(href + " (no existe el archivo)"); return; }
    const tema = new URLSearchParams(consulta || "").get("tema");
    if (tema && !temas.includes(tema)) rotos.push(href + " (informes.html no tiene ese tema)");
  }));
  igual("todos los atajos llevan a algo que existe", rotos.join(" | ") || "ninguno roto", "ninguno roto");

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

  /* Los números salen de la lista entera (1205, pedida de mil en mil), no del
     primer pedazo: con 1000 acá, algo se volvió a pedir de un solo tiro. */
  const numeros = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#inicio-numeros button span.min-w-0")).map((b) => b.innerText.replace(/\s+/g, " ").trim()));
  igual("los números de Inicio, con la lista entera",
    numeros, ["1 205 cuentas en total", "1 203 estudiantes", "1 profesor", "3 sin profesor asignado"]);
  igual("el menú avisa de los sin profesor, con el número",
    await page.evaluate(() => { const b = document.getElementById("nav-sin-profesor"); return b.checkVisibility() ? b.textContent : "no se ve"; }), "3");

  // Cada número lleva a ESAS cuentas.
  await page.click("#inicio-numeros li:nth-child(4) button");
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
  igual("la tabla bajó a 7 columnas",
    await page.evaluate(() => {
      const fila = document.querySelector("#users-body input[type=text]").closest("tr");
      return fila.querySelectorAll("td").length;
    }), "7");

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
    await pruebaAtajos(browser);
    await pruebaSecciones(browser);
    await pruebaFichasDeGrupo(browser);
    await pruebaVolcarEnUnEquipo(browser);
    await pruebaCuentasDeUnGrupo(browser);
    await pruebaBuscarEntreGrupos(browser);
    await pruebaElNombreNoSeCorta(browser);
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
