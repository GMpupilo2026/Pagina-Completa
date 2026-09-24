/* La inscripción al torneo (inscripcion.html) YA NO pide archivos adjuntos.
 *
 * Tuvo un selector de archivos (cédula, carné, comprobante) y se quitó porque
 * no hacía falta. Lo que se rompe callado acá: que vuelva el campo, o que la
 * página siga subiendo algo a Storage o mandando "adjuntos" a la función sin
 * que se vea en pantalla. inscripciones.html sigue enseñando los archivos de las
 * inscripciones viejas que sí los traen.
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
    r.fulfill({ status: 200, contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ success: true }) });
  });

  await page.goto(BASE + "/inscripcion.html", { waitUntil: "networkidle" });
  console.log("\n=== La inscripción al torneo no pide adjuntos ===");

  igual("no hay ningún campo para adjuntar archivos",
    await page.evaluate(() => [document.querySelectorAll('input[type="file"]').length,
      !!document.getElementById("adjuntos"), !!document.getElementById("adjuntos-lista"),
      typeof window.Adjuntos, /adjunt/i.test(document.getElementById("inscription-form").innerText)]),
    [0, false, false, "undefined", false]);

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

  await llenar();
  await enviar();
  await page.waitForFunction(() => !document.getElementById("form-success").classList.contains("hidden"));
  igual("se inscribe sin subir nada a Storage ni mandar adjuntos",
    [subidas.length, registros.length, "adjuntos" in registros[0]], [0, 1, false]);

  igual("sin errores de la página", errores, []);
  await browser.close();
  if (fallos) { console.log("\n" + fallos + " comprobación(es) fallaron"); process.exit(1); }
  console.log("\nTodo bien: la inscripción al torneo no pide ni sube archivos.");
})();
