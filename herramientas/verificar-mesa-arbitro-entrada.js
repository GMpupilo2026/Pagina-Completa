/* mesa-arbitro.html: la entrada de la ÚNICA Mesa del árbitro (desde el 19/11/2026).

   La mesa aparte de «Dirijo solo» se retiró: quien dirige solo usa el mismo evento y su propia tablet («Soy el único
   árbitro», que prueba verificar-centroamericano-mesas-pagina.js). Este verificador comprueba la entrada:

   - sin licencia, el candado; con licencia, «¿Sobre qué vas a trabajar?» y ya no queda nada de la mesa vieja;
   - los enlaces viejos siguen sirviendo: #adjunto=… y #codigo=… van a la vista del adjunto en Pareo, y #solo explica
     dónde quedó (sin pedir la licencia para los primeros: un adjunto no la tiene);
   - «¿Te dieron mesas?»: un enlace de la tablet, la puerta corta, un enlace de adjunto de Pareo y un código de 8 letras
     (primero como código de la tablet y, si no existe, como código de adjunto de Pareo); lo que no se entiende se dice;
   - «Consultar sin anotar»: el corrector del reloj y el reglamento abren y calculan sin anotar nada;
   - la lectura de lo pegado, en Node (js/mesa-arbitro-entrada.js exporta leerEntrada).

   Ver «Una sola Mesa del árbitro» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js mesa-arbitro-entrada */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
  const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
  if (a === b) console.log("  ✓ " + nombre);
  else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

console.log("=== Lo que se pega, en Node ===");
const { leerEntrada } = require(path.join(RAIZ, "js", "mesa-arbitro-entrada.js"));
const TOKEN = "ab".repeat(32);
igual("un enlace de la tablet da su token", leerEntrada("https://ajedrez-integral.com/centroamericano-arbitro.html#" + TOKEN), { tipo: "token", valor: TOKEN });
igual("la puerta corta (/m/K7M2-9QXA) es un código de la tablet", leerEntrada("ajedrez-integral.com/m/K7M2-9QXA"), { tipo: "codigo-tablet", valor: "K7M29QXA" });
igual("un enlace de adjunto de Pareo da su cadena", leerEntrada("https://ajedrez-integral.com/pareo.html#adjunto=k7m29qxa&m=1-10"), { tipo: "adjunto", valor: "k7m29qxa&m=1-10" });
igual("un código suelto, con guion y en minúscula, es un código", leerEntrada(" k7m2-9qxa "), { tipo: "codigo", valor: "K7M29QXA" });
igual("letras que no usa ningún código (I, L, O, 0, 1) no son un código", [leerEntrada("K7M2-9QXI"), leerEntrada("hola"), leerEntrada("")], [null, null, null]);
igual("de otro sitio no se toma la dirección, solo el dato", leerEntrada("https://otro.com/centroamericano-arbitro.html#" + TOKEN).valor, TOKEN);

const pagina = fs.readFileSync(path.join(RAIZ, "mesa-arbitro.html"), "utf8");
igual("la página ya no carga la mesa vieja (ni su código ni sus secciones)",
  ["mesa-arbitro-pagina.js", "mesa-arbitro-pareo.js", 'id="solo"', 'id="zona-pareo"', 'id="m-leer"', 'id="b-pdf"'].filter((x) => pagina.includes(x)), []);

