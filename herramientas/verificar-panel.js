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
const { chromium } = require("./lib/playwright-con-sesion");

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
      // En la base nunca es null (default 'en_linea'): «Tu última clase» filtra por ella.
      modalidad: "en_linea",
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
      select(_cols, opts) { if (opts && opts.count) anotado.count = true; if (opts && opts.head) anotado.head = true; return b; },
      eq(col, val) { anotado.eq[col] = val; filas2 = filas2.filter((r) => cmp(valor(r, col), val)); return b; },
      neq(col, val) { anotado.neq = Object.assign(anotado.neq || {}, { [col]: val }); filas2 = filas2.filter((r) => !cmp(valor(r, col), val)); return b; },
      gte(col, val) { anotado.gte = { col: col, val: val }; filas2 = filas2.filter((r) => String(valor(r, col)) >= String(val)); return b; },
      lt(col, val) { anotado.lt = { col: col, val: val }; filas2 = filas2.filter((r) => String(valor(r, col)) < String(val)); return b; },
      lte(col, val) { anotado.lte = { col: col, val: val }; filas2 = filas2.filter((r) => String(valor(r, col)) <= String(val)); return b; },
      is(col, val) { if (val === null) filas2 = filas2.filter((r) => r[col] === null || r[col] === undefined); return b; },
      not(col, op, val) { if (op === "is" && val === null) filas2 = filas2.filter((r) => r[col] !== null && r[col] !== undefined); return b; },
      in(col, vals) { filas2 = filas2.filter((r) => vals.map(String).includes(String(valor(r, col)))); return b; },
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
      // Un insert queda anotado (window.__inserts) y devuelve la fila con su id,
      // como PostgREST con .select(): sin id no se puede seguir (un plan y sus renglones).
      insert(fila) {
        window.__inserts = window.__inserts || [];
        window.__inserts.push({ tabla: tabla, fila: fila });
        filas2 = [Object.assign({ id: tabla + "-" + window.__inserts.length }, fila)];
        return b;
      },
      // Como insert: Racha táctica guarda la mejor racha con upsert().
      upsert(fila) {
        window.__upserts = window.__upserts || [];
        window.__upserts.push({ tabla: tabla, fila: fila });
        filas2 = [fila];
        return b;
      },
      update() { return b; },
      delete() { return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = filas2;
        const total = anotado.total !== undefined ? anotado.total : filas2.length;
        if (unica) d = filas2.length ? filas2[0] : null;
        // { head: true } es contar sin traer ninguna fila, como PostgREST.
        if (anotado.head) d = null;
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
    // El último ejercicio de la alumna (marcarLoUltimo pide UNA fila).
    training_progress: DATOS.training_progress || [],
    // El plan que el profesor le compartió (la RLS solo lo devuelve compartido).
    training_plans: DATOS.training_plans || [],
    /* La sala de videollamada del profesor. Al equipo docente se la sirve esta
       tabla (es SUYA); al alumnado le llega por mis_clases(), que es donde la
       RLS decide si se la entrega. */
    /* Una fila por (profesor, grupo): «» es la sala de todas sus clases.
       Al alumnado no se le sirve de acá —le llega por mis_clases(), que es
       donde la RLS decide cuál le toca—; esto es lo que ve el equipo docente
       de lo SUYO. */
    profesor_videollamada: DATOS.profesor_videollamada || [],
    // Lo que se preguntó en una clase y lo que contestó cada uno («Tu última clase»).
    questions: DATOS.questions || [],
    question_answers: DATOS.question_answers || [],
    solicitudes_academia: DATOS.solicitudes_academia || [],
    // Los recibos que quien supervisa tiene por revisar y entregar.
    recibos: DATOS.recibos || [],
    informes_profesor: DATOS.informes_profesor || [],
    /* La visión que marcó administración (verificar-vision-cuenta.js). */
    vision_personas: DATOS.vision_personas || [],
    // Lo que avisa la tarjeta de Competir: retos sin contestar y torneos de su profe.
    desafios: DATOS.desafios || [],
    tournaments: DATOS.tournaments || [],
    tournament_registrations: DATOS.tournament_registrations || [],
    // Lo que junta la campana del alumno (la RLS le da solo lo suyo).
    tareas: DATOS.tareas || [],
    examenes: DATOS.examenes || [],
    avisos_profesor: DATOS.avisos_profesor || [],
    notas_alumno: DATOS.notas_alumno || [],
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
       salgan de mi_entreno_resumen() y no de bajarse training_progress.

       Un solo profesor en mis_clases: el selector de clase no aparece, que es
       lo correcto. */
    rpc: (n, args, opciones) => {
      /* Una base saturada: la consulta no contesta nunca (colgar) o revienta
         antes de salir (lanzar). pruebaBaseLenta() exige que el panel igual
         aparezca, o que al menos diga qué pasa y ofrezca volver a intentar. */
      if ((DATOS.colgar || []).includes(n)) return new Promise(() => {});
      if ((DATOS.lanzar || []).includes(n)) throw new Error("se cayó " + n);
      if (n === "mis_funciones_coordinacion") {
        return Promise.resolve({ data: (window.__misFunciones || ["formularios","altas","solicitudes","cuentas","acceso","roles","cobros","equipos","subgrupos"]), error: null });
      }
      /* Un RPC que devuelve un valor suelto (un booleano, como
         puedo_preparar_rivales) y no filas: se contesta tal cual. */
      if (DATOS.rpc && DATOS.rpc[n] !== undefined && !Array.isArray(DATOS.rpc[n])) {
        window.__consultas.push({ tabla: n, args: args || null });
        return Promise.resolve({ data: DATOS.rpc[n], error: null });
      }
      const c = constructor(n, n === "mis_clases"
        ? (DATOS.mis_clases || [MI_CLASE()])
        : (DATOS.rpc && DATOS.rpc[n]) || [], args);
      // sb.rpc(nombre, args, { count: "exact", head: true }): cuenta sin traer filas.
      if (opciones && opciones.count) c.select(null, { count: opciones.count });
      if (opciones && opciones.head) window.__consultas[window.__consultas.length - 1].head = true;
      return c;
    },
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
function cierto(n, v) { if (v) bien(n); else mal(n); }
function mal(t) { console.log("  ✗ " + t); fallos += 1; }
function bien(t) { console.log("  ✓ " + t); }

async function panel(browser, perfiles, quien, opciones, datos) {
  /* Sin service worker: al recargar (cambiar de modo de vista recarga) es él
     quien sirve los archivos, y lo que pide no pasa por las rutas del contexto,
     así que volvía el js/supabase-client.js de verdad —sin sesión— y la página
     se iba a login.html. La misma piedra que ya documentó verificar-reportes.js. */
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones || {}));
  // Lo que el supervisor de su academia le dejó a un coordinador.
  if (datos && datos.misFunciones) await ctx.addInitScript((f) => { window.__misFunciones = f; }, datos.misFunciones);
  // Lo que ya estaba guardado en este aparato (las colas de repaso, el diagnóstico).
  if (datos && datos.local) await ctx.addInitScript((l) => { Object.entries(l).forEach(([k, v]) => localStorage.setItem(k, v)); }, datos.local);
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
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
    ["Clase en vivo", "Lo que te pone tu profesor", "Aprender", "Estudiar",
     "Entrenamiento básico", "Entrenamiento intermedio", "Entrenamiento avanzado",
     "Mejorar por habilidades", "Jugar y competir", "Tu cuenta"]);
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
  igual("ni el lector de planilla, ni la guía del profesor, ni la tienda, por ninguna parte",
    await page.evaluate(() => document.querySelectorAll(
      "#tile-grid [href='lector-planilla.html'], #tile-grid [href='guia-del-profesor-accesible.html'], #tile-grid [href='tienda.html'], #tile-grid [href='novedades.html']").length), "0");
  /* Lo que tiene FECHA va junto y arriba: tareas y exámenes son lo mismo desde
     el lado del alumno —te lo pone otra persona y vence—, y estaban partidos
     entre "Aprender" y "Evaluaciones". El rótulo dice lo que las dos tienen en
     común, que es lo que no se deduce de sus nombres. */
  /* Y el diagnóstico de nivel va con ellas: no se practica, lo pide el
     profesor para ubicarte. */
  igual("lo que te ponen va junto, y de segundo, con el diagnóstico al final",
    grupo(grupos, "Lo que te pone tu profesor").tiles.map((t) => t.enlace),
    ["tareas.html", "examenes.html", "entreno/diagnostico.html"]);
  /* Por índice a propósito: que vaya PRIMERA es el punto. Y se mira la
     etiqueta y no el href, porque sin clase abierta esa tarjeta está
     bloqueada y no tiene ninguno — eso tiene su propia prueba más abajo. */
  igual("«Clase en vivo» lleva un solo acceso, y es la sesión en vivo",
    grupos[0].tiles.map((t) => t.etiqueta), ["Sesión en vivo"]);
  /* Primero donde se juega contra otra persona, después el torneo y el bot.
     Logros se fue a «Tu cuenta» y TV en vivo, a Competir. Y «Racha táctica» NO está: ya
     es lo primero que hay dentro de juegos.html, y un mismo destino dos veces
     en el panel es el error que ya se cometió con «Torneos». */
  igual("Jugar y competir", grupo(grupos, "Jugar y competir").tiles.map((t) => t.enlace),
    ["juegos.html", "competir.html", "tablero.html", "reto-ejercicios.html"]);
  igual("y Torneos y TV en vivo ya no van en el panel: se entra desde Competir",
    grupos.flatMap((g) => g.tiles).filter((t) => t.enlace === "torneos.html" || t.enlace === "tv.html").length, "0");
  igual("y la racha táctica no se ofrece dos veces: en el panel ya no",
    grupos.flatMap((g) => g.tiles).filter((t) => t.enlace === "racha-tactica.html").length, "0");
  /* Dentro de Aprender, el orden es el del trabajo de todos los días: lo que se
     hace, lo que se repasa de un vistazo, el curso entero y al final la
     lectura. */
  /* Al alumnado, Entrenamiento y Estudio no son dos puertas: lo que hay
     detrás está abierto en el panel, repartido por lo que es. Lo pidió así el
     dueño de la Academia. Las dos puertas siguen siendo del equipo docente. */
  igual("Aprender: las cinco categorías de fichas, las lecciones, los desafíos y la lectura",
    grupo(grupos, "Aprender").tiles.map((t) => t.enlace),
    ["entreno/estudio.html?cat=apertura", "entreno/estudio.html?cat=defensa",
     "entreno/estudio.html?cat=tactica", "entreno/estudio.html?cat=concepto",
     "entreno/estudio.html?cat=final",
     "entreno/aprender.html", "entreno/desafios.html", "articulos.html"]);
  igual("Estudiar: lo que se estudia con el profe",
    grupo(grupos, "Estudiar").tiles.map((t) => t.enlace),
    ["cursos/academia/index.html", "repasar-clases.html"]);
  igual("Entrenamiento básico",
    grupo(grupos, "Entrenamiento básico").tiles.map((t) => t.enlace),
    ["entreno/coordenadas.html", "entreno/memoria.html", "entreno/mates.html", "entreno/practicas.html", "entreno/4x4.html"]);
  igual("Entrenamiento intermedio",
    grupo(grupos, "Entrenamiento intermedio").tiles.map((t) => t.enlace),
    ["entreno/temas.html", "entreno/aperturas.html", "entreno/sin-internet.html"]);
  igual("Entrenamiento avanzado",
    grupo(grupos, "Entrenamiento avanzado").tiles.map((t) => t.enlace),
    ["entreno/visualizacion.html", "entreno/precision-posicional.html", "entreno/finales.html"]);
  /* Una sola tarjeta y las diecinueve habilidades adentro: cada una con su
     tarjeta alargaba el panel el doble. */
  igual("Mejorar por habilidades: una sola tarjeta, «Habilidades»",
    grupo(grupos, "Mejorar por habilidades").tiles.map((t) => [t.etiqueta, t.enlace]),
    [["Habilidades", "entreno/tipos.html"]]);
  igual("y ninguna habilidad suelta en el panel",
    await page.evaluate(() => document.querySelectorAll("#tile-grid [href^='entreno/tipos.html#']").length), "0");
  /* Los nombres que no se confunden con sus vecinas. */
  igual("«Fichas de aperturas» y «Lecciones», no «Aperturas» ni «Aprende»",
    grupo(grupos, "Aprender").tiles.map((t) => t.etiqueta).filter((e) => /apertura|lecci|aprende/i.test(e)),
    ["Fichas de aperturas", "Lecciones"]);
  igual("y las dos puertas del equipo docente no están, ni escondidas",
    await page.evaluate(() => document.querySelectorAll(
      "#tile-grid [href='entreno/index.html'], #tile-grid [href='entreno/estudio.html']").length), "0");
  const enlacesAlumna = grupos.flatMap((g) => g.tiles).map((t) => t.enlace).filter(Boolean);
  igual("a la alumna, cada destino una sola vez", enlacesAlumna.filter((h, i) => enlacesAlumna.indexOf(h) !== i), []);
  /* El diagnóstico de nivel se le ofrece UNA vez, en «Lo que te pone tu
     profesor». El de arbitraje sigue siendo SOLO de administración: su banco
     es un archivo estático y cuanta más gente lo resuelve por su cuenta, menos
     mide. No alcanza con que no salga en la lista: no puede quedar ni un
     enlace a esa página en la grilla, escondido o no. */
  igual("a la alumna el diagnóstico de nivel le sale una sola vez, y el de arbitraje nunca",
    grupos.flatMap((g) => g.tiles)
      .filter((t) => /diagnostico|arbitraje/i.test((t.enlace || "") + " " + (t.etiqueta || "")))
      .map((t) => t.enlace), ["entreno/diagnostico.html"]);
  igual("y el de arbitraje tampoco escondido en la página",
    await page.evaluate(() => document.querySelectorAll(
      "#tile-grid [href*='arbitraje']").length), "0");
  /* "Cerrar sesión" salió del grid: ya está en la cabecera, que es donde se
     busca, y era la única ACCIÓN entre un grid de lugares a los que ir. Un
     destino repetido en el panel ya había dado problemas con "Torneos". */
  /* «Mis pagos» ya no está en el panel de nadie: las mensualidades son cosa de
     la casa, no de quien entra a entrenar. La página sigue enseñándole sus
     recibos a quien entre por la dirección — lo que se quitó es el camino. */
  /* La encuesta de satisfacción es SOLO del alumnado: el equipo docente no
     tiene a quién calificar (la prueba del profesor, más abajo, lo dice). */
  igual("Tu cuenta, en su orden, con su cuaderno y la encuesta sobre su profesor",
    grupo(grupos, "Tu cuenta").tiles.map((t) => t.etiqueta),
    ["Configuración", "Informes", "Logros", "Mi cuaderno", "Justificar una ausencia", "¿Cómo van tus clases?"]);
  igual("y a la alumna no se le ofrecen los cobros por ninguna parte",
    grupos.flatMap((g) => g.tiles).filter((t) => /cobros\.html/.test(t.enlace || "")).length, "0");
  igual("«Cerrar sesión» no está dos veces: en el grid ya no",
    grupos.flatMap((g) => g.tiles).filter((t) => /Cerrar sesión/.test(t.etiqueta2)).length, "0");
  igual("y sigue estando en la cabecera, que es de donde no se movió",
    await page.evaluate(() => !!document.getElementById("logout-btn")), "true");

  // Lo apagado, que es lo que se pidió: apagado para ELLA.
  const apagados = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#tile-grid [aria-disabled=true]"))
      .filter((el) => !el.closest("#videollamada-wrap") && !el.closest("#sesion-wrap") && !el.dataset.claseCompacta)
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
  } else bien("ninguno es enlace ni botón: no promete un destino que no abre");
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

  /* El panel de quien da clase se reparte por lo que se viene a hacer
     (PANEL_DOCENTE en js/clases.js), no el del alumno con cosas encima. Una
     tarjeta que no tenga lugar caería en «Otras»: ese grupo no debe existir. */
  igual("sus grupos, en su orden (sin coordinar, no hay «Coordinación»)", grupos.map((g) => g.titulo),
    ["Clase en vivo", "Tus alumnos", "Tus clases", "Aprender", "Jugar y competir", "Tu cuenta"]);
  const enlacesProfe = grupos.flatMap((g) => g.tiles).map((t) => t.enlace).filter(Boolean);
  igual("cada destino una sola vez", enlacesProfe.filter((h, i) => enlacesProfe.indexOf(h) !== i), []);
  /* Informes es de sus alumnos, no de su cuenta; y el diagnóstico ya no es
     una segunda puerta a Informes (informes.html?tema=diagnostico). */
  igual("«Tus alumnos»: tareas, exámenes, informes, justificaciones y subgrupos",
    grupo(grupos, "Tus alumnos").tiles.map((t) => t.enlace),
    ["tareas.html", "examenes.html", "informes.html", "justificaciones.html", "subgrupos.html"]);
  igual("una sola puerta a Informes", enlacesProfe.filter((h) => h.startsWith("informes.html")), ["informes.html"]);
  igual("y no se le ofrece ninguna de las dos pruebas",
    await page.evaluate(() => document.querySelectorAll(
      "#tile-grid [href*='entreno/diagnostico'], #tile-grid [href*='arbitraje']").length), "0");
  const apagados = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#tile-grid [aria-disabled=true]"))
      .filter((el) => !el.closest("#videollamada-wrap") && !el.closest("#sesion-wrap") && !el.dataset.claseCompacta)
      .map((el) => el.querySelector("span > span").textContent));
  igual("a ella no se le apaga NADA: no hay mantenimiento que le aplique ni tarjetas en espera",
    apagados, []);
  /* El lector de planilla TODAVÍA NO FUNCIONA, y a ella le salía como un acceso
     normal: `mantenimientoAlumno` solo lo apagaba para el alumnado. Ahora es
     `soloAdmin`, igual que la guía del profesor, así que a quien da clase se le
     QUITAN — no se le apagan: una tarjeta gris dice «esto vuelve», y lo que se
     quiere decir es que no es suyo. */
  igual("«Tus clases»: prepararlas (planes y cuestionarios), darlas, repasarlas e informarlas",
    grupo(grupos, "Tus clases").tiles.map((t) => t.enlace),
    ["planes.html", "cuestionarios.html", "asistencia.html", "repasar-clases.html", "partidas.html", "informe-mensual.html"]);
  /* La tienda de materiales entra en la misma regla: todavía no está abierta,
     así que a quien da clase no se le pinta ni escondida — un enlace
     invisible pero presente sigue siendo una parada de tabulador, y encima
     hacia una página que le va a decir que no. */
  igual("y ni el lector de planilla, ni la guía, ni la tienda le quedan escondidos en la página",
    await page.evaluate(() => document.querySelectorAll(
      "#tile-grid [href='lector-planilla.html'], #tile-grid [href='guia-del-profesor-accesible.html'], #tile-grid [href='tienda.html'], #tile-grid [href='novedades.html']").length), "0");

  /* "Mis pagos" es el recibo de la familia del alumno: a una profesora le
     ofrecía "lo que se te ha cobrado" sobre una cuenta a la que no se le cobra
     nada. Y como no coordina, tampoco le toca la página entera de Cobros. */
  igual("a quien da clase no se le ofrece su propio recibo",
    grupo(grupos, "Tu cuenta").tiles.map((t) => t.etiqueta), ["Configuración", "Logros"]);
  igual("y sin coordinar, cobros.html no le aparece por ningún lado",
    grupos.flatMap((g) => g.tiles).filter((t) => t.enlace === "cobros.html").length, "0");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* «Lo urgente» de quien da clase: solo aparece cuando hay algo, y solo con
   lo que se resuelve en una tarjeta suya. Su informe mensual del mes pasado
   cuenta si tiene supervisión (mis_supervisores()) y no lo envió. */
