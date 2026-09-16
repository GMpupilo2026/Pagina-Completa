/* Comprueba las dos páginas de formularios de inscripción en un navegador de
   verdad, con un Supabase de mentira:
     · formularios.html — el armador: que solo entre quien coordina, que la
       plantilla ponga las preguntas, y sobre todo QUÉ manda a guardar.
     · formulario.html — el lado público: que pinte cada tipo de pregunta, que
       no deje mandar sin los obligatorios y que el cuerpo que envía sea el
       correcto.

   Lo que hace cumplir la base (quién puede crear, quién ve qué respuestas) se
   comprobó impersonando roles en SQL. Esto es lo otro: que la página mande lo
   correcto, que es lo que se rompe al tocarla y no da ningún error.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-formularios.js                */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

const CAMPOS = [
    { id: "nombre",    etiqueta: "Nombre completo",   tipo: "texto",    requerido: true,  ayuda: "", opciones: [] },
    { id: "nacimiento", etiqueta: "Fecha de nacimiento", tipo: "fecha", requerido: true,  ayuda: "", opciones: [] },
    { id: "correo",    etiqueta: "Correo del encargado", tipo: "correo", requerido: true, ayuda: "Ahí se manda la confirmación.", opciones: [] },
    { id: "modalidad", etiqueta: "Modalidad",         tipo: "opcion",   requerido: false, ayuda: "", opciones: ["Presencial", "En línea"] },
    { id: "dias",      etiqueta: "Días que puede",    tipo: "varias",   requerido: false, ayuda: "", opciones: ["Sábado", "Domingo"] },
    { id: "notas",     etiqueta: "Algo más",          tipo: "parrafo",  requerido: false, ayuda: "", opciones: [] },
    { id: "autoriza",  etiqueta: "Autorizo el uso de los datos", tipo: "si_no", requerido: true, ayuda: "", opciones: [] },
];

const FORM = {
    id: "form-1", slug: "torneo-sub14-ab12", titulo: "Inscripción al Torneo Sub-14",
    descripcion: "Sábado 4 de octubre, en el Liceo.", grupo: "7A",
    campos: CAMPOS, abierto: true, cierra_el: null,
    creado_por: "u-karina", created_at: "2026-09-01T00:00:00Z",
    formulario_respuestas: [{ count: 2 }],
};

const RESPUESTAS = [
    { created_at: "2026-09-10T10:00:00Z", respuestas: { nombre: "Ana Rojas", correo: "mama@x.cr", dias: ["Sábado", "Domingo"], autoriza: true } },
    { created_at: "2026-09-09T10:00:00Z", respuestas: { nombre: "Bruno Mena", correo: "papa@x.cr", modalidad: "En línea", autoriza: false } },
];

