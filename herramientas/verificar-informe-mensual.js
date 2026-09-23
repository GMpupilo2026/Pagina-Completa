#!/usr/bin/env node
/* El informe mensual del profesor y la pantalla de supervisión, comprobados en
   un navegador de verdad con un cliente de Supabase de mentira.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - un informe mandado con el mes equivocado queda archivado en otro mes y la
 *    pantalla se ve perfecta;
 *  - un «Enviar» de un solo toque manda un informe a medio escribir que
 *    después ya no se puede cambiar;
 *  - un informe ya enviado que se sigue ofreciendo para editar le hace creer
 *    al profesor que corrigió algo que su supervisión nunca va a ver;
 *  - los números del enviado tienen que ser la FOTO de ese día, no los de hoy:
 *    si no, la supervisora lee otra cosa que lo que el profesor mandó;
 *  - y en supervisión, un «sin enviar» que se pinta igual que un «sin leer»
 *    deja sin perseguir al profesor que no mandó nada.
 *
 * Lo que hace cumplir la BASE (que el borrador no lo vea nadie, que un enviado
 * no se cambie, que solo comente quien supervisa a ese profesor) se comprobó
 * impersonando roles en SQL: acá el cliente es de mentira.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-informe-mensual.js
 */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const PROFE = { id: "p-1", role: "profesor", is_admin: false, es_supervisor: false };
const SUP = { id: "s-1", role: "profesor", is_admin: false, es_supervisor: true };
const ALUMNA = { id: "a-1", role: "alumno", is_admin: false, es_supervisor: false };

const EN_VIVO = {
  alumnos: 60, alumnos_activos: 44, ejercicios_alumnos: 5070, clases_en_linea: 5,
  clases_presenciales: 1, minutos_clase: 242, asistencias: 22, tareas_puestas: 19,
  tareas_completadas: 1, tareas_vencidas: 3, examenes_puestos: 2, examenes_rendidos: 1,
  nota_promedio: 8.5, notas_bitacora: 1, planes_nuevos: 0,
};
const FOTO = Object.assign({}, EN_VIVO, { tareas_puestas: 7, minutos_clase: 90 });