async function pruebaUrgenteProfesora(browser) {
  console.log("\n=== Lo urgente de quien da clase ===");
  // El mes pasado, en hora de Costa Rica, como lo calcula js/pendientes.js.
  const [a, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica", year: "numeric", month: "2-digit" }).format(new Date()).split("-").map(Number);
  const mesPasado = (m === 1 ? a - 1 : a) + "-" + String(m === 1 ? 12 : m - 1).padStart(2, "0") + "-01";
  const nombreMes = new Intl.DateTimeFormat("es-CR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(m === 1 ? a - 1 : a, (m === 1 ? 12 : m - 1) - 1, 15)));

  let r = await panel(browser, [PROFE], "u-profe", null, {
    rpc: { justificaciones_pendientes: 2, mis_supervisores: [{ id: "u-sup" }] },
    // Mandó el de hace dos meses, no el del mes pasado.
    informes_profesor: [{ id: "i-viejo", profesor_id: "u-profe", periodo: "2000-01-01", estado: "enviado" }],
  });
  await r.page.waitForFunction(() => !/Revisando/.test(document.getElementById("urgente-panel-estado").textContent), null, { timeout: 10000 });
  igual("se ve, antes que «Tu semana»",
    await r.page.evaluate(() => {
      const u = document.getElementById("urgente-panel");
      return u.checkVisibility() && !!(u.compareDocumentPosition(document.getElementById("progreso-profe")) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), true);
  igual("sus justificaciones y su informe del mes pasado, cada uno a donde se resuelve",
    await r.page.evaluate(() => Array.from(document.querySelectorAll("#urgente-panel-lista li")).filter((li) => li.checkVisibility())
      .map((li) => li.querySelector("a > span:nth-child(2)").innerText.replace(/\s+/g, " ").trim() + " → " + li.querySelector("a").getAttribute("href"))),
    ["URGENTE 2 justificaciones de ausencia por revisar → justificaciones.html",
     "URGENTE Tu informe mensual de " + nombreMes + " sin enviar → informe-mensual.html"]);
  igual("el informe se busca por SU id, el mes pasado y enviado",
    await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "informes_profesor").map((c) => c.eq)),
    [{ profesor_id: "u-profe", periodo: mesPasado, estado: "enviado" }]);
  igual("sin coordinar, no se le cuentan solicitudes ni cobros",
    await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "solicitudes_academia" || c.tabla === "cobros_morosos").length), 0);
  igual("sin errores en consola", r.errores.join(" | ") || "ninguno", "ninguno");
  await r.ctx.close();

  // Todo al día: la tarjeta no aparece (un «todo al día» diario deja de leerse).
  r = await panel(browser, [PROFE], "u-profe", null, {
    rpc: { justificaciones_pendientes: 0, mis_supervisores: [{ id: "u-sup" }] },
    informes_profesor: [{ id: "i-1", profesor_id: "u-profe", periodo: mesPasado, estado: "enviado" }],
  });
  await r.page.waitForFunction(() => window.__consultas.some((c) => c.tabla === "informes_profesor"), null, { timeout: 10000 });
  await r.page.waitForTimeout(300);
  igual("con todo al día, la tarjeta no aparece",
    await r.page.evaluate(() => document.getElementById("urgente-panel").checkVisibility()), false);
  await r.ctx.close();

  // Sin supervisión nadie le pide informe: no se le cuenta.
  r = await panel(browser, [PROFE], "u-profe", null, { rpc: { justificaciones_pendientes: 0, mis_supervisores: [] } });
  await r.page.waitForTimeout(800);
  igual("sin supervisión, su informe no se le reclama",
    [await r.page.evaluate(() => document.getElementById("urgente-panel").checkVisibility()),
     await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "informes_profesor").length)], [false, 0]);
  await r.ctx.close();
}

/* La preparación de rivales la activa administración profesor por profesor
   (admin.html#preparacion): la tarjeta sale solo si la base dice que sí. La
   base contesta con un booleano, no con filas. */
async function pruebaPreparacionRivales(browser) {
  console.log("\n=== La tarjeta de «Preparación de rivales» ===");
  let r = await panel(browser, [PROFE], "u-profe", null, { rpc: { puedo_preparar_rivales: true } });
  let grupos = await r.page.evaluate(LEER_GRILLA);
  igual("con la función activa, sale en «Tus clases»",
    grupo(grupos, "Tus clases").tiles.map((t) => t.enlace).filter((x) => x === "preparacion-rivales.html"), ["preparacion-rivales.html"]);
  igual("sin errores en consola", r.errores.join(" | ") || "ninguno", "ninguno");
  await r.ctx.close();
  r = await panel(browser, [PROFE], "u-profe", null, { rpc: { puedo_preparar_rivales: false } });
  grupos = await r.page.evaluate(LEER_GRILLA);
  igual("sin activar, no sale por ningún lado",
    await r.page.evaluate(() => document.querySelectorAll("#tile-grid [href='preparacion-rivales.html']").length), "0");
  await r.ctx.close();
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
  igual("los torneos los arma ella (en Competir)", profe["Competir"], "Torneos para tus alumnos, TV en vivo, retos a quien esté en línea y sus partidas");
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
  igual("y también lo neutral de Artículos", alumna["Artículos"], profe["Artículos"]);
}

async function pruebaAdmin(browser) {
  console.log("\n=== El panel de quien administra: no da clase ===");
  const { page, ctx, errores } = await panel(browser, [ADMIN], "u-admin", null, {
    rpc: {
      mi_gente: [{ id: "x", total: 312 }],
      informes_inactivos: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
    },
  });
  const grupos = await page.evaluate(LEER_GRILLA);
  /* Quien administra se encarga de que toda la empresa vaya bien: su panel es
     el suyo, escrito entero en ADMIN_GROUPS, y no el de un profesor recortado. */
  igual("sus grupos, en su orden", grupos.map((g) => g.titulo),
    ["Administración", "Supervisión y coordinación", "Formularios", "Cobros y accesos", "Resultados de las pruebas", "Torneos", "Revisar el contenido", "Tu cuenta"]);
  /* UNA sola puerta para cada cosa: acá están TODAS las páginas de quien
     administra, y admin.html solo tiene lo que se maneja adentro (lo urgente,
     las cuentas, supervisores y profesores). Antes admin.html traía una
     segunda lista de páginas («Herramientas») y este panel repetía «Lo
     urgente»; lo que solo estaba allá vino para acá. */
  igual("Supervisión y coordinación, con lo suyo",
    grupos.find((g) => g.titulo === "Supervisión y coordinación").tiles.map((t) => t.enlace),
    ["supervision.html", "coordinacion.html", "informes.html", "justificaciones.html", "tablero-academias.html", "reportes.html"]);
  igual("lo urgente NO se repite acá: está en Administración",
    await page.evaluate(() => !!document.getElementById("urgente-admin")), false);
  igual("Formularios: todos juntos, con la encuesta de satisfacción",
    grupos.find((g) => g.titulo === "Formularios").tiles.map((t) => t.enlace),
    ["satisfaccion.html", "encuestas-curso.html", "formularios.html", "solicitudes.html"]);
  igual("lo que solo estaba en las Herramientas de admin.html, ahora acá",
    ["precios.html", "prueba-gratis.html", "admin-jugador.html", "informes.html?tema=arbitraje", "arbitraje.html", "inscripciones.html"]
      .filter((x) => !grupos.flatMap((g) => g.tiles).some((t) => t.enlace === x)), []);
  /* Un enlace a una página que no existe no da ningún error: se ve igual de
     bien y solo falla al apretarlo. Y los que llevan ?tema= dependen de que
     ese tema exista en el selector de informes.html. */
  {
    const fs = require("fs"), path = require("path"), RAIZ = path.join(__dirname, "..");
    const informes = fs.readFileSync(path.join(RAIZ, "informes.html"), "utf8");
    const temas = [...informes.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    const rotos = grupos.flatMap((g) => g.tiles).map((t) => t.enlace).filter(Boolean).filter((href) => {
      const [archivo, consulta] = href.split("#")[0].split("?");
      if (!fs.existsSync(path.join(RAIZ, archivo))) return true;
      const tema = new URLSearchParams(consulta || "").get("tema");
      return !!(tema && !temas.includes(tema));
    });
    igual("todas las tarjetas llevan a algo que existe", rotos.join(" | ") || "ninguna rota", "ninguna rota");
  }
  const enlaces = grupos.flatMap((g) => g.tiles).map((t) => t.enlace);
  igual("nada de dar clase: ni sesión en vivo, ni tareas, ni exámenes, ni planes, ni asistencia, ni informe mensual, ni subgrupos, ni archivos, ni juegos, ni torneos",
    ["sesion.html", "tareas.html", "examenes.html", "planes.html", "asistencia.html", "informe-mensual.html",
     "subgrupos.html", "partidas.html", "juegos.html", "competir.html", "torneos.html"].filter((x) => enlaces.includes(x)), []);
  igual("y sí lo de supervisar y administrar",
    ["informes.html", "supervision.html", "tablero-academias.html", "novedades.html", "admin.html", "academias.html", "coordinacion.html", "cobros.html", "solicitudes.html"]
      .filter((x) => !enlaces.includes(x)), []);
  igual("cada destino una sola vez", enlaces.length, new Set(enlaces).size);
  const visible = (id) => page.evaluate((i) => document.getElementById(i).checkVisibility(), id);
  igual("no se le pinta el estado de la clase (no inicia clases)", await visible("session-status-card"), false);
  igual("ni «Tu semana», que es la de un profesor con sus alumnos y sus tareas", await visible("progreso-profe"), false);
  igual("ni el registro de clases", await visible("registro-clases"), false);
  igual("ni la franja del primer paso de quien da clase", await visible("pendientes-aviso"), false);
  igual("en su lugar, el resumen de toda la plataforma",
    [await visible("progreso-supervisor"), await page.textContent("#progreso-supervisor-titulo")], [true, "Toda la plataforma"]);
  igual("con los números de todos: estudiantes, profesores y sin entrenar",
    await page.evaluate(() => ["sup-alumnos", "sup-profes", "sup-inactivos"].map((i) => document.getElementById(i).textContent)),
    ["312", "312", "3"]);
  igual("los que no entrenan se CUENTAN en la base, sin bajarse la lista",
    await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "informes_inactivos").map((c) => [c.count, !!c.head])),
    [[true, true]]);
  igual("el saludo dice para qué es el panel y dónde está lo demás", await page.textContent("#panel-subtitulo"), "Todas las páginas de la plataforma. Lo urgente y las cuentas están en Administración.");
  igual("sin errores en la página", errores, []);
  await ctx.close();

  /* «Ver como: profesor» sigue mostrándole el panel de quien da clase: es para
     lo que existe ese selector, y la forma de revisar lo que ven los profesores. */
  const comoProfe = await panel(browser, [ADMIN], "u-admin");
  await comoProfe.page.evaluate(() => { localStorage.setItem("modo_vista_admin_v1", "profesor"); });
  await comoProfe.page.reload({ waitUntil: "networkidle" });
  await comoProfe.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  const deProfe = (await comoProfe.page.evaluate(LEER_GRILLA)).flatMap((g) => g.tiles).map((t) => t.enlace);
  igual("mirando «como profesor», vuelve el panel de quien da clase",
    ["sesion.html", "tareas.html", "planes.html"].every((x) => deProfe.includes(x)), true);
  await comoProfe.ctx.close();
}

/* El buscador del panel. Lo que importa: que deje a la vista SOLO lo que
   coincide (medido con checkVisibility, no con el style), que encuentre por
   las palabras con que la gente pide las cosas («pagos», «contrasena» sin
   tilde), que no invente lo que el rol no tiene, que Enter abra el primero y
   que Escape lo devuelva todo. */
const VISIBLES = () => Array.from(document.querySelectorAll("#tile-grid .grid > *"))
  .filter((el) => el.id !== "videollamada-wrap")
  .map((el) => (el.id === "sesion-wrap" ? el.firstElementChild : el))
  .filter((el) => el && el.checkVisibility())
  .map((el) => el.querySelector("span > span").textContent);

async function buscar(page, texto) {
  await page.fill("#buscar-panel-campo", texto);
  // El anuncio espera a que se deje de escribir y a que lleguen las personas
  // (300 ms la consulta, 350 ms el anuncio).
  await page.waitForTimeout(900);
}

