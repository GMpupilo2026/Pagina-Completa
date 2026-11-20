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
  window.__subidas = [];
  window.__planillas = [];
  window.__archivos = {};
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
    rpc: (f, a) => { window.__pedidos.push(f + " " + (a && a.p_herramienta || ""));
      // «Mis torneos»: la lista de la persona (la base la arma con la bitácora y arbitro_torneos).
      window.__torneos = window.__torneos || [
        { tnr: "1532448", nombre: "Torneo de Prueba", nombre_propio: "", torneo: "Torneo de Prueba", archivado: false, primera: "2026-11-01T04:37:00Z", ultima: "2026-11-01T20:00:00Z", lineas: 3, resultados: 2, incidencias: 1 },
        { tnr: "1500001", nombre: "Open de Navidad", nombre_propio: "Open de Navidad", torneo: "Open Navidad 2025", archivado: false, primera: "2025-12-20T15:00:00Z", ultima: "2025-12-21T22:00:00Z", lineas: 10, resultados: 9, incidencias: 0 },
        { tnr: "1400002", nombre: "Torneo viejo", nombre_propio: "", torneo: "Torneo viejo", archivado: true, primera: "2025-03-01T15:00:00Z", ultima: "2025-03-02T22:00:00Z", lineas: 4, resultados: 4, incidencias: 0 }];
      if (f === "arbitro_torneos_mis") return R(JSON.parse(JSON.stringify(window.__torneos)));
      if (f === "arbitro_torneo_visto") { window.__vistos = (window.__vistos || []).concat([[a.p_tnr, a.p_torneo]]); return R(null); }
      if (f === "arbitro_torneo_ajustar") { window.__ajustes = (window.__ajustes || []).concat([[a.p_tnr, a.p_nombre, a.p_archivado]]);
        const t = window.__torneos.find((x) => x.tnr === a.p_tnr); if (t) { if (a.p_nombre !== null) { t.nombre_propio = a.p_nombre.trim(); t.nombre = t.nombre_propio || t.torneo; } if (a.p_archivado !== null) t.archivado = a.p_archivado; } return R(null); }
      return R(f === "tengo_herramienta" ? ${licencia ? "a.p_herramienta === 'mesa-arbitro'" : "false"} : null); },
    functions: { invoke: (f, o) => {
      window.__pedidos.push("invoke " + f);
      window.__ultimo = o.body;
      const b = o.body;
      if (b.action === "leer") {
        if (window.__modo === "clave") return R({ error: "chess-results no aceptó el código o la clave. Revísalos en Swiss-Manager." });
        // Dos torneos LIGADOS en un grupo: con la misma clave se abre cualquiera (destino).
        const abierto = b.destino || b.tnr;
        const torneos = [{ tnr: "1532448", nombre: "Torneo de Prueba" }, { tnr: "1532486", nombre: "Torneo de Prueba 2" }].map((t) => Object.assign({ elegido: t.tnr === abierto }, t));
        return R({ tnr: abierto, torneo: (torneos.find((t) => t.elegido) || torneos[0]).nombre, torneos, ronda: abierto === "1532486" ? 5 : 3, mesas: MESAS.map((m) => Object.assign({}, m)) });
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
      if (t === "arbitro_planillas") return {
        insert: (rows) => {
          // Como la base: la ruta es de la carpeta de quien sube y del mismo torneo; la hora y el id los pone ella.
          for (const r of rows) if (!r.ruta.startsWith("yo/" + r.tnr + "/") || !/[.]jpg$/.test(r.ruta) || !(r.bytes > 0) || r.creada_por || r.subida) return R(null, { message: "new row violates row-level security policy" });
          rows.forEach((r) => window.__planillas.push(Object.assign({ id: "p" + window.__planillas.length, subida: new Date(Date.UTC(2026, 10, 3, 16, window.__planillas.length)).toISOString() }, r))); return R(null); },
        select: () => { const f = {}; const q = { eq: (c, v) => { f[c] = v; return q; }, order: () => q, range: () => q,
          then: (ok, ko) => Promise.resolve({ data: window.__planillas.filter((r) => Object.entries(f).every(([c, v]) => r[c] === v)), error: null }).then(ok, ko) }; return q; },
      };
      if (t !== "arbitro_bitacora") { const q = {}; ["select","eq","order","range","in","single","maybeSingle","limit","update","insert"].forEach((m) => q[m] = () => q); q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok); return q; }
      return {
        insert: (rows) => {
          // Como la política y el índice único: una anulación apunta a una ilegal o irregularidad de la misma partida y jugador, una sola vez.
          for (const r of rows) if (r.anula != null) {
            const b = FILAS.find((x) => x.id === r.anula);
            if (r.tipo !== "anulacion" || !b || !["ilegal", "irregularidad"].includes(b.tipo) || b.tnr !== r.tnr || b.ronda !== r.ronda || b.mesa !== r.mesa || b.color !== r.color || FILAS.some((x) => x.anula === r.anula))
              return R(null, { message: "new row violates row-level security policy" });
          }
          window.__insertados.push(...rows); rows.forEach((r) => FILAS.push(Object.assign({ id: "id" + FILAS.length, creada_por: "yo", ocurrio: new Date(Date.UTC(2026, 10, 1, 20, FILAS.length)).toISOString() }, r))); return R(null); },
        select: () => { const f = {}; const q = { eq: (c, v) => { f[c] = v; return q; }, order: () => q, range: () => q,
          then: (ok, ko) => Promise.resolve({ data: FILAS.filter((r) => Object.entries(f).every(([c, v]) => r[c] === v)), error: null }).then(ok, ko) }; return q; },
      };
    },
    storage: { from: (bucket) => ({
      upload: (ruta, blob, op) => {
        if (window.__modo === "subida") return R(null, { message: "el servidor de archivos no contesta" });
        window.__subidas.push({ bucket, ruta, tipo: op && op.contentType, upsert: op && op.upsert, bytes: blob.size, tipoBlob: blob.type }); window.__archivos[ruta] = blob; return R({ path: ruta }); },
      createSignedUrl: (ruta) => R({ signedUrl: "https://bgtijpimpcokxatxxbki.supabase.co/storage/v1/object/sign/" + bucket + "/" + ruta + "?token=t" }),
      download: (ruta) => R(window.__archivos[ruta] || null, window.__archivos[ruta] ? null : { message: "no está" }),
    }) },
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
    await p.goto(BASE + "/mesa-arbitro.html#solo", { waitUntil: "load" });
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

    console.log("\n=== Mis torneos ===");
    await p.waitForSelector("#mt-lista li");
    igual("la lista trae los torneos que no están archivados, el más reciente primero, con su código, su último uso y lo que se anotó",
        await p.$$eval("#mt-lista li", (l) => l.map((li) => [li.dataset.tnr, li.querySelector("p.font-semibold").textContent, li.querySelectorAll("p")[1].textContent])),
        [["1532448", "Torneo de Prueba", "chess-results 1532448 · último uso: " + (await p.$eval("#mt-lista li p.text-xs", (x) => x.textContent.split(" · ")[1].replace("último uso: ", ""))) + " · 2 resultados · 1 incidencia"],
         ["1500001", "Open de Navidad", (await p.$$eval("#mt-lista li", (l) => l[1].querySelectorAll("p")[1].textContent))]]);
    igual("el archivado no sale, y «Mostrar los archivados» lo trae marcado con su palabra (el estado no va solo en el color)",
        [await p.$$eval("#mt-lista li", (l) => l.length), await (async () => { await p.check("#mt-archivados"); return p.$$eval("#mt-lista li", (l) => l.map((li) => [li.dataset.archivado, li.querySelector("p.font-semibold").textContent])); })()],
        [2, [["no", "Torneo de Prueba"], ["no", "Open de Navidad"], ["si", "Torneo viejo (archivado)"]]]);
    await p.uncheck("#mt-archivados");
    await p.click('#mt-lista li[data-tnr="1500001"] [data-accion="abrir"]');
    await p.waitForFunction(() => document.getElementById("m-tnr").value === "1500001");
    igual("«Abrir» pone su código arriba, deja la clave para escribirla y dice qué hacer (la clave nunca se guarda)",
        await p.evaluate(() => [document.getElementById("m-tnr").value, document.activeElement.id, document.getElementById("m-estado").textContent.includes("escribe la clave (SID)"), document.getElementById("m-sid").value]), ["1500001", "m-sid", true, ""]);
    await p.click('#mt-lista li[data-tnr="1532448"] [data-accion="renombrar"]');
    await p.waitForSelector("dialog[open] input");
    await p.fill("dialog[open] input", "  Mi torneo de los sábados  ");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => document.querySelector('#mt-lista li[data-tnr="1532448"] p.font-semibold').textContent.startsWith("Mi torneo"));
    igual("«Ponerle nombre» lo guarda y la lista lo muestra, sin perder el nombre que trae chess-results",
        await p.evaluate(() => [window.__ajustes[0], document.querySelector('#mt-lista li[data-tnr="1532448"] p.font-semibold').textContent, document.querySelector('#mt-lista li[data-tnr="1532448"] p.text-xs').textContent.endsWith("en chess-results: Torneo de Prueba")]),
        [["1532448", "  Mi torneo de los sábados  ", null], "Mi torneo de los sábados", true]);
    await p.click('#mt-lista li[data-tnr="1500001"] [data-accion="archivar"]');
    await p.waitForFunction(() => !document.querySelector('#mt-lista li[data-tnr="1500001"]'));
    igual("«Archivar» lo saca de la lista (no se borra) y «Restaurar» lo devuelve",
        await (async () => { const a = await p.evaluate(() => window.__ajustes[1]); await p.check("#mt-archivados"); await p.click('#mt-lista li[data-tnr="1500001"] [data-accion="restaurar"]'); await p.uncheck("#mt-archivados"); await p.waitForSelector('#mt-lista li[data-tnr="1500001"]'); return [a, await p.evaluate(() => window.__ajustes[2])]; })(),
        [["1500001", null, true], ["1500001", null, false]]);
    await p.fill("#m-tnr", "");
    await p.evaluate(() => document.querySelectorAll(".avisos-mensaje").forEach((n) => n.remove())); // los avisos de arriba no tapan los de abajo
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
    igual("las tres mesas, con lo que ya tienen en chess-results", await p.$$eval("#m-mesas tr", (l) => l.map((tr) => [...tr.children].slice(0, 4).map((td) => td.dataset.jugador ? td.querySelector("p").textContent : td.textContent))),
        [["1", "Muñoz Feliz Alejandro", "Gramajo Tovar Marco", "Sin resultado"], ["2", "Harvey Ian", "Acuña Porras Fabio", "Sin resultado"], ["3", "Hopkins John", "Baquero Graterol", "½-½ (tablas)"]]);
    igual("al leer una ronda, el torneo queda en «Mis torneos» (con el nombre de chess-results)", await p.evaluate(() => window.__vistos), [["1532448", "Torneo de Prueba"]]);
    igual("dice el torneo y la ronda abierta", [await p.textContent("#m-torneo"), await p.textContent("#t-mesas")], ["Torneo de Prueba · ronda 3", "Mesas de la ronda 3"]);
    igual("sin elegir nada, no se puede guardar", await p.evaluate(() => ["m-guardar", "m-anotar", "m-copiar"].map((b) => document.getElementById(b).disabled)), [true, true, true]);
    igual("la ronda de la bitácora ya viene puesta", await p.inputValue("#b-ronda"), "3");

    console.log("\n=== Torneos ligados en un grupo ===");
    igual("si el grupo tiene más de un torneo, se ofrece un desplegable con todos y el abierto elegido",
        await p.evaluate(() => { const z = document.getElementById("m-ligados-zona"), s = document.getElementById("m-ligados"); return [z.checkVisibility(), [...s.options].map((o) => o.value + "|" + o.textContent), s.value]; }),
        [true, ["1532448|Torneo de Prueba · 1532448", "1532486|Torneo de Prueba 2 · 1532486"], "1532448"]);
    await p.selectOption("#m-ligados", "1532486");
    await p.waitForFunction(() => document.getElementById("m-torneo").textContent.includes("Prueba 2"));
    igual("al elegir el otro torneo se lee ESE (misma clave, con `destino`) y la pantalla cambia de torneo y de ronda",
        [await p.evaluate(() => { const b = window.__ultimo; return [b.action, b.tnr, b.destino]; }), await p.textContent("#m-torneo"), await p.inputValue("#b-ronda")],
        [["leer", "1532448", "1532486"], "Torneo de Prueba 2 · ronda 5", "5"]);
    igual("mientras se lee, el desplegable de torneos del grupo no se puede tocar (y queda libre al terminar)", await p.$eval("#m-ligados", (x) => x.disabled), false);
    await p.selectOption("#m-ligados", "1532448");
    await p.waitForFunction(() => document.getElementById("m-torneo").textContent.startsWith("Torneo de Prueba ·") && document.getElementById("b-ronda").value === "3");

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
    igual("al guardar manda también el torneo abierto (`destino`), para no escribir en el otro del grupo", await p.evaluate(() => window.__guardados[0].destino), "1532448");
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

    console.log("\n=== Ilegales, irregularidades y «Guardar» en la fila ===");
    const n0 = await p.evaluate(() => window.__insertados.length);
    const guardados0 = await p.evaluate(() => window.__guardados.length);
    const fila2 = '#m-mesas tr[data-mesa="2"]';
    igual("cada jugador tiene «Ilegal» e «Irregularidad», con su nombre y la mesa para el lector de pantalla",
        await p.$$eval(fila2 + ' [data-jugador="negras"] button', (b) => b.map((x) => [x.dataset.accion, x.getAttribute("aria-label")])),
        [["ilegal", "Jugada ilegal de Acuña Porras Fabio (mesa 2)"], ["irregularidad", "Irregularidad de Acuña Porras Fabio (mesa 2)"]]);
    igual("el «Guardar» de la fila está apagado si en esa mesa no hay nada elegido", await p.$eval(fila2 + ' [data-accion="guardar-mesa"]', (b) => b.disabled), true);
    await p.click(fila2 + ' [data-jugador="negras"] [data-accion="ilegal"]');
    await p.waitForSelector("dialog[open] select[name=tipo]");
    igual("la primera ilegal dice que se le dan 2 minutos al rival y ofrece la lista de tipos", await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return [d.textContent.includes("2 minutos más a su rival"), d.querySelector("select[name=tipo]").value, d.querySelector("[data-avisos-aceptar]").textContent]; }), [true, "otra", "Anotar la ilegal"]);
    await p.selectOption("dialog[open] select[name=tipo]", "enroque");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction((n) => window.__insertados.length === n + 1, n0);
    igual("queda en la bitácora como «ilegal», con la partida, el jugador, su color y el art. 7.5.5",
        await p.evaluate(() => { const r = window.__insertados[window.__insertados.length - 1]; return [r.tipo, r.tnr, r.ronda, r.mesa, r.color, r.jugador, r.articulo, r.texto, r.enviado]; }),
        ["ilegal", "1532448", 3, 2, "negras", "Acuña Porras Fabio", "7.5.5", "Enroque ilegal", false]);
    await p.waitForFunction((f) => document.querySelector(f + ' [data-jugador="negras"] [data-marca="ilegal"]'), fila2);
    igual("la mesa muestra la marca escrita («1 ilegal») y ofrece anularla", await p.evaluate((f) => [document.querySelector(f + ' [data-jugador="negras"] [data-marca="ilegal"]').textContent, !!document.querySelector(f + ' [data-jugador="negras"] [data-accion="anular-ilegal"]'), document.querySelector(f).dataset.estado], fila2), ["1 ilegal", true, "libre"]);
    await p.click(fila2 + ' [data-jugador="negras"] [data-accion="ilegal"]');
    await p.waitForSelector("dialog[open] select[name=tipo]");
    igual("la segunda avisa ANTES que pierde la partida, con el botón que lo dice", await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return [d.textContent.includes("SEGUNDA jugada ilegal"), d.querySelector("[data-avisos-aceptar]").textContent]; }), [true, "Anotar la SEGUNDA ilegal"]);
    await p.selectOption("dialog[open] select[name=tipo]", "rey-jaque");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => document.querySelector("dialog[open]") && document.querySelector("dialog[open]").textContent.includes("pierde la partida"));
    igual("con la segunda: avisa que pierde (salvo que el rival no pueda dar mate), PROPONE el 1-0 sin guardarlo y pinta la mesa con su aviso escrito",
        await p.evaluate((f) => { const d = document.querySelector("dialog[open]").textContent, tr = document.querySelector(f); return [d.includes("art. 7.5.5"), d.includes("no puede dar mate"), document.getElementById("m-sel-2").value, tr.dataset.estado, (tr.querySelector("[data-pierde]") || {}).textContent, getComputedStyle(tr.children[0]).borderLeftWidth]; }, fila2),
        [true, true, "1", "pierde", "Segunda ilegal: decide el resultado", "4px"]);
    igual("y no le mandó nada a chess-results", await p.evaluate((g) => window.__guardados.length === g, guardados0), true);
    await p.click("dialog[open] [data-avisos-aceptar]");
    if (process.env.CAPTURA_ILEGAL) { await p.waitForFunction(() => !document.querySelector("dialog[open]")); await p.locator("#zona-mesas").screenshot({ path: process.env.CAPTURA_ILEGAL }); } // la mesa con la segunda ilegal, para mirarla
    await p.click(fila2 + ' [data-jugador="negras"] [data-accion="anular-ilegal"]');
    await p.waitForSelector("dialog[open] [data-avisos-aceptar]");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction((n) => window.__insertados.length === n + 3, n0);
    igual("«Anular» no borra: agrega una «anulacion» que apunta a la última ilegal, de la misma partida y jugador",
        await p.evaluate(() => { const l = window.__insertados, r = l[l.length - 1], ultima = l[l.length - 2]; return [r.tipo, r.mesa, r.color, r.ronda, ultima.tipo, r.anula != null]; }), ["anulacion", 2, "negras", 3, "ilegal", true]);
    await p.waitForFunction((f) => document.querySelector(f).dataset.estado !== "pierde", fila2);
    igual("la anulada deja de contar: vuelve a «1 ilegal» y la mesa sale de la banda roja", await p.evaluate((f) => [document.querySelector(f + ' [data-jugador="negras"] [data-marca="ilegal"]').textContent, document.querySelector(f).dataset.estado, getComputedStyle(document.querySelector(f).children[0]).borderLeftWidth], fila2), ["1 ilegal", "libre", "0px"]);
    igual("la misma línea no se anula dos veces (el doble se porta como el índice único)",
        await p.evaluate(async () => { const a = window.__insertados[window.__insertados.length - 1]; const r = await sb.from("arbitro_bitacora").insert([Object.assign({}, a)]); return !!r.error; }), true);

    await p.click(fila2 + ' [data-jugador="blancas"] [data-accion="irregularidad"]');
    await p.waitForSelector("dialog[open] select[name=tipo]");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => document.querySelector("dialog[open]") && document.querySelector("dialog[open]").textContent.includes("con «Otra» es obligatorio"));
    igual("con «Otra» y sin escribir, el cuadro vuelve a abrirse y pide qué pasó (no anota nada)", await p.evaluate((n) => window.__insertados.length === n + 3, n0), true);
    await p.fill("dialog[open] textarea[name=nota]", "Comió durante la partida en la mesa");
    await p.click("dialog[open] [data-avisos-aceptar]");
    // El segundo paso: lo que dice el reglamento y la sanción. Con «Otra», la escala del 12.9 y sin sanción elegida.
    await p.waitForSelector("dialog[open] select[name=sancion]");
    igual("antes de anotar dice lo que dicen las Leyes (la escala del 12.9), que es su primera, y viene «Sin sanción»",
        await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return [d.textContent.includes("art. 12.9"), d.textContent.includes("Es su primera irregularidad"), d.querySelector("select[name=sancion]").value, d.querySelector("[data-avisos-aceptar]").textContent]; }),
        [true, true, "ninguna", "Anotar la irregularidad"]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction((n) => window.__insertados.length === n + 4, n0);
    igual("la irregularidad queda con su jugador, su color y lo escrito", await p.evaluate(() => { const r = window.__insertados[window.__insertados.length - 1]; return [r.tipo, r.mesa, r.color, r.jugador, r.texto]; }),
        ["irregularidad", 2, "blancas", "Harvey Ian", "Otra: Comió durante la partida en la mesa"]);
    igual("en la tabla de la bitácora se lee quién, con qué color y qué fue", await p.$$eval("#b-lineas tr", (l) => l[l.length - 1].children[4].textContent), "Harvey Ian (blancas): Otra: Comió durante la partida en la mesa");

    // El 1-0 propuesto sigue elegido en la mesa 2; se elige además otro en la 3: el «Guardar» de la fila 2 manda SOLO la 2, sin preguntar.
    await p.selectOption("#m-sel-3", "3");
    await p.click(fila2 + ' [data-accion="guardar-mesa"]');
    await p.waitForFunction((g) => window.__guardados.length === g + 1, guardados0);
    igual("el «Guardar» de la fila manda solo esa mesa, sin el cuadro de confirmar",
        await p.evaluate(() => [window.__guardados[window.__guardados.length - 1].cambios, !!document.querySelector("dialog[open]")]),
        [[{ mesa: 2, blancas: "Harvey Ian", negras: "Acuña Porras Fabio", valor: "1" }], false]);
    await p.waitForFunction((n) => window.__insertados.length === n + 5, n0);
    igual("queda como resultado enviado, y la mesa 3 sigue esperando con lo suyo elegido",
        await p.evaluate(() => { const r = window.__insertados[window.__insertados.length - 1]; return [r.tipo, r.mesa, r.resultado, r.enviado, document.getElementById("m-sel-3").value, document.getElementById("m-guardar").textContent]; }),
        ["resultado", 2, "1-0", true, "3", "Guardar 1 resultado en chess-results"]);
    await p.selectOption("#m-sel-3", "");

    console.log("\n=== Incidencias ===");
    await p.fill("#b-mesa", "2");
    await p.selectOption("#b-tipo", "incidencia");
    await p.fill("#b-articulo", "art. 11.3.2");
    await p.fill("#b-texto", "Sonó un celular; el jugador perdió la partida.");
    await p.click("#b-agregar");
    await p.waitForFunction((n) => window.__insertados.length === n + 6, n0);
    igual("la incidencia queda con su ronda, mesa, artículo y texto", await p.evaluate(() => { const r = window.__insertados[window.__insertados.length - 1]; return [r.tipo, r.ronda, r.mesa, r.articulo, r.texto, r.enviado]; }),
        ["incidencia", 3, 2, "art. 11.3.2", "Sonó un celular; el jugador perdió la partida.", false]);
    await p.fill("#b-texto", "   ");
    await p.click("#b-agregar");
    igual("sin texto no se anota", await p.evaluate((n) => window.__insertados.length === n + 6, n0), true);

    console.log("\n=== La clave ===");
    igual("la clave no está en la bitácora", await p.evaluate((s) => JSON.stringify(window.__insertados).includes(s), SID), false);
    igual("ni en el almacenamiento del navegador", await p.evaluate((s) => { try { return JSON.stringify(localStorage).includes(s) || JSON.stringify(sessionStorage).includes(s); } catch (e) { return false; } }, SID), false);

    console.log("\n=== La foto de las planillas ===");
    const n1 = await p.evaluate(() => window.__insertados.length);
    // Un JPEG de verdad, hecho en la página (lo que daría la cámara guiada) y un PNG para la cámara de siempre.
    const dataJpeg = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 120; c.height = 80; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 120, 80); x.fillStyle = "#123"; x.fillRect(10, 10, 40, 60); return c.toDataURL("image/jpeg", 0.8); });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    igual("cada mesa tiene su botón de la foto de las planillas, escrito", await p.$$eval('tr[data-mesa] [data-accion="planilla"]', (b) => b.map((x) => x.textContent.trim())), ["📷 Foto de las planillas", "📷 Foto de las planillas", "📷 Foto de las planillas"]);
    igual("sin fotos todavía no hay «Ver», ni la casilla del documento", await p.evaluate(() => [document.querySelectorAll('[data-accion="ver-planilla"]').length, document.getElementById("b-fotos-zona").checkVisibility()]), [0, false]);

    // Cerrar la cámara sin sacar la foto no sube nada.
    await p.evaluate(() => { window.GuiaPlanillas.disponible = () => true; window.GuiaPlanillas.abrir = () => Promise.resolve({ cancelado: true }); });
    await p.click('tr[data-mesa="1"] [data-accion="planilla"]');
    await p.waitForTimeout(150);
    igual("cerrar la cámara no sube nada", await p.evaluate(() => [window.__subidas.length, window.__planillas.length]), [0, 0]);

    // La cámara con guía: la foto sale del cuadro de revisión, se sube al bucket privado, a la carpeta de quien la toma, y se registra.
    await p.evaluate((d) => { window.__pidio = null; window.GuiaPlanillas.abrir = (o) => { window.__pidio = o; return Promise.resolve({ imagen: d }); }; }, dataJpeg);
    await p.click('tr[data-mesa="1"] [data-accion="planilla"]');
    await p.waitForFunction(() => window.__planillas.length === 1);
    igual("la cámara con guía recibe los dos nombres y la mesa", await p.evaluate(() => window.__pidio), { titulo: "Foto de las planillas · Mesa 1", rotulos: ["Blancas · Muñoz Feliz Alejandro", "Negras · Gramajo Tovar Marco"] });
    igual("sube un JPEG al bucket privado, a <autor>/<torneo>/<id>.jpg, sin pisar nada",
        await p.evaluate(() => { const u = window.__subidas[0]; return [u.bucket, /^yo\/1532448\/[0-9a-f-]{36}[.]jpg$/.test(u.ruta), u.tipo, u.tipoBlob, u.upsert, u.bytes > 100]; }),
        ["mesa-arbitro-planillas", true, "image/jpeg", "image/jpeg", false, true]);
    igual("la fila dice de qué torneo, ronda y mesa es, y quiénes juegan; no manda la hora ni el autor",
        await p.evaluate(() => { const r = window.__planillas[0]; return [r.tnr, r.ronda, r.mesa, r.blancas, r.negras, r.ruta === window.__subidas[0].ruta, r.bytes === window.__subidas[0].bytes, "subida" in r && r.subida.length > 0, "creada_por" in r]; }),
        ["1532448", 3, 1, "Muñoz Feliz Alejandro", "Gramajo Tovar Marco", true, true, true, false]);
    await p.waitForFunction((n) => window.__insertados.length === n + 1, n1);
    igual("queda una nota en la bitácora, con su ronda y su mesa", await p.evaluate(() => { const r = window.__insertados[window.__insertados.length - 1]; return [r.tipo, r.ronda, r.mesa, r.texto, r.enviado]; }), ["nota", 3, 1, "Foto de las dos planillas guardada.", false]);
    await p.waitForSelector('tr[data-mesa="1"] [data-accion="ver-planilla"]');
    igual("la fila lo dice con palabras y ofrece «Ver la foto» y otra foto",
        await p.evaluate(() => { const f = document.querySelector('tr[data-mesa="1"] [data-fotos]'); return [f.getAttribute("data-fotos"), [...f.children].map((x) => x.textContent.trim())]; }), ["1", ["📷 Otra foto de las planillas", "Ver la foto", "Foto guardada"]]);
    igual("las otras mesas no cambian", await p.evaluate(() => document.querySelector('tr[data-mesa="2"] [data-fotos]').getAttribute("data-fotos")), "0");

    // Sin la cámara con guía: la cámara de siempre del aparato (un campo de archivo). Un PNG se vuelve JPEG.
    await p.evaluate(() => { window.GuiaPlanillas.abrir = () => Promise.resolve({ sin_camara: true, motivo: "Este navegador no deja usar la cámara dentro de la página." }); });
    const [elegir] = await Promise.all([p.waitForEvent("filechooser"), p.click('tr[data-mesa="1"] [data-accion="planilla"]')]);
    await elegir.setFiles({ name: "planillas.png", mimeType: "image/png", buffer: png });
    await p.waitForFunction(() => window.__planillas.length === 2);
    igual("la foto de la cámara del aparato también sube, y siempre como JPEG", await p.evaluate(() => [window.__subidas[1].tipo, window.__subidas[1].tipoBlob, window.__planillas[1].mesa]), ["image/jpeg", "image/jpeg", 1]);
    await p.waitForSelector('tr[data-mesa="1"] [data-accion="ver-planilla"]');
    igual("con dos fotos, la fila dice cuántas", await p.evaluate(() => [document.querySelector('tr[data-mesa="1"] [data-accion="ver-planilla"]').textContent, document.querySelector('tr[data-mesa="1"] [data-fotos]').getAttribute("data-fotos")]), ["Ver las 2 fotos", "2"]);

    // Si el servidor de archivos falla: se avisa, no queda registrada ninguna foto ni nota.
    const n2 = await p.evaluate(() => { window.__modo = "subida"; return [window.__insertados.length, window.__planillas.length]; });
    const [elegir2] = await Promise.all([p.waitForEvent("filechooser"), p.click('tr[data-mesa="2"] [data-accion="planilla"]')]);
    await elegir2.setFiles({ name: "planillas.png", mimeType: "image/png", buffer: png });
    await p.waitForFunction(() => /No se pudo subir la foto/.test(document.body.textContent));
    igual("si no sube, no queda la fila ni la nota, y el botón vuelve a servir",
        await p.evaluate((n) => [window.__insertados.length === n[0], window.__planillas.length === n[1], document.querySelector('tr[data-mesa="2"] [data-accion="planilla"]').disabled], n2), [true, true, false]);
    await p.evaluate(() => { window.__modo = "bien"; });

    // Ver las fotos: una ventana con la dirección firmada de cada una.
    await p.click('tr[data-mesa="1"] [data-accion="ver-planilla"]');
    await p.waitForSelector("dialog#m-fotos-ventana[open] img");
    igual("la ventana muestra las dos con dirección firmada del bucket privado y su pie escrito",
        await p.evaluate(() => [[...document.querySelectorAll("#m-fotos-ventana img")].map((i) => /\/object\/sign\/mesa-arbitro-planillas\/yo\/1532448\//.test(i.src) && i.alt.startsWith("Foto de las planillas de la mesa 1")),
            [...document.querySelectorAll("#m-fotos-ventana figcaption")].map((c) => c.textContent.startsWith("Ronda 3 · mesa 1 · Muñoz Feliz Alejandro – Gramajo Tovar Marco · foto del "))]), [[true, true], [true, true]]);
    igual("el foco entra a la ventana y se cierra con su botón, devolviendo el foco", await p.evaluate(() => document.activeElement.getAttribute("data-accion")), "cerrar-fotos");
    await p.click('[data-accion="cerrar-fotos"]');
    await p.waitForFunction(() => !document.getElementById("m-fotos-ventana"));
    igual("al cerrar, la ventana se va y el foco vuelve al botón «Ver las 2 fotos»", await p.evaluate(() => [!!document.getElementById("m-fotos-ventana"), document.activeElement.getAttribute("data-accion")]), [false, "ver-planilla"]);

    // Otro torneo: las fotos son de cada torneo.
    igual("la casilla del documento cuenta las fotos y viene marcada", await p.evaluate(() => [document.getElementById("b-fotos-zona").checkVisibility(), document.getElementById("b-fotos").checked, document.getElementById("b-fotos-texto").textContent]),
        [true, true, "Incluir las 2 fotos de planillas en el PDF y el Word (el archivo pesa más)"]);

    console.log("\n=== El ritmo, el reloj y lo que dice el reglamento ===");
    // La hora queda fija (las 15:00 de Costa Rica) para el reloj que se apaga: la ronda empezó a las 14:00.
    await p.clock.setFixedTime(new Date("2026-11-14T15:00:00-06:00"));
    const n3 = await p.evaluate(() => window.__insertados.length);
    const fila3 = '#m-mesas tr[data-mesa="3"]';
    const ultima = () => p.evaluate(() => { const r = window.__insertados[window.__insertados.length - 1]; return [r.tipo, r.mesa, r.color || null, r.articulo, r.texto]; });
    igual("sin ritmo escrito, el de siempre y dice que no está confirmado; la ilegal da 2 minutos",
        await p.evaluate(() => [document.getElementById("m-ritmo").textContent, document.getElementById("m-regla-ilegal").textContent]),
        ["Ritmo del torneo: 90 min + 30 s por jugada · Clásico (sin confirmar: toca «Cambiar el ritmo» y escribe el de tu torneo)", "2 minutos"]);
    const ponerRitmo = async (inicial, inc, jugada, agrega) => {
        await p.click("#m-ritmo-cambiar");
        await p.waitForSelector("dialog[open] input[name=inicial]");
        await p.fill("dialog[open] input[name=inicial]", inicial);
        await p.fill("dialog[open] input[name=incremento]", inc);
        await p.fill("dialog[open] input[name=jugada]", jugada);
        await p.fill("dialog[open] input[name=agrega]", agrega);
        await p.click("dialog[open] [data-avisos-aceptar]");
    };
    await ponerRitmo("15", "10", "40", "");
    await p.waitForFunction(() => document.querySelector("dialog[open]") && document.querySelector("dialog[open]").textContent.includes("hacen falta las dos cosas"));
    igual("el segundo período a medias se rechaza y el cuadro vuelve a abrirse", await p.evaluate(() => !!document.querySelector("dialog[open] input[name=inicial]")), true);
    await p.click("dialog[open] [data-avisos-cancelar]");
    await ponerRitmo("15", "10", "", "");
    await p.waitForFunction(() => document.getElementById("m-ritmo").textContent.includes("15 min"));
    igual("15 min + 10 s son rápidas (A.1): la ilegal da 1 minuto (A.3), y el ritmo queda recordado para ESTE torneo",
        await p.evaluate(() => [document.getElementById("m-ritmo").textContent, document.getElementById("m-regla-ilegal").textContent, Object.keys(JSON.parse(localStorage.getItem("mesa_arbitro_ritmo_v1")))]),
        ["Ritmo del torneo: 15 min + 10 s por jugada · Rápidas", "1 minuto", ["1532448"]]);
    await p.click(fila3 + ' [data-jugador="blancas"] [data-accion="ilegal"]');
    await p.waitForSelector("dialog[open] select[name=tipo]");
    igual("en rápidas, la primera ilegal dice 1 minuto y recuerda el A.5.2", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("da 1 minuto más a su rival"), t.includes("apéndice A.3"), t.includes("A.5.2")]; }), [true, true, true]);
    await p.click("dialog[open] [data-avisos-cancelar]");
    await ponerRitmo("90", "30", "40", "30");
    await p.waitForFunction(() => document.getElementById("m-ritmo").textContent.includes("jugada 40"));
    igual("con segundo período", await p.evaluate(() => document.getElementById("m-ritmo").textContent), "Ritmo del torneo: 90 min + 30 s por jugada; al completar la jugada 40 se suman 30 min · Clásico");

    // La mesa 3 ya tiene ½-½ en chess-results: ahí no se propone nada. El celular va en una mesa sin resultado (se vuelve a leer la
    // ronda: el doble trae las mesas 1 y 2 sin resultado). El ritmo sigue: es del torneo, no de la lectura.
    await p.evaluate(() => { document.getElementById("m-estado").textContent = ""; });
    await p.click("#m-leer");
    await p.waitForFunction(() => document.getElementById("m-estado").textContent.startsWith("Leída la ronda"));
    igual("al volver a leer la ronda, el ritmo del torneo sigue", await p.evaluate(() => document.getElementById("m-ritmo").textContent.includes("jugada 40")), true);
    const libre = await p.$$eval("#m-mesas tr[data-mesa]", (f) => (f.find((x) => x.children[3].textContent === "Sin resultado") || {}).dataset.mesa);
    const filaL = '#m-mesas tr[data-mesa="' + libre + '"]';
    await p.click(filaL + ' [data-jugador="negras"] [data-accion="irregularidad"]');
    await p.waitForSelector("dialog[open] select[name=tipo]");
    await p.selectOption("dialog[open] select[name=tipo]", "celular");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector("dialog[open] select[name=sancion]");
    igual("el celular: dice que pierde y su rival gana (11.3.2.2), que las bases pueden poner una menor, y viene elegido «Pierde»",
        await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return [d.textContent.includes("pierde la partida y su rival gana (11.3.2.2)"), d.textContent.includes("sanción menor"), d.querySelector("select[name=sancion]").value]; }), [true, true, "pierde"]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction((n) => window.__insertados.length === n + 1, n3);
    igual("queda con su artículo y la sanción escrita", await ultima(), ["irregularidad", Number(libre), "negras", "11.3.2.2", "Celular o aparato electrónico sonó o lo tenía encendido · Sanción: pierde la partida (art. 11.3.2.2)"]);
    await p.waitForFunction(() => document.querySelector("dialog[open]") && document.querySelector("dialog[open]").textContent.includes("pierde la partida y su rival gana"));
    igual("PROPONE el 1-0 (pierden las negras) sin guardarlo, y lo dice", await p.evaluate((a) => [document.getElementById("m-sel-" + a[0]).value, window.__guardados.length === a[1], document.querySelector("dialog[open]").textContent.includes("Dejé propuesto «1-0")], [libre, guardados0 + 1]), ["1", true, true]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.selectOption("#m-sel-" + libre, "");

    await p.click(fila3 + ' [data-jugador="blancas"] [data-accion="irregularidad"]');
    await p.waitForSelector("dialog[open] select[name=tipo]");
    await p.selectOption("dialog[open] select[name=tipo]", "ruido");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector("dialog[open] select[name=sancion]");
    igual("molestar al rival: el 11.5 y viene «Advertencia»", await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return [d.textContent.includes("(11.5)"), d.querySelector("select[name=sancion]").value]; }), [true, "advertencia"]);
    await p.selectOption("dialog[open] select[name=sancion]", "rival+120");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction((n) => window.__insertados.length === n + 2, n3);
    igual("la sanción de tiempo se escribe como en el Centroamericano (el reloj la vuelve a leer)", await ultima(), ["irregularidad", 3, "blancas", "11.5", "Molestó al rival o hizo ruido · Sanción de tiempo: +2:00 a su rival (art. 12.9)"]);
    await p.waitForFunction(() => /Ajusta el reloj ahora: súmale 2:00 a su rival/.test(document.body.textContent));

    await p.click(fila3 + ' [data-jugador="blancas"] [data-accion="irregularidad"]');
    await p.waitForSelector("dialog[open] select[name=tipo]");
    await p.fill("dialog[open] textarea[name=nota]", "Habló con el público");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector("dialog[open] select[name=sancion]");
    igual("con una irregularidad ya anotada, recuerda el 11.7", await p.evaluate(() => document.querySelector("dialog[open]").textContent.includes("Ya lleva una irregularidad en esta partida") && document.querySelector("dialog[open]").textContent.includes("(11.7)")), true);
    await p.selectOption("dialog[open] select[name=sancion]", "otra");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => document.querySelector("dialog[open]") && document.querySelector("dialog[open]").textContent.includes("Escribe cuál fue la sanción"));
    igual("«Otra» sanción sin escribir no anota nada", await p.evaluate((n) => window.__insertados.length === n + 2, n3), true);
    await p.fill("dialog[open] textarea[name=otra]", "Pierde 5 minutos, según las bases");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction((n) => window.__insertados.length === n + 3, n3);
    igual("y con lo escrito, sí", await ultima(), ["irregularidad", 3, "blancas", "12.9", "Otra: Habló con el público · Sanción: Pierde 5 minutos, según las bases"]);
    await p.waitForFunction((f) => document.querySelector(f + ' [data-jugador="blancas"] [data-marca="irregularidad"]') && document.querySelector(f + ' [data-jugador="blancas"] [data-marca="irregularidad"]').textContent === "2 irregularidades", fila3);

    igual("cada mesa tiene su botón «Reloj», escrito y con la mesa para el lector de pantalla",
        await p.$$eval('tr[data-mesa] [data-accion="reloj"]', (b) => b.map((x) => [x.textContent.trim(), x.getAttribute("aria-label")])),
        [["⏱ Reloj", "Corregir el reloj de la mesa 1"], ["⏱ Reloj", "Corregir el reloj de la mesa 2"], ["⏱ Reloj", "Corregir el reloj de la mesa 3"]]);
    const abrirReloj = async (caso, datos) => {
        await p.click(fila3 + ' [data-accion="reloj"]');
        await p.waitForSelector("dialog[open] select[name=caso]");
        await p.selectOption("dialog[open] select[name=caso]", caso);
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForSelector("dialog[open] input[name=jb]");
        for (const [k, v] of Object.entries(datos)) await p.fill("dialog[open] input[name=" + k + "]", v);
        await p.click("dialog[open] [data-avisos-aceptar]");
    };
    await abrirReloj("incremento", { jb: "10", jn: "12", tb: "1000", tn: "1000" });
    await p.waitForFunction(() => document.querySelector("dialog[open]") && document.querySelector("dialog[open]").textContent.includes("las mismas jugadas que las negras o una más"));
    igual("jugadas imposibles: dice qué revisar y no calcula", await p.evaluate(() => !!document.querySelector("dialog[open] input[name=jb]")), true);
    await p.click("dialog[open] [data-avisos-cancelar]");
    await abrirReloj("control", { jb: "41", jn: "40", tb: "1240", tn: "31:05" });
    await p.waitForSelector("dialog[open] input[name=tn]");
    await p.waitForFunction(() => document.querySelector("dialog[open]").textContent.includes("Pon blancas"));
    igual("no sumó la jugada 40: a los dos que la pasaron, 30 min; con las cuentas, el artículo y el aviso del contador",
        await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return [d.textContent.includes("Pon blancas 42:40 y negras 1:01:05 (art. 6.10.2)."), d.textContent.includes("Las blancas: 12:40 +30:00 = 42:40."), d.textContent.includes("contador de jugadas"), d.querySelector("input[name=tb]").value, d.querySelector("[data-avisos-aceptar]").textContent, d.querySelector("[data-avisos-cancelar]").textContent]; }),
        [true, true, true, "42:40", "Anotar en la bitácora", "Cerrar sin anotar"]);
    await p.fill("dialog[open] input[name=tb]", "4200");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction((n) => window.__insertados.length === n + 4, n3);
    igual("queda como incidencia de la mesa, con el 6.10.2, lo que puso el árbitro y lo que daba el cálculo", await ultima(),
        ["incidencia", 3, null, "6.10.2", "Reloj corregido (no sumó el tiempo de la jugada 40): blancas 42:00, negras 1:01:05, con 41 y 40 jugadas completadas. Ajustado por el árbitro; el cálculo daba blancas 42:40 y negras 1:01:05."]);

    await abrirReloj("apagado", { inicio: "14:00", jb: "25", jn: "25" });
    await p.waitForFunction(() => document.querySelector("dialog[open]") && document.querySelector("dialog[open]").textContent.includes("Pon blancas"));
    igual("el reloj que se apagó: desde las 14:00 pasó 1 h; la sanción de +2:00 a las negras (de la bitácora) entra, y lo demás mitad y mitad (6.10.1)",
        await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Pon blancas 1:12:30 y negras 1:14:30 (art. 6.10.1)."), t.includes("pasaron 1 h"), t.includes("Las negras suman +2:00 (sanción de tiempo)"), t.includes("mitad y mitad")]; }),
        [true, true, true, true]);
    await p.click("dialog[open] [data-avisos-cancelar]");
    await p.waitForTimeout(100);
    igual("«Cerrar sin anotar» no anota", await p.evaluate((n) => window.__insertados.length === n + 4, n3), true);

    await p.click("#c-reglamento");
    await p.waitForSelector("dialog[open] select[name=tipo]");
    await p.selectOption("dialog[open] select[name=tipo]", "planilla");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => document.querySelector("dialog[open]") && document.querySelector("dialog[open]").textContent.includes("(8.4)"));
    igual("la consulta del reglamento dice la regla y lo que se suele aplicar, sin contar irregularidades", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("Advertencia (12.9.1)"), t.includes("primera irregularidad")]; }), [true, false]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.click("#c-reloj");
    await p.waitForSelector("dialog[open] select[name=caso]");
    await p.selectOption("dialog[open] select[name=caso]", "programado");
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForSelector("dialog[open] input[name=pini]");
    for (const [k, v] of Object.entries({ jb: "20", jn: "19", tb: "50:00", tn: "33:20", pini: "60", pinc: "30" })) await p.fill("dialog[open] input[name=" + k + "]", v);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForFunction(() => document.querySelector("dialog[open]") && document.querySelector("dialog[open]").textContent.includes("Pon blancas"));
    igual("consultar el reloj sin mesa: programado 60 en vez de 90, +30:00 a cada uno, y un solo botón «Listo» (no anota)",
        await p.evaluate(() => { const d = document.querySelector("dialog[open]"); return [d.textContent.includes("Pon blancas 1:20:00 y negras 1:03:20"), d.querySelector("[data-avisos-aceptar]").textContent, !!d.querySelector("[data-avisos-cancelar]")]; }), [true, "Listo", false]);
    await p.click("dialog[open] [data-avisos-aceptar]");
    await p.waitForTimeout(100);
    igual("y no anotó nada", await p.evaluate((n) => window.__insertados.length === n + 4, n3), true);

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
    const imagenes = (b) => (b.toString("latin1").match(/\/Subtype \/Image/g) || []).length;
    igual("con la casilla marcada, el PDF lleva las dos fotos (además de la marca) y el Word también",
        [imagenes(pdf.bytes), docx.bytes.includes("word/media/foto1.jpeg"), docx.bytes.includes("word/media/foto2.jpeg")], [4, true, true]);
    await p.uncheck("#b-fotos");
    const pdfSin = await bajar("#b-pdf");
    const docxSin = await bajar("#b-docx");
    igual("sin la casilla, el PDF sale solo con la marca y el Word sin fotos", [imagenes(pdfSin.bytes) < imagenes(pdf.bytes), imagenes(pdfSin.bytes), docxSin.bytes.includes("word/media/foto1.jpeg")], [true, 2, false]);
    await p.check("#b-fotos");

    console.log("\n=== En el celular ===");
    await p.setViewportSize({ width: 390, height: 800 });
    igual("la página no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth), 390);
    igual("sin errores en la página", errores, []);
    await ctx.close();

    await browser.close();
    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron.` : "\n✓ Todo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/*! rev bfb5bbb0d2d82f9f */
