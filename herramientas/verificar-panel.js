/* Comprueba, en un navegador de verdad y con un Supabase de mentira, el panel
   de la Academia (clases.html): cómo queda la grilla de accesos y cómo se
   muestra el registro de clases.

   Existe porque clases.html está DETRÁS DEL LOGIN: verificar-css.js abre las
   páginas sin cuenta, así que todo lo de acá —los grupos de accesos, los
   accesos apagados, el registro— solo existe después de iniciar sesión y él no
   lo ve nunca. Lo que se rompe acá no da error: un grupo que se queda vacío, un
   acceso que al alumno se le apaga sin querer, o un filtro que no filtra y
   devuelve la tabla entera.

   Tres cosas, por tres peligros distintos:

   1. LA GRILLA. Que "Sesión en vivo" esté sola y de primera; que cada grupo
      tenga lo suyo y en su orden; que los accesos en mantenimiento estén
      apagados PARA EL ALUMNO y abiertos para el equipo docente. Un acceso
      apagado no es un enlace: no lleva href ni recibe el foco, y dice por qué
      está apagado — un cuadro gris sin explicación se lee como una página rota.

   2. EL REGISTRO DE CLASES. Que el filtro y el corte los haga LA BASE y no el
      navegador: el Supabase de mentira anota cada consulta, así que se puede
      exigir que el periodo salga como un `gte`, la búsqueda como un `ilike` y
      la página como un `range` de 20. Si algún día alguien vuelve a bajarse las
      clases enteras y a filtrarlas acá, la página se vería igual de bien
      —hasta la clase número mil, que es donde PostgREST corta sin avisar—.

   3. QUE LA PÁGINA SE VEA. Que el cartel de instalar arranque invisible de
      verdad (el atributo `hidden` tiene que ganarle a la clase `flex` de
      Tailwind: durante meses no le ganó y el cartel salía siempre), que no haya
      CSS impreso como texto y que con el tema en oscuro el fondo salga oscuro.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-panel.js                                 */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE  = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false, full_name: "Karina Rojas", email: "karina@x.cr", grupo: null };
const ALUMNA = { id: "u-ana",   role: "alumno",   is_admin: false, es_coordinador: false, full_name: "Ana Rojas",    email: "ana@x.cr",    grupo: "7B" };
const ADMIN  = { id: "u-admin", role: "profesor", is_admin: true,  es_coordinador: true,  full_name: "Oscar Angulo", email: "oscar@x.cr",  grupo: null };

/* 47 clases repartidas en cinco meses: más de una página (van de 20 en 20) y
   más de un mes, que es lo que hace falta para probar el agrupado. */
function clasesDeMentira() {
  const filas = [];
  for (let i = 0; i < 47; i += 1) {
    const dia = new Date(Date.UTC(2026, 8, 16) - i * 3 * 86400000);
    const fin = new Date(dia.getTime() + 60 * 60000);
    filas.push({
      id: "c-" + i,
      created_by: "u-profe",
      title: i === 0 ? "Finales de torre" : "Clase " + i,
      notes: i === 0 ? "repasamos la posición de Lucena" : null,
      started_at: dia.toISOString(),
      ended_at: fin.toISOString(),
    });
  }
  return filas;
}

