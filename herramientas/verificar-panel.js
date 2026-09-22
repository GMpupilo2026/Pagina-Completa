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
/* La cuenta master ya no es ni profesora ni alumna: su `role` es 'admin'.
   Antes estaba guardada como alumna, así que salía en las listas de «para
   quién» al mandar una tarea y contaba como alumna en los conteos. */
const ADMIN  = { id: "u-admin", role: "admin", is_admin: true,  es_coordinador: true,  full_name: "Oscar Angulo", email: "oscar@x.cr",  grupo: null };

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

  /* Un renglón de mis_clases() como lo devuelve la base, con los nombres de
     columna DE VERDAD (la columna se llama profesor, no profesor_nombre: con
     el nombre equivocado el botón diría "tu profe" y la prueba daría por bueno
     algo que en producción no se ve así).

     Y la videollamada SOLO llega con la clase abierta, porque así lo hace
     cumplir la RLS de profesor_videollamada. Un doble que la mandara siempre
     daría por buena una página que ofrece entrar a una llamada que no está
     pasando. */
  /* Se arma CADA VEZ que se pide, y no una sola al inyectar, porque abrir la
     clase en medio de la prueba es justo lo que hay que poder simular: lo que
     se rompe callado es que el aviso llegue y la pantalla no se entere. */
  let claseAbierta = !!DATOS.clase_abierta;
  const MI_CLASE = () => ({ profesor_id: "u-profe", profesor: "Karina Rojas", es_principal: true,
                     clase_abierta: claseAbierta, titulo_clase: null,
                     videollamada: claseAbierta ? (DATOS.videollamada || null) : null });
  window.__abrirClase = () => { claseAbierta = true; };

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
    /* La sala de videollamada del profesor. Al equipo docente se la sirve esta
       tabla (es SUYA); al alumnado le llega por mis_clases(), que es donde la
       RLS decide si se la entrega. */
    /* Una fila por (profesor, grupo): «» es la sala de todas sus clases.
       Al alumnado no se le sirve de acá —le llega por mis_clases(), que es
       donde la RLS decide cuál le toca—; esto es lo que ve el equipo docente
       de lo SUYO. */
    profesor_videollamada: DATOS.profesor_videollamada || [],
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
      ? (DATOS.mis_clases || [MI_CLASE()])
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
  /* El botón de la videollamada es hijo del mismo contenedor —comparte la
     rejilla con la tarjeta de «Sesión en vivo»— pero NO es un acceso de la
     grilla: tiene sus propias reglas y su propia prueba, más abajo. */
  tiles: Array.from(s.querySelectorAll("div.grid > *"))
    .filter((el) => el.id !== "videollamada-wrap")
    /* La tarjeta de la clase en vivo va dentro de un envoltorio `contents`
       para poder repintarla sola: para el grid la celda sigue siendo la
       tarjeta, y acá también tiene que serlo — leyendo el envoltorio,
       «Sesión en vivo» saldría siempre como un acceso sin enlace. */
    .map((el) => (el.id === "sesion-wrap" && el.firstElementChild) || el)
    .map((el) => ({
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

  /* El orden es el de las preguntas que uno se hace al entrar: qué pasa AHORA,
     qué me pusieron con fecha, qué hago por mi cuenta, dónde juego, dónde me
     mido, y al final mi cuenta. "Aprender" va antes que "Jugar y competir"
     porque esto es una academia.

     Y "Herramientas" NO está: a la alumna sus dos accesos le salen en
     mantenimiento, así que el grupo entero era un encabezado con dos cuadros
     grises. Un grupo del que no queda ni un acceso utilizable no se pinta. */
  igual("los grupos, en su orden", grupos.map((g) => g.titulo),
    ["Clase en vivo", "Lo que te pone tu profesor", "Aprender", "Jugar y competir",
     "Tu cuenta"]);
  /* Que no se pinte es que NO ESTÁ, no que esté escondido con una clase: un
     enlace invisible pero presente sigue siendo una parada de tabulador. */
  igual("y los accesos de ese grupo no quedaron escondidos en la página",
    await page.evaluate(() => document.querySelectorAll(
      "#tile-grid [href='lector-planilla.html'], #tile-grid [href='partidas.html']").length), "0");
  /* El lector de planilla y la guía del profesor son SOLO de administración
     (`soloAdmin`), que es otra cosa que estar en mantenimiento: se QUITAN, no
     se apagan. Acá lo que importa es que no quede ni un enlace en la grilla,
     escondido o no — un enlace invisible pero presente sigue siendo una parada
     de tabulador. */
  igual("ni el lector de planilla ni la guía del profesor, por ninguna parte",
    await page.evaluate(() => document.querySelectorAll(
      "#tile-grid [href='lector-planilla.html'], #tile-grid [href='guia-del-profesor-accesible.html']").length), "0");
  /* Lo que tiene FECHA va junto y arriba: tareas y exámenes son lo mismo desde
     el lado del alumno —te lo pone otra persona y vence—, y estaban partidos
     entre "Aprender" y "Evaluaciones". El rótulo dice lo que las dos tienen en
     común, que es lo que no se deduce de sus nombres. */
  igual("lo que te ponen con fecha va junto, y de segundo",
    grupo(grupos, "Lo que te pone tu profesor").tiles.map((t) => t.enlace),
    ["tareas.html", "examenes.html"]);
  /* Por índice a propósito: que vaya PRIMERA es el punto. Y se mira la
     etiqueta y no el href, porque sin clase abierta esa tarjeta está
     bloqueada y no tiene ninguno — eso tiene su propia prueba más abajo. */
  igual("«Clase en vivo» lleva un solo acceso, y es la sesión en vivo",
    grupos[0].tiles.map((t) => t.etiqueta), ["Sesión en vivo"]);
  /* Primero donde se juega contra otra persona, después el torneo, y de último
     lo que se MIRA. Y «Racha táctica» NO está: ya es lo primero que hay dentro
     de juegos.html, y un mismo destino dos veces en el panel es el error que ya
     se cometió con «Torneos». */
  igual("Jugar y competir", grupo(grupos, "Jugar y competir").tiles.map((t) => t.enlace),
    ["juegos.html", "torneos.html", "tv.html", "tablero.html", "logros.html"]);
  igual("y la racha táctica no se ofrece dos veces: en el panel ya no",
    grupos.flatMap((g) => g.tiles).filter((t) => t.enlace === "racha-tactica.html").length, "0");
  /* Dentro de Aprender, el orden es el del trabajo de todos los días: lo que se
     hace, lo que se repasa de un vistazo, el curso entero y al final la
     lectura. */
  igual("Aprender: lo que uno hace por su cuenta, ya sin Tareas",
    grupo(grupos, "Aprender").tiles.map((t) => t.enlace),
    ["entreno/index.html", "entreno/estudio.html", "cursos/academia/index.html",
     "articulos.html"]);
  /* Los dos diagnósticos son SOLO de administración: son las dos pruebas con
     las que el sitio ubica el nivel de alguien, y sus bancos son archivos
     estáticos — cuanta más gente las resuelve por su cuenta, menos miden. Y no
     alcanza con que el grupo no salga en la lista de arriba: lo que importa es
     que no quede ni un enlace a esas dos páginas en la grilla, escondido o no. */
  igual("a la alumna no se le ofrece ningún diagnóstico",
    grupos.flatMap((g) => g.tiles)
      .filter((t) => /diagnostico|arbitraje/i.test((t.enlace || "") + " " + (t.etiqueta || "")))
      .map((t) => t.enlace), []);
  igual("y tampoco escondido en la página",
    await page.evaluate(() => document.querySelectorAll(
      "#tile-grid [href*='diagnostico'], #tile-grid [href*='arbitraje']").length), "0");
  /* "Cerrar sesión" salió del grid: ya está en la cabecera, que es donde se
     busca, y era la única ACCIÓN entre un grid de lugares a los que ir. Un
     destino repetido en el panel ya había dado problemas con "Torneos". */
  /* «Mis pagos» ya no está en el panel de nadie: las mensualidades son cosa de
     la casa, no de quien entra a entrenar. La página sigue enseñándole sus
     recibos a quien entre por la dirección — lo que se quitó es el camino. */
  igual("Tu cuenta, en su orden",
    grupo(grupos, "Tu cuenta").tiles.map((t) => t.etiqueta),
    ["Informes", "Configuración"]);
  igual("y a la alumna no se le ofrecen los cobros por ninguna parte",
    grupos.flatMap((g) => g.tiles).filter((t) => /cobros\.html/.test(t.enlace || "")).length, "0");
  igual("«Cerrar sesión» no está dos veces: en el grid ya no",
    grupos.flatMap((g) => g.tiles).filter((t) => /Cerrar sesión/.test(t.etiqueta2)).length, "0");
  igual("y sigue estando en la cabecera, que es de donde no se movió",
    await page.evaluate(() => !!document.getElementById("logout-btn")), "true");

  // Lo apagado, que es lo que se pidió: apagado para ELLA.
  const apagados = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#tile-grid [aria-disabled=true]"))
      .filter((el) => !el.closest("#videollamada-wrap") && !el.closest("#sesion-wrap"))
      .map((el) => ({
      etiqueta: el.querySelector("span > span").textContent,
      enlace: el.getAttribute("href"),
      tag: el.tagName,
      texto: el.textContent,
    })));
  /* Ya no queda ninguno a la vista: los dos en mantenimiento se fueron con su
     grupo, y el tercero —«Mis pagos»— se fue del panel entero. Si mañana vuelve
     a haber uno, tiene que seguir cumpliendo las dos reglas de abajo: ni enlace
     ni botón, y con su razón escrita. */
  igual("no le queda ningún acceso apagado a la vista",
    apagados.map((a) => a.etiqueta).sort(), []);
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

  /* Tampoco a quien da clase: los diagnósticos son de administración y ya. A
     ella se los aplica administración, no los resuelve por su cuenta — y su
     banco es el mismo que el de sus alumnos. */
  igual("a la profesora tampoco se le ofrece ningún diagnóstico",
    grupos.flatMap((g) => g.tiles)
      .filter((t) => /diagnostico|arbitraje/i.test((t.enlace || "") + " " + (t.etiqueta || "")))
      .map((t) => t.enlace), []);
  /* El rótulo del grupo tiene dos públicos, igual que la descripción de un
     tile: del otro lado del escritorio, lo que te ponen es lo que mandas. */
  igual("y el grupo con fecha le habla de sus alumnos, no de su profesor",
    grupos.map((g) => g.titulo).filter((x) => /Lo que/.test(x)), ["Lo que le pones a tus alumnos"]);
  igual("a ella «Herramientas» sí se le pinta: sus accesos funcionan",
    grupos.map((g) => g.titulo).includes("Herramientas"), "true");
  const apagados = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#tile-grid [aria-disabled=true]"))
      .filter((el) => !el.closest("#videollamada-wrap") && !el.closest("#sesion-wrap"))
      .map((el) => el.querySelector("span > span").textContent));
  igual("a ella no se le apaga NADA: no hay mantenimiento que le aplique ni tarjetas en espera",
    apagados, []);
  /* El lector de planilla TODAVÍA NO FUNCIONA, y a ella le salía como un acceso
     normal: `mantenimientoAlumno` solo lo apagaba para el alumnado. Ahora es
     `soloAdmin`, igual que la guía del profesor, así que a quien da clase se le
     QUITAN — no se le apagan: una tarjeta gris dice «esto vuelve», y lo que se
     quiere decir es que no es suyo. */
  igual("las herramientas le quedan abiertas",
    grupo(grupos, "Herramientas").tiles.map((t) => t.enlace),
    ["partidas.html", "planes.html", "asistencia.html", "subgrupos.html"]);
  igual("y ni el lector de planilla ni la guía le quedan escondidos en la página",
    await page.evaluate(() => document.querySelectorAll(
      "#tile-grid [href='lector-planilla.html'], #tile-grid [href='guia-del-profesor-accesible.html']").length), "0");

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
  const gruposProfe = await r.page.evaluate(LEER_GRILLA);
  const profe = descripciones(gruposProfe);
  const rotulosProfe = gruposProfe.map((g) => g.titulo);
  await r.ctx.close();

  // A la alumna, lo suyo.
  igual("a la alumna, Tareas le habla de lo que le mandaron",
    alumna["Tareas"], "Con fecha límite, y se llenan solas con lo que entrenas");
  igual("y no le ofrece asignarle material a unos alumnos que no tiene",
    /tus alumnos/i.test(alumna["Tareas"]), "false");
  igual("a la alumna, Informes es lo suyo", alumna["Informes"], "Tu progreso y estadísticas");

  // A quien da clase, lo suyo.
  igual("a la profesora, Tareas le habla de asignar",
    profe["Tareas"], "Pide cantidades y la tarea se llena sola con lo que entrenan");
  igual("Informes es el de sus alumnos", profe["Informes"], "El progreso de tus alumnos y los informes a la casa");
  igual("los torneos los arma ella", profe["Torneos"], "Arma torneos para tus alumnos, con sus rondas y su tabla");
  igual("y el rival de Juegos también", profe["Juegos"], "Crazyhouse y otras modalidades — arma las partidas de tus alumnos");
  igual("la sesión en vivo es el tablero de SU clase", profe["Sesión en vivo"], "El tablero que ve tu clase, en vivo");

  /* La regla general, que es la que atrapa al tile que todavía no existe. */
  const conTuProfesor = Object.entries(profe).filter(([, d]) => /tu profesor/i.test(d)).map(([k]) => k);
  igual("a quien da clase, NINGUNA tarjeta le habla de «tu profesor»", conTuProfesor, []);
  /* Y tampoco ningún RÓTULO de grupo, que es texto de pantalla igual que la
     descripción de un tile — desde que uno de ellos nombra a quien da la clase,
     olvidarle el `titleProfe` al siguiente pondría en el panel de la profesora
     un encabezado que habla de SU profesor. */
  igual("ni ningún rótulo de grupo",
    rotulosProfe.filter((x) => /tu profesor/i.test(x)), []);

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
  /* La otra mitad de `soloAdmin`: a administración SÍ se le pintan el lector de
     planilla y la guía del profesor. Escondérselos también la dejaría sin forma
     de probar el lector para saber cuándo vuelve, y sin la guía, que es suya. */
  igual("y coordinando no aparece «Mis pagos» sino Cobros, en Herramientas",
    grupo(grupos, "Herramientas").tiles.map((t) => t.enlace),
    ["lector-planilla.html", "partidas.html", "planes.html", "asistencia.html", "subgrupos.html",
     "guia-del-profesor-accesible.html",
     "coordinacion.html", "solicitudes.html", "formularios.html", "cobros.html"]);
  /* La otra mitad de que los diagnósticos sean solo de administración: que a
     administración SÍ se le pinten. Escondérselos también los dejaría sin
     ninguna puerta desde el panel, que es lo contrario de lo que se pidió — y
     el de arbitraje le lleva a SU página, la que trae la revisión de los
     exámenes del público y el detalle pregunta por pregunta. */
  igual("a administración los dos diagnósticos sí se le pintan",
    grupo(grupos, "Mide tu nivel").tiles.map((t) => t.enlace),
    ["entreno/diagnostico.html", "arbitraje.html"]);
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
/* `por_actividad` iba en {} con 80 ejercicios al lado, que es imposible: el
   doble estaba incompleto. Importa desde que el panel lo usa para saber si el
   alumno ya arrancó — con el {} de antes, a Ana la habría tratado como recién
   llegada teniendo 80 ejercicios hechos. Suman los 80. */
const RACHA_ANA = [{ dias_activos: 12, racha_actual: 4, racha_record: 9, total_ejercicios: 80,
                     tipos_distintos: 5, hoy_ejercicios: 2, primer_dia: "2026-01-01",
                     por_actividad: { "4x4": 40, mates: 25, temas: 15 } }];

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
    const a = document.getElementById("pendientes-aviso");
    return {
      display: getComputedStyle(a).display,
      titulo: document.getElementById("pendientes-aviso-titulo").textContent,
      texto: document.getElementById("pendientes-aviso-texto").textContent,
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
    const ids = ["pendientes-aviso", "seguir-curso", "progreso-alumno", "tile-grid"];
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
    titulo: document.getElementById("pendientes-aviso-titulo").textContent,
    texto: document.getElementById("pendientes-aviso-texto").textContent,
    rojo: /ring-red-500/.test(document.getElementById("pendientes-aviso").className),
  }));
  igual("sin vencidas, anuncia la más próxima", visto.texto,
    "La más próxima es «Finales de rey y peón», vence mañana.");
  igual("y no se pinta en rojo: en rojo permanente se deja de ver", visto.rojo, "false");
  await r.ctx.close();

  // --- Sin ninguna tarea: la franja no existe en pantalla ---
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {},
    { rpc: { informes_resumen_alumnos: RESUMEN_ANA, progreso_dias_y_racha: RACHA_ANA } });
  igual("sin tareas y con el entrenamiento ya empezado, la franja NO se destapa",

    await r.page.evaluate(() => getComputedStyle(document.getElementById("pendientes-aviso")).display), "none");
  igual("y sin ningún curso a medias, tampoco «Continúa donde ibas»",
    await r.page.evaluate(() => getComputedStyle(document.getElementById("seguir-curso")).display), "none");
  await r.ctx.close();
}

