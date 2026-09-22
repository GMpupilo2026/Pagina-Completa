/* Comprueba la ficha de asistencia presencial: `asistencia.html`, y que el
   reporte de actividades distinga una clase del aula de una de la plataforma.

   Existe porque TODO lo que se rompe acá se rompe callado, y lo descubre quien
   lee el informe del mes:

     · una clase fechada con el huso del servidor queda registrada el día
       siguiente, y en pantalla se ve perfecta;
     · una lista de asistentes que se manda a medias —porque el buscador sacó
       casillas del DOM— deja fuera a gente que sí fue, sin ningún error;
     · corregir una ficha mandando solo lo que cambió dejaría marcado a quien
       se desmarcó: la función de la base deja la lista EXACTAMENTE como llega;
     · y un informe que cuenta las presenciales dentro de "las clases en vivo"
       dice algo que no es, con la misma cara que si dijera la verdad.

   Lo que hace cumplir la BASE —que el profesor solo pase lista en sus fichas
   presenciales, que el alumno no se invente minutos, que una clase del futuro
   se rechace— se comprobó impersonando roles en SQL, no acá.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-asistencia.js                          */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
/* La zona se fija a propósito: sin ella la prueba de la fecha daría verde en
   una máquina en UTC y fallaría en la de quien da la clase, que es al revés de
   lo que hay que comprobar. */
const ZONA = "America/Costa_Rica";       // UTC-6, sin horario de verano

const PROFE  = { id: "u-oscar", full_name: "Oscar Angulo", email: "oscar@x.cr", role: "profesor", is_admin: false };
const ALUMNA = { id: "u-ana",   full_name: "Ana Rojas",    email: "ana@x.cr",   role: "alumno",   is_admin: false };

const ALUMNOS = [
  { id: "u-ana",   full_name: "Ana Rojas",    email: "ana@x.cr",   grupo: "7A" },
  { id: "u-bruno", full_name: "Bruno Mena",   email: "bruno@x.cr", grupo: "7B" },
  { id: "u-cami",  full_name: "Camila Ñúñez", email: "cami@x.cr",  grupo: "7B" },
];
const SUBGRUPOS = [
  { id: "sg-1", nombre: "Los del martes", alumnos: ["u-ana", "u-cami"], cuantos: 2 },
  { id: "sg-2", nombre: "Sin nadie",      alumnos: [],                  cuantos: 0 },
];
/* Una ficha ya guardada, para corregirla y para borrarla — y una clase EN VIVO
   del mismo profesor, que la página no tiene que ofrecerle a corregir: esta
   pantalla no sabe nada de la clase del tablero y editarla desde acá le movería
   las horas y le borraría el título. Las dos filas llevan `modalidad` y
   `created_by` porque es por ahí por donde la página las pide: un doble sin
   esas columnas daría verde sobre una página que se baja las clases de todo el
   mundo. */
const FICHAS = [
  { id: "cs-1", title: "Finales de rey y peón", modalidad: "presencial", created_by: "u-oscar",
    started_at: "2026-09-15T21:00:00.000Z",
    ended_at: "2026-09-15T22:00:00.000Z", notes: "Repasamos la oposición.",
    class_attendance: [{ student_id: "u-ana" }, { student_id: "u-bruno" }] },
  { id: "cs-viva", title: "La del tablero", modalidad: "en_linea", created_by: "u-oscar",
    started_at: "2026-09-16T21:00:00.000Z", ended_at: null, notes: null, class_attendance: [] },
];