async function pruebaBuscador(browser) {
  console.log("\n=== El buscador del panel ===");
  const { page, ctx, errores } = await panel(browser, [ADMIN], "u-admin");
  const todas = await page.evaluate(VISIBLES);
  bien(`sin buscar se ven las ${todas.length} tarjetas`);
  cierto("el buscador se ve de verdad y tiene su etiqueta",
    await page.evaluate(() => document.getElementById("buscar-panel-campo").checkVisibility()
      && document.getElementById("buscar-panel-campo").labels[0].textContent === "¿Qué buscas?"));

  igual("el buscador va arriba de todo: justo después del saludo, antes de la clase y de la semana",
    await page.evaluate(() => {
      const f = document.getElementById("buscar-panel");
      return f.previousElementSibling.contains(document.getElementById("panel-titulo"))
        && !!(f.compareDocumentPosition(document.getElementById("session-status-card")) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), "true");
  const registroAntes = await page.evaluate(() => document.getElementById("registro-clases").checkVisibility());
  const semanaAntes = await page.evaluate(() => document.getElementById("progreso-profe")
    ? document.getElementById("progreso-profe").checkVisibility() : null);

  await buscar(page, "pagos");
  igual("mientras se busca, lo demás se hace a un lado (el registro de clases también) y los resultados quedan debajo del buscador",
    await page.evaluate(() => {
      const hijos = [];
      for (let el = document.getElementById("buscar-panel").nextElementSibling; el; el = el.nextElementSibling) {
        if (el.id !== "tile-grid") hijos.push(el);
      }
      return hijos.some((el) => el.id === "registro-clases") && hijos.every((el) => !el.checkVisibility())
        && document.getElementById("tile-grid").checkVisibility();
    }), "true");
  igual("«pagos» encuentra Cobros aunque la tarjeta no diga «pagos» en el nombre",
    await page.evaluate(VISIBLES), ["Cobros de la Academia"]);
  igual("los grupos sin nada que mostrar no se ven",
    await page.evaluate(() => Array.from(document.querySelectorAll("#tile-grid > section"))
      .filter((s) => s.checkVisibility()).map((s) => s.querySelector("h2").textContent)), ["Cobros y accesos"]);
  igual("el resultado se anuncia", await page.textContent("#buscar-panel-estado"),
    "1 acceso con «pagos». Enter abre «Cobros de la Academia».");
  igual("y el anuncio va en role=status", await page.getAttribute("#buscar-panel-estado", "role"), "status");

  await buscar(page, "CONTRASENA");
  igual("sin tilde y en mayúscula, «contraseña» encuentra Configuración", await page.evaluate(VISIBLES), ["Configuración"]);

  await buscar(page, "diagnosticos publico");
  igual("todas las palabras tienen que estar", await page.evaluate(VISIBLES), ["Diagnósticos del público"]);

  await buscar(page, "xilofono");
  igual("sin resultados no queda ninguna tarjeta", await page.evaluate(VISIBLES), []);
  cierto("y se dice qué probar", /^Nada con «xilofono»\. Prueba con otra palabra/.test(await page.textContent("#buscar-panel-estado")));

  await page.focus("#buscar-panel-campo");
  await page.keyboard.press("Escape");
  igual("Escape borra lo escrito", await page.inputValue("#buscar-panel-campo"), "");
  igual("y vuelven todas las tarjetas", (await page.evaluate(VISIBLES)).length, todas.length);
  cierto("el registro de clases vuelve al borrar", registroAntes === await page.evaluate(() => document.getElementById("registro-clases").checkVisibility()));
  igual("y lo de en medio vuelve a estar como estaba",
    await page.evaluate(() => document.getElementById("progreso-profe")
      ? document.getElementById("progreso-profe").checkVisibility() : null), semanaAntes);
  igual("sin buscar no se anuncia nada", await page.textContent("#buscar-panel-estado"), "");

  await page.focus("body");
  await page.keyboard.press("Control+K");
  igual("Ctrl + K lleva al buscador", await page.evaluate(() => document.activeElement.id), "buscar-panel-campo");
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("/");
  igual("«/» también", await page.evaluate(() => document.activeElement.id), "buscar-panel-campo");
  igual("y la barra no se escribe en el campo", await page.inputValue("#buscar-panel-campo"), "");

  await buscar(page, "pagos");
  await Promise.all([page.waitForURL(/cobros\.html$/, { timeout: 10000 }), page.press("#buscar-panel-campo", "Enter")]);
  bien("Enter abre el primero: " + page.url().replace(BASE, ""));
  igual("sin errores en la página", errores.filter((e) => !/cobros/.test(e)), []);
  await ctx.close();

  // La alumna no tiene Cobros: buscarlo no lo inventa.
  const alumna = await panel(browser, [ALUMNA, PROFE], "u-ana");
  await buscar(alumna.page, "cobros");
  igual("a la alumna, «cobros» no le encuentra nada: busca solo en SU panel", await alumna.page.evaluate(VISIBLES), []);
  await buscar(alumna.page, "tareas");
  igual("y lo suyo sí", await alumna.page.evaluate(VISIBLES), ["Tareas"]);
  igual("sin errores en la página de la alumna", alumna.errores, []);
  await alumna.ctx.close();

  // Del lado de quien da clase: la videollamada va con su tarjeta.
  const profe = await panel(browser, [PROFE], "u-profe");
  await buscar(profe.page, "videollamada");
  cierto("«videollamada» deja Sesión en vivo con su botón al lado",
    await profe.page.evaluate(() => document.querySelector("#sesion-wrap > *").checkVisibility()
      && document.getElementById("videollamada-wrap").style.display !== "none"));
  await profe.ctx.close();
}

/* Buscar PERSONAS: la base (mi_gente) dice a quién alcanza cada uno; el panel
   solo pinta y decide a dónde lleva cada una. El doble no filtra por el texto,
   así que devuelve siempre las mismas: lo que se prueba es lo que la página
   pide, cómo lo pinta y qué ofrece según quién busca. */
const GENTE = [
  { id: "a-maria", full_name: "María Rojas", email: "maria@x.cr", role: "alumno", grupo: "7B", is_admin: false, total: 9 },
  { id: "p-mario", full_name: "Mario Soto", email: "mario@x.cr", role: "profesor", grupo: null, is_admin: false, total: 9 },
];
const PERSONAS = () => [...document.querySelectorAll("#buscar-personas-lista a")]
  .filter((a) => a.checkVisibility()).map((a) => [a.querySelector("span span").textContent, a.getAttribute("href")]);

async function pruebaPersonas(browser) {
  console.log("\n=== El buscador también encuentra personas ===");
  let r = await panel(browser, [ADMIN], "u-admin", null, { rpc: { mi_gente: GENTE } });
  await r.page.fill("#buscar-panel-campo", "mari");
  await r.page.waitForFunction(() => !document.getElementById("buscar-personas").hidden, null, { timeout: 5000 });
  await r.page.waitForTimeout(450);
  igual("a quien administra le aparecen las dos, cada una a su lugar", await r.page.evaluate(PERSONAS),
    [["María Rojas", "informes.html?alumno=a-maria"], ["Mario Soto", "coordinacion.html?buscar=Mario%20Soto"]]);
  igual("se ven de verdad, debajo del buscador", await r.page.evaluate(() => document.getElementById("buscar-personas").checkVisibility()), true);
  igual("lo que pide es lo escrito, de a pocas", await r.page.evaluate(() =>
    window.__consultas.filter((c) => c.tabla === "mi_gente").map((c) => c.args).pop()),
    { p_busqueda: "mari", p_rol: null, p_limite: 6, p_desde: 0 });
  cierto("si hay más de las que se pintan, se dice", /Hay 9 en total/.test(await r.page.textContent("#buscar-personas-mas")));
  cierto("y el anuncio las cuenta", /2 personas con «mari»/.test(await r.page.textContent("#buscar-panel-estado")));
  igual("«mari» no trae la tarjeta de Cursos por decir «temario»: se compara con el comienzo de cada palabra",
    await r.page.evaluate(VISIBLES), []);
  igual("el nombre ajeno va como texto", await r.page.evaluate(() => document.querySelector("#buscar-personas-lista a span span").innerHTML), "María Rojas");
  // Sin ninguna tarjeta que coincida, Enter abre la primera persona.
  await r.page.fill("#buscar-panel-campo", "zzmari");
  await r.page.waitForFunction(() => !document.getElementById("buscar-personas").hidden, null, { timeout: 5000 });
  await r.page.waitForTimeout(400);
  await Promise.all([r.page.waitForURL(/informes\.html\?alumno=a-maria$/, { timeout: 10000 }), r.page.press("#buscar-panel-campo", "Enter")]);
  bien("sin tarjetas, Enter abre a la primera persona: " + r.page.url().replace(BASE, ""));
  await r.ctx.close();

  // Una profesora que no coordina: sus alumnos van a su informe, y a un
  // profesor no se le ofrece Coordinación (no puede entrar ahí).
  r = await panel(browser, [PROFE], "u-profe", null, { rpc: { mi_gente: GENTE } });
  await r.page.fill("#buscar-panel-campo", "mari");
  await r.page.waitForFunction(() => !document.getElementById("buscar-personas").hidden, null, { timeout: 5000 });
  igual("a la profesora solo le sale su alumna, que va a su informe", await r.page.evaluate(PERSONAS),
    [["María Rojas", "informes.html?alumno=a-maria"]]);
  igual("y el campo le dice que puede buscar por nombre, sin sugerirle Cobros (no los ve)",
    await r.page.getAttribute("#buscar-panel-campo", "placeholder"), "Tareas, informes, el nombre de un alumno…");
  await r.page.press("#buscar-panel-campo", "Escape");
  igual("Escape también se lleva a las personas", await r.page.evaluate(() => document.getElementById("buscar-personas").checkVisibility()), false);
  await r.ctx.close();

  // La alumna no busca gente: ni se le pide a la base.
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, { rpc: { mi_gente: GENTE } });
  await r.page.fill("#buscar-panel-campo", "mari");
  await r.page.waitForTimeout(800);
  igual("a la alumna no se le busca gente", [await r.page.evaluate(() => document.getElementById("buscar-personas").checkVisibility()),
    await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "mi_gente").length)], [false, 0]);
  await r.ctx.close();

  // clases.html?buscar=… (el Ctrl + K de las demás páginas) abre ya buscando.
  r = await panel(browser, [ADMIN], "u-admin", null, { rpc: { mi_gente: GENTE } });
  await r.page.goto(BASE + "/clases.html?buscar=contrasena", { waitUntil: "networkidle" });
  await r.page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  igual("?buscar= deja el texto puesto y el foco en el buscador",
    await r.page.evaluate(() => [document.getElementById("buscar-panel-campo").value, document.activeElement.id]), ["contrasena", "buscar-panel-campo"]);
  igual("y ya filtrando", await r.page.evaluate(VISIBLES), ["Configuración"]);
  igual("la dirección queda limpia, para que recargar no vuelva a buscar", new URL(r.page.url()).search, "");
  await r.ctx.close();
}

/* El supervisor de su academia le apagó los cobros y las solicitudes: esas dos
   tarjetas no se le pintan. La base lo rechazaría igual, pero el fallo lo
   descubriría quien entró. Formularios, que sí tiene, se queda. */
async function pruebaCoordinadorRecortado(browser) {
  console.log("\n=== Un coordinador al que le apagaron funciones ===");
  const COORD = { id: "u-luis", role: "profesor", is_admin: false, es_coordinador: true, full_name: "Luis Mora", email: "luis@x.cr", grupo: null };
  const { page, ctx, errores } = await panel(browser, [COORD], "u-luis", null,
    { misFunciones: ["formularios", "altas", "cuentas", "acceso", "roles", "equipos", "subgrupos"] });
  const enlaces = grupo(await page.evaluate(LEER_GRILLA), "Coordinación").tiles.map((t) => t.enlace);
  igual("no se le pintan ni Cobros ni Solicitudes, y sí Formularios y Coordinación",
    ["cobros.html", "solicitudes.html", "formularios.html", "coordinacion.html"].map((x) => enlaces.includes(x)),
    [false, false, true, true]);
  /* Lo urgente solo cuenta lo que tiene tarjeta: sin Solicitudes ni Cobros,
     ni se le preguntan a la base (le diría «al día» de algo que no ve). */
  await page.waitForTimeout(300);
  igual("y «Lo urgente» no le cuenta solicitudes ni cobros",
    await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "solicitudes_academia" || c.tabla === "cobros_morosos").length), 0);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

/* «Qué hicieron» en cada clase del registro: lo que contestó cada alumno
   (resumen_de_la_clase, js/resumen-clase.js). Se pide al abrirlo y de ESA
   clase, no con la lista: una llamada por clase para cien clases sería pedir
   cien veces algo que casi nunca se mira. */
