/* Pareo Integral: institución, categoría, subir una lista (Word o Excel), el
 * Elo Nacional (y resolver un ambiguo a mano) y los nombres repetidos
 * (pareo.html, js/pareo/pagina.js, js/pareo/elo-nacional.js,
 * js/reporte-textos.js, la migración y la Edge Function pareo-elo-nacional).
 *
 * Lo que se rompe acá no da ningún error: una columna mal mapeada agrega
 * jugadores con los datos cambiados de lugar, una llamada de más al Elo
 * Nacional rompería justo lo que la página promete («nada sale de tu
 * computadora»), y un bolsillo de nombre mal comparado le pone a alguien el
 * Elo de otra persona. Cinco partes:
 *
 *   1. La migración y la Edge Function, leídas (sin navegador): el freno
 *      ANTES de buscar, el candado de quién puede llamar jde_frenar... digo
 *      pareo_elo_frenar, y que nunca devuelva un homónimo cualquiera.
 *   2. Subir una lista, en un navegador real: un .docx con tabla (armado con
 *      el mismo ReporteDOCX que ya usan los informes) y un .csv con la
 *      cabecera en otro orden, los dos agregando la institución de cada
 *      jugador.
 *   3. El botón de Elo Nacional: es la ÚNICA llamada que sale del sitio, no
 *      inventa un homónimo, asigna por índice (no por bolsillo de nombre, que
 *      mezclaría a dos homónimos) y a quien queda ambiguo o sin encontrar se
 *      le puede resolver a mano desde la misma lista, sin repetir la
 *      búsqueda completa.
 *   4. Dos jugadores con el mismo nombre: se avisa, pero se agregan los dos
 *      (puede ser un homónimo de verdad, nunca se bloquea por las dudas).
 *   5. La categoría (campo libre, ej. «Sub-10») y el filtro por institución
 *      en Clasificación y Tabla cruzada.
 *
 * Uso:  python3 -m http.server 8777      (desde la raíz del sitio)
 *       node herramientas/verificar-pareo-institucion.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || process.env.BASE || "http://localhost:8777";
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

let fallos = 0;
const mal = (m, detalle) => { console.log("  ✗ " + m + (detalle ? "\n      " + String(detalle).slice(0, 400) : "")); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);
const ok = (c, m, detalle) => (c ? bien(m) : mal(m, detalle));
const igual = (m, a, b) => {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, m, ja === jb ? "" : "esperaba " + jb + ", salió " + ja);
};

/* ==================================================================
   1. La migración y la Edge Function
   ================================================================== */
