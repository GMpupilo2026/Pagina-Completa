/* Comprueba, en un navegador de verdad y con un Supabase de mentira, lo que
   cobros.html manda y lo que pinta:

   1. Las dos caras de la página: quien coordina ve planes, suscripciones,
      cobros y morosidad; cualquier otra cuenta ve SOLO sus propios recibos.
   2. Que la página NO recalcule por su lado si algo está pagado o vencido:
      pinta la `situacion` que viene de la base (vista cobros_vista).
   3. Qué manda al crear un plan, al poner a un alumno en un plan, al registrar
      un pago y al anular un cobro.
   4. El CSV: punto y coma, BOM y los totales de cada fila.

   Lo que la base hace cumplir (la RLS, y que el estado se calcule y no se
   guarde) no se prueba acá: eso se comprobó en SQL. Esto es lo otro — que la
   página mande lo correcto y no invente números.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-cobros.js                                */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const HOY = new Date();
const dia = (n) => new Date(HOY.getTime() + n * 86400000).toISOString().slice(0, 10);

const ANA   = { id: "u-ana",   full_name: "Ana Rojas",  email: "ana@x.cr" };
const BRUNO = { id: "u-bruno", full_name: "Bruno Mena", email: "bruno@x.cr" };

const PLANES = [
  { id: "p-mes", nombre: "Mensualidad", monto: 25000, moneda: "CRC", periodicidad: "mensual", activo: true, descripcion: "Dos clases por semana", created_at: "2026-01-01T00:00:00Z" },
  { id: "p-usd", nombre: "Clase privada", monto: 40, moneda: "USD", periodicidad: "mensual", activo: false, descripcion: null, created_at: "2026-01-02T00:00:00Z" },
];
const SUSCRIPCIONES = [
  { id: "s-1", student_id: "u-ana", plan_id: "p-mes", inicio: "2026-06-01", dia_cobro: 5, descuento_pct: 10, activa: true },
];
// Las cuatro situaciones, ya calculadas por la base. La página solo las pinta.
const COBROS = [
  { id: "c-1", student_id: "u-ana",   consecutivo: "AI-2026-000001", concepto: "Mensualidad · setiembre 2026", periodo_inicio: "2026-09-01", periodo_fin: "2026-09-30", monto: 22500, pagado: 0,     saldo: 22500, moneda: "CRC", vence: dia(5),   situacion: "pendiente", dias_atraso: 0,  estado: "emitido" },
  { id: "c-2", student_id: "u-ana",   consecutivo: "AI-2026-000002", concepto: "Mensualidad · agosto 2026",    periodo_inicio: "2026-08-01", periodo_fin: "2026-08-31", monto: 22500, pagado: 10000, saldo: 12500, moneda: "CRC", vence: dia(-20), situacion: "vencido",   dias_atraso: 20, estado: "emitido" },
  { id: "c-3", student_id: "u-bruno", consecutivo: "AI-2026-000003", concepto: "Mensualidad · agosto 2026",    periodo_inicio: "2026-08-01", periodo_fin: "2026-08-31", monto: 25000, pagado: 25000, saldo: 0,     moneda: "CRC", vence: dia(-25), situacion: "pagado",    dias_atraso: 0,  estado: "emitido" },
  { id: "c-4", student_id: "u-bruno", consecutivo: "AI-2026-000004", concepto: "Mensualidad · julio 2026",     periodo_inicio: "2026-07-01", periodo_fin: "2026-07-31", monto: 25000, pagado: 0,     saldo: 25000, moneda: "CRC", vence: dia(-55), situacion: "anulado",   dias_atraso: 0,  estado: "anulado" },
];
const RESUMEN = [{ moneda: "CRC", cobrado_mes: 35000, pendiente: 22500, vencido: 12500, alumnos_morosos: 1 }];
const MOROSOS = [{ student_id: "u-ana", alumno: "Ana Rojas", correo: "ana@x.cr", grupo: "7A", moneda: "CRC", deuda: 12500, cobros: 1, dias_atraso: 20, vence_mas_viejo: dia(-20) }];