async function pruebaRegistroResumen(browser) {
  console.log("\n=== Qué hicieron en una clase del registro ===");
  const { page, ctx, errores } = await panel(browser, [PROFE], "u-profe", null, { rpc: { resumen_de_la_clase: [
    { student_id: "u-ana", nombre: "Ana Rojas", preguntas: 3, respondidas: 2, correctas: 2, incorrectas: 0, sin_calificar: 0,
      practicas: 0, ganadas: 0, tablas: 0, perdidas: 0 }],
    // La pregunta de salida de esa clase (salida_de_la_clase): 1 de 3 entendió.
    salida_de_la_clase: [{ question_id: "q-s", prompt: "¿Entendiste?", tipo: "opciones", asistentes: 4, respondieron: 3,
      bien: 1, medio: 0, mal: 2, sin_calificar: 0 }] } });
  await page.waitForSelector("#sessions-log tbody tr", { timeout: 10000 });
  const pedidas = () => page.evaluate(() => window.__consultas.filter((c) => c.tabla === "resumen_de_la_clase").map((c) => c.args && c.args.p_clase));
  igual("con la lista no se pide ningún resumen", JSON.stringify(await pedidas()), "[]");
  const btn = page.locator("#sessions-log tbody tr").first().getByRole("button", { name: "Qué hicieron" });
  igual("el botón dice que está cerrado", await btn.getAttribute("aria-expanded"), "false");
  await btn.click();
  await page.waitForFunction(() => /contestadas/.test(document.getElementById("sessions-log").textContent), null, { timeout: 5000 });
  igual("pide el de ESA clase", JSON.stringify(await pedidas()), JSON.stringify(["c-0"]));
  igual("y dice que está abierto", await btn.getAttribute("aria-expanded"), "true");
  igual("lo pinta escrito", await page.evaluate(() =>
    [...document.querySelectorAll("#sessions-log tbody td table tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent).join(" | ")).join()),
    "Ana Rojas | 2 de 3 contestadas: 2 bien | —");
  await page.waitForSelector("#sessions-log .salida-registro", { timeout: 5000 });
  igual("y arriba, lo que dijo la pregunta de salida", await page.textContent("#sessions-log .salida-registro"),
    "🚪 Pregunta de salida: 🔁 Conviene repetir el tema la próxima clase. 3 de 4 alumnos contestaron: 1 lo entendió, 2 no lo entendieron.");
  await btn.click();
  igual("se vuelve a cerrar", await page.evaluate(() => /contestadas/.test(document.getElementById("sessions-log").textContent)), "false");
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

/* «Tu última clase» en el panel del alumno: su fila del resumen (la RLS le da
   solo la suya) y lo que contestó en cada pregunta de ESA clase. */
async function pruebaUltimaClase(browser) {
  console.log("\n=== Tu última clase (alumno) ===");
  const fila = { student_id: "u-ana", nombre: "Ana Rojas", preguntas: 2, respondidas: 1, correctas: 1, incorrectas: 0, sin_calificar: 0,
    practicas: 1, ganadas: 0, tablas: 0, perdidas: 1, partidas: 0, partidas_ganadas: 0, partidas_tablas: 0, partidas_perdidas: 0 };
  let r = await panel(browser, [ALUMNA], "u-ana", null, {
    rpc: { resumen_de_la_clase: [fila] },
    questions: [
      { id: "q1", class_session_id: "c-0", prompt: "¿Qué jugarías?", tipo: "jugada", opciones: null, created_at: "1" },
      { id: "q2", class_session_id: "c-0", prompt: "¿Quién está mejor?", tipo: "opciones", opciones: ["Blancas", "Iguales", "Negras"], created_at: "2" },
      { id: "q9", class_session_id: "c-1", prompt: "De otra clase", tipo: "jugada", opciones: null, created_at: "3" },
    ],
    question_answers: [{ question_id: "q1", student_id: "u-ana", moves: ["Ra8#"], opcion: null, is_correct: true }],
  });
  await r.page.waitForFunction(() => !document.getElementById("ultima-clase").hidden, null, { timeout: 10000 });
  igual("pide el resumen de la última clase en línea", JSON.stringify(await r.page.evaluate(() =>
    window.__consultas.filter((c) => c.tabla === "resumen_de_la_clase").map((c) => c.args && c.args.p_clase))), JSON.stringify(["c-0"]));
  igual("dice qué clase fue", /Finales de torre/.test(await r.page.textContent("#ultima-clase")), "true");
  igual("y lo que hizo, escrito", await r.page.evaluate(() => [...document.querySelectorAll("#ultima-clase ul li")].map((l) => l.textContent).join(" | ")),
    "Preguntas: 1 de 2 contestadas: 1 bien | Práctica contra el motor: 1 partida: 1 perdida");
  igual("y lo que contestó en cada pregunta de ESA clase", await r.page.evaluate(() => [...document.querySelectorAll("#ultima-clase ol li")].map((l) => l.textContent).join(" | ")),
    "¿Qué jugarías? Tu respuesta: Ta8# — ✅ correcta | ¿Quién está mejor? Sin contestar");
  /* Repasar ESA clase, no la lista general: esa ya es la tarjeta «Repasar
     mis clases» de la grilla. */
  igual("«Repasar esta clase» abre el repaso de ESA clase",
    await r.page.evaluate(() => { const a = [...document.querySelectorAll("#ultima-clase a")].find((x) => /Repasar/.test(x.textContent)); return a ? a.getAttribute("href") : "no está"; }),
    "repasar-clases.html?repaso=c-0");
  /* Va dentro de «Tus clases», que en la computadora arranca abierto. */
  await r.page.waitForFunction(() => !document.getElementById("tus-clases").hidden, null, { timeout: 10000 });
  igual("va dentro de «Tus clases», abierto en la computadora",
    await r.page.evaluate(() => { const d = document.getElementById("tus-clases"); return [d.contains(document.getElementById("ultima-clase")), d.checkVisibility(), d.open]; }),
    [true, true, true]);
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();

  /* En el celular, «Tus clases» arranca cerrado: se ve el título (con qué
     trae adentro) y se abre al tocarlo; se recuerda en este aparato. */
  const datosClase = {
    rpc: { resumen_de_la_clase: [fila] },
    questions: [{ id: "q1", class_session_id: "c-0", prompt: "¿Qué jugarías?", tipo: "jugada", opciones: null, created_at: "1" }],
    question_answers: [],
  };
  r = await panel(browser, [ALUMNA], "u-ana", { viewport: { width: 390, height: 800 } }, datosClase);
  await r.page.waitForFunction(() => !document.getElementById("tus-clases").hidden, null, { timeout: 10000 });
  const cel = await r.page.evaluate(() => { const d = document.getElementById("tus-clases");
    return [d.checkVisibility(), d.open, document.getElementById("ultima-clase").checkVisibility(), d.querySelector("summary").textContent.replace(/\s+/g, " ").trim()]; });
  igual("en el celular, «Tus clases» arranca cerrado, con su título a la vista", cel,
    [true, false, false, "Tus clases tu calendario, tu última clase y tus puntos del mes"]);
  await r.page.click("#tus-clases summary");
  igual("al tocarlo se abre", await r.page.evaluate(() => document.getElementById("ultima-clase").checkVisibility()), true);
  /* El evento «toggle» llega en otra vuelta: se espera a que quede guardado
     antes de recargar, y después a que la caja esté ARMADA (lo guardado se
     aplica en el .finally, que puede llegar después de que se vea la tarjeta). */
  await r.page.waitForFunction(() => /"Tus clases":true/.test(localStorage.getItem("panel_grupos_abiertos_v1") || ""), null, { timeout: 5000 });
  await r.page.reload({ waitUntil: "networkidle" });
  await r.page.waitForFunction(() => document.getElementById("tus-clases").dataset.armado === "1", null, { timeout: 10000 });
  igual("y sigue abierto al volver, en este aparato", await r.page.evaluate(() => document.getElementById("tus-clases").open), true);
  await r.ctx.close();

  // Si no aparece en el resumen (no estuvo ni hizo nada), la tarjeta no sale.
  r = await panel(browser, [ALUMNA], "u-ana", null, { rpc: { resumen_de_la_clase: [] } });
  await r.page.waitForTimeout(500);
  igual("sin fila suya, no hay tarjeta", await r.page.evaluate(() => document.getElementById("ultima-clase").checkVisibility()), "false");
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();
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

// Lo que devuelve mi_entreno_resumen(): un solo renglón, el de quien llama.
const RESUMEN_ANA = [{ puzzles: 37, lecciones: 9, mejor_coord: 24 }];
const CURSOS_ANA = [
  // El más reciente de los dos a medias es el que hay que ofrecer, y el
  // terminado no se ofrece nunca: no hay nada que continuar ahí.
  { student_id: "u-ana", slug: "desequilibrios-de-material", titulo: "Desequilibrios de material", total: 20, hechos: 7,
    ultimo_titulo: "La clavada", ultima_fecha: new Date(Date.now() - 2 * 86400000).toISOString() },
  { student_id: "u-ana", slug: "el-mapa-de-los-finales", titulo: "El mapa de los finales", total: 15, hechos: 3,
    ultimo_titulo: "Oposición", ultima_fecha: new Date(Date.now() - 30 * 86400000).toISOString() },
  // Uno escondido (js/cursos-ocultos.js), más reciente que todos: no se puede
  // retomar, así que no se ofrece.
  { student_id: "u-ana", slug: "finales-practicos", titulo: "Finales prácticos", total: 14, hechos: 4,
    ultimo_titulo: "Oposición", ultima_fecha: new Date(Date.now() - 86400000).toISOString() },
  { student_id: "u-ana", slug: "partidas-modelo", titulo: "Partidas modelo", total: 12, hechos: 12,
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
      mi_entreno_resumen: RESUMEN_ANA,
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
  // La campana sí lee `tareas`, pero cinco y de un mes: nunca la tabla entera.
  igual("y nadie se baja la tabla `tareas` a mano (la campana pide cinco)",
    await r.page.evaluate(() => window.__consultas.some((c) => c.tabla === "tareas" && !(c.limit && c.limit <= 5))), "false");
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
    { rpc: { mi_entreno_resumen: RESUMEN_ANA, progreso_dias_y_racha: RACHA_ANA } });
  igual("sin tareas y con el entrenamiento ya empezado, la franja NO se destapa",

    await r.page.evaluate(() => getComputedStyle(document.getElementById("pendientes-aviso")).display), "none");
  igual("y sin ningún curso a medias, tampoco «Continúa donde ibas»",
    await r.page.evaluate(() => getComputedStyle(document.getElementById("seguir-curso")).display), "none");
  await r.ctx.close();
}

/* El diagnóstico que pidió el profe: se asigna como un renglón de una tarea
   (material_slug «diagnostico») y, mientras no esté cumplido, la tarjeta del
   diagnóstico se ILUMINA —anillo, un punto que late y la etiqueta escrita— y
   lleva a la prueba con su `?tarea=`. Lo cumplido lo decide la base
   (tareas_con_avance, que solo cuenta el rendido después de asignarlo): acá
   no se vuelve a calcular. */
function tareasConDiagnostico(cumplido, situacion) {
  const dia = (n) => new Date(Date.now() + n * 86400000).toISOString();
  return [
    { id: "td", alumno_id: "u-ana", situacion: situacion || "pendiente", titulo: "Diagnóstico de nivel",
      vence_at: dia(situacion === "vencida" ? -2 : 1), renglones: 1, cumplidos: cumplido ? 1 : 0,
      items: [{ id: "r1", material_slug: "diagnostico", meta_tipo: "cantidad", meta_cantidad: 1,
                material_href: "entreno/diagnostico.html", hecho: cumplido ? 1 : 0, cumplido: !!cumplido }] },
    { id: "t2", alumno_id: "u-ana", situacion: "pendiente", titulo: "Mates en dos",
      vence_at: dia(5), renglones: 1, cumplidos: 0, items: [] },
  ];
}

async function pruebaDiagnosticoPedido(browser) {
  console.log("\n=== El diagnóstico que pidió el profe ===");
  const leer = (opciones, tareas) => panel(browser, [ALUMNA, PROFE], "u-ana", opciones || {}, {
    rpc: { tareas_con_avance: tareas, mi_entreno_resumen: RESUMEN_ANA,
           informes_cursos_alumnos: CURSOS_ANA, progreso_dias_y_racha: RACHA_ANA },
  });
  const VER = () => {
    const a = document.querySelector("#tile-grid a[href^='entreno/diagnostico.html']");
    if (!a) return null;
    const punto = a.querySelector("[aria-hidden=true].absolute");
    const latido = punto && punto.querySelector(".animate-ping");
    const etiqueta = Array.from(a.querySelectorAll("span")).filter((s) => /^Te lo pidió tu profe/.test(s.textContent)).pop();
    return {
      href: a.getAttribute("href"),
      // Toda tarjeta lleva sombra: el anillo se nota en que la suya es
      // DISTINTA de la de Tareas, que está al lado y no se ilumina nunca.
      anillo: getComputedStyle(a).boxShadow
        !== getComputedStyle(document.querySelector("#tile-grid a[href='tareas.html']")).boxShadow,
      etiqueta: etiqueta && etiqueta.checkVisibility() ? etiqueta.textContent : "",
      punto: !!(punto && punto.checkVisibility()),
      latido: latido ? getComputedStyle(latido).animationName : "",
      grupo: a.closest("section").querySelector("h2").textContent,
      franja: document.getElementById("pendientes-aviso-texto").textContent,
      franjaEnlace: document.getElementById("pendientes-aviso").getAttribute("href"),
      franjaCta: document.getElementById("pendientes-aviso-cta").textContent,
      cuantas: document.querySelectorAll("#tile-grid a[href^='entreno/diagnostico.html']").length,
    };
  };

  let r = await leer({}, tareasConDiagnostico(false));
  let v = await r.page.evaluate(VER);
  igual("pendiente: la tarjeta sigue en «Lo que te pone tu profesor», y una sola vez",
    [v.grupo, v.cuantas], ["Lo que te pone tu profesor", 1]);
  igual("lleva a la prueba con su tarea, para que la franja de la tarea salga adentro",
    v.href, "entreno/diagnostico.html?tarea=td");
  igual("se ilumina: el anillo SE VE", v.anillo, "true");
  igual("y dice por qué, escrito (el punto solo es adorno)", v.etiqueta, "Te lo pidió tu profe · vence mañana");
  igual("el punto se ve y late", [v.punto, v.latido], [true, "ping"]);
  igual("la franja de arriba lo nombra", v.franja, "Tu profe te pidió el diagnóstico de nivel. Vence mañana.");
  igual("y lleva directo a la prueba", [v.franjaEnlace, v.franjaCta],
    ["entreno/diagnostico.html?tarea=td", "Hacer el diagnóstico →"]);
  igual("sin errores en consola", r.errores.join(" | ") || "ninguno", "ninguno");
  await r.ctx.close();

  // Con «reducir movimiento», el punto se queda quieto (pero sigue ahí).
  r = await leer({ reducedMotion: "reduce" }, tareasConDiagnostico(false));
  v = await r.page.evaluate(VER);
  igual("con «reducir movimiento» el punto NO late", [v.punto, v.latido], [true, "none"]);
  await r.ctx.close();

  // Vencida: no dice «vence hoy», dice que se pasó la fecha.
  r = await leer({}, tareasConDiagnostico(false, "vencida"));
  v = await r.page.evaluate(VER);
  igual("vencida: lo dice como es", v.etiqueta, "Te lo pidió tu profe · se pasó la fecha");
  await r.ctx.close();

  // Cumplido (ya lo rindió después de que se lo pidieron): se apaga solo.
  r = await leer({}, tareasConDiagnostico(true));
  v = await r.page.evaluate(VER);
  igual("ya rendido: la tarjeta vuelve a ser la de siempre",
    [v.href, v.anillo, v.etiqueta, v.punto], ["entreno/diagnostico.html", false, "", false]);
  await r.ctx.close();

  // Sin que nadie se lo pida, tampoco.
  r = await leer({}, tareasDeMentira(false));
  v = await r.page.evaluate(VER);
  igual("sin pedido: nada iluminado", [v.href, v.anillo, v.punto], ["entreno/diagnostico.html", false, false]);
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
      mi_entreno_resumen: RESUMEN_ANA,
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
    rpc: { tareas_con_avance: tareasDeMentira(false), mi_entreno_resumen: RESUMEN_ANA,
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

/* La semana 1 del plan que sale de un diagnóstico, y a dónde manda: leído de
   PlanEntrenamiento, la misma cuenta que hace la página. */
function SEMANA_1_DEL_PLAN(detalle) {
  const g = { window: {} };
  new Function("window", require("fs").readFileSync(
    require("path").join(__dirname, "..", "js", "plan-entrenamiento.js"), "utf8"))(g.window);
  const PE = g.window.PlanEntrenamiento;
  const plan = PE.generarPlan(PE.resumir(detalle));
  const recurso = PE.recursoPrincipal(plan.semanas[0]);
  return { total: plan.semanas.length, recurso, clave: PE.claveDeAvance(recurso.href) };
}

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
    rpc: { mi_entreno_resumen: RESUMEN_ANA, progreso_dias_y_racha: rachaSinEjercicios(false) },
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
      mi_entreno_resumen: RESUMEN_ANA,
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
      mi_entreno_resumen: RESUMEN_ANA,
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

  /* --- Ya arrancó: lo que sigue guiando es la semana de su plan ---
     Los peldaños de arriba se apagaban con el primer ejercicio y el panel se
     quedaba callado justo donde se corta el camino (un tercio de los que
     hicieron el diagnóstico no volvió a entrenar). El enlace esperado no se
     escribe a mano: sale del plan de verdad, como PRIMER_RECURSO. */
  const semana1 = SEMANA_1_DEL_PLAN(diagnosticoCon({ mate: 30 }));
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: {
      mi_entreno_resumen: RESUMEN_ANA, progreso_dias_y_racha: RACHA_ANA,
      informes_diagnosticos_alumnos: [{ student_id: "u-ana", fecha: new Date().toISOString(),
        detalle: diagnosticoCon({ mate: 30 }), a_medias_pregunta: null, a_medias_fecha: null }],
      avance_del_plan: [{ clave: semana1.clave, hechos: 4 }],
    },
  });
  v = await leer(r.page);
  igual("a quien ya arrancó, la franja le muestra su plan", v.display !== "none", "true");
  igual("con la semana en que va, contada desde el diagnóstico",
    v.titulo, `Tu plan · semana 1 de ${semana1.total}`);
  igual("y lleva a donde el trabajo cuenta, con su recorte", v.enlace, semana1.recurso.href);
  igual("el botón nombra lo que va a abrir", v.cta, semana1.recurso.texto + " →");
  igual("dice cuánto lleva ahí (el número sale de avance_del_plan)", v.texto.includes("Llevas 4 hechos"), "true");
  igual("no se pinta en rojo: es su plan, no una entrega vencida", v.rojo, "false");
  igual("el emoji no va dentro de la frase", /\p{Extended_Pictographic}/u.test(v.texto), "false");
  igual("sin errores en consola", r.errores.join(" | ") || "ninguno", "ninguno");
  await r.ctx.close();

  /* --- El plan que compartió el profesor manda sobre el recalculado --- */
  const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: {
      mi_entreno_resumen: RESUMEN_ANA, progreso_dias_y_racha: RACHA_ANA,
      informes_diagnosticos_alumnos: [{ student_id: "u-ana", fecha: hace(9),
        detalle: diagnosticoCon({ mate: 30 }), a_medias_pregunta: null, a_medias_fecha: null }],
    },
    training_plans: [{ student_id: "u-ana", shared: true, nota: "", plan: { diagnostico_fecha: hace(9), generado: { semanas: [
      { titulo: "Semana 1 · 👑 Mates", recursos: [{ texto: "Mates en uno", href: "entreno/mates.html?cat=mate1" }] },
      { titulo: "Semana 2 · 🏁 Finales", recursos: [
        { texto: "Curso de finales", href: "cursos/finales-basicos.html" },
        { texto: "Ejercicios de final de peones", href: "entreno/temas.html?tema=pawnEndgame" }] },
    ] } } }],
  });
  v = await leer(r.page);
  igual("con el plan del profe, a los 9 días va en SU semana 2", v.titulo, "Tu plan · semana 2 de 2");
  igual("y prefiere lo que cuenta antes que la portada de un curso", v.enlace, "entreno/temas.html?tema=pawnEndgame");
  igual("y dice que es el plan que le compartió su profe", v.texto.includes("te compartió tu profe"), "true");
  igual("sin nada hecho ahí, lo dice (y no calla)", v.texto.includes("Todavía no has hecho nada ahí"), "true");
  await r.ctx.close();

  /* --- Un recurso con esquema no se vuelve enlace, ni en la franja --- */
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: {
      mi_entreno_resumen: RESUMEN_ANA, progreso_dias_y_racha: RACHA_ANA,
      informes_diagnosticos_alumnos: [{ student_id: "u-ana", fecha: hace(1),
        detalle: diagnosticoCon({ mate: 30 }), a_medias_pregunta: null, a_medias_fecha: null }],
    },
    training_plans: [{ student_id: "u-ana", shared: true, nota: "", plan: { diagnostico_fecha: hace(1), generado: { semanas: [
      { titulo: "Semana 1 · Mates", recursos: [{ texto: "Mates", href: "javascript:alert(1)" }] }] } } }],
  });
  igual("un plan del profe con javascript: no pinta la franja",
    await r.page.evaluate(() => getComputedStyle(document.getElementById("pendientes-aviso")).display), "none");
  await r.ctx.close();

  // --- Con el plan ya terminado (más de cuatro semanas), el panel se calla ---
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: {
      mi_entreno_resumen: RESUMEN_ANA, progreso_dias_y_racha: RACHA_ANA,
      informes_diagnosticos_alumnos: [{ student_id: "u-ana", fecha: hace(40),
        detalle: diagnosticoCon({ mate: 30 }), a_medias_pregunta: null, a_medias_fecha: null }],
    },
  });
  igual("a quien ya resolvió ejercicios y terminó su plan no se le repite nada",
    await r.page.evaluate(() => getComputedStyle(document.getElementById("pendientes-aviso")).display), "none");
  await r.ctx.close();

  /* --- Y lo que VENCE manda sobre la sugerencia ---
     Una fecha le gana siempre a un consejo. Sin esto, a un alumno nuevo con una
     tarea ya puesta el panel le escondería la tarea detrás del primer paso. */
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, {
    rpc: {
      tareas_con_avance: tareasDeMentira(false),
      mi_entreno_resumen: RESUMEN_ANA,
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
  console.log("\n=== Hoy te toca y tu progreso, en una sola tarjeta ===");
  const datos = datosAlumna(false);
  // Lo último que entrenó fue Visualización (una fila vieja de Mates, antes).
  datos.training_progress = [
    { student_id: "u-ana", activity: "mates", created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
    { student_id: "u-ana", activity: "visualizacion", created_at: new Date(Date.now() - 3600000).toISOString() },
  ];
  const { page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, datos);
  await page.waitForFunction(() => document.querySelector("[data-lo-ultimo]"), null, { timeout: 8000 }).catch(() => {});

  const visto = await page.evaluate(() => ({
    alumno: document.getElementById("progreso-alumno").checkVisibility(),
    profe: document.getElementById("progreso-profe").checkVisibility(),
    hoyDentro: document.getElementById("progreso-alumno").contains(document.getElementById("hoy")),
    racha: !!document.getElementById("progreso-racha"),
    numeros: ["entreno-puzzles", "entreno-lessons", "entreno-coord"].map((id) => document.getElementById(id).textContent),
    record: document.getElementById("tactics-record-text").textContent,
    tituloRecord: document.getElementById("tactics-record-title").textContent,
    saludo: document.getElementById("panel-titulo").textContent.replace(/\s+/g, " ").trim(),
    subtitulo: document.getElementById("panel-subtitulo").textContent,
    meta: window.Logros.META_DIARIA,
    registro: document.getElementById("registro-clases").checkVisibility(),
    marcas: Array.from(document.querySelectorAll("[data-lo-ultimo]")).map((m) => m.closest("a").getAttribute("href")),
    placeholder: document.getElementById("buscar-panel-campo").placeholder,
  }));
  igual("a la alumna se le muestra su tarjeta", visto.alumno, true);
  igual("y no el panel del equipo docente", visto.profe, false);
  igual("«Hoy te toca» va DENTRO de esa tarjeta: una sola, no dos seguidas", visto.hoyDentro, true);
  /* La racha de días ya la dice la meta del día («Tu racha: 4 días»): la
     tarjeta de al lado la repetía. Los tres totales siguen, dentro. */
  igual("sin la racha repetida", visto.racha, false);
  igual("los tres totales salen tal cual los contó la base", visto.numeros, ["37", "9", "24"]);
  igual("el récord de racha táctica se compara dentro de su grupo",
    visto.tituloRecord, "Racha táctica del grupo 7B");
  igual("con quién lo tiene", visto.record, "Bruno Mora lleva el récord con 14 aciertos seguidos.");
  igual("«Tu progreso» no repite la puerta a Informes",
    await page.evaluate(() => document.querySelectorAll('#progreso-alumno a[href="informes.html"]').length), 0);

  // El saludo: el nombre de pila y sin género; el subtítulo, su racha.
  igual("«¡Hola, Ana!», no «¡Bienvenido, Ana Rojas!»", visto.saludo, "¡Hola, Ana! 👋");
  igual("el subtítulo dice su racha y cuánto le falta hoy", visto.subtitulo,
    "Llevas 4 días seguidos entrenando: hoy te faltan " + (visto.meta - 2) + " ejercicios para no cortarla.");
  igual("el buscador le sugiere cosas que tiene (no «Cobros»)", visto.placeholder, "Mates, tareas, aperturas…");
  /* El registro de clases del profe, al final de todo: al alumno no le toca.
     Lo suyo es «Repasar mis clases». */
  igual("sin el registro de clases", visto.registro, false);
  const consultas = await page.evaluate(() => window.__consultas);
  igual("y ni lo pide a la base", consultas.filter((c) => c.tabla === "class_sessions" && c.range).length, 0);

  /* Lo último que hizo: la tarjeta de esa página lo dice, una sola. */
  igual("«Lo último que hiciste» va en la tarjeta de Visualización, y en ninguna otra",
    visto.marcas, ["entreno/visualizacion.html"]);
  /* Lo que de verdad importa: los números NUNCA se suman en el navegador. Si
     alguien vuelve a bajarse training_progress para contar, la página se ve
     igual de bien hasta que un alumno pasa las mil filas, y ahí PostgREST
     corta sin avisar. La única lectura permitida es la de «lo último»: una
     fila, la suya. */
  const deTraining = consultas.filter((c) => c.tabla === "training_progress");
  igual("training_progress solo se pide para «lo último»: una fila y la suya",
    deTraining.map((c) => [c.limit, c.eq.student_id]), [[1, "u-ana"]]);
  igual("los totales se le piden contados a mi_entreno_resumen()",
    consultas.some((c) => c.tabla === "mi_entreno_resumen"), true);
  igual("y no a informes_resumen_alumnos(), que arma el renglón de todo el grupo",
    consultas.some((c) => c.tabla === "informes_resumen_alumnos"), false);

  // Continúa donde ibas: el curso a medias más reciente, no el terminado.
  const seguir = await page.evaluate(() => ({
    display: getComputedStyle(document.getElementById("seguir-curso")).display,
    href: document.getElementById("seguir-curso").getAttribute("href"),
    texto: document.getElementById("seguir-curso-texto").textContent,
    barra: document.getElementById("seguir-curso-barra").style.width,
  }));
  igual("«Continúa donde ibas» se ve", seguir.display !== "none", "true");
  igual("y ofrece el curso a medias más reciente, no el terminado, ni el viejo, ni uno escondido",
    seguir.href, "cursos/academia/desequilibrios-de-material.html");
  igual("diciendo por dónde iba", seguir.texto, "Desequilibrios de material — 7 de 20 temas. Lo último: La clavada.");
  igual("y la barra mide lo que dice", seguir.barra, "35%");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

const haceDias = (n) => new Date(Date.now() - n * 86400000 - 3600000).toISOString();
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
                              con_diagnostico: 29, con_plan: 29 }],
           /* Quiénes se caen del plan: ocho, y se muestran seis. La primera
              entrenó con el plan y paró; el segundo nunca lo empezó; el
              tercero trae HTML en el nombre. */
           se_caen_del_plan: [
             { id: "u-1", nombre: "Ana Rojas", desde: haceDias(20), ultima: haceDias(3), entreno_con_plan: true },
             { id: "u-2", nombre: "Beto Mora", desde: haceDias(8), ultima: null, entreno_con_plan: false },
             { id: "u-3", nombre: '<img src=x onerror="window.__xss=1">', desde: haceDias(30), ultima: haceDias(5), entreno_con_plan: true },
             ...[4, 5, 6, 7, 8].map((i) => ({ id: "u-" + i, nombre: "Alumno " + i, desde: haceDias(40), ultima: haceDias(10 + i), entreno_con_plan: true })),
           ],
           /* Quiénes entrenaron hoy: siete, se muestran seis. La segunda solo
              hizo cosas que no dicen cómo salieron (sin «limpios»); la tercera
              trae HTML en el nombre. */
           entreno_hoy_de_mis_alumnos: [
             { student_id: "u-1", nombre: "Ana Rojas", ejercicios: 12, con_como_salio: 11, limpios: 9 },
             { student_id: "u-2", nombre: "Beto Mora", ejercicios: 1, con_como_salio: 0, limpios: 0 },
             { student_id: "u-3", nombre: '<img src=x onerror="window.__xss=1">', ejercicios: 3, con_como_salio: 3, limpios: 3 },
             ...[4, 5, 6, 7].map((i) => ({ student_id: "u-" + i, nombre: "Alumno " + i, ejercicios: 2, con_como_salio: 2, limpios: 1 })),
           ] },
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

  /* Quiénes se caen del plan: el número de arriba dice cuántos; esto dice
     quiénes, con su informe a un clic. */
  await page.waitForFunction(() => !document.getElementById("profe-caen").hidden, null, { timeout: 10000 });
  const caen = await page.evaluate(() => ({
    pidio: (window.__consultas || []).filter((c) => c.tabla === "se_caen_del_plan").map((c) => c.args),
    filas: Array.from(document.querySelectorAll("#profe-caen-lista a")).map((a) => [a.getAttribute("href"), a.textContent]),
    mas: document.getElementById("profe-caen-mas").textContent,
    nodos: document.querySelectorAll("#profe-caen-lista img").length + (window.__xss || 0),
  }));
  igual("se pide a la base, con 3 días", caen.pidio, [{ p_dias: 3 }]);
  igual("se muestran seis", caen.filas.length, "6");
  igual("cada nombre lleva a su informe", caen.filas[0][0], "informes.html?alumno=u-1");
  igual("con cuántos días lleva sin entrenar", caen.filas[0][1], "Ana Rojas3 días sin entrenar");
  igual("y quien nunca empezó el plan lo dice", caen.filas[1][1], "Beto Morano empezó el plan (hace 8 días)");
  igual("el nombre va como texto: no crea ningún nodo", caen.nodos, "0");
  igual("y los que no caben, a Informes", caen.mas, "Y 2 más en Informes →");

  /* Hoy entrenaron: quién, cuánto y cuántos limpios. */
  await page.waitForFunction(() => !document.getElementById("profe-hoy").hidden, null, { timeout: 10000 });
  const hoy = await page.evaluate(() => ({
    visible: document.getElementById("profe-hoy").checkVisibility(),
    filas: Array.from(document.querySelectorAll("#profe-hoy-lista a")).map((a) => [a.getAttribute("href"), a.textContent]),
    mas: document.getElementById("profe-hoy-mas").textContent,
    nodos: document.querySelectorAll("#profe-hoy-lista img").length + (window.__xss || 0),
  }));
  igual("«Hoy entrenaron» se ve", hoy.visible, "true");
  igual("con cuánto y cuántos limpios, y el nombre lleva a su informe", hoy.filas[0], ["informes.html?alumno=u-1", "Ana Rojas12 ejercicios · 9 de 11 limpios"]);
  igual("sin «limpios» cuando nada de lo que hizo dice cómo salió", hoy.filas[1][1], "Beto Mora1 ejercicio");
  igual("seis a la vista y el resto dicho", [hoy.filas.length, hoy.mas], [6, "Y 1 alumno más."]);
  igual("el nombre va como texto: no crea ningún nodo", hoy.nodos, "0");

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
  igual("y sin nadie que se caiga del plan, ese bloque no se pinta",
    await r.page.evaluate(() => document.getElementById("profe-caen").hidden), "true");
  igual("ni «Hoy entrenaron» si nadie entrenó hoy",
    await r.page.evaluate(() => document.getElementById("profe-hoy").checkVisibility()), "false");
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

  // Quien administra no da clase: el camino de quien da clase no es suyo.
  v = await leer({ alumnos: 0, activos_7d: 0, con_diagnostico: 0, con_plan: 0,
                   tareas_puestas: 0, clases_dadas: 0 }, "u-admin");
  igual("a quien administra no se le pinta el primer paso de quien da clase", v.display, "none");

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
  /* Sin clase, las dos tarjetas grandes se quedan en una línea (ver la
     prueba de «Sesión en vivo»): el botón está, pero no se ve hasta que se
     abre la clase. */
  igual("sin clase abierta, el botón está pero en la línea compacta, no a la vista", [b.hay, b.seVe], [true, false]);
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
    role: el.getAttribute("role"),
    tabindex: el.tabIndex,
    aviso: (document.getElementById("aviso-clase") || { textContent: null }).textContent,
    texto: el.innerText.replace(/\s+/g, " ").trim(),
    seVe: el.checkVisibility(),
    // Ningún enlace a la sesión colado en la grilla mientras está bloqueada:
    // un <a> invisible pero presente sigue siendo una parada de tabulador.
    enlacesEnGrilla: document.querySelectorAll("#tile-grid a[href='sesion.html']").length,
  };
};

