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
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

const CURSO = "el-mapa-de-los-finales";

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

// ---------------------------------------------- 3b. los diagramas FIJOS del curso
/* Los diagramas de «Desequilibrios de material» son dibujos fijos con su pie
   (.cp-static), sin visor que publique la posición: la traen escrita en el
   HTML. Sin ella no había botón, y eso no da ningún error. Lo que se compara
   es la FEN que se MANDA contra la que dice el archivo de datos para ese pie,
   leído aparte — no contra el atributo, que sería comprobar la página contra
   sí misma. */
const CURSO_FIJO = "desequilibrios-de-material";
function fenDelPie(pie) {
  const d = JSON.parse(fs.readFileSync(path.join(RAIZ, "cursos/protegido/data", CURSO_FIJO + ".json"), "utf8"));
  for (const p of Object.values(d.partidas || {})) {
    for (const pos of p.posiciones || []) if (pos.nota.trim() === pie) return pos.fen;
  }
  return null;
}
async function pruebaDiagramaFijo(browser) {
  console.log("\n=== Un diagrama fijo del curso, al tablero de la clase ===");
  const { page, ctx, errores } = await abrir(browser, [PROFE, ALUMNA], "u-profe");

  const n = await page.evaluate(async (curso) => {
    const r = await fetch("cursos/protegido/" + curso + ".html");
    const temp = document.createElement("div");
    temp.innerHTML = await r.text();
    const detalles = Array.from(temp.querySelectorAll("details")).filter((d) =>
      !(d.parentElement && d.parentElement.closest("details")) && d.querySelector(":scope > summary"));
    const i = detalles.findIndex((d) => d.querySelector(".cp-static"));
    return i < 0 ? null : i + 1;
  }, CURSO_FIJO);
  if (!n) { mal("no se encontró ninguna lección con diagramas fijos en " + CURSO_FIJO); await ctx.close(); return; }

  await page.click("#toggle-lesson-btn");
  await page.selectOption("#lesson-curso-select", CURSO_FIJO);
  await page.waitForFunction(() => document.getElementById("lesson-leccion-select").options.length > 1);
  await page.selectOption("#lesson-leccion-select", String(n));
  await page.click("#lesson-show-btn");
  await page.waitForSelector("#class-lesson-body .cp-static .lesson-send-btn", { timeout: 20000 });

  const vista = await page.evaluate(() => {
    const fijos = Array.from(document.querySelectorAll("#class-lesson-body .cp-static"));
    const f = fijos[0];
    const btn = f.querySelector(".lesson-send-btn");
    const dib = f.querySelector(".cp-static-board").getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    return {
      fijos: fijos.length,
      conBoton: fijos.filter((x) => x.querySelectorAll(".lesson-send-btn").length === 1).length,
      seVe: btn.checkVisibility(),
      alLado: b.left >= dib.right - 1 || b.top < dib.bottom,
      pie: (f.querySelector("p").textContent || "").trim(),
    };
  });
  igual("cada diagrama fijo trae UN botón", vista.conBoton, vista.fijos);
  igual("el botón se ve", vista.seVe, true);
  igual("va junto al pie, no en una fila suelta debajo del dibujo", vista.alLado, true);

  const esperado = fenDelPie(vista.pie);
  if (!esperado) { mal("el archivo de datos no trae la posición del pie «" + vista.pie.slice(0, 40) + "…»"); await ctx.close(); return; }
  await page.evaluate(() => { window.__updates = []; });
  await page.click("#class-lesson-body .cp-static .lesson-send-btn >> nth=0");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "game_state"));
  const mandado = await page.evaluate(() => window.__updates.filter((u) => u.tabla === "game_state").map((u) => u.campos.fen));
  igual("manda la posición de ESE diagrama", mandado, [esperado]);

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

/* Que las ocho letras caigan sobre sus columnas y los ocho números sobre sus
   filas, medido contra las casillas de verdad. Se llama para cada tablero y en
   CADA tamaño de ventana, que es lo que este verificador no hacía: ver abajo. */
