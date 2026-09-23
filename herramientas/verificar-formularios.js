/* Comprueba las dos páginas de formularios de inscripción en un navegador de
   verdad, con un Supabase de mentira:
     · formularios.html — el armador: que solo entre quien coordina, que la
       plantilla ponga las preguntas, y sobre todo QUÉ manda a guardar; y que
       compartir un formulario con otro coordinador solo aparezca en uno
       propio ya guardado, y mande el formulario y el coordinador elegidos.
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
    // El papel declarado manda sobre la etiqueta…
    { id: "correo_alumno", etiqueta: "Su propio correo", tipo: "correo", requerido: false, ayuda: "", opciones: [], papel: "alumno_correo" },
    // …y este no lo declara: hay que deducirlo, como los formularios viejos.
    { id: "enc_nombre", etiqueta: "Nombre de la persona encargada", tipo: "texto", requerido: false, ayuda: "", opciones: [] },
];

const FORM = {
    id: "form-1", slug: "torneo-sub14-ab12", titulo: "Inscripción al Torneo Sub-14",
    descripcion: "Sábado 4 de octubre, en el Liceo.", grupo: "7A",
    campos: CAMPOS, abierto: true, cierra_el: null,
    creado_por: "u-karina", created_at: "2026-09-01T00:00:00Z",
    formulario_respuestas: [{ count: 2 }],
};

const RESPUESTAS = [
    { id: "resp-1", created_at: "2026-09-10T10:00:00Z", cuenta_id: null, cuenta_creada_at: null,
      respuestas: { nombre: "Ana Rojas", correo: "mama@x.cr", dias: ["Sábado", "Domingo"], autoriza: true,
                    correo_alumno: "ana@x.cr", enc_nombre: "Gina Rojas" } },
    // Esta ya tiene cuenta: su celda es una marca, no un botón.
    { id: "resp-2", created_at: "2026-09-09T10:00:00Z", cuenta_id: "u-bruno", cuenta_creada_at: "2026-09-11T10:00:00Z",
      respuestas: { nombre: "Bruno Mena", correo: "papa@x.cr", modalidad: "En línea", autoriza: false } },
];

function clienteFalso(datos, usuarioId) {
  return `
window.__escrituras = [];
window.__rpc = [];
window.__edge = [];
/* Los pone el cliente de verdad, que acá está ruteado; sin ellos la llamada a
   la Edge Function sale a "undefined/functions/v1/...". */