/* Sin clase abierta, al alumno la clase en vivo le ocupa UNA línea: las dos
   tarjetas grandes siguen en el documento (se destapan solas al abrirse la
   clase) pero no se ven. */
const LEER_LINEA = () => {
  const l = document.querySelector("#tile-grid [data-clase-compacta]");
  const g = document.getElementById("sesion-wrap").parentElement;
  return l ? { seVe: l.checkVisibility(), texto: l.innerText.replace(/\s+/g, " ").trim(), tabindex: l.tabIndex,
    role: l.getAttribute("role"), bloqueada: l.getAttribute("aria-disabled") === "true", grandes: g.checkVisibility(),
    alto: Math.round(l.closest("section").getBoundingClientRect().height) } : { seVe: false, grandes: g.checkVisibility() };
};

async function sesionLista(page) {
  await page.waitForFunction(() => {
    const c = document.getElementById("sesion-wrap");
    return !!c && !!c.firstElementChild && !/Viendo si/.test(c.firstElementChild.innerText);
  }, null, { timeout: 15000 });
  return page.evaluate(LEER_SESION);
}

/* Lo que se descubrió recorriendo el panel como lo recorre una persona ciega:
 * al terminar de cargar no se decía nada, y «Contraseña» abría un recuadro al
 * final de la página sin llevarse el foco, sin cerrar con Escape y con un campo
 * sin etiqueta. Nada de eso da ningún error: quien ve la pantalla no lo nota. */
/* Con el panel ya abierto, Alt + Mayúscula + E o el enlace «Entrenar» solo
   cambian la dirección a #entrenar: el navegador hacía scroll, pero el foco se
   quedaba donde estaba y quien no ve no se enteraba. El grupo «Entrenar» (con
   su id) es el del panel de la cuenta ciega. */
async function pruebaEntrenarConLaPaginaAbierta(browser) {
  console.log("\n=== #entrenar con el panel ya abierto (cuenta ciega) ===");
  const datos = Object.assign(datosAlumna(false), {
    vision_personas: [{ persona_id: "u-ana", vision: "ciego" }],
    local: { ai_vision_v1: JSON.stringify({ persona: "u-ana", vision: "ciego" }), ai_vision_aplicada_v1: "u-ana:ciego" },
  });
  const r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, datos);
  const { page } = r;
  await page.waitForTimeout(800);
  await page.focus("#panel-titulo").catch(() => {});
  await page.evaluate(() => { location.hash = "entrenar"; });
  await page.waitForTimeout(300);
  const salto = await page.evaluate(() => ({
    hay: !!document.querySelector("#tile-grid section#entrenar"),
    enGrupo: !!(document.activeElement && document.activeElement.closest("section#entrenar h2")),
    aviso: document.getElementById("aviso-clase").textContent,
  }));
  igual("el panel de la cuenta ciega tiene el grupo #entrenar", salto.hay, true);
  igual("#entrenar con la página abierta lleva el foco al título del grupo", salto.enGrupo, true);
  igual("…y lo dice", salto.aviso, "Estás en «Entrenar».");
  /* ¡Te reto! está adaptado y la alumna ciega no lo encontraba ni en el
     panel ni en Juegos. Y Alt + Mayúscula + M (el foco a <main>) leía el
     «Cargando tu panel… Está tardando…» que ya no se mostraba: tiene que
     estar fuera del árbol que se lee (atributo hidden, display: none). */
  const jugar = await page.evaluate(() => {
    const carga = document.getElementById("loading");
    return {
      teReto: !!document.querySelector('#tile-grid section#jugar a[href="te-reto.html"]'),
      cargaOculta: carga.hidden === true && getComputedStyle(carga).display === "none",
      mainNoLoLee: !/Cargando tu panel|Está tardando/.test(document.getElementById("main-content").innerText),
    };
  });
  igual("el grupo «Jugar» de la cuenta ciega trae ¡Te reto!", jugar.teReto, true);
  igual("«Cargando tu panel…» queda oculto de verdad (hidden y display: none) al mostrarse el panel", [jugar.cargaOculta, jugar.mainNoLoLee], [true, true]);
  const juegosHtml = require("fs").readFileSync(require("path").join(__dirname, "..", "juegos.html"), "utf8");
  igual("y Juegos (juegos.html) también lleva a ¡Te reto!", /<a href="te-reto\.html"/.test(juegosHtml), true);
  /* ciegos.html (la tarjeta «Cómo se usa el modo adaptado» de este panel)
     explicaba el Tablero y Entrenamiento, pero no la clase en vivo, los cursos
     ni los exámenes: justo lo que el profe le pide a la alumna. */
  const ciegosHtml = require("fs").readFileSync(require("path").join(__dirname, "..", "ciegos.html"), "utf8");
  igual("ciegos.html explica la clase en vivo, los cursos y los exámenes, con su enlace",
    [["h-clase", "sesion.html"], ["h-cursos", "cursos/academia/index.html"], ["h-examenes", "examenes.html"]].map(([id, href]) => {
      const sec = (ciegosHtml.match(new RegExp('<section aria-labelledby="' + id + '"[\\s\\S]*?</section>')) || [""])[0];
      return sec.includes('href="' + href + '"') && /«[^»]+»/.test(sec);
    }), [true, true, true]);
  await r.ctx.close();
}

async function pruebaLectorDePantalla(browser) {
  console.log("\n=== El panel, recorrido con lector de pantalla ===");
  const r = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, datosAlumna(false));
  const { page } = r;
  igual("al terminar de cargar, el foco va al título del panel",
    await page.evaluate(() => document.activeElement && document.activeElement.id), "panel-titulo");

  await page.click("#change-pw-btn");
  const abierto = await page.evaluate(() => {
    const d = document.querySelector("#pw-modal [role=dialog]");
    const campo = document.getElementById("new-password");
    return {
      dialogo: !!d && d.getAttribute("aria-modal") === "true" && !!document.getElementById(d.getAttribute("aria-labelledby")),
      foco: document.activeElement && document.activeElement.id,
      etiqueta: campo.labels.length ? campo.labels[0].textContent.trim() : "",
    };
  });
  igual("«Contraseña» abre un diálogo de verdad, con su título", abierto.dialogo, "true");
  igual("…que se lleva el foco al campo", abierto.foco, "new-password");
  igual("…y el campo tiene una etiqueta, no solo un placeholder", abierto.etiqueta, "Nueva contraseña");

  // Tab no se escapa del diálogo: desde el último botón vuelve al campo.
  await page.focus("#pw-save-btn");
  await page.keyboard.press("Tab");
  igual("Tab no se sale del diálogo",
    await page.evaluate(() => document.activeElement.id), "new-password");

  await page.keyboard.press("Escape");
  const cerrado = await page.evaluate(() => ({
    oculto: !document.querySelector("#pw-modal [role=dialog]").checkVisibility(),
    foco: document.activeElement && document.activeElement.id,
  }));
  igual("Escape lo cierra y el foco vuelve al botón que lo abrió",
    [cerrado.oculto, cerrado.foco], [true, "change-pw-btn"]);

  await r.ctx.close();
}

async function pruebaSesionEnVivo(browser) {
  console.log("\n=== «Sesión en vivo» se abre con la clase ===");

  // 1. Sin clase abierta: bloqueada, y diciendo por qué.
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", { viewport: { width: 1280, height: 900 } }, datosAlumna(false));
  let t = await sesionLista(r.page);
  /* Las dos tarjetas con candado ocupaban casi una pantalla del celular la
     mayor parte del día. Sin clase, queda UNA línea que dice lo mismo, y que
     se sigue alcanzando con Tab y anunciando como enlace no disponible. */
  let linea = await r.page.evaluate(LEER_LINEA);
  igual("sin clase abierta, una sola línea en vez de las dos tarjetas grandes", [linea.seVe, linea.grandes], [true, false]);
  igual("…que dice qué es y cuándo se abre",
    linea.texto, "🔒 Sesión en vivo y videollamada: Se abre cuando tu profe empiece la clase");
  igual("…y se alcanza con Tab, anunciada como enlace no disponible", [linea.tabindex, linea.role, linea.bloqueada], [0, "link", true]);
  cierto("…y ocupa poco: " + linea.alto + " px", linea.alto < 110);
  igual("la tarjeta sigue en el documento, lista para destaparse", t.hay, true);
  /* Bloqueada no es un enlace gris: sin href no recibe el foco del teclado ni
     promete un destino que no va a abrir. La misma regla de los apagados. */
  igual("…bloqueada, sin enlace y sin prometer destino", [t.tag, t.href, t.bloqueada], ["DIV", null, true]);
  igual("…y NO queda ningún enlace a sesion.html en la grilla", t.enlacesEnGrilla, "0");
  /* Pero SÍ se alcanza con Tab: saltándosela, quien usa lector de pantalla no
     se enteraba de que la sesión en vivo existe ni de por qué está cerrada. Se
     anuncia como «enlace, no disponible» y sigue sin destino. */
  igual("…y se alcanza con Tab, anunciada como enlace no disponible", [t.tabindex, t.role], [0, "link"]);
  igual("…y al cargar no se anuncia nada: la tarjeta ya lo dice", t.aviso, "");
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
  linea = await r.page.evaluate(LEER_LINEA);
  igual("…vuelven las dos tarjetas grandes y la línea se va", [linea.seVe, linea.grandes], [false, true]);
  /* Quien ve la pantalla nota que la tarjeta cambió; quien no la ve, solo se
     entera si una región viva se lo dice. */
  igual("…y se le AVISA en la región viva, con el nombre de quien la abrió",
    /abrió la clase: ya puedes entrar/.test(t.aviso), "true");
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
  igual("…también en la línea compacta", /Pide que te asignen un profesor/.test((await r.page.evaluate(LEER_LINEA)).texto), true);
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
module.exports = { panel, clienteFalso, igual, mal, bien, datosAlumna, ALUMNA, PROFE, ADMIN, CHROME, BASE, fallos: () => fallos };
if (require.main !== module) return;

/* ---------- Solo lo que hace falta, y el panel sin esperar de más ----------
   El diagnóstico se esconde si se hizo hace poco (y vuelve a las cuatro
   semanas, o si el profe lo pide); «Hoy te toca» dice la próxima medalla; la
   franja dice cuánto lleva de cada tarea; «Tus clases» se pliega; y el panel
   ya no espera a que lleguen los diez scripts de «Hoy te toca». */
async function pruebaLoQueHaceFalta(browser) {
  console.log("\n=== Solo lo que hace falta ===");
  const hace = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const conDiag = (dias, extra) => Object.assign(datosAlumna(false), extra || {}, {
    rpc: Object.assign({}, datosAlumna(false).rpc, (extra && extra.rpc) || {},
      { informes_diagnosticos_alumnos: [{ student_id: "u-ana", fecha: hace(dias), detalle: diagnosticoCon({}) }] }),
  });
  const tarjeta = (pg) => pg.evaluate(() => {
    const a = document.querySelector("#tile-grid a[href^='entreno/diagnostico.html']");
    return a ? { seVe: a.checkVisibility(), texto: a.innerText.replace(/\s+/g, " ").trim() } : null;
  });
  const esperarDiag = (pg) => pg.waitForFunction(() => window.__consultas.some((c) => c.tabla === "informes_diagnosticos_alumnos"), null, { timeout: 10000 }).then(() => pg.waitForTimeout(300)).catch(() => {});

  // 2. El diagnóstico: escondido si lo hizo hace poco, «Toca repetirlo» a las cuatro semanas.
  let { page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, conDiag(5));
  await esperarDiag(page);
  igual("hecho hace 5 días, la tarjeta del diagnóstico no está", await tarjeta(page), null);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
  ({ page, ctx } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, conDiag(40)));
  await esperarDiag(page);
  const t40 = await tarjeta(page);
  igual("hecho hace 40 días, vuelve y dice que toca repetirlo",
    t40 && [t40.seVe, /Toca repetirlo: ya pasaron cuatro semanas/.test(t40.texto)], [true, true]);
  await ctx.close();
  ({ page, ctx } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, conDiag(5, { rpc: { tareas_con_avance: tareasConDiagnostico(false) } })));
  await esperarDiag(page);
  const tPedido = await tarjeta(page);
  igual("hecho hace 5 días pero el profe se lo pidió: se ve, iluminada",
    tPedido && [tPedido.seVe, /Te lo pidió tu profe/.test(tPedido.texto)], [true, true]);
  await ctx.close();

  // 3. La próxima medalla: la más cerca de las empezadas, con cuánto le falta.
  ({ page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, datosAlumna(false)));
  await page.waitForFunction(() => { const m = document.getElementById("hoy-medalla"); return m && !m.hidden; }, null, { timeout: 15000 }).catch(() => {});
  const medalla = await page.evaluate(() => {
    const el = document.getElementById("hoy-medalla");
    const r = { seVe: !!el && el.checkVisibility(), texto: el ? el.textContent : "", href: el ? el.getAttribute("href") : null };
    return r;
  });
  const esperada = await page.evaluate(() => window.Logros.cargar().then((r) => {
    const l = window.HoyTeToca.proximaMedalla(r.logros);
    return l ? { nombre: l.nombre, falta: l.meta - l.valor, empezada: l.valor > 0 && !l.conseguido } : null;
  }));
  igual("«Hoy te toca» dice la próxima medalla, con cuánto le falta y a Logros",
    [medalla.seVe, esperada && new RegExp("para la medalla «" + esperada.nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "»").test(medalla.texto),
     esperada && medalla.texto.includes(String(esperada.falta)), medalla.href],
    [true, true, true, "logros.html"]);
  igual("y es una que ya empezó y no tiene", esperada && esperada.empezada, true);

  /* 5. «Tus clases»: sin última clase ni puntos del mes, a quien tiene profe
     le queda su calendario; las otras dos no se pintan vacías. Sin profe, ni
     eso: el bloque no está (pruebaCalendario). */
  igual("sin última clase ni puntos del mes, «Tus clases» trae solo el calendario",
    await page.evaluate(() => ["tus-clases", "calendario-alumno", "ultima-clase", "puntos-mes"].map((id) => document.getElementById(id).checkVisibility())),
    [true, true, false, false]);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  // 4. La franja dice cuánto lleva de cada tarea.
  const conAvance = tareasDeMentira(false).map((t, i) => Object.assign({}, t, {
    items: i === 0 ? [{ meta_tipo: "cantidad", meta_cantidad: 10, hecho: 4 }]
      : [{ meta_tipo: "cantidad", meta_cantidad: 5, hecho: 5 }, { meta_tipo: "completar", meta_cantidad: 1, hecho: 0 }],
    cumplidos: i === 0 ? 0 : 1,
  }));
  ({ page, ctx } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, Object.assign(datosAlumna(false), {
    rpc: Object.assign({}, datosAlumna(false).rpc, { tareas_con_avance: conAvance }) })));
  await page.waitForFunction(() => !document.getElementById("pendientes-aviso-tareas").hidden, null, { timeout: 10000 }).catch(() => {});
  const avance = await page.evaluate(() => Array.from(document.querySelectorAll("#pendientes-aviso-tareas li")).map((li) => {
    const sp = li.querySelectorAll("span"), barra = li.querySelector("[aria-hidden=true] > div");
    return [sp[0].textContent, sp[1].textContent, barra.style.width];
  }));
  igual("la franja dice cuánto lleva de cada tarea (tres como mucho), con su barra",
    avance, [["Finales de rey y peón", "4 de 10", "40%"], ["Mates en dos", "1 de 2 partes", "50%"], ["Repaso largo", "1 de 2 partes", "50%"]]);
  await ctx.close();

  // 6. El panel no espera a «Hoy te toca»: sus scripts colgados no lo detienen.
  const ctx2 = await browser.newContext({ serviceWorkers: "block" });
  await ctx2.route("**/js/hoy-te-toca.js", () => {});   // no contesta nunca
  await ctx2.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx2.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx2.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx2.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso([ALUMNA, PROFE], "u-ana", clasesDeMentira(), datosAlumna(false)) }));
  const p2 = await ctx2.newPage();
  const t0 = Date.now();
  await p2.goto(BASE + "/clases.html", { waitUntil: "domcontentloaded" });
  await p2.waitForSelector("#app:not(.hidden)", { timeout: 20000 }).catch(() => {});
  const tarda = Date.now() - t0;
  cierto("con «Hoy te toca» sin llegar, el panel aparece igual y sin esperar el tope de 6 s (" + tarda + " ms)", tarda < 4000);
  await ctx2.close();

  // A quien da clase, la clase en vivo se le ve entera: la abre él.
  ({ page, ctx } = await panel(browser, [PROFE, ALUMNA], "u-profe", {}, { profesor_videollamada: [] }));
  igual("a la profesora no se le compacta la clase en vivo",
    await page.evaluate(() => { const l = document.querySelector("[data-clase-compacta]"); return !l || !l.checkVisibility(); }), true);
  await ctx.close();
}