function pruebaBase() {
  console.log("\n=== La migración (pareo_elo_frenar) ===");
  const archivo = fs.readdirSync(path.join(RAIZ, "supabase/migraciones")).find((f) => /_pareo_elo_nacional\.sql$/.test(f));
  ok(!!archivo, "existe una migración *_pareo_elo_nacional.sql");
  const sql = leer("supabase/migraciones/" + archivo);
  ok(/create or replace function public\.pareo_elo_frenar\(p_ip text\)/.test(sql), "existe pareo_elo_frenar(p_ip)");
  ok(/security definer/.test(sql), "es security definer");
  ok(/revoke all on function public\.pareo_elo_frenar\(text\) from public, anon, authenticated/.test(sql),
    "nadie más que la service role puede llamarla");
  ok(/return interno\.frenar_envio_publico\('formulario', 'pareo-elo-nacional', null, v_ip\)/.test(sql),
    "al final usa el freno genérico de envíos públicos, sin correo");
  ok(/ambito = 'pareo-elo-nacional' and ip = v_ip[\s\S]*?>= \d+ then/.test(sql), "tiene su propio tope por conexión");

  console.log("\n=== La Edge Function (pareo-elo-nacional) ===");
  const ts = leer("supabase/functions/pareo-elo-nacional/index.ts");
  const frenoPos = ts.search(/admin\.rpc\("pareo_elo_frenar"/);
  const buscarPos = ts.search(/await enTandas\(nombres/);
  ok(frenoPos >= 0 && buscarPos > frenoPos, "llama al freno ANTES de salir a buscar en ajedrezcostarica.com");
  ok(/if \(freno\) return json\(\{ ok: false, error: freno \}, 429\)/.test(ts), "si el freno contesta, no sigue (429)");
  ok(/Access-Control-Allow-Origin": SITE_URL/.test(ts), "CORS fijo al sitio");
  ok(/if \(vistos\.size > 1\) return .*estado: "ambiguo"/.test(ts), "más de un homónimo: «ambiguo», no elige cualquiera");
  ok(/nombres\.length > MAX_JUGADORES/.test(ts), "la lista de nombres se acota");
  ok(/from "\.\/ajedrezcostarica\.ts"/.test(ts), "reusa el lector compartido, no una copia propia");

  console.log("\n=== funciones-armar.js sabe traerle su compartido ===");
  const armar = leer("herramientas/funciones-armar.js");
  ok(/"pareo-elo-nacional":\s*\["ajedrezcostarica\.ts"\]/.test(armar), "pareo-elo-nacional pide ajedrezcostarica.ts al armar");
  ok(/"elo-fide":\s*\["ajedrezcostarica\.ts"\]/.test(armar), "elo-fide también, desde que se mudó");
}

/* ==================================================================
   2 y 3. La página, en un navegador real
   ================================================================== */
async function abrir(browser) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const errores = [];
  const afuera = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("request", (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) afuera.push(r.url()); });
  await page.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await page.goto(BASE + "/pareo.html", { waitUntil: "networkidle" });
  // Las dos fichas (Jugadores) están ocultas hasta elegirlas desde «Partes del torneo».
  await page.click('[data-ficha="jugadores"]');
  return { ctx, page, errores, afuera };
}
const vis = (page, sel) => page.$eval(sel, (e) => e.checkVisibility()).catch(() => false);
const texto = (page, sel) => page.textContent(sel).catch(() => null);

async function docxDePrueba(page, filas) {
  await page.addScriptTag({ path: path.join(RAIZ, "js/reporte-docx.js") });
  const bytes = await page.evaluate(async (filas) => {
    const blob = window.ReporteDOCX.generar({
      titulo: "Lista de prueba",
      bloques: [{ tipo: "tabla", encabezados: ["Nombre", "Institución"], filas: filas, anchos: [2, 2] }],
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, filas);
  return Buffer.from(bytes);
}

async function pruebaSubirLista(browser) {
  console.log("\n=== Subir una lista: .docx con tabla ===");
  const { ctx, page, errores } = await abrir(browser);
  const docx = await docxDePrueba(page, [["Pérez Solano, Ana", "Liceo de Prueba"], ["Mora Ruiz, Luis", "Colegio de Prueba"]]);
  await page.setInputFiles("#pi-subir-lista", {
    name: "lista.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx,
  });
  await page.waitForFunction(() => document.getElementById("pi-cuenta").textContent === "2");
  // La tabla ordena por el criterio de numeración (Elo, título, nombre), no
  // por el orden de llegada: con los dos en 0, gana el orden alfabético.
  igual("los dos nombres, con su institución", await page.$$eval("#pi-tabla-jugadores tbody tr", (trs) =>
    trs.map((tr) => [tr.children[1].textContent, tr.children[2].textContent])),
    [["Mora Ruiz, Luis", "Colegio de Prueba"], ["Pérez Solano, Ana", "Liceo de Prueba"]]);
  await ctx.close();

  console.log("\n=== Subir una lista: .csv con la cabecera en otro orden ===");
  const { ctx: ctx2, page: page2 } = await abrir(browser);
  const csv = "Institución;Nombre;Elo\nLiceo X;García Vega, Pedro;1800\n";
  await page2.setInputFiles("#pi-subir-lista", { name: "lista.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page2.waitForFunction(() => document.getElementById("pi-cuenta").textContent === "1");
  igual("lee la cabecera por su etiqueta, no por su posición",
    await page2.$$eval("#pi-tabla-jugadores tbody tr", (trs) => trs.map((tr) => [tr.children[1].textContent, tr.children[2].textContent, tr.children[5].textContent])),
    [["García Vega, Pedro", "Liceo X", "1800"]]);
  await ctx2.close();

  console.log("\n=== Subir una lista: sin cabecera reconocible, orden fijo ===");
  const { ctx: ctx3, page: page3 } = await abrir(browser);
  const csv2 = "Jiménez Alfaro, Sofía;Escuela Z;1200\n";
  await page3.setInputFiles("#pi-subir-lista", { name: "lista2.csv", mimeType: "text/csv", buffer: Buffer.from(csv2, "utf8") });
  await page3.waitForFunction(() => document.getElementById("pi-cuenta").textContent === "1");
  igual("cae al orden Nombre; Institución; Elo",
    await page3.$$eval("#pi-tabla-jugadores tbody tr", (trs) => trs.map((tr) => [tr.children[1].textContent, tr.children[2].textContent, tr.children[5].textContent])),
    [["Jiménez Alfaro, Sofía", "Escuela Z", "1200"]]);
  await ctx3.close();
}

async function pruebaExportar(browser) {
  console.log("\n=== Exportar jugadores (.csv) ===");
  const { ctx, page, errores } = await abrir(browser);
  await page.fill('#pi-form-jugador [name="nombre"]', "Angulo Cubero, Oscar");
  await page.fill('#pi-form-jugador [name="institucion"]', "Academia de Prueba");
  await page.click('#pi-form-jugador button[type="submit"]');
  await page.waitForFunction(() => document.getElementById("pi-cuenta").textContent === "1");
  // El botón vive en la ficha «Archivos», no en «Jugadores».
  await page.click('[data-ficha="archivos"]');
  const descarga = page.waitForEvent("download");
  await page.click("#pi-bajar-jugadores");
  const bajada = await descarga;
  const ruta = await bajada.path();
  const contenido = fs.readFileSync(ruta, "utf8");
  ok(contenido.includes("Angulo Cubero, Oscar") && contenido.includes("Academia de Prueba"), "el .csv trae el nombre y la institución", contenido);
  ok(errores.length === 0, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaEloNacional(browser) {
  console.log("\n=== Buscar Elo Nacional: la única llamada que sale del sitio ===");
  const { ctx, page, errores, afuera } = await abrir(browser);
  await page.fill('#pi-form-jugador [name="nombre"]', "Pérez Vargas, Juan");
  await page.click('#pi-form-jugador button[type="submit"]');
  await page.fill('#pi-form-jugador [name="nombre"]', "Rojas Mora, Ana");
  await page.click('#pi-form-jugador button[type="submit"]');
  await page.waitForFunction(() => document.getElementById("pi-cuenta").textContent === "2");

  let pedido = null;
  let avisarLlego;
  const pedidoLlego = new Promise((r) => { avisarLlego = r; });
  await page.route("https://bgtijpimpcokxatxxbki.supabase.co/functions/v1/pareo-elo-nacional", async (r) => {
    pedido = JSON.parse(r.request().postData() || "{}");
    avisarLlego();
    // Una espera a propósito: sin ella, la llamada mockeada contesta tan
    // rápido que nunca se llega a ver la barra de progreso mientras pende.
    await new Promise((res) => setTimeout(res, 400));
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true,
      resultados: [
        { nombre: "Pérez Vargas, Juan", estado: "encontrado", nacional: 1550, fideEstandar: null, fideId: "123" },
        { nombre: "Rojas Mora, Ana", estado: "ambiguo", nacional: null, fideEstandar: null, fideId: null },
      ],
    }) });
  });
  await page.click("#pi-elo-nacional");
  await pedidoLlego;
  ok(await vis(page, "#pi-elo-barra-caja"), "mientras busca, se ve la barra de progreso");
  ok((await texto(page, "#pi-elo-nacional-estado") || "").includes("2"), "el aviso de estado dice cuántos jugadores busca",
    await texto(page, "#pi-elo-nacional-estado"));
  await page.waitForFunction(() => /\d/.test(document.querySelector(".avisos-mensaje")?.textContent || ""));
  ok(!(await vis(page, "#pi-elo-barra-caja")), "al terminar, la barra se vuelve a ocultar");

  ok(!!pedido && Array.isArray(pedido.nombres) && pedido.nombres.length === 2, "manda los dos nombres, nada más", JSON.stringify(pedido));
  igual("el primero queda con el Elo encontrado, por índice (no por bolsillo de nombre)",
    await page.$$eval("#pi-tabla-jugadores tbody tr", (trs) => trs.map((tr) => tr.children[5].textContent)),
    ["1550", ""]);
  ok(afuera.filter((u) => u.includes("pareo-elo-nacional")).length === 1, "una sola llamada afuera, y es esta", afuera.join(" | "));
  ok(afuera.filter((u) => !u.includes("pareo-elo-nacional")).length === 0, "y ninguna otra petición salió del sitio", afuera.join(" | "));
  // El ambiguo queda pendiente, con su botón para resolverlo a mano.
  ok(await vis(page, "#pi-elo-pendientes"), "la lista de pendientes se ve");
  const pendiente = await page.textContent("#pi-elo-pendientes");
  ok(pendiente.includes("Rojas Mora, Ana") && /más de una persona/.test(pendiente), "nombra a quien quedó ambiguo y por qué", pendiente);
  ok(!pendiente.includes("Pérez Vargas, Juan"), "a quien sí se encontró no lo deja en la lista", pendiente);
  await page.click('#pi-elo-pendientes button:has-text("Editar")');
  ok(await vis(page, 'dialog.avisos-dialogo[open] input[name="nombre"]'), "el botón abre el formulario de editar a esa persona");
  await page.fill('dialog.avisos-dialogo[open] input[name="elo"]', "1600");
  await page.click('dialog.avisos-dialogo[open] button:has-text("Guardar")');
  // Guardar cierra el <dialog> (evento "close") y editarJugador() sigue
  // async desde ahí: esperar el resultado, no mirar el DOM al toque del clic.
  await page.waitForFunction(() => !document.getElementById("pi-elo-pendientes").textContent.includes("Rojas Mora, Ana"));
  ok(true, "al resolverlo a mano, sale solo de la lista de pendientes");
  ok(errores.length === 0, "sin errores en la página", errores.join(" | "));
  await ctx.close();
}

async function pruebaDuplicados(browser) {
  console.log("\n=== Nombres repetidos: avisa, no bloquea ===");
  const { ctx, page } = await abrir(browser);
  await page.click("#pi-p-jugadores summary");
  await page.fill("#pi-pegar", ["Soto Vega, Karla;Liceo A", "Soto Vega, Karla;Liceo B"].join("\n"));
  await page.click("#pi-pegar-agregar");
  await page.waitForFunction(() => document.getElementById("pi-cuenta").textContent === "2");
  const avisos = await page.$$eval(".avisos-mensaje", (ns) => ns.map((n) => n.textContent));
  ok(avisos.some((m) => m.includes("Soto Vega, Karla")), "avisa del nombre repetido", avisos.join(" | "));
  ok((await page.$$("#pi-tabla-jugadores tbody tr")).length === 2, "pero agrega a los dos: puede ser un homónimo de verdad");
  await ctx.close();
}

async function pruebaCategoria(browser) {
  console.log("\n=== Categoría: campo y filtro de institución ===");
  const { ctx, page } = await abrir(browser);
  for (const [nombre, institucion, categoria] of [["Jara Ulloa, Mateo", "Liceo A", "Sub-10"], ["Campos Díaz, Rosa", "Liceo B", "Sub-12"]]) {
    await page.fill('#pi-form-jugador [name="nombre"]', nombre);
    await page.fill('#pi-form-jugador [name="institucion"]', institucion);
    await page.fill('#pi-form-jugador [name="categoria"]', categoria);
    await page.click('#pi-form-jugador button[type="submit"]');
  }
  await page.waitForFunction(() => document.getElementById("pi-cuenta").textContent === "2");
  igual("la categoría queda en la tabla de jugadores",
    await page.$$eval("#pi-tabla-jugadores tbody tr", (trs) => trs.map((tr) => tr.children[3].textContent).sort()),
    ["Sub-10", "Sub-12"]);

  await page.click('[data-ficha="clasificacion"]');
  ok((await page.$$eval("#pi-clas-institucion option", (os) => os.map((o) => o.value))).includes("Liceo A"),
    "el filtro de institución lista las que hay en el torneo");
  await page.selectOption("#pi-clas-institucion", "Liceo A");
  await page.waitForFunction(() => document.querySelectorAll("#pi-tabla-clas tbody tr").length === 1);
  ok((await page.textContent("#pi-tabla-clas tbody tr")).includes("Jara Ulloa, Mateo"), "y filtra la clasificación a esa sola institución");

  await page.click('[data-ficha="cruzada"]');
  ok((await page.$eval("#pi-cruzada-institucion", (s) => s.value)) === "Liceo A", "el filtro se recuerda al cambiar de ficha");
  ok((await page.$$("#pi-tabla-cruzada tbody tr")).length === 1, "y también filtra la tabla cruzada");
  await ctx.close();
}

(async () => {
  pruebaBase();
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined });
  try {
    await pruebaSubirLista(browser);
    await pruebaExportar(browser);
    await pruebaEloNacional(browser);
    await pruebaDuplicados(browser);
    await pruebaCategoria(browser);
  } finally {
    await browser.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