window.SUPABASE_URL = "https://ejemplo.supabase.co";
window.SUPABASE_ANON_KEY = "anon-de-mentira";
(function () {
  const original = window.fetch;
  window.fetch = function (url, opciones) {
    const u = String(url);
    if (u.indexOf("/functions/v1/") !== -1) {
      const cuerpo = JSON.parse((opciones && opciones.body) || "{}");
      window.__edge.push({ url: u, cuerpo: cuerpo, auth: opciones.headers.Authorization });
      const respuesta = window.__edgeRespuesta ||
        { ok: true, alumno_id: "u-nuevo", email: cuerpo.alumno_email, ya_tenia_cuenta: false, encargado_guardado: !!cuerpo.encargado_email };
      return Promise.resolve(new Response(JSON.stringify(respuesta),
        { status: respuesta.ok ? 200 : 400, headers: { "Content-Type": "application/json" } }));
    }
    return original.apply(this, arguments);
  };
})();
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
      // Quien administra, supervisa o coordina sin academia recibe todas.
      if (n === "mis_funciones_coordinacion") return Promise.resolve({ data: (window.__misFunciones || ["formularios","altas","solicitudes","cuentas","acceso","roles","cobros","equipos","subgrupos"]), error: null });
      window.__rpc.push({ nombre: n, args: args || null });
      const v = DATOS.rpc[n];
      return constructor("rpc:" + n, typeof v === "function" ? v : v !== undefined ? v : []);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    /* Storage de mentira: anota qué se sube y adónde, y al bajar entrega un PNG
       de verdad —o un error para las rutas marcadas como rotas—. */
    storage: {
      from: (bucket) => ({
        upload: (ruta, blob, op) => {
          window.__subidas = window.__subidas || [];
          window.__subidas.push({ bucket: bucket, ruta: ruta, tipo: op && op.contentType, bytes: blob.size, upsert: op && op.upsert });
          return Promise.resolve({ data: { path: ruta }, error: null });
        },
        download: (ruta) => {
          window.__bajadas = window.__bajadas || [];
          window.__bajadas.push({ bucket: bucket, ruta: ruta });
          if (/rota/.test(ruta)) return Promise.resolve({ data: null, error: { message: "Object not found" } });
          const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          return Promise.resolve({ data: new Blob([bytes], { type: "image/png" }), error: null });
        },
        list: () => Promise.resolve({ data: [], error: null }),
        remove: () => Promise.resolve({ data: [], error: null }),
      }),
    },
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
  page.on("pageerror", (e) => { errores.push(String(e)); if (process.env.DEPURAR) console.log("PAGEERR", String(e)); });
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
    "Inscripción al Torneo Sub-14 · 7A · 9 preguntas · 2 respuestas");
  igual("los equipos salen de los alumnos que uno ve",
    await page.evaluate(() => [...document.getElementById("f-grupo").options].map((o) => o.textContent)),
    ["— Sin equipo en particular —", "7A", "7B"]);

  /* El enlace que copia el botón, que es el único producto de esta página que
     sale de ella. Se mira DOS veces, con las dos direcciones en que Cloudflare
     sirve la misma página: con ".html" y sin él. Cortarle la extensión al
     pathname funciona en la primera y pega los dos nombres en la segunda
     ("/formulariosformulario.html"), y eso no da ningún error acá — el enlace
     se copia igual y el 404 lo ve quien lo recibe. */
  const copiado = async () => {
    await page.evaluate(() => {
      window.__copiado = null;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (t) => { window.__copiado = t; return Promise.resolve(); } },
      });
    });
    // El botón dice "¡Copiado!" un segundo y medio: hay que esperar a que vuelva.
    await page.waitForFunction(() => [...document.querySelectorAll("#lista button")].some((b) => b.textContent === "Copiar enlace"));
    await page.evaluate(() => [...document.querySelectorAll("#lista button")].find((b) => b.textContent === "Copiar enlace").click());
    await page.waitForFunction(() => window.__copiado !== null);
    return page.evaluate(() => window.__copiado);
  };

  igual("el enlace que se copia, abriendo la página con .html",
    (await copiado()).replace(BASE, ""), "/formulario.html?f=torneo-sub14-ab12");

  // La misma página servida sin extensión, que es como la deja Cloudflare.
  await page.evaluate(() => history.replaceState(null, "", "/formularios"));
  igual("el enlace que se copia, abriendo la página sin .html",
    (await copiado()).replace(BASE, ""), "/formulario.html?f=torneo-sub14-ab12");
  await page.evaluate(() => history.replaceState(null, "", "/formularios.html"));

  // Formulario nuevo con la plantilla.
  await page.click("#nuevo-btn");
  await page.waitForSelector("#vista-editor:not(.hidden)");
  page.on("dialog", (d) => d.accept());
  await page.click("#plantilla-btn");
  igual("la plantilla pone las preguntas de una inscripción",
    await page.evaluate(() => document.querySelectorAll("#campos > div").length), 13);

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
    })(), "nombre_completo,correo_del_alumno,fecha_de_nacimiento");
  igual("una pregunta de opciones guarda sus opciones",
    insercion.fila.campos.find((c) => c.id === "modalidad").opciones, ["Presencial", "En línea"]);
  igual("se guarda quién lo creó", insercion.fila.creado_por, "u-karina");

  // Al guardar ya vuelve solo a la lista; desde ahí, las respuestas.
  await page.waitForSelector("#vista-lista:not(.hidden)");
  await page.evaluate(() => [...document.querySelectorAll("#lista button")].find((b) => b.textContent === "Respuestas").click());
  await page.waitForSelector("#vista-respuestas:not(.hidden)");
  igual("la tabla de respuestas: cabecera",
    await page.evaluate(() => [...document.querySelectorAll("#respuestas-cabecera th")].map((t) => t.textContent)),
    ["Fecha", "Nombre completo", "Fecha de nacimiento", "Correo del encargado", "Modalidad", "Días que puede", "Algo más", "Autorizo el uso de los datos", "Su propio correo", "Nombre de la persona encargada", "Cuenta"]);
  igual("varias opciones se leen juntas, y sí/no se lee en palabras",
    await page.evaluate(() => {
      const f = document.querySelectorAll("#respuestas-cuerpo tr")[0];
      return [...f.children].map((c) => c.textContent).slice(1, 8).join(" | ");
    }),
    "Ana Rojas |  | mama@x.cr |  | Sábado, Domingo |  | Sí");
  igual("y el «no» también", await page.evaluate(() => {
      const f = document.querySelectorAll("#respuestas-cuerpo tr")[1];
      return f.children[7].textContent;
    }), "No");

  await pruebaAlta(page);

  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await page.close();
}

