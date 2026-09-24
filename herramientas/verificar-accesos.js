/* Comprueba los precios y el acceso por paquetes: el módulo de precios, la
 * página de precios, la de paquetes (accesos.html) y el control de acceso que
 * va en cada página de la Academia (js/acceso-vigente.js).
 *
 * Todo lo que se rompe acá se rompe callado, y lo descubre quien paga:
 *
 *  - Un precio escrito a mano en una página que ya no coincide con el módulo:
 *    la familia ve uno en precios.html y le cobran otro.
 *  - Un salto en la tabla: 9 alumnos costando más que 10. Nadie hace la cuenta,
 *    y se le cobra de más a quien no la hizo.
 *  - Sumar un grupo a un paquete mandando SOLO el grupo: la base deja la lista
 *    exactamente como llega, así que los de antes perderían el acceso.
 *  - Un paquete que se pasa del cupo: se ve perfecto y se regaló una cuenta.
 *  - El interruptor de «exigir el acceso» encendido de un toque: deja fuera a
 *    todos los que todavía no están en un paquete.
 *  - Y el control de acceso tapando la página cuando la consulta FALLA: una red
 *    caída no puede dejar fuera a quien sí pagó.
 *
 * Lo que decide la base (cupos, quién puede qué, el cálculo de vigencia) se
 * comprobó impersonando roles en SQL; acá se mira lo que manda y pinta la
 * pantalla.
 *
 *   python3 -m http.server 8777     (desde la raíz del sitio)
 *   node herramientas/verificar-accesos.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("./lib/playwright-con-sesion");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
function cierto(nombre, cond, detalle) {
  if (cond) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

/* El módulo se carga DEL ARCHIVO QUE USAN LAS PÁGINAS. */
const w = {};
new Function("window", fs.readFileSync(path.join(RAIZ, "js/precios-acceso.js"), "utf8"))(w);
const P = w.PreciosAcceso;

/* ==================================================================
   1. Los precios, sin navegador
   ================================================================== */
function pruebaModulo() {
  console.log("\n=== El módulo de precios ===");
  igual("una cuenta cuesta lo mismo que el primer tramo", P.TRAMOS[0].precio, P.INDIVIDUAL);

  let saltos = [], subidas = [];
  let antes = P.cotizar(1);
  for (let n = 2; n <= 1000; n++) {
    const c = P.cotizar(n);
    if (c.total < antes.total) saltos.push(`${n - 1}→${n}: ${antes.total} > ${c.total}`);
    if (c.porAlumno > antes.porAlumno) subidas.push(n);
    antes = c;
  }
  cierto("comprar un alumno más nunca sale más barato (de 1 a 1000)", saltos.length === 0, saltos.slice(0, 5).join(", "));
  cierto("y el precio por alumno nunca sube al comprar más", subidas.length === 0, subidas.slice(0, 5).join(", "));
  igual("con 9 alumnos se cobra el paquete de 10, que sale más barato", P.cotizar(9).cobrados, 10);
  igual("con 25, el paquete 25 exacto", [P.cotizar(25).tramo.id, P.cotizar(25).total], ["p25", 25 * 2100]);
  igual("el ciclo lectivo son los meses cobrados", P.cotizar(10).ciclo, P.cotizar(10).total * P.MESES_COBRADOS_CICLO);
  igual("el año de una cuenta sale de su precio mensual", P.anual(P.INDIVIDUAL), P.INDIVIDUAL * P.MESES_COBRADOS_CICLO);
  igual("el año por alumno del paquete 25", P.cotizar(25).porAlumnoAnual, 2100 * P.MESES_COBRADOS_CICLO);
  igual("el formato es el de acá, con punto de miles", P.formato(122500), "₡122.500");

  const desdes = P.TRAMOS.map((t) => t.desde);
  cierto("los tramos van de menos a más alumnos", desdes.every((d, i) => i === 0 || d > desdes[i - 1]));

  // Ningún precio escrito a mano en las páginas nuevas.
  for (const f of ["precios.html", "accesos.html"]) {
    const s = fs.readFileSync(path.join(RAIZ, f), "utf8");
    cierto(`${f} no tiene ni un «₡» escrito: todos salen del módulo`, !s.includes("₡"));
  }
  const ep = fs.readFileSync(path.join(RAIZ, "elegir-plan.html"), "utf8");
  const m = ep.match(/id="precio-plataforma">([^<]*)</);
  igual("el precio de respaldo de elegir-plan.html dice lo mismo que el módulo", m && m[1], P.formato(P.INDIVIDUAL));
}

