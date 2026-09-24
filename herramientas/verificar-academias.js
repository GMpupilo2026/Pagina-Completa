#!/usr/bin/env node
/* Las academias y las funciones del coordinador, comprobadas desde afuera.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - una clave de función que existe en la pantalla y no en la base es una
 *    casilla que no apaga nada: el supervisor la desmarca, la ve guardada, y
 *    el coordinador sigue pudiendo;
 *  - sumar un grupo mandando SOLO el grupo deja la academia con esa gente y
 *    nadie más — se ve perfecto con los nombres nuevos y los de antes perdieron
 *    a su supervisor sin que nadie lo pidiera;
 *  - al supervisor ofrecerle cambiar el nombre, el supervisor o quitar a un
 *    profesor es ofrecerle botones que la base va a rechazar;
 *  - y una página de coordinación apagada que se ve vacía se lee como rota.
 *
 * Lo que hace cumplir la BASE (que el supervisor solo sume alumnos de sus
 * profesores, que el coordinador pierda de verdad lo que le quitan, que no se
 * dé funciones a sí mismo) se comprobó impersonando roles en SQL.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-academias.js [--sin-navegador]
 */
const fs = require("fs");
const path = require("path");
const { mensajesVisibles } = require("./lib/avisos-prueba.js");

const RAIZ = path.join(__dirname, "..");
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