/* Crear la cuenta desde una respuesta. Es lo único de esta página que le manda
   un correo a una persona de verdad, y lo que decide a QUIÉN se lo manda es
   adivinar cuál de las preguntas era el correo del alumno: por eso lo que se
   mira acá es qué sale puesto en el diálogo y qué cuerpo se manda, no que el
   botón "haga algo". */
async function pruebaAlta(page) {
  console.log("\n=== Crear la cuenta desde una respuesta ===");

  // Qué pregunta es cuál, con las etiquetas de un formulario de verdad que NO
  // declara ningún papel — que es como están todos los que ya existen.
  igual("se deduce qué pregunta es cuál por su etiqueta",
    await page.evaluate(() => papelesDe([
      { id: "pregunta",   etiqueta: "Nombre y 2 apellidos", tipo: "texto" },
      { id: "pregunta_2", etiqueta: "correo electrónico",   tipo: "texto" },
      { id: "pregunta_4", etiqueta: "Nombre encargado",     tipo: "texto" },
      { id: "pregunta_3", etiqueta: "correo encargado",     tipo: "texto" },
    ])),
    { alumno_nombre: "pregunta", alumno_correo: "pregunta_2",
      encargado_nombre: "pregunta_4", encargado_correo: "pregunta_3" });

  igual("«Correo de la persona encargada» no se confunde con el del alumno",
    await page.evaluate(() => papelesDe([
      { id: "a", etiqueta: "Nombre completo", tipo: "texto" },
      { id: "b", etiqueta: "Correo de la persona encargada", tipo: "correo" },
    ])),
    { alumno_nombre: "a", encargado_correo: "b" });

  igual("el papel declarado manda sobre lo que diga la etiqueta",
    await page.evaluate(() => papelesDe([
      { id: "x", etiqueta: "Correo de la mamá", tipo: "correo", papel: "alumno_correo" },
    ])), { alumno_correo: "x" });

  // Una respuesta que ya tiene cuenta no vuelve a ofrecer invitar.
  igual("la que ya tiene cuenta muestra la marca, no el botón",
    await page.evaluate(() => {
      const f = document.querySelectorAll("#respuestas-cuerpo tr")[1];
      const celda = f.children[f.children.length - 1];
      return celda.querySelector("button") ? "BOTÓN" : celda.textContent.split(" el ")[0].trim();
    }), "✅ Creada");

  /* Que el diálogo esté escondido se mide por el `display` que calcula el
     navegador, no por la clase: una utilidad de Tailwind con la misma
     especificidad ya dejó una vez un cartel a la vista con su `hidden` puesto,
     y la comprobación daba verde igual. */
  igual("el diálogo arranca invisible de verdad",
    await page.evaluate(() => getComputedStyle(document.getElementById("alta-fondo")).display), "none");

  // La que no la tiene, sí.
  await page.evaluate(() => {
    const f = document.querySelectorAll("#respuestas-cuerpo tr")[0];
    f.children[f.children.length - 1].querySelector("button").click();
  });
  await page.waitForSelector("#alta-fondo:not(.hidden)");
  igual("y al abrirlo se ve",
    await page.evaluate(() => getComputedStyle(document.getElementById("alta-fondo")).display), "block");

  igual("el diálogo abre con cada dato en su lugar",
    await page.evaluate(() => [
      document.getElementById("alta-alumno-nombre").value,
      document.getElementById("alta-alumno-correo").value,
      document.getElementById("alta-encargado-nombre").value,
      document.getElementById("alta-encargado-correo").value,
      document.getElementById("alta-grupo").value,
    ]),
    ["Ana Rojas", "ana@x.cr", "Gina Rojas", "mama@x.cr", "7A"]);

  /* Sin correo del alumno no se manda nada: la invitación no tendría a dónde
     ir. El aviso además dice la salida —marcar «No tiene correo propio»—,
     porque este caso es justamente el de una familia que comparte el correo
     entre hermanos (ver verificar-alumno-sin-correo.js). */
  await page.fill("#alta-alumno-correo", "");
  await page.click("#alta-enviar");
  igual("sin el correo del alumno, avisa y no manda nada",
    await page.evaluate(() => document.getElementById("alta-msg").textContent + " · llamadas: " + window.__edge.length),
    "Falta el correo del alumno: es a donde va la invitación. Si no tiene, marca «No tiene correo propio». · llamadas: 0");

  await page.fill("#alta-alumno-correo", "ana@x.cr");
  await page.click("#alta-enviar");
  await page.waitForFunction(() => window.__edge.length > 0);

  const envio = await page.evaluate(() => window.__edge[0]);
  igual("llama a la función que da de alta", envio.url.replace(/^.*\/functions/, "/functions"),
    "/functions/v1/inscribir-alumno");
  /* `sin_correo: false` y `usuario: ""` van SIEMPRE, también en el alta normal:
     el servidor decide por ese campo y no por la ausencia del otro. */
  igual("manda el alumno, el encargado y de qué respuesta sale", envio.cuerpo,
    { respuesta_id: "resp-1", alumno_nombre: "Ana Rojas", alumno_email: "ana@x.cr",
      sin_correo: false, usuario: "",
      encargado_nombre: "Gina Rojas", encargado_email: "mama@x.cr",
      frecuencia: "semanal", grupo: "7A" });
  igual("va firmada con la sesión de quien lo hace", envio.auth, "Bearer t");

  await page.waitForFunction(() =>
    getComputedStyle(document.getElementById("alta-fondo")).display === "none");
  igual("y esa fila pasa a mostrar la marca",
    await page.evaluate(() => {
      const f = document.querySelectorAll("#respuestas-cuerpo tr")[0];
      const celda = f.children[f.children.length - 1];
      return celda.querySelector("button") ? "SIGUE EL BOTÓN" : celda.textContent.split(" el ")[0].trim();
    }), "✅ Creada");
}

