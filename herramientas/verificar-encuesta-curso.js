#!/usr/bin/env node
/* La encuesta anónima de un curso: la contesta el público sin cuenta y con
   lector de pantalla (encuesta-curso.html), y la administra quien administra
   (encuestas-curso.html). En un navegador de verdad, con un Supabase de mentira.
 *
 * Lo que se rompe acá se rompe CALLADO, y más para quien no ve la pantalla:
 *  - una pregunta sin <legend> o una opción sin etiqueta se ven perfectas, y el
 *    lector de pantalla lee «botón de opción, no marcado» sin decir de qué;
 *  - si al enviar falta algo y el foco no se mueve, quien no ve no se entera
 *    de que no se envió; y si se envió, tampoco se entera sin el «¡Gracias!»;
 *  - «No sé» que viaja como 0 hunde el promedio;
 *  - una respuesta ANÓNIMA que manda algo de quien contesta deja de serlo;
 *  - el consentimiento tiene que viajar (lo exige la base).
 *
 * Lo que hace cumplir la BASE (anónima de verdad, solo administración lee, el
 * freno, el consentimiento, la encuesta cerrada) se comprobó impersonando roles
 * en SQL; verificar-envios-publicos.js y verificar-legal.js leen la migración.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-encuesta-curso.js
 */
const { chromium } = require("./lib/playwright-con-sesion");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const XSS = '<img src=x onerror="window.__xss=1">Curso';

const ADMIN = { id: "ad-1", role: "profesor", is_admin: true, full_name: "Admin" };
const PROFE = { id: "p-1", role: "profesor", is_admin: false, full_name: "Carla Rojas" };