/* El control de acceso tiene que estar donde tiene que estar. La lista se le
   pide al generador, no se vuelve a escribir acá. */
function pruebaCabeceras() {
  console.log("\n=== El control de acceso en las páginas de la Academia ===");
  const py = fs.readFileSync(path.join(RAIZ, "herramientas/academia-cabecera.py"), "utf8");
  const lista = py.match(/PAGINAS = \[([\s\S]*?)\]/)[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));
  const sin = py.match(/SIN_ACCESO = \{([^}]*)\}/)[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));
  const faltan = [], sobran = [], rotas = [];
  for (const r of lista) {
    const s = fs.readFileSync(path.join(RAIZ, r), "utf8");
    const m = s.match(/<script src="([^"]*acceso-vigente\.js)"/);
    if (sin.includes(r)) { if (m) sobran.push(r); continue; }
    if (!m) { faltan.push(r); continue; }
    if (!fs.existsSync(path.join(RAIZ, path.dirname(r), m[1]))) rotas.push(r + " → " + m[1]);
  }
  cierto(`las ${lista.length - sin.length} páginas lo llevan`, faltan.length === 0, faltan.join(", "));
  cierto(`y las que tienen que quedar abiertas (${sin.join(", ")}) no`, sobran.length === 0, sobran.join(", "));
  cierto("con una ruta que llega de verdad al archivo", rotas.length === 0, rotas.join(", "));
}

/* ==================================================================
   2. En un navegador
   ================================================================== */
function clienteFalso(cfg) {
  return `
window.__rpc = [];
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const CFG = ${JSON.stringify(cfg)};
  const TABLAS = CFG.tablas || {};
  function b(filas, error) {
    let datos = Array.isArray(filas) ? filas.slice() : filas, unica = false;
    const q = {
      select() { return q; },
      eq(c, v) { if (Array.isArray(datos)) datos = datos.filter((f) => String(f[c]) === String(v)); return q; },
      in(c, vs) { if (Array.isArray(datos)) datos = datos.filter((f) => vs.map(String).includes(String(f[c]))); return q; },
      order() { return q; }, limit() { return q; }, gte() { return q; }, or() { return q; },
      range(a, z) { if (Array.isArray(datos)) datos = datos.slice(a, z + 1); return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) {
        let d = datos;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: error ? null : d, error: error || null }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: CFG.yo ? { user: { id: CFG.yo }, access_token: "t" } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => b(TABLAS[t] || []),
    rpc: (n, args) => {
      window.__rpc.push({ n, args: args || null });
      const r = (CFG.rpc || {})[n];
      if (r && r.__error) return b(null, { message: r.__error });
      return b(r === undefined ? null : r);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
})();
`;
}

async function abrir(browser, pagina, cfg) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(cfg) }));
  await page.goto(BASE + "/" + pagina, { waitUntil: "networkidle" });
  return { page, errores };
}
const rpcs = (page, n) => page.evaluate((n) => window.__rpc.filter((c) => c.n === n), n);

async function pruebaPrecios(browser) {
  console.log("\n=== precios.html ===");
  const { page, errores } = await abrir(browser, "precios.html", {});
  igual("una fila por tramo, sacada del módulo",
    await page.evaluate(() => [...document.querySelectorAll("#tabla-tramos tr")].map((t) => t.dataset.tramo)),
    P.TRAMOS.map((t) => t.id));
  igual("el precio de una cuenta", await page.textContent("#precio-individual"), P.formato(P.INDIVIDUAL));
  await page.fill("#calc-n", "9");
  const res = await page.textContent("#calc-res");
  cierto("la calculadora con 9 alumnos dice el total del paquete de 10 y lo explica",
    res.includes(P.formato(P.cotizar(9).total)) && res.includes("pagar 10"), res);
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await page.close();
}

const ADMIN = { id: "u-admin", full_name: "Oscar Angulo", role: "admin", is_admin: true };
const PROFE = { id: "u-kari", full_name: "Karina Rojas", role: "profesor", is_admin: false };
const ALUMNA = { id: "u-ana", full_name: "Ana Rojas", role: "alumno", is_admin: false };
const ALUMNOS = [
  { id: "a1", full_name: "Ana Rojas", email: "ana@x.com", grupo: "SJ", role: "alumno" },
  { id: "a2", full_name: "Bruno Mena", email: "bruno@x.com", grupo: "7B", role: "alumno" },
  { id: "a3", full_name: "Carla Solís", email: "carla@x.com", grupo: "7B", role: "alumno" },
  { id: "a4", full_name: "Diego Mora", email: "diego@x.com", grupo: "8A", role: "alumno" },
  { id: "a5", full_name: "Elena Vargas", email: "elena@x.com", grupo: "8A", role: "alumno" },
];
const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
const PAQ = {
  id: "pk1", nombre: "Colegio Prueba", titular_id: "u-kari", titular_nombre: "Karina Rojas", cupos: 3, usados: 1,
  vigente_desde: HOY, vigente_hasta: "2099-12-31", precio_mensual: 16500, moneda: "CRC", notas: null,
};