/* La franja de "Estado de la clase" ocupaba el primer lugar de la página para
   decirle a un alumno fuera del horario —casi siempre— que NO pasa nada, y le
   empujaba las tareas hacia abajo. Ahora solo sale cuando tiene algo que decir.
   Las dos mitades de la condición importan: esconderla de más le quitaría a
   quien da clase el botón de iniciarla. */
/* Un examen de mentira en el estado que se quiera. `vence` y `termina` van en
   días desde hoy, para que la prueba no se pudra con el almanaque. */
function examen(id, titulo, estado, vence, termina) {
  const dia = (n) => new Date(Date.now() + n * 86400000).toISOString();
  return {
    id: id, alumno_id: "u-ana", titulo: titulo, estado: estado,
    vence_at: dia(vence), termina_at: termina === undefined ? null : dia(termina),
    minutos: 20, preguntas: 10, nota: null, profesor_nombre: "Karina Rojas",
  };
}
const MIN = 1 / 1440;   // un minuto, en días

async function franja(browser, tareas, examenes) {
  const r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: {
      tareas_con_avance: tareas,
      examenes_con_nota: examenes,
      informes_resumen_alumnos: RESUMEN_ANA,
      informes_cursos_alumnos: CURSOS_ANA,
      progreso_dias_y_racha: RACHA_ANA,
    },
  });
  const visto = await r.page.evaluate(() => {
    const a = document.getElementById("pendientes-aviso");
    return {
      display: getComputedStyle(a).display,
      titulo: document.getElementById("pendientes-aviso-titulo").textContent,
      texto: document.getElementById("pendientes-aviso-texto").textContent,
      cta: document.getElementById("pendientes-aviso-cta").textContent,
      rojo: /ring-red-500/.test(a.className),
      enlace: a.getAttribute("href"),
      icono: document.getElementById("pendientes-aviso-emoji").textContent,
    };
  });
  const errores = r.errores;
  await r.ctx.close();
  return { visto, errores };
}

