/* Las cifras de la portada salen de los datos reales.

   index.html trae escritas unas cifras y js/cifras-portada.js las cambia por
   las que devuelven dos funciones: cifras_torneos() en la base de Colegios y
   cifras_academia() en la de la Academia. Estudiantes es la suma de las dos.
   Lo que comprueba, con las dos bases dobladas (acá no se sale a la red):

   - que se llame a las dos FUNCIONES y nunca a las tablas (`inscripciones`,
     `profiles`);
   - que estudiantes sea la suma y el resto venga de los torneos, con el
     formato de Costa Rica;
   - que con una base caída la cifra de estudiantes no cambie (la suma
     saldría por debajo de la real), pero sí las que dependen de la otra;
   - que con todo caído, con un cero o con un 500, queden las del HTML.

   Ver «Las cifras de la portada» en docs/decisiones/paneles.md.

       node herramientas/verificar-cifras-portada.js                          */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || "http://localhost:8777";
const COLEGIOS = "https://prcfbzvshnusisczlpxl.supabase.co/";
const ACADEMIA = "https://bgtijpimpcokxatxxbki.supabase.co/";

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

/* Abre la portada con las dos bases dobladas. `torneos` y `academia` son lo
   que contesta cada una: { status, body }, o null para cortar la conexión. */
async function abrir(browser, torneos, academia) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const pedidas = [];
  await ctx.route("**/*", (ruta) => {
    const url = ruta.request().url();
    if (url.startsWith(BASE)) return ruta.continue();
    const base = url.startsWith(COLEGIOS) ? COLEGIOS : url.startsWith(ACADEMIA) ? ACADEMIA : null;
    if (base) {
      pedidas.push((base === COLEGIOS ? "colegios " : "academia ") + ruta.request().method() + " " + url.slice(base.length));
      const esperada = base === COLEGIOS ? "rest/v1/rpc/cifras_torneos" : "rest/v1/rpc/cifras_academia";
      const r = url.slice(base.length).startsWith(esperada) ? (base === COLEGIOS ? torneos : academia) : { status: 404, body: {} };
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

const TORNEOS = { status: 200, body: [{ estudiantes: 1234, centros: 57, provincias: 7, cantones: 41 }] };
const ACADEMIA_OK = { status: 200, body: [{ alumnos: 300 }] };
const miles = (n) => n.toLocaleString("es-CR");

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  console.log("\nCon las dos bases caídas");
  const html = await abrir(browser, null, null);
  cierto("hay cuatro cifras en la portada", Object.keys(html.cifras).length === 4, JSON.stringify(html.cifras));
  cierto("quedan las escritas en el HTML, ninguna vacía",
    Object.values(html.cifras).every((v) => /^\d/.test(v)), JSON.stringify(html.cifras));

  console.log("\nCon las dos contestando");
  const bien = await abrir(browser, TORNEOS, ACADEMIA_OK);
  cierto("se piden las dos funciones y nada más",
    bien.pedidas.length === 2 && bien.pedidas.includes("colegios POST rest/v1/rpc/cifras_torneos") && bien.pedidas.includes("academia POST rest/v1/rpc/cifras_academia"),
    bien.pedidas.join(" · "));
  cierto("nunca se piden las tablas", !bien.pedidas.some((p) => /inscripciones|profiles/.test(p)), bien.pedidas.join(" · "));
  const esperado = { estudiantes: miles(1234 + 300), centros: "57", provincias: "7", cantones: "41" };
  cierto("estudiantes es la suma de las dos y el resto viene de los torneos", JSON.stringify(bien.cifras) === JSON.stringify(esperado),
    "llegó " + JSON.stringify(bien.cifras) + ", se esperaba " + JSON.stringify(esperado));

  console.log("\nCon la Academia caída");
  const sinAcademia = await abrir(browser, TORNEOS, { status: 500, body: { message: "caída" } });
  cierto("estudiantes no cambia: la suma quedaría corta", sinAcademia.cifras.estudiantes === html.cifras.estudiantes, JSON.stringify(sinAcademia.cifras));
  cierto("centros, provincias y cantones sí se ponen", sinAcademia.cifras.centros === "57" && sinAcademia.cifras.cantones === "41", JSON.stringify(sinAcademia.cifras));

  console.log("\nCon los torneos caídos");
  const sinTorneos = await abrir(browser, null, ACADEMIA_OK);
  cierto("quedan todas las del HTML", JSON.stringify(sinTorneos.cifras) === JSON.stringify(html.cifras), JSON.stringify(sinTorneos.cifras));

  console.log("\nCon respuestas raras");
  const raras = await abrir(browser, { status: 200, body: [{ estudiantes: 0, centros: null, provincias: "x", cantones: 41 }] }, ACADEMIA_OK);
  cierto("un cero, un null o un texto no pisan la cifra escrita",
    raras.cifras.estudiantes === html.cifras.estudiantes && raras.cifras.centros === html.cifras.centros && raras.cifras.provincias === html.cifras.provincias,
    JSON.stringify(raras.cifras));
  cierto("la que sí vino bien se pone", raras.cifras.cantones === "41", JSON.stringify(raras.cifras));
  const error = await abrir(browser, { status: 500, body: {} }, { status: 500, body: {} });
  cierto("con un 500 en las dos quedan las del HTML", JSON.stringify(error.cifras) === JSON.stringify(html.cifras), JSON.stringify(error.cifras));

  await browser.close();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nLas cifras de la portada salen de las funciones y aguantan que fallen.");
  process.exit(fallos ? 1 : 0);
})();
