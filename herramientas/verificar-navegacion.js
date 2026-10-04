/* Comprueba, en un navegador de verdad, lo que hace que pasar de una página a
   otra se sienta inmediato (ver «La navegación se siente inmediata» en
   docs/decisiones/sitio-e-infraestructura.md):

     - la barra de «cargando la página siguiente» (js/navegacion.js) SALE
       cuando la página nueva tarda, se ve (opacidad y checkVisibility, no la
       clase) y tiene contraste contra el encabezado que tiene detrás;
     - NO sale con un ancla de la misma página ni con un enlace a otro sitio
       (WhatsApp en el celular abre la app y la página se queda: la barra
       quedaría pegada);
     - se apaga al volver con «Atrás» a una página guardada entera (bfcache);
     - la transición entre páginas (@view-transition) está, se apaga para
       quien pidió menos movimiento, y cuando el navegador la cancela no sale
       como error de la página;
     - el service worker deja encendido el navigation preload y la página
       sale y se guarda igual con él (lo de sin red lo prueba verificar-pwa);
     - todas las páginas con la cabecera de app cargan js/navegacion.js.

   Uso:  python3 -m http.server 8777    (desde la raíz del sitio)
         node herramientas/verificar-navegacion.js                            */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";

let fallos = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) console.log("  ✓ " + nombre + (detalle ? ": " + detalle : ""));
  else { console.log("  ✗ " + nombre + (detalle ? "\n      " + detalle : "")); fallos += 1; }
}

function luminancia(rgb) {
  const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const aRgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);

function revisarPaginas() {
  console.log("\n=== Todas las páginas con la cabecera de app cargan la barra ===");
  const { execFileSync } = require("child_process");
  const lista = execFileSync("python3", ["-c",
    "import importlib.util,json;s=importlib.util.spec_from_file_location('p','herramientas/pwa-cabecera.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.paginas()))"],
    { cwd: RAIZ, encoding: "utf8" });
  const paginas = JSON.parse(lista);
  const sin = paginas.filter((p) => {
    const html = fs.readFileSync(path.join(RAIZ, p), "utf8");
    return !/<script src="(\.\.\/)*js\/navegacion\.js" defer><\/script>/.test(html);
  });
  ok(paginas.length + " páginas con js/navegacion.js", sin.length === 0, sin.length ? "faltan: " + sin.join(", ") : "");
}

/* El estado de la barra, medido en la pantalla. */
function estadoBarra(p) {
  return p.evaluate(() => {
    const b = document.getElementById("barra-navegacion");
    if (!b) return { existe: false, visible: false };
    const cs = getComputedStyle(b);
    return {
      existe: true,
      visible: b.checkVisibility({ opacityProperty: true }) && Number(cs.opacity) > 0.9,
      fondo: cs.backgroundColor,
      oculta: b.getAttribute("aria-hidden"),
    };
  });
}

