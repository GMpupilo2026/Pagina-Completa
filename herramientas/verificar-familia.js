/* La página de la familia (familia.html, js/familia.js y la migración
 * 20261118175852_pagina_de_la_familia.sql).
 *
 * Lo que se rompe acá no da ningún error y le llega a una familia: una falta
 * que no fue, la página de otro alumno abierta con la sesión de quien mira,
 * un estado que solo se distingue por el color, un aviso de ausencia que no
 * pasó por el freno. Dos partes:
 *
 *   1. La base, leída de la migración: quién puede ejecutar cada función, la
 *      tabla sin permisos y con auditoría, el freno antes del insert, la
 *      casilla de privacidad, las faltas «seguras» y la identidad vaciada.
 *   2. La página, en un navegador, con la base doblada por la red: sin enlace
 *      y con un enlace apagado; todo lo que pinta con sus estados escritos y
 *      su contraste medido; que el pedido va SIN la sesión de quien mira; el
 *      aviso de ausencia (sin la casilla no sale, con ella manda lo que toca);
 *      el texto de una persona como texto; el celular sin desbordar.
 *
 * Uso:  node herramientas/verificar-todo.js familia
 *       FOTOS=/tmp/fotos node herramientas/verificar-todo.js familia   (deja capturas)
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const TOKEN = "ab".repeat(32);

let fallos = 0;
const mal = (m, d) => { console.log("  ✗ " + m + (d ? "\n      " + String(d).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, d) => (c ? bien(m) : mal(m, d));

function laBase() {
  console.log("=== La base ===");
  const sql = fs.readFileSync(path.join(RAIZ, "supabase/migraciones/20261118175852_pagina_de_la_familia.sql"), "utf8");
  ok(/alter table public\.familia_enlaces enable row level security/.test(sql) && /revoke all on public\.familia_enlaces from anon, authenticated/.test(sql) && !/create policy/.test(sql),
    "la tabla de los enlaces tiene RLS, ningún permiso para anon ni authenticated y ninguna política: solo la tocan las funciones");
  ok(/create trigger auditar[^;]*on public\.familia_enlaces[^;]*interno\.auditar\(\)/.test(sql), "y lleva el trigger de auditoría (reparte acceso)");
  ok(/token ~ '\^\[0-9a-f\]\{64\}\$'/.test(sql) && /gen_random_uuid\(\)::text \|\| gen_random_uuid\(\)::text/.test(sql), "el token son 64 hexadecimales al azar");
  const paraAnon = [...sql.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to anon/g)].map((m) => m[1]).sort();
  ok(paraAnon.join() === "familia_avisar_ausencia,familia_pagina", "sin cuenta solo se pueden llamar familia_pagina y familia_avisar_ausencia", paraAnon.join());
  for (const f of ["familia_enlace", "familia_enlace_apagar", "familia_enlaces_de"]) {
    ok(new RegExp("revoke execute on function public\\." + f + "\\([^)]*\\) from public, anon").test(sql), f + "() no es para quien no tiene cuenta");
  }
  const cuerpo = (nombre) => { const a = sql.indexOf("function public." + nombre + "("); return sql.slice(a, sql.indexOf("$$;", a)); };
  const puedo = sql.slice(sql.indexOf("function interno.familia_alumno_si_puedo"), sql.indexOf("$$;", sql.indexOf("function interno.familia_alumno_si_puedo")));
  ok(/coalesce\(\s*\(select p\.is_admin from public\.profiles p where p\.id = \(select auth\.uid\(\)\)\)\s*or public\.soy_profesor_de\(e\.student_id\), false\)/.test(puedo), "encender, cambiar o apagar el enlace: solo un profesor del alumno o quien administra, con el permiso envuelto en coalesce");
  ok(/interno\.familia_alumno_si_puedo\(p_encargado\)/.test(cuerpo("familia_enlace")) && /interno\.familia_alumno_si_puedo\(p_encargado\) is null/.test(cuerpo("familia_enlace_apagar")), "y las dos funciones lo preguntan antes de tocar nada");
  const pag = cuerpo("familia_pagina");
  ok(/set_config\('request\.jwt\.claims', '', true\)/.test(pag) && pag.indexOf("set_config('request.jwt.claims'") < pag.indexOf("informe_de_alumno("), "familia_pagina vacía la identidad del pedido antes de armar el informe: ahí manda el token");
  ok(/ca\.student_id is not null\s+or \(cs\.solo_asignados and exists/.test(pag), "las faltas son solo las seguras: fue, o había lista, estaba en ella y no fue");
  ok(/interno\.profesores_de\(v_alumno\)/.test(pag) && /interno\.horarios_del_alumno\(v_alumno\)/.test(pag), "las clases y los horarios se preguntan con profesores_de() y horarios_del_alumno(), no mirando las tablas");
  ok(!/'token'|f\.token,|email/.test(pag.replace(/where f\.token = p_token/g, "").replace(/where token = p_token/g, "")), "y no devuelve el token ni el correo de nadie");
  const av = cuerpo("familia_avisar_ausencia");
  const freno = av.indexOf("interno.frenar_envio_publico('familia_ausencia'"), insert = av.indexOf("insert into public.justificaciones_ausencia");
  ok(freno > 0 && insert > freno && /v_freno is not null/.test(av), "avisar una ausencia pasa por el freno de los envíos sin cuenta antes de guardar");
  ok(av.indexOf("interno.version_legal_valida(p_privacidad)") > 0 && av.indexOf("interno.version_legal_valida(p_privacidad)") < insert, "y exige la versión vigente de la política de privacidad");
  ok(/p_fecha < hoy or p_fecha > hoy \+ 28/.test(av) && /'Avisada por su familia \('/.test(av), "de hoy a 28 días, y queda escrito que la avisó la familia");
  ok(/when ''familia_ausencia'' then/.test(sql), "el freno aprende el tipo nuevo");
}

function elCodigo() {
  console.log("\n=== El código de la página ===");
  const js = fs.readFileSync(path.join(RAIZ, "js/familia.js"), "utf8");
  const html = fs.readFileSync(path.join(RAIZ, "familia.html"), "utf8");
  const sinComentarios = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(!/window\.sb\b|\bsb\.rpc\(/.test(sinComentarios) && /Authorization: "Bearer " \+ clave/.test(js), "los pedidos van con fetch y la clave pública, nunca con el cliente que lleva la sesión");
  ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(sinComentarios), "nada se escribe con innerHTML: lo que escribe una persona va como texto");
  ok(!/\balert\(|\bconfirm\(|\bprompt\(/.test(sinComentarios), "sin alert(), confirm() ni prompt()");
  ok(/<meta name="robots" content="noindex">/.test(html), "la página no se indexa");
  ok(/id="fam-aus-acepto"/.test(html) && /href="privacidad\.html"/.test(html.slice(html.indexOf("fam-aus-acepto"), html.indexOf("fam-aus-acepto") + 500)), "el formulario lleva su casilla de consentimiento con enlace a privacidad.html");
  ok(!/<script(?![^>]*\bsrc=)[^>]*>(?![\s\S]{0,40}localStorage|[\s\S]{0,80}theme)/.test(html.slice(html.indexOf("<main"))), "sin código escrito dentro de la página");
  const inf = fs.readFileSync(path.join(RAIZ, "js/informes.js"), "utf8");
  ok(/sb\.rpc\("familia_enlaces_de"/.test(inf) && /sb\.rpc\("familia_enlace", \{ p_encargado: e\.id, p_renovar/.test(inf) && /sb\.rpc\("familia_enlace_apagar"/.test(inf), "Informes enciende, cambia y apaga el enlace por las funciones de la base");
  ok(/Avisos\.confirmar\([^)]*¿Cambiar el enlace\?|titulo: "¿Cambiar el enlace\?"/.test(inf) && /aceptar: "Apagar la página"/.test(inf), "y cambiar o apagar se confirman con un botón que dice lo que hace");
  const priv = fs.readFileSync(path.join(RAIZ, "privacidad.html"), "utf8");
  ok(/<strong>La página de la familia:<\/strong>/.test(priv), "la política de privacidad dice qué ve y qué guarda la página de la familia");
}

const DATOS = () => {
  const hoy = new Date();
  const en = (dias, h) => { const d = new Date(hoy.getTime() + dias * 86400000); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
  const dia = (dias) => new Date(hoy.getTime() + dias * 86400000).toISOString().slice(0, 10);
  return {
    ok: true, al_dia: hoy.toISOString(), encargado: "Mamá de prueba",
    alumno: { nombre: "Sofía <b>Méndez</b>", grupo: "Intermedio B" },
    informe: {
      respuestas: 48, correctas: 40, dias_activos: 4, dias_del_periodo: 7, minutos_ejercicios: 95, minutos_clase: 90,
      comparacion: { esta: 48, anterior: 31 },
      diagnostico: { nivel: "Intermedio", fecha: dia(-20) },
      plan: { rutina: "20 minutos, cuatro días por semana.", areas: [{ titulo: "Finales de torre", objetivo: "ganar con un peón de más" }] },
      mensajes: [{ texto: "Esta semana le costaron los finales <script>window.__inyectado = 1</script>, y es normal.", autor: "Andrés Quirós", fecha: dia(-2) }],
    },
    proximas: [{ inicio: en(2, 22), fin: en(2, 23), fecha: dia(2), titulo: "Finales", modalidad: "virtual", profesor: "Andrés Quirós" },
      { inicio: en(6, 22), fin: en(6, 23), fecha: dia(6), titulo: null, modalidad: "presencial", profesor: "Andrés Quirós" }],
    asistencia: [{ inicio: en(-1, 22), presente: true, tarde: 0, justificada: false }, { inicio: en(-5, 22), presente: false, tarde: 0, justificada: true },
      { inicio: en(-8, 22), presente: true, tarde: 15, justificada: false }, { inicio: en(-12, 22), presente: false, tarde: 0, justificada: false }],
    tareas: [{ titulo: "Finales de torre: 12 posiciones", vence_at: en(2, 20), renglones: 12, cumplidos: 5, situacion: "pendiente" },
      { titulo: "Mates en dos", vence_at: en(-6, 20), renglones: 10, cumplidos: 10, situacion: "completada" },
      { titulo: "Anotar una partida", vence_at: en(-12, 20), renglones: 1, cumplidos: 0, situacion: "vencida" }],
    cobros: [{ concepto: "Mensualidad de diciembre", monto: 25000, moneda: "CRC", vence: dia(12), saldo: 25000, situacion: "pendiente", periodo_inicio: "2026-12-01", periodo_fin: "2026-12-31", ultimo_pago: null },
      { concepto: "Mensualidad de noviembre", monto: 25000, moneda: "CRC", vence: dia(-16), saldo: 0, situacion: "pagado", periodo_inicio: "2026-11-01", periodo_fin: "2026-11-30", ultimo_pago: dia(-16) }],
    recibos: [{ numero: "R-AI-2026-0412", fecha: dia(-16), total: 25000, moneda: "CRC", metodo: "SINPE Móvil" }],
    avisos: [{ desde: dia(-5), hasta: dia(-5), motivo: "cita", estado: "aceptada" }],
  };
};

// Contraste WCAG entre el color del texto y el fondo real de un elemento.
const CONTRASTE = (sel) => `(() => {
  const lum = (c) => { const v = c.match(/[\\d.]+/g).slice(0, 3).map((x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  return [...document.querySelectorAll(${JSON.stringify(sel)})].map((n) => {
    const cs = getComputedStyle(n);
    let f = n, fondo = "rgba(0, 0, 0, 0)";
    while (f && /rgba\\(0, 0, 0, 0\\)|transparent/.test(fondo)) { fondo = getComputedStyle(f).backgroundColor; f = f.parentElement; }
    const a = lum(cs.color), b = lum(fondo);
    return { texto: n.textContent.trim(), r: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  });
})()`;

async function abrir(browser, opciones) {
  const o = opciones || {};
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: o.viewport || { width: 1280, height: 1000 }, colorScheme: o.oscuro ? "dark" : "light" });
  const page = await ctx.newPage();
  const errores = [], pedidos = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/rest/v1/rpc/**", async (r) => {
    const req = r.request();
    const fn = req.url().split("/rpc/")[1].split("?")[0];
    const cuerpo = JSON.parse(req.postData() || "{}");
    pedidos.push({ fn, cuerpo, auth: req.headers().authorization || "", apikey: req.headers().apikey || "" });
    let resp;
    if (fn === "familia_pagina") resp = cuerpo.p_token === TOKEN && !o.apagado ? DATOS() : { ok: false, error: "enlace" };
    else if (fn === "familia_avisar_ausencia") resp = o.frenado ? { ok: false, error: "Ya avisaste varias ausencias hoy. Intenta mañana." } : { ok: true };
    else resp = null;
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(resp) });
  });
  if (o.conSesion) {
    // Una sesión de la Academia guardada en ese navegador, como la de un profe
    // que prueba el enlace: su identidad no puede salir en los pedidos.
    await page.addInitScript(() => {
      const s = { access_token: "TOKEN-DE-UN-PROFE", refresh_token: "x", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "profe@ejemplo.test" } };
      try { localStorage.setItem("sb-bgtijpimpcokxatxxbki-auth-token", JSON.stringify(s)); } catch (e) {}
    });
  }
  await page.goto(BASE + "/familia.html" + (o.hash == null ? "#t=" + TOKEN : o.hash), { waitUntil: "networkidle" });
  return { ctx, page, errores, pedidos };
}
const vis = (page, sel) => page.$eval(sel, (n) => n.checkVisibility()).catch(() => false);

async function laPagina(browser) {
  console.log("\n=== La página ===");
  // Sin enlace, y con uno apagado.
  let x = await abrir(browser, { hash: "" });
  ok(await vis(x.page, "#fam-error") && !(await vis(x.page, "#fam-pagina")) && x.pedidos.length === 0 && /enlace que te mandó su profe/.test(await x.page.textContent("#fam-error-texto")),
    "sin enlace no pide nada a la base y dice cómo se entra");
  await x.ctx.close();
  x = await abrir(browser, { apagado: true });
  ok(await vis(x.page, "#fam-error") && !(await vis(x.page, "#fam-pagina")) && /ya no sirve/.test(await x.page.textContent("#fam-error-texto")), "con un enlace apagado no muestra nada del alumno y dice que pida el nuevo");
  await x.ctx.close();

  // Con sesión de la Academia en el navegador: el pedido va sin ella.
  x = await abrir(browser, { conSesion: true });
  const p0 = x.pedidos.find((p) => p.fn === "familia_pagina");
  ok(p0 && p0.cuerpo.p_token === TOKEN && p0.auth === "Bearer " + p0.apikey && !/TOKEN-DE-UN-PROFE/.test(p0.auth),
    "aunque quien mira tenga sesión de la Academia, el pedido va con la clave pública y no con su identidad", p0 && p0.auth.slice(0, 40));
  const page = x.page;
  ok(await vis(page, "#fam-pagina") && !(await vis(page, "#fam-cargando")) && !(await vis(page, "#fam-error")), "con el enlace se ve la página");
  // Para mirar la pantalla y no solo el DOM: FOTOS=<carpeta> deja las capturas.
  if (process.env.FOTOS) await page.screenshot({ path: path.join(process.env.FOTOS, "familia-escritorio.png"), fullPage: true });
  const titulo = await page.textContent("#fam-titulo");
  ok(titulo === "Así va Sofía <b>Méndez</b>" && (await page.$$("#fam-titulo b")).length === 0 && !(await page.evaluate("window.__inyectado")),
    "el nombre y el mensaje del profe se pintan como texto: ni negritas ni código ajeno", titulo);
  const todo = await page.textContent("#fam-pagina");
  for (const [re, que] of [
    [/Próxima clase/, "la próxima clase"], [/En línea, con Andrés Quirós/, "con quién y cómo es"],
    [/48[\s\S]{0,40}ejercicios resueltos \(la semana anterior, 31\)/, "los ejercicios de la semana contra la anterior"], [/4 de 7/, "los días que practicó"],
    [/Practicó más que la semana pasada/, "el veredicto escrito"], [/20 minutos, cuatro días por semana/, "lo que su profe espera que practique"],
    [/Unas palabras de su profe, Andrés Quirós/, "las palabras del profe"], [/Finales de torre: ganar con un peón de más/, "en qué está trabajando"],
    [/lleva 5 de 12/, "el avance de la tarea"], [/Fue a 2 de 4 clases\. 2 faltas, una de ellas justificada\./, "el resumen de la asistencia"],
    [/Llegó 15 min tarde/, "la llegada tarde"], [/Pendiente de pago[\s\S]{0,10}₡\s?25[\s.,]?000/, "lo pendiente de pago, en colones"],
    [/Recibo R-AI-2026-0412/, "el recibo con su número"], [/no cobra ni pide datos de tarjetas/, "que la página no cobra"],
    [/Ausencias ya avisadas/, "las ausencias ya avisadas"], [/Este enlace es privado y es solo para la familia de Sofía/, "que el enlace es privado"],
  ]) ok(re.test(todo), "muestra " + que, re.test(todo) ? "" : todo.replace(/\s+/g, " ").slice(0, 300));
  const pastillas = await page.evaluate(CONTRASTE("#fam-pagina span.rounded-full"));
  const textos = pastillas.map((p) => p.texto);
  ok(["Pendiente", "Entregada", "No la entregó", "Presente", "Falta justificada", "Falta", "Pagado", "Aceptada"].every((t) => textos.includes(t)), "cada estado va escrito, no solo en color", textos.join(" | "));
  const flojas = pastillas.filter((p) => p.r < 4.5);
  ok(pastillas.length >= 8 && !flojas.length, "y con contraste AA medido contra su fondo (" + pastillas.length + " etiquetas, la menor " + Math.min(...pastillas.map((p) => p.r)).toFixed(1) + ":1)", flojas.map((p) => p.texto + " " + p.r.toFixed(2)).join(", "));
  const notas = await page.evaluate(CONTRASTE("#fam-pagina .text-brand-600"));
  ok(notas.length > 3 && notas.every((n) => n.r >= 4.5), "las notas chicas también (" + Math.min(...notas.map((n) => n.r)).toFixed(1) + ":1 la menor)", notas.filter((n) => n.r < 4.5).map((n) => n.texto.slice(0, 30) + " " + n.r.toFixed(2)).join(", "));

  // El aviso de ausencia.
  const opciones = await page.locator("#fam-aus-clase option").count();
  ok(opciones === 2 && await vis(page, "#fam-aus-con-lista") && !(await vis(page, "#fam-aus-sin-lista")), "el aviso ofrece sus próximas clases");
  await page.click("#fam-aus-boton");
  ok(!x.pedidos.some((p) => p.fn === "familia_avisar_ausencia") && /casilla de la política de privacidad/.test(await page.textContent("#fam-aus-msg")), "sin la casilla de privacidad no manda nada y lo dice");
  await page.check("#fam-aus-acepto");
  await page.selectOption("#fam-aus-motivo", "viaje");
  await page.fill("#fam-aus-nota", "Vuelve el lunes");
  const fecha = await page.inputValue("#fam-aus-clase");
  await page.click("#fam-aus-boton");
  await page.waitForFunction(() => /ya recibió el aviso/.test(document.getElementById("fam-aus-msg").textContent));
  const env = x.pedidos.find((p) => p.fn === "familia_avisar_ausencia");
  const legal = fs.readFileSync(path.join(RAIZ, "js/legal-version.js"), "utf8").match(/PRIVACIDAD:\s*"([^"]+)"/)[1];
  ok(env && env.cuerpo.p_token === TOKEN && env.cuerpo.p_fecha === fecha && /^\d{4}-\d\d-\d\d$/.test(fecha) && env.cuerpo.p_motivo === "viaje" && env.cuerpo.p_detalle === "Vuelve el lunes" && env.cuerpo.p_privacidad === legal,
    "con la casilla manda el token, el día de la clase, el motivo, la nota y la versión de la política que aceptó", JSON.stringify(env && env.cuerpo));
  ok(env && env.auth === "Bearer " + env.apikey, "y ese pedido tampoco lleva la sesión de quien mira");
  ok(x.errores.length === 0, "sin errores de JavaScript", x.errores.join(" | "));
  await x.ctx.close();

  x = await abrir(browser, { frenado: true });
  await x.page.check("#fam-aus-acepto");
  await x.page.click("#fam-aus-boton");
  await x.page.waitForFunction(() => document.getElementById("fam-aus-msg").textContent.length > 20 && !/Mandando/.test(document.getElementById("fam-aus-msg").textContent));
  ok(/Ya avisaste varias ausencias hoy/.test(await x.page.textContent("#fam-aus-msg")), "si la base lo frena, dice lo que la base dijo");
  await x.ctx.close();

  // En el celular y en oscuro.
  x = await abrir(browser, { viewport: { width: 380, height: 800 }, oscuro: true });
  if (process.env.FOTOS) await x.page.screenshot({ path: path.join(process.env.FOTOS, "familia-celular-oscuro.png"), fullPage: true });
  const ancho = await x.page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vista: window.innerWidth }));
  ok(ancho.doc <= ancho.vista + 1, "en un celular de 380 px la página no se desborda a lo ancho", ancho.doc + " > " + ancho.vista);
  const oscuras = await x.page.evaluate(CONTRASTE("#fam-pagina span.rounded-full, #fam-pagina .text-brand-600"));
  ok(oscuras.length > 10 && oscuras.every((n) => n.r >= 4.5), "y en modo oscuro todo sigue con contraste AA (" + Math.min(...oscuras.map((n) => n.r)).toFixed(1) + ":1 la menor)", oscuras.filter((n) => n.r < 4.5).map((n) => n.texto.slice(0, 30) + " " + n.r.toFixed(2)).join(", "));
  await x.ctx.close();
}

(async () => {
  try { laBase(); elCodigo(); } catch (e) { mal("la parte sin navegador se cayó", e.stack); }
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try { await laPagina(browser); } catch (e) { mal("la prueba de la página se cayó", e.stack); }
  finally { await browser.close(); }
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron" : "\n✓ Todo bien");
  process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
