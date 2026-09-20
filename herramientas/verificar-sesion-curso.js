/* Comprueba, en un navegador de verdad y con un Supabase de mentira, las dos
   herramientas con las que el profesor lleva material al tablero de la clase en
   vivo (sesion.html): la lección de curso que abre para dar la clase y la
   vista previa de Táctica.

   Existe porque sesion.html está DETRÁS DEL LOGIN y además detrás del rol:
   verificar-css.js abre las páginas sin cuenta, así que nada de esto lo ve
   nunca. Y porque lo que se rompe acá no da ningún error en pantalla.

   Cuatro cosas, por cuatro peligros distintos:

   1. QUE EL ALUMNO NO VEA LA LECCIÓN. Antes la lección se sincronizaba por
      game_state.shown_curso/shown_leccion y la veían todos. Si alguna vez
      vuelve a hacerlo, la página del alumno se ve perfectamente bien: solo que
      tiene delante el temario entero, con las respuestas de los ejercicios de
      la lección. Por eso al alumno se le sirve una fila de game_state CON esas
      dos columnas puestas —el resto que pudo quedar de antes— y se exige que
      no aparezca nada.

   2. QUE ABRIR LA LECCIÓN NO ESCRIBA NADA. El Supabase de mentira anota cada
      update, así que se puede exigir que abrir un curso no mande ni una sola
      columna a game_state: si volviera a escribirse, el alumno lo recibiría por
      Realtime aunque su página no lo pintara hoy.

   3. QUE EL BOTÓN MANDE LA POSICIÓN QUE EL PROFESOR ESTÁ VIENDO. Recorrer la
      línea de un diagrama cambia la posición; mandar siempre la inicial cuando
      él está explicando la jugada 12 no da error —se transmite una posición,
      solo que la que no era—. Se comprueba contra el archivo de datos del
      curso, leído aparte: la posición inicial primero y la de la primera jugada
      después de pulsar ▶.

   4. QUE LA VISTA PREVIA DE TÁCTICA SE VEA. El tablero se dibujaba con el
      font-size fijo del CSS (24px) dentro de casillas de 22px, así que las
      piezas se salían de su casilla. Se mide en el navegador la casilla ya
      renderizada y el tamaño real de la pieza, no la clase ni el CSS. Y que su
      botón mande la posición del ejercicio SIN abrir ninguna pregunta.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         npm install playwright chess.js@0.10.3
         node herramientas/verificar-sesion-curso.js                          */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

const CURSO = "el-mapa-de-los-finales";

/* chess.js llega por CDN en la página; acá se sirve el de node_modules, igual
   que en los demás verificadores: el navegador de la prueba no tiene por qué
   tener internet, y la versión tiene que ser la misma que usa el sitio. */
let CHESSJS = "";
for (const base of String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
                  .concat([path.join(RAIZ, "node_modules")])) {
  const f = path.join(base, "chess.js", "chess.js");
  if (!CHESSJS && fs.existsSync(f)) CHESSJS = fs.readFileSync(f, "utf8");
}
if (!CHESSJS) { console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3"); process.exit(2); }

const PROFE = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false, full_name: "Karina Rojas", email: "karina@x.cr", grupo: null, invitaciones_max: 5, invitaciones_usadas: 0 };
const ALUMNA = { id: "u-ana", role: "alumno", is_admin: false, es_coordinador: false, full_name: "Ana Rojas", email: "ana@x.cr", grupo: "7B" };

/* La fila del tablero del profesor. Se le pasan a propósito shown_curso y
   shown_leccion puestas: es el resto que puede haber quedado de cuando la
   lección se compartía, y lo que la prueba 1 exige que ya no se pinte. */
function filaDeTablero() {
  return {
    id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, last_move: null,
    arrows: [], circles: [], active_player_id: null, active_player_color: "both",
    shown_curso: CURSO, shown_leccion: 1, updated_by: "u-profe", updated_at: new Date().toISOString(),
  };
}