/* Un examen asignado tiene reloj y UNA sola oportunidad, y el único aviso que
   sale es el push del momento en que se lo ponen: quien no lo vio no se entera
   nunca. Acá se comprueba que la franja lo diga, y sobre todo que NO lo trate
   como una tarea — `iniciar_examen()` rechaza el que se pasó de fecha, así que
   prometerle "todavía puedes" sería mentirle. */
async function pruebaExamenesEnLaFranja(browser) {
  console.log("\n=== Los exámenes también vencen, y la franja lo dice ===");

  // --- Solo exámenes por hacer: el título no habla de tareas que no tiene ---
  let { visto, errores } = await franja(browser, [], [examen("x1", "Finales", "asignado", 3), examen("x2", "Táctica", "asignado", 1)]);
  igual("con exámenes y sin tareas, la franja SE VE", visto.display !== "none", "true");
  igual("y cuenta exámenes, no tareas", visto.titulo, "Tienes 2 exámenes pendientes");
  igual("nombra el que vence antes, con lo que le espera dentro",
    visto.texto, "El examen «Táctica» vence mañana · 10 preguntas en 20 minutos.");
  /* Directo a rendirlo y no a una lista: es la misma decisión del aviso al
     celular — un examen tiene reloj y una sola oportunidad, así que buscarlo
     entre otros es un paso de más. */
  igual("y lleva DIRECTO a rendir ese, no a una lista", visto.enlace, "examen.html?id=x2");
  igual("con su propio botón", visto.cta, "Empezar el examen →");
  igual("y el icono acompaña a la línea: habla de un examen", visto.icono, "📝");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");

  // --- Las dos cosas a la vez ---
  ({ visto } = await franja(browser, tareasDeMentira(false), [examen("x1", "Finales", "asignado", 3)]));
  igual("con las dos, el título las cuenta a las dos", visto.titulo, "Tienes 3 tareas y 1 examen pendientes");
  igual("y manda la que vence antes, que acá es la tarea",
    visto.texto, "La más próxima es «Finales de rey y peón», vence mañana.");
  igual("y ahí el icono vuelve a ser el de tareas", visto.icono, "📋");

  // --- Un examen entregado no es un pendiente ---
  ({ visto } = await franja(browser, [], [examen("x9", "Ya lo hice", "entregado", -3)]));
  igual("un examen ya entregado no destapa la franja", visto.display, "none");

  // --- El que se pasó de fecha: ya NO se puede rendir ---
  ({ visto } = await franja(browser, [], [examen("x3", "Aperturas", "asignado", -2)]));
  igual("un examen que se pasó de fecha pinta la franja en rojo", visto.rojo, "true");
  igual("y dice que ya no se puede, sin prometer lo que no es",
    visto.texto, "Se te pasó la fecha del examen «Aperturas» y ya no se puede rendir. Habla con tu profe.");
  igual("NO le dice «todavía puedes», que es lo que sí vale para una tarea",
    /todavía puedes/i.test(visto.texto), "false");
  /* Y no lo manda a rendirlo: esa pantalla lo va a rechazar. El enlace lleva a
     donde el texto acaba de nombrar. */
  igual("y no lo manda a una pantalla que lo va a rechazar", visto.enlace, "examenes.html");
  igual("ni se cuenta como algo que pueda hacer", visto.titulo, "Hay algo que tienes que saber");

  // --- Con el reloj corriendo: es lo más urgente que hay en el panel ---
  ({ visto } = await franja(browser, tareasDeMentira(true),
    [examen("x4", "Medio juego", "en_curso", -1, 10 * MIN)]));
  igual("un examen a medias con el reloj corriendo manda sobre una tarea vencida",
    visto.texto, "El examen «Medio juego» lo tienes a medias y el reloj corre. Entra a terminarlo.");
  igual("y lleva directo a terminarlo", visto.enlace, "examen.html?id=x4");
  igual("con su botón", visto.cta, "Seguir el examen →");
  /* Los minutos que quedan NO se dicen acá: el reloj del examen sale de la hora
     del SERVIDOR y en esta página solo está la del navegador. Un número sacado
     del reloj de la computadora podría decirle que le quedan diez minutos
     cuando ya se le acabaron. */
  igual("y no se inventa cuántos minutos quedan, que eso lo sabe el servidor",
    /minutos? (te )?qued|quedan \d/i.test(visto.texto), "false");

  // --- Al que se le acabó el tiempo tampoco se le ofrece seguir ---
  ({ visto } = await franja(browser, [], [examen("x5", "Cálculo", "en_curso", -1, -1 * MIN)]));
  igual("si el reloj ya se acabó, no se le ofrece seguir",
    visto.enlace, "examenes.html");
  igual("ni se cuenta como pendiente", visto.titulo, "Hay algo que tienes que saber");

  // --- Congelado: no depende de él ---
  ({ visto } = await franja(browser, [], [examen("x6", "Estrategia", "congelado", 2)]));
  igual("un examen congelado lo dice y no lo manda a intentarlo",
    visto.texto, "El examen «Estrategia» quedó congelado a la mitad. Tu profe tiene que volver a abrirlo.");
  igual("y lo lleva a su lista", visto.enlace, "examenes.html");

  /* Si la mitad de los exámenes falla, las tareas se siguen mostrando: quedarse
     sin franja por la consulta que falló sería perder también la que sí se
     pudo leer. */
  const r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: { tareas_con_avance: tareasDeMentira(false), informes_resumen_alumnos: RESUMEN_ANA,
           informes_cursos_alumnos: CURSOS_ANA, progreso_dias_y_racha: RACHA_ANA },
  });
  igual("sin exámenes, la franja de siempre sigue igual",
    await r.page.evaluate(() => document.getElementById("pendientes-aviso-titulo").textContent),
    "Tienes 3 tareas pendientes");
  await r.ctx.close();
}