async function alineacion(page, id, donde) {
  const m = await medirCoordenadas(page, id);
  if (!m.hay) { mal(donde + ": no tiene las coordenadas de afuera"); return; }
  if (m.peorLetra <= m.lado / 4) bien(donde + ": cada letra cae sobre su columna (" + Math.round(m.peorLetra) + "px de " + Math.round(m.lado) + ")");
  else mal(donde + ": una letra no cae sobre su columna, " + Math.round(m.peorLetra) + "px de desvío en casillas de " + Math.round(m.lado));
  if (m.peorNumero <= m.lado / 4) bien(donde + ": y cada número sobre su fila (" + Math.round(m.peorNumero) + "px)");
  else mal(donde + ": un número no cae sobre su fila, " + Math.round(m.peorNumero) + "px de desvío");
  if (Math.abs(m.ancho - m.alto) <= 2) bien(donde + ": el tablero sigue cuadrado (" + m.ancho + "×" + m.alto + ")");
  else mal(donde + ": el tablero dejó de ser cuadrado, " + m.ancho + "×" + m.alto);
}

/* Las dos alturas de ventana que hay que mirar, y por qué son dos: el tope que
   achica el tablero para que la clase en vivo quepa sin scroll en un laptop de
   13" vive en `@media (max-height: 800px)` (css/styles.css), así que TODO lo
   que se rompa por ese lado existe solo por debajo de esa altura. Midiendo en
   un tamaño solo, la mitad de los casos no se mira — y fue justo por ahí que
   las coordenadas se desalinearon en los tres tableros sin que nada fallara.
   Redimensionar y volver a medir comprueba además que el tope siga saliendo
   del CSS y no de un número de píxeles calculado una vez al montar. */
const ALTURAS = [{ height: 720, nombre: "en un laptop de 13\"" }, { height: 1000, nombre: "en un monitor alto" }];

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

  for (const v of ALTURAS) {
    await page.setViewportSize({ width: 1280, height: v.height });
    await alineacion(page, "question-board", "la pregunta " + v.nombre);
  }

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
  for (const v of ALTURAS) {
    await dos.page.setViewportSize({ width: 1280, height: v.height });
    await alineacion(dos.page, "practice-board", "la práctica " + v.nombre);
  }
  await dos.ctx.close();

  /* Y el tablero de la clase, que es el TERCERO que se rotula por fuera y el
     que ve todo el mundo — el de la pregunta y el de la práctica los ve un
     alumno a la vez. No lo miraba ninguna prueba, así que se desalineó con los
     otros dos y nadie se enteró. */
  const tres = await abrir(browser, [PROFE, ALUMNA], "u-profe");
  await tres.page.waitForFunction(() =>
    document.querySelectorAll("#chessboard [data-square]").length === 64, null, { timeout: 15000 });
  for (const v of ALTURAS) {
    await tres.page.setViewportSize({ width: 1280, height: v.height });
    await alineacion(tres.page, "chessboard", "el tablero de la clase " + v.nombre);
  }
  igual("sin errores en consola", tres.errores.join(" | ") || "ninguno", "ninguno");
  await tres.ctx.close();
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

/* ----------------------------------- 6. "Ver todas las posiciones" de una lista
   Las dos listas de material del profesor —los PGN de Archivos y los ejercicios
   de Táctica— tienen la posición de cada fila detrás de su propio "Vista
   previa", y el rótulo no dice nada de ella ("Position 2, 1 Move", "3. ELO
   1397"). El interruptor las destapa todas para poder buscar a ojo cuál dar.

   Lo que se comprueba es lo que se rompe callado:

   - QUE CADA FILA DIBUJE LA SUYA. Destapar treinta a la vez y que todas pinten
     la misma posición —o la del vecino— se ve perfecto: son treinta tableros
     llenos de piezas. Se compara el patrón de casillas ocupadas de cada tablero
     contra la FEN que le toca, calculada acá afuera.
   - QUE SEA LA POSICIÓN DE SALIDA DEL PGN, no la final. La final se ve igual de
     bien y es el desenlace del ejercicio.
   - QUE LA CARPETA CERRADA ESPERE. Dentro de un <details> cerrado la casilla
     mide cero, así que dibujar ahí deja las piezas del tamaño que no era. El
     tablero tiene que aparecer al ABRIR la carpeta, y bien medido.
   - QUE SIGA VALIENDO PARA BUSCAR al cambiar de tanda: si al entrar a la
     dificultad siguiente las posiciones vuelven a taparse, hay que apretar el
     interruptor en cada paso y deja de servir para lo que se pidió.
   - QUE CADA LISTA RECUERDE LO SUYO: son de tamaños muy distintos y encender en
     una no tiene por qué encender en la otra.
   - Y que abrirlas UNA POR UNA siga funcionando, que es la mitad del pedido. */
