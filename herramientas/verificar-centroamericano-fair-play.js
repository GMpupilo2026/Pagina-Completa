/* La pestaña «Fair Play» de centroamericano-mesas.html: el sorteo de mesas para las revisiones.

   Con un doble de Supabase que se porta como las cuatro funciones de la base
   (supabase/migraciones/20261103162537_centroamericano_fair_play.sql):
   - la pestaña está en la fila de pestañas y abre su panel, con lo que pide FIDE a la vista;
   - la categoría sale solo si tiene árbitros con enlace (y del modo real, no las de ensayo);
   - «Sortear» pregunta antes, manda la ronda que tiene abierta CADA categoría, y las mesas
     salen con «de cuántas» y a quién se revisa si es tablas; nada se avisa todavía;
   - sortear otra vez no repite mesas (la base no deja);
   - «Aprobar» le manda el aviso al árbitro QUE TIENE ESA MESA, y se ve si ya lo leyó;
   - descartar pide motivo (sin motivo no llama a la base) y queda anotado;
   - la revisión «Se negó» sin decir qué pasó la rechaza la base y la página lo dice; «Sin
     novedad» queda revisada con el jugador;
   - el registro baja en PDF con la marca de agua;
   - a 820 px (la tablet) no se desplaza a lo ancho, y en claro y oscuro el texto da 4,5.

   Ver «El sorteo de Fair Play» en docs/decisiones/juegos-y-torneos.md.

       node herramientas/verificar-todo.js centroamericano-fair-play      */
"use strict";
const { chromium } = require("./lib/playwright-con-sesion");
const fs = require("fs");

const BASE = process.env.BASE_URL || "http://localhost:8777";
let fallos = 0;
function igual(nombre, hallado, esperado) {
    const a = JSON.stringify(hallado), b = JSON.stringify(esperado);
    if (a === b) console.log("  ✓ " + nombre);
    else { console.log("  ✗ " + nombre + "\n      esperaba: " + b + "\n      salió:    " + a); fallos++; }
}

