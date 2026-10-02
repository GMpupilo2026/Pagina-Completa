/* Comprueba, en un navegador de verdad y con un Supabase de mentira, lo que
   cobros.html manda y lo que pinta:

   1. Las dos caras de la página: quien coordina ve planes, suscripciones,
      cobros y morosidad; cualquier otra cuenta ve SOLO sus propios recibos.
   2. Que la página NO recalcule por su lado si algo está pagado o vencido:
      pinta la `situacion` que viene de la base (vista cobros_vista).
   3. Qué manda al crear un plan, al poner a un alumno en un plan, al registrar
      un pago y al anular un cobro.
   4. El CSV: punto y coma, BOM y los totales de cada fila.
   5. Los recibos: el pago pasa por registrar_pago() (que da el recibo), quien
      coordina no ve cómo mandarlo ni corregirlo, y quien supervisa lo revisa,
      lo manda (o lo marca entregado en mano), lo corrige, lo anula, adelanta
      pagos y cambia el prefijo. La alumna ve los suyos.

   Lo que la base hace cumplir (la RLS, y que el estado se calcule y no se
   guarde) no se prueba acá: eso se comprobó en SQL. Esto es lo otro — que la
   página mande lo correcto y no invente números.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-cobros.js                                */
const { chromium } = require("playwright");
const { contestarAvisos } = require("./lib/avisos-prueba.js");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const HOY = new Date();
/* Los vencimientos van anclados a meses del calendario, no a «hace N días»:
   la lista agrupa por el mes del vencimiento y abre solo el más nuevo, y con
   días corridos los cuatro cobros caían en dos o en tres meses según el día en
   que se corriera. La prueba necesita tres: los dos de Ana en ESTE mes (el
   bloque abierto, donde se le registra el pago a c-2), c-3 el mes pasado y c-4
   el antepasado. `mesAtras(0)` es el último día de este mes. */
const HOY_ISO = HOY.toISOString().slice(0, 10);
// El «hoy» que pone la página en la fecha de un pago: el de Costa Rica.
const HOY_CR = HOY.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
const mesAtras = (atras, diaDelMes) => {
  const d = new Date(Date.UTC(HOY.getUTCFullYear(), HOY.getUTCMonth() - atras + (diaDelMes ? 0 : 1), diaDelMes || 0));
  return d.toISOString().slice(0, 10);
};
/* c-2 vence HOY, pero siempre ANTES que c-1 (el último día del mes): la lista
   va por vencimiento, del más nuevo al más viejo, y el último día de cada mes
   los dos caían en la misma fecha y el orden entre ellos quedaba al azar. La
   prueba fallaba solo esos días, por el almanaque y no por la página. */
const VENCE_C2 = HOY_ISO < mesAtras(0) ? HOY_ISO
  : new Date(Date.parse(HOY_ISO) - 86400000).toISOString().slice(0, 10);

const ANA   = { id: "u-ana",   full_name: "Ana Rojas",  email: "ana@x.cr",   grupo: "7A" };
const BRUNO = { id: "u-bruno", full_name: "Bruno Mena", email: "bruno@x.cr", grupo: "7A" };
// Carla no está en ningún plan: es la que se agrega en tanda con la lista de casillas.
const CARLA = { id: "u-carla", full_name: "Carla Soto", email: "carla@x.cr", grupo: "8B" };

const PLANES = [
  { id: "p-mes", nombre: "Mensualidad", monto: 25000, moneda: "CRC", periodicidad: "mensual", personalizado: false, activo: true, descripcion: "Dos clases por semana", created_at: "2026-01-01T00:00:00Z" },
  { id: "p-usd", nombre: "Clase privada", monto: 40, moneda: "USD", periodicidad: "mensual", personalizado: false, activo: false, descripcion: null, created_at: "2026-01-02T00:00:00Z" },
  // Un plan armado a mano para un solo alumno desde "Quién paga qué": no es
  // catálogo de nadie más, así que no puede salir ni en "Planes" ni en el
  // selector de arriba de esa ficha.
  { id: "p-custom", nombre: "Beca especial de Carla", monto: 5000, moneda: "CRC", periodicidad: "mensual", personalizado: true, activo: true, descripcion: null, created_at: "2026-01-03T00:00:00Z" },
];
const SUSCRIPCIONES = [
  { id: "s-1", student_id: "u-ana", plan_id: "p-mes", inicio: "2026-06-01", dia_cobro: 5, descuento_pct: 10, activa: true },
  // Una que todavía no arranca: darla de baja hoy no puede mandar fin = hoy,
  // porque la base exige fin >= inicio (suscripciones_check).
  { id: "s-2", student_id: "u-bruno", plan_id: "p-mes", inicio: "2099-10-15", dia_cobro: 5, descuento_pct: 0, activa: true },
];
// Las cuatro situaciones, ya calculadas por la base. La página solo las pinta.
const COBROS = [
  { id: "c-1", student_id: "u-ana",   consecutivo: "AI-2026-000001", concepto: "Mensualidad · setiembre 2026", periodo_inicio: "2026-09-01", periodo_fin: "2026-09-30", monto: 22500, pagado: 0,     saldo: 22500, moneda: "CRC", vence: mesAtras(0), situacion: "pendiente", dias_atraso: 0,  estado: "emitido" },
  { id: "c-2", student_id: "u-ana",   consecutivo: "AI-2026-000002", concepto: "Mensualidad · agosto 2026",    periodo_inicio: "2026-08-01", periodo_fin: "2026-08-31", monto: 22500, pagado: 10000, saldo: 12500, moneda: "CRC", vence: VENCE_C2, situacion: "vencido",   dias_atraso: 20, estado: "emitido" },
  { id: "c-3", student_id: "u-bruno", consecutivo: "AI-2026-000003", concepto: "Mensualidad · agosto 2026",    periodo_inicio: "2026-08-01", periodo_fin: "2026-08-31", monto: 25000, pagado: 25000, saldo: 0,     moneda: "CRC", vence: mesAtras(1, 10), situacion: "pagado",    dias_atraso: 0,  estado: "emitido" },
  { id: "c-4", student_id: "u-bruno", consecutivo: "AI-2026-000004", concepto: "Mensualidad · julio 2026",     periodo_inicio: "2026-07-01", periodo_fin: "2026-07-31", monto: 25000, pagado: 0,     saldo: 25000, moneda: "CRC", vence: mesAtras(2, 10), situacion: "anulado",   dias_atraso: 0,  estado: "anulado" },
];
const RESUMEN = [{ moneda: "CRC", cobrado_mes: 35000, pendiente: 22500, vencido: 12500, alumnos_morosos: 1 }];
/* Los recibos, ya con su total y su detalle (recibos_vista). Uno por entregar,
   uno mandado por correo y uno anulado: las tres caras de la lista. */
