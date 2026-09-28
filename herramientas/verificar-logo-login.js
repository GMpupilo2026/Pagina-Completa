/* El logo del login es el de la academia de la última cuenta que entró.

   login.html trae el logo de Ajedrez Integral, y js/marca-academia.js
   (pintarLogin) lo cambia por el de la academia guardada en
   localStorage.academia_marca_v1, si tiene logo. Lo que comprueba, con el
   bucket de logos doblado (acá no se sale a la red):

   - sin marca guardada, o con una marca sin logo, o de alguien sin academia,
     queda el de Ajedrez Integral, y se ve uno solo (el del modo claro u
     oscuro);
   - con marca y logo se ve el de la academia, desde el bucket público, y el
     de Ajedrez Integral no;
   - si el logo no carga, vuelve el de Ajedrez Integral;
   - un nombre de academia con HTML va literal en el alt y no se ejecuta.

   Ver «El logo del login» en docs/decisiones/permisos-y-roles.md.

       node herramientas/verificar-logo-login.js                              */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.BASE_URL || "http://localhost:8777";
const BUCKET = "https://bgtijpimpcokxatxxbki.supabase.co/storage/v1/object/public/academia-marca/";
// Un PNG de 1×1: lo que devuelve el bucket doblado.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

/* Abre el login con `guardada` en localStorage (o nada) y el bucket
   contestando `logoOk`. Devuelve qué logos se ven. */
async function abrir(browser, guardada, { logoOk = true, oscuro = false } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: "block", colorScheme: oscuro ? "dark" : "light" });
  if (guardada !== undefined) {
    await ctx.addInitScript((v) => { localStorage.setItem("academia_marca_v1", v); }, JSON.stringify(guardada));
  }
  await ctx.route("**/*", (ruta) => {
    const url = ruta.request().url();
    if (url.startsWith(BASE)) return ruta.continue();
    if (url.startsWith(BUCKET)) {
      return logoOk ? ruta.fulfill({ status: 200, contentType: "image/png", body: PNG }) : ruta.fulfill({ status: 404, body: "" });
    }
    return ruta.fulfill({ status: 200, body: "", contentType: "text/plain" });
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/login.html", { waitUntil: "load" });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({
    visibles: [...document.querySelectorAll("#logo-login img")].filter((i) => i.checkVisibility()).map((i) => ({ src: i.getAttribute("src"), alt: i.getAttribute("alt") })),
    xss: !!window.__xss,
  }));
  await ctx.close();
  return r;
}

const AI = /^\/img\/logo-completo-(claro|oscuro)\.png$/;
const marca = (m) => ({ uid: "u1", marca: m });

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  console.log("\nSin academia guardada");
  for (const [nombre, guardada] of [["sin nada guardado", undefined], ["alguien sin academia", marca(null)],
    ["academia sin logo", marca({ nombre: "ADAPZ", logo_path: null, academia_id: "ac1" })]]) {
    const r = await abrir(browser, guardada);
    cierto(`${nombre}: se ve uno solo, el de Ajedrez Integral`, r.visibles.length === 1 && AI.test(r.visibles[0].src), JSON.stringify(r.visibles));
  }
  const oscuro = await abrir(browser, undefined, { oscuro: true });
  cierto("en modo oscuro se ve el crema", oscuro.visibles.length === 1 && oscuro.visibles[0].src.endsWith("oscuro.png"), JSON.stringify(oscuro.visibles));

  console.log("\nCon la academia guardada");
  const conLogo = await abrir(browser, marca({ nombre: "ADAPZ", logo_path: "ac1/logo-abc.webp", academia_id: "ac1" }));
  cierto("se ve uno solo, el de la academia, desde el bucket público",
    conLogo.visibles.length === 1 && conLogo.visibles[0].src === BUCKET + "ac1/logo-abc.webp", JSON.stringify(conLogo.visibles));
  cierto("el alt dice de quién es el logo", conLogo.visibles[0] && conLogo.visibles[0].alt === "Logo de ADAPZ", JSON.stringify(conLogo.visibles));
  const conLogoOscuro = await abrir(browser, marca({ nombre: "ADAPZ", logo_path: "ac1/logo-abc.webp" }), { oscuro: true });
  cierto("en modo oscuro también el de la academia", conLogoOscuro.visibles.length === 1 && conLogoOscuro.visibles[0].src.startsWith(BUCKET), JSON.stringify(conLogoOscuro.visibles));

  console.log("\nSi algo falla");
  const roto = await abrir(browser, marca({ nombre: "ADAPZ", logo_path: "ac1/logo-abc.webp" }), { logoOk: false });
  cierto("con el logo roto vuelve el de Ajedrez Integral", roto.visibles.length === 1 && AI.test(roto.visibles[0].src), JSON.stringify(roto.visibles));
  const basura = await abrir(browser, "no es json {");
  cierto("con basura guardada queda el de Ajedrez Integral", basura.visibles.length === 1 && AI.test(basura.visibles[0].src), JSON.stringify(basura.visibles));
  const html = await abrir(browser, marca({ nombre: '<img src=x onerror="window.__xss=1">Santa Ana', logo_path: "ac1/l.webp" }));
  cierto("un nombre con HTML va literal en el alt y no se ejecuta",
    html.visibles[0] && html.visibles[0].alt === 'Logo de <img src=x onerror="window.__xss=1">Santa Ana' && !html.xss, JSON.stringify(html));

  await browser.close();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nEl login muestra el logo de la academia y aguanta que falle.");
  process.exit(fallos ? 1 : 0);
})();