/* ---------- Por dónde empezar ----------
   Un alumno recién invitado no tiene ninguna tarea ni ningún examen —nadie se
   los puso todavía— así que la franja se le quedaba vacía y el panel era un
   directorio de veintitantos lugares sin ninguna pista. Ahí va ahora el
   siguiente paso.

   Todo lo que se rompe acá se rompe callado: el paso se ve perfecto mandando
   a una página donde el alumno no puede hacer nada que cuente, y entonces no
   se apaga nunca y al día siguiente le dice exactamente lo mismo. */

// Racha de quien todavía no ha resuelto NADA. El diagnóstico sí es una fila de
// training_progress, así que va en por_actividad: es justo lo que hay que
// descontar para saber si arrancó o no.
function rachaSinEjercicios(conDiagnostico) {
  return [{ dias_activos: 0, racha_actual: 0, racha_record: 0,
            total_ejercicios: conDiagnostico ? 1 : 0, tipos_distintos: conDiagnostico ? 1 : 0,
            hoy_ejercicios: 0, primer_dia: null,
            por_actividad: conDiagnostico ? { diagnostico: 1 } : {} }];
}

/* Un detalle de diagnóstico con las áreas en el porcentaje que se pida.
   `resumir()` calcula el porcentaje como logrado/peso, así que con peso 100 el
   número que se pasa ES el porcentaje.

   LAS NUEVE ÁREAS SE DECLARAN SIEMPRE, y salen del propio banco y no de una
   lista escrita acá. La primera versión de esta prueba nombraba cuatro y dejaba
   las otras cinco fuera: `resumir()` le pone peso 0 a la que no está, o sea 0%,
   así que quedaban MÁS flojas que las que la prueba ponía flojas a propósito y
   el panel —con razón— ofrecía una de ellas. La prueba fallaba sobre una página
   que estaba bien. Leyéndolas de PlanEntrenamiento, una décima área tampoco
   podría colarse en cero sin que nadie lo note. */
/* El primer recurso que CUENTA de cada área, leído del plan de verdad y del
   catálogo de Tareas. La prueba no puede escribir el enlace esperado a mano:
   al cambiar el plan —que es una decisión editorial— fallaría sobre una página
   que está bien, y renumerar expectativas a mano es como se dejan de correr las
   pruebas. Que ese enlace lleve a algo que existe lo comprueba
   verificar-plan-recursos.js, que es su trabajo. */
const PRIMER_RECURSO = (() => {
  const g = { window: {} };
  const leer = (f) => new Function("window", require("fs").readFileSync(
    require("path").join(__dirname, "..", f), "utf8"))(g.window);
  leer("js/plan-entrenamiento.js"); leer("js/material-plataforma.js");
  const PE = g.window.PlanEntrenamiento, MP = g.window.MaterialPlataforma;
  const out = {};
  for (const a of PE.AREAS) {
    out[a.id] = (a.recursos || []).find((r) => {
      const h = MP.HERRAMIENTAS.find((t) => t.href === r.href.split("?")[0]);
      return h && (h.metas || []).includes("cantidad");
    }) || null;
  }
  return out;
})();

const AREAS_DEL_BANCO = (() => {
  const g = { window: {} };
  const fn = new Function("window", require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "plan-entrenamiento.js"), "utf8"));
  fn(g.window);
  return g.window.PlanEntrenamiento.AREAS.map((a) => a.id);
})();

function diagnosticoCon(porcentajes) {
  const areas = {};
  for (const id of AREAS_DEL_BANCO) {
    const pct = porcentajes[id] === undefined ? 100 : porcentajes[id];
    areas[id] = { peso: 100, logrado: pct, aciertos: 0, total: 7, nosabe: 0 };
  }
  return { areas: areas, perfil: {} };
}

