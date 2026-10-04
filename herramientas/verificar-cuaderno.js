#!/usr/bin/env node
/* Comprueba «Mi cuaderno» (cuaderno.html, js/cuaderno.js y el botón al final
 * de cada ejercicio de js/ejercicio-tablero.js) en un navegador de verdad, con
 * un Supabase de mentira que FILTRA en el resolver y anota lo que se escribe.
 *
 * Lo que se rompe acá no da ningún error: un insert que manda la posición
 * equivocada, un buscador que deja pasar la coma y rompe el filtro (o lo
 * ensancha), un profe que ve botones de editar en el cuaderno ajeno, o una
 * posición rota que se guarda igual. Los permisos de verdad los pone la RLS
 * (probada impersonando roles, ver «Mi cuaderno» en
 * docs/decisiones/seguimiento-del-alumno.md); acá se mira la pantalla.
 *
 *   python3 -m http.server 8777    (desde la raíz del sitio)
 *   node herramientas/verificar-cuaderno.js
 */
const { chromium } = require("./lib/playwright-con-sesion");
const { contestarAvisos } = require("./lib/avisos-prueba.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function igual(n, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log(`  ✗ ${n}\n      esperaba: ${b}\n      salió:    ${a}`); fallos++; }
  else console.log(`  ✓ ${n}`);
}

const PASILLO = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const FILAS = [
  { id: "c1", alumno_id: "u-ana", fen: PASILLO, titulo: "Mate del pasillo", nota: "No vi que el rey\nno tenía salida", origen: "Mates · Mate en 1", enlace: "entreno/mates.html?cat=mate1", jugadas: ["Ra8#"], compartida: true, created_at: "2026-10-01T15:00:00Z", updated_at: "2026-10-01T15:00:00Z" },
  { id: "c2", alumno_id: "u-ana", fen: "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1", titulo: null, nota: null, origen: "Agregada a mano", enlace: "https://malo.example/x.html", jugadas: null, compartida: false, created_at: "2026-09-20T15:00:00Z", updated_at: "2026-09-28T15:00:00Z" },
  { id: "c3", alumno_id: "u-beto", fen: PASILLO, titulo: "De otro", nota: "", origen: "", enlace: null, jugadas: null, compartida: true, created_at: "2026-09-20T15:00:00Z", updated_at: "2026-09-20T15:00:00Z" },
];