async function pruebaAccesos(browser) {
  console.log("\n=== accesos.html ===");

  // Sin paquete y sin administrar, no hay nada que ver.
  {
    const { page } = await abrir(browser, "accesos.html", {
      yo: ALUMNA.id, tablas: { profiles: [ALUMNA] }, rpc: { paquetes_con_uso: [], mi_acceso: { vigente: true } },
    });
    igual("a una alumna se le dice que no es para su cuenta",
      await page.evaluate(() => document.getElementById("denegado").checkVisibility()), true);
    igual("y no se le pinta la página", await page.evaluate(() => document.getElementById("app").checkVisibility()), false);
    await page.close();
  }

  const cfgAdmin = {
    yo: ADMIN.id,
    tablas: {
      profiles: [ADMIN, PROFE, ...ALUMNOS],
      paquete_alumnos: [{ paquete_id: "pk1", alumno_id: "a1" }],
      ajustes_academia: [],
      academias: [{ id: "acad1", nombre: "Academia Norte", supervisor_id: "u-sup" }],
    },
    rpc: {
      paquetes_con_uso: [PAQ],
      acceso_resumen: { alumnos: 5, con_acceso: 1, vencidos: 0, sin_paquete: 4, exigido: false },
      paquete_guardar: "pk-nuevo",
      paquete_set_alumnos: { ok: true, total: 3, cupos: 3 },
      acceso_set_exigido: true,
      mi_acceso: { vigente: true, motivo: "equipo" },
    },
  };
  const { page, errores } = await abrir(browser, "accesos.html", cfgAdmin);
  await page.waitForSelector("#app:not(.hidden)");

  // --- crear un paquete
  await page.fill("#f-nombre", "Academia Norte");
  await page.selectOption("#f-titular", "p:u-kari");
  await page.fill("#f-cupos", "25");
  igual("con 25 cupos propone el precio del módulo", await page.inputValue("#f-precio"), String(P.cotizar(25).total));
  await page.click("#f-guardar");
  await page.waitForTimeout(200);
  const g = (await rpcs(page, "paquete_guardar"))[0];
  igual("crear manda nombre, titular, cupos y precio",
    g && [g.args.p_id, g.args.p_nombre, g.args.p_titular, g.args.p_academia, g.args.p_cupos, g.args.p_precio],
    [null, "Academia Norte", "u-kari", null, 25, P.cotizar(25).total]);

  // --- un paquete cuyo titular es una academia: viaja el id de la academia y
  // NINGÚN profesor (la base rechaza los dos a la vez).
  await page.fill("#f-nombre", "Cupos Norte");
  await page.selectOption("#f-titular", "a:acad1");
  await page.click("#f-guardar");
  await page.waitForTimeout(200);
  const ga = (await rpcs(page, "paquete_guardar"))[1];
  igual("con una academia de titular manda la academia y no un profesor",
    ga && [ga.args.p_academia, ga.args.p_titular], ["acad1", null]);

  // --- una fecha al revés no viaja
  await page.fill("#f-nombre", "Al revés");
  await page.fill("#f-desde", "2026-12-01");
  await page.fill("#f-hasta", "2026-01-01");
  await page.click("#f-guardar");
  await page.waitForTimeout(100);
  igual("una fecha final anterior a la de inicio no se manda", (await rpcs(page, "paquete_guardar")).length, 2);

  await page.close();

  // --- sumar un grupo que no cabe: el paquete tiene 3 cupos y ya están Ana,
  // Bruno y Carla; los dos de 8A dejarían 5.
  const card = 'li[data-paquete="pk1"]';
  cfgAdmin.tablas.paquete_alumnos.push({ paquete_id: "pk1", alumno_id: "a2" }, { paquete_id: "pk1", alumno_id: "a3" });

  {
    const { page } = await abrir(browser, "accesos.html", cfgAdmin);
    await page.waitForSelector("#app:not(.hidden)");
    await page.click(card + " summary");
    await page.selectOption("#grupo-pk1", "8A");
    await page.click(card + " [data-grupo]");
    await page.waitForTimeout(150);
    igual("un grupo que no cabe en los cupos no se manda", (await rpcs(page, "paquete_set_alumnos")).length, 0);
    const msg = await page.textContent(card + " [data-msg]");
    cierto("y se dice cuántos quedarían", msg.includes("3 cupos") && msg.includes("5"), msg);
    await page.close();
  }

  // --- sumar un grupo que sí cabe: se manda la UNIÓN
  cfgAdmin.tablas.paquete_alumnos = [{ paquete_id: "pk1", alumno_id: "a1" }];
  {
    const { page } = await abrir(browser, "accesos.html", cfgAdmin);
    await page.waitForSelector("#app:not(.hidden)");
    await page.click(card + " summary");
    await page.selectOption("#grupo-pk1", "7B");
    await page.click(card + " [data-grupo]");
    await page.waitForTimeout(250);
    const s = (await rpcs(page, "paquete_set_alumnos"))[0];
    igual("sumar un grupo manda el que ya estaba MÁS el grupo", s && [s.args.p_id, [...s.args.p_alumnos].sort()], ["pk1", ["a1", "a2", "a3"]]);
    const msg = await page.textContent(card + " [data-msg]");
    cierto("y el aviso se lee en la tarjeta repintada", msg.includes("Entraron 2 de 7B"), msg);

    // --- quitar a una
    await page.evaluate(() => { window.__rpc = []; });
    const x = await page.$(card + ' button[aria-label="Quitar a Ana Rojas del paquete"]');
    cierto("cada alumno trae su botón para quitarlo, con su nombre", !!x);
    if (x) {
      await x.click();
      await page.waitForTimeout(200);
      const q = (await rpcs(page, "paquete_set_alumnos"))[0];
      igual("quitarla manda la lista SIN ella", q && q.args.p_alumnos, []);
    }

    // --- el interruptor pide dos toques
    await page.evaluate(() => { window.__rpc = []; });
    await page.click("#exigir-btn");
    igual("el primer toque no enciende nada", (await rpcs(page, "acceso_set_exigido")).length, 0);
    const t = await page.textContent("#exigir-btn");
    cierto("y dice cuántos quedarían fuera", t.includes("4 alumnos"), t);
    await page.click("#exigir-btn");
    await page.waitForTimeout(150);
    const e = (await rpcs(page, "acceso_set_exigido"))[0];
    igual("el segundo lo enciende", e && e.args.p_exigido, true);
    await page.close();
  }
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));

  // --- el titular (profesor) ve su paquete pero no el formulario ni el interruptor
  {
    const { page } = await abrir(browser, "accesos.html", {
      yo: PROFE.id,
      tablas: { profiles: [PROFE, ...ALUMNOS.slice(0, 3)], paquete_alumnos: [{ paquete_id: "pk1", alumno_id: "a1" }] },
      rpc: { paquetes_con_uso: [PAQ], mi_acceso: { vigente: true, motivo: "equipo" } },
    });
    await page.waitForSelector("#app:not(.hidden)");
    igual("el titular ve su paquete", await page.$$eval("#lista > li", (l) => l.length), 1);
    igual("pero no el formulario ni el interruptor",
      await page.evaluate(() => [document.getElementById("zona-form").checkVisibility(), document.getElementById("zona-exigir").checkVisibility()]),
      [false, false]);
    igual("y no pide el resumen de administración", (await rpcs(page, "acceso_resumen")).length, 0);
    await page.close();
  }
}