function clienteFalso(perfil) {
  return `
window.__llamadas = [];
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const PERFIL = ${JSON.stringify(perfil)};
  const TABLAS = {
    profiles: ${JSON.stringify([PROFE, ...ALUMNOS])},
    class_sessions: ${JSON.stringify(FICHAS)},
  };
  const RPC = {
    alumnos_del_profesor_con_nombre: ${JSON.stringify(ALUMNOS)},
    mis_subgrupos: ${JSON.stringify(SUBGRUPOS)},
    guardar_clase_presencial: "cs-nueva",
  };
  function constructor(filas, tabla) {
    let unica = false;
    let datos = Array.isArray(filas) ? filas.slice() : filas;
    /* El filtro se apunta en el RESOLVER y no dentro del delete(), porque
       \`.delete().eq("id", x)\` encadena: un doble que lo capturara antes daría
       por bueno un borrado sobre la ficha que no era. Es la misma trampa que
       ya documentó verificar-clase-registrada.js. */
    let escritura = null;
    const filtros = [];
    const b = {
      select() { return b; },
      eq(col, val) {
        filtros.push([col, val]);
        if (Array.isArray(datos)) datos = datos.filter((f) => String(f[col]) === String(val));
        return b;
      },
      in() { return b; }, order() { return b; }, limit() { return b; },
      range() { return b; }, is() { return b; }, not() { return b; }, or() { return b; },
      insert(v) { escritura = { verbo: "insert", datos: v }; return b; },
      update(v) { escritura = { verbo: "update", datos: v }; return b; },
      upsert(v) { escritura = { verbo: "upsert", datos: v }; return b; },
      delete() { escritura = { verbo: "delete" }; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        if (escritura) window.__llamadas.push(Object.assign({ tabla, filtros }, escritura));
        let d = datos;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null,
          count: Array.isArray(datos) ? datos.length : null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: PERFIL.id }, access_token: "t" } } }) },
    from: (t) => constructor(TABLAS[t] !== undefined ? TABLAS[t] : [], t),
    rpc: (n, args) => { window.__llamadas.push({ rpc: n, args: args || null });
                        return constructor(RPC[n] !== undefined ? RPC[n] : [], "rpc:" + n); },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
  window.confirm = () => true;
  window.alert = () => {};
})();
`;
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

/* ==================================================================
   1. El informe, sin navegador: las dos modalidades se distinguen
   ================================================================== */
function pruebaReporte() {
  console.log("\n=== El reporte distingue el aula de la plataforma ===");
  global.window = {};
  delete require.cache[require.resolve("../js/reporte-armar.js")];
  require("../js/reporte-armar.js");
  const armar = global.window.ReporteArmar.armar;

  const mixto = armar({
    desde: "2026-09-01", hasta: "2026-09-30",
    totales: { clases: 3, clases_presenciales: 2, clases_en_linea: 1, estudiantes: 4,
               asistencias: 9, minutos: 210, preguntas: 0, respuestas: 0, aciertos: 0 },
    clases: [
      { id: "a", title: "Finales", started_at: "2026-09-03T15:00:00Z", ended_at: "2026-09-03T16:00:00Z", modalidad: "presencial", duracion_min: 60, asistentes: 4 },
      { id: "b", title: "Táctica", started_at: "2026-09-10T15:00:00Z", ended_at: "2026-09-10T16:00:00Z", modalidad: "en_linea", duracion_min: 60, asistentes: 3 },
      { id: "c", title: "Repaso",  started_at: "2026-09-17T15:00:00Z", ended_at: "2026-09-17T16:30:00Z", modalidad: "presencial", duracion_min: 90, asistentes: 2 },
    ],
    estudiantes: [{ full_name: "Ana Rojas", grupo: "7A", clases: 3, clases_presenciales: 2, minutos: 150 }],
    preguntas: [],
  }, {}, {});

  const resumen = mixto.bloques.find((b) => b.tipo === "parrafo");
  cierto("el resumen dice cuántas fueron presenciales",
    /2 clases presenciales/.test(resumen.texto), "salió: " + resumen.texto);
  cierto("y no las llama a todas «en vivo»",
    !/clases en vivo/.test(resumen.texto), "salió: " + resumen.texto);

  const tablas = mixto.bloques.filter((b) => b.tipo === "tabla");
  const detalle = tablas.find((t) => t.encabezados.includes("Dónde"));
  cierto("la tabla de clases trae la columna «Dónde»", !!detalle);
  igual("y dice de cada una dónde fue",
    detalle ? detalle.filas.map((f) => f[3]) : null,
    ["Presencial", "Plataforma", "Presencial"]);

  const porAlumno = tablas.find((t) => t.encabezados[0] === "Estudiante");
  cierto("por alumno se dice cuántas de las suyas fueron presenciales",
    porAlumno.encabezados.includes("De ellas presenciales"));

  // Sin ninguna presencial, la columna de más no aparece: una columna entera
  // de ceros ocupa ancho y no dice nada.
  const soloEnLinea = armar({
    desde: "2026-09-01", hasta: "2026-09-30",
    totales: { clases: 1, clases_presenciales: 0, clases_en_linea: 1, estudiantes: 1, asistencias: 1, minutos: 60 },
    clases: [{ id: "b", title: "Táctica", started_at: "2026-09-10T15:00:00Z", ended_at: "2026-09-10T16:00:00Z", modalidad: "en_linea", duracion_min: 60, asistentes: 1 }],
    estudiantes: [{ full_name: "Ana Rojas", grupo: "7A", clases: 1, clases_presenciales: 0, minutos: 60 }],
    preguntas: [],
  }, {}, {});
  const porAlumno2 = soloEnLinea.bloques.filter((b) => b.tipo === "tabla").find((t) => t.encabezados[0] === "Estudiante");
  cierto("sin ninguna presencial, esa columna no se pinta",
    !porAlumno2.encabezados.includes("De ellas presenciales"));

  /* Una versión vieja de reporte_actividades() no manda el reparto. El informe
     tiene que seguir saliendo, asumiendo lo que eran todas antes de existir la
     ficha, en vez de decir «0 clases presenciales y 0 en la plataforma». */
  const viejo = armar({
    desde: "2026-09-01", hasta: "2026-09-30",
    totales: { clases: 2, estudiantes: 1, asistencias: 2, minutos: 120 },
    clases: [], estudiantes: [], preguntas: [],
  }, {}, {});
  cierto("con datos de una versión vieja, las cuenta todas en la plataforma",
    /todas en la plataforma/.test(viejo.bloques.find((b) => b.tipo === "parrafo").texto));
}

/* ==================================================================
   2. La ficha, en un navegador de verdad
   ================================================================== */
async function abrir(browser, pagina, perfil) {
  const contexto = await browser.newContext({ timezoneId: ZONA });
  const page = await contexto.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfil) }));
  await page.goto(BASE + "/" + pagina, { waitUntil: "networkidle" });
  return { page, errores };
}