function clienteFalso(yo, filas) {
  return `
(function () {
  window.__escrituras = []; window.__consultas = [];
  const FILAS = ${JSON.stringify(filas)};
  const PERFILES = [{ id: "u-ana", full_name: "Ana Rojas", role: "alumno" }, { id: "u-profe", full_name: "Karina Rojas", role: "profesor" }];
  function consulta(tabla) {
    const filtros = []; let accion = null, datos = null, unica = false, cuenta = false, cabeza = false, o = null, rango = null;
    const datosDe = () => tabla === "cuaderno" ? FILAS : tabla === "profiles" ? PERFILES : [];
    const q = {
      select(_c, op) { if (op && op.count) cuenta = true; if (op && op.head) cabeza = true; return q; },
      eq(c, v) { filtros.push([c, v]); return q; },
      or(expr) { o = expr; return q; },
      order() { return q; }, limit() { return q; },
      range(a, z) { rango = [a, z]; return q; },
      insert(f) { accion = "insert"; datos = f; return q; },
      update(f) { accion = "update"; datos = f; return q; },
      delete() { accion = "delete"; return q; },
      maybeSingle() { unica = true; return q; }, single() { unica = true; return q; },
      then(res, rej) {
        // Los filtros se aplican EN EL RESOLVER: .update(x).eq(...) encadena.
        let f = datosDe().filter((x) => filtros.every(([c, v]) => String(x[c]) === String(v)));
        if (o) {
          const partes = String(o).split(",").map((p) => p.split("."));
          f = f.filter((x) => partes.some(([c, op, v]) => op === "ilike" && String(x[c] || "").toLowerCase().includes(String(v).replace(/%/g, "").toLowerCase())));
        }
        window.__consultas.push({ tabla, accion, filtros: filtros.slice(), or: o, rango });
        if (accion) {
          window.__escrituras.push({ tabla, accion, datos, filtros: filtros.slice() });
          if (accion === "insert") { const n = Object.assign({ id: "nuevo", alumno_id: ${JSON.stringify(yo)}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, datos); FILAS.unshift(n); f = [n]; }
          if (accion === "update") f.forEach((x) => Object.assign(x, datos));
          if (accion === "delete") f.forEach((x) => FILAS.splice(FILAS.indexOf(x), 1));
        }
        const total = f.length;
        if (rango) f = f.slice(rango[0], rango[1] + 1);
        const data = cabeza ? null : unica ? (f[0] || null) : f;
        return Promise.resolve({ data, error: null, count: cuenta ? total : null }).then(res, rej);
      },
    };
    return q;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: ${yo ? `{ user: { id: ${JSON.stringify(yo)} }, access_token: "t" }` : "null"} } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t) => consulta(t),
    rpc: () => consulta("rpc"),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, ruta, yo, filas, opciones) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones || {}));
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(yo, filas) }));
  await ctx.addInitScript(contestarAvisos);
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, ctx, errores };
}

const tarjetas = (page) => page.evaluate(() => [...document.querySelectorAll("#cuaderno-lista > li")].map((li) => ({
  titulo: li.querySelector("h2").textContent,
  datos: li.querySelector("h2 + p").textContent,
  nota: (li.querySelector("p.whitespace-pre-line") || {}).textContent || null,
  casillas: li.querySelectorAll(".example-sq").length,
  volver: (li.querySelector("a") || {}).getAttribute ? li.querySelector("a").getAttribute("href") : null,
  botones: [...li.querySelectorAll("button")].map((b) => b.textContent),
})));

async function pruebaAlumna(browser) {
  console.log("\n=== Mi cuaderno, el de la alumna ===");
  const { page, ctx, errores } = await abrir(browser, "/cuaderno.html", "u-ana", FILAS);
  await page.waitForSelector("#cuaderno-lista > li", { timeout: 10000 }).catch(() => {});
  const t = await tarjetas(page);
  igual("pinta solo lo suyo, lo último primero, con su tablero", t.map((x) => [x.titulo, x.casillas]), [["Mate del pasillo", 64], ["Agregada a mano", 64]]);
  igual("dice quién lo ve y de dónde salió", t[0].datos, "Juegan las blancas · guardada el 1 oct 2026 · Mates · Mate en 1 · la ve tu profe");
  igual("una cambiada dice cuándo se cambió", t[1].datos, "Juegan las blancas · cambiada el 28 sept 2026 · solo tú");
  igual("la nota, con sus saltos de línea", t[0].nota, "No vi que el rey\nno tenía salida");
  igual("vuelve al ejercicio por una dirección del sitio; otra página no se enlaza", [t[0].volver, t[1].volver], ["/entreno/mates.html?cat=mate1", null]);
  igual("se puede editar y borrar", t[0].botones, ["Editar", "Borrar"]);
  igual("cuenta cuántas tiene", await page.textContent("#cuaderno-cuenta"), "2 posiciones");

  // El buscador: lo pide la base, sin la coma ni los paréntesis.
  await page.fill("#cuaderno-buscar", "pasillo, (x)");
  await page.waitForFunction(() => document.querySelectorAll("#cuaderno-lista > li").length === 1, null, { timeout: 5000 }).catch(() => {});
  const busco = await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "cuaderno" && c.or).pop());
  igual("busca en la base, con lo escrito limpio", busco && busco.or, "titulo.ilike.%pasillo   x%,nota.ilike.%pasillo   x%,origen.ilike.%pasillo   x%");
  await page.fill("#cuaderno-buscar", "pasillo");
  await page.waitForFunction(() => document.querySelectorAll("#cuaderno-lista > li").length === 1, null, { timeout: 5000 }).catch(() => {});
  igual("y encuentra la del pasillo", (await tarjetas(page)).map((x) => x.titulo), ["Mate del pasillo"]);
  await page.fill("#cuaderno-buscar", "");
  await page.waitForFunction(() => document.querySelectorAll("#cuaderno-lista > li").length === 2, null, { timeout: 5000 }).catch(() => {});

  // Agregar a mano: una posición rota no se guarda, y lo dice.
  await page.click("#cuaderno-agregar summary");
  await page.fill("#cuaderno-fen", "8/8/8/8/8/8/8/8 w - - 0 1");
  await page.click("#cuaderno-form button[type=submit]");
  igual("una posición sin reyes no se guarda, y dice por qué", await page.textContent("#cuaderno-fen-error"), "Debe haber exactamente un rey blanco y un rey negro en el tablero.");
  await page.fill("#cuaderno-fen", "esto no es un fen");
  await page.click("#cuaderno-form button[type=submit]");
  igual("algo que no es una posición, tampoco", /no se pudo leer/.test(await page.textContent("#cuaderno-fen-error")), true);

  // Una buena abre la ventana: título, nota y quién la ve.
  await page.evaluate(() => { window.__respuestas.push({ titulo: "Rey y peón", nota: "La oposición manda", compartida: "si" }); });
  await page.fill("#cuaderno-fen", "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
  await page.click("#cuaderno-form button[type=submit]");
  await page.waitForFunction(() => (window.__campos || []).length, null, { timeout: 5000 }).catch(() => {});
  igual("la ventana pide título, nota y quién la ve", await page.evaluate(() => window.__campos[0] && window.__campos[0].etiquetas), ["Título", "Tu nota", "¿Quién la ve?"]);
  await page.waitForFunction(() => window.__escrituras.some((e) => e.accion === "insert"), null, { timeout: 5000 }).catch(() => {});
  const ins = await page.evaluate(() => window.__escrituras.find((e) => e.accion === "insert"));
  igual("guarda la posición con lo que escribió, sin decir de quién es (lo pone la base)", ins && ins.datos,
    { fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", titulo: "Rey y peón", nota: "La oposición manda", compartida: true, origen: "Agregada a mano" });
  await page.waitForFunction(() => document.querySelectorAll("#cuaderno-lista > li").length === 3, null, { timeout: 5000 }).catch(() => {});
  igual("y aparece arriba", (await tarjetas(page))[0].titulo, "Rey y peón");

  // Borrar pregunta antes, y borra ESA.
  await page.click("#cuaderno-lista > li:nth-child(2) button:has-text('Borrar')");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.accion === "delete"), null, { timeout: 5000 }).catch(() => {});
  igual("borra por su id", await page.evaluate(() => window.__escrituras.find((e) => e.accion === "delete").filtros), [["id", "c1"]]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaProfe(browser) {
  console.log("\n=== El cuaderno de un alumno, visto por su profe ===");
  // Lo que la RLS le daría: solo lo compartido.
  const compartidas = FILAS.filter((f) => f.compartida && f.alumno_id === "u-ana");
  const { page, ctx, errores } = await abrir(browser, "/cuaderno.html?alumno=u-ana", "u-profe", compartidas);
  // ?alumno= exige un id de verdad; con uno que no lo parece, se queda en lo propio.
  await page.waitForTimeout(800);
  igual("un ?alumno= que no es un id no abre nada ajeno", await page.textContent("#cuaderno-titulo"), "Mi cuaderno 📓");
  await ctx.close();

  const ID = "00000000-0000-4000-8000-000000000001";
  const filas = compartidas.map((f) => Object.assign({}, f, { alumno_id: ID }));
  const r = await abrir(browser, "/cuaderno.html?alumno=" + ID, "u-profe", filas);
  await r.page.waitForSelector("#cuaderno-lista > li", { timeout: 10000 }).catch(() => {});
  const t = await tarjetas(r.page);
  igual("pinta lo que le compartió, sin editar ni borrar", t.map((x) => [x.titulo, x.botones]), [["Mate del pasillo", []]]);
  igual("ni agregar", await r.page.evaluate(() => document.getElementById("cuaderno-agregar").checkVisibility()), false);
  igual("pide lo de ESE alumno", await r.page.evaluate((id) => window.__consultas.filter((c) => c.tabla === "cuaderno").every((c) => c.filtros.some(([k, v]) => k === "alumno_id" && v === id)), ID), true);
  igual("sin errores en la página", r.errores.concat(errores), []);
  await r.ctx.close();
}

async function pruebaFinDeEjercicio(browser) {
  console.log("\n=== «Guardar en mi cuaderno» al terminar un ejercicio ===");
  const { page, ctx, errores } = await abrir(browser, "/entreno/temas.html?tema=pin", "u-ana", FILAS);
  await page.waitForFunction(() => window.EjercicioTablero && window.Cuaderno, null, { timeout: 15000 });
  await page.evaluate((fen) => {
    const caja = document.createElement("div");
    caja.id = "fin-prueba";
    document.body.appendChild(caja);
    window.EjercicioTablero.fin({ caja, desde: fen, jugadas: ["Ra8#"], origen: "Ejercicios por tema · Clavada" });
  }, PASILLO);
  igual("el final del ejercicio trae el botón", await page.evaluate(() => [...document.querySelectorAll("#fin-prueba button")].map((b) => b.textContent)),
    ["Siguiente ejercicio →", "Ver la línea", "📓 Guardar en mi cuaderno"]);
  await page.evaluate(() => { window.__respuestas.push({ nota: "Ahora sí lo veo" }); });
  await page.click("#fin-prueba [data-cuaderno]");
  await page.waitForFunction(() => (window.__campos || []).length, null, { timeout: 5000 }).catch(() => {});
  igual("esa posición ya estaba: se abre con lo que tenía, para cambiarla",
    await page.evaluate(() => { const c = window.__campos[0] || { valores: {} }; return [c.titulo, c.valores.titulo, c.valores.nota]; }),
    ["Esta posición ya está en tu cuaderno", "Mate del pasillo", "No vi que el rey\nno tenía salida"]);
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "cuaderno"), null, { timeout: 5000 }).catch(() => {});
  const e = await page.evaluate(() => window.__escrituras.find((x) => x.tabla === "cuaderno"));
  igual("cambia la suya por su id (no duplica ni toca la de otro alumno con la misma posición)", e && [e.accion, e.filtros, e.datos.nota, e.datos.origen, e.datos.enlace, e.datos.jugadas],
    ["update", [["id", "c1"]], "Ahora sí lo veo", "Ejercicios por tema · Clavada", "entreno/temas.html?tema=pin", ["Ra8#"]]);
  igual("buscó la suya con su id", await page.evaluate(() => window.__consultas.find((c) => c.tabla === "cuaderno").filtros), [["alumno_id", "u-ana"], ["fen", "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"]]);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaProfe(browser);
    await pruebaFinDeEjercicio(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl cuaderno guarda y muestra lo que debe.");
  process.exit(fallos ? 1 : 0);
})();
