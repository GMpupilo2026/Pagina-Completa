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
window.__consultas = [];
window.SUPABASE_URL = "https://falso.supabase.co";
window.SUPABASE_ANON_KEY = "anon-falsa";
(function () {
  const PERFIL = ${JSON.stringify(perfil)};
  const TABLAS = {
    profiles: [PERFIL],
    planes_cobro: ${JSON.stringify(PLANES)},
    suscripciones: ${JSON.stringify(SUSCRIPCIONES)},
    cobros_vista: ${JSON.stringify(COBROS)}.filter((c) => ${JSON.stringify(cobrosVisibles)}.includes(c.id)),
    ajustes_academia: [{ clave: "whatsapp_consultas", valor: "+506 8309-2291" }],
    cobros_contacto: [],
  };
  const RPC = {
    cobros_resumen: ${JSON.stringify(RESUMEN)},
    cobros_morosos: ${JSON.stringify(MOROSOS)},
    informes_resumen_alumnos: ${JSON.stringify([ANA, BRUNO])},
    generar_cobros: 3,
  };
  /* Este doble FILTRA, ORDENA, CUENTA Y RECORTA de verdad.
     Uno que devolviera siempre la tabla entera daría por buena una página que
     se baja los mil cobros y filtra en el navegador — que es exactamente el
     techo de PostgREST que esta pantalla acaba de dejar de cruzar, y el fallo
     no se ve: la lista se pinta igual de bien hasta que hay más de mil. */
  function constructor(filas, tabla) {
    let unica = false, conCuenta = false;
    let datos = Array.isArray(filas) ? filas.slice() : filas;
    const aplicar = (fn) => { if (Array.isArray(datos)) datos = datos.filter(fn); };
    const b = {
      select(cols, opciones) {
        if (opciones && opciones.count) conCuenta = true;
        window.__consultas.push({ tabla, verbo: "select", cuenta: conCuenta });
        return b;
      },
      eq(col, val) { window.__consultas.push({ tabla, verbo: "eq", col, val });
                     aplicar((f) => String(f[col]) === String(val)); return b; },
      in(col, vals) { window.__consultas.push({ tabla, verbo: "in", col });
                      aplicar((f) => vals.includes(f[col])); return b; },
      or(expr) { window.__consultas.push({ tabla, verbo: "or", expr });
                 // Solo se entiende lo que la página manda: col.ilike.%texto%
                 const trozos = String(expr).split(",").map((x) => x.split("."));
                 aplicar((f) => trozos.some(([col, , patron]) =>
                   String(f[col] || "").toLowerCase().includes(String(patron || "").replace(/%/g, "").toLowerCase())));
                 return b; },
      order(col, o) { if (Array.isArray(datos)) {
                        const asc = !o || o.ascending !== false;
                        datos.sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : 1) * (asc ? 1 : -1));
                      } return b; },
      limit(n) { if (Array.isArray(datos)) datos = datos.slice(0, n); return b; },
      range(a, z) { window.__consultas.push({ tabla, verbo: "range", desde: a, hasta: z });
                    if (Array.isArray(datos)) datos = datos.slice(a, z + 1); return b; },
      is() { return b; }, not() { return b; },
      insert(v) { window.__llamadas.push({ tabla, verbo: "insert", datos: v }); return b; },
      update(v) { window.__llamadas.push({ tabla, verbo: "update", datos: v }); return b; },
      upsert(v) { window.__llamadas.push({ tabla, verbo: "upsert", datos: v }); return b; },
      delete() { window.__llamadas.push({ tabla, verbo: "delete" }); return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        // El total es el de ANTES de recortar, como hace PostgREST con
        // count: "exact": si fuera el de la página, "de N cobros" mentiría.
        const total = Array.isArray(filas) ? filas.length : null;
        let d = datos;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null, count: conCuenta ? total : null }).then(res, rej);
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
  // Las dos Edge Functions: se apunta qué mandó y se responde lo que la de
  // verdad responde. correos-alumno devuelve SIEMPRE el retrato completo del
  // alumno después de cada cambio, así que el doble tiene que hacer lo mismo:
  // si contestara cualquier cosa, la página se repintaría con datos que no
  // existen y la prueba no vería la diferencia.
  const RETRATO = {
    ok: true,
    alumno: { id: "u-ana", nombre: "Ana Rojas" },
    cuenta: { email: "ana@x.cr", es_usuario: false },
    encargados: [{ id: "e-1", nombre: "Rosa Mena", email: "rosa@x.cr", frecuencia: "semanal", activo: true }],
    cobro: null,
    correo_cobro_efectivo: "rosa@x.cr",
  };
  const fetchReal = window.fetch;
  window.fetch = function (url, opciones) {
    if (String(url).indexOf("/functions/v1/") !== -1) {
      const cuerpo = JSON.parse((opciones && opciones.body) || "{}");
      window.__llamadas.push({ funcion: cuerpo });
      const respuesta = String(url).indexOf("correos-alumno") !== -1
        ? RETRATO
        : { ok: true, mandados: 2, correos: ["mama@x.cr", "ana@x.cr"] };
      return Promise.resolve(new Response(JSON.stringify(respuesta),
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
const PROFESORA = { id: "u-karina", full_name: "Karina Mora", email: "karina@x.cr", role: "profesor", es_coordinador: false, is_admin: false };

async function pruebaCoordinacion(browser) {
  console.log("\n=== Quien coordina ===");
  const { page, errores } = await abrir(browser, COORDINA, ["c-1", "c-2", "c-3", "c-4"]);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  const tarjetas = (await page.evaluate(() =>
    [...document.querySelectorAll("#tarjetas p")].map((p) => p.textContent.trim()))).map(sinSeparadores);
  igual("las cuatro tarjetas, en colones", tarjetas,
    ["₡35000", "cobrado este mes", "₡22500", "pendiente, aún al día", "₡12500", "vencido", "1", "alumno atrasado"]);

  /* EL FILTRO Y EL CORTE LOS HACE LA BASE. Esto es lo que de verdad importa
     de esta pantalla: si algún día alguien vuelve a bajarse los cobros enteros
     para filtrarlos en el navegador, la página se ve igual de bien hasta que
     la academia pasa del techo de PostgREST y empieza a esconder cobros sin
     decir nada. */
  const consultas = await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "cobros_vista"));
  igual("los cobros se piden con su cuenta total", consultas.some((c) => c.verbo === "select" && c.cuenta), "true");
  igual("y de a pocos, con un rango", consultas.find((c) => c.verbo === "range"), { tabla: "cobros_vista", verbo: "range", desde: 0, hasta: 29 });

  // Los meses: el más nuevo abierto y los de atrás cerrados. Con trescientos
  // recibos de corrido no se encuentra ninguno.
  const meses = await page.evaluate(() =>
    [...document.querySelectorAll("#cobros-lista > details")].map((d) => d.open));
  igual("un bloque por mes, solo el primero abierto", meses, [true, false, false]);
  igual("y el encabezado del mes dice cuánto queda sin pagar",
    /sin pagar/.test(await page.evaluate(() => document.querySelector("#cobros-lista summary").textContent)), "true");

  // De aquí en adelante hace falta verlos todos.
  const abrirMeses = () => page.evaluate(() =>
    document.querySelectorAll("#cobros-lista > details").forEach((d) => { d.open = true; }));
  await abrirMeses();

  // La página pinta la situación que vino de la base, sin recalcular nada.
  const etiquetas = await page.evaluate(() =>
    [...document.querySelectorAll("#cobros-lista .rounded-full")].map((e) => e.textContent.trim()));
  igual("una etiqueta por cobro, tal cual la base", etiquetas, ["Pendiente", "Vencido", "Pagado", "Anulado"]);

  // Botones solo donde tiene sentido: ni en el pagado ni en el anulado.
  const conBotones = await page.evaluate(() =>
    [...document.querySelectorAll("#cobros-lista .cobro-fila")].map((d) => !!d.querySelector("button")));
  igual("botones solo en lo que queda por cobrar", conBotones, [true, true, false, false]);

  const filtro = async (v) => {
    await page.selectOption("#f-situacion", v);
    await page.waitForTimeout(250);
    await abrirMeses();
    return page.evaluate(() => document.querySelectorAll("#cobros-lista .cobro-fila").length);
  };
  igual("filtro: vencidos", await filtro("vencido"), 1);
  igual("filtro: pagados", await filtro("pagado"), 1);
  await filtro("");

  // Buscar: lo pregunta la base con un `or`, no se filtra acá.
  await page.evaluate(() => { window.__consultas = []; });
  await page.fill("#f-buscar", "julio");
  await page.waitForTimeout(600);
  await abrirMeses();
  igual("buscar pregunta a la base",
    await page.evaluate(() => window.__consultas.some((c) => c.tabla === "cobros_vista" && c.verbo === "or")), "true");
  igual("y deja solo lo que coincide",
    await page.evaluate(() => document.querySelectorAll("#cobros-lista .cobro-fila").length), 1);
  await page.fill("#f-buscar", "");
  await page.waitForTimeout(600);
  await abrirMeses();

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
  await abrirMeses();
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["5000", "transferencia", "REF-99"]; });
  await page.locator("#cobros-lista .cobro-fila").nth(1).locator("button").first().click();
  await page.waitForTimeout(300);
  const pago = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "pagos" && l.verbo === "insert"));
  igual("lo que manda al registrar un pago",
    pago && { cobro_id: pago.datos.cobro_id, monto: pago.datos.monto, metodo: pago.datos.metodo, referencia: pago.datos.referencia },
    { cobro_id: "c-2", monto: 5000, metodo: "transferencia", referencia: "REF-99" });

  // Un monto que no es número no se manda.
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["nada", "sinpe", ""]; });
  await page.locator("#cobros-lista .cobro-fila").nth(1).locator("button").first().click();
  await page.waitForTimeout(300);
  igual("un monto que no es número no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "pagos").length), 0);

  // Un método inventado tampoco.
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["5000", "bitcoin", ""]; });
  await page.locator("#cobros-lista .cobro-fila").nth(1).locator("button").first().click();
  await page.waitForTimeout(300);
  igual("un método desconocido no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "pagos").length), 0);

  // -------- anular
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["Se dio de baja"]; });
  await page.locator("#cobros-lista .cobro-fila").nth(0).locator("button").nth(1).click();
  await page.waitForTimeout(300);
  const anula = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "cobros" && l.verbo === "update"));
  igual("lo que manda al anular", anula && anula.datos, { estado: "anulado", anulado_motivo: "Se dio de baja" });

  // -------- morosidad y recordatorio
  await page.click('[data-ficha="morosidad"]');
  await page.waitForTimeout(200);
  const moroso = sinSeparadores(await page.evaluate(() => document.querySelector("#morosos-lista").textContent));
  igual("la morosidad dice cuánto y desde cuántos días",
    /Ana Rojas/.test(moroso) && /₡12500/.test(moroso) && /20 días de atraso/.test(moroso), "true");
  igual("dice a qué correo se le avisa",
    /se le avisa a ana@x\.cr/.test(moroso), "true");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.locator("#morosos-lista button", { hasText: "Recordar ahora" }).click();
  await page.waitForTimeout(400);
  igual("lo que manda «Recordar ahora»",
    await page.evaluate(() => (window.__llamadas.find((l) => l.funcion && l.funcion.action === "recordar_ahora") || {}).funcion),
    { action: "recordar_ahora", student_id: "u-ana" });

  /* Si el correo está mal, el momento de verlo es este. El botón lleva a la
     ficha donde se corrige CON EL ALUMNO YA ELEGIDO: mandarlo a buscarlo otra
     vez entre trescientos es como se dejan los correos sin corregir. */
  await page.evaluate(() => { window.__llamadas = []; });
  await page.locator("#morosos-lista button", { hasText: "Revisar su correo" }).click();
  await page.waitForTimeout(400);
  igual("«Revisar su correo» abre la ficha de contacto con ese alumno",
    await page.evaluate(() => !document.getElementById("ficha-contacto").classList.contains("hidden")
      && document.getElementById("c-alumno").value), "u-ana");
  igual("y le pide a la función los correos de ese alumno",
    await page.evaluate(() => (window.__llamadas.find((l) => l.funcion && l.funcion.action === "ver") || {}).funcion),
    { action: "ver", alumno_id: "u-ana" });
  await page.click('[data-ficha="morosidad"]');
  await page.waitForTimeout(200);

  // -------- programar un recordatorio para un día y hora exactos
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["2026-10-01", "15:30"]; });
  await page.locator("#morosos-lista button", { hasText: "Programar" }).click();
  await page.waitForTimeout(300);
  const programado = await page.evaluate(() => window.__llamadas.find(
    (l) => l.tabla === "cobros_recordatorios_programados" && l.verbo === "insert"));
  igual("lo que manda «Programar»: el alumno y la hora exacta en UTC (CR es UTC-06:00)",
    programado && { student_id: programado.datos.student_id, programado_para: programado.datos.programado_para },
    { student_id: "u-ana", programado_para: "2026-10-01T21:30:00.000Z" });

  // Una fecha o una hora mal escritas, o una que ya pasó, no se mandan.
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["1-oct-2026", "15:30"]; });
  await page.locator("#morosos-lista button", { hasText: "Programar" }).click();
  await page.waitForTimeout(300);
  igual("una fecha que no es AAAA-MM-DD no se programa",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "cobros_recordatorios_programados").length), 0);

  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["2020-01-01", "08:00"]; });
  await page.locator("#morosos-lista button", { hasText: "Programar" }).click();
  await page.waitForTimeout(300);
  igual("una fecha y hora que ya pasaron no se programan",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "cobros_recordatorios_programados").length), 0);

  // -------- emitir los que falten
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#generar-btn");
  await page.waitForTimeout(400);
  igual("«Emitir los que falten» llama a generar_cobros",
    await page.evaluate(() => window.__llamadas.some((l) => l.rpc === "generar_cobros")), "true");

  /* -------- Contacto: el número de las familias y los correos de un alumno
     Las dos cosas de esta ficha se rompen calladas. El número lo llevan los
     tres correos que salen de la Academia; el correo del alumno decide a qué
     bandeja llega cada uno. Nada de eso da un error cuando está mal. */
  await page.click('[data-ficha="contacto"]');
  await page.waitForTimeout(300);
  igual("el número que ven las familias sale de los ajustes, no escrito en la página",
    await page.inputValue("#wa-numero"), "+506 8309-2291");

  await page.evaluate(() => { window.__llamadas = []; });
  await page.fill("#wa-numero", "+506 7000-1111");
  await page.click("#wa-guardar");
  await page.waitForTimeout(300);
  const wa = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "ajustes_academia"));
  igual("guardar el número manda la clave y el valor", wa && { verbo: wa.verbo, datos: wa.datos },
    { verbo: "upsert", datos: { clave: "whatsapp_consultas", valor: "+506 7000-1111" } });

  // Un número de tres dígitos armaría un enlace de WhatsApp que no lleva a
  // ninguna parte, y eso se ve como un enlace perfecto.
  await page.evaluate(() => { window.__llamadas = []; });
  await page.fill("#wa-numero", "123");
  await page.click("#wa-guardar");
  await page.waitForTimeout(300);
  igual("un número que no es un celular no se guarda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "ajustes_academia").length), 0);
  igual("y se dice por qué",
    /no parece un celular/.test(await page.evaluate(() => document.getElementById("wa-estado").textContent)), "true");

  // Los tres correos del alumno, cada uno con lo suyo.
  await page.selectOption("#c-alumno", "u-ana");
  await page.waitForTimeout(400);
  const panel = await page.evaluate(() => document.getElementById("c-panel").textContent);
  igual("enseña para qué sirve cada correo",
    /Con qu\u00e9 entra/.test(panel) && /informe de la casa/.test(panel) && /le llega el cobro/.test(panel), "true");
  igual("y a qué correo le llega HOY el cobro", /Hoy le llega a: rosa@x\.cr/.test(panel), "true");

  const primerCampo = (caja) => page.locator("#c-panel > div").nth(caja).locator("input");
  await page.evaluate(() => { window.__llamadas = []; });
  await primerCampo(0).first().fill("nuevo@x.cr");
  await page.locator("#c-panel > div").nth(0).locator("button", { hasText: "Corregir" }).click();
  await page.waitForTimeout(400);
  igual("corregir el correo de la cuenta",
    await page.evaluate(() => (window.__llamadas.find((l) => l.funcion && l.funcion.action === "cuenta") || {}).funcion),
    { action: "cuenta", email: "nuevo@x.cr", alumno_id: "u-ana" });

  await page.evaluate(() => { window.__llamadas = []; });
  await page.locator("#c-panel > div").nth(2).locator("input").nth(1).fill("papa@x.cr");
  await page.locator("#c-panel > div").nth(2).locator("button", { hasText: "Usar solo este" }).click();
  await page.waitForTimeout(400);
  const cobroMandado = await page.evaluate(() => (window.__llamadas.find((l) => l.funcion && l.funcion.action === "cobro_guardar") || {}).funcion);
  igual("fijar a mano el correo del cobro",
    cobroMandado && { action: cobroMandado.action, email: cobroMandado.email, alumno_id: cobroMandado.alumno_id },
    { action: "cobro_guardar", email: "papa@x.cr", alumno_id: "u-ana" });

  await page.click('[data-ficha="cobros"]');
  await abrirMeses();

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
    // Ahora el CSV le pide a la base todo lo que cumple el filtro, así que
    // hay que esperar a que vuelva: no se arma con lo que ya estaba pintado.
    for (let i = 0; i < 40 && !blob; i++) await new Promise((r) => setTimeout(r, 50));
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
  /* El número al que escribir sale del MISMO ajuste que llevan los correos, no
     escrito en la página: con dos copias, quien coordina lo cambia y esta
     línea se queda con el viejo sin que nada falle. */
  igual("y el número al que escribir sale de los ajustes",
    await page.evaluate(() => {
      const p = document.getElementById("alumno-contacto");
      const a = document.getElementById("alumno-wa");
      return getComputedStyle(p).display !== "none" && a.textContent + " " + a.getAttribute("href");
    }), "+506 8309-2291 https://wa.me/50683092291");

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

/* Una profesora que no coordina: acá no tiene NADA que hacer.
   Antes caía en "Mis pagos" y veía una lista vacía —a una cuenta de profesora
   no se le cobra—, que se lee como una página rota en vez de como "esto no es
   tuyo". Y lo que de verdad importa: que no le llegue ni un dato de cobros. */
async function pruebaProfesora(browser) {
  console.log("\n=== Una profesora que no coordina ===");
  const { page, errores } = await abrir(browser, PROFESORA, []);
  await page.waitForSelector("#no-es-tuyo:not(.hidden)", { timeout: 20000 });
  igual("se le dice de quién es esta página",
    /los lleva quien coordina/i.test(await page.evaluate(() => document.getElementById("no-es-tuyo").textContent)), "true");
  igual("no se le pinta el panel de coordinación",
    await page.evaluate(() => document.getElementById("app").classList.contains("hidden")), "true");
  igual("ni la vista de recibos propios",
    await page.evaluate(() => document.getElementById("vista-alumno").classList.contains("hidden")), "true");
  igual("y no se le pide ni un cobro a la base",
    await page.evaluate(() => window.__consultas.filter((c) => c.tabla === "cobros_vista").length), 0);
  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaCoordinacion(browser);
    await pruebaProfesora(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
