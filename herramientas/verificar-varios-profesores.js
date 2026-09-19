/* Comprueba, en un navegador de verdad y con un Supabase de mentira, lo que el
   cambio de "un profesor por alumno" a "varios" agregó al navegador:

   1. El panel de administración: las etiquetas de profesores de cada alumno,
      quitar y agregar (que manda la lista COMPLETA con set_teachers), la
      asignación en lote con sus tres modos, el conteo de alumnos por profesor
      —un alumno compartido suma para los dos— y el aviso de alumnos sueltos.
   2. js/clase-elegida.js: en qué clase entra un alumno con varios profesores,
      qué recuerda y cuándo el selector no debe aparecer.

   Lo que la base hace cumplir (la RLS) no se prueba acá: eso se comprobó
   impersonando roles en SQL. Esto es lo otro — que la página mande lo correcto.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-varios-profesores.js       */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const OSCAR  = { id: "u-oscar",  role: "profesor", is_admin: true,  full_name: "Oscar Angulo", email: "oscar@x.cr", grupo: null, teacher_id: null, invitaciones_max: 0, invitaciones_usadas: 0, created_at: "2026-01-01T00:00:00Z" };
const KARINA = { id: "u-karina", role: "profesor", is_admin: false, full_name: "Karina Rojas", email: "karina@x.cr", grupo: null, teacher_id: null, invitaciones_max: 5, invitaciones_usadas: 1, created_at: "2026-01-02T00:00:00Z" };
const LUIS   = { id: "u-luis",   role: "profesor", is_admin: false, full_name: "Luis Mora",    email: "luis@x.cr",   grupo: null, teacher_id: null, invitaciones_max: 0, invitaciones_usadas: 0, created_at: "2026-01-03T00:00:00Z" };
const ANA    = { id: "u-ana",    role: "alumno",   is_admin: false, full_name: "Ana Rojas",    email: "ana@x.cr",    grupo: "7A", teacher_id: "u-karina", created_at: "2026-02-01T00:00:00Z" };
const BRUNO  = { id: "u-bruno",  role: "alumno",   is_admin: false, full_name: "Bruno Mena",   email: "bruno@x.cr",  grupo: "7B", teacher_id: "u-karina", created_at: "2026-02-02T00:00:00Z" };
const CARLA  = { id: "u-carla",  role: "alumno",   is_admin: false, full_name: "Carla Soto",   email: "carla@x.cr",  grupo: "7B", teacher_id: null, created_at: "2026-02-03T00:00:00Z" };

// Ana tiene DOS profesores; Bruno uno; Carla ninguno.
const PAREJAS = [
  { student_id: "u-ana",   teacher_id: "u-karina" },
  { student_id: "u-ana",   teacher_id: "u-luis" },
  { student_id: "u-bruno", teacher_id: "u-karina" },
];

const DATOS = {
  rpc: {},
  tablas: {
    profiles: [OSCAR, KARINA, LUIS, ANA, BRUNO, CARLA],
    profile_teachers: PAREJAS,
  },
};

function clienteFalso(datos, usuarioId) {
  return `
window.__llamadas = [];
(function () {
  const DATOS = ${JSON.stringify(datos)};
  function constructor(filas) {
    let unica = false;
    const b = {
      select() { return b; }, eq() { return b; }, order() { return b; }, in() { return b; },
      limit() { return b; }, range() { return b; }, is() { return b; }, not() { return b; },
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
      getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)} }, access_token: "t" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(DATOS.tablas[t] !== undefined ? DATOS.tablas[t] : []),
    rpc: (n) => constructor(DATOS.rpc[n] !== undefined ? DATOS.rpc[n] : []),
    channel: () => ({ on() { return this; }, subscribe() { return this; }, track() { return Promise.resolve(); }, presenceState: () => ({}) }),
    removeChannel: () => {},
  };
  // La Edge Function del panel se atiende acá: se apunta qué mandó y se
  // responde que sí, para poder comprobar el cuerpo exacto de cada acción.
  const fetchReal = window.fetch;
  window.fetch = function (url, opciones) {
    if (String(url).indexOf("/functions/v1/") !== -1) {
      const cuerpo = JSON.parse((opciones && opciones.body) || "{}");
      window.__llamadas.push(cuerpo);
      return Promise.resolve(new Response(JSON.stringify({ ok: true, asignados: (cuerpo.target_ids || []).length, saltados: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return fetchReal.apply(this, arguments);
  };
})();
`;
}

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = typeof hallado === "object" ? JSON.stringify(hallado) : String(hallado);
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : String(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

async function pagina(browser, ruta, script) {
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  await page.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.route("**/js/supabase-client.js", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: script }));
  await page.goto(BASE + ruta, { waitUntil: "networkidle" });
  return { page, errores };
}

