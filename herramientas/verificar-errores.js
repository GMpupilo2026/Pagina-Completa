#!/usr/bin/env node
/* Los errores de la gente llegan a Sentry (js/errores.js).
 *
 * Con el sitio en localhost:8777 (o BASE) y playwright. No manda nada a
 * Sentry: el envío se intercepta en el navegador y se lee acá.
 *
 * Todo lo que vigila se rompe callado. Si el cargador falta en una página, esa
 * página deja de avisar y nadie lo nota —justo lo contrario de para qué está—.
 * Si la CSP no deja pasar la dirección del DSN, el navegador corta el envío y
 * solo lo dice en la consola de la persona. Y si el aviso se lleva la
 * dirección entera, se lleva el token de sesión que Supabase deja en el `#`.
 *
 * 1. Sin navegador: todas las páginas cargan js/errores.js, SÍNCRONO (con
 *    `defer` no vería los errores de los scripts del final del <body>) y con
 *    una ruta que llega; si hay DSN, su dirección está en el connect-src.
 * 2. En el navegador, con un DSN de prueba:
 *    - al cargar NO se baja la librería de Sentry (92 KB para nadie);
 *    - un error de un script del final del <body> SÍ llega;
 *    - también una promesa rechazada sin atrapar, y desde entreno/, un piso
 *      abajo (la librería se pide relativa al cargador);
 *    - la dirección llega sin lo que va después del `?` ni del `#`;
 *    - lo de una extensión del navegador no se manda;
 *    - con un error en bucle se mandan como mucho 10;
 *    - sin el DSN de prueba, en localhost no se manda nada.
 *
 *     node herramientas/verificar-errores.js
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const raiz = path.join(__dirname, "..");
const BASE = process.env.BASE || "http://localhost:8777";
const DSN_PRUEBA = "https://clave123@o1.ingest.us.sentry.io/99";
let fallos = 0;
const mal = (m) => { console.log("  ✗ " + m); fallos += 1; };
const bien = (m) => console.log("  ✓ " + m);

// ---- 1. Sin navegador ----
console.log("=== Todas las páginas lo cargan ===");
// La misma lista que pone la cabecera: se le pregunta a pwa-cabecera.py.
const { execFileSync } = require("child_process");
const lista = JSON.parse(execFileSync("python3", ["-c",
  "import importlib.util,json,os;os.chdir(" + JSON.stringify(raiz) + ");" +
  "s=importlib.util.spec_from_file_location('p','herramientas/pwa-cabecera.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);" +
  "print(json.dumps(m.paginas()))"]).toString());
const sinCargador = [], diferido = [], rutaMala = [];
for (const rel of lista) {
  const html = fs.readFileSync(path.join(raiz, rel), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  const m = head.match(/<script\b([^>]*\bsrc="([^"]*js\/errores\.js)"[^>]*)>/);
  if (!m) { sinCargador.push(rel); continue; }
  if (/\b(defer|async)\b/.test(m[1])) diferido.push(rel);
  if (path.resolve(path.dirname(path.join(raiz, rel)), m[2]) !== path.join(raiz, "js/errores.js")) rutaMala.push(rel + " → " + m[2]);
}
if (sinCargador.length) mal("páginas sin js/errores.js en el <head>: " + sinCargador.join(", ") + " (corre herramientas/pwa-cabecera.py)");
else bien(lista.length + " páginas lo cargan en el <head>");
if (diferido.length) mal("lo cargan con defer o async (no verían los errores del <body>): " + diferido.join(", "));
else bien("en todas va síncrono");
if (rutaMala.length) mal("rutas que no llegan a js/errores.js: " + rutaMala.join(", "));
else bien("todas con una ruta que llega");

console.log("=== El DSN y la CSP ===");
const cargador = fs.readFileSync(path.join(raiz, "js/errores.js"), "utf8");
const dsn = (cargador.match(/var DSN = "([^"]*)";/) || [])[1];
const connect = ((fs.readFileSync(path.join(raiz, "_headers"), "utf8").match(/connect-src ([^;]*)/) || [])[1] || "").split(/\s+/);
if (dsn === undefined) mal("no encuentro `var DSN = \"…\";` en js/errores.js");
else if (!dsn) console.log("  · sin DSN: el aviso está apagado en el sitio publicado");
else {
  let host = null;
  try { host = new URL(dsn).host; } catch { }
  if (!host) mal("el DSN no es una dirección: " + dsn);
  else if (connect.includes("https://" + host)) bien("la CSP deja pasar " + host);
  else mal("el connect-src de _headers no deja pasar https://" + host + ": el navegador cortaría cada envío sin decir nada");
}

// ---- 2. En el navegador ----
function eventos(cuerpos) {
  // Un envelope son líneas de JSON: la cabecera, la del ítem y el evento.
  const salida = [];
  for (const c of cuerpos) {
    const lineas = c.split("\n").filter(Boolean);
    for (let i = 1; i < lineas.length; i += 1) {
      let j; try { j = JSON.parse(lineas[i]); } catch { continue; }
      if (j.type === "event" && lineas[i + 1]) { try { salida.push(JSON.parse(lineas[i + 1])); } catch { } i += 1; }
    }
  }
  return salida;
}

async function abrir(navegador, ruta, { prueba = true, cambiar = null } = {}) {
  const ctx = await navegador.newContext({ serviceWorkers: "block" });
  const cuerpos = [];
  const pedidos = [];
  if (prueba) await ctx.addInitScript((d) => { window.__erroresPrueba = { dsn: d }; }, DSN_PRUEBA);
  await ctx.route(/sentry\.io/, async (r) => { cuerpos.push(r.request().postData() || ""); await r.fulfill({ status: 200, body: "{}" }); });
  // Lo de afuera no hace falta y en el CI no hay red.
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => /sentry\.io/.test(r.request().url()) ? r.fallback() : r.abort());
  if (cambiar) {
    await ctx.route((u) => u.pathname === "/" + ruta.split(/[?#]/)[0], async (r) => {
      const res = await r.fetch();
      await r.fulfill({ response: res, body: cambiar(await res.text()) });
    });
  }
  const p = await ctx.newPage();
  p.on("request", (q) => pedidos.push(q.url()));
  await p.goto(BASE + "/" + ruta, { waitUntil: "load" });
  return { ctx, p, cuerpos, pedidos };
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond, ms = 5000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (cond()) return true; await esperar(100); }
  return cond();
}

(async () => {
  const navegador = await chromium.launch();
  try {
    console.log("=== Al cargar no se baja nada ===");
    {
      const { ctx, p, pedidos } = await abrir(navegador, "index.html");
      await esperar(800);
      const activo = await p.evaluate(() => window.ErroresSitio && window.ErroresSitio.activo);
      if (activo) bien("el cargador está escuchando");
      else mal("el cargador no quedó activo con el DSN de prueba");
      if (pedidos.some((u) => /vendor\/sentry\.js/.test(u))) mal("se bajó la librería de Sentry sin que hubiera ningún error");
      else bien("la librería de Sentry no se pide al cargar");
      await ctx.close();
    }

    console.log("=== Un error del final del <body> llega, sin el ? ni el # ===");
    {
      const { ctx, cuerpos, pedidos } = await abrir(navegador, "index.html?token=secreto-q#access_token=secreto-h", {
        cambiar: (h) => h.replace("</body>", "<script>throw new Error('prueba-temprano');</script></body>"),
      });
      await hasta(() => eventos(cuerpos).length > 0);
      const ev = eventos(cuerpos);
      const e = ev.find((x) => JSON.stringify(x).includes("prueba-temprano"));
      if (e) bien("llegó el error del script del final del <body>");
      else mal("el error del final del <body> no llegó (¿el cargador va con defer?)");
      if (pedidos.some((u) => /\/js\/vendor\/sentry\.js$/.test(u))) bien("la librería se pidió recién con el error");
      else mal("no se pidió js/vendor/sentry.js");
      const todo = cuerpos.join("\n");
      if (/secreto/.test(todo)) mal("el envío lleva lo que iba después del ? o del # (el token de la sesión viajaría a Sentry)");
      else bien("la dirección va sin lo del ? ni lo del #");
      if (e && e.request && e.request.url === BASE + "/index.html") bien("la página va escrita: " + e.request.url);
      else mal("la dirección no llegó como se esperaba: " + (e && e.request && e.request.url));
      if (e) {
      const frames = e.exception && e.exception.values && e.exception.values[0].stacktrace;
      if (frames && frames.frames && frames.frames.length) bien("con la pila del error");
      else mal("el error llegó sin su pila");
      if (!e.user) bien("sin datos de la persona");
      else mal("el evento lleva `user`: " + JSON.stringify(e.user));
      }
      await ctx.close();
    }

    console.log("=== Una promesa rechazada, desde entreno/ ===");
    {
      const { ctx, p, cuerpos, pedidos } = await abrir(navegador, "entreno/index.html");
      await p.evaluate(() => { Promise.reject(new Error("prueba-rechazo")); });
      await hasta(() => eventos(cuerpos).some((x) => JSON.stringify(x).includes("prueba-rechazo")));
      if (eventos(cuerpos).some((x) => JSON.stringify(x).includes("prueba-rechazo"))) bien("llegó la promesa rechazada");
      else mal("la promesa rechazada no llegó (¿la librería se pidió con la ruta mal? " + pedidos.filter((u) => /sentry/.test(u)).join(", ") + ")");
      await ctx.close();
    }

    console.log("=== Lo de una extensión no se manda; el tope es 10 ===");
    {
      const { ctx, p, cuerpos } = await abrir(navegador, "index.html");
      await p.evaluate(() => {
        const e = new Error("prueba-extension");
        e.stack = "Error: prueba-extension\n    at chrome-extension://abcdef/contenido.js:1:1";
        window.dispatchEvent(new ErrorEvent("error", { error: e, message: e.message, filename: "chrome-extension://abcdef/contenido.js" }));
        for (let i = 0; i < 25; i += 1) setTimeout(() => { throw new Error("prueba-bucle-" + i); }, 0);
        // El mismo error repetido cuenta una sola vez.
        for (let i = 0; i < 5; i += 1) setTimeout(() => { throw new Error("prueba-repetido"); }, 0);
      });
      await hasta(() => eventos(cuerpos).length >= 10);
      await esperar(1500);
      const ev = eventos(cuerpos);
      const todo = JSON.stringify(ev);
      if (/prueba-extension/.test(todo)) mal("se mandó el error de una extensión del navegador");
      else bien("el error de una extensión no se manda");
      if (ev.length === 10) bien("de 25 errores distintos se mandaron 10");
      else mal("se mandaron " + ev.length + " avisos; el tope es 10");
      await ctx.close();
    }

    console.log("=== Sin el DSN de prueba, en localhost no manda nada ===");
    {
      const { ctx, p, cuerpos, pedidos } = await abrir(navegador, "index.html", { prueba: false });
      await p.evaluate(() => setTimeout(() => { throw new Error("prueba-apagado"); }, 0));
      await esperar(1200);
      const activo = await p.evaluate(() => window.ErroresSitio && window.ErroresSitio.activo);
      if (!activo && !cuerpos.length && !pedidos.some((u) => /sentry/.test(u))) bien("apagado: ni se baja la librería ni se manda nada");
      else mal("en localhost, sin el DSN de prueba, igual hizo algo");
      await ctx.close();
    }
  } finally {
    await navegador.close();
  }
  console.log(fallos ? "\n" + fallos + " comprobación(es) fallaron" : "\nTodo bien: los errores llegan, sin datos de la gente y sin peso de más.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
