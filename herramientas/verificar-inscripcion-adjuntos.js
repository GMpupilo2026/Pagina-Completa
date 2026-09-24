/* Los archivos adjuntos de inscripcion.html (el torneo en línea).
 *
 * Lo que se rompe callado acá: que los archivos se suban a otra carpeta que
 * "pendientes/" (el bucket lo rechazaría y la familia vería un error que no
 * entiende), que a la función viajen rutas distintas de las que se subieron (la
 * inscripción quedaría con un adjunto roto), o que un formato que no se recibe
 * se intente subir igual. Todo eso se ve perfecto en pantalla.
 *
 * La página es PÚBLICA pero pide cosas a Supabase y a Cloudflare al cargar, así
 * que todo va ruteado: la tabla de colegios, Turnstile, Storage y la Edge
 * Function que registra. Lo que se mira es lo que la página MANDA.
 *
 *   node herramientas/verificar-inscripcion-adjuntos.js
 *   (con el sitio en localhost:8777 y playwright)                            */
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:8777";
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a !== b) { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
  else console.log("  ✓ " + nombre + ": " + a);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errores = [];
  // three.js (el fondo animado) no es de esta prueba: si falla, no cuenta.
  page.on("pageerror", (e) => { if (!/THREE/.test(String(e))) errores.push(String(e)); });

  const subidas = [];
  const registros = [];
  let respuestaRegistro = { status: 200, body: { success: true } };
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  // Turnstile de mentira: deja el token donde lo deja el de verdad.
  await ctx.route("**/challenges.cloudflare.com/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript",
    body: `window.turnstile = { reset() {} };
      document.querySelectorAll('.cf-turnstile').forEach((d) => {
        const i = document.createElement('input'); i.type = 'hidden'; i.name = 'cf-turnstile-response'; i.value = 'tok'; d.appendChild(i);
      });` }));
  await ctx.route("**/prcfbzvshnusisczlpxl.supabase.co/rest/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await ctx.route("**/prcfbzvshnusisczlpxl.supabase.co/storage/v1/object/**", async (r) => {
    const u = new URL(r.request().url());
    // storage-js manda el archivo como multipart: el tipo va DENTRO de la parte.
    const cuerpo = (r.request().postDataBuffer() || Buffer.alloc(0)).toString("latin1");
    const m = /Content-Type:\s*([^\r\n]+)/i.exec(cuerpo);   // la parte de cacheControl no lleva tipo
    subidas.push({ ruta: decodeURIComponent(u.pathname.replace(/^.*\/object\//, "")),
      tipo: m ? m[1].trim() : r.request().headers()["content-type"], upsert: r.request().headers()["x-upsert"] });
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "x" }) });
  });
  await ctx.route("**/functions/v1/smart-function", (r) => {
    registros.push(JSON.parse(r.request().postData() || "{}"));
    r.fulfill({ status: respuestaRegistro.status, contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(respuestaRegistro.body) });
  });

  await page.goto(BASE + "/inscripcion.html", { waitUntil: "networkidle" });
  console.log("\n=== Archivos adjuntos en la inscripción al torneo ===");

  igual("el selector acepta fotos y documentos",
    await page.evaluate(() => { const i = document.getElementById("adjuntos"); return [i.type, i.accept, i.multiple]; }),
    ["file", "image/*,.pdf,.doc,.docx,.xls,.xlsx", true]);

  // Llenar lo obligatorio sin pasar por la cascada de colegios, que sale de la base.
  async function llenar() {
    await page.evaluate(() => {
      const val = (id, v) => { const el = document.getElementById(id); el.disabled = false; if (el.tagName === "SELECT" && ![...el.options].some((o) => o.value === v)) el.add(new Option(v, v)); el.value = v; };
      val("cedulaJugador", "118820456"); val("primerNombre", "Ana"); val("primerApellido", "Ramírez"); val("segundoApellido", "Mora");
      const hace = new Date(); hace.setFullYear(hace.getFullYear() - 14);
      val("fechaNacimiento", hace.toISOString().slice(0, 10)); val("genero", "Femenino");
      val("telefonoJugador", "88887777"); val("correoJugador", "ana@gmail.com");
      val("tipoInstitucion", "Colegio"); val("provincia", "San José"); val("canton", "Desamparados");
      val("institucionSelect", "Liceo de Desamparados"); val("gradoEducativo", "7° Año (Sétimo)");
      document.getElementById("aceptoDatos").checked = true;
    });
  }
  const enviar = () => page.evaluate(() => document.getElementById("inscription-form")
    .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })));

  // Sin adjuntos: se inscribe igual y no se sube nada (son opcionales).
  await llenar();
  await enviar();
  await page.waitForFunction(() => !document.getElementById("form-success").classList.contains("hidden"));
  igual("sin adjuntos se inscribe igual, sin subir nada",
    [subidas.length, "adjuntos" in registros[0]], [0, false]);

  // Un formato que no se recibe se dice ANTES de mandar.
  await llenar();
  await page.setInputFiles("#adjuntos", [{ name: "programa.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") }]);
  await enviar();
  await page.waitForFunction(() => /programa\.exe/.test(document.getElementById("form-error").textContent));
  igual("un .exe no se sube ni se registra", [subidas.length, registros.length], [0, 1]);
  await page.click('#adjuntos-lista button[aria-label^="Quitar el archivo 1"]');

  await page.setInputFiles("#adjuntos", [
    { name: "cédula frente.png", mimeType: "image/png", buffer: PNG_1x1 },
    { name: "Carné 2026.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") },
  ]);
  igual("los elegidos se ven antes de mandar",
    await page.evaluate(() => [document.querySelectorAll("#adjuntos-lista img").length,
      document.getElementById("adjuntos-lista").textContent.replace(/✕/g, "").trim(),
      document.getElementById("adjuntos-estado").textContent]),
    [1, "📄 Carné 2026.pdf", "2 archivos elegidos."]);

  // Si el registro falla, reintentar NO vuelve a subir lo que ya subió.
  respuestaRegistro = { status: 409, body: { error: "Esta cédula ya está inscrita en este evento.", code: "duplicate" } };
  await enviar();
  await page.waitForFunction(() => /ya está inscrita/.test(document.getElementById("form-error").textContent));
  igual("sube al bucket privado, en pendientes/, con su nombre y sin pisar nada",
    subidas.map((s) => [s.ruta.split("/").slice(0, 2).join("/"), /^[a-z0-9-]{8,64}$/.test(s.ruta.split("/")[2]), s.ruta.split("/").pop(), s.tipo, s.upsert || "false"]),
    [["inscripcion-adjuntos/pendientes", true, "cedula-frente.jpg", "image/jpeg", "false"],
     ["inscripcion-adjuntos/pendientes", true, "Carne-2026.pdf", "application/pdf", "false"]]);
  const rutas = subidas.map((s) => s.ruta.replace(/^inscripcion-adjuntos\//, ""));
  igual("a la función viajan exactamente las rutas que se subieron", registros[1].adjuntos, rutas);

  respuestaRegistro = { status: 200, body: { success: true } };
  await llenar();
  await enviar();
  await page.waitForFunction(() => !document.getElementById("form-success").classList.contains("hidden"));
  igual("el reintento no vuelve a subir, y manda las mismas rutas",
    [subidas.length, registros[2].adjuntos], [2, rutas]);
  igual("inscrito, la lista de archivos se vacía",
    await page.evaluate(() => document.querySelectorAll("#adjuntos-lista li").length), 0);

  igual("sin errores de la página", errores, []);
  await browser.close();
  if (fallos) { console.log("\n" + fallos + " comprobación(es) fallaron"); process.exit(1); }
  console.log("\nTodo bien: los adjuntos del torneo viajan como se pidió.");
})();