/* Compartir un formulario con otro coordinador. Lo que hace cumplir quién
   puede leer qué se comprobó impersonando roles en SQL; esto es lo otro: que
   el bloque solo aparezca donde tiene que aparecer y que mande a la base
   exactamente lo que la pantalla dice que va a mandar. */
async function pruebaCompartir(browser) {
  console.log("\n=== Compartir con otro coordinador ===");

  const { page, errores } = await abrir(browser, "/formularios.html", clienteFalso({
    rpc: {
      informes_resumen_alumnos: [{ id: "a1", grupo: "7A" }],
      coordinadores_disponibles: [
        { id: "u-otro", nombre: "Otro Coordinador", email: "otro@x.cr" },
        { id: "u-tercero", nombre: "Tercera Coordinadora", email: "tercera@x.cr" },
      ],
    },
    tablas: {
      profiles: [{ id: "u-karina", role: "profesor", is_admin: false, es_coordinador: true, full_name: "Karina" }],
      formularios: [FORM],
      formulario_respuestas: RESPUESTAS,
      formulario_compartidos: [],
    },
  }, "u-karina"));
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  // Uno nuevo, sin id, no tiene con qué compartir todavía.
  await page.click("#nuevo-btn");
  await page.waitForSelector("#vista-editor:not(.hidden)");
  igual("un formulario nuevo no ofrece compartir",
    await page.evaluate(() => getComputedStyle(document.getElementById("bloque-compartir")).display), "none");
  await page.click("#volver-btn");
  await page.waitForSelector("#vista-lista:not(.hidden)");

  // El de siempre, que ya es de esta cuenta, sí.
  await page.evaluate(() => [...document.querySelectorAll("#lista button")].find((b) => b.textContent === "Editar").click());
  await page.waitForSelector("#vista-editor:not(.hidden)");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("bloque-compartir")).display !== "none");
  igual("un formulario propio SÍ ofrece compartir",
    await page.evaluate(() => getComputedStyle(document.getElementById("bloque-compartir")).display), "block");
  igual("el selector ofrece a los coordinadores disponibles",
    await page.evaluate(() => [...document.getElementById("c-agregar").options].map((o) => o.textContent)),
    ["Otro Coordinador", "Tercera Coordinadora"]);
  igual("todavía no se comparte con nadie", await page.evaluate(() =>
    getComputedStyle(document.getElementById("c-nadie")).display), "block");

  await page.selectOption("#c-agregar", "u-otro");
  await page.click("#c-sumar");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "formulario_compartidos"));
  const compartido = await page.evaluate(() => window.__escrituras.find((e) => e.tabla === "formulario_compartidos"));
  igual("compartir manda el formulario y el coordinador elegidos",
    [compartido.accion, compartido.fila.formulario_id, compartido.fila.coordinador_id],
    ["insert", FORM.id, "u-otro"]);
  igual("la etiqueta se pinta con su nombre",
    await page.evaluate(() => document.getElementById("c-etiquetas").textContent.trim()), "Otro Coordinador✕");
  igual("y ya no se ofrece de nuevo en el selector",
    await page.evaluate(() => [...document.getElementById("c-agregar").options].map((o) => o.textContent)),
    ["Tercera Coordinadora"]);

  await page.click("#c-etiquetas button");
  await page.waitForFunction(() => window.__escrituras.some((e) => e.tabla === "formulario_compartidos" && e.accion === "delete"));
  igual("dejar de compartir se lo dice a la base",
    await page.evaluate(() => window.__escrituras.filter((e) => e.tabla === "formulario_compartidos").map((e) => e.accion)),
    ["insert", "delete"]);
  igual("y la etiqueta desaparece",
    await page.evaluate(() => document.getElementById("c-etiquetas").children.length), 0);

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
    ["input:text", "input:date", "input:email", "select:select-one", "fieldset:fieldset", "textarea:textarea", "input:checkbox", "input:email", "input:text"]);
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

