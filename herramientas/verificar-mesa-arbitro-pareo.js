/* mesa-arbitro.html con un torneo de Pareo Integral (js/mesa-arbitro-pareo.js),
   sin chess-results. Con un doble de Supabase: la licencia, la tabla
   arbitro_bitacora (guarda y filtra de verdad) y un canal en vivo donde un
   doble del ÁRBITRO PRINCIPAL contesta como contesta js/pareo/pagina.js
   (conectarAdjuntos, recibirDeAdjunto, recibirNotaDeAdjunto): manda el
   «estado» al pedirlo, acepta un resultado solo en una mesa de la última
   ronda sin resultado, y cuenta las ilegales que llegan como nota.

   Lo que comprueba:
   - un enlace que no es de árbitro se rechaza; el bueno se conecta al canal
     «pareo-adjunto-<código>» y pide el estado;
   - se ven SOLO las mesas del rango del enlace, con el torneo y la ronda;
   - un resultado viaja con la ronda y la mesa, y queda en la bitácora como
     enviado SOLO cuando el estado del principal ya lo trae, con el código
     del enlace (`pareo`) y sin número de chess-results;
   - si la mesa ya tenía otro resultado, se avisa y NO queda como enviado;
   - la ilegal le llega al principal como sanción con el artículo «ilegal»
     (lo que cuenta Pareo para la marca), y con la segunda la mesa se marca
     «Segunda ilegal: decide el resultado»;
   - la irregularidad y la nota libre le llegan y quedan en la bitácora;
   - el enlace no queda guardado en el navegador;
   - el documento de la bitácora dice Pareo Integral, no chess-results;
   - a 390 px no se desplaza a lo ancho, y no hay errores en la página.

   Ver «La mesa del árbitro con los torneos de Pareo Integral» en
   docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js mesa-arbitro-pareo               */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const M = require("../js/mesa-arbitro.js");

const BASE = process.env.BASE_URL || "http://localhost:8777";
const CODIGO = "abcd2345";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