function clienteFalso(perfil, cobrosVisibles) {
  return `
window.__llamadas = [];
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const PERFIL = ${JSON.stringify(perfil)};
  const TABLAS = {
    profiles: [PERFIL],
    planes_cobro: ${JSON.stringify(PLANES)},
    suscripciones: ${JSON.stringify(SUSCRIPCIONES)},
    cobros_vista: ${JSON.stringify(COBROS)}.filter((c) => ${JSON.stringify(cobrosVisibles)}.includes(c.id)),
  };
  const RPC = {
    cobros_resumen: ${JSON.stringify(RESUMEN)},
    cobros_morosos: ${JSON.stringify(MOROSOS)},
    informes_resumen_alumnos: ${JSON.stringify([ANA, BRUNO])},
    generar_cobros: 3,
  };
  function constructor(filas, tabla) {
    let unica = false;
    const b = {
      select() { return b; }, eq() { return b; }, order() { return b; }, in() { return b; },
      limit() { return b; }, range() { return b; }, is() { return b; }, not() { return b; },
      insert(v) { window.__llamadas.push({ tabla, verbo: "insert", datos: v }); return b; },
      update(v) { window.__llamadas.push({ tabla, verbo: "update", datos: v }); return b; },
      upsert(v) { window.__llamadas.push({ tabla, verbo: "upsert", datos: v }); return b; },
      delete() { window.__llamadas.push({ tabla, verbo: "delete" }); return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        let d = filas;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: PERFIL.id }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(TABLAS[t] !== undefined ? TABLAS[t] : [], t),
    rpc: (n, args) => { window.__llamadas.push({ rpc: n, args: args || null });
                        return constructor(RPC[n] !== undefined ? RPC[n] : [], "rpc:" + n); },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
  // La Edge Function de recordatorios: se apunta qué mandó y se responde que sí.
  const fetchReal = window.fetch;
  window.fetch = function (url, opciones) {
    if (String(url).indexOf("/functions/v1/") !== -1) {
      const cuerpo = JSON.parse((opciones && opciones.body) || "{}");
      window.__llamadas.push({ funcion: cuerpo });
      return Promise.resolve(new Response(JSON.stringify({ ok: true, mandados: 2, correos: ["mama@x.cr", "ana@x.cr"] }),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return fetchReal.apply(this, arguments);
  };
  // Los prompt() de registrar un pago, en orden, y el confirm() de dar de baja.
  window.__respuestas = [];
  window.prompt = () => (window.__respuestas.length ? window.__respuestas.shift() : null);
  window.confirm = () => true;
  window.alert = () => {};
})();
`;
}

// Chromium en es-CR separa los miles con un espacio fino (U+202F), no con un
// punto, y otras versiones usan punto. Para que la prueba mida el número y no
// la tipografía, se le quitan los separadores antes de comparar.
const sinSeparadores = (t) => String(t).replace(/(\d)[.\u00a0\u202f\u2009 ](?=\d)/g, "$1");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function abrir(browser, perfil, cobrosVisibles) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(perfil, cobrosVisibles) }));
  await page.goto(BASE + "/cobros.html", { waitUntil: "networkidle" });
  return { page, errores };
}

const COORDINA = { id: "u-oscar", full_name: "Oscar Angulo", email: "oscar@x.cr", role: "profesor", es_coordinador: true, is_admin: false };
const ALUMNA   = { id: "u-ana",   full_name: "Ana Rojas",    email: "ana@x.cr",   role: "alumno",   es_coordinador: false, is_admin: false };

