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
   - SIN la base (la función caída), todo va por el canal como antes; CON
     ella: se entra con el código solo («ABCD-2345») y la base da las mesas,
     un resultado y una nota van a la cola de la base (no por el canal: solo
     el toque «cola»), la mesa dice «Guardado…» y queda enviado cuando el
     principal lo trae; lo que la base rechaza por una regla se dice y la
     mesa se puede volver a anotar; y con el principal callado, las mesas
     salen del torneo publicado;
   - las cámaras de Notara: con el código que manda el principal, cada mesa
     con su tablero en vivo y «La cámara dice» con «Confirmar» (manda el
     resultado como tocarlo a mano) y «No es así»;
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
  window.__principal = { otroEnLaMesa: null, mudo: false,
    // Lo que hace su Pareo al leer la cola: acepta y manda su estado.
    aceptar: (mesa, r) => { T.mesas[mesa - 1].r = r; (window.__oyentesAdjunto.estado || []).forEach((cb) => cb({ payload: estado() })); },
    limpiar: () => { T.mesas[0].r = null; T.mesas[1].r = null; } };
  window.__oyentesAdjunto = {};
  function estado() {
    const marca = (m, lado) => { const n = ilegales[m.m + lado] || 0; return n ? { t: "i".repeat(n), pierde: n >= 2 } : null; };
    return { nombre: T.nombre, ronda: T.ronda, principal: T.principal, arbitro: T.arbitro, camaras: "camprue2", torneo: "11111111-2222-3333-4444-555555555555",
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
      // El torneo publicado (de lectura pública): la ronda 2 con la mesa 1 ya en 1-0.
      if (t === "pareo_publicados") { const q = {}; ["select","eq"].forEach((m) => q[m] = () => q); q.maybeSingle = () => R({ nombre: "U12", datos: { nombre: "Eliminatoria JDN PZ · U12",
        jugadores: [["a","Rojas Mora, Ana"],["b","Vargas Solis, Bruno"],["c","Diaz Ulate, Daniel"],["d","Esquivel Brenes, Elena"]].map(([id, nombre]) => ({ id, nombre })),
        rondas: [{ mesas: [{ b: "a", n: "c", r: "1-0" }] }, { mesas: [{ b: "c", n: "a", r: "1-0" }, { b: "b", n: "d", r: null }] }] } }); return q; }
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
      window.__oyentesPorCanal = window.__oyentesPorCanal || {};
      window.__oyentesPorCanal[nombre] = oyentes;
      if (nombre === "pareo-adjunto-${CODIGO}") window.__oyentesAdjunto = oyentes;
      const emitir = (ev, payload) => setTimeout(() => (oyentes[ev] || []).forEach((cb) => cb({ payload })), 30);
      const c = {
        on(tipo, filtro, cb) { (oyentes[filtro.event] = oyentes[filtro.event] || []).push(cb); return c; },
        subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 10); return c; },
        unsubscribe() {},
        send(msg) {
          window.__mandados.push([msg.event, msg.payload]);
          if (nombre !== "pareo-adjunto-${CODIGO}" || window.__principal.mudo) return;
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
    // Un doble de la Edge Function pareo-publicar: «caida» (como sin
    // internet hacia ella, o una versión vieja: todo por el canal) o «base».
    const fn = { modo: "caida", entradas: [], cola: [], rechazar: false };
    await ctx.route("**/functions/v1/pareo-publicar", (r) => {
        if (fn.modo === "caida") return r.abort();
        const b = JSON.parse(r.request().postData() || "{}");
        const responder = (x) => r.fulfill({ contentType: "application/json", body: JSON.stringify(x) });
        if (b.codigo !== CODIGO) return responder({ ok: false, motivo: "no", error: "Ese código no es de ningún árbitro de un torneo publicado." });
        if (b.accion === "adjunto_entrar") { fn.entradas.push(b.codigo); return responder({ ok: true, id: "11111111-2222-3333-4444-555555555555", nombre: "U12", arbitro: "Adjunta de prueba", desde: 1, hasta: 3 }); }
        if (b.accion === "adjunto_anotar") {
            if (fn.rechazar) return responder({ ok: false, motivo: "mesa", error: "Esa mesa no es de las tuyas." });
            fn.cola.push({ evento: b.evento, ronda: b.ronda, datos: b.datos });
            return responder({ ok: true, id: fn.cola.length });
        }
        return responder({ ok: false, error: "Acción desconocida." });
    });
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => { errores.push(e.message); if (process.env.DBG) console.log("   [error]", e.message); });
    if (process.env.DBG) p.on("console", (m) => console.log("   [consola]", m.text()));
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
    await p.waitForFunction(() => window.__insertados.some((r) => r.tipo === "ilegal") && window.__mandados.some((x) => x[0] === "nota"), null, { timeout: 5000 }).catch(() => {});
    igual("la ilegal le llega al principal como sanción, con el artículo «ilegal» y el lado del jugador",
        await p.evaluate(() => { const n = window.__mandados.find((x) => x[0] === "nota"); return n && [n[1].mesa, n[1].lado, n[1].tipo, n[1].articulo, n[1].autor]; }), [1, "n", "sancion", "ilegal", "Adjunta de prueba"]);
    igual("y queda en la bitácora con el jugador, el color y el art. 7.5.5", await p.evaluate(() => { const r = window.__insertados.find((x) => x.tipo === "ilegal"); return r && [r.pareo, r.mesa, r.color, r.jugador, r.articulo]; }),
        ["abcd2345", 1, "negras", "Vargas Solis, Bruno", "7.5.5"]);
    await p.waitForFunction(() => /1 ilegal/.test(document.querySelector('#p-mesas tr[data-mesa="1"] td[data-jugador="negras"]').textContent), null, { timeout: 3000 }).catch(() => {});
    igual("la marca que cuenta Pareo se ve escrita en el jugador", await p.$eval('#p-mesas tr[data-mesa="1"] td[data-jugador="negras"] [data-marca]', (x) => x.textContent).catch(() => ""), "1 ilegal");

    await p.fill("#p-nota-texto", "Sonó un celular en la sala, cerca de la mesa 2.");
    await p.selectOption("#p-nota-mesa", "2");
    await p.click("#p-nota-agregar");
    await p.waitForFunction(() => window.__insertados.some((r) => r.tipo === "incidencia") && window.__mandados.filter((x) => x[0] === "nota").length >= 2, null, { timeout: 5000 }).catch(() => {});
    igual("la nota libre le llega al principal y queda en la bitácora", await p.evaluate(() => {
        const n = window.__mandados.filter((x) => x[0] === "nota").pop()[1]; const r = window.__insertados.find((x) => x.tipo === "incidencia");
        return [n.tipo, n.mesa, n.texto, r && r.pareo, r && r.mesa];
    }), ["otra", 2, "Sonó un celular en la sala, cerca de la mesa 2.", "abcd2345", 2]);
    igual("la bitácora de la página muestra lo anotado", await p.$$eval("#p-lineas tr", (f) => f.map((tr) => tr.dataset.tipo)), ["resultado", "ilegal", "incidencia"]);
    igual("el enlace no queda guardado en el navegador", await p.evaluate(() => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || "").includes("abcd2345"))), false);

    console.log("\n=== Lo que se anota queda en la base ===");
    fn.modo = "base";
    await p.evaluate(() => { window.__principal.limpiar(); window.__mandados.length = 0; });
    await p.fill("#p-enlace", "ABCD-2345");
    await p.click("#p-conectar");
    await p.waitForFunction(() => document.querySelectorAll("#p-mesas tr").length > 0 && window.__mandados.some((x) => x[0] === "pedir"), null, { timeout: 5000 }).catch(() => {});
    igual("se entra con el código solo, escrito como venga, y la base da las mesas (1 a 3)", [fn.entradas, await p.evaluate(() => [...document.querySelectorAll("#p-mesas tr")].map((tr) => tr.dataset.mesa))],
        [[CODIGO], ["1", "2", "3"]]);
    const enBitacora = await p.evaluate(() => window.__insertados.length);
    await p.click('#p-mesas tr[data-mesa="1"] button[data-r="="]');
    await p.waitForFunction(() => window.__mandados.some((x) => x[0] === "cola"), null, { timeout: 5000 }).catch(() => {});
    igual("el resultado va a la cola de la base con la ronda y la mesa", fn.cola, [{ evento: "resultado", ronda: 2, datos: { mesa: 1, r: "=" } }]);
    igual("por el canal va solo el toque «cola», no el resultado", await p.evaluate(() => window.__mandados.filter((x) => x[0] !== "pedir").map((x) => x[0])), ["cola"]);
    igual("la mesa dice que quedó guardado", await p.$eval('#p-mesas tr[data-mesa="1"]', (tr) => tr.textContent.includes("Guardado: el principal lo recibe en cuanto se conecte.")), true);
    igual("y todavía no queda como enviado", await p.evaluate((n) => window.__insertados.length - n, enBitacora), 0);
    await p.evaluate(() => window.__principal.aceptar(1, "="));
    await p.waitForFunction((n) => window.__insertados.length > n, enBitacora, { timeout: 5000 }).catch(() => {});
    igual("queda enviado cuando el principal lo trae", await p.evaluate(() => { const r = window.__insertados[window.__insertados.length - 1]; return [r.tipo, r.mesa, r.resultado, r.enviado]; }), ["resultado", 1, "1/2", true]);

    fn.rechazar = true;
    await p.click('#p-mesas tr[data-mesa="2"] button[data-r="1-0"]');
    await p.waitForFunction(() => document.body.innerText.includes("no se tomó"), null, { timeout: 5000 }).catch(() => {});
    igual("lo que la base rechaza por una regla se dice, y la mesa se puede volver a anotar",
        [await p.evaluate(() => document.body.innerText.includes("La mesa 2 no se tomó: Esa mesa no es de las tuyas.")), await p.$eval('#p-mesas tr[data-mesa="2"] button[data-r="1-0"]', (b) => b.disabled)], [true, false]);
    fn.rechazar = false;

    await p.fill("#p-nota-texto", "El reloj de la mesa 2 se apagó.");
    await p.selectOption("#p-nota-mesa", "2");
    await p.click("#p-nota-agregar");
    await p.waitForFunction(() => window.__mandados.filter((x) => x[0] === "cola").length >= 2, null, { timeout: 5000 }).catch(() => {});
    igual("la nota también va a la cola de la base", fn.cola.slice(1).map((x) => [x.evento, x.ronda, x.datos.mesa, x.datos.texto]), [["nota", 2, 2, "El reloj de la mesa 2 se apagó."]]);

    // Con el principal callado (su Pareo cerrado): las mesas del torneo publicado.
    await p.evaluate(() => { window.__principal.mudo = true; });
    await p.fill("#p-enlace", CODIGO);
    await p.click("#p-conectar");
    await p.waitForFunction(() => /no está conectado/.test(document.getElementById("p-estado").textContent), null, { timeout: 15000 }).catch(() => {});
    igual("con el principal callado, las mesas salen del torneo publicado y se dice por qué",
        await p.evaluate(() => [document.getElementById("p-estado").textContent.startsWith("El árbitro principal no está conectado"), document.getElementById("p-torneo").textContent,
            [...document.querySelectorAll("#p-mesas tr")].map((tr) => [tr.dataset.mesa, tr.dataset.estado, tr.children[1].textContent.trim()])]),
        [true, "Eliminatoria JDN PZ · U12 · ronda 2 · tus mesas: 1 a 3", [["1", "con-resultado", "Diaz Ulate, DanielIlegalIrregularidad"], ["2", "libre", "Vargas Solis, BrunoIlegalIrregularidad"]]]);
    await p.click('#p-mesas tr[data-mesa="2"] button[data-r="0-1"]');
    await p.waitForFunction(() => window.__mandados.filter((x) => x[0] === "cola").length >= 3, null, { timeout: 5000 }).catch(() => {});
    igual("y lo que se anota igual queda en la base", fn.cola[fn.cola.length - 1], { evento: "resultado", ronda: 2, datos: { mesa: 2, r: "0-1" } });

    console.log("\n=== Las cámaras de Notara ===");
    fn.modo = "caida";
    const pc = await ctx.newPage();
    pc.on("pageerror", (e) => errores.push(e.message));
    await pc.goto(BASE + "/mesa-arbitro.html", { waitUntil: "load" });
    await pc.waitForFunction(() => document.getElementById("app").checkVisibility());
    await pc.fill("#p-enlace", "https://ajedrez-integral.com/pareo.html#adjunto=" + CODIGO + "&m=1-3");
    await pc.click("#p-conectar");
    await pc.waitForFunction(() => (window.__oyentesPorCanal || {})["tablero-vivo-camprue2"] && document.querySelector('#p-mesas [data-cam="1"]'), null, { timeout: 8000 }).catch(() => {});
    igual("con el código del principal, escucha las cámaras y cada mesa sin resultado tiene su lugar", await pc.$$eval("#p-mesas [data-cam]", (l) => l.map((x) => x.dataset.cam)), ["1", "2"]);
    await pc.evaluate(() => (window.__oyentesPorCanal["tablero-vivo-camprue2"].estado || []).forEach((cb) => cb({ payload: { v: 1, pgn: "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#", torneo: "11111111-2222-3333-4444-555555555555", ronda: 2, mesa: 1, t: Date.now(), resultado: "1-0" } })));
    await pc.waitForSelector('#p-mesas [data-cam="1"] [data-camara-confirmar]', { timeout: 8000 }).catch(() => {});
    igual("el tablero de la mesa 1 y lo que dice la cámara, escrito", await pc.$eval('#p-mesas [data-cam="1"]', (n) => [n.querySelectorAll('[aria-hidden="true"] > div').length, /La cámara dice: 1-0 \(ganan blancas\)/.test(n.textContent)]).catch((e) => String(e)), [64, true]);
    await pc.click('#p-mesas [data-cam="1"] [data-camara-confirmar]');
    await pc.waitForFunction(() => window.__mandados.some((x) => x[0] === "resultado"), null, { timeout: 5000 }).catch(() => {});
    igual("«Confirmar» manda el resultado como tocarlo a mano", await pc.evaluate(() => (window.__mandados.filter((x) => x[0] === "resultado").pop() || [])[1]), { ronda: 2, mesa: 1, r: "1-0" });
    await pc.evaluate(() => (window.__oyentesPorCanal["tablero-vivo-camprue2"].estado || []).forEach((cb) => cb({ payload: { v: 1, pgn: "1. d4 d5", torneo: "11111111-2222-3333-4444-555555555555", ronda: 2, mesa: 2, t: Date.now(), resultado: "=" } })));
    await pc.waitForSelector('#p-mesas [data-cam="2"] [data-camara-descartar]', { timeout: 8000 }).catch(() => {});
    await pc.click('#p-mesas [data-cam="2"] [data-camara-descartar]').catch(() => {});
    igual("«No es así» esconde la propuesta, y el tablero sigue", !(await pc.$('#p-mesas [data-cam="2"] [data-camara-dice]')) && /En vivo · 2 jugadas/.test(await pc.textContent('#p-mesas [data-cam="2"]')), true);
    await pc.close();

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