async function pruebaAdmin(browser) {
  console.log("\n=== Panel de administración ===");
  const { page, errores } = await pagina(browser, "/admin.html", clienteFalso(DATOS, "u-oscar"));
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  // Desde "Administración por fichas de grupo" (#217) la tabla ya no se pinta
  // sola al entrar: primero se ven las fichas, y las cuentas aparecen recién
  // al abrir un grupo o al buscar. Acá se busca "x.cr", que está en las seis
  // direcciones de prueba, para traerlas todas a la vista de una vez sin
  // depender de en qué grupo quedó cada una.
  await page.fill("#user-search", "x.cr");
  await page.waitForFunction(() => document.querySelectorAll("#users-body tr").length > 3, { timeout: 20000 });

  // La celda "Profesor" de cada alumno: una etiqueta por profesor.
  // El nombre se edita en un <input>, así que las filas se buscan por el correo.
  // Columnas de #users-body hoy: 0 marcar, 1 cuenta (nombre + correo), 2 rol,
  // 3 grupo, 4 profesores, 5 creado, 6 acciones — el correo vive DENTRO de la
  // celda de cuenta (el <a mailto:>), ya no en su propia columna, y "marcar"
  // corrió un puesto a las que venían después.
  const celda = (correo) => page.evaluate((buscado) => {
    const tr = window.__filaDe(buscado);
    if (!tr) return null;
    const celdaProfes = tr.children[4];
    return {
      etiquetas: [...celdaProfes.querySelectorAll("span.rounded-full")].map((e) => e.textContent.replace("✕", "").trim()),
      selector: celdaProfes.querySelector("select") ? celdaProfes.querySelector("select").options[0].textContent : null,
    };
  }, correo);

  await page.evaluate(() => {
    window.__filaDe = (correo) => [...document.querySelectorAll("#users-body tr")]
      .find((f) => f.children[1] && f.children[1].querySelector("a") && f.children[1].querySelector("a").textContent.trim() === correo);
  });

  igual("Ana: sus dos profesores", await celda("ana@x.cr"), { etiquetas: ["Karina Rojas", "Luis Mora"], selector: "＋ otro…" });
  igual("Bruno: uno, y puede sumar otro", await celda("bruno@x.cr"), { etiquetas: ["Karina Rojas"], selector: "＋ otro…" });
  igual("Carla: ninguno", await celda("carla@x.cr"), { etiquetas: [], selector: "— Sin asignar —" });

  // El panel de profesores cuenta a Ana para los dos.
  const porProfe = await page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll("#profesores-body tr")]
      .map((tr) => [tr.children[0].textContent.replace("👑", "").trim(), tr.children[1].textContent.trim()])));
  igual("alumnos de Karina", porProfe["Karina Rojas"], "2");
  igual("alumnos de Luis (Ana es compartida)", porProfe["Luis Mora"], "1");
  igual("alumnos de Oscar", porProfe["Oscar Angulo"], "0");
  igual("aviso de alumnos sin profesor",
    await page.evaluate(() => document.getElementById("sin-profesor-aviso").textContent.trim().split(":")[0]),
    "⚠️ Hay 1 alumno sin profesor asignado");

  // Quitarle Luis a Ana manda la lista COMPLETA que debe quedar.
  await page.evaluate(() => {
    const tr = window.__filaDe("ana@x.cr");
    const chip = [...tr.children[4].querySelectorAll("span.rounded-full")].find((c) => c.textContent.indexOf("Luis") !== -1);
    chip.querySelector("button").click();
  });
  await page.waitForFunction(() => window.__llamadas.length > 0);
  igual("quitar un profesor manda la lista que queda", await page.evaluate(() => window.__llamadas[0]),
    { action: "set_teachers", target_id: "u-ana", teacher_ids: ["u-karina"] });

  // Agregarle uno manda la lista con los dos.
  await page.evaluate(() => {
    window.__llamadas.length = 0;
    const tr = window.__filaDe("bruno@x.cr");
    const sel = tr.children[4].querySelector("select");
    sel.value = "u-luis";
    sel.dispatchEvent(new Event("change"));
  });
  await page.waitForFunction(() => window.__llamadas.length > 0);
  igual("agregar un profesor mantiene el que ya tenía", await page.evaluate(() => window.__llamadas[0]),
    { action: "set_teachers", target_id: "u-bruno", teacher_ids: ["u-karina", "u-luis"] });

  // El lote, con su modo.
  await page.evaluate(() => {
    window.__llamadas.length = 0;
    [...document.querySelectorAll("#users-body input.marca-alumno")].forEach((c) => {
      if (!c.checked) { c.checked = true; c.dispatchEvent(new Event("change")); }
    });
  });
  await page.waitForSelector("#asignar-lote:not(.hidden)");
  await page.selectOption("#asignar-modo", "quitar");
  await page.selectOption("#asignar-profesor", "u-karina");
  await page.click("#asignar-btn");
  await page.waitForFunction(() => window.__llamadas.length > 0);
  const lote = await page.evaluate(() => window.__llamadas[0]);
  igual("el lote manda su modo", { action: lote.action, modo: lote.modo, teacher_id: lote.teacher_id }, { action: "assign_bulk", modo: "quitar", teacher_id: "u-karina" });
  igual("el lote manda solo alumnos", (lote.target_ids || []).slice().sort(), ["u-ana", "u-bruno", "u-carla"]);

  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await page.close();
}