async function pruebaPrimerPaso(browser) {
  console.log("\n=== Por dónde empezar: el siguiente paso ===");

  const leer = (page) => page.evaluate(() => {
    const a = document.getElementById("pendientes-aviso");
    return {
      display: getComputedStyle(a).display,
      titulo: document.getElementById("pendientes-aviso-titulo").textContent,
      texto: document.getElementById("pendientes-aviso-texto").textContent,
      cta: document.getElementById("pendientes-aviso-cta").textContent,
      enlace: a.getAttribute("href"),
      rojo: /ring-red-500/.test(a.className),
    };
  });

  // --- Recién llegado: sin tareas, sin exámenes y sin diagnóstico ---
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: { informes_resumen_alumnos: RESUMEN_ANA, progreso_dias_y_racha: rachaSinEjercicios(false) },
  });
  let v = await leer(r.page);
  // Se mide el display que calcula el navegador, no el atributo: la lección que
  // dejó el cartel de instalar la app.
  igual("a quien recién llega la franja SE LE VE de verdad", v.display !== "none", "true");
  igual("y le ofrece el diagnóstico", v.enlace, "entreno/diagnostico.html");
  igual("con su propio título, que no promete pendientes que no tiene", v.titulo, "Empieza por acá");
  igual("no se pinta en rojo: una sugerencia no es una entrega vencida", v.rojo, "false");
  igual("sin errores en consola", r.errores.join(" | ") || "ninguno", "ninguno");
  await r.ctx.close();

  // --- Lo empezó y lo dejó a medias ---
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: {
      informes_resumen_alumnos: RESUMEN_ANA,
      progreso_dias_y_racha: rachaSinEjercicios(false),
      informes_diagnosticos_alumnos: [{ student_id: "u-ana", detalle: null, fecha: null,
                                        a_medias_pregunta: 23, a_medias_fecha: new Date().toISOString() }],
    },
  });
  v = await leer(r.page);
  igual("si lo dejó a medias, le dice por dónde iba", v.texto.includes("pregunta 23"), "true");
  /* Y NO le promete que se retoma donde iba: una prueba de una versión anterior
     se descarta a propósito (VERSION en entreno/diagnostico.html), así que
     prometerlo sería mentirle justo a quien vuelve confiando en eso. */
  igual("pero no le promete que lo retoma donde lo dejó",
    /retoma|donde ibas|no hay que empezar/i.test(v.texto), "false");
  await r.ctx.close();

  /* --- Ya lo rindió: LA COMPROBACIÓN QUE IMPORTA ---
     El destino tiene que ser una página donde el trabajo CUENTE y, si la página
     sabe recortar, con su recorte puesto. Mandarlo a la portada de un curso lo
     dejaría leyendo un temario, sin escribir una fila en training_progress, y
     mañana la franja le diría exactamente lo mismo — el paso no se apagaría
     NUNCA y nadie se enteraría. */
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: {
      informes_resumen_alumnos: RESUMEN_ANA,
      progreso_dias_y_racha: rachaSinEjercicios(true),
      informes_diagnosticos_alumnos: [{ student_id: "u-ana", fecha: new Date().toISOString(),
        detalle: diagnosticoCon({ finales: 10, mate: 30, tactica: 90, reglas: 95 }),
        a_medias_pregunta: null, a_medias_fecha: null }],
    },
  });
  v = await leer(r.page);
  igual("haber rendido el diagnóstico NO cuenta como haber entrenado", v.display !== "none", "true");
  /* LO QUE MÁS IMPORTA: el enlace lleva su RECORTE. Sin él cae en la lista de
     ochenta temas y le deja al alumno el trabajo de buscar, que es justo lo que
     este paso viene a evitar — la misma razón por la que el enlace de una tarea
     lleva el suyo. Y el recorte no se escribe acá: es el que el plan tenga
     puesto para esa área, comprobado aparte contra el banco por
     verificar-plan-recursos.js. */
  igual("ofrece el área más floja de las que tienen dónde practicar",
    v.enlace, PRIMER_RECURSO.finales.href);
  igual("y el enlace lleva su recorte, no la lista entera",
    v.enlace.includes("?"), "true");
  igual("y nombra ESA área", v.texto.toLowerCase().includes("finales"), "true");
  igual("no dice «lo más flojo»: sería mentira, y por eso dice «señala un hueco»",
    /m[áa]s flojo|lo peor|tu punto m[áa]s/i.test(v.texto), "false");
  igual("el botón nombra lo que va a abrir, no la página pelada",
    v.cta, PRIMER_RECURSO.finales.texto + " →");
  igual("sin errores en consola", r.errores.join(" | ") || "ninguno", "ninguno");
  await r.ctx.close();

  // --- Ya arrancó: no hay nada que guiar, y el panel se calla ---
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: {
      informes_resumen_alumnos: RESUMEN_ANA, progreso_dias_y_racha: RACHA_ANA,
      informes_diagnosticos_alumnos: [{ student_id: "u-ana", fecha: new Date().toISOString(),
        detalle: diagnosticoCon({ mate: 30 }), a_medias_pregunta: null, a_medias_fecha: null }],
    },
  });
  igual("a quien ya resolvió ejercicios no se le repite el paso uno",
    await r.page.evaluate(() => getComputedStyle(document.getElementById("pendientes-aviso")).display), "none");
  await r.ctx.close();

  /* --- Y lo que VENCE manda sobre la sugerencia ---
     Una fecha le gana siempre a un consejo. Sin esto, a un alumno nuevo con una
     tarea ya puesta el panel le escondería la tarea detrás del primer paso. */
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: {
      tareas_con_avance: tareasDeMentira(false),
      informes_resumen_alumnos: RESUMEN_ANA,
      progreso_dias_y_racha: rachaSinEjercicios(false),
    },
  });
  v = await leer(r.page);
  igual("con una tarea puesta, manda la tarea y no el primer paso", v.enlace, "tareas.html");
  igual("y el título es el de siempre", v.titulo, "Tienes 3 tareas pendientes");
  await r.ctx.close();
}

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
    const orden = ["session-status-card", "pendientes-aviso", "seguir-curso"].map((id) => document.getElementById(id));
    return orden.filter(visible).map((el) => el.id)[0];
  });
  igual("lo primero que ve es su tarea, no un aviso de que no pasa nada", primero, "pendientes-aviso");
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
    /* Las tareas NO se cuentan por la columna `tareas.estado`, que quedó sin
       uso y nunca vale 'vencida': las cuenta panel_profesor() con
       tareas_con_avance(), a partir de los renglones. Medido con los datos
       reales, la diferencia eran dos tareas que el alumno YA había terminado
       contadas como pendientes Y vencidas — el único número que le pide al
       profesor hacer algo, inflado y sin que nada fallara. Acá se comprueba lo
       que le toca al navegador: que pinte lo que manda la base y no rehaga la
       cuenta por su lado. */
    rpc: { panel_profesor: [{ alumnos: 29, activos_7d: 11, tareas_pendientes: 6, tareas_vencidas: 2,
                              tareas_puestas: 9, clases_30d: 8, clases_dadas: 21,
                              con_diagnostico: 29, con_plan: 29 }] },
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
  /* Con todo lo suyo andando, la franja de "por dónde empezar" no se destapa:
     lo que se le pinta son los números, no un consejo. */
  igual("y con todo andando, ninguna franja de primer paso encima",
    await page.evaluate(() => getComputedStyle(document.getElementById("pendientes-aviso")).display), "none");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  // Con todo en cero no hay nada que perseguir: el rojo se va.
  const r = await panel(browser, [PROFE], "u-profe", {}, {
    rpc: { panel_profesor: [{ alumnos: 4, activos_7d: 4, tareas_pendientes: 0, tareas_vencidas: 0,
                              tareas_puestas: 3, clases_30d: 1, clases_dadas: 1,
                              con_diagnostico: 4, con_plan: 4 }] },
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

  await pruebaPrimerPasoProfesor(browser);
}

/* ---------- Por dónde empezar, del lado del que da clase ----------
   Un entrenador nuevo abre el panel, ve cuatro números en cero y un directorio
   de accesos, y nada le dice cuál es el siguiente paso. En los datos se ve
   igual: el profesor con más alumnos lleva decenas de entradas y ni una tarea,
   ni una clase, ni un plan.

   Son seis peldaños y se distinguen mal entre ellos, que es justo por lo que se
   prueban uno por uno: sin alumnos no hay NADA que hacer y no hay página que
   ofrecerle; sin diagnóstico no hay plan POSIBLE; y "ninguna tarea puesta" no
   es lo mismo que "ninguna pendiente" —con todas hechas las pendientes también
   son cero—, que es el error fácil de esta escalera.

   Se mide el display que calcula el navegador y no el atributo: la lección que
   dejó el cartel de instalar la app. */
async function pruebaPrimerPasoProfesor(browser) {
  console.log("\n=== Por dónde empezar, vista por quien da clase ===");

  const leer = async (fila, quien) => {
    const perfil = quien === "u-admin" ? ADMIN : PROFE;
    const r = await panel(browser, [perfil], perfil.id, {}, {
      rpc: { panel_profesor: [Object.assign(
        { alumnos: 10, activos_7d: 10, tareas_pendientes: 0, tareas_vencidas: 0,
          tareas_puestas: 5, clases_30d: 1, clases_dadas: 3,
          con_diagnostico: 10, con_plan: 10 }, fila)] },
    });
    const v = await r.page.evaluate(() => {
      const el = document.getElementById("pendientes-aviso");
      return {
        display: getComputedStyle(el).display,
        titulo: document.getElementById("pendientes-aviso-titulo").textContent,
        texto: document.getElementById("pendientes-aviso-texto").textContent,
        // El href tal cual está escrito, no el resuelto: lo que importa es a
        // qué página del sitio manda.
        destino: el.getAttribute("href"),
        cta: document.getElementById("pendientes-aviso-cta").textContent,
        ctaVisible: getComputedStyle(document.getElementById("pendientes-aviso-cta")).display !== "none",
        rojo: /ring-red-500/.test(el.className),
      };
    });
    await r.ctx.close();
    return v;
  };

  /* 1. Sin alumnos asignados no funciona nada de lo suyo, y hoy eso se ve como
     cuatro ceros sin explicación: parece roto y no lo está. Es el estado en que
     están 3 de los 7 del equipo docente. */
  let v = await leer({ alumnos: 0, activos_7d: 0, con_diagnostico: 0, con_plan: 0,
                       tareas_puestas: 0, clases_dadas: 0 });
  igual("sin alumnos, la franja se ve de verdad", v.display !== "none", "true");
  igual("y dice que todavía no tiene ninguno", /Todavía no tienes alumnos/.test(v.titulo), "true");
  igual("explicando que no está roto, que es lo que parece", /no es que estén rotos/.test(v.texto), "true");
  igual("y quién se los asigna", /quien administra/i.test(v.texto), "true");
  /* Un <a> sin href no recibe el foco ni se anuncia como enlace. Ofrecerle
     admin.html a un profesor sería mandarlo a una página que la base le niega
     — un botón que va a fallar es peor que ninguno. */
  igual("a un profesor no se le ofrece ninguna página que le vayan a negar", v.destino, "null");
  igual("ni un botón que no lleva a ningún lado", v.ctaVisible, "false");
  igual("y nunca en rojo: esto no se venció", v.rojo, "false");

  // La misma situación, pero quien administra SÍ puede resolverla ahí mismo.
  v = await leer({ alumnos: 0, activos_7d: 0, con_diagnostico: 0, con_plan: 0,
                   tareas_puestas: 0, clases_dadas: 0 }, "u-admin");
  igual("a quien administra sí se le ofrece el panel donde se asignan", v.destino, "admin.html");
  igual("con su botón", v.ctaVisible, "true");

  /* 2. Sin diagnóstico no hay plan que armar: es el primer cuello de verdad, y
     el mensaje NO puede ser «0 de 0 tienen plan», que no le pide nada a nadie. */
  v = await leer({ con_diagnostico: 0, con_plan: 0 });
  igual("con alumnos y sin ningún diagnóstico, ahí empieza todo",
    /Empieza por el diagnóstico/.test(v.titulo), "true");
  igual("y se dice cuántos son los suyos", /tus 10 alumnos/.test(v.texto), "true");
  igual("nombrando lo que sale de ahí: el plan de cada uno", /plan de entrenamiento/.test(v.texto), "true");
  igual("y se manda a donde se asigna", v.destino, "tareas.html");

  // 3. Con diagnósticos y sin planes compartidos: el caso de hoy.
  v = await leer({ con_diagnostico: 8, con_plan: 0 });
  igual("con 8 diagnósticos y ningún plan, lo dice con los dos números",
    /0 de los 8/.test(v.texto), "true");
  igual("y dice quién se lo pierde", /ni ellos ni su casa/.test(v.texto), "true");
  igual("mandando a Informes, que es donde se comparten", v.destino, "informes.html");

  // A uno solo le falta: la frase va en singular.
  v = await leer({ con_diagnostico: 8, con_plan: 7 });
  igual("con uno solo pendiente, se dice en singular", /el otro no lo ve/.test(v.texto), "true");
  igual("y no en plural", /los otros/.test(v.texto), "false");

  /* 4. El error fácil de la escalera: mirar las tareas PENDIENTES. Con todas
     hechas también son cero, y son dos situaciones muy distintas — a quien ya
     mandó cinco tareas no se le dice que ponga la primera. */
  v = await leer({ tareas_puestas: 0 });
  igual("sin ninguna tarea puesta, se le pide la primera",
    /Ponles la primera tarea/.test(v.titulo), "true");
  igual("contando lo que la hace valer: se llena sola", /se llena sola/.test(v.texto), "true");
  igual("y se manda a armarla", v.destino, "tareas.html");

  v = await leer({ tareas_puestas: 5, tareas_pendientes: 0 });
  igual("pero con cinco puestas y ninguna pendiente NO se le pide la primera",
    /Ponles la primera tarea/.test(v.titulo), "false");

  /* 5. Lo mismo con las clases: `clases_30d` no distingue "nunca" de "este mes
     no", así que el peldaño mira el total de siempre. */
  v = await leer({ clases_dadas: 0, clases_30d: 0 });
  igual("sin ninguna clase dada, se le dice dónde se da",
    /no has dado ninguna clase/.test(v.titulo), "true");
  igual("explicando que se abre sola", /se abre sola/.test(v.texto), "true");
  igual("y se manda al tablero de la clase", v.destino, "sesion.html");

  v = await leer({ clases_dadas: 4, clases_30d: 0 });
  igual("pero a quien ya dio cuatro, aunque no este mes, no se le dice eso",
    /no has dado ninguna clase/.test(v.titulo), "false");

  // 6. Con todo lo demás andando, lo que queda es el goteo de diagnósticos.
  v = await leer({ con_diagnostico: 8, con_plan: 8 });
  igual("con los planes al día, lo que queda son los diagnósticos que faltan",
    /Faltan 2 alumnos/.test(v.texto), "true");

  /* Todo al día: NO se pinta nada. Un cartel que se repite deja de leerse — la
     misma decisión que las dos franjas del alumno y que la bitácora. */
  v = await leer({});
  igual("y con todo al día la franja no se destapa", v.display, "none");
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
    // La tarjeta de la clase en vivo vive dentro de un envoltorio `contents`,
    // que no tiene caja propia: lo que se mide es la tarjeta.
    const caja = (sec) => {
      const el = sec.querySelector("div.grid > *");
      return ((el.id === "sesion-wrap" && el.firstElementChild) || el).getBoundingClientRect().width;
    };
    return { vivo: caja(secciones[0]), otro: caja(secciones[1]) };
  });
  igual("«Sesión en vivo» se pinta ancha, no como un cuadrito más", anchos.vivo > anchos.otro * 2, "true");

  await ctx.close();
}