function clienteFalso(datos, usuarioId) {
  return `
window.__escrituras = [];
window.__rpc = [];
(function () {
  const DATOS = ${JSON.stringify(datos)};
  function constructor(nombre, filas) {
    let unica = false;
    const b = {
      select() { return b; }, eq() { return b; }, order() { return b; }, in() { return b; },
      limit() { return b; }, range() { return b; }, is() { return b; }, not() { return b; },
      maybeSingle() { unica = true; return b; },
      single() { unica = true; return b; },
      insert(fila) { window.__escrituras.push({ tabla: nombre, accion: "insert", fila: fila }); return b; },
      update(fila) { window.__escrituras.push({ tabla: nombre, accion: "update", fila: fila }); return b; },
      delete() { window.__escrituras.push({ tabla: nombre, accion: "delete" }); return b; },
      then(res, rej) {
        let d = filas;
        if (Array.isArray(d) && unica) d = d.length ? d[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }
  window.sb = {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: ${JSON.stringify(usuarioId)}, }, access_token: "t" } } }) },
    from: (t) => constructor(t, DATOS.tablas[t] !== undefined ? DATOS.tablas[t] : []),
    rpc: (n, args) => {
      window.__rpc.push({ nombre: n, args: args || null });
      const v = DATOS.rpc[n];
      return constructor("rpc:" + n, typeof v === "function" ? v : v !== undefined ? v : []);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
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

async function abrir(browser, ruta, script) {
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

async function pruebaArmador(browser) {
  console.log("\n=== El armador (formularios.html) ===");

  // Un profesor que NO coordina no pasa de la puerta.
  const sinPermiso = await abrir(browser, "/formularios.html", clienteFalso({
    rpc: {}, tablas: { profiles: [{ id: "u-luis", role: "profesor", is_admin: false, es_coordinador: false }] },
  }, "u-luis"));
  await sinPermiso.page.waitForSelector("#denegado:not(.hidden)", { timeout: 20000 });
  igual("profesor sin coordinar: no entra",
    await sinPermiso.page.evaluate(() => document.getElementById("app").classList.contains("hidden")), "true");
  igual("profesor sin coordinar: no se escribió nada",
    await sinPermiso.page.evaluate(() => window.__escrituras.length), 0);
  await sinPermiso.page.close();

  // Quien coordina sí.
  const { page, errores } = await abrir(browser, "/formularios.html", clienteFalso({
    rpc: { informes_resumen_alumnos: [{ id: "a1", grupo: "7A" }, { id: "a2", grupo: "7B" }, { id: "a3", grupo: null }] },
    tablas: {
      profiles: [{ id: "u-karina", role: "profesor", is_admin: false, es_coordinador: true, full_name: "Karina" }],
      formularios: [FORM],
      formulario_respuestas: RESPUESTAS,
    },
  }, "u-karina"));
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  igual("la lista muestra el formulario con sus respuestas",
    await page.evaluate(() => document.querySelector("#lista h3").textContent.trim() + " · " +
      document.querySelector("#lista p").textContent.replace(/\s+/g, " ").trim()),
    "Inscripción al Torneo Sub-14 · 7A · 7 preguntas · 2 respuestas");
  igual("los equipos salen de los alumnos que uno ve",
    await page.evaluate(() => [...document.getElementById("f-grupo").options].map((o) => o.textContent)),
    ["— Sin equipo en particular —", "7A", "7B"]);

  // Formulario nuevo con la plantilla.
  await page.click("#nuevo-btn");
  await page.waitForSelector("#vista-editor:not(.hidden)");
  page.on("dialog", (d) => d.accept());
  await page.click("#plantilla-btn");
  igual("la plantilla pone las preguntas de una inscripción",
    await page.evaluate(() => document.querySelectorAll("#campos > div").length), 11);

  await page.fill("#f-titulo", "Torneo Nacional Sub-16");
  await page.selectOption("#f-grupo", "7B");
  await page.fill("#f-cierra", "2026-10-20");
  await page.click("#guardar-btn");
  await page.waitForFunction(() => window.__escrituras.length > 0);
  const insercion = await page.evaluate(() => window.__escrituras[0]);
  igual("guarda en la tabla correcta", insercion.tabla + "/" + insercion.accion, "formularios/insert");
  igual("el título y el equipo", [insercion.fila.titulo, insercion.fila.grupo], ["Torneo Nacional Sub-16", "7B"]);
  igual("el slug es legible y lleva algo al azar",
    /^torneo-nacional-sub-16-[a-z0-9]{4}$/.test(insercion.fila.slug), "true");
  igual("«cierra el 20» deja contestar todo el día 20",
    insercion.fila.cierra_el.slice(0, 10) + " " + (new Date(insercion.fila.cierra_el).getHours() >= 23 ? "de noche" : "temprano"),
    "2026-10-20 de noche");
  igual("cada pregunta lleva su id, y no se repiten",
    (() => {
      const ids = insercion.fila.campos.map((c) => c.id);
      return new Set(ids).size === ids.length ? ids.slice(0, 3).join(",") : "HAY REPETIDOS";
    })(), "nombre_completo,fecha_de_nacimiento,genero");
  igual("una pregunta de opciones guarda sus opciones",
    insercion.fila.campos.find((c) => c.id === "modalidad").opciones, ["Presencial", "En línea"]);
  igual("se guarda quién lo creó", insercion.fila.creado_por, "u-karina");

  // Al guardar ya vuelve solo a la lista; desde ahí, las respuestas.
  await page.waitForSelector("#vista-lista:not(.hidden)");
  await page.evaluate(() => [...document.querySelectorAll("#lista button")].find((b) => b.textContent === "Respuestas").click());
  await page.waitForSelector("#vista-respuestas:not(.hidden)");
  igual("la tabla de respuestas: cabecera",
    await page.evaluate(() => [...document.querySelectorAll("#respuestas-cabecera th")].map((t) => t.textContent)),
    ["Fecha", "Nombre completo", "Fecha de nacimiento", "Correo del encargado", "Modalidad", "Días que puede", "Algo más", "Autorizo el uso de los datos"]);
  igual("varias opciones se leen juntas, y sí/no se lee en palabras",
    await page.evaluate(() => {
      const f = document.querySelectorAll("#respuestas-cuerpo tr")[0];
      return [...f.children].map((c) => c.textContent).slice(1).join(" | ");
    }),
    "Ana Rojas |  | mama@x.cr |  | Sábado, Domingo |  | Sí");
  igual("y el «no» también", await page.evaluate(() => {
      const f = document.querySelectorAll("#respuestas-cuerpo tr")[1];
      return f.children[f.children.length - 1].textContent;
    }), "No");

  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await page.close();
}

async function pruebaPublica(browser) {
  console.log("\n=== El lado público (formulario.html) ===");

  const sinSlug = await abrir(browser, "/formulario.html", clienteFalso({ rpc: {}, tablas: {} }, null));
  await sinSlug.page.waitForSelector("#no-esta:not(.hidden)", { timeout: 20000 });
  igual("sin enlace válido, lo dice", "ok", "ok");
  await sinSlug.page.close();

  const { page, errores } = await abrir(browser, "/formulario.html?f=torneo-sub14-ab12", clienteFalso({
    rpc: { formulario_publico: [{ titulo: FORM.titulo, descripcion: FORM.descripcion, grupo: FORM.grupo, campos: CAMPOS, cierra_el: "2026-10-04T23:59:59Z" }],
           responder_formulario: { ok: true } },
    tablas: {},
  }, null));
  await page.waitForSelector("#formulario:not(.hidden)", { timeout: 20000 });

  igual("el título, el equipo y la fecha de cierre",
    await page.evaluate(() => [document.getElementById("titulo").textContent,
                               document.getElementById("equipo").textContent,
                               document.getElementById("cierre").textContent].join(" | ")),
    "Inscripción al Torneo Sub-14 | 7A | Se puede llenar hasta el 4 de octubre de 2026.");
  igual("cada pregunta con su control",
    await page.evaluate(() => [...document.querySelectorAll("#campos > div")].map((d) => {
      const c = d.querySelector("input, select, textarea, fieldset");
      return c.tagName.toLowerCase() + (c.type ? ":" + c.type : "");
    })),
    ["input:text", "input:date", "input:email", "select:select-one", "fieldset:fieldset", "textarea:textarea", "input:checkbox"]);
  igual("los obligatorios llevan su marca",
    await page.evaluate(() => document.querySelectorAll('#campos span[aria-hidden="true"]').length), 4);
  igual("un grupo de casillas se rotula con legend, no con label",
    await page.evaluate(() => !!document.querySelector("#campo-4 legend") && !document.querySelector('label[for="campo-4"]')), "true");
  igual("la aclaración aparece", await page.evaluate(() =>
    document.querySelectorAll("#campos > div")[2].textContent.indexOf("Ahí se manda la confirmación.") !== -1), "true");

  // Mandar sin los obligatorios no llama a la base.
  await page.click("#enviar");
  igual("sin los obligatorios, avisa y no manda nada",
    await page.evaluate(() => document.getElementById("msg").textContent + " · llamadas: " +
      window.__rpc.filter((r) => r.nombre === "responder_formulario").length),
    "Falta llenar: Nombre completo · llamadas: 0");

  await page.fill("#campo-0", "Ana Rojas");
  await page.fill("#campo-1", "2012-05-03");
  await page.fill("#campo-2", "mama@x.cr");
  await page.selectOption("#campo-3", "En línea");
  await page.check("#campo-4 input[value='Sábado']");
  await page.check("#campo-6");
  await page.click("#enviar");
  await page.waitForSelector("#listo:not(.hidden)");
  const envio = await page.evaluate(() => window.__rpc.find((r) => r.nombre === "responder_formulario").args);
  igual("manda el slug del enlace", envio.p_slug, "torneo-sub14-ab12");
  igual("manda las respuestas con la clave de cada pregunta", envio.p_respuestas,
    { nombre: "Ana Rojas", nacimiento: "2012-05-03", correo: "mama@x.cr", modalidad: "En línea", dias: ["Sábado"], autoriza: true });
  igual("lo que se dejó en blanco no se manda", "notas" in envio.p_respuestas, "false");

  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaArmador(browser);
    await pruebaPublica(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: las dos páginas mandan lo correcto.");
  process.exit(fallos ? 1 : 0);
})();