// Dos categorías reales (Sub-10 con dos árbitros, ya en la ronda 3; Sub-12 con uno, que solo tiene la 2 leída) y una de ensayo.
const DOBLE = `(function(){
  window.__llamadas = [];
  const R = (data, error) => Promise.resolve({ data, error: error || null });
  const hace = (seg) => new Date(Date.now() - seg * 1000).toISOString();
  const T = {
    centroamericano_torneos: [
      { tnr: "100", nombre: "Sub-10 Absoluto", orden: 1, sid_en_boveda: true, acceso_tnr: "100" },
      { tnr: "200", nombre: "Sub-12 Absoluto", orden: 2, sid_en_boveda: true, acceso_tnr: "200" },
      { tnr: "300", nombre: "Sub-14 Absoluto", orden: 3, sid_en_boveda: true, acceso_tnr: "300" },
      { tnr: "900", nombre: "PRUEBA", orden: 900, sid_en_boveda: true, acceso_tnr: "900", prueba: true }],
    centroamericano_asignaciones: [
      { id: "asig-ana", token: "a".repeat(64), tnr: "100", arbitro: "Ana Árbitra", nombrado: true, mesa_desde: 1, mesa_hasta: 8, vence: "2099-01-01T00:00:00Z", revocada: false, creada: "2026-11-02T10:00:00Z" },
      { id: "asig-beto", token: "b".repeat(64), tnr: "100", arbitro: "Beto Árbitro", nombrado: true, mesa_desde: 9, mesa_hasta: 12, vence: "2099-01-01T00:00:00Z", revocada: false, creada: "2026-11-02T10:01:00Z" },
      { id: "asig-cira", token: "c".repeat(64), tnr: "200", arbitro: "Cira Árbitra", nombrado: true, mesa_desde: 1, mesa_hasta: 6, vence: "2099-01-01T00:00:00Z", revocada: false, creada: "2026-11-02T10:02:00Z" },
      { id: "asig-prueba", token: "e".repeat(64), tnr: "900", arbitro: "Ensayo", nombrado: true, mesa_desde: 1, mesa_hasta: 5, vence: "2099-01-01T00:00:00Z", revocada: false, creada: "2026-11-02T10:03:00Z" }],
    centroamericano_progreso: [
      { asignacion_id: "asig-ana", ronda: 2, total: 8, con_resultado: 8, pendientes: [], actualizado: hace(9000) },
      { asignacion_id: "asig-ana", ronda: 3, total: 8, con_resultado: 2, pendientes: [3, 4, 5, 6, 7, 8], actualizado: hace(20) },
      { asignacion_id: "asig-cira", ronda: 2, total: 6, con_resultado: 1, pendientes: [2, 3, 4, 5, 6], actualizado: hace(20) }],
    centroamericano_avisos: [],
    centroamericano_fair_play: [],
  };
  let n = 0;
  const filas = (tabla) => T[tabla] || [];
  const err = (m) => R(null, { message: m });
  const fp = () => T.centroamericano_fair_play;
  // Lo mismo que hacen las funciones de la base, regla por regla.
  const RPC = {
    tengo_herramienta: (a) => R(a.p_herramienta === "mesa-arbitro"),
    centroamericano_fair_play_sortear: (a) => {
      if (!(a.p_cantidad >= 1 && a.p_cantidad <= 10)) return err("Se sortean de 1 a 10 mesas por categoría");
      const salen = [];
      for (const tnr of a.p_tnrs) {
        const pozo = [...new Set(T.centroamericano_asignaciones.filter((x) => x.tnr === tnr && !x.revocada)
          .flatMap((x) => Array.from({ length: x.mesa_hasta - x.mesa_desde + 1 }, (_, i) => x.mesa_desde + i)))]
          .filter((m) => !fp().some((f) => f.tnr === tnr && f.ronda === a.p_ronda && f.mesa === m));
        const mezcla = pozo.map((m) => [Math.random(), m]).sort((x, y) => x[0] - y[0]).map((x) => x[1]).slice(0, a.p_cantidad);
        for (const m of mezcla) { const f = { id: "fp-" + (++n), creado: new Date().toISOString(), tnr, ronda: a.p_ronda, mesa: m, mesas_en_sorteo: pozo.length,
          color_si_tablas: n % 2 ? "blancas" : "negras", estado: "sorteada", motivo: null, arbitro: null, aviso_id: null, resultado: null, jugador: null, nota: null };
          fp().push(f); salen.push(f); }
      }
      return R(salen); },
    centroamericano_fair_play_aprobar: (a) => {
      const f = fp().find((x) => x.id === a.p_id); if (!f) return err("No existe ese sorteo");
      if (f.estado !== "sorteada") return err("Ese sorteo ya se decidió");
      const as = T.centroamericano_asignaciones.filter((x) => x.tnr === f.tnr && !x.revocada && f.mesa >= x.mesa_desde && f.mesa <= x.mesa_hasta)[0];
      if (!as) return err("La mesa " + f.mesa + " no tiene un árbitro con enlace vigente");
      const av = { id: "av-" + (++n), creado: new Date().toISOString(), de: "organizacion", asignacion_id: as.id, mesa: f.mesa, ronda: f.ronda, leido_en: null,
        texto: "🛡 FAIR PLAY · Ronda " + f.ronda + ", mesa " + f.mesa + ": cuando TERMINE la partida, retén al GANADOR (si es tablas, a quien jugó con " + f.color_si_tablas.toUpperCase() + ")" };
      T.centroamericano_avisos.push(av);
      Object.assign(f, { estado: "aprobada", asignacion_id: as.id, arbitro: as.arbitro, aviso_id: av.id });
      return R(f); },
    centroamericano_fair_play_descartar: (a) => {
      if (!String(a.p_motivo || "").trim()) return err("Para descartar una mesa hace falta el motivo");
      const f = fp().find((x) => x.id === a.p_id && x.estado === "sorteada"); if (!f) return err("Solo se descarta una mesa sorteada que todavía no se aprobó");
      Object.assign(f, { estado: "descartada", motivo: a.p_motivo.trim() }); return R(f); },
    centroamericano_fair_play_revisar: (a) => {
      if (a.p_resultado !== "sin_novedad" && !String(a.p_nota || "").trim()) return err("Con ese resultado hace falta anotar qué pasó");
      const f = fp().find((x) => x.id === a.p_id && (x.estado === "aprobada" || x.estado === "revisada")); if (!f) return err("Solo se anota la revisión de una mesa aprobada");
      Object.assign(f, { estado: "revisada", resultado: a.p_resultado, jugador: (a.p_jugador || "").trim() || null, nota: (a.p_nota || "").trim() || null }); return R(f); },
  };
  window.__leer = (aviso) => { const a = T.centroamericano_avisos.find((x) => x.id === aviso); if (a) a.leido_en = new Date().toISOString(); };
  window.__T = T;
  window.sb = {
    auth: { getSession: () => R({ session: { user: { id: "yo" }, access_token: "x" } }), getUser: () => R({ user: { id: "yo" } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      mfa: { getAuthenticatorAssuranceLevel: () => R({ currentLevel: "aal1", nextLevel: "aal1" }), listFactors: () => R({ all: [], totp: [] }) } },
    rpc: (f, a) => { window.__llamadas.push({ rpc: f, a: JSON.parse(JSON.stringify(a || {})) }); return RPC[f] ? RPC[f](a || {}) : R(null); },
    storage: { from: () => ({ createSignedUrl: () => R({ signedUrl: "" }) }) },
    functions: { invoke: () => R({ ok: true }) },
    from: (tabla) => { const f = {}; let dentro = null;
      const q = { select: () => q, order: () => q, range: () => q, limit: () => q, eq: (c, v) => { f[c] = v; return q; }, in: (c, v) => { dentro = [c, v]; return q; },
        is: () => q, gte: () => q, lte: () => q, not: () => q,
        maybeSingle: () => R(filas(tabla).find((r) => Object.entries(f).every(([c, v]) => r[c] === v)) || null),
        insert: () => q, update: () => q, upsert: () => q, delete: () => q,
        then: (ok, ko) => R(filas(tabla).filter((r) => Object.entries(f).every(([c, v]) => r[c] === v) && (!dentro || dentro[1].includes(r[dentro[0]]))).map((r) => Object.assign({}, r))).then(ok, ko) };
      return q; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
})();`;