// ── Sin navegador: la lista de funciones dice lo mismo en los dos lados ──
function pruebaLista() {
  console.log("\nLas funciones de coordinación, en la pantalla y en la base");
  const F = require(path.join(RAIZ, "js", "funciones-coordinacion.js"));
  const dir = path.join(RAIZ, "supabase", "migraciones");
  const conLista = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    .filter((f) => /function public\.funciones_coordinacion\(\)/.test(fs.readFileSync(path.join(dir, f), "utf8")));
  const sql = fs.readFileSync(path.join(dir, conLista[conLista.length - 1]), "utf8");
  const m = sql.match(/function public\.funciones_coordinacion\(\)[\s\S]*?array\[([^\]]*)\]/);
  const enBase = m ? m[1].split(",").map((x) => x.trim().replace(/'/g, "")) : [];
  igual("mismas claves y en el mismo orden", F.LISTA.map((f) => f.clave), enBase);
  const claves = new Set(enBase);
  igual("cada página del panel apunta a una clave que existe",
    Object.values(F.POR_PAGINA).filter((c) => !claves.has(c)), []);
  igual("ninguna clave sin título", F.LISTA.filter((f) => !f.titulo || !f.detalle).map((f) => f.clave), []);
}

// ── En un navegador ──────────────────────────────────────────────────────
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const ADMIN = { id: "adm", full_name: "Admin", email: "adm@x.cr", role: "admin", is_admin: true, es_supervisor: false, es_coordinador: false, grupo: null };
const SUP = { id: "sup", full_name: "Marta Solano", email: "marta@x.cr", role: "profesor", is_admin: false, es_supervisor: true, es_coordinador: false, grupo: null };
const PROF = { id: "prof", full_name: "Karina Rojas", email: "karina@x.cr", role: "profesor", is_admin: false, es_supervisor: false, es_coordinador: false, grupo: null };
const COORD = { id: "coord", full_name: "Luis Mora", email: "luis@x.cr", role: "profesor", is_admin: false, es_supervisor: false, es_coordinador: true, grupo: null };
const XSS = '<img src=x onerror="window.__xss=1">Ana';
const alumno = (id, nombre, grupo) => ({ id, full_name: nombre, email: id + "@x.cr", role: "alumno", is_admin: false, es_supervisor: false, es_coordinador: false, grupo });
const A1 = alumno("a1", XSS, "SJ"), A2 = alumno("a2", "Bruno Mena", "SJ"), A3 = alumno("a3", "Carla Pérez", "SJ"), A4 = alumno("a4", "Diego Solís", "CENFO");
const TODOS = [ADMIN, SUP, PROF, COORD, A1, A2, A3, A4];
const TODAS = ["formularios", "altas", "solicitudes", "cuentas", "acceso", "roles", "cobros", "equipos", "subgrupos"];

function clienteFalso(datos, yo) {
  return `
window.__rpc = [];
window.__subidas = []; window.__borrados = []; window.__escrituras = [];
window.SUPABASE_URL = "https://bgtijpimpcokxatxxbki.supabase.co";
(function () {
  const D = ${JSON.stringify(datos)};
  const YO = ${JSON.stringify(yo)};
  const ok = (data) => ({ then(res, rej) { return Promise.resolve({ data: data, error: null }).then(res, rej); } });
  function tabla(nombre) {
    let cond = [], unica = false, desde = 0, hasta = 1e9;
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; },
      range(a, z) { desde = a; hasta = z; return b; },
      eq(c, v) { cond.push([c, v]); return b; },
      maybeSingle() { unica = true; return b; }, single() { unica = true; return b; },
      insert(fila) { window.__escrituras.push({ tabla: nombre, op: "insert", fila: fila }); return b; },
      update(fila) { window.__escrituras.push({ tabla: nombre, op: "update", fila: fila }); return b; },
      then(res, rej) {
        let d = (D.tablas[nombre] || []).slice();
        cond.forEach(([c, v]) => { d = d.filter((f) => f[c] === v); });
        d = d.slice(desde, hasta + 1);
        if (unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  function personas(ac) {
    const dentro = new Set(D.tablas.academia_miembros.filter((m) => m.academia_id === ac).map((m) => m.persona_id));
    const cand = new Set(D.candidatos || []);
    return D.tablas.profiles.filter((p) => dentro.has(p.id) || cand.has(p.id)).map((p) => ({
      id: p.id, nombre: p.full_name, correo: p.email, rol: p.role, es_coordinador: p.es_coordinador,
      grupo: p.grupo, miembro: dentro.has(p.id),
      funciones: p.es_coordinador && dentro.has(p.id) ? (D.funciones[p.id] || ${JSON.stringify(TODAS)}) : null }));
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: YO.id }, access_token: "t" } } }) },
    from: tabla,
    storage: { from: (bucket) => ({
      upload(ruta, blob, opts) { window.__subidas.push({ bucket: bucket, ruta: ruta, tipo: blob.type, upsert: !!(opts && opts.upsert) }); return ok({ path: ruta }); },
      remove(rutas) { window.__borrados.push({ bucket: bucket, rutas: rutas }); return ok([]); },
    }) },
    channel() { return { on() { return this; }, subscribe() { return this; }, track() {}, presenceState() { return {}; } }; },
    removeChannel() {},
    rpc(n, args) {
      window.__rpc.push({ n: n, args: args || null });
      if (n === "academia_guardar") {
        const fila = { id: args.p_id || "ac-nueva", nombre: args.p_nombre, supervisor_id: args.p_supervisor,
          whatsapp: args.p_whatsapp, correo_respuestas: args.p_correo };
        D.tablas.academias = D.tablas.academias.filter((a) => a.id !== fila.id).concat([fila]);
        return ok(fila);
      }
      if (n === "academia_guardar_contacto") {
        const a = D.tablas.academias.find((x) => x.id === args.p_id);
        Object.assign(a, { whatsapp: args.p_whatsapp, correo_respuestas: args.p_correo });
        return ok(a);
      }
      if (n === "academia_guardar_marca") {
        const a = D.tablas.academias.find((x) => x.id === args.p_id);
        Object.assign(a, { color: args.p_color, logo_path: args.p_logo_path });
        return ok(Object.assign({}, a));
      }
      if (n === "academia_crear_desde_grupo") {
        const fila = { id: "ac-grupo", nombre: args.p_nombre, supervisor_id: args.p_supervisor, whatsapp: null, correo_respuestas: null };
        D.tablas.academias = D.tablas.academias.concat([fila]);
        D.tablas.academia_miembros = D.tablas.academia_miembros.concat(args.p_personas.map((p) => ({ academia_id: fila.id, persona_id: p })));
        return ok({ id: fila.id, nombre: fila.nombre, miembros: args.p_personas.length });
      }
      if (n === "ia_guardar_config") return ok({ academia_id: args.p_academia, modelo: args.p_modelo, tope_mensual_usd: args.p_tope });
      if (n === "academia_personas") return ok(personas(args.p_academia));
      if (n === "academia_set_miembros") {
        D.tablas.academia_miembros = D.tablas.academia_miembros.filter((m) => m.academia_id !== args.p_academia)
          .concat(args.p_personas.map((p) => ({ academia_id: args.p_academia, persona_id: p })));
        return ok(args.p_personas.length);
      }
      if (n === "academia_set_funciones_coordinador") { D.funciones[args.p_coordinador] = args.p_permitidas; return ok(args.p_permitidas); }
      if (n === "mis_funciones_coordinacion") return ok(D.misFunciones || ${JSON.stringify(TODAS)});
      return ok(D.rpc && D.rpc[n] !== undefined ? D.rpc[n] : []);
    },
  };
})();`;
}

async function abrir(browser, pagina, datos, yo, esperar) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/storage/v1/object/public/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, yo) }));
  await page.goto(BASE + pagina, { waitUntil: "networkidle" });
  await page.waitForSelector(esperar || "#app:not(.hidden)", { timeout: 15000 });
  return { page, errores };
}
const llamadas = (page, n) => page.evaluate((x) => window.__rpc.filter((r) => r.n === x).map((r) => r.args), n);
const seVe = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? (e.checkVisibility() ? "sí" : "no") : "no existe"; }, sel);
const ordenado = (xs) => (xs || []).slice().sort();