const ultimoGuardado = (page) => page.evaluate(() =>
  [...window.__llamadas].reverse().find((l) => l.rpc === "guardar_clase_presencial"));

async function pruebaFicha(browser) {
  console.log("\n=== Pasar lista ===");
  const { page, errores } = await abrir(browser, "asistencia.html", PROFE);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  igual("se ofrecen los tres alumnos",
    await page.evaluate(() => [...document.querySelectorAll(".alumno-fila span")].map((s) => s.textContent)),
    ["Ana Rojas · 7A", "Bruno Mena · 7B", "Camila Ñúñez · 7B"]);
  igual("y nadie arranca marcado",
    await page.evaluate(() => document.querySelectorAll(".alumno-chk:checked").length), 0);
  igual("el contador lo dice", await page.textContent("#cuenta"), "Nadie marcado");

  // -------- LA FECHA: lo que viaja es el instante local, no el texto
  await page.fill("#fecha", "2026-09-15");
  await page.fill("#hora", "15:00");
  await page.fill("#minutos", "90");
  await page.fill("#titulo", "  Finales en el aula  ");
  await page.fill("#notas", "Oposición y regla del cuadrado.");
  await page.locator(".alumno-chk").nth(0).check();
  await page.locator(".alumno-chk").nth(2).check();
  igual("el contador cuenta los que de verdad están marcados",
    await page.textContent("#cuenta"), "2 alumnos llegaron de 3");

  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#guardar");
  await page.waitForTimeout(400);
  const g = await ultimoGuardado(page);
  cierto("guardar llama a guardar_clase_presencial", !!g);
  /* Las 15:00 en Costa Rica son las 21:00 UTC. Pegar los dos campos y mandarlos
     como si fueran UTC dejaría la clase fechada seis horas después —y a las
     19:00 de un día, ya en el siguiente— sin dar ningún error. */
  igual("la hora local viaja como el instante que fue",
    g && g.args.p_inicio, "2026-09-15T21:00:00.000Z");
  igual("con su duración", g && g.args.p_minutos, 90);
  igual("y su título y sus notas",
    g && [g.args.p_titulo.trim(), g.args.p_notas], ["Finales en el aula", "Oposición y regla del cuadrado."]);
  igual("la lista lleva a los dos marcados y a nadie más",
    g && g.args.p_alumnos, ["u-ana", "u-cami"]);
  igual("y no lleva id: es una clase nueva", g && g.args.p_id, null);

  // -------- EL BUSCADOR NO PUEDE PERDER A NADIE
  console.log("\n=== El buscador esconde, no saca del DOM ===");
  await page.locator(".alumno-chk").nth(0).check();
  await page.fill("#buscar", "bruno");
  igual("con la búsqueda puesta, las casillas siguen TODAS en el DOM",
    await page.evaluate(() => document.querySelectorAll(".alumno-chk").length), 3);
  igual("pero solo se ve la que coincide",
    await page.evaluate(() => [...document.querySelectorAll(".alumno-fila")]
      .filter((f) => f.checkVisibility()).map((f) => f.textContent.trim())),
    ["Bruno Mena · 7B"]);
  igual("y quien quedó escondido conserva su marca",
    await page.evaluate(() => document.querySelectorAll(".alumno-chk:checked").length), 1);

  // -------- EL SUBGRUPO MARCA A LOS SUYOS Y DESMARCA AL RESTO
  console.log("\n=== «Pásale lista a los del martes» ===");
  await page.locator(".alumno-chk").nth(1).check();     // Bruno, que NO es del martes
  await page.selectOption("#subgrupo-marcar", "sg-1");
  await page.waitForTimeout(200);
  igual("quedan marcados exactamente los del subgrupo",
    await page.evaluate(() => [...document.querySelectorAll(".alumno-chk")].map((c) => c.checked)),
    [true, false, true]);
  igual("el contador lo sabe", await page.textContent("#cuenta"), "2 alumnos llegaron de 3");
  igual("y la búsqueda se limpia, o la mitad de los marcados quedarían escondidos",
    await page.inputValue("#buscar"), "");

  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#guardar");
  await page.waitForTimeout(400);
  igual("y eso es lo que se manda",
    (await ultimoGuardado(page)).args.p_alumnos, ["u-ana", "u-cami"]);

  // Volver a «— un subgrupo —» desmarca todo, y la cuenta tiene que enterarse:
  // el módulo no avisa en ese caso.
  await page.selectOption("#subgrupo-marcar", "");
  await page.waitForTimeout(200);
  igual("volver a «un subgrupo» desmarca a todos y el contador lo dice",
    await page.textContent("#cuenta"), "Nadie marcado");

  // -------- SIN NADIE MARCADO SE PIDE UN SEGUNDO TOQUE
  console.log("\n=== Guardar una clase sin nadie ===");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#guardar");
  await page.waitForTimeout(300);
  igual("el primer toque no manda nada",
    await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "guardar_clase_presencial").length), 0);
  igual("y el botón dice qué va a pasar",
    (await page.textContent("#guardar")).trim(), "No llegó nadie — guardar así");
  await page.click("#guardar");
  await page.waitForTimeout(400);
  igual("el segundo toque sí, con la lista vacía",
    (await ultimoGuardado(page)).args.p_alumnos, []);

  await page.context().close();
  return errores;
}

