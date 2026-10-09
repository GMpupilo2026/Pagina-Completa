#!/usr/bin/env node
/* cuestionarios.html: el profe arma sus cuestionarios fuera de la clase y
   mira los listos de la Academia, con un cliente de Supabase de mentira.

   Lo que se rompe callado acá:
   - que los listos no salgan agrupados por nivel, o que el filtro no filtre;
   - que uno listo se pueda editar en la página (la base lo rechaza, y el profe
     se entera al guardar), en vez de copiarlo a los suyos;
   - que la copia pierda el nivel o las preguntas;
   - que una posición inválida pegada como FEN entre al cuestionario: se vería
     bien acá y fallaría en la clase, delante de todos;
   - que un alumno vea algo más que el aviso de que no es para él.

   Lo que hace cumplir la BASE (que un listo no se cambie ni se borre, que el
   alumno no los lea) está comprobado aparte, impersonando roles en SQL.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-cuestionarios-pagina.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const { instalarAvisos } = require("./lib/avisos-prueba");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE = { id: "prof-1", role: "profesor", is_admin: false, full_name: "Sebastián", email: "s@x.cr" };
const ALUMNA = { id: "a-1", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" };

const P = (texto, opciones, correcta) => ({ texto, opciones, correcta, tiempo: 30, fen: null });
const LISTOS = [
  { id: "l-1", titulo: "El tablero", nivel: "inicial", listo: true, profesor_id: null, updated_at: "2026-09-30T10:00:00Z",
    preguntas: [P("¿Cuántas casillas tiene el tablero?", ["48", "64", "81"], 1), P("¿Quién mueve primero?", ["Las negras", "Las blancas"], 1)] },
  { id: "l-2", titulo: "Clavadas", nivel: "intermedio", listo: true, profesor_id: null, updated_at: "2026-09-30T10:00:00Z",
    preguntas: [P("¿Qué pieza no puede clavar?", ["La torre", "El caballo", "El alfil"], 1)] },
  { id: "l-3", titulo: "Finales de torre", nivel: "avanzado", listo: true, profesor_id: null, updated_at: "2026-09-30T10:00:00Z",
    preguntas: [P("¿Qué es la posición de Lucena?", ["Una defensa", "Un final ganado de torre"], 1)] },
  // Uno del taller de asesores: listo, de un material y SIN nivel.
  { id: "l-fa2", titulo: "Formación Ajedrez · Sesión 2: reglas de competición", nivel: null, listo: true, material: "formacion-ajedrez",
    profesor_id: null, updated_at: "2026-10-09T10:00:00Z", preguntas: [P("¿Cuál es la sanción más leve?", ["La advertencia", "Perder"], 0)] },
];
const MIO = { id: "m-1", titulo: "Repaso del lunes", nivel: null, listo: false, profesor_id: "prof-1", updated_at: "2026-09-30T12:00:00Z",
  preguntas: [P("¿Qué vale más?", ["La torre", "El alfil"], 0)] };

function clienteFalso(tablas, usuarioId) {
  return `
window.__escrituras = [];
(function () {
  const TABLAS = ${JSON.stringify(tablas)};
  window.__tablas = TABLAS;
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
        pendiente = Object.assign({ id: "nuevo-" + contador, created_at: new Date().toISOString(), listo: false }, fila);
        filas.push(pendiente);
        return b;
      },
      // El filtro se apunta al RESOLVER: .update(x).eq("id", y) encadena.
      update(campos) { pendiente = { __update: campos }; return b; },
      delete() { window.__escrituras.push({ tabla: etiqueta, accion: "delete" }); pendiente = { __delete: true }; return b; },
      then(res, rej) {
        if (pendiente && pendiente.__update) {
          window.__escrituras.push({ tabla: etiqueta, accion: "update", fila: pendiente.__update, donde: condiciones.slice() });
          const f = filas.find((x) => condiciones.every(([c, v]) => String(x[c]) === String(v)));
          if (f) Object.assign(f, pendiente.__update);
          return Promise.resolve({ data: f || null, error: null }).then(res, rej);
        }
        if (pendiente && pendiente.__delete) {
          window.__escrituras[window.__escrituras.length - 1].donde = condiciones.slice();
          const i = filas.findIndex((x) => condiciones.every(([c, v]) => String(x[c]) === String(v)));
          if (i >= 0) filas.splice(i, 1);
          return Promise.resolve({ data: null, error: null }).then(res, rej);
        }
        if (pendiente) return Promise.resolve({ data: pendiente, error: null }).then(res, rej);
        let d = filas.filter((f) => condiciones.every(([c, v]) => String(f[c]) === String(v)));
        if (unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t) => constructor(TABLAS[t] !== undefined ? TABLAS[t] : (TABLAS[t] = []), t),
    rpc: (n) => constructor([], "rpc:" + n),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() {}, presenceState() { return {}; } }),
    removeChannel() {},
  };
})();
`;
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}
const seVe = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!(el && el.checkVisibility()); }, sel);
const copia = (x) => JSON.parse(JSON.stringify(x));

async function abrir(browser, ruta, tablas, usuarioId) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await instalarAvisos(page);
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(tablas, usuarioId) }));
  await page.goto(BASE + ruta, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  return { page, ctx, errores };
}

const tablasProfe = () => ({ profiles: [PROFE, ALUMNA], cuestionarios: copia(LISTOS).concat(copia(MIO)) });

async function pruebaListas(browser) {
  console.log("\n=== Las listas: los tuyos y los listos, por nivel ===");
  const { page, ctx, errores } = await abrir(browser, "/cuestionarios.html", tablasProfe(), "prof-1");
  await page.waitForSelector("#lista-listos h3", { timeout: 10000 });
  igual("tus cuestionarios", await page.evaluate(() => [...document.querySelectorAll("#lista-mios button span:first-child")].map((s) => s.textContent)), ["Repaso del lunes"]);
  igual("los listos, agrupados por nivel (y los de asesores, que no tienen) y con cuántos hay", await page.evaluate(() => [...document.querySelectorAll("#lista-listos h3")].map((h) => h.textContent)),
    ["🟢 Inicial (1)", "🟡 Intermedio (1)", "🔴 Avanzado (1)", "⚖️ Asesores (1)"]);
  igual("cada uno dice su nivel y cuántas preguntas trae, escrito", await page.evaluate(() => document.querySelector('#lista-listos button[data-cuestionario="l-1"] span:last-child').textContent),
    "Inicial · 2 preguntas");
  await page.getByRole("button", { name: "🟡 Intermedio" }).click();
  igual("el filtro deja solo ese nivel, y lo dice con aria-pressed", [await page.evaluate(() => [...document.querySelectorAll("#lista-listos h3")].map((h) => h.textContent)),
    await page.getByRole("button", { name: "🟡 Intermedio" }).getAttribute("aria-pressed")], [["🟡 Intermedio (1)"], "true"]);
  await page.getByRole("button", { name: "Todos" }).click();

  console.log("\n=== Uno listo: se mira, se juega o se copia ===");
  await page.click('#lista-listos button[data-cuestionario="l-1"]');
  igual("se ve el listo y no el armador", [await seVe(page, "#cuestionario-listo"), await seVe(page, "#cuestionario-editor")], [true, false]);
  igual("lleva a jugarlo en la clase en vivo", await page.getByRole("link", { name: "▶️ Jugarlo en la clase en vivo" }).first().getAttribute("href"), "sesion.html?cuestionario=l-1");
  await page.click("#cuestionario-listo summary");
  igual("las respuestas, con la correcta ESCRITA (no solo un color)", await page.evaluate(() => [...document.querySelectorAll("#cuestionario-listo ol > li:first-child li")].map((l) => l.textContent)),
    ["A. 48", "B. 64 ✓ (la correcta)", "C. 81"]);
  igual("queda marcado en la lista", await page.getAttribute('#lista-listos button[data-cuestionario="l-1"]', "aria-current"), "true");
  await page.getByRole("button", { name: "📋 Copiarlo a mis cuestionarios" }).click();
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "cuestionarios" && e.accion === "insert"), null, { timeout: 5000 });
  const copiado = await page.evaluate(() => window.__escrituras.find((e) => e.accion === "insert").fila);
  igual("la copia es tuya, con el mismo nivel y las mismas preguntas", [copiado.profesor_id, copiado.titulo, copiado.nivel, copiado.preguntas.map((p) => [p.texto, p.opciones, p.correcta])],
    ["prof-1", "El tablero (copia)", "inicial", LISTOS[0].preguntas.map((p) => [p.texto, p.opciones, p.correcta])]);
  await page.waitForFunction(() => document.querySelectorAll("#lista-mios li").length === 2, null, { timeout: 5000 });
  igual("y ya se edita, en el armador", [await seVe(page, "#cuestionario-editor"), await seVe(page, "#cuestionario-listo"), await page.inputValue("#cuestionario-titulo")],
    [true, false, "El tablero (copia)"]);
  igual("ningún listo se tocó", await page.evaluate(() => window.__escrituras.filter((e) => e.accion !== "insert").length), 0);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

async function pruebaNuevo(browser) {
  console.log("\n=== Uno nuevo, con nivel y posición pegada como FEN ===");
  const { page, ctx, errores } = await abrir(browser, "/cuestionarios.html", tablasProfe(), "prof-1");
  await page.waitForSelector("#lista-listos h3", { timeout: 10000 });
  await page.click("#cuestionario-nuevo-btn");
  await page.fill("#cuestionario-titulo", "Oposición");
  await page.selectOption("#cuestionario-nivel", "intermedio");
  await page.getByLabel("Pregunta 1: lo que se pregunta").fill("¿Quién tiene la oposición?");
  await page.getByLabel("Pregunta 1: opción A", { exact: true }).fill("Las blancas");
  await page.getByLabel("Pregunta 1: opción B", { exact: true }).fill("Las negras");
  await page.getByLabel("Pregunta 1: la opción A es la correcta").check();
  // Primero una posición rota (dos reyes blancos): no entra, y lo dice.
  await page.evaluate(() => { window.__respuestas.push("8/8/8/8/8/8/8/KK6 w - - 0 1"); });
  await page.getByRole("button", { name: "Pregunta 1: Poner una posición (FEN)" }).click();
  await page.waitForFunction(() => document.getElementById("cuestionario-aviso").textContent.length > 0, null, { timeout: 5000 });
  igual("una posición inválida no entra", await page.evaluate(() => cuestionarioEditado.preguntas[0].fen), null);
  // La oposición, legal.
  const FEN = "8/8/4k3/8/4K3/4P3/8/8 w - - 0 1";
  await page.evaluate((f) => { window.__respuestas.push(f); }, FEN);
  await page.getByRole("button", { name: "Pregunta 1: Poner una posición (FEN)" }).click();
  await page.waitForFunction(() => document.getElementById("cuestionario-aviso").textContent === "La pregunta 1 ya lleva su posición.", null, { timeout: 5000 });
  await page.click("#cuestionario-guardar-btn");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.accion === "insert"), null, { timeout: 5000 });
  const fila = await page.evaluate(() => window.__escrituras.find((e) => e.accion === "insert").fila);
  igual("se guarda con su nivel y su posición", [fila.titulo, fila.nivel, fila.preguntas[0].fen, fila.preguntas[0].opciones, fila.preguntas[0].correcta],
    ["Oposición", "intermedio", FEN, ["Las blancas", "Las negras"], 0]);
  await page.waitForFunction(() => !document.getElementById("cuestionario-jugar-enlace").hidden, null, { timeout: 5000 });
  igual("guardado, ya se puede jugar en la clase", await page.getAttribute("#cuestionario-jugar-enlace", "href"), "sesion.html?cuestionario=nuevo-1");
  igual("sin errores en consola", errores, []);
  await ctx.close();

  console.log("\n=== cuestionarios.html?id= abre ese ===");
  const b = await abrir(browser, "/cuestionarios.html?id=m-1", tablasProfe(), "prof-1");
  await b.page.waitForFunction(() => document.getElementById("cuestionario-editor").checkVisibility(), null, { timeout: 10000 });
  igual("abre el pedido en el armador", await b.page.inputValue("#cuestionario-titulo"), "Repaso del lunes");
  igual("sin errores en consola", b.errores, []);
  await b.ctx.close();
}

async function pruebaAlumno(browser) {
  console.log("\n=== Un alumno ===");
  const { page, ctx, errores } = await abrir(browser, "/cuestionarios.html", { profiles: [PROFE, ALUMNA], cuestionarios: [] }, "a-1");
  await page.waitForSelector("#sin-permiso:not(.hidden)", { timeout: 10000 });
  igual("ve que no es para él, y nada más", [await seVe(page, "#sin-permiso"), await seVe(page, "#cuerpo")], [true, false]);
  igual("sin errores en consola", errores, []);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaListas(browser);
    await pruebaNuevo(browser);
    await pruebaAlumno(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: cuestionarios.html.");
  process.exit(fallos ? 1 : 0);
})();
