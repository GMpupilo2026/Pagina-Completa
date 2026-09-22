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

function clienteFalso(perfiles, usuarioId, semilla) {
  return `
window.__updates = [];   // { tabla, campos }
window.__inserts = [];   // { tabla, fila }
(function () {
  const PERFILES = ${JSON.stringify(perfiles)};
  const GAME_STATE = [${JSON.stringify(filaDeTablero())}];
  // Filas de arranque para las tablas que se quieran sembrar (una pregunta
  // abierta, una ronda de práctica en curso). Sin esto no hay forma de ver los
  // dos overlays del alumno, que es justo donde vive lo que se comprueba.
  const SEMILLA = ${JSON.stringify(semilla || {})};

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
      /* Desde que la clase está abierta, la alumna marca su asistencia sola
         con un upsert: sin este método la página muere con un TypeError y la
         prueba lo cuenta como fallo suyo — era el doble el que estaba
         incompleto, la misma piedra de verificar-aperturas-pagina.js. */
      upsert(fila) { window.__inserts.push({ tabla: tabla, fila: fila, upsert: true }); pend = fila; filas2 = [pend]; return b; },
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
    /* Hay clase abierta, que es la única situación en que esta pantalla
       existe para un alumno: sin ella la RLS no le entrega el tablero y la
       página le enseña la de espera. Un doble sin clase dejaría todas las
       comprobaciones de la alumna esperando un #app que no se monta. */
    class_sessions: [{ id: "s-1", created_by: "u-profe", ended_at: null,
                       started_at: new Date(Date.now() - 20 * 60000).toISOString(), title: null, notes: null }],
    class_attendance: [], class_presence_log: [],
    practice_sessions: [], practice_games: [], class_chat_messages: [], saved_games: [],
  };
  for (const t of Object.keys(SEMILLA)) TABLAS[t] = SEMILLA[t].slice();

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      updateUser: () => Promise.resolve({ error: null }),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    /* clase_abierta sale de las mismas filas que la tabla, como en la base, y
       la columna se llama "profesor": con otro nombre la pantalla se pinta
       igual y escribe «Tu profe» en su lugar. */
    rpc: (n) => constructor(n, n === "mis_clases"
      ? [{ profesor_id: "u-profe", profesor: "Karina Rojas", es_principal: true,
           clase_abierta: TABLAS.class_sessions.some((c) => c.created_by === "u-profe" && !c.ended_at) }]
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

async function abrir(browser, perfiles, quien, semilla) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfiles, quien, semilla) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + "/sesion.html", { waitUntil: "domcontentloaded" });
  // O la sesión, o la pantalla de espera: un alumno sin clase abierta no monta
  // #app, y esperarlo a secas dejaría la prueba colgada por lo que es correcto.
  await page.waitForSelector("#app:not(.hidden), #sin-clase:not(.hidden)", { timeout: 30000 });
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

  /* Que los botones de cada ejercicio QUEPAN en el panel. La columna del
     profesor mide 320px fijos y los tres botones no caben en una fila: estaban
     escritos como un grupo con shrink-0, que crece hasta su ancho de contenido
     en vez de envolverse —el flex-wrap no llega a aplicarse nunca—, así que
     «❓ Preguntar» quedaba 40px fuera del panel, cortado contra el borde y sin
     forma de apretarlo. No da ningún error: la lista se pinta entera. Se mide el
     rectángulo que calcula el navegador, no la clase. */
  const desborde = await page.evaluate(() => {
    const caja = document.getElementById("tactics-panel").getBoundingClientRect();
    const fuera = Array.from(document.querySelectorAll("#tactics-body li button"))
      .filter((b) => b.getBoundingClientRect().right > caja.right + 0.5);
    return { total: document.querySelectorAll("#tactics-body li button").length,
             fuera: fuera.length,
             cual: fuera.length ? (fuera[0].textContent || "").trim() : "" };
  });
  if (desborde.fuera) mal("se salen del panel " + desborde.fuera + " de " + desborde.total + " botones (el primero, «" + desborde.cual + "»): no se pueden ni apretar");
  else bien("los " + desborde.total + " botones de la lista caben dentro del panel");

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

/* Se mide en el navegador, sobre las casillas de verdad (por su data-square) y
   no contra lo que diga la página: una etiqueta puesta sobre la columna que no
   era se ve igual de bien y es peor que no tener ninguna. */
async function medirCoordenadas(page, id) {
  return page.evaluate((idTablero) => {
    const tablero = document.getElementById(idTablero);
    if (!tablero) return { hay: false };
    const outer = tablero.closest(".board-coords-outer");
    if (!outer) return { hay: false };
    const letras = [...outer.querySelectorAll(".board-coords-files span")].map((s) => s.textContent);
    const numeros = [...outer.querySelectorAll(".board-coords-ranks span")].map((s) => s.textContent);
    const centro = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    // Cada letra tiene que caer sobre la columna que nombra, y cada número sobre
    // su fila. Se comparan contra la casilla de verdad, por su data-square.
    let peorLetra = 0, peorNumero = 0;
    const lado = tablero.getBoundingClientRect().width / 8;
    [...outer.querySelectorAll(".board-coords-files span")].forEach((span, i) => {
      const casilla = tablero.querySelector('[data-square="' + letras[i] + numeros[0] + '"]');
      if (!casilla) { peorLetra = Infinity; return; }
      peorLetra = Math.max(peorLetra, Math.abs(centro(span).x - centro(casilla).x));
    });
    [...outer.querySelectorAll(".board-coords-ranks span")].forEach((span, i) => {
      const casilla = tablero.querySelector('[data-square="' + letras[0] + numeros[i] + '"]');
      if (!casilla) { peorNumero = Infinity; return; }
      peorNumero = Math.max(peorNumero, Math.abs(centro(span).y - centro(casilla).y));
    });
    const r = tablero.getBoundingClientRect();
    return {
      hay: true, letras, numeros, peorLetra, peorNumero, lado,
      ancho: Math.round(r.width), alto: Math.round(r.height),
      seVe: outer.checkVisibility ? outer.checkVisibility() : true,
    };
  }, id);
}

/* ------------------------------------------------ 4. las coordenadas del alumno
   Los dos overlays del alumno —la pregunta y la práctica contra el motor— son
   los únicos tableros de la clase donde está SOLO: el profesor no le está
   señalando la casilla y no tiene al lado el cuadro de comandos. Sin las
   coordenadas de afuera hay que contar las filas con el dedo para leer una
   jugada, y en el resto del sitio (Mates, Temas, 4×4, el diagnóstico) ya las
   tiene siempre.

   Lo que se mide es la PANTALLA y no la clase ni la opción que se le pasó: que
   estén las 8 letras y los 8 números, que cada letra caiga sobre su columna
   —las coordenadas señalando la columna que no era son peores que no tenerlas,
   y se ven igual de bien— y que el tablero siga cuadrado. Girado (el alumno con
   negras) el orden se invierte, que es lo que hace un tablero de verdad. */
async function pruebaCoordenadasDelAlumno(browser) {
  console.log("\n=== Las coordenadas en los tableros del alumno ===");
  // Una posición en la que le toca mover a las NEGRAS: así el tablero le queda
  // girado y de paso se comprueba que las etiquetas se giran con él.
  const FEN_PREGUNTA = "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1";
  const semilla = {
    questions: [{ id: "q-1", fen: FEN_PREGUNTA, created_by: "u-profe", expected_plies: 1,
                  closed_at: null, created_at: new Date().toISOString() }],
  };
  const { page, ctx, errores } = await abrir(browser, [ALUMNA, PROFE], "u-ana", semilla);
  await page.waitForSelector("#question-card:not(.hidden)", { timeout: 15000 });
  await page.waitForFunction(() =>
    document.querySelectorAll("#question-board [data-square]").length === 64, null, { timeout: 15000 });

  const medida = await medirCoordenadas(page, "question-board");

  igual("el tablero de la pregunta trae las coordenadas de afuera", medida.hay ? "sí" : "no", "sí");
  igual("y se ven de verdad", medida.seVe ? "sí" : "no", "sí");
  // Juegan negras: el tablero se gira, así que las letras van de la h a la a.
  igual("giradas con el tablero, como uno de verdad", (medida.letras || []).join(""), "hgfedcba");
  igual("y los números también", (medida.numeros || []).join(""), "12345678");
  if (medida.peorLetra <= medida.lado / 4) bien("cada letra cae sobre su columna (" + Math.round(medida.peorLetra) + "px de " + Math.round(medida.lado) + ")");
  else mal("una letra no cae sobre su columna: " + Math.round(medida.peorLetra) + "px de desvío en casillas de " + Math.round(medida.lado));
  if (medida.peorNumero <= medida.lado / 4) bien("cada número cae sobre su fila (" + Math.round(medida.peorNumero) + "px)");
  else mal("un número no cae sobre su fila: " + Math.round(medida.peorNumero) + "px de desvío");
  // El tope de ancho se muda al envoltorio: si se perdiera, el tablero se
  // estiraría a lo ancho de la tarjeta y dejaría de ser cuadrado.
  if (Math.abs(medida.ancho - medida.alto) <= 2) bien("el tablero sigue cuadrado: " + medida.ancho + "×" + medida.alto);
  else mal("el tablero dejó de ser cuadrado: " + medida.ancho + "×" + medida.alto);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();

  // El otro overlay del alumno: la práctica contra el motor. Es un tablero
  // aparte (practiceBoard), así que rotularlo en la pregunta no lo rotula acá.
  const FEN_PRACTICA = "8/8/4k3/8/8/4K3/4P3/8 w - - 0 1";
  const semilla2 = {
    practice_sessions: [{ id: "p-1", fen: FEN_PRACTICA, level: 1500, created_by: "u-profe",
                          ended_at: null, created_at: new Date().toISOString() }],
  };
  const dos = await abrir(browser, [ALUMNA, PROFE], "u-ana", semilla2);
  await dos.page.waitForSelector("#practice-card:not(.hidden)", { timeout: 15000 });
  await dos.page.waitForFunction(() =>
    document.querySelectorAll("#practice-board [data-square]").length === 64, null, { timeout: 15000 });
  const m2 = await medirCoordenadas(dos.page, "practice-board");
  igual("el tablero de la práctica también las trae", m2.hay ? "sí" : "no", "sí");
  igual("y se ven de verdad", m2.seVe ? "sí" : "no", "sí");
  if (m2.hay && m2.peorLetra <= m2.lado / 4) bien("cada letra cae sobre su columna (" + Math.round(m2.peorLetra) + "px de " + Math.round(m2.lado) + ")");
  else mal("una letra no cae sobre su columna: " + Math.round(m2.peorLetra) + "px");
  if (m2.hay && Math.abs(m2.ancho - m2.alto) <= 2) bien("y sigue cuadrado: " + m2.ancho + "×" + m2.alto);
  else mal("el tablero de la práctica dejó de ser cuadrado: " + m2.ancho + "×" + m2.alto);
  await dos.ctx.close();
}

/* ---------------------------------------- 5. las miniaturas de los alumnos

   Mientras la clase practica contra el motor, el profesor ve una miniatura por
   alumno debajo de su tablero. Es la pantalla con la que decide a quién ayudar,
   y todo lo que se rompe ahí se rompe callado: las tarjetas se pintan igual,
   con la posición correcta, solo que no se distingue nada.

   Pasaba lo dos veces: las tarjetas topaban en 160px —casillas de 16px— y la
   pieza se dibujaba con el glifo Unicode, que en las blancas es un contorno
   hueco sostenido por un text-shadow de 1px: a ese tamaño ese contorno le
   rellena los huecos y las blancas se ven tan oscuras como las negras. Por eso
   se mide LA PANTALLA —el alto real de la pieza contra el de su casilla, y qué
   se dibujó de verdad—, nunca la clase ni la preferencia.                    */
async function pruebaMiniaturas(browser) {
  console.log("\n=== Las miniaturas de los alumnos que están practicando ===");

  const jugadas = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"];
  const semilla = {
    // La ronda arranca de la posición inicial de siempre; cada alumno lleva ya unas
    // jugadas, que es como se ve esto en medio de una clase.
    practice_sessions: [{ id: "p-1", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                          level: 1500, created_by: "u-profe", ended_at: null, created_at: new Date().toISOString() }],
  };
  semilla.practice_games = [
    { id: "g-1", session_id: "p-1", student_id: "u-ana", student_color: "w", moves: jugadas,
      eval_cp: 120, result: null, attempt: 1, created_at: new Date().toISOString(),
      profiles: { full_name: "Daniel Alberto Ortega Ochoa Vargas", email: "d@x.cr" } },
    { id: "g-2", session_id: "p-1", student_id: "u-otro", student_color: "b", moves: jugadas,
      eval_cp: -300, result: null, attempt: 2, created_at: new Date().toISOString(),
      profiles: { full_name: "Sebastián Cruz", email: "s@x.cr" } },
  ];

  // Las dos preferencias de pieza que existen se prueban por separado, porque son
  // las dos ramas del if que decide qué se dibuja. "clasico" es la de por omisión
  // (la que tiene casi todo el mundo) y un tema de emojis es la otra: a 20px un
  // emoji tampoco dice qué pieza es.
  for (const tema of [{ estilo: "clasico", divertido: "clasico", nombre: "con la preferencia de siempre" },
                      { estilo: "clasico", divertido: "pokemon", nombre: "con el tema divertido puesto" }]) {
    const ctx = await browser.newContext({ serviceWorkers: "block" });
    await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
    await ctx.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
    await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await ctx.route("**/js/supabase-client.js", (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso([PROFE, ALUMNA], "u-profe", semilla) }));
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem("piece_style_theme_v1", t.estilo);
        localStorage.setItem("board_theme_v1", t.divertido);
      } catch (e) {}
    }, tema);
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(BASE + "/sesion.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
    await page.waitForSelector("#practice-boards-grid .practice-mini-board [data-square]", { timeout: 30000 });
    await page.waitForTimeout(400);   // el tamaño de la pieza se fija en el rAF siguiente

    const m = await page.evaluate(() => {
      const tarjeta = document.querySelector("#practice-boards-grid > div");
      const tablero = tarjeta.querySelector(".practice-mini-board");
      const casilla = tablero.querySelector("[data-square]");
      const conPieza = [...tablero.querySelectorAll("[data-square]")].filter((c) => c.firstElementChild);
      const pieza = conPieza[0] && conPieza[0].firstElementChild;
      const cajaCasilla = casilla.getBoundingClientRect();
      const dibujo = pieza && pieza.querySelector("svg.chess-piece-svg");
      // Con el código de antes estos dos nodos no existían. Se contestan en null en vez
      // de reventar: una prueba que explota deja sin correr todo lo que venía después y
      // no dice cuál de las comprobaciones es la que falla.
      const barra = tarjeta.querySelector(".practice-mini-eval");
      const nombre = tarjeta.querySelector(".practice-mini-name");
      const color = tarjeta.querySelector(".practice-mini-color");
      const cajaTarjeta = tarjeta.getBoundingClientRect();
      const cajaColor = color ? color.getBoundingClientRect() : null;
      return {
        casilla: +cajaCasilla.width.toFixed(1),
        piezas: conPieza.length,
        dibujada: !!dibujo,
        texto: pieza ? (pieza.textContent || "").trim() : "",
        altoPieza: dibujo ? +dibujo.getBoundingClientRect().height.toFixed(1) : 0,
        bordeBarra: barra ? parseFloat(getComputedStyle(barra).borderTopWidth) : 0,
        nombreVisible: !!nombre && nombre.checkVisibility(),
        colorVisible: !!color && color.checkVisibility(),
        colorTexto: color ? (color.textContent || "").trim() : "no hay dónde decirlo",
        colorDentro: !!cajaColor && cajaColor.right <= cajaTarjeta.right + 0.5 && cajaColor.width > 1,
        etiquetaBarra: (barra && barra.getAttribute("aria-label")) || "",
      };
    });

    console.log("  — " + tema.nombre);
    // Lo que se rompe callado: que vuelva el glifo. Se pregunta por lo que el
    // navegador DIBUJÓ, no por la preferencia guardada.
    if (m.dibujada) bien("la pieza es la dibujada, no un glifo ni un emoji");
    else mal("la miniatura no dibujó la pieza: pintó «" + m.texto + "», que a esta escala no se distingue");
    if (m.casilla >= 19) bien("la casilla mide " + m.casilla + "px");
    else mal("la casilla quedó en " + m.casilla + "px: ahí no se aprecia ni la figura ni el color");
    const fraccion = m.casilla ? m.altoPieza / m.casilla : 0;
    if (fraccion >= 0.7) bien("la pieza llena su casilla (" + Math.round(fraccion * 100) + "%)");
    else mal("la pieza ocupa el " + Math.round(fraccion * 100) + "% de la casilla: se pierde dentro de ella");
    igual("dibuja las piezas de la posición", m.piezas, 32);
    // La barra de evaluación es blanca sobre una tarjeta blanca: sin borde, la
    // mitad de las blancas no se ve y la barra se lee al revés.
    if (m.bordeBarra > 0) bien("la barra de evaluación se separa del fondo de la tarjeta");
    else mal("la barra va sin borde: sobre la tarjeta blanca, lo blanco no se ve");
    if (m.etiquetaBarra) bien("y dice en palabras quién va mejor: «" + m.etiquetaBarra + "»");
    else mal("la barra es un role=img sin nombre: quien no la ve no se entera de nada");
    // El nombre se trunca a propósito; el color NO puede irse con él.
    igual("de qué color juega se sigue viendo con un nombre largo", m.colorVisible && m.colorDentro ? m.colorTexto : "se perdió", "· blancas");
    igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaLeccionDelProfesor(browser);
    await pruebaTactica(browser);
    await pruebaCoordenadasDelAlumno(browser);
    await pruebaMiniaturas(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
