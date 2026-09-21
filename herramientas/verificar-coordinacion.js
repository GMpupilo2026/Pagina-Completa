/* Comprueba, en un navegador de verdad y con un Supabase de mentira, lo que
   hace el panel de Coordinación y los subgrupos armados para otra persona.

   Lo que se rompe acá se rompe callado, y caro:

   1. LA LISTA LA PIDE A LA BASE (`mi_gente`), con su búsqueda, su filtro y su
      rango. Si alguien la vuelve a armar bajándose `profiles`, la página se ve
      igual de bien hasta que la academia pasa del techo de PostgREST y empieza
      a esconder cuentas sin decir nada — y esto nace pensando en miles.
   2. EL DUEÑO DE UN SUBGRUPO AJENO. Con `?profesor=`, crear tiene que mandar
      el id del PROFESOR, no el de quien coordina: mandando el propio, quien
      coordina se queda los subgrupos que creía estar armándole a otro, y en
      la pantalla se ve exactamente igual.
   3. QUE NO SE OFREZCA LO QUE LA BASE VA A RECHAZAR: cambiar el rol de la
      cuenta master, o el propio.

   Lo que hace cumplir la base —el alcance, que un alumno no se ascienda, que
   bajar a un profesor con alumnos se rechace— se comprobó impersonando roles
   en SQL, no acá.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-coordinacion.js                         */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const COORD  = { id: "u-coord", full_name: "Karina Mora", email: "karina@x.cr", role: "profesor", is_admin: false, es_coordinador: true };
const PROFE  = { id: "u-luis",  full_name: "Luis Vega",   email: "luis@x.cr",   role: "profesor", is_admin: false, es_coordinador: false };
const ALUMNA = { id: "u-ana",   full_name: "Ana Rojas",   email: "ana@x.cr",    role: "alumno",   is_admin: false, es_coordinador: false };
const MASTER = { id: "u-oscar", full_name: "Oscar Angulo", email: "oscar@x.cr", role: "admin",    is_admin: true,  es_coordinador: false };

// Lo que devolvería `mi_gente`: un profesor coordinado, su alumna, la propia
// cuenta y la master. El `total` viaja en cada fila, como la función.
const GENTE = [
  { id: "u-luis",  full_name: "Luis Vega",    email: "luis@x.cr",   role: "profesor", grupo: null, es_coordinador: false, is_admin: false, alumnos: 1, subgrupos: 2, total: 3 },
  { id: "u-oscar", full_name: "Oscar Angulo", email: "oscar@x.cr",  role: "admin",    grupo: null, es_coordinador: false, is_admin: true,  alumnos: 0, subgrupos: 0, total: 3 },
  { id: "u-ana",   full_name: "Ana Rojas",    email: "ana@x.cr",    role: "alumno",   grupo: "7A", es_coordinador: false, is_admin: false, alumnos: 0, subgrupos: 0, total: 3 },
];

