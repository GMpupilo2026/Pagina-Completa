/* Los planes de clase, comprobados en un navegador de verdad con un cliente de
 * Supabase de mentira.
 *
 * Existe porque lo que se rompe acá se rompe en medio de la clase y delante de
 * todos, sin dar ningún error:
 *
 *  - un renglón de posición guardado sin FEN, o con una que Stockfish no
 *    soporta, se ve perfecto en el armador y no hace nada al tocarlo;
 *  - reordenar mandando el `orden` de un solo renglón deja dos con el mismo
 *    número, y el plan sale en un orden distinto cada vez;
 *  - y un botón "Al tablero" que armara su propio update en vez de pasar por
 *    aplicarPosicionEnClase() dejaría la clase con un resto de la posición
 *    anterior (las variantes sin limpiar, el control sin quitar).
 *
 * Lo que hace cumplir la BASE (que un plan sea del profesor que lo escribió,
 * que una colega no lo vea, que un alumno no pueda crear ninguno, y que un
 * renglón no pueda guardarse sin lo que su tipo necesita) está comprobado
 * aparte, impersonando roles en SQL.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-planes.js
 * Necesita playwright y `npm install chess.js@0.10.3`.  */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

/* chess.js llega por CDN en la página; acá se sirve el de node_modules, igual
   que en los demás verificadores: el navegador de la prueba no tiene por qué
   tener internet, y la versión tiene que ser la misma que usa el sitio. Sin
   él, `PosicionValida.motivo()` revienta y el armador deja de validar — que es
   justo lo que esta prueba viene a comprobar. */
let CHESSJS = "";
for (const base of String(process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean)
                  .concat([path.join(RAIZ, "node_modules")])) {
  const f = path.join(base, "chess.js", "chess.js");
  if (!CHESSJS && fs.existsSync(f)) CHESSJS = fs.readFileSync(f, "utf8");
}
if (!CHESSJS) { console.error("Falta chess.js. Instálalo con:  npm install chess.js@0.10.3"); process.exit(2); }