const FEN_MATE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const FEN_TORRE = "8/8/8/4k3/8/8/4P3/4K2R w K - 0 1";
const FEN_INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const ARCHIVOS_PGN = [
  { id: "a-1", profesor_id: "u-profe", titulo: "Italiana, 3 jugadas", nombre_archivo: "aperturas.pgn",
    carpeta: null, move_count: 6, created_at: "2026-09-03T10:00:00Z",
    pgn: '[Event "Italiana"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 *' },
  { id: "a-2", profesor_id: "u-profe", titulo: "Position 2, 1 Move", nombre_archivo: "ejercicios.pgn",
    carpeta: null, move_count: 1, created_at: "2026-09-02T10:00:00Z",
    pgn: '[Event "Position 2, 1 Move"]\n[FEN "' + FEN_MATE + '"]\n[SetUp "1"]\n[Result "*"]\n\n1. Ra8+ *' },
  { id: "a-3", profesor_id: "u-profe", titulo: "Rey y peón contra rey", nombre_archivo: "finales.pgn",
    carpeta: "Finales", move_count: 1, created_at: "2026-09-01T10:00:00Z",
    pgn: '[Event "Final"]\n[FEN "' + FEN_TORRE + '"]\n[SetUp "1"]\n[Result "*"]\n\n1. Kd2 *' },
];

/* Qué casillas están ocupadas, de a8 a h1, que es el orden en que el diagrama
   pinta sus 64 divs. Sale de la propia FEN —su primer campo ya describe el
   tablero— así que no hace falta chess.js para esto y no se compara la página
   contra ella misma. */
function ocupacionDeFen(fen) {
  return fen.split(" ")[0].split("/")
    .map((f) => f.replace(/\d/g, (d) => ".".repeat(+d)))
    .join("").replace(/[^.]/g, "x");
}

/* Esperar a que algo aparezca SIN reventar la prueba si no aparece: lo que se
   comprueba después es justamente si apareció, y un timeout que tumba el
   proceso deja sin correr la mitad de lo que hay que mirar. */
function esperar(page, fn) {
  return page.waitForFunction(fn, undefined, { timeout: 8000 }).catch(() => {});
}

function filasEnPantalla(page, selector) {
  return page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((li) => {
    const wrap = li.lastElementChild;                    // el recuadro de la vista previa
    const board = wrap.querySelector(".example-board");
    const sq = board && board.querySelector(".example-sq");
    return {
      titulo: (li.querySelector("p") || {}).textContent || "",
      destapada: !wrap.classList.contains("hidden"),
      dibujada: !!board,
      seVe: !!board && board.checkVisibility(),
      casilla: sq ? Math.round(sq.getBoundingClientRect().width) : 0,
      ocupacion: board
        ? Array.from(board.querySelectorAll(".example-sq")).map((c) => (c.querySelector("span") ? "x" : ".")).join("")
        : "",
    };
  }), selector);
}