function clienteFalso(perfiles, usuarioId, clases) {
  return `
window.__consultas = [];
(function () {
  const PERFILES = ${JSON.stringify(perfiles)};
  const CLASES = ${JSON.stringify(clases)};

  /* Un constructor que de verdad FILTRA y de verdad CORTA, y que además deja
     anotado lo que se le pidió. Un doble que devolviera siempre la tabla entera
     daría por buena una página que no filtra nada. */
  function constructor(tabla, filas) {
    const anotado = { tabla: tabla, eq: {}, gte: null, or: null, range: null, limit: null, count: false };
    window.__consultas.push(anotado);
    let filas2 = (filas || []).slice(), unica = false;
    const cmp = (a, b) => String(a) === String(b);
    const b = {
      select(_cols, opts) { if (opts && opts.count) anotado.count = true; return b; },
      eq(col, val) { anotado.eq[col] = val; filas2 = filas2.filter((r) => cmp(r[col], val)); return b; },
      gte(col, val) { anotado.gte = { col: col, val: val }; filas2 = filas2.filter((r) => String(r[col]) >= String(val)); return b; },
      is(col, val) { if (val === null) filas2 = filas2.filter((r) => r[col] === null || r[col] === undefined); return b; },
      or(expr) {
        anotado.or = expr;
        // title.ilike.%x%,notes.ilike.%x%
        const partes = String(expr).split(",").map((p) => p.split("."));
        filas2 = filas2.filter((r) => partes.some(([col, op, val]) =>
          op === "ilike" && String(r[col] || "").toLowerCase().includes(String(val).replace(/%/g, "").toLowerCase())));
        return b;
      },
      order(col, opts) {
        const asc = !opts || opts.ascending !== false;
        filas2.sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : 1) * (asc ? 1 : -1));
        return b;
      },
      limit(n) { anotado.limit = n; filas2 = filas2.slice(0, n); return b; },
      range(a, z) { anotado.range = [a, z]; anotado.total = filas2.length; filas2 = filas2.slice(a, z + 1); return b; },
      insert() { return b; },
      update() { return b; },
      delete() { return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = filas2;
        const total = anotado.total !== undefined ? anotado.total : filas2.length;
        if (unica) d = filas2.length ? filas2[0] : null;
        return Promise.resolve({ data: d, error: null, count: anotado.count ? total : null }).then(res, rej);
      },
    };
    return b;
  }

  const TABLAS = {
    profiles: PERFILES,
    class_sessions: CLASES,
    puzzle_rush_scores: [],
    training_progress: [],
  };

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      updateUser: () => Promise.resolve({ error: null }),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    // Un solo profesor: el selector de clase no aparece, que es lo correcto.
    rpc: (n) => constructor(n, n === "mis_clases"
      ? [{ profesor_id: "u-profe", profesor_nombre: "Karina Rojas", es_principal: true, clase_abierta: false }]
      : []),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
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
function mal(t) { console.log("  ✗ " + t); fallos += 1; }
function bien(t) { console.log("  ✓ " + t); }

async function panel(browser, perfiles, quien, opciones) {
  const ctx = await browser.newContext(opciones || {});
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/cdnjs.cloudflare.com/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfiles, quien, clasesDeMentira()) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + "/clases.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, ctx, errores };
}

// Lo que quedó pintado en la grilla, grupo por grupo.
const LEER_GRILLA = () => Array.from(document.querySelectorAll("#tile-grid section")).map((s) => ({
  titulo: s.querySelector("h2").textContent,
  tiles: Array.from(s.querySelectorAll("div.grid > *")).map((el) => ({
    etiqueta: el.querySelector("span > span") ? el.querySelector("span > span").textContent : "",
    etiqueta2: el.textContent,
    enlace: el.tagName === "A" ? el.getAttribute("href") : null,
    apagado: el.getAttribute("aria-disabled") === "true",
  })),
}));

async function pruebaAlumna(browser) {
  console.log("\n=== La grilla, vista por una alumna ===");
  const { page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana");
  const grupos = await page.evaluate(LEER_GRILLA);

  igual("los grupos, en su orden", grupos.map((g) => g.titulo),
    ["Clase en vivo", "Jugar y competir", "Aprender", "Evaluaciones", "Herramientas", "Tu cuenta"]);
  igual("«Clase en vivo» lleva un solo acceso, y es la sesión en vivo",
    grupos[0].tiles.map((t) => t.enlace), ["sesion.html"]);
  igual("Jugar y competir", grupos[1].tiles.map((t) => t.enlace),
    ["tablero.html", "juegos.html", "torneos.html", "racha-tactica.html", "logros.html", "tv.html"]);
  igual("Aprender", grupos[2].tiles.map((t) => t.enlace),
    ["cursos/academia/index.html", "entreno/index.html", "entreno/estudio.html", "articulos.html", "tareas.html"]);
  /* Los DOS diagnósticos son para todo el mundo: cualquiera puede medir su nivel
     de arbitraje, no solo quien da clase. A la alumna la tarjeta la manda a la
     versión que NO enseña las respuestas al terminar. */
  igual("Evaluaciones: los dos diagnósticos abiertos y los exámenes todavía no",
    grupos[3].tiles.map((t) => [t.enlace, t.apagado]),
    [["entreno/diagnostico.html", false], ["nivel-de-arbitraje.html", false], [null, true]]);
  igual("Tu cuenta, en su orden",
    grupos[5].tiles.map((t) => t.etiqueta),
    ["Informes", "Mis pagos", "Configuración", "Cerrar sesión"]);

  // Lo apagado, que es lo que se pidió: apagado para ELLA.
  const apagados = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#tile-grid [aria-disabled=true]")).map((el) => ({
      etiqueta: el.querySelector("span > span").textContent,
      enlace: el.getAttribute("href"),
      tag: el.tagName,
      texto: el.textContent,
    })));
  igual("a la alumna se le apagan los tres de mantenimiento, más los exámenes",
    apagados.map((a) => a.etiqueta).sort(),
    ["Caja de Compartir", "Exámenes", "Lector de planilla", "Mis pagos"]);
  if (apagados.some((a) => a.enlace || a.tag === "A" || a.tag === "BUTTON")) {
    mal("un acceso apagado sigue siendo enlace o botón: recibe el foco y promete un destino que no abre");
  } else bien("ninguno es enlace ni botón: no recibe el foco del teclado");
  if (apagados.filter((a) => a.etiqueta !== "Exámenes").every((a) => /En mantenimiento/.test(a.texto))) {
    bien("cada uno dice POR QUÉ está apagado, en la propia tarjeta");
  } else mal("un acceso apagado no dice por qué: un cuadro gris sin explicación se lee como una página rota");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaProfesora(browser) {
  console.log("\n=== La grilla, vista por una profesora ===");
  const { page, ctx, errores } = await panel(browser, [PROFE], "u-profe");
  const grupos = await page.evaluate(LEER_GRILLA);

  /* A la profesora la MISMA tarjeta la manda a la página con la revisión de los
     exámenes del público y el detalle pregunta por pregunta. Una sola tarjeta y
     no dos, para no repetir el nombre en el panel. */
  igual("al equipo docente el diagnóstico de arbitraje lo manda a su página, no a la pública",
    grupos[3].tiles.map((t) => t.enlace),
    ["entreno/diagnostico.html", "arbitraje.html", null]);
  igual("y sigue siendo una sola tarjeta de arbitraje, no dos con el mismo nombre",
    grupos.flatMap((g) => g.tiles).filter((t) => /arbitraje/i.test(t.etiqueta)).length, "1");
  const apagados = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#tile-grid [aria-disabled=true]")).map((el) => el.querySelector("span > span").textContent));
  igual("a ella NO se le apaga nada por mantenimiento: lo sigue necesitando",
    apagados, ["Exámenes"]);
  igual("las herramientas le quedan abiertas",
    grupos[4].tiles.map((t) => t.enlace), ["lector-planilla.html", "partidas.html"]);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaAdmin(browser) {
  console.log("\n=== La grilla, vista por administración ===");
  const { page, ctx } = await panel(browser, [ADMIN], "u-admin");
  const grupos = await page.evaluate(LEER_GRILLA);
  igual("Administración encabeza «Tu cuenta»", grupos[5].tiles[0].enlace, "admin.html");
  igual("y coordinando no aparece «Mis pagos» sino Cobros, en Herramientas",
    grupos[4].tiles.map((t) => t.enlace),
    ["lector-planilla.html", "partidas.html", "formularios.html", "cobros.html"]);
  await ctx.close();
}

async function pruebaRegistro(browser) {
  console.log("\n=== El registro de clases ===");
  const { page, ctx, errores } = await panel(browser, [PROFE], "u-profe");

  const consultas = () => page.evaluate(() => window.__consultas.filter((c) => c.tabla === "class_sessions" && c.range));
  let cs = await consultas();
  const primera = cs[cs.length - 1];
  igual("la primera carga pide UNA página de 20, no la tabla entera", primera.range, [0, 19]);
  igual("y pide la cuenta total aparte, para poder decir «de cuántas»", primera.count, true);
  igual("el periodo se filtra en la base, no acá", !!primera.gte, "true");

  const resumen = () => page.textContent("#sessions-log-summary");
  igual("dice cuántas muestra de cuántas hay", (await resumen()).trim(),
    "Mostrando 20 de 30 clases en el filtro elegido.");

  // Agrupado por mes: el más reciente abierto, los de atrás cerrados.
  const meses = await page.evaluate(() => Array.from(document.querySelectorAll("#sessions-log details")).map((d) => ({
    titulo: d.querySelector("summary span").textContent,
    abierto: d.open,
    filas: d.querySelectorAll("tbody tr").length,
  })));
  igual("las clases salen agrupadas por mes", meses.map((m) => m.titulo),
    ["Septiembre de 2026", "Agosto de 2026", "Julio de 2026"]);
  igual("solo el mes más reciente arranca abierto — es lo que hace legibles 100 clases",
    meses.map((m) => m.abierto), [true, false, false]);
  igual("y no se pierde ninguna fila por el camino",
    meses.reduce((a, m) => a + m.filas, 0), 20);

  // "Ver más" trae la página siguiente, no vuelve a traer la misma.
  await page.click("#sessions-more");
  await page.waitForFunction(() => /Mostrando 30 de 30/.test(document.getElementById("sessions-log-summary").textContent), { timeout: 10000 });
  cs = await consultas();
  igual("«Ver más» pide la página SIGUIENTE", cs[cs.length - 1].range, [20, 39]);
  igual("y cuando ya no queda nada, el botón se va",
    await page.evaluate(() => document.getElementById("sessions-more").hidden), "true");

  // Buscar: el ilike lo hace la base.
  await page.fill("#sessions-search", "Lucena");
  await page.waitForFunction(() => /Mostrando 1 de 1/.test(document.getElementById("sessions-log-summary").textContent), { timeout: 10000 });
  cs = await consultas();
  igual("la búsqueda va como un ilike de la base, sobre título y notas",
    cs[cs.length - 1].or, "title.ilike.%Lucena%,notes.ilike.%Lucena%");
  igual("y queda una sola clase en pantalla",
    await page.evaluate(() => document.querySelectorAll("#sessions-log tbody tr").length), "1");

  /* Una búsqueda con coma o paréntesis no puede romper la consulta: PostgREST
     arma el `or=(...)` con esos mismos caracteres. */
  await page.fill("#sessions-search", "torre, (final)");
  await page.waitForTimeout(600);
  cs = await consultas();
  igual("una coma o un paréntesis en la búsqueda no se le mandan a PostgREST",
    /[,()]/.test(cs[cs.length - 1].or.replace("title.ilike.", "").replace(",notes.ilike.", " ")), "false");

  // Y el periodo.
  await page.fill("#sessions-search", "");
  await page.selectOption("#sessions-period", "0");
  await page.waitForFunction(() => /de 47/.test(document.getElementById("sessions-log-summary").textContent), { timeout: 10000 });
  cs = await consultas();
  igual("con «Todas» no se manda ningún recorte de fecha", cs[cs.length - 1].gte, null);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* Que la página SE VEA, no solo que funcione. Es lo que verificar-css.js no
   puede mirar acá, porque todo esto solo existe con la sesión iniciada. */
async function pruebaPantalla(browser) {
  console.log("\n=== Que la página se vea ===");
  const { page, ctx } = await panel(browser, [PROFE], "u-profe", { colorScheme: "dark" });

  const cartel = await page.evaluate(() => {
    const n = document.getElementById("instalar-app");
    return { existe: !!n, display: n ? getComputedStyle(n).display : "" };
  });
  igual("el cartel de instalar arranca invisible DE VERDAD, no solo con el atributo puesto",
    cartel.existe && cartel.display, "none");

  const sueltos = await page.evaluate(() => {
    const t = document.body.innerText;
    return { css: /\{[^}]*(color|display|margin)\s*:/.test(t), estilos: document.querySelectorAll("style").length };
  });
  igual("no hay CSS impreso como texto (el `</style>` que se cuela al clonar una cabecera)", sueltos.css, "false");
  // clases.html no lleva ninguna hoja propia: todo su CSS son las dos de
  // afuera. Un <style> que aparezca acá es el que se coló al clonar la
  // cabecera de otra página, que ya pasó una vez.
  igual("ningún <style> suelto en la página", sueltos.estilos, "0");

  // El contexto viene con el tema del sistema en oscuro, que es lo que mira el
  // script del <head> cuando no hay nada guardado. Sin recargar: al recargar,
  // el service worker ya registrado sirve su copia del cliente de Supabase y se
  // cae todo con "sb is not defined".
  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const rgb = (fondo.match(/\d+/g) || []).map(Number);
  igual("con el tema en oscuro, el fondo sale oscuro", rgb[0] + rgb[1] + rgb[2] < 200, "true");

  // El acceso destacado ocupa el ancho entero: un solo cuadrito perdido a la
  // izquierda de una grilla de cuatro columnas es peor que no destacarlo.
  await page.setViewportSize({ width: 1280, height: 900 });
  const anchos = await page.evaluate(() => {
    const secciones = document.querySelectorAll("#tile-grid section");
    return {
      vivo: secciones[0].querySelector("div.grid > *").getBoundingClientRect().width,
      otro: secciones[1].querySelector("div.grid > *").getBoundingClientRect().width,
    };
  });
  igual("«Sesión en vivo» se pinta ancha, no como un cuadrito más", anchos.vivo > anchos.otro * 2, "true");

  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaProfesora(browser);
    await pruebaAdmin(browser);
    await pruebaRegistro(browser);
    await pruebaPantalla(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl panel de la Academia está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