function datosBase(extra) {
  return Object.assign({
    tablas: {
      profiles: TODOS.map((p) => Object.assign({}, p)),
      academias: [{ id: "ac1", nombre: "Los Reyes", supervisor_id: "sup", whatsapp: null, correo_respuestas: null }],
      academia_miembros: [["prof"], ["coord"], ["a1"]].map(([p]) => ({ academia_id: "ac1", persona_id: p })),
    },
    funciones: {}, candidatos: [],
  }, extra || {});
}

async function pruebaAdmin(browser) {
  console.log("\nQuien administra crea academias y reparte gente");
  const { page, errores } = await abrir(browser, "/academias.html", datosBase(), ADMIN, "#vista-lista:not([hidden])");
  igual("se ve la academia con su supervisor", await page.$eval("#lista", (u) => u.textContent.includes("Supervisa Marta Solano")), true);
  igual("el supervisor ocupado se ofrece apagado para otra academia",
    await page.$eval('#n-supervisor option[value="sup"]', (o) => o.disabled), true);

  await page.fill("#n-nombre", "Santa Ana");
  await page.click('#form-nueva button[type="submit"]');
  await page.waitForSelector("#vista-academia:not([hidden])");
  igual("crear manda el nombre y ningún id", (await llamadas(page, "academia_guardar"))[0],
    { p_id: null, p_nombre: "Santa Ana", p_supervisor: null, p_whatsapp: null, p_correo: null });

  // Volver y abrir Los Reyes.
  await page.click("#volver");
  await page.waitForSelector("#vista-lista:not([hidden])");
  await page.click('#lista button[aria-label="Abrir Los Reyes"]');
  await page.waitForSelector("#vista-academia:not([hidden])");
  igual("quien administra ve el nombre y el supervisor para editar", [await seVe(page, "#d-nombre"), await seVe(page, "#d-supervisor")], ["sí", "sí"]);
  igual("un nombre con etiquetas se ve literal y no se ejecuta",
    [await page.$eval("#miembros", (d) => d.textContent.includes('<img src=x onerror="window.__xss=1">Ana')), await page.evaluate(() => !!window.__xss)], [true, false]);

  // Sumar el grupo SJ: tiene que viajar la UNIÓN.
  await page.selectOption("#grupo", "SJ");
  await page.click("#sumar-grupo-btn");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "academia_set_miembros"));
  const set = (await llamadas(page, "academia_set_miembros"))[0];
  igual("sumar un grupo manda la UNIÓN con los que ya estaban", ordenado(set.p_personas), ordenado(["prof", "coord", "a1", "a2", "a3"]));

  // Quitar a uno: el resto se queda.
  await page.click('button[aria-label="Quitar a Bruno Mena de la academia"]');
  await page.waitForFunction(() => window.__rpc.filter((r) => r.n === "academia_set_miembros").length === 2);
  igual("quitar manda la lista entera sin esa persona", ordenado((await llamadas(page, "academia_set_miembros"))[1].p_personas),
    ordenado(["prof", "coord", "a1", "a3"]));

  // Funciones del coordinador: se desmarca Cobros.
  await page.uncheck("#f-coord-cobros");
  await page.click("#coordinadores fieldset button");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "academia_set_funciones_coordinador"));
  const f = (await llamadas(page, "academia_set_funciones_coordinador"))[0];
  igual("se mandan las funciones permitidas, sin cobros", [f.p_coordinador, f.p_permitidas], ["coord", TODAS.filter((x) => x !== "cobros")]);
  igual("sin errores en la página", errores, []);
  await page.close();
}