async function pruebaCorregir(browser) {
  console.log("\n=== Corregir una ficha ya guardada ===");
  const { page } = await abrir(browser, "asistencia.html", PROFE);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  igual("la clase guardada se ve, con su fecha, su duración y sus asistentes",
    await page.evaluate(() => [...document.querySelectorAll("#lista p")].map((p) => p.textContent)),
    ["Finales de rey y peón", "15 de septiembre de 2026, 15:00 · 1 h · 2 asistentes", "Repasamos la oposición."]);

  igual("la clase EN VIVO del mismo profesor no se ofrece acá",
    await page.evaluate(() => document.getElementById("lista").textContent.includes("La del tablero")), false);
  igual("y se cuenta una sola", await page.textContent("#conteo-fichas"), "Mostrando 1 de 1");

  await page.locator("#lista button", { hasText: "Corregir" }).click();
  await page.waitForTimeout(300);
  igual("al corregir, el formulario trae lo que había",
    await page.evaluate(() => [document.getElementById("titulo").value,
                               document.getElementById("fecha").value,
                               document.getElementById("hora").value,
                               document.getElementById("minutos").value]),
    ["Finales de rey y peón", "2026-09-15", "15:00", "60"]);
  igual("y sus dos asistentes marcados",
    await page.evaluate(() => [...document.querySelectorAll(".alumno-chk")].map((c) => c.checked)),
    [true, true, false]);

  // Se desmarca a Bruno: la función deja la lista EXACTAMENTE como llega, así
  // que lo que viaja es la lista completa sin él — no «la diferencia».
  await page.locator(".alumno-chk").nth(1).uncheck();
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#guardar");
  await page.waitForTimeout(400);
  const g = await ultimoGuardado(page);
  igual("corregir manda el id de ESA ficha", g && g.args.p_id, "cs-1");
  igual("y la lista completa sin el que se desmarcó", g && g.args.p_alumnos, ["u-ana"]);

  // -------- borrar
  await page.evaluate(() => { window.__llamadas = []; });
  /* Se agarra por su posición y no por su texto: el primer toque le CAMBIA el
     texto, así que un locator por «Borrar» se quedaría esperando un botón que
     ya no dice eso. */
  const borrar = page.locator("#lista button").nth(1);
  await borrar.click();
  igual("borrar pide un segundo toque, con lo que se pierde escrito",
    (await borrar.textContent()).trim(), "¿Seguro? Se va del informe");
  igual("y el primero no borra nada",
    await page.evaluate(() => window.__llamadas.filter((l) => l.verbo === "delete").length), 0);
  await borrar.click();
  await page.waitForTimeout(300);
  const del = await page.evaluate(() => window.__llamadas.find((l) => l.verbo === "delete"));
  igual("el segundo borra ESA clase y no otra",
    del && [del.tabla, del.filtros], ["class_sessions", [["id", "cs-1"]]]);

  await page.context().close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== A la alumna no se le pinta nada ===");
  const { page } = await abrir(browser, "asistencia.html", ALUMNA);
  await page.waitForSelector("#denegado:not(.hidden)", { timeout: 20000 });
  igual("se le dice que esto es de quien da clase",
    await page.evaluate(() => document.getElementById("denegado").checkVisibility()), true);
  igual("y no se le pinta ni una casilla",
    await page.evaluate(() => document.querySelectorAll(".alumno-chk").length), 0);
  igual("ni el formulario",
    await page.evaluate(() => document.getElementById("app").classList.contains("hidden")), true);
  await page.context().close();
}