function clienteFalso(perfiles, usuarioId) {
  return `
window.__updates = [];   // { tabla, campos }
window.__inserts = [];   // { tabla, fila }
(function () {
  const PERFILES = ${JSON.stringify(perfiles)};
  const GAME_STATE = [${JSON.stringify(filaDeTablero())}];

  function constructor(tabla, filas) {
    let filas2 = (filas || []).slice(), unica = false, pend = null;
    const cmp = (a, b) => String(a) === String(b);
    const b = {
      select() { return b; },
      eq(col, val) { filas2 = filas2.filter((r) => cmp(r[col], val)); return b; },
      in(col, vals) { filas2 = filas2.filter((r) => vals.map(String).includes(String(r[col]))); return b; },
      gte() { return b; }, lte() { return b; }, or() { return b; },
      is(col, val) { if (val === null) filas2 = filas2.filter((r) => r[col] === null || r[col] === undefined); return b; },
      order() { return b; }, limit() { return b; }, range() { return b; },
      insert(fila) { window.__inserts.push({ tabla: tabla, fila: fila }); pend = Object.assign({ id: 1 }, fila); filas2 = [pend]; return b; },
      update(campos) { window.__updates.push({ tabla: tabla, campos: campos }); Object.assign(filas.length ? filas[0] : {}, campos); return b; },
      delete() { filas2 = []; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = filas2;
        if (unica) d = filas2.length ? filas2[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  const TABLAS = {
    profiles: PERFILES,
    game_state: GAME_STATE,
    variant_nodes: [], questions: [], question_answers: [], question_engine_answers: [],
    class_sessions: [], class_attendance: [], class_presence_log: [],
    practice_sessions: [], practice_games: [], class_chat_messages: [], saved_games: [],
  };

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      updateUser: () => Promise.resolve({ error: null }),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    rpc: (n) => constructor(n, n === "mis_clases"
      ? [{ profesor_id: "u-profe", profesor_nombre: "Karina Rojas", es_principal: true, clase_abierta: false }]
      : []),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, untrack() { return Promise.resolve(); }, presenceState: () => ({}) }),
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

async function abrir(browser, perfiles, quien) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfiles, quien) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + "/sesion.html", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
  return { page, ctx, errores };
}

/* Qué lección del curso abrir: la primera que trae diagramas de posición, y con
   qué id. Se resuelve leyendo el fragmento igual que lo lee la página (mismo
   filtro de <details> de nivel superior), porque el número de lección es
   justamente el que el selector ofrece. */
async function leccionConDiagramas(page) {
  return page.evaluate(async (curso) => {
    const r = await fetch("cursos/protegido/" + curso + ".html");
    const temp = document.createElement("div");
    temp.innerHTML = await r.text();
    const detalles = Array.from(temp.querySelectorAll("details")).filter((d) =>
      !(d.parentElement && d.parentElement.closest("details")) && d.querySelector(":scope > summary"));
    for (let i = 0; i < detalles.length; i += 1) {
      // Solo los diagramas de un final de verdad (F<final>-<diagrama>): los del
      // examen viven en otra parte del archivo de datos y la prueba compara
      // contra él.
      const diag = Array.from(detalles[i].querySelectorAll(".f100-diag[data-id]"))
        .find((d) => /^F\d+-\d+$/.test(d.dataset.id));
      if (diag) return { n: i + 1, id: diag.dataset.id };
    }
    return null;
  }, CURSO);
}

/* Las dos posiciones que el archivo de datos del curso dice que tiene ese
   diagrama: la inicial y la de después de su primera jugada. Se lee aquí, fuera
   del navegador, para no comprobar la página contra ella misma. */
function posicionesDelDiagrama(id) {
  const d = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos/protegido/data", CURSO + ".json"), "utf8"));
  for (const final of d.finales || []) {
    for (const diag of final.diagramas || []) {
      if (diag.id !== id) continue;
      return { inicial: diag.fenInicio || diag.fen, jugada1: (diag.jugadas || [])[0] ? diag.jugadas[0].fen : null };
    }
  }
  return null;
}

// ---------------------------------------------------------------- 1. el alumno
async function pruebaAlumna(browser) {
  console.log("\n=== La lección del curso, vista por una alumna ===");
  const { page, ctx, errores } = await abrir(browser, [ALUMNA, PROFE], "u-ana");

  // Su fila de game_state trae shown_curso/shown_leccion puestas: el resto de
  // cuando la lección se compartía. No tiene que aparecer nada.
  const visto = await page.evaluate(() => {
    const panel = document.getElementById("class-lesson-panel");
    return {
      seVe: panel ? panel.checkVisibility() : null,
      cuerpo: (document.getElementById("class-lesson-body").textContent || "").trim().length,
      botonCurso: document.getElementById("toggle-lesson-btn").checkVisibility(),
      selector: document.getElementById("lesson-picker-panel").checkVisibility(),
      posiciones: document.querySelectorAll("#class-lesson-body .lesson-send-btn").length,
    };
  });
  igual("el panel de la lección NO se ve", visto.seVe, false);
  igual("no se le inyectó ni un carácter de la lección", visto.cuerpo, 0);
  igual("no hay ningún botón de mandar posición", visto.posiciones, 0);
  igual("el botón «📚 Curso» es del profesor, ella no lo tiene", visto.botonCurso, false);
  igual("el selector de curso tampoco", visto.selector, false);
  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

// ------------------------------------------------- 2 y 3. el profesor y su curso
async function pruebaLeccionDelProfesor(browser) {
  console.log("\n=== El profesor abre un curso para darlo ===");
  const { page, ctx, errores } = await abrir(browser, [PROFE, ALUMNA], "u-profe");

  const leccion = await leccionConDiagramas(page);
  if (!leccion) { mal("no se encontró ninguna lección con diagramas en " + CURSO); await ctx.close(); return; }
  const esperado = posicionesDelDiagrama(leccion.id);
  if (!esperado || !esperado.jugada1) { mal("el archivo de datos no trae la línea del diagrama " + leccion.id); await ctx.close(); return; }

  await page.evaluate(() => { window.__updates = []; window.__inserts = []; });
  await page.click("#toggle-lesson-btn");
  await page.selectOption("#lesson-curso-select", CURSO);
  await page.waitForFunction(() => document.getElementById("lesson-leccion-select").options.length > 1);
  await page.selectOption("#lesson-leccion-select", String(leccion.n));
  await page.click("#lesson-show-btn");
  await page.waitForSelector("#class-lesson-body .f100-viewer", { timeout: 20000 });

  const abierta = await page.evaluate(() => ({
    seVe: document.getElementById("class-lesson-panel").checkVisibility(),
    visores: document.querySelectorAll("#class-lesson-body .f100-viewer").length,
    botones: document.querySelectorAll("#class-lesson-body .lesson-send-btn").length,
    aviso: /Solo tú ves esta lección/.test(document.getElementById("class-lesson-panel").textContent),
  }));
  igual("el panel se abre para él", abierta.seVe, true);
  igual("cada diagrama de la lección trae su botón", abierta.botones, abierta.visores);
  if (abierta.visores < 1) mal("la lección no trajo ni un diagrama: la prueba no probaría nada");
  igual("el panel avisa que solo él la ve", abierta.aviso, true);

  // 2. Abrir la lección no puede escribir NADA: si volviera a escribirse en
  //    game_state, el alumno lo recibiría por Realtime.
  const escrituras = await page.evaluate(() => window.__updates.map((u) => u.tabla + ":" + Object.keys(u.campos).join("+")));
  igual("abrir la lección no manda ningún update", escrituras, []);

  // 3. El botón manda la posición que está EN PANTALLA, no siempre la inicial.
  const visorSel = '#class-lesson-body .f100-diag[data-id="' + leccion.id + '"]';
  await page.waitForSelector(visorSel + ".f100-viewer");
  igual("el visor publica la posición inicial del diagrama",
    await page.getAttribute(visorSel, "data-fen-actual"), esperado.inicial);

  await page.evaluate(() => { window.__updates = []; });
  await page.click(visorSel + " .lesson-send-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state"));
  const mandado1 = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").map((u) => u.campos));
  igual("desde la posición inicial manda esa posición", mandado1.map((c) => c.fen), [esperado.inicial]);
  igual("y la manda como inicio de partida, sin jugadas ni marcas",
    mandado1.map((c) => [c.start_fen === esperado.inicial, (c.moves || []).length, (c.arrows || []).length, c.active_player_id]),
    [[true, 0, 0, null]]);

  // Ahora una jugada adelante: lo que se manda tiene que cambiar con ella.
  await page.click(visorSel + ' [data-act="next"]');
  await page.waitForFunction((args) => document.querySelector(args.sel).dataset.fenActual === args.fen,
    { sel: visorSel, fen: esperado.jugada1 }, { timeout: 10000 });
  bien("recorrer la línea mueve la posición publicada");

  await page.evaluate(() => { window.__updates = []; });
  await page.click(visorSel + " .lesson-send-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state"));
  const mandado2 = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").map((u) => u.campos.fen));
  igual("desde la jugada 1 manda la jugada 1, no la inicial", mandado2, [esperado.jugada1]);

  // Y el tablero de la clase se queda de verdad en esa posición.
  igual("el tablero del profesor también quedó ahí",
    (await page.evaluate(() => board.fen())).split(" ").slice(0, 2).join(" "),
    esperado.jugada1.split(" ").slice(0, 2).join(" "));

  // Cerrar: el panel desaparece y tampoco escribe nada.
  await page.evaluate(() => { window.__updates = []; });
  await page.click("#class-lesson-hide-btn");
  igual("cerrar la lección la quita de la pantalla",
    await page.evaluate(() => document.getElementById("class-lesson-panel").checkVisibility()), false);
  igual("y tampoco escribe nada", await page.evaluate(() => window.__updates.length), 0);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

// ------------------------------------------------------- 4. la vista previa de Táctica
async function pruebaTactica(browser) {
  console.log("\n=== La vista previa de Táctica ===");
  const { page, ctx, errores } = await abrir(browser, [PROFE, ALUMNA], "u-profe");

  await page.click("#teacher-tab-tactica");
  await page.waitForSelector("#tactics-body button", { timeout: 30000 });
  await page.click("#tactics-body button >> nth=0");                       // un grupo
  await page.waitForSelector("#tactics-body div.space-y-1\\.5 button");
  await page.click("#tactics-body div.space-y-1\\.5 button >> nth=0");     // un tema
  await page.waitForSelector("#tactics-body div.space-y-1\\.5 button");
  await page.click("#tactics-body div.space-y-1\\.5 button >> nth=0");     // una dificultad
  await page.waitForSelector("#tactics-body li");

  const primero = page.locator("#tactics-body li").first();
  await primero.getByRole("button", { name: "Vista previa" }).click();
  await page.waitForSelector("#tactics-body li .example-board");

  /* Lo que se mide es la PANTALLA: el ancho real de una casilla y el alto real
     de la pieza dibujada dentro. Preguntar por la clase o por el CSS daría
     verde sobre el tablero roto, que es el que había. */
  const medida = await page.evaluate(() => {
    const board = document.querySelector("#tactics-body li .example-board");
    const caja = board.getBoundingClientRect();
    const sq = board.querySelector(".example-sq");
    const cel = sq.getBoundingClientRect();
    const piezas = Array.from(board.querySelectorAll(".example-sq > span"));
    const desborde = piezas.filter((p) => {
      const r = p.getBoundingClientRect(), c = p.parentElement.getBoundingClientRect();
      return r.width > c.width + 1 || r.height > c.height + 1;
    }).length;
    return {
      ancho: Math.round(caja.width), alto: Math.round(caja.height),
      celda: Math.round(cel.width),
      fuente: parseFloat(getComputedStyle(sq).fontSize),
      piezas: piezas.length, desborde: desborde,
      turno: (board.parentElement.textContent.match(/Juegan (blancas|negras)/) || [])[0] || "",
    };
  });
  if (medida.ancho < 120) mal("la vista previa es un tablero de " + medida.ancho + "px: ahí no se distingue una pieza");
  else bien("el tablero mide " + medida.ancho + "px de ancho");
  igual("y es cuadrado", medida.alto, medida.ancho);
  if (medida.piezas < 4) mal("apenas " + medida.piezas + " piezas dibujadas: no se está dibujando la posición");
  else bien("dibuja las " + medida.piezas + " piezas de la posición");
  if (medida.fuente > medida.celda) mal("la pieza (" + medida.fuente + "px) es más grande que su casilla (" + medida.celda + "px): se sale");
  else bien("la pieza (" + medida.fuente + "px) cabe en su casilla (" + medida.celda + "px)");
  igual("ninguna pieza se sale de su casilla", medida.desborde, 0);
  if (!medida.turno) mal("la vista previa no dice de quién es la jugada");
  else bien("dice de quién es la jugada: " + medida.turno);

  /* El botón nuevo manda SOLO la posición: si de paso abriera una pregunta, el
     alumno estaría contestando mientras el profesor explica. */
  const fenDelEjercicio = await page.evaluate(() => {
    const ids = tacticsThemeBuckets(tacticsView.themeKey)[tacticsView.diffIndex];
    return tacticsData.puzzles[ids[0]].fen;
  });
  await page.evaluate(() => { window.__updates = []; window.__inserts = []; });
  await primero.getByRole("button", { name: "Al tablero" }).click();
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state"));
  const mandado = await page.evaluate(() => ({
    fens: window.__updates.filter((u) => u.tabla === "game_state").map((u) => u.campos.fen),
    preguntas: window.__inserts.filter((i) => i.tabla === "questions").length,
  }));
  igual("«Al tablero» manda la posición del ejercicio", mandado.fens, [fenDelEjercicio]);
  igual("y no abre ninguna pregunta", mandado.preguntas, 0);

  // "Preguntar", en cambio, sí tiene que abrirla — y con la misma posición.
  await page.evaluate(() => { window.__updates = []; window.__inserts = []; });
  await primero.getByRole("button", { name: "Preguntar" }).click();
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "questions"));
  const preguntado = await page.evaluate(() => ({
    fens: window.__updates.filter((u) => u.tabla === "game_state").map((u) => u.campos.fen),
    pregunta: (window.__inserts.find((i) => i.tabla === "questions") || {}).fila,
  }));
  igual("«Preguntar» sigue transmitiendo la posición", preguntado.fens, [fenDelEjercicio]);
  igual("y abre la pregunta con esa misma posición", preguntado.pregunta.fen, fenDelEjercicio);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaLeccionDelProfesor(browser);
    await pruebaTactica(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