async function probarBarra(navegador) {
  console.log("\n=== La barra sale cuando la página tarda ===");
  const ctx = await navegador.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  // cursos.html tarda 1,5 s en llegar: lo que tarda una página con 4G mala.
  await p.route(/\/cursos\.html$/, async (ruta) => { await new Promise((r) => setTimeout(r, 1500)); await ruta.continue(); });
  // Lo de otro sitio no sale nunca (el navegador de prueba no tiene que ir a
  // WhatsApp): contesta 204, y con eso la página se queda donde estaba, como
  // cuando el enlace abre la app de WhatsApp en el celular.
  await p.route(/^https:\/\/wa\.me\//, (ruta) => ruta.fulfill({ status: 204, body: "" }));

  await p.goto(BASE + "/index.html", { waitUntil: "load" });

  // Un ancla de la misma página: nada.
  await p.evaluate(() => {
    const a = document.createElement("a"); a.href = "#contenido-prueba"; a.textContent = "ancla"; a.id = "ancla-prueba";
    document.body.appendChild(a);
  });
  await p.click("#ancla-prueba");
  await p.waitForTimeout(400);
  ok("un ancla de la misma página no enciende la barra", !(await estadoBarra(p)).visible);

  // Un enlace a otro sitio, en la misma pestaña: nada.
  await p.evaluate(() => {
    const a = document.createElement("a"); a.href = "https://wa.me/50600000000"; a.textContent = "wa"; a.id = "afuera-prueba";
    document.body.appendChild(a);
  });
  await p.click("#afuera-prueba");
  await p.waitForTimeout(400);
  ok("un enlace a otro sitio no enciende la barra", /index\.html(#.*)?$/.test(p.url()) && !(await estadoBarra(p)).visible, p.url());

  // La navegación de verdad, a una página del sitio que tarda, desde una
  // página recién abierta. Se mide DENTRO del mismo evaluate: con la
  // navegación ya pedida, Playwright no deja entrar uno nuevo a la página vieja.
  await p.goto(BASE + "/index.html", { waitUntil: "load" });
  const durante = await clicYMedir(p, false);
  ok("mientras la página siguiente tarda, la barra se ve", durante.visible, JSON.stringify(durante));
  ok("la barra es adorno para el lector de pantalla (aria-hidden)", durante.oculta === "true");
  if (durante.fondo) {
    const c = contraste(aRgb(durante.fondo), aRgb(durante.detras));
    ok("contraste de la barra contra el encabezado ≥ 3:1", c >= 3, c.toFixed(2) + ":1 (" + durante.fondo + " sobre " + durante.detras + ")");
  }
  await p.waitForURL(/cursos\.html$/, { timeout: 10000 });
  await p.waitForLoadState("load");
  ok("en la página nueva la barra ya no está", !(await estadoBarra(p)).visible);

  // Con el color de una academia, blanca (ese color está medido contra el blanco).
  await p.goto(BASE + "/index.html", { waitUntil: "load" });
  const marca = await clicYMedir(p, true);
  ok("con el color de una academia, la barra sale y es blanca", marca.visible && marca.fondo === "rgb(255, 255, 255)",
    marca.fondo + " sobre " + marca.detras + (marca.fondo ? " · " + contraste(aRgb(marca.fondo), aRgb(marca.detras)).toFixed(2) + ":1" : ""));
  await p.waitForURL(/cursos\.html$/, { timeout: 10000 });
  await ctx.close();

  // El color sale de cada tema: accent-400 sobre brand-800, en los ocho.
  const { TEMAS } = require(path.join(RAIZ, "js", "temas-plataforma.js"));
  const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const flojos = Object.entries(TEMAS).map(([n, t]) => [n, contraste(hex(t.accent["400"]), hex(t.brand["800"]))]).filter(([, c]) => c < 3);
  ok("en los " + Object.keys(TEMAS).length + " temas, accent-400 sobre brand-800 da ≥ 3:1", flojos.length === 0, flojos.map(([n, c]) => n + " " + c.toFixed(2)).join(", "));
}

/* Toca «Cursos» (que tarda 1,5 s) y mide la barra 450 ms después, antes de
   que llegue la página nueva. */
function clicYMedir(p, conMarca) {
  return p.evaluate(async (conMarca) => {
    if (conMarca) {
      document.documentElement.setAttribute("data-marca-academia", "");
      document.documentElement.style.setProperty("--marca-academia", "#7a1f5c");
    }
    document.querySelector('a[href="cursos.html"]').click();
    await new Promise((r) => setTimeout(r, 450));
    const b = document.getElementById("barra-navegacion");
    const detras = getComputedStyle(document.getElementById("header")).backgroundColor;
    if (!b) return { existe: false, visible: false, detras };
    const cs = getComputedStyle(b);
    return {
      existe: true,
      visible: b.checkVisibility({ opacityProperty: true }) && Number(cs.opacity) > 0.9,
      fondo: cs.backgroundColor, oculta: b.getAttribute("aria-hidden"), detras,
    };
  }, conMarca);
}

async function probarAtras(navegador) {
  console.log("\n=== Al volver con «Atrás» a una página guardada, la barra se apaga ===");
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  const p = await ctx.newPage();
  await p.goto(BASE + "/index.html", { waitUntil: "load" });
  // Lo que pasa en una página que vuelve de bfcache: la barra quedó encendida
  // al salir y llega un pageshow con persisted.
  await p.evaluate(() => {
    const b = document.createElement("div"); b.id = "barra-navegacion"; b.className = "activa"; document.body.appendChild(b);
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await p.waitForTimeout(300);
  ok("pageshow apaga la barra", !(await estadoBarra(p)).visible);
  await ctx.close();
}

async function probarTransicion(navegador) {
  console.log("\n=== La transición entre páginas ===");
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const ctx = await navegador.newContext({ serviceWorkers: "block", reducedMotion });
    const p = await ctx.newPage();
    await p.goto(BASE + "/index.html", { waitUntil: "load" });
    const r = await p.evaluate(() => {
      let regla = null;
      for (const hoja of document.styleSheets) {
        let reglas; try { reglas = hoja.cssRules; } catch (e) { continue; }
        for (const m of reglas) {
          if (!m.media || !m.cssRules) continue;
          for (const dentro of m.cssRules) {
            if (/@view-transition/.test(dentro.cssText) && /navigation:\s*auto/.test(dentro.cssText)) regla = m.media.mediaText;
          }
        }
      }
      return {
        regla,
        activa: regla ? matchMedia(regla).matches : false,
        nombre: getComputedStyle(document.getElementById("header")).viewTransitionName,
      };
    });
    if (reducedMotion === "no-preference") {
      ok("@view-transition { navigation: auto } está en el CSS", !!r.regla, r.regla || "no se encontró");
      ok("con movimiento, se aplica", r.activa);
      ok("el encabezado tiene su nombre y se queda quieto", r.nombre === "encabezado", r.nombre);
    } else {
      ok("con «reducir movimiento», no se aplica", r.regla && !r.activa);
      ok("…ni el encabezado lleva nombre", r.nombre === "none", r.nombre);
    }
    await ctx.close();
  }

  // Si la página de llegada no pide la transición, el navegador la cancela y
  // rechaza sus promesas: eso no puede salir como error de la página (le
  // llegaría a Sentry). Se simula el pageswap con una transición cancelada.
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e)));
  await p.goto(BASE + "/index.html", { waitUntil: "load" });
  await p.evaluate(() => {
    const cancelada = () => Promise.reject(new DOMException("Transition was aborted because of invalid state. ViewTransition opt-in disabled", "InvalidStateError"));
    for (const tipo of ["pageswap", "pagereveal"]) {
      const e = new Event(tipo);
      e.viewTransition = { ready: cancelada(), finished: cancelada(), updateCallbackDone: cancelada() };
      window.dispatchEvent(e);
    }
  });
  await p.waitForTimeout(300);
  ok("una transición cancelada no sale como error de la página", errores.length === 0, errores.join(" | "));

  // …y aunque el rechazo no pase por pageswap (en Chrome 153 se escapaba a
  // veces): js/errores.js lo reconoce, no lo manda a Sentry y lo calla. Un
  // error de verdad con otro mensaje sí tiene que seguir saliendo.
  await p.evaluate(() => {
    Promise.reject(new DOMException("Transition was aborted because of invalid state. ViewTransition opt-in disabled", "InvalidStateError"));
    Promise.reject(new DOMException("Transition was skipped. Navigation aborted", "AbortError"));
  });
  await p.waitForTimeout(300);
  ok("un rechazo suelto de una transición cancelada tampoco sale como error", errores.length === 0, errores.join(" | "));
  await p.evaluate(() => { Promise.reject(new DOMException("Otra cosa que falló", "AbortError")); });
  await p.waitForTimeout(300);
  ok("un rechazo de otra cosa sí sale (no se calla todo)", errores.length === 1, errores.join(" | ") || "no salió");
  await ctx.close();
}

async function probarServiceWorker(navegador) {
  console.log("\n=== El service worker con navigation preload ===");
  const ctx = await navegador.newContext({ serviceWorkers: "allow" });
  const p = await ctx.newPage();
  await p.goto(BASE + "/index.html", { waitUntil: "load" });
  // `ready` llega con el service worker activándose, antes de que termine su
  // `activate`, que es donde se enciende el preload: se espera a «activated».
  const estado = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sw = reg.active;
    if (sw.state !== "activated") await new Promise((r) => sw.addEventListener("statechange", () => { if (sw.state === "activated") r(); }));
    if (!reg.navigationPreload) return { soportado: false };
    return { soportado: true, ...(await reg.navigationPreload.getState()) };
  });
  ok("navigation preload encendido", estado.soportado && estado.enabled === true, JSON.stringify(estado));

  // Con el service worker mandando, una página sale entera y la guarda. Lo de
  // sin red lo prueba verificar-pwa.js, cortando el servidor de verdad.
  await p.reload({ waitUntil: "load" });
  const controla = await p.evaluate(() => !!navigator.serviceWorker.controller);
  ok("el service worker controla la página", controla);
  const r = await p.goto(BASE + "/precios.html", { waitUntil: "load" });
  ok("con navigation preload, la página llega bien", r && r.ok() && (await p.title()).length > 0, r ? String(r.status()) : "sin respuesta");
  const guardada = await p.evaluate(async () => !!(await caches.match("/precios.html")));
  ok("…y queda guardada para cuando no haya red", guardada);
  await ctx.close();
}

(async () => {
  revisarPaginas();
  const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    await probarBarra(navegador);
    await probarAtras(navegador);
    await probarTransicion(navegador);
    await probarServiceWorker(navegador);
  } finally {
    await navegador.close();
  }
  console.log(fallos ? "\n✗ " + fallos + " fallo(s)" : "\n✓ Todo bien");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