function clienteFalso(perfil, gente) {
  return `
window.__llamadas = [];
window.__rpc = [];
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const PERFIL = ${JSON.stringify(perfil)};
  const GENTE = ${JSON.stringify(gente)};
  const TABLAS = {
    profiles: ${JSON.stringify([COORD, PROFE, ALUMNA, MASTER])},
  };
  /* Este doble FILTRA de verdad por rol y por texto, igual que la función de
     la base: uno que devolviera siempre la lista entera daría por buena una
     página que no le pasa el filtro a la base y lo hace acá. */
  function gentePara(args) {
    let filas = GENTE.slice();
    if (args && args.p_rol) filas = filas.filter((g) => g.role === args.p_rol);
    if (args && args.p_busqueda) {
      const q = String(args.p_busqueda).toLowerCase();
      filas = filas.filter((g) => (g.full_name + " " + g.email).toLowerCase().includes(q));
    }
    const total = filas.length;
    const desde = (args && args.p_desde) || 0;
    const limite = (args && args.p_limite) || 50;
    return filas.slice(desde, desde + limite).map((g) => Object.assign({}, g, { total: total }));
  }
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
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  const SUBGRUPOS_AJENOS = [{ id: "sg-9", nombre: "Los de Luis", alumnos: ["u-ana"], cuantos: 1 }];
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: PERFIL.id }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(TABLAS[t] !== undefined ? TABLAS[t] : [], t),
    rpc: (n, args) => {
      window.__rpc.push({ rpc: n, args: args || null });
      window.__llamadas.push({ rpc: n, args: args || null });
      if (n === "mi_gente") return constructor(gentePara(args), "rpc:mi_gente");
      if (n === "subgrupos_de") return constructor(SUBGRUPOS_AJENOS, "rpc:subgrupos_de");
      if (n === "alumnos_del_profesor_con_nombre") {
        return constructor([{ id: "u-ana", full_name: "Ana Rojas", email: "ana@x.cr", grupo: "7A" }], "rpc:alumnos");
      }
      if (n === "mis_subgrupos") return constructor([], "rpc:mis_subgrupos");
      if (n === "informes_resumen_alumnos") return constructor([], "rpc:informes");
      if (n === "cambiar_rol") return constructor({ ok: true, rol: (args || {}).p_rol }, "rpc:cambiar_rol");
      return constructor([], "rpc:" + n);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
  const fetchReal = window.fetch;
  window.fetch = function (url, opciones) {
    if (String(url).indexOf("/functions/v1/") !== -1) {
      window.__llamadas.push({ funcion: JSON.parse((opciones && opciones.body) || "{}"), url: String(url) });
      return Promise.resolve(new Response(JSON.stringify({ ok: true, correo_destino: "mama@x.cr" }),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return fetchReal.apply(this, arguments);
  };
  window.confirm = () => true;
  window.alert = () => {};
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

async function abrir(browser, pagina, perfil, gente) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfil, gente || GENTE) }));
  await page.goto(BASE + "/" + pagina, { waitUntil: "networkidle" });
  return { page, errores };
}

async function pruebaPanel(browser) {
  console.log("\n=== El panel de Coordinación ===");
  const { page, errores } = await abrir(browser, "coordinacion.html", COORD);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  igual("la lista se le pide a la base, con su filtro y su rango",
    await page.evaluate(() => {
      const c = window.__rpc.filter((r) => r.rpc === "mi_gente").pop();
      return c && { rol: c.args.p_rol, limite: c.args.p_limite, desde: c.args.p_desde };
    }), { rol: null, limite: 50, desde: 0 });
  igual("y nadie se baja la tabla de cuentas",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "profiles" && l.verbo === undefined).length), 0);

  igual("salen las cuentas de su gente, profesores primero",
    await page.evaluate(() => [...document.querySelectorAll("#lista p.font-semibold")].map((p) => p.textContent.trim())),
    ["Luis Vega Profesor", "Oscar Angulo Alumno", "Ana Rojas Alumno"]);

  igual("dice cuántas de cuántas",
    await page.evaluate(() => document.getElementById("cuenta").textContent), "Mostrando 3 de 3 cuentas");

  /* Lo que NO se ofrece: cambiarle el rol a la cuenta master ni a uno mismo.
     Un botón que la base va a rechazar es peor que ninguno. */
  const botones = await page.evaluate(() =>
    [...document.querySelectorAll("#lista > div")].map((d) =>
      [...d.querySelectorAll("button, a")].map((b) => b.textContent.trim())));
  igual("a la cuenta master no se le ofrece cambiar de rol",
    botones[1].some((b) => /Hacer profesor|Pasar a alumno/.test(b)), "false");
  igual("a un profesor se le ofrece entrar a sus subgrupos",
    botones[0].includes("👥 Sus subgrupos"), "true");

  /* La etiqueta de rol tiene que PINTAR. Esta página está detrás del login, así
     que verificar-css.js —que abre las páginas sin cuenta— no ve ni una de sus
     clases: una que no esté en la paleta (el ámbar no tiene 100 ni 900) se
     queda sin CSS, la etiqueta sale sin fondo y no falla nada. Se mide el color
     que calcula el navegador, no la clase. */
  igual("la etiqueta de rol pinta de verdad, no es una clase que no existe",
    await page.evaluate(() => {
      const e = document.querySelector("#lista p.font-semibold span");
      const fondo = getComputedStyle(e).backgroundColor;
      return fondo !== "rgba(0, 0, 0, 0)" && fondo !== "transparent";
    }), "true");

  // Cambiar el rol: dos toques, y lo que se manda.
  await page.evaluate(() => { window.__llamadas = []; });
  const filaAna = page.locator("#lista > div").nth(2);
  await filaAna.locator("button", { hasText: "Hacer profesor" }).click();
  igual("el primer toque solo pregunta",
    await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "cambiar_rol").length), 0);
  await filaAna.locator("button", { hasText: "¿Seguro?" }).click();
  await page.waitForTimeout(400);
  igual("y el segundo manda a quién y a qué rol",
    await page.evaluate(() => (window.__llamadas.find((l) => l.rpc === "cambiar_rol") || {}).args),
    { p_persona: "u-ana", p_rol: "profesor" });

  // Reenviar el acceso
  await page.evaluate(() => { window.__llamadas = []; });
  await page.locator("#lista > div").nth(0).locator("button", { hasText: "Reenviar acceso" }).click();
  await page.waitForTimeout(400);
  const envio = await page.evaluate(() => window.__llamadas.find((l) => l.funcion));
  igual("reenviar acceso llama a su función con esa cuenta",
    envio && { cuerpo: envio.funcion, es: /reenviar-acceso/.test(envio.url) },
    { cuerpo: { alumno_id: "u-luis" }, es: true });
  igual("y dice a qué bandeja salió — que es el dato que hace falta para avisarle a la familia",
    /mama@x\.cr/.test(await page.evaluate(() => document.getElementById("aviso").textContent)), "true");

  // Buscar: lo pregunta la base.
  await page.evaluate(() => { window.__rpc = []; });
  await page.fill("#buscar", "vega");
  await page.waitForTimeout(600);
  igual("buscar se lo pregunta a la base",
    await page.evaluate(() => (window.__rpc.filter((r) => r.rpc === "mi_gente").pop() || {}).args.p_busqueda), "vega");
  igual("y deja solo lo que coincide",
    await page.evaluate(() => document.querySelectorAll("#lista > div").length), 1);

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

async function pruebaSinProfesores(browser) {
  console.log("\n=== Coordinar sin ningún profesor vinculado ===");
  // Nadie: es lo que ve quien todavía no tiene ningún profesor vinculado.
  const { page, errores } = await abrir(browser, "coordinacion.html", COORD, []);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  /* Sin esta franja, quien coordina entra, ve casi nada y no tiene forma de
     saber por qué. Se mide el `display` que calcula el navegador, no el
     atributo: la lección que dejó el cartel de instalar la app. */
  igual("se le dice por qué no ve a nadie, y se ve de verdad",
    await page.evaluate(() => {
      const p = document.getElementById("sin-profesores");
      return getComputedStyle(p).display !== "none" && /te los vincula/.test(p.textContent);
    }), "true");
  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== Una alumna ===");
  const { page, errores } = await abrir(browser, "coordinacion.html", ALUMNA);
  await page.waitForSelector("#denegado:not(.hidden)", { timeout: 20000 });
  igual("no se le pinta ninguna cuenta",
    await page.evaluate(() => document.getElementById("app").classList.contains("hidden")), "true");
  igual("y no se le pregunta por nadie",
    await page.evaluate(() => window.__rpc.filter((r) => r.rpc === "mi_gente").length), 0);
  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

async function pruebaSubgruposAjenos(browser) {
  console.log("\n=== Armarle los subgrupos a un profesor ===");
  const { page, errores } = await abrir(browser, "subgrupos.html?profesor=u-luis", COORD);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  igual("el título dice de quién son",
    await page.evaluate(() => document.getElementById("titulo").textContent), "👥 Los subgrupos de Luis Vega");
  igual("y se avisa de que siguen siendo suyos",
    /[Ss]iguen siendo suyos/.test(await page.evaluate(() => document.getElementById("ajeno").textContent)), "true");
  igual("se piden los de ÉL, no los propios",
    await page.evaluate(() => window.__rpc.map((r) => r.rpc).filter((n) => /subgrupos/.test(n))), ["subgrupos_de"]);
  igual("y sus alumnos, no los de quien coordina",
    await page.evaluate(() => window.__rpc.some((r) => r.rpc === "alumnos_del_profesor_con_nombre")), "true");

  /* EL FALLO CALLADO DE ESTA PANTALLA: crear con el id de quien coordina en
     vez del de su profesor. Se vería exactamente igual, y quien coordina se
     quedaría los subgrupos que creía estar armándole a otro. */
  await page.evaluate(() => { window.__llamadas = []; });
  await page.fill("#nombre-nuevo", "Los del sábado");
  await page.click("#crear-form button[type=submit]");
  await page.waitForTimeout(300);
  igual("crear lo deja a nombre del PROFESOR, no de quien coordina",
    await page.evaluate(() => (window.__llamadas.find((l) => l.tabla === "subgrupos" && l.verbo === "insert") || {}).datos),
    { profesor_id: "u-luis", nombre: "Los del sábado" });

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPanel(browser);
    await pruebaSinProfesores(browser);
    await pruebaAlumna(browser);
    await pruebaSubgruposAjenos(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