function clienteFalso(datos, yo) {
  return `
window.__rpc = [];
(function () {
  const D = ${JSON.stringify(datos)};
  const YO = ${JSON.stringify(yo)};
  function resolver(data) { return { then(res, rej) { return Promise.resolve({ data: data, error: null }).then(res, rej); } }; }
  function tabla(nombre) {
    let cond = [], unica = false;
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; },
      eq(c, v) { cond.push([c, v]); return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) {
        let d = nombre === "profiles" ? [YO] : (D.tablas[nombre] || []);
        cond.forEach(([c, v]) => { d = d.filter((f) => f[c] === v); });
        if (unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: YO.id }, access_token: "t" } } }) },
    from: tabla,
    rpc(n, args) {
      window.__rpc.push({ n: n, args: args || null });
      if (n === "guardar_informe_mensual") {
        const lista = D.tablas.informes_profesor = D.tablas.informes_profesor || [];
        const i = lista.findIndex((f) => f.periodo === args.p_periodo);
        const fila = { id: "inf-nuevo", profesor_id: YO.id, periodo: args.p_periodo, resumen: args.p_resumen,
          logros: args.p_logros, dificultades: args.p_dificultades, proximo_mes: args.p_proximo,
          datos: args.p_enviar ? D.foto : null, estado: args.p_enviar ? "enviado" : "borrador",
          enviado_at: args.p_enviar ? new Date().toISOString() : null, leido_at: null, comentario: "" };
        if (i >= 0) lista[i] = fila; else lista.unshift(fila);
        return resolver(fila);
      }
      return resolver(D.rpc[n] !== undefined ? D.rpc[n] : []);
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

async function abrir(browser, pagina, datos, yo, esperar) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, yo) }));
  await page.goto(BASE + pagina, { waitUntil: "networkidle" });
  await page.waitForSelector(esperar || "#app:not(.hidden)", { timeout: 15000 });
  return { page, errores };
}

const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? (el.checkVisibility() ? "sí" : "no") : "no existe";
}, sel);

const dato = (page, clave) => page.evaluate((c) => {
  const caja = document.querySelector('#numeros [data-campo="' + c + '"] dd');
  return caja ? caja.textContent : "(no está)";
}, clave);

const llamadas = (page, n) => page.evaluate((x) => window.__rpc.filter((r) => r.n === x), n);

async function pruebaProfesor(browser) {
  console.log("\nEl profesor arma y manda su informe");
  const datos = { tablas: { informes_profesor: [] }, foto: FOTO,
    rpc: { actividad_profesor: [EN_VIVO], mis_supervisores: [{ id: "s-1", nombre: "Marta Solano" }] } };
  const { page, errores } = await abrir(browser, "/informe-mensual.html", datos, PROFE);
  await page.waitForSelector("#numeros dl");
  const mes = await page.evaluate(() => ActividadProfesor.mesPorOmision());
  igual("el selector arranca en el mes que toca informar", await page.$eval("#mes", (s) => s.value), mes);
  igual("los números del mes pedidos con ese mes", (await llamadas(page, "actividad_profesor"))[0].args,
        { p_profesor: "p-1", p_periodo: mes });
  igual("pinta las tareas puestas", await dato(page, "tareas_puestas"), "19");
  igual("el tiempo de clase va en horas", await dato(page, "minutos_clase"), "4 h 2 min");
  igual("dice a quién le llega", await page.$eval("#destino", (p) => p.textContent), "Lo recibe: Marta Solano.");

  // Un resumen corto no se manda: se dice y no viaja nada.
  await page.fill("#resumen", "poco");
  await page.click("#enviar"); await page.click("#enviar");
  igual("un resumen corto no viaja", (await llamadas(page, "guardar_informe_mensual")).length, 0);
  igual("y se dice por qué", await seVe(page, "#aviso"), "sí");

  await page.fill("#resumen", "Di clases de finales de torre a los dos grupos del martes.");
  await page.fill("#logros", "Dos alumnos subieron de nivel.");
  await page.click("#guardar");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "guardar_informe_mensual"));
  const borrador = (await llamadas(page, "guardar_informe_mensual"))[0].args;
  igual("guardar borrador manda el mes, el texto y NO lo envía",
        [borrador.p_periodo, borrador.p_resumen, borrador.p_logros, borrador.p_enviar],
        [mes, "Di clases de finales de torre a los dos grupos del martes.", "Dos alumnos subieron de nivel.", false]);

  await page.click("#enviar");
  igual("el primer toque de «Enviar» no manda nada", (await llamadas(page, "guardar_informe_mensual")).length, 1);
  igual("y dice lo que va a pasar", await page.$eval("#enviar", (b) => b.textContent), "Sí, enviarlo — después ya no se puede cambiar");
  await page.click("#enviar");
  await page.waitForFunction(() => window.__rpc.filter((r) => r.n === "guardar_informe_mensual").length === 2);
  const envio = (await llamadas(page, "guardar_informe_mensual"))[1].args;
  igual("el segundo toque lo envía, del mismo mes", [envio.p_enviar, envio.p_periodo], [true, mes]);
  await page.waitForFunction(() => document.getElementById("botones").hidden);
  igual("ya enviado, los botones se van", await seVe(page, "#guardar"), "no");
  igual("y el texto queda de solo lectura (no desactivado)",
        await page.$eval("#resumen", (t) => [t.readOnly, t.disabled]), [true, false]);
  igual("sin errores en la página", errores, []);
  await page.close();
}

async function pruebaEnviado(browser) {
  console.log("\nUn informe ya enviado enseña lo que se mandó");
  const mes = await (async () => {
    const p = await browser.newPage(); await p.goto(BASE + "/offline.html");
    await p.addScriptTag({ url: BASE + "/js/actividad-profesor.js" });
    const m = await p.evaluate(() => ActividadProfesor.mesPorOmision()); await p.close(); return m;
  })();
  const datos = { tablas: { informes_profesor: [{
      id: "inf-1", profesor_id: "p-1", periodo: mes, resumen: "Todo bien este mes, con las clases de siempre.",
      logros: "", dificultades: "", proximo_mes: "", datos: FOTO, estado: "enviado",
      enviado_at: "2026-09-02T15:00:00Z", leido_at: "2026-09-03T15:00:00Z",
      comentario: "Buen trabajo. Ojo con las tareas vencidas.", comentario_at: "2026-09-03T15:00:00Z" }] },
    rpc: { actividad_profesor: [EN_VIVO], mis_supervisores: [] } };
  const { page, errores } = await abrir(browser, "/informe-mensual.html", datos, PROFE);
  await page.waitForSelector("#numeros dl");
  igual("los números son la foto del envío, no los de hoy", await dato(page, "tareas_puestas"), "7");
  igual("ni siquiera se piden los de hoy", (await llamadas(page, "actividad_profesor")).length, 0);
  igual("el comentario de la supervisión se ve", await seVe(page, "#comentario-caja"), "sí");
  igual("y dice lo que escribió", await page.$eval("#comentario", (p) => p.textContent), "Buen trabajo. Ojo con las tareas vencidas.");
  igual("no se ofrece editarlo", await seVe(page, "#enviar"), "no");
  igual("sin supervisión asignada, dice quién lo lee",
        await page.$eval("#destino", (p) => p.textContent),
        "Todavía no tienes una supervisora o un supervisor asignado: tus informes los lee quien administra.");
  igual("sin errores en la página", errores, []);
  await page.close();
}

async function pruebaSupervisor(browser) {
  console.log("\nQuien supervisa lee a sus profesores");
  const datos = { tablas: { informes_profesor: [{
      id: "inf-9", profesor_id: "p-1", periodo: "2026-09-01", resumen: "Clases de finales en los dos grupos.",
      logros: "Subieron dos.", dificultades: "", proximo_mes: "Torneo interno.", datos: FOTO,
      enviado_at: "2026-09-02T15:00:00Z", leido_at: null, comentario: "" }] },
    rpc: { resumen_profesores_supervisados: [
      { id: "p-1", nombre: "Karina <b>Rojas</b>", grupo: "SJ", actividad: EN_VIVO,
        informe_id: "inf-9", enviado_at: "2026-09-02T15:00:00Z", leido_at: null, comentado: false },
      { id: "p-2", nombre: "Luis Mora", grupo: null, actividad: FOTO,
        informe_id: null, enviado_at: null, leido_at: null, comentado: false },
    ] } };
  const { page, errores } = await abrir(browser, "/supervision.html", datos, SUP);
  await page.waitForSelector("#lista li");
  const mes = await page.evaluate(() => ActividadProfesor.mesPorOmision());
  igual("la lista se pide con el mes elegido", (await llamadas(page, "resumen_profesores_supervisados"))[0].args, { p_periodo: mes });
  const chips = await page.$$eval('#lista [data-estado="informe"]', (xs) => xs.map((x) => x.textContent));
  igual("el enviado sin leer y el sin enviar se distinguen por escrito", chips, ["📨 Enviado · sin leer", "⏳ Sin enviar"]);
  igual("el nombre se ve literal y no se ejecuta",
        await page.$eval('#lista li[data-profesor="p-1"] h2', (h) => [h.textContent, h.querySelectorAll("b").length]),
        ["Karina <b>Rojas</b>", 0]);
  igual("el resumen del mes cuenta bien",
        (await page.$eval("#resumen", (p) => p.textContent)).startsWith("2 profesores · 1 enviaron"), true);
  igual("a quien no mandó no se le ofrece leer nada",
        await page.$$eval('#lista li[data-profesor="p-2"] button', (b) => b.length), 0);

  await page.click('#lista li[data-profesor="p-1"] button');
  await page.waitForSelector('#lista li[data-profesor="p-1"] form');
  igual("el informe se lee entero",
        await page.$eval('#lista li[data-profesor="p-1"]', (li) => li.textContent.includes("Clases de finales en los dos grupos.")), true);
  await page.click('#lista li[data-profesor="p-1"] form button[type="button"]');
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "revisar_informe_mensual"));
  igual("«Marcar como leído» manda ese informe y sin comentario",
        (await llamadas(page, "revisar_informe_mensual"))[0].args, { p_id: "inf-9", p_comentario: null });

  await page.click('#lista li[data-profesor="p-1"] button');
  await page.waitForSelector('#lista li[data-profesor="p-1"] form');
  await page.click('#lista li[data-profesor="p-1"] form button[type="submit"]');
  igual("un comentario vacío no viaja", (await llamadas(page, "revisar_informe_mensual")).length, 1);
  await page.fill('#lista li[data-profesor="p-1"] textarea', "Muy bien lo del torneo.");
  await page.click('#lista li[data-profesor="p-1"] form button[type="submit"]');
  await page.waitForFunction(() => window.__rpc.filter((r) => r.n === "revisar_informe_mensual").length === 2);
  igual("el comentario viaja con ese informe",
        (await llamadas(page, "revisar_informe_mensual"))[1].args, { p_id: "inf-9", p_comentario: "Muy bien lo del torneo." });
  igual("sin errores en la página", errores, []);
  await page.close();

  console.log("\nSin profesores a cargo, se dice por qué");
  const vacio = await abrir(browser, "/supervision.html", { tablas: {}, rpc: { resumen_profesores_supervisados: [] } }, SUP);
  await vacio.page.waitForFunction(() => !document.getElementById("vacio").hidden);
  igual("el aviso de que no tiene a nadie se ve", await seVe(vacio.page, "#vacio"), "sí");
  await vacio.page.close();
}

async function pruebaPuertas(browser) {
  console.log("\nCada pantalla es de quien es");
  const a = await abrir(browser, "/informe-mensual.html", { tablas: {}, rpc: {} }, ALUMNA, "#denegado:not(.hidden)");
  igual("a la alumna el informe mensual le dice que no es suyo", await seVe(a.page, "#app"), "no");
  await a.page.close();
  const b = await abrir(browser, "/supervision.html", { tablas: {}, rpc: {} }, PROFE, "#denegado:not(.hidden)");
  igual("a un profesor sin supervisión la pantalla le dice que no es suya", await seVe(b.page, "#app"), "no");
  igual("y no le pide la lista a la base", (await llamadas(b.page, "resumen_profesores_supervisados")).length, 0);
  await b.page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaProfesor(browser);
    await pruebaEnviado(browser);
    await pruebaSupervisor(browser);
    await pruebaPuertas(browser);
  } catch (e) {
    console.log("  ✗ la prueba se cayó: " + (e && e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl informe mensual y la supervisión de profesores están como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