async function pruebaSelectorDeClase(browser) {
  console.log("\n=== En qué clase entra el alumno ===");
  const page = await browser.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ path: require("path").join(__dirname, "..", "js", "clase-elegida.js") });

  const conClases = (clases, previa) => page.evaluate(async ([cs, p]) => {
    window.sb = { rpc: () => Promise.resolve({ data: cs, error: null }) };
    try { if (p) localStorage.setItem("clase_elegida_v1", p); else localStorage.removeItem("clase_elegida_v1"); } catch (e) {}
    const r = await window.ClaseElegida.resolver();
    const caja = document.createElement("div");
    caja.className = "hidden";
    document.body.appendChild(caja);
    window.ClaseElegida.montarSelector(caja, r.clases, r.elegida);
    const sel = caja.querySelector("select");
    return {
      elegida: r.elegida,
      selectorVisible: !caja.classList.contains("hidden"),
      opciones: sel ? [...sel.options].map((o) => o.textContent) : [],
      marcada: sel ? sel.value : null,
    };
  }, [clases, previa]);

  const KAR = { profesor_id: "u-karina", profesor: "Karina Rojas", es_principal: true,  clase_abierta: false, titulo_clase: null };
  const LU  = { profesor_id: "u-luis",   profesor: "Luis Mora",    es_principal: false, clase_abierta: true,  titulo_clase: "Finales" };

  igual("sin profesores: no hay clase ni selector", await conClases([], null), { elegida: null, selectorVisible: false, opciones: [], marcada: null });
  igual("con uno solo: entra ahí y NO se muestra un selector que no hace nada",
    await conClases([KAR], null), { elegida: "u-karina", selectorVisible: false, opciones: [], marcada: null });
  igual("con dos y sin elección previa: gana el que tiene clase abierta",
    await conClases([KAR, LU], null),
    { elegida: "u-luis", selectorVisible: true, opciones: ["Karina Rojas", "Luis Mora · 🟢 en clase"], marcada: "u-luis" });
  igual("con dos y elección previa: manda lo que eligió",
    await conClases([KAR, LU], "u-karina"),
    { elegida: "u-karina", selectorVisible: true, opciones: ["Karina Rojas", "Luis Mora · 🟢 en clase"], marcada: "u-karina" });
  igual("si el profesor elegido ya no está, se vuelve a decidir",
    await conClases([KAR], "u-luis"), { elegida: "u-karina", selectorVisible: false, opciones: [], marcada: null });

  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAdmin(browser);
    await pruebaSelectorDeClase(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: el navegador manda lo correcto.");
  process.exit(fallos ? 1 : 0);
})();