const PROFE = { id: "prof-1", role: "profesor", is_admin: false, full_name: "Sebastián", email: "s@x.cr" };
const ALUMNA = { id: "a-1", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" };

const PLAN = { id: "pl-1", profesor_id: "prof-1", titulo: "Finales de rey y peón",
               notas: "Empezar por la oposición.", compartido_todos: false,
               created_at: "2026-09-18T12:00:00Z", updated_at: null };

/* Un plan de una colega, de los que llegan por `planes_compartidos_conmigo()`.
   Trae `autor` porque esa función lo resuelve: la RLS de `profiles` no le deja a
   un profesor leer el nombre de otro. */
const PLAN_AJENO = { id: "pl-2", profesor_id: "prof-2", autor: "Karina Rojas",
                     titulo: "Mates en dos", notas: "Empezar por el del pasillo.",
                     compartido_todos: true,
                     created_at: "2026-09-19T12:00:00Z", updated_at: "2026-09-19T12:00:00Z" };

const ITEMS_AJENOS = [
  { id: "it-9", plan_id: "pl-2", orden: 0, tipo: "posicion", titulo: "Mate del pasillo",
    fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", pregunta: null, curso: null, leccion: null, nota: null },
];

const EQUIPO = [
  { id: "prof-2", nombre: "Karina Rojas", email: "k@x.cr", es_admin: false },
  { id: "prof-3", nombre: "Profe Angulo", email: "o@x.cr", es_admin: true },
];

// La oposición: legal, con sus dos reyes y sin peones en la fila 1 ni en la 8.
const FEN_BUENA = "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1";

const ITEMS = [
  { id: "it-1", plan_id: "pl-1", orden: 0, tipo: "posicion", titulo: "La oposición",
    fen: FEN_BUENA, pregunta: "¿Cómo gana el blanco?", curso: null, leccion: null, nota: null },
  { id: "it-2", plan_id: "pl-1", orden: 1, tipo: "nota", titulo: "Recordar",
    fen: null, pregunta: null, curso: null, leccion: null, nota: "Preguntar quién jugó el fin de semana." },
  { id: "it-3", plan_id: "pl-1", orden: 2, tipo: "leccion", titulo: "El cuadrado",
    fen: null, pregunta: null, curso: "finales-practicos", leccion: 2, nota: null },
];

function clienteFalso(datos, usuarioId) {
  return `
window.__escrituras = [];
(function () {
  const DATOS = ${JSON.stringify(datos)};
  let contador = 0;
  function constructor(filas, etiqueta) {
    let condiciones = [], unica = false, pendiente = null;
    const b = {
      select() { return b; }, order() { return b; }, in() { return b; }, or() { return b; },
      is() { return b; }, limit() { return b; }, range() { return b; },
      eq(col, val) { condiciones.push([col, val]); return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      insert(fila) {
        window.__escrituras.push({ tabla: etiqueta, accion: "insert", fila: fila });
        contador += 1;
        pendiente = Object.assign({ id: "nuevo-" + contador, created_at: new Date().toISOString() }, fila);
        filas.push(pendiente);
        return b;
      },
      upsert(fila) {
        window.__escrituras.push({ tabla: etiqueta, accion: "upsert", fila: fila });
        pendiente = Object.assign({}, fila);
        filas.push(pendiente);
        return b;
      },
      // El filtro se apunta al RESOLVER y no acá: .update(x).eq("id", y)
      // encadena, así que en este momento condiciones todavía está vacío.
      update(campos) {
        pendiente = { __update: campos };
        return b;
      },
      delete() { window.__escrituras.push({ tabla: etiqueta, accion: "delete" }); pendiente = { __delete: true }; return b; },
      then(res, rej) {
        if (pendiente && pendiente.__update) {
          window.__escrituras.push({ tabla: etiqueta, accion: "update", fila: pendiente.__update, donde: condiciones.slice() });
          const id = (condiciones.find((c) => c[0] === "id") || [])[1];
          const f = filas.find((x) => x.id === id);
          if (f) Object.assign(f, pendiente.__update);
          return Promise.resolve({ data: f || null, error: null }).then(res, rej);
        }
        if (pendiente && pendiente.__delete) {
          window.__escrituras[window.__escrituras.length - 1].donde = condiciones.slice();
          const i = filas.findIndex((x) => condiciones.every(([c, v]) => x[c] === v));
          if (i >= 0) filas.splice(i, 1);
          return Promise.resolve({ data: null, error: null }).then(res, rej);
        }
        if (pendiente) return Promise.resolve({ data: pendiente, error: null }).then(res, rej);
        let d = filas;
        if (Array.isArray(d)) {
          condiciones.forEach(([col, val]) => { d = d.filter((f) => f[col] === val); });
          if (unica) d = d.length ? d[0] : null;
        }
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }) },
    from: (t) => constructor(DATOS.tablas[t] !== undefined ? DATOS.tablas[t] : [], t),
    rpc: (n) => constructor(DATOS.rpc && DATOS.rpc[n] !== undefined ? DATOS.rpc[n] : [], "rpc:" + n),
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

async function abrir(browser, pagina, datos, usuarioId) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, usuarioId) }));
  await page.goto(BASE + pagina, { waitUntil: "networkidle" });
  try {
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  } catch (e) {
    const enPantalla = await page.evaluate(() => {
      const l = document.getElementById("loading");
      return l ? l.textContent.trim().slice(0, 300) : "(sin #loading)";
    });
    throw new Error("No arrancó " + pagina + ": " + (errores.join(" | ") || "sin errores") + " — en pantalla: " + enPantalla);
  }
  return { page, errores };
}

const copia = (x) => JSON.parse(JSON.stringify(x));

const datosProfe = (compartidos) => ({
  tablas: {
    profiles: [PROFE, ALUMNA],
    planes_clase: [copia(PLAN)],
    plan_items: copia(ITEMS).concat(copia(ITEMS_AJENOS)),
    plan_compartidos: [],
  },
  rpc: {
    equipo_docente: copia(EQUIPO),
    planes_compartidos_conmigo: compartidos ? [copia(PLAN_AJENO)] : [],
  },
});

async function pruebaArmador(browser) {
  console.log("\n=== El armador (planes.html) ===");
  const { page, errores } = await abrir(browser, "/planes.html", datosProfe(), "prof-1");
  await page.waitForSelector("#cuerpo:not(.hidden)", { timeout: 10000 });

  await page.click('#lista-planes button[data-plan="pl-1"]');
  await page.waitForSelector("#detalle:not(.hidden)");
  await page.waitForFunction(() => document.querySelectorAll("#lista-items li").length === 3);
  igual("pinta los tres renglones", await page.locator("#lista-items li").count(), 3);
  igual("y en su orden", await page.evaluate(() =>
    [...document.querySelectorAll("#lista-items li p:first-child")].map((p) => p.textContent).join(" / ")),
    "♟️ La oposición / 📝 Recordar / 📚 El cuadrado · lección 3");

  // ---- Una posición que Stockfish no soporta no puede entrar al plan ----
  // Dos reyes blancos y ninguno negro: chess.js la carga sin quejarse.
  await page.selectOption("#i-tipo", "posicion");
  await page.fill("#i-titulo", "Posición rota");
  await page.fill("#i-fen", "8/8/8/8/8/8/8/KK6 w - - 0 1");
  await page.click("#form-item button[type=submit]");
  await page.waitForTimeout(300);
  igual("la posición imposible se rechaza al guardarla",
    (await page.textContent("#item-msg")).includes("rey") ? "sí, y dice por qué" : await page.textContent("#item-msg"),
    "sí, y dice por qué");
  igual("y no se manda nada a la base",
    await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "plan_items" && e.accion === "insert").length), 0);

  // ---- Una buena sí ----
  await page.fill("#i-fen", "8/8/8/3k4/8/3K4/3P4/8 w - - 0 1");
  await page.fill("#i-pregunta", "¿Quién gana?");
  await page.click("#form-item button[type=submit]");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "plan_items" && e.accion === "insert"));
  const ins = await page.evaluate(() => window.__escrituras.find((e) => e.tabla === "plan_items" && e.accion === "insert"));
  igual("la buena sí entra, con su tipo", ins.fila.tipo, "posicion");
  igual("con su FEN", ins.fila.fen, "8/8/8/3k4/8/3K4/3P4/8 w - - 0 1");
  igual("con su pregunta", ins.fila.pregunta, "¿Quién gana?");
  igual("y al final de la lista", ins.fila.orden, 3);

  // ---- Una lección guarda el número base 0 aunque en pantalla empiece en 1 ----
  await page.selectOption("#i-tipo", "leccion");
  await page.fill("#i-titulo", "La regla del cuadrado");
  await page.fill("#i-leccion", "5");
  await page.click("#form-item button[type=submit]");
  await page.waitForFunction(() => window.__escrituras.filter((e) => e.tabla === "plan_items" && e.accion === "insert").length === 2);
  const insL = await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "plan_items" && e.accion === "insert")[1]);
  igual("la lección 5 se guarda como 4 (la base cuenta desde 0)", insL.leccion !== undefined ? insL.leccion : insL.fila.leccion, 4);

  // ---- Reordenar manda el orden de CADA renglón movido ----
  await page.evaluate(() => { window.__escrituras.length = 0; });
  await page.click('#lista-items li[data-item-id="it-2"] button[aria-label^="Subir"]');
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "plan_items" && e.accion === "update"));
  await page.waitForTimeout(300);
  const updates = await page.evaluate(() => window.__escrituras
    .filter((e) => e.tabla === "plan_items" && e.accion === "update")
    .map((e) => ((e.donde.find((c) => c[0] === "id") || [])[1]) + "→" + e.fila.orden).sort().join(", "));
  igual("subir un renglón renumera los DOS que se movieron", updates, "it-1→1, it-2→0");
  igual("y la pantalla los enseña ya cambiados", await page.evaluate(() =>
    [...document.querySelectorAll("#lista-items li p:first-child")].slice(0, 2).map((p) => p.textContent).join(" / ")),
    "📝 Recordar / ♟️ La oposición");

  igual("sin errores en la consola", errores.join(" | ") || "ninguno", "ninguno");
  await page.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== Quien no da clase ===");
  const datos = datosProfe();
  const { page, errores } = await abrir(browser, "/planes.html", datos, "a-1");
  await page.waitForSelector("#sin-permiso:not(.hidden)", { timeout: 10000 });
  igual("se le dice que no es para ella", await page.evaluate(() =>
    getComputedStyle(document.getElementById("sin-permiso")).display === "none" ? "no" : "sí"), "sí");
  igual("y no se le pinta el armador", await page.evaluate(() =>
    getComputedStyle(document.getElementById("cuerpo")).display === "none" ? "no" : "sí"), "no");
  igual("ni se le pide un solo plan",
    await page.evaluate(() => window.__escrituras.length), 0);
  igual("sin errores en la consola", errores.join(" | ") || "ninguno", "ninguno");
  await page.close();
}

/* Compartir es lo que convierte un plan en material del equipo: sin esto, los 53
   planes de arranque hay que volver a sembrarlos por cada profesor. Lo que se
   rompe acá se rompe callado — un plan compartido con quien no era, o una
   casilla que dice "lo ve todo el equipo" sobre un plan que no se guardó. */
async function pruebaCompartir(browser) {
  console.log("\n=== Compartir un plan tuyo ===");
  const { page, errores } = await abrir(browser, "/planes.html", datosProfe(false), "prof-1");
  await page.waitForSelector("#cuerpo:not(.hidden)", { timeout: 10000 });

  igual("sin nada compartido contigo, el apartado no se destapa",
    await page.evaluate(() => getComputedStyle(document.getElementById("bloque-compartidos")).display === "none" ? "no" : "sí"), "no");

  await page.click('#lista-planes button[data-plan="pl-1"]');
  await page.waitForSelector("#detalle:not(.hidden)");
  igual("en tu plan se ve el apartado de compartir",
    await page.evaluate(() => getComputedStyle(document.getElementById("bloque-compartir")).display === "none" ? "no" : "sí"), "sí");
  igual("y todavía no lo compartes con nadie",
    await page.evaluate(() => getComputedStyle(document.getElementById("c-nadie")).display === "none" ? "no lo dice" : "lo dice"), "lo dice");
  igual("el selector ofrece a los colegas y no a ti",
    await page.evaluate(() => [...document.querySelectorAll("#c-agregar option")].map((o) => o.textContent).join(" / ")),
    "Karina Rojas / Profe Angulo 👑");

  // ---- Compartir con una colega concreta ----
  await page.evaluate(() => { window.__escrituras.length = 0; });
  await page.selectOption("#c-agregar", "prof-2");
  await page.click("#c-sumar");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "plan_compartidos"));
  const alta = await page.evaluate(() => window.__escrituras.find((e) => e.tabla === "plan_compartidos"));
  igual("se manda el plan que está abierto", alta.fila.plan_id, "pl-1");
  igual("y el profesor que se eligió", alta.fila.profesor_id, "prof-2");
  igual("la etiqueta lo dice con su nombre",
    await page.evaluate(() => [...document.querySelectorAll("#c-etiquetas li span:first-child")].map((n) => n.textContent).join(", ")),
    "Karina Rojas");
  igual("y ya no se ofrece a quien ya lo tiene",
    await page.evaluate(() => [...document.querySelectorAll("#c-agregar option")].map((o) => o.value).join(",")), "prof-3");

  // ---- Quitarlo manda las DOS condiciones ----
  await page.evaluate(() => { window.__escrituras.length = 0; });
  await page.click('#c-etiquetas li button[aria-label^="Dejar de compartir"]');
  await page.waitForFunction(() => window.__escrituras.some((e) => e.accion === "delete" && e.donde));
  const baja = await page.evaluate(() => window.__escrituras.find((e) => e.accion === "delete" && e.donde));
  igual("quitar filtra por el plan Y por el profesor",
    baja.donde.map((c) => c[0] + "=" + c[1]).sort().join(", "), "plan_id=pl-1, profesor_id=prof-2");

  // ---- Con todo el equipo docente ----
  await page.evaluate(() => { window.__escrituras.length = 0; });
  await page.check("#c-todos");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "planes_clase" && e.accion === "update"));
  const up = await page.evaluate(() => window.__escrituras.find((e) => e.tabla === "planes_clase" && e.accion === "update"));
  igual("marca compartido_todos en el plan abierto", up.fila.compartido_todos, true);
  igual("sobre ese plan y no otro", (up.donde.find((c) => c[0] === "id") || [])[1], "pl-1");
  igual("y entonces elegir de a uno se esconde, porque ya no agrega nada",
    await page.evaluate(() => getComputedStyle(document.getElementById("c-elegidos-bloque")).display === "none" ? "sí" : "no"), "sí");

  igual("sin errores en la consola", errores.join(" | ") || "ninguno", "ninguno");
  await page.close();
}

/* Un plan compartido se DA y se duplica; no se edita ni se borra. La base lo
   hace cumplir (está comprobado impersonando roles en SQL), así que lo que se
   mira acá es que no se le ofrezcan botones que van a fallar sobre el material
   de una colega. */
async function pruebaPlanAjeno(browser) {
  console.log("\n=== Un plan que te comparten ===");
  const { page, errores } = await abrir(browser, "/planes.html", datosProfe(true), "prof-1");
  await page.waitForSelector("#cuerpo:not(.hidden)", { timeout: 10000 });

  await page.waitForFunction(() => document.querySelectorAll("#lista-compartidos li").length === 1);
  igual("se ve el apartado de compartidos",
    await page.evaluate(() => getComputedStyle(document.getElementById("bloque-compartidos")).display === "none" ? "no" : "sí"), "sí");
  // Los dos renglones se leen por separado: son dos <span> en bloque y
  // textContent los pega sin espacio, que en pantalla no pasa.
  igual("y dice de quién es",
    await page.evaluate(() => [...document.querySelectorAll("#lista-compartidos li button span")].map((x) => x.textContent).join(" — ")),
    "Mates en dos — de Karina Rojas");
  igual("el plan ajeno no se cuela entre los tuyos",
    await page.evaluate(() => [...document.querySelectorAll("#lista-planes button")].map((b) => b.dataset.plan).join(",")), "pl-1");

  await page.click('#lista-compartidos button[data-plan="pl-2"]');
  await page.waitForSelector("#detalle:not(.hidden)");
  await page.waitForFunction(() => document.querySelectorAll("#lista-items li").length === 1);
  igual("se le ve el contenido", await page.textContent("#lista-items li p:first-child"), "♟️ Mate del pasillo");
  igual("con el autor a la vista", await page.textContent("#detalle-autor"), "Lo escribió Karina Rojas");

  const oculto = (id) => page.evaluate((i) => getComputedStyle(document.getElementById(i)).display === "none" ? "oculto" : "a la vista", id);
  igual("no se ofrece borrar el plan de otra persona", await oculto("borrar-plan"), "oculto");
  igual("ni agregarle renglones", await oculto("form-item"), "oculto");
  igual("ni repartirlo por tu cuenta", await oculto("bloque-compartir"), "oculto");
  igual("los renglones no traen botones",
    await page.evaluate(() => document.querySelectorAll("#lista-items li button").length), 0);
  igual("sus notas se leen pero no se escriben",
    await page.evaluate(() => document.getElementById("p-notas").readOnly ? "solo lectura" : "editable"), "solo lectura");
  igual("y se explica por qué", await oculto("solo-lectura"), "a la vista");

  // ---- Duplicar es lo que SÍ puede: la copia es suya ----
  await page.evaluate(() => { window.__escrituras.length = 0; });
  await page.click("#duplicar-plan");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "planes_clase" && e.accion === "insert"));
  const cop = await page.evaluate(() => window.__escrituras.find((e) => e.tabla === "planes_clase" && e.accion === "insert"));
  igual("la copia queda a tu nombre", cop.fila.profesor_id, "prof-1");
  igual("con el título dicho", cop.fila.titulo, "Copia de Mates en dos");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "plan_items" && e.accion === "insert"));
  igual("y se lleva sus renglones",
    await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "plan_items" && e.accion === "insert").length), 1);
  igual("la copia ya se edita", await oculto("form-item"), "a la vista");

  igual("sin errores en la consola", errores.join(" | ") || "ninguno", "ninguno");
  await page.close();
}

/* Que el módulo y el armador cuenten las lecciones igual es lo que hace que el
   renglón abra la que el profesor quiso: `abrirLeccionLocal()` cuenta desde 0 y
   la pantalla desde 1. Si se separan, el plan abre la lección de al lado — y
   eso no da ningún error, solo se da la clase que no era. */
async function pruebaResumen(browser) {
  console.log("\n=== Cómo se lee un renglón ===");
  const page = await browser.newPage();
  await page.route("**/cdnjs.cloudflare.com/**/chess.min.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: CHESSJS }));
  // Aquí solo se lee `PlanClase.resumen()`, que es lógica pura y no toca la
  // base — pero la página sí: sin sesión se va a login.html y se lleva
  // `PlanClase` con ella. Antes esto no pasaba por un accidente (la librería
  // de Supabase venía de un CDN, no cargaba en la corrida y `supabase-client`
  // reventaba antes de crear el cliente, así que la página se quedaba quieta).
  // Desde que la librería se sirve del repositorio, el cliente se crea de
  // verdad y la redirección ocurre: se le pone el mismo doble que al resto.
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datosProfe(), "prof-1") }));
  await page.goto(BASE + "/planes.html", { waitUntil: "domcontentloaded" });
  const r = await page.evaluate((items) => items.map((i) => PlanClase.resumen(i)), ITEMS);
  igual("posición", r[0], "♟️ La oposición");
  igual("nota", r[1], "📝 Recordar");
  igual("lección: en pantalla se numera desde 1", r[2], "📚 El cuadrado · lección 3");
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaArmador(browser);
    await pruebaAlumna(browser);
    await pruebaCompartir(browser);
    await pruebaPlanAjeno(browser);
    await pruebaResumen(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