/* ---------------------------------------------------------------- videollamada
   El botón que va al lado de «Sesión en vivo» y lleva a la llamada del profe.

   Todo lo que se rompe acá se rompe callado, y siempre del mismo lado: el
   alumno. Un botón que se queda con el candado puesto cuando su profe ya está
   en clase se ve igual de bien que uno que funciona — y el alumno no tiene a
   quién preguntarle si es él o es la página. Al revés, un botón abierto sin
   clase lo manda a una llamada vacía.

   Por eso se miran los cuatro estados uno por uno y, sobre todo, el enlace que
   NO se debe abrir: el enlace lo escribe una persona, así que un `javascript:`
   guardado en la base no puede terminar en un href — es la misma regla que el
   nombre de un alumno en Informes. */
const LEER_BOTON = () => {
  const caja = document.getElementById("videollamada-wrap");
  if (!caja) return { hay: false };
  const el = caja.firstElementChild;
  if (!el) return { hay: false, vacio: true };
  // La tarjeta de al lado puede estar bloqueada —sin clase no es un <a>—,
  // así que se busca por su envoltorio y no por el href.
  const envoltorio = document.getElementById("sesion-wrap");
  const tarjeta = envoltorio && envoltorio.firstElementChild;
  const a = tarjeta && tarjeta.getBoundingClientRect(), b = el.getBoundingClientRect();
  return {
    hay: true,
    tag: el.tagName,
    href: el.getAttribute("href"),
    target: el.getAttribute("target"),
    rel: el.getAttribute("rel"),
    bloqueado: el.getAttribute("aria-disabled") === "true",
    texto: el.innerText.replace(/\s+/g, " ").trim(),
    // Se mide lo que calcula el navegador, no la clase.
    seVe: el.checkVisibility(),
    // Y que de verdad esté AL LADO DERECHO, que es donde se pidió.
    aLaDerecha: a ? b.left >= a.right - 1 && Math.abs(b.top - a.top) < 40 : null,
    // Ningún href colado en ninguna parte del botón.
    hrefs: Array.from(caja.querySelectorAll("[href]")).map((x) => x.getAttribute("href")),
  };
};