/* ---------- Los grupos de entrenamiento se pliegan en el celular ----------
   El panel del alumno medía en el celular unas nueve pantallas y «Jugar y
   competir» quedaba a seis. Los seis grupos de entrenamiento arrancan
   cerrados en el celular y abiertos en la computadora; se recuerda lo que
   cada quien abre; y el buscador los abre mientras busca, o un resultado
   dentro de un grupo cerrado no se vería. */
async function pruebaPlegables(browser) {
  console.log("\n=== Los grupos de entrenamiento se pliegan en el celular ===");
  const PLEGABLES = ["Aprender", "Estudiar", "Entrenamiento básico", "Entrenamiento intermedio",
    "Entrenamiento avanzado", "Mejorar por habilidades"];
  const estado = (page) => page.evaluate(() => Array.from(document.querySelectorAll("#tile-grid > section")).map((s) => {
    const h = s.querySelector("h2"), b = h.querySelector("button"), g = s.querySelector(".grid");
    return { titulo: h.textContent, boton: b ? b.getAttribute("aria-expanded") : null, grilla: g.checkVisibility() };
  }));
  const celular = { viewport: { width: 390, height: 800 } };
  let { page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", celular, datosAlumna(false));
  let e = await estado(page);
  igual("en el celular, los seis grupos de entrenamiento arrancan cerrados",
    e.filter((x) => x.boton === "false" && !x.grilla).map((x) => x.titulo), PLEGABLES);
  igual("el resto no se pliega: se ve como siempre (la clase en vivo, sin clase, va en su línea)",
    e.filter((x) => !PLEGABLES.includes(x.titulo) && x.titulo !== "Clase en vivo").every((x) => x.boton === null && x.grilla), true);
  igual("el título sigue siendo un encabezado, y dice cuántos accesos tiene",
    await page.evaluate(() => document.querySelector("#tile-grid [aria-controls]").closest("section").querySelector("h2 + span").textContent),
    "8 accesos");
  const jugar = await page.evaluate(() => {
    const s = Array.from(document.querySelectorAll("#tile-grid > section")).find((x) => x.querySelector("h2").textContent === "Jugar y competir");
    return Math.round(s.getBoundingClientRect().top + scrollY);
  });
  cierto("«Jugar y competir» queda a menos de cuatro pantallas (" + jugar + " px; antes, unos 5000)", jugar < 3200);

  // Abrir uno: se ve, lo dice, y se recuerda al volver.
  await page.click('#tile-grid h2 button:has-text("Entrenamiento básico")');
  e = await estado(page);
  igual("al tocarlo se abre y lo dice (aria-expanded)", e.find((x) => x.titulo === "Entrenamiento básico"), { titulo: "Entrenamiento básico", boton: "true", grilla: true });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)");
  e = await estado(page);
  igual("y sigue abierto al volver al panel, en este aparato",
    e.filter((x) => x.boton === "true").map((x) => x.titulo), ["Entrenamiento básico"]);

  // Buscar abre los grupos; borrar los deja como estaban.
  await buscar(page, "visualizacion");
  igual("buscando, el resultado se ve aunque su grupo esté cerrado",
    await page.evaluate(() => document.querySelector('#tile-grid a[href="entreno/visualizacion.html"]').checkVisibility()), true);
  await buscar(page, "");
  igual("y al borrar vuelve a cerrarse", await page.evaluate(() => document.querySelector('#tile-grid a[href="entreno/visualizacion.html"]').checkVisibility()), false);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  ({ page, ctx } = await panel(browser, [ALUMNA, PROFE], "u-ana", { viewport: { width: 1280, height: 900 } }, datosAlumna(false)));
  e = await estado(page);
  igual("en la computadora arrancan abiertos, que ahí sí caben",
    e.filter((x) => PLEGABLES.includes(x.titulo)).every((x) => x.boton === "true" && x.grilla), true);
  await ctx.close();

  // A quien da clase también se le pliegan, menos la clase en vivo y «Tu cuenta».
  ({ page, ctx } = await panel(browser, [PROFE], "u-profe", celular));
  igual("a la profesora se le pliegan sus grupos en el celular, menos la clase en vivo y «Tu cuenta»",
    await page.evaluate(() => Array.from(document.querySelectorAll("#tile-grid > section")).map((s) =>
      [s.querySelector("h2").textContent, !!s.querySelector("h2 button[aria-expanded=false]")])),
    [["Clase en vivo", false], ["Tus alumnos", true], ["Tus clases", true], ["Aprender", true], ["Jugar y competir", true], ["Tu cuenta", false]]);
  await ctx.close();
}

/* ---------- «Hoy te toca», también en el panel ----------
   Vivía solo en el hub de Entrenamiento, y desde que el panel abre el
   entrenamiento tarjeta por tarjeta el alumno ya no pasa por el hub. Es el
   mismo módulo (js/hoy-te-toca.js): acá se mira que salga, con las direcciones
   bien armadas desde la raíz, que no repita lo que ya dice la franja (el plan y
   hacer el diagnóstico) y que a quien da clase no le salga. */