function clienteFalso(datos, yo) {
  return `
window.__rpc = []; window.__escrituras = [];
(function () {
  const D = ${JSON.stringify(datos)};
  const YO = ${JSON.stringify(yo)};
  function resolver(data) { return { then(res, rej) { return Promise.resolve({ data: data, error: null }).then(res, rej); } }; }
  function tabla(nombre) {
    let cond = [], unica = false, op = "select", cuerpo = null;
    const b = {
      select() { return b; }, order() { return b; }, range() { return b; },
      eq(c, v) { cond.push([c, v]); return b; },
      maybeSingle() { unica = true; return b; },
      insert(x) { op = "insert"; cuerpo = x; return b; },
      update(x) { op = "update"; cuerpo = x; return b; },
      delete() { op = "delete"; return b; },
      then(res, rej) {
        // Las escrituras se anotan en el RESOLVER, con sus filtros ya puestos.
        if (op !== "select") {
          window.__escrituras.push({ tabla: nombre, op: op, cuerpo: cuerpo, filtros: cond });
          return Promise.resolve({ data: null, error: null }).then(res, rej);
        }
        let d = nombre === "profiles" ? (D.perfiles || [YO]) : (D.tablas[nombre] || []);
        cond.forEach(([c, v]) => { d = d.filter((f) => f[c] === v); });
        if (unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: YO ? { user: { id: YO.id }, access_token: "t" } : null } }) },
    from: tabla,
    rpc(n, args) {
      window.__rpc.push({ n: n, args: args || null });
      if (n === "mis_funciones_coordinacion") return resolver(null);
      return resolver(D.rpc[n] !== undefined ? D.rpc[n] : null);
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
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, yo) }));
  await page.goto(BASE + pagina, { waitUntil: "networkidle" });
  await page.waitForSelector(esperar, { timeout: 15000 });
  return { page, errores, ctx };
}

const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? (el.checkVisibility() ? "sí" : "no") : "no existe";
}, sel);
const llamadas = (page, n) => page.evaluate((x) => window.__rpc.filter((r) => r.n === x), n);

const ENCUESTA = [{ curso: XSS, profesor: "Carla Rojas", abierta: true }];

async function pruebaPublica(browser) {
  console.log("\nLa encuesta pública: sin cuenta, con lector de pantalla");
  const datos = { tablas: {}, rpc: { encuesta_curso_publica: ENCUESTA, responder_encuesta_curso: { ok: true } } };
  const { page, errores, ctx } = await abrir(browser, "/encuesta-curso.html?e=curso-cero-abc123", datos, null, "#form fieldset");

  igual("el nombre del curso va como texto", await page.evaluate(() => document.querySelector("#titulo").textContent), "Encuesta anónima del curso «" + XSS + "»");
  igual("las cuatro partes, cada una con su encabezado",
    await page.evaluate(() => [...document.querySelectorAll("#form h2")].map((h) => h.textContent.slice(0, 12))),
    ["Parte 1 de 4", "Parte 2 de 4", "Parte 3 de 4", "Parte 4 de 4"]);
  igual("cada pregunta de opciones es un grupo con su leyenda numerada",
    await page.evaluate(() => [...document.querySelectorAll("#form fieldset")].map((f) => ((f.querySelector("legend") || {}).textContent || "").match(/^Pregunta (\d+) de 14\./)?.[1] || "SIN LEYENDA")),
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  igual("las de escribir, con su etiqueta y su ayuda enlazada",
    await page.evaluate(() => [...document.querySelectorAll("#form textarea")].map((t) => {
      const l = document.querySelector('label[for="' + t.id + '"]');
      const ayuda = document.getElementById(t.getAttribute("aria-describedby"));
      return (l && /^Pregunta 1[234] de 14\./.test(l.textContent) && ayuda && ayuda.textContent.length > 10) ? "bien" : "MAL " + t.id;
    })), ["bien", "bien", "bien"]);
  igual("ningún control sin nombre para el lector de pantalla",
    await page.evaluate(() => [...document.querySelectorAll("#form input, #form textarea")].filter((i) => {
      const l = i.closest("label") || document.querySelector('label[for="' + i.id + '"]');
      return !l || !l.textContent.trim();
    }).length), 0);
  igual("la escala dice el número y la palabra, y tiene «No sé»",
    await page.evaluate(() => [...document.querySelectorAll('#q-ritmo label')].map((l) => l.textContent)),
    ["1, Nada de acuerdo", "2, Poco de acuerdo", "3, Más o menos", "4, Bastante de acuerdo", "5, Totalmente de acuerdo", "No sé o no llegué a verlo"]);
  igual("nada con tabindex positivo (rompe el orden del teclado)", await page.evaluate(() => document.querySelectorAll('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').length), 0);

  // Enviar vacía: no viaja nada, el resumen toma el foco y dice cuántas faltan.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.click("#enviar");
  await page.waitForTimeout(150);
  igual("vacía no llama a la base", (await llamadas(page, "responder_encuesta_curso")).length, 0);
  igual("el resumen de lo que falta se ve", await seVe(page, "#errores"), "sí");
  igual("y recibe el foco", await page.evaluate(() => document.activeElement.id), "errores");
  igual("y queda a la vista, aunque se haya enviado desde abajo", await page.evaluate(() => {
    const r = document.getElementById("errores").getBoundingClientRect();
    return r.top >= 0 && r.top < innerHeight;
  }), true);
  igual("dice cuántas faltan (las 10 obligatorias y la casilla)", await page.textContent("#errores-titulo"), "Faltan 11 respuestas antes de enviar");
  igual("la leyenda de la pregunta que falta también lo dice",
    await page.evaluate(() => document.querySelector("#q-asistencia legend").textContent.includes("Falta contestar esta pregunta.")), true);
  // El tercer enlace: pregunta 1, pregunta 3 y pregunta 4 (la 2 es opcional).
  await page.click("#errores-lista a >> nth=2");
  igual("el enlace del resumen lleva el foco a su pregunta",
    await page.evaluate(() => document.activeElement.closest("fieldset") && document.activeElement.closest("fieldset").id), "q-describe");

  // Contestar con el teclado: flechas dentro del grupo.
  await page.focus('#q-asistencia input[value="termino"]');
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  igual("con las flechas se elige en el grupo", await page.evaluate(() => document.querySelector('#q-asistencia input:checked').value), "dejo");
  await page.check('#q-motivos input[value="rapido"]');
  await page.check('#q-motivos input[value="no_accesible"]');
  await page.fill("#motivo-otro", "  El horario cambió  ");
  for (const [c, v] of [["desde_cero", "2"], ["describe", "nose"], ["ritmo", "1"], ["dudas", "4"], ["guia", "2"], ["accesible", "1"],
                        ["aprendizaje", "piezas"], ["suficiente", "no"], ["recomendaria", "tal_vez"]]) {
    await page.check(`#q-${c} input[value="${v}"]`);
  }
  await page.fill("#t-expectativas", "Aprender a jugar con mi hijo");
  await page.fill("#t-realidad", "Iba muy rápido");

  // Sin la casilla: todavía no.
  await page.click("#enviar");
  await page.waitForTimeout(150);
  igual("sin aceptar, no viaja", (await llamadas(page, "responder_encuesta_curso")).length, 0);
  igual("y el resumen dice que falta solo eso", await page.textContent("#errores-titulo"), "Falta 1 respuesta antes de enviar");

  await page.check("#acepto-datos");
  await page.click("#enviar");
  await page.waitForSelector("#gracias-titulo");
  await page.waitForTimeout(150);
  const env = await llamadas(page, "responder_encuesta_curso");
  const version = await page.evaluate(() => window.LegalVersion.PRIVACIDAD);
  igual("manda exactamente lo marcado, «No sé» como null y sin nada de quien contesta", env.map((e) => e.args), [{
    p_slug: "curso-cero-abc123",
    p_respuestas: { asistencia: "dejo", motivos: ["rapido", "no_accesible"], motivo_otro: "El horario cambió",
      aprendizaje: "piezas", suficiente: "no", recomendaria: "tal_vez",
      desde_cero: 2, describe: null, ritmo: 1, dudas: 4, guia: 2, accesible: 1,
      expectativas: "Aprender a jugar con mi hijo", realidad: "Iba muy rápido", comentario: "" },
    p_version_privacidad: version,
  }]);
  igual("el formulario ya no se ve", await seVe(page, "#form"), "no");
  igual("el «¡Gracias!» se ve", await seVe(page, "#gracias"), "sí");
  igual("y recibe el foco", await page.evaluate(() => document.activeElement.id), "gracias-titulo");
  igual("y queda a la vista", await page.evaluate(() => {
    const r = document.getElementById("gracias-titulo").getBoundingClientRect();
    return r.top >= 0 && r.top < innerHeight;
  }), true);
  igual("sin inyección", await page.evaluate(() => window.__xss || 0), 0);
  igual("sin errores en la página", errores, []);
  await ctx.close();

  console.log("\nSi la base la rechaza, lo dice y no se pierde nada");
  const rech = { tablas: {}, rpc: { encuesta_curso_publica: ENCUESTA, responder_encuesta_curso: { ok: false, error: "Esta encuesta ya no está recibiendo respuestas." } } };
  const r = await abrir(browser, "/encuesta-curso.html?e=curso-cero-abc123", rech, null, "#form fieldset");
  for (const q of ["asistencia", "desde_cero", "describe", "ritmo", "dudas", "guia", "accesible", "aprendizaje", "suficiente", "recomendaria"]) {
    await r.page.check(`#q-${q} input >> nth=0`);
  }
  await r.page.check("#acepto-datos");
  await r.page.click("#enviar");
  await r.page.waitForTimeout(300);
  igual("el resumen dice lo que contestó la base", (await r.page.textContent("#errores")).replace(/\s+/g, " ").trim(), "No se pudo enviar Esta encuesta ya no está recibiendo respuestas.");
  igual("con el foco", await r.page.evaluate(() => document.activeElement.id), "errores");
  igual("y las respuestas siguen marcadas", await r.page.evaluate(() => document.querySelectorAll("#form input:checked").length), 11);
  await r.ctx.close();

  console.log("\nEnlaces que no llevan a una encuesta abierta");
  for (const [nombre, url, rpc, texto] of [
    ["sin el código de la encuesta", "/encuesta-curso.html", [], "Este enlace está incompleto"],
    ["una encuesta que no existe", "/encuesta-curso.html?e=nada-123456", [], "No encontramos esta encuesta"],
    ["una encuesta cerrada", "/encuesta-curso.html?e=curso-cero-abc123", [{ curso: "X", profesor: null, abierta: false }], "Esta encuesta ya cerró"],
  ]) {
    const x = await abrir(browser, url, { tablas: {}, rpc: { encuesta_curso_publica: rpc } }, null, "#estado");
    await x.page.waitForTimeout(300);
    igual(nombre + ": lo dice", (await x.page.textContent("#estado")).startsWith(texto), true);
    igual(nombre + ": no enseña preguntas", await seVe(x.page, "#app"), "no");
    await x.ctx.close();
  }
}