// El botón del profesor se pinta después de una consulta, así que se espera a
// que deje de decir "Cargando…" en vez de leerlo a medio camino.
async function botonListo(page) {
  await page.waitForFunction(() => {
    const c = document.getElementById("videollamada-wrap");
    return !c || !c.firstElementChild || !/Cargando|Viendo si/.test(c.firstElementChild.innerText);
  }, null, { timeout: 15000 });
  return page.evaluate(LEER_BOTON);
}

async function pruebaVideollamada(browser) {
  console.log("\n=== La videollamada de la clase ===");

  // 1. Sin clase abierta: con candado, y diciendo cuándo se abre.
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", { viewport: { width: 1280, height: 900 } }, datosAlumna(false));
  let b = await botonListo(r.page);
  igual("sin clase abierta, el botón está y se ve", b.hay && b.seVe, "true");
  igual("…y va al lado derecho de «Sesión en vivo»", b.aLaDerecha, "true");
  /* Bloqueado no es un enlace gris: sin href no recibe el foco del teclado ni
     promete un destino que no va a abrir. La misma regla de los accesos
     apagados de la grilla. */
  igual("…bloqueado, sin enlace y sin prometer destino", [b.tag, b.href, b.bloqueado], ["DIV", null, true]);
  igual("…y dice cuándo se abre, en vez de un candado sin explicación",
    /Se abre cuando tu profe empiece la clase/.test(b.texto), "true");
  await r.ctx.close();

  // 2. Con clase abierta y sala puesta: el enlace, y de quién es.
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", { viewport: { width: 1280, height: 900 } },
    Object.assign(datosAlumna(false), { clase_abierta: true, videollamada: "https://meet.google.com/abc-defg-hij" }));
  b = await botonListo(r.page);
  igual("con clase abierta, el botón lleva a la sala", [b.tag, b.href], ["A", "https://meet.google.com/abc-defg-hij"]);
  /* En otra pestaña y con rel: la clase sigue abierta detrás. Sin
     `noopener`, la página de la llamada puede tocar la que la abrió. */
  igual("…en otra pestaña y sin darle acceso a esta", [b.target, b.rel], ["_blank", "noopener noreferrer"]);
  igual("…diciendo a qué servicio entra", /Entrar a Meet/.test(b.texto), "true");
  /* Con varios profesores el botón puede llevar a la clase de otro, y eso no
     se adivina mirándolo. */
  igual("…y de quién es la llamada", /Con Karina Rojas/.test(b.texto), "true");
  await r.ctx.close();

  // 3. Hay clase, pero el profe no puso su enlace. NO es lo mismo que el caso
  //    1, y decir lo mismo dejaría al alumno esperando un botón que hoy no va
  //    a abrirse solo.
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {},
    Object.assign(datosAlumna(false), { clase_abierta: true, videollamada: null }));
  b = await botonListo(r.page);
  igual("hay clase pero sin enlace: sigue bloqueado", [b.tag, b.href, b.bloqueado], ["DIV", null, true]);
  igual("…y lo dice con todas las letras", /todavía no puso el enlace/.test(b.texto), "true");
  await r.ctx.close();

  // 4. Un enlace que no se debe abrir. Lo escribe una persona, así que la
  //    página no puede confiar en que sea un enlace.
  for (const malo of ["javascript:window.__colado=1", "http://meet.google.com/sin-cifrar", "  "]) {
    r = await panel(browser, [ALUMNA, PROFE], "u-ana", {},
      Object.assign(datosAlumna(false), { clase_abierta: true, videollamada: malo }));
    b = await botonListo(r.page);
    igual(`un enlace «${malo.trim() || "(vacío)"}» no se pinta en ningún href`,
      [b.bloqueado, b.hrefs.length], [true, 0]);
    await r.ctx.close();
  }

  // 5. A quien da clase no se le bloquea nada: él entra a la llamada ANTES de
  //    que la clase exista —se abre sola cuando llega alguien—, así que un
  //    candado ahí le cerraría la puerta por la que tiene que entrar primero.
  r = await panel(browser, [PROFE, ALUMNA], "u-profe", {}, { profesor_videollamada: [] });
  b = await botonListo(r.page);
  igual("la profesora sin sala: se le ofrece ponerla", [b.tag, b.href], ["A", "configuracion.html#videollamada"]);
  await r.ctx.close();

  r = await panel(browser, [PROFE, ALUMNA], "u-profe", {},
    { profesor_videollamada: [{ profesor_id: "u-profe", grupo: "", enlace: "https://zoom.us/j/123456789" }] });
  b = await botonListo(r.page);
  igual("la profesora con su sala: entra sin esperar a nadie",
    [b.tag, b.href, b.bloqueado], ["A", "https://zoom.us/j/123456789", false]);
  igual("…y se le nombra el servicio", /Entrar a Zoom/.test(b.texto), "true");
  await r.ctx.close();

  /* 5b. Varias salas: una por sede. Es el caso de un profesor que da en SJ y
     en CENFO — con un solo botón, el de SJ le servía también para entrar a la
     clase de CENFO, o sea a la que no era. */
  r = await panel(browser, [PROFE, ALUMNA], "u-profe", { viewport: { width: 1280, height: 900 } },
    { profesor_videollamada: [
      { profesor_id: "u-profe", grupo: "", enlace: "https://meet.google.com/todas" },
      { profesor_id: "u-profe", grupo: "SJ", enlace: "https://meet.google.com/sj" },
      { profesor_id: "u-profe", grupo: "CENFO", enlace: "https://zoom.us/j/cenfo" },
    ] });
  await botonListo(r.page);
  const varias = await r.page.evaluate(() => Array.from(
    document.querySelectorAll("#videollamada-wrap > *")).map((el) => ({
      href: el.getAttribute("href"),
      texto: el.innerText.replace(/\s+/g, " ").trim(),
    })));
  igual("con tres sedes se pintan tres botones", varias.length, "3");
  /* Los grupos primero y la general al final: la general es el respaldo —la
     reciben los grupos que no tengan sala propia— y arriba haría pensar que es
     la que manda. */
  igual("…los grupos primero y la general al final",
    varias.map((b) => b.href),
    ["https://zoom.us/j/cenfo", "https://meet.google.com/sj", "https://meet.google.com/todas"]);
  /* Cuál es cuál no se adivina por el enlace, y a las tres de la tarde hay que
     poder apretar la de SJ sin pensarlo. */
  igual("…y cada uno dice de qué clase es",
    varias.map((b) => /Clase de CENFO|Clase de SJ|Los demás grupos/.test(b.texto)), [true, true, true]);
  await r.ctx.close();

  // 6. A un alumno sin ningún profesor no se le pinta: no hay clase que
  //    esperar, y el panel ya le dice que pida que le asignen uno.
  r = await panel(browser, [ALUMNA], "u-ana", {}, Object.assign(datosAlumna(false), { mis_clases: [] }));
  b = await page_vacio(r.page);
  igual("sin ningún profesor asignado, no se le pinta ningún botón", b, "true");
  await r.ctx.close();
}