const RECIBOS = [
  { id: "r-1", numero: "R-ADAPZ-2026-0001", student_id: "u-ana", fecha: "2026-09-10", metodo: "sinpe", referencia: "123", nota: null,
    estado: "emitido", anulado_motivo: null, entrega: null, enviado_at: null, enviado_a: null, total: 10000, moneda: "CRC",
    created_at: "2026-09-10T15:00:00Z",
    detalle: [{ pago_id: "pg-1", cobro_id: "c-2", concepto: "Mensualidad · agosto 2026", consecutivo: "AI-2026-000002", monto: 10000 }] },
  { id: "r-2", numero: "R-ADAPZ-2026-0002", student_id: "u-bruno", fecha: "2026-08-12", metodo: "efectivo", referencia: null, nota: null,
    estado: "emitido", anulado_motivo: null, entrega: "correo", enviado_at: "2026-08-12T16:00:00Z", enviado_a: ["mama@x.cr"], total: 25000, moneda: "CRC",
    created_at: "2026-08-12T15:00:00Z",
    detalle: [{ pago_id: "pg-2", cobro_id: "c-3", concepto: "Mensualidad · agosto 2026", consecutivo: "AI-2026-000003", monto: 25000 }] },
  { id: "r-3", numero: "R-ADAPZ-2026-0003", student_id: "u-bruno", fecha: "2026-07-05", metodo: "sinpe", referencia: null, nota: null,
    estado: "anulado", anulado_motivo: "Pago duplicado", entrega: null, enviado_at: null, enviado_a: null, total: 25000, moneda: "CRC",
    created_at: "2026-07-05T15:00:00Z",
    detalle: [{ pago_id: "pg-3", cobro_id: "c-3", concepto: "Mensualidad · agosto 2026", consecutivo: "AI-2026-000003", monto: 25000 }] },
];
const RECIBO_NUEVO = { id: "r-nuevo", numero: "R-ADAPZ-2026-0004" };
const MOROSOS = [{ student_id: "u-ana", alumno: "Ana Rojas", correo: "ana@x.cr", grupo: "7A", moneda: "CRC", deuda: 12500, cobros: 1, dias_atraso: 20, vence_mas_viejo: VENCE_C2 }];

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
    ajustes_academia: [
      { clave: "whatsapp_consultas", valor: "+506 8309-2291" },
      { clave: "cobros_dias_antes", valor: "3" },
      { clave: "cobros_dias_vencido", valor: "1" },
      { clave: "cobros_dias_moroso", valor: "15" },
      { clave: "cobros_mensaje_moroso", valor: "Texto guardado del aviso de moroso." },
    ],
    cobros_contacto: [],
    recibos_vista: ${JSON.stringify(RECIBOS)},
    recibos: ${JSON.stringify(RECIBOS)},
    academias: [{ id: "a-adapz", nombre: "ADAPZ", prefijo_recibo: null, supervisor_id: "u-sofia" },
                { id: "a-otra", nombre: "Otra academia", prefijo_recibo: null, supervisor_id: "u-otro" }],
    cobros_recordatorios_programados: [
      { id: "rp-1", student_id: "u-bruno", programado_para: "2026-12-01T15:00:00.000Z", estado: "pendiente", correos: null, nota: null },
    ],
  };
  const RPC = {
    cobros_resumen: ${JSON.stringify(RESUMEN)},
    cobros_morosos: ${JSON.stringify(MOROSOS)},
    informes_resumen_alumnos: ${JSON.stringify([ANA, BRUNO, CARLA])},
    eliminar_plan_cobro: { suscripciones: 2, anulados: 1 },
    generar_cobros: 3,
    registrar_pago: ${JSON.stringify(RECIBO_NUEVO)},
    pago_adelantado: ${JSON.stringify(RECIBO_NUEVO)},
    registrar_cobro_pagado: ${JSON.stringify(RECIBO_NUEVO)},
    prefijo_recibo: "ADAPZ",
    academia_guardar_prefijo_recibo: "ADZ",
    corregir_recibo: null,
    anular_recibo: null,
    recibo_entregado_en_mano: null,
  };
  /* Este doble FILTRA, ORDENA, CUENTA Y RECORTA de verdad.
     Uno que devolviera siempre la tabla entera daría por buena una página que
     se baja los mil cobros y filtra en el navegador — que es exactamente el
     techo de PostgREST que esta pantalla acaba de dejar de cruzar, y el fallo
     no se ve: la lista se pinta igual de bien hasta que hay más de mil. */
  function constructor(filas, tabla) {
    let unica = false, conCuenta = false, insertados = null, escritura = null, cuentaAntesDelRango = null;
    // Los filtros de un update/delete se apuntan al RESOLVER (then), no en
    // update(): el .eq/.in llega después, y es lo que dice A QUIÉN se tocó.
    const filtros = [];
    let datos = Array.isArray(filas) ? filas.slice() : filas;
    const aplicar = (fn) => { if (Array.isArray(datos)) datos = datos.filter(fn); };
    const b = {
      select(cols, opciones) {
        if (opciones && opciones.count) conCuenta = true;
        window.__consultas.push({ tabla, verbo: "select", cuenta: conCuenta });
        return b;
      },
      eq(col, val) { window.__consultas.push({ tabla, verbo: "eq", col, val }); filtros.push({ col, eq: val });
                     aplicar((f) => String(f[col]) === String(val)); return b; },
      in(col, vals) { window.__consultas.push({ tabla, verbo: "in", col }); filtros.push({ col, in: vals.slice() });
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
                    if (Array.isArray(datos)) { cuentaAntesDelRango = datos.length; datos = datos.slice(a, z + 1); } return b; },
      // .is(col, null) y .not(col, "is", null): los recibos por entregar y los
      // entregados se piden así, y un doble que no filtrara daría por buena una
      // página que se olvida del filtro.
      is(col, val) { window.__consultas.push({ tabla, verbo: "is", col, val });
                     aplicar((f) => (val === null ? f[col] == null : f[col] === val)); return b; },
      not(col, op, val) { window.__consultas.push({ tabla, verbo: "not", col, op, val });
                          if (op === "is" && val === null) aplicar((f) => f[col] != null); return b; },
      ilike(col, patron) { window.__consultas.push({ tabla, verbo: "ilike", col, patron });
                           const t = String(patron).replace(/%/g, "").toLowerCase();
                           aplicar((f) => String(f[col] || "").toLowerCase().includes(t)); return b; },
      insert(v) { window.__llamadas.push({ tabla, verbo: "insert", datos: v });
                  insertados = Array.isArray(v) ? v : [v]; return b; },
      update(v) { escritura = { tabla, verbo: "update", datos: v }; window.__llamadas.push(escritura); return b; },
      upsert(v) { window.__llamadas.push({ tabla, verbo: "upsert", datos: v }); return b; },
      delete() { window.__llamadas.push({ tabla, verbo: "delete" }); return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      then(res, rej) {
        // El total es el de lo que cumple los filtros, ANTES de recortar con
        // range(), como hace PostgREST con count: "exact": si fuera el de la
        // página, "de N cobros" mentiría; si fuera el de la tabla entera, un
        // conteo filtrado («1 por entregar») también.
        if (escritura) escritura.filtros = filtros.slice();
        const total = cuentaAntesDelRango !== null ? cuentaAntesDelRango : Array.isArray(datos) ? datos.length : null;
        // Un .insert(...).select().single() devuelve lo que se insertó, con un
        // id nuevo — no la tabla de siempre. Sin esto, crearSuscripcion() con
        // un cobro personalizado "funcionaría" en la prueba usando el id del
        // primer plan del catálogo, que es justo el error que se quiere
        // descartar (el personalizado tiene que crear SU PROPIO plan).
        let d = insertados
          ? insertados.map((x, i) => Object.assign({ id: "nuevo-" + tabla + "-" + i }, x))
          : datos;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        // __demora imita la red: sin ella todo contesta al instante y un doble
        // clic nunca encuentra la primera llamada todavía en camino.
        const respuesta = { data: d, error: null, count: conCuenta ? total : null };
        return new Promise((ok) => setTimeout(() => ok(respuesta), window.__demora || 0)).then(res, rej);
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
    rpc: (n, args) => { if (n === "mis_funciones_coordinacion") return Promise.resolve({ data: (window.__misFunciones || ["formularios","altas","solicitudes","cuentas","acceso","roles","cobros","equipos","subgrupos"]), error: null });
                        window.__llamadas.push({ rpc: n, args: args || null });
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
        : cuerpo.action === "recibo_ver"
        ? { ok: true, numero: "R-ADAPZ-2026-0001", asunto: "Recibo", html: "<p id='recibo'>Recibo de prueba</p>", correos: ["rosa@x.cr"] }
        : cuerpo.action === "recibo_enviar"
        ? { ok: true, correos: ["rosa@x.cr"], fallos: [] }
        : cuerpo.action === "muestra"
        ? { ok: true, asunto: "Asunto de muestra (" + cuerpo.tipo + ")",
            html: "<p id='muestra'>Correo de muestra</p>",
            de_fabrica: { asunto: { proximo: "Asunto de fábrica próximo", vencido: "Asunto de fábrica vencido", moroso: "Asunto de fábrica moroso" },
                          mensaje: { proximo: "Mensaje de fábrica próximo", vencido: "Mensaje de fábrica vencido", moroso: "Mensaje de fábrica moroso" },
                          comoPagar: "Por SINPE Móvil o transferencia bancaria." } }
        : { ok: true, mandados: 2, correos: ["mama@x.cr", "ana@x.cr"] };
      return Promise.resolve(new Response(JSON.stringify(respuesta),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return fetchReal.apply(this, arguments);
  };
  // El formulario de registrar un pago, la razón de anular y el «Dar de baja»:
  // los contesta herramientas/lib/avisos-prueba.js con lo que haya en __respuestas.
  (${contestarAvisos})();
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
  // Cuántos meses hay sale de las MISMAS filas: sus fechas cuelgan de hoy, así
  // que según el día del mes caen en dos meses o en tres. Con el número escrito
  // a mano la prueba se pudría sola con el almanaque (falló un 25 de setiembre).
  const nMeses = new Set(COBROS.map((c) => c.vence.slice(0, 7))).size;
  igual("los cobros de prueba caen en más de un mes", nMeses > 1, "true");
  igual("un bloque por mes, solo el primero abierto", meses, [true, ...Array(nMeses - 1).fill(false)]);
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

  // -------- el plan personalizado no es catálogo de nadie más
  await page.click('[data-ficha="planes"]');
  igual("un plan personalizado no sale en «Planes»",
    /Beca especial de Carla/.test(await page.evaluate(() => document.getElementById("planes-lista").textContent)), "false");
  igual("ni en el selector de «Quién paga qué»",
    await page.evaluate(() => [...document.getElementById("s-plan").options].some((o) => o.textContent.includes("Beca especial de Carla"))),
    "false");

  // -------- crear un plan
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

  // -------- poner alumnos en un plan: la lista con casillas
  await page.click('[data-ficha="suscripciones"]');
  const casilla = (id) => '#s-alumnos input[value="' + id + '"]';
  igual("la lista trae a los tres, con su grupo y el plan en que ya están",
    await page.evaluate(() => [...document.querySelectorAll("#s-alumnos label")].map((l) => l.textContent.replace(/\s+/g, " ").trim())),
    ["Ana Rojas Grupo 7A · Ya en: Mensualidad", "Bruno Mena Grupo 7A · Ya en: Mensualidad", "Carla Soto Grupo 8B · Sin plan todavía"]);
  await page.click("#s-guardar");
  await page.waitForTimeout(200);
  igual("sin nadie marcado no se manda nada y se dice por qué",
    await page.evaluate(() => window.__avisos.some((a) => a.includes("Marca al menos un alumno"))), "true");
  // Los filtros solo esconden: lo marcado sigue marcado.
  await page.check(casilla("u-ana"));
  await page.fill("#s-buscar", "carl");
  await page.waitForTimeout(100);
  igual("buscar deja ver solo a quien coincide",
    await page.evaluate(() => document.querySelectorAll("#s-alumnos input").length), 1);
  igual("y el contador sigue contando a la que quedó escondida",
    await page.evaluate(() => document.getElementById("s-contador").textContent), "1 alumno marcado");
  await page.fill("#s-buscar", "");
  await page.check("#s-sin-plan");
  igual("«Solo los que no tienen ningún plan» deja a Carla",
    await page.evaluate(() => [...document.querySelectorAll("#s-alumnos input")].map((c) => c.value)), ["u-carla"]);
  await page.uncheck("#s-sin-plan");
  await page.selectOption("#s-grupo", "7A");
  await page.click("#s-marcar");
  igual("«Marcar los que se ven» marca al grupo entero",
    await page.evaluate(() => document.getElementById("s-contador").textContent), "2 alumnos marcados");
  await page.selectOption("#s-grupo", "");
  await page.click("#s-desmarcar");
  igual("«Desmarcar todos» los desmarca aunque no se vean",
    await page.evaluate(() => [document.getElementById("s-contador").textContent,
      document.querySelectorAll("#s-alumnos input:checked").length]), ["Ninguno marcado", 0]);

  // Ana y Bruno ya están en Mensualidad: se agrega solo a Carla, en la misma
  // tanda, y los otros dos se dejan igual (el índice único rechazaría todo).
  await page.check(casilla("u-ana"));
  await page.check(casilla("u-bruno"));
  await page.check(casilla("u-carla"));
  igual("el botón dice a cuántos agrega",
    await page.evaluate(() => document.getElementById("s-guardar").textContent), "Agregar a los 3");
  await page.fill("#s-descuento", "25");
  // Un día fuera del 1 al 31 no se manda: antes llegaba a la base y volvía el
  // «violates check constraint» en inglés.
  await page.fill("#s-dia", "40");
  await page.evaluate(() => { window.__llamadas = []; window.__avisos = []; });
  await page.click("#s-guardar");
  await page.waitForTimeout(300);
  igual("un día 40 no se manda y se dice por qué",
    await page.evaluate(() => ({
      mando: window.__llamadas.some((l) => l.tabla === "suscripciones" && l.verbo === "insert"),
      aviso: window.__avisos.some((a) => a.includes("del 1 al 31")),
    })), { mando: false, aviso: true });
  // El 31 sí vale (la base lo recorta al último día de los meses cortos).
  await page.fill("#s-dia", "31");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#s-guardar");
  await page.waitForTimeout(300);
  const sus = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "suscripciones" && l.verbo === "insert"));
  igual("manda UNA tanda, sin los que ya estaban en ese plan",
    sus && sus.datos.map((d) => ({ student_id: d.student_id, plan_id: d.plan_id, dia_cobro: d.dia_cobro, descuento_pct: d.descuento_pct })),
    [{ student_id: "u-carla", plan_id: "p-mes", dia_cobro: 31, descuento_pct: 25 }]);
  igual("y dice que los otros dos se dejaron igual",
    await page.evaluate(() => window.__avisos.some((a) => a.includes("1 alumno en «Mensualidad»") && a.includes("2 ya estaban"))), "true");
  igual("después de agregar, la lista queda sin marcar",
    await page.evaluate(() => document.querySelectorAll("#s-alumnos input:checked").length), 0);

  // La beca se ve en la lista: 25000 menos 10 % son 22.500.
  const textoSus = sinSeparadores(await page.evaluate(() => document.querySelector("#suscripciones-lista").textContent));
  igual("la beca sale aplicada en la lista", /₡22500/.test(textoSus) && /beca 10 %/.test(textoSus), "true");

  // -------- cobro personalizado: sin elegir plan del catálogo
  await page.check("#s-personalizado");
  igual("marcarlo esconde el selector de plan y muestra los campos manuales",
    await page.evaluate(() => ({
      plan: document.getElementById("s-plan-cell").classList.contains("hidden"),
      manual: document.getElementById("s-manual-cell").classList.contains("hidden"),
    })), { plan: true, manual: false });

  await page.check(casilla("u-ana"));
  await page.fill("#s-manual-nombre", "Mensualidad con beca especial");
  await page.fill("#s-manual-monto", "12000");
  await page.selectOption("#s-manual-moneda", "USD");
  await page.fill("#s-dia", "20");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#s-guardar");
  await page.waitForTimeout(300);
  const planPersonalizado = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "planes_cobro" && l.verbo === "insert"));
  igual("crea SU PROPIO plan, marcado personalizado y no del catálogo",
    planPersonalizado && { nombre: planPersonalizado.datos.nombre, monto: planPersonalizado.datos.monto,
                            moneda: planPersonalizado.datos.moneda, personalizado: planPersonalizado.datos.personalizado },
    { nombre: "Mensualidad con beca especial", monto: 12000, moneda: "USD", personalizado: true });
  const susPersonalizada = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "suscripciones" && l.verbo === "insert"));
  igual("y la suscripción usa el id de ESE plan recién creado, no el de otro",
    susPersonalizada && { student_id: susPersonalizada.datos[0].student_id, plan_id: susPersonalizada.datos[0].plan_id, dia_cobro: susPersonalizada.datos[0].dia_cobro },
    { student_id: "u-ana", plan_id: "nuevo-planes_cobro-0", dia_cobro: 20 });
  igual("y después de guardar se destapa el selector de plan y se apaga la casilla",
    await page.evaluate(() => ({
      marcada: document.getElementById("s-personalizado").checked,
      plan: document.getElementById("s-plan-cell").classList.contains("hidden"),
    })), { marcada: false, plan: false });

  // Sin concepto ni monto, no se manda nada.
  await page.check("#s-personalizado");
  await page.check(casilla("u-ana"));
  await page.fill("#s-manual-nombre", "");
  await page.fill("#s-manual-monto", "");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#s-guardar");
  await page.waitForTimeout(300);
  igual("sin concepto no se crea ningún plan",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "planes_cobro").length), 0);
  // Doble clic en «Agregar» con un cobro personalizado: un solo plan, una sola
  // suscripción. El índice único (alumno, plan) no lo atajaría, porque cada
  // clic crea un plan distinto.
  await page.check(casilla("u-ana"));
  await page.fill("#s-manual-nombre", "Doble clic");
  await page.fill("#s-manual-monto", "1000");
  await page.evaluate(() => { window.__llamadas = []; window.__demora = 150; });
  await page.dblclick("#s-guardar");
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__demora = 0; });
  igual("un doble clic en «Agregar» crea un solo plan y una sola suscripción",
    await page.evaluate(() => ({
      planes: window.__llamadas.filter((l) => l.tabla === "planes_cobro" && l.verbo === "insert").length,
      suscripciones: window.__llamadas.filter((l) => l.tabla === "suscripciones" && l.verbo === "insert").length,
    })), { planes: 1, suscripciones: 1 });

  // Personalizado con dos marcados: cada uno lleva SU plan, para poder
  // cambiarle el monto a uno sin tocar al otro.
  await page.check("#s-personalizado");
  await page.check(casilla("u-bruno"));
  await page.check(casilla("u-carla"));
  await page.fill("#s-manual-nombre", "Beca de hermanos");
  await page.fill("#s-manual-monto", "8000");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#s-guardar");
  await page.waitForTimeout(400);
  igual("dos marcados con cobro personalizado: dos planes y una tanda con los dos",
    await page.evaluate(() => ({
      planes: window.__llamadas.filter((l) => l.tabla === "planes_cobro" && l.verbo === "insert").length,
      alumnos: (window.__llamadas.find((l) => l.tabla === "suscripciones" && l.verbo === "insert") || { datos: [] }).datos.map((d) => d.student_id),
    })), { planes: 2, alumnos: ["u-bruno", "u-carla"] });
  await page.check("#s-personalizado");
  await page.uncheck("#s-personalizado");

  // -------- dar de baja: termina hoy, o el día en que iba a empezar si aún no arranca
  const bajaDe = async (id) => {
    await page.evaluate(() => { window.__llamadas = []; });
    const fila = page.locator("#suscripciones-lista > div").filter({ hasText: id === "s-1" ? "Ana" : "Bruno" }).filter({ hasText: id === "s-1" ? "2026" : "2099" });
    await fila.locator("button").click();
    await page.waitForTimeout(300);
    const l = await page.evaluate(() => window.__llamadas.find((x) => x.tabla === "suscripciones" && x.verbo === "update"));
    return l && l.datos;
  };
  igual("la baja de una suscripción en curso termina hoy",
    await bajaDe("s-1"), { activa: false, fin: new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }) });
  igual("la baja de una que aún no arranca termina el día de inicio (fin >= inicio)",
    await bajaDe("s-2"), { activa: false, fin: "2099-10-15" });

  // -------- cambios en grupo sobre la lista de «Quién está en cada plan»
  const marcarEnLista = (id) => page.check('#suscripciones-lista input[value="' + id + '"]');
  await page.evaluate(() => { window.__llamadas = []; window.__avisos = []; });
  await page.click("#sl-beca");
  await page.waitForTimeout(200);
  igual("sin nadie marcado en la lista, el cambio en grupo no manda nada",
    await page.evaluate(() => [window.__llamadas.length, window.__avisos.some((a) => a.includes("Marca al menos a uno"))]), [0, true]);
  await marcarEnLista("s-1");
  await marcarEnLista("s-2");
  igual("el contador de la lista cuenta los marcados",
    await page.evaluate(() => document.getElementById("sl-contador").textContent), "2 marcados");
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["15"]; });
  await page.click("#sl-beca");
  await page.waitForTimeout(300);
  const beca = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "suscripciones" && l.verbo === "update"));
  igual("cambiar la beca en grupo: una sola llamada, a los dos marcados",
    beca && { datos: beca.datos, filtros: beca.filtros }, { datos: { descuento_pct: 15 }, filtros: [{ col: "id", in: ["s-1", "s-2"] }] });
  await marcarEnLista("s-1");
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["45"]; });
  await page.click("#sl-dia");
  await page.waitForTimeout(300);
  igual("un día 45 en grupo no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "suscripciones").length), 0);
  await page.evaluate(() => { window.__respuestas = ["30"]; });
  await page.click("#sl-dia");
  await page.waitForTimeout(300);
  const dia = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "suscripciones" && l.verbo === "update"));
  igual("cambiar el día en grupo",
    dia && { datos: dia.datos, filtros: dia.filtros }, { datos: { dia_cobro: 30 }, filtros: [{ col: "id", in: ["s-1"] }] });
  // Buscar esconde, y «Marcar todos los que se ven» marca solo lo visible.
  await page.fill("#sl-buscar", "bruno");
  await page.waitForTimeout(100);
  await page.check("#sl-todos");
  await page.fill("#sl-buscar", "");
  await page.waitForTimeout(100);
  igual("«Marcar todos los que se ven» marca solo lo que deja la búsqueda",
    await page.evaluate(() => [...document.querySelectorAll("#suscripciones-lista input:checked")].map((c) => c.value)), ["s-2"]);
  await marcarEnLista("s-1");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#sl-baja");
  await page.waitForTimeout(400);
  igual("dar de baja en grupo: los de hoy juntos, el que no arranca con su fecha",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "suscripciones" && l.verbo === "update")
      .map((l) => ({ datos: l.datos, filtros: l.filtros }))),
    [{ datos: { activa: false, fin: new Date().toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" }) }, filtros: [{ col: "id", in: ["s-1"] }] },
     { datos: { activa: false, fin: "2099-10-15" }, filtros: [{ col: "id", eq: "s-2" }] }]);

  // -------- editar y borrar un plan
  await page.click('[data-ficha="planes"]');
  const botonPlan = (accion) => page.locator("#planes-lista > div").filter({ hasText: "Mensualidad" }).first().locator('[data-accion="' + accion + '"]');
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ nombre: "Mensualidad 2027", monto: "27500", descripcion: "" }]; });
  await botonPlan("editar").click();
  await page.waitForTimeout(300);
  const edita = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "planes_cobro" && l.verbo === "update"));
  igual("editar un plan manda nombre, monto y detalle, a ESE plan",
    edita && { datos: edita.datos, filtros: edita.filtros },
    { datos: { nombre: "Mensualidad 2027", monto: 27500, descripcion: null }, filtros: [{ col: "id", eq: "p-mes" }] });
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ nombre: "Mensualidad", monto: "mucho", descripcion: "" }]; });
  await botonPlan("editar").click();
  await page.waitForTimeout(300);
  igual("un monto que no es número no se guarda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "planes_cobro").length), 0);
  // Cancelar el borrado no manda nada; aceptarlo llama a la función de la base.
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [null]; });
  await botonPlan("borrar").click();
  await page.waitForTimeout(300);
  igual("cancelar el borrado no manda nada",
    await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "eliminar_plan_cobro").length), 0);
  await page.evaluate(() => { window.__llamadas = []; window.__avisos = []; window.__respuestas = [{ cobros: "anular" }]; });
  await botonPlan("borrar").click();
  await page.waitForTimeout(400);
  igual("borrar el plan lo hace la base, con lo que se eligió para los cobros sin pagos",
    await page.evaluate(() => (window.__llamadas.find((l) => l.rpc === "eliminar_plan_cobro") || {}).args),
    { p_plan: "p-mes", p_anular_sin_pagos: true });
  igual("el borrado se hace con el botón rojo y dice qué pasó",
    await page.evaluate(() => window.__avisos.some((a) => a.includes("Plan borrado. Se sacó de él a 2 alumnos. Se anuló 1 cobro sin pagos."))), "true");

  // -------- registrar un pago parcial
  await page.click('[data-ficha="cobros"]');
  await abrirMeses();
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ monto: "5000", metodo: "transferencia", referencia: "REF-99" }]; });
  await page.locator("#cobros-lista .cobro-fila").nth(1).locator("button").first().click();
  await page.waitForTimeout(300);
  /* El pago lo escribe registrar_pago(), que da el recibo en la misma
     transacción: un insert directo en `pagos` dejaría un pago sin recibo (y
     la base ya no lo permite). */
  const pago = await page.evaluate(() => window.__llamadas.find((l) => l.rpc === "registrar_pago"));
  igual("registrar un pago pasa por registrar_pago, con la fecha de hoy",
    pago && pago.args,
    { p_pagos: [{ cobro_id: "c-2", monto: 5000 }], p_metodo: "transferencia", p_referencia: "REF-99", p_nota: null, p_fecha: HOY_CR });
  igual("y nunca escribe en `pagos` directo",
    await page.evaluate(() => window.__llamadas.some((l) => l.tabla === "pagos")), "false");
  igual("quien coordina sabe que el recibo lo entrega quien supervisa",
    await page.evaluate(() => window.__avisos.some((a) => a.includes("R-ADAPZ-2026-0004") && a.includes("lo revisa y lo entrega quien supervisa"))), "true");

  // Un monto que no es número no se manda.
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ monto: "nada", metodo: "sinpe", referencia: "" }]; });
  await page.locator("#cobros-lista .cobro-fila").nth(1).locator("button").first().click();
  await page.waitForTimeout(300);
  igual("un monto que no es número no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "registrar_pago").length), 0);
  // Una fecha en el futuro tampoco: un pago que todavía no entró.
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ monto: "5000", metodo: "sinpe", referencia: "", fecha: "2099-01-01" }]; });
  await page.locator("#cobros-lista .cobro-fila").nth(1).locator("button").first().click();
  await page.waitForTimeout(300);
  igual("un pago con fecha futura no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "registrar_pago").length), 0);

  // El método ya no se escribe: se elige de una lista que solo tiene los que existen.
  igual("el formulario del pago ofrece los cinco métodos, y nada más",
    await page.evaluate(() => window.__avisos.filter((a) => a.includes("Registrar un pago")).pop()
      .replace(/\s/g, "")
      // Las cinco opciones, en orden, y enseguida el campo que sigue: ni una más.
      .includes("SINPEMóvilTransferenciaEfectivoTarjetaOtroNúmerodecomprobante")), "true");
  // Y si igual llegara uno inventado (desde la consola), tampoco se manda.
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ monto: "5000", metodo: "bitcoin", referencia: "" }]; });
  await page.locator("#cobros-lista .cobro-fila").nth(1).locator("button").first().click();
  await page.waitForTimeout(300);
  igual("un método desconocido no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "registrar_pago").length), 0);

  // -------- los recibos, vistos por quien coordina: los ve, no los entrega
  await page.click('[data-ficha="recibos"]');
  await page.waitForTimeout(300);
  igual("ve los recibos con cómo le llegó cada uno a la familia",
    await page.evaluate(() => [...document.querySelectorAll("#rc-lista .recibo-entrega")].map((e) => e.textContent)),
    ["Por revisar y entregar", "Enviado por correo", "Anulado"]);
  igual("pero no tiene cómo mandarlos, corregirlos ni anularlos",
    await page.evaluate(() => [...document.querySelectorAll("#rc-lista button")].map((b) => b.textContent)
      .filter((t) => !t.includes("Ver o imprimir")).length), 0);
  igual("y se le dice quién los entrega",
    /los revisa y los entrega quien supervisa/.test(await page.evaluate(() => document.getElementById("rc-quien").textContent)), "true");
  igual("el prefijo de los números no es cosa suya",
    await page.evaluate(() => document.getElementById("rc-prefijo-caja").checkVisibility()), "false");
  // Ver el recibo: lo arma la función del correo y no ofrece mandarlo.
  await page.evaluate(() => { window.__llamadas = []; });
  await page.locator("#rc-lista .recibo-fila").first().locator("button", { hasText: "Ver o imprimir" }).click();
  await page.waitForFunction(() => { const m = document.querySelector("#rc-previa iframe"); return m && m.srcdoc; });
  igual("ver el recibo se lo pide a la función, con ESE recibo",
    await page.evaluate(() => (window.__llamadas.find((l) => l.funcion && l.funcion.action === "recibo_ver") || {}).funcion),
    { action: "recibo_ver", recibo_id: "r-1" });
  igual("el marco del recibo no corre código",
    await page.evaluate(() => document.querySelector("#rc-previa iframe").getAttribute("sandbox")), "allow-same-origin allow-modals");
  igual("y a quien coordina no se le ofrece mandarlo",
    await page.evaluate(() => [...document.querySelectorAll("#rc-previa-botones button")].some((b) => /mandar/i.test(b.textContent))), "false");
  // Los filtros los hace la base.
  await page.evaluate(() => { window.__consultas = []; });
  await page.selectOption("#rc-estado", "sin-entregar");
  await page.waitForTimeout(300);
  igual("«Por revisar y entregar» se le pregunta a la base",
    await page.evaluate(() => window.__consultas.some((c) => c.tabla === "recibos_vista" && c.verbo === "is" && c.col === "entrega")), "true");
  igual("y deja solo el que falta entregar",
    await page.evaluate(() => [...document.querySelectorAll("#rc-lista .recibo-fila")].map((d) => d.dataset.id)), ["r-1"]);
  await page.selectOption("#rc-estado", "entregados");
  await page.waitForTimeout(300);
  igual("«Entregados» deja el que ya salió",
    await page.evaluate(() => [...document.querySelectorAll("#rc-lista .recibo-fila")].map((d) => d.dataset.id)), ["r-2"]);
  await page.selectOption("#rc-estado", "");
  await page.waitForTimeout(300);
  await page.click('[data-ficha="cobros"]');
  await abrirMeses();

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

  // -------- cuándo salen los tres avisos automáticos (para TODA la Academia)
  igual("los tres campos arrancan con lo que ya está guardado",
    await page.evaluate(() => ({
      antes: document.getElementById("av-antes").value,
      vencido: document.getElementById("av-vencido").value,
      moroso: document.getElementById("av-moroso").value,
    })), { antes: "3", vencido: "1", moroso: "15" });

  await page.fill("#av-antes", "5");
  await page.fill("#av-vencido", "2");
  await page.fill("#av-moroso", "20");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#av-guardar");
  await page.waitForTimeout(300);
  const avisos = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "ajustes_academia" && l.verbo === "upsert" && Array.isArray(l.datos) && l.datos.some((d) => d.clave === "cobros_dias_antes")));
  igual("guardar manda las tres claves con lo escrito",
    avisos && avisos.datos, [
      { clave: "cobros_dias_antes", valor: "5" },
      { clave: "cobros_dias_vencido", valor: "2" },
      { clave: "cobros_dias_moroso", valor: "20" },
    ]);

  // El de "moroso" tiene que caer después que el de "vencido": si no, no se manda.
  await page.fill("#av-moroso", "1");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#av-guardar");
  await page.waitForTimeout(300);
  igual("moroso antes o igual que vencido no se guarda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "ajustes_academia" && l.verbo === "upsert").length), 0);
  igual("y se dice por qué",
    /después que el de/.test(await page.evaluate(() => document.getElementById("av-estado").textContent)), "true");
  await page.fill("#av-antes", "3");
  await page.fill("#av-vencido", "1");
  await page.fill("#av-moroso", "15");

  // -------- qué dice el correo (asunto, mensaje y «Cómo pagar»)
  await page.waitForFunction(() => document.getElementById("tx-asunto-proximo").placeholder !== "");
  igual("el marco de la vista previa no existe hasta que se pide",
    await page.evaluate(() => document.querySelectorAll("#tx-previa iframe").length), 0);
  igual("el mensaje guardado arranca escrito en su casilla",
    await page.inputValue("#tx-mensaje-moroso"), "Texto guardado del aviso de moroso.");
  igual("lo que no está guardado queda en blanco, con el de fábrica de guía",
    await page.evaluate(() => [document.getElementById("tx-asunto-proximo").value, document.getElementById("tx-asunto-proximo").placeholder,
                               document.getElementById("tx-como-pagar").placeholder]),
    ["", "Asunto de fábrica próximo", "Por SINPE Móvil o transferencia bancaria."]);

  await page.fill("#tx-asunto-vencido", "  Falta el pago de {alumno}  ");
  await page.fill("#tx-como-pagar", "SINPE Móvil al 8888-8888");
  await page.fill("#tx-mensaje-moroso", "");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.locator(".tx-muestra[data-tipo='vencido']").click();
  await page.waitForFunction(() => (document.getElementById("tx-previa-marco") || {}).srcdoc);
  const muestra = await page.evaluate(() => (window.__llamadas.find((l) => l.funcion && l.funcion.action === "muestra") || {}).funcion);
  igual("«Ver cómo queda» pide la muestra con lo escrito, sin guardar",
    muestra, { action: "muestra", tipo: "vencido", textos: {
      asunto: { proximo: null, vencido: "Falta el pago de {alumno}", moroso: null },
      mensaje: { proximo: null, vencido: null, moroso: null },
      comoPagar: "SINPE Móvil al 8888-8888" } });
  igual("y no escribe nada en la base",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "ajustes_academia").length), 0);
  igual("la vista previa se ve, con su asunto",
    await page.evaluate(() => [document.getElementById("tx-previa-marco").checkVisibility(),
                               document.getElementById("tx-previa-asunto").textContent]),
    [true, "Asunto: Asunto de muestra (vencido)"]);
  igual("el botón vuelve a decir lo que hace",
    (await page.locator(".tx-muestra[data-tipo='vencido']").textContent()).trim(), "👁️ Ver cómo queda");

  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#tx-guardar");
  await page.waitForTimeout(300);
  const textos = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "ajustes_academia" && l.verbo === "upsert"));
  igual("guardar manda las siete claves: lo escrito, y vacío (el de fábrica) lo demás",
    textos && textos.datos, [
      { clave: "cobros_como_pagar", valor: "SINPE Móvil al 8888-8888" },
      { clave: "cobros_asunto_proximo", valor: null },
      { clave: "cobros_mensaje_proximo", valor: null },
      { clave: "cobros_asunto_vencido", valor: "Falta el pago de {alumno}" },
      { clave: "cobros_mensaje_vencido", valor: null },
      { clave: "cobros_asunto_moroso", valor: null },
      { clave: "cobros_mensaje_moroso", valor: null },
    ]);

  await page.evaluate(() => { window.__llamadas = []; });
  await page.locator("#morosos-lista button", { hasText: "Recordar ahora" }).click();
  await page.waitForTimeout(400);
  igual("lo que manda «Recordar ahora»",
    await page.evaluate(() => (window.__llamadas.find((l) => l.funcion && l.funcion.action === "recordar_ahora") || {}).funcion),
    { action: "recordar_ahora", student_id: "u-ana" });

  // -------- recordatorio programado: un día y hora exactos
  const listaProgramados = await page.evaluate(() => document.getElementById("rp-lista").textContent);
  igual("el sembrado se pinta con el nombre del alumno y «Pendiente»",
    /Bruno Mena/.test(listaProgramados) && /Pendiente/.test(listaProgramados), "true");

  await page.selectOption("#rp-alumno", "u-ana");
  await page.fill("#rp-cuando", "2027-01-15T08:30");
  await page.fill("#rp-correos", "mama@x.cr, papa@x.cr");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#rp-guardar");
  await page.waitForTimeout(300);
  const programado = await page.evaluate(() =>
    (window.__llamadas.find((l) => l.tabla === "cobros_recordatorios_programados" && l.verbo === "insert") || {}).datos);
  igual("programar manda el alumno, el momento en ISO y los correos",
    programado && { student_id: programado.student_id, correos: programado.correos, creado_por: programado.creado_por },
    { student_id: "u-ana", correos: ["mama@x.cr", "papa@x.cr"], creado_por: "u-oscar" });
  igual("y el momento es el de verdad, no una hora distinta",
    programado && new Date(programado.programado_para).toISOString().slice(0, 16),
    new Date("2027-01-15T08:30").toISOString().slice(0, 16));

  // Un correo mal escrito no se manda, y se dice por qué.
  await page.fill("#rp-correos", "esto no es un correo");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#rp-guardar");
  await page.waitForTimeout(300);
  igual("un correo que no parece correo no se programa",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "cobros_recordatorios_programados" && l.verbo === "insert").length), 0);
  await page.fill("#rp-correos", "");

  // Cancelar el que ya estaba sembrado manda el estado, filtrado por su id.
  await page.evaluate(() => { window.__llamadas = []; });
  await page.locator("#rp-lista button", { hasText: "Cancelar" }).click();
  await page.waitForTimeout(300);
  const cancelado = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "cobros_recordatorios_programados" && l.verbo === "update"));
  igual("cancelar manda estado=cancelado", cancelado && cancelado.datos, { estado: "cancelado" });
  igual("y filtra por el id de ESE recordatorio",
    await page.evaluate(() => window.__consultas.some((c) => c.tabla === "cobros_recordatorios_programados" && c.verbo === "eq" && c.col === "id" && c.val === "rp-1")),
    "true");

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
    "22500|10000|12500|CRC|" + VENCE_C2 + "|Vencido|20");

  if (errores.length) { console.log("  ✗ errores en la página: " + errores.join(" | ")); fallos += 1; }
  await page.close();
}

