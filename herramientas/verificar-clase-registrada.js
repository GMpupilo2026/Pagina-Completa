/* Que dar una clase la deje REGISTRADA, sin que el profesor tenga que
   acordarse de nada.
 *
 * Existe porque esto se rompe de la peor manera posible: en silencio y sin
 * vuelta atrás. La asistencia, los minutos en clase, el informe que le llega a
 * la casa y el reporte de actividades cuelgan TODOS de que haya una fila
 * abierta en `class_sessions`. Esa fila la abría un botón que vive en el panel
 * (clases.html), mientras que la clase se da en sesion.html — y al tablero se
 * entra directo desde el grid del panel, sin pasar por esa franja. Un
 * entrenador nuevo da su clase entera, con la pizarra y las preguntas, y nada
 * de eso queda: no da ningún error, la clase simplemente no existió, y eso no
 * se puede reconstruir después.
 *
 * Cinco cosas, por cinco peligros distintos:
 *
 *   1. QUE NO SE INVENTEN CLASES. Entrar a preparar algo no es dar clase: con
 *      el profesor solo, sin alumnos y sin tocar nada, no puede abrirse
 *      ninguna. Si se abriera al entrar, el registro se llenaría de clases de
 *      dos minutos que nadie dio y los informes contarían de más.
 *
 *   2. QUE SE ABRA SOLA AL ENTRAR UN ALUMNO. Es el momento en que hay alguien
 *      del otro lado, o sea el momento a partir del cual su asistencia importa.
 *
 *   3. QUE SE ABRA SOLA AL MANDAR UNA POSICIÓN. Una clase puede empezar antes
 *      de que se conecte nadie; las tres puertas del sitio pasan por
 *      aplicarPosicionEnClase(), así que alcanza con mirar esa.
 *
 *   4. QUE NO SE ABRAN DOS. Los dos disparadores pueden caer juntos. Con dos
 *      filas abiertas la asistencia se reparte entre las dos y cada informe
 *      cuenta la mitad — sin que nada falle. Acá se comprueba que la página
 *      pida UNA sola; que sea imposible de verdad lo garantiza el índice único
 *      parcial de la base (class_sessions_una_abierta_por_profesor), que no se
 *      puede probar contra un Supabase de mentira.
 *
 *   5. QUE LA FRANJA DIGA LA VERDAD. Un entrenador nuevo tiene que poder ver de
 *      un vistazo si se está registrando o no, ESCRITO y no con un color. Se
 *      mide el `display` que calcula el navegador, no la clase — la lección que
 *      dejó el cartel de instalar la app, que llevaba `hidden` puesto y salía
 *      igual.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       npm install playwright chess.js@0.10.3
 *       node herramientas/verificar-clase-registrada.js                      */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

let CHESSJS = "";
for (const base of String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
                  .concat([path.join(RAIZ, "node_modules")])) {
  const f = path.join(base, "chess.js", "chess.js");
  if (!CHESSJS && fs.existsSync(f)) CHESSJS = fs.readFileSync(f, "utf8");
}
if (!CHESSJS) { console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3"); process.exit(2); }

const PROFE = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false,
                full_name: "Karina Rojas", email: "karina@x.cr", grupo: null,
                invitaciones_max: 5, invitaciones_usadas: 0 };
const ALUMNA = { id: "u-ana", role: "alumno", is_admin: false, es_coordinador: false,
                 full_name: "Ana Rojas", email: "ana@x.cr", grupo: "7B" };

/* El Supabase de mentira. Apunta cada insert y cada update con su tabla y su
   filtro, que es lo único que se puede comprobar de verdad: lo que la página
   MANDA. Y el canal de presencia se puede empujar a mano desde la prueba
   (window.__entraAlumno) para simular que se conecta alguien — sin eso no hay
   forma de probar el disparador que más importa. */