/* El supervisor reparte los cupos de SU academia, y solo entre sus miembros.
   Ve más alumnos que esos (la RLS le deja ver también a otros bajo su
   coordinación), así que el selector tiene que recortar: si no, le ofrecería a
   alguien que la base va a rechazar. */
async function pruebaAcademia(browser) {
  console.log("\n=== accesos.html · un paquete de academia ===");
  const SUP = { id: "u-sup", full_name: "Sara Supervisora", role: "profesor", is_admin: false, es_supervisor: true };
  const PAQA = {
    id: "pka", nombre: "Academia Norte 2026", titular_id: null, titular_nombre: null,
    academia_id: "acad1", academia_nombre: "Academia Norte", academia_supervisor_id: "u-sup",
    academia_supervisor_nombre: "Sara Supervisora", cupos: 10, usados: 1,
    vigente_desde: HOY, vigente_hasta: "2099-12-31", precio_mensual: null, moneda: "CRC", notas: null,
  };
  const { page, errores } = await abrir(browser, "accesos.html", {
    yo: SUP.id,
    tablas: {
      profiles: [SUP, ...ALUMNOS],
      paquete_alumnos: [{ paquete_id: "pka", alumno_id: "a1" }],
      // Miembros: Ana, Bruno y Diego. Carla (7B) y Elena (8A) no.
      academia_miembros: ["a1", "a2", "a4"].map((id) => ({ academia_id: "acad1", persona_id: id })),
    },
    rpc: { paquetes_con_uso: [PAQA], paquete_set_alumnos: { ok: true, total: 2, cupos: 10 }, mi_acceso: { vigente: true, motivo: "equipo" } },
  });
  await page.waitForSelector("#app:not(.hidden)");
  const card = 'li[data-paquete="pka"]';
  const t = await page.textContent(card);
  cierto("la tarjeta dice de qué academia es y quién la reparte", t.includes("Academia Norte") && t.includes("Sara Supervisora"), t);
  igual("no se le pinta el formulario de administración", await page.evaluate(() => document.getElementById("zona-form").checkVisibility()), false);
  await page.click(card + " summary");
  const ofrecidos = await page.$$eval(card + " select[aria-label='Alumno para sumar'] option", (os) => os.map((o) => o.value).filter(Boolean));
  igual("para sumar solo le ofrece a los miembros que faltan", ofrecidos.sort(), ["a2", "a4"]);
  await page.selectOption("#grupo-pka", "7B");
  await page.click(card + " [data-grupo]");
  await page.waitForTimeout(250);
  const s = (await rpcs(page, "paquete_set_alumnos"))[0];
  igual("sumar 7B manda la unión con SOLO el miembro de ese grupo (Carla no es de la academia)",
    s && [...s.args.p_alumnos].sort(), ["a1", "a2"]);
  cierto("sin errores en la página", errores.length === 0, errores.join(" | "));
  await page.close();
}