const SUPERVISORA = { id: "u-sofia", full_name: "Sofía Vargas", email: "sofia@x.cr", role: "profesor", es_coordinador: false, es_supervisor: true, is_admin: false };

/* Quien supervisa: revisa el recibo antes de que salga, lo entrega (por
   correo o en mano), lo corrige, lo anula, corrige cobros, adelanta pagos y
   cambia el prefijo de los números de su academia. */
async function pruebaSupervisora(browser) {
  console.log("\n=== Quien supervisa ===");
  const { page, errores } = await abrir(browser, SUPERVISORA, ["c-1", "c-2", "c-3", "c-4"]);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.click('[data-ficha="recibos"]');
  await page.waitForTimeout(300);
  const fila = (id) => page.locator('#rc-lista .recibo-fila[data-id="' + id + '"]');

  igual("la ficha dice cuántos recibos faltan por entregar",
    await page.evaluate(() => document.getElementById("rc-pendientes-ficha").textContent), " (1 por entregar)");
  igual("el que falta ofrece mandarlo, entregarlo en mano, corregirlo y anularlo",
    await fila("r-1").locator("button").allTextContents(),
    ["👁️ Ver o imprimir", "📧 Mandar por correo", "Marcar como entregado en mano", "Corregir", "Anular"]);
  igual("el anulado solo se ve o se reactiva",
    await fila("r-3").locator("button").allTextContents(), ["👁️ Ver o imprimir", "Reactivar"]);

  // Mandar: primero se ve (es la revisión) y después se manda ESE.
  await page.evaluate(() => { window.__llamadas = []; });
  await fila("r-1").locator("button", { hasText: "Mandar por correo" }).click();
  await page.waitForFunction(() => { const m = document.querySelector("#rc-previa iframe"); return m && m.srcdoc; });
  igual("antes de mandarlo se ve, y dice a qué correo sale",
    /Se manda a: rosa@x\.cr/.test(await page.evaluate(() => document.getElementById("rc-previa-destinos").textContent)), "true");
  igual("y todavía no se mandó nada",
    await page.evaluate(() => window.__llamadas.some((l) => l.funcion && l.funcion.action === "recibo_enviar")), "false");
  await page.locator("#rc-previa-botones button", { hasText: "Ya lo revisé: mandarlo" }).click();
  await page.waitForTimeout(400);
  igual("«Ya lo revisé: mandarlo» manda ESE recibo",
    await page.evaluate(() => (window.__llamadas.find((l) => l.funcion && l.funcion.action === "recibo_enviar") || {}).funcion),
    { action: "recibo_enviar", recibo_id: "r-1" });

  await page.evaluate(() => { window.__llamadas = []; });
  await fila("r-1").locator("button", { hasText: "Marcar como entregado en mano" }).click();
  await page.waitForTimeout(300);
  igual("«Marcar como entregado en mano» lo apunta en la base",
    await page.evaluate(() => (window.__llamadas.find((l) => l.rpc === "recibo_entregado_en_mano") || {}).args),
    { p_recibo: "r-1", p_entregado: true });

  // Corregir: solo viaja el monto que cambió.
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ fecha: "2026-09-11", metodo: "transferencia", referencia: "T-1", nota: "", m0: "8000" }]; });
  await fila("r-1").locator("button", { hasText: "Corregir" }).click();
  await page.waitForTimeout(300);
  igual("corregir manda la fecha, el método y el monto nuevo de esa línea",
    await page.evaluate(() => (window.__llamadas.find((l) => l.rpc === "corregir_recibo") || {}).args),
    { p_recibo: "r-1", p_fecha: "2026-09-11", p_metodo: "transferencia", p_referencia: "T-1", p_nota: null, p_montos: { "pg-1": 8000 } });
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ fecha: "2026-09-11", metodo: "sinpe", referencia: "", nota: "", m0: "10000" }]; });
  await fila("r-1").locator("button", { hasText: "Corregir" }).click();
  await page.waitForTimeout(300);
  igual("sin cambiar montos, no se manda ninguno",
    await page.evaluate(() => (window.__llamadas.find((l) => l.rpc === "corregir_recibo") || {}).args.p_montos), null);
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ fecha: "2099-01-01", metodo: "sinpe", referencia: "", nota: "", m0: "10000" }]; });
  await fila("r-1").locator("button", { hasText: "Corregir" }).click();
  await page.waitForTimeout(300);
  igual("una fecha futura no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "corregir_recibo").length), 0);

  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = ["Se registró dos veces"]; });
  await fila("r-1").locator("button", { hasText: "Anular" }).click();
  await page.waitForTimeout(300);
  igual("anular manda ESE recibo con el motivo",
    await page.evaluate(() => (window.__llamadas.find((l) => l.rpc === "anular_recibo") || {}).args),
    { p_recibo: "r-1", p_anular: true, p_motivo: "Se registró dos veces" });
  await page.evaluate(() => { window.__llamadas = []; });
  await fila("r-3").locator("button", { hasText: "Reactivar" }).click();
  await page.waitForTimeout(300);
  igual("reactivar uno anulado",
    await page.evaluate(() => (window.__llamadas.find((l) => l.rpc === "anular_recibo") || {}).args),
    { p_recibo: "r-3", p_anular: false, p_motivo: null });

  // -------- el pago adelantado
  await page.selectOption("#pa-alumno", "u-ana");
  igual("ofrece adelantar el plan de ese alumno o pagar otra cosa",
    await page.evaluate(() => [...document.getElementById("pa-que").options].map((o) => o.value)), ["s-1", "otro"]);
  igual("y dice cuánto es cada periodo, con la beca",
    /Cada mes de este plan es de ₡22500/.test(sinSeparadores(await page.evaluate(() => document.getElementById("pa-plan-ayuda").textContent))), "true");
  await page.fill("#pa-periodos", "3");
  await page.selectOption("#pa-metodo", "transferencia");
  await page.fill("#pa-referencia", "BN-77");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#pa-guardar");
  await page.waitForTimeout(500);
  igual("adelantar tres meses lo hace la base con ESA suscripción",
    await page.evaluate(() => (window.__llamadas.find((l) => l.rpc === "pago_adelantado") || {}).args),
    { p_suscripcion: "s-1", p_periodos: 3, p_metodo: "transferencia", p_referencia: "BN-77", p_nota: null, p_fecha: HOY_CR });
  igual("y enseguida se le pone delante el recibo para revisarlo",
    await page.evaluate(() => window.__avisos.some((a) => a.includes("Revisa el recibo R-ADAPZ-2026-0004"))), "true");
  await page.fill("#pa-periodos", "30");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#pa-guardar");
  await page.waitForTimeout(300);
  igual("más de 24 periodos no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "pago_adelantado").length), 0);

  await page.selectOption("#pa-que", "otro");
  igual("«Otra cosa» cambia los campos",
    await page.evaluate(() => [document.getElementById("pa-plan-cell").checkVisibility(), document.getElementById("pa-otro-cell").checkVisibility()]),
    [false, true]);
  await page.fill("#pa-concepto", "Inscripción al torneo");
  await page.fill("#pa-monto", "15000");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#pa-guardar");
  await page.waitForTimeout(500);
  igual("un pago sin cobro previo emite su cobro pagado, con su recibo",
    await page.evaluate(() => (window.__llamadas.find((l) => l.rpc === "registrar_cobro_pagado") || {}).args),
    { p_alumno: "u-ana", p_concepto: "Inscripción al torneo", p_monto: 15000, p_moneda: "CRC", p_metodo: "transferencia",
      p_referencia: null, p_nota: null, p_fecha: HOY_CR });

  // -------- el prefijo de los números: solo las academias que supervisa
  igual("ve el prefijo de su academia y nada más",
    await page.evaluate(() => [document.getElementById("rc-prefijo-caja").checkVisibility(),
      [...document.getElementById("rc-academia").options].map((o) => o.textContent), document.getElementById("rc-prefijo").value]),
    [true, ["ADAPZ"], "ADAPZ"]);
  await page.fill("#rc-prefijo", "A B");
  await page.evaluate(() => { window.__llamadas = []; });
  await page.click("#rc-prefijo-guardar");
  await page.waitForTimeout(300);
  igual("un prefijo con espacios no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.rpc === "academia_guardar_prefijo_recibo").length), 0);
  await page.fill("#rc-prefijo", "adz");
  await page.click("#rc-prefijo-guardar");
  await page.waitForTimeout(300);
  igual("guardar el prefijo manda la academia y el prefijo en mayúscula",
    await page.evaluate(() => (window.__llamadas.find((l) => l.rpc === "academia_guardar_prefijo_recibo") || {}).args),
    { p_academia: "a-adapz", p_prefijo: "ADZ" });

  // -------- corregir un cobro y reactivar uno anulado
  await page.click('[data-ficha="cobros"]');
  await page.evaluate(() => document.querySelectorAll("#cobros-lista > details").forEach((d) => { d.open = true; }));
  igual("en el cobro pagado y en el anulado, quien supervisa tiene qué corregir",
    await page.evaluate(() => [...document.querySelectorAll("#cobros-lista .cobro-fila")].map((d) =>
      [...d.querySelectorAll("button")].map((b) => b.textContent).join("|"))),
    ["Corregir|💵 Registrar pago|Anular", "Corregir|💵 Registrar pago|Anular", "Corregir", "Reactivar"]);
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ concepto: "Mensualidad · agosto (corregida)", monto: "20000", vence: "2026-08-10" }]; });
  await page.locator("#cobros-lista .cobro-fila").nth(1).locator("button", { hasText: "Corregir" }).click();
  await page.waitForTimeout(300);
  const corrige = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "cobros" && l.verbo === "update"));
  igual("corregir un cobro manda concepto, monto y vencimiento, a ESE cobro",
    corrige && { datos: corrige.datos, filtros: corrige.filtros },
    { datos: { concepto: "Mensualidad · agosto (corregida)", monto: 20000, vence: "2026-08-10" }, filtros: [{ col: "id", eq: "c-2" }] });
  await page.evaluate(() => { window.__llamadas = []; window.__respuestas = [{ concepto: "Mensualidad", monto: "5000", vence: "2026-08-10" }]; });
  await page.locator("#cobros-lista .cobro-fila").nth(1).locator("button", { hasText: "Corregir" }).click();
  await page.waitForTimeout(300);
  igual("por debajo de lo ya pagado (₡10 000) no se manda",
    await page.evaluate(() => window.__llamadas.filter((l) => l.tabla === "cobros").length), 0);
  // Guardar recarga la lista, que vuelve a cerrar los meses de atrás.
  await page.evaluate(() => { window.__llamadas = []; document.querySelectorAll("#cobros-lista > details").forEach((d) => { d.open = true; }); });
  await page.locator("#cobros-lista .cobro-fila").nth(3).locator("button", { hasText: "Reactivar" }).click();
  await page.waitForTimeout(300);
  const reactiva = await page.evaluate(() => window.__llamadas.find((l) => l.tabla === "cobros" && l.verbo === "update"));
  igual("reactivar un cobro anulado",
    reactiva && { datos: reactiva.datos, filtros: reactiva.filtros },
    { datos: { estado: "emitido", anulado_motivo: null }, filtros: [{ col: "id", eq: "c-4" }] });

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
  igual("ve sus dos cobros",
    await page.evaluate(() => document.querySelectorAll("#alumno-lista > div").length), 2);
  igual("y sus recibos, que son solo los suyos",
    await page.evaluate(() => [document.getElementById("alumno-recibos-caja").checkVisibility(),
      [...document.querySelectorAll("#alumno-recibos > div p:first-child")].map((p) => p.textContent.split(" · ")[0])]),
    [true, ["R-ADAPZ-2026-0001"]]);
  await page.evaluate(() => { window.__llamadas = []; });
  await page.locator("#alumno-recibos button", { hasText: "Ver recibo" }).click();
  await page.waitForFunction(() => { const m = document.querySelector("#alumno-previa iframe"); return m && m.srcdoc; });
  igual("ve su recibo, sin cómo mandarlo",
    await page.evaluate(() => [(window.__llamadas.find((l) => l.funcion && l.funcion.action === "recibo_ver") || {}).funcion,
      [...document.querySelectorAll("#alumno-previa-botones button")].map((b) => b.textContent)]),
    [{ action: "recibo_ver", recibo_id: "r-1" }, ["🖨️ Imprimir o guardar en PDF", "Cerrar"]]);
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
    await pruebaSupervisora(browser);
    await pruebaProfesora(browser);
    await pruebaAlumna(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
