/* Las piezas, siempre bajo su encabezado: con la cuenta ciega, TODO ejercicio
   tiene a la vista el encabezado «Piezas» y justo debajo las piezas de la
   posición, por color («Blancas», «Negras», cada una con su lista). Ver «Las
   piezas, siempre bajo su encabezado» en docs/decisiones/accesibilidad.md.

   Lo que se rompe acá no da ningún error: el ejercicio funciona, el tablero se
   ve, y quien no ve tiene que acordarse de pedir «posición» en cada uno. Se
   mide en un navegador de verdad, entrando a cada ejercicio como alumna ciega:
     1. hay un encabezado «Piezas» que se ve;
     2. debajo vienen «Blancas» y «Negras» (h3), cada uno con su lista y con una
        casilla en ella (la posición de verdad, no un cartel);
     3. uno solo por posición (la página con su propia lectura no lleva dos);
   que sin la marca el recuadro sigue sin ese encabezado; y que lo que no
   tiene piezas que poner ahí no se le ofrece (ver «Lo que no se puede hacer
   sin ver, no se ofrece»): Memoria, Coordenadas, el Sonar, la Batalla naval y
   el curso de Fundamentos avisan que no están adaptados, en Habilidades no
   salen la Fotografía ni la apertura sin tablero (nivel 3), y la guía
   ciegos.html no los explica.

   Uso: con el sitio en localhost:8777,  node herramientas/verificar-piezas-ciego.js */
"use strict";

const { chromium } = require("./lib/playwright-con-sesion");
const { clienteFalso, ALUMNA, PROFE, ADMIN } = require("./verificar-panel");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";
const CIEGA = { vision_personas: [{ persona_id: "u-ana", vision: "ciego" }] };