/* El asistente: crear una academia desde un grupo. Lo que se rompe callado es
   mandar otra gente que la que se ve marcada, o crear en tres llamadas. */
async function pruebaDesdeGrupo(browser) {
  console.log("\nCrear una academia desde un grupo");
  const persona = (p, extra) => Object.assign({ id: p.id, nombre: p.full_name, rol: p.role, es_coordinador: p.es_coordinador,
    es_supervisor: p.es_supervisor, en_grupo: p.grupo === "SJ", alumnos_del_grupo: 0, academias: [] }, extra || {});
  const gente = [persona(PROF, { alumnos_del_grupo: 2, academias: ["Los Reyes"] }), persona(COORD, { en_grupo: true }),
    persona(A1, { academias: ["Los Reyes"] }), persona(A2), persona(A3)];
  const { page, errores } = await abrir(browser, "/academias.html", datosBase({ rpc: { grupo_para_academia: gente } }), ADMIN, "#vista-lista:not([hidden])");
  igual("el grupo se ofrece con cuántos alumnos tiene", await page.$eval('#g-grupo option[value="SJ"]', (o) => o.textContent), "SJ (3 alumnos)");
  igual("antes de elegir no se destapa nada", await seVe(page, "#g-detalle"), "no");
  await page.selectOption("#g-grupo", "SJ");
  await page.waitForSelector("#g-detalle:not([hidden])");
  igual("se le pregunta a la base quién está en el grupo", (await llamadas(page, "grupo_para_academia"))[0], { p_grupo: "SJ" });
  igual("el nombre arranca con el del grupo", await page.$eval("#g-nombre", (i) => i.value), "SJ");
  igual("se ofrecen los dos del equipo docente, marcados", await page.$$eval("#g-docentes input", (xs) => xs.map((x) => [x.value, x.checked])), [["prof", true], ["coord", true]]);
  igual("dice a cuántos del grupo da clase y en qué academia ya está",
    await page.$eval("#g-docentes", (d) => d.textContent.includes("da clase a 2 alumnos del grupo") && d.textContent.includes("ya está en Los Reyes")), true);
  igual("avisa que uno de los alumnos queda en dos academias", await page.$eval("#g-alumnos-otra", (p) => p.textContent.startsWith("1 ya está en otra academia")), true);
  igual("el supervisor que ya tiene academia no se ofrece", await page.$('#g-supervisor option[value="sup"]'), null);
  igual("el profesor del grupo se ofrece diciendo que se lo marca", await page.$eval('#g-supervisor option[value="prof"]', (o) => o.textContent), "Karina Rojas (se marca como supervisor)");
  igual("el botón cuenta a los cinco", await page.$eval("#g-crear", (b) => b.textContent), "Crear la academia con 5 personas");

  // Sin nadie marcado no viaja nada.
  await page.uncheck("#g-alumnos"); await page.uncheck("#g-doc-prof"); await page.uncheck("#g-doc-coord");
  igual("sin nadie marcado el botón no se puede apretar", await page.$eval("#g-crear", (b) => b.disabled), true);
  await page.check("#g-alumnos"); await page.check("#g-doc-prof");

  await page.fill("#g-nombre", "Academia San José");
  await page.selectOption("#g-supervisor", "prof");
  igual("la nota dice que se lo marca como supervisor", await page.$eval("#g-supervisor-nota", (p) => p.textContent.includes("Karina Rojas queda marcado como supervisor")), true);
  await page.click("#g-crear");
  await page.waitForSelector("#vista-academia:not([hidden])");
  const c = await llamadas(page, "academia_crear_desde_grupo");
  igual("se crea en UNA llamada, sin pasar por academia_guardar ni academia_set_miembros",
    [c.length, (await llamadas(page, "academia_guardar")).length, (await llamadas(page, "academia_set_miembros")).length], [1, 0, 0]);
  igual("viaja el nombre escrito, el supervisor y SOLO la gente marcada",
    [c[0].p_nombre, c[0].p_supervisor, ordenado(c[0].p_personas)], ["Academia San José", "prof", ordenado(["prof", "a1", "a2", "a3"])]);
  igual("queda abierta la academia recién creada", await page.$eval("#titulo", (h) => h.textContent.trim()), "🏫 Academia San José");
  igual("el aviso dice con cuántas personas nació", await mensajesVisibles(page), "Academia «Academia San José» creada con 4 personas.");
  igual("sin errores en la página", errores, []);
  await page.close();
}