async function pruebaHoyEnElPanel(browser) {
  console.log("\n=== «Hoy te toca», en el panel del alumno ===");
  const d = (dias) => new Date(Date.now() + dias * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
  const ficha = (vence) => ({ facilidad: 2.5, intervalo: 1, repasos: 1, fallos: 0, vence, ultimo: "2026-01-01T00:00:00Z" });
  const local = {
    entreno_temas_repaso_v1: JSON.stringify({ a: Object.assign(ficha(d(-1)), { tema: "fork" }), b: Object.assign(ficha(d(3)), { tema: "pin" }) }),
    aperturas_srs_v1: JSON.stringify({ l1: ficha(d(-1)) }),
  };
  let { page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, { local });
  await page.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, null, { timeout: 15000 }).catch(() => {});
  const items = await page.evaluate(() => Array.from(document.querySelectorAll("#hoy-lista a")).map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")]));
  igual("se ve", await page.evaluate(() => document.getElementById("hoy").checkVisibility()), "true");
  igual("con las direcciones desde la raíz del sitio (dos colas: un solo repaso del día)", items,
    [["🔁Repaso del día: 2 en 2 secciones (Ejercicios por tema 1 · Aperturas 1)", "entreno/temas.html?repaso=1"]]);
  igual("sin diagnóstico, no lo propone: ya lo ofrecen la franja y su tarjeta",
    items.filter(([t]) => /diagn/i.test(t)).length, "0");
  igual("va después de lo que vence y antes de la grilla", await page.evaluate(() => {
    const hoy = document.getElementById("hoy");
    return !!(document.getElementById("pendientes-aviso").compareDocumentPosition(hoy) & Node.DOCUMENT_POSITION_FOLLOWING)
      && !!(hoy.compareDocumentPosition(document.getElementById("tile-grid")) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), "true");
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  /* Sin nada pendiente, una sugerencia. Primero, la del DIAGNÓSTICO: lo
     flojo, con dónde practicarlo (el primer recurso que cuenta del área,
     leído del plan de verdad: PRIMER_RECURSO). Mates al 30 %: es lo único
     flojo, así que la sugerencia es esa, cualquier día. */
  const leerSug = (pg) => pg.evaluate(() => Array.from(document.querySelectorAll("#hoy-lista a"))
    .map((a) => [a.textContent.replace("→", "").trim(), a.getAttribute("href")]));
  const esperar = (pg) => pg.waitForFunction(() => document.querySelectorAll("#hoy-lista a").length > 0, null, { timeout: 15000 }).catch(() => {});
  const conDiag = { rpc: { progreso_dias_y_racha: RACHA_ANA },
    local: { diagnostico_resultado_v1: JSON.stringify({ fecha: new Date().toISOString(), detalle: diagnosticoCon({ mate: 30 }) }) } };
  ({ page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, conDiag));
  await esperar(page);
  const mate = PRIMER_RECURSO.mate;
  const nombreMate = await page.evaluate(() => window.PlanEntrenamiento.AREA_POR_ID.mate.nombre);
  igual("sin nada pendiente, la sugerencia sale de su diagnóstico: lo flojo, con dónde practicarlo",
    await leerSug(page), [["💡Sugerencia de hoy, por tu diagnóstico en " + nombreMate.toLowerCase() + ": " + mate.texto, mate.href]]);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  /* Sin diagnóstico: una página cuyo trabajo cuenta, de la lista de Tareas
     (MaterialPlataforma), dicha como sugerencia. */
  ({ page, ctx, errores } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, { rpc: { progreso_dias_y_racha: RACHA_ANA } }));
  await esperar(page);
  const sug = await page.evaluate(() => {
    const a = document.querySelector("#hoy-lista a");
    const h = a && window.MaterialPlataforma.HERRAMIENTAS.find((x) => x.href === "entreno/" + a.getAttribute("href").replace(/^entreno\//, ""));
    return a ? { texto: a.textContent.replace("→", "").trim(), cuenta: !!h && h.metas.includes("cantidad"), nombre: h && h.label, n: document.querySelectorAll("#hoy-lista a").length } : null;
  });
  igual("sin diagnóstico, UNA sugerencia, dicha como sugerencia",
    sug && [sug.n, sug.texto], sug && [1, "💡Sugerencia de hoy: " + sug.nombre]);
  igual("y es de una página cuyo trabajo cuenta", sug && sug.cuenta, true);
  await ctx.close();

  /* Sin ni un ejercicio hecho, nada: la franja de arriba («Por dónde
     empezar») ya le dice a dónde ir, y el mismo destino dos veces en el panel
     hace pensar que son dos cosas. */
  const sinNada = JSON.parse(JSON.stringify(RACHA_ANA));
  Object.assign(sinNada[0], { total_ejercicios: 0, hoy_ejercicios: 0, racha_actual: 0, por_actividad: {} });
  ({ page, ctx } = await panel(browser, [ALUMNA, PROFE], "u-ana", {}, { rpc: { progreso_dias_y_racha: sinNada }, local: conDiag.local }));
  await page.waitForFunction(() => document.getElementById("hoy-meta") && !document.getElementById("hoy-meta").hidden, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  igual("sin ningún ejercicio hecho, no hay sugerencia (ya la dice la franja)", await leerSug(page), []);
  await ctx.close();

  ({ page, ctx } = await panel(browser, [PROFE], "u-profe", {}, { local }));
  igual("a quien da clase no le sale", await page.evaluate(() => {
    const h = document.getElementById("hoy");
    return !h.checkVisibility() && !h.children.length;
  }), "true");
  await ctx.close();
}

/* ---------- Con la base saturada, el panel no se queda cargando ----------
   En hora pico la base cortaba las consultas por statement timeout y el panel
   no aparecía hasta que terminaba la última: «Cargando tu panel…» durante
   minutos, y si algo reventaba a mitad, para siempre. Se simula con consultas
   que no contestan nunca, que es peor que lento. */
async function pruebaBaseLenta(browser) {
  console.log("\n=== Con la base saturada, el panel no se queda cargando ===");
  const abrir = async (perfiles, quien, datos) => {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
    await ctx.route("**/js/supabase-client.js", (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfiles, quien, clasesDeMentira(), datos) }));
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(BASE + "/clases.html", { waitUntil: "domcontentloaded" });
    return { ctx, page, errores };
  };
  const seVe = (page, id) => page.evaluate((i) => {
    const el = document.getElementById(i);
    return !!el && el.checkVisibility();
  }, id);
  const esperarPanel = (page) => page.waitForFunction(() => document.getElementById("app").checkVisibility(), null, { timeout: 12000 }).catch(() => {});

  // Una alumna: su racha no contesta nunca, lo demás sí.
  let { ctx, page, errores } = await abrir([ALUMNA, PROFE], "u-ana", { colgar: ["progreso_dias_y_racha"] });
  const t0 = Date.now();
  await esperarPanel(page);
  igual("a la alumna se le muestra el panel aunque una consulta no conteste", await seVe(page, "app"), "true");
  cierto("y a los pocos segundos (tope de 6 s), no cuando la base se digne", Date.now() - t0 < 10000);
  igual("con su «Tu progreso»", await seVe(page, "progreso-alumno"), "true");
  await ctx.close();

  // La profesora: «Tu semana» no contesta nunca.
  ({ ctx, page } = await abrir([PROFE], "u-profe", { colgar: ["panel_profesor"] }));
  await esperarPanel(page);
  igual("a la profesora también, con «Tu semana» colgada", await seVe(page, "app"), "true");
  await ctx.close();

  /* Algo revienta a mitad de la carga (acá, mis_clases lanza en vez de
     devolver un error). Antes la promesa de init() se caía sin que nadie la
     atajara y la rueda seguía girando para siempre. */
  ({ ctx, page, errores } = await abrir([ALUMNA, PROFE], "u-ana", { lanzar: ["mis_clases"] }));
  await esperarPanel(page);
  igual("si algo revienta después del perfil, se muestra el panel con lo que haya", await seVe(page, "app"), "true");
  igual("y el error no se traga: sigue saliendo (y así llega a Sentry)",
    errores.some((e) => e.includes("se cayó mis_clases")), "true");
  await ctx.close();

  /* Y si ni lo imprescindible contesta (las clases de la alumna), no se deja
     la rueda sola: a los 15 s dice qué pasa y ofrece volver a intentar. */
  ({ ctx, page } = await abrir([ALUMNA, PROFE], "u-ana", { colgar: ["mis_clases"] }));
  igual("antes de los 15 s todavía no se asusta a nadie", await seVe(page, "loading-lento"), "false");
  await page.waitForFunction(() => document.getElementById("loading-lento").checkVisibility(), null, { timeout: 20000 }).catch(() => {});
  igual("a los 15 s dice que está tardando", await seVe(page, "loading-lento"), "true");
  igual("y ofrece volver a intentar",
    await page.evaluate(() => document.getElementById("loading-reintentar").textContent), "Volver a intentar");
  igual("el aviso está dentro de la región que se anuncia (role=status)",
    await page.evaluate(() => !!document.getElementById("loading-lento").closest("[role=status]")), "true");
  await ctx.close();
}

/* Las seis de «qué más le falta al panel»: la próxima clase en la línea de la
   clase en vivo, lo que más usa arriba, cuánto lleva en cada tarjeta, los
   avisos de Competir, «Tu cuenta» en tarjetas chicas y la marca «Nuevo». */
async function pruebaMasDelPanel(browser) {
  console.log("\n=== Tu próxima clase ===");
  const diaCR = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(d);
  const manana = diaCR(new Date(Date.now() + 86400000));
  // Las 4 p. m. de Costa Rica (UTC−6, sin horario de verano) son las 22:00 UTC.
  const inicio = manana + "T22:00:00Z", fin = manana + "T23:30:00Z";
  const LINEA = () => { const l = document.querySelector("[data-clase-compacta]"); return l ? l.textContent.replace(/\s+/g, " ").trim() : ""; };
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", null,
    { rpc: { mi_proxima_clase: [{ inicio, fin, titulo: "Finales", modalidad: "presencial", profesor: "Karina Rojas" }] } });
  await r.page.waitForFunction(() => /próxima/.test((document.querySelector("[data-clase-compacta]") || {}).textContent || ""), null, { timeout: 10000 }).catch(() => {});
  igual("sin clase abierta, la línea dice cuándo es la próxima", await r.page.evaluate(LINEA),
    "🔒Sesión en vivo y videollamada: Tu próxima clase («Finales») es mañana a las 4:00 p. m., presencial");
  igual("la pide a la base una vez, sin argumentos (la base sabe quién es)",
    await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "mi_proxima_clase").length), 1);
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();

  const ya = new Date(Date.now() - 10 * 60000).toISOString(), luego = new Date(Date.now() + 50 * 60000).toISOString();
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null,
    { rpc: { mi_proxima_clase: [{ inicio: ya, fin: luego, titulo: null, modalidad: "en_linea", profesor: "Karina Rojas" }] } });
  await r.page.waitForFunction(() => /ahora/.test((document.querySelector("[data-clase-compacta]") || {}).textContent || ""), null, { timeout: 10000 }).catch(() => {});
  cierto("a la hora de la clase dice que es ahora y que se abre cuando el profe la empiece",
    /Tu clase es ahora, hasta las .+, en línea\. Se abre cuando tu profe la empiece$/.test(await r.page.evaluate(LINEA)));
  await r.ctx.close();

  // Sin horario puesto la base no contesta nada, y la línea dice lo de siempre.
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {});
  await r.page.waitForTimeout(400);
  igual("sin horario, la línea dice lo de siempre", await r.page.evaluate(LINEA),
    "🔒Sesión en vivo y videollamada: Se abre cuando tu profe empiece la clase");
  await r.ctx.close();

  console.log("\n=== Lo que más usas, y cuánto llevas en cada tarjeta ===");
  const SECCIONES = [
    { seccion: "mates", minutos: 50, ejercicios: 120 },
    { seccion: "diagnostico", minutos: 40, ejercicios: 1 },
    { seccion: "curso:finales-practicos", minutos: 30, ejercicios: 0 },
    { seccion: "temas", minutos: 20, ejercicios: 1 },
    { seccion: "aprender", minutos: 10, ejercicios: 3 },
    { seccion: "coordenadas", minutos: 8, ejercicios: 0 },
    { seccion: "visualizacion", minutos: 2, ejercicios: 0 },
  ];
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, { rpc: { tiempo_por_seccion: SECCIONES } });
  await r.page.waitForFunction(() => !document.getElementById("mas-usado").hidden, null, { timeout: 10000 }).catch(() => {});
  igual("arriba, las cuatro donde más tiempo pasó (el diagnóstico no es costumbre)",
    await r.page.evaluate(() => Array.from(document.querySelectorAll("#mas-usado-lista a")).map((a) => a.getAttribute("href"))),
    ["entreno/mates.html", "cursos/academia/index.html", "entreno/temas.html", "entreno/aprender.html"]);
  igual("y se ven de verdad", await r.page.evaluate(() => document.getElementById("mas-usado").checkVisibility()), true);
  igual("los pide a la base: desde siempre y los últimos 30 días, de ESTA alumna",
    await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "tiempo_por_seccion").map((c) => [c.args.p_alumno, !!c.args.p_desde])),
    [["u-ana", false], ["u-ana", true]]);
  const avance = (href) => r.page.evaluate((h) => { const a = document.querySelector('#tile-grid a[href="' + h + '"]'); const x = a && a.querySelector("[data-avance]"); return x ? x.textContent : null; }, href);
  igual("en la tarjeta, cuánto lleva, con la unidad de Informes", await avance("entreno/mates.html"), "Llevas 120 mates");
  igual("en singular cuando es uno", await avance("entreno/temas.html"), "Llevas 1 ejercicio");
  igual("sin ejercicios contados, el tiempo", await avance("entreno/coordenadas.html"), "Llevas 8 min");
  igual("con menos de 5 minutos y nada hecho, no dice nada", await avance("entreno/visualizacion.html"), null);
  igual("los cursos no: eso lo dice «Sigue con tu curso»", await avance("cursos/academia/index.html"), null);
  await buscar(r.page, "mates");
  igual("mientras se busca, se hace a un lado", await r.page.evaluate(() => document.getElementById("mas-usado").checkVisibility()), false);
  await buscar(r.page, "");
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();

  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, { rpc: { tiempo_por_seccion: [{ seccion: "mates", minutos: 50, ejercicios: 12 }] } });
  await r.page.waitForTimeout(600);
  igual("con una sola, no hay «lo que más usas»", await r.page.evaluate(() => document.getElementById("mas-usado").checkVisibility()), false);
  await r.ctx.close();

  console.log("\n=== Competir avisa lo que lo espera ===");
  const ahora = new Date().toISOString(), hace5 = new Date(Date.now() - 5 * 86400000).toISOString();
  const chips = (page) => page.evaluate(() => { const a = document.querySelector('#tile-grid a[href="competir.html"]');
    return Array.from(a.querySelectorAll("[data-competir]")).map((x) => x.textContent); });
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {
    desafios: [
      { id: "d1", de_id: "u-bruno", para_id: "u-ana", estado: "pendiente", created_at: ahora },
      { id: "d2", de_id: "u-bruno", para_id: "u-ana", estado: "pendiente", created_at: hace5 },
      { id: "d3", de_id: "u-bruno", para_id: "u-ana", estado: "rechazado", created_at: ahora },
      { id: "d4", de_id: "u-bruno", para_id: "u-otro", estado: "pendiente", created_at: ahora },
    ],
    tournaments: [{ id: "t1", name: "Relámpago de octubre", status: "registration", created_at: ahora },
                  { id: "t0", name: "Viejo", status: "registration", created_at: hace5.replace(/^\d{4}/, (y) => String(Number(y) - 1)) }],
  });
  await r.page.waitForFunction(() => document.querySelectorAll('#tile-grid a[href="competir.html"] [data-competir]').length > 1, null, { timeout: 10000 }).catch(() => {});
  igual("dice los retos sin contestar de los últimos dos días, y el torneo abierto", await chips(r.page),
    ["Te retaron: 1 reto sin contestar", "Inscripción abierta: «Relámpago de octubre»"]);
  igual("los retos se CUENTAN, sin traer filas", await r.page.evaluate(() => window.__consultas.filter((c) => c.tabla === "desafios" && c.eq.estado === "pendiente").map((c) => [!!c.count, !!c.head])), [[true, true]]);
  igual("con un reto, la tarjeta se ilumina", await r.page.evaluate(() => document.querySelector('#tile-grid a[href="competir.html"]').classList.contains("ring-accent-500")), true);
  await r.ctx.close();

  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {
    tournaments: [{ id: "t1", name: "Relámpago", status: "in_progress", created_at: ahora }],
    tournament_registrations: [{ tournament_id: "t1", player_id: "u-ana" }],
  });
  await r.page.waitForFunction(() => document.querySelector('#tile-grid a[href="competir.html"] [data-competir]'), null, { timeout: 10000 }).catch(() => {});
  igual("si juega un torneo en curso, lo dice (y sin retos no se ilumina)",
    [await chips(r.page), await r.page.evaluate(() => document.querySelector('#tile-grid a[href="competir.html"]').classList.contains("ring-accent-500"))],
    [["Juegas «Relámpago»: va en curso"], false]);
  await r.ctx.close();

  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {
    tournaments: [{ id: "t1", name: "Relámpago", status: "in_progress", created_at: ahora }],
  });
  await r.page.waitForTimeout(600);
  igual("un torneo en curso en el que no juega no se le anuncia", await chips(r.page), []);
  await r.ctx.close();

  console.log("\n=== «Tu cuenta», en tarjetas chicas ===");
  const cuenta = (page) => page.evaluate(() => {
    const s = Array.from(document.querySelectorAll("#tile-grid > section")).find((x) => x.querySelector("h2").textContent === "Tu cuenta");
    const as = Array.from(s.querySelectorAll(".grid > *"));
    const cols = new Set(as.map((a) => Math.round(a.getBoundingClientRect().left))).size;
    return { cols, desc: as.map((a) => a.querySelectorAll("span > span")[1].checkVisibility()), alto: Math.round(s.getBoundingClientRect().height), n: as.length };
  });
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", { viewport: { width: 390, height: 800 } }, datosAlumna(false));
  let c = await cuenta(r.page);
  igual("en el celular van de a dos por fila", c.cols, 2);
  igual("y sin la descripción, que el nombre ya dice a dónde lleva", c.desc.every((v) => !v), true);
  cierto("el grupo entero mide menos de 300 px (" + c.alto + " px, con " + c.n + " tarjetas)", c.alto < 300);
  await r.ctx.close();
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, datosAlumna(false));
  c = await cuenta(r.page);
  igual("en la computadora la descripción sí se ve", c.desc.every(Boolean), true);
  await r.ctx.close();
  r = await panel(browser, [PROFE], "u-profe", null, {});
  igual("a quien da clase también: «Tu cuenta» en tarjetas chicas",
    await r.page.evaluate(() => { const a = document.querySelector('#tile-grid a[href="configuracion.html"]'); return a.classList.contains("p-3"); }), true);
  await r.ctx.close();

  console.log("\n=== La marca «Nuevo» ===");
  const contenido = require("../data/contenido-panel.json");
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {});
  await r.page.waitForFunction(() => localStorage.getItem("panel_contenido_visto_v1"), null, { timeout: 10000 }).catch(() => {});
  igual("la primera vez no marca nada (todo sería nuevo)", await r.page.evaluate(() => document.querySelectorAll("[data-nuevo]").length), 0);
  igual("y recuerda lo que había", await r.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("panel_contenido_visto_v1") || "{}")).length), Object.keys(contenido).length);
  await r.ctx.close();

  const visto = JSON.parse(JSON.stringify(contenido));
  visto["articulos.html"] = visto["articulos.html"].slice(1);
  visto["entreno/estudio.html?cat=tactica"] = visto["entreno/estudio.html?cat=tactica"].slice(2);
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, { local: { panel_contenido_visto_v1: JSON.stringify(visto) } });
  await r.page.waitForFunction(() => document.querySelectorAll("[data-nuevo]").length >= 2, null, { timeout: 10000 }).catch(() => {});
  igual("marca «Nuevo» donde hay algo que no estaba, y cuántos",
    await r.page.evaluate(() => Array.from(document.querySelectorAll("[data-nuevo]")).map((x) => [x.closest("a").getAttribute("href"), x.textContent])),
    [["entreno/estudio.html?cat=tactica", "Nuevo (2)"], ["articulos.html", "Nuevo"]]);
  /* Sin irse de la página: lo que la prueba dejó guardado se vuelve a poner en
     cada página que abre este contexto, y en articulos.html pisaría lo que se
     acaba de guardar. El nuestro se agrega después, así que corre después. */
  await r.page.evaluate(() => document.querySelector('#tile-grid a[href="articulos.html"]').addEventListener("click", (e) => e.preventDefault()));
  await r.page.click('#tile-grid a[href="articulos.html"]');
  igual("al abrir la tarjeta, deja de ser nuevo (en este aparato)",
    await r.page.evaluate(() => JSON.parse(localStorage.getItem("panel_contenido_visto_v1"))["articulos.html"].length), contenido["articulos.html"].length);
  await r.ctx.close();
}

/* La tercera tanda: favoritas, la campana, la semana en barras, «Entrenar 10
   minutos» y lo que más usa quien da clase. (El aviso del profe tiene su
   propio verificador: verificar-aviso-profe.js.) */
