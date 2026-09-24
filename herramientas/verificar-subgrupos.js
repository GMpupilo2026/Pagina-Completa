/* Comprueba, en un navegador de verdad y con un Supabase de mentira, lo que
   hacen los subgrupos del profesor:

   1. subgrupos.html: crear, renombrar, y sobre todo QUÉ MANDA al guardar
      quiénes están — solo la diferencia, no la lista entera.
   2. Que a un alumno no se le pinte nada de esto.
   3. El filtro de informes.html: el subgrupo sale en el mismo selector que los
      grupos y deja SOLO a los suyos.
   4. Tareas y Exámenes: elegir un subgrupo marca a los suyos y desmarca al
      resto.

   Existe porque todo lo de acá se rompe callado. Un "guardar" que mandara la
   lista entera borraría y reinsertaría a todo el mundo, y un filtro que no
   filtrara enseñaría el informe de la Academia completa: las dos cosas se ven
   perfectas en pantalla.

   Lo que hace cumplir la base —que un subgrupo no dé ni un permiso, que solo
   entren alumnos propios y que una colega no lo vea— se comprobó impersonando
   roles en SQL, no acá.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-subgrupos.js                            */
const { chromium } = require("playwright");
const { contestarAvisos } = require("./lib/avisos-prueba.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE  = { id: "u-oscar", full_name: "Oscar Angulo", email: "oscar@x.cr", role: "profesor", is_admin: false, es_coordinador: false };
const ALUMNA = { id: "u-ana",   full_name: "Ana Rojas",    email: "ana@x.cr",   role: "alumno",   is_admin: false, es_coordinador: false };

// Llevan `role` porque Tareas y Exámenes piden los alumnos con un `.eq("role",
// "alumno")`: sin él, el doble los filtraría fuera y la prueba no vería ni una
// casilla que marcar.
const ALUMNOS = [
  { student_id: "u-ana",   id: "u-ana",   full_name: "Ana Rojas",    email: "ana@x.cr",   grupo: "7A", role: "alumno", is_admin: false, es_coordinador: false },
  { student_id: "u-bruno", id: "u-bruno", full_name: "Bruno Mena",   email: "bruno@x.cr", grupo: "7B", role: "alumno", is_admin: false, es_coordinador: false },
  { student_id: "u-cami",  id: "u-cami",  full_name: "Camila Ñúñez", email: "cami@x.cr",  grupo: "7B", role: "alumno", is_admin: false, es_coordinador: false },
];
// Uno con alumnos y otro vacío: el vacío NO tiene que salir en los filtros —
// un subgrupo sin nadie es un control que no hace nada.
const SUBGRUPOS = [
  { id: "sg-1", nombre: "Los del martes", alumnos: ["u-ana", "u-cami"], cuantos: 2 },
  { id: "sg-2", nombre: "Sin nadie",      alumnos: [],                  cuantos: 0 },
];

function clienteFalso(perfil, extra) {
  return `
window.__llamadas = [];
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const PERFIL = ${JSON.stringify(perfil)};
  const TABLAS = {
    profiles: ${JSON.stringify([PROFE, ...ALUMNOS])},
  };
  const RPC = {
    mis_subgrupos: ${JSON.stringify(SUBGRUPOS)},
    informes_resumen_alumnos: ${JSON.stringify(ALUMNOS)},
    ${extra || ""}
  };
  function constructor(filas, tabla) {
    let unica = false;
    let datos = Array.isArray(filas) ? filas.slice() : filas;
    const b = {
      select() { return b; },
      eq(col, val) { if (Array.isArray(datos)) datos = datos.filter((f) => String(f[col]) === String(val)); return b; },
      in() { return b; }, order() { return b; }, limit() { return b; },
      range() { return b; }, is() { return b; }, not() { return b; }, or() { return b; },
      insert(v) { window.__llamadas.push({ tabla, verbo: "insert", datos: v }); return b; },
      update(v) { window.__llamadas.push({ tabla, verbo: "update", datos: v }); return b; },
      upsert(v) { window.__llamadas.push({ tabla, verbo: "upsert", datos: v }); return b; },
      delete() { window.__llamadas.push({ tabla, verbo: "delete" }); return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = datos;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null, count: Array.isArray(filas) ? filas.length : null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: PERFIL.id }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(TABLAS[t] !== undefined ? TABLAS[t] : [], t),
    rpc: (n, args) => { window.__llamadas.push({ rpc: n, args: args || null });
                        return constructor(RPC[n] !== undefined ? RPC[n] : [], "rpc:" + n); },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
  const fetchReal = window.fetch;
  window.fetch = function (url, opciones) {
    if (String(url).indexOf("/functions/v1/") !== -1) {
      window.__llamadas.push({ funcion: JSON.parse((opciones && opciones.body) || "{}") });
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return fetchReal.apply(this, arguments);
  };
  (${contestarAvisos})();
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

async function abrir(browser, pagina, perfil, extra) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfil, extra) }));
  await page.goto(BASE + "/" + pagina, { waitUntil: "networkidle" });
  return { page, errores };
}

async function pruebaPagina(browser) {
  console.log("\n=== La página de subgrupos ===");
  const { page, errores } = await abrir(browser, "subgrupos.html", PROFE);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  igual("se ven los dos subgrupos",
    await page.evaluate(() => [...document.querySelectorAll("#lista input[type=text]")].map((i) => i.value)),
    ["Los del martes", "Sin nadie"]);
  igual("y cuántos alumnos tiene cada uno",
    await page.evaluate(() => [...document.querySelectorAll("#lista p")].map((p) => p.textContent)),
    ["2 alumnos", "0 alumnos"]);

  // -------- crear
  await page.evaluate(() => { window.__llamadas = []; });
  await page.fill("#nombre-nuevo", "  Los del torneo  ");
  await page.click("#crear-form button[type=submit]");
  await page.waitForTimeout(300);
  const creado = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "subgrupos" && l.verbo === "insert"));
  igual("crear manda el nombre sin espacios y a nombre de quien lo arma",
    creado && creado.datos, { profesor_id: "u-oscar", nombre: "Los del torneo" });

  // -------- renombrar
  await page.evaluate(() => { window.__llamadas = []; });
  await page.locator("#lista input[type=text]").first().fill("Los del jueves");
  await page.locator("#lista input[type=text]").first().blur();
  await page.waitForTimeout(300);
  igual("renombrar manda solo el nombre",
    await page.evaluate(() => (window.__llamadas.find((l) => l.tabla === "subgrupos" && l.verbo === "update") || {}).datos),
    { nombre: "Los del jueves" });

  // -------- quiénes están: SOLO LA DIFERENCIA
  await page.locator("#lista button", { hasText: "Quiénes están" }).first().click();
  await page.waitForTimeout(300);
  igual("las casillas marcadas son las del subgrupo",
    await page.evaluate(() => [...document.querySelectorAll("#lista input[type=checkbox]")].map((c) => c.checked)),
    [true, false, true]);

  await page.evaluate(() => { window.__llamadas = []; });
  // Se quita a Ana y se suma a Bruno: Camila no se toca.
  await page.locator("#lista input[type=checkbox]").nth(0).uncheck();
  await page.locator("#lista input[type=checkbox]").nth(1).check();
  await page.locator("#lista button", { hasText: "Guardar quiénes están" }).click();
  await page.waitForTimeout(400);
  const mandado = await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "subgrupo_alumnos"));
  /* Lo que de verdad importa: se manda SOLO lo que cambió. Borrar todo y
     volver a insertarlo dejaría el subgrupo vacío un instante y, si el insert
     fallara a mitad, se quedaría vacío sin que nadie lo pidiera. */
  igual("al guardar se manda solo lo que cambió",
    mandado.map((l) => l.verbo), ["delete", "insert"]);
  igual("y el que se suma es el que se marcó",
    (mandado.find((l) => l.verbo === "insert") || {}).datos,
    [{ subgrupo_id: "sg-1", alumno_id: "u-bruno" }]);

  // El buscador, sin tildes: "nunez" tiene que encontrar a "Ñúñez".
  await page.fill("#lista input[type=search]", "nunez");
  await page.waitForTimeout(200);
  igual("el buscador no se pierde con las tildes",
    await page.evaluate(() => [...document.querySelectorAll("#lista label span")].map((s) => s.textContent)),
    ["Camila Ñúñez · 7B"]);

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== Una alumna ===");
  const { page, errores } = await abrir(browser, "subgrupos.html", ALUMNA);
  await page.waitForSelector("#denegado:not(.hidden)", { timeout: 20000 });
  igual("no se le pinta nada de esto",
    await page.evaluate(() => document.getElementById("app").classList.contains("hidden")), "true");
  igual("y no se le pregunta por ningún subgrupo",
    await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "mis_subgrupos").length), 0);
  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

async function pruebaMarcar(browser, pagina) {
  console.log("\n=== Marcar un subgrupo en " + pagina + " ===");
  const { page, errores } = await abrir(browser, pagina, PROFE);
  await page.waitForSelector("#subgrupo-marcar", { timeout: 20000 });

  igual("solo se ofrecen los subgrupos que tienen a alguien",
    await page.evaluate(() => [...document.querySelectorAll("#subgrupo-marcar option")].map((o) => o.textContent)),
    ["— un subgrupo —", "Los del martes (2)"]);

  // Se marca a mano a alguien que NO es del subgrupo, para ver que elegirlo
  // deja exactamente a los suyos y no suma sobre lo que ya estaba.
  await page.locator(".alumno-check").nth(1).check();
  await page.selectOption("#subgrupo-marcar", "sg-1");
  await page.waitForTimeout(200);
  igual("elegirlo deja marcados SOLO a los suyos",
    await page.evaluate(() => [...document.querySelectorAll(".alumno-check")].map((c) => c.checked)),
    [true, false, true]);
  igual("y lo dice con todas las letras",
    await page.evaluate(() => document.querySelector("#subgrupo-marcar").parentNode.lastChild.textContent),
    "2 marcados");

  await page.selectOption("#subgrupo-marcar", "");
  await page.waitForTimeout(200);
  igual("volver a «un subgrupo» no deja a nadie marcado",
    await page.evaluate(() => [...document.querySelectorAll(".alumno-check")].filter((c) => c.checked).length), 0);

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

/* El filtro de Informes. Lo que se comprueba no es que el subgrupo salga en la
   lista —eso se ve— sino que FILTRE: un filtro que no filtra enseña el informe
   de toda la Academia y se ve exactamente igual de bien. */
async function pruebaFiltroInformes(browser) {
  console.log("\n=== El filtro de Informes ===");
  const extra = `
    informes_cursos_alumnos: [],
    informes_diagnosticos_alumnos: [],
    informes_totales: { clases_cerradas: 4, preguntas: 10, partidas: 2 },
  `;
  const { page, errores } = await abrir(browser, "informes.html", PROFE, extra);
  await page.waitForSelector("#teacher-filters:not(.hidden)", { timeout: 20000 });

  igual("los grupos de siempre y, debajo, los subgrupos propios",
    await page.evaluate(() => [...document.querySelectorAll("#group-filter option, #group-filter optgroup")]
      .map((o) => (o.tagName === "OPTGROUP" ? "[" + o.label + "]" : o.textContent))),
    ["Todos los grupos", "7A", "7B", "[Mis subgrupos]", "Los del martes (2)"]);

  const nombres = () => page.evaluate(() =>
    [...document.querySelectorAll("#attendance-table-body tr td:first-child")].map((td) => td.textContent));
  igual("sin filtro salen los tres", await nombres(), ["Ana Rojas", "Bruno Mena", "Camila Ñúñez"]);

  await page.selectOption("#group-filter", "sub:sg-1");
  await page.waitForTimeout(300);
  igual("con el subgrupo puesto, solo los suyos", await nombres(), ["Ana Rojas", "Camila Ñúñez"]);

  await page.selectOption("#group-filter", "7B");
  await page.waitForTimeout(300);
  igual("y el grupo de siempre sigue funcionando", await nombres(), ["Bruno Mena", "Camila Ñúñez"]);

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPagina(browser);
    await pruebaAlumna(browser);
    await pruebaMarcar(browser, "tareas.html");
    await pruebaMarcar(browser, "examenes.html");
    await pruebaFiltroInformes(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