async function pruebaSupervisor(browser) {
  console.log("\nQuien supervisa: solo su academia, y solo lo que puede tocar");
  const { page, errores } = await abrir(browser, "/academias.html", datosBase({ candidatos: ["a2", "a3"] }), SUP, "#vista-academia:not([hidden])");
  igual("entra directo a su academia", await page.$eval("#titulo", (h) => h.textContent.trim()), "🏫 Los Reyes");
  igual("no se le ofrece ni el nombre, ni el supervisor, ni borrar",
    [await seVe(page, "#d-nombre"), await seVe(page, "#d-supervisor"), await seVe(page, "#borrar"), await seVe(page, "#volver")], ["no", "no", "no", "no"]);
  igual("solo los alumnos tienen ✕",
    await page.$$eval("#miembros button", (bs) => bs.map((b) => b.getAttribute("aria-label")).filter((x) => /Karina|Luis/.test(x))), []);
  igual("el botón dice cuántos alumnos de sus profesores faltan", await page.$eval("#sumar-todos", (b) => b.textContent), "Sumar a los 2 alumnos de tus profesores");
  await page.click("#sumar-todos");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "academia_set_miembros"));
  igual("sumarlos manda la UNIÓN", ordenado((await llamadas(page, "academia_set_miembros"))[0].p_personas),
    ordenado(["prof", "coord", "a1", "a2", "a3"]));

  await page.fill("#d-whatsapp", "123");
  await page.click('#form-datos button[type="submit"]');
  igual("un WhatsApp corto no viaja", (await llamadas(page, "academia_guardar_contacto")).length, 0);
  await page.fill("#d-whatsapp", "8888 7777");
  await page.fill("#d-correo", "reyes@academia.cr");
  await page.click('#form-datos button[type="submit"]');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "academia_guardar_contacto"));
  igual("guarda el contacto por su función y no por la de quien administra",
    [(await llamadas(page, "academia_guardar_contacto"))[0], (await llamadas(page, "academia_guardar")).length],
    [{ p_id: "ac1", p_whatsapp: "8888 7777", p_correo: "reyes@academia.cr" }, 0]);
  igual("sin errores en la página", errores, []);
  await page.close();

  console.log("\nUn supervisor sin academia");
  const sinAc = await abrir(browser, "/academias.html", datosBase({ tablas: { profiles: TODOS, academias: [], academia_miembros: [] } }), SUP);
  igual("se le dice que todavía no tiene una", await sinAc.page.$eval("#intro", (p) => p.textContent.includes("Todavía no tienes una academia")), true);
  await sinAc.page.close();
}

async function pruebaSinAcceso(browser) {
  console.log("\nQuien no administra ni supervisa");
  const { page } = await abrir(browser, "/academias.html", datosBase(), A2, "#denegado:not(.hidden)");
  igual("ve el aviso y ninguna llamada de academias", (await page.evaluate(() => window.__rpc.map((r) => r.n))).filter((n) => n.startsWith("academia")), []);
  await page.close();
}

async function pruebaFuncionesApagadas(browser) {
  console.log("\nUn coordinador al que su supervisor le apagó funciones");
  const sinFormularios = TODAS.filter((x) => x !== "formularios" && x !== "cobros");
  for (const [pagina, clave] of [["/formularios.html", "Formularios de inscripción"], ["/cobros.html", "Cobros"]]) {
    const { page, errores } = await abrir(browser, pagina, datosBase({ misFunciones: sinFormularios }), COORD, "#loading");
    await page.waitForFunction(() => /funciones de coordinación/.test(document.getElementById("loading").textContent));
    igual(pagina + ": dice que no es de sus funciones y quién decide",
      await page.$eval("#loading", (d) => d.textContent.includes(" no está entre tus funciones") && d.textContent.includes("supervisa")), true);
    igual(pagina + ": la página no se destapa", await seVe(page, "#app"), "no");
    igual(pagina + ": " + clave + " sin errores", errores, []);
    await page.close();
  }
}