/* ---- «Sesión en vivo» se abre con la clase ------------------------------
 *
 * El alumno entraba al tablero a cualquier hora y veía la posición que hubiera
 * quedado de la clase anterior, sin forma de saber si había clase o no. Peor:
 * la clase se abría SOLA al conectarse él, así que asomarse un domingo le
 * dejaba al profesor una clase abierta en el registro que crecía sola hasta
 * que alguien la cerrara.
 *
 * Ahora la abre el profesor y el candado lo hace cumplir la RLS, no esta
 * pantalla: sin clase abierta `game_state` no le llega. Lo que se mira acá es
 * que el panel DIGA ese candado antes de tocar —si no, el alumno entra y se
 * encuentra una pantalla vacía— y, sobre todo, que se destape solo cuando la
 * clase se abre. Un candado que se queda puesto se ve exactamente igual de
 * bien que uno que funciona. */
const LEER_SESION = () => {
  const envoltorio = document.getElementById("sesion-wrap");
  const el = envoltorio && envoltorio.firstElementChild;
  if (!el) return { hay: false };
  return {
    hay: true,
    tag: el.tagName,
    href: el.getAttribute("href"),
    bloqueada: el.getAttribute("aria-disabled") === "true",
    texto: el.innerText.replace(/\s+/g, " ").trim(),
    seVe: el.checkVisibility(),
    // Ningún enlace a la sesión colado en la grilla mientras está bloqueada:
    // un <a> invisible pero presente sigue siendo una parada de tabulador.
    enlacesEnGrilla: document.querySelectorAll("#tile-grid a[href='sesion.html']").length,
  };
};

async function sesionLista(page) {
  await page.waitForFunction(() => {
    const c = document.getElementById("sesion-wrap");
    return !!c && !!c.firstElementChild && !/Viendo si/.test(c.firstElementChild.innerText);
  }, null, { timeout: 15000 });
  return page.evaluate(LEER_SESION);
}

async function pruebaSesionEnVivo(browser) {
  console.log("\n=== «Sesión en vivo» se abre con la clase ===");

  // 1. Sin clase abierta: bloqueada, y diciendo por qué.
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", { viewport: { width: 1280, height: 900 } }, datosAlumna(false));
  let t = await sesionLista(r.page);
  igual("sin clase abierta, la tarjeta está y se ve", t.hay && t.seVe, "true");
  /* Bloqueada no es un enlace gris: sin href no recibe el foco del teclado ni
     promete un destino que no va a abrir. La misma regla de los apagados. */
  igual("…bloqueada, sin enlace y sin prometer destino", [t.tag, t.href, t.bloqueada], ["DIV", null, true]);
  igual("…y NO queda ningún enlace a sesion.html en la grilla", t.enlacesEnGrilla, "0");
  igual("…y dice cuándo se abre, no solo que está cerrada",
    /Se abre cuando tu profe empiece la clase/.test(t.texto), "true");

  /* Y lo que de verdad importa: que se DESTAPE sola. El aviso de que la clase
     se abrió llega por Realtime y repinta; si el repintado se olvidara de la
     tarjeta, el alumno se quedaría con el candado puesto mientras su clase ya
     empezó, sin que nada fallara. */
  await r.page.evaluate(() => { window.__abrirClase(); return refrescarVideollamada(); });
  t = await r.page.evaluate(LEER_SESION);
  igual("al abrirse la clase se destapa sola, sin recargar",
    [t.tag, t.href, t.bloqueada], ["A", "sesion.html", false]);
  await r.ctx.close();

  // 2. Con la clase ya abierta al entrar: se entra directo.
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, Object.assign(datosAlumna(false), { clase_abierta: true }));
  t = await sesionLista(r.page);
  igual("con clase abierta, la tarjeta lleva al tablero", [t.tag, t.href, t.bloqueada], ["A", "sesion.html", false]);
  await r.ctx.close();

  // 3. Sin ningún profesor: el motivo de verdad, no un candado que parecería
  //    que se va a abrir solo.
  r = await panel(browser, [ALUMNA], "u-ana", {}, Object.assign(datosAlumna(false), { mis_clases: [] }));
  t = await sesionLista(r.page);
  igual("sin ningún profesor, se nombra el motivo de verdad",
    [t.bloqueada, /Pide que te asignen un profesor/.test(t.texto)], [true, true]);
  await r.ctx.close();

  /* 4. A quien da clase NO se le bloquea: la abre él, así que un candado ahí
     le cerraría la puerta por la que tiene que entrar primero — la misma
     razón por la que su botón de videollamada tampoco se bloquea. */
  r = await panel(browser, [PROFE, ALUMNA], "u-profe", {}, { profesor_videollamada: [] });
  t = await sesionLista(r.page);
  igual("a la profesora no se le bloquea nada, sin clase abierta tampoco",
    [t.tag, t.href, t.bloqueada], ["A", "sesion.html", false]);
  await r.ctx.close();
}

// Que la caja quede VACÍA, no que el botón esté escondido con una clase.
async function page_vacio(page) {
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const c = document.getElementById("videollamada-wrap");
    return !!c && c.children.length === 0;
  });
}

/* Se exporta para que otro verificador reuse este Supabase de mentira en vez de
   escribir una segunda copia: dos dobles del mismo panel se irían separando a la
   primera corrección. Al importarlo, las pruebas de abajo no corren. */
module.exports = { panel, igual, mal, bien, datosAlumna, ALUMNA, PROFE, ADMIN, CHROME, BASE, fallos: () => fallos };
if (require.main !== module) return;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaTareasAlumna(browser);
    await pruebaExamenesEnLaFranja(browser);
    await pruebaPrimerPaso(browser);
    await pruebaFranjaDeClase(browser);
    await pruebaVideollamada(browser);
    await pruebaSesionEnVivo(browser);
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
