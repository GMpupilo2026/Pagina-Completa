#!/usr/bin/env node
/* El tablero por academia, comprobado en un navegador de verdad con un cliente
   de Supabase de mentira.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - un tablero pedido con otro mes enseña cifras que parecen del mes elegido;
 *  - colones y dólares sumados en una sola cifra dan un número que no
 *    significa nada y se ve perfecto;
 *  - una columna de IA pintada a un supervisor le enseña lo que se decidió
 *    que solo vea quien administra (la base se la manda en null, pero el
 *    encabezado y un «US$0.00» dirían que existe);
 *  - «0 de 0» del horario se lee como un mes sin trabajo;
 *  - y una tabla que no se pudo leer se ve igual que una vacía.
 *
 * Lo que hace cumplir la BASE (el supervisor ve SOLO su academia y sin IA, un
 * profesor, una llamada sin usuario y `anon` no entran) se comprobó
 * impersonando roles en SQL: acá el cliente es de mentira.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-tablero-academias.js
 */
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const ADMIN = { id: "ad-1", role: "admin", is_admin: true, es_supervisor: false };
const SUP = { id: "s-1", role: "profesor", is_admin: false, es_supervisor: true };
const SUP_SIN = { id: "s-2", role: "profesor", is_admin: false, es_supervisor: true };
const PROFE = { id: "p-1", role: "profesor", is_admin: false, es_supervisor: false };

const XSS = '<img src=x onerror="window.__xss=1">SJ';
const FILA_A = {
  academia_id: "ac-1", nombre: "ADAPZ", color: "#1d4ed8", supervisor: "Karina Rojas",
  profesores: 2, alumnos: 53, alumnos_activos: 17, clases_en_linea: 2, clases_presenciales: 1, minutos_clase: 150,
  clases_programadas: 8, clases_programadas_dadas: 7, informes_enviados: 0, informes_pendientes: 2,
  ia_gasto_usd: 0.42, ia_tope_usd: 5, ia_modelo: "claude-haiku-4-5",
  cobros_pendientes: [{ moneda: "CRC", cobros: 2, vencidos: 2, saldo: 21000 }, { moneda: "USD", cobros: 1, vencidos: 0, saldo: 40 }],
};
const FILA_B = {
  academia_id: "ac-2", nombre: XSS, color: "javascript:alert(1)", supervisor: "Oscar Angulo",
  profesores: 2, alumnos: 50, alumnos_activos: 36, clases_en_linea: 7, clases_presenciales: 0, minutos_clase: 257,
  clases_programadas: 0, clases_programadas_dadas: 0, informes_enviados: 2, informes_pendientes: 0,
  ia_gasto_usd: 0, ia_tope_usd: null, ia_modelo: null,
  cobros_pendientes: [{ moneda: "CRC", cobros: 1, vencidos: 0, saldo: 7000 }],
};
// Lo que la base le manda al supervisor: su academia y la IA en null.
const FILA_SUP = Object.assign({}, FILA_A, { ia_gasto_usd: null, ia_tope_usd: null, ia_modelo: null });

function clienteFalso(datos, yo) {
  return `
window.__rpc = [];
(function () {
  const D = ${JSON.stringify(datos)};
  const YO = ${JSON.stringify(yo)};
  function tabla(nombre) {
    let cond = [], unica = false, cuenta = false;
    const b = {
      select(c, o) { if (o && o.count) cuenta = true; return b; },
      eq(c, v) { cond.push([c, v]); return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) {
        let d = nombre === "profiles" ? [YO] : (D.tablas[nombre] || []);
        cond.forEach(([c, v]) => { d = d.filter((f) => f[c] === v); });
        const r = cuenta ? { data: null, count: d.length, error: null }
                         : { data: unica ? (d[0] || null) : d, error: null };
        return Promise.resolve(r).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: YO.id }, access_token: "t" } } }) },
    from: tabla,
    rpc(n, args) {
      window.__rpc.push({ n: n, args: args || null });
      if (D.error) return Promise.resolve({ data: null, error: { message: D.error } });
      return Promise.resolve({ data: D.rpc[n] !== undefined ? D.rpc[n] : [], error: null });
    },
  };
})();`;
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function abrir(browser, datos, yo, esperar, opciones) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: "block" }, opciones || {}));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, yo) }));
  await page.goto(BASE + "/tablero-academias.html", { waitUntil: "networkidle" });
  await page.waitForSelector(esperar || "#app:not(.hidden)", { timeout: 15000 });
  return { page, ctx, errores };
}