// ── La marca: el contraste se cuenta igual en la pantalla y en la base ──
function pruebaContraste() {
  console.log("\nLa regla del color de la marca");
  const M = require(path.join(RAIZ, "js", "marca-academia.js"));
  // #767676 es el gris más claro que llega a 4.5 contra el blanco; #777777 ya no.
  igual("#767676 llega a 4,5 y #777777 no", [M.contrasteConBlanco("#767676") >= 4.5, M.contrasteConBlanco("#777777") >= 4.5], [true, false]);
  igual("el azul de siempre pasa y el ámbar no", [M.contrasteConBlanco("#102a43") >= 4.5, M.contrasteConBlanco("#f0b429") >= 4.5], [true, false]);
  igual("lo que no es un color no se cuenta", M.contrasteConBlanco("azul"), null);
  const dir = path.join(RAIZ, "supabase", "migraciones");
  const sql = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8")).filter((t) => /function public\.color_con_texto_blanco/.test(t)).pop() || "";
  igual("la base usa el mismo umbral y la misma fórmula",
    [/>= 4\.5/.test(sql), /0\.03928/.test(sql), /0\.2126 \* r \+ 0\.7152 \* g \+ 0\.0722 \* b/.test(sql)], [true, true, true]);
  igual("la URL del logo apunta al bucket público", M.urlDelLogo("ac1/logo-abc123.webp", "https://x.supabase.co"),
    "https://x.supabase.co/storage/v1/object/public/academia-marca/ac1/logo-abc123.webp");
}

// Un PNG de 2×2 de verdad, para el selector de archivo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGNk+M/wn4GBgYGJgYGBAQAb3gIC3jM7ZQAAAABJRU5ErkJggg==", "base64");

async function pruebaMarca(browser) {
  console.log("\nLa marca de la academia: el supervisor la elige");
  const { page, errores } = await abrir(browser, "/academias.html", datosBase(), SUP, "#vista-academia:not([hidden])");
  await page.fill("#m-color-texto", "#f0b429");
  igual("un color claro dice que tiene que llegar a 4,5", await page.$eval("#m-contraste", (p) => p.textContent.includes("4,5")), true);
  await page.click('#form-marca button[type="submit"]');
  igual("y no viaja", (await llamadas(page, "academia_guardar_marca")).length, 0);
  await page.fill("#m-color-texto", "#1b4332");
  igual("la vista previa se pinta con ese color", await page.$eval("#m-vista", (d) => getComputedStyle(d).backgroundColor), "rgb(27, 67, 50)");
  await page.click('#form-marca button[type="submit"]');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "academia_guardar_marca"));
  igual("guarda el color por su función, sin logo", (await llamadas(page, "academia_guardar_marca"))[0],
    { p_id: "ac1", p_color: "#1b4332", p_logo_path: null });

  await page.setInputFiles("#m-logo", { name: "logo.png", mimeType: "image/png", buffer: PNG });
  await page.waitForFunction(() => !document.getElementById("m-vista-logo").hidden);
  igual("el logo elegido se ve en la vista previa antes de subirlo", await page.evaluate(() => window.__subidas.length), 0);
  await page.click('#form-marca button[type="submit"]');
  await page.waitForFunction(() => window.__rpc.filter((r) => r.n === "academia_guardar_marca").length === 2);
  const sub = await page.evaluate(() => window.__subidas[0]);
  const g2 = (await llamadas(page, "academia_guardar_marca"))[1];
  igual("se sube a la carpeta de ESA academia, sin pisar nada",
    [sub.bucket, /^ac1\/logo-[a-z0-9]{6,40}\.(webp|png)$/.test(sub.ruta), sub.upsert], ["academia-marca", true, false]);
  igual("y se guarda exactamente la ruta que se subió", g2.p_logo_path, sub.ruta);

  await page.setInputFiles("#m-logo", { name: "otro.png", mimeType: "image/png", buffer: PNG });
  await page.waitForFunction(() => window.__subidas.length === 0 || true);
  await page.click('#form-marca button[type="submit"]');
  await page.waitForFunction(() => window.__rpc.filter((r) => r.n === "academia_guardar_marca").length === 3);
  igual("cambiar el logo borra el anterior", await page.evaluate(() => window.__borrados.map((b) => b.rutas).flat()), [sub.ruta]);

  await page.setInputFiles("#m-logo", { name: "virus.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  igual("un SVG no se acepta", await page.evaluate(() => window.__subidas.length), 2);
  igual("sin errores en la página", errores, []);
  await page.close();

  console.log("\nLa marca en el encabezado de su gente");
  const marca = { academia_id: "ac1", nombre: XSS, color: "#1b4332", logo_path: "ac1/logo-abc123.webp" };
  const conMarca = datosBase({ rpc: { mi_marca_academia: [marca] } });
  const cab = await abrir(browser, "/academias.html", conMarca, SUP, "#vista-academia:not([hidden])");
  await cab.page.waitForFunction(() => document.getElementById("marca-enlace").dataset.academia === "ac1");
  igual("el nombre de la academia se ve literal y no se ejecuta",
    [await cab.page.$eval("#marca-enlace", (a) => a.textContent.includes('<img src=x onerror="window.__xss=1">Ana')), await cab.page.evaluate(() => !!window.__xss)], [true, false]);
  igual("el encabezado toma el color de la academia", await cab.page.$eval("#header", (h) => getComputedStyle(h).backgroundColor), "rgb(27, 67, 50)");
  igual("el logo sale del bucket público", await cab.page.$eval("#marca-enlace img", (i) => i.getAttribute("src")),
    "https://bgtijpimpcokxatxxbki.supabase.co/storage/v1/object/public/academia-marca/ac1/logo-abc123.webp");
  igual("el enlace sigue llevando al panel", await cab.page.$eval("#marca-enlace", (a) => a.getAttribute("href")), "clases.html");
  await cab.page.close();

  const conTema = await browser.newPage();
  await conTema.addInitScript(() => localStorage.setItem("plataforma_tema_v1", "princesas"));
  await conTema.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await conTema.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(conMarca, SUP) }));
  await conTema.goto(BASE + "/academias.html", { waitUntil: "networkidle" });
  await conTema.waitForFunction(() => document.getElementById("marca-enlace").dataset.academia === "ac1");
  igual("con un tema elegido, el color de la academia no lo pisa", await conTema.$eval("#header", (h) => h.style.backgroundColor), "");
  await conTema.close();

  const sinMarca = await abrir(browser, "/academias.html", datosBase(), SUP, "#vista-academia:not([hidden])");
  await sinMarca.page.waitForTimeout(300);
  igual("sin marca (dos academias o ninguna) queda Ajedrez Integral", await sinMarca.page.$eval("#marca-enlace", (a) => a.textContent.includes("Integral")), true);
  await sinMarca.page.close();
}

