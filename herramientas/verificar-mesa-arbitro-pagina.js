/* mesa-arbitro.html: la «Mesa del árbitro», con un doble de Supabase (la
   licencia, la Edge Function mesa-arbitro y la tabla arbitro_bitacora, que
   en el doble guarda, filtra por torneo y le pone la hora a cada línea como
   lo hace la base).

   Lo que comprueba (el lector de chess-results y la migración los revisa
   verificar-mesa-arbitro.js):
   - sin licencia, el candado; con licencia, pide la herramienta «mesa-arbitro»;
   - «Leer la ronda» manda el código y la clave a la función y pinta las mesas;
   - el buscador (sin tildes) y «solo las mesas sin resultado»;
   - no se puede guardar sin haber elegido algo; guardar pide confirmar, dice
     la ronda y manda SOLO lo cambiado, con los jugadores que el árbitro vio;
   - la bitácora de un resultado enviado se escribe cuando la función lo
     comprobó; una corrección lleva el resultado anterior; si chess-results
     no tiene lo que se pidió, NO queda como enviado y se avisa;
   - «Solo anotar» escribe sin mandar nada a chess-results;
   - las incidencias; el PDF y el Word con la marca de agua;
   - la clave no queda en el navegador ni en la bitácora;
   - a 390 px no se desplaza a lo ancho y no hay errores en la página.

   Ver «Mesa del árbitro: resultados y bitácora» en
   docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js mesa-arbitro-pagina               */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const fs = require("fs");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const SID = "AAAA1111BBBB2222CCCC3333DDDD4444";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

const MESAS = [
    { mesa: 1, blancas: "Muñoz Feliz Alejandro", negras: "Gramajo Tovar Marco", valor: "0" },
    { mesa: 2, blancas: "Harvey Ian", negras: "Acuña Porras Fabio", valor: "0" },
    { mesa: 3, blancas: "Hopkins John", negras: "Baquero Graterol", valor: "2" },
];