async function pruebaControl(browser) {
  console.log("\n=== El control de acceso, en una página de la Academia (logros.html) ===");
  const base = (mi) => ({
    yo: ALUMNA.id,
    tablas: { profiles: [ALUMNA], ajustes_academia: [{ clave: "whatsapp_consultas", valor: "8309-2291" }] },
    rpc: { mi_acceso: mi },
  });
  const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.checkVisibility(); }, sel);

  {
    const { page } = await abrir(browser, "logros.html", base({ vigente: false, motivo: "vencido", exigido: true, hasta: "2026-09-01" }));
    await page.waitForTimeout(400);
    igual("con el acceso vencido se tapa la página", await vis(page, "#main-content"), false);
    igual("y se ve el aviso", await vis(page, "#acceso-aviso"), true);
    const t = await page.textContent("#acceso-aviso");
    cierto("que dice cuándo venció", t.includes("venció el"), t);
    const wa = await page.getAttribute("#acceso-aviso a[href*='wa.me']", "href");
    cierto("y a dónde escribir, con el 506 delante", !!wa && wa.startsWith("https://wa.me/50683092291"), wa);
    igual("el foco va al título del aviso", await page.evaluate(() => document.activeElement && document.activeElement.tagName), "H1");
    await page.close();
  }
  {
    const { page } = await abrir(browser, "logros.html", base({ vigente: true, motivo: "paquete", exigido: true, hasta: "2099-01-01", dias: 3 }));
    await page.waitForTimeout(400);
    igual("con acceso vigente no se tapa nada", await vis(page, "#acceso-aviso"), false);
    igual("y fuera del panel tampoco se pinta la franja de «vence pronto»", await vis(page, "#acceso-franja"), false);
    await page.close();
  }
  {
    const { page } = await abrir(browser, "logros.html", base({ __error: "function mi_acceso() does not exist" }));
    await page.waitForTimeout(400);
    igual("si la consulta falla, NO se tapa (no se deja fuera a quien pagó)", await vis(page, "#acceso-aviso"), false);
    await page.close();
  }
  {
    // Una respuesta sin la forma esperada (un doble de otra prueba devuelve
    // un arreglo vacío) tampoco es un «no»: así fue como se encontró.
    const { page } = await abrir(browser, "logros.html", base([]));
    await page.waitForTimeout(400);
    igual("una respuesta sin `vigente` tampoco tapa", await vis(page, "#acceso-aviso"), false);
    await page.close();
  }
}

(async () => {
  pruebaModulo();
  pruebaCabeceras();
  if (process.argv.includes("--sin-navegador")) return terminar();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaPrecios(browser);
    await pruebaAccesos(browser);
    await pruebaAcademia(browser);
    await pruebaControl(browser);
  } finally {
    await browser.close();
  }
  terminar();
})().catch((e) => { console.error(e); process.exit(1); });

function terminar() {
  console.log(fallos ? `\n✗ ${fallos} comprobaciones fallaron` : "\n✓ Todo en orden");
  process.exit(fallos ? 1 : 0);
}
