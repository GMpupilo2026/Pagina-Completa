#!/usr/bin/env node
/* El cuestionario como tarea, con un cliente de Supabase de mentira: el profe
   lo manda desde Tareas, el alumno lo contesta en cuestionario-tarea.html y el
   profe ve cuánto sacó.

   Lo que se rompe callado acá:
   - que el renglón se mande sin el cuestionario (con «— todo —» no hay nada
     que contestar), con otra actividad o pidiendo más de una vez;
   - que el enlace del alumno no lleve el renglón (&item=): la base no lo deja
     entrar y la página solo dice que no es de sus tareas;
   - que la página mande algo que no sea una respuesta por pregunta, en orden,
     con null en las que quedaron en blanco;
   - que al entregar no diga, ESCRITO, cuál era la correcta de las falladas;
   - que el profe vea «2/1» en vez de cuánto acertó la primera vez;
   - que un cuestionario de cuestionarios.html no lleve a mandarlo como tarea.

   Lo que hace cumplir la BASE (que el alumno no lea la correcta antes de
   entregar, que nadie escriba un intento a mano, que otro profe no lo vea,
   que un id de un cuestionario ajeno no se abra) está comprobado aparte,
   impersonando roles en SQL: ver «El cuestionario como tarea» en
   docs/decisiones/seguimiento-del-alumno.md.

   Con el sitio en localhost:8777 y playwright:
       node herramientas/verificar-cuestionario-tarea.js
*/
const { chromium } = require("./lib/playwright-con-sesion");
const { instalarAvisos } = require("./lib/avisos-prueba");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE = { id: "prof-1", role: "profesor", is_admin: false, full_name: "Sebastián", email: "s@x.cr" };
const ALUMNA = { id: "a-1", role: "alumno", is_admin: false, full_name: "Ana Rojas", email: "ana@x.cr" };

const FEN = "8/8/4k3/8/4K3/4P3/8/8 w - - 0 1";
const P = (texto, opciones, correcta, fen) => ({ texto, opciones, correcta, tiempo: 30, fen: fen || null });
const LISTOS = [
  { id: "l-1", titulo: "El tablero", nivel: "inicial", listo: true, profesor_id: null, updated_at: "2026-09-30T10:00:00Z",
    preguntas: [P("¿Cuántas casillas tiene el tablero?", ["48", "64", "81"], 1), P("¿Quién tiene la oposición?", ["Las negras", "Las blancas"], 1, FEN)] },
  { id: "l-2", titulo: "Clavadas", nivel: "intermedio", listo: true, profesor_id: null, updated_at: "2026-09-30T10:00:00Z",
    preguntas: [P("¿Qué pieza no puede clavar?", ["La torre", "El caballo", "El alfil"], 1)] },
];
const MIO = { id: "m-1", titulo: "Repaso del lunes", nivel: null, listo: false, profesor_id: "prof-1", updated_at: "2026-09-30T12:00:00Z",
  preguntas: [P("¿Qué vale más?", ["La torre", "El alfil"], 0)] };

const VENCE = new Date(Date.now() + 3 * 864e5).toISOString();
const renglon = (id, clave, label, cuestionario) => ({
  id, orden: 0, material_tipo: "herramienta", material_slug: "cuestionario", material_label: "Cuestionario",
  material_href: "cuestionario-tarea.html?c=" + clave, filtro_clave: clave, filtro_label: label, leccion: null,
  meta_tipo: "cantidad", meta_cantidad: 1, hecho: cuestionario ? cuestionario.intentos : 0, cumplido: !!cuestionario, cuestionario,
});
// Lo que devuelve tareas_con_avance(): una contestada dos veces y una sin contestar.
const TAREAS = [
  { id: "t-1", profesor_id: "prof-1", profesor_nombre: "Sebastián", alumno_id: "a-1", alumno_nombre: "Ana Rojas",
    titulo: "El tablero", instrucciones: "", vence_at: VENCE, disponible_desde: "2026-09-30T00:00:00Z",
    created_at: "2026-09-30T00:00:00Z", renglones: 1, cumplidos: 1, situacion: "completada",
    items: [renglon("it-1", "l-1", "El tablero", { intentos: 2, total: 2, primero: 1, mejor: 2 })] },
  { id: "t-2", profesor_id: "prof-1", profesor_nombre: "Sebastián", alumno_id: "a-1", alumno_nombre: "Ana Rojas",
    titulo: "Clavadas", instrucciones: "", vence_at: VENCE, disponible_desde: "2026-09-30T00:00:00Z",
    created_at: "2026-09-30T00:00:00Z", renglones: 1, cumplidos: 0, situacion: "pendiente",
    items: [renglon("it-2", "l-2", "Clavadas", null)] },
];