async function abrir(browser, { ancho = 820, esquema = "light" } = {}) {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: ancho, height: 900 }, acceptDownloads: true, colorScheme: esquema });
    await ctx.route("**/js/supabase-client.js", (r) => r.fulfill({ contentType: "application/javascript", body: DOBLE }));
    await ctx.route("**/js/vendor/supabase.js", (r) => r.fulfill({ contentType: "application/javascript", body: "" }));
    await ctx.route(/supabase\.co|sentry|googletagmanager|cloudflareinsights/, (r) => r.abort());
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(BASE + "/centroamericano-mesas.html#fairplay", { waitUntil: "load" });
    await p.waitForFunction(() => !document.getElementById("app").hidden);
    return { ctx, p, errores };
}

// El contraste del texto contra el fondo opaco más cercano.
const CONTRASTE = (sel) => {
    const luz = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const rgba = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { c: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
    const fondo = (n) => { for (let x = n; x; x = x.parentElement) { const b = rgba(getComputedStyle(x).backgroundColor); if (b.a >= 0.99) return b.c; } return [255, 255, 255]; };
    return [...document.querySelectorAll(sel)].filter((n) => n.checkVisibility() && n.textContent.trim()).map((n) => {
        const a = luz(rgba(getComputedStyle(n).color).c), b = luz(fondo(n));
        return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100; });
};

(async () => {
    const browser = await chromium.launch();
    try {
        console.log("\n=== La pestaña y lo que pide FIDE ===");
        const { ctx, p, errores } = await abrir(browser);
        await p.waitForFunction(() => document.getElementById("fp-categoria").options.length > 1);
        igual("«Fair Play» está en la fila de pestañas, al lado de «Lo que anotan», y abre su panel (los demás quedan escondidos)", await p.evaluate(() => {
            const pest = [...document.querySelectorAll(".cam-pestana")].map((b) => b.dataset.panel);
            return [pest.slice(-2), document.getElementById("pest-fairplay").getAttribute("aria-selected"), document.getElementById("panel-fairplay").checkVisibility(), document.getElementById("panel-ronda").checkVisibility()]; }),
            [["registro", "fairplay"], "true", true, false]);
        igual("lo que pide FIDE está a la vista al abrirlo: en privado, mismo sexo, testigo, anunciado en las bases, art. 12.9 y el informe", await p.evaluate(() => {
            const d = document.querySelector(".cam-fp-reglas"); d.open = true; const t = d.textContent;
            return [/mismo sexo/.test(t), /testigo/.test(t), /bases/.test(t), /12\.9/.test(t), /informe/.test(t), /11\.3\.3/.test(t)]; }), [true, true, true, true, true, true]);
        igual("las categorías del sorteo son las que tienen árbitros, sin las de ensayo ni las que no tienen enlaces", await p.$$eval("#fp-categoria option", (l) => l.map((o) => o.textContent)),
            ["Todas las categorías (2)", "Sub-10 Absoluto", "Sub-12 Absoluto"]);
        igual("sin sorteos todavía, lo dice y el PDF está apagado", await p.evaluate(() => [document.getElementById("fp-vacio").checkVisibility(), document.getElementById("fp-pdf").disabled]), [true, true]);

        console.log("\n=== Sortear ===");
        await p.selectOption("#fp-cantidad", "2");
        await p.click("#fp-sortear");
        await p.waitForSelector("dialog[open]");
        igual("antes de sortear pregunta, con cuántas mesas, en qué rondas y que todavía no se avisa a nadie", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent;
            return [t.includes("Se van a sortear 2 mesas en 2 categorías"), t.includes("(ronda 3)"), t.includes("no vuelve a salir"), t.includes("Todavía no se avisa a nadie")]; }), [true, true, true, true]);
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelectorAll("#fp-lista tr").length === 4);
        igual("se sortea en la ronda abierta: la 3 en las dos categorías (Sub-12 todavía no abrió la 3, pero comparten calendario; la 2 ya pasó)", await p.evaluate(() => window.__llamadas.filter((l) => l.rpc === "centroamericano_fair_play_sortear").map((l) => [l.a.p_ronda, l.a.p_tnrs, l.a.p_cantidad])),
            [[3, ["100", "200"], 2]]);
        const filasFp = () => p.$$eval("#fp-lista tr", (l) => l.map((tr) => [tr.children[0].textContent, tr.children[1].textContent, tr.children[2].textContent, tr.children[3].textContent, tr.dataset.estado]));
        const f1 = await filasFp();
        igual("salen 2 mesas por categoría, cada una «de cuántas» (12 en Sub-10, 6 en Sub-12) y a quién se revisa si es tablas", [
            f1.filter((f) => f[0] === "Sub-10 Absoluto" && f[1] === "3" && /^Mesa (\d+) \(de 12\)$/.test(f[2])).length,
            f1.filter((f) => f[0] === "Sub-12 Absoluto" && f[1] === "3" && /^Mesa (\d+) \(de 6\)$/.test(f[2])).length,
            f1.every((f) => /^Ganador · si es tablas: (Blancas|Negras)$/.test(f[3]) && f[4] === "sorteada")], [2, 2, true]);
        igual("sortear NO avisa a nadie todavía: no hay ningún aviso a los árbitros", await p.evaluate(() => window.__T.centroamericano_avisos.length), 0);
        igual("el resumen cuenta lo que falta decidir", await p.textContent("#fp-resumen"), " — 4 mesas sorteadas · 4 por decidir · 0 por revisar");

        // Otra vez en Sub-12 con 5: quedan solo 4 mesas sin sortear, y no se repite ninguna.
        await p.selectOption("#fp-categoria", "200");
        await p.selectOption("#fp-cantidad", "5");
        await p.click("#fp-sortear"); await p.waitForSelector("dialog[open]"); await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelectorAll("#fp-lista tr").length === 8);
        igual("sortear otra vez no repite mesas: Sub-12 tiene sus 6 mesas, cada una una sola vez, y la segunda vez sale «de 4»", await p.evaluate(() => {
            const m = window.__T.centroamericano_fair_play.filter((f) => f.tnr === "200").map((f) => f.mesa).sort((a, b) => a - b);
            return [m, window.__T.centroamericano_fair_play.filter((f) => f.tnr === "200" && f.mesas_en_sorteo === 4).length]; }), [[1, 2, 3, 4, 5, 6], 4]);
        await p.click("#fp-sortear"); await p.waitForSelector("dialog[open]"); await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => /No quedaba ninguna mesa/.test(document.body.textContent));
        igual("con todas las mesas ya sorteadas, lo dice en vez de quedarse callado", true, true);

        console.log("\n=== Aprobar, descartar y revisar ===");
        // Una mesa de Sub-10 del rango de Beto (9 a 12): se asegura sorteándola a mano en el doble.
        await p.evaluate(() => { const L = window.__T.centroamericano_fair_play; const k = L.findIndex((f) => f.tnr === "100" && f.mesa === 11); if (k >= 0) L.splice(k, 1); L.push({ id: "fp-beto", creado: new Date().toISOString(), tnr: "100", ronda: 3, mesa: 11, mesas_en_sorteo: 12, color_si_tablas: "negras", estado: "sorteada" }); });
        await p.click("#fp-actualizar");
        await p.waitForSelector('#fp-lista tr[data-id="fp-beto"]');
        await p.click('#fp-lista tr[data-id="fp-beto"] [data-accion="aprobar"]');
        await p.waitForSelector("dialog[open]");
        igual("aprobar dice qué le va a llegar al árbitro: retener al ganador (o a negras si es tablas) y no dejarlo salir", await p.evaluate(() => { const t = document.querySelector("dialog[open]").textContent; return [t.includes("mesa 11 de Sub-10 Absoluto"), t.includes("retenga al ganador"), t.includes("negras"), t.includes("no lo deje salir")]; }), [true, true, true, true]);
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelector('#fp-lista tr[data-id="fp-beto"]').dataset.estado === "aprobada");
        igual("el aviso le llega al árbitro QUE TIENE ESA MESA (Beto, mesas 9 a 12; no Ana), con la ronda y la mesa", await p.evaluate(() => window.__T.centroamericano_avisos.map((a) => [a.asignacion_id, a.mesa, a.ronda, a.texto.startsWith("🛡 FAIR PLAY · Ronda 3, mesa 11")])), [["asig-beto", 11, 3, true]]);
        igual("la fila dice que está aprobada y que Beto todavía no lo ha leído", await p.$eval('#fp-lista tr[data-id="fp-beto"]', (tr) => tr.children[4].textContent), "Aprobada: avisado su árbitro⏳ Beto Árbitro todavía no lo ha leído");
        await p.evaluate(() => window.__leer(window.__T.centroamericano_fair_play.find((f) => f.id === "fp-beto").aviso_id));
        await p.click("#fp-actualizar");
        await p.waitForFunction(() => /lo leyó a las/.test(document.querySelector('#fp-lista tr[data-id="fp-beto"]').textContent));
        igual("cuando Beto toca «Entendido», la fila dice que lo leyó y a qué hora", /✓ Beto Árbitro lo leyó a las \d{1,2}:\d\d/.test(await p.$eval('#fp-lista tr[data-id="fp-beto"]', (tr) => tr.children[4].textContent)), true);

        // Descartar sin motivo: no se manda; con motivo, queda.
        const otra = await p.evaluate(() => window.__T.centroamericano_fair_play.find((f) => f.estado === "sorteada").id);
        await p.click('#fp-lista tr[data-id="' + otra + '"] [data-accion="descartar"]');
        await p.waitForSelector("dialog[open] input, dialog[open] textarea");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForTimeout(300);
        igual("descartar sin motivo no llega a la base y lo dice", await p.evaluate(() => [window.__llamadas.filter((l) => l.rpc === "centroamericano_fair_play_descartar").length, /hace falta el motivo/.test(document.body.textContent)]), [0, true]);
        await p.click('#fp-lista tr[data-id="' + otra + '"] [data-accion="descartar"]');
        await p.waitForSelector("dialog[open] input, dialog[open] textarea");
        await p.fill("dialog[open] input, dialog[open] textarea", "La partida ya había terminado");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction((id) => document.querySelector('#fp-lista tr[data-id="' + id + '"]').dataset.estado === "descartada", otra);
        igual("con motivo queda descartada y el motivo se ve", await p.$eval('#fp-lista tr[data-id="' + otra + '"]', (tr) => tr.children[4].textContent), "DescartadaMotivo: La partida ya había terminado");

        // Revisión: «Se negó» sin decir qué pasó lo rechaza la base; «Sin novedad» queda.
        await p.click('#fp-lista tr[data-id="fp-beto"] [data-accion="revisar"]');
        await p.waitForSelector("dialog[open] select");
        await p.selectOption("dialog[open] select", "se_nego");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => /hace falta anotar qué pasó/.test(document.body.textContent));
        igual("«Se negó» sin decir qué pasó: la base lo rechaza, la página lo dice y la mesa sigue aprobada", await p.$eval('#fp-lista tr[data-id="fp-beto"]', (tr) => tr.dataset.estado), "aprobada");
        await p.click('#fp-lista tr[data-id="fp-beto"] [data-accion="revisar"]');
        await p.waitForSelector("dialog[open] select");
        await p.selectOption("dialog[open] select", "sin_novedad");
        await p.fill('dialog[open] input[type="text"], dialog[open] input:not([type])', "Lía Pérez");
        await p.click("dialog[open] [data-avisos-aceptar]");
        await p.waitForFunction(() => document.querySelector('#fp-lista tr[data-id="fp-beto"]').dataset.estado === "revisada");
        igual("«Sin novedad» queda revisada, con el jugador, y el botón pasa a «Corregir la revisión»", await p.$eval('#fp-lista tr[data-id="fp-beto"]', (tr) => [tr.children[4].textContent, tr.querySelector('[data-accion="revisar"]').textContent]), ["RevisadaSin novedad · Lía Pérez", "Corregir la revisión"]);

        console.log("\n=== El registro en PDF, la tablet y el contraste ===");
        const [bajada] = await Promise.all([p.waitForEvent("download"), p.click("#fp-pdf")]);
        const bytes = fs.readFileSync(await bajada.path()).toString("latin1");
        igual("«Bajar el registro en PDF» baja el registro de Fair Play con la marca de agua", [bajada.suggestedFilename(), bytes.startsWith("%PDF"), /\/SMask \d+ 0 R/.test(bytes)], ["fair-play-centroamericano-2026.pdf", true, true]);
        igual("a 820 px (la tablet) la página no se desplaza a lo ancho", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        const claro = await p.evaluate(CONTRASTE, "#panel-fairplay td, #panel-fairplay td span, #panel-fairplay .cam-chip, #panel-fairplay p, #panel-fairplay li, #panel-fairplay summary");
        igual("en claro, todo el texto del panel da 4,5 o más (también los estados)", claro.filter((x) => x < 4.5), []);
        igual("y no hubo errores en la página", errores, []);
        await ctx.close();

        const o = await abrir(browser, { esquema: "dark" });
        await o.p.evaluate(() => { window.__T.centroamericano_fair_play.push(
            { id: "x1", creado: new Date().toISOString(), tnr: "100", ronda: 3, mesa: 1, mesas_en_sorteo: 12, color_si_tablas: "blancas", estado: "sorteada" },
            { id: "x2", creado: new Date().toISOString(), tnr: "100", ronda: 3, mesa: 2, mesas_en_sorteo: 12, color_si_tablas: "negras", estado: "descartada", motivo: "Ya terminó" },
            { id: "x3", creado: new Date().toISOString(), tnr: "100", ronda: 3, mesa: 3, mesas_en_sorteo: 12, color_si_tablas: "negras", estado: "revisada", resultado: "sin_novedad", arbitro: "Ana Árbitra" },
            { id: "x4", creado: new Date().toISOString(), tnr: "100", ronda: 3, mesa: 4, mesas_en_sorteo: 12, color_si_tablas: "negras", estado: "aprobada", arbitro: "Ana Árbitra" }); });
        await o.p.click("#fp-actualizar");
        await o.p.waitForFunction(() => document.querySelectorAll("#fp-lista tr").length === 4);
        await o.p.evaluate(() => { document.querySelector(".cam-fp-reglas").open = true; });
        const oscuro = await o.p.evaluate(CONTRASTE, "#panel-fairplay td, #panel-fairplay td span, #panel-fairplay .cam-chip, #panel-fairplay p, #panel-fairplay li, #panel-fairplay summary");
        igual("en oscuro, todo el texto del panel da 4,5 o más (los cuatro estados)", oscuro.filter((x) => x < 4.5), []);
        await o.ctx.close();
    } finally {
        await browser.close();
    }
    console.log(fallos ? "\n" + fallos + " fallo(s)." : "\nTodo bien.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