function clienteFalso(quien, claseAbierta) {
  return `
window.__inserts = [];
window.__updates = [];
(function () {
  const PERFILES = ${JSON.stringify([PROFE, ALUMNA])};
  const SESIONES = ${JSON.stringify(claseAbierta ? [claseAbierta] : [])};
  const GAME_STATE = [{
    id: 7, owner_id: "u-profe", fen: null, moves: [], start_fen: null, last_move: null,
    arrows: [], circles: [], active_player_id: null, active_player_color: "both",
    shown_curso: null, shown_leccion: null, updated_by: "u-profe",
    updated_at: new Date().toISOString(),
  }];
  let nuevas = 0;

  function constructor(tabla, filas) {
    let filas2 = (filas || []).slice(), unica = false, pend = null, condiciones = [], porActualizar = null;
    const b = {
      select() { return b; },
      eq(col, val) { condiciones.push([col, val]); filas2 = filas2.filter((r) => String(r[col]) === String(val)); return b; },
      in(col, vals) { filas2 = filas2.filter((r) => vals.map(String).includes(String(r[col]))); return b; },
      is(col, val) { if (val === null) filas2 = filas2.filter((r) => r[col] === null || r[col] === undefined); return b; },
      gte() { return b; }, lte() { return b; }, or() { return b; },
      order() { return b; }, limit() { return b; }, range() { return b; },
      insert(fila) {
        window.__inserts.push({ tabla: tabla, fila: fila });
        nuevas += 1;
        pend = Object.assign({ id: "sesion-" + nuevas, started_at: new Date().toISOString(), ended_at: null }, fila);
        // La fila nueva entra a la tabla: una segunda consulta tiene que
        // encontrarla, como en la base de verdad.
        (filas || []).push(pend);
        filas2 = [pend];
        return b;
      },
      upsert(fila) { window.__inserts.push({ tabla: tabla, fila: fila, upsert: true }); pend = fila; return b; },
      // El filtro se apunta al RESOLVER y no acá: .update(x).eq("id", y)
      // encadena, así que en este momento condiciones todavía está vacío y el
      // doble daría por bueno un cierre sobre la clase que no era.
      update(campos) { pend = null; porActualizar = campos; return b; },
      delete() { filas2 = []; return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        if (porActualizar) {
          window.__updates.push({ tabla: tabla, campos: porActualizar, donde: condiciones.slice() });
          if (filas2[0]) Object.assign(filas2[0], porActualizar);
          porActualizar = null;
        }
        let d = pend !== null && pend !== undefined ? (unica ? pend : [pend]) : filas2;
        if (unica && Array.isArray(d)) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  const TABLAS = {
    profiles: PERFILES, game_state: GAME_STATE, class_sessions: SESIONES,
    variant_nodes: [], questions: [], question_answers: [], question_engine_answers: [],
    class_attendance: [], class_presence_log: [], practice_sessions: [], practice_games: [],
    class_chat_messages: [], saved_games: [], archivos_pgn: [], planes_clase: [], plan_items: [],
    notas_alumno: [],
  };

  // El canal de presencia se puede empujar desde la prueba: __entraAlumno()
  // hace lo que haría Realtime cuando alguien se conecta a la clase.
  let estado = {};
  const oyentes = { presence: [], broadcast: [] };
  window.__entraAlumno = function () {
    estado["u-ana"] = [{ email: "ana@x.cr", full_name: "Ana Rojas", role: "alumno", online_at: new Date().toISOString() }];
    oyentes.presence.forEach((f) => f());
  };

  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(quien)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
      updateUser: () => Promise.resolve({ error: null }),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    rpc: (n) => constructor(n, n === "mis_clases"
      ? [{ profesor_id: "u-profe", profesor_nombre: "Karina Rojas", es_principal: true, clase_abierta: false }]
      : []),
    channel: (nombre) => ({
      on(tipo, ev, f) {
        if (tipo === "presence") oyentes.presence.push(typeof ev === "function" ? ev : f);
        if (tipo === "broadcast") oyentes.broadcast.push(f);
        return this;
      },
      subscribe(cb) { if (cb) cb("SUBSCRIBED"); return this; },
      track() { return Promise.resolve(); },
      untrack() { return Promise.resolve(); },
      send() { return Promise.resolve(); },
      presenceState: () => estado,
    }),
    removeChannel: () => {},
  };
})();
`;
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  if (String(hallado) !== String(esperado)) {
    console.log("  ✗ " + nombre + "\n      esperaba: " + esperado + "\n      salió:    " + hallado);
    fallos += 1;
  } else {
    console.log("  ✓ " + nombre + ": " + hallado);
  }
}