async function pruebaFormularioConMarca(browser) {
  console.log("\nLos formularios con la marca de la academia");
  const datos = datosBase({ tablas: Object.assign(datosBase().tablas, {
    formularios: [{ id: "f1", slug: "torneo", titulo: "Torneo", campos: [{ id: "nombre", etiqueta: "Nombre", tipo: "texto" }],
      abierto: true, creado_por: "coord", academia_id: null, grupo: null, formulario_respuestas: [{ count: 0 }] }],
  }) });
  const { page, errores } = await abrir(browser, "/formularios.html", datos, COORD, "#vista-lista:not(.hidden)");
  await page.evaluate(() => abrirEditor(null));
  igual("uno nuevo arranca con la única academia de quien lo arma",
    [await seVe(page, "#f-academia"), await page.$eval("#f-academia", (s) => s.value)], ["sí", "ac1"]);
  await page.evaluate(() => abrirEditor(misFormularios[0]));
  igual("uno que ya existía sin marca la conserva vacía", await page.$eval("#f-academia", (s) => s.value), "");
  await page.selectOption("#f-academia", "ac1");
  await page.click("#guardar-btn");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "formularios"));
  igual("guardar manda la academia elegida", await page.evaluate(() => window.__escrituras.find((e) => e.tabla === "formularios").fila.academia_id), "ac1");
  igual("sin errores en la página", errores, []);
  await page.close();

  const publico = await browser.newPage();
  const errPub = [];
  publico.on("pageerror", (e) => errPub.push(String(e)));
  await publico.route("**/storage/v1/object/public/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await publico.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript",
    body: clienteFalso(datosBase({ rpc: { formulario_publico: [{ id: "f1", titulo: "Torneo de otoño", descripcion: null, grupo: null,
      campos: [{ id: "nombre", etiqueta: "Nombre", tipo: "texto" }], cierra_el: null,
      academia_nombre: "Los Reyes", academia_color: "#1b4332", academia_logo: "ac1/logo-abc123.webp" }] } }), { id: null }) }));
  await publico.goto(BASE + "/formulario.html?f=torneo", { waitUntil: "networkidle" });
  await publico.waitForSelector("#formulario:not(.hidden)");
  igual("el formulario público lleva el nombre, el color y el logo de la academia",
    [await seVe(publico, "#marca"), await publico.$eval("#marca-nombre", (p) => p.textContent),
     await publico.$eval("#marca", (d) => getComputedStyle(d).backgroundColor), await publico.$eval("#marca-logo", (i) => i.naturalWidth > 0)],
    ["sí", "Los Reyes", "rgb(27, 67, 50)", true]);
  igual("y la pestaña dice de qué academia es", await publico.title(), "Torneo de otoño — Los Reyes");
  igual("sin errores en la página", errPub, []);
  await publico.close();
}