function doble(licencia) {
    return `(function(){
  window.__pedidos = [];
  window.__insertados = [];
  window.__modo = "bien";
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const MESAS = ${JSON.stringify(MESAS)};
  const FILAS = [];
  window.sb = {
    auth: {
      getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => R({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) },
    },
    rpc: (f, a) => { window.__pedidos.push(f + " " + (a && a.p_herramienta || "")); return R(f === "tengo_herramienta" ? ${licencia ? "a.p_herramienta === 'mesa-arbitro'" : "false"} : null); },
    functions: { invoke: (f, o) => {
      window.__pedidos.push("invoke " + f);
      window.__ultimo = o.body;
      const b = o.body;
      if (b.action === "leer") {
        if (window.__modo === "clave") return R({ error: "chess-results no aceptó el código o la clave. Revísalos en Swiss-Manager." });
        return R({ tnr: b.tnr, torneo: "Torneo de Prueba", ronda: 3, mesas: MESAS.map((m) => Object.assign({}, m)) });
      }
      window.__guardados = (window.__guardados || []).concat([b]);
      const resultados = b.cambios.map((c) => {
        const esperado = c.valor === "D" ? "0" : c.valor;
        const malo = window.__modo === "mal" && c.mesa === 2;
        return { mesa: c.mesa, pedido: c.valor, quedo: malo ? "0" : esperado, ok: !malo };
      });
      const diferencias = window.__modo === "mal" ? [{ mesa: 3, antes: "2", ahora: "1" }] : [];
      return R({ ok: resultados.every((r) => r.ok) && !diferencias.length, ronda: b.ronda, resultados, diferencias });
    } },
    from: (t) => {
      if (t !== "arbitro_bitacora") { const q = {}; ["select","eq","order","range","in","single","maybeSingle","limit","update","insert"].forEach((m) => q[m] = () => q); q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok); return q; }
      return {
        insert: (rows) => { window.__insertados.push(...rows); rows.forEach((r) => FILAS.push(Object.assign({ id: "id" + FILAS.length, creada_por: "yo", ocurrio: new Date(Date.UTC(2026, 10, 1, 20, FILAS.length)).toISOString() }, r))); return R(null); },
        select: () => { const f = {}; const q = { eq: (c, v) => { f[c] = v; return q; }, order: () => q, range: () => q,
          then: (ok, ko) => Promise.resolve({ data: FILAS.filter((r) => Object.entries(f).every(([c, v]) => r[c] === v)), error: null }).then(ok, ko) }; return q; },
      };
    },
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
    await p.goto(BASE + "/mesa-arbitro.html", { waitUntil: "load" });
    return { ctx, p, errores };
}

(async () => {
    const browser = await chromium.launch();

    console.log("\n=== Sin licencia ===");
    let { ctx, p } = await abrir(browser, false);
    await p.waitForFunction(() => document.getElementById("denegado").checkVisibility());
    igual("el candado, y la herramienta no se ve", await p.$eval("#app", (a) => a.checkVisibility()), false);
    igual("pregunta por la licencia de «mesa-arbitro»", await p.evaluate(() => window.__pedidos.includes("tengo_herramienta mesa-arbitro")), true);
    await ctx.close();

    console.log("\n=== Leer la ronda ===");
    let errores;
    ({ ctx, p, errores } = await abrir(browser, true));
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());
    igual("sin leer, las mesas no se ven", await p.$eval("#zona-mesas", (a) => a.checkVisibility()), false);
    await p.evaluate(() => { window.__modo = "clave"; });
    await p.fill("#m-tnr", "1532448");
    await p.fill("#m-sid", SID);
    await p.click("#m-leer");
    await p.waitForSelector('.avisos-mensaje[role="alert"]');
    igual("con una clave mala, avisa lo que dijo chess-results y no muestra mesas", [await p.$eval(".avisos-mensaje", (a) => a.textContent.includes("no aceptó el código o la clave")), await p.$eval("#zona-mesas", (a) => a.checkVisibility())], [true, false]);
    await p.evaluate(() => { window.__modo = "bien"; });
    await p.click("#m-leer");
    await p.waitForSelector("#m-mesas tr");
    igual("le manda a la función la acción, el código y la clave", await p.evaluate(() => { const b = window.__ultimo; return [b.action, b.tnr, b.sid]; }), ["leer", "1532448", SID]);
    igual("las tres mesas, con lo que ya tienen en chess-results", await p.$$eval("#m-mesas tr", (l) => l.map((tr) => [...tr.children].slice(0, 4).map((td) => td.textContent))),
        [["1", "Muñoz Feliz Alejandro", "Gramajo Tovar Marco", "Sin resultado"], ["2", "Harvey Ian", "Acuña Porras Fabio", "Sin resultado"], ["3", "Hopkins John", "Baquero Graterol", "½-½ (tablas)"]]);
    igual("dice el torneo y la ronda abierta", [await p.textContent("#m-torneo"), await p.textContent("#t-mesas")], ["Torneo de Prueba · ronda 3", "Mesas de la ronda 3"]);
    igual("sin elegir nada, no se puede guardar", await p.evaluate(() => ["m-guardar", "m-anotar", "m-copiar"].map((b) => document.getElementById(b).disabled)), [true, true, true]);
    igual("la ronda de la bitácora ya viene puesta", await p.inputValue("#b-ronda"), "3");

    if (process.env.CAPTURA) await p.screenshot({ path: process.env.CAPTURA, fullPage: true }); // para mirar la pantalla, no solo el DOM
    console.log("\n=== Buscar ===");
    await p.fill("#m-buscar", "acuna");
    igual("el buscador no distingue tildes ni mayúsculas", await p.$$eval("#m-mesas tr", (l) => l.map((tr) => tr.dataset.mesa)), ["2"]);
    await p.fill("#m-buscar", "");
    await p.check("#m-faltan");
    igual("«solo las mesas sin resultado» esconde la que ya tiene", await p.$$eval("#m-mesas tr", (l) => l.map((tr) => tr.dataset.mesa)), ["1", "2"]);
    await p.uncheck("#m-faltan");

    console.log("\n=== Guardar un resultado ===");
    await p.selectOption("#m-sel-1", "1");
    igual("con un resultado elegido, el botón dice cuántos", [await p.$eval("#m-guardar", (b) => b.disabled), await p.textContent("#m-guardar")], [false, "Guardar 1 resultado en chess-results"]);
    igual("«Borrar» no se ofrece en una mesa sin resultado, y sí en la que ya tiene",
        [await p.$$eval("#m-sel-1 option", (o) => o.some((x) => x.value === "D")), await p.$$eval("#m-sel-3 option", (o) => o.some((x) => x.value === "D"))], [false, true]);
    await p.click("#m-guardar");
    await p.waitForSelector("[data-avisos-aceptar]");
    igual("antes de mandar, pide confirmar y dice la ronda y el torneo", await p.evaluate(() => { const t = document.querySelector("dialog").textContent; return [t.includes("ronda 3"), t.includes("Torneo de Prueba"), t.includes("1 resultado")]; }), [true, true, true]);
    igual("todavía no se mandó nada", await p.evaluate(() => (window.__guardados || []).length), 0);
    await p.click("[data-avisos-aceptar]");
    await p.waitForSelector('#m-informe li[data-ok="si"]');
    igual("manda SOLO lo cambiado, con la ronda, el código y los jugadores que vio el árbitro",
        await p.evaluate(() => { const g = window.__guardados[0]; return [g.action, g.tnr, g.ronda, g.cambios]; }),
        ["guardar", "1532448", 3, [{ mesa: 1, blancas: "Muñoz Feliz Alejandro", negras: "Gramajo Tovar Marco", valor: "1" }]]);
    igual("el informe dice que quedó en chess-results", await p.$$eval("#m-informe li", (l) => l.map((x) => x.textContent)), ["✓ Mesa 1: quedó «1-0 (ganan blancas)» en chess-results."]);
    igual("la tabla muestra lo que chess-results tiene ahora", await p.$eval('#m-mesas tr[data-mesa="1"]', (tr) => tr.children[3].textContent), "1-0 (ganan blancas)");
    igual("en la bitácora queda un «resultado» enviado, con la ronda y los jugadores",
        await p.evaluate(() => window.__insertados.map((r) => [r.tipo, r.resultado, r.anterior, r.enviado, r.ronda, r.mesa, r.texto, r.tnr])),
        [["resultado", "1-0", null, true, 3, 1, "Muñoz Feliz Alejandro – Gramajo Tovar Marco", "1532448"]]);
    igual("y se ve en la tabla de la bitácora, con la hora de Costa Rica",
        await p.$$eval("#b-lineas tr", (l) => l.map((tr) => [tr.children[1].textContent, tr.children[2].textContent, tr.children[3].textContent, /\b(14:00|2:00)/.test(tr.children[0].textContent)])), [["3", "1", "Resultado", true]]);

    console.log("\n=== Corregir ===");
    await p.selectOption("#m-sel-1", "3");
    await p.click("#m-guardar");
    await p.click("[data-avisos-aceptar]");
    await p.waitForFunction(() => window.__insertados.length === 2);
    igual("cambiar un resultado ya puesto es una «corrección», con el anterior",
        await p.evaluate(() => { const r = window.__insertados[1]; return [r.tipo, r.resultado, r.anterior, r.enviado]; }), ["correccion", "0-1", "1-0", true]);

    console.log("\n=== Cuando chess-results no tiene lo que se pidió ===");
    await p.evaluate(() => { window.__modo = "mal"; });
    await p.selectOption("#m-sel-2", "2");
    await p.click("#m-guardar");
    await p.click("[data-avisos-aceptar]");
    await p.waitForSelector('#m-informe li[data-ok="no"]');
    igual("avisa la mesa que no quedó y la que cambió sin tocarla", await p.evaluate(() => [
        document.querySelector('#m-informe li[data-ok="no"]').textContent.includes("Mesa 2"),
        document.querySelector('#m-informe li[data-ok="no"]').textContent.includes("No quedó en la bitácora como enviado"),
        document.querySelector("#m-informe li[data-diferencia]").textContent.includes("La mesa 3 cambió sin que la tocaras")]), [true, true, true]);
    igual("lo que no quedó NO se anota como enviado", await p.evaluate(() => window.__insertados.length), 2);
    igual("y la mesa 3 muestra lo que chess-results tiene de verdad", await p.$eval('#m-mesas tr[data-mesa="3"]', (tr) => tr.children[3].textContent), "1-0 (ganan blancas)");
    await p.evaluate(() => { window.__modo = "bien"; });

    console.log("\n=== Solo anotar ===");
    await p.selectOption("#m-sel-2", "6");
    const guardadosAntes = await p.evaluate(() => window.__guardados.length);
    await p.click("#m-anotar");
    await p.waitForFunction(() => window.__insertados.length === 3);
    igual("escribe en la bitácora como «solo anotado» y no le manda nada a chess-results",
        await p.evaluate((g) => { const r = window.__insertados[2]; return [r.tipo, r.resultado, r.enviado, window.__guardados.length === g]; }, guardadosAntes), ["resultado", "0f-0f", false, true]);
    igual("en la tabla de la bitácora se lee «solo anotado»", await p.$$eval("#b-lineas tr", (l) => l[l.length - 1].children[4].textContent.includes("solo anotado")), true);

    console.log("\n=== Incidencias ===");
    await p.fill("#b-mesa", "2");
    await p.selectOption("#b-tipo", "incidencia");
    await p.fill("#b-articulo", "art. 11.3.2");
    await p.fill("#b-texto", "Sonó un celular; el jugador perdió la partida.");
    await p.click("#b-agregar");
    await p.waitForFunction(() => window.__insertados.length === 4);
    igual("la incidencia queda con su ronda, mesa, artículo y texto", await p.evaluate(() => { const r = window.__insertados[3]; return [r.tipo, r.ronda, r.mesa, r.articulo, r.texto, r.enviado]; }),
        ["incidencia", 3, 2, "art. 11.3.2", "Sonó un celular; el jugador perdió la partida.", false]);
    await p.fill("#b-texto", "   ");
    await p.click("#b-agregar");
    igual("sin texto no se anota", await p.evaluate(() => window.__insertados.length), 4);

    console.log("\n=== La clave ===");
    igual("la clave no está en la bitácora", await p.evaluate((s) => JSON.stringify(window.__insertados).includes(s), SID), false);
    igual("ni en el almacenamiento del navegador", await p.evaluate((s) => { try { return JSON.stringify(localStorage).includes(s) || JSON.stringify(sessionStorage).includes(s); } catch (e) { return false; } }, SID), false);

    console.log("\n=== Bajar la bitácora ===");
    await p.fill("#b-arbitro", "Ana Árbitra");
    const bajar = async (boton) => {
        const [d] = await Promise.all([p.waitForEvent("download"), p.click(boton)]);
        return { nombre: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
    };
    const pdf = await bajar("#b-pdf");
    igual("el PDF, con su nombre y la marca de agua", [pdf.nombre, pdf.bytes.toString("latin1").startsWith("%PDF"), /\/SMask \d+ 0 R/.test(pdf.bytes.toString("latin1"))], ["bitacora-arbitro-1532448.pdf", true, true]);
    const docx = await bajar("#b-docx");
    igual("el Word, con la marca en el encabezado y el título", [docx.nombre, docx.bytes.includes("word/media/marca.png"), docx.bytes.includes("Bit")], ["bitacora-arbitro-1532448.docx", true, true]);

    console.log("\n=== En el celular ===");
    await p.setViewportSize({ width: 390, height: 800 });
    igual("la página no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("sin errores en la página", errores, []);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
