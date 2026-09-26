/* El encabezado no tiembla al hacer scroll.

   El encabezado es sticky (está en el flujo) y js/main.js lo encoge
   (#header.scrolled) al bajar. Al encogerse, todo lo de abajo sube unos 24px y
   el navegador corrige el scroll para que el contenido no se mueva (scroll
   anchoring): scrollY baja esos mismos 24px. Con un solo umbral eso lo volvía
   a dejar del otro lado, se agrandaba, se volvía a encoger… y el encabezado
   saltaba sin parar con el scroll quieto entre 31 y ~54px (se vio en
   sesion.html, pero pasaba en todo el sitio).

   Lo que comprueba, en computadora y en celular, normal y en modo adaptado:
   dejando el scroll quieto en cada posición de 0 a 120px, la clase del
   encabezado cambia a lo sumo una vez y después se queda quieta; y que al
   bajar de verdad se encoge y al volver arriba se agranda.

       node herramientas/verificar-encabezado-scroll.js                     */
const { chromium } = require("playwright");

const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function cierto(nombre, valor, detalle) {
  if (valor) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const [ancho, alto] of [[1280, 800], [390, 740]]) {
    for (const adaptado of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, serviceWorkers: "block" });
      const page = await ctx.newPage();
      await page.goto(BASE + "/index.html", { waitUntil: "load" });
      console.log(`\n${ancho}px${adaptado ? ", modo adaptado" : ""}`);
      const r = await page.evaluate(async (adaptado) => {
        const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
        const html = document.documentElement;
        html.style.scrollBehavior = "auto";
        if (adaptado) html.classList.add("adaptive-mode");
        const h = document.getElementById("header");
        let cambios = 0;
        new MutationObserver(() => { cambios += 1; }).observe(h, { attributes: true, attributeFilter: ["class"] });
        const temblores = [];
        for (let y = 0; y <= 120; y += 4) {
          window.scrollTo(0, 0); await esperar(40);
          window.scrollTo(0, y); await esperar(50);
          cambios = 0;
          await esperar(250);
          if (cambios > 0) temblores.push(`${y}px: ${cambios} cambios con el scroll quieto`);
        }
        window.scrollTo(0, 0); await esperar(100);
        const arriba = h.classList.contains("scrolled");
        window.scrollTo(0, 400); await esperar(100);
        const abajo = h.classList.contains("scrolled");
        window.scrollTo(0, 0); await esperar(100);
        const deVuelta = h.classList.contains("scrolled");
        return { temblores, arriba, abajo, deVuelta };
      }, adaptado);
      cierto("con el scroll quieto, el encabezado no cambia solo", r.temblores.length === 0, r.temblores.slice(0, 4).join(" · "));
      cierto("arriba del todo va grande", !r.arriba);
      cierto("al bajar se encoge", r.abajo);
      cierto("al volver arriba se agranda", !r.deVuelta);
      await ctx.close();
    }
  }
  await browser.close();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