async function pruebaTercera(browser) {
  console.log("\n=== Tus favoritas ===");
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {});
  await r.page.waitForFunction(() => !document.getElementById("favoritas").hidden, null, { timeout: 10000 }).catch(() => {});
  igual("sin favoritas, invita a elegirlas", await r.page.evaluate(() => [document.getElementById("favoritas-vacio").checkVisibility(), document.getElementById("favoritas-elegir").textContent]),
    [true, "Elegir favoritas"]);
  await r.page.click("#favoritas-elegir");
  igual("se eligen en una ventana modal, con casillas por grupo",
    await r.page.evaluate(() => { const d = document.querySelector("dialog[data-favoritas]"); return d && [d.matches(":modal"), d.querySelectorAll("fieldset").length > 3, !!d.querySelector('input[value="entreno/mates.html"]')]; }), [true, true, true]);
  await r.page.check('dialog[data-favoritas] input[value="entreno/mates.html"]');
  await r.page.check('dialog[data-favoritas] input[value="juegos.html"]');
  await r.page.click("[data-favoritas-guardar]");
  // El `close` del <dialog> llega en otra vuelta: se espera a que se pinten.
  await r.page.waitForFunction(() => document.querySelectorAll("#favoritas-lista a").length === 2, null, { timeout: 10000 }).catch(() => {});
  igual("quedan arriba, en el orden del panel",
    await r.page.evaluate(() => Array.from(document.querySelectorAll("#favoritas-lista a")).map((a) => a.getAttribute("href"))), ["entreno/mates.html", "juegos.html"]);
  igual("se ven de verdad, y el botón ahora dice «Cambiar»",
    await r.page.evaluate(() => [document.getElementById("favoritas-lista").checkVisibility(), document.getElementById("favoritas-elegir").textContent]), [true, "Cambiar favoritas"]);
  igual("se guardan con la clave que viaja con la cuenta",
    await r.page.evaluate(() => localStorage.getItem("panel_favoritas_v1")), JSON.stringify(["entreno/mates.html", "juegos.html"]));
  await r.page.click("#favoritas-elegir");
  const tope = await r.page.evaluate(() => {
    const cs = Array.from(document.querySelectorAll("dialog[data-favoritas] input[type=checkbox]"));
    cs.filter((c) => !c.checked).slice(0, 6).forEach((c) => c.click());
    return [cs.filter((c) => c.checked).length, cs.filter((c) => !c.checked && !c.disabled).length];
  });
  igual("hasta ocho: con ocho, las demás casillas se apagan", tope, [8, 0]);
  await r.page.keyboard.press("Escape");
  igual("cancelar no cambia nada", await r.page.evaluate(() => JSON.parse(localStorage.getItem("panel_favoritas_v1")).length), 2);
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();
  const sync = require("fs").readFileSync(require("path").join(__dirname, "../js/progreso-usuario.js"), "utf8");
  igual("la clave está en la lista de lo que viaja con la cuenta", /clave: "panel_favoritas_v1"/.test(sync), true);

  // Una favorita no se repite en «Lo que más usas».
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {
    local: { panel_favoritas_v1: JSON.stringify(["entreno/mates.html"]) },
    rpc: { tiempo_por_seccion: [{ seccion: "mates", minutos: 50, ejercicios: 1 }, { seccion: "temas", minutos: 20, ejercicios: 1 }, { seccion: "aprender", minutos: 10, ejercicios: 1 }] },
  });
  await r.page.waitForFunction(() => !document.getElementById("mas-usado").hidden, null, { timeout: 10000 }).catch(() => {});
  igual("lo que ya es favorita no se repite en «Lo que más usas»",
    await r.page.evaluate(() => Array.from(document.querySelectorAll("#mas-usado-lista a")).map((a) => a.getAttribute("href"))), ["entreno/temas.html", "entreno/aprender.html"]);
  await r.ctx.close();

  console.log("\n=== La campana ===");
  const dias = (n) => new Date(Date.now() - n * 86400000).toISOString();
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {
    local: { panel_campana_vista_v1: dias(2) },
    tareas: [{ id: "t1", alumno_id: "u-ana", titulo: "Finales de torre", disponible_desde: dias(1) },
             { id: "t2", alumno_id: "u-ana", titulo: "Vieja <b>x</b>", disponible_desde: dias(5) },
             { id: "t3", alumno_id: "u-ana", titulo: "Todavía no", disponible_desde: new Date(Date.now() + 86400000).toISOString() }],
    examenes: [{ id: "e1", alumno_id: "u-ana", titulo: "Examen de mates", disponible_desde: dias(0.5) }],
    desafios: [{ id: "d1", para_id: "u-ana", estado: "pendiente", created_at: dias(3) }],
    avisos_profesor: [{ id: "a1", texto: "Mañana no hay clase.", created_at: dias(0.2) }],
    notas_alumno: [{ id: "n1", alumno_id: "u-ana", compartida: true, texto: "Muy bien la clase", created_at: dias(4) },
                   { id: "n2", alumno_id: "u-ana", compartida: false, texto: "privada", created_at: dias(1) }],
  });
  await r.page.waitForFunction(() => !document.getElementById("campana").hidden, null, { timeout: 10000 }).catch(() => {});
  igual("la campana dice cuántas nuevas hay desde la última vez", await r.page.evaluate(() => [document.getElementById("campana").checkVisibility(), document.getElementById("campana-n").textContent]),
    [true, "3 nuevas"]);
  igual("arranca cerrada y lo dice", await r.page.getAttribute("#campana", "aria-expanded"), "false");
  await r.page.click("#campana");
  igual("al abrirla lo dice, y el número se va", await r.page.evaluate(() => [document.getElementById("campana").getAttribute("aria-expanded"), document.getElementById("campana-panel").checkVisibility(), document.getElementById("campana-n").hidden]),
    ["true", true, true]);
  igual("lo último primero; lo que todavía no está disponible y la nota privada no salen; el texto va como texto",
    await r.page.evaluate(() => Array.from(document.querySelectorAll("#campana-lista li")).map((li) => li.textContent.replace(/(«[^»]*»|partida|clase\.»).*$/, "$1"))),
    ["📣Aviso de tu profe: «Mañana no hay clase.»", "📝Examen asignado: «Examen de mates»", "📋Tarea nueva: «Finales de torre»",
     "⚔️Te retaron a una partida", "✏️Tu profe anotó: «Muy bien la clase»", "📋Tarea nueva: «Vieja <b>x</b>»"]);
  igual("lo nuevo lo dice escrito", await r.page.evaluate(() => Array.from(document.querySelectorAll("#campana-lista li")).map((li) => /Nuevo$/.test(li.textContent))),
    [true, true, true, false, false, false]);
  igual("abrirla es haberlas visto (se guarda en este aparato)",
    await r.page.evaluate(() => Date.now() - new Date(localStorage.getItem("panel_campana_vista_v1")).getTime() < 60000), true);
  igual("cada fuente se pide acotada: cinco y de un mes",
    await r.page.evaluate(() => window.__consultas.filter((c) => ["tareas", "examenes", "avisos_profesor", "notas_alumno"].includes(c.tabla)).every((c) => c.limit === 5 && c.gte)), true);
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {});
  await r.page.waitForTimeout(500);
  igual("sin nada, no hay campana", await r.page.evaluate(() => document.getElementById("campana").checkVisibility()), false);
  await r.ctx.close();

  console.log("\n=== La semana en barras ===");
  const dia = (k) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date(Date.now() - k * 86400000));
  const semana = { esta: 30, anterior: 10, dias: [6, 5, 4, 3, 2, 1, 0].map((k, i) => ({ dia: dia(k), n: [0, 5, 10, 0, 3, 12, 0][i] })) };
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, Object.assign(datosAlumna(false), {}, { rpc: Object.assign(datosAlumna(false).rpc, { entreno_mi_semana: semana }) }));
  await r.page.waitForFunction(() => { const o = document.getElementById("hoy-semana-dias"); return o && o.checkVisibility(); }, null, { timeout: 15000 }).catch(() => {});
  const barras = await r.page.evaluate(() => Array.from(document.querySelectorAll("#hoy-semana-dias li")).map((li) => ({
    n: li.querySelector(".text-xs").textContent, alto: li.querySelector("[aria-hidden] > span").style.height, sr: li.querySelector(".sr-only").textContent })));
  igual("siete barras, con el número escrito debajo", barras.map((b) => b.n), ["0", "5", "10", "0", "3", "12", "0"]);
  igual("la más alta llena la caja; la de cero no se dibuja", barras.map((b) => b.alto), ["0%", "42%", "83%", "0%", "25%", "100%", "0%"]);
  igual("el lector de pantalla oye el día completo, y hoy dice «hoy»", /^hoy, [^:]+: $/.test(barras[6].sr) && !/hoy/.test(barras[0].sr), true);
  await r.ctx.close();

  console.log("\n=== Entrenar 10 minutos ===");
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, datosAlumna(false));
  await r.page.waitForFunction(() => { const b = document.getElementById("hoy-tanda"); return b && !b.hidden; }, null, { timeout: 15000 }).catch(() => {});
  igual("el botón está en «Hoy te toca» y dice con qué se arma",
    await r.page.evaluate(() => [document.getElementById("hoy-tanda-boton").checkVisibility(), /^Con .+\. La barra de abajo te lleva al siguiente\.$/.test(document.getElementById("hoy-tanda-que").textContent)]), [true, true]);
  await r.page.click("#hoy-tanda-boton");
  await r.page.waitForLoadState("domcontentloaded");
  await r.page.waitForSelector("#tanda-diez", { timeout: 15000 }).catch(() => {});
  const t = await r.page.evaluate(() => { const x = JSON.parse(localStorage.getItem("tanda_diez_v1") || "null"); const b = document.getElementById("tanda-diez");
    return { pasos: x && x.pasos.length, dura: x && Math.round((x.fin - x.inicio) / 60000), primera: x && location.pathname === x.pasos[0].href.split("?")[0], barra: b && b.checkVisibility(),
             paso: b && b.querySelector("[role=status]").textContent, reloj: b && /^⏱️ (10:00|9:5\d)$/.test(b.querySelector("[data-tanda-reloj]").textContent) }; });
  igual("arma la tanda, lleva a la primera y la barra cuenta 10 minutos",
    [t.pasos >= 2, t.dura, t.primera, t.barra, /^Paso 1 de \d: /.test(t.paso || ""), t.reloj], [true, 10, true, true, true, true]);
  await r.page.click("[data-tanda-salir]");
  igual("«Dejar la tanda» la quita", await r.page.evaluate(() => [!!document.getElementById("tanda-diez"), localStorage.getItem("tanda_diez_v1")]), [false, null]);
  await r.ctx.close();

  console.log("\n=== El registro de clases no ensancha la página en el celular ===");
  r = await panel(browser, [PROFE, ALUMNA], "u-profe", { viewport: { width: 390, height: 800 } }, {});
  await r.page.waitForSelector("#sessions-log table", { timeout: 10000 }).catch(() => {});
  igual("la tabla se desliza dentro de su caja y la página no se sale del ancho del celular",
    await r.page.evaluate(() => [!!document.querySelector("#sessions-log table"), document.documentElement.scrollWidth <= window.innerWidth]), [true, true]);
  await r.ctx.close();

  console.log("\n=== Lo que más usa quien da clase ===");
  r = await panel(browser, [PROFE, ALUMNA], "u-profe", null, { local: { panel_usos_v1: JSON.stringify({ "tareas.html": 9, "informes.html": 5, "asistencia.html": 2, "sesion.html": 20 }) } });
  await r.page.waitForTimeout(500);
  igual("las más tocadas en este aparato (desde tres; la clase en vivo ya está arriba)",
    await r.page.evaluate(() => [document.getElementById("mas-usado").checkVisibility(), Array.from(document.querySelectorAll("#mas-usado-lista a")).map((a) => a.getAttribute("href"))]),
    [true, ["tareas.html", "informes.html"]]);
  await r.page.evaluate(() => document.querySelector('#tile-grid a[href="asistencia.html"]').addEventListener("click", (e) => e.preventDefault()));
  await r.page.evaluate(() => { const s = document.querySelector('#tile-grid a[href="asistencia.html"]').closest("section"); const b = s.querySelector("h2 button[aria-expanded=false]"); if (b) b.click(); });
  await r.page.click('#tile-grid a[href="asistencia.html"]');
  igual("cada toque en una tarjeta se cuenta", await r.page.evaluate(() => JSON.parse(localStorage.getItem("panel_usos_v1"))["asistencia.html"]), 3);
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();
}

/* «Agregar a mi calendario»: el botón está para el alumno con profe, baja un
   .ics con sus clases (mis_clases_proximas), sus tareas y sus exámenes, y
   dice cuántas fechas trae. Lo bien armado del archivo lo mira
   verificar-calendario-ics.js; acá, que el panel junte lo que la base le da. */
async function pruebaCalendario(browser) {
  console.log("\n=== Agregar a mi calendario ===");
  const enDias = (d, h) => new Date(Date.now() + d * 86400000 + (h || 0) * 3600000).toISOString();
  const datos = { rpc: {
    mis_clases_proximas: [
      { horario_id: "h-1", inicio: enDias(1), fin: enDias(1, 1.5), titulo: "Finales", modalidad: "en_linea", profesor: "Karina Rojas" },
      { horario_id: "h-1", inicio: enDias(8), fin: enDias(8, 1.5), titulo: "Finales", modalidad: "en_linea", profesor: "Karina Rojas" },
    ],
    tareas_con_avance: [{ id: "t-1", titulo: "Mates en dos", vence_at: enDias(3), situacion: "pendiente", renglones: [] }],
    examenes_con_nota: [{ id: "e-1", titulo: "Examen de octubre", estado: "pendiente", vence_at: enDias(5) }],
  } };
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", { acceptDownloads: true }, datos);
  await r.page.waitForSelector("#agregar-calendario", { timeout: 10000 }).catch(() => {});
  igual("el alumno con profe ve el botón", await r.page.evaluate(() => { const b = document.getElementById("agregar-calendario"); return !!b && b.checkVisibility(); }), true);
  const [bajada] = await Promise.all([r.page.waitForEvent("download", { timeout: 10000 }).catch(() => null), r.page.click("#agregar-calendario")]);
  cierto("tocarlo baja «ajedrez-integral.ics»", bajada && bajada.suggestedFilename() === "ajedrez-integral.ics");
  if (bajada) {
    const texto = require("fs").readFileSync(await bajada.path(), "utf8");
    igual("trae las 2 clases, la tarea y el examen", (texto.match(/BEGIN:VEVENT/g) || []).length, 4);
    igual("con los UID de la tarea y el examen", [/UID:tarea-t-1@/.test(texto), /UID:examen-e-1@/.test(texto)], [true, true]);
  }
  await r.page.waitForFunction(() => /^Listo/.test(document.getElementById("agregar-calendario-estado").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("y dice cuántas fechas trajo", await r.page.evaluate(() => document.getElementById("agregar-calendario-estado").textContent),
    "Listo: se bajó «ajedrez-integral.ics» con 4 fechas. Ábrelo para agregarlas a tu calendario. Si tu profe cambia el horario, vuelve a bajarlo.");
  igual("las clases se piden para 4 semanas, y lo suyo con su id",
    await r.page.evaluate(() => [window.__consultas.find((c) => c.tabla === "mis_clases_proximas").args, window.__consultas.filter((c) => c.tabla === "tareas_con_avance").pop().args.p_alumno]),
    [{ p_dias: 28 }, "u-ana"]);
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();

  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, {});
  await r.page.waitForSelector("#agregar-calendario", { timeout: 10000 }).catch(() => {});
  await r.page.click("#agregar-calendario").catch(() => {});
  await r.page.waitForFunction(() => /Todavía/.test(document.getElementById("agregar-calendario-estado").textContent), null, { timeout: 5000 }).catch(() => {});
  igual("sin nada con fecha, lo dice y no baja un archivo vacío", await r.page.evaluate(() => document.getElementById("agregar-calendario-estado").textContent),
    "Todavía no hay clases en el horario de tu profe ni tareas o exámenes con fecha. Cuando los haya, vuelve a tocar el botón.");
  await r.ctx.close();

  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, { mis_clases: [] });
  await r.page.waitForTimeout(500);
  igual("sin profe no hay botón, y sin nada más «Tus clases» no se pinta",
    await r.page.evaluate(() => [document.getElementById("agregar-calendario").checkVisibility(), document.getElementById("tus-clases").checkVisibility()]), [false, false]);
  await r.ctx.close();

  r = await panel(browser, [PROFE, ALUMNA], "u-profe", null, {});
  await r.page.waitForTimeout(500);
  igual("quien da clase no lo ve", await r.page.evaluate(() => { const b = document.getElementById("agregar-calendario"); return !!b && b.checkVisibility(); }), false);
  await r.ctx.close();
}

/* «Retos de ejercicios»: la tarjeta dice cuántos retos te toca jugar, con la
   misma cuenta de la página (RetoEjercicios.estado). Quien da clase no la ve. */
async function pruebaRetosEjercicios(browser) {
  console.log("\n=== Retos de ejercicios: la tarjeta avisa ===");
  const fila = (o) => Object.assign({ retador_id: "u-beto", rival_id: "u-ana", retador: "Beto", rival: "Ana Rojas", nivel: "medio",
    ejercicios: ["a", "b", "c", "d", "e"], created_at: "2026-10-01T15:00:00Z", vence_at: "2099-01-01T00:00:00Z",
    mias: 0, mis_aciertos: 0, mi_ms: 0, del_otro: 0, sus_aciertos: null, su_ms: null }, o);
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, { rpc: { mis_retos_de_ejercicios: [
    fila({ id: "r1" }), fila({ id: "r2", mias: 2 }), fila({ id: "r3", mias: 5, del_otro: 1 }), fila({ id: "r4", vence_at: "2000-01-01T00:00:00Z" }) ] } });
  await r.page.waitForSelector('#tile-grid a[href="reto-ejercicios.html"] [data-retos-ejercicios]', { timeout: 10000 }).catch(() => {});
  igual("cuenta los que te toca jugar (no los que esperan al otro ni los vencidos)",
    await r.page.evaluate(() => { const c = document.querySelector('#tile-grid a[href="reto-ejercicios.html"] [data-retos-ejercicios]'); return c ? c.textContent : null; }),
    "Te toca jugar: 2 retos");
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();
  r = await panel(browser, [ALUMNA, PROFE], "u-ana", null, { rpc: { mis_retos_de_ejercicios: [fila({ id: "r3", mias: 5, del_otro: 1 })] } });
  await r.page.waitForTimeout(600);
  igual("sin nada que jugar, no hay aviso", await r.page.evaluate(() => !!document.querySelector("[data-retos-ejercicios]")), false);
  await r.ctx.close();
  r = await panel(browser, [PROFE, ALUMNA], "u-profe", null, {});
  await r.page.waitForTimeout(500);
  igual("quien da clase no tiene la tarjeta", await r.page.evaluate(() => !!document.querySelector('#tile-grid a[href="reto-ejercicios.html"]')), false);
  await r.ctx.close();
}

/* El panel para los más pequeños: pocas puertas, grandes, sin descripciones y
   con «Escúchame»; lo de leer se esconde DE VERDAD (checkVisibility). Es del
   alumno: a quien da clase la misma marca en el aparato no le cambia nada. */
async function pruebaPanelPequenos(browser) {
  console.log("\n=== El panel para los más pequeños ===");
  let r = await panel(browser, [ALUMNA, PROFE], "u-ana", { viewport: { width: 390, height: 900 } }, Object.assign(datosAlumna(false), { local: { panel_pequenos_v1: "1" } }));
  await r.page.waitForSelector("#pequenos-barra", { timeout: 10000 }).catch(() => {});
  const grupos = await r.page.evaluate(LEER_GRILLA);
  igual("cinco grupos con pocas puertas y nombres cortos", grupos.map((g) => [g.titulo, g.tiles.map((t) => t.enlace || t.etiqueta2.trim().slice(0, 14))]), [
    ["Mi clase", ["♟️Sesión en vi"]],
    ["Lo que me pidió mi profe", ["tareas.html"]],
    ["A entrenar", ["entreno/mates.html", "entreno/4x4.html", "entreno/coordenadas.html", "entreno/aprender.html"]],
    ["A jugar", ["tablero.html", "juegos.html"]],
    ["Mis premios", ["logros.html"]],
  ]);
  igual("las tarjetas dicen solo el nombre que entiende un niño", await r.page.evaluate(() =>
    ["tareas.html", "entreno/coordenadas.html", "tablero.html", "logros.html"].map((h) => document.querySelector('#tile-grid a[href="' + h + '"]').textContent.trim())),
    ["📋Mis tareas", "🎯Las casillas", "Juega con Oscar", "🏅Mis medallas"]);
  igual("lo que es para leer no se ve (buscador, números, tus clases)", await r.page.evaluate(() =>
    ["buscar-panel", "progreso-alumno", "tus-clases"].map((id) => document.getElementById(id).checkVisibility())), [false, false, false]);
  igual("lo que vence sí sigue arriba", await r.page.evaluate(() => document.getElementById("pendientes-aviso").checkVisibility()), true);
  igual("«Escúchame» dice lo que hay para tocar", await r.page.evaluate(() => {
    let dicho = null;
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { cancel() {}, speak(u) { dicho = u.text; } } });
    window.BlindNotation = undefined;
    document.getElementById("pequenos-escuchar").click();
    return dicho;
  }), "Hola Ana. Toca un dibujo para entrar: Sesión en vivo, Mis tareas, Mates, 4×4, Las casillas, Aprender, Juega con Oscar, Juegos, Mis medallas.");
  igual("la página no se sale del ancho del celular", await r.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  /* Lo que se guardó al irse se anota en sessionStorage: al recargar, la
     prueba vuelve a sembrar la marca (es lo que «ya estaba en el aparato»). */
  await r.page.evaluate(() => addEventListener("beforeunload", () => sessionStorage.setItem("marca_al_salir", localStorage.getItem("panel_pequenos_v1") || "ninguna")));
  await Promise.all([r.page.waitForNavigation({ waitUntil: "networkidle" }), r.page.click("#pequenos-volver")]);
  igual("«Volver al panel de siempre» borra la marca y recarga", await r.page.evaluate(() => sessionStorage.getItem("marca_al_salir")), "ninguna");
  igual("sin errores en la página", r.errores, []);
  await r.ctx.close();

  r = await panel(browser, [PROFE, ALUMNA], "u-profe", null, { local: { panel_pequenos_v1: "1" } });
  await r.page.waitForTimeout(500);
  igual("a quien da clase no le cambia nada", await r.page.evaluate(() => [!!document.getElementById("pequenos-barra"), document.documentElement.classList.contains("panel-pequenos")]), [false, false]);
  await r.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaTareasAlumna(browser);
    await pruebaDiagnosticoPedido(browser);
    await pruebaExamenesEnLaFranja(browser);
    await pruebaPrimerPaso(browser);
    await pruebaFranjaDeClase(browser);
    await pruebaVideollamada(browser);
    await pruebaSesionEnVivo(browser);
    await pruebaLectorDePantalla(browser);
    await pruebaEntrenarConLaPaginaAbierta(browser);
    await pruebaProgresoAlumna(browser);
    await pruebaHoyEnElPanel(browser);
    await pruebaPlegables(browser);
    await pruebaLoQueHaceFalta(browser);
    await pruebaMasDelPanel(browser);
    await pruebaCalendario(browser);
    await pruebaRetosEjercicios(browser);
    await pruebaPanelPequenos(browser);
    await pruebaTercera(browser);
    await pruebaBaseLenta(browser);
    await pruebaSemanaProfesora(browser);
    await pruebaProfesora(browser);
    await pruebaPreparacionRivales(browser);
    await pruebaUrgenteProfesora(browser);
    await pruebaTextosPorRol(browser);
    await pruebaAdmin(browser);
    await pruebaBuscador(browser);
    await pruebaPersonas(browser);
    await pruebaCoordinadorRecortado(browser);
    await pruebaRegistro(browser);
    await pruebaRegistroResumen(browser);
    await pruebaUltimaClase(browser);
    await pruebaPantalla(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl panel de la Academia está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
