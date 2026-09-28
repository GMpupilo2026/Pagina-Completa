/* Las cifras de la portada salen de las inscripciones a los torneos.

   index.html trae escritas unas cifras y js/cifras-portada.js las cambia por
   las que devuelve cifras_torneos() en la base de Colegios. Lo que comprueba,
   con esa base doblada (acá no se sale a la red):

   - que la llamada vaya a la FUNCIÓN y nunca a la tabla `inscripciones`;
   - que las cuatro cifras se reemplacen por las que contesta, con el formato
     de Costa Rica (1 234, con espacio fino);
   - que con la consulta caída, o con un cero, queden las escritas en el HTML.

   Ver «Las cifras de la portada» en docs/decisiones/paneles.md.

       node herramientas/verificar-cifras-portada.js                          */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || "http://localhost:8777";
const COLEGIOS = "https://prcfbzvshnusisczlpxl.supabase.co/";

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

/* Abre la portada con la base de Colegios doblada: `responder(url)` devuelve
   { status, body } o null para cortar la conexión. */
async function abrir(browser, responder) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const pedidas = [];
  await ctx.route("**/*", (ruta) => {
    const url = ruta.request().url();
    if (url.startsWith(BASE)) return ruta.continue();
    if (url.startsWith(COLEGIOS)) {
      pedidas.push(ruta.request().method() + " " + url.slice(COLEGIOS.length));
      const r = responder(url);
      if (!r) return ruta.abort();
      return ruta.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body),
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
    }
    return ruta.fulfill({ status: 200, body: "", contentType: "text/plain" });
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(500);
  const cifras = await page.$$eval("[data-cifra]", (ns) => Object.fromEntries(ns.map((n) => [n.getAttribute("data-cifra"), n.textContent.trim()])));
  await ctx.close();
  return { cifras, pedidas };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  // Las escritas en el HTML: con la red caída tienen que quedar esas.
  const html = await abrir(browser, () => null);
  console.log("\nCon la consulta caída");
  cierto("hay cuatro cifras en la portada", Object.keys(html.cifras).length === 4, JSON.stringify(html.cifras));
  cierto("quedan las escritas en el HTML, ninguna vacía",
    Object.values(html.cifras).every((v) => /^\d/.test(v)), JSON.stringify(html.cifras));

  console.log("\nCon la función contestando");
  const bien = await abrir(browser, (url) => url.includes("/rest/v1/rpc/cifras_torneos")
    ? { status: 200, body: [{ estudiantes: 1234, centros: 57, provincias: 7, cantones: 41 }] }
    : { status: 404, body: {} });
  cierto("se pide la función y nada más", bien.pedidas.length > 0 && bien.pedidas.every((p) => p.startsWith("POST rest/v1/rpc/cifras_torneos")), bien.pedidas.join(" · "));
  cierto("nunca se pide la tabla de inscripciones", !bien.pedidas.some((p) => /inscripciones/.test(p)), bien.pedidas.join(" · "));
  const esperado = { estudiantes: (1234).toLocaleString("es-CR"), centros: "57", provincias: "7", cantones: "41" };
  cierto("las cuatro cifras son las que contestó la función", JSON.stringify(bien.cifras) === JSON.stringify(esperado),
    "llegó " + JSON.stringify(bien.cifras) + ", se esperaba " + JSON.stringify(esperado));

  console.log("\nCon una respuesta rara");
  const cero = await abrir(browser, () => ({ status: 200, body: [{ estudiantes: 0, centros: null, provincias: "x", cantones: 41 }] }));
  cierto("un cero, un null o un texto no pisan la cifra escrita",
    cero.cifras.estudiantes === html.cifras.estudiantes && cero.cifras.centros === html.cifras.centros && cero.cifras.provincias === html.cifras.provincias,
    JSON.stringify(cero.cifras));
  cierto("la que sí vino bien se pone", cero.cifras.cantones === "41", JSON.stringify(cero.cifras));
  const error = await abrir(browser, () => ({ status: 500, body: { message: "caída" } }));
  cierto("con un error 500 quedan las del HTML", JSON.stringify(error.cifras) === JSON.stringify(html.cifras), JSON.stringify(error.cifras));

  await browser.close();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nLas cifras de la portada salen de la función y aguantan que falle.");
  process.exit(fallos ? 1 : 0);
})();