const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? (el.checkVisibility() ? "sí" : "no") : "no existe";
}, sel);
const celdaTexto = (page, fila, col) => page.evaluate(([f, c]) => {
  const td = document.querySelector('#tabla tr[data-academia="' + f + '"] [data-col="' + c + '"]');
  return td ? [...td.children].map((s) => s.textContent).join(" | ") : "(no está)";
}, [fila, col]);
const pieTexto = (page, col) => page.evaluate((c) => {
  const td = document.querySelector('#tabla tr[data-total] [data-col="' + c + '"]');
  return td ? [...td.children].map((s) => s.textContent).join(" | ") : "(no está)";
}, col);
const llamadas = (page) => page.evaluate(() => window.__rpc.filter((r) => r.n === "tablero_academias"));

async function pruebaAdmin(browser) {
  console.log("\nQuien administra: todas las academias, con la IA");
  const { page, ctx, errores } = await abrir(browser, { tablas: {}, rpc: { tablero_academias: [FILA_A, FILA_B] } }, ADMIN, "#tabla-caja:not([hidden])");
  const mes = await page.evaluate(() => ActividadProfesor.mesPorOmision());
  igual("se pide el tablero del mes que muestra el selector", [await page.$eval("#mes", (s) => s.value), (await llamadas(page))[0].args], [mes, { p_periodo: mes }]);
  igual("una fila por academia", await page.$$eval("#tabla tbody tr", (rs) => rs.length), 2);
  igual("los encabezados, con la columna de IA",
    await page.$$eval("#tabla thead th", (ths) => ths.map((t) => t.textContent)),
    ["Academia", "Clases del mes", "De su horario", "Alumnos", "Informes mensuales", "Mejorar informe (IA)", "Cobros pendientes"]);
  igual("las clases con sus horas, en línea y presenciales", await celdaTexto(page, "ac-1", "clases"), "3 clases · 2 h 30 min | 2 en línea · 1 presencial");
  igual("el horario dice cuántas se dieron y lo que faltó, escrito", await celdaTexto(page, "ac-1", "horario"), "7 de 8 | dadas de las programadas | ⚠ 1 sin dar");
  igual("sin horario no dice «0 de 0»", await celdaTexto(page, "ac-2", "horario"), "Sin horario | nadie cargó su horario");
  igual("alumnos activos contra inscritos", await celdaTexto(page, "ac-1", "alumnos"), "17 de 53 | entrenaron este mes");
  igual("los informes que faltan van escritos", await celdaTexto(page, "ac-1", "informes"),
    "0 de 2 enviados | 2 profesores | ⚠ 2 sin enviar" + (mes < new Date().toISOString().slice(0, 7) + "-01" ? "" : " (el mes no ha terminado)"));
  igual("el gasto de IA contra su tope", await celdaTexto(page, "ac-1", "ia"), "US$0.42 | de US$5.00 de tope");
  igual("sin modelo lo dice", await celdaTexto(page, "ac-2", "ia"), "US$0.00 | sin IA configurada");
  const cob = await celdaTexto(page, "ac-1", "cobros");
  igual("cada moneda por su lado, con sus vencidos", [/21[\s. ]?000/.test(cob), /\$?40|US\$\s?40/.test(cob), cob.includes("⚠ 2 vencidos"), cob.includes("61")], [true, true, true, false]);
  const pie = await pieTexto(page, "cobros");
  igual("la suma junta los colones con los colones y no con los dólares", [/28[\s. ]?000/.test(pie), (pie.match(/cobro/g) || []).length], [true, 2]);
  igual("la suma de las clases", await pieTexto(page, "clases"), "10 clases · 6 h 47 min | 9 en línea · 1 presencial");
  igual("la suma de la IA no inventa un tope", await pieTexto(page, "ia"), "US$0.42 | entre todas");
  igual("un nombre con etiquetas se ve literal y no se ejecuta",
    [await page.$eval('#tabla tr[data-academia="ac-2"] th', (t) => t.textContent.startsWith("<img")), await page.evaluate(() => !!window.__xss)], [true, false]);
  igual("un color que no es un color no se pinta",
    await page.$$eval('#tabla tbody tr th span[aria-hidden="true"]', (s) => s.map((x) => x.style.backgroundColor)), ["rgb(29, 78, 216)"]);
  igual("la nota avisa que quien está en dos academias cuenta en las dos", await page.$eval("#nota", (n) => n.checkVisibility() && /dos academias/.test(n.textContent)), true);

  const otro = await page.$eval("#mes", (s) => s.options[3].value);
  await page.selectOption("#mes", otro);
  await page.waitForFunction((n) => window.__rpc.length >= n, 2);
  igual("cambiar de mes lo vuelve a pedir con ese mes", (await llamadas(page)).slice(-1)[0].args, { p_periodo: otro });
  igual("sin errores en la consola", errores, []);
  await ctx.close();

  console.log("\nEn el celular, la tabla se desplaza sola y la página no");
  const m = await abrir(browser, { tablas: {}, rpc: { tablero_academias: [FILA_A, FILA_B] } }, ADMIN, "#tabla-caja:not([hidden])", { viewport: { width: 375, height: 800 } });
  igual("la página no se sale por el costado", await m.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await m.ctx.close();
}

async function pruebaVacio(browser) {
  console.log("\nSin ninguna academia");
  const { page, ctx } = await abrir(browser, { tablas: {}, rpc: { tablero_academias: [] } }, ADMIN, "#vacio:not([hidden])");
  igual("ofrece crearla desde un grupo y no pinta la tabla",
    [await seVe(page, '#vacio a[href="academias.html"]'), await seVe(page, "#tabla-caja")], ["sí", "no"]);
  await ctx.close();

  console.log("\nUna tabla que no se pudo leer");
  const e = await abrir(browser, { tablas: {}, rpc: {}, error: "se cayó la red" }, ADMIN, "#aviso:not(.hidden)");
  igual("se dice, y no se hace pasar por vacía",
    [await e.page.$eval("#aviso", (a) => a.textContent), await seVe(e.page, "#vacio"), await seVe(e.page, "#tabla-caja")],
    ["No se pudo armar el tablero: se cayó la red", "no", "no"]);
  await e.ctx.close();
}

async function pruebaSupervisor(browser) {
  console.log("\nEl supervisor: su academia, sin nada de IA");
  const { page, ctx, errores } = await abrir(browser,
    { tablas: { academias: [{ id: "ac-1", supervisor_id: "s-1" }] }, rpc: { tablero_academias: [FILA_SUP] } }, SUP, "#tabla-caja:not([hidden])");
  igual("no hay columna de IA", await page.$$eval("#tabla thead th", (ths) => ths.map((t) => t.textContent).includes("Mejorar informe (IA)")), false);
  igual("ni un «US$» en la página", await page.evaluate(() => /US\$|IA configurada|tope/.test(document.body.innerText)), false);
  igual("sí sus informes y sus cobros", [(await celdaTexto(page, "ac-1", "informes")).startsWith("0 de 2"), (await celdaTexto(page, "ac-1", "cobros")).includes("vencidos")], [true, true]);
  igual("sin errores en la consola", errores, []);
  await ctx.close();

  console.log("\nUn supervisor sin academia");
  const s = await abrir(browser, { tablas: { academias: [] }, rpc: {} }, SUP_SIN, "#denegado:not(.hidden)");
  igual("se le dice por qué, sin pedir el tablero",
    [await s.page.$eval("#denegado-texto", (p) => p.textContent), (await llamadas(s.page)).length],
    ["Todavía no supervisas ninguna academia. Quien administra te la asigna desde Academias.", 0]);
  await s.ctx.close();

  console.log("\nUn profesor");
  const p = await abrir(browser, { tablas: {}, rpc: {} }, PROFE, "#denegado:not(.hidden)");
  igual("no entra ni pide el tablero", [await seVe(p.page, "#app"), (await llamadas(p.page)).length], ["no", 0]);
  await p.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAdmin(browser);
    await pruebaVacio(browser);
    await pruebaSupervisor(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl tablero por academia está como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
