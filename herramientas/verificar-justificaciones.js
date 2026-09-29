#!/usr/bin/env node
/* Las justificaciones de ausencia (justificaciones.html): el alumno cuenta por
   qué no llegó a clase y sus profesores, coordinación y supervisión la leen y
   la contestan. En un navegador de verdad con un cliente de Supabase de
   mentira.
 *
 * Lo que se rompe acá se rompe CALLADO:
 *  - un documento que se sube a otra carpeta, o que no viaja con la
 *    justificación: el alumno cree que lo mandó y el profesor no lo ve;
 *  - una justificación sin texto ni documento, o sin aceptar la privacidad,
 *    que sale igual: la pantalla tiene que pararla ANTES de subir nada;
 *  - una respuesta que viaja con el id de OTRA justificación;
 *  - el nombre del alumno o lo que escribió, pintado como HTML;
 *  - la lista desordenada, o pedida entera (PostgREST corta a mil);
 *  - el estado dicho solo con un color.
 *
 * Lo que hace cumplir la BASE (que solo la mande el alumno, que cada documento
 * sea de SU carpeta y exista, que la contesten solo sus profesores,
 * coordinación o supervisión, que otro profesor no vea nada, que no se mande
 * dos veces) se comprobó impersonando roles en SQL: acá el cliente es de
 * mentira.
 *
 * Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
 *       node herramientas/verificar-justificaciones.js
 */