async function pruebaAdmin(browser) {
  console.log("\nQuien administra arma la encuesta y lee los resultados");
  const datos = {
    perfiles: [ADMIN, PROFE],
    tablas: {
      encuestas_curso: [
        { id: "e-1", slug: "desde-cero-sabado-ab12cd", curso: XSS, profesor_id: "p-1", abierta: true, created_at: "2026-09-20T10:00:00Z" },
        { id: "e-2", slug: "otro-curso-zz99yy", curso: "Otro curso", profesor_id: null, abierta: false, created_at: "2026-09-10T10:00:00Z" },
      ],
      encuesta_curso_respuestas: [
        { encuesta_id: "e-1", fecha: "2026-09-21", asistencia: "dejo", motivo_otro: "", expectativas: "Aprender de cero", realidad: '<script>window.__xss=2</script>Muy rápido', comentario: "" },
        { encuesta_id: "e-1", fecha: "2026-09-22", asistencia: "sigue", motivo_otro: "", expectativas: "", realidad: "", comentario: "" },
      ],
    },
    rpc: { resumen_encuesta_curso: {
      respuestas: 4, asistencia: { dejo: 1, a_veces: 1, sigue: 2 }, motivos: { rapido: 2, no_accesible: 1 },
      aprendizaje: { piezas: 3, nada: 1 }, suficiente: { no: 2, a_veces: 2 }, recomendaria: { si: 2, tal_vez: 2 },
      notas: { desde_cero: { promedio: 2, n: 4 }, describe: { promedio: null, n: 0 }, ritmo: { promedio: 1.5, n: 4 },
               dudas: { promedio: 4.3, n: 3 }, guia: { promedio: 3, n: 4 }, accesible: { promedio: 4.8, n: 4 } } } },
  };
  // El perfil de quien entra: la página lo busca por su id.
  const { page, errores, ctx } = await abrir(browser, "/encuestas-curso.html", datos, ADMIN, "#lista article");

  igual("una tarjeta por encuesta, con el nombre como texto", await page.evaluate(() => [...document.querySelectorAll("#lista h3")].map((h) => h.textContent)), [XSS, "Otro curso"]);
  igual("el enlace para compartir", await page.evaluate(() => document.querySelector("#lista code").textContent), BASE + "/encuesta-curso.html?e=desde-cero-sabado-ab12cd");
  igual("abierta y cerrada, escrito", await page.evaluate(() => [...document.querySelectorAll("#lista article")].map((a) => a.querySelector("span").textContent)),
    ["🟢 Abierta: recibe respuestas", "⏸️ Cerrada: no recibe respuestas"]);

  const ver = page.locator("#lista article").first().getByRole("button", { name: "Ver resultados" });
  igual("resultados cerrados de entrada", await ver.getAttribute("aria-expanded"), "false");
  await ver.click();
  await page.waitForSelector("#resultados-e-1 table");
  igual("abierto lo dice", await page.locator("#lista article").first().getByRole("button", { name: "Ocultar resultados" }).getAttribute("aria-expanded"), "true");
  igual("la deserción, escrita", await page.evaluate(() => document.querySelector("#resultados-e-1 p.text-sm.mt-1").textContent),
    "4 respuestas. 1 persona dice que dejó el curso (25 %) y 1 va solo a veces (25 %).");
  igual("los motivos, de lo más dicho a lo menos", await page.evaluate(() => [...document.querySelectorAll("#resultados-e-1 ul.list-disc li")].map((l) => l.textContent)),
    ["Iba muy rápido para alguien que empezaba de cero: 2", "El material o la plataforma no funcionaban bien con mi lector de pantalla: 1"]);
  igual("la forma de enseñar: promedio, lectura escrita y cuántos contestaron",
    await page.evaluate(() => [...document.querySelectorAll("#resultados-e-1 tbody tr")].map((tr) => [...tr.children].slice(1).map((c) => c.textContent).join(" | "))),
    ["2,0 de 5 | ⚠️ A revisar | 4 de 4", "— | Sin datos | 0 de 4", "1,5 de 5 | ⚠️ A revisar | 4 de 4",
     "4,3 de 5 | Bien | 3 de 4", "3,0 de 5 | Regular | 4 de 4", "4,8 de 5 | Excelente | 4 de 4"]);
  igual("lo que esperaban y lo que encontraron, como texto", await page.evaluate(() => [...document.querySelectorAll("#resultados-e-1 li.rounded-lg")].map((l) => l.textContent)),
    ["Respuesta anónima · Dejé de irEsperaba: Aprender de ceroEncontró: <script>window.__xss=2</script>Muy rápido"]);

  // Crear: lo que viaja.
  await page.fill("#curso", "Ajedrez desde cero, grupo del martes");
  await page.selectOption("#profesor", "p-1");
  await page.click("#crear button[type=submit]");
  await page.waitForTimeout(300);
  const ins = await page.evaluate(() => window.__escrituras.filter((e) => e.op === "insert"));
  igual("crear manda el curso, el profesor y un código legible", ins.map((e) => [e.tabla, e.cuerpo.curso, e.cuerpo.profesor_id, /^ajedrez-desde-cero-grupo-del-martes-[a-z0-9]{6}$/.test(e.cuerpo.slug)]),
    [["encuestas_curso", "Ajedrez desde cero, grupo del martes", "p-1", true]]);

  // Cerrar: con el filtro de ESA encuesta.
  await page.locator("#lista article").first().getByRole("button", { name: "Cerrar la encuesta" }).click();
  await page.waitForTimeout(300);
  const upd = await page.evaluate(() => window.__escrituras.filter((e) => e.op === "update"));
  igual("cerrar cambia solo esa encuesta", upd.map((e) => [e.cuerpo, e.filtros]), [[{ abierta: false }, [["id", "e-1"]]]]);
  igual("sin inyección", await page.evaluate(() => window.__xss || 0), 0);
  igual("sin errores en la página", errores, []);
  await ctx.close();

  const p = await abrir(browser, "/encuestas-curso.html", { perfiles: [PROFE], tablas: {}, rpc: {} }, PROFE, "#denegado:not(.hidden)");
  igual("un profesor no entra", await seVe(p.page, "#app"), "no");
  await p.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaPublica(browser);
    await pruebaAdmin(browser);
  } catch (e) {
    console.log("  ✗ " + (e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
