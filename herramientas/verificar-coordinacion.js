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
/* `profesores` es la columna que estrena la ficha: todos los de ese alumno,
   no solo los que quien mira coordina. Ana lleva a Luis —coordinado, y por eso
   con su ✕— y a Marta, que es de OTRA coordinación: se le ve el nombre y no se
   le puede quitar. */
const GENTE = [
  { id: "u-luis",  full_name: "Luis Vega",    email: "luis@x.cr",   role: "profesor", grupo: null, es_coordinador: false, is_admin: false, alumnos: 1, subgrupos: 2, profesores: [], total: 3 },
  { id: "u-oscar", full_name: "Oscar Angulo", email: "oscar@x.cr",  role: "admin",    grupo: null, es_coordinador: false, is_admin: true,  alumnos: 0, subgrupos: 0, profesores: [], total: 3 },
  { id: "u-ana",   full_name: "Ana Rojas",    email: "ana@x.cr",    role: "alumno",   grupo: "7A", es_coordinador: false, is_admin: false, alumnos: 0, subgrupos: 0, total: 3,
    profesores: [{ id: "u-luis", nombre: "Luis Vega" }, { id: "u-marta", nombre: "Marta Solís" }] },
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
      if (n === "coord_guardar_cuenta") {
        return constructor({ ok: true, full_name: (args || {}).p_nombre, grupo: (args || {}).p_grupo }, "rpc:coord_guardar_cuenta");
      }
      if (n === "coord_set_profesores") {
        return constructor({ ok: true, profesores: (args || {}).p_profesores }, "rpc:coord_set_profesores");
      }
      return constructor([], "rpc:" + n);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
  const fetchReal = window.fetch;
  window.fetch = function (url, opciones) {
    if (String(url).indexOf("/functions/v1/") !== -1) {
      const cuerpo = JSON.parse((opciones && opciones.body) || "{}");
      window.__llamadas.push({ funcion: cuerpo, url: String(url) });
      /* Cada función contesta lo SUYO. Con una respuesta única para las tres,
         cambiar el correo diría "listo" con lo que devuelve reenviar-acceso y
         la prueba daría verde sobre una pantalla que no enseña el correo que
         de verdad quedó — que es lo único que esa pantalla tiene que enseñar,
         porque el usuario lo desempata el servidor. */
      let respuesta = { ok: true, correo_destino: "mama@x.cr" };
      if (String(url).indexOf("correos-alumno") !== -1 && cuerpo.action === "cuenta") {
        respuesta = { ok: true, cambiado: cuerpo.sin_correo ? "ana.rojas2" : String(cuerpo.email || "").toLowerCase() };
      }
      return Promise.resolve(new Response(JSON.stringify(respuesta),
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

/* LA FICHA. Es lo que quien coordina hace todos los días —corregirle el
   nombre a una familia nueva, arreglarle una letra al correo, repartir a un
   alumno entre sus profesores— y lo que antes había que pedirle a quien
   administra. Todo lo que se rompe acá se rompe callado: un correo mandado
   con el id de otra cuenta queda en la ficha que no era y la pantalla se ve
   perfecta. */
async function pruebaFicha(browser) {
  console.log("\n=== La ficha de una cuenta ===");
  const { page, errores } = await abrir(browser, "coordinacion.html", COORD);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll("#lista > div").length >= 3, { timeout: 10000 });

  /* Se abre la de la alumna, no la primera que haya: las fichas se distinguen
     por su cuenta y abrir la que no era es el fallo de esta pantalla. */
  const abrirFicha = async (correo) => {
    await page.evaluate((c) => {
      const tarjetas = Array.from(document.querySelectorAll("#lista > div"));
      const suya = tarjetas.find((t) => t.textContent.indexOf(c) !== -1);
      suya.querySelector("button[aria-expanded]").click();
    }, correo);
  };
  await abrirFicha("ana@x.cr");
  await page.waitForFunction(() => document.querySelectorAll("#lista input[type=checkbox]").length > 0, { timeout: 10000 });

  igual("la ficha dice con qué entra y deja corregirlo",
    await page.evaluate(() => {
      const c = Array.from(document.querySelectorAll("#lista input")).find((i) => i.value === "ana@x.cr");
      return !!c && !c.disabled;
    }), "true");

  // --------------------------------------------- el nombre y el grupo
  await page.evaluate(() => { window.__rpc = []; window.__llamadas = []; });
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("#lista input[type=text]"));
    inputs[0].value = "Ana Ramírez";
    inputs[1].value = "7B";
    Array.from(document.querySelectorAll("#lista button")).find((b) => b.textContent === "Guardar").click();
  });
  await page.waitForFunction(() => window.__rpc.some((r) => r.rpc === "coord_guardar_cuenta"), { timeout: 10000 });
  const upd = await page.evaluate(() => window.__rpc.find((r) => r.rpc === "coord_guardar_cuenta").args);
  igual("guardar manda el nombre y el grupo de ESA cuenta",
    [upd.p_persona, upd.p_nombre, upd.p_grupo], ["u-ana", "Ana Ramírez", "7B"]);
  /* Va por SU función de la base y no por el panel de administración: el
     alcance de la coordinación ya vive en SQL, y partirlo entre la base y una
     Edge Function que tendría que volver a preguntar lo mismo es como se
     separan dos versiones de la misma regla. */
  igual("y no se cuela el rol ni nada de la cuenta master",
    Object.keys(upd).sort(), ["p_grupo", "p_nombre", "p_persona"]);
  igual("el encabezado de la tarjeta se entera, sin cerrar la ficha",
    await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll("#lista > div")).find((x) => x.textContent.indexOf("ana@x.cr") !== -1);
      return [t.textContent.indexOf("Ana Ramírez") !== -1, t.querySelector("input[type=checkbox]") !== null];
    }), [true, true]);

  // ------------------------------------------------------- el correo
  await page.evaluate(() => { window.__llamadas = []; });
  await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll("#lista input")).find((i) => i.value === "ana@x.cr");
    c.value = "ana.ramirez@x.cr";
    Array.from(document.querySelectorAll("#lista button")).find((b) => b.textContent === "Cambiar el correo").click();
  });
  await page.waitForFunction(() => window.__llamadas.some((l) => l.funcion && l.funcion.action === "cuenta"), { timeout: 10000 });
  const cor = await page.evaluate(() => window.__llamadas.find((l) => l.funcion && l.funcion.action === "cuenta"));
  igual("el correo lo cambia correos-alumno, que es donde ya vivía esa regla",
    cor.url.indexOf("correos-alumno") !== -1, "true");
  igual("y va con el alumno y el correo escrito",
    [cor.funcion.alumno_id, cor.funcion.email, cor.funcion.sin_correo], ["u-ana", "ana.ramirez@x.cr", false]);

  /* «No tiene correo propio»: el campo se APAGA —no se esconde— y lo que la
     pantalla enseña al final es el usuario que devolvió el SERVIDOR, no el
     que ella propuso. Enseñar el propuesto dejaría a la familia intentando
     entrar con uno que no es. */
  await page.evaluate(() => { window.__llamadas = []; });
  await page.evaluate(() => { document.querySelector("#lista input[type=checkbox]").click(); });
  igual("marcar «no tiene correo propio» apaga el campo, no lo esconde",
    await page.evaluate(() => {
      const c = Array.from(document.querySelectorAll("#lista input")).find((i) => i.value.indexOf("ana") === 0);
      return [c.disabled, getComputedStyle(c).display !== "none"];
    }), [true, true]);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("#lista button")).find((b) => b.textContent === "Cambiar el correo").click();
  });
  await page.waitForFunction(() => window.__llamadas.some((l) => l.funcion && l.funcion.sin_correo === true), { timeout: 10000 });
  await page.waitForFunction(() => document.getElementById("aviso").textContent.indexOf("ana.rojas2") !== -1, { timeout: 10000 });
  igual("y se enseña el usuario que devolvió el servidor, no el que se propuso",
    await page.evaluate(() => Array.from(document.querySelectorAll("#lista input")).some((i) => i.value === "ana.rojas2")), "true");

  // --------------------------------------------------- sus profesores
  igual("se ven TODOS sus profesores, no solo los que coordina",
    await page.evaluate(() => {
      // Dentro de SU apartado: la etiqueta de rol de la tarjeta comparte
      // clases con estas, y contarla daría verde sobre una lista equivocada.
      const h = Array.from(document.querySelectorAll("#lista h3")).find((x) => x.textContent === "Sus profesores");
      return Array.from(h.parentElement.querySelectorAll("span.rounded-full"))
        .map((x) => x.textContent.replace("✕", "").trim());
    }), ["Luis Vega", "Marta Solís"]);
  /* Y a la de OTRA coordinación no se le pinta ✕: quitársela sería dejar sin
     su alumna a una colega, y `coord_set_profesores()` la conserva igual — acá
     lo que se evita es ofrecer un botón que va a fallar. */
  igual("pero solo se puede quitar al que coordina",
    await page.evaluate(() => Array.from(document.querySelectorAll("#lista button"))
      .filter((b) => b.textContent === "✕")
      .map((b) => b.getAttribute("aria-label"))), ["Quitarle a Luis Vega"]);

  await page.evaluate(() => { window.__rpc = []; window.__llamadas = []; });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("#lista button")).find((b) => b.textContent === "✕").click();
  });
  await page.waitForFunction(() => window.__rpc.some((r) => r.rpc === "coord_set_profesores"), { timeout: 10000 });
  const st = await page.evaluate(() => window.__rpc.find((r) => r.rpc === "coord_set_profesores").args);
  igual("quitarle uno manda la lista sin él, y sobre esa alumna",
    [st.p_alumno, st.p_profesores.join(",")], ["u-ana", "u-marta"]);
  /* Lo que se manda es la lista COMPLETA de los que coordina: la función deja
     la lista exactamente como llegó y conserva aparte a los de fuera de su
     alcance. Mandar «el que se quitó» en vez de la lista entera se vería
     igual y dejaría a la alumna con los dos. */
  igual("y no se manda a la Edge Function del panel de administración",
    await page.evaluate(() => window.__llamadas.filter((l) => l.funcion).length), 0);

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
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
    await pruebaFicha(browser);
    await pruebaSinProfesores(browser);
    await pruebaAlumna(browser);
    await pruebaSubgruposAjenos(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