const doble = `(function(){
  window.__mandados = [];
  window.__insertados = [];
  window.__canales = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const FILAS = [];
  // El torneo del principal: la ronda 2, cuatro mesas (la 3 ya con resultado, la 4 sin rival).
  const T = { nombre: "Eliminatoria JDN PZ · U12", ronda: 2, principal: "Jean Carlo Quesada", arbitro: "Adjunta de prueba",
    mesas: [{ m: 1, f: 1, b: "Rojas Mora, Ana", n: "Vargas Solis, Bruno", r: null }, { m: 2, f: 2, b: "Diaz Ulate, Daniel", n: "Esquivel Brenes, Elena", r: null },
            { m: 3, f: 3, b: "Fallas Arce, Fabio", n: "Herrera Quiros, Hugo", r: "0-1" }, { m: 4, f: 4, b: "Ibarra Loria, Ines", n: null, r: "bye" }] };
  const ilegales = {};
  window.__principal = { otroEnLaMesa: null };
  function estado() {
    const marca = (m, lado) => { const n = ilegales[m.m + lado] || 0; return n ? { t: "i".repeat(n), pierde: n >= 2 } : null; };
    return { nombre: T.nombre, ronda: T.ronda, principal: T.principal, arbitro: T.arbitro,
      mesas: T.mesas.map((m) => Object.assign({}, m, { mia: false, mb: marca(m, "b"), mn: m.n == null ? null : marca(m, "n") })) };
  }
  window.sb = {
    auth: {
      getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }),
      getUser: () => R({ user: { id: "yo" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) },
    },
    rpc: (f, a) => R(f === "tengo_herramienta" ? a.p_herramienta === "mesa-arbitro" : f === "arbitro_torneos_mis" ? [] : null),
    functions: { invoke: () => R({ error: "no se usa" }) },
    from: (t) => {
      if (t !== "arbitro_bitacora") { const q = {}; ["select","eq","order","range","in","single","maybeSingle","limit","update","insert"].forEach((m) => q[m] = () => q); q.then = (ok) => Promise.resolve({ data: [], error: null }).then(ok); return q; }
      return {
        insert: (rows) => { for (const r of rows) if ((r.tnr == null) === (r.pareo == null)) return R(null, { message: "violates check constraint arbitro_bitacora_un_torneo" });
          window.__insertados.push(...rows); rows.forEach((r) => FILAS.push(Object.assign({ id: "id" + FILAS.length, creada_por: "yo", ocurrio: new Date(Date.UTC(2026, 10, 22, 15, FILAS.length)).toISOString() }, r))); return R(null); },
        select: () => { const f = {}; const q = { eq: (c, v) => { f[c] = v; return q; }, order: () => q, range: () => q,
          then: (ok, ko) => Promise.resolve({ data: FILAS.filter((r) => Object.entries(f).every(([c, v]) => r[c] === v)), error: null }).then(ok, ko) }; return q; },
      };
    },
    channel: (nombre) => {
      window.__canales.push(nombre);
      const oyentes = {};
      const emitir = (ev, payload) => setTimeout(() => (oyentes[ev] || []).forEach((cb) => cb({ payload })), 30);
      const c = {
        on(tipo, filtro, cb) { (oyentes[filtro.event] = oyentes[filtro.event] || []).push(cb); return c; },
        subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 10); return c; },
        unsubscribe() {},
        send(msg) {
          window.__mandados.push([msg.event, msg.payload]);
          if (nombre !== "pareo-adjunto-${CODIGO}") return;
          const p = msg.payload || {};
          if (msg.event === "pedir") emitir("estado", estado());
          if (msg.event === "resultado") {
            const m = T.mesas[p.mesa - 1];
            if (window.__principal.otroEnLaMesa === p.mesa && m && !m.r) m.r = "=";
            // Como recibirDeAdjunto: la última ronda, una mesa con rival y sin resultado.
            if (m && p.ronda === T.ronda && m.n != null && !m.r) m.r = p.r;
            emitir("estado", estado());
          }
          if (msg.event === "nota") {
            if (p.articulo === "ilegal" && p.lado) ilegales[p.mesa + p.lado] = (ilegales[p.mesa + p.lado] || 0) + 1;
            emitir("notaRecibida", { hora: Date.now() });
            emitir("estado", estado());
          }
        },
      };
      return c;
    },
    removeChannel() {},
  };
})();`;

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: doble }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/mesa-arbitro.html", { waitUntil: "load" });
    await p.waitForFunction(() => document.getElementById("app").checkVisibility());

    console.log("\n=== Conectar con el enlace de árbitro ===");
    igual("la sección de Pareo Integral se ve, antes de la de chess-results", await p.evaluate(() => {
        const a = document.getElementById("zona-pareo"), b = document.getElementById("t-torneo");
        return a.checkVisibility() && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), true);
    await p.fill("#p-enlace", "https://chess-results.com/tnr1532448.aspx");
    await p.click("#p-conectar");
    const dePareo = () => p.evaluate(() => window.__canales.filter((c) => c.startsWith("pareo-adjunto-")));
    igual("un enlace que no es de árbitro de Pareo no se conecta", (await dePareo()).length, 0);
    await p.fill("#p-enlace", "https://ajedrez-integral.com/pareo.html#adjunto=" + CODIGO + "&m=1-3");
    await p.click("#p-conectar");
    await p.waitForFunction(() => document.querySelectorAll("#p-mesas tr").length > 0, null, { timeout: 5000 }).catch(() => {});
    igual("se conecta al canal del enlace y pide el estado", [await dePareo(), await p.evaluate(() => (window.__mandados.find((x) => x[0] === "pedir") || [])[0])], [["pareo-adjunto-" + CODIGO], "pedir"]);
    igual("se ven solo las mesas del rango (1 a 3), con el torneo y la ronda", await p.evaluate(() => [[...document.querySelectorAll("#p-mesas tr")].map((tr) => tr.dataset.mesa), document.getElementById("p-torneo").textContent]),
        [["1", "2", "3"], "Eliminatoria JDN PZ · U12 · ronda 2 · tus mesas: 1 a 3"]);
    igual("la mesa con resultado no se puede volver a anotar", await p.evaluate(() => [document.querySelector('#p-mesas tr[data-mesa="3"]').dataset.estado, !!document.querySelector('#p-mesas tr[data-mesa="3"] button[data-r]')]), ["con-resultado", false]);

    console.log("\n=== Un resultado ===");
    await p.click('#p-mesas tr[data-mesa="1"] button[data-r="1-0"]');
    await p.waitForFunction(() => window.__insertados.some((r) => r.tipo === "resultado"), null, { timeout: 5000 }).catch(() => {});
    igual("viaja con la ronda y la mesa", await p.evaluate(() => window.__mandados.find((x) => x[0] === "resultado")[1]), { ronda: 2, mesa: 1, r: "1-0" });
    igual("queda en la bitácora como enviado cuando el principal lo trae, con el código del enlace y sin chess-results",
        await p.evaluate(() => { const r = window.__insertados.find((x) => x.tipo === "resultado"); return [r.pareo, r.tnr === undefined, r.ronda, r.mesa, r.resultado, r.enviado]; }), ["abcd2345", true, 2, 1, "1-0", true]);
    igual("la mesa dice el resultado de Pareo", await p.$eval('#p-mesas tr[data-mesa="1"]', (tr) => [tr.dataset.estado, tr.children[3].textContent]), ["con-resultado", "1-0 (ganan blancas)"]);

    await p.evaluate(() => { window.__principal.otroEnLaMesa = 2; });
    const antes = await p.evaluate(() => window.__insertados.length);
    await p.click('#p-mesas tr[data-mesa="2"] button[data-r="0-1"]');
    await p.waitForFunction(() => document.querySelector('#p-mesas tr[data-mesa="2"]').dataset.estado === "con-resultado", null, { timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(300);
    igual("si la mesa ya tenía otro resultado, NO queda como enviado", await p.evaluate((n) => window.__insertados.length - n, antes), 0);
    igual("y se avisa con el resultado que tiene", await p.evaluate(() => document.body.innerText.includes("ya tenía otro resultado en Pareo («½-½ (tablas)»)")), true);

    console.log("\n=== Ilegales, irregularidades y notas ===");
    await p.evaluate(() => { window.__principal.otroEnLaMesa = null; });
    const anotarIlegal = async () => {
        await p.click('#p-mesas tr[data-mesa="1"] td[data-jugador="negras"] button[data-accion="ilegal"]');
        await p.waitForSelector("[data-avisos-aceptar]", { state: "visible" });
        // Viene elegida «Otra»: hay que escribir qué pasó.
        await p.fill("dialog[open] textarea", "Enroque con el rey en jaque.");
        await p.click("[data-avisos-aceptar]");
    };
    // La ilegal se prueba en la mesa 1 (ya con resultado: los botones de los jugadores siguen).
    await anotarIlegal().catch((e) => console.log("      (no se pudo tocar el cuadro: " + e.message + ")"));
    await p.waitForFunction(() => window.__insertados.some((r) => r.tipo === "ilegal"), null, { timeout: 5000 }).catch(() => {});
    igual("la ilegal le llega al principal como sanción, con el artículo «ilegal» y el lado del jugador",
        await p.evaluate(() => { const n = window.__mandados.find((x) => x[0] === "nota"); return n && [n[1].mesa, n[1].lado, n[1].tipo, n[1].articulo, n[1].autor]; }), [1, "n", "sancion", "ilegal", "Adjunta de prueba"]);
    igual("y queda en la bitácora con el jugador, el color y el art. 7.5.5", await p.evaluate(() => { const r = window.__insertados.find((x) => x.tipo === "ilegal"); return r && [r.pareo, r.mesa, r.color, r.jugador, r.articulo]; }),
        ["abcd2345", 1, "negras", "Vargas Solis, Bruno", "7.5.5"]);
    await p.waitForFunction(() => /1 ilegal/.test(document.querySelector('#p-mesas tr[data-mesa="1"] td[data-jugador="negras"]').textContent), null, { timeout: 3000 }).catch(() => {});
    igual("la marca que cuenta Pareo se ve escrita en el jugador", await p.$eval('#p-mesas tr[data-mesa="1"] td[data-jugador="negras"] [data-marca]', (x) => x.textContent).catch(() => ""), "1 ilegal");

    await p.fill("#p-nota-texto", "Sonó un celular en la sala, cerca de la mesa 2.");
    await p.selectOption("#p-nota-mesa", "2");
    await p.click("#p-nota-agregar");
    await p.waitForFunction(() => window.__insertados.some((r) => r.tipo === "incidencia"), null, { timeout: 5000 }).catch(() => {});
    igual("la nota libre le llega al principal y queda en la bitácora", await p.evaluate(() => {
        const n = window.__mandados.filter((x) => x[0] === "nota").pop()[1]; const r = window.__insertados.find((x) => x.tipo === "incidencia");
        return [n.tipo, n.mesa, n.texto, r && r.pareo, r && r.mesa];
    }), ["otra", 2, "Sonó un celular en la sala, cerca de la mesa 2.", "abcd2345", 2]);
    igual("la bitácora de la página muestra lo anotado", await p.$$eval("#p-lineas tr", (f) => f.map((tr) => tr.dataset.tipo)), ["resultado", "ilegal", "incidencia"]);
    igual("el enlace no queda guardado en el navegador", await p.evaluate(() => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || "").includes("abcd2345"))), false);

    console.log("\n=== El documento y el celular ===");
    const doc = M.documento({ pareo: CODIGO, torneo: "U12" }, [{ tipo: "resultado", resultado: "1-0", enviado: true, pareo: CODIGO, ocurrio: "x" }], "Adjunta", String);
    igual("el documento dice Pareo Integral y el código del enlace, no chess-results", [doc.subtitulo, /chess-results/.test(JSON.stringify(doc.bloques))], ["U12 · Pareo Integral, enlace de árbitro abcd2345", false]);
    await p.setViewportSize({ width: 390, height: 844 });
    igual("a 390 px no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    igual("sin errores en la página", errores, []);

    await browser.close();
    console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
    process.exit(fallos ? 1 : 0);
})();

/*! rev bfb5bbb0d2d82f9f */