async function pruebaVistaPreviaEnLote(browser) {
  console.log("\n=== Ver todas las posiciones de una lista ===");
  const { page, ctx, errores } = await abrir(browser, [PROFE, ALUMNA], "u-profe", { archivos_pgn: ARCHIVOS_PGN });
  const ARCH = "#archivos-panel-list li";

  // ---------------------------------------------------------------- Archivos
  await page.click("#toggle-archivos-btn");
  // "attached" y no "visible": el primer <li> es el de la carpeta cerrada.
  await page.waitForSelector(ARCH, { state: "attached" });
  const alAbrir = await filasEnPantalla(page, ARCH);
  igual("de fábrica no hay ninguna posición destapada", alAbrir.filter((f) => f.destapada).length, 0);
  igual("y tampoco ningún tablero dibujado", alAbrir.filter((f) => f.dibujada).length, 0);

  const verTodas = page.locator("#archivos-panel").getByRole("button", { name: "Ver todas las posiciones" });
  igual("el interruptor está en el panel de Archivos", await verTodas.count(), 1);
  await verTodas.click();
  await esperar(page, () => document.querySelectorAll("#archivos-panel-list li .example-board").length >= 2);
  const destapadas = await filasEnPantalla(page, ARCH);

  igual("se destapan las tres de una vez", destapadas.filter((f) => f.destapada).length, 3);
  // La de la carpeta cerrada se destapa pero NO se dibuja: ahí la casilla mide
  // cero y la pieza saldría de otro tamaño.
  const enCarpeta = destapadas.find((f) => /Rey y peón/.test(f.titulo));
  igual("la que vive en una carpeta cerrada espera a que se abra", enCarpeta.dibujada, false);
  igual("las dos que se ven sí se dibujaron", destapadas.filter((f) => f.dibujada).length, 2);

  const italiana = destapadas.find((f) => /Italiana/.test(f.titulo));
  const mate = destapadas.find((f) => /Position 2/.test(f.titulo));
  igual("la vista previa del PGN es su posición de SALIDA, no la final", italiana.ocupacion, ocupacionDeFen(FEN_INICIAL));
  igual("y cada fila dibuja LA SUYA, no la del vecino", mate.ocupacion, ocupacionDeFen(FEN_MATE));
  if (mate.casilla >= 15) bien("sus casillas miden " + mate.casilla + "px");
  else mal("sus casillas miden " + mate.casilla + "px: el tablero se dibujó donde no se podía medir");

  // Abrir la carpeta: recién ahí se dibuja, y bien medido.
  await page.click("#archivos-panel-list details:not([open]) summary");
  await esperar(page, () => document.querySelectorAll("#archivos-panel-list li .example-board").length >= 3);
  const conCarpeta = (await filasEnPantalla(page, ARCH)).find((f) => /Rey y peón/.test(f.titulo));
  igual("al abrir la carpeta, su posición aparece", conCarpeta.seVe, true);
  igual("y es la del archivo que guarda", conCarpeta.ocupacion, ocupacionDeFen(FEN_TORRE));
  if (conCarpeta.casilla >= 15) bien("con sus casillas ya medibles (" + conCarpeta.casilla + "px)");
  else mal("sus casillas miden " + conCarpeta.casilla + "px: se dibujó dentro de la carpeta cerrada");

  // Apagar, y volver a abrir una sola con su propio botón.
  await page.locator("#archivos-panel").getByRole("button", { name: "Ocultar las posiciones" }).click();
  igual("apagarlo las tapa todas", (await filasEnPantalla(page, ARCH)).filter((f) => f.destapada).length, 0);
  await page.locator("#archivos-panel-list details[open] li").first().getByRole("button", { name: "Vista previa" }).click();
  const unaPorUna = await filasEnPantalla(page, ARCH);
  igual("y una por una sigue funcionando", unaPorUna.filter((f) => f.destapada).length, 1);

  // ----------------------------------------------------------------- Táctica
  const TACT = "#tactics-body li";
  await page.click("#teacher-tab-tactica");
  await page.waitForSelector("#tactics-body button", { timeout: 30000 });
  await page.click("#tactics-body div.space-y-1\\.5 button >> nth=0");     // un grupo
  await page.waitForSelector("#tactics-body div.space-y-1\\.5 button");
  await page.click("#tactics-body div.space-y-1\\.5 button >> nth=0");     // un tema
  await page.waitForSelector("#tactics-body div.space-y-1\\.5 button");
  await page.click("#tactics-body div.space-y-1\\.5 button >> nth=0");     // una dificultad
  await page.waitForSelector(TACT);

  // Encender en Archivos no enciende acá: cada lista recuerda lo suyo.
  igual("la lista de Táctica no se destapó con la de Archivos",
    (await filasEnPantalla(page, TACT)).filter((f) => f.destapada).length, 0);

  const verTodasT = page.locator("#tactics-panel").getByRole("button", { name: "Ver todas las posiciones" });
  igual("el interruptor también está en Táctica", await verTodasT.count(), 1);
  /* Y que QUEPA: la columna del profesor mide 320px fijos, y ahí ya se salió
     del panel una fila de botones una vez —cortada contra el borde y sin forma
     de apretarla, con la lista pintándose entera igual—. Se mide el rectángulo
     que calcula el navegador, no la clase. */
  const cabe = await page.evaluate(() => {
    const caja = document.getElementById("tactics-panel").getBoundingClientRect();
    const btn = Array.from(document.querySelectorAll("#tactics-body button"))
      .find((b) => /Ver todas las posiciones/.test(b.textContent || ""));
    const r = btn.getBoundingClientRect();
    return { dentro: r.right <= caja.right + 0.5 && r.left >= caja.left - 0.5, ancho: Math.round(r.width) };
  });
  if (cabe.dentro) bien("y cabe dentro del panel (" + cabe.ancho + "px)");
  else mal("el interruptor se sale del panel: no se puede ni apretar");
  await verTodasT.click();
  await esperar(page, () => document.querySelectorAll("#tactics-body li .example-board").length >= 2);
  const tact = await filasEnPantalla(page, TACT);
  const total = await page.evaluate(() => document.querySelectorAll("#tactics-body li").length);
  igual("se destapan todos los ejercicios de la tanda", tact.filter((f) => f.destapada).length, total);
  if (tact.filter((f) => f.dibujada).length >= 2) bien("y se van dibujando a medida que entran en pantalla (" + tact.filter((f) => f.dibujada).length + " de " + total + ")");
  else mal("solo se dibujó " + tact.filter((f) => f.dibujada).length + " tablero: la galería queda vacía");

  /* Y que al bajar por la lista se sigan dibujando. Es la falla propia de este
     diseño: la lista de Táctica tiene su propio scroll (max-h-96), así que si el
     observador no viera lo que entra por ahí, la galería se quedaría con los dos
     primeros tableros y el resto en blanco — destapados y vacíos, sin ningún
     error. */
  /* Se baja a lo largo de varias vueltas, como lo hace una persona: cada tablero
     que aparece empuja la lista hacia abajo, así que un solo salto al final no
     llega al último. */
  let abajo = false;
  for (let i = 0; i < 25 && !abajo; i += 1) {
    abajo = await page.evaluate(() => {
      const ul = document.querySelector("#tactics-body ul");
      ul.scrollTop = ul.scrollHeight;
      const lis = document.querySelectorAll("#tactics-body li");
      return !!lis.length && !!lis[lis.length - 1].querySelector(".example-board");
    });
    if (!abajo) await page.waitForTimeout(150);
  }
  igual("bajando por la lista se llega al último ya dibujado", abajo, true);

  // Cada uno el suyo, contra el banco de ejercicios que la página cargó.
  const fens = await page.evaluate(() => {
    const ids = tacticsThemeBuckets(tacticsView.themeKey)[tacticsView.diffIndex];
    return ids.slice(0, 2).map((id) => tacticsData.puzzles[id].fen);
  });
  igual("el primer tablero es el del primer ejercicio", tact[0].ocupacion, ocupacionDeFen(fens[0]));
  igual("y el segundo, el del segundo", tact[1].ocupacion, ocupacionDeFen(fens[1]));

  /* Lo que hace que sirva para buscar: al pasar a la tanda siguiente las
     posiciones nacen destapadas. Si hubiera que volver a apretar el interruptor
     en cada paso de la cascada, buscar seguiría costando lo mismo que antes. */
  await page.click("#tactics-body > button");                              // ‹ volver a las dificultades
  await page.waitForSelector("#tactics-body div.space-y-1\\.5 button");
  const cuantas = await page.evaluate(() => document.querySelectorAll("#tactics-body div.space-y-1\\.5 button").length);
  await page.click("#tactics-body div.space-y-1\\.5 button >> nth=" + (cuantas > 1 ? 1 : 0));
  await page.waitForSelector(TACT);
  await esperar(page, () => document.querySelectorAll("#tactics-body li .example-board").length >= 1);
  const otraTanda = await filasEnPantalla(page, TACT);
  igual("en la tanda siguiente nacen destapadas", otraTanda.every((f) => f.destapada), true);

  await page.locator("#tactics-panel").getByRole("button", { name: "Ocultar las posiciones" }).click();
  await page.click("#tactics-body > button");
  await page.waitForSelector("#tactics-body div.space-y-1\\.5 button");
  await page.click("#tactics-body div.space-y-1\\.5 button >> nth=0");
  await page.waitForSelector(TACT);
  igual("y apagado, nacen tapadas", (await filasEnPantalla(page, TACT)).filter((f) => f.destapada).length, 0);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaLeccionDelProfesor(browser);
    await pruebaDiagramaFijo(browser);
    await pruebaTactica(browser);
    await pruebaCoordenadasDelAlumno(browser);
    await pruebaMiniaturas(browser);
    await pruebaVistaPreviaEnLote(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
