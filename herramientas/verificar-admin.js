/* Comprueba, en un navegador de verdad y con un Supabase de mentira, el panel
   de Administración (admin.html) y la lista de inscripciones a torneos
   (inscripciones.html).

   Existe por lo mismo que verificar-panel.js: las dos páginas están DETRÁS DEL
   LOGIN, así que verificar-css.js —que las abre sin cuenta— no ve nada de esto.
   Y lo que se rompe acá no da error en pantalla: un atajo que apunta a una
   dirección que ya no existe, un filtro que no filtra, una lista que se corta
   en mil filas sin avisar.

   Cuatro cosas, por cuatro peligros distintos:

   1. LOS ATAJOS. Que estén los cuatro grupos con lo suyo y que cada uno apunte
      a una página o a un filtro que de verdad existe.

   2. LAS CUENTAS. Que buscar encuentre sin importar las tildes, que el filtro
      de rol funcione —incluido "sin profesor asignado", que no es un rol pero
      es la pregunta que más se hace acá—, que se muestren de 50 en 50 y, lo
      más importante, que las cuentas se pidan DE MIL EN MIL: PostgREST corta
      a las mil filas sin dar ningún error, así que el día que la plataforma
      pase de mil, un solo pedido escondería cuentas en silencio.

   3. LAS INSCRIPCIONES. Que no se lean nunca directo de la tabla —tienen
      cédulas y fechas de nacimiento de menores— sino por la Edge Function, y
      que quien no coordina vea el aviso y ninguna fila. Que el CSV salga con
      punto y coma y BOM.

   4. QUE LAS PÁGINAS SE VEAN. Sin CSS impreso como texto, sin <style> suelto,
      en oscuro cuando toca, y con el nombre de la cuenta SIN CORTAR, que es
      con lo que empezó todo esto.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-admin.js                                 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const RAIZ = path.join(__dirname, "..");

const ADMIN = { id: "u-admin", role: "profesor", is_admin: true, es_coordinador: false, full_name: "Oscar Angulo", email: "oscar@x.cr", grupo: null, created_at: "2026-01-10T10:00:00Z", invitaciones_max: 0, invitaciones_usadas: 0, teacher_id: null };
const PROFE = { id: "u-profe", role: "profesor", is_admin: false, es_coordinador: false, full_name: "Karina Rojas", email: "karina@x.cr", grupo: null, created_at: "2026-02-01T10:00:00Z", invitaciones_max: 10, invitaciones_usadas: 3, teacher_id: null };

/* 1.205 cuentas: MÁS DE MIL a propósito. Es el único número con el que se nota
   si la página se las pide de una sola vez. */
function cuentasDeMentira() {
  const filas = [ADMIN, PROFE];
  for (let i = 0; i < 1203; i += 1) {
    filas.push({
      id: "u-" + i,
      role: "alumno",
      is_admin: false,
      es_coordinador: false,
      // Uno con tilde, para comprobar que "ramirez" también lo encuentra.
      full_name: i === 7 ? "Ana Ramírez" : "Alumno " + i,
      email: "alumno" + i + "@x.cr",
      grupo: i % 3 === 0 ? "7B" : "8A",
      created_at: "2026-03-01T10:00:00Z",
      teacher_id: i < 1200 ? "u-profe" : null,
      invitaciones_max: 0, invitaciones_usadas: 0,
    });
  }
  return filas;
}
// Los tres últimos quedan SIN profesor: son los que el filtro tiene que encontrar.
function parejasDeMentira() {
  const p = [];
  for (let i = 0; i < 1200; i += 1) p.push({ student_id: "u-" + i, teacher_id: "u-profe" });
  return p;
}

const INSCRIPCIONES = [
  { id: "i-1", cedula: "118820456", nombre: "Ana", apellido1: "Ramírez", apellido2: "Mora", fecha_nacimiento: "2012-04-03", edad: 14, contacto: "88887777", correo: "ana@x.cr", tipo_centro: "Colegio", provincia: "San José", canton: "Desamparados", centro: "Liceo de Desamparados", direccion_regional: "Desamparados", grado: "Sétimo", creado_en: "2026-09-10T15:00:00Z", circuito: 3, zona: "Urbana", modalidad: "Académica", acepto_datos: true, genero: "F", usuario: null },
  { id: "i-2", cedula: "402330111", nombre: "Bruno", apellido1: "Mena", apellido2: "Solís", fecha_nacimiento: "2010-01-20", edad: 16, contacto: "70001111", correo: "bruno@x.cr", tipo_centro: "Escuela", provincia: "Alajuela", canton: "Grecia", centro: "Escuela Central de Grecia", direccion_regional: "Occidente", grado: "Noveno", creado_en: "2026-09-12T15:00:00Z", circuito: 1, zona: "Rural", modalidad: "Técnica", acepto_datos: true, genero: "M", usuario: null },
];

