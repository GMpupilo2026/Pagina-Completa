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
/* Las clases de mentira se cuelgan de HOY, no de una fecha escrita a mano.
   Con la fecha fija esta prueba se pudría sola: el filtro de "últimos 3 meses"
   se mide contra el día en que se corre, así que cuando el calendario pasaba
   de esa fecha las clases se iban cayendo del filtro de a una y la prueba
   fallaba por el almanaque y no por el código. Con 30 clases cada 3 días entran
   87 días, que siempre caben en los 90 del filtro. */
const HOY = (() => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); })();
function clasesDeMentira() {
  const filas = [];
  for (let i = 0; i < 47; i += 1) {
    const dia = new Date(HOY - i * 3 * 86400000);
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

/* `datos` trae lo que cada prueba quiere que la base conteste: las tareas del
   alumno y lo que devuelve cada RPC. Sin eso no se puede probar lo que el panel
   AHORA hace, que es pedirle a la base los números ya contados en vez de
   bajarse las tablas y sumarlas acá. */
function clienteFalso(perfiles, usuarioId, clases, datos) {
  return `
window.__consultas = [];
(function () {
  const PERFILES = ${JSON.stringify(perfiles)};
  const CLASES = ${JSON.stringify(clases)};
  const DATOS = ${JSON.stringify(datos || {})};

  /* Un constructor que de verdad FILTRA y de verdad CORTA, y que además deja
     anotado lo que se le pidió. Un doble que devolviera siempre la tabla entera
     daría por buena una página que no filtra nada. */
  function constructor(tabla, filas, args) {
    const anotado = { tabla: tabla, eq: {}, gte: null, or: null, range: null, limit: null, count: false, args: args || null };
    window.__consultas.push(anotado);
    let filas2 = (filas || []).slice(), unica = false;
    const cmp = (a, b) => String(a) === String(b);
    // "profiles.grupo" es como PostgREST nombra una columna de la tabla
    // relacionada; sin resolver el punto, ese filtro no encuentra nunca nada.
    const valor = (fila, col) => String(col).split(".").reduce((o, k) => (o == null ? o : o[k]), fila);
    const b = {
      select(_cols, opts) { if (opts && opts.count) anotado.count = true; return b; },
      eq(col, val) { anotado.eq[col] = val; filas2 = filas2.filter((r) => cmp(valor(r, col), val)); return b; },
      gte(col, val) { anotado.gte = { col: col, val: val }; filas2 = filas2.filter((r) => String(valor(r, col)) >= String(val)); return b; },
      lt(col, val) { anotado.lt = { col: col, val: val }; filas2 = filas2.filter((r) => String(valor(r, col)) < String(val)); return b; },
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
    /* Una clase EN CURSO es una fila sin ended_at: la página la busca con
       .is("ended_at", null). Va primera para que el .limit(1) la encuentre. */
    class_sessions: (DATOS.clase_abierta
      ? [{ id: "c-viva", created_by: "u-profe", title: "Finales de torre", notes: null,
           started_at: new Date(Date.now() - 20 * 60000).toISOString(), ended_at: null }]
      : []).concat(CLASES),
    puzzle_rush_scores: DATOS.puzzle_rush_scores || [],
    training_progress: [],
  };

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      updateUser: () => Promise.resolve({ error: null }),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    /* Los RPC contestan lo que la prueba les puso, y pasan por el MISMO
       constructor que las tablas: así quedan anotados en window.__consultas y
       se puede exigir, por ejemplo, que los tres números de Entrenamiento
       salgan de informes_resumen_alumnos() y no de bajarse training_progress.

       Un solo profesor en mis_clases: el selector de clase no aparece, que es
       lo correcto. */
    rpc: (n, args) => constructor(n, n === "mis_clases"
      ? [{ profesor_id: "u-profe", profesor_nombre: "Karina Rojas", es_principal: true, clase_abierta: false }]
      : (DATOS.rpc && DATOS.rpc[n]) || [], args),
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

async function panel(browser, perfiles, quien, opciones, datos) {
  const ctx = await browser.newContext(opciones || {});
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/cdnjs.cloudflare.com/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfiles, quien, clasesDeMentira(), datos) }));
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
    desc: (() => { const s = el.querySelectorAll("span > span"); return s[1] ? s[1].textContent : ""; })(),
    enlace: el.tagName === "A" ? el.getAttribute("href") : null,
    apagado: el.getAttribute("aria-disabled") === "true",
  })),
}));

/* El contenido de cada grupo se pide POR NOMBRE y no por su posición. Con
   índices, mover un grupo de lugar —que es una sola línea en clases.html y algo
   que se hace por criterio editorial— rompía media docena de comprobaciones que
   no tienen nada que ver con el orden, y había que renumerarlas a mano. El
   orden se comprueba aparte y una sola vez, que es donde de verdad importa. */
function grupo(grupos, titulo) {
  const g = grupos.find((x) => x.titulo === titulo);
  if (!g) { mal(`no está el grupo «${titulo}»`); return { titulo: titulo, tiles: [] }; }
  return g;
}

async function pruebaAlumna(browser) {
  console.log("\n=== La grilla, vista por una alumna ===");
  const { page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana");
  const grupos = await page.evaluate(LEER_GRILLA);

  /* "Aprender" va antes que "Jugar y competir": esto es una academia, y lo
     primero que se ofrece al entrar es lo que se viene a hacer. */
  igual("los grupos, en su orden", grupos.map((g) => g.titulo),
    ["Clase en vivo", "Aprender", "Jugar y competir", "Evaluaciones", "Herramientas", "Tu cuenta"]);
  igual("«Clase en vivo» lleva un solo acceso, y es la sesión en vivo",
    grupos[0].tiles.map((t) => t.enlace), ["sesion.html"]);   // por índice a propósito: que vaya PRIMERA es el punto
  igual("Jugar y competir", grupo(grupos, "Jugar y competir").tiles.map((t) => t.enlace),
    ["tablero.html", "juegos.html", "torneos.html", "racha-tactica.html", "logros.html", "tv.html"]);
  igual("Aprender", grupo(grupos, "Aprender").tiles.map((t) => t.enlace),
    ["cursos/academia/index.html", "entreno/index.html", "entreno/estudio.html",
     "articulos.html", "tareas.html"]);
  /* Los DOS diagnósticos son para todo el mundo: cualquiera puede medir su nivel
     de arbitraje, no solo quien da clase. A la alumna la tarjeta la manda a la
     versión que NO enseña las respuestas al terminar. */
  /* Los "Exámenes · Próximamente" se fueron: un "próximamente" sin fecha deja
     de leerse y ocupaba un lugar en la grilla. Ya existen —examenes.html, con
     nota y reloj— así que la tarjeta volvió, ahora sí con algo detrás. */
  igual("Evaluaciones: los exámenes y los dos diagnósticos, ninguno apagado",
    grupo(grupos, "Evaluaciones").tiles.map((t) => [t.enlace, t.apagado]),
    [["examenes.html", false], ["entreno/diagnostico.html", false], ["nivel-de-arbitraje.html", false]]);
  /* "Cerrar sesión" salió del grid: ya está en la cabecera, que es donde se
     busca, y era la única ACCIÓN entre un grid de lugares a los que ir. Un
     destino repetido en el panel ya había dado problemas con "Torneos". */
  igual("Tu cuenta, en su orden",
    grupo(grupos, "Tu cuenta").tiles.map((t) => t.etiqueta),
    ["Informes", "Mis pagos", "Configuración"]);
  igual("«Cerrar sesión» no está dos veces: en el grid ya no",
    grupos.flatMap((g) => g.tiles).filter((t) => /Cerrar sesión/.test(t.etiqueta2)).length, "0");
  igual("y sigue estando en la cabecera, que es de donde no se movió",
    await page.evaluate(() => !!document.getElementById("logout-btn")), "true");

  // Lo apagado, que es lo que se pidió: apagado para ELLA.
  const apagados = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#tile-grid [aria-disabled=true]")).map((el) => ({
      etiqueta: el.querySelector("span > span").textContent,
      enlace: el.getAttribute("href"),
      tag: el.tagName,
      texto: el.textContent,
    })));
  igual("a la alumna se le apagan los tres de mantenimiento, y nada más",
    apagados.map((a) => a.etiqueta).sort(),
    ["Archivos", "Lector de planilla", "Mis pagos"]);
  if (apagados.some((a) => a.enlace || a.tag === "A" || a.tag === "BUTTON")) {
    mal("un acceso apagado sigue siendo enlace o botón: recibe el foco y promete un destino que no abre");
  } else bien("ninguno es enlace ni botón: no recibe el foco del teclado");
  if (apagados.every((a) => /En mantenimiento/.test(a.texto))) {
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
    grupo(grupos, "Evaluaciones").tiles.map((t) => t.enlace),
    ["examenes.html", "entreno/diagnostico.html", "arbitraje.html"]);
  igual("y sigue siendo una sola tarjeta de arbitraje, no dos con el mismo nombre",
    grupos.flatMap((g) => g.tiles).filter((t) => /arbitraje/i.test(t.etiqueta)).length, "1");
  const apagados = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#tile-grid [aria-disabled=true]")).map((el) => el.querySelector("span > span").textContent));
  igual("a ella no se le apaga NADA: no hay mantenimiento que le aplique ni tarjetas en espera",
    apagados, []);
  igual("las herramientas le quedan abiertas",
    grupo(grupos, "Herramientas").tiles.map((t) => t.enlace), ["lector-planilla.html", "partidas.html", "planes.html"]);

  /* "Mis pagos" es el recibo de la familia del alumno: a una profesora le
     ofrecía "lo que se te ha cobrado" sobre una cuenta a la que no se le cobra
     nada. Y como no coordina, tampoco le toca la página entera de Cobros. */
  igual("a quien da clase no se le ofrece su propio recibo",
    grupo(grupos, "Tu cuenta").tiles.map((t) => t.etiqueta), ["Informes", "Configuración"]);
  igual("y sin coordinar, cobros.html no le aparece por ningún lado",
    grupos.flatMap((g) => g.tiles).filter((t) => t.enlace === "cobros.html").length, "0");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* El panel estaba escrito para el alumno de punta a punta, y a quien da clase
   le decía cosas que no son: que "tu profesor te asigna el rival", que los
   torneos "los arma tu profesor", que Informes es "tu progreso". Tareas tenía
   el defecto al revés y al alumno le ofrecía asignarle material a unos alumnos
   que no tiene. Nada de eso rompe nada —por eso nunca saltó—, así que lo mira
   una prueba.

   La comprobación fuerte no es la lista de textos uno por uno, que envejece:
   es que a quien da clase NINGUNA tarjeta le hable de "tu profesor" ni le
   prometa que algo es "tuyo" cuando es de sus alumnos. Un tile nuevo copiado
   de otro cae ahí solo. */
async function pruebaTextosPorRol(browser) {
  console.log("\n=== A cada quien, el texto que le toca ===");

  const descripciones = (grupos) => {
    const d = {};
    grupos.forEach((g) => g.tiles.forEach((t) => { d[t.etiqueta] = t.desc; }));
    return d;
  };

  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, datosAlumna(false));
  const alumna = descripciones(await r.page.evaluate(LEER_GRILLA));
  await r.ctx.close();

  r = await panel(browser, [PROFE], "u-profe", {}, {
    rpc: { panel_profesor: [{ alumnos: 29, activos_7d: 11, tareas_pendientes: 6, tareas_vencidas: 2, clases_30d: 8 }] },
  });
  const profe = descripciones(await r.page.evaluate(LEER_GRILLA));
  await r.ctx.close();

  // A la alumna, lo suyo.
  igual("a la alumna, Tareas le habla de lo que le mandaron",
    alumna["Tareas"], "Lo que te mandó tu profesor, con su fecha límite");
  igual("y no le ofrece asignarle material a unos alumnos que no tiene",
    /tus alumnos/i.test(alumna["Tareas"]), "false");
  igual("a la alumna, Informes es lo suyo", alumna["Informes"], "Tu progreso y estadísticas");

  // A quien da clase, lo suyo.
  igual("a la profesora, Tareas le habla de asignar",
    profe["Tareas"], "Asigna material a tus alumnos, con su fecha límite");
  igual("Informes es el de sus alumnos", profe["Informes"], "El progreso de tus alumnos y los informes a la casa");
  igual("los torneos los arma ella", profe["Torneos de la Academia"], "Arma torneos para tus alumnos, con sus rondas y su tabla");
  igual("y el rival de Juegos también", profe["Juegos"], "Crazyhouse y otras modalidades — arma las partidas de tus alumnos");
  igual("la sesión en vivo es el tablero de SU clase", profe["Sesión en vivo"], "El tablero que ve tu clase, en vivo");
  igual("y el diagnóstico de arbitraje le habla de revisar los del público",
    profe["Diagnóstico de arbitraje"], "Reglamento FIDE: hazlo, revisa los del público y responde");

  /* La regla general, que es la que atrapa al tile que todavía no existe. */
  const conTuProfesor = Object.entries(profe).filter(([, d]) => /tu profesor/i.test(d)).map(([k]) => k);
  igual("a quien da clase, NINGUNA tarjeta le habla de «tu profesor»", conTuProfesor, []);

  /* Y lo que NO cambia: un texto que sirve igual para los dos no se duplica
     porque sí — dos versiones de la misma frase se van separando sola. */
  igual("lo que vale para los dos se queda igual", alumna["Configuración"], profe["Configuración"]);
  igual("y también lo neutral de Entrenamiento", alumna["Entrenamiento"], profe["Entrenamiento"]);
}

async function pruebaAdmin(browser) {
  console.log("\n=== La grilla, vista por administración ===");
  const { page, ctx } = await panel(browser, [ADMIN], "u-admin");
  const grupos = await page.evaluate(LEER_GRILLA);
  igual("Administración encabeza «Tu cuenta»", grupo(grupos, "Tu cuenta").tiles[0].enlace, "admin.html");
  igual("quien coordina no ve «Mis pagos» en Tu cuenta",
    grupo(grupos, "Tu cuenta").tiles.map((t) => t.etiqueta), ["Administración", "Informes", "Configuración"]);
  igual("y llega a los cobros una sola vez, por la página entera",
    grupos.flatMap((g) => g.tiles).filter((t) => t.enlace === "cobros.html").map((t) => t.etiqueta),
    ["Cobros de la Academia"]);
  igual("y coordinando no aparece «Mis pagos» sino Cobros, en Herramientas",
    grupo(grupos, "Herramientas").tiles.map((t) => t.enlace),
    ["lector-planilla.html", "partidas.html", "planes.html", "formularios.html", "cobros.html"]);
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
  const mesesEsperados = [];
  clasesDeMentira().slice(0, 20).forEach((c) => {
    const d = new Date(c.started_at);
    const t = d.toLocaleDateString("es-CR", { month: "long", year: "numeric", timeZone: "UTC" });
    const titulo = t.charAt(0).toUpperCase() + t.slice(1).replace(" de ", " de ");
    if (!mesesEsperados.includes(titulo)) mesesEsperados.push(titulo);
  });
  igual("las clases salen agrupadas por mes", meses.map((m) => m.titulo), mesesEsperados);
  igual("solo el mes más reciente arranca abierto — es lo que hace legibles 100 clases",
    meses.map((m) => m.abierto), mesesEsperados.map((_, i) => i === 0));
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

/* ===== Lo que te toca hacer, y de dónde salen los números =====

   Tres peligros distintos, y ninguno da error en pantalla:

   1. Que la franja de tareas no aparezca, o aparezca cuando no hay nada que
      hacer. La fecha límite ya vivía en la base; si el panel no la dice, el
      alumno abre esto, no ve nada y la tarea vence.

   2. Que los tres números de Entrenamiento vuelvan a contarse en el navegador.
      Bajarse training_progress entera tiene el techo de PostgREST: pasado
      cierto número de filas la respuesta llega cortada SIN ningún error, y el
      panel pinta un número que ya no sube. Por eso no alcanza con mirar que
      los números estén bien — hay que exigir que salgan del RPC y que NADIE
      haya pedido esa tabla.

   3. Que quien da clase vuelva a ver el panel del alumno: sus propios
      ejercicios 4×4 en cero en vez de a quién hay que perseguir. */

/* Lo que devuelve public.tareas_con_avance(p_pendientes => true): las que NO
   están cumplidas, ya con su situación calculada. El panel no vuelve a
   decidir qué está pendiente —`tareas.estado` quedó sin uso— así que la
   completada ni siquiera llega: filtrarla acá sería bajarse la tabla entera
   con otro nombre. */
function tareasDeMentira(conVencida) {
  const dia = (n) => new Date(Date.now() + n * 86400000).toISOString();
  const filas = [
    { id: "t1", alumno_id: "u-ana", situacion: "pendiente", titulo: "Finales de rey y peón",
      vence_at: dia(1), renglones: 1, cumplidos: 0 },
    { id: "t2", alumno_id: "u-ana", situacion: "pendiente", titulo: "Mates en dos",
      vence_at: dia(5), renglones: 1, cumplidos: 0 },
  ];
  if (conVencida) {
    filas.unshift({ id: "t0", alumno_id: "u-ana", situacion: "vencida", titulo: "Aperturas",
      vence_at: dia(-2), renglones: 1, cumplidos: 0 });
  } else {
    filas.push({ id: "t3", alumno_id: "u-ana", situacion: "pendiente", titulo: "Repaso largo",
      vence_at: dia(8), renglones: 1, cumplidos: 0 });
  }
  return filas;
}

const RESUMEN_ANA = [{
  id: "u-ana", full_name: "Ana Rojas", grupo: "7B",
  puzzles: 37, lecciones: 9, mejor_coord: 24,
}];
const CURSOS_ANA = [
  // El más reciente de los dos a medias es el que hay que ofrecer, y el
  // terminado no se ofrece nunca: no hay nada que continuar ahí.
  { student_id: "u-ana", slug: "fundamentos-del-ajedrez", titulo: "Fundamentos del Ajedrez", total: 20, hechos: 7,
    ultimo_titulo: "La clavada", ultima_fecha: new Date(Date.now() - 2 * 86400000).toISOString() },
  { student_id: "u-ana", slug: "finales-practicos", titulo: "Finales prácticos", total: 15, hechos: 3,
    ultimo_titulo: "Oposición", ultima_fecha: new Date(Date.now() - 30 * 86400000).toISOString() },
  { student_id: "u-ana", slug: "estrategia-y-tactica", titulo: "Estrategia y táctica", total: 12, hechos: 12,
    ultimo_titulo: "Final", ultima_fecha: new Date().toISOString() },
];
const RACHA_ANA = [{ dias_activos: 12, racha_actual: 4, racha_record: 9, total_ejercicios: 80,
                     tipos_distintos: 5, hoy_ejercicios: 2, primer_dia: "2026-01-01", por_actividad: {} }];

function datosAlumna(conVencida) {
  return {
    puzzle_rush_scores: [{ best_streak: 14, profiles: { full_name: "Bruno Mora", email: "b@x.cr", grupo: "7B" } }],
    rpc: {
      tareas_con_avance: tareasDeMentira(conVencida),
      informes_resumen_alumnos: RESUMEN_ANA,
      informes_cursos_alumnos: CURSOS_ANA,
      progreso_dias_y_racha: RACHA_ANA,
    },
  };
}

async function pruebaTareasAlumna(browser) {
  console.log("\n=== Lo que le toca a la alumna ===");

  // --- Con una tarea ya vencida ---
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, datosAlumna(true));
  let visto = await r.page.evaluate(() => {
    const a = document.getElementById("tareas-aviso");
    return {
      display: getComputedStyle(a).display,
      titulo: document.getElementById("tareas-aviso-titulo").textContent,
      texto: document.getElementById("tareas-aviso-texto").textContent,
      rojo: /ring-red-500/.test(a.className),
      enlace: a.getAttribute("href"),
    };
  });
  // Se mide el display que calcula el navegador y no el atributo: la lección
  // que dejó el cartel de instalar, que llevaba `hidden` puesto y salía igual.
  igual("la franja de tareas SE VE de verdad", visto.display !== "none", "true");
  igual("cuenta las pendientes y no las hechas", visto.titulo, "Tienes 3 tareas pendientes");
  igual("con una vencida, lo dice y no lo disimula", visto.texto,
    "Se te pasó la fecha de «Aperturas». Todavía puedes hacerla.");
  igual("y la franja se pinta en rojo", visto.rojo, "true");
  igual("lleva a Tareas", visto.enlace, "tareas.html");

  // Que la base filtre: pedir las completadas también y descartarlas acá sería
  // bajarse la tabla entera con otro nombre.
  /* El orden de la página es el de las preguntas que uno se hace al entrar:
     qué me toca, por dónde iba, cómo voy, y recién entonces a dónde ir. Se
     comprueba con compareDocumentPosition y no con el CSS: lo que importa es
     el orden del documento, que es también el que recorre un lector de
     pantalla. */
  const orden = await r.page.evaluate(() => {
    const ids = ["tareas-aviso", "seguir-curso", "progreso-alumno", "tile-grid"];
    const nodos = ids.map((id) => document.getElementById(id));
    return nodos.every((n, i) => i === 0
      || (nodos[i - 1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
  });
  igual("lo que vence va primero, después el progreso y al final los accesos", orden, "true");

  /* Las pendientes las decide la BASE, no el navegador: lo pendiente dejó de
     ser una columna cuando una tarea pasó a tener renglones con cantidad, y
     es la misma función que pinta tareas.html — dos cuentas separadas podrían
     decir cosas distintas del mismo alumno. Por eso se exige el RPC con sus
     argumentos y que NADIE pida la tabla `tareas`. */
  const rpcTareas = await r.page.evaluate(() =>
    window.__consultas.filter((c) => c.tabla === "tareas_con_avance").pop());
  igual("las pendientes las pide por RPC, no bajando la tabla",
    [rpcTareas && rpcTareas.args && rpcTareas.args.p_alumno,
     rpcTareas && rpcTareas.args && rpcTareas.args.p_pendientes], ["u-ana", true]);
  igual("y se acota cuántas se piden: el panel solo pinta la más próxima",
    rpcTareas && rpcTareas.args && rpcTareas.args.p_limite, 50);
  igual("y nadie se baja la tabla `tareas` a mano",
    await r.page.evaluate(() => window.__consultas.some((c) => c.tabla === "tareas")), "false");
  igual("sin errores en consola", r.errores.join(" | ") || "ninguno", "ninguno");
  await r.ctx.close();

  // --- Sin ninguna vencida ---
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, datosAlumna(false));
  visto = await r.page.evaluate(() => ({
    titulo: document.getElementById("tareas-aviso-titulo").textContent,
    texto: document.getElementById("tareas-aviso-texto").textContent,
    rojo: /ring-red-500/.test(document.getElementById("tareas-aviso").className),
  }));
  igual("sin vencidas, anuncia la más próxima", visto.texto,
    "La más próxima es «Finales de rey y peón», vence mañana.");
  igual("y no se pinta en rojo: en rojo permanente se deja de ver", visto.rojo, "false");
  await r.ctx.close();

  // --- Sin ninguna tarea: la franja no existe en pantalla ---
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, { rpc: { informes_resumen_alumnos: RESUMEN_ANA } });
  igual("sin tareas, la franja NO se destapa (una franja vacía es ruido)",
    await r.page.evaluate(() => getComputedStyle(document.getElementById("tareas-aviso")).display), "none");
  igual("y sin ningún curso a medias, tampoco «Continúa donde ibas»",
    await r.page.evaluate(() => getComputedStyle(document.getElementById("seguir-curso")).display), "none");
  await r.ctx.close();
}

/* La franja de "Estado de la clase" ocupaba el primer lugar de la página para
   decirle a un alumno fuera del horario —casi siempre— que NO pasa nada, y le
   empujaba las tareas hacia abajo. Ahora solo sale cuando tiene algo que decir.
   Las dos mitades de la condición importan: esconderla de más le quitaría a
   quien da clase el botón de iniciarla. */
async function pruebaFranjaDeClase(browser) {
  console.log("\n=== La franja de la clase solo habla cuando tiene algo que decir ===");

  const vista = (page) => page.evaluate(() => {
    const c = document.getElementById("session-status-card");
    return {
      card: getComputedStyle(c).display,
      abierta: getComputedStyle(document.getElementById("session-status-open")).display,
      iniciar: getComputedStyle(document.getElementById("start-session-controls")).display,
      texto: c.textContent.replace(/\s+/g, " ").trim().slice(0, 40),
    };
  });

  // Sin clase en curso, a la alumna no se le dice nada.
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, datosAlumna(false));
  let v = await vista(r.page);
  igual("sin clase en curso, a la alumna la franja NO le ocupa el primer lugar", v.card, "none");
  // Y lo que sí tiene que hacer queda arriba del todo.
  const primero = await r.page.evaluate(() => {
    const visible = (el) => el && getComputedStyle(el).display !== "none";
    const orden = ["session-status-card", "tareas-aviso", "seguir-curso"].map((id) => document.getElementById(id));
    return orden.filter(visible).map((el) => el.id)[0];
  });
  igual("lo primero que ve es su tarea, no un aviso de que no pasa nada", primero, "tareas-aviso");
  await r.ctx.close();

  // A quien da clase sí: es desde donde la inicia.
  r = await panel(browser, [PROFE], "u-profe", {}, {
    rpc: { panel_profesor: [{ alumnos: 3, activos_7d: 3, tareas_pendientes: 0, tareas_vencidas: 0, clases_30d: 2 }] },
  });
  v = await vista(r.page);
  igual("pero a quien da clase sí se le muestra, aunque no haya clase", v.card !== "none", "true");
  igual("porque es desde donde la inicia", v.iniciar !== "none", "true");
  await r.ctx.close();

  // Con clase en curso la ve todo el mundo, alumna incluida.
  const conClase = datosAlumna(false);
  conClase.clase_abierta = true;
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, conClase);
  v = await vista(r.page);
  igual("y con clase en curso la ve la alumna también", v.card !== "none", "true");
  igual("con el aviso de que está en curso", v.abierta !== "none", "true");
  await r.ctx.close();
}

async function pruebaProgresoAlumna(browser) {
  console.log("\n=== Tu progreso, y de dónde salen los números ===");
  const { page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, datosAlumna(false));

  const visto = await page.evaluate(() => ({
    alumno: getComputedStyle(document.getElementById("progreso-alumno")).display,
    profe: getComputedStyle(document.getElementById("progreso-profe")).display,
    racha: document.getElementById("progreso-racha").textContent,
    puzzles: document.getElementById("entreno-puzzles").textContent,
    lecciones: document.getElementById("entreno-lessons").textContent,
    coord: document.getElementById("entreno-coord").textContent,
    record: document.getElementById("tactics-record-text").textContent,
    tituloRecord: document.getElementById("tactics-record-title").textContent,
  }));
  igual("a la alumna se le muestra «Tu progreso»", visto.alumno !== "none", "true");
  igual("y no el panel del equipo docente", visto.profe, "none");
  igual("los tres números salen tal cual los contó la base",
    [visto.puzzles, visto.lecciones, visto.coord], ["37", "9", "24"]);
  igual("y la racha de días también", visto.racha, "4");
  igual("el récord de racha táctica se compara dentro de su grupo",
    visto.tituloRecord, "Racha táctica del grupo 7B");
  igual("con quién lo tiene", visto.record, "Bruno Mora lleva el récord con 14 aciertos seguidos.");

  /* Lo que de verdad importa de este cambio: que los números vengan CONTADOS.
     Si alguien vuelve a sumar en el navegador, la página se ve igual de bien
     hasta que un alumno pasa las mil filas de training_progress, y ahí empieza
     a mostrar un número que ya no sube, sin que nada falle. */
  const consultas = await page.evaluate(() => window.__consultas.map((c) => c.tabla));
  igual("los números se le piden contados a informes_resumen_alumnos()",
    consultas.includes("informes_resumen_alumnos"), "true");
  igual("y NADIE se baja training_progress para sumarla acá",
    consultas.includes("training_progress"), "false");

  // Continúa donde ibas: el curso a medias más reciente, no el terminado.
  const seguir = await page.evaluate(() => ({
    display: getComputedStyle(document.getElementById("seguir-curso")).display,
    href: document.getElementById("seguir-curso").getAttribute("href"),
    texto: document.getElementById("seguir-curso-texto").textContent,
    barra: document.getElementById("seguir-curso-barra").style.width,
  }));
  igual("«Continúa donde ibas» se ve", seguir.display !== "none", "true");
  igual("y ofrece el curso a medias más reciente, no el terminado ni el viejo",
    seguir.href, "cursos/academia/fundamentos-del-ajedrez.html");
  igual("diciendo por dónde iba", seguir.texto, "Fundamentos del Ajedrez — 7 de 20 temas. Lo último: La clavada.");
  igual("y la barra mide lo que dice", seguir.barra, "35%");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaSemanaProfesora(browser) {
  console.log("\n=== Tu semana, vista por una profesora ===");
  const { page, ctx, errores } = await panel(browser, [PROFE], "u-profe", {}, {
    rpc: { panel_profesor: [{ alumnos: 29, activos_7d: 11, tareas_pendientes: 6, tareas_vencidas: 2, clases_30d: 8 }] },
  });

  const visto = await page.evaluate(() => ({
    profe: getComputedStyle(document.getElementById("progreso-profe")).display,
    alumno: getComputedStyle(document.getElementById("progreso-alumno")).display,
    alumnos: document.getElementById("profe-alumnos").textContent,
    inactivos: document.getElementById("profe-inactivos").textContent,
    inactivosRojo: /text-red-600/.test(document.getElementById("profe-inactivos").className),
    tareas: document.getElementById("profe-tareas").textContent,
    vencidas: document.getElementById("profe-vencidas").textContent,
    clases: document.getElementById("profe-clases").textContent,
  }));
  igual("a quien da clase se le muestra «Tu semana»", visto.profe !== "none", "true");
  igual("y NO el panel del alumno con sus ejercicios 4×4 en cero", visto.alumno, "none");
  igual("sus alumnos, los que le da la RLS", visto.alumnos, "29");
  igual("«sin entrenar» es la resta, no otro número que se pueda contradecir", visto.inactivos, "18");
  igual("y se pinta en rojo, porque hay a quién perseguir", visto.inactivosRojo, "true");
  igual("las tareas que ÉL mandó y siguen sin hacerse", visto.tareas, "6");
  igual("y cuántas de esas ya vencieron", visto.vencidas, "2");
  igual("más las clases del mes", visto.clases, "Llevas 8 clases dadas en los últimos 30 días.");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  // Con todo en cero no hay nada que perseguir: el rojo se va.
  const r = await panel(browser, [PROFE], "u-profe", {}, {
    rpc: { panel_profesor: [{ alumnos: 4, activos_7d: 4, tareas_pendientes: 0, tareas_vencidas: 0, clases_30d: 1 }] },
  });
  const limpio = await r.page.evaluate(() => ({
    inactivos: document.getElementById("profe-inactivos").textContent,
    rojo: /text-red-600/.test(document.getElementById("profe-inactivos").className)
       || /text-red-600/.test(document.getElementById("profe-vencidas").className),
    clases: document.getElementById("profe-clases").textContent,
  }));
  igual("con todos al día, ningún número se pinta en rojo", limpio.rojo, "false");
  igual("y una sola clase se dice en singular", limpio.clases, "Llevas 1 clase dada en los últimos 30 días.");
  await r.ctx.close();
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
    await pruebaTareasAlumna(browser);
    await pruebaFranjaDeClase(browser);
    await pruebaProgresoAlumna(browser);
    await pruebaSemanaProfesora(browser);
    await pruebaProfesora(browser);
    await pruebaTextosPorRol(browser);
    await pruebaAdmin(browser);
    await pruebaRegistro(browser);
    await pruebaPantalla(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl panel de la Academia está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