function clienteFalso(datos) {
  return `
window.__llamadas = [];
(function () {
  const D = ${JSON.stringify(datos)};
  window.__datos = D;
  function constructor(nombre) {
    const filas = D.tablas[nombre] || (D.tablas[nombre] = []);
    const cond = [];
    let unica = false;
    const b = {
      select() { return b; }, order() { return b; }, in() { return b; }, or() { return b; },
      is() { return b; }, limit() { return b; }, range() { return b; }, neq() { return b; }, gte() { return b; },
      eq(col, val) { cond.push([col, val]); return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      // El filtro se aplica en el RESOLVER: .eq() puede venir después de .select().
      then(res, rej) {
        let d = filas.filter((f) => cond.every(([c, v]) => String(f[c]) === String(v)));
        if (unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  const ok = (data) => Promise.resolve({ data, error: null });
  const mal = (message) => Promise.resolve({ data: null, error: { message } });
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: D.yo }, access_token: "t" } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: (t) => constructor(t),
    rpc(n, args) {
      window.__llamadas.push({ rpc: n, args });
      if (n === "tareas_con_avance") {
        let d = D.tareas.slice();
        if (args && args.p_alumno) d = d.filter((t) => t.alumno_id === args.p_alumno);
        if (args && args.p_profesor) d = d.filter((t) => t.profesor_id === args.p_profesor);
        return ok(d);
      }
      if (n === "crear_tarea") return ok((args.p_alumnos || []).length);
      // Como la base: las preguntas SIN la correcta, y solo del renglón propio.
      const item = args && D.renglones[args.p_item];
      if (n === "cuestionario_de_tarea") {
        if (!item) return mal("Este cuestionario no está en ninguna de tus tareas.");
        return ok({ titulo: item.titulo, preguntas: item.preguntas.map((p) => ({ texto: p.texto, opciones: p.opciones, fen: p.fen })) });
      }
      if (n === "contestar_cuestionario_de_tarea") {
        if (!item) return mal("Este cuestionario no está en ninguna de tus tareas.");
        const r = args.p_respuestas;
        if (!Array.isArray(r) || r.length !== item.preguntas.length) return mal("Las respuestas no coinciden con las preguntas.");
        const correctas = item.preguntas.map((p) => p.correcta);
        const aciertos = r.filter((x, i) => x !== null && x === correctas[i]).length;
        const intentos = (D.tablas.cuestionario_intentos || (D.tablas.cuestionario_intentos = []));
        intentos.push({ tarea_item_id: args.p_item, aciertos, total: r.length, created_at: new Date().toISOString() });
        return ok({ aciertos, total: r.length, intento: intentos.filter((x) => x.tarea_item_id === args.p_item).length, correctas });
      }
      return ok(null);
    },
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

async function abrir(browser, ruta, datos, esperar) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await instalarAvisos(page);
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos) }));
  await page.goto(BASE + ruta, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(esperar || "#app:not(.hidden)", { timeout: 20000 });
  return { page, ctx, errores };
}

const datosDe = (yo) => ({
  yo,
  tablas: { profiles: [PROFE, ALUMNA], cuestionarios: copia(LISTOS).concat(copia(MIO)), cuestionario_intentos: [] },
  tareas: copia(TAREAS),
  renglones: { "it-1": { titulo: "El tablero", preguntas: copia(LISTOS[0].preguntas) } },
});

async function pruebaProfe(browser) {
  console.log("\n=== El profe lo manda desde Tareas ===");
  const { page, ctx, errores } = await abrir(browser, "/tareas.html", datosDe("prof-1"), "#vista-profesor:not(.hidden)");
  const div = page.locator("#renglones .renglon").first();
  await div.locator(".r-material").selectOption("herramienta:cuestionario");
  await page.waitForFunction(() => document.querySelector("#renglones .r-recorte").options.length > 0, null, { timeout: 5000 });
  igual("los cuestionarios: los tuyos primero y los listos por nivel, sin «— todo —»", await page.evaluate(() =>
    [...document.querySelectorAll("#renglones .r-recorte optgroup")].map((g) => [g.label, [...g.children].map((o) => o.textContent)])),
    [["Tus cuestionarios", ["Repaso del lunes (1 pregunta)"]], ["Listos de la Academia · Inicial", ["El tablero (2 preguntas)"]],
     ["Listos de la Academia · Intermedio", ["Clavadas (1 pregunta)"]]]);
  await div.locator(".r-recorte").selectOption("l-1");
  await div.locator(".r-recorte").dispatchEvent("change");
  igual("se pide una vez: sin cantidad que elegir, y la frase dice cuál",
    [await div.locator(".r-cantidad-wrap").isVisible(), await div.locator(".r-frase").textContent()],
    [false, "Contestar el cuestionario «El tablero»"]);
  await page.check('.alumno-check[value="a-1"]');
  await page.fill("#t-vence", "2026-12-31T18:00");
  await page.click("#enviar-btn");
  await page.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "crear_tarea"), null, { timeout: 5000 });
  const it = await page.evaluate(() => window.__llamadas.find((l) => l.rpc === "crear_tarea").args.p_items[0]);
  igual("el renglón que se manda", [it.material_slug, it.filtro_clave, it.filtro_label, it.material_href, it.actividades, it.meta_tipo, it.meta_cantidad],
    ["cuestionario", "l-1", "El tablero", "cuestionario-tarea.html?c=l-1", ["cuestionario"], "cantidad", 1]);

  console.log("\n=== Lo que ve en «Tareas enviadas» ===");
  const resumen = await page.evaluate(() => [...document.querySelectorAll("#enviadas-lista > div")].map((d) => d.querySelectorAll("p")[2].textContent.trim()));
  igual("cuánto acertó la primera vez (no «2/1»), y cuál no ha contestado", resumen,
    ["✔ «El tablero»: 1 de 2 la primera vez (lo hizo 2 veces; la mejor, 2 de 2)", "🎯 Todavía no contesta «Clavadas»"]);
  igual("sin errores en consola", errores, []);
  await ctx.close();

  console.log("\n=== Desde cuestionarios.html, con el renglón ya armado ===");
  const b = await abrir(browser, "/tareas.html?material=cuestionario&recorte=l-2", datosDe("prof-1"), "#vista-profesor:not(.hidden)");
  await b.page.waitForFunction(() => document.querySelector("#renglones .r-recorte").value === "l-2", null, { timeout: 5000 });
  igual("viene elegido el cuestionario", await b.page.locator("#renglones .r-frase").first().textContent(), "Contestar el cuestionario «Clavadas»");
  // Sin ninguno elegido no se manda (el profe que no tiene ninguno a la vista).
  const sinNinguno = datosDe("prof-1"); sinNinguno.tablas.cuestionarios = [];
  const c = await abrir(browser, "/tareas.html", sinNinguno, "#vista-profesor:not(.hidden)");
  await c.page.locator("#renglones .r-material").first().selectOption("herramienta:cuestionario");
  await c.page.waitForFunction(() => document.querySelector("#renglones .r-sin-recortes").checkVisibility(), null, { timeout: 5000 });
  await c.page.check('.alumno-check[value="a-1"]');
  await c.page.fill("#t-vence", "2026-12-31T18:00");
  await c.page.click("#enviar-btn");
  igual("sin cuestionarios dice dónde se arman, y no manda nada",
    [await seVe(c.page, "#renglones .r-sin-recortes"), await c.page.textContent("#form-status"),
     await c.page.evaluate(() => window.__llamadas.some((l) => l.rpc === "crear_tarea"))],
    [true, "Elige qué cuestionario mandar.", false]);
  igual("sin errores en consola", b.errores.concat(c.errores), []);
  await b.ctx.close(); await c.ctx.close();

  console.log("\n=== cuestionarios.html lleva a mandarlo como tarea ===");
  const d = await abrir(browser, "/cuestionarios.html", datosDe("prof-1"));
  await d.page.waitForSelector("#lista-listos h3", { timeout: 10000 });
  await d.page.click('#lista-listos button[data-cuestionario="l-1"]');
  igual("uno listo", await d.page.getByRole("link", { name: "📨 Mandarlo como tarea" }).first().getAttribute("href"), "tareas.html?material=cuestionario&recorte=l-1");
  await d.page.click('#lista-mios button[data-cuestionario="m-1"]');
  igual("uno tuyo, ya guardado", [await seVe(d.page, "#cuestionario-tarea-enlace"), await d.page.getAttribute("#cuestionario-tarea-enlace", "href")],
    [true, "tareas.html?material=cuestionario&recorte=m-1"]);
  igual("sin errores en consola", d.errores, []);
  await d.ctx.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== La alumna en Tareas ===");
  const { page, ctx, errores } = await abrir(browser, "/tareas.html", datosDe("a-1"), "#vista-alumno:not(.hidden)");
  await page.waitForSelector("#completadas-lista li", { state: "attached", timeout: 5000 });
  const hecha = await page.evaluate(() => {
    const li = document.querySelector("#completadas-lista li");
    return [li.querySelector("span").textContent, li.querySelector("a").getAttribute("href"), li.querySelector("[aria-hidden=true].tabular-nums, .tabular-nums [aria-hidden=true]").textContent];
  });
  igual("contestado dos veces: dice cuánto acertó, lleva al renglón y cuenta 1/1, no 2/1", hecha,
    ["✔ Contestar el cuestionario «El tablero» · acertaste 1 de 2", "cuestionario-tarea.html?c=l-1&tarea=t-1&item=it-1", "1/1"]);
  igual("el pendiente también lleva su renglón", await page.evaluate(() => document.querySelector("#pendientes-lista a").getAttribute("href")),
    "cuestionario-tarea.html?c=l-2&tarea=t-2&item=it-2");
  igual("sin errores en consola", errores, []);
  await ctx.close();

  console.log("\n=== La alumna lo contesta ===");
  const a = await abrir(browser, "/cuestionario-tarea.html?c=l-1&tarea=t-1&item=it-1", datosDe("a-1"));
  const p = a.page;
  await p.waitForSelector("#cq-preguntas li", { timeout: 10000 });
  igual("el título y cuántas preguntas", [await p.textContent("#cq-titulo"), (await p.textContent("#cq-sub")).split(".")[0]], ["🎯 El tablero", "2 preguntas"]);
  /* Cada alumno las ve en su propio orden (ver «Cada alumno, su orden» más
     abajo), así que acá se mira cada pregunta por lo que es, no por su lugar:
     la numeración sí va 1, 2… en el orden en que se ven. */
  igual("las preguntas, cada una con su enunciado escrito y numeradas en orden", await p.evaluate(() => {
    const ls = [...document.querySelectorAll("#cq-preguntas legend")].map((l) => l.textContent);
    return [ls.map((t) => t.split(":")[0]), ls.map((t) => t.slice(t.indexOf(":") + 2)).sort()];
  }), [["Pregunta 1 de 2", "Pregunta 2 de 2"], ["¿Cuántas casillas tiene el tablero?", "¿Quién tiene la oposición?"]]);
  igual("solo la que trae posición lleva tablero, y se ve", await p.evaluate(() => [...document.querySelectorAll("#cq-preguntas li")]
    .sort((a, b) => a.dataset.pregunta - b.dataset.pregunta).map((li) => {
      const t = li.querySelector(".grid-cols-8"); return t ? [t.children.length, t.checkVisibility()] : null; })), [null, [64, true]]);
  igual("ninguna opción viene marcada, y dice cuántas faltan", [await p.evaluate(() => document.querySelectorAll("#cq-preguntas input:checked").length), await p.textContent("#cq-faltan")],
    [0, "Te faltan 2 preguntas de 2."]);
  await p.getByLabel(/^[A-D]\. 64$/).check();
  igual("contar las que faltan", await p.textContent("#cq-faltan"), "Te falta 1 pregunta de 2.");
  await p.click("#cq-entregar");
  await p.waitForFunction(() => window.__llamadas.some((l) => l.rpc === "contestar_cuestionario_de_tarea"), null, { timeout: 5000 });
  igual("con una en blanco, antes pregunta", await p.evaluate(() => window.__avisos.some((x) => x.includes("Te falta 1 pregunta sin contestar") && x.includes("Entregar así"))), true);
  igual("manda una respuesta por pregunta, null en la que quedó en blanco", await p.evaluate(() =>
    window.__llamadas.find((l) => l.rpc === "contestar_cuestionario_de_tarea").args), { p_item: "it-1", p_respuestas: [1, null] });
  await p.waitForFunction(() => document.getElementById("cq-resultado").checkVisibility(), null, { timeout: 5000 });
  igual("el resultado, con el foco ahí", [await p.textContent("#cq-resultado-titulo"), await p.evaluate(() => document.activeElement.id)],
    ["Acertaste 1 de 2", "cq-resultado-titulo"]);
  // «Las negras / Las blancas» son dos opciones: esas no se barajan, la B es la B.
  igual("cada pregunta dice, escrito, si estuvo bien y cuál era la correcta", await p.evaluate(() => [...document.querySelectorAll("#cq-preguntas li")]
    .sort((a, b) => a.dataset.pregunta - b.dataset.pregunta).map((li) => { const m = li.querySelector(".cq-marca"); return m.checkVisibility() && m.textContent; })),
    ["✓ Bien.", "Sin contestar. La correcta era: B. Las blancas"]);
  igual("ya no se puede cambiar lo entregado, y la barra de entregar no queda vacía flotando", [await p.evaluate(() => [...document.querySelectorAll("#cq-preguntas input")].every((i) => i.disabled)), await seVe(p, "#cq-barra")],
    [true, false]);
  igual("dice que ya lo contestó y que el profe ve la primera", await p.textContent("#cq-antes"),
    "Ya lo contestaste una vez: la primera acertaste 1 de 2. Tu profe ve la primera y la mejor. Puedes contestarlo otra vez para practicar.");
  await p.click("#cq-otra-vez");
  igual("otra vez: en blanco y se puede entregar", [await p.evaluate(() => document.querySelectorAll("#cq-preguntas input:checked, #cq-preguntas input:disabled").length),
    await seVe(p, "#cq-entregar"), await seVe(p, "#cq-resultado")], [0, true, false]);
  igual("sin errores en consola", a.errores, []);
  await a.ctx.close();

  console.log("\n=== Un renglón que no es suyo ===");
  const b = await abrir(browser, "/cuestionario-tarea.html?c=l-1&tarea=t-9&item=otro", datosDe("a-1"));
  await b.page.waitForFunction(() => document.getElementById("cq-error").checkVisibility(), null, { timeout: 5000 });
  igual("lo dice, y no muestra preguntas", [await b.page.textContent("#cq-error-texto"), await seVe(b.page, "#cq-form")],
    ["Este cuestionario no está en ninguna de tus tareas.", false]);
  igual("sin errores en consola", b.errores, []);
  await b.ctx.close();
}

/* ---------- Cada alumno, su orden ----------
   Ocho preguntas de cuatro opciones: dos alumnas las ven en otro orden, y la
   que vuelve a contestarlo también. Lo que NO puede cambiar es lo que llega a
   la base: contestando todo bien por el TEXTO de la opción, se tienen que
   mandar los números originales, en el orden original. Si el orden visto se
   colara en lo mandado, la página se vería perfecta y calificaría mal. Y una
   opción «Todas las anteriores» se queda donde estaba. */
const OCHO = Array.from({ length: 8 }, (_, i) => P(`Pregunta número ${i + 1}`,
  i === 7 ? ["Uno", "Dos", "Tres", "Todas las anteriores"] : [`${i}-a`, `${i}-b`, `${i}-c`, `${i}-d`], (i * 3) % 4));
const datosOcho = (yo) => {
  const d = datosDe(yo);
  d.renglones["it-8"] = { titulo: "Ocho", preguntas: copia(OCHO) };
  return d;
};

async function vistaDe(browser, yo) {
  const a = await abrir(browser, "/cuestionario-tarea.html?c=l-8&tarea=t-8&item=it-8", datosOcho(yo));
  await a.page.waitForSelector("#cq-preguntas li", { timeout: 10000 });
  const vista = () => a.page.evaluate(() => [...document.querySelectorAll("#cq-preguntas li")].map((li) =>
    li.dataset.pregunta + ":" + [...li.querySelectorAll("label span")].map((s) => s.textContent.slice(3)).join("|")).join(" / "));
  return { a, vista };
}

async function pruebaOrden(browser) {
  console.log("\n=== Cada alumno, su orden ===");
  const ana = await vistaDe(browser, "a-1");
  const luis = await vistaDe(browser, "a-2");
  const deAna = await ana.vista();
  igual("dos alumnas ven el mismo cuestionario en distinto orden", deAna !== await luis.vista(), true);
  igual("la opción «Todas las anteriores» queda última", await ana.a.page.evaluate(() =>
    [...document.querySelector('#cq-preguntas li[data-pregunta="7"]').querySelectorAll("label span")].map((s) => s.textContent)),
    ["A. Uno", "B. Dos", "C. Tres", "D. Todas las anteriores"]);
  // Contesta todo bien eligiendo por el TEXTO de la correcta.
  for (let i = 0; i < 8; i++) {
    const q = OCHO[i];
    await ana.a.page.locator(`#cq-preguntas li[data-pregunta="${i}"] label`).filter({ hasText: q.opciones[q.correcta] }).first().click();
  }
  await ana.a.page.click("#cq-entregar");
  await ana.a.page.waitForFunction(() => document.getElementById("cq-resultado").checkVisibility(), null, { timeout: 5000 });
  igual("a la base llegan los números ORIGINALES, en el orden original", await ana.a.page.evaluate(() =>
    window.__llamadas.find((l) => l.rpc === "contestar_cuestionario_de_tarea").args.p_respuestas), OCHO.map((q) => q.correcta));
  igual("y la base lo califica todo bien", await ana.a.page.textContent("#cq-resultado-titulo"), "Acertaste 8 de 8");
  await ana.a.page.click("#cq-otra-vez");
  igual("al contestarlo otra vez, cambia el orden", (await ana.vista()) !== deAna, true);
  igual("sin errores en consola", ana.a.errores.concat(luis.a.errores), []);
  await ana.a.ctx.close(); await luis.a.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfe(browser);
    await pruebaAlumna(browser);
    await pruebaOrden(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s).` : "\nTodo bien: el cuestionario como tarea.");
  process.exit(fallos ? 1 : 0);
})();