async function pruebaIA(browser) {
  console.log("\n«Mejorar informe»: el modelo y el tope, solo para quien administra");
  const datos = datosBase({ rpc: { ia_resumen_mes: [{ academia_id: "ac1", llamadas: 4, fallidas: 1, tokens_entrada: 900, tokens_salida: 1200, costo_usd: 0.42 }] } });
  datos.tablas.academia_ia = [{ academia_id: "ac1", modelo: "claude-sonnet-5", tope_mensual_usd: 3 }];
  const { page, errores } = await abrir(browser, "/academias.html", datos, ADMIN, "#vista-lista:not([hidden])");
  await page.waitForSelector("#seccion-ia");
  igual("hay una fila por academia y la de «sin academia»", await page.$$eval("#ia-filas fieldset legend", (ls) => ls.map((l) => l.textContent)),
    ["Los Reyes", "Sin academia (tú y quien no es de ninguna academia)"]);
  igual("se ve el modelo y el tope guardados", [await page.$eval("#ia-modelo-ac1", (s) => s.value), await page.$eval("#ia-tope-ac1", (i) => i.value)], ["claude-sonnet-5", "3"]);
  igual("y cuánto lleva este mes", await page.$eval("#ia-lleva-ac1", (p) => p.textContent.includes("US$0.42 de US$3.00") && p.textContent.includes("1 no salieron")), true);
  await page.fill("#ia-tope-ac1", "5000");
  await page.click('button[aria-label="Guardar la IA de Los Reyes"]');
  igual("un tope de 5000 no viaja", (await llamadas(page, "ia_guardar_config")).length, 0);
  await page.selectOption("#ia-modelo-ac1", "claude-haiku-4-5");
  await page.fill("#ia-tope-ac1", "2.5");
  await page.click('button[aria-label="Guardar la IA de Los Reyes"]');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "ia_guardar_config"));
  igual("guardar manda la academia, el modelo y el tope", (await llamadas(page, "ia_guardar_config"))[0],
    { p_academia: "ac1", p_modelo: "claude-haiku-4-5", p_tope: 2.5 });
  await page.selectOption("#ia-modelo-general", "");
  await page.click('button[aria-label="Guardar la IA de Sin academia (tú y quien no es de ninguna academia)"]');
  await page.waitForFunction(() => window.__rpc.filter((r) => r.n === "ia_guardar_config").length === 2);
  igual("«sin IA» en la fila general viaja como null, con academia null", (await llamadas(page, "ia_guardar_config"))[1],
    { p_academia: null, p_modelo: null, p_tope: 5 });
  igual("sin errores en la página", errores, []);
  await page.close();

  const sup = await abrir(browser, "/academias.html", datos, SUP, "#vista-academia:not([hidden])");
  igual("al supervisor no le llega ni el marcado de la IA", [await sup.page.$("#seccion-ia"), await sup.page.evaluate(() => /Mejorar informe|Claude|Tope al mes/.test(document.body.innerText))], [null, false]);
  igual("ni se le pide el gasto a la base", (await sup.page.evaluate(() => window.__rpc.map((r) => r.n))).filter((n) => n.startsWith("ia_")), []);
  await sup.page.close();
}

(async () => {
  pruebaLista();
  pruebaContraste();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const { chromium } = require("./lib/playwright-con-sesion");
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaAdmin(browser);
    await pruebaDesdeGrupo(browser);
    await pruebaSupervisor(browser);
    await pruebaSinAcceso(browser);
    await pruebaFuncionesApagadas(browser);
    await pruebaMarca(browser);
    await pruebaFormularioConMarca(browser);
    await pruebaIA(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e.stack || e));
    fallos += 1;
  }
  await browser.close();
  terminar();
})();

function terminar() {
  console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo en orden.");
  process.exit(fallos ? 1 : 0);
}
