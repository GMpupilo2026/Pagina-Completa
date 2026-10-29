/* acta-jde.html: el «Acta e informe arbitral JDE», con un doble de Supabase
   (la licencia y la Edge Function desempates-chess-results contestadas por
   el mismo torneo armado a mano de verificar-acta-jde.js, dos veces: dos
   torneos de la misma etapa).

   Lo que comprueba (el armado en sí lo revisa verificar-acta-jde.js):
   - sin licencia, el candado; con licencia, pide la herramienta «acta-jde»;
   - el lugar cambia con la etapa: las Direcciones Regionales, las
     interregionales o un texto;
   - carga los dos enlaces, los lista y avisa lo que no cuadra;
   - el PDF y el Word se bajan con la marca de agua, y el Excel de
     clasificados trae a los tres de cada torneo;
   - a 390 px no se desplaza a lo ancho y no hay errores en la página.

   Ver «Acta e informe arbitral JDE» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js acta-jde-pagina                  */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

// El torneo de verificar-acta-jde.js, sacado de ahí para no tener dos copias.
const fuente = fs.readFileSync(path.join(__dirname, "verificar-acta-jde.js"), "utf8");
const DATOS = new Function(fuente.slice(fuente.indexOf("const P = "), fuente.indexOf("const EV = ")) + "\nreturn DATOS;")();

function doble(licencia) {
    return `(function(){
  window.__pedidos = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const DATOS = ${JSON.stringify(DATOS)};
  let n = 0;
  window.sb = {
    auth: {
      getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => R({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) },
    },
    rpc: (f, a) => { window.__pedidos.push(f + " " + (a && a.p_herramienta || "")); return R(f === "tengo_herramienta" ? ${licencia ? "a.p_herramienta === 'acta-jde'" : "false"} : null); },
    functions: { invoke: (f, o) => { window.__pedidos.push("invoke " + f + " " + JSON.stringify(o.body)); n++;
      return R(Object.assign({}, DATOS, { titulo: n === 1 ? DATOS.titulo : DATOS.titulo.replace("Abierto", "Mujeres") })); } },
    from: () => { const q = {}; ["select","eq","order","range","in","single","maybeSingle","limit","update","insert"].forEach((m) => q[m] = () => q); q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok); return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;
}

async function abrir(browser, licencia) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble(licencia) }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/acta-jde.html", { waitUntil: "load" });
    return { ctx, p, errores };
}

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, false);
    await p.waitForFunction(() => document.getElementById("denegado").checkVisibility());
    igual("el candado, y la herramienta no se ve", await p.$eval("#app", (a) => a.checkVisibility()), false);
    igual("pregunta por la licencia de «acta-jde»", await p.evaluate(() => window.__pedidos.includes("tengo_herramienta acta-jde")), true);
    await ctx.close();

    console.log("\n=== La etapa ===");
    let errores;
    ({ ctx, p, errores } = await abrir(browser, true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    const lugar = () => p.evaluate(() => [document.getElementById("a-lugar-etiqueta").textContent, document.getElementById("a-lugar").checkVisibility(), document.getElementById("a-lugar-texto").checkVisibility()]);
    igual("Regional: la lista de Direcciones Regionales", [await lugar(), await p.$$eval("#a-lugar option", (l) => l.length)], [["Dirección Regional", true, false], 27]);
    await p.selectOption("#a-etapa", "interregional");
    igual("Interregional: las once interregionales", [await lugar(), await p.$eval("#a-lugar option", (o) => o.textContent)], [["Interregional", true, false], "Interregional I (Cañas-Liberia)"]);
    await p.selectOption("#a-etapa", "institucional");
    igual("Institucional: se escribe", await lugar(), ["Centro educativo o circuito", false, true]);
    await p.selectOption("#a-etapa", "regional");
    await p.selectOption("#a-lugar", "Limón");
    await p.fill("#a-arbitro", "Ana Árbitra");
    igual("sin torneos, no se puede bajar", await p.$eval("#a-pdf", (b) => b.disabled), true);

    console.log("\n=== Los torneos ===");
    await p.fill("#a-enlaces", "https://s3.chess-results.com/tnr1.aspx\nhttps://s3.chess-results.com/tnr2.aspx");
    await p.click("#a-cargar");
    await p.waitForSelector("#a-torneos li:nth-child(2)");
    igual("le pide a la función la herramienta «acta-jde», una vez por enlace",
        await p.evaluate(() => window.__pedidos.filter((x) => x.startsWith("invoke desempates-chess-results") && x.includes('"herramienta":"acta-jde"')).length), 2);
    igual("los dos torneos en la lista", await p.$$eval("#a-torneos li", (l) => l.map((li) => li.querySelector("span").textContent)),
        ["Etapa Regional JDE Categoría C Individual Abierto", "Etapa Regional JDE Categoría C Individual Mujeres"]);
    igual("avisa lo que no cuadra con chess-results (el empate que separa)", await p.$$eval('#avisos li[data-aviso="orden"]', (l) => l.length), 2);

    console.log("\n=== Bajar ===");
    const bajar = async (boton) => {
        const [d] = await Promise.all([p.waitForEvent("download"), p.click(boton)]);
        return { nombre: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
    };
    const pdf = await bajar("#a-pdf");
    igual("el PDF, con su nombre y la marca de agua", [pdf.nombre, pdf.bytes.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(pdf.bytes.toString("latin1"))],
        ["informe-jde-2026-regional-limon.pdf", true, true]);
    const docx = await bajar("#a-docx");
    igual("el Word, con la marca en el encabezado y el título", [docx.nombre, docx.bytes.includes("word/media/marca.png"), docx.bytes.includes("Informe oficial de participación")],
        ["informe-jde-2026-regional-limon.docx", true, true]);
    const xlsx = await bajar("#a-excel");
    const texto = xlsx.bytes.toString("utf8");
    igual("el Excel de clasificados: los tres de cada torneo, con la columna «Torneo»",
        [xlsx.nombre, (texto.match(/Uno, Ana/g) || []).length, texto.includes("Mujeres"), texto.includes("Dos, Beto")], ["clasificados-jde-2026-regional-limon.xlsx", 2, true, false]);

    console.log("\n=== En el celular ===");
    await p.setViewportSize({ width: 390, height: 800 });
    igual("la página no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("sin errores en la página", errores, []);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