async function abrir(browser, quien, claseAbierta) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(quien, claseAbierta) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.goto(BASE + "/sesion.html", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 30000 });
  return { page, ctx, errores };
}

const seVe = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  return el && getComputedStyle(el).display !== "none" ? "sí" : "no";
}, id);

const sesionesAbiertas = (page) => page.evaluate(() =>
  window.__inserts.filter((i) => i.tabla === "class_sessions").length);

async function pruebaSinAlumnos(browser) {
  console.log("\n=== El profesor entra solo: no se inventa ninguna clase ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", null);
  await page.waitForSelector("#clase-estado:not(.hidden)", { timeout: 10000 });
  await page.waitForTimeout(600);

  igual("no se abre ninguna clase por entrar", await sesionesAbiertas(page), 0);
  igual("la franja se ve de verdad", await seVe(page, "clase-estado"), "sí");
  igual("y dice con todas las letras que no hay clase",
    (await page.textContent("#clase-estado-texto")).includes("Todavía no hay clase abierta") ? "lo dice" : await page.textContent("#clase-estado-texto"),
    "lo dice");
  igual("ofrece abrirla a mano", await seVe(page, "clase-abrir-btn"), "sí");
  igual("y no ofrece cerrar lo que no está abierto", await seVe(page, "clase-cerrar-btn"), "no");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaEntraUnAlumno(browser) {
  console.log("\n=== Entra un alumno: la clase se abre sola ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", null);
  await page.waitForSelector("#clase-estado:not(.hidden)", { timeout: 10000 });
  await page.waitForTimeout(400);
  igual("antes de que entre, ninguna", await sesionesAbiertas(page), 0);

  await page.evaluate(() => window.__entraAlumno());
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "class_sessions"), null, { timeout: 8000 });

  igual("al entrar el alumno se abre una", await sesionesAbiertas(page), 1);
  igual("y queda a nombre de quien da la clase", await page.evaluate(() =>
    window.__inserts.find((i) => i.tabla === "class_sessions").fila.created_by), "u-profe");

  await page.waitForFunction(() =>
    document.getElementById("clase-estado-texto").textContent.includes("Clase en curso"), null, { timeout: 8000 });
  igual("la franja lo dice y nombra lo que se está registrando",
    (await page.textContent("#clase-estado-texto")).includes("asistencia") ? "lo dice" : await page.textContent("#clase-estado-texto"),
    "lo dice");
  igual("y ahora ofrece cerrarla", await seVe(page, "clase-cerrar-btn"), "sí");

  /* Un segundo aviso de presencia no puede abrir una segunda clase: con dos
     abiertas la asistencia se reparte y cada informe cuenta la mitad. */
  await page.evaluate(() => window.__entraAlumno());
  await page.waitForTimeout(500);
  igual("un segundo aviso de presencia NO abre otra", await sesionesAbiertas(page), 1);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaMandaPosicion(browser) {
  console.log("\n=== El profesor manda una posición: la clase se abre sola ===");
  const { page, ctx, errores } = await abrir(browser, "u-profe", null);
  await page.waitForSelector("#clase-estado:not(.hidden)", { timeout: 10000 });
  await page.waitForTimeout(400);

  // Las tres puertas del sitio pasan por aplicarPosicionEnClase(): alcanza con
  // mirar esa, que es justamente por lo que existe esa función única.
  await page.evaluate(() => aplicarPosicionEnClase("8/8/8/4k3/8/4K3/4P3/8 w - - 0 1"));
  await page.waitForFunction(() => window.__inserts.some((i) => i.tabla === "class_sessions"), null, { timeout: 8000 });
  igual("mandar una posición abre la clase", await sesionesAbiertas(page), 1);

  // Y una posición que la clase en vivo RECHAZA no puede abrir una clase: sería
  // registrar una clase que no se dio por un intento que falló.
  await page.evaluate(() => { window.__inserts.length = 0; });
  await page.evaluate(() => aplicarPosicionEnClase("8/8/8/8/8/8/8/KK6 w - - 0 1"));
  await page.waitForTimeout(500);
  igual("una posición rechazada no abre ninguna", await sesionesAbiertas(page), 0);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaClaseYaAbierta(browser) {
  console.log("\n=== Con la clase ya abierta ===");
  const abierta = { id: "s-1", title: null, created_by: "u-profe", ended_at: null,
                    started_at: "2026-09-20T15:00:00Z", notes: null };
  const { page, ctx, errores } = await abrir(browser, "u-profe", abierta);
  await page.waitForFunction(() =>
    document.getElementById("clase-estado-texto").textContent.includes("Clase en curso"), null, { timeout: 10000 });

  igual("no se abre una segunda", await sesionesAbiertas(page), 0);

  // Cerrar pide primero el nombre y la nota: así no se cierra de un clic
  // accidental en medio de la clase, y se recoge lo único que hace falta para
  // que el registro sirva de algo después.
  igual("los campos arrancan escondidos", await seVe(page, "clase-cerrar-campos"), "no");
  await page.click("#clase-cerrar-btn");
  igual("el primer toque los destapa", await seVe(page, "clase-cerrar-campos"), "sí");
  igual("y todavía no cerró nada", await page.evaluate(() =>
    window.__updates.filter((u) => u.tabla === "class_sessions").length), 0);

  await page.fill("#clase-titulo", "Finales de rey y peón");
  await page.fill("#clase-notas", "Se trabó la oposición; repasar el jueves.");
  await page.click("#clase-cerrar-btn");
  await page.waitForFunction(() => window.__updates.some((u) => u.tabla === "class_sessions"), null, { timeout: 8000 });

  const cierre = await page.evaluate(() => window.__updates.find((u) => u.tabla === "class_sessions"));
  igual("cierra la clase que estaba abierta", (cierre.donde.find((d) => d[0] === "id") || [])[1], "s-1");
  igual("con su título", cierre.campos.title, "Finales de rey y peón");
  igual("con lo que se trabajó", cierre.campos.notes, "Se trabó la oposición; repasar el jueves.");
  igual("y con la hora de cierre puesta", cierre.campos.ended_at ? "sí" : "no", "sí");

  await page.waitForFunction(() =>
    document.getElementById("clase-estado-texto").textContent.includes("Todavía no hay clase"), null, { timeout: 8000 });
  igual("y la franja vuelve a decir la verdad", "lo dice", "lo dice");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== A la alumna no se le pinta nada de esto ===");
  const abierta = { id: "s-1", title: null, created_by: "u-profe", ended_at: null,
                    started_at: "2026-09-20T15:00:00Z", notes: null };
  const { page, ctx, errores } = await abrir(browser, "u-ana", abierta);
  await page.waitForTimeout(1200);

  igual("no ve la franja de clase", await seVe(page, "clase-estado"), "no");
  igual("ni puede abrir ni cerrar ninguna", await page.evaluate(() =>
    window.__inserts.filter((i) => i.tabla === "class_sessions").length
    + window.__updates.filter((u) => u.tabla === "class_sessions").length), 0);
  // Lo que SÍ tiene que pasarle: que su asistencia quede marcada sola.
  igual("pero su asistencia sí se marca sola", await page.evaluate(() =>
    window.__inserts.some((i) => i.tabla === "class_attendance") ? "sí" : "no"), "sí");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* El Supabase de mentira y el arranque de la página los reusa
   verificar-sesion-orden.js: dos copias del mismo doble se irían separando a la
   primera corrección, igual que las tres maquetas de la guía del profesor. */
module.exports = { clienteFalso, abrir, igual, PROFE, ALUMNA, CHROME, BASE, fallos: () => fallos };

if (require.main !== module) return;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaSinAlumnos(browser);
    await pruebaEntraUnAlumno(browser);
    await pruebaMandaPosicion(browser);
    await pruebaClaseYaAbierta(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien: la clase queda registrada sin acordarse de nada.");
  process.exit(fallos ? 1 : 0);
})();