let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos += 1; }
}
function cierto(n, v, detalle) {
  if (v) console.log("  ✓ " + n);
  else { console.log("  ✗ " + n + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

const EJERCICIOS = [
  { nombre: "Mates", ruta: "/entreno/mates.html" },
  { nombre: "Finales", ruta: "/entreno/finales.html" },
  { nombre: "Practicar", ruta: "/entreno/practicas.html", clic: ".set-card, [data-set]" },
  { nombre: "Desafíos", ruta: "/entreno/desafios.html", clic: ".set-card, [data-set]" },
  { nombre: "Aprender", ruta: "/entreno/aprender.html", clic: ".lesson-item:not([disabled]):not([aria-disabled=true])" },
  { nombre: "Aperturas", ruta: "/entreno/aperturas.html", clic: "button.ficha" },
  { nombre: "Ejercicios por tema", ruta: "/entreno/temas.html", clic: ".theme-card, [data-theme]" },
  { nombre: "Estudio", ruta: "/entreno/estudio.html", clic: ".ficha-item" },
  { nombre: "Precisión posicional", ruta: "/entreno/precision-posicional.html", clic: "#start-btn" },
  { nombre: "Visualización", ruta: "/entreno/visualizacion.html", clic: "[data-nivel]" },
  { nombre: "Habilidades: Detective", ruta: "/entreno/tipos.html#detective", clic: "main :text-is('Empezar')" },
  { nombre: "Habilidades: Con lo justo", ruta: "/entreno/tipos.html#con-lo-justo", clic: "main :text-is('Empezar')" },
  { nombre: "Habilidades: Siete diferencias", ruta: "/entreno/tipos.html#diferencias", clic: "main :text-is('Empezar')",
    titulos: ["Piezas de la posición A", "Piezas de la posición B"] },
  { nombre: "Racha táctica", ruta: "/racha-tactica.html" },
];

async function abrir(browser, ruta, ciega) {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.addInitScript((c) => {
    if (c) localStorage.setItem("ai_vision_v1", JSON.stringify({ persona: "u-ana", vision: "ciego" }));
    else localStorage.setItem("oscarBlindMode_v1", "1");
  }, ciega);
  await ctx.route("**/cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  await ctx.route("**/fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("**/fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("**/*.supabase.co/**", (r) => r.abort());
  await ctx.route("**/js/supabase-client.js", (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: clienteFalso([ALUMNA, PROFE, ADMIN], "u-ana", [], ciega ? CIEGA : {}) }));
  const page = await ctx.newPage();
  await page.goto(BASE + ruta, { waitUntil: "load" });
  await page.waitForTimeout(1800);
  return { page, ctx };
}

/* Los encabezados de piezas que se ven, con lo que viene debajo. */
function leer() {
  return Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
    .filter((h) => /^Piezas\b/.test(h.textContent.trim()) && h.checkVisibility())
    .map((h) => {
      // Lo que sigue: hermanos del encabezado o, en el recuadro, el bloque de la posición.
      let cont = h.nextElementSibling;
      const sub = cont && cont.matches(".cc-pos") ? cont : h.parentElement;
      const h3 = Array.from(sub.querySelectorAll("h3")).filter((x) => x.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_PRECEDING);
      const colores = h3.slice(0, 2).map((x) => {
        const ul = x.nextElementSibling;
        return x.textContent + ":" + (ul && ul.tagName === "UL" && / en [a-z]+ [1-8]/.test(ul.textContent) ? "con piezas" : "SIN LISTA");
      });
      return { titulo: h.textContent.trim(), colores };
    });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  console.log("\n=== Con la cuenta ciega, cada ejercicio trae «Piezas» y las piezas debajo ===");
  for (const e of EJERCICIOS) {
    const { page, ctx } = await abrir(browser, e.ruta, true);
    if (e.clic) {
      await page.locator(e.clic).first().click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    const hs = await page.evaluate(leer);
    const esperados = e.titulos || ["Piezas"];
    cierto(e.nombre + ": " + esperados.join(" y ") + ", con «Blancas» y «Negras» y sus listas debajo",
      hs.length === esperados.length && esperados.every((t, i) => hs[i] && hs[i].titulo === t
        && hs[i].colores.join() === "Blancas:con piezas,Negras:con piezas"),
      JSON.stringify(hs));
    await ctx.close();
  }

  console.log("\n=== Lo que no tiene piezas que poner bajo «Piezas» no se ofrece ===");
  for (const ruta of ["/entreno/memoria.html", "/entreno/coordenadas.html", "/sonar.html", "/batalla-naval.html", "/cursos/academia/fundamentos-del-ajedrez.html"]) {
    const { page, ctx } = await abrir(browser, ruta, true);
    const aviso = await page.evaluate(() => { const c = document.getElementById("vc-no-adaptada"); return !!c && c.checkVisibility(); });
    cierto(ruta + " dice que no está adaptada y ofrece volver al panel", aviso);
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(browser, "/entreno/tipos.html", true);
    const fichas = await page.evaluate(() => Array.from(document.querySelectorAll("#fichas a")).map((a) => a.getAttribute("href")));
    cierto("Habilidades no ofrece la Fotografía", fichas.length > 5 && !fichas.includes("#fotografia"), JSON.stringify(fichas));
    await page.evaluate(() => { location.hash = "#apertura"; });
    await page.waitForTimeout(600);
    const niveles = await page.evaluate(() => Array.from(document.querySelectorAll("#niveles a")).map((a) => a.getAttribute("href")));
    cierto("¿Qué apertura es? sin el nivel 3 (sin tablero)", niveles.join() === "#apertura/1,#apertura/2", JSON.stringify(niveles));
    await page.evaluate(() => { location.hash = "#fotografia/1"; });
    await page.waitForTimeout(600);
    cierto("un enlace guardado a la Fotografía vuelve a la lista", await page.evaluate(() => location.hash === "" || location.hash === "#"));
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(browser, "/ciegos.html", true);
    const vis = await page.evaluate(() => ["h-coordenadas", "h-sonar", "h-batalla"].map((id) => { const h = document.getElementById(id); return h ? h.checkVisibility() : "no está"; }));
    cierto("la guía no muestra Coordenadas, el Sonar ni la Batalla naval", vis.every((v) => v === false), JSON.stringify(vis));
    await ctx.close();
  }

  console.log("\n=== Juega contra Oscar: el tablero, fuera del lector ===");
  {
    const { page, ctx } = await abrir(browser, "/tablero.html", true);
    const r = await page.evaluate(() => {
      const t = document.getElementById("chessboard");
      return {
        oculto: t.getAttribute("aria-hidden"),
        seVe: t.checkVisibility(),
        enElTab: t.querySelectorAll("[tabindex='0']").length,
        marketing: ["#header nav ul", "#menu-toggle"].map((s) => { const e = document.querySelector(s); return e ? e.checkVisibility() : "no está"; }),
      };
    });
    igual("el tablero se ve, pero sin lector ni Tab, y sin el menú del sitio público", r,
      { oculto: "true", seVe: true, enElTab: 0, marketing: [false, false] });
    await ctx.close();
  }
  {
    const { page, ctx } = await abrir(browser, "/tablero.html", false);
    const r = await page.evaluate(() => {
      const t = document.getElementById("chessboard");
      const a8 = t.querySelector('[data-square="a8"]');
      return { oculto: t.getAttribute("aria-hidden"), enElTab: t.querySelectorAll("[tabindex='0']").length, a8: a8 && a8.getAttribute("aria-label") };
    });
    igual("sin la marca, en Modo Adaptado el tablero sigue en el lector y dice «anna 8»", r,
      { oculto: null, enElTab: 1, a8: "anna 8, torre negra" });
    await ctx.close();
  }

  console.log("\n=== Sin la marca, el recuadro sigue sin encabezado nuevo ===");
  const { page, ctx } = await abrir(browser, "/entreno/temas.html", false);
  await page.locator(".theme-card, [data-theme]").first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const caja = document.querySelector(".cc-caja");
    return caja && { titulo: caja.querySelector(".cc-pos-titulo").checkVisibility(), pos: caja.querySelector(".cc-pos").textContent };
  });
  cierto("Ejercicios por tema en Modo Adaptado: la posición en un renglón, sin «Piezas»",
    r && !r.titulo && /^Blancas: .*Negras: /.test(r.pos), JSON.stringify(r));
  await ctx.close();

  await browser.close();
  console.log(fallos ? "\n✗ " + fallos + " comprobación(es) fallaron." : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})();