/* La lección de clonar la cabecera de otra página: la primera versión de
   aperturas.html salió con el CSS impreso como texto y sin el script del tema,
   y las dos cosas «funcionaban». verificar-css.js no ve esta página porque
   está detrás del login. */
async function pruebaSeVe(browser) {
  console.log("\n=== Y la página se ve ===");
  const contexto = await browser.newContext({ timezoneId: ZONA, colorScheme: "dark" });
  const page = await contexto.newPage();
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(PROFE) }));
  await page.goto(BASE + "/asistencia.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  igual("no hay CSS impreso como texto",
    await page.evaluate(() => /\{[^}]*(display|margin|padding)\s*:/.test(document.body.innerText)), false);
  igual("hay una sola hoja de estilos propia",
    await page.evaluate(() => document.querySelectorAll("style").length) <= 1, true);
  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const claro = fondo.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
  cierto("con el tema en oscuro, el fondo es oscuro", claro < 90, "fondo: " + fondo);
  igual("las tarjetas tienen estilo de verdad",
    await page.evaluate(() => getComputedStyle(document.getElementById("ficha")).borderRadius !== "0px"), true);
  await contexto.close();
}

(async () => {
  pruebaReporte();
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const errores = await pruebaFicha(browser);
    await pruebaCorregir(browser);
    await pruebaAlumna(browser);
    await pruebaSeVe(browser);
    if (errores.length) {
      console.log("\n  ✗ la página dejó errores en la consola:\n      " + errores.join("\n      "));
      fallos += 1;
    } else console.log("\n  ✓ sin errores en la consola");
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobaciones fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