const TOKEN_CANJE = "cd".repeat(32);
function doble(licencia) {
  return `(function(){
  window.__pedidos = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  window.sb = {
    auth: {
      getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => R({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) },
    },
    rpc: (f, a) => { window.__pedidos.push("rpc " + f + " " + ((a && a.p_herramienta) || "")); return R(f === "tengo_herramienta" ? ${licencia ? "a.p_herramienta === 'mesa-arbitro'" : "false"} : null); },
    functions: { invoke: (f, o) => {
      window.__pedidos.push("invoke " + f + " " + JSON.stringify(o.body));
      if (f === "centroamericano-codigo") return o.body.codigo === "K7M29QXA" ? R({ ok: true, token: "${TOKEN_CANJE}" }) : R({ ok: false, error: "No existe" });
      return R(null);
    } },
    from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, maybeSingle: () => R(null), then: (ok) => R([]).then(ok) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, licencia, hash) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
  await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(licencia) }));
  await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
  await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
  // La vista del adjunto en Pareo: solo importa que se llegue ahí con lo de la dirección.
  await ctx.route("**/pareo.html*", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>Pareo</title><p id=pareo>Pareo</p>" }));
  await ctx.route("**/centroamericano-arbitro.html*", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>Tablet</title><p id=tablet>Tablet</p>" }));
  // Pareo Integral contesta el código de adjunto (pareo-publicar, acción adjunto_entrar).
  await ctx.route(/functions\/v1\/pareo-publicar/, (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    const ok = b.accion === "adjunto_entrar" && b.codigo === "p4r3ad2j";
    return r.fulfill({ status: ok ? 200 : 404, contentType: "application/json", body: JSON.stringify(ok ? { ok: true, desde: 3, hasta: 8 } : { ok: false, error: "No existe ese código" }) });
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(BASE + "/mesa-arbitro.html" + (hash || ""), { waitUntil: "load" });
  return { ctx, p, errores };
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

  console.log("\n=== La licencia ===");
  {
    const { ctx, p } = await abrir(browser, false);
    await p.waitForFunction(() => !document.getElementById("denegado").classList.contains("hidden"));
    igual("sin licencia, el candado y nada más", await p.evaluate(() => [document.getElementById("app").checkVisibility(), window.__pedidos.includes("rpc tengo_herramienta mesa-arbitro")]), [false, true]);
    await ctx.close();
  }

  console.log("\n=== Los enlaces viejos ===");
  for (const [hash, nombre] of [["#adjunto=k7m29qxa&m=1-10", "#adjunto=… va a la vista del adjunto en Pareo, con su cadena"], ["#codigo=K7M2-9QXA", "#codigo=… va a Pareo, que pide el código"], ["#codigo", "#codigo solo, también"]]) {
    const { ctx, p } = await abrir(browser, false, hash);
    await p.waitForSelector("#pareo", { timeout: 8000 }).catch(() => {});
    igual(nombre + " (sin pedir la licencia)", [new URL(p.url()).pathname, new URL(p.url()).hash, await p.evaluate(() => (window.__pedidos || []).length)], ["/pareo.html", hash, 0]);
    await ctx.close();
  }
  {
    const { ctx, p, errores } = await abrir(browser, true, "#solo");
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("#solo dice dónde quedó la mesa de un solo árbitro («Soy el único árbitro») y lo enfoca", await p.evaluate(() => { const a = document.getElementById("aviso-solo"); return [a.checkVisibility(), /Soy el único árbitro/.test(a.textContent), document.activeElement === a]; }), [true, true, true]);
    igual("con licencia: la entrada, «¿Te dieron mesas?» y las consultas, sin nada de la mesa vieja", await p.evaluate(() => [
      document.getElementById("entrada").checkVisibility(), document.getElementById("mis-mesas").checkVisibility(), document.getElementById("consultas").checkVisibility(),
      !!document.querySelector("#entrada-solo, #zona-pareo, #m-leer, #b-pdf")]), [true, true, true, false]);
    igual("sin errores en la página", errores, []);
    await ctx.close();
  }

  console.log("\n=== ¿Te dieron mesas? ===");
  const pegar = async (texto, espera) => {
    const { ctx, p, errores } = await abrir(browser, true);
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    await p.fill("#mm-entrada", texto);
    await p.click("#mm-entrar");
    // Sin reventar si no llega: la comprobación de abajo dice qué pasó.
    if (espera) await p.waitForSelector(espera, { timeout: 8000 }).catch(() => {}); else await p.waitForFunction(() => document.getElementById("mm-estado").textContent.trim() && !document.getElementById("mm-entrar").disabled);
    return { ctx, p, errores };
  };
  {
    const { ctx, p } = await pegar("https://ajedrez-integral.com/centroamericano-arbitro.html#" + TOKEN, "#tablet");
    igual("un enlace de la tablet abre la tablet de este sitio con ese token", [new URL(p.url()).pathname, new URL(p.url()).hash], ["/centroamericano-arbitro.html", "#" + TOKEN]);
    await ctx.close();
  }
  {
    const { ctx, p } = await pegar("k7m2-9qxa", "#tablet");
    igual("un código de la tablet se canjea y abre la tablet con el token que dio la base", new URL(p.url()).hash, "#" + TOKEN_CANJE);
    await ctx.close();
  }
  {
    const { ctx, p } = await pegar("P4R3-AD2J", "#pareo");
    igual("un código que no es de la tablet se prueba como adjunto de Pareo y abre sus mesas", new URL(p.url()).hash, "#adjunto=p4r3ad2j&m=3-8");
    await ctx.close();
  }
  {
    const { ctx, p } = await pegar("ZZZZ-ZZZZ");
    igual("un código que no existe en ningún lado se dice, y no se va a ninguna parte", [/No encontramos ese código/.test(await p.textContent("#mm-estado")), new URL(p.url()).pathname], [true, "/mesa-arbitro.html"]);
    await ctx.close();
  }
  {
    const { ctx, p } = await pegar("cualquier cosa");
    igual("lo que no se entiende se dice", /No entendí eso/.test(await p.textContent("#mm-estado")), true);
    await ctx.close();
  }

  console.log("\n=== Consultar sin anotar ===");
  {
    const { ctx, p, errores } = await abrir(browser, true);
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("el ritmo dice que no está confirmado mientras no se escriba", /sin confirmar/.test(await p.textContent("#c-ritmo")), true);
    await p.click("#c-reloj");
    await p.waitForSelector('dialog[open] select[name="caso"]');
    await p.selectOption('dialog[open] select[name="caso"]', "incremento");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector('dialog[open] input[name="jb"]');
    await p.fill('dialog[open] input[name="jb"]', "20");
    await p.fill('dialog[open] input[name="jn"]', "20");
    await p.fill('dialog[open] input[name="tb"]', "4000");
    await p.fill('dialog[open] input[name="tn"]', "4000");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => /Pon blancas/.test((document.querySelector("dialog[open]") || {}).textContent || ""));
    const texto = await p.textContent("dialog[open]");
    igual("el reloj calcula con las cuentas a la vista y el artículo, y solo ofrece «Listo» (no anota nada)", [/art\. 6\.10/.test(texto), /Cómo se calculó/.test(texto), (await p.textContent("dialog[open] [data-avisos-aceptar]")).trim()], [true, true, "Listo"]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.click("#c-reglamento");
    await p.waitForSelector('dialog[open] select[name="tipo"]');
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => /Lo que se suele aplicar/.test((document.querySelector("dialog[open]") || {}).textContent || ""));
    igual("el reglamento dice la regla y la sanción que se suele aplicar", true, true);
    await p.click("dialog[open] [data-avisos-aceptar]");
    // (Las rpc del encabezado, comunes a toda página de la Academia —avisos, acceso, marca—, no cuentan.)
    igual("ninguna consulta llamó a una función", await p.evaluate(() => window.__pedidos.filter((x) => /^invoke /.test(x))), []);
    igual("sin errores en la página", errores, []);
    await ctx.close();
  }

  await browser.close();
  console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