const fs = require("fs");
const { chromium } = require("./lib/playwright-con-sesion");
const { instalarAvisos, mensajesVisibles } = require("./lib/avisos-prueba.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const ALUMNA = { id: "a-1", role: "alumno", is_admin: false };
const PROFE = { id: "p-1", role: "profesor", is_admin: false };

const XSS = '<img src=x onerror="window.__xss=1">Ana';
// Un PNG de 1×1: lo que baja el doble de Storage, para ver que la foto se ve.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function clienteFalso(datos, yo) {
  return `
window.__rpc = []; window.__subidas = []; window.__borradas = []; window.__consultas = [];
(function () {
  const D = ${JSON.stringify(datos)};
  const YO = ${JSON.stringify(yo)};
  const PNG = ${JSON.stringify(PNG)};
  function resolver(data, anotar) {
    const r = {
      range(a, b) { if (anotar) anotar.rango = [a, b]; return r; },
      then(res, rej) { return Promise.resolve({ data: data, error: null }).then(res, rej); },
    };
    return r;
  }
  function tabla(nombre) {
    const cond = [], dist = []; let unica = false, cuenta = false, rango = null;
    const b = {
      select(c, o) { if (o && o.head) cuenta = true; return b; },
      order() { return b; }, limit() { return b; }, in() { return b; }, is() { return b; },
      eq(c, v) { cond.push([c, v]); return b; },
      neq(c, v) { dist.push([c, v]); return b; },
      range(a, z) { rango = [a, z]; return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) {
        window.__consultas.push({ tabla: nombre, cond, dist, rango, cuenta });
        let d = nombre === "profiles" ? [YO] : (D.tablas[nombre] || []);
        // Los filtros se aplican de verdad, en el resolver.
        cond.forEach(([c, v]) => { d = d.filter((f) => f[c] === v); });
        dist.forEach(([c, v]) => { d = d.filter((f) => f[c] !== v); });
        if (cuenta) return Promise.resolve({ data: null, count: d.length, error: null }).then(res, rej);
        if (unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: YO.id }, access_token: "t" } } }) },
    from: tabla,
    storage: { from: (bucket) => ({
      upload(ruta, blob, op) { window.__subidas.push({ bucket, ruta, tipo: op && op.contentType, upsert: op && op.upsert }); return Promise.resolve({ data: { path: ruta }, error: null }); },
      remove(rutas) { window.__borradas.push({ bucket, rutas }); return Promise.resolve({ data: [], error: null }); },
      download(ruta) {
        if (/roto/.test(ruta)) return Promise.resolve({ data: null, error: { message: "no" } });
        const bin = Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0));
        return Promise.resolve({ data: new Blob([bin], { type: "image/png" }), error: null });
      },
    }) },
    rpc(n, args) {
      const anotada = { n: n, args: args || null };
      window.__rpc.push(anotada);
      if (n === "mis_funciones_coordinacion") return resolver(null);
      if (n === "justificaciones_recibidas") {
        let d = D.recibidas || [];
        if (args.p_estado) d = d.filter((x) => x.estado === args.p_estado);
        const total = d.length;
        d = d.slice(args.p_desde, args.p_desde + args.p_limite).map((x) => Object.assign({}, x, { total }));
        return resolver(d, anotada);
      }
      if (n === "retirar_justificacion") {
        const j = (D.tablas.justificaciones_ausencia || []).find((x) => x.id === args.p_id);
        return resolver(j ? j.adjuntos : [], anotada);
      }
      return resolver(D.rpc[n] !== undefined ? D.rpc[n] : null, anotada);
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
function cierto(nombre, valor, detalle) {
  if (!valor) { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
  else console.log("  ✓ " + nombre);
}

async function abrir(browser, datos, yo, esperar) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await instalarAvisos(page);
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(datos, yo) }));
  await page.goto(BASE + "/justificaciones.html", { waitUntil: "networkidle" });
  await page.waitForSelector(esperar, { timeout: 15000 });
  return { page, errores, ctx };
}

const seVe = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? (el.checkVisibility() ? "sí" : "no") : "no existe";
}, sel);
const llamadas = (page, n) => page.evaluate((x) => window.__rpc.filter((r) => r.n === x), n);
const hoyCR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });

async function pruebaAlumna(browser) {
  console.log("\nLa alumna justifica una ausencia");
  const datos = {
    tablas: { justificaciones_ausencia: [
      // Llegan desordenadas: la pantalla las pide ordenadas a la base, y acá
      // el doble las devuelve en el orden en que la base las daría.
      { id: "j-2", student_id: "a-1", fecha_desde: "2026-09-15", fecha_hasta: "2026-09-17", motivo: "salud", detalle: "Gripe", adjuntos: ["a-1/abcdefgh-1/constancia.pdf"], estado: "pendiente", respuesta: null, revisada_por: null, revisada_por_nombre: null, revisada_en: null, created_at: "2026-09-18T15:00:00Z" },
      { id: "j-1", student_id: "a-1", fecha_desde: "2026-08-20", fecha_hasta: "2026-08-20", motivo: "viaje", detalle: "Viaje con mi familia", adjuntos: [], estado: "no_aceptada", respuesta: "<b>Avisa antes</b>", revisada_por: "p-1", revisada_por_nombre: "Bruno <i>Mena</i>", revisada_en: "2026-08-21T15:00:00Z", created_at: "2026-08-20T20:00:00Z" },
      { id: "j-otro", student_id: "a-9", fecha_desde: "2026-09-01", fecha_hasta: "2026-09-01", motivo: "otro", detalle: "De otra alumna", adjuntos: [], estado: "pendiente", created_at: "2026-09-01T15:00:00Z" },
    ] },
    rpc: { encuesta_mis_profesores: [{ id: "p-1", nombre: "Bruno Mena", respondida: false }], justificar_ausencia: "j-nueva" },
  };
  const { page, errores, ctx } = await abrir(browser, datos, ALUMNA, "#app-alumno:not(.hidden)");

  igual("el lado del equipo no se ve", await seVe(page, "#app-equipo"), "no");
  igual("el día arranca en hoy (hora de Costa Rica)", await page.inputValue("#desde"), hoyCR());
  igual("los motivos, escritos", await page.evaluate(() => [...document.querySelectorAll("#motivo option")].map((o) => o.value)),
    ["", "salud", "cita", "familiar", "estudios", "viaje", "otro"]);
  igual("dice a quién le llega, con nombre", await page.textContent("#a-quien"),
    "Le llega a tu profesor, Bruno Mena, y a la coordinación y la supervisión de tu academia.");
  const consulta = await page.evaluate(() => window.__consultas.find((c) => c.tabla === "justificaciones_ausencia"));
  igual("pide solo las suyas, y no enteras", [consulta.cond, consulta.rango], [[["student_id", "a-1"]], [0, 199]]);
  igual("sus justificaciones, agrupadas por mes", await page.evaluate(() => [...document.querySelectorAll("#mias h3")].map((h) => h.textContent)),
    ["Septiembre de 2026", "Agosto de 2026"]);
  igual("el estado va escrito", await page.evaluate(() => [...document.querySelectorAll("#mias article")].map((a) => a.querySelector("span.rounded-full").textContent)),
    ["⏳ Por revisar", "❌ No aceptada"]);
  cierto("varios días dice cuántos", /^Del 15 de se(p)?tiembre al 17 de se(p)?tiembre de 2026 \(3 días\)$/.test(await page.evaluate(() => document.querySelector("#mias article h4").textContent)),
    await page.evaluate(() => document.querySelector("#mias article h4").textContent));
  igual("la respuesta y quién contestó van como texto", await page.evaluate(() => {
    const a = document.querySelectorAll("#mias article")[1];
    return [a.querySelector(".border-l-4 p").textContent.startsWith("Contestó Bruno <i>Mena</i> el"), a.querySelector(".border-l-4 p + p").textContent];
  }), [true, "<b>Avisa antes</b>"]);
  igual("solo la que nadie contestó se puede retirar", await page.evaluate(() => [...document.querySelectorAll("#mias article")].map((a) => !!a.querySelector("button"))), [true, false]);

  // Sin texto ni documento: no viaja nada.
  await page.selectOption("#motivo", "salud");
  await page.check("#acepto-datos");
  await page.click("#enviar");
  await page.waitForTimeout(200);
  igual("sin texto ni documento no llama a la base", (await llamadas(page, "justificar_ausencia")).length, 0);
  igual("y lo dice", await page.textContent("#msg"), "Escribe qué pasó o adjunta un documento.");
  igual("con el foco en lo que falta", await page.evaluate(() => document.activeElement.id), "detalle");

  // Un documento que no se recibe: se dice antes, con su nombre.
  await page.fill("#detalle", "  Tuve fiebre y el médico me mandó reposo.  ");
  await page.setInputFiles("#archivos", [
    { name: "Constancia médica.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") },
  ]);
  igual("el documento elegido se lista", await page.textContent("#archivos-estado"), "1 archivo elegido.");

  // Sin aceptar la privacidad: no se sube nada.
  await page.uncheck("#acepto-datos");
  await page.click("#enviar");
  await page.waitForTimeout(200);
  igual("sin aceptar la privacidad no sube nada", await page.evaluate(() => window.__subidas.length), 0);
  igual("ni llama a la base", (await llamadas(page, "justificar_ausencia")).length, 0);

  // Varios días.
  await page.check("#acepto-datos");
  await page.check("#varios");
  igual("marcar varios días abre el último día", await seVe(page, "#hasta"), "sí");
  await page.fill("#desde", "2026-09-22");
  await page.fill("#hasta", "2026-09-21");
  await page.click("#enviar");
  await page.waitForTimeout(200);
  igual("un último día antes del primero no viaja", (await llamadas(page, "justificar_ausencia")).length, 0);
  await page.fill("#hasta", "2026-09-23");
  await page.click("#enviar");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "justificar_ausencia"));
  await page.waitForTimeout(300);
  const subidas = await page.evaluate(() => window.__subidas);
  igual("sube UNA vez, a su carpeta del bucket privado, sin pisar nada", subidas.map((s) => [s.bucket, /^a-1\/[A-Za-z0-9-]{8,40}\/Constancia-medica\.pdf$/.test(s.ruta), s.tipo, s.upsert]),
    [["justificaciones", true, "application/pdf", false]]);
  const env = await llamadas(page, "justificar_ausencia");
  igual("manda exactamente lo escrito, con la ruta que subió", env.map((e) => e.args), [{
    p_desde: "2026-09-22", p_hasta: "2026-09-23", p_motivo: "salud", p_detalle: "Tuve fiebre y el médico me mandó reposo.",
    p_adjuntos: [subidas[0].ruta], p_privacidad: await page.evaluate(() => window.LegalVersion.PRIVACIDAD),
  }]);
  igual("queda limpio para otra", [await page.inputValue("#detalle"), await page.textContent("#archivos-estado"), await seVe(page, "#hasta")], ["", "", "no"]);
  igual("y dice que salió", await page.textContent("#msg"), "✅ Enviada. Ya les llegó el aviso.");

  // Retirar la pendiente: pide confirmar, y borra sus documentos.
  await page.click("#mias article button");
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "retirar_justificacion"));
  await page.waitForTimeout(300);
  igual("retira ESA", (await llamadas(page, "retirar_justificacion")).map((r) => r.args), [{ p_id: "j-2" }]);
  igual("y borra sus documentos del bucket", await page.evaluate(() => window.__borradas), [{ bucket: "justificaciones", rutas: ["a-1/abcdefgh-1/constancia.pdf"] }]);
  igual("sin inyección", await page.evaluate(() => window.__xss || 0), 0);
  igual("sin errores en la página", errores, []);
  await ctx.close();
}

async function pruebaProfesor(browser) {
  console.log("\nEl profesor las lee y las contesta");
  const fila = (o) => Object.assign({ grupo: null, fecha_hasta: o.fecha_desde, detalle: "", adjuntos: [], respuesta: null, revisada_por_nombre: null, revisada_en: null, created_at: "2026-09-20T15:00:00Z" }, o);
  const recibidas = [
    fila({ id: "r-1", student_id: "a-1", alumno: XSS, grupo: "SJ", fecha_desde: "2026-09-25", motivo: "cita", detalle: "<script>window.__xss=2</script>Cita en el EBAIS", adjuntos: ["a-1/abcdefgh-1/foto.jpg", "a-1/abcdefgh-2/roto.pdf"], estado: "pendiente" }),
    fila({ id: "r-2", student_id: "a-2", alumno: "Bruno", fecha_desde: "2026-09-10", motivo: "estudios", detalle: "Examen del colegio", estado: "pendiente" }),
    fila({ id: "r-3", student_id: "a-3", alumno: "Carla", fecha_desde: "2026-08-30", fecha_hasta: "2026-09-01", motivo: "familiar", detalle: '=HYPERLINK("http://malo.example";"Clic")', estado: "pendiente" }),
    fila({ id: "r-4", student_id: "a-4", alumno: "Dani", fecha_desde: "2026-08-02", motivo: "salud", detalle: "Gripe", estado: "aceptada", respuesta: "Que te mejores", revisada_por_nombre: "Profe Uno", revisada_en: "2026-08-03T15:00:00Z" }),
  ];
  const tablas = { justificaciones_ausencia: recibidas.map((r) => ({ id: r.id, student_id: r.student_id, estado: r.estado })).concat([{ id: "propia", student_id: "p-1", estado: "pendiente" }]) };
  const { page, errores, ctx } = await abrir(browser, { tablas, recibidas, rpc: {} }, PROFE, "#lista article");

  igual("el lado del alumno no se ve", await seVe(page, "#app-alumno"), "no");
  igual("los números, sin contar las propias", await page.evaluate(() => ["pendiente", "aceptada", "no_aceptada"].map((e) => document.getElementById("n-" + e).textContent)), ["3", "1", "0"]);
  const pedida = (await llamadas(page, "justificaciones_recibidas"))[0];
  igual("arranca por las que esperan respuesta, de a una página", pedida.args, { p_estado: "pendiente", p_busqueda: null, p_limite: 50, p_desde: 0 });
  igual("agrupadas por mes, de la más reciente a la más vieja", await page.evaluate(() => [...document.querySelectorAll("#lista h2")].map((h) => h.textContent)),
    ["Septiembre de 2026", "Agosto de 2026"]);
  igual("el nombre y lo que escribió van como texto", await page.evaluate(() => {
    const a = document.querySelector("#lista article");
    return [a.querySelector("h3").textContent, a.querySelector("p.whitespace-pre-line").textContent];
  }), [XSS, "<script>window.__xss=2</script>Cita en el EBAIS"]);
  igual("el filtro elegido lo dice", await page.evaluate(() => [...document.querySelectorAll("#filtros button")].map((b) => b.getAttribute("aria-pressed"))), ["true", "false", "false", "false"]);
  await page.waitForFunction(() => document.querySelector("#lista article img") && document.querySelector("#lista article img").naturalWidth > 0, null, { timeout: 5000 }).catch(() => {});
  igual("la foto se ve de verdad", await page.evaluate(() => document.querySelector("#lista article img").naturalWidth), 1);
  cierto("el documento que no se pudo abrir lo dice", /No se pudo abrir «roto\.pdf»/.test(await page.textContent("#lista article")));

  // Contestar: viaja con el id de ESA justificación y la respuesta sin espacios.
  await page.fill("#resp-r-2", "  Suerte en el examen  ");
  await page.locator("#lista article").nth(1).locator("button", { hasText: "Aceptar la justificación" }).click();
  await page.waitForFunction(() => window.__rpc.some((r) => r.n === "responder_justificacion"));
  igual("la respuesta viaja con el id de esa", (await llamadas(page, "responder_justificacion")).map((r) => r.args),
    [{ p_id: "r-2", p_estado: "aceptada", p_respuesta: "Suerte en el examen" }]);
  await page.waitForTimeout(300);
  cierto("dice que al alumno le llegó", /Bruno ya le llegó el aviso/.test(await mensajesVisibles(page)), await mensajesVisibles(page));

  // Todas: la contestada trae quién contestó y se puede cambiar.
  await page.click("#filtros button:nth-child(4)");
  await page.waitForFunction(() => document.querySelectorAll("#lista article").length === 4);
  igual("«Todas» no filtra por estado", (await llamadas(page, "justificaciones_recibidas")).pop().args.p_estado, null);
  const ultima = page.locator("#lista article").nth(3);
  cierto("la contestada dice quién y qué", /Contestó Profe Uno el .*Que te mejores/.test(await ultima.textContent()));
  const cambiar = ultima.locator("button", { hasText: "Cambiar la respuesta" });
  igual("su formulario empieza cerrado", [await cambiar.getAttribute("aria-expanded"), await seVe(page, "#resp-r-4")], ["false", "no"]);
  await cambiar.click();
  igual("y al abrirlo lo dice", [await cambiar.getAttribute("aria-expanded"), await seVe(page, "#resp-r-4"), await page.inputValue("#resp-r-4")], ["true", "sí", "Que te mejores"]);

  // Excel: lo que cumple el filtro puesto (Todas), con las fórmulas desarmadas.
  const [descarga] = await Promise.all([page.waitForEvent("download"), page.click("#excel")]);
  const csv = fs.readFileSync(await descarga.path(), "utf8");
  cierto("se llama por lo que trae", /^justificaciones-todas-\d{4}-\d{2}-\d{2}\.csv$/.test(descarga.suggestedFilename()), descarga.suggestedFilename());
  igual("lleva BOM y punto y coma, que es lo que Excel en español abre de un doble clic",
    [csv.charCodeAt(0), csv.split("\r\n")[0].slice(1)],
    [0xfeff, '"Estudiante";"Grupo";"Desde";"Hasta";"Días";"Motivo";"Qué pasó";"Documentos";"Estado";"Respuesta";"Contestó";"Contestada el";"Enviada el"']);
  const lineas = csv.slice(1).split("\r\n").slice(1);
  igual("una fila por justificación del filtro, en el orden de la lista", lineas.length, 4);
  igual("la de Ana, con sus documentos contados y su nombre tal cual",
    lineas[0], '"<img src=x onerror=""window.__xss=1"">Ana";"SJ";"2026-09-25";"2026-09-25";"1";"Cita médica o trámite";"<script>window.__xss=2</script>Cita en el EBAIS";"2 archivos adjuntos";"Por revisar";"";"";"";"2026-09-20 09:00"');
  igual("lo que escribió Carla como fórmula queda como texto: Excel no lo ejecuta",
    lineas[2], '"Carla";"";"2026-08-30";"2026-09-01";"3";"Asunto familiar";"\'=HYPERLINK(""http://malo.example"";""Clic"")";"Ninguno";"Por revisar";"";"";"";"2026-09-20 09:00"');
  igual("la contestada trae quién, qué y cuándo", lineas[3].split(";").slice(8).join(";"),
    '"Aceptada";"Que te mejores";"Profe Uno";"2026-08-03 09:00";"2026-09-20 09:00"');
  igual("la pidió con el filtro puesto, de a 200", (await llamadas(page, "justificaciones_recibidas")).pop().args,
    { p_estado: null, p_busqueda: null, p_limite: 200, p_desde: 0 });
  igual("sin inyección", await page.evaluate(() => window.__xss || 0), 0);
  igual("sin errores en la página", errores, []);
  await ctx.close();

  console.log("\nMuchas: se piden de a cincuenta");
  const muchas = Array.from({ length: 60 }, (_, i) => fila({ id: "m-" + i, student_id: "a-" + i, alumno: "Alumno " + i, fecha_desde: "2026-09-" + String(28 - (i % 28)).padStart(2, "0"), motivo: "otro", detalle: "x", estado: "pendiente" }));
  const m = await abrir(browser, { tablas: { justificaciones_ausencia: [] }, recibidas: muchas, rpc: {} }, PROFE, "#lista article");
  igual("se ven 50 y ofrece ver más", [await m.page.evaluate(() => document.querySelectorAll("#lista article").length), await seVe(m.page, "#mas")], [50, "sí"]);
  await m.page.click("#mas");
  await m.page.waitForFunction(() => document.querySelectorAll("#lista article").length === 60);
  igual("la segunda página sigue donde quedó", (await llamadas(m.page, "justificaciones_recibidas")).pop().args.p_desde, 50);
  igual("y ya no ofrece más", await seVe(m.page, "#mas"), "no");
  await m.ctx.close();

  console.log("\nExcel con más de lo que cabe en un pedido");
  const cientos = Array.from({ length: 250 }, (_, i) => fila({ id: "x-" + i, student_id: "a-" + i, alumno: "Alumno " + i, fecha_desde: "2026-09-01", motivo: "otro", detalle: "x", estado: "pendiente" }));
  const x = await abrir(browser, { tablas: { justificaciones_ausencia: [] }, recibidas: cientos, rpc: {} }, PROFE, "#lista article");
  const [bajada] = await Promise.all([x.page.waitForEvent("download"), x.page.click("#excel")]);
  const filasX = fs.readFileSync(await bajada.path(), "utf8").slice(1).split("\r\n").length - 1;
  igual("baja las 250, no las 50 que se ven", filasX, 250);
  igual("pidiéndolas en dos tandas, sin cruzar el techo de mil",
    (await llamadas(x.page, "justificaciones_recibidas")).filter((r) => r.args.p_limite === 200).map((r) => r.args.p_desde), [0, 200]);
  igual("sin errores en la página", x.errores, []);
  await x.ctx.close();

  console.log("\nSin nada por revisar");
  const v = await abrir(browser, { tablas: { justificaciones_ausencia: [] }, recibidas: [], rpc: {} }, PROFE, "#app-equipo:not(.hidden)");
  await v.page.waitForFunction(() => document.getElementById("lista-estado").textContent !== "Cargando…");
  cierto("lo dice", /No hay justificaciones por revisar/.test(await v.page.textContent("#lista-estado")));
  await v.ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAlumna(browser);
    await pruebaProfesor(browser);
  } catch (e) {
    console.log("  ✗ " + (e.stack || e));
    fallos += 1;
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