function clienteFalso(usuario, perfiles, parejas) {
  return `
window.__consultas = [];
(function () {
  const TABLAS = {
    profiles: ${JSON.stringify(perfiles)},
    profile_teachers: ${JSON.stringify(parejas)},
  };
  const USUARIO = ${JSON.stringify(usuario)};

  function constructor(tabla, filas) {
    const anotado = { tabla: tabla, range: null, eq: {} };
    window.__consultas.push(anotado);
    let filas2 = (filas || []).slice(), unica = false;
    const b = {
      select() { return b; },
      eq(col, val) { anotado.eq[col] = val; filas2 = filas2.filter((r) => String(r[col]) === String(val)); return b; },
      order() { return b; },
      range(a, z) { anotado.range = [a, z]; filas2 = filas2.slice(a, z + 1); return b; },
      single() { unica = true; return b; },
      maybeSingle() { unica = true; return b; },
      then(res, rej) {
        let d = filas2;
        if (unica) d = filas2.length ? filas2[0] : null;
        return Promise.resolve({ data: d, error: null }).then(res, rej);
      },
    };
    return b;
  }

  window.SUPABASE_URL = "https://ejemplo.supabase.co";
  window.SUPABASE_ANON_KEY = "clave-de-mentira";
  window.sb = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: USUARIO.id }, access_token: "token-de-mentira" } } }),
      signOut: () => Promise.resolve({}),
    },
    from: (t) => constructor(t, TABLAS[t] !== undefined ? TABLAS[t] : []),
    rpc: (n) => (n === "soy_coordinador"
      ? Promise.resolve({ data: !!(USUARIO.is_admin || USUARIO.es_coordinador), error: null })
      : constructor(n, [])),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
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
function mal(t) { console.log("  ✗ " + t); fallos += 1; }
function bien(t) { console.log("  ✓ " + t); }

async function abrir(browser, ruta, usuario, extra) {
  const ctx = await browser.newContext(extra || {});
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(usuario, cuentasDeMentira(), parejasDeMentira()) }));
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errores.push("console: " + m.text()); });
  return { page, ctx, errores };
}

/* ====================== admin.html · los atajos ====================== */

async function pruebaAtajos(browser) {
  console.log("\n=== Los atajos de administración ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  const grupos = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#atajos section")).map((s) => ({
      titulo: s.querySelector("h2").textContent,
      enlaces: Array.from(s.querySelectorAll("a")).map((a) => a.getAttribute("href")),
      etiquetas: Array.from(s.querySelectorAll("a span span:first-child")).map((n) => n.textContent),
    })));

  igual("los cuatro grupos, en su orden", grupos.map((g) => g.titulo),
    ["Resultados", "Formularios", "Bases de datos", "Reportes"]);
  igual("Resultados: los dos diagnósticos y los dos exámenes", grupos[0].enlaces,
    ["informes.html?tema=diagnostico", "arbitraje.html",
     "informes.html?tema=diagnostico-publico", "informes.html?tema=arbitraje"]);
  igual("Formularios", grupos[1].enlaces, ["formularios.html", "inscripciones.html"]);
  igual("Bases de datos", grupos[2].enlaces, ["admin-jugador.html"]);
  igual("Reportes", grupos[3].enlaces, ["reportes.html", "cobros.html"]);
  igual("los informes de toda la plataforma siguen aparte y de primeros",
    await page.evaluate(() => {
      const a = document.querySelector('#app a[href="informes.html"]');
      // Aparte de las tarjetas y antes que ellas.
      return a && !a.closest("#atajos") && (a.compareDocumentPosition(document.getElementById("atajos")) & Node.DOCUMENT_POSITION_FOLLOWING) ? "sí" : "no";
    }), "sí");

  /* Un atajo que apunta a una página que no existe no da ningún error: se ve
     igual de bien y solo falla al apretarlo. Se comprueban los archivos, y
     para los que llevan ?tema=, que ese tema exista en el selector de
     informes.html. */
  const informes = fs.readFileSync(path.join(RAIZ, "informes.html"), "utf8");
  const temas = [...informes.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  let rotos = [];
  grupos.forEach((g) => g.enlaces.forEach((href) => {
    const [archivo, consulta] = href.split("?");
    if (!fs.existsSync(path.join(RAIZ, archivo))) { rotos.push(href + " (no existe el archivo)"); return; }
    const tema = new URLSearchParams(consulta || "").get("tema");
    if (tema && !temas.includes(tema)) rotos.push(href + " (informes.html no tiene ese tema)");
  }));
  igual("todos los atajos llevan a algo que existe", rotos.join(" | ") || "ninguno roto", "ninguno roto");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* ====================== admin.html · las cuentas ====================== */

async function pruebaCuentas(browser) {
  console.log("\n=== Todas las cuentas ===");
  const { page, ctx, errores } = await abrir(browser, "/admin.html", ADMIN);
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  // LO QUE MÁS IMPORTA: las cuentas se piden de mil en mil.
  const rangos = await page.evaluate(() =>
    window.__consultas.filter((c) => c.tabla === "profiles" && c.range).map((c) => c.range));
  igual("las 1205 cuentas se piden de mil en mil, no de un solo pedido",
    rangos, [[0, 999], [1000, 1999]]);
  const rangosPT = await page.evaluate(() =>
    window.__consultas.filter((c) => c.tabla === "profile_teachers" && c.range).map((c) => c.range));
  igual("y los profesores de cada alumno, igual", rangosPT, [[0, 999], [1000, 1999]]);

  const resumen = () => page.textContent("#users-summary");
  igual("dice cuántas muestra de cuántas hay", (await resumen()).trim(), "Mostrando 50 de 1205 cuentas.");
  igual("y pinta 50 filas de cuenta, no 1205",
    await page.evaluate(() => document.querySelectorAll("#users-body tr td select[aria-label^='Rol']").length), "50");

  await page.click("#users-more");
  igual("«Ver más» trae otras 50", (await resumen()).trim(), "Mostrando 100 de 1205 cuentas.");

  // Buscar, sin tildes.
  await page.fill("#user-search", "ramirez");
  await page.waitForFunction(() => /1 cuenta/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  igual("buscar «ramirez» encuentra a «Ana Ramírez»",
    await page.evaluate(() => document.querySelector("#users-body input[type=text]").value), "Ana Ramírez");
  igual("y el «Ver más» se va", await page.evaluate(() => document.getElementById("users-more").hidden), "true");

  // El filtro de rol, y la opción que no es un rol.
  await page.fill("#user-search", "");
  await page.selectOption("#role-filter", "profesor");
  await page.waitForFunction(() => /2 cuentas/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  bien("filtrar por «Profesores» deja 2");

  await page.selectOption("#role-filter", "admin");
  await page.waitForFunction(() => /1 cuenta/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  bien("filtrar por «Administración» deja 1");

  await page.selectOption("#role-filter", "sin-profesor");
  await page.waitForFunction(() => /3 cuentas/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  bien("filtrar por «Sin profesor asignado» deja los 3 que no tienen — esos no salen en los informes de nadie");

  // El aviso de arriba los deja a la vista de un clic.
  await page.selectOption("#role-filter", "");
  await page.click("#sin-profesor-aviso button");
  await page.waitForFunction(() => /3 cuentas/.test(document.getElementById("users-summary").textContent), { timeout: 10000 });
  igual("y el aviso de «alumnos sin profesor» los deja a la vista de un clic",
    await page.evaluate(() => document.getElementById("role-filter").value), "sin-profesor");

  /* El encabezado de cada grupo cuenta el GRUPO ENTERO, no las filas que se
     alcanzan a ver. Es lo que se rompe solo al empezar a mostrar de a 50: un
     7° B de cuatrocientos diría "· 50" y su botón marcaría cincuenta de
     cuatrocientos sin avisar — justo lo contrario de "todo 7° B al profesor
     nuevo", que es para lo que existe ese botón. */
  await page.selectOption("#role-filter", "");
  await page.fill("#user-search", "");
  await page.selectOption("#group-by", "grupo");
  const encabezados = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#users-body tr td[colspan='7']")).map((td) => td.textContent));
  igual("el encabezado del grupo cuenta el grupo entero, no las 50 que se ven",
    encabezados.some((t) => /8A · 802/.test(t)), "true");
  igual("y su botón ofrece marcarlos a todos",
    encabezados.some((t) => /marcar los 802/.test(t)), "true");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

/* El nombre cortado es con lo que empezó todo esto: se MIDE. */
async function pruebaElNombreNoSeCorta(browser) {
  console.log("\n=== Que el nombre de la cuenta no se corte ===");
  const { page, ctx } = await abrir(browser, "/admin.html", ADMIN, { viewport: { width: 1280, height: 900 } });
  await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });

  const medidas = await page.evaluate(() => {
    const campo = document.querySelector("#users-body input[type=text]");
    campo.value = "María Fernanda Ramírez Quesada";
    return { ancho: campo.getBoundingClientRect().width, cabe: campo.scrollWidth <= campo.clientWidth + 1 };
  });
  igual("un nombre largo cabe entero en su campo", medidas.cabe, "true");
  if (medidas.ancho < 180) mal("la columna del nombre quedó en " + Math.round(medidas.ancho) + " px: muy angosta");
  else bien("la columna del nombre mide " + Math.round(medidas.ancho) + " px");

  igual("el correo quedó en la MISMA celda que el nombre, no en una columna aparte",
    await page.evaluate(() => {
      const td = document.querySelector("#users-body input[type=text]").closest("td");
      return !!td.querySelector('a[href^="mailto:"]');
    }), "true");
  igual("la tabla bajó a 7 columnas",
    await page.evaluate(() => {
      const fila = document.querySelector("#users-body input[type=text]").closest("tr");
      return fila.querySelectorAll("td").length;
    }), "7");

  await ctx.close();
}

/* ====================== inscripciones.html ====================== */

/* El doble de la Edge Function va en la RED y en el CONTEXTO, no dentro de la
   página: así se prueba TAMBIÉN el fetch —que mande la sesión en la cabecera y
   que lea bien la respuesta—, y no solo lo que la página hace después. En el
   contexto y no en la página porque esta registra el service worker, y lo que
   él pide no pasa por una ruta puesta en la página. */
function pagInscripciones(browser, usuario, respuesta, extra) {
  return (async () => {
    const { page, ctx, errores } = await abrir(browser, "/inscripciones.html", usuario, extra);
    const pedidos = [];
    await ctx.route("**/functions/v1/inscripciones-torneo", (ruta) => {
      pedidos.push(ruta.request().headers().authorization || "");
      if (respuesta === null) {
        return ruta.fulfill({ status: 403, contentType: "application/json",
          body: JSON.stringify({ error: "Esta lista es solo para quien administra o coordina." }) });
      }
      ruta.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ inscripciones: respuesta }) });
    });
    await page.goto(BASE + "/inscripciones.html", { waitUntil: "networkidle" });
    return { page, ctx, errores, pedidos };
  })();
}

async function pruebaInscripciones(browser) {
  console.log("\n=== Las inscripciones a torneos ===");
  const { page, ctx, errores, pedidos } = await pagInscripciones(browser, ADMIN, INSCRIPCIONES);
  await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll("#cuerpo tr").length === 2, { timeout: 15000 });

  /* LO QUE MÁS IMPORTA: la tabla no se toca. Son cédulas y fechas de
     nacimiento de menores, y esa tabla no tiene ninguna política de lectura. */
  // Se miran solo las líneas de CÓDIGO: los comentarios de la página nombran
  // `sb.from("inscripciones")` justamente para decir que no está, y buscarlo a
  // secas daba por rota una página correcta.
  const html = fs.readFileSync(path.join(RAIZ, "inscripciones.html"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  if (/sb\s*\.\s*from\s*\(\s*["']inscripciones["']/.test(html)) {
    mal("la página lee la tabla directo: eso son datos de menores y esa tabla no se abre");
  } else bien("la página no lee la tabla directo: pasa por la Edge Function");
  igual("y le manda la sesión de quien mira, que es lo que la función le reenvía a la Academia",
    pedidos, ["Bearer token-de-mentira"]);

  igual("se ven las dos inscripciones",
    await page.evaluate(() => document.querySelectorAll("#cuerpo tr").length), "2");
  igual("dice cuántas hay", (await page.textContent("#resumen")).trim(), "2 inscripciones en total.");
  igual("las tarjetas cuentan centros y provincias",
    await page.evaluate(() => Array.from(document.querySelectorAll("#totales p:nth-child(2)")).map((n) => n.textContent)),
    ["2", "2", "2", "15"]);

  // El detalle: lo que no cabe en la fila se despliega.
  await page.click("#cuerpo button");
  igual("«Ver detalle» muestra la cédula y lo demás",
    await page.evaluate(() => /118820456/.test(document.querySelector("tr[data-detalle]").textContent)), "true");

  // Los filtros se arman con lo que de verdad hay.
  igual("el selector de provincia sale de los datos, no de una lista escrita a mano",
    await page.evaluate(() => Array.from(document.getElementById("f-provincia").options).map((o) => o.value)),
    ["", "Alajuela", "San José"]);
  await page.selectOption("#f-provincia", "Alajuela");
  await page.waitForFunction(() => document.querySelectorAll("#cuerpo tr").length === 1, { timeout: 10000 });
  igual("y filtra", await page.textContent("#cuerpo tr td:nth-child(2) p"), "Bruno Mena Solís");

  await page.selectOption("#f-provincia", "");
  await page.fill("#buscar", "ramirez");
  await page.waitForFunction(() => /1 inscripción/.test(document.getElementById("resumen").textContent), { timeout: 10000 });
  bien("buscar «ramirez» encuentra a «Ana Ramírez» (sin tildes también)");

  // El CSV: punto y coma y BOM, o Excel en español mete la fila en la columna A.
  await page.fill("#buscar", "");
  const csv = await page.evaluate(async () => {
    let capturado = null;
    const original = URL.createObjectURL;
    const clickOriginal = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (b) => { capturado = b; return "blob:x"; };
    HTMLAnchorElement.prototype.click = function () {};   // que no intente navegar a la URL de mentira
    document.getElementById("csv-btn").click();
    URL.createObjectURL = original;
    HTMLAnchorElement.prototype.click = clickOriginal;
    // Se leen los BYTES: Blob.text() decodifica como UTF-8 y se COME el BOM,
    // así que preguntándole al texto, un archivo sin BOM se vería igual de bien
    // — y Excel en español es justo lo que no lo abriría.
    const bytes = new Uint8Array(await capturado.arrayBuffer());
    return { bom: [bytes[0], bytes[1], bytes[2]].join(","), texto: new TextDecoder().decode(bytes) };
  });
  igual("el CSV arranca con BOM (mirando los bytes, no el texto)", csv.bom, "239,187,191");
  igual("y separa con punto y coma", csv.texto.split("\r\n")[0].split(";").length > 5, "true");
  igual("con las dos inscripciones", csv.texto.trim().split("\r\n").length, "3");

  igual("sin errores en consola", errores.join(" | ") || "ninguno", "ninguno");
  await ctx.close();
}

async function pruebaInscripcionesDenegado(browser) {
  console.log("\n=== Las inscripciones, para quien no coordina ===");
  const { page, ctx, pedidos } = await pagInscripciones(browser, PROFE, null);
  await page.waitForSelector("#denegado:not(.hidden)", { timeout: 20000 });
  igual("a un profesor que no coordina se le muestra el aviso",
    await page.evaluate(() => !document.getElementById("denegado").classList.contains("hidden")), "true");
  igual("y no se le pinta la lista",
    await page.evaluate(() => document.getElementById("app").classList.contains("hidden")), "true");
  igual("ni se le piden las inscripciones", pedidos.length, "0");
  await ctx.close();
}

/* ====================== que se vean ====================== */

async function pruebaPantalla(browser) {
  console.log("\n=== Que las páginas se vean ===");
  for (const ruta of ["/admin.html", "/inscripciones.html"]) {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
    await ctx.route("**/js/supabase-client.js", (r) =>
      r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso(ADMIN, cuentasDeMentira(), parejasDeMentira()) }));
    await ctx.route("**/functions/v1/inscripciones-torneo", (r) => r.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ inscripciones: INSCRIPCIONES }) }));
    const page = await ctx.newPage();
    await page.goto(BASE + ruta, { waitUntil: "networkidle" });
    await page.waitForSelector("#app:not(.hidden)", { timeout: 20000 });
    const v = await page.evaluate(() => ({
      css: /\{[^}]*(color|display|margin)\s*:/.test(document.body.innerText),
      estilos: document.querySelectorAll("style").length,
      fondo: getComputedStyle(document.body).backgroundColor,
    }));
    igual(ruta + " · sin CSS impreso como texto", v.css, "false");
    igual(ruta + " · ningún <style> suelto", v.estilos, "0");
    const rgb = (v.fondo.match(/\d+/g) || []).map(Number);
    igual(ruta + " · con el tema oscuro, el fondo sale oscuro", rgb[0] + rgb[1] + rgb[2] < 200, "true");
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await pruebaAtajos(browser);
    await pruebaCuentas(browser);
    await pruebaElNombreNoSeCorta(browser);
    await pruebaInscripciones(browser);
    await pruebaInscripcionesDenegado(browser);
    await pruebaPantalla(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nAdministración e inscripciones están como se pidió.");
  process.exit(fallos ? 1 : 0);
})();
