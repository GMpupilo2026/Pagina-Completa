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

(async () => {
  pruebaLista();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaAdmin(browser);
    await pruebaSupervisor(browser);
    await pruebaSinAcceso(browser);
    await pruebaFuncionesApagadas(browser);
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