/* Imágenes adjuntas. Lo que se rompe callado acá: subir a la carpeta de OTRO
   formulario (la base lo rechazaría, pero la familia vería "no se pudo"), mandar
   rutas distintas de las que se subieron, o una respuesta con foto que en la
   tabla se ve como un cuadro vacío o sin forma de bajarla. */
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function pruebaImagenes(browser) {
  console.log("\n=== Archivos adjuntos ===");
  const CAMPOS_FOTO = [
    { id: "nombre", etiqueta: "Nombre completo", tipo: "texto", requerido: true, ayuda: "", opciones: [], papel: "alumno_nombre" },
    { id: "cedula", etiqueta: "Foto de la cédula", tipo: "imagen", requerido: true, ayuda: "", opciones: [] },
    { id: "comprobante", etiqueta: "Comprobante de pago", tipo: "archivo", requerido: false, ayuda: "", opciones: [] },
  ];
  const ID = "0b6f0c7e-1111-4222-8333-444455556666";
  const { page, errores } = await abrir(browser, "/formulario.html?f=con-foto", clienteFalso({
    rpc: { formulario_publico: [{ id: ID, titulo: "Con foto", descripcion: "", grupo: "", campos: CAMPOS_FOTO, cierra_el: null }],
           responder_formulario: { ok: true } },
    tablas: {},
  }, null));
  await page.waitForSelector("#formulario:not(.hidden)", { timeout: 20000 });
  igual("la pregunta de imagen es un selector de archivos de imagen",
    await page.evaluate(() => { const i = document.getElementById("campo-1"); return [i.type, i.accept, i.multiple]; }),
    ["file", "image/*", true]);
  igual("la de archivo acepta también PDF, Word y Excel",
    await page.evaluate(() => document.getElementById("campo-2").accept), "image/*,.pdf,.doc,.docx,.xls,.xlsx");

  await page.fill("#campo-0", "Ana Rojas");
  await page.click("#enviar");
  igual("sin la foto obligatoria no sube ni manda nada",
    await page.evaluate(() => document.getElementById("msg").textContent + " · " + (window.__subidas || []).length),
    "Falta llenar: Foto de la cédula · 0");

  const archivo = (n) => ({ name: n, mimeType: "image/png", buffer: PNG_1x1 });
  await page.setInputFiles("#campo-1", [archivo("frente.png"), archivo("atras.png"), archivo("sobra.png")]);
  igual("las elegidas se ven antes de mandar",
    await page.evaluate(() => [...document.querySelectorAll("#campo-1-lista img")].map((i) => i.alt)),
    ["Archivo 1: frente.png", "Archivo 2: atras.png", "Archivo 3: sobra.png"]);
  await page.click('#campo-1-lista button[aria-label^="Quitar el archivo 3"]');
  igual("quitar una la saca de la lista y lo dice",
    await page.evaluate(() => [document.querySelectorAll("#campo-1-lista img").length, document.getElementById("campo-1-estado").textContent]),
    [2, "2 archivos elegidos."]);

  // Un formato que no se recibe se dice ANTES de mandar, con su nombre.
  await page.setInputFiles("#campo-2", [{ name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") }]);
  await page.click("#enviar");
  await page.waitForFunction(() => /virus\.exe/.test(document.getElementById("msg").textContent));
  igual("un .exe no se sube y se dice cuál",
    await page.evaluate(() => [/no es un formato/.test(document.getElementById("msg").textContent),
      window.__rpc.filter((r) => r.nombre === "responder_formulario").length]), [true, 0]);
  await page.click('#campo-2-lista button[aria-label^="Quitar el archivo 1"]');
  await page.setInputFiles("#campo-2", [{ name: "Comprobante SINPE.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") }]);
  igual("un PDF se enseña con su nombre, no como miniatura",
    await page.evaluate(() => document.getElementById("campo-2-lista").textContent.replace("✕", "").trim()), "📄 Comprobante SINPE.pdf");

  await page.click("#enviar");
  await page.waitForSelector("#listo:not(.hidden)");
  const subidas = await page.evaluate(() => window.__subidas);
  igual("sube solo los que quedaron, al bucket privado",
    subidas.map((x) => x.bucket), ["formulario-adjuntos", "formulario-adjuntos", "formulario-adjuntos"]);
  igual("las fotos van a la carpeta de ESTE formulario, como JPG achicado, con su nombre y sin pisar nada",
    subidas.slice(0, 2).map((x) => [new RegExp("^" + ID + "/[a-z0-9-]{8,64}/").test(x.ruta), x.ruta.split("/").pop(), x.tipo, x.upsert]),
    [[true, "frente.jpg", "image/jpeg", false], [true, "atras.jpg", "image/jpeg", false]]);
  igual("el PDF va tal cual, con su nombre saneado y su tipo",
    [subidas[2].ruta.split("/").pop(), subidas[2].tipo], ["Comprobante-SINPE.pdf", "application/pdf"]);
  const envio = await page.evaluate(() => window.__rpc.find((r) => r.nombre === "responder_formulario").args);
  igual("la respuesta lleva exactamente las rutas que se subieron",
    [envio.p_respuestas.cedula, envio.p_respuestas.comprobante], [subidas.slice(0, 2).map((x) => x.ruta), [subidas[2].ruta]]);
  errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await page.close();

  // Del otro lado: quien coordina ve las fotos y las baja.
  const FORM_FOTO = Object.assign({}, FORM, { id: ID, campos: CAMPOS_FOTO, formulario_respuestas: [{ count: 1 }] });
  const r2 = await abrir(browser, "/formularios.html", clienteFalso({
    rpc: { informes_resumen_alumnos: [] },
    tablas: {
      profiles: [{ id: "u-karina", role: "profesor", is_admin: false, es_coordinador: true, full_name: "Karina" }],
      formularios: [FORM_FOTO],
      formulario_respuestas: [{ id: "r-f", created_at: "2026-09-20T10:00:00Z", cuenta_id: null, cuenta_creada_at: null,
        respuestas: { nombre: "Ana Rojas", cedula: [ID + "/aaaaaaaa-1111/frente.jpg", ID + "/rota-0000/atras.jpg"],
                     comprobante: [ID + "/bbbbbbbb-2222/Comprobante-SINPE.pdf"] } }],
      formulario_compartidos: [],
    },
  }, "u-karina"));
  const p2 = r2.page;
  await p2.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await p2.evaluate(() => [...document.querySelectorAll("#lista button")].find((b) => b.textContent === "Respuestas").click());
  await p2.waitForSelector("#vista-respuestas:not(.hidden)");
  await p2.waitForFunction(() => document.querySelector("#respuestas-cuerpo img[src^='blob:']")
    && document.querySelector("#respuestas-cuerpo td").parentElement.textContent.indexOf("No se pudo abrir") !== -1);
  igual("se piden al bucket privado, no por una URL pública",
    await p2.evaluate(() => window.__bajadas.map((b) => b.bucket)), ["formulario-adjuntos", "formulario-adjuntos", "formulario-adjuntos"]);
  igual("la miniatura se ve de verdad",
    await p2.evaluate(() => { const i = document.querySelector("#respuestas-cuerpo img"); return i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().height > 0; }),
    true);
  igual("y se abre en grande y se descarga con un nombre que dice de quién es",
    await p2.evaluate(() => { const f = document.querySelector("#respuestas-cuerpo figure"); const [ver, bajar] = f.querySelectorAll("a");
      return [ver.href.startsWith("blob:"), ver.target, bajar.href === ver.href, bajar.download]; }),
    [true, "_blank", true, "Ana-Rojas-Foto-de-la-cedula-frente.jpg"]);
  igual("el PDF se ofrece por su nombre, y se descarga con él",
    await p2.evaluate(() => { const f = [...document.querySelectorAll("#respuestas-cuerpo figure")].pop(); const [ver, bajar] = f.querySelectorAll("a");
      return [ver.textContent, bajar.download, !!f.querySelector("img")]; }),
    ["📄 Comprobante-SINPE.pdf", "Ana-Rojas-Comprobante-de-pago-Comprobante-SINPE.pdf", false]);
  igual("la que no se pudo bajar lo dice, sin enlace de descarga",
    await p2.evaluate(() => [document.querySelectorAll("#respuestas-cuerpo figure a[download]").length,
      /No se pudo abrir «atras\.jpg»/.test(document.getElementById("respuestas-cuerpo").textContent)]), [2, true]);
  const csv = await p2.evaluate(() => {
    let texto = ""; const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return orig(b); };
    document.getElementById("csv-btn") && document.getElementById("csv-btn").click();
    return new Promise((ok) => setTimeout(() => ok(window.__csv || ""), 300));
  });
  igual("en el CSV la foto se cuenta, no se pega una ruta", csv.indexOf("2 archivos adjuntos") !== -1 && csv.indexOf(ID + "/") === -1, true);
  r2.errores.forEach((e) => { console.log("  ✗ error de la página: " + e); fallos += 1; });
  await p2.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaArmador(browser);
    await pruebaCompartir(browser);
    await pruebaPublica(browser);
    await pruebaImagenes(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: las dos páginas mandan lo correcto.");
  process.exit(fallos ? 1 : 0);
})();