async function pruebaCoordinacion(browser) {
  console.log("\n=== Quien coordina ===");
  const { page, errores } = await abrir(browser, COORDINA, ["c-1", "c-2", "c-3", "c-4"]);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  const tarjetas = (await page.evaluate(() =>
    [...document.querySelectorAll("#tarjetas p")].map((p) => p.textContent.trim()))).map(sinSeparadores);
  igual("las cuatro tarjetas, en colones", tarjetas,
    ["₡35000", "cobrado este mes", "₡22500", "pendiente, aún al día", "₡12500", "vencido", "1", "alumno atrasado"]);

  // La página pinta la situación que vino de la base, sin recalcular nada.
  const etiquetas = await page.evaluate(() =>
    [...document.querySelectorAll("#cobros-lista .rounded-full")].map((e) => e.textContent.trim()));
  igual("una etiqueta por cobro, tal cual la base", etiquetas, ["Pendiente", "Vencido", "Pagado", "Anulado"]);

  // Botones solo donde tiene sentido: ni en el pagado ni en el anulado.
  const conBotones = await page.evaluate(() =>
    [...document.querySelectorAll("#cobros-lista > div")].map((d) => !!d.querySelector("button")));
  igual("botones solo en lo que queda por cobrar", conBotones, [true, true, false, false]);

  const filtro = async (v) => {
    await page.selectOption("#f-situacion", v);
    return page.evaluate(() => document.querySelectorAll("#cobros-lista > div").length);
  };
  igual("filtro: vencidos", await filtro("vencido"), 1);
  igual("filtro: pagados", await filtro("pagado"), 1);
  await filtro("");

  // -------- crear un plan
  await page.click('[data-ficha="planes"]');
  await page.fill("#p-nombre", "Mensualidad nueva");
  await page.fill("#p-monto", "30000");
  await page.selectOption("#p-periodicidad", "trimestral");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#p-guardar");
  await page.waitForTimeout(300);
  const plan = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "planes_cobro" && l.verbo === "insert"));
  igual("lo que manda al crear un plan",
    plan && { nombre: plan.datos.nombre, monto: plan.datos.monto, moneda: plan.datos.moneda, periodicidad: plan.datos.periodicidad },
    { nombre: "Mensualidad nueva", monto: 30000, moneda: "CRC", periodicidad: "trimestral" });

  // -------- poner a un alumno en un plan
  await page.click('[data-ficha="suscripciones"]');
  await page.selectOption("#s-alumno", "u-bruno");
  await page.fill("#s-dia", "10");
  await page.fill("#s-descuento", "25");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#s-guardar");
  await page.waitForTimeout(300);
  const sus = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "suscripciones" && l.verbo === "insert"));
  igual("lo que manda al poner a alguien en un plan",
    sus && { student_id: sus.datos.student_id, plan_id: sus.datos.plan_id, dia_cobro: sus.datos.dia_cobro, descuento_pct: sus.datos.descuento_pct },
    { student_id: "u-bruno", plan_id: "p-mes", dia_cobro: 10, descuento_pct: 25 });

  // La beca se ve en la lista: 25000 menos 10 % son 22.500.
  const textoSus = sinSeparadores(await page.evaluate(() => document.querySelector("#suscripciones-lista").textContent));
  igual("la beca sale aplicada en la lista", /₡22500/.test(textoSus) && /beca 10 %/.test(textoSus), "true");

  // -------- registrar un pago parcial
  await page.click('[data-ficha="cobros"]');
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["5000", "transferencia", "REF-99"]; });
  await page.click("#cobros-lista > div:nth-child(2) button");
  await page.waitForTimeout(300);
  const pago = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "pagos" && l.verbo === "insert"));
  igual("lo que manda al registrar un pago",
    pago && { cobro_id: pago.datos.cobro_id, monto: pago.datos.monto, metodo: pago.datos.metodo, referencia: pago.datos.referencia },
    { cobro_id: "c-2", monto: 5000, metodo: "transferencia", referencia: "REF-99" });

  // Un monto que no es número no se manda.
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["nada", "sinpe", ""]; });
  await page.click("#cobros-lista > div:nth-child(2) button");
  await page.waitForTimeout(300);
  igual("un monto que no es número no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "pagos").length), 0);

  // Un método inventado tampoco.
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["5000", "bitcoin", ""]; });
  await page.click("#cobros-lista > div:nth-child(2) button");
  await page.waitForTimeout(300);
  igual("un método desconocido no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "pagos").length), 0);

  // -------- anular
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["Se dio de baja"]; });
  await page.click("#cobros-lista > div:nth-child(1) button:nth-child(2)");
  await page.waitForTimeout(300);
  const anula = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "cobros" && l.verbo === "update"));
  igual("lo que manda al anular", anula && anula.datos, { estado: "anulado", anulado_motivo: "Se dio de baja" });

  // -------- morosidad y recordatorio
  await page.click('[data-ficha="morosidad"]');
  await page.waitForTimeout(200);
  const moroso = sinSeparadores(await page.evaluate(() => document.querySelector("#morosos-lista").textContent));
  igual("la morosidad dice cuánto y desde cuántos días",
    /Ana Rojas/.test(moroso) && /₡12500/.test(moroso) && /20 días de atraso/.test(moroso), "true");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#morosos-lista button");
  await page.waitForTimeout(400);
  igual("lo que manda «Recordar ahora»",
    await page.evaluate(() => (window.__llamadas.find((l) => l.funcion) || {}).funcion),
    { action: "recordar_ahora", student_id: "u-ana" });

  // -------- emitir los que falten
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#generar-btn");
  await page.waitForTimeout(400);
  igual("«Emitir los que falten» llama a generar_cobros",
    await page.evaluate(() => window.__llamadas.some((l) => l.rpc === "generar_cobros")), "true");

  // -------- CSV
  // blob.text() descarta el BOM por especificación, así que se leen los bytes.
  const csvDatos = await page.evaluate(async () => {
    let blob = null;
    const crear = URL.createObjectURL, revocar = URL.revokeObjectURL;
    const clickReal = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (b) => { blob = b; return "blob:capturado"; };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () {};   // que no descargue nada
    document.getElementById("csv-btn").click();
    URL.createObjectURL = crear; URL.revokeObjectURL = revocar;
    HTMLAnchorElement.prototype.click = clickReal;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bom: [bytes[0], bytes[1], bytes[2]], texto: new TextDecoder().decode(bytes.slice(3)) };
  });
  const csv = csvDatos.texto;
  igual("el CSV lleva BOM", csvDatos.bom, [239, 187, 191]);
  igual("el CSV va con punto y coma", csv.split("\r\n")[0].split(";").length, 11);
  const filaAna = csv.split("\r\n").find((l) => l.indexOf("AI-2026-000002") !== -1);
  igual("la fila del cobro vencido", filaAna.split(";").slice(4, 11).join("|"),
    "22500|10000|12500|CRC|" + dia(-20) + "|Vencido|20");

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

async function pruebaAlumna(browser) {
  console.log("\n=== Una alumna ===");
  // La RLS solo le devuelve los suyos: eso es lo que ve el cliente falso.
  const { page, errores } = await abrir(browser, ALUMNA, ["c-1", "c-2"]);
  await page.waitForSelector("#vista-alumno:not(.hidden)", { timeout: 20000 });

  igual("no ve el panel de coordinación",
    await page.evaluate(() => document.getElementById("app").classList.contains("hidden")), "true");
  igual("no puede registrar pagos ni anular",
    await page.evaluate(() => document.querySelectorAll("#alumno-lista button").length), 0);
  const saldo = sinSeparadores(await page.evaluate(() => document.querySelector("#alumno-saldo").textContent));
  igual("le suma su saldo (22.500 + 12.500)", /₡35000/.test(saldo), "true");
  igual("y avisa que hay algo vencido", /vencido/.test(saldo), "true");
  igual("ve sus dos recibos",
    await page.evaluate(() => document.querySelectorAll("#alumno-lista > div").length), 2);

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaCoordinacion(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
